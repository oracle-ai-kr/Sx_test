// ════════════════════════════════════════════════════════════
//  SIGNAL X — Storage Manager (sx_storage.js)
//  버전: v1.1
//
//  역할:
//    - localStorage 사용량 진단 (시각화 + 카테고리/개별 키 펼치기)
//    - 통합 캐시 초기화 (스크리너 + 인덱스)
//    - 통합 전체 초기화
//    - 개별 키 삭제 (NEW v1.1)
//    - 메모리 캐시 헬퍼 — ORACLE_* 종목풀 마스터를 localStorage 대신 세션 메모리에 보관 (NEW v1.1)
//
//  사용처:
//    - sx_screener.html: 설정탭 데이터 관리 → SXS.showDiag(), SXS.clearCache(), SXS.resetAll()
//    - index.html:       설정탭 데이터 관리 → 동일
//    - SXS.cacheGet/Set:  ORACLE_* 마스터 데이터를 점진 이전할 때 사용 (선택 도입)
// ════════════════════════════════════════════════════════════

(function(global){
  'use strict';

  // ════════════════════════════════════════════════════════════
  // [S1399] 로컬 데이터관리 누락 봉합 — 접두 규율 복원 + 분류 2건 + 소유 표시.
  //   표시·저장 배선 층위 · 사전등록 없음 · 판정·발동조건·원장 변경 0 · 파일 2개(sx_screener.html · 이 파일).
  //
  // ①★가장 큰 결함: 공시 캐시가 접두로 갈려 있었다.
  //     KR = 'SX_DISC_' + 종목코드   -> 분류 O · 캐시 초기화 O · 전체 초기화 O
  //     US = 'SEC_DISC_' + 티커      -> 셋 다 ✗   (S323 · 원 주석은 '한국과 동일 키 컨벤션'이라 적혀 있었다)
  //   실기기 진단 실측: '기타' 74개 중 약 67개가 SEC_DISC_ 이고 약 163KB였다.
  //   ⇒ 화면은 '공시 정보 21.4KB · 18개'라 말하는데 실제 공시 캐시는 그 8배였고, 어느 초기화 버튼으로도 지워지지 않았다.
  //   조치: 'SX_DISC_SEC_' 로 개명. 접두 하나로 CAT_RULES·CACHE_PREFIXES·ALL_PREFIXES 셋에 자동 편입된다(규칙표 신규 항목 0).
  //   ⚠부작용 1회: 기존 US 공시 캐시가 전부 miss 되어 종목별로 SEC를 한 번 다시 받는다(24시간 캐시라 하루면 원상).
  //
  // ②'sx_kosis_market_per' -> 'SX_FIN_KOSIS_PER'. 소문자 sx_ 는 ALL_PREFIXES 의 'sx_ext_' 에 안 걸려
  //   전체 초기화가 못 지웠고 CACHE_PREFIXES 에도 없어 캐시 초기화도 못 지웠다(7일 TTL 캐시인데 영구 잔존).
  //
  // ③한시 청소 접두 — 개명 전 기기에 남은 구 키(SEC_DISC_ 약 67개 · sx_kosis_market_per 1개)는 새 이름으로 안 잡힌다.
  //   CACHE_PREFIXES·ALL_PREFIXES·CAT_RULES 에 구 이름을 그대로 넣어 캐시 초기화 한 번으로 걷히게 했다.
  //   ★제거 조건: 실기기 진단에서 그 두 접두의 키가 0개로 확인되면 세 곳에서 함께 뺀다. 그때까지는 무해.
  //
  // ④분류 낙오 2건 추가 — SX_MAT_(카드 추가재료 목록 · SX_XMAT_ 와 다른 키라 안 걸렸다) · SX_REGIME_.
  //   ⚠SX_REGIME_ 은 CAT_RULES 머리말이 '있다'는 전제로 쓰여 있었는데 실제 규칙이 없었다 — 주석은 사실이 아닐 수 있다(S1336 규칙10 ④). 주석도 정정했다.
  //
  // ⑤★소유 표시 — 이 origin(GitHub Pages)은 다른 프로젝트와 localStorage 를 공유한다.
  //   실기기에서 lotto_expert_v4_draw_cache(12.3KB) · GH_DEPLOY_HISTORY(9.0KB) · ULT_VDASH_LOTTO(3.6KB)가 '기타'에 함께 잡혔다.
  //   우리 것이 아니고 초기화 대상도 아닌데 화면이 74개를 전부 우리 키처럼 셌다 ⇒ 카테고리 요약에 '이 중 N개는 다른 앱' 한 줄,
  //   개별 키에 '앱 밖' 배지. 판정 기준은 ALL_PREFIXES 하나다 — '전체 초기화가 지우는 범위'가 곧 '우리 소유'의 정의라 재량이 0이다.
  //   ⚠지우지는 않는다. 남의 앱 데이터를 우리 버튼이 건드리면 안 된다(개별 삭제 버튼은 종전대로 있다).
  //
  // ⑥⚠채택하지 않은 안 — '_sxCacheRead 가 TTL 만료 시 removeItem'.
  //   내가 먼저 제안했다가 따져보고 물렸다: 만료 키를 읽는 순간은 그 종목을 다시 볼 때뿐이고 바로 뒤 _sxCacheWrite 가 덮어쓴다.
  //   ⇒ 정작 쌓이는 것(다시 안 보는 종목의 키)은 _sxCacheRead 가 영영 안 불려 손도 못 댄다. 효과가 거의 없다.
  //   실제로 걷으려면 '진입 시 만료 스윕'(전수 순회)이 필요한데 주기를 새로 정해야 하고 이 시리얼과 층이 다르다.
  //   사용량이 592.7KB/5MB(11.6%)로 급하지 않고, ①만으로 캐시 초기화 한 번에 163KB 가 회수된다 ⇒ 버튼이 정직해지는 것이 먼저. 백로그.
  //
  // ⑦내 감사의 계통 오차 기록 — 1차 스캔이 'SX_/sx_/at_/ORACLE_ 로 시작하는 문자열'만 훑어 SEC_DISC_ 를 통째로 놓쳤다.
  //   찾으려던 것이 '접두 규율을 깬 키'인데 접두를 가정하고 찾았다. 규칙5 계열 ⇒ 규율 위반을 찾을 때 그 규율을 필터로 쓰지 않는다.
  //
  // ⑧검증 배터리 86항목 전건 통과 — A 개명(구본 양성과 짝지어) / B 규칙표를 원문에서 잘라 태워 11키 × 4축(분류·캐시·전체·소유) 실측
  //   + 기존 분류 15키 무회귀(SX_OPT_REGIME_SEL 이 SX_REGIME_ 신규 규칙으로 안 새는지 포함) / C 소유 표시 / D 한시 접두와 제거 조건
  //   / E 주석 정정 / F 무손상(_sxCacheRead 무변경·resetAll IDB 정리 보존·sx_render.js md5 불변·html 삭제 0줄).
  //   sx_screener.html 은 변경이 든 script 블록(485KB)을 통째로 node --check 로 통과 확인.
  //   ⚠검증기 오탐 1건: 같은 부분문자열이 CACHE/ALL 두 줄에 들어가는데 ===1 로 셌다(규칙11 — 무엇을 세는지). 줄 특정으로 교정.
  //
  // ⚠실기기 확인 대기: 캐시 초기화 1회 후 '기타'가 약 74개 -> 3개(다른 앱)로 줄고 그 3개에 '앱 밖' 배지가 붙는지 ·
  //   미국 종목을 열면 SX_DISC_SEC_ 로 다시 쌓이는지 · 공시 정보 카테고리 크기가 실제 값으로 커지는지.
  // ════════════════════════════════════════════════════════════

  // ─── 키 정의 (한 곳에서 관리) ───
  // [S224-fix5] SX_SCR_SEARCH_RESULTS_ 추가 — 국내/해외/코인 검색결과(271KB+)도 캐시 삭제 대상
  //   사용자 설정(필터/프리셋)은 SX_SCR_FILTERS_*/SX_SCR_PRESETS 등 다른 키이므로 영향 없음
  // [S1399] 뒤 두 개는 **한시 청소 접두**다 — 개명 전 기기에 남은 구 키를 캐시 초기화 한 번으로 걷기 위한 것.
  //   제거 조건: 실기기 진단에서 'SEC_DISC_'·'sx_kosis_market_per' 키가 0개로 확인되면 이 두 항목을 뺀다(그때까지는 무해).
  const CACHE_PREFIXES = ['SX_DISC_','sx_ext_','SX_CDL_','SX_FIN_','ORACLE_','SX_DASH_CACHE_','SX_SCR_SEARCH_RESULTS_','SEC_DISC_','sx_kosis_market_per'];
  const EXCLUDE_FROM_CACHE_CLEAR = new Set(['SX_FIN_REPORT']);  // 사용자 설정 — 캐시 정리에서 제외
  const ALL_PREFIXES = ['SX_','ORACLE_','sx_ext_','at_','SEC_DISC_','sx_kosis_market_per'];  // [S1399] 뒤 두 개=한시 청소 접두(CACHE_PREFIXES와 같은 조건에서 함께 뺀다) · [S1044] at_ 추가 — 자동매매(at_session·at_collapsed)도 전체 초기화 대상(기존엔 누락)

  // [S224-fix5/fix6/fix7] 통합 toast 헬퍼 — 양 환경 모두에서 확실히 표시
  //   sx_screener.html: 자체 정의된 window.toast() 사용 (CSS 정의 있음, #toast DOM 사용)
  //   index.html: SX._toast() 사용 (fix7에서 인라인 스타일로 수정되어 정상 동작)
  function _showToast(msg){
    try{
      if(typeof toast === 'function'){ toast(msg); return; }
      if(typeof SX !== 'undefined' && typeof SX._toast === 'function'){ SX._toast(msg); return; }
      console.log('[SXS]', msg);
    }catch(_){
      console.log('[SXS]', msg);
    }
  }

  // 카테고리 표시 이름 (진단 화면용)
  const CATEGORY_LABELS = {
    'ORACLE_':         { icon:'🌐', name:'종목풀 마스터', desc:'KOSPI/KOSDAQ/ETF/COIN/US 마스터 데이터' },
    'sx_ext_':         { icon:'📊', name:'확장 캔들',     desc:'KIS 700/600/400봉 확장 캐시' },
    'SX_CDL_':         { icon:'🕯️', name:'기본 캔들',     desc:'일반 캔들 데이터 캐시' },
    'SX_DISC_':        { icon:'📅', name:'공시 정보',     desc:'DART 공시 캐시' },
    'SX_FIN_':         { icon:'📈', name:'재무 데이터',   desc:'재무제표·이익 캐시' },
    'SX_OPT_':         { icon:'🎯', name:'옵티마이저',    desc:'프리셋·랭킹·가중치' },
    'SX_BT_':          { icon:'💼', name:'BT 결과',       desc:'백테스팅 이력 + 설정' },
    'SX_SCR_':         { icon:'🔍', name:'스크리너 설정', desc:'필터·프리셋·검색결과' },
    'SX_DASH_CACHE_':  { icon:'📊', name:'대시보드 캐시', desc:'인덱스 페이지 차트' },
    'SX_WATCH':        { icon:'⭐', name:'관심종목',      desc:'WATCHLIST + WATCH_BT_CACHE' },
    'SX_KIS_':         { icon:'🔑', name:'KIS API',       desc:'토큰 + 만료시각' },
    'SX_ANAL_':        { icon:'🔬', name:'분석 설정',     desc:'TF, 안전필터' },
    // [S553] 기타로 빠지던 키 카테고리화 — 아래 3개는 실제 prefix가 아닌 "카테고리ID"(CAT_RULES에서 매핑)
    'SX_TREND_':       { icon:'📈', name:'단기추세매매',  desc:'MA 크로스 실험 설정 (시장별)' },
    'SX_NOTIFY_':      { icon:'🔔', name:'알림·텔레그램',  desc:'알림 소리 + 텔레그램 연동' },
    'SX_CHART_':       { icon:'🎨', name:'차트 설정',     desc:'캔들 색상(녹적) + 마커 소스(보라)' },
    'SX_APP_':         { icon:'⚙️', name:'앱 설정',       desc:'모드·필터·가중치·전이임계 등 기타 설정' },
    // [S1044] 전수 스캔으로 기타에서 분리
    'SX_MANUAL_':      { icon:'✍️', name:'수동매매',      desc:'수동 매매 시뮬 거래·정렬·통계 상태' },
    'AT_':             { icon:'🤖', name:'자동매매',      desc:'자동매매 페이지 세션·UI 상태 (시즌2·localStorage 공유)' },
  };

  // [S553] prefix → 카테고리ID 매핑. 여러 prefix를 한 카테고리로 묶기 위함.
  //   순서 중요: 구체적 prefix가 앞. 기존 분류는 그대로 두고 신규만 뒤에 추가 → 기존 동작 불변.
  //   (예: SX_OPT_REGIME_SEL 은 SX_OPT_ 가 먼저라 옵티마이저로 유지, SX_REGIME_ 로 안 새어나감)
  //   ⚠[S1399] 정정 — 위 괄호는 'SX_REGIME_ 규칙이 있다'는 전제로 쓰였는데 **그 규칙이 없었다**.
  //     그래서 SX_REGIME_ADAPT·SX_REGIME_ON_MIGRATED가 계속 '기타'로 떨어지고 있었다(주석은 사실이 아닐 수 있다 · S1336 규칙10 ④).
  //     아래 S1399 구역에서 실제로 추가했고, SX_OPT_가 앞이라는 원 취지는 그대로 성립한다.
  const CAT_RULES = [
    { p:'ORACLE_',           c:'ORACLE_'        },
    { p:'sx_ext_',           c:'sx_ext_'        },
    { p:'SX_CDL_',           c:'SX_CDL_'        },
    { p:'SX_DISC_',          c:'SX_DISC_'       },
    { p:'SX_FIN_',           c:'SX_FIN_'        },
    { p:'SX_OPT_',           c:'SX_OPT_'        },
    { p:'SX_BT_',            c:'SX_BT_'         },
    { p:'SX_SCR_',           c:'SX_SCR_'        },
    { p:'SX_DASH_CACHE_',    c:'SX_DASH_CACHE_' },
    { p:'SX_WATCH',          c:'SX_WATCH'       },
    { p:'SX_KIS_',           c:'SX_KIS_'        },
    { p:'SX_ANAL_',          c:'SX_ANAL_'       },
    // ── [S553] 신규: 기존엔 기타로 빠지던 키들 ──
    { p:'SX_TREND_',         c:'SX_TREND_'      },
    { p:'SX_ALERT_SOUND_',   c:'SX_NOTIFY_'     },
    { p:'SX_TG_',            c:'SX_NOTIFY_'     },
    { p:'SX_WL_',            c:'SX_APP_'        },
    { p:'SX_TRANS_ZONE_',    c:'SX_APP_'        },
    { p:'SX_SCORE_WEIGHTS',  c:'SX_APP_'        },
    { p:'SX_SAFETY_FILTER',  c:'SX_APP_'        },
    { p:'SX_MARKET_INDEX',   c:'SX_APP_'        },
    { p:'SX_LAST_SCAN_TIME', c:'SX_APP_'        },
    { p:'SX_PARALLEL_FETCH', c:'SX_APP_'        },
    { p:'SX_CUSTOM_DISC_KW', c:'SX_APP_'        },
    { p:'SX_PRESET_MODE',    c:'SX_APP_'        },
    { p:'SX_DEV_MODE',       c:'SX_APP_'        },
    { p:'SX_MODE',           c:'SX_APP_'        },
    // ── [S589] 그동안 '기타'로 빠지던 키 분류 추가 ──
    { p:'SX_CHART_',         c:'SX_CHART_'      },  // 차트 색상(GREENRED)·마커 소스(PURPLE)
    { p:'SX_EE_',            c:'SX_BT_'         },  // 조기청산 모드별 상태(SX_EE_MODE_STATE) — BT 설정으로 묶음
    // ── [S1044] 전수 스캔: 그동안 '기타'로 빠지던 키 분류 (순서: 앞 규칙 우선, 전부 신규 prefix라 기존 불변) ──
    { p:'SX_MANUAL_',        c:'SX_MANUAL_'     },  // 수동매매 시뮬(거래/정렬/통계)
    { p:'SX_PAPER_',         c:'SX_MANUAL_'     },  // 페이퍼 거래 → 수동매매로 묶음
    { p:'at_',               c:'AT_'            },  // 자동매매 페이지(at_session·at_collapsed) — localStorage 공유
    { p:'SX_APP_',           c:'SX_APP_'        },  // SX_APP_ 자체 prefix(누락됐었음)
    { p:'SX_NOTIFY_',        c:'SX_NOTIFY_'     },  // SX_NOTIFY_ 자체 prefix(누락됐었음)
    { p:'SX_CT_',            c:'SX_APP_'        },  // CT 풀 자동(SX_CT_POOL_AUTO)
    { p:'SX_CUSTOM_',        c:'SX_APP_'        },  // 커스텀 임계·MA크로스
    { p:'SX_MACRO_',         c:'SX_APP_'        },  // 매크로 컨텍스트
    { p:'SX_GATE',           c:'SX_APP_'        },  // SX_GATE_/SX_GATES_ 게이트 설정
    { p:'SX_P2_',            c:'SX_APP_'        },  // 프로젝트C 하위폴드 UI
    { p:'SX_PHASE_FOLD_',    c:'SX_APP_'        },  // Phase 폴드 UI
    { p:'SX_SMART_',         c:'SX_APP_'        },  // 스마트 설정
    { p:'SX_DATA_SCHEMA',    c:'SX_APP_'        },  // 스키마 버전
    // ── [S1252] 로컬키 전수 재조사(리터럴 49·접두 26): 전체 초기화(ALL_PREFIXES) 밖 키 0 확인 — S1044 접두 규율 유지 중.
    //    아래 4건만 진단 '기타'행 낙오라 분류 추가(전부 설정성 — CACHE_PREFIXES 불변이 정답).
    { p:'SX_STRAT_',         c:'SX_TREND_'      },  // 단기매매 조합 블록(S1116·⛩️🚪 포함) — 카드 소속
    { p:'SX_CELLBK_',        c:'SX_TREND_'      },  // 칸 바구니(S1120) — 카드 소속
    { p:'SX_XMAT_',          c:'SX_TREND_'      },  // 카드 추가재료 편집(S1095대)
    { p:'SX_PRED_',          c:'SX_APP_'        },  // 예측원장 UI 토글(SX_PRED_BLIND 등)
    // ── [S1399] 실기기 진단('기타' 74개) 전수 대조로 드러난 낙오 ──
    { p:'SX_MAT_',           c:'SX_TREND_'      },  // SX_MAT_EXTRA=카드 추가재료 목록. SX_XMAT_(재료 편집 상태)와 **다른 키**라 그 규칙에 안 걸렸다.
    { p:'SX_REGIME_',        c:'SX_APP_'        },  // SX_REGIME_ADAPT·SX_REGIME_ON_MIGRATED — 위 괄호가 있다고 말해온 그 규칙(S1399 정정).
    // ── [S1399] 한시 청소용 분류 — 개명 전 구 키가 '기타'로 안 떨어지게. CACHE/ALL_PREFIXES와 같은 조건에서 함께 뺀다. ──
    { p:'SEC_DISC_',            c:'SX_DISC_'    },  // 구 미국 공시 캐시 → 새 이름은 SX_DISC_SEC_
    { p:'sx_kosis_market_per',  c:'SX_FIN_'     },  // 구 KOSIS 시장 PER 캐시 → 새 이름은 SX_FIN_KOSIS_PER
  ];

  // [S1399] 이 origin(GitHub Pages)은 다른 프로젝트와 localStorage를 공유한다 — 실기기에서
  //   lotto_expert_v4_draw_cache · GH_DEPLOY_HISTORY · ULT_VDASH_LOTTO 가 '기타'에 함께 잡혔다.
  //   그것들은 우리 것이 아니고 초기화 대상도 아닌데 화면이 우리 키처럼 세고 있었다 ⇒ 소유를 표시한다.
  //   판정 기준을 ALL_PREFIXES로 삼는다 — '전체 초기화가 지우는 범위'가 곧 '우리 소유'의 정의라 재량이 0이다.
  function _isOwnKey(k){ try { return ALL_PREFIXES.some(function(p){ return String(k).indexOf(p) === 0; }); } catch(_) { return true; } }

  // 펼침 상태 보관 (모달 다시 그릴 때 유지)
  const _expandedCategories = new Set();

  // ─── [v1.1] 메모리 캐시 헬퍼 ───
  // 용도: ORACLE_* 종목풀 마스터를 localStorage 대신 세션 메모리에 저장
  //       (페이지 새로고침 시 사라지지만, fetch는 보통 1회 — 한 세션에 1회)
  // 사용 예시:
  //   SXS.cacheSet('ORACLE_KOSPI', kospiArray);   // 메모리에 저장
  //   const data = SXS.cacheGet('ORACLE_KOSPI');  // 메모리 → localStorage 폴백
  //   SXS.cacheHas('ORACLE_KOSPI');               // 어디든 있으면 true
  const _memCache = {};
  const _memCacheTS = {};

  function cacheSet(key, value){
    _memCache[key] = value;
    _memCacheTS[key] = Date.now();
  }
  function cacheGet(key){
    if(_memCache[key] !== undefined) return _memCache[key];
    // 폴백: localStorage (점진 이전 호환)
    try {
      const raw = localStorage.getItem(key);
      if(raw === null) return null;
      try { return JSON.parse(raw); } catch(_) { return raw; }
    } catch(_) { return null; }
  }
  function cacheHas(key){
    return _memCache[key] !== undefined || (function(){
      try { return localStorage.getItem(key) !== null; } catch(_) { return false; }
    })();
  }
  function cacheClear(prefix){
    if(prefix){
      Object.keys(_memCache).forEach(k => {
        if(k.startsWith(prefix)){ delete _memCache[k]; delete _memCacheTS[k]; }
      });
    } else {
      // 전체 초기화
      Object.keys(_memCache).forEach(k => delete _memCache[k]);
      Object.keys(_memCacheTS).forEach(k => delete _memCacheTS[k]);
    }
  }
  function cacheStats(){
    let totalKeys = 0;
    let totalBytes = 0;
    Object.keys(_memCache).forEach(k => {
      totalKeys++;
      try {
        // 추정: JSON.stringify 길이 × 2 (UTF-16)
        totalBytes += (k.length + JSON.stringify(_memCache[k]).length) * 2;
      } catch(_) {}
    });
    return { keys: totalKeys, bytes: totalBytes };
  }

  // [S1090] 변동성 타깃팅 설정 헬퍼 철거 — 기능이 S1017 SSOT 통합에서 배선이 끊겨 완전 死였다(엔진 주석 참조).

  // ─── 1. 진단 (analyze) ───
  function analyze(){
    const items = [];
    let totalBytes = 0;
    try {
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!k) continue;
        let v;
        try { v = localStorage.getItem(k) || ''; } catch(_) { v = ''; }
        const bytes = (k.length + v.length) * 2;
        items.push({ key: k, bytes });
        totalBytes += bytes;
      }
    } catch(e) {
      console.warn('[SXS.analyze]', e);
    }

    // 카테고리별 집계
    const byCategory = {};
    items.forEach(item => {
      let matched = '기타';
      for(const rule of CAT_RULES){
        if(item.key.startsWith(rule.p)){ matched = rule.c; break; }
      }
      if(!byCategory[matched]){
        byCategory[matched] = { bytes: 0, count: 0, items: [] };
      }
      byCategory[matched].bytes += item.bytes;
      byCategory[matched].count++;
      byCategory[matched].items.push(item);
    });

    // 카테고리 안 항목들도 큰 순으로 정렬
    Object.values(byCategory).forEach(cat => {
      cat.items.sort((a,b) => b.bytes - a.bytes);
    });

    return { totalBytes, byCategory, items };
  }

  // ─── 2. 사이즈 포맷 ───
  function formatSize(bytes){
    if(bytes < 1024) return bytes + 'B';
    if(bytes < 1024 * 1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(2) + 'MB';
  }

  // ─── 3. 진단 HTML ───
  function renderDiagHTML(){
    const data = analyze();
    const QUOTA = 5 * 1024 * 1024;  // 추정 5MB (브라우저별 다름)
    const usedPct = (data.totalBytes / QUOTA * 100).toFixed(1);

    // 진행 바 색상 (사용률에 따라)
    let pctColor = 'var(--buy, #16a34a)';
    if(usedPct > 70) pctColor = '#f59e0b';
    if(usedPct > 85) pctColor = 'var(--sell, #dc2626)';

    let html = `
      <div style="padding:12px;font-size:13px;color:var(--text,#000)">
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span style="font-size:14px;font-weight:600">총 사용량</span>
            <span style="font-size:13px;color:${pctColor};font-weight:600">${formatSize(data.totalBytes)} / ~5MB (${usedPct}%)</span>
          </div>
          <div style="height:10px;background:var(--surface2,#eee);border-radius:5px;overflow:hidden">
            <div style="height:100%;width:${Math.min(usedPct,100)}%;background:${pctColor};transition:width .3s"></div>
          </div>
          ${usedPct > 80 ? '<div style="margin-top:6px;font-size:11px;color:#dc2626">⚠️ 용량 한계 근접 — 캐시 초기화 권장</div>' : ''}
        </div>

        ${(function(){
          // [S1159] 600봉 캐시 관측 — localStorage가 아니라 세션 메모리 캐시(fetchRows600)라 위 목록에 안 잡힌다.
          //   목표 미달본이 확정 캐시로 굳어 종목이 400봉에 고착되던 증상의 수정 결과를 여기서 확인한다.
          //   ★rescued > 0 이면 재시도가 실제로 목표를 채웠다는 뜻 = 그 버그가 실재했다는 증거.
          //   새로고침하면 0으로 돌아간다(세션 한정 카운터).
          var D=null, K0=null; try{ D=window._sxR600Dbg; K0=window._sxKisPg; }catch(_){}
          if(!D && !K0) return '';
          D = D || { retry:0, rescued:0, stuck:0, list:[] };   // [S1161] KIS만 있어도 그려야 한다
          var none=(!D.retry && !D.rescued && !D.stuck);
          var c=function(v,col){ return '<b style="color:'+(v?col:'var(--text3,#999)')+'">'+v+'</b>'; };
          // [S1160] 미달 사례 상세 — 계수만으로는 "상장 짧은 종목"과 "버그"를 못 가른다.
          var rows='';
          try{
            var L=(D.list||[]);
            for(var i=0;i<L.length;i++){
              var e=L[i], p=String(e.k||'').split('|'), cd=p[2]||e.k, tag, tc;
              if(e.n2==null){ tag='재시도 전'; tc='var(--text3,#999)'; }
              else if(e.n2>e.n1){ tag='재시도로 +'+(e.n2-e.n1); tc='#16a34a'; }
              else { tag='같은 벽'; tc='#d97706'; }
              rows += '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:3px 0;border-top:1px solid var(--border,#eee)">'
                + '<span style="font-weight:600">'+cd+'</span>'
                + '<span style="color:var(--text2,#666)">'+e.n1+(e.n2!=null&&e.n2!==e.n1?('→'+e.n2):'')+' / '+e.tgt+'봉 <span style="color:'+tc+'">'+tag+'</span></span>'
                + '</div>';
            }
          }catch(_e2){}
          var kis='';
          try{
            // [S1161] KIS 차트 페이지 관측 — 400봉 증상의 실제 발원지. 캔들 캐시보다 한 층 아래다.
            var K=window._sxKisPg;
            if(K && K.req){
              var warn=(K.short>0);
              kis = '<div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--border,#eee)">'
                + '<div style="font-size:11.5px;font-weight:600;margin-bottom:3px">KIS 차트 페이지</div>'
                + '<div style="font-size:11px;line-height:1.7">'
                + '요청 '+K.req+' · 재시도 '+c(K.retry,'#d97706')+' · '
                + '재시도로 성공 '+c(K.ok2,'#16a34a')+' · '
                + '끝내 실패 '+c(K.fail,'#dc2626')+' · '
                + '중간에 끊긴 종목 '+c(K.short,'#dc2626')
                + '<span style="color:var(--text3,#999)"> · 간격 '+K.gapMs+'ms</span>'
                + '</div>'
                + '<div style="margin-top:4px;font-size:10px;color:'+(warn?'#dc2626':'var(--text3,#999)')+';line-height:1.5">'
                + (K.ok2>0
                    ? '<b>재시도로 성공</b>이 있다 = KIS가 요청을 조이고 있었다는 뜻입니다. 예전이면 그 페이지가 통째로 버려져 400봉이 됐습니다.'
                    : (warn ? '<b>중간에 끊긴 종목</b>이 있습니다 — 재시도해도 안 된 경우라 KIS 쪽 원인일 수 있습니다.'
                            : '아직 끊긴 사례 없음.'))
                + '</div></div>';
            }
          }catch(_e3){}
          return '<div style="margin-bottom:14px;padding:10px;background:var(--surface2,#f6f6f6);border-radius:8px">'
            + '<div style="font-size:13px;font-weight:600;margin-bottom:6px">🕯 캔들 600봉 캐시 <span style="font-size:10px;font-weight:500;color:var(--text3,#999)">세션 한정 · 새로고침 시 0</span></div>'
            + (none
                ? '<div style="font-size:11px;color:var(--text3,#999)">아직 목표 미달 사례 없음 — 종목 몇 개를 열어본 뒤 다시 보세요.</div>'
                : '<div style="font-size:11.5px;line-height:1.7">'
                  + '재요청 '+c(D.retry,'#d97706')+'건 · '
                  + '구제 '+c(D.rescued,'#16a34a')+'건 · '
                  + '가용최대 '+c(D.stuck,'var(--text2,#666)')+'건'
                  + '</div>'
                  + (rows?('<div style="margin-top:6px">'+rows+'</div>'):''))
            + '<div style="margin-top:6px;font-size:10px;color:var(--text3,#999);line-height:1.5">'
            + '<b>같은 벽</b> = 재시도해도 봉수가 그대로. 오래된 종목인데 이게 뜨면 재시도로는 못 고치는 원인입니다. '
            + '오래되지 않은 종목(최근 상장)이면 정상입니다.'
            + '</div>' + kis + '</div>';
        })()}

        <div style="font-size:12px;color:var(--text2,#666);margin-bottom:8px;font-weight:600">카테고리별 분포 <span style="font-weight:400;color:var(--text3,#999)">(클릭하면 개별 키 표시)</span></div>
    `;

    // 카테고리 정렬: bytes 큰 순
    const sortedCats = Object.entries(data.byCategory).sort((a,b) => b[1].bytes - a[1].bytes);
    for(const [prefix, info] of sortedCats){
      const lbl = CATEGORY_LABELS[prefix] || { icon:'📁', name: prefix === '기타' ? '기타' : prefix, desc:'' };
      const pct = (info.bytes / data.totalBytes * 100).toFixed(1);
      const barW = Math.max(2, Math.min(100, info.bytes / data.totalBytes * 100));
      const isExpanded = _expandedCategories.has(prefix);
      const arrow = isExpanded ? '▼' : '▶';

      html += `
        <div style="margin-bottom:8px;background:var(--surface,#fafafa);border-radius:6px;overflow:hidden">
          <div style="padding:8px;cursor:pointer" onclick="SXS._toggleCategory('${prefix}')">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
              <span style="font-size:12px;font-weight:600">
                <span style="color:var(--text3,#999);font-size:9px;margin-right:4px">${arrow}</span>${lbl.icon} ${lbl.name}
              </span>
              <span style="font-size:11px;color:var(--text2,#666)">${formatSize(info.bytes)} · ${info.count}개 (${pct}%)</span>
            </div>
            <div style="height:6px;background:var(--surface2,#eee);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${barW}%;background:var(--accent,#2563eb)"></div>
            </div>
            ${lbl.desc ? `<div style="margin-top:4px;font-size:10px;color:var(--text3,#999)">${lbl.desc}</div>` : ''}
            ${(function(){   /* [S1399] 앱 밖 키를 갈라 적는다 — 개수를 우리 것으로 세지 않기 위해 */
                var fo = info.items.filter(function(it){ return !_isOwnKey(it.key); });
                if(!fo.length) return '';
                var fb = fo.reduce(function(a,b){ return a + b.bytes; }, 0);
                return '<div style="margin-top:4px;font-size:10px;color:#d97706;line-height:1.5">'
                     + '이 중 <b>' + fo.length + '개 · ' + formatSize(fb) + '</b>는 <b>다른 앱</b> 키입니다 — 같은 주소(origin)를 쓰는 다른 페이지가 저장한 것이라 '
                     + 'SIGNAL X 소유가 아니고 캐시·전체 초기화 대상도 아닙니다(지우려면 아래 목록에서 개별 삭제).'
                     + '</div>';
              })()}
          </div>
      `;

      // [v1.1] 펼친 상태면 개별 키 목록 표시
      if(isExpanded){
        html += `<div style="padding:0 8px 8px 8px;border-top:1px solid var(--border,#eee)">`;
        const showItems = info.items.slice(0, 30);  // 최대 30개 표시
        for(const item of showItems){
          const safeKey = item.key.replace(/"/g, '&quot;').replace(/'/g, "\\'");
          html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid var(--border,#f0f0f0);font-size:11px">
              <span style="color:var(--text2,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:8px">${item.key}${_isOwnKey(item.key) ? '' : '<span style="margin-left:5px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;background:#d9770622;color:#d97706;white-space:nowrap">앱 밖</span>'}</span>
              <span style="color:var(--text3,#999);font-size:10px;margin-right:8px;white-space:nowrap">${formatSize(item.bytes)}</span>
              <button onclick="SXS.removeKey('${safeKey}')" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;color:var(--sell,#dc2626);font-size:10px;padding:2px 6px;cursor:pointer">삭제</button>
            </div>
          `;
        }
        if(info.items.length > 30){
          html += `<div style="padding:6px 4px;font-size:10px;color:var(--text3,#999);text-align:center">… 외 ${info.items.length - 30}개</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    // 액션 버튼
    const cacheBytes = sortedCats
      .filter(([prefix]) => CACHE_PREFIXES.some(p => prefix === p))
      .reduce((sum,[,info]) => sum + info.bytes, 0);

    // 메모리 캐시 통계 (사용 중일 때만 표시)
    const memStats = cacheStats();
    let memInfo = '';
    if(memStats.keys > 0){
      memInfo = `
        <div style="margin-top:14px;padding:8px;background:var(--surface,#f0f9ff);border-radius:6px;font-size:11px;color:var(--text2,#666)">
          💡 세션 메모리 캐시: ${memStats.keys}개 키 (${formatSize(memStats.bytes)})
          <span style="color:var(--text3,#999);font-size:10px">— 페이지 새로고침 시 자동 정리</span>
        </div>
      `;
    }

    html += `
        ${memInfo}
        <div id="sxsLedgerBox" style="margin-top:12px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px">
          <button onclick="SXS.clearCache()" style="padding:10px;background:var(--accent,#2563eb);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">
            🧹 캐시 초기화<br><span style="font-size:10px;opacity:.85">${formatSize(cacheBytes)} 회수 예상</span>
          </button>
          <button onclick="SXS.resetAll()" style="padding:10px;background:var(--sell,#dc2626);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">
            🗑️ 전체 초기화<br><span style="font-size:10px;opacity:.85">${formatSize(data.totalBytes)} 회수</span>
          </button>
        </div>
        <div style="margin-top:10px;font-size:10px;color:var(--text3,#999);line-height:1.5">
          • <b>카테고리 클릭</b>: 개별 키 펼쳐 보기 + 삭제<br>
          • <b>캐시 초기화</b>: 공시·캔들·재무·종목풀 삭제 (관심종목/프리셋/API키 보존)<br>
          • <b>전체 초기화</b>: 모든 데이터 삭제 + 페이지 새로고침
        </div>
      </div>
    `;

    return html;
  }

  // [S1158] 예측 원장은 IndexedDB라 localStorage 순회에 안 잡힌다.
  //   진단 화면이 localStorage만 보여주면 "저장소 진단"이 반쪽이 되고,
  //   사용자는 원장이 어디에 얼마나 있는지 볼 방법이 없다. 비동기라 나중에 채워 넣는다.
  function _fillLedgerBox(){
    var box = document.getElementById('sxsLedgerBox');
    if(!box) return;
    if(typeof SXLedger === 'undefined'){
      box.innerHTML = '<div style="padding:8px;background:var(--surface,#f8fafc);border-radius:6px;font-size:11px;color:var(--text3,#999)">'
        + '🗂 예측 원장 — 사용 불가(저장소 차단 또는 미로드)</div>';
      return;
    }
    Promise.all([
      SXLedger.list({ includeVoid: true }).catch(function(){ return []; }),
      SXLedger.estimate().catch(function(){ return null; })
    ]).then(function(a){
      var rows = a[0] || [], est = a[1];
      var picked = 0, scored = 0, voided = 0;
      rows.forEach(function(r){
        if(r.void){ voided++; return; }
        if(r.human != null) picked++;
        if(r.st === 1) scored++;
      });
      var ps = SXLedger.persistState && SXLedger.persistState();
      box.innerHTML = '<div style="padding:9px 11px;background:var(--surface,#f8fafc);border:1px solid var(--border,#e5e7eb);border-radius:6px">'
        + '<div style="font-size:11.5px;font-weight:700;color:var(--text,#111)">🗂 예측 원장 <span style="font-weight:400;color:var(--text3,#999);font-size:10px">— IndexedDB (위 목록에 안 잡힘)</span></div>'
        + '<div style="margin-top:5px;font-size:11px;color:var(--text2,#666);line-height:1.7">'
        +   '전체 <b>' + rows.length + '건</b> · 직접 찍은 예측 <b>' + picked + '건</b> · 채점 완료 ' + scored + '건'
        +   (voided ? (' · 폐기 ' + voided + '건') : '')
        +   (est && est.usage != null ? ('<br>origin 사용량 ' + (est.usage/1048576).toFixed(1) + 'MB'
              + (est.quota ? (' / ' + (est.quota/1048576).toFixed(0) + 'MB') : '')) : '')
        +   '<br>저장 보호 ' + (ps && ps.ok ? '<b style="color:#16a34a">ON</b>' : '<b style="color:#e3493b">OFF</b>')
        + '</div>'
        + (picked ? ('<div style="margin-top:6px;font-size:10px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:5px;padding:6px 8px;line-height:1.6">'
            + '직접 찍은 예측은 <b>전체 초기화 시 함께 삭제</b>되고, 파일로 내보내지 않았다면 되살릴 수 없습니다. '
            + '조건검색탭 → 예측 원장 → 원장 파일 내보내기</div>') : '')
        + '</div>';
    }).catch(function(){});
  }

  // ─── 4. 진단 모달 표시 ───
  //   [v1.2] 모바일 뒤로가기 지원 — history.pushState + popstate (sx_screener.html)
  //          ×/배경 클릭 시 history.back()으로 일관성 유지 (popstate가 모달 제거)
  function showDiag(){
    try { if(typeof _sxVib === 'function') _sxVib(8); } catch(_) {}

    const old = document.getElementById('sxsStorageDiag');
    if(old) old.remove();

    // 뒤로가기 지원: history 항목 추가 → 뒤로가기 시 popstate 핸들러가 모달 제거
    try { history.pushState({view:'sxsStorageDiag'}, ''); } catch(_) {}

    const modal = document.createElement('div');
    modal.id = 'sxsStorageDiag';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = function(e){
      // 배경 클릭 시 history.back() — popstate 핸들러가 실제 제거 담당 (일관성)
      if(e.target === modal){ try { history.back(); } catch(_) { modal.remove(); } }
    };

    const inner = document.createElement('div');
    inner.style.cssText = 'background:var(--bg,#fff);border-radius:12px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)';
    inner.id = 'sxsStorageDiagInner';

    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 16px;border-bottom:1px solid var(--border,#eee);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg,#fff);z-index:1';
    // × 버튼: history.back() (popstate 핸들러가 제거 담당)
    header.innerHTML = `
      <span style="font-size:15px;font-weight:600">📦 localStorage 진단</span>
      <button onclick="try{history.back()}catch(_){document.getElementById('sxsStorageDiag').remove()}" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text2,#666);padding:0 4px">×</button>
    `;
    inner.appendChild(header);

    const body = document.createElement('div');
    body.id = 'sxsStorageDiagBody';
    body.innerHTML = renderDiagHTML();
    inner.appendChild(body);

    modal.appendChild(inner);
    document.body.appendChild(modal);
      try { setTimeout(_fillLedgerBox, 0); } catch(_) {}   // [S1158] 최초 표시 시에도 원장 블록 채움
  }

  // ─── [v1.1] 모달 내부 다시 그리기 (펼침 상태 토글, 키 삭제 후 등) ───
  function _refreshDiag(){
    const body = document.getElementById('sxsStorageDiagBody');
    if(body) body.innerHTML = renderDiagHTML();
    try { _fillLedgerBox(); } catch(_) {}   // [S1158] 원장은 비동기라 렌더 후 채운다
  }

  // ─── [v1.1] 카테고리 펼침/접기 토글 ───
  function _toggleCategory(prefix){
    if(_expandedCategories.has(prefix)) _expandedCategories.delete(prefix);
    else _expandedCategories.add(prefix);
    _refreshDiag();
  }

  // ─── [v1.1] 개별 키 삭제 ───
  // [S224] async 변환 — sxConfirm 사용
  async function removeKey(key){
    if(!key) return;
    try { if(typeof _sxVib === 'function') _sxVib(10); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf(`다음 키를 삭제할까요?\n\n${key}`)) return;
    try {
      localStorage.removeItem(key);
      // 메모리 캐시도 함께 정리 (있는 경우)
      if(_memCache[key] !== undefined){ delete _memCache[key]; delete _memCacheTS[key]; }
      // [S224-fix5] 통합 toast 헬퍼 — index.html에서도 동작
      _showToast(`✓ ${key} 삭제됨`);
    } catch(e) {
      // [S224] alert → toast (폴백은 console)
      _showToast(`삭제 실패: ${e.message}`);
    }
    _refreshDiag();
  }

  // ─── 5. 캐시 초기화 (통합) ───
  // [S224] async 변환 — sxConfirm 사용
  async function clearCache(){
    try { if(typeof _sxVib === 'function') _sxVib(15); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf('캐시만 초기화하시겠습니까?\n(공시·캔들·재무·종목풀·대시보드 캐시 삭제 · 관심종목/프리셋/API키 등은 보존)')) return;

    let removed = 0;
    let bytesFreed = 0;
    try {
      for(let i = localStorage.length - 1; i >= 0; i--){
        const k = localStorage.key(i);
        if(!k) continue;
        if(CACHE_PREFIXES.some(p => k.startsWith(p)) && !EXCLUDE_FROM_CACHE_CLEAR.has(k)){
          try {
            const v = localStorage.getItem(k) || '';
            bytesFreed += (k.length + v.length) * 2;
            localStorage.removeItem(k);
            removed++;
          } catch(_) {}
        }
      }
      ['SX_SCR_STOCK_MASTER'].forEach(k => {
        try {
          if(localStorage.getItem(k) !== null){
            const v = localStorage.getItem(k) || '';
            bytesFreed += (k.length + v.length) * 2;
            localStorage.removeItem(k);
            removed++;
          }
        } catch(_) {}
      });
    } catch(e) {
      console.warn('[SXS.clearCache] err', e);
    }

    // 메모리 캐시도 정리 (ORACLE_, sx_ext_ 등)
    cacheClear('ORACLE_');
    cacheClear('sx_ext_');
    // [S224-fix5] 검색결과 메모리 캐시도 함께 정리 (localStorage만 지우면 화면에 남아있음)
    cacheClear('SX_SCR_SEARCH_RESULTS_');

    // 인메모리 변수 캐시 (각 파일에서 사용)
    try { if(typeof _finCache !== 'undefined') _finCache = {}; } catch(_) {}
    try { if(typeof _memCandleCache !== 'undefined') _memCandleCache = {}; } catch(_) {}
    try { if(typeof SX !== 'undefined' && SX._DASH_CACHE) SX._DASH_CACHE = null; } catch(_) {}
    // [S224-fix5] 스크리너 검색결과 전역 변수 + 화면 즉시 정리 (스크리너에서만 동작)
    try {
      if(typeof searchResults !== 'undefined' && Array.isArray(searchResults)){
        searchResults.length = 0;
      }
      if(typeof renderResults === 'function') renderResults();
    } catch(_) {}

    _refreshDiag();

    // [S224-fix5] 통합 toast 헬퍼 — index.html에서도 정상 표시
    _showToast(`캐시 ${removed}개 항목 (${formatSize(bytesFreed)}) 삭제됨`);
  }

  // ─── 6. 전체 초기화 (통합) ───
  // [S224] async 변환 — confirm/alert 모두 sx 모달 await 처리
  async function resetAll(){
    try { if(typeof _sxVib === 'function') _sxVib(20); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    const _alrt = (typeof window !== 'undefined' && window.sxAlert) ? window.sxAlert : (m=>Promise.resolve(alert(m)));
    // [S1158] 예측 기록은 파일로 백업하지 않으면 복원 불가 — 문구에 명시한다.
    var _predWarn = '';
    try {
      if(typeof SXLedger !== 'undefined' && SXLedger.list){
        var _n = await SXLedger.list({ includeVoid: true }).then(function(a){
          return (a||[]).filter(function(r){ return r.human != null && !r.void; }).length;
        }).catch(function(){ return 0; });
        if(_n) _predWarn = '\n\n⚠ 직접 찍은 예측 ' + _n + '건도 삭제됩니다.\n파일로 내보내지 않았다면 되살릴 수 없습니다.';
      }
    } catch(_) {}
    // [S1167] Q&A 게시판도 같은 성격 — 직접 적은 질문은 캔들로 재계산할 수 없는 유일한 데이터다.
    try {
      if(typeof SXQA !== 'undefined' && SXQA.list){
        var _q = await SXQA.list({}).then(function(a){ return (a||[]).length; }).catch(function(){ return 0; });
        if(_q) _predWarn += '\n\n⚠ Q&A 게시판 질문 ' + _q + '건도 삭제됩니다.\n파일로 내보내지 않았다면 되살릴 수 없습니다.';
      }
    } catch(_) {}
    if(!await _conf('Signal X의 모든 데이터를 초기화하시겠습니까?\n(관심종목·종목풀·분석·BT·옵티마이저·설정 전부 삭제)' + _predWarn)) return;

    try {
      const toRemove = [];
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!k) continue;
        if(ALL_PREFIXES.some(p => k.startsWith(p))){
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
    } catch(e) {
      console.warn('[SXS.resetAll] err', e);
    }

    // [S1158] 예측 원장(IndexedDB)도 함께 지운다.
    //  ★원장은 localStorage가 아니라 IndexedDB에 있다(S1135). 여기서 빠지면
    //    "모든 데이터를 초기화"가 거짓이 되고, 초기화했다고 믿은 뒤에도 옛 예측이 남는다.
    try {
      if(typeof SXLedger !== 'undefined' && SXLedger.wipe){ await SXLedger.wipe(); }
    } catch(e) { console.warn('[SXS.resetAll] 원장 삭제 실패', e); }

    // [S1167] Q&A 게시판(별도 IndexedDB)도 함께. 여기서 빠지면 원장과 같은 거짓말이 반복된다.
    try {
      if(typeof SXQA !== 'undefined' && SXQA.wipe){ await SXQA.wipe(); }
    } catch(e) { console.warn('[SXS.resetAll] 게시판 삭제 실패', e); }

    // 메모리 캐시 전체 초기화
    cacheClear();

    try { if(typeof SX !== 'undefined' && SX._DASH_CACHE) SX._DASH_CACHE = null; } catch(_) {}
    try { if(typeof SX !== 'undefined' && SX.ALERTS) SX.ALERTS.length = 0; } catch(_) {}

    await _alrt('전체 데이터가 초기화되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
  }

  // ─── 외부 노출 (window.SXS) ───
  global.SXS = {
    // 공개 API
    analyze: analyze,
    formatSize: formatSize,
    renderDiagHTML: renderDiagHTML,
    showDiag: showDiag,
    clearCache: clearCache,
    resetAll: resetAll,
    removeKey: removeKey,           // [v1.1] 개별 키 삭제

    // [v1.1] 메모리 캐시 헬퍼 (ORACLE_* 마이그레이션용)
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    cacheHas: cacheHas,
    cacheClear: cacheClear,
    cacheStats: cacheStats,


    // 키 정의 노출
    CACHE_PREFIXES: CACHE_PREFIXES,
    EXCLUDE_FROM_CACHE_CLEAR: EXCLUDE_FROM_CACHE_CLEAR,
    ALL_PREFIXES: ALL_PREFIXES,

    // 내부 (모달 다시 그리기용 — UI 콜백)
    _toggleCategory: _toggleCategory,
    _refreshDiag: _refreshDiag,
  };

})(window);
