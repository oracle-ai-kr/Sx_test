// ════════════════════════════════════════════════════════════
//  SIGNAL X — BT Module v1.15
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

// S162: 교차검증 최소 봉수 (시장별)
//   통계적 유의성 확보용. 봉수 부족 캐시는 교차검증에서 제외 → 자동 보강으로 해결
//   kr/coin: 확장 API 지원 (600봉 목표, 400이면 통계 충분)
//   us: 확장 API 미지원, 단일 fetch 300봉이 최대 → 200봉이면 통과
const CROSS_MIN_BARS = { kr: 400, coin: 400, us: 200 };

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

function _crossMinBars(market){
  const m = _normalizeMarket(market);
  return CROSS_MIN_BARS[m] || 400;
}

function _watchBtKey(market, code){
  // S162-fix2: 시장 정규화 (KOSPI → kr) — 기존 캐시 키와 일관성
  const m = (typeof _normalizeMarket === 'function') ? _normalizeMarket(market) : (market || 'kr');
  return `${m}_${code}`;
}

// 전체 캐시 로드
function _watchBtLoadAll(){
  try{
    const raw = localStorage.getItem(SX_WATCH_BT_CACHE_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  }catch(e){ return {}; }
}

// 전체 캐시 저장
function _watchBtSaveAll(data){
  try{ localStorage.setItem(SX_WATCH_BT_CACHE_KEY, JSON.stringify(data||{})); }catch(e){ console.warn('[S110] watch BT save err', e); }
}

// 특정 종목 캐시 조회 (만료 체크 포함)
//   반환: { market, code, name, tf, saved_at, btResult } or null
//   S162: strictBars=true 옵션 — 시장별 최소 봉수 미달 시 null 반환 (교차검증용)
function _watchBtGet(market, code, tf, strictBars){
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
  // S161: 게이트 해시 체크 — 게이트 설정이 바뀌면 캐시 무효화
  //   현재 전역 게이트 해시와 저장 당시 해시 비교
  //   둘 다 없으면 (구버전 캐시) 무효화 처리 — 안전한 쪽
  if(typeof SXE !== 'undefined' && typeof SXE._btGateHash === 'function'){
    const curHash = SXE._btGateHash(SXE._btEntryGates || {});
    const savedHash = entry.btResult?._gateHash || null;
    if(savedHash !== curHash){
      console.log(`[S161-cache] 게이트 해시 불일치 (${savedHash||'none'} → ${curHash}) — ${entry.name||code} 캐시 무효화`);
      return null;
    }
  }
  // S162: 봉수 체크 (strictBars=true일 때만 — 교차검증에서 활성)
  if(strictBars){
    const bars = entry.btResult?.rowsLength || 0;
    const minBars = _crossMinBars(market);
    if(bars < minBars){
      // 반환 null이지만 별도 로그는 안 남김 (UI에서 "제외" 배지로 표시)
      return null;
    }
  }
  return entry;
}

// S161/S162: 캐시 미스 이유 확인 (통계용)
//   반환: 'hit' | 'no_cache' | 'tf_mismatch' | 'expired' | 'gate_changed' | 'insufficient_bars'
function _watchBtGetReason(market, code, tf, strictBars){
  const all = _watchBtLoadAll();
  const key = _watchBtKey(market, code);
  let entry = all[key];
  // S162-fix2: 구버전 캐시 fallback
  if(!entry && market && market !== _normalizeMarket(market)){
    entry = all[`${market}_${code}`];
  }
  if(!entry) return 'no_cache';
  if(tf && entry.tf !== tf) return 'tf_mismatch';
  if(!entry.saved_at || (Date.now() - entry.saved_at > WATCH_BT_TTL_MS)) return 'expired';
  if(typeof SXE !== 'undefined' && typeof SXE._btGateHash === 'function'){
    const curHash = SXE._btGateHash(SXE._btEntryGates || {});
    const savedHash = entry.btResult?._gateHash || null;
    if(savedHash !== curHash) return 'gate_changed';
  }
  if(strictBars){
    const bars = entry.btResult?.rowsLength || 0;
    const minBars = _crossMinBars(market);
    if(bars < minBars) return 'insufficient_bars';
  }
  return 'hit';
}

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
  const _curGateHash = (typeof SXE !== 'undefined' && typeof SXE._btGateHash === 'function')
    ? SXE._btGateHash(SXE._btEntryGates || {}) : 'g0';
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
      _gateHash: _curGateHash, // S161: 게이트 해시 — 캐시 무효화 판정용
      trades: (btResult.trades || []).map(t => ({
        entry: t.entry, exit: t.exit, pnl: t.pnl, type: t.type, bars: t.bars,
        entryDate: t.entryDate || '', exitDate: t.exitDate || ''
      })),
    }
  };
  _watchBtSaveAll(all);
  console.log(`[S110-watchBt] ✅ 캐시 저장: ${stock.name||stock.code} (${tf||_btTF()}, 거래 ${btResult.totalTrades}, ${btResult.rowsLength||0}봉, 해시 ${_curGateHash})`);
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
async function _runBtWithExtension(stock, tf, quiet){
  try{
    const _tf = tf || _btTF();
    // S162-fix2: 시장 정규화 (KOSPI/KOSDAQ/ETF → kr)
    const _mktRaw = stock.market || stock._mkt || currentMarket;
    const _mkt = (typeof _normalizeMarket === 'function') ? _normalizeMarket(_mktRaw) : _mktRaw;
    const _isExtSupported = (_mkt === 'coin' || _mkt === 'kr');
    const _targetCount = (_tf === 'week' || _tf === 'month') ? 400 : 600;
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
    // 경로 B: 부분 캐시 확장
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      const _existing = stock._lastAnalCandles.slice();
      const _needed = _targetCount - _existing.length;
      console.log(`[S110-runBt] ${stock.name||stock.code} 경로B: 기존 ${_existing.length}봉 → 목표 ${_targetCount}봉 (+${_needed}봉 필요)`);
      if(_needed > 0){
        try{
          const _extra = await fetchCandlesExtended(stock.code, _tf, _existing[0].date || _existing[0].t, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            console.log(`[S110-runBt] ${stock.name||stock.code} 경로B 완료: +${_extra.length}봉 → ${rows.length}봉`);
          } else {
            rows = _existing;
            console.warn(`[S110-runBt] ${stock.name||stock.code} 경로B 확장 실패: fetchCandlesExtended 반환 ${_extra===null?'null':'빈배열'}`);
          }
        }catch(e){
          rows = _existing;
          console.warn(`[S110-runBt] ${stock.name||stock.code} 경로B 예외: ${e.message||e}`);
        }
      } else {
        rows = _existing;
        console.log(`[S110-runBt] ${stock.name||stock.code} 경로B: 이미 충족 (확장 불필요)`);
      }
    }
    // 경로 C: 캐시 없음 → 새로 3단계 (200 → 400 → 600)
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      console.log(`[S110-runBt] ★ ${stock.name||stock.code} 새 3단계 확장 (목표: ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _isCoin, _tf, 200);
      if(!_first || _first.length === 0) return { ok:false, error:'초기 데이터 로드 실패' };
      rows = _first;
      console.log(`[S110-runBt] ${stock.name||stock.code} 1단계 완료: ${rows.length}봉 (btFetchCandles)`);

      if(_targetCount > 200){
        await _btSleep(2000);
        try{
          const _extra1 = await fetchCandlesExtended(stock.code, _tf, rows[0].date || rows[0].t, 200);
          if(_extra1 && _extra1.length > 0){
            rows = [..._extra1, ...rows];
            console.log(`[S110-runBt] ${stock.name||stock.code} 2단계 완료: +${_extra1.length}봉 → ${rows.length}봉`);
          } else {
            console.warn(`[S110-runBt] ${stock.name||stock.code} 2단계 실패: fetchCandlesExtended 반환 ${_extra1===null?'null':'빈배열'} · oldestDate=${rows[0].date} · currentMarket=${typeof currentMarket!=='undefined'?currentMarket:'?'}`);
          }
        }catch(e){ console.warn(`[S110-runBt] ${stock.name||stock.code} 2단계 예외: ${e.message||e}`); }
      }

      if(_targetCount > 400 && rows.length >= 400){
        await _btSleep(2000);
        try{
          const _extra2 = await fetchCandlesExtended(stock.code, _tf, rows[0].date || rows[0].t, 200);
          if(_extra2 && _extra2.length > 0){
            rows = [..._extra2, ...rows];
            console.log(`[S110-runBt] ${stock.name||stock.code} 3단계 완료: +${_extra2.length}봉 → ${rows.length}봉`);
          } else {
            console.warn(`[S110-runBt] ${stock.name||stock.code} 3단계 실패: fetchCandlesExtended 반환 ${_extra2===null?'null':'빈배열'} · oldestDate=${rows[0].date}`);
          }
        }catch(e){ console.warn(`[S110-runBt] ${stock.name||stock.code} 3단계 예외: ${e.message||e}`); }
      } else if(_targetCount > 400 && rows.length < 400){
        console.warn(`[S110-runBt] ${stock.name||stock.code} 3단계 건너뜀: 2단계 후 ${rows.length}봉 (400 미만)`);
      }

      // stock에 확장 캐시 보존 (다음 재사용용)
      stock._lastAnalCandles = rows.slice();
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
    }
    // 경로 D: 시장 미지원
    else {
      const count = (_tf === 'week' || _tf === 'month') ? 400 : 300;
      rows = await btFetchCandles(stock.code, _isCoin, _tf, count);
    }

    if(!rows || rows.length === 0) return { ok:false, error:'캔들 데이터 수집 실패' };

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

    const params = btGetParams();
    const opts = btGetOpts();
    const r = sxRunBtEngine(rows, _tf, params, opts);

    if(r.error) return { ok:false, error:r.error, shortage:r.shortage };

    // S110 fix4: 결과에 실제 사용된 봉수 포함 (투명성 — 🔴/🔵/🟢 표시용)
    r.rowsLength = rows.length;

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
    const _isExtSupported = (_mkt === 'coin' || _mkt === 'kr');
    const _targetCount = (_tf === 'week' || _tf === 'month') ? 400 : 600;
    const _isCoin = (_mkt === 'coin');
    let rows = null;

    // 경로 A: 이미 확장된 세션 캐시 재사용 (즉시)
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount);
      if(!quiet) console.log(`[S113-ext] 캐시 재사용: ${rows.length}봉 (${stock.code})`);
    }
    // 경로 B: 부분 캐시 확장 (200~400봉 → 600봉)
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      const _existing = stock._lastAnalCandles.slice();
      const _needed = _targetCount - _existing.length;
      if(_needed > 0){
        try{
          const _extra = await fetchCandlesExtended(stock.code, _tf, _existing[0].date || _existing[0].t, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            if(!quiet) console.log(`[S113-ext] 부분 확장: ${_existing.length} + ${_extra.length} = ${rows.length}봉 (${stock.code})`);
          } else {
            rows = _existing;
          }
        }catch(e){ rows = _existing; }
      } else {
        rows = _existing;
      }
      // S113: 확장 결과 세션 공유 저장 (경로 A와 일관)
      if(rows && rows.length > _existing.length){
        stock._lastAnalCandles = rows.slice();
        if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
        else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
      }
    }
    // 경로 C: 캐시 없음 → 새로 3단계 확장 (200 → 400 → 600)
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      if(!quiet) console.log(`[S113-ext] ★ 새 3단계 확장 시작 (${stock.code}, 목표: ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _isCoin, _tf, 200);
      if(!_first || _first.length === 0) return { ok:false, error:'초기 데이터 로드 실패' };
      rows = _first;

      if(_targetCount > 200){
        await _btSleep(2000);
        try{
          const _extra1 = await fetchCandlesExtended(stock.code, _tf, rows[0].date || rows[0].t, 200);
          if(_extra1 && _extra1.length > 0) rows = [..._extra1, ...rows];
        }catch(e){}
      }

      if(_targetCount > 400 && rows.length >= 400){
        await _btSleep(2000);
        try{
          const _extra2 = await fetchCandlesExtended(stock.code, _tf, rows[0].date || rows[0].t, 200);
          if(_extra2 && _extra2.length > 0) rows = [..._extra2, ...rows];
        }catch(e){}
      }

      // 확장 결과 세션 캐시에 보존 (다른 모듈 재사용용)
      stock._lastAnalCandles = rows.slice();
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
      if(!quiet) console.log(`[S113-ext] 3단계 완료: ${rows.length}봉 (${stock.code})`);
    }
    // 경로 D: 시장 미지원 (해외 등) — 단일 fetch
    else {
      const count = (_tf === 'week' || _tf === 'month') ? 400 : 300;
      rows = await btFetchCandles(stock.code, _isCoin, _tf, count);
      if(!quiet) console.log(`[S113-ext] 시장 미지원 — 단일 fetch: ${rows?.length||0}봉 (${stock.code})`);
    }

    if(!rows || rows.length === 0) return { ok:false, error:'캔들 데이터 수집 실패' };
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
function btHistClear(){
  const stock = _btCurrentStock();
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }
  const market = stock._mkt || stock.market || currentMarket;
  const hist = _btHistLoad(market);
  if(!hist[stock.code] || !hist[stock.code].length){ toast('누적 데이터가 없습니다'); return; }
  if(!confirm(`${stock.name||stock.code}의 검증 누적 데이터를 삭제하시겠습니까?`)) return;
  delete hist[stock.code];
  _btHistSave(market, hist);
  toast('검증 데이터 삭제됨');
  _btHistUpdateUI(stock);
}

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
//   기존 버그: entryIdx는 rows 전체 기준(BT_WARMUP 이후부터 시작)인데
//             _totalBars(=scores.length=rows.length-BT_WARMUP)와 비교해서 거의 항상 true가 됨
//   수정: btResult.rowsLength 우선 사용, 없으면 scores.length+BT_WARMUP(100)으로 추정
function _btGetRowsLen(btResult){
  if(!btResult) return 0;
  if(typeof btResult.rowsLength === 'number' && btResult.rowsLength > 0) return btResult.rowsLength;
  // fallback: 구버전 btResult (rowsLength 없음) — scores.length + BT_WARMUP 추정
  //   BT_WARMUP은 analysis_engine에서 100(full) 또는 50(min). 안전하게 100 가정.
  if(btResult.scores && btResult.scores.length) return btResult.scores.length + 100;
  return 0;
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
    // S99+fix7: 매수신호 현재봉 판별 — rowsLength(rows 전체) 기준으로 최근 2봉 이내
    const _isBuySignal = lastTrade.entryIdx != null && _rowsLen > 0 && lastTrade.entryIdx >= _rowsLen - 2;
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
  // S103-fix7 Phase3-A-1: rowsLength 기준으로 통일
  if(lastTrade.exitIdx != null && _rowsLen > 0 && lastTrade.exitIdx >= _rowsLen - 2){
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
  // 그 외 → 대기중
  const lastScore = btResult.scores ? btResult.scores[btResult.scores.length-1] : null;
  return {
    state:'waiting',
    currentScore: lastScore,
    buyTh: btResult.params?.buyTh || 62,
    text: '대기중' + (lastScore != null ? ' — 현재 점수 ' + lastScore : ''),
    color: 'var(--text3)'
  };
}

function _btSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── BT용 캔들 fetch (Yahoo Finance 경유) ──
let _btCandleCache = {};
async function btFetchCandlesYF(code, tf, count){
  tf = tf||'day';
  const yfTf = {day:'1d',week:'1wk',month:'1mo'}[tf]||'1d';
  const range = {day:'5y',week:'10y',month:'max'}[tf]||'5y';
  const cacheKey = `yf_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

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
  })).filter(r=>r.c>0);
  if(rows.length<30) throw new Error(`캔들 데이터 부족 (${rows.length}봉)`);
  _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
  return rows.slice(-count);
}

// ── BT용 캔들: 코인(업비트 Workers v9) ──
async function btFetchCandlesCoin(code, tf, count){
  tf = tf||'day';
  const cacheKey = `coin_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

  const tfMap = {day:'days','5m':'minutes/5','15m':'minutes/15','30m':'minutes/30','60m':'minutes/60','240m':'minutes/240',week:'weeks',month:'months'};
  const upbitTf = tfMap[tf]||'days';
  const market = 'KRW-'+code.replace('KRW-','');
  const PAGE = 200; // 업비트 단일 호출 최대
  const pages = Math.ceil(count / PAGE);
  let allArr = [];
  let cursor = ''; // to 파라미터 (빈값=최신부터)

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

  if(allArr.length<30) throw new Error(`코인 캔들 부족 (${allArr.length}봉)`);
  const rows = allArr.map(k=>({
    t: k.candle_date_time_kst||k.candle_date_time_utc||'',
    o: k.opening_price||0, h: k.high_price||0,
    l: k.low_price||0, c: k.trade_price||0,
    v: k.candle_acc_trade_volume||0,
  })).filter(r=>r.c>0).reverse(); // 업비트는 최신순 → 오래된순 정렬
  _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
  return rows.slice(-count);
}

// ── BT용 캔들 통합 ──
// S93: 하이브리드 — ① 스크리너 캔들 캐시 공유 → ② 캐시 미스 시 독립 fetch
//   kr: KIS 우선 → 네이버 폴백 (분석탭과 동일 소스 정합)
//   us: Yahoo
//   coin: 업비트
async function btFetchCandles(code, isCoin, tf, count){
  count = count||300;
  if(isCoin) return btFetchCandlesCoin(code, tf, count);

  const mkt = currentMarket || (isCoin?'coin':/^\d{6}$/.test(code)?'kr':'us');

  // ① 스크리너 캔들 캐시 조회 (candleCache는 글로벌)
  if(typeof candleCache !== 'undefined'){
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
  if(mkt === 'kr') return btFetchCandlesKR(code, tf, count);
  return btFetchCandlesYF(code, tf, count);
}

// S93: 스크리너 캔들 형태 → BT 형태 변환 ({date,open,...} → {t,o,...})
function _btNormalizeRows(rows){
  if(!rows || !rows.length) return rows;
  const f = rows[0];
  if(f.t !== undefined){
    // 이미 BT 형태 — S162-fix3: date 필드도 동기화 (fetchCandlesExtended 호환)
    if(f.date === undefined && f.t){
      return rows.map(r => ({...r, date: r.date || r.t || ''}));
    }
    return rows;
  }
  return rows.map(r=>({
    t: r.date||'', date: r.date||'', // S162-fix3: date 필드 보존
    o: r.open||0, h: r.high||0,
    l: r.low||0, c: r.close||0, v: r.volume||0,
  }));
}

// S93: 국내주식 KIS 우선 → 네이버 폴백 (스크리너 fetchCandles와 동일 소스)
async function btFetchCandlesKR(code, tf, count){
  tf = tf||'day';
  const cacheKey = `kr_kis_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

  // KIS 시도
  if(window._kisEnabled && typeof _getKisConfig === 'function'){
    try{
      const rows = await _btFetchKIS(code, tf, count);
      if(rows && rows.length >= 30){
        _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
        return rows.slice(-count);
      }
    }catch(e){ console.warn('[BT] KIS fetch err, fallback to Naver', e); }
  }

  // 네이버 폴백
  try{
    const rows = await _btFetchNaver(code, tf, count);
    if(rows && rows.length >= 30){
      _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
      return rows.slice(-count);
    }
  }catch(e){ console.warn('[BT] Naver fetch err, fallback to Yahoo', e); }

  // 최종 폴백: Yahoo
  return btFetchCandlesYF(code, tf, count);
}

// S93: KIS 일봉/주봉/월봉 (500봉 페이지네이션)
async function _btFetchKIS(code, tf, count){
  const periodMap = {'day':'D','week':'W','month':'M'};
  const period = periodMap[tf];
  if(!period) return null; // 분봉은 BT에서 미지원
  const cfg = _getKisConfig();
  const token = cfg ? await _getKisToken() : null;
  if(!token) return null;
  const KIS_PAGE = 100;
  const maxPages = Math.min(Math.ceil(count / KIS_PAGE), 5);
  let allBars = [];
  let curEnd = new Date().toISOString().slice(0,10).replace(/-/g,'');
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
    })).filter(r=>r.c>0);
    allBars = mapped.concat(allBars);
    if(bars.length < KIS_PAGE) break;
    const oldest = bars[bars.length-1]?.stck_bsop_date;
    if(!oldest) break;
    const od = new Date(oldest.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'));
    od.setDate(od.getDate() - 1);
    curEnd = od.toISOString().slice(0,10).replace(/-/g,'');
  }
  const seen = new Set();
  return allBars.filter(b=>{ if(seen.has(b.t)) return false; seen.add(b.t); return true; });
}

// S93: 네이버 sise 캔들 (스크리너와 동일 로직)
async function _btFetchNaver(code, tf, count){
  const tfMap={'day':'day','week':'week','month':'month'};
  const timeframe = tfMap[tf]||'day';
  const end = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const startDate = new Date();
  const dayRange = {'day':Math.ceil(count*1.8),'week':Math.ceil(count*10),'month':Math.ceil(count*35)}[tf] || Math.ceil(count*1.8);
  startDate.setDate(startDate.getDate() - dayRange);
  const start = startDate.toISOString().slice(0,10).replace(/-/g,'');
  const url = `${BT_PROXY}/naver/sise?symbol=${code}&timeframe=${timeframe}&start=${start}&end=${end}`;
  const res = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if(!res.ok) return null;
  const json = await res.json();
  let dataArr = json.data;
  if((!dataArr || !dataArr.length) && json.raw){
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
  return (dataArr||[]).map(r=>({
    t:r.localDate||r['날짜']||r.date||'',
    o:parseFloat(r.openPrice||r['시가']||r.open||0),
    h:parseFloat(r.highPrice||r['고가']||r.high||0),
    l:parseFloat(r.lowPrice||r['저가']||r.low||0),
    c:parseFloat(r.closePrice||r['종가']||r.close||0),
    v:parseInt(r.accumulatedTradingVolume||r['거래량']||r.volume||0),
  })).filter(r=>r.c>0);
}

// ── BT 파라미터 ──
// S99-4: _analTF 기준 + _analMode 대표 프리셋 연동
function btGetParams(){
  const th = _getEffectiveTh(_btTF());
  const ap = _loadAnalParams(); // _setAnalMode에서 이미 모드별 프리셋 저장됨
  return { buyTh:th.buyTh, sellTh:th.sellTh, tpMult:ap.tpMult||2.5, slMult:ap.slMult||1.5 };
}
function btGetOpts(){
  const slip = parseFloat(document.getElementById('btOptSlip')?.value||'1')/1000;
  const nextBar = document.getElementById('btOptNextBar')?.checked||false;
  return { slippage:slip, nextBarEntry:nextBar };
}

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
    // S109 Phase 3-B-9b: BT 탭 자동 3단계 확장 (200 → 400 → 600봉)
    //   단일검증은 검증용이라 신뢰도 최대가 기본값
    //   분석탭에서 이미 확장된 캔들(stock._lastAnalCandles) 재사용 (캐시 공유)
    //   시장: coin/kr만 지원, 미국(us)은 기존 단일 fetch 유지
    //   TF: 주봉/월봉은 400봉 (기존 유지), 나머지는 600봉 목표
    const _isExtSupported = (currentMarket === 'coin' || currentMarket === 'kr');
    const _btTFVal = _btTF();
    const _targetCount = (_btTFVal === 'week' || _btTFVal === 'month') ? 400 : 600;
    let rows = null;

    // 경로 A: 분석탭에서 이미 확장된 캐시 재사용 (즉시 가능)
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount); // 최신 _targetCount봉만
      progFill.style.width='50%'; progText.textContent=`확장 캐시 재사용 (${rows.length}봉)...`;
      await _btSleep(50);
      console.log(`[S109-9b] ★ 캐시 재사용: ${rows.length}봉 (분석탭 확장 결과)`);
    }
    // 경로 B: 분석탭에서 일부 확장됨 (_lastAnalCandles 400봉 등) + 시장 지원
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      progFill.style.width='15%'; progText.textContent=`기존 데이터 로드 (${stock._lastAnalCandles.length}봉)...`;
      const _existing = stock._lastAnalCandles.slice(); // 복사
      const _needed = _targetCount - _existing.length;
      if(_needed > 0){
        progFill.style.width='30%'; progText.textContent=`추가 ${_needed}봉 로드 중... (2초 대기)`;
        try{
          const _oldestDate = _existing[0].date;
          console.log(`[S109-9b] ★ 부분 캐시 확장: ${_existing.length}봉 → ${_targetCount}봉 (추가 ${_needed}봉)`);
          const _extra = await fetchCandlesExtended(stock.code, _btTFVal, _oldestDate, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            console.log(`[S109-9b] ✅ 병합 완료: ${_extra.length} + ${_existing.length} = ${rows.length}봉`);
          } else {
            console.warn(`[S109-9b] ⚠ 확장 실패 — 기존 ${_existing.length}봉으로 BT 실행`);
            rows = _existing;
          }
        }catch(extErr){
          console.warn('[S109-9b] 확장 예외:', extErr);
          rows = _existing;
        }
      } else {
        rows = _existing;
      }
      // ═══════════════════════════════════════════════════════
      // S112-fix1: 경로 B에서 _lastAnalCandles 업데이트 누락 버그 수정
      //
      // 문제: 분석탭 자동 확장으로 400봉 → 단일검증 경로 B (400+200=600봉 확장)
      //       → rows(지역변수)는 600봉이지만 stock._lastAnalCandles는 400봉 그대로
      //       → 분석탭 재진입 시 400봉 재사용 → 단일검증 결과와 불일치
      //       (카카오뱅크 케이스: 분석탭 거래 10회 vs 단일검증 16회)
      //
      // 해결: 확장된 rows를 stock._lastAnalCandles에 동기화
      //       → 양방향 공유 완성 (경로 A/C와 일관)
      //       → 분석탭 재진입 시 확장된 봉수 재사용
      //       → 분석 + BT + 단일검증 모두 같은 봉수로 정합
      //
      // ═══════════════════════════════════════════════════════
      if(rows && rows.length > _existing.length){
        stock._lastAnalCandles = rows.slice();
        if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
        else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
        console.log(`[S112-fix1] ★ 경로 B 확장 결과 세션 공유 저장: ${rows.length}봉 (stage ${stock._analCandlesExtendedStage})`);
      }
    }
    // 경로 C: 캐시 없음 + 시장 지원 → 새로 3단계 확장
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      progFill.style.width='10%'; progText.textContent='1단계: 200봉 로드 중...';
      console.log(`[S109-9b] ★ 새 3단계 확장 시작 (목표: ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _btIsCoin(), _btTFVal, 200);
      if(!_first || _first.length === 0){
        throw new Error('초기 데이터 로드 실패');
      }
      rows = _first;
      console.log(`[S109-9b] 1단계 완료: ${rows.length}봉`);

      if(_targetCount > 200){
        // 2단계: 400봉
        progFill.style.width='30%'; progText.textContent=`2단계: 400봉 확장 중... (2초 대기)`;
        await _btSleep(2000);
        try{
          const _oldestDate1 = rows[0].date;
          const _extra1 = await fetchCandlesExtended(stock.code, _btTFVal, _oldestDate1, 200);
          if(_extra1 && _extra1.length > 0){
            rows = [..._extra1, ...rows];
            console.log(`[S109-9b] 2단계 완료: ${rows.length}봉`);
          } else {
            console.warn(`[S109-9b] 2단계 실패 — ${rows.length}봉으로 진행`);
          }
        }catch(e1){ console.warn('[S109-9b] 2단계 예외:', e1); }
      }

      if(_targetCount > 400 && rows.length >= 400){
        // 3단계: 600봉
        progFill.style.width='50%'; progText.textContent=`3단계: 600봉 확장 중... (2초 대기)`;
        await _btSleep(2000);
        try{
          const _oldestDate2 = rows[0].date;
          const _extra2 = await fetchCandlesExtended(stock.code, _btTFVal, _oldestDate2, 200);
          if(_extra2 && _extra2.length > 0){
            rows = [..._extra2, ...rows];
            console.log(`[S109-9b] 3단계 완료: ${rows.length}봉`);
          } else {
            console.warn(`[S109-9b] 3단계 실패 — ${rows.length}봉으로 진행`);
          }
        }catch(e2){ console.warn('[S109-9b] 3단계 예외:', e2); }
      }

      // 확장 결과를 stock._lastAnalCandles에 보존 (분석탭 재진입 시 재사용 가능)
      stock._lastAnalCandles = rows.slice();
      // stage 플래그도 업데이트 (200→1, 400→2, 600+→2 clamp)
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
    }
    // 경로 D: 시장 미지원 (us 등) — 기존 300~400봉 단일 fetch
    else {
      const count = (_btTFVal === 'week' || _btTFVal === 'month') ? 400 : 300;
      progFill.style.width='30%'; progText.textContent=`${count}봉 로드 중...`;
      rows = await btFetchCandles(stock.code, _btIsCoin(), _btTFVal, count);
      console.log(`[S109-9b] 시장 미지원 — 단일 fetch: ${rows?.length||0}봉`);
    }

    if(!rows || rows.length === 0){
      throw new Error('캔들 데이터 수집 실패');
    }

    progFill.style.width='75%'; progText.textContent=`백테스트 실행 중... (${rows.length}봉)`;
    await _btSleep(50);

    const params = btGetParams();
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

    progFill.style.width='100%'; progText.textContent='완료';
    await _btSleep(200);

    if(r.error){
      result.style.display='block';
      const shortageInfo = r.shortage ? `<div style="font-size:10px;color:var(--text3);margin-top:6px">워밍업 ${r.barsNeeded-10}봉 + 매매 최소 10봉 = ${r.barsNeeded}봉 필요<br>현재 수집: ${r.barsHave}봉 · 부족: ${r.barsNeeded - r.barsHave}봉<br><span style="color:var(--accent)">💡 코인: 분봉→일봉 전환, 해외: 주봉 사용 권장</span></div>` : '';
      result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ ${r.error}</div>${shortageInfo}</div>`;
    } else {
      stock._btResult = r; // S93: 인메모리 저장 — btHistAccumulate에서 참조

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
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${e.message}</div></div>`;
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
  //   [색상 팔레트]
  //     - #22c55e 녹색: 기본 긍정 (승률/수익률/평균이익 — 양수)
  //     - #e8365a 빨강: 기본 부정 (음수값 / 평균손실 / 최대연속손실)
  //     - #ec4899 핑크: 보조 긍정 (손익비 — 항상 고정, 정보 톤)
  //     - #8b5cf6 보라: 보조 부정 (MDD — 항상 고정, 정보 톤)
  //     - 거래수 — 데이터 충족 라벨과 동일 색 연동 (< 10 빨강 / < 30 파랑 / >= 30 녹색)
  //   [이전 색상 — 변경 전]
  //     - 승률: 50% 기준 분기 (var(--buy)/var(--sell)) → 양수/음수 기준으로 단순화
  //     - 손익비(PF): 1.5/1.0 기준 3단계 → 핑크 고정
  //     - 총수익률: 양수/음수 분기 (유지)
  //     - 총매매수: 기본색 → 데이터 충족 연동
  //     - 평균이익: 항상 녹색 (유지)
  //     - 평균손실: 항상 빨강 (유지)
  //     - MDD: 빨강 → 보라 (항상 부정 지표지만 정보 톤으로 차별화)
  //     - 최대연속손실: 빨강 (유지)
  //   [라벨] 단일검증 탭 고유 네이밍 유지 (총수익률/총매매수/평균이익/평균손실/최대연속손실)
  //     — 분석탭 "평균소득"(totalPnl/trades)과 단일검증 "평균이익"(avgWin)은 계산 다름
  // ═══════════════════════════════════════════════════════════════
  const COLOR_POS = '#22c55e';    // 녹색 (긍정)
  const COLOR_NEG = '#e8365a';    // 빨강 (부정)
  const COLOR_PINK = '#f472b6';   // 핑크 (손익비 고정)
  const COLOR_PURPLE = '#8b5cf6'; // 보라 (MDD 고정)
  const winColor = r.winRate > 0 ? COLOR_POS : COLOR_NEG;         // 승률 (사실상 항상 녹색)
  const pnlColor = r.totalPnl >= 0 ? COLOR_POS : COLOR_NEG;       // 총수익률
  const pfColor = COLOR_PINK;                                      // 손익비(PF) 핑크 고정
  const mddColor = COLOR_PURPLE;                                   // MDD 보라 고정
  const avgWinColor = COLOR_POS;                                   // 평균이익 녹색 고정
  const avgLossColor = COLOR_NEG;                                  // 평균손실 빨강 고정
  const consecLossColor = COLOR_NEG;                               // 최대연속손실 빨강 (부정)
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
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${winColor}">${r.winRate}%</div><div class="bt-stat-label">승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pfColor}">${r.profitFactor}</div><div class="bt-stat-label">손익비(PF)</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pnlColor}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</div><div class="bt-stat-label">총수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${tradesColor}">${r.totalTrades}</div><div class="bt-stat-label">총매매수</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgWinColor}">+${r.avgWin}%</div><div class="bt-stat-label">평균이익</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgLossColor}">-${r.avgLoss}%</div><div class="bt-stat-label">평균손실</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${mddColor}">${r.mdd}%</div><div class="bt-stat-label">MDD</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${consecLossColor}">${r.maxConsecLoss||0}</div><div class="bt-stat-label">최대연속손실</div></div>
    </div>
  </div>`;

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

  // S44: 매매 0건 진단 카드
  if(r.totalTrades===0 && r.scores && r.scores.length){
    const params = btGetParams();
    const sorted = [...r.scores].sort((a,b)=>a-b);
    const maxS = Math.max(...r.scores), minS = Math.min(...r.scores), medS = sorted[Math.floor(sorted.length/2)];
    const aboveBuy = r.scores.filter(s=>s>=params.buyTh).length;
    const gap = params.buyTh - maxS;
    html += `<div class="bt-card" style="border-left:3px solid var(--accent)">
      <div class="bt-card-title" style="color:var(--accent)">🔍 매매 0건 진단</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.6">
        <b>BUY 임계값:</b> ${params.buyTh}점<br>
        <b>점수 범위:</b> ${minS} ~ ${maxS} (중앙값 ${medS})<br>
        <b>임계값 이상:</b> ${aboveBuy}봉 / ${r.scores.length}봉`;
    if(aboveBuy===0){
      html += `<br><br><span style="color:var(--sell)">점수 최고 ${maxS}이 BUY 임계값 ${params.buyTh}에 ${gap}점 부족</span>`;
      html += `<br><br><b>💡 해결 방법:</b><br>`;
      html += `· 설정 → 분석 파라미터 → BUY 임계 낮추기 (${Math.max(40,maxS-5)}~${maxS} 권장)<br>`;
      html += `· 타임프레임 변경 (일봉↔주봉)으로 다른 패턴 탐색<br>`;
      html += `· 해당 종목의 최근 변동성이 낮아 강한 시그널 미발생 가능`;
    } else {
      // S160: 게이트 차단이 원인인지 mom/osc가 원인인지 구분
      if((r.gateBlocks||0) > 0){
        html += `<br><br><span style="color:var(--accent)">임계값 이상 ${aboveBuy}봉 중 ${r.gateBlocks}봉은 진입 게이트에서 차단, 나머지는 mom/osc 필터 차단</span>`;
        html += `<br><span style="font-size:10px;color:var(--text3)">🚦 버튼을 눌러 일부 게이트를 꺼보면 매매가 발생할 수 있습니다</span>`;
      } else {
        html += `<br><br><span style="color:var(--accent)">임계값 이상 ${aboveBuy}봉 존재하나 mom/osc 필터에서 차단됨</span>`;
        html += `<br><span style="font-size:10px;color:var(--text3)">모멘텀(mom>0)과 오실레이터(osc>0) 두 조건을 동시에 만족해야 BUY 진입</span>`;
      }
    }
    html += `</div></div>`;
  }

  // 점수 분포 히스토그램
  if(r.scores && r.scores.length){
    const bins = Array(10).fill(0);
    r.scores.forEach(s=>{ const idx=Math.min(Math.floor(s/10),9); bins[idx]++; });
    const maxBin = Math.max(...bins,1);
    const params = btGetParams();
    const buyBin = Math.min(Math.floor(params.buyTh/10),9);
    const sellBin = Math.min(Math.floor(params.sellTh/10),9);
    const sorted = [...r.scores].sort((a,b)=>a-b);
    html += `<div class="bt-card"><div class="bt-card-title">점수 분포</div>`;
    html += `<div style="font-size:9px;color:var(--text3);margin-bottom:4px">봉 ${r.scores.length} · 중앙값 ${sorted[Math.floor(sorted.length/2)]} · 최고 ${Math.max(...r.scores)} · 최저 ${Math.min(...r.scores)}</div>`;
    for(let i=9;i>=0;i--){
      const pct = (bins[i]/maxBin*100).toFixed(0);
      const isBuy = i>=buyBin;
      const barColor = isBuy?'var(--buy)':'var(--text3)';
      const tag = i===buyBin?` <span style="color:var(--accent);font-weight:700;font-size:8px">← BUY(${params.buyTh})</span>`:'';
      const sellTag = i===sellBin?` <span style="color:var(--sell);font-weight:700;font-size:8px">← SELL(${params.sellTh})</span>`:'';
      html += `<div class="bt-hist-row">
        <span class="bt-hist-label">${i*10}-${i*10+9}</span>
        <div class="bt-hist-bar-wrap"><div class="bt-hist-bar" style="width:${pct}%;background:${barColor}"></div></div>
        <span class="bt-hist-cnt">${bins[i]}</span>${tag}${sellTag}
      </div>`;
    }
    html += `<div style="font-size:9px;color:var(--text3);margin-top:4px">buyTh(${params.buyTh}) 이상: ${r.scores.filter(s=>s>=params.buyTh).length}봉 → 최종 BUY ${r.totalTrades}</div>`;
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
      const _dateLine = _entryD
        ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;margin-left:44px">${_entryD} ~ ${_exitD}</div>`
        : '';
      html += `<div class="bt-trade-item" style="flex-direction:column;align-items:stretch;padding:6px 8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="bt-trade-type ${t.type}">${t.type}</span>
          <span style="flex:1;color:var(--text2)">${t.entry!=null?Math.round(t.entry).toLocaleString():'-'} → ${t.exit!=null?Math.round(t.exit).toLocaleString():'-'}</span>
          <span class="bt-trade-pnl" style="color:${pnlC}">${t.pnl>=0?'+':''}${t.pnl}%</span>
          <span class="bt-trade-bars">${t.bars}봉</span>
        </div>
        ${_dateLine}
      </div>`;
    }
    // S121-1: "... +N건 더" 는 오래된 거래가 생략됐음을 알리므로 맨 아래 유지
    if(r.trades.length>maxShow) html += `<div class="bt-trade-item" style="justify-content:center;color:var(--text3)">... +${r.trades.length-maxShow}건 더 (오래된 거래)</div>`;
    html += `</div>`;
  }

  result.innerHTML = html;
  // S67: 누적 저장 UI 갱신
  _btHistUpdateUI(stock);
}

// ============================================================
//  탭2: 교차검증 (S110 Phase C+D 재설계 — 관심종목 기반)
// ============================================================
//  대상: 관심목록 + 현재 분석 종목 (중복 제거)
//  캐시 활용: _watchBtGet() 히트 시 재사용, 미스/만료 시 _runBtWithExtension 실행
//  대상 0개/1개 → 버튼 비활성 + 하단 안내

// S110: 교차검증 대상 리스트 구성 (관심 + 현재 분석, 중복 제거)
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

// S110: 교차검증 대상 리스트 UI 갱신 (탭 진입 시 호출)
function btCrossRefreshTargetList(){
  const listEl = document.getElementById('btCrossTargetList');
  const btn = document.getElementById('btnBtCross');
  const hintEl = document.getElementById('btCrossEmptyHint');
  const reinforceBtn = document.getElementById('btnBtCrossReinforce');
  if(!listEl || !btn || !hintEl) return;

  const targets = _btGetCrossTargets();
  const n = targets.length;

  if(n === 0){
    listEl.innerHTML = '';
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.style.cursor = 'default';
    btn.textContent = '▶ 교차검증 실행';
    if(reinforceBtn) reinforceBtn.style.display = 'none';
    hintEl.style.display = 'block';
    hintEl.innerHTML = `관심목록 등록 시 교차검증 가능<br><span style="font-size:10px;color:var(--text3);display:block;margin-top:4px">종목 분석 탭에서 ☆ 버튼으로 관심 등록</span>`;
    return;
  }

  // S162: 종목별 상태 분류 (strictBars=true로 봉수 체크 포함)
  //   - included: 교차검증 대상 (캐시 히트 또는 현재 분석종목)
  //   - excluded: 봉수 부족/캐시 없음 → 자동 보강 대상
  const statusList = targets.map(t => {
    const strictCached = (typeof _watchBtGet === 'function') ? _watchBtGet(t.market, t.code, 'day', true) : null;
    const looseCached = (typeof _watchBtGet === 'function') ? _watchBtGet(t.market, t.code, 'day', false) : null;
    const reason = (typeof _watchBtGetReason === 'function') ? _watchBtGetReason(t.market, t.code, 'day', true) : 'hit';
    const isWatched = (typeof _isInWatchlist === 'function') ? _isInWatchlist(t.code) : false;
    // 현재 분석 종목(비관심)은 _lastAnalCandles 있으면 실행 대상으로 포함 (_runBtWithExtension이 처리)
    const hasAnalCandles = !!(t._lastAnalCandles && t._lastAnalCandles.length >= _crossMinBars(t.market));
    let status;
    if(strictCached) status = 'cache_ok';        // 캐시 히트 (봉수 충족)
    else if(!isWatched && hasAnalCandles) status = 'analyzing'; // 현재 분석 종목 (실행 가능)
    else if(!isWatched) status = 'analyzing_low'; // 현재 분석 종목이지만 봉수 부족 (일단 실행 시도)
    else status = 'excluded';                     // 관심종목인데 제외
    return { t, status, reason, looseCached, strictCached, isWatched };
  });

  const included = statusList.filter(s => s.status === 'cache_ok' || s.status === 'analyzing' || s.status === 'analyzing_low');
  const excluded = statusList.filter(s => s.status === 'excluded');
  const cachedCount = statusList.filter(s => s.status === 'cache_ok').length;
  const newCount = included.length - cachedCount;

  if(n === 1){
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.style.cursor = 'default';
    btn.textContent = '▶ 교차검증 실행 (1종목)';
    if(reinforceBtn) reinforceBtn.style.display = 'none';
    listEl.innerHTML = `<div style="padding:8px 10px;background:var(--surface2);border-radius:6px">
      <b>대상:</b> ${targets[0].name}
    </div>`;
    hintEl.style.display = 'block';
    hintEl.innerHTML = `교차검증은 <b>2종목 이상</b>에서 의미 있습니다<br><span style="font-size:10px;color:var(--text3);display:block;margin-top:4px">관심목록에 종목을 더 추가하세요</span>`;
    return;
  }

  // 실제 실행 가능 종목 수 (2종목 이상이어야 의미)
  if(included.length < 2){
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.style.cursor = 'default';
    btn.textContent = `▶ 교차검증 실행 (${included.length}종목)`;
  } else {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.textContent = `▶ 교차검증 실행 (${included.length}종목)`;
    hintEl.style.display = 'none';
  }

  // S162: 자동 보강 버튼 표시 조건 — 제외 종목 1개 이상
  if(reinforceBtn){
    if(excluded.length > 0){
      reinforceBtn.style.display = 'block';
      reinforceBtn.disabled = false;
      reinforceBtn.style.opacity = '';
      // 대략 종목당 6초 추정 (3단계 확장 + 2초 간격)
      const estSec = Math.round(excluded.length * 7);
      reinforceBtn.textContent = `⚡ 제외 ${excluded.length}종목 자동 보강 (${estSec}초 예상)`;
    } else {
      reinforceBtn.style.display = 'none';
    }
  }

  // 대상 리스트 HTML 생성
  const listHtml = statusList.map(s => {
    const t = s.t;
    const starMark = s.isWatched
      ? `<span style="color:var(--accent);font-size:11px;width:14px;text-align:center;flex-shrink:0">☆</span>`
      : `<span style="width:14px;flex-shrink:0"></span>`;
    let badge, nameStyle = '';
    if(s.status === 'cache_ok'){
      const age = Math.round((Date.now() - s.strictCached.saved_at) / 86400000);
      const bars = s.strictCached.btResult?.rowsLength || 0;
      const barEmoji = bars >= 600 ? '🟢' : bars >= 400 ? '🔵' : '🔴';
      badge = `<span style="font-size:9px;color:var(--buy);padding:1px 4px;background:rgba(16,185,129,.1);border-radius:3px">${barEmoji} ${bars}봉 · ${age}일 전</span>`;
    } else if(s.status === 'analyzing' || s.status === 'analyzing_low'){
      badge = `<span style="font-size:9px;color:var(--accent);padding:1px 4px;background:rgba(100,149,237,.1);border-radius:3px">⟲ 새 BT</span>`;
    } else {
      // excluded
      nameStyle = 'color:var(--text3);text-decoration:line-through;opacity:0.65';
      const reasonMap = {
        'no_cache': '캐시 없음',
        'insufficient_bars': (() => {
          const bars = s.looseCached?.btResult?.rowsLength || 0;
          return `${bars}봉 (${_crossMinBars(t.market)}봉 미만)`;
        })(),
        'gate_changed': '게이트 변경',
        'expired': '캐시 만료',
        'tf_mismatch': 'TF 불일치',
      };
      const reasonText = reasonMap[s.reason] || s.reason;
      badge = `<span style="font-size:9px;color:#f59e0b;padding:1px 4px;background:rgba(245,158,11,.12);border-radius:3px">⚠ ${reasonText}</span>`;
    }
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0">
      ${starMark}<span style="flex:1;${nameStyle}">${t.name}</span>${badge}
    </div>`;
  }).join('');

  const excludedNote = excluded.length > 0
    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:10px;color:var(--text3);line-height:1.5">
         💡 제외된 ${excluded.length}종목은 <b>[⚡ 자동 보강]</b> 버튼으로 일괄 처리하거나,<br>
         &nbsp;&nbsp;&nbsp;&nbsp;분석탭/단일검증에서 먼저 실행하면 교차에 포함됩니다
       </div>`
    : '';

  listEl.innerHTML = `<div style="padding:8px 10px;background:var(--surface2);border-radius:6px">
    <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
      <b>대상 ${included.length}종목</b> · 캐시 ${cachedCount}개 · 새로 실행 ${newCount}개
      ${excluded.length > 0 ? `<span style="color:#f59e0b"> · 제외 ${excluded.length}개</span>` : ''}
      ${newCount > 0 ? `<span style="color:var(--accent)"> (${Math.max(8, newCount*4)}초 예상, 병렬)</span>` : cachedCount > 0 ? `<span style="color:var(--buy)"> (즉시)</span>` : ''}
    </div>
    ${listHtml}
    ${excludedNote}
  </div>`;
}

// ════════════════════════════════════════════════════════════
// S162: 자동 보강 — 교차검증 제외 종목들의 캐시를 일괄 확장
//   대상: 관심목록에 있지만 봉수 부족(또는 캐시 없음)으로 교차에서 제외된 종목
//   동작: 순차 실행 (API 부담 최소화) + 2초 간격 + 진행률 표시
//         각 종목 _runBtWithExtension(600봉 목표) → 성공 시 _watchBtSet
//         완료 후 btCrossRefreshTargetList() 자동 호출로 UI 새로고침
// ════════════════════════════════════════════════════════════
async function btCrossReinforce(){
  const targets = _btGetCrossTargets();
  const _tf = 'day';

  // 보강 대상 수집: 관심종목 + 캐시 없음/봉수 부족
  const candidates = [];
  for(const t of targets){
    const isWatched = (typeof _isInWatchlist === 'function') ? _isInWatchlist(t.code) : false;
    if(!isWatched) continue;
    const cached = _watchBtGet(t.market, t.code, _tf, true); // strictBars=true
    if(cached) continue; // 이미 충족됨
    const reason = _watchBtGetReason(t.market, t.code, _tf, true);
    if(reason === 'no_cache' || reason === 'insufficient_bars') candidates.push(t);
  }

  if(candidates.length === 0){
    toast('보강할 종목이 없습니다');
    return;
  }

  const btn = document.getElementById('btnBtCrossReinforce');
  const prog = document.getElementById('btCrossProg');
  const progFill = document.getElementById('btCrossProgFill');
  const progText = document.getElementById('btCrossProgText');
  if(btn){ btn.disabled = true; btn.style.opacity = '.5'; }
  if(prog) prog.style.display = 'block';
  if(progText) progText.style.display = 'block';

  const startMsg = `[S162-reinforce] ⚡ 자동 보강 시작: ${candidates.length}종목 (${candidates.map(c=>c.name).join(', ')})`;
  console.log(startMsg);

  let success = 0, failed = 0;
  const failedNames = [];

  for(let i = 0; i < candidates.length; i++){
    const t = candidates[i];
    const pct = Math.round((i / candidates.length) * 100);
    if(progFill) progFill.style.width = `${pct}%`;
    if(progText) progText.textContent = `⚡ 보강 ${i+1}/${candidates.length} · ${t.name} 확장 중...`;

    const minBars = _crossMinBars(t.market);
    const existingBars = (() => {
      try{
        const all = _watchBtLoadAll();
        const key = _watchBtKey(t.market || t._mkt || 'kr', t.code);
        return all[key]?.btResult?.rowsLength || 0;
      }catch(_){ return 0; }
    })();
    console.log(`[S162-reinforce] ─── ${i+1}/${candidates.length} ${t.name}(${t.code}) 시작 · market=${t.market||t._mkt||'kr'} · 기존 ${existingBars}봉 · 목표 ${minBars}봉`);

    try{
      // S162-fix: currentMarket을 임시로 종목 시장으로 설정 (fetchCandlesExtended가 currentMarket 참조하는 문제 우회)
      // S162-fix2: 정규화된 시장값 사용 (KOSPI → kr)
      const _origCurMarket = (typeof currentMarket !== 'undefined') ? currentMarket : null;
      const _stockMarketRaw = t.market || t._mkt || _origCurMarket;
      const _stockMarket = (typeof _normalizeMarket === 'function') ? _normalizeMarket(_stockMarketRaw) : _stockMarketRaw;
      if(typeof currentMarket !== 'undefined' && _stockMarket && _origCurMarket !== _stockMarket){
        try{
          currentMarket = _stockMarket;
          console.log(`[S162-reinforce] currentMarket 임시 전환: ${_origCurMarket} → ${_stockMarket} (원본: ${_stockMarketRaw})`);
        }catch(_){}
      }

      // S162-fix: 최대 2회 재시도 (API 제한/네트워크 일시적 실패 대응)
      let r = null, lastBars = 0;
      for(let attempt = 1; attempt <= 2; attempt++){
        if(attempt > 1){
          if(progText) progText.textContent = `⚡ 보강 ${i+1}/${candidates.length} · ${t.name} 재시도 ${attempt}/2...`;
          console.log(`[S162-reinforce] ${t.name} 재시도 ${attempt}/2 (3초 대기)`);
          await _btSleep(3000);
        }
        r = await _runBtWithExtension(t, _tf, true);
        lastBars = r?.result?.rowsLength || 0;
        console.log(`[S162-reinforce] ${t.name} 시도 ${attempt}: ok=${r?.ok} · bars=${lastBars} · trades=${r?.result?.totalTrades||0}`);
        if(r?.ok && lastBars >= minBars) break;
      }

      // 원래 currentMarket 복원
      if(typeof currentMarket !== 'undefined' && _origCurMarket != null){
        try{ currentMarket = _origCurMarket; }catch(_){}
      }

      if(r && r.ok && r.result){
        const bars = r.result.rowsLength || 0;
        // S162-fix: 목표 미달이어도 기존보다 나아졌으면 저장 (다음 보강의 시작점 개선)
        if(bars >= minBars){
          _watchBtSet(t, r.result, _tf);
          success++;
          console.log(`[S162-reinforce] ✅ ${t.name} 보강 성공 (${bars}봉, 거래 ${r.result.totalTrades})`);
        } else if(bars > existingBars && bars >= 200){
          // 부분 성공: 기존 캐시보다 나아졌으면 저장 (다음에 이어서 확장 가능)
          _watchBtSet(t, r.result, _tf);
          failed++;
          failedNames.push(`${t.name}(${bars}봉·부분)`);
          console.warn(`[S162-reinforce] ⚠ ${t.name} 부분진전 (${existingBars}→${bars}봉, 목표 ${minBars}) — 저장. 다시 보강 누르면 ${bars}봉부터 이어짐`);
        } else {
          failed++;
          failedNames.push(`${t.name}(${bars}봉)`);
          console.warn(`[S162-reinforce] ❌ ${t.name} 확장 실패 (${bars}/${minBars}봉) — 네이버/Upbit 확장 API 응답 없음 또는 캐시 미스`);
        }
      } else {
        failed++;
        failedNames.push(t.name);
        console.warn(`[S162-reinforce] ❌ ${t.name} BT 실패: ${r?.error || 'unknown'}`);
      }
    }catch(e){
      failed++;
      failedNames.push(t.name);
      console.error(`[S162-reinforce] 예외 ${t.name}: ${e.message || e}`);
    }

    // API 부담 완화 (마지막 종목 뒤엔 대기 없음)
    if(i < candidates.length - 1){
      await _btSleep(2000);
    }
  }

  console.log(`[S162-reinforce] ⚡ 자동 보강 완료 · 성공 ${success} · 실패 ${failed}`);

  if(progFill) progFill.style.width = '100%';
  if(progText) progText.textContent = `⚡ 보강 완료: 성공 ${success} · 실패 ${failed}`;
  await _btSleep(400);

  if(prog) prog.style.display = 'none';
  if(progText) progText.style.display = 'none';
  if(btn){ btn.disabled = false; btn.style.opacity = ''; }

  // UI 새로고침 (대상 리스트 + 버튼 상태)
  btCrossRefreshTargetList();

  // 토스트 안내
  if(failed === 0){
    toast(`⚡ 자동 보강 완료 (${success}종목)`);
  } else {
    toast(`보강 성공 ${success} · 실패 ${failed} (${failedNames.slice(0,2).join(', ')}${failedNames.length>2?' 외':''})`);
  }
}


async function btRunCross(){
  const targets = _btGetCrossTargets();
  if(targets.length < 2){
    toast('교차검증은 2종목 이상 필요합니다');
    return;
  }

  const btn = document.getElementById('btnBtCross');
  const prog = document.getElementById('btCrossProg');
  const progFill = document.getElementById('btCrossProgFill');
  const progText = document.getElementById('btCrossProgText');
  const result = document.getElementById('btCrossResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  const _tf = 'day'; // S110: 교차검증은 일봉 표준 고정 (캐시와 일치)

  // ────────────────────────────────────────────────
  //   기존 직렬: 3종목 새 BT = 18초 (종목당 6초)
  //   병렬: 3종목 동시 실행 = 6초 (2초 대기 공유)
  //   1. 캐시 히트 종목 먼저 즉시 처리
  //   2. 캐시 미스 종목들만 Promise.all로 병렬
  //   3. 봇 감지 회피: 최대 동시 5개 제한 (5개 초과 시 배치)
  // ────────────────────────────────────────────────

  const results = [];
  const cacheHits = [];
  const needBt = [];
  // S161: 캐시 미스 이유 집계 (사용자 안내용)
  const _cacheMissReasons = { no_cache:0, tf_mismatch:0, expired:0, gate_changed:0, insufficient_bars:0 };
  // S162: 봉수 부족으로 제외된 종목 (교차 통계에 포함 안 함)
  const _excludedList = [];

  // 1. 캐시/미스 분류 (S162: strictBars=true로 봉수 체크)
  for(const t of targets){
    let cached = null;
    let missReason = 'hit';
    try{
      cached = _watchBtGet(t.market, t.code, _tf, true); // strictBars=true
      if(!cached) missReason = _watchBtGetReason(t.market, t.code, _tf, true);
    }catch(e){ missReason = 'no_cache'; }
    if(cached && cached.btResult){
      cacheHits.push({ t, cached });
    } else {
      // S162: 관심종목이면서 봉수 부족/캐시 없음 → 제외 (자동 보강 대상)
      //       현재 분석 종목 (비관심, _lastAnalCandles 있음)은 실행 시도
      const isWatched = (typeof _isInWatchlist === 'function') ? _isInWatchlist(t.code) : false;
      if(isWatched && (missReason === 'no_cache' || missReason === 'insufficient_bars')){
        _excludedList.push({ t, reason: missReason });
        if(_cacheMissReasons[missReason] != null) _cacheMissReasons[missReason]++;
        continue; // 실행 대상에서 제외
      }
      // 그 외 (gate_changed/expired/tf_mismatch/분석종목)는 재실행 시도
      needBt.push(t);
      if(_cacheMissReasons[missReason] != null) _cacheMissReasons[missReason]++;
    }
  }

  // S162: 실행 대상 종목 수 체크 (2종목 이상이어야 의미)
  const totalRunnable = cacheHits.length + needBt.length;
  if(totalRunnable < 2){
    btn.disabled=false; prog.style.display='none'; progText.style.display='none';
    const msg = _excludedList.length > 0
      ? `실행 가능한 종목이 ${totalRunnable}개 — 제외 ${_excludedList.length}종목을 먼저 자동 보강하세요`
      : '교차검증은 2종목 이상 필요합니다';
    toast(msg);
    return;
  }

  // 2. 캐시 히트 즉시 결과 추가
  progText.textContent = `캐시 ${cacheHits.length}개 처리...`;
  progFill.style.width = `${Math.round(cacheHits.length/targets.length*30)}%`;
  for(const { t, cached } of cacheHits){
    const r = cached.btResult;
    results.push({
      name:t.name, code:t.code,
      winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
      mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin||0, avgLoss:r.avgLoss||0,
      rowsLength: r.rowsLength || 0, // S110 fix4
      _fromCache: true
    });
    console.log(`[S110-cross] ✅ 캐시 활용: ${t.name} (${r.rowsLength||0}봉)`);
  }
  await _btSleep(50);

  // 3. 캐시 미스 종목 병렬 BT (최대 5개씩 배치)
  if(needBt.length > 0){
    const PARALLEL_LIMIT = 5;
    progText.textContent = `신규 BT ${needBt.length}개 병렬 실행 중... (6초)`;
    progFill.style.width = '40%';
    console.log(`[S110-cross] ⟲ 병렬 BT ${needBt.length}종목 시작 (${Math.min(needBt.length, PARALLEL_LIMIT)}개씩)`);

    const batches = [];
    for(let i = 0; i < needBt.length; i += PARALLEL_LIMIT){
      batches.push(needBt.slice(i, i + PARALLEL_LIMIT));
    }

    let batchIdx = 0;
    for(const batch of batches){
      batchIdx++;
      if(batches.length > 1){
        progText.textContent = `신규 BT 배치 ${batchIdx}/${batches.length} (${batch.length}종목 병렬)`;
      }

      //   분석탭은 2초 대기 유지 (빠른 UX), 교차만 안전 마진 ↑
      //   배치 내에서도 초당 호출 수 분산 (5개 × 0.5초 = 초당 2건)
      //   Upbit 초당 10건 제한 대비 80% 여유 확보
      //   배치 내 병렬은 유지하되 각 호출 시작점을 계단식으로 밀기
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
          results.push({
            name:t.name, code:t.code,
            winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
            mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin||0, avgLoss:r.avgLoss||0,
            rowsLength: r.rowsLength || (btOut.rows ? btOut.rows.length : 0), // S110 fix4
            _fromCache: false
          });
          try{ _watchBtSet(t, r, _tf); }catch(e){}
          console.log(`[S110-cross] ✅ 병렬 BT 완료: ${t.name} (거래 ${r.totalTrades}, ${r.rowsLength||0}봉)`);
        } else {
          results.push({
            name:t.name, code:t.code,
            error: btOut.error || '데이터 부족',
            shortage: true,
            winRate:0, profitFactor:0, totalPnl:0, mdd:0, totalTrades:0, avgWin:0, avgLoss:0,
            _fromCache: false
          });
          console.warn(`[S110-cross] ⚠ ${t.name} 실패:`, btOut.error);
        }
      }

      progFill.style.width = `${40 + Math.round(batchIdx/batches.length*50)}%`;

      // 배치 간 2초 여유 (연속 배치면 봇 감지 방지)
      if(batchIdx < batches.length){
        await _btSleep(2000);
      }
    }
  }

  // 4. 대상 순서대로 정렬 (캐시/미스 분리로 순서 섞임 방지)
  const orderMap = new Map(targets.map((t, i) => [t.code, i]));
  results.sort((a, b) => (orderMap.get(a.code) ?? 999) - (orderMap.get(b.code) ?? 999));

  progFill.style.width='100%'; progText.textContent='완료';
  await _btSleep(200);
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';

  btRenderCrossResult(results, _cacheMissReasons, _excludedList);
  _btSaveBtCross(results);
  // 대상 리스트 재갱신 (캐시 상태 반영)
  btCrossRefreshTargetList();
}

function btRenderCrossResult(results, cacheMissReasons, excludedList){
  const result = document.getElementById('btCrossResult');
  result.style.display='block';

  const valid = results.filter(r=>r.totalTrades>0);
  const skipped = results.filter(r=>r.shortage||r.error);
  const shown = results.filter(r=>!r.shortage&&!r.error); // 테이블에 표시할 종목 (매매 0건 포함)
  const avgWinRate = valid.length ? +(valid.reduce((s,r)=>s+r.winRate,0)/valid.length).toFixed(1) : 0;
  const avgPnl = valid.length ? +(valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length).toFixed(2) : 0;
  const stdPnl = valid.length>1 ? +Math.sqrt(valid.reduce((s,r)=>s+(r.totalPnl-avgPnl)**2,0)/(valid.length-1)).toFixed(2) : 0;
  const consistColor = stdPnl<10?'var(--buy)':'var(--sell)';

  // S161: 게이트 변경으로 재계산된 종목 안내
  let gateInfoHtml = '';
  if(cacheMissReasons && cacheMissReasons.gate_changed > 0){
    gateInfoHtml = `<div style="padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:10px;color:#b45309;margin:6px 0;line-height:1.5">
      🔄 <b>게이트 변경으로 ${cacheMissReasons.gate_changed}종목 재계산</b><br>
      <span style="color:var(--text3)">진입 게이트 설정이 캐시 저장 당시와 달라서 최신 게이트 기준으로 BT를 다시 실행했습니다. 결과가 이전과 달라졌을 수 있습니다.</span>
    </div>`;
  }

  // S162: 봉수 부족으로 제외된 종목 안내
  let excludedInfoHtml = '';
  if(excludedList && excludedList.length > 0){
    const excludedNames = excludedList.map(e => e.t.name).join(', ');
    excludedInfoHtml = `<div style="padding:8px 10px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:6px;font-size:10px;color:#b91c1c;margin:6px 0;line-height:1.5">
      ⚠ <b>${excludedList.length}종목 교차 제외</b> — ${excludedNames}<br>
      <span style="color:var(--text3)">봉수 부족 또는 캐시 없음으로 교차 평균에서 제외되었습니다. [⚡ 자동 보강] 버튼으로 일괄 처리하세요.</span>
    </div>`;
  }

  // S161: 현재 게이트 요약 (활성 게이트 수)
  let gateSummaryHtml = '';
  try{
    const gates = (typeof SXE !== 'undefined' && SXE._btEntryGates) ? SXE._btEntryGates : null;
    if(gates){
      let activeCount = 0;
      for(const k in gates){ if(gates[k] && gates[k].on) activeCount++; }
      if(activeCount > 0){
        gateSummaryHtml = `<div style="padding:6px 10px;background:var(--accent-glow);border-radius:6px;font-size:10px;color:var(--text2);margin:6px 0;text-align:center">
          🚦 진입 게이트 <b style="color:var(--accent)">${activeCount}개 활성</b> 상태로 백테스트
        </div>`;
      }
    }
  }catch(_){}

  let html = `<div class="bt-card">
    <div class="bt-card-title">교차검증 결과 (${valid.length}/${results.length}개)${skipped.length?` · <span style="color:var(--sell)">${skipped.length}개 스킵</span>`:''}${excludedList && excludedList.length ? ` · <span style="color:#f59e0b">${excludedList.length}개 제외</span>`:''}</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num">${avgWinRate}%</div><div class="bt-stat-label">평균 승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgPnl>=0?'var(--buy)':'var(--sell)'}">${avgPnl>=0?'+':''}${avgPnl}%</div><div class="bt-stat-label">평균 수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${consistColor}">${stdPnl<10?'안정':'불안정'}</div><div class="bt-stat-label">일관성 (σ${stdPnl})</div></div>
    </div>
  </div>`;

  // S161/S162: 게이트 재계산/제외/활성 안내 (결과 카드 직후)
  html += gateInfoHtml + excludedInfoHtml + gateSummaryHtml;

  // S110 fix4: 봉수 범례 카드 (결과 테이블 위)
  html += `<div style="padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:10px;color:var(--text3);margin:6px 0;text-align:center">
    데이터 봉수: 🟢 600봉 · 🔵 400봉 · 🔴 200봉 이하
  </div>`;

  html += `<div class="bt-card"><div class="bt-card-title">종목별 상세</div>
    <div style="overflow-x:auto;"><table class="bt-cross-table">
    <thead><tr><th>종목</th><th>승률</th><th>PF</th><th>수익률</th><th>MDD</th><th>매매</th></tr></thead><tbody>`;
  for(const r of shown){
    const wc = r.winRate>=50?'var(--buy)':'var(--sell)';
    const pc = r.totalPnl>=0?'var(--buy)':'var(--sell)';
    // S110 fix: 관심종목 ☆ 마크 (전부 관심목록이므로 모두 표시, 일관성)
    const isWatched = (typeof _isInWatchlist === 'function') ? _isInWatchlist(r.code) : false;
    const starPrefix = isWatched ? `<span style="color:var(--accent);margin-right:3px">☆</span>` : '';
    // S110 fix4: 사용된 봉수 배지 (🟢 600봉, 🔵 400봉, 🔴 200봉 이하)
    const barCount = r.rowsLength || 0;
    const barEmoji = barCount >= 600 ? '🟢' : barCount >= 400 ? '🔵' : '🔴';
    html += `<tr>
      <td style="text-align:left;font-weight:600;">${starPrefix}${r.name}</td>
      <td style="color:${wc}">${r.winRate}%</td>
      <td>${r.profitFactor}</td>
      <td style="color:${pc}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</td>
      <td style="color:var(--sell)">${r.mdd}%</td>
      <td>${r.totalTrades} <span style="font-size:10px" title="${barCount}봉">${barEmoji}</span></td>
    </tr>`;
  }
  html += `</tbody></table></div></div>`;

  // 데이터 부족 종목 별도 카드
  if(skipped.length){
    html += `<div class="bt-card" style="border-left:3px solid var(--sell);">
      <div class="bt-card-title" style="color:var(--sell)">⚠️ 데이터 부족으로 제외 (${skipped.length}개)</div>
      <div style="font-size:10px;color:var(--text3);display:flex;flex-wrap:wrap;gap:4px 8px;">`;
    for(const r of skipped){
      const reason = r.error||'데이터 부족';
      html += `<span style="padding:2px 6px;background:var(--surface2);border-radius:4px;" title="${reason}">${r.name}</span>`;
    }
    html += `</div></div>`;
  }

  result.innerHTML = html;
  _btLastCrossResults = results;
}
let _btLastCrossResults = null;

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
    const _isExtSupported = (currentMarket === 'coin' || currentMarket === 'kr');
    const _btTFVal = _btTF();
    const _targetCount = (_btTFVal === 'week' || _btTFVal === 'month') ? 400 : 600;
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
    // 경로 C: 캐시 없음 → 새로 3단계 확장
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      progFill.style.width='10%'; progText.textContent='1단계: 200봉 로드 중...';
      console.log(`[S109-9b] ★ 학습검증 새 3단계 확장 (목표: ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _btIsCoin(), _btTFVal, 200);
      if(!_first || _first.length === 0) throw new Error('초기 데이터 로드 실패');
      rows = _first;

      if(_targetCount > 200){
        progFill.style.width='25%'; progText.textContent=`2단계: 400봉 확장 중... (2초 대기)`;
        await _btSleep(2000);
        try{
          const _extra1 = await fetchCandlesExtended(stock.code, _btTFVal, rows[0].date, 200);
          if(_extra1 && _extra1.length > 0){
            rows = [..._extra1, ...rows];
            console.log(`[S109-9b] 2단계 완료: ${rows.length}봉`);
          }
        }catch(e){}
      }

      if(_targetCount > 400 && rows.length >= 400){
        progFill.style.width='40%'; progText.textContent=`3단계: 600봉 확장 중... (2초 대기)`;
        await _btSleep(2000);
        try{
          const _extra2 = await fetchCandlesExtended(stock.code, _btTFVal, rows[0].date, 200);
          if(_extra2 && _extra2.length > 0){
            rows = [..._extra2, ...rows];
            console.log(`[S109-9b] 3단계 완료: ${rows.length}봉`);
          }
        }catch(e){}
      }

      stock._lastAnalCandles = rows.slice();
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
    }
    // 경로 D: 시장 미지원
    else {
      const count = (_btTFVal === 'week' || _btTFVal === 'month') ? 400 : 300;
      progFill.style.width='30%'; progText.textContent=`${count}봉 로드 중...`;
      rows = await btFetchCandles(stock.code, _btIsCoin(), _btTFVal, count);
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

    const params = btGetParams();
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
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${e.message}</div></div>`;
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
  const pc = r.totalPnl>=0?'var(--buy)':'var(--sell)';
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
      const params = btGetParams();
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
    const result = pnlPct > 0 ? 'WIN' : 'LOSS'; // 0은 LOSS (익절 기준)

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
function mtDeleteTrade(id){
  if(!id) return;
  try{ if(navigator.vibrate) navigator.vibrate(10); }catch(_){}
  const list = _mtLoad();
  const target = list.find(t => t.id === id);
  if(!target) return;
  if(!confirm(`${target.name||target.code} 거래 1건을 삭제할까요?`)) return;
  const next = list.filter(t => t.id !== id);
  _mtSave(next);
  mtRender();
  // 종목분석 탭 바도 갱신 (OPEN 삭제 시 대응)
  mtRefreshAnalBar();
}

// 종목별 전체 삭제 (한 종목의 모든 거래 삭제)
function mtDeleteGroup(code, event){
  // 그룹 헤더 클릭(아코디언 토글)으로 이벤트 전파되지 않게 차단
  if(event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if(!code) return;
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(_){}
  setTimeout(()=>{
    const list = _mtLoad();
    const targets = list.filter(t => t.code === code);
    if(!targets.length) return;
    const name = targets[0].name || code;
    if(!confirm(`${name} 거래 ${targets.length}건을 모두 삭제할까요?`)) return;
    const next = list.filter(t => t.code !== code);
    _mtSave(next);
    delete _mtOpenGroups[code]; // 펼침 상태도 정리
    mtRender();
    mtRefreshAnalBar();
    toast(`${name} ${targets.length}건 삭제 완료`);
  }, 30);
}

// 전체 삭제
function mtClearAll(){
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(_){}
  setTimeout(()=>{
    const list = _mtLoad();
    if(!list.length){ toast('비어있음'); return; }
    if(!confirm(`매매 기록 ${list.length}건을 모두 삭제할까요?`)) return;
    _mtSave([]);
    mtRender();
    mtRefreshAnalBar();
    toast('전체 삭제 완료');
  }, 30);
}

// 정렬 설정
let _mtSortMode = (()=>{ try{return localStorage.getItem(SX_MANUAL_SORT_KEY)||'recent';}catch(_){return 'recent';} })();
let _mtOpenGroups = {}; // { code: true } — 세션 내 열림 상태 기억

function mtSetSort(mode){
  if(!['recent','oldest','pnl','name'].includes(mode)) return;
  _mtSortMode = mode;
  try{ localStorage.setItem(SX_MANUAL_SORT_KEY, mode); }catch(_){}
  mtRender();
}

function mtToggleGroup(code){
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(_){}
  _mtOpenGroups[code] = !_mtOpenGroups[code];
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

  summaryEl.innerHTML = `<div class="mt-total-summary">
    <div class="mt-total-item"><div class="mt-total-num">${list.length}</div><div class="mt-total-lbl">총 거래${opens.length?` (보유 ${opens.length})`:''}</div></div>
    <div class="mt-total-item"><div class="mt-total-num up">${wins}</div><div class="mt-total-lbl">WIN</div></div>
    <div class="mt-total-item"><div class="mt-total-num down">${losses}</div><div class="mt-total-lbl">LOSS</div></div>
    <div class="mt-total-item"><div class="mt-total-num ${totalPnlCls}">${totalPnlStr}</div><div class="mt-total-lbl">누적 수익률</div></div>
  </div>
  <div style="text-align:center;font-size:10px;color:var(--text3);margin-bottom:8px">적중률 ${hitRate}% · 복리 기준</div>`;

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
    pnlHtml = `<span class="mt-trade-pnl flat">보유중</span>`;
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
function btRecordPaper(){ /* deprecated */ }
function btUpdatePaper(){ toast('수동 매매 시뮬 모드로 개편되었습니다'); }
function btClearPaper(){ mtClearAll(); }

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
