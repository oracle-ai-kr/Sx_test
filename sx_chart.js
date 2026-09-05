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
// EMA: 분석엔진 emaArray와 동일한 구현 (첫 p봉의 SMA를 시드로 사용)
//   → 차트 표시값과 분석탭 값의 일관성 보장, MACD/시그널 라인 정확도 향상
//   〔이력〕 v1.8 이전: i=0에서 첫 값으로 시작 → 분석탭과 미세한 차이 발생 (수정됨)
function ema(arr,p){
  const r=[],k=2/(p+1);
  let e=null;
  for(let i=0;i<arr.length;i++){
    if(i<p-1){r.push(null);continue;}
    if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=arr[j];e=s/p;r.push(e);continue;}
    e=arr[i]*k+e*(1-k);
    r.push(e);
  }
  return r;
}
function calcBB(c,p,m){p=p||20;m=m||2;const mid=sma(c,p),u=[],l=[];for(let i=0;i<c.length;i++){if(mid[i]==null){u.push(null);l.push(null);continue;}let s=0;for(let j=i-p+1;j<=i;j++)s+=(c[j]-mid[i])**2;const sd=Math.sqrt(s/p);u.push(mid[i]+m*sd);l.push(mid[i]-m*sd);}return{mid:mid,upper:u,lower:l};}
function calcRSI(c,p){p=p||14;const r=[];let ag=0,al=0;for(let i=0;i<c.length;i++){if(i===0){r.push(50);continue;}const d=c[i]-c[i-1],g=d>0?d:0,lo=d<0?-d:0;if(i<=p){ag+=g/p;al+=lo/p;r.push(i===p?(al===0?100:100-100/(1+ag/al)):50);}else{ag=(ag*(p-1)+g)/p;al=(al*(p-1)+lo)/p;r.push(al===0?100:100-100/(1+ag/al));}}return r;}
// calcMACD: null EMA 값 안전 처리 — fast/slow 어느 쪽이라도 null이면 macd line도 null
//   signal 라인은 macd가 null이었던 봉에서는 null로 정리 → drawLine null 가드와 일관성
//   〔이력〕 이전: null - null = NaN → drawLine 가드 우회 → NaN 좌표로 그려지는 버그 (수정됨)
function calcMACD(c,f,s,sig){
  f=f||12;s=s||26;sig=sig||9;
  const fast=ema(c,f),slow=ema(c,s);
  const m=fast.map(function(v,i){
    return (v==null||slow[i]==null)?null:v-slow[i];
  });
  const sl=ema(m.map(function(v){return v==null?0:v;}),sig);
  // signal 라인의 초반은 macd line이 null이었던 봉에서는 의미 없음 → null로
  const slClean=sl.map(function(v,i){return m[i]==null?null:v;});
  const h=m.map(function(v,i){
    return (v==null||slClean[i]==null)?null:v-slClean[i];
  });
  return{macd:m,signal:slClean,hist:h};
}

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
  // [S214] null 봉 사이에서 path 끊김 처리 — BB 영역이 잘못 채워지는 버그 수정
  //   〔이력〕 이전: 한 번 started=true 후엔 null 봉 무시하고 lineTo 계속 → 채워진 영역이 한쪽으로 흘러감 (수정됨)
  //   현재: null 봉 만나면 현재 path 채우고 새 path 시작 — 분리된 BB 영역으로 정확히 그림
  var upper=bb.upper, lower=bb.lower, mid=bb.mid;
  // 연속 null이 아닌 구간들로 분리 (segments)
  var segments = [];
  var seg = null;
  for(var i=0;i<upper.length;i++){
    if(upper[i]==null || lower[i]==null){
      if(seg){ segments.push(seg); seg = null; }
    } else {
      if(!seg) seg = { start: i, end: i };
      else seg.end = i;
    }
  }
  if(seg) segments.push(seg);

  // 각 세그먼트별로 채움
  ctx.fillStyle = BB_FILL;
  for(var s = 0; s < segments.length; s++){
    var sg = segments[s];
    if(sg.end - sg.start < 1) continue; // 단일 점은 채움 의미 없음
    ctx.beginPath();
    // upper 좌→우
    for(var j = sg.start; j <= sg.end; j++){
      var x = pad.l + j*cw + cw/2;
      if(j === sg.start) ctx.moveTo(x, yFn(upper[j]));
      else ctx.lineTo(x, yFn(upper[j]));
    }
    // lower 우→좌
    for(var k = sg.end; k >= sg.start; k--){
      var x2 = pad.l + k*cw + cw/2;
      ctx.lineTo(x2, yFn(lower[k]));
    }
    ctx.closePath();
    ctx.fill();
  }
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
function drawMini(canvasId, rows, svVerdict){
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  if(!rows || !rows.length) return; // null/undefined/빈배열 방어
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

  // [S358] 현재 C판정 보라 마커 (날짜 없음) — 상세차트 [C3] 정책과 일관성.
  //   BT 거래가 0건이어도(=drawMiniWithTrades 미경유) 매수/매도 판정이면 마지막 봉에 표시.
  if(svVerdict && (svVerdict.chartMarker === 'buy' || svVerdict.chartMarker === 'sell')){
    var CURRENT_C = '#a855f7'; // 보라색 (Tailwind purple-500)
    var _holdC2 = false; // [S579] 보라 마커 항상 솔리드 채움 (A 마커와 동일) — S361 보유중 속빈 렌더 비활성
    var ms = Math.max(cw * 1.2, 10);
    var li = data.length - 1;
    if(li >= 0){
      var mx = pad.l + li*cw + cw/2;
      ctx.save();
      ctx.beginPath();
      if(svVerdict.chartMarker === 'buy'){
        var by = yFn(data[li].low) + 1;
        ctx.moveTo(mx, by - ms);
        ctx.lineTo(mx - ms*0.7, by + ms*0.3);
        ctx.lineTo(mx + ms*0.7, by + ms*0.3);
      } else {
        var sy = yFn(data[li].high) - 1;
        ctx.moveTo(mx, sy + ms);
        ctx.lineTo(mx - ms*0.7, sy - ms*0.3);
        ctx.lineTo(mx + ms*0.7, sy - ms*0.3);
      }
      ctx.closePath();
      if(_holdC2){
        // 보유중(추가진입/부분익절): 속 비우고 보라 실선 굵은 테두리
        ctx.lineJoin='round'; ctx.lineWidth=2.4; ctx.strokeStyle=CURRENT_C;
        ctx.shadowColor=CURRENT_C; ctx.shadowBlur=4; ctx.stroke(); ctx.shadowBlur=0;
      } else {
        ctx.fillStyle = CURRENT_C; ctx.fill();
        ctx.shadowColor=CURRENT_C; ctx.shadowBlur=6; ctx.strokeStyle='#000'; ctx.lineWidth=1.5; ctx.stroke(); ctx.shadowBlur=0;
      }
      ctx.restore();
    }
    // 보라 마커 범례 (drawMini엔 BT 범례 없음 → 현재 판정만 표기)
    ctx.save();
    ctx.font='8px Outfit,sans-serif'; ctx.textAlign='right';
    ctx.fillStyle=CURRENT_C; ctx.fillText('● 현재', W-pad.r-2, 10);
    ctx.restore();
  }
  // [S578] 단기추세(S) 마커 — 거래 0건 폴백 경로에서도 표시(S562 한계 해소). 녹/적='S'일 때만.
  if(_chartGreenRedMode() === 'S') _drawTrendMarkers(ctx, data, pad, cw, yFn, closes, W, 8, rows);   /* [S1548] 전체 봉 전달 */
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
    // [S282] PC 와이드 화면 모바일 비율 유지 — 480px 박스 가운데 정렬
    // [S284] inset:0 + max-width + margin:0 auto 조합이 일부 환경(특히 동적 인라인 스타일)에서
    //         left:0/right:0 강제 적용으로 max-width 무효화되는 문제 발견.
    //         → transform:translateX(-50%) + left:50% + width:100% 패턴으로 변경 (가장 호환성 안전)
    ov.style.cssText = 'position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:#fff;z-index:500;display:flex;flex-direction:column;overflow:hidden';
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
      '<button id="sxCpOvBtn" onclick="if(typeof _sxVib===\'function\')_sxVib(8);window._cpToggleOverlay&&_cpToggleOverlay()" style="border:1px solid #7c3aed;background:' + (window._sxCpOverlayOn!==false?'#7c3aed':'#fff') + ';color:' + (window._sxCpOverlayOn!==false?'#fff':'#7c3aed') + ';font-size:9px;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;flex-shrink:0">\uD83D\uDD2E \uC608\uCE21 ' + (window._sxCpOverlayOn!==false?'ON':'OFF') + '</button>' +
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
    _drawFullCandle('sxFullCandle', data, closes, bb, 240, rows.length, trades, svVerdict, rows);
    _drawFullVolume('sxFullVol', data, 70);
    _drawFullRSI('sxFullRSI', rsiArr, 90);
    _drawFullMACD('sxFullMACD', macdObj, 90);
    // [S663] 예측 오버레이 토글 재렌더용 — 캔들 캔버스만 다시 그림(예측 ON/OFF 시)
    window._sxCpFullRedraw = function(){ try{ _drawFullCandle('sxFullCandle', data, closes, bb, 240, rows.length, trades, svVerdict, rows); }catch(_e){} };
  }, 80);
}

function closeFull(){
  // [S213] display 토글은 popstate 핸들러(sx_screener.html)에서 처리
  //   여기서는 history.back()만 호출 → popstate 발화 → 거기서 display='none' + 미니차트 재렌더
  //   (이전 코드: display='none' 먼저 → history.back() 시 popstate 분기에서 display!=='none' false라 패스되어
  //    분석 오버레이가 같이 닫히는 버그가 있었음)
  var ov = document.getElementById('sxChartOverlay');
  if(ov && ov.style.display !== 'none' && ov.style.display !== ''){
    try{ history.back(); }catch(e){
      // fallback: history 사용 불가 시 직접 닫기
      ov.style.display = 'none';
    }
  }
}

// [S663] 풀차트 예측 오버레이 ON/OFF — 플래그 반전 + 버튼 갱신 + 캔들 캔버스 재렌더(예측 비활성 종목은 그려도 no-op)
function _cpToggleOverlay(){
  if(typeof window==='undefined') return;
  window._sxCpOverlayOn = (window._sxCpOverlayOn === false);   // 기본(undefined)=ON → 첫 클릭 OFF, 이후 토글
  var on = window._sxCpOverlayOn !== false;
  var btn = document.getElementById('sxCpOvBtn');
  if(btn){ btn.textContent = '\uD83D\uDD2E \uC608\uCE21 ' + (on?'ON':'OFF'); btn.style.background = on?'#7c3aed':'#fff'; btn.style.color = on?'#fff':'#7c3aed'; }
  if(window._sxCpFullRedraw) window._sxCpFullRedraw();
}
if(typeof window!=='undefined') window._cpToggleOverlay = _cpToggleOverlay;

/* ── 풀차트: 캔들 + MA + BB ── */
function _drawFullCandle(id, data, closes, bb, H, fullLen, trades, svVerdict, fullRows){
  var canvas = document.getElementById(id);
  if(!canvas) return;
  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var ctx = setupCanvas(canvas, W, H);

  var pad = {t:8,b:20,l:8,r:42};
  // [S663] 차트예측 오버레이 — 우측에 H봉 예상경로(중앙값+아날로그 fan). 토글 OFF/예측 비활성이면 pred=null → 완전 no-op(기존 차트 동일).
  var pred = null;
  if(window._sxCpOverlayOn !== false && fullRows && window.SXCP && SXCP.predict){
    try { var _pr = SXCP.predict(fullRows, { regime: !!window._sxCpRegimeOn, match: (window._sxCpHybridOn?'hybrid':'shape') }); if(_pr && _pr.active) pred = _pr; } catch(_e){}   // [S664] 카드와 동일 매칭모드
  }
  var projN = pred ? pred.h : 0;
  var cw = (W-pad.l-pad.r)/(data.length + projN);   // 예측 시 우측 공간 확보(캔들은 좌측으로 압축)

  var allV = data.flatMap(function(d){return [d.high,d.low];});
  bb.upper.forEach(function(v){if(v!=null) allV.push(v);});
  bb.lower.forEach(function(v){if(v!=null) allV.push(v);});
  if(pred){   // fan/중앙값 가격 극단을 범위에 포함(클리핑 방지)
    var _anc = data[data.length-1].close;
    pred.analogs.forEach(function(a){ for(var _t=0;_t<a.path.length;_t++) allV.push(_anc*(1+a.path[_t])); });
    for(var _mt=0;_mt<pred.medPath.length;_mt++) allV.push(_anc*(1+pred.medPath[_mt]));
  }
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

  // S99/S128: BT 거래 마커 — 마지막 거래의 매수(▲)/매도(▼)를 차트 위에 표시
  //   화면 범위(최근 ~봉) 밖이면 해당 마커는 자동 생략 (각 함수 내부 가드)
  //   〔미사용 인프라〕 isPair 인자: 현재 모든 호출부 false. 원래 의도는 "현재 마커는 진하게,
  //     과거 짝 마커는 흐리게(globalAlpha=0.55)" 표시 — 인프라만 살아있고 호출 패턴은 미적용
  if(trades && trades.length){
    var offset = (fullLen||data.length) - data.length;
    var BUY_C = '#22c55e', SELL_C = '#e8365a';
    var _gr = _chartGreenRedMode(); // [S578→S1436] 'R'=백테스트 마커 / 'S'=추세마커(아래 _drawTrendMarkers) — 구 주석의 'B'는 S988에서 'R'로 바뀌었다
    var ms = Math.max(cw * 1.5, 12);
    function fmtSh(d){ if(!d) return ''; d=String(d); if(d.length===8&&d.indexOf('-')<0){ return parseInt(d.slice(4,6),10)+'/'+parseInt(d.slice(6,8),10); } var p=d.split(/[-T]/); if(p.length>=3) return parseInt(p[1],10)+'/'+parseInt(p[2],10); return d.slice(5,10); }
    function _markerStroke(ctx,fillC){ ctx.save(); ctx.shadowColor=fillC; ctx.shadowBlur=8; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.stroke(); ctx.shadowBlur=0; ctx.restore(); }
    // 마커 그리기 헬퍼 (BT 진입/청산용)
    //   isPair: true면 흐리게(globalAlpha=0.55) — 현재 미사용. "과거 짝 마커" 표시 인프라용
    function _drawBuyMarker(idxGlobal, dateStr, isPair){
      // [S447] 날짜 기반 위치 우선 — 봉 배열 변동(추가/앞잘림)에도 정확한 봉에 고정. 매칭 실패 시 인덱스 폴백.
      var eL = -1;
      if(dateStr){ for(var _di=data.length-1; _di>=0; _di--){ if(data[_di].date===dateStr){ eL=_di; break; } } }
      if(eL < 0) eL = idxGlobal - offset;
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
      // [S447] 날짜 기반 위치 우선 (BT 청산 마커) — 봉 배열 변동에도 정확한 봉 고정. 실패 시 인덱스 폴백.
      var xL = -1;
      if(dateStr){ for(var _di=data.length-1; _di>=0; _di--){ if(data[_di].date===dateStr){ xL=_di; break; } } }
      if(xL < 0) xL = idxGlobal - offset;
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

    // POLICY C (하이브리드): 두 종류 마커를 함께 표시 — 색상으로 시각 구분
    //   ① BT 마커 (녹/적, 날짜 라벨) — 마지막 BT 거래의 entry+exit
    //   ② 현재 판정 마커 (보라, 마지막 봉, 날짜 없음) — svVerdict.chartMarker 기준
    var CURRENT_C = '#a855f7'; // 보라색
    var _holdC = false; // [S579] 보라 마커 항상 솔리드 채움 (A 마커와 동일) — S361 보유중 속빈 렌더 비활성
    function _drawCurrentBuyMarkerFull(){
      var lastIdx = data.length - 1;
      if(lastIdx < 0) return;
      var ex = pad.l + lastIdx*cw + cw/2, ey = yFn(data[lastIdx].low) + 1;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex, ey - ms);
      ctx.lineTo(ex - ms*0.7, ey + ms*0.3);
      ctx.lineTo(ex + ms*0.7, ey + ms*0.3);
      ctx.closePath();
      if(_holdC){
        // [S361] 보유중(추가진입): 속 비우고 보라 실선 굵은 테두리만 — 강한 마커보다 또렷
        ctx.lineJoin='round'; ctx.lineWidth=2.8; ctx.strokeStyle=CURRENT_C;
        ctx.shadowColor=CURRENT_C; ctx.shadowBlur=5; ctx.stroke(); ctx.shadowBlur=0;
      } else {
        ctx.fillStyle = CURRENT_C; ctx.fill();
        _markerStroke(ctx, CURRENT_C);
      }
      ctx.restore();
    }
    function _drawCurrentSellMarkerFull(){
      var lastIdx = data.length - 1;
      if(lastIdx < 0) return;
      var xx = pad.l + lastIdx*cw + cw/2, xy = yFn(data[lastIdx].high) - 1;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xx, xy + ms);
      ctx.lineTo(xx - ms*0.7, xy - ms*0.3);
      ctx.lineTo(xx + ms*0.7, xy - ms*0.3);
      ctx.closePath();
      if(_holdC){
        ctx.lineJoin='round'; ctx.lineWidth=2.8; ctx.strokeStyle=CURRENT_C;
        ctx.shadowColor=CURRENT_C; ctx.shadowBlur=5; ctx.stroke(); ctx.shadowBlur=0;
      } else {
        ctx.fillStyle = CURRENT_C; ctx.fill();
        _markerStroke(ctx, CURRENT_C);
      }
      ctx.restore();
    }

    if(lastTr && _gr === 'R'){
      // ── ① BT 마커 (녹/적, 날짜 라벨) — [S578] greenRed='B'일 때만 ──
      if(lastTr.type === 'OPEN' && lastTr.entryIdx != null){
        _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, false);
      } else if(lastTr.type !== 'OPEN' && lastTr.exitIdx != null && lastTr.entryIdx != null){
        _drawBuyMarker(lastTr.entryIdx, lastTr.entryDate, false);
        _drawSellMarker(lastTr.exitIdx, lastTr.exitDate, false);
      }
    }

    // ── ② 현재 판정 마커 (보라, 마지막 봉, 날짜 없음) ──
    //   [C3] svVerdict는 lastTr와 독립이므로 if(lastTr) 블록 밖에서 그림
    //   〔이력〕 이전: if(lastTr) 안에 있어 BT 거래 없는 종목엔 현재판정 마커가 안 그려짐 (수정됨)
    if(showBuy){
      _drawCurrentBuyMarkerFull();
    } else if(showSell){
      _drawCurrentSellMarkerFull();
    }
    // 범례 — [S578] BT 마커(녹/적)는 'B'에서만, 보라(현재 A/C)는 항상
    ctx.font='8px Outfit,sans-serif'; ctx.textAlign='right';
    if(_gr === 'R'){
      ctx.fillStyle=BUY_C; ctx.fillText('▲BT매수', W-pad.r-72, 10);
      ctx.fillStyle=SELL_C; ctx.fillText('▼BT매도', W-pad.r-38, 10);
    }
    ctx.fillStyle=CURRENT_C; ctx.fillText('● 현재', W-pad.r-2, 10);
  }

  if(_chartGreenRedMode() === 'S') _drawTrendMarkers(ctx, data, pad, cw, yFn, closes, W, 8, fullRows); // [S578] 추세마커는 녹/적='S'에서만 · [S1548] 큰 차트도 같은 처리(규칙17 거울상 — fullRows는 이미 9번째 인자로 들어와 있었다)
  drawMALegend(ctx, closes, pad, H, 9);

  // [S663] 예측 오버레이 — 마지막 봉 종가를 앵커로 우측에 H봉 경로. (캔들 우측 공간에만 그림 → 캔들/마커와 미겹침)
  if(pred){
    var _ancP = data[data.length-1].close, _bI = data.length - 1;
    var _xAt = function(t){ return pad.l + (_bI+t)*cw + cw/2; };
    var _yAt = function(p){ return yFn(_ancP*(1+p)); };
    ctx.save();
    // 경계(현재) 세로 점선
    ctx.strokeStyle='rgba(120,120,120,0.45)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(_xAt(0), pad.t); ctx.lineTo(_xAt(0), H-pad.b); ctx.stroke(); ctx.setLineDash([]);
    // 아날로그 fan (흐리게, 최종 부호별 색)
    pred.analogs.forEach(function(a){
      var fin=a.path[a.path.length-1];
      ctx.strokeStyle = fin>=0?'rgba(227,73,59,0.18)':'rgba(37,99,235,0.18)'; ctx.lineWidth=1; ctx.beginPath();
      for(var t=0;t<a.path.length;t++){ var x=_xAt(t), y=_yAt(a.path[t]); if(t===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.stroke();
    });
    // 중앙값 경로 (굵게)
    var _mf=pred.medPath[pred.medPath.length-1];
    ctx.strokeStyle = _mf>=0?'#e3493b':'#2563eb'; ctx.lineWidth=2; ctx.beginPath();
    for(var t2=0;t2<pred.medPath.length;t2++){ var x2=_xAt(t2), y2=_yAt(pred.medPath[t2]); if(t2===0)ctx.moveTo(x2,y2); else ctx.lineTo(x2,y2); }
    ctx.stroke();
    // 라벨 (중앙값 수익% + 상승확률)
    ctx.font='8px Outfit,sans-serif'; ctx.textAlign='left'; ctx.fillStyle=_mf>=0?'#e3493b':'#2563eb';
    var _ey=_yAt(pred.medPath[pred.h]); ctx.fillText((pred.median>=0?'+':'')+pred.median+'%', Math.min(_xAt(pred.h)+2, W-pad.r-1), _ey-2);
    ctx.textAlign='right'; ctx.fillStyle='#7c3aed';
    ctx.fillText('🔮 상승 '+pred.upProb+'% ('+pred.n+'개·'+pred.h+'봉)', W-pad.r-2, H-pad.b-2);
    ctx.restore();
  }
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
  // [C1] 헥스코드(#RRGGBB)를 rgba로 변환하여 음수값 반투명 처리
  //   〔이력〕 이전: .replace(')', ',.5)').replace('rgb','rgba') — 헥스에서는 매칭 안 돼 무효 (수정됨)
  function _hexToRgba(hex, alpha){
    var h = hex.replace('#','');
    if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    return 'rgba('+r+','+g+','+b+','+alpha+')';
  }
  for(var g = 0; g < nGroups; g++){
    var gx = pad.l + g * groupW;
    for(var si = 0; si < nBars; si++){
      var val = series[si].vals[g];
      if(val == null) continue;
      var bx = gx + gap * (si + 1) + barW * si;
      var barH = (Math.abs(val) / range) * chartH;
      var by = val >= 0 ? zeroY - barH : zeroY;
      ctx.fillStyle = val >= 0 ? series[si].color : _hexToRgba(series[si].color, 0.5);
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

  // [차트 균형] 막대 차트(drawFinBar)는 좌우 8/8 균등 padding이라 시각적 중앙
  //   라인 차트는 Y축 라벨용 좌측 36px 필요 → 우측도 24px로 늘려서 plot 영역의 시각 무게중심 맞춤
  //   (이전 r:12였을 때 plot이 우측으로 치우쳐 보임)
  var pad = {t:14, b:24, l:36, r:24};
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
// [S578→S1436] 녹/적 마커 그룹 선택 — 'R'(단일검증 오리지널 백테스트) | 'S'(단기매매 카드·활성 탭). 기본 S.
//   ⚠구 주석은 'B'(백테스트)라 적었는데 S988이 값을 'R'로 바꿨다 — 코드는 맞게 돌았고 주석만 낡아 있었다(S1328 계열).
function _chartGreenRedMode(){ try{ return (typeof localStorage!=='undefined' && localStorage.getItem('SX_CHART_GREENRED')==='R') ? 'R' : 'S'; }catch(_){ return 'S'; } } // [S988] 'R'=레시피·ATR(Season2 trades) / 'S'=단기추세 인라인
// [S562] 단기추세 MA 크로스 마커 — 매수(골든) ▲ / 매도(데드) ▼ + 날짜 라벨.
//   기간은 단기추세매매 카드 설정(SX_TREND_{market}) 따라감(기본 5×9). 화면 내 가장 최근 골든/데드 1개씩.
//   [S578] 색을 녹/적(BT와 동일)으로 통일 — B/S 교차선택이라 한 번에 하나만 떠서 충돌 없음(범례 텍스트로 구분).
//   sma()는 이 IIFE 내 배열반환 헬퍼. greenRed='S'일 때만 호출됨.
function _drawTrendMarkers(ctx, data, pad, cw, yFn, closes, W, legendFont, fullRows){
  if(!data || data.length < 4 || !closes || !closes.length) return;
  var ts=5, tl=9;
  try{
    var tm=(typeof window!=='undefined' && window._sxTrendCtx && window._sxTrendCtx.market) || 'kr';
    var raw=(typeof localStorage!=='undefined') ? localStorage.getItem('SX_TREND_'+tm) : null;
    if(raw){ var o=JSON.parse(raw); if(o){ if(+o.s>=1) ts=+o.s; if(+o.l>=2) tl=+o.l; } }
  }catch(e){}
  // [S1548] ★★MA 계산 창을 **화면 60봉이 아니라 전체 봉**으로 바꾼다 — 그리는 것만 화면 창이다.
  //   ⚠구판은 `closes`(=data.map)로 MA를 만들어 두 가지가 함께 깨져 있었다:
  //     ㉠게이트 `data.length < tl+1`이 **진입MA 긴 쪽이 60 이상이면 함수를 통째로 return** 시켰다.
  //       화면이 정확히 60봉이라 `l=60`이 경계다(59면 뜨고 60이면 안 뜬다). 사용자 설정이 20×60이었다.
  //     ㉡그리고 그 return 이 **TM 마커(실제 BT 진입·청산 날짜)까지 함께 막았다** — TM은 날짜 매칭이라
  //       MA를 한 번도 안 쓰는데 MA 봉수 부족으로 못 그려졌다. 마커가 통째로 사라진 실기기 증상의 원인이다.
  //     ㉢봉수가 충분할 때도 MA 웜업이 화면 창을 먹었다(`l=20`이면 앞 20봉이 비어 뒤 40봉에서만 크로스를 찾는다).
  //       무엇보다 **카드 BT가 쓰는 MA와 다른 창**이라 폴백 마커가 실제 진입봉과 어긋날 수 있었다(S1245 잔여 뿌리).
  //   ⇒ `fullRows`가 오면 전체 종가로 MA를 만들고 오프셋으로 화면 인덱스에 맞춘다. 안 오면 종전 그대로(후방호환).
  //   ★실측(재실행기 `offline/bat/recon_marker.js` · 실제 스냅 3시장): 기본 5×9는 거의 안 움직이고
  //     (US 0.0% · KR 0.5% · COIN 5.3%) **`있다→없음`은 전 조합에서 0**이다 — 보이던 마커가 사라지지 않는다.
  //     사용자 설정 20×60은 구판이 **100% 차단**이었고 273종에서 마커가 새로 생긴다.
  var _fr=(fullRows && fullRows.length>=data.length) ? fullRows : null;
  var _fc=_fr ? _fr.map(function(d){ return (d&&d.close!=null)?d.close:null; }) : closes;
  var _off=_fr ? (_fr.length - data.length) : 0;
  if(_fc.indexOf(null)>=0){ _fc=closes; _off=0; }   // 전체 봉에 결측이 있으면 지어내지 않고 종전 경로로
  // ★게이트를 **폴백 전용으로 좁힌다** — `ts>=tl`(크로스 미정의)·봉수 부족은 크로스 탐지만 막고,
  //   아래 TM 마커는 그대로 그린다. 구판은 이 한 줄이 둘 다 막았다.
  var _fbOk=!(ts>=tl || _fc.length < tl+1);
  var mF=_fbOk?sma(_fc, ts):[], mL=_fbOk?sma(_fc, tl):[];
  var TBUY='#22c55e', TSELL='#e8365a'; // [S578] 녹/적 (BT매수/매도와 동일) — B/S 교차선택
  var ms=Math.max(cw*1.0, 9);
  function _fmt(d){ if(!d) return ''; d=String(d); if(d.length===8&&d.indexOf('-')<0) return parseInt(d.slice(4,6),10)+'/'+parseInt(d.slice(6,8),10); var p=d.split(/[-T]/); if(p.length>=3) return parseInt(p[1],10)+'/'+parseInt(p[2],10); return d.slice(5,10); }
  var gIdx=-1, dIdx=-1;
  if(_fbOk) for(var i=data.length-1; i>=1; i--){   /* [S1548] 인덱스는 화면 창 · MA 조회는 전체 창(_off) */
    var _a=mF[_off+i], _b=mL[_off+i], _pa=mF[_off+i-1], _pb=mL[_off+i-1];
    if(_a==null||_b==null||_pa==null||_pb==null) continue;
    if(gIdx<0 && _pa<=_pb && _a>_b) gIdx=i;
    if(dIdx<0 && _pa>=_pb && _a<_b) dIdx=i;
    if(gIdx>=0 && dIdx>=0) break;
  }
  function _mk(idx, color, isBuy){
    if(idx<0 || idx>=data.length) return;
    var cx=pad.l + idx*cw + cw/2;
    var cy=isBuy ? yFn(data[idx].low)+1 : yFn(data[idx].high)-1;
    ctx.save();
    ctx.fillStyle=color;
    ctx.beginPath();
    if(isBuy){ ctx.moveTo(cx, cy-ms); ctx.lineTo(cx-ms*0.7, cy+ms*0.3); ctx.lineTo(cx+ms*0.7, cy+ms*0.3); }
    else { ctx.moveTo(cx, cy+ms); ctx.lineTo(cx-ms*0.7, cy-ms*0.3); ctx.lineTo(cx+ms*0.7, cy-ms*0.3); }
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=6; ctx.strokeStyle='#000'; ctx.lineWidth=1.5; ctx.stroke(); ctx.shadowBlur=0; ctx.restore();
    var txt=_fmt(data[idx].date);
    if(txt){
      ctx.font='bold 13px Outfit,sans-serif'; ctx.textAlign='center';
      var ty=isBuy ? cy+ms*0.3+22 : cy-ms*0.3-16;
      ctx.lineWidth=2; ctx.strokeStyle='#000'; ctx.lineJoin='round';
      ctx.strokeText(txt, cx, ty);
      ctx.fillStyle=color; ctx.fillText(txt, cx, ty);
    }
    ctx.restore();
  }
  // [S634] 차트 마커 동기화 — 분석탭 단기추세매매의 실제 진입/청산봉(예측 선행·조기청산·가드OFF 반영)을 날짜 기반으로 표시. 매칭 실패/마커없음 → 마지막 골든/데드 크로스 폴백.
  var PRED_C='#38bdf8'; // [S634] 예측 진입/청산 = 하늘색 (기존 C판정 보라 마커와 구분)
  var TM=(typeof window!=='undefined' && window._sxTrendCtx && window._sxTrendCtx.trendMarkers) || null;
  // [S1436] ★활성 탭 — 단기매매 카드는 S1398부터 2탭(📈 MA 크로스 / 🧪 전략 조합)이다.
  //   `cross`가 아니면 진입원이 레시피·칸이라 **MA 크로스 폴백은 엉뚱한 마커**다(전략 조합 탭인데 골든/데드가 뜬다).
  //   ⇒ 그 탭에서는 폴백을 쓰지 않는다. **잘못된 마커보다 없는 게 낫다**(S1378 '숫자를 지어내지 않는다' 계열).
  var _eng=(TM && TM.engine) || 'cross';
  var _isCross=(_eng==='cross');
  if(!_isCross){ gIdx=-1; dIdx=-1; }
  // [S1549] ★★**크로스 탭에서도 폴백을 쓰지 않는다** — 사용자 실기기 발견(*'MA 크로스 탭만 마커 날짜가 매매 이력과 다르다'*).
  //   기전: BT 마지막 거래 날짜가 **화면 창 밖**이면 `_ei<0`이라 `ei`가 `gIdx`(최근 MA 크로스)로 남았다.
  //   그 크로스는 **매매 이력에 없는 날짜**인데 범례는 `▲추세매수`라 실거래처럼 읽혔다.
  //   ⚠전략 조합 탭은 S1436이 폴백을 이미 막아 '마커 없음'이 되므로 어긋난 적이 없다 —
  //     **사용자가 크로스 탭에서만 본 이유가 그것**이고, 크로스 탭만 다른 규약을 쓸 이유가 없다.
  //   ★실측(재실행기 `offline/bat/recon_crossmk.js` · 실제 스냅 3시장 · 진입 20×60):
  //     화면 밖이라 폴백이 뜨던 비율이 진입 KR 21.3 / US 21.6 / **COIN 58.8%**, 청산 14.9 / 23.7 / **75.4%**다.
  //   ⚠S1245가 이 자리를 이미 알고 있었다 — 그때는 **날짜 포맷 불일치**를 원인으로 잡아 정규화로 고쳤다.
  //     남은 절반은 **창 밖**이고 정규화로는 안 풀린다. 여기서 닫는다.
  //   ⇒ TM이 있으면 폴백을 버린다. **잘못된 마커보다 없는 게 낫다**(S1436과 같은 문법).
  //   ⚠TM 자체가 없을 때(카드 미렌더)는 종전대로 폴백을 그린다 — 그때는 대조할 실거래가 애초에 없다.
  if(TM) { gIdx=-1; dIdx=-1; }
  var ei=gIdx, xi=dIdx, ePred=false, xPred=false;
  if(TM){
    // [S1245] 날짜 정규화 비교 — '2026-08-05'≡'20260805'. 엄격 문자열 비교는 소스별 포맷 차이로 조용히 실패
    //   →크로스 폴백이 실거래 마커인 양 표시(간헐 어긋남). 정규화로 실패 자체를 제거, 잔여 실패는 warn으로 관측.
    var _dN=function(d){ return String(d||'').replace(/[^0-9]/g,'').slice(0,8); };
    var _byDate=function(d){ if(!d) return -1; var nd=_dN(d); if(!nd) return -1; for(var z=data.length-1; z>=0; z--){ if(_dN(data[z].date)===nd) return z; } return -1; };
    var _ei=TM.entryDate?_byDate(TM.entryDate):-1, _xi=TM.exitDate?_byDate(TM.exitDate):-1;
    if(TM.entryDate && _ei<0) try{ console.warn('[S1245] 추세마커 진입날짜 매칭 실패 → 크로스 폴백:', TM.entryDate); }catch(_w){}
    if(TM.exitDate && _xi<0) try{ console.warn('[S1245] 추세마커 청산날짜 매칭 실패 → 크로스 폴백:', TM.exitDate); }catch(_w2){}
    if(_ei>=0){ ei=_ei; ePred=!!TM.entryPred; }
    if(_xi>=0){ xi=_xi; xPred=!!TM.exitPred; }
  }
  _mk(ei, ePred?PRED_C:TBUY, true);
  _mk(xi, xPred?PRED_C:TSELL, false);
  // 범례 (좌상단, 실제로 그린 것만) — 우상단 BT 범례와 충돌 안 함. 하늘색=예측 진입/청산(기존 보라 C판정과 구분).
  if(ei>=0 || xi>=0){
    ctx.save();
    ctx.font='bold '+(legendFont||8)+'px Outfit,sans-serif'; ctx.textAlign='left';
    var lx=pad.l+2;
    if(ei>=0){ ctx.fillStyle=ePred?PRED_C:TBUY; ctx.fillText(ePred?'\u25B2\uC608\uCE21\uC9C4\uC785':((TM&&TM.open)?'\u25B2\uBCF4\uC720\uC911 \uC9C4\uC785':(_isCross?'\u25B2\uCD94\uC138\uB9E4\uC218':'\u25B2\uC804\uB7B5\uC9C4\uC785')), lx, 10); lx+=ePred?50:((TM&&TM.open)?58:46); }   /* [S1549] 보유중이면 범례가 그렇게 말한다 — ▼가 없는 이유가 화면에서 읽힌다 */   /* [S1436] 전략 조합 탭이면 '▲전략진입' */
    if(xi>=0){ ctx.fillStyle=xPred?PRED_C:TSELL; ctx.fillText(xPred?'\u25BC\uC608\uCE21\uCCAD\uC0B0':(_isCross?'\u25BC\uCD94\uC138\uB9E4\uB3C4':'\u25BC\uC804\uB7B5\uCCAD\uC0B0'), lx, 10); }   /* [S1436] 거울상 — 진입만 바꾸고 청산을 두면 한 범례가 두 어휘를 쓴다(배터리 B6이 잡았다) */
    ctx.restore();
  }
}

function drawMiniWithTrades(canvasId, rows, trades, svVerdict){
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  if(!rows || !rows.length) return; // null/undefined/빈배열 방어
  // trades 없으면 기존 drawMini 동작
  if(!trades || !trades.length){ drawMini(canvasId, rows, svVerdict); return; } // [S358] 0거래 폴백도 보라마커 전달

  var rect=canvas.getBoundingClientRect(); var W=Math.round(rect.width)||360;
  var H = 180; // 마커+날짜 공간 확보
  var ctx = setupCanvas(canvas, W, H);

  var fullLen = rows.length;
  var dispCount = Math.min(60, fullLen);
  var data = rows.slice(-dispCount);
  if(data.length<5) return;
  var offset = fullLen - dispCount; // 화면에 보이는 첫 봉의 원래 인덱스

  // [S1245] 위치 진실원천=날짜 — trades.entryIdx는 '생성 당시 rows' 기준이라 차트 rows와 베이스가 다르면
  //   (Season2 캐시 vs 확장된 600봉 등) offset만큼 밀린다. 날짜로 차트 배열에서 재탐색을 우선하고,
  //   날짜 부재/미발견 시에만 idx−offset 폴백. 정규화 비교('2026-08-05'≡'20260805').
  var _dN=function(d){ return String(d||'').replace(/[^0-9]/g,'').slice(0,8); };
  var _locOf=function(idxGlobal, dateStr){
    var nd=_dN(dateStr);
    if(nd){ for(var z=data.length-1; z>=0; z--){ if(_dN(data[z].date)===nd) return z; } }
    return (idxGlobal!=null) ? (idxGlobal - offset) : -1;
  };

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
    var oStart = _locOf(openTrade.entryIdx, openTrade.entryDate);   // [S1245] 날짜 우선 재탐색(베이스 불일치 방어)
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

  // S99/S128: BT 거래 마커 — 마지막 거래의 매수(▲)/매도(▼)를 차트 위에 표시
  //   화면 범위(최근 60봉) 밖이면 해당 마커는 자동 생략 (각 함수 내부 가드)
  //   〔미사용 인프라〕 isPair 인자: 현재 호출부 모두 false. 원래 의도는 _drawFullCandle 동일 참조
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
  // 미니차트용 마커 헬퍼 (BT 진입/청산용)
  //   isPair: true면 흐리게(globalAlpha=0.55) — 현재 미사용. "과거 짝 마커" 표시 인프라용
  function _drawBuyMini(idxGlobal, dateStr, isPair){
    var eL = _locOf(idxGlobal, dateStr);   // [S1245] 날짜 우선 — idx−offset은 폴백
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
    var xL = _locOf(idxGlobal, dateStr);   // [S1245] 날짜 우선 — idx−offset은 폴백
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

  // POLICY C: 현재 판정 마커 (보라색, 날짜 라벨 없음)
  //   BT 거래 마커(녹/적 + 날짜)와 색상으로 구분. 마지막 봉 위치에 항상 그려짐.
  //   의도: BT 이력은 그대로 두고, 배너의 현재 판정도 차트에 함께 표시
  var CURRENT_CLR = '#a855f7'; // 보라색 (Tailwind purple-500)
  var _holdMini = false; // [S579] 보라 마커 항상 솔리드 채움 (A 마커와 동일) — S361 보유중 속빈 렌더 비활성
  function _drawCurrentBuyMini(){
    var lastIdx = data.length - 1;
    if(lastIdx < 0) return;
    var ex = pad.l + lastIdx*cw + cw/2, ey = yFn(data[lastIdx].low) + 1;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex, ey - markerSize);
    ctx.lineTo(ex - markerSize*0.7, ey + markerSize*0.3);
    ctx.lineTo(ex + markerSize*0.7, ey + markerSize*0.3);
    ctx.closePath();
    if(_holdMini){
      ctx.lineJoin='round'; ctx.lineWidth=2.4; ctx.strokeStyle=CURRENT_CLR;
      ctx.shadowColor=CURRENT_CLR; ctx.shadowBlur=4; ctx.stroke(); ctx.shadowBlur=0;
    } else {
      ctx.fillStyle = CURRENT_CLR; ctx.fill();
      _markerStrokeMini(ctx, CURRENT_CLR);
    }
    ctx.restore();
  }
  function _drawCurrentSellMini(){
    var lastIdx = data.length - 1;
    if(lastIdx < 0) return;
    var xx = pad.l + lastIdx*cw + cw/2, xy = yFn(data[lastIdx].high) - 1;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xx, xy + markerSize);
    ctx.lineTo(xx - markerSize*0.7, xy - markerSize*0.3);
    ctx.lineTo(xx + markerSize*0.7, xy - markerSize*0.3);
    ctx.closePath();
    if(_holdMini){
      ctx.lineJoin='round'; ctx.lineWidth=2.4; ctx.strokeStyle=CURRENT_CLR;
      ctx.shadowColor=CURRENT_CLR; ctx.shadowBlur=4; ctx.stroke(); ctx.shadowBlur=0;
    } else {
      ctx.fillStyle = CURRENT_CLR; ctx.fill();
      _markerStrokeMini(ctx, CURRENT_CLR);
    }
    ctx.restore();
  }

  var lastTr = trades[trades.length - 1];
  var _gr = _chartGreenRedMode(); // [S578→S1436] 'R'=백테스트 마커 / 'S'=추세마커
  var showBuyMarker = svVerdict && svVerdict.chartMarker === 'buy';
  var showSellMarker = svVerdict && svVerdict.chartMarker === 'sell';

  // POLICY C (하이브리드): 두 종류 마커를 함께 표시
  //   ① BT 마커 (기존 색상 + 날짜) — 마지막 BT 거래의 entry/exit
  //   ② 현재 판정 마커 (보라색 + 날짜 없음) — svVerdict의 매수/매도를 마지막 봉에 추가
  //   장점: BT 이력 + 현재 신호 둘 다 보임. 색상으로 구분 → 시각 혼란 방지
  if(lastTr){
    // ── ① BT 마커 (기존 녹/적, 날짜 라벨 포함) — [S578] greenRed='B'일 때만 ──
    //   lastTr가 OPEN(보유중): ▲ entry만
    //   lastTr가 WIN/LOSS(청산됨): ▲ entry + ▼ exit 쌍
    if(_gr === 'R'){
      if(lastTr.type === 'OPEN' && lastTr.entryIdx != null){
        _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, false);
      } else if(lastTr.type !== 'OPEN' && lastTr.exitIdx != null && lastTr.entryIdx != null){
        _drawBuyMini(lastTr.entryIdx, lastTr.entryDate, false);
        _drawSellMini(lastTr.exitIdx, lastTr.exitDate, false);
      }
    }

    // ── ② 현재 판정 마커 (보라색, 마지막 봉, 날짜 없음) — A/C 무관 항상 ──
    //   통합판정의 chartMarker에 따라 ▲ 또는 ▼ 표시
    if(showBuyMarker){
      _drawCurrentBuyMini();
    } else if(showSellMarker){
      _drawCurrentSellMini();
    }
  }

  if(_gr === 'S') _drawTrendMarkers(ctx, data, pad, cw, yFn, closes, W, 7, rows); // [S578] 추세마커는 녹/적='S'에서만 · [S1548] 전체 봉 전달
  drawMALegend(ctx, closes, pad, H, 8);
  // 마커 범례 — [S578] BT 마커(녹/적)는 'B'에서만, 보라(현재 A/C)는 항상
  ctx.font = '7px Outfit,sans-serif';
  ctx.textAlign = 'right';
  if(_gr === 'R'){
    ctx.fillStyle = BUY_CLR; ctx.fillText('▲BT매수', W-pad.r-72, 10);
    ctx.fillStyle = SELL_CLR; ctx.fillText('▼BT매도', W-pad.r-38, 10);
  }
  ctx.fillStyle = CURRENT_CLR; ctx.fillText('● 현재', W-pad.r-2, 10);
}

// S97→S99: 매매이력 탭 → 미니차트 봉 하이라이트
var _hlTimeout = null;
function highlightBar(canvasId, barIdx, rows, trades, svVerdict){
  var canvas = document.getElementById(canvasId);
  if(!canvas || !rows || !rows.length) return;
  // H를 동적으로 결정 — drawMini=160, drawMiniWithTrades=180 (캔버스 높이 일치 필수)
  //   〔이력〕 이전: 180으로 하드코딩 → trades 없을 때 차트 영역(160) 밖에 하이라이트 그려지는 버그 (수정됨)
  var hasTrades = trades && trades.length > 0;
  var H = hasTrades ? 180 : 160;
  // 다시 그리기 (기존 마커 포함)
  if(hasTrades) drawMiniWithTrades(canvasId, rows, trades, svVerdict);
  else drawMini(canvasId, rows, svVerdict); // [S358]
  var ctx = canvas.getContext('2d');
  var rect = canvas.getBoundingClientRect();
  var W = Math.round(rect.width) || 360;
  var dispCount = Math.min(60, rows.length);
  var offset = rows.length - dispCount;
  var localIdx = barIdx - offset;
  if(localIdx < 0 || localIdx >= dispCount) return;
  // [C2] pad.t 동적 처리 — drawMini는 6, drawMiniWithTrades는 14 (각 함수 정의와 일치)
  //   〔이력〕 이전: pad.t:14 하드코딩 → drawMini 사용 시 실제 차트 상단(y=6)과 어긋남 (수정됨)
  var pad = {t: hasTrades ? 14 : 6, b: 18, l:8, r:42};
  var cw = (W - pad.l - pad.r) / dispCount;
  var x = pad.l + localIdx * cw;
  // 흰 배경에 노란색 반투명 하이라이트 — 가시성 확보
  //   〔이력〕 이전: rgba(255,255,255,0.15) 흰색 반투명 → 흰 배경에서 보이지 않음 (수정됨)
  ctx.save();
  ctx.fillStyle = 'rgba(255,153,0,0.18)';
  ctx.fillRect(x, pad.t, cw, H - pad.t - pad.b);
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  var cx = x + cw / 2;
  ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, H - pad.b); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // 3초 후 하이라이트 제거
  clearTimeout(_hlTimeout);
  _hlTimeout = setTimeout(function(){
    if(hasTrades) drawMiniWithTrades(canvasId, rows, trades, svVerdict);
    else drawMini(canvasId, rows, svVerdict); // [S358]
  }, 3000);
}

return { drawMini: drawMini, drawMiniWithTrades: drawMiniWithTrades, openFull: openFull, closeFull: closeFull, drawFinBar: drawFinBar, drawFinTrend: drawFinTrend, drawScoreSpark: drawScoreSpark, drawDeltaBar: drawDeltaBar, drawScoreGauge: drawScoreGauge, highlightBar: highlightBar };
})();
