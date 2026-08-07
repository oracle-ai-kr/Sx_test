// ════════════════════════════════════════════════════════════
//  SIGNAL X — Analysis Engine v4.5
// ════════════════════════════════════════════════════════════
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
// [S510] short/mid/long 통일 박제 — 전부 5/20/60.
//   이유: 시장 기본 파라미터(SCR_ANAL_MARKET_DEFAULTS kr/us/crypto)가 maShort:5·maMid:20·maLong:60을
//         하드코딩하고, MA.alignment·차트표시가 모두 `ip.maX > 0 ? ip : 이 표` 구조라 ip(5/20/60)가 항상 우선.
//         즉 여기 short/mid/long은 *도달하지 않는 폴백*이었음(과거 TF별 적응값은 dead code). MA는 옵티마이저
//         비최적화 고정 파라미터(5/20/60 글로벌 표준). 혼란 방지 위해 모든 TF를 5/20/60으로 통일.
//   ⚠ xlong은 통일 안 함 — maXLong은 시장 기본값에 없어(ip가 안 덮음) 여전히 LIVE.
//      base.ma120 = maAlign.xlong로 연결(지지선·조건검색 '정배열/역배열 4개'·MA120 표시 등 소비) → TF별 값 보존 필수.
//   〔과거 short/mid/long 적응값 기록〕 5m 12/48/288 · 15m 8/32/96 · 30m 8/26/48 · 60m·240m 8/24/60 ·
//      week/W 5/13/26 · month/M 3/6/12 (day/D는 원래 5/20/60)
const SCR_TF_MA = {
  '5m': { short: 5, mid: 20, long: 60, xlong: 576 }, '15m': { short: 5, mid: 20, long: 60, xlong: 192 },
  '30m': { short: 5, mid: 20, long: 60, xlong: 96 }, '60m': { short: 5, mid: 20, long: 60, xlong: 120 },
  'day': { short: 5, mid: 20, long: 60, xlong: 120 }, 'week': { short: 5, mid: 20, long: 60, xlong: 52 },
  'month': { short: 5, mid: 20, long: 60, xlong: 24 }, '240m': { short: 5, mid: 20, long: 60, xlong: 120 },
  'D': { short: 5, mid: 20, long: 60, xlong: 120 }, 'W': { short: 5, mid: 20, long: 60, xlong: 52 },
  'M': { short: 5, mid: 20, long: 60, xlong: 24 },
};
const SCR_SCORING = { tanh: 1.15, ctx: 0.75, trendTanh: 0.80, upsideTanh: 0.80 }; // [S407] trendTanh: trendPure 전용 압축계수. tanh(1.15)는 rawScore/BT 공유라 불변. [S408] upsideTanh: 추가상승 전용(0.95→0.80) — 4축 변별 기준 통일
// [S514] C 타이밍 게이트 여유분(α) — 비보유 매수는 rawScore ≥ buyTh + α 일 때만(A가 '강하게' 발화).
//   목적: buyTh가 낮아(코인25/kr30/us35) 게이트가 헐거웠던 S512 보완 → A(홀서빙)가 매수 서빙에 실제 발언권.
//   buyTh(BT 진입값)는 불변 — 게이트 바만 +15. 너무 자주 강등되면 이 값을 낮추면 됨(모니터링).
const SCR_TIMING_GATE_MARGIN = 15;

function _scrTfTh(tf) { return SCR_TF_THRESHOLD[tf] || SCR_TF_THRESHOLD['day']; }
function _scrTfMa(tf) { return SCR_TF_MA[tf] || SCR_TF_MA['day']; }

// ── 커스텀 분석 파라미터 ──
const SCR_ANAL_PARAMS_KEY = 'SX_SCR_ANAL_PARAMS';
const SCR_ANAL_DEFAULTS = { rsiLen: 14, bbLen: 20, bbMult: 2.0, maShort: 0, maMid: 0, maLong: 0, atrLen: 14, buyTh: 0, sellTh: 0, tpMult: 0, slMult: 0 };
// S211: 시장별 × 2레짐 = 6개 기본 하드코딩
//   현재 사양: 시장 체계(kr/us/crypto) — 분석 대상 종목의 시장에 따라 자동 라우팅
//   초기 하드코딩 매핑 (C안 — 깨끗이 시작):
//     · kr     ← balanced 출발점 (안정/중간 임계) — 한국 시장 일반 변동성에 적합
//     · us     ← safe 출발점     (보수/높은 임계) — 미국 대형주 추세 추종
//     · crypto ← profit 출발점   (공격/낮은 임계) — 코인 큰 변동성·강한 추세
//   사용자가 시장별로 옵티마이저 재실행 권장.
//
//   〔이력〕 모드 체계(profit/balanced/safe) → 시장 체계 전환
//     사용자 성향 축 → 시장 종류 축으로 의미 변경 (의미적으로 더 본질적)
//
// 공통: MA 5/20/60, RSI 14, ATR 14 (step=0 고정 파라미터)
// [v3.17 SELL-TH-FIX] sellTh 값 정상화 (8 → 38, 6 → 35)
//   현재 사양: clamp(20, 50) 안의 의미 있는 값으로 통일
//     - ON  슬롯 sellTh: 38 (TF별 day 기본값과 일치, 옵티마이저 fallback 38과 동일)
//     - OFF 슬롯 sellTh: 35 (보수형은 약세 더 빨리 잡고 빠지기 — buyTh ON<OFF 패턴 대칭)
//   적용 영향: 분석/BT의 SELL 판정 정상화. 신규 설치/리셋 시에만 적용.
//     기존 사용자가 _saveAnalParams로 저장한 값은 그대로 유지
//     (우선순위: SCR_ANAL_PARAMS > CUSTOM > 하드코딩)
//
//   〔이력〕 이전 버그 (수정됨):
//     sellTh:8/6은 점수 0~10 영역으로 의미 없음. 분석엔진 scrQuickScore 내부의
//     clamp(sellTh, 20, 50)에 의해 항상 20으로 강제 변환됨 → 옵티마이저로 sellTh를
//     어떻게 설정하든 효과 없음 (clamp가 일률적으로 20으로 올림).
//     원인: 과거 sellTh가 "신호 카운트(MACD 음수 봉 수 등)" 의미로 쓰이다 점수 기반
//          (rawScore <= sellTh로 SELL 판정)으로 통합되었으나 시장별 기본값 미업데이트.
const SCR_ANAL_MARKET_DEFAULTS = {
  // [v3.24-defaults] 시장 특성 + 코드 정합성 + 트레이딩 표준 기반 설정
  //   설계 근거:
  //     - 시장별 변동성 (해외/국내 ATR ≈1.5%, 코인 ATR ≈4%)
  //     - 시장별 추세 패턴 (해외 안정, 국내 빠른 회전, 코인 단타 친화)
  //     - 모든 슬롯 손익비 1.65~1.71로 일관 (추세 추종 표준)
  //     - BB: 해외 표준값(20/2.0), 국내 한국시장 적응(14/1.9), 코인 단타(9/2.1)
  //   고정 파라미터 (변경 안 함): rsiLen=14, atrLen=14, MA 5/20/60 — 글로벌 트레이딩 표준
  //   〔이력〕 v3.24 이전: 임의 설정값 (저작 초기 추정치) — 시장 특성 미반영 (수정됨)
  // 레짐 무관 fallback — 각 시장 ON 값 사용 (보편적 추세장 가정)
  kr:     { rsiLen:14, bbLen:14, bbMult:1.9, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:30, sellTh:20, tpMult:6.0, slMult:2.0 },  // [S684] buyTh −10 (가벼운 바닥 · 점수게이트 토글용)
  us:     { rsiLen:14, bbLen:20, bbMult:2.0, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:25, sellTh:15, tpMult:9.0, slMult:3.0 },  // [S684]
  crypto: { rsiLen:14, bbLen:9,  bbMult:2.1, maShort:5, maMid:20, maLong:60, atrLen:14, buyTh:35, sellTh:25, tpMult:3.0, slMult:1.0 }   // [S684]
};
// [S1092] 시장×레짐 6칸 기본값 철거 — S684에서 on/off를 전 시장 동일값으로 통일한 뒤
//   레짐 축이 이미 동어반복이었다(측정 S1091: 매수판정 변경 1만봉당 3건). SCR_ANAL_MARKET_DEFAULTS 단일로 일원화.

// ── 하위호환 alias (점진적 제거 예정) ──
//   기존 코드가 SCR_ANAL_MODE_DEFAULTS / SCR_ANAL_MODE_REGIME_DEFAULTS를 참조하는 부분을
//   한 번에 다 못 바꿀 수 있어, 신규 키와 동일 객체를 가리키게 별칭 부여.
//   참조 깨짐 방지용 — 새 코드 작성 시에는 SCR_ANAL_MARKET_*를 사용.
const SCR_ANAL_MODE_DEFAULTS = SCR_ANAL_MARKET_DEFAULTS;

// [S1092] 시장×레짐 기본값 조회 철거 — SCR_ANAL_MARKET_DEFAULTS 직접 사용
// S211: 현재 적용 프리셋 출처 라벨 생성 — 시장 기준
function _getPresetSourceLabel() {
  const mIcons = {kr:'🇰🇷',us:'🇺🇸',crypto:'🪙'};
  const mNames = {kr:'국내',us:'해외',crypto:'코인'};
  // [S347] 코인 4시간봉(240m) 라벨 추가 — 누락 시 raw 키('240m')가 그대로 노출되던 문제.
  //   '4h'는 레거시 키 호환용으로 유지. 시스템 표준 키는 '240m'.
  const tfLabels = {'30m':'30분','60m':'60분','240m':'4시간','4h':'4시간','day':'일봉','week':'주봉','month':'월봉'};
  const market = _getCurrentMarketKey();
  // [S1092] 옵티마이저 대표 프리셋(SX_OPT_BEST4·S1020 제거) + 레짐 ON/OFF 분기 철거
  // 대표 프리셋 없으면 기본 하드코딩 표시
  return `${mIcons[market]||''} ${mNames[market]||''} 기본값`;
}
// S77: 시장별 멀티슬롯 저장 (시장당 최대 5개)
//   S211: 신규 키는 _SCR_MARKET_SLOT_KEYS 사용. 이 객체는 하위호환 alias.
const SCR_ANAL_PARAMS_MARKET_KEYS = { kr:'SX_SCR_ANAL_PARAMS_KR_V2', us:'SX_SCR_ANAL_PARAMS_US_V2', coin:'SX_SCR_ANAL_PARAMS_CRYPTO_V2', crypto:'SX_SCR_ANAL_PARAMS_CRYPTO_V2' };
const SCR_ANAL_MAX_SLOTS = 5;

// ════════════════════════════════════════════════════════════
//  S211: 시장×레짐 6칸 매트릭스 저장소 (3시장 × 2레짐 = 6개 독립 슬롯)
//
//                  [국내 KR]      [해외 US]       [코인 CRYPTO]
//   레짐 ON   ┃  kr.on         us.on           crypto.on
//   레짐 OFF  ┃  kr.off        us.off          crypto.off
//
//   [설계 원칙]
//     · 분석 대상 종목의 시장(stock.market 또는 currentMarket)에 따라 자동 라우팅
//     · 모드(수익/안정/보수) 개념 폐기 — 시장 종류로 대체 (의미적으로 더 본질적)
//     · 각 슬롯은 완전 독립 — 시장·레짐 전환 시 상호 덮어쓰기 없음
//     · 저장값 자체가 "해당 시장×레짐 조건으로 BT 최적화된 값"
//
//   [저장 스키마]
//     localStorage.SX_SCR_ANAL_PARAMS_MATRIX_V2 = {
//       kr:     { on: {buyTh, sellTh, tpMult, slMult, rsiLen, ...}, off: {...} },
//       us:     { on: {...}, off: {...} },
//       crypto: { on: {...}, off: {...} }
//     }
//
//   [폴백 체인]
// S211: market(kr/us/crypto) 기반 매트릭스 키
const SCR_ANAL_PARAMS_MATRIX_KEY_LEGACY = 'SX_SCR_ANAL_PARAMS_MATRIX_V2'; // [S1092] 삭제 전용(과거 사용자 잔재 정리)

// S211: 현재 시장 키 조회 — currentMarket(kr/us/coin) → 슬롯 키(kr/us/crypto) 매핑
//   coin → crypto 변환만 주의. 그 외엔 그대로 사용.
function _getCurrentMarketKey(){
  // 워커 환경: SXE._workerMarket 우선 (메인이 scanPayload에 주입)
  if(typeof SXE !== 'undefined' && SXE._workerMarket){
    const m = SXE._workerMarket;
    return m === 'coin' ? 'crypto' : m;
  }
  // 메인 스레드: 전역 currentMarket 사용 (sx_screener.html 정의)
  if(typeof currentMarket !== 'undefined' && currentMarket){
    return currentMarket === 'coin' ? 'crypto' : currentMarket;
  }
  return 'kr';
}
// 하위호환 alias — 기존 코드가 _getCurrentMode()를 호출해도 시장 키 반환
function _getCurrentMode(){
  return _getCurrentMarketKey();
}

// [S1092] ★레짐 축 철거 — 시장별 단일 파라미터 슬롯으로 일원화.
//   근거: (1) 하드코딩 on/off가 S684부터 전 시장 동일값 = 조회 결과가 항상 같음
//         (2) 매트릭스 쓰기 경로가 옵티마이저(SX_OPT_BEST4·S1020 제거)에 묶여 사실상 막힘
//         (3) 남은 유일 효과 regimeAdapt 봉별 가산 = 측정 S1091에서 매수판정 변경 1만봉당 3건(n 미달)
//   수동 파라미터 편집은 살아있는 기능이라 시장별 단일 스토어로 보존한다.
const SCR_ANAL_PARAMS_STORE_KEY = 'SX_SCR_ANAL_PARAMS_V3';

function _loadParamsStore(){
  if(typeof SXE !== 'undefined' && SXE._workerParamsStore && typeof SXE._workerParamsStore === 'object'){
    return SXE._workerParamsStore;
  }
  try {
    const raw = localStorage.getItem(SCR_ANAL_PARAMS_STORE_KEY);
    if(raw){ const obj = JSON.parse(raw); if(obj && typeof obj === 'object') return obj; }
  } catch(_){}
  return {};
}
function _saveParamsStore(store){
  try { localStorage.setItem(SCR_ANAL_PARAMS_STORE_KEY, JSON.stringify(store||{})); } catch(_){}
}
// 시장 기본값 (레짐 축 없음)
function _getMarketDefaults(marketOrMode){
  const _legacyMap = { profit:'crypto', balanced:'kr', safe:'us' };
  const market = _legacyMap[marketOrMode] || marketOrMode;
  const def = SCR_ANAL_MARKET_DEFAULTS[market];
  return def ? { ...SCR_ANAL_DEFAULTS, ...def } : { ...SCR_ANAL_DEFAULTS };
}
// 저장 슬롯 우선 → 없으면 시장 기본값
function _getSlotParams(marketOrMode){
  const _legacyMap = { profit:'crypto', balanced:'kr', safe:'us' };
  const market = _legacyMap[marketOrMode] || marketOrMode;
  const slot = _loadParamsStore()[market];
  if(slot && typeof slot === 'object' && slot.buyTh > 0) return { ...SCR_ANAL_DEFAULTS, ...slot };
  return _getMarketDefaults(market);
}
function _saveSlotParams(marketOrMode, params){
  if(!params || typeof params !== 'object') return false;
  const _legacyMap = { profit:'crypto', balanced:'kr', safe:'us' };
  const market = _legacyMap[marketOrMode] || marketOrMode;
  try { const st = _loadParamsStore(); st[market] = { ...params }; _saveParamsStore(st); return true; }
  catch(e){ console.warn('[_saveSlotParams] 저장 실패:', e); return false; }
}
function _resetSlotToDefault(marketOrMode){
  const _legacyMap = { profit:'crypto', balanced:'kr', safe:'us' };
  const market = _legacyMap[marketOrMode] || marketOrMode;
  const st = _loadParamsStore();
  if(st[market]){ delete st[market]; _saveParamsStore(st); return true; }
  return false;
}
function _resetAllSlotsToDefault(){ _saveParamsStore({}); return true; }
function _hasSlotOverride(marketOrMode){
  const _legacyMap = { profit:'crypto', balanced:'kr', safe:'us' };
  const market = _legacyMap[marketOrMode] || marketOrMode;
  const slot = _loadParamsStore()[market];
  return !!(slot && typeof slot === 'object' && slot.buyTh > 0);
}
function _countMarketSlots(marketOrMode){ return _hasSlotOverride(marketOrMode) ? 1 : 0; }

function _loadAnalParams(){ return _getSlotParams(_getCurrentMarketKey()); }
function _saveAnalParams(p){ _saveSlotParams(_getCurrentMarketKey(), p); }
// S77 → S211: 시장별 슬롯 배열 로드 (kr/us/crypto 키)
//   coin → crypto 매핑은 호출자에서 처리하거나 여기서 양쪽 다 인식
const _SCR_MARKET_SLOT_KEYS = {
  kr:     'SX_SCR_ANAL_PARAMS_KR_V2',
  us:     'SX_SCR_ANAL_PARAMS_US_V2',
  crypto: 'SX_SCR_ANAL_PARAMS_CRYPTO_V2'
};
function _loadMarketSlots(market) {
  const m = market === 'coin' ? 'crypto' : market;
  const key = _SCR_MARKET_SLOT_KEYS[m];
  if(!key) return [];
  try { const arr = JSON.parse(localStorage.getItem(key)); if(Array.isArray(arr)) return arr.slice(0, SCR_ANAL_MAX_SLOTS); } catch(_){}
  return [];
}
function _saveMarketSlots(market, slots) {
  const m = market === 'coin' ? 'crypto' : market;
  const key = _SCR_MARKET_SLOT_KEYS[m];
  if(key) { try { localStorage.setItem(key, JSON.stringify(slots.slice(0, SCR_ANAL_MAX_SLOTS))); } catch(_){} }
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
  try {
    // S211: 신규 키 모두 삭제 (시장별 멀티슬롯 + 매트릭스)
    Object.values(_SCR_MARKET_SLOT_KEYS).forEach(k=>localStorage.removeItem(k));
    localStorage.removeItem(SCR_ANAL_PARAMS_MATRIX_KEY_LEGACY);
    localStorage.removeItem(SCR_ANAL_PARAMS_STORE_KEY);
    ['SX_REGIME_ADAPT','SX_REGIME_ON_MIGRATED','SX_OPT_BEST4'].forEach(k=>localStorage.removeItem(k)); // [S1092] 레짐/옵티마이저 잔재
    // 옛 사용자 환경에 남아있을 수 있는 레거시 키들도 명시적 리셋 시 함께 정리
    localStorage.removeItem(SCR_ANAL_PARAMS_KEY);
    localStorage.removeItem('SX_SCR_ANAL_PARAMS_MATRIX'); // 모드 기준 v1
    ['SX_SCR_ANAL_PARAMS_KR','SX_SCR_ANAL_PARAMS_US','SX_SCR_ANAL_PARAMS_COIN'].forEach(k=>localStorage.removeItem(k));
  } catch(_){}
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
    // [S583] 게이트 30→50, seg 하한 10 — 짧은 히스토리(신규상장/신생코인)에서 seg가 3~7봉으로
    //   쪼그라들어 노이즈성 다이버전스가 잡히던 문제 차단. 풀히스토리(n≥134) 거동은 종전과 동일.
    if (n < 50) return null;
    const seg = Math.min(20, Math.max(10, Math.floor(n * 0.15)));
    const recent = closes.slice(-seg), rsiRecent = rsiArr.slice(-seg).filter(v => v != null);
    const prev = closes.slice(-seg * 2, -seg), rsiPrev = rsiArr.slice(-seg * 2, -seg).filter(v => v != null);
    if (!rsiRecent.length || !rsiPrev.length) return null;
    // [S522] 최근성 게이트 — 다이버전스가 앵커하는 '최근 구간 가격 극값'이 구간 후반부(최근 ceil(seg/2)봉) 안에 있을 때만 유효.
    //   목적: 고점/저점이 실은 수주 전인데 죽은 다이버전스가 계속 발동해 진입을 막던 문제 차단. 비교 구간(seg/prev)은 종전 유지.
    const _recWin = Math.ceil(seg / 2);
    const _idxFromEnd = (arr, isMax) => { let bi = 0; for (let i = 1; i < arr.length; i++) { if (isMax ? arr[i] > arr[bi] : arr[i] < arr[bi]) bi = i; } return arr.length - 1 - bi; };
    const pHL = Math.min(...recent) < Math.min(...prev), rsiHL = Math.min(...rsiRecent) > Math.min(...rsiPrev);
    if (pHL && rsiHL && _idxFromEnd(recent, false) < _recWin) return 'bullish';
    const pHH = Math.max(...recent) > Math.max(...prev), rsiHH = Math.max(...rsiRecent) < Math.max(...rsiPrev);
    if (pHH && rsiHH && _idxFromEnd(recent, true) < _recWin) return 'bearish';
    return null;
  }
};

const MACD = {
  calc(closes, fast = 12, slow = 26, sig = 9) {
    const emaF = emaArray(closes, fast), emaS = emaArray(closes, slow);
    const line = [], hist = [];
    // [BUGFIX] 양 EMA가 정의된 시점부터 line을 만들고, 이전 구간은 null로 채움
    //   현재 사양: line의 valid 부분만 잘라 emaArray에 넣고, 결과를 원래 인덱스에 매핑
    //   〔이력〕 이전: 초기 구간을 0으로 채워서 emaArray(line, sig)의 SMA 초기값이 0에 의해 왜곡됨 (수정됨)
    let firstValid = -1;
    for (let i = 0; i < closes.length; i++) {
      if (emaF[i] == null || emaS[i] == null) {
        line.push(null); hist.push(0);
      } else {
        line.push(emaF[i] - emaS[i]);
        hist.push(0);
        if (firstValid < 0) firstValid = i;
      }
    }
    let sigArr = new Array(closes.length).fill(null);
    if (firstValid >= 0) {
      const validLine = line.slice(firstValid).map(v => v == null ? 0 : v);
      const sigSub = emaArray(validLine, sig);
      for (let i = 0; i < sigSub.length; i++) {
        sigArr[firstValid + i] = sigSub[i];
      }
    }
    for (let i = 0; i < line.length; i++) {
      hist[i] = (sigArr[i] != null && line[i] != null) ? line[i] - sigArr[i] : 0;
    }
    // line의 null은 hist 사용처와의 호환을 위해 0으로 변환해 반환 (기존 인터페이스 유지)
    const lineOut = line.map(v => v == null ? 0 : v);
    return { line: lineOut, sig: sigArr, hist };
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
    // [PATCH-11] ADX는 DX의 Wilder smoothed average여야 함 (기존: 마지막 봉의 DX 단일값 반환)
    //   표준 공식: (1) 초기 period 구간 TR/+DM/-DM 누적 → (2) 이후 Wilder smooth로 각 봉 DX 계산
    //             → (3) 첫 ADX = period개 DX의 단순평균 → (4) 이후 ADX = (ADX_prev×(period-1) + DX) / period
    const n = rows.length;
    if (n < period + 1) return { adx: 0, pdi: 0, mdi: 0 };
    let atr = 0, pDM = 0, mDM = 0;
    for (let i = 1; i <= period; i++) {
      const h = rows[i].high - rows[i - 1].high, l = rows[i - 1].low - rows[i].low;
      pDM += (h > l && h > 0) ? h : 0;
      mDM += (l > h && l > 0) ? l : 0;
      atr += Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
    }
    // 첫 번째 DX 값 계산 (index = period)
    const dxSeries = [];
    {
      const pdi0 = atr > 0 ? (pDM / atr) * 100 : 0;
      const mdi0 = atr > 0 ? (mDM / atr) * 100 : 0;
      const dx0 = (pdi0 + mdi0) > 0 ? Math.abs(pdi0 - mdi0) / (pdi0 + mdi0) * 100 : 0;
      dxSeries.push(dx0);
    }
    // Wilder smoothing 반복 — 각 봉마다 DX 계산해서 시리즈에 누적
    for (let i = period + 1; i < n; i++) {
      const h = rows[i].high - rows[i - 1].high, l = rows[i - 1].low - rows[i].low;
      const tr = Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
      atr = atr - atr / period + tr;
      pDM = pDM - pDM / period + ((h > l && h > 0) ? h : 0);
      mDM = mDM - mDM / period + ((l > h && l > 0) ? l : 0);
      const pdiI = atr > 0 ? (pDM / atr) * 100 : 0;
      const mdiI = atr > 0 ? (mDM / atr) * 100 : 0;
      const dxI = (pdiI + mdiI) > 0 ? Math.abs(pdiI - mdiI) / (pdiI + mdiI) * 100 : 0;
      dxSeries.push(dxI);
    }
    // 최종 +DI/-DI (마지막 smoothed 값 기준)
    const pdi = atr > 0 ? (pDM / atr) * 100 : 0;
    const mdi = atr > 0 ? (mDM / atr) * 100 : 0;
    // ADX = DX의 Wilder smoothed average
    //   DX가 period개 미만이면 충분한 평활이 안 되므로 현재 DX 시리즈 평균으로 대체
    let adx = 0;
    if (dxSeries.length >= period) {
      // 초기 ADX = 첫 period개 DX의 단순 평균
      let sum = 0;
      for (let k = 0; k < period; k++) sum += dxSeries[k];
      adx = sum / period;
      // 이후 Wilder smoothing
      for (let k = period; k < dxSeries.length; k++) {
        adx = (adx * (period - 1) + dxSeries[k]) / period;
      }
    } else if (dxSeries.length > 0) {
      // 데이터 부족 시 현재까지의 DX 시리즈 단순 평균 (fallback)
      let sum = 0;
      for (const v of dxSeries) sum += v;
      adx = sum / dxSeries.length;
    }
    return { adx, pdi, mdi };
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
    // [S583] RSI.divergence와 동일 — 게이트 30→50, seg 하한 8 (OBV는 노이즈가 커 RSI보다 약간 타이트).
    if (n < 50) return null;
    const seg = Math.min(15, Math.max(8, Math.floor(n * 0.12)));
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
    // [S522] 최근성 게이트 — RSI.divergence와 동일 원리(가격 극값이 최근 ceil(seg/2)봉 안에 있을 때만 유효).
    const _recWin = Math.ceil(seg / 2);
    const _idxFromEnd = (arr, isMax) => { let bi = 0; for (let i = 1; i < arr.length; i++) { if (isMax ? arr[i] > arr[bi] : arr[i] < arr[bi]) bi = i; } return arr.length - 1 - bi; };
    const pLL = Math.min(...recentP) < Math.min(...prevP), oHL = Math.min(...recentO) > Math.min(...prevO);
    if (pLL && oHL && _idxFromEnd(recentP, false) < _recWin) return 'bullish';
    const pHH = Math.max(...recentP) > Math.max(...prevP), oLH = Math.max(...recentO) < Math.max(...prevO);
    if (pHH && oLH && _idxFromEnd(recentP, true) < _recWin) return 'bearish';
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

// [S509] 장기 정배열 게이트 — C 경로선택 전용 (단기 5/20/60 점수와 별개).
//   TF별 데이터 부족과 타협한 3단 매핑:
//     · 일봉 이하(day/60m/240m 등): 60/120/200  (≈ 장기 시장추세선)
//     · 주봉(week/W)              : 20/60/120
//     · 월봉(month/M)             : 5/20/60
//   최장 이평선조차 봉수 부족이면 gateOn=false → 게이트 비활성(두 경로 다 평가).
function _maAlignLTTrip(tf){
  if (tf === 'month' || tf === 'M') return [5, 20, 60];
  if (tf === 'week'  || tf === 'W') return [20, 60, 120];
  return [60, 120, 200];
}
function _maAlignLT(closes, tf){
  const trip = _maAlignLTTrip(tf);
  const n = closes ? closes.length : 0;
  if (n < trip[2]) return { gateOn: false, bullish: false, bearish: false, trip };
  const a = sma(closes, trip[0]), b = sma(closes, trip[1]), c = sma(closes, trip[2]);
  if (a == null || b == null || c == null) return { gateOn: false, bullish: false, bearish: false, trip };
  return { gateOn: true, bullish: (a > b && b > c), bearish: (a < b && b < c), trip };
}
// 장기 정배열 → C 게이트 문자열: 'bull'|'bear'|'mixed'|'off'(봉수 부족)
function _ltAlignStr(lt){
  if (!lt || !lt.gateOn) return 'off';
  if (lt.bullish) return 'bull';
  if (lt.bearish) return 'bear';
  return 'mixed';
}

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
      newHighN: false, newLowN: false, changeRate: 0, rangeRate: 0, intradayRange: 0, periodChange5: 0, prevHighBreak: false, score: 0 };
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

    // S161-2: 당일 변동폭 (고가-저가)/전일종가 — intraday_range 프리셋 지원
    const intradayRange = p.close > 0 ? ((r.high - r.low) / p.close) * 100 : 0;

    // S161-2: N일(기본5일) 등락률 — period_change 프리셋 지원
    const periodN = 5;
    const periodChange5 = (n > periodN && rows[n - 1 - periodN]?.close > 0)
      ? ((r.close - rows[n - 1 - periodN].close) / rows[n - 1 - periodN].close) * 100
      : 0;

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
      changeRate, rangeRate, intradayRange, periodChange5, prevHighBreak, score };
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
    // [S379] 연속 점수(0~100) — 누적 A/D선이 기준선(sig) 대비 얼마나 벗어났나를 변화량 변동성으로 정규화
    let score100 = 50;
    {
      const d=[]; for(let i=Math.max(1,n-30);i<n;i++) d.push(arr[i]-arr[i-1]);
      const dm=d.reduce((a,b)=>a+b,0)/(d.length||1);
      const sd=Math.sqrt(d.reduce((a,b)=>a+(b-dm)**2,0)/(d.length||1))||1;
      const z=(ad - sig20)/(sd*5);
      score100=Math.max(0,Math.min(100,Math.round(50+Math.tanh(z)*50)));
    }
    return { val: ad, sig: sig20, arr, trend, signal, score, score100 };
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
    // [S379] 연속 점수(0~100) — raw EOM 분포 대비 현재값 z-score. trend='bullish' 표현 불일치로 인한 50고정 버그 우회
    let score100 = 50;
    {
      const em=raw.reduce((a,b)=>a+b,0)/(raw.length||1);
      const sd=Math.sqrt(raw.reduce((a,b)=>a+(b-em)**2,0)/(raw.length||1))||1;
      const z=(val - em)/(sd*1.5);
      score100=Math.max(0,Math.min(100,Math.round(50+Math.tanh(z)*50)));
    }
    return { val, sma: sigVal, trend, cross, score100 };
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
    // [S379] 연속 점수(0~100) — Chaikin Osc(fast-slow EMA)를 A/D선 변화량 변동성으로 정규화
    let score100 = 50;
    {
      const d=[]; for(let i=Math.max(1,n-30);i<n;i++) d.push(adArr[i]-adArr[i-1]);
      const dm=d.reduce((a,b)=>a+b,0)/(d.length||1);
      const sd=Math.sqrt(d.reduce((a,b)=>a+(b-dm)**2,0)/(d.length||1))||1;
      const z=val/(sd*3);
      score100=Math.max(0,Math.min(100,Math.round(50+Math.tanh(z)*50)));
    }
    return { val, trend, cross, score100 };
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
    // [S362] 코인도 직접 산출 — 기존 env.btc.dir 단순 참조는 dir 미수집 시 'unknown'(미확인) 빈발.
    //   국내·해외처럼 대표값(BTC 등락률)으로 방향 직접 판정. 코인 변동성 고려해 임계값을 넓게.
    //   ≥+2.5 강세 / ≥+0.7 약강 / ≤−2.5 약세 / ≤−0.7 약하락 / 그 사이 중립. cr 없을 때만 dir/overall 폴백.
    if (market === 'coin') {
      const cr = env.btc ? env.btc.changeRate : null;
      if (cr != null && isFinite(cr)) {
        return cr >= 2.5 ? 'bull' : cr >= 0.7 ? 'mild_bull' : cr <= -2.5 ? 'bear' : cr <= -0.7 ? 'mild_bear' : 'neutral';
      }
      return (env.btc && env.btc.dir) ? env.btc.dir : env.overall.state;
    }
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
    const stateLabel = { bull: '🟢 강세', mild_bull: '🔵 약강', neutral: '⚪ 중립', mild_bear: '🟡 약하락', bear: '🔴 약세', unknown: '⚫ 미확인' }[state] || '⚫ 미확인';
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
    // [S476] 레짐 방향 — 단기 5봉 slope(L749: (c[n-1]-c[n-5])/(5·c)) 단독 판정의 노이즈 제거.
    //   〔기존 버그〕 `score<40 || slope<-0.01`처럼 DOWN이 slope OR로만 트리거 → UP은 AND(엄격)/DOWN은 OR(느슨) 비대칭.
    //     5봉 −5% ≈ slope −0.01이라, 정배열·신고가 종목도 직전 5봉 눌림 한 번이면 '하락 추세 진행'으로 오판(삼성전자 케이스).
    //   〔개선〕 추세 실제 방향은 +DI/−DI·MA정배열을 1차 근거로, slope/score는 보조. UP/DOWN 대칭.
    const _pdi = ind.adx.pdi ?? 0, _mdi = ind.adx.mdi ?? 0;
    const _diUp = _pdi > _mdi, _diDn = _mdi > _pdi;
    const _maUp = !!(ind.maAlign && ind.maAlign.bullish);
    const _maDn = !!(ind.maAlign && ind.maAlign.bearish);
    let direction;
    if (score >= 60) {
      // 강추세권: 실제 방향(DI/정배열) 우선 — 단기 slope 음수 노이즈로 뒤집지 않음.
      direction = (_diUp || _maUp) ? 'UP' : (_diDn || _maDn) ? 'DOWN' : (slope > 0 ? 'UP' : slope < 0 ? 'DOWN' : 'FLAT');
    } else if (score <= 40) {
      // 약세권: 하락 방향(DI/역배열) 우선.
      direction = (_diDn || _maDn) ? 'DOWN' : (_diUp || _maUp) ? 'UP' : 'FLAT';
    } else {
      // 중간권: slope·DI가 같은 방향일 때만 방향 부여, 아니면 FLAT(노이즈 차단).
      direction = (slope > 0.01 && _diUp) ? 'UP' : (slope < -0.01 && _diDn) ? 'DOWN' : 'FLAT';
    }
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
// [S1092] regimeAdaptEnabled / setRegimeAdapt / regimeAdapt(buyTh·sellTh 봉별 가산) 철거.
//   측정 S1091: 보정은 봉의 56%에서 발생했으나 매수판정을 바꾼 건 fit 23/62,228 · OOS 14/59,885(1만봉당 3건).
//   사전선언 n>=30 양 창 미달 → PREREG 미달 조항에 따라 철거. 원자료 = m/out/fit_kr.json · oos_kr.json.

// [S257] SXE._applyRegimeAdapt 헬퍼 삭제 (이전 L2070~2080)
//   〔이력〕 호출처 0건이었음 (sxRunBtEngine·scrQuickScore는 자체 clamp 사용).
//     clamp 하한이 40으로 분석/BT 자체 clamp(20)와 어긋나 있어 외부 호출 시 함정 가능성.
//     마이그레이션 정책(레거시 호환 불필요)에 따라 정리 — 외부에서 필요하면 SXE.regimeAdapt(regime) 직접 사용.

// ════════════════════════════════════════════════════════════
//  통합 지표 계산 (calcAllScreener)
// ════════════════════════════════════════════════════════════
// [S254] _volCache 제거 — 모듈 스코프 + 종목 식별자 없는 키(`scr_${rows[0].date}`)로 인해
//   종목 간 ATR% 누수 발생. scrQuickScore는 종목당 1회 호출이라 prev는 항상 직전 분석 종목의 atrPct.
//   결과: 0.3×직전종목ATR + 0.7×현재종목ATR로 변동성 안전필터/scoreMomentum이 미세 오염.
//   수정: ATR.soften 호출 시 cache=null → 단순 pct 반환. smoothing 효과 자체 폐기.
//   사유: scrQuickScore 단일 호출에선 smoothing 의미 없음. scoreMomentum의 5회 호출은
//     시간 역순(현재→4봉전)이라 prev에 미래 ATR이 섞이는 어긋남이 있어 어차피 무의미.
//   영향 없음: BT의 _btVolCache는 함수 스코프(L3991)라 한 종목 BT 내 시간 smoothing은 그대로 정상 동작.

// ─── [FUTURE-6] OHLC 정합성 보정 공통 유틸 ─────────────────────
// 목적: PATCH-13의 인라인 보정 로직을 공통 헬퍼로 추출
//   - calcAllScreener (지표 계산), sxRunBtEngine (백테스트), Worker 진입점 등
//     모든 rows 진입점에서 동일하게 사용 가능
//   - 외부 API 오염 데이터(close > high 등)를 안전 범위로 clamp
//
// 동작:
//   - 정상이면 원본 그대로 반환 (참조 동일, 메모리 부담 0)
//   - 오염 발견 시에만 새 배열 생성 (원본 보존, inplace 수정 안 함)
//
// 사용:
//   const cleanRows = SXE.sanitizeRows(rawRows);
//
// 주의:
//   - 차트 표시는 원본 rows 사용 (의도) — sanitize 적용 금지
//   - 이중 호출은 안전 (이미 정상이면 noop)
SXE.sanitizeRows = function(rows){
  if (!rows || !rows.length) return rows;
  // [BUGFIX] 마지막 봉만 검사하면 중간 봉의 오염을 놓침 — 전체 봉을 한 번 스캔
  // [S234] o=0 / l=0 같은 비정상 봉도 sanitize 대상에 포함
  //   증상: SK하이닉스 마지막 봉 {o:0, h:1686000, l:0, c:1686000}이
  //         기존 검사(c>h, c<l, o>h, o<l)를 모두 통과 → 차트 wick 0까지 뻗음
  //   원인: Naver API가 장외/일요일에 OHLC 일부 0 반환 — 정합성은 만족하지만 데이터로 못 씀
  //   해결: o<=0 또는 l<=0이면 close로 보강 (정상 close가 있는 한 차트/지표 표시 가능)
  let _needSanitize = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const o = r.open, h = r.high, l = r.low, c = r.close;
    if (o == null || h == null || l == null || c == null) continue;
    // [S234] o=0 또는 l=0 추가 검사 (close>0이고 high>0이면 보강 가능)
    if (c > h || c < l || o > h || o < l || (o <= 0 && c > 0) || (l <= 0 && c > 0)) { _needSanitize = true; break; }
  }
  if (!_needSanitize) return rows; // 정상 — 원본 그대로
  let _fixedCount = 0;
  const result = rows.map(r => {
    const o = r.open, h = r.high, l = r.low, c = r.close;
    if (o == null || h == null || l == null || c == null) return r;
    // [S234] o=0 / l=0 보정: close 값으로 대체 (보수적 — 실제 가격이 close라고 가정)
    const oFixed = (o <= 0 && c > 0) ? c : o;
    const lFixed = (l <= 0 && c > 0) ? Math.min(oFixed, c) : l;
    const hFixed = (h <= 0 && c > 0) ? Math.max(oFixed, c) : h;
    const maxV = Math.max(oFixed, hFixed, lFixed, c);
    const minV = Math.min(oFixed, hFixed, lFixed, c);
    if (hFixed >= maxV && lFixed <= minV && oFixed === o && lFixed === l && hFixed === h) return r; // 정합성 OK & 변경 없음
    _fixedCount++;
    return Object.assign({}, r, {
      open: oFixed,
      high: Math.max(hFixed, maxV),
      low: Math.min(lFixed, minV),
      // close는 그대로
    });
  });
  // [S234 DIAG] 보정 발생 시 1회만 로그 (반복 호출 시 노이즈 방지)
  if (_fixedCount > 0 && typeof console !== 'undefined' && console.log) {
    try { console.log(`[S234] sanitizeRows: ${_fixedCount}봉 OHLC 보정 (o=0/l=0 → close 기반 복원)`); } catch(_){}
  }
  return result;
};

function calcAllScreener(rows, tf) {
  const ip = _loadAnalParams();
  // [PATCH-13 → FUTURE-6] OHLC 정합성 보정을 SXE.sanitizeRows 공통 유틸로 위임
  //   동작 동일: 정상 데이터는 원본 그대로, 오염 데이터만 새 배열로 정제
  rows = SXE.sanitizeRows(rows);
  const closes = rows.map(r => r.close);
  const n = closes.length;
  const price = closes[n - 1];

  const rsiArr = RSI.calc(closes, ip.rsiLen);
  // [PATCH-12] ?? 연산자는 null/undefined만 잡고 NaN은 통과시킴 — Number.isFinite로 NaN도 차단
  const _rsiRaw = rsiArr[n - 1];
  const rsiVal = Number.isFinite(_rsiRaw) ? _rsiRaw : 50;
  const macdObj = MACD.calc(closes);
  const stochVal = Stochastic.calc(rows);
  const cciVal = CCI.calc(rows);
  const adxVal = ADX.calc(rows, 14);
  const obvObj = OBV.calc(rows);
  const volOsc = VolumeOSC.calc(rows);
  const bbVal = BollingerBands.calc(closes, ip.bbLen, ip.bbMult);
  const squeeze = BollingerBands.squeeze(closes, ip.bbLen);
  const maAlign = MA.alignment(closes, tf, ip);
  const maAlignLT = _maAlignLT(closes, tf); // [S509] 장기 정배열 게이트 (C 경로선택 전용)
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
    maAlignLT, // [S509] 장기 정배열 게이트 (C 경로선택 전용 — 분석/워커 공유)
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
    mfi: calcMFI(rows.map(r => r.high), rows.map(r => r.low), closes, rows.map(r => r.volume), 14),  // [S786] calcAllScreener 누락분 — 변별력/레시피 재료용(mfi/vr/psar). 분석 calcIndicators엔 있었으나 스크리너엔 빠져 항상 null/0이었음.
    vr: calcVR(closes, rows.map(r => r.volume), 20),
    psar: calcParabolicSAR(rows.map(r => r.high), rows.map(r => r.low), closes),
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
  // [S433] 가짜 저항(이평선) 돌파 — 막 돌파(직전봉 종가 ≤ MA → 현재봉 종가 > MA)인데 OBV/거래량 미확인 = 거짓 신호.
  //   저항선: 5/20/60일선 중 막 상향 돌파한 최고 선(60>20>5 우선). 안전필터 fakeBreakout 단일소스(평가 3곳은 ind._fakeBreak만 읽음).
  //   교차는 현재값 아닌 직전봉/현재봉 각각의 SMA로 정확 판정. OBV 하락 OR 거래량 20MA 미만이면 가짜로 판정.
  base._fakeBreak = null;
  try {
    if (closes.length >= 61) {
      const _fbN = closes.length;
      const _fbPrevC = closes[_fbN - 2], _fbCurC = closes[_fbN - 1];
      const _fbSma = (p, end) => { const s = closes.slice(end - p, end); return s.reduce((a, b) => a + b, 0) / p; };
      let _fbMa = null;
      for (const p of [60, 20, 5]) {
        const _mp = _fbSma(p, _fbN - 1), _mn = _fbSma(p, _fbN);
        if (_fbPrevC <= _mp && _fbCurC > _mn) { _fbMa = p; break; }
      }
      if (_fbMa) {
        const _fbObvDown = obvObj && obvObj.trend === 'down';
        const _fbVols = rows.map(r => r.volume || 0);
        const _fbVAvg = _fbN >= 21 ? _fbVols.slice(_fbN - 21, _fbN - 1).reduce((a, b) => a + b, 0) / 20 : null;
        const _fbVolWeak = _fbVAvg ? (_fbVols[_fbN - 1] < _fbVAvg) : false;
        if (_fbObvDown || _fbVolWeak) base._fakeBreak = { ma: _fbMa, obvDown: !!_fbObvDown, volWeak: !!_fbVolWeak };
      }
    }
  } catch (_eFb) { /* 가짜돌파 판정 실패 시 필터 미적용 (안전) */ }
  // [S436] 매물대 저항 — 현재가 위쪽 +1~8% 구간의 거래량 집중 = 머리 위 매물(본전 매도)이 상승 저항 = 진입 부담. volResist 단일소스.
  //   [S523] ① 종가 단일귀속 → 고저(H~L) 범위 분산: 봉이 구간을 관통하면 겹친 비율만큼 거래량 배분(종가가 구간 밖이어도 장중 관통분 포착·close-only 맹점 제거).
  //   [S523] ③ 등가중 → 최근성 선형감쇠(최신=1.0 · 최古=_vrFloor): 분자/분모에 동일 가중 _w 적용 → 오래된 매물이 자동 약화(수개월 전 물량 ≠ 어제 물량).
  //   doji/플랫봉(H==L)은 종가 점질량 폴백. Volume Profile 경량판. ⚠임계값 0.20·_vrFloor는 BT로 재보정 대상(고저분산은 집계량↑ 경향).
  base._volResist = null;
  try {
    const _vrN = Math.min(120, rows.length);
    if (_vrN >= 30) {
      const _vrRows = rows.slice(-_vrN);
      const _vrCur = closes[closes.length - 1];
      if (_vrCur > 0) {
        const _vrLo = _vrCur * 1.01, _vrHi = _vrCur * 1.08; // 현재가 위쪽 +1% ~ +8%
        const _vrFloor = 0.3; // [S523] 가장 오래된 봉 가중치(최신=1.0). 0.20 임계와 함께 BT 재보정 대상.
        let _vrZone = 0, _vrTotal = 0;
        for (let i = 0; i < _vrN; i++) {
          const _r = _vrRows[i];
          const _v = _r.volume || 0;
          if (_v <= 0) continue;
          const _w = _vrFloor + (1 - _vrFloor) * (_vrN > 1 ? i / (_vrN - 1) : 1); // 선형 최근성 가중(i=0 최古 → i=N-1 최신)
          const _wv = _v * _w;
          _vrTotal += _wv;
          const _h = _r.high || _r.close, _l = _r.low || _r.close;
          let _frac = 0;
          if (_h > _l) {
            const _ov = Math.min(_h, _vrHi) - Math.max(_l, _vrLo); // 봉 고저 ∩ 매물구간 겹침 폭
            if (_ov > 0) _frac = _ov / (_h - _l);                  // 봉 범위 대비 겹친 비율(거래량 균등 분산 가정)
          } else if (_r.close >= _vrLo && _r.close <= _vrHi) {
            _frac = 1; // doji/플랫봉 폴백 — 종가가 구간 안이면 전량
          }
          if (_frac > 0) _vrZone += _wv * _frac;
        }
        if (_vrTotal > 0) {
          const _vrRatio = _vrZone / _vrTotal;
          if (_vrRatio >= 0.20) base._volResist = { ratioPct: Math.round(_vrRatio * 100) };
        }
      }
    }
  } catch (_eVR) { /* 매물대 판정 실패 시 필터 미적용 (안전) */ }
  // [S531] 매물대 지지 — _volResist의 거울. 현재가 아래쪽 -1~8% 구간 거래량 집중 = 발밑 매물(저가 매수대)이 하락 지지.
  //   캔들 전이 카드(_candleTransitionScore)의 양/음 대칭 보정 전용. 안전필터/진입에는 미사용(저항만 진입 부담 — 의도적 비대칭 유지).
  base._volSupport = null;
  try {
    const _vsN = Math.min(120, rows.length);
    if (_vsN >= 30) {
      const _vsRows = rows.slice(-_vsN);
      const _vsCur = closes[closes.length - 1];
      if (_vsCur > 0) {
        const _vsLo = _vsCur * 0.92, _vsHi = _vsCur * 0.99; // 현재가 아래쪽 -8% ~ -1%
        const _vsFloor = 0.3;
        let _vsZone = 0, _vsTotal = 0;
        for (let i = 0; i < _vsN; i++) {
          const _r = _vsRows[i];
          const _v = _r.volume || 0;
          if (_v <= 0) continue;
          const _w = _vsFloor + (1 - _vsFloor) * (_vsN > 1 ? i / (_vsN - 1) : 1);
          const _wv = _v * _w;
          _vsTotal += _wv;
          const _h = _r.high || _r.close, _l = _r.low || _r.close;
          let _frac = 0;
          if (_h > _l) {
            const _ov = Math.min(_h, _vsHi) - Math.max(_l, _vsLo);
            if (_ov > 0) _frac = _ov / (_h - _l);
          } else if (_r.close >= _vsLo && _r.close <= _vsHi) {
            _frac = 1;
          }
          if (_frac > 0) _vsZone += _wv * _frac;
        }
        if (_vsTotal > 0) {
          const _vsRatio = _vsZone / _vsTotal;
          if (_vsRatio >= 0.20) base._volSupport = { ratioPct: Math.round(_vsRatio * 100) };
        }
      }
    }
  } catch (_eVS) { /* 안전 */ }
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

// [S401] 순수 추세강도 점수 — 표시·verdict용 trendScore (RSI/변동성/다이버전스 제외).
//   배경: 기존 trendScore=rawScore(scrComputeScore)에는 (50−RSI) 역추세 항이 섞여 있어
//          강세 추세주(고RSI·정배열·신고가)가 추세방향 점수에서 깎이고 verdict 추세경로도 못 잡혔음.
//   설계: 순수 방향·강도만 — 20일방향(pct) + 기울기(slope) + MA배열 + ADX×방향 + 구조위치(추세추종) + SAR.
//          과매도/과열/변동성/다이버전스는 반등축(scrReadyScore)·안전필터가 담당하므로 여기선 제외.
//   영향: 진입/BT는 rawScore(score) 그대로 사용 → 거동 불변. 이 점수는 trendScore에만 반영(표시·verdict).
function scrTrendPure(ind){
  const parts = [];
  let t = 50;
  const _dir = clamp((ind.trend?.pct ?? 0) * 4.0, -28, 28);   t += _dir;   parts.push({ name:'20일 방향', w: Math.round(_dir) });
  const _slp = clamp((ind.trend?.slope ?? 0) * 18.0, -18, 18); t += _slp;  parts.push({ name:'기울기', w: Math.round(_slp) });
  let _ma = 0;
  if (ind.maAlign?.bullish) _ma = 16;
  else if (ind.maAlign?.bearish) _ma = -16;
  else if (ind.maAlign?.short != null && ind.maAlign?.mid != null && ind.maAlign.short > ind.maAlign.mid) _ma = 6;
  t += _ma; parts.push({ name:'MA배열', w: _ma });
  const adxV = ind.adx?.adx ?? 0, pdi = ind.adx?.pdi, mdi = ind.adx?.mdi;
  const adxStr = clamp((adxV - 20) * 0.7, 0, 20);
  let _adx = 0;
  if (pdi != null && mdi != null) { if (pdi > mdi) _adx = adxStr; else if (mdi > pdi) _adx = -adxStr; }
  t += _adx; parts.push({ name:'ADX', w: Math.round(_adx) });
  const sp = ind.trend?.struct?.pos;
  let _st = 0;
  if (sp != null) _st = clamp((sp - 0.5) * 20, -10, 10);
  t += _st; parts.push({ name:'구조위치', w: Math.round(_st) });
  let _sar = 0;
  if (ind.psar?.trend === 'up') _sar = 4; else if (ind.psar?.trend === 'down') _sar = -4;
  if (_sar) { t += _sar; parts.push({ name:'SAR', w: _sar }); }
  const score = Math.round(clamp(50 + 50 * Math.tanh(((t - 50) / 50) * (SCR_SCORING?.trendTanh ?? 0.80)), 0, 100)); // [S407] trendTanh(0.80): 강세 변별 (rawScore 2421은 tanh 1.15 유지)
  return { score, parts };
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

  // [S358→S360] 골든크로스(MA5×20) — 바닥 다지고 반등이 막 시작된 확인 신호 (전광판 GC와 동일 기준)
  //   [S360] 정배열이 아직 아닐 때만 가점 — 골든크로스는 "전환 시점" 신호라 이미 정배열이면
  //   전환이 끝난 상태(정배열 점수에 이미 반영). 정배열 전 반전 포착에만 순수 의미.
  const _gcR = _maGoldenCross(ind.closes, 5, 20, 5);
  if (_gcR.crossed && !ind.maAlign?.bullish) {
    const _gcRpts = _gcR.barsAgo <= 1 ? 10 : _gcR.barsAgo <= 3 ? 7 : 4;
    s += _gcRpts; notes.push('골든크로스(' + _gcR.barsAgo + '봉 전) 반등 확인');
  }

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
  // [S724] ablation A/B 가드 — globalThis.SX_NO_MACD_ENTRY=true면 이 MACD 재료 블록 전체 스킵.
  //   기본(미설정)=false=v38과 100% 동일. C판정검증 카드 토글로 ON → 풀링 재실행 → 반등경로 IC·경로수익 비교.
  //   S723 측정: 약세풀서 MACD전환(특히 +20 양전환)이 데드캣 반등을 잡아 entry축 IC를 끌어내림(ΔIC +0.18).
  //   ★globalThis 사용(window 아님) — 워커도 importScripts로 이 엔진 로드. 워커 context엔 window 없어 throw 방지. 워커선 미설정→false→정상.
  //   ★닫힌루프(C-IC+경로수익) 통과 확인 후에만 영구삭제 + 워커 mirror(scrEntryScore) 동기화 예정(S712 규율).
  if (!(typeof globalThis !== 'undefined' && globalThis.SX_NO_MACD_ENTRY)) {
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

  // [S524] 위치 컨플루언스 — 반전/거부 캔들이 '의미있는 자리(지지·저항)'에서 나올 때만 결합 가/감점.
  //   배경: 기존엔 지지선 근접(반등신호 scrReadyScore)·반전캔들(위 +10)이 독립 가산이라 둘의 상호작용 미반영.
  //   동일 봉이 지지선에서 반전(아랫꼬리/장악 등) → 다음 양봉 확률↑(가산), 저항선에서 거부(윗꼬리/장악 등) → 반락 위험(감산).
  //   판정: candle.patterns 중 |score|≥7(엔진 reversal 임계와 동일)·dir로 방향. 중복 아님(독립 신호의 '겹침 품질'을 봄). 가중 ±8은 튜닝 포인트.
  const _stStruct = ind.trend?.struct;
  if (_stStruct) {
    const _pats = ind.candle?.patterns || [];
    const _hasBullRev = _pats.some(function(p){ return p.dir > 0 && p.score >= 7; });
    const _hasBearRej = _pats.some(function(p){ return p.dir < 0 && p.score >= 7; });
    if (_stStruct.nearSupport && _hasBullRev) { s += 8; notes.push('지지선+반전캔들 컨플루언스(반등 신뢰↑)'); }
    if (_stStruct.nearResistance && _hasBearRej) { s -= 8; notes.push('저항선+거부캔들 컨플루언스(반락 위험)'); }
  }

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

// ── [S357] MA 골든크로스 감지 헬퍼 ──
// short SMA가 long SMA를 최근 lookback봉 내에 상향돌파했는지 + 몇 봉 전인지
function _maGoldenCross(closes, shortP, longP, lookback) {
  if (!closes || closes.length < longP + lookback + 1) return { crossed: false, barsAgo: null };
  for (let k = 0; k <= lookback; k++) {
    const end = closes.length - k;
    const sNow = sma(closes.slice(0, end), shortP);
    const lNow = sma(closes.slice(0, end), longP);
    const sPrev = sma(closes.slice(0, end - 1), shortP);
    const lPrev = sma(closes.slice(0, end - 1), longP);
    if (sNow != null && lNow != null && sPrev != null && lPrev != null) {
      if (sPrev <= lPrev && sNow > lNow) return { crossed: true, barsAgo: k };
    }
  }
  return { crossed: false, barsAgo: null };
}

// ── [S359] MA 데드크로스 감지 헬퍼 (골든크로스의 대칭, 하향교차) ──
function _maDeadCross(closes, shortP, longP, lookback) {
  if (!closes || closes.length < longP + lookback + 1) return { crossed: false, barsAgo: null };
  for (let k = 0; k <= lookback; k++) {
    const end = closes.length - k;
    const sNow = sma(closes.slice(0, end), shortP);
    const lNow = sma(closes.slice(0, end), longP);
    const sPrev = sma(closes.slice(0, end - 1), shortP);
    const lPrev = sma(closes.slice(0, end - 1), longP);
    if (sNow != null && lNow != null && sPrev != null && lPrev != null) {
      if (sPrev >= lPrev && sNow < lNow) return { crossed: true, barsAgo: k };
    }
  }
  return { crossed: false, barsAgo: null };
}

// ════════════════════════════════════════════════════════════
//  [S357] ④ 추가상승 점수 (Upside Score) — 순추세 추격 관점
//
//  ready/entry/trend가 "바닥에서 반등 잡기(역추세)"에 최적화된 반면,
//  upside는 "이미 상승 중인 종목의 추세 지속 여력(순추세)"을 측정한다.
//  → ready/entry와 해석이 정반대: 과매수를 무조건 감점하지 않고
//    강세 지속의 신호로 본다(단 RSI 80↑ 막판 과열만 감점).
//  → 역배열/저점하락(LL)은 추가상승 자격 박탈(큰 감점).
//
//  구성: ①추세정렬 ②추세강도 ③돌파·구조 ④수급 ⑤모멘텀 지속
// ════════════════════════════════════════════════════════════
function scrUpsideScore(ind) {
  let s = 0;
  const notes = [];
  const price = ind.price;
  const ma = ind.maAlign || {};
  const trend = ind.trend || {};
  const adx = ind.adx || {};
  const closes = ind.closes;

  // ── 자격 게이트: 역배열 / 저점하락 / 데드크로스이면 추가상승 자격 미달 ──
  if (ma.bearish) { s -= 30; notes.push('역배열 — 추가상승 자격 미달'); }
  if (ind.swingStruct?.lowerLows) { s -= 14; notes.push('저점 하락(LL) 구조'); }
  // [S359→S360] 데드크로스(MA5×20 하향) — 추세 하락 전환 조기 경고
  //   [S360] 역배열이 아직 아닐 때만 감점 — 데드크로스는 "전환 시점" 신호라 이미 역배열이면
  //   전환이 끝난 상태(역배열 -30에 이미 반영). 역배열 전 하락 전환 포착에만 순수 의미.
  const _dc = _maDeadCross(closes, 5, 20, 5);
  if (_dc.crossed && !ma.bearish) {
    const _dcPts = _dc.barsAgo <= 1 ? 12 : _dc.barsAgo <= 3 ? 8 : 5;
    s -= _dcPts; notes.push('데드크로스(' + _dc.barsAgo + '봉 전) 하락 전환');
  }

  // ── ① 추세 정렬 (max ~22) ── [S466] 정배열 18→12 (상승장 기본형태라 변별력↓ → 수급으로 이동)
  if (ma.bullish) { s += 12; notes.push('이평선 정배열(5>20>60)'); }
  else if (ma.short != null && ma.mid != null && ma.short > ma.mid) { s += 6; notes.push('단기>중기 상승배열'); }
  if (ma.mid != null && price > ma.mid) { s += 6; notes.push('가격 20일선 위'); }
  if (ma.long != null && price > ma.long) { s += 4; notes.push('가격 60일선 위'); }
  // 골든크로스 (최근 발생일수록 강력) — [S360] 정배열 전(전환 시점)에만 가점, 정배열이면 +12로 이미 반영
  const gc = _maGoldenCross(closes, 5, 20, 5);
  if (gc.crossed && !ma.bullish) {
    const gcPts = gc.barsAgo <= 1 ? 12 : gc.barsAgo <= 3 ? 8 : 5;
    s += gcPts; notes.push('골든크로스(' + gc.barsAgo + '봉 전)');
  }

  // ── ② 추세 강도 (max ~19) ── [S466] ADX 강함 14→11 (추세 클러스터 완화)
  const adxV = adx.adx ?? 0;
  const pdi = adx.pdi, mdi = adx.mdi;
  if (adxV >= 30 && pdi != null && mdi != null && pdi > mdi) { s += 11; notes.push('강한 상승추세(ADX ' + Math.round(adxV) + ')'); }
  else if (adxV >= 25 && pdi != null && mdi != null && pdi > mdi) { s += 10; notes.push('상승추세(ADX ' + Math.round(adxV) + ')'); }
  else if (adxV >= 20 && pdi != null && mdi != null && pdi > mdi) { s += 5; }
  if (adxV >= 25 && pdi != null && mdi != null && mdi > pdi) { s -= 8; notes.push('하락추세 우세(−DI)'); }
  if ((trend.slope ?? 0) > 0) { s += 4; }
  // 20일 추세 — 양수 가점, 단 급등 과열은 감점
  const tpct = trend.pct ?? 0;
  if (tpct > 3 && tpct < 25) { s += 4; notes.push('20일 +' + Math.round(tpct) + '% 상승'); }
  else if (tpct >= 35) { s -= 8; notes.push('20일 +' + Math.round(tpct) + '% 급등 과열'); }

  // ── [S711→S712 revert] 정배열 & ADX 동반 부스터(+5) 철회 ──
  //   닫힌루프 검증 결과: 약세풀 trend경로 추가상승 IC익일 −0.10·경로수익 −1.16%(개선 실패). SXUV 배리어 lift 1.30(짧은 팝)은
  //   C판정검증 연속수익 IC와 다른 잣대 — 약세주는 팝 후 되돌림이라 IC로 안 옮겨감. 또 부스터가 upsideScore≥60 trendPath
  //   게이트(sx_project_c.js)를 넘겨 약세풀 진입을 추가 → 악화 쪽. 사전 기준(미개선 시 revert)대로 +5→0 철회. (재시도 금지: 점수가점 아닌 게이트/랭킹 분리 접근 필요.)

  // ── ③ 돌파 & 구조 (max ~22) ──
  if (ind.swingStruct?.higherHighs) { s += 10; notes.push('고점 갱신(HH) 상승구조'); }
  const st = trend.struct || {};
  if (st.nearResistance && (trend.slope ?? 0) > 0) { s += 8; notes.push('박스 상단/저항 돌파 시도'); }
  else if (st.pos != null && st.pos > 0.7) { s += 4; notes.push('20일 고가권'); }
  if (st.hi != null && price >= st.hi) { s += 6; notes.push('20일 신고가 돌파'); }
  // 볼린저 밴드워킹 (강세장에선 과매수가 아니라 강세)
  const pctB = ind.bb?.pctB ?? 0.5;
  if (closes && closes.length >= 2) {
    const rising = closes[closes.length - 1] > closes[closes.length - 2];
    if (pctB >= 0.8 && pctB <= 1.05 && rising) { s += 6; notes.push('볼린저 상단 밴드워킹(강세)'); }
    else if (pctB > 1.05) { s += 2; }
  }

  // ── ④ 수급 (max ~28) ── [S466] OBV 8→12·돌파거래량 5→8 (추세 연료 확인 비중↑)
  if (ind.obv?.trend === 'up') { s += 12; notes.push('OBV 상승(수급 유입)'); }
  else if (ind.obv?.trend === 'down') { s -= 6; notes.push('OBV 하락(수급 이탈)'); }
  const vMA = ind.volumeMA || {};
  if (vMA.arrangement === 'bullish') { s += 5; notes.push('거래량 정배열'); }
  if (vMA.breakout && closes && closes.length >= 2 && closes[closes.length - 1] > closes[closes.length - 2]) {
    s += 8; notes.push('돌파 거래량 동반');
  }
  if (ind.ad != null && ind.chaikinOsc?.value > 0) { s += 3; }

  // ── ⑤ 모멘텀 지속 (max ~14) ──
  if (ind.macd?.hist > 0 && ind.macd?.line > ind.macd?.sig) { s += 8; notes.push('MACD 양봉+시그널 위'); }
  else if (ind.macd?.hist > 0) { s += 4; }
  else if (ind.macd?.hist < 0) { s -= 6; notes.push('MACD 음봉(모멘텀 약화)'); }
  // RSI: 건강 상승구간 환영, 막판 과열만 감점 (ready/entry와 정반대 해석)
  const rsi = ind.rsi?.val ?? 50;
  if (rsi >= 50 && rsi < 70) { s += 6; notes.push('RSI 건강 상승구간(' + Math.round(rsi) + ')'); }
  else if (rsi >= 70 && rsi < 80) { s += 3; notes.push('RSI 강세 지속(' + Math.round(rsi) + ')'); }
  else if (rsi >= 80) { s -= 8; notes.push('RSI 막판 과열(' + Math.round(rsi) + ')'); }
  else if (rsi < 40) { s -= 6; notes.push('RSI 약세(추가상승 동력 부족)'); }
  if (ind.trix && ind.trix.signal != null && ind.trix.value > ind.trix.signal) { s += 2; }

  // 정규화 (0~100) — [S357-fix] 상단 변별력 확보
  //   추세추종 점수는 강세 종목에서 가점이 누적돼 s>50으로 쉽게 포화된다.
  //   기존 raw=clamp(s+50,0,100) 방식은 s>50을 전부 동일 점수로 압축 → 추이바가 평평(92 고정)해짐.
  //   raw clamp를 제거하고 s를 직접 tanh 정규화하여 상단 구간에서도 봉별 변화를 보존한다.
  const raw = clamp(s + 50, 0, 100); // 하위호환(_breakdown/디버그 참고용)
  const score = Math.round(clamp(50 + 50 * Math.tanh((s / 45) * (SCR_SCORING?.upsideTanh ?? 0.80)), 0, 100)); // [S408] upsideTanh(0.80): 추가상승 강세 변별 (trendPure와 동일 기준)

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

// ════════════════════════════════════════════════════════════
//  악재 해제 패턴 매핑 (S-resolve)
//  같은 종목에서 악재 키워드 매칭 후, 더 최신 공시에 해제 패턴이 있으면 매칭 무효화
//  목적: "예전엔 악재 → 지금은 정상화" 종목이 잘못 제외되는 것 방지
// ════════════════════════════════════════════════════════════
const DISCLOSURE_RESOLVE_PATTERNS = {
  // 경영위기 ─ 명확한 해제 절차가 있는 항목들
  '관리종목': ['관리종목 지정 해제', '관리종목지정해제', '관리종목 해제'],
  '거래정지': ['거래재개', '매매거래재개', '거래정지 해제', '거래정지해제'],
  '회생절차': ['회생절차 종결', '회생절차종결', '회생종결', '회생절차 폐지'],
  '회생개시': ['회생절차 종결', '회생절차종결', '회생종결'],
  '워크아웃': ['워크아웃 종료', '워크아웃 졸업', '워크아웃졸업', '경영정상화 약정 종료'],
  '정리매매': ['정리매매 종료', '정리매매종료'],
  '상장적격성': ['상장적격성 실질심사 해제', '상장적격성 적격', '상장유지결정'],

  // 재무위험 ─ 회복 공시
  '자본잠식': ['자본잠식 해소', '자본잠식해소', '자본확충 완료'],
  '자본전액잠식': ['자본잠식 해소', '자본잠식해소', '자본확충 완료'],
  '감사의견거절': ['감사의견 적정', '재감사 적정'],
  '부적정의견': ['감사의견 적정', '재감사 적정'],
  '의견거절': ['감사의견 적정', '재감사 적정'],

  // 시장경고 ─ 해제 공시
  '불성실공시': ['불성실공시법인 지정 해제', '불성실공시 해제'],
  '투자주의': ['투자주의 해제', '투자주의종목 해제'],
  '투자경고': ['투자경고 해제', '투자경고종목 해제'],
  '투자위험': ['투자위험 해제', '투자위험종목 해제'],

  // [참고] 해제 매핑 제외 항목:
  //   - 상장폐지/파산/청산: 해제 없음 (영구 사유)
  //   - 감자/유상증자/전환사채/신주인수권: 일회성 이벤트 (해제 개념 없음)
  //   - 횡령/배임/소송/분식/조회공시: 사법/판단 영역 — 해제 표현이 매우 다양 (무죄/기각/기소취하 등) → 자동 매칭 어려움
};

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
  // [resolve] 해제 키워드를 먼저 빠르게 검색할 수 있도록 정규화된 공시 제목 미리 준비
  //   _nm: 공백 제거된 제목, _dt: 접수일자 (YYYYMMDD 또는 미상)
  //   _isResolveDoc: 이 공시 제목 자체가 어떤 해제 패턴을 포함하는지 (해제 공시 자체는 악재 매칭에서 제외)
  const allResolvePatterns = new Set();
  for (const patterns of Object.values(DISCLOSURE_RESOLVE_PATTERNS)) {
    for (const p of patterns) allResolvePatterns.add(p.replace(/\s/g, ''));
  }
  const normalizedDisc = disclosures.map(d => {
    const nm = (d.report_nm || '').replace(/\s/g, '');
    let isResolveDoc = false;
    for (const rp of allResolvePatterns) {
      if (nm.includes(rp)) { isResolveDoc = true; break; }
    }
    return { _nm: nm, _dt: d.rcept_dt || '', _isResolveDoc: isResolveDoc, raw: d };
  });

  // 1차 매칭: 해제 공시는 원본 악재 매칭에서 제외 (POSITIVE는 별도 — 해제 공시일 수 없음)
  for (const nd of normalizedDisc) {
    for (const {keyword, grade} of allKw) {
      // 해제 공시는 악재(CRITICAL/SEVERE/WARNING) 매칭에서 제외
      // 예: "관리종목 지정 해제" 공시가 "관리종목" 키워드에 매칭되는 것 방지
      if (nd._isResolveDoc && grade !== 'POSITIVE') continue;
      if (nd._nm.includes(keyword)) {
        matched.push({keyword, grade, report_nm: nd.raw.report_nm, rcept_dt: nd._dt, dart_url: nd.raw.dart_url});
      }
    }
  }

  // 2차 처리: 같은 키워드 여러 매칭 중 가장 최신만 남기고, 해제 공시가 더 최신이면 무효화
  //   같은 키워드가 여러 번 등장하면 가장 최신 1건만 남김 (재발 케이스 처리에 중요)
  const latestByKeyword = new Map();
  for (const m of matched) {
    if (m.grade === 'POSITIVE') continue; // POSITIVE는 중복 제거 안 함 (가산점 누적)
    const prev = latestByKeyword.get(m.keyword);
    if (!prev || (m.rcept_dt && m.rcept_dt > prev.rcept_dt)) {
      latestByKeyword.set(m.keyword, m);
    }
  }

  const filtered = [];
  // POSITIVE는 그대로 유지
  for (const m of matched) {
    if (m.grade === 'POSITIVE') filtered.push(m);
  }
  // 악재는 키워드별 최신 1건만 검사
  for (const m of latestByKeyword.values()) {
    const resolvePatterns = DISCLOSURE_RESOLVE_PATTERNS[m.keyword];
    if (!resolvePatterns) { filtered.push(m); continue; } // 해제 매핑 없으면 유지

    // 같은 키워드의 가장 최신 매칭 이후에 해제 패턴이 등장하면 무효화
    const isResolved = normalizedDisc.some(nd => {
      if (!nd._dt || !m.rcept_dt) return false;
      if (nd._dt <= m.rcept_dt) return false; // 시간 순서 검증
      return resolvePatterns.some(rp => nd._nm.includes(rp.replace(/\s/g, '')));
    });
    if (!isResolved) filtered.push(m);
  }

  return filtered;
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
  return { hard: 10.0, softTh: 5.0, bonus: 10 }; // [S458] 일봉: 극단 7→10%(진짜 극단만 하드컷), 과다 bonus 5→10(고변동 시 rawScore≥buyTh+10 요구). 단기/주월은 종전 유지.
}

// ════════════════════════════════════════════════════════════
//  quickScore — 종합 판정 (BUY/SELL/HOLD + 안전필터)
// ════════════════════════════════════════════════════════════
function scrQuickScore(rows, tf, market) {
  // [PATCH-3] rows null/undefined/비배열 방어 — 호출부에서 잘못된 인자가 올 경우 크래시 방지
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return {
      score: 50, action: 'HOLD', reasons: ['no_data'],
      ind: null, _breakdown: null,
      readyScore: 0, readyNotes: [], entryScore: 0, entryNotes: [],
      upsideScore: 0, upsideNotes: [],
      trendScore: 0, rsiDiv: null, obvDiv: null, pullback: null,
      candle: null, squeeze: false, maAlignBull: false,
      _noData: true,
    };
  }
  const ind = calcAllScreener(rows, tf);
  const volSoft = ATR.soften(ind.atr.pct, null, null);  // [S254] 캐시 제거 (종목 간 누수 차단)
  const ctx = ind.context || ContextEngine.analyze(ind);
  const { rawScore, mom, osc, _breakdown } = scrComputeScore(ind, volSoft, ctx.bonus);

  // S80: 3단 점수 — ①준비 ②진입 ③추세(rawScore)
  const _ready = scrReadyScore(ind);
  const _entry = scrEntryScore(ind);
  const _upside = scrUpsideScore(ind); // [S357] ④ 추가상승 (순추세 추격)

  // S71→S152: 레짐 적응형 임계값 (실시간 보정 복구)
  //   [S125 당시 판단] 매트릭스 슬롯이 "레짐 반영된 값"이라 이중 보정으로 오판 → 실시간 보정 제거.
  //   [S152 재검증] 옵티마이저 ON 라운드는 BT 내부에서 봉별 레짐 보정을 가산하며 base를 탐색함.
  //     즉 슬롯 저장값은 "보정 전제의 기저값(base)"이지 "보정 완료값"이 아님.
  //     → 실시간에서 보정을 빼면 옵티마이저 전제와 미스매치(탈보정). 대칭성 회복 위해 복구.
  //   [범위] 레짐 ON일 때만. OFF는 보정 없음(종전대로).
  const th = _getEffectiveTh(tf);
  let buyTh = th.buyTh, sellTh = th.sellTh;
    // [S1092] 레짐 봉별 임계값 가산 철거 (측정 S1091 미달)
  let action = rawScore >= buyTh ? 'BUY' : rawScore <= sellTh ? 'SELL' : 'HOLD';
  if (action === 'BUY' && !_scrMomOscPass(mom, osc, tf)) action = 'HOLD';
  const reasons = [];

  // S67: 안전필터 (플래그 기반 ON/OFF — SXE._safetyFlags)
  // [S264] 폴백 기본값 10개 전수 ON. foreignSell은 평가식의 `ind._foreignConsecSell != null` 가드가 KIS 미연결 자동 통과 처리.
  const _sf = SXE._safetyFlags || {threshold:true,volExtreme:true,volHigh:true,rsiDiv:true,macdNeg:true,bbUpper:true,resistNear:true,fakeBreakout:true,volResist:true,chaseGuard:true,dumpWarn:true,supportBreak:true,debtRatio:true,foreignSell:true,highBeta:true,riskSignature:false};
  // [S1016] A그룹(stochRsi/ma60resist/deadCrossGuard) 안전필터 철거 — S1013 최종심(조건부 crashLift 음수 3표본). 측정 조건은 _riskCondsAt에 보존.
  // [S454] 되돌림주의(dumpWarn) 안전필터 — 천정·투매 위험 = 정지(추격금지보다 강한 단계). 강등·_safetyViol 공용 1회 계산.
  let _dumpW = null;
  if (_sf.dumpWarn && typeof SXE.calcDumpWarn === 'function') {
    try {
      const _lc = rows[rows.length - 1], _pc = rows[rows.length - 2];
      const _chgDW = (_pc && _pc.close) ? ((_lc.close / _pc.close) - 1) * 100 : 0;
      _dumpW = SXE.calcDumpWarn(rows, ind, _chgDW, market);
    } catch (_eDW) { _dumpW = null; }
  }
  // [S658] kNN 음봉전이 경고 — 캔들전이 자기유사도 kNN이 강하게 음봉전이 예측(점수≤-30)이면 위험 신호로 추가.
  //   실험적 ML 신호(검증 정확도 보장 안 됨)라 기본 OFF. dumpWarn과 동일 패턴(1회 계산해 reasons/_safetyViol 공용).
  let _knnBear = false;
  if (_sf.knnBearish && typeof SXKNN !== 'undefined' && SXKNN.score) {
    try {
      const _kn2 = SXKNN.score(rows, { win: 16, k: 10 });
      if (_kn2 && _kn2.active && typeof _kn2.score === 'number' && _kn2.score <= -30) _knnBear = true;
    } catch (_eKn2) { _knnBear = false; }
  }
  if (_sf.threshold && action === 'BUY' && rawScore < buyTh + 2) { reasons.push('🔒임계값'); action = 'HOLD'; }
  { const vf = _scrVolFilter(volSoft, tf);
    if (_sf.volExtreme && volSoft >= vf.hard) { reasons.push('🔒변동성극단'); action = 'HOLD'; }
    else if (_sf.volHigh && volSoft >= vf.softTh && action === 'BUY' && rawScore < buyTh + vf.bonus) { reasons.push('🔒변동성과다'); action = 'HOLD'; }
  }
  if (_sf.rsiDiv && action === 'BUY' && ind.rsi.div === 'bearish') { reasons.push('🔒RSI다이버전스'); action = 'HOLD'; }
  if (_sf.macdNeg && action === 'BUY' && ind.macd.hist < 0) {
    const h = ind.macd.arr.hist; if (h.length >= 5 && h.slice(-5).every(v => v < 0)) { reasons.push('🔒MACD음전'); action = 'HOLD'; }
  }
  // [S426] 신규 안전필터 — BB 상단 이탈(과열) / 저항(피벗 R1) 근접
  if (_sf.bbUpper && action === 'BUY' && ind.bb && ind.bb.upper != null && ind.price >= ind.bb.upper) { reasons.push('🔒BB상단이탈'); action = 'HOLD'; }
  if (_sf.resistNear && action === 'BUY' && ind.pivot && ind.pivot.R1 != null && ind.price < ind.pivot.R1) {
    const _dR1 = ((ind.pivot.R1 - ind.price) / ind.price) * 100; // R1 돌파 시(price>=R1)는 강세 → 제외
    if (_dR1 <= 1.5) { reasons.push('🔒저항근접'); action = 'HOLD'; }
  }
  // [S433] 가짜 저항(이평선) 돌파 — 막 돌파했으나 OBV/거래량 미확인 = 거짓 신호
  if (_sf.fakeBreakout && action === 'BUY' && ind._fakeBreak) { reasons.push('🔒가짜돌파MA' + ind._fakeBreak.ma); action = 'HOLD'; }
  // [S436] 매물대 저항 — 머리 위 +1~8%에 매물 집중 = 상승 저항 부담
  if (_sf.volResist && action === 'BUY' && ind._volResist) { reasons.push('🔒매물대저항'); action = 'HOLD'; }
  // [S453] 추격금지 — 과열(MA20 이격도 +20%↑). 너무 멀리 올라 추격매수 위험 = 일시정지(되돌림주의보다 약한 단계)
  if (_sf.chaseGuard && action === 'BUY' && ind.maDisparity && ind.maDisparity.disparity20 != null && ind.maDisparity.disparity20 >= 20) { reasons.push('🔒추격금지'); action = 'HOLD'; }
  // [S454] 되돌림주의 — 천정/투매 위험(정지)
  if (_sf.dumpWarn && action === 'BUY' && _dumpW && _dumpW.on) { reasons.push('🔒되돌림주의'); action = 'HOLD'; }
  // [S658] kNN 음봉전이 — 자기유사도 패턴이 강하게 음봉전이 예측
  if (_sf.knnBearish && action === 'BUY' && _knnBear) { reasons.push('🔒kNN음봉전이'); action = 'HOLD'; }
  // [S1008] ⚠️ 위험 시그니처 (시장별·sx_risk_core SSOT) — tier1(주력)만 차단. 근거: S1001~03 3시장×3중검증.
  //   tier2=평균lift 양수(대박 동반)라 차단 안 함(분석탭 배지 표시 전용). 일봉 전용(통계=일봉 측정). 코어 미로드=fail-open.
  if (_sf.riskSignature && action === 'BUY' && tf === 'day' && typeof SXRiskCore !== 'undefined' && Array.isArray(rows) && rows.length >= 30) {
    try {
      const _rsT1 = (SXRiskCore.evalRiskAt(_getCurrentMarketKey(), ind, rows, rows.length - 1) || []).find(s => s.tier === 1);
      if (_rsT1) { reasons.push('🔒위험시그니처'); action = 'HOLD'; }
    } catch(_eRS) {}
  }
  // [S469] 지지선 이탈 — 종가가 MA20 또는 MA60을 위→아래로 최근 3봉 내 하향 이탈(_maDeadCross에 short=1=종가 적용) = 지지 붕괴 (진입 보류). lookback=2.
  if (_sf.supportBreak && action === 'BUY' && typeof _maDeadCross === 'function' && (_maDeadCross(ind.closes, 1, 20, 2).crossed || _maDeadCross(ind.closes, 1, 60, 2).crossed)) { reasons.push('🔒지지선이탈'); action = 'HOLD'; }
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

  // [S361→S362] 위반 전수 수집 — reasons/action 로직과 독립(action 무관, 켠 16종 전부 누적). C 캡 + [S459] 조건검색 _safety_clean 카운트 소스.
  //   [S427] _wasBuySafety(action==='BUY') 게이트 제거. A엔진 action은 rawScore≥buyTh 기준이나
  //   C의 '매수' 판정은 4축 passCount 기준(upsideScore/trendScore/maAlignBull 등)이라 불일치 →
  //   4축 통과(C=매수)인데 rawScore가 buyTh 미달인 종목(예: 추세·추가상승만 높은 급등주)이
  //   위반 수집에서 통째로 누락돼 캡이 안 걸렸음. 무조건 수집해도 C 비보유 캡은 강등 방향
  //   (_capIdx > _curIdx)만 작동하므로 약한 종목(이미 관망/회피)엔 무영향.
  const _safetyViol = [];
  {
    if (_sf.threshold && rawScore < buyTh + 2) _safetyViol.push('🔒임계값');
    { const _vf2 = _scrVolFilter(volSoft, tf);
      if (_sf.volExtreme && volSoft >= _vf2.hard) _safetyViol.push('🔒변동성극단');
      else if (_sf.volHigh && volSoft >= _vf2.softTh && rawScore < buyTh + _vf2.bonus) _safetyViol.push('🔒변동성과다');
    }
    if (_sf.rsiDiv && ind.rsi.div === 'bearish') _safetyViol.push('🔒RSI다이버전스');
    if (_sf.macdNeg && ind.macd.hist < 0) { const _h5 = ind.macd.arr.hist; if (_h5.length >= 5 && _h5.slice(-5).every(v => v < 0)) _safetyViol.push('🔒MACD음전'); }
    if (_sf.bbUpper && ind.bb && ind.bb.upper != null && ind.price >= ind.bb.upper) _safetyViol.push('🔒BB상단이탈');
    if (_sf.resistNear && ind.pivot && ind.pivot.R1 != null && ind.price < ind.pivot.R1 && ((ind.pivot.R1 - ind.price) / ind.price) * 100 <= 1.5) _safetyViol.push('🔒저항근접');
    if (_sf.fakeBreakout && ind._fakeBreak) _safetyViol.push('🔒가짜돌파MA' + ind._fakeBreak.ma);
    if (_sf.volResist && ind._volResist) _safetyViol.push('🔒매물대저항');
    if (_sf.chaseGuard && ind.maDisparity && ind.maDisparity.disparity20 != null && ind.maDisparity.disparity20 >= 20) _safetyViol.push('🔒추격금지'); // [S453]
    if (_sf.dumpWarn && _dumpW && _dumpW.on) _safetyViol.push('🔒되돌림주의'); // [S454]
    if (_sf.knnBearish && _knnBear) _safetyViol.push('🔒kNN음봉전이'); // [S658]
    if (_sf.riskSignature && tf === 'day' && typeof SXRiskCore !== 'undefined' && Array.isArray(rows) && rows.length >= 30) { try { const _rsV = (SXRiskCore.evalRiskAt(_getCurrentMarketKey(), ind, rows, rows.length - 1) || []).find(s => s.tier === 1); if (_rsV) _safetyViol.push('🔒위험시그니처'); } catch(_eV) {} }   // [S1008]
    if (_sf.supportBreak && typeof _maDeadCross === 'function' && (_maDeadCross(ind.closes, 1, 20, 2).crossed || _maDeadCross(ind.closes, 1, 60, 2).crossed)) _safetyViol.push('🔒지지선이탈'); // [S469]
    if (_sf.debtRatio && ind._debtRatio != null && ind._debtRatio >= 200) _safetyViol.push('🔒부채비율');
    if (_sf.foreignSell && ind._foreignConsecSell != null && ind._foreignConsecSell >= 3) _safetyViol.push('🔒외국인매도');
    if (_sf.highBeta && ind._beta != null && ind._beta > 1.5) _safetyViol.push('🔒고베타');
    if (ind.candle.strongest) { const _cnv = ind.candle.strongest.name || ''; if (_cnv.includes('이브닝') || _cnv.includes('슈팅')) _safetyViol.push('🔒' + _cnv); }
  }

  // [S1006] S165 분석 게이트 철거 — 안전필터로 일원화

  const _tpRes = scrTrendPure(ind); // [S402] {score, parts} — 점수와 구성요소 분해 분리

  // [S584] 신규상장 판정 — "일봉 50봉(≈상장 2.5개월)" 기준을 TF별 봉수로 환산해 달력상 동일 구간 유지.
  //   취지: 신규상장은 종목 고유 속성(상장시점)이라 모든 TF에서 동일 판정돼야 함. 일봉<50이면 주봉<10·월봉<3도
  //   동시에 성립 → "일봉 기준 신규면 전 TF 표시, 아니면 전 TF 비표시"가 자동 충족. (월봉 4년 종목 오표기 방지)
  //   분봉(5m~240m): 봉수로 상장연령 판별 불가(데이터창 고정) + 다이버 게이트도 안 걸림 → 미적용.
  const _newListingTh = { day: 50, week: 10, month: 3 };
  const _isNewListing = (_newListingTh[tf] != null) && (rows.length < _newListingTh[tf]);
  // [S584] 이력부족 — 신규상장은 아니나 현 TF 봉수<50 → 다이버전스(RSI/OBV) 게이트(n<50) 발동 구간.
  //   예: 상장 3년 종목의 월봉(~36봉). 신규상장과 상호배타 → 게이트 발동 시 둘 중 정확히 하나만 표시(공백 자기설명).
  const _isLowHistory = !_isNewListing && (rows.length < 50);

  return {
    score: rawScore, action, reasons, ind, _breakdown,
    _safetyViol, // [S426] C 캡 전용 안전필터 위반 전수 목록 (🔒...)
    // S80: 3단 점수
    readyScore: _ready.score, readyNotes: _ready.notes,
    entryScore: _entry.score, entryNotes: _entry.notes,
    upsideScore: _upside.score, upsideNotes: _upside.notes, // [S357] ④ 추가상승
    trendScore: _tpRes.score, trendBreakdown: _tpRes.parts, // [S401/402] 순수 추세강도 + 분해 (진입/BT는 score=rawScore 그대로)
    rsiDiv: ind.rsi.div, obvDiv: ind.obv.div,
    pullback: ind.pullback, candle: ind.candle,
    squeeze: ind.squeeze?.squeeze || false,
    maAlignBull: ind.maAlign.bullish,
    ltAlign: _ltAlignStr(ind.maAlignLT), // [S509] 장기 정배열 게이트: 'bull'|'bear'|'mixed'|'off'
    aTimingOn: rawScore >= buyTh + SCR_TIMING_GATE_MARGIN, // [S512→S514] A 강발화: rawScore가 buyTh+α(여유분) 돌파 시만 — C 매수 타이밍 게이트
    maAlignBear: ind.maAlign.bearish,
    above60: ind.maAlign.ma60 != null && ind.price > ind.maAlign.ma60,
    volRatio: ind.volPattern.volRatio,
    volBull: ind.volPattern.bullish,
    pbScore: ind.pullback ? ind.pullback.score : 0,
    regime: ind.regime,
    _adaptedTh: { buyTh, sellTh }, // S71: 실제 적용된 임계값
    macdCrossUp: ind.macd.arr.hist.length >= 2 && ind.macd.hist > 0 && ind.macd.arr.hist[ind.macd.arr.hist.length - 2] <= 0,
    macdCrossDown: ind.macd.arr.hist.length >= 2 && ind.macd.hist < 0 && ind.macd.arr.hist[ind.macd.arr.hist.length - 2] >= 0,
    rsiVal: ind.rsi.val,
    stochK: ind.stoch.k,
    barCount: rows.length, // [S584] 정보용 봉수
    isNewListing: _isNewListing, // [S584] 신규상장 배지 판정 (TF별 환산, 일봉 기준 일관)
    isLowHistory: _isLowHistory, // [S584] 이력부족 배지 판정 (현 TF 봉수<50, 신규상장과 상호배타)
  };
}

// ════════════════════════════════════════════════════════════
//  스마트필터 — 배지 판정
// ════════════════════════════════════════════════════════════
function scrSmartFilterCheck(scanResult) {
  const tags = [];
  // [S584] 신규상장 / 이력부족 — 봉수 부족(다이버 게이트 발동) 구간을 자기설명. 상호배타, dir:0(필터점수 중립).
  //   신규상장: 일봉 기준 환산(전 TF 일관). 이력부족: 신규는 아니나 현 TF 봉수<50.
  //   결과탭 + 분석탭 상세뷰 양쪽에서 같은 함수를 쓰므로 자동으로 두 화면 다 노출.
  if (scanResult.isNewListing) {
    tags.push({ id: 'newListing', label: '신규상장', color: '#94a3b8', dir: 0 });
  } else if (scanResult.isLowHistory) {
    tags.push({ id: 'lowHistory', label: '이력부족', color: '#e8365a', cls: 'neg', dir: 0 });
  }
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
  // [FUTURE-6] candles/highs/lows 반환부도 보정된 rows로 일원화
  //   영향: Worker의 checkTechConditions에서 lower_shadow_pct/upper_shadow_pct 등이
  //         ind.candles를 직접 참조해 그림자 비율을 계산하는데, 원본 사용 시 OHLC
  //         오염 데이터로 잘못된 비율이 나올 수 있었음 → sanitize된 rows로 통일.
  //   주의: 차트 표시(sx_chart.js)는 원본 candles를 별도로 받음 → 영향 없음.
  const sanRows = SXE.sanitizeRows(rows);

  return {
    last: ind.price,
    closes: ind.closes,
    ema20: ema(ind.closes, 20),    // [S387] EMA20×EMA120 골든/데드크로스 판정용 (장기 추세 전환)
    ema120: ema(ind.closes, 120),
    highs: sanRows.map(r => r.high),
    lows: sanRows.map(r => r.low),
    volumes: sanRows.map(r => r.volume),
    candles: sanRows,
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
  // [S347] 코인 4시간봉(240m) 라벨 추가 — 누락 시 "일봉"으로 오표시되던 문제 (ATR 근거 텍스트)
  const tfLabel = {'5m':'5분봉','15m':'15분봉','30m':'30분봉','60m':'1시간봉','240m':'4시간봉','day':'일봉','week':'주봉','month':'월봉'}[tf]||'일봉';
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
      // [S357] upsideScore 추가 (추가상승 추이/모멘텀용)
      history.push({ bar: -i, score: qs.readyScore ?? qs.score, trendScore: qs.trendScore ?? qs.score, entryScore: qs.entryScore ?? 0, readyScore: qs.readyScore ?? 0, upsideScore: qs.upsideScore ?? 0 });
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
  // [S357] 추가상승(upside) 변화량
  const curUpside = history[0].upsideScore ?? 0;
  const upsideAvg = recentSlice.length > 0 ? Math.round(recentSlice.reduce((s, h) => s + (h.upsideScore ?? 0), 0) / recentSlice.length) : curUpside;
  const upsideDelta = curUpside - upsideAvg;
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
    upsideDelta, // [S357] 추가상승 3봉 평균 대비
    direction, // 'up'|'down'|'flat'
    avg,     // N봉 평균 점수
    cross,   // 'golden'|'dead'|null (50점 크로스)
    lookback: history.length,
    _normV: 8, // [S357~S360] 점수 계산 버전 (정규화·점수로직 변경 시 +1 → 구버전 캐시 자동 재계산). v5=[S360] 크로스 전환조건 / v6=[S401] trendScore=trendPure / v7=[S407] trendTanh 0.80 / v8=[S408] upsideTanh 0.80
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
// [S431] 되돌림주의(dumpWarn) 산출 — 분석탭(sx_render _computeBoardInputs)·조건검색 스캔(sx_scan_worker) 단일소스.
//   원본: sx_render.js [S400]+[S419] 인라인(투매 + 천정 되돌림 흡수)을 1:1 추출. 헤더 ⚠️되돌림주의 배지와 동일 판정.
//   vola.v/bb.v는 분석탭 _computeBoardInputs와 동일 공식으로 내부 재계산(volaMax: 코인9/그외7, bb.v=pctB×100).
//   인자: candles(분석탭 _lastAnalCandles / 스캔 adv.candles) · ind(지표) · changeRate · market(coin 판정용).
//   반환: { on, reasons, tvScore } — tvScore는 전광판 '대금전이' 항목 복원용(캔들<13 또는 무효 시 null).
// [S437] RS(상대강도) — 종목 vs 시장지수 수익률 차(%p). 양수=시장 아웃퍼폼(상대 강세).
//   stockCloses/indexCloses: 각각 종가 배열(최근 봉이 끝). rs20/rs60 = (종목 N일 수익률) − (지수 N일 수익률).
//   RSI(과매수·과매도)와 무관 — 시장 대비 상대 비교. 분석탭에서 지수 시계열 주입 후 호출.
SXE.calcRS = function(stockCloses, indexCloses){
  const out = { rs20: null, rs60: null };
  if(!Array.isArray(stockCloses) || !Array.isArray(indexCloses)) return out;
  // [S449] back 파라미터로 일반화 — back=0 오늘, back=1 어제. 전광판 도넛 전이(어제→오늘)용.
  const _retAt = (arr, n, back) => {
    const idx = arr.length - 1 - back;
    if(idx - n < 0) return null;
    const cur = arr[idx], past = arr[idx - n];
    return (past > 0 && cur > 0) ? (cur / past - 1) * 100 : null;
  };
  const _diffAt = (n, back) => {
    const s = _retAt(stockCloses, n, back), i = _retAt(indexCloses, n, back);
    return (s != null && i != null) ? Math.round((s - i) * 10) / 10 : null;
  };
  out.rs20 = _diffAt(20, 0);
  out.rs20Prev = _diffAt(20, 1);  // [S449] 어제 rs20 — 도넛 전이용
  out.rs60 = _diffAt(60, 0);
  return out;
};

SXE.calcDumpWarn = function(candles, ind, changeRate, market){
  const out = { on:false, reasons:[], tvScore:null };
  // [S400] 거래대금 전이 — 최근 3봉 평균 ÷ 이전 10봉 평균 → log2 스케일 0~100. 투매=대금급증(≥65)+가격하락+OBV이탈.
  try {
    const _cdls = candles || [];
    if(_cdls.length >= 13){
      const _ta = _cdls.map(c => (c.close||0) * (c.volume||0));
      const _r3 = _ta.slice(-3), _p10 = _ta.slice(-13, -3);
      const _avgR = _r3.reduce((a,b)=>a+b,0) / _r3.length;
      const _avgP = _p10.reduce((a,b)=>a+b,0) / _p10.length;
      if(_avgP > 0){
        const _ratio = _avgR / _avgP;
        const _tvScore = Math.max(0, Math.min(100, Math.round(50 + Math.log2(_ratio) * 25)));
        out.tvScore = _tvScore;
        const _obvDown = ind && ind.obv && ind.obv.trend === 'down';
        const _priceDown = (changeRate || 0) < 0;
        if(_tvScore >= 65 && _priceDown && _obvDown){
          out.on = true;
          out.reasons = [{t:'dump', l:`투매: 대금급증(${_tvScore})+가격하락+OBV이탈`}];
        }
      }
    }
  } catch(_eTV){ /* 대금전이 실패 시 항목 없이 진행 (안전) */ }
  // [S419] 천정 되돌림 강한 위험 신호 → 되돌림주의로 흡수. indicators 직접(캔들 무관).
  try {
    const _rr = out.reasons.length ? out.reasons : [];
    if(ind && ind.rsi && ind.rsi.div === 'bearish') _rr.push({t:'rsiDiv', l:'RSI 약세 다이버전스: 가격↑ RSI↓ (상승 동력 소진)'});
    if(ind && ind.obv && ind.obv.div === 'bearish') _rr.push({t:'obvDiv', l:'OBV 약세 다이버전스: 가격↑ 수급↓ (자금 이탈)'});
    // vola.v(ATR%) / bb.v(%B) — _computeBoardInputs와 동일 공식. 코인 volaMax=9, 그 외 7.
    let _vv = null, _bv = null;
    if(ind && ind.atr && ind.atr.ratio > 0){
      const _isCoin = (market === 'COIN' || market === 'coin');
      const _volaMax = _isCoin ? 9 : 7;
      _vv = Math.max(0, Math.min(100, Math.round((ind.atr.ratio - 1) / (_volaMax - 1) * 100)));
    }
    if(ind && ind.bb && ind.bb.pctB != null){
      _bv = Math.max(0, Math.min(100, Math.round(ind.bb.pctB * 100)));
    }
    if(_vv!=null && _vv>=70 && _bv!=null && _bv>=100) _rr.push({t:'overheat', l:'과열 급등: 고변동성(ATR↑)+볼린저 상단 이탈 (추격 위험)'});
    if(_rr.length){ out.on = true; out.reasons = _rr; }
  } catch(_eRisk){}
  return out;
};
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
// S125 → S211: 시장×레짐 매트릭스 API export (sx_optimizer.js / sx_screener.html에서 사용)
SXE._getSlotParams = _getSlotParams;
SXE._saveSlotParams = _saveSlotParams;
// [S176] 슬롯 리셋 함수들
SXE._resetSlotToDefault = _resetSlotToDefault;
SXE._resetAllSlotsToDefault = _resetAllSlotsToDefault;
SXE._hasSlotOverride = _hasSlotOverride;
SXE._countMarketSlots = _countMarketSlots;
SXE._getCurrentMode = _getCurrentMode;            // 하위호환 (시장 키 반환)
SXE._getCurrentMarketKey = _getCurrentMarketKey;  // S211 신규
SXE._getMarketDefaults = _getMarketDefaults; // [S1092] 레짐 축 없는 시장 기본값
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



// [S1090] BT 안전필터 적용 토글 철거 — S1021이 소비자 _checkSafetyFilters를 "완전 死"로 철거하면서
//   토글만 존치됐고, 설정탭엔 "권장"으로 노출돼 있었다. 켜도 아무 일도 안 일어나므로 삭제.

// [S1090] BT 약세 데드캣 게이트 철거 — _btBearGate 소비처 0(토글·스토리지·UI싱크만 존재).
//   "측정용·ON/OFF로 BT 비교 후 커밋"이라 적혀 있었으나 켜도 차이가 0으로 나와 오판을 부른다.

// ════════════════════════════════════════════════════════════
//  S210: 조기청산 (Early Exit) — 단일 스위치 + 4개 세부 룰
// ════════════════════════════════════════════════════════════
//  배경: 기존 BT는 TP/SL 도달 시에만 청산 → 진입 후 살짝 올랐다 본전 반환되는
//        케이스가 무한 보유로 흘러 실전과 괴리. 우리금융지주(216140)에서 발견.
//
//  설계: 분석엔진의 sellTh / 가격 액션 기반 청산을 BT 루프에 추가.
//        모든 BT 호출 경로(단일/교차/워크포워드/실시간 신호/옵티마이저)가
//        SXE._btEarlyExit 플래그 하나를 거치므로 미스매치 원천 차단.
//
//  세부 룰 (각각 독립 토글):
//    · score:     rawScore <= sellTh   → 분석엔진 매도 신호 동기화
//    · trailing:  진입 후 피크 대비 N×ATR 하락 → 트레일링 스톱
//    · breakeven: 한 번이라도 +N×ATR 도달 시 SL을 entry로 끌어올림
//    · time:      maxBars 봉 보유했는데 수익률 미달 → 시간 청산
//
//  기본값 OFF — 켰을 때만 청산 룰 가산. 옵티마이저 결과 호환성 유지.
//  ON 시에는 옵티마이저 재실행 권장 (탐색 공간이 바뀜).
// ════════════════════════════════════════════════════════════

SXE._btEarlyExit = { enabled: false };   // [S1022] 조기청산/3모드 폐기 — 레시피-BT 고정청산(이중ATR+MA데드). inert 스텁(render 읽기 안전용).

// [S1090] 변동성 타깃팅 철거 — S1017 SSOT 통합(sxRunBtEngine→EC.runLifecycle)으로 posScale 훅이 끊겼다.
//   _volTargetCalcPosScale 호출처 0 · BT는 posScale:1 하드코딩 = 완전 死. UI·스토리지·워커동기화만 생존해 있어 전수 삭제.
//   ★분석탭 도움말의 변동성 타깃 진단(S293)은 자체 시뮬레이션이라 보존 — 재도입 판단에 필요.

// ════════════════════════════════════════════════════════════
// [S273] 트레일링 ATR 계산 모드 — 진입 시 고정 vs 매 봉 재계산
// ════════════════════════════════════════════════════════════
//   'entry'   : 진입 시점 ATR(14)을 trail 거래 동안 고정 사용 ([S252] 기본 동작)
//               예측 가능, 일관된 trail 폭, BT-실전 일치성 ↑
//               안정 추세 종목 + 규칙 단순화 선호
//   'dynamic' : 매 봉 ATR(14) 재계산 (변동성 적응형, [S252] 이전 동작)
//               시장 변동성에 맞춰 trail 폭이 적응
//               변동성 큰 종목(코인, 분봉), 변동성 폭발 시 노이즈 차단 효과
//   기본값: 'entry' (S252 이후 안정성 우선 정책)
//   영향: 본전보호·트레일링 게이트·트레일링 SL 3곳에서 사용
//   주의: 모드 변경 시 BT 결과 달라짐 → 옵티마이저 재학습 권장
SXE._btTrailAtrMode = (function(){
  try {
    const v = localStorage.getItem('SX_BT_TRAIL_ATR_MODE');
    if(v === 'entry' || v === 'dynamic') return v;
  } catch(_) {}
  return 'entry';  // 기본값: 진입 시점 고정
})();

SXE._btTrailAtrModeSave = function(){
  try { localStorage.setItem('SX_BT_TRAIL_ATR_MODE', SXE._btTrailAtrMode); } catch(_) {}
};

SXE.setBtTrailAtrMode = function(mode){
  if(mode !== 'entry' && mode !== 'dynamic'){
    console.warn('[setBtTrailAtrMode] mode는 "entry" 또는 "dynamic"만 가능');
    return;
  }
  SXE._btTrailAtrMode = mode;
  SXE._btTrailAtrModeSave();
  const desc = mode === 'entry'
    ? '진입 시점 ATR 고정 (예측 가능, 일관된 trail 폭)'
    : '매 봉 ATR 재계산 (변동성 적응형, 노이즈 차단)';
  console.log(`[setBtTrailAtrMode] 트레일링 ATR 모드: ${mode} — ${desc}`);
};

// ════════════════════════════════════════════════════════════
// [S274] BT 청산 검사 모드 — OHLC 보수 vs 종가 기반
// ════════════════════════════════════════════════════════════
//   'conservative' : 봉 내 SL 우선 검사 (l<=pos.sl), 그 다음 TP (h>=pos.tp) ([S253] 기본 동작)
//                    실전 worst case 일치, BT 결과 신뢰성 ↑
//                    일중 거래자, 실전 동기화 우선 매매 스타일에 적합
//   'close'        : 종가 기반 (c>=pos.tp 우선, c<=pos.sl 다음) ([S253] 이전 동작)
//                    봉 안 흔들림 무시, 추세 추종에 유리
//                    종가 매매(장중 안 보고 종가에서만 결정) 스타일에 적합
//                    주의: 봉 내 SL 깨졌다 회복한 경우 살아남으므로 BT 결과가 실전보다
//                          살짝 좋게 나올 수 있음 (종가 매매 전제 위에서만 유효)
//   기본값: 'conservative' (S253 이후 안정성 우선 정책)
//   영향: TP/SL 청산 검사 분기 (조기청산 SCORE/TIME은 항상 c 기반 유지)
//   주의: 모드 변경 시 BT 결과 달라짐 → 옵티마이저 재학습 권장
SXE._btExitMode = (function(){
  try {
    const v = localStorage.getItem('SX_BT_EXIT_MODE');
    if(v === 'conservative' || v === 'close') return v;
  } catch(_) {}
  return 'conservative';  // [S292] 종가 → [S1011] OHLC 보수 복귀 — 공식 프레임(일중 SL 실전 동기화)
})();

SXE._btExitModeSave = function(){
  try { localStorage.setItem('SX_BT_EXIT_MODE', SXE._btExitMode); } catch(_) {}
};

SXE.setBtExitMode = function(mode){
  if(mode !== 'conservative' && mode !== 'close'){
    console.warn('[setBtExitMode] mode는 "conservative" 또는 "close"만 가능');
    return;
  }
  SXE._btExitMode = mode;
  SXE._btExitModeSave();
  const desc = mode === 'conservative'
    ? '봉 내 SL 우선 + OHLC 기반 (실전 worst case)'
    : '종가 기반 (장중 흔들림 무시, 종가 매매용)';
  console.log(`[setBtExitMode] BT 청산 검사 모드: ${mode} — ${desc}`);
};

// [S422] BT 진입 시점 모드 — 신호봉 종가 vs 다음봉 시가 (청산모드와 직교: 진입 가격 결정)
// ════════════════════════════════════════════════════════════
//   'close'   : 신호 발생 봉의 종가로 진입 (기본). 종가 매매 스타일. (구 nextBarEntry=false)
//   'nextOpen': 신호 다음 봉의 시가로 진입. 일봉이면 "다음날 시가". (구 nextBarEntry=true)
//               실전에서 종가 신호 확인 후 다음날 시초가에 매수하는 흐름과 일치.
//   영향: sxRunBtEngine 진입 가격(ep) 분기. 모든 BT 경로(단일/교차/워크포워드/실시간/스캔/옵티마이저)에 일관 적용.
//   동기화: 워커는 localStorage 미지원 → 메인이 scan config로 동봉(btEntryMode) → 워커가 덮어씀 (_btExitMode와 동일 패턴).
//   주의: 모드 변경 시 BT 결과 달라짐 → 옵티마이저 재학습 권장.
SXE._btEntryMode = (function(){
  try {
    const v = localStorage.getItem('SX_BT_ENTRY_MODE');
    if(v === 'close' || v === 'nextOpen') return v;
  } catch(_) {}
  return 'nextOpen';  // [S1011] close→nextOpen — 공식 프레임: 다음봉 시가(시즌2 실전 정합)
})();

SXE._btEntryModeSave = function(){
  try { localStorage.setItem('SX_BT_ENTRY_MODE', SXE._btEntryMode); } catch(_) {}
};

SXE.setBtEntryMode = function(mode){
  if(mode !== 'close' && mode !== 'nextOpen'){
    console.warn('[setBtEntryMode] mode는 "close" 또는 "nextOpen"만 가능');
    return;
  }
  SXE._btEntryMode = mode;
  SXE._btEntryModeSave();
  const desc = mode === 'nextOpen'
    ? '다음봉 시가 진입 (일봉=다음날 시가, 실전 종가확인 후 매수)'
    : '신호봉 종가 진입 (종가 매매)';
  console.log(`[setBtEntryMode] BT 진입 시점 모드: ${mode} — ${desc}`);
};

// [S423] BT 갭 가드 — 다음봉 시가 모드 전용. 시가 갭이 과도하면 그 신호 진입 스킵(갭상승만).
// ════════════════════════════════════════════════════════════
//   목적: 'nextOpen' 진입 시 다음봉 시가가 신호봉 종가보다 크게 갭상승하면 추격 매수 위험 → 스킵.
//   허용폭(동적): 신호봉 종가 위의 "가장 가까운 천장"까지 거리에 비례.
//     · 천장 후보 = 피벗 R1/R2/R3 중 종가 위인 것 ∪ 20봉 신고가(struct.hi) → 그 중 최솟값(가장 가까운 위쪽).
//     · 허용갭% = 1 + 6×clamp(저항거리%÷8, 0, 1)  → 저항 근접/돌파상태=1%, 8%↑ 여유=7%.
//       (R1 돌파 확정이면 천장이 R2로 자동 리셋 → R1은 지지화, R2까지 여력만큼 허용)
//   미지영역(종가 위 천장 없음): BB 상단(ind.bb.upper) 이탈 시 스킵, 아니면 7%까지 허용.
//   갭하락(시가<종가)은 항상 허용(싸게 매수). 'close' 모드엔 영향 없음(갭 자체가 없음).
//   기본값: true(ON) — 현실적 진입 가정. 동기화: 메인 scan config(btGapGuard) → 워커(_btExitMode 패턴).
SXE._btGapGuard = (function(){
  try {
    const v = localStorage.getItem('SX_BT_GAP_GUARD');
    if(v === 'on')  return true;
    if(v === 'off') return false;
  } catch(_) {}
  return true;  // 기본 ON
})();

SXE._btGapGuardSave = function(){
  try { localStorage.setItem('SX_BT_GAP_GUARD', SXE._btGapGuard ? 'on' : 'off'); } catch(_) {}
};

SXE.setBtGapGuard = function(on){
  SXE._btGapGuard = !!on;
  SXE._btGapGuardSave();
  console.log(`[setBtGapGuard] BT 갭 가드: ${SXE._btGapGuard ? 'ON (과도 갭상승 진입 스킵)' : 'OFF'} — 다음봉 시가 모드 전용`);
};

// [S1022] 순수 MA크로스 모드 + 3모드 MA쌍(_MODE_MA_PAIR/_MACROSS_PAIR/_btModeAligned) 철거 — 레시피-BT 일원화로 死.

// ════════════════════════════════════════════════════════════
//  백테스트 엔진 (엔진 JS 통합 — scrComputeScore 기반)
// ════════════════════════════════════════════════════════════
function sxRunBtEngine(rawRows, tf, params, opts = {}) {
  // [S1018] 레시피-BT 일원화 — 클래식 score진입/TP·SL/조기청산/게이트/볼타깃/레짐 폐기.
  //   진입 = 레시피 votes≥1 · 청산 = 이중ATR(2×/3×)+MA5×20 데드(유예10) — 전부 sx_exec_core(SSOT) 위임.
  //   시즌1 BT = 시즌2 자동매매(runAutotradeExit)와 동일 로직. 결과/트레이드 형태는 대시보드 호환 유지.
  params = params || {};
  const rows = SXE.sanitizeRows(sxAdaptRows(rawRows));
  const BT_WARMUP_FULL = 100, BT_WARMUP_MIN = 50, BT_MIN_TRADE_BARS = 10;
  let BT_WARMUP = BT_WARMUP_FULL;
  if (rows.length < BT_WARMUP_FULL + BT_MIN_TRADE_BARS && rows.length >= BT_WARMUP_MIN + BT_MIN_TRADE_BARS) BT_WARMUP = BT_WARMUP_MIN;
  if (rows.length < BT_WARMUP_MIN + BT_MIN_TRADE_BARS) {
    const need = BT_WARMUP_MIN + BT_MIN_TRADE_BARS;
    return { error: `데이터 부족 — ${need}봉 필요, 현재 ${rows.length}봉`, shortage: true, barsNeeded: need, barsHave: rows.length, winRate: 0, profitFactor: 0, totalPnl: 0, mdd: 0, totalTrades: 0 };
  }
  const EC = (typeof SXExecCore !== 'undefined') ? SXExecCore : ((typeof window !== 'undefined' && window.SXExecCore) || null);
  if (!EC) return { error: 'sx_exec_core 미로드', winRate: 0, profitFactor: 0, totalPnl: 0, mdd: 0, totalTrades: 0 };
  const slip = opts.slippage ?? 0.001;
  // [S422] 진입 시점: opts.nextBarEntry 명시 우선, 미지정 시 전역 _btEntryMode(공식 프레임=다음봉시가) 따름.
  const nextBar = (opts.nextBarEntry != null) ? opts.nextBarEntry : (SXE._btEntryMode === 'nextOpen');
  const mk = (opts && opts.market) || (typeof currentMarket !== 'undefined' ? currentMarket : null) || 'kr';
  // [S1201] 진입원 토글 — 기본 3원 전부 ON(시즌2 정합). opts.entrySrc로 개별 OFF(단일검증 UI).
  const _srcOn = (opts && opts.entrySrc) || (EC.SRC_ALL || { recipe:true, bullVol:true, v2:true, maCross:false });   // [S1210] maCross=후보 기본 OFF(워커=코어 기본이라 자동 OFF 유지)

  // 봉당 진입신호 사전계산 (calcAllScreener 1회/봉) — scores 겸용. [S1201] 3원(recipe/bullVol/v2) 신호객체 보존
  const _btVotes = new Array(rows.length).fill(0);
  const _btSig = new Array(rows.length).fill(null);
  for (let i = BT_WARMUP; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - 249), i + 1);   // 레시피는 ~250봉 히스토리 필요(150봉=votes 미발동)
    let ind; try { ind = calcAllScreener(slice, tf); } catch (_) { continue; }
    if (!ind) continue;
    try { const _es = EC.entrySignalAt(mk, ind, rows, i, { srcOn: _srcOn }); _btSig[i] = _es; _btVotes[i] = _es.votes || 0; } catch (_) {}
  }

  // 라이프사이클(코어) — 진입 3원(recipe>bullVol>v2 상호배타·S1201)/청산(이중ATR+MA5×20 데드·유예10)
  const _lc = EC.runLifecycle(rows, (i) => _btSig[i] || 0, { entryMode: nextBar ? 'nextOpen' : 'close', slippage: slip, minIdx: BT_WARMUP, cfg: EC.CFG });

  // 코어 트레이드 → BT 트레이드 형태 (대시보드/btGetCurrentState 호환: entry/exit/pnl/type/exitReason/…/tp·sl)
  const trades = _lc.trades.map(t => {
    const isOpen = (t.reason === 'EOD');
    const pnl = +(t.ret * 100).toFixed(2);
    return { entry: t.entryPrice, exit: t.exitPrice, pnl: pnl, rawPnl: pnl, posScale: 1, type: isOpen ? 'OPEN' : (pnl > 0 ? 'WIN' : 'LOSS'), exitReason: isOpen ? '미청산' : t.reason, bars: t.bars, entryIdx: t.entryIdx, exitIdx: t.exitIdx, entryDate: t.entryDate || '', exitDate: isOpen ? '' : (t.exitDate || ''), tp: null, sl: null, src: t.src || 'recipe', v2Cat: t.v2Cat || null, v2Tier: t.v2Tier || null, cell: t.cell || null };   // [S1201] 진입원 각인 [S1210] 진입봉 칸
  });

  // 통계 (구 관례 유지·새 레시피 트레이드 기준 — pf=총익/총손, totalPnl=복리 equity−100, mdd=equity곡선)
  const wins = trades.filter(t => t.type === 'WIN');
  const losses = trades.filter(t => t.type === 'LOSS');
  const closed = wins.length + losses.length;
  const winRate = closed ? +(wins.length / closed * 100).toFixed(1) : 0;
  const avgWin = wins.length ? +(wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2) : 0;
  const avgLoss = losses.length ? +Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length).toFixed(2) : 0;
  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : (totalWin > 0 ? 99 : 0);
  let equity = 100, peak = 100, maxDD = 0;
  trades.forEach(t => { equity *= (1 + t.pnl / 100); if (equity > peak) peak = equity; const dd = peak > 0 ? (peak - equity) / peak * 100 : 0; if (dd > maxDD) maxDD = dd; });
  const totalPnl = +((equity - 100)).toFixed(2);
  let maxConsecLoss = 0, curConsecLoss = 0;
  trades.forEach(t => { if (t.type === 'LOSS') { curConsecLoss++; if (curConsecLoss > maxConsecLoss) maxConsecLoss = curConsecLoss; } else curConsecLoss = 0; });

  // [S1201] 진입원별 분해 — 어느 소스가 몇 건을 잡고 얼마를 벌었나. v2는 in-sample이라 반드시 분리 표기.
  const _srcBreak = {};
  ['recipe','bullVol','v2','maCross'].forEach(k => {   // [S1210] +maCross(후보 · 켰을 때만 n>0)
    const ts = trades.filter(t => (t.src || 'recipe') === k && t.type !== 'OPEN');
    if (!ts.length) { _srcBreak[k] = { n: 0 }; return; }
    const w = ts.filter(t => t.pnl > 0);
    let eq = 1; ts.forEach(t => { eq *= (1 + t.pnl / 100); });
    _srcBreak[k] = { n: ts.length, win: +(w.length / ts.length * 100).toFixed(1),
      pnl: +((eq - 1) * 100).toFixed(2), avg: +(ts.reduce((a, t) => a + t.pnl, 0) / ts.length).toFixed(2) };
  });

  // 결과 — 폐기 필드(gate/vol/mode)는 호환 위해 빈값 동봉. engine:'recipe' 마커.
  return { winRate, profitFactor: pf, totalPnl, mdd: +maxDD.toFixed(2), totalTrades: closed, avgWin, avgLoss, maxConsecLoss, scores: _btVotes.slice(BT_WARMUP), scores3: _btVotes.slice(BT_WARMUP).map(v => ({ t: v })), trades, rowsLength: rows.length, gateBlocks: 0, gateReasons: {}, gapSkips: 0, entryMode: (nextBar ? 'nextOpen' : 'close'), gapGuard: false, volTarget: { active: false }, _mode: null, modeGateSkips: 0, engine: 'recipe', _srcBreak, _entrySrc: _srcOn };   // [S1201]
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
    // [BUGFIX] PF 표준 정의: 총수익/총손실 (평균 비율 아님)
    const _gW = wins.reduce((s,t) => s + t.pnl, 0);
    const _gL = Math.abs(losses.reduce((s,t) => s + t.pnl, 0));
    const pf = _gL > 0 ? +(_gW / _gL).toFixed(2) : (_gW > 0 ? 99 : 0);
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
// [S264] 기본값 ON 정책. 스크리너 _safetyDefaults와 권위 동기화.
//        [S426] bbUpper(BB상단이탈)·resistNear(저항근접) 추가 → 12개 전수 ON.
//        주의: 스크리너 _loadSafetyFilterUI가 첫 로드 시 localStorage 값으로 덮어씀 — 이 초기값은
//        스크리너 로드 전 BT/실시간 신호가 안전필터 호출하는 레이스 윈도우에서만 사용됨.
SXE._safetyFlags = {threshold:true,volExtreme:true,volHigh:true,rsiDiv:true,macdNeg:true,bbUpper:true,resistNear:true,fakeBreakout:true,volResist:true,chaseGuard:true,dumpWarn:true,supportBreak:true,debtRatio:true,foreignSell:true,highBeta:true}; // [S469] supportBreak · [S1016] A그룹(stochRsi/ma60resist/deadCrossGuard) 철거

// [S1006] S160 BT 진입 게이트 섹션 철거(설정·검사함수·분석대칭 전역 일괄) — 안전필터 일원화

// [S1006] S161 게이트 해시 철거 — 캐시 무효화는 SX_DATA_SCHEMA_VERSION v5 bump로 대체

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
  const sectorStocks = {}; // [S359] 섹터별 종목명 — 분포 상세(검증) 표시용
  for (const s of stocksData) {
    const sec = s.sector || '미분류';
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
    (sectorStocks[sec] = sectorStocks[sec] || []).push(s.name || s.code);
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
    sectorDistribution: sectorEntries.map(([name, count]) => ({ name, count, ratio: Math.round(count / n * 100), stocks: sectorStocks[name] || [] })),
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
