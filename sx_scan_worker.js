// ═══════════════════════════════════════════════════════════════
//  sx_scan_worker.js  v2.0  S103-fix7 Phase3-B-2b
//  v2.0: [감사 리포트 🔴CRITICAL C-1 해결] Worker 스캔 루프 C 매핑 교체
//     1) importScripts에 sx_project_c.js 추가 (DOM 의존성 0 확인 후 Worker import 가능)
//     2) btGetCurrentState 간소화 인라인 (sx_bt.js는 DOM 의존이라 import 불가)
//     3) 레거시 es×bs 4분류 할당 폐기 → SXC.supervisorJudge + unifiedVerdict + mapVerdictToBtAction 체인
//     4) slim 직렬화에 _svVerdict + _btState 추가 (메인 경로 재활용)
//  v1.9  S97: WARN1 BT_SUPPORTED_TF 동기화 주석
//  S84: 전이추이마커(transitionEvents — 실제 zone 전이 발생 봉 기록)
//  S83: 전이구간임계값설정가능(_transZoneTh) + 전이추이타임라인(_calcTransitionTimeline)
//  S82: BT 히스토리 기반 전이 통계 산출 (_calcTransitionStats)
//  S80: 3단 점수 계산(qs→readyScore/entryScore/trendScore) + _slimResults 전달 + 3단 필터
//  S79: BT 비지원 TF에서 BT 필터 스킵 (결과 노출 유지)
//  Web Worker — 스캔 핵심 로직 (메인 스레드 분리)
//  백그라운드 탭에서도 fetch + 점수 계산 지속
//  DOM 접근 불가 → UI 업데이트는 postMessage로 메인에 위임
// ═══════════════════════════════════════════════════════════════

// ── importScripts: 엔진/조건/BT 로드 ──
// 캐시버스터는 메인에서 config.cacheBuster로 전달
// S103-fix7 Phase3-B-2b: sx_project_c.js 추가 로드 (DOM 의존성 0이라 Worker에서도 사용 가능)
//   → Worker 내 SXC.supervisorJudge/unifiedVerdict/mapVerdictToBtAction 직접 호출 가능
let _engineLoaded = false;
function _loadEngines(cacheBuster) {
  if (_engineLoaded) return;
  try {
    importScripts(
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

// 캔들 캐시 (Worker 내)
const candleCache = {};
const _finCache = {};
const _invCache = {};
const _kisDataCache = {};
const FIN_TTL = 86400000;
const KIS_DATA_TTL = 120000;
const DISCLOSURE_TTL = 86400000;
const _discCache = {};

// ── 필터 상수 ──
const FINANCIAL_FILTER_IDS = ['per','pbr','roe','eps','dividend_yield','debt_ratio','week52_high_ratio','week52_low_ratio','revenue_growth','operating_profit_growth','net_income_growth','eps_growth','psr','ev_ebitda','bps','pcr','peg','roa','operating_margin','net_margin','ebitda_margin','current_ratio','interest_coverage'];
const INVESTOR_FILTER_IDS = ['foreign_net_buy','foreign_net_buy_days','inst_net_buy','inst_net_buy_days','program_net_buy','short_ratio'];
const RANK_FILTER_IDS = ['rank_change_rate','rank_volume','rank_trade_amount','rank_market_cap','rank_foreign_ratio','rank_volume_change','rank_volatility'];
const FIN_REPORT_LABELS = {annual:'연간', half:'반기', q1:'1분기', q3:'3분기'};

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
    const res = await fetch(`${WORKER_BASE}/kis/oauth2/tokenP`, {
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
    const res = await fetch(url, {
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
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: '153000', FID_ETC_CLS_CODE: '', FID_PW_DATA_INCU_YN: 'Y', tr_id: 'FHKST03010200' }).catch(() => null),
      _kisGet('/uapi/domestic-stock/v1/quotations/inquire-investor', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_PERIOD_DIV_CODE: 'D', FID_INPUT_DATE_1: _todayStr(), FID_INPUT_DATE_2: _todayStr(), tr_id: 'FHKST01010900' }).catch(() => null),
    ]);
    if (obRes?.output1) {
      const o = obRes.output1;
      const totalBid = Number(o.total_bidp_rsqn || 0);
      const totalAsk = Number(o.total_askp_rsqn || 0);
      result.orderbook = { totalBid, totalAsk, bidAskRatio: totalAsk > 0 ? (totalBid / totalAsk) * 100 : 0 };
    }
    if (ccRes?.output) {
      const c = ccRes.output;
      const buyQty = Number(c.acml_bid_qty || c.seln_cntg_csnu || 0);
      const sellQty = Number(c.acml_ask_qty || c.shnu_cntg_csnu || 0);
      result.conclusion = { tradeStrength: Number(c.tday_rltv || 0), buyRatio: (buyQty + sellQty) > 0 ? (buyQty / (buyQty + sellQty)) * 100 : 50 };
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
    const res = await fetch(WORKER_BASE + '/krx/market-cap');
    if (!res.ok) throw new Error('KRX 응답 오류');
    const json = await res.json();
    if (!json.items && !json.data && !json.OutBlock_1) throw new Error('데이터 형식 오류');
    const raw = json.items || json.OutBlock_1 || json.data || [];
    const krxMap = {};
    raw.forEach(r => { const code = r.ISU_SRT_CD || r.code || ''; if (code) krxMap[code] = r; });

    let slMap = {};
    try {
      const slRes = await fetch(WORKER_BASE + '/krx/stock-list?market=ALL');
      if (slRes.ok) {
        const slJson = await slRes.json();
        (slJson.items || []).forEach(r => {
          const code = r.ISU_SRT_CD || '';
          if (code) slMap[code] = { faceValue: parseNum(r.PARVAL || 0), listShares: parseNum(r.LIST_SHRS || 0) };
        });
      }
    } catch (_) {}

    let shortMap = {};
    try {
      const [stkRes, ksqRes] = await Promise.all([
        fetch(WORKER_BASE + '/krx/short-selling?market=STK').catch(() => null),
        fetch(WORKER_BASE + '/krx/short-selling?market=KSQ').catch(() => null)
      ]);
      const parseShort = async (res) => {
        if (!res || !res.ok) return;
        const d = await res.json();
        const balArr = Array.isArray(d.balance) ? d.balance : (d.balance?.OutBlock_1 || []);
        balArr.forEach(r => { const code = r.ISU_SRT_CD || ''; const ratio = parseFloat(r.BAL_RTO || r.SHORT_BAL_RTO || 0); if (code && ratio > 0) shortMap[code] = ratio; });
      };
      await Promise.all([parseShort(stkRes), parseShort(ksqRes)]);
    } catch (_) {}

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
          marketCap: parseNum(krx.MKTCAP || s.mcap || 0) / (krx.MKTCAP ? 100000000 : 1),
          foreignRatio: parseFloat(s.foreignRatio || 0),
          listedShares: parseNum(krx.LIST_SHRS || 0),
          faceValue: slMap[s.code] ? slMap[s.code].faceValue : 0,
          capital: slMap[s.code] ? (slMap[s.code].faceValue * slMap[s.code].listShares / 100000000) : 0,
          shortBalanceRatio: shortMap[s.code] || 0,
          volumeRatio: 100, sector: krx.IDX_NM || '', _krxLive: krxPrice > 0,
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
            fetch(`${WORKER_BASE}/naver/sise?symbol=${s.code}&timeframe=day&start=${start}&end=${end}`)
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
        faceValue: slMap[r.ISU_SRT_CD || r.code] ? slMap[r.ISU_SRT_CD || r.code].faceValue : 0,
        capital: slMap[r.ISU_SRT_CD || r.code] ? (slMap[r.ISU_SRT_CD || r.code].faceValue * slMap[r.ISU_SRT_CD || r.code].listShares / 100000000) : 0,
        shortBalanceRatio: shortMap[r.ISU_SRT_CD || r.code] || 0,
        volumeRatio: 100, sector: r.IDX_NM || r.sector || '',
      })).filter(s => s.code && s.name);
    }
    _stockMasterCache = { ts: Date.now(), data: master };
    return master;
  } catch (e) {
    // fallback
    const pool = [..._oracleKospi, ..._oracleKosdaq, ..._oracleEtf];
    if (pool.length) return pool.map(s => ({ code: s.code, name: s.name, market: s.market || '', price: 0, changeRate: 0, volume: 0, tradeAmount: s.vol || 0, marketCap: s.mcap || 0, foreignRatio: 0, listedShares: 0, volumeRatio: 100, sector: '' }));
    return null;
  }
}

async function loadCoinMaster() {
  try {
    let pool = [..._oracleCoin];
    if (!pool.length) {
      const allRes = await fetch(WORKER_BASE + '/upbit/market-all');
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
        const res = await fetch(WORKER_BASE + '/upbit/ticker?markets=' + encodeURIComponent(batch.join(',')));
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
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      raw = (json.data || json || []).map(r => ({
        date: r.candle_date_time_kst || r.date || '',
        open: parseFloat(r.opening_price || r.open || 0), high: parseFloat(r.high_price || r.high || 0),
        low: parseFloat(r.low_price || r.low || 0), close: parseFloat(r.trade_price || r.close || 0),
        volume: parseFloat(r.candle_acc_trade_volume || r.volume || 0),
      })).filter(c => c.close > 0).reverse();
    } else if (currentMarket === 'us') {
      const intervalMap = { 'day': '1d', 'week': '1wk', 'month': '1mo' };
      const interval = intervalMap[currentTF] || '1d';
      url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${code}?interval=${interval}&range=6mo`)}`;
      const res = await fetch(url);
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
      })).filter(c => c.close > 0).slice(-count);
    } else if (currentMarket === 'kr' && _kisEnabled) {
      // KIS 캔들
      const isMinute = /^\d+m$/.test(currentTF);
      if (isMinute) {
        const token = await _getKisToken();
        if (!token) return null;
        const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: '153000', FID_ETC_CLS_CODE: '', FID_PW_DATA_INCU_YN: 'Y' }).toString();
        const res = await fetch(`${WORKER_BASE}/kis/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${qs}`, {
          headers: { 'authorization': `Bearer ${await _getKisToken()}`, 'appkey': _kisConfig.appKey, 'appsecret': _kisConfig.appSecret, 'tr_id': 'FHKST03010200', 'Content-Type': 'application/json; charset=utf-8' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const bars = data?.output2;
        if (!bars || !bars.length) return null;
        raw = bars.map(b => ({
          date: (b.stck_bsop_date || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') + ' ' + (b.stck_cntg_hour || '').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2'),
          open: Number(b.stck_oprc || 0), high: Number(b.stck_hgpr || 0), low: Number(b.stck_lwpr || 0), close: Number(b.stck_prpr || b.stck_clpr || 0), volume: Number(b.cntg_vol || b.acml_vol || 0),
        })).filter(c => c.close > 0).reverse().slice(-count);
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
          const res = await fetch(`${WORKER_BASE}/kis/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`, {
            headers: { 'authorization': `Bearer ${await _getKisToken()}`, 'appkey': _kisConfig.appKey, 'appsecret': _kisConfig.appSecret, 'tr_id': 'FHKST03010100', 'Content-Type': 'application/json; charset=utf-8' }
          });
          if (!res.ok) break;
          const data = await res.json();
          const bars = data?.output2;
          if (!bars || !bars.length) break;
          const mapped = bars.map(b => ({
            date: (b.stck_bsop_date || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            open: Number(b.stck_oprc || 0), high: Number(b.stck_hgpr || 0), low: Number(b.stck_lwpr || 0), close: Number(b.stck_clpr || 0), volume: Number(b.acml_vol || 0), foreignExhaustion: 0,
          })).filter(c => c.close > 0);
          allBars = mapped.concat(allBars);
          if (bars.length < KIS_PAGE) break;
          const oldest = bars[bars.length - 1]?.stck_bsop_date;
          if (!oldest) break;
          const od = new Date(oldest.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
          od.setDate(od.getDate() - 1);
          curEnd = od.toISOString().slice(0, 10).replace(/-/g, '');
        }
        const seen = new Set();
        raw = allBars.filter(b => { if (seen.has(b.date)) return false; seen.add(b.date); return true; }).slice(-count);
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
      const res = await fetch(url);
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
      })).filter(c => c.close > 0).slice(-count);
    }
    if (!raw || !raw.length) return null;
    candleCache[cacheKey] = { ts: Date.now(), data: raw };
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
  const priceBasedIds = ['change_rate', 'volume_min', 'trade_amount', 'volume_prev_ratio', 'foreign_ratio', 'price_range', 'trade_amount_24h'];
  const hasAnyPriceFilter = priceBasedIds.some(id => getFilter(id));
  if (hasAnyPriceFilter && s.price === 0 && s.tradeAmount === 0 && s.volume === 0 && s.changeRate === 0 && s.marketCap === 0) return false;

  const mcap = getFilter('market_cap');
  if (mcap && mcap.value) { if (mcap.value.min !== null && s.marketCap < mcap.value.min) return false; if (mcap.value.max !== null && s.marketCap > mcap.value.max) return false; }
  const chg = getFilter('change_rate');
  if (chg && chg.value) { if (chg.value.min !== null && s.changeRate < chg.value.min) return false; if (chg.value.max !== null && s.changeRate > chg.value.max) return false; }
  const vol = getFilter('volume_min');
  if (vol && vol.value) { if (vol.value.min !== null && s.volume < vol.value.min) return false; if (vol.value.max !== null && s.volume > vol.value.max) return false; }
  const ta = getFilter('trade_amount');
  if (ta && ta.value) { if (ta.value.min !== null && s.tradeAmount < ta.value.min) return false; }
  const ta24h = getFilter('trade_amount_24h');
  if (ta24h && ta24h.value) { if (ta24h.value.min !== null && s.tradeAmount < ta24h.value.min) return false; if (ta24h.value.max !== null && s.tradeAmount > ta24h.value.max) return false; }
  const pr = getFilter('price_range');
  if (pr && pr.value) { if (pr.value.min !== null && s.price < pr.value.min) return false; if (pr.value.max !== null && s.price > pr.value.max) return false; }
  const vpRatio = getFilter('volume_prev_ratio');
  if (vpRatio && vpRatio.value) { if (vpRatio.value.min !== null && s.volumeRatio < vpRatio.value.min) return false; if (vpRatio.value.max !== null && s.volumeRatio > vpRatio.value.max) return false; }
  const fr = getFilter('foreign_ratio');
  if (fr && fr.value) { if (fr.value.min !== null && s.foreignRatio < fr.value.min) return false; if (fr.value.max !== null && s.foreignRatio > fr.value.max) return false; }
  const excl = getFilter('exclude_types');
  if (excl && excl.value) {
    if (excl.value.includes('preferred') && s.name.includes('우')) return false;
    if (excl.value.includes('etf') && scanMarket !== 'ETF' && (s.sector === 'ETF' || s.market === 'ETF')) return false;
    if (excl.value.includes('spac') && s.name.includes('스팩')) return false;
  }
  // 시장환경 필터 — Worker에서는 _marketEnvData 스냅샷 사용
  const envState = getFilter('mkt_env_state');
  if (envState && envState.value && envState.value !== '설정안함') {
    if (_marketEnvData) {
      const stateMap = { '강세': 'bull', '약세강세': 'mild_bull', '중립': 'neutral', '약세약세': 'mild_bear', '약세': 'bear' };
      const wanted = envState.value.replace(/\s*\(.*\)/, '').trim();
      const wantedKey = stateMap[wanted] || wanted;
      // MarketEnv.getState 대체
      const curState = _marketEnvData.state?.[currentMarket] || 'neutral';
      if (curState !== wantedKey) return false;
    }
  }
  // 지수 등락률 필터
  const _envRC = (filterId, envKey) => {
    const f = getFilter(filterId);
    if (!f || !f.value) return true;
    const cr = _marketEnvData?.[envKey]?.changeRate ?? null;
    if (cr !== null) { if (f.value.min !== null && cr < f.value.min) return false; if (f.value.max !== null && cr > f.value.max) return false; }
    return true;
  };
  if (!_envRC('mkt_env_kospi_chg', 'kospi')) return false;
  if (!_envRC('mkt_env_kosdaq_chg', 'kosdaq')) return false;
  if (!_envRC('mkt_env_btc_chg', 'btc')) return false;
  if (!_envRC('mkt_env_nasdaq_chg', 'nasdaq')) return false;
  if (!_envRC('mkt_env_sp500_chg', 'sp500')) return false;

  const sect = getFilter('sector');
  if (sect && sect.value && sect.value.length) { if (!sect.value.some(v => s.sector?.includes(v) || s.name?.includes(v))) return false; }
  const ls = getFilter('listed_shares');
  if (ls && ls.value) { if (ls.value.min !== null && (s.listedShares || 0) < ls.value.min) return false; if (ls.value.max !== null && (s.listedShares || 0) > ls.value.max) return false; }
  const vt = getFilter('volume_turnover');
  if (vt && vt.value) { const turnover = (s.listedShares > 0) ? (s.volume / s.listedShares) * 100 : 0; if (vt.value.min !== null && turnover < vt.value.min) return false; if (vt.value.max !== null && turnover > vt.value.max) return false; }
  const fv = getFilter('face_value');
  if (fv && fv.value) { if (fv.value.min !== null && (s.faceValue || 0) < fv.value.min) return false; if (fv.value.max !== null && (s.faceValue || 0) > fv.value.max) return false; }
  const cap = getFilter('capital');
  if (cap && cap.value) { if (cap.value.min !== null && (s.capital || 0) < cap.value.min) return false; if (cap.value.max !== null && (s.capital || 0) > cap.value.max) return false; }
  const fe = getFilter('foreign_exhaustion');
  if (fe && fe.value) { const exh = s._foreignExhaustion || 0; if (fe.value.min !== null && exh < fe.value.min) return false; if (fe.value.max !== null && exh > fe.value.max) return false; }
  const ocr = getFilter('open_change_rate');
  if (ocr && ocr.value) { const rate = s._openChangeRate || 0; if (ocr.value.min !== null && rate < ocr.value.min) return false; if (ocr.value.max !== null && rate > ocr.value.max) return false; }
  const sbr = getFilter('short_balance_ratio');
  if (sbr && sbr.value) { if (sbr.value.min !== null && (s.shortBalanceRatio || 0) < sbr.value.min) return false; if (sbr.value.max !== null && (s.shortBalanceRatio || 0) > sbr.value.max) return false; }
  return true;
}

// checkTechConditions — importScripts로 로드된 엔진의 sma/calcIndicators를 사용
// (이 함수는 메인 HTML과 동일한 로직이지만, Worker 전역의 sma를 참조)
function checkTechConditions(ind, techFilters, getFilter) {
  for (const f of techFilters) {
    const v = f.value;
    if (!v || v === '설정안함') continue;
    switch (f.id) {
      case 'ma_cross': {
        const pairs = { '골든크로스 (5×20)': [ind.ma5, ind.ma20], '데드크로스 (5×20)': [ind.ma5, ind.ma20], '골든크로스 (20×60)': [ind.ma20, ind.ma60], '데드크로스 (20×60)': [ind.ma20, ind.ma60], '골든크로스 (60×120)': [ind.ma60, ind.ma120], '데드크로스 (60×120)': [ind.ma60, ind.ma120] };
        let p = pairs[v];
        if (!p) { const m = v.match(/([골데][든드]크로스)\s*\((\d+)×(\d+)\)/); if (m && ind.closes && ind.closes.length >= parseInt(m[3])) { p = [sma(ind.closes, parseInt(m[2])), sma(ind.closes, parseInt(m[3]))]; } }
        if (!p || p[0] === null || p[1] === null) return false;
        if (v.includes('골든') && p[0] <= p[1]) return false; if (v.includes('데드') && p[0] >= p[1]) return false; break;
      }
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
      case 'macd_signal': { const m = ind.macd; if (v === 'MACD > Signal (매수)' && m.macd <= m.signal) return false; if (v === 'MACD < Signal (매도)' && m.macd >= m.signal) return false; if (v === '골든크로스 (3일 이내)' && !m.recentGolden) return false; if (v === '데드크로스 (3일 이내)' && !m.recentDead) return false; break; }
      case 'macd_histogram': { const h = ind.macd.histogram, ph = ind.macd.prevHist; if (v === '양수 전환' && !(h > 0 && ph <= 0)) return false; if (v === '음수 전환' && !(h < 0 && ph >= 0)) return false; if (v === '양수 증가중' && !(h > 0 && h > ph)) return false; if (v === '음수 감소중' && !(h < 0 && h < ph)) return false; break; }
      case 'rsi_value': if (!rangeCheck(ind.rsi, v)) return false; break;
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
      case 'stoch_cross': { const s = ind.stoch; if (v === '%K > %D (매수)' && s.k <= s.d) return false; if (v === '%K < %D (매도)' && s.k >= s.d) return false; if (v === '골든크로스 (과매도권)' && !(s.prevK < s.prevD && s.k >= s.d && s.k < 30)) return false; if (v === '데드크로스 (과매수권)' && !(s.prevK > s.prevD && s.k <= s.d && s.k > 70)) return false; break; }
      case 'dmi_cross': { const a = ind.adx; if (v === '+DI > -DI (상승)' && a.plusDI <= a.minusDI) return false; if (v === '+DI < -DI (하락)' && a.plusDI >= a.minusDI) return false; if (v === '+DI 골든크로스' && a.plusDI <= a.minusDI) return false; if (v === '+DI 데드크로스' && a.plusDI >= a.minusDI) return false; break; }
      case 'parabolic_sar': { const p = ind.psar; if (v === 'SAR 아래 (상승 추세)' && p.trend !== 'up') return false; if (v === 'SAR 위 (하락 추세)' && p.trend !== 'down') return false; if (v === '상승 전환' && p.trend !== 'up') return false; if (v === '하락 전환' && p.trend !== 'down') return false; break; }
      case 'bb_position': { const b = ind.bb; if (v === '상단 돌파' && b.last <= b.upper) return false; if (v === '상단 근접' && !(b.pctB >= 0.8 && b.pctB <= 1.0)) return false; if (v === '중심선 위' && b.last <= b.middle) return false; if (v === '중심선 아래' && b.last >= b.middle) return false; if (v === '하단 근접' && !(b.pctB >= 0 && b.pctB <= 0.2)) return false; if (v === '하단 이탈' && b.last >= b.lower) return false; break; }
      case 'bb_width': { if (v === '스퀴즈 (수축)' && !ind.bb.isSqueeze) return false; if (v === '확장중' && ind.bb.isSqueeze) return false; break; }
      case 'obv_trend': { const o = ind.obv; if (v === '상승 추세' && o.trend !== 'up') return false; if (v === '하락 추세' && o.trend !== 'down') return false; if (v === 'OBV 다이버전스 (가격↓ OBV↑)' && !o.divergence) return false; break; }
      case 'candle_type': case 'reversal_pattern': case 'continuation_pattern': {
        if (!Array.isArray(v) || v.length === 0) break;
        const _candleIdMap = { long_yang:'장대양봉',long_eum:'장대음봉',doji:'도지',hammer:'해머',shooting_star:'슈팅스타',spinning_top:'스피닝탑',morning_star:'모닝스타',evening_star:'이브닝스타',bullish_engulfing:'상승장악',bearish_engulfing:'하락장악',harami_bull:'하라미상승',harami_bear:'하라미하락',harami_cross:'하라미크로스',piercing:'피어싱라인',dark_cloud:'다크클라우드',inside_day:'인사이드데이',outside_day:'아웃사이드데이',tweezer_bottom:'집게바닥',tweezer_top:'집게천정',three_white:'적삼병',three_black:'흑삼병',gap_up:'갭상승',gap_down:'갭하락',gravestone_doji:'그레이브스톤도지',dragonfly_doji:'드래곤플라이도지',marubozu_bull:'양봉마루보즈',marubozu_bear:'음봉마루보즈',high_wave:'하이웨이브',bullish_counterattack:'상승카운터어택',bearish_counterattack:'하락카운터어택',morning_doji_star:'모닝도지스타',evening_doji_star:'이브닝도지스타',abandoned_baby_bull:'상승어밴던드베이비',abandoned_baby_bear:'하락어밴던드베이비',advance_block:'어드밴스블럭',stalled_pattern:'스톨드패턴',upside_gap_tasuki:'업사이드갭태스키',downside_gap_tasuki:'다운사이드갭태스키' };
        const allPats = ind.patterns.patterns || [];
        const allNames = allPats.map(p => p.name || '');
        if (!v.some(id => { const krName = _candleIdMap[id] || id; return allNames.some(n => n.includes(krName)); })) return false;
        break;
      }
      case 'consecutive_up_down': { const pa = ind.priceAction; if (!pa) break; const days = pa.consecutiveDays; if (typeof v === 'object' && v !== null) { if (v.min !== null && days < v.min) return false; if (v.max !== null && days > v.max) return false; } break; }
      case 'price_vs_ma': { if (v === '설정안함') break; const prc = ind.last || ind.price; if (v === 'MA5 위' && (!ind.ma5 || prc <= ind.ma5)) return false; if (v === 'MA5 아래' && (!ind.ma5 || prc >= ind.ma5)) return false; if (v === 'MA20 위' && (!ind.ma20 || prc <= ind.ma20)) return false; if (v === 'MA20 아래' && (!ind.ma20 || prc >= ind.ma20)) return false; if (v === 'MA60 위' && (!ind.ma60 || prc <= ind.ma60)) return false; if (v === 'MA60 아래' && (!ind.ma60 || prc >= ind.ma60)) return false; if (v === 'MA120 위' && (!ind.ma120 || prc <= ind.ma120)) return false; if (v === 'MA120 아래' && (!ind.ma120 || prc >= ind.ma120)) return false; break; }
      case 'envelope_position': { if (v === '설정안함') break; const env = ind.envelope || ind._advanced?.envelope; if (!env || !env.position) break; const eMap = { '상단 돌파': 'above_upper', '상단 근접': 'near_upper', '중심선 위': 'above_mid', '중심선 아래': 'below_mid', '하단 근접': 'near_lower', '하단 이탈': 'below_lower' }; if (eMap[v] && env.position !== eMap[v]) return false; break; }
      case 'pivot_level': { if (v === '설정안함') break; const pv = ind.pivot || ind._advanced?.pivot; if (!pv || !pv.level) break; const pvMap = { 'R2 이상': 'R2+', 'R1~R2': 'R1~R2', 'P~R1': 'P~R1', 'S1~P': 'S1~P', 'S1~S2': 'S1~S2', 'S2 이하': 'S2-' }; if (pvMap[v] && pv.level !== pvMap[v]) return false; break; }
      case 'price_channel': { if (v === '설정안함') break; const pc = ind.priceChannel || ind._advanced?.priceChannel; if (!pc || !pc.position) break; const pcMap = { '상단 돌파': 'breakout_up', '상단 반': 'upper_half', '하단 반': 'lower_half', '하단 이탈': 'breakout_down' }; if (pcMap[v] && pc.position !== pcMap[v]) return false; break; }
      case 'ma_disparity': { if (v === '설정안함') break; const md = ind.maDisparity || ind._advanced?.maDisparity; if (!md) break; if (v === 'MA20 +5%↑ 과열' && (md.disparity20 == null || md.disparity20 < 5)) return false; if (v === 'MA20 -5%↓ 침체' && (md.disparity20 == null || md.disparity20 > -5)) return false; if (v === 'MA60 +10%↑ 과열' && (md.disparity60 == null || md.disparity60 < 10)) return false; if (v === 'MA60 -10%↓ 침체' && (md.disparity60 == null || md.disparity60 > -10)) return false; if (v === 'MA20 근접 (±2%)' && (md.disparity20 == null || Math.abs(md.disparity20) > 2)) return false; if (v === 'MA60 근접 (±2%)' && (md.disparity60 == null || Math.abs(md.disparity60) > 2)) return false; break; }
      case 'ichimoku_cloud': { if (v === '설정안함') break; const ic = ind.ichimoku || ind._advanced?.ichimoku; if (!ic) break; if (v === '구름 위 (강세)' && ic.priceVsCloud !== 'above') return false; if (v === '구름 안 (중립)' && ic.priceVsCloud !== 'inside') return false; if (v === '구름 아래 (약세)' && ic.priceVsCloud !== 'below') return false; break; }
      case 'ichimoku_cross': { if (v === '설정안함') break; const ic2 = ind.ichimoku || ind._advanced?.ichimoku; if (!ic2 || ic2.tenkan == null || ic2.kijun == null) break; if (v === '전환선 > 기준선 (매수)' && ic2.tenkan <= ic2.kijun) return false; if (v === '전환선 < 기준선 (매도)' && ic2.tenkan >= ic2.kijun) return false; break; }
      case 'ichimoku_twist': { if (v === '설정안함') break; const ic3 = ind.ichimoku || ind._advanced?.ichimoku; if (!ic3) break; if (v === '양운 전환 (상승)' && !(ic3.cloudTrend === 'twist' && ic3.cloud === 'bullish')) return false; if (v === '음운 전환 (하락)' && !(ic3.cloudTrend === 'twist' && ic3.cloud === 'bearish')) return false; break; }
      case 'ichimoku_chikou': { if (v === '설정안함') break; const ic4 = ind.ichimoku || ind._advanced?.ichimoku; if (!ic4) break; const chikouRows = ind._advanced?.rows || ind.candles; if (!chikouRows || chikouRows.length < 27) break; const past26c = chikouRows[chikouRows.length - 27].close; if (v === '26봉 전 가격 위 (강세)' && ic4.chikou <= past26c) return false; if (v === '26봉 전 가격 아래 (약세)' && ic4.chikou >= past26c) return false; break; }
      case 'volume_ma_arr': { if (v === '설정안함') break; const vm = ind.volumeMA || ind._advanced?.volumeMA; if (!vm) break; if (v === '정배열 (5>20>60)' && vm.arrangement !== 'bullish') return false; if (v === '역배열 (5<20<60)' && vm.arrangement !== 'bearish') return false; if (v === '20일 MA 돌파' && !vm.breakout) return false; break; }
      case 'ad_trend': { if (v === '설정안함') break; const adv = ind.ad || ind._advanced?.ad; if (!adv) break; if (v === '상승 추세' && adv.trend !== 'up') return false; if (v === '하락 추세' && adv.trend !== 'down') return false; if (v === '다이버전스 (가격↓ AD↑)' && !adv.divergence) return false; break; }
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
async function fetchFinancialData(code, market) {
  if (_finCache[code] && Date.now() - _finCache[code].ts < FIN_TTL) return _finCache[code].data;
  const result = { per: null, pbr: null, roe: null, eps: null, dividendYield: null, debtRatio: null, week52High: null, week52Low: null, revenue: null, operatingIncome: null, netIncome: null, totalAssets: null, totalDebt: null, totalEquity: null, revenuePrev: null, operatingIncomePrev: null, netIncomePrev: null, revenuePrev2: null, operatingIncomePrev2: null, netIncomePrev2: null, revenueGrowth: null, opIncomeGrowth: null, netIncomeGrowth: null, epsGrowth: null, roa: null, operatingMargin: null, netMargin: null, ebitdaMargin: null, psr: null, evEbitda: null, bps: null, pcr: null, peg: null, currentRatio: null, interestCoverage: null, _source: 'none' };
  try {
    if (market === 'us' || currentMarket === 'us') {
      const resp = await fetch(`${WORKER_BASE}/fundamental?ticker=${encodeURIComponent(code)}`);
      if (resp.ok) {
        const d = await resp.json();
        result.per = parseFloat(d.trailingPE) || null; result.pbr = parseFloat(d.priceToBook) || null; result.eps = parseFloat(d.trailingEps) || null;
        if (d.dividendRaw) { const ym = d.dividendRaw.match(/([\d.]+)%/); if (ym) result.dividendYield = parseFloat(ym[1]); }
        if (d.fiftyTwoWeekRange) { const parts = d.fiftyTwoWeekRange.replace(/,/g, '').split('-').map(s => parseFloat(s.trim())); if (parts.length === 2) { result.week52Low = parts[0]; result.week52High = parts[1]; } }
        result._source = 'yahoo';
      }
    } else {
      // DART → 네이버 폴백 (간소화 — Worker에서 searchResults 참조 불가이므로 price/mcap은 _scanStock에서 전달)
      let dartOk = false;
      try { dartOk = await _fetchDartFinancial(code, result); } catch (_) {}
      if (!dartOk || result.per == null) { try { await _fetchNaverFinancial(code, result); } catch (_) {} }
      if (result.dividendYield == null) {
        try {
          const resp = await fetch(`${WORKER_BASE}/naver/finance?symbol=${code}&fin_type=4&freq=Y`);
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

async function _fetchDartFinancial(code, result) {
  const thisYear = new Date().getFullYear();
  const yearCandidates = (_finReportType === 'annual') ? [thisYear - 1, thisYear - 2] : [thisYear, thisYear - 1];
  let data = null;
  for (const yr of yearCandidates) {
    const resp = await fetch(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${yr}&report=${_finReportType}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) continue;
    const d = await resp.json();
    if (d.items && d.items.length > 0) { data = d; break; }
  }
  if (!data && _finReportType !== 'annual') {
    for (const yr of [thisYear - 1, thisYear - 2]) {
      const resp = await fetch(`${WORKER_BASE}/dart/finance?stock_code=${code}&year=${yr}&report=annual`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const d = await resp.json();
      if (d.items && d.items.length > 0) { data = d; data._fallbackAnnual = true; break; }
    }
  }
  if (!data || !data.items || !data.items.length) return false;
  const find = (keywords) => { for (const kw of keywords) { const row = data.items.find(r => r.account && r.account.replace(/\s/g, '').includes(kw)); if (row) return row; } return null; };
  const parseAmt = (v) => { if (!v || v === '' || v === 'N/A') return null; return parseFloat(String(v).replace(/,/g, '')) || null; };
  const revenueRow = find(['매출액', '수익(매출액)', '영업수익', '매출']);
  const opIncRow = find(['영업이익', '영업이익(손실)']);
  const netIncRow = find(['당기순이익', '당기순이익(손실)', '분기순이익']);
  const assetRow = find(['자산총계']); const debtRow = find(['부채총계']); const equityRow = find(['자본총계']);
  result.revenue = revenueRow ? parseAmt(revenueRow.current) : null; result.revenuePrev = revenueRow ? parseAmt(revenueRow.previous) : null; result.revenuePrev2 = revenueRow ? parseAmt(revenueRow.beforePrev) : null;
  result.operatingIncome = opIncRow ? parseAmt(opIncRow.current) : null; result.operatingIncomePrev = opIncRow ? parseAmt(opIncRow.previous) : null;
  result.netIncome = netIncRow ? parseAmt(netIncRow.current) : null; result.netIncomePrev = netIncRow ? parseAmt(netIncRow.previous) : null;
  result.totalAssets = assetRow ? parseAmt(assetRow.current) : null; result.totalDebt = debtRow ? parseAmt(debtRow.current) : null; result.totalEquity = equityRow ? parseAmt(equityRow.current) : null;
  if (result.revenue && result.revenuePrev && result.revenuePrev !== 0) result.revenueGrowth = ((result.revenue - result.revenuePrev) / Math.abs(result.revenuePrev)) * 100;
  if (result.operatingIncome && result.operatingIncomePrev && result.operatingIncomePrev !== 0) result.opIncomeGrowth = ((result.operatingIncome - result.operatingIncomePrev) / Math.abs(result.operatingIncomePrev)) * 100;
  if (result.netIncome && result.netIncomePrev && result.netIncomePrev !== 0) result.netIncomeGrowth = ((result.netIncome - result.netIncomePrev) / Math.abs(result.netIncomePrev)) * 100;
  if (result.totalEquity && result.totalDebt) result.debtRatio = (result.totalDebt / result.totalEquity) * 100;
  if (result.netIncome && result.totalEquity && result.totalEquity !== 0) result.roe = (result.netIncome / result.totalEquity) * 100;
  if (result.netIncome && result.totalAssets && result.totalAssets !== 0) result.roa = (result.netIncome / result.totalAssets) * 100;
  if (result.revenue && result.revenue !== 0) {
    if (result.operatingIncome != null) result.operatingMargin = (result.operatingIncome / result.revenue) * 100;
    if (result.netIncome != null) result.netMargin = (result.netIncome / result.revenue) * 100;
    if (result.operatingIncome != null) result.ebitdaMargin = (result.operatingIncome / result.revenue) * 100;
  }
  if (result.totalAssets && result.totalDebt && result.totalDebt > 0) result.currentRatio = (result.totalAssets / result.totalDebt) * 100;
  result._source = 'dart';
  result._reportType = data._fallbackAnnual ? 'annual' : (data.report || _finReportType);
  result._reportLabel = FIN_REPORT_LABELS[result._reportType] || '연간';
  if (data._fallbackAnnual) result._reportLabel += ' (폴백)';
  return true;
}

async function _fetchNaverFinancial(code, result) {
  const resp = await fetch(`${WORKER_BASE}/naver/finance?symbol=${code}&fin_type=4&freq=Y`);
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
    const resp = await fetch(`${WORKER_BASE}/naver/investor?symbol=${code}&pageSize=30`);
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
function calcBtScore(btData){
  if(!btData) return null;
  const pnl=btData.totalPnl??0, wr=btData.winRate??0, trades=btData.totalTrades??0, mdd=btData.mdd??0, pf=btData.profitFactor??0;
  if(trades===0) return null;
  let pnlScore; if(pnl>=20)pnlScore=30;else if(pnl>=10)pnlScore=22+(pnl-10)/10*8;else if(pnl>=5)pnlScore=16+(pnl-5)/5*6;else if(pnl>=0)pnlScore=8+pnl/5*8;else if(pnl>=-10)pnlScore=Math.max(0,8+pnl/10*8);else pnlScore=0;
  let wrScore; if(wr>=70)wrScore=25;else if(wr>=60)wrScore=20+(wr-60)/10*5;else if(wr>=50)wrScore=15+(wr-50)/10*5;else if(wr>=40)wrScore=8+(wr-40)/10*7;else wrScore=Math.max(0,wr/40*8);
  let tradeScore; if(trades>=10)tradeScore=15;else if(trades>=5)tradeScore=10+(trades-5)/5*5;else if(trades>=3)tradeScore=5+(trades-3)/2*5;else tradeScore=trades/3*5;
  let mddScore; const absMdd=Math.abs(mdd); if(absMdd<=5)mddScore=15;else if(absMdd<=10)mddScore=12+(10-absMdd)/5*3;else if(absMdd<=20)mddScore=6+(20-absMdd)/10*6;else if(absMdd<=40)mddScore=(40-absMdd)/20*6;else mddScore=0;
  let pfScore; if(pf>=2.0)pfScore=15;else if(pf>=1.5)pfScore=12+(pf-1.5)/0.5*3;else if(pf>=1.0)pfScore=6+(pf-1.0)/0.5*6;else if(pf>=0.5)pfScore=(pf-0.5)/0.5*6;else pfScore=0;
  return Math.round(Math.min(100,Math.max(0,pnlScore+wrScore+tradeScore+mddScore+pfScore)));
}

// ── btGetCurrentState 간소화 인라인 (sx_bt.js는 DOM 의존이라 Worker import 불가) ──
// ── S103-fix7 Phase3-B-2b: Worker의 C 매핑용 btState 생성 ──
// ── 주의: 원본(sx_bt.js:200) 업데이트 시 여기도 동기화 필요 (text/color 등 UI 필드는 불필요하므로 제외) ──
function _btGetRowsLenWorker(btResult){
  if(!btResult) return 0;
  if(typeof btResult.rowsLength === 'number' && btResult.rowsLength > 0) return btResult.rowsLength;
  if(btResult.scores && btResult.scores.length) return btResult.scores.length + 100; // BT_WARMUP fallback
  return 0;
}
function btGetCurrentState(btResult, currentPrice){
  if(!btResult || !btResult.trades || !btResult.trades.length) return { state:'no_data' };
  const lastTrade = btResult.trades[btResult.trades.length - 1];
  const _rowsLen = _btGetRowsLenWorker(btResult);
  // 미청산 포지션 (type==='OPEN') → holding
  if(lastTrade.type === 'OPEN'){
    const pnl = currentPrice > 0 && lastTrade.entry > 0
      ? ((currentPrice - lastTrade.entry) / lastTrade.entry * 100).toFixed(1)
      : lastTrade.pnl.toFixed(1);
    const _isBuySignal = lastTrade.entryIdx != null && _rowsLen > 0 && lastTrade.entryIdx >= _rowsLen - 2;
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
  // 마지막 거래 최근 청산 (2봉 이내) → sell_signal
  if(lastTrade.exitIdx != null && _rowsLen > 0 && lastTrade.exitIdx >= _rowsLen - 2){
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
      else if (prevZone === 'ready') { r2eAttempts++; } // ready에서 다른 곳 = 시도
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
    volumeRatio: s.volumeRatio, faceValue: s.faceValue, capital: s.capital,
    shortBalanceRatio: s.shortBalanceRatio,
    _score: s._score, _action: s._action, _reasons: s._reasons,
    _regime: s._regime ? { label: s._regime.label, icon: s._regime.icon } : null,
    _mkt: s._mkt || 'kr',
    _smartTags: s._smartTags, _filterScore: s._filterScore,
    _btScore: s._btScore, _btAction: s._btAction,
    // S103-fix7 Phase3-B-2b: C 판정 결과 메인 전달 (결과탭 아이콘/차트 마커/재계산 skip용)
    _svVerdict: s._svVerdict ? {
      action: s._svVerdict.action, icon: s._svVerdict.icon, color: s._svVerdict.color,
      chartMarker: s._svVerdict.chartMarker, label: s._svVerdict.label
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
    } : null,
    _financial: s._financial || null,
    _investor: s._investor || null,
    _kisData: s._kisData || null,
    _disclosureKw: s._disclosureKw || null,
    _foreignExhaustion: s._foreignExhaustion || 0,
    _openChangeRate: s._openChangeRate || 0,
  }));
}

// ═══════════════════════════════════════════════════════════════
//  메인 스캔 루프
// ═══════════════════════════════════════════════════════════════
async function startScan(config) {
  // config에서 상태 주입
  WORKER_BASE = config.WORKER_BASE;
  currentMarket = config.currentMarket;
  currentTF = config.currentTF;
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
  _oracleKospi = config.oracleKospi || [];
  _oracleKosdaq = config.oracleKosdaq || [];
  _oracleEtf = config.oracleEtf || [];
  _oracleCoin = config.oracleCoin || [];
  _oracleUsKeys = config.oracleUsKeys || {};
  _stockMasterCache = config.stockMasterCache || null;
  _marketEnvData = config.marketEnvData || null;
  _scanAbort = false;

  // 엔진 로드
  _loadEngines(config.cacheBuster || '1');
  if (!_engineLoaded) return;

  // 엔진에 safetyFlags/regimeAdapt 동기화
  if (typeof SXE !== 'undefined') {
    SXE._safetyFlags = _safetyFlags;
    if (typeof setMarketWeight === 'function') setMarketWeight(currentMarket);
  }

  if (!activeFilters.length) { self.postMessage({ type: 'done', results: [], newFound: 0 }); return; }

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
    const total = pool.length;
    let newFound = 0;
    let searchResults = [];

    const getFilter = (id) => activeFilters.find(f => f.id === id);
    const techFilters = activeFilters.filter(f => { const meta = findCondMeta(f.id); return meta && meta.source === 'calc_candle'; });
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
        if (!passFilters(s, getFilter)) continue;
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
        self.postMessage({ type: 'progress', current: batchIdx[bi] + 1, total, name: s.name });

        let indicators = null, candles = null;
        if (needCandles) {
          try {
            candles = candleResults ? candleResults[bi] : await fetchCandles(s.code, _scCount);
            if (!candles || candles.length < 20) continue;
            indicators = calcIndicators(candles, currentTF);
            if (techFilters.length > 0 && !checkTechConditions(indicators, techFilters, getFilter)) continue;
            s._indicators = indicators;
            if (candles.length > 0) {
              const lastCandle = candles[candles.length - 1];
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
          const { rawScore, mom, osc, _breakdown } = scrComputeScore(adv, volSoft, ctx.bonus);
          const th = _getEffectiveTh(currentTF);
          let action = rawScore >= th.buyTh ? 'BUY' : rawScore <= th.sellTh ? 'SELL' : 'HOLD';
          if (action === 'BUY' && !_scrMomOscPass(mom, osc, currentTF)) action = 'HOLD';
          const reasons = [];
          if (action === 'BUY' && rawScore < th.buyTh + 2) { reasons.push('임계값'); action = 'HOLD'; }
          { const vf = _scrVolFilter(volSoft, currentTF); if (volSoft >= vf.hard) { reasons.push('변동성극단'); action = 'HOLD'; } else if (volSoft >= vf.softTh && action === 'BUY' && rawScore < th.buyTh + vf.bonus) { reasons.push('변동성과다'); action = 'HOLD'; } }
          if (action === 'BUY' && adv.rsi.div === 'bearish') { reasons.push('RSI다이버전스'); action = 'HOLD'; }
          if (action === 'BUY' && adv.stoch.k > 90 && adv.rsi.val < 60) { reasons.push('Stoch/RSI괴리'); action = 'HOLD'; }
          if (action === 'BUY' && adv.macd.hist < 0) { const h = adv.macd.arr.hist; if (h.length >= 5 && h.slice(-5).every(v => v < 0)) { reasons.push('MACD음전'); action = 'HOLD'; } }
          if (action === 'BUY' && adv.maAlign.ma60 != null && adv.price < adv.maAlign.ma60) { const d60 = ((adv.maAlign.ma60 - adv.price) / adv.price) * 100; if (d60 < 2 && rawScore < th.buyTh + 4) { reasons.push('MA60저항'); action = 'HOLD'; } }
          if (action === 'BUY' && adv.candle.strongest) { const cn = adv.candle.strongest.name || ''; if (cn.includes('이브닝') || cn.includes('슈팅')) { reasons.push(cn); action = 'HOLD'; } }

          // S80: 3단 점수
          const _ready = (typeof scrReadyScore === 'function') ? scrReadyScore(adv) : {score:0,notes:[]};
          const _entryS = (typeof scrEntryScore === 'function') ? scrEntryScore(adv) : {score:0,notes:[]};

          const qs = {
            score: rawScore, action, reasons, ind: adv, regime: adv.regime,
            volSoft: volSoft, // S86: ATR.soften 평활값 전달
            _breakdown: null, // S86: breakdown 전달 (아래에서 설정)
            readyScore: _ready.score, readyNotes: _ready.notes,
            entryScore: _entryS.score, entryNotes: _entryS.notes,
            trendScore: rawScore,
            rsiDiv: adv.rsi.div, obvDiv: adv.obv.div, pullback: adv.pullback, candle: adv.candle,
            squeeze: adv.squeeze?.squeeze || false, maAlignBull: adv.maAlign.bullish, maAlignBear: adv.maAlign.bearish,
            above60: adv.maAlign.ma60 != null && adv.price > adv.maAlign.ma60, volRatio: adv.volPattern.volRatio,
            pbScore: adv.pullback ? adv.pullback.score : 0, rsiVal: adv.rsi.val, stochK: adv.stoch.k,
            macdCrossUp: adv.macd.arr.hist.length >= 2 && adv.macd.hist > 0 && adv.macd.arr.hist[adv.macd.arr.hist.length - 2] <= 0,
            macdCrossDown: adv.macd.arr.hist.length >= 2 && adv.macd.hist < 0 && adv.macd.arr.hist[adv.macd.arr.hist.length - 2] >= 0,
          };
          qs._breakdown = _breakdown || null; // S86: breakdown 설정
          s._score = qs.score; s._action = qs.action; s._reasons = qs.reasons; s._regime = qs.regime;
          s._mkt = currentMarket;
          s._smartTags = scrSmartFilterCheck(qs); s._filterScore = scrSmartFilterScore(s._smartTags);
          s._scanResult = qs;

          // BT 동시 실행
          try {
            const rawRows = candles.map(c => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
            if (rawRows.length >= 60 && typeof SXE !== 'undefined' && SXE.runBtEngine) {
              const btResult = SXE.runBtEngine(rawRows, currentTF, {});
              if (btResult && !btResult.error) {
                s._btResult = btResult;
                s._btScore = calcBtScore(btResult);
                // S82: BT 점수 히스토리 기반 전이 통계 산출
                if (btResult.scores && btResult.scores.length >= 20) {
                  s._btTransitionStats = _calcTransitionStats(btResult.scores, btResult.trades, btResult.scores3);
                }
                // S103-fix7 Phase3-B-2b: 레거시 es×bs 4분류 폐기 → C 매핑으로 교체
                //   [감사 결과: 🔴CRITICAL C-1] Worker 스캔 시점 _btAction 정합성 복구
                //   Worker는 importScripts로 sx_project_c.js 로드 → SXC.* 직접 사용 가능
                //   주의: 스캔 단계는 _scoreMomentum 미수집 → null 전달 (supervisorJudge 방어코드로 flat 처리)
                try {
                  const _svAnalScore = qs.readyScore ?? qs.score ?? 0;
                  const _svMom = null; // 스캔 단계 모멘텀 미수집
                  const _svRr = (SXE.calcTpSlRr && adv) ?
                    (SXE.calcTpSlRr(s.price ?? adv.price, adv, qs, currentTF)?.rr ?? 0) : 0;
                  const _svJudge = (typeof SXC !== 'undefined' && SXC.supervisorJudge) ?
                    SXC.supervisorJudge(_svAnalScore, _svMom, _svRr) : 'avoid';
                  // BT 상태 분류 — btGetCurrentState는 scan_worker 내부 간소화 인라인
                  const _btSt = (typeof btGetCurrentState === 'function') ?
                    btGetCurrentState(btResult, s.price ?? adv.price) : null;
                  let _btStateKey = 'waiting';
                  if (_btSt) {
                    if (_btSt.state === 'holding' && _btSt._isBuySignal) _btStateKey = 'buy_signal';
                    else if (_btSt.state === 'holding') _btStateKey = 'holding';
                    else if (_btSt.state === 'sell_signal') _btStateKey = 'sell_signal';
                  }
                  // C 통합 판정
                  const _svV = (typeof SXC !== 'undefined' && SXC.unifiedVerdict) ?
                    SXC.unifiedVerdict(_btStateKey, _svJudge, s._btScore, _btSt) : null;
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
        const _sigFilter = activeFilters.find(f => f.id === '_signal_action');
        if (_sigFilter && _sigFilter.value && _sigFilter.value !== '설정안함') { if (!s._action) continue; if (s._action !== _sigFilter.value) continue; }
        const _scoreFilter = activeFilters.find(f => f.id === 'score_range');
        if (_scoreFilter && _scoreFilter.value) { const sc = s._score; if (sc == null) continue; if (_scoreFilter.value.min !== null && sc < _scoreFilter.value.min) continue; if (_scoreFilter.value.max !== null && sc > _scoreFilter.value.max) continue; }
        // S80: 3단 점수 필터
        const _readyF = getFilter('_ready_score');
        if (_readyF && _readyF.value && s._scanResult) { const rs = s._scanResult.readyScore ?? 0; if (_readyF.value.min !== null && rs < _readyF.value.min) continue; if (_readyF.value.max !== null && rs > _readyF.value.max) continue; }
        const _entryF = getFilter('_entry_score');
        if (_entryF && _entryF.value && s._scanResult) { const es = s._scanResult.entryScore ?? 0; if (_entryF.value.min !== null && es < _entryF.value.min) continue; if (_entryF.value.max !== null && es > _entryF.value.max) continue; }
        const _trendF = getFilter('_trend_score');
        if (_trendF && _trendF.value && s._scanResult) { const ts = s._scanResult.trendScore ?? 0; if (_trendF.value.min !== null && ts < _trendF.value.min) continue; if (_trendF.value.max !== null && ts > _trendF.value.max) continue; }
        {
          const qs = s._scanResult;
          const _sfClean = getFilter('_safety_clean');
          if (_sfClean && _sfClean.value && _sfClean.value !== '설정안함' && qs) { const cnt = (qs.reasons || []).length; if (_sfClean.value === '클린 (0개)' && cnt !== 0) continue; if (_sfClean.value === '1개 이하' && cnt > 1) continue; if (_sfClean.value === '2개 이하' && cnt > 2) continue; }
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
          const _btActF = getFilter('_bt_action');
          if (_btActF && _btActF.value && _btActF.value !== '설정안함') { if (!s._btAction || s._btAction !== _btActF.value) continue; }
        }

        // 재무 데이터 필터
        if (_hasAnyFilter(FINANCIAL_FILTER_IDS, getFilter)) {
          try {
            const fin = await fetchFinancialData(s.code, s.market);
            if (!checkFinancialFilters(fin, getFilter)) continue;
            if (!checkWeek52Filters(s.price, fin, getFilter)) continue;
            s._financial = fin;
          } catch (_) {}
        } else {
          if (!s._financial) fetchFinancialData(s.code, s.market).then(fin => { if (fin) s._financial = fin; }).catch(() => {});
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
    self.postMessage({
      type: 'done',
      results: _slimResults(searchResults),
      newFound,
      total,
      parallel: PARALLEL,
      message: `완료 — ${searchResults.length}종목 (신규 ${newFound})${PARALLEL_LABEL}`
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
  }
};
