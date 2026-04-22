// ════════════════════════════════════════════════════════════
//  sx_optimizer.js v3.15 — 파라미터 자동 최적화 모듈
//  S115: 파라미터별 BT 봉수 최적화 — 채희창 통찰 "파라미터마다 최대 필요 봉수가 있는거지?"
//    [설계 철학]
//      BT 엔진은 봉별로 rows.slice(i-149, i+1) 150봉 슬라이스만 사용
//      즉 600봉은 "지표 정확도"가 아니라 "BT 시뮬레이션 횟수" 의미
//      각 파라미터가 최적값 찾는 데 필요한 BT 횟수 다름
//      → 파라미터별로 봉수 조정 → 불필요한 BT 제거 → 속도 향상
//
//    [파라미터별 봉수 테이블 OPT_PARAM_BARS]
//      BUY/TP/SL:   600봉 (시장 전체, 거래 샘플 많이 필요)
//      BB 기간/배수: 300봉 (변동성 주기 = 기간×3)
//      SELL:        300봉 (청산 임계)
//      MA 장기:     400봉 (60일×3 + 여유)
//      MA 단/중:    250봉 (단기 이평선)
//      RSI/ATR:     200봉 (단기 지표)
//
//    [구현]
//      - OPT_PARAM_BARS 상수 + _optGetParamBars/_optGetCombinedBars 헬퍼
//      - 레짐 OFF/ON 루프에서 rows.slice(-N봉) 적용
//      - 동반자 탐색 시: max(paramKey, companionKey) 봉수 사용
//      - 진행 표시에 [N봉] 표시 (투명성)
//
//    [예상 효과]
//      RSI/ATR: 3배 가속 (600 → 200봉)
//      BB: 2배 가속 (600 → 300봉)
//      MA 단/중: 2.4배 가속 (600 → 250봉)
//      MA 장기: 1.5배 (600 → 400봉)
//      BUY/TP/SL: 유지
//      전체 옵티마이저 30~40% 시간 단축 예상
//
//  v3.14 <!-- S114: 프리셋 선택지 시스템 -->
//    - _optCandleRefresh (수동 갱신): btFetchCandles(300봉) → _fetchExtCandles (600봉 3단계)
//    - _optPreloadCandles (최적화 전 프리로드): 동일 전환
//    - 효과: Workers KV 30일 TTL 자동 활용. 분석탭/단일검증이 먼저 받았으면 즉시 재사용
//            첫 수집 시 2초×2 확장 대기 있지만 재실행은 KV 히트로 즉시
//    - 채희창 설계 철학: "어느 모듈에서 받든 모두 KV에 저장 → 양방향 공유"
//  v3.7 <!-- S103-fix4: confirm 쓰는 함수 4개 wrapper 분리 — 모달 뜨기 전 진동 체감 개선 -->
//        - _optClearBest (기록 초기화) setTimeout(30)
//        - _optResetPreset (프리셋 초기화) setTimeout(30)
//        - _optSetMode (잠금 있을 때만) setTimeout(30)
//        - _optDeleteStockSet (세트 ✕) setTimeout(30)
//  S103-fix3: 대표 프리셋 삭제 정책 정립
//        - _optDeleteBestOneCore: 대표는 삭제 차단 (토스트 "★ 해제 후 삭제")
//        - _optClearBest: 대표 보존, 나머지만 삭제 (대표만 남았으면 차단 토스트)
//        - 기존 버그 수정: 대표 ✕ 삭제 시 analParams localStorage 잔존 → "모바일" 라벨 표시 문제 원천 차단
//  S103-fix2: _optDeleteBestOne (✕ 개별 삭제) setTimeout(30) 적용 — confirm 전 진동 체감 개선
//  S103-fix: 진동 타이밍 개선 (3건)
//        - _optToggleAzPanel: 진동 최상단 이동 + DOM구축 setTimeout(20) 양보
//        - _optToggleRepresent: setTimeout(30) 양보로 confirm 전 진동 체감 개선
//        - 토글 3개 진동 추가: _optUpdateMinTrades/_optUpdateMinWinRate/_optUpdatePerTradeFilter [10]
//  S103: 옵티마이저 진동 피드백 추가 (31개)
//        - 체계: [8]탭전환/펼치기 [10]선택/모드 [12]모달오픈 [15]액션/저장/초기화 [20]실행시작·종료
//        - navigator.vibrate(N) 직접 호출 (IIFE 내부, _sxVib 참조 불가)
//        - 함수 내부 진동 30개 + 인라인 1개(Az패널✕)
//        - 원칙: 함수 내부 진동 있으면 onclick 중복 금지 (screener.html 진동 체계 준수)
//  S102: 워밍업 회차 추가 — 사용자 N회 입력 시 실제 실행은 [워밍업 1회 + 사용자 N회]
//        워밍업 목적: 첫 회차 baseParams 정렬 (첫 파라미터들의 ⚠️ 스킵 방지)
//        UI: 워밍업 중엔 회차번호 대신 "[워밍업]" 표시, 토스트 "🏃 워밍업 진행중" 1회 안내
//        잠금은 마지막 사용자 회차에서만, baseParams/최고기록은 워밍업부터 정상 갱신
//  S101: OPT_DEFAULTS 단일값+step0 / step=0 보존(Math.max 가드 제거) / 가중치 초기화값 사진2 기준
//  S101-fix: float step 부동소수 오차 수정 (BB/TP/SL 배수 max값 누락 버그 제거) + 단일값 파라미터 재탐색 제거(✅값 즉시 표시) + 탐색순서 재배치(진입→청산→지표→MA, BB/TP 초반⚠️ 해결)
//  S100: 결과리스트UI숨김+최고기록모드별탭전환+모드변경시BestCards동기화
//  S98: MDD 재계산(건별필터 후 equity curve 재산출) + 3모드 가중치 개편 + 개별삭제 + 필터설정 기록
//  S97: 건별 수익/손실 필터(익절최소%+손절최대%) + mddSafe 클램핑(WARN3)
//  S91: 다중필드 순차비교 정렬 (수익률 1순위 공통, 모드별 2~4순위)
//  S91: 최고기록 무조건 덮어쓰기 (사용자 선택 기준)
//  S86: 3모드 정렬(🔥수익/⚖️안정/🛡️보수) + TF최고기록 모드별 저장
//  S86: 캔들 로컬캐시(localStorage+메모리, 4h TTL, 갱신버튼)
//  S86: 복수종목 선택+평균BT, 잠금버튼 터치 버그 수정
//  S79: OPT_DEFAULTS 11파라미터 범위 최대확장 + step 최소단위
//  S78: 종합점수 공식 통일(MDD), 카드 pt 표시, 고정시 설정탭 직접변경 제거
//  S77 신규 | 독립 모듈 (본체 영향 없음)
//  의존: sx_analysis_engine.js (SXE, sxRunBtEngine, _saveAnalParams, _loadAnalParams, _saveSlot)
//        sx_bt.js (btFetchCandles)
//        sx_screener.html (currentMarket, currentTF, TF_MAP, loadAnalParamsUI)
// ════════════════════════════════════════════════════════════

(function(){
'use strict';

// ─── S103: 진동 피드백 공통 헬퍼 ─────────────────────────────
// 패턴: [8]탭전환/펼치기 [10]선택/모드 [12]모달오픈 [15]액션/저장/초기화 [20]실행시작·종료
// IIFE 내부라 screener.html의 _sxVib 참조 불가 → navigator.vibrate 직접 호출 래퍼
function _optVib(pattern){
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(_){}
}

// ── 기본 설정 (최적화 우선순위 순) ──
// S101: 사진1 기준 — 고정 6개(atr/rsi/sell/MA 3개)는 min=max, step=0 (단일값 고정)
// S101-fix: 탐색 순서 재배치 — [진입 게이트 → 진입 조건 → 청산 → 지표 → MA]
//           BB/TP가 초반에 거래수 미달로 ⚠️ 나는 문제 해결
//           UI 표시 순서 = 탐색 순서 (Object.keys 기반)
const OPT_DEFAULTS = {
  // [진입 결정] — 거래 발생 여부를 좌우하는 게이트 최우선
  buyTh:   { min:25,  max:55,  step:1,   enabled:false },  // 1. 진입 점수 임계
  bbLen:   { min:10,  max:30,  step:1,   enabled:false },  // 2. BB 기간 (신호 빈도)
  bbMult:  { min:1.8, max:2.5, step:0.1, enabled:false },  // 3. BB 배수 (진입 폭)
  // [청산 결정] — 진입 안정화 후 최적화
  tpMult:  { min:2.5, max:3.5, step:0.1, enabled:false },  // 4. 익절 폭
  slMult:  { min:1.0, max:1.8, step:0.1, enabled:false },  // 5. 손절 폭
  sellTh:  { min:5,   max:5,   step:0,   enabled:false },  // 6. 청산 점수 (고정 5, step=0)
  // [지표 기간] — 대부분 단일값 자동 고정
  rsiLen:  { min:14,  max:14,  step:0,   enabled:false },  // 7. RSI 기간 (고정 14, step=0)
  atrLen:  { min:14,  max:14,  step:0,   enabled:false },  // 8. ATR 기간 (고정 14, step=0)
  // [이동평균] — 전부 단일값 자동 고정
  maShort: { min:5,   max:5,   step:0,   enabled:false },  // 9. MA 단기 (고정 5, step=0)
  maMid:   { min:20,  max:20,  step:0,   enabled:false },  // 10. MA 중기 (고정 20, step=0)
  maLong:  { min:60,  max:60,  step:0,   enabled:false },  // 11. MA 장기 (고정 60, step=0)
};

// ════════════════════════════════════════════════════════════
// S114: 프리셋 선택지 시스템
//   채희창 설계: "고정값 파라미터는 통상값 칩 선택으로 교체"
//   범위 5개(BUY/BB/BB×/TP/SL) = 기존 min~max 유지
//   고정값 6개 = 칩 선택 (시장 통용값)
// ════════════════════════════════════════════════════════════
const OPT_PRESETS = {
  sellTh:  [3, 5, 7],         // 청산: 빠름/표준/지연
  rsiLen:  [9, 14, 21],       // RSI: 민감/표준/둔감
  atrLen:  [10, 14, 20],      // ATR: 단기/표준/장기
  maShort: [5, 10],           // MA단: 초단기/단기
  maMid:   [20, 50],          // MA중: 표준/중기
  maLong:  [60, 90, 120],     // MA장: 3/4.5/6개월 (채희창 예시)
};
// 프리셋 파라미터 키 배열 (빠른 체크용)
const OPT_PRESET_KEYS = Object.keys(OPT_PRESETS);
// 프리셋에서 기본 선택 인덱스 (표준값 강조용)
const OPT_PRESET_DEFAULT = {
  sellTh:  1,  // 5
  rsiLen:  1,  // 14
  atrLen:  1,  // 14
  maShort: 0,  // 5
  maMid:   0,  // 20
  maLong:  0,  // 60
};

// ════════════════════════════════════════════════════════════
// S115: 파라미터별 BT 봉수 최적화
//   채희창 통찰: "파라미터마다 최대 필요 봉수가 있는거지?"
//   
//   각 파라미터가 최적값 찾는 데 필요한 최소 봉수
//   워밍업 100봉 포함 (즉 실제 BT 구간 = 값 - 100)
//
//   원칙:
//     시장 전체 조건 필요 (BUY/TP/SL): 600봉
//     변동성 주기 (BB): 300봉
//     장기 이평선 (MA 장기): 400봉
//     중단기 이평선 (MA 단/중): 250봉
//     단기 지표 (RSI/ATR): 200봉
//     청산 임계 (SELL): 300봉
//
//   효과:
//     RSI/ATR: 3배 가속 (600→200)
//     BB: 2배 가속 (600→300)
//     MA: 1.5~2.4배 가속
//     전체 옵티마이저 30~40% 시간 단축
// ════════════════════════════════════════════════════════════
const OPT_PARAM_BARS = {
  buyTh:   600,  // 500봉 BT (시장 전체)
  bbLen:   300,  // 200봉 BT (변동성 주기)
  bbMult:  300,  // 200봉 BT
  tpMult:  600,  // 500봉 BT (거래 샘플)
  slMult:  600,  // 500봉 BT
  sellTh:  300,  // 200봉 BT
  rsiLen:  200,  // 100봉 BT (단기)
  atrLen:  200,  // 100봉 BT
  maShort: 250,  // 150봉 BT
  maMid:   250,  // 150봉 BT
  maLong:  400,  // 300봉 BT (60×3 + 여유)
};
// 헬퍼: paramKey에 맞는 봉수 반환 (없으면 600 기본)
function _optGetParamBars(paramKey){
  return OPT_PARAM_BARS[paramKey] || 600;
}
// 헬퍼: 동반자 탐색 시 두 파라미터 중 더 긴 봉수
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
  try {
    const raw = localStorage.getItem(_candleCacheKey(code, tf));
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || !d.ts || !d.rows) return null;
    if(Date.now() - d.ts > CANDLE_CACHE_TTL) return null; // 만료
    _memCandleCache[mk] = d.rows; // 메모리에도 올림
    return d.rows;
  } catch(_){ return null; }
}

function _saveCachedCandle(code, tf, rows){
  const mk = `${code}_${tf}`;
  _memCandleCache[mk] = rows;
  try {
    localStorage.setItem(_candleCacheKey(code, tf), JSON.stringify({ ts:Date.now(), rows }));
  } catch(e){
    // 용량 초과 시 캐시 정리 후 재시도
    _cleanCandleCache();
    try { localStorage.setItem(_candleCacheKey(code, tf), JSON.stringify({ ts:Date.now(), rows })); } catch(_){}
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
  if(sets.length >= OPT_STOCK_SETS_MAX){
    toast(`세트는 최대 ${OPT_STOCK_SETS_MAX}개까지 (기존 세트 삭제 후 재저장)`);
    return;
  }
  const name = prompt(`세트 이름을 입력하세요 (${sets.length+1}/${OPT_STOCK_SETS_MAX})`, `세트 ${sets.length+1}`);
  if(!name || !name.trim()) return;
  sets.push({ name: name.trim(), stocks: stocks.map(s=>({code:s.code, name:s.name})), ts: Date.now() });
  _saveStockSets(_optMarket, sets);
  _saveActiveSetIdx(_optMarket, sets.length - 1);
  _renderStockSetBar();
  toast(`📦 "${name}" 세트 저장됨 (${stocks.length}종목)`);
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
  toast(`📦 "${set.name}" 세트 로드 (${set.stocks.length}종목)`);
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
  if(lbl) lbl.textContent = `${sets.length}/${OPT_STOCK_SETS_MAX}`;
  if(sets.length === 0){
    bar.innerHTML = '<span style="font-size:9px;color:var(--text3,#999)">저장된 세트 없음 — "현재 저장"으로 추가</span>';
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
let _optMinTrades = 10; // S86: 최소 거래수 필터 (기본 10, 토글 OFF 시 3)
let _optMinWinRate = 60; // S86: 최소 승률 필터 (기본 60%, 토글 OFF 시 0)
let _optMinWinPnl = 2;   // S97: 익절 최소 수익률 필터 (기본 2%, OFF 시 0)
let _optMaxLossPnl = 10;  // S97: 손절 최대 손실률 필터 (기본 10%, OFF 시 999)
let _optPerTradeFilter = true; // S97: 건별 필터 ON/OFF
// S86: 3모드 정렬
let _optSortMode = 'balanced'; // 'profit' | 'balanced' | 'safe'
let _optRegimeMode = 'off'; // 'off' | 'on'
// S100: 사용자 검증 가중치 (수익률/거래수/MDD/승률)
const _OPT_MODE_WEIGHTS = {
  profit:   { pnl:45, trades:35, mdd:15, wr:5 },
  balanced: { pnl:35, trades:45, mdd:15, wr:5 },
  safe:     { pnl:15, trades:35, mdd:45, wr:5 }
};
let _optCustomWeights = null; // null이면 모드 기본값 사용
// S100: 사용자 검증 타이브레이커 (순위)
const _OPT_MODE_TIEBREAK_DEFAULTS = {
  profit:   { pnl:1, trades:2, mdd:3, wr:4 },
  balanced: { pnl:2, trades:1, mdd:3, wr:4 },
  safe:     { pnl:3, trades:2, mdd:1, wr:4 }
};
const _OPT_MODE_TIEBREAK = {
  profit:   { pnl:1, trades:2, mdd:3, wr:4 },
  balanced: { pnl:2, trades:1, mdd:3, wr:4 },
  safe:     { pnl:3, trades:2, mdd:1, wr:4 }
};
const _OPT_MODES = {
  profit:   { label:'🔥 수익형', desc:'수익률 > 거래수 > MDD > 승률' },
  balanced: { label:'⚖️ 안정형', desc:'거래수 > 수익률 > MDD > 승률' },
  safe:     { label:'🛡️ 보수형', desc:'MDD↓ > 거래수 > 수익률 > 승률' },
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
  if(closed.length === 0) return { ...r, totalTrades:0, winRate:0, totalPnl:0, mdd:0, trades:valid };
  const wins = closed.filter(t => t.type === 'WIN').length;
  const totalPnl = closed.reduce((s,t) => s + (t.pnl||0), 0);
  // MDD 재계산: 거래 순서대로 equity curve 재구성
  let eq = 100, peak = 100, maxDD = 0;
  closed.forEach(t => {
    eq *= (1 + (t.pnl||0) / 100);
    if(eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if(dd > maxDD) maxDD = dd;
  });
  return {
    ...r,
    totalTrades: closed.length,
    winRate: Math.round(wins / closed.length * 100 * 10) / 10,
    totalPnl: Math.round(totalPnl * 100) / 100,
    mdd: Math.round(maxDD * 100) / 100,
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

function _countCombinations(ranges){
  const keys = Object.keys(ranges).filter(k=>ranges[k].enabled);
  if(keys.length===0) return 1;
  let count = 1;
  keys.forEach(k=>{
    const r = ranges[k];
    // S101-fix: Math.round로 부동소수 오차 제거 (step=0 또는 max≤min은 1로)
    const steps = (r.step <= 0 || r.max <= r.min) ? 1 : (Math.round((r.max - r.min) / r.step) + 1);
    count *= steps;
  });
  return count;
}

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
    // S114: 프리셋 파라미터 분기
    //   OPT_PRESETS에 정의된 파라미터(sellTh/rsiLen/atrLen/maShort/maMid/maLong):
    //     → min~max~step input 대신 칩 버튼으로 표시
    //   그 외(buyTh/bbLen/bbMult/tpMult/slMult):
    //     → 기존 min~max~step input 유지
    // ════════════════════════════════════════════════════════════
    const isPreset = OPT_PRESET_KEYS.includes(k);
    let valueArea = '';
    if(isPreset){
      // 프리셋 칩 영역
      const presetSet = _optPresetSelected[k] || new Set();
      const chips = OPT_PRESETS[k].map(v => {
        const sel = presetSet.has(v);
        const chipStyle = sel
          ? 'background:var(--accent,#2563eb);color:#fff;border:1px solid var(--accent,#2563eb)'
          : 'background:var(--surface2,#eee);color:var(--text3,#999);border:1px solid var(--border,#ddd)';
        return `<span class="opt-preset-chip" onclick="_optTogglePresetChip('${k}',${v})" style="display:inline-block;padding:3px 9px;margin:0 2px;border-radius:12px;font-size:11px;font-weight:600;cursor:${locked?'not-allowed':'pointer'};${chipStyle}${locked?';pointer-events:none':''}">${v}</span>`;
      }).join('');
      valueArea = `<div id="optPresetChips_${k}" style="flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:2px">${chips}</div>`;
    } else {
      // 기존 범위 input (BUY/BB/BB×/TP/SL)
      valueArea = `<input type="number" id="optMin_${k}" value="${d.min}" step="${step}" style="width:38px" ${locked?'disabled':''}>
      <span class="opt-dash">~</span>
      <input type="number" id="optMax_${k}" value="${d.max}" step="${step}" style="width:38px" ${locked?'disabled':''}>
      <span class="opt-dash">s</span>
      <input type="number" id="optStep_${k}" value="${d.step}" step="${step}" style="width:34px" ${locked?'disabled':''}>`;
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
        <div class="opt-section-title">🎛️ 파라미터 범위</div>
        ${paramRows}
        <div class="opt-info" id="optComboInfo">조합 수 계산 중...</div>
      </div>

      <!-- 실행 -->
      <div class="opt-section" id="optControlSection">
        <div id="optCandleBar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <span id="optCandleStatus" style="font-size:10px;color:var(--text2,#666)">📦 캔들 캐시: 확인 중...</span>
          <span style="font-size:10px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optRefreshCandles()">🔄 캔들 갱신</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optMinTradesToggle" checked onchange="_optUpdateMinTrades()"><span class="st-track"></span></label>
          <div style="flex:1"><span style="font-size:10px;color:var(--text,#222);font-weight:600">거래수 최소 10건 필터</span><br><span style="font-size:9px;color:var(--text3,#999)">ON: 거래수 10 미만 결과 제외 (과적합 방지)</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optMinWinRateToggle" checked onchange="_optUpdateMinWinRate()"><span class="st-track"></span></label>
          <div style="flex:1"><span style="font-size:10px;color:var(--text,#222);font-weight:600">승률 60% 미만 필터</span><br><span style="font-size:9px;color:var(--text3,#999)">ON: 승률 60% 미만 결과 제외</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:var(--surface2,#f5f5f5);border-radius:6px;border:1px solid var(--border,#e0e0e0)">
          <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="optPerTradeToggle" checked onchange="_optUpdatePerTradeFilter()"><span class="st-track"></span></label>
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
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:10px;color:var(--text2,#666);font-weight:600;white-space:nowrap">🔁 반복</span>
          <input type="number" id="optRepeatCount" value="1" min="1" max="99" style="width:42px;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:11px;text-align:center;background:var(--surface2,#f5f5f5);color:var(--text,#222)">
          <span style="font-size:9px;color:var(--text3,#999)">회</span>
          <span style="margin-left:auto"><span style="font-size:9px;padding:3px 8px;border-radius:4px;cursor:pointer;background:var(--surface2,#f0f0f0);color:var(--text2,#666);border:1px solid var(--border,#ddd)" onclick="_optUnlockAll()">🔓 전체 해제</span></span>
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
//  채희창 설계: "체크된 것만 전체 조합, 나머지는 순차"
//  효과: 핵심 파라미터 상호작용을 완전 탐색 + 나머지는 빠른 순차
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// S113-e: 동반자 탐색 체크박스 토글 (라디오 방식)
//   채희창 설계:
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

  const total = combos.length * tfs.length * 2 * codes.length; // ×종목수
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
        else done += combos.length; // 캔들 없으면 스킵
      }

      const validCodes = Object.keys(codeRows);
      if(validCodes.length === 0){ done += combos.length * codes.length; continue; }

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
            let r = sxRunBtEngine(codeRows[code], tf, btParams, { slippage:0.001, nextBarEntry:false });
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

      const validCodes = codes.filter(c => candleCache[`${c}_${tf}`]);
      if(validCodes.length === 0){ done += combos.length * codes.length; continue; }

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
            let r = sxRunBtEngine(candleCache[`${code}_${tf}`], tf, btParams, { slippage:0.001, nextBarEntry:false });
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
  }

  // 복원
  _saveAnalParams(origParams);
  SXE.setRegimeAdapt(origRegime);

  _running = false;
  cancelBtn.style.display='none'; prog.style.display='none'; progText.style.display='none';
  runBtn.style.display='block';

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
  if(_running) return;
  _optVib(20);
  const market = _optMarket;
  const codes = _optSelectedCodes.length > 0 ? [..._optSelectedCodes] : (_optSelectedCode ? [_optSelectedCode] : []);
  if(codes.length === 0){ toast('종목을 선택하세요 (칩 탭)'); return; }
  const tfs = _getSelectedTFs();
  if(tfs.length===0){ toast('TF를 하나 이상 선택하세요'); return; }

  const repeatCount = Math.max(1, parseInt(document.getElementById('optRepeatCount')?.value||'1'));
  const isCoin = market === 'coin';

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
  //   채희창 아이디어: "남은 시간보다 얼마나 지났나를 보게"
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
  //   채희창 설계: "체크 1개 = 모든 Step에 따라다니며 2D 탐색"
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
      if(unlocked.length === 0){ toast('모든 파라미터가 잠겨 있습니다'); break; }

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
        if(combos.length <= 1){
          // S98: 범위 1개(고정값)면 탐색 불필요 — baseParams에 값 반영
          const fixedVal = ranges[paramKey].min;
          baseParams[paramKey] = fixedVal;
          if(statusEl){ statusEl.textContent = '—'; statusEl.style.color = 'var(--text3,#999)'; }
          progText.textContent = `${roundLabel} ${paramLabel} — 고정 ${fixedVal}, 스킵`;
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
            const validCodes = codes.filter(c => candleCache[`${c}_${tf}`]);
            if(validCodes.length === 0){ done += combos.length * codes.length; continue; }
            // S115: 파라미터별 BT 봉수 계산 (동반자면 max 사용)
            const _targetBars = useCompanion
              ? _optGetCombinedBars(paramKey, _companionKey)
              : _optGetParamBars(paramKey);
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,vc=0;
              for(const code of validCodes){
                // S115: 파라미터별 봉수 슬라이스 — rows 길이가 충분하면 잘라서 BT 가속
                const fullRows = candleCache[`${code}_${tf}`];
                const slicedRows = (fullRows && fullRows.length > _targetBars) ? fullRows.slice(-_targetBars) : fullRows;
                try{ let r=sxRunBtEngine(slicedRows,tf,btP,{slippage:0.001,nextBarEntry:false}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOff[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),error:null},_stockCount:vc});
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
            const validCodes = codes.filter(c => candleCache[`${c}_${tf}`]);
            if(validCodes.length === 0){ done += combos.length * codes.length; continue; }
            // S115: 파라미터별 BT 봉수 계산 (동반자면 max 사용)
            const _targetBars = useCompanion
              ? _optGetCombinedBars(paramKey, _companionKey)
              : _optGetParamBars(paramKey);
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,vc=0;
              for(const code of validCodes){
                // S115: 파라미터별 봉수 슬라이스
                const fullRows = candleCache[`${code}_${tf}`];
                const slicedRows = (fullRows && fullRows.length > _targetBars) ? fullRows.slice(-_targetBars) : fullRows;
                try{ let r=sxRunBtEngine(slicedRows,tf,btP,{slippage:0.001,nextBarEntry:false}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOn[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),error:null},_stockCount:vc});
              if(done%5===0){ progText.textContent=`${roundLabel} ${paramLabel} [ON][${tf}] ${done}/${total} [${_targetBars}봉]`; await _sleep(0); }
            }
          }
        }

        // 이 파라미터의 최적값 추출 (TOP1)
        const merged = [];
        const addM = (res, regime) => { if(!res) return; Object.entries(res).forEach(([tf2,arr])=>{ if(Array.isArray(arr)) arr.filter(r=>r.bt&&r.bt.totalTrades>=_optMinTrades&&r.bt.winRate>=_optMinWinRate).forEach(r=>merged.push({...r,regime,tf:tf2})); }); };
        addM(tfResOff, 'OFF'); addM(tfResOn, 'ON');
        if(merged.length > 0){
          merged.sort((a,b) => _optSortCompare(b.bt, a.bt, _optSortMode));
          const best = merged[0];
          const bestVal = best.params[paramKey];
          if(bestVal !== undefined){
            baseParams[paramKey] = bestVal;
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
  }

  // 복원 (기본 파라미터는 baseParams로 업데이트)
  _saveAnalParams({...origParams, ...baseParams, ..._optLocked});
  SXE.setRegimeAdapt(origRegime);
  if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  if(typeof updateAnalParamBadge === 'function') updateAnalParamBadge();

  _running = false;
  cancelBtn.style.display='none'; prog.style.display='none';
  runBtn.style.display='block';
  _optRenderLockedBar();
  _optUpdateCount();
  _optRenderBestCards();

  // S113: 스톱워치 정리 + 총 경과 시간 계산
  if(window._optStopwatchTimer){
    clearInterval(window._optStopwatchTimer);
    window._optStopwatchTimer = null;
  }
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

  for(const code of selCodes){
    for(const tf of tfs){
      if(statusEl) statusEl.innerHTML = `🔄 캔들 수집 중... ${done}/${total} (${code} ${tf})`;
      // S113: 600봉 확장 수집 (KV 양방향 공유)
      //   _fetchExtCandles로 경로 A/B/C 자동 분기
      //   → 일봉: 200→400→600 3단계 (KV 블록 3개 저장)
      //   → 주봉/월봉: 400봉
      //   → 해외: 300봉 단일 (경로 D)
      try {
        const stock = { code, market: isCoin ? 'coin' : (currentMarket === 'us' ? 'us' : 'kr') };
        const r = await _fetchExtCandles(stock, tf, false);
        if(r.ok && r.rows && r.rows.length > 0){
          _saveCachedCandle(code, tf, r.rows);
        }
      } catch(e){ console.warn('[S113-opt] 수동 갱신 예외:', e); }
      done++;
    }
  }

  if(runBtn) runBtn.disabled = false;
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

  for(let i=0; i<toFetch.length; i++){
    const {code, tf} = toFetch[i];
    if(progText) progText.textContent = `캔들 수집 ${i+1}/${toFetch.length} (${code} ${tf}, 최대 600봉)...`;
    // S113: _fetchExtCandles로 경로 A/B/C 자동 분기
    //   → 일봉: 200→400→600 3단계 (2초 대기 포함)
    //   → 주봉/월봉: 400봉
    //   → KV 블록 자동 저장 (30일 TTL, 다른 모듈과 양방향 공유)
    try {
      const stock = { code, market: isCoin ? 'coin' : (currentMarket === 'us' ? 'us' : 'kr') };
      const r = await _fetchExtCandles(stock, tf, false);
      if(r.ok && r.rows && r.rows.length > 0){
        _saveCachedCandle(code, tf, r.rows);
      }
    } catch(e){ console.warn('[S113-opt] 프리로드 예외:', e); }
    await _sleep(0);
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
  const total = combos.length * tfs.length * 2 * codes.length;

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
      if(validCodes.length===0){ done+=combos.length*codes.length; continue; }
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        let sumWR=0,sumPnl=0,sumTr=0,sumMdd=0,vc=0;
        for(const code of validCodes){
          try { let r=sxRunBtEngine(codeRows[code],tf,btP,{slippage:0.001,nextBarEntry:false}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
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
      const validCodes = codes.filter(c=>candleCache[`${c}_${tf}`]);
      if(validCodes.length===0){done+=combos.length*codes.length;continue;}
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        let sumWR=0,sumPnl=0,sumTr=0,sumMdd=0,vc=0;
        for(const code of validCodes){
          try { let r=sxRunBtEngine(candleCache[`${code}_${tf}`],tf,btP,{slippage:0.001,nextBarEntry:false}); if(_optPerTradeFilter&&r&&r.trades)r=_optFilterBtResult(r); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
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
// S101: 사진2 기준 — 수익 45/35/15/5, 안정 35/45/15/5, 보수 15/35/45/5
function _optResetWeights(){
  _optVib(15);
  const defaults = {
    profit:   { pnl:45, trades:35, mdd:15, wr:5 },
    balanced: { pnl:35, trades:45, mdd:15, wr:5 },
    safe:     { pnl:15, trades:35, mdd:45, wr:5 }
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
function _optInitWeights(){
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
//  S99-5: OPT_BEST V3 — 모드별 6cap + ★대표
//  구조: { mode → { ranks: [max6], representId } }
//  ranks 각 항목: {id, market, tf, regime, params, score, winRate, totalPnl, totalTrades, mdd, code, ts, filter}
// ═══════════════════════════════════════════
const OPT_BEST_KEY_V3 = 'SX_OPT_BEST3';
const OPT_BEST_KEY_V2 = 'SX_OPT_BEST2'; // 하위호환 — 읽기전용, 마이그레이션 소스
const OPT_BEST_MAX_RANKS = 6;

function _genOptId(){ return 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

function _loadOptBest(){ try{ return JSON.parse(localStorage.getItem(OPT_BEST_KEY_V3))||{}; }catch(_){ return {}; } }
function _saveOptBest(d){ try { localStorage.setItem(OPT_BEST_KEY_V3, JSON.stringify(d)); } catch(_){} }

// V2→V3 마이그레이션 (최초 1회)
function _migrateOptBestV2toV3(){
  // 이미 V3가 있으면 스킵
  const existing = _loadOptBest();
  if(existing && Object.keys(existing).length > 0) return;
  let v2;
  try { v2 = JSON.parse(localStorage.getItem(OPT_BEST_KEY_V2)) || {}; } catch(_){ return; }
  if(!v2 || Object.keys(v2).length === 0) return;

  const v3 = {};
  const modes = ['profit','balanced','safe'];
  // V2: market → tf → mode → regime → entry
  for(const [market, tfObj] of Object.entries(v2)){
    if(!tfObj || typeof tfObj !== 'object') continue;
    for(const [tf, modeObj] of Object.entries(tfObj)){
      if(!modeObj || typeof modeObj !== 'object') continue;
      for(const [mode, regimeObj] of Object.entries(modeObj)){
        if(!modes.includes(mode) || !regimeObj || typeof regimeObj !== 'object') continue;
        for(const [regime, entry] of Object.entries(regimeObj)){
          if(!entry || !entry.params) continue;
          if(!v3[mode]) v3[mode] = { ranks:[], representId:null };
          v3[mode].ranks.push({
            id: _genOptId(),
            market, tf, regime,
            params: entry.params,
            score: entry.score || 0,
            winRate: entry.winRate || 0,
            totalPnl: entry.totalPnl || 0,
            totalTrades: entry.totalTrades || 0,
            mdd: entry.mdd || 0,
            code: entry.code || '',
            ts: entry.ts || Date.now(),
            filter: entry.filter || null
          });
        }
      }
    }
  }
  // 모드별 score 내림차순 정렬 + 6cap
  modes.forEach(m => {
    if(!v3[m]) return;
    v3[m].ranks.sort((a,b) => (b.score||0) - (a.score||0));
    if(v3[m].ranks.length > OPT_BEST_MAX_RANKS) v3[m].ranks = v3[m].ranks.slice(0, OPT_BEST_MAX_RANKS);
    // 1위를 기본 대표로 선정
    if(v3[m].ranks.length > 0) v3[m].representId = v3[m].ranks[0].id;
  });
  _saveOptBest(v3);
}

// 앱 시작 시 마이그레이션 실행
_migrateOptBestV2toV3();

// 신규 entry 추가/갱신 — 6cap 내에서 score 기준 관리
function _updateOptBest(market, tf, mode, regime, entry){
  const all = _loadOptBest();
  if(!all[mode]) all[mode] = { ranks:[], representId:null };
  const bucket = all[mode];

  // 동일 조건(market+tf+regime) 기존 항목 찾기
  const existIdx = bucket.ranks.findIndex(r => r.market===market && r.tf===tf && r.regime===regime);

  if(existIdx >= 0){
    // 기존 기록보다 같거나 높을 때만 갱신
    if(entry.score >= (bucket.ranks[existIdx].score||0)){
      bucket.ranks[existIdx] = { ...bucket.ranks[existIdx], ...entry, market, tf, regime };
    } else {
      return false;
    }
  } else {
    // 새 항목
    const newEntry = { id:_genOptId(), market, tf, regime, ...entry };
    if(bucket.ranks.length < OPT_BEST_MAX_RANKS){
      bucket.ranks.push(newEntry);
    } else {
      // 6개 꽉참 → 최하위보다 높으면 교체
      bucket.ranks.sort((a,b) => (b.score||0) - (a.score||0));
      const worst = bucket.ranks[bucket.ranks.length - 1];
      if(entry.score > (worst.score||0)){
        // 대표가 삭제되는 경우 대표 해제
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

  const _clrModeNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const _clrModeName = _clrModeNames[_optSortMode] || '';
  // 버튼은 항상 노출
  let html=`<div style="display:flex;gap:6px;margin-bottom:6px">
    <span style="font-size:9px;color:var(--sell,#e74c3c);cursor:pointer;text-decoration:underline" onclick="_optClearBest()">${_clrModeName} 기록 초기화</span>
    <span style="font-size:9px;color:var(--text3,#999);cursor:pointer;text-decoration:underline" onclick="_optResetPreset()">${_clrModeName} 프리셋 초기화</span>
    <span style="flex:1"></span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optImportBest()">파일 불러오기</span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optExportBest()">파일 저장</span>
  </div>`;

  const modes = ['profit','balanced','safe'];
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mktIcons={kr:'🇰🇷',us:'🇺🇸',coin:'🪙'};
  const _defLabels={rsiLen:'RSI',bbLen:'BB',bbMult:'BB×',atrLen:'ATR',maShort:'MA단',maMid:'MA중',maLong:'MA장',buyTh:'BUY',sellTh:'SELL',tpMult:'TP',slMult:'SL'};

  // TF 라벨 (전 시장 통합)
  const tfLabels={};
  if(typeof TF_MAP!=='undefined'){
    ['kr','us','coin'].forEach(mk=>{(TF_MAP[mk]||[]).forEach(t=>{tfLabels[t.k]=t.l;});});
  }

  let hasAny = false;
  // S100: 현재 선택 모드만 표시 (모드 탭으로 전환)
  html += `<div style="font-size:11px;font-weight:700;color:var(--text,#222);margin-bottom:6px">🏆 최고기록 (모드별 최대 ${OPT_BEST_MAX_RANKS}개 · ★대표 = 분석/BT 적용)</div>`;
  // 모드 탭
  html += `<div style="display:flex;gap:0;margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid var(--border,#e0e0e0)">`;
  modes.forEach(mode=>{
    const act = mode===_optSortMode;
    const bg = act ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#f0f0f0);color:var(--text2,#666)';
    const cnt = (all[mode]&&all[mode].ranks) ? all[mode].ranks.length : 0;
    html += `<div style="flex:1;padding:6px 4px;font-size:10px;font-weight:600;cursor:pointer;text-align:center;${bg}" onclick="_optBestTabSwitch('${mode}')">${mIcons[mode]} ${mNames[mode]} <span style="font-size:8px;opacity:.7">${cnt}/${OPT_BEST_MAX_RANKS}</span></div>`;
  });
  html += `</div>`;

  // 현재 모드 카드만 렌더
  const curMode = _optSortMode;
  const bucket = all[curMode];
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
      const mktNames2={kr:'국내',us:'해외',coin:'코인'};
      const mktTag = (mktIcons[e.market]||'') + ' ' + (mktNames2[e.market]||e.market||'');
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
          <span style="font-size:11px;font-weight:700">${idx+1}. ${mktTag} ${tfTag} ${regTag}${repBadge}</span>
          <span style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:700;color:var(--accent,#2563eb)">${(e.score||0).toFixed(1)}pt</span>
            <span style="font-size:11px;cursor:pointer;line-height:1" onclick="_optToggleRepresent('${curMode}','${eId}')" title="${isRep?'대표 해제':'대표 선정'}">${isRep?'★':'☆'}</span>
            <span style="font-size:11px;color:var(--text3,#999);cursor:pointer;line-height:1" onclick="_optDeleteBestOne('${curMode}','${eId}')">✕</span>
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
// S100: 최고기록 탭 전환 (모드 게이트와 독립 — 같은 모드여도 렌더)
function _optBestTabSwitch(mode){
  _optVib(10);
  _optSortMode = mode;
  _optRenderModeGate(); // 상단 탐색 모드 게이트도 동기화
  _optRenderBestCards();
}
window._optBestTabSwitch = _optBestTabSwitch;
// ★ 대표 선정/해제 토글
function _optToggleRepresent(mode, entryId){
  _optVib(15);
  // S103-fix: 진동이 OS로 전달될 시간 확보 후 confirm 모달 (체감 "진동 먼저 → 모달 나중")
  setTimeout(()=>_optToggleRepresentCore(mode, entryId), 30);
}
function _optToggleRepresentCore(mode, entryId){
  const all = _loadOptBest();
  if(!all[mode] || !all[mode].ranks) return;
  const bucket = all[mode];
  const entry = bucket.ranks.find(r => r.id === entryId);
  if(!entry) return;

  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const mktIcons={kr:'🇰🇷',us:'🇺🇸',coin:'🪙'};
  const tfLabels={};
  if(typeof TF_MAP!=='undefined') ['kr','us','coin'].forEach(mk=>{(TF_MAP[mk]||[]).forEach(t=>{tfLabels[t.k]=t.l;});});

  if(bucket.representId === entryId){
    // 해제 — 리스트 유지, 대표만 해제, 현재 모드이면 기본 하드코딩(모드+레짐)으로 복원
    if(!confirm(`★ 대표 해제\n\n${mIcons[mode]} ${mNames[mode]} 대표를 해제합니다.\n기본 하드코딩(현재 레짐 기준)으로 복원됩니다.\n\n해제하시겠습니까?`)) return;
    bucket.representId = null;
    _saveOptBest(all);
    // S100: 현재 분석 모드가 해제된 모드와 같으면 모드+레짐 기본값으로 복원
    if(typeof _analMode !== 'undefined' && _analMode === mode){
      const regOn = (typeof SXE !== 'undefined' && SXE.regimeAdaptEnabled) ? SXE.regimeAdaptEnabled() : false;
      let _def = null;
      if(typeof _getModeRegimeDefaults === 'function'){
        _def = _getModeRegimeDefaults(mode, regOn);
      } else if(typeof SCR_ANAL_MODE_DEFAULTS !== 'undefined' && SCR_ANAL_MODE_DEFAULTS[mode]){
        _def = SCR_ANAL_MODE_DEFAULTS[mode];
      }
      if(_def && typeof _saveAnalParams === 'function'){
        _saveAnalParams({..._def});
        if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
      }
    }
    _optRenderBestCards();
    toast(`${mNames[mode]} 대표 해제 · 기본값 복원`);
  } else {
    // 선정 — params 즉시 적용
    const tfTag = tfLabels[entry.tf] || entry.tf || '';
    const mktTag = mktIcons[entry.market] || '';
    const regTag = entry.regime==='ON' ? '⚡ON' : '⚡OFF';
    const msg = `★ 대표 프리셋 선정\n\n${mktTag} ${tfTag} ${regTag} (${(entry.score||0).toFixed(1)}pt)\n승률 ${(entry.winRate||0).toFixed(1)}% · 수익 ${(entry.totalPnl||0)>=0?'+':''}${(entry.totalPnl||0).toFixed(1)}% · MDD ${entry.mdd||0}%\n\n${mIcons[mode]}${mNames[mode]} 모드에서\n이 파라미터로 분석/BT가 실행됩니다.\n레짐 상태도 ${regTag}로 자동 전환됩니다.\n\n선정하시겠습니까?`;
    if(!confirm(msg)) return;
    bucket.representId = entryId;
    _saveOptBest(all);
    // S100: 대표 레짐을 전역 적용 (설정탭 스위치 자동 동기화)
    if(entry.regime){
      const regOn = (entry.regime === 'ON' || entry.regime === true);
      if(typeof SXE !== 'undefined' && SXE.setRegimeAdapt) SXE.setRegimeAdapt(regOn);
      try { localStorage.setItem('SX_REGIME_ADAPT', regOn ? '1' : '0'); } catch(_){}
      if(typeof _syncRegimeToggleUI === 'function') _syncRegimeToggleUI();
    }
    // 현재 모드이면 즉시 params 적용
    if(typeof _analMode !== 'undefined' && _analMode === mode && entry.params){
      _saveAnalParams(entry.params);
      if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
    }
    _optRenderBestCards();
    toast(`★ ${mNames[mode]} 대표 선정 · 파라미터+레짐 적용됨`);
  }
}

function _optClearBest(){
  _optVib(15);
  // S103-fix4: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(_optClearBestCore, 30);
}
function _optClearBestCore(){
  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const all = _loadOptBest();
  const targetMode = _optSortMode;
  const bucket = all[targetMode];
  if(!bucket || !bucket.ranks || bucket.ranks.length === 0){ toast('삭제할 기록이 없습니다'); return; }

  // S103-fix3: 대표는 보존, 나머지만 삭제 (대표 해제 후 재호출 시 완전 삭제)
  const repId = bucket.representId || null;
  const hasRep = repId && bucket.ranks.some(r => r.id === repId);
  const delCount = hasRep ? bucket.ranks.length - 1 : bucket.ranks.length;

  if(delCount === 0){
    toast(`★ 대표만 남아있습니다 · 대표 해제 후 다시 시도하세요`);
    return;
  }

  const msg = hasRep
    ? `[${mIcons[targetMode]} ${mNames[targetMode]}] 최고기록 ${delCount}개 삭제\n★ 대표 프리셋은 보존됩니다\n\n계속하시겠습니까?`
    : `[${mIcons[targetMode]} ${mNames[targetMode]}] 최고기록 ${delCount}개를 삭제합니다.\n\n현재 파라미터는 유지됩니다.\n계속하시겠습니까?`;

  if(!confirm(msg)) return;

  if(hasRep){
    // 대표만 남기고 나머지 제거
    const repEntry = bucket.ranks.find(r => r.id === repId);
    bucket.ranks = repEntry ? [repEntry] : [];
    all[targetMode] = bucket;
  } else {
    delete all[targetMode];
  }
  _saveOptBest(all);
  _optRenderBestCards();
  toast(hasRep
    ? `${mNames[targetMode]} ${delCount}개 삭제 · ★ 대표 보존`
    : `${mNames[targetMode]} 기록 초기화됨`);
}

// 프리셋 초기화: 리스트 유지 + 대표 해제 + 기본 하드코딩 복원
function _optResetPreset(){
  _optVib(15);
  // S103-fix4: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(_optResetPresetCore, 30);
}
function _optResetPresetCore(){
  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const targetMode = _optSortMode;

  if(!confirm(`[${mIcons[targetMode]} ${mNames[targetMode]}] 프리셋 초기화\n\n최고기록 리스트는 유지하고\n대표 해제 + 파라미터를 기본값으로 복원합니다.\n\n계속하시겠습니까?`)) return;

  const all = _loadOptBest();
  if(all[targetMode]) all[targetMode].representId = null;
  _saveOptBest(all);
  // 기본 하드코딩 복원
  if(typeof SCR_ANAL_DEFAULTS !== 'undefined') _saveAnalParams({...SCR_ANAL_DEFAULTS});
  if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  _optRenderBestCards();
  toast(`${mNames[targetMode]} 프리셋 초기화 · 기본값 복원`);
}
function _optDeleteBestOne(mode, entryId){
  _optVib(15);
  // S103-fix: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(()=>_optDeleteBestOneCore(mode, entryId), 30);
}
function _optDeleteBestOneCore(mode, entryId){
  const all = _loadOptBest();
  if(!all[mode] || !all[mode].ranks) return;
  const entry = all[mode].ranks.find(r => r.id === entryId);
  if(!entry) return;

  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};

  // S103-fix3: 대표 프리셋은 삭제 차단 (★ 해제 후 삭제 유도)
  if(all[mode].representId === entryId){
    toast(`★ ${mNames[mode]} 대표는 삭제 불가 · ★ 해제 후 삭제하세요`);
    return;
  }

  if(!confirm(`[${mNames[mode]}] 이 프리셋을 삭제하시겠습니까?\n(${(entry.score||0).toFixed(1)}pt)`)) return;

  all[mode].ranks = all[mode].ranks.filter(r => r.id !== entryId);
  // 빈 모드 정리
  if(all[mode].ranks.length === 0) delete all[mode];
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
  a.href=url; a.download=`SX_OPT_BEST3_${ds}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('✅ 최고기록 JSON 저장 완료');
}

// JSON 파일 불러오기 (V3)
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
      // V3 구조 검증: profit/balanced/safe 중 하나 이상 존재
      const modes=['profit','balanced','safe'];
      const hasMode=Object.keys(data).some(k=>modes.includes(k));
      if(!hasMode){ toast('유효한 V3 데이터가 없습니다 (profit/balanced/safe 키 필요)'); return; }
      if(!confirm('현재 최고기록을 불러온 파일로 덮어씁니다.\n계속하시겠습니까?')) return;
      _saveOptBest(data);
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

})();
