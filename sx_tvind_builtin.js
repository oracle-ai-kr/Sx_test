// sx_tvind_builtin.js — [S1865] 풀차트 · 🧩 보조 재료 공용 계산 · TradingView 내장 지표 식(라이선스 없음 · TV 기본 지표 'Stoch RSI' · 'Choppiness Index' 의 공개 식)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   ① Stochastic RSI(TV 내장) — rsi1 = ta.rsi(close, RSI 길이) · k = ta.sma(ta.stoch(rsi1, rsi1, rsi1, 스토캐스틱 길이), K) · d = ta.sma(k, D) · 기본 K 3 · D 3 · RSI 14 · 스토캐스틱 14 · 줄 80 · 50 · 20
//   ② Choppiness Index(TV 내장 · E. W. Dreiss) — ci = 100 × log10(math.sum(ta.atr(1), 길이) / (ta.highest(길이) − ta.lowest(길이))) / log10(길이) · 기본 14 · 줄 61.8 · 38.2
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만). 🧩 보조 재료(sx_render.js)도 이 함수를 부른다(계산 한 번).
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na
const fmt = v => !fin(v) ? '' : v.toFixed(1);
function cols(rows) { const n = rows.length, H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); } return { n, H, L, C }; }
// 파인 ta.stoch(src, high, low, len) = 100 × (src − lowest(low, len)) / (highest(high, len) − lowest(low, len)) · 분모 0 이거나 숫자가 아니면 na
function stoch(src, hi, lo, m) { const hh = T.highest(hi, m), ll = T.lowest(lo, m), o = new Float64Array(src.length);
  for (let t = 0; t < src.length; t++) { const d = hh[t] - ll[t]; o[t] = (fin(src[t]) && fin(hh[t]) && fin(ll[t]) && d !== 0) ? 100 * (src[t] - ll[t]) / d : NaN; } return o; }
// 파인 math.sum(src, len) — 창 안에 na 가 하나라도 있으면 na
function sumN(src, m) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t < m - 1) { o[t] = NaN; continue; } let s = 0, ok = true; for (let j = t - m + 1; j <= t; j++) { if (!fin(src[j])) { ok = false; break; } s += src[j]; } o[t] = ok ? s : NaN; } return o; }

// ── ① Stochastic RSI ──
function srsiCalc(rows, p) { const { C } = cols(rows), r = T.rsi(C, p.lengthRSI), k = T.sma(stoch(r, r, r, p.lengthStoch), p.smoothK), d = T.sma(k, p.smoothD); return { k, d }; }
function hband(ctx, G, y, v, col) { ctx.save(); ctx.strokeStyle = col || 'rgba(120,120,120,.45)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(G.pad.l, y(v)); ctx.lineTo(G.W - G.pad.r, y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
function line(ctx, G, y, a, col) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = a[i]; if (!fin(v)) { on = false; continue; } const x = G.x(i), yy = y(v); if (!on) { ctx.moveTo(x, yy); on = true; } else ctx.lineTo(x, yy); } ctx.stroke(); ctx.restore(); }
TV.reg({
  id: 'srsi', place: 'pane', name: 'Stochastic RSI', short: 'Stoch RSI', kname: '스토캐스틱 RSI',
  author: 'TradingView 내장 지표', license: '라이선스 없음(내장 식)', srcFile: '—',
  inputs: [
    { k: 'smoothK', nm: 'K', o: 'K', t: 'int', d: 3, min: 1, max: 50 },
    { k: 'smoothD', nm: 'D', o: 'D', t: 'int', d: 3, min: 1, max: 50 },
    { k: 'lengthRSI', nm: 'RSI 길이', o: 'RSI Length', t: 'int', d: 14, min: 1, max: 200 },
    { k: 'lengthStoch', nm: '스토캐스틱 길이', o: 'Stochastic Length', t: 'int', d: 14, min: 1, max: 200 }
  ],
  legend: p => 'Stoch RSI ' + [p.smoothK, p.smoothD, p.lengthRSI, p.lengthStoch].join(' '),
  calc: srsiCalc,
  drawPane(ctx, R, G) { const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + (100 - v) / 100 * ch;
    [80, 50, 20].forEach(v => hband(ctx, G, y, v)); line(ctx, G, y, R.k, '#2962ff'); line(ctx, G, y, R.d, '#ff6d00'); G.axisText(ctx, '100', '0');
    const li = G.e - 1; ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#2962ff'; ctx.fillText('K ' + fmt(R.k[li]), G.pad.l + 4, G.pad.t + 9); ctx.fillStyle = '#ff6d00'; ctx.fillText('D ' + fmt(R.d[li]), G.pad.l + 52, G.pad.t + 9); }
});

// ── ② Choppiness Index ──
function chopCalc(rows, p) { const { n, H, L, C } = cols(rows), m = p.length, a1 = T.atr(H, L, C, 1), s = sumN(a1, m), hh = T.highest(H, m), ll = T.lowest(L, m), ci = new Float64Array(n), lg = Math.log10(m);
  for (let t = 0; t < n; t++) { const d = hh[t] - ll[t], q = s[t] / d; ci[t] = (fin(s[t]) && fin(hh[t]) && fin(ll[t]) && d > 0 && q > 0 && lg > 0) ? 100 * Math.log10(q) / lg : NaN; } return { ci }; }
TV.reg({
  id: 'chop', place: 'pane', name: 'Choppiness Index', short: 'CHOP', kname: '초피니스 인덱스',
  author: 'TradingView 내장 지표(E. W. Dreiss)', license: '라이선스 없음(내장 식)', srcFile: '—',
  inputs: [{ k: 'length', nm: '길이', o: 'Length', t: 'int', d: 14, min: 2, max: 200 }],
  legend: p => 'CHOP ' + p.length,
  calc: chopCalc,
  drawPane(ctx, R, G) { let lo = 30, hi = 70; for (let i = G.s; i < G.e; i++) { const v = R.ci[i]; if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + (hi - v) / (hi - lo) * ch;
    hband(ctx, G, y, 61.8, 'rgba(220,38,38,.55)'); hband(ctx, G, y, 38.2, 'rgba(22,163,74,.55)'); line(ctx, G, y, R.ci, '#2962ff'); G.axisText(ctx, hi.toFixed(0), lo.toFixed(0));
    const li = G.e - 1; ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#2962ff'; ctx.fillText(fmt(R.ci[li]) + ' · 61.8 위 횡보 · 38.2 아래 추세', G.pad.l + 4, G.pad.t + 9); }
});
if (typeof module !== 'undefined' && module.exports) module.exports = { srsiCalc, chopCalc, stoch, sumN };
})();
