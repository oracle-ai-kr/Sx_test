// ════════════════════════════════════════════════════════════
//  SIGNAL X — Analysis Engine v4.5 <!-- S107 Phase3-B-9a calcTpSlRr 크리티컬 버그 수정 — 3032~3034줄 rr/tpPct/slPct를 const로 선언 후 3071(_scrDisclosureWeight≤-30) 또는 3082(≤-15) 공시 가중치 분기에서 재할당 시도 → "TypeError: Assignment to constant variable" 런타임 에러. const → let 교체로 근본 해결. LG화학(위험 공시) 등 공시 감지 종목 분석 시 크래시 발생하던 문제 해소. Phase 3-B-9a와는 독립된 기존 버그이나 LG화학 실전 테스트 중 발견되어 긴급 수정. --> v4.4 <!-- S103-fix7 Phase3-A-1 btResult.rowsLength 추가(entryIdx/exitIdx 기준 통일, sx_bt.js _isBuySignal 버그 근본수정 근거) --> v4.3 <!-- S102b -->
//  S103-fix7 Phase3-A-1: runBtEngine 반환에 rowsLength:rows.length 추가 — 기존 btResult.scores.length는 rows.length-BT_WARMUP이라 entryIdx(rows 전체 기준)와 비교축 불일치 → _isBuySignal/sell_signal 오판정 유발
//  S102b: balanced OFF 재갱신 (JSON 2차 업데이트 — bbLen 27→10, tpMult 2.5→2.6, slMult 1.5→1.6)
//  S102: MODE_DEFAULTS/REGIME_DEFAULTS → SX_OPT_BEST3_20260416.json 실측값 재갱신 (profit slMult 1.7→1.8, balanced ON buyTh 42→41)
//  S101: MODE_DEFAULTS/REGIME_DEFAULTS → 옵티마이저 실측 검증값 반영 (MA 5/20/60 통일, 6개 조합 JSON 기반)
//  S97: _breakdown.subDetail 개별 sub signal 추적 (SUBSIG)
//  S95: trades에 entryDate/exitDate/tp/sl/entryIdx/exitIdx 필드 추가 (BT시그널통합용)
//  S80: 3단 점수 체계 — scrReadyScore(준비) + scrEntryScore(진입) + scrComputeScore(추세)
//  S79: scoreMomentum 점수 추이 분석 (과거 N봉 병렬 점수 계산)
//  S72: strategyLifecycle 전략 라이프사이클 분석 (5축③)
//  S71: regimeAdapt 레짐 적응형 파라미터 (레짐별 buyTh/sellTh/tpMult/slMult 자동 보정)
//  S63: 비기술 가중치(시장환경/재무/매크로/공시) 점수 합산 제거 → 해석 레이어 전용
//  S57: DISCLOSURE_CATEGORIES 6종 카테고리 구조 + 하위호환 자동생성
//  S48: scrComputeScore _breakdown 점수 산출 내역 반환
//  공용 분석 모듈 (sx_screener / sx_backtester 공유)
//  13 지표모듈 + 5 기타모듈 + 5 S49신규 + 7 고급엔진 + 점수산출 + 안전필터 + 스마트필터
//  S47: MarketEnv ORACLE 의존 제거 — 자체 실시간 지수 기반 독립 판정
//  S32: Candle.analyze 패턴 확장 (장대양봉/장대음봉/스피닝탑)
//  S33: 캔들패턴 대폭 확장 (13종→총 22종) + PriceAction 시세분석 모듈
//  S35: 일목균형표 + Envelope/Pivot/PriceChannel/MA이격도/거래량MA
//  S36: A/D + TRIX + StochSlow + MACDOsc + PriceOsc + VolIndex + Volatility
//  S39: VWAP 누적 가중평균가 모듈
// ════════════════════════════════════════════════════════════

// ── 유틸 ──
const SXE = {}; // namespace

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sma(arr, period) {
  if (arr.length < period) return null;
  let sum = 0;
  for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
  return sum / period;
}

function ema(arr, period) {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let e = sma(arr.slice(0, period), period);
  for (let i = period; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

function smaArray(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let s = 0; for (let j = i - period + 1; j <= i; j++) s += arr[j];
    result.push(s / period);
  }
  return result;
}

function emaArray(arr, period) {
  const result = [];
  const k = 2 / (period + 1);
  let e = null;
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) { let s = 0; for (let j = 0; j < period; j++) s += arr[j]; e = s / period; result.push(e); continue; }
    e = arr[i] * k + e * (1 - k);
    result.push(e);
  }
  return result;
}

// ── TF 설정 ──
const SHORT_TFS_SET = new Set(['5m', '15m', '30m', '60m']);
const SCR_TF_THRESHOLD = {
  '5m': { buy: 66, sell: 34 }, '15m': { buy: 65, sell: 35 }, '30m': { buy: 64, sell: 36 },
  '60m': { buy: 63, sell: 37 }, 'day': { buy: 62, sell: 38 }, 'week': { buy: 62, sell: 38 }, 'month': { buy: 62, sell: 38 },
  'D': { buy: 62, sell: 38 }, 'W': { buy: 62, sell: 38 }, 'M': { buy: 62, sell: 38 },
  '240m': { buy: 63, sell: 37 },
};
const SCR_TF_MA = {
  '5m': { short: 12, mid: 48, long: 288, xlong: 576 }, '15m': { short: 8, mid: 32, long: 96, xlong: 192 },
  '30m': { short: 8, mid: 26, long: 48, xlong: 96 }, '60m': { short: 8, mid: 24, long: 60, xlong: 120 },
  'day': { short: 5, mid: 20, long: 60, xlong: 120 }, 'week': { short: 5, mid: 13, long: 26, xlong: 52 },
  'month': { short: 3, mid: 6, long: 12, xlong: 24 }, '240m': { short: 8, mid: 24, long: 60, xlong: 120 },
  'D': { short: 5, mid: 20, long: 60, xlong: 120 }, 'W': { short: 5, mid: 13, long: 26, xlong: 52 },
  'M': { short: 3, mid: 6, long: 12, xlong: 24 },
};
const SCR_SCORING = { tanh: 1.15, ctx: 0.75 };

function _scrTfTh(tf) { return SCR_TF_THRESHOLD[tf] || SCR_TF_THRESHOLD['day']; }
function _scrTfMa(tf) { return SCR_TF_MA[tf] || SCR_TF_MA['day']; }

// ── 커스텀 분석 파라미터 ──
const SCR_ANAL_PARAMS_KEY = 'SX_SCR_ANAL_PARAMS';
const SCR_ANAL_DEFAULTS = { rsiLen: 14, bbLen: 20, bbMult: 2.0, maShort: 0, maMid: 0, maLong: 0, atrLen: 14, buyTh: 0, sellTh: 0, tpMult: 0, slMult: 0 };
// S102: 3모드 × 2레짐 = 6개 기본 하드코딩 (SX_OPT_BEST3_20260416.json 실측 검증값)
// 공통: MA 5/20/60, RSI 14, ATR 14, SELL 5 (step=0 고정 파라미터)
const SCR_ANAL_MODE_DEFAULTS = {
  // 레짐 무관 fallback — 각 모드 score 높은 쪽
  profit:   { rsiLen:14, bbLen:10, bbMult:1.8, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:31, sellTh:5, tpMult:3.1, slMult:1.8 }, // OFF score 61.07
  balanced: { rsiLen:14, bbLen:11, bbMult:1.9, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:41, sellTh:5, tpMult:2.5, slMult:1.5 }, // ON  score 48.38
  safe:     { rsiLen:14, bbLen:23, bbMult:1.8, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:48, sellTh:5, tpMult:2.5, slMult:1.6 }  // ON  score 60.73
};
// S102: 모드×레짐 6개 조합별 기본값 (JSON 실측치 반영)
const SCR_ANAL_MODE_REGIME_DEFAULTS = {
  profit: {
    on:  { rsiLen:14, bbLen:11, bbMult:2.1, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:25, sellTh:5, tpMult:2.5, slMult:1.6 },
    off: { rsiLen:14, bbLen:10, bbMult:1.8, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:31, sellTh:5, tpMult:3.1, slMult:1.8 }
  },
  balanced: {
    on:  { rsiLen:14, bbLen:11, bbMult:1.9, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:41, sellTh:5, tpMult:2.5, slMult:1.5 },
    off: { rsiLen:14, bbLen:10, bbMult:1.8, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:30, sellTh:5, tpMult:2.6, slMult:1.6 }
  },
  safe: {
    on:  { rsiLen:14, bbLen:23, bbMult:1.8, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:48, sellTh:5, tpMult:2.5, slMult:1.6 },
    off: { rsiLen:14, bbLen:20, bbMult:2.0, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:25, sellTh:5, tpMult:2.5, slMult:1.7 }
  }
};
// S100: 모드+레짐으로 기본값 조회 (mode: profit/balanced/safe, regimeOn: true/false)
function _getModeRegimeDefaults(mode, regimeOn) {
  const m = SCR_ANAL_MODE_REGIME_DEFAULTS[mode];
  if(!m) return SCR_ANAL_DEFAULTS;
  return regimeOn ? m.on : m.off;
}
// S100: 현재 적용 프리셋 출처 라벨 생성
function _getPresetSourceLabel() {
  const mIcons = {profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const mNames = {profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mktNames = {kr:'국내',us:'해외',coin:'코인'};
  const tfLabels = {'30m':'30분','60m':'60분','4h':'4시간','day':'일봉','week':'주봉','month':'월봉'};
  const mode = (typeof _analMode !== 'undefined') ? _analMode : 'balanced';
  // 옵티마이저 대표 프리셋 확인
  try {
    const all = JSON.parse(localStorage.getItem('SX_OPT_BEST3') || '{}');
    const bucket = all[mode];
    if (bucket && bucket.representId && bucket.ranks) {
      const rep = bucket.ranks.find(r => r.id === bucket.representId);
      if (rep) {
        const mkt = mktNames[rep.market] || rep.market || '';
        const tfs = rep.tfs ? rep.tfs.map(t => tfLabels[t] || t).join('+') : (tfLabels[rep.tf] || rep.tf || '');
        const regime = rep.regime ? '⚡ON' : '⚡OFF';
        return `${mIcons[mode]||''} ${mNames[mode]||''} ${mkt} ${tfs} ${regime}`;
      }
    }
  } catch(_){}
  // 대표 프리셋 없으면 기본 하드코딩 표시
  return `${mIcons[mode]||''} ${mNames[mode]||''} 기본값`;
}
// S77: 시장별 멀티슬롯 저장 (시장당 최대 5개)
const SCR_ANAL_PARAMS_MARKET_KEYS = { kr:'SX_SCR_ANAL_PARAMS_KR', us:'SX_SCR_ANAL_PARAMS_US', coin:'SX_SCR_ANAL_PARAMS_COIN' };
const SCR_ANAL_MAX_SLOTS = 5;

function _loadAnalParams() {
  try { const r = JSON.parse(localStorage.getItem(SCR_ANAL_PARAMS_KEY)); if (r) return { ...SCR_ANAL_DEFAULTS, ...r }; } catch (_) {}
  return { ...SCR_ANAL_DEFAULTS };
}
function _saveAnalParams(p) { localStorage.setItem(SCR_ANAL_PARAMS_KEY, JSON.stringify(p)); }
// S77: 시장별 슬롯 배열 로드 [{name,params},{name,params},...]
function _loadMarketSlots(market) {
  const key = SCR_ANAL_PARAMS_MARKET_KEYS[market];
  if(!key) return [];
  try { const arr = JSON.parse(localStorage.getItem(key)); if(Array.isArray(arr)) return arr.slice(0, SCR_ANAL_MAX_SLOTS); } catch(_){}
  return [];
}
function _saveMarketSlots(market, slots) {
  const key = SCR_ANAL_PARAMS_MARKET_KEYS[market];
  if(key) localStorage.setItem(key, JSON.stringify(slots.slice(0, SCR_ANAL_MAX_SLOTS)));
}
// 슬롯 추가/덮어쓰기 (index<0이면 추가, >=0이면 덮어쓰기)
function _saveSlot(market, name, params, index) {
  const slots = _loadMarketSlots(market);
  const entry = { name, params: { ...params }, ts: Date.now() };
  if(index >= 0 && index < slots.length) { slots[index] = entry; }
  else { if(slots.length >= SCR_ANAL_MAX_SLOTS) return false; slots.push(entry); }
  _saveMarketSlots(market, slots);
  return true;
}
function _deleteSlot(market, index) {
  const slots = _loadMarketSlots(market);
  if(index >= 0 && index < slots.length) { slots.splice(index, 1); _saveMarketSlots(market, slots); return true; }
  return false;
}
function _resetAllAnalParams() {
  localStorage.removeItem(SCR_ANAL_PARAMS_KEY);
  Object.values(SCR_ANAL_PARAMS_MARKET_KEYS).forEach(k=>localStorage.removeItem(k));
}

// ── 커스텀 임계값 (SX_CUSTOM_THRESHOLDS — 스캐너 공용) ──
const SXE_CUSTOM_TH_KEY = 'SX_CUSTOM_THRESHOLDS';
const SXE_CUSTOM_TH_DEFAULTS = { buyTh: 62, sellTh: 38, thresholdMargin: 2, stochHigh: 90, rsiLowForStoch: 60, macdNegBars: 5 };

function _loadCustomTh() {
  try { const s = localStorage.getItem(SXE_CUSTOM_TH_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
function _getCustomThresholds() {
  const custom = _loadCustomTh();
  return custom ? { ...SXE_CUSTOM_TH_DEFAULTS, ...custom } : { ...SXE_CUSTOM_TH_DEFAULTS };
}

// ── 통합 임계값: 로컬 우선 (SCR_ANAL_PARAMS > CUSTOM_THRESHOLDS > 하드코딩) ──
function _getEffectiveTh(tf) {
  const p = _loadAnalParams();
  const cTh = _getCustomThresholds();
  const base = _scrTfTh(tf);
  // 우선순위: SCR_ANAL_PARAMS(스크리너 파라미터) → CUSTOM_THRESHOLDS(스캐너 공용) → 하드코딩
  const buyTh = p.buyTh > 0 ? p.buyTh : (cTh.buyTh !== SXE_CUSTOM_TH_DEFAULTS.buyTh ? cTh.buyTh : base.buy);
  const sellTh = p.sellTh > 0 ? p.sellTh : (cTh.sellTh !== SXE_CUSTOM_TH_DEFAULTS.sellTh ? cTh.sellTh : base.sell);
  return { buyTh, sellTh };
}

// ════════════════════════════════════════════════════════════
//  지표 모듈 (13개)
// ════════════════════════════════════════════════════════════

const RSI = {
  calc(closes, period = 14) {
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
    let ag = g / period, al = l / period;
    const arr = new Array(closes.length).fill(null);
    arr[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
      al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
      arr[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return arr;
  },
  signal(val) {
    if (val <= 25) return { type: 'buy', strength: 'strong' };
    if (val <= 35) return { type: 'buy', strength: 'normal' };
    if (val >= 75) return { type: 'sell', strength: 'strong' };
    if (val >= 65) return { type: 'sell', strength: 'normal' };
    return null;
  },
  divergence(closes, rsiArr) {
    const n = closes.length;
    if (n < 30) return null;
    const seg = Math.min(20, Math.floor(n * 0.15));
    const recent = closes.slice(-seg), rsiRecent = rsiArr.slice(-seg).filter(v => v != null);
    const prev = closes.slice(-seg * 2, -seg), rsiPrev = rsiArr.slice(-seg * 2, -seg).filter(v => v != null);
    if (!rsiRecent.length || !rsiPrev.length) return null;
    const pHL = Math.min(...recent) < Math.min(...prev), rsiHL = Math.min(...rsiRecent) > Math.min(...rsiPrev);
    if (pHL && rsiHL) return 'bullish';
    const pHH = Math.max(...recent) > Math.max(...prev), rsiHH = Math.max(...rsiRecent) < Math.max(...rsiPrev);
    if (pHH && rsiHH) return 'bearish';
    return null;
  }
};

const MACD = {
  calc(closes, fast = 12, slow = 26, sig = 9) {
    const emaF = emaArray(closes, fast), emaS = emaArray(closes, slow);
    const line = [], hist = [];
    for (let i = 0; i < closes.length; i++) {
      if (emaF[i] == null || emaS[i] == null) { line.push(0); hist.push(0); continue; }
      line.push(emaF[i] - emaS[i]); hist.push(0);
    }
    const sigArr = emaArray(line, sig);
    for (let i = 0; i < line.length; i++) hist[i] = sigArr[i] != null ? line[i] - sigArr[i] : 0;
    return { line, sig: sigArr, hist };
  },
  signal(hist, prevHist) {
    if (hist > 0 && prevHist <= 0) return { type: 'buy', strength: 'strong' };
    if (hist > 0 && hist > prevHist) return { type: 'buy', strength: 'normal' };
    if (hist < 0 && prevHist >= 0) return { type: 'sell', strength: 'strong' };
    if (hist < 0 && hist < prevHist) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const Stochastic = {
  calc(rows, kP = 14, dP = 3) {
    const n = rows.length;
    if (n < kP) return { k: 50, d: 50, prevK: 50, prevD: 50 };
    const kArr = [];
    for (let i = kP - 1; i < n; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - kP + 1; j <= i; j++) { hi = Math.max(hi, rows[j].high); lo = Math.min(lo, rows[j].low); }
      kArr.push(hi === lo ? 50 : (rows[i].close - lo) / (hi - lo) * 100);
    }
    const dArr = smaArray(kArr, dP);
    const k = kArr[kArr.length - 1] ?? 50, d = dArr[dArr.length - 1] ?? 50;
    const prevK = kArr.length >= 2 ? kArr[kArr.length - 2] : k, prevD = dArr.length >= 2 ? dArr[dArr.length - 2] : d;
    return { k, d, prevK, prevD };
  },
  signal(k, d) {
    if (k < 20 && k > d) return { type: 'buy', strength: 'strong' };
    if (k < 30 && k > d) return { type: 'buy', strength: 'normal' };
    if (k > 80 && k < d) return { type: 'sell', strength: 'strong' };
    if (k > 70 && k < d) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const CCI = {
  calc(rows, period = 20) {
    const n = rows.length;
    if (n < period) return 0;
    const tp = []; for (let i = 0; i < n; i++) tp.push((rows[i].high + rows[i].low + rows[i].close) / 3);
    const m = sma(tp, period);
    if (m == null) return 0;
    let md = 0; for (let i = n - period; i < n; i++) md += Math.abs(tp[i] - m);
    md /= period;
    return md === 0 ? 0 : (tp[n - 1] - m) / (0.015 * md);
  },
  signal(val) {
    if (val <= -200) return { type: 'buy', strength: 'strong' };
    if (val <= -100) return { type: 'buy', strength: 'normal' };
    if (val >= 200) return { type: 'sell', strength: 'strong' };
    if (val >= 100) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const ADX = {
  calc(rows, period = 14) {
    const n = rows.length;
    if (n < period + 1) return { adx: 0, pdi: 0, mdi: 0 };
    let atr = 0, pDM = 0, mDM = 0;
    for (let i = 1; i <= period; i++) {
      const h = rows[i].high - rows[i - 1].high, l = rows[i - 1].low - rows[i].low;
      pDM += (h > l && h > 0) ? h : 0;
      mDM += (l > h && l > 0) ? l : 0;
      atr += Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
    }
    for (let i = period + 1; i < n; i++) {
      const h = rows[i].high - rows[i - 1].high, l = rows[i - 1].low - rows[i].low;
      const tr = Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
      atr = atr - atr / period + tr;
      pDM = pDM - pDM / period + ((h > l && h > 0) ? h : 0);
      mDM = mDM - mDM / period + ((l > h && l > 0) ? l : 0);
    }
    const pdi = atr > 0 ? (pDM / atr) * 100 : 0, mdi = atr > 0 ? (mDM / atr) * 100 : 0;
    const dx = (pdi + mdi) > 0 ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0;
    return { adx: dx, pdi, mdi };
  },
  signal(adx, pdi, mdi) {
    if (adx > 25 && pdi > mdi) return { type: 'buy', strength: adx > 40 ? 'strong' : 'normal' };
    if (adx > 25 && mdi > pdi) return { type: 'sell', strength: adx > 40 ? 'strong' : 'normal' };
    return null;
  }
};

const OBV = {
  calc(rows) {
    let val = 0;
    const arr = [0];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].close > rows[i - 1].close) val += rows[i].volume;
      else if (rows[i].close < rows[i - 1].close) val -= rows[i].volume;
      arr.push(val);
    }
    const sig = sma(arr, 20) ?? val;
    const trend = val > sig ? 'up' : val < sig ? 'down' : 'flat';
    const divergence = rows.length >= 20 && rows[rows.length - 1].close < rows[rows.length - 10].close && val > arr[arr.length - 10];
    return { val, sig, arr, trend, divergence };
  },
  signal(val, sig) {
    if (val > sig * 1.05) return { type: 'buy', strength: 'normal' };
    if (val < sig * 0.95) return { type: 'sell', strength: 'normal' };
    return null;
  },
  divergence(rows) {
    const n = rows.length;
    if (n < 30) return null;
    const seg = Math.min(15, Math.floor(n * 0.12));
    const recentP = rows.slice(-seg).map(r => r.close), prevP = rows.slice(-seg * 2, -seg).map(r => r.close);
    if (!recentP.length || !prevP.length) return null;
    let ov = 0; const oArr = [0];
    for (let i = 1; i < n; i++) {
      if (rows[i].close > rows[i - 1].close) ov += rows[i].volume;
      else if (rows[i].close < rows[i - 1].close) ov -= rows[i].volume;
      oArr.push(ov);
    }
    const recentO = oArr.slice(-seg), prevO = oArr.slice(-seg * 2, -seg);
    if (!recentO.length || !prevO.length) return null;
    const pLL = Math.min(...recentP) < Math.min(...prevP), oHL = Math.min(...recentO) > Math.min(...prevO);
    if (pLL && oHL) return 'bullish';
    const pHH = Math.max(...recentP) > Math.max(...prevP), oLH = Math.max(...recentO) < Math.max(...prevO);
    if (pHH && oLH) return 'bearish';
    return null;
  }
};

const VolumeOSC = {
  calc(rows, short = 5, long = 20) {
    const vols = rows.map(r => r.volume);
    const sS = sma(vols, short), sL = sma(vols, long);
    if (!sS || !sL || sL === 0) return 0;
    return ((sS - sL) / sL) * 100;
  },
  signal(val) {
    if (val > 50) return { type: 'buy', strength: 'normal' };
    if (val < -30) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const BollingerBands = {
  calc(closes, period = 20, mult = 2.0) {
    const n = closes.length;
    if (n < period) return { upper: 0, middle: 0, lower: 0, width: 0, pctB: 0.5, price: closes[n - 1] || 0 };
    const mid = sma(closes, period);
    let sum2 = 0; for (let i = n - period; i < n; i++) sum2 += (closes[i] - mid) ** 2;
    const sd = Math.sqrt(sum2 / period);
    const upper = mid + sd * mult, lower = mid - sd * mult;
    const width = mid > 0 ? (upper - lower) / mid * 100 : 0;
    const pctB = (upper - lower) > 0 ? (closes[n - 1] - lower) / (upper - lower) : 0.5;
    return { upper, middle: mid, lower, width, pctB, price: closes[n - 1], last: closes[n - 1] };
  },
  squeeze(closes, period = 20) {
    const n = closes.length;
    if (n < period + 10) return { squeeze: false };
    const widths = [];
    for (let i = period; i <= n; i++) {
      const sl = closes.slice(i - period, i);
      const m = sma(sl, period);
      let s2 = 0; for (const v of sl) s2 += (v - m) ** 2;
      widths.push(Math.sqrt(s2 / period) / m * 100);
    }
    if (widths.length < 5) return { squeeze: false };
    const recent = widths.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    return { squeeze: recent < avg * 0.7 };
  },
  signal(price, bb) {
    if (price <= bb.lower) return { type: 'buy', strength: 'strong' };
    if (price <= bb.lower + (bb.middle - bb.lower) * 0.2) return { type: 'buy', strength: 'normal' };
    if (price >= bb.upper) return { type: 'sell', strength: 'strong' };
    if (price >= bb.upper - (bb.upper - bb.middle) * 0.2) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const MA = {
  alignment(closes, tf, ip) {
    const mp = _scrTfMa(tf);
    const short = ip?.maShort > 0 ? ip.maShort : mp.short;
    const mid = ip?.maMid > 0 ? ip.maMid : mp.mid;
    const long = ip?.maLong > 0 ? ip.maLong : mp.long;
    const n = closes.length;
    const mS = n >= short ? sma(closes, short) : null;
    const mM = n >= mid ? sma(closes, mid) : null;
    const mL = n >= long ? sma(closes, long) : null;
    const mXL = n >= (ip?.maXLong || mp.xlong) ? sma(closes, ip?.maXLong || mp.xlong) : null;
    const bullish = mS != null && mM != null && mL != null && mS > mM && mM > mL;
    const bearish = mS != null && mM != null && mL != null && mS < mM && mM < mL;
    const ma60 = n >= 60 ? sma(closes, 60) : null;
    return { bullish, bearish, short: mS, mid: mM, long: mL, xlong: mXL, ma60 };
  },
  signal(maAlign) {
    if (maAlign.bullish) return { type: 'buy', strength: 'strong' };
    if (maAlign.bearish) return { type: 'sell', strength: 'strong' };
    return null;
  }
};

const Trend = {
  calc(closes) {
    const n = closes.length;
    if (n < 20) return { pct: 0, slope: 0 };
    const pct = ((closes[n - 1] - closes[n - 20]) / closes[n - 20]) * 100;
    const slope = (closes[n - 1] - closes[n - 5]) / (5 * closes[n - 1] || 1);
    return { pct, slope };
  },
  structure(rows) {
    const n = rows.length;
    if (n < 20) return { pos: 0.5, nearSupport: false, nearResistance: false };
    const hi = Math.max(...rows.slice(-20).map(r => r.high));
    const lo = Math.min(...rows.slice(-20).map(r => r.low));
    const pos = hi > lo ? (rows[n - 1].close - lo) / (hi - lo) : 0.5;
    const price = rows[n - 1].close;
    return { pos, nearSupport: pos < 0.15, nearResistance: pos > 0.85, hi, lo, price };
  },
  levels(rows) {
    const n = rows.length;
    if (n < 30) return [];
    const levels = [];
    for (let i = 5; i < n - 5; i++) {
      const isHigh = rows[i].high >= Math.max(...rows.slice(i - 5, i + 6).map(r => r.high));
      const isLow = rows[i].low <= Math.min(...rows.slice(i - 5, i + 6).map(r => r.low));
      if (isHigh) levels.push({ type: 'resistance', price: rows[i].high });
      if (isLow) levels.push({ type: 'support', price: rows[i].low });
    }
    return levels.slice(-10);
  },
  fibonacci(rows) {
    const n = rows.length;
    if (n < 20) return null;
    const hi = Math.max(...rows.slice(-50).map(r => r.high));
    const lo = Math.min(...rows.slice(-50).map(r => r.low));
    const d = hi - lo;
    return { levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(r => ({ ratio: r, price: hi - d * r })) };
  }
};

const ATR = {
  calc(rows, period = 14) {
    const n = rows.length;
    if (n < period + 1) return { val: 0, pct: 0 };
    let atr = 0;
    for (let i = 1; i <= period; i++) {
      atr += Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
    }
    atr /= period;
    for (let i = period + 1; i < n; i++) {
      const tr = Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
      atr = (atr * (period - 1) + tr) / period;
    }
    const pct = rows[n - 1].close > 0 ? (atr / rows[n - 1].close) * 100 : 0;
    return { val: atr, pct };
  },
  soften(pct, key, cache) {
    if (!cache) return pct;
    const prev = cache[key];
    cache[key] = pct;
    if (prev == null) return pct;
    return prev * 0.3 + pct * 0.7;
  },
  signal(pct) {
    if (pct >= 5) return { type: 'sell', strength: 'strong' };
    if (pct >= 3) return { type: 'sell', strength: 'normal' };
    return null;
  }
};

const Candle = {
  analyze(rows) {
    const n = rows.length;
    const empty = { bullish: false, bearish: false, score: 0, strongest: null, patterns: [], basic: [], reversal: [], continuation: [] };
    if (n < 3) return empty;
    const r = rows[n - 1], p = rows[n - 2], pp = rows[n - 3];
    const body = r.close - r.open, absB = Math.abs(body);
    const range = r.high - r.low;
    const pBody = p.close - p.open, pAbsB = Math.abs(pBody);
    const pRange = p.high - p.low;
    const ppBody = pp.close - pp.open;
    const patterns = [];

    // ── 1봉 패턴 (6종) ──
    if (range > 0 && body > 0 && absB / range >= 0.7) patterns.push({ name: '장대양봉', dir: 1, score: 6 });
    if (range > 0 && body < 0 && absB / range >= 0.7) patterns.push({ name: '장대음봉', dir: -1, score: 6 });
    if (range > 0 && absB / range >= 0.1 && absB / range <= 0.3) {
      const upSh = r.high - Math.max(r.open, r.close);
      const dnSh = Math.min(r.open, r.close) - r.low;
      if (upSh > 0 && dnSh > 0 && Math.min(upSh, dnSh) / Math.max(upSh, dnSh) > 0.4)
        patterns.push({ name: '스피닝탑', dir: 0, score: 2 });
    }
    if (body > 0 && absB > 0 && (r.open - r.low) > absB * 2 && (r.high - r.close) < absB * 0.3) patterns.push({ name: '해머', dir: 1, score: 8 });
    if (body < 0 && absB > 0 && (r.high - r.open) > absB * 2 && (r.close - r.low) < absB * 0.3) patterns.push({ name: '슈팅스타', dir: -1, score: 8 });
    if (range > 0 && absB / range < 0.1) {
      patterns.push({ name: '도지', dir: 0, score: 3 });
      const upSh1 = r.high - Math.max(r.open, r.close);
      const dnSh1 = Math.min(r.open, r.close) - r.low;
      if (upSh1 > range * 0.6 && dnSh1 < range * 0.1) patterns.push({ name: '그레이브스톤도지', dir: -1, score: 6 });
      if (dnSh1 > range * 0.6 && upSh1 < range * 0.1) patterns.push({ name: '드래곤플라이도지', dir: 1, score: 6 });
    }
    // 마루보즈 (몸통 95%+, 꼬리 거의 없음)
    if (range > 0 && body > 0 && absB / range >= 0.95) patterns.push({ name: '양봉마루보즈', dir: 1, score: 7 });
    if (range > 0 && body < 0 && absB / range >= 0.95) patterns.push({ name: '음봉마루보즈', dir: -1, score: 7 });
    // 하이웨이브 (긴 양쪽 꼬리 + 작은 몸통)
    if (range > 0 && absB / range < 0.2) {
      const upSh2 = r.high - Math.max(r.open, r.close);
      const dnSh2 = Math.min(r.open, r.close) - r.low;
      if (upSh2 > range * 0.3 && dnSh2 > range * 0.3) patterns.push({ name: '하이웨이브', dir: 0, score: 4 });
    }

    // ── 2봉 패턴 (10종) ──
    if (pBody < 0 && body > 0 && r.close > p.open && r.open < p.close) patterns.push({ name: '상승장악', dir: 1, score: 10 });
    if (pBody > 0 && body < 0 && r.close < p.open && r.open > p.close) patterns.push({ name: '하락장악', dir: -1, score: 10 });
    if (pBody < 0 && body > 0 && pAbsB > 0 && r.open >= p.close && r.close <= p.open && absB < pAbsB * 0.6)
      patterns.push({ name: '하라미상승', dir: 1, score: 7 });
    if (pBody > 0 && body < 0 && pAbsB > 0 && r.open <= p.close && r.close >= p.open && absB < pAbsB * 0.6)
      patterns.push({ name: '하라미하락', dir: -1, score: 7 });
    if (pAbsB > 0 && range > 0 && absB / range < 0.1 && Math.max(r.open, r.close) <= Math.max(p.open, p.close) && Math.min(r.open, r.close) >= Math.min(p.open, p.close))
      patterns.push({ name: '하라미크로스', dir: pBody < 0 ? 1 : -1, score: 7 });
    if (pBody < 0 && body > 0 && r.open < p.close && r.close > (p.open + p.close) / 2 && r.close < p.open)
      patterns.push({ name: '피어싱라인', dir: 1, score: 8 });
    if (pBody > 0 && body < 0 && r.open > p.close && r.close < (p.open + p.close) / 2 && r.close > p.open)
      patterns.push({ name: '다크클라우드', dir: -1, score: 8 });
    if (r.high <= p.high && r.low >= p.low && pRange > 0)
      patterns.push({ name: '인사이드데이', dir: 0, score: 3 });
    if (r.high > p.high && r.low < p.low)
      patterns.push({ name: '아웃사이드데이', dir: body > 0 ? 1 : -1, score: 5 });
    if (pBody < 0 && body > 0 && p.low > 0 && Math.abs(r.low - p.low) / p.low < 0.003)
      patterns.push({ name: '집게바닥', dir: 1, score: 7 });
    if (pBody > 0 && body < 0 && p.high > 0 && Math.abs(r.high - p.high) / p.high < 0.003)
      patterns.push({ name: '집게천정', dir: -1, score: 7 });

    // 카운터어택 (전봉과 반대 방향이나 종가가 전봉 종가와 거의 같음)
    if (pBody < 0 && body > 0 && pAbsB > 0 && Math.abs(r.close - p.close) / p.close < 0.003)
      patterns.push({ name: '상승카운터어택', dir: 1, score: 7 });
    if (pBody > 0 && body < 0 && pAbsB > 0 && Math.abs(r.close - p.close) / p.close < 0.003)
      patterns.push({ name: '하락카운터어택', dir: -1, score: 7 });

    // ── 3봉 패턴 (4종 + 확장 10종) ──
    if (ppBody < 0 && pRange > 0 && Math.abs(pBody) < pRange * 0.3 && body > 0 && r.close > (pp.open + pp.close) / 2)
      patterns.push({ name: '모닝스타', dir: 1, score: 12 });
    if (ppBody > 0 && pRange > 0 && Math.abs(pBody) < pRange * 0.3 && body < 0 && r.close < (pp.open + pp.close) / 2)
      patterns.push({ name: '이브닝스타', dir: -1, score: 12 });
    if (ppBody > 0 && pBody > 0 && body > 0 && p.close > pp.close && r.close > p.close)
      patterns.push({ name: '적삼병', dir: 1, score: 9 });
    if (ppBody < 0 && pBody < 0 && body < 0 && p.close < pp.close && r.close < p.close)
      patterns.push({ name: '흑삼병', dir: -1, score: 9 });
    // 모닝/이브닝 도지스타 (중간봉이 도지)
    if (ppBody < 0 && pRange > 0 && Math.abs(pBody) / pRange < 0.1 && body > 0 && r.close > (pp.open + pp.close) / 2)
      patterns.push({ name: '모닝도지스타', dir: 1, score: 13 });
    if (ppBody > 0 && pRange > 0 && Math.abs(pBody) / pRange < 0.1 && body < 0 && r.close < (pp.open + pp.close) / 2)
      patterns.push({ name: '이브닝도지스타', dir: -1, score: 13 });
    // 어밴던드베이비 (도지스타 + 전후 갭)
    if (ppBody < 0 && pRange > 0 && Math.abs(pBody) / pRange < 0.1 && p.high < pp.low && p.high < r.low && body > 0)
      patterns.push({ name: '상승어밴던드베이비', dir: 1, score: 15 });
    if (ppBody > 0 && pRange > 0 && Math.abs(pBody) / pRange < 0.1 && p.low > pp.high && p.low > r.high && body < 0)
      patterns.push({ name: '하락어밴던드베이비', dir: -1, score: 15 });
    // 어드밴스블럭 (적삼병이지만 몸통이 점점 줄어듦)
    if (ppBody > 0 && pBody > 0 && body > 0 && p.close > pp.close && r.close > p.close) {
      const b0 = Math.abs(ppBody), b1 = Math.abs(pBody), b2 = absB;
      if (b1 < b0 * 0.85 && b2 < b1 * 0.85) patterns.push({ name: '어드밴스블럭', dir: -1, score: 6 });
    }
    // 스톨드패턴 (적삼병이지만 마지막 봉이 매우 작음 + 윗꼬리)
    if (ppBody > 0 && pBody > 0 && body > 0 && p.close > pp.close && r.close > p.close) {
      if (absB < Math.abs(pBody) * 0.4 && (r.high - r.close) > absB) patterns.push({ name: '스톨드패턴', dir: -1, score: 5 });
    }
    // 업사이드 갭 태스키 (갭상승 후 음봉이 갭을 채우지 못함)
    if (pBody > 0 && p.low > pp.high && body < 0 && r.open > p.open && r.close > pp.high)
      patterns.push({ name: '업사이드갭태스키', dir: 1, score: 6 });
    // 다운사이드 갭 태스키 (갭하락 후 양봉이 갭을 채우지 못함)
    if (pBody < 0 && p.high < pp.low && body > 0 && r.open < p.open && r.close < pp.low)
      patterns.push({ name: '다운사이드갭태스키', dir: -1, score: 6 });

    // ── 갭 패턴 (2종) ──
    if (r.low > p.high) patterns.push({ name: '갭상승', dir: 1, score: 5 });
    if (r.high < p.low) patterns.push({ name: '갭하락', dir: -1, score: 5 });

    let score = 0;
    patterns.forEach(pt => score += pt.score * pt.dir);
    const bullish = score > 0, bearish = score < 0;
    const sorted = [...patterns].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    const strongest = sorted[0] || null;
    const basic = patterns.filter(pt => pt.dir > 0).map(pt => pt.name);
    const reversal = patterns.filter(pt => Math.abs(pt.score) >= 7).map(pt => pt.name);
    const continuation = patterns.filter(pt => ['적삼병','흑삼병','갭상승','갭하락','어드밴스블럭','스톨드패턴','업사이드갭태스키','다운사이드갭태스키'].includes(pt.name)).map(pt => pt.name);
    return { bullish, bearish, score, strongest, patterns, basic, reversal, continuation };
  }
};

// ════════════════════════════════════════════════════════════
//  PriceAction — 시세분석 모듈 (S33)
//  연속상승/하락, 신고가/신저가, 갭, 등락률, 변동폭, 전고점돌파
// ════════════════════════════════════════════════════════════
const PriceAction = {
  analyze(rows) {
    const n = rows.length;
    const empty = { consecutiveDays: 0, gap: null, gapPct: 0, newHigh52: false, newLow52: false,
      newHighN: false, newLowN: false, changeRate: 0, rangeRate: 0, prevHighBreak: false, score: 0 };
    if (n < 2) return empty;

    const r = rows[n - 1], p = rows[n - 2];

    // 연속 상승/하락 일수 (양수=상승, 음수=하락)
    let consecutiveDays = 0;
    if (r.close > r.open) { // 금일 양봉이면 상승 연속 카운트
      consecutiveDays = 1;
      for (let i = n - 2; i >= 0; i--) { if (rows[i].close > rows[i].open) consecutiveDays++; else break; }
    } else if (r.close < r.open) {
      consecutiveDays = -1;
      for (let i = n - 2; i >= 0; i--) { if (rows[i].close < rows[i].open) consecutiveDays--; else break; }
    }

    // 갭 감지
    let gap = null, gapPct = 0;
    if (r.low > p.high) { gap = 'up'; gapPct = p.high > 0 ? ((r.low - p.high) / p.high) * 100 : 0; }
    else if (r.high < p.low) { gap = 'down'; gapPct = p.low > 0 ? ((p.low - r.high) / p.low) * 100 : 0; }

    // 신고가/신저가 (52주 = 약 250거래일, N일 = 20일)
    const closes = rows.map(r2 => r2.close);
    const highs = rows.map(r2 => r2.high);
    const lows = rows.map(r2 => r2.low);
    const lookback52 = Math.min(n, 250);
    const lookbackN = Math.min(n, 20);
    const high52 = Math.max(...highs.slice(n - lookback52));
    const low52 = Math.min(...lows.slice(n - lookback52));
    const highN = Math.max(...highs.slice(n - lookbackN, n - 1)); // 금일 제외
    const lowN = Math.min(...lows.slice(n - lookbackN, n - 1));
    const newHigh52 = r.high >= high52;
    const newLow52 = r.low <= low52;
    const newHighN = n > 2 && r.high > highN;
    const newLowN = n > 2 && r.low < lowN;

    // 등락률 (전일대비)
    const changeRate = p.close > 0 ? ((r.close - p.close) / p.close) * 100 : 0;

    // 기간내 변동폭 (20일 고저차 / 시작가)
    const rangeHigh = Math.max(...highs.slice(n - lookbackN));
    const rangeLow = Math.min(...lows.slice(n - lookbackN));
    const rangeBase = rows[n - lookbackN]?.close || r.close;
    const rangeRate = rangeBase > 0 ? ((rangeHigh - rangeLow) / rangeBase) * 100 : 0;

    // 전고점 돌파 (20일내 최고가를 금일 종가가 돌파)
    const prevHighBreak = n > 2 && r.close > highN;

    // 점수 산출 (갭 + 연속일 기반 보조점수)
    let score = 0;
    if (gap === 'up') score += Math.min(gapPct * 2, 8);
    if (gap === 'down') score -= Math.min(gapPct * 2, 8);
    if (consecutiveDays >= 3) score += Math.min(consecutiveDays, 6);
    if (consecutiveDays <= -3) score += Math.max(consecutiveDays, -6); // 음수 더함
    if (newHigh52) score += 4;
    if (newLow52) score -= 4;
    if (prevHighBreak) score += 3;

    return { consecutiveDays, gap, gapPct, newHigh52, newLow52, newHighN, newLowN,
      changeRate, rangeRate, prevHighBreak, score };
  }
};

const VolPattern = {
  analyze(rows) {
    const n = rows.length;
    if (n < 20) return { bullish: false, bearish: false, score: 0, volRatio: 1 };
    const vols = rows.map(r => r.volume);
    const avg20 = sma(vols, 20) || 1;
    const volRatio = vols[n - 1] / avg20;
    const bullish = volRatio > 1.5 && rows[n - 1].close > rows[n - 1].open;
    const bearish = volRatio > 1.5 && rows[n - 1].close < rows[n - 1].open;
    const score = bullish ? Math.min(10, Math.round((volRatio - 1) * 5)) : bearish ? -Math.min(10, Math.round((volRatio - 1) * 5)) : 0;
    return { bullish, bearish, score, volRatio };
  }
};

// ════════════════════════════════════════════════════════════
//  일목균형표 (Ichimoku) — S35
// ════════════════════════════════════════════════════════════
const Ichimoku = {
  calc(rows) {
    const n = rows.length;
    const empty = { tenkan: null, kijun: null, spanA: null, spanB: null, chikou: null,
      cloud: 'none', cloudTrend: 'none', priceVsCloud: 'none', signal: null, score: 0 };
    if (n < 52) return empty;
    const highs = rows.map(r => r.high), lows = rows.map(r => r.low), closes = rows.map(r => r.close);
    const midHL = (h, l, p) => {
      let hh = -Infinity, ll = Infinity;
      for (let i = n - p; i < n; i++) { if (h[i] > hh) hh = h[i]; if (l[i] < ll) ll = l[i]; }
      return (hh + ll) / 2;
    };
    const tenkan = midHL(highs, lows, 9);
    const kijun = midHL(highs, lows, 26);
    const spanA = (tenkan + kijun) / 2;
    // 선행스팬B: 52봉 중간값
    const spanB = midHL(highs, lows, 52);
    // 후행스팬: 현재 종가 (26봉 전에 표시)
    const chikou = closes[n - 1];
    // 과거 구름 (26봉 전에 계산된 선행스팬 → 현재 위치의 구름)
    // 간이: 현재 spanA/spanB를 구름으로 사용 (실시간 분석용)
    const cloudTop = Math.max(spanA, spanB);
    const cloudBot = Math.min(spanA, spanB);
    const price = closes[n - 1];
    // 가격 vs 구름
    let priceVsCloud = 'inside';
    if (price > cloudTop) priceVsCloud = 'above';
    else if (price < cloudBot) priceVsCloud = 'below';
    // 구름 색상 (spanA > spanB = 양운, 반대 = 음운)
    const cloud = spanA > spanB ? 'bullish' : spanA < spanB ? 'bearish' : 'flat';
    // 구름 전환 감지: 이전 봉 기준
    let cloudTrend = 'none';
    if (n >= 53) {
      const prevTenkan = (() => { let hh = -Infinity, ll = Infinity; for (let i = n - 10; i < n - 1; i++) { if (highs[i] > hh) hh = highs[i]; if (lows[i] < ll) ll = lows[i]; } return (hh + ll) / 2; })();
      const prevKijun = (() => { let hh = -Infinity, ll = Infinity; for (let i = n - 27; i < n - 1; i++) { if (highs[i] > hh) hh = highs[i]; if (lows[i] < ll) ll = lows[i]; } return (hh + ll) / 2; })();
      const prevSpanA = (prevTenkan + prevKijun) / 2;
      const prevSpanB = (() => { let hh = -Infinity, ll = Infinity; for (let i = n - 53; i < n - 1; i++) { if (highs[i] > hh) hh = highs[i]; if (lows[i] < ll) ll = lows[i]; } return (hh + ll) / 2; })();
      const prevCloud = prevSpanA > prevSpanB ? 'bullish' : 'bearish';
      if (prevCloud !== cloud) cloudTrend = 'twist';
      else cloudTrend = cloud === 'bullish' ? 'bullish' : 'bearish';
    }
    // 시그널
    let signal = null;
    if (tenkan > kijun && priceVsCloud === 'above') signal = { type: 'buy' };
    else if (tenkan < kijun && priceVsCloud === 'below') signal = { type: 'sell' };
    // 점수 (추세 보조)
    let score = 0;
    if (priceVsCloud === 'above') score += 4;
    else if (priceVsCloud === 'below') score -= 4;
    if (cloud === 'bullish') score += 2;
    else if (cloud === 'bearish') score -= 2;
    if (tenkan > kijun) score += 2;
    else if (tenkan < kijun) score -= 2;
    if (cloudTrend === 'twist') score += (cloud === 'bullish' ? 3 : -3);
    // 후행스팬 vs 26봉 전 종가
    if (n >= 27) {
      const past26 = closes[n - 27];
      if (chikou > past26) score += 1;
      else if (chikou < past26) score -= 1;
    }
    return { tenkan, kijun, spanA, spanB, chikou, cloud, cloudTrend, priceVsCloud, signal, score };
  }
};

// ════════════════════════════════════════════════════════════
//  Envelope — MA ±N% 밴드 (S35, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const Envelope = {
  calc(closes, period = 20, pct = 5) {
    const n = closes.length;
    if (n < period) return { upper: null, middle: null, lower: null, position: 'none' };
    const mid = sma(closes.slice(-period), period);
    const upper = mid * (1 + pct / 100);
    const lower = mid * (1 - pct / 100);
    const price = closes[n - 1];
    let position = 'middle';
    if (price > upper) position = 'above_upper';
    else if (price > upper * 0.99) position = 'near_upper';
    else if (price > mid) position = 'above_mid';
    else if (price < lower) position = 'below_lower';
    else if (price < lower * 1.01) position = 'near_lower';
    else position = 'below_mid';
    return { upper, middle: mid, lower, position, price };
  }
};

// ════════════════════════════════════════════════════════════
//  Pivot Point — 일간 피봇 (S35, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const PivotPoint = {
  calc(rows) {
    const n = rows.length;
    if (n < 2) return { P: null, R1: null, R2: null, R3: null, S1: null, S2: null, S3: null, level: 'none' };
    const prev = rows[n - 2];
    const H = prev.high, L = prev.low, C = prev.close;
    const P = (H + L + C) / 3;
    const R1 = 2 * P - L, S1 = 2 * P - H;
    const R2 = P + (H - L), S2 = P - (H - L);
    const R3 = H + 2 * (P - L), S3 = L - 2 * (H - P);
    const price = rows[n - 1].close;
    let level = 'P~R1';
    if (price >= R2) level = 'R2+';
    else if (price >= R1) level = 'R1~R2';
    else if (price >= P) level = 'P~R1';
    else if (price >= S1) level = 'S1~P';
    else if (price >= S2) level = 'S1~S2';
    else level = 'S2-';
    return { P, R1, R2, R3, S1, S2, S3, level, price };
  }
};

// ════════════════════════════════════════════════════════════
//  Price Channel — N일 고가/저가 채널 (S35, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const PriceChannel = {
  calc(rows, period = 20) {
    const n = rows.length;
    if (n < period + 1) return { upper: null, lower: null, mid: null, position: 'none' };
    let hh = -Infinity, ll = Infinity;
    for (let i = n - 1 - period; i < n - 1; i++) {
      if (rows[i].high > hh) hh = rows[i].high;
      if (rows[i].low < ll) ll = rows[i].low;
    }
    const mid = (hh + ll) / 2;
    const price = rows[n - 1].close;
    let position = 'middle';
    if (price > hh) position = 'breakout_up';
    else if (price < ll) position = 'breakout_down';
    else if (price > mid) position = 'upper_half';
    else position = 'lower_half';
    return { upper: hh, lower: ll, mid, position, price };
  }
};

// ════════════════════════════════════════════════════════════
//  MA 이격도 (S35, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const MADisparity = {
  calc(closes) {
    const n = closes.length;
    const price = closes[n - 1];
    const res = { ma20: null, ma60: null, disparity20: null, disparity60: null };
    if (n >= 20) { res.ma20 = sma(closes.slice(-20), 20); res.disparity20 = ((price / res.ma20) - 1) * 100; }
    if (n >= 60) { res.ma60 = sma(closes.slice(-60), 60); res.disparity60 = ((price / res.ma60) - 1) * 100; }
    return res;
  }
};

// ════════════════════════════════════════════════════════════
//  거래량 MA (S35, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const VolumeMA = {
  calc(rows) {
    const n = rows.length;
    const vols = rows.map(r => r.volume);
    const res = { vma5: null, vma20: null, vma60: null, vol: vols[n - 1] || 0, arrangement: 'none', breakout: false };
    if (n >= 5) res.vma5 = sma(vols.slice(-5), 5);
    if (n >= 20) res.vma20 = sma(vols.slice(-20), 20);
    if (n >= 60) res.vma60 = sma(vols.slice(-60), 60);
    if (res.vma5 && res.vma20 && res.vma60) {
      if (res.vma5 > res.vma20 && res.vma20 > res.vma60) res.arrangement = 'bullish';
      else if (res.vma5 < res.vma20 && res.vma20 < res.vma60) res.arrangement = 'bearish';
    }
    if (res.vma20 && res.vol > res.vma20 * 1.5) res.breakout = true;
    return res;
  }
};

// ════════════════════════════════════════════════════════════
//  A/D선 (Accumulation/Distribution) — S36, 엔진+점수
// ════════════════════════════════════════════════════════════
const AD = {
  calc(rows) {
    const n = rows.length;
    if (n < 2) return { val: 0, trend: 'flat', signal: null, score: 0 };
    let ad = 0;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const hl = rows[i].high - rows[i].low;
      const mfm = hl > 0 ? ((rows[i].close - rows[i].low) - (rows[i].high - rows[i].close)) / hl : 0;
      ad += mfm * rows[i].volume;
      arr.push(ad);
    }
    const sig20 = n >= 20 ? sma(arr.slice(-20), 20) : ad;
    const trend = ad > sig20 ? 'up' : ad < sig20 ? 'down' : 'flat';
    let signal = null;
    if (ad > sig20 * 1.03) signal = { type: 'buy' };
    else if (ad < sig20 * 0.97) signal = { type: 'sell' };
    // 다이버전스 (가격↓ A/D↑ = 매집)
    let score = 0;
    if (n >= 20) {
      const pNow = rows[n - 1].close, p10 = rows[n - 11]?.close || pNow;
      const adNow = arr[n - 1], ad10 = arr[n - 11] || adNow;
      if (pNow < p10 && adNow > ad10) score = 5; // 매집 다이버전스
      else if (pNow > p10 && adNow < ad10) score = -5; // 분산 다이버전스
      else if (trend === 'up') score = 2;
      else if (trend === 'down') score = -2;
    }
    return { val: ad, sig: sig20, arr, trend, signal, score };
  }
};

// ════════════════════════════════════════════════════════════
//  TRIX — Triple Exponential Average (S36, 점수 보조)
// ════════════════════════════════════════════════════════════
const TRIX = {
  calc(closes, period = 15) {
    const n = closes.length;
    if (n < period * 3 + 1) return { val: 0, signal: 0, histogram: 0, trend: 'flat', score: 0 };
    const e1 = emaArray(closes, period);
    const e2 = emaArray(e1, period);
    const e3 = emaArray(e2, period);
    const trix = [];
    for (let i = 1; i < e3.length; i++) {
      trix.push(e3[i - 1] !== 0 ? ((e3[i] - e3[i - 1]) / e3[i - 1]) * 100 : 0);
    }
    const sig = trix.length >= 9 ? sma(trix.slice(-9), 9) : (trix[trix.length - 1] || 0);
    const val = trix[trix.length - 1] || 0;
    const histogram = val - sig;
    const trend = val > sig ? 'up' : val < sig ? 'down' : 'flat';
    let score = 0;
    if (val > 0 && val > sig) score = 3;
    else if (val < 0 && val < sig) score = -3;
    else if (val > 0) score = 1;
    else if (val < 0) score = -1;
    return { val, signal: sig, histogram, trend, score };
  }
};

// ════════════════════════════════════════════════════════════
//  Stochastic Slow (S36, 조건검색 전용)
// ════════════════════════════════════════════════════════════
const StochSlow = {
  calc(rows, kPeriod = 14, dPeriod = 3, smooth = 3) {
    const n = rows.length;
    if (n < kPeriod + dPeriod + smooth) return { k: 50, d: 50, cross: 'none' };
    // Fast %K
    const fastK = [];
    for (let i = kPeriod - 1; i < n; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) { if (rows[j].high > hh) hh = rows[j].high; if (rows[j].low < ll) ll = rows[j].low; }
      fastK.push(hh !== ll ? ((rows[i].close - ll) / (hh - ll)) * 100 : 50);
    }
    // Slow %K = SMA(fastK, smooth)
    const slowK = smaArray(fastK, smooth);
    // Slow %D = SMA(slowK, dPeriod)
    const slowD = smaArray(slowK, dPeriod);
    const k = slowK[slowK.length - 1] || 50;
    const d = slowD[slowD.length - 1] || 50;
    const prevK = slowK[slowK.length - 2] || k;
    const prevD = slowD[slowD.length - 2] || d;
    let cross = 'none';
    if (prevK <= prevD && k > d) cross = 'golden';
    else if (prevK >= prevD && k < d) cross = 'dead';
    return { k, d, cross };
  }
};

// ════════════════════════════════════════════════════════════
//  MACD Oscillator (S36, 조건검색 전용)
//  MACD Histogram의 변화율 (모멘텀의 모멘텀)
// ════════════════════════════════════════════════════════════
const MACDOsc = {
  calc(closes) {
    const macdObj = MACD.calc(closes);
    const hist = macdObj.hist;
    const n = hist.length;
    if (n < 2) return { val: 0, trend: 'flat' };
    const val = hist[n - 1] - hist[n - 2];
    const prev = n >= 3 ? hist[n - 2] - hist[n - 3] : 0;
    let trend = 'flat';
    if (val > 0 && val > prev) trend = 'accelerating_up';
    else if (val > 0) trend = 'up';
    else if (val < 0 && val < prev) trend = 'accelerating_down';
    else if (val < 0) trend = 'down';
    return { val, trend };
  }
};

// ════════════════════════════════════════════════════════════
//  Price Oscillator (S36, 조건검색 전용)
//  (EMA short - EMA long) / EMA long * 100
// ════════════════════════════════════════════════════════════
const PriceOsc = {
  calc(closes, short = 12, long = 26) {
    const n = closes.length;
    if (n < long) return { val: 0, trend: 'flat' };
    const eS = ema(closes, short), eL = ema(closes, long);
    const val = eL !== 0 ? ((eS - eL) / eL) * 100 : 0;
    const trend = val > 0 ? 'up' : val < 0 ? 'down' : 'flat';
    return { val, trend };
  }
};

// ════════════════════════════════════════════════════════════
//  DVI / PVI (Daily/Positive Volume Index) — S36, 조건검색 전용
// ════════════════════════════════════════════════════════════
const VolIndex = {
  calc(rows) {
    const n = rows.length;
    if (n < 2) return { nvi: 1000, pvi: 1000, nviTrend: 'flat', pviTrend: 'flat' };
    let nvi = 1000, pvi = 1000;
    const nviArr = [1000], pviArr = [1000];
    for (let i = 1; i < n; i++) {
      const ret = (rows[i].close - rows[i - 1].close) / rows[i - 1].close;
      if (rows[i].volume < rows[i - 1].volume) { nvi *= (1 + ret); }
      else { pvi *= (1 + ret); }
      nviArr.push(nvi); pviArr.push(pvi);
    }
    const nviMa = n >= 20 ? sma(nviArr.slice(-20), 20) : nvi;
    const pviMa = n >= 20 ? sma(pviArr.slice(-20), 20) : pvi;
    return {
      nvi, pvi,
      nviTrend: nvi > nviMa ? 'up' : 'down',
      pviTrend: pvi > pviMa ? 'up' : 'down',
    };
  }
};

// ════════════════════════════════════════════════════════════
//  Standard Deviation / True Range — S36, 조건검색 전용
// ════════════════════════════════════════════════════════════
const Volatility = {
  stdDev(closes, period = 20) {
    const n = closes.length;
    if (n < period) return { val: 0, ratio: 0 };
    const slice = closes.slice(-period);
    const mean = sma(slice, period);
    let sum2 = 0; for (let i = 0; i < period; i++) sum2 += (slice[i] - mean) ** 2;
    const val = Math.sqrt(sum2 / period);
    return { val, ratio: mean > 0 ? (val / mean) * 100 : 0 };
  },
  trueRange(rows) {
    const n = rows.length;
    if (n < 2) return { val: 0, ratio: 0 };
    const curr = rows[n - 1], prev = rows[n - 2];
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    return { val: tr, ratio: curr.close > 0 ? (tr / curr.close) * 100 : 0 };
  },
  // DMI DX (Directional Movement Index)
  dx(rows, period = 14) {
    const n = rows.length;
    if (n < period + 1) return { val: 0 };
    // ADX already calculated by ADX module, but DX = |+DI - -DI| / (+DI + -DI) * 100
    const adxRes = ADX.calc(rows, period);
    const dx = (adxRes.pdi + adxRes.mdi) > 0 ? Math.abs(adxRes.pdi - adxRes.mdi) / (adxRes.pdi + adxRes.mdi) * 100 : 0;
    return { val: dx };
  }
};

// ════════════════════════════════════════════════════════════
//  Demark TD Sequential (S37, 조건검색 전용)
//  Setup 9 + Countdown 13 — 추세 소진 감지
// ════════════════════════════════════════════════════════════
const Demark = {
  calc(rows) {
    const n = rows.length;
    if (n < 15) return { setup: 0, setupDir: 'none', countdown: 0, perfected: false };
    // TD Setup — 현재가를 4봉 전과 비교
    let setupCount = 0, setupDir = 'none';
    for (let i = n - 1; i >= 4 && i >= n - 13; i--) {
      const cmp = rows[i].close > rows[i - 4].close ? 'up' : rows[i].close < rows[i - 4].close ? 'down' : 'flat';
      if (i === n - 1) { setupDir = cmp; setupCount = 1; continue; }
      if (cmp === setupDir && cmp !== 'flat') setupCount++;
      else break;
    }
    if (setupCount < 3) setupDir = 'none';
    // TD Countdown (간이) — setup ≥ 9일 때만
    let countdown = 0, perfected = false;
    if (setupCount >= 9) {
      // 매수셋업(down) → 현재봉 종가 vs 2봉전 저가
      // 매도셋업(up) → 현재봉 종가 vs 2봉전 고가
      let cnt = 0;
      for (let i = n - setupCount; i < n && cnt < 13; i++) {
        if (i < 2) continue;
        if (setupDir === 'down' && rows[i].close <= rows[i - 2].low) cnt++;
        else if (setupDir === 'up' && rows[i].close >= rows[i - 2].high) cnt++;
      }
      countdown = cnt;
      perfected = cnt >= 13;
    }
    return { setup: setupCount, setupDir, countdown, perfected };
  }
};

// ════════════════════════════════════════════════════════════
//  삼선전환도 (Three Line Break) — S37, 조건검색 전용
//  연속 3봉 돌파 시 전환 신호
// ════════════════════════════════════════════════════════════
const ThreeLineBreak = {
  calc(rows, lineCount = 3) {
    const n = rows.length;
    if (n < lineCount + 1) return { direction: 'flat', reversal: false, lines: 0 };
    // 삼선전환도 라인 생성
    const lines = [{ o: rows[0].open, c: rows[0].close }];
    for (let i = 1; i < n; i++) {
      const last = lines[lines.length - 1];
      const lookback = lines.slice(-lineCount);
      const hiMax = Math.max(...lookback.map(l => Math.max(l.o, l.c)));
      const loMin = Math.min(...lookback.map(l => Math.min(l.o, l.c)));
      if (rows[i].close > hiMax) lines.push({ o: last.c, c: rows[i].close });
      else if (rows[i].close < loMin) lines.push({ o: last.c, c: rows[i].close });
    }
    if (lines.length < 2) return { direction: 'flat', reversal: false, lines: lines.length };
    const cur = lines[lines.length - 1];
    const prev = lines[lines.length - 2];
    const curDir = cur.c > cur.o ? 'up' : cur.c < cur.o ? 'down' : 'flat';
    const prevDir = prev.c > prev.o ? 'up' : prev.c < prev.o ? 'down' : 'flat';
    const reversal = curDir !== 'flat' && prevDir !== 'flat' && curDir !== prevDir;
    return { direction: curDir, reversal, lines: lines.length };
  }
};

// ════════════════════════════════════════════════════════════
//  Binary Wave (S37, 조건검색 전용)
//  RSI/MACD/Stoch/BB/OBV 5개 지표의 이진 신호 합산 (-5 ~ +5)
// ════════════════════════════════════════════════════════════
const BinaryWave = {
  calc(ind) {
    let wave = 0;
    // RSI: >50 → +1, <50 → -1
    if (ind.rsi) { wave += ind.rsi.val > 50 ? 1 : ind.rsi.val < 50 ? -1 : 0; }
    // MACD: hist>0 → +1, <0 → -1
    if (ind.macd) { wave += ind.macd.hist > 0 ? 1 : ind.macd.hist < 0 ? -1 : 0; }
    // Stochastic: K>50 → +1, <50 → -1
    if (ind.stoch) { wave += ind.stoch.k > 50 ? 1 : ind.stoch.k < 50 ? -1 : 0; }
    // BB: pctB>0.5 → +1, <0.5 → -1
    if (ind.bb) { wave += ind.bb.pctB > 0.5 ? 1 : ind.bb.pctB < 0.5 ? -1 : 0; }
    // OBV: trend up → +1, down → -1
    if (ind.obv) { wave += ind.obv.trend === 'up' ? 1 : ind.obv.trend === 'down' ? -1 : 0; }
    return { wave, bullish: wave >= 3, bearish: wave <= -3, neutral: wave > -3 && wave < 3 };
  }
};

// ════════════════════════════════════════════════════════════
//  Sonar Momentum (S37, 조건검색 전용)
//  ROC 단기(5) - ROC 장기(20) 차이로 모멘텀 가속/감속 판별
// ════════════════════════════════════════════════════════════
const Sonar = {
  calc(closes, shortP = 5, longP = 20) {
    const n = closes.length;
    if (n < longP + 1) return { val: 0, trend: 'flat' };
    const rocShort = ((closes[n - 1] - closes[n - 1 - shortP]) / closes[n - 1 - shortP]) * 100;
    const rocLong = ((closes[n - 1] - closes[n - 1 - longP]) / closes[n - 1 - longP]) * 100;
    const val = rocShort - rocLong;
    // 양수 = 단기 모멘텀 > 장기 (가속중), 음수 = 감속/반전
    const trend = val > 1 ? 'accelerating' : val < -1 ? 'decelerating' : 'flat';
    return { val: Math.round(val * 100) / 100, trend };
  }
};

// ════════════════════════════════════════════════════════════
//  Mass Index (S37, 조건검색 전용)
//  변동성 확장→수축 reversal bulge 감지 (25일 합계, EMA9 기반)
// ════════════════════════════════════════════════════════════
const MassIndex = {
  calc(rows, period = 25) {
    const n = rows.length;
    if (n < period + 18) return { val: 0, bulge: false, setup: false };
    // High-Low 범위의 EMA9 와 EMA9의 EMA9
    const ranges = [];
    for (let i = 0; i < n; i++) ranges.push(rows[i].high - rows[i].low);
    const ema1 = emaArray(ranges, 9);
    const ema2 = emaArray(ema1, 9);
    // ratio = ema1 / ema2, Mass Index = sum of last N ratios
    if (ema2.length < period) return { val: 0, bulge: false, setup: false };
    let mi = 0;
    for (let i = ema2.length - period; i < ema2.length; i++) {
      mi += ema2[i] > 0 ? ema1[i] / ema2[i] : 1;
    }
    mi = Math.round(mi * 100) / 100;
    // Reversal Bulge: MI > 27 → setup, MI < 26.5 → bulge confirm
    const setup = mi > 27;
    // 이전 MI 확인 (간이)
    let prevMi = 0;
    if (ema2.length >= period + 1) {
      for (let i = ema2.length - period - 1; i < ema2.length - 1; i++) {
        prevMi += ema2[i] > 0 ? ema1[i] / ema2[i] : 1;
      }
    }
    const bulge = prevMi > 27 && mi < 26.5;
    return { val: mi, bulge, setup };
  }
};

// ════════════════════════════════════════════════════════════
//  VWAP — Volume Weighted Average Price (S39)
//  일봉 기준 누적 VWAP (N일 가중평균단가)
// ════════════════════════════════════════════════════════════
const VWAP = {
  calc(rows, period = 20) {
    const n = rows.length;
    if (n < 2) return { val: null, position: 'none' };
    const len = Math.min(n, period);
    let sumPV = 0, sumV = 0;
    for (let i = n - len; i < n; i++) {
      const tp = (rows[i].high + rows[i].low + rows[i].close) / 3;
      sumPV += tp * rows[i].volume;
      sumV += rows[i].volume;
    }
    const val = sumV > 0 ? sumPV / sumV : rows[n - 1].close;
    const price = rows[n - 1].close;
    const pct = val > 0 ? ((price - val) / val) * 100 : 0;
    let position = 'near'; // ±1% 이내
    if (pct > 3) position = 'above_far';
    else if (pct > 1) position = 'above';
    else if (pct < -3) position = 'below_far';
    else if (pct < -1) position = 'below';
    return { val, price, pct, position };
  }
};

// ════════════════════════════════════════════════════════════
//  S49 신규 지표 모듈 (5개): EOM, VHF, ChaikinOsc, Psycho, ABRatio
// ════════════════════════════════════════════════════════════

// ── EOM (Ease of Movement) ──
const EOM = {
  calc(rows, period = 14) {
    const n = rows.length;
    if (n < period + 1) return { val: null, sma: null, trend: 'none', cross: 'none' };
    const raw = [];
    for (let i = 1; i < n; i++) {
      const dm = ((rows[i].high + rows[i].low) / 2) - ((rows[i - 1].high + rows[i - 1].low) / 2);
      const boxRatio = rows[i].volume > 0 ? (rows[i].high - rows[i].low) / (rows[i].volume / 1e6) : 0;
      raw.push(boxRatio > 0 ? dm / boxRatio : 0);
    }
    const val = raw[raw.length - 1] || 0;
    const sigVal = sma(raw, period);
    const prevVal = raw.length >= 2 ? raw[raw.length - 2] : 0;
    let trend = 'none';
    if (val > 0 && sigVal > 0) trend = 'bullish';
    else if (val < 0 && sigVal < 0) trend = 'bearish';
    else trend = 'mixed';
    let cross = 'none';
    if (val > 0 && prevVal <= 0) cross = 'golden';
    else if (val < 0 && prevVal >= 0) cross = 'dead';
    return { val, sma: sigVal, trend, cross };
  }
};

// ── VHF (Vertical Horizontal Filter) ──
const VHF = {
  calc(closes, period = 28) {
    const n = closes.length;
    if (n < period + 1) return { val: null, trending: null };
    const slice = closes.slice(n - period);
    const highest = Math.max(...slice);
    const lowest = Math.min(...slice);
    const numerator = Math.abs(highest - lowest);
    let denominator = 0;
    for (let i = n - period + 1; i < n; i++) {
      denominator += Math.abs(closes[i] - closes[i - 1]);
    }
    const val = denominator > 0 ? numerator / denominator : 0;
    // VHF > 0.4 = 추세, < 0.3 = 횡보
    const trending = val > 0.4 ? 'trending' : val < 0.3 ? 'ranging' : 'moderate';
    return { val, trending };
  }
};

// ── Chaikin Oscillator (A/D 기반) ──
const ChaikinOsc = {
  calc(rows, fast = 3, slow = 10) {
    const n = rows.length;
    if (n < slow + 1) return { val: null, trend: 'none', cross: 'none' };
    // A/D Line 계산
    const adArr = [];
    let cumAD = 0;
    for (let i = 0; i < n; i++) {
      const hl = rows[i].high - rows[i].low;
      const mfm = hl > 0 ? ((rows[i].close - rows[i].low) - (rows[i].high - rows[i].close)) / hl : 0;
      cumAD += mfm * rows[i].volume;
      adArr.push(cumAD);
    }
    const fastEma = ema(adArr, fast);
    const slowEma = ema(adArr, slow);
    const val = fastEma - slowEma;
    // 이전값 (크로스 판별)
    const prevAdArr = adArr.slice(0, -1);
    const prevFast = prevAdArr.length >= fast ? ema(prevAdArr, fast) : null;
    const prevSlow = prevAdArr.length >= slow ? ema(prevAdArr, slow) : null;
    const prevVal = (prevFast != null && prevSlow != null) ? prevFast - prevSlow : null;
    let trend = val > 0 ? 'bullish' : val < 0 ? 'bearish' : 'none';
    let cross = 'none';
    if (prevVal != null) {
      if (val > 0 && prevVal <= 0) cross = 'golden';
      else if (val < 0 && prevVal >= 0) cross = 'dead';
    }
    return { val, trend, cross };
  }
};

// ── 심리도 / 신심리도 ──
const Psycho = {
  calc(closes, period = 12) {
    const n = closes.length;
    if (n < period + 1) return { psycho: null, newPsycho: null, zone: 'none' };
    // 심리도: period일 중 상승일 비율
    let upDays = 0;
    for (let i = n - period; i < n; i++) {
      if (closes[i] > closes[i - 1]) upDays++;
    }
    const psycho = (upDays / period) * 100;
    // 신심리도: (심리도 - 50) 누적의 EMA
    const rawArr = [];
    for (let j = period; j < n; j++) {
      let up = 0;
      for (let k = j - period + 1; k <= j; k++) {
        if (closes[k] > closes[k - 1]) up++;
      }
      rawArr.push((up / period) * 100 - 50);
    }
    const newPsycho = rawArr.length > 0 ? ema(rawArr, Math.min(period, rawArr.length)) + 50 : psycho;
    let zone = 'neutral';
    if (psycho >= 75) zone = 'overbought';
    else if (psycho <= 25) zone = 'oversold';
    else if (psycho >= 60) zone = 'bullish';
    else if (psycho <= 40) zone = 'bearish';
    return { psycho, newPsycho, zone };
  }
};

// ── AB Ratio ──
const ABRatio = {
  calc(rows, period = 20) {
    const n = rows.length;
    if (n < period) return { a: null, b: null, trend: 'none' };
    let sumA = 0, sumB = 0;
    for (let i = n - period; i < n; i++) {
      sumA += rows[i].high - rows[i].open; // A = 고가-시가 합
      sumB += rows[i].open - rows[i].low;  // B = 시가-저가 합
    }
    const a = sumA, b = sumB;
    const ratio = b > 0 ? a / b : (a > 0 ? 999 : 0);
    let trend = 'none';
    if (ratio > 1.2) trend = 'bullish';      // 매수세 우위
    else if (ratio < 0.8) trend = 'bearish';  // 매도세 우위
    else trend = 'neutral';
    return { a, b, ratio, trend };
  }
};

// ════════════════════════════════════════════════════════════
//  고급 엔진 (7개)
// ════════════════════════════════════════════════════════════

const PullbackScore = {
  calc(ind) {
    if (!ind.maAlign || !ind.trend) return { score: 0 };
    let s = 0;
    if (ind.maAlign.bullish) s += 20;
    if (ind.trend.pct > 0) s += 10;
    if (ind.rsi?.val < 40) s += 15;
    if (ind.rsi?.val < 30) s += 10;
    if (ind.bb?.pctB < 0.2) s += 15;
    if (ind.stoch?.k < 30) s += 10;
    if (ind.candle?.bullish) s += 10;
    if (ind.volPattern?.bullish) s += 10;
    return { score: clamp(s, 0, 100) };
  }
};

const ContextEngine = {
  analyze(ind) {
    let bonus = 0;
    const notes = [];
    if (ind.rsi?.val < 35 && ind.macd?.hist > 0) { bonus += 8; notes.push('RSI과매도+MACD양전'); }
    if (ind.rsi?.val > 65 && ind.macd?.hist < 0) { bonus -= 8; notes.push('RSI과매수+MACD음전'); }
    if (ind.maAlign?.bullish && ind.trend?.pct > 3) { bonus += 6; notes.push('정배열+상승추세'); }
    if (ind.maAlign?.bearish && ind.trend?.pct < -3) { bonus -= 6; notes.push('역배열+하락추세'); }
    if (ind.squeeze?.squeeze && ind.maAlign?.bullish) { bonus += 5; notes.push('스퀴즈+정배열'); }
    if (ind.bb?.pctB < 0.1 && ind.rsi?.val < 30) { bonus += 7; notes.push('BB하단+RSI과매도'); }
    if (ind.bb?.pctB > 0.9 && ind.rsi?.val > 70) { bonus -= 7; notes.push('BB상단+RSI과매수'); }
    if (ind.volPattern?.bullish && ind.candle?.bullish) { bonus += 5; notes.push('거래량확인+강세캔들'); }
    if (ind.volPattern?.bearish && ind.candle?.bearish) { bonus -= 5; notes.push('매도거래량+약세캔들'); }
    if (ind.obv?.div === 'bullish') { bonus += 6; notes.push('OBV상승다이버전스'); }
    if (ind.obv?.div === 'bearish') { bonus -= 6; notes.push('OBV하락다이버전스'); }
    if (ind.adx?.adx > 30 && ind.adx?.pdi > ind.adx?.mdi) { bonus += 4; notes.push('강한상승추세ADX'); }
    if (ind.adx?.adx > 30 && ind.adx?.mdi > ind.adx?.pdi) { bonus -= 4; notes.push('강한하락추세ADX'); }
    if (ind.pullback?.score >= 60) { bonus += 5; notes.push('눌림목 호조건'); }
    if (ind.rsi?.div === 'bullish') { bonus += 6; notes.push('RSI상승다이버전스'); }
    if (ind.rsi?.div === 'bearish') { bonus -= 6; notes.push('RSI하락다이버전스'); }
    if (ind.stoch?.k < 20 && ind.stoch?.k > ind.stoch?.d) { bonus += 4; notes.push('Stoch과매도반전'); }
    if (ind.stoch?.k > 80 && ind.stoch?.k < ind.stoch?.d) { bonus -= 4; notes.push('Stoch과매수반전'); }
    return { bonus: clamp(bonus, -35, 35), notes };
  }
};

// ════════════════════════════════════════════════════════════
//  시장환경 판정 (MarketEnv) — S45→S47
//  자체 실시간 지수 fetch (SX_MARKET_INDEX) 기반 독립 판정
//  ORACLE_MARKET_ENV 의존 완전 제거
//  시장별 지수 매핑:
//    kr  → KOSPI(^KS11) + KOSDAQ(^KQ11)
//    us  → S&P500(^GSPC) + NASDAQ(^IXIC) + DOW(^DJI)
//    coin → BTC (BTCUSDT/Upbit)
// ════════════════════════════════════════════════════════════
const MarketEnv = {
  _cache: null, _cacheTs: 0,
  // 스크리너가 fetch한 실시간 지수 데이터 (SX_MARKET_INDEX)
  _liveIndex: null,
  /**
   * 시장환경 데이터 로드 (5분 캐시)
   * S47: ORACLE 의존 제거 — 자체 실시간 지수 fetch만 사용
   */
  load() {
    if (this._cache && Date.now() - this._cacheTs < 300000) return this._cache;
    const result = {
      kospi: null, kosdaq: null,
      sp500: null, nasdaq: null, dow: null,
      btc: null,
      overall: { state: 'neutral', score: 0 }
    };
    try {
      // ── 실시간 지수 데이터 (스크리너 fetch or localStorage) ──
      let live = this._liveIndex;
      if (!live) {
        try {
          const saved = localStorage.getItem('SX_MARKET_INDEX');
          if (saved) {
            const d = JSON.parse(saved);
            if (d._ts && Date.now() - d._ts < 900000) live = d; // 15분 캐시
          }
        } catch (_) {}
      }
      const classify = (cr) => {
        if (cr == null || isNaN(cr)) return { dir: 'unknown', score: 0 };
        if (cr > 1.5) return { dir: 'bull', score: 2 };
        if (cr > 0.3) return { dir: 'mild_bull', score: 1 };
        if (cr > -0.3) return { dir: 'flat', score: 0 };
        if (cr > -1.5) return { dir: 'mild_bear', score: -1 };
        return { dir: 'bear', score: -2 };
      };
      const mkEntry = (name, cr, price) => {
        if (cr == null) return null;
        const c = classify(cr);
        return { name, changeRate: cr, close: price || 0, dir: c.dir, score: c.score };
      };
      if (live) {
        result.kospi = mkEntry('KOSPI', live.kospi?.cr, live.kospi?.close);
        result.kosdaq = mkEntry('KOSDAQ', live.kosdaq?.cr, live.kosdaq?.close);
        result.sp500 = mkEntry('S&P500', live.sp500?.cr, live.sp500?.close);
        result.nasdaq = mkEntry('NASDAQ', live.nasdaq?.cr, live.nasdaq?.close);
        result.dow = mkEntry('DOW', live.dow?.cr, live.dow?.close);
        result.btc = mkEntry('BTC', live.btc?.cr, live.btc?.close);
      }
      // ── 종합 점수 (지수 등락률만으로 판정) ──
      const allScores = [
        result.kospi?.score, result.kosdaq?.score,
        result.sp500?.score, result.nasdaq?.score, result.dow?.score,
        result.btc?.score
      ].filter(v => v != null && v !== 0);
      const avgScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
      const ovrState = avgScore > 0.8 ? 'bull' : avgScore > 0.2 ? 'mild_bull' : avgScore < -0.8 ? 'bear' : avgScore < -0.2 ? 'mild_bear' : 'neutral';
      result.overall = { state: ovrState, score: avgScore };
    } catch (e) { console.warn('[MarketEnv] load err', e); }
    this._cache = result;
    this._cacheTs = Date.now();
    return result;
  },
  /** 실시간 지수 저장 (스크리너 fetch 후 호출) */
  setLiveIndex(data) {
    this._liveIndex = { ...data, _ts: Date.now() };
    try { localStorage.setItem('SX_MARKET_INDEX', JSON.stringify(this._liveIndex)); } catch (_) {}
    this._cache = null; // 캐시 초기화하여 다음 load에서 갱신
  },
  /** scrComputeScore용 가중치 (시장별) */
  getWeight(market) {
    const env = this.load();
    if (!env) return 0;
    if (market === 'coin') {
      if (!env.btc || env.btc.dir === 'unknown') return 0;
      return clamp(env.btc.score * 4, -8, 8);
    } else if (market === 'us') {
      const scores = [env.sp500?.score, env.nasdaq?.score, env.dow?.score].filter(v => v != null);
      if (scores.length) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return clamp(avg * 4, -8, 8);
      }
      return 0;
    } else {
      // 국내: KOSPI/KOSDAQ 가중 평균
      const scores = [env.kospi?.score, env.kosdaq?.score].filter(v => v != null);
      if (scores.length) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return clamp(avg * 4, -8, 8);
      }
      return 0;
    }
  },
  /** 조건검색용 상태 판정 */
  getState(market) {
    const env = this.load();
    if (market === 'coin') return env.btc ? env.btc.dir : env.overall.state;
    if (market === 'us') {
      const scores = [env.sp500?.score, env.nasdaq?.score, env.dow?.score].filter(v => v != null);
      if (scores.length) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return avg > 0.8 ? 'bull' : avg > 0.2 ? 'mild_bull' : avg < -0.8 ? 'bear' : avg < -0.2 ? 'mild_bear' : 'neutral';
      }
      return env.overall.state;
    }
    // 국내
    const scores = [env.kospi?.score, env.kosdaq?.score].filter(v => v != null);
    if (scores.length) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return avg > 0.8 ? 'bull' : avg > 0.2 ? 'mild_bull' : avg < -0.8 ? 'bear' : avg < -0.2 ? 'mild_bear' : 'neutral';
    }
    return env.overall.state;
  },
  /** 지수 등락률 반환 (시장별, 지수별) */
  getChangeRate(market, indexId) {
    const env = this.load();
    if (indexId) return env[indexId]?.changeRate ?? null;
    if (market === 'coin') return env.btc?.changeRate ?? null;
    if (market === 'us') return env.nasdaq?.changeRate ?? env.sp500?.changeRate ?? null;
    return env.kospi?.changeRate ?? env.kosdaq?.changeRate ?? null;
  },
  /** UI용 환경 요약 */
  getSummary(market) {
    const env = this.load();
    const state = this.getState(market);
    const stateLabel = { bull: '🟢 강세', mild_bull: '🔵 약강', neutral: '⚪ 중립', mild_bear: '🟡 약세', bear: '🔴 약세', unknown: '⚫ 미확인' }[state] || '⚫ 미확인';
    const indices = [];
    if (market === 'kr' || market === 'all') {
      if (env.kospi?.changeRate != null) indices.push(`KOSPI ${env.kospi.changeRate >= 0 ? '+' : ''}${env.kospi.changeRate.toFixed(2)}%`);
      if (env.kosdaq?.changeRate != null) indices.push(`KOSDAQ ${env.kosdaq.changeRate >= 0 ? '+' : ''}${env.kosdaq.changeRate.toFixed(2)}%`);
    }
    if (market === 'us' || market === 'all') {
      if (env.nasdaq?.changeRate != null) indices.push(`NASDAQ ${env.nasdaq.changeRate >= 0 ? '+' : ''}${env.nasdaq.changeRate.toFixed(2)}%`);
      if (env.sp500?.changeRate != null) indices.push(`S&P ${env.sp500.changeRate >= 0 ? '+' : ''}${env.sp500.changeRate.toFixed(2)}%`);
    }
    if (market === 'coin' || market === 'all') {
      if (env.btc?.changeRate != null) indices.push(`BTC ${env.btc.changeRate >= 0 ? '+' : ''}${env.btc.changeRate.toFixed(2)}%`);
    }
    // 지수 데이터 존재 여부 + 캐시 나이
    const liveTs = this._liveIndex?._ts;
    const ageStr = liveTs ? (()=>{ const m = Math.round((Date.now()-liveTs)/60000); return m < 60 ? `${m}분전` : `${Math.round(m/60)}시간전`; })() : null;
    return { state, stateLabel, indices, ageStr };
  }
};

const SwingStructure = {
  analyze(rows) {
    const n = rows.length;
    if (n < 20) return { higherHighs: false, lowerLows: false, swings: [] };
    const swings = [];
    for (let i = 3; i < n - 3; i++) {
      const isHigh = rows[i].high >= Math.max(rows[i - 1].high, rows[i - 2].high, rows[i + 1].high, rows[i + 2].high);
      const isLow = rows[i].low <= Math.min(rows[i - 1].low, rows[i - 2].low, rows[i + 1].low, rows[i + 2].low);
      if (isHigh) swings.push({ type: 'H', price: rows[i].high, idx: i });
      if (isLow) swings.push({ type: 'L', price: rows[i].low, idx: i });
    }
    const highs = swings.filter(s => s.type === 'H').slice(-3);
    const lows = swings.filter(s => s.type === 'L').slice(-3);
    const higherHighs = highs.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price;
    const lowerLows = lows.length >= 2 && lows[lows.length - 1].price < lows[lows.length - 2].price;
    return { higherHighs, lowerLows, swings: swings.slice(-6) };
  }
};

const MAConvergence = {
  analyze(closes) {
    if (closes.length < 60) return { converging: false, spread: 0 };
    const m5 = sma(closes, 5), m20 = sma(closes, 20), m60 = sma(closes, 60);
    if (!m5 || !m20 || !m60) return { converging: false, spread: 0 };
    const avg = (m5 + m20 + m60) / 3;
    const spread = Math.max(m5, m20, m60) - Math.min(m5, m20, m60);
    const spreadPct = avg > 0 ? (spread / avg) * 100 : 0;
    return { converging: spreadPct < 1.5, spread: spreadPct };
  }
};

const StochDivergence = {
  calc(rows) {
    const n = rows.length;
    if (n < 30) return null;
    const stochArr = [];
    for (let i = 13; i < n; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - 13; j <= i; j++) { hi = Math.max(hi, rows[j].high); lo = Math.min(lo, rows[j].low); }
      stochArr.push(hi === lo ? 50 : (rows[i].close - lo) / (hi - lo) * 100);
    }
    const seg = 10;
    if (stochArr.length < seg * 2) return null;
    const rP = rows.slice(-seg).map(r => r.close), pP = rows.slice(-seg * 2, -seg).map(r => r.close);
    const rS = stochArr.slice(-seg), pS = stochArr.slice(-seg * 2, -seg);
    if (Math.min(...rP) < Math.min(...pP) && Math.min(...rS) > Math.min(...pS)) return 'bullish';
    if (Math.max(...rP) > Math.max(...pP) && Math.max(...rS) < Math.max(...pS)) return 'bearish';
    return null;
  }
};

const PsychLevel = {
  analyze(price) {
    if (!price || price <= 0) return { near: false, level: 0 };
    const mag = Math.pow(10, Math.floor(Math.log10(price)));
    const round = Math.round(price / mag) * mag;
    const dist = Math.abs(price - round) / price * 100;
    return { near: dist < 2, level: round };
  }
};

const MarketRegime = {
  detect(ind) {
    if (!ind.adx || !ind.bb || !ind.trend) return { label: '불명', icon: '❓', direction: 'FLAT', score: 50 };
    const adx = ind.adx.adx ?? 0;
    const bbW = ind.bb.width ?? 0;
    const slope = ind.trend.slope ?? 0;
    let score = 50;
    if (adx > 25) score += 15; if (adx > 40) score += 10;
    if (slope > 0.01) score += 10; if (slope > 0.03) score += 5;
    if (slope < -0.01) score -= 10; if (slope < -0.03) score -= 5;
    if (bbW > 3) score += 5; if (bbW < 1.5) score -= 5;
    score = clamp(score, 0, 100);
    const direction = score > 60 && slope > 0 ? 'UP' : score < 40 || slope < -0.01 ? 'DOWN' : 'FLAT';
    let label, icon;
    if (adx > 30 && bbW > 3) { label = '추세+변동'; icon = '🔥'; }
    else if (adx > 25) { label = '추세장'; icon = '📈'; }
    else if (bbW < 1.5) { label = '횡보장'; icon = '〰️'; }
    else { label = '전환기'; icon = '🔄'; }
    return { label, icon, direction, score, adx, bbWidth: bbW };
  }
};

// ════════════════════════════════════════════════════════════
//  S71: 레짐 적응형 파라미터 (Regime-Adaptive Parameters)
//  레짐 상태에 따라 buyTh/sellTh/tpMult/slMult 보정값 반환
//  설계: 상승추세→공격적(buyTh↓,tp↑,sl↓), 하락→보수적(buyTh↑,tp↓,sl↑), 횡보→중립
// ════════════════════════════════════════════════════════════
const SX_REGIME_ADAPT_KEY = 'SX_REGIME_ADAPT';

SXE.regimeAdaptEnabled = function(){
  try{ return localStorage.getItem(SX_REGIME_ADAPT_KEY) !== 'off'; }catch(e){ return true; }
};
SXE.setRegimeAdapt = function(on){
  localStorage.setItem(SX_REGIME_ADAPT_KEY, on ? 'on' : 'off');
};

SXE.regimeAdapt = function(regime){
  // 기본값: 보정 없음
  const r = { buyThAdj: 0, sellThAdj: 0, tpMultFactor: 1.0, slMultFactor: 1.0, label: '기본', detail: '' };
  if(!regime) return r;

  const dir = regime.direction || 'FLAT';
  const adx = regime.adx ?? 0;
  const bbW = regime.bbWidth ?? 0;
  const label = regime.label || '';

  if(dir === 'UP' && adx > 25){
    // 추세+변동 먼저 체크 (adx>30 && bbW>3)
    if(label === '추세+변동'){
      r.buyThAdj = -2;
      r.tpMultFactor = 1.3;
      r.slMultFactor = 1.1; // 변동성 높아 손절 살짝 여유
      r.label = '공격+경계';
      r.detail = '추세+고변동 — 수익 기회는 크지만 변동폭도 넓어 손절 여유를 약간 둡니다.';
    } else {
      // 일반 상승 추세
      r.buyThAdj = -3;
      r.sellThAdj = -2;
      r.tpMultFactor = 1.2;
      r.slMultFactor = 0.85;
      r.label = '공격';
      r.detail = '상승 추세 감지 — 진입 문턱 낮추고 목표가 확대. 추세를 따라가는 전략에 유리합니다.';
      if(adx > 40){
        r.buyThAdj = -5;
        r.tpMultFactor = 1.35;
        r.slMultFactor = 0.75;
        r.detail = '강한 상승 추세 — 진입을 적극적으로, 목표를 크게 잡아도 도달 확률이 높습니다.';
      }
    }
  } else if(dir === 'DOWN'){
    // 추세+변동(하락) 먼저 체크
    if(label === '추세+변동'){
      r.buyThAdj = 6;
      r.tpMultFactor = 0.7;
      r.slMultFactor = 1.3;
      r.label = '방어+경계';
      r.detail = '하락 추세+고변동 — 매우 위험한 환경. 진입 기준을 크게 높이고 손절 여유를 확보하세요.';
    } else {
      // 일반 하락 추세
      r.buyThAdj = 5;
      r.sellThAdj = 3;
      r.tpMultFactor = 0.75;
      r.slMultFactor = 1.25;
      r.label = '보수';
      r.detail = '하락 추세 감지 — 진입 기준 강화, 목표는 보수적으로. 역추세 매매는 신중하게 접근하세요.';
      if(adx > 40){
        r.buyThAdj = 8;
        r.tpMultFactor = 0.6;
        r.slMultFactor = 1.4;
        r.label = '방어';
        r.detail = '강한 하락 추세 — 매수 진입 기준을 크게 높이고, 목표는 최소화. 방어적 자세가 최우선입니다.';
      }
    }
  } else if(label === '횡보장'){
    // 횡보: 중립, 박스권 대응
    r.buyThAdj = 2;
    r.sellThAdj = -2;
    r.tpMultFactor = 0.85;
    r.slMultFactor = 0.9;
    r.label = '박스';
    r.detail = '횡보장 — 돌파 실패 가능성이 높으므로 목표를 낮추고 빠른 수익 실현에 초점을 맞추세요.';
  }
  // 전환기: 기본값 유지 (보정 없음)

  return r;
};

// regimeAdapt 적용 헬퍼 — buyTh/sellTh/tpMult/slMult에 보정값 합산
SXE._applyRegimeAdapt = function(baseBuyTh, baseSellTh, baseTpMult, baseSlMult, regime){
  if(!SXE.regimeAdaptEnabled()) return { buyTh: baseBuyTh, sellTh: baseSellTh, tpMult: baseTpMult, slMult: baseSlMult, adapt: null };
  const adapt = SXE.regimeAdapt(regime);
  return {
    buyTh: clamp(baseBuyTh + adapt.buyThAdj, 40, 85),
    sellTh: clamp(baseSellTh + adapt.sellThAdj, 20, 50),
    tpMult: baseTpMult * adapt.tpMultFactor,
    slMult: baseSlMult * adapt.slMultFactor,
    adapt
  };
};

// ════════════════════════════════════════════════════════════
//  통합 지표 계산 (calcAllScreener)
// ════════════════════════════════════════════════════════════
const _volCache = {};

function calcAllScreener(rows, tf) {
  const ip = _loadAnalParams();
  const closes = rows.map(r => r.close);
  const n = closes.length;
  const price = closes[n - 1];

  const rsiArr = RSI.calc(closes, ip.rsiLen);
  const rsiVal = rsiArr[n - 1] ?? 50;
  const macdObj = MACD.calc(closes);
  const stochVal = Stochastic.calc(rows);
  const cciVal = CCI.calc(rows);
  const adxVal = ADX.calc(rows, 14);
  const obvObj = OBV.calc(rows);
  const volOsc = VolumeOSC.calc(rows);
  const bbVal = BollingerBands.calc(closes, ip.bbLen, ip.bbMult);
  const squeeze = BollingerBands.squeeze(closes, ip.bbLen);
  const maAlign = MA.alignment(closes, tf, ip);
  const { pct: trendPct, slope } = Trend.calc(closes);
  const struct = Trend.structure(rows);
  const srLvls = Trend.levels(rows);
  const fib = Trend.fibonacci(rows);
  const atrObj = ATR.calc(rows, ip.atrLen);
  const rsiDiv = RSI.divergence(closes, rsiArr);
  const obvDiv = OBV.divergence(rows);
  const candle = Candle.analyze(rows);
  const volPattern = VolPattern.analyze(rows);
  const priceAction = PriceAction.analyze(rows);
  const ichimoku = Ichimoku.calc(rows);
  const envelope = Envelope.calc(closes);
  const pivotPt = PivotPoint.calc(rows);
  const priceCh = PriceChannel.calc(rows);
  const maDisp = MADisparity.calc(closes);
  const volMA = VolumeMA.calc(rows);
  const adLine = AD.calc(rows);
  const trix = TRIX.calc(closes);
  const stochSlow = StochSlow.calc(rows);
  const macdOsc = MACDOsc.calc(closes);
  const priceOsc = PriceOsc.calc(closes);
  const volIdx = VolIndex.calc(rows);
  const stdDev = Volatility.stdDev(closes);
  const trueRange = Volatility.trueRange(rows);
  const dxVal = Volatility.dx(rows);
  const demark = Demark.calc(rows);
  const threeLineBreak = ThreeLineBreak.calc(rows);
  const sonar = Sonar.calc(closes);
  const massIndex = MassIndex.calc(rows);
  const vwap = VWAP.calc(rows);
  // S49: 신규 5개 지표
  const eom = EOM.calc(rows);
  const vhf = VHF.calc(closes);
  const chaikinOsc = ChaikinOsc.calc(rows);
  const psycho = Psycho.calc(closes);
  const abRatio = ABRatio.calc(rows);
  const macdHist = macdObj.hist[n - 1] || 0;
  const macdHistPct = price ? (macdHist / price) * 100 : 0;

  const base = {
    price,
    rsi: { val: rsiVal, arr: rsiArr, div: rsiDiv },
    macd: { line: macdObj.line[n - 1], sig: macdObj.sig[n - 1], hist: macdHist, histPct: macdHistPct, arr: macdObj },
    stoch: stochVal,
    cci: cciVal,
    adx: adxVal,
    obv: { ...obvObj, div: obvDiv },
    volOsc,
    bb: { ...bbVal, price },
    squeeze,
    maAlign,
    trend: { pct: trendPct, slope, struct, levels: srLvls, fib },
    atr: atrObj,
    candle,
    volPattern,
    priceAction,
    ichimoku,
    envelope,
    pivot: pivotPt,
    priceChannel: priceCh,
    maDisparity: maDisp,
    volumeMA: volMA,
    ad: adLine,
    trix,
    stochSlow,
    macdOsc,
    priceOsc,
    volIndex: volIdx,
    stdDev,
    trueRange,
    dx: dxVal,
    demark,
    threeLineBreak,
    sonar,
    massIndex,
    vwap,
    eom, vhf, chaikinOsc, psycho, abRatio, // S49
    rows, closes,
  };

  base.pullback = PullbackScore.calc(base);
  base.binaryWave = BinaryWave.calc(base);
  base.context = ContextEngine.analyze(base);
  base.swingStruct = SwingStructure.analyze(rows);
  base.maConv = MAConvergence.analyze(closes);
  base.stochDiv = StochDivergence.calc(rows);
  base.psychLevel = PsychLevel.analyze(price);
  base.regime = MarketRegime.detect(base);

  // 레거시 호환 (checkTechConditions 용)
  base.ma5 = maAlign.short;
  base.ma20 = maAlign.mid;
  base.ma60 = maAlign.long;
  base.ma120 = maAlign.xlong;
  base.rsiLegacy = rsiVal;
  base.macdLegacy = {
    macd: macdObj.line[n - 1] || 0,
    signal: macdObj.sig[n - 1] || 0,
    histogram: macdHist,
    prevHist: macdObj.hist[n - 2] || 0,
    recentGolden: n >= 3 && macdObj.hist[n - 1] > 0 && (macdObj.hist[n - 2] <= 0 || macdObj.hist[n - 3] <= 0),
    recentDead: n >= 3 && macdObj.hist[n - 1] < 0 && (macdObj.hist[n - 2] >= 0 || macdObj.hist[n - 3] >= 0),
  };
  base.stochLegacy = stochVal;
  base.bbLegacy = {
    upper: bbVal.upper, middle: bbVal.middle, lower: bbVal.lower,
    pctB: bbVal.pctB, last: price, isSqueeze: squeeze.squeeze,
    width: bbVal.width
  };
  base.adxLegacy = { adx: adxVal.adx, plusDI: adxVal.pdi, minusDI: adxVal.mdi };
  base.obvLegacy = obvObj;
  base.patternsLegacy = candle;
  base.ichimokuLegacy = ichimoku;
  base.envelopeLegacy = envelope;
  base.pivotLegacy = pivotPt;
  base.priceChannelLegacy = priceCh;
  base.maDisparityLegacy = maDisp;
  base.volumeMALegacy = volMA;
  base.adLegacy = adLine;
  base.trixLegacy = trix;
  base.stochSlowLegacy = stochSlow;
  base.macdOscLegacy = macdOsc;
  base.priceOscLegacy = priceOsc;
  base.volIndexLegacy = volIdx;
  base.stdDevLegacy = stdDev;
  base.trueRangeLegacy = trueRange;
  base.dxLegacy = dxVal;
  base.demarkLegacy = demark;
  base.threeLineBreakLegacy = threeLineBreak;
  base.binaryWaveLegacy = base.binaryWave;
  base.sonarLegacy = sonar;
  base.massIndexLegacy = massIndex;
  base.vwapLegacy = vwap;
  // S49: 신규 지표 레거시
  base.eomLegacy = eom;
  base.vhfLegacy = vhf;
  base.chaikinOscLegacy = chaikinOsc;
  base.psychoLegacy = psycho;
  base.abRatioLegacy = abRatio;
  base.swingStructLegacy = base.swingStruct;

  return base;
}

// ════════════════════════════════════════════════════════════
//  종합 점수 산출 (scrComputeScore)
// ════════════════════════════════════════════════════════════
function scrComputeScore(ind, volSoft, ctxBonus) {
  let s = 50;
  s += clamp(ind.trend.pct * 4.0, -28, 28);
  s += clamp(ind.trend.slope * 18.0, -18, 18);
  s += clamp((50 - ind.rsi.val) * 0.65, -32, 32);
  s += clamp(Math.tanh(ind.macd.histPct * 0.35) * 18, -18, 18);
  s += clamp(Math.tanh((1.6 - volSoft) * 0.9) * 18, -18, 18);
  let st = clamp((0.5 - ind.trend.struct.pos) * 26.0, -14, 14);
  if (ind.trend.struct.nearSupport) st += 10;
  if (ind.trend.struct.nearResistance) st -= 10;
  s += clamp(st, -22, 22);
  if (ind.rsi.div === 'bearish') s -= 8;
  if (ind.rsi.div === 'bullish') s += 8;
  let b = 0;
  // S97: 개별 sub signal 추적 — _breakdown.subDetail로 직접 참조 지원 (SUBSIG)
  const _subDetail = {};
  if (ind.rsi.div === 'bullish') { b += 6; _subDetail.rsiDiv = 6; } if (ind.rsi.div === 'bearish') { b -= 6; _subDetail.rsiDiv = -6; }
  if (ind.obv.div === 'bullish') { b += 7; _subDetail.obvDiv = 7; } if (ind.obv.div === 'bearish') { b -= 7; _subDetail.obvDiv = -7; }
  const add = (sig, w, key) => { if (!sig) return; if (sig.type === 'buy') { b += w; _subDetail[key] = w; } if (sig.type === 'sell') { b -= w; _subDetail[key] = -w; } };
  add(Stochastic.signal(ind.stoch.k, ind.stoch.d), 3, 'stoch');
  add(CCI.signal(ind.cci), 3, 'cci');
  add(OBV.signal(ind.obv.val, ind.obv.sig), 5, 'obv');
  add(VolumeOSC.signal(ind.volOsc), 2, 'volOsc');
  add(MA.signal(ind.maAlign), 5, 'maAlign');
  add(BollingerBands.signal(ind.bb.price, ind.bb), 3, 'bb');
  add(ADX.signal(ind.adx.adx, ind.adx.pdi, ind.adx.mdi), 2, 'adx');
  if (ind.ichimoku) add(ind.ichimoku.signal, 3, 'ichimoku');
  if (ind.ad) add(ind.ad.signal, 4, 'ad');
  if (ind.candle.bullish) { const _cv = clamp(ind.candle.score, 0, 12); b += _cv; _subDetail.candle = _cv; }
  if (ind.candle.bearish) { const _cv = -clamp(Math.abs(ind.candle.score), 0, 12); b += _cv; _subDetail.candle = _cv; }
  if (ind.volPattern.bullish) { const _vv = clamp(ind.volPattern.score, 0, 10); b += _vv; _subDetail.volPattern = _vv; }
  if (ind.volPattern.bearish) { const _vv = -clamp(Math.abs(ind.volPattern.score), 0, 10); b += _vv; _subDetail.volPattern = _vv; }
  b = clamp(b, -30, 30);
  let aux = 0;
  {
    const hArr = ind.macd.arr.hist, len = hArr.length;
    if (len >= 3) {
      const h1 = hArr[len - 1], h2 = hArr[len - 2], h3 = hArr[len - 3];
      if (h1 > 0 && h1 < h2 && h2 < h3) {
        const dr = h3 > 0 ? (1 - h1 / h3) * 100 : 0;
        if (dr >= 50) aux -= 8; else if (dr >= 30) aux -= 6; else aux -= 4;
      } else if (h1 > 0 && h1 < h2) aux -= 3;
    }
  }
  aux = clamp(aux, -16, 16);
  // S33: PriceAction 보조점수 (갭+연속+신고/저)
  if (ind.priceAction) {
    const pa = ind.priceAction;
    aux += clamp(pa.score * 0.5, -8, 8);
  }
  // S35: 일목균형표 보조점수 (추세 보조)
  if (ind.ichimoku) {
    aux += clamp(ind.ichimoku.score * 0.4, -6, 6);
  }
  // S36: A/D선 보조점수 (수급 보조)
  if (ind.ad) {
    aux += clamp(ind.ad.score * 0.5, -4, 4);
  }
  // S36: TRIX 보조점수 (모멘텀 보조)
  if (ind.trix) {
    aux += clamp(ind.trix.score * 0.5, -3, 3);
  }
  // S37: BinaryWave 보조점수 (다중지표 복합 신호)
  if (ind.binaryWave) {
    aux += clamp(ind.binaryWave.wave * 0.6, -3, 3);
  }
  aux = clamp(aux, -38, 38);
  // S63: 비기술 가중치 — 점수 합산에서 제거, 해석 레이어 전용
  // 진입타이밍 = 순수 기술 점수, 비기술(시장환경/재무/매크로/공시)은 해석으로 분리
  const _mktW = (typeof _scrMarketWeight === 'number') ? _scrMarketWeight : 0;
  const _funW = (typeof _scrFundamentalWeight === 'number') ? _scrFundamentalWeight : 0;
  const _macW = (typeof _scrMacroWeight === 'number') ? _scrMacroWeight : 0;
  const _disW = (typeof _scrDisclosureWeight === 'number') ? _scrDisclosureWeight : 0;
  const combined = clamp(s + b * 0.5 + clamp(ctxBonus, -35, 35) * 0.8 + aux, 0, 100);
  const rawScore = Math.round(clamp(50 + 50 * Math.tanh(((combined - 50) / 50) * SCR_SCORING.tanh), 0, 100));
  const mom = clamp(ind.trend.pct * 4.0, -28, 28) + clamp(ind.trend.slope * 18.0, -18, 18);
  const osc = clamp((ind.rsi.val - 50) * 0.7, -32, 32) + clamp(Math.tanh(ind.macd.histPct * 0.35) * 18, -18, 18);
  // S48: 점수 산출 내역 (종목명카드 표시용)
  const _breakdown = {
    signal: Math.round(s),                         // 기술신호 (기준50)
    sub: Math.round(b),                            // 보조지표
    subW: +(b * 0.5).toFixed(1),                   // 보조지표 ×0.5
    subDetail: _subDetail,                         // S97: 개별 sub signal 내역 (SUBSIG)
    ctx: Math.round(clamp(ctxBonus, -35, 35)),     // 맥락보정
    ctxW: +(clamp(ctxBonus, -35, 35) * 0.8).toFixed(1), // 맥락보정 ×0.8
    aux: Math.round(aux),                          // 추가보조
    // S63: 비기술 가중치 — 점수 미반영, 해석 참조용으로 유지
    mktW: Math.round(_mktW),                       // 시장환경 (해석용)
    funW: Math.round(_funW),                       // 재무보정 (해석용)
    macW: Math.round(_macW),                       // 매크로보정 (해석용)
    disW: Math.round(_disW),                       // 공시제동 (해석용)
    combined: Math.round(combined)                 // 순수기술 종합 (정규화 전)
  };
  return { rawScore, mom, osc, _breakdown };
}
// ════════════════════════════════════════════════════════════
//  S80: 3단 점수 체계 — ①준비(Ready) ②진입(Entry) ③추세(Trend=기존scrComputeScore)
//
//  ① scrReadyScore: "올라올까?" — 반등 준비 상태 측정
//     아직 반등 안 했지만 조건이 무르익는 상태
//     RSI 과매도 + BB 하단 수축 + 거래량 바닥 + 다이버전스
//
//  ② scrEntryScore: "맞는 거 같아" — 실제 반등 신호 감지
//     RSI 반등 시작 + MACD 음→양 전환 + BB 하단 터치 후 반등
//     Stoch 과매도 상향교차 + 캔들 반전 패턴
//
//  ③ scrComputeScore: "역시 맞았네" — 추세 강도 확인 (기존 유지)
// ════════════════════════════════════════════════════════════

// ── ① 준비 점수 (Ready Score) ──
// 과매도·수축·바닥 조건이 쌓일수록 높아짐 (아직 반등 전)
function scrReadyScore(ind) {
  let s = 0;
  const notes = [];

  // RSI 과매도 영역 (30 이하일수록 가점)
  const rsi = ind.rsi?.val ?? 50;
  if (rsi <= 20) { s += 22; notes.push('RSI 극과매도(' + Math.round(rsi) + ')'); }
  else if (rsi <= 25) { s += 18; notes.push('RSI 강과매도(' + Math.round(rsi) + ')'); }
  else if (rsi <= 30) { s += 14; notes.push('RSI 과매도(' + Math.round(rsi) + ')'); }
  else if (rsi <= 35) { s += 8; notes.push('RSI 약과매도(' + Math.round(rsi) + ')'); }
  else if (rsi <= 40) { s += 3; }
  // RSI 과매수 → 감점 (준비 상태 아님)
  if (rsi >= 70) { s -= 15; notes.push('RSI 과매수 — 준비 상태 아님'); }
  else if (rsi >= 65) { s -= 8; }

  // BB 하단 접근/이탈 (pctB 낮을수록 가점)
  const pctB = ind.bb?.pctB ?? 0.5;
  if (pctB <= 0) { s += 18; notes.push('BB 하단 이탈'); }
  else if (pctB <= 0.1) { s += 14; notes.push('BB 하단 근접'); }
  else if (pctB <= 0.2) { s += 8; notes.push('BB 하단권'); }
  // BB 상단 → 감점
  if (pctB >= 0.9) { s -= 12; }

  // BB 스퀴즈 (변동성 수축 → 폭발 직전)
  if (ind.squeeze?.squeeze) { s += 10; notes.push('BB 스퀴즈(변동성 수축)'); }

  // Stochastic 과매도
  const stK = ind.stoch?.k ?? 50;
  if (stK <= 15) { s += 10; notes.push('Stoch 극과매도'); }
  else if (stK <= 20) { s += 7; }
  else if (stK <= 30) { s += 3; }

  // CCI 과매도
  const cci = ind.cci ?? 0;
  if (cci <= -200) { s += 8; notes.push('CCI 극과매도'); }
  else if (cci <= -100) { s += 5; }

  // 거래량 바닥 (거래량 감소 = 매도 소진)
  const volOsc = ind.volOsc ?? 0;
  if (volOsc < -40) { s += 8; notes.push('거래량 극감(매도 소진)'); }
  else if (volOsc < -20) { s += 4; }

  // 다이버전스 (가격 하락 + 지표 반등 = 반전 전조)
  if (ind.rsi?.div === 'bullish') { s += 12; notes.push('RSI 상승다이버전스'); }
  if (ind.obv?.div === 'bullish') { s += 10; notes.push('OBV 상승다이버전스'); }

  // 지지선 근접
  if (ind.trend?.struct?.nearSupport) { s += 8; notes.push('지지선 근접'); }

  // 심리적 가격대 근접
  if (ind.psychLevel?.near) { s += 4; notes.push('심리 가격대 근접'); }

  // 추세 과열 → 감점 (이미 많이 올랐으면 준비 상태 아님)
  const trendPct = ind.trend?.pct ?? 0;
  if (trendPct >= 15) { s -= 12; }
  else if (trendPct >= 10) { s -= 6; }
  // 충분히 빠진 상태 → 가점
  if (trendPct <= -15) { s += 10; notes.push('20일간 -15%↓ 충분 하락'); }
  else if (trendPct <= -10) { s += 6; notes.push('20일간 -10%↓ 하락'); }

  // Ichimoku 구름 아래 → 과매도 추가 확인
  if (ind.ichimoku?.priceVsCloud === 'below') { s += 5; notes.push('구름 하단'); }

  // 정규화 (0~100)
  const raw = clamp(s + 50, 0, 100);
  const score = Math.round(clamp(50 + 50 * Math.tanh(((raw - 50) / 50) * 1.2), 0, 100));

  return { score, raw, notes };
}

// ── ② 진입 점수 (Entry Score) ──
// 실제 반등 신호가 감지될수록 높아짐
function scrEntryScore(ind) {
  let s = 0;
  const notes = [];

  // RSI 과매도에서 반등 시작 (30 이하 → 상승 전환)
  const rsi = ind.rsi?.val ?? 50;
  const rsiArr = ind.rsi?.arr;
  if (rsiArr && rsiArr.length >= 3) {
    const cur = rsiArr[rsiArr.length - 1] ?? 50;
    const prev = rsiArr[rsiArr.length - 2] ?? 50;
    const prev2 = rsiArr[rsiArr.length - 3] ?? 50;
    // 과매도에서 반등
    if (prev <= 30 && cur > prev) { s += 18; notes.push('RSI 과매도 반등(' + Math.round(prev) + '→' + Math.round(cur) + ')'); }
    else if (prev <= 35 && cur > prev && prev2 >= prev) { s += 12; notes.push('RSI 반등 시작'); }
    // 35~45 구간 상승 (초기 반등)
    else if (cur > prev && cur <= 45 && cur >= 30) { s += 6; }
    // RSI 과매수 반전 → 감점
    if (prev >= 70 && cur < prev) { s -= 12; notes.push('RSI 과매수 반전 — 하락 전환'); }
  }

  // MACD 히스토그램 음→양 전환 (핵심 반등 신호)
  const hist = ind.macd?.arr?.hist;
  if (hist && hist.length >= 3) {
    const h1 = hist[hist.length - 1] || 0;
    const h2 = hist[hist.length - 2] || 0;
    const h3 = hist[hist.length - 3] || 0;
    if (h1 > 0 && h2 <= 0) { s += 20; notes.push('MACD 양전환(강)'); }
    else if (h1 > h2 && h2 > h3 && h1 < 0) { s += 12; notes.push('MACD 히스토그램 축소(반등 예고)'); }
    else if (h1 > h2 && h1 > 0) { s += 6; }
    // MACD 음전환 → 감점
    if (h1 < 0 && h2 >= 0) { s -= 15; notes.push('MACD 음전환'); }
  }

  // BB 하단 터치 후 반등 (pctB 0 이하 → 0 이상으로 올라옴)
  const pctB = ind.bb?.pctB ?? 0.5;
  const closes = ind.closes;
  if (closes && closes.length >= 3) {
    const n = closes.length;
    // BB 하단권에서 반등 (pctB < 0.15이면서 최근 2봉 상승)
    if (pctB <= 0.15 && pctB >= 0 && closes[n-1] > closes[n-2]) {
      s += 14; notes.push('BB 하단 반등');
    }
    // BB 상단 → 감점
    if (pctB >= 0.9 && closes[n-1] < closes[n-2]) { s -= 10; }
  }

  // Stochastic 과매도 + 상향교차 (K가 D를 상향돌파)
  const stK = ind.stoch?.k ?? 50;
  const stD = ind.stoch?.d ?? 50;
  const stPK = ind.stoch?.prevK ?? 50;
  const stPD = ind.stoch?.prevD ?? 50;
  if (stK < 30 && stK > stD && stPK <= stPD) { s += 14; notes.push('Stoch 과매도 골든크로스'); }
  else if (stK < 30 && stK > stD) { s += 8; notes.push('Stoch 과매도 상향'); }
  // 과매수 데드크로스 → 감점
  if (stK > 70 && stK < stD && stPK >= stPD) { s -= 12; }

  // 강세 캔들 반전 패턴
  if (ind.candle?.bullish && ind.candle?.patterns) {
    const reversalNames = ['망치형','역망치형','장악형','관통형','샛별형','도지','잠자리도지','비석도지'];
    const hasReversal = ind.candle.patterns.some(function(p) {
      return reversalNames.some(function(name) { return p.name && p.name.indexOf(name) >= 0; });
    });
    if (hasReversal) { s += 10; notes.push('반전 캔들 패턴'); }
    else { s += 5; notes.push('강세 캔들'); }
  }
  // 약세 캔들 → 감점
  if (ind.candle?.bearish) { s -= 6; }

  // OBV 상승 (수급 반등 확인)
  if (ind.obv?.trend === 'up') { s += 6; notes.push('OBV 상승(수급 유입)'); }
  if (ind.obv?.trend === 'down') { s -= 4; }

  // 거래량 급증 + 양봉 (반등 확인)
  if (ind.volPattern?.bullish) { s += 8; notes.push('거래량 확인 상승'); }
  if (ind.volPattern?.bearish) { s -= 6; }

  // 다이버전스 (반등 중 다이버전스 = 강력 확인)
  if (ind.rsi?.div === 'bullish') { s += 8; notes.push('RSI 다이버전스 반등'); }
  if (ind.obv?.div === 'bullish') { s += 6; }

  // Chaikin Oscillator 양전환
  if (ind.chaikinOsc && ind.chaikinOsc.value > 0 && ind.chaikinOsc.prev <= 0) {
    s += 6; notes.push('Chaikin Osc 양전환');
  }

  // TRIX 상향
  if (ind.trix && ind.trix.signal && ind.trix.value > ind.trix.signal) {
    s += 4; notes.push('TRIX 상향');
  }

  // 추세 과열 → 이미 늦음 감점
  const trendPct = ind.trend?.pct ?? 0;
  if (trendPct >= 20) { s -= 15; notes.push('이미 +20%↑ 과열'); }
  else if (trendPct >= 10) { s -= 6; }

  // 정규화 (0~100)
  const raw = clamp(s + 50, 0, 100);
  const score = Math.round(clamp(50 + 50 * Math.tanh(((raw - 50) / 50) * 1.2), 0, 100));

  return { score, raw, notes };
}

// S45→S63: 시장환경 가중치 (해석용 — 점수 미반영, _breakdown 참조용)
let _scrMarketWeight = 0;
function setMarketWeight(market) {
  _scrMarketWeight = MarketEnv.getWeight(market || 'kr');
}

// ══ S55→S63: 재무 보정 가중치 (해석용 — 점수 미반영, _breakdown 참조용) ══
let _scrFundamentalWeight = 0;
/**
 * 재무 데이터 기반 보정값 산출 (해석 레이어에서 참조)
 * @param {object} fin - {per,pbr,roe,eps,dividendYield,debtRatio}
 * @returns {number} -12 ~ +12
 */
function calcFundamentalWeight(fin) {
  if (!fin) return 0;
  let w = 0;
  // PER 보정: 저PER(0~15) 가점, 고PER(50+) 감점, 음수(적자) 감점
  if (fin.per != null) {
    if (fin.per > 0 && fin.per <= 10) w += 3;
    else if (fin.per > 0 && fin.per <= 15) w += 2;
    else if (fin.per > 0 && fin.per <= 25) w += 0;
    else if (fin.per > 50) w -= 2;
    else if (fin.per < 0) w -= 3; // 적자
  }
  // PBR 보정: 저PBR(0~1) 가점
  if (fin.pbr != null) {
    if (fin.pbr > 0 && fin.pbr <= 1.0) w += 2;
    else if (fin.pbr > 0 && fin.pbr <= 1.5) w += 1;
    else if (fin.pbr > 5) w -= 1;
  }
  // ROE 보정: 고ROE(10+) 가점
  if (fin.roe != null) {
    if (fin.roe >= 15) w += 2;
    else if (fin.roe >= 10) w += 1;
    else if (fin.roe < 0) w -= 2;
  }
  // 배당수익률: 2%↑ 가점 (안정성)
  if (fin.dividendYield != null && fin.dividendYield >= 2) w += 1;
  // 부채비율: 200%↑ 감점
  if (fin.debtRatio != null) {
    if (fin.debtRatio > 300) w -= 3;
    else if (fin.debtRatio > 200) w -= 2;
    else if (fin.debtRatio < 50) w += 1;
  }
  // S57: 재무 트렌드 보정 (매출/영업이익/순이익 성장률)
  if (fin.revenueGrowth != null) {
    if (fin.revenueGrowth >= 30) w += 2;
    else if (fin.revenueGrowth >= 10) w += 1;
    else if (fin.revenueGrowth <= -20) w -= 2;
    else if (fin.revenueGrowth <= -5) w -= 1;
  }
  if (fin.opIncomeGrowth != null) {
    if (fin.opIncomeGrowth >= 50) w += 2;
    else if (fin.opIncomeGrowth >= 15) w += 1;
    else if (fin.opIncomeGrowth <= -30) w -= 2;
    else if (fin.opIncomeGrowth <= -10) w -= 1;
  }
  if (fin.netIncomeGrowth != null) {
    // 적자전환 강력 감점
    if (fin.netIncome != null && fin.netIncome < 0 && fin.netIncomePrev != null && fin.netIncomePrev > 0) w -= 3;
    // 흑자전환 강력 가점
    else if (fin.netIncome != null && fin.netIncome > 0 && fin.netIncomePrev != null && fin.netIncomePrev < 0) w += 3;
    else if (fin.netIncomeGrowth >= 30) w += 1;
    else if (fin.netIncomeGrowth <= -30) w -= 1;
  }
  return clamp(w, -12, 12);
}
function setFundamentalWeight(w) { _scrFundamentalWeight = clamp(w || 0, -12, 12); }

// ══ S55→S63: 매크로 환경 보정 가중치 (해석용 — 점수 미반영, _breakdown 참조용) ══
let _scrMacroWeight = 0;
/**
 * 매크로 데이터 기반 보정값 산출 (해석 레이어에서 참조)
 * @param {object} macro - {dxy,tnx,usdkrw,vix,gold}
 *   각 항목: {price,change1d,change5d,rsiVal,trend}
 * @returns {number} -10 ~ +10
 */
function calcMacroWeight(macro) {
  if (!macro) return 0;
  let w = 0;
  // 달러인덱스: 강세→위험자산 압박, 약세→호재
  if (macro.dxy) {
    if (macro.dxy.trend === 'down') w += macro.dxy.change5d < -1 ? 3 : 1;
    else if (macro.dxy.trend === 'up') w -= macro.dxy.change5d > 1 ? 3 : 1;
  }
  // 미국 10년금리: 상승→주식압박, 하락→호재
  if (macro.tnx) {
    if (macro.tnx.trend === 'down') w += Math.abs(macro.tnx.change5d) > 2 ? 2 : 1;
    else if (macro.tnx.trend === 'up') w -= Math.abs(macro.tnx.change5d) > 2 ? 2 : 1;
  }
  // 환율(USDKRW): 상승→외국인매도압력, 하락→유입
  if (macro.usdkrw) {
    if (macro.usdkrw.trend === 'down') w += 1;
    else if (macro.usdkrw.trend === 'up') w -= 1;
  }
  // VIX: 공포→보수적
  if (macro.vix) {
    if (macro.vix.price >= 30) w -= 3;
    else if (macro.vix.price >= 20) w -= 1;
    else if (macro.vix.price <= 13) w += 1;
  }
  // 크로스에셋: DXY↑+TNX↑ 동시 → 추가 감점
  if (macro.dxy && macro.tnx && macro.dxy.trend === 'up' && macro.tnx.trend === 'up') {
    w -= 2;
  }
  // DXY↓+TNX↓ 동시 → 추가 가점
  if (macro.dxy && macro.tnx && macro.dxy.trend === 'down' && macro.tnx.trend === 'down') {
    w += 2;
  }
  return clamp(w, -10, 10);
}
function setMacroWeight(w) { _scrMacroWeight = clamp(w || 0, -10, 10); }

// ══ S56→S63: DART 공시 제동로직 (해석용 — 점수 미반영, _breakdown.disW 참조용) ══
// S57: 카테고리별 공시 키워드 (6개 카테고리)
const DISCLOSURE_CATEGORIES = {
  mgmt_crisis: {
    label: '경영위기', icon: '',
    keywords: [
      {keyword:'상장폐지', grade:'CRITICAL'}, {keyword:'파산', grade:'CRITICAL'},
      {keyword:'거래정지', grade:'CRITICAL'}, {keyword:'회생절차', grade:'CRITICAL'},
      {keyword:'회생개시', grade:'CRITICAL'}, {keyword:'워크아웃', grade:'CRITICAL'},
      {keyword:'청산', grade:'CRITICAL'}, {keyword:'관리종목', grade:'SEVERE'},
      {keyword:'정리매매', grade:'SEVERE'}, {keyword:'상장적격성', grade:'SEVERE'}
    ]
  },
  financial_risk: {
    label: '재무위험', icon: '',
    keywords: [
      {keyword:'자본잠식', grade:'SEVERE'}, {keyword:'자본전액잠식', grade:'SEVERE'},
      {keyword:'감자', grade:'SEVERE'}, {keyword:'감사의견거절', grade:'SEVERE'},
      {keyword:'부적정의견', grade:'SEVERE'}, {keyword:'의견거절', grade:'SEVERE'}
    ]
  },
  fundraising: {
    label: '자금조달', icon: '',
    keywords: [
      {keyword:'유상증자', grade:'WARNING'}, {keyword:'전환사채', grade:'WARNING'},
      {keyword:'신주인수권', grade:'WARNING'}
    ]
  },
  legal_issue: {
    label: '법적이슈', icon: '',
    keywords: [
      {keyword:'횡령', grade:'WARNING'}, {keyword:'배임', grade:'WARNING'},
      {keyword:'소송', grade:'WARNING'}, {keyword:'분식', grade:'WARNING'}
    ]
  },
  market_warning: {
    label: '시장경고', icon: '',
    keywords: [
      {keyword:'불성실공시', grade:'WARNING'}, {keyword:'투자주의', grade:'WARNING'},
      {keyword:'투자경고', grade:'WARNING'}, {keyword:'투자위험', grade:'WARNING'},
      {keyword:'조회공시', grade:'WARNING'}
    ]
  },
  positive: {
    label: '호재', icon: '',
    keywords: [
      {keyword:'자사주취득', grade:'POSITIVE'}, {keyword:'자사주소각', grade:'POSITIVE'},
      {keyword:'배당', grade:'POSITIVE'}, {keyword:'무상증자', grade:'POSITIVE'},
      {keyword:'흑자전환', grade:'POSITIVE'}, {keyword:'계약체결', grade:'POSITIVE'},
      {keyword:'대규모수주', grade:'POSITIVE'}, {keyword:'실적개선', grade:'POSITIVE'}
    ]
  }
};

// 하위호환: 기존 등급별 플랫 구조 자동 생성
const DISCLOSURE_KW = {CRITICAL:[], SEVERE:[], WARNING:[], POSITIVE:[]};
for(const cat of Object.values(DISCLOSURE_CATEGORIES)){
  for(const {keyword, grade} of cat.keywords){
    if(DISCLOSURE_KW[grade]) DISCLOSURE_KW[grade].push(keyword);
  }
}
let _scrDisclosureWeight = 0;
/**
 * DART 공시 키워드 기반 점수 보정 (최종 제동장치)
 * @param {Array} keywords - [{keyword, grade, report_nm, rcept_dt}]
 * @returns {number} -40 ~ +5
 */
function calcDisclosureWeight(keywords) {
  if (!keywords || !keywords.length) return 0;
  let w = 0;
  let hasCritical = false, hasSevere = false;
  const seen = new Set();
  for (const kw of keywords) {
    if (seen.has(kw.keyword)) continue;
    seen.add(kw.keyword);
    if (kw.grade === 'CRITICAL') { w -= 30; hasCritical = true; }
    else if (kw.grade === 'SEVERE') { w -= 15; hasSevere = true; }
    else if (kw.grade === 'WARNING') w -= 7;
    else if (kw.grade === 'POSITIVE') w += 2;
  }
  // CRITICAL은 강제 클램프: 최소 -30
  if (hasCritical) return clamp(w, -40, -30);
  if (hasSevere) return clamp(w, -30, -10);
  return clamp(w, -25, 5);
}
function setDisclosureWeight(w) { _scrDisclosureWeight = clamp(w || 0, -40, 5); }

/**
 * 공시 키워드 매칭 — 공시 report_nm에서 키워드 추출
 * @param {Array} disclosures - [{report_nm, rcept_dt, corp_name, ...}]
 * @param {Array} customKeywords - 사용자 커스텀 키워드 [{keyword, grade}]
 * @returns {Array} [{keyword, grade, report_nm, rcept_dt}]
 */
function matchDisclosureKeywords(disclosures, customKeywords) {
  if (!disclosures || !disclosures.length) return [];
  const matched = [];
  const allKw = [];
  for (const [grade, list] of Object.entries(DISCLOSURE_KW)) {
    for (const kw of list) allKw.push({keyword: kw, grade});
  }
  if (customKeywords && customKeywords.length) {
    for (const ck of customKeywords) allKw.push({keyword: ck.keyword, grade: ck.grade || 'WARNING'});
  }
  for (const d of disclosures) {
    const nm = (d.report_nm || '').replace(/\s/g, '');
    for (const {keyword, grade} of allKw) {
      if (nm.includes(keyword)) {
        matched.push({keyword, grade, report_nm: d.report_nm, rcept_dt: d.rcept_dt, dart_url: d.dart_url});
      }
    }
  }
  return matched;
}

/**
 * 공시 부문 점수 산출 (부문별 점수 카드용)
 * @param {Array} keywords - matchDisclosureKeywords 결과
 * @returns {number} 0~100
 */
function calcDisclosureSectorScore(keywords) {
  if (!keywords || !keywords.length) return 50; // 공시 없음 = 중립
  let score = 50;
  const seen = new Set();
  for (const kw of keywords) {
    if (seen.has(kw.keyword)) continue;
    seen.add(kw.keyword);
    if (kw.grade === 'CRITICAL') score -= 40;
    else if (kw.grade === 'SEVERE') score -= 20;
    else if (kw.grade === 'WARNING') score -= 10;
    else if (kw.grade === 'POSITIVE') score += 10;
  }
  return clamp(Math.round(score), 0, 100);
}

// ── 안전필터 ──
function _scrMomOscPass(mom, osc, tf) {
  return SHORT_TFS_SET.has(tf) ? (mom + osc) > 0 : (mom > 0 && osc > 0);
}
function _scrVolFilter(volSoft, tf) {
  if (tf === 'week' || tf === 'month' || tf === 'W' || tf === 'M') return { hard: 14.0, softTh: 10.0, bonus: 10 };
  if (SHORT_TFS_SET.has(tf)) return { hard: 10.0, softTh: 7.0, bonus: 5 };
  return { hard: 7.0, softTh: 5.0, bonus: 5 };
}

// ════════════════════════════════════════════════════════════
//  quickScore — 종합 판정 (BUY/SELL/HOLD + 안전필터)
// ════════════════════════════════════════════════════════════
function scrQuickScore(rows, tf) {
  const ind = calcAllScreener(rows, tf);
  const volSoft = ATR.soften(ind.atr.pct, `scr_${rows[0]?.date || 'x'}`, _volCache);
  const ctx = ind.context || ContextEngine.analyze(ind);
  const { rawScore, mom, osc, _breakdown } = scrComputeScore(ind, volSoft, ctx.bonus);

  // S80: 3단 점수 — ①준비 ②진입 ③추세(rawScore)
  const _ready = scrReadyScore(ind);
  const _entry = scrEntryScore(ind);

  // S71: 레짐 적응형 임계값
  const th = _getEffectiveTh(tf);
  let buyTh = th.buyTh, sellTh = th.sellTh;
  let _regimeAdapt = null;
  if(SXE.regimeAdaptEnabled() && ind.regime){
    const ra = SXE.regimeAdapt(ind.regime);
    buyTh = clamp(th.buyTh + ra.buyThAdj, 40, 85);
    sellTh = clamp(th.sellTh + ra.sellThAdj, 20, 50);
    _regimeAdapt = ra;
  }
  let action = rawScore >= buyTh ? 'BUY' : rawScore <= sellTh ? 'SELL' : 'HOLD';
  if (action === 'BUY' && !_scrMomOscPass(mom, osc, tf)) action = 'HOLD';
  const reasons = [];

  // S67: 안전필터 (플래그 기반 ON/OFF — SXE._safetyFlags)
  const _sf = SXE._safetyFlags || {threshold:true,volExtreme:true,volHigh:true,rsiDiv:true,stochRsi:true,macdNeg:true,ma60resist:true,debtRatio:false,foreignSell:false,highBeta:false};
  if (_sf.threshold && action === 'BUY' && rawScore < buyTh + 2) { reasons.push('🔒임계값'); action = 'HOLD'; }
  { const vf = _scrVolFilter(volSoft, tf);
    if (_sf.volExtreme && volSoft >= vf.hard) { reasons.push('🔒변동성극단'); action = 'HOLD'; }
    else if (_sf.volHigh && volSoft >= vf.softTh && action === 'BUY' && rawScore < buyTh + vf.bonus) { reasons.push('🔒변동성과다'); action = 'HOLD'; }
  }
  if (_sf.rsiDiv && action === 'BUY' && ind.rsi.div === 'bearish') { reasons.push('🔒RSI다이버전스'); action = 'HOLD'; }
  if (_sf.stochRsi && action === 'BUY' && ind.stoch.k > 90 && ind.rsi.val < 60) { reasons.push('🔒Stoch/RSI괴리'); action = 'HOLD'; }
  if (_sf.macdNeg && action === 'BUY' && ind.macd.hist < 0) {
    const h = ind.macd.arr.hist; if (h.length >= 5 && h.slice(-5).every(v => v < 0)) { reasons.push('🔒MACD음전'); action = 'HOLD'; }
  }
  if (_sf.ma60resist && action === 'BUY' && ind.maAlign.ma60 != null && ind.price < ind.maAlign.ma60) {
    const d60 = ((ind.maAlign.ma60 - ind.price) / ind.price) * 100;
    if (d60 < 2 && rawScore < buyTh + 4) { reasons.push('🔒MA60저항'); action = 'HOLD'; }
  }
  // S67: 신규 안전필터 (옵션 — 기본 OFF)
  if (_sf.debtRatio && ind._debtRatio != null && ind._debtRatio >= 200) { reasons.push('🔒부채비율'); action = 'HOLD'; }
  if (_sf.foreignSell && ind._foreignConsecSell != null && ind._foreignConsecSell >= 3) { reasons.push('🔒외국인매도'); action = 'HOLD'; }
  if (_sf.highBeta && ind._beta != null && ind._beta > 1.5) { reasons.push('🔒고베타'); action = 'HOLD'; }
  if (action === 'BUY' && ind.candle.strongest) {
    const cn = ind.candle.strongest.name || '';
    if (cn.includes('이브닝') || cn.includes('슈팅')) { reasons.push('🔒' + cn); action = 'HOLD'; }
  }
  if (action === 'SELL' && ind.candle.strongest) {
    const cn = ind.candle.strongest.name || '';
    if (cn.includes('모닝') || cn.includes('해머')) { reasons.push('🔒' + cn); action = 'HOLD'; }
  }

  return {
    score: rawScore, action, reasons, ind, _breakdown,
    // S80: 3단 점수
    readyScore: _ready.score, readyNotes: _ready.notes,
    entryScore: _entry.score, entryNotes: _entry.notes,
    trendScore: rawScore, // 기존 추세 점수 = rawScore
    rsiDiv: ind.rsi.div, obvDiv: ind.obv.div,
    pullback: ind.pullback, candle: ind.candle,
    squeeze: ind.squeeze?.squeeze || false,
    maAlignBull: ind.maAlign.bullish,
    maAlignBear: ind.maAlign.bearish,
    above60: ind.maAlign.ma60 != null && ind.price > ind.maAlign.ma60,
    volRatio: ind.volPattern.volRatio,
    volBull: ind.volPattern.bullish,
    pbScore: ind.pullback ? ind.pullback.score : 0,
    regime: ind.regime,
    _regimeAdapt, // S71: 레짐 적응 보정값
    _adaptedTh: { buyTh, sellTh }, // S71: 실제 적용된 임계값
    macdCrossUp: ind.macd.arr.hist.length >= 2 && ind.macd.hist > 0 && ind.macd.arr.hist[ind.macd.arr.hist.length - 2] <= 0,
    macdCrossDown: ind.macd.arr.hist.length >= 2 && ind.macd.hist < 0 && ind.macd.arr.hist[ind.macd.arr.hist.length - 2] >= 0,
    rsiVal: ind.rsi.val,
    stochK: ind.stoch.k,
  };
}

// ════════════════════════════════════════════════════════════
//  스마트필터 — 배지 판정
// ════════════════════════════════════════════════════════════
function scrSmartFilterCheck(scanResult) {
  const tags = [];
  if (scanResult.maAlignBull) tags.push({ id: 'maUp', label: '정배열', color: '#00d4a0', dir: 1 });
  const volR = scanResult.volRatio || 1;
  if (volR >= 2.0) tags.push({ id: 'volUp', label: `Vol${volR.toFixed(1)}x`, color: '#ff8c00', dir: 1 });
  if (scanResult.above60) tags.push({ id: 'above60', label: 'MA60↑', color: '#00d4a0', dir: 1 });
  if (scanResult.squeeze) tags.push({ id: 'sqz', label: '스퀴즈', color: '#4488ff', dir: 1 });
  if (scanResult.pbScore >= 50) tags.push({ id: 'pb', label: `눌림${scanResult.pbScore}`, color: '#ffc040', dir: 1 });
  const rsi = scanResult.rsiVal ?? 50;
  if (rsi <= 30) tags.push({ id: 'rsiLo', label: `RSI${Math.round(rsi)}`, color: '#aa88ff', dir: 1 });
  if (scanResult.macdCrossUp) tags.push({ id: 'macdUp', label: 'MACD↑', color: '#00d4a0', dir: 1 });
  if (scanResult.maAlignBear) tags.push({ id: 'maDn', label: '역배열', color: '#aa88ff', dir: -1 });
  if (volR <= 0.3) tags.push({ id: 'volDn', label: 'Vol↓', color: '#4488ff', dir: -1 });
  if (rsi >= 70) tags.push({ id: 'rsiHi', label: `RSI${Math.round(rsi)}`, color: '#ff4060', dir: -1 });
  if (scanResult.macdCrossDown) tags.push({ id: 'macdDn', label: 'MACD↓', color: '#ff4060', dir: -1 });
  if (scanResult.rsiDiv === 'bullish') tags.push({ id: 'rsiDivUp', label: 'RSI↑다이버', color: '#00d4a0', dir: 1 });
  if (scanResult.rsiDiv === 'bearish') tags.push({ id: 'rsiDivDn', label: 'RSI↓다이버', color: '#ff4060', dir: -1 });
  if (scanResult.obvDiv === 'bullish') tags.push({ id: 'obvDivUp', label: 'OBV↑다이버', color: '#00d4a0', dir: 1 });
  if (scanResult.obvDiv === 'bearish') tags.push({ id: 'obvDivDn', label: 'OBV↓다이버', color: '#ff4060', dir: -1 });
  return tags;
}

function scrSmartFilterScore(tags) {
  return tags.reduce((s, t) => s + t.dir, 0);
}

// ── 스마트필터 정의 (UI용) ──
const SMART_FILTER_DEFS = [
  { id: 'maUp', label: '정배열', dir: 1 },
  { id: 'above60', label: 'MA60↑', dir: 1 },
  { id: 'sqz', label: '스퀴즈', dir: 1 },
  { id: 'pb', label: '눌림목', dir: 1 },
  { id: 'rsiLo', label: 'RSI과매도', dir: 1 },
  { id: 'macdUp', label: 'MACD↑', dir: 1 },
  { id: 'volUp', label: 'Vol폭발', dir: 1 },
  { id: 'maDn', label: '역배열', dir: -1 },
  { id: 'rsiHi', label: 'RSI과매수', dir: -1 },
  { id: 'macdDn', label: 'MACD↓', dir: -1 },
  { id: 'volDn', label: 'Vol↓', dir: -1 },
];

function passSmartFilters(tags, activeSmartFilters) {
  if (!activeSmartFilters || !activeSmartFilters.size) return true;
  const tagIds = new Set(tags.map(t => t.id));
  for (const fId of activeSmartFilters) {
    if (!tagIds.has(fId)) return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════
//  레거시 지표 (checkTechConditions 호환)
// ════════════════════════════════════════════════════════════
function calcWilliamsR(highs, lows, closes, period) {
  const n = closes.length;
  if (n < period) return -50;
  let hh = -Infinity, ll = Infinity;
  for (let i = n - period; i < n; i++) { hh = Math.max(hh, highs[i]); ll = Math.min(ll, lows[i]); }
  return hh === ll ? -50 : -((hh - closes[n - 1]) / (hh - ll)) * 100;
}

function calcMFI(highs, lows, closes, volumes, period) {
  const n = closes.length;
  if (n < period + 1) return 50;
  let posFlow = 0, negFlow = 0;
  for (let i = n - period; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const prevTp = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
    const mf = tp * volumes[i];
    if (tp > prevTp) posFlow += mf; else negFlow += mf;
  }
  return negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
}

function calcVR(closes, volumes, period) {
  const n = closes.length;
  if (n < period + 1) return 100;
  let up = 0, down = 0;
  for (let i = n - period; i < n; i++) {
    if (closes[i] > closes[i - 1]) up += volumes[i];
    else if (closes[i] < closes[i - 1]) down += volumes[i];
  }
  return down === 0 ? 300 : (up / down) * 100;
}

function calcParabolicSAR(highs, lows, closes) {
  const n = closes.length;
  if (n < 3) return { trend: 'flat', sar: 0 };
  let isUp = closes[1] > closes[0], sar = isUp ? lows[0] : highs[0], ep = isUp ? highs[1] : lows[1], af = 0.02;
  for (let i = 2; i < n; i++) {
    sar = sar + af * (ep - sar);
    if (isUp) {
      if (lows[i] < sar) { isUp = false; sar = ep; ep = lows[i]; af = 0.02; }
      else { if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + 0.02, 0.2); } }
    } else {
      if (highs[i] > sar) { isUp = true; sar = ep; ep = highs[i]; af = 0.02; }
      else { if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + 0.02, 0.2); } }
    }
  }
  return { trend: isUp ? 'up' : 'down', sar };
}

// ════════════════════════════════════════════════════════════
//  calcIndicators — 레거시 래퍼 (스크리너 호환)
// ════════════════════════════════════════════════════════════
function calcIndicators(candles, tf) {
  const rows = candles.map(c => ({
    date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume
  }));
  const ind = calcAllScreener(rows, tf);

  return {
    last: ind.price,
    closes: ind.closes,
    highs: rows.map(r => r.high),
    lows: rows.map(r => r.low),
    volumes: rows.map(r => r.volume),
    candles: rows,
    ma5: ind.ma5, ma20: ind.ma20, ma60: ind.ma60, ma120: ind.ma120,
    rsi: ind.rsi.val,
    macd: ind.macdLegacy,
    stoch: ind.stochLegacy,
    bb: ind.bbLegacy,
    adx: ind.adxLegacy,
    cci: ind.cci,
    willR: rows.length > 14 ? calcWilliamsR(rows.map(r => r.high), rows.map(r => r.low), ind.closes, 14) : -50,
    roc: ind.closes.length > 12 ? (ind.price / ind.closes[ind.closes.length - 13] - 1) * 100 : 0,
    momentum: ind.closes.length > 12 ? ind.price - ind.closes[ind.closes.length - 13] : 0,
    atr: { atr: ind.atr.val, ratio: ind.price > 0 ? (ind.atr.val / ind.price) * 100 : 0 },
    obv: ind.obvLegacy,
    mfi: calcMFI(rows.map(r => r.high), rows.map(r => r.low), ind.closes, rows.map(r => r.volume), 14),
    vr: calcVR(ind.closes, rows.map(r => r.volume), 20),
    psar: calcParabolicSAR(rows.map(r => r.high), rows.map(r => r.low), ind.closes),
    patterns: ind.patternsLegacy,
    priceAction: ind.priceAction,
    ichimoku: ind.ichimokuLegacy,
    envelope: ind.envelopeLegacy,
    pivot: ind.pivotLegacy,
    priceChannel: ind.priceChannelLegacy,
    maDisparity: ind.maDisparityLegacy,
    volumeMA: ind.volumeMALegacy,
    ad: ind.adLegacy,
    trix: ind.trixLegacy,
    stochSlow: ind.stochSlowLegacy,
    macdOsc: ind.macdOscLegacy,
    priceOsc: ind.priceOscLegacy,
    volIndex: ind.volIndexLegacy,
    stdDev: ind.stdDevLegacy,
    trueRange: ind.trueRangeLegacy,
    dx: ind.dxLegacy,
    demark: ind.demarkLegacy,
    threeLineBreak: ind.threeLineBreakLegacy,
    binaryWave: ind.binaryWaveLegacy,
    sonar: ind.sonarLegacy,
    massIndex: ind.massIndexLegacy,
    vwap: ind.vwapLegacy,
    swingStruct: ind.swingStructLegacy,
    // S49: 신규 지표
    eom: ind.eomLegacy,
    vhf: ind.vhfLegacy,
    chaikinOsc: ind.chaikinOscLegacy,
    psycho: ind.psychoLegacy,
    abRatio: ind.abRatioLegacy,
    price: ind.price,
    _advanced: ind,
  };
}

// ════════════════════════════════════════════════════════════
//  S54: 매매 가격 계산 모듈
//  진입가 / 목표가 / 손절가 / 손익비를 지표 기반으로 계산
// ════════════════════════════════════════════════════════════

/**
 * 진입가 계산
 * @param {number} price - 현재가
 * @param {object} indicators - calcIndicators 반환값
 * @param {object} qs - scrQuickScore 반환값 (regime 등)
 * @param {string} tf - 타임프레임
 * @returns {object} {entryPrice, pctFromPrice, timeStr, method, reasons[]}
 */
function calcEntryPrice(price, indicators, qs, tf, finData, macroCtx){
  if(!price || !indicators) return null;
  const atrVal = indicators.atr ? (indicators.atr.ratio / 100) * price : 0;
  const rsi = indicators.rsi ?? 50;
  const adx = indicators.adx?.adx ?? 0;
  const trendPct = indicators._advanced?.trend?.pct ?? 0;
  const ma20 = indicators.ma20 || 0;
  const ma60 = indicators.ma60 || 0;
  const ma120 = indicators.ma120 || 0;
  const ichi = indicators._advanced?.ichimoku || indicators.ichimoku || null;
  const kijun = ichi?.kijun || 0;
  const pivot = indicators._advanced?.pivot || indicators.pivot || null;
  const pivotS1 = pivot?.S1 || 0;
  const pivotPP = pivot?.P || 0;
  const envelope = indicators._advanced?.envelope || null;
  const envLower = envelope?.lower || 0;

  const reasons = [];

  // ── 지지선 후보 수집 ──
  const supports = [];
  if(ma20 > 0 && ma20 < price) supports.push({v:ma20, n:'MA20', w:3});
  if(ma60 > 0 && ma60 < price) supports.push({v:ma60, n:'MA60', w:4});
  if(ma120 > 0 && ma120 < price) supports.push({v:ma120, n:'MA120', w:3});
  if(kijun > 0 && kijun < price) supports.push({v:kijun, n:'일목 기준선', w:4});
  if(pivotS1 > 0 && pivotS1 < price) supports.push({v:pivotS1, n:'피봇 S1', w:3});
  if(pivotPP > 0 && pivotPP < price) supports.push({v:pivotPP, n:'피봇 PP', w:2});
  if(envLower > 0 && envLower < price) supports.push({v:envLower, n:'엔벨로프 하단', w:2});
  // ATR 기반 눌림목 지지
  if(atrVal > 0) supports.push({v: price - atrVal * 0.8, n:'ATR 지지', w:2});

  let entryPrice = price;
  let method = '즉시 진입';

  // 현재가 아래 지지선 중 가장 가까운 것 (가중치 고려)
  const belowSupports = supports
    .filter(s => s.v < price && s.v > price * 0.85)
    .sort((a, b) => {
      // 가까운 것 우선, 가중치 높은 것 우선
      const distA = (price - a.v) / price;
      const distB = (price - b.v) / price;
      return (distA / a.w) - (distB / b.w);
    });

  if(belowSupports.length > 0){
    const primary = belowSupports[0];
    // 지지선 + ATR*0.3 반등 여유
    const bounce = atrVal * 0.3;
    entryPrice = Math.round(primary.v + bounce);
    method = primary.n + ' 지지 매수';
    reasons.push(`1차 지지: ${primary.n} (${Math.round(primary.v).toLocaleString()}원)`);
    if(belowSupports.length > 1){
      reasons.push(`2차 지지: ${belowSupports[1].n} (${Math.round(belowSupports[1].v).toLocaleString()}원)`);
    }
    reasons.push(`ATR 반등 여유 +${Math.round(bounce).toLocaleString()}원 반영`);

    // 지지선 밀집도 확인
    const nearSupports = belowSupports.filter(s => Math.abs(s.v - primary.v) / price < 0.02);
    if(nearSupports.length >= 2){
      const names = nearSupports.map(s=>s.n).join('+');
      reasons.push(`지지 밀집: ${names} — 강한 지지 구간`);
    }
  } else {
    // 지지선이 모두 현재가 위이거나 없음
    entryPrice = Math.round(price - atrVal * 0.3);
    method = '눌림목 대기';
    reasons.push('현재가 근처에 주요 지지선 부재');
    reasons.push(`ATR 기반 소폭 눌림 대기: -${Math.round(atrVal*0.3).toLocaleString()}원`);
  }

  // RSI 보정
  if(rsi > 70){
    entryPrice = Math.round(entryPrice * 0.98);
    method += ' (과매수 할인)';
    reasons.push(`RSI ${rsi.toFixed(0)} 과매수 → 진입가 2% 하향 조정`);
  } else if(rsi < 30){
    entryPrice = Math.round(price * 0.995);
    method = '과매도 반등 진입';
    reasons.push(`RSI ${rsi.toFixed(0)} 과매도 → 현재가 근접 진입 (반등 기대)`);
  }

  // ADX 보정: 강한 추세(>30)면 진입가를 현재가에 가깝게
  if(adx > 30 && trendPct > 0){
    const adj = entryPrice + (price - entryPrice) * 0.3;
    entryPrice = Math.round(adj);
    reasons.push(`ADX ${adx.toFixed(0)} 강추세 → 진입가 상향 보정 (눌림 짧을 확률↑)`);
  }

  // S55: 재무 보정
  if(finData){
    // 저PER+저PBR 가치주 → 진입가를 현재가에 가깝게 (안전마진 존재)
    if(finData.per != null && finData.per > 0 && finData.per <= 10 && finData.pbr != null && finData.pbr > 0 && finData.pbr <= 1.0){
      const adj = entryPrice + (price - entryPrice) * 0.25;
      entryPrice = Math.round(adj);
      reasons.push(`저PER(${finData.per.toFixed(1)})·저PBR(${finData.pbr.toFixed(1)}) → 밸류에이션 안전마진 반영`);
    }
    // 고부채 → 진입가 좀 더 보수적으로
    if(finData.debtRatio != null && finData.debtRatio > 200){
      entryPrice = Math.round(entryPrice * 0.99);
      reasons.push(`부채비율 ${finData.debtRatio.toFixed(0)}% 고위험 → 진입가 1% 추가 할인`);
    }
    // 고ROE → 실적 뒷받침, 약간 상향
    if(finData.roe != null && finData.roe >= 15){
      const adj = entryPrice + (price - entryPrice) * 0.15;
      entryPrice = Math.round(adj);
      reasons.push(`ROE ${finData.roe.toFixed(1)}% 우수 → 실적 지지력 반영`);
    }
  }

  // S55: 매크로 보정
  if(macroCtx){
    // 달러+금리 동시 상승 → 보수적 진입
    if(macroCtx.dxy && macroCtx.tnx && macroCtx.dxy.trend === 'up' && macroCtx.tnx.trend === 'up'){
      entryPrice = Math.round(entryPrice * 0.99);
      reasons.push('달러·금리 동시↑ → 위험자산 압박, 진입가 1% 추가 할인');
    }
    // VIX 공포 → 보수적
    if(macroCtx.vix && macroCtx.vix.price >= 25){
      entryPrice = Math.round(entryPrice * 0.985);
      reasons.push(`VIX ${macroCtx.vix.price.toFixed(1)} 공포구간 → 진입가 추가 하향`);
    }
    // 달러+금리 동시 하락 → 약간 적극적
    if(macroCtx.dxy && macroCtx.tnx && macroCtx.dxy.trend === 'down' && macroCtx.tnx.trend === 'down'){
      const adj = entryPrice + (price - entryPrice) * 0.2;
      entryPrice = Math.round(adj);
      reasons.push('달러·금리 동시↓ → 위험자산 우호, 진입가 상향 보정');
    }
  }

  // 진입가가 현재가 이상이면 현재가로
  if(entryPrice >= price){
    entryPrice = price;
    method = '즉시 진입';
    reasons.unshift('현재가가 최적 진입 구간 — 즉시 진입 가능');
  }

  // S56: 공시 제동 — CRITICAL/SEVERE 시 진입가를 대폭 할인
  if(typeof _scrDisclosureWeight === 'number' && _scrDisclosureWeight <= -30){
    // CRITICAL: 진입 자체를 비추천 (표시용으로 -10% 할인)
    entryPrice = Math.round(price * 0.90);
    method = '공시위험 — 진입 비추천';
    reasons.unshift('⚠️ 치명적 공시(상폐/파산/거래정지) 감지 — 신규 진입 금지');
  } else if(typeof _scrDisclosureWeight === 'number' && _scrDisclosureWeight <= -15){
    // SEVERE: 5% 추가 할인
    entryPrice = Math.round(entryPrice * 0.95);
    reasons.push('⚠️ 위험 공시(관리종목/자본잠식 등) 감지 → 진입가 5% 추가 할인');
  }

  const pctFromPrice = ((entryPrice - price) / price) * 100;

  // 진입 예상시간
  const gap = Math.abs(price - entryPrice);
  const dailyMove = atrVal || 1;
  const tfDays = {'5m':0.02,'15m':0.06,'30m':0.12,'60m':0.25,'day':1,'week':5,'month':20}[tf] || 1;
  let entryDays = (gap / dailyMove) / tfDays;
  let timeStr = '즉시';
  if(entryPrice >= price) timeStr = '즉시';
  else if(entryDays < 0.5) timeStr = '당일 내';
  else if(entryDays < 1.5) timeStr = '약 1일';
  else if(entryDays < 3) timeStr = '약 2일';
  else timeStr = `약 ${Math.round(entryDays)}일`;

  return { entryPrice, pctFromPrice, timeStr, method, reasons };
}

/**
 * 목표가/손절가/손익비 계산
 * @param {number} price - 현재가 (또는 진입가 기준)
 * @param {object} indicators - calcIndicators 반환값
 * @param {object} qs - scrQuickScore 반환값
 * @param {string} tf - 타임프레임
 * @returns {object} {tp, sl, rr, tpPct, slPct, tpTime, slTime, tpBars, slBars, reasons[]}
 */
function calcTpSlRr(price, indicators, qs, tf, finData, macroCtx){
  if(!price || !indicators?.atr) return null;
  const reasons = []; // S63 FIX: TDZ 에러 방지 — 선언을 상단으로 이동
  const atrPct = indicators.atr.ratio / 100;
  const atrVal = price * atrPct;
  const rsi = indicators.rsi ?? 50;
  const adx = indicators.adx?.adx ?? 0;
  const trendPct = indicators._advanced?.trend?.pct ?? 0;
  const pivot = indicators._advanced?.pivot || indicators.pivot || null;
  const ichi = indicators._advanced?.ichimoku || indicators.ichimoku || null;
  const priceChannel = indicators._advanced?.priceChannel || indicators.priceChannel || null;

  // 기본 배수
  let tpMult = 2.5, slMult = 1.5;

  // 추세 방향에 따른 배수 조정
  if(trendPct > 5 && adx > 25){
    tpMult = 3.0; // 강한 상승추세 → 목표 확대
    slMult = 1.2; // 손절 타이트
  } else if(trendPct < -5 && adx > 25){
    tpMult = 1.5; // 약세 → 보수적 목표
    slMult = 2.0; // 손절 여유
  }

  // RSI 기반 조정
  if(rsi > 70) tpMult *= 0.8; // 과매수 → 목표 축소
  if(rsi < 30) tpMult *= 1.2; // 과매도 반등 → 목표 확대

  // S55: 재무 보정 — 밸류에이션에 따른 TP/SL 배수 조정
  if(finData){
    // 저PER 가치주 → 목표가 확대 (재평가 여력)
    if(finData.per != null && finData.per > 0 && finData.per <= 12){
      tpMult *= 1.15;
      reasons.push(`저PER(${finData.per.toFixed(1)}) → 목표가 15% 확대 (재평가 여력)`);
    }
    // 고ROE → 목표가 소폭 확대
    if(finData.roe != null && finData.roe >= 15){
      tpMult *= 1.08;
      reasons.push(`ROE ${finData.roe.toFixed(1)}% → 목표가 8% 확대 (실적 뒷받침)`);
    }
    // 고부채 → 손절 타이트
    if(finData.debtRatio != null && finData.debtRatio > 200){
      slMult *= 0.85;
      reasons.push(`부채비율 ${finData.debtRatio.toFixed(0)}% → 손절 15% 타이트 (재무 리스크)`);
    }
    // 적자 기업(PER 음수) → 보수적
    if(finData.per != null && finData.per < 0){
      tpMult *= 0.85;
      slMult *= 0.9;
      reasons.push('적자 기업 → 목표가 축소, 손절 타이트');
    }
    // 고배당 → 하방 지지력
    if(finData.dividendYield != null && finData.dividendYield >= 3){
      slMult *= 1.1;
      reasons.push(`배당수익률 ${finData.dividendYield.toFixed(1)}% → 손절 여유 확대 (배당 지지)`);
    }
  }

  // S55: 매크로 보정 — 시장환경에 따른 배수 조정
  if(macroCtx){
    // DXY↑ + TNX↑ → 보수적 목표
    if(macroCtx.dxy && macroCtx.tnx && macroCtx.dxy.trend === 'up' && macroCtx.tnx.trend === 'up'){
      tpMult *= 0.9;
      slMult *= 0.9;
      reasons.push('달러·금리↑ → 목표/손절 10% 축소 (위험자산 압박)');
    }
    // DXY↓ + TNX↓ → 적극적 목표
    if(macroCtx.dxy && macroCtx.tnx && macroCtx.dxy.trend === 'down' && macroCtx.tnx.trend === 'down'){
      tpMult *= 1.1;
      reasons.push('달러·금리↓ → 목표가 10% 확대 (위험자산 우호)');
    }
    // VIX 공포 → 전체적으로 보수적
    if(macroCtx.vix && macroCtx.vix.price >= 25){
      tpMult *= 0.85;
      slMult *= 0.85;
      reasons.push(`VIX ${macroCtx.vix.price.toFixed(1)} → 변동성 극대, 목표/손절 축소`);
    }
    // 환율 급등 (원화 약세) → 외국인 매도 압력
    if(macroCtx.usdkrw && macroCtx.usdkrw.change5d > 2){
      tpMult *= 0.92;
      reasons.push(`환율 5일 +${macroCtx.usdkrw.change5d.toFixed(1)}% → 외국인 매도 압력, 목표 8% 축소`);
    }
  }

  const tpRate = atrPct * tpMult;
  const slRate = atrPct * slMult;
  let tp = Math.round(price * (1 + tpRate));
  let sl = Math.round(price * (1 - slRate));

  // 목표가: 저항선 참조 보정
  const pivotR1 = pivot?.R1 || 0;
  const pivotR2 = pivot?.R2 || 0;
  const channelUpper = priceChannel?.upper || 0;
  const ichiSpanB = ichi?.spanB || 0;

  // 저항선이 tp보다 가까우면 저항선을 목표로 조정
  const resistances = [];
  if(pivotR1 > price && pivotR1 < tp) resistances.push({v:pivotR1, n:'피봇 R1'});
  if(pivotR2 > price) resistances.push({v:pivotR2, n:'피봇 R2'});
  if(channelUpper > price) resistances.push({v:channelUpper, n:'채널 상단'});

  if(resistances.length > 0){
    // 가장 가까운 저항선이 ATR 목표보다 가까우면 저항선 직전을 목표로
    resistances.sort((a,b) => a.v - b.v);
    const nearestResist = resistances[0];
    if(nearestResist.v < tp){
      tp = Math.round(nearestResist.v * 0.995); // 저항선 살짝 아래
      reasons.push(`목표가: ${nearestResist.n}(${Math.round(nearestResist.v).toLocaleString()}원) 직전 설정`);
    }
    if(resistances.length > 1){
      reasons.push(`추가 저항: ${resistances[1].n}(${Math.round(resistances[1].v).toLocaleString()}원)`);
    }
  }

  // 손절가: 지지선 참조 보정
  const pivotS1 = pivot?.S1 || 0;
  const pivotS2 = pivot?.S2 || 0;
  if(pivotS1 > 0 && pivotS1 < price && pivotS1 > sl){
    // S1이 손절가보다 위이면 S1 아래로 손절 설정
    sl = Math.round(pivotS1 * 0.995);
    reasons.push(`손절가: 피봇 S1(${Math.round(pivotS1).toLocaleString()}원) 이탈 시 작동`);
  }

  // 최종 손익비
  const tpDist = tp - price;
  const slDist = price - sl;
  // S107 FIX: const → let — 아래 공시 가중치 분기(3071/3082줄)에서 tp/sl/rr 재계산 시 재할당 필요
  //   LG화학 등 치명적/위험 공시(-30/-15 이하) 감지 시 "Assignment to constant variable" 에러 발생 방지
  let rr = slDist > 0 ? +(tpDist / slDist).toFixed(2) : 99;
  let tpPct = ((tp - price) / price) * 100;
  let slPct = ((sl - price) / price) * 100;

  // 도달 예상시간 (추세 방향 효율 반영)
  let upEff = 0.5, dnEff = 0.5;
  if(trendPct > 3){ upEff = 0.7; dnEff = 0.3; }
  else if(trendPct > 0){ upEff = 0.55; dnEff = 0.45; }
  else if(trendPct < -3){ upEff = 0.3; dnEff = 0.7; }
  else if(trendPct < 0){ upEff = 0.45; dnEff = 0.55; }
  if(adx > 30){ upEff *= 1.2; dnEff *= 1.2; }

  const tpBars = Math.max(1, Math.round(tpPct/100 / (atrPct * upEff)));
  const slBars = Math.max(1, Math.round(Math.abs(slPct)/100 / (atrPct * dnEff)));

  const tfUnit = {'5m':'5분','15m':'15분','30m':'30분','60m':'1시간','day':'일','week':'주','month':'개월'}[tf] || '일';
  const fmtTime = (bars, unit) => {
    if(unit==='일') return bars<=1?'당일':`약 ${bars}일`;
    if(unit==='주') return bars<=1?'1주 이내':`약 ${bars}주`;
    if(unit==='개월') return bars<=1?'1개월 이내':`약 ${bars}개월`;
    const mins = {'5분':5,'15분':15,'30분':30,'1시간':60}[unit]||60;
    const hrs = Math.round(bars*mins/60);
    return hrs<1?`약 ${bars*mins}분`:hrs<=8?`약 ${hrs}시간`:`약 ${Math.round(hrs/8)}일`;
  };
  const tpTime = fmtTime(tpBars, tfUnit);
  const slTime = fmtTime(slBars, tfUnit);

  // ATR 기반 근거 추가
  const tfLabel = {'5m':'5분봉','15m':'15분봉','30m':'30분봉','60m':'1시간봉','day':'일봉','week':'주봉','month':'월봉'}[tf]||'일봉';
  reasons.unshift(`ATR(${tfLabel}): ${(atrPct*100).toFixed(1)}%, 1봉당 평균 ${Math.round(atrVal).toLocaleString()}원 변동`);
  if(trendPct > 3) reasons.push(`상승추세(+${trendPct.toFixed(1)}%) → 목표 배수 ${tpMult.toFixed(1)}x 확대`);
  else if(trendPct < -3) reasons.push(`하락추세(${trendPct.toFixed(1)}%) → 보수적 목표 ${tpMult.toFixed(1)}x`);

  // 종합 판정 톤
  let tone = 'neutral';
  if(rr >= 1.5 && trendPct > 0 && adx > 25) tone = 'bullish';
  else if(rr < 1.0 || (trendPct < -3 && adx > 25)) tone = 'bearish';

  // S56: 공시 제동 — 목표가 축소, 손절 타이트
  if(typeof _scrDisclosureWeight === 'number' && _scrDisclosureWeight <= -30){
    // CRITICAL: TP/SL 무의미 — 표시용으로 보수적 세팅
    tpMult = 0.5; slMult = 0.3;
    tp = Math.round(price * (1 + atrPct * tpMult));
    sl = Math.round(price * (1 - atrPct * slMult));
    tpPct = ((tp - price) / price) * 100;
    slPct = ((sl - price) / price) * 100;
    rr = Math.abs(tpPct / slPct) || 0;
    rr = +rr.toFixed(2);
    tone = 'danger';
    reasons.push('⚠️ 치명적 공시 감지 — TP/SL 참고용 (매매 비추천)');
  } else if(typeof _scrDisclosureWeight === 'number' && _scrDisclosureWeight <= -15){
    tpMult *= 0.8; slMult *= 0.7;
    tp = Math.round(price * (1 + atrPct * tpMult));
    sl = Math.round(price * (1 - atrPct * slMult));
    tpPct = ((tp - price) / price) * 100;
    slPct = ((sl - price) / price) * 100;
    rr = Math.abs(tpPct / slPct) || 0;
    rr = +rr.toFixed(2);
    tone = 'bearish';
    reasons.push('⚠️ 위험 공시 감지 → 목표가 ×0.8, 손절 ×0.7 타이트');
  }

  return { tp, sl, rr, tpPct, slPct, tpTime, slTime, tpBars, slBars, tone, reasons };
}

// ════════════════════════════════════════════════════════════
//  S79: 점수 모멘텀 — 과거 N봉 시점 점수 추이 계산
//  캔들 배열을 뒤에서 1봉씩 잘라가며 scrQuickScore 반복 호출
//  반환: { current, history:[{bar,score}], delta, direction, avg }
// ════════════════════════════════════════════════════════════
function scoreMomentum(rows, tf, lookback) {
  const N = lookback || 5;
  if (!rows || rows.length < 80) return null; // 최소 데이터 확보

  const history = [];
  // bar=0: 현재봉, bar=-1: 1봉전 시점, ... bar=-(N-1)
  for (let i = 0; i < N; i++) {
    const sliced = rows.slice(0, rows.length - i);
    if (sliced.length < 60) break; // 분석에 필요한 최소 봉수
    try {
      const qs = scrQuickScore(sliced, tf);
      // S86: 준비(=진입타이밍) 점수 기준으로 변경, 하위호환용 score(=trendScore)도 유지
      history.push({ bar: -i, score: qs.readyScore ?? qs.score, trendScore: qs.score, entryScore: qs.entryScore ?? 0, readyScore: qs.readyScore ?? 0 });
    } catch (e) {
      break;
    }
  }

  if (history.length < 2) return null;

  // history[0]=현재봉, history[1]=1봉전, ...
  const current = history[0].score;
  const oldest = history[history.length - 1].score;
  // S86: 3봉 평균 대비 변화량 (history[1]~[3]의 평균 vs 현재)
  const recentSlice = history.slice(1, Math.min(4, history.length)); // 1~3봉 전
  const recentAvg = recentSlice.length > 0 ? Math.round(recentSlice.reduce((s, h) => s + h.score, 0) / recentSlice.length) : current;
  const delta = current - recentAvg;
  // S86: 강세(entry) 변화량
  const curEntry = history[0].entryScore;
  const entryAvg = recentSlice.length > 0 ? Math.round(recentSlice.reduce((s, h) => s + h.entryScore, 0) / recentSlice.length) : curEntry;
  const entryDelta = curEntry - entryAvg;
  // S86: 추세(trend) 변화량
  const curTrend = history[0].trendScore;
  const trendAvg = recentSlice.length > 0 ? Math.round(recentSlice.reduce((s, h) => s + h.trendScore, 0) / recentSlice.length) : curTrend;
  const trendDelta = curTrend - trendAvg;
  const avg = Math.round(history.reduce((s, h) => s + h.score, 0) / history.length);

  // 방향 판정: 최근 3봉 연속 상승/하락 체크
  let rising = 0, falling = 0;
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].score > history[i + 1].score) rising++;
    else if (history[i].score < history[i + 1].score) falling++;
  }
  const direction = rising > falling ? 'up' : falling > rising ? 'down' : 'flat';

  // 50점 기준 크로스 감지
  let cross = null;
  if (history.length >= 2) {
    const prev = history[1].score;
    if (prev < 50 && current >= 50) cross = 'golden'; // 50 돌파 상승
    else if (prev >= 50 && current < 50) cross = 'dead'; // 50 이탈 하락
  }

  return {
    current,
    history, // [{bar:0,score:80,readyScore:80,entryScore:52,trendScore:19},...]
    delta,   // S86: 진입타이밍(준비) 3봉 평균 대비
    entryDelta, // S86: 강세(진입) 3봉 평균 대비
    trendDelta, // S86: 추세 3봉 평균 대비
    direction, // 'up'|'down'|'flat'
    avg,     // N봉 평균 점수
    cross,   // 'golden'|'dead'|null (50점 크로스)
    lookback: history.length,
  };
}

// ── 엔진 버전 ──
SXE.version = '3.7';
SXE.calcEntryPrice = calcEntryPrice;
SXE.calcTpSlRr = calcTpSlRr;
SXE.calcAllScreener = calcAllScreener;
SXE.scrComputeScore = scrComputeScore;
SXE.setMarketWeight = setMarketWeight;
SXE.setFundamentalWeight = setFundamentalWeight;
SXE.calcFundamentalWeight = calcFundamentalWeight;
SXE.setMacroWeight = setMacroWeight;
SXE.calcMacroWeight = calcMacroWeight;
SXE.calcDisclosureWeight = calcDisclosureWeight;
SXE.setDisclosureWeight = setDisclosureWeight;
SXE.matchDisclosureKeywords = matchDisclosureKeywords;
SXE.calcDisclosureSectorScore = calcDisclosureSectorScore;
SXE.DISCLOSURE_KW = DISCLOSURE_KW;
SXE.DISCLOSURE_CATEGORIES = DISCLOSURE_CATEGORIES;
SXE.MarketEnv = MarketEnv;
SXE.scrQuickScore = scrQuickScore;
SXE.scoreMomentum = scoreMomentum;
SXE.calcIndicators = calcIndicators;
SXE.PriceAction = PriceAction;
SXE.Ichimoku = Ichimoku;
SXE.Envelope = Envelope;
SXE.PivotPoint = PivotPoint;
SXE.PriceChannel = PriceChannel;
SXE.MADisparity = MADisparity;
SXE.VolumeMA = VolumeMA;
// S49 신규
SXE.EOM = EOM;
SXE.VHF = VHF;
SXE.ChaikinOsc = ChaikinOsc;
SXE.Psycho = Psycho;
SXE.ABRatio = ABRatio;
SXE.AD = AD;
SXE.TRIX = TRIX;
SXE.StochSlow = StochSlow;
SXE.MACDOsc = MACDOsc;
SXE.PriceOsc = PriceOsc;
SXE.VolIndex = VolIndex;
SXE.Volatility = Volatility;
SXE.Demark = Demark;
SXE.ThreeLineBreak = ThreeLineBreak;
SXE.BinaryWave = BinaryWave;
SXE.Sonar = Sonar;
SXE.MassIndex = MassIndex;
SXE.VWAP = VWAP;
SXE.scrSmartFilterCheck = scrSmartFilterCheck;
SXE.scrSmartFilterScore = scrSmartFilterScore;
SXE.passSmartFilters = passSmartFilters;
SXE.SMART_FILTER_DEFS = SMART_FILTER_DEFS;
SXE._getEffectiveTh = _getEffectiveTh;
SXE._getCustomThresholds = _getCustomThresholds;
SXE._loadAnalParams = _loadAnalParams;
SXE._loadMarketSlots = _loadMarketSlots;
SXE._saveSlot = _saveSlot;
SXE._deleteSlot = _deleteSlot;
SXE._resetAllAnalParams = _resetAllAnalParams;

// ════════════════════════════════════════════════════════════
//  rows 필드 어댑터 (BT용: {t,o,h,l,c,v} → {date,open,high,low,close,volume})
// ════════════════════════════════════════════════════════════
function sxAdaptRows(rows) {
  if (!rows || !rows.length) return rows;
  const first = rows[0];
  // 이미 정규 필드면 그대로 반환
  if (first.close !== undefined) return rows;
  return rows.map(r => ({
    date: r.t || r.date || '', open: r.o ?? r.open ?? 0,
    high: r.h ?? r.high ?? 0, low: r.l ?? r.low ?? 0,
    close: r.c ?? r.close ?? 0, volume: r.v ?? r.volume ?? 0,
  }));
}
SXE.adaptRows = sxAdaptRows;

// ════════════════════════════════════════════════════════════
//  백테스트 엔진 (엔진 JS 통합 — scrComputeScore 기반)
// ════════════════════════════════════════════════════════════
function sxRunBtEngine(rawRows, tf, params, opts = {}) {
  const rows = sxAdaptRows(rawRows);
  const BT_WARMUP_FULL = 100;
  const BT_WARMUP_MIN = 50;
  const BT_MIN_TRADE_BARS = 10; // 워밍업 후 최소 매매 가능 봉수
  let BT_WARMUP = BT_WARMUP_FULL;
  if (rows.length < BT_WARMUP_FULL + BT_MIN_TRADE_BARS && rows.length >= BT_WARMUP_MIN + BT_MIN_TRADE_BARS) {
    BT_WARMUP = BT_WARMUP_MIN; // 데이터 부족 시 워밍업 축소
  }
  if (rows.length < BT_WARMUP_MIN + BT_MIN_TRADE_BARS) {
    const need = BT_WARMUP_MIN + BT_MIN_TRADE_BARS;
    return { error: `데이터 부족 — ${need}봉 필요, 현재 ${rows.length}봉`, shortage: true, barsNeeded: need, barsHave: rows.length, winRate: 0, profitFactor: 0, totalPnl: 0, mdd: 0, totalTrades: 0 };
  }
  const slip = opts.slippage ?? 0.001;
  const nextBar = opts.nextBarEntry ?? false;
  const trades = [];
  const _btScores = [];
  let pos = null, equity = 100, peak = 100, maxDD = 0;
  let pendingSignal = null;

  // 통합 임계값 (로컬 우선)
  const th = _getEffectiveTh(tf);
  const baseBuyTh = params.buyTh ?? th.buyTh;
  const baseSellTh = params.sellTh ?? th.sellTh;
  // S77: tpMult/slMult 로컬 우선 (SCR_ANAL_PARAMS > params > 하드코딩)
  const _ap = _loadAnalParams();
  const baseTpMult = params.tpMult ?? (_ap.tpMult > 0 ? _ap.tpMult : 2.5);
  const baseSlMult = params.slMult ?? (_ap.slMult > 0 ? _ap.slMult : 1.5);
  // S71: 레짐 적응형 비활성 시 기본값 고정
  const _raEnabled = SXE.regimeAdaptEnabled();

  const _btVolCache = {};

  for (let i = BT_WARMUP; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - 149), i + 1);
    const ind = calcAllScreener(slice, tf);

    // S71: 봉별 레짐 감지 → 적응형 파라미터
    let buyTh = baseBuyTh, sellTh = baseSellTh, tpMult = baseTpMult, slMult = baseSlMult;
    if(_raEnabled && ind.regime){
      const ra = SXE.regimeAdapt(ind.regime);
      buyTh = clamp(baseBuyTh + ra.buyThAdj, 40, 85);
      sellTh = clamp(baseSellTh + ra.sellThAdj, 20, 50);
      tpMult = baseTpMult * ra.tpMultFactor;
      slMult = baseSlMult * ra.slMultFactor;
    }

    // 다음봉 시가 진입 처리
    if (nextBar && pendingSignal && !pos) {
      const ep = rows[i].open * (1 + slip);
      const atrPct = pendingSignal.atrPct;
      pos = { entry: ep, entryIdx: i, tp: ep * (1 + atrPct * tpMult), sl: ep * (1 - atrPct * slMult) };
      pendingSignal = null;
    }

    const volSoft = ATR.soften(ind.atr.pct, `_bt|${tf}`, _btVolCache);
    const ctx = ind.context || ContextEngine.analyze(ind);
    const { rawScore, mom, osc } = scrComputeScore(ind, volSoft, ctx.bonus);
    // S86: 봉별 3단 점수 — Ready/Entry도 산출
    const _btR = (typeof scrReadyScore === 'function') ? scrReadyScore(ind).score : 0;
    const _btE = (typeof scrEntryScore === 'function') ? scrEntryScore(ind).score : 0;
    _btScores.push({t: rawScore, r: _btR, e: _btE});

    if (!pos && !pendingSignal) {
      if (rawScore >= buyTh && _scrMomOscPass(mom, osc, tf)) {
        const atrPct = ind.atr.pct / 100;
        if (nextBar) {
          pendingSignal = { atrPct };
        } else {
          const ep = rows[i].close * (1 + slip);
          pos = { entry: ep, entryIdx: i, tp: ep * (1 + atrPct * tpMult), sl: ep * (1 - atrPct * slMult) };
        }
      }
    } else if (pos) {
      const c = rows[i].close;
      if (c >= pos.tp) {
        const exitP = pos.tp * (1 - slip);
        const pnl = ((exitP - pos.entry) / pos.entry) * 100;
        equity *= (1 + pnl / 100);
        trades.push({ entry: pos.entry, exit: exitP, pnl: +pnl.toFixed(2), type: 'WIN', bars: i - pos.entryIdx, entryIdx: pos.entryIdx, exitIdx: i, entryDate: rows[pos.entryIdx]?.date||'', exitDate: rows[i]?.date||'', tp: pos.tp, sl: pos.sl });
        pos = null;
      } else if (c <= pos.sl) {
        const exitP = pos.sl * (1 - slip);
        const pnl = ((exitP - pos.entry) / pos.entry) * 100;
        equity *= (1 + pnl / 100);
        trades.push({ entry: pos.entry, exit: exitP, pnl: +pnl.toFixed(2), type: 'LOSS', bars: i - pos.entryIdx, entryIdx: pos.entryIdx, exitIdx: i, entryDate: rows[pos.entryIdx]?.date||'', exitDate: rows[i]?.date||'', tp: pos.tp, sl: pos.sl });
        pos = null;
      }
    }
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  if (pos) trades.push({ entry: pos.entry, exit: rows[rows.length - 1].close, pnl: +(((rows[rows.length - 1].close - pos.entry) / pos.entry) * 100).toFixed(2), type: 'OPEN', bars: rows.length - 1 - pos.entryIdx, entryIdx: pos.entryIdx, exitIdx: rows.length - 1, entryDate: rows[pos.entryIdx]?.date||'', exitDate: '', tp: pos.tp, sl: pos.sl });

  const wins = trades.filter(t => t.type === 'WIN');
  const losses = trades.filter(t => t.type === 'LOSS');
  const closed = wins.length + losses.length;
  const winRate = closed ? +(wins.length / closed * 100).toFixed(1) : 0;
  const avgWin = wins.length ? +(wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2) : 0;
  const avgLoss = losses.length ? +Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length).toFixed(2) : 0;
  const pf = avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : avgWin > 0 ? 99 : 0;
  const totalPnl = +((equity - 100)).toFixed(2);
  let maxConsecLoss = 0, curConsecLoss = 0;
  trades.forEach(t => { if (t.type === 'LOSS') { curConsecLoss++; if (curConsecLoss > maxConsecLoss) maxConsecLoss = curConsecLoss; } else curConsecLoss = 0; });
  return { winRate, profitFactor: pf, totalPnl, mdd: +maxDD.toFixed(2), totalTrades: closed, avgWin, avgLoss, maxConsecLoss, scores: _btScores.map(s => s.t), scores3: _btScores, trades, rowsLength: rows.length };
}
SXE.runBtEngine = sxRunBtEngine;

// ============================================================
//  S72: 전략 라이프사이클 분석 (Strategy Lifecycle) — 5축 ③
//  BT 거래 시계열 기반 → 롤링 성과 추이 → 4단계 판정 → 퇴화 감지
// ============================================================
SXE.strategyLifecycle = function(btData, regime){
  if(!btData || !btData.trades) return null;
  const trades = btData.trades.filter(t => t.type === 'WIN' || t.type === 'LOSS');
  if(trades.length < 6) return null; // 최소 6거래 필요

  const totalTrades = trades.length;

  // ── 1. 롤링 윈도우 분석 (4등분) ──
  const qSize = Math.max(2, Math.floor(totalTrades / 4));
  const quarters = [];
  for(let i = 0; i < 4; i++){
    const start = i * qSize;
    const end = i === 3 ? totalTrades : (i + 1) * qSize;
    const slice = trades.slice(start, end);
    if(!slice.length) continue;
    const wins = slice.filter(t => t.type === 'WIN');
    const losses = slice.filter(t => t.type === 'LOSS');
    const wr = slice.length > 0 ? +(wins.length / slice.length * 100).toFixed(1) : 0;
    const avgW = wins.length ? +(wins.reduce((s,t) => s + t.pnl, 0) / wins.length).toFixed(2) : 0;
    const avgL = losses.length ? +Math.abs(losses.reduce((s,t) => s + t.pnl, 0) / losses.length).toFixed(2) : 0;
    const pf = avgL > 0 ? +(avgW / avgL).toFixed(2) : avgW > 0 ? 99 : 0;
    const cumPnl = +slice.reduce((s,t) => s + t.pnl, 0).toFixed(2);
    let consecLoss = 0, maxCL = 0;
    slice.forEach(t => { if(t.type === 'LOSS'){ consecLoss++; if(consecLoss > maxCL) maxCL = consecLoss; } else consecLoss = 0; });
    quarters.push({
      idx: i, label: `Q${i+1}`, count: slice.length,
      winRate: wr, avgWin: avgW, avgLoss: avgL, pf, cumPnl,
      maxConsecLoss: maxCL
    });
  }

  if(quarters.length < 2) return null;

  // ── 2. 추세 감지 (선형 회귀 기울기) ──
  const wrTrend = _linRegSlope(quarters.map(q => q.winRate));
  const pfTrend = _linRegSlope(quarters.map(q => q.pf > 90 ? 5 : q.pf)); // cap 99
  const pnlTrend = _linRegSlope(quarters.map(q => q.cumPnl));

  // ── 3. 라이프사이클 단계 판정 ──
  const lastQ = quarters[quarters.length - 1];
  const firstQ = quarters[0];
  const midQs = quarters.slice(1, -1);

  let phase, phaseLabel, phaseDetail;

  // 최근 구간 성과 vs 초기 구간
  const wrDelta = lastQ.winRate - firstQ.winRate;
  const pfDelta = (lastQ.pf > 90 ? 5 : lastQ.pf) - (firstQ.pf > 90 ? 5 : firstQ.pf);

  if(wrTrend > 1.5 && pfTrend > 0.1){
    phase = 'growth';
    phaseLabel = '성장기';
    phaseDetail = '전략 성과가 시간이 지남에 따라 개선되고 있습니다. 현재 파라미터가 시장에 잘 적응하고 있는 상태입니다.';
  } else if(wrTrend < -2.5 && lastQ.winRate < firstQ.winRate - 5){
    phase = 'decay';
    phaseLabel = '퇴화기';
    phaseDetail = '전략 성과가 뚜렷하게 하락하고 있습니다. 시장 환경이 변하면서 현재 전략의 유효성이 떨어지고 있을 가능성이 높습니다.';
  } else if(wrTrend < -1.0 || (pfTrend < -0.15 && lastQ.pf < 1.0)){
    phase = 'decline';
    phaseLabel = '쇠퇴기';
    phaseDetail = '전략 성과가 완만하게 악화되고 있습니다. 아직 심각한 수준은 아니지만, 파라미터 미세 조정이나 타임프레임 변경을 검토할 시점입니다.';
  } else if(Math.abs(wrTrend) <= 1.5 && lastQ.winRate >= 45 && lastQ.pf >= 1.0){
    phase = 'mature';
    phaseLabel = '성숙기';
    phaseDetail = '전략이 안정적으로 작동하고 있습니다. 큰 변동 없이 일관된 성과를 유지 중입니다. 현재 설정을 유지하되, 정기적으로 모니터링하세요.';
  } else if(totalTrades <= 10 && wrTrend >= 0){
    phase = 'early';
    phaseLabel = '초기';
    phaseDetail = '거래 수가 적어 전략의 유효성을 판단하기에 이릅니다. 더 많은 데이터가 쌓이면 정확한 평가가 가능합니다.';
  } else {
    phase = 'unstable';
    phaseLabel = '불안정';
    phaseDetail = '구간별 성과 편차가 크며, 전략이 특정 시장 환경에서만 작동하는 양상입니다. 레짐별 적응형 파라미터를 활성화하거나, 다른 타임프레임을 시도해보세요.';
  }

  // ── 4. 퇴화 감지 신호 ──
  const decaySignals = [];

  // 4a. 최근 구간 승률 급락
  if(lastQ.winRate < firstQ.winRate - 10){
    decaySignals.push({
      type: 'winrate_drop',
      severity: lastQ.winRate < firstQ.winRate - 20 ? 'high' : 'mid',
      text: `승률이 초기(${firstQ.winRate}%) 대비 최근(${lastQ.winRate}%)으로 ${(firstQ.winRate - lastQ.winRate).toFixed(0)}%p 하락했습니다.`
    });
  }

  // 4b. 최근 구간 PF 1.0 미만
  if(lastQ.pf < 1.0 && firstQ.pf >= 1.0){
    decaySignals.push({
      type: 'pf_below_one',
      severity: 'high',
      text: `손익비(PF)가 초기(${firstQ.pf}) 대비 최근(${lastQ.pf})으로 하락하여 1.0 미만입니다. 이기는 것보다 잃는 금액이 더 큽니다.`
    });
  }

  // 4c. 최근 구간 연속손실 악화
  if(lastQ.maxConsecLoss >= 3 && lastQ.maxConsecLoss > firstQ.maxConsecLoss){
    decaySignals.push({
      type: 'consec_loss_increase',
      severity: lastQ.maxConsecLoss >= 5 ? 'high' : 'mid',
      text: `최근 구간의 최대 연속 손실(${lastQ.maxConsecLoss}회)이 초기(${firstQ.maxConsecLoss}회)보다 증가했습니다.`
    });
  }

  // 4d. 누적 수익 하락 전환
  if(quarters.length >= 3){
    const peakPnlIdx = quarters.reduce((mi, q, i) => q.cumPnl > quarters[mi].cumPnl ? i : mi, 0);
    if(peakPnlIdx < quarters.length - 1 && lastQ.cumPnl < quarters[peakPnlIdx].cumPnl * 0.5){
      decaySignals.push({
        type: 'pnl_reversal',
        severity: 'high',
        text: `수익이 Q${peakPnlIdx+1}에서 정점(${quarters[peakPnlIdx].cumPnl}%) 이후 Q${quarters.length}에서 ${lastQ.cumPnl}%로 크게 하락했습니다.`
      });
    }
  }

  // ── 5. 전략 유효기간 추정 ──
  let validityEstimate = null;
  if(phase === 'decay' || phase === 'decline'){
    const barsPerTrade = btData.trades.length > 0 ? Math.round(btData.trades.reduce((s,t) => s + (t.bars||0), 0) / btData.trades.length) : 5;
    const remainTrades = Math.max(0, Math.round(lastQ.winRate / Math.max(1, Math.abs(wrTrend))));
    validityEstimate = {
      remainingTrades: remainTrades,
      remainingBars: remainTrades * barsPerTrade,
      urgency: remainTrades <= 3 ? 'immediate' : remainTrades <= 8 ? 'soon' : 'gradual',
      text: remainTrades <= 3
        ? '전략 수명이 거의 소진되었습니다. 즉시 파라미터 재조정 또는 전략 교체를 권합니다.'
        : remainTrades <= 8
        ? `약 ${remainTrades}회 거래 이내에 전략 효용이 크게 감소할 것으로 추정됩니다. 조만간 재검토가 필요합니다.`
        : `현재 추세로 약 ${remainTrades}회 거래까지는 유지 가능하지만, 점진적으로 성과가 악화될 수 있습니다.`
    };
  }

  // ── 6. 레짐 연동 분석 ──
  let regimeCorrelation = null;
  if(regime){
    const regimeDir = regime.direction || 'sideways';
    const regimeAdx = regime.adx || 0;
    if(phase === 'decay' || phase === 'decline'){
      if(regimeDir === 'down'){
        regimeCorrelation = {
          match: false,
          text: '현재 하락 레짐에서 전략이 퇴화하고 있습니다. 상승 추세에서 설계된 전략일 가능성이 높으며, 레짐 적응형 파라미터를 활성화하면 하락장에서의 진입 기준이 자동 보정됩니다.'
        };
      } else if(regimeDir === 'sideways'){
        regimeCorrelation = {
          match: false,
          text: '횡보장에서 추세 추종 전략의 효율이 떨어지고 있습니다. 횡보 레짐에서는 진입 임계값을 높이고, 목표가를 낮추는 것이 유리합니다.'
        };
      } else {
        regimeCorrelation = {
          match: true,
          text: '상승 레짐임에도 전략이 퇴화 중입니다. 시장 자체의 문제보다는 파라미터 과적합(overfitting) 가능성을 점검하세요. 다른 종목에서도 같은 파라미터로 테스트해보시기 바랍니다.'
        };
      }
    } else if(phase === 'growth' || phase === 'mature'){
      regimeCorrelation = {
        match: true,
        text: `현재 ${regime.label || regimeDir} 레짐에서 전략이 잘 작동하고 있습니다. 레짐이 변할 때를 대비해 정기적으로 모니터링하세요.`
      };
    }
  }

  // ── 7. 종합 점수 (전략 건강도) ──
  let healthScore = 50;
  // 승률 기여
  healthScore += (lastQ.winRate - 50) * 0.5;
  // PF 기여
  healthScore += Math.min(15, Math.max(-15, (lastQ.pf - 1.0) * 10));
  // 추세 기여
  healthScore += Math.min(10, Math.max(-10, wrTrend * 2));
  // 퇴화 신호 감점
  decaySignals.forEach(d => { healthScore -= d.severity === 'high' ? 8 : 4; });
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let healthGrade;
  if(healthScore >= 75) healthGrade = 'A';
  else if(healthScore >= 60) healthGrade = 'B';
  else if(healthScore >= 45) healthGrade = 'C';
  else if(healthScore >= 30) healthGrade = 'D';
  else healthGrade = 'F';

  return {
    phase, phaseLabel, phaseDetail,
    quarters,
    trends: { winRate: +wrTrend.toFixed(2), pf: +pfTrend.toFixed(3), pnl: +pnlTrend.toFixed(2) },
    decaySignals,
    validityEstimate,
    regimeCorrelation,
    health: { score: healthScore, grade: healthGrade },
    stats: {
      totalTrades,
      firstQ: { winRate: firstQ.winRate, pf: firstQ.pf, cumPnl: firstQ.cumPnl },
      lastQ: { winRate: lastQ.winRate, pf: lastQ.pf, cumPnl: lastQ.cumPnl }
    }
  };
};

// 선형회귀 기울기 헬퍼 (내부)
function _linRegSlope(arr){
  const n = arr.length;
  if(n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for(let i = 0; i < n; i++){
    sx += i; sy += arr[i]; sxy += i * arr[i]; sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if(denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

// S67: 안전필터 플래그 (스크리너에서 동기화)
SXE._safetyFlags = {threshold:true,volExtreme:true,volHigh:true,rsiDiv:true,stochRsi:true,macdNeg:true,ma60resist:true,debtRatio:false,foreignSell:false,highBeta:false};

// ══════════════════════════════════════════════════════════════
//  S73: 종목간 상관/분산 경고 (5축④)
// ══════════════════════════════════════════════════════════════

/**
 * 피어슨 상관계수 (일간 수익률 기반)
 * @param {number[]} retsA - 일간 수익률 배열 A
 * @param {number[]} retsB - 일간 수익률 배열 B
 * @returns {number|null} 상관계수 (-1~1) 또는 null (데이터 부족)
 */
function _pearsonCorr(retsA, retsB) {
  const n = Math.min(retsA.length, retsB.length);
  if (n < 20) return null;
  const a = retsA.slice(-n), b = retsB.slice(-n);
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i];
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (denom === 0) return null;
  return (n * sumAB - sumA * sumB) / denom;
}

/**
 * 종가 배열 → 일간 수익률 배열
 */
function _closesToReturns(closes) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] === 0) rets.push(0);
    else rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return rets;
}

/**
 * 종목간 상관/분산 경고
 * @param {Array<{code:string, name:string, closes:number[], sector?:string}>} stocksData
 * @returns {Object} { matrix, pairs, clusters, concentrationRisk, diversityScore, warnings, suggestions, stats }
 */
SXE.crossCorrelation = function(stocksData) {
  if (!stocksData || stocksData.length < 2) {
    return { error: 'min_2_stocks', matrix: [], pairs: [], clusters: [], concentrationRisk: 'none', diversityScore: 100, warnings: [], suggestions: [], stats: { count: stocksData ? stocksData.length : 0 } };
  }

  const n = stocksData.length;
  const returnsArr = stocksData.map(s => _closesToReturns(s.closes || []));

  // ── 1. 상관계수 매트릭스 ──
  const matrix = [];
  const pairs = []; // 모든 유효 쌍
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { matrix[i][j] = 1; continue; }
      if (j < i) { matrix[i][j] = matrix[j][i]; continue; }
      const r = _pearsonCorr(returnsArr[i], returnsArr[j]);
      matrix[i][j] = r;
      if (r !== null) {
        pairs.push({
          a: { code: stocksData[i].code, name: stocksData[i].name, idx: i },
          b: { code: stocksData[j].code, name: stocksData[j].name, idx: j },
          corr: Math.round(r * 1000) / 1000
        });
      }
    }
  }

  // ── 2. 고상관 클러스터 감지 (r > 0.7) ──
  const HIGH_CORR = 0.7;
  const EXTREME_CORR = 0.85;
  const highPairs = pairs.filter(p => p.corr > HIGH_CORR);
  const extremePairs = pairs.filter(p => p.corr > EXTREME_CORR);

  // 연결 성분(클러스터) 구하기 (Union-Find)
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  for (const p of highPairs) union(p.a.idx, p.b.idx);
  const clusterMap = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap[root]) clusterMap[root] = [];
    clusterMap[root].push(i);
  }
  const clusters = Object.values(clusterMap)
    .filter(c => c.length >= 2)
    .map(indices => ({
      stocks: indices.map(i => ({ code: stocksData[i].code, name: stocksData[i].name })),
      avgCorr: (() => {
        let sum = 0, cnt = 0;
        for (let a = 0; a < indices.length; a++) {
          for (let b = a + 1; b < indices.length; b++) {
            const v = matrix[indices[a]][indices[b]];
            if (v !== null) { sum += v; cnt++; }
          }
        }
        return cnt > 0 ? Math.round((sum / cnt) * 1000) / 1000 : 0;
      })(),
      size: indices.length
    }))
    .sort((a, b) => b.size - a.size);

  // ── 3. 섹터 편중 감지 ──
  const sectorCount = {};
  for (const s of stocksData) {
    const sec = s.sector || '미분류';
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
  }
  const sectorEntries = Object.entries(sectorCount).sort((a, b) => b[1] - a[1]);
  const maxSectorRatio = sectorEntries.length > 0 ? sectorEntries[0][1] / n : 0;

  // ── 4. 분산 점수 (0~100) ──
  const validPairs = pairs.filter(p => p.corr !== null);
  const avgCorr = validPairs.length > 0 ? validPairs.reduce((s, p) => s + Math.abs(p.corr), 0) / validPairs.length : 0;
  let diversityScore = 70;
  // 평균 절대 상관 감점 (0.5 이상이면 본격 감점)
  if (avgCorr > 0.3) diversityScore -= Math.min(30, Math.round((avgCorr - 0.3) * 75));
  // 고상관 클러스터 감점
  diversityScore -= clusters.length * 5;
  // 극단 동조 감점
  diversityScore -= extremePairs.length * 8;
  // 섹터 편중 감점 (50% 이상 한 섹터)
  if (maxSectorRatio > 0.5) diversityScore -= Math.round((maxSectorRatio - 0.5) * 30);
  // 종목 수 가점 (분산 효과)
  if (n >= 5) diversityScore += Math.min(15, (n - 4) * 3);
  // 범위 제한
  diversityScore = Math.max(0, Math.min(100, diversityScore));

  // 등급
  const grade = diversityScore >= 75 ? 'A' : diversityScore >= 60 ? 'B' : diversityScore >= 45 ? 'C' : diversityScore >= 30 ? 'D' : 'F';

  // ── 5. 위험 판정 ──
  let concentrationRisk = 'low';
  if (extremePairs.length >= 1 || (clusters.length >= 1 && clusters[0].size >= 3)) concentrationRisk = 'high';
  else if (highPairs.length >= 2 || avgCorr > 0.5) concentrationRisk = 'medium';

  // ── 6. 경고 & 제안 ──
  const warnings = [];
  const suggestions = [];

  for (const ep of extremePairs) {
    warnings.push({ type: 'extreme_sync', severity: 'high', text: `${ep.a.name}↔${ep.b.name} 극단적 동조 (r=${ep.corr})` });
  }
  for (const cl of clusters) {
    if (cl.size >= 3) {
      warnings.push({ type: 'cluster', severity: 'high', text: `${cl.stocks.map(s => s.name).join(', ')} — ${cl.size}종목 고상관 클러스터 (평균 r=${cl.avgCorr})` });
    }
  }
  if (avgCorr > 0.5) {
    warnings.push({ type: 'low_diversity', severity: 'medium', text: `전체 평균 상관 ${(avgCorr * 100).toFixed(1)}% — 분산 효과 부족` });
  }
  for (const [sec, cnt] of sectorEntries) {
    if (cnt >= 3 && sec !== '미분류') {
      warnings.push({ type: 'sector_bias', severity: cnt >= 5 ? 'high' : 'medium', text: `${sec} 섹터 ${cnt}종목 편중` });
    }
  }

  if (concentrationRisk === 'high') {
    suggestions.push('고상관 종목 중 일부를 다른 섹터 종목으로 교체 검토');
    suggestions.push('동일 섹터 집중 시 역상관 또는 방어주 추가 고려');
  }
  if (concentrationRisk === 'medium') {
    suggestions.push('상관이 높은 종목 쌍의 비중을 조절하여 위험 분산');
  }
  if (n < 5) {
    suggestions.push(`현재 ${n}종목 — 최소 5종목 이상 분산 투자 권장`);
  }
  if (maxSectorRatio > 0.5 && sectorEntries[0][0] !== '미분류') {
    suggestions.push(`${sectorEntries[0][0]} 섹터 비중 ${(maxSectorRatio * 100).toFixed(0)}% — 다른 섹터 종목 추가 고려`);
  }

  return {
    matrix, // [n][n] 상관계수 매트릭스
    pairs: pairs.sort((a, b) => b.corr - a.corr), // 상관 높은 순
    clusters,
    concentrationRisk, // 'high' | 'medium' | 'low'
    diversityScore, // 0~100
    grade, // A~F
    warnings,
    suggestions,
    sectorDistribution: sectorEntries.map(([name, count]) => ({ name, count, ratio: Math.round(count / n * 100) })),
    stats: {
      count: n,
      avgCorr: Math.round(avgCorr * 1000) / 1000,
      highPairCount: highPairs.length,
      extremePairCount: extremePairs.length,
      clusterCount: clusters.length,
      sectorCount: sectorEntries.length
    }
  };
};

/**
 * S73: 섹터 레이더 — Workers /naver/sector 응답 정제
 * @param {Object} rawData - { type, count, groups: [{name, changeRate, incrCnt, flatCnt, descCnt, totalCnt}] }
 * @param {Array} watchlistStocks - [{code, name, sector?}] 관심종목 (선택)
 * @returns {Object} { top5Bull, top5Bear, momentum, watchlistMatch[], summary }
 */
SXE.sectorRadar = function(rawData, watchlistStocks) {
  if (!rawData || !rawData.groups || rawData.groups.length === 0) {
    return { error: 'no_data', top5Bull: [], top5Bear: [], momentum: 'neutral', watchlistMatch: [], summary: '' };
  }

  const groups = rawData.groups;
  // 이미 등락률 기준 정렬되어 옴 (Workers에서)
  const sorted = [...groups].sort((a, b) => b.changeRate - a.changeRate);

  const top5Bull = sorted.slice(0, 5).map(g => ({
    name: g.name, changeRate: g.changeRate,
    incrCnt: g.incrCnt, totalCnt: g.totalCnt,
    strength: g.totalCnt > 0 ? Math.round(g.incrCnt / g.totalCnt * 100) : 0
  }));

  const top5Bear = sorted.slice(-5).reverse().map(g => ({
    name: g.name, changeRate: g.changeRate,
    descCnt: g.descCnt, totalCnt: g.totalCnt,
    weakness: g.totalCnt > 0 ? Math.round(g.descCnt / g.totalCnt * 100) : 0
  }));

  // 시장 전체 모멘텀 판정
  const avgChange = groups.reduce((s, g) => s + g.changeRate, 0) / groups.length;
  const bullSectors = groups.filter(g => g.changeRate > 0).length;
  const bearSectors = groups.filter(g => g.changeRate < 0).length;
  const bullRatio = groups.length > 0 ? bullSectors / groups.length : 0.5;
  let momentum = 'neutral';
  if (bullRatio >= 0.7 && avgChange > 0.5) momentum = 'strong_bull';
  else if (bullRatio >= 0.55 && avgChange > 0) momentum = 'bull';
  else if (bullRatio <= 0.3 && avgChange < -0.5) momentum = 'strong_bear';
  else if (bullRatio <= 0.45 && avgChange < 0) momentum = 'bear';

  // 관심종목 섹터 매칭
  const watchlistMatch = [];
  if (watchlistStocks && watchlistStocks.length > 0) {
    for (const ws of watchlistStocks) {
      if (!ws.sector) continue;
      const match = groups.find(g => g.name === ws.sector || ws.sector.includes(g.name) || g.name.includes(ws.sector));
      if (match) {
        watchlistMatch.push({
          code: ws.code, name: ws.name, sector: ws.sector,
          sectorChange: match.changeRate,
          sectorRank: sorted.findIndex(g => g.name === match.name) + 1,
          totalSectors: sorted.length,
          isBull: match.changeRate > 0
        });
      }
    }
  }

  // 자금 쏠림 감지: 상위 3개 섹터의 평균 등락률이 전체 평균의 3배 이상
  const top3Avg = top5Bull.slice(0, 3).reduce((s, g) => s + g.changeRate, 0) / Math.min(3, top5Bull.length);
  const capitalFlow = top3Avg > avgChange * 3 && top3Avg > 2 ? 'concentrated' : top3Avg > avgChange * 2 ? 'moderate' : 'distributed';

  return {
    type: rawData.type,
    top5Bull,
    top5Bear,
    momentum, // strong_bull | bull | neutral | bear | strong_bear
    capitalFlow, // concentrated | moderate | distributed
    watchlistMatch,
    summary: {
      totalSectors: groups.length,
      bullCount: bullSectors,
      bearCount: bearSectors,
      flatCount: groups.length - bullSectors - bearSectors,
      avgChange: Math.round(avgChange * 100) / 100,
      bullRatio: Math.round(bullRatio * 100)
    },
    ts: rawData.ts
  };
};
