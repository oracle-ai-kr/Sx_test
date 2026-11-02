// sx_tvind_mpl.js — [S1866] 풀차트 TradingView 지표 · MPL 2.0 소스(https://mozilla.org/MPL/2.0/)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   이 파일은 아래 원본을 JS 로 옮긴 것이고 Mozilla Public License 2.0 을 따른다(이 파일의 고친 부분도 MPL 2.0).
//     ① Supertrend ANY INDICATOR (RSI, MFI, CCI, etc.) + Range Filter — © wbburgin · MPL 2.0 · 원본 = offline/tvchart/"Supertrend ANY INDICATOR.txt"(파인 v5)
//        + 라이브러리 wbburgin/wbburgin_utils/1 의 smoothrng · rngfilt · atr_anysource · supertrend_anysource — © wbburgin · MPL 2.0 · 원본 = offline/tvchart/wbburgin_utils.txt(2판 소스 · 이 넷은 1판과 같음)
//     ② [S1870] 🎯 ICT 오더블록 — 앱 자체 정의(🎯 ICT 탭 BT 오더블록 셋업과 같은 식 · 원본 파인 없음) · 이 파일에 두어 MPL 2.0 · Power % 진하기 = ④ 식
//     ③ [S1870] Market Structure Break & Order Block — © EmreKb · MPL 2.0 · 원본 = offline/tvchart/"Market Structure Break & Order Block.txt"(파인 v5)
//     ④ [S1870] Power Order Blocks [ChartPrime] — © ChartPrime · MPL 2.0 · 원본 = offline/tvchart/"Power Order Blocks (ChartPrime).txt"(파인 v6)
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
// ════════ [S1870] 풀차트 2단계 — 오더블록 셋(🎯 ICT 정의 · MSB-OB · Power OB) · PREREG_S1870_tvob.md §1 ════════
//   셋 다 그 봉까지 자료만 쓴다(앞날 참조 없음) · 표시만 · 따로 세지 않음 · 그림은 마지막 N봉만 보임(계산은 전체 봉)
const cols4 = rows => { const n = rows.length, O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; O[i] = num(r.open); H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); } return { n, O, H, L, C }; };
// ta.highest/lowest — 창에서 na 를 건너뜀 · 창이 다 na 면 na · t < m − 1 이면 na
function hiN(src, m) { const N = src.length, o = new Float64Array(N).fill(NaN); for (let t = m - 1; t < N; t++) { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = src[j]; if (fin(v) && (!fin(x) || v > x)) x = v; } o[t] = x; } return o; }
function loN(src, m) { const N = src.length, o = new Float64Array(N).fill(NaN); for (let t = m - 1; t < N; t++) { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = src[j]; if (fin(v) && (!fin(x) || v < x)) x = v; } o[t] = x; } return o; }
const gt = (a, b) => fin(a) && fin(b) && a > b, lt = (a, b) => fin(a) && fin(b) && a < b, ge = (a, b) => fin(a) && fin(b) && a >= b, le = (a, b) => fin(a) && fin(b) && a <= b;   // na 비교 = 거짓
const OB_FZ = { tiny: 8, small: 9, normal: 11, large: 13, huge: 16 };
const rgba = (h, a) => 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
const powTr = pc => Math.round(92 - ((fin(pc) ? pc : 0) / 100) * 32);   // ④ 원본 calcPowerTransp — Power 100% → 투명 60 · 0% → 92
// 글자(흰 테두리) · 오른쪽 끝(그림 칸 끝)에 붙은 글자는 겹치지 않게 위아래로 비킴(S1868 과 같은 앱 차이) · 그 가운데 캔들 칸 밖(위 · 아래)인 것은 안 씀(비키다 칸 밖으로 밀리지 않게)
function obTexts(ctx, list, RE, H) { const isE = t => t.al === 'right' && t.x >= RE - 3; list = list.filter(t => !isE(t) || (t.y >= 0 && t.y <= H)); const edge = list.filter(isE).sort((a, b) => a.y - b.y); let last = -Infinity;
  edge.forEach(t => { if (t.y < last + t.fz + 1) t.y = last + t.fz + 1; last = t.y; });
  list.forEach(t => { ctx.font = '600 ' + t.fz + 'px Outfit,sans-serif'; ctx.textAlign = t.al; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(t.s, t.x, t.y); ctx.fillStyle = t.c; ctx.fillText(t.s, t.x, t.y); }); }

// ── ② 🎯 ICT 오더블록(앱 정의 = 🎯 ICT 탭 BT 오더블록 셋업과 같은 식) ──
//   스윙 고점(3 · 3 — 왼쪽 > · 오른쪽 ≥ · 확정 = 3봉 뒤 · 그다음 봉부터 앎) · 종가가 마지막 확정 스윙 고점을 넘으면(BOS · 고점마다 한 번)
//   그 직전 20봉 안 마지막 음봉의 고가 ~ 저가 = 상자(BT 지정가 = 고가 · 손절 = 저가) · 종가가 아래 끝을 깨면 그 봉에서 멈춤(흐리게)
//   Power % = 상자 봉 길이 ÷ 그 BOS 봉까지 100봉 최장 봉 길이 × 100(④ 식 · 진하기만)
function ictObCalc(rows) { const { n, O, H, L, C } = cols4(rows), HL = new Float64Array(n); for (let t = 0; t < n; t++) HL[t] = H[t] - L[t];
  const mx = hiN(HL, 100), PV = [];
  for (let i = 3; i + 3 < n; i++) { let ok = true; for (let j = i - 3; j <= i + 3 && ok; j++) { if (j === i) continue; if (j < i ? !(H[i] > H[j]) : !(H[i] >= H[j])) ok = false; } if (ok) PV.push({ i, p: H[i], c: i + 3 }); }
  const obs = [], Hs = [], used = new Set(); let q = 0;
  for (let t = 0; t < n; t++) {
    while (q < PV.length && PV[q].c <= t - 1) Hs.push(PV[q++]);
    if (!Hs.length) continue; const h2 = Hs[Hs.length - 1]; if (!(C[t] > h2.p) || used.has(h2.i)) continue; used.add(h2.i);
    let j = -1; for (let x = t - 1; x >= Math.max(0, t - 20); x--) if (C[x] < O[x]) { j = x; break; } if (j < 0) continue;
    const pct = mx[t] > 0 ? (H[j] - L[j]) / mx[t] * 100 : 0; let end = -1; for (let u = t + 1; u < n; u++) if (C[u] < L[j]) { end = u; break; }
    obs.push({ t, j, top: H[j], bot: L[j], piv: h2.i, pct, end }); }
  return { n, obs }; }
const ICT_COL = '#e11d48';   // 🎯 ICT 탭 색
TV.reg({
  id: 'ictob', place: 'over', name: 'ICT Order Block (앱 🎯 ICT 탭 정의)', short: 'ICT OB', kname: '🎯 ICT 오더블록',
  author: '앱(🎯 ICT 탭 BT 오더블록 셋업과 같은 식)', license: '앱 자체 정의 · 이 파일 MPL 2.0',
  app: '앱 자체 정의 — 🎯 ICT 탭 BT 의 오더블록 셋업(스윙 고점 3 · 3 · BOS · 직전 20봉 안 마지막 음봉)과 같은 식 · Power % 진하기 = Power Order Blocks [ChartPrime](MPL 2.0) 식',
  inputs: [
    { k: 'power', nm: 'Power % 진하기(상자 봉 길이 ÷ 100봉 최장 봉)', o: 'Power Intensity (ChartPrime 식)', t: 'bool', d: true },
    { k: 'broken', nm: '깨진 상자도 흐리게 남김', o: 'Show Broken (앱)', t: 'bool', d: true }
  ],
  legend: p => 'ICT OB' + (p.power ? ' · Power %' : ''),
  calc: ictObCalc,
  draw(ctx, R, G, p) { const RE = G.W - G.pad.r, x = G.x, y = G.y, tx = [];
    ctx.save();
    R.obs.forEach(o => { if (!fin(o.top) || !fin(o.bot)) return; const alive = o.end < 0; if (!alive && !p.broken) return;
      const x0 = x(o.j), x1 = alive ? RE : Math.min(x(o.end), RE); if (x1 < G.pad.l) return; const y0 = y(o.top), y1 = y(o.bot), h = Math.max(y1 - y0, 0.5);
      if (alive) { ctx.fillStyle = rgba(ICT_COL, (100 - (p.power ? powTr(o.pct) : 80)) / 100); ctx.fillRect(x0, y0, x1 - x0, h); ctx.strokeStyle = rgba(ICT_COL, 0.55); ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(x0, y0, x1 - x0, h);
        tx.push({ x: RE - 2, y: (y0 + y1) / 2, s: '🎯OB' + (p.power ? ' ' + Math.round(fin(o.pct) ? o.pct : 0) + '%' : ''), c: ICT_COL, fz: 8, al: 'right' }); }
      else { ctx.fillStyle = rgba(ICT_COL, 0.06); ctx.fillRect(x0, y0, x1 - x0, h); ctx.strokeStyle = rgba(ICT_COL, 0.3); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(x0, y0, x1 - x0, h); ctx.setLineDash([]); } });
    obTexts(ctx, tx, RE, G.H); ctx.restore(); }
});

// ── ③ Market Structure Break & Order Block(EmreKb) — 원본 52 ~ 201줄 봉마다 그대로 ──
//   풀이: na 비교 거짓 · 107 ~ 109줄 last_l0 · last_h0 앞 조건은 늘 거짓(ta.change(market) 를 부르는 자리의 market = 앞 봉 값이라 바뀜 0)
//         for 는 거꾸로도 셈(끝 값 포함) · 끝 값이 na 면 안 돎 · 배열은 na 다섯 칸으로 시작 · f_delete_box = 맨 앞 칸을 뺌(for…in 은 바뀐 크기로 다음 차례)
//         줄 500 · 글자 50(원본 max_lines_count · max_labels_count 기본) · 지운 상자는 더 안 바뀜
function msbCalc(rows, p) { const { n, O, H, L, C } = cols4(rows), zz = p.zigzag_len, fib = p.fib_factor;
  const hh = hiN(H, zz), ll = loN(L, zz), toUp = new Uint8Array(n), toDn = new Uint8Array(n), trend = new Int8Array(n), market = new Int8Array(n);
  const lowVal = new Float64Array(n), highVal = new Float64Array(n), lowIdx = new Float64Array(n), highIdx = new Float64Array(n), buOb = new Float64Array(n), beOb = new Float64Array(n), buBb = new Float64Array(n), beBb = new Float64Array(n);
  const HP = [NaN, NaN, NaN, NaN, NaN], HI = HP.slice(), LP = HP.slice(), LI = HP.slice(), h0iS = new Float64Array(n), l0iS = new Float64Array(n);
  const BX = { buob: [null, null, null, null, null], beob: [null, null, null, null, null], bebb: [null, null, null, null, null], bubb: [null, null, null, null, null] };
  const lines = [], labels = [], boxes = []; let lastUp = -1, lastDn = -1, lastLE = -1, lastHE = -1;
  const winMin = (t, m) => { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = L[j]; if (fin(v) && (!fin(x) || v < x)) x = v; } return x; };
  const winMax = (t, m) => { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = H[j]; if (fin(v) && (!fin(x) || v > x)) x = v; } return x; };
  const scan = (a, b, bull, cur) => { if (!fin(a) || !fin(b)) return cur; const st = a <= b ? 1 : -1; for (let i = a; st > 0 ? i <= b : i >= b; i += st) { if (i < 0) continue; if (bull ? lt(O[i], C[i]) : gt(O[i], C[i])) cur = i; } return cur; };
  const last = (A, k) => A[A.length - 1 - k];
  for (let t = 0; t < n; t++) {
    toUp[t] = ge(H[t], hh[t]) ? 1 : 0; toDn[t] = le(L[t], ll[t]) ? 1 : 0;
    const pt = t > 0 ? trend[t - 1] : 1; trend[t] = (pt === 1 && toDn[t]) ? -1 : (pt === -1 && toUp[t]) ? 1 : pt;
    const sU = lastUp >= 0 ? t - 1 - lastUp : NaN, sD = lastDn >= 0 ? t - 1 - lastDn : NaN; if (toUp[t]) lastUp = t; if (toDn[t]) lastDn = t;   // ta.barssince(to_up[1])
    lowVal[t] = winMin(t, sU > 0 ? sU : 1); if (lowVal[t] === L[t] && fin(L[t])) lastLE = t; lowIdx[t] = lastLE >= 0 ? lastLE : NaN;
    highVal[t] = winMax(t, sD > 0 ? sD : 1); if (highVal[t] === H[t] && fin(H[t])) lastHE = t; highIdx[t] = lastHE >= 0 ? lastHE : NaN;
    const chT = t >= 1 && trend[t] !== trend[t - 1];
    if (chT) { if (trend[t] === 1) { LP.push(lowVal[t]); LI.push(lowIdx[t]); } else { HP.push(highVal[t]); HI.push(highIdx[t]); } }
    const h0 = last(HP, 0), h0i = last(HI, 0), h1 = last(HP, 1), h1i = last(HI, 1), l0 = last(LP, 0), l0i = last(LI, 0), l1 = last(LP, 1), l1i = last(LI, 1); h0iS[t] = h0i; l0iS[t] = l0i;
    if (chT && p.show_zigzag) lines.push(trend[t] === 1 ? { k: 'zz', d: 0, x1: h0i, y1: h0, x2: l0i, y2: l0 } : { k: 'zz', d: 0, x1: l0i, y1: l0, x2: h0i, y2: h0 });
    const pm = t > 0 ? market[t - 1] : 1;
    market[t] = (pm === 1 && lt(l0, l1) && lt(l0, l1 - Math.abs(h0 - l1) * fib)) ? -1 : (pm === -1 && gt(h0, h1) && gt(h0, h1 + Math.abs(h1 - l0) * fib)) ? 1 : pm;
    const zb = t - zz >= 0 ? l0iS[t - zz] : NaN, zh = t - zz >= 0 ? h0iS[t - zz] : NaN;
    buOb[t] = scan(h1i, zb, false, t > 0 ? buOb[t - 1] : t); beOb[t] = scan(l1i, zh, true, t > 0 ? beOb[t - 1] : t);
    beBb[t] = scan(h1i - zz, l1i, false, t > 0 ? beBb[t - 1] : t); buBb[t] = scan(l1i - zz, h1i, true, t > 0 ? buBb[t - 1] : t);
    if (t >= 1 && market[t] !== market[t - 1]) { const up = market[t] === 1;
      if (up) { lines.push({ k: 'msb', d: 1, x1: h1i, y1: h1, x2: h0i, y2: h1 }); labels.push({ x: Math.floor((h1i + l0i) / 2), y: h1, d: 1 }); }
      else { lines.push({ k: 'msb', d: -1, x1: l1i, y1: l1, x2: l0i, y2: l1 }); labels.push({ x: Math.floor((l1i + h0i) / 2), y: l1, d: -1 }); }
      const mk = (k, i, txt) => { const b = { k, c: t, l: i, t: H[i], b: L[i], r: t + 10, txt, gone: -1, del: false }; boxes.push(b); BX[k].push(b); };
      if (up) { mk('buob', buOb[t], 'Bu-OB'); mk('bubb', buBb[t], lt(l0, l1) ? 'Bu-BB' : 'Bu-MB'); }
      else { mk('beob', beOb[t], 'Be-OB'); mk('bebb', beBb[t], gt(h0, h1) ? 'Be-BB' : 'Be-MB'); } }
    const ext = b => { if (b && !b.del) b.r = t + 10; }, kill = A => { const b = A.shift(); if (b) { b.gone = t; b.del = !!p.delete_boxes; } };
    [['buob', 'bu'], ['beob', 'be1'], ['bebb', 'be'], ['bubb', 'bu']].forEach(([k, m]) => { const A = BX[k];
      for (let q = 0; q < A.length; q++) { const b = A[q], bot = b ? b.b : NaN, top = b ? b.t : NaN;
        if (m === 'bu') { if (lt(C[t], bot)) kill(A); else if (lt(C[t], top)) { } else ext(b); }
        else if (m === 'be1') { if (gt(C[t], top)) kill(A); if (gt(C[t], bot)) { } else ext(b); }   // 원본 173 ~ 181줄(else 없음)
        else { if (gt(C[t], top)) kill(A); else if (gt(C[t], bot)) { } else ext(b); } } });
  }
  return { n, trend, market, toUp, toDn, lowVal, lowIdx, highVal, highIdx, buOb, beOb, buBb, beBb, lines: lines.slice(-500), labels: labels.slice(-50), boxes }; }
const MSB_COL = { bu: '#4caf50', be: '#ff5252', zz: '#2962ff' }, MSB_SZ = ['tiny', 'small', 'normal', 'large', 'huge'];
TV.reg({
  id: 'msb', place: 'over', name: 'Market Structure Break & Order Block', short: 'MSB-OB', kname: '시장 구조 깨짐 · 오더블록(MSB-OB)',
  author: 'EmreKb', license: 'MPL 2.0', srcFile: 'Market Structure Break & Order Block.txt',
  inputs: [
    { k: 'zigzag_len', nm: '지그재그 길이', o: 'ZigZag Length', t: 'int', d: 9, min: 1, max: 200 },
    { k: 'show_zigzag', nm: '지그재그 보이기', o: 'Show Zigzag', t: 'bool', d: true },
    { k: 'fib_factor', nm: '돌파 확인 피보 비율', o: 'Fib Factor for breakout confirmation', t: 'float', d: 0.33, min: 0, max: 1, step: 0.01 },
    { k: 'text_size', nm: '글자 크기', o: 'Text Size', t: 'sel', d: 'tiny', opts: MSB_SZ, optNm: { tiny: '아주 작게', small: '작게', normal: '보통', large: '크게', huge: '아주 크게' } },
    { k: 'delete_boxes', nm: '옛 · 깨진 상자 지우기', o: 'Delete Old/Broken Boxes', t: 'bool', d: true }
  ],
  legend: p => 'MSB-OB ' + p.zigzag_len + ' · ' + p.fib_factor,
  calc: msbCalc,
  range() { },   // 값은 안 넣음 — 'MSB' 글자 자리 여유 7% 만(틀 규칙)
  draw(ctx, R, G, p) { const RE = G.W - G.pad.r, x = G.x, y = G.y, li = R.n - 1, tx = [], fz = OB_FZ[p.text_size] || 8;
    ctx.save();
    R.boxes.forEach(b => { if (b.del || !fin(b.t) || !fin(b.b) || !fin(b.l)) return; const bu = b.k === 'buob' || b.k === 'bubb', col = bu ? MSB_COL.bu : MSB_COL.be;
      const x0 = x(b.l), x1 = b.r >= li ? RE : Math.min(x(b.r), RE); if (x1 < G.pad.l) return; const y0 = y(Math.max(b.t, b.b)), y1 = y(Math.min(b.t, b.b));
      ctx.fillStyle = rgba(col, 0.3); ctx.fillRect(x0, y0, x1 - x0, Math.max(y1 - y0, 0.5)); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(x0, y0, x1 - x0, Math.max(y1 - y0, 0.5));
      tx.push({ x: x1 - 2, y: (y0 + y1) / 2, s: b.txt, c: col, fz, al: 'right' }); });
    R.lines.forEach(l => { if (!fin(l.x1) || !fin(l.x2) || !fin(l.y1) || !fin(l.y2)) return; ctx.strokeStyle = l.k === 'zz' ? MSB_COL.zz : (l.d === 1 ? MSB_COL.bu : MSB_COL.be); ctx.lineWidth = l.k === 'zz' ? 1 : 2; ctx.beginPath(); ctx.moveTo(x(l.x1), y(l.y1)); ctx.lineTo(x(l.x2), y(l.y2)); ctx.stroke(); });
    R.labels.forEach(a => { if (!fin(a.x) || !fin(a.y)) return; tx.push({ x: x(a.x), y: y(a.y) + (a.d === 1 ? -8 : 8), s: 'MSB', c: a.d === 1 ? MSB_COL.bu : MSB_COL.be, fz: 9, al: 'center' }); });
    obTexts(ctx, tx, RE, G.H); ctx.restore(); }
});

// ── ④ Power Order Blocks [ChartPrime] — 원본 42 ~ 276줄 봉마다 그대로 ──
//   음봉 바로 다음 큰 양봉이 그 음봉 고가 위로 마감(몸통 > 음봉 길이 × 배수) → 그 음봉 고가 ~ 저가 = 상승 블록(하락은 거울) · 구조 깨짐은 안 봄
//   종가가 아래 끝을 깨면 지움 · 새 블록과 겹치면 옛 블록 지움 · 한쪽 최대 10 · 닿고 튐(Touches) · 되시험 ⇡ ⇣(10봉 간격)
//   Power % = 블록 봉 길이 ÷ 100봉 최장 봉 길이 × 100 — 크기를 적은 것(지켜질 확률 아님) · 진하기 = 태어날 때 값 · 글자 % = 마지막 되시험 때 값(원본 그대로)
function pobCalc(rows, p) { const { n, O, H, L, C } = cols4(rows), HL = new Float64Array(n); for (let t = 0; t < n; t++) HL[t] = H[t] - L[t];
  const mx = hiN(HL, 100), A = T.atr(H, L, C, 14), bullOB = new Uint8Array(n), bearOB = new Uint8Array(n), bullRet = new Uint8Array(n), bearRet = new Uint8Array(n);
  const blocks = [], bu = [], be = [], labels = []; let lastB = NaN, lastS = NaN;
  const pctOf = (top, btm, t) => mx[t] > 0 ? ((top - btm) / mx[t]) * 100 : 0, trOf = pc => p.powerFade ? Math.round(92 - (pc / 100.0) * 32) : 80;
  for (let t = 0; t < n; t++) { let rB = false, rS = false;
    for (let i = bu.length - 1; i >= 0; i--) { const ob = bu[i]; if (lt(C[t], ob.btm)) { ob.gone = t; ob.why = 'brk'; bu.splice(i, 1); }
      else if (t > 0 && le(L[t - 1], ob.top) && ge(L[t], ob.top) && t > ob.l) { rB = true; ob.touches += 1; ob.lblPct = pctOf(ob.top, ob.btm, t); } }
    for (let i = be.length - 1; i >= 0; i--) { const ob = be[i]; if (gt(C[t], ob.top)) { ob.gone = t; ob.why = 'brk'; be.splice(i, 1); }
      else if (t > 0 && ge(H[t - 1], ob.btm) && le(H[t], ob.btm) && t > ob.l) { rS = true; ob.touches += 1; ob.lblPct = pctOf(ob.top, ob.btm, t); } }
    if (rB && (!fin(lastB) || t - lastB >= 10)) { bullRet[t] = 1; lastB = t; } if (rS && (!fin(lastS) || t - lastS >= 10)) { bearRet[t] = 1; lastS = t; }
    if (t >= 1) { const mk = (d, A1) => { const top = H[t - 1], btm = L[t - 1], pc = pctOf(top, btm, t);
        for (let i = A1.length - 1; i >= 0; i--) { const o = A1[i]; if (ge(top, o.btm) && le(btm, o.top)) { o.gone = t; o.why = 'ovl'; A1.splice(i, 1); } }
        const ob = { d, c: t, l: t - 1, top, btm, pct: pc, transp: trOf(pc), touches: 0, lblPct: pc, gone: -1, why: '' }; A1.push(ob); blocks.push(ob);
        while (A1.length > 10) { const o = A1.shift(); o.gone = t; o.why = 'trim'; } };
      if (lt(C[t - 1], O[t - 1]) && gt(C[t], O[t]) && gt(C[t], H[t - 1]) && gt(C[t] - O[t], (H[t - 1] - L[t - 1]) * p.dispThresh)) { bullOB[t] = 1; mk(1, bu); }
      if (gt(C[t - 1], O[t - 1]) && lt(C[t], O[t]) && lt(C[t], L[t - 1]) && gt(O[t] - C[t], (H[t - 1] - L[t - 1]) * p.dispThresh)) { bearOB[t] = 1; mk(-1, be); } }
    if (p.showRetests && bullRet[t]) labels.push({ x: t, y: L[t] - A[t] * 0.2, d: 1 }); if (p.showRetests && bearRet[t]) labels.push({ x: t, y: H[t] + A[t] * 0.2, d: -1 }); }
  return { n, bullOB, bearOB, maxCS: mx, bullRet, bearRet, blocks, labels: labels.slice(-500) }; }
const POB_COL = { 1: '#1bd37a', '-1': '#bc14e6' };
TV.reg({
  id: 'pob', place: 'over', name: 'Power Order Blocks [ChartPrime]', short: 'Power OB', kname: '파워 오더블록',
  author: 'ChartPrime', license: 'MPL 2.0', srcFile: 'Power Order Blocks (ChartPrime).txt',
  inputs: [
    { k: 'dispThresh', nm: '돌파 봉 배수(몸통 > 앞 봉 길이 × 이 값)', o: 'Displacement Multiplier', t: 'float', d: 0.5, min: 0, max: 10, step: 0.1 },
    { k: 'showEqLine', nm: '가운데 선', o: 'Show Equilibrium Line', t: 'bool', d: true },
    { k: 'powerFade', nm: 'Power 진하기', o: 'Power Intensity', t: 'bool', d: true },
    { k: 'showRetests', nm: '되시험 화살표', o: 'Show Retest Labels', t: 'bool', d: true }
  ],
  legend: p => 'Power OB ' + p.dispThresh,
  calc: pobCalc,
  range() { },   // 값은 안 넣음 — 화살표 자리 여유 7% 만
  draw(ctx, R, G, p) { const RE = G.W - G.pad.r, x = G.x, y = G.y, li = R.n - 1, tx = [];
    ctx.save();
    R.blocks.forEach(b => { if (b.gone >= 0 || !fin(b.top) || !fin(b.btm)) return; const col = POB_COL[b.d], x0 = x(b.l), y0 = y(b.top), y1 = y(b.btm), mid = (b.top + b.btm) / 2;
      ctx.fillStyle = rgba(col, (100 - b.transp) / 100); ctx.fillRect(x0, y0, RE - x0, Math.max(y1 - y0, 0.5));
      if (p.showEqLine) { ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x0, y(mid)); ctx.lineTo(Math.min(x(li), RE), y(mid)); ctx.stroke(); }
      tx.push({ x: RE - 2, y: (y0 + y1) / 2, s: 'Power: ' + Math.round(fin(b.lblPct) ? b.lblPct : 0) + '% | Touches: ' + b.touches, c: col, fz: 8, al: 'right' }); });
    R.labels.forEach(a => { if (!fin(a.y)) return; tx.push({ x: x(a.x), y: y(a.y) + (a.d === 1 ? 7 : -7), s: a.d === 1 ? '⇡' : '⇣', c: POB_COL[a.d], fz: 13, al: 'center' }); });
    obTexts(ctx, tx, RE, G.H); ctx.restore(); }
});
if (typeof module !== 'undefined' && module.exports) module.exports = { staCalc, stAny, atrAny, rngfilt, smoothrng, srcOf, ictObCalc, msbCalc, pobCalc };
})();
