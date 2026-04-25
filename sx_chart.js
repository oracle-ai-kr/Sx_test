// ════════════════════════════════════════════════════════════
//  SX Chart Module v1.9
//  캔들차트 + MA(5/10/20/60/120) + BB + 거래량 + RSI + MACD
//  양봉=빨강, 음봉=파랑
// ════════════════════════════════════════════════════════════
const SXChart = (function(){
'use strict';

const BULL = '#e8365a';
const BEAR = '#3b82f6';
const MA_COLORS = {5:'#f59e0b',10:'#ef4444',20:'#3b82f6',60:'#a855f7',120:'#6b7280'};
const BB_FILL  = 'rgba(168,85,247,.06)';
const BB_EDGE  = 'rgba(168,85,247,.3)';
const BB_MID   = 'rgba(168,85,247,.45)';
const VOL_BULL = 'rgba(232,54,90,.45)';
const VOL_BEAR = 'rgba(59,130,246,.45)';
const RSI_COLOR = '#f59e0b';
const MACD_COLOR = '#3b82f6';
const SIG_COLOR  = '#ef4444';
const HIST_P = 'rgba(232,54,90,.5)';
const HIST_N = 'rgba(59,130,246,.5)';
const GRID = 'rgba(128,128,128,.12)';
const TXT = '#888';

/* ── 계산 유틸 ── */
function sma(arr,p){const r=[];for(let i=0;i<arr.length;i++){if(i<p-1){r.push(null);continue;}let s=0;for(let j=i-p+1;j<=i;j++)s+=arr[j];r.push(s/p);}return r;}
function ema(arr,p){const r=[],k=2/(p+1);for(let i=0;i<arr.length;i++){if(i===0)r.push(arr[0]);else r.push(arr[i]*k+r[i-1]*(1-k));}return r;}
function calcBB(c,p,m){p=p||20;m=m||2;const mid=sma(c,p),u=[],l=[];for(let i=0;i<c.length;i++){if(mid[i]==null){u.push(null);l.push(null);continue;}let s=0;for(let j=i-p+1;j<=i;j++)s+=(c[j]-mid[i])**2;const sd=Math.sqrt(s/p);u.push(mid[i]+m*sd);l.push(mid[i]-m*sd);}return{mid:mid,upper:u,lower:l};}
function calcRSI(c,p){p=p||14;const r=[];let ag=0,al=0;for(let i=0;i<c.length;i++){if(i===0){r.push(50);continue;}const d=c[i]-c[i-1],g=d>0?d:0,lo=d<0?-d:0;if(i<=p){ag+=g/p;al+=lo/p;r.push(i===p?(al===0?100:100-100/(1+ag/al)):50);}else{ag=(ag*(p-1)+g)/p;al=(al*(p-1)+lo)/p;r.push(al===0?100:100-100/(1+ag/al));}}return r;}
function calcMACD(c,f,s,sig){f=f||12;s=s||26;sig=sig||9;const fast=ema(c,f),slow=ema(c,s),m=fast.map(function(v,i){return v-slow[i];}),sl=ema(m,sig),h=m.map(function(v,i){return v-sl[i];});return{macd:m,signal:sl,hist:h};}

/* ── 캔버스 셋업 ── */
function setupCanvas(canvas, w, h){
  // getBoundingClientRect로 실제 렌더링 크기 읽기 (시그널랩 방식)
  var rect = canvas.getBoundingClientRect();
  var rw = Math.round(rect.width);
  var rh = Math.round(rect.height);
  if(rw > 10) w = rw;
  if(rh > 10) h = rh;
  if(!w || w<10) w = 360;
  if(!h || h<10) h = 160;
  var dpr = window.devicePixelRatio||1;
  canvas.width = Math.round(w*dpr);
  canvas.height = Math.round(h*dpr);
  canvas.style.width = w+'px';
  canvas.style.height = h+'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  // 흰색 배경 먼저 칠하기
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,w,h);
  return ctx;
}

/* ── 그리드 + 가격 라벨 ── */
function drawGrid(ctx, pad, W, H, lo, hi, lines){
  lines = lines||4;
  ctx.strokeStyle = GRID; ctx.lineWidth = 0.5;
  ctx.fillStyle = TXT; ctx.font = '8px Outfit,sans-serif'; ctx.textAlign = 'right';
  var range = hi-lo||1;
  for(var i=0;i<=lines;i++){
    var v = lo + range * (1 - i/lines);
    var y = pad.t + (i/lines) * (H - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W-pad.r, y); ctx.stroke();
    ctx.fillText(v>=1000?Math.round(v).toLocaleString():v.toFixed(1), W-3, y+3);
  }
}

/* ── 라인 그리기 ── */
function drawLine(ctx, vals, pad, cw, yFn, color, lw, startIdx){
  if(!vals||vals.length<2) return;
  lw = lw||0.8; startIdx = startIdx||0;
  ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=lw;
  var started=false;
  for(var i=0;i<vals.length;i++){
    if(vals[i]==null){started=false;continue;}
    var x=pad.l+(startIdx+i)*cw+cw/2, y=yFn(vals[i]);
    if(!started){ctx.moveTo(x,y);started=true;} else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* ── BB 채우기 ── */
function drawBBFill(ctx, bb, pad, cw, yFn){
  var upper=bb.upper, lower=bb.lower, mid=bb.mid;
  ctx.beginPath(); ctx.fillStyle=BB_FILL;
  var started=false;
  for(var i=0;i<upper.length;i++){
    if(upper[i]==null) continue;
    var x=pad.l+i*cw+cw/2;
    if(!started){ctx.moveTo(x,yFn(upper[i]));started=true;} else ctx.lineTo(x,yFn(upper[i]));
  }
  for(i=upper.length-1;i>=0;i--){
    if(lower[i]==null) continue;
    x=pad.l+i*cw+cw/2;
    ctx.lineTo(x,yFn(lower[i]));
  }
  ctx.closePath(); ctx.fill();
  drawLine(ctx, upper, pad, cw, yFn, BB_EDGE, 0.6);
  drawLine(ctx, lower, pad, cw, yFn, BB_EDGE, 0.6);
  drawLine(ctx, mid, pad, cw, yFn, BB_MID, 0.6);
}

/* ── 캔들 그리기 공통 (양봉=빨강꽉참, 음봉=파랑꽉참) ── */
function drawCandles(ctx, data, pad, cw, yFn, thick){
  thick = thick||false;
  data.forEach(function(d,i){
    var x=pad.l+i*cw+cw/2;
    var bull=d.close>=d.open;
    var col=bull?BULL:BEAR;
    // wick
    ctx.strokeStyle=col; ctx.lineWidth=thick?0.8:0.7;
    ctx.beginPath(); ctx.moveTo(x,yFn(d.high)); ctx.lineTo(x,yFn(d.low)); ctx.stroke();
    // body (양봉/음봉 모두 꽉 채움)
    var bTop=yFn(Math.max(d.open,d.close)), bBot=yFn(Math.min(d.open,d.close));
    var bH=Math.max(bBot-bTop, thick?1:0.8), bw=Math.max(cw*(thick?0.62:0.55), thick?2:1);
    ctx.fillStyle=col;
    ctx.fillRect(x-bw/2,bTop,bw,bH);
    // 테두리
    ctx.strokeStyle=bull?'#cc2244':'#2563eb'; ctx.lineWidth=0.5;
    ctx.strokeRect(x-bw/2,bTop,bw,bH);
  });
}

/* ── MA 범례 ── */
function drawMALegend(ctx, closes, pad, H, fontSize){
  ctx.font=(fontSize||8)+'px Outfit,sans-serif';
  var lx=pad.l+2;
  var ly=H-3;
  [5,10,20,60,120].forEach(function(p){
    if(closes.length<p) return;
    ctx.fillStyle=MA_COLORS[p];
    ctx.fillText('MA'+p, lx, ly);
    lx+=ctx.measureText('MA'+p).width+5;
  });
  ctx.fillStyle=BB_MID;
  ctx.fillText('BB', lx, ly);
}

/* ════════════════════════════════════════════════════════════
   미니 차트 (분석탭 상단 — 클릭 시 풀차트 열림)
   ════════════════════════════════════════════════════════════ */
function drawMini(canvasId, rows){
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  if(!rows || !rows.length) return; // [PATCH-2] null/undefined/빈배열 방어
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var H = 160;
  var ctx = setupCanvas(canvas, W, H);


  var data = rows.slice(-60);
  if(data.length<5) return;

  var pad = {t:6,b:18,l:8,r:42};
  var cw = (W-pad.l-pad.r)/data.length;
  var closes = data.map(function(d){return d.close;});
  var allV = data.flatMap(function(d){return [d.high,d.low];});

  var bb = calcBB(closes, 20, 2);
  bb.upper.forEach(function(v){if(v!=null) allV.push(v);});
  bb.lower.forEach(function(v){if(v!=null) allV.push(v);});

  var hi=Math.max.apply(null,allV), lo=Math.min.apply(null,allV);
  var range=hi-lo||1;
  var yFn=function(v){return pad.t+(hi-v)/range*(H-pad.t-pad.b);};

  drawGrid(ctx, pad, W, H, lo, hi, 3);
  drawBBFill(ctx, bb, pad, cw, yFn);
  drawCandles(ctx, data, pad, cw, yFn, false);

  [5,10,20,60,120].forEach(function(p){
    if(data.length<p) return;
    drawLine(ctx, sma(closes,p), pad, cw, yFn, MA_COLORS[p], 0.8);
  });

  drawMALegend(ctx, closes, pad, H, 8);
}

/* ════════════════════════════════════════════════════════════
   풀 차트 오버레이 (캔들 + 거래량 + RSI + MACD)
   ════════════════════════════════════════════════════════════ */
function openFull(rows, stockName, trades, svVerdict){
  if(!rows||rows.length<10) return;

  var ov = document.getElementById('sxChartOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'sxChartOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:500;display:flex;flex-direction:column;overflow:hidden';
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';

  var data = rows.slice(-60);
  var closes = data.map(function(d){return d.close;});
  var rsiArr = calcRSI(closes, 14);
  var macdObj = calcMACD(closes, 12, 26, 9);
  var bb = calcBB(closes, 20, 2);

  history.pushState({view:'sxchart'},'');

  ov.innerHTML =
    '<div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #e5e7eb;flex-shrink:0;background:#fff">' +
      '<button onclick="if(typeof _sxVib===\'function\')_sxVib(15);SXChart.closeFull()" style="border:none;background:none;font-size:16px;cursor:pointer;color:#333;padding:4px 8px">\u2039</button>' +
      '<span style="font-size:13px;font-weight:700;flex:1;text-align:center;color:#333">' + (stockName||'') + ' 상세 차트</span>' +
      '<span style="width:32px"></span>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:10px 10px 20px;background:#fff" id="sxChartBody">' +
      '<div style="font-size:10px;font-weight:600;color:#888;margin-bottom:4px">캔들 + MA + BB (최근 ' + data.length + '봉)</div>' +
      '<canvas id="sxFullCandle" style="width:100%;height:240px;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:8px"></canvas>' +
      '<div style="font-size:10px;font-weight:600;color:#888;margin:12px 0 4px">거래량</div>' +
      '<canvas id="sxFullVol" style="width:100%;height:70px;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:8px"></canvas>' +
      '<div style="font-size:10px;font-weight:600;color:#888;margin:12px 0 4px">RSI (14)</div>' +
      '<canvas id="sxFullRSI" style="width:100%;height:90px;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:8px"></canvas>' +
      '<div style="font-size:10px;font-weight:600;color:#888;margin:12px 0 4px">MACD (12, 26, 9)</div>' +
      '<canvas id="sxFullMACD" style="width:100%;height:90px;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:8px"></canvas>' +
    '</div>';

  setTimeout(function(){
    _drawFullCandle('sxFullCandle', data, closes, bb, 240, rows.length, trades, svVerdict);
    _drawFullVolume('sxFullVol', data, 70);
    _drawFullRSI('sxFullRSI', rsiArr, 90);
    _drawFullMACD('sxFullMACD', macdObj, 90);
  }, 80);
}

function closeFull(){
  var ov = document.getElementById('sxChartOverlay');
  if(ov && ov.style.display!=='none'){
    ov.style.display='none';
    // popstate에서 이미 닫혀있으므로 skip됨
    try{ history.back(); }catch(e){}
  }
}

/* ── 풀차트: 캔들 + MA + BB ── */
function _drawFullCandle(id, data, closes, bb, H, fullLen, trades, svVerdict){
  var canvas = document.getElementById(id);
  if(!canvas) return;
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:8,b:20,l:8,r:42};
  var cw = (W-pad.l-pad.r)/data.length;

  var allV = data.flatMap(function(d){return [d.high,d.low];});
  bb.upper.forEach(function(v){if(v!=null) allV.push(v);});
  bb.lower.forEach(function(v){if(v!=null) allV.push(v);});
  var hi=Math.max.apply(null,allV), lo=Math.min.apply(null,allV);
  var range=hi-lo||1;
  var yFn=function(v){return pad.t+(hi-v)/range*(H-pad.t-pad.b);};

  drawGrid(ctx, pad, W, H, lo, hi, 4);
  drawBBFill(ctx, bb, pad, cw, yFn);
  drawCandles(ctx, data, pad, cw, yFn, true);

  [5,10,20,60,120].forEach(function(p){
    if(closes.length<p) return;
    drawLine(ctx, sma(closes,p), pad, cw, yFn, MA_COLORS[p], 1);
  });

  // S99: 통합판정 기준 마커 — S128: 매수/매도 쌍 표시 (현재 ▲면 직전 ▼도, 현재 ▼면 짝 ▲도)
  if(trades && trades.length){
    var offset = (fullLen||data.length) - data.length;
    var BUY_C = '#22c55e', SELL_C = '#e8365a';
    var ms = Math.max(cw * 1.5, 12);
    function fmtSh(d){ if(!d) return ''; d=String(d); if(d.length===8&&d.indexOf('-')<0){ return parseInt(d.slice(4,6),10)+'/'+parseInt(d.slice(6,8),10); } var p=d.split(/[-T]/); if(p.length>=3) return parseInt(p[1],10)+'/'+parseInt(p[2],10); return d.slice(5,10); }
    function _markerStroke(ctx,fillC){ ctx.save(); ctx.shadowColor=fillC; ctx.shadowBlur=8; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.stroke(); ctx.shadowBlur=0; ctx.restore(); }
    // S128: 마커 그리기 헬퍼 (중복 제거 + 쌍 표시 지원)
    //   isPair=true면 흐리게(0.55) 그려서 "현재 시점 아닌 짝" 표현
    function _drawBuyMarker(idxGlobal, dateStr, isPair){
      var eL = idxGlobal - offset;
      if(eL < 0 || eL >= data.length) return;
      var ex = pad.l + eL*cw + cw/2, ey = yFn(data[eL].low) + 1;
      ctx.save();
      if(isPair) ctx.globalAlpha = 0.55;
      ctx.fillStyle = BUY_C;
      ctx.beginPath(); ctx.moveTo(ex, ey-ms); ctx.lineTo(ex-ms*0.7, ey+ms*0.3); ctx.lineTo(ex+ms*0.7, ey+ms*0.3); ctx.closePath(); ctx.fill();
      _markerStroke(ctx, BUY_C);
      if(dateStr){
        ctx.font = 'bold 16px Outfit,sans-serif'; ctx.textAlign = 'center';
        var _txt = fmtSh(dateStr);
        var _ty = ey + ms*0.3 + 14;
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
        ctx.strokeText(_txt, ex, _ty);
        ctx.fillStyle = BUY_C;
        ctx.fillText(_txt, ex, _ty);
      }
      ctx.restore();
    }
    function _drawSellMarker(idxGlobal, dateStr, isPair){
      var xL = idxGlobal - offset;
      if(xL < 0 || xL >= data.length) return;
      var xx = pad.l + xL*cw + cw/2, xy = yFn(data[xL].high) - 1;
      ctx.save();
      if(isPair) ctx.globalAlpha = 0.55;
      ctx.fillStyle = SELL_C;
      ctx.beginPath(); ctx.moveTo(xx, xy+ms); ctx.lineTo(xx-ms*0.7, xy-ms*0.3); ctx.lineTo(xx+ms*0.7, xy-ms*0.3); ctx.closePath(); ctx.fill();
      _markerStroke(ctx, SELL_C);
      if(dateStr){
        ctx.font = 'bold 16px Outfit,sans-serif'; ctx.textAlign = 'center';
        var _txt = fmtSh(dateStr);
        var _ty = xy - ms*0.3 - 8;
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
        ctx.strokeText(_txt, xx, _ty);
        ctx.fillStyle = SELL_C;
        ctx.fillText(_txt, xx, _ty);
      }
      ctx.restore();
    }
    var lastTr = trades[trades.length - 1];
    var showBuy = svVerdict && svVerdict.chartMarker === 'buy';
    var showSell = svVerdict && svVerdict.chartMarker === 'sell';

    if(lastTr){
      // 매수 ▲ — 통합판정 매수일 때 + 짝 ▼ (직전 청산된 거래)
      if(showBuy && lastTr.entryIdx!=null){
        _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, false);
        // 짝: 직전 청산된 거래의 exitIdx
        for(var pi=trades.length-2; pi>=0; pi--){
          var pt = trades[pi];
          if(pt.type !== 'OPEN' && pt.exitIdx != null){
            _drawSellMarker(pt.exitIdx, pt.exitDate, true);
            break;
          }
        }
      }
      // 매도 ▼ — 통합판정 매도일 때
      if(showSell){
        if(lastTr.type !== 'OPEN' && lastTr.exitIdx != null){
          // BT 매도 체결 — 같은 거래의 entry-exit 쌍
          _drawSellMarker(lastTr.exitIdx, lastTr.exitDate, false);
          if(lastTr.entryIdx != null) _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, true);
        } else if(lastTr.type === 'OPEN'){
          // 보유중 + sell_ready — 마지막 봉에 ▼ + 진입 봉에 ▲
          _drawSellMarker((offset + data.length - 1), null, false);
          if(lastTr.entryIdx != null) _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, true);
        }
      }
      // S128: 보유중(holding) — 진입 봉 ▲ 반투명 표시 (맥락용)
      //   showBuy/showSell 두 경우 모두 이미 ▲ 처리됐으니 둘 다 아닐 때만
      //   [FIX-2 연장] svVerdict.action === '회피' 면 맥락 마커도 숨김 (중앙 카드와 일관)
      if(!showBuy && !showSell && lastTr.type === 'OPEN' && lastTr.entryIdx != null
         && !(svVerdict && svVerdict.action === '회피')){
        _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, true);
      }
      // svVerdict 없으면 fallback (하위 호환)
      if(!svVerdict){
        if(lastTr.entryIdx!=null) _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, false);
        if(lastTr.type!=='OPEN' && lastTr.exitIdx!=null) _drawSellMarker(lastTr.exitIdx, lastTr.exitDate, false);
      }
    }
    // 범례
    ctx.font='8px Outfit,sans-serif'; ctx.textAlign='right';
    ctx.fillStyle=BUY_C; ctx.fillText('▲매수', W-pad.r-32, 10);
    ctx.fillStyle=SELL_C; ctx.fillText('▼매도', W-pad.r-2, 10);
  }

  drawMALegend(ctx, closes, pad, H, 9);
}

/* ── 풀차트: 거래량 ── */
function _drawFullVolume(id, data, H){
  var canvas = document.getElementById(id);
  if(!canvas) return;
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:4,b:4,l:8,r:42};
  var cw = (W-pad.l-pad.r)/data.length;
  var maxVol = Math.max.apply(null, data.map(function(d){return d.volume;}))||1;
  var chartH = H-pad.t-pad.b;

  var vols = data.map(function(d){return d.volume;});
  var volMA = sma(vols, 20);

  data.forEach(function(d,i){
    var x=pad.l+i*cw;
    var bw=Math.max(cw*0.65,1);
    var h=(d.volume/maxVol)*chartH;
    ctx.fillStyle=d.close>=d.open?VOL_BULL:VOL_BEAR;
    ctx.fillRect(x+(cw-bw)/2, H-pad.b-h, bw, h);
  });

  drawLine(ctx, volMA, pad, cw, function(v){return H-pad.b-(v/maxVol)*chartH;}, '#f59e0b', 0.8);

  ctx.font='8px Outfit,sans-serif'; ctx.fillStyle=TXT; ctx.textAlign='right';
  ctx.fillText(maxVol>=1e6?(maxVol/1e6).toFixed(0)+'M':maxVol>=1e3?(maxVol/1e3).toFixed(0)+'K':maxVol.toFixed(0), W-3, pad.t+8);
}

/* ── 풀차트: RSI ── */
function _drawFullRSI(id, rsiArr, H){
  var canvas = document.getElementById(id);
  if(!canvas) return;
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:8,b:12,l:8,r:42};
  var cw = (W-pad.l-pad.r)/rsiArr.length;
  var chartH = H-pad.t-pad.b;
  var yFn = function(v){return pad.t+(100-v)/100*chartH;};

  ctx.fillStyle='rgba(232,54,90,.04)';
  ctx.fillRect(pad.l, yFn(100), W-pad.l-pad.r, yFn(70)-yFn(100));
  ctx.fillStyle='rgba(59,130,246,.04)';
  ctx.fillRect(pad.l, yFn(30), W-pad.l-pad.r, yFn(0)-yFn(30));

  [70,50,30].forEach(function(v){
    ctx.strokeStyle=GRID; ctx.lineWidth=0.5; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(pad.l,yFn(v)); ctx.lineTo(W-pad.r,yFn(v)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=TXT; ctx.font='8px Outfit,sans-serif'; ctx.textAlign='right';
    ctx.fillText(v, W-3, yFn(v)+3);
  });

  drawLine(ctx, rsiArr, pad, cw, yFn, RSI_COLOR, 1.2);

  var last = rsiArr[rsiArr.length-1];
  if(last!=null){
    ctx.fillStyle=last>70?BULL:last<30?BEAR:RSI_COLOR;
    ctx.font='bold 9px Outfit,sans-serif'; ctx.textAlign='left';
    ctx.fillText(last.toFixed(1), pad.l+4, pad.t+10);
  }
}

/* ── 풀차트: MACD ── */
function _drawFullMACD(id, macdObj, H){
  var canvas = document.getElementById(id);
  if(!canvas) return;
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:8,b:14,l:8,r:42};
  var macd=macdObj.macd, signal=macdObj.signal, hist=macdObj.hist;
  var cw = (W-pad.l-pad.r)/macd.length;

  var allV = macd.concat(signal,hist).filter(function(v){return v!=null&&isFinite(v);});
  var hi=Math.max.apply(null,allV), lo=Math.min.apply(null,allV);
  var absMax=Math.max(Math.abs(hi),Math.abs(lo))||1;
  var chartH=H-pad.t-pad.b;
  var yFn=function(v){return pad.t+chartH/2-(v/absMax)*(chartH/2);};

  ctx.strokeStyle=GRID; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.moveTo(pad.l,yFn(0)); ctx.lineTo(W-pad.r,yFn(0)); ctx.stroke();

  hist.forEach(function(v,i){
    if(v==null||!isFinite(v)) return;
    var x=pad.l+i*cw;
    var bw=Math.max(cw*0.5,1);
    var y0=yFn(0), y1=yFn(v);
    ctx.fillStyle=v>=0?HIST_P:HIST_N;
    ctx.fillRect(x+(cw-bw)/2, Math.min(y0,y1), bw, Math.abs(y1-y0)||0.5);
  });

  drawLine(ctx, macd, pad, cw, yFn, MACD_COLOR, 1);
  drawLine(ctx, signal, pad, cw, yFn, SIG_COLOR, 1);

  ctx.font='8px Outfit,sans-serif';
  ctx.fillStyle=MACD_COLOR; ctx.fillText('MACD', pad.l+4, H-3);
  ctx.fillStyle=SIG_COLOR; ctx.fillText('Signal', pad.l+34, H-3);

  ctx.fillStyle=TXT; ctx.textAlign='right'; ctx.font='8px Outfit,sans-serif';
  ctx.fillText(absMax.toFixed(1), W-3, pad.t+8);
  ctx.fillText((-absMax).toFixed(1), W-3, H-pad.b-2);
}

/* popstate는 sx_screener.html에서 통합 처리 */

// S57: 재무 바차트 (매출/영업이익/순이익 3개년)
function drawFinBar(canvasId, fin){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !fin) return;
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 300;
  var H = 120;
  var ctx = setupCanvas(canvas, W, H);

  // 데이터 수집: [전전기, 전기, 당기]
  var series = [
    {label:'매출', color:'#4a90d9', vals:[fin.revenuePrev2, fin.revenuePrev, fin.revenue]},
    {label:'영업이익', color:'#27ae60', vals:[fin.operatingIncomePrev2, fin.operatingIncomePrev, fin.operatingIncome]},
    {label:'순이익', color:'#e67e22', vals:[fin.netIncomePrev2, fin.netIncomePrev, fin.netIncome]}
  ].filter(function(s){ return s.vals.some(function(v){ return v != null; }); });
  if(!series.length) return;

  var years = ['전전기','전기','당기'];
  var nGroups = 3;
  var nBars = series.length;
  var pad = {t:10, b:20, l:8, r:8};
  var chartW = W - pad.l - pad.r;
  var chartH = H - pad.t - pad.b;
  var groupW = chartW / nGroups;
  var barW = Math.min(groupW / (nBars + 1), 18);
  var gap = (groupW - barW * nBars) / (nBars + 1);

  // 최대/최소값 계산
  var allVals = [];
  series.forEach(function(s){ s.vals.forEach(function(v){ if(v != null) allVals.push(v); }); });
  var maxVal = Math.max.apply(null, allVals);
  var minVal = Math.min.apply(null, allVals);
  if(minVal > 0) minVal = 0;
  var range = maxVal - minVal || 1;
  var zeroY = pad.t + (maxVal / range) * chartH;

  // 배경
  ctx.fillStyle = 'rgba(128,128,128,.08)';
  ctx.fillRect(pad.l, pad.t, chartW, chartH);

  // 0선
  ctx.strokeStyle = 'rgba(128,128,128,.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(pad.l, zeroY);
  ctx.lineTo(W - pad.r, zeroY);
  ctx.stroke();

  // 바 그리기
  for(var g = 0; g < nGroups; g++){
    var gx = pad.l + g * groupW;
    for(var si = 0; si < nBars; si++){
      var val = series[si].vals[g];
      if(val == null) continue;
      var bx = gx + gap * (si + 1) + barW * si;
      var barH = (Math.abs(val) / range) * chartH;
      var by = val >= 0 ? zeroY - barH : zeroY;
      ctx.fillStyle = val >= 0 ? series[si].color : series[si].color.replace(')', ',.5)').replace('rgb','rgba');
      ctx.fillRect(bx, by, barW, barH);
    }
    // 연도 라벨
    ctx.fillStyle = TXT;
    ctx.textAlign = 'center';
    ctx.font = '8px Outfit,sans-serif';
    ctx.fillText(years[g], gx + groupW / 2, H - 4);
  }

  // 범례
  ctx.font = '7px Outfit,sans-serif';
  var lx = pad.l + 2;
  for(var i = 0; i < series.length; i++){
    ctx.fillStyle = series[i].color;
    ctx.fillRect(lx, 2, 8, 6);
    ctx.fillStyle = TXT;
    ctx.textAlign = 'left';
    ctx.fillText(series[i].label, lx + 10, 8);
    lx += ctx.measureText(series[i].label).width + 18;
  }

  // 단위 라벨
  var unit = maxVal >= 1e12 ? '조' : maxVal >= 1e8 ? '억' : '만';
  var div = maxVal >= 1e12 ? 1e12 : maxVal >= 1e8 ? 1e8 : 1e4;
  ctx.fillStyle = TXT;
  ctx.textAlign = 'right';
  ctx.font = '7px Outfit,sans-serif';
  ctx.fillText((maxVal/div).toFixed(0) + unit, W - pad.r, pad.t + 8);
  if(minVal < 0) ctx.fillText((minVal/div).toFixed(0) + unit, W - pad.r, H - pad.b - 2);
}

/**
 * S58: 분기별 재무 추이 차트 (라인+바 혼합)
 * @param {string} canvasId - canvas element ID
 * @param {Array} periods - [{label:'2024 Q1', revenue, operatingIncome, netIncome}, ...]
 */
function drawFinTrend(canvasId, periods){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !periods || periods.length < 2) return;
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 340;
  var H = 160;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:14, b:24, l:36, r:12};
  var chartW = W - pad.l - pad.r;
  var chartH = H - pad.t - pad.b;
  var n = periods.length;
  var stepX = chartW / (n - 1 || 1);

  var series = [
    {key:'revenue', label:'매출', color:'#4a90d9', lineW:2},
    {key:'operatingIncome', label:'영업이익', color:'#27ae60', lineW:1.5},
    {key:'netIncome', label:'순이익', color:'#e67e22', lineW:1.5}
  ];

  // 전체 범위 계산
  var allVals = [];
  series.forEach(function(s){
    periods.forEach(function(p){
      var v = p[s.key];
      if(v != null) allVals.push(v);
    });
  });
  if(!allVals.length) return;
  var maxV = Math.max.apply(null, allVals);
  var minV = Math.min.apply(null, allVals);
  if(minV > 0) minV = 0;
  var range = maxV - minV || 1;

  var toY = function(v){ return pad.t + ((maxV - v) / range) * chartH; };
  var toX = function(i){ return pad.l + i * stepX; };

  // 배경 + 그리드
  ctx.fillStyle = 'rgba(128,128,128,.05)';
  ctx.fillRect(pad.l, pad.t, chartW, chartH);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.5;
  for(var gi = 0; gi <= 4; gi++){
    var gy = pad.t + (gi / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(W - pad.r, gy); ctx.stroke();
  }

  // 0선 (음수 있을 때)
  if(minV < 0){
    var zeroY = toY(0);
    ctx.strokeStyle = 'rgba(128,128,128,.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(pad.l, zeroY); ctx.lineTo(W - pad.r, zeroY); ctx.stroke();
  }

  // 라인 그리기
  series.forEach(function(s){
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lineW;
    ctx.beginPath();
    var started = false;
    for(var i = 0; i < n; i++){
      var v = periods[i][s.key];
      if(v == null) continue;
      var x = toX(i), y = toY(v);
      if(!started){ ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 점 표시
    for(var j = 0; j < n; j++){
      var val = periods[j][s.key];
      if(val == null) continue;
      ctx.beginPath();
      ctx.arc(toX(j), toY(val), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }
  });

  // X축 라벨 (기간)
  ctx.fillStyle = TXT;
  ctx.textAlign = 'center';
  ctx.font = '7px Outfit,sans-serif';
  for(var xi = 0; xi < n; xi++){
    ctx.fillText(periods[xi].label || '', toX(xi), H - 4);
  }

  // Y축 라벨 (최대/최소)
  var unit = Math.abs(maxV) >= 1e12 ? '조' : Math.abs(maxV) >= 1e8 ? '억' : '만';
  var dv = Math.abs(maxV) >= 1e12 ? 1e12 : Math.abs(maxV) >= 1e8 ? 1e8 : 1e4;
  ctx.fillStyle = TXT;
  ctx.textAlign = 'right';
  ctx.font = '7px Outfit,sans-serif';
  ctx.fillText((maxV/dv).toFixed(0) + unit, pad.l - 2, pad.t + 8);
  if(minV < 0) ctx.fillText((minV/dv).toFixed(0) + unit, pad.l - 2, H - pad.b - 2);

  // 범례
  ctx.font = '7px Outfit,sans-serif';
  var lx = pad.l + 2;
  for(var li = 0; li < series.length; li++){
    ctx.fillStyle = series[li].color;
    ctx.fillRect(lx, 2, 8, 6);
    ctx.fillStyle = TXT;
    ctx.textAlign = 'left';
    ctx.fillText(series[li].label, lx + 10, 8);
    lx += ctx.measureText(series[li].label).width + 18;
  }
}

/* ════════════════════════════════════════════════════════════
   S87: 구간 분포 추이 — 진입타이밍/강세/추세 3색 스택 바 (캔버스)
   timeline: [{bar,readyPct,entryPct,trendPct,transEvt?}]
   detailCb(el, detailId) — bar 클릭 시 콜백
   ════════════════════════════════════════════════════════════ */
function drawScoreSpark(canvasId, timeline, detailId){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !timeline || timeline.length < 3) return;
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 300;
  var H = 50;
  var ctx = setupCanvas(canvas, W, H);

  var n = timeline.length;
  var pad = {l:2, r:2, t:10, b:12};
  var barW = (W - pad.l - pad.r) / n;
  var chartH = H - pad.t - pad.b;

  var READY_CLR = '#7c5cff';
  var ENTRY_CLR = 'rgba(232,54,90,.7)';
  var TREND_CLR = '#e8365a';

  for(var i = 0; i < n; i++){
    var pt = timeline[i];
    var x = pad.l + i * barW;
    var total = (pt.readyPct||0) + (pt.entryPct||0) + (pt.trendPct||0);
    if(total <= 0) continue;
    var rH = (pt.readyPct / total) * chartH;
    var eH = (pt.entryPct / total) * chartH;
    var tH = (pt.trendPct / total) * chartH;
    var y = pad.t;
    // ready
    ctx.fillStyle = READY_CLR; ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, barW - 0.5, Math.max(rH, pt.readyPct > 0 ? 1 : 0));
    y += rH;
    // entry
    ctx.fillStyle = ENTRY_CLR; ctx.globalAlpha = 0.7;
    ctx.fillRect(x, y, barW - 0.5, Math.max(eH, pt.entryPct > 0 ? 1 : 0));
    y += eH;
    // trend
    ctx.fillStyle = TREND_CLR; ctx.globalAlpha = 1;
    ctx.fillRect(x, y, barW - 0.5, Math.max(tH, pt.trendPct > 0 ? 1 : 0));

    // 전이 마커
    if(pt.transEvt){
      var mClr = pt.transEvt.to==='trend'?TREND_CLR:pt.transEvt.to==='entry'?READY_CLR:'#999';
      var mSym = pt.transEvt.to==='trend'?'^':pt.transEvt.to==='entry'?'>':'v';
      ctx.globalAlpha = 1;
      ctx.fillStyle = mClr;
      ctx.font = '7px Outfit,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mSym, x + barW/2, pad.t - 2);
    }
  }
  ctx.globalAlpha = 1;

  // 범례 + 라벨
  ctx.font = '7px Outfit,sans-serif';
  ctx.textAlign = 'left';
  var lx = pad.l;
  var items = [{c:READY_CLR,l:'진입타이밍'},{c:ENTRY_CLR,l:'강세'},{c:TREND_CLR,l:'추세'}];
  for(var li=0;li<items.length;li++){
    ctx.fillStyle = items[li].c;
    ctx.fillRect(lx, H - 8, 6, 5);
    ctx.fillStyle = TXT;
    ctx.fillText(items[li].l, lx + 8, H - 3);
    lx += ctx.measureText(items[li].l).width + 14;
  }
  ctx.fillStyle = TXT; ctx.textAlign = 'left'; ctx.fillText('과거', pad.l, H - pad.b + 9);
  ctx.textAlign = 'right'; ctx.fillText('현재', W - pad.r, H - pad.b + 9);

  // 클릭 이벤트 (캔버스 위 영역 바인딩)
  canvas.onclick = function(e){
    var cRect = canvas.getBoundingClientRect();
    var mx = (e.clientX - cRect.left);
    var idx = Math.floor((mx - pad.l) / barW);
    if(idx < 0 || idx >= n) return;
    var pt = timeline[idx];
    // _showTlDetail 호출을 위해 가상 element 생성
    var fakeEl = document.createElement('div');
    fakeEl.setAttribute('data-bar', pt.bar);
    fakeEl.setAttribute('data-r', pt.readyPct);
    fakeEl.setAttribute('data-e', pt.entryPct);
    fakeEl.setAttribute('data-t', pt.trendPct);
    if(pt.transEvt){
      fakeEl.setAttribute('data-from', pt.transEvt.from);
      fakeEl.setAttribute('data-to', pt.transEvt.to);
      fakeEl.setAttribute('data-cnt', pt.transEvt.count);
    }
    if(typeof _showTlDetail === 'function') _showTlDetail(fakeEl, detailId);
  };
}

/* ════════════════════════════════════════════════════════════
   S87: 진입타이밍 추이 바차트 (모멘텀 히스토리 → 캔버스)
   history: [{score, ...}] — 최신이 마지막 (reverse 필요 없음)
   lookback: 표시 봉 수
   ════════════════════════════════════════════════════════════ */
function drawDeltaBar(canvasId, history, lookback){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !history || history.length < 3) return;
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 300;
  var H = 48;
  var ctx = setupCanvas(canvas, W, H);

  var n = history.length;
  var pad = {l:4, r:4, t:12, b:14};
  var barW = (W - pad.l - pad.r) / n;
  var chartH = H - pad.t - pad.b;
  var maxScore = 0;
  for(var i = 0; i < n; i++) if(history[i].score > maxScore) maxScore = history[i].score;
  if(maxScore < 10) maxScore = 10;

  for(i = 0; i < n; i++){
    var sc = history[i].score;
    var prev = i > 0 ? history[i-1].score : sc;
    var barH = Math.max(2, (sc / maxScore) * chartH);
    var x = pad.l + i * barW;
    var y = pad.t + chartH - barH;
    var col = sc > prev ? BULL : sc < prev ? BEAR : TXT;
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y, Math.max(barW - 2, 2), barH);
    // 점수 라벨
    ctx.fillStyle = TXT;
    ctx.font = '7px Outfit,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sc, x + barW/2, y - 2);
  }

  // 하단 라벨
  ctx.fillStyle = TXT;
  ctx.font = '7px Outfit,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText((lookback||n)-1+'봉전', pad.l, H - 2);
  ctx.textAlign = 'right';
  ctx.fillText('현재', W - pad.r, H - 2);
}

/* ════════════════════════════════════════════════════════════
   S87: 스캐너 카드용 미니 점수 게이지 (반원형)
   score: 0~100, label: '진입타이밍' 등
   ════════════════════════════════════════════════════════════ */
function drawScoreGauge(canvasId, score, label){
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  var size = 48;
  var ctx = setupCanvas(canvas, size, size/2 + 8);
  var cH = size/2 + 8;

  var cx = size/2, cy = size/2;
  var r = size/2 - 4;

  // 배경 호
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(128,128,128,.15)';
  ctx.stroke();

  // 점수 호
  var pct = Math.min(100, Math.max(0, score)) / 100;
  var endAngle = Math.PI + pct * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, endAngle);
  ctx.lineWidth = 4;
  ctx.strokeStyle = score >= 60 ? BULL : score >= 40 ? '#f59e0b' : BEAR;
  ctx.stroke();

  // 점수 텍스트
  ctx.fillStyle = score >= 60 ? BULL : score >= 40 ? '#f59e0b' : BEAR;
  ctx.font = 'bold 11px Outfit,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(score, cx, cy - 1);

  // 라벨
  if(label){
    ctx.fillStyle = TXT;
    ctx.font = '6px Outfit,sans-serif';
    ctx.fillText(label, cx, cH - 1);
  }
}

/* ════════════════════════════════════════════════════════════
   S95→S99: 미니 차트 + 통합판정 마커 오버레이
   trades: [{entryIdx, exitIdx, type, ...}]
   svVerdict: {action, chartMarker('buy'|'sell'|null), color, icon} — 통합판정
   ▲ 초록 = 통합 "매수" (BT 매수 + buy_ready)
   ▼ 빨강 = 통합 "매도" (BT 매도 또는 보유중 + sell_ready)
   마커 없음 = 그 외
   ════════════════════════════════════════════════════════════ */
function drawMiniWithTrades(canvasId, rows, trades, svVerdict){
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  if(!rows || !rows.length) return; // [PATCH-2] null/undefined/빈배열 방어
  // trades 없으면 기존 drawMini 동작
  if(!trades || !trades.length){ drawMini(canvasId, rows); return; }

  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var H = 180; // 마커+날짜 공간 확보
  var ctx = setupCanvas(canvas, W, H);

  var fullLen = rows.length;
  var dispCount = Math.min(60, fullLen);
  var data = rows.slice(-dispCount);
  if(data.length<5) return;
  var offset = fullLen - dispCount; // 화면에 보이는 첫 봉의 원래 인덱스

  var pad = {t:14,b:18,l:8,r:42};
  var cw = (W-pad.l-pad.r)/data.length;
  var closes = data.map(function(d){return d.close;});
  var allV = data.flatMap(function(d){return [d.high,d.low];});

  var bb = calcBB(closes, 20, 2);
  bb.upper.forEach(function(v){if(v!=null) allV.push(v);});
  bb.lower.forEach(function(v){if(v!=null) allV.push(v);});

  var hi=Math.max.apply(null,allV), lo=Math.min.apply(null,allV);
  var range=hi-lo||1;
  var yFn=function(v){return pad.t+(hi-v)/range*(H-pad.t-pad.b);};

  drawGrid(ctx, pad, W, H, lo, hi, 3);
  drawBBFill(ctx, bb, pad, cw, yFn);

  // 미청산 포지션 반투명 배경 (▲~▼ 사이 보유구간)
  var openTrade = null;
  for(var ti=0;ti<trades.length;ti++){
    if(trades[ti].type==='OPEN'){ openTrade=trades[ti]; break; }
  }
  if(openTrade && openTrade.entryIdx!=null){
    var oStart = openTrade.entryIdx - offset;
    if(oStart < data.length && oStart >= -1){
      oStart = Math.max(0, oStart);
      var oX = pad.l + oStart * cw;
      var oW = (data.length - oStart) * cw;
      ctx.fillStyle = 'rgba(34,197,94,.06)';
      ctx.fillRect(oX, pad.t, oW, H-pad.t-pad.b);
    }
  }

  drawCandles(ctx, data, pad, cw, yFn, false);

  [5,10,20,60,120].forEach(function(p){
    if(data.length<p) return;
    drawLine(ctx, sma(closes,p), pad, cw, yFn, MA_COLORS[p], 0.8);
  });

  // S99: 통합판정 기준 마커 — S128: 쌍 표시 (현재 ▲면 직전 ▼도, 현재 ▼면 짝 ▲도)
  var BUY_CLR = '#22c55e';   // 녹색 (매수)
  var SELL_CLR = '#e8365a';  // 빨강 (매도)
  var markerSize = Math.max(cw * 1.2, 10);

  function fmtShort(d){
    if(!d) return '';
    d=String(d);
    if(d.length===8&&d.indexOf('-')<0) return parseInt(d.slice(4,6),10)+'/'+parseInt(d.slice(6,8),10);
    var parts = d.split(/[-T]/);
    if(parts.length>=3) return parseInt(parts[1],10)+'/'+parseInt(parts[2],10);
    return d.slice(5,10);
  }
  function _markerStrokeMini(ctx,fillC){ ctx.save(); ctx.shadowColor=fillC; ctx.shadowBlur=6; ctx.strokeStyle='#000'; ctx.lineWidth=1.5; ctx.stroke(); ctx.shadowBlur=0; ctx.restore(); }
  // S128: 쌍 표시 헬퍼 (isPair=true면 반투명)
  function _drawBuyMini(idxGlobal, dateStr, isPair){
    var eL = idxGlobal - offset;
    if(eL < 0 || eL >= data.length) return;
    var ex = pad.l + eL*cw + cw/2, ey = yFn(data[eL].low) + 1;
    ctx.save();
    if(isPair) ctx.globalAlpha = 0.55;
    ctx.fillStyle = BUY_CLR;
    ctx.beginPath();
    ctx.moveTo(ex, ey - markerSize);
    ctx.lineTo(ex - markerSize*0.7, ey + markerSize*0.3);
    ctx.lineTo(ex + markerSize*0.7, ey + markerSize*0.3);
    ctx.closePath(); ctx.fill();
    _markerStrokeMini(ctx, BUY_CLR);
    if(dateStr){
      ctx.font = 'bold 14px Outfit,sans-serif'; ctx.textAlign = 'center';
      var _txt = fmtShort(dateStr);
      var _ty = ey + markerSize*0.3 + 9;
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
      ctx.strokeText(_txt, ex, _ty);
      ctx.fillStyle = BUY_CLR;
      ctx.fillText(_txt, ex, _ty);
    }
    ctx.restore();
  }
  function _drawSellMini(idxGlobal, dateStr, isPair){
    var xL = idxGlobal - offset;
    if(xL < 0 || xL >= data.length) return;
    var xx = pad.l + xL*cw + cw/2, xy = yFn(data[xL].high) - 1;
    ctx.save();
    if(isPair) ctx.globalAlpha = 0.55;
    ctx.fillStyle = SELL_CLR;
    ctx.beginPath();
    ctx.moveTo(xx, xy + markerSize);
    ctx.lineTo(xx - markerSize*0.7, xy - markerSize*0.3);
    ctx.lineTo(xx + markerSize*0.7, xy - markerSize*0.3);
    ctx.closePath(); ctx.fill();
    _markerStrokeMini(ctx, SELL_CLR);
    if(dateStr){
      ctx.font = 'bold 14px Outfit,sans-serif'; ctx.textAlign = 'center';
      var _txt = fmtShort(dateStr);
      var _ty = xy - markerSize*0.3 - 4;
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
      ctx.strokeText(_txt, xx, _ty);
      ctx.fillStyle = SELL_CLR;
      ctx.fillText(_txt, xx, _ty);
    }
    ctx.restore();
  }

  var lastTr = trades[trades.length - 1];
  var showBuyMarker = svVerdict && svVerdict.chartMarker === 'buy';
  var showSellMarker = svVerdict && svVerdict.chartMarker === 'sell';

  // 매수 ▲ — 통합판정 "매수"일 때 + 짝 ▼ (직전 청산 거래)
  if(showBuyMarker && lastTr && lastTr.entryIdx != null){
    _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, false);
    // 짝: 직전 청산된 거래의 exitIdx
    for(var pi = trades.length - 2; pi >= 0; pi--){
      var pt = trades[pi];
      if(pt.type !== 'OPEN' && pt.exitIdx != null){
        _drawSellMini(pt.exitIdx, pt.exitDate, true);
        break;
      }
    }
  }

  // 매도 ▼ — 통합판정 "매도"일 때 (BT 매도 or 보유중+sell_ready) + 짝 ▲
  if(showSellMarker && lastTr){
    if(lastTr.type !== 'OPEN' && lastTr.exitIdx != null){
      // BT 매도 체결 — 같은 거래의 entry-exit 쌍
      _drawSellMini(lastTr.exitIdx, lastTr.exitDate, false);
      if(lastTr.entryIdx != null) _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, true);
    }
    else if(lastTr.type === 'OPEN'){
      // 보유중 + sell_ready → 마지막 봉에 ▼ + 진입 봉에 ▲ 짝
      _drawSellMini((offset + data.length - 1), null, false);
      if(lastTr.entryIdx != null) _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, true);
    }
  }

  // S128: 보유중(holding) — 진입 봉 ▲ 반투명 표시 (맥락용)
  //   showBuyMarker/showSellMarker 둘 다 아닐 때만 (중복 방지)
  //   [FIX-2 연장] svVerdict.action === '회피' 면 중앙 카드와 동일하게 맥락 마커도 숨김
  //     (외부 판정과 차트 마커 엇갈림 방지 — 이슈 2 일관성)
  if(!showBuyMarker && !showSellMarker && lastTr && lastTr.type === 'OPEN' && lastTr.entryIdx != null
     && !(svVerdict && svVerdict.action === '회피')){
    _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, true);
  }

  // svVerdict 없으면 기존 방식 fallback (하위 호환)
  if(!svVerdict && lastTr){
    if(lastTr.entryIdx != null) _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, false);
    if(lastTr.type !== 'OPEN' && lastTr.exitIdx != null) _drawSellMini(lastTr.exitIdx, lastTr.exitDate, false);
  }

  drawMALegend(ctx, closes, pad, H, 8);
  // 마커 범례
  ctx.font = '7px Outfit,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = BUY_CLR; ctx.fillText('▲매수', W-pad.r-32, 10);
  ctx.fillStyle = SELL_CLR; ctx.fillText('▼매도', W-pad.r-2, 10);
}

// S97→S99: 매매이력 탭 → 미니차트 봉 하이라이트
var _hlTimeout = null;
function highlightBar(canvasId, barIdx, rows, trades, svVerdict){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !rows || !rows.length) return;
  // 다시 그리기 (기존 마커 포함)
  if(trades && trades.length) drawMiniWithTrades(canvasId, rows, trades, svVerdict);
  else drawMini(canvasId, rows);
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 360;
  var dispCount = Math.min(60, rows.length);
  var offset = rows.length - dispCount;
  var localIdx = barIdx - offset;
  if(localIdx < 0 || localIdx >= dispCount) return;
  var pad = {t:14, b:18, l:8, r:42};
  var cw = (W - pad.l - pad.r) / dispCount;
  var x = pad.l + localIdx * cw;
  // 세로 하이라이트 밴드
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, pad.t, cw, 180 - pad.t - pad.b);
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  var cx = x + cw / 2;
  ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, 180 - pad.b); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // 3초 후 하이라이트 제거
  clearTimeout(_hlTimeout);
  _hlTimeout = setTimeout(function(){
    if(trades && trades.length) drawMiniWithTrades(canvasId, rows, trades, svVerdict);
    else drawMini(canvasId, rows);
  }, 3000);
}

return { drawMini: drawMini, drawMiniWithTrades: drawMiniWithTrades, openFull: openFull, closeFull: closeFull, drawFinBar: drawFinBar, drawFinTrend: drawFinTrend, drawScoreSpark: drawScoreSpark, drawDeltaBar: drawDeltaBar, drawScoreGauge: drawScoreGauge, highlightBar: highlightBar };
})();
