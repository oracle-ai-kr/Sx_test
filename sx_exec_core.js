// ════════════════════════════════════════════════════════════
//  sx_exec_core.js · v1 [S1017] — 시즌1/2 공유 실행 SSOT
// ════════════════════════════════════════════════════════════
//  일원화(b): 시즌2 자동매매 · 시즌1 BT · 시즌1 분석탭 신호가 모두 이 코어를 공유.
//    진입 = 레시피 votes≥1 (recipe_core _sxRecipeVotesCore)
//    청산 = 이중ATR(초기 2× 손절 + peak 3× 트레일) + MA5×20 데드크로스(유예 10일)
//
//  계약: recipe_core / risk_core 와 동일 (ind, rows, i).
//    ind  = calcAllScreener(rows.slice(..i+1), 'day')  (진입 신호용)
//    rows = [{date,open,high,low,close,volume}, ...]    (OHLC·청산 계산용)
//    i    = 현재 봉 인덱스
//
//  수식 = 워커 runAutotradeExit(workers_v9.js) **정확 복제** — 골든테스트로 일치 박제.
//    entryATR = 진입봉 sxATR(14) 고정 · peakHigh = 진입 후 종가 최고 추적
//    initStop = entry − 2×ATR · trailStop = peak − 3×ATR · stop = max(둘) · curPrice≤stop → 손절/트레일
//    MA: 유예 후 미완성봉 제외 MA5×20 데드크로스(ma5p≥ma20p ∧ ma5n<ma20n)
//
//  ★1차 패스에선 워커(runAutotradeExit)는 안 건드림 — 코어=충실 복제라 시즌2 동작 동일·실거래 리스크 회피.
//    Phase 5에서 워커도 이 코어를 import하도록 통합 예정.
// ════════════════════════════════════════════════════════════
(function(){
'use strict';

// 고정 파라미터 (레시피-BT는 튜닝/모드 대상 없음 — 옵티마이저 소멸 근거)
var CFG = { atrInitMult:2, atrTrailMult:3, maFast:5, maSlow:20, maxHoldMode:'ma', maxHoldDays:30, graceDays:10, atrPeriod:14 };

// ── 워커식 그대로 이식한 헬퍼 (sxATR·sxSMA) ──
function sxATR(candles, period){
  if(!candles || candles.length < period+1) return null;
  var sum=0;
  for(var i=candles.length-period; i<candles.length; i++){
    var h=candles[i].high, l=candles[i].low, pc=candles[i-1].close;
    if(!(h>=0)||!(l>=0)||!(pc>=0)) return null;
    sum += Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  return sum/period;
}
function sxSMA(arr, n){
  if(!arr || arr.length < n) return null;
  var s=0; for(var i=arr.length-n; i<arr.length; i++) s+=arr[i];
  return s/n;
}
// 유예 계산용 — 달력일(시장별 날짜포맷 대응: KR=YYYYMMDD · US/COIN=ISO)
function _dateDays(d){
  var s=String(d);
  if(/^\d{8}$/.test(s)) return Math.floor(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))/86400000);
  var t=Date.parse(s); return isFinite(t)?Math.floor(t/86400000):null;
}

// ── 진입 신호: 레시피 votes≥1 ──
//   recipe_core 로드 필요(_sxRecipeVotesCore 전역). 미로드=fail-safe(진입 안 함).
function entrySignalAt(mk, ind, rows, i){
  var votes=0;
  try{ if(typeof _sxRecipeVotesCore==='function'){ var v=_sxRecipeVotesCore(mk, ind, rows, i); votes=(v&&v.votes)||0; } }catch(_){}
  return { buy: votes>=1, votes: votes };
}

// ── 진입봉 ATR (진입 시 고정될 값) ──
function entryATRat(rows, entryIdx, cfg){
  cfg = cfg || CFG;
  return sxATR(rows.slice(0, entryIdx+1), cfg.atrPeriod);
}

// ── 청산 평가: 열린 포지션 + 현재 봉 → { exit, reason, price } ──
//   pos = { entryPrice, entryATR, peakHigh, entryDay }  (호출자가 상태 유지 · peakHigh는 여기서 갱신)
//   워커 runAutotradeExit 로직 정확 복제. 청산 트리거·가격은 raw 종가 기준.
function evalExitAt(pos, rows, i, cfg){
  cfg = cfg || CFG;
  var cur = rows[i]; if(!cur) return { exit:false };
  var cp = cur.close;
  if(!(pos.peakHigh > 0)) pos.peakHigh = pos.entryPrice;
  if(cp > pos.peakHigh) pos.peakHigh = cp;                          // 트레일 최고가 갱신
  var initStop  = pos.entryPrice - cfg.atrInitMult  * pos.entryATR; // 초기 손절
  var trailStop = pos.peakHigh   - cfg.atrTrailMult * pos.entryATR; // 트레일
  var stop = Math.max(initStop, trailStop);
  if(cp <= stop) return { exit:true, reason:(initStop >= trailStop) ? 'ATR손절' : 'ATR트레일', price:cp };
  // MA 청산 (유예 경과 후)
  if(cfg.maxHoldMode === 'ma'){
    var held = _dateDays(cur.date) - pos.entryDay;
    if(held != null && held >= cfg.graceDays){
      var sc=[]; for(var k=0;k<=i;k++) sc.push(rows[k].close);
      var a5=sxSMA(sc,cfg.maFast), a20=sxSMA(sc,cfg.maSlow), p5=sxSMA(sc.slice(0,-1),cfg.maFast), p20=sxSMA(sc.slice(0,-1),cfg.maSlow);
      if(a5!=null&&a20!=null&&p5!=null&&p20!=null && p5>=p20 && a5<a20)
        return { exit:true, reason:'MA'+cfg.maFast+'x'+cfg.maSlow+'데드', price:cp };
    }
  } else if(cfg.maxHoldMode === 'days'){
    var heldD = _dateDays(cur.date) - pos.entryDay;
    if(heldD != null && heldD >= cfg.maxHoldDays) return { exit:true, reason:'보유상한', price:cp };
  }
  return { exit:false };
}

// ── 전체 라이프사이클 러너 (시즌1 BT용) ──
//   단일포지션 순차(사이징 노이즈 격리). 호출자가 votesAt(i)=봉 i의 votes 제공(calcAllScreener 비용 위임).
//   opts: { entryMode:'nextOpen'|'close'(기본 nextOpen=공식프레임), slippage(기본 0), cfg, minIdx(기본 250), tailPad(기본 1) }
//   반환: { trades:[{entryIdx,entryPrice,entryDate,exitIdx,exitPrice,exitDate,reason,ret,bars}], stats:{...} }
function runLifecycle(rows, votesAt, opts){
  opts = opts || {};
  var cfg = opts.cfg || CFG;
  var entryMode = opts.entryMode || 'nextOpen';
  var slip = opts.slippage || 0;
  var minIdx = (opts.minIdx != null) ? opts.minIdx : 250;
  var tailPad = (opts.tailPad != null) ? opts.tailPad : (entryMode === 'nextOpen' ? 1 : 0);   // 진입봉 뒤 청산봉 확보
  var N = rows.length, trades = [], cursor = minIdx;
  while(cursor < N - 1 - tailPad){
    // 진입 스캔
    var si = -1;
    for(var k=cursor; k < N-1-tailPad; k++){ if((votesAt(k)||0) >= 1){ si = k; break; } }
    if(si < 0) break;
    var entryIdx = (entryMode === 'nextOpen') ? si+1 : si;
    var rawEntry = (entryMode === 'nextOpen') ? rows[entryIdx].open : rows[entryIdx].close;
    if(!(rawEntry > 0)){ cursor = si+1; continue; }
    var eATR = entryATRat(rows, entryIdx, cfg);
    if(!(eATR > 0)){ cursor = si+1; continue; }
    var pos = { entryPrice: rawEntry, entryATR: eATR, peakHigh: rawEntry, entryDay: _dateDays(rows[entryIdx].date) };
    var exitIdx=-1, reason=null;
    for(var bj = entryIdx+1; bj < N; bj++){
      var ev = evalExitAt(pos, rows, bj, cfg);
      if(ev.exit){ exitIdx=bj; reason=ev.reason; break; }
    }
    if(exitIdx < 0){ exitIdx = N-1; reason = 'EOD'; }              // 데이터 끝까지 보유(미청산)
    var entryFill = rawEntry * (1 + slip);
    var exitFill  = rows[exitIdx].close * (1 - slip);
    trades.push({
      entryIdx: entryIdx, entryPrice: entryFill, entryDate: rows[entryIdx].date,
      exitIdx: exitIdx, exitPrice: exitFill, exitDate: rows[exitIdx].date,
      reason: reason, ret: exitFill/entryFill - 1, bars: exitIdx - entryIdx
    });
    cursor = exitIdx + 1;
  }
  return { trades: trades, stats: _tradeStats(trades) };
}

function _tradeStats(trades){
  var n=trades.length; if(!n) return { n:0 };
  var rs=trades.map(function(t){return t.ret;});
  var wins=rs.filter(function(r){return r>0;}), losses=rs.filter(function(r){return r<=0;});
  var sumW=wins.reduce(function(a,b){return a+b;},0), sumL=losses.reduce(function(a,b){return a+Math.abs(b);},0);
  var eq=1, pk=1, mdd=0;
  trades.slice().sort(function(a,b){return (_dateDays(a.entryDate)||0)-(_dateDays(b.entryDate)||0);})
    .forEach(function(t){ eq*=(1+t.ret); if(eq>pk)pk=eq; var dd=(pk-eq)/pk; if(dd>mdd)mdd=dd; });
  return {
    n:n, mean: rs.reduce(function(a,b){return a+b;},0)/n,
    win: wins.length/n, pf: (sumL>0? sumW/sumL : (sumW>0?Infinity:null)),
    mdd: mdd, avgBars: trades.reduce(function(a,t){return a+t.bars;},0)/n
  };
}

var API = {
  VERSION: 'S1017', CFG: CFG,
  sxATR: sxATR, sxSMA: sxSMA,
  entrySignalAt: entrySignalAt, entryATRat: entryATRat, evalExitAt: evalExitAt,
  runLifecycle: runLifecycle
};
if(typeof module !== 'undefined' && module.exports) module.exports = API;
if(typeof window !== 'undefined') window.SXExecCore = API;

})();
