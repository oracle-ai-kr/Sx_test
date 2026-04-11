// ════════════════════════════════════════════════════════════
//  sx_optimizer.js v1.0 — 파라미터 자동 최적화 모듈
//  S77 신규 | 독립 모듈 (본체 영향 없음)
//  의존: sx_analysis_engine.js (SXE, sxRunBtEngine, _saveAnalParams, _loadAnalParams, _saveSlot)
//        sx_bt.js (btFetchCandles)
//        sx_screener.html (currentMarket, currentTF, TF_MAP, loadAnalParamsUI)
// ════════════════════════════════════════════════════════════

(function(){
'use strict';

// ── 기본 설정 ──
const OPT_DEFAULTS = {
  rsiLen:  { min:5,  max:30, step:5,   enabled:false },
  bbLen:   { min:10, max:40, step:10,  enabled:false },
  bbMult:  { min:1.0,max:3.5,step:0.5, enabled:false },
  atrLen:  { min:5,  max:30, step:5,   enabled:false },
  maShort: { min:3,  max:20, step:3,   enabled:false },
  maMid:   { min:10, max:50, step:10,  enabled:false },
  maLong:  { min:30, max:120,step:30,  enabled:false },
  buyTh:   { min:40, max:80, step:10,  enabled:false },
  sellTh:  { min:20, max:50, step:10,  enabled:false },
  tpMult:  { min:0.5,max:5.0,step:0.5, enabled:false },
  slMult:  { min:0.5,max:3.0,step:0.5, enabled:false },
};

const MARKET_DEFAULTS = {
  kr:   [{ code:'005930', name:'삼성전자' },{ code:'000660', name:'SK하이닉스' }],
  us:   [{ code:'AAPL', name:'Apple' },{ code:'MSFT', name:'Microsoft' }],
  coin: [{ code:'KRW-BTC', name:'Bitcoin' },{ code:'KRW-ETH', name:'Ethereum' }],
};
const OPT_STOCKS_KEY = 'SX_OPT_STOCKS';
const OPT_MAX_STOCKS = 10; // 시장당 최대

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
let _optSelectedCode = ''; // 선택된 종목 코드
let _optLocked = {}; // {rsiLen:14, buyTh:60, ...} 고정된 최적값
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
  // BT에 적합한 TF만 (분봉 제외 — 데이터 부족 가능성)
  const btTfs = tfs.filter(t=>['day','week','month','240m','60m'].includes(t.k));

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
    const rowOpacity = locked ? 'opacity:0.4;pointer-events:none' : '';
    return `<div class="opt-row" id="optRow_${k}" style="${rowOpacity}">
      <input type="checkbox" id="optEn_${k}" ${d.enabled&&!locked?'checked':''} onchange="_optSingleCheck('${k}')">
      <label for="optEn_${k}" style="min-width:55px">${labels[k]||k}</label>
      <input type="number" id="optMin_${k}" value="${d.min}" step="${step}" style="width:38px">
      <span class="opt-dash">~</span>
      <input type="number" id="optMax_${k}" value="${d.max}" step="${step}" style="width:38px">
      <span class="opt-dash">s</span>
      <input type="number" id="optStep_${k}" value="${d.step}" step="${step}" style="width:34px" onchange="_optUpdateCount()">
      <span id="optLock_${k}" style="font-size:10px;padding:2px 5px;border-radius:4px;cursor:pointer;white-space:nowrap;${lockStyle}" onclick="_optToggleLock('${k}')">${lockLabel}</span>
    </div>`;
  }).join('');

  overlay.innerHTML = `<div class="opt-panel">
    <div class="opt-header"><h3>⚡ 자동 최적화</h3><span class="opt-close" onclick="_closeOpt()">✕</span></div>
    <div class="opt-body">
      <!-- 순차 최적화 안내 -->
      <div class="opt-info" style="margin-bottom:8px;line-height:1.6">파라미터를 <b>1개씩</b> 선택하여 최적값을 찾고 🔒고정한 뒤,<br>다음 파라미터를 탐색하세요.</div>

      <!-- 고정값 현황 -->
      <div id="optLockedBar" style="margin-bottom:10px"></div>

      <!-- 2차 자동 탐색 -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;background:var(--surface2,#f5f5f5);border-radius:8px;border:1px solid var(--border,#e0e0e0)">
        <label class="sound-toggle" style="flex-shrink:0"><input type="checkbox" id="opt2ndToggle"><span class="st-track"></span></label>
        <div><div style="font-size:11px;font-weight:600;color:var(--text,#222)">2차 정밀 탐색</div><div style="font-size:9px;color:var(--text3,#999)">ON: 1차 TOP5 기준 범위 축소 → 자동 2차 탐색</div></div>
      </div>

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
        <div class="opt-info"><span id="optMarketLabel">${_PARAM_MARKET_LABELS_SHORT[market]}</span> · <span id="optStockCount">${stocks.length}</span>/${OPT_MAX_STOCKS}개 · 탭=선택 · ✕=삭제</div>
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
        <button id="optRunBtn" class="opt-btn opt-btn-primary" onclick="_optRun()">최적화 실행</button>
        <div class="opt-progress" id="optProgress" style="display:none">
          <div class="opt-progress-fill" id="optProgressFill" style="width:0%"></div>
        </div>
        <div class="opt-progress-text" id="optProgressText" style="display:none"></div>
        <button id="optCancelBtn" class="opt-btn opt-btn-danger" style="display:none;margin-top:6px" onclick="_optCancel()">중지</button>
      </div>

      <!-- 결과 -->
      <div id="optResultArea" style="display:none"></div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  history.pushState({view:'optimizer'}, '');
  _optMarket = market;
  _optUpdateCount();
  const initStocks = _getOptStocks(_optMarket);
  _optSelectedCode = initStocks.length > 0 ? initStocks[0].code : '';
  _optRenderChips();
  _optRenderLockedBar();
}

// ── 모드 전환 ──
let _optMode = 'quick';
// ── 단일 파라미터 선택 (체크박스 1개만 허용) ──
function _optSingleCheck(key){
  // 고정된 파라미터는 체크 불가
  if(_optLocked.hasOwnProperty(key)){
    const el = document.getElementById('optEn_'+key);
    if(el) el.checked = false;
    toast('이미 고정된 파라미터입니다');
    return;
  }
  // 다른 체크 모두 해제 (고정되지 않은 것만)
  Object.keys(OPT_DEFAULTS).forEach(k=>{
    if(k !== key && !_optLocked.hasOwnProperty(k)){
      const el = document.getElementById('optEn_'+k);
      if(el) el.checked = false;
    }
  });
  _optUpdateCount();
}

// ── 고정 토글 ──
function _optToggleLock(key){
  const labels = {rsiLen:'RSI 기간',bbLen:'BB 기간',bbMult:'BB 배수',atrLen:'ATR 기간',maShort:'MA 단기',maMid:'MA 중기',maLong:'MA 장기',buyTh:'BUY 임계',sellTh:'SELL 임계',tpMult:'TP 배수',slMult:'SL 배수'};
  if(_optLocked.hasOwnProperty(key)){
    // 해제
    delete _optLocked[key];
    toast(`${labels[key]} 고정 해제`);
  } else {
    // 고정 — 결과에서 찾은 값이 있으면 그걸 사용, 없으면 현재 기본값
    // 최근 결과 TOP1에서 가져오기 시도
    const topVal = _optGetTopValue(key);
    if(topVal !== null){
      _optLocked[key] = topVal;
      toast(`🔒 ${labels[key]} = ${topVal} 고정`);
    } else {
      // 기본값으로 고정
      const d = SCR_ANAL_DEFAULTS[key];
      _optLocked[key] = d !== undefined ? d : OPT_DEFAULTS[key]?.min || 0;
      toast(`🔒 ${labels[key]} = ${_optLocked[key]} 고정 (기본값)`);
    }
    // 체크 해제
    const el = document.getElementById('optEn_'+key);
    if(el) el.checked = false;
  }
  _optRenderParamRow(key);
  _optRenderLockedBar();
  _optUpdateCount();
}

// 최근 결과 TOP1에서 해당 파라미터 값 가져오기
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
  const chk = document.getElementById('optEn_'+key);
  if(!row) return;
  const locked = _optLocked.hasOwnProperty(key);
  row.style.opacity = locked ? '0.4' : '1';
  row.style.pointerEvents = locked ? 'none' : 'auto';
  if(lockBtn){
    lockBtn.style.pointerEvents = 'auto'; // 잠금 버튼은 항상 클릭 가능
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
  if(chk && locked) chk.checked = false;
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
};

// ── 조합 수 업데이트 ──
window._optUpdateCount = function(){
  const ranges = _readRanges();
  const cnt = _countCombinations(ranges);
  const tfs = _getSelectedTFs();
  const total = cnt * tfs.length * 2; // ×2 (OFF+ON)
  const estSec = Math.ceil(total * 0.3);
  const estMin = estSec >= 60 ? `약 ${Math.ceil(estSec/60)}분` : `약 ${estSec}초`;
  const el = document.getElementById('optComboInfo');
  if(el) el.innerHTML = `조합: <b>${cnt}</b>개 × TF <b>${tfs.length}</b>개 × 2(레짐OFF+ON) = <b>${total}</b>회 BT (${estMin})`;
};

// ── 범위 읽기 ──
function _readRanges(){
  const ranges = {};
  Object.keys(OPT_DEFAULTS).forEach(k=>{
    const en = document.getElementById('optEn_'+k)?.checked || false;
    const isFloat = ['bbMult','tpMult','slMult'].includes(k);
    const min = isFloat ? parseFloat(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min) : parseInt(document.getElementById('optMin_'+k)?.value||OPT_DEFAULTS[k].min);
    const max = isFloat ? parseFloat(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max) : parseInt(document.getElementById('optMax_'+k)?.value||OPT_DEFAULTS[k].max);
    const step = isFloat ? parseFloat(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step) : parseInt(document.getElementById('optStep_'+k)?.value||OPT_DEFAULTS[k].step);
    ranges[k] = { min, max, step: Math.max(step, isFloat?0.1:1), enabled: en };
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
  const code = _optSelectedCode;
  if(!code){ toast('종목을 선택하세요 (칩 탭)'); return; }

  const tfs = _getSelectedTFs();
  if(tfs.length===0){ toast('TF를 하나 이상 선택하세요'); return; }

  const ranges = _readRanges();
  const combos = _generateCombinations(ranges);
  if(combos.length===0){ toast('파라미터를 하나 이상 활성화하세요'); return; }

  const total = combos.length * tfs.length * 2; // ×2 (OFF + ON)
  if(total > 4000){
    if(!confirm(`총 ${total}회 BT를 실행합니다 (레짐 OFF+ON).\n시간이 오래 걸릴 수 있습니다. 계속하시겠습니까?`)) return;
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
  const tfResultsOff = {}; // 레짐 OFF 결과
  const tfResultsOn = {};  // 레짐 ON 결과

  // 캔들 캐시 (TF별 1회 fetch → 2라운드 공유)
  const candleCache = {};

  try {
    // ━━ 라운드 1: 레짐 OFF ━━
    SXE.setRegimeAdapt(false);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResultsOff[tf] = [];

      progText.textContent = `[레짐OFF] [${tf}] 캔들 수집 중...`;
      const count = (tf==='week'||tf==='month') ? 400 : 300;
      let rows;
      try {
        if(candleCache[tf]){ rows = candleCache[tf]; }
        else { rows = await btFetchCandles(code, isCoin, tf, count); candleCache[tf] = rows; }
      } catch(e){
        tfResultsOff[tf] = [{error: e.message}];
        done += combos.length;
        progFill.style.width = (done/total*100).toFixed(1)+'%';
        continue;
      }

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
        try {
          const r = sxRunBtEngine(rows, tf, btParams, { slippage:0.001, nextBarEntry:false });
          if(!r.error) tfResultsOff[tf].push({ params:{...testParams}, bt:r });
        } catch(e){}
        done++;
        if(done % 5 === 0 || ci === combos.length-1){
          progFill.style.width = (done/total*100).toFixed(1)+'%';
          progText.textContent = `[레짐OFF] [${tf}] ${done}/${total}`;
          await _sleep(0);
        }
      }
    }

    // ━━ 라운드 2: 레짐 ON ━━
    SXE.setRegimeAdapt(true);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResultsOn[tf] = [];

      const rows = candleCache[tf];
      if(!rows){ done += combos.length; continue; }

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
        try {
          const r = sxRunBtEngine(rows, tf, btParams, { slippage:0.001, nextBarEntry:false });
          if(!r.error) tfResultsOn[tf].push({ params:{...testParams}, bt:r });
        } catch(e){}
        done++;
        if(done % 5 === 0 || ci === combos.length-1){
          progFill.style.width = (done/total*100).toFixed(1)+'%';
          progText.textContent = `[레짐ON] [${tf}] ${done}/${total}`;
          await _sleep(0);
        }
      }
    }
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
    _renderDualResults(tfResultsOff, tfResultsOn, code, null, null);
    return;
  }

  // ━━ 2차 정밀 탐색 ━━
  const do2nd = document.getElementById('opt2ndToggle')?.checked || false;
  if(do2nd && !_cancelled){
    const narrowRanges = _calcNarrowRanges(tfResultsOff, tfResultsOn, ranges);
    if(narrowRanges){
      toast('2차 정밀 탐색 시작...');
      const r2 = await _runRound2(narrowRanges, code, isCoin, tfs, origParams, origRegime, runBtn, cancelBtn, prog, progFill, progText);
      if(r2){
        _renderDualResults(tfResultsOff, tfResultsOn, code, r2.off, r2.on);
        return;
      }
    }
  }

  _renderDualResults(tfResultsOff, tfResultsOn, code, null, null);
}

function _optCancel(){
  _cancelled = true;
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
      const sorted = results.filter(r=>r.bt && r.bt.totalTrades>=3)
        .sort((a,b)=>{
          const sa = (a.bt.winRate/100)*a.bt.totalPnl*Math.log(a.bt.totalTrades+1);
          const sb = (b.bt.winRate/100)*b.bt.totalPnl*Math.log(b.bt.totalTrades+1);
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
  const combos = _generateCombinations(ranges);
  if(combos.length === 0) return null;
  const total = combos.length * tfs.length * 2;

  _running = true;
  _cancelled = false;
  runBtn.style.display='none'; cancelBtn.style.display='block';
  prog.style.display='block'; progText.style.display='block';
  progFill.style.width='0%';

  const candleCache = {};
  const tfResOff = {}, tfResOn = {};
  let done = 0;

  try {
    // 레짐 OFF
    SXE.setRegimeAdapt(false);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResOff[tf] = [];
      const count = (tf==='week'||tf==='month') ? 400 : 300;
      let rows;
      try {
        if(candleCache[tf]) rows=candleCache[tf];
        else { rows = await btFetchCandles(code, isCoin, tf, count); candleCache[tf]=rows; }
      } catch(e){ tfResOff[tf]=[{error:e.message}]; done+=combos.length; continue; }
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        try { const r=sxRunBtEngine(rows,tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error) tfResOff[tf].push({params:{...testParams},bt:r}); } catch(_){}
        done++;
        if(done%5===0||ci===combos.length-1){ progFill.style.width=(done/total*100).toFixed(1)+'%'; progText.textContent=`[2차 OFF] [${tf}] ${done}/${total}`; await _sleep(0); }
      }
    }
    // 레짐 ON
    SXE.setRegimeAdapt(true);
    for(const tf of tfs){
      if(_cancelled) break;
      tfResOn[tf] = [];
      const rows=candleCache[tf]; if(!rows){done+=combos.length;continue;}
      for(let ci=0; ci<combos.length; ci++){
        if(_cancelled) break;
        const testParams = { ...origParams, ..._optLocked, ...combos[ci] };
        _saveAnalParams(testParams);
        const btP = { buyTh:testParams.buyTh>0?testParams.buyTh:62, sellTh:testParams.sellTh>0?testParams.sellTh:38, tpMult:testParams.tpMult>0?testParams.tpMult:2.5, slMult:testParams.slMult>0?testParams.slMult:1.5 };
        try { const r=sxRunBtEngine(rows,tf,btP,{slippage:0.001,nextBarEntry:false}); if(!r.error) tfResOn[tf].push({params:{...testParams},bt:r}); } catch(_){}
        done++;
        if(done%5===0||ci===combos.length-1){ progFill.style.width=(done/total*100).toFixed(1)+'%'; progText.textContent=`[2차 ON] [${tf}] ${done}/${total}`; await _sleep(0); }
      }
    }
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
// S77: 단일 세트 결과 HTML 생성 (내부 헬퍼)
function _buildResultHTML(tfResults, code, regimeLabel){
  let html = '';
  const tfLabels = {};
  if(typeof TF_MAP !== 'undefined'){
    const market = typeof currentMarket !== 'undefined' ? currentMarket : 'kr';
    (TF_MAP[market]||[]).forEach(t=>{ tfLabels[t.k]=t.l; });
  }

  for(const[tf, results] of Object.entries(tfResults)){
    const tfLabel = tfLabels[tf] || tf;
    html += `<div class="opt-tf-header">📊 ${tfLabel}</div>`;

    if(results.length===0 || (results.length===1 && results[0].error)){
      const errMsg = results[0]?.error || '유효한 결과 없음';
      html += `<div class="opt-result-card"><div style="color:var(--sell);font-size:11px">❌ ${_esc(errMsg)}</div></div>`;
      continue;
    }

    const sorted = results
      .filter(r=>r.bt && r.bt.totalTrades >= 3)
      .sort((a,b)=>{
        const scoreA = (a.bt.winRate/100) * a.bt.totalPnl * Math.log(a.bt.totalTrades+1);
        const scoreB = (b.bt.winRate/100) * b.bt.totalPnl * Math.log(b.bt.totalTrades+1);
        return scoreB - scoreA;
      });

    if(sorted.length === 0){
      html += `<div class="opt-result-card"><div style="color:var(--text3);font-size:11px">거래 3회 이상인 유효 조합 없음</div></div>`;
      continue;
    }

    const top = sorted.slice(0,5);
    // S77: TOP1 파라미터 저장 (고정 기능용)
    if(top.length > 0 && !_lastTopParams) _lastTopParams = {...top[0].params};
    top.forEach((r,i)=>{
      const p = r.params;
      const b = r.bt;
      const rankClass = i===0?'r1':i===1?'r2':'r3';
      const cardClass = i===0 ? 'opt-result-card best' : 'opt-result-card';
      const paramStr = `RSI${p.rsiLen} BB${p.bbLen}×${p.bbMult} ATR${p.atrLen}${p.maShort?' MA'+p.maShort+'/':''}${p.maMid?p.maMid+'/':''}${p.maLong||''}${p.buyTh>0?' B'+p.buyTh:''}${p.sellTh>0?' S'+p.sellTh:''}${p.tpMult>0?' TP'+p.tpMult:''}${p.slMult>0?' SL'+p.slMult:''}`;
      const pnlColor = b.totalPnl >= 0 ? 'var(--buy,#27ae60)' : 'var(--sell,#e74c3c)';
      const suffix = regimeLabel==='ON' ? '_ON' : '';

      html += `<div class="${cardClass}">
        <div style="display:flex;align-items:center"><span class="opt-rank ${rankClass}">${i+1}</span><span style="font-size:12px;font-weight:700">TOP ${i+1}</span></div>
        <div class="opt-result-params">${paramStr}</div>
        <div class="opt-result-stats">
          <div><div class="stat-val">${b.winRate.toFixed(1)}%</div><div class="stat-lbl">승률</div></div>
          <div><div class="stat-val" style="color:${pnlColor}">${b.totalPnl>=0?'+':''}${b.totalPnl.toFixed(1)}%</div><div class="stat-lbl">수익률</div></div>
          <div><div class="stat-val">${b.totalTrades}</div><div class="stat-lbl">거래수</div></div>
          <div><div class="stat-val">${b.mdd}%</div><div class="stat-lbl">MDD</div></div>
        </div>
        <div class="opt-result-actions">
          <button class="opt-btn-primary" style="padding:6px;font-size:10px;border-radius:5px" onclick="_optApply(${JSON.stringify(p).replace(/"/g,'&quot;')})">슬라이더 적용</button>
          <button class="opt-btn-secondary" style="padding:6px;font-size:10px;border-radius:5px" onclick="_optSaveSlot(${JSON.stringify(p).replace(/"/g,'&quot;')},'${tf}','${_esc(code)}${suffix}')">프리셋 저장</button>
        </div>
      </div>`;
    });

    if(sorted.length > 5){
      html += `<div class="opt-info" style="text-align:center;margin-top:4px">전체 유효 조합: ${sorted.length}개 (상위 5개 표시)</div>`;
    }
  }
  return html;
}

// S77: 레짐 OFF + ON 이중 결과 렌더링
function _renderDualResults(tfResultsOff, tfResultsOn, code, r2Off, r2On){
  const area = document.getElementById('optResultArea');
  if(!area) return;
  area.style.display='block';
  _lastTopParams = null; // 리셋

  let html = '';
  // 1차: 레짐 OFF
  html += `<div style="background:var(--surface2,#f0f0f0);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:13px;font-weight:700;color:var(--text)">🔒 레짐 OFF <span style="font-size:10px;font-weight:400;color:var(--text3)">(고정 파라미터)</span></div>`;
  html += _buildResultHTML(tfResultsOff, code, 'OFF');

  // 구분선
  html += `<div style="border-top:3px solid var(--accent,#2563eb);margin:16px 0"></div>`;

  // 1차: 레짐 ON
  html += `<div style="background:rgba(37,99,235,0.08);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:13px;font-weight:700;color:var(--accent,#2563eb)">⚡ 레짐 ON <span style="font-size:10px;font-weight:400;color:var(--text3)">(시장상태별 자동보정)</span></div>`;
  html += _buildResultHTML(tfResultsOn, code, 'ON');

  // 2차 결과
  if(r2Off && r2On){
    html += `<div style="border-top:4px double var(--buy,#27ae60);margin:20px 0"></div>`;
    html += `<div style="background:rgba(39,174,96,0.08);border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:14px;font-weight:700;color:var(--buy,#27ae60);text-align:center">🎯 2차 정밀 탐색 결과</div>`;

    html += `<div style="background:var(--surface2,#f0f0f0);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;font-weight:700;color:var(--text)">🔒 2차 레짐 OFF</div>`;
    html += _buildResultHTML(r2Off, code, 'OFF');

    html += `<div style="border-top:2px solid var(--accent,#2563eb);margin:12px 0"></div>`;

    html += `<div style="background:rgba(37,99,235,0.08);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;font-weight:700;color:var(--accent,#2563eb)">⚡ 2차 레짐 ON</div>`;
    html += _buildResultHTML(r2On, code, 'ON');
  }

  area.innerHTML = html;
}

// ── 결과에서 적용 ──
window._optApply = function(params){
  _saveAnalParams(params);
  if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  if(typeof updateAnalParamBadge === 'function') updateAnalParamBadge();
  toast('✅ 최적 파라미터 적용됨');
};

// ── 결과에서 프리셋 저장 ──
window._optSaveSlot = function(params, tf, code){
  const market = typeof currentMarket !== 'undefined' ? currentMarket : 'kr';
  const tfLabels = {};
  if(typeof TF_MAP !== 'undefined'){
    (TF_MAP[market]||[]).forEach(t=>{ tfLabels[t.k]=t.l; });
  }
  const tfLabel = tfLabels[tf] || tf;
  const name = `${code}_${tfLabel}_최적`;

  const slots = _loadMarketSlots(market);
  if(slots.length >= SCR_ANAL_MAX_SLOTS){
    toast(`❌ 슬롯 가득참 (최대 ${SCR_ANAL_MAX_SLOTS}개) — 기존 프리셋 삭제 후 시도하세요`);
    return;
  }
  const ok = _saveSlot(market, name, params, -1);
  if(ok){
    if(typeof updateParamMarketStatus === 'function') updateParamMarketStatus();
    toast(`✅ "${name}" 저장됨`);
  } else {
    toast('❌ 저장 실패');
  }
};

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
  // 칩 갱신 + 첫번째 자동 선택
  const stocks = _getOptStocks(m);
  _optSelectedCode = stocks.length > 0 ? stocks[0].code : '';
  _optRenderChips();
  // 입력창 초기화
  const inp = document.getElementById('optStockInput'); if(inp) inp.value='';
  const dd = document.getElementById('optStockDd'); if(dd) dd.style.display='none';
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
    _optSelectedCode = code; // 추가한 종목 자동 선택
    _optRenderChips();
    toast(`✅ ${name||code} 추가됨`);
  } else {
    // 이미 있으면 선택만
    const stocks = _getOptStocks(_optMarket);
    if(stocks.find(s=>s.code===code)){
      _optSelectedCode = code;
      _optRenderChips();
      toast(`${name||code} 선택됨`);
    } else {
      toast('최대 개수 초과');
    }
  }
}

// 칩 렌더링 — 선택/삭제 분리
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
    const sel = s.code === _optSelectedCode ? ' selected' : '';
    return `<span class="opt-chip${sel}" onclick="_optSelectChip('${s.code}')"><span class="chip-name">${s.name}</span> <span class="chip-code">${s.code}</span><span class="chip-x" onclick="event.stopPropagation();_optRemoveChip('${s.code}')">✕</span></span>`;
  }).join('');
}

function _optSelectChip(code){
  _optSelectedCode = code;
  _optRenderChips();
}

function _optRemoveChip(code){
  _removeOptStock(_optMarket, code);
  if(_optSelectedCode === code){
    const stocks = _getOptStocks(_optMarket);
    _optSelectedCode = stocks.length > 0 ? stocks[0].code : '';
  }
  _optRenderChips();
  toast('삭제됨');
}

// ── 글로벌 노출 ──
window.openOptimizer = openOptimizer;
window._closeOpt = _closeOpt;
window._optSingleCheck = _optSingleCheck;
window._optToggleLock = _optToggleLock;
window._optRenderLockedBar = _optRenderLockedBar;
window._optRun = _optRun;
window._optCancel = _optCancel;
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

})();
