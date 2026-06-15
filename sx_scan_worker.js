// ═══════════════════════════════════════════════════════════════
//  sx_scan_worker.js v2.0
//  Web Worker — 스캔 핵심 로직 (메인 스레드 분리)
//  백그라운드 탭에서도 fetch + 점수 계산 지속
// ═══════════════════════════════════════════════════════════════
let _engineLoaded = false;
function _loadEngines(cacheBuster) {
  if (_engineLoaded) return;
  try {
    importScripts(
      `sx_session.js?v=${cacheBuster || '1'}`,
      `sx_analysis_engine.js?v=${cacheBuster || '1'}`,
      `sx_conditions.js?v=${cacheBuster || '1'}`,
      `sx_project_c.js?v=${cacheBuster || '1'}`
    );
    _engineLoaded = true;
  } catch (e) {
    self.postMessage({ type: 'error', message: 'importScripts 실패: ' + e.message });
  }
}

// ── 전역 상태 (메인에서 config로 주입) ──
let WORKER_BASE = '';
let currentMarket = 'kr';
let currentTF = 'day';
let scanMarket = '전체';
let activeFilters = [];
let _kisEnabled = false;
let _kisConfig = null; // {appKey, appSecret}
let _kisToken = null;

// S79: BT 지원 TF 맵 (sx_render.js와 동일)
// ⚠ SINGLE SOURCE: sx_render.js에도 동일 복사본 존재 — 변경 시 양쪽 동기화 필수
const BT_SUPPORTED_TF = {
  kr:   ['30m','60m','day','week','month'],
  us:   ['day','week','month'],
  coin: ['60m','240m','day','week','month'],
};
function _isBtSupportedTF(market, tf){
  const m = market || 'kr';
  const supported = BT_SUPPORTED_TF[m] || [];
  if(m==='kr' && tf==='30m' && !_kisEnabled) return false;
  return supported.includes(tf);
}
let _kisTokenExp = 0;
let _watchlistScanMode = false;
let _watchlistData = [];
let _scanAbort = false;
let _finReportType = 'annual';
let _discPeriodDays = 90;
let _customDiscKw = [];
// S83: 전이 구간 임계값 (사용자 조정 가능)
let _transZoneTh = { readyMax: 50, entryMax: 65 }; // Ready<readyMax, Entry=readyMax~entryMax-1, Trend>=entryMax
let _parallelEnabled = false;
let _safetyFlags = {};
let _regimeAdaptEnabled = false;

// localStorage 대체 캐시 (Worker 수명 동안 유지)
let _oracleKospi = [];
let _oracleKosdaq = [];
let _oracleEtf = [];
let _oracleCoin = [];
let _oracleUsKeys = {}; // {SP500:[], NDX:[], DOW:[], ETF:[]}
let _stockMasterCache = null; // {ts, data}
let _marketEnvData = null; // MarketEnv 스냅샷
// [PATCH-14] 탐색 스킵 진단 — passFilters/checkTechConditions 탈락 원인 통계
//   매 스캔 시작 시 초기화 → done 메시지에 포함하여 메인이 사용자에게 친절 안내
let _passFilterStats = {};
let _techFilterStats = {};
let _candleFailCount = 0;
// [v3.11] 종목 추적 — 특정 종목 코드의 단계별 통과/탈락 로그
//   사용자가 진단 모달에서 종목 코드 입력 → config.traceCode 로 전달 → 매 단계마다 기록
//   풀에 없으면 강제 추가하여 모든 단계를 거치게 함
let _traceCode = null;
let _traceLog = []; // [{stage, status, reason, detail}, ...]
function _trace(stage, status, reason, detail) {
  if (_traceCode) _traceLog.push({ stage, status, reason: reason || '', detail: detail || '' });
}

// 캔들 캐시 (Worker 내)
const candleCache = {};
const _finCache = {};
const _invCache = {};
const _kisDataCache = {};
const FIN_TTL = 86400000;
const KIS_DATA_TTL = 120000;
const DISCLOSURE_TTL = 86400000;
const _discCache = {};

// [WEAK-1 FIX] fetch 타임아웃 보호 헬퍼 (기본 10초)
//   - 프록시 서버 지연 시 무한 대기 방지
//   - AbortSignal.timeout은 일부 브라우저/구버전에서 미지원이라 AbortController로 구현
async function _fetchWithTimeout(url, options, timeoutMs){
  const _opts = options || {};
  const _t = timeoutMs || 10000;
  // 이미 signal이 있으면 그대로 사용 (중복 방지)
  if(_opts.signal){
    return fetch(url, _opts);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(()=>{
    try{ ctrl.abort(); }catch(_){}
  }, _t);
  try{
    return await fetch(url, Object.assign({}, _opts, { signal: ctrl.signal }));
  }finally{
    clearTimeout(timer);
  }
}

// [Phase 4-C] 5xx/네트워크 에러 자동 재시도 (지수 백오프)
//   - 5xx: 일시적 (워커 cold start, 외부 API 일시 장애) → 재시도 가치 O
//   - 4xx: 영속적 (404, 401 등) → 재시도 무의미, 즉시 반환
//   - 네트워크 에러(throw): 재시도. 단, AbortError(타임아웃)는 재시도해도 같음 → 중단
//   - 백오프: 500ms, 1s, 2s (2회 재시도면 총 1.5s 추가 대기)
async function _fetchWithRetry(url, options, timeoutMs, maxRetries){
  const _max = (maxRetries == null) ? 2 : maxRetries;
  let lastErr = null;
  for(let i = 0; i <= _max; i++){
    try{
      const resp = await _fetchWithTimeout(url, options, timeoutMs);
      // 4xx면 즉시 반환 (재시도 무의미)
      if(resp.ok || resp.status < 500) return resp;
      // 5xx — 마지막 시도면 그대로 반환, 아니면 백오프 후 재시도
      if(i === _max) return resp;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }catch(e){
      lastErr = e;
      // AbortError (타임아웃)도 재시도 — cold start 워커 깨우는 효과
      if(i === _max) throw e;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  if(lastErr) throw lastErr;
  // 도달 불가 (위 루프에서 항상 return/throw)
  return null;
}

// [Phase 4-B] 동시성 제한 큐 (lib 없이 직접 구현)
//   tasks: () => Promise 배열. 각 함수를 순차로 실행하되 동시 실행 한도(limit) 유지
//   사용 예: await _runWithLimit(codes.map(c => () => fetchOne(c)), 5)
async function _runWithLimit(tasks, limit){
  const _lim = limit || 5;
  const results = new Array(tasks.length);
  let idx = 0;
  async function _worker(){
    while(true){
      const my = idx++;
      if(my >= tasks.length) return;
      try{ results[my] = await tasks[my](); }
      catch(e){ results[my] = { _error: e }; }
    }
  }
  const workers = [];
  for(let i = 0; i < Math.min(_lim, tasks.length); i++) workers.push(_worker());
  await Promise.all(workers);
  return results;
}

// ── 필터 상수 ──
const FINANCIAL_FILTER_IDS = ['per','pbr','roe','eps','dividend_yield','debt_ratio','week52_high_ratio','week52_low_ratio','revenue_growth','operating_profit_growth','net_income_growth','eps_growth','psr','ev_ebitda','bps','pcr','peg','roa','operating_margin','net_margin','ebitda_margin','current_ratio','interest_coverage'];
// [v3.12 PATCH-1C] short_ratio는 종목풀(passFilters) 단계에서 처리 → INVESTOR 리스트에서 제외
const INVESTOR_FILTER_IDS = ['foreign_net_buy','foreign_net_buy_days','inst_net_buy','inst_net_buy_days','program_net_buy'];
const RANK_FILTER_IDS = ['rank_change_rate','rank_volume','rank_trade_amount','rank_market_cap','rank_foreign_ratio','rank_volume_change','rank_volatility'];
const FIN_REPORT_LABELS = {annual:'연간', half:'반기', q1:'1분기', q3:'3분기'};

// KRX 업종명 → 카테고리 alias 매핑
//   ORACLE 종목풀의 sector 필드(KRX 엑셀 "업종명")를 카테고리(반도체/2차전지/바이오 등)로 매핑
//   엑셀 업종명 형식: 전기·전자, 화학, 운송장비·부품, IT 서비스 등
//   매칭 로직: includes 검사 → s.sector에 alias 키워드 포함 시 매칭
const KRX_SECTOR_ALIASES = {
  '반도체':       ['전기·전자'],                              // 395종목 (삼성전자, SK하이닉스 등)
  '2차전지':      ['전기·전자', '화학'],                       // 화학(249) + 전기전자(395)
  '바이오':       ['제약', '의료·정밀기기'],                    // 제약(189) + 의료기기(106)
  '자동차':       ['운송장비·부품'],                           // 141종목
  'IT/소프트웨어': ['IT 서비스'],                               // 254종목 (카카오, NAVER 등)
  '금융':         ['금융', '기타금융', '증권', '보험', '은행'], // 122+98+29+14+4
  '건설':         ['건설'],                                    // 66종목
  '화학':         ['화학'],                                    // 249종목
  '철강':         ['금속'],                                    // 138종목
  '유통':         ['유통'],                                    // 169종목
  '식품':         ['음식료·담배'],                             // 95종목
  '엔터':         ['오락·문화'],                               // 67종목
  '게임':         ['IT 서비스', '오락·문화'],
  '통신':         ['통신'],                                    // 14종목
  '에너지':       ['전기·가스', '전기·가스·수도'],              // 13종목
  '기계':         ['기계·장비'],                               // 217종목
  '운송':         ['운송·창고'],                               // 30종목
  '섬유/의복':    ['섬유·의류'],                               // 52종목
  '의료정밀':     ['의료·정밀기기'],                           // 106종목
  '전기전자':     ['전기·전자']                                // 395종목
};

// 업종 매칭 함수 — sector(KRX IDX_NM)과 종목명에 alias 키워드 어느 하나라도 포함되면 true
function matchSector(stockSector, stockName, userSelections) {
  if (!userSelections || !userSelections.length) return true;
  for (const sel of userSelections) {
    const aliases = KRX_SECTOR_ALIASES[sel] || [sel];
    // 1) KRX 업종명에 alias 후보 중 하나라도 포함
    if (stockSector && aliases.some(a => stockSector.includes(a))) return true;
    // 2) 종목명에 사용자가 선택한 원본 키워드 포함 (예: "현대자동차"에 "자동차" 포함)
    if (stockName && stockName.includes(sel)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  유틸 함수
// ═══════════════════════════════════════════════════════════════
function parseNum(v) {
  if (!v) return 0;
  return parseInt(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

function rangeCheck(val, filter) {
  if (typeof filter !== 'object' || filter === null) return true;
  if (val == null || isNaN(val)) return false;
  if (filter.min !== null && val < filter.min) return false;
  if (filter.max !== null && val > filter.max) return false;
  return true;
}

function _hasAnyFilter(ids, getFilter) {
  return ids.some(id => { const f = getFilter(id); return f && f.value && (typeof f.value === 'object' ? (f.value.min !== null || f.value.max !== null) : true); });
}

function _todayStr() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function getParallelCount(poolSize) {
  if (!_parallelEnabled) return 1;
  if (poolSize <= 500) return 1;
  if (poolSize <= 1000) return 2;
  if (poolSize <= 2000) return 3;
  if (poolSize <= 5000) return 4;
  return 5;
}

// ═══════════════════════════════════════════════════════════════
//  KIS API (Worker 내)
// ═══════════════════════════════════════════════════════════════
async function _getKisToken() {
  if (!_kisConfig) return null;
  if (_kisToken && Date.now() < _kisTokenExp) return _kisToken;
  try {
    const res = await _fetchWithTimeout(`${WORKER_BASE}/kis/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: _kisConfig.appKey, appsecret: _kisConfig.appSecret })
    });
    const data = await res.json();
    if (!data?.access_token) return null;
    const exp = Date.now() + (data.expires_in ? data.expires_in * 1000 : 86400000) - 60000;
    _kisToken = data.access_token;
    _kisTokenExp = exp;
    return data.access_token;
  } catch (e) { return null; }
}

async function _kisGet(path, params = {}) {
  if (!_kisConfig) return null;
  const token = await _getKisToken();
  if (!token) return null;
  const qs = new URLSearchParams(params).toString();
  const url = `${WORKER_BASE}/kis${path}?${qs}`;
  try {
    const res = await _fetchWithTimeout(url, {
      headers: {
        'authorization': `Bearer ${token}`,
        'appkey': _kisConfig.appKey,
        'appsecret': _kisConfig.appSecret,
        'tr_id': params.tr_id || '',
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.rt_cd && data.rt_cd !== '0') return null;
    return data;
  } catch (e) { return null; }
}

async function _fetchKisData(code) {
  if (!_kisEnabled || currentMarket !== 'kr') return null;
  if (_kisDataCache[code] && Date.now() - _kisDataCache[code].ts < KIS_DATA_TTL) return _kisDataCache[code];
  const result = { ts: Date.now(), orderbook: null, conclusion: null, minute: null, program: null };
  try {
    const [obRes, ccRes, mnRes, pgRes] = await Promise.all([
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, tr_id: 'FHKST01010200' }).catch(() => null),
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-ccnl', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, tr_id: 'FHKST01010300' }).catch(() => null),
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: (typeof _sxSessionKisHour === 'function' ? _sxSessionKisHour('kr') : '153000'), FID_ETC_CLS_CODE: '', FID_PW_DATA_INCU_YN: 'Y', tr_id: 'FHKST03010200' }).catch(() => null),
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-investor', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_PERIOD_DIV_CODE: 'D', FID_INPUT_DATE_1: _todayStr(), FID_INPUT_DATE_2: _todayStr(), tr_id: 'FHKST01010900' }).catch(() => null),
    ]);
    if (obRes?.output1) {
      const o = obRes.output1;
      const totalBid = Number(o.total_bidp_rsqn || 0);
      const totalAsk = Number(o.total_askp_rsqn || 0);
      result.orderbook = { totalBid, totalAsk, bidAskRatio: totalAsk > 0 ? (totalBid / totalAsk) * 100 : 0 };
    }
    if (ccRes?.output && Array.isArray(ccRes.output) && ccRes.output.length > 0) {
      // [v3.13 KIS-FIX] inquire-ccnl 응답은 *배열* (최근 체결 30건) — output[0]이 최신
      //   매수/매도 분리: 30건 합산 (cntg_vol 부호로 매수/매도 구분 어려워 prdy_vrss_sign 활용)
      //   〔이력〕 이전 버그: ccRes.output을 객체처럼 다뤄 c.tday_rltv = undefined → 0 → 모든 종목 탈락 (수정됨)
      const c = ccRes.output[0];
      // tradeStrength: 당일 체결 강도 (이미 100 기준 백분율, 예: 114.05 = 매수 우세)
      const tradeStrength = Number(c.tday_rltv || 0);
      // buyRatio: 30건 중 매수체결(상승 sign 1,2) 비중 — 근사치
      let buyVol = 0, sellVol = 0;
      ccRes.output.forEach(b => {
        const vol = Number(b.cntg_vol || 0);
        const sign = String(b.prdy_vrss_sign || '');
        if (sign === '1' || sign === '2') buyVol += vol;        // 상한/상승
        else if (sign === '4' || sign === '5') sellVol += vol;  // 하한/하락
      });
      const buyRatio = (buyVol + sellVol) > 0 ? (buyVol / (buyVol + sellVol)) * 100 : 50;
      result.conclusion = { tradeStrength, buyRatio };
    }
    if (mnRes?.output2 && mnRes.output2.length) {
      const bars = mnRes.output2;
      let dayHigh = 0, sumPV = 0, sumVol = 0;
      bars.forEach(b => {
        const h = Number(b.stck_hgpr || 0), c = Number(b.stck_prpr || b.stck_clpr || 0), v = Number(b.cntg_vol || 0);
        if (h > dayHigh) dayHigh = h;
        sumPV += c * v; sumVol += v;
      });
      const lastBar = bars[0];
      const curPrice = Number(lastBar.stck_prpr || lastBar.stck_clpr || 0);
      const vwap = sumVol > 0 ? sumPV / sumVol : curPrice;
      result.minute = { dayHigh, curPrice, vwap, highBreak: curPrice >= dayHigh, vwapPos: curPrice >= vwap ? 'above' : 'below' };
    }
    if (pgRes?.output && pgRes.output.length) {
      const row = pgRes.output[0];
      result.program = { netBuyQty: Number(row.prsn_ntby_qty || 0), netBuyAmt: Number(row.prsn_ntby_tr_pbmn || 0) / 1000000 };
    }
    _kisDataCache[code] = result;
    return result;
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════
//  종목 마스터 로딩
// ═══════════════════════════════════════════════════════════════

async function loadStockMaster() {
  if (_stockMasterCache && Date.now() - _stockMasterCache.ts < 6 * 3600 * 1000) return _stockMasterCache.data;
  return await fetchStockMaster();
}

async function fetchStockMaster() {
  try {
    let oraclePool = [..._oracleKospi, ..._oracleKosdaq, ..._oracleEtf];
    // KRX market-cap (502 흡수 위해 재시도 2회)
    const res = await _fetchWithRetry(WORKER_BASE + '/krx/market-cap', null, 10000, 2);
    if (!res || !res.ok) throw new Error('KRX 응답 오류');
    const json = await res.json();
    if (!json.items && !json.data && !json.OutBlock_1) throw new Error('데이터 형식 오류');
    const raw = json.items || json.OutBlock_1 || json.data || [];
    const krxMap = {};
    raw.forEach(r => { const code = r.ISU_SRT_CD || r.code || ''; if (code) krxMap[code] = r; });

    let master;
    if (oraclePool.length > 0) {
      master = oraclePool.map(s => {
        const krx = krxMap[s.code] || {};
        const krxPrice = parseNum(krx.TDD_CLSPRC || 0);
        return {
          code: s.code, name: s.name, market: s.market || krx.MKT_NM || '',
          price: krxPrice || parseNum(s.price || 0),
          changeRate: parseFloat(krx.FLUC_RT || s.changeRate || 0),
          volume: parseNum(krx.ACC_TRDVOL || 0) || parseNum(s.vol || 0),
          tradeAmount: parseNum(krx.ACC_TRDVAL || 0) ? parseNum(krx.ACC_TRDVAL || 0) / 1000000 : parseNum(s.tradeAmount || 0),
          marketCap: krx.MKTCAP ? parseNum(krx.MKTCAP) / 100000000 : parseNum(s.mcap || 0) / 100000000,
          foreignRatio: parseFloat(s.foreignRatio || 0),
          listedShares: parseNum(krx.LIST_SHRS || 0),
          // sector: KRX IDX_NM 우선 → ORACLE sector fallback
          volumeRatio: 100, sector: krx.IDX_NM || s.sector || '', _krxLive: krxPrice > 0,
        };
      }).filter(s => s.code && s.name);

      // S80: 장마감 감지 → 네이버 sise 보강
      const liveCount = master.filter(s => s._krxLive).length;
      const isMarketClosed = liveCount < master.length * 0.2;
      if (isMarketClosed) {
        console.log(`[SX Worker] 장마감 감지 (live: ${liveCount}/${master.length}) — 네이버 sise 보강`);
        const needPrice = master.filter(s => s.price === 0 && s.code);
        const batchSize = 50;
        const maxFill = Math.min(needPrice.length, 200);
        for (let i = 0; i < maxFill; i += batchSize) {
          const batch = needPrice.slice(i, i + batchSize);
          const end = _todayStr();
          const startD = new Date(Date.now() - 15 * 86400000);
          const start = startD.getFullYear() + String(startD.getMonth() + 1).padStart(2, '0') + String(startD.getDate()).padStart(2, '0');
          const promises = batch.map(s =>
            _fetchWithTimeout(`${WORKER_BASE}/naver/sise?symbol=${s.code}&timeframe=day&start=${start}&end=${end}`)
              .then(r => r.ok ? r.json() : null).catch(() => null)
          );
          const results = await Promise.all(promises);
          results.forEach((json, idx) => {
            if (!json) return;
            let dataArr = json.data;
            if ((!dataArr || !dataArr.length) && json.raw) {
              try {
                const cleaned = json.raw.trim().replace(/^\uFEFF/, '');
                let parsed = null;
                try { parsed = JSON.parse(cleaned); } catch (_) { }
                if (!parsed) try { parsed = JSON.parse(cleaned.replace(/'/g, '"')); } catch (_) { }
                if (parsed && Array.isArray(parsed) && parsed.length >= 2) {
                  const hdr = parsed[0];
                  dataArr = parsed.slice(1).map(row => { const obj = {}; hdr.forEach((h, j) => { obj[h] = row[j]; }); return obj; });
                }
              } catch (_) { }
            }
            if (!dataArr || !dataArr.length) return;
            const last = dataArr[dataArr.length - 1];
            const prev = dataArr.length >= 2 ? dataArr[dataArr.length - 2] : null;
            const closePrice = parseFloat(String(last.closePrice || last['종가'] || last.close || 0).replace(/,/g, ''));
            const vol = parseInt(String(last.accumulatedTradingVolume || last['거래량'] || last.volume || 0).replace(/,/g, '')) || 0;
            if (closePrice > 0) {
              const s = batch[idx];
              s.price = closePrice;
              if (prev) {
                const prevClose = parseFloat(String(prev.closePrice || prev['종가'] || prev.close || 0).replace(/,/g, ''));
                if (prevClose > 0) s.changeRate = ((closePrice - prevClose) / prevClose) * 100;
              }
              if (s.volume === 0 && vol > 0) s.volume = vol;
              if (s.tradeAmount === 0 && closePrice && vol) s.tradeAmount = (closePrice * vol) / 1000000;
            }
          });
        }
      }
    } else {
      master = raw.map(r => ({
        code: r.ISU_SRT_CD || r.code || '', name: r.ISU_ABBRV || r.name || '', market: r.MKT_NM || r.market || '',
        price: parseNum(r.TDD_CLSPRC || r.price), changeRate: parseFloat(r.FLUC_RT || r.changeRate || 0),
        volume: parseNum(r.ACC_TRDVOL || r.volume), tradeAmount: parseNum(r.ACC_TRDVAL || r.tradeAmount) / 1000000,
        marketCap: parseNum(r.MKTCAP || r.marketCap) / 100000000, foreignRatio: parseFloat(r.foreignRatio || 0),
        listedShares: parseNum(r.LIST_SHRS || r.listedShares),
        volumeRatio: 100, sector: r.IDX_NM || r.sector || '',
      })).filter(s => s.code && s.name);
    }
    _stockMasterCache = { ts: Date.now(), data: master };
    return master;
  } catch (e) {
    // fallback - KRX 완전 실패 시 ORACLE만으로 (sector는 ORACLE에 포함됨)
    const pool = [..._oracleKospi, ..._oracleKosdaq, ..._oracleEtf];
    if (pool.length) {
      return pool.map(s => ({ code: s.code, name: s.name, market: s.market || '', price: 0, changeRate: 0, volume: 0, tradeAmount: s.vol || 0, marketCap: (s.mcap || 0) / 100000000, foreignRatio: 0, listedShares: 0, volumeRatio: 100, sector: s.sector || '' }));
    }
    return null;
  }
}

async function loadCoinMaster() {
  try {
    let pool = [..._oracleCoin];
    if (!pool.length) {
      const allRes = await _fetchWithTimeout(WORKER_BASE + '/upbit/market-all');
      const allJson = await allRes.json();
      pool = (allJson.data || allJson || []).filter(m => (m.market || '').startsWith('KRW-')).map(m => ({ code: m.market.replace('KRW-', ''), name: m.korean_name || m.market, market: 'KRW' }));
    }
    if (!pool.length) return null;
    let tickerMap = {};
    const allMarkets = pool.map(c => c.code.startsWith('KRW-') ? c.code : 'KRW-' + c.code);
    const BATCH = 30;
    for (let i = 0; i < allMarkets.length; i += BATCH) {
      const batch = allMarkets.slice(i, i + BATCH);
      try {
        const res = await _fetchWithTimeout(WORKER_BASE + '/upbit/ticker?markets=' + encodeURIComponent(batch.join(',')));
        if (res.ok) {
          const json = await res.json();
          (Array.isArray(json) ? json : (json.data || [])).forEach(t => { const sym = (t.market || '').replace('KRW-', ''); if (sym) tickerMap[sym] = t; });
        }
      } catch (_) {}
    }
    return pool.map(s => {
      const bareCode = s.code.replace(/^KRW-/, '');
      const t = tickerMap[bareCode] || tickerMap[s.code] || {};
      return {
        code: bareCode, name: s.name, market: 'KRW',
        price: parseFloat(t.trade_price || 0), changeRate: parseFloat(t.signed_change_rate || 0) * 100,
        volume: parseFloat(t.acc_trade_volume_24h || 0), tradeAmount: parseFloat(t.acc_trade_price_24h || 0) / 1000000,
        marketCap: s.mcap || 0, foreignRatio: 0, listedShares: 0, volumeRatio: 100, sector: '',
      };
    }).filter(s => s.code);
  } catch (e) { return null; }
}

async function loadUSMaster() {
  try {
    let pool = [];
    const seen = new Set();
    ['SP500', 'NDX', 'DOW', 'ETF'].forEach(k => {
      (_oracleUsKeys[k] || []).forEach(s => { if (!seen.has(s.code)) { seen.add(s.code); pool.push(s); } });
    });
    if (!pool.length) return null;
    const master = pool.map(s => ({
      code: s.code, name: s.name, market: s.market || 'US',
      price: s.price || 0, changeRate: s.changeRate || 0, volume: s.vol || 0, tradeAmount: s.vol ? s.vol / 1000000 : 0,
      marketCap: s.mcap ? s.mcap / 100000000 : 0, foreignRatio: 0, listedShares: 0, volumeRatio: 100, sector: '',
    }));
    try {
      const BATCH = 50;
      for (let i = 0; i < master.length; i += BATCH) {
        const batch = master.slice(i, i + BATCH);
        const symbols = batch.map(s => s.code).join(',');
        const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,marketCap`;
        try {
          const res = await fetch(`${WORKER_BASE}/proxy?url=${encodeURIComponent(yfUrl)}`, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const json = await res.json();
            (json?.quoteResponse?.result || []).forEach(q => {
              const m = master.find(s => s.code === q.symbol);
              if (m) { m.price = q.regularMarketPrice || 0; m.changeRate = q.regularMarketChangePercent || 0; m.volume = q.regularMarketVolume || 0; m.tradeAmount = (q.regularMarketVolume || 0) * (q.regularMarketPrice || 0) / 1000000; m.marketCap = (q.marketCap || 0) / 100000000; }
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
    return master;
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════
//  캔들 fetch
// ═══════════════════════════════════════════════════════════════
// [S220] 캔들 무결성 검증 — sx_screener.html의 _sxIsValidCandle 미러 (워커는 별도 스코프)
//   증상: KIS API가 일요일/장외 시간에 마지막 봉을 low=0, volume=비정상으로 반환
//   기준: close>0, high>0, low>0, high>=low, high>=close, low<=close
//   참고: volume=0인 봉(휴장/거래정지)은 정상이므로 통과시킴
function _sxIsValidCandle(c){
  if(!c) return false;
  if(!(c.close > 0)) return false;
  if(!(c.high > 0) || !(c.low > 0)) return false;
  if(c.high < c.low) return false;
  if(c.high < c.close || c.low > c.close) return false;
  return true;
}

async function fetchCandles(code, count, _retry) {
  const cacheKey = currentMarket + '_' + code + '_' + count + '_' + currentTF;
  if (candleCache[cacheKey] && Date.now() - candleCache[cacheKey].ts < 600000) return candleCache[cacheKey].data;
  try {
    let url, raw;
    if (currentMarket === 'coin') {
      const typeMap = { '5m': 'minutes/5', '15m': 'minutes/15', '30m': 'minutes/30', '60m': 'minutes/60', '240m': 'minutes/240', 'day': 'days', 'week': 'weeks', 'month': 'months' };
      const upbitType = typeMap[currentTF] || 'days';
      const coinMarket = code.startsWith('KRW-') ? code : 'KRW-' + code;
      url = `${WORKER_BASE}/upbit/candles?market=${coinMarket}&type=${upbitType}&count=${count}`;
      const res = await _fetchWithTimeout(url);
      if (!res.ok) return null;
      const json = await res.json();
      raw = (json.data || json || []).map(r => ({
        date: r.candle_date_time_kst || r.date || '',
        open: parseFloat(r.opening_price || r.open || 0), high: parseFloat(r.high_price || r.high || 0),
        low: parseFloat(r.low_price || r.low || 0), close: parseFloat(r.trade_price || r.close || 0),
        volume: parseFloat(r.candle_acc_trade_volume || r.volume || 0),
      })).filter(_sxIsValidCandle).reverse();
    } else if (currentMarket === 'us') {
      // [S583] range=6mo 하드코딩 제거 → 메인스레드(sx_screener.html)의 period1/period2 방식 미러.
      //   증상: 워커가 range=6mo 고정이라 US 주봉(~26봉)·월봉(~6봉)이 다이버전스 게이트(n≥50) 미만 →
      //         결과탭 다이버 배지가 US 주봉/월봉에서 항상 미발생(상세뷰=메인스레드 200봉과 불일치).
      //   수정: TF별 일수계수(일봉 ×1.45, 주봉 ×7, 월봉 ×31)로 count봉 분량 기간을 정확히 요청.
      const intervalMap = { 'day': '1d', 'week': '1wk', 'month': '1mo' };
      const dayMultMap = { 'day': 1.45, 'week': 7, 'month': 31 };
      const interval = intervalMap[currentTF] || '1d';
      const dayMult = dayMultMap[currentTF] || 1.45;
      const _period2 = Math.floor(Date.now() / 1000);
      const _period1 = _period2 - Math.ceil(count * dayMult * 86400);
      url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${code}?interval=${interval}&period1=${_period1}&period2=${_period2}`)}`;
      const res = await _fetchWithTimeout(url);
      if (!res.ok) return null;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return null;
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      raw = ts.map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open?.[i] || 0, high: q.high?.[i] || 0, low: q.low?.[i] || 0,
        close: q.close?.[i] || 0, volume: q.volume?.[i] || 0,
      })).filter(_sxIsValidCandle).slice(-count);
    } else if (currentMarket === 'kr' && _kisEnabled) {
      // KIS 캔들
      const isMinute = /^\d+m$/.test(currentTF);
      if (isMinute) {
        const token = await _getKisToken();
        if (!token) return null;
        const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: (typeof _sxSessionKisHour === 'function' ? _sxSessionKisHour('kr') : '153000'), FID_ETC_CLS_CODE: '', FID_PW_DATA_INCU_YN: 'Y' }).toString();
        const res = await _fetchWithTimeout(`${WORKER_BASE}/kis/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${qs}`, {
          headers: { 'authorization': `Bearer ${await _getKisToken()}`, 'appkey': _kisConfig.appKey, 'appsecret': _kisConfig.appSecret, 'tr_id': 'FHKST03010200', 'Content-Type': 'application/json; charset=utf-8' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const bars = data?.output2;
        if (!bars || !bars.length) return null;
        raw = bars.map(b => ({
          date: (b.stck_bsop_date || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') + ' ' + (b.stck_cntg_hour || '').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2'),
          open: Number(b.stck_oprc || 0), high: Number(b.stck_hgpr || 0), low: Number(b.stck_lwpr || 0), close: Number(b.stck_prpr || b.stck_clpr || 0), volume: Number(b.cntg_vol || b.acml_vol || 0),
        })).filter(_sxIsValidCandle).reverse().slice(-count);
      } else {
        const periodMap = { 'day': 'D', 'week': 'W', 'month': 'M' };
        const period = periodMap[currentTF] || 'D';
        const token = await _getKisToken();
        if (!token) return null;
        const KIS_PAGE = 100;
        const maxPages = Math.min(Math.ceil(count / KIS_PAGE), 5);
        let allBars = [];
        let curEnd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        for (let pg = 0; pg < maxPages; pg++) {
          const endD = curEnd.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
          const sd = new Date(endD);
          const daySpan = { 'day': Math.ceil(KIS_PAGE * 1.8), 'week': Math.ceil(KIS_PAGE * 10), 'month': Math.ceil(KIS_PAGE * 35) }[currentTF] || Math.ceil(KIS_PAGE * 1.8);
          sd.setDate(sd.getDate() - daySpan);
          const startStr = sd.toISOString().slice(0, 10).replace(/-/g, '');
          const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_DATE_1: startStr, FID_INPUT_DATE_2: curEnd, FID_PERIOD_DIV_CODE: period, FID_ORG_ADJ_PRC: '0' }).toString();
          const res = await _fetchWithTimeout(`${WORKER_BASE}/kis/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`, {
            headers: { 'authorization': `Bearer ${await _getKisToken()}`, 'appkey': _kisConfig.appKey, 'appsecret': _kisConfig.appSecret, 'tr_id': 'FHKST03010100', 'Content-Type': 'application/json; charset=utf-8' }
          });
          if (!res.ok) break;
          const data = await res.json();
          const bars = data?.output2;
          if (!bars || !bars.length) break;
          const mapped = bars.map(b => ({
            date: (b.stck_bsop_date || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            open: Number(b.stck_oprc || 0), high: Number(b.stck_hgpr || 0), low: Number(b.stck_lwpr || 0), close: Number(b.stck_clpr || 0), volume: Number(b.acml_vol || 0), foreignExhaustion: 0,
          })).filter(_sxIsValidCandle);
          allBars = mapped.concat(allBars);
          if (bars.length < KIS_PAGE) break;
          const oldest = bars[bars.length - 1]?.stck_bsop_date;
          if (!oldest) break;
          const od = new Date(oldest.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
          od.setDate(od.getDate() - 1);
          curEnd = od.toISOString().slice(0, 10).replace(/-/g, '');
        }
        // [FIX] KIS output2는 최신→과거 내림차순 → 중복 제거 후 시간 순으로 정렬
        const seen = new Set();
        raw = allBars.filter(b => { if (seen.has(b.date)) return false; seen.add(b.date); return true; })
                     .sort((a, b) => a.date.localeCompare(b.date))
                     .slice(-count);
      }
    } else {
      // 네이버 sise
      const tfMap = { '5m': 'minute5', '15m': 'minute15', '30m': 'minute30', '60m': 'minute60', 'day': 'day', 'week': 'week', 'month': 'month' };
      const timeframe = tfMap[currentTF] || 'day';
      const end = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const startDate = new Date();
      const dayRange = { '5m': 7, '15m': 14, '30m': 21, '60m': 30, 'day': Math.ceil(count * 1.8), 'week': Math.ceil(count * 10), 'month': Math.ceil(count * 35) }[currentTF] || Math.ceil(count * 1.8);
      startDate.setDate(startDate.getDate() - dayRange);
      const start = startDate.toISOString().slice(0, 10).replace(/-/g, '');
      url = `${WORKER_BASE}/naver/sise?symbol=${code}&timeframe=${timeframe}&start=${start}&end=${end}`;
      const res = await _fetchWithTimeout(url);
      if (!res.ok) return null;
      const json = await res.json();
      let dataArr = json.data;
      if ((!dataArr || !dataArr.length) && json.raw) {
        try {
          const cleaned = json.raw.trim().replace(/^\uFEFF/, '');
          let parsed = null;
          try { parsed = JSON.parse(cleaned); } catch (_) {}
          if (!parsed) try { parsed = JSON.parse(cleaned.replace(/'/g, '"')); } catch (_) {}
          if (!parsed) {
            const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.startsWith('['));
            if (lines.length >= 2) {
              parsed = lines.map(line => {
                const inner = line.replace(/^\[/, '').replace(/\],?$/, '');
                return inner.split(',').map(v => { v = v.trim().replace(/^["']|["']$/g, ''); const num = Number(v); return isNaN(num) || v === '' ? v : num; });
              });
            }
          }
          if (parsed && Array.isArray(parsed) && parsed.length >= 2) {
            const hdr = parsed[0];
            dataArr = parsed.slice(1).map(row => { const obj = {}; hdr.forEach((h, i) => { obj[h] = row[i]; }); return obj; });
          }
        } catch (_) {}
      }
      raw = (dataArr || []).map(r => ({
        date: r.localDate || r['날짜'] || r.date || '',
        open: parseFloat(r.openPrice || r['시가'] || r.open || 0), high: parseFloat(r.highPrice || r['고가'] || r.high || 0),
        low: parseFloat(r.lowPrice || r['저가'] || r.low || 0), close: parseFloat(r.closePrice || r['종가'] || r.close || 0),
        volume: parseInt(r.accumulatedTradingVolume || r['거래량'] || r.volume || 0),
        foreignExhaustion: parseFloat(r['외국인소진율'] || r.foreignExhaustion || 0),
      })).filter(_sxIsValidCandle).slice(-count);
    }
    if (!raw || !raw.length) return null;
    // [SAFETY-SORT] 모든 데이터 소스에 대해 시간 오름차순 보장
    raw.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    candleCache[cacheKey] = { ts: Date.now(), data: raw };
    // [WEAK-3 FIX] 캐시 GC (Worker 환경 — 인라인 구현; 100개 상한, TTL 10분)
    try{
      const _keys = Object.keys(candleCache);
      if(_keys.length > 100){
        const _now = Date.now();
        // 만료분 제거
        for(const k of _keys){
          if(candleCache[k] && (_now - (candleCache[k].ts||0)) > 600000) delete candleCache[k];
        }
        // 여전히 초과면 오래된 순으로 삭제
        const _rem = Object.keys(candleCache);
        if(_rem.length > 100){
          _rem.sort((a,b)=> (candleCache[a].ts||0) - (candleCache[b].ts||0));
          for(let i = 0; i < _rem.length - 100; i++) delete candleCache[_rem[i]];
        }
      }
    }catch(_){}
    return raw;
  } catch (e) {
    if (!_retry) { await new Promise(r => setTimeout(r, 500)); return fetchCandles(code, count, true); }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  필터 함수 (passFilters, checkTechConditions, checkKisConditions 등)
//  — sx_screener.html에서 이관
// ═══════════════════════════════════════════════════════════════
function passFilters(s, getFilter) {
  // [PATCH-14] 탈락 원인 통계 — 0결과 스캔 시 어떤 필터가 주범인지 메인에 보고
  //   성능 영향 최소화를 위해 _passFilterReject 전역에 카운트만 증가
  const _reject = (reason) => {
    if (typeof _passFilterStats === 'object') {
      _passFilterStats[reason] = (_passFilterStats[reason] || 0) + 1;
    }
    return false;
  };
  // [v3.12 PATCH-1A] no_price_data reject 완화
  //   현재 정책: marketCap > 0이면 종목 풀에 정상 등록된 종목으로 간주하고 통과시킴.
  //     가격 의존 검사는 각 필터 항목에서 자체 수행 (price === 0이면 자연히 min 미달로 reject).
  //     완전히 데이터 없는(marketCap도 0) 종목만 진단용으로 reject.
  //   〔이력〕 이전 문제: 가격 의존 필터(price_range/change_rate 등) 활성 시,
  //     KRX market-cap API에서 시가총액은 받았지만 가격은 0인 종목들을 통째로 reject
  //     → "현재가 100만원~"만 설정해도 모든 종목 reject → 0건 (수정됨)
  const priceBasedIds = ['change_rate', 'volume_min', 'trade_amount', 'volume_prev_ratio', 'foreign_ratio', 'price_range', 'trade_amount_24h'];
  const hasAnyPriceFilter = priceBasedIds.some(id => getFilter(id));
  if (hasAnyPriceFilter && s.marketCap === 0 && s.price === 0 && s.tradeAmount === 0 && s.volume === 0) return _reject('no_market_data');

  const mcap = getFilter('market_cap');
  if (mcap && mcap.value) { if (mcap.value.min !== null && s.marketCap < mcap.value.min) return _reject('market_cap.min'); if (mcap.value.max !== null && s.marketCap > mcap.value.max) return _reject('market_cap.max'); }
  const chg = getFilter('change_rate');
  if (chg && chg.value) { if (chg.value.min !== null && s.changeRate < chg.value.min) return _reject('change_rate.min'); if (chg.value.max !== null && s.changeRate > chg.value.max) return _reject('change_rate.max'); }
  const vol = getFilter('volume_min');
  if (vol && vol.value) { if (vol.value.min !== null && s.volume < vol.value.min) return _reject('volume_min.min'); if (vol.value.max !== null && s.volume > vol.value.max) return _reject('volume_min.max'); }
  const ta = getFilter('trade_amount');
  if (ta && ta.value) { if (ta.value.min !== null && s.tradeAmount < ta.value.min) return _reject('trade_amount.min'); }
  const ta24h = getFilter('trade_amount_24h');
  if (ta24h && ta24h.value) { if (ta24h.value.min !== null && s.tradeAmount < ta24h.value.min) return _reject('trade_amount_24h.min'); if (ta24h.value.max !== null && s.tradeAmount > ta24h.value.max) return _reject('trade_amount_24h.max'); }
  const pr = getFilter('price_range');
  if (pr && pr.value) { if (pr.value.min !== null && s.price < pr.value.min) return _reject('price_range.min'); if (pr.value.max !== null && s.price > pr.value.max) return _reject('price_range.max'); }
  const vpRatio = getFilter('volume_prev_ratio');
  if (vpRatio && vpRatio.value) { if (vpRatio.value.min !== null && s.volumeRatio < vpRatio.value.min) return _reject('volume_prev_ratio.min'); if (vpRatio.value.max !== null && s.volumeRatio > vpRatio.value.max) return _reject('volume_prev_ratio.max'); }
  const fr = getFilter('foreign_ratio');
  if (fr && fr.value) { if (fr.value.min !== null && s.foreignRatio < fr.value.min) return _reject('foreign_ratio.min'); if (fr.value.max !== null && s.foreignRatio > fr.value.max) return _reject('foreign_ratio.max'); }
  const excl = getFilter('exclude_types');
  if (excl && excl.value) {
    if (excl.value.includes('preferred') && s.name.includes('우')) return _reject('exclude_types.preferred');
    if (excl.value.includes('etf') && scanMarket !== 'ETF' && (s.sector === 'ETF' || s.market === 'ETF')) return _reject('exclude_types.etf');
    if (excl.value.includes('spac') && s.name.includes('스팩')) return _reject('exclude_types.spac');
  }
  // 시장환경 필터 — Worker에서는 _marketEnvData 스냅샷 사용
  // [v3.15 ENV-FIX] _marketEnvData가 raw {kospi:{cr,close}} 형태 — score 필드 없음
  //   원인: marketEnvData = JSON.parse(SX_MARKET_INDEX) raw 데이터 그대로 전달
  //         MarketEnv.load()의 동적 score 계산이 worker에 미반영
  //   증상: 약세장에서 '약세 포함' 선택 시 모든 종목 탈락
  //   수정: worker에서 cr → classify → dir 직접 계산
  const envState = getFilter('mkt_env_state');
  if (envState && envState.value && envState.value !== '설정안함') {
    if (_marketEnvData) {
      const stateMap = { '강세': 'bull', '약세강세': 'mild_bull', '중립': 'neutral', '약세약세': 'mild_bear', '약세': 'bear', '강세 포함': ['bull','mild_bull'], '약세 포함': ['bear','mild_bear'] };
      const wanted = envState.value.replace(/\s*\(.*\)/, '').trim();
      const wantedKey = stateMap[wanted] || wanted;
      // raw cr → score classify (sx_analysis_engine.js의 classify와 동일)
      const _classify = (cr) => {
        if (cr == null || isNaN(cr)) return { dir: 'unknown', score: 0 };
        if (cr > 1.5) return { dir: 'bull', score: 2 };
        if (cr > 0.3) return { dir: 'mild_bull', score: 1 };
        if (cr > -0.3) return { dir: 'flat', score: 0 };
        if (cr > -1.5) return { dir: 'mild_bear', score: -1 };
        return { dir: 'bear', score: -2 };
      };
      let curState = 'neutral';
      const env = _marketEnvData;
      if (currentMarket === 'coin') {
        const cr = env.btc?.cr ?? env.btc?.changeRate;
        if (cr != null) curState = _classify(cr).dir;
      } else if (currentMarket === 'us') {
        const crs = [env.sp500?.cr ?? env.sp500?.changeRate, env.nasdaq?.cr ?? env.nasdaq?.changeRate, env.dow?.cr ?? env.dow?.changeRate].filter(v => v != null);
        if (crs.length) {
          const scores = crs.map(cr => _classify(cr).score);
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          curState = avg > 0.8 ? 'bull' : avg > 0.2 ? 'mild_bull' : avg < -0.8 ? 'bear' : avg < -0.2 ? 'mild_bear' : 'neutral';
        }
      } else {
        const crs = [env.kospi?.cr ?? env.kospi?.changeRate, env.kosdaq?.cr ?? env.kosdaq?.changeRate].filter(v => v != null);
        if (crs.length) {
          const scores = crs.map(cr => _classify(cr).score);
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          curState = avg > 0.8 ? 'bull' : avg > 0.2 ? 'mild_bull' : avg < -0.8 ? 'bear' : avg < -0.2 ? 'mild_bear' : 'neutral';
        }
      }
      if (Array.isArray(wantedKey)) { if (!wantedKey.includes(curState)) return _reject('mkt_env_state'); }
      else if (curState !== wantedKey) return _reject('mkt_env_state');
    }
  }
  // 지수 등락률 필터 — KOSPI/KOSDAQ/BTC/NASDAQ/SP500/DOW 6종 개별 등락률 범위 검사
  const _envRC = (filterId, envKey) => {
    const f = getFilter(filterId);
    if (!f || !f.value) return true;
    const cr = _marketEnvData?.[envKey]?.changeRate ?? _marketEnvData?.[envKey]?.cr ?? null;
    if (cr !== null) { if (f.value.min !== null && cr < f.value.min) return false; if (f.value.max !== null && cr > f.value.max) return false; }
    return true;
  };
  if (!_envRC('mkt_env_kospi_chg', 'kospi')) return _reject('mkt_env_kospi_chg');
  if (!_envRC('mkt_env_kosdaq_chg', 'kosdaq')) return _reject('mkt_env_kosdaq_chg');
  if (!_envRC('mkt_env_btc_chg', 'btc')) return _reject('mkt_env_btc_chg');
  if (!_envRC('mkt_env_nasdaq_chg', 'nasdaq')) return _reject('mkt_env_nasdaq_chg');
  if (!_envRC('mkt_env_sp500_chg', 'sp500')) return _reject('mkt_env_sp500_chg');
  if (!_envRC('mkt_env_dow_chg', 'dow')) return _reject('mkt_env_dow_chg');

  const sect = getFilter('sector');
  if (sect && sect.value && sect.value.length) {
    // [v3.12 PATCH-1B] alias 테이블 적용 — KRX IDX_NM과 UI 옵션 차이 해소
    if (!matchSector(s.sector, s.name, sect.value)) return _reject('sector');
  }
  // [v3.16 잔재 정리] face_value, capital, foreign_exhaustion, open_change_rate,
  //                     short_balance_ratio, short_ratio, listed_shares, volume_turnover 처리 제거
  //   사유: P1 정리 시 UI에서 모두 제거됨 (KRX 502 또는 데이터 누락으로 작동 불가)
  return true;
}

// ─── [S317] 골든크로스 헬퍼 ─────────────────────────────────────────────
// 윈도우 크로스 의미:
//   N=2: 직전봉(n-2)에서 A≤B, 현재봉(n-1)에서 A>B → 마지막 봉에서 교차 (가장 엄격)
//   N>2: n-N 시점에서 A≤B, n-1 시점에서 A>B → 그 사이 어딘가에서 교차 (느슨)
//   N은 _recent_n_bars.max 메타조건에서 가져옴 (기본 2)
function _gcN(getFilter, fallback) {
  if (!getFilter) return fallback || 2;
  const f = getFilter('_recent_n_bars');
  if (!f || !f.value) return fallback || 2;
  const v = f.value;
  const n = (typeof v === 'object') ? (v.max != null ? v.max : v.min) : v;
  return Math.max(2, Math.min(60, parseInt(n) || (fallback || 2)));
}
function _gcWinCross(A, B, N, dir) {
  if (!Array.isArray(A) || !Array.isArray(B)) return false;
  const n = Math.min(A.length, B.length);
  if (n < N) return false;
  const sA = A[n - N], sB = B[n - N];
  const eA = A[n - 1], eB = B[n - 1];
  if (sA == null || sB == null || eA == null || eB == null) return false;
  if (!Number.isFinite(sA) || !Number.isFinite(sB) || !Number.isFinite(eA) || !Number.isFinite(eB)) return false;
  if (dir === 'golden') return sA <= sB && eA > eB;
  if (dir === 'dead') return sA >= sB && eA < eB;
  return false;
}
// 스칼라 윈도우 크로스: 시작/끝 시점의 단일 값으로 0선·임계선 교차 판정
function _gcScalarCross(startVal, endVal, threshold, dir) {
  if (!Number.isFinite(startVal) || !Number.isFinite(endVal)) return false;
  if (dir === 'golden') return startVal <= threshold && endVal > threshold;
  if (dir === 'dead') return startVal >= threshold && endVal < threshold;
  return false;
}
// [S365] EMA는 엔진(sx_analysis_engine.js) 전역 ema() 사용 — 중복 _emaLast 제거.
//   ema(arr,period): sma처럼 importScripts로 로드된 엔진 함수. 미충족 시 null(Number.isFinite로 걸러짐).
// ────────────────────────────────────────────────────────────────────────

// checkTechConditions — importScripts로 로드된 엔진의 sma/calcIndicators를 사용

// [S494] _candleTransitionScore — sx_render.js 동명 함수의 미러 (조건검색 worker용). render 수정 시 반드시 동기화.
function _candleTransitionScore(rows, indicators, market){
  if(!Array.isArray(rows) || rows.length < 25) return { active:false, reason:'데이터 부족' };
  // [S506] 종가 확정봉 기준 + 시장별 마감 판단 — 마지막 봉이 '미완성(장중)'이면 제외, '확정(장 마감 후/과거)'이면 포함.
  //   장중: 어제 확정봉으로 오늘 예측 / 장 마감 후: 오늘 확정봉으로 내일 예측. 캔들 패턴은 봉 완성(종가) 후 확정되므로.
  const _mkt = String(market||'').toLowerCase();
  const _mc = (_mkt.includes('us')||_mkt.includes('해외')||_mkt.includes('nasdaq')||_mkt.includes('nyse'))
                ? { tz:'America/New_York', cm:16*60 }
            : (_mkt.includes('coin')||_mkt.includes('코인')||_mkt.includes('crypto'))
                ? { tz:'UTC', coin:true }
                : { tz:'Asia/Seoul', cm:15*60+30 };
  let _trimmed = false;
  { const _ld = String((rows[rows.length-1]||{}).date||'').match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if(_ld){
      const _lastStr = `${_ld[1]}-${_ld[2]}-${_ld[3]}`;
      let _p = null;
      try { _p = {}; new Intl.DateTimeFormat('en-CA',{timeZone:_mc.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).forEach(x=>_p[x.type]=x.value); } catch(e){ _p=null; }
      if(_p){
        const _tzToday = `${_p.year}-${_p.month}-${_p.day}`;
        let _confirmed;
        if(_lastStr !== _tzToday) _confirmed = true;                  // 과거/미래봉 → 이미 확정
        else if(_mc.coin) _confirmed = false;                         // 코인: UTC 오늘봉은 진행 중
        else _confirmed = ((+_p.hour)*60 + (+_p.minute)) >= _mc.cm;   // 마감 지났으면 확정
        if(!_confirmed){ rows = rows.slice(0,-1); _trimmed = true; }
      }
    } }
  if(rows.length < 25) return { active:false, reason:'데이터 부족' };
  // 미완성봉 제외 시 엔진 패턴(indicators.candle)은 그 봉 포함분이라 불일치 → 확정봉 기준으로 재계산.
  let _ind = indicators;
  if(_trimmed && typeof Candle !== 'undefined' && Candle && typeof Candle.analyze === 'function'){
    _ind = Object.assign({}, indicators, { candle: Candle.analyze(rows) });
  }
  const n = rows.length, last = n - 1;
  // [S506] 다음봉(예측 대상) 날짜 = 확정봉 다음 영업일 (주식은 주말 스킵 / 코인은 매일). 공휴일은 근사로 무시.
  let _nextBar = null;
  { const _m2 = String((rows[last]||{}).date||'').match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if(_m2){ const _d2 = new Date(+_m2[1], +_m2[2]-1, +_m2[3]); _d2.setDate(_d2.getDate()+1);
      if(!_mc.coin){ while(_d2.getDay()===0 || _d2.getDay()===6) _d2.setDate(_d2.getDate()+1); }
      _nextBar = `${_d2.getMonth()+1}/${_d2.getDate()}`; } }
  const C = i => +rows[i].close, O = i => +rows[i].open, H = i => +rows[i].high, L = i => +rows[i].low, V = i => +(rows[i].volume||0);
  const price = C(last);
  const closes = rows.map(r => +r.close);

  // [S484] 거울상 — 연속 음봉/양봉 둘 다 카운트. 음봉연속→양봉전이(반등, 양수) / 양봉연속→음봉전이(반전, 음수).
  let redCnt = 0, greenCnt = 0;
  for(let i=last; i>=0; i--){ if(C(i) <  O(i)) redCnt++;   else break; }
  for(let i=last; i>=0; i--){ if(C(i) >= O(i)) greenCnt++; else break; }
  // [S503] 최근 8봉 양봉/음봉 카운터 — 양봉 −1, 음봉 +1 (음봉 우세=양봉전이 쪽 +, 양봉 우세=음봉전이 쪽 −). −8~+8 보조점수.
  let _red8 = 0, _green8 = 0;
  for(let i=Math.max(0, n-8); i<=last; i++){ if(C(i) < O(i)) _red8++; else _green8++; }
  const _counter8 = _red8 - _green8;
  // [S491] 정합 — 자체 2봉 감지(S490) 제거. 엔진 Candle.analyze 결과(ind.candle)를 읽어 정합 확보.
  //   분석탭 캔들패턴 카드·조건검색·C 감독관과 동일 판정 공유. 스타·하라미·장악·관통/흑운 전부 엔진 명칭 사용.
  const _cp = (_ind && _ind.candle && Array.isArray(_ind.candle.patterns)) ? _ind.candle
            : (_ind && _ind.patterns && Array.isArray(_ind.patterns.patterns)) ? _ind.patterns
            : (_ind && _ind.patternsLegacy && Array.isArray(_ind.patternsLegacy.patterns)) ? _ind.patternsLegacy
            : null;
  const _engPats = _cp ? _cp.patterns : [];
  const BULL_REV = ['상승장악','피어싱라인','모닝스타','모닝도지스타','상승어밴던드베이비','하라미상승','하라미크로스','집게바닥','상승카운터어택','상승어밴던드베이비'];
  const BEAR_REV = ['하락장악','다크클라우드','이브닝스타','이브닝도지스타','하락어밴던드베이비','하라미하락','하라미크로스','집게천정','하락카운터어택'];
  const _bullPat = _engPats.filter(p => p.dir>0 && BULL_REV.includes(p.name)).sort((a,b)=>b.score-a.score)[0] || null;
  const _bearPat = _engPats.filter(p => p.dir<0 && BEAR_REV.includes(p.name)).sort((a,b)=>b.score-a.score)[0] || null;

  // 강한 반전 패턴(장악10·스타12·도지스타13·어밴던드15 등 강도 10+)은 연속 추세를 덮어 우선.
  //   (모닝스타='음봉-소봉-양봉'처럼 마지막 2봉이 동색이라 연속으로 오인되는 문제 방지)
  //   약한 반전(하라미7·피어싱/다크8·집게7·카운터7)은 연속 다음 순위.
  const _strongBull = (_bullPat && _bullPat.score >= 10) ? _bullPat : null;
  const _strongBear = (_bearPat && _bearPat.score >= 10) ? _bearPat : null;
  let mode = null;
  if(_strongBull && (!_strongBear || _strongBull.score >= _strongBear.score)) mode='flipUp';
  else if(_strongBear) mode='flipDown';
  else if(redCnt >= 2) mode='rebound';
  else if(greenCnt >= 2) mode='reversal';
  else if(_bullPat && (!_bearPat || _bullPat.score >= _bearPat.score)) mode='flipUp';
  else if(_bearPat) mode='flipDown';
  if(!mode) mode = 'count';   // [S503] 연속/패턴 없어도 8봉 카운터로 기본 점수 부여 (비활성 → count 모드)

  const _sma = (arr, p, end) => { if(end+1 < p) return null; let s=0; for(let k=end-p+1;k<=end;k++) s+=arr[k]; return s/p; };
  let score = 0; const reasons = []; let warn = null;   // base 0, 양방향(-100~+100)

  // 공통 추세 — 20MA 기울기 + 60일 고저권
  const ma20now = _sma(closes,20,last), ma20prev = _sma(closes,20,Math.max(0,last-5));
  const slope = (ma20now!=null && ma20prev!=null && ma20prev>0) ? (ma20now - ma20prev)/ma20prev : 0;
  const seg60 = rows.slice(Math.max(0,n-60));
  const hi60 = Math.max(...seg60.map(r=>+r.high)), lo60 = Math.min(...seg60.map(r=>+r.low));
  const pos60 = (hi60>lo60) ? (price - lo60)/(hi60 - lo60) : 0.5;
  const trendUp = slope > 0.005 && pos60 > 0.5;

  // [S503] count 모드 — 연속/패턴 없는 종목. 8봉 카운터만으로 기본 점수 부여 → early return.
  if(mode === 'count'){
    score = _counter8;
    reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);
    reasons.push('연속·패턴 신호 없음 — 8봉 분포 기반 기본 점수');
    score = Math.max(-100, Math.min(100, Math.round(score)));
    const label = score >= 30 ? '양봉 전이 유망' : score <= -30 ? '음봉 전이 유망' : '중립';
    return { active:true, mode:'count', score, label, reasons, warn:null, redCnt, greenCnt, streak:0, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar };
  }

  // [S491] flip 모드 — 엔진 반전 패턴(ind.candle) 기반. 패턴 강도(score 7~15)에 비례 가점 + 추세 정합 + 거래량.
  if(mode === 'flipUp' || mode === 'flipDown'){
    const fup = mode === 'flipUp', fdir = fup ? 1 : -1;
    const pat = fup ? _bullPat : _bearPat;
    const trendDnF = slope < -0.005 && pos60 < 0.5;
    score += fdir * Math.min(45, Math.round(pat.score * 3));   // 엔진 강도 7~15 → 21~45
    reasons.push((fup?'🔺 ':'🔻 ') + pat.name + ` (캔들 엔진 감지 · 강도 ${pat.score})`);
    if(fup){
      if(trendDnF){ score += 12; reasons.push('하락추세 바닥권 반전 (신뢰도↑)'); }
      else if(trendUp){ score += 6; reasons.push('상승추세 눌림 후 재상승'); }
    } else {
      if(trendUp){ score -= 12; warn = '상승추세 천장권 약세 전환 신호'; reasons.push('⚠️ 상승추세 천장 반전 (신뢰도↑)'); }
      else if(trendDnF){ score -= 6; reasons.push('하락추세 지속'); }
    }
    let v5=0, vk=0; for(let i=Math.max(0,last-5); i<last; i++){ v5+=V(i); vk++; } v5 = vk ? v5/vk : 0;
    if(v5>0 && V(last) > v5*1.2){ score += fdir*10; reasons.push('전환봉 거래량 동반 (신뢰도↑)'); }
    score += _counter8;   // [S503] 8봉 카운터 보조
    if(_counter8 !== 0) reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);   // [S504] 카운터를 점수 항목으로 명시
    score = Math.max(-100, Math.min(100, Math.round(score)));
    const label = score >= 30 ? '양봉 전이 유망' : score <= -30 ? '음봉 전이 유망' : '중립';
    return { active:true, mode, score, label, reasons, warn, redCnt, greenCnt, streak:0, patName: pat.name, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar };
  }

  // ===== 연속 모드 (rebound / reversal) =====
  const reb = mode === 'rebound';        // 반등 모드(음봉연속) — 양수 지향
  const dir = reb ? 1 : -1;              // 점수 부호: 반등=+, 반전=−
  const streak = reb ? redCnt : greenCnt;
  const trendDn = slope < -0.005 && pos60 < (reb ? 0.4 : 0.6);
  if(reb){
    if(trendUp){ score += 20; reasons.push('상승추세 눌림목 (20MA↑ · 60일 고점권)'); }
    else if(trendDn){ score -= 25; warn = '하락추세 진행 중 — 연속 음봉이 추세 하락의 일부일 수 있음'; reasons.push('⚠️ 하락추세 (20MA↓ · 60일 저점권)'); }
    else { score += 5; reasons.push('추세 횡보'); }
  } else {
    if(trendDn){ score -= 20; warn = '하락추세 속 반등 — 데드캣 바운스 후 재하락 가능'; reasons.push('⚠️ 하락추세 반등 (데드캣 의심)'); }
    else if(trendUp){ score += 20; reasons.push('상승추세 지속 (20MA↑ · 60일 고점권)'); }
    else { score -= 5; reasons.push('추세 횡보'); }
  }

  // [S485] C1-b 연속일수 보정 — '추세 × 연속일수'를 양봉 전이 유망도 축에 반영.
  //   적정(3~5)=신호 성숙 / 과도(6+)=추세 전환 신호로 부호 반전. 부호는 항상 양봉 가능성 기준(↑=+ / ↓=−).
  if(reb){
    if(trendUp && streak >= 3 && streak <= 5){ score += 6; reasons.push(`눌림 ${streak}연속 — 반등 성숙`); }
    else if(streak >= 6){ score -= 8; if(!warn) warn = `음봉 ${streak}연속 — 단순 눌림 넘어 추세 약화 신호`; reasons.push(`⚠️ 음봉 ${streak}연속 (과도)`); }
    else if(trendDn && streak >= 4){ score -= 8; reasons.push(`⚠️ 하락추세 ${streak}연속 — 투매 지속`); }
  } else {
    if(streak >= 6){ score -= 8; if(!warn) warn = `양봉 ${streak}연속 — 과열, 음봉 전이 임박`; reasons.push(`⚠️ 양봉 ${streak}연속 (과열)`); }
    else if(trendDn && streak >= 4){ reasons.push(`데드캣 ${streak}연속 — 추세 전환 여부 모호`); }
  }

  // C2 압력 고갈 — 거래량 위축 + 몸통 축소 (반등=매도압력 고갈 / 반전=매수압력 고갈)
  let vol5 = 0, vc = 0; for(let i=Math.max(0,last-5); i<last; i++){ vol5 += V(i); vc++; } vol5 = vc ? vol5/vc : 0;
  if(vol5 > 0 && V(last) < vol5 * 0.7){ score += dir*10; reasons.push(reb ? '거래량 위축 (매도압력 고갈)' : '거래량 위축 (매수압력 고갈)'); }
  const body = Math.abs(C(last)-O(last)), bodyPrev = Math.abs(C(last-1)-O(last-1));
  if(bodyPrev > 0 && body < bodyPrev){ score += dir*8; reasons.push(reb ? '음봉 몸통 축소' : '양봉 몸통 축소'); }

  // C3 지지/저항선 겹침 — 200MA · 직전 고점 · 볼린저밴드 (반등=지지/하단 / 반전=저항/상단), 현재가 ±3%
  const near = lv => lv!=null && lv>0 && Math.abs(price-lv)/price <= 0.03;
  const prevSeg = rows.slice(Math.max(0,n-60), Math.max(1,n-5));
  const _bb = (indicators && indicators._advanced && indicators._advanced.bb) ? indicators._advanced.bb
            : (indicators && indicators.bb) ? indicators.bb : null;
  let confl = 0;
  if(near(_sma(closes,200,last))){ confl++; reasons.push('200MA 근접'); }
  if(prevSeg.length && near(Math.max(...prevSeg.map(r=>+r.high)))){ confl++; reasons.push(reb ? '직전 전고점 매물대' : '직전 고점 저항'); }
  const bbLv = reb ? (_bb && _bb.lower) : (_bb && _bb.upper);
  if(near(bbLv)){ confl++; reasons.push(reb ? '볼린저 하단' : '볼린저 상단'); }
  if(confl > 0){ score += dir*confl*8; if(confl >= 2) reasons.push(`${reb?'지지':'저항'}선 ${confl}겹`); }

  // C4 이격/폭 — 반등: 20일 고점 대비 낙폭 / 반전: 20일 저점 대비 급등폭
  if(reb){
    const hi20 = Math.max(...rows.slice(Math.max(0,n-20)).map(r=>+r.high));
    const dd = hi20>0 ? (hi20 - price)/hi20 : 0;
    if(dd >= 0.15){ score += 12; reasons.push(`20일 고점 대비 -${Math.round(dd*100)}% 조정 (눌림 충분)`); }
    else if(dd < 0.05){ score -= 15; reasons.push(`⚠️ 고점권 첫 음봉 (조정 -${Math.round(dd*100)}%, 물림 위험)`); }
  } else {
    const lo20 = Math.min(...rows.slice(Math.max(0,n-20)).map(r=>+r.low));
    const ru = lo20>0 ? (price - lo20)/lo20 : 0;
    if(ru >= 0.15){ score -= 12; reasons.push(`20일 저점 대비 +${Math.round(ru*100)}% 급등 (과열)`); }
    else if(ru < 0.05){ score += 15; reasons.push(`저점 막 반등 (+${Math.round(ru*100)}%, 상승 여지)`); }
  }

  // C5 마지막 봉 꼬리 — 반등: 아래꼬리(매수세) / 반전: 윗꼬리(매도세)
  const rng = H(last) - L(last), bodyRatio = rng>0 ? body/rng : 0;
  if(reb){
    const lowerWick = Math.min(O(last),C(last)) - L(last), wr = rng>0 ? lowerWick/rng : 0;
    if(wr >= 0.30){ score += 8; reasons.push('아래꼬리 — 저가 매수세 유입'); }
    else if(wr < 0.05 && bodyRatio > 0.7){ score -= 12; reasons.push('⚠️ 장대음봉 (꼬리 없음 — 추가 하락 여지)'); }
  } else {
    const upperWick = H(last) - Math.max(O(last),C(last)), ur = rng>0 ? upperWick/rng : 0;
    if(ur >= 0.30){ score -= 8; reasons.push('윗꼬리 — 고가 매도세 출현'); }
    else if(ur < 0.05 && bodyRatio > 0.7){ score += 12; reasons.push('장대양봉 (꼬리 없음 — 상승 강함)'); }
  }

  score += _counter8;   // [S503] 8봉 카운터 보조
  if(_counter8 !== 0) reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);   // [S504] 카운터를 점수 항목으로 명시
  score = Math.max(-100, Math.min(100, Math.round(score)));
  const label = score >= 30 ? '양봉 전이 유망' : score <= -30 ? '음봉 전이 유망' : '중립';
  return { active:true, mode, score, label, reasons, warn, redCnt, greenCnt, streak, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar };
}





// (이 함수는 메인 HTML과 동일한 로직이지만, Worker 전역의 sma를 참조)
function checkTechConditions(ind, techFilters, getFilter) {
  for (const f of techFilters) {
    const v = f.value;
    if (!v || v === '설정안함') continue;
    switch (f.id) {
      case 'ma_arrangement': {
        if (!ind.ma5 || !ind.ma20 || !ind.ma60) return false;
        if (v === '정배열 (3개)' && !(ind.ma5 > ind.ma20 && ind.ma20 > ind.ma60)) return false;
        if (v === '정배열 (4개)' && !(ind.ma5 > ind.ma20 && ind.ma20 > ind.ma60 && ind.ma60 > (ind.ma120 || 0))) return false;
        if (v === '역배열 (3개)' && !(ind.ma5 < ind.ma20 && ind.ma20 < ind.ma60)) return false;
        if (v === '역배열 (4개)' && !(ind.ma5 < ind.ma20 && ind.ma20 < ind.ma60 && ind.ma60 < (ind.ma120 || Infinity))) return false;
        break;
      }
      case 'ma_slope': {
        const cls = ind.closes, n = cls.length; if (n < 22) return false;
        const curMa20 = sma(cls, 20), prevMa20 = sma(cls.slice(0, -1), 20);
        if (v === 'MA20 상승중' && curMa20 <= prevMa20) return false; if (v === 'MA20 하락중' && curMa20 >= prevMa20) return false;
        if (n >= 62) { const curMa60 = sma(cls, 60), prevMa60 = sma(cls.slice(0, -1), 60); if (v === 'MA60 상승중' && curMa60 <= prevMa60) return false; if (v === 'MA60 하락중' && curMa60 >= prevMa60) return false; } else if (v.includes('MA60')) return false;
        break;
      }
      case 'macd_signal': { const m = ind.macd; if (v === 'MACD > Signal (매수)' && m.macd <= m.signal) return false; if (v === 'MACD < Signal (매도)' && m.macd >= m.signal) return false; break; }
      case 'macd_histogram': { const h = ind.macd.histogram, ph = ind.macd.prevHist; if (v === '양수 전환' && !(h > 0 && ph <= 0)) return false; if (v === '음수 전환' && !(h < 0 && ph >= 0)) return false; if (v === '양수 증가중' && !(h > 0 && h > ph)) return false; if (v === '음수 감소중' && !(h < 0 && h < ph)) return false; break; }
      case 'rsi_value': if (!rangeCheck(ind.rsi, v)) return false; break;
      case 'rs_value': if (!rangeCheck(ind.rs ? ind.rs.rs20 : null, v)) return false; break; // [S441] RS 조건 평가
      case 'adx_value': if (!rangeCheck(ind.adx.adx, v)) return false; break;
      case 'stoch_k': if (!rangeCheck(ind.stoch.k, v)) return false; break;
      case 'cci_value': if (!rangeCheck(ind.cci, v)) return false; break;
      case 'williams_r': if (!rangeCheck(ind.willR, v)) return false; break;
      case 'roc_value': if (!rangeCheck(ind.roc, v)) return false; break;
      case 'momentum_value': if (!rangeCheck(ind.momentum, v)) return false; break;
      case 'atr_value': if (!rangeCheck(ind.atr.atr, v)) return false; break;
      case 'atr_ratio': if (!rangeCheck(ind.atr.ratio, v)) return false; break;
      case 'mfi_value': if (!rangeCheck(ind.mfi, v)) return false; break;
      case 'vr_value': if (!rangeCheck(ind.vr, v)) return false; break;
      case 'stoch_cross': { const s = ind.stoch; if (v === '%K > %D (매수)' && s.k <= s.d) return false; if (v === '%K < %D (매도)' && s.k >= s.d) return false; break; }
      case 'dmi_cross': { const a = ind.adx; if (v === '+DI > -DI (상승)' && a.plusDI <= a.minusDI) return false; if (v === '+DI < -DI (하락)' && a.plusDI >= a.minusDI) return false; if (v === '+DI 골든크로스' && a.plusDI <= a.minusDI) return false; if (v === '+DI 데드크로스' && a.plusDI >= a.minusDI) return false; break; }
      case 'parabolic_sar': { const p = ind.psar; if (v === 'SAR 아래 (상승 추세)' && p.trend !== 'up') return false; if (v === 'SAR 위 (하락 추세)' && p.trend !== 'down') return false; if (v === '상승 전환' && p.trend !== 'up') return false; if (v === '하락 전환' && p.trend !== 'down') return false; break; }
      case 'bb_position': { const b = ind.bb; if (v === '상단 돌파' && b.last <= b.upper) return false; if (v === '상단 근접' && !(b.pctB >= 0.8 && b.pctB <= 1.0)) return false; if (v === '중심선 위' && b.last <= b.middle) return false; if (v === '중심선 아래' && b.last >= b.middle) return false; if (v === '하단 근접' && !(b.pctB >= 0 && b.pctB <= 0.2)) return false; if (v === '하단 이탈' && b.last >= b.lower) return false; break; }
      case 'bb_width': { if (v === '스퀴즈 (수축)' && !ind.bb.isSqueeze) return false; if (v === '확장중' && ind.bb.isSqueeze) return false; break; }
      case 'obv_trend': { const o = ind.obv; if (v === '상승 추세' && o.trend !== 'up') return false; if (v === '하락 추세' && o.trend !== 'down') return false; if (v === 'OBV 다이버전스 (가격↓ OBV↑)' && !o.divergence) return false; break; }
      case 'candle_type': case 'reversal_pattern': case 'continuation_pattern': {
        if (!Array.isArray(v) || v.length === 0) break;
        const _candleIdMap = { long_yang:'장대양봉',long_eum:'장대음봉',doji:'도지',hammer:'해머',shooting_star:'슈팅스타',spinning_top:'스피닝탑',morning_star:'모닝스타',evening_star:'이브닝스타',bullish_engulfing:'상승장악',bearish_engulfing:'하락장악',harami_bull:'하라미상승',harami_bear:'하라미하락',harami_cross:'하라미크로스',piercing:'피어싱라인',dark_cloud:'다크클라우드',inside_day:'인사이드데이',outside_day:'아웃사이드데이',tweezer_bottom:'집게바닥',tweezer_top:'집게천정',three_white:'적삼병',three_black:'흑삼병',gap_up:'갭상승',gap_down:'갭하락',gravestone_doji:'그레이브스톤도지',dragonfly_doji:'드래곤플라이도지',marubozu_bull:'양봉마루보즈',marubozu_bear:'음봉마루보즈',high_wave:'하이웨이브',bullish_counterattack:'상승카운터어택',bearish_counterattack:'하락카운터어택',morning_doji_star:'모닝도지스타',evening_doji_star:'이브닝도지스타',abandoned_baby_bull:'상승어밴던드베이비',abandoned_baby_bear:'하락어밴던드베이비',advance_block:'어드밴스블럭',stalled_pattern:'스톨드패턴',upside_gap_tasuki:'업사이드갭태스키',downside_gap_tasuki:'다운사이드갭태스키' };
        const _cObj = ind.candle || ind.patternsLegacy || ind.patterns || {};   // [S492] calcIndicators 리턴엔 candle만 있고 patterns 키가 없음 → 조건검색 캔들 패턴 필터가 깨져 있던 것 수정
        const allPats = _cObj.patterns || [];
        const allNames = allPats.map(p => p.name || '');
        if (!v.some(id => { const krName = _candleIdMap[id] || id; return allNames.some(n => n === krName); })) return false;   // [S493] includes→=== 정확매칭: '도지'가 '모닝도지스타' 등 이름에 부분매칭되던 오검출 제거
        break;
      }
      case 'candle_transition': {   // [S495] 캔들 전이 점수 조건 — 양봉 전이 유망(score≥30) / 음봉 전이 유망(score≤−30)
        if (!Array.isArray(v) || v.length === 0) break;
        const _rowsCT = (ind._advanced && ind._advanced.rows) || ind.candles;
        if (!_rowsCT || _rowsCT.length < 25) return false;
        const _ts = _candleTransitionScore(_rowsCT, ind, currentMarket);
        if (!_ts || !_ts.active) return false;
        const _wantBull = v.includes('trans_bull'), _wantBear = v.includes('trans_bear');
        const _isBull = _ts.score >= 30, _isBear = _ts.score <= -30;
        if (_wantBull && _wantBear) { if (!_isBull && !_isBear) return false; }
        else if (_wantBull) { if (!_isBull) return false; }
        else if (_wantBear) { if (!_isBear) return false; }
        break;
      }
      case 'consecutive_up_down': { const pa = ind.priceAction; if (!pa) break; const days = pa.consecutiveDays; if (typeof v === 'object' && v !== null) { if (v.min !== null && days < v.min) return false; if (v.max !== null && days > v.max) return false; } break; }
      case 'price_vs_ma': { if (v === '설정안함') break; const prc = ind.last || ind.price; if (v === 'MA5 위' && (!ind.ma5 || prc <= ind.ma5)) return false; if (v === 'MA5 아래' && (!ind.ma5 || prc >= ind.ma5)) return false; if (v === 'MA20 위' && (!ind.ma20 || prc <= ind.ma20)) return false; if (v === 'MA20 아래' && (!ind.ma20 || prc >= ind.ma20)) return false; if (v === 'MA60 위' && (!ind.ma60 || prc <= ind.ma60)) return false; if (v === 'MA60 아래' && (!ind.ma60 || prc >= ind.ma60)) return false; if (v === 'MA120 위' && (!ind.ma120 || prc <= ind.ma120)) return false; if (v === 'MA120 아래' && (!ind.ma120 || prc >= ind.ma120)) return false; break; }
      case 'envelope_position': { if (v === '설정안함') break; const env = ind.envelope || ind._advanced?.envelope; if (!env || !env.position) break; const eMap = { '상단 돌파': 'above_upper', '상단 근접': 'near_upper', '중심선 위': 'above_mid', '중심선 아래': 'below_mid', '하단 근접': 'near_lower', '하단 이탈': 'below_lower' }; if (eMap[v] && env.position !== eMap[v]) return false; break; }
      case 'pivot_level': { if (v === '설정안함') break; const pv = ind.pivot || ind._advanced?.pivot; if (!pv || !pv.level) break; const pvMap = { 'R2 이상': 'R2+', 'R1~R2': 'R1~R2', 'P~R1': 'P~R1', 'S1~P': 'S1~P', 'S1~S2': 'S1~S2', 'S2 이하': 'S2-' }; if (pvMap[v] && pv.level !== pvMap[v]) return false; break; }
      case 'price_channel': { if (v === '설정안함') break; const pc = ind.priceChannel || ind._advanced?.priceChannel; if (!pc || !pc.position) break; const pcMap = { '상단 돌파': 'breakout_up', '상단 반': 'upper_half', '하단 반': 'lower_half', '하단 이탈': 'breakout_down' }; if (pcMap[v] && pc.position !== pcMap[v]) return false; break; }
      case 'ma_disparity': { if (v === '설정안함') break; const md = ind.maDisparity || ind._advanced?.maDisparity; if (!md) break; if (v === 'MA20 +5%↑ 과열' && (md.disparity20 == null || md.disparity20 < 5)) return false; if (v === 'MA20 -5%↓ 침체' && (md.disparity20 == null || md.disparity20 > -5)) return false; if (v === 'MA60 +10%↑ 과열' && (md.disparity60 == null || md.disparity60 < 10)) return false; if (v === 'MA60 -10%↓ 침체' && (md.disparity60 == null || md.disparity60 > -10)) return false; if (v === 'MA20 근접 (±2%)' && (md.disparity20 == null || Math.abs(md.disparity20) > 2)) return false; if (v === 'MA60 근접 (±2%)' && (md.disparity60 == null || Math.abs(md.disparity60) > 2)) return false; break; }
      case 'ichimoku_cloud': { if (v === '설정안함') break; const ic = ind.ichimoku || ind._advanced?.ichimoku; if (!ic) break; if (v === '구름 위 (강세)' && ic.priceVsCloud !== 'above') return false; if (v === '구름 안 (중립)' && ic.priceVsCloud !== 'inside') return false; if (v === '구름 아래 (약세)' && ic.priceVsCloud !== 'below') return false; break; }
      case 'ichimoku_twist': { if (v === '설정안함') break; const ic3 = ind.ichimoku || ind._advanced?.ichimoku; if (!ic3) break; if (v === '양운 전환 (상승)' && !(ic3.cloudTrend === 'twist' && ic3.cloud === 'bullish')) return false; if (v === '음운 전환 (하락)' && !(ic3.cloudTrend === 'twist' && ic3.cloud === 'bearish')) return false; break; }
      case 'ichimoku_chikou': { if (v === '설정안함') break; const ic4 = ind.ichimoku || ind._advanced?.ichimoku; if (!ic4) break; const chikouRows = ind._advanced?.rows || ind.candles; if (!chikouRows || chikouRows.length < 27) break; const past26c = chikouRows[chikouRows.length - 27].close; if (v === '26봉 전 가격 위 (강세)' && ic4.chikou <= past26c) return false; if (v === '26봉 전 가격 아래 (약세)' && ic4.chikou >= past26c) return false; break; }
      case 'volume_ma_arr': { if (v === '설정안함') break; const vm = ind.volumeMA || ind._advanced?.volumeMA; if (!vm) break; if (v === '정배열 (5>20>60)' && vm.arrangement !== 'bullish') return false; if (v === '역배열 (5<20<60)' && vm.arrangement !== 'bearish') return false; if (v === '20일 MA 돌파' && !vm.breakout) return false; break; }
      case 'ad_trend': { if (v === '설정안함') break; const adv = ind.ad || ind._advanced?.ad; if (!adv) break; if (v === '상승 추세' && adv.trend !== 'up') return false; if (v === '하락 추세' && adv.trend !== 'down') return false; if (v === '다이버전스 (가격↓ AD↑)' && !adv.divergence) return false; break; }
      // ── S162: volume_consec_inc 스캔 워커 누락 복원 (screener.html L5862 로직 이식) ──
      case 'volume_consec_inc': { const _rows = ind._advanced?.rows || ind.candles; if (!_rows || _rows.length < 2) break; const vols = _rows.map(r => r.volume).filter(x => x >= 0); if (vols.length < 2) break; let cnt = 0; for (let i = vols.length - 1; i >= 1; i--) { if (vols[i] > vols[i - 1]) cnt++; else break; } if (typeof v === 'object' && v !== null) { if (v.min !== null && cnt < v.min) return false; if (v.max !== null && cnt > v.max) return false; } break; }
      // ── S161: 프리셋 실동작 복원 — 누락 case 9개 추가 (sx_analysis_engine과 동기화) ──
      case 'vhf_state': { if (v === '설정안함') break; const vhf = ind.vhf || ind._advanced?.vhfLegacy; if (!vhf || vhf.trending == null) break; if (v === '추세장 (>0.4)' && vhf.trending !== 'trending') return false; if (v === '횡보장 (<0.3)' && vhf.trending !== 'ranging') return false; if (v === '보통' && vhf.trending !== 'moderate') return false; break; }
      case 'eom_trend': { if (v === '설정안함') break; const eom = ind.eom || ind._advanced?.eomLegacy; if (!eom) break; if (v === '매수세 (상승)' && eom.trend !== 'bullish') return false; if (v === '매도세 (하락)' && eom.trend !== 'bearish') return false; break; }
      case 'chaikin_osc': { if (v === '설정안함') break; const co = ind.chaikinOsc || ind._advanced?.chaikinOscLegacy; if (!co) break; if (v === '양수 (매집)' && !(co.val > 0)) return false; if (v === '음수 (분산)' && !(co.val < 0)) return false; break; }
      case 'psycho_value': { const p = ind.psycho || ind._advanced?.psychoLegacy; if (!p || p.psycho == null) break; if (typeof v === 'object' && v !== null) { if (v.min !== null && p.psycho < v.min) return false; if (v.max !== null && p.psycho > v.max) return false; } break; }
      case 'new_psycho_value': { const p = ind.psycho || ind._advanced?.psychoLegacy; if (!p || p.newPsycho == null) break; if (typeof v === 'object' && v !== null) { if (v.min !== null && p.newPsycho < v.min) return false; if (v.max !== null && p.newPsycho > v.max) return false; } break; }
      case 'swing_structure': { if (v === '설정안함') break; const ss = ind.swingStruct || ind._advanced?.swingStructLegacy; if (!ss) break; if (v === 'Higher High (고점 상승)' && !ss.higherHighs) return false; if (v === 'HH+HL (상승구조)' && !(ss.higherHighs && !ss.lowerLows)) return false; if (v === 'Lower Low (저점 하락)' && !ss.lowerLows) return false; break; }
      case 'vwap_position': { if (v === '설정안함') break; const vw = ind.vwap || ind._advanced?.vwapLegacy; if (!vw || !vw.position) break; if (v === 'VWAP 위 (강세)' && !(vw.position === 'above' || vw.position === 'above_far')) return false; if (v === 'VWAP 근처 (±1%)' && vw.position !== 'near') return false; if (v === 'VWAP 아래 (약세)' && !(vw.position === 'below' || vw.position === 'below_far')) return false; break; }
      case 'gap_type': { if (v === '설정안함') break; const pa = ind.priceAction; if (!pa) break; if (v === '상승갭 종목' && pa.gap !== 'up') return false; if (v === '하락갭 종목' && pa.gap !== 'down') return false; if (v === '갭상승 후 지지') { if (pa.gap !== 'up') return false; if (!(pa.gapPct > 0 && pa.consecutiveDays >= 1)) return false; } if (v === '갭하락 후 저항') { if (pa.gap !== 'down') return false; if (!(pa.gapPct > 0 && pa.consecutiveDays <= -1)) return false; } if (v === '상승갭 제외' && pa.gap === 'up') return false; break; }
      case 'new_high_low': { if (v === '설정안함') break; const pa = ind.priceAction; if (!pa) break; if ((v === '52주 신고가' || v === '연중 신고가') && !pa.newHigh52) return false; if ((v === '52주 신저가' || v === '연중 신저가') && !pa.newLow52) return false; if (v === '20일 신고가' && !pa.newHighN) return false; if (v === '20일 신저가' && !pa.newLowN) return false; break; }
      case 'volume_avg20_ratio': { const vp = ind.volPattern || ind._advanced?.volPattern; if (!vp || vp.volRatio == null) break; const ratioPct = vp.volRatio * 100; if (typeof v === 'object' && v !== null) { if (v.min !== null && ratioPct < v.min) return false; if (v.max !== null && ratioPct > v.max) return false; } break; }
      // ── S161-2: 2회차 잠복 버그 수정 — KR 방어 프리셋이 참조하던 누락 case 3개 ──
      case 'intraday_range': { const pa = ind.priceAction; if (!pa || pa.intradayRange == null) break; if (typeof v === 'object' && v !== null) { if (v.min !== null && pa.intradayRange < v.min) return false; if (v.max !== null && pa.intradayRange > v.max) return false; } break; }
      case 'period_change': { const pa = ind.priceAction; if (!pa || pa.periodChange5 == null) break; if (typeof v === 'object' && v !== null) { if (v.min !== null && pa.periodChange5 < v.min) return false; if (v.max !== null && pa.periodChange5 > v.max) return false; } break; }
      // [v3.10] 신규 안전 가드 — BT 진입 게이트와 동기화 가능
      //   recent_high_proximity: 현재가÷최근N봉 고가×100 (BT highProximity 게이트와 동일 정의)
      //   N봉 기본 20 (BT 게이트 기본값과 일치). 95% 이상 = 고점 근접 → max 90~95로 추격 방어
      case 'recent_high_proximity': {
        const _rows_rhp = ind._advanced?.rows || ind.candles;
        if (!_rows_rhp || _rows_rhp.length < 2) break;
        const N = 20; // BT 게이트 highProximity 기본값과 일치 — 동기화 명료성 위해 고정
        const last = _rows_rhp[_rows_rhp.length - 1];
        if (!last || !(last.close > 0)) break;
        const start = Math.max(0, _rows_rhp.length - 1 - N);
        let highMax = 0;
        for (let k = start; k < _rows_rhp.length; k++) {
          if (_rows_rhp[k].high > highMax) highMax = _rows_rhp[k].high;
        }
        if (highMax <= 0) break;
        const proximity = (last.close / highMax) * 100;
        if (!rangeCheck(proximity, v)) return false;
        break;
      }
      // recent_n_change: (현재가-N봉전 종가)÷N봉전종가×100 (BT recentHigh 게이트와 동일 정의)
      //   N봉 기본 5 (BT 게이트 기본값과 일치). max 15~25 설정 시 단기 급등 추격 방어
      case 'recent_n_change': {
        const _rows_rnc = ind._advanced?.rows || ind.candles;
        if (!_rows_rnc || _rows_rnc.length < 2) break;
        const N = 5; // BT 게이트 recentHigh 기본값과 일치
        const last = _rows_rnc[_rows_rnc.length - 1];
        const refIdx = Math.max(0, _rows_rnc.length - 1 - N);
        const ref = _rows_rnc[refIdx];
        if (!last || !ref) break;
        const refPrice = ref.close || ref.open;
        if (!(refPrice > 0)) break;
        const risePct = ((last.close - refPrice) / refPrice) * 100;
        if (!rangeCheck(risePct, v)) return false;
        break;
      }
      case 'ab_ratio_trend': { if (v === '설정안함') break; const ab = ind.abRatio || ind._advanced?.abRatioLegacy; if (!ab || !ab.trend) break; if (v === '매수세 우위 (A>B)' && ab.trend !== 'bullish') return false; if (v === '매도세 우위 (A<B)' && ab.trend !== 'bearish') return false; if (v === '균형' && ab.trend !== 'neutral') return false; break; }
      // ── [PATCH-4] HTML checkTechConditions에만 있던 누락 case 18개 포팅 (Worker 스캔에서도 동작하도록) ──
      case 'band_pctb': { const bb = ind.bb || ind._advanced?.bb; if (!rangeCheck(bb?.pctB ?? null, v)) return false; break; }
      case 'binary_wave': { if (v === '설정안함') break; const bw = ind.binaryWave || ind._advanced?.binaryWaveLegacy; if (!bw) break; if (v === '강세 (≥3)' && !bw.bullish) return false; if (v === '약세 (≤-3)' && !bw.bearish) return false; if (v === '중립' && !bw.neutral) return false; break; }
      case 'demark_countdown': { if (v === '설정안함') break; const dm2 = ind.demark || ind._advanced?.demarkLegacy; if (!dm2) break; if (v === '카운트다운 완성 (13)' && !dm2.perfected) return false; if (v === '카운트다운 진행중 (≥7)' && dm2.countdown < 7) return false; break; }
      case 'demark_setup': { if (v === '설정안함') break; const dm = ind.demark || ind._advanced?.demarkLegacy; if (!dm) break; if (v === '매수셋업 ≥9 (하락소진)' && !(dm.setup >= 9 && dm.setupDir === 'down')) return false; if (v === '매도셋업 ≥9 (상승소진)' && !(dm.setup >= 9 && dm.setupDir === 'up')) return false; if (v === '매수셋업 진행중' && !(dm.setup >= 3 && dm.setupDir === 'down')) return false; if (v === '매도셋업 진행중' && !(dm.setup >= 3 && dm.setupDir === 'up')) return false; break; }
      case 'dx_value': { const dxv = ind.dx || ind._advanced?.dxLegacy; if (!dxv) break; if (!rangeCheck(dxv.val, v)) return false; break; }
      case 'lower_shadow_pct': { const _rows_ls = ind._advanced?.rows || ind.candles; if (!_rows_ls || !_rows_ls.length) break; const cur = _rows_ls[_rows_ls.length - 1]; const rng = cur.high - cur.low; const dnSh = rng > 0 ? ((Math.min(cur.open, cur.close) - cur.low) / rng) * 100 : null; if (!rangeCheck(dnSh, v)) return false; break; }
      case 'upper_shadow_pct': { const _rows_us = ind._advanced?.rows || ind.candles; if (!_rows_us || !_rows_us.length) break; const cur = _rows_us[_rows_us.length - 1]; const rng = cur.high - cur.low; const upSh = rng > 0 ? ((cur.high - Math.max(cur.open, cur.close)) / rng) * 100 : null; if (!rangeCheck(upSh, v)) return false; break; }
      case 'macd_osc_trend': { if (v === '설정안함') break; const mo = ind.macdOsc || ind._advanced?.macdOscLegacy; if (!mo) break; if (v === '상승 가속' && mo.trend !== 'accelerating_up') return false; if (v === '상승' && mo.trend !== 'up' && mo.trend !== 'accelerating_up') return false; if (v === '하락' && mo.trend !== 'down' && mo.trend !== 'accelerating_down') return false; if (v === '하락 가속' && mo.trend !== 'accelerating_down') return false; break; }
      case 'mass_index': { if (v === '설정안함') break; const mi = ind.massIndex || ind._advanced?.massIndexLegacy; if (!mi) break; if (v === 'Reversal Bulge (반전신호)' && !mi.bulge) return false; if (v === 'Setup (MI>27)' && !mi.setup) return false; if (v === '안정 (MI<26.5)' && (mi.val >= 26.5)) return false; break; }
      case 'nvi_trend': { if (v === '설정안함') break; const vi = ind.volIndex || ind._advanced?.volIndexLegacy; if (!vi) break; if (v === 'MA 위 (강세)' && vi.nviTrend !== 'up') return false; if (v === 'MA 아래 (약세)' && vi.nviTrend !== 'down') return false; break; }
      case 'pvi_trend': { if (v === '설정안함') break; const vi2 = ind.volIndex || ind._advanced?.volIndexLegacy; if (!vi2) break; if (v === 'MA 위 (강세)' && vi2.pviTrend !== 'up') return false; if (v === 'MA 아래 (약세)' && vi2.pviTrend !== 'down') return false; break; }
      case 'price_osc_value': { if (v === '설정안함') break; const po = ind.priceOsc || ind._advanced?.priceOscLegacy; if (!po) break; if (v === '양수 (상승추세)' && po.val <= 0) return false; if (v === '음수 (하락추세)' && po.val >= 0) return false; break; }
      case 'sonar_trend': { if (v === '설정안함') break; const sn = ind.sonar || ind._advanced?.sonarLegacy; if (!sn) break; if (v === '가속 (단기>장기)' && sn.trend !== 'accelerating') return false; if (v === '감속 (단기<장기)' && sn.trend !== 'decelerating') return false; break; }
      case 'std_dev_ratio': { const sd = ind.stdDev || ind._advanced?.stdDevLegacy; if (!sd) break; if (!rangeCheck(sd.ratio, v)) return false; break; }
      case 'three_line_break': { if (v === '설정안함') break; const tlb = ind.threeLineBreak || ind._advanced?.threeLineBreakLegacy; if (!tlb) break; if (v === '상승 전환' && !(tlb.reversal && tlb.direction === 'up')) return false; if (v === '하락 전환' && !(tlb.reversal && tlb.direction === 'down')) return false; if (v === '상승 지속' && !(tlb.direction === 'up' && !tlb.reversal)) return false; if (v === '하락 지속' && !(tlb.direction === 'down' && !tlb.reversal)) return false; break; }
      case 'trix_signal': { if (v === '설정안함') break; const tx = ind.trix || ind._advanced?.trixLegacy; if (!tx || tx.val == null) break; if (v === 'TRIX > Signal (매수)' && !(tx.val > tx.signal)) return false; if (v === 'TRIX < Signal (매도)' && !(tx.val < tx.signal)) return false; if (v === 'TRIX > 0 (상승추세)' && !(tx.val > 0)) return false; if (v === 'TRIX < 0 (하락추세)' && !(tx.val < 0)) return false; break; }
      case 'true_range_ratio': { const tr = ind.trueRange || ind._advanced?.trueRangeLegacy; if (!tr) break; if (!rangeCheck(tr.ratio, v)) return false; break; }

      // ─── [S317] 골든크로스 — 보조지표 N봉 윈도우 크로스 ────────────────
      // 외부 슬라이드는 _hasGcFilter 감지 시 Nactual=1로 고정 → 내부 윈도우만 작동
      // N=2 기본 (_recent_n_bars.max로 조정). 시작점에서 A≤B, 현재에서 A>B → 골든
      case 'gc_rsi': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const rsiArr = ind._advanced && ind._advanced.rsi && ind._advanced.rsi.arr;
        if (!Array.isArray(rsiArr)) return false;
        // RSI Signal = EMA9(RSI)
        let firstValid = -1;
        for (let i = 0; i < rsiArr.length; i++) {
          if (rsiArr[i] != null && Number.isFinite(rsiArr[i])) { firstValid = i; break; }
        }
        if (firstValid < 0) return false;
        const validRsi = rsiArr.slice(firstValid);
        const sigSub = emaArray(validRsi, 9);
        const rsiSig = new Array(rsiArr.length).fill(null);
        for (let i = 0; i < sigSub.length; i++) rsiSig[firstValid + i] = sigSub[i];
        const N = _gcN(getFilter);
        if (!_gcWinCross(rsiArr, rsiSig, N, v === '골든크로스' ? 'golden' : 'dead')) return false;
        break;
      }
      case 'gc_macd': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const m = ind._advanced && ind._advanced.macd && ind._advanced.macd.arr;
        if (!m || !Array.isArray(m.line) || !Array.isArray(m.sig)) return false;
        const N = _gcN(getFilter);
        if (!_gcWinCross(m.line, m.sig, N, v === '골든크로스' ? 'golden' : 'dead')) return false;
        break;
      }
      case 'gc_stoch': {
        const isGolden = (v === '골든크로스' || v === '골든크로스 (과매도권 %K<30)');
        const isDead = (v === '데드크로스' || v === '데드크로스 (과매수권 %K>70)');
        if (!isGolden && !isDead) break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 17) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 17) return false;
        const stStart = Stochastic.calc(rows.slice(0, sLen));
        const stEnd = ind.stoch;
        if (!stStart || !stEnd) return false;
        const sK = stStart.k, sD = stStart.d, eK = stEnd.k, eD = stEnd.d;
        if (!Number.isFinite(sK) || !Number.isFinite(sD) || !Number.isFinite(eK) || !Number.isFinite(eD)) return false;
        if (isGolden && !(sK <= sD && eK > eD)) return false;
        if (isDead && !(sK >= sD && eK < eD)) return false;
        if (v === '골든크로스 (과매도권 %K<30)' && !(eK < 30)) return false;
        if (v === '데드크로스 (과매수권 %K>70)' && !(eK > 70)) return false;
        break;
      }
      case 'gc_dmi': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 16) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 16) return false;
        const adxStart = ADX.calc(rows.slice(0, sLen), 14);
        const adxEnd = (ind._advanced && ind._advanced.adx) || { pdi: ind.adx && ind.adx.plusDI, mdi: ind.adx && ind.adx.minusDI };
        if (!adxStart || !adxEnd) return false;
        const sP = adxStart.pdi, sM = adxStart.mdi, eP = adxEnd.pdi, eM = adxEnd.mdi;
        if (!Number.isFinite(sP) || !Number.isFinite(sM) || !Number.isFinite(eP) || !Number.isFinite(eM)) return false;
        if (v === '골든크로스' && !(sP <= sM && eP > eM)) return false;
        if (v === '데드크로스' && !(sP >= sM && eP < eM)) return false;
        break;
      }
      case 'gc_cci': {
        if (v !== '골든크로스 (0선 상향)' && v !== '데드크로스 (0선 하향)') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 21) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 20) return false;
        const cciStart = CCI.calc(rows.slice(0, sLen), 20);
        const cciEnd = ind.cci;
        const dir = v === '골든크로스 (0선 상향)' ? 'golden' : 'dead';
        if (!_gcScalarCross(cciStart, cciEnd, 0, dir)) return false;
        break;
      }
      case 'gc_mfi': {
        if (v !== '골든크로스 (50선 상향)' && v !== '데드크로스 (50선 하향)') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 16) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 15) return false;
        const highs = rows.map(r => r.high), lows = rows.map(r => r.low), closes = rows.map(r => r.close), vols = rows.map(r => r.volume);
        const mfiStart = calcMFI(highs.slice(0, sLen), lows.slice(0, sLen), closes.slice(0, sLen), vols.slice(0, sLen), 14);
        const mfiEnd = ind.mfi;
        const dir = v === '골든크로스 (50선 상향)' ? 'golden' : 'dead';
        if (!_gcScalarCross(mfiStart, mfiEnd, 50, dir)) return false;
        break;
      }
      case 'gc_bb': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes)) return false;
        // 시장별 파라미터 자동 — _loadAnalParams가 SXE._workerMatrix를 읽어 현재 시장의 ip 반환
        let ip = null;
        try { ip = (typeof _loadAnalParams === 'function') ? _loadAnalParams() : null; } catch (_) {}
        const maP = (ip && ip.maShort > 0) ? ip.maShort : 5;
        const bbP = (ip && ip.bbLen > 0) ? ip.bbLen : 20;
        const need = Math.max(maP, bbP);
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < need || closes.length < need) return false;
        const eMa = sma(closes, maP), eBb = sma(closes, bbP);
        const startSlice = closes.slice(0, sLen);
        const sMa = sma(startSlice, maP), sBb = sma(startSlice, bbP);
        if (!Number.isFinite(sMa) || !Number.isFinite(sBb) || !Number.isFinite(eMa) || !Number.isFinite(eBb)) return false;
        if (v === '골든크로스' && !(sMa <= sBb && eMa > eBb)) return false;
        if (v === '데드크로스' && !(sMa >= sBb && eMa < eBb)) return false;
        break;
      }
      case 'gc_obv': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const obvArr = ind._advanced && ind._advanced.obv && ind._advanced.obv.arr;
        if (!Array.isArray(obvArr) || obvArr.length < 22) return false;
        const sigArr = smaArray(obvArr, 20);
        const N = _gcN(getFilter);
        if (!_gcWinCross(obvArr, sigArr, N, v === '골든크로스' ? 'golden' : 'dead')) return false;
        break;
      }
      case 'gc_trix': {
        const is0Golden = v === '0선 골든크로스';
        const is0Dead = v === '0선 데드크로스';
        const isSigGolden = v === 'Signal 골든크로스';
        const isSigDead = v === 'Signal 데드크로스';
        if (!is0Golden && !is0Dead && !isSigGolden && !isSigDead) break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 46) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 46) return false;
        const trixStart = TRIX.calc(closes.slice(0, sLen));
        const trixEnd = (ind.trix && ind.trix.val != null) ? ind.trix : (ind._advanced && ind._advanced.trix);
        if (!trixStart || !trixEnd) return false;
        if (is0Golden) {
          if (!_gcScalarCross(trixStart.val, trixEnd.val, 0, 'golden')) return false;
        } else if (is0Dead) {
          if (!_gcScalarCross(trixStart.val, trixEnd.val, 0, 'dead')) return false;
        } else if (isSigGolden) {
          if (!Number.isFinite(trixStart.signal) || !Number.isFinite(trixEnd.signal)) return false;
          if (!(trixStart.val <= trixStart.signal && trixEnd.val > trixEnd.signal)) return false;
        } else if (isSigDead) {
          if (!Number.isFinite(trixStart.signal) || !Number.isFinite(trixEnd.signal)) return false;
          if (!(trixStart.val >= trixStart.signal && trixEnd.val < trixEnd.signal)) return false;
        }
        break;
      }
      case 'gc_chaikin': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 12) return false; // slow=10 → 11봉 이상
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 11) return false;
        const coStart = ChaikinOsc.calc(rows.slice(0, sLen));
        const coEnd = ind.chaikinOsc || (ind._advanced && ind._advanced.chaikinOsc);
        if (!coStart || !coEnd) return false;
        const dir = v === '골든크로스' ? 'golden' : 'dead';
        if (!_gcScalarCross(coStart.val, coEnd.val, 0, dir)) return false;
        break;
      }
      case 'gc_ma_5_20': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 21) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 20) return false;
        const eFast = sma(closes, 5), eSlow = sma(closes, 20);
        const startSlice = closes.slice(0, sLen);
        const sFast = sma(startSlice, 5), sSlow = sma(startSlice, 20);
        if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
        if (v === '골든크로스' && !(sFast <= sSlow && eFast > eSlow)) return false;
        if (v === '데드크로스' && !(sFast >= sSlow && eFast < eSlow)) return false;
        break;
      }
      case 'gc_ma_20_60': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 61) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 60) return false;
        const eFast = sma(closes, 20), eSlow = sma(closes, 60);
        const startSlice = closes.slice(0, sLen);
        const sFast = sma(startSlice, 20), sSlow = sma(startSlice, 60);
        if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
        if (v === '골든크로스' && !(sFast <= sSlow && eFast > eSlow)) return false;
        if (v === '데드크로스' && !(sFast >= sSlow && eFast < eSlow)) return false;
        break;
      }
      case 'gc_ma_5_60': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 61) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 60) return false;
        const eFast = sma(closes, 5), eSlow = sma(closes, 60);
        const startSlice = closes.slice(0, sLen);
        const sFast = sma(startSlice, 5), sSlow = sma(startSlice, 60);
        if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
        if (v === '골든크로스' && !(sFast <= sSlow && eFast > eSlow)) return false;
        if (v === '데드크로스' && !(sFast >= sSlow && eFast < eSlow)) return false;
        break;
      }
      case 'trend_cross': {   // [S561] 단기추세 — 매수(골든 N1×N2) / 매도(데드 N3×N4) 단일 조건. value={buy:{on,s,l},sell:{on,s,l}}
        if (!v || typeof v !== 'object') break;
        const closes = ind.closes;
        if (!Array.isArray(closes)) return false;
        const N = _gcN(getFilter);
        const _crossAt = function(sp, lp, dir){
          sp = parseInt(sp); lp = parseInt(lp);
          if (!(sp >= 1) || !(lp > sp)) return false;
          if (closes.length < lp + 1) return false;
          const sLen = closes.length - (N - 1);
          if (sLen < lp) return false;
          const eFast = sma(closes, sp), eSlow = sma(closes, lp);
          const ss = closes.slice(0, sLen);
          const sFast = sma(ss, sp), sSlow = sma(ss, lp);
          if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
          if (dir === 'golden') return (sFast <= sSlow && eFast > eSlow);
          return (sFast >= sSlow && eFast < eSlow);   // dead
        };
        const _bOn = !!(v.buy && v.buy.on), _sOn = !!(v.sell && v.sell.on);
        if (!_bOn && !_sOn) break;   // 선택 없음 → 필터 안 함
        const _bHit = _bOn ? _crossAt(v.buy.s, v.buy.l, 'golden') : false;
        const _sHit = _sOn ? _crossAt(v.sell.s, v.sell.l, 'dead') : false;
        if (_bOn && _sOn) { if (!_bHit && !_sHit) return false; }
        else if (_bOn) { if (!_bHit) return false; }
        else if (_sOn) { if (!_sHit) return false; }
        break;
      }
      case 'gc_ema_20_200': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 200) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 200) return false; // [S363] EMA200 시드에 시작시점 200봉↑ 필요 — 200봉 환경은 탈락
        const eFast = ema(closes, 20), eSlow = ema(closes, 200);
        const startSlice = closes.slice(0, sLen);
        const sFast = ema(startSlice, 20), sSlow = ema(startSlice, 200);
        if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
        if (v === '골든크로스' && !(sFast <= sSlow && eFast > eSlow)) return false;
        if (v === '데드크로스' && !(sFast >= sSlow && eFast < eSlow)) return false;
        break;
      }
      case 'gc_ema_20_120': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const closes = ind.closes;
        if (!Array.isArray(closes) || closes.length < 120) return false;
        const N = _gcN(getFilter);
        const sLen = closes.length - (N - 1);
        if (sLen < 120) return false; // [S364] EMA120은 200봉에서 동작 (KIS off·해외·코인 공용)
        const eFast = ema(closes, 20), eSlow = ema(closes, 120);
        const startSlice = closes.slice(0, sLen);
        const sFast = ema(startSlice, 20), sSlow = ema(startSlice, 120);
        if (!Number.isFinite(sFast) || !Number.isFinite(sSlow) || !Number.isFinite(eFast) || !Number.isFinite(eSlow)) return false;
        if (v === '골든크로스' && !(sFast <= sSlow && eFast > eSlow)) return false;
        if (v === '데드크로스' && !(sFast >= sSlow && eFast < eSlow)) return false;
        break;
      }
      case 'gc_ichimoku': {
        if (v !== '골든크로스' && v !== '데드크로스') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 53) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 52) return false;
        const icStart = Ichimoku.calc(rows.slice(0, sLen));
        const icEnd = ind.ichimoku || (ind._advanced && ind._advanced.ichimoku);
        if (!icStart || !icEnd) return false;
        const sT = icStart.tenkan, sK = icStart.kijun, eT = icEnd.tenkan, eK = icEnd.kijun;
        if (!Number.isFinite(sT) || !Number.isFinite(sK) || !Number.isFinite(eT) || !Number.isFinite(eK)) return false;
        if (v === '골든크로스' && !(sT <= sK && eT > eK)) return false;
        if (v === '데드크로스' && !(sT >= sK && eT < eK)) return false;
        break;
      }
      case 'gc_stoch_slow': {
        const isGolden = (v === '골든크로스' || v === '골든크로스 (과매도권 %K<30)');
        const isDead = (v === '데드크로스' || v === '데드크로스 (과매수권 %K>70)');
        if (!isGolden && !isDead) break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 20) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 20) return false;
        const ssStart = StochSlow.calc(rows.slice(0, sLen));
        const ssEnd = ind.stochSlow || (ind._advanced && ind._advanced.stochSlowLegacy);
        if (!ssStart || !ssEnd) return false;
        const sK = ssStart.k, sD = ssStart.d, eK = ssEnd.k, eD = ssEnd.d;
        if (!Number.isFinite(sK) || !Number.isFinite(sD) || !Number.isFinite(eK) || !Number.isFinite(eD)) return false;
        if (isGolden && !(sK <= sD && eK > eD)) return false;
        if (isDead && !(sK >= sD && eK < eD)) return false;
        if (v === '골든크로스 (과매도권 %K<30)' && !(eK < 30)) return false;
        if (v === '데드크로스 (과매수권 %K>70)' && !(eK > 70)) return false;
        break;
      }
      case 'gc_eom': {
        if (v !== '골든크로스 (0선 상향)' && v !== '데드크로스 (0선 하향)') break;
        const rows = ind.candles;
        if (!Array.isArray(rows) || rows.length < 16) return false;
        const N = _gcN(getFilter);
        const sLen = rows.length - (N - 1);
        if (sLen < 15) return false;
        const eomStart = EOM.calc(rows.slice(0, sLen), 14);
        const eomEnd = ind.eom || (ind._advanced && ind._advanced.eomLegacy);
        if (!eomStart || !eomEnd) return false;
        const dir = v === '골든크로스 (0선 상향)' ? 'golden' : 'dead';
        if (!_gcScalarCross(eomStart.val, eomEnd.val, 0, dir)) return false;
        break;
      }
      // ──────────────────────────────────────────────────────────────────
    }
  }
  return true;
}

function _checkKisConditions(kisData, kisFilters, getFilter) {
  if (!kisData) return true;
  for (const f of kisFilters) {
    const v = f.value; if (!v || v === '설정안함') continue;
    switch (f.id) {
      case 'bid_ask_ratio': { if (!kisData.orderbook) break; if (v.min !== null && kisData.orderbook.bidAskRatio < v.min) return false; if (v.max !== null && kisData.orderbook.bidAskRatio > v.max) return false; break; }
      case 'total_bid_qty': { if (!kisData.orderbook) break; if (v.min !== null && kisData.orderbook.totalBid < v.min) return false; if (v.max !== null && kisData.orderbook.totalBid > v.max) return false; break; }
      case 'total_ask_qty': { if (!kisData.orderbook) break; if (v.min !== null && kisData.orderbook.totalAsk < v.min) return false; if (v.max !== null && kisData.orderbook.totalAsk > v.max) return false; break; }
      case 'trade_strength': { if (!kisData.conclusion) break; if (v.min !== null && kisData.conclusion.tradeStrength < v.min) return false; if (v.max !== null && kisData.conclusion.tradeStrength > v.max) return false; break; }
      case 'buy_ratio': { if (!kisData.conclusion) break; if (v.min !== null && kisData.conclusion.buyRatio < v.min) return false; if (v.max !== null && kisData.conclusion.buyRatio > v.max) return false; break; }
      case 'intraday_high_break': { if (!kisData.minute) break; if (v === '돌파' && !kisData.minute.highBreak) return false; if (v === '미돌파' && kisData.minute.highBreak) return false; break; }
      case 'intraday_vwap_pos': { if (!kisData.minute) break; if (v === 'VWAP 위' && kisData.minute.vwapPos !== 'above') return false; if (v === 'VWAP 아래' && kisData.minute.vwapPos !== 'below') return false; break; }
      case 'program_realtime': { if (!kisData.program) break; if (v.min !== null && kisData.program.netBuyAmt < v.min) return false; if (v.max !== null && kisData.program.netBuyAmt > v.max) return false; break; }
    }
  }
  return true;
}

// ── 재무 데이터 fetch ──
// [Phase 3] marketCap 인자 추가 — EV/EBITDA 계산용. 호출부는 s.marketCap (억원 단위) 전달.
async function fetchFinancialData(code, market, marketCap) {
  if (_finCache[code] && Date.now() - _finCache[code].ts < FIN_TTL) return _finCache[code].data;
  const result = { per: null, pbr: null, roe: null, eps: null, dividendYield: null, debtRatio: null, week52High: null, week52Low: null, revenue: null, operatingIncome: null, netIncome: null, totalAssets: null, totalDebt: null, totalEquity: null, cash: null, revenuePrev: null, operatingIncomePrev: null, netIncomePrev: null, revenuePrev2: null, operatingIncomePrev2: null, netIncomePrev2: null, revenueGrowth: null, opIncomeGrowth: null, netIncomeGrowth: null, epsGrowth: null, roa: null, operatingMargin: null, netMargin: null, ebitdaMargin: null, psr: null, evEbitda: null, ebitda: null, _depreciation: null, _amortization: null, _adjustment: null, _ebitdaApprox: null, bps: null, pcr: null, peg: null, currentRatio: null, interestCoverage: null, netDebtRatio: null, _consolidated: null, _sjLabel: null, _source: 'none' };
  try {
    if (market === 'us' || currentMarket === 'us') {
      const resp = await _fetchWithTimeout(`${WORKER_BASE}/fundamental?ticker=${encodeURIComponent(code)}`);
      if (resp.ok) {
        const d = await resp.json();
        result.per = parseFloat(d.trailingPE) || null; result.pbr = parseFloat(d.priceToBook) || null; result.eps = parseFloat(d.trailingEps) || null;
        // [Phase 3] EV/EBITDA — Yahoo /key-statistics 발견 시 enterpriseToEbitda 필드 채워짐
        if (d.enterpriseToEbitda != null) { const ev = parseFloat(String(d.enterpriseToEbitda).replace(/,/g, '')); if (!isNaN(ev) && ev !== 0) result.evEbitda = ev; }
        if (d.dividendRaw) { const ym = d.dividendRaw.match(/([\d.]+)%/); if (ym) result.dividendYield = parseFloat(ym[1]); }
        if (d.fiftyTwoWeekRange) { const parts = d.fiftyTwoWeekRange.replace(/,/g, '').split('-').map(s => parseFloat(s.trim())); if (parts.length === 2) { result.week52Low = parts[0]; result.week52High = parts[1]; } }
        result._source = 'yahoo';
      }
    } else {
      // DART → 네이버 폴백 (간소화 — Worker에서 searchResults 참조 불가이므로 price/mcap은 _scanStock에서 전달)
      let dartOk = false;
      try { dartOk = await _fetchDartFinancial(code, result, marketCap); } catch (_) {}
      if (!dartOk || result.per == null) { try { await _fetchNaverFinancial(code, result); } catch (_) {} }
      if (result.dividendYield == null) {
        try {
          const resp = await _fetchWithTimeout(`${WORKER_BASE}/naver/finance?symbol=${code}&fin_type=4&freq=Y`);
          if (resp.ok) {
            const d = await resp.json(); const items = d.items || [];
            const getVal = (nameKey) => { const row = items.find(r => r.name && r.name.includes(nameKey)); if (!row) return null; for (const p of (d.periods || [])) { const v = row[p]; if (v && v !== '' && v !== 'N/A') return parseFloat(v.replace(/,/g, '').replace(/\s/g, '')); } return null; };
            result.dividendYield = getVal('배당수익률') || getVal('현금배당수익률');
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  _finCache[code] = { data: result, ts: Date.now() };
  return result;
}

async function _fetchDartFinancial(code, result, marketCap) {
  const thisYear = new Date().getFullYear();
  const yearCandidates = (_finReportType === 'annual') ? [thisYear - 1, thisYear - 2] : [thisYear, thisYear - 1];
  let data = null;
  for (const yr of yearCandidates) {
    // [Phase 4-C] 5xx 자동 재시도 (1회) — DART 일시 장애 흡수
    const resp = await _fetchWithRetry(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${yr}&report=${_finReportType}`, null, 10000, 1);
    if (!resp || !resp.ok) continue;
    const d = await resp.json();
    if (d.items && d.items.length > 0) { data = d; break; }
  }
  if (!data && _finReportType !== 'annual') {
    for (const yr of [thisYear - 1, thisYear - 2]) {
      // [Phase 4-C] 폴백 호출도 재시도 적용
      const resp = await _fetchWithRetry(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${yr}&report=annual`, null, 10000, 1);
      if (!resp || !resp.ok) continue;
      const d = await resp.json();
      if (d.items && d.items.length > 0) { data = d; data._fallbackAnnual = true; break; }
    }
  }
  if (!data || !data.items || !data.items.length) return false;
  const find = (keywords) => { for (const kw of keywords) { const row = data.items.find(r => r.account && r.account.replace(/\s/g, '').includes(kw)); if (row) return row; } return null; };
  // [Phase 1-B] 매출 행의 sj 필드로 연결/별도 플래그 추출 (예: "연결재무제표" → 연결)
  const findCash = (keywords) => { for (const kw of keywords) { const row = data.items.find(r => r.sj && r.sj.includes('재무상태') && r.account && r.account.replace(/\s/g, '').includes(kw)); if (row) return row; } return null; };
  // [Phase 3] 현금흐름표 sj 필터 — 감가상각비/무형자산상각비는 손익계산서/현금흐름표 양쪽에 출현 가능, 값이 다를 수 있어 현금흐름표 기준 표준화
  const findCF = (keywords) => { for (const kw of keywords) { const row = data.items.find(r => r.sj && r.sj.includes('현금흐름') && r.account && r.account.replace(/\s/g, '').includes(kw)); if (row) return row; } return null; };
  const parseAmt = (v) => { if (!v || v === '' || v === 'N/A') return null; return parseFloat(String(v).replace(/,/g, '')) || null; };
  const revenueRow = find(['매출액', '수익(매출액)', '영업수익', '매출']);
  const opIncRow = find(['영업이익', '영업이익(손실)']);
  const netIncRow = find(['당기순이익', '당기순이익(손실)', '분기순이익']);
  const assetRow = find(['자산총계']); const debtRow = find(['부채총계']); const equityRow = find(['자본총계']);
  // [Phase 1-A] 매출 + 영업이익 + 순이익 모두 전전기(beforePrev)까지 추출 — 3개년 표 렌더용
  result.revenue = revenueRow ? parseAmt(revenueRow.current) : null; result.revenuePrev = revenueRow ? parseAmt(revenueRow.previous) : null; result.revenuePrev2 = revenueRow ? parseAmt(revenueRow.beforePrev) : null;
  result.operatingIncome = opIncRow ? parseAmt(opIncRow.current) : null; result.operatingIncomePrev = opIncRow ? parseAmt(opIncRow.previous) : null; result.operatingIncomePrev2 = opIncRow ? parseAmt(opIncRow.beforePrev) : null;
  result.netIncome = netIncRow ? parseAmt(netIncRow.current) : null; result.netIncomePrev = netIncRow ? parseAmt(netIncRow.previous) : null; result.netIncomePrev2 = netIncRow ? parseAmt(netIncRow.beforePrev) : null;
  result.totalAssets = assetRow ? parseAmt(assetRow.current) : null; result.totalDebt = debtRow ? parseAmt(debtRow.current) : null; result.totalEquity = equityRow ? parseAmt(equityRow.current) : null;
  // [Phase 1-C] 순부채비율 계산 — 현금 추출 후 (totalDebt - cash) / equity × 100
  const cashRow = findCash(['현금및현금성자산', '현금및현금']);
  if (cashRow) result.cash = parseAmt(cashRow.current);
  if (result.totalDebt != null && result.cash != null && result.totalEquity && result.totalEquity !== 0) {
    result.netDebtRatio = ((result.totalDebt - result.cash) / result.totalEquity) * 100;
  }
  // [Phase 3 / EBITDA-fallback v2] EBITDA 3단계 계산 — 정확값 → 조정 추정 → 영업이익 단독
  //   1차 (정확): 영업이익 + 감가상각비 + 무형자산상각비 (현금흐름표에 분리 row가 있을 때)
  //   2차 (조정 추정): 영업이익 + "조정" 항목 (간접법 요약형 — 삼성전자 등 대기업이 감가상각을 별도 row 없이 통합 표기하는 케이스)
  //                    "조정"은 비현금비용 합계 (감가상각 + 충당금 + 평가손실 등) → 영업이익만 쓰는 것보다 EBITDA에 훨씬 가까움
  //                    단, 충당금 등이 일시적으로 크면 약간 과대평가 가능 → 마커는 'adjustment'로 구분 표시
  //   3차 (보수 폴백): 영업이익 = EBITDA — 다른 정보 전혀 없을 때 최후의 안전망
  //   _ebitdaApprox 값 의미: null/false = 정확값 / 'adjustment' = 조정 기반 추정 / true = 영업이익 단독 추정
  if (result.operatingIncome != null) {
    const depRow = findCF(['감가상각비', '유형자산감가상각']);
    const amrRow = findCF(['무형자산상각비', '무형자산상각']);
    const dep = depRow ? Math.abs(parseAmt(depRow.current) || 0) : 0;
    const amr = amrRow ? Math.abs(parseAmt(amrRow.current) || 0) : 0;
    if (dep > 0 || amr > 0) {
      // 1차: 정확값
      result.ebitda = result.operatingIncome + dep + amr;
      result._depreciation = dep;
      result._amortization = amr;
    } else {
      // 2차: "조정" 항목 시도 — 현금흐름표 sj 한정, 간접법 요약형 대응
      const adjRow = findCF(['조정']);
      const adj = adjRow ? Math.abs(parseAmt(adjRow.current) || 0) : 0;
      if (adj > 0) {
        result.ebitda = result.operatingIncome + adj;
        result._adjustment = adj;
        result._ebitdaApprox = 'adjustment';   // 마커: 조정 기반 추정 (영업이익 단독보다 정확)
      } else {
        // 3차: 영업이익 단독 폴백
        result.ebitda = result.operatingIncome;
        result._ebitdaApprox = true;
      }
    }
  }
  // [Phase 3] EV/EBITDA = (시가총액 + 총부채 - 현금) / EBITDA
  //   marketCap은 호출부에서 억원 단위로 전달 → 원 단위 변환 후 합산 (totalDebt/cash는 DART 응답 원 단위)
  //   marketCap 단위 정규화: 호출 경로에 따라 원/억원 혼재 가능 — 1e8 초과 시 원 단위로 간주하여 변환
  if (result.ebitda && result.ebitda > 0 && marketCap) {
    let mcap = marketCap;
    if (mcap > 100000000) mcap = mcap / 100000000; // 원 → 억원
    const mcapWon = mcap * 100000000;              // 억원 → 원
    const netDebt = (result.totalDebt || 0) - (result.cash || 0);
    const ev = mcapWon + netDebt;
    result.evEbitda = ev / result.ebitda;
  }
  // [Phase 1-B] 연결/별도 플래그 — 매출 행의 sj 필드로 판단
  if (revenueRow && revenueRow.sj) {
    result._consolidated = revenueRow.sj.includes('연결');
    result._sjLabel = result._consolidated ? 'IFRS연결' : 'IFRS별도';
  }
  if (result.revenue && result.revenuePrev && result.revenuePrev !== 0) result.revenueGrowth = ((result.revenue - result.revenuePrev) / Math.abs(result.revenuePrev)) * 100;
  if (result.operatingIncome && result.operatingIncomePrev && result.operatingIncomePrev !== 0) result.opIncomeGrowth = ((result.operatingIncome - result.operatingIncomePrev) / Math.abs(result.operatingIncomePrev)) * 100;
  if (result.netIncome && result.netIncomePrev && result.netIncomePrev !== 0) result.netIncomeGrowth = ((result.netIncome - result.netIncomePrev) / Math.abs(result.netIncomePrev)) * 100;
  if (result.totalEquity && result.totalDebt) result.debtRatio = (result.totalDebt / result.totalEquity) * 100;
  if (result.netIncome && result.totalEquity && result.totalEquity !== 0) result.roe = (result.netIncome / result.totalEquity) * 100;
  if (result.netIncome && result.totalAssets && result.totalAssets !== 0) result.roa = (result.netIncome / result.totalAssets) * 100;
  if (result.revenue && result.revenue !== 0) {
    if (result.operatingIncome != null) result.operatingMargin = (result.operatingIncome / result.revenue) * 100;
    if (result.netIncome != null) result.netMargin = (result.netIncome / result.revenue) * 100;
    // [Phase 3] EBITDA 마진 — 정확한 EBITDA로 산출 (없으면 영업이익률 근사)
    if (result.ebitda != null) result.ebitdaMargin = (result.ebitda / result.revenue) * 100;
    else if (result.operatingIncome != null) result.ebitdaMargin = (result.operatingIncome / result.revenue) * 100;
  }
  if (result.totalAssets && result.totalDebt && result.totalDebt > 0) result.currentRatio = (result.totalAssets / result.totalDebt) * 100;
  result._source = 'dart';
  result._reportType = data._fallbackAnnual ? 'annual' : (data.report || _finReportType);
  result._reportLabel = FIN_REPORT_LABELS[result._reportType] || '연간';
  if (data._fallbackAnnual) result._reportLabel += ' (폴백)';
  // [Phase 1-A] _reportYear: 본앱 3개년 표에서 연도 라벨로 사용 (current=baseYear, prev=baseYear-1, prev2=baseYear-2)
  result._reportYear = data.year ? parseInt(data.year, 10) : null;
  // [Phase 2] 분기별 실적 호출 — annual 호출이 성공한 경우에만 시도
  //   DART는 누적 형태이므로 차분 계산 필요: Q1=q1, Q2=half-q1, Q3=q3-half
  //   미제출 분기(시즌 따라)는 status !== '000' 응답 → null로 두고 표에서 자동 숨김
  //   _finReportType이 annual일 때만 분기 표 활성화 (사용자가 분기 모드로 명시 선택했으면 중복 호출 회피)
  // [Phase 4-A] 1~4월 진입 가드 — 올해 분기 미제출 + 작년 분기는 사업보고서로 이미 통합됨 → 호출 자체 스킵
  //   효과: 종목당 DART 호출 4 → 1로 감소 (4월 말 워커 부담 75% ↓)
  if (_finReportType === 'annual' && !data._fallbackAnnual) {
    const _curMonth = new Date().getMonth() + 1;
    if (_curMonth >= 5) {
      try { await _fetchDartQuarterly(code, result); } catch (_) {}
    }
  }
  return true;
}

// [Phase 2] 분기별 실적 추출 — annual 호출과 별개로 q1/half/q3 병렬 호출
//   누적 → 단일 분기 차분: Q1=q1, Q2=half-q1, Q3=q3-half
//   미제출 분기는 자연스럽게 null 처리
//   호출 시점: 1Q는 5월, 반기는 8월, 3Q는 11월 제출 시작
// [Phase 4-A] 월별 호출 가드 — 미제출 분기는 호출 자체 스킵
//   1~4월: 모든 분기 미제출 (호출 안 함, 바깥에서 진입 차단)
//   5~7월: q1만 제출돼 있음 (q1만 호출, half/q3 스킵)
//   8~10월: q1+half (q3 스킵)
//   11~12월: q1+half+q3 (전부)
async function _fetchDartQuarterly(code, result) {
  const thisYear = new Date().getFullYear();
  const curMonth = new Date().getMonth() + 1; // 1~12
  // 작년 분기는 이미 사업보고서로 통합돼 발표 — 어떤 시점에도 작년 q1/half/q3 다 호출 가능
  // 올해 분기는 위 가드대로
  const callQ1ThisYear   = curMonth >= 5;
  const callHalfThisYear = curMonth >= 8;
  const callQ3ThisYear   = curMonth >= 11;
  // 분기는 올해 → 작년 순으로 시도 (가장 최근 분기 정보를 우선)
  const yearCandidates = [thisYear, thisYear - 1];
  let q1Data = null, halfData = null, q3Data = null, qYear = null;
  for (const yr of yearCandidates) {
    const isThis = (yr === thisYear);
    const doQ1   = isThis ? callQ1ThisYear   : true;
    const doHalf = isThis ? callHalfThisYear : true;
    const doQ3   = isThis ? callQ3ThisYear   : true;
    if (!doQ1 && !doHalf && !doQ3) continue;
    // [Phase 4-C] 5xx 재시도 + 타임아웃 일관 처리. 빈 분기는 null 반환
    const _fetchOne = (rep) => _fetchWithRetry(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${yr}&report=${rep}`, null, 10000, 1)
      .then(r => r && r.ok ? r.json() : null).catch(() => null);
    const [r1, r2, r3] = await Promise.allSettled([
      doQ1   ? _fetchOne('q1')   : Promise.resolve(null),
      doHalf ? _fetchOne('half') : Promise.resolve(null),
      doQ3   ? _fetchOne('q3')   : Promise.resolve(null),
    ]);
    const v1 = r1.status === 'fulfilled' ? r1.value : null;
    const v2 = r2.status === 'fulfilled' ? r2.value : null;
    const v3 = r3.status === 'fulfilled' ? r3.value : null;
    // 분기 중 하나라도 유효한 데이터가 있으면 그 해 채택
    const hasAny = (v1 && v1.items && v1.items.length) || (v2 && v2.items && v2.items.length) || (v3 && v3.items && v3.items.length);
    if (hasAny) { q1Data = v1; halfData = v2; q3Data = v3; qYear = yr; break; }
  }
  if (!qYear) return;
  // 누적 데이터 추출 — 각 보고서에서 매출/영업이익/순이익만 뽑음
  const extract = (data) => {
    if (!data || !data.items || !data.items.length) return null;
    const find = (keywords) => { for (const kw of keywords) { const row = data.items.find(r => r.account && r.account.replace(/\s/g, '').includes(kw)); if (row) return row; } return null; };
    const parseAmt = (v) => { if (!v || v === '' || v === 'N/A') return null; return parseFloat(String(v).replace(/,/g, '')) || null; };
    const revenueRow = find(['매출액', '수익(매출액)', '영업수익', '매출']);
    const opIncRow = find(['영업이익', '영업이익(손실)']);
    const netIncRow = find(['당기순이익', '당기순이익(손실)', '분기순이익']);
    return {
      revenue: revenueRow ? parseAmt(revenueRow.current) : null,
      operatingIncome: opIncRow ? parseAmt(opIncRow.current) : null,
      netIncome: netIncRow ? parseAmt(netIncRow.current) : null,
    };
  };
  const cum1 = extract(q1Data);    // 1분기 누적 = Q1
  const cumH = extract(halfData);  // 반기 누적 = Q1+Q2
  const cum3 = extract(q3Data);    // 3분기 누적 = Q1+Q2+Q3
  // 차분 계산 — 누적값 빼서 단일 분기값 산출
  //   누적 보고서 중 일부만 있을 수도 있으므로 (예: 8월 시점엔 q1+half만, q3 없음) 각 케이스 가드
  const sub = (a, b) => (a != null && b != null) ? (a - b) : null;
  const quarters = {};
  if (cum1) quarters.q1 = { year: qYear, quarter: 1, revenue: cum1.revenue, operatingIncome: cum1.operatingIncome, netIncome: cum1.netIncome };
  if (cumH && cum1) quarters.q2 = { year: qYear, quarter: 2, revenue: sub(cumH.revenue, cum1.revenue), operatingIncome: sub(cumH.operatingIncome, cum1.operatingIncome), netIncome: sub(cumH.netIncome, cum1.netIncome) };
  if (cum3 && cumH) quarters.q3 = { year: qYear, quarter: 3, revenue: sub(cum3.revenue, cumH.revenue), operatingIncome: sub(cum3.operatingIncome, cumH.operatingIncome), netIncome: sub(cum3.netIncome, cumH.netIncome) };
  // [Phase 2 v2 / 옵션 B] 직전년도 Q4 계산
  //   3가지 케이스:
  //     1) qYear === _reportYear → 같은 해 q3가 이미 있고 annual도 같은 해 → 그 해의 Q4 계산 (드물게 늦게 받은 경우)
  //     2) qYear !== _reportYear (보통 케이스: q1~q3는 올해, annual은 작년)
  //        → _reportYear의 q3를 추가 호출해서 _reportYear의 Q4 = annual - 그 해 q3 계산
  //        → prevQ4 키로 저장 (q4 키와 구분)
  //     3) annual 없거나 _reportYear 없음 → Q4 계산 불가 → 스킵
  if (result._reportYear && cum3 && result._reportYear === qYear &&
      result.revenue != null && result.operatingIncome != null && result.netIncome != null) {
    // 케이스 1: 같은 해
    quarters.q4 = {
      year: qYear,
      quarter: 4,
      revenue: sub(result.revenue, cum3.revenue),
      operatingIncome: sub(result.operatingIncome, cum3.operatingIncome),
      netIncome: sub(result.netIncome, cum3.netIncome),
    };
  } else if (result._reportYear && result._reportYear !== qYear &&
             result.revenue != null && result.operatingIncome != null && result.netIncome != null) {
    // 케이스 2: 직전년도 Q4 계산용으로 _reportYear의 q3 추가 호출 (호출 1번 추가, 캐싱되면 1회만)
    try {
      const prevYr = result._reportYear;
      // [Phase 4-C] 5xx 재시도 적용 (워커 cold start 흡수)
      const resp = await _fetchWithRetry(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${prevYr}&report=q3`, null, 10000, 1);
      if (resp && resp.ok) {
        const prevQ3Data = await resp.json();
        const prevCum3 = extract(prevQ3Data);
        if (prevCum3 && prevCum3.revenue != null) {
          quarters.prevQ4 = {
            year: prevYr,
            quarter: 4,
            revenue: sub(result.revenue, prevCum3.revenue),
            operatingIncome: sub(result.operatingIncome, prevCum3.operatingIncome),
            netIncome: sub(result.netIncome, prevCum3.netIncome),
          };
        }
      }
    } catch (_) { /* 작년 q3 미제출 케이스 — 자연스럽게 스킵 */ }
  }
  if (Object.keys(quarters).length > 0) result._quarterly = quarters;
}

async function _fetchNaverFinancial(code, result) {
  const resp = await _fetchWithTimeout(`${WORKER_BASE}/naver/finance?symbol=${code}&fin_type=4&freq=Y`);
  if (!resp.ok) return;
  const d = await resp.json(); const items = d.items || [];
  const getVal = (nameKey) => { const row = items.find(r => r.name && r.name.includes(nameKey)); if (!row) return null; for (const p of (d.periods || [])) { const v = row[p]; if (v && v !== '' && v !== 'N/A') return parseFloat(v.replace(/,/g, '').replace(/\s/g, '')); } return null; };
  if (result.per == null) result.per = getVal('PER'); if (result.pbr == null) result.pbr = getVal('PBR');
  if (result.roe == null) result.roe = getVal('ROE'); if (result.eps == null) result.eps = getVal('EPS');
  if (result.dividendYield == null) result.dividendYield = getVal('배당수익률') || getVal('현금배당수익률');
  if (result.debtRatio == null) result.debtRatio = getVal('부채비율');
  if (result._source === 'none') result._source = 'naver'; else result._source = 'dart+naver';
}

async function fetchInvestorData(code) {
  if (_invCache[code] && Date.now() - _invCache[code].ts < FIN_TTL) return _invCache[code].data;
  const result = { foreignNetBuy: 0, foreignNetBuyDays: 0, instNetBuy: 0, instNetBuyDays: 0 };
  try {
    const resp = await _fetchWithTimeout(`${WORKER_BASE}/naver/investor?symbol=${code}&pageSize=30`);
    if (resp.ok) {
      const d = await resp.json();
      let rows = d.data && Array.isArray(d.data) ? d.data : (d.data?.result || []);
      if (rows.length > 0) {
        const latest = rows[0];
        result.foreignNetBuy = parseInt(latest.foreignNetBuy || latest.frgn_buy || 0) - parseInt(latest.foreignNetSell || latest.frgn_sell || 0);
        result.instNetBuy = parseInt(latest.instNetBuy || latest.inst_buy || 0) - parseInt(latest.instNetSell || latest.inst_sell || 0);
        let fDays = 0;
        for (const r of rows) { const fNet = parseInt(r.foreignNetBuy || r.frgn_buy || 0) - parseInt(r.foreignNetSell || r.frgn_sell || 0); if (fDays === 0) { fDays = fNet > 0 ? 1 : fNet < 0 ? -1 : 0; } else if (fDays > 0 && fNet > 0) fDays++; else if (fDays < 0 && fNet < 0) fDays--; else break; }
        result.foreignNetBuyDays = fDays;
        let iDays = 0, iStarted = false;
        for (const r of rows) { const iNet = parseInt(r.instNetBuy || r.inst_buy || 0) - parseInt(r.instNetSell || r.inst_sell || 0); if (!iStarted) { iDays = iNet > 0 ? 1 : iNet < 0 ? -1 : 0; iStarted = true; } else if (iDays > 0 && iNet > 0) iDays++; else if (iDays < 0 && iNet < 0) iDays--; else break; }
        result.instNetBuyDays = iDays;
      }
    }
  } catch (_) {}
  _invCache[code] = { data: result, ts: Date.now() };
  return result;
}

function checkFinancialFilters(finData, getFilter) {
  const rc = (id, val) => { const f = getFilter(id); if (!f || !f.value) return true; return rangeCheck(val, f.value); };
  if (!rc('per', finData.per)) return false; if (!rc('pbr', finData.pbr)) return false; if (!rc('roe', finData.roe)) return false; if (!rc('eps', finData.eps)) return false;
  if (!rc('dividend_yield', finData.dividendYield)) return false; if (!rc('debt_ratio', finData.debtRatio)) return false;
  if (!rc('revenue_growth', finData.revenueGrowth)) return false; if (!rc('operating_profit_growth', finData.opIncomeGrowth)) return false; if (!rc('net_income_growth', finData.netIncomeGrowth)) return false; if (!rc('eps_growth', finData.epsGrowth)) return false;
  if (!rc('roa', finData.roa)) return false; if (!rc('operating_margin', finData.operatingMargin)) return false; if (!rc('net_margin', finData.netMargin)) return false; if (!rc('ebitda_margin', finData.ebitdaMargin)) return false;
  if (!rc('psr', finData.psr)) return false; if (!rc('ev_ebitda', finData.evEbitda)) return false; if (!rc('bps', finData.bps)) return false; if (!rc('pcr', finData.pcr)) return false; if (!rc('peg', finData.peg)) return false;
  if (!rc('current_ratio', finData.currentRatio)) return false; if (!rc('interest_coverage', finData.interestCoverage)) return false;
  return true;
}

function checkWeek52Filters(price, finData, getFilter) {
  if (!price || price === 0) return true;
  const w52h = getFilter('week52_high_ratio');
  if (w52h && w52h.value && finData.week52High) { const ratio = ((price / finData.week52High) - 1) * 100; if (!rangeCheck(ratio, w52h.value)) return false; }
  const w52l = getFilter('week52_low_ratio');
  if (w52l && w52l.value && finData.week52Low) { const ratio = ((price / finData.week52Low) - 1) * 100; if (!rangeCheck(ratio, w52l.value)) return false; }
  return true;
}

function checkInvestorFilters(invData, getFilter) {
  const rc = (id, val) => { const f = getFilter(id); if (!f || !f.value) return true; return rangeCheck(val, f.value); };
  if (!rc('foreign_net_buy', invData.foreignNetBuy)) return false; if (!rc('foreign_net_buy_days', invData.foreignNetBuyDays)) return false;
  if (!rc('inst_net_buy', invData.instNetBuy)) return false; if (!rc('inst_net_buy_days', invData.instNetBuyDays)) return false;
  return true;
}

function applyRankFilters(results, getFilter) {
  if (!_hasAnyFilter(RANK_FILTER_IDS, getFilter)) return results;
  const sorted = [...results];
  const assignRank = (key, desc = true) => { const s = [...sorted].sort((a, b) => desc ? (b[key] || 0) - (a[key] || 0) : (a[key] || 0) - (b[key] || 0)); s.forEach((item, i) => { item['_rank_' + key] = i + 1; }); };
  assignRank('changeRate'); assignRank('volume'); assignRank('tradeAmount'); assignRank('marketCap'); assignRank('foreignRatio');
  results.forEach(s => {
    const ind = s._indicators; const vols = ind?.volumes;
    s._volumeChange = (vols && vols.length >= 2 && vols[vols.length - 2] > 0) ? ((vols[vols.length - 1] / vols[vols.length - 2]) - 1) * 100 : 0;
    const candles = ind?.candles;
    s._volatility = (candles && candles.length >= 1) ? (c => c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0)(candles[candles.length - 1]) : 0;
  });
  assignRank('_volumeChange'); assignRank('_volatility');
  return results.filter(s => {
    const rc = (id, val) => { const f = getFilter(id); if (!f || !f.value) return true; return rangeCheck(val, f.value); };
    if (!rc('rank_change_rate', s._rank_changeRate)) return false; if (!rc('rank_volume', s._rank_volume)) return false;
    if (!rc('rank_trade_amount', s._rank_tradeAmount)) return false; if (!rc('rank_market_cap', s._rank_marketCap)) return false;
    if (!rc('rank_foreign_ratio', s._rank_foreignRatio)) return false; if (!rc('rank_volume_change', s._rank__volumeChange)) return false;
    if (!rc('rank_volatility', s._rank__volatility)) return false;
    return true;
  });
}

function findCondMeta(condId) {
  if (typeof getConditions !== 'function') return null;
  for (const cat of getConditions()) { for (const g of cat.groups) { const c = g.conditions.find(x => x.id === condId); if (c) return c; } }
  return null;
}

// ── 공시 키워드 fetch (Worker 내) ──
// ── calcBtScore 인라인 (sx_render.js는 DOM 의존이므로 Worker에서 import 불가) ──
// [B] BT 점수 산출 — sx_render.js calcBtScore와 동기 정의 (이중 구현)
//   ⚠️ sx_render.js 956줄 calcBtScore 변경 시 반드시 여기도 함께 수정!
//   양쪽 동등성 검증: 메인 스레드 콘솔에서 window.SXBtScoreCheck()
//   이중 정의 사유: Worker는 sx_render.js를 importScripts 할 수 없음 (DOM 의존)
// ════════════════════════════════════════════════════════════
// ⚠️ DO NOT EDIT — sx_render.js calcBtScore의 미러 함수
// ════════════════════════════════════════════════════════════
//  Worker는 sx_render.js를 importScripts 할 수 없음 (DOM 의존).
//  원본: sx_render.js의 calcBtScore — 변경 시 이쪽도 동일하게 동기화 필요.
//
//  〔이력〕 2026-05-09 [S219]: PF-TRUST 신뢰도 보정 누락 발견 → 동기화
//  〔이력〕 2026-05-18 [S294]: BT 점수 개편 — 거래수 제거, 기댓값 도입
//    - 배점: 총수익률(25)+승률(20)+PF(20)+MDD(15)+기댓값(20) = 100
//    - PF √보정 제거, 기댓값 = (승률×avgWin)-(패율×avgLoss)
// ════════════════════════════════════════════════════════════
function calcBtScore(btData, stock){
  if(!btData) return null;
  const pnl     = btData.totalPnl     ?? 0;
  const wr      = btData.winRate      ?? 0;
  const trades  = btData.totalTrades  ?? 0;
  const mdd     = btData.mdd          ?? 0;
  const pf      = btData.profitFactor ?? 0;
  const avgWin  = btData.avgWin       ?? 0;
  const avgLoss = btData.avgLoss      ?? 0;
  if(trades === 0) return null;

  // ① 총수익률 (0~25점) — 4단계: 100%+🟢 / 50~99%🔵 / 0~49%🟠 / 음수🔴
  let pnlScore;
  if(pnl >= 100)     pnlScore = 25;
  else if(pnl >= 50) pnlScore = 18 + (pnl - 50) / 50 * 7;
  else if(pnl >= 0)  pnlScore = pnl / 50 * 18;
  else               pnlScore = 0;

  // ② 승률 (0~20점) — 4단계: 60%+🟢 / 40~59%🔵 / 20~39%🟠 / 0~19%🔴
  let wrScore;
  if(wr >= 60)       wrScore = 20;
  else if(wr >= 40)  wrScore = 10 + (wr - 40) / 20 * 10;
  else if(wr >= 20)  wrScore = 4  + (wr - 20) / 20 * 6;
  else               wrScore = Math.max(0, wr / 20 * 4);

  // ③ PF 손익비 (0~20점) — 4단계: ≥2.0🟢 / 1.5~1.99🔵 / 1.0~1.49🟠 / <1.0🔴
  let pfScore;
  if(pf >= 2.0)      pfScore = 20;
  else if(pf >= 1.5) pfScore = 14 + (pf - 1.5) / 0.5 * 6;
  else if(pf >= 1.0) pfScore = 6  + (pf - 1.0) / 0.5 * 8;
  else if(pf >= 0.5) pfScore = (pf - 0.5) / 0.5 * 6;
  else               pfScore = 0;

  // ④ MDD 리스크 (0~15점) — 3단계: 0~9.9%🔵안전 / 10~19.9%🟣주의 / 20%+🔴위험
  let mddScore;
  const absMdd = Math.abs(mdd);
  if(absMdd <= 10)      mddScore = 15;
  else if(absMdd <= 20) mddScore = 7 + (20 - absMdd) / 10 * 8;
  else if(absMdd <= 40) mddScore = (40 - absMdd) / 20 * 7;
  else                  mddScore = 0;

  // ⑤ 기댓값 (0~20점) — 3단계: ≥+1%🟢 / 0~+1%🟠 / <0🔴
  const ev = (avgWin > 0 || avgLoss > 0)
    ? (wr / 100) * avgWin - (1 - wr / 100) * avgLoss
    : pnl / trades;
  let evScore;
  if(ev >= 2.0)      evScore = 20;
  else if(ev >= 1.0) evScore = 14 + (ev - 1.0) / 1.0 * 6;
  else if(ev >= 0)   evScore = ev  / 1.0 * 14;
  else               evScore = 0;

  // [S396] ⑥ 코어 = 5항목 합산 (0~100). 거래수는 가산점 → '신뢰도 캡'으로 전환.
  const core = pnlScore + wrScore + pfScore + mddScore + evScore;

  // [S396] ⑦ 거래수 신뢰도 캡 — 표본이 적을수록 상한을 낮춤(가산점 아님 → 만점 차단).
  //   배경: 기존 ⑥ 가산점(0~10)은 만점 합 110→min(100) 클램프 때문에 상위 5항목이 만점이면
  //         거래수 페널티가 통째로 증발(예: 16거래·전항목만점→100점). 캡으로 바꿔 '표본부족=만점불가'.
  //   20+→100 / 10~19→90 / 5~9→78 / <5→60
  // [S563] 모드별 표본 캘리브레이션 — ⚠️ sx_render.js calcBtScore 미러 (동일 계수 동기화 필수).
  const _mtf = { profit:1.0, balanced:0.5, safe:0.22 };
  const _mf = (btData && btData._mode && _mtf[btData._mode]) ? _mtf[btData._mode] : 1.0;
  let tradeCap;
  if(trades >= 20*_mf)      tradeCap = 100;
  else if(trades >= 10*_mf) tradeCap = 90;
  else if(trades >= 5*_mf)  tradeCap = 78;
  else                      tradeCap = 60;

  // [S396] ⑧ 과최적 의심 캡 — 표본부족 + 비현실적 성과 = 곡선맞춤 신호 → 상한 85.
  //   (승률≥85% OR PF≥4) AND 거래<30 일 때 적용. PF≥2 무조건 20점이라 PF22도 안 깎이던 문제 보완.
  let overfitCap = 100;
  if((wr >= 85 || pf >= 4) && trades < 30) overfitCap = 85;

  // [S476] 강건성 불안·과최적 의심 감점 — render.calcBtScore 미러(동일 조건/수치 −8/−12). stock 미전달 시 감점 0.
  let _diagPenalty = 0;
  if(stock){
    const _robFragile = !!((stock._robustness && stock._robustness.label === 'fragile') ||
                           (stock._coreDiag && stock._coreDiag.rob === 'fragile'));
    const _overfit    = !!(stock._coreDiag && stock._coreDiag.overfit);
    if(_robFragile) _diagPenalty += 8;
    if(_overfit)    _diagPenalty += 12;
  }
  return Math.round(Math.max(0, Math.min(core, tradeCap, overfitCap, 100) - _diagPenalty));
}

// ════════════════════════════════════════════════════════════
// ⚠️ DO NOT EDIT — sx_bt.js _btGetRowsLen의 미러 함수
// ════════════════════════════════════════════════════════════
//  Worker는 sx_bt.js를 importScripts 할 수 없음 (DOM 의존).
//  원본: sx_bt.js _btGetRowsLen — 변경 시 이쪽도 동기화.
// ════════════════════════════════════════════════════════════
function _btGetRowsLenWorker(btResult){
  if(!btResult) return 0;
  if(typeof btResult.rowsLength === 'number' && btResult.rowsLength > 0) return btResult.rowsLength;
  if(btResult.scores && btResult.scores.length) return btResult.scores.length + 100; // BT_WARMUP fallback
  return 0;
}

// ════════════════════════════════════════════════════════════
// ⚠️ DO NOT EDIT — sx_bt.js _btIsToday의 미러 함수
// ════════════════════════════════════════════════════════════
//  원본: sx_bt.js _btIsToday — 변경 시 이쪽도 동기화 필요.
// ════════════════════════════════════════════════════════════
function _btIsTodayWorker(dateStr){
  if(!dateStr) return false;
  try{
    const _kstNow = new Date(Date.now() + 9*3600*1000);
    const _todayKst = _kstNow.toISOString().slice(0,10);
    let _d = String(dateStr).slice(0,10);
    if(/^\d{8}$/.test(_d)) _d = _d.slice(0,4)+'-'+_d.slice(4,6)+'-'+_d.slice(6,8);
    return _d === _todayKst;
  }catch(_){ return false; }
}

// ════════════════════════════════════════════════════════════
// ⚠️ DO NOT EDIT — sx_bt.js btGetCurrentState의 미러 함수
// ════════════════════════════════════════════════════════════
//  Worker용 간소화 버전 (text/color 등 UI 필드는 워커가 안 만듦 — 메인에서 렌더 시 생성).
//  핵심 비즈니스 로직 (state 판정, _isBuySignal)은 sx_bt.js와 100% 동일해야 함.
//  원본: sx_bt.js btGetCurrentState — 변경 시 이쪽도 동기화.
// ════════════════════════════════════════════════════════════
function btGetCurrentState(btResult, currentPrice){
  if(!btResult || !btResult.trades || !btResult.trades.length) return { state:'no_data' };
  const lastTrade = btResult.trades[btResult.trades.length - 1];
  const _rowsLen = _btGetRowsLenWorker(btResult);
  // 미청산 포지션 (type==='OPEN') → holding
  if(lastTrade.type === 'OPEN'){
    const pnl = currentPrice > 0 && lastTrade.entry > 0
      ? ((currentPrice - lastTrade.entry) / lastTrade.entry * 100).toFixed(1)
      : lastTrade.pnl.toFixed(1);
    const _isBuySignal = _btIsTodayWorker(lastTrade.entryDate)
      || (!lastTrade.entryDate && lastTrade.entryIdx != null && _rowsLen > 0 && lastTrade.entryIdx === _rowsLen - 1);
    return {
      state:'holding',
      entry: lastTrade.entry,
      entryDate: lastTrade.entryDate || '',
      entryIdx: lastTrade.entryIdx,
      totalBars: _rowsLen,
      _isBuySignal: _isBuySignal,
      pnl: +pnl,
      tp: lastTrade.tp || null,
      sl: lastTrade.sl || null
    };
  }
  // S103-fix8: 매도 신호도 동일 버그 수정 — exitDate가 "오늘 KST"인지 날짜로 판정
  if(_btIsTodayWorker(lastTrade.exitDate)
     || (!lastTrade.exitDate && lastTrade.exitIdx != null && _rowsLen > 0 && lastTrade.exitIdx === _rowsLen - 1)){
    const isWin = lastTrade.type === 'WIN';
    return {
      state:'sell_signal',
      exitPrice: lastTrade.exit,
      exitDate: lastTrade.exitDate || '',
      pnl: lastTrade.pnl,
      isWin
    };
  }
  // 그 외 → waiting
  const lastScore = btResult.scores ? btResult.scores[btResult.scores.length-1] : null;
  return {
    state:'waiting',
    currentScore: lastScore,
    buyTh: btResult.params?.buyTh || 62
  };
}

// S82: BT 점수 히스토리 기반 전이 통계 산출
// scores 배열에서 Ready→Entry→Trend 단계 전이가 실제로 몇 번 일어났는지 계산
function _calcTransitionStats(scores, trades, scores3) {
  if (!scores || scores.length < 20) return null;
  // S83: 구간 임계값 설정 가능 (기본 Ready<50, Entry<65, Trend>=65)
  var rMax = _transZoneTh.readyMax, eMax = _transZoneTh.entryMax;
  var r2eAttempts = 0, r2eSuccess = 0;
  var e2tAttempts = 0, e2tSuccess = 0;
  var r2eBars = [], e2tBars = []; // 전이에 걸린 봉 수
  var prevZone = scores[0] < rMax ? 'ready' : scores[0] < eMax ? 'entry' : 'trend';
  var zoneStart = 0;
  for (var si = 1; si < scores.length; si++) {
    var sc = scores[si];
    var zone = sc < rMax ? 'ready' : sc < eMax ? 'entry' : 'trend';
    if (zone !== prevZone) {
      var duration = si - zoneStart;
      if (prevZone === 'ready' && zone === 'entry') { r2eAttempts++; r2eSuccess++; r2eBars.push(duration); }
      else if (prevZone === 'ready' && zone === 'trend') { r2eAttempts++; r2eSuccess++; e2tAttempts++; e2tSuccess++; r2eBars.push(duration); e2tBars.push(1); }
      else if (prevZone === 'entry' && zone === 'trend') { e2tAttempts++; e2tSuccess++; e2tBars.push(duration); }
      else if (prevZone === 'entry' && zone === 'ready') { e2tAttempts++; } // entry에서 후퇴 = 추세 전이 실패
      // [BUGFIX] dead code 제거 — `prevZone === 'ready' && zone === 'ready'` 케이스는 도달 불가
      //   zone이 3개뿐(ready/entry/trend)이고 위 `if (zone !== prevZone)` 가드로 진입하므로
      //   ready→ready는 불가능 → 정리 완료
      zoneStart = si;
      prevZone = zone;
    }
  }
  // 마지막 구간이 ready면 진행 중 시도로 카운트
  if (prevZone === 'ready' && scores.length - zoneStart > 5) r2eAttempts++;
  if (prevZone === 'entry' && scores.length - zoneStart > 5) e2tAttempts++;
  var r2eRate = r2eAttempts > 0 ? Math.round(r2eSuccess / r2eAttempts * 100) : 0;
  var e2tRate = e2tAttempts > 0 ? Math.round(e2tSuccess / e2tAttempts * 100) : 0;
  var r2eAvgBars = r2eBars.length > 0 ? Math.round(r2eBars.reduce(function(a,b){return a+b},0) / r2eBars.length) : 0;
  var e2tAvgBars = e2tBars.length > 0 ? Math.round(e2tBars.reduce(function(a,b){return a+b},0) / e2tBars.length) : 0;
  // 매매 성공률 (전이와 연결)
  var winAfterEntry = 0, totalAfterEntry = 0;
  if (trades && trades.length) {
    for (var ti = 0; ti < trades.length; ti++) {
      if (trades[ti].type === 'WIN' || trades[ti].type === 'LOSS') {
        totalAfterEntry++;
        if (trades[ti].type === 'WIN') winAfterEntry++;
      }
    }
  }
  return {
    r2e: { attempts: r2eAttempts, success: r2eSuccess, rate: r2eRate, avgBars: r2eAvgBars },
    e2t: { attempts: e2tAttempts, success: e2tSuccess, rate: e2tRate, avgBars: e2tAvgBars },
    tradeWinRate: totalAfterEntry > 0 ? Math.round(winAfterEntry / totalAfterEntry * 100) : 0,
    totalSamples: scores.length,
    // S83: 롤링 전이확률 추이 (10봉 윈도우)
    timeline: _calcTransitionTimeline(scores, scores3)
  };
}

// S83: 10봉 롤링 윈도우로 전이확률 추이 산출, S84: 전이 발생 시점 마커 추가
// S86: scores3 ({t,r,e} 배열) 기반 봉별 3단 평균 점수 추가
function _calcTransitionTimeline(scores, scores3) {
  if (!scores || scores.length < 20) return null;
  var WIN = 10;
  var rMax = _transZoneTh.readyMax, eMax = _transZoneTh.entryMax;
  var step = Math.max(1, Math.floor(scores.length / 30)); // 최대 ~30 포인트

  // S84: 전이 발생 봉 수집 (zone 변경 시점)
  var transEvents = []; // {bar, from, to}
  var prevZone = scores[0] < rMax ? 'ready' : scores[0] < eMax ? 'entry' : 'trend';
  for (var te = 1; te < scores.length; te++) {
    var curZone = scores[te] < rMax ? 'ready' : scores[te] < eMax ? 'entry' : 'trend';
    if (curZone !== prevZone) {
      transEvents.push({bar: te, from: prevZone, to: curZone});
      prevZone = curZone;
    }
  }

  var has3 = scores3 && scores3.length === scores.length;
  var points = [];
  for (var i = WIN; i <= scores.length; i += step) {
    var slice = scores.slice(Math.max(0, i - WIN), i);
    var rCnt = 0, eCnt = 0, tCnt = 0;
    for (var j = 0; j < slice.length; j++) {
      if (slice[j] < rMax) rCnt++;
      else if (slice[j] < eMax) eCnt++;
      else tCnt++;
    }
    // 구간별 비율을 전이 가능성의 프록시로 사용
    var total = slice.length;
    // S84: 해당 포인트 구간 내 전이 이벤트 수 계산
    var rangeStart = Math.max(0, i - step);
    var evtCnt = 0;
    var evtType = null; // 가장 최근 전이 방향
    for (var ek = 0; ek < transEvents.length; ek++) {
      if (transEvents[ek].bar >= rangeStart && transEvents[ek].bar < i) {
        evtCnt++;
        evtType = transEvents[ek];
      }
    }
    // S86: 3단 점수 평균 (봉별 R/E/T)
    var avgR = 0, avgE = 0, avgT = 0;
    if (has3) {
      var s3slice = scores3.slice(Math.max(0, i - WIN), i);
      var sumR = 0, sumE = 0, sumT = 0;
      for (var si = 0; si < s3slice.length; si++) { sumR += s3slice[si].r; sumE += s3slice[si].e; sumT += s3slice[si].t; }
      avgR = Math.round(sumR / s3slice.length);
      avgE = Math.round(sumE / s3slice.length);
      avgT = Math.round(sumT / s3slice.length);
    }
    points.push({
      bar: i,
      readyPct: Math.round(rCnt / total * 100),
      entryPct: Math.round(eCnt / total * 100),
      trendPct: Math.round(tCnt / total * 100),
      transEvt: evtCnt > 0 ? {count: evtCnt, from: evtType.from, to: evtType.to} : null,
      avgR: avgR, avgE: avgE, avgT: avgT // S86
    });
  }
  return points;
}

async function fetchDisclosureKeywords(code) {
  if (!code || currentMarket !== 'kr') return [];
  const cacheKey = 'DISC_' + code;
  if (_discCache[cacheKey] && Date.now() - _discCache[cacheKey].ts < DISCLOSURE_TTL) return _discCache[cacheKey].keywords || [];
  try {
    const bgnDate = new Date(Date.now() - _discPeriodDays * 86400000);
    const bgnDe = bgnDate.toISOString().slice(0, 10).replace(/-/g, '');
    const res = await fetch(`${WORKER_BASE}/dart/disclosure?stock_code=${code}&page_count=50&bgn_de=${bgnDe}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    let disclosures = data.disclosures || [];
    disclosures = disclosures.filter(d => !d.rcept_dt || d.rcept_dt >= bgnDe);
    if (!disclosures.length) { _discCache[cacheKey] = { ts: Date.now(), keywords: [] }; return []; }
    const keywords = (typeof SXE !== 'undefined' && SXE.matchDisclosureKeywords) ? SXE.matchDisclosureKeywords(disclosures, _customDiscKw) : [];
    _discCache[cacheKey] = { ts: Date.now(), keywords };
    return keywords;
  } catch (_) { return []; }
}

async function filterByDisclosure(results, progressCb) {
  const filtered = [];
  for (let i = 0; i < results.length; i++) {
    const s = results[i];
    if (progressCb) progressCb(i + 1, results.length);
    try {
      const kws = await fetchDisclosureKeywords(s.code);
      s._disclosureKw = kws;
      if (kws.some(k => k.grade === 'CRITICAL') || kws.some(k => k.grade === 'SEVERE')) continue;
      filtered.push(s);
    } catch (_) { filtered.push(s); }
  }
  return filtered;
}

// ═══════════════════════════════════════════════════════════════
//  postMessage용 슬림 변환 — 순환참조/거대객체 제거
// ═══════════════════════════════════════════════════════════════
function _slimResults(arr) {
  return arr.map(s => ({
    code: s.code, name: s.name, market: s.market, sector: s.sector || '',
    price: s.price, changeRate: s.changeRate, volume: s.volume,
    tradeAmount: s.tradeAmount, marketCap: s.marketCap,
    foreignRatio: s.foreignRatio, listedShares: s.listedShares,
    volumeRatio: s.volumeRatio,
    _score: s._score, _action: s._action, _reasons: s._reasons,
    _regime: s._regime ? { label: s._regime.label, icon: s._regime.icon } : null,
    _mkt: s._mkt || 'kr',
    _smartTags: s._smartTags, _filterScore: s._filterScore,
    _btScore: s._btScore, _btAction: s._btAction,
    // [2026-04 FIX] 스캔 시점 계산한 모멘텀을 메인스레드에 전달 → 분석탭 재판정 시 동일 입력 보장
    _scoreMomentum: s._scoreMomentum || null,
    // S103-fix7 Phase3-B-2b: C 판정 결과 메인 전달 (결과탭 아이콘/차트 마커/재계산 skip용)
    // [v3.10 결과탭 마커] verdictBeforeShift, momBadge 추가 직렬화 — 종목 카드에서 모멘텀 승급/강등 시각화용
    //   〔이력〕 이전 누락 시: 메인 스레드에서 모멘텀 보정 발생 여부 판별 불가 (label 텍스트 파싱은 깨지기 쉬움) → 직렬화 추가
    _svVerdict: s._svVerdict ? {
      action: s._svVerdict.action, icon: s._svVerdict.icon, color: s._svVerdict.color,
      chartMarker: s._svVerdict.chartMarker, chartMarkerHold: s._svVerdict.chartMarkerHold, label: s._svVerdict.label,
      verdictBeforeShift: s._svVerdict.verdictBeforeShift,
      momBadge: s._svVerdict.momBadge ? {
        direction: s._svVerdict.momBadge.direction,
        label: s._svVerdict.momBadge.label,
        icon: s._svVerdict.momBadge.icon
      } : null
    } : null,
    _btState: s._btState ? {
      state: s._btState.state, entry: s._btState.entry, entryDate: s._btState.entryDate,
      entryIdx: s._btState.entryIdx, totalBars: s._btState.totalBars,
      _isBuySignal: s._btState._isBuySignal, pnl: s._btState.pnl,
      tp: s._btState.tp, sl: s._btState.sl,
      exitPrice: s._btState.exitPrice, exitDate: s._btState.exitDate, isWin: s._btState.isWin,
      currentScore: s._btState.currentScore, buyTh: s._btState.buyTh
    } : null,
    _btResult: s._btResult ? {
      totalPnl: s._btResult.totalPnl, winRate: s._btResult.winRate,
      totalTrades: s._btResult.totalTrades, mdd: s._btResult.mdd,
      profitFactor: s._btResult.profitFactor, avgWin: s._btResult.avgWin,
      avgLoss: s._btResult.avgLoss, maxConsecLoss: s._btResult.maxConsecLoss
    } : null,
    _btTransitionStats: s._btTransitionStats || null,
    _scanResult: s._scanResult ? {
      score: s._scanResult.score, action: s._scanResult.action,
      reasons: s._scanResult.reasons,
      readyScore: s._scanResult.readyScore, entryScore: s._scanResult.entryScore, trendScore: s._scanResult.trendScore,
      readyNotes: s._scanResult.readyNotes, entryNotes: s._scanResult.entryNotes,
      rsiDiv: s._scanResult.rsiDiv, obvDiv: s._scanResult.obvDiv,
      squeeze: s._scanResult.squeeze, maAlignBull: s._scanResult.maAlignBull,
      maAlignBear: s._scanResult.maAlignBear, above60: s._scanResult.above60,
      volRatio: s._scanResult.volRatio, pbScore: s._scanResult.pbScore,
      rsiVal: s._scanResult.rsiVal, stochK: s._scanResult.stochK,
      macdCrossUp: s._scanResult.macdCrossUp, macdCrossDown: s._scanResult.macdCrossDown,
      // [FIX] 시장 레짐 카드 누락 복구 — 워커→메인 직렬화 시 regime 객체 보존.
      //   누락 시 sx_render.js:3105 const regime = qs.regime → null
      //   → 시장 레짐 첫 줄(아이콘/라벨/ADX/BB%) + 핵심 이유(reasons) + 레짐 상세 해석 토글
      //   + 레짐 적응 안내가 통째로 사라지는 증상 발생.
      //   regime: {label,icon,direction,score,adx,bbWidth} 6필드 — 직렬화 비용 무시 가능.
      regime: s._scanResult.regime || null,
      _regimeAdapt: s._scanResult._regimeAdapt || null,
      _adaptedTh: s._scanResult._adaptedTh || null,
    } : null,
    _financial: s._financial || null,
    _investor: s._investor || null,
    _kisData: s._kisData || null,
    _disclosureKw: s._disclosureKw || null,
    _foreignExhaustion: s._foreignExhaustion || 0,
    _openChangeRate: s._openChangeRate || 0,
    // [S244] 워치리스트 보조 필터용 ind 직렬화 — 워치리스트 모드에서만 추가 (일반 스캔은 트래픽 절약)
    //   〔정책〕 _wlExtractInd가 r._ind 우선 추출. 6종 필터(MA정배열/MA20위/RSI50/거래량/MACD/캔들) 평가 가능.
    //   〔fallback〕 indicators 객체 구조 변동 가능성 — 여러 경로 시도 후 ?? null
    _ind: (_watchlistScanMode && (s._indicators || s._lastBar)) ? {
      ma5: s._indicators?.ma5 ?? null,
      ma20: s._indicators?.ma20 ?? null,
      ma60: s._indicators?.ma60 ?? null,
      rsi: s._indicators?.rsi ?? null,
      macdHist: s._indicators?.macd?.histogram
        ?? (s._indicators?.macd && s._indicators?.macd?.signal != null
            ? (s._indicators.macd.macd - s._indicators.macd.signal)
            : null),
      close: s._lastBar?.close ?? s._indicators?.last ?? s._indicators?.price ?? null,
      open: s._lastBar?.open ?? null,
      high: s._lastBar?.high ?? null,
      low: s._lastBar?.low ?? null,
      volume: s._lastBar?.volume ?? null,
      volAvg20: s._indicators?.volumeMA?.ma20
        ?? s._indicators?._advanced?.volumeMA?.ma20
        ?? s._indicators?.volPattern?.volMA20
        ?? null,
    } : null,
  }));
}

// ═══════════════════════════════════════════════════════════════
//  메인 스캔 루프
// ═══════════════════════════════════════════════════════════════
// [S440][S442] 조건검색 워커 RS — 스캔 1회만 지수 시계열 fetch해 전역 캐시(sym별, 모든 종목 공유).
//   분석탭 _fetchIndexCloses와 동일 로직(워커 _fetchWithTimeout). 국내=코스피 ^KS11 / 코스닥 ^KQ11(S442 분리), 미국=^GSPC, 코인 보류.
//   실패 시 null → RS 생략. 워커가 indicators.rs를 채우면 rs_value 조건검색 평가 + 결과 클릭 시 정합.
let _wkrIndexCache = {};
async function _fetchIndexClosesWorker(sym){
  if(!sym) return null;
  try {
    if(sym === 'KRW-BTC'){
      // [S443] 코인 지수 = 업비트 KRW-BTC 일봉 (최신 먼저 → reverse). trade_price=종가.
      const url = `${WORKER_BASE}/upbit/candles?market=KRW-BTC&type=days&count=130`;
      const r = await _fetchWithTimeout(url, {}, 12000);
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.data || []);
      const c = arr.map(x => parseFloat(x.trade_price || x.close || 0)).filter(v => v > 0).reverse();
      return c.length ? c : null;
    }
    const yf = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo`;
    const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(yf)}`;
    const r = await _fetchWithTimeout(url, {}, 12000);
    const j = await r.json();
    const closes = (j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].indicators
      && j.chart.result[0].indicators.quote && j.chart.result[0].indicators.quote[0]
      && j.chart.result[0].indicators.quote[0].close || []).filter(c => c != null);
    return closes.length ? closes : null;
  } catch(e){ return null; }
}
// [S442] 워커 코스닥 판별 — stock.market만(워커엔 OracleData 없음). 'KOSDAQ'/'코스닥'.
function _isKosdaqWorker(s){
  const m = String((s && s.market) || '');
  return m === 'KOSDAQ' || m === '코스닥';
}

async function startScan(config) {
  // config에서 상태 주입
  WORKER_BASE = config.WORKER_BASE;
  currentMarket = config.currentMarket;
  currentTF = config.currentTF;
  // [S440/S442] RS용 지수 시계열 — 스캔당 1회만 fetch해 sym별 캐시(일봉만). 국내는 코스피·코스닥 둘 다. 실패해도 스캔 계속.
  _wkrIndexCache = {};
  if(currentTF === 'day'){
    if(currentMarket === 'us'){
      _wkrIndexCache['^GSPC'] = await _fetchIndexClosesWorker('^GSPC');
    } else if(currentMarket === 'coin'){
      _wkrIndexCache['KRW-BTC'] = await _fetchIndexClosesWorker('KRW-BTC'); // [S443] 코인=BTC 대비
    } else {
      _wkrIndexCache['^KS11'] = await _fetchIndexClosesWorker('^KS11');
      _wkrIndexCache['^KQ11'] = await _fetchIndexClosesWorker('^KQ11');
    }
  }
  scanMarket = config.scanMarket;
  activeFilters = config.activeFilters || [];
  _kisEnabled = config.kisEnabled || false;
  _kisConfig = config.kisConfig || null;
  _kisToken = config.kisToken || null;
  _kisTokenExp = config.kisTokenExp || 0;
  _watchlistScanMode = config.watchlistScanMode || false;
  _watchlistData = config.watchlistData || [];
  _finReportType = config.finReportType || 'annual';
  _discPeriodDays = config.discPeriodDays || 90;
  _customDiscKw = config.customDiscKw || [];
  // S83: 전이 구간 임계값 수신
  if (config.transZoneTh) _transZoneTh = config.transZoneTh;
  _parallelEnabled = config.parallelEnabled || false;
  _safetyFlags = config.safetyFlags || {};
  _regimeAdaptEnabled = config.regimeAdaptEnabled || false;
  // S125 → S211: 워커 환경(localStorage 불가)에서 엔진이 매트릭스를 참조할 수 있도록 주입
  //   메인 스레드가 scanPayload에 currentMarket(시장), currentAnalMode(레거시 호환), analParamsMatrix를 담아 전달
  //   → 엔진의 _getCurrentMarketKey/_loadParamsMatrix가 이 값을 읽도록 SXE에 저장
  if (typeof SXE !== 'undefined') {
    // S211: 시장 키 우선. _workerMarket이 있으면 엔진이 _getCurrentMarketKey에서 우선 사용.
    SXE._workerMarket = config.currentMarket || 'kr';
    SXE._workerCurrentMode = config.currentAnalMode || 'kr'; // 레거시 호환 — 엔진은 시장 키로 처리
    SXE._workerMatrix = config.analParamsMatrix || {};
    SXE._workerRegimeOn = !!config.regimeAdaptEnabled;
  }
  _oracleKospi = config.oracleKospi || [];
  _oracleKosdaq = config.oracleKosdaq || [];
  _oracleEtf = config.oracleEtf || [];
  _oracleCoin = config.oracleCoin || [];
  _oracleUsKeys = config.oracleUsKeys || {};
  _stockMasterCache = config.stockMasterCache || null;
  _marketEnvData = config.marketEnvData || null;
  _scanAbort = false;
  // [PATCH-14] 탈락 원인 통계 초기화
  _passFilterStats = {};
  _techFilterStats = {};
  _candleFailCount = 0;
  // [v3.11] 종목 추적 초기화
  _traceCode = (config.traceCode || '').trim() || null;
  _traceLog = [];

  // 엔진 로드
  _loadEngines(config.cacheBuster || '1');
  if (!_engineLoaded) return;

  // 엔진에 safetyFlags/regimeAdapt 동기화
  if (typeof SXE !== 'undefined') {
    SXE._safetyFlags = _safetyFlags;
    // S165: 분석엔진 진입 게이트 (BT 게이트와 대칭 적용)
    //   - 메인스레드에서 scanPayload로 전달받아 SXE에 주입
    //   - applyGatesToAnalysis=true면 scrQuickScore가 BUY 후 게이트 검사 추가 수행
    //   - gatesSyncMode='sync'면 btEntryGates를 사용, 'split'이면 analysisEntryGates를 사용
    if (config.btEntryGates) SXE._btEntryGates = config.btEntryGates;
    if (config.analysisEntryGates) SXE._analysisEntryGates = config.analysisEntryGates;
    SXE._applyGatesToAnalysis = !!config.applyGatesToAnalysis;
    SXE._gatesSyncMode = (config.gatesSyncMode === 'split') ? 'split' : 'sync';
    // [S309] 분석탭↔스캐너 BT 결과 일관성 보장 — 메인이 동봉한 BT 청산 설정으로 SXE 덮어쓰기
    //   대상: _btEarlyExit (조기청산 + 5개 보조 룰), _btExitMode (종가/OHLC), _btTrailAtrMode (entry/dynamic)
    //   배경: 워커는 localStorage 미지원 → 위 3개 변수가 IIFE 폴백으로 기본값 고정됨.
    //         메인이 동봉으로 보내준 값을 여기서 덮어써야 sxRunBtEngine 호출 시 메인과 동일 결과.
    //   안전: config.bt* 값이 null/undefined면 워커의 기본값 그대로 사용 (역호환 보장).
    if (config.btEarlyExit)    SXE._btEarlyExit    = config.btEarlyExit;
    if (config.btExitMode)     SXE._btExitMode     = config.btExitMode;
    if (config.btEntryMode)    SXE._btEntryMode    = config.btEntryMode;  // [S422] 진입 시점(종가/다음봉시가) — 워커 localStorage 미지원, 메인 동봉값 사용
    if (typeof config.btGapGuard === 'boolean') SXE._btGapGuard = config.btGapGuard;  // [S423] 갭 가드(다음봉 시가 모드 전용)
    if (config.btTrailAtrMode) SXE._btTrailAtrMode = config.btTrailAtrMode;
    if (typeof setMarketWeight === 'function') setMarketWeight(currentMarket);
  }

  // 일반 스캔: 활성 필터 0이면 즉시 종료
  // 관심종목 모드: 필터 없어도 모든 관심종목 분석/반환
  if (!activeFilters.length && !_watchlistScanMode) {
    self.postMessage({ type: 'done', results: [], newFound: 0 });
    return;
  }

  const KIS_FILTER_IDS = new Set(['bid_ask_ratio', 'total_bid_qty', 'total_ask_qty', 'trade_strength', 'buy_ratio', 'intraday_high_break', 'intraday_vwap_pos', 'program_realtime']);

  try {
    // 1단계: 종목풀 로드
    self.postMessage({ type: 'progress', current: 0, total: 0, name: '종목 데이터 로딩...' });
    let master = null;
    if (currentMarket === 'kr') master = await loadStockMaster();
    else if (currentMarket === 'coin') master = await loadCoinMaster();
    else if (currentMarket === 'us') master = await loadUSMaster();
    if (!master || !master.length) { self.postMessage({ type: 'error', message: '종목 데이터를 로딩할 수 없습니다' }); return; }

    // 2단계: 하위시장 필터
    let pool = [...master];
    if (currentMarket === 'kr') {
      if (scanMarket === '코스피') pool = pool.filter(s => s.market === '코스피' || s.market === 'KOSPI');
      else if (scanMarket === '코스닥') pool = pool.filter(s => s.market === '코스닥' || s.market.startsWith('KOSDAQ'));
      else if (scanMarket === 'ETF') pool = pool.filter(s => s.market === 'ETF');
    } else if (currentMarket === 'us' && scanMarket !== '전체') {
      const idxMap = { 'S&P500': 'SP500', 'NASDAQ': 'NDX', 'DOW30': 'DOW', 'ETF': 'ETF' };
      const k = idxMap[scanMarket];
      if (k && _oracleUsKeys[k]) pool = _oracleUsKeys[k];
    }
    pool.sort((a, b) => (b.marketCap || b.mcap || 0) - (a.marketCap || a.mcap || 0));

    // 관심목록 스캔 모드
    if (_watchlistScanMode) {
      const wlCodes = new Set(_watchlistData.map(w => w.code));
      pool = pool.filter(s => wlCodes.has(s.code));
      const poolCodes = new Set(pool.map(s => s.code));
      _watchlistData.forEach(w => {
        if (!poolCodes.has(w.code)) pool.push({ code: w.code, name: w.name, market: w.market || currentMarket, price: 0, changeRate: 0, volume: 0, tradeAmount: 0, marketCap: 0, foreignRatio: 0, volumeRatio: 100, _mkt: currentMarket });
      });
    }

    const fullTotal = pool.length;
    self.postMessage({ type: 'rangeMax', value: fullTotal });
    const range = config.scanRange || { from: 0, to: fullTotal };
    pool = _watchlistScanMode ? pool : pool.slice(range.from, range.to);
    // [v3.11] 추적 종목이 풀에 없으면 강제 추가 — 모든 단계 검사를 받아야 어디서 떨어지는지 보임
    if (_traceCode) {
      const _traced = pool.find(s => s.code === _traceCode);
      if (!_traced) {
        // 마스터에서 종목 정보 찾기
        let _traceStock = null;
        try {
          if (currentMarket === 'kr' && master) _traceStock = master.find(s => s.code === _traceCode);
          else if (currentMarket === 'coin' && master) _traceStock = master.find(s => s.code === _traceCode);
          else if (currentMarket === 'us' && master) _traceStock = master.find(s => s.code === _traceCode);
        } catch (e) {}
        if (_traceStock) {
          pool.unshift(_traceStock); // 첫번째 위치에 추가 → 빨리 검사
          _trace('풀 추가', '강제', '대상 풀 밖이라 강제 추가됨', _traceStock.name);
        } else {
          _trace('풀 추가', '실패', `종목 코드 ${_traceCode}를 마스터에서 찾을 수 없음`, '');
        }
      } else {
        _trace('풀 추가', '✓', '대상 풀에 이미 있음', _traced.name);
      }
    }
    const total = pool.length;
    let newFound = 0;
    let searchResults = [];

    const getFilter = (id) => activeFilters.find(f => f.id === id);
    // [v3.10] _recent_n_bars는 메타조건 — checkTechConditions에 넘기지 않고 윈도우 크기로만 사용
    // [v3.11-fix] N봉 추출: max 우선 (사용자 의도 = 윈도우 상한)
    //   range 입력은 {min, max} 구조. 사용자가 "최근 N봉" 모달에 30 입력하면 보통
    //   {min:null, max:30} 또는 {min:1, max:30} 형태로 저장됨.
    //   max가 윈도우 크기 의도(예: "최근 30봉 안에 발생"). min은 무의미한 디폴트값.
    const _recentNFilter = activeFilters.find(f => f.id === '_recent_n_bars');
    let _recentN = 1;
    if (_recentNFilter && _recentNFilter.value) {
      const v = _recentNFilter.value;
      const n = (typeof v === 'object') ? (v.max ?? v.min) : v; // max 우선
      _recentN = Math.max(1, Math.min(60, parseInt(n) || 1));
    }
    const techFilters = activeFilters.filter(f => { 
      if (f.id === '_recent_n_bars') return false; // 메타조건 제외
      const meta = findCondMeta(f.id); 
      return meta && meta.source === 'calc_candle'; 
    });
    const needCandles = techFilters.length > 0;
    const kisFilters = activeFilters.filter(f => KIS_FILTER_IDS.has(f.id));
    const needKis = kisFilters.length > 0 && _kisEnabled && currentMarket === 'kr';
    if (needKis) await _getKisToken();

    const PARALLEL = getParallelCount(total);
    const BATCH = Math.max(PARALLEL, 1);
    const _scCount = (currentMarket === 'kr' && _kisEnabled) ? 500 : 200;

    for (let i = 0; i < total;) {
      if (_scanAbort) { self.postMessage({ type: 'progress', current: i, total, name: '중지됨' }); break; }

      // 배치 구성
      const batch = [], batchIdx = [];
      while (batch.length < BATCH && i < total) {
        if (_scanAbort) break;
        const s = pool[i]; i++;
        const _isTraced = _traceCode && s.code === _traceCode;
        // [v3.11] 추적 종목이면 호출 전 stats 스냅샷 → 후에 비교해서 정확히 어떤 reason이 추가됐는지 잡음
        const _statsSnapshot = _isTraced ? { ..._passFilterStats } : null;
        if (!passFilters(s, getFilter)) {
          if (_isTraced) {
            // 호출 전후 비교: 새로 +1된 키를 찾음
            let _newReason = null;
            for (const k in _passFilterStats) {
              if (_passFilterStats[k] > (_statsSnapshot[k] || 0)) { _newReason = k; break; }
            }
            _trace('1단계 기본필터', '❌ 탈락', _newReason || '미상', '');
          }
          continue;
        }
        if (_isTraced) _trace('1단계 기본필터', '✅ 통과', '', '');
        batch.push(s); batchIdx.push(i - 1);
      }
      if (!batch.length) continue;

      // 배치 캔들 prefetch
      let candleResults = null;
      if (needCandles && PARALLEL > 1) {
        candleResults = await Promise.all(batch.map(s => fetchCandles(s.code, _scCount).catch(() => null)));
      }

      for (let bi = 0; bi < batch.length; bi++) {
        if (_scanAbort) break;
        const s = batch[bi];
        const _isTraced2 = _traceCode && s.code === _traceCode;
        self.postMessage({ type: 'progress', current: batchIdx[bi] + 1, total, name: s.name });

        let indicators = null, candles = null;
        if (needCandles) {
          try {
            candles = candleResults ? candleResults[bi] : await fetchCandles(s.code, _scCount);
            if (!candles || candles.length < 20) {
              _candleFailCount++;
              if (_isTraced2) _trace('캔들 데이터', '❌ 부족', `봉 ${candles ? candles.length : 0}개 (20봉 미만)`, '');
              continue;
            }
            if (_isTraced2) _trace('캔들 데이터', '✅ 통과', `${candles.length}봉 확보`, '');
            
            // [v3.10] 최근 N봉 윈도우 평가
            //   N=1: 마지막 봉만 평가 (단일 봉 모드 — v3.10 이전 동작과 동일)
            //   N>1: 최근 N봉 중 어느 한 봉이라도 모든 기술적 조건을 동시 충족하면 통과
            //   각 슬라이드 시점 k에서 candles.slice(0, len-k)로 자른 뒤 calcIndicators 재호출
            //   → 그 시점이 '현재'였다고 가정한 모든 지표값 산출 → 조건 평가
            //   목적: 1년 전 골든크로스가 정배열 유지로 계속 잡히던 문제 해결
            //   비용: N배 calcIndicators 호출. 실용 권장 N≤5
            // [v3.11] 조건별 탈락 진단 — 어떤 기술적 조건에서 떨어졌는지 추적
            //   각 슬라이드 시점에서 모든 조건이 동시 충족돼야 하는데, 그 시점에서
            //   가장 먼저 떨어진 조건을 종목당 1번 카운트. 결과탭 진단 모달에서 표시.
            let passed = false;
            let passedK = 0;
            let _firstFailedCondId = null; // 조건별 진단용
            const cLen = candles.length;
            // N봉이 데이터보다 크면 가능한 만큼만
            // [S317] gc_* 조건이 있으면 외부 슬라이드 비활성화 (Nactual=1) — gc 내부 윈도우만 사용
            //   사유: 외부 슬라이드 + gc 내부 윈도우가 동시 작동하면 윈도우가 이중으로 넓어지고
            //         "현재 봉 기준 N봉 윈도우" 의미가 깨짐. 메인 HTML은 슬라이드 없음 → k=0 강제로 동일.
            const _hasGcFilter = techFilters.some(f => f && typeof f.id === 'string' && f.id.indexOf('gc_') === 0);
            const Nactual = _hasGcFilter ? 1 : Math.min(_recentN, Math.max(1, cLen - 19));
            for (let k = 0; k < Nactual; k++) {
              // k=0 → 마지막 봉(현재), k=N-1 → N-1봉 전
              const slice = (k === 0) ? candles : candles.slice(0, cLen - k);
              if (slice.length < 20) break;
              const indK = calcIndicators(slice, currentTF);
              if (techFilters.length === 0) {
                indicators = indK; passed = true; passedK = k; break;
              }
              // 조건별 격리 검사 — 어떤 조건이 첫 탈락인지 알기 위해
              let allPass = true;
              let _failedHere = null;
              for (const _tf of techFilters) {
                if (!checkTechConditions(indK, [_tf], getFilter)) {
                  allPass = false;
                  _failedHere = _tf.id;
                  break;
                }
              }
              if (allPass) {
                indicators = indK; passed = true; passedK = k; break;
              }
              // 마지막 슬라이드 시점에서 떨어진 조건 → 진단용 (가장 가까운 시점 기준)
              if (k === 0) _firstFailedCondId = _failedHere;
            }
            if (!passed) {
              // [v3.11] 조건별 카운트
              const _statKey = _firstFailedCondId || 'tech_all';
              _techFilterStats[_statKey] = (_techFilterStats[_statKey] || 0) + 1;
              if (_isTraced2) _trace('2단계 기술적조건', '❌ 탈락', _statKey, `최근 ${_recentN}봉 윈도우 안에 모든 조건 동시 충족 못함`);
              continue;
            }
            if (_isTraced2 && techFilters.length > 0) {
              const _passedAt = passedK === 0 ? '현재봉' : `${passedK}봉 전`;
              _trace('2단계 기술적조건', '✅ 통과', `${_passedAt} 시점에서 모든 조건 충족`, '');
            }
            // [v3.10] 마지막 봉 시점 indicators도 보존 — 후속 단계(quickScore, BT 등)는
            //   "현재 시점" 지표를 기대하므로, k>0에서 통과했어도 화면 표시·후속 계산용으로
            //   마지막 봉 indicators를 별도 계산해 s._indicators에 저장.
            //   k=0 통과 시는 indicators가 이미 마지막 봉이므로 재계산 불필요.
            if (passedK > 0) {
              try { indicators = calcIndicators(candles, currentTF); } catch(_) {}
            }
            // [S440/S442] RS(상대강도) 주입 — 일봉 + 종목 시장에 맞는 지수(코스닥→^KQ11/코스피→^KS11/미국→^GSPC) 캐시 있을 때만.
            if(indicators && currentTF === 'day'){
              const _rsSym = (currentMarket === 'us') ? '^GSPC'
                : (currentMarket === 'coin') ? 'KRW-BTC'
                : (_isKosdaqWorker(s) ? '^KQ11' : '^KS11');
              const _rsIdx = _wkrIndexCache[_rsSym];
              if(_rsIdx){ try { indicators.rs = SXE.calcRS(candles.map(c => c.close), _rsIdx); } catch(_eRS){} }
            }
            s._indicators = indicators;
            s._recentNHitBar = passedK; // 디버깅/표시용: 0=현재봉, 1=직전봉, ...
            if (candles.length > 0) {
              const lastCandle = candles[candles.length - 1];
              // [S244] 보조 필터용 마지막 봉 저장 — _slimResults에서 _ind로 직렬화
              //   〔정책〕 워치리스트 보조 필터(_wlPassAux)가 close/high/low/volume 필요
              //          indicators 객체에 high/low가 없을 수 있어 별도 캐시
              s._lastBar = {
                close: lastCandle.close, open: lastCandle.open,
                high: lastCandle.high, low: lastCandle.low,
                volume: lastCandle.volume
              };
              if (lastCandle.foreignExhaustion > 0) s._foreignExhaustion = lastCandle.foreignExhaustion;
              if (lastCandle.open > 0 && s.price > 0) s._openChangeRate = ((s.price - lastCandle.open) / lastCandle.open) * 100;
            }
            if (s.price === 0 && indicators._advanced) {
              const adv = indicators._advanced;
              if (adv.price) s.price = adv.price;
              if (adv.rows && adv.rows.length >= 2) {
                const last = adv.rows[adv.rows.length - 1], prev = adv.rows[adv.rows.length - 2];
                if (!s.price && last.close) s.price = last.close;
                if (s.changeRate === 0 && prev.close > 0) s.changeRate = ((last.close - prev.close) / prev.close) * 100;
                if (s.volume === 0 && last.volume) s.volume = last.volume;
                if (s.tradeAmount === 0 && last.close && last.volume) s.tradeAmount = (last.close * last.volume) / 1000000;
              }
            }
          } catch (e) { continue; }
        }

        // KIS 실시간 데이터
        if (needKis) {
          try {
            const kisData = await _fetchKisData(s.code);
            if (kisData && !_checkKisConditions(kisData, kisFilters, getFilter)) continue;
            s._kisData = kisData;
          } catch (_) {}
        }

        // Phase 3: quickScore
        if (indicators && indicators._advanced) {
          const adv = indicators._advanced;
          const volSoft = ATR.soften(adv.atr.pct, `scr_${adv.rows[0]?.date || 'x'}`, {});
          const ctx = adv.context || ContextEngine.analyze(adv);
          let { rawScore, mom, osc, _breakdown } = scrComputeScore(adv, volSoft, ctx.bonus); // [S527] let — 추가하락 차감 미러
          const th = _getEffectiveTh(currentTF);
          let action = rawScore >= th.buyTh ? 'BUY' : rawScore <= th.sellTh ? 'SELL' : 'HOLD';
          if (_isTraced2) _trace('3단계 분석엔진', `점수: ${rawScore.toFixed(1)}`, `초기 판정: ${action} (buy≥${th.buyTh}, sell≤${th.sellTh})`, '');
          if (action === 'BUY' && !_scrMomOscPass(mom, osc, currentTF)) {
            action = 'HOLD';
            if (_isTraced2) _trace('3단계 분석엔진', '⚠️ 강등', '모멘텀/오실레이터 미통과 → HOLD', '');
          }
          const reasons = [];
          // [S452] 안전필터 토글(_sfW)을 강등 패스에도 적용 — 분석엔진(sx_analysis_engine.js _sf 게이트)과 미러 일치.
          //   기존엔 _safetyViol(C캡) 패스에만 토글이 적용돼, OFF 필터도 스캐너에서 BUY→HOLD 강등되던 desync 수정.
          //   ※약세 캔들(이브닝/슈팅)은 토글 없음(천장신호 항상 ON) 유지 → 게이트 안 붙임. _safety_clean은 이제 '켜둔 필터' 기준으로 카운트.
          const _sfW = (typeof SXE !== 'undefined' && SXE._safetyFlags && Object.keys(SXE._safetyFlags).length)
            ? SXE._safetyFlags
            : {threshold:true,volExtreme:true,volHigh:true,rsiDiv:true,stochRsi:true,macdNeg:true,ma60resist:true,bbUpper:true,resistNear:true,chaseGuard:true,dumpWarn:true,deadCrossGuard:true,supportBreak:true,debtRatio:true,foreignSell:true,highBeta:true};
          // [S454] 되돌림주의(dumpWarn) — 천정·투매 위험(정지). 강등·_safetyViol 공용 1회 계산. (조건검색 '되돌림주의 제외'와 동일 소스)
          let _dumpWW = null;
          if (_sfW.dumpWarn && typeof SXE !== 'undefined' && SXE.calcDumpWarn) {
            try { _dumpWW = SXE.calcDumpWarn(candles, adv, s.changeRate, currentMarket); } catch (_eDWW) { _dumpWW = null; } // [S457] adv.candles→실제 candles(투매 분기 복구)
          }
          if (_sfW.threshold && action === 'BUY' && rawScore < th.buyTh + 2) { reasons.push('임계값'); action = 'HOLD'; _techFilterStats['_safety_threshold'] = (_techFilterStats['_safety_threshold']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '임계값 마진 부족 (점수 buyTh+2 미만)', ''); }
          { const vf = _scrVolFilter(volSoft, currentTF); if (_sfW.volExtreme && volSoft >= vf.hard) { reasons.push('변동성극단'); action = 'HOLD'; _techFilterStats['_safety_volExtreme'] = (_techFilterStats['_safety_volExtreme']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `변동성 극단 (${volSoft.toFixed(2)} ≥ ${vf.hard})`, ''); } else if (_sfW.volHigh && volSoft >= vf.softTh && action === 'BUY' && rawScore < th.buyTh + vf.bonus) { reasons.push('변동성과다'); action = 'HOLD'; _techFilterStats['_safety_volHigh'] = (_techFilterStats['_safety_volHigh']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '변동성 과다 + 점수 마진 부족', ''); } }
          if (_sfW.rsiDiv && action === 'BUY' && adv.rsi.div === 'bearish') { reasons.push('RSI다이버전스'); action = 'HOLD'; _techFilterStats['_safety_rsiDiv'] = (_techFilterStats['_safety_rsiDiv']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', 'RSI 약세 다이버전스', ''); }
          if (_sfW.stochRsi && action === 'BUY' && adv.stoch.k > 90 && adv.rsi.val < 60) { reasons.push('Stoch/RSI괴리'); action = 'HOLD'; _techFilterStats['_safety_stochRsi'] = (_techFilterStats['_safety_stochRsi']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `Stoch ${adv.stoch.k.toFixed(0)}>90 + RSI ${adv.rsi.val.toFixed(0)}<60`, ''); }
          if (_sfW.macdNeg && action === 'BUY' && adv.macd.hist < 0) { const h = adv.macd.arr.hist; if (h.length >= 5 && h.slice(-5).every(v => v < 0)) { reasons.push('MACD음전'); action = 'HOLD'; _techFilterStats['_safety_macdNeg'] = (_techFilterStats['_safety_macdNeg']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', 'MACD 5봉 연속 음전', ''); } }
          if (_sfW.ma60resist && action === 'BUY' && adv.maAlign.ma60 != null && adv.price < adv.maAlign.ma60) { const d60 = ((adv.maAlign.ma60 - adv.price) / adv.price) * 100; if (d60 < 2 && rawScore < th.buyTh + 4) { reasons.push('MA60저항'); action = 'HOLD'; _techFilterStats['_safety_ma60resist'] = (_techFilterStats['_safety_ma60resist']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `MA60 저항 (현재가 -${d60.toFixed(1)}%)`, ''); } }
          // [S452] 분석엔진(3257-3265)과 강등 미러 — bb/pivot/_fakeBreak/_volResist는 calcAllScreener base에 존재해 워커에서도 동작. 토글 ON/OFF 반영.
          if (_sfW.bbUpper && action === 'BUY' && adv.bb && adv.bb.upper != null && adv.price >= adv.bb.upper) { reasons.push('BB상단이탈'); action = 'HOLD'; _techFilterStats['_safety_bbUpper'] = (_techFilterStats['_safety_bbUpper']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', 'BB 상단 이탈 (과열)', ''); }
          if (_sfW.resistNear && action === 'BUY' && adv.pivot && adv.pivot.R1 != null && adv.price < adv.pivot.R1 && ((adv.pivot.R1 - adv.price) / adv.price) * 100 <= 1.5) { reasons.push('저항근접'); action = 'HOLD'; _techFilterStats['_safety_resistNear'] = (_techFilterStats['_safety_resistNear']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '피벗 R1 저항 1.5% 이내', ''); }
          if (_sfW.fakeBreakout && action === 'BUY' && adv._fakeBreak) { reasons.push('가짜돌파MA' + adv._fakeBreak.ma); action = 'HOLD'; _techFilterStats['_safety_fakeBreakout'] = (_techFilterStats['_safety_fakeBreakout']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `가짜 저항 돌파 (MA${adv._fakeBreak.ma})`, ''); }
          if (_sfW.volResist && action === 'BUY' && adv._volResist) { reasons.push('매물대저항'); action = 'HOLD'; _techFilterStats['_safety_volResist'] = (_techFilterStats['_safety_volResist']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '매물대 저항 (머리 위 매물 집중)', ''); }
          // [S453] 추격금지 — MA20 이격도 +20%↑ 과열 (추격매수 위험 = 일시정지)
          if (_sfW.chaseGuard && action === 'BUY' && adv.maDisparity && adv.maDisparity.disparity20 != null && adv.maDisparity.disparity20 >= 20) { reasons.push('추격금지'); action = 'HOLD'; _techFilterStats['_safety_chaseGuard'] = (_techFilterStats['_safety_chaseGuard']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `추격금지 (MA20 이격 +${adv.maDisparity.disparity20.toFixed(0)}%)`, ''); }
          // [S454] 되돌림주의 — 천정/투매 위험(정지)
          if (_sfW.dumpWarn && action === 'BUY' && _dumpWW && _dumpWW.on) { reasons.push('되돌림주의'); action = 'HOLD'; _techFilterStats['_safety_dumpWarn'] = (_techFilterStats['_safety_dumpWarn']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '되돌림주의 (천정/투매 위험)', ''); }
          // [S468] 데드크로스 — MA5가 MA20 아래로 최근 3봉 내 하향교차 (분석엔진 _maDeadCross 미러, lookback=2)
          if (_sfW.deadCrossGuard && action === 'BUY' && typeof _maDeadCross === 'function' && _maDeadCross((candles && candles.length ? candles.map(c=>c.close) : []), 5, 20, 2).crossed) { reasons.push('데드크로스'); action = 'HOLD'; _techFilterStats['_safety_deadCrossGuard'] = (_techFilterStats['_safety_deadCrossGuard']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', 'MA5×MA20 데드크로스', ''); }
          // [S469] 지지선 이탈 — 종가가 MA20/MA60 최근 3봉 내 하향 이탈 (분석엔진 미러, lookback=2). short=1=종가.
          if (_sfW.supportBreak && action === 'BUY' && typeof _maDeadCross === 'function') { const _clSB = (candles && candles.length ? candles.map(c=>c.close) : []); if (_maDeadCross(_clSB, 1, 20, 2).crossed || _maDeadCross(_clSB, 1, 60, 2).crossed) { reasons.push('지지선이탈'); action = 'HOLD'; _techFilterStats['_safety_supportBreak'] = (_techFilterStats['_safety_supportBreak']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '종가 MA20/60 하향이탈', ''); } }
          if (action === 'BUY' && adv.candle.strongest) { const cn = adv.candle.strongest.name || ''; if (cn.includes('이브닝') || cn.includes('슈팅')) { reasons.push(cn); action = 'HOLD'; _techFilterStats['_safety_bearCandle'] = (_techFilterStats['_safety_bearCandle']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', `약세 캔들: ${cn}`, ''); } }
          if ((_sfW.bearEngulf !== false) && action === 'BUY' && Array.isArray(adv.candle.patterns) && adv.candle.patterns.some(p => p && p.name === '하락장악')) { reasons.push('하락장악'); action = 'HOLD'; _techFilterStats['_safety_bearEngulf'] = (_techFilterStats['_safety_bearEngulf']||0)+1; if (_isTraced2) _trace('안전필터', '⚠️ 강등', '하락장악(bearish engulfing)', ''); } // [S527]
          if (_isTraced2) _trace('최종 결과', action === 'BUY' ? '🟢 BUY' : action === 'SELL' ? '🔴 SELL' : '🟡 HOLD', `최종 action: ${action}`, '');

          // [S426] C 캡 전용 위반 전수 수집 — 메인 scrQuickScore 미러. (_sfW는 위 강등 패스에서 정의 — [S452])
          //   [S452→S459] 강등 패스도 _sfW 게이트 적용으로 통일(분석탭 일치). _safety_clean 카운트는 reasons(첫강등서 멈춤) 대신 _safetyViol(켠 16종 전수·action무관) 사용.
          const _safetyViol = [];
          { // [S427] _wasBuyW 게이트 제거 — 메인 동기화 (action 기준≠C 4축 매수 판정)
            if (_sfW.threshold && rawScore < th.buyTh + 2) _safetyViol.push('🔒임계값');
            { const _vf2 = _scrVolFilter(volSoft, currentTF);
              if (_sfW.volExtreme && volSoft >= _vf2.hard) _safetyViol.push('🔒변동성극단');
              else if (_sfW.volHigh && volSoft >= _vf2.softTh && rawScore < th.buyTh + _vf2.bonus) _safetyViol.push('🔒변동성과다');
            }
            if (_sfW.rsiDiv && adv.rsi.div === 'bearish') _safetyViol.push('🔒RSI다이버전스');
            if (_sfW.stochRsi && adv.stoch.k > 90 && adv.rsi.val < 60) _safetyViol.push('🔒Stoch/RSI괴리');
            if (_sfW.macdNeg && adv.macd.hist < 0) { const _h5 = adv.macd.arr.hist; if (_h5.length >= 5 && _h5.slice(-5).every(v => v < 0)) _safetyViol.push('🔒MACD음전'); }
            if (_sfW.ma60resist && adv.maAlign.ma60 != null && adv.price < adv.maAlign.ma60) { const _d60v = ((adv.maAlign.ma60 - adv.price) / adv.price) * 100; if (_d60v < 2 && rawScore < th.buyTh + 4) _safetyViol.push('🔒MA60저항'); }
            if (_sfW.bbUpper && adv.bb && adv.bb.upper != null && adv.price >= adv.bb.upper) _safetyViol.push('🔒BB상단이탈');
            if (_sfW.resistNear && adv.pivot && adv.pivot.R1 != null && adv.price < adv.pivot.R1 && ((adv.pivot.R1 - adv.price) / adv.price) * 100 <= 1.5) _safetyViol.push('🔒저항근접');
            if (_sfW.fakeBreakout && adv._fakeBreak) _safetyViol.push('🔒가짜돌파MA' + adv._fakeBreak.ma); // [S452] 엔진 패스2 미러
            if (_sfW.volResist && adv._volResist) _safetyViol.push('🔒매물대저항'); // [S452] 엔진 패스2 미러
            if (_sfW.chaseGuard && adv.maDisparity && adv.maDisparity.disparity20 != null && adv.maDisparity.disparity20 >= 20) _safetyViol.push('🔒추격금지'); // [S453]
            if (_sfW.dumpWarn && _dumpWW && _dumpWW.on) _safetyViol.push('🔒되돌림주의'); // [S454]
            if (_sfW.deadCrossGuard && typeof _maDeadCross === 'function' && _maDeadCross((candles && candles.length ? candles.map(c=>c.close) : []), 5, 20, 2).crossed) _safetyViol.push('🔒데드크로스'); // [S468]
            if (_sfW.supportBreak && typeof _maDeadCross === 'function') { const _clSB2 = (candles && candles.length ? candles.map(c=>c.close) : []); if (_maDeadCross(_clSB2, 1, 20, 2).crossed || _maDeadCross(_clSB2, 1, 60, 2).crossed) _safetyViol.push('🔒지지선이탈'); } // [S469]
            // [S452] 재무건전성/외국인매도/고베타 = 분석탭 전용 안전필터 → 스캐너(종목검색)에서 제외.
            //   (워커 스캔엔 _debtRatio/_foreignConsecSell/_beta 미생성이라 어차피 no-op이었음. 재무는 분석탭 render에서 DART로 적용, 외인은 KIS·베타는 데이터 연결 시)
            if (adv.candle.strongest) { const _cnv = adv.candle.strongest.name || ''; if (_cnv.includes('이브닝') || _cnv.includes('슈팅')) _safetyViol.push('🔒' + _cnv); }
            if (Array.isArray(adv.candle.patterns) && adv.candle.patterns.some(p => p && p.name === '하락장악')) _safetyViol.push('🔒하락장악'); // [S527]
          }

          // S80: 3단 점수
          // [S527] 추가하락 차감 미러 (엔진 scrQuickScore와 동일: 패턴당 −5, 상한 −20). qs.score·aTimingOn에 반영 → 전광판/조건검색도 분석탭과 일치.
          let _aBearN = 0, _aBearPenalty = 0; // [S528] qs 노출용 미러
          {
            const _BEAR_CONT = ['데드크로스','지지선이탈','RSI다이버전스','MACD음전','MA60저항','매물대저항','되돌림주의','이브닝','슈팅','하락장악','가짜돌파']; // [S529] 가짜돌파 추가 (엔진 미러)
            _aBearN = _safetyViol.filter(v => _BEAR_CONT.some(k => v.indexOf(k) >= 0)).length;
            _aBearPenalty = Math.min(_aBearN * 5, 20);
            if (_aBearPenalty > 0) rawScore = Math.max(0, rawScore - _aBearPenalty);
          }
          const _ready = (typeof scrReadyScore === 'function') ? scrReadyScore(adv) : {score:0,notes:[]};
          const _entryS = (typeof scrEntryScore === 'function') ? scrEntryScore(adv) : {score:0,notes:[]};
          const _upsideS = (typeof scrUpsideScore === 'function') ? scrUpsideScore(adv) : {score:0,notes:[]}; // [S357] 미러
          const _trendP = (typeof scrTrendPure === 'function') ? scrTrendPure(adv) : {score:rawScore, parts:[]}; // [S406] trendPure 점수 — qs.trendScore가 rawScore와 분리됨

          const qs = {
            score: rawScore, action, reasons, ind: adv, regime: adv.regime,
            volSoft: volSoft, // S86: ATR.soften 평활값 전달
            _breakdown: null, // S86: breakdown 전달 (아래에서 설정)
            readyScore: _ready.score, readyNotes: _ready.notes,
            entryScore: _entryS.score, entryNotes: _entryS.notes,
            upsideScore: _upsideS.score, upsideNotes: _upsideS.notes, // [S357] 추가상승
            trendScore: (_trendP && _trendP.score != null) ? _trendP.score : rawScore, // [S406] rawScore→trendPure (분석탭 '추세 방향'과 정합)
            rsiDiv: adv.rsi.div, obvDiv: adv.obv.div, pullback: adv.pullback, candle: adv.candle,
            squeeze: adv.squeeze?.squeeze || false, maAlignBull: adv.maAlign.bullish, maAlignBear: adv.maAlign.bearish,
            ltAlign: (typeof _ltAlignStr === 'function') ? _ltAlignStr(adv.maAlignLT) : 'off', // [S509] 장기 정배열 게이트 미러
            aTimingOn: rawScore >= th.buyTh + (typeof SCR_TIMING_GATE_MARGIN === 'number' ? SCR_TIMING_GATE_MARGIN : 15), // [S512→S514] A 강발화 미러 (buyTh+α)
            bearCont: { n: _aBearN, penalty: _aBearPenalty }, // [S528] 추가하락 표시용 미러 (엔진 qs와 동일 shape)
            above60: adv.maAlign.ma60 != null && adv.price > adv.maAlign.ma60, volRatio: adv.volPattern.volRatio,
            pbScore: adv.pullback ? adv.pullback.score : 0, rsiVal: adv.rsi.val, stochK: adv.stoch.k,
            macdCrossUp: adv.macd.arr.hist.length >= 2 && adv.macd.hist > 0 && adv.macd.arr.hist[adv.macd.arr.hist.length - 2] <= 0,
            macdCrossDown: adv.macd.arr.hist.length >= 2 && adv.macd.hist < 0 && adv.macd.arr.hist[adv.macd.arr.hist.length - 2] >= 0,
          };
          qs._breakdown = _breakdown || null; // S86: breakdown 설정
          qs._safetyViol = _safetyViol; // [S426] C 캡 전용 안전필터 위반 목록
          s._score = qs.score; s._action = qs.action; s._reasons = qs.reasons; s._regime = qs.regime;
          s._mkt = currentMarket;
          s._smartTags = scrSmartFilterCheck(qs); s._filterScore = scrSmartFilterScore(s._smartTags);
          s._scanResult = qs;
          // [S349] 스캔 시점 TF 기록 (메인 sx_screener.html 미러) — 분석탭 TF 전환 시 재계산 유도
          if(qs && typeof qs === 'object') qs._scanTF = currentTF;

          // BT 동시 실행
          try {
            const rawRows = candles.map(c => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
            if (rawRows.length >= 60 && typeof SXE !== 'undefined' && SXE.runBtEngine) {
              // [BT-실시간 미러링] applyRegimeAdjust:true → 분석엔진과 일치
              //   스캐너에서 미리 계산한 BT 결과가 분석탭 진입 시 BT 결과와 같아야 일관됨.
              //   sx_bt.js의 btGetOpts()와 동일 정책 적용.
              const btResult = SXE.runBtEngine(rawRows, currentTF, {}, { applyRegimeAdjust: true });
              if (btResult && !btResult.error) {
                s._btResult = btResult;
                s._btScore = calcBtScore(btResult, s);
                // S82: BT 점수 히스토리 기반 전이 통계 산출
                if (btResult.scores && btResult.scores.length >= 20) {
                  s._btTransitionStats = _calcTransitionStats(btResult.scores, btResult.trades, btResult.scores3);
                }
                // [v2.0] 4축 룰 + 모멘텀 보정 — scan_worker도 분석탭과 동일 입력 사용
                //   v1.x supervisorJudge/unifiedVerdict 폐기 → unifiedVerdictV2 직접 호출
                //   목적: 스캔 시점 판정과 분석탭 재판정의 정합성 보장
                try {
                  // 모멘텀 — 분석탭과 동일하게 80봉 이상일 때만 산출
                  const _svMom = (rawRows.length >= 80 && SXE.scoreMomentum) ?
                    SXE.scoreMomentum(rawRows, currentTF, 5) : null;
                  s._scoreMomentum = _svMom; // 결과탭 → 분석탭 진입 시 재활용 (정합성)
                  // BT 상태 분류
                  const _btSt = (typeof btGetCurrentState === 'function') ?
                    btGetCurrentState(btResult, s.price ?? adv.price) : null;
                  let _btStateKey = 'waiting';
                  if (_btSt) {
                    if (_btSt.state === 'holding' && _btSt._isBuySignal) _btStateKey = 'buy_signal';
                    else if (_btSt.state === 'holding') _btStateKey = 'holding';
                    else if (_btSt.state === 'sell_signal') _btStateKey = 'sell_signal';
                  }
                  // 4축 점수 수집
                  const _scores4 = {
                    readyScore: qs ? (qs.readyScore ?? 0) : 0,
                    entryScore: qs ? (qs.entryScore ?? 0) : 0,
                    trendScore: qs ? (qs.trendScore ?? qs.score ?? 0) : 0,
                    upsideScore: qs ? (qs.upsideScore ?? 0) : 0,        // [S357] 추가상승
                    maAlignBull: qs ? (qs.maAlignBull === true) : false, // [S357] 정배열 여부
                    ltAlign: qs ? (qs.ltAlign || 'off') : 'off', // [S509] 장기 정배열 게이트
                    aTimingOn: qs ? qs.aTimingOn : undefined, // [S512] A 타이밍 발화 게이트
                    btScore:    s._btScore != null ? s._btScore : 0,
                    safetyViol: qs && Array.isArray(qs._safetyViol) ? qs._safetyViol : [] // [S426] 안전필터 위반 → C 캡/익절힌트
                  };
                  // BT 상태 객체에 메타 주입 (currentPrice + winRate/totalTrades for partialHint)
                  const _btStForVerdict = _btSt ? Object.assign({}, _btSt, {
                    currentPrice: s.price ?? adv.price,
                    winRate:    btResult ? btResult.winRate : null,
                    totalTrades: btResult ? btResult.totalTrades : null
                  }) : null;
                  // v2.0 통합 판정
                  const _svV = (typeof SXC !== 'undefined' && SXC.unifiedVerdictV2) ?
                    SXC.unifiedVerdictV2(_btStateKey, _scores4, _svMom, _btStForVerdict) : null;
                  if (_svV) {
                    s._svVerdict = _svV; // 결과탭 C 아이콘/차트 마커용
                    s._btState = _btSt;  // 분석탭 진입 시 재활용 가능
                    s._btAction = (SXC.mapVerdictToBtAction) ? SXC.mapVerdictToBtAction(_svV.action) : null;
                  } else {
                    s._btAction = null;
                  }
                } catch (_cErr) {
                  // SXC 미로드/판정 실패 등 안전망 — _btAction null로 두고 스킵
                  s._btAction = null;
                }
              }
            }
          } catch (_) {}
        }

        if (!s._mkt) s._mkt = currentMarket;

        // 액션/점수/엔진/BT 필터
        // [v2.3 deprecated] _signal_action 항목은 조건 트리에서 제거됨 (종합행동지침으로 대체).
        //   저장된 옛 프리셋의 하위 호환을 위해 필터 로직은 유지 — 새 프리셋은 이 값 미사용.
        const _sigFilter = activeFilters.find(f => f.id === '_signal_action');
        if (_sigFilter && _sigFilter.value && _sigFilter.value !== '설정안함') { if (!s._action) continue; if (s._action !== _sigFilter.value) continue; }
        const _scoreFilter = activeFilters.find(f => f.id === 'score_range');
        // [S406] '추세 방향 점수' = trendScore(trendPure) 평가. (A-1 이전엔 score=trendScore=rawScore라 s._score로 무방했으나,
        //   A-1[S401]에서 추세방향이 trendPure로 분리됨 → s._score(rawScore=진입)가 아닌 trendScore를 평가해야 분석탭 '추세 방향'과 일치)
        if (_scoreFilter && _scoreFilter.value) { const sc = (s._scanResult && s._scanResult.trendScore != null) ? s._scanResult.trendScore : s._score; if (sc == null) continue; if (_scoreFilter.value.min !== null && sc < _scoreFilter.value.min) continue; if (_scoreFilter.value.max !== null && sc > _scoreFilter.value.max) continue; }
        // S80: 3단 점수 필터
        const _readyF = getFilter('_ready_score');
        if (_readyF && _readyF.value && s._scanResult) { const rs = s._scanResult.readyScore ?? 0; if (_readyF.value.min !== null && rs < _readyF.value.min) continue; if (_readyF.value.max !== null && rs > _readyF.value.max) continue; }
        const _entryF = getFilter('_entry_score');
        if (_entryF && _entryF.value && s._scanResult) { const es = s._scanResult.entryScore ?? 0; if (_entryF.value.min !== null && es < _entryF.value.min) continue; if (_entryF.value.max !== null && es > _entryF.value.max) continue; }
        // [S406] 추가 상승 점수(upsideScore) 평가 — 4축 중 4번째 축
        const _upsideF = getFilter('_upside_score');
        if (_upsideF && _upsideF.value && s._scanResult) { const us = s._scanResult.upsideScore ?? 0; if (_upsideF.value.min !== null && us < _upsideF.value.min) continue; if (_upsideF.value.max !== null && us > _upsideF.value.max) continue; }
        const _trendF = getFilter('_trend_score');
        if (_trendF && _trendF.value && s._scanResult) { const ts = s._scanResult.trendScore ?? 0; if (_trendF.value.min !== null && ts < _trendF.value.min) continue; if (_trendF.value.max !== null && ts > _trendF.value.max) continue; }
        {
          const qs = s._scanResult;
          const _sfClean = getFilter('_safety_clean');
          if (_sfClean && _sfClean.value && _sfClean.value !== '설정안함' && qs) { const cnt = (qs._safetyViol || []).length; /* [S459] reasons(action게이트→첫강등서 멈춤)→_safetyViol(켠 16종 전수·action무관)로 정확 카운트 */ if (_sfClean.value === '클린 (0개)' && cnt !== 0) continue; if (_sfClean.value === '1개 이하' && cnt > 1) continue; if (_sfClean.value === '2개 이하' && cnt > 2) continue; }
          // [S431] 되돌림주의 제외 — 분석탭 헤더 ⚠️되돌림주의 배지와 동일 판정(SXE.calcDumpWarn 단일소스). on이면 제외.
          //   coin 판정만 volaMax(9/7)에 영향 → currentMarket('coin') 전달(국내/미국은 둘 다 7로 무관, 코인만 9).
          const _dumpF = getFilter('_dump_warn');
          if (_dumpF && _dumpF.value && _dumpF.value === '되돌림주의 제외' && qs && typeof SXE !== 'undefined' && SXE.calcDumpWarn) {
            const _dw = SXE.calcDumpWarn(qs.ind && qs.ind.candles, qs.ind, s.changeRate, currentMarket);
            if (_dw && _dw.on) continue;
          }
          const _regF = getFilter('_regime_label');
          if (_regF && _regF.value && _regF.value !== '설정안함' && qs) { const r = qs.regime; if (!r) continue; if (!(r.label || '').includes(_regF.value)) continue; }
          const _sqF = getFilter('_squeeze');
          if (_sqF && _sqF.value && _sqF.value !== '설정안함' && qs) { if (_sqF.value === '스퀴즈 중' && !qs.squeeze) continue; if (_sqF.value === '스퀴즈 아님' && qs.squeeze) continue; }
          const _rdF = getFilter('_rsi_div');
          if (_rdF && _rdF.value && _rdF.value !== '설정안함' && qs) { if (_rdF.value === '강세 다이버전스' && qs.rsiDiv !== 'bullish') continue; if (_rdF.value === '약세 다이버전스' && qs.rsiDiv !== 'bearish') continue; }
          const _odF = getFilter('_obv_div');
          if (_odF && _odF.value && _odF.value !== '설정안함' && qs) { if (_odF.value === '강세 다이버전스' && qs.obvDiv !== 'bullish') continue; if (_odF.value === '약세 다이버전스' && qs.obvDiv !== 'bearish') continue; }
          const _pbF = getFilter('_pullback_score');
          if (_pbF && _pbF.value && qs) { const pb = qs.pbScore ?? 0; if (_pbF.value.min !== null && pb < _pbF.value.min) continue; if (_pbF.value.max !== null && pb > _pbF.value.max) continue; }
        }
        // S79: 비지원 TF에서는 BT 필터 전체 스킵 (결과 노출 유지)
        if(_isBtSupportedTF(currentMarket, currentTF))
        {
          const _btScF = getFilter('_bt_score');
          if (_btScF && _btScF.value) { const bs = s._btScore; if (bs == null) continue; if (_btScF.value.min !== null && bs < _btScF.value.min) continue; if (_btScF.value.max !== null && bs > _btScF.value.max) continue; }
          const _btPnlF = getFilter('_bt_pnl');
          if (_btPnlF && _btPnlF.value) { const bt = s._btResult; if (!bt) continue; if (_btPnlF.value.min !== null && (bt.totalPnl ?? 0) < _btPnlF.value.min) continue; if (_btPnlF.value.max !== null && (bt.totalPnl ?? 0) > _btPnlF.value.max) continue; }
          const _btWrF = getFilter('_bt_winrate');
          if (_btWrF && _btWrF.value) { const bt = s._btResult; if (!bt) continue; if (_btWrF.value.min !== null && bt.winRate < _btWrF.value.min) continue; if (_btWrF.value.max !== null && bt.winRate > _btWrF.value.max) continue; }
          const _btTrF = getFilter('_bt_trades');
          if (_btTrF && _btTrF.value) { const bt = s._btResult; if (!bt) continue; if (_btTrF.value.min !== null && bt.totalTrades < _btTrF.value.min) continue; if (_btTrF.value.max !== null && bt.totalTrades > _btTrF.value.max) continue; }
          const _btMddF = getFilter('_bt_mdd');
          if (_btMddF && _btMddF.value) { const bt = s._btResult; if (!bt) continue; const absMdd = Math.abs(bt.mdd || 0); if (_btMddF.value.min !== null && absMdd < _btMddF.value.min) continue; if (_btMddF.value.max !== null && absMdd > _btMddF.value.max) continue; }
          const _btPfF = getFilter('_bt_pf');
          if (_btPfF && _btPfF.value) { const bt = s._btResult; if (!bt) continue; if (_btPfF.value.min !== null && bt.profitFactor < _btPfF.value.min) continue; if (_btPfF.value.max !== null && bt.profitFactor > _btPfF.value.max) continue; }
          // [v2.3] 종합행동지침 필터: 9종 verdictAction 직접 매칭
          //   우선순위: s._svVerdict.action (9종 원본) → s._btAction (4종 레거시 호환)
          //   〔이력〕 이전: s._btAction 4종 매핑값과 비교 → 9종 선택지와 불일치 발생 (수정됨)
          const _btActF = getFilter('_bt_action');
          if (_btActF && _btActF.value && _btActF.value !== '설정안함') {
            const _verdictVal = (s._svVerdict && s._svVerdict.action) || s._btAction;
            if (!_verdictVal || _verdictVal !== _btActF.value) continue;
          }
          // [v1.9] 방향 전이 필터 — _scoreMomentum.direction과 매칭
          //   배너의 "— 상승 전이중/하락 전이중/횡보" 텍스트와 동일 소스 (render.js 1874행)
          //   매수/관심 프리셋에 자동 결합 → 신호여도 모멘텀 방향이 맞을 때만 통과 (함정 한 번 더 차단)
          const _dirMomF = getFilter('_dir_mom');
          if (_dirMomF && _dirMomF.value && _dirMomF.value !== '설정안함') {
            const _mom = s._scoreMomentum;
            if (!_mom || !_mom.direction) continue;
            const _dirLabel = _mom.direction === 'up' ? '상승 전이중'
                            : _mom.direction === 'down' ? '하락 전이중'
                            : '횡보';
            if (_dirLabel !== _dirMomF.value) continue;
          }
          // [S513] 매수마커 ▲ 필터 — A 기준(s._action==='BUY')으로 통일 = 분석탭 차트 보라 ▲(render _aMk: qs.action 'BUY')와 구성상 동일.
          //   〔변경〕 S474는 C(svVerdict.chartMarker)를 썼으나, 보라 마커를 A 단독으로 확정(사용자 결정) → 차트(A)·조건검색(A) 정합.
          //   s._action='BUY' = 안전필터 통과한 깨끗한 A 매수(🔒 강등 시 action='HOLD'라 자동 제외). 차트 ▲와 1:1 일치.
          const _cBuyMarkerF = getFilter('_c_buy_marker');
          if (_cBuyMarkerF && _cBuyMarkerF.value && _cBuyMarkerF.value !== '설정안함') {
            if (s._action !== 'BUY') continue;
          }
          // [S452] 매도마커 ▼(_c_sell_marker) 조건 삭제 — 사용자 요청. 매수마커 ▲(C 보라)만 유지.
          // [S293 fix] BT 매수마커 필터 — state=holding (포지션 유지 중 전체, 어제 진입 포함)
          //   [이전 버그] _isBuySignal=true → 오늘 진입만 통과, 어제 진입 보유중 누락
          const _btBuyMarkerF = getFilter('_bt_buy_marker');
          if (_btBuyMarkerF && _btBuyMarkerF.value && _btBuyMarkerF.value !== '설정안함') {
            if (!s._btState || s._btState.state !== 'holding') continue;
          }
          // [S293] 오늘 매수진입 필터 — _isBuySignal=true (오늘 날짜 신규 진입만)
          //   BT 매수마커의 하위집합: 포지션 유지 중 + 오늘 진입
          const _btTodayEntryF = getFilter('_bt_today_entry');
          if (_btTodayEntryF && _btTodayEntryF.value && _btTodayEntryF.value !== '설정안함') {
            if (!s._btState || s._btState.state !== 'holding' || !s._btState._isBuySignal) continue;
          }
        }

        // 재무 데이터 필터
        if (_hasAnyFilter(FINANCIAL_FILTER_IDS, getFilter)) {
          try {
            const fin = await fetchFinancialData(s.code, s.market, s.marketCap);
            if (!checkFinancialFilters(fin, getFilter)) continue;
            if (!checkWeek52Filters(s.price, fin, getFilter)) continue;
            s._financial = fin;
          } catch (_) {}
        } else {
          if (!s._financial) fetchFinancialData(s.code, s.market, s.marketCap).then(fin => { if (fin) s._financial = fin; }).catch(() => {});
        }

        // 수급 데이터 필터
        if (_hasAnyFilter(INVESTOR_FILTER_IDS, getFilter) && currentMarket === 'kr') {
          try {
            const inv = await fetchInvestorData(s.code);
            if (!checkInvestorFilters(inv, getFilter)) continue;
            s._investor = inv;
          } catch (_) {}
        }

        searchResults.push(s);
        newFound++;

        // 실시간 결과 전송 (5종목마다) — 슬림 객체로 직렬화
        if (newFound === 1 || newFound % 5 === 0) {
          self.postMessage({ type: 'result_batch', results: _slimResults(searchResults), newFound, alert: true });
        }
      }
      // 배치 간 yield — S74: 초당 5배치 제한 (200ms 딜레이)
      await new Promise(r => setTimeout(r, 200));
    }

    // 순위 필터
    if (_hasAnyFilter(RANK_FILTER_IDS, getFilter)) {
      searchResults = applyRankFilters(searchResults, getFilter);
    }

    // [Phase 4-D] 결과 종목 사후 가격 폴백
    //   기술필터 없을 때(needCandles=false) 캔들을 호출하지 않아 KRX market-cap의 502 시 가격이 0인 채로 결과에 들어가는 케이스 보강
    //   - 결과로 통과한 종목 중 가격 누락된 것만 → 비용 적음 (보통 N개)
    //   - 동시성 5로 제한 (워커 부하 가중 방지)
    //   - currentMarket이 kr일 때만 (us/coin은 자체 경로로 가격 받음)
    if (!_scanAbort && !needCandles && currentMarket === 'kr' && searchResults.length > 0) {
      const needPriceFix = searchResults.filter(s => !s.price || s.price === 0);
      if (needPriceFix.length > 0 && needPriceFix.length <= 100) {
        self.postMessage({ type: 'progress', current: total, total, name: `가격 보강 중... (${needPriceFix.length}종목)` });
        await _runWithLimit(needPriceFix.map(s => async () => {
          try {
            const candles = await fetchCandles(s.code, 30);
            if (candles && candles.length >= 2) {
              const last = candles[candles.length - 1];
              const prev = candles[candles.length - 2];
              if (last.close && !s.price) s.price = last.close;
              if (prev.close && last.close && !s.changeRate) s.changeRate = ((last.close - prev.close) / prev.close) * 100;
              if (last.volume && !s.volume) s.volume = last.volume;
              if (last.close && last.volume && !s.tradeAmount) s.tradeAmount = (last.close * last.volume) / 1000000;
            }
          } catch (_) { /* 캔들도 실패 시 — 가격이 0인 채로 두는 게 차선 */ }
        }), 5);
      }
    }

    // 공시 키워드 필터
    if (!_scanAbort && currentMarket === 'kr') {
      const discFilter = getFilter('disclosure_filter');
      if (discFilter && discFilter.value === true) {
        self.postMessage({ type: 'progress', current: total, total, name: `공시 검증 중... (${searchResults.length}종목)` });
        searchResults = await filterByDisclosure(searchResults, (cur, tot) => {
          self.postMessage({ type: 'progress', current: total, total, name: `공시 검증 ${cur}/${tot}...` });
        });
      }
    }

    // 완료
    const PARALLEL_LABEL = PARALLEL > 1 ? ' x' + PARALLEL : '';
    // [PATCH-14] 결과 0 이고 스캔 풀은 있었다면 탈락 원인 Top3 집계해서 전달
    let _rejectDiag = null;
    if (searchResults.length === 0 && total > 0) {
      const allStats = { ...(_passFilterStats || {}), ...(_techFilterStats || {}) };
      if (_candleFailCount > 0) allStats['_candle_fetch_fail'] = _candleFailCount;
      const sorted = Object.entries(allStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (sorted.length > 0) {
        _rejectDiag = {
          total,
          topReasons: sorted.map(([reason, count]) => ({ reason, count, pct: Math.round(count / total * 100) })),
        };
      }
    }
    // [v3.11] 진단 모달용 — 결과 유무와 무관하게 전체 통계를 항상 전달
    //   결과탭의 [📊 진단] 버튼이 이 데이터로 단계별 표를 그림
    const _scanDiag = {
      total,
      passed: searchResults.length,
      basicFilterStats: { ...(_passFilterStats || {}) },
      techFilterStats: { ...(_techFilterStats || {}) },
      candleFailCount: _candleFailCount,
      traceCode: _traceCode || null,
      traceLog: _traceLog.slice(),
    };
    self.postMessage({
      type: 'done',
      results: _slimResults(searchResults),
      newFound,
      total,
      parallel: PARALLEL,
      message: `완료 — ${searchResults.length}종목 (신규 ${newFound})${PARALLEL_LABEL}`,
      rejectDiag: _rejectDiag,
      scanDiag: _scanDiag, // [v3.11]
    });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message || String(e) });
  }
}

// ═══════════════════════════════════════════════════════════════
//  메시지 핸들러
// ═══════════════════════════════════════════════════════════════
self.onmessage = function (e) {
  const msg = e.data;
  switch (msg.type) {
    case 'start':
      startScan(msg.config);
      break;
    case 'abort':
      _scanAbort = true;
      break;
    case 'pause':
      // Worker에서는 pause/resume을 abort로 대체 (간소화)
      break;
    // ─── [B] calcBtScore 동등성 검증용 — 메인의 SXBtScoreCheck()와 짝 ───
    //   메인이 보낸 테스트 케이스들을 Worker의 calcBtScore로 계산해서 회신.
    //   메인 결과와 비교해 양쪽 함수가 동등하게 동작하는지 검증.
    case 'bt_score_request': {
      try {
        const _cases = (msg && msg.cases) || [];
        const _scores = _cases.map(c => calcBtScore(c));
        self.postMessage({ type: 'bt_score_response', scores: _scores });
      } catch (err) {
        self.postMessage({ type: 'bt_score_response', scores: [], error: err && err.message });
      }
      break;
    }
    // ─── [S304] 변동성 타깃팅 설정 동기화 ───
    //   메인 스레드(sx_screener.html)에서 SXS.setVolTargetSettings 호출 후
    //   워커에도 동일 설정 push → SXE._volTargetCache 갱신.
    //   설계: 워커는 localStorage 접근 불가 → 메인이 변경 시마다 명시적 sync 필요.
    //   호출 시점:
    //     · 메인 페이지 로드 시 (초기 1회)
    //     · 모달 saveVolTargetModal 시 (사용자 변경 후)
    case 'vol_target_sync': {
      try {
        if(typeof SXE !== 'undefined' && SXE._volTargetSetWorker){
          SXE._volTargetSetWorker(msg.settings || null);
        }
      } catch (err) {
        // 조용히 실패 (BT는 OFF로 동작, 위험 없음)
        console.warn('[S304] vol_target_sync 실패:', err && err.message);
      }
      break;
    }
    // ─── [FUTURE-1] case 누락 진단용 — Worker의 모든 필터 처리 함수에서 case 토큰 수집해 회신 ───
    //   메인 스레드의 SXTechCasesCheck()와 짝을 이루어 양쪽 case 목록을 비교 가능하게 함.
    //   주의: Worker는 case를 4개 함수로 분산 처리(checkTechConditions / passFilters /
    //         _checkKisConditions / checkFinancialFilters / applyRankFilters). HTML은 한 함수에 통합.
    //         따라서 정확한 비교를 위해 Worker는 모든 함수에서 수집해 union으로 회신.
    case 'tech_cases_request': {
      try {
        // Worker의 처리 함수 모두에서 case 토큰 수집 (있는 함수만)
        const _fns = [
          typeof checkTechConditions === 'function' ? checkTechConditions : null,
          typeof passFilters === 'function' ? passFilters : null,
          typeof _checkKisConditions === 'function' ? _checkKisConditions : null,
          typeof checkFinancialFilters === 'function' ? checkFinancialFilters : null,
          typeof applyRankFilters === 'function' ? applyRankFilters : null
        ].filter(Boolean);
        const _all = new Set();
        for(const fn of _fns){
          const _src = fn.toString();
          const _matches = _src.match(/case\s+'([a-z_][a-z0-9_]*)'/gi) || [];
          for(const m of _matches){
            _all.add(m.replace(/case\s+'/i, '').replace(/'/g, ''));
          }
        }
        self.postMessage({ type: 'tech_cases_response', cases: [..._all] });
      } catch (err) {
        self.postMessage({ type: 'tech_cases_response', cases: [], error: err && err.message });
      }
      break;
    }
  }
};
