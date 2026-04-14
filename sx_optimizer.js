// ════════════════════════════════════════════════════════════
//  sx_optimizer.js v2.5 — 파라미터 자동 최적화 모듈
//  S94: 버전주석정합
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

// ── 기본 설정 (최적화 우선순위 순) ──
const OPT_DEFAULTS = {
  atrLen:  { min:2,   max:50,  step:1,   enabled:false },  // 1. 변동성 기반
  bbMult:  { min:0.5, max:5.0, step:0.1, enabled:false },  // 2. 진입 기준 폭
  tpMult:  { min:0.1, max:10.0,step:0.1, enabled:false },  // 3. 익절폭
  slMult:  { min:0.1, max:5.0, step:0.1, enabled:false },  // 4. 손절폭
  rsiLen:  { min:2,   max:50,  step:1,   enabled:false },   // 5. 시그널 감도
  buyTh:   { min:10,  max:95,  step:1,   enabled:false },   // 6. 진입 점수
  sellTh:  { min:5,   max:90,  step:1,   enabled:false },   // 7. 청산 점수
  bbLen:   { min:5,   max:60,  step:1,   enabled:false },   // 8. 추세 필터
  maShort: { min:2,   max:30,  step:1,   enabled:false },   // 9. MA 단기
  maMid:   { min:5,   max:80,  step:1,   enabled:false },   // 10. MA 중기
  maLong:  { min:10,  max:200, step:1,   enabled:false },   // 11. MA 장기
};

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
    } catch(_){ localStorage.removeItem(k); }
  });
}

function _clearAllCandleCache(){
  const keys = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(CANDLE_CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
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
function _saveOptStocks(d){ localStorage.setItem(OPT_STOCKS_KEY, JSON.stringify(d)); }
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

// ── 상태 ──
let _running = false;
let _cancelled = false;
let _results = [];
let _optMarket = 'kr'; // 현재 optimizer 시장
let _optSelectedCode = ''; // 단일 선택 (하위호환)
let _optSelectedCodes = []; // S86: 복수 선택 종목 코드 배열
let _optLocked = {}; // {rsiLen:14, buyTh:60, ...} 고정된 최적값
let _optMinTrades = 10; // S86: 최소 거래수 필터 (기본 10, 토글 OFF 시 3)
let _optMinWinRate = 60; // S86: 최소 승률 필터 (기본 60%, 토글 OFF 시 0)
// S86: 3모드 정렬
let _optSortMode = 'balanced'; // 'profit' | 'balanced' | 'safe'
let _optRegimeMode = 'off'; // 'off' | 'on'
// S90: 모드별 기본 가중치 + 커스텀 지원
const _OPT_MODE_WEIGHTS = {
  profit:   { pnl:45, trades:30, wr:20, mdd:5 },
  balanced: { pnl:35, trades:25, mdd:25, wr:15 },
  safe:     { mdd:45, pnl:30, wr:20, trades:5 }
};
let _optCustomWeights = null; // null이면 모드 기본값 사용
const _OPT_MODES = {
  profit:   { label:'🔥 수익형', desc:'수익률 > 거래수 > MDD > 승률' },
  balanced: { label:'⚖️ 안정형', desc:'거래수 > 수익률 > MDD > 승률' },
  safe:     { label:'🛡️ 보수형', desc:'MDD↓ > 수익률 > 거래수 > 승률' },
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
  const mddSafe = 100 - Math.min(bt.mdd || 0, 100);

  // 커스텀 가중치가 있으면 사용, 없으면 모드 기본값
  const w = _optCustomWeights || _OPT_MODE_WEIGHTS[mode] || _OPT_MODE_WEIGHTS.balanced;
  return pnl * (w.pnl||0)/100 + trades * (w.trades||0)/100 + wr * (w.wr||0)/100 + mddSafe * (w.mdd||0)/100;
}

// S92: 10% 대역 + 모드별 다단계 타이브레이커
// 종합점수 차이가 10% 이내면 동점 → 모드별 우선순위 지표로 비교
// 수익형: 수익률 > 거래수 > MDD(↓) > 승률
// 안정형: 수익률 > 승률 > 거래수 > MDD(↓)
// 보수형: MDD(↓) > 승률 > 거래수 > 수익률
function _optSortCompare(a, b, mode){
  const sa = _optSortScore(a, mode);
  const sb = _optSortScore(b, mode);
  const maxS = Math.max(Math.abs(sa), Math.abs(sb), 0.001);
  const isTied = Math.abs(sa - sb) / maxS <= 0.10;
  if(!isTied) return sa - sb;
  // 동점 → 모드별 타이브레이커
  const pnlA = a.totalPnl||0, pnlB = b.totalPnl||0;
  const trdA = a.totalTrades||0, trdB = b.totalTrades||0;
  const mddA = a.mdd||0, mddB = b.mdd||0;
  const wrA  = a.winRate||0, wrB  = b.winRate||0;
  let order;
  if(mode==='profit')       order = [[pnlA,pnlB,1],[trdA,trdB,1],[mddA,mddB,-1],[wrA,wrB,1]];
  else if(mode==='safe')    order = [[mddA,mddB,-1],[wrA,wrB,1],[trdA,trdB,1],[pnlA,pnlB,1]];
  else /* balanced */        order = [[pnlA,pnlB,1],[wrA,wrB,1],[trdA,trdB,1],[mddA,mddB,-1]];
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
function _generateCombinations(ranges){
  const keys = Object.keys(ranges).filter(k=>ranges[k].enabled);
  if(keys.length===0) return [{}];

  const vals = {};
  keys.forEach(k=>{
    const r = ranges[k];
    vals[k] = [];
    for(let v=r.min; v<=r.max; v+=r.step){
      vals[k].push(['bbMult','tpMult','slMult'].includes(k) ? parseFloat(v.toFixed(1)) : Math.round(v));
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
    const steps = Math.max(1, Math.floor((r.max - r.min) / Math.max(r.step, 0.001)) + 1);
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

  // TF 칩 HTML
  const tfChips = btTfs.map((t,i)=>`<div class="opt-tf-chip${i===0?' active':''}" data-tf="${t.k}" onclick="_optToggleTF(this)">${t.l}</div>`).join('');

  // 파라미터 범위 행 HTML
  const paramRows = Object.entries(OPT_DEFAULTS).map(([k,d])=>{
    const labels = {rsiLen:'RSI 기간',bbLen:'BB 기간',bbMult:'BB 배수',atrLen:'ATR 기간',maShort:'MA 단기',maMid:'MA 중기',maLong:'MA 장기',buyTh:'BUY 임계',sellTh:'SELL 임계',tpMult:'TP 배수',slMult:'SL 배수'};
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const step = isFloat ? '0.1' : '1';
    const locked = _optLocked.hasOwnProperty(k);
    const lockStyle = locked ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#eee);color:var(--text3,#999)';
    const lockLabel = locked ? `🔒${_optLocked[k]}` : '🔓';
    const rowOpacity = locked ? 'opacity:0.4' : '';
    return `<div class="opt-row" id="optRow_${k}" style="${rowOpacity}">
      <label style="min-width:65px;font-weight:600">${labels[k]||k}</label>
      <input type="number" id="optMin_${k}" value="${d.min}" step="${step}" style="width:38px" ${locked?'disabled':''}>
      <span class="opt-dash">~</span>
      <input type="number" id="optMax_${k}" value="${d.max}" step="${step}" style="width:38px" ${locked?'disabled':''}>
      <span class="opt-dash">s</span>
      <input type="number" id="optStep_${k}" value="${d.step}" step="${step}" style="width:34px" ${locked?'disabled':''}>
      <span id="optLock_${k}" style="font-size:10px;padding:2px 5px;border-radius:4px;cursor:pointer;white-space:nowrap;${lockStyle}" onclick="_optToggleLock('${k}')">${lockLabel}</span>
      <span id="optStatus_${k}" style="font-size:9px;font-weight:600;white-space:nowrap;min-width:28px;text-align:right"></span>
    </div>`;
  }).join('');

  overlay.innerHTML = `<div class="opt-panel">
    <div class="opt-header"><h3>⚡ 자동 최적화</h3><span class="opt-close" onclick="_closeOpt()">✕</span></div>
    <div class="opt-body">
      <!-- 논스톱 안내 -->
      <div class="opt-info" style="margin-bottom:8px;line-height:1.6">🔁 <b>논스톱 순차탐색</b> — 위에서부터 자동으로 최적값을 찾습니다.<br>🔒 잠금 해제하면 해당 파라미터만 재탐색합니다.</div>

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
        <!-- S90: 레짐 탐색 선택 -->
        <div class="opt-section-title">🔄 레짐 탐색</div>
        <div id="optRegimeGate" style="display:flex;gap:0;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden"></div>
        <!-- S86: 모드 게이트 — 탐색 전 선택 -->
        <div class="opt-section-title">🎯 탐색 모드</div>
        <div id="optModeGate" style="display:flex;gap:0;margin-bottom:10px;border:1px solid var(--border,#ddd);border-radius:8px;overflow:hidden"></div>
        <div id="optModeDesc" style="font-size:9px;color:var(--text3,#999);margin-bottom:4px;text-align:center"></div>
        <!-- S90: 커스텀 가중치 (접기 카드) -->
        <div id="optWeightArea" style="display:none;padding:8px 10px;margin-bottom:8px;background:var(--surface2,#f5f5f5);border-radius:8px;border:1px solid var(--border,#e0e0e0)">
          <div style="font-size:10px;font-weight:600;margin-bottom:8px;color:var(--text2,#666)">모드별 가중치 설정 (수익률 / 거래수 / MDD / 승률 = 합계 100%)</div>
          <div style="display:grid;grid-template-columns:50px 1fr 1fr 1fr 1fr 36px;gap:3px;align-items:center;font-size:9px;text-align:center">
            <span></span><span style="font-weight:600">수익률</span><span style="font-weight:600">거래수</span><span style="font-weight:600">MDD</span><span style="font-weight:600">승률</span><span></span>
            <span style="font-weight:600;text-align:left">🔥수익</span>
            <input type="number" id="optCW_profit_pnl" value="45" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_trades" value="30" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_mdd" value="5" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_profit_wr" value="20" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span id="optCWS_profit" style="font-size:9px;font-weight:600">100</span>
            <span style="font-weight:600;text-align:left">⚖️안정</span>
            <input type="number" id="optCW_balanced_pnl" value="35" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_trades" value="25" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_mdd" value="25" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_balanced_wr" value="15" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <span id="optCWS_balanced" style="font-size:9px;font-weight:600">100</span>
            <span style="font-weight:600;text-align:left">🛡보수</span>
            <input type="number" id="optCW_safe_pnl" value="30" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_trades" value="5" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_mdd" value="45" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
            <input type="number" id="optCW_safe_wr" value="20" min="0" max="100" step="5" style="width:100%;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:10px;text-align:center">
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
  setTimeout(_optUpdateCandleStatus, 100);
}

// ── 모드 전환 ──
let _optMode = 'quick';

// ── 고정 토글 ──
function _optToggleLock(key){
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

// S91: 전체 잠금 해제
function _optUnlockAll(){
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
}

// 고정값 현황 바
function _optRenderLockedBar(){
  const bar = document.getElementById('optLockedBar');
  if(!bar) return;
  const keys = Object.keys(_optLocked);
  if(keys.length === 0){
    bar.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:6px 0">고정된 파라미터 없음 — 탐색 후 🔒 버튼으로 고정하세요</div>';
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
  let totalSteps = 0;
  let paramCount = 0;
  Object.keys(ranges).forEach(k=>{
    if(ranges[k].enabled){
      const r = ranges[k];
      const steps = Math.max(1, Math.floor((r.max - r.min) / Math.max(r.step, 0.001)) + 1);
      totalSteps += steps;
      paramCount++;
    }
  });
  const total = totalSteps * tfs.length * regimeRounds * stockCount * repeatCount;
  const estSec = Math.ceil(total * 0.3);
  const estMin = estSec >= 60 ? `약 ${Math.ceil(estSec/60)}분` : `약 ${estSec}초`;
  const el = document.getElementById('optComboInfo');
  if(el) el.innerHTML = `파라미터 <b>${paramCount}</b>개 × 범위합 <b>${totalSteps}</b> × TF <b>${tfs.length}</b>개 × ${regimeLabel}${stockCount>1?' × <b>'+stockCount+'</b>종목':''}${repeatCount>1?' × <b>'+repeatCount+'</b>회':''} = <b>${total}</b>회 BT (${estMin})`;
};

// ── 범위 읽기 ──
function _readRanges(){
  const ranges = {};
  Object.keys(OPT_DEFAULTS).forEach(k=>{
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
    const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
    const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
    ranges[k] = { min, max, step: Math.max(step, isFloat?0.1:1), enabled: !_optLocked.hasOwnProperty(k) };
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
            const r = sxRunBtEngine(codeRows[code], tf, btParams, { slippage:0.001, nextBarEntry:false });
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
            const r = sxRunBtEngine(candleCache[`${code}_${tf}`], tf, btParams, { slippage:0.001, nextBarEntry:false });
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
  _cancelled = true;
}

// ═══════════════════════════════════════════
//  S91: 논스톱 순차 실행 (파라미터 위→아래, N회 반복)
// ═══════════════════════════════════════════
const _OPT_PARAM_ORDER = Object.keys(OPT_DEFAULTS); // atrLen,bbMult,tpMult,...,maLong

async function _optRunNonstop(){
  if(_running) return;
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

  // 캔들 캐시 자동 갱신
  progText.textContent = '캔들 확인 중...';
  await _optPreloadCandles(codes, tfs, isCoin, progText);
  // 캐시 상태 UI 업데이트
  _optUpdateCandleStatus();

  const origParams = _loadAnalParams();
  const origRegime = SXE.regimeAdaptEnabled();

  // 잠금 안 된 파라미터만 순차 탐색 대상
  const getUnlockedParams = () => _OPT_PARAM_ORDER.filter(k => !_optLocked.hasOwnProperty(k));

  // 현재 기본값 (각 회차 시작 시 적용될 값)
  let baseParams = { ..._loadAnalParams() };
  let lastTfResultsOff = null, lastTfResultsOn = null;

  try {
    for(let round = 1; round <= repeatCount; round++){
      if(_cancelled) break;
      const unlocked = getUnlockedParams();
      if(unlocked.length === 0){ toast('모든 파라미터가 잠겨 있습니다'); break; }

      // S91: 회차 시작 시 상태 표시 초기화
      if(round > 1){
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

        // 진행 표시
        progText.textContent = `[${round}/${repeatCount}회] ${paramLabel} 탐색 중... (${si+1}/${totalSteps})`;
        progFill.style.width = ((round-1)/repeatCount*100 + (si/totalSteps)*(100/repeatCount)).toFixed(1)+'%';

        // S91: 파라미터 행 상태 표시 — 탐색중
        const statusEl = document.getElementById('optStatus_'+paramKey);
        if(statusEl){ statusEl.textContent = '🔍'; statusEl.style.color = 'var(--accent,#2563eb)'; }

        // 이 파라미터만 활성화해서 범위 구성
        const ranges = {};
        _OPT_PARAM_ORDER.forEach(k => {
          const isFloat = ['bbMult','tpMult','slMult'].includes(k);
          const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
          const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
          const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
          ranges[k] = { min, max, step: Math.max(step, isFloat?0.1:1), enabled: (k === paramKey) };
        });

        const combos = _generateCombinations(ranges);
        if(combos.length <= 1){
          // S91: 범위 값 1개면 탐색 불필요
          if(statusEl){ statusEl.textContent = '—'; statusEl.style.color = 'var(--text3,#999)'; }
          progText.textContent = `[${round}/${repeatCount}회] ${paramLabel} — 범위 1개, 스킵`;
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
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,vc=0;
              for(const code of validCodes){
                try{ const r=sxRunBtEngine(candleCache[`${code}_${tf}`],tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOff[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),error:null},_stockCount:vc});
              if(done%5===0){ progText.textContent=`[${round}/${repeatCount}회] ${paramLabel} [OFF][${tf}] ${done}/${total}`; await _sleep(0); }
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
            for(let ci=0; ci<combos.length; ci++){
              if(_cancelled) break;
              const testParams = { ...baseParams, ..._optLocked, ...combos[ci] };
              _saveAnalParams(testParams);
              const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
              let sW=0,sP=0,sT=0,sM=0,vc=0;
              for(const code of validCodes){
                try{ const r=sxRunBtEngine(candleCache[`${code}_${tf}`],tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error&&r.totalTrades>=1){sW+=r.winRate;sP+=r.totalPnl;sT+=r.totalTrades;sM+=(r.mdd||0);vc++;} }catch(_){}
                done++;
              }
              if(vc>0) tfResOn[tf].push({params:{...testParams},bt:{winRate:sW/vc,totalPnl:sP/vc,totalTrades:Math.round(sT/vc),mdd:parseFloat((sM/vc).toFixed(2)),error:null},_stockCount:vc});
              if(done%5===0){ progText.textContent=`[${round}/${repeatCount}회] ${paramLabel} [ON][${tf}] ${done}/${total}`; await _sleep(0); }
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
          // S91: 파라미터 완료마다 최고갱신 카드 업데이트
          if(best.bt){
            const score = _optSortScore(best.bt, _optSortMode);
            const tf = best.tf || (tfs.length>0?tfs[0]:'day');
            const regime = best.regime || 'OFF';
            _updateOptBest(_optMarket, tf, _optSortMode, regime, {
              params:{...baseParams, ..._optLocked},
              score, winRate:best.bt.winRate, totalPnl:best.bt.totalPnl,
              totalTrades:best.bt.totalTrades, mdd:best.bt.mdd,
              regime, code:codes.join(','), ts:Date.now()
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
      if(round < repeatCount && !_cancelled){
        toast(`${round}회차 완료 — ${round+1}회차 시작...`);
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

  // S91: 완료 후 마지막 파라미터의 1~10 리스트 표시
  if(lastTfResultsOff || lastTfResultsOn){
    _renderDualResults(lastTfResultsOff||{}, lastTfResultsOn||{}, codes.join('+'), null, null);
  }

  if(_cancelled){
    progText.style.display='block';
    progText.textContent = `논스톱 중지됨`;
    toast('최적화 중지됨');
  } else {
    progText.style.display='block';
    const rc = parseInt(document.getElementById('optRepeatCount')?.value||'1');
    progText.textContent = `✅ 논스톱 ${rc}회 완료`;
    toast(`✅ 논스톱 ${rc}회 최적화 완료`);
  }
}
function _optUpdateMinTrades(){
  const chk = document.getElementById('optMinTradesToggle');
  _optMinTrades = (chk && chk.checked) ? 10 : 3;
  toast(`거래수 최소 ${_optMinTrades}건 필터 ${_optMinTrades>=10?'ON':'OFF'}`);
}

// S86: 최소 승률 토글
function _optUpdateMinWinRate(){
  const chk = document.getElementById('optMinWinRateToggle');
  _optMinWinRate = (chk && chk.checked) ? 60 : 0;
  toast(`승률 ${_optMinWinRate>0?_optMinWinRate+'% 미만 필터 ON':'필터 OFF'}`);
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
      if(statusEl) statusEl.innerHTML = `🔄 캔들 수집 중... ${done}/${total}`;
      const count = (tf==='week'||tf==='month') ? 400 : 300;
      try {
        const rows = await btFetchCandles(code, isCoin, tf, count);
        if(rows && rows.length > 0) _saveCachedCandle(code, tf, rows);
      } catch(e){}
      done++;
    }
  }

  if(runBtn) runBtn.disabled = false;
  _optUpdateCandleStatus();
  toast(`✅ ${done}개 캔들 갱신 완료`);
}

// 최적화 실행 전 캔들 프리로드 (캐시에 없는 것만 API 호출)
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
    if(progText) progText.textContent = `캔들 수집 ${i+1}/${toFetch.length} (${code} ${tf})...`;
    const count = (tf==='week'||tf==='month') ? 400 : 300;
    try {
      const rows = await btFetchCandles(code, isCoin, tf, count);
      if(rows && rows.length > 0) _saveCachedCandle(code, tf, rows);
    } catch(e){}
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
          try { const r=sxRunBtEngine(codeRows[code],tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
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
          try { const r=sxRunBtEngine(candleCache[`${code}_${tf}`],tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error&&r.totalTrades>=1){sumWR+=r.winRate;sumPnl+=r.totalPnl;sumTr+=r.totalTrades;sumMdd+=(r.mdd||0);vc++;} } catch(_){}
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
  area.style.display='block';
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
  // 잠금이 있으면 초기화 확인
  if(Object.keys(_optLocked).length > 0){
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
    {k:'off',  label:'📴 OFF'},
    {k:'on',   label:'⚡ ON'}
  ];
  gate.innerHTML = opts.map(o=>{
    const act = o.k===_optRegimeMode ? 'background:var(--accent,#2563eb);color:#fff' : 'background:var(--surface2,#f0f0f0);color:var(--text2,#666)';
    return `<div style="flex:1;padding:8px 4px;font-size:11px;font-weight:600;cursor:pointer;text-align:center;${act}" onclick="_optSetRegime('${o.k}')">${o.label}</div>`;
  }).join('');
}
function _optSetRegime(mode){
  _optRegimeMode = mode;
  _optRenderRegimeGate();
  _optUpdateCount();
}

// S90: 커스텀 가중치 슬라이더 동기화
const OPT_WEIGHTS_KEY = 'SX_OPT_WEIGHTS'; // 로컬 저장 키

function _optLoadWeights(){
  try{ const d=JSON.parse(localStorage.getItem(OPT_WEIGHTS_KEY)); if(d) return d; }catch(_){}
  return null;
}
function _optSaveWeightsLocal(d){ localStorage.setItem(OPT_WEIGHTS_KEY, JSON.stringify(d)); }

// 적용 버튼 — 입력값 읽어서 로컬 저장 + _OPT_MODE_WEIGHTS 반영
function _optApplyWeights(){
  const modes = ['profit','balanced','safe'];
  const keys = ['pnl','trades','mdd','wr'];
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
  if(!allValid){ toast('합계가 100%가 아닌 모드가 있습니다'); return; }
  // _OPT_MODE_WEIGHTS에 반영
  modes.forEach(m => { Object.assign(_OPT_MODE_WEIGHTS[m], saved[m]); });
  _optCustomWeights = null; // 모드 기본값이 이미 변경됨
  _optSaveWeightsLocal(saved);
  _optRenderModeGate(); // 설명 텍스트 갱신
  toast('✅ 3모드 가중치 저장됨');
}

// 초기화 — 기본값 복원
function _optResetWeights(){
  const defaults = {
    profit:   { pnl:45, trades:30, wr:20, mdd:5 },
    balanced: { pnl:35, trades:25, mdd:25, wr:15 },
    safe:     { mdd:45, pnl:30, wr:20, trades:5 }
  };
  Object.keys(defaults).forEach(m => { Object.assign(_OPT_MODE_WEIGHTS[m], defaults[m]); });
  localStorage.removeItem(OPT_WEIGHTS_KEY);
  _optCustomWeights = null;
  _optLoadWeightInputs();
  _optRenderModeGate();
  toast('가중치 초기화됨');
}

// 입력칸에 현재 값 로드
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
  });
}

// 커스텀 영역 토글
function _optToggleWeightArea(){
  const area = document.getElementById('optWeightArea');
  if(!area) return;
  if(area.style.display === 'none'){
    area.style.display = 'block';
    _optLoadWeightInputs();
  } else {
    area.style.display = 'none';
  }
}

// 앱 시작 시 로컬에서 가중치 복원
function _optInitWeights(){
  const saved = _optLoadWeights();
  if(saved){
    ['profit','balanced','safe'].forEach(m => {
      if(saved[m]) Object.assign(_OPT_MODE_WEIGHTS[m], saved[m]);
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
      <button class="opt-btn opt-btn-secondary" style="flex:1;padding:8px;font-size:11px" onclick="_optSaveSelected()">프리셋 저장</button>
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
        : '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:var(--surface2,#eee);color:var(--text3,#999);font-weight:600;margin-left:6px">📴OFF</span>';
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
  // S90: 최고기록 자동 갱신
  if(r && r.bt){
    const score = _optSortScore(r.bt, _optSortMode);
    const selTfs = _getSelectedTFs();
    const tf = (r.tf) || (selTfs.length>0?selTfs[0]:'day');
    const regime = r.regime || 'OFF';
    const updated = _updateOptBest(_optMarket, tf, _optSortMode, regime, {
      params:{..._loadAnalParams(), ..._optLocked},
      score, winRate:r.bt.winRate, totalPnl:r.bt.totalPnl, totalTrades:r.bt.totalTrades, mdd:r.bt.mdd,
      regime, code:(_optSelectedCodes||[]).join(','), ts:Date.now()
    });
    if(updated) toast(`🏆 ${tf} ${_OPT_MODES[_optSortMode]?.label||''} ${regime} 최고기록 갱신!`);
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
    tfGrid.innerHTML = btTfs.map((t,i)=>`<div class="opt-tf-chip${i===0?' active':''}" data-tf="${t.k}" onclick="_optToggleTF(this)">${t.l}</div>`).join('');
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
  if(existing){ existing.remove(); return; }
  _optAzItems = _optLoadAllStocks();
  const panel = document.createElement('div');
  panel.id = 'optAzPanel';
  panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:250;background:var(--bg,#fff);display:flex;flex-direction:column;padding:0';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;flex-shrink:0;border-bottom:1px solid var(--border,#e0e0e0)">
      <span style="font-size:14px;color:var(--text,#222);font-weight:700">종목 탐색 (${_PARAM_MARKET_LABELS_SHORT[_optMarket]})</span>
      <span style="font-size:18px;color:var(--text2,#666);cursor:pointer;padding:4px 8px" onclick="document.getElementById('optAzPanel').remove()">✕</span>
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
  document.getElementById('optAzPanel')?.remove();
  _optPickStock(code, name);
}

// 종목 선택 → 자동 저장 + 선택 + 칩 갱신
function _optPickStock(code, name){
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
//  S77: 시장×TF별 1등 기록 카드 표시
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
//  S90: 시장×TF×모드×레짐 최고기록
// ═══════════════════════════════════════════
const OPT_BEST_KEY = 'SX_OPT_BEST2'; // v2: {market:{tf:{mode:{ON/OFF:{params,score,...}}}}}

function _loadOptBest(){ try{ return JSON.parse(localStorage.getItem(OPT_BEST_KEY))||{}; }catch(_){ return {}; } }
function _saveOptBest(d){ localStorage.setItem(OPT_BEST_KEY, JSON.stringify(d)); }

function _updateOptBest(market, tf, mode, regime, entry){
  const all = _loadOptBest();
  if(!all[market]) all[market]={};
  if(!all[market][tf]) all[market][tf]={};
  if(!all[market][tf][mode]) all[market][tf][mode]={};
  const existing = all[market][tf][mode][regime];
  // 기존 기록이 없거나, 새 점수가 같거나 높을 때만 갱신
  if(!existing || entry.score >= (existing.score||0)){
    all[market][tf][mode][regime] = entry;
    _saveOptBest(all);
    return true;
  }
  return false;
}

function _optRenderBestCards(){
  const area = document.getElementById('optBestArea');
  if(!area) return;
  const all = _loadOptBest();
  const mkt = all[_optMarket];
  if(!mkt || Object.keys(mkt).length===0){
    area.innerHTML='<div style="font-size:10px;color:var(--text3,#999);padding:6px 0;text-align:center">최고기록 없음 — 고정 적용 시 자동 기록</div>';
    return;
  }
  const tfLabels={};
  if(typeof TF_MAP!=='undefined')(TF_MAP[_optMarket]||[]).forEach(t=>{tfLabels[t.k]=t.l;});
  const mIcons={profit:'🔥',balanced:'⚖️',safe:'🛡️'};
  const mNames={profit:'수익형',balanced:'안정형',safe:'보수형'};
  const _defLabels={rsiLen:'RSI',bbLen:'BB',bbMult:'BB×',atrLen:'ATR',maShort:'MA단',maMid:'MA중',maLong:'MA장',buyTh:'BUY',sellTh:'SELL',tpMult:'TP',slMult:'SL'};
  const tfOrder=['5m','15m','30m','60m','240m','day','week','month'];

  let html='<div style="font-size:11px;font-weight:700;color:var(--text,#222);margin-bottom:6px">🏆 최고기록 (시장×TF×모드×레짐)</div>';

  const sortedTfs = Object.keys(mkt).sort((a,b)=>(tfOrder.indexOf(a)===-1?99:tfOrder.indexOf(a))-(tfOrder.indexOf(b)===-1?99:tfOrder.indexOf(b)));

  sortedTfs.forEach(tf=>{
    const tfLabel = tfLabels[tf]||tf;
    const modes = mkt[tf];
    if(!modes) return;
    for(const[mode, regimes] of Object.entries(modes)){
      for(const[regime, e] of Object.entries(regimes)){
        if(!e||!e.params) continue;
        const p=e.params;
        const parts=[];
        Object.keys(_defLabels).forEach(k=>{ if(p[k]!==undefined&&p[k]!==0) parts.push(`${_defLabels[k]}${p[k]}`); });
        const paramStr=parts.join(' ')||'기본값';
        const pnlColor=(e.totalPnl||0)>=0?'var(--buy,#27ae60)':'var(--sell,#e74c3c)';
        const regTag=regime==='ON'?'⚡ON':'📴OFF';
        const dateStr=e.ts?new Date(e.ts).toLocaleDateString('ko-KR',{month:'short',day:'numeric'}):'';
        const bestKey=`${tf}_${mode}_${regime}`;

        html+=`<div style="background:var(--surface2,#f8f8f8);border-radius:8px;padding:8px 10px;margin-bottom:4px;border:1px solid var(--border,#e0e0e0)">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;font-weight:700">📊 ${tfLabel} ${mIcons[mode]||''} ${mNames[mode]||mode} ${regTag}</span>
            <span style="font-size:10px;font-weight:700;color:var(--accent,#2563eb)">${(e.score||0).toFixed(1)}pt</span>
          </div>
          <div style="font-size:9px;color:var(--text2,#666);margin-top:2px">${paramStr}</div>
          <div style="display:flex;gap:8px;margin-top:3px;font-size:9px;color:var(--text3,#999)">
            <span>승률 ${(e.winRate||0).toFixed(1)}%</span>
            <span style="color:${pnlColor}">수익 ${(e.totalPnl||0)>=0?'+':''}${(e.totalPnl||0).toFixed(1)}%</span>
            <span>거래 ${e.totalTrades||0}</span>
            <span>MDD ${e.mdd||0}%</span>
            <span style="margin-left:auto">${dateStr}</span>
          </div>
        </div>`;
      }
    }
  });

  html+=`<div style="display:flex;gap:6px;margin-top:6px">
    <span style="font-size:9px;color:var(--text3,#999);cursor:pointer;text-decoration:underline;flex:1" onclick="_optClearBest()">기록 초기화</span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optImportBest()">파일 불러오기</span>
    <span style="font-size:9px;color:var(--accent,#2563eb);cursor:pointer;text-decoration:underline" onclick="_optExportBest()">파일 저장</span>
  </div>`;
  area.innerHTML=html;
}

function _optClearBest(){
  if(!confirm('현재 시장의 최고기록을 모두 삭제하시겠습니까?')) return;
  const all=_loadOptBest();
  delete all[_optMarket];
  _saveOptBest(all);
  _optRenderBestCards();
  toast('기록 초기화됨');
}

// S92: JSON 파일 저장 (SX_OPT_BEST2 전체)
function _optExportBest(){
  const all=_loadOptBest();
  if(!all||Object.keys(all).length===0){ toast('저장할 기록이 없습니다'); return; }
  const json=JSON.stringify(all, null, 2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date();
  const ds=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  a.href=url; a.download=`SX_OPT_BEST_${ds}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('✅ 최고기록 JSON 저장 완료');
}

// S92: JSON 파일 불러오기 → SX_OPT_BEST2 덮어쓰기
function _optImportBest(){
  const input=document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      if(!data||typeof data!=='object'){ toast('잘못된 형식입니다'); return; }
      // 기본 구조 검증: 최소 1개 시장 키 존재
      const markets=['kr','us','coin'];
      const hasMarket=Object.keys(data).some(k=>markets.includes(k));
      if(!hasMarket){ toast('유효한 시장 데이터가 없습니다'); return; }
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
window._optRenderLockedBar = _optRenderLockedBar;
window._optRun = _optRun;
window._optRunNonstop = _optRunNonstop;
window._optCancel = _optCancel;
window._optRefreshCandles = _optRefreshCandles;
window._optUpdateCandleStatus = _optUpdateCandleStatus;
window._optUpdateMinTrades = _optUpdateMinTrades;
window._optUpdateMinWinRate = _optUpdateMinWinRate;
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
window._optExportBest = _optExportBest;
window._optImportBest = _optImportBest;

})();
