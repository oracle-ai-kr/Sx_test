// ════════════════════════════════════════════════════════════
//  SIGNAL X — 예측 원장 (sx_ledger.js)
//  버전: v1 · [S1135]
//
//  역할:
//    분포 보드/MAE 카드가 지금 화면에 띄우는 예측을 "질의일 기준"으로 박아두고,
//    지평 도달 후 실제값으로 채점한다.
//
//  ★왜 필요한가 (PREREG_S1125 §5):
//    현재 카드 숫자는 전부 in-sample(스냅 0701 기준)이다. 원장은 질의일이 항상 스냅
//    이후라서 **쌓이는 순간 구조적 표본외**다. 지금 유일한 OOS 검증 경로.
//
//  ★저장 = IndexedDB (localStorage 금지 · §5)
//    정적 키 47개 + 시장별 동적 키(SX_TREND_/SX_STRAT_/SX_XMAT_/SX_CELLBK_) + 캐시가
//    오리진당 5MB를 공유한다. 레코드 60B × 20종목×4질문/일 ≈ 1.7MB/년, 100종목이면
//    1년 내 QuotaExceeded — 그때 **기존 설정까지 같이 죽는다**. 폴백 두지 않는다.
//
//  ★불변식 (사후합리화의 기계적 차단 · §5)
//    1. put()  — 같은 key가 이미 있으면 **거부**. 예측은 덮어쓸 수 없다.
//    2. score() — 저장된 rec에서 pred/naive를 읽어 쓰고, 호출자가 준 값은 무시한다.
//                 actual/hit/nhit/hhit/err만 **추가**된다.
//    3. setHuman() — human이 이미 있으면 거부(§10 즉시 잠금·수정 불가).
//
//  사용처: sx_render.js 카드(분석탭 한 줄) · sx_screener.html 조건검색탭(원장 전체)
// ════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  //  0. 상수
  // ─────────────────────────────────────────────────────────
  var DB_NAME = 'sx_pred_ledger';
  var DB_VER = 1;
  var STORE = 'preds';
  var STORE_AGG = 'agg';
  var CAP_PER_Q = 5000;          // §5 회전 상한 — 질문별 최근 5000건
  var VER = 'S1135';             // 카드/원장 버전 스탬프
  //  [S1145] 기준봉 규칙이 바뀐 빌드. 이보다 오래된 레코드는 **계산 봉과 기록 봉이 갈려 있어**
  //    채점해도 무의미하다. 가드를 호출부가 아니라 여기 두는 이유: 자동 채점(S1144)은 앱 시작 시
  //    조용히 돌기 때문에, 사용자가 폐기 버튼을 누를 틈도 없이 잘못 채점될 수 있다.
  //    채점은 멱등(st=1 고정)이라 한 번 박히면 되돌릴 수 없다 — 들어오는 길목을 다 막아야 한다.
  var BASE_RULE_VER = 'S1139';

  // ─────────────────────────────────────────────────────────
  //  1. 질문 정의 (동결)
  //
  //  ⚠ §5 동결본은 q(1|2|3) · kNN 기준이었다. 아크 결론(s1125_result.md)에서
  //    Q3 지지·저항 = 기각(선형확률모델도 실패) · kNN = 4질문 4패로 은퇴 ·
  //    Q4/Q5 = 채택. 그래서 원장 질문은 **화면에 올라간 축**과 일치시킨다.
  //    q3은 결번으로 남긴다 — 기각 사실이 번호에도 남게.
  // ─────────────────────────────────────────────────────────
  var Q = {
    1: { key: 'vol',   name: '변동 확대', hs: [5],       unit: '%',
         ask: '5거래일 뒤 밴드폭이 지금보다 넓어질까?',
         askHistory: [{ until: 'S1154', ask: '5봉 뒤 밴드폭이 지금보다 넓어질까?' }],
         src: '분포 보드 · 합성 회귀(폭 수준 + 폭 관성)' },
    2: { key: 'slope', name: 'MA5 꺾임',  hs: [5],       unit: '%',
         // ★'뒤집힐까'만 있으면 **무엇 대비인지**가 문장에 없어 매번 되짚어야 했다. 기준을 문장 안으로.
         ask: '5거래일 뒤 MA5 기울기가 지금과 반대 방향일까?',
         askHistory: [{ until: 'S1154', ask: '5봉 뒤 MA5 기울기 부호가 뒤집힐까?' }],
         src: '분포 보드 · 되돌림 Δ=−s0' },
    4: { key: 'spell', name: '잔존 봉수', hs: [0],       unit: '봉',
         ask: '다음 데드크로스까지 평소보다 오래 갈까?',   // 사건형이라 지평이 없다 — '5거래일' 통일 대상 아님
         src: '분포 보드 · 이격 갭 단독' },
    5: { key: 'mae',   name: '최대 손실', hs: [3, 5, 10], unit: '%',
         // [S1154] 'H봉' → '5봉'. H는 코드 기호일 뿐 사용자가 알 이유가 없고, 다른 문항은 전부
         //   '5봉 뒤'라 여기만 튀었다. 사람에게 묻는 건 H5뿐이므로(_predAskable) 문구를 5봉으로 고정한다.
         //   ★문구 변경 이력을 남긴다 — 나중에 답이 갈릴 때 문구 차이인지 판단 차이인지 구분해야 한다.
         ask: '5거래일 안에 최저가가 평소보다 깊을까?',
         askHistory: [{ until: 'S1153', ask: 'H봉 안에서 평소보다 깊게 빠질까?' },
                      { until: 'S1154', ask: '5봉 안에서 평소보다 깊게 빠질까?' }],
         src: 'MAE 카드 · 0.44·ATR%·√H' }
  };

  // ─────────────────────────────────────────────────────────
  //  2. 이진화 — 사전 동결 (§10)
  //
  //  사람은 yes/no인데 라벨은 전부 연속이다. 채점 기준을 **미리** 박는다.
  //  사후에 정하면 사람에게 유리하게 조정할 여지가 생긴다(§10 명시).
  //
  //  ★q4·q5는 "나이브 초과"로 잡는다 (사용자 승인 '모델 예측치 초과'에서 변경)
  //    모델초과(actual > pred)로 잡으면 모델은 중앙 추정치라 정의상 ~50%가 되어
  //    **모델과 나이브를 채점할 수 없다**. 그런데 원장의 1차 목적이 "나이브 대비
  //    이득의 실시간 채점"(§5)이므로, 그 목적이 통째로 죽는다.
  //    나이브 초과로 잡으면 셋 다 같은 사건에 콜을 낸다:
  //      · 모델 = pred가 나이브를 넘는가 (= "평소보다 깊다/길다"는 실제 주장)
  //      · 나이브 = 정의상 no (중앙값이 자기를 넘을 수 없다) → 50% 동전. 정직한 기저선.
  //      · 사람 = yes/no
  //    되돌리려면 _BIN[4]/_BIN[5]·_MBIN[4]/_MBIN[5] 한 줄씩.
  // ─────────────────────────────────────────────────────────

  // 실제 사건이 일어났나 (actual 기준 정답)
  var _BIN = {
    1: function (r, a) { return a > 0; },                                   // 폭 확대 > 0
    2: function (r, a) { return _sign(a) !== _sign(_ctxNum(r, 's0')); },    // 부호 전환
    4: function (r, a) { return a > r.naive; },                             // 나이브(중앙 잔존봉수) 초과
    5: function (r, a) { return a > r.naive; }                              // 나이브(과거 평균 MAE) 초과
  };

  // 모델은 뭐라고 했나
  var _MBIN = {
    1: function (r) { return r.pred > 0; },
    2: function (r) { return _sign(r.pred) !== _sign(_ctxNum(r, 's0')); },
    4: function (r) { return r.pred > r.naive; },
    5: function (r) { return r.pred > r.naive; }
  };

  // 나이브는 뭐라고 했나
  //   q1·q2 = 기저율(%)이므로 50 이상이면 "일어난다" 쪽.
  //   q4·q5 = 나이브가 곧 임계라 정의상 false. 기대 적중 50%가 정상이며 이게 기저선이다.
  var _NBIN = {
    1: function (r) { return r.naive >= 50; },
    2: function (r) { return r.naive >= 50; },
    4: function () { return false; },
    5: function () { return false; }
  };

  function _sign(v) { var n = +v; return n > 0 ? 1 : (n < 0 ? -1 : 0); }
  function _ctxNum(r, k) {
    try { return (r && r.ctx && r.ctx[k] != null) ? +r.ctx[k] : 0; } catch (_) { return 0; }
  }

  // ─────────────────────────────────────────────────────────
  //  3. DB 열기
  // ─────────────────────────────────────────────────────────
  var _db = null, _opening = null, _dead = null;

  function ready() {
    if (_dead) return Promise.reject(new Error(_dead));
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;

    _opening = new Promise(function (resolve, reject) {
      var idb = null;
      try { idb = global.indexedDB || global.mozIndexedDB || global.webkitIndexedDB; } catch (_) { idb = null; }
      if (!idb) {
        _dead = 'IndexedDB 사용 불가 — 원장 비활성(시크릿 모드/저장소 차단 가능). localStorage 폴백은 두지 않는다(§5).';
        reject(new Error(_dead)); return;
      }
      var req;
      try { req = idb.open(DB_NAME, DB_VER); }
      catch (e) { _dead = 'IndexedDB open 실패: ' + (e && e.message); reject(new Error(_dead)); return; }

      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'key' });
          os.createIndex('q', 'q', { unique: false });
          os.createIndex('mkt', 'mkt', { unique: false });
          os.createIndex('date', 'date', { unique: false });
          os.createIndex('st', 'st', { unique: false });          // 0=대기 1=채점완료
          os.createIndex('st_due', ['st', 'dueEst'], { unique: false });
          os.createIndex('q_date', ['q', 'date'], { unique: false });
          os.createIndex('code', 'code', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_AGG)) {
          db.createObjectStore(STORE_AGG, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        try { requestPersist(); } catch (_) {}   // [S1138] DB 확보 직후 1회 — 자동 퇴거 방어

        _db.onversionchange = function () { try { _db.close(); } catch (_) {} _db = null; };
        resolve(_db);
      };
      req.onerror = function () {
        _dead = 'IndexedDB 열기 거부: ' + (req.error && req.error.message);
        reject(new Error(_dead));
      };
    });
    return _opening;
  }

  function _tx(stores, mode) {
    return ready().then(function (db) {
      var t = db.transaction(stores, mode);
      return { t: t, s: (typeof stores === 'string') ? t.objectStore(stores) : null };
    });
  }
  function _wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('IDB 요청 실패')); };
    });
  }

  // ─────────────────────────────────────────────────────────
  //  3b. 저장 내구성 — 자동 퇴거 방어 [S1138]
  //
  //  ★안드로이드 저장공간이 부족하면 브라우저가 **예고 없이** origin 데이터를 통째로 지운다.
  //    원장은 유일한 표본외 검증 경로라 조용히 증발하면 대체 경로가 없다(카드 숫자는 전부 in-sample).
  //  ⚠persist()가 막는 건 **자동 퇴거뿐**이다. 사용자가 직접 지우는 경로는 그대로 열려 있다:
  //    Chrome 인터넷 사용 기록 삭제(쿠키 및 사이트 데이터) · 사이트 설정 데이터 삭제 · 앱 데이터 삭제/재설치.
  //    → 내구성의 나머지는 **내보내기**(dump)로 사용자가 직접 떠야 한다.
  // ─────────────────────────────────────────────────────────
  var _persist = null;   // null=미시도 · {ok,already,why}

  function requestPersist() {
    if (_persist) return Promise.resolve(_persist);
    try {
      var st = global.navigator && global.navigator.storage;
      if (!st || !st.persist || !st.persisted) { _persist = { ok: false, why: '브라우저 미지원' }; return Promise.resolve(_persist); }
      return st.persisted().then(function (already) {
        if (already) { _persist = { ok: true, already: true }; return _persist; }
        return st.persist().then(function (granted) {
          _persist = { ok: !!granted, already: false, why: granted ? null : '브라우저가 거부(사이트 사용량이 쌓이면 재시도 시 승인될 수 있음)' };
          return _persist;
        });
      }).catch(function (e) { _persist = { ok: false, why: String((e && e.message) || e) }; return _persist; });
    } catch (e) { _persist = { ok: false, why: String((e && e.message) || e) }; return Promise.resolve(_persist); }
  }
  function persistState() { return _persist; }

  function estimate() {   // 사용량 진단 — 원장이 얼마나 차지하는지
    try {
      var st = global.navigator && global.navigator.storage;
      if (!st || !st.estimate) return Promise.resolve(null);
      return st.estimate().catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }

  // ─────────────────────────────────────────────────────────
  //  4. 키 · 날짜
  // ─────────────────────────────────────────────────────────
  function key(mkt, code, date, q, H) {
    return String(mkt) + ':' + String(code) + ':' + _d10(date) + ':' + String(q) + ':' + String(H == null ? 0 : H);
  }
  function _d10(d) {
    var s = String(d || '').slice(0, 10);
    if (/^\d{8}$/.test(s)) s = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return s;
  }
  function _todayKst() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function _addDays(d10, n) {
    var t = Date.parse(d10 + 'T00:00:00Z');
    if (isNaN(t)) return d10;
    return new Date(t + n * 86400000).toISOString().slice(0, 10);
  }

  // 예상 채점 가능일 (§10 — 배지 카운트용 근사값. "대기 추정"으로 표기할 것)
  //   coin  = 매일 봉이 생긴다 → H일
  //   kr/us = 주 5거래일 → ceil(H×7/5) + 1일 여유(공휴일)
  //   q4    = 지평이 없다(사건형). 모델이 예측한 잔존봉수를 지평 대신 쓴다.
  function dueEst(mkt, date, q, H, pred) {
    var bars = (+q === 4) ? Math.max(1, Math.round(+pred || 0)) : Math.max(1, +H || 1);
    var d = _d10(date);
    if (String(mkt) === 'coin') return _addDays(d, bars);
    return _addDays(d, Math.ceil(bars * 7 / 5) + 1);
  }

  // ─────────────────────────────────────────────────────────
  //  5. 쓰기 — put (신규 전용)
  // ─────────────────────────────────────────────────────────
  //  rec 필수: mkt, code, date, q, H, pred, naive
  //  rec 선택: conf(없으면 null) · aligned · ctx · intraday · human
  //
  //  ⚠ kNN 은퇴로 k/pool 필드는 삭제됐다. conf(이웃 동의율)도 공식 예측자엔 없어서
  //    null 허용. aligned는 살려서 **"측정 조건 안/밖"**으로 재정의:
  //      q2 = 이격 상위20% 조건 안인가(_dbSlope.inCond)
  //      q5 = 측정 상단 초과(외삽)인가의 반대 = 조건 안인가(_MAE_TOPQ 판정)
  //      q1 = 표본 충분한가
  //    aligned=false 레코드는 "카드가 스스로 조건 밖이라 말한 예측"이라 집계에서
  //    분리해 볼 수 있어야 한다.
  function put(rec) {
    var e = _validate(rec);
    if (e) return Promise.reject(new Error('원장 거부: ' + e));

    var k = key(rec.mkt, rec.code, rec.date, rec.q, rec.H);
    var row = {
      key: k,
      mkt: String(rec.mkt),
      code: String(rec.code),
      date: _d10(rec.date),
      q: +rec.q,
      H: (rec.H == null ? 0 : +rec.H),
      pred: +rec.pred,
      naive: +rec.naive,
      conf: (rec.conf == null ? null : +rec.conf),
      aligned: (rec.aligned == null ? null : !!rec.aligned),
      ctx: rec.ctx || null,
      ver: rec.ver || VER,
      human: (rec.human === 'yes' || rec.human === 'no' || rec.human === 'pass') ? rec.human : null,
      intraday: !!rec.intraday,
      dueEst: dueEst(rec.mkt, rec.date, rec.q, rec.H, rec.pred),
      st: 0,
      ts: Date.now()
    };

    return _tx(STORE, 'readwrite').then(function (o) {
      // add()는 키 중복이면 ConstraintError로 터진다 = 덮어쓰기 불가가 엔진 레벨에서 보장.
      return _wrap(o.s.add(row)).then(function () { return row; })
        .catch(function (err) {
          if (err && err.name === 'ConstraintError') {
            throw new Error('이미 기록된 슬롯이다(수정 불가) — ' + k);
          }
          throw err;
        });
    });
  }

  function _validate(r) {
    if (!r) return 'rec 없음';
    if (!r.mkt || !r.code) return 'mkt/code 없음';
    if (!_d10(r.date)) return 'date 없음';
    if (!Q[+r.q]) return '알 수 없는 질문 q=' + r.q + ' (허용: ' + Object.keys(Q).join('/') + ')';
    if (r.pred == null || isNaN(+r.pred)) return 'pred 없음';
    if (r.naive == null || isNaN(+r.naive)) return 'naive 없음 — 나이브 병기는 강제다(§6)';
    var hs = Q[+r.q].hs, h = (r.H == null ? 0 : +r.H);
    if (hs.indexOf(h) < 0) return 'q' + r.q + '의 지평은 ' + hs.join('/') + '만 허용 (받음: ' + h + ')';
    return null;
  }

  // ─────────────────────────────────────────────────────────
  //  6. 사람 예측 — setHuman (1회 · 즉시 잠금 · §10)
  // ─────────────────────────────────────────────────────────
  //  2단 확정(선택 → 확인 버튼)은 UI 책임. 여기는 **쓰기 1회 보장**만 담당한다.
  //  pass도 기록한다 — "사람이 판단 불가라고 느낀 장면" 부분집합이 그 자체로 질문거리(§10).
  function setHuman(k, human) {
    if (['yes', 'no', 'pass'].indexOf(human) < 0) {
      return Promise.reject(new Error("human은 'yes'|'no'|'pass'만 허용"));
    }
    return _tx(STORE, 'readwrite').then(function (o) {
      return _wrap(o.s.get(k)).then(function (cur) {
        if (!cur) throw new Error('없는 슬롯: ' + k);
        if (cur.human != null) throw new Error('이미 잠긴 예측이다(수정 불가) — ' + cur.human);
        cur.human = human;
        cur.humanTs = Date.now();
        return _wrap(o.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  7. 채점 — score (추가만 · pred/naive 수정 금지)
  // ─────────────────────────────────────────────────────────
  //  저장된 레코드에서 pred/naive/ctx를 읽어서 판정한다. 호출자는 actual만 준다.
  //  = 사후에 pred를 유리하게 고쳐 넣을 경로가 **구조적으로 없다**.
  //  post = 채점 시점에 캔들에서 새로 재는 부가값(c0Final·s0Final 등). pred/naive는 손대지 않는다.
  //  [S1143] 왜 필요한가: 장중에 찍으면 ctx.s0가 **미완성 봉의 기울기**라 최종 캔들 어디에도 없다.
  //    q2 정답 판정이 그 값에 묶여 있어서, 나중에 캔들만으로 재현이 불가능해진다.
  //    채점 때 최종값을 같이 남겨야 "얼마나 갈렸나"를 물을 수 있다(알갱이 원칙).
  function score(k, actual, post) {
    if (actual == null || isNaN(+actual)) return Promise.reject(new Error('actual 없음'));
    return _tx(STORE, 'readwrite').then(function (o) {
      return _wrap(o.s.get(k)).then(function (cur) {
        if (!cur) throw new Error('없는 슬롯: ' + k);
        if (cur.st === 1) return cur;               // 이미 채점됨 — 멱등
        if (String(cur.ver || '') < BASE_RULE_VER) {
          throw new Error('구버전 기준봉(' + (cur.ver || '?') + ') — 채점 불가, 폐기 대상');
        }
        var a = +actual, q = cur.q;

        var truth = !!_BIN[q](cur, a);
        var mcall = !!_MBIN[q](cur);
        var ncall = !!_NBIN[q](cur);

        cur.actual = a;
        cur.truth = truth;
        cur.hit = (mcall === truth);                                  // 모델 적중
        cur.nhit = (ncall === truth);                                 // 나이브 적중
        cur.hhit = (cur.human === 'yes' || cur.human === 'no')
          ? ((cur.human === 'yes') === truth) : null;                 // pass는 채점 제외(기록은 유지)
        cur.err = Math.abs(a - cur.pred);
        cur.nerr = Math.abs(a - cur.naive);
        cur.st = 1;
        cur.scoredAt = Date.now();
        if (post && typeof post === 'object') {
          cur.post = post;
          // 기준봉이 픽 당시 이미 확정이었나 — 시계가 아니라 **값 일치**로 판정한다.
          // [S1152] 앵커를 여러 개 둔다. c0(기준봉 종가)는 S1143부터라, 그 이전 레코드는
          //   c0가 없어 영영 판정 불가였다. 그런데 ctx에 이미 기준봉에서 뽑은 값이 들어 있다 —
          //   q2는 s0(기울기), q1은 wNow(밴드폭). 이걸 채점 때 다시 재서 비교하면 같은 판정이 된다.
          //   ★기존 레코드를 고치지 않고도 소급 적용된다(값은 이미 저장돼 있었다).
          var _anchors = [['c0','c0Final'], ['s0','s0Final'], ['wNow','wNowFinal']];
          for (var ai = 0; ai < _anchors.length; ai++) {
            var was = cur.ctx ? cur.ctx[_anchors[ai][0]] : null, now = post[_anchors[ai][1]];
            if (was == null || now == null) continue;
            cur.formed = (Math.abs(now - was) / Math.max(1e-9, Math.abs(now))) < 1e-9;
            cur.formedBy = _anchors[ai][0];    // 무엇으로 판정했는지 남긴다
            break;
          }
        }
        return _wrap(o.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  7b. 폐기 [S1139] — 지우지 않고 표시만 더한다
  // ─────────────────────────────────────────────────────────
  //  기준봉 규칙이 바뀌는 등으로 **기록 자체가 무효**가 된 건을 처리한다.
  //  pred/naive/human은 그대로 두고 void 표시만 추가 = 추가만 원칙 유지.
  //  "왜 폐기됐는지"가 남아야 나중에 표본이 갑자기 준 이유를 설명할 수 있다.
  function voidRec(k, why) {
    return _tx(STORE, 'readwrite').then(function (o) {
      return _wrap(o.s.get(k)).then(function (cur) {
        if (!cur) throw new Error('없는 슬롯: ' + k);
        if (cur.void) return cur;
        cur.void = true;
        cur.voidWhy = String(why || '사유 미기재');
        cur.voidAt = Date.now();
        return _wrap(o.s.put(cur)).then(function () { return cur; });
      });
    });
  }
  //  빌드 단위 일괄 폐기 — ver가 cutoff보다 오래된 레코드 전부.
  function voidOlderThan(cutoffVer, why) {
    return list({ includeVoid: true }).then(function (all) {
      var targets = all.filter(function (r) { return !r.void && String(r.ver || '') < String(cutoffVer); });
      var chain = Promise.resolve(), n = 0;
      targets.forEach(function (r) { chain = chain.then(function () { return voidRec(r.key, why).then(function () { n++; }); }); });
      return chain.then(function () { return { voided: n }; });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  8. 읽기
  // ─────────────────────────────────────────────────────────
  function get(k) {
    return _tx(STORE, 'readonly').then(function (o) { return _wrap(o.s.get(k)); });
  }

  //  opt: { mkt, code, q, st(0|1), human, dueBy, limit, order:'due'|'date' }
  function list(opt) {
    opt = opt || {};
    return _tx(STORE, 'readonly').then(function (o) {
      return _wrap(o.s.getAll()).then(function (all) {
        var out = (all || []).filter(function (r) {
          if (r.void && !opt.includeVoid) return false;   // [S1139] 폐기분은 기본 제외
          if (opt.mkt && r.mkt !== opt.mkt) return false;
          if (opt.code && r.code !== opt.code) return false;
          if (opt.q != null && r.q !== +opt.q) return false;
          if (opt.st != null && r.st !== +opt.st) return false;
          if (opt.human && r.human !== opt.human) return false;
          if (opt.dueBy && !(r.dueEst && r.dueEst <= opt.dueBy)) return false;
          return true;
        });
        var ord = opt.order || 'due';
        out.sort(function (a, b) {
          if (ord === 'date') return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
          return (a.dueEst < b.dueEst ? -1 : a.dueEst > b.dueEst ? 1 : 0);   // 채점 임박순(§10)
        });
        return opt.limit ? out.slice(0, opt.limit) : out;
      });
    });
  }

  //  배지용 — dueEst ≤ 오늘인 미채점 건수. **"대기 추정"으로 표기할 것**(§10):
  //  실제 지평 도달은 일괄 채점의 fetch로 확정된다.
  function dueCount(today) {
    var t = today || _todayKst();
    return list({ st: 0, dueBy: t }).then(function (a) { return a.length; });
  }

  //  집계 — 모델/나이브/사람 적중을 나란히. 이게 원장의 결론이다.
  function stats(opt) {
    return list(Object.assign({}, opt || {}, { st: 1 })).then(function (rows) {
      var acc = {};
      rows.forEach(function (r) {
        var g = acc[r.q] || (acc[r.q] = {
          q: +r.q, name: Q[r.q] ? Q[r.q].name : ('q' + r.q),
          n: 0, hit: 0, nhit: 0, hn: 0, hhit: 0, pass: 0,
          sumErr: 0, sumNerr: 0, alignedN: 0, alignedHit: 0, intraN: 0
        });
        g.n++;
        if (r.hit) g.hit++;
        if (r.nhit) g.nhit++;
        g.sumErr += (r.err || 0); g.sumNerr += (r.nerr || 0);
        if (r.human === 'pass') g.pass++;
        if (r.hhit != null) { g.hn++; if (r.hhit) g.hhit++; }
        if (r.aligned === true) { g.alignedN++; if (r.hit) g.alignedHit++; }
        if (r.intraday) g.intraN++;
      });
      return Object.keys(acc).map(function (k2) {
        var g = acc[k2];
        g.hitPct = g.n ? g.hit / g.n * 100 : null;
        g.nhitPct = g.n ? g.nhit / g.n * 100 : null;
        g.edge = (g.hitPct != null && g.nhitPct != null) ? (g.hitPct - g.nhitPct) : null; // 나이브 대비 이득
        g.hhitPct = g.hn ? g.hhit / g.hn * 100 : null;
        g.mae = g.n ? g.sumErr / g.n : null;
        g.nmae = g.n ? g.sumNerr / g.n : null;
        g.alignedPct = g.alignedN ? g.alignedHit / g.alignedN * 100 : null;
        return g;
      }).sort(function (a, b) { return a.q - b.q; });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  9. 회전 (§5) — 질문별 최근 CAP건 유지. 초과분은 집계만 남기고 삭제하되
  //     **삭제 사실을 기록**한다(알갱이 원칙의 예외를 명시적으로 남기기).
  // ─────────────────────────────────────────────────────────
  function rotate(q, cap) {
    var C = cap || CAP_PER_Q;
    return list({ q: q, order: 'date' }).then(function (rows) {   // 최신 우선
      if (rows.length <= C) return { q: q, purged: 0, kept: rows.length };
      var drop = rows.slice(C);
      var roll = { n: 0, hit: 0, nhit: 0, hn: 0, hhit: 0, sumErr: 0 };
      drop.forEach(function (r) {
        if (r.st !== 1) return;
        roll.n++; if (r.hit) roll.hit++; if (r.nhit) roll.nhit++;
        if (r.hhit != null) { roll.hn++; if (r.hhit) roll.hhit++; }
        roll.sumErr += (r.err || 0);
      });
      return _tx([STORE, STORE_AGG], 'readwrite').then(function (o) {
        var sp = o.t.objectStore(STORE), sa = o.t.objectStore(STORE_AGG);
        drop.forEach(function (r) { sp.delete(r.key); });
        return _wrap(sa.get('roll:' + q)).then(function (prev) {
          var acc = prev || { id: 'roll:' + q, q: +q, n: 0, hit: 0, nhit: 0, hn: 0, hhit: 0, sumErr: 0, purges: [] };
          acc.n += roll.n; acc.hit += roll.hit; acc.nhit += roll.nhit;
          acc.hn += roll.hn; acc.hhit += roll.hhit; acc.sumErr += roll.sumErr;
          acc.purges.push({ ts: Date.now(), n: drop.length, scored: roll.n, upTo: drop[0].date, from: drop[drop.length - 1].date });
          return _wrap(sa.put(acc)).then(function () {
            return { q: q, purged: drop.length, kept: C, rolled: roll.n };
          });
        });
      });
    });
  }

  function rolled(q) {
    return _tx(STORE_AGG, 'readonly').then(function (o) { return _wrap(o.s.get('roll:' + q)); });
  }

  // ─────────────────────────────────────────────────────────
  //  9b. 내보내기 [S1147] — **파일만 보고 해석이 되어야 한다**
  // ─────────────────────────────────────────────────────────
  //  원장은 이 기기 IndexedDB에만 있다. 분석하려면 파일로 꺼내는 경로가 유일하다.
  //  ★자기서술: 몇 달 뒤에 코드베이스 없이 이 JSON만 열어도 해석되도록 정의·상수·규칙을 같이 넣는다.
  //    (질문 정의·이진화 규칙·aligned 판정에 쓴 상수·회전으로 삭제된 분의 집계)
  //  ★폐기분도 포함한다 — 빠지면 "표본이 왜 줄었나"를 설명할 수 없다.
  var _BIN_DESC = {
    1: { event:'H봉 뒤 밴드폭이 넓어진다', truth:'actual > 0', model:'pred > 0', naive:'naive >= 50 (기저율%)' },
    2: { event:'H봉 뒤 MA5 기울기 부호가 뒤집힌다', truth:'sign(actual) !== sign(ctx.s0)', model:'sign(pred) !== sign(ctx.s0)', naive:'naive >= 50 (기저율%)' },
    4: { event:'다음 데드크로스까지 나이브(중앙 잔존봉수)보다 오래 간다', truth:'actual > naive', model:'pred > naive', naive:'항상 false — 중앙값이 자기를 넘을 수 없다(정의상 50% 동전)' },
    5: { event:'H봉 안 최대낙폭이 나이브(과거 평균 MAE)보다 깊다', truth:'actual > naive', model:'pred > naive', naive:'항상 false — 위와 같은 이유' }
  };

  function exportAll(extra) {
    return Promise.all([
      list({ includeVoid: true }),
      Promise.all(Object.keys(Q).map(function (q) { return rolled(q); }))
    ]).then(function (a) {
      var recs = a[0] || [], rolls = (a[1] || []).filter(Boolean);
      var c = { total: recs.length, scored: 0, picked: 0, pass: 0, voided: 0, intraday: 0 };
      recs.forEach(function (r) {
        if (r.st === 1) c.scored++;
        if (r.human === 'pass') c.pass++; else if (r.human != null) c.picked++;
        if (r.void) c.voided++;
        if (r.intraday) c.intraday++;
      });
      return {
        kind: 'sx_pred_ledger_export', schema: 1,
        exportedAt: new Date().toISOString(),
        ledgerVer: VER, baseRuleVer: BASE_RULE_VER, capPerQ: CAP_PER_Q,
        build: (extra && extra.build) || null,
        defs: {
          questions: Q,
          binarization: _BIN_DESC,
          note: '판정은 전부 저장된 pred/naive/ctx로 이뤄진다. 채점은 추가만 하며 pred는 수정 불가.',
          fields: {
            pred: '기록 시점 모델 예측(연속값)', naive: '기록 시점 나이브값',
            actual: '지평 도달 후 실측', truth: '사건 발생 여부', hit: '모델 적중', nhit: '나이브 적중',
            hhit: '사람 적중(pass는 null)', err: '|actual-pred|', nerr: '|actual-naive|',
            aligned: '측정 조건 안인가(질문별 의미 상이 — q2=이격 컷 이상, q5=외삽 아님, q1=표본 충분)',
            intraday: '봉 날짜와 픽 날짜가 같음(당일픽). KST 달력 비교라 US/COIN에선 부정확 — formed를 볼 것',
            formed: '픽 당시 기준봉이 이미 확정이었나(ctx.c0 vs post.c0Final 종가 일치로 판정)',
            ctx: '기록 시점 부가값', post: '채점 시점 실측 부가값', ver: '기록한 빌드',
            'void/voidWhy': '폐기 표시와 사유 — 삭제하지 않는다'
          },
          consts: (extra && extra.consts) || null
        },
        counts: c,
        rolled: rolls,
        records: recs
      };
    });
  }

  // ─────────────────────────────────────────────────────────
  //  9c. 가져오기 [S1149] — **현재 기기가 항상 이긴다**
  // ─────────────────────────────────────────────────────────
  //  ★덮어쓰지 않는다. 같은 슬롯이 양쪽에 다르게 있으면 파일 쪽을 버리고 충돌로 보고만 한다.
  //    덮어쓰기를 허용하는 순간 "사후에 유리한 값으로 바꾸기"가 가능해지고,
  //    원장이 지켜온 불변식(예측 수정 불가)이 통째로 무너진다. 복원 편의보다 이게 위다.
  //  ★그래서 가능한 것: 초기화 후 복원(전부 신규) · 기기 두 대 병합 · 옛 파일 실수 로드(무해)
  //    가능하지 않은 것: 현재 기록을 파일 것으로 교체(그건 wipe 후 가져오기로, 의도적으로만)
  //  ⚠파일을 손으로 고쳐 넣는 건 막지 못한다. 자기 연구 도구라 위협 모형 밖이다.
  var _CMP_FIELDS = ['pred','naive','human','actual','st','void','truth','hit','nhit','hhit'];

  function _sameRec(a, b) {
    for (var i = 0; i < _CMP_FIELDS.length; i++) {
      var f = _CMP_FIELDS[i], x = a[f], y = b[f];
      if (x == null && y == null) continue;
      if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > 1e-9) return false; continue; }
      if (x !== y) return false;
    }
    return true;
  }

  function importAll(payload) {
    return ready().then(function () {
      if (!payload || payload.kind !== 'sx_pred_ledger_export') {
        throw new Error('원장 내보내기 파일이 아니다 (kind 불일치)');
      }
      var recs = payload.records;
      if (!Array.isArray(recs)) throw new Error('records 배열 없음');
      var R = { total: recs.length, added: 0, same: 0, conflict: 0, invalid: 0, conflicts: [] };
      var chain = Promise.resolve();
      recs.forEach(function (rec) {
        chain = chain.then(function () {
          if (!rec || !rec.key || !rec.mkt || !rec.code || !rec.date || !Q[+rec.q]) { R.invalid++; return; }
          if (rec.pred == null || rec.naive == null) { R.invalid++; return; }
          return _tx(STORE, 'readwrite').then(function (o) {
            return _wrap(o.s.get(rec.key)).then(function (cur) {
              if (!cur) {
                var row = {};
                for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) row[k] = rec[k];
                row.imported = true;                       // 어디서 왔는지 남긴다
                return _wrap(o.s.add(row)).then(function () { R.added++; })
                       .catch(function () { R.invalid++; });
              }
              if (_sameRec(cur, rec)) { R.same++; return; }
              R.conflict++;
              if (R.conflicts.length < 50) {
                R.conflicts.push({ key: rec.key,
                  mine: { human: cur.human, actual: cur.actual, st: cur.st, pred: cur.pred, void: !!cur.void },
                  file: { human: rec.human, actual: rec.actual, st: rec.st, pred: rec.pred, void: !!rec.void } });
              }
            });
          });
        });
      });
      return chain.then(function () { return R; });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  10. 자가검증 — 로드 시 1회. 조용한 실패를 막는다(S526/S1127 선례).
  // ─────────────────────────────────────────────────────────
  function selfCheck() {
    var bad = [];
    Object.keys(Q).forEach(function (q) {
      if (typeof _BIN[q] !== 'function') bad.push('_BIN[' + q + '] 없음');
      if (typeof _MBIN[q] !== 'function') bad.push('_MBIN[' + q + '] 없음');
      if (typeof _NBIN[q] !== 'function') bad.push('_NBIN[' + q + '] 없음');
      if (!Q[q].hs || !Q[q].hs.length) bad.push('Q[' + q + '].hs 비었음');
    });
    // 이진화 왕복 검사 — 임의 레코드로 세 콜이 모두 boolean인지
    try {
      var probe = { q: 1, pred: 1, naive: 60, ctx: { s0: -1 } };
      [1, 2, 4, 5].forEach(function (q) {
        probe.q = q;
        if (typeof _BIN[q](probe, 1) !== 'boolean') bad.push('_BIN[' + q + '] boolean 아님');
        if (typeof _MBIN[q](probe) !== 'boolean') bad.push('_MBIN[' + q + '] boolean 아님');
        if (typeof _NBIN[q](probe) !== 'boolean') bad.push('_NBIN[' + q + '] boolean 아님');
      });
    } catch (e) { bad.push('이진화 호출 예외: ' + e.message); }

    if (bad.length) { try { console.error('[SXLedger] 자가검증 실패', bad); } catch (_) {} }
    return { ok: !bad.length, problems: bad };
  }

  // ─────────────────────────────────────────────────────────
  //  11. 내보내기 / 진단
  // ─────────────────────────────────────────────────────────
  function dump() {
    return list({}).then(function (rows) {
      return { ver: VER, ts: new Date().toISOString(), n: rows.length, rows: rows };
    });
  }
  function wipe() {   // 개발용 — 설정탭에서만 호출할 것
    return _tx([STORE, STORE_AGG], 'readwrite').then(function (o) {
      o.t.objectStore(STORE).clear(); o.t.objectStore(STORE_AGG).clear();
      return true;
    });
  }

  var _sc = selfCheck();

  global.SXLedger = {
    VER: VER, Q: Q, CAP_PER_Q: CAP_PER_Q,
    ready: ready,
    key: key, dueEst: dueEst,
    put: put, setHuman: setHuman, score: score,
    get: get, list: list, dueCount: dueCount, stats: stats,
    rotate: rotate, rolled: rolled, BASE_RULE_VER: BASE_RULE_VER,
    voidRec: voidRec, voidOlderThan: voidOlderThan,
    selfCheck: selfCheck, _selfCheck: _sc,
    requestPersist: requestPersist, persistState: persistState, estimate: estimate,
    dump: dump, wipe: wipe, exportAll: exportAll, importAll: importAll, _BIN_DESC: _BIN_DESC,
    _todayKst: _todayKst, _d10: _d10,
    _BIN: _BIN, _MBIN: _MBIN, _NBIN: _NBIN
  };

})(typeof window !== 'undefined' ? window : this);
