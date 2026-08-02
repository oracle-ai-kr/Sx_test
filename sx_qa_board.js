// ════════════════════════════════════════════════════════════
//  SIGNAL X — Q&A 게시판 (sx_qa_board.js)
//  버전: v1 · [S1167]
//
//  역할:
//    궁금증이 생긴 자리에서 **질문을 그대로** 적어두고, 측정이 끝나면 답을 달아 닫는다.
//
//  ★왜 필요한가
//    `🗄 기각 서고`는 **닫힌 목록**이다 — 이미 재고 답이 나온 것만, 코드에 박혀서 산다.
//    새 궁금증이 생기면 채팅으로 흘러가 세션과 함께 사라졌다. 실제로 여러 번 새어나갔다:
//    요일별 효과 · 수급 데이터 · 체결 프레임 — 전부 문서 한 줄로만 눕고 화면엔 없다.
//    게시판은 파이프라인의 **입구**고, 기각 서고는 **출구**다. 지금 출구만 있다.
//
//  ★질문은 원문 그대로 적는다
//    "인터넷 전략이 먹히나"를 "교과서적 매매전략의 예측 타당성 검증"으로 고쳐 적으면
//    그건 이미 다른 사람의 질문이다. 질문의 결이 사라지면 왜 궁금했는지도 사라진다.
//
//  ★불변식 (사후합리화의 기계적 차단 · 원장 §5와 같은 계열)
//    1. answer()   — ans가 이미 있으면 **거부**. 답은 덮어쓸 수 없다.
//    2. setGuess() — guess가 이미 있으면 거부. 예상은 한 번, 즉시 잠금.
//    3. setGate()  — gate가 이미 있으면 거부. 게이트는 **재기 전에** 선언되어야 한다.
//    4. editText() — guess나 ans가 붙은 뒤엔 거부. 찍고 나서 질문을 못 바꾼다.
//    5. importAll() — 기존 답을 **절대 덮어쓰지 않는다**. 빈 칸만 채운다(§왕복).
//
//  ★답을 뒤집는 길 (S837 전례)
//    N10에서 '확정'이던 것이 N15에서 뒤집혔다. 앞의 것이 틀린 게 아니라 그 해상도에서
//    보인 것이었다. 그래서 답은 고치지 않고, **새 질문을 열어 supersedes로 연결**한다.
//    앞의 답은 지우지 않는다 — 각 해상도에서 보인 것이 전부 기록으로 남아야 한다.
//
//  ★DB를 원장과 분리하는 이유
//    원장은 회전(상한)이 돌고 게시판은 안 돈다. 성질이 다른 걸 한 DB에 넣으면
//    초기화·백업 규칙이 엉킨다.
//
//  사용처: sx_render.js (조건검색탭 패널 · 분석탭 질문 버튼)
// ════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  //  0. 상수
  // ─────────────────────────────────────────────────────────
  var DB_NAME = 'sx_qa_board';
  var DB_VER = 1;
  var STORE = 'qa';
  var VER = 'S1167';

  //  축 — 지도 좌표. 게시판이 채워질수록 "무엇을 물으면 답이 나오나"의 경계가 드러난다.
  //  방향 태그가 ⚫에 몰리고 크기 태그가 🟢에 몰리면 그게 지도다(따로 그릴 필요 없음).
  var TAGS = {
    dir:    { name: '방향', desc: '오를까 내릴까 — 어느 쪽인가' },
    size:   { name: '크기', desc: '얼마나 움직이나 · 얼마나 깨지나' },
    time:   { name: '시간', desc: '언제까지 · 얼마나 걸리나' },
    struct: { name: '구조', desc: '어떻게 생겼나 · 무엇과 무엇이 붙어있나' },
    etc:    { name: '기타', desc: '위에 안 들어가는 것' }
  };

  //  상태 — answer()가 판정에 따라 2/3/4로 옮긴다. 사람이 직접 옮기는 건 0↔1뿐.
  var ST = {
    0: { key: 'open',    icon: '🔵', name: '안 잼',   desc: '궁금하지만 아직 안 재봄' },
    1: { key: 'running', icon: '🟡', name: '재는 중', desc: '게이트 선언됨 · 측정 진행' },
    2: { key: 'no',      icon: '⚫', name: '아니다',  desc: '쟀고 안 됐다' },
    3: { key: 'yes',     icon: '🟢', name: '그렇다',  desc: '쟀고 됐다' },
    4: { key: 'cant',    icon: '⚪', name: '못 잰다', desc: '데이터 없음 · 번역 불가' }
  };
  var VERDICT_ST = { no: 2, yes: 3, cant: 4 };

  var GUESS = ['yes', 'no', 'unsure'];

  //  [S1167] ★답의 깊이 — **질문이 아니라 답에 붙는다.**
  //    질문 깊이를 적는 사람이 매기면 자기평가가 된다(사람은 자기 질문을 실제보다 깊게 본다).
  //    답 깊이는 재고 나서 **결과에 근거해** 매기는 관측치다.
  //    ★쓸모: 6개월 뒤 게시판을 열었을 때 ●만 잔뜩이면 우리는 표면만 재고 있었던 것이고,
  //      ●●●이 몇 개 있으면 거기가 실제로 판 자리다. 남발하면 배지가 죽는다.
  var DEPTH = {
    1: { dots: '●○○', name: '되나',  desc: '규칙 하나를 나이브와 비교했다' },
    2: { dots: '●●○', name: '언제',  desc: '조건(레짐·시장·기간)으로 갈라 어디서 갈리는지 봤다' },
    3: { dots: '●●●', name: '왜',    desc: '경계의 후보를 세우고, 후보끼리 다른 예측을 뽑아 갈랐다' }
  };

  // ─────────────────────────────────────────────────────────
  //  1. IndexedDB 배관
  // ─────────────────────────────────────────────────────────
  var _db = null, _opening = null;

  function _open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    _opening = new Promise(function (res, rej) {
      if (!global.indexedDB) { rej(new Error('IndexedDB 없음')); return; }
      var rq = global.indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('st', 'st', { unique: false });
          s.createIndex('tag', 'tag', { unique: false });
          s.createIndex('ts', 'ts', { unique: false });
        }
      };
      rq.onsuccess = function (e) { _db = e.target.result; res(_db); };
      rq.onerror = function (e) { rej(e.target.error || new Error('DB 열기 실패')); };
    });
    return _opening;
  }

  function _tx(mode) {
    return _open().then(function (db) {
      var t = db.transaction([STORE], mode);
      return { t: t, s: t.objectStore(STORE) };
    });
  }

  function _wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('요청 실패')); };
    });
  }

  function ready() { return _open().then(function () { return true; }).catch(function () { return false; }); }

  // ─────────────────────────────────────────────────────────
  //  2. 유틸
  // ─────────────────────────────────────────────────────────
  function _newId() {
    return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function _d10(ts) {
    return new Date((ts || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);   // KST
  }
  function _str(v) { return (v == null ? '' : String(v)).trim(); }

  //  토큰화 — 유사 질문 찾기용. 판정하지 않는다, 보여주기만 한다.
  //  ⚠ 자동 중복 판정은 하지 않는다: "거래량 빈사가 위험한가"와 "거래량 급증이 위험한가"는
  //    글자로는 거의 같고 뜻은 정반대다. 사람이 보고 정한다.
  function _tokens(s) {
    var t = _str(s).toLowerCase().replace(/[^0-9a-z가-힣%]+/g, ' ').split(/\s+/);
    var out = [], seen = {};
    for (var i = 0; i < t.length; i++) {
      if (t[i].length < 2) continue;
      if (seen[t[i]]) continue;
      seen[t[i]] = 1; out.push(t[i]);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────
  //  3. 쓰기
  // ─────────────────────────────────────────────────────────
  //  o = { text, tag, topics[], mkt, code, name, guess, supersedes }
  //  ★text는 원문 그대로 저장한다. 다듬지 않는다.
  function add(o) {
    o = o || {};
    var text = _str(o.text);
    if (!text) return Promise.reject(new Error('질문이 비었다'));
    var tag = _str(o.tag) || 'etc';
    if (!TAGS[tag]) return Promise.reject(new Error('알 수 없는 축: ' + tag + ' (허용: ' + Object.keys(TAGS).join('/') + ')'));
    var guess = _str(o.guess);
    if (guess && GUESS.indexOf(guess) < 0) return Promise.reject(new Error("guess는 'yes'|'no'|'unsure'만"));

    var rec = {
      id: _newId(),
      ts: Date.now(),
      date: _d10(),
      text: text,
      tag: tag,
      topics: Array.isArray(o.topics) ? o.topics.map(_str).filter(Boolean) : [],
      mkt: _str(o.mkt) || null,
      code: _str(o.code) || null,
      name: _str(o.name) || null,
      //  [S1167] 출처 — 남의 주장을 재는 질문은 **어디서 봤는지가 질문의 일부**다.
      //    원문을 그대로 인용해두지 않으면 나중에 우리가 기억으로 재구성하게 되고,
      //    그 순간 재는 대상이 원문이 아니라 우리 요약이 된다.
      src: _str(o.src) || null,        // 출처(사이트·책·URL)
      quote: _str(o.quote) || null,    // 원문 인용 — 다듬지 않는다
      guess: guess || null,                 // 먼저 찍기 — 선택. 안 찍어도 된다.
      guessTs: guess ? Date.now() : null,
      st: 0,
      gate: null, gateTs: null,
      ans: null, ansTs: null,
      supersedes: _str(o.supersedes) || null,   // 이 질문이 뒤집는 앞 질문
      ver: VER
    };
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.add(rec)).then(function () { return rec; });
    });
  }

  //  예상 먼저 찍기 — 1회 · 즉시 잠금. 답이 나왔을 때 "역시 그럴 줄 알았다"를 봉인한다.
  function setGuess(id, guess) {
    if (GUESS.indexOf(guess) < 0) return Promise.reject(new Error("guess는 'yes'|'no'|'unsure'만"));
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.guess != null) throw new Error('이미 찍은 예상이다(수정 불가) — ' + cur.guess);
        if (cur.ans != null) throw new Error('이미 답이 달린 질문이다');
        cur.guess = guess; cur.guessTs = Date.now();
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  //  게이트 선언 — 재기 **전**에. 한 번만. 이게 사전등록이다.
  //  답만 있고 게이트가 없으면 6개월 뒤 "무슨 기준으로 아니라고 했지?"가 다시 생긴다.
  function setGate(id, gate) {
    var g = _str(gate);
    if (!g) return Promise.reject(new Error('게이트가 비었다'));
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.ans != null) throw new Error('이미 답이 달린 질문이다 — 게이트를 나중에 못 바꾼다');
        if (cur.gate != null) throw new Error('이미 선언된 게이트다(수정 불가)');
        cur.gate = g; cur.gateTs = Date.now(); cur.st = 1;
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  //  ★답 — 한 번만. 달리면 그 질문은 닫힌다.
  //  a = { verdict:'yes'|'no'|'cant', nums, note, alt, by }
  //    nums = 근거 수치(중앙 Δ · 빈도 · n 등) · alt = 대체제("대신 이걸 봐라")
  //  ★기각은 "화면에서 빼라"가 아니라 "모델 대신 나이브를 올려라" — alt가 그래서 있다.
  function answer(id, a) {
    a = a || {};
    var v = _str(a.verdict);
    if (!VERDICT_ST[v]) return Promise.reject(new Error("verdict는 'yes'|'no'|'cant'만"));
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.ans != null) throw new Error('이미 답이 달렸다(수정 불가) — 뒤집으려면 새 질문을 열고 supersedes로 연결할 것');
        var dp = +a.depth || 0;
        if (dp && !DEPTH[dp]) throw new Error('depth는 1|2|3만 (받음: ' + a.depth + ')');
        cur.ans = {
          verdict: v,
          depth: dp || null,             // 답의 깊이 — 없으면 미표기(강제 아님)
          nums: _str(a.nums) || null,      // 근거 수치
          note: _str(a.note) || null,      // 판독
          alt:  _str(a.alt) || null,       // 대체제
          by:   _str(a.by) || null         // 어느 시리얼/세션에서 쟀나
        };
        cur.ansTs = Date.now();
        cur.ansDate = _d10();
        cur.st = VERDICT_ST[v];
        //  게이트 없이 답이 달리면 그 사실을 남긴다 — 지우지 않고 드러낸다.
        if (cur.gate == null) cur.gateMissing = true;
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  //  질문 원문 수정 — guess나 ans가 붙기 **전**에만. 찍고 나서 질문을 바꾸면 찍은 게 무의미해진다.
  function editText(id, text) {
    var t = _str(text);
    if (!t) return Promise.reject(new Error('질문이 비었다'));
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.ans != null) throw new Error('답이 달린 질문은 못 고친다');
        if (cur.guess != null) throw new Error('예상을 찍은 뒤엔 질문을 못 고친다 — 새 질문을 열 것');
        cur.text = t;
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  //  주제/축/종목은 답 전까지 자유롭게 — 질문의 뜻이 아니라 분류라서.
  function setMeta(id, m) {
    m = m || {};
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.ans != null) throw new Error('답이 달린 질문은 못 고친다');
        if (m.tag != null) { if (!TAGS[m.tag]) throw new Error('알 수 없는 축: ' + m.tag); cur.tag = m.tag; }
        if (m.topics != null) cur.topics = Array.isArray(m.topics) ? m.topics.map(_str).filter(Boolean) : [];
        if (m.mkt !== undefined)  cur.mkt  = _str(m.mkt) || null;
        if (m.code !== undefined) cur.code = _str(m.code) || null;
        if (m.name !== undefined) cur.name = _str(m.name) || null;
        if (m.src !== undefined)   cur.src   = _str(m.src) || null;
        if (m.quote !== undefined) cur.quote = _str(m.quote) || null;
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  //  상태 되돌리기 — 1(재는중) → 0(안잼)만. 답이 달린 건 못 되돌린다.
  function reopen(id) {
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.get(id)).then(function (cur) {
        if (!cur) throw new Error('없는 질문: ' + id);
        if (cur.ans != null) throw new Error('답이 달린 질문은 못 되돌린다 — 새 질문을 열 것');
        cur.st = 0;
        return _wrap(h.s.put(cur)).then(function () { return cur; });
      });
    });
  }

  function remove(id) {
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.delete(id)).then(function () { return true; });
    });
  }

  // ─────────────────────────────────────────────────────────
  //  4. 읽기
  // ─────────────────────────────────────────────────────────
  function get(id) { return _tx('readonly').then(function (h) { return _wrap(h.s.get(id)); }); }

  //  f = { st, tag, topic, mkt, code, answered, q }  — 전부 선택
  function list(f) {
    f = f || {};
    return _tx('readonly').then(function (h) {
      return _wrap(h.s.getAll()).then(function (rows) {
        rows = rows || [];
        var qtok = f.q ? _tokens(f.q) : null;
        var out = rows.filter(function (r) {
          if (f.st != null && r.st !== +f.st) return false;
          if (f.tag && r.tag !== f.tag) return false;
          if (f.topic && (r.topics || []).indexOf(f.topic) < 0) return false;
          if (f.mkt && r.mkt !== f.mkt) return false;
          if (f.code && r.code !== f.code) return false;
          if (f.answered === true && r.ans == null) return false;
          if (f.answered === false && r.ans != null) return false;
          if (qtok && qtok.length) {
            var t = _tokens(r.text + ' ' + (r.topics || []).join(' '));
            var hit = qtok.some(function (k) { return t.indexOf(k) >= 0; });
            if (!hit) return false;
          }
          return true;
        });
        out.sort(function (a, b) { return b.ts - a.ts; });   // 최신 먼저
        return out;
      });
    });
  }

  //  [S1168] ★한국어 조사 대응 — 정확 일치로는 거의 안 걸린다.
  //    "골든크로스로"와 "골든크로스"는 다른 토큰이라 실데이터에서 유사 검색이 0건이 나왔다.
  //    (합성 테스트에선 같은 어미를 써서 안 보였다 — 실제 질문 28건을 넣고서야 드러났다.)
  //    처방: 한국어 조사는 **뒤에 붙으므로** 접두 일치로 본다. 형태소 분석은 과하고,
  //    길이 2 이상의 접두가 겹치면 같은 낱말로 취급하는 것으로 충분하다.
  function _tokMatch(a, b) {
    if (a === b) return a.length;
    var s = a.length < b.length ? a : b, l = a.length < b.length ? b : a;
    if (s.length >= 2 && l.indexOf(s) === 0) return s.length;   // 골든크로스 ⊂ 골든크로스로
    return 0;
  }
  function _hitCount(qt, rt) {
    var n = 0, best = 0;
    for (var i = 0; i < qt.length; i++) {
      var m = 0;
      for (var j = 0; j < rt.length; j++) { var k = _tokMatch(qt[i], rt[j]); if (k > m) m = k; }
      if (m) { n++; if (m > best) best = m; }
    }
    return { n: n, best: best };
  }

  //  ★유사 질문 — 막지 않고 보여준다.
  //    같은 질문이 다시 오는 게 나쁜 일이 아니다(S837: N10 '확정'이 N15에서 뒤집힘).
  //    다시 물었다는 사실 자체가 신호다 — 그 답이 소화되지 않았다는.
  //    같은 축 안에서 단어가 겹치는 것만. 판정하지 않는다.
  function similar(text, tag, limit) {
    var tok = _tokens(text);
    if (!tok.length) return Promise.resolve([]);
    return list({}).then(function (rows) {
      var scored = [];
      rows.forEach(function (r) {
        if (tag && r.tag !== tag) return;
        var t = _tokens(r.text + ' ' + (r.topics || []).join(' '));
        var h = _hitCount(tok, t);
        //  통과 조건: 겹치는 낱말 2개 이상 · 또는 3자 이상 낱말 하나.
        //  ★3자로 낮춘 이유: 한국어 낱말은 짧고 변별력이 크다(쌍바닥·이격도·거래량).
        //    4자로 두니 "쌍바닥 매수"가 0건이 나왔다. 게시판은 **막는 게 아니라 보여주는** 물건이라
        //    과잉차단이 과잉표시보다 나쁘다 — 놓치면 같은 질문을 또 하게 되고, 더 보여주면 사람이 넘기면 된다.
        if (h.n >= 2 || h.best >= 3) {
          scored.push({ rec: r, hits: h.n, best: h.best, ratio: h.n / Math.max(1, tok.length) });
        }
      });
      scored.sort(function (a, b) { return (b.ratio - a.ratio) || (b.best - a.best) || (b.hits - a.hits); });
      return scored.slice(0, limit || 5);
    });
  }

  //  집계 — 축 × 상태. 이게 지도다.
  function stats() {
    return list({}).then(function (rows) {
      var g = { n: rows.length, byTag: {}, bySt: {}, guessed: 0, guessHit: 0, guessN: 0, noGate: 0,
                byDepth: { 1: 0, 2: 0, 3: 0, none: 0 } };
      Object.keys(TAGS).forEach(function (k) { g.byTag[k] = { n: 0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }; });
      Object.keys(ST).forEach(function (k) { g.bySt[k] = 0; });
      rows.forEach(function (r) {
        var tg = TAGS[r.tag] ? r.tag : 'etc';
        g.byTag[tg].n++; g.byTag[tg][r.st] = (g.byTag[tg][r.st] || 0) + 1;
        g.bySt[r.st] = (g.bySt[r.st] || 0) + 1;
        if (r.ans) { var d = r.ans.depth; g.byDepth[DEPTH[d] ? d : 'none']++; }
        if (r.guess) g.guessed++;
        if (r.ans && r.ans.gateMissing) g.noGate++;
        if (r.gateMissing) g.noGate++;
        //  ★내 예상은 맞았나 — yes/no로 찍은 것만. unsure는 채점 제외(기록은 유지).
        if (r.ans && (r.guess === 'yes' || r.guess === 'no') &&
            (r.ans.verdict === 'yes' || r.ans.verdict === 'no')) {
          g.guessN++;
          if (r.guess === r.ans.verdict) g.guessHit++;
        }
      });
      return g;
    });
  }

  // ─────────────────────────────────────────────────────────
  //  5. 왕복 (내보내기 → 답 채우기 → 가져오기)
  // ─────────────────────────────────────────────────────────
  function exportAll() {
    return list({}).then(function (rows) {
      return { app: 'SIGNAL X', kind: 'qa_board', ver: VER,
               exportedAt: new Date().toISOString(), n: rows.length, rows: rows };
    });
  }

  //  ★가져오기 = 답이 착지하는 경로. 기존 답은 **절대 덮어쓰지 않는다.**
  //    - 새 id            → 넣는다
  //    - 기존 · 답 없음   → ans/gate만 채운다(답 착지)
  //    - 기존 · 답 있음   → 통째로 건너뛴다(잠김)
  //    text/guess/ts는 기존 레코드에서 **절대** 바뀌지 않는다 — 원문과 예상은 봉인.
  function importAll(obj) {
    var rows = (obj && Array.isArray(obj.rows)) ? obj.rows : (Array.isArray(obj) ? obj : null);
    if (!rows) return Promise.reject(new Error('rows 없음 — 게시판 내보내기 파일이 맞나'));
    var R = { added: 0, answered: 0, gated: 0, locked: 0, bad: 0 };
    return _tx('readwrite').then(function (h) {
      var chain = Promise.resolve();
      rows.forEach(function (inc) {
        chain = chain.then(function () {
          if (!inc || !inc.id || !_str(inc.text)) { R.bad++; return; }
          return _wrap(h.s.get(inc.id)).then(function (cur) {
            if (!cur) {
              inc.ver = inc.ver || VER;
              return _wrap(h.s.add(inc)).then(function () { R.added++; });
            }
            if (cur.ans != null) { R.locked++; return; }        // 답 있음 → 손 안 댐
            var touched = false;
            if (cur.gate == null && _str(inc.gate)) {
              cur.gate = _str(inc.gate); cur.gateTs = inc.gateTs || Date.now();
              if (cur.st === 0) cur.st = 1;
              R.gated++; touched = true;
            }
            if (inc.ans && VERDICT_ST[inc.ans.verdict]) {
              cur.ans = inc.ans;
              cur.ansTs = inc.ansTs || Date.now();
              cur.ansDate = inc.ansDate || _d10();
              cur.st = VERDICT_ST[inc.ans.verdict];
              if (cur.gate == null) cur.gateMissing = true;
              R.answered++; touched = true;
            }
            if (!touched) return;
            return _wrap(h.s.put(cur));
          });
        });
      });
      return chain.then(function () { return R; });
    });
  }

  //  ★공개용 — 답 달린 것만. 정적 파일로 올려 누구나 보는 용도(qa.html).
  //    ★guess를 뺀다: 남이 보는 자리에서 틀린 예상이 남으면 예상을 안 찍게 된다.
  //      질문이 태어나는 자리는 사적이고, 답이 나온 것만 공개다.
  //    ★gate는 반드시 싣는다: 게이트 없는 "⚫ 아니다"는 측정이 아니라 주장이다.
  //      남이 동의하든 반박하든 하려면 무슨 기준으로 쟀는지를 알아야 한다.
  function exportPublic() {
    return list({ answered: true }).then(function (rows) {
      var pub = rows.map(function (r) {
        return {
          id: r.id, date: r.date, text: r.text,
          tag: r.tag, tagName: (TAGS[r.tag] || {}).name || r.tag,
          topics: r.topics || [],
          mkt: r.mkt || null, code: r.code || null, name: r.name || null,
          src: r.src || null, quote: r.quote || null,
          gate: r.gate || null, gateMissing: !!r.gateMissing,
          ans: r.ans, ansDate: r.ansDate || null,
          depth: (r.ans && r.ans.depth) || null,
          depthDots: (r.ans && DEPTH[r.ans.depth]) ? DEPTH[r.ans.depth].dots : null,
          st: r.st, stIcon: (ST[r.st] || {}).icon || '', stName: (ST[r.st] || {}).name || '',
          supersedes: r.supersedes || null
        };
      });
      return {
        app: 'SIGNAL X', kind: 'qa_public', ver: VER,
        exportedAt: new Date().toISOString(), n: pub.length,
        //  ★공개 페이지에 반드시 박힐 문장. 우리끼린 "현 기준하 보임"이 몸에 뱄지만
        //    처음 보는 사람은 이걸 확정으로 읽는다. 공개하는 순간 그 책임이 생긴다.
        caveat: '전부 in-sample 단일 빈티지 측정이다. "이 창에서 이렇게 보였다"는 뜻이지 ' +
                '"항상 그렇다"는 뜻이 아니다. 게이트를 같이 보고 판단할 것.',
        rows: pub
      };
    });
  }
  //    답 안 달린 질문만. id를 같이 실어야 답이 돌아올 자리를 안다.
  function askText(f) {
    f = f || {};
    if (f.answered === undefined) f.answered = false;
    return list(f).then(function (rows) {
      if (!rows.length) return '(답 안 달린 질문 없음)';
      var L = ['# SIGNAL X Q&A — 답 대기 ' + rows.length + '건 · ' + _d10(), ''];
      rows.forEach(function (r, i) {
        var head = (i + 1) + '. [' + r.id + '] ' + (TAGS[r.tag] ? TAGS[r.tag].name : r.tag);
        if (r.code) head += ' · ' + (r.name || r.code) + '(' + r.code + '/' + (r.mkt || '?') + ')';
        if (r.topics && r.topics.length) head += ' · #' + r.topics.join(' #');
        L.push(head);
        L.push('   Q: ' + r.text);
        L.push('   (적은 날 ' + r.date + (r.guess ? ' · 내 예상 ' + r.guess : '') +
               (r.gate ? ' · 게이트 있음' : '') + ')');
        if (r.src)   L.push('   출처: ' + r.src);
        if (r.quote) L.push('   원문: ' + r.quote);
        if (r.gate)  L.push('   게이트: ' + r.gate);
        if (r.supersedes) L.push('   ↺ 뒤집는 대상: ' + r.supersedes);
        L.push('');
      });
      return L.join('\n');
    });
  }

  function wipe() {
    return _tx('readwrite').then(function (h) {
      return _wrap(h.s.clear()).then(function () { return true; });
    });
  }

  function estimate() {
    if (!global.navigator || !navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().catch(function () { return null; });
  }

  // ─────────────────────────────────────────────────────────
  //  6. 자기점검 — 로드 시 1회. 조용한 undefined 방지(S526 계열).
  // ─────────────────────────────────────────────────────────
  function selfCheck() {
    var bad = [];
    Object.keys(VERDICT_ST).forEach(function (v) { if (!ST[VERDICT_ST[v]]) bad.push('verdict ' + v); });
    Object.keys(TAGS).forEach(function (k) { if (!TAGS[k].name) bad.push('tag ' + k); });
    Object.keys(DEPTH).forEach(function (k) { if (!DEPTH[k].dots) bad.push('depth ' + k); });
    if (!TAGS.etc) bad.push('etc 축 없음(add 폴백이 깨진다)');
    return { ok: bad.length === 0, bad: bad };
  }
  var _sc = selfCheck();

  global.SXQA = {
    VER: VER, TAGS: TAGS, ST: ST, GUESS: GUESS, VERDICT_ST: VERDICT_ST, DEPTH: DEPTH,
    ready: ready,
    add: add, setGuess: setGuess, setGate: setGate, answer: answer,
    editText: editText, setMeta: setMeta, reopen: reopen, remove: remove,
    get: get, list: list, similar: similar, stats: stats,
    exportAll: exportAll, exportPublic: exportPublic, importAll: importAll, askText: askText,
    wipe: wipe, estimate: estimate,
    selfCheck: selfCheck, _selfCheck: _sc,
    _tokens: _tokens, _d10: _d10
  };

})(typeof window !== 'undefined' ? window : this);
