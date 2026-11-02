// sx_tvind_mpl.js — [S1866] 풀차트 TradingView 지표 · MPL 2.0 소스(https://mozilla.org/MPL/2.0/)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   이 파일은 아래 원본을 JS 로 옮긴 것이고 Mozilla Public License 2.0 을 따른다(이 파일의 고친 부분도 MPL 2.0).
//     ① Supertrend ANY INDICATOR (RSI, MFI, CCI, etc.) + Range Filter — © wbburgin · MPL 2.0 · 원본 = offline/tvchart/"Supertrend ANY INDICATOR.txt"(파인 v5)
//        + 라이브러리 wbburgin/wbburgin_utils/1 의 smoothrng · rngfilt · atr_anysource · supertrend_anysource — © wbburgin · MPL 2.0 · 원본 = offline/tvchart/wbburgin_utils.txt(2판 소스 · 이 넷은 1판과 같음)
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만). 앱이 더한 설정은 이름에 '앱' 을 단다.
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin, nz0 = x => fin(x) ? x : 0;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na
function cols(rows) { const n = rows.length, H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); V[i] = num(r.volume); } return { n, H, L, C, V }; }
function sumN(src, m) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t < m - 1) { o[t] = NaN; continue; } let s = 0, ok = true; for (let j = t - m + 1; j <= t; j++) { if (!fin(src[j])) { ok = false; break; } s += src[j]; } o[t] = ok ? s : NaN; } return o; }
const max3 = (a, b, c) => (fin(a) && fin(b) && fin(c)) ? Math.max(a, b, c) : NaN;   // 파인 math.max — na 가 끼면 na

// ── wbburgin_utils(라이브러리 함수 넷) ──
// smoothrng(source, sampling_period, range_mult): wper = sp × 2 − 1 · avrng = ta.ema(abs(source − source[1]), sp) · smoothrng = ta.ema(avrng, wper) × range_mult
function smoothrng(x, sp, rm) { const N = x.length, d = new Float64Array(N); for (let t = 0; t < N; t++) d[t] = t > 0 ? Math.abs(x[t] - x[t - 1]) : NaN; const a = T.ema(d, sp), b = T.ema(a, sp * 2 - 1), o = new Float64Array(N); for (let t = 0; t < N; t++) o[t] = b[t] * rm; return o; }
// rngfilt(source, smoothrng): r := source > nz(r[1]) ? ((source − smrng) < nz(r[1]) ? nz(r[1]) : (source − smrng)) : ((source + smrng) > nz(r[1]) ? nz(r[1]) : (source + smrng))
function rngfilt(x, sr) { const N = x.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const p = nz0(t > 0 ? o[t - 1] : NaN);
    o[t] = x[t] > p ? (((x[t] - sr[t]) < p) ? p : (x[t] - sr[t])) : (((x[t] + sr[t]) > p) ? p : (x[t] + sr[t])); } return o; }
// atr_anysource(source, atr_length): highest · lowest(source) · trueRange = na(highest[1]) ? highest − lowest : max(highest − lowest, abs(highest − source[1]), abs(lowest − source[1])) · ta.rma(trueRange, atr_length)
function atrAny(x, m) { const N = x.length, hi = T.highest(x, m), lo = T.lowest(x, m), tr = new Float64Array(N);
  for (let t = 0; t < N; t++) { const h1 = t > 0 ? hi[t - 1] : NaN; tr[t] = !fin(h1) ? (hi[t] - lo[t]) : max3(hi[t] - lo[t], Math.abs(hi[t] - x[t - 1]), Math.abs(lo[t] - x[t - 1])); }
  return T.rma(tr, m); }
// supertrend_anysource(source, factor, atr_length) — 밴드 · 방향(−1 = 위 · 1 = 아래 · 원본 표기) · superTrend
function stAny(x, factor, m) { const N = x.length, A = atrAny(x, m), UB = new Float64Array(N), LB = new Float64Array(N), D = new Int8Array(N), S = new Float64Array(N);
  for (let t = 0; t < N; t++) { const ub = x[t] + factor * A[t], lb = x[t] - factor * A[t], pL = nz0(t > 0 ? LB[t - 1] : NaN), pU = nz0(t > 0 ? UB[t - 1] : NaN), x1 = t > 0 ? x[t - 1] : NaN;
    LB[t] = (lb > pL || x1 < pL) ? lb : pL; UB[t] = (ub < pU || x1 > pU) ? ub : pU;
    let d; if (!fin(t > 0 ? A[t - 1] : NaN)) d = 1; else if ((t > 0 ? S[t - 1] : NaN) === pU) d = (x[t] > UB[t]) ? -1 : 1; else d = (x[t] < LB[t]) ? 1 : -1;
    D[t] = d; S[t] = (d === -1) ? LB[t] : UB[t]; }
  return { st: S, dir: D, ub: UB, lb: LB }; }

// ── 고를 수 있는 지표 일곱(파인 v5 내장 · close 기준) ──
function srcOf(sel, n, H, L, C, V, len) { const o = new Float64Array(n);
  if (sel === 'RSI') return T.rsi(C, len);
  if (sel === 'MFI') { const up = new Float64Array(n), dn = new Float64Array(n);   // pine_mfi(close, len): 바뀜 ≤ 0 이면 0 아니면 값(첫 봉 바뀜 = na → 비교 거짓 → 값)
    for (let t = 0; t < n; t++) { const ch = t > 0 ? C[t] - C[t - 1] : NaN; up[t] = V[t] * ((ch <= 0) ? 0 : C[t]); dn[t] = V[t] * ((ch >= 0) ? 0 : C[t]); }
    const U = sumN(up, len), Dn = sumN(dn, len); for (let t = 0; t < n; t++) o[t] = 100.0 - (100.0 / (1.0 + U[t] / Dn[t])); return o; }
  if (sel === 'Accum/Dist') { let s = 0; for (let t = 0; t < n; t++) { const hl = H[t] - L[t], k = ((C[t] === H[t] && C[t] === L[t]) || hl === 0) ? 0 : ((2 * C[t] - L[t] - H[t]) / hl) * V[t]; s += nz0(k); o[t] = s; } return o; }   // ta.accdist = cum(…) · 숫자 아닌 항은 0
  if (sel === 'Momentum') { for (let t = 0; t < n; t++) o[t] = t >= len ? C[t] - C[t - len] : NaN; return o; }
  if (sel === 'OB Volume') { let s = 0; for (let t = 0; t < n; t++) { const k = t > 0 ? Math.sign(C[t] - C[t - 1]) * V[t] : NaN; s += nz0(k); o[t] = s; } return o; }   // ta.obv = cum(sign(change(close)) × volume)
  if (sel === 'CCI') return T.cci(C, len);
  if (sel === 'Stochastic') { const hh = T.highest(H, len), ll = T.lowest(L, len); for (let t = 0; t < n; t++) { const d = hh[t] - ll[t]; o[t] = (fin(C[t]) && fin(hh[t]) && fin(ll[t]) && d !== 0) ? 100 * (C[t] - ll[t]) / d : NaN; } return o; }
  o.fill(NaN); return o; }
// ── ① Supertrend ANY INDICATOR ──
function staCalc(rows, p) { const { n, H, L, C, V } = cols(rows); let ind = srcOf(p.sel, n, H, L, C, V, p.indicator_length);
  if (p.use_range) ind = rngfilt(ind, smoothrng(ind, p.sampling_period, p.range_mult));
  const S = stAny(ind, p.atr_mult, p.atr_length), up = new Uint8Array(n), dn = new Uint8Array(n);
  for (let t = 1; t < n; t++) { if (S.dir[t] === -1 && S.dir[t - 1] === 1) up[t] = 1; if (S.dir[t] === 1 && S.dir[t - 1] === -1) dn[t] = 1; }
  return { ind, st: S.st, dir: S.dir, up, dn, bound: !(p.sel === 'Accum/Dist' || p.sel === 'OB Volume') }; }
const STA_SEL = ['RSI', 'MFI', 'Accum/Dist', 'Momentum', 'OB Volume', 'CCI', 'Stochastic'];
TV.reg({
  id: 'sta', place: 'pane', name: 'Supertrend ANY INDICATOR (RSI, MFI, CCI, etc.) + Range Filter', short: 'ST ANY INDICATOR', kname: '슈퍼트렌드 ANY',
  author: 'wbburgin', license: 'MPL 2.0', srcFile: 'Supertrend ANY INDICATOR.txt',
  inputs: [
    { k: 'sel', nm: '슈퍼트렌드를 씌울 지표', o: 'Indicator for Supertrend', t: 'sel', d: 'RSI', opts: STA_SEL, optNm: { 'Accum/Dist': 'Accum/Dist(A/D)', 'OB Volume': 'OB Volume(OBV)' } },
    { k: 'indicator_length', nm: '지표 길이', o: 'Indicator Length (if applicable)', t: 'int', d: 14, min: 1, max: 200 },
    { k: 'atr_length', nm: '슈퍼트렌드 ATR 길이', o: 'Supertrend ATR Length', t: 'int', d: 10, min: 1, max: 200 },
    { k: 'atr_mult', nm: '슈퍼트렌드 ATR 배수', o: 'Supertrend ATR Mult', t: 'float', d: 3.0, min: 0.5, max: 20, step: 0.5 },
    { k: 'use_range', nm: '지표에 레인지 필터', o: 'Use Range Filter of Indicator', t: 'bool', d: false },
    { k: 'sampling_period', nm: '레인지 필터 기간', o: 'Range Filter Sampling Period (if applicable)', t: 'int', d: 50, min: 1, max: 300 },
    { k: 'range_mult', nm: '레인지 필터 배수', o: 'Range Filter Multiple (if applicable)', t: 'float', d: 3, min: 0.1, max: 20, step: 0.1 },
    { k: 'labels', nm: '신호 글자', o: 'Show Labels', t: 'bool', d: true },
    { k: 'highlighting', nm: '채움', o: 'Display Highlighting', t: 'bool', d: true },
    { k: 'oversold', nm: '과매도 줄', o: 'Oversold Level (if applicable)', t: 'int', d: 30, min: -1000, max: 1000 },
    { k: 'overbought', nm: '과매수 줄', o: 'Overbought Level (if applicable)', t: 'int', d: 70, min: -1000, max: 1000 }
  ],
  legend: p => 'ST ANY ' + p.sel + ' ' + p.indicator_length + ' · ' + p.atr_length + ' × ' + p.atr_mult + (p.use_range ? ' · 레인지' : ''),
  calc: staCalc,
  drawPane(ctx, R, G, p) {
    let lo = Infinity, hi = -Infinity; for (let i = G.s; i < G.e; i++) for (const v of [R.ind[i], R.st[i]]) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (R.bound) { lo = Math.min(lo, p.oversold); hi = Math.max(hi, p.overbought); } if (!(hi > lo)) { lo = 0; hi = 1; } const pd = (hi - lo) * 0.06; lo -= pd; hi += pd;
    const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + (hi - v) / (hi - lo) * ch, L0 = G.pad.l, R0 = G.W - G.pad.r;
    if (R.bound) { if (p.highlighting) { ctx.fillStyle = 'rgba(156,39,176,.05)'; ctx.fillRect(L0, y(p.overbought), R0 - L0, y(p.oversold) - y(p.overbought)); }
      ctx.save(); ctx.fillStyle = 'rgba(100,100,100,.35)'; for (const lv of [p.oversold, p.overbought]) for (let i = G.s; i < G.e; i += 2) { ctx.beginPath(); ctx.arc(G.x(i), y(lv), 1, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    for (let i = Math.max(G.s + 1, 1); i < G.e; i++) { const d = R.dir[i]; if (R.dir[i - 1] !== d) continue; const a = R.st[i - 1], b = R.st[i], c = R.ind[i], e = R.ind[i - 1]; if (!fin(a) || !fin(b) || !fin(c) || !fin(e)) continue;
      if (p.highlighting) { ctx.fillStyle = d === -1 ? 'rgba(76,175,80,.12)' : 'rgba(255,82,82,.12)'; ctx.beginPath(); ctx.moveTo(G.x(i - 1), y(a)); ctx.lineTo(G.x(i), y(b)); ctx.lineTo(G.x(i), y(c)); ctx.lineTo(G.x(i - 1), y(e)); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = d === -1 ? '#16a34a' : '#dc2626'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(G.x(i - 1), y(a)); ctx.lineTo(G.x(i), y(b)); ctx.stroke(); }
    ctx.save(); ctx.strokeStyle = '#374151'; ctx.lineWidth = 1; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = R.ind[i]; if (!fin(v)) { on = false; continue; } if (!on) { ctx.moveTo(G.x(i), y(v)); on = true; } else ctx.lineTo(G.x(i), y(v)); } ctx.stroke(); ctx.restore();
    for (let i = G.s; i < G.e; i++) { const v = R.st[i]; if (!fin(v) || !(R.up[i] || R.dn[i])) continue; const isUp = !!R.up[i], col = isUp ? '#16a34a' : '#dc2626', x = G.x(i), yy = y(v);
      ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, yy, 2.5, 0, Math.PI * 2); ctx.fill();
      if (p.labels) { ctx.font = 'bold 8px Outfit,sans-serif'; const txt = isUp ? 'STA▲' : 'STA▼', w = ctx.measureText(txt).width + 6, by = isUp ? yy + 4 : yy - 15; ctx.fillRect(x - w / 2, by, w, 11); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, by + 5.5); }
      ctx.restore(); }
    G.axisText(ctx, hi.toFixed(1), lo.toFixed(1));
    const li = G.e - 1; if (fin(R.ind[li])) { ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = R.dir[li] === -1 ? '#16a34a' : '#dc2626'; ctx.fillText(p.sel + ' ' + R.ind[li].toFixed(2) + ' · 슈퍼트렌드 ' + (R.dir[li] === -1 ? '위' : '아래'), G.pad.l + 4, G.pad.t + 9); }
  }
});
if (typeof module !== 'undefined' && module.exports) module.exports = { staCalc, stAny, atrAny, rngfilt, smoothrng, srcOf };
})();
