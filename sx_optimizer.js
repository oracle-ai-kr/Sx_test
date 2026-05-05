// ════════════════════════════════════════════════════════════
//  sx_optimizer.js v3.15 — 파라미터 자동 최적화 모듈
// ════════════════════════════════════════════════════════════
(function(){
'use strict';

// ════════════════════════════════════════════════════════════
// [S170 → S171] 로그 캡처 시스템은 sx_diag.js로 이전됨
//   이유: 옵티마이저뿐 아니라 시스템 진단 화면에서도 로그 확인 필요
//   진입점: window._optShowLogModal (옵티마이저 📋 Log 버튼이 호출)
//          window.openLogModal (sx_diag.js의 시스템 진단 화면에서 호출)
//   sx_diag.js에서 console 후킹 즉시 활성화 → 옵티마이저 진입 전 로그도 캡처
// ════════════════════════════════════════════════════════════

// [WEAK-4 FIX] _optUpdateCount 방어 선언
//   원인: window._optUpdateCount는 line ~1111에서 지정되지만, 그 앞 line 290 등에서
//          _optUpdateCount()로 호출됨. 이벤트 핸들러 경로에선 OK지만 모듈 로드 중
//          동기 경로가 닿으면 ReferenceError. no-op 플레이스홀더로 초기화.
function _optUpdateCount(){
  // 나중에 window._optUpdateCount가 지정되면 그쪽으로 위임
  if(typeof window !== 'undefined' && typeof window._optUpdateCount === 'function' && window._optUpdateCount !== _optUpdateCount){
    return window._optUpdateCount.apply(this, arguments);
  }
}

// ─── S103: 진동 피드백 공통 헬퍼 ─────────────────────────────
// 패턴: [8]탭전환/펼치기 [10]선택/모드 [12]모달오픈 [15]액션/저장/초기화 [20]실행시작·종료
// IIFE 내부라 screener.html의 _sxVib 참조 불가 → navigator.vibrate 직접 호출 래퍼
function _optVib(pattern){
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(_){}
}

// ── 기본 설정 (최적화 우선순위 순) ──
// [S169] 11개 파라미터 모두 범위 입력으로 통일 (칩 시스템 제거)
// [v3.17 USER-DEFAULTS] 사용자 요청 기본범위로 변경 (이전 사진2 기준 → 새 사진 기준)
//   목적: 단기·일봉 트레이딩에 자주 쓰이는 표준값(RSI/ATR 14, MA 5/20/60)을 고정값으로 두고,
//         의사결정 핵심 6개 파라미터(BUY/BB/TP/SL/SELL)만 좁은 실용 범위로 좁혀
//         초기 사용자가 합리적인 결과를 빠르게 얻도록 함
//   변경 내역:
//     - BUY 임계: 20~60 → 30~70 (단기 트레이딩 임계값 상향)
//     - BB 기간: 10~30 → 9~20 (단기형 위주로 좁힘)
//     - BB 배수: 1.0~3.0 → 1.5~2.5 (실용 범위로 좁힘)
//     - TP 배수: 1.0~4.0 → 1.0~4.0 (유지)
//     - SL 배수: 0.5~2.0 → 0.5~2.0 (유지)
//     - SELL 임계: 1~10 → 30~50 (점수 기반 청산 임계로 통일, 이전 1~10은 신호 카운트 기반이었음)
//     - RSI/ATR/MA단/MA중/MA장: 표준값으로 고정 (step=0 → 단일값 처리, 조합 수 1)
//   기본값 복원: _optResetRanges()로 언제든지 이 값으로 되돌릴 수 있음 (UI 버튼 [기본범위설정])
const OPT_DEFAULTS = {
  // [진입 결정] — 거래 발생 여부를 좌우하는 게이트 최우선
  buyTh:   { min:30,  max:70,  step:1,   enabled:false },  // 1. 진입 점수 임계
  bbLen:   { min:9,   max:20,  step:1,   enabled:false },  // 2. BB 기간 (신호 빈도)
  bbMult:  { min:1.5, max:2.5, step:0.1, enabled:false },  // 3. BB 배수 (진입 폭)
  // [청산 결정] — 진입 안정화 후 최적화
  tpMult:  { min:1.0, max:4.0, step:0.1, enabled:false },  // 4. 익절 폭
  slMult:  { min:0.5, max:2.0, step:0.1, enabled:false },  // 5. 손절 폭
  sellTh:  { min:30,  max:50,  step:1,   enabled:false },  // 6. 청산 점수
  // [지표 기간] — 표준값 고정 (step=0)
  rsiLen:  { min:14,  max:14,  step:0,   enabled:false },  // 7. RSI 기간 (고정 14)
  atrLen:  { min:14,  max:14,  step:0,   enabled:false },  // 8. ATR 기간 (고정 14)
  // [이동평균] — 표준값 고정 (step=0)
  maShort: { min:5,   max:5,   step:0,   enabled:false },  // 9. MA 단기 (고정 5)
  maMid:   { min:20,  max:20,  step:0,   enabled:false },  // 10. MA 중기 (고정 20)
  maLong:  { min:60,  max:60,  step:0,   enabled:false },  // 11. MA 장기 (고정 60)
};

// [S169] 사진2 기본값 보존 — 최소값정렬/초기화 시 복원용
const OPT_DEFAULTS_BASE = JSON.parse(JSON.stringify(OPT_DEFAULTS));

// ════════════════════════════════════════════════════════════
// [S169] OPT_PRESETS 제거 (칩 시스템 폐지)
//   기존: sellTh/rsiLen/atrLen/maShort/maMid/maLong을 칩으로 표시
//   변경: 11개 모두 min~max~step 범위 입력으로 통일
//   하위호환: 빈 객체 + 빈 배열로 유지 (구버전 코드의 OPT_PRESETS[k] 참조 시 undefined 방지)
// ════════════════════════════════════════════════════════════
const OPT_PRESETS = {};
const OPT_PRESET_KEYS = [];
const OPT_PRESET_DEFAULT = {};

// ════════════════════════════════════════════════════════════
// [S169-fix] 600봉 통일 — 파라미터별 봉수 차이 제거
//
// [이전 설계 폐기 이유]
//   기존 S115는 "단기 지표는 200봉으로 충분"이라는 가정으로 차등 적용.
//   하지만 실제로는 다음 문제 발생:
//
//   ① 종합점수 비교 부당:
//      RSI 후보 200봉 BT vs BUY 후보 600봉 BT → 거래수/수익률 절대값 차이
//      → 종합점수 계산 시 봉수 다른 결과를 같은 기준으로 비교 불가
//
//   ② 시장 국면 다양성 차이:
//      200봉(10개월) = 1개 국면만 / 600봉(2.5년) = 상승+하락+횡보
//      → 200봉 RSI 최적값이 "최근 10개월에만 잘 맞는" 값일 위험
//
//   ③ 거래 표본 부족:
//      200봉 BT는 거래 5~10회 → 통계 신뢰도 낮음, 우연 효과 증폭
//
//   ④ 확장→좁히기 워크플로 신뢰성:
//      범위 확장 탐색 → 최적값 근방으로 좁히기 사용 패턴에서
//      봉수 다르면 단계별 결과 일관성 깨짐
//
// [통일 효과]
//   ✓ 모든 파라미터 같은 600봉으로 평가 → 공정 비교
//   ✓ 시장 국면 균형 평가 → 과적합 위험 감소
//   ✓ 거래 표본 충분 (평균 15~30거래) → 통계 신뢰도 ↑
//   ✓ 단일검증/분석탭/옵티마이저 모두 600봉 → 결과 정합성
//
// [속도 비용]
//   기존 대비 약 40% 추가 시간 소요 — 정확성을 위한 수용 가능 비용
//   (옵티마이저는 한 번 돌리면 끝나는 작업이라 속도보다 정확성 우선)
// ════════════════════════════════════════════════════════════
const OPT_PARAM_BARS = {
  buyTh:   600,
  bbLen:   600,
  bbMult:  600,
  tpMult:  600,
  slMult:  600,
  sellTh:  600,
  rsiLen:  600,
  atrLen:  600,
  maShort: 600,
  maMid:   600,
  maLong:  600,
};
// 헬퍼: paramKey에 맞는 봉수 반환 (없으면 600 기본)
// [S169-fix] 모든 파라미터 600봉이라 단일 값 반환
function _optGetParamBars(paramKey){
  return OPT_PARAM_BARS[paramKey] || 600;
}
// 헬퍼: 동반자 탐색 시 두 파라미터 중 더 긴 봉수
// [S169-fix] 모든 파라미터 600봉이라 항상 600 반환 (호환성 유지)
function _optGetCombinedBars(paramKey, companionKey){
  const a = _optGetParamBars(paramKey);
  const b = companionKey ? _optGetParamBars(companionKey) : 0;
  return Math.max(a, b);
}

const MARKET_DEFAULTS = {
  kr:   [{ code:'005930', name:'삼성전자' },{ code:'000660', name:'SK하이닉스' }],
  us:   [{ code:'AAPL', name:'Apple' },{ code:'MSFT', name:'Microsoft' }],
  coin: [{ code:'KRW-BTC', name:'Bitcoin' },{ code:'KRW-ETH', name:'Ethereum' }],
};
const OPT_STOCKS_KEY = 'SX_OPT_STOCKS';
const OPT_MAX_STOCKS = 10;
// ── S86: 캔들 로컬 캐시 ──
const CANDLE_CACHE_PREFIX = 'SX_CDL_';
const CANDLE_CACHE_TTL = 4 * 60 * 60 * 1000; // 4시간
let _memCandleCache = {}; // 메모리 캐시 (세션 내 즉시 로드)

function _candleCacheKey(code, tf){ return `${CANDLE_CACHE_PREFIX}${code}_${tf}`; }

function _loadCachedCandle(code, tf){
  // 1. 메모리 캐시
  const mk = `${code}_${tf}`;
  if(_memCandleCache[mk]) return _memCandleCache[mk];
  // 2. localStorage 캐시
  // [PATCH cache-version v3] _v 버전 체크 — 캔들 처리 로직 변경 시 옛 캐시 자동 무효화
  //   SX_DATA_SCHEMA_VERSION은 sx_screener.html에서 정의된 전역 상수
  //   타이밍 안전: window 로드 전 호출 가능성 → 미정의면 버전 체크 스킵 (기존 동작 유지)
  const _v = (typeof SX_DATA_SCHEMA_VERSION !== 'undefined') ? SX_DATA_SCHEMA_VERSION : null;
  try {
    const raw = localStorage.getItem(_candleCacheKey(code, tf));
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || !d.ts || !d.rows) return null;
    // 버전 체크 (전역 상수 정의된 경우만)
    if(_v && d._v !== _v){
      try{ localStorage.removeItem(_candleCacheKey(code, tf)); }catch(_){}
      return null;
    }
    if(Date.now() - d.ts > CANDLE_CACHE_TTL) return null; // 만료
    _memCandleCache[mk] = d.rows; // 메모리에도 올림
    return d.rows;
  } catch(_){ return null; }
}

function _saveCachedCandle(code, tf, rows){
  const mk = `${code}_${tf}`;
  _memCandleCache[mk] = rows;
  // [PATCH cache-version v3] _v 부착 — 옛 버전 자동 무효화
  const _v = (typeof SX_DATA_SCHEMA_VERSION !== 'undefined') ? SX_DATA_SCHEMA_VERSION : null;
  const payload = { _v, ts: Date.now(), rows };
  try {
    localStorage.setItem(_candleCacheKey(code, tf), JSON.stringify(payload));
  } catch(e){
    // 용량 초과 시 캐시 정리 후 재시도
    _cleanCandleCache();
    try { localStorage.setItem(_candleCacheKey(code, tf), JSON.stringify(payload)); } catch(_){}
  }
}

function _cleanCandleCache(){
  // 현재 시장 외 캔들 캐시 삭제 + 만료된 캐시 삭제
  try {
    const keys = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(CANDLE_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        if(!d || !d.ts || Date.now() - d.ts > CANDLE_CACHE_TTL){
          localStorage.removeItem(k);
        }
      } catch(_){ try { localStorage.removeItem(k); } catch(_){} }
    });
  } catch(_){}
}

function _clearAllCandleCache(){
  try {
    const keys = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(CANDLE_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch(_){} });
  } catch(_){}
  _memCandleCache = {};
}

// 캐시 우선 캔들 로드 (API 폴백)
async function _fetchCandleCached(code, isCoin, tf, count){
  const cached = _loadCachedCandle(code, tf);
  if(cached && cached.length > 0) return cached;
  // API 호출
  const rows = await btFetchCandles(code, isCoin, tf, count);
  if(rows && rows.length > 0) _saveCachedCandle(code, tf, rows);
  return rows;
}

// 캐시 상태 요약
function _getCandleCacheStatus(){
  const stocks = _getOptStocks(_optMarket);
  const tfs = _getSelectedTFs();
  let cached = 0, total = 0;
  for(const s of stocks){
    for(const tf of tfs){
      total++;
      if(_loadCachedCandle(s.code, tf)) cached++;
    }
  }
  return { cached, total };
}

function _loadOptStocks(){
  try{ const d=JSON.parse(localStorage.getItem(OPT_STOCKS_KEY)); if(d) return d; }catch(_){}
  return {};
}
function _saveOptStocks(d){ try { localStorage.setItem(OPT_STOCKS_KEY, JSON.stringify(d)); } catch(_){} }
function _getOptStocks(market){
  const saved = _loadOptStocks();
  if(saved.hasOwnProperty(market)) return saved[market]; // 빈 배열도 존중
  return [...(MARKET_DEFAULTS[market] || [])]; // 최초만 기본값
}
function _addOptStock(market, code, name){
  const all = _loadOptStocks();
  if(!all[market]) all[market] = [...(MARKET_DEFAULTS[market]||[])];
  if(all[market].find(s=>s.code===code)) return false; // 중복
  if(all[market].length >= OPT_MAX_STOCKS) return false;
  all[market].push({code, name: name||code});
  _saveOptStocks(all);
  return true;
}
function _removeOptStock(market, code){
  const all = _loadOptStocks();
  if(!all[market]) all[market] = [...(MARKET_DEFAULTS[market]||[])]; // 기본값 복사 후 삭제
  all[market] = all[market].filter(s=>s.code!==code);
  _saveOptStocks(all);
}

// S100: 종목 5세트 관리 (시장별 독립)
const OPT_STOCK_SETS_KEY = 'SX_OPT_STOCK_SETS'; // {kr:[{name,stocks,ts},...], us:[...], coin:[...]}
const OPT_STOCK_SETS_MAX = 5;
const OPT_STOCK_ACTIVE_SET_KEY = 'SX_OPT_ACTIVE_SET'; // {kr:0, us:0, coin:0}
function _loadStockSets(market){
  try { const all = JSON.parse(localStorage.getItem(OPT_STOCK_SETS_KEY) || '{}'); return all[market] || []; }
  catch(_){ return []; }
}
function _saveStockSets(market, sets){
  let all = {};
  try { all = JSON.parse(localStorage.getItem(OPT_STOCK_SETS_KEY) || '{}'); } catch(_){}
  all[market] = sets;
  try { localStorage.setItem(OPT_STOCK_SETS_KEY, JSON.stringify(all)); } catch(_){}
}
function _loadActiveSetIdx(market){
  try { const all = JSON.parse(localStorage.getItem(OPT_STOCK_ACTIVE_SET_KEY) || '{}'); return all[market] ?? -1; }
  catch(_){ return -1; }
}
function _saveActiveSetIdx(market, idx){
  let all = {};
  try { all = JSON.parse(localStorage.getItem(OPT_STOCK_ACTIVE_SET_KEY) || '{}'); } catch(_){}
  all[market] = idx;
  try { localStorage.setItem(OPT_STOCK_ACTIVE_SET_KEY, JSON.stringify(all)); } catch(_){}
}
function _optSaveStockSet(){
  _optVib(15);
  const stocks = _getOptStocks(_optMarket);
  if(stocks.length === 0){ toast('저장할 종목이 없습니다'); return; }
  const sets = _loadStockSets(_optMarket);
  // [S172] 시장 정보 표시 — 사용자가 어느 시장에 저장 중인지 명확화
  const _mktName = { kr: '국내', us: '해외', coin: '코인' }[_optMarket] || _optMarket;
  if(sets.length >= OPT_STOCK_SETS_MAX){
    toast(`[${_mktName}] 세트는 최대 ${OPT_STOCK_SETS_MAX}개까지 (기존 세트 삭제 후 재저장)`);
    return;
  }
  const name = prompt(`[${_mktName}] 세트 이름 (${sets.length+1}/${OPT_STOCK_SETS_MAX})`, `${_mktName}세트${sets.length+1}`);
  if(!name || !name.trim()) return;
  sets.push({ name: name.trim(), stocks: stocks.map(s=>({code:s.code, name:s.name})), ts: Date.now() });
  _saveStockSets(_optMarket, sets);
  _saveActiveSetIdx(_optMarket, sets.length - 1);
  _renderStockSetBar();
  toast(`📦 [${_mktName}] "${name}" 저장 (${stocks.length}종목)`);
}
function _optLoadStockSet(idx){
  _optVib(10);
  const sets = _loadStockSets(_optMarket);
  if(idx < 0 || idx >= sets.length) return;
  const set = sets[idx];
  // 현재 시장 종목을 세트로 덮어쓰기
  let all = _loadOptStocks();
  all[_optMarket] = set.stocks.map(s=>({code:s.code, name:s.name}));
  _saveOptStocks(all);
  _saveActiveSetIdx(_optMarket, idx);
  // UI 갱신 — 종목 칩 + 선택 상태
  _optSelectedCodes = set.stocks.map(s=>s.code);
  _optSelectedCode = _optSelectedCodes[0] || '';
  // S113-d: 함수명 오타 수정 _renderStockChips → _optRenderChips
  //   기존 버그: 함수 존재 안 해서 칩 UI 갱신 안 됨 → 종목 로드돼도 안 보임
  //   → 브라우저 새로고침 해야 보이는 문제 해결
  if(typeof _optRenderChips === 'function') _optRenderChips();
  _renderStockSetBar();
  const lbl = document.getElementById('optStockCount');
  if(lbl) lbl.textContent = set.stocks.length;
  _optUpdateCount(); // S113-d: 조합 정보도 즉시 갱신
  // [S172] 시장 정보 표시
  const _mktName = { kr: '국내', us: '해외', coin: '코인' }[_optMarket] || _optMarket;
  toast(`📦 [${_mktName}] "${set.name}" 로드 (${set.stocks.length}종목)`);
}
function _optDeleteStockSet(idx, ev){
  if(ev) ev.stopPropagation();
  _optVib(15);
  // S103-fix4: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(()=>_optDeleteStockSetCore(idx), 30);
}
function _optDeleteStockSetCore(idx){
  const sets = _loadStockSets(_optMarket);
  if(idx < 0 || idx >= sets.length) return;
  if(!confirm(`"${sets[idx].name}" 세트를 삭제하시겠습니까?`)) return;
  sets.splice(idx, 1);
  _saveStockSets(_optMarket, sets);
  const act = _loadActiveSetIdx(_optMarket);
  if(act === idx) _saveActiveSetIdx(_optMarket, -1);
  else if(act > idx) _saveActiveSetIdx(_optMarket, act - 1);
  _renderStockSetBar();
  toast('세트 삭제됨');
}
function _renderStockSetBar(){
  const bar = document.getElementById('optStockSetBar');
  const lbl = document.getElementById('optStockSetLabel');
  if(!bar) return;
  const sets = _loadStockSets(_optMarket);
  const actIdx = _loadActiveSetIdx(_optMarket);
  // [S172] 시장 아이콘 + 카운트 표시 (시장별 독립 저장 명확화)
  const _mktIcon = { kr: '🇰🇷', us: '🇺🇸', coin: '🪙' }[_optMarket] || '';
  const _mktName = { kr: '국내', us: '해외', coin: '코인' }[_optMarket] || '';
  if(lbl) lbl.textContent = `${_mktIcon} ${_mktName} ${sets.length}/${OPT_STOCK_SETS_MAX}`;
  if(sets.length === 0){
    bar.innerHTML = `<span style="font-size:9px;color:var(--text3,#999)">${_mktName} 시장 저장된 세트 없음 — "현재 저장"으로 추가</span>`;
    return;
  }
  bar.innerHTML = sets.map((s, i) => {
    const act = (i === actIdx);
    const bg = act ? 'background:var(--accent,#2563eb);color:#fff;border-color:var(--accent,#2563eb)' : 'background:var(--surface,#fff);color:var(--text,#222);border-color:var(--border,#ddd)';
    const _name = (s.name || `세트${i+1}`).replace(/"/g,'&quot;');
    return `<div style="padding:4px 8px;border-radius:6px;border:1px solid;font-size:10px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;${bg}" onclick="_optLoadStockSet(${i})" title="${s.stocks.length}종목">
      <span>${_name}</span>
      <span style="font-size:8px;opacity:.7">${s.stocks.length}</span>
      <span style="font-size:11px;cursor:pointer;line-height:1;margin-left:2px" onclick="_optDeleteStockSet(${i}, event)">✕</span>
    </div>`;
  }).join('');
}
window._optSaveStockSet = _optSaveStockSet;
window._optLoadStockSet = _optLoadStockSet;
window._optDeleteStockSet = _optDeleteStockSet;

// ── 상태 ──
let _running = false;
let _cancelled = false;
let _results = [];
let _optMarket = 'kr'; // 현재 optimizer 시장
let _optSelectedCode = ''; // 단일 선택 (하위호환)
let _optSelectedCodes = []; // S86: 복수 선택 종목 코드 배열
let _optLocked = {}; // {rsiLen:14, buyTh:60, ...} 고정된 최적값
// S113-c: 전체 탐색(그리드) 대상 파라미터 집합 (하이브리드 탐색)
//   체크된 파라미터들 → 전체 조합 그리드 서치 (Phase 1)
//   체크 안 된 파라미터들 → 순차 탐색 (Phase 2)
//   잠긴 파라미터 → 탐색 제외 (고정값 유지)
let _optCheckedParams = new Set();

// ════════════════════════════════════════════════════════════
// S114: 프리셋 선택 상태
//   각 프리셋 파라미터별로 선택된 값들의 Set
//   예: _optPresetSelected.rsiLen = new Set([9, 14])
//   기본값: 모든 칩 선택 (전체 탐색)
//   저장: localStorage SX_OPT_PRESETS
// ════════════════════════════════════════════════════════════
const OPT_PRESET_STORAGE_KEY = 'SX_OPT_PRESETS';
let _optPresetSelected = {};
// 초기화 — 모든 프리셋 칩 선택
OPT_PRESET_KEYS.forEach(k => {
  _optPresetSelected[k] = new Set(OPT_PRESETS[k]);
});
// localStorage에서 복원
try {
  const saved = localStorage.getItem(OPT_PRESET_STORAGE_KEY);
  if(saved){
    const obj = JSON.parse(saved);
    OPT_PRESET_KEYS.forEach(k => {
      if(Array.isArray(obj[k]) && obj[k].length > 0){
        // 프리셋 값 중에서만 유효한 것 선택 (외부값 무시)
        const valid = obj[k].filter(v => OPT_PRESETS[k].includes(v));
        if(valid.length > 0) _optPresetSelected[k] = new Set(valid);
      }
    });
  }
} catch(_) {}
function _saveOptPresets(){
  try {
    const obj = {};
    OPT_PRESET_KEYS.forEach(k => {
      obj[k] = Array.from(_optPresetSelected[k]);
    });
    localStorage.setItem(OPT_PRESET_STORAGE_KEY, JSON.stringify(obj));
  } catch(_) {}
}

// ════════════════════════════════════════════════════════════
// [S169] 파라미터 범위 로컬 저장 — 사용자 변경한 min/max/step 영구 저장
//   키: SX_OPT_RANGES
//   값: { buyTh:{min,max,step}, bbLen:{...}, ... }
//   저장 시점: 사용자 input 변경 시 (debounce)
//   복원 시점: 모달 열기 시 (_optBuildModal에서 OPT_DEFAULTS와 머지)
//   초기화: 최소값정렬 버튼 또는 _optResetRanges() 호출 시
// ════════════════════════════════════════════════════════════
const OPT_RANGES_KEY = 'SX_OPT_RANGES_V169';

function _optLoadRanges(){
  try {
    const saved = localStorage.getItem(OPT_RANGES_KEY);
    if(!saved) return;
    const obj = JSON.parse(saved);
    Object.keys(OPT_DEFAULTS).forEach(k => {
      if(obj[k] && typeof obj[k] === 'object'){
        const isFloat = ['bbMult','tpMult','slMult'].includes(k);
        const minV = isFloat ? parseFloat(obj[k].min) : parseInt(obj[k].min);
        const maxV = isFloat ? parseFloat(obj[k].max) : parseInt(obj[k].max);
        const stepV = isFloat ? parseFloat(obj[k].step) : parseInt(obj[k].step);
        if(!isNaN(minV)) OPT_DEFAULTS[k].min = minV;
        if(!isNaN(maxV)) OPT_DEFAULTS[k].max = maxV;
        if(!isNaN(stepV) && stepV >= 0) OPT_DEFAULTS[k].step = stepV;
      }
    });
    console.log('[S169] 파라미터 범위 로컬 복원 완료');
  } catch(e) { console.warn('[S169] 범위 복원 실패:', e); }
}

function _optSaveRanges(){
  try {
    const obj = {};
    Object.keys(OPT_DEFAULTS).forEach(k => {
      obj[k] = { min: OPT_DEFAULTS[k].min, max: OPT_DEFAULTS[k].max, step: OPT_DEFAULTS[k].step };
    });
    localStorage.setItem(OPT_RANGES_KEY, JSON.stringify(obj));
  } catch(_) {}
}

// 모든 파라미터를 OPT_DEFAULTS_BASE(사용자 기본값) 범위로 초기화
// [v3.17 RESET-BTN] UI 동기화 + 사용자 확인 + 토스트 알림 추가
//   - UI input(optMin_/optMax_/optStep_)도 함께 갱신해서 화면 즉시 반영
//   - confirm=true (기본값)이면 사용자 확인 다이얼로그 표시 (실수 방지)
//   - confirm=false면 조용히 리셋 (내부 호출용)
function _optResetRanges(opts){
  const _opts = opts || {};
  const _showConfirm = _opts.confirm !== false; // 기본 true
  if(_showConfirm){
    if(!confirm('파라미터 범위를 기본값으로 초기화합니다.\n\nBUY 30~70 / BB 9~20 / BB배수 1.5~2.5\nTP 1~4 / SL 0.5~2 / SELL 30~50\nRSI/ATR 14 고정 / MA 5/20/60 고정\n\n계속하시겠습니까?')) return;
  }
  Object.keys(OPT_DEFAULTS_BASE).forEach(k => {
    OPT_DEFAULTS[k].min = OPT_DEFAULTS_BASE[k].min;
    OPT_DEFAULTS[k].max = OPT_DEFAULTS_BASE[k].max;
    OPT_DEFAULTS[k].step = OPT_DEFAULTS_BASE[k].step;
    // [v3.17 RESET-BTN] UI input도 함께 갱신 (화면 동기화)
    const minEl = document.getElementById('optMin_'+k);
    const maxEl = document.getElementById('optMax_'+k);
    const stepEl = document.getElementById('optStep_'+k);
    if(minEl) minEl.value = OPT_DEFAULTS_BASE[k].min;
    if(maxEl) maxEl.value = OPT_DEFAULTS_BASE[k].max;
    if(stepEl) stepEl.value = OPT_DEFAULTS_BASE[k].step;
  });
  try { localStorage.removeItem(OPT_RANGES_KEY); } catch(_){}
  // [v3.17 RESET-BTN] 조합 수 카운터도 다시 계산 (UI 변경 즉시 반영)
  try { if(typeof _optUpdateCount === 'function') _optUpdateCount(); } catch(_){}
  if(_showConfirm){
    _optVib(15); // 액션 진동
    try { if(typeof toast === 'function') toast('✅ 파라미터 기본범위로 초기화됨'); } catch(_){}
  }
}
// [v3.17 RESET-BTN] HTML onclick에서 호출 가능하도록 글로벌 노출
if(typeof window !== 'undefined') window._optResetRanges = _optResetRanges;

// 즉시 실행 — 앱 시작 시 저장된 범위 복원
_optLoadRanges();

// [S175] 3개 필터 기본 OFF로 변경 — 사용자 요청
//   이전: 거래수/승률/건별 모두 ON 기본 → 거래 적을 때 결과가 모두 차단되어 학습 곤란
//   변경: 모두 OFF 기본 → 결과 그대로 보고 사용자가 필요시 켜는 방식
let _optMinTrades = 3; // S86: 최소 거래수 필터 (토글 OFF 기본 → 3)
let _optMinWinRate = 0; // S86: 최소 승률 필터 (토글 OFF 기본 → 0)
let _optMinWinPnl = 2;   // S97: 익절 최소 수익률 필터 (기본 2%, OFF 시 0)
let _optMaxLossPnl = 10;  // S97: 손절 최대 손실률 필터 (기본 10%, OFF 시 999)
let _optPerTradeFilter = false; // S97: 건별 필터 ON/OFF (S175: 기본 OFF)
// S86: 3모드 정렬
let _optSortMode = 'balanced'; // 'profit' | 'balanced' | 'safe'
let _optRegimeMode = 'off'; // 'off' | 'on'
// [S169] 사진3 기준 — 거래수↔승률 비중/순위 swap
//   수익형: 수익률 1순위(45) > 승률 2순위(35) > MDD 3순위(15) > 거래수 4순위(5)
//   안정형: 승률 1순위(45) > 수익률 2순위(35) > MDD 3순위(15) > 거래수 4순위(5)
//   보수형: MDD 1순위(45) > 승률 2순위(35) > 수익률 3순위(15) > 거래수 4순위(5)
const _OPT_MODE_WEIGHTS = {
  profit:   { pnl:45, trades:5, mdd:15, wr:35 },
  balanced: { pnl:35, trades:5, mdd:15, wr:45 },
  safe:     { pnl:15, trades:5, mdd:45, wr:35 }
};
let _optCustomWeights = null; // null이면 모드 기본값 사용
// [S169] 사진3 기준 — 거래수↔승률 순위 swap (4 ↔ 2/1/2)
const _OPT_MODE_TIEBREAK_DEFAULTS = {
  profit:   { pnl:1, trades:4, mdd:3, wr:2 },
  balanced: { pnl:2, trades:4, mdd:3, wr:1 },
  safe:     { pnl:3, trades:4, mdd:1, wr:2 }
};
const _OPT_MODE_TIEBREAK = {
  profit:   { pnl:1, trades:4, mdd:3, wr:2 },
  balanced: { pnl:2, trades:4, mdd:3, wr:1 },
  safe:     { pnl:3, trades:4, mdd:1, wr:2 }
};
// [S169] _OPT_MODES 설명도 사진3 기준 업데이트 (거래수↔승률 swap)
const _OPT_MODES = {
  profit:   { label:'🔥 수익형', desc:'수익률 > 승률 > MDD > 거래수' },
  balanced: { label:'⚖️ 안정형', desc:'승률 > 수익률 > MDD > 거래수' },
  safe:     { label:'🛡️ 보수형', desc:'MDD↓ > 승률 > 수익률 > 거래수' },
};

// S92: 모드별 가중 종합점수
// 공통 요소: 승률(w), 수익률(p), log거래수(t), 안정성(m=1-MDD/100)
// 수익형: 수익률 강조 — p^1.3 × t^0.7 × m^0.5 × w^0.5
// 안정형: 거래수+균형 — p × t^1.3 × m × w^0.7
// 보수형: MDD 강조   — p^0.7 × t × m^2.0 × w
function _optSortScore(bt, mode){
  const pnl = Math.max(bt.totalPnl || 0, 0);
  const trades = Math.max(bt.totalTrades || 0, 0);
  const wr = Math.max(bt.winRate || 0, 0);
  const mddSafe = Math.min(100 - Math.min(Math.abs(bt.mdd || 0), 100), 100);  // S97: 음수 MDD 클램핑

  // 커스텀 가중치가 있으면 사용, 없으면 모드 기본값
  const w = _optCustomWeights || _OPT_MODE_WEIGHTS[mode] || _OPT_MODE_WEIGHTS.balanced;
  return pnl * (w.pnl||0)/100 + trades * (w.trades||0)/100 + wr * (w.wr||0)/100 + mddSafe * (w.mdd||0)/100;
}

// S97: 건별 필터 — BT 결과에서 유효 거래만 추출하여 재집계
// S98: MDD 재계산 — 필터링된 거래 기준 equity curve로 재산출
function _optFilterBtResult(r){
  if(!_optPerTradeFilter || !r || !r.trades || !r.trades.length) return r;
  const valid = r.trades.filter(tr => {
    if(tr.type === 'OPEN') return true; // 미청산은 유지
    if(tr.type === 'WIN' && tr.pnl < _optMinWinPnl) return false;  // 익절인데 수익률 미달
    if(tr.type === 'LOSS' && Math.abs(tr.pnl) > _optMaxLossPnl) return false; // 손절인데 손실 과대
    return true;
  });
  const closed = valid.filter(t => t.type !== 'OPEN');
  if(closed.length === 0) return { ...r, totalTrades:0, winRate:0, totalPnl:0, mdd:0, profitFactor:0, avgWin:0, avgLoss:0, maxConsecLoss:0, trades:valid };
  const winsArr = closed.filter(t => t.type === 'WIN');
  const lossArr = closed.filter(t => t.type === 'LOSS');
  const wins = winsArr.length;
  const totalPnl = closed.reduce((s,t) => s + (t.pnl||0), 0);
  // MDD 재계산: 거래 순서대로 equity curve 재구성
  let eq = 100, peak = 100, maxDD = 0;
  closed.forEach(t => {
    eq *= (1 + (t.pnl||0) / 100);
    if(eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if(dd > maxDD) maxDD = dd;
  });
  // [BUGFIX] PF/avgWin/avgLoss/maxConsecLoss를 spread `...r`에서 가져오면 필터링 전 값 → 미스매치
  //   필터링된 거래 기준으로 재계산
  const totalWin = winsArr.reduce((s,t) => s + (t.pnl||0), 0);
  const totalLoss = Math.abs(lossArr.reduce((s,t) => s + (t.pnl||0), 0));
  const avgWin = winsArr.length ? +(totalWin / winsArr.length).toFixed(2) : 0;
  const avgLoss = lossArr.length ? +(totalLoss / lossArr.length).toFixed(2) : 0;
  const profitFactor = totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : (totalWin > 0 ? 99 : 0);
  let curCL = 0, maxCL = 0;
  closed.forEach(t => { if(t.type === 'LOSS'){ curCL++; if(curCL > maxCL) maxCL = curCL; } else curCL = 0; });
  return {
    ...r,
    totalTrades: closed.length,
    winRate: Math.round(wins / closed.length * 100 * 10) / 10,
    totalPnl: Math.round(totalPnl * 100) / 100,
    mdd: Math.round(maxDD * 100) / 100,
    profitFactor,
    avgWin,
    avgLoss,
    maxConsecLoss: maxCL,
    trades: valid
  };
}

// S98: 10% 대역 + 모드별 다단계 타이브레이커 (커스텀 순위 지원)
// 순위 값이 작을수록 우선. MDD는 낮을수록 좋음(dir=-1)
function _optSortCompare(a, b, mode){
  const sa = _optSortScore(a, mode);
  const sb = _optSortScore(b, mode);
  const maxS = Math.max(Math.abs(sa), Math.abs(sb), 0.001);
  const isTied = Math.abs(sa - sb) / maxS <= 0.10;
  if(!isTied) return sa - sb;
  // 동점 → 모드별 타이브레이커 (순위 기반 동적 생성)
  const tb = _OPT_MODE_TIEBREAK[mode] || _OPT_MODE_TIEBREAK_DEFAULTS[mode];
  const metrics = {
    pnl:   [a.totalPnl||0, b.totalPnl||0, 1],
    trades:[a.totalTrades||0, b.totalTrades||0, 1],
    wr:    [a.winRate||0, b.winRate||0, 1],
    mdd:   [a.mdd||0, b.mdd||0, -1]  // 낮을수록 좋음
  };
  const order = Object.entries(tb)
    .sort((x,y)=>x[1]-y[1])  // 순위 오름차순 정렬
    .map(([k])=>metrics[k])
    .filter(Boolean);
  for(const [va, vb, dir] of order){
    const diff = (va - vb) * dir;
    if(Math.abs(diff) > 0.001) return diff;
  }
  return 0;
}

function _optDisplayScore(bt){
  // 기본 표시용은 balanced
  return _optSortScore(bt, 'balanced').toFixed(1);
}
const _PARAM_MARKET_LABELS_SHORT = {kr:'🇰🇷 국내',us:'🇺🇸 해외',coin:'🪙 코인'};

// ── 유틸 ──
function _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function _esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmtPct(v){ return (v*100).toFixed(1)+'%'; }

// ── 파라미터 조합 생성 ──
// S101: step=0이면 단일값(min) 반환 — 무한루프 방지 + "고정값" 명시적 의미
// S101-fix: float step 부동소수 오차 수정 — Math.round로 개수 계산하여 max 누락 방지
//           (예: 1.8~2.5 step=0.1 → 이전 7개(2.5 누락) → 8개 정상)
function _generateCombinations(ranges){
  const keys = Object.keys(ranges).filter(k=>ranges[k].enabled);
  if(keys.length===0) return [{}];

  const vals = {};
  keys.forEach(k=>{
    const r = ranges[k];
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    vals[k] = [];
    // S114: 프리셋 이산 값 배열 우선 (values 필드 존재 시)
    if(Array.isArray(r.values) && r.values.length > 0){
      r.values.forEach(v => {
        vals[k].push(isFloat ? parseFloat(Number(v).toFixed(1)) : Math.round(v));
      });
      return;
    }
    if(r.step <= 0 || r.max <= r.min){
      // step=0 또는 max≤min → 단일값 고정 (min값 1개만)
      const v = r.min;
      vals[k].push(isFloat ? parseFloat(v.toFixed(1)) : Math.round(v));
    } else {
      // 정수 카운트 기반 — 부동소수 누적 오차 제거
      const n = Math.round((r.max - r.min) / r.step);
      for(let i=0; i<=n; i++){
        const v = r.min + i * r.step;
        vals[k].push(isFloat ? parseFloat(v.toFixed(1)) : Math.round(v));
      }
    }
  });

  // 카르테시안 곱
  let combos = [{}];
  keys.forEach(k=>{
    const next = [];
    combos.forEach(c=>{
      vals[k].forEach(v=>{
        next.push({...c, [k]:v});
      });
    });
    combos = next;
  });
  return combos;
}

// [PATCH-9] _countCombinations는 dead code (호출처 0건) + values 필드 미처리 버그 있어 비활성화
//   실제 사용되는 카운트 로직은 window._optUpdateCount (line ~1122)에 구현됨
//   이 함수를 활성화하려면 _generateCombinations의 `values` 처리 로직도 포함해야 함
// function _countCombinations(ranges){
//   const keys = Object.keys(ranges).filter(k=>ranges[k].enabled);
//   if(keys.length===0) return 1;
//   let count = 1;
//   keys.forEach(k=>{
//     const r = ranges[k];
//     // S101-fix: Math.round로 부동소수 오차 제거 (step=0 또는 max≤min은 1로)
//     const steps = (r.step <= 0 || r.max <= r.min) ? 1 : (Math.round((r.max - r.min) / r.step) + 1);
//     count *= steps;
//   });
//   return count;
// }

// ── 오버레이 CSS ──
const OPT_CSS = `
.opt-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:210;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.opt-panel{background:var(--surface,#fff);border-radius:14px;width:92%;max-width:400px;max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);color:var(--text,#222)}
.opt-header{padding:14px 16px 10px;border-bottom:1px solid var(--border,#e0e0e0);display:flex;align-items:center;justify-content:space-between}
.opt-header h3{margin:0;font-size:15px;font-weight:700}
.opt-close{font-size:20px;cursor:pointer;color:var(--text3,#999);padding:4px 8px;line-height:1}
.opt-body{padding:12px 16px}
.opt-section{margin-bottom:14px}
.opt-section-title{font-size:11px;font-weight:700;color:var(--text2,#666);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}
.opt-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px}
.opt-row label{min-width:65px;color:var(--text,#222)}
.opt-row input[type=number]{width:48px;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:11px;text-align:center;background:var(--surface2,#f5f5f5);color:var(--text,#222);font-family:inherit}
.opt-row input[type=checkbox]{margin:0}
.opt-row .opt-dash{color:var(--text3,#999)}
.opt-stock-input{width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface2,#f5f5f5);color:var(--text,#222);font-family:inherit;box-sizing:border-box}
.opt-tf-grid{display:flex;flex-wrap:wrap;gap:4px}
.opt-tf-chip{padding:4px 10px;border-radius:12px;font-size:10px;cursor:pointer;border:1px solid var(--border,#ddd);background:var(--surface2,#f5f5f5);color:var(--text2,#666);transition:all .15s}
.opt-tf-chip.active{background:var(--accent,#2563eb);color:#fff;border-color:var(--accent,#2563eb)}
.opt-btn{width:100%;padding:10px;border-radius:8px;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s}
.opt-btn-primary{background:var(--accent,#2563eb);color:#fff}
.opt-btn-danger{background:var(--sell,#e74c3c);color:#fff}
.opt-btn-secondary{background:var(--surface2,#f0f0f0);color:var(--text,#222);border:1px solid var(--border,#ddd)}
.opt-btn:disabled{opacity:0.4;cursor:default}
.opt-info{font-size:10px;color:var(--text3,#999);margin-top:6px;line-height:1.5}
.opt-progress{width:100%;height:6px;background:var(--surface2,#e0e0e0);border-radius:3px;overflow:hidden;margin:8px 0}
.opt-progress-fill{height:100%;background:var(--accent,#2563eb);transition:width .3s;border-radius:3px}
.opt-progress-text{font-size:10px;color:var(--text2,#666);text-align:center}
.opt-result-card{background:var(--surface2,#f8f8f8);border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border,#e0e0e0)}
.opt-result-card.best{border-color:var(--accent,#2563eb);background:rgba(37,99,235,0.05)}
.opt-rank{display:inline-block;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:6px}
.opt-rank.r1{background:var(--accent,#2563eb);color:#fff}
.opt-rank.r2{background:var(--buy,#27ae60);color:#fff}
.opt-rank.r3{background:var(--text3,#aaa);color:#fff}
.opt-result-params{font-size:10px;color:var(--text2,#666);margin-top:4px}
.opt-result-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;font-size:10px}
.opt-result-stats div{text-align:center}
.opt-result-stats .stat-val{font-weight:700;font-size:12px}
.opt-result-stats .stat-lbl{color:var(--text3,#999);font-size:9px}
.opt-result-actions{display:flex;gap:6px;margin-top:8px}
.opt-result-actions button{flex:1;padding:6px;border-radius:5px;font-size:10px;font-weight:600;cursor:pointer;border:none;font-family:inherit}
.opt-tf-header{font-size:12px;font-weight:700;margin:12px 0 6px;padding:6px 0;border-bottom:1px solid var(--border,#e0e0e0);color:var(--text,#222)}
.opt-mode-toggle{display:flex;gap:0;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden}
.opt-mode-btn{flex:1;padding:8px;font-size:11px;font-weight:600;cursor:pointer;border:none;background:var(--surface2,#f0f0f0);color:var(--text2,#666);font-family:inherit;transition:all .15s}
.opt-mode-btn.active{background:var(--accent,#2563eb);color:#fff}
.opt-mkt-btn{flex:1;padding:7px;font-size:10px;font-weight:600;cursor:pointer;border:none;background:var(--surface2,#f0f0f0);color:var(--text2,#666);text-align:center;font-family:inherit;transition:all .15s}
.opt-mkt-btn.active{background:var(--accent,#2563eb);color:#fff}
.opt-chip{display:inline-flex;align-items:center;gap:2px;padding:4px 8px;border-radius:12px;font-size:10px;border:1px solid var(--border,#ddd);cursor:pointer;transition:all .15s}
.opt-chip .chip-name{color:var(--text,#222)}
.opt-chip .chip-code{color:var(--text3,#999);font-size:9px}
.opt-chip .chip-x{color:var(--text3,#999);font-size:9px;padding:0 2px;margin-left:2px}
.opt-chip.selected{background:var(--accent,#2563eb);border-color:var(--accent,#2563eb)}
.opt-chip.selected .chip-name,.opt-chip.selected .chip-code,.opt-chip.selected .chip-x{color:#fff}
`;

// ── CSS 삽입 ──
function _injectCSS(){
  if(document.getElementById('optCSS')) return;
  const style = document.createElement('style');
  style.id = 'optCSS';
  style.textContent = OPT_CSS;
  document.head.appendChild(style);
}

// ════════════════════════════════════════════════════════════
//  메인 UI
// ════════════════════════════════════════════════════════════
function openOptimizer(){
  _injectCSS();
  _closeOpt();

  const market = typeof currentMarket !== 'undefined' ? currentMarket : 'kr';
  const stocks = _getOptStocks(market);
  const tfs = (typeof TF_MAP !== 'undefined' && TF_MAP[market]) ? TF_MAP[market] : [{k:'day',l:'일봉'}];
  // BT에 적합한 TF만 (KIS 연동 시 국내 30분봉 포함)
  const _kisOn = typeof window!=='undefined' && window._kisEnabled;
  const _btTfSet = new Set(['day','week','month','240m','60m']);
  if(_kisOn && market==='kr') _btTfSet.add('30m');
  const btTfs = tfs.filter(t=>_btTfSet.has(t.k));

  const overlay = document.createElement('div');
  overlay.id = 'optOverlay';
  overlay.className = 'opt-overlay';
  overlay.addEventListener('click',e=>{ if(e.target===overlay) _closeOpt(); });

  // S100: 기본 활성 TF = 일봉 (day)
  const tfChips = btTfs.map(t=>`<div class="opt-tf-chip${t.k==='day'?' active':''}" data-tf="${t.k}" onclick="_optToggleTF(this)">${t.l}</div>`).join('');

  // 파라미터 범위 행 HTML
  const paramRows = Object.entries(OPT_DEFAULTS).map(([k,d])=>{
    const labels = {rsiLen:'RSI 기간',bbLen:'BB 기간',bbMult:'BB 배수',atrLen:'ATR 기간',maShort:'MA 단기',maMid:'MA 중기',maLong:'MA 장기',buyTh:'BUY 임계',sellTh:'SELL 임계',tpMult:'TP 배수',slMult:'SL 배수'};
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const step = isFloat ? '0.1' : '1';
    const locked = _optLocked.hasOwnProperty(k);
    const lockStyle = locked ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#eee);color:var(--text3,#999)';
    const lockLabel = locked ? `🔒${_optLocked[k]}` : '🔓';
    const rowOpacity = locked ? 'opacity:0.4' : '';
    // S113-e: 동반자 체크박스 (라디오 방식 — 1개만 선택 가능)
    //   체크됨 = 모든 Step에 2D 동반 (동반자 탐색)
    //   체크 안됨 = 기존 순차 탐색
    //   S113-f: BUY 포함 모든 파라미터 체크 가능
    const checked = _optCheckedParams && _optCheckedParams.has(k) ? 'checked' : '';
    const checkedStyle = checked ? 'accent-color:#2563eb' : '';
    
    // ════════════════════════════════════════════════════════════
    // [S169] 모든 파라미터 범위 입력으로 통일 (칩 시스템 제거)
    //   변경 시 자동 로컬 저장 (_optOnRangeInputChange)
    // ════════════════════════════════════════════════════════════
    const isPreset = false; // [S169] 칩 시스템 폐지 — 항상 false
    let valueArea = '';
    {
      // 모든 파라미터: min~max~step 범위 input
      valueArea = `<input type="number" id="optMin_${k}" value="${d.min}" step="${step}" style="width:38px" ${locked?'disabled':''} onchange="_optOnRangeInputChange('${k}')">
      <span class="opt-dash">~</span>
      <input type="number" id="optMax_${k}" value="${d.max}" step="${step}" style="width:38px" ${locked?'disabled':''} onchange="_optOnRangeInputChange('${k}')">
      <span class="opt-dash">s</span>
      <input type="number" id="optStep_${k}" value="${d.step}" step="${step}" style="width:34px" ${locked?'disabled':''} onchange="_optOnRangeInputChange('${k}')">`;
    }
    
    return `<div class="opt-row" id="optRow_${k}" style="${rowOpacity}">
      <input type="checkbox" id="optCheck_${k}" ${checked} ${locked?'disabled':''} onchange="_optToggleCheck('${k}')" style="margin-right:4px;width:14px;height:14px;cursor:${locked?'not-allowed':'pointer'};${checkedStyle}" title="체크 = 이 파라미터가 모든 Step에 2D 동반 (1개만)">
      <label style="min-width:65px;font-weight:600">${labels[k]||k}</label>
      ${valueArea}
      <span id="optLock_${k}" style="font-size:10px;padding:2px 5px;border-radius:4px;cursor:pointer;white-space:nowrap;${lockStyle}" onclick="_optToggleLock('${k}')">${lockLabel}</span>
      <span id="optStatus_${k}" style="font-size:9px;font-weight:600;white-space:nowrap;min-width:28px;text-align:right"></span>
    </div>`;
  }).join('');

  overlay.innerHTML = `<div class="opt-panel">
    <div class="opt-header"><h3>⚡ 자동 최적화</h3><span class="opt-close" onclick="_closeOpt()">✕</span></div>
    <div class="opt-body">
      <!-- S114: 상단 설명 제거 (화면 공간 절약) -->

      <!-- 고정값 현황 -->
      <div id="optLockedBar" style="margin-bottom:10px"></div>

      <!-- 종목 -->
      <div class="opt-section">
        <div class="opt-section-title">📌 대표 종목</div>
        <!-- 시장 전환 -->
        <div id="optMarketToggle" style="display:flex;gap:0;margin-bottom:8px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden">
          <div class="opt-mkt-btn${market==='kr'?' active':''}" onclick="_optSwitchMarket('kr')">🇰🇷 국내</div>
          <div class="opt-mkt-btn${market==='us'?' active':''}" onclick="_optSwitchMarket('us')">🇺🇸 해외</div>
          <div class="opt-mkt-btn${market==='coin'?' active':''}" onclick="_optSwitchMarket('coin')">🪙 코인</div>
        </div>
        <div style="display:flex;gap:6px">
          <div style="position:relative;flex:1">
            <input id="optStockInput" type="text" placeholder="종목명 또는 코드 검색" autocomplete="off" autocorrect="off" spellcheck="false" oninput="_optOnStockInput()" onkeydown="_optOnStockKey(event)" class="sx-stock-input">
            <div class="sx-dd" id="optStockDd"></div>
          </div>
          <button onclick="_optToggleAzPanel()" class="sx-az-btn" title="종목 탐색" id="optAzToggle">▼</button>
        </div>
        <div id="optStockChips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
        <div class="opt-info"><span id="optMarketLabel">${_PARAM_MARKET_LABELS_SHORT[market]}</span> · <span id="optStockCount">${stocks.length}</span>/${OPT_MAX_STOCKS}개 · 탭=선택/해제 · ✕=삭제</div>
        <!-- S100: 종목 5세트 선택 바 -->
        <div style="margin-top:6px;padding:6px 8px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#ddd)">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
            <span style="font-size:10px;font-weight:700;color:var(--text,#222)">📦 종목 세트</span>
            <span id="optStockSetLabel" style="font-size:9px;color:var(--text3,#999)"></span>
            <span style="flex:1"></span>
            <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optSaveStockSet()">현재 저장</span>
          </div>
          <div id="optStockSetBar" style="display:flex;gap:4px;flex-wrap:wrap"></div>
        </div>
      </div>

      <!-- TF 선택 -->
      <div class="opt-section">
        <div class="opt-section-title">📊 탐색 타임프레임</div>
        <div class="opt-tf-grid" id="optTfGrid">${tfChips}</div>
        <div class="opt-info">복수 선택 시 TF별 최적 조합을 각각 탐색합니다</div>
      </div>

      <!-- 파라미터 범위 -->
      <div class="opt-section" id="optParamSection">
        <div class="opt-section-title" style="display:flex;align-items:center;gap:6px">
          <span>🎛️ 파라미터 범위</span>
          <span onclick="_optShowParamHelp()" title="단기·스윙 + 밸런스형 추천값 보기" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--accent,#2563eb);color:#fff;font-size:11px;font-weight:700;cursor:pointer;user-select:none">?</span>
        </div>
        ${paramRows}
        <div class="opt-info" id="optComboInfo">조합 수 계산 중...</div>
      </div>

      <!-- 실행 -->
      <div class="opt-section" id="optControlSection">
        <div id="optCandleBar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0);gap:6px;flex-wrap:wrap">
          <span id="optCandleStatus" style="font-size:10px;color:var(--text2,#666);flex:1;min-width:120px">📦 캔들 캐시: 확인 중...</span>
          <span style="font-size:10px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline;white-space:nowrap" onclick="_optRefreshCandles()">🔄 캔들 갱신</span>
          <!-- [S170] 로그 모달 열기 (모바일 콘솔 대체) -->
          <span style="font-size:10px;color:var(--text2,#666);cursor:pointer;text-decoration:underline;white-space:nowrap;padding:2px 6px;border:1px solid var(--border,#ddd);border-radius:4px;background:var(--surface,#fff)" onclick="_optShowLogModal()" title="옵티마이저 로그 보기/저장 (S170)">📋 Log</span>
          <!-- [v3.17 RESET-BTN] 기본범위 초기화 버튼 — 11개 파라미터 min/max/step을 OPT_DEFAULTS_BASE로 일괄 복원 -->
          <span style="font-size:10px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline;white-space:nowrap;padding:2px 6px;border:1px solid var(--accent,#2563eb);border-radius:4px;background:var(--surface,#fff)" onclick="_optResetRanges()" title="모든 파라미터 범위를 기본값(BUY 30~70 / BB 9~20 / RSI·ATR·MA 고정)으로 초기화">🔧 기본범위설정</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optMinTradesToggle" onchange="_optUpdateMinTrades()"><span class="st-track"></span></label>
          <div style="flex:1"><span style="font-size:10px;color:var(--text,#222);font-weight:600">거래수 최소 10건 필터</span><br><span style="font-size:9px;color:var(--text3,#999)">ON: 거래수 10 미만 결과 제외 (과적합 방지)</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optMinWinRateToggle" onchange="_optUpdateMinWinRate()"><span class="st-track"></span></label>
          <div style="flex:1"><span style="font-size:10px;color:var(--text,#222);font-weight:600">승률 60% 미만 필터</span><br><span style="font-size:9px;color:var(--text3,#999)">ON: 승률 60% 미만 결과 제외</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optPerTradeToggle" onchange="_optUpdatePerTradeFilter()"><span class="st-track"></span></label>
          <div style="flex:1">
            <span style="font-size:10px;color:var(--text,#222);font-weight:600">건별 수익/손실 필터</span><br>
            <span style="font-size:9px;color:var(--text3,#999)">익절 최소 <input type="number" id="optMinWinPnl" value="2" min="0" max="50" step="0.5" style="width:40px;padding:1px 3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center" onchange="_optUpdatePerTradeFilter()">% · 손절 최대 <input type="number" id="optMaxLossPnl" value="10" min="1" max="100" step="1" style="width:40px;padding:1px 3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center" onchange="_optUpdatePerTradeFilter()">%</span>
          </div>
        </div>
        <!-- S90: 레짐 탐색 선택 -->
        <div class="opt-section-title">🔄 레짐 탐색</div>
        <div id="optRegimeGate" style="display:flex;gap:0;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden"></div>
        <!-- S86: 모드 게이트 — 탐색 전 선택 -->
        <div class="opt-section-title">🎯 탐색 모드</div>
        <div id="optModeGate" style="display:flex;gap:0;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden"></div>
        <div id="optModeDesc" style="font-size:9px;color:var(--text3,#999);margin-bottom:4px;text-align:center"></div>
        <!-- S90: 커스텀 가중치 (접기 카드) -->
        <div id="optWeightArea" style="display:none;padding:8px 10px;margin-bottom:8px;background:var(--surface2,#f5f5f5);border-radius:8px;border:1px solid var(--border,#e0e0e0)">
          <details style="margin-bottom:8px">
            <summary style="font-size:10px;font-weight:600;color:var(--accent,#2563eb);cursor:pointer">ℹ️ 우선순위 · 종합점수 비중이란?</summary>
            <div style="font-size:9px;color:var(--text2,#666);margin-top:6px;line-height:1.6;padding:6px 8px;background:var(--surface,#fff);border-radius:6px;border:1px solid var(--border,#e8e8e8)">
              <b>우선순위</b> — 종합점수가 비슷할 때(10% 이내) 최종 순위 결정<br>
              1순위 지표부터 비교하여 동점을 해소합니다. (1~4, 중복 불가)<br><br>
              <b>종합점수 비중</b> — 파라미터 조합별 종합점수 계산<br>
              점수 = 수익률×W₁ + 거래수×W₂ + MDD×W₃ + 승률×W₄ (합계 100%)<br><br>
              <b style="color:var(--text,#222)">📌 TP/SL과 승률의 관계</b><br>
              <b>TP &gt; SL (손익비 좋은)</b> — 추세 강한 종목/TF에 유리<br>
              · 승률 낮음 + 거래수 많음 = ✅ 정상 (손익비로 커버)<br>
              · 승률 높음 + 거래수 적음 = ⚠️ 과적합 의심<br><br>
              <b>TP &lt; SL (승률 좋은)</b> — 횡보/박스권에 유리<br>
              · 승률 높음 + 거래수 적음 = ✅ 정상 (승률로 커버)<br>
              · 승률 낮음 + 거래수 많음 = ❌ 최악 (둘 다 불리)<br><br>
              <span style="color:var(--accent,#2563eb)">💡 TP/SL 비율과 승률이 <b>반대 방향</b>이면 건강한 전략,<br><b>같은 방향</b>이면 과적합 또는 위험 신호.</span>
            </div>
          </details>
          <div style="display:grid;grid-template-columns:50px 28px 1fr 1fr 1fr 1fr 30px;gap:2px 3px;align-items:center;font-size:9px;text-align:center">
            <span></span><span></span><span style="font-weight:600">수익률</span><span style="font-weight:600">거래수</span><span style="font-weight:600">MDD↓</span><span style="font-weight:600">승률</span><span></span>
            <span style="font-weight:600;text-align:left" rowspan="2">🔥수익</span>
            <span style="font-size:8px;color:var(--text3,#999)">순위</span>
            <input type="number" id="optTB_profit_pnl" value="1" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optTB_profit_trades" value="3" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optTB_profit_mdd" value="4" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optTB_profit_wr" value="2" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span></span>
            <span></span>
            <span style="font-size:8px;color:var(--text3,#999)">비중</span>
            <input type="number" id="optCW_profit_pnl" value="50" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_trades" value="20" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_mdd" value="5" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_wr" value="25" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span id="optCWS_profit" style="font-size:9px;font-weight:600">100</span>
            <span style="font-weight:600;text-align:left;border-top:1px solid var(--border,#e0e0e0);padding-top:4px">⚖️안정</span>
            <span style="font-size:8px;color:var(--text3,#999);border-top:1px solid var(--border,#e0e0e0);padding-top:4px">순위</span>
            <input type="number" id="optTB_balanced_pnl" value="1" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_balanced_trades" value="2" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_balanced_mdd" value="3" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_balanced_wr" value="4" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <span></span>
            <span></span>
            <span style="font-size:8px;color:var(--text3,#999)">비중</span>
            <input type="number" id="optCW_balanced_pnl" value="40" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_trades" value="20" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_mdd" value="20" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_wr" value="20" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span id="optCWS_balanced" style="font-size:9px;font-weight:600">100</span>
            <span style="font-weight:600;text-align:left;border-top:1px solid var(--border,#e0e0e0);padding-top:4px">🛡보수</span>
            <span style="font-size:8px;color:var(--text3,#999);border-top:1px solid var(--border,#e0e0e0);padding-top:4px">순위</span>
            <input type="number" id="optTB_safe_pnl" value="1" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_safe_trades" value="4" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_safe_mdd" value="2" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <input type="number" id="optTB_safe_wr" value="3" min="1" max="4" step="1" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center;margin-top:4px">
            <span></span>
            <span></span>
            <span style="font-size:8px;color:var(--text3,#999)">비중</span>
            <input type="number" id="optCW_safe_pnl" value="30" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_trades" value="10" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_mdd" value="30" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_wr" value="30" min="0" max="100" step="5" style="width:100%;padding:2px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span id="optCWS_safe" style="font-size:9px;font-weight:600">100</span>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
            <button class="opt-btn" style="padding:4px 10px;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer" onclick="_optResetWeights()">초기화</button>
            <button class="opt-btn opt-btn-primary" style="padding:4px 10px;font-size:10px;border-radius:4px;cursor:pointer" onclick="_optApplyWeights()">적용</button>
          </div>
        </div>
        <!-- [S175] 한 줄 레이아웃: 🔁 반복 / 📐 최소값 정렬 / 🔓 전체 해제
             ▶ 결과보기 버튼은 제거 (최적화 실행과 워크플로 중복)
             대안: "최소값 정렬 → 최적화 실행" 으로 동일 효과 + 더 직관 -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <!-- 반복 입력 (작게) -->
          <span style="font-size:10px;color:var(--text2,#666);font-weight:600;white-space:nowrap">🔁</span>
          <input type="number" id="optRepeatCount" value="1" min="1" max="99" style="width:38px;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:11px;text-align:center;background:var(--surface2,#f5f5f5);color:var(--text,#222)">
          <span style="font-size:9px;color:var(--text3,#999)">회</span>
          <!-- 최소값 정렬 (균등) -->
          <span style="flex:1;font-size:10px;padding:6px 4px;border-radius:5px;cursor:pointer;background:var(--surface2,#f0f0f0);color:var(--text2,#666);border:1px solid var(--border,#ddd);text-align:center;white-space:nowrap" onclick="_optMinValueAlign()" title="11개 파라미터 max를 min으로 자동 정렬 (단일값) → 이후 최적화 실행 클릭">📐 최소값 정렬</span>
          <!-- 전체 해제 (균등) -->
          <span style="flex:1;font-size:10px;padding:6px 4px;border-radius:5px;cursor:pointer;background:var(--surface2,#f0f0f0);color:var(--text2,#666);border:1px solid var(--border,#ddd);text-align:center;white-space:nowrap" onclick="_optUnlockAll()">🔓 전체 해제</span>
        </div>
        <button id="optRunBtn" class="opt-btn opt-btn-danger" onclick="_optRunNonstop()">최적화 실행</button>
        <div class="opt-progress" id="optProgress" style="display:none">
          <div class="opt-progress-fill" id="optProgressFill" style="width:0%"></div>
        </div>
        <div class="opt-progress-text" id="optProgressText" style="display:none"></div>
        <button id="optCancelBtn" class="opt-btn opt-btn-danger" style="display:none;margin-top:6px" onclick="_optCancel()">중지</button>
      </div>

      <!-- S90: TF별 최고기록 -->
      <div id="optBestArea" style="margin-top:10px"></div>

      <!-- 결과 -->
      <div id="optResultArea" style="display:none"></div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  history.pushState({view:'optimizer'}, '');
  _optMarket = market;
  _optUpdateCount();
  const initStocks = _getOptStocks(_optMarket);
  // S86: 초기 — 전체 종목 선택 (복수)
  _optSelectedCodes = initStocks.map(s => s.code);
  _optSelectedCode = _optSelectedCodes.length > 0 ? _optSelectedCodes[0] : '';
  _optRenderChips();
  _optRenderLockedBar();
  _optRenderModeGate(); // S86: 모드 게이트
  _optRenderRegimeGate(); // S90: 레짐 게이트
  _optRenderBestCards(); // S90: 최고기록
  _renderStockSetBar(); // S100: 종목 세트 바
  setTimeout(_optUpdateCandleStatus, 100);
}

// ── 모드 전환 ──
let _optMode = 'quick';

// ── 고정 토글 ──
function _optToggleLock(key){
  _optVib(10);
  const labels = {rsiLen:'RSI 기간',bbLen:'BB 기간',bbMult:'BB 배수',atrLen:'ATR 기간',maShort:'MA 단기',maMid:'MA 중기',maLong:'MA 장기',buyTh:'BUY 임계',sellTh:'SELL 임계',tpMult:'TP 배수',slMult:'SL 배수'};
  if(_optLocked.hasOwnProperty(key)){
    // 해제
    delete _optLocked[key];
    toast(`${labels[key]} 고정 해제`);
  } else {
    // 고정 — 결과에서 찾은 값이 있으면 그걸 사용, 없으면 현재 기본값
    const topVal = _optGetTopValue(key);
    if(topVal !== null){
      _optLocked[key] = topVal;
      toast(`🔒 ${labels[key]} = ${topVal} 고정`);
    } else {
      const d = SCR_ANAL_DEFAULTS[key];
      _optLocked[key] = d !== undefined ? d : OPT_DEFAULTS[key]?.min || 0;
      toast(`🔒 ${labels[key]} = ${_optLocked[key]} 고정 (기본값)`);
    }
  }
  _optRenderParamRow(key);
  _optRenderLockedBar();
  _optUpdateCount();
}

// ════════════════════════════════════════════════════════════
// S113-c: 체크박스 토글 — 전체 탐색 대상 파라미터 선택
// ════════════════════════════════════════════════════════════
//  체크된 파라미터들 → 전체 조합 그리드 서치 (Phase 1)
//  체크 안 된 파라미터들 → 순차 탐색 (Phase 2)
//  잠긴 파라미터는 disabled (체크 불가)
//
//  효과: 핵심 파라미터 상호작용을 완전 탐색 + 나머지는 빠른 순차
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// S113-e: 동반자 탐색 체크박스 토글 (라디오 방식)
//     - 체크는 1개만 허용 (라디오)
//     - 모든 파라미터 체크 가능 (BUY 포함, S113-f)
//     - 다른 체크 선택 시 기존 체크 자동 해제
//   S113-f: BUY도 체크 가능 — 체크 시 BUY Step 자체는 스킵, 다른 Step에 2D 동반
// ════════════════════════════════════════════════════════════
function _optToggleCheck(key){
  _optVib(8);
  const labels = {rsiLen:'RSI 기간',bbLen:'BB 기간',bbMult:'BB 배수',atrLen:'ATR 기간',maShort:'MA 단기',maMid:'MA 중기',maLong:'MA 장기',buyTh:'BUY 임계',sellTh:'SELL 임계',tpMult:'TP 배수',slMult:'SL 배수'};
  // 잠긴 파라미터는 체크 불가
  if(_optLocked.hasOwnProperty(key)){
    toast(`🔒 ${labels[key]} 잠김 — 해제 후 체크 가능`);
    const cb = document.getElementById('optCheck_'+key);
    if(cb) cb.checked = _optCheckedParams.has(key);
    return;
  }
  // 이미 체크된 것 클릭 → 해제
  if(_optCheckedParams.has(key)){
    _optCheckedParams.delete(key);
    toast(`${labels[key]} 동반자 해제`);
  } else {
    // S113-e: 라디오 방식 — 다른 체크가 있으면 먼저 해제
    if(_optCheckedParams.size > 0){
      const oldKeys = Array.from(_optCheckedParams);
      _optCheckedParams.clear();
      oldKeys.forEach(old => {
        const oldCb = document.getElementById('optCheck_'+old);
        if(oldCb) oldCb.checked = false;
      });
    }
    _optCheckedParams.add(key);
    toast(`🔗 ${labels[key]} 동반자 선택 (모든 Step에 2D 동반)`);
  }
  _optUpdateCount();
}
// 전체 체크/해제 유틸 (1개만 허용 방식이라 실질적 의미는 적음)
function _optCheckAll(){
  _optVib(15);
  toast(`동반자 탐색은 1개만 선택 가능`);
}
function _optUncheckAll(){
  _optVib(15);
  const n = _optCheckedParams.size;
  _optCheckedParams.clear();
  _OPT_PARAM_ORDER.forEach(k => _optRenderParamRow(k));
  _optUpdateCount();
  toast(`☐ 동반자 해제`);
}
// 단일값 파라미터 정적 체크 (범위 1개면 체크 의미 없음)
function _optIsSingleValueStatic(k){
  const minEl = document.getElementById('optMin_'+k);
  const maxEl = document.getElementById('optMax_'+k);
  const stepEl = document.getElementById('optStep_'+k);
  if(!minEl || !maxEl || !stepEl) return false;
  const isFloat = ['bbMult','tpMult','slMult'].includes(k);
  const min = isFloat ? parseFloat(minEl.value) : parseInt(minEl.value);
  const max = isFloat ? parseFloat(maxEl.value) : parseInt(maxEl.value);
  const step = isFloat ? parseFloat(stepEl.value) : parseInt(stepEl.value);
  return (step <= 0 || max <= min);
}

// ════════════════════════════════════════════════════════════
// S114: 프리셋 칩 토글
//   사용자가 칩 클릭 → 선택/해제 토글
//   최소 1개는 선택되어야 함 (모두 해제 방지)
// ════════════════════════════════════════════════════════════
function _optTogglePresetChip(key, val){
  _optVib(8);
  if(!OPT_PRESETS[key]) return;
  const set = _optPresetSelected[key];
  if(set.has(val)){
    // 해제 시도 — 마지막 1개면 거부
    if(set.size <= 1){
      toast(`⚠️ 최소 1개 이상 선택 필요`);
      return;
    }
    set.delete(val);
  } else {
    set.add(val);
  }
  _saveOptPresets();
  _optRenderParamRow(key);
  _optUpdateCount();
}
// 프리셋 값 배열 반환 (탐색용) — 선택된 값들만
function _optGetPresetValues(key){
  if(!OPT_PRESETS[key]) return null;
  const set = _optPresetSelected[key];
  return OPT_PRESETS[key].filter(v => set.has(v));
}

// S91: 전체 잠금 해제
function _optUnlockAll(){
  _optVib(15);
  const keys = Object.keys(_optLocked);
  if(keys.length === 0){ toast('잠긴 파라미터가 없습니다'); return; }
  keys.forEach(k => {
    delete _optLocked[k];
    _optRenderParamRow(k);
    // 상태 표시도 초기화
    const s = document.getElementById('optStatus_'+k);
    if(s) s.textContent = '';
  });
  _optRenderLockedBar();
  _optUpdateCount();
  toast(`🔓 ${keys.length}개 파라미터 전체 해제`);
}
function _optGetTopValue(key){
  const area = document.getElementById('optResultArea');
  if(!area || area.style.display==='none') return null;
  // _lastTopParams에서 가져오기
  if(_lastTopParams && _lastTopParams[key] !== undefined) return _lastTopParams[key];
  return null;
}
let _lastTopParams = null; // 마지막 TOP1 파라미터 저장

// 개별 파라미터 행 UI 갱신
function _optRenderParamRow(key){
  const row = document.getElementById('optRow_'+key);
  const lockBtn = document.getElementById('optLock_'+key);
  if(!row) return;
  const locked = _optLocked.hasOwnProperty(key);
  row.style.opacity = locked ? '0.4' : '1';
  const inputs = row.querySelectorAll('input');
  inputs.forEach(inp => { inp.disabled = locked; });
  if(lockBtn){
    if(locked){
      lockBtn.style.background = 'var(--accent,#2563eb)';
      lockBtn.style.color = '#fff';
      lockBtn.textContent = `🔒${_optLocked[key]}`;
    } else {
      lockBtn.style.background = 'var(--surface2,#eee)';
      lockBtn.style.color = 'var(--text3,#999)';
      lockBtn.textContent = '🔓';
    }
  }
  // S114: 프리셋 파라미터면 칩 UI 재렌더링
  if(OPT_PRESET_KEYS.includes(key)){
    const chipContainer = document.getElementById('optPresetChips_'+key);
    if(chipContainer){
      const presetSet = _optPresetSelected[key] || new Set();
      chipContainer.innerHTML = OPT_PRESETS[key].map(v => {
        const sel = presetSet.has(v);
        const chipStyle = sel
          ? 'background:var(--accent,#2563eb);color:#fff;border:1px solid var(--accent,#2563eb)'
          : 'background:var(--surface2,#eee);color:var(--text3,#999);border:1px solid var(--border,#ddd)';
        return `<span class="opt-preset-chip" onclick="_optTogglePresetChip('${key}',${v})" style="display:inline-block;padding:3px 9px;margin:0 2px;border-radius:12px;font-size:11px;font-weight:600;cursor:${locked?'not-allowed':'pointer'};${chipStyle}${locked?';pointer-events:none':''}">${v}</span>`;
      }).join('');
    }
  }
}

// 고정값 현황 바
function _optRenderLockedBar(){
  const bar = document.getElementById('optLockedBar');
  if(!bar) return;
  const keys = Object.keys(_optLocked);
  if(keys.length === 0){
    // S114: 고정 파라미터 없을 때 빈 div (안내 텍스트 제거 - 공간 절약)
    bar.innerHTML = '';
    return;
  }
  const labels = {rsiLen:'RSI',bbLen:'BB',bbMult:'BB×',atrLen:'ATR',maShort:'MA단',maMid:'MA중',maLong:'MA장',buyTh:'BUY',sellTh:'SELL',tpMult:'TP',slMult:'SL'};
  const chips = keys.map(k=>
    `<span style="display:inline-flex;align-items:center;gap:2px;padding:3px 7px;border-radius:10px;font-size:10px;background:var(--accent,#2563eb);color:#fff;cursor:pointer" onclick="_optToggleLock('${k}')" title="클릭하면 해제">🔒 ${labels[k]||k}=${_optLocked[k]}</span>`
  ).join(' ');
  bar.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${chips} <span style="font-size:9px;color:var(--text3);margin-left:4px">${keys.length}/11 고정</span></div>`;
}

// ── TF 토글 ──
window._optToggleTF = function(el){
  _optVib(10);
  el.classList.toggle('active');
  _optUpdateCandleStatus(); // S86
};

// ── 조합 수 업데이트 (논스톱 순차) ──
window._optUpdateCount = function(){
  const ranges = _readRanges();
  const tfs = _getSelectedTFs();
  const stockCount = Math.max(1, _optSelectedCodes.length);
  const regimeRounds = _optRegimeMode === 'both' ? 2 : 1;
  const regimeLabel = _optRegimeMode === 'both' ? '2(레짐OFF+ON)' : _optRegimeMode === 'on' ? '1(레짐ON)' : '1(레짐OFF)';
  const repeatCount = Math.max(1, parseInt(document.getElementById('optRepeatCount')?.value||'1'));
  // 논스톱: 파라미터별 범위 합산
  // S101-fix: Math.round로 부동소수 오차 제거 (BB/TP/SL 등 float step 정확 카운트)
  // S114: 프리셋 파라미터는 values 배열 개수 사용
  let totalSteps = 0;
  let paramCount = 0;
  Object.keys(ranges).forEach(k=>{
    if(ranges[k].enabled){
      const r = ranges[k];
      let steps;
      if(Array.isArray(r.values) && r.values.length > 0){
        steps = r.values.length; // 프리셋: 선택된 값 개수
      } else {
        steps = (r.step <= 0 || r.max <= r.min) ? 1 : (Math.round((r.max - r.min) / r.step) + 1);
      }
      totalSteps += steps;
      paramCount++;
    }
  });
  const total = totalSteps * tfs.length * regimeRounds * stockCount * repeatCount;
  // S102: 표시되는 BT 회수는 사용자 N회 기준. 실제 실행엔 워밍업 1회가 추가되지만
  //       "워밍업은 기본이므로 UI에서 숨김" 정책에 따라 예상치에 미포함.
  const estSec = Math.ceil(total * 0.3);
  const estMin = estSec >= 60 ? `약 ${Math.ceil(estSec/60)}분` : `약 ${estSec}초`;
  
  // S113-e/f: 동반자 탐색 정보 (체크된 파라미터 = 모든 Step에 2D 동반)
  let companionInfo = '';
  if(_optCheckedParams && _optCheckedParams.size > 0){
    const checkedArr = Array.from(_optCheckedParams).filter(k => !_optLocked.hasOwnProperty(k));
    
    if(checkedArr.length > 0){
      const companionKey = checkedArr[0]; // 1개만 사용 (라디오)
      const shortLabels = {rsiLen:'RSI',bbLen:'BB기간',bbMult:'BB×',atrLen:'ATR',maShort:'MA단',maMid:'MA중',maLong:'MA장',buyTh:'BUY',sellTh:'SELL',tpMult:'TP',slMult:'SL'};
      const compLabel = shortLabels[companionKey] || companionKey;
      
      // 동반자 탐색 BT 수 계산: Σ(각 Step 파라미터 × 동반자 값 개수) - companionKey 자체 Step 제외
      // S114: 프리셋 파라미터는 values 개수 사용
      const compR = ranges[companionKey];
      let compSteps;
      if(Array.isArray(compR?.values) && compR.values.length > 0){
        compSteps = compR.values.length;
      } else {
        compSteps = (!compR || compR.step <= 0 || compR.max <= compR.min) ? 1 : (Math.round((compR.max - compR.min) / compR.step) + 1);
      }
      
      let compTotal = 0;
      Object.keys(ranges).forEach(k => {
        if(!ranges[k].enabled) return;
        if(k === companionKey) return; // 동반자 자체 Step은 스킵
        if(_optLocked.hasOwnProperty(k)) return;
        const rk = ranges[k];
        let kSteps;
        if(Array.isArray(rk.values) && rk.values.length > 0){
          kSteps = rk.values.length;
        } else {
          kSteps = (rk.step <= 0 || rk.max <= rk.min) ? 1 : (Math.round((rk.max - rk.min) / rk.step) + 1);
        }
        compTotal += kSteps * compSteps; // 2D
      });
      const compBT = compTotal * tfs.length * regimeRounds * stockCount * repeatCount;
      const compSec = Math.ceil(compBT * 0.01);
      const compTime = compSec >= 60 ? `약 ${Math.ceil(compSec/60)}분` : `약 ${compSec}초`;
      companionInfo = `<br><span style="color:var(--accent,#2563eb);font-size:11px">🔗 동반자 탐색: <b>${compLabel}</b> (모든 Step에 2D 동반, 자신의 Step 스킵) = <b>${compBT.toLocaleString()}</b>회 BT (${compTime})</span>`;
    }
  }
  
  const el = document.getElementById('optComboInfo');
  if(el) el.innerHTML = `파라미터 <b>${paramCount}</b>개 × 범위합 <b>${totalSteps}</b> × TF <b>${tfs.length}</b>개 × ${regimeLabel}${stockCount>1?' × <b>'+stockCount+'</b>종목':''}${repeatCount>1?' × <b>'+repeatCount+'</b>회':''} = <b>${total}</b>회 BT (${estMin})${companionInfo}`;
};

// ── 범위 읽기 ──
// S101: step 강제 최소값(Math.max) 제거 → step=0 보존 (단일값 고정 의미 유지)
function _readRanges(){
  const ranges = {};
  Object.keys(OPT_DEFAULTS).forEach(k=>{
    // S114: 프리셋 파라미터는 선택된 값 배열 기반 range 생성
    if(OPT_PRESET_KEYS.includes(k)){
      const selValues = _optGetPresetValues(k); // 선택된 값들 (오름차순)
      if(selValues && selValues.length > 0){
        // 탐색 엔진은 min/max/step 기반이므로 선택된 값들 표현:
        //   1개 선택: min=max=그 값, step=0 (고정)
        //   2개+ 선택: values 배열을 별도 필드로 넘김 (_generateCombinations에서 처리)
        if(selValues.length === 1){
          ranges[k] = { 
            min: selValues[0], max: selValues[0], step: 0, 
            enabled: !_optLocked.hasOwnProperty(k),
            values: selValues  // 추후 참조용
          };
        } else {
          ranges[k] = { 
            min: selValues[0], 
            max: selValues[selValues.length-1], 
            step: 0,
            enabled: !_optLocked.hasOwnProperty(k),
            values: selValues  // S114: 이산 값 배열 (프리셋)
          };
        }
      } else {
        // 선택된 값 없음 (안전장치 - 정상 케이스에선 발생 안 함)
        ranges[k] = { min: OPT_DEFAULTS[k].min, max: OPT_DEFAULTS[k].max, step: 0, enabled: false };
      }
      return;
    }
    // 범위 파라미터 (BUY/BB/BB×/TP/SL) — 기존 방식
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
    const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
    const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
    ranges[k] = { min, max, step: Math.max(step, 0), enabled: !_optLocked.hasOwnProperty(k) };
  });
  return ranges;
}

function _getSelectedTFs(){
  const chips = document.querySelectorAll('#optTfGrid .opt-tf-chip.active');
  return Array.from(chips).map(c=>c.dataset.tf);
}

// ════════════════════════════════════════════════════════════
//  실행 — S77: 레짐 OFF → ON 2라운드
// ════════════════════════════════════════════════════════════
async function _optRun(){
  if(_running) return;
  const market = _optMarket;
  // S86: 복수 종목 지원
  const codes = _optSelectedCodes.length > 0 ? [..._optSelectedCodes] : (_optSelectedCode ? [_optSelectedCode] : []);
  if(codes.length === 0){ toast('종목을 선택하세요 (칩 탭)'); return; }

  const tfs = _getSelectedTFs();
  if(tfs.length===0){ toast('TF를 하나 이상 선택하세요'); return; }

  const ranges = _readRanges();
  const combos = _generateCombinations(ranges);
  if(combos.length===0){ toast('파라미터를 하나 이상 활성화하세요'); return; }

  const total = combos.length * tfs.length * (_optRegimeMode==='both'?2:1) * codes.length; // [BUGFIX] 'both'일 때만 ×2 (off/on 단일 모드는 ×1) — 진행률이 항상 50%에서 끝나던 문제 해결
  if(total > 4000){
    if(!confirm(`총 ${total}회 BT를 실행합니다 (${codes.length}종목 × 레짐 OFF+ON).\n시간이 오래 걸릴 수 있습니다. 계속하시겠습니까?`)) return;
  }

  _running = true;
  _cancelled = false;

  // UI 전환
  const runBtn = document.getElementById('optRunBtn');
  const cancelBtn = document.getElementById('optCancelBtn');
  const prog = document.getElementById('optProgress');
  const progFill = document.getElementById('optProgressFill');
  const progText = document.getElementById('optProgressText');
  const resultArea = document.getElementById('optResultArea');
  runBtn.style.display='none'; cancelBtn.style.display='block';
  prog.style.display='block'; progText.style.display='block';
  resultArea.style.display='none';
  progFill.style.width='0%'; progText.textContent='준비 중...';

  // 백업
  const origParams = _loadAnalParams();
  const origRegime = SXE.regimeAdaptEnabled();
  const isCoin = market === 'coin';

  let done = 0;
  // S86: 종목별 BT 결과를 combo 단위로 합산/평균
  const tfResultsOff = {}; // {tf: [{params, bt(avg)}, ...]}
  const tfResultsOn = {};

  // S86: 캔들 프리로드 (캐시 우선, 없는 것만 API)
  progText.textContent = '캔들 프리로드 중...';
  await _optPreloadCandles(codes, tfs, isCoin, progText);

  // 메모리 캔들 맵 구성 (캐시에서 로드)
  const candleCache = {};
  for(const code of codes){
    for(const tf of tfs){
      const mk = `${code}_${tf}`;
      candleCache[mk] = _loadCachedCandle(code, tf);
    }
  }

  try {
    // ━━ 라운드 1: 레짐 OFF ━━
    if(_optRegimeMode !== 'on'){ // 'off' 또는 'both'
    SXE.setRegimeAdapt(false);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResultsOff[tf] = [];

      // 종목별 캔들 (캐시에서)
      const codeRows = {};
      for(const code of codes){
        const mk = `${code}_${tf}`;
        if(candleCache[mk]) codeRows[code] = candleCache[mk];
        else done += combos.length; // 캔들 없으면 그만큼 진행률 보정
      }

      const validCodes = Object.keys(codeRows);
      // [BUGFIX] 모든 종목이 캔들 없으면 위 루프에서 이미 done이 누락분만큼 더해짐
      //   기존: 여기서 또 `combos.length * codes.length` 추가 → 이중 카운트
      //   수정: validCodes 비어있으면 그냥 다음 TF로
      if(validCodes.length === 0){ continue; }

      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const combo = combos[ci];
        const testParams = { ...origParams, ..._optLocked, ...combo };
        _saveAnalParams(testParams);
        const btParams = {
          buyTh: testParams.buyTh > 0 ? testParams.buyTh : 62,
          sellTh: testParams.sellTh > 0 ? testParams.sellTh : 38,
          tpMult: testParams.tpMult > 0 ? testParams.tpMult : 2.5,
          slMult: testParams.slMult > 0 ? testParams.slMult : 1.5,
        };

        // S86: 복수 종목 BT 평균
        let sumWinRate=0, sumPnl=0, sumTrades=0, sumMdd=0, validCount=0;
        for(const code of validCodes){
          try {
            let r = sxRunBtEngine(codeRows[code], tf, btParams, { slippage:0.001, nextBarEntry:false, applyRegimeAdjust:true });
            if(_optPerTradeFilter && r && r.trades) r = _optFilterBtResult(r);
            if(!r.error && r.totalTrades >= 1){
              sumWinRate += r.winRate;
              sumPnl += r.totalPnl;
              sumTrades += r.totalTrades;
              sumMdd += (r.mdd||0);
              validCount++;
            }
          } catch(e){}
          done++;
        }

        if(validCount > 0){
          tfResultsOff[tf].push({
            params:{...testParams},
            bt:{
              winRate: sumWinRate / validCount,
              totalPnl: sumPnl / validCount,
              totalTrades: Math.round(sumTrades / validCount),
              mdd: parseFloat((sumMdd / validCount).toFixed(2)),
              error: null
            },
            _stockCount: validCount
          });
        }

        if(done % 5 === 0 || ci === combos.length-1){
          progFill.style.width = (done/total*100).toFixed(1)+'%';
          progText.textContent = `[레짐OFF] [${tf}] ${done}/${total} (${validCodes.length}종목)`;
          await _sleep(0);
        }
      }
    }

    } // end 라운드1 OFF

    // ━━ 라운드 2: 레짐 ON ━━
    if(_optRegimeMode !== 'off'){ // 'on' 또는 'both'
    SXE.setRegimeAdapt(true);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResultsOn[tf] = [];

      // [BUGFIX] 라운드1 OFF와 일관성: 종목별로 캔들 없으면 done 보정
      //   기존: 일부 종목만 누락 시 done이 누락분 카운트 안 함 → 진행률이 100% 못 채움
      const validCodes = [];
      for(const code of codes){
        if(candleCache[`${code}_${tf}`]) validCodes.push(code);
        else done += combos.length;
      }
      if(validCodes.length === 0){ continue; }

      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const combo = combos[ci];
        const testParams = { ...origParams, ..._optLocked, ...combo };
        _saveAnalParams(testParams);
        const btParams = {
          buyTh: testParams.buyTh > 0 ? testParams.buyTh : 62,
          sellTh: testParams.sellTh > 0 ? testParams.sellTh : 38,
          tpMult: testParams.tpMult > 0 ? testParams.tpMult : 2.5,
          slMult: testParams.slMult > 0 ? testParams.slMult : 1.5,
        };

        let sumWinRate=0, sumPnl=0, sumTrades=0, sumMdd=0, validCount=0;
        for(const code of validCodes){
          try {
            let r = sxRunBtEngine(candleCache[`${code}_${tf}`], tf, btParams, { slippage:0.001, nextBarEntry:false, applyRegimeAdjust:true });
            if(_optPerTradeFilter && r && r.trades) r = _optFilterBtResult(r);
            if(!r.error && r.totalTrades >= 1){
              sumWinRate += r.winRate;
              sumPnl += r.totalPnl;
              sumTrades += r.totalTrades;
              sumMdd += (r.mdd||0);
              validCount++;
            }
          } catch(e){}
          done++;
        }

        if(validCount > 0){
          tfResultsOn[tf].push({
            params:{...testParams},
            bt:{
              winRate: sumWinRate / validCount,
              totalPnl: sumPnl / validCount,
              totalTrades: Math.round(sumTrades / validCount),
              mdd: parseFloat((sumMdd / validCount).toFixed(2)),
              error: null
            },
            _stockCount: validCount
          });
        }

        if(done % 5 === 0 || ci === combos.length-1){
          progFill.style.width = (done/total*100).toFixed(1)+'%';
          progText.textContent = `[레짐ON] [${tf}] ${done}/${total} (${validCodes.length}종목)`;
          await _sleep(0);
        }
      }
    }
    } // end 라운드2 ON
  } catch(e){
    toast('최적화 오류: '+e.message);
  } finally {
    // [PATCH-10] 에러/정상 모든 경로에서 반드시 복원 수행 — _running 플래그 stuck 방지
    try { _saveAnalParams(origParams); } catch(_){}
    try { SXE.setRegimeAdapt(origRegime); } catch(_){}
    try { if(typeof window._optCleanupStopwatch === 'function') window._optCleanupStopwatch(); } catch(_){}
    _running = false;
    try {
      cancelBtn.style.display='none'; prog.style.display='none'; progText.style.display='none';
      runBtn.style.display='block';
    } catch(_){}
  }

  if(_cancelled){
    toast('최적화 중지됨');
    progText.style.display='block';
    progText.textContent = `중지됨 (${done}/${total} 완료)`;
    _renderDualResults(tfResultsOff, tfResultsOn, codes.join('+'), null, null);
    return;
  }

  _renderDualResults(tfResultsOff, tfResultsOn, codes.join('+'), null, null);
}

function _optCancel(){
  _optVib(20);
  _cancelled = true;
}

// ═══════════════════════════════════════════
//  S91: 논스톱 순차 실행 (파라미터 위→아래, N회 반복)
// ═══════════════════════════════════════════
const _OPT_PARAM_ORDER = Object.keys(OPT_DEFAULTS); // buyTh,bbLen,bbMult,tpMult,slMult,sellTh,rsiLen,atrLen,maShort,maMid,maLong

async function _optRunNonstop(){
  if(_running){
    console.warn('[S173-log] _optRunNonstop 진입 거부 — 이미 실행 중');
    return;
  }
  _optVib(20);
  const market = _optMarket;
  const codes = _optSelectedCodes.length > 0 ? [..._optSelectedCodes] : (_optSelectedCode ? [_optSelectedCode] : []);
  // [S173-log] 진입 시 핵심 정보 로그
  console.log(`[S173-log] _optRunNonstop 진입: 시장=${market}, 종목 ${codes.length}개 (${codes.slice(0,3).join(',')}${codes.length>3?'...':''})`);
  if(codes.length === 0){
    console.warn('[S173-log] ❌ 종목 0개 — 중단');
    toast('종목을 선택하세요 (칩 탭)'); return;
  }
  const tfs = _getSelectedTFs();
  console.log(`[S173-log] 선택 TF: [${tfs.join(',')}]`);
  if(tfs.length===0){
    console.warn('[S173-log] ❌ TF 0개 — 중단');
    toast('TF를 하나 이상 선택하세요'); return;
  }

  const repeatCount = Math.max(1, parseInt(document.getElementById('optRepeatCount')?.value||'1'));
  const isCoin = market === 'coin';
  // [S173-log] 단일값 모드 사전 감지 (_optIsSingleValue가 정의되기 전이지만 OPT_DEFAULTS로 추정 가능)
  const _allSingle = Object.keys(OPT_DEFAULTS).every(k => {
    const minEl = document.getElementById('optMin_'+k);
    const maxEl = document.getElementById('optMax_'+k);
    const stepEl = document.getElementById('optStep_'+k);
    if(!minEl || !maxEl) return true; // 요소 없으면 단일값 취급
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const min = isFloat ? parseFloat(minEl.value) : parseInt(minEl.value);
    const max = isFloat ? parseFloat(maxEl.value) : parseInt(maxEl.value);
    const step = stepEl ? (isFloat ? parseFloat(stepEl.value) : parseInt(stepEl.value)) : 0;
    return (step <= 0 || max <= min);
  });
  console.log(`[S173-log] 단일값 모드 사전 감지: ${_allSingle ? 'YES (S173 BT 경로 진입 예정)' : 'NO (정상 탐색)'}`);

  _running = true;
  _cancelled = false;

  const runBtn = document.getElementById('optRunBtn');
  const cancelBtn = document.getElementById('optCancelBtn');
  const prog = document.getElementById('optProgress');
  const progFill = document.getElementById('optProgressFill');
  const progText = document.getElementById('optProgressText');
  const resultArea = document.getElementById('optResultArea');
  runBtn.style.display='none'; cancelBtn.style.display='block';
  prog.style.display='block'; progText.style.display='block';
  resultArea.style.display='none';
  progFill.style.width='0%'; progText.textContent='준비 중...';

  // ═══════════════════════════════════════════════════════════
  // S113: 스톱워치 시작 — 실제 경과 시간 실시간 표시
  //   1초마다 경과 시간을 progText에 덧붙여 갱신
  //   (작업 완료/취소 시 _optStopwatchTimer clearInterval)
  // ═══════════════════════════════════════════════════════════
  const _optStartTime = Date.now();
  const _optFormatElapsed = () => {
    const sec = Math.floor((Date.now() - _optStartTime) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `⏱ ${m}:${String(s).padStart(2,'0')}`;
  };
  // 1초마다 progText에 경과 시간 덧붙임 (현재 텍스트 뒤에 | ⏱ 추가)
  const _optStopwatchTimer = setInterval(() => {
    const el = document.getElementById('optProgressText');
    if(!el) return;
    const cur = el.textContent || '';
    // 기존 ⏱ 제거 후 새로 붙임
    const base = cur.replace(/\s*\|\s*⏱\s*\d+:\d{2}\s*$/, '');
    el.textContent = `${base} | ${_optFormatElapsed()}`;
  }, 1000);
  // 완료/취소 시 정리를 위해 윈도우에 저장
  window._optStopwatchTimer = _optStopwatchTimer;
  // [PATCH-5] 안전장치: window에 cleanup 헬퍼를 노출하여 에러 경로에서도 호출 가능
  //   정상 종료 경로의 clearInterval이 실행 안 되더라도, _optCancel 등 외부에서 이 헬퍼를
  //   호출하면 타이머 누수 방지. 아래 _optRun/_optRunNonstop 에러 복구 훅에서 사용.
  window._optCleanupStopwatch = function(){
    if(window._optStopwatchTimer){
      try { clearInterval(window._optStopwatchTimer); } catch(_){}
      window._optStopwatchTimer = null;
    }
  };

  // 캔들 캐시 자동 갱신
  progText.textContent = '캔들 확인 중...';
  await _optPreloadCandles(codes, tfs, isCoin, progText);
  // 캐시 상태 UI 업데이트
  _optUpdateCandleStatus();

  const origParams = _loadAnalParams();
  const origRegime = SXE.regimeAdaptEnabled();

  // S101-fix: 단일값 파라미터(min=max 또는 step=0) 판별 — 재탐색 불필요
  // S114: 프리셋 파라미터는 선택된 값 개수로 판정
  const _optIsSingleValue = (k) => {
    if(OPT_PRESET_KEYS.includes(k)){
      const vals = _optGetPresetValues(k);
      return (!vals || vals.length <= 1);
    }
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
    const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
    const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
    return (step <= 0 || max <= min);
  };
  const _optGetSingleValue = (k) => {
    if(OPT_PRESET_KEYS.includes(k)){
      const vals = _optGetPresetValues(k);
      return (vals && vals.length > 0) ? vals[0] : OPT_DEFAULTS[k].min;
    }
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    return isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
  };

  // 잠금 안 된 파라미터만 순차 탐색 대상
  // S101-fix: 단일값(min=max 또는 step=0)인 파라미터도 탐색 대상에서 자동 제외
  // S113-c: 체크된 파라미터는 Phase 1(그리드 서치)에서 이미 처리 → Phase 2 순차 탐색에서 제외
  const getUnlockedParams = () => _OPT_PARAM_ORDER.filter(k => 
    !_optLocked.hasOwnProperty(k) && 
    !_optIsSingleValue(k) && 
    !(_optCheckedParams && _optCheckedParams.has(k))
  );

  // 현재 기본값 (각 회차 시작 시 적용될 값)
  let baseParams = { ..._loadAnalParams() };
  // S98: tpMult/slMult가 0이면 OPT_DEFAULTS min값으로 채움 (BT 폴백값과 일치)
  _OPT_PARAM_ORDER.forEach(k => {
    if((baseParams[k]===undefined || baseParams[k]===0) && OPT_DEFAULTS[k]){
      const isFloat = ['bbMult','tpMult','slMult'].includes(k);
      const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
      if(min > 0) baseParams[k] = min;
    }
  });

  // S101-fix: 실행 직전, 안 잠긴 단일값 파라미터는 baseParams에 즉시 반영 + UI에 ✅값 표시
  //           (탐색 루프는 이미 getUnlockedParams가 필터링하므로 진입 안 함)
  _OPT_PARAM_ORDER.forEach(k => {
    if(!_optLocked.hasOwnProperty(k) && _optIsSingleValue(k)){
      const v = _optGetSingleValue(k);
      baseParams[k] = v;
      const se = document.getElementById('optStatus_'+k);
      if(se){ se.textContent = `✅${v}`; se.style.color = 'var(--buy,#27ae60)'; }
    }
  });
  let lastTfResultsOff = null, lastTfResultsOn = null;

  // ═══════════════════════════════════════════════════════════
  // S113-e/f: 동반자 탐색 (Companion Search)
  //
  //   규칙:
  //     - 체크 1개만 허용 (라디오 방식)
  //     - 모든 파라미터 체크 가능 (BUY 포함, S113-f)
  //     - 체크된 파라미터 = 자신의 Step은 스킵
  //     - 다른 모든 Step에 2D 동반
  //
  //   예시 (TP 체크):
  //     Step 1: BUY × TP 2D → BUY 고정, TP 재탐색
  //     Step 2: BB × TP 2D → BB 고정, TP 재탐색
  //     Step 3: BB× × TP 2D → BB× 고정, TP 재탐색
  //     Step 4: TP 단계 SKIP (이미 동반 탐색 중)
  //     Step 5: SL × TP 2D → SL 고정, TP 최종 확정
  //
  //   예시 (BUY 체크):
  //     Step 1: BUY 단계 SKIP
  //     Step 2: BB × BUY 2D → BB 고정, BUY 재탐색
  //     Step 3: BB× × BUY 2D → BB× 고정, BUY 재탐색
  //     Step 4: TP × BUY 2D → TP 고정, BUY 재탐색
  //     Step 5: SL × BUY 2D → SL 고정, BUY 최종 확정
  //
  //   효과:
  //     - 조합 폭발 없음 (2D만)
  //     - 동반자와 다른 모든 파라미터 상호작용 탐색
  //     - 동반자는 "기준점"으로 계속 최적화
  // ═══════════════════════════════════════════════════════════
  // 동반자: 체크된 파라미터 1개 (잠기지 않고 단일값 아닌 것)
  let _companionKey = null;
  const checkedArr = Array.from(_optCheckedParams || []).filter(k => 
    !_optLocked.hasOwnProperty(k) && !_optIsSingleValue(k)
  );
  if(checkedArr.length > 0){
    _companionKey = checkedArr[0]; // 1개만 사용 (라디오 방식)
    console.log(`[S113-f] 동반자 탐색 활성화: ${_companionKey}`);
  }
  // ═══════════════════════════════════════════════════════════

  try {
    // S102: 워밍업 1회 포함 총 회차 (round=0이 워밍업, round=1~repeatCount가 사용자 회차)
    const totalRounds = repeatCount + 1;
    for(let round = 0; round <= repeatCount; round++){
      if(_cancelled) break;
      const isWarmup = (round === 0);
      // S102: 워밍업 시작 시 1회 안내 토스트
      if(isWarmup){ toast('🏃 워밍업 진행중 — baseParams 정렬'); }
      const unlocked = getUnlockedParams();
      // ═══════════════════════════════════════════════════════════
      // [S173] 단일값 모드 BT 실행 — 결과보기 스킵 버그 수정
      //   문제: 11개 파라미터 모두 단일값(min=max, step=0)이면 unlocked=[] →
      //         break로 종료 → 0초에 끝나고 최고기록도 안 남음
      //   원인: 기존 로직은 "탐색할 게 없으면 종료" 의도였으나,
      //         최소값정렬+결과보기 워크플로에서는 명시적 1회 BT가 필요
      //   해결: 단일값 모드 감지 시 baseParams로 1회 BT 실행 + tfResults 채움
      //         → 최고기록 정상 등록 + 랭킹 결과 표시
      // ═══════════════════════════════════════════════════════════
      if(unlocked.length === 0){
        // 워밍업 회차에서는 break (사용자 의도가 모두 잠금 상태)
        if(isWarmup){
          // [S173] 단일값 모드 감지 — baseParams로 1회 BT 실행
          //   _optLocked 잠금 + 단일값 정렬 결과로 baseParams가 이미 모든 값 보유
          console.log('[S173] 단일값 모드 감지 — 1회 BT 실행');
          toast('📐 단일값 BT 실행 중...');

          // 메모리 캔들 맵 구성
          const _svCandleCache = {};
          let _svCacheHit = 0, _svCacheMiss = 0;
          for(const code of codes){
            for(const tf of tfs){
              const _c = _loadCachedCandle(code, tf);
              _svCandleCache[`${code}_${tf}`] = _c;
              if(_c && _c.length > 0) _svCacheHit++;
              else _svCacheMiss++;
            }
          }
          // [S173-log] 캔들 캐시 상태 로그
          console.log(`[S173] 캔들 캐시: ${_svCacheHit}건 히트 / ${_svCacheMiss}건 미스 (총 ${codes.length}종목 × ${tfs.length}TF)`);
          if(_svCacheHit === 0){
            console.error('[S173] ❌ 캔들 캐시 0건 — BT 불가능. "캔들 갱신" 먼저 실행 필요');
            toast('❌ 캔들 캐시 없음 — 먼저 캔들 갱신');
            break;
          }

          const _svResOff = {}, _svResOn = {};
          const _svParams = { ...baseParams, ..._optLocked };
          const _svBtP = {
            buyTh: _svParams.buyTh > 0 ? _svParams.buyTh : 62,
            sellTh: _svParams.sellTh > 0 ? _svParams.sellTh : 38,
            tpMult: _svParams.tpMult > 0 ? _svParams.tpMult : 2.5,
            slMult: _svParams.slMult > 0 ? _svParams.slMult : 1.5
          };
          // [S173-log] 사용 파라미터 로그
          console.log(`[S173] BT 파라미터: ${JSON.stringify(_svBtP)}`);
          console.log(`[S173] 전체 파라미터: ${JSON.stringify(_svParams)}`);
          console.log(`[S173] 레짐 모드: ${_optRegimeMode}, 정렬 모드: ${_optSortMode}`);

          // 레짐 OFF
          if(_optRegimeMode !== 'on'){
            console.log('[S173] 레짐 OFF BT 시작');
            SXE.setRegimeAdapt(false);
            for(const tf of tfs){
              if(_cancelled) break;
              _svResOff[tf] = [];
              const _svValid = codes.filter(c => _svCandleCache[`${c}_${tf}`]);
              if(_svValid.length === 0){
                console.warn(`[S173] [${tf}] 캔들 있는 종목 0개 — 스킵`);
                continue;
              }
              console.log(`[S173] [${tf}] BT 시작 — ${_svValid.length}종목`);
              // [S179-fix] sPF 추가 — PF 평균 산출
              let sW=0, sP=0, sT=0, sM=0, sPF=0, vc=0, _zeroTrades=0, _errors=0;
              for(const code of _svValid){
                try{
                  const fullRows = _svCandleCache[`${code}_${tf}`];
                  let r = sxRunBtEngine(fullRows, tf, _svBtP, {slippage:0.001, nextBarEntry:false, applyRegimeAdjust:true});
                  if(_optPerTradeFilter && r && r.trades) r = _optFilterBtResult(r);
                  if(r && r.error){ _errors++; continue; }
                  if(!r || r.totalTrades < 1){ _zeroTrades++; continue; }
                  sW += r.winRate; sP += r.totalPnl; sT += r.totalTrades; sM += (r.mdd||0);
                  // [S179-fix] PF 합산 — 99(∞) 클램핑 (한 종목 0손절이 평균을 왜곡하지 않게)
                  sPF += Math.min(r.profitFactor || 0, 10);
                  vc++;
                }catch(e){ console.warn(`[S173] BT 예외 ${code}:`, e.message); _errors++; }
              }
              console.log(`[S173] [${tf}] BT 종료 — 유효 ${vc}종목 / 거래 0회 ${_zeroTrades}종목 / 에러 ${_errors}종목`);
              if(vc > 0){
                const _entry = {
                  params: {..._svParams},
                  bt: { winRate: sW/vc, totalPnl: sP/vc, totalTrades: Math.round(sT/vc), mdd: parseFloat((sM/vc).toFixed(2)), profitFactor: parseFloat((sPF/vc).toFixed(2)), error: null },
                  _stockCount: vc
                };
                _svResOff[tf].push(_entry);
                console.log(`[S173] [${tf}] OFF 결과: 승률 ${_entry.bt.winRate.toFixed(1)}%, 수익 ${_entry.bt.totalPnl.toFixed(2)}%, 거래 ${_entry.bt.totalTrades}회, MDD ${_entry.bt.mdd}%, PF ${_entry.bt.profitFactor}`);
              } else {
                console.warn(`[S173] [${tf}] OFF 유효 결과 없음 — 거래수 부족 또는 필터 차단`);
              }
            }
          }
          // 레짐 ON
          if(_optRegimeMode !== 'off'){
            console.log('[S173] 레짐 ON BT 시작');
            SXE.setRegimeAdapt(true);
            for(const tf of tfs){
              if(_cancelled) break;
              _svResOn[tf] = [];
              const _svValid = codes.filter(c => _svCandleCache[`${c}_${tf}`]);
              if(_svValid.length === 0){
                console.warn(`[S173] [${tf}] (ON) 캔들 있는 종목 0개 — 스킵`);
                continue;
              }
              // [S179-fix] sPF 추가
              let sW=0, sP=0, sT=0, sM=0, sPF=0, vc=0, _zeroTrades=0, _errors=0;
              for(const code of _svValid){
                try{
                  const fullRows = _svCandleCache[`${code}_${tf}`];
                  let r = sxRunBtEngine(fullRows, tf, _svBtP, {slippage:0.001, nextBarEntry:false, applyRegimeAdjust:true});
                  if(_optPerTradeFilter && r && r.trades) r = _optFilterBtResult(r);
                  if(r && r.error){ _errors++; continue; }
                  if(!r || r.totalTrades < 1){ _zeroTrades++; continue; }
                  sW += r.winRate; sP += r.totalPnl; sT += r.totalTrades; sM += (r.mdd||0);
                  sPF += Math.min(r.profitFactor || 0, 10); // [S179-fix] PF 합산
                  vc++;
                }catch(e){ console.warn(`[S173] BT 예외 (ON) ${code}:`, e.message); _errors++; }
              }
              console.log(`[S173] [${tf}] (ON) BT 종료 — 유효 ${vc}종목 / 거래 0회 ${_zeroTrades}종목 / 에러 ${_errors}종목`);
              if(vc > 0){
                const _entry = {
                  params: {..._svParams},
                  bt: { winRate: sW/vc, totalPnl: sP/vc, totalTrades: Math.round(sT/vc), mdd: parseFloat((sM/vc).toFixed(2)), profitFactor: parseFloat((sPF/vc).toFixed(2)), error: null },
                  _stockCount: vc
                };
                _svResOn[tf].push(_entry);
                console.log(`[S173] [${tf}] ON 결과: 승률 ${_entry.bt.winRate.toFixed(1)}%, 수익 ${_entry.bt.totalPnl.toFixed(2)}%, 거래 ${_entry.bt.totalTrades}회, MDD ${_entry.bt.mdd}%, PF ${_entry.bt.profitFactor}`);
              } else {
                console.warn(`[S173] [${tf}] ON 유효 결과 없음`);
              }
            }
          }

          // 최고기록 등록 — 진짜 함수 _updateOptBest 사용 (시그니처에 맞게 score 포함)
          console.log(`[S173] 최고기록 등록 시작 — 시장=${_optMarket}, 정렬모드=${_optSortMode}`);
          try {
            let _addedCount = 0, _skippedCount = 0;
            const _addBestFromRes = (res, regime) => {
              for(const tf in res){
                const arr = res[tf]; if(!arr || !arr.length){
                  console.log(`[S173] [${tf}] ${regime} 결과 없음 — 등록 스킵`);
                  continue;
                }
                // 단일값 모드는 결과 1개씩이라 첫 항목만 등록
                const item = arr[0];
                if(!item || !item.bt){ _skippedCount++; continue; }
                const score = _optSortScore(item.bt, _optSortMode);
                const _added = _updateOptBest(_optMarket, tf, _optSortMode, regime, {
                  params: {...item.params},
                  score,
                  winRate: item.bt.winRate,
                  totalPnl: item.bt.totalPnl,
                  totalTrades: item.bt.totalTrades,
                  mdd: item.bt.mdd,
                  profitFactor: item.bt.profitFactor || 0, // [S179] PF 저장
                  tfs: [tf],
                  code: codes.join(','),
                  ts: Date.now(),
                  filter: _optPerTradeFilter ? { minWin: _optMinWinPnl, maxLoss: _optMaxLossPnl } : null
                });
                if(_added){
                  _addedCount++;
                  console.log(`[S173] ✅ 최고기록 등록: [${tf}] ${regime} score=${score.toFixed(2)}`);
                } else {
                  _skippedCount++;
                  console.log(`[S173] ⏭ 최고기록 스킵: [${tf}] ${regime} score=${score.toFixed(2)} (기존 점수보다 낮음)`);
                }
              }
            };
            _addBestFromRes(_svResOff, 'OFF');
            _addBestFromRes(_svResOn, 'ON');
            console.log(`[S173] 최고기록 등록 완료 — 추가 ${_addedCount}건, 스킵 ${_skippedCount}건`);
            // 최고기록 카드 즉시 갱신
            if(typeof _optRenderBestCards === 'function'){
              _optRenderBestCards();
              console.log('[S173] _optRenderBestCards 호출 완료');
            } else {
              console.warn('[S173] _optRenderBestCards 함수 없음');
            }
          } catch(e){ console.error('[S173] 최고기록 등록 예외:', e.message, e.stack); }

          // 결과 저장 (랭킹 표시용)
          lastTfResultsOff = _svResOff;
          lastTfResultsOn = _svResOn;

          const _svTotalTrades = Object.values(_svResOff).flat().concat(Object.values(_svResOn).flat())
            .reduce((s, x) => s + (x?.bt?.totalTrades || 0), 0);
          console.log(`[S173] 단일값 BT 완료 — 평균 거래 ${_svTotalTrades}건`);
          toast(`✅ 단일값 BT 완료 (거래 ${_svTotalTrades}건)`);
          break; // 단일값 모드는 1회 BT로 종료
        } else {
          // 사용자 회차에서 unlocked=0 → 정상 break (탐색 완료)
          toast('모든 파라미터가 잠겨 있습니다');
          break;
        }
      }

      // S91: 회차 시작 시 상태 표시 초기화 (워밍업 제외한 사용자 2회차부터)
      // S102: round>0이면 이전 회차의 상태 아이콘 초기화 (워밍업→1회차 전환 시에도 초기화)
      if(round > 0){
        unlocked.forEach(k => {
          const s = document.getElementById('optStatus_'+k);
          if(s){ s.textContent = ''; }
        });
      }

      const totalSteps = unlocked.length;

      for(let si = 0; si < unlocked.length; si++){
        if(_cancelled) break;
        const paramKey = unlocked[si];
        const paramLabel = {atrLen:'ATR기간',bbMult:'BB배수',tpMult:'TP배수',slMult:'SL배수',rsiLen:'RSI기간',buyTh:'BUY임계',sellTh:'SELL임계',bbLen:'BB기간',maShort:'MA단기',maMid:'MA중기',maLong:'MA장기'}[paramKey]||paramKey;

        // ═══════════════════════════════════════════════════════════
        // S113-e/f: 동반자 탐색 — 현재 Step이 동반자 자신이면 스킵
        //   동반자 활성화 조건:
        //     (1) _companionKey 존재 (체크됨)
        //     (2) 현재 paramKey가 동반자 자신이 아님 (자기 Step은 스킵)
        //   예: 동반자=TP면 TP Step 스킵
        //       동반자=BUY면 BUY Step 스킵
        //   동반자 포함 시:
        //     ranges에서 _companionKey도 enabled=true
        //     combos가 2D 곱 조합으로 생성됨
        //     최적 조합의 (paramKey 값 + companionKey 값) 둘 다 baseParams 반영
        //     단, companionKey는 다음 Step에서도 계속 탐색 대상이므로 고정 표시 X
        // ═══════════════════════════════════════════════════════════
        const useCompanion = _companionKey && (paramKey !== _companionKey);
        const companionLabel = useCompanion ? `+${({atrLen:'ATR',bbMult:'BB×',tpMult:'TP',slMult:'SL',rsiLen:'RSI',buyTh:'BUY',sellTh:'SELL',bbLen:'BB',maShort:'MA단',maMid:'MA중',maLong:'MA장'}[_companionKey]||_companionKey)}` : '';

        // 진행 표시
        // S102: 워밍업은 회차번호 숨김, 사용자 회차는 [round/repeatCount회] 표시
        const roundLabel = isWarmup ? '[워밍업]' : `[${round}/${repeatCount}회]`;
        progText.textContent = `${roundLabel} ${paramLabel}${companionLabel} 탐색 중... (${si+1}/${totalSteps})`;
        // S102: 진행률 계산 — 총 totalRounds 회 기준, 현재 round는 0부터 시작
        progFill.style.width = (round/totalRounds*100 + (si/totalSteps)*(100/totalRounds)).toFixed(1)+'%';

        // S91: 파라미터 행 상태 표시 — 탐색중
        const statusEl = document.getElementById('optStatus_'+paramKey);
        if(statusEl){ statusEl.textContent = '🔍'; statusEl.style.color = 'var(--accent,#2563eb)'; }
        // S113-e: 동반자 파라미터도 탐색중 표시
        if(useCompanion){
          const compStatusEl = document.getElementById('optStatus_'+_companionKey);
          if(compStatusEl){ compStatusEl.textContent = '🔗'; compStatusEl.style.color = 'var(--accent,#2563eb)'; }
        }

        // 이 파라미터만 활성화해서 범위 구성
        // S101: step 강제 최소값 제거 → step=0 보존
        // S113-e: 동반자 활성화 시 _companionKey도 enabled → 2D 그리드 생성
        const ranges = {};
        _OPT_PARAM_ORDER.forEach(k => {
          // S113-e: 현재 탐색 파라미터 OR 동반자이면 enabled
          const enabled = (k === paramKey) || (useCompanion && k === _companionKey);
          // S114: 프리셋 파라미터 — 선택된 값 배열 사용
          if(OPT_PRESET_KEYS.includes(k)){
            const selValues = _optGetPresetValues(k);
            if(selValues && selValues.length > 0){
              ranges[k] = {
                min: selValues[0],
                max: selValues[selValues.length-1],
                step: 0,
                enabled,
                values: selValues  // 이산 값 배열 (프리셋)
              };
            } else {
              ranges[k] = { min: OPT_DEFAULTS[k].min, max: OPT_DEFAULTS[k].max, step: 0, enabled: false };
            }
            return;
          }
          // 범위 파라미터 (BUY/BB/BB×/TP/SL)
          const isFloat = ['bbMult','tpMult','slMult'].includes(k);
          const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
          const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
          const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
          ranges[k] = { min, max, step: Math.max(step, 0), enabled };
        });

        const combos = _generateCombinations(ranges);
        // ═══════════════════════════════════════════════════════════
        // [S174] 탐색 진단 로그 — 실제로 어떤 값들이 BT에 들어가는지 확인용
        //   사용자 의심 (예: "SL 0.5~2.0 입력했는데 결과는 항상 1로 고정")
        //   → 이 로그로 SL 후보가 [0.5, 0.6, 0.7, ..., 2.0]로 정상 생성됐는지 즉시 검증
        // ═══════════════════════════════════════════════════════════
        try {
          const _r = ranges[paramKey];
          const _values = combos.map(c => c[paramKey]).filter(v => v !== undefined);
          const _uniqueVals = [...new Set(_values)].sort((a,b) => a-b);
          const _companion = useCompanion ? `, 동반자=${_companionKey}` : '';
          console.log(`[S174] 🔍 [${paramLabel}] 탐색 시작 — min=${_r.min}, max=${_r.max}, step=${_r.step}${_companion}`);
          console.log(`[S174] 🔍 [${paramLabel}] 후보 값(${_uniqueVals.length}개): [${_uniqueVals.slice(0, 30).join(', ')}${_uniqueVals.length > 30 ? '...' : ''}]`);
          console.log(`[S174] 🔍 [${paramLabel}] 총 조합 수: ${combos.length}`);
        } catch(e){ console.warn('[S174] 진단 로그 오류:', e.message); }

        if(combos.length <= 1){
          // S98: 범위 1개(고정값)면 탐색 불필요 — baseParams에 값 반영
          const fixedVal = ranges[paramKey].min;
          baseParams[paramKey] = fixedVal;
          if(statusEl){ statusEl.textContent = '—'; statusEl.style.color = 'var(--text3,#999)'; }
          progText.textContent = `${roundLabel} ${paramLabel} — 고정 ${fixedVal}, 스킵`;
          // [S174] 스킵 사유 로그
          console.log(`[S174] ⏭ [${paramLabel}] 스킵 — 조합 ${combos.length}개 (고정값 ${fixedVal})`);
          await _sleep(300);
          continue;
        }

        // S91: 파라미터 전환 시 UI 갱신 대기
        await _sleep(50);

        // 메모리 캔들 맵
        const candleCache = {};
        for(const code of codes){
          for(const tf of tfs){
            candleCache[`${code}_${tf}`] = _loadCachedCandle(code, tf);
          }
        }

        const tfResOff = {}, tfResOn = {};
        let done = 0;
        const total = combos.length * tfs.length * (_optRegimeMode==='both'?2:1) * codes.length;

        // 레짐 OFF
        if(_optRegimeMode !== 'on'){
          SXE.setRegimeAdapt(false);
          for(const tf of tfs){
            if(_cancelled) break;
            tfResOff[tf] = [];
            // [BUGFIX] 일부 종목만 누락된 경우에도 done 보정 (진행률 100% 보장)
            const validCodes = [];
            for(const code of codes){
              if(candleCache[`${code}_${tf}`]) validCodes.push(code);
              else done += combos.length;
            }
            if(validCodes.length === 0){ continue; }
            // S115: 파라미터별 BT 봉수 계산 (동반자면 max 사용)
            const _targetBars = useCompanion
              ? _optGetCombinedBars(paramKey, _companionKey)
              : _optGetParamBars(paramKey);
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,sPF=0,vc=0; // [S179-fix] sPF 추가
              for(const code of validCodes){
                // S115: 파라미터별 봉수 슬라이스 — rows 길이가 충분하면 잘라서 BT 가속
                const fullRows = candleCache[`${code}_${tf}`];
                const slicedRows = (fullRows && fullRows.length > _targetBars) ? fullRows.slice(-_targetBars) : fullRows;
                try{ let r=sxRunBtEngine(slicedRows,tf,btP,{slippage:0.001,nextBarEntry:false,applyRegimeAdjust:true}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);sPF+=Math.min(r.profitFactor||0,10);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOff[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),profitFactor:parseFloat((sPF/vc).toFixed(2)),error:null},_stockCount:vc});
              if(done%5===0){ progText.textContent=`${roundLabel} ${paramLabel} [OFF][${tf}] ${done}/${total} [${_targetBars}봉]`; await _sleep(0); }
            }
          }
        }

        // 레짐 ON
        if(_optRegimeMode !== 'off'){
          SXE.setRegimeAdapt(true);
          for(const tf of tfs){
            if(_cancelled) break;
            tfResOn[tf] = [];
            // [BUGFIX] 일부 종목만 누락된 경우에도 done 보정
            const validCodes = [];
            for(const code of codes){
              if(candleCache[`${code}_${tf}`]) validCodes.push(code);
              else done += combos.length;
            }
            if(validCodes.length === 0){ continue; }
            // S115: 파라미터별 BT 봉수 계산 (동반자면 max 사용)
            const _targetBars = useCompanion
              ? _optGetCombinedBars(paramKey, _companionKey)
              : _optGetParamBars(paramKey);
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,sPF=0,vc=0; // [S179-fix] sPF 추가
              for(const code of validCodes){
                // S115: 파라미터별 봉수 슬라이스
                const fullRows = candleCache[`${code}_${tf}`];
                const slicedRows = (fullRows && fullRows.length > _targetBars) ? fullRows.slice(-_targetBars) : fullRows;
                try{ let r=sxRunBtEngine(slicedRows,tf,btP,{slippage:0.001,nextBarEntry:false,applyRegimeAdjust:true}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);sPF+=Math.min(r.profitFactor||0,10);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOn[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),profitFactor:parseFloat((sPF/vc).toFixed(2)),error:null},_stockCount:vc});
              if(done%5===0){ progText.textContent=`${roundLabel} ${paramLabel} [ON][${tf}] ${done}/${total} [${_targetBars}봉]`; await _sleep(0); }
            }
          }
        }

        // 이 파라미터의 최적값 추출 (TOP1)
        const merged = [];
        const addM = (res, regime) => { if(!res) return; Object.entries(res).forEach(([tf2,arr])=>{ if(Array.isArray(arr)) arr.filter(r=>r.bt&&r.bt.totalTrades>=_optMinTrades&&r.bt.winRate>=_optMinWinRate).forEach(r=>merged.push({...r,regime,tf:tf2})); }); };
        addM(tfResOff, 'OFF'); addM(tfResOn, 'ON');
        // [S174] 필터 통과 결과 진단 로그
        try {
          const _allResults = [];
          [tfResOff, tfResOn].forEach((res, idx) => {
            const reg = idx === 0 ? 'OFF' : 'ON';
            if(!res) return;
            Object.entries(res).forEach(([tf2, arr]) => {
              if(!Array.isArray(arr)) return;
              arr.forEach(r => {
                if(r.bt) _allResults.push({ val: r.params[paramKey], wr: r.bt.winRate, pnl: r.bt.totalPnl, trades: r.bt.totalTrades, reg, tf: tf2 });
              });
            });
          });
          const _passCount = merged.length;
          const _totalCount = _allResults.length;
          console.log(`[S174] 📊 [${paramLabel}] BT 결과: ${_totalCount}건 중 필터 통과 ${_passCount}건 (최소거래 ${_optMinTrades} / 최소승률 ${_optMinWinRate}%)`);
          if(_passCount === 0 && _totalCount > 0){
            // 필터로 다 걸러진 경우 — 가장 좋은 후보를 그냥 보여주기 (디버깅용)
            const sample = _allResults.slice(0, 5).map(r => `${paramKey}=${r.val} wr=${r.wr.toFixed(0)}% trades=${r.trades}`).join(' | ');
            console.warn(`[S174] ⚠️ 필터로 모두 차단됨 — 샘플: ${sample}`);
          }
        } catch(e){ console.warn('[S174] 결과 진단 로그 오류:', e.message); }

        if(merged.length > 0){
          merged.sort((a,b) => _optSortCompare(b.bt, a.bt, _optSortMode));
          const best = merged[0];
          const bestVal = best.params[paramKey];
          if(bestVal !== undefined){
            baseParams[paramKey] = bestVal;
            // [S174] 베스트 선정 결과 로그
            console.log(`[S174] 🏆 [${paramLabel}] 베스트 = ${bestVal} (승률 ${best.bt.winRate.toFixed(1)}%, 수익 ${best.bt.totalPnl.toFixed(2)}%, 거래 ${best.bt.totalTrades}회, ${best.regime})`);
            // 마지막 회차에서만 잠금
            if(round === repeatCount){
              _optLocked[paramKey] = bestVal;
              _optRenderParamRow(paramKey);
            }
            // S91: 완료 표시 — ✅ + 최적값
            if(statusEl){ statusEl.textContent = `✅${bestVal}`; statusEl.style.color = 'var(--buy,#27ae60)'; }
          }
          // ═══════════════════════════════════════════════════════════
          // S113-e: 동반자 값도 baseParams에 반영 (2D 탐색 결과)
          //   단, 동반자는 다음 Step에서도 계속 재탐색되므로:
          //     - baseParams만 갱신 (현재 최적값 기록)
          //     - _optLocked에는 넣지 않음 (계속 탐색 대상)
          //     - 상태 표시는 🔗(현재 재탐색중) 유지 → 마지막 Step에서 ✅
          // ═══════════════════════════════════════════════════════════
          if(useCompanion){
            const companionVal = best.params[_companionKey];
            if(companionVal !== undefined){
              baseParams[_companionKey] = companionVal;
              const compStatusEl = document.getElementById('optStatus_'+_companionKey);
              if(compStatusEl){
                // 마지막 Step이면 ✅ (최종 확정), 아니면 🔗(재탐색 중)
                const isLastStep = (si === unlocked.length - 1);
                if(isLastStep && round === repeatCount){
                  compStatusEl.textContent = `✅${companionVal}`;
                  compStatusEl.style.color = 'var(--buy,#27ae60)';
                  // 마지막 회차 + 마지막 Step이면 동반자도 잠금
                  _optLocked[_companionKey] = companionVal;
                  _optRenderParamRow(_companionKey);
                } else {
                  compStatusEl.textContent = `🔗${companionVal}`;
                  compStatusEl.style.color = 'var(--accent,#2563eb)';
                }
              }
            }
          }
          // S91: 파라미터 완료마다 최고갱신 카드 업데이트
          if(best.bt){
            const score = _optSortScore(best.bt, _optSortMode);
            const tf = best.tf || (tfs.length>0?tfs[0]:'day');
            const regime = best.regime || 'OFF';
            // S99-5: 유효 TF 목록 수집 (결과가 있는 TF만)
            const _validTfs = tfs.filter(t => {
              const offOk = tfResOff[t] && tfResOff[t].length > 0;
              const onOk = tfResOn[t] && tfResOn[t].length > 0;
              return offOk || onOk;
            });
            _updateOptBest(_optMarket, tf, _optSortMode, regime, {
              params:{...baseParams, ..._optLocked},
              score, winRate:best.bt.winRate, totalPnl:best.bt.totalPnl,
              totalTrades:best.bt.totalTrades, mdd:best.bt.mdd,
              profitFactor: best.bt.profitFactor || 0, // [S179] PF 저장
              tfs: _validTfs, code:codes.join(','), ts:Date.now(),
              filter: _optPerTradeFilter ? {minWin:_optMinWinPnl, maxLoss:_optMaxLossPnl} : null
            });
            _optRenderBestCards();
          }
        } else {
          // 유효 결과 없음
          if(statusEl){ statusEl.textContent = '⚠️'; statusEl.style.color = 'var(--sell,#e74c3c)'; }
        }

        lastTfResultsOff = tfResOff;
        lastTfResultsOn = tfResOn;
        // S91: 파라미터 완료 후 잠시 대기 (결과 확인용)
        await _sleep(100);
      } // end param loop

      // 회차 중간에는 리스트 표시 안 함 (최고기록 카드만 실시간)
      // S102: 워밍업 종료 시 "워밍업 완료 — 1회차 시작", 사용자 회차는 기존 포맷
      if(round < repeatCount && !_cancelled){
        if(isWarmup){
          toast(`🏃 워밍업 완료 — 1회차 시작...`);
        } else {
          toast(`${round}회차 완료 — ${round+1}회차 시작...`);
        }
      }
    } // end round loop
  } catch(e){
    toast('최적화 오류: '+e.message);
  } finally {
    // [PATCH-10] 에러/정상 모든 경로에서 반드시 복원 수행 — _running 플래그 stuck 방지
    try { _saveAnalParams({...origParams, ...baseParams, ..._optLocked}); } catch(_){}
    try { SXE.setRegimeAdapt(origRegime); } catch(_){}
    try { if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI(); } catch(_){}
    try { if(typeof updateAnalParamBadge === 'function') updateAnalParamBadge(); } catch(_){}

    _running = false;
    try {
      cancelBtn.style.display='none'; prog.style.display='none';
      runBtn.style.display='block';
      _optRenderLockedBar();
      _optUpdateCount();
      _optRenderBestCards();
    } catch(_){}

    // S113: 스톱워치 정리 (cleanup 헬퍼 사용)
    try { if(typeof window._optCleanupStopwatch === 'function') window._optCleanupStopwatch(); } catch(_){}
  }

  // 복원 완료 후 UI 출력 (finally 바깥) — _elapsedStr 계산은 여기서
  const _elapsedSec = Math.floor((Date.now() - _optStartTime) / 1000);
  const _elapsedM = Math.floor(_elapsedSec / 60);
  const _elapsedS = _elapsedSec % 60;
  const _elapsedStr = `⏱ ${_elapsedM}:${String(_elapsedS).padStart(2,'0')}`;

  // S91: 완료 후 마지막 파라미터의 1~10 리스트 표시
  if(lastTfResultsOff || lastTfResultsOn){
    _renderDualResults(lastTfResultsOff||{}, lastTfResultsOn||{}, codes.join('+'), null, null);
  }

  if(_cancelled){
    progText.style.display='block';
    progText.textContent = `논스톱 중지됨 (${_elapsedStr})`;
    toast('최적화 중지됨');
  } else {
    progText.style.display='block';
    const rc = parseInt(document.getElementById('optRepeatCount')?.value||'1');
    progText.textContent = `✅ 논스톱 ${rc}회 완료 (${_elapsedStr})`;
    toast(`✅ 논스톱 ${rc}회 최적화 완료 (${_elapsedStr})`);
  }
}
function _optUpdateMinTrades(){
  _optVib(10);
  const chk = document.getElementById('optMinTradesToggle');
  _optMinTrades = (chk && chk.checked) ? 10 : 3;
  toast(`거래수 최소 ${_optMinTrades}건 필터 ${_optMinTrades>=10?'ON':'OFF'}`);
}

// S86: 최소 승률 토글
function _optUpdateMinWinRate(){
  _optVib(10);
  const chk = document.getElementById('optMinWinRateToggle');
  _optMinWinRate = (chk && chk.checked) ? 60 : 0;
  toast(`승률 ${_optMinWinRate>0?_optMinWinRate+'% 미만 필터 ON':'필터 OFF'}`);
}

// S97: 건별 수익/손실 필터 토글
function _optUpdatePerTradeFilter(){
  _optVib(10);
  const chk = document.getElementById('optPerTradeToggle');
  _optPerTradeFilter = chk ? chk.checked : false;
  if(_optPerTradeFilter){
    const minW = document.getElementById('optMinWinPnl');
    const maxL = document.getElementById('optMaxLossPnl');
    _optMinWinPnl = minW ? parseFloat(minW.value) || 2 : 2;
    _optMaxLossPnl = maxL ? parseFloat(maxL.value) || 20 : 20;
    toast(`건별 필터 ON — 익절 최소 ${_optMinWinPnl}% · 손절 최대 ${_optMaxLossPnl}%`);
  } else {
    _optMinWinPnl = 0;
    _optMaxLossPnl = 999;
    toast('건별 필터 OFF');
  }
}

// ── S86: 캔들 캐시 UI 함수 ──
function _optUpdateCandleStatus(){
  const el = document.getElementById('optCandleStatus');
  if(!el) return;
  const {cached, total} = _getCandleCacheStatus();
  if(total === 0){ el.textContent = '📦 캔들 캐시: 종목/TF 선택 필요'; return; }
  if(cached === total){
    el.innerHTML = `📦 캔들 캐시: <b style="color:var(--buy,#27ae60)">${cached}/${total}</b> 준비완료`;
  } else {
    el.innerHTML = `📦 캔들 캐시: <b>${cached}/${total}</b> (미캐시 ${total-cached}개)`;
  }
}

// 캔들 수동 갱신 (전체 삭제 후 프리로드)
async function _optRefreshCandles(){
  _optVib(20);
  const stocks = _getOptStocks(_optMarket);
  const selCodes = _optSelectedCodes.length > 0 ? _optSelectedCodes : stocks.map(s=>s.code);
  const tfs = _getSelectedTFs();
  if(selCodes.length === 0 || tfs.length === 0){ toast('종목과 TF를 선택하세요'); return; }

  const isCoin = _optMarket === 'coin';
  const total = selCodes.length * tfs.length;
  let done = 0;

  // 선택된 종목+TF 캐시 삭제
  for(const code of selCodes){
    for(const tf of tfs){
      const mk = `${code}_${tf}`;
      delete _memCandleCache[mk];
      try { localStorage.removeItem(_candleCacheKey(code, tf)); } catch(_){}
    }
  }

  const statusEl = document.getElementById('optCandleStatus');
  const runBtn = document.getElementById('optRunBtn');
  if(runBtn) runBtn.disabled = true;

  // ════════════════════════════════════════════════════════════
  // [S169-fix2] currentMarket 임시 동기화
  //   문제: 옵티마이저에서 시장 전환(_optMarket) 시 글로벌 currentMarket은 안 바뀜
  //         → fetchCandles/fetchCandlesExtended/btFetchCandles가 currentMarket 참조
  //         → 메인 'kr' + 옵티마이저 'us'면 미국 티커를 네이버로 호출 → 실패
  //   해결: _optMarket으로 currentMarket 임시 전환, 끝나면 복원 (try-finally 보장)
  //   참고: sx_bt.js 1709~1737의 S162-fix와 동일 패턴
  // ════════════════════════════════════════════════════════════
  const _origCurMarket = (typeof currentMarket !== 'undefined') ? currentMarket : null;
  let _marketSwitched = false;
  try {
    if(typeof currentMarket !== 'undefined' && _origCurMarket !== _optMarket){
      try {
        currentMarket = _optMarket;
        _marketSwitched = true;
        console.log(`[S169-fix2] _optRefreshCandles: currentMarket 임시 전환 ${_origCurMarket} → ${_optMarket}`);
      } catch(_){}
    }

    for(const code of selCodes){
      for(const tf of tfs){
        if(statusEl) statusEl.innerHTML = `🔄 캔들 수집 중... ${done}/${total} (${code} ${tf})`;
        // S113: 600봉 확장 수집 (KV 양방향 공유)
        //   _fetchExtCandles로 경로 A/B/C 자동 분기
        //   → 일봉: 200→400→600 3단계 (KV 블록 3개 저장)
        //   → 주봉/월봉: 400봉
        //   [S168] 해외도 600봉 (period1/period2 분할 호출)
        try {
          // [S169-fix2] _optMarket 직접 사용 (currentMarket 의존 제거)
          const stock = { code, market: _optMarket };
          const r = await _fetchExtCandles(stock, tf, false);
          if(r.ok && r.rows && r.rows.length > 0){
            _saveCachedCandle(code, tf, r.rows);
          }
        } catch(e){ console.warn('[S113-opt] 수동 갱신 예외:', e); }
        done++;
      }
    }
  } finally {
    // currentMarket 원복 (예외 발생해도 보장)
    if(_marketSwitched && typeof currentMarket !== 'undefined' && _origCurMarket != null){
      try {
        currentMarket = _origCurMarket;
        console.log(`[S169-fix2] _optRefreshCandles: currentMarket 원복 → ${_origCurMarket}`);
      } catch(_){}
    }
    if(runBtn) runBtn.disabled = false;
  }

  _optUpdateCandleStatus();
  toast(`✅ ${done}개 캔들 갱신 완료`);
}

// 최적화 실행 전 캔들 프리로드 (캐시에 없는 것만 API 호출)
// S113: 600봉 확장 수집 (KV 양방향 공유)
async function _optPreloadCandles(codes, tfs, isCoin, progText){
  const toFetch = [];
  for(const code of codes){
    for(const tf of tfs){
      if(!_loadCachedCandle(code, tf)) toFetch.push({code, tf});
    }
  }
  if(toFetch.length === 0) return; // 전부 캐시에 있음

  // ════════════════════════════════════════════════════════════
  // [S169-fix2] currentMarket 임시 동기화 (_optRefreshCandles와 동일)
  //   _optRunNonstop에서 호출되며, isCoin 파라미터를 _optMarket 기반 판정에 사용
  //   _optMarket을 currentMarket에 임시 적용하여 fetchCandles 등이 올바른 시장 인식
  // ════════════════════════════════════════════════════════════
  const _origCurMarket = (typeof currentMarket !== 'undefined') ? currentMarket : null;
  let _marketSwitched = false;
  try {
    if(typeof currentMarket !== 'undefined' && _origCurMarket !== _optMarket){
      try {
        currentMarket = _optMarket;
        _marketSwitched = true;
        console.log(`[S169-fix2] _optPreloadCandles: currentMarket 임시 전환 ${_origCurMarket} → ${_optMarket}`);
      } catch(_){}
    }

    for(let i=0; i<toFetch.length; i++){
      const {code, tf} = toFetch[i];
      if(progText) progText.textContent = `캔들 수집 ${i+1}/${toFetch.length} (${code} ${tf}, 최대 600봉)...`;
      // S113: _fetchExtCandles로 경로 A/B/C 자동 분기
      //   → 일봉: 200→400→600 3단계 (2초 대기 포함)
      //   → 주봉/월봉: 400봉
      //   [S168] 해외도 600봉 (period1/period2 분할 호출)
      try {
        // [S169-fix2] _optMarket 직접 사용 (currentMarket 의존 제거)
        const stock = { code, market: _optMarket };
        const r = await _fetchExtCandles(stock, tf, false);
        if(r.ok && r.rows && r.rows.length > 0){
          _saveCachedCandle(code, tf, r.rows);
        }
      } catch(e){ console.warn('[S113-opt] 프리로드 예외:', e); }
      await _sleep(0);
    }
  } finally {
    if(_marketSwitched && typeof currentMarket !== 'undefined' && _origCurMarket != null){
      try {
        currentMarket = _origCurMarket;
        console.log(`[S169-fix2] _optPreloadCandles: currentMarket 원복 → ${_origCurMarket}`);
      } catch(_){}
    }
  }
}

// ════════════════════════════════════════════════════════════
//  2차 정밀 탐색: TOP5 기준 범위 축소
// ════════════════════════════════════════════════════════════
function _calcNarrowRanges(tfResOff, tfResOn, origRanges){
  // 모든 TF의 TOP5를 합쳐서 파라미터 min/max 추출
  const allTop = [];
  const collect = (tfRes) => {
    for(const results of Object.values(tfRes)){
      if(!Array.isArray(results)) continue;
      const sorted = results.filter(r=>r.bt && r.bt.totalTrades>=_optMinTrades && r.bt.winRate>=_optMinWinRate)
        .sort((a,b)=>{
          const sa = (a.bt.winRate/100)*a.bt.totalPnl*Math.log(a.bt.totalTrades+1)*(1-(a.bt.mdd||0)/100);
          const sb = (b.bt.winRate/100)*b.bt.totalPnl*Math.log(b.bt.totalTrades+1)*(1-(b.bt.mdd||0)/100);
          return sb-sa;
        });
      allTop.push(...sorted.slice(0,5));
    }
  };
  collect(tfResOff);
  collect(tfResOn);

  if(allTop.length < 2) return null; // 데이터 부족

  const narrow = {};
  const floatKeys = new Set(['bbMult','tpMult','slMult']);
  for(const[k, orig] of Object.entries(origRanges)){
    if(!orig.enabled) continue;
    const vals = allTop.map(r=>r.params[k]).filter(v=>v!=null);
    if(vals.length===0) continue;
    const vMin = Math.min(...vals);
    const vMax = Math.max(...vals);
    const isFloat = floatKeys.has(k);
    // 범위: TOP5의 min~max ± step 1단계 여유
    const margin = isFloat ? Math.max(orig.step, 0.1) : Math.max(orig.step, 1);
    const nMin = isFloat ? Math.max(orig.min, parseFloat((vMin - margin).toFixed(1))) : Math.max(orig.min, Math.round(vMin - margin));
    const nMax = isFloat ? Math.min(orig.max, parseFloat((vMax + margin).toFixed(1))) : Math.min(orig.max, Math.round(vMax + margin));
    // step: 원래의 절반 (최소 1 또는 0.1)
    const nStep = isFloat ? Math.max(0.1, parseFloat((orig.step / 2).toFixed(1))) : Math.max(1, Math.floor(orig.step / 2));
    narrow[k] = { min:nMin, max:nMax, step:nStep, enabled:true };
  }

  if(Object.keys(narrow).length === 0) return null;
  return narrow;
}

async function _runRound2(ranges, code, isCoin, tfs, origParams, origRegime, runBtn, cancelBtn, prog, progFill, progText){
  // S86: 하위호환 — 단일 종목이면 배열로 감싸서 Multi에 위임
  return _runRound2Multi(ranges, [code], isCoin, tfs, origParams, origRegime, runBtn, cancelBtn, prog, progFill, progText);
}

// S86: 복수 종목 2차 정밀 탐색
async function _runRound2Multi(ranges, codes, isCoin, tfs, origParams, origRegime, runBtn, cancelBtn, prog, progFill, progText){
  const combos = _generateCombinations(ranges);
  if(combos.length === 0) return null;
  const total = combos.length * tfs.length * (_optRegimeMode==='both'?2:1) * codes.length; // [BUGFIX] 'both'일 때만 ×2 (off/on 단일 모드는 ×1)

  _running = true;
  _cancelled = false;
  runBtn.style.display='none'; cancelBtn.style.display='block';
  prog.style.display='block'; progText.style.display='block';
  progFill.style.width='0%';

  const candleCache = {};
  const tfResOff = {}, tfResOn = {};
  let done = 0;

  // S86: 캐시에서 캔들 로드 (이미 프리로드 완료 상태)
  for(const code of codes){
    for(const tf of tfs){
      const mk = `${code}_${tf}`;
      candleCache[mk] = _loadCachedCandle(code, tf);
    }
  }

  try {
    // 레짐 OFF
    if(_optRegimeMode !== 'on'){
    SXE.setRegimeAdapt(false);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResOff[tf] = [];
      const codeRows = {};
      for(const code of codes){
        const ck = `${code}_${tf}`;
        if(candleCache[ck]) codeRows[code]=candleCache[ck];
        else done+=combos.length;
      }
      const validCodes = Object.keys(codeRows);
      // [BUGFIX] 위에서 누락분 이미 더해짐 → 여기서 또 더하지 않도록
      if(validCodes.length===0){ continue; }
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        let sumWR=0,sumPnl=0,sumTr=0,sumMdd=0,vc=0;
        for(const code of validCodes){
          try { let r=sxRunBtEngine(codeRows[code],tf,btP,{slippage:0.001,nextBarEntry:false,applyRegimeAdjust:true}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
          done++;
        }
        if(vc>0) tfResOff[tf].push({params:{...testParams},bt:{winRate:sumWR/vc,totalPnl:sumPnl/vc,totalTrades:Math.round(sumTr/vc),mdd:parseFloat((sumMdd/vc).toFixed(2)),error:null},_stockCount:vc});
        if(done%5===0||ci===combos.length-1){ progFill.style.width=(done/total*100).toFixed(1)+'%'; progText.textContent=`[2차 OFF] [${tf}] ${done}/${total}`; await _sleep(0); }
      }
    }
    } // end 2차 OFF
    // 레짐 ON
    if(_optRegimeMode !== 'off'){
    SXE.setRegimeAdapt(true);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResOn[tf] = [];
      // [BUGFIX] 라운드1 OFF와 일관성: 일부 종목만 누락된 경우에도 done 보정
      const validCodes = [];
      for(const code of codes){
        if(candleCache[`${code}_${tf}`]) validCodes.push(code);
        else done += combos.length;
      }
      if(validCodes.length===0){ continue; }
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        let sumWR=0,sumPnl=0,sumTr=0,sumMdd=0,vc=0;
        for(const code of validCodes){
          try { let r=sxRunBtEngine(candleCache[`${code}_${tf}`],tf,btP,{slippage:0.001,nextBarEntry:false,applyRegimeAdjust:true}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
          done++;
        }
        if(vc>0) tfResOn[tf].push({params:{...testParams},bt:{winRate:sumWR/vc,totalPnl:sumPnl/vc,totalTrades:Math.round(sumTr/vc),mdd:parseFloat((sumMdd/vc).toFixed(2)),error:null},_stockCount:vc});
        if(done%5===0||ci===combos.length-1){ progFill.style.width=(done/total*100).toFixed(1)+'%'; progText.textContent=`[2차 ON] [${tf}] ${done}/${total}`; await _sleep(0); }
      }
    }
    } // end 2차 ON
  } catch(e){ toast('2차 탐색 오류: '+e.message); }

  _saveAnalParams(origParams);
  SXE.setRegimeAdapt(origRegime);
  _running = false;
  cancelBtn.style.display='none'; prog.style.display='none'; progText.style.display='none';
  runBtn.style.display='block';

  if(_cancelled){ toast('2차 탐색 중지됨'); return null; }
  return { off:tfResOff, on:tfResOn };
}

// ════════════════════════════════════════════════════════════
//  결과 렌더링
// ════════════════════════════════════════════════════════════
// S77: 통합 순위 — 카드 선택 + 버튼 1줄(카드 위)
let _optResultList = [];
let _optSelectedIdx = 0;
// S86: raw 결과 보관 (모드 전환 시 재정렬용)
let _optRawOff = null, _optRawOn = null, _optRawCode = '', _optRawR2Off = null, _optRawR2On = null;

function _renderDualResults(tfResultsOff, tfResultsOn, code, r2Off, r2On){
  // raw 보관
  _optRawOff = tfResultsOff; _optRawOn = tfResultsOn; _optRawCode = code;
  _optRawR2Off = r2Off; _optRawR2On = r2On;
  _rebuildResultCards();
}

function _rebuildResultCards(){
  const area = document.getElementById('optResultArea');
  if(!area) return;
  // S100: UI 숨김 — 내부 로직만 유지 (결과 리스트는 최고기록 카드로 대체)
  area.style.display='none';
  _lastTopParams = null;
  _optResultList = [];
  _optSelectedIdx = 0;

  const tfLabels = {};
  if(typeof TF_MAP !== 'undefined'){
    const market = _optMarket || 'kr';
    (TF_MAP[market]||[]).forEach(t=>{ tfLabels[t.k]=t.l; });
  }

  let html = '';

  // 1차
  html += _buildMergedCards(_optRawOff, _optRawOn, tfLabels, _optRawCode, '');
  // 2차
  if(_optRawR2Off && _optRawR2On){
    html += `<div style="border-top:4px double var(--buy,#27ae60);margin:20px 0"></div>`;
    html += `<div style="background:rgba(39,174,96,0.08);border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:14px;font-weight:700;color:var(--buy,#27ae60);text-align:center">🎯 2차 정밀 탐색</div>`;
    html += _buildMergedCards(_optRawR2Off, _optRawR2On, tfLabels, _optRawCode, '2차');
  }

  if(_optResultList.length > 0) _lastTopParams = {..._optResultList[0].params};
  area.innerHTML = html;
}

function _optSetMode(mode){
  if(mode === _optSortMode) return;
  _optVib(10);
  // S103-fix4: 잠금 있으면 confirm 뜨므로 setTimeout 양보, 없으면 즉시 처리
  if(Object.keys(_optLocked).length > 0){
    setTimeout(()=>_optSetModeCore(mode, true), 30);
  } else {
    _optSetModeCore(mode, false);
  }
}
function _optSetModeCore(mode, needsConfirm){
  if(needsConfirm){
    if(!confirm('모드를 전환하면 고정된 파라미터가 모두 해제됩니다.\n계속하시겠습니까?')) return;
    // 잠금 전체 해제
    Object.keys(_optLocked).forEach(k => {
      delete _optLocked[k];
      _optRenderParamRow(k);
    });
    _optRenderLockedBar();
    // 분석 파라미터도 원래대로
    if(typeof _loadAnalParams === 'function'){
      const orig = _loadAnalParams();
      // locked 제거된 상태로 저장
      Object.keys(OPT_DEFAULTS).forEach(k => { delete orig[k]; });
    }
  }
  _optSortMode = mode;
  _optCustomWeights = null; // 커스텀 리셋
  _optRenderModeGate();
  // 기존 결과가 있으면 재정렬
  if(_optRawOff) _rebuildResultCards();
  _optRenderBestCards(); // S100: 모드 변경 시 최고기록 카드 버튼 문구 동기화
  const mLabels = {profit:'🔥 수익형', balanced:'⚖️ 안정형', safe:'🛡️ 보수형'};
  toast(`${mLabels[mode]} 모드 선택`);
}

// S86: 모드 게이트 렌더
function _optRenderModeGate(){
  const gate = document.getElementById('optModeGate');
  const desc = document.getElementById('optModeDesc');
  if(!gate) return;
  const _wDesc = (m) => {
    const w = _OPT_MODE_WEIGHTS[m];
    return `수익${w.pnl}% 거래${w.trades}% MDD${w.mdd}% 승률${w.wr}%`;
  };
  const modeDescs = {
    profit: _wDesc('profit'),
    balanced: _wDesc('balanced'),
    safe: _wDesc('safe')
  };
  gate.innerHTML = Object.entries(_OPT_MODES).map(([k,v])=>{
    const act = k===_optSortMode ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#f0f0f0);color:var(--text2,#666)';
    return `<div style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;${act}" onclick="_optSetMode('${k}')">${v.label}</div>`;
  }).join('');
  if(desc) desc.innerHTML = (modeDescs[_optSortMode]||'') + ' <span style="color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optToggleWeightArea()">커스텀</span>';
}

// S90: 레짐 게이트 렌더
function _optRenderRegimeGate(){
  const gate = document.getElementById('optRegimeGate');
  if(!gate) return;
  const opts = [
    {k:'off',  label:'⚡ OFF'},
    {k:'on',   label:'⚡ ON'}
  ];
  gate.innerHTML = opts.map(o=>{
    const act = o.k===_optRegimeMode ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#f0f0f0);color:var(--text2,#666)';
    return `<div style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;${act}" onclick="_optSetRegime('${o.k}')">${o.label}</div>`;
  }).join('');
}
function _optSetRegime(mode){
  _optVib(10);
  _optRegimeMode = mode;
  _optRenderRegimeGate();
  _optUpdateCount();
}

// S90: 커스텀 가중치 슬라이더 동기화
const OPT_WEIGHTS_KEY = 'SX_OPT_WEIGHTS'; // 가중치 로컬 저장 키
const OPT_TIEBREAK_KEY = 'SX_OPT_TIEBREAK'; // S98: 타이브레이커 로컬 저장 키

function _optLoadWeights(){
  try{ const d=JSON.parse(localStorage.getItem(OPT_WEIGHTS_KEY)); if(d) return d; }catch(_){}
  return null;
}
function _optSaveWeightsLocal(d){ try { localStorage.setItem(OPT_WEIGHTS_KEY, JSON.stringify(d)); } catch(_){} }
function _optLoadTiebreak(){
  try{ const d=JSON.parse(localStorage.getItem(OPT_TIEBREAK_KEY)); if(d) return d; }catch(_){}
  return null;
}
function _optSaveTiebreakLocal(d){ try { localStorage.setItem(OPT_TIEBREAK_KEY, JSON.stringify(d)); } catch(_){} }

// 적용 버튼 — 가중치 + 타이브레이커 입력값 읽어서 로컬 저장
function _optApplyWeights(){
  _optVib(15);
  const modes = ['profit','balanced','safe'];
  const keys = ['pnl','trades','mdd','wr'];
  // ── 가중치 검증 ──
  const saved = {};
  let allValid = true;
  modes.forEach(m => {
    const w = {};
    keys.forEach(k => { w[k] = parseInt(document.getElementById(`optCW_${m}_${k}`)?.value||0); });
    const sum = keys.reduce((s,k)=>s+w[k], 0);
    const sumEl = document.getElementById(`optCWS_${m}`);
    if(sumEl) sumEl.innerHTML = sum===100 ? `<span style="color:var(--buy)">${sum}</span>` : `<span style="color:var(--sell)">${sum}⚠️</span>`;
    if(sum !== 100) allValid = false;
    saved[m] = w;
  });
  if(!allValid){ toast('가중치 합계가 100%가 아닌 모드가 있습니다'); return; }
  // ── 타이브레이커 검증 ──
  const savedTB = {};
  let tbValid = true;
  modes.forEach(m => {
    const tb = {};
    keys.forEach(k => { tb[k] = parseInt(document.getElementById(`optTB_${m}_${k}`)?.value||0); });
    const vals = Object.values(tb).sort().join(',');
    if(vals !== '1,2,3,4'){ tbValid = false; }
    savedTB[m] = tb;
  });
  if(!tbValid){ toast('타이브레이커 순위는 1~4 중복 없이 입력하세요'); return; }
  // ── 반영 + 저장 ──
  modes.forEach(m => { Object.assign(_OPT_MODE_WEIGHTS[m], saved[m]); });
  modes.forEach(m => { Object.assign(_OPT_MODE_TIEBREAK[m], savedTB[m]); });
  _optCustomWeights = null;
  _optSaveWeightsLocal(saved);
  _optSaveTiebreakLocal(savedTB);
  _optRenderModeGate();
  toast('✅ 가중치 + 타이브레이커 저장됨');
}

// 초기화 — 기본값 복원 (가중치 + 타이브레이커)
// [S169] 사진3 기준 — 거래수↔승률 비중/순위 swap
//   수익 45/5/15/35, 안정 35/5/15/45, 보수 15/5/45/35
function _optResetWeights(){
  _optVib(15);
  const defaults = {
    profit:   { pnl:45, trades:5, mdd:15, wr:35 },
    balanced: { pnl:35, trades:5, mdd:15, wr:45 },
    safe:     { pnl:15, trades:5, mdd:45, wr:35 }
  };
  Object.keys(defaults).forEach(m => { Object.assign(_OPT_MODE_WEIGHTS[m], defaults[m]); });
  Object.keys(_OPT_MODE_TIEBREAK_DEFAULTS).forEach(m => { Object.assign(_OPT_MODE_TIEBREAK[m], _OPT_MODE_TIEBREAK_DEFAULTS[m]); });
  try { localStorage.removeItem(OPT_WEIGHTS_KEY); } catch(_){}
  try { localStorage.removeItem(OPT_TIEBREAK_KEY); } catch(_){}
  _optCustomWeights = null;
  _optLoadWeightInputs();
  _optRenderModeGate();
  toast('가중치 + 타이브레이커 초기화됨');
}

// 입력칸에 현재 값 로드 (가중치 + 타이브레이커)
function _optLoadWeightInputs(){
  ['profit','balanced','safe'].forEach(m => {
    const w = _OPT_MODE_WEIGHTS[m];
    ['pnl','trades','mdd','wr'].forEach(k => {
      const el = document.getElementById(`optCW_${m}_${k}`);
      if(el) el.value = w[k]||0;
    });
    const sum = ['pnl','trades','mdd','wr'].reduce((s,k)=>s+(w[k]||0), 0);
    const sumEl = document.getElementById(`optCWS_${m}`);
    if(sumEl) sumEl.textContent = sum;
    // 타이브레이커
    const tb = _OPT_MODE_TIEBREAK[m];
    ['pnl','trades','mdd','wr'].forEach(k => {
      const el = document.getElementById(`optTB_${m}_${k}`);
      if(el) el.value = tb[k]||0;
    });
  });
}

// ════════════════════════════════════════════════════════════
// [S169] 파라미터 범위 변경 자동 저장 핸들러
//   사용자가 min/max/step 입력 변경 → OPT_DEFAULTS 갱신 + localStorage 저장
//   호출: <input onchange="_optOnRangeInputChange('${k}')">
// ════════════════════════════════════════════════════════════
function _optOnRangeInputChange(k){
  if(!OPT_DEFAULTS[k]) return;
  const isFloat = ['bbMult','tpMult','slMult'].includes(k);
  const minEl = document.getElementById('optMin_'+k);
  const maxEl = document.getElementById('optMax_'+k);
  const stepEl = document.getElementById('optStep_'+k);
  if(!minEl || !maxEl || !stepEl) return;
  const minV = isFloat ? parseFloat(minEl.value) : parseInt(minEl.value);
  const maxV = isFloat ? parseFloat(maxEl.value) : parseInt(maxEl.value);
  const stepV = isFloat ? parseFloat(stepEl.value) : parseInt(stepEl.value);
  if(!isNaN(minV)) OPT_DEFAULTS[k].min = minV;
  if(!isNaN(maxV)) OPT_DEFAULTS[k].max = maxV;
  if(!isNaN(stepV) && stepV >= 0) OPT_DEFAULTS[k].step = stepV;
  _optSaveRanges();
}
window._optOnRangeInputChange = _optOnRangeInputChange;

// ════════════════════════════════════════════════════════════
// [S169] 최소값 정렬 — 모든 파라미터 max를 min으로 통일 (단일값 BT)
//   상단에 보이는 11개 파라미터의 min값으로 자동 정렬
//   결과: 모두 단일값 → 1회 BT 실행 (수동탐색용)
// ════════════════════════════════════════════════════════════
function _optMinValueAlign(){
  _optVib(15);
  // [S173-log] 진단 로그 — 어떤 값들로 정렬됐는지 확인
  console.log('[S173] 📐 최소값 정렬 시작');
  const _alignedValues = {};
  Object.keys(OPT_DEFAULTS).forEach(k => {
    // 현재 input의 min값을 읽어서 max도 같은 값으로 설정
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const minEl = document.getElementById('optMin_'+k);
    const maxEl = document.getElementById('optMax_'+k);
    const stepEl = document.getElementById('optStep_'+k);
    if(!minEl || !maxEl){
      console.warn(`[S173] 📐 ${k}: input 요소 없음 (스킵)`);
      return;
    }
    const curMin = isFloat ? parseFloat(minEl.value) : parseInt(minEl.value);
    if(isNaN(curMin)){
      console.warn(`[S173] 📐 ${k}: min값 파싱 실패 (${minEl.value})`);
      return;
    }
    // max = min, step = 0 (단일값)
    maxEl.value = curMin;
    if(stepEl) stepEl.value = 0;
    OPT_DEFAULTS[k].max = curMin;
    OPT_DEFAULTS[k].step = 0;
    _alignedValues[k] = curMin;
  });
  _optSaveRanges();
  console.log('[S173] 📐 정렬 완료 — 11개 파라미터 단일값:', JSON.stringify(_alignedValues));
  toast('✓ 최소값 정렬 완료 (11개 파라미터 단일값)');
}
window._optMinValueAlign = _optMinValueAlign;

// ════════════════════════════════════════════════════════════
// [S169 → S175 deprecated] 결과보기 — 더 이상 UI에서 호출 안 됨
//   이유: "최소값 정렬 → 최적화 실행" 워크플로와 중복
//   호환성: window._optShowMinValueResult 호출 시 동일 동작 유지
//   향후: 외부 호출처 없음 확인되면 제거 가능
// ════════════════════════════════════════════════════════════
async function _optShowMinValueResult(){
  _optVib(20);
  // [S173-log] 진단 로그
  console.log('[S173] ▶ 결과보기 (deprecated, S175 이후 UI 제거됨)');
  console.log(`[S173] 현재 시장: ${_optMarket}, 선택종목: ${(_optSelectedCodes||[]).length}개`);
  // 1) 최소값 정렬 자동 적용
  _optMinValueAlign();
  // 2) 짧은 대기 후 최적화 실행 (DOM 안정화)
  await new Promise(r => setTimeout(r, 100));
  // 3) _optRunNonstop 실행 (단일값이라 1회 BT로 끝남)
  if(typeof _optRunNonstop === 'function'){
    console.log('[S173] ▶ _optRunNonstop 호출');
    _optRunNonstop();
  } else {
    console.error('[S173] ❌ _optRunNonstop 함수 없음');
    toast('❌ 최적화 실행 함수 미로드');
  }
}
window._optShowMinValueResult = _optShowMinValueResult;

// 커스텀 영역 토글
function _optToggleWeightArea(){
  _optVib(8);
  const area = document.getElementById('optWeightArea');
  if(!area) return;
  if(area.style.display === 'none'){
    area.style.display = 'block';
    _optLoadWeightInputs(); // 가중치 + 타이브레이커 둘 다 로드
  } else {
    area.style.display = 'none';
  }
}

// 앱 시작 시 로컬에서 가중치 복원
// 앱 시작 시 로컬에서 가중치 + 타이브레이커 복원
// [S169] 마이그레이션: 사진3 새 기본값 적용
//   기존 사용자가 옛 비율(거래수↑/승률↓)을 갖고 있으면 새 기본값(승률↑/거래수↓)으로 자동 전환
//   조건: localStorage 버전 마커가 'S169' 이전이면 마이그레이션
const OPT_WEIGHTS_VER_KEY = 'SX_OPT_WEIGHTS_VER';
const OPT_WEIGHTS_VER_CURRENT = 'S169';
function _optInitWeights(){
  // [S169] 버전 체크 — 옛 버전이면 가중치/타이브레이커 로컬 캐시 무효화
  let _ver = null;
  try { _ver = localStorage.getItem(OPT_WEIGHTS_VER_KEY); } catch(_){}
  if(_ver !== OPT_WEIGHTS_VER_CURRENT){
    // 옛 가중치 캐시 제거 → 사진3 기준 새 기본값 사용
    try { localStorage.removeItem(OPT_WEIGHTS_KEY); } catch(_){}
    try { localStorage.removeItem(OPT_TIEBREAK_KEY); } catch(_){}
    try { localStorage.setItem(OPT_WEIGHTS_VER_KEY, OPT_WEIGHTS_VER_CURRENT); } catch(_){}
    console.log('[S169] 가중치 마이그레이션: 거래수↔승률 swap 적용 (사진3 기준)');
  }

  const saved = _optLoadWeights();
  if(saved){
    ['profit','balanced','safe'].forEach(m => {
      if(saved[m]) Object.assign(_OPT_MODE_WEIGHTS[m], saved[m]);
    });
  }
  const savedTB = _optLoadTiebreak();
  if(savedTB){
    ['profit','balanced','safe'].forEach(m => {
      if(savedTB[m]) Object.assign(_OPT_MODE_TIEBREAK[m], savedTB[m]);
    });
  }
}
_optInitWeights(); // 즉시 실행

function _buildMergedCards(tfResOff, tfResOn, tfLabels, code, label){
  let html = '';
  const allTfs = new Set([...Object.keys(tfResOff||{}), ...Object.keys(tfResOn||{})]);
  for(const tf of allTfs){
    const tfLabel = tfLabels[tf] || tf;
    html += `<div class="opt-tf-header">📊 ${tfLabel}${label?' ('+label+')':''}</div>`;
    const merged = [];
    const add = (res, regime) => {
      if(!res||!Array.isArray(res)) return;
      if(res.length===1&&res[0].error) return;
      res.filter(r=>r.bt&&r.bt.totalTrades>=_optMinTrades&&r.bt.winRate>=_optMinWinRate).forEach(r=>merged.push({params:r.params,bt:r.bt,regime,tf,code,_stockCount:r._stockCount}));
    };
    add((tfResOff||{})[tf], 'OFF');
    add((tfResOn||{})[tf], 'ON');
    if(!merged.length){ html+=`<div class="opt-result-card"><div style="color:var(--text3);font-size:11px">유효한 결과 없음</div></div>`; continue; }
    merged.sort((a,b)=> _optSortCompare(b.bt, a.bt, _optSortMode));
    const top = merged.slice(0,10);

    // 액션 버튼 (카드 위) — 현재 모드 표시
    const _mIcon = {profit:'🔥',balanced:'⚖️',safe:'🛡️'};
    const _mName = {profit:'수익형',balanced:'안정형',safe:'보수형'};
    html += `<div id="optActionBar" style="display:flex;gap:6px;margin-bottom:6px">
      <button class="opt-btn opt-btn-primary" style="flex:1;padding:8px;font-size:11px" onclick="_optApplySelected()">${_mIcon[_optSortMode]||''} ${_mName[_optSortMode]||''} 고정 적용</button>
    </div>`;

    top.forEach((r,i)=>{
      const gi = _optResultList.length;
      _optResultList.push(r);
      const p=r.params, b=r.bt;
      const sel = gi===_optSelectedIdx;
      const rankClass = i===0?'r1':i<=2?'r2':'r3';
      const borderStyle = sel ? 'border:2px solid var(--accent,#2563eb);box-shadow:0 0 0 2px rgba(37,99,235,0.15)' : '';
      const paramStr = `RSI${p.rsiLen} BB${p.bbLen}×${p.bbMult} ATR${p.atrLen}${p.maShort?' MA'+p.maShort+'/':''}${p.maMid?p.maMid+'/':''}${p.maLong||''}${p.buyTh>0?' B'+p.buyTh:''}${p.sellTh>0?' S'+p.sellTh:''}${p.tpMult>0?' TP'+p.tpMult:''}${p.slMult>0?' SL'+p.slMult:''}`;
      const pnlColor = b.totalPnl>=0?'var(--buy,#27ae60)':'var(--sell,#e74c3c)';
      // S86: 복수종목 평균 표시
      const stockTag = (r._stockCount && r._stockCount > 1) ? `<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(39,174,96,0.1);color:var(--buy,#27ae60);margin-left:4px">${r._stockCount}종목avg</span>` : '';
      // S91: 수익률 기반 표시 + 종합점수 참고용
      const cardScore = _optSortScore(b, _optSortMode).toFixed(1);
      const regTag = r.regime==='ON'
        ? '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(37,99,235,0.1);color:var(--accent,#2563eb);font-weight:600;margin-left:6px">⚡ON</span>'
        : '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:var(--surface2,#eee);color:var(--text3,#999);font-weight:600;margin-left:6px">⚡OFF</span>';
      html += `<div class="opt-result-card" id="optCard_${gi}" onclick="_optSelectCard(${gi})" style="cursor:pointer;${borderStyle}">
        <div style="display:flex;align-items:center"><span class="opt-rank ${rankClass}">${i+1}</span><span style="font-size:12px;font-weight:700">TOP ${i+1}</span>${regTag}${stockTag}<span style="margin-left:auto;font-size:11px;font-weight:700;color:var(--accent,#2563eb)">${cardScore}pt</span></div>
        <div class="opt-result-params">${paramStr}</div>
        <div class="opt-result-stats">
          <div><div class="stat-val">${b.winRate.toFixed(1)}%</div><div class="stat-lbl">승률</div></div>
          <div><div class="stat-val" style="color:${pnlColor}">${b.totalPnl>=0?'+':''}${b.totalPnl.toFixed(1)}%</div><div class="stat-lbl">수익률</div></div>
          <div><div class="stat-val">${b.totalTrades}</div><div class="stat-lbl">거래수</div></div>
          <div><div class="stat-val">${b.mdd}%</div><div class="stat-lbl">MDD</div></div>
        </div>
      </div>`;
    });
    const _modeFormula = {profit:'수익률↑ > 거래수 > MDD↓ > 승률', balanced:'거래수↑ > 수익률 > MDD↓ > 승률', safe:'MDD↓ > 수익률 > 거래수 > 승률'};
    html += `<div style="font-size:9px;color:var(--text3,#999);text-align:center;margin-top:2px;margin-bottom:6px">정렬: 모드가중종합(10%대역) → ${_modeFormula[_optSortMode]||''}</div>`;
    if(merged.length>10) html+=`<div class="opt-info" style="text-align:center;margin-top:4px">전체: ${merged.length}개 (상위 10개)</div>`;
  }
  return html;
}

// 카드 선택
function _optSelectCard(idx){
  _optVib(10);
  // 이전 선택 해제
  const prev = document.getElementById('optCard_'+_optSelectedIdx);
  if(prev){ prev.style.border=''; prev.style.boxShadow=''; }
  _optSelectedIdx = idx;
  const cur = document.getElementById('optCard_'+idx);
  if(cur){ cur.style.border='2px solid var(--accent,#2563eb)'; cur.style.boxShadow='0 0 0 2px rgba(37,99,235,0.15)'; }
  // 선택된 파라미터 저장
  if(_optResultList[idx]) _lastTopParams = {..._optResultList[idx].params};
}

// 선택된 카드 → 고정 적용 (optimizer 내부 잠금만 — 설정탭 파라미터는 변경하지 않음)
function _optApplySelected(){
  _optVib(15);
  const r = _optResultList[_optSelectedIdx];
  if(!r){ toast('카드를 선택하세요'); return; }
  // S91: 잠금 안 된 모든 파라미터를 선택 카드 값으로 고정
  const p = r.params;
  let lockedCount = 0;
  Object.keys(OPT_DEFAULTS).forEach(k=>{
    if(!_optLocked.hasOwnProperty(k)){
      _optLocked[k] = p[k] !== undefined ? p[k] : OPT_DEFAULTS[k].min;
      _optRenderParamRow(k);
      lockedCount++;
    }
  });
  if(lockedCount === 0){ toast('모든 파라미터가 이미 잠겨 있습니다'); return; }
  _saveAnalParams({..._loadAnalParams(), ..._optLocked});
  if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  if(typeof updateAnalParamBadge === 'function') updateAnalParamBadge();
  // S90: 레짐 ON/OFF도 카드 기준으로 반영
  if(r.regime && typeof SXE !== 'undefined' && SXE.setRegimeAdapt){
    SXE.setRegimeAdapt(r.regime === 'ON');
    // 설정탭 토글 UI 동기화
    const regToggle = document.getElementById('regimeAdaptToggle');
    if(regToggle) regToggle.checked = (r.regime === 'ON');
  }
  _optRenderLockedBar();
  _optUpdateCount();
  // S99-5: V3 최고기록 자동 갱신
  if(r && r.bt){
    const score = _optSortScore(r.bt, _optSortMode);
    const selTfs = _getSelectedTFs();
    const tf = (r.tf) || (selTfs.length>0?selTfs[0]:'day');
    const regime = r.regime || 'OFF';
    const updated = _updateOptBest(_optMarket, tf, _optSortMode, regime, {
      params:{..._loadAnalParams(), ..._optLocked},
      score, winRate:r.bt.winRate, totalPnl:r.bt.totalPnl, totalTrades:r.bt.totalTrades, mdd:r.bt.mdd,
      profitFactor: r.bt.profitFactor || 0, // [S179] PF 저장
      tfs: selTfs, code:(_optSelectedCodes||[]).join(','), ts:Date.now(),
      filter: _optPerTradeFilter ? {minWin:_optMinWinPnl, maxLoss:_optMaxLossPnl} : null
    });
    if(updated) toast(`🏆 ${_OPT_MODES[_optSortMode]?.label||''} 최고기록 갱신!`);
    _optRenderBestCards();
  }
  toast(`✅ ${lockedCount}개 파라미터 고정됨`);
}

// 선택된 카드 → 프리셋 저장 (모드명 포함)
function _optSaveSelected(){
  const r = _optResultList[_optSelectedIdx];
  if(!r){ toast('카드를 선택하세요'); return; }
  const market = _optMarket || 'kr';
  const tfLabels = {};
  if(typeof TF_MAP !== 'undefined') (TF_MAP[market]||[]).forEach(t=>{ tfLabels[t.k]=t.l; });
  const tfLabel = tfLabels[r.tf] || r.tf || '';
  const modeNames = {profit:'수익형', balanced:'안정형', safe:'보수형'};
  const modeName = modeNames[_optSortMode] || '';
  const suffix = r.regime==='ON' ? '_ON' : '';
  const name = `${tfLabel}_${modeName}${suffix}`;
  const slots = _loadMarketSlots(market);
  if(slots.length >= SCR_ANAL_MAX_SLOTS){ toast('슬롯 가득참'); return; }
  const ok = _saveSlot(market, name, r.params, -1);
  if(ok){
    // S90: 레짐도 함께 반영
    if(r.regime && typeof SXE !== 'undefined' && SXE.setRegimeAdapt){
      SXE.setRegimeAdapt(r.regime === 'ON');
      const regToggle = document.getElementById('regimeAdaptToggle');
      if(regToggle) regToggle.checked = (r.regime === 'ON');
    }
    if(typeof updateParamMarketStatus==='function') updateParamMarketStatus();
    toast(`✅ "${name}" 저장됨 (레짐 ${r.regime||'OFF'})`);
  }
  else toast('저장 실패');
}

// ── 닫기 ──
function _closeOpt(){
  _optVib(8);
  const el = document.getElementById('optOverlay');
  if(el) el.remove();
}

// ═══════════════════════════════════════════
//  S77: 종목 검색 드롭다운 + 풀스크린 종목 탐색 + 칩 관리
// ═══════════════════════════════════════════

// 로컬 전종목 로드
function _optLoadAllStocks(){
  const m = _optMarket;
  let items = [];
  if(m==='kr'){
    ['ORACLE_KOSPI','ORACLE_KOSDAQ','ORACLE_ETF'].forEach(k=>{
      try{ const arr=JSON.parse(localStorage.getItem(k)||'[]'); items=items.concat(arr.map((s,i)=>({code:s.code||s.ticker||'',name:s.name||'',market:s.market||s.MKT_NM||'',rank:s.rank||i+1}))); }catch(_){}
    });
  } else if(m==='us'){
    ['ORACLE_US_SP500','ORACLE_US_NDX','ORACLE_US_DOW','ORACLE_US_ETF'].forEach(k=>{
      try{ const arr=JSON.parse(localStorage.getItem(k)||'[]'); items=items.concat(arr.map((s,i)=>({code:s.code||s.ticker||'',name:s.name||'',market:s.market||s.MKT_NM||'',rank:s.rank||i+1}))); }catch(_){}
    });
  } else {
    try{ const arr=JSON.parse(localStorage.getItem('ORACLE_COIN')||'[]'); items=arr.map((s,i)=>({code:s.code||s.ticker||'',name:s.name||'',market:s.market||s.MKT_NM||'',rank:s.rank||i+1})); }catch(_){}
  }
  const seen=new Set(); items=items.filter(s=>{if(seen.has(s.code))return false;seen.add(s.code);return true;});
  return items;
}

// 시장 전환
function _optSwitchMarket(m){
  _optVib(10);
  _optMarket = m;
  // 버튼 활성화
  document.querySelectorAll('.opt-mkt-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.opt-mkt-btn').forEach(b=>{ if(b.textContent.includes({kr:'국내',us:'해외',coin:'코인'}[m])) b.classList.add('active'); });
  // 라벨 업데이트
  const lbl = document.getElementById('optMarketLabel');
  if(lbl) lbl.textContent = _PARAM_MARKET_LABELS_SHORT[m];
  // TF 칩 재렌더 (시장별 TF 다름, KIS 연동 시 국내 30분봉 포함)
  const tfGrid = document.getElementById('optTfGrid');
  if(tfGrid){
    const tfs = (typeof TF_MAP !== 'undefined' && TF_MAP[m]) ? TF_MAP[m] : [{k:'day',l:'일봉'}];
    const _kisOn2 = typeof window!=='undefined' && window._kisEnabled;
    const _btSet2 = new Set(['day','week','month','240m','60m']);
    if(_kisOn2 && m==='kr') _btSet2.add('30m');
    const btTfs = tfs.filter(t=>_btSet2.has(t.k));
    tfGrid.innerHTML = btTfs.map(t=>`<div class="opt-tf-chip${t.k==='day'?' active':''}" data-tf="${t.k}" onclick="_optToggleTF(this)">${t.l}</div>`).join('');
  }
  // 칩 갱신 + S86: 전체 종목 자동 선택 (복수)
  const stocks = _getOptStocks(m);
  _optSelectedCodes = stocks.map(s => s.code);
  _optSelectedCode = _optSelectedCodes.length > 0 ? _optSelectedCodes[0] : '';
  _optRenderChips();
  // 입력창 초기화
  const inp = document.getElementById('optStockInput'); if(inp) inp.value='';
  const dd = document.getElementById('optStockDd'); if(dd) dd.style.display='none';
  // [S172] 시장 전환 시 세트 바도 함께 갱신 (핵심 버그 수정)
  //   기존 버그: 시장 전환해도 세트 바는 이전 시장의 세트가 그대로 표시됨
  //   원인: _optSwitchMarket에서 _renderStockSetBar() 호출 누락
  //   영향: 사용자가 "추가 안 되고 덮어쓰기"로 오인 — 실제로는 시장별로
  //        독립 저장되지만 화면 갱신 안 돼서 같은 세트로 보였음
  _renderStockSetBar();
  _optRenderBestCards();
}

// 드롭다운 검색
function _optOnStockInput(){
  const q = document.getElementById('optStockInput')?.value?.trim() || '';
  const dd = document.getElementById('optStockDd');
  if(!dd) return;
  if(q.length < 1){ dd.style.display='none'; return; }
  const pool = _optLoadAllStocks();
  if(!pool.length){ dd.style.display='none'; return; }
  const ql = q.toLowerCase();
  const matches = pool.filter(s=>
    s.code.toLowerCase().includes(ql) || (s.name && s.name.toLowerCase().includes(ql))
  ).slice(0, 10);
  if(!matches.length){
    dd.innerHTML = '<div class="sx-dd-item"><span class="sx-dd-name" style="color:var(--text3)">결과 없음</span></div>';
    dd.style.display = 'block'; return;
  }
  dd.innerHTML = matches.map(s =>
    `<div class="sx-dd-item" onclick="_optPickStock('${s.code}','${(s.name||'').replace(/'/g,"\\'")}')"><span class="sx-dd-code">${s.code}</span><span class="sx-dd-name">${s.name||''}</span><span class="sx-dd-mkt">${s.market||''}</span></div>`
  ).join('');
  dd.style.display = 'block';
}

function _optOnStockKey(e){
  if(e.key === 'Escape') { const dd=document.getElementById('optStockDd'); if(dd) dd.style.display='none'; }
  if(e.key === 'Enter') {
    const dd=document.getElementById('optStockDd'); if(dd) dd.style.display='none';
    const q = document.getElementById('optStockInput')?.value?.trim();
    if(q){
      const pool = _optLoadAllStocks();
      const ql = q.toLowerCase();
      const found = pool.find(s=>s.code===q || s.code.toLowerCase()===ql || (s.name && s.name.toLowerCase()===ql));
      if(found) _optPickStock(found.code, found.name);
      else toast('종목을 찾을 수 없습니다');
    }
  }
}

// ▼ 버튼 → 풀스크린 종목 탐색 패널
let _optAzItems = [];
function _optToggleAzPanel(){
  const existing = document.getElementById('optAzPanel');
  _optVib(existing ? 8 : 12); // S103-fix: 클릭 즉시 진동 (DOM 조회/생성 전)
  if(existing){ existing.remove(); return; }
  // S103-fix: 진동이 OS로 전달될 시간 확보 후 대량 DOM 구축
  setTimeout(_optOpenAzPanelCore, 20);
}
function _optOpenAzPanelCore(){
  _optAzItems = _optLoadAllStocks();
  const panel = document.createElement('div');
  panel.id = 'optAzPanel';
  panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:250;background:var(--bg,#fff);display:flex;flex-direction:column;padding:0';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;flex-shrink:0;border-bottom:1px solid var(--border,#e0e0e0)">
      <span style="font-size:14px;color:var(--text,#222);font-weight:700">종목 탐색 (${_PARAM_MARKET_LABELS_SHORT[_optMarket]})</span>
      <span style="font-size:18px;color:var(--text2,#666);cursor:pointer;padding:4px 8px" onclick="try{navigator.vibrate&&navigator.vibrate(8)}catch(_){};document.getElementById('optAzPanel').remove()">✕</span>
    </div>
    <div style="padding:8px 14px;flex-shrink:0">
      <input id="optAzSearch" type="text" placeholder="종목명 또는 코드 검색" autocomplete="off" autocorrect="off" spellcheck="false" oninput="_optFilterAz()" class="sx-stock-input" style="font-size:13px">
    </div>
    <div id="optAzCount" style="padding:0 14px 4px;font-size:10px;color:var(--text3,#999);flex-shrink:0">${_optAzItems.length}개 종목</div>
    <div id="optAzList" style="flex:1;overflow-y:auto;padding:0 14px 14px;-webkit-overflow-scrolling:touch"></div>
  `;
  document.body.appendChild(panel);
  history.pushState({view:'optAzPanel'}, '');
  _optRenderAzList(_optAzItems);
  setTimeout(()=>{ const si=document.getElementById('optAzSearch'); if(si) si.focus(); }, 100);
}

function _optFilterAz(){
  const q = (document.getElementById('optAzSearch')?.value||'').trim().toLowerCase();
  if(!q){ _optRenderAzList(_optAzItems); return; }
  const filtered = _optAzItems.filter(s=> s.code.toLowerCase().includes(q) || (s.name&&s.name.toLowerCase().includes(q)));
  _optRenderAzList(filtered);
}

function _optRenderAzList(items){
  const list = document.getElementById('optAzList');
  const countEl = document.getElementById('optAzCount');
  if(countEl) countEl.textContent = `${items.length}개 종목`;
  if(!list) return;
  if(!items.length){ list.innerHTML='<div style="padding:12px;text-align:center;font-size:11px;color:var(--text3,#999)">데이터 없음</div>'; return; }
  list.innerHTML = items.map(s=>
    `<div class="sx-dd-item" onclick="_optPickFromAz('${s.code}','${(s.name||'').replace(/'/g,"\\'")}')"><span class="sx-dd-code">${s.code}</span><span class="sx-dd-name">${s.name||''}</span><span class="sx-dd-mkt">${s.rank||''}위</span></div>`
  ).join('');
}

function _optPickFromAz(code, name){
  // 진동은 _optPickStock에서 처리 (체인 호출 중복 방지)
  document.getElementById('optAzPanel')?.remove();
  _optPickStock(code, name);
}

// 종목 선택 → 자동 저장 + 선택 + 칩 갱신
function _optPickStock(code, name){
  _optVib(10);
  const dd = document.getElementById('optStockDd'); if(dd) dd.style.display='none';
  const inp = document.getElementById('optStockInput'); if(inp) inp.value = '';
  const ok = _addOptStock(_optMarket, code, name || code);
  if(ok){
    // S86: 복수 선택에 추가
    if(!_optSelectedCodes.includes(code)) _optSelectedCodes.push(code);
    _optSelectedCode = _optSelectedCodes[0] || code;
    _optRenderChips();
    toast(`✅ ${name||code} 추가됨`);
  } else {
    // 이미 있으면 토글 선택
    const stocks = _getOptStocks(_optMarket);
    if(stocks.find(s=>s.code===code)){
      const idx = _optSelectedCodes.indexOf(code);
      if(idx >= 0) _optSelectedCodes.splice(idx, 1);
      else _optSelectedCodes.push(code);
      _optSelectedCode = _optSelectedCodes.length > 0 ? _optSelectedCodes[0] : '';
      _optRenderChips();
      toast(`${name||code} ${_optSelectedCodes.includes(code)?'선택':'해제'}됨`);
    } else {
      toast('최대 개수 초과');
    }
  }
}

// 칩 렌더링 — S86: 복수 선택 지원
function _optRenderChips(){
  const area = document.getElementById('optStockChips');
  const cntEl = document.getElementById('optStockCount');
  if(!area) return;
  const stocks = _getOptStocks(_optMarket);
  if(cntEl) cntEl.textContent = stocks.length;
  if(stocks.length === 0){
    area.innerHTML = '<span style="font-size:10px;color:var(--text3)">종목을 추가하세요</span>';
    return;
  }
  area.innerHTML = stocks.map(s => {
    const sel = _optSelectedCodes.includes(s.code) ? ' selected' : '';
    return `<span class="opt-chip${sel}" onclick="_optSelectChip('${s.code}')"><span class="chip-name">${s.name}</span> <span class="chip-code">${s.code}</span><span class="chip-x" onclick="event.stopPropagation();_optRemoveChip('${s.code}')">✕</span></span>`;
  }).join('');
}

// S86: 토글 방식 복수 선택
function _optSelectChip(code){
  _optVib(10);
  const idx = _optSelectedCodes.indexOf(code);
  if(idx >= 0){
    _optSelectedCodes.splice(idx, 1);
  } else {
    _optSelectedCodes.push(code);
  }
  // 하위호환: 첫번째 선택을 _optSelectedCode에
  _optSelectedCode = _optSelectedCodes.length > 0 ? _optSelectedCodes[0] : '';
  _optRenderChips();
  _optUpdateCount();
}

function _optRemoveChip(code){
  _optVib(15);
  _removeOptStock(_optMarket, code);
  // S86: 복수 배열에서도 제거
  _optSelectedCodes = _optSelectedCodes.filter(c => c !== code);
  if(_optSelectedCode === code){
    _optSelectedCode = _optSelectedCodes.length > 0 ? _optSelectedCodes[0] : '';
  }
  _optRenderChips();
  toast('삭제됨');
}

// ═══════════════════════════════════════════
//  S99-5 → S211: OPT_BEST V4 — 시장별 6cap + ★대표
//  구조: { market → { ranks: [max6], representId } }
//    market: 'kr' | 'us' | 'crypto'
//  ranks 각 항목: {id, market, tf, regime, mode (정렬가중치), params, score, winRate, totalPnl, totalTrades, mdd, code, ts, filter}
//
//  S211 변경: 기존 V3는 mode(profit/balanced/safe)별 버킷이었으나,
//             시장 기반 슬롯 시스템과의 일관성을 위해 market별 버킷으로 전환.
//             정렬 모드는 entry.mode에 메타데이터로만 보존 (어떤 가중치로 찾았는지 기록).
//
//  자동 정리: V3 키(SX_OPT_BEST3)는 sx_analysis_engine.js의 _runS211Migration()에서 삭제됨.
// ═══════════════════════════════════════════
const OPT_BEST_KEY_V4 = 'SX_OPT_BEST4'; // S211: market 기반
const OPT_BEST_KEY_V3 = 'SX_OPT_BEST3'; // 레거시 (mode 기반, 자동 삭제됨)
const OPT_BEST_KEY_V2 = 'SX_OPT_BEST2'; // 더 오래된 레거시
const OPT_BEST_MAX_RANKS = 6;

// S211: market 정규화 — currentMarket(coin) → 슬롯 키(crypto)
function _normMkt(m){ return m === 'coin' ? 'crypto' : (m || 'kr'); }

function _genOptId(){ return 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

function _loadOptBest(){ try{ return JSON.parse(localStorage.getItem(OPT_BEST_KEY_V4))||{}; }catch(_){ return {}; } }
function _saveOptBest(d){ try { localStorage.setItem(OPT_BEST_KEY_V4, JSON.stringify(d)); } catch(_){} }

// S211: V2/V3 → V4 마이그레이션은 수행하지 않음 (C안 — 깨끗이 시작)
//   엔진의 _runS211Migration()이 V3 키를 자동 삭제. 사용자는 옵티마이저 재실행 권장.
//   _migrateOptBestV2toV3 함수는 호출 안 됨 (V3 키 자체가 사라짐).

// V2→V3 마이그레이션 (S211: 비활성 — V3 키 자체가 자동 삭제되므로 마이그레이션 의미 없음)
//   기존 함수는 코드 보존 차원에서 남겨두되, 호출은 하지 않음.
function _migrateOptBestV2toV3(){
  // S211: no-op (옵티마이저 재실행으로 V4 채움)
  return;
}

// S211: 마이그레이션 호출 비활성 (C안)
// _migrateOptBestV2toV3();

// S211: 신규 entry 추가/갱신 — 시장 버킷 기준 6cap, score(정렬모드 가중치) 기준 관리
//   파라미터 'mode'는 정렬 가중치 의미만 가짐 (entry에 메타로 보존). 버킷 키는 market.
function _updateOptBest(market, tf, mode, regime, entry){
  const all = _loadOptBest();
  const mktKey = _normMkt(market);
  if(!all[mktKey]) all[mktKey] = { ranks:[], representId:null };
  const bucket = all[mktKey];

  // 동일 조건(tf+regime+mode) 기존 항목 찾기
  //   기존 V3에선 (market,tf,regime)이 unique key였지만, V4는 시장이 이미 버킷이라
  //   같은 시장 내 (tf, regime, mode) 조합이 unique key. mode가 다르면 별개 항목.
  const existIdx = bucket.ranks.findIndex(r => r.tf===tf && r.regime===regime && r.mode===mode);

  if(existIdx >= 0){
    // 기존 기록보다 같거나 높을 때만 갱신
    if(entry.score >= (bucket.ranks[existIdx].score||0)){
      bucket.ranks[existIdx] = { ...bucket.ranks[existIdx], ...entry, market: mktKey, tf, regime, mode };
    } else {
      return false;
    }
  } else {
    // 새 항목
    const newEntry = { id:_genOptId(), market: mktKey, tf, regime, mode, ...entry };
    if(bucket.ranks.length < OPT_BEST_MAX_RANKS){
      bucket.ranks.push(newEntry);
    } else {
      // 6개 꽉참 → 최하위보다 높으면 교체
      bucket.ranks.sort((a,b) => (b.score||0) - (a.score||0));
      const worst = bucket.ranks[bucket.ranks.length - 1];
      if(entry.score > (worst.score||0)){
        if(bucket.representId === worst.id) bucket.representId = null;
        bucket.ranks[bucket.ranks.length - 1] = newEntry;
      } else {
        return false;
      }
    }
  }

  // score 내림차순 정렬
  bucket.ranks.sort((a,b) => (b.score||0) - (a.score||0));
  _saveOptBest(all);
  return true;
}

function _optRenderBestCards(){
  const area = document.getElementById('optBestArea');
  if(!area) return;
  const all = _loadOptBest();

  // S211: 현재 표시 시장 — _optMarket(옵티마이저가 돌리는 시장)을 기본으로
  //   _optBestTabSwitch에서 _optBestViewMarket을 변경해 다른 시장 결과도 볼 수 있음
  if(typeof _optBestViewMarket === 'undefined' || !_optBestViewMarket){
    // 옵티마이저 시장 또는 현재 시장
    const seedMkt = (typeof _optMarket !== 'undefined' ? _optMarket : (typeof currentMarket !== 'undefined' ? currentMarket : 'kr'));
    _optBestViewMarket = _normMkt(seedMkt);
  }
  const curMkt = _optBestViewMarket;
  const mktNames = {kr:'국내', us:'해외', crypto:'코인'};
  const mktIcons = {kr:'🇰🇷', us:'🇺🇸', crypto:'🪙'};

  // 정렬모드(레거시) — 카드 안의 메타로만 표시
  const _clrLabel = mktIcons[curMkt] + ' ' + (mktNames[curMkt] || curMkt);
  let html=`<div style="display:flex;gap:6px;margin-bottom:6px">
    <span style="font-size:9px;color:var(--sell,#e74c3c);cursor:pointer;text-decoration:underline" onclick="_optClearBest()">${_clrLabel} 기록 초기화</span>
    <span style="font-size:9px;color:var(--text3,#999);cursor:pointer;text-decoration:underline" onclick="_optResetPreset()">${_clrLabel} 프리셋 초기화</span>
    <span style="flex:1"></span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optImportBest()">파일 불러오기</span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optExportBest()">파일 저장</span>
  </div>`;

  // S211: 탭은 시장별 (kr/us/crypto)
  const markets = ['kr','us','crypto'];
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};   // entry.mode 표시용
  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const _defLabels={rsiLen:'RSI',bbLen:'BB',bbMult:'BB×',atrLen:'ATR',maShort:'MA단',maMid:'MA중',maLong:'MA장',buyTh:'BUY',sellTh:'SELL',tpMult:'TP',slMult:'SL'};

  // TF 라벨 (전 시장 통합)
  const tfLabels={};
  if(typeof TF_MAP!=='undefined'){
    ['kr','us','coin'].forEach(mk=>{(TF_MAP[mk]||[]).forEach(t=>{tfLabels[t.k]=t.l;});});
  }

  let hasAny = false;
  // S211: 시장별 최고기록 (시장당 최대 6개)
  html += `<div style="font-size:11px;font-weight:700;color:var(--text,#222);margin-bottom:6px">🏆 최고기록 (시장별 최대 ${OPT_BEST_MAX_RANKS}개 · ★대표 = 분석/BT 적용)</div>`;
  // S211: 시장 탭
  html += `<div style="display:flex;gap:0;margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid var(--border,#e0e0e0)">`;
  markets.forEach(mkt=>{
    const act = mkt===curMkt;
    const bg = act ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#f0f0f0);color:var(--text2,#666)';
    const cnt = (all[mkt]&&all[mkt].ranks) ? all[mkt].ranks.length : 0;
    html += `<div style="flex:1;padding:6px 4px;font-size:10px;font-weight:600;cursor:pointer;text-align:center;${bg}" onclick="_optBestTabSwitch('${mkt}')">${mktIcons[mkt]} ${mktNames[mkt]} <span style="font-size:8px;opacity:.7">${cnt}/${OPT_BEST_MAX_RANKS}</span></div>`;
  });
  html += `</div>`;

  // 현재 시장 카드만 렌더
  const bucket = all[curMkt];
  if(bucket && bucket.ranks && bucket.ranks.length > 0){
    hasAny = true;
    const repId = bucket.representId;
    bucket.ranks.forEach((e, idx) => {
      if(!e||!e.params) return;
      const p = e.params;
      const parts = [];
      Object.keys(_defLabels).forEach(k=>{ if(p[k]!==undefined&&p[k]!==0) parts.push(`${_defLabels[k]}${p[k]}`); });
      const paramStr = parts.join(' ') || '기본값';
      const pnlColor = (e.totalPnl||0)>=0 ? 'var(--buy,#27ae60)' : 'var(--sell,#e74c3c)';
      const regTag = e.regime==='ON' ? '⚡ON' : '⚡OFF';
      // S211: entry.mode(정렬가중치) 메타 표시
      const modeTag = e.mode ? `<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:var(--surface,#fff);color:var(--text2,#666);margin-left:2px">${mIcons[e.mode]||''}${mNames[e.mode]||''}</span>` : '';
      let tfTag = '';
      if(e.tfs && Array.isArray(e.tfs) && e.tfs.length > 0){
        tfTag = e.tfs.map(t => tfLabels[t] || t).join('+');
      } else {
        tfTag = tfLabels[e.tf] || e.tf || '';
      }
      const dateStr = e.ts ? new Date(e.ts).toLocaleDateString('ko-KR',{month:'short',day:'numeric'}) : '';
      const isRep = (repId && e.id === repId);
      const repBorder = isRep ? 'border:2px solid var(--accent,#2563eb);box-shadow:0 0 0 2px rgba(37,99,235,0.12)' : 'border:1px solid var(--border,#e0e0e0)';
      const repBadge = isRep ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--accent,#2563eb);color:#fff;font-weight:600;margin-left:4px">★ 대표</span>' : '';
      const eId = _esc(e.id||'');

      html+=`<div style="background:var(--surface2,#f8f8f8);border-radius:8px;padding:8px 10px;margin-bottom:4px;${repBorder}">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;font-weight:700">${idx+1}. ${tfTag} ${regTag}${modeTag}${repBadge}</span>
          <span style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:700;color:var(--accent,#2563eb)">${(e.score||0).toFixed(1)}pt</span>
            ${(()=>{
              // [S179] PF (Profit Factor) 표시 — 점수 옆에 작게
              //   PF >= 1.5: 녹색 (좋음), 1.0~1.5: 회색 (중립), < 1.0: 빨강 (손실)
              //   PF = 0 또는 undefined면 표시 안 함 (옛 데이터 호환)
              const pf = e.profitFactor;
              if(pf === undefined || pf === null || pf === 0) return '';
              const pfColor = pf >= 1.5 ? 'var(--buy,#27ae60)' : (pf >= 1.0 ? 'var(--text2,#666)' : 'var(--sell,#e74c3c)');
              const pfDisplay = pf >= 99 ? '∞' : pf.toFixed(2);
              return `<span style="font-size:9px;font-weight:600;color:${pfColor}" title="손익비 (총익절/총손절)">PF ${pfDisplay}</span>`;
            })()}
            <span style="font-size:11px;cursor:pointer;line-height:1" onclick="_optToggleRepresent('${curMkt}','${eId}')" title="${isRep?'대표 해제':'대표 선정'}">${isRep?'★':'☆'}</span>
            <span style="font-size:11px;color:var(--text3,#999);cursor:pointer;line-height:1" onclick="_optDeleteBestOne('${curMkt}','${eId}')">✕</span>
          </span>
        </div>
        <div style="font-size:9px;color:var(--text2,#666);margin-top:2px">${paramStr}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:2px 6px;margin-top:4px;font-size:9px;color:var(--text3,#999)">
          <span>승률</span>
          <span style="color:${pnlColor}">수익</span>
          <span>거래</span>
          <span>MDD</span>
          <span style="text-align:right">${e.filter?`TP${e.filter.minWin}/SL${e.filter.maxLoss}%`:((p.tpMult||p.slMult)?`TP${p.tpMult||'-'}/SL${p.slMult||'-'}`:'')}</span>
          <span style="font-weight:600">${(e.winRate||0).toFixed(1)}%</span>
          <span style="font-weight:600;color:${pnlColor}">${(e.totalPnl||0)>=0?'+':''}${(e.totalPnl||0).toFixed(1)}%</span>
          <span style="font-weight:600">${e.totalTrades||0}</span>
          <span style="font-weight:600">${e.mdd||0}%</span>
          <span style="text-align:right">${dateStr}</span>
        </div>
      </div>`;
    });
  }

  if(!hasAny){
    html+='<div style="font-size:10px;color:var(--text3,#999);padding:6px 0;text-align:center">최고기록 없음 — 최적화 실행 시 자동 기록</div>';
  }

  area.innerHTML=html;
}
// S211: 최고기록 탭 = 시장 전환 (모드 게이트와 독립)
let _optBestViewMarket = null; // 최고기록 카드가 보여줄 시장 (kr/us/crypto)
function _optBestTabSwitch(mkt){
  _optVib(10);
  _optBestViewMarket = _normMkt(mkt);
  _optRenderBestCards();
}
window._optBestTabSwitch = _optBestTabSwitch;
// ★ 대표 선정/해제 토글
function _optToggleRepresent(mode, entryId){
  _optVib(15);
  // S103-fix: 진동이 OS로 전달될 시간 확보 후 confirm 모달 (체감 "진동 먼저 → 모달 나중")
  setTimeout(()=>_optToggleRepresentCore(mode, entryId), 30);
}
function _optToggleRepresentCore(market, entryId){
  // S211: 첫 인자는 이제 시장 키(kr/us/crypto). 함수 내부 변수명도 명확화.
  const mktKey = _normMkt(market);
  const all = _loadOptBest();
  if(!all[mktKey] || !all[mktKey].ranks) return;
  const bucket = all[mktKey];
  const entry = bucket.ranks.find(r => r.id === entryId);
  if(!entry) return;

  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const mktNames = {kr:'국내', us:'해외', crypto:'코인'};
  const mktIcons = {kr:'🇰🇷', us:'🇺🇸', crypto:'🪙'};
  const tfLabels={};
  if(typeof TF_MAP!=='undefined') ['kr','us','coin'].forEach(mk=>{(TF_MAP[mk]||[]).forEach(t=>{tfLabels[t.k]=t.l;});});

  if(bucket.representId === entryId){
    // 해제 — 리스트 유지, 대표만 해제
    if(!confirm(`★ 대표 해제\n\n${mktIcons[mktKey]} ${mktNames[mktKey]} 대표를 해제합니다.\n기본 하드코딩(현재 레짐 기준)으로 복원됩니다.\n\n해제하시겠습니까?`)) return;
    bucket.representId = null;
    _saveOptBest(all);
    // S211: 현재 분석 시장이 해제된 시장과 같으면 시장+레짐 기본값으로 복원
    const curMkt = (typeof currentMarket !== 'undefined') ? _normMkt(currentMarket) : 'kr';
    if(curMkt === mktKey){
      const regOn = (typeof SXE !== 'undefined' && SXE.regimeAdaptEnabled) ? SXE.regimeAdaptEnabled() : false;
      let _def = null;
      if(typeof SXE !== 'undefined' && typeof SXE._getMarketRegimeDefaults === 'function'){
        _def = SXE._getMarketRegimeDefaults(mktKey, regOn);
      } else if(typeof _getModeRegimeDefaults === 'function'){
        _def = _getModeRegimeDefaults(mktKey, regOn);
      }
      // 매트릭스에서 해당 슬롯 제거 (대표 해제 시 슬롯도 비워서 기본값 복원)
      if(typeof SXE !== 'undefined' && SXE._loadParamsMatrix && SXE._saveParamsMatrix){
        const matrix = SXE._loadParamsMatrix();
        if(matrix[mktKey]) {
          delete matrix[mktKey][regOn ? 'on' : 'off'];
          SXE._saveParamsMatrix(matrix);
        }
      }
      if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
    }
    _optRenderBestCards();
    toast(`${mktNames[mktKey]} 대표 해제 · 기본값 복원`);
  } else {
    // 선정 — params를 시장 슬롯에 저장
    const tfTag = tfLabels[entry.tf] || entry.tf || '';
    const regTag = entry.regime==='ON' ? '⚡ON' : '⚡OFF';
    // S211: entry에 보존된 정렬 모드(찾을 때 사용한 가중치) 메타 표시
    const modeTag = entry.mode ? `${mIcons[entry.mode]||''}${mNames[entry.mode]||''} ` : '';
    const msg = `★ 대표 프리셋 선정\n\n${mktIcons[mktKey]} ${mktNames[mktKey]} ${tfTag} ${regTag} (${(entry.score||0).toFixed(1)}pt)\n${modeTag}정렬 가중치로 발견\n\n승률 ${(entry.winRate||0).toFixed(1)}% · 수익 ${(entry.totalPnl||0)>=0?'+':''}${(entry.totalPnl||0).toFixed(1)}% · MDD ${entry.mdd||0}%\n\n이 시장(${mktNames[mktKey]})의 BT/분석에 적용됩니다.\n레짐도 ${regTag}로 자동 전환.\n\n선정하시겠습니까?`;
    if(!confirm(msg)) return;
    bucket.representId = entryId;
    _saveOptBest(all);
    // 대표 프리셋의 레짐 상태를 전역에 반영
    if(entry.regime){
      const regOn = (entry.regime === 'ON' || entry.regime === true);
      if(typeof SXE !== 'undefined' && SXE.setRegimeAdapt) SXE.setRegimeAdapt(regOn);
      if(typeof _syncRegimeToggleUI === 'function') _syncRegimeToggleUI();
    }
    // S211: entry.params를 (시장, 레짐) 좌표 슬롯에 저장
    if(entry.params){
      const entryRegOn = (entry.regime === 'ON' || entry.regime === true);
      if(typeof SXE !== 'undefined' && SXE._saveSlotParams){
        SXE._saveSlotParams(mktKey, entryRegOn, entry.params);
        // S211-debug: 저장 직후 매트릭스 상태 확인 (사용자 디버깅용)
        try {
          const _verify = SXE._loadParamsMatrix ? SXE._loadParamsMatrix() : {};
          const _slot = _verify[mktKey] && _verify[mktKey][entryRegOn?'on':'off'];
          console.log(`[S211 대표저장] ${mktKey}.${entryRegOn?'on':'off'} →`, _slot ? `buyTh=${_slot.buyTh}, tpMult=${_slot.tpMult}, slMult=${_slot.slMult}` : '저장 실패');
        } catch(_){}
      }
      // 현재 화면 시장과 일치하면 UI + 분석엔진 결과 캐시 무효화
      const curMkt = (typeof currentMarket !== 'undefined') ? _normMkt(currentMarket) : 'kr';
      if(curMkt === mktKey){
        if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
        // S211-fix: 분석탭이 활성 상태면 현재 종목을 강제로 재분석 (캐시된 결과 회피)
        //   _curAnalStock이 있다면 그 종목으로 재분석 트리거
        if(typeof window !== 'undefined' && window._curAnalStock && typeof selectStockForAnalysis === 'function'){
          try { selectStockForAnalysis(window._curAnalStock); } catch(_){}
        } else if(typeof _refreshCurrentAnalysis === 'function'){
          try { _refreshCurrentAnalysis(); } catch(_){}
        }
      }
    }
    _optRenderBestCards();
    toast(`★ ${mktNames[mktKey]} 대표 선정 · 슬롯[${mktKey}.${entry.regime==='ON'||entry.regime===true?'on':'off'}] 저장됨`);
  }
}

function _optClearBest(){
  _optVib(15);
  // S103-fix4: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(_optClearBestCore, 30);
}
function _optClearBestCore(){
  // S211: 현재 화면 시장(_optBestViewMarket)의 기록 삭제 — 대표는 보존
  const mktNames = {kr:'국내', us:'해외', crypto:'코인'};
  const mktIcons = {kr:'🇰🇷', us:'🇺🇸', crypto:'🪙'};
  const all = _loadOptBest();
  const targetMkt = _optBestViewMarket || _normMkt(typeof _optMarket !== 'undefined' ? _optMarket : 'kr');
  const bucket = all[targetMkt];
  if(!bucket || !bucket.ranks || bucket.ranks.length === 0){ toast('삭제할 기록이 없습니다'); return; }

  const repId = bucket.representId || null;
  const hasRep = repId && bucket.ranks.some(r => r.id === repId);
  const delCount = hasRep ? bucket.ranks.length - 1 : bucket.ranks.length;

  if(delCount === 0){
    toast(`★ 대표만 남아있습니다 · 대표 해제 후 다시 시도하세요`);
    return;
  }

  const mktLabel = `${mktIcons[targetMkt]} ${mktNames[targetMkt]||targetMkt}`;
  const msg = hasRep
    ? `[${mktLabel}] 최고기록 ${delCount}개 삭제\n★ 대표 프리셋은 보존됩니다\n\n계속하시겠습니까?`
    : `[${mktLabel}] 최고기록 ${delCount}개를 삭제합니다.\n\n현재 파라미터는 유지됩니다.\n계속하시겠습니까?`;

  if(!confirm(msg)) return;

  if(hasRep){
    const repEntry = bucket.ranks.find(r => r.id === repId);
    bucket.ranks = repEntry ? [repEntry] : [];
    all[targetMkt] = bucket;
  } else {
    delete all[targetMkt];
  }
  _saveOptBest(all);
  _optRenderBestCards();
  toast(hasRep
    ? `${mktLabel} ${delCount}개 삭제 · ★ 대표 보존`
    : `${mktLabel} 기록 초기화됨`);
}

// 프리셋 초기화: 리스트 유지 + 대표 해제 + 슬롯 비움 (시장 기준)
function _optResetPreset(){
  _optVib(15);
  setTimeout(_optResetPresetCore, 30);
}
function _optResetPresetCore(){
  const mktNames = {kr:'국내', us:'해외', crypto:'코인'};
  const mktIcons = {kr:'🇰🇷', us:'🇺🇸', crypto:'🪙'};
  const targetMkt = _optBestViewMarket || _normMkt(typeof _optMarket !== 'undefined' ? _optMarket : 'kr');
  const mktLabel = `${mktIcons[targetMkt]} ${mktNames[targetMkt]||targetMkt}`;

  if(!confirm(`[${mktLabel}] 프리셋 초기화\n\n최고기록 리스트는 유지하고\n대표 해제 + 시장 슬롯을 비워 기본값으로 복원합니다.\n\n계속하시겠습니까?`)) return;

  const all = _loadOptBest();
  if(all[targetMkt]) all[targetMkt].representId = null;
  _saveOptBest(all);
  // S211: 해당 시장의 매트릭스 슬롯 비움 (양 레짐 모두)
  if(typeof SXE !== 'undefined' && SXE._loadParamsMatrix && SXE._saveParamsMatrix){
    const matrix = SXE._loadParamsMatrix();
    if(matrix[targetMkt]) {
      delete matrix[targetMkt];
      SXE._saveParamsMatrix(matrix);
    }
  }
  if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  _optRenderBestCards();
  toast(`${mktLabel} 프리셋 초기화 · 기본값 복원`);
}
function _optDeleteBestOne(market, entryId){
  // S211: 첫 인자는 시장 키
  _optVib(15);
  setTimeout(()=>_optDeleteBestOneCore(market, entryId), 30);
}
function _optDeleteBestOneCore(market, entryId){
  const mktKey = _normMkt(market);
  const all = _loadOptBest();
  if(!all[mktKey] || !all[mktKey].ranks) return;
  const entry = all[mktKey].ranks.find(r => r.id === entryId);
  if(!entry) return;

  const mktNames = {kr:'국내', us:'해외', crypto:'코인'};

  // 대표 프리셋은 삭제 차단 (★ 해제 후 삭제 유도)
  if(all[mktKey].representId === entryId){
    toast(`★ ${mktNames[mktKey]||mktKey} 대표는 삭제 불가 · ★ 해제 후 삭제하세요`);
    return;
  }

  if(!confirm(`[${mktNames[mktKey]||mktKey}] 이 프리셋을 삭제하시겠습니까?\n(${(entry.score||0).toFixed(1)}pt)`)) return;

  all[mktKey].ranks = all[mktKey].ranks.filter(r => r.id !== entryId);
  if(all[mktKey].ranks.length === 0) delete all[mktKey];
  _saveOptBest(all);
  _optRenderBestCards();
  toast('프리셋 삭제됨');
}

// JSON 파일 저장 (V3)
function _optExportBest(){
  _optVib(15);
  const all=_loadOptBest();
  if(!all||Object.keys(all).length===0){ toast('저장할 기록이 없습니다'); return; }
  const json=JSON.stringify(all, null, 2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date();
  const ds=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  a.href=url; a.download=`SX_OPT_BEST4_${ds}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('✅ 최고기록 JSON 저장 완료');
}

// S211: JSON 파일 불러오기 (V4 — 시장별 버킷)
function _optImportBest(){
  _optVib(15);
  const input=document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      if(!data||typeof data!=='object'){ toast('잘못된 형식입니다'); return; }
      // S211: V4 구조 검증 (시장 키 — kr/us/crypto/coin 중 하나 이상)
      const markets=['kr','us','crypto','coin'];
      const hasMkt=Object.keys(data).some(k=>markets.includes(k));
      if(!hasMkt){
        // 호환: 레거시 V3 파일이면 안내
        const legacyModes=['profit','balanced','safe'];
        const hasLegacy=Object.keys(data).some(k=>legacyModes.includes(k));
        if(hasLegacy){
          toast('⚠️ 레거시 V3 파일 — V4로 호환 안 됨. 옵티마이저 재실행 필요');
          return;
        }
        toast('유효한 V4 데이터가 없습니다 (kr/us/crypto 키 필요)');
        return;
      }
      if(!confirm('현재 최고기록을 불러온 파일로 덮어씁니다.\n계속하시겠습니까?')) return;
      // coin → crypto 정규화
      const normalized = {};
      Object.entries(data).forEach(([k, v]) => {
        normalized[_normMkt(k)] = v;
      });
      _saveOptBest(normalized);
      _optRenderBestCards();
      toast('✅ 최고기록 불러오기 완료');
    }catch(err){
      toast('파일 읽기 실패: '+err.message);
    }
  };
  input.click();
}

// ── 글로벌 노출 ──
window.openOptimizer = openOptimizer;
window._closeOpt = _closeOpt;
window._optToggleLock = _optToggleLock;
window._optUnlockAll = _optUnlockAll;
// S113-c: 체크박스 함수 노출
window._optToggleCheck = _optToggleCheck;
window._optCheckAll = _optCheckAll;
window._optUncheckAll = _optUncheckAll;
// S114: 프리셋 칩 토글
window._optTogglePresetChip = _optTogglePresetChip;
window._optRenderLockedBar = _optRenderLockedBar;
window._optRun = _optRun;
window._optRunNonstop = _optRunNonstop;
window._optCancel = _optCancel;
window._optRefreshCandles = _optRefreshCandles;
window._optUpdateCandleStatus = _optUpdateCandleStatus;
window._optUpdateMinTrades = _optUpdateMinTrades;
window._optUpdateMinWinRate = _optUpdateMinWinRate;
window._optUpdatePerTradeFilter = _optUpdatePerTradeFilter;
window._optSetMode = _optSetMode;
window._optRenderModeGate = _optRenderModeGate;
window._optToggleWeightArea = _optToggleWeightArea;
window._optApplyWeights = _optApplyWeights;
window._optResetWeights = _optResetWeights;
window._optRenderRegimeGate = _optRenderRegimeGate;
window._optSetRegime = _optSetRegime;
window._optSwitchMarket = _optSwitchMarket;
window._optOnStockInput = _optOnStockInput;
window._optOnStockKey = _optOnStockKey;
window._optToggleAzPanel = _optToggleAzPanel;
window._optFilterAz = _optFilterAz;
window._optPickFromAz = _optPickFromAz;
window._optPickStock = _optPickStock;
window._optRenderChips = _optRenderChips;
window._optSelectChip = _optSelectChip;
window._optRemoveChip = _optRemoveChip;
window._optSelectCard = _optSelectCard;
window._optApplySelected = _optApplySelected;
window._optSaveSelected = _optSaveSelected;
window._optRenderBestCards = _optRenderBestCards;
window._optClearBest = _optClearBest;
window._optResetPreset = _optResetPreset;
window._optDeleteBestOne = _optDeleteBestOne;
window._optToggleRepresent = _optToggleRepresent;
window._optExportBest = _optExportBest;
window._optImportBest = _optImportBest;

// ════════════════════════════════════════════════════════════
// [S212] 파라미터 범위 도움말 모달
//   진입점: window._optShowParamHelp (🎛️ 파라미터 범위 옆 [?] 버튼이 호출)
//   내용: 단기·스윙 + 밸런스형 추천값 (한국/미국/코인)
// ════════════════════════════════════════════════════════════
function _optShowParamHelp(){
  if(typeof _optVib === 'function') _optVib(10);
  const existing = document.getElementById('optParamHelpOverlay');
  if(existing) existing.remove();

  // 현재 시장에 맞춰 기본 탭 결정
  const curMarket = (typeof _optMarket !== 'undefined') ? _optMarket : 'kr';
  const defaultTab = curMarket === 'us' ? 'us' : (curMarket === 'coin' ? 'crypto' : 'kr');

  const overlay = document.createElement('div');
  overlay.id = 'optParamHelpOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:10px';
  overlay.addEventListener('click', e => { if(e.target === overlay) _optCloseParamHelp(); });

  // 추천값 데이터 (단기·스윙 + 밸런스형)
  const tables = {
    kr: {
      title: '🇰🇷 한국 주식 (일봉)',
      rows: [
        ['BUY 임계',  '42',  '38~46, step 2'],
        // [v3.17 SELL-TH-FIX] SELL 임계는 점수 기반 (rawScore<=sellTh로 SELL 판정).
        //   분석엔진 clamp(20,50)로 강제되므로 의미 있는 범위는 30~45.
        ['SELL 임계', '38',  '34~42, step 2'],
        ['BB 기간',   '11',  '10~14, step 1'],
        ['BB 배수',   '1.9', '1.8~2.1, step 0.1'],
        ['TP 배수',   '2.5', '2.0~3.0, step 0.25'],
        ['SL 배수',   '1.5', '1.3~1.8, step 0.1']
      ],
      note: 'BUY는 코드 기본값 42 근처로 신호 품질 유지. SELL은 38 근처로 약세 점수 진입 감지. TP/SL도 너무 길게 잡지 않아 회전율 확보.'
    },
    us: {
      title: '🇺🇸 미국 주식 (일봉)',
      rows: [
        ['BUY 임계',  '48',  '44~52, step 2'],
        // [v3.17 SELL-TH-FIX] SELL 임계 점수 기반 정정 (이전 8/6~12는 clamp(20,50)에 의해 무력화)
        ['SELL 임계', '38',  '34~42, step 2'],
        ['BB 기간',   '23',  '20~26, step 1'],
        ['BB 배수',   '1.8', '1.7~2.0, step 0.1'],
        ['TP 배수',   '2.5', '2.0~3.0, step 0.25'],
        ['SL 배수',   '1.6', '1.4~1.8, step 0.1']
      ],
      note: '미국은 추세가 길어서 BB 기간 길게, BUY 임계도 높게 유지. 단기 스윙도 5~15일 보유가 일반적이라 TP/SL은 한국과 비슷.'
    },
    crypto: {
      title: '🪙 코인 (일봉)',
      rows: [
        ['BUY 임계',  '32',  '28~36, step 2'],
        // [v3.17 SELL-TH-FIX] SELL 임계 점수 기반 정정 (이전 8/6~12는 clamp(20,50)에 의해 무력화)
        ['SELL 임계', '38',  '34~42, step 2'],
        ['BB 기간',   '10',  '9~12, step 1'],
        ['BB 배수',   '1.9', '1.7~2.1, step 0.2'],
        ['TP 배수',   '3.0', '2.5~3.5, step 0.25'],
        ['SL 배수',   '1.8', '1.6~2.0, step 0.1']
      ],
      note: '코인은 변동폭 자체가 커서 TP/SL은 크게 유지. SELL 임계 38 근처로 약세 점수 진입 시 빠르게 청산.'
    }
  };

  const tabBtn = (k, label) => `<div onclick="_optParamHelpTab('${k}')" data-helptab="${k}" style="flex:1;padding:8px;text-align:center;cursor:pointer;font-size:11px;font-weight:600;background:var(--surface2,#f0f0f0);color:var(--text2,#666);border-bottom:2px solid transparent">${label}</div>`;

  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:10px;width:100%;max-width:520px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border,#ddd)">
        <h4 style="margin:0;font-size:14px;color:var(--text,#222)">🎯 단기·스윙 + 밸런스형 설정</h4>
        <span style="font-size:18px;cursor:pointer;color:var(--text3,#999);padding:0 6px" onclick="_optCloseParamHelp()">✕</span>
      </div>
      <div style="display:flex;border-bottom:1px solid var(--border,#ddd)">
        ${tabBtn('kr','🇰🇷 한국')}${tabBtn('us','🇺🇸 미국')}${tabBtn('crypto','🪙 코인')}
      </div>
      <div id="optParamHelpBody" style="flex:1;overflow-y:auto;padding:12px 14px;min-height:80px"></div>
      <!-- [S178-fix] 하단 details 영역에 스크롤 추가 — 동반자 활용법 추가로 컨텐츠가 길어져 화면 밖으로 나가는 문제 해결 -->
      <div style="padding:10px 14px;border-top:1px solid var(--border,#ddd);background:var(--surface2,#f5f5f5);overflow-y:auto;max-height:40vh;flex-shrink:0">
        <details style="font-size:10px;color:var(--text2,#666)">
          <summary style="cursor:pointer;font-weight:600;color:var(--accent,#2563eb)">💡 밸런스형 백테스트 평가 기준</summary>
          <div style="margin-top:6px;line-height:1.7;padding:6px 8px;background:var(--surface,#fff);border-radius:5px;border:1px solid var(--border,#e8e8e8)">
            <b>① 승률 50% 이상</b> — 너무 낮으면 심리적으로 못 버팀<br>
            <b>② MDD 15% 이내</b> — 한 번에 크게 깨지면 안 됨<br>
            <b>③ 샤프비율 1.0 이상</b> — 핵심 밸런스 지표!<br>
            <b>④ 총 거래 50건 이상</b> — 표본 적으면 운빨<br><br>
            <span style="color:var(--accent,#2563eb)">샤프비율이 두 마리 토끼 잡는 지표.</span> 승률 99%여도 한 번에 50% 깨지면 위험, 수익률 200%여도 승률 20%면 못 버팀.
          </div>
        </details>
        <details style="font-size:10px;color:var(--text2,#666);margin-top:6px">
          <summary style="cursor:pointer;font-weight:600;color:var(--sell,#dc2626)">⚠️ 단기·스윙형 주의사항</summary>
          <div style="margin-top:6px;line-height:1.7;padding:6px 8px;background:var(--surface,#fff);border-radius:5px;border:1px solid var(--border,#e8e8e8)">
            안전필터(🔒임계값 마진, 🔒변동성 과다, 🔒MACD 음전, 🔒MA60 저항)가 단기형은 신호를 너무 많이 거를 수 있음.<br>
            거래 횟수가 너무 적으면(예: 10회 미만) 안전필터 일부를 OFF로 돌려보는 것도 방법.
          </div>
        </details>
        <!-- [S178] 동반자 탐색 도움말 — 사용자 요청으로 추가 -->
        <details style="font-size:10px;color:var(--text2,#666);margin-top:6px">
          <summary style="cursor:pointer;font-weight:600;color:var(--accent,#2563eb)">🔗 동반자 탐색 활용법</summary>
          <div style="margin-top:6px;line-height:1.7;padding:6px 8px;background:var(--surface,#fff);border-radius:5px;border:1px solid var(--border,#e8e8e8)">
            <b>한 줄 요약</b><br>
            <span style="color:var(--text,#222)">"내가 가장 신경 쓰이는 파라미터(예: TP)를 동반자로 체크하면, 다른 모든 파라미터를 찾을 때 그 동반자도 같이 비교하면서 가장 좋은 짝을 찾아준다."</span>
            <br><br>
            <b>일반 vs 동반자 차이</b><br>
            • 일반: BUY 찾고 → BB 찾고 → TP 찾고... <span style="color:var(--text3,#999)">(앞 결과에 의존)</span><br>
            • 동반자: 매 단계마다 동반자(예: TP)를 같이 비교 <span style="color:var(--accent,#2563eb)">(상호작용 반영)</span>
            <br><br>
            <b>📌 추천 사용 흐름</b><br>
            1️⃣ 일반 옵티마이저로 <b>대충 좋은 값</b> 한 번 찾기<br>
            2️⃣ 결과가 마음에 안 들면 → 의심 파라미터(TP 등) <b>동반자 체크</b><br>
            3️⃣ 다시 옵티마이저 실행 → 더 정밀한 결과
            <br><br>
            <b>💡 가벼운 팁</b><br>
            • <b>TP/SL 의심</b> → TP 또는 SL 동반자로<br>
            • <b>진입 빈도 조정</b> → BUY 동반자로<br>
            • <b>변동성 적응</b> → BB 배수 동반자로
            <br><br>
            <b>⚙️ 주의</b><br>
            <span style="color:var(--text3,#999)">체크박스는 1개만 선택 가능 (라디오 방식). BT 횟수가 약 3~5배 늘어나니 시간 여유 있을 때 추천.</span>
          </div>
        </details>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 탭 렌더 함수 (전역에 임시 노출)
  window._optParamHelpTab = function(k){
    const t = tables[k];
    if(!t) return;
    if(typeof _optVib === 'function') _optVib(8);
    // 탭 버튼 활성화
    document.querySelectorAll('[data-helptab]').forEach(el => {
      const active = el.getAttribute('data-helptab') === k;
      el.style.background = active ? 'var(--surface,#fff)' : 'var(--surface2,#f0f0f0)';
      el.style.color = active ? 'var(--accent,#2563eb)' : 'var(--text2,#666)';
      el.style.borderBottomColor = active ? 'var(--accent,#2563eb)' : 'transparent';
    });
    // 본문 렌더
    const body = document.getElementById('optParamHelpBody');
    if(!body) return;
    const rows = t.rows.map(r => `
      <tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border,#eee);font-weight:600;color:var(--text,#222);font-size:11px">${r[0]}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border,#eee);text-align:center;color:var(--accent,#2563eb);font-weight:700;font-size:12px">${r[1]}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border,#eee);color:var(--text2,#666);font-size:11px">${r[2]}</td>
      </tr>
    `).join('');
    body.innerHTML = `
      <h5 style="margin:0 0 8px;font-size:12px;color:var(--text,#222)">📌 ${t.title}</h5>
      <table style="width:100%;border-collapse:collapse;background:var(--surface,#fff);border:1px solid var(--border,#e8e8e8);border-radius:6px;overflow:hidden">
        <thead>
          <tr style="background:var(--surface2,#f5f5f5)">
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text2,#666);font-weight:600;border-bottom:1px solid var(--border,#ddd)">파라미터</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;color:var(--text2,#666);font-weight:600;border-bottom:1px solid var(--border,#ddd)">추천값</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text2,#666);font-weight:600;border-bottom:1px solid var(--border,#ddd)">탐색 범위</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:10px;padding:8px 10px;background:var(--surface2,#f9fafb);border-left:3px solid var(--accent,#2563eb);border-radius:4px;font-size:11px;color:var(--text2,#555);line-height:1.6">
        ${t.note}
      </div>
      <div style="margin-top:8px;font-size:10px;color:var(--text3,#999);text-align:center">
        ※ RSI 14 / ATR 14 / MA 5·20·60 은 표준값으로 고정 권장
      </div>
    `;
  };

  window._optCloseParamHelp = function(){
    if(typeof _optVib === 'function') _optVib(8);
    const ov = document.getElementById('optParamHelpOverlay');
    if(ov) ov.remove();
  };

  // 기본 탭 표시
  window._optParamHelpTab(defaultTab);
}

window._optShowParamHelp = _optShowParamHelp;

})();
