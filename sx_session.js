// ════════════════════════════════════════════════════════════
//  SIGNAL X — Session Time Module v1.0  [S574]
//  시장별 거래 세션 시각 중앙 설정 (정규장 / 프리 / 애프터)
//  index.html · sx_screener.html 양쪽에서 공용 로드 (sx_storage.js 형제)
// ════════════════════════════════════════════════════════════
//
//  〔배경 / 설계 의도 — 9/14 이후 C 단계 수정 시 반드시 정독〕
//  ───────────────────────────────────────────────────────────
//  2026-09-14 한국거래소 거래시간 확장:
//    · 정규장(09:00~15:30)은 그대로 유지. 종가 시각 15:30 변경 없음.
//    · 프리마켓(07:00~07:50) · 애프터마켓(16:00~20:00)이 앞뒤로 추가됨.
//    → 즉 "정규장이 늘어나는 것"이 아니라 시간외 세션이 추가되는 구조.
//  2026 하반기~연말 미국(나스닥 23h / NYSE Arca 22h)도 동일 패턴 예정:
//    · 정규장(ET 09:30~16:00) 유지, 야간/주간 시간외 확장.
//    · 나스닥 Global Trading Hours: 주간 04:00~20:00 / 야간 21:00~익04:00 (ET),
//      20:00~21:00 1시간 휴장. 정규장 종가 16:00 유지.
//    → us 값은 비워둠. 실제 출범 확정 시 아래 DEFAULTS.us 채우면 됨.
//
//  〔이 모듈의 역할〕
//    · 흩어져 있던 장 시각 하드코딩을 한 곳으로 모으는 단일 진실원(SSOT).
//    · N값은 SX_SESSION_DEFAULTS 에 하드코딩 (localStorage 미사용). 모달은 읽기 전용 확인용.
//      시각 변경은 DEFAULTS 수정 + 배포로 일괄 반영 → 흩어진 하드코딩 직접 수정 불필요(유지보수성).
//      [S577] 개인화(localStorage) 불필요로 판단해 제거 — 정규장 시각은 전 사용자 공통·거의 불변.
//
//  〔단계별 계획 — 안전하게 분할 진행〕
//    [1단계 = 이 파일·현재] 스키마 + 읽기 헬퍼(_sxSession) + 모달 UI.
//        값은 현행(kr 0900/1530) 그대로 → 아무도 아직 이 값을 참조 안 함.
//        ⇒ 동작 변화 0. 순수 인프라. 무위험.
//    [2단계] 하드코딩 지점을 _sxSession() 참조로 교체:
//      ─ 프론트 (완료, S575) ─
//        · sx_interpret.js  _closeTime (kr 분기) → _sxSession('kr').regular.close
//        · sx_screener.html '153000' ×2 (KIS 분봉 API) → _sxSessionKisHour('kr')
//      ─ 워커 (완료, S576) ─
//        · sx_scan_worker.js (브라우저 Web Worker): importScripts 로 sx_session.js 를
//          로드 → _sxSessionKisHour 공유. '153000' ×2(292·581) 교체. 미러 불필요·자동 동기화.
//          (localStorage 는 Web Worker 에서 못 읽지만 try/catch 폴백으로 DEFAULTS 사용 —
//           워커는 표준값만 필요하므로 OK.)
//        · workers_v9.js (Cloudflare 서버 워커): importScripts 불가 → SX_SESSION_MIRROR_KR
//          미러 상수로 krxCacheTtl(540/930/1080) 교체. ⚠ 손동기화 대상 — 여기 한 곳뿐.
//      ─ 대상 아님 ─
//        · sx_screener.html 장마감 감지(9523): "시세 80%가 0이면 마감" =
//          가격 기반 판단, 시각 무관 → _sxSession 대상 아님. 건드리지 말 것.
//    [3단계 — 대기] 분봉 구역 태깅 + 일봉 경고 훅:
//        ⏸ 2026-09-14 실데이터 도착 전에는 착수하지 않음(실데이터 의존).
//           1~2단계(S574~S577)까지가 안정적 마무리 지점 — 인프라만 깔고 대기.
//        · 분봉: 봉 제거가 아니라 시각→구역 분류. 각 봉에 _sess:'regular'|'pre'|'after'
//          필드를 달아 정규장 봉만 지표 계산에 사용, 프리/애프터는 보관(표시용).
//          → _sxSessionZone() 이 분류 담당 (현재 정의만, 호출처 없음).
//        · 일봉 경고: 일봉은 YYYYMMDD(날짜만)라 종가 시각이 없음(15:30 가정).
//          직접 대조 불가 → 간접 감지로:
//            (a) 같은 날 정규장 분봉 마지막 종가 ≠ 일봉 종가 → 애프터 혼입 의심
//            (b) 서울시간 15:30 이후에도 일봉 종가가 계속 갱신 → 애프터 혼입 의심
//          임계·방식은 실데이터 형태 확인 후(C) 확정. 지금은 훅 자리만.
//
//  〔정규장 시각 참조처 — 전수 점검 완료 (S577)〕
//    한국 정규장 시각(09:00/15:30)을 참조하는 곳은 아래 4곳이 전부. 추가 누락 없음:
//      ① sx_interpret.js  _closeTime(kr 분기)        — _sxSession('kr').regular.close
//      ② sx_screener.html KIS '153000' ×2            — _sxSessionKisHour('kr')
//      ③ sx_scan_worker.js KIS '153000' ×2 (292·581) — _sxSessionKisHour('kr') (importScripts 공유)
//      ④ workers_v9.js     krxCacheTtl 540/930/1080  — SX_SESSION_MIRROR_KR (미러)
//    〔제외 — N값(정규장 시각) 아님이 확인된 것들〕
//      · interpret _closeTime us(16:00)/coin(자정): us/coin은 DEFAULTS 자리만, 실사용 시 추후
//      · workers_v9 isUSMarketOpen(22:30/06:30): 미국장 판별 — 별도 주제
//      · workers_v9 매크로 시각(MORNING=7, _macroPending getHours): 거시지표 발표 슬롯 — 무관
//      · screener 장마감 감지(시세 80% 0): 가격 기반 — 시각 무관
//      · sx_bt.js _fmtDate 의 T09:00: 데이터에 이미 있는 시각 파싱·표시(주입 아님) — 무관
//      · 날짜범위 파라미터 T00:00:00, 도움말 문구("15:30~"): 조회 범위·UI 텍스트 — 무관
//    참고: _estimateStaleness 호출 시 us/coin 종목에 market 인자 전달 여부는 별개 이슈
//          (staleness 정확도). N값 SSOT 와 무관 — 필요 시 별도 점검.
//
//  〔C 단계 체크리스트 (2026-09-14 이후 실데이터 도착 시)〕
//    □ KIS/Naver가 프리·애프터 분봉을 실제로 주는가? 타임스탬프 형식은?
//    □ 일봉 종가가 애프터(20:00)까지 포함되는가? → filterOn 켤지 결정.
//    □ _sxSessionZone 의 구역 경계(분봉 시각 매핑) 실데이터로 검증.
//    □ 일봉 경고 (a)/(b) 중 어느 신호가 실측되는지 → 임계 확정.
//    □ DEFAULTS.us 값 채우기 (미국 확장 출범 확정 시).
//    □ filterOn 토글을 실제 동작과 연결 (2·3단계 완료 후).
//
//  〔미러 동기화 원칙〕
//    이 DEFAULTS(kr.regular 0900/1530)가 단일 진실원(SSOT).
//    · sx_scan_worker.js: importScripts 공유 → 자동 동기화 (손댈 것 없음).
//    · workers_v9.js: Cloudflare → SX_SESSION_MIRROR_KR 미러만 손동기화 (유일한 수동 지점).
//
//  〔배포 절차 — 정규장 시각이 실제로 바뀔 때〕
//    이 파일 DEFAULTS(kr.regular) 를 고치면:
//      · 프론트 + sx_scan_worker.js(importScripts 공유)는 자동 반영.
//      · workers_v9.js(Cloudflare) SX_SESSION_MIRROR_KR 만 같은 값으로 손수정.
//    → GitHub Pages push + Cloudflare 워커 deploy. 자주 할 일 아님.
//
//  〔검토: 매니저 파일 + 워커 fetch 방식 (채택 안 함)〕
//    대안: GitHub Pages에 session_config.json 푸시 → 워커가 런타임 fetch.
//      → 진짜 단일 진실원(SSOT) 하나가 프론트+워커 양쪽을 동기화. drift 제거.
//    채택 안 한 이유 (정규장 시각엔 오버엔지니어링):
//      ① 워커 fetch 레이턴시 + GitHub 다운 대비 캐시·폴백 로직 필요 → 복잡도↑
//      ② 정규장 시각은 몇 년에 한 번 바뀔까 한 값 → 그 인프라 실익 낮음
//      ③ N값은 DEFAULTS 하드코딩(localStorage 미사용)이라, 어차피 코드 수정+배포가
//         필요 → 미러 상수 손동기화와 작업량 차이가 없음 (fetch 인프라 이득 미미)
//    ⇒ 미러 상수 채택. 단, 아래 조건이면 fetch 방식으로 승격 검토:
//      · 제도 과도기로 시각이 몇 주 단위로 자주 바뀜
//      · 시장이 여러 개로 늘어 손동기화 부담이 커짐
// ════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ── 기본값 (실값은 kr 만, us/coin 은 정규장만·시간외 비움) ──────────
  //   시각 표기: 'HHMM' 4자리 문자열 (예 '0900', '1530'). 코인 마감 '2400'.
  var SX_SESSION_DEFAULTS = {
    kr: {
      filterOn: false,                              // [B 스위치] 정규장 구간 필터 — 기본 OFF (실데이터 확인 후 ON)
      regular: { open: '0900', close: '1530' },     // N1, N2 — 현재 실사용 (변경 없음)
      pre:     { open: '0700', close: '0750' },     // N3, N4 — 9/14 예정값 (대기·미사용)
      after:   { open: '1600', close: '2000' }      // N5, N6 — 9/14 예정값 (대기·미사용)
    },
    us: {
      filterOn: false,
      regular: { open: '0930', close: '1600' },     // ET 정규장 (DST 무시·표기용)
      pre:     { open: '',     close: ''     },     // 미국 확장 출범 확정 시 채움
      after:   { open: '',     close: ''     }
    },
    coin: {
      filterOn: false,
      regular: { open: '0000', close: '2400' },     // 24h — 변경점 거의 없음
      pre:     { open: '',     close: ''     },
      after:   { open: '',     close: ''     }
    }
  };

  var _MARKETS = ['kr', 'us', 'coin'];

  // 깊은 기본값 복제 (참조 오염 방지)
  function _cloneDefault(market) {
    var d = SX_SESSION_DEFAULTS[market] || SX_SESSION_DEFAULTS.kr;
    return JSON.parse(JSON.stringify(d));
  }

  // ── 읽기 헬퍼 — 2·3단계의 모든 참조 진입점 ────────────────────────
  //   [S577] localStorage 미사용. DEFAULTS(하드코딩)가 유일 진실원 → 복제본 반환.
  //     N값 변경은 SX_SESSION_DEFAULTS 수정 + 배포(workers_v9 미러 동기화)로만.
  //     UI(모달)는 이 값을 읽기 전용으로 보여주기만 함 (저장·편집 없음).
  function _sxSession(market) {
    market = (_MARKETS.indexOf(market) >= 0) ? market : 'kr';
    return _cloneDefault(market);
  }

  // ── 시각 유틸 (3단계 분봉 태깅 대비 — 현재 호출처 없음) ───────────────
  //   'HHMM' → 자정 기준 분(minute). 'HH:MM' 도 허용. 코인 '2400'=1440.
  function _sxSessionHHMMtoMin(hhmm) {
    if (hhmm == null) return null;
    var s = String(hhmm).replace(':', '').trim();
    if (s.length < 3 || s.length > 4) return null;
    if (s.length === 3) s = '0' + s;
    var h = parseInt(s.slice(0, 2), 10);
    var m = parseInt(s.slice(2), 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  // 분봉 시각(자정 기준 분)이 어느 구역인지 판별.
  //   [3단계] 분봉 배열 태깅에 사용 예정. 빈 구역은 건너뜀.
  //   반환: 'regular' | 'pre' | 'after' | 'closed'
  function _sxSessionZone(market, minOfDay) {
    var cfg = _sxSession(market);
    var zones = ['pre', 'regular', 'after'];
    for (var i = 0; i < zones.length; i++) {
      var z = cfg[zones[i]];
      if (!z || !z.open || !z.close) continue;
      var o = _sxSessionHHMMtoMin(z.open);
      var c = _sxSessionHHMMtoMin(z.close);
      if (o == null || c == null) continue;
      if (minOfDay >= o && minOfDay < c) return zones[i];
    }
    return 'closed';
  }

  // KIS 분봉 API FID_INPUT_HOUR_1 용 — 정규장 마감 시각을 'HHMMSS'로.
  //   regular.close('1530') → '153000'. 손상/형식오류 시 '153000' 폴백.
  function _sxSessionKisHour(market) {
    var s = _sxSession(market);
    var c = (s && s.regular && s.regular.close) ? s.regular.close : '1530';
    return /^\d{4}$/.test(c) ? (c + '00') : '153000';
  }

  // ════════════════════════════════════════════════════════════
  //  모달 UI — 저장소 진단(동적 오버레이) 패턴 + sx_modal popstate 닫기
  //  설정탭/인덱스의 버튼이 _sxSessionOpenModal() 호출.
  // ════════════════════════════════════════════════════════════
  var _modalSettled = false;

  function _vib(ms) {
    try {
      if (typeof _sxVib === 'function') { _sxVib(ms); return; }
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  function _rowHTML(label, cfgZone, mode, hint) {
    // [S577] 읽기 전용 표시 — input 없음. mode: 'active'(정규장·사용중) | 'pending'(9/14 예정·대기)
    var pending = (mode === 'pending');
    var op = (cfgZone && cfgZone.open)  ? cfgZone.open  : '—';
    var cl = (cfgZone && cfgZone.close) ? cfgZone.close : '—';
    var tag = pending
      ? '<span style="font-size:9px;color:var(--text3);font-weight:400">🔒 9/14 예정 · 대기</span>'
      : '<span style="font-size:9px;color:var(--buy,#16a34a);font-weight:600">● 사용 중</span>';
    var box = 'display:inline-flex;align-items:center;justify-content:center;width:64px;padding:7px 6px;'
            + 'font-size:13px;border:1px solid var(--border);border-radius:6px;font-family:ui-monospace,monospace;letter-spacing:1px;'
            + (pending ? 'background:var(--surface2);color:var(--text3)' : 'background:var(--surface);color:var(--text);font-weight:600');
    return ''
      + '<div style="margin-bottom:10px">'
      +   '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      +     '<span style="font-size:11px;font-weight:600;color:var(--text)">' + label + '</span>' + tag
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px">'
      +     '<span style="' + box + '">' + op + '</span>'
      +     '<span style="color:var(--text3);font-size:12px">~</span>'
      +     '<span style="' + box + '">' + cl + '</span>'
      +     (hint ? '<span style="font-size:9px;color:var(--text3);margin-left:2px">' + hint + '</span>' : '')
      +   '</div>'
      + '</div>';
  }

  function _sxSessionOpenModal(market) {
    market = (_MARKETS.indexOf(market) >= 0) ? market : 'kr';
    _vib(10);

    var existing = document.getElementById('sxSessionOverlay');
    if (existing) existing.remove();

    var cfg = _sxSession(market);
    var mLabel = { kr: '🇰🇷 한국장', us: '🇺🇸 미국장', coin: '🪙 코인' }[market] || market;

    var overlay = document.createElement('div');
    overlay.id = 'sxSessionOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;'
      + 'display:flex;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(2px)';

    overlay.innerHTML = ''
      + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;width:100%;'
      +   'max-width:360px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.5)">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border)">'
      +     '<h4 style="margin:0;font-size:14px;color:var(--text)">🕐 정규장 시간 설정 <span style="font-size:10px;color:var(--text3);font-weight:400">' + mLabel + '</span></h4>'
      +     '<span style="font-size:18px;cursor:pointer;color:var(--text3);padding:0 6px" onclick="_sxSessionCloseModal()">✕</span>'
      +   '</div>'
      +   '<div style="flex:1;overflow-y:auto;padding:14px 16px">'
      +     '<div style="font-size:9px;color:var(--text3);line-height:1.6;margin-bottom:12px">'
      +       '현재 적용 중인 거래 세션 시각입니다 (읽기 전용). 시각은 코드에 고정돼 있으며 변경 시 배포로 반영됩니다. '
      +       '프리/애프터는 2026-09-14 이후 데이터 확인 뒤 활성화됩니다.'
      +     '</div>'
      +     _rowHTML('정규장 (N1 ~ N2)', cfg.regular, 'active', '시작 ~ 마감')
      +     '<div style="border-top:1px solid var(--border);margin:8px 0 12px"></div>'
      +     _rowHTML('프리마켓 (N3 ~ N4)', cfg.pre, 'pending', '')
      +     _rowHTML('애프터마켓 (N5 ~ N6)', cfg.after, 'pending', '')
      +     '<div style="border-top:1px solid var(--border);margin:8px 0 10px"></div>'
      +     '<label style="display:flex;align-items:flex-start;gap:8px;cursor:not-allowed;opacity:.55">'
      +       '<input type="checkbox" id="sxSesFilter" ' + (cfg.filterOn ? 'checked' : '') + ' disabled style="width:16px;height:16px;flex-shrink:0;margin-top:1px">'
      +       '<span style="font-size:11px;font-weight:600;color:var(--text);line-height:1.4">정규장 구간 필터 '
      +         '<span style="font-size:9px;color:var(--text3);font-weight:500">🔒 9/14 이후</span><br>'
      +         '<span style="font-size:9px;color:var(--text3);font-weight:400">ON 시 프리/애프터 분봉을 구역 분리하고 정규장만 지표 계산에 사용 — 실데이터 확인 후 활성화</span>'
      +       '</span>'
      +     '</label>'
      +   '</div>'
      + '</div>';

    // 백드롭 클릭 → 닫기 (박스 내부 클릭은 무시)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _sxSessionCloseModal(); });

    document.body.appendChild(overlay);

    // sx_modal 패턴: pushState + 자체 popstate(once) → 모바일 뒤로가기/ghost click 방지
    _modalSettled = false;
    try { history.pushState({ view: 'sxSession' }, ''); } catch (_) {}
    overlay._popHandler = function () { _doCloseModal(); };
    window.addEventListener('popstate', overlay._popHandler, { once: true });
  }

  function _doCloseModal() {
    if (_modalSettled) return;
    _modalSettled = true;
    var ov = document.getElementById('sxSessionOverlay');
    if (ov) { try { ov.remove(); } catch (_) {} }
  }

  // 닫기는 단일 경로(history.back) — popstate가 실제 제거
  function _sxSessionCloseModal() {
    _vib(8);
    if (_modalSettled) { _doCloseModal(); return; }
    try { history.back(); } catch (e) { _doCloseModal(); }
  }

  // ── 전역 노출 ──────────────────────────────────────────────────
  global._sxSession            = _sxSession;            // 읽기 (2·3단계 참조 진입점, DEFAULTS 복제)
  global._sxSessionHHMMtoMin   = _sxSessionHHMMtoMin;   // 3단계 대비
  global._sxSessionZone        = _sxSessionZone;        // 3단계 대비
  global._sxSessionKisHour     = _sxSessionKisHour;     // [S575] KIS 분봉 API 종료시각
  global._sxSessionDefaults    = SX_SESSION_DEFAULTS;   // 워커 미러 동기화 참조원
  global._sxSessionOpenModal   = _sxSessionOpenModal;   // 읽기 전용 확인 모달
  global._sxSessionCloseModal  = _sxSessionCloseModal;

})(typeof window !== 'undefined' ? window : globalThis);
