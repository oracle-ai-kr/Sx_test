// ════════════════════════════════════════════════════════════
//  SIGNAL X — BT Module v1.16  [S968 · build 20260711 cache-bust]
//  [S968] btRenderBasicResult에 실패분석·전략 라이프사이클 fold 추가 (종목분석 카드2에서 이관·순수 UI)
//  BT 누적저장(btHist*), BT fetch(Yahoo/Upbit), BT 실행(basic/cross/wf/dashboard),
//  페이퍼트레이딩, Bridge 연동(_btSaveBtResult/_btSaveBtCross)
//  의존: currentMarket, currentTF, _analTF, _analMode, currentAnalStock, WORKER_BASE,
//        _btCurrentStock, _isInWatchlist, searchResults (글로벌)
// ════════════════════════════════════════════════════════════
function _btTF(){ return (typeof _analTF !== 'undefined' && _analTF) ? _analTF : currentTF; }

// ============================================================
//  BT 유틸
// ============================================================
const BT_PROXY = WORKER_BASE;
const SX_BT_RESULT_KEY = 'SX_BT_RESULT';
const SX_BT_CROSS_KEY = 'SX_BT_CROSS';
const SX_PAPER_KEY = 'SX_PAPER_TRADES';
// S200: 수동 매매 시뮬 (Manual Trading) — 매수/매도 버튼으로 직접 기록, 자동 판정 없음
const SX_MANUAL_KEY = 'SX_MANUAL_TRADES';
const SX_MANUAL_SORT_KEY = 'SX_MANUAL_SORT';
// [S316] 매매시뮬레이션 통계 영역 펼침/접힘 상태 (기본: 접힘)
const SX_MANUAL_STATS_OPEN_KEY = 'SX_MANUAL_STATS_OPEN';

// S67: BT 누적 저장 키 (시장별 3개)
const SX_BT_HIST_KEYS = { kr:'SX_BT_HISTORY_kr', us:'SX_BT_HISTORY_us', coin:'SX_BT_HISTORY_coin' };
const BT_HIST_MAX = 30; // 종목당 최대 건수

// ────────────────────────────────────────────────────────────
// S110 Phase C+D: 관심종목 BT 캐시 인프라
// ────────────────────────────────────────────────────────────
//  워크플로:
//    1. 관심종목 ☆ 등록 시 → 백그라운드 600봉 BT 실행 → 캐시 저장
//    2. 교차검증/대시보드 실행 시 → 캐시 활용 (만료된 것만 새로 BT)
//    3. 7일 TTL — 오래된 캐시 자동 무효화
//
//  저장 구조:
//    SX_WATCH_BT_CACHE = {
//      "kr_005930": {
//        market: "kr", code: "005930", name: "삼성전자",
//        tf: "day", saved_at: 1705300000000,
//        btResult: { winRate, profitFactor, totalPnl, mdd, totalTrades,
//                    avgWin, avgLoss, maxConsecLoss, trades: [...] }
//      }, ...
//    }
const SX_WATCH_BT_CACHE_KEY = 'SX_WATCH_BT_CACHE';
const WATCH_BT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const WATCH_BT_AUTO_RUN = new Set(); // 중복 자동 BT 방지 (진행중 종목 추적)

// [S1007] CROSS_MIN_BARS 철거 — 교차 BT 제거로 소비처 소멸

// S162-fix2: 시장 식별자 정규화
//   관심종목에는 "KOSPI"/"KOSDAQ"/"ETF" 같은 세부 거래소명이 저장되지만
//   내부 로직(fetchCandlesExtended 등)은 "kr"/"coin"/"us"만 인식.
//   이 함수로 정규화해서 매칭 일관성 확보.
function _normalizeMarket(m){
  if(!m) return 'kr';
  const s = String(m).toLowerCase();
  if(s === 'kospi' || s === 'kosdaq' || s === 'etf' || s === 'konex' || s === 'kr') return 'kr';
  if(s === 'coin' || s === 'upbit' || s === 'binance') return 'coin';
  if(s === 'us' || s === 'nasdaq' || s === 'nyse' || s === 'amex') return 'us';
  return s; // 기본: 소문자 원본
}

function _watchBtKey(market, code){
  // S162-fix2: 시장 정규화 (KOSPI → kr) — 기존 캐시 키와 일관성
  const m = (typeof _normalizeMarket === 'function') ? _normalizeMarket(market) : (market || 'kr');
  return `${m}_${code}`;
}

// [S217] BT 목표 봉수 결정 — 사용자 환경에 따라 분기
//   배경: 분석탭은 KIS 활성 시 700봉(_analCount=500 + 자동확장 200), 미활성 시 600봉을 사용.
//        BT는 [S168] 이후 일률적으로 600봉 → KIS 사용자는 분석탭 700봉 vs BT 600봉 불일치
//        같은 종목, 같은 시점인데 서로 다른 데이터로 BT가 두 번 돌아 _btAction 정합 깨짐.
//   해결: BT도 KIS 활성 + 국내 시장이면 700봉으로 맞춰 정합 회복.
//        사용자별 environment 안에서는 분석탭/BT가 항상 같은 데이터 → 정합 보장.
//   적용 범위: 일봉/분봉. 주봉/월봉은 KIS 무관 400봉(데이터 자체가 길어 충분).
// ══ [S1205] 캔들 단발 취득 SSOT — 3·4단(200→400→600→700) 확장 전면 폐기 ══
//   〔이력〕 동일한 3·4단 코드가 **5벌** 복제돼 있었다: _runBtWithExtension · _fetchExtCandles ·
//           btRunBasic · btRunWf · sx_render _runEngineVerify. 야후 레이트리밋 시절(200봉씩 + 2초 대기) 설계.
//   〔지금 불필요 — 3시장 모두 단발 가능(실측)〕
//     KR  : 네이버 /naver/sise?start&end — 날짜범위 요청(dayRange=count×1.8), 페이징 개념 없음
//     COIN: 업비트 to= 커서 페이징이 btFetchCandlesCoin **내부**에 구현(pages=ceil(count/200))
//     US  : 야후 range=5y 한 번에 받고 slice(-count)
//   〔무엇이 나빴나〕 ①진입마다 대기 4~6초 ②길이 검사 없이 확정 → 400봉 고착(S1159 지적)
//                    ③분석탭/BT/카드가 서로 다른 캐시 → 같은 종목 중복 fetch
//   〔fetchRows600이 이미 해결〕 목표=_btTargetBars 동일 · 미달 시 시장별 우회 재fetch(S643)
//     · _len>=목표*0.95만 확정(S1159) · 'mkt|tf|code' 세션 캐시로 실험카드·캔들전이와 공유
//     · _snapMode 존중(S1080) → 측정 재현성이 BT/분석탭까지 자동 확장
//   폴백은 btFetchCandles **단발**(대기 없음). 3·4단은 어떤 경우에도 되살리지 않는다.
async function _btGetRows(stock, tf, targetCount, opts){
  opts = opts || {};
  const _mk = (typeof _normalizeMarket==='function') ? _normalizeMarket(currentMarket) : currentMarket;
  const _valid = (arr) => (typeof _sxIsValidCandle==='function' && Array.isArray(arr)) ? arr.filter(_sxIsValidCandle) : arr;
  // ① 세션 캐시가 목표 충족 → 즉시. [S1208] 5% 허용오차 — US 598/600처럼 정확히 못 채우는 시장이
  //   있고, 엄격 비교면 캐시를 매번 버리고 재fetch한다(fetchRows600의 _floor 기준과 통일·S1159).
  const _floorT = Math.floor(targetCount * 0.95);
  if(stock._lastAnalCandles && stock._lastAnalCandles.length >= _floorT){
    const v=_valid(stock._lastAnalCandles);
    if(v.length !== stock._lastAnalCandles.length) stock._lastAnalCandles=v;   // [S228] 무결성 유지
    return v.slice(-targetCount);
  }
  // ② fetchRows600 단발
  let rows=null;
  if(typeof window!=='undefined' && window.SXCandleBT && SXCandleBT.fetchRows600){
    try{ rows = await SXCandleBT.fetchRows600(_mk, tf, stock.code); }
    catch(e){ console.warn('[S1205] fetchRows600 예외', e); rows=null; }
  }
  // ③ 폴백 — 단발, 대기 없음
  if(!rows || !rows.length){
    if(!opts.quiet) console.warn('[S1205] fetchRows600 실패 → btFetchCandles 단발 폴백');
    try{ rows = await btFetchCandles(stock.code, (typeof _btIsCoin==='function'?_btIsCoin():currentMarket==='coin'), tf, targetCount); }
    catch(e2){ rows=null; }
  }
  if(!rows || !rows.length) return null;
  rows=_valid(rows);
  stock._lastAnalCandles = rows.slice();                                        // 양방향 공유(기존 원칙)
  stock._analCandlesExtendedStage = rows.length>=700?3:(rows.length>=600?2:(rows.length>=400?1:0));
  return rows.length > targetCount ? rows.slice(-targetCount) : rows;
}

function _btTargetBars(market, tf){
  if(tf === 'week' || tf === 'month') return 400;   // [S1240] 월 400 유지 판정 — S1231 "공급 벽" 실측은 워커 파서 사망 부산물(오진). 워커 내성 후 월 438봉 공급 실측(005930).
  // [S1230-P6] KIS ON 700 폐지 — 전 시장·전 경로 600 정합. 근거: KIS 일봉 공급이 5페이지=500 상한
  //   (무인자 골든 보존 · _btFetchKIS S1076 주석)이라 700은 달성 불가 목표였고, 그 격차가
  //   fetchRows600 floor 미달 → 우회 재fetch → stuck(500 고착)의 뿌리였다(이중로딩 M4). 일·주·월
  //   캔들 소스는 네이버 단일화(P6), KIS는 분봉·현재가·실시간 필터 전용 레이어로 역할 분리.
  return 600;
}

// 전체 캐시 로드
// [PATCH cache-version v3] _v 버전 체크 — BT 로직 변경 시 옛 결과 자동 무효화
//   저장 구조: { _v: 'v3-...', data: { kr_005930: {...}, ... } }
//   호환: 옛 구조(wrapper 없는 root dict)는 자동 무효화 (마이그레이션 비용 < 정확성 비용)
//   타이밍 안전: SX_DATA_SCHEMA_VERSION 미정의면 기존 동작 유지 (스크리너 외 호출 시)
function _watchBtLoadAll(){
  try{
    const raw = localStorage.getItem(SX_WATCH_BT_CACHE_KEY);
    if(!raw) return {};
    const obj = JSON.parse(raw);
    if(!obj || typeof obj !== 'object') return {};
    const _v = (typeof SX_DATA_SCHEMA_VERSION !== 'undefined') ? SX_DATA_SCHEMA_VERSION : null;
    // 새 구조 (_v + data wrapper)
    if(_v && obj._v === _v && obj.data && typeof obj.data === 'object'){
      return obj.data;
    }
    // 옛 구조 또는 버전 불일치 → 무효화 + 빈 dict 반환
    if(_v){
      try{ localStorage.removeItem(SX_WATCH_BT_CACHE_KEY); }catch(_){}
      return {};
    }
    // SX_DATA_SCHEMA_VERSION 미정의 환경 (구버전 호환): 옛 root dict 그대로 반환
    return obj;
  }catch(e){ return {}; }
}

// 전체 캐시 저장
// [PATCH cache-version v3] _v wrapper 부착
function _watchBtSaveAll(data){
  try{
    const _v = (typeof SX_DATA_SCHEMA_VERSION !== 'undefined') ? SX_DATA_SCHEMA_VERSION : null;
    const payload = _v ? { _v, _ts: Date.now(), data: data || {} } : (data || {});
    localStorage.setItem(SX_WATCH_BT_CACHE_KEY, JSON.stringify(payload));
  }catch(e){ console.warn('[S110] watch BT save err', e); }
}

// 특정 종목 캐시 조회 (만료 체크 포함)
//   반환: { market, code, name, tf, saved_at, btResult } or null
//   S162: strictBars=true 옵션 — 시장별 최소 봉수 미달 시 null 반환 (교차검증용)
function _watchBtGet(market, code, tf){   // [S1007] strictBars 파라미터 제거
  const all = _watchBtLoadAll();
  const key = _watchBtKey(market, code); // 정규화된 키 (예: kr_005380)
  let entry = all[key];
  // S162-fix2: fallback — 기존 구버전 캐시(KOSPI_005380 등)도 조회
  //   새 키로 없으면 원본 market 문자열로 다시 시도
  if(!entry && market && market !== _normalizeMarket(market)){
    const legacyKey = `${market}_${code}`;
    if(all[legacyKey]){
      entry = all[legacyKey];
      console.log(`[S162-fix2] 구버전 캐시 키 사용: ${legacyKey} → ${key} (다음 저장 시 자동 이관)`);
    }
  }
  if(!entry) return null;
  // TF 일치 체크
  if(tf && entry.tf !== tf) return null;
  // TTL 체크 (7일)
  if(!entry.saved_at || (Date.now() - entry.saved_at > WATCH_BT_TTL_MS)) return null;
  // [BT-실시간 미러링] 레짐 보정 적용 버전 체크
  //   2026-05 이전 캐시는 보정 미적용 결과 → 분석엔진과 어긋남 → 무효화
  //   savedRegimeMirror 필드 없으면 옛 캐시로 간주
  if(!entry.btResult?._regimeMirror){
    console.log(`[regime-mirror] 옛 캐시 (보정 미적용) — ${entry.name||code} 무효화`);
    return null;
  }
  // [S1006] 게이트 해시 체크 철거 · [S1007] strictBars 봉수 체크 철거 — 유일 소비처였던 교차 BT 제거
  return entry;
}

// [S1007] _watchBtGetReason 철거 — 교차 BT 전용이었음

// 특정 종목 캐시 저장
function _watchBtSet(stock, btResult, tf){
  const all = _watchBtLoadAll();
  const market = stock.market || stock._mkt || currentMarket;
  const key = _watchBtKey(market, stock.code); // 정규화된 키
  // S162-fix2: 구버전 키 삭제 (같은 종목이 두 키로 저장되는 것 방지)
  if(market && market !== _normalizeMarket(market)){
    const legacyKey = `${market}_${stock.code}`;
    if(legacyKey !== key && all[legacyKey]){
      delete all[legacyKey];
      console.log(`[S162-fix2] 구버전 키 삭제: ${legacyKey} → ${key}`);
    }
  }
  // S161: 현재 게이트 해시 생성 (저장 당시의 게이트 설정 스냅샷)
  all[key] = {
    market: market,
    code: stock.code,
    name: stock.name || stock.code,
    tf: tf || _btTF(),
    saved_at: Date.now(),
    btResult: {
      winRate: btResult.winRate,
      profitFactor: btResult.profitFactor,
      totalPnl: btResult.totalPnl,
      mdd: btResult.mdd,
      totalTrades: btResult.totalTrades,
      avgWin: btResult.avgWin || 0,
      avgLoss: btResult.avgLoss || 0,
      maxConsecLoss: btResult.maxConsecLoss || 0,
      rowsLength: btResult.rowsLength || 0, // S110 fix4: 사용된 봉수 (🔴/🔵/🟢 배지용)
      _regimeMirror: true, // [BT-실시간 미러링] 봉별 보정 적용된 BT 결과임을 표시 — 옛 캐시와 구분
      trades: (btResult.trades || []).map(t => ({
        entry: t.entry, exit: t.exit, pnl: t.pnl, type: t.type, bars: t.bars,
        entryDate: t.entryDate || '', exitDate: t.exitDate || ''
      })),
    }
  };
  _watchBtSaveAll(all);
  console.log(`[S110-watchBt] ✅ 캐시 저장: ${stock.name||stock.code} (${tf||_btTF()}, 거래 ${btResult.totalTrades}, ${btResult.rowsLength||0}봉)`);
}

// 특정 종목 캐시 삭제 (관심 해제 시)
function _watchBtDelete(market, code){
  const all = _watchBtLoadAll();
  const key = _watchBtKey(market, code);
  if(all[key]){
    delete all[key];
    _watchBtSaveAll(all);
    console.log(`[S110-watchBt] 🗑 캐시 삭제: ${code}`);
  }
}

// ────────────────────────────────────────────────────────────
// S110 Phase C+D: 재사용 가능한 BT 실행 헬퍼 (UI 없음)
// ────────────────────────────────────────────────────────────
//  btRunBasic의 3단계 확장 로직 추출 — 백그라운드 자동 BT 및 교차/대시보드 공용
//  반환: { ok: true, result, rows } or { ok: false, error }
//  stock: { code, name, market } — stock._lastAnalCandles 있으면 재사용
//  tf: '_btTF()' 기본값
//  quiet: true면 콘솔 로그만 (UI 상태 업데이트 없음)

// ────────────────────────────────────────────────────────────
// [S428] BT 캔들 단일소스화 — 봉수 흔들림(400↔600) 방지
// ────────────────────────────────────────────────────────────
//  세 경로(_runBtWithExtension / _fetchExtCandles / sx_render.js의 _runEngineVerify)가 공유 호출.
//  rows 확정 직후 적용해 stock._lastAnalCandles를 단일 진실원천(single source of truth)으로 유지.
//   · 새 rows가 목표 미달 + 기존 캐시가 더 길고 끝봉이 최신 아님 → 기존 재사용 (퇴보 금지)
//   · 더 길 때만 캐시 갱신 (경로 A의 slice된 rows로 더 긴 원본을 덮지 않음)
//   · 끝봉이 더 최신(새 거래일)이면 봉수 적어도 갱신 허용
//  → 한 번 600봉 확보 시 어느 탭에서 BT를 돌려도 동일 캔들 재사용 → 봉수·데이터 동시 통일.
//  소스/포맷은 이미 일관(fetchCandlesExtended=screener.html 단일, btFetchCandles=bt.js 단일, _btNormalizeRows 정규화).
function _mergeBtCandles(stock, rows, targetCount, tag){
  try{
    const tc = targetCount || (rows ? rows.length : 0);
    const prev = (stock && Array.isArray(stock._lastAnalCandles)) ? stock._lastAnalCandles : null;
    if(!rows || !rows.length){
      return (prev && prev.length) ? prev.slice(-tc) : rows;
    }
    // 퇴보 방지: 목표 미달 + 기존이 더 길고 끝봉이 최신 아님 → 더 긴 기존 재사용
    if(rows.length < tc && prev && prev.length > rows.length){
      const _nl = rows[rows.length-1], _pl = prev[prev.length-1];
      const _nd = (_nl && (_nl.date || _nl.t)) || '';
      const _pd = (_pl && (_pl.date || _pl.t)) || '';
      if(_nd <= _pd){
        console.log(`[S428] ${(stock&&stock.code)||''} 봉수 퇴보 방지: 새 ${rows.length} < 기존 ${prev.length}봉 (끝봉 ${_nd}≤${_pd}) → 기존 재사용 (${tag})`);
        return prev.slice(-tc);
      }
    }
    // 단일소스 갱신 — 더 길거나(slice된 rows로 더 긴 원본 덮어쓰기 방지), 끝봉이 더 최신(새 거래일)이면 갱신
    const _newer = (function(){
      if(!prev || !prev.length) return true;
      const _nl = rows[rows.length-1], _pl = prev[prev.length-1];
      return (((_nl && (_nl.date || _nl.t)) || '') > ((_pl && (_pl.date || _pl.t)) || ''));
    })();
    if(!prev || rows.length > prev.length || _newer){
      stock._lastAnalCandles = rows.slice();
    }
    return rows.slice(-tc);
  }catch(e){
    console.warn('[S428] _mergeBtCandles 예외:', e && (e.message||e));
    return rows;
  }
}
if(typeof window !== 'undefined') window._mergeBtCandles = _mergeBtCandles;

async function _runBtWithExtension(stock, tf, quiet){
  try{
    const _tf = tf || _btTF();
    // S162-fix2: 시장 정규화 (KOSPI/KOSDAQ/ETF → kr)
    const _mktRaw = stock.market || stock._mkt || currentMarket;
    const _mkt = (typeof _normalizeMarket === 'function') ? _normalizeMarket(_mktRaw) : _mktRaw;
    // [S168 600봉 통일] 미국(us) 시장 추가 — fetchCandlesExtended가 period1/period2 분할 호출 지원
    // [S217] KIS 활성 + 국내 시장이면 700봉 (분석탭과 정합)
    const _isExtSupported = (_mkt === 'coin' || _mkt === 'kr' || _mkt === 'us');
    const _targetCount = _btTargetBars(_mkt, _tf);
    const _isCoin = (_mkt === 'coin');
    if(_mktRaw !== _mkt){
      console.log(`[S162-fix2] ${stock.name||stock.code} 시장 정규화: ${_mktRaw} → ${_mkt}`);
    }
    let rows = null;

    // 경로 A: 이미 확장된 캐시 재사용
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount);
      if(!quiet) console.log(`[S110-runBt] 캐시 재사용: ${rows.length}봉`);
    }
    // [S1230-P4] 경로B(부분 확장 · fetchCandlesExtended) 삭제 — S1207이 분석탭 첫 fetch를 목표봉수로
    //   올린 뒤 "부분 캐시(200~400)" 전제가 소멸(분석 경유 종목은 경로A가, 미경유는 아래 _btGetRows가
    //   담당). 확장 이음새의 소스 혼재 가능성도 함께 제거 — S1205(3·4단 폐기)의 잔여 정리.
    else {   // [S1205] 3·4단 폐기 → _btGetRows 단발
      rows = await _btGetRows(stock, _tf, _targetCount, {quiet:true});
      if(!rows) return { ok:false, error:'캔들 로드 실패' };
    }

    if(!rows || rows.length === 0) return { ok:false, error:'캔들 데이터 수집 실패' };

    // [S428] 단일소스화 가드 — 부분봉수 퇴보 방지 (세 경로 공유: runBt/fetchExt/engineVerify)
    rows = _mergeBtCandles(stock, rows, _targetCount, 'runBt');

    // S163-diag: 교차검증/보강의 rows가 분석탭과 다른지 진단
    //   첫봉/마지막봉의 OHLCV + 전체 봉수 + 경로 식별 로그
    //   분석탭의 _lastAnalCandles와 비교해서 데이터 소스 차이 확인용
    try{
      const _first = rows[0], _last = rows[rows.length-1];
      const _fDate = _first.date || _first.t || '?';
      const _lDate = _last.date || _last.t || '?';
      const _fClose = _first.close ?? _first.c ?? '?';
      const _lClose = _last.close ?? _last.c ?? '?';
      console.log(`[S163-diag] ${stock.name||stock.code} rows: ${rows.length}봉 · 첫=${_fDate}(C${_fClose}) · 끝=${_lDate}(C${_lClose})`);
      // 현재 분석탭 _lastAnalCandles와 비교
      if(typeof currentAnalStock !== 'undefined' && currentAnalStock && currentAnalStock.code === stock.code && Array.isArray(currentAnalStock._lastAnalCandles)){
        const _ana = currentAnalStock._lastAnalCandles;
        const _aF = _ana[0], _aL = _ana[_ana.length-1];
        const _aFDate = _aF?.date || _aF?.t || '?';
        const _aLDate = _aL?.date || _aL?.t || '?';
        const _aFClose = _aF?.close ?? _aF?.c ?? '?';
        const _aLClose = _aL?.close ?? _aL?.c ?? '?';
        const _sameFirst = _fDate === _aFDate && _fClose === _aFClose;
        const _sameLast = _lDate === _aLDate && _lClose === _aLClose;
        console.log(`[S163-diag] ${stock.name||stock.code} vs 분석탭 _lastAnalCandles(${_ana.length}봉): 첫봉${_sameFirst?'=':'≠'}${_aFDate}(C${_aFClose}) · 끝봉${_sameLast?'=':'≠'}${_aLDate}(C${_aLClose})`);
      }
    }catch(_){}

    const params = {};   // [S1237] 死파라미터 — 레시피-BT(S1018)는 읽지 않음(진입=votes·청산=코어고정)
    const opts = btGetOpts();
    const r = sxRunBtEngine(rows, _tf, params, opts);

    if(r.error) return { ok:false, error:r.error, shortage:r.shortage };

    // S110 fix4: 결과에 실제 사용된 봉수 포함 (투명성 — 🔴/🔵/🟢 표시용)
    r.rowsLength = rows.length;
    // [S544] 레짐별 성과 버킷 (진입 봉의 큰 추세로 거래 분류 — 표시 전용, 엔진/전략 무관)
    try { r._regimeBuckets = _btRegimeBreakdown(rows, r.trades); } catch(_rgE){}

    return { ok:true, result:r, rows:rows };
  }catch(e){
    console.error('[S110-runBt] 예외:', e);
    return { ok:false, error: e.message || String(e) };
  }
}

// ────────────────────────────────────────────────────────────
// S113: 캔들만 확장 수집 (BT 없이) — 옵티마이저/다른 모듈용
// ────────────────────────────────────────────────────────────
//  _runBtWithExtension의 캔들 수집 부분만 추출한 헬퍼
//  BT 실행 없이 600봉(일봉) 또는 400봉(주/월봉) rows 배열만 반환
//  옵티마이저처럼 "캔들만 필요한" 모듈에서 사용
//
//  경로 A/B/C/D 모두 지원 (양방향 공유):
//    A: stock._lastAnalCandles 600봉 있으면 즉시 재사용
//    B: 부분 확장 (200 or 400봉 → 600봉)
//    C: 새 3단계 확장 (200 → 400 → 600)
//    D: 시장 미지원 (해외) — 단일 fetch
//
//  KV 자동 저장:
//    각 fetchCandlesExtended/btFetchCandles 호출이 Workers 경유
//    → 응답 성공 시 Workers가 자동으로 KV put (30일 TTL)
//    → 분석탭/단일검증/옵티마이저 모두 같은 KV 공유
//
//
//  반환: { ok:boolean, rows?:Array, error?:string }
// ────────────────────────────────────────────────────────────
async function _fetchExtCandles(stock, tf, quiet){
  try{
    const _tf = tf || _btTF();
    // S162-fix2: 시장 정규화
    const _mktRaw = stock.market || stock._mkt || currentMarket;
    const _mkt = (typeof _normalizeMarket === 'function') ? _normalizeMarket(_mktRaw) : _mktRaw;
    // [S168 600봉 통일] 미국(us) 시장 추가
    // [S217] KIS 활성 + 국내 시장이면 700봉
    const _isExtSupported = (_mkt === 'coin' || _mkt === 'kr' || _mkt === 'us');
    const _targetCount = _btTargetBars(_mkt, _tf);
    const _isCoin = (_mkt === 'coin');
    let rows = null;

    // 경로 A: 이미 확장된 세션 캐시 재사용 (즉시)
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount);
      if(!quiet) console.log(`[S113-ext] 캐시 재사용: ${rows.length}봉 (${stock.code})`);
    }
    // [S1230-P4] 경로B(부분 확장 · fetchCandlesExtended) 삭제 — S1207이 분석탭 첫 fetch를 목표봉수로
    //   올린 뒤 "부분 캐시(200~400)" 전제가 소멸(분석 경유 종목은 경로A가, 미경유는 아래 _btGetRows가
    //   담당). 확장 이음새의 소스 혼재 가능성도 함께 제거 — S1205(3·4단 폐기)의 잔여 정리.
    else {   // [S1205] 3·4단 폐기 → _btGetRows 단발
      rows = await _btGetRows(stock, _tf, _targetCount, {quiet:quiet});
      if(!rows) return null;
      if(!quiet) console.log(`[S113-ext] 3단계 완료: ${rows.length}봉 (${stock.code})`);
    }

    if(!rows || rows.length === 0) return { ok:false, error:'캔들 데이터 수집 실패' };
    rows = _mergeBtCandles(stock, rows, _targetCount, 'fetchExt');
    return { ok:true, rows:rows };
  }catch(e){
    console.error('[S113-ext] 예외:', e);
    return { ok:false, error: e.message || String(e) };
  }
}

// ────────────────────────────────────────────────────────────
// S110 Phase C+D: 관심 등록 시 백그라운드 자동 BT
// ────────────────────────────────────────────────────────────
//  관심 ☆ 등록 즉시 silent BT 실행 → 캐시 저장
//  실패 시 silent (UI 방해 X)
//  TF: 일봉 기본 (가장 범용)
async function _autoBtOnWatchlistAdd(stock){
  if(!stock || !stock.code) return;
  const market = stock.market || stock._mkt || currentMarket;
  const key = _watchBtKey(market, stock.code);

  // 중복 실행 방지
  if(WATCH_BT_AUTO_RUN.has(key)){
    console.log(`[S110-autoBt] 이미 진행중: ${stock.code} — skip`);
    return;
  }

  // 이미 최근 캐시 있으면 skip (7일 이내)
  const existing = _watchBtGet(market, stock.code, 'day');
  if(existing){
    console.log(`[S110-autoBt] 최근 캐시 존재(${Math.round((Date.now()-existing.saved_at)/86400000)}일 전): ${stock.code} — skip`);
    return;
  }

  WATCH_BT_AUTO_RUN.add(key);
  console.log(`[S110-autoBt] ★ 백그라운드 BT 시작: ${stock.name||stock.code} (일봉 600봉)`);

  try{
    const r = await _runBtWithExtension(stock, 'day', true);
    if(r.ok && r.result && r.result.totalTrades > 0){
      _watchBtSet(stock, r.result, 'day');
    } else {
      console.warn(`[S110-autoBt] ${stock.code} BT 실패 또는 거래 0건:`, r.error || 'unknown');
    }
  }catch(e){
    console.error(`[S110-autoBt] ${stock.code} 예외:`, e);
  }finally{
    WATCH_BT_AUTO_RUN.delete(key);
  }
}
// ────────────────────────────────────────────────────────────

// S67: BT 누적 저장 — 로드/저장
function _btHistLoad(market){
  try{ return JSON.parse(localStorage.getItem(SX_BT_HIST_KEYS[market]||SX_BT_HIST_KEYS.kr)||'{}'); }catch(e){ return {}; }
}
function _btHistSave(market, data){
  try { localStorage.setItem(SX_BT_HIST_KEYS[market]||SX_BT_HIST_KEYS.kr, JSON.stringify(data)); } catch(_){}
}

// S67: 누적 저장 실행 (현재 BT trades → entryDate 기준 중복제거 → 30건 상한)
function btHistAccumulate(){
  const stock = _btCurrentStock();
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }
  if(!_isInWatchlist(stock.code)){ toast('관심종목 등록 시 활성화됩니다'); return; }
  // S99-5: 항상 일봉 기준 누적 — 다른 TF에서 눌러도 일봉 BT 결과 사용
  let btR = null;
  // 1. _analTFCache에서 일봉 BT 결과 우선 조회
  if(typeof _analTFCache !== 'undefined' && _analTFCache && _analTFCache['day'] && _analTFCache['day'].btResult){
    btR = _analTFCache['day'].btResult;
  }
  // 2. 현재 TF가 일봉이면 stock._btResult 사용
  if(!btR && _btTF() === 'day'){
    btR = stock._btResult || null;
  }
  // 3. localStorage 저장된 BT 결과도 확인
  if(!btR){
    try{
      const raw = localStorage.getItem(SX_BT_RESULT_KEY);
      if(raw){ const d = JSON.parse(raw); if(d && d.ticker===stock.code && d.trades) btR = d; }
    }catch(e){}
  }
  if(!btR || !btR.trades || !btR.trades.length){ toast('일봉 백테스트 결과가 없습니다 — 일봉에서 BT 실행 후 누적하세요'); return; }
  const market = stock._mkt || stock.market || currentMarket;
  const hist = _btHistLoad(market);
  let arr = hist[stock.code] || [];
  const now = Date.now();
  // 현재 BT trades → 누적 형식으로 변환
  const newTrades = btR.trades.map(t=>({
    entryDate: t.entryDate || t.date || '',
    exitDate: t.exitDate || '',
    direction: t.type || 'long',
    entryPrice: t.entry || 0,
    exitPrice: t.exit || 0,
    pnl: t.pnl || 0,
    // [PATCH-7] pnl===0을 'win'으로 집계하지 않고 'flat'으로 분리 (승률 과대평가 방지)
    //   _btHistCalcStats는 result==='win'을 카운트하므로, 정확히 0인 거래는 승률 계산에서 제외됨
    result: ((t.pnl||0) > 0) ? 'win' : ((t.pnl||0) < 0 ? 'loss' : 'flat'),
    ts: now,
  })).filter(t=>t.entryDate);
  // 진입일 기준 중복 제거 (최신 덮어쓰기)
  const entryMap = new Map();
  arr.forEach(t=>entryMap.set(t.entryDate, t));
  newTrades.forEach(t=>entryMap.set(t.entryDate, t));
  arr = Array.from(entryMap.values());
  // ts 기준 정렬 → 30건 상한 (오래된 것부터 삭제)
  arr.sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(arr.length > BT_HIST_MAX) arr = arr.slice(arr.length - BT_HIST_MAX);
  hist[stock.code] = arr;
  _btHistSave(market, hist);
  const tfNote = (_btTF() !== 'day') ? ' (일봉 기준)' : '';
  toast(`✅ ${stock.name||stock.code} 검증결과 ${newTrades.length}건 누적${tfNote} (총 ${arr.length}/${BT_HIST_MAX})`);
  // UI 갱신
  _btHistUpdateUI(stock);
}

// S67: 누적 데이터 삭제
// [S224] async 변환 — sxConfirm 사용

// S67: 누적 기반 통계 계산
function _btHistCalcStats(arr){
  if(!arr || !arr.length) return null;
  const n = arr.length;
  const wins = arr.filter(t=>t.result==='win').length;
  const wr = n>0 ? Math.round(wins/n*100) : 0;
  const pnls = arr.map(t=>t.pnl||0);
  const totalPnl = Math.round(pnls.reduce((a,b)=>a+b,0)*100)/100;
  const avgPnl = Math.round(totalPnl/n*100)/100;
  // MDD
  let peak=0, dd=0, mdd=0;
  let cum=0;
  pnls.forEach(p=>{ cum+=p; if(cum>peak) peak=cum; dd=peak-cum; if(dd>mdd) mdd=dd; });
  mdd = Math.round(mdd*100)/100;
  // PF
  const grossWin = pnls.filter(p=>p>0).reduce((a,b)=>a+b,0);
  const grossLoss = Math.abs(pnls.filter(p=>p<0).reduce((a,b)=>a+b,0));
  const pf = grossLoss>0 ? Math.round(grossWin/grossLoss*100)/100 : grossWin>0?99:0;
  return { n, wr, totalPnl, avgPnl, mdd, pf };
}

// [S544] 메인 BT 레짐 분류 — 큰 추세 기준 (SMA 20/60/120/200). 20×200(SMA)=강세/약세 분기선, 60>120>200 정배열=불장, 20MA가 200MA 근처(±1.5%)=크로스 부근=횡보. 봉 부족 TF는 200→120→60 폴백. 표시 전용·예측로직 무관.
function _btRegimeAt(rows, idx){
  // [S1212] SSOT 위임 — 원본은 sx_exec_core.regimeAt로 이동(설계원칙1). 아래 구 본문은 코어 미로드 시 폴백(동작 동일).
  try{ var _EC=(typeof SXExecCore!=='undefined')?SXExecCore:(typeof window!=='undefined'?window.SXExecCore:null); if(_EC&&_EC.regimeAt) return _EC.regimeAt(rows, idx); }catch(_e){}
  if(!rows || idx < 30) return 'side';
  function sma(len){ if(idx < len-1) return null; var s=0,k,c; for(k=idx-len+1;k<=idx;k++){ c=+(rows[k].close!=null?rows[k].close:rows[k].c); s+=c; } return s/len; }
  var ma20 = sma(20);
  var maLong = sma(200), longFull = (maLong != null);
  if(maLong == null) maLong = sma(120);
  if(maLong == null) maLong = sma(60);
  if(ma20 == null || maLong == null || maLong === 0) return 'side';
  var distPct = (ma20 - maLong) / maLong * 100;
  if(Math.abs(distPct) < 1.5) return 'side';            // 20×200 크로스 부근 = 횡보(전환 구간)
  if(distPct > 0){                                      // 20MA > 장기선 = 강세 측(골든크로스 위)
    if(longFull){ var ma60 = sma(60), ma120 = sma(120); if(ma60 != null && ma120 != null && ma60 > ma120 && ma120 > maLong) return 'bull'; } // 60>120>200 정배열=불장
    return 'up';                                        // 상승장
  }
  return 'down';                                        // 하락장(데드크로스 아래)
}
// [S544] 거래를 진입 봉 레짐으로 버킷팅 → 레짐별 통계(_btHistCalcStats 재사용). 현재 파라미터 기준.
function _btRegimeBreakdown(rows, trades){
  if(!Array.isArray(rows) || !Array.isArray(trades) || !trades.length) return null;
  var B = { bull:[], up:[], side:[], down:[], crash:[] };   // [S1217]
  trades.forEach(function(t){
    if(t.entryIdx == null || t.type === 'OPEN') return;   // [S1220] 미청산 제외 — 진입원별·칸·청산사유 분해와 기준 통일(구: 레짐표만 OPEN 포함 → 삼성 분할 6건 vs 완성 5건 불일치)
    var rg = (typeof SXExecCore!=='undefined'&&SXExecCore.regime5At)?SXExecCore.regime5At(rows, t.entryIdx):_btRegimeAt(rows, t.entryIdx);   // [S1217] 5국면(폴백=v1)
    (B[rg] || B.side).push({ result:(t.pnl>0?'win':(t.pnl<0?'loss':'flat')), pnl:t.pnl||0 });
  });
  var out = {}, any = false;
  ['bull','up','side','down','crash'].forEach(function(rg){ var s=_btHistCalcStats(B[rg]); if(s){ out[rg]=s; any=true; } });   // [S1217]
  return any ? out : null;
}
// [S1201] 진입원별 분해 렌더 — 시즌2 3원(recipe/bullVol/v2)이 각각 몇 건을 잡고 얼마를 벌었나.
//   합계와 갈라 보는 이유: v2는 in-sample이라 총계에 섞이면 BT 전체가 낙관 편향된다.
function _btRenderSrcBreak(sb, on, trades){   // [S1214] +trades=청산사유 분해용(하위호환: 미전달 시 청산 블록 생략)
  if(!sb) return '';
  const ks=['recipe','bullVol','v2','maCross'].filter(k=>sb[k]&&sb[k].n>0);   // [S1210]
  if(!ks.length) return '';
  const rows=ks.map(k=>{ const m=_BT_SRC_META[k], d=sb[k];
    const pc=d.pnl>=0?'#22c55e':'#e8365a', wc=d.win>=60?'#22c55e':(d.win>=40?'#3b82f6':'#f97316');
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-top:1px solid var(--border)">
      <span style="font-size:10.5px;font-weight:800;color:${m.c};min-width:96px">${m.ic} ${m.lbl}</span>
      <span style="font-size:10px;color:var(--text2)">${d.n}건</span>
      <span style="font-size:10px;font-weight:700;color:${wc}">승률 ${d.win}%</span>
      <span style="font-size:10px;color:var(--text3)">평균 ${d.avg>=0?'+':''}${d.avg}%</span>
      <span style="margin-left:auto;font-size:11px;font-weight:800;color:${pc}">${d.pnl>=0?'+':''}${d.pnl}%</span>
    </div>`; }).join('');
  // [S1214] 🚪 청산사유 분해 — 출구는 진입원 공통(4종 칩 OR + 게이트·시즌2 S1393 복제)이라
  //   "청산원"은 전략이 아니라 사유. 합산 + 진입원×사유 크로스(예: M의 큰 손실이 ATR손절인지 MA데드 휩쏘인지).
  let xrHtml='';
  {
    const _XR={'ATR손절':{lbl:'ATR손절',c:'#e8365a'},'ATR트레일':{lbl:'ATR트레일',c:'#22c55e'},'MA5x20데드':{lbl:'MA데드',c:'#3b82f6'},'칸fake':{lbl:'🧩칸F',c:'#b45309'},'칸down':{lbl:'⛔칸D',c:'#dc2626'},'보유상한':{lbl:'상한',c:'#f97316'}};   // [S1397]
    const _xk=x=>_XR[x]?x:'기타';
    const tcl=(trades||[]).filter(t=>t&&t.type!=='OPEN');
    if(tcl.length){
      const SLx={recipe:'레',bullVol:'B',v2:'V',maCross:'M'};
      const all={}, by={};
      tcl.forEach(t=>{ const x=_xk(t.exitReason||'기타');
        const a=all[x]||(all[x]={n:0,sum:0}); a.n++; a.sum+=t.pnl;
        const k=SLx[t.src]?t.src:'recipe'; const o=by[k]||(by[k]={}); const sv=o[x]||(o[x]={n:0,sum:0}); sv.n++; sv.sum+=t.pnl; });
      const XORD=['MA5x20데드','칸fake','칸down','보유상한','ATR손절','ATR트레일','기타'];   // [S1397] 시즌2 우선순위 순 표기
      const fmt=(x,sv)=>{ const m=_XR[x]||{lbl:'기타',c:'var(--text3)'}; const avg=sv.sum/sv.n;
        return `<span style="color:${m.c};font-weight:700">${m.lbl}</span> ${sv.n}건·${avg>=0?'+':''}${avg.toFixed(2)}`; };
      const allSeg=XORD.filter(x=>all[x]).map(x=>fmt(x,all[x])).join(' <span style="color:var(--text3)">·</span> ');
      let srcSeg='';
      ['recipe','bullVol','v2','maCross'].filter(k=>by[k]).forEach(k=>{ const m=_BT_SRC_META[k];
        const seg=XORD.filter(x=>by[k][x]).map(x=>fmt(x,by[k][x])).join(' <span style="color:var(--text3)">·</span> ');
        srcSeg+=`<div style="font-size:9.5px;color:var(--text2);padding:2.5px 0"><span style="color:${m.c};font-weight:800">${SLx[k]}</span> ${seg}</div>`;
      });
      const openN=(trades||[]).filter(t=>t&&t.type==='OPEN').length;
      let gateLine='', atrLine='';   // [S1397] S1215/16 각인 표시 철거 — 옵션 소멸(3×3판 게이트가 대체)
      xrHtml=`<div style="margin-top:6px;padding-top:5px;border-top:1px solid var(--border)">
        <div style="font-size:9.5px;font-weight:800;color:var(--text)">🚪 청산사유 <span style="font-weight:500;color:var(--text3)">(진입원 공통 출구 — ±=건당 평균%)</span></div>
        <div style="font-size:9.5px;color:var(--text2);padding:2.5px 0"><b style="color:var(--text)">합산</b> ${allSeg}${openN?` <span style="color:var(--text3)">· 미청산 ${openN} 제외</span>`:''}</div>
        ${gateLine}
        ${atrLine}
        ${srcSeg}
        <div style="font-size:8.5px;color:var(--text3);line-height:1.5;margin-top:3px">출구=4종 칩 OR — MA데드(유예10·완성봉) / 이중ATR(진입−2× · 고점−3×) / 칸fake·칸down(전일 봉 신호·1봉 지연) + N일·⬛게이트 — 시즌2 워커(S1393) 복제·진입원 무관 공통. 손절 평균이 유독 크면 그 진입원은 변동 확대기에 들어간다는 뜻(M 크로스 시점 특성 후보).</div>
      </div>`;
    }
  }
  const offs=['recipe','bullVol','v2','maCross'].filter(k=>on&&on[k]===false).map(k=>_BT_SRC_META[k].lbl);   // [S1397] 크로스 기본 ON 편입 — 끄면 '꺼둔' 표기
  return `<div class="bt-card" style="margin-top:8px">
    <div class="bt-card-title">🧬 진입원별 분해 <span style="font-size:10px;font-weight:500;color:var(--text3)">(상호배타 recipe&gt;bullVol&gt;크로스&gt;v2 · 시즌2 정합 S1397)</span></div>
    ${rows}
    ${xrHtml}
    ${sb.v2&&sb.v2.n>0?'<div style="font-size:9px;color:#b45309;line-height:1.55;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">⚠ <b>V2 어휘규칙은 발굴풀 in-sample</b>(SX_CELL_DATA.meta.caveat). 이 BT는 규칙을 만든 과거를 다시 도는 것이라 v2 성과는 <b>검증이 아니라 재현</b>이다. 정직한 판정은 시즌2 paper(전진검증=시간축 OOS)의 [V2] 가계부.</div>':''}
    ${offs.length?`<div style="font-size:9px;color:var(--text3);margin-top:4px">· 꺼둔 진입원: ${offs.join(' · ')}</div>`:''}
  </div>`;
}


// [S1210] 진입원×칸 분해 — "어느 칸에서 어느 진입원이 강한가"를 보는 정찰 표면.
//   목적: ①MA5×20 후보가 유달리 강한 칸 찾기(상승추세 가설) ②3원 구멍칸 실측 ③칸 조건부 라우팅(대체 정책) 근거 수집.
//   칸 = 진입 신호봉 기준(ma51020 단기 × maAlignLT 장기 — 시즌2 S1209 각인·3×3 SSOT와 동일 축). OPEN(미청산) 제외.
//   ★단일 종목 n은 작다 — 여기서 보이는 건 "현 기준하 보임"이고, 채택 판정은 풀 단위 PREREG 측정에서.
const _BT_CELL_LBL=(typeof SXExecCore!=='undefined'&&SXExecCore.STATE_VOCAB)?SXExecCore.STATE_VOCAB.cell:{'bull|bull':'추가상승','bull|bear':'기술적반등','bull|mixed':'상승세전환','bear|bull':'되돌림','bear|bear':'추가하락','bear|mixed':'하락세전환','mixed|bull':'눌림목','mixed|bear':'바닥확인','mixed|mixed':'추세중립'};   // [S1217] SSOT 파생(폴백=동일 리터럴)
function _btRenderCellSrcGrid(trades){
  const ts=(trades||[]).filter(t=>t&&t.type!=='OPEN');
  if(!ts.length) return '';
  const SL={recipe:'레',bullVol:'B',v2:'V',maCross:'M'};
  const cells={}; let unrec=0;
  ts.forEach(t=>{
    const c=t.cell;
    if(!c||!_BT_CELL_LBL[c]){ unrec++; return; }
    const o=cells[c]||(cells[c]={n:0,src:{}});
    o.n++;
    const k=SL[t.src]?t.src:'recipe';
    const sv=o.src[k]||(o.src[k]={n:0,w:0,sum:0});
    sv.n++; if(t.pnl>0)sv.w++; sv.sum+=t.pnl;
  });
  if(!Object.keys(cells).length){
    return `<div class="bt-card" style="margin-top:8px"><div class="bt-card-title">🧩 진입원×칸 분해 <span style="font-size:10px;font-weight:500;color:var(--text3)">(S1210)</span></div><div style="font-size:10px;color:var(--text3)">칸 판정 가능한 거래 없음(칸 미기록 ${unrec}건 — 초기 봉 부족 등)</div></div>`;
  }
  const SH=[['bull','강세'],['bear','약세'],['mixed','중립']], LG=[['bull','상승세'],['bear','하락세'],['mixed','혼조세']];   // [S1217] 세/장 분리
  let g='<table style="width:100%;border-collapse:collapse;margin-top:4px;table-layout:fixed">';
  g+='<tr><td style="width:30px"></td>'; LG.forEach(l=>{ g+=`<td style="text-align:center;font-size:9.5px;color:var(--text3);padding:2px;font-weight:700">${l[1]}</td>`; }); g+='</tr>';
  SH.forEach(sh=>{
    g+=`<tr><td style="font-size:9.5px;color:var(--text3);font-weight:700">${sh[1]}</td>`;
    LG.forEach(lg=>{
      const ck=sh[0]+'|'+lg[0], c=cells[ck];
      let inner=`<div style="font-size:8px;color:var(--text3)">${_BT_CELL_LBL[ck]}</div>`;
      if(c){
        const parts=['recipe','bullVol','v2','maCross'].filter(k=>c.src[k]).map(k=>SL[k]+c.src[k].n);
        inner+=`<div style="font-size:13px;font-weight:800;color:var(--text2);line-height:1.2">${c.n}</div><div style="font-size:8px;color:var(--text3)">${parts.join('·')}</div>`;
      } else inner+='<div style="font-size:11px;color:var(--text3);padding:2px 0">—</div>';
      g+=`<td style="border:1px solid var(--border);background:${c?'rgba(34,197,94,.06)':'transparent'};text-align:center;padding:4px 2px;vertical-align:top">${inner}</td>`;
    });
    g+='</tr>';
  });
  g+='</table>';
  // 칸×진입원 성과 줄 — 두 진입원 이상이거나 거래 있는 칸만. n<5 소표본 ⚠.
  const ORDER=['bull|bull','bull|bear','bull|mixed','bear|bull','bear|bear','bear|mixed','mixed|bull','mixed|bear','mixed|mixed'];
  let perf='';
  ORDER.forEach(ck=>{
    const c=cells[ck]; if(!c) return;
    const seg=['recipe','bullVol','v2','maCross'].filter(k=>c.src[k]).map(k=>{
      const sv=c.src[k], avg=sv.sum/sv.n, wr=Math.round(sv.w/sv.n*100);
      const m=_BT_SRC_META[k];
      return `<span style="color:${m.c};font-weight:700">${SL[k]}</span> ${sv.n}건·${wr}%·${avg>=0?'+':''}${avg.toFixed(2)}${sv.n<5?'<span style="color:#b45309">⚠</span>':''}`;
    }).join(' <span style="color:var(--text3)">|</span> ');
    perf+=`<div style="font-size:9.5px;color:var(--text2);padding:3px 0;border-top:1px dashed var(--border)"><b style="color:var(--text)">${_BT_CELL_LBL[ck]}</b> → ${seg}</div>`;
  });
  // [S1211] ① 정배행(단기강세 3칸) 합산 — "단기강세에서 진입원별 성적" 직접 비교(희창 요청).
  //   ★기계적 사실: M(골든크로스)은 정배 성립 2~3봉 前이라 이 행엔 거의 안 찍힘 — M의 정면 비교는 아래 ②추세나이 축.
  const bullAgg={};
  ['bull|bull','bull|bear','bull|mixed'].forEach(ck=>{ const c=cells[ck]; if(!c) return;
    Object.keys(c.src).forEach(k=>{ const sv=c.src[k], a=bullAgg[k]||(bullAgg[k]={n:0,w:0,sum:0}); a.n+=sv.n; a.w+=sv.w; a.sum+=sv.sum; }); });
  let bullLine='';
  { const seg=['recipe','bullVol','v2','maCross'].filter(k=>bullAgg[k]).map(k=>{ const a=bullAgg[k], m=_BT_SRC_META[k];
      return `<span style="color:${m.c};font-weight:700">${SL[k]}</span> ${a.n}건·${Math.round(a.w/a.n*100)}%·${(a.sum/a.n)>=0?'+':''}${(a.sum/a.n).toFixed(2)}${a.n<5?'<span style="color:#b45309">⚠</span>':''}`;
    }).join(' <span style="color:var(--text3)">|</span> ');
    if(seg) bullLine=`<div style="font-size:9.5px;color:var(--text2);padding:4px 0;margin-top:5px;border-top:1px solid var(--border)"><b style="color:var(--text)">📗 정배행(단기강세 3칸) 합산</b> → ${seg}</div>`;
  }
  // [S1211] ② 추세나이(5×20 GC 경과)×진입원 — M=0봉(정의) vs 타원=크로스 후 n봉째 중간 탑승.
  //   "같은 추세를 처음부터 탄 게 온전히 가져가나"의 정면 비교축. 버킷: 0 / 1–5 / 6–15 / 16+ / 무(250봉 내 GC 없음).
  const AGE_B=[['0봉',a=>a===0],['1–5봉',a=>a>=1&&a<=5],['6–15봉',a=>a>=6&&a<=15],['16+봉',a=>a>=16],['무GC',a=>a==null]];   // 무GC=250봉 내 골든크로스 없음(장기 역배 등)
  const ageBy={};
  ts.forEach(t=>{ const k=SL[t.src]?t.src:'recipe'; const b=AGE_B.find(x=>x[1](t.gcAge!=null?t.gcAge:null)); if(!b) return;
    const o=ageBy[k]||(ageBy[k]={}); const sv=o[b[0]]||(o[b[0]]={n:0,w:0,sum:0}); sv.n++; if(t.pnl>0)sv.w++; sv.sum+=t.pnl; });
  let ageHtml='';
  ['recipe','bullVol','v2','maCross'].filter(k=>ageBy[k]).forEach(k=>{ const m=_BT_SRC_META[k];
    const seg=AGE_B.map(b=>b[0]).filter(bk=>ageBy[k][bk]).map(bk=>{ const sv=ageBy[k][bk], avg=sv.sum/sv.n;
      return `${bk} ${sv.n}건·${Math.round(sv.w/sv.n*100)}%·${avg>=0?'+':''}${avg.toFixed(2)}${sv.n<5?'<span style="color:#b45309">⚠</span>':''}`; }).join(' <span style="color:var(--text3)">·</span> ');
    ageHtml+=`<div style="font-size:9.5px;color:var(--text2);padding:2.5px 0"><span style="color:${m.c};font-weight:800">${SL[k]}</span> ${seg}</div>`;
  });
  if(ageHtml) ageHtml=`<div style="margin-top:5px;padding-top:4px;border-top:1px solid var(--border)"><div style="font-size:9.5px;font-weight:800;color:var(--text)">⏱ 추세나이(5×20 골든 경과)×진입원</div>${ageHtml}</div>`;
  // [S1212] ③ 레짐(S544)×진입원 — "불장·상승장에서 M vs 레시피" 정면 숫자(레짐게이트 가설의 판정면). 거래의 rg 각인 사용.
  const RG_L={}; ['bull','up','side','down','crash'].forEach(function(_r){ RG_L[_r]=_btRegimeTag(_r, false); });   // [S1217→S1449] SSOT 유도 — 구 표는 `횡보`·`하락`으로 '장'을 빼 어휘 SSOT와 갈려 있었다. 최대 폭은 `상승장`(3자)이라 불변.
  const rgBy={};
  ts.forEach(t=>{ if(!t.rg||!RG_L[t.rg]) return; const k=SL[t.src]?t.src:'recipe';
    const o=rgBy[k]||(rgBy[k]={}); const sv=o[t.rg]||(o[t.rg]={n:0,w:0,sum:0}); sv.n++; if(t.pnl>0)sv.w++; sv.sum+=t.pnl; });
  let rgHtml='';
  ['recipe','bullVol','v2','maCross'].filter(k=>rgBy[k]).forEach(k=>{ const m=_BT_SRC_META[k];
    const seg=['bull','up','side','down','crash'].filter(r=>rgBy[k][r]).map(r=>{ const sv=rgBy[k][r], avg=sv.sum/sv.n;   /* [S1217·18 사고수리: 한줄 화살표 중간 //주석이 sv 선언을 죽였음 — 블록주석만 허용 */
      return `${RG_L[r]} ${sv.n}건·${Math.round(sv.w/sv.n*100)}%·${avg>=0?'+':''}${avg.toFixed(2)}${sv.n<5?'<span style="color:#b45309">⚠</span>':''}`; }).join(' <span style="color:var(--text3)">·</span> ');
    rgHtml+=`<div style="font-size:9.5px;color:var(--text2);padding:2.5px 0"><span style="color:${m.c};font-weight:800">${SL[k]}</span> ${seg}</div>`;
  });
  if(rgHtml) rgHtml=`<div style="margin-top:5px;padding-top:4px;border-top:1px solid var(--border)"><div style="font-size:9.5px;font-weight:800;color:var(--text)">🗺 레짐(S544 표)×진입원</div>${rgHtml}</div>`;
  // [S1212] ④ 동시발동 — 레거시 진입이 크로스 당일(gcAge=0)인 거래. 우선순위를 M 위로 올려도 바뀌는 건 이 거래들의 라벨뿐(거래 동일).
  let coHtml='';
  { const co=ts.filter(t=>t.src==='recipe'&&t.gcAge===0);
    if(co.length){ const w=co.filter(t=>t.pnl>0).length, avg=co.reduce((a,t)=>a+t.pnl,0)/co.length;
      coHtml=`<div style="font-size:9px;color:var(--text3);margin-top:5px;padding-top:4px;border-top:1px dashed var(--border)">🤝 <b>동시발동</b>(레거시 진입=크로스 당일): ${co.length}건·${Math.round(w/co.length*100)}%·${avg>=0?'+':''}${avg.toFixed(2)} — M을 레시피 위 우선순위로 올리면 <b>이 거래들 라벨만</b> 바뀐다(진입봉·청산 동일). 추세 선점은 시간(0봉 vs 1~5봉)이 이미 한다.</div>`; } }

  return `<div class="bt-card" style="margin-top:8px">
    <div class="bt-card-title">🧩 진입원×칸 분해 <span style="font-size:10px;font-weight:500;color:var(--text3)">(진입봉 칸 · 숫자=거래수 · S1210~12)</span></div>
    ${g}
    <div style="margin-top:6px">${perf}</div>
    ${bullLine}
    ${ageHtml}
    ${rgHtml}
    ${coHtml}
    <div style="font-size:8.5px;color:var(--text3);line-height:1.55;margin-top:5px">칸=진입 신호봉의 3×3(ma51020×장기·시즌2 S1209와 동일 축) · %=승률, ±=건당 평균% · ⚠=n&lt;5 소표본 · 레=레거시 B=bullVol V=V2 M=크로스${unrec?` · 칸 미기록 ${unrec}건(초기 봉 부족)`:''}<br>단일 종목 정찰용("현 기준하 보임") — MA 채택 판정은 풀 단위 PREREG 측정(발굴풀+시간분리 OOS)에서.<br>⏱근거: 골든크로스 봉은 엄격 정배(5&gt;10&gt;20) 성립 <b>2~3봉 前</b>(MA10이 아직 20 아래·합성 실측) → M은 중립칸에 찍히고 정배칸으로 타고 들어감. 그래서 정배행 직접 비교(①)엔 M이 드물고, M의 정면 비교는 ②추세나이 축(같은 추세를 0봉째 탄 M vs n봉째 탄 타원).</div>
  </div>`;
}

// [S1449] ★레짐 표기 SSOT 조회구 — 아래 두 표(`RG_L`·`L`)가 각자 리터럴을 들고 있어 **한 파일 안에서도 갈렸다**
//   (`➡️횡보` vs `➡️ 횡보장`). 어휘·아이콘의 주인은 `sx_exec_core.js` `STATE_VOCAB`이므로 거기서 읽는다.
//   ⚠**미러를 만들지 않는다**(S1441 문법) — 표를 여기 복사하면 다음에 또 갈린다.
//   ⚠못 얻으면 라벨은 원문 키, 아이콘은 빈칸이다 — 지어내지 않는다(S1423). exec_core는 BT의 하드 의존이라 그 상태면 BT 자체가 안 돈다.
function _btRegimeTag(rg, sp){
  try{
    var _EC=(typeof SXExecCore!=='undefined')?SXExecCore:(typeof window!=='undefined'?window.SXExecCore:null);
    var V=(_EC&&_EC.STATE_VOCAB)||{}, ic=(V.regimeIcon&&V.regimeIcon[rg])||'', lb=(V.regime&&V.regime[rg])||rg;
    return ic ? (ic + (sp?' ':'') + lb) : lb;
  }catch(_e){ return rg; }
}
// [S544] 레짐별 BT 통계 렌더 (단일검증 BT 카드 하단)
function _btRenderRegime(rb){
  if(!rb) return '';
  var L = {}; ['bull','up','side','down','crash'].forEach(function(_r){ L[_r]=_btRegimeTag(_r, true); });   // [S1217→S1449] SSOT 유도(구 리터럴 표 폐기 · 값 동일)
  var rowsHtml = '';
  ['bull','up','side','down','crash'].forEach(function(rg){   // [S1217]
    var s = rb[rg]; if(!s || s.n < 1) return;
    var wrC = s.wr>=60?'#22c55e':s.wr>=40?'#3b82f6':'#f97316';
    var pnlC = s.totalPnl>=0?'#22c55e':'#e8365a';
    rowsHtml += '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">'
      + '<span style="font-weight:800;color:var(--text);min-width:62px">' + L[rg] + '</span>'
      + '<span style="color:var(--text3);font-size:10px">' + s.n + '건</span>'
      + '<span style="margin-left:auto;display:flex;gap:9px;align-items:baseline">'
      +   '<span style="color:' + wrC + ';font-weight:700">승률 ' + s.wr + '%</span>'
      +   '<span style="color:var(--text2);font-size:11px">PF ' + s.pf + '</span>'
      +   '<span style="color:' + pnlC + ';font-weight:700">' + (s.totalPnl>=0?'+':'') + s.totalPnl + '%</span>'
      + '</span></div>';
  });
  if(!rowsHtml) return '';
  return '<div class="bt-card" style="margin-top:10px">'
    + '<div class="bt-card-title">📊 레짐별 성과 <span style="font-size:9px;font-weight:500;color:var(--text3)">완성거래만</span> <span style="font-size:9px;font-weight:600;color:var(--text3)">(SMA 20/60/120/200 · 현재 파라미터 · 실험)</span></div>'
    + rowsHtml
    + '<div style="font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6">진입 봉의 큰 추세로 거래를 분류(레짐 v3·S1219) — 골격: 20×200 SMA ±1.5%(위=상승측·아래=하락측·밴드=횡보). 분화는 동역학: 상승측 <b>기울기 ≥+0.15%/봉=🔥불장</b>·미달=📈상승장(구 60&gt;120&gt;200 조항 폐기 — 3×3 상승세와 중복) · 하락측 <b>급기울기(≤−0.5) ∨ 고변동(ATR≥5%) ∨ 과대이격(≤−7%)</b>=🌋폭락장·미달=📉하락장. 전 임계값 선언값 초안. 같은 전략이 어느 추세에서 통하는지 확인용. PF=손익비, %=레짐 내 수익률 합.</div></div>';
}

// S67: 신뢰도 라벨
function _btHistReliabilityLabel(n){
  if(n<=0) return {text:'0/30', cls:'none', desc:'—'};
  if(n<10) return {text:n+'/30', cls:'low', desc:'데이터부족'};
  if(n<30) return {text:n+'/30', cls:'mid', desc:'충족'};
  return {text:'30/30', cls:'full', desc:'충분'};
}

// S67: 단일검증 탭 내 누적 저장 UI 갱신
//   [UI 제거] 검증결과갱신/검증데이터삭제 버튼, 누적 통계 박스, 안내문구 전체 숨김.
//   함수는 호출부 호환을 위해 유지 — 영역만 비움.
function _btHistUpdateUI(stock){
  const el = document.getElementById('btHistArea');
  if(!el) return;
  el.innerHTML = '';
}

// S95: BT 현재 상태 판정 (분석탭 BT 시그널 통합)
// S103-fix7 Phase3-A-1: _isBuySignal/sell_signal 판정 기준 교정
//   현재 사양: btResult.rowsLength 우선 사용, 없으면 scores.length+BT_WARMUP(100)으로 추정
//   〔이력〕 이전 버그: entryIdx는 rows 전체 기준(BT_WARMUP 이후부터 시작)인데
//     _totalBars(=scores.length=rows.length-BT_WARMUP)와 비교해서 거의 항상 true가 됨 (수정됨)
function _btGetRowsLen(btResult){
  if(!btResult) return 0;
  if(typeof btResult.rowsLength === 'number' && btResult.rowsLength > 0) return btResult.rowsLength;
  // fallback: 구버전 btResult (rowsLength 없음) — scores.length + BT_WARMUP 추정
  //   BT_WARMUP은 analysis_engine에서 100(full) 또는 50(min). 안전하게 100 가정.
  if(btResult.scores && btResult.scores.length) return btResult.scores.length + 100;
  return 0;
}
// S103-fix8: 진입일/청산일이 "오늘 KST"인지 판정 (timezone-safe)
//   엔진시뮬 "방금 신호" 표시는 사용자 직관에 따라 "오늘 발생한 신호"여야 함.
//   현재 사양: 봉 날짜를 KST 오늘 날짜와 직접 비교 → nextBar 모드/봉 인덱스 무관하게 정확.
//   허용 입력 형식: "2026-04-30", "2026-04-30T...", "20260430"
//   〔이력〕 이전: 인덱스 기반 판정(entryIdx >= rowsLen - 2)은 어제 진입까지 잡아버리는 버그 (수정됨)
function _btIsToday(dateStr){
  if(!dateStr) return false;
  try{
    // KST = UTC+9. 현재 시각을 KST로 환산해 YYYY-MM-DD 추출.
    const _kstNow = new Date(Date.now() + 9*3600*1000);
    const _todayKst = _kstNow.toISOString().slice(0,10); // "YYYY-MM-DD"
    // entryDate/exitDate를 YYYY-MM-DD로 정규화
    let _d = String(dateStr).slice(0,10);
    if(/^\d{8}$/.test(_d)) _d = _d.slice(0,4)+'-'+_d.slice(4,6)+'-'+_d.slice(6,8);
    return _d === _todayKst;
  }catch(_){ return false; }
}
function btGetCurrentState(btResult, currentPrice){
  if(!btResult || !btResult.trades || !btResult.trades.length)
    return { state:'no_data', text:'BT 데이터 없음', color:'var(--text3)' };
  const lastTrade = btResult.trades[btResult.trades.length - 1];
  // S103-fix7 Phase3-A-1: entryIdx/exitIdx 기준 통일
  const _rowsLen = _btGetRowsLen(btResult);
  // 미청산 포지션 (type==='OPEN')
  if(lastTrade.type === 'OPEN'){
    const pnl = currentPrice > 0 && lastTrade.entry > 0
      ? ((currentPrice - lastTrade.entry) / lastTrade.entry * 100).toFixed(1)
      : lastTrade.pnl.toFixed(1);
    const tp = lastTrade.tp || null;
    const sl = lastTrade.sl || null;
    // S103-fix8: 매수신호 "방금 발생" 판정 교정 (off-by-one 버그 수정)
    //   현재 사양: 진입일이 "오늘 KST"인지 날짜로 직접 판정 (timezone-safe, nextBar 모드 무관)
    //     entryDate 없는 구버전 캐시는 인덱스 fallback (단, ===rowsLen-1로 좁힘)
    //   〔이력〕 이전 버그: entryIdx >= _rowsLen - 2 → 어제 진입(rowsLen-2)도 "방금 신호"로 잘못 잡힘
    //     예: SK스퀘어 4/29 진입(어제) → bars=1 → entryIdx=rowsLen-2 → 잘못 true
    //         기업은행 4/28 진입 → bars=2 → entryIdx=rowsLen-3 → 정상 false (수정됨)
    const _isBuySignal = _btIsToday(lastTrade.entryDate)
      || (!lastTrade.entryDate && lastTrade.entryIdx != null && _rowsLen > 0 && lastTrade.entryIdx === _rowsLen - 1);
    return {
      state:'holding',
      entry: lastTrade.entry,
      entryDate: lastTrade.entryDate || '',
      entryIdx: lastTrade.entryIdx,
      totalBars: _rowsLen, // fix7: rowsLength로 통일 (이전엔 scores.length=rows-WARMUP이었음)
      _isBuySignal: _isBuySignal, // S99: 자동 설정
      pnl: +pnl,
      tp, sl,
      text: _isBuySignal ? 'BT 매수 신호 — 진입가 ' + Math.round(lastTrade.entry).toLocaleString() : '보유중 ' + (+pnl >= 0 ? '+' : '') + pnl + '%',
      color: _isBuySignal ? '#22c55e' : (+pnl >= 0 ? 'var(--buy)' : 'var(--sell)')
    };
  }
  // 마지막 거래가 최신봉(마지막 봉)에서 청산됨 → 매도 신호
  // S103-fix8: exitIdx >= _rowsLen - 2 → 어제 청산도 "매도 신호"로 잘못 잡히는 동일 버그 수정
  //   진입과 동일하게 exitDate가 "오늘 KST"인지 날짜로 직접 판정
  if(_btIsToday(lastTrade.exitDate)
     || (!lastTrade.exitDate && lastTrade.exitIdx != null && _rowsLen > 0 && lastTrade.exitIdx === _rowsLen - 1)){
    const isWin = lastTrade.type === 'WIN';
    return {
      state:'sell_signal',
      exitPrice: lastTrade.exit,
      exitDate: lastTrade.exitDate || '',
      pnl: lastTrade.pnl,
      isWin,
      text: 'BT 매도 신호 — ' + (isWin?'익절':'손절') + ' ' + (lastTrade.pnl>=0?'+':'') + lastTrade.pnl + '%',
      color: isWin ? 'var(--accent)' : 'var(--sell)'
    };
  }
  // 그 외 → 대기중 [S1019] 레시피 votes 기반 (클래식 점수 표기 폐기)
  const lastVotes = btResult.scores ? btResult.scores[btResult.scores.length-1] : null;
  return {
    state:'waiting',
    currentScore: lastVotes,   // (레거시 필드명·이제 votes)
    lastVotes: lastVotes,
    text: '대기중 — 레시피 진입 신호 없음' + (lastVotes >= 1 ? ' (최근봉 votes ' + lastVotes + ')' : ''),
    color: 'var(--text3)'
  };
}

function _btSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ════════ [S1076] vintage(과거 시대) 인자화 — 스냅 창을 "최근 600봉 고정"에서 임의 시대로 개방 ════════
//   계약: vintage='YYYY-MM-DD' | falsy(미전달)=현행 100% 유지(캐시키 접미 '' · URL 동일 · 클립 no-op).
//   ★함정1 캐시키: 키에 vintage가 없으면 "과거 창을 요청했는데 최근 캐시가 조용히 반환"됨 → 전 키에 접미 편입.
//   ★함정2 룩어헤드: API 파라미터(end/to/range)가 어긋나도 _btVinClip이 최종 방어선. date>vintage 봉은 여기서 잘림.
//   형식 불일치(오타 등)는 _btVinYmd가 ''를 반환 → 키·클립 **양쪽 모두** 무시(일관). 진입점(_snapCreate)에서 별도 하드 검증.
function _btVinYmd(v){ return (typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v.replace(/-/g,'') : ''; }
function _btVinKey(v){ var y=_btVinYmd(v); return y ? ('_v'+y) : ''; }
function _btVinDash(v){ var y=_btVinYmd(v); return y ? (y.slice(0,4)+'-'+y.slice(4,6)+'-'+y.slice(6,8)) : ''; }
// [S1077] ★날짜 형식 정규화 필수 — 소스마다 t 형식이 다르다.
//   KIS/YF/업비트 = '2023-08-09'(하이픈) · **네이버 = '20230809'(하이픈 없음)**
//   문자열 비교 시 5번째 자리에서 '0'(48) vs '-'(45) → '20230809' > '2023-08-09' 로 판정되어
//   **2023년 봉이 통째로 잘리는** 사고 발생(S1076 KR 창A: 요청 2023-08-09인데 최종봉 20221229).
//   → 양쪽 다 숫자만 남겨 YYYYMMDD로 비교한다. ISO('2021-08-16T09:00:00')도 동일 처리.
function _btVinClip(rows, v){
  var y=_btVinYmd(v);
  if(!y || !Array.isArray(rows)) return rows;   // 무인자 = 원본 배열 그대로(동일 참조)
  return rows.filter(function(r){
    var ymd=String((r&&(r.t||r.date))||'').replace(/[^0-9]/g,'').slice(0,8);
    return !!ymd && ymd <= y;
  });
}

// ── BT용 캔들 fetch (Yahoo Finance 경유) ──
let _btCandleCache = {};
async function btFetchCandlesYF(code, tf, count, vintage){
  tf = tf||'day';
  const yfTf = {day:'1d',week:'1wk',month:'1mo'}[tf]||'1d';
  const _vk = _btVinKey(vintage);   // [S1076]
  //   vintage 시 창을 넓힘 — 과거 기준일에서 다시 count봉을 뒤로 확보해야 하므로 5y로는 모자랄 수 있음.
  //   무인자면 기존 맵 그대로(골든 보존).
  const range = _vk ? ({day:'10y',week:'max',month:'max'}[tf]||'10y')
                    : ({day:'5y',week:'10y',month:'max'}[tf]||'5y');
  const cacheKey = `yf_${code}_${tf}${_vk}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000 && _btCandleCache[cacheKey].data.length>=count)
    return _btCandleCache[cacheKey].data.slice(-count);   // [S641] 캐시 봉수<요청봉수면 재fetch (count 미포함 키 → 짧은 캐시 재사용 버그 차단)

  // 코드→티커 변환
  let ticker = code;
  if(/^\d{6}$/.test(code)){
    let items = [];
    try{ items = [...JSON.parse(localStorage.getItem('ORACLE_KOSPI')||'[]'),...JSON.parse(localStorage.getItem('ORACLE_KOSDAQ')||'[]'),...JSON.parse(localStorage.getItem('ORACLE_ETF')||'[]')]; }catch(e){}
    const found = items.find(s=>s.code===code);
    const mkt = found?.market||'';
    ticker = mkt.startsWith('KOSDAQ') ? code+'.KQ' : code+'.KS';
  }

  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yfTf}&range=${range}`;
  const proxyUrl = `${BT_PROXY}/proxy?url=${encodeURIComponent(yfUrl)}`;
  const res = await fetch(proxyUrl, {signal:AbortSignal.timeout(15000), cache:'no-store'});
  if(!res.ok) throw new Error('Yahoo Finance 응답 오류');
  const raw = await res.json();
  const result = raw?.chart?.result?.[0];
  if(!result?.timestamp) throw new Error('Yahoo Finance 데이터 없음');
  const ts = result.timestamp||[];
  const q = result.indicators?.quote?.[0]||{};
  const rows = ts.map((t,i)=>({
    t:new Date(t*1000).toISOString(),
    o:q.open?.[i]||0, h:q.high?.[i]||0, l:q.low?.[i]||0,
    c:q.close?.[i]||0, v:q.volume?.[i]||0,
  })).filter(_btIsValidCandle);
  const _rows = _btVinClip(rows, vintage);   // [S1076] 무인자면 rows와 동일 참조
  if(_rows.length<30) throw new Error(`캔들 데이터 부족 (${_rows.length}봉)`);
  _btCandleCache[cacheKey] = {data:_rows, ts:Date.now()};
  return _rows.slice(-count);
}

// ── BT용 캔들: 코인(업비트 Workers v9) ──
async function btFetchCandlesCoin(code, tf, count, vintage){
  tf = tf||'day';
  const _vk = _btVinKey(vintage);   // [S1076]
  const cacheKey = `coin_${code}_${tf}${_vk}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000 && _btCandleCache[cacheKey].data.length>=count)
    return _btCandleCache[cacheKey].data.slice(-count);   // [S641] 캐시 봉수<요청봉수면 재fetch (count 미포함 키 → 짧은 캐시 재사용 버그 차단)

  const tfMap = {day:'days','5m':'minutes/5','15m':'minutes/15','30m':'minutes/30','60m':'minutes/60','240m':'minutes/240',week:'weeks',month:'months'};
  const upbitTf = tfMap[tf]||'days';
  const market = 'KRW-'+code.replace('KRW-','');
  const PAGE = 200; // 업비트 단일 호출 최대
  const pages = Math.ceil(count / PAGE);
  let allArr = [];
  // [S1076] 업비트는 이미 to= 커서로 뒤로 페이징 중 → 초기 커서만 vintage로 주면 과거 창이 열림.
  //   to는 '이 시각 이전'. 일봉 KST 경계 어긋남은 아래 _btVinClip이 최종 차단.
  let cursor = _vk ? (_btVinDash(vintage)+'T23:59:59') : ''; // to 파라미터 (빈값=최신부터)

  for(let p=0; p<pages; p++){
    const toParam = cursor ? `&to=${encodeURIComponent(cursor)}` : '';
    const batchCount = Math.min(PAGE, count - allArr.length);
    const url = `${BT_PROXY}/upbit/candles?market=${encodeURIComponent(market)}&type=${upbitTf}&count=${batchCount}${toParam}`;
    const res = await fetch(url, {signal:AbortSignal.timeout(12000)});
    if(!res.ok) throw new Error('Upbit 캔들 응답 오류');
    const json = await res.json();
    const arr = Array.isArray(json)?json:(json.data||[]);
    if(!arr.length) break;
    allArr = allArr.concat(arr);
    if(arr.length < batchCount) break; // 더 이상 데이터 없음
    // 다음 페이지 커서: 가장 오래된 캔들의 시간
    const oldest = arr[arr.length-1];
    cursor = oldest.candle_date_time_utc || oldest.candle_date_time_kst || '';
    if(!cursor) break;
    if(p < pages-1) await _btSleep(120); // rate limit 방지
  }

  // [S316-fix2] 캔들 부족 가드 완화 — 요청한 count가 30 미만이면 그 수만큼만 가드
  //   배경: 페이퍼 매수/매도가 현재가만 필요해서 count=5로 호출(L2945, L2990)
  //         이전 가드 `<30`이 무조건 발동 → "코인 캔들 부족 (5봉)" 토스트로 매수 차단
  //   원의도: BT는 최소 30봉이 의미 있어 가드 두었으나, 짧은 호출까지 막은 부작용
  //   변경:  Math.min(count, 30) 만큼만 가드 → BT(count=300+) 시 30봉 보장 유지,
  //          페이퍼(count=5) 시 5봉 보장으로 정상 통과
  const _minRequired = Math.min(count, 30);
  if(allArr.length < _minRequired) throw new Error(`코인 캔들 부족 (${allArr.length}봉, 최소 ${_minRequired}봉 필요)`);
  const rows = allArr.map(k=>({
    t: k.candle_date_time_kst||k.candle_date_time_utc||'',
    o: k.opening_price||0, h: k.high_price||0,
    l: k.low_price||0, c: k.trade_price||0,
    v: k.candle_acc_trade_volume||0,
  })).filter(_btIsValidCandle)
     .sort((a,b)=>(a.t||'').localeCompare(b.t||''));  // [SAFETY-SORT] 시간 오름차순 (reverse 대체 — 더 안전)
  const _rows = _btVinClip(rows, vintage);   // [S1076]
  _btCandleCache[cacheKey] = {data:_rows, ts:Date.now()};
  return _rows.slice(-count);
}

// ── BT용 캔들 통합 ──
// S93: 하이브리드 — ① 스크리너 캔들 캐시 공유 → ② 캐시 미스 시 독립 fetch
//   kr: KIS 우선 → 네이버 폴백 (분석탭과 동일 소스 정합)
//   us: Yahoo
//   coin: 업비트
async function btFetchCandles(code, isCoin, tf, count, vintage){
  count = count||300;
  // [S1230-P3] 코인도 candleCache 프로브 경유 — 기존엔 isCoin 즉시분기가 프로브보다 앞이라,
  //   분석탭이 방금 받아둔 600봉을 못 보고 카드마다 업비트 3페이지를 재fetch했다(이중로딩 M2).
  const mkt = isCoin ? 'coin' : (currentMarket || (/^\d{6}$/.test(code)?'kr':'us'));

  // ① 스크리너 캔들 캐시 조회 (candleCache는 글로벌)
  // [S1076] ★vintage 요청 시 이 블록 통째로 스킵 — candleCache는 '오늘' 데이터 전용이라
  //   과거 창을 요청했는데 최근 캐시가 조용히 반환되는 최악의 함정. 키에 vintage가 없으므로 우회 불가.
  if(!_btVinKey(vintage) && typeof candleCache !== 'undefined'){
    // 스크리너 캐시키: market_code_count_tf — count가 다를 수 있으므로 넉넉한 키 탐색
    const exactKey = mkt + '_' + code + '_' + count + '_' + tf;
    if(candleCache[exactKey] && Date.now()-candleCache[exactKey].ts < 600000){
      const cached = candleCache[exactKey].data;
      if(cached && cached.length >= Math.min(count, 60)){
        return _btNormalizeRows(cached.slice(-count));
      }
    }
    // count가 다른 캐시도 탐색 (분석탭은 보통 150~300봉)
    for(const k in candleCache){
      if(k.startsWith(mkt+'_'+code+'_') && k.endsWith('_'+tf)){
        const entry = candleCache[k];
        if(entry && Date.now()-entry.ts < 600000 && entry.data && entry.data.length >= Math.min(count, 60)){
          return _btNormalizeRows(entry.data.slice(-count));
        }
      }
    }
  }

  // ② 캐시 미스 → 독립 fetch
  if(isCoin) return btFetchCandlesCoin(code, tf, count, vintage);
  if(mkt === 'kr') return btFetchCandlesKR(code, tf, count, vintage);
  return btFetchCandlesYF(code, tf, count, vintage);
}

// [S229] BT 형식 캔들 무결성 검증 — sx_screener.html의 _sxIsValidCandle 미러 (BT는 {t,o,h,l,c,v} 형식)
//   증상: BT가 비정상 봉(low=0, undefined 등)을 r.c>0 필터만 거쳐 받아 BT 결과 왜곡
//   원인: BT/옵티마이저 fetch 5곳에 r.c>0 검사만 적용 → 분석탭(_sxIsValidCandle)과 검증 강도 차이
//   해결: 동일 기준(close>0, high>0, low>0, high>=low, high>=close, low<=close)을 BT 형식에 적용
//   영향: _btFetchKIS / _btFetchNaver / _btFetchYF / btFetchCandlesCoin / _btNormalizeRows
function _btIsValidCandle(c){
  if(!c) return false;
  if(!(c.c > 0)) return false;
  if(!(c.h > 0) || !(c.l > 0)) return false;     // wick 0까지 뻗는 비정상 봉 차단
  if(c.h < c.l) return false;                     // 역전 차단
  if(c.h < c.c || c.l > c.c) return false;        // 캔들 무결성 위반 차단
  return true;
}

// S93: 스크리너 캔들 형태 → BT 형태 변환 ({date,open,...} → {t,o,...})
// [S229] 변환 후 _btIsValidCandle로 무결성 검증 — 옛 캐시/Naver 부분 데이터로 인한 비정상 봉 차단
function _btNormalizeRows(rows){
  if(!rows || !rows.length) return rows;
  const f = rows[0];
  if(f.t !== undefined){
    // 이미 BT 형태 — S162-fix3: date 필드도 동기화 (fetchCandlesExtended 호환)
    let mapped = (f.date === undefined && f.t)
      ? rows.map(r => ({...r, date: r.date || r.t || ''}))
      : rows;
    // [S229] 무결성 검증
    const _origLen = mapped.length;
    mapped = mapped.filter(_btIsValidCandle);
    if(mapped.length !== _origLen){
      console.warn(`[S229] _btNormalizeRows BT 형식: ${_origLen}봉 → ${mapped.length}봉 (비정상 ${_origLen - mapped.length}개 제거)`);
    }
    return mapped;
  }
  // 스크리너 형식 → BT 형식 변환 + 검증
  const converted = rows.map(r=>({
    t: r.date||'', date: r.date||'', // S162-fix3: date 필드 보존
    o: r.open||0, h: r.high||0,
    l: r.low||0, c: r.close||0, v: r.volume||0,
    foreignExhaustion: r.foreignExhaustion,   // [S1231] 왕복 보존(스크리너→BT→스크리너에서 탈락 방지)
  }));
  const _origLen = converted.length;
  const validated = converted.filter(_btIsValidCandle);
  if(validated.length !== _origLen){
    console.warn(`[S229] _btNormalizeRows 변환후: ${_origLen}봉 → ${validated.length}봉 (비정상 ${_origLen - validated.length}개 제거)`);
  }
  return validated;
}

// S93: 국내주식 KIS 우선 → 네이버 폴백 (스크리너 fetchCandles와 동일 소스)
async function btFetchCandlesKR(code, tf, count, vintage){
  tf = tf||'day';
  const cacheKey = `kr_kis_${code}_${tf}${_btVinKey(vintage)}`;   // [S1076]
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000 && _btCandleCache[cacheKey].data.length>=count)
    return _btCandleCache[cacheKey].data.slice(-count);   // [S641] 캐시 봉수<요청봉수면 재fetch (count 미포함 키 → 짧은 캐시 재사용 버그 차단)

  // KIS 시도 — [S1230-P6] vintage(측정 과거창 · 12페이지 경로) 요청 시에만. 무인자 일·주·월은 네이버
  //   단일소스: KIS 5페이지=500 공급이 목표 600(floor 570) 미달인데 >=30 가드가 그걸 채택해
  //   네이버 폴백을 막고 있었다(S1076 주석의 "폴백이 담당" 의도와 코드가 어긋난 지점). 소스 고정으로
  //   KIS 토글 전후 캔들 불변 — 원장·관측소 시계열에 소스 전환 단절점이 생기지 않는다.
  if(window._kisEnabled && _btVinKey(vintage) && typeof _getKisConfig === 'function'){
    try{
      const rows = await _btFetchKIS(code, tf, count, vintage);   // [S1076]
      if(rows && rows.length >= 30){
        _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
        return rows.slice(-count);
      }
    }catch(e){ console.warn('[BT] KIS fetch err, fallback to Naver', e); }
  }

  // 네이버 폴백
  try{
    const rows = await _btFetchNaver(code, tf, count, vintage);   // [S1076]
    if(rows && rows.length >= 30){
      _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
      return rows.slice(-count);
    }
  }catch(e){ console.warn('[BT] Naver fetch err, fallback to Yahoo', e); }

  // 최종 폴백: Yahoo
  return btFetchCandlesYF(code, tf, count, vintage);   // [S1076]
}

// S93: KIS 일봉/주봉/월봉 (500봉 페이지네이션)
async function _btFetchKIS(code, tf, count, vintage){
  const periodMap = {'day':'D','week':'W','month':'M'};
  const period = periodMap[tf];
  if(!period) return null; // 분봉은 BT에서 미지원
  const cfg = _getKisConfig();
  const token = cfg ? await _getKisToken() : null;
  if(!token) return null;
  const KIS_PAGE = 100;
  const _vy = _btVinYmd(vintage);   // [S1076]
  //   상한 완화는 vintage 있을 때만 — 무인자 경로의 5페이지(=500봉) 동작을 건드리면 골든이 깨진다.
  //   (무인자 KR 실사용은 500<570 미달로 Naver 폴백이 담당 — 의도된 현행 동작, 보존)
  const maxPages = _vy ? Math.min(Math.ceil(count / KIS_PAGE), 12)
                       : Math.min(Math.ceil(count / KIS_PAGE), 5);
  let allBars = [];
  let curEnd = _vy || new Date().toISOString().slice(0,10).replace(/-/g,'');   // [S1076]
  for(let pg = 0; pg < maxPages; pg++){
    const endD = curEnd.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
    const sd = new Date(endD);
    const daySpan = {'day':Math.ceil(KIS_PAGE*1.8),'week':Math.ceil(KIS_PAGE*10),'month':Math.ceil(KIS_PAGE*35)}[tf]||Math.ceil(KIS_PAGE*1.8);
    sd.setDate(sd.getDate() - daySpan);
    const startStr = sd.toISOString().slice(0,10).replace(/-/g,'');
    const qs = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE:'J', FID_INPUT_ISCD:code,
      FID_INPUT_DATE_1:startStr, FID_INPUT_DATE_2:curEnd,
      FID_PERIOD_DIV_CODE:period, FID_ORG_ADJ_PRC:'0'
    }).toString();
    const res = await fetch(`${BT_PROXY}/kis/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`,{
      headers:{'authorization':`Bearer ${token}`,'appkey':cfg.appKey,'appsecret':cfg.appSecret,'tr_id':'FHKST03010100','Content-Type':'application/json; charset=utf-8'},
      signal:AbortSignal.timeout(15000)  // [WEAK-1 FIX] 타임아웃 추가
    });
    if(!res.ok) break;
    const data = await res.json();
    const bars = data?.output2;
    if(!bars || !bars.length) break;
    const mapped = bars.map(b=>({
      t:(b.stck_bsop_date||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),
      o:Number(b.stck_oprc||0), h:Number(b.stck_hgpr||0),
      l:Number(b.stck_lwpr||0), c:Number(b.stck_clpr||0),
      v:Number(b.acml_vol||0),
    })).filter(_btIsValidCandle);
    allBars = mapped.concat(allBars);
    if(bars.length < KIS_PAGE) break;
    const oldest = bars[bars.length-1]?.stck_bsop_date;
    if(!oldest) break;
    const od = new Date(oldest.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'));
    od.setDate(od.getDate() - 1);
    curEnd = od.toISOString().slice(0,10).replace(/-/g,'');
  }
  // [FIX] KIS output2는 최신→과거 내림차순 → 중복 제거 후 시간 순으로 정렬
  const seen = new Set();
  return _btVinClip(allBars.filter(b=>{ if(seen.has(b.t)) return false; seen.add(b.t); return true; })
                .sort((a,b)=>a.t.localeCompare(b.t)), vintage);   // [S1076]
}

// S93: 네이버 sise 캔들 (스크리너와 동일 로직)
async function _btFetchNaver(code, tf, count, vintage){
  const tfMap={'day':'day','week':'week','month':'month'};
  const timeframe = tfMap[tf]||'day';
  // [S1076] 네이버는 이미 start/end 날짜로 요청 중 — end만 인자화하면 과거 창이 열린다(가장 깨끗한 경로).
  const _vd = _btVinDash(vintage);
  const end = _vd ? _vd.replace(/-/g,'') : new Date().toISOString().slice(0,10).replace(/-/g,'');
  const startDate = _vd ? new Date(_vd) : new Date();
  const dayRange = {'day':Math.ceil(count*1.8),'week':Math.ceil(count*10),'month':Math.ceil(count*35)}[tf] || Math.ceil(count*1.8);
  startDate.setDate(startDate.getDate() - dayRange);
  const start = startDate.toISOString().slice(0,10).replace(/-/g,'');
  const url = `${BT_PROXY}/naver/sise?symbol=${code}&timeframe=${timeframe}&start=${start}&end=${end}`;
  const res = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if(!res.ok) return null;
  const json = await res.json();
  let dataArr = json.data;
  if((!dataArr || !dataArr.length) && json.raw){
    if(json.error==='parse_failed') console.warn(`[S1240] /naver/sise parse_failed(BT) → raw 절단본 폴백: ${code} tf=${tf} rawLen=${json.raw.length}`);   // [S1240] 부분 데이터 가시화
    try{
      const cleaned = json.raw.trim().replace(/^\uFEFF/,'');
      let parsed = null;
      try{ parsed = JSON.parse(cleaned); }catch(_){}
      if(!parsed) try{ parsed = JSON.parse(cleaned.replace(/'/g,'"')); }catch(_){}
      if(parsed && Array.isArray(parsed) && parsed.length>=2){
        const hdr = parsed[0];
        dataArr = parsed.slice(1).map(row=>{
          const obj={}; hdr.forEach((h,i)=>{obj[h]=row[i];}); return obj;
        });
      }
    }catch(e){ console.warn('[BT] Naver raw parse err',e); }
  }
  return _btVinClip((dataArr||[]).map(r=>({   // [S1076]
    t:r.localDate||r['날짜']||r.date||'',
    o:parseFloat(r.openPrice||r['시가']||r.open||0),
    h:parseFloat(r.highPrice||r['고가']||r.high||0),
    l:parseFloat(r.lowPrice||r['저가']||r.low||0),
    c:parseFloat(r.closePrice||r['종가']||r.close||0),
    v:parseInt(r.accumulatedTradingVolume||r['거래량']||r.volume||0),
  })).filter(_btIsValidCandle)
     .sort((a,b)=>(a.t||'').localeCompare(b.t||'')), vintage);  // [SAFETY-SORT] 시간 오름차순 보장
}

// ── BT 파라미터 ──
// S99-4: _analTF 기준 + _analMode 대표 프리셋 연동
// [S1237c] btGetParams 철거 — 레시피-BT 일원화(S1018) 이후 반환값(buyTh/sellTh/tp/sl)을 읽는 소비처가
//   전무해진 고아 함수(전 파일 호출 0 확인). _getEffectiveTh/_loadAnalParams는 스캐너·프리셋 실소비처가
//   살아 있어 존치. 구버전 클래식-BT 파라미터 축의 마지막 잔재 제거 — 레거시 무보존.
function btGetOpts(){
  const slip = parseFloat(document.getElementById('btOptSlip')?.value||'1')/1000;
  // [S422] 진입 시점은 전역 SXE._btEntryMode(조기청산 모달 라디오: 종가/시가)가 단일 출처.
  //   nextBarEntry를 여기서 넘기지 않으면 sxRunBtEngine이 전역값을 따름 → 단일/관심/교차/워크포워드 일관.
  //   〔이력〕 이전: btOptNextBar 체크박스 → nextBarEntry. 체크박스 제거하고 전역 모드로 통일(_btExitMode와 대칭).
  // [BT-실시간 미러링] 봉별 레짐 보정을 BT에도 적용 — 분석엔진과 100% 일치
  //   현재 사양: BT도 동일하게 봉별 보정 적용 → 차트 미러링 = 실시간 시뮬레이션으로 사용 가능.
  //     [S1092] 레짐 보정 철거 — 임계값 가산 자체가 제거됨.
  //     적용 범위: sx_bt.js 모든 경로(단일검증/관심종목 BT/교차검증/워크포워드/대시보드).
  //     옵티마이저는 별개 호출(sx_optimizer.js에서 직접 true 전달) → 영향 없음.
  const _esrc=_btEntrySrc();
  return { slippage:slip, applyRegimeAdjust:true, entrySrc:_esrc, exitCfg:{ deadOn:_esrc.xDead===true, atrOn:_esrc.xAtr===true, cfakeOn:_esrc.xCf===true, cdownOn:_esrc.xCd===true, nbarOn:_esrc.xN===true, nbarDays:30, gateOn:_esrc.xGate===true } };   // [S1397] 시즌2 S1393 미러 — 구 mGate/xMode(레짐5 축 S1212/15/16) 철거·3×3판 게이트가 대체
}

// [S1213] 진입원 서명 — BT 결과 재사용(S215) 키. 엔진 폴백(EC.SRC_ALL)과 동일 규약으로 정규화:
//   entrySrc 미지정(분석탭 자동실행) = 3원 ON·M OFF와 같은 서명 → 기본 설정끼리는 재사용 유지, 토글 변경 시엔 확실히 재계산.
//   〔버그 이력〕 S1201이 entrySrc 토글을 넣으며 재사용 비교(slip/entryMode/파라미터)엔 안 넣음 →
//   첫 실행은 분석탭 저장 옵션에 entryMode 키가 없어 비교 실패=재계산(우연히 반영), 이후엔 재사용=토글 무시.
function _btSrcSigOf(opts){
  const d=(opts&&opts.entrySrc)||{recipe:true,bullVol:true,v2:true,maCross:true};   // [S1397] 크로스 기본 ON(시즌2 S1396 정합)
  const m=(d.maCross!==false);
  const x=(opts&&opts.exitCfg)||{};
  const xg='x'+[x.deadOn!==false,x.atrOn!==false,x.cfakeOn!==false,x.cdownOn!==false,x.nbarOn===true,x.gateOn===true].map(b=>b?1:0).join('');   // [S1397] 청산 칩 비트 서명 — 서명 변경으로 기존 저장 BT 전부 stale→자동 재계산(의도)   // [S1215·16] 출구모드 재사용 키(분석탭=미지정=x-)
  return [d.recipe!==false?1:0, d.bullVol!==false?1:0, d.v2!==false?1:0, m?1:0, xg].join('|');
}
if(typeof window!=='undefined') window._btSrcSigOf=_btSrcSigOf;
// [S1232] 실행 서명 — 자동/수동 BT의 입력 전모(경로·봉창·진입원·문턱·슬리피지·진입시점)를 한 객체로.
//   결과 카드 하단에 동일 포맷으로 표기해, 자동↔수동 결과가 다를 때 스샷만으로 실범 필드를 특정한다.
function _btMakeSig(by, tf, rows, params, opts){
  // [S1236] 바인딩 입력만 서명 — S1018 레시피-BT 일원화로 buyTh/sellTh/tpMult/slMult는 엔진이 한 줄도
  //   안 읽는 死파라미터(트레이드 tp:null·sl:null 박제). 표기하면 살아있는 것처럼 오독됨(S1236 발단 질문).
  //   [S1242] gg(갭가드)도 철거 — S423 적용 로직은 S1018 전환 때 이미 소멸(死바인딩), S1236 편입은 오판.
  //   청산은 코어 고정(이중ATR 2/3+데드 유예10).
  const f=rows[0]||{}, l=rows[rows.length-1]||{};
  return { by:by, tf:tf, rows:rows.length, first:(f.date||f.t||'?'), last:(l.date||l.t||'?'),
    slip:(opts&&opts.slippage)||0, mode:((typeof SXE!=='undefined'&&SXE._btEntryMode)||'close'),
    src:_btSrcSigOf(opts) };
}
if(typeof window!=='undefined') window._btMakeSig=_btMakeSig;
// [S1239] _btResult 기록 통일 스탬프 — 기록자가 4곳(내장·엔진검증·수동·학습검증)인데 내장/학습검증이
//   서명·Opts 없이 덮어써 "실행 서명 없음" 재발과 수동 재사용 오판(잔존 Opts로 무서명 결과 통과)이 났다.
//   모든 기록은 이 헬퍼로 서명(_sxSig)+_btResultTF/Opts를 원자 동기 — 3자 입력·표기 단일화.
function _btStampResult(stock, r, rows, tf, by, opts){
  try{
    if(!stock || !r || r.error) return r;
    r.rowsLength = r.rowsLength || (rows ? rows.length : 0);
    r._sxSig = _btMakeSig(by, tf, rows || [], {}, opts || {});
    stock._btResultTF = tf;
    stock._btResultOpts = { slippage:(opts&&opts.slippage)||0, entryMode:r._sxSig.mode, srcSig:r._sxSig.src };   // [S1242] gapGuard 필드 철거(死바인딩)
  }catch(_e){}
  return r;
}
if(typeof window!=='undefined') window._btStampResult=_btStampResult;

// ══ [S1201] 진입원 토글 — 시즌2와 정합(recipe>bullVol>v2 상호배타). 기본 3원 전부 ON. ══
//   ★v2는 in-sample(SX_CELL_DATA.meta.caveat)이라 BT 성과가 오르는 건 검증이 아니라 재현.
//     끄고 켜며 "v2가 몇 건을 더 잡는가"를 보는 용도 — 결과 카드에 src별로 갈라 표기한다.
// [S1237] 진입원 저장키 v1→v2 리셋 — 시즌2에 v2(어휘규칙) 정식 편입 반영. 구 키에 남은 실험 잔존 상태
//   (레시피 단독 등)가 "기본 자동실행 ≠ 시즌2"의 뿌리였다. 레거시 무보존: 마이그레이션 없이 기본값
//   { recipe·bullVol·v2 ON / maCross OFF / 출구 현행 }으로 재시작, 구 키는 즉시 제거.
//   기존 저장 BT 결과는 srcSig 불일치 → S1235 stale 판정 → 진입 시 자동 재실행으로 자연 갱신.
const SX_BT_SRC_KEY='SX_BT_ENTRY_SRC_v3';   // [S1397] v2→v3 리셋 — 시즌2 정합(크로스 ON·청산 4종·게이트) 기본으로 재시작. 구 키 즉시 제거(S1237 선례·무보존).
try{ if(typeof localStorage!=='undefined'){ localStorage.removeItem('SX_BT_ENTRY_SRC_v1'); localStorage.removeItem('SX_BT_ENTRY_SRC_v2'); } }catch(_lgK){}
function _btEntrySrc(){
  const d={ recipe:true, bullVol:true, v2:true, maCross:true, xDead:true, xAtr:true, xCf:true, xCd:true, xN:false, xGate:false };   // [S1397] 시즌2 정합 기본 — 진입 4원 ON(크로스=S1396 provisional) · 청산 4종 ON·N일/게이트 OFF(S1393)
  try{ const raw=localStorage.getItem(SX_BT_SRC_KEY); if(raw){ const o=JSON.parse(raw);
    ['recipe','bullVol','v2','maCross','xDead','xAtr','xCf','xCd','xN','xGate'].forEach(k=>{ if(typeof o[k]==='boolean') d[k]=o[k]; });
  } }catch(_){}
  return d;
}
function btToggleEntrySrc(k){
  const st=_btEntrySrc();
  st[k]=!st[k];   // [S1397] 전 칩 boolean 토글 — 구 xMode 3상 순환 철거
  if(!st.recipe && !st.bullVol && !st.v2 && !st.maCross){ toast('진입원을 전부 끌 수는 없습니다'); return; }   // [S1210] maCross 단독 ON = 유효(순수 크로스 측정)
  try{ localStorage.setItem(SX_BT_SRC_KEY, JSON.stringify(st)); }catch(_){}
  _btRenderEntrySrcBar();
}
const _BT_SRC_META={
  recipe:{ ic:'📊', lbl:'레시피 votes≥1', c:'#e8365a', tip:'시즌2 기본 진입 [S948]. 레시피 투표 1표 이상.' },
  bullVol:{ ic:'🔊', lbl:'bullVol', c:'#7c3aed', tip:'[S1041] KR 전용 · 하락장×강세 + 거래량OSC≥73.31 & VR≥389.41. 시즌2 held-out 통과.' },
  v2:{ ic:'🧬', lbl:'V2 어휘규칙', c:'#0891b2', tip:'[S1178→S1180] 칸 규칙 real-kind hit. ⚠발굴풀 in-sample 적합 — BT 성과는 검증이 아니라 재현.' },
  maCross:{ ic:'📈', lbl:'크로스', c:'#16a34a', tip:'[S1396→S1397] 시즌2 배선(provisional) — MA5×20 골든크로스(완성봉)+장기 60/120/200 정배 라우팅 내장. 사슬 3순위(recipe>bullVol>크로스>v2). 전진게이트: 완성거래 N≥20 시 기대값>0·승률≥35% 미달→OFF(사전선언).' }
};
function _btRenderEntrySrcBar(){
  const el=document.getElementById('btEntrySrcBar'); if(!el) return;
  const st=_btEntrySrc();
  el.innerHTML='<span style="font-size:10px;font-weight:800;color:var(--text3);margin-right:2px">진입원</span>'
    + ['recipe','bullVol','v2','maCross'].map(k=>{ const m=_BT_SRC_META[k], on=st[k];
        return `<span onclick="_sxVib(10);btToggleEntrySrc('${k}')" title="${m.tip}" style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:13px;border:1px solid ${m.c}${on?'':'55'};cursor:pointer;${on?`background:${m.c};color:#fff`:`background:transparent;color:${m.c}`}">${m.ic} ${m.lbl} ${on?'ON':'OFF'}</span>`;
      }).join('')
    + (st.v2?'<div style="width:100%;font-size:8.5px;color:#b45309;line-height:1.5;margin-top:3px">⚠ V2 규칙은 발굴풀 <b>in-sample</b> — 이 BT에서 오르는 건 검증이 아니라 재현이다. 정직한 판정은 시즌2 paper(시간축 OOS).</div>':'')
    + '<div style="width:100%;height:1px;margin:6px 0 4px;background:var(--border)"></div><span style="font-size:10px;font-weight:800;color:var(--text3);margin-right:2px">청산</span>'
    + [['xDead','✂️데드','#3b82f6','MA5×20 데드(유예10·완성봉) — 시즌2 S1393 4종 칩'],['xAtr','🛡️ATR','#e8365a','이중ATR 2×/3× — PREREG_S1392 전 도전팔 미충족 → 기본 ON 유지'],['xCf','🧩칸F','#b45309','칸fake 청산 — 전일 봉 신호(원장 파리티·1봉 지연·워밍업 구간=보류)'],['xCd','⛔칸D','#dc2626','칸down 청산 — 전일 봉 신호(1봉 지연)'],['xN','⏱N30','#f97316','N일 컷(30일) — 공통 토글·실험용 자·기본 OFF'],['xGate','⬛게이트','#7c3aed','3×3판 출구게이트 [측정 미달·PREREG_S1392 E팔·기본 OFF] — ON: 장기 정배=데드만·ATR 억제 / 혼조·역배=ATR만·데드 무시 / 축 불명=해제(전 칩)']].map(x=>{ const on=st[x[0]]===true;
        return `<span onclick="_sxVib(10);btToggleEntrySrc('${x[0]}')" title="${x[3]}" style="font-size:9.5px;font-weight:800;padding:3px 8px;border-radius:12px;border:1px solid ${x[2]}${on?'':'55'};cursor:pointer;${on?`background:${x[2]}18;color:${x[2]}`:'background:transparent;color:var(--text3)'}">${x[1]}${on?'':' OFF'}</span>`; }).join('')   // [S1397] 시즌2 S1393 미러 칩
    + (st.xGate===true?'<div style="width:100%;font-size:8.5px;color:#7c3aed;line-height:1.5;margin-top:3px">⬛ 게이트 ON — 장기 정배=데드만·ATR 억제 / 혼조·역배=ATR만·데드 무시 / 축 불명·워밍업=해제. <b>[측정 미달·PREREG_S1392 E팔]</b>(W1 한정 강세·W2/W3 무익) — 정찰용.</div>':'')
    + (st.maCross?'<div style="width:100%;font-size:8.5px;color:#16a34a;line-height:1.5;margin-top:3px">📈 크로스(S1396) — 시즌2 <b>배선됨</b>(provisional·장기 정배 라우팅 내장·사슬 3순위). 전진게이트: 완성거래 N≥20 시 기대값&gt;0·승률≥35% 미달→OFF(사전선언·변경 금지). 이 BT는 정찰.</div>':'');
}
if(typeof window!=='undefined'){ window.btToggleEntrySrc=btToggleEntrySrc; window._btRenderEntrySrcBar=_btRenderEntrySrcBar; window._btEntrySrc=_btEntrySrc; }

// ── 현재 분석 종목 가져오기 ──
function _btCurrentStock(){
  return currentAnalStock;
}
function _btIsCoin(){
  return currentMarket==='coin';
}

// ============================================================
//  탭1: 기본 백테스트
// ============================================================
async function btRunBasic(){
  const stock = _btCurrentStock();
  if(!stock){toast('종목을 먼저 선택하세요');return;}

  const btn = document.getElementById('btnBtBasic');
  const prog = document.getElementById('btBasicProg');
  const progFill = document.getElementById('btBasicProgFill');
  const progText = document.getElementById('btBasicProgText');
  const result = document.getElementById('btBasicResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  try{
    // [S215] 분석탭 BT 결과 재사용 — 단일검증과 분석탭 BT 결과 정합 100% 보장
    //   〔이력〕 이전: btRunBasic이 매번 새로 BT 돌림 → 분석탭과 결과 미세하게 다름
    //                (캔들 fetch 시점 차이로 마지막 봉 종가 갱신 → ±몇 거래 차이)
    //   현재: 같은 TF + 같은 봉수 + 같은 옵션이면 분석탭 _btResult 그대로 재사용
    //         "▶ 백테스트 실행" 버튼은 강제 재실행 의도이므로 사용자가 옵션 변경 시 새로 돌림
    //         옵션이 같으면 분석탭과 단일검증 일치
    //   재사용 조건:
    //     1. stock._btResult 존재 + 동일 TF
    //     2. stock._btResultOpts 저장된 옵션 == 현재 옵션 (slip/nextBar/진입원서명 srcSig[S1213])
    //     3. stock._btResult.rowsLength == _targetCount
    const _isExtSupported = (currentMarket === 'coin' || currentMarket === 'kr' || currentMarket === 'us');
    const _btTFVal = _btTF();
    const _targetCount = _btTargetBars(currentMarket, _btTFVal);
    const _curOpts = btGetOpts();
    // [S1237] _curParams 제거 — 死파라미터(레시피-BT 미사용). 재사용 판정은 S1236에서 이미 제외.
    // 재사용 가능 여부 판정 (분석탭 결과와 옵션 일치 확인)
    const _canReuse = stock._btResult
      && !stock._btResult.error
      && stock._btResultTF === _btTFVal
      && stock._btResult.rowsLength === _targetCount
      && stock._btResultOpts
      && Math.abs((stock._btResultOpts.slippage||0) - (_curOpts.slippage||0)) < 1e-9
      && stock._btResultOpts.entryMode === ((typeof SXE!=='undefined' && SXE._btEntryMode) || 'close')
      && stock._btResultOpts.srcSig === _btSrcSigOf(_curOpts);   // [S1213] 진입원(4칩+레짐게이트) 변경 시 재사용 금지
      // [S1236] buyTh/sellTh/tp/sl 비교 제거 — 레시피-BT(S1018)가 안 읽는 死파라미터라 슬롯만 바꿔도
      //   무의미한 재실행을 유발하던 과잉 판정.
      // [S1242] 갭가드 비교 철거 — S1236 '실바인딩' 전제가 오판(S423 적용 로직은 S1018 전환 때 구엔진과 소멸).
      //   과거 저장분 _btResultOpts.gapGuard 잔존값은 비교 자체가 없어져 무시됨 — stale 오탐 소멸.
    // [S1232] 재사용 불가 사유 특정 — 어떤 필드가 어긋나 조용히 재실행되는지 드러낸다(자동↔수동 불일치 추적).
    //   전 필드 일치인데 결과가 달랐다면 rows 내용/전역 상태 차이 — 서명 줄의 봉창(first~last)으로 2차 판별.
    let _reuseMiss = null;
    if(!_canReuse && stock._btResult && !stock._btResult.error){
      const _po=stock._btResultOpts;
      if(!_po || !_po.srcSig){   // [S1236] _pp(死파라미터 메타) 요구 제거
        _reuseMiss = '복원본에 실행 메타 없음(구버전 저장) → 현행 설정으로 재실행';
        console.warn('[S1232] '+_reuseMiss);
      } else {
      const _m=[];
      if(stock._btResultTF !== _btTFVal) _m.push('TF '+stock._btResultTF+'→'+_btTFVal);
      if(stock._btResult.rowsLength !== _targetCount) _m.push('봉수 '+stock._btResult.rowsLength+'≠'+_targetCount);
      if(Math.abs((_po.slippage||0)-(_curOpts.slippage||0))>=1e-9) _m.push('slip '+_po.slippage+'→'+_curOpts.slippage);
      const _em=((typeof SXE!=='undefined'&&SXE._btEntryMode)||'close');
      if(_po.entryMode !== _em) _m.push('진입시점 '+_po.entryMode+'→'+_em);
      const _cs=_btSrcSigOf(_curOpts);
      if(_po.srcSig !== _cs) _m.push('진입원 '+_po.srcSig+'→'+_cs);
      // [S1242] 갭가드 불일치 항목 철거 — 비교 자체가 사라짐(_canReuse 동기).
      _reuseMiss = _m.length?_m.join(' · '):'(재사용 판정 필드 전부 일치 — rows 내용/전역 상태 차이 의심)';
      console.warn('[S1232] 자동 BT 결과 재사용 불가 → 재실행: '+_reuseMiss);
      }
    }
    if(_canReuse){
      progFill.style.width='100%'; progText.textContent=`분석탭 결과 재사용 (${_targetCount}봉, 거래 ${stock._btResult.totalTrades})`;
      await _btSleep(150);
      // [S220] 잘못된 시그니처 수정 — 단일검증 BT 결과 카드 전체 'undefined' 표시 버그
      //   〔이력〕 [S215] 도입 시: btRenderBasicResult(stock._btResult, _btTFVal, _curOpts, _targetCount, _curParams)
      //          → 함수 시그니처는 (stock, r) 두 개 인자인데 5개 잘못 전달
      //          → stock 자리에 _btResult 들어가 stock.name/code 모두 undefined
      //          → r 자리에 _btTFVal('day') 들어가 r.winRate/totalPnl 등 모두 undefined
      //          → 화면 카드 전체가 'undefined (undefined) · 일봉 / undefined% 승률 …'로 표시
      //   현재: L1348 정상 호출과 동일하게 (stock, stock._btResult)로 교체
      //   영향: 분석탭 BT 캐시 재사용 경로에서만 발생 (옵션 변경/첫 실행은 정상 경로 L1348)
      btRenderBasicResult(stock, stock._btResult);
      result.style.display='block';
      console.log(`[S215/S220] ★ 분석탭 BT 재사용 — ${_targetCount}봉, 거래 ${stock._btResult.totalTrades}, 승률 ${stock._btResult.winRate}%`);
      btn.disabled = false;
      prog.style.display='none'; progText.style.display='none';
      return;
    }
    // S109 Phase 3-B-9b: BT 탭 자동 3단계 확장 (200 → 400 → 600봉)
    //   단일검증은 검증용이라 신뢰도 최대가 기본값
    //   분석탭에서 이미 확장된 캔들(stock._lastAnalCandles) 재사용 (캐시 공유)
    //   [S168 600봉 통일] 미국(us) 시장도 fetchCandlesExtended period1/period2 지원
    //   TF: 주봉/월봉은 400봉 (기존 유지), 나머지는 600봉 목표
    //   [S217] KIS 활성 + 국내면 700봉 (분석탭과 정합)
    let rows = null;

    // [S229] _lastAnalCandles 재사용 전 무결성 검증 — 분석탭 [S228]와 동일 정책 (BT는 {date,open,...} 형식이라 _sxIsValidCandle 사용)
    //   배경: BT 단일검증은 stock._lastAnalCandles를 그대로 받음 → 비정상 봉 전파 가능
    //         분석탭에서 [S228]로 이미 정화됐을 수 있지만, BT 단독 진입 시 안전 보장 필요
    const _validateLastAnalCandles = () => {
      if(!stock._lastAnalCandles || !stock._lastAnalCandles.length) return;
      if(typeof _sxIsValidCandle !== 'function') return;
      const _src = stock._lastAnalCandles;
      const _validated = _src.filter(_sxIsValidCandle);
      if(_validated.length !== _src.length){
        console.warn(`[S229] BT _lastAnalCandles 검증: ${_src.length}봉 → ${_validated.length}봉 (비정상 ${_src.length - _validated.length}개 제거)`);
        stock._lastAnalCandles = _validated;
      }
    };
    _validateLastAnalCandles();

    // ══ [S1205] 4단(200→400→600→700) 확장 폐기 → fetchRows600 단발 ══
    //   〔왜 3·4단이 있었나〕 야후(US) 레이트리밋 시절 설계. 200봉씩 끊어 받고 사이에 2초씩 쉬었다.
    //   〔지금은 불필요 — 3시장 전부 단발 가능(실측)〕
    //     KR   : 네이버 /naver/sise?start&end — 날짜범위 요청(dayRange=count×1.8). 페이징 개념 없음
    //     COIN : 업비트 to= 커서 페이징이 btFetchCandlesCoin **내부**에 이미 구현(pages=ceil(count/200))
    //     US   : 야후 range=5y를 한 번에 받고 slice(-count). 분할 안 함
    //   〔무엇이 나빴나〕 ①진입마다 대기 4~6초 ②길이 검사 없이 확정 → **400봉 고착**(S1159가 지적)
    //     ③분석탭/BT/실험카드가 각자 다른 캐시를 써 같은 종목을 중복 fetch
    //   〔fetchRows600이 이미 고쳐둔 것〕 목표=_btTargetBars 동일 · 1차 미달 시 시장별 우회 재fetch(S643)
    //     · _len>=목표*0.95만 확정(S1159) · mkt|tf|code 세션 캐시 → 실험카드·캔들전이와 **캐시 공유**
    //     · _snapMode 존중(S1080) → 측정 재현성이 분석탭/BT까지 자동 확장
    //   폴백: fetchRows600 미로드/실패 시에만 btFetchCandles 단발(대기 없음). 3·4단은 되살리지 않는다.
    progFill.style.width='20%'; progText.textContent=`캔들 ${_targetCount}봉 로드 중...`;
    rows = await _btGetRows(stock, _btTFVal, _targetCount);   // [S1205] 단발 SSOT

    if(!rows || rows.length === 0){
      throw new Error('캔들 데이터 수집 실패');
    }

    progFill.style.width='75%'; progText.textContent=`백테스트 실행 중... (${rows.length}봉)`;
    await _btSleep(50);

    const params = {};   // [S1237] 死파라미터 — 레시피-BT(S1018)는 읽지 않음(진입=votes·청산=코어고정)
    const opts = btGetOpts();

    // S163-diag: btRunBasic(단일검증 탭)의 rows 진단 로그
    try{
      const _first = rows[0], _last = rows[rows.length-1];
      const _fDate = _first.date || _first.t || '?';
      const _lDate = _last.date || _last.t || '?';
      const _fClose = _first.close ?? _first.c ?? '?';
      const _lClose = _last.close ?? _last.c ?? '?';
      console.log(`[S163-diag] [단일검증] ${stock.name||stock.code} rows: ${rows.length}봉 · 첫=${_fDate}(C${_fClose}) · 끝=${_lDate}(C${_lClose})`);
    }catch(_){}

    const r = sxRunBtEngine(rows, _btTFVal, params, opts);
    // S110 fix4: 실제 사용된 봉수 기록 (🔴/🔵/🟢 배지용)
    r.rowsLength = rows.length;
    try{ r._sxSig = _btMakeSig('수동', _btTFVal, rows, params, opts); r._sxReuseMiss = _reuseMiss; }catch(_sg){}   // [S1232] 실행 서명
    // [S546] 레짐별 성과 버킷 — 단일검증은 _runBtWithExtension(461행) 미경유라 여기서 첨부 (캐시·렌더 전)
    try { r._regimeBuckets = _btRegimeBreakdown(rows, r.trades); } catch(_rgE){}

    progFill.style.width='100%'; progText.textContent='완료';
    await _btSleep(200);

    if(r.error){
      result.style.display='block';
      const shortageInfo = r.shortage ? `<div style="font-size:10px;color:var(--text3);margin-top:6px">워밍업 ${r.barsNeeded-10}봉 + 매매 최소 10봉 = ${r.barsNeeded}봉 필요<br>현재 수집: ${r.barsHave}봉 · 부족: ${r.barsNeeded - r.barsHave}봉<br><span style="color:var(--accent)">💡 코인: 분봉→일봉 전환, 해외: 주봉 사용 권장</span></div>` : '';
      // [S225] 에러 메시지 escape — defense in depth
      const _e = (typeof _esc==='function') ? _esc : (s=>String(s));
      result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ ${_e(r.error)}</div>${shortageInfo}</div>`;
    } else {
      stock._btResult = r; // S93: 인메모리 저장 — btHistAccumulate에서 참조
      // [S215] BT 실행 시 사용한 TF/옵션/파라미터 함께 저장 — 분석탭/단일검증 정합 판정용
      stock._btResultTF = _btTFVal;
      stock._btResultOpts = { slippage: opts.slippage, entryMode: (typeof SXE!=='undefined' && SXE._btEntryMode) || 'close', srcSig: _btSrcSigOf(opts) };   // [S1213][S1242 gapGuard 철거]
      // [S1237] _btResultParams 저장 폐지 — 死파라미터 메타(레시피-BT 미사용·혼동 유발). 레거시 무보존.

      // ═══════════════════════════════════════════════════════════════
      // S120-2: 강건성 배지 — 200봉 BT 추가 계산 (단일검증 경로)
      // ═══════════════════════════════════════════════════════════════
      // 분석탭(_runEngineVerify)과 동일 로직으로 200봉 BT 실행 후 편차 판정
      // 사용자가 [▶ 백테스트 실행] 버튼으로 실행 시에도 배지 표시
      // ═══════════════════════════════════════════════════════════════
      try {
        if(rows.length >= 400 && typeof sxRunBtEngine === 'function'){
          const _rows200 = rows.slice(-200);
          const _r200 = sxRunBtEngine(_rows200, _btTFVal, params, opts);
          if(!_r200.error && typeof _r200.totalPnl === 'number'){
            stock._btResult_200 = _r200;
            const _pnl600 = r.totalPnl || 0;
            const _pnl200 = _r200.totalPnl || 0;
            const _trades600 = r.totalTrades || 0;
            const _trades200 = _r200.totalTrades || 0;
            if(_trades600 >= 3 && _trades200 >= 3){
              const _base = Math.max(Math.abs(_pnl600), 1);
              const _deviation = Math.abs(_pnl200 - _pnl600) / _base;
              stock._robustness = {
                label: _deviation < 0.2 ? 'trust' : 'fragile',
                deviation: _deviation,
                pnl200: _pnl200,
                pnl600: _pnl600,
                trades200: _trades200,
                trades600: _trades600,
                show: true
              };
              console.log(`[S120/btRunBasic] 🌱 강건성: ${stock._robustness.label === 'trust' ? '신뢰' : '불안'} — 편차 ${(_deviation*100).toFixed(1)}%`);
            } else {
              stock._robustness = { show: false, reason: 'insufficient_trades' };
            }
          } else {
            stock._robustness = { show: false, reason: 'bt200_error' };
          }
        } else {
          stock._robustness = { show: false, reason: 'insufficient_bars' };
        }
      } catch(robErr){
        console.warn('[S120/btRunBasic] 강건성 계산 예외:', robErr);
        stock._robustness = { show: false, reason: 'exception' };
      }

      btRenderBasicResult(stock, r);
      _btSaveBtResult(stock, r);
      // S112-fix2: 분석탭 재렌더 플래그 설정
      //   단일검증에서 BT 실행 시 stock._lastAnalCandles/_btResult가 갱신되는데
      //   분석탭 화면은 이전 렌더 상태 그대로 (runAnalysis 재호출 없음)
      //   → 플래그를 세워두고 분석탭(0)으로 전환 시 runAnalysis 재실행
      //   → 분석탭 화면이 단일검증 결과와 일치하도록 자동 동기화
      stock._needsAnalRerender = true;
      console.log(`[S112-fix2] ★ 분석탭 재렌더 플래그 설정 (단일검증 완료, ${rows.length}봉 기준)`);
      // S110 Phase C+D: 관심종목이면 BT 캐시도 자동 갱신 (교차검증 재사용용)
      //   일봉 BT 결과만 저장 (교차검증 표준 TF)
      try{
        if(_btTFVal === 'day' && typeof _isInWatchlist === 'function' && _isInWatchlist(stock.code)){
          _watchBtSet(stock, r, 'day');
          console.log(`[S110-watchBt] 단일BT → 캐시 갱신: ${stock.name||stock.code}`);
        }
      }catch(e){ console.warn('[S110] watch cache update err', e); }
    }
  }catch(e){
    result.style.display='block';
    // [S225] 에러 메시지 escape — defense in depth
    const _e = (typeof _esc==='function') ? _esc : (s=>String(s));
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${_e(e.message)}</div></div>`;
  }
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
}

function btRenderBasicResult(stock, r){
  const result = document.getElementById('btBasicResult');
  result.style.display='block';
  const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
  const tfLabel = tfLabels[_btTF()]||_btTF();
  // ═══════════════════════════════════════════════════════════════
  // S118 fix2: 색상 규칙 전면 통일 (분석탭과 동기화)
  //   [현재 색상 팔레트]
  //     - #22c55e 녹색: 기본 긍정 (수익률/평균이익 — 양수, 승률 60%↑, 손익비 ≥2.0, 기댓값 ≥+1%)
  //     - #3b82f6 파랑: 승률 40~59% / 손익비 1.5~1.99 (중간 긍정)
  //     - #f97316 주황: 승률 20~39% / 손익비 1.0~1.49 / 기댓값 0~+1% (경고)
  //     - #e8365a 빨강: 승률 0~19% / 손익비 <1.0 / 기댓값 <0 / MDD ≥20% / 음수값
  //     - #8b5cf6 보라: 보조 부정 (MDD < 20% — 정보 톤)
  //     - 거래수 — 데이터 충족 라벨과 동일 색 연동 (< 10 빨강 / < 30 파랑 / >= 30 녹색)
  //   [라벨] 단일검증 탭 고유 네이밍 유지 (총수익률/총매매수/평균이익/평균손실/최대연속손실)
  //     — 분석탭 "평균소득"(totalPnl/trades)과 단일검증 "평균이익"(avgWin)은 계산 다름
  //   〔이력〕 이전 색상 정책:
  //     - 승률: 50% 기준 분기 (var(--buy)/var(--sell)) → 양수/음수 기준으로 단순화
  //     - 손익비(PF): 1.5/1.0 기준 3단계 → 핑크 고정
  //     - 총매매수: 기본색 → 데이터 충족 연동
  //     - MDD: 빨강 → 보라 (항상 부정 지표지만 정보 톤으로 차별화)
  // ═══════════════════════════════════════════════════════════════
  const COLOR_POS = '#22c55e';    // 녹색 (긍정)
  const COLOR_NEG = '#e8365a';    // 빨강 (부정)
  const COLOR_PINK = '#f472b6';   // 핑크 (손익비 고정)
  const COLOR_PURPLE = '#8b5cf6'; // 보라 (MDD 정상)
  // [S292] 승률 4단계: 60%↑녹색 / 40~59%파랑 / 20~39%주황 / 0~19%빨강
  const _wrColorScale = (wr) => wr >= 60 ? COLOR_POS : wr >= 40 ? '#3b82f6' : wr >= 20 ? '#f97316' : COLOR_NEG;
  const winColor = _wrColorScale(r.winRate);
  // [S295] 총수익률 4단계: ≥100% 녹색 / 50~99.9% 파랑 / 0~49.9% 주황 / <0 빨강
  const _pnlScale = (v) => v >= 100 ? COLOR_POS : v >= 50 ? '#3b82f6' : v >= 0 ? '#f97316' : COLOR_NEG;
  const pnlColor = _pnlScale(r.totalPnl);
  // [S293] 손익비 4단계: ≥2.0 녹색 / 1.5~1.99 파랑 / 1.0~1.49 주황 / <1.0 빨강
  const pfColor = r.profitFactor >= 2.0 ? COLOR_POS : r.profitFactor >= 1.5 ? '#3b82f6' : r.profitFactor >= 1.0 ? '#f97316' : COLOR_NEG;
  // [S292] MDD 20% 이상 → 빨강 경고, 미만 → 보라 (정보 톤)
  // [S294] MDD 3단계: <10% 파랑 / 10~19.9% 보라 / ≥20% 빨강
  const mddColor = Math.abs(r.mdd) >= 20 ? COLOR_NEG : Math.abs(r.mdd) >= 10 ? COLOR_PURPLE : '#3b82f6';
  const avgWinColor = COLOR_POS;                                   // 평균이익 녹색 고정
  const avgLossColor = COLOR_NEG;                                  // 평균손실 빨강 고정
  const consecLossColor = COLOR_NEG;                               // 최대연속손실 빨강 (부정)
  // [S292] 기댓값 = (승률 × 평균이익) - (패율 × 평균손실)
  const _ev = (r.totalTrades > 0 && (r.avgWin > 0 || r.avgLoss > 0))
    ? ((r.winRate / 100) * r.avgWin) - ((1 - r.winRate / 100) * r.avgLoss)
    : 0;
  const _evStr = r.totalTrades > 0 ? (_ev >= 0 ? '+' : '') + _ev.toFixed(2) + '%' : '—';
  // [S293] 기댓값 3단계: ≥+1.0% 녹색 / 0~+1.0% 주황 / <0 빨강
  const _evClr = _ev >= 1.0 ? COLOR_POS : _ev >= 0 ? '#f97316' : COLOR_NEG;
  // 거래수 — 데이터 충족 라벨 색 연동 (BT_MIN_TRADES 기준 10/30)
  let tradesColor;
  if(r.totalTrades < 10) tradesColor = COLOR_NEG;        // 데이터 부족 빨강
  else if(r.totalTrades < 30) tradesColor = '#3b82f6';   // 데이터 충족 파랑
  else tradesColor = COLOR_POS;                          // 데이터 충분 녹색

  // S120-2: 강건성 배지 HTML 생성 (🌱 신뢰 / ⚠️ 불안)
  //   stock._robustness.show=true일 때만 렌더
  //   분석탭과 동일 로직 (200봉 vs 600봉 수익률 편차 20% 기준)
  let robustnessBadgeHTML = '';
  if(stock._robustness && stock._robustness.show){
    const _rob = stock._robustness;
    const _robIcon = _rob.label === 'trust' ? '🌱' : '⚠️';
    const _robText = _rob.label === 'trust' ? '신뢰' : '불안';
    const _robColor = _rob.label === 'trust' ? '#22c55e' : '#f59e0b';
    const _robBg = _rob.label === 'trust' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)';
    const _robTitle = `200봉 ${_rob.pnl200.toFixed(1)}% vs 600봉 ${_rob.pnl600.toFixed(1)}% · 편차 ${(_rob.deviation*100).toFixed(0)}%`;
    robustnessBadgeHTML = `<span title="${_robTitle}" style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;background:${_robBg};border-radius:10px;font-size:10px;font-weight:800;color:${_robColor};margin-left:6px;vertical-align:middle">${_robIcon} ${_robText}</span>`;
  }

  let html = `<div class="bt-card">
    <div class="bt-card-title">${stock.name||stock.code} (${stock.code}) · ${tfLabel}${robustnessBadgeHTML}</div>
    <div style="font-size:10px;color:var(--text3,#999);margin:1px 0 7px">※ 현재 보유중 매수건은 제외 (확정 매매 기준)</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${winColor}">${r.winRate}%</div><div class="bt-stat-label">승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pfColor}">${r.profitFactor}</div><div class="bt-stat-label">손익비(PF)</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pnlColor}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</div><div class="bt-stat-label">총수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${tradesColor}">${r.totalTrades}</div><div class="bt-stat-label">총매매수</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgWinColor}">+${r.avgWin}%</div><div class="bt-stat-label">평균이익</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgLossColor}">-${r.avgLoss}%</div><div class="bt-stat-label">평균손실</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${mddColor}">${r.mdd}%</div><div class="bt-stat-label">MDD</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${consecLossColor}">${r.maxConsecLoss||0}</div><div class="bt-stat-label">최대연속손실</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${_evClr}">${_evStr}</div><div class="bt-stat-label">기댓값</div></div>
    </div>
  </div>`;
  // [S544] 레짐별 성과 (현재 파라미터가 불장/상승장/횡보장/하락장에서 어떻게 변하는지)
  // [S1232→S1233] 실행 서명 줄 — 카드 최하단에 넣어 스샷 프레임 밖으로 밀리던 것을 결과 그리드 직후
  //   (레짐별 성과 위)로 이동. 자동/수동 경로·봉창(첫~끝)·진입원·문턱·슬리피지 + 진입 날짜 목록까지
  //   한 화면에 잡히므로, 자동↔수동 불일치의 실범(봉창 차 vs 게이트/문턱 차)이 스샷 한 장으로 갈라진다.
  try{
    const _sg = r._sxSig;
    // [S1234] TDZ 픽스 — 이 블록은 아래쪽 const _fmtDate 선언 **이전**에 실행된다. 서명 있는(신규 실행)
    //   경로만 날짜 포맷을 참조하다 ReferenceError → catch가 삼켜 서명·진입목록이 통째로 증발
    //   (수동 실행 카드에서 글자 소실 — S1234 스샷 증상). 복원본 경로는 정적 문구라 살아남았던 것.
    //   블록 전용 포맷터로 자립 — 바깥 _fmtDate와 무관.
    const _fd=(d)=>{ if(!d) return '?'; const m=String(d).match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:String(d); };
    if(_sg){
      const _slipPm = Math.round((_sg.slip||0)*1000*10)/10;
      html += `<div style="font-size:9px;color:var(--text3);margin:8px 2px 0;line-height:1.55">실행 <b>${_sg.by}</b> · ${_sg.rows}봉(${_fd(_sg.first)}~${_fd(_sg.last)}) · 진입원 ${_sg.src} · 청산 이중ATR2/3+데드(유예10)·코어고정 · slip${_slipPm}‰ · ${_sg.mode==='nextOpen'?'익일시가':'종가'}${r._sxReuseMiss?`<div style="color:#d97706;margin-top:3px">⚠ 자동결과 재사용 불가 → 재실행: ${r._sxReuseMiss}</div>`:''}</div>`;
    } else {
      html += `<div style="font-size:9px;color:var(--text3);margin:8px 2px 0">실행 서명 없음 — S1232 이전 결과 또는 저장 복원본. 새로고침 후 재실행하면 서명이 붙는다.</div>`;
    }
    const _tl=(r.trades||[]).slice(0,8).map(t=>`${_fd(t.entryDate)} ${(t.pnl||0)>=0?'+':''}${(t.pnl||0).toFixed(1)}`).join(' · ');
    if(_tl) html += `<div style="font-size:9px;color:var(--text3);margin:2px 2px 0">진입 ${(r.trades||[]).length}건: ${_tl}</div>`;
  }catch(_sgE){}
  html += _btRenderRegime(r._regimeBuckets);
  html += _btRenderSrcBreak(r._srcBreak, r._entrySrc, r.trades);   // [S1201] 진입원별 분해 [S1214] +청산사유
  html += _btRenderCellSrcGrid(r.trades);   // [S1210] 진입원×칸 분해(정찰 표면)

  // ═══════════════════════════════════════════════════════════════
  // [S240] 자산 흐름 시뮬레이션 — 가상 초기자본 100만원 기준
  //   〔목적〕 r.totalPnl(+641% 등 복리 누적률)을 "초기 100만 → 현재 얼마"로 환산해 직관 제공
  //          평균이익 +25% × 11회 ≠ 232%인데 복리로 7.4배 되는 이유를 시각화
  //   〔정책〕 INITIAL_CAPITAL=1,000,000원 고정 (희창님 결정 — 가늠용 기준값)
  //   〔계산〕 청산(WIN/LOSS): 복리 누적 → _realizedEq
  //          OPEN: _realizedEq × (1+OPEN%)로 평가, 미실현 별도 표기
  //   〔공유〕 _balances[i]는 r.trades[i] 거래 직후 잔고 (시간순) — 매매 목록 row에서 재사용
  // ═══════════════════════════════════════════════════════════════
  const _SX240_INIT_CAP = 1_000_000;
  const _balances = new Array(r.trades ? r.trades.length : 0);
  let _realizedEq = _SX240_INIT_CAP;
  let _openPnlPct = null; // OPEN 포지션 평가손익 % (없으면 null)
  if(r.trades && r.trades.length){
    for(let _bi = 0; _bi < r.trades.length; _bi++){
      const _bt = r.trades[_bi];
      const _bpct = +_bt.pnl || 0;
      if(_bt.type === 'OPEN'){
        // 평가 잔고 = 직전 실현잔고 × (1 + OPEN%)
        _balances[_bi] = _realizedEq * (1 + _bpct/100);
        // 다중 OPEN(드뭄)은 단순 합산 — 보통 0~1개
        _openPnlPct = (_openPnlPct === null) ? _bpct : (_openPnlPct + _bpct);
      } else {
        _realizedEq *= (1 + _bpct/100);
        _balances[_bi] = _realizedEq;
      }
    }
  }
  const _hasOpen = _openPnlPct !== null;
  const _equityFinal = _hasOpen ? _realizedEq * (1 + _openPnlPct/100) : _realizedEq;
  const _realizedPnlPct = (_realizedEq / _SX240_INIT_CAP - 1) * 100;
  const _totalEquityPct = (_equityFinal / _SX240_INIT_CAP - 1) * 100;
  const _fmtKrw = (v) => Math.round(v).toLocaleString();
  const _fmtPctSigned = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

  if(r.trades && r.trades.length){
    const _realizedColor = _realizedPnlPct >= 0 ? COLOR_POS : COLOR_NEG;
    const _openColor = (_openPnlPct||0) >= 0 ? COLOR_POS : COLOR_NEG;
    const _totalColor = _totalEquityPct >= 0 ? COLOR_POS : COLOR_NEG;
    const _realizedDelta = _realizedEq - _SX240_INIT_CAP;
    const _openDelta = _hasOpen ? (_realizedEq * _openPnlPct / 100) : 0;

    html += `<div class="bt-card">
      <div class="bt-card-title">💰 자산 흐름 <span style="font-size:10px;font-weight:500;color:var(--text3)">(가상 초기자본 100만원 · 복리 기준)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
        <div style="background:var(--surface2);padding:8px 10px;border-radius:6px">
          <div style="color:var(--text3);font-size:9px;margin-bottom:3px">초기자본</div>
          <div style="font-weight:700;font-size:13px;color:var(--text)">${_fmtKrw(_SX240_INIT_CAP)}원</div>
        </div>
        <div style="background:var(--surface2);padding:8px 10px;border-radius:6px">
          <div style="color:var(--text3);font-size:9px;margin-bottom:3px">누적 실현손익 <span style="opacity:0.7">(복리)</span></div>
          <div style="font-weight:700;font-size:13px;color:var(--text)">${_realizedDelta>=0?'+':''}${_fmtKrw(_realizedDelta)}원</div>
          <div style="font-size:10px;color:${_realizedColor};margin-top:1px">${_fmtPctSigned(_realizedPnlPct)}</div>
        </div>
        ${_hasOpen ? `<div style="background:var(--surface2);padding:8px 10px;border-radius:6px">
          <div style="color:var(--text3);font-size:9px;margin-bottom:3px">현재 평가손익 <span style="opacity:0.7">(미실현)</span></div>
          <div style="font-weight:700;font-size:13px;color:var(--text)">${_openDelta>=0?'+':''}${_fmtKrw(_openDelta)}원</div>
          <div style="font-size:10px;color:${_openColor};margin-top:1px">${_fmtPctSigned(_openPnlPct)}</div>
        </div>` : ''}
        <div style="background:var(--surface2);padding:8px 10px;border-radius:6px;${_hasOpen?'':'grid-column:span 2;'}border:1.5px solid ${_totalColor}">
          <div style="color:var(--text3);font-size:9px;margin-bottom:3px">현재 보유금 <span style="opacity:0.7">(총수익률 · 복리)</span></div>
          <div style="font-weight:800;font-size:14px;color:var(--text)">${_fmtKrw(_equityFinal)}원</div>
          <div style="font-size:11px;color:${_totalColor};font-weight:700;margin-top:1px">${_fmtPctSigned(_totalEquityPct)}</div>
        </div>
      </div>
    </div>`;
  }

  // S160: 진입 게이트 차단 통계 (게이트가 활성 상태에서 1건 이상 차단했을 때만)
  if((r.gateBlocks||0) > 0 && r.gateReasons){
    const _reasonLabels = {
      recentHigh:'최근N봉상승률', atrMultiple:'ATR배수상승률', highProximity:'고점근접도',
      consecUp:'연속양봉', gapUp:'갭상승',
      rsiOverbought:'RSI과열', bbUpper:'BB상단', stochOverbought:'Stoch과열', maDisparity:'MA이격',
      atrHard:'ATR%절대', adxMin:'ADX하한', macdNegN:'MACD음전',
      volSpike:'거래량급증', volDry:'거래량빈사',
    };
    const _pairs = Object.entries(r.gateReasons)
      .sort((a,b)=>b[1]-a[1])
      .map(([k,v])=>`<span style="display:inline-block;margin:2px 3px;padding:2px 7px;background:var(--surface2);border-radius:10px;font-size:10px;color:var(--text2)">${_reasonLabels[k]||k} <span style="color:var(--accent);font-weight:700">${v}</span></span>`)
      .join('');
    html += `<div class="bt-card" style="border-left:3px solid #f59e0b">
      <div class="bt-card-title" style="color:#f59e0b">🚦 진입 게이트로 차단된 신호: ${r.gateBlocks}건</div>
      <div style="font-size:10px;color:var(--text3);margin:4px 0 6px;line-height:1.5">rawScore가 매수 임계값을 통과했지만 활성화된 게이트에서 걸러진 신호입니다. 게이트를 풀면 ${r.gateBlocks}건의 추가 후보가 평가됩니다.</div>
      <div>${_pairs}</div>
    </div>`;
  }

  // [S1019] 진입 신호 0건 진단 — 레시피 votes 기반 (클래식 score/buyTh 폐기). '신호 없음'이 정상(S968).
  if(r.totalTrades===0 && r.scores && r.scores.length){
    const _v = r.scores;                         // 이제 봉별 레시피 votes(0~4)
    const _fired = _v.filter(v=>v>=1).length;
    html += `<div class="bt-card" style="border-left:3px solid var(--accent)">
      <div class="bt-card-title" style="color:var(--accent)">🔍 진입 신호 0건</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.6">
        <b>레시피 진입 신호(votes≥1):</b> ${_fired}봉 / ${_v.length}봉`;
    if(_fired===0){
      html += `<br><br><span style="color:var(--sell)">이 구간에 레시피 발동이 없었습니다.</span>`;
      html += `<br><span style="font-size:10px;color:var(--text3)">강한 추세 종목은 '신호 없음'이 정상입니다 — 레시피는 눌림·전환 구조에서 발동합니다.</span>`;
    } else {
      html += `<br><br><span style="color:var(--accent)">신호 ${_fired}봉 있었으나 진입/청산 구간이 부족했습니다(데이터 끝 근처 발동 등).</span>`;
    }
    html += `</div></div>`;
  }

  // [S1019] 레시피 신호(votes) 분포 — 클래식 0~100 점수 히스토그램 폐기. votes 0~4.
  if(r.scores && r.scores.length){
    const _v = r.scores;
    const dist = [0,0,0,0,0];
    _v.forEach(x=>{ const k=Math.max(0,Math.min(4,x|0)); dist[k]++; });
    const maxD = Math.max(...dist,1);
    const fired = _v.filter(x=>x>=1).length;
    const _labels = ['0 (신호없음)','1','2','3','4 (강)'];
    html += `<div class="bt-card"><div class="bt-card-title">레시피 신호 분포 (votes)</div>`;
    html += `<div style="font-size:9px;color:var(--text3);margin-bottom:4px">봉 ${_v.length} · 신호(≥1) ${fired}봉 · 진입 ${r.totalTrades}회</div>`;
    for(let v=4;v>=0;v--){
      const pct = (dist[v]/maxD*100).toFixed(0);
      const barColor = v>=1 ? 'var(--buy)' : 'var(--text3)';
      html += `<div class="bt-hist-row">
        <span class="bt-hist-label">${_labels[v]}</span>
        <div class="bt-hist-bar-wrap"><div class="bt-hist-bar" style="width:${pct}%;background:${barColor}"></div></div>
        <span class="bt-hist-cnt">${dist[v]}</span>
      </div>`;
    }
    html += `<div style="font-size:9px;color:var(--text3);margin-top:4px">votes≥1 = 레시피 진입 신호 · 청산은 이중ATR(2×/3×)+MA5×20 데드(유예10)</div>`;
    html += `</div>`;
  }

  // 매매 목록
  if(r.trades && r.trades.length){
    html += `<div class="bt-card"><div class="bt-card-title">매매 목록 (${r.trades.length}건)</div>`;
    const maxShow = Math.min(r.trades.length, 50);
    // ═══════════════════════════════════════════════════════════════
    //   [일/주/월봉] "2024.03.28" (공간 절약 + 가독성)
    //   [분봉/시간봉] "03.28 09:00" (연도 생략, 시간 표시 유지)
    //   [파싱 지원] 두 형식 모두 처리:
    //     ① "2024-03-28" 또는 "2024-03-28T09:00:00" (표준)
    //     ② "20240328" (하이픈 없는 YYYYMMDD, 일부 데이터 소스)
    // ═══════════════════════════════════════════════════════════════
    const _tfNow = _btTF();
    const _isIntraday = (_tfNow === '5m' || _tfNow === '15m' || _tfNow === '30m' || _tfNow === '60m' || _tfNow === '240m');
    const _fmtDate = (d) => {
      if(!d) return '';
      try{
        // 형식 1: "2024-03-28" 또는 "2024-03-28T09:00:00" (하이픈 있음)
        let m = d.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
        // 형식 2: "20240328" (하이픈 없는 YYYYMMDD, 8자리 숫자)
        if(!m) m = d.match(/^(\d{4})(\d{2})(\d{2})$/);
        if(!m) return d; // 파싱 실패 시 원본
        const year = m[1];
        const mon = m[2];  // 2자리 유지 (03, 10 등)
        const day = m[3];  // 2자리 유지 (07, 28 등)
        if(_isIntraday && m[4]){
          // 분봉/시간봉: 연도 생략, 시간 표시 (공간 절약)
          return `${mon}.${day} ${m[4]}:${m[5]}`;
        }
        // 일/주/월봉: "2024.03.28"
        return `${year}.${mon}.${day}`;
      }catch(_){ return d; }
    };

    // S121-1: 매매 목록 역순 렌더링 — 최근 날짜가 위로
    //   r.trades는 시간 순서(과거→현재)로 생성되므로 역순 인덱싱
    //   총 trades.length 중 최근 maxShow건을 최신순으로 표시
    const _totalTrades = r.trades.length;
    const _startIdx = _totalTrades - 1;
    const _endIdx = Math.max(_totalTrades - maxShow, 0);
    for(let i = _startIdx; i >= _endIdx; i--){
      const t = r.trades[i];
      const pnlC = t.pnl>=0?'var(--buy)':'var(--sell)';
      // S110: 진입~청산 날짜 표시 (둘째 줄, 작은 회색)
      //   OPEN 포지션은 exitDate 없으므로 "... 보유중" 표기
      const _entryD = _fmtDate(t.entryDate);
      const _exitD = t.type === 'OPEN' ? '보유중' : _fmtDate(t.exitDate);
      // [S240/S241] 거래별 잔고 — 둘째 줄(날짜 줄) 우측에 함께 표시
      //   〔이력〕 [S240]: 수익률 우측에 세로 누적 → 행 높이 늘고 위아래 간격 벌어짐
      //          [S241]: 날짜와 같은 둘째 줄 양쪽 정렬 (왼쪽 날짜 / 오른쪽 잔고) → 컴팩트
      //   OPEN 포지션은 평가 잔고(미실현 포함), 청산은 실현 잔고
      const _balAtI = _balances[i];
      const _balText = (typeof _balAtI === 'number') ? `${_fmtKrw(_balAtI)}원` : '';
      const _metaLine = (_entryD || _balText)
        ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:var(--text3);margin-top:2px;margin-left:44px">
             <span>${_entryD ? `${_entryD} ~ ${_exitD}` : ''}</span>
             <span style="font-weight:600">${_balText}</span>
           </div>`
        : '';
      html += `<div class="bt-trade-item" style="flex-direction:column;align-items:stretch;padding:6px 8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bt-trade-type ${t.type}">${t.type}</span>
          <span style="flex:1;color:var(--text2)">${t.entry!=null?Math.round(t.entry).toLocaleString():'-'} → ${t.exit!=null?Math.round(t.exit).toLocaleString():'-'}</span>
          <span class="bt-trade-pnl" style="color:${pnlC}">${t.pnl>=0?'+':''}${t.pnl}%</span>
          <span class="bt-trade-bars">${t.bars}봉</span>
        </div>
        ${_metaLine}
      </div>`;
    }
    // S121-1: "... +N건 더" 는 오래된 거래가 생략됐음을 알리므로 맨 아래 유지
    if(r.trades.length>maxShow) html += `<div class="bt-trade-item" style="justify-content:center;color:var(--text3)">... +${r.trades.length-maxShow}건 더 (오래된 거래)</div>`;
    html += `</div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  // [S968] 실패 분석 · 전략 라이프사이클 — 종목분석 탭(카드2)에서 단일검증 탭으로 이관
  //   〔이유〕 카드2를 레시피-해석 섹션으로 재프레임(전체 재작성) 예정 →
  //          BT 파생 콘텐츠(실패분석/라이프사이클)를 BT의 홈인 단일검증 탭으로 보존 이동.
  //   〔의존성 검증(이동 근거)〕
  //     · SXI.failureAnalysis(btData, indicators, qs, tf): indicators/qs는 시그니처만·본문 미사용(grep 0) → null,null
  //     · SXE.strategyLifecycle(btData, regime): regime는 if(regime) 가드로 null-safe (레짐연동 텍스트만 생략)
  //     · 이 스코프엔 qs 없음 → regime = stock._svVerdict?.regime 시도 후 null 폴백
  //     · tf: 분석탭 _analTF 대신 _btTF() 사용 (동일 TF 체계: day/week/60m…)
  //     · _btD: 분석탭 _getBtData(stock) 대신 단일검증 fresh 결과 r 직접 사용 (동일 형상·trades 포함)
  //   〔원본 보존〕 sx_render.js 카드2(구 13515~13696) IIFE 본문 바이트 보존. 데이터소스/인자 4줄만 어댑트.
  //              fold는 이미 템플릿 리터럴 조각(백틱 전부 ${} 내부)이라 재래핑해도 동작 동일.
  // ═══════════════════════════════════════════════════════════════
  {
    const _faLcTF = _btTF();
    const _faLcRegime = (stock && stock._svVerdict && stock._svVerdict.regime) || null;
    html += `
      <div class="anal-fold" style="margin-top:12px">
        <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 실패 분석 · 전략 라이프사이클</div>
        <div class="anal-fold-body">
      ${(()=>{
        // S70: 실패 분석 (Failure Analysis)
        if(typeof SXI==='undefined' || !SXI.failureAnalysis) return '';
        const _btD = r;
        if(!_btD || !_btD.trades || !_btD.trades.length) return '';
        const fa = SXI.failureAnalysis(_btD, null, null, _faLcTF);
        if(!fa) return '';
        const faId = 'fa_' + Math.random().toString(36).slice(2,8);
        const riskColor = fa.riskProfile.level==='danger'?'var(--sell)':fa.riskProfile.level==='warning'?'#ff8c00':fa.riskProfile.level==='bullish'?'var(--buy)':'var(--text2)';
        let faHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${faId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 실패 분석 <span style="font-size:9px;font-weight:600;color:${riskColor};margin-left:4px">${fa.riskProfile.label}</span></div>
          <div class="itp-card" id="${faId}" style="white-space:normal;margin-top:4px">`;

        // 요약
        faHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${fa.summary}</div>`;

        // 승패 통계 비교
        if(fa.stats){
          const st = fa.stats;
          faHTML += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
            <div style="padding:6px 8px;background:var(--buy-bg);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">이익 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--buy)">${st.winCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 +${st.avgWin}% / ${st.avgWinBars}봉</div>
            </div>
            <div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">손실 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--sell)">${st.lossCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 -${st.avgLoss}% / ${st.avgLossBars}봉</div>
            </div>
          </div>`;
        }

        // 손실 패턴
        if(fa.lossPatterns.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">손실 패턴</div>`;
          fa.lossPatterns.forEach(p => {
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px;border-left:3px solid var(--sell)">
              <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">${p.title} (${p.count}건, ${p.ratio}%)</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${p.detail}</div>
              <div style="font-size:10px;color:var(--accent);line-height:1.5">-> ${p.suggestion}</div>
            </div>`;
          });
        }

        // 최악의 거래
        if(fa.worstTrade){
          faHTML += `<div style="padding:8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">최대 손실 거래</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${fa.worstTrade.detail}</div>
          </div>`;
        }

        // 연속 손실
        if(fa.streakAnalysis){
          const sa = fa.streakAnalysis;
          faHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#ff8c00;margin-bottom:3px">연속 손실 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${sa.detail}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${sa.interpretation}</div>
          </div>`;
        }

        // MDD 맥락
        if(fa.mddContext){
          const mc = fa.mddContext;
          const mddColor = mc.severity==='위험'?'var(--sell)':mc.severity==='주의'?'#ff8c00':mc.severity==='보통'?'var(--text2)':'var(--buy)';
          faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:${mddColor};margin-bottom:3px">MDD ${mc.mdd.toFixed(1)}% — ${mc.severity}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${mc.advice}</div>
          </div>`;
        }

        // 개선 제안
        if(fa.improvements.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">개선 제안</div>`;
          fa.improvements.forEach(imp => {
            const prioColor = imp.priority==='high'?'var(--sell)':imp.priority==='mid'?'#ff8c00':'var(--text3)';
            const prioLabel = imp.priority==='high'?'중요':imp.priority==='mid'?'권장':'참고';
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px">
              <div style="font-size:9px;font-weight:700;color:${prioColor};margin-bottom:2px">${prioLabel} — ${imp.area}</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${imp.text}</div>
            </div>`;
          });
        }

        faHTML += `</div></div>`;
        return faHTML;
      })()}
      ${(()=>{
        // S72: 전략 라이프사이클 (Strategy Lifecycle)
        if(typeof SXE==='undefined' || !SXE.strategyLifecycle) return '';
        if(typeof SXI==='undefined' || !SXI.lifecycleGuide) return '';
        const _btD = r;
        if(!_btD || !_btD.trades || _btD.trades.filter(t=>t.type==='WIN'||t.type==='LOSS').length < 6) return '';
        const regime = _faLcRegime;
        const lc = SXE.strategyLifecycle(_btD, regime);
        if(!lc) return '';
        const guide = SXI.lifecycleGuide(lc);
        if(!guide) return '';
        const lcId = 'lc_' + Math.random().toString(36).slice(2,8);
        const phaseColor = {'growth':'var(--buy)','mature':'var(--accent)','decline':'#ff8c00','decay':'var(--sell)','early':'var(--text3)','unstable':'#ff8c00'}[lc.phase]||'var(--text2)';
        const gradeColor = {'A':'var(--buy)','B':'var(--accent)','C':'var(--text2)','D':'#ff8c00','F':'var(--sell)'}[lc.health.grade]||'var(--text2)';
        let lcHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${lcId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 전략 라이프사이클 <span style="font-size:9px;font-weight:600;color:${phaseColor};margin-left:4px">${guide.title.replace('전략 상태: ','')}</span> <span style="font-size:9px;font-weight:600;color:${gradeColor};margin-left:4px">${lc.health.grade}</span></div>
          <div class="itp-card" id="${lcId}" style="white-space:normal;margin-top:4px">`;

        // 건강도 + 단계 배지
        lcHTML += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <div style="padding:4px 10px;border-radius:12px;background:${phaseColor};color:#fff;font-size:10px;font-weight:700">${lc.phaseLabel}</div>
          <div style="font-size:12px;font-weight:700;color:${gradeColor}">${guide.healthText}</div>
        </div>`;

        // 요약
        lcHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${guide.summary}</div>`;

        // 구간별 추이 차트 (텍스트 기반 바)
        if(lc.quarters && lc.quarters.length >= 2){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">구간별 성과 추이</div>`;
          lcHTML += `<div style="display:grid;grid-template-columns:repeat(${lc.quarters.length},1fr);gap:4px;margin-bottom:8px">`;
          lc.quarters.forEach(q => {
            const barH = Math.max(4, Math.min(40, q.winRate * 0.6));
            const qColor = q.winRate >= 55 ? 'var(--buy)' : q.winRate >= 45 ? 'var(--accent)' : q.winRate >= 35 ? '#ff8c00' : 'var(--sell)';
            lcHTML += `<div style="text-align:center">
              <div style="font-size:9px;color:var(--text3);margin-bottom:2px">${q.label}</div>
              <div style="margin:0 auto;width:24px;height:${barH}px;background:${qColor};border-radius:3px"></div>
              <div style="font-size:9px;color:var(--text2);margin-top:2px">${q.winRate}%</div>
              <div style="font-size:8px;color:var(--text3)">PF${q.pf}</div>
            </div>`;
          });
          lcHTML += `</div>`;
          // 추이 텍스트
          guide.quarterTexts.forEach(qt => {
            lcHTML += `<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:3px;padding-left:8px;border-left:2px solid var(--accent)">· ${qt}</div>`;
          });
        }

        // 퇴화 신호
        if(guide.decayTexts.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--sell);margin:10px 0 6px">퇴화 신호</div>`;
          guide.decayTexts.forEach(dt => {
            const isHigh = dt.startsWith('[심각]');
            lcHTML += `<div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:4px;border-left:3px solid ${isHigh?'var(--sell)':'#ff8c00'}">
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${dt}</div>
            </div>`;
          });
        }

        // 유효기간 추정
        if(lc.validityEstimate){
          const ve = lc.validityEstimate;
          const urgColor = ve.urgency==='immediate'?'var(--sell)':ve.urgency==='soon'?'#ff8c00':'var(--text2)';
          lcHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin:8px 0;border-left:3px solid ${urgColor}">
            <div style="font-size:10px;font-weight:700;color:${urgColor};margin-bottom:2px">전략 유효기간 추정</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${ve.text}</div>
          </div>`;
        }

        // 레짐 연동
        if(guide.regimeText){
          lcHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin:8px 0">
            <div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:2px">레짐 연동 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${guide.regimeText}</div>
          </div>`;
        }

        // 행동 제안
        if(guide.actions.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">단계별 행동 제안</div>`;
          guide.actions.forEach((a, i) => {
            lcHTML += `<div style="display:flex;gap:6px;margin-bottom:4px;font-size:10px;line-height:1.6;color:var(--text2)"><span style="flex-shrink:0;width:16px;height:16px;border-radius:50%;background:${phaseColor};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</span><span>${a}</span></div>`;
          });
        }

        lcHTML += `</div></div>`;
        return lcHTML;
      })()}
        </div>
      </div>
`;
  }
  result.innerHTML = html;
  // S67: 누적 저장 UI 갱신
  _btHistUpdateUI(stock);
}

// ============================================================
//  [S1007] 관심종목 교차 백테스트 철거 — 3시장 뒤섞인 관심목록 평균은 측정 무의미(레짐·base rate 상이),
//  검증은 대표/발굴풀 전수 도구(교차검증 탭 측정군)가 담당. _btGetCrossTargets는 대시보드 탭이 공유하므로 존치.
// ============================================================

// 관심 + 현재 분석 종목 타깃 (대시보드 탭 공유 헬퍼)
function _btGetCrossTargets(){
  const targets = [];
  const seen = new Set();
  try{
    const wl = (typeof _getWatchlist === 'function') ? _getWatchlist() : [];
    wl.forEach(w => {
      if(w.code && !seen.has(w.code)){
        seen.add(w.code);
        targets.push({ code:w.code, name:w.name||w.code, market:w.market||'kr' });
      }
    });
  }catch(e){}
  // 현재 분석 종목 (중복 아니면 추가)
  try{
    if(currentAnalStock && currentAnalStock.code && !seen.has(currentAnalStock.code)){
      seen.add(currentAnalStock.code);
      // S163: 현재 분석 종목은 이미 확장된 _lastAnalCandles을 그대로 전달
      //   → 교차검증 경로 A로 진입 → 분석탭과 동일한 BT 결과 보장
      //   (이전엔 _lastAnalCandles 복사 누락 → 경로 C로 새 fetch → 결과 불일치)
      const _analStock = {
        code: currentAnalStock.code,
        name: currentAnalStock.name || currentAnalStock.code,
        market: currentAnalStock.market || currentAnalStock._mkt || currentMarket
      };
      if(Array.isArray(currentAnalStock._lastAnalCandles) && currentAnalStock._lastAnalCandles.length > 0){
        _analStock._lastAnalCandles = currentAnalStock._lastAnalCandles;
        _analStock._analCandlesExtendedStage = currentAnalStock._analCandlesExtendedStage;
        console.log(`[S163] 교차검증: 현재 분석 종목 ${_analStock.name}의 _lastAnalCandles(${currentAnalStock._lastAnalCandles.length}봉) 공유`);
      }
      targets.push(_analStock);
    }
  }catch(e){}
  return targets;
}

// [S1007] btCrossRefreshTargetList · btCrossReinforce(자동보강) · btRunCross · btRenderCrossResult 일괄 철거

// ============================================================
//  탭3: 워크포워드
// ============================================================
async function btRunWf(){
  const stock = _btCurrentStock();
  if(!stock){toast('종목을 먼저 선택하세요');return;}
  const ratio = parseInt(document.getElementById('btWfRatio').value)/100;

  const btn = document.getElementById('btnBtWf');
  const prog = document.getElementById('btWfProg');
  const progFill = document.getElementById('btWfProgFill');
  const progText = document.getElementById('btWfProgText');
  const result = document.getElementById('btWfResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  try{
    // S109 Phase 3-B-9b: 학습검증도 자동 3단계 확장 (단일검증과 동일 패턴)
    //   학습비율 70% × 600봉 = 420봉 학습 / 180봉 검증 → 통계적 유의성 확보
    //   300봉(210+90) 대비 과적합 판정 신뢰도 대폭 향상
    //   [S168 600봉 통일] 미국(us) 시장 추가
    //   [S217] KIS 활성 + 국내면 700봉 (학습 490 / 검증 210, 신뢰도 추가 ↑)
    const _isExtSupported = (currentMarket === 'coin' || currentMarket === 'kr' || currentMarket === 'us');
    const _btTFVal = _btTF();
    const _targetCount = _btTargetBars(currentMarket, _btTFVal);
    let rows = null;

    // 경로 A: 분석탭 or 단일검증에서 이미 확장된 캐시 재사용
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount);
      progFill.style.width='40%'; progText.textContent=`확장 캐시 재사용 (${rows.length}봉)...`;
      await _btSleep(50);
      console.log(`[S109-9b] ★ 학습검증 캐시 재사용: ${rows.length}봉`);
    }
    // 경로 B: 부분 캐시 + 추가 확장
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      progFill.style.width='15%'; progText.textContent=`기존 데이터 로드 (${stock._lastAnalCandles.length}봉)...`;
      const _existing = stock._lastAnalCandles.slice();
      const _needed = _targetCount - _existing.length;
      if(_needed > 0){
        progFill.style.width='30%'; progText.textContent=`추가 ${_needed}봉 로드 중...`;
        try{
          const _oldestDate = _existing[0].date;
          console.log(`[S109-9b] ★ 학습검증 부분 확장: ${_existing.length}봉 → ${_targetCount}봉`);
          const _extra = await fetchCandlesExtended(stock.code, _btTFVal, _oldestDate, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            console.log(`[S109-9b] ✅ 병합 완료: ${rows.length}봉`);
          } else {
            rows = _existing;
          }
        }catch(e){ rows = _existing; }
      } else {
        rows = _existing;
      }
    }
    else {   // [S1205] 3·4단 폐기 → _btGetRows 단발
      progFill.style.width='30%'; progText.textContent=`캔들 ${_targetCount}봉 로드 중...`;
      rows = await _btGetRows(stock, _btTFVal, _targetCount);
      if(!rows) throw new Error('캔들 데이터 수집 실패');
    }

    if(!rows || rows.length === 0) throw new Error('캔들 데이터 수집 실패');

    progFill.style.width='60%'; progText.textContent='학습 구간 백테스트...';
    await _btSleep(50);

    const splitIdx = Math.floor(rows.length*ratio);
    const trainRows = rows.slice(0, splitIdx);
    const testRows = rows.slice(splitIdx);

    if(trainRows.length<70 || testRows.length<30){
      result.style.display='block';
      result.innerHTML = `<div class="bt-card"><div class="bt-card-title">⚠️ 데이터 부족</div><div style="font-size:10px;color:var(--text3);padding:4px 0">학습 구간 ${trainRows.length}봉 (최소 70봉) / 검증 구간 ${testRows.length}봉 (최소 30봉)<br>전체 ${rows.length}봉 수집됨 · 최소 100봉 필요<br><span style="color:var(--accent)">💡 더 긴 타임프레임(주봉→월봉) 또는 학습 비율 조정 권장</span></div></div>`;
      btn.disabled=false; prog.style.display='none'; progText.style.display='none';
      return;
    }

    const params = {};   // [S1237] 死파라미터 — 레시피-BT(S1018)는 읽지 않음(진입=votes·청산=코어고정)
    const opts = btGetOpts();
    const trainR = sxRunBtEngine(trainRows, _btTFVal, params, opts);

    progFill.style.width='85%'; progText.textContent='검증 구간 백테스트...';
    await _btSleep(50);
    const testR = sxRunBtEngine(testRows, _btTFVal, params, opts);

    progFill.style.width='100%'; progText.textContent='완료';
    await _btSleep(200);

    // S109 Phase 3-B-9b: 봉 수 함께 전달 (화면 표시용)
    btRenderWfResult(stock, trainR, testR, ratio, trainRows.length, testRows.length);
    _btLastWfResult = {train:trainR, test:testR};
  }catch(e){
    result.style.display='block';
    // [S225] 에러 메시지 escape — defense in depth
    const _e = (typeof _esc==='function') ? _esc : (s=>String(s));
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${_e(e.message)}</div></div>`;
  }
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
}
let _btLastWfResult = null;

function btRenderWfResult(stock, train, test, ratio, trainBars, testBars){
  const result = document.getElementById('btWfResult');
  result.style.display='block';
  const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
  const tfLabel = tfLabels[_btTF()]||_btTF();

  const wrDiff = train.winRate - test.winRate;
  const pnlDiff = train.totalPnl - test.totalPnl;
  const overfit = wrDiff>15 || pnlDiff>20;
  const overfitColor = overfit?'var(--sell)':'var(--buy)';

  // S109 Phase 3-B-9b: 전체 봉 수를 상단에 표시 (신뢰도 근거 제공)
  const _totalBars = (trainBars || 0) + (testBars || 0);
  const _totalInfo = _totalBars > 0 ? ` · <span style="color:var(--text2);font-weight:600">총 ${_totalBars}봉</span>` : '';

  let html = `<div class="bt-card">
    <div class="bt-card-title">${stock.name||stock.code} · ${tfLabel} · 학습 ${Math.round(ratio*100)}%${_totalInfo}</div>
    <div style="text-align:center;font-size:12px;font-weight:700;color:${overfitColor};padding:6px;">${overfit?'⚠️ 과최적화 의심':'✅ 정상'}</div>
  </div>`;

  html += `<div class="bt-wf-compare">`;
  html += _btWfCol('학습 구간', train, 'var(--accent)', trainBars, Math.round(ratio*100));
  html += _btWfCol('검증 구간', test, 'var(--buy)', testBars, Math.round((1-ratio)*100));
  html += `</div>`;

  html += `<div class="bt-card" style="margin-top:8px;">
    <div class="bt-card-title">학습 vs 검증 차이</div>
    <div class="bt-stat-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${wrDiff>10?'var(--sell)':'var(--text2)'}">Δ${wrDiff>=0?'+':''}${wrDiff.toFixed(1)}%</div><div class="bt-stat-label">승률 차이</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pnlDiff>15?'var(--sell)':'var(--text2)'}">Δ${pnlDiff>=0?'+':''}${pnlDiff.toFixed(1)}%</div><div class="bt-stat-label">수익률 차이</div></div>
    </div>
  </div>`;

  result.innerHTML = html;
}

function _btWfCol(title, r, color, bars, pct){
  const wc = r.winRate>=50?'var(--buy)':'var(--sell)';
  // [S295] 총수익률 4단계
  const pc = r.totalPnl>=100?'var(--buy)':r.totalPnl>=50?'#3b82f6':r.totalPnl>=0?'#f97316':'var(--sell)';
  // S109 Phase 3-B-9b: 구간 제목에 "70% · 420봉" 형태로 봉 수 표시
  const _headerInfo = (bars && pct) ? `${pct}% · ${bars}봉` : (bars ? `${bars}봉` : '');
  const _titleHtml = _headerInfo
    ? `<div style="font-size:12px;font-weight:700">${title}</div><div style="font-size:10px;font-weight:500;opacity:.9;margin-top:1px">${_headerInfo}</div>`
    : title;
  return `<div class="bt-wf-col">
    <div class="bt-wf-col-title" style="background:${color};color:#fff;padding:6px 4px">${_titleHtml}</div>
    <div style="font-size:10px;text-align:center;">
      <div style="margin:3px 0"><span style="color:var(--text3)">승률</span> <span style="font-weight:700;color:${wc}">${r.winRate}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">PF</span> <span style="font-weight:700;font-family:'Outfit'">${r.profitFactor}</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">수익</span> <span style="font-weight:700;color:${pc}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">MDD</span> <span style="font-weight:700;color:var(--sell)">${r.mdd}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">매매</span> <span style="font-weight:700">${r.totalTrades}건</span></div>
    </div>
  </div>`;
}

// ============================================================
//  탭4: 대시보드 (S110 Phase C+D 재설계 — 관심종목 기반)
// ============================================================
//  교차검증과 동일한 대상 구성 (관심 + 현재 분석)
//  캐시 히트 시 즉시, 미스 시 600봉 확장 BT → 캐시 저장
//  워크포워드: 첫 번째 대상 종목에 대해 실행

// S110: 대시보드 대상 리스트 UI 갱신
function btDashRefreshTargetList(){
  const listEl = document.getElementById('btDashTargetList');
  const btn = document.getElementById('btnBtDash');
  const hintEl = document.getElementById('btDashEmptyHint');
  if(!listEl || !btn || !hintEl) return;

  const targets = _btGetCrossTargets();
  const n = targets.length;

  if(n === 0){
    listEl.innerHTML = '';
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.style.cursor = 'default';
    btn.textContent = '▶ 종합 대시보드 실행';
    hintEl.style.display = 'block';
    hintEl.innerHTML = `관심목록 등록 시 대시보드 활성화<br><span style="font-size:10px;color:var(--text3);display:block;margin-top:4px">종목 분석 탭에서 ☆ 버튼으로 관심 등록</span>`;
    return;
  }

  if(n === 1){
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.style.cursor = 'default';
    btn.textContent = '▶ 종합 대시보드 실행 (1종목)';
    listEl.innerHTML = `<div style="padding:8px 10px;background:var(--surface2);border-radius:6px"><b>대상:</b> ${targets[0].name}</div>`;
    hintEl.style.display = 'block';
    hintEl.innerHTML = `대시보드는 <b>2종목 이상</b>에서 의미 있습니다<br><span style="font-size:10px;color:var(--text3);display:block;margin-top:4px">관심목록에 종목을 더 추가하세요</span>`;
    return;
  }

  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = '';
  btn.textContent = `▶ 종합 대시보드 실행 (${n}종목)`;
  hintEl.style.display = 'none';

  const cachedCount = targets.filter(t => (typeof _watchBtGet === 'function') && _watchBtGet(t.market, t.code, 'day')).length;
  const newCount = n - cachedCount;

  // S110 fix2: 대시보드도 종목별 리스트 + ☆ 마크 (관심종목만 ☆)
  const targetList = targets.map(t => {
    const cached = (typeof _watchBtGet === 'function') ? _watchBtGet(t.market, t.code, 'day') : null;
    const age = cached ? Math.round((Date.now() - cached.saved_at) / 86400000) : -1;
    const badge = cached
      ? `<span style="font-size:9px;color:var(--buy);padding:1px 4px;background:rgba(16,185,129,.1);border-radius:3px">✓ ${age}일 전</span>`
      : `<span style="font-size:9px;color:var(--accent);padding:1px 4px;background:rgba(100,149,237,.1);border-radius:3px">⟲ 새 BT</span>`;
    const isWatched = (typeof _isInWatchlist === 'function') ? _isInWatchlist(t.code) : false;
    const starMark = isWatched
      ? `<span style="color:var(--accent);font-size:11px;width:14px;text-align:center;flex-shrink:0">☆</span>`
      : `<span style="width:14px;flex-shrink:0"></span>`;
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0">
      ${starMark}<span style="flex:1">${t.name}</span>${badge}
    </div>`;
  }).join('');

  listEl.innerHTML = `<div style="padding:8px 10px;background:var(--surface2);border-radius:6px">
    <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
      <b>대상 ${n}종목</b> · 캐시 ${cachedCount}개 · 새로 실행 ${newCount}개
      ${newCount > 0 ? `<span style="color:var(--accent)"> (11초 예상, 병렬 + 워크포워드)</span>` : `<span style="color:var(--buy)"> (즉시 + 워크포워드 3초)</span>`}
    </div>
    ${targetList}
    <div style="font-size:9px;color:var(--text3);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">워크포워드는 ${targets[0].name}로 실행</div>
  </div>`;
}

async function btRunDashboard(){
  const targets = _btGetCrossTargets();
  if(targets.length < 2){
    toast('대시보드는 2종목 이상 필요합니다');
    return;
  }

  const btn = document.getElementById('btnBtDash');
  const prog = document.getElementById('btDashProg');
  const progFill = document.getElementById('btDashProgFill');
  const progText = document.getElementById('btDashProgText');
  const result = document.getElementById('btDashResult');

  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  const crossResults = [];
  const _tf = 'day'; // 대시보드도 일봉 표준 (캐시 일치)

  // ────────────────────────────────────────────────
  // S110 fix2: 교차검증 병렬 처리 (cross와 동일 패턴)
  // ────────────────────────────────────────────────
  const cacheHits = [];
  const needBt = [];

  for(const t of targets){
    let cached = null;
    try{ cached = _watchBtGet(t.market, t.code, _tf); }catch(e){}
    if(cached && cached.btResult){
      cacheHits.push({ t, cached });
    } else {
      needBt.push(t);
    }
  }

  // 캐시 즉시
  progText.textContent = `캐시 ${cacheHits.length}개 처리...`;
  progFill.style.width = `${Math.round(cacheHits.length/targets.length*20)}%`;
  for(const { t, cached } of cacheHits){
    const r = cached.btResult;
    crossResults.push({
      name:t.name, code:t.code,
      winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
      mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin||0, avgLoss:r.avgLoss||0,
      rowsLength: r.rowsLength || 0 // S110 fix4
    });
  }
  await _btSleep(50);

  // 캐시 미스 병렬 BT
  if(needBt.length > 0){
    const PARALLEL_LIMIT = 5;
    progText.textContent = `신규 BT ${needBt.length}개 병렬 실행... (6초)`;
    progFill.style.width = '30%';
    console.log(`[S110-dash] ⟲ 병렬 BT ${needBt.length}종목 시작`);

    const batches = [];
    for(let i = 0; i < needBt.length; i += PARALLEL_LIMIT){
      batches.push(needBt.slice(i, i + PARALLEL_LIMIT));
    }

    let batchIdx = 0;
    for(const batch of batches){
      batchIdx++;
      if(batches.length > 1){
        progText.textContent = `배치 ${batchIdx}/${batches.length} (${batch.length}종목 병렬)`;
      }

      // S110 fix3: 0.5초 스태거 (cross와 동일)
      const STAGGER_MS = 500;
      const batchResults = await Promise.all(
        batch.map((t, idx) =>
          new Promise(r => setTimeout(r, idx * STAGGER_MS))
            .then(() => _runBtWithExtension(t, _tf, true))
            .then(btOut => ({ t, btOut }))
        )
      );

      for(const { t, btOut } of batchResults){
        if(btOut.ok && btOut.result && btOut.result.totalTrades > 0){
          const r = btOut.result;
          crossResults.push({
            name:t.name, code:t.code,
            winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
            mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin||0, avgLoss:r.avgLoss||0,
            rowsLength: r.rowsLength || (btOut.rows ? btOut.rows.length : 0) // S110 fix4
          });
          try{ _watchBtSet(t, r, _tf); }catch(e){}
        } else {
          crossResults.push({
            name:t.name, code:t.code,
            error: btOut.error || '데이터 부족', shortage:true,
            winRate:0, profitFactor:0, totalPnl:0, mdd:0, totalTrades:0
          });
        }
      }

      progFill.style.width = `${30 + Math.round(batchIdx/batches.length*30)}%`;
      if(batchIdx < batches.length){ await _btSleep(2000); }
    }
  }

  // 대상 순서대로 정렬
  const orderMap = new Map(targets.map((t, i) => [t.code, i]));
  crossResults.sort((a, b) => (orderMap.get(a.code) ?? 999) - (orderMap.get(b.code) ?? 999));

  // 2) 워크포워드 (첫 번째 대상)
  progFill.style.width='70%'; progText.textContent='워크포워드 실행 중...';
  let wfTrain=null, wfTest=null;
  try{
    const t = targets[0];
    // 워크포워드는 600봉 전체 필요 (캐시는 결과만 있으므로 새로 로드)
    const wfBt = await _runBtWithExtension(t, _tf, true);
    if(wfBt.ok && wfBt.rows && wfBt.rows.length >= 100){
      const params = {};   // [S1237] 死파라미터 — 레시피-BT(S1018)는 읽지 않음
      const opts = btGetOpts();
      const splitIdx = Math.floor(wfBt.rows.length*0.7);
      const trainRows = wfBt.rows.slice(0, splitIdx);
      const testRows = wfBt.rows.slice(splitIdx);
      if(trainRows.length>=70 && testRows.length>=30){
        wfTrain = sxRunBtEngine(trainRows, _tf, params, opts);
        wfTest = sxRunBtEngine(testRows, _tf, params, opts);
      }
    }
  }catch(e){ console.warn('[S110-dash] wf err', e); }

  progFill.style.width='100%'; progText.textContent='등급 산출 중...';
  await _btSleep(200);

  // 등급 계산 (기존 로직 동일)
  const valid = crossResults.filter(r=>r.totalTrades>0);
  const avgWR = valid.length ? valid.reduce((s,r)=>s+r.winRate,0)/valid.length : 0;
  const avgPnl = valid.length ? valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length : 0;
  const avgPF = valid.length ? valid.reduce((s,r)=>s+r.profitFactor,0)/valid.length : 0;
  const wfPenalty = (wfTrain&&wfTest) ? (wfTrain.winRate-wfTest.winRate>15||wfTrain.totalPnl-wfTest.totalPnl>20?-1:0) : 0;

  let gradeScore = 0;
  if(avgWR>=55) gradeScore+=2; else if(avgWR>=45) gradeScore+=1;
  if(avgPnl>0) gradeScore+=2; else if(avgPnl>-5) gradeScore+=1;
  if(avgPF>=1.5) gradeScore+=2; else if(avgPF>=1.0) gradeScore+=1;
  gradeScore += wfPenalty;

  const grade = gradeScore>=5?'A':gradeScore>=3?'B':gradeScore>=1?'C':'F';

  btRenderDashResult(grade, gradeScore, crossResults, wfTrain, wfTest, avgWR, avgPnl, avgPF);
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
  // 대상 리스트 재갱신 (캐시 상태 반영)
  btDashRefreshTargetList();
}

function btRenderDashResult(grade, score, crossR, wfTrain, wfTest, avgWR, avgPnl, avgPF){
  const result = document.getElementById('btDashResult');
  result.style.display='block';
  const gradeDesc = {A:'전략 신뢰도 높음',B:'전략 유효',C:'추가 검증 필요',F:'전략 재검토 권장'};
  const skipped = crossR.filter(r=>r.shortage||r.error);
  const validCnt = crossR.filter(r=>r.totalTrades>0).length;

  // S110 fix4: 대상 종목들의 봉수 분포 계산
  const bar600 = crossR.filter(r => (r.rowsLength||0) >= 600).length;
  const bar400 = crossR.filter(r => (r.rowsLength||0) >= 400 && (r.rowsLength||0) < 600).length;
  const barLow = crossR.filter(r => (r.rowsLength||0) < 400 && !r.shortage && !r.error).length;

  let html = `<div class="bt-card">
    <div class="bt-grade-badge ${grade}">${grade}</div>
    <div style="text-align:center;font-size:11px;color:var(--text2);margin-bottom:6px">${gradeDesc[grade]} (점수: ${score}/6)${skipped.length?` · <span style="color:var(--sell)">${skipped.length}개 데이터 부족</span>`:''}</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num">${avgWR.toFixed(1)}%</div><div class="bt-stat-label">평균 승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgPnl>=0?'var(--buy)':'var(--sell)'}">${avgPnl>=0?'+':''}${avgPnl.toFixed(1)}%</div><div class="bt-stat-label">평균 수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num">${avgPF.toFixed(2)}</div><div class="bt-stat-label">평균 PF</div></div>
    </div>
    <div style="margin-top:8px;padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:10px;color:var(--text3);text-align:center">
      데이터 봉수 분포: 🟢 ${bar600}개 (600봉) · 🔵 ${bar400}개 (400봉) · 🔴 ${barLow}개 (200봉 이하)
    </div>
  </div>`;

  if(wfTrain && wfTest){
    const wrDiff = wfTrain.winRate - wfTest.winRate;
    const pnlDiff = wfTrain.totalPnl - wfTest.totalPnl;
    const overfit = wrDiff>15 || pnlDiff>20;
    html += `<div class="bt-card">
      <div class="bt-card-title">${overfit?'⚠️':'✅'} 워크포워드 검증</div>
      <div class="bt-stat-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="bt-stat-item"><div class="bt-stat-num">${wfTrain.winRate}% → ${wfTest.winRate}%</div><div class="bt-stat-label">학습 → 검증 승률</div></div>
        <div class="bt-stat-item"><div class="bt-stat-num">${wfTrain.totalPnl}% → ${wfTest.totalPnl}%</div><div class="bt-stat-label">학습 → 검증 수익</div></div>
      </div>
    </div>`;
  }

  // 데이터 부족 종목 별도 카드
  if(skipped.length){
    html += `<div class="bt-card" style="border-left:3px solid var(--sell);">
      <div class="bt-card-title" style="color:var(--sell)">⚠️ 데이터 부족으로 제외 (${skipped.length}개)</div>
      <div style="font-size:10px;color:var(--text3);display:flex;flex-wrap:wrap;gap:4px 8px;">`;
    for(const r of skipped){
      html += `<span style="padding:2px 6px;background:var(--surface2);border-radius:4px;" title="${r.error||'데이터 부족'}">${r.name}</span>`;
    }
    html += `</div></div>`;
  }

  result.innerHTML = html;
}

// ============================================================
//  S200: 탭5 — 수동 매매 시뮬레이션 (Manual Trading Log)
//  [설계]
//   - 로직/파라미터와 무관한 "일기형" 기록 전용
//   - 매수: 종목분석 탭 매수버튼 → 현재가 자동 fetch → OPEN 포지션 저장
//   - 매도: 종목분석 탭 매도버튼 → 현재가 자동 fetch → CLOSED, 수익률>0 = WIN
//   - 종목별 그룹: 건수/승/패/적중률/누적수익률(복리) 집계
//   - localStorage 키: SX_MANUAL_TRADES (단일 배열, OPEN/CLOSED 혼재)
// ============================================================

function _mtLoad(){ try{return JSON.parse(localStorage.getItem(SX_MANUAL_KEY)||'[]');}catch(e){return [];} }
function _mtSave(list){ try{ localStorage.setItem(SX_MANUAL_KEY, JSON.stringify(list)); }catch(_){} }
function _mtGenId(){ return 'mt_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }

// 현재 종목의 "오픈 포지션" 반환 (없으면 null)
function _mtGetOpenPosition(code){
  if(!code) return null;
  const list = _mtLoad();
  return list.find(t => t.code === code && t.status === 'OPEN') || null;
}

// 종목분석 탭 — 현재 종목 보유 여부에 따라 매수/매도 버튼 토글 + 포지션 박스 표시
async function mtRefreshAnalBar(){
  const buyBtn = document.getElementById('analBtnBuy');
  const sellBtn = document.getElementById('analBtnSell');
  const posBox = document.getElementById('analPositionBox');
  if(!buyBtn || !sellBtn || !posBox) return;

  const stock = (typeof currentAnalStock !== 'undefined') ? currentAnalStock : null;
  if(!stock){
    buyBtn.disabled = true;
    sellBtn.disabled = true;
    posBox.classList.remove('show');
    return;
  }

  const pos = _mtGetOpenPosition(stock.code);
  if(pos){
    // 보유 중 → 매수 비활성, 매도 활성, 박스 표시
    buyBtn.disabled = true;
    sellBtn.disabled = false;
    posBox.classList.add('show');
    // 현재가는 마지막 캔들 기반으로 즉시 표시 (fetch 없이 빠르게)
    let curPrice = 0;
    try{
      const adapted = stock._lastAnalCandles || [];
      curPrice = adapted[adapted.length-1]?.close || 0;
    }catch(_){}
    _mtRenderPosBox(pos, curPrice);
  } else {
    // 미보유 → 매수 활성, 매도 비활성, 박스 숨김
    buyBtn.disabled = false;
    sellBtn.disabled = true;
    posBox.classList.remove('show');
  }
}

function _mtRenderPosBox(pos, curPrice){
  const nameEl = document.getElementById('posName');
  const mktEl = document.getElementById('posMarket');
  const priceEl = document.getElementById('posPrice');
  const pnlEl = document.getElementById('posPnl');
  const dateEl = document.getElementById('posDate');
  if(!nameEl) return;

  nameEl.textContent = pos.name || pos.code;
  const mktLabel = { kr:'KR', us:'US', coin:'COIN' }[pos.market] || (pos.market||'').toUpperCase() || '—';
  mktEl.textContent = mktLabel;

  const entry = pos.entryPrice || 0;
  const cur = curPrice || entry;
  const entryStr = entry.toLocaleString();
  const curStr = cur.toLocaleString();
  priceEl.innerHTML = `${entryStr}<span class="arrow">→</span>${curStr}`;

  const pnl = entry > 0 ? ((cur - entry) / entry) * 100 : 0;
  const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%';
  pnlEl.textContent = pnlStr;
  pnlEl.className = 'anal-pos-pnl ' + (pnl > 0.001 ? 'up' : pnl < -0.001 ? 'down' : 'flat');

  const d = new Date(pos.entryDate);
  const dateStr = isNaN(d) ? (pos.entryDate||'').slice(0,16).replace('T',' ')
    : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  dateEl.textContent = dateStr;
}

// 매수 버튼 핸들러
async function mtBuyCurrent(){
  const stock = (typeof currentAnalStock !== 'undefined') ? currentAnalStock : null;
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }

  // 중복 방지
  if(_mtGetOpenPosition(stock.code)){
    toast(`${stock.name||stock.code} 이미 보유 중`);
    return;
  }

  const buyBtn = document.getElementById('analBtnBuy');
  if(buyBtn) buyBtn.disabled = true;

  try{
    const rows = await btFetchCandles(stock.code, _btIsCoin(), _btTF(), 5);
    const adapted = sxAdaptRows(rows);
    const price = adapted[adapted.length-1]?.close || 0;
    if(price <= 0) throw new Error('현재가 조회 실패');

    const market = stock.market || stock._mkt || currentMarket || 'kr';
    const entry = {
      id: _mtGenId(),
      code: stock.code,
      name: stock.name || stock.code,
      market,
      tf: _btTF(),
      entryPrice: price,
      entryDate: new Date().toISOString(),
      exitPrice: null,
      exitDate: null,
      pnlPct: null,
      result: null,           // 'WIN' | 'LOSS' | null(OPEN)
      status: 'OPEN',
    };

    const list = _mtLoad();
    list.unshift(entry);
    _mtSave(list);

    toast(`${stock.name||stock.code} 매수 기록 · ${price.toLocaleString()}원`);
    mtRefreshAnalBar();
  }catch(e){
    toast('매수 실패: ' + (e.message||e));
    if(buyBtn) buyBtn.disabled = false;
  }
}

// 매도 버튼 핸들러 (청산)
async function mtSellCurrent(){
  const stock = (typeof currentAnalStock !== 'undefined') ? currentAnalStock : null;
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }

  const pos = _mtGetOpenPosition(stock.code);
  if(!pos){ toast('보유 중인 포지션이 없습니다'); return; }

  const sellBtn = document.getElementById('analBtnSell');
  if(sellBtn) sellBtn.disabled = true;

  try{
    const rows = await btFetchCandles(stock.code, _btIsCoin(), pos.tf||_btTF(), 5);
    const adapted = sxAdaptRows(rows);
    const curPrice = adapted[adapted.length-1]?.close || 0;
    if(curPrice <= 0) throw new Error('현재가 조회 실패');

    const pnlPct = +(((curPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(3);
    // [BUGFIX] pnl=0을 LOSS로 강제하면 btHistAccumulate(['flat' 분리)와 통계 미스매치
    //   매도 즉시 0%인 경우는 거의 없지만, 일관성 위해 'FLAT'으로 분리
    const result = pnlPct > 0 ? 'WIN' : (pnlPct < 0 ? 'LOSS' : 'FLAT');

    const list = _mtLoad();
    const idx = list.findIndex(t => t.id === pos.id);
    if(idx >= 0){
      list[idx].exitPrice = curPrice;
      list[idx].exitDate = new Date().toISOString();
      list[idx].pnlPct = pnlPct;
      list[idx].result = result;
      list[idx].status = 'CLOSED';
      _mtSave(list);
    }

    const sign = pnlPct >= 0 ? '+' : '';
    toast(`${stock.name||stock.code} 매도 · ${sign}${pnlPct.toFixed(2)}% (${result})`);
    mtRefreshAnalBar();
  }catch(e){
    toast('매도 실패: ' + (e.message||e));
    if(sellBtn) sellBtn.disabled = false;
  }
}

// 개별 거래 삭제
// [S224] async 변환 — sxConfirm 사용
async function mtDeleteTrade(id){
  if(!id) return;
  try{ if(navigator.vibrate) navigator.vibrate(10); }catch(_){}
  const list = _mtLoad();
  const target = list.find(t => t.id === id);
  if(!target) return;
  const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
  if(!await _conf(`${target.name||target.code} 거래 1건을 삭제할까요?`)) return;
  const next = list.filter(t => t.id !== id);
  _mtSave(next);
  mtRender();
  // 종목분석 탭 바도 갱신 (OPEN 삭제 시 대응)
  mtRefreshAnalBar();
}

// 종목별 전체 삭제 (한 종목의 모든 거래 삭제)
// [S224] async 변환 — setTimeout 콜백을 async로
function mtDeleteGroup(code, event){
  // 그룹 헤더 클릭(아코디언 토글)으로 이벤트 전파되지 않게 차단
  if(event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if(!code) return;
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(_){}
  setTimeout(async ()=>{
    const list = _mtLoad();
    const targets = list.filter(t => t.code === code);
    if(!targets.length) return;
    const name = targets[0].name || code;
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf(`${name} 거래 ${targets.length}건을 모두 삭제할까요?`)) return;
    const next = list.filter(t => t.code !== code);
    _mtSave(next);
    delete _mtOpenGroups[code]; // 펼침 상태도 정리
    mtRender();
    mtRefreshAnalBar();
    toast(`${name} ${targets.length}건 삭제 완료`);
  }, 30);
}

// 전체 삭제
// [S224] async 변환 — setTimeout 콜백을 async로
function mtClearAll(){
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(_){}
  setTimeout(async ()=>{
    const list = _mtLoad();
    if(!list.length){ toast('비어있음'); return; }
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf(`매매 기록 ${list.length}건을 모두 삭제할까요?`)) return;
    _mtSave([]);
    mtRender();
    mtRefreshAnalBar();
    toast('전체 삭제 완료');
  }, 30);
}

// 정렬 설정
let _mtSortMode = (()=>{ try{return localStorage.getItem(SX_MANUAL_SORT_KEY)||'recent';}catch(_){return 'recent';} })();
let _mtOpenGroups = {}; // { code: true } — 세션 내 열림 상태 기억
// [S316] 통계 영역 펼침 상태 (영구 저장)
let _mtStatsOpen = (()=>{ try{return localStorage.getItem(SX_MANUAL_STATS_OPEN_KEY)==='1';}catch(_){return false;} })();

function mtSetSort(mode){
  if(!['recent','oldest','pnl','name'].includes(mode)) return;
  _mtSortMode = mode;
  try{ localStorage.setItem(SX_MANUAL_SORT_KEY, mode); }catch(_){}
  mtRender();
}

// [S316-fix7] 매매시뮬레이션 탭에서 OPEN 거래 직접 매도
//   배경: 기존엔 분석탭으로 종목 재진입 → 매도 버튼 → 청산 흐름이라
//         보유 N개면 N번 진입해야 함 (번거로움)
//   설계: trade.id로 식별 → currentAnalStock 의존성 제거
//         매도 로직은 mtSellCurrent와 동일 (현재가 fetch → 청산)
//         코인은 pos.market === 'coin'으로 판별 (전역 currentMarket 무관)
async function mtSellById(id){
  try{ if(navigator.vibrate) navigator.vibrate(10); }catch(_){}
  if(!id) return;
  const list = _mtLoad();
  const idx = list.findIndex(t => t.id === id);
  if(idx < 0){ toast('거래를 찾을 수 없습니다'); return; }
  const pos = list[idx];
  if(pos.status !== 'OPEN'){ toast('이미 청산된 거래입니다'); return; }

  // 진행 중 표시 (해당 행의 매도 버튼만 비활성화)
  const btn = document.querySelector(`button[data-sell-id="${id}"]`);
  const _origLabel = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '…'; }

  try{
    const isCoin = pos.market === 'coin';
    const rows = await btFetchCandles(pos.code, isCoin, pos.tf || 'day', 5);
    const adapted = sxAdaptRows(rows);
    const curPrice = adapted[adapted.length-1]?.close || 0;
    if(curPrice <= 0) throw new Error('현재가 조회 실패');

    const pnlPct = +(((curPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(3);
    // pnl=0 → FLAT (mtSellCurrent와 동일 정책)
    const result = pnlPct > 0 ? 'WIN' : (pnlPct < 0 ? 'LOSS' : 'FLAT');

    list[idx].exitPrice = curPrice;
    list[idx].exitDate = new Date().toISOString();
    list[idx].pnlPct = pnlPct;
    list[idx].result = result;
    list[idx].status = 'CLOSED';
    _mtSave(list);

    const sign = pnlPct >= 0 ? '+' : '';
    toast(`${pos.name||pos.code} 매도 · ${sign}${pnlPct.toFixed(2)}% (${result})`);
    mtRender();
    // 분석탭에서 같은 종목 보고 있을 가능성 — 매수/매도 버튼 상태 동기화
    try{ if(typeof mtRefreshAnalBar === 'function') mtRefreshAnalBar(); }catch(_){}
  }catch(e){
    toast('매도 실패: ' + (e.message||e));
    if(btn){ btn.disabled = false; btn.textContent = _origLabel || '매도'; }
  }
}

function mtToggleGroup(code){
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(_){}
  _mtOpenGroups[code] = !_mtOpenGroups[code];
  mtRender();
}

// [S316] 통계 영역 펼침/접힘 토글 (상태 영구 저장)
function mtToggleStats(){
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(_){}
  _mtStatsOpen = !_mtStatsOpen;
  try{ localStorage.setItem(SX_MANUAL_STATS_OPEN_KEY, _mtStatsOpen ? '1' : '0'); }catch(_){}
  mtRender();
}

// 종목별 그룹 집계
function _mtGroupByCode(list){
  const map = new Map();
  list.forEach(t => {
    const key = t.code;
    if(!map.has(key)) map.set(key, { code:t.code, name:t.name, market:t.market, trades:[] });
    map.get(key).trades.push(t);
  });
  const groups = [];
  map.forEach(g => {
    const closed = g.trades.filter(t => t.status === 'CLOSED');
    const opens = g.trades.filter(t => t.status === 'OPEN');
    const wins = closed.filter(t => t.result === 'WIN').length;
    const losses = closed.filter(t => t.result === 'LOSS').length;
    const total = wins + losses;
    const hitRate = total ? +(wins/total*100).toFixed(1) : 0;
    // 복리 수익률: ∏(1 + r/100) - 1
    let cumMul = 1;
    closed.forEach(t => { cumMul *= (1 + (t.pnlPct||0)/100); });
    const cumPnl = +((cumMul - 1) * 100).toFixed(2);
    // 최근 거래일 (정렬용)
    const lastDate = g.trades.reduce((mx, t) => {
      const d = t.exitDate || t.entryDate;
      return (!mx || d > mx) ? d : mx;
    }, null);
    groups.push({
      code: g.code, name: g.name, market: g.market,
      trades: g.trades,
      count: g.trades.length, closedCount: closed.length, openCount: opens.length,
      wins, losses, hitRate, cumPnl, lastDate,
    });
  });
  return groups;
}

function _mtSortGroups(groups){
  const mode = _mtSortMode;
  const arr = groups.slice();
  if(mode === 'recent') arr.sort((a,b) => (b.lastDate||'').localeCompare(a.lastDate||''));
  else if(mode === 'oldest') arr.sort((a,b) => (a.lastDate||'').localeCompare(b.lastDate||''));
  else if(mode === 'pnl') arr.sort((a,b) => (b.cumPnl - a.cumPnl));
  else if(mode === 'name') arr.sort((a,b) => (a.name||a.code).localeCompare(b.name||b.code, 'ko'));
  return arr;
}

function _mtSortTrades(trades){
  const mode = _mtSortMode;
  const arr = trades.slice();
  if(mode === 'recent') arr.sort((a,b) => ((b.exitDate||b.entryDate)||'').localeCompare((a.exitDate||a.entryDate)||''));
  else if(mode === 'oldest') arr.sort((a,b) => ((a.exitDate||a.entryDate)||'').localeCompare((b.exitDate||b.entryDate)||''));
  else if(mode === 'pnl') arr.sort((a,b) => ((b.pnlPct??-Infinity) - (a.pnlPct??-Infinity)));
  else if(mode === 'name') arr.sort((a,b) => ((b.exitDate||b.entryDate)||'').localeCompare((a.exitDate||a.entryDate)||'')); // 종목명순일 때 내부는 최근순
  return arr;
}

// 탭5 메인 렌더
function mtRender(){
  const list = _mtLoad();
  const summaryEl = document.getElementById('mtTotalSummary');
  const sortBar = document.getElementById('mtSortBar');
  const listEl = document.getElementById('mtGroupList');
  const btnRow = document.getElementById('mtBtnRow');
  if(!summaryEl || !listEl) return;

  if(!list.length){
    summaryEl.innerHTML = '';
    listEl.innerHTML = '<div class="mt-empty">매매 기록이 없습니다<br><br>종목분석 탭에서 <b>매수</b> 버튼으로<br>시뮬레이션을 시작하세요</div>';
    if(sortBar) sortBar.style.display = 'none';
    if(btnRow) btnRow.style.display = 'none';
    return;
  }

  if(sortBar) sortBar.style.display = 'flex';
  if(btnRow) btnRow.style.display = 'flex';

  // 정렬 칩 active 상태
  document.querySelectorAll('#mtSortBar .mt-sort-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.sort === _mtSortMode);
  });

  // 전체 요약
  const closed = list.filter(t => t.status === 'CLOSED');
  const opens = list.filter(t => t.status === 'OPEN');
  const wins = closed.filter(t => t.result === 'WIN').length;
  const losses = closed.filter(t => t.result === 'LOSS').length;
  const total = wins + losses;
  const hitRate = total ? +(wins/total*100).toFixed(1) : 0;
  let cumMul = 1;
  closed.forEach(t => { cumMul *= (1 + (t.pnlPct||0)/100); });
  const totalPnl = +((cumMul - 1) * 100).toFixed(2);
  const totalPnlCls = totalPnl > 0.001 ? 'up' : totalPnl < -0.001 ? 'down' : '';
  const totalPnlStr = (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + '%';

  // [S316] 자세히 보기 — 단일검증탭 스타일 9개 통계 + 자산 흐름 (메인 통합)
  //   〔조건〕 CLOSED ≥ 1건일 때만 자산 흐름·자세히 보기 노출 (OPEN만 있으면 통계 의미 없음)
  //   〔구조〕 메인 카드(클릭 가능) = [총거래/WIN/LOSS/누적%] + [초기자본/실현손익/보유금]
  //          펼침 영역 = 9개 통계 (승률/PF/총수익률/총매매수/평균이익/평균손실/MDD/최대연속/기댓값)
  //   〔색상〕 단일검증탭 [S292]~[S295] 정책 동일 적용
  //   〔미실현〕 페이퍼탭은 여러 종목 캔들 캐시 보장 안 됨 → 통계에서 OPEN 제외
  let mainExtraHtml = '';   // 메인 카드 하단 자산 흐름 영역 (CLOSED ≥1)
  let expandedHtml = '';    // 펼침 영역 9개 통계
  let toggleIndicator = ''; // 적중률 줄 끝 ▼/▶ 인디케이터
  let cardOnclick = '';     // 카드 클릭 핸들러 (CLOSED ≥1만 활성)
  let cardCursor = '';      // 클릭 가능 시 cursor:pointer

  // [S316-fix5+fix6] 자산 흐름은 항상 표시 + 데이터 없음 "—" 처리
  //   〔fix5〕 평균이익·평균손실·승률·손익비는 모집단 없을 때 "—" (이전 +0%/-0%/0 등)
  //          MDD·최대연속손실은 실제 의미 있는 0이라 그대로 (0=변동 없음/연속 손실 없음)
  //   〔fix6〕 자산 흐름은 청산 0건이어도 항상 표시 (100만원/+0/100만원)
  //          이전엔 첫 청산되는 순간 카드에 새 줄이 생겨 사용자에게 "버그 오해" 유발
  //          → CLOSED와 무관하게 시작부터 동기화된 모습 유지
  // 자산 흐름 — CLOSED 0건이어도 항상 계산 (cumMul=1 → finalEq=INIT_CAP)
  const COLOR_POS='#22c55e', COLOR_NEG='#e8365a', COLOR_PURPLE='#8b5cf6', COLOR_BLUE='#3b82f6', COLOR_ORANGE='#f97316';
  const INIT_CAP = 1_000_000;
  const finalEq = INIT_CAP * cumMul;
  const realizedDelta = finalEq - INIT_CAP;
  // 색상: 청산 0건이면 중립색(--text) — 손익 발생 전이라 색 의미 없음
  const realizedColor = closed.length === 0 ? 'var(--text)'
                      : totalPnl >= 0 ? COLOR_POS : COLOR_NEG;
  const fmtKrw = (v) => Math.round(v).toLocaleString();
  mainExtraHtml = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
    <div class="mt-total-item"><div class="mt-total-num" style="color:var(--text);font-size:13px">${fmtKrw(INIT_CAP)}</div><div class="mt-total-lbl">초기자본 (원)</div></div>
    <div class="mt-total-item"><div class="mt-total-num" style="color:${realizedColor};font-size:13px">${realizedDelta>=0?'+':''}${fmtKrw(realizedDelta)}</div><div class="mt-total-lbl">누적 실현손익 (원)</div></div>
    <div class="mt-total-item"><div class="mt-total-num" style="color:${realizedColor}">${fmtKrw(finalEq)}</div><div class="mt-total-lbl">현재 보유금 (원)</div></div>
  </div>`;

  if(closed.length >= 1){
    // 시간순 정렬 (청산일 기준) — MDD/최대연속손실 계산에 순서 중요
    const closedSorted = [...closed].sort((a,b) =>
      ((a.exitDate||a.entryDate)||'').localeCompare((b.exitDate||b.entryDate)||'')
    );
    const winTrades = closedSorted.filter(t => t.result === 'WIN');
    const lossTrades = closedSorted.filter(t => t.result === 'LOSS');
    // 평균이익/평균손실
    const avgWin = winTrades.length
      ? +(winTrades.reduce((s,t)=>s+(t.pnlPct||0), 0) / winTrades.length).toFixed(2)
      : 0;
    const avgLossRaw = lossTrades.length
      ? lossTrades.reduce((s,t)=>s+(t.pnlPct||0), 0) / lossTrades.length
      : 0;
    const avgLoss = +Math.abs(avgLossRaw).toFixed(2); // 표시는 절대값
    // 손익비 (PF) — 손실 0 → ∞
    const grossProfit = winTrades.reduce((s,t)=>s+(t.pnlPct||0), 0);
    const grossLoss = Math.abs(lossTrades.reduce((s,t)=>s+(t.pnlPct||0), 0));
    let profitFactor;
    if(grossLoss > 0) profitFactor = +(grossProfit / grossLoss).toFixed(2);
    else if(grossProfit > 0) profitFactor = 99.99;
    else profitFactor = 0;
    // MDD — equity curve 기반 (시간순 누적)
    let eqMdd = 1, peakMdd = 1, mddVal = 0;
    closedSorted.forEach(t => {
      eqMdd *= (1 + (t.pnlPct||0)/100);
      if(eqMdd > peakMdd) peakMdd = eqMdd;
      const dd = (peakMdd - eqMdd) / peakMdd * 100;
      if(dd > mddVal) mddVal = dd;
    });
    mddVal = +mddVal.toFixed(2);
    // 최대 연속 손실
    let curStreak = 0, maxConsecLoss = 0;
    closedSorted.forEach(t => {
      if(t.result === 'LOSS'){
        curStreak++;
        if(curStreak > maxConsecLoss) maxConsecLoss = curStreak;
      } else { curStreak = 0; }
    });
    // 기댓값 = (승률 × 평균이익) - (패율 × 평균손실)
    const expVal = total > 0
      ? (wins/total)*avgWin - (losses/total)*avgLoss
      : 0;
    const expValStr = total > 0 ? (expVal >= 0 ? '+' : '') + expVal.toFixed(2) + '%' : '—';
    // [S316-fix5] 표시 문자열 — 모집단 없을 때 "—"
    const winRateStr = total > 0 ? `${hitRate}%` : '—';
    const pfStr = (winTrades.length === 0 && lossTrades.length === 0)
      ? '—'
      : (profitFactor >= 99 ? '∞' : profitFactor);
    const avgWinStr = winTrades.length > 0 ? `+${avgWin}%` : '—';
    const avgLossStr = lossTrades.length > 0 ? `-${avgLoss}%` : '—';
    // 색상 정책 — "—" 표시일 땐 중립색
    const winColor = total === 0 ? 'var(--text3)'
      : hitRate >= 60 ? COLOR_POS : hitRate >= 40 ? COLOR_BLUE : hitRate >= 20 ? COLOR_ORANGE : COLOR_NEG;
    const pfColor = (winTrades.length === 0 && lossTrades.length === 0) ? 'var(--text3)'
      : profitFactor >= 2.0 ? COLOR_POS : profitFactor >= 1.5 ? COLOR_BLUE : profitFactor >= 1.0 ? COLOR_ORANGE : COLOR_NEG;
    const avgWinColor = winTrades.length > 0 ? COLOR_POS : 'var(--text3)';
    const avgLossColor = lossTrades.length > 0 ? COLOR_NEG : 'var(--text3)';
    const pnlColor = totalPnl >= 100 ? COLOR_POS : totalPnl >= 50 ? COLOR_BLUE : totalPnl >= 0 ? COLOR_ORANGE : COLOR_NEG;
    const mddColor = Math.abs(mddVal) >= 20 ? COLOR_NEG : Math.abs(mddVal) >= 10 ? COLOR_PURPLE : COLOR_BLUE;
    const evColor = expVal >= 1.0 ? COLOR_POS : expVal >= 0 ? COLOR_ORANGE : COLOR_NEG;
    const closedCount = closed.length;
    let tradesColor;
    if(closedCount < 10) tradesColor = COLOR_NEG;
    else if(closedCount < 30) tradesColor = COLOR_BLUE;
    else tradesColor = COLOR_POS;
    // 적중률 줄 끝 ▼/▶ 인디케이터
    toggleIndicator = ` · <span style="color:var(--text);font-weight:700">자세히 ${_mtStatsOpen?'▼':'▶'}</span>`;
    // 펼침 영역 9개 통계
    // [S316-fix1] 인라인 style에 display 속성 중복 금지
    //   이전: style="${_bodyStyle};...display:grid;..."
    //         → 'display:none' 다음 'display:grid'가 와서 항상 grid로 덮어써짐
    //         → _mtStatsOpen=false여도 펼쳐진 상태로 표시됨 (접기 불가)
    //   해결: 펼친 상태에서만 HTML 렌더, 접힌 상태는 빈 문자열
    if(_mtStatsOpen){
      expandedHtml = `<div style="margin-bottom:8px;padding:10px 4px 4px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px 6px">
        <div class="mt-total-item"><div class="mt-total-num" style="color:${winColor}">${winRateStr}</div><div class="mt-total-lbl">승률</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${pfColor}">${pfStr}</div><div class="mt-total-lbl">손익비(PF)</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${pnlColor}">${totalPnl>=0?'+':''}${totalPnl}%</div><div class="mt-total-lbl">총수익률</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${tradesColor}">${closedCount}</div><div class="mt-total-lbl">총매매수</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${avgWinColor}">${avgWinStr}</div><div class="mt-total-lbl">평균이익</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${avgLossColor}">${avgLossStr}</div><div class="mt-total-lbl">평균손실</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${mddColor}">${mddVal}%</div><div class="mt-total-lbl">MDD</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${COLOR_NEG}">${maxConsecLoss}</div><div class="mt-total-lbl">최대연속손실</div></div>
        <div class="mt-total-item"><div class="mt-total-num" style="color:${evColor}">${expValStr}</div><div class="mt-total-lbl">기댓값</div></div>
      </div>`;
    }
    // 카드 전체 클릭 가능
    cardOnclick = ' onclick="mtToggleStats()"';
    cardCursor = 'cursor:pointer;';
  }

  // [S316-fix3] 적중률 줄을 카드 내부로 통합
  //   배경: 이전엔 카드 밖에 두어서 시각적으로 분리돼 보이고, 사용자가 "자세히 ▶" 줄을 직접
  //         눌러봐도 onclick 미부여로 무반응(카드 onclick만 활성). 클릭 영역 인지 미스매치.
  //   변경: 자산흐름 아래 점선 구분선 안쪽으로 이동 → 카드 onclick에 자연스럽게 포함
  //         CLOSED 0건이면 mainExtraHtml/toggleIndicator 모두 빈 상태라 적중률 줄만 표시
  summaryEl.innerHTML = `<div class="mt-total-summary"${cardOnclick} style="${cardCursor}display:block">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
      <div class="mt-total-item"><div class="mt-total-num">${list.length}</div><div class="mt-total-lbl">총 거래${opens.length?` (보유 ${opens.length})`:''}</div></div>
      <div class="mt-total-item"><div class="mt-total-num up">${wins}</div><div class="mt-total-lbl">WIN</div></div>
      <div class="mt-total-item"><div class="mt-total-num down">${losses}</div><div class="mt-total-lbl">LOSS</div></div>
      <div class="mt-total-item"><div class="mt-total-num ${totalPnlCls}">${totalPnlStr}</div><div class="mt-total-lbl">누적 수익률</div></div>
    </div>
    ${mainExtraHtml}
    <div style="text-align:center;font-size:10px;color:var(--text3);margin-top:10px">적중률 ${hitRate}% · 복리 기준${toggleIndicator}</div>
  </div>
  ${expandedHtml}`;

  // 종목별 그룹
  const groups = _mtSortGroups(_mtGroupByCode(list));
  listEl.innerHTML = groups.map(g => {
    const open = !!_mtOpenGroups[g.code];
    const mktLabel = { kr:'KR', us:'US', coin:'COIN' }[g.market] || (g.market||'').toUpperCase() || '—';
    const cumCls = g.cumPnl > 0.001 ? 'up' : g.cumPnl < -0.001 ? 'down' : '';
    const cumStr = (g.cumPnl >= 0 ? '+' : '') + g.cumPnl.toFixed(2) + '%';
    const openBadge = g.openCount ? `<span class="mt-group-stat" style="color:var(--hold)">보유 ${g.openCount}</span>` : '';

    // 개별 거래 리스트
    const sortedTrades = _mtSortTrades(g.trades);
    const bodyHtml = sortedTrades.map(t => _mtRenderTradeRow(t)).join('');

    return `<div class="mt-group${open?' open':''}" data-code="${g.code}">
      <div class="mt-group-head" onclick="mtToggleGroup('${g.code}')">
        <span class="mt-caret">▶</span>
        <span class="mt-group-name">${g.name||g.code}</span>
        <span class="mt-group-market">${mktLabel}</span>
        <div class="mt-group-summary">
          <span class="mt-group-stat">${g.count}건</span>
          ${openBadge}
          <span class="mt-group-stat">승 <span class="v up">${g.wins}</span></span>
          <span class="mt-group-stat">패 <span class="v down">${g.losses}</span></span>
          <span class="mt-group-stat">${g.hitRate}%</span>
          <span class="mt-group-stat"><span class="v ${cumCls}">${cumStr}</span></span>
        </div>
        <button class="mt-group-del" onclick="mtDeleteGroup('${g.code}', event)" title="종목 전체 삭제">🗑</button>
      </div>
      <div class="mt-group-body">${bodyHtml}</div>
    </div>`;
  }).join('');
}

function _mtRenderTradeRow(t){
  const isOpen = t.status === 'OPEN';
  const badge = isOpen ? 'OPEN' : t.result;
  const entry = t.entryPrice || 0;
  const exit = t.exitPrice || 0;
  const pnl = t.pnlPct;
  let pnlHtml = '';
  if(isOpen){
    // [S316-fix7] 보유중 정보는 OPEN 배지(좌측)와 가격 (→ …)에서 이미 표시되니
    //   이 자리는 액션 버튼(매도)으로 활용. event.stopPropagation으로 그룹 토글 방지
    // [S316-fix8] outline 스타일 — 솔리드 황색이 너무 강조되어 누름 충동 유발 →
    //   투명 배경 + 주황 테두리/글씨로 톤다운 (transparent로 다크모드 호환)
    pnlHtml = `<button class="mt-trade-pnl" data-sell-id="${t.id}" onclick="event.stopPropagation();mtSellById('${t.id}')" style="background:transparent;color:var(--hold,#f59e0b);border:1px solid var(--hold,#f59e0b);padding:3px 12px;border-radius:6px;font-weight:600;font-size:11px;cursor:pointer">매도</button>`;
  } else {
    const cls = pnl > 0.001 ? 'up' : pnl < -0.001 ? 'down' : 'flat';
    const str = (pnl >= 0 ? '+' : '') + (pnl||0).toFixed(2) + '%';
    pnlHtml = `<span class="mt-trade-pnl ${cls}">${str}</span>`;
  }
  const d = new Date(t.exitDate || t.entryDate);
  const dateStr = isNaN(d) ? '' : `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const pricesStr = isOpen
    ? `${entry.toLocaleString()} → …`
    : `${entry.toLocaleString()} → ${exit.toLocaleString()}`;
  return `<div class="mt-trade-row">
    <span class="mt-trade-badge ${badge}">${badge}</span>
    <span class="mt-trade-date">${dateStr}</span>
    <span class="mt-trade-prices">${pricesStr}</span>
    ${pnlHtml}
    <button class="mt-trade-del" onclick="mtDeleteTrade('${t.id}')" title="삭제">×</button>
  </div>`;
}

// ============================================================
//  S200-legacy: 구 페이퍼 트레이딩 함수 호환용 stub
//   (기존 코드가 btRenderPaper 등을 호출해도 에러 나지 않도록)
// ============================================================
function btRenderPaper(){ /* deprecated → mtRender()로 대체됨 */ }

// ── Bridge 연동: BT 결과 저장 ──
function _btSaveBtResult(stock, r){
  try{
    const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
    const payload = {
      type:'bt_result', source:'sx_screener', version:'v2.1',
      saved_at:new Date().toISOString(),
      ticker:stock.code, name:stock.name||stock.code,
      market:stock.market||'', tf:_btTF(), tf_label:tfLabels[_btTF()]||_btTF(),
      winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
      mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin, avgLoss:r.avgLoss,
      maxConsecLoss:r.maxConsecLoss||0,
      trades:r.trades||[], // S93: btHistAccumulate에서 trades 참조 필요
    };
    localStorage.setItem(SX_BT_RESULT_KEY, JSON.stringify(payload));
  }catch(e){console.error('BT result save error',e);}
}

function _btSaveBtCross(results){
  // [PATCH-8] null/undefined/비배열 방어 — silent crash (console.error) 방지
  if (!results || !Array.isArray(results)) {
    console.warn('[PATCH-8] _btSaveBtCross: invalid results arg, skip save');
    return;
  }
  try{
    const valid = results.filter(r=>r.totalTrades>0);
    const avgWR = valid.length ? +(valid.reduce((s,r)=>s+r.winRate,0)/valid.length).toFixed(1) : 0;
    const avgPnl = valid.length ? +(valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length).toFixed(2) : 0;
    const stdPnl = valid.length>1 ? +Math.sqrt(valid.reduce((s,r)=>s+(r.totalPnl-avgPnl)**2,0)/(valid.length-1)).toFixed(2) : 0;
    const payload = {
      type:'bt_cross', source:'sx_screener', version:'v2.1',
      saved_at:new Date().toISOString(), tf:_btTF(),
      total:results.length, valid:valid.length,
      avgWinRate:avgWR, avgPnl:avgPnl, stdPnl:stdPnl,
      consistency:stdPnl<10?'안정':'불안정',
      items:results.map(r=>({name:r.name,code:r.code||'',winRate:r.winRate,profitFactor:r.profitFactor,totalPnl:r.totalPnl,mdd:r.mdd,totalTrades:r.totalTrades}))
    };
    localStorage.setItem(SX_BT_CROSS_KEY, JSON.stringify(payload));
  }catch(e){console.error('BT cross save error',e);}
}
