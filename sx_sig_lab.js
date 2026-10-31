// sx_sig_lab.js — [S1854] 🧪 신호 실험 칩 — 매수 · 매도 신호 34개(TradingView 공개 스크립트 17가지 → JS · 봉마다 파인 그대로) + 카드 셈
//   읽기 도움 · 판정 아님 · 실험 도구 — 정의 = offline/bat/PREREG_S1854_siglab.md §0 · §1 · 출처 = offline/mlsig/sources.md
//   조립 = offline/mlsig/gen_lab.js(손으로 고치지 말 것 · 고치면 조립 다시) — 아래 세 덩어리는 앞 측정 파일 글자 그대로다:
//     파인 약속 = offline/_pta.js(fe4a960e2934) 5 ~ 35줄 · Lorentzian = offline/lorentz/meas_lz.js(f64e149e4232) 함수 · RSI Kernel = offline/rsikde/meas_rk.js(fd5c6c69f4b8) 함수
//   출처(작성자 · 라이선스): UT Bot(공개) · Squeeze Momentum(LazyBear) · CMF(공개) · Donchian(ChrisMoody) · IFT(KivancOzbilgic · Ehlers) · Lorentzian Classification(jdehorty · MPL 2.0) · RSI Kernel Optimized(Flux Charts · CC BY-NC-SA 4.0) ·
//     Smart Money Concepts(LuxAlgo · CC BY-NC-SA 4.0) · S/R Levels with Breaks(LuxAlgo · CC BY-NC-SA 4.0) · VWAP Divergence(fluxchart · MPL 2.0) · WaveTrend(LazyBear) · ATP MACD(AlgoTrade_Pro · MPL 2.0) ·
//     ML Adaptive SuperTrend(AlgoAlpha · MPL 2.0) · ML Momentum Index(Zeiierman · CC BY-NC-SA 4.0) · ML kNN-based Strategy · ML Logistic Regression(capissimo · MPL 2.0) · ML Price Target Prediction Signals(AlgoAlpha · MPL 2.0) — 비상업
(function(){
'use strict';
// ── 파인 약속(offline/_pta.js 글자 그대로) ──
const fin = Number.isFinite, nz = (x, d = 0) => fin(x) ? x : d;
function smaAt(src, n, t) { if (t < n - 1) return NaN; let s = 0; for (let j = t - n + 1; j <= t; j++) { const v = src[j]; if (!fin(v)) return NaN; s += v; } return s / n; }
function sma(src, n) { const N = src.length, o = new Float64Array(N); let s = 0, bad = 0; for (let t = 0; t < N; t++) { const v = src[t]; if (fin(v)) s += v; else bad++; if (t >= n) { const u = src[t - n]; if (fin(u)) s -= u; else bad--; } o[t] = t >= n - 1 && bad === 0 ? s / n : NaN; }
  // 더하고 빼는 누적의 반올림 오차를 피하려고 n 이 작지 않으면 다시 정확히 셈
  if (n > 1) for (let t = n - 1; t < N; t++) if (fin(o[t])) o[t] = smaAt(src, n, t); return o; }
function emaG(src, n, alpha) { const o = new Float64Array(src.length); for (let t = 0; t < src.length; t++) { const p = t > 0 ? o[t - 1] : NaN; o[t] = !fin(p) ? smaAt(src, n, t) : alpha * src[t] + (1 - alpha) * p; } return o; }
const ema = (src, n) => emaG(src, n, 2 / (n + 1)), rma = (src, n) => emaG(src, n, 1 / n);
// na 건너뛰는 sma · stdev(모집단) — 마지막 n개 유효 값
function smaS(src, n) { const N = src.length, o = new Float64Array(N), idx = []; for (let t = 0; t < N; t++) { if (fin(src[t])) idx.push(t); if (idx.length < n) { o[t] = NaN; continue; } let s = 0; for (let j = idx.length - n; j < idx.length; j++) s += src[idx[j]]; o[t] = s / n; } return o; }
function stdevS(src, n) { const N = src.length, o = new Float64Array(N), idx = []; for (let t = 0; t < N; t++) { if (fin(src[t])) idx.push(t); if (idx.length < n) { o[t] = NaN; continue; } let s = 0; for (let j = idx.length - n; j < idx.length; j++) s += src[idx[j]]; const m = s / n; let v = 0; for (let j = idx.length - n; j < idx.length; j++) { const d = src[idx[j]] - m; v += d * d; } o[t] = Math.sqrt(v / n); } return o; }
// 빠른 판(굴리는 합) — 창이 길 때(800 · 1200 · 500) 쓴다 · 값은 smaS/stdevS 와 같은 정의(검산에서 견줌)
function smaSdS(src, n) { const N = src.length, m = new Float64Array(N), sd = new Float64Array(N), vals = []; let s = 0, s2 = 0, head = 0;
  for (let t = 0; t < N; t++) { const v = src[t]; if (fin(v)) { vals.push(v); s += v; s2 += v * v; if (vals.length - head > n) { const u = vals[head++]; s -= u; s2 -= u * u; } }
    if (vals.length - head < n) { m[t] = NaN; sd[t] = NaN; continue; }
    if ((t & 255) === 0) { s = 0; s2 = 0; for (let j = head; j < vals.length; j++) { s += vals[j]; s2 += vals[j] * vals[j]; } } // 오차 다시 맞춤
    const mu = s / n; m[t] = mu; let vr = s2 / n - mu * mu; if (vr < 0) vr = 0; sd[t] = Math.sqrt(vr); }
  return { m, sd }; }
function stdev(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const mu = smaAt(src, n, t); if (!fin(mu)) { o[t] = NaN; continue; } let v = 0; for (let j = t - n + 1; j <= t; j++) { const d = src[j] - mu; v += d * d; } o[t] = Math.sqrt(v / n); } return o; }
function rsi(x, n) { const N = x.length, up = new Float64Array(N), dn = new Float64Array(N); up[0] = dn[0] = NaN; for (let t = 1; t < N; t++) { const c = x[t] - x[t - 1]; up[t] = Math.max(c, 0); dn[t] = Math.max(-c, 0); }
  const u = rma(up, n), d = rma(dn, n), o = new Float64Array(N); for (let t = 0; t < N; t++) { if (!fin(u[t]) || !fin(d[t])) { o[t] = NaN; continue; } o[t] = d[t] === 0 ? 100 : 100 - 100 / (1 + u[t] / d[t]); } return o; }
function trS(H, L, C) { const N = C.length, tr = new Float64Array(N); for (let t = 0; t < N; t++) tr[t] = t === 0 ? H[t] - L[t] : Math.max(Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1])), Math.abs(L[t] - C[t - 1])); return tr; }
const atr = (H, L, C, n) => rma(trS(H, L, C), n);
function highest(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } let m = -Infinity; for (let j = t - n + 1; j <= t; j++) if (src[j] > m) m = src[j]; o[t] = m; } return o; }
function lowest(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } let m = Infinity; for (let j = t - n + 1; j <= t; j++) if (src[j] < m) m = src[j]; o[t] = m; } return o; }
function linreg(src, n) { const N = src.length, o = new Float64Array(N), xm = (n - 1) / 2; let sxx = 0; for (let i = 0; i < n; i++) sxx += (i - xm) * (i - xm);
  for (let t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } let ym = 0; for (let i = 0; i < n; i++) ym += src[t - n + 1 + i]; ym /= n; let sxy = 0; for (let i = 0; i < n; i++) sxy += (i - xm) * (src[t - n + 1 + i] - ym); const b = sxy / sxx; o[t] = ym + b * (n - 1 - xm); } return o; }
function cci(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const m = smaAt(src, n, t); if (!fin(m)) { o[t] = NaN; continue; } let dv = 0; for (let j = t - n + 1; j <= t; j++) dv += Math.abs(src[j] - m); dv /= n; o[t] = dv === 0 ? NaN : (src[t] - m) / (0.015 * dv); } return o; }
// 피벗: 봉 t 에 확정(t − R 이 가운데) · 왼쪽 > · 오른쪽 ≥ (고점) — 값 줄(없으면 NaN)
function pivotHigh(H, Lb, Rb) { const N = H.length, o = new Float64Array(N).fill(NaN); for (let t = Lb + Rb; t < N; t++) { const c = t - Rb, v = H[c]; let ok = true; for (let j = c - Lb; j < c && ok; j++) if (!(v > H[j])) ok = false; for (let j = c + 1; j <= t && ok; j++) if (!(v >= H[j])) ok = false; if (ok) o[t] = v; } return o; }
function pivotLow(L, Lb, Rb) { const N = L.length, o = new Float64Array(N).fill(NaN); for (let t = Lb + Rb; t < N; t++) { const c = t - Rb, v = L[c]; let ok = true; for (let j = c - Lb; j < c && ok; j++) if (!(v < L[j])) ok = false; for (let j = c + 1; j <= t && ok; j++) if (!(v <= L[j])) ok = false; if (ok) o[t] = v; } return o; }
const clamp = (x, lo, hi) => fin(x) ? Math.max(lo, Math.min(hi, x)) : NaN;
const T_ = { fin, nz, smaAt, sma, ema, rma, emaG, stdev, rsi, trS, atr, highest, lowest, linreg, cci, pivotHigh, pivotLow };
// ── Lorentzian(offline/lorentz/meas_lz.js 함수 글자 그대로) ──
const LZ = (function(){
const fin = Number.isFinite, nz = (x, d = 0) => fin(x) ? x : d; const MAXBB = 2000, K = 8;
function smaAt(src, n, t) { if (t < n - 1) return NaN; let s = 0; for (let j = t - n + 1; j <= t; j++) { const v = src[j]; if (!fin(v)) return NaN; s += v; } return s / n; }
function sma(src, n) { const o = new Float64Array(src.length); for (let t = 0; t < src.length; t++) o[t] = smaAt(src, n, t); return o; }
function emaG(src, n, alpha) { const o = new Float64Array(src.length); for (let t = 0; t < src.length; t++) { const p = t > 0 ? o[t - 1] : NaN; o[t] = !fin(p) ? smaAt(src, n, t) : alpha * src[t] + (1 - alpha) * p; } return o; }
const ema = (src, n) => emaG(src, n, 2 / (n + 1)), rma = (src, n) => emaG(src, n, 1 / n);
function rsi(x, n) { const N = x.length, up = new Float64Array(N), dn = new Float64Array(N); up[0] = dn[0] = NaN; for (let t = 1; t < N; t++) { const c = x[t] - x[t - 1]; up[t] = Math.max(c, 0); dn[t] = Math.max(-c, 0); }
  const u = rma(up, n), d = rma(dn, n), o = new Float64Array(N); for (let t = 0; t < N; t++) { if (!fin(u[t]) || !fin(d[t])) { o[t] = NaN; continue; } o[t] = d[t] === 0 ? 100 : 100 - 100 / (1 + u[t] / d[t]); } return o; }
function cci(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const m = smaAt(src, n, t); if (!fin(m)) { o[t] = NaN; continue; } let dv = 0; for (let j = t - n + 1; j <= t; j++) dv += Math.abs(src[j] - m); dv /= n; o[t] = dv === 0 ? NaN : (src[t] - m) / (0.015 * dv); } return o; }
function normalize(src) { const o = new Float64Array(src.length); let lo = 10e10, hi = -10e10; for (let t = 0; t < src.length; t++) { const v = src[t]; lo = Math.min(nz(v, lo), lo); hi = Math.max(nz(v, hi), hi); o[t] = fin(v) ? (v - lo) / Math.max(hi - lo, 10e-10) : NaN; } return o; }
const rescale100 = a => a.map(v => fin(v) ? v / 100 : NaN);
function nWt(src, n1, n2) { const N = src.length, e1 = ema(src, n1), ab = new Float64Array(N); for (let t = 0; t < N; t++) ab[t] = fin(e1[t]) ? Math.abs(src[t] - e1[t]) : NaN;
  const e2 = ema(ab, n1), ci = new Float64Array(N); for (let t = 0; t < N; t++) ci[t] = fin(e2[t]) && e2[t] !== 0 ? (src[t] - e1[t]) / (0.015 * e2[t]) : NaN;
  const w1 = ema(ci, n2), w2 = sma(w1, 4), df = new Float64Array(N); for (let t = 0; t < N; t++) df[t] = w1[t] - w2[t]; return normalize(df); }
function nAdx(H, L, C, n) { const N = C.length, dx = new Float64Array(N); let trS = 0, pS = 0, mS = 0;
  for (let t = 0; t < N; t++) { const pc = t > 0 ? C[t - 1] : 0, ph = t > 0 ? H[t - 1] : 0, pl = t > 0 ? L[t - 1] : 0;
    const tr = Math.max(Math.max(H[t] - L[t], Math.abs(H[t] - pc)), Math.abs(L[t] - pc));
    const dmp = H[t] - ph > pl - L[t] ? Math.max(H[t] - ph, 0) : 0, dmm = pl - L[t] > H[t] - ph ? Math.max(pl - L[t], 0) : 0;
    trS = trS - trS / n + tr; pS = pS - pS / n + dmp; mS = mS - mS / n + dmm;
    const dip = pS / trS * 100, dim = mS / trS * 100, sm = dip + dim; dx[t] = fin(dip) && fin(dim) && sm !== 0 ? Math.abs(dip - dim) / sm * 100 : NaN; }
  return rescale100(rma(dx, n)); }
function atr(H, L, C, n) { const N = C.length, tr = new Float64Array(N); for (let t = 0; t < N; t++) tr[t] = t === 0 ? H[t] - L[t] : Math.max(Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1])), Math.abs(L[t] - C[t - 1])); return rma(tr, n); }
function regime(O, H, L, C, thr) { const N = C.length, src = new Float64Array(N); for (let t = 0; t < N; t++) src[t] = (O[t] + H[t] + L[t] + C[t]) / 4;
  const v1 = new Float64Array(N), v2 = new Float64Array(N), kl = new Float64Array(N), sl = new Float64Array(N);
  for (let t = 0; t < N; t++) { v1[t] = t === 0 ? NaN : 0.2 * (src[t] - src[t - 1]) + 0.8 * nz(v1[t - 1]); v2[t] = 0.1 * (H[t] - L[t]) + 0.8 * (t > 0 ? nz(v2[t - 1]) : 0);
    const om = fin(v1[t]) && v2[t] !== 0 ? Math.abs(v1[t] / v2[t]) : NaN, al = (-(om ** 2) + Math.sqrt(om ** 4 + 16 * om ** 2)) / 8;
    kl[t] = al * src[t] + (1 - al) * (t > 0 ? nz(kl[t - 1]) : 0); sl[t] = t > 0 ? Math.abs(kl[t] - kl[t - 1]) : NaN; }
  const e = ema(sl, 200), ok = new Uint8Array(N), nsd = new Float64Array(N); for (let t = 0; t < N; t++) { nsd[t] = fin(e[t]) && e[t] !== 0 && fin(sl[t]) ? (sl[t] - e[t]) / e[t] : NaN; ok[t] = nsd[t] >= thr ? 1 : 0; } return { ok, nsd }; }
function kernelRQ(C, h, r, x) { const N = C.length, o = new Float64Array(N), W = []; let sw = 0; for (let i = 0; i <= x + 1; i++) { const w = Math.pow(1 + (i * i) / (h * h * 2 * r), -r); W.push(w); sw += w; }
  for (let t = 0; t < N; t++) { if (t < x + 1) { o[t] = NaN; continue; } let s = 0; for (let i = 0; i <= x + 1; i++) s += C[t - i] * W[i]; o[t] = s / sw; } return o; }
function lorentz(B) {
  const { O, H, L, C } = B, N = C.length, hlc3 = new Float64Array(N); for (let t = 0; t < N; t++) hlc3[t] = (H[t] + L[t] + C[t]) / 3;
  const F = [rescale100(ema(rsi(C, 14), 1)), nWt(hlc3, 10, 11), normalize(ema(cci(C, 20), 1)), nAdx(H, L, C, 20), rescale100(ema(rsi(C, 9), 1))];
  const lab = new Int8Array(N); for (let t = 4; t < N; t++) lab[t] = C[t - 4] < C[t] ? -1 : C[t - 4] > C[t] ? 1 : 0;
  const pred = new Int32Array(N), dist = [], pl = [];
  const [f1, f2, f3, f4, f5] = F;
  for (let t = 0; t < N; t++) {
    let lastD = -1; const a1 = f1[t], a2 = f2[t], a3 = f3[t], a4 = f4[t], a5 = f5[t];
    if (fin(a1) && fin(a2) && fin(a3) && fin(a4) && fin(a5)) {
      for (let i = Math.max(0, t - (MAXBB - 1)); i <= t; i++) {
        if (i % 4 === 0) continue;
        const d = Math.log(1 + Math.abs(a1 - f1[i])) + Math.log(1 + Math.abs(a2 - f2[i])) + Math.log(1 + Math.abs(a3 - f3[i])) + Math.log(1 + Math.abs(a4 - f4[i])) + Math.log(1 + Math.abs(a5 - f5[i]));
        if (!(d >= lastD)) continue;
        lastD = d; dist.push(d); pl.push(lab[i]);
        if (pl.length > K) { lastD = dist[Math.round(K * 3 / 4)]; dist.shift(); pl.shift(); }
      }
    }
    let s = 0; for (const v of pl) s += v; pred[t] = s;
  }
  const a1 = atr(H, L, C, 1), a10 = atr(H, L, C, 10), RG = regime(O, H, L, C, -0.1), yh = kernelRQ(C, 8, 8, 25);
  const sig = new Int8Array(N), buy = new Uint8Array(N), sell = new Uint8Array(N); let wr = -1;
  for (let t = 0; t < N; t++) {
    const vol = fin(a1[t]) && fin(a10[t]) && a1[t] > a10[t], filt = vol && RG.ok[t] === 1;
    sig[t] = pred[t] > 0 && filt ? 1 : pred[t] < 0 && filt ? -1 : (t > 0 ? sig[t - 1] : 0);
    const chg = t > 0 && sig[t] !== sig[t - 1];
    const bull = t > 0 && fin(yh[t]) && fin(yh[t - 1]) && yh[t - 1] < yh[t], bear = t > 0 && fin(yh[t]) && fin(yh[t - 1]) && yh[t - 1] > yh[t];
    buy[t] = chg && sig[t] === 1 && bull ? 1 : 0; sell[t] = chg && sig[t] === -1 && bear ? 1 : 0;
    if (wr < 0 && t > 0 && F.every(f => fin(f[t])) && fin(yh[t - 1]) && fin(a10[t]) && fin(RG.nsd[t])) wr = t;
  }
  return { pred, sig, buy, sell, wr: wr < 0 ? N : wr };
}
return { lorentz };
})();
// ── RSI Kernel(offline/rsikde/meas_rk.js 함수 글자 그대로) ──
const RK = (function(T_){
const PIV = 21, LIM = 300, NB = 100, BW = 1.0 / 2.71828, KC = 1 / Math.sqrt(2 * Math.PI), ACT = 0.25;
function kde(A) { let mn = Infinity, mx = -Infinity; for (const v of A) { if (v < mn) mn = v; if (v > mx) mx = v; } const rg = mx - mn, st = rg / NB, X = new Float64Array(2 * NB), S = new Float64Array(2 * NB); let c = 0;
  for (let i = 0; i < 2 * NB; i++) { const x = mn + i * st; X[i] = x; let tmp = 0; for (const a of A) { const q = (x - a) / BW; tmp += KC * Math.exp(-0.5 * q * q); } c += (1 / A.length) * tmp; S[i] = c; }
  return { X, S }; }
function near(X, v) { const N = X.length; let L = -1, R = N, eqF = -1, eqL = -1; for (let i = 0; i < N; i++) { if (X[i] === v) { if (eqF < 0) eqF = i; eqL = i; } }
  if (eqF >= 0) { L = eqF; R = eqL; } else { for (let i = 0; i < N; i++) if (X[i] < v) L = i; for (let i = N - 1; i >= 0; i--) if (X[i] > v) R = i; }
  R = Math.min(R, N - 1); const xl = L >= 0 ? X[L] : X[N + L]; const k = Math.abs(v - xl) < Math.abs(v - X[R]) ? L : R; return Math.max(0, k); }
function sigOf(rows) { const n = rows.length, H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), RS = T_.rsi(C, 14), PH = T_.pivotHigh(H, PIV, PIV), PL = T_.pivotLow(L, PIV, PIV);
  const hiA = [], loA = []; let KH = null, KL = null; const col = new Int8Array(n), ok = new Uint8Array(n), PB = new Uint8Array(n), PS = new Uint8Array(n), ZB = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    if (isFinite(PH[t])) { if (hiA.length > LIM) hiA.shift(); hiA.push(RS[t - PIV]); KH = kde(hiA); }
    if (isFinite(PL[t])) { if (loA.length > LIM) loA.shift(); loA.push(RS[t - PIV]); KL = kde(loA); }
    const r = RS[t];
    if (KH && KL && isFinite(r)) { ok[t] = 1; const kh = near(KH.X, r), kl = near(KL.X, r), hp = KH.S[kh], lp = KL.S[2 * NB - 1] - (kl === 0 ? 0 : KL.S[kl - 1]);
      col[t] = (lp > KL.S[2 * NB - 1] * (1 - ACT)) ? 1 : ((hp > KH.S[2 * NB - 1] * (1 - ACT)) ? -1 : 0); }
    if (t >= 1 && ok[t] && ok[t - 1]) { if (col[t] === 0 && col[t - 1] === 1) PB[t] = 1; if (col[t] === 0 && col[t - 1] === -1) PS[t] = 1; if (col[t] === 1 && col[t - 1] !== 1) ZB[t] = 1; } }
  return { RS, col, ok, PB, PS, ZB, C }; }
return { sigOf };
})(T_);
const LZ_lorentz = LZ.lorentz, RK_sigOf = RK.sigOf;
// ── 칩 34(스크립트 17 × 매수 · 매도) — PREREG_S1854 §0 · 매도 열둘은 offline/ssot/meas_ss.js votes() 와 같은 식(검산 다름 0) · 매수는 그 거울 + 원본 buy 줄 ──
function wma(src, n) { const N = src.length, o = new Float64Array(N), den = n * (n + 1) / 2; for (let t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } let s = 0; for (let i = 0; i < n; i++) s += (n - i) * src[t - i]; o[t] = s / den; } return o; }
const xUnder = (a, b, t) => t > 0 && fin(a[t]) && fin(b[t]) && fin(a[t - 1]) && fin(b[t - 1]) && a[t] < b[t] && a[t - 1] >= b[t - 1];
const xOver = (a, b, t) => t > 0 && fin(a[t]) && fin(b[t]) && fin(a[t - 1]) && fin(b[t - 1]) && a[t] > b[t] && a[t - 1] <= b[t - 1];
const neq = (a, b) => fin(a) && fin(b) && a !== b;
const dayKey = (d, intra) => { if (!intra) return d; const z = String(d); if (/^\d{10,13}$/.test(z)) { const ms = +z < 1e12 ? +z * 1000 : +z; return new Date(ms).toISOString().slice(0, 10); } const ms = new Date(z.slice(0, 19) + 'Z').getTime(); return fin(ms) ? new Date(ms - 9 * 3600e3).toISOString().slice(0, 10) : z.slice(0, 10); };   // 한국 시각 글자(업비트) → −9시간 · 숫자(유닉스 시각) → UTC 날짜 · 못 읽으면 앞 10자 — 하루 경계 = 한국 09:00
const CHIP_IDS = ['ut', 'sqz', 'cmf', 'don', 'ift', 'lz', 'rk', 'smc', 'srb', 'vwd', 'wt', 'macd', 'ast', 'mlmi', 'knns', 'logr', 'ptp'];
// 파인 v4 hma · roc · mom · 고정 길이 합(sum) — na 하나라도 있으면 na
function hma(src, n) { const a = wma(src, Math.floor(n / 2)), b = wma(src, n), x = new Float64Array(src.length); for (let t = 0; t < src.length; t++) x[t] = 2 * a[t] - b[t]; return wma(x, Math.floor(Math.sqrt(n))); }
function sumN(src, n) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } let s = 0; for (let j = t - n + 1; j <= t; j++) s += src[j]; o[t] = s; } return o; }
const lagD = (src, n, f) => { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) o[t] = t >= n ? f(src[t], src[t - n]) : NaN; return o; };
// 🤖 적응형 슈퍼트렌드(AlgoAlpha) — k-평균 셋 → 그 봉 중심 변동성 → 파인 슈퍼트렌드(3) · dir
function astDir(H, L, C) { const n = C.length, vol = atr(H, L, C, 10), up = highest(vol, 100), lo = lowest(vol, 100), cen = new Float64Array(n), dir = new Int8Array(n); let capHit = 0;
  const mean = a => { if (!a.length) return NaN; let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  for (let t = 0; t < n; t++) { const hv0 = lo[t] + (up[t] - lo[t]) * 0.75, mv0 = lo[t] + (up[t] - lo[t]) * 0.5, lv0 = lo[t] + (up[t] - lo[t]) * 0.25; let A = [hv0], B = [mv0], Cm = [lv0];
    if (fin(vol[t]) && vol[t] > 0 && t >= 99) { let it = 0;
      while ((A.length === 1 || neq(A[0], A[1])) || (B.length === 1 || neq(B[0], B[1])) || (Cm.length === 1 || neq(Cm[0], Cm[1]))) {
        if (++it > 10000) { capHit++; break; }
        const hv = [], mv = [], lv = []; for (let i = 0; i <= 99; i++) { const v = vol[t - i], d1 = Math.abs(v - A[0]), d2 = Math.abs(v - B[0]), d3 = Math.abs(v - Cm[0]);   // 원본: i = 99 … 0 에서 unshift → 배열 차례 = 최근 봉부터
          if (d1 < d2 && d1 < d3) hv.push(v); if (d2 < d1 && d2 < d3) mv.push(v); if (d3 < d1 && d3 < d2) lv.push(v); }
        A.unshift(mean(hv)); B.unshift(mean(mv)); Cm.unshift(mean(lv)); } }
    const D = [Math.abs(vol[t] - A[0]), Math.abs(vol[t] - B[0]), Math.abs(vol[t] - Cm[0])], Cn = [A[0], B[0], Cm[0]]; let k = -1, m = Infinity; for (let j = 0; j < 3; j++) if (fin(D[j]) && D[j] < m) { m = D[j]; k = j; } cen[t] = k < 0 ? NaN : Cn[k]; }
  let pLo = NaN, pUp = NaN, pST = NaN;   // 함수 안 줄들의 앞 봉 값(마지막 대입 뒤)
  for (let t = 0; t < n; t++) { const src = (H[t] + L[t]) / 2, a = cen[t]; let ub = src + 3 * a, lb = src - 3 * a; const pl = fin(pLo) ? pLo : 0, pu = fin(pUp) ? pUp : 0, c1 = t > 0 ? C[t - 1] : NaN;
    lb = (lb > pl || c1 < pl) ? lb : pl; ub = (ub < pu || c1 > pu) ? ub : pu; let d;
    if (!(t > 0 && fin(cen[t - 1]))) d = 1; else if (fin(pST) && pST === pu) d = C[t] > ub ? -1 : 1; else d = C[t] < lb ? 1 : -1;
    const st = d === -1 ? lb : ub; dir[t] = d; pLo = lb; pUp = ub; pST = st; }
  return { dir, cen, capHit }; }
// 🧠 MLMI(Zeiierman) — MA 교차 때만 (rsi_slow · rsi_quick · 종가) 저장 · k-NN 합(k 200)
function mlmiPred(C) { const n = C.length, mq = wma(C, 5), ms = wma(C, 20), rq = wma(rsi(C, 5), 20), rs = wma(rsi(C, 20), 20), P1 = [0], P2 = [0], PR = [0], RE = [0], pred = new Float64Array(n);
  for (let t = 0; t < n; t++) { if (xOver(mq, ms, t) || xUnder(mq, ms, t)) { const z = P1.length - 1; P1.push(P1[z]); P2.push(P2[z]); PR.push(PR[z]); RE.push(C[t] >= PR[PR.length - 1] ? 1 : -1); P1[P1.length - 1] = rs[t]; P2[P2.length - 1] = rq[t]; PR[PR.length - 1] = C[t]; }
    const D = P1.map((p, i) => Math.sqrt(Math.pow(rs[t] - p, 2) + Math.pow(rq[t] - P2[i], 2))), S = D.filter(fin).sort((x, y) => x - y).concat(D.filter(x => !fin(x))), sel = S.slice(0, Math.min(200, S.length)), fs = sel.filter(fin), mx = fs.length ? Math.max.apply(null, fs) : NaN;
    let s = 0; for (let i = 0; i < D.length; i++) if (fin(D[i]) && D[i] <= mx) s += RE[i]; pred[t] = s; }
  return pred; }
// 🧠 kNN 전략(capissimo v4) — 지표 All · 거름 Both · barlife 는 지난 봉에서 늘 참(첫 봉만 na)
function knnsSig(rows) { const n = rows.length, C = rows.map(r => r.close), H = rows.map(r => r.high), L = rows.map(r => r.low), V = rows.map(r => r.volume || 0), k = Math.floor(Math.sqrt(63));
  const scale = (x, p) => { const lo = lowest(x, p), hi = highest(x, p), o = new Float64Array(n); for (let t = 0; t < n; t++) { const d = hi[t] - lo[t]; o[t] = (fin(x[t]) && fin(lo[t]) && fin(hi[t]) && d !== 0) ? (x[t] - lo[t]) / d : NaN; } return o; };
  const roc = (s, p) => lagD(s, p, (a, b) => b !== 0 ? 100 * (a - b) / b : NaN), mom = (s, p) => lagD(s, p, (a, b) => a - b);
  const msc = (p) => { const s = scale(mom(C, p), 63), o = new Float64Array(n); for (let t = 0; t < n; t++) o[t] = s[t] * 100; return o; };   // 최고 · 최저 = 창 안 na 건너뜀(offline/_pta.js 약속)
  const avg4 = (a, b, c, d) => { const o = new Float64Array(n); for (let t = 0; t < n; t++) o[t] = (fin(a[t]) && fin(b[t]) && fin(c[t]) && fin(d[t])) ? (a[t] + b[t] + c[t] + d[t]) / 4 : NaN; return o; };
  const f1 = avg4(rsi(C, 28), roc(C, 28), cci(C, 28), msc(28)), f2 = avg4(rsi(C, 14), roc(C, 14), cci(C, 14), msc(14));
  const a1 = atr(H, L, C, 1), a10 = atr(H, L, C, 10), ho = hma(rsi(V, 14), 10), F1 = [], F2 = [], DI = [], PRD = [], sig = new Int8Array(n), B = new Uint8Array(n), S = new Uint8Array(n);
  for (let t = 0; t < n; t++) { const cls = t > 0 ? (C[t - 1] < C[t] ? -1 : C[t - 1] > C[t] ? 1 : 0) : 0; F1.push(f1[t]); F2.push(f2[t]); DI.push(cls);
    let mxd = -999; for (let i = 0; i < F1.length; i++) { const d = Math.sqrt(Math.pow(f1[t] - F1[i], 2) + Math.pow(f2[t] - F2[i], 2)); if (d > mxd) { mxd = d; if (PRD.length >= k) PRD.shift(); PRD.push(DI[i]); } }
    let pr = 0; for (const v of PRD) pr += v; const flt = a1[t] > a10[t] && ho[t] > 49, bl = t > 0, prev = t > 0 ? sig[t - 1] : 0;
    sig[t] = (pr > 0 && bl && flt) ? 1 : (pr < 0 && bl && flt) ? -1 : prev;
    if (t > 0 && sig[t] !== sig[t - 1]) { if (sig[t] === 1) B[t] = 1; if (sig[t] === -1) S[t] = 1; } }
  return { B, S }; }
// 🧠 로지스틱 회귀(capissimo v3) — 기본값: 가설 = sigmoid(Σ₃ X·0) = 0.5 · loss = −⅓ Σ₃(Σ₃ Y(ln h + 1 − Y) · ln(1 − h)) · 2봉 최소~최대로 늘임 · 종가와 비교
function logrSig(C) { const n = C.length, h = sumN(new Float64Array(n), 3).map(z => fin(z) ? 1 / (1 + Math.exp(-z)) : NaN), w = new Float64Array(n), u = new Float64Array(n);
  for (let t = 0; t < n; t++) w[t] = C[t] * (Math.log(h[t]) + (1 - C[t])); const inner = sumN(w, 3); for (let t = 0; t < n; t++) u[t] = inner[t] * Math.log(1 - h[t]);
  const outer = sumN(u, 3), loss = outer.map(z => -1 / 3 * z), lH = highest(loss, 2), lL = lowest(loss, 2), cH = highest(C, 2), cL = lowest(C, 2), sig = new Int8Array(n), B = new Uint8Array(n), S = new Uint8Array(n);
  for (let t = 0; t < n; t++) { const ok = t >= 1 && fin(loss[t]) && fin(loss[t - 1]), d = lH[t] - lL[t], sl = (ok && d !== 0) ? (cH[t] - cL[t]) * (loss[t] - lL[t]) / d + cL[t] : NaN, prev = t > 0 ? sig[t - 1] : 0;
    sig[t] = (fin(sl) && C[t] < sl) ? -1 : (fin(sl) && C[t] > sl) ? 1 : prev;
    if (t > 0 && sig[t] !== sig[t - 1]) { if (sig[t] === 1) B[t] = 1; if (sig[t] === -1) S[t] = 1; } }
  return { B, S }; }
function labChips(rows, intra) { const n = rows.length, O = rows.map(r => r.open), H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), V = rows.map(r => r.volume || 0), hlc3 = rows.map(r => (r.high + r.low + r.close) / 3);
  const buy = {}, sell = {}; CHIP_IDS.forEach(id => { buy[id] = new Uint8Array(n); sell[id] = new Uint8Array(n); }); const info = {};
  { const A = atr(H, L, C, 10), ts = new Float64Array(n); // ut
    for (let t = 0; t < n; t++) { const p = (t > 0 && fin(ts[t - 1])) ? ts[t - 1] : 0, loss = A[t]; if (!fin(loss)) { ts[t] = NaN; continue; } const c = C[t], c1 = t > 0 ? C[t - 1] : NaN;
      ts[t] = (c > p && c1 > p) ? Math.max(p, c - loss) : (c < p && c1 < p) ? Math.min(p, c + loss) : (c > p ? c - loss : c + loss); }
    for (let t = 1; t < n; t++) if (fin(ts[t]) && fin(ts[t - 1])) { if (C[t] < ts[t] && ts[t - 1] <= C[t - 1]) sell.ut[t] = 1; if (C[t] > ts[t] && C[t - 1] <= ts[t - 1]) buy.ut[t] = 1; } }
  { const hh = highest(H, 20), ll = lowest(L, 20), sm = sma(C, 20), x = new Float64Array(n); for (let t = 0; t < n; t++) x[t] = C[t] - ((hh[t] + ll[t]) / 2 + sm[t]) / 2; // sqz
    const val = linreg(x, 20), z = new Float64Array(n); for (let t = 1; t < n; t++) { if (xUnder(val, z, t)) sell.sqz[t] = 1; if (xOver(val, z, t)) buy.sqz[t] = 1; } }
  { const mf = new Float64Array(n).fill(NaN); for (let t = 19; t < n; t++) { let a = 0, v = 0; for (let j = t - 19; j <= t; j++) { a += H[j] === L[j] ? 0 : ((2 * C[j] - L[j] - H[j]) / (H[j] - L[j])) * V[j]; v += V[j]; } mf[t] = v > 0 ? a / v : NaN; } // cmf
    const z = new Float64Array(n); for (let t = 1; t < n; t++) { if (xUnder(mf, z, t)) sell.cmf[t] = 1; if (xOver(mf, z, t)) buy.cmf[t] = 1; } }
  { const lo = lowest(L, 15), hi = highest(H, 15); for (let t = 2; t < n; t++) { if (fin(lo[t - 1]) && fin(lo[t - 2]) && C[t] < lo[t - 1] && C[t - 1] >= lo[t - 2]) sell.don[t] = 1; if (fin(hi[t - 1]) && fin(hi[t - 2]) && C[t] > hi[t - 1] && C[t - 1] <= hi[t - 2]) buy.don[t] = 1; } } // don
  { const cc = cci(C, 5), x = cc.map(v => 0.1 * (v / 4)), v = wma(x, 9), inv = v.map(q => (Math.exp(2 * q) - 1) / (Math.exp(2 * q) + 1)), h = new Float64Array(n).fill(0.5), l = new Float64Array(n).fill(-0.5); // ift
    for (let t = 1; t < n; t++) { if (xUnder(inv, h, t)) sell.ift[t] = 1; if (xOver(inv, l, t)) buy.ift[t] = 1; } }
  { const Z = LZ_lorentz({ O, H, L, C }); for (let t = 0; t < n; t++) { if (Z.sell[t]) sell.lz[t] = 1; if (Z.buy[t]) buy.lz[t] = 1; } } // lz
  { const R = RK_sigOf(rows); for (let t = 0; t < n; t++) { if (R.PS[t]) sell.rk[t] = 1; if (R.PB[t]) buy.rk[t] = 1; } } // rk
  { const legOf = sz => { const lg = new Int8Array(n); let st = 0; for (let t = 0; t < n; t++) { if (t >= sz) { let hh = -Infinity, ll = Infinity; for (let j = t - sz + 1; j <= t; j++) { if (H[j] > hh) hh = H[j]; if (L[j] < ll) ll = L[j]; } if (H[t - sz] > hh) st = 0; else if (L[t - sz] < ll) st = 1; } lg[t] = st; } return lg; }; // smc
    const gS = legOf(50), gI = legOf(5), sHi = new Float64Array(n), sLo = new Float64Array(n), iHi = new Float64Array(n), iLo = new Float64Array(n);
    let swH = NaN, swL = NaN, inH = NaN, inL = NaN, swHx = false, swLx = false, inHx = false, inLx = false, swB = 0, inB = 0;
    for (let t = 0; t < n; t++) {
      if (t > 0) { const cs = gS[t] - gS[t - 1], ci = gI[t] - gI[t - 1];
        if (cs === 1) { swL = L[t - 50]; swLx = false; } else if (cs === -1) { swH = H[t - 50]; swHx = false; }
        if (ci === 1) { inL = L[t - 5]; inLx = false; } else if (ci === -1) { inH = H[t - 5]; inHx = false; } }
      sHi[t] = swH; sLo[t] = swL; iHi[t] = inH; iLo[t] = inL;
      let ch = false, cb = false;
      if (xOver(C, iHi, t) && !inHx && neq(inH, swH)) { if (inB === -1) cb = true; inHx = true; inB = 1; }
      if (xUnder(C, iLo, t) && !inLx && neq(inL, swL)) { if (inB === 1) ch = true; inLx = true; inB = -1; }
      if (xOver(C, sHi, t) && !swHx) { if (swB === -1) cb = true; swHx = true; swB = 1; }
      if (xUnder(C, sLo, t) && !swLx) { if (swB === 1) ch = true; swLx = true; swB = -1; }
      if (ch) sell.smc[t] = 1; if (cb) buy.smc[t] = 1; } }
  { const pl = pivotLow(L, 15, 15), ph = pivotHigh(H, 15, 15), sr = new Float64Array(n), rr = new Float64Array(n); let last = NaN, lastH = NaN; for (let t = 0; t < n; t++) { const v = t > 0 ? pl[t - 1] : NaN, w = t > 0 ? ph[t - 1] : NaN; if (fin(v)) last = v; if (fin(w)) lastH = w; sr[t] = last; rr[t] = lastH; } // srb
    const e5 = ema(V, 5), e10 = ema(V, 10); for (let t = 1; t < n; t++) { const osc = (fin(e5[t]) && fin(e10[t]) && e10[t] !== 0) ? 100 * (e5[t] - e10[t]) / e10[t] : NaN; if (xUnder(C, sr, t) && osc > 20) sell.srb[t] = 1; if (xOver(C, rr, t) && osc > 20) buy.srb[t] = 1; } }
  { const vw = new Float64Array(n), A = atr(H, L, C, 14), hh = highest(H, 20), ll = lowest(L, 20); let k0 = null, sp = 0, sv = 0, lastB = 0, lastU = 0; // vwd
    for (let t = 0; t < n; t++) { const k = dayKey(rows[t].date, intra); if (t === 0 || k !== k0) { sp = 0; sv = 0; k0 = k; } sp += hlc3[t] * V[t]; sv += V[t]; vw[t] = sv > 0 ? sp / sv : NaN;
      if (t < 6) continue; let gaps = false; for (let i = 0; i <= 5; i++) if (Math.abs(O[t - i] - C[t - i - 1]) > A[t]) gaps = true;
      const loss5 = H[t - 5] - L[t], gain5 = H[t] - L[t - 5], wide = hh[t] - ll[t] > A[t] * 2;
      let b = C[t] < C[t - 1] && fin(vw[t]) && fin(vw[t - 1]) && vw[t] > vw[t - 1] && fin(A[t]) && loss5 > A[t] * 3 && (t - lastB > 15 || (wide && t - lastB > 10));
      let u = C[t] > C[t - 1] && fin(vw[t]) && fin(vw[t - 1]) && vw[t] < vw[t - 1] && fin(A[t]) && gain5 > A[t] * 3 && (t - lastU > 15 || (wide && t - lastU > 10));
      if (gaps) { b = false; u = false; } if (b) { sell.vwd[t] = 1; lastB = t; } if (u) { buy.vwd[t] = 1; lastU = t; } } }
  { const esa = ema(hlc3, 10), ab = hlc3.map((v, t) => fin(esa[t]) ? Math.abs(v - esa[t]) : NaN), d = ema(ab, 10), ci = hlc3.map((v, t) => (fin(d[t]) && d[t] !== 0) ? (v - esa[t]) / (0.015 * d[t]) : NaN), w1 = ema(ci, 21), w2 = sma(w1, 4); // wt
    for (let t = 1; t < n; t++) { if (xUnder(w1, w2, t) && w2[t] > 53) sell.wt[t] = 1; if (xOver(w1, w2, t) && w2[t] < -53) buy.wt[t] = 1; } }
  { const e12 = ema(C, 12), e26 = ema(C, 26), m = new Float64Array(n); for (let t = 0; t < n; t++) m[t] = e12[t] - e26[t]; const sg = ema(m, 9); let last = null; // macd
    for (let t = 1; t < n; t++) { const bu = xOver(m, sg, t), be = xUnder(m, sg, t), ok = last === null || t - last > 3; if (be && ok) sell.macd[t] = 1; if (bu && ok) buy.macd[t] = 1; if ((bu && ok) || (be && ok)) last = t; } }
  { const R = astDir(H, L, C); info.astCap = R.capHit; for (let t = 1; t < n; t++) { if (R.dir[t] === -1 && R.dir[t - 1] === 1) buy.ast[t] = 1; if (R.dir[t] === 1 && R.dir[t - 1] === -1) sell.ast[t] = 1; } } // ast
  { const p = mlmiPred(C), z = new Float64Array(n); for (let t = 1; t < n; t++) { if (xOver(p, z, t)) buy.mlmi[t] = 1; if (xUnder(p, z, t)) sell.mlmi[t] = 1; } } // mlmi
  { const R = knnsSig(rows); buy.knns = R.B; sell.knns = R.S; } // knns
  { const R = logrSig(C); buy.logr = R.B; sell.logr = R.S; } // logr
  { const e1 = ema(C, 50), e2 = ema(C, 200), s = new Float64Array(n), z = new Float64Array(n); for (let t = 0; t < n; t++) s[t] = (e1[t] > e2[t]) ? 1 : -1; for (let t = 1; t < n; t++) { if (xOver(s, z, t)) buy.ptp[t] = 1; if (xUnder(s, z, t)) sell.ptp[t] = 1; } } // ptp
  return { buy, sell, info }; }
// ── 카드 셈(PREREG_S1854 §1) — 묶기 · 적중률 · 기준율 · 무작위 9벌 · 겹침 뺀 수 · 종목 고르기 · 평균 로그 수익 ──
const LAB_S0 = 200, LAB_NR = 9;
function labRng(key) { let h = 2166136261 >>> 0; const s = String(key); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } let a = h; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }   // FNV-1a → mulberry32(⚖️ 배지와 같은 꼴)
// 묶기 — 신호[t] = (켠 칩 중 t 에 뜬 것 있음) 그리고 (t − W + 1 … t 안에 한 번이라도 뜬 켠 칩 수 ≥ K)
function labComb(S, ids, K, W) { const m = ids.length, n = m ? S[ids[0]].length : 0, o = new Uint8Array(n); if (!m) return o; K = Math.max(1, Math.min(m, K | 0)); W = Math.max(1, Math.min(20, W | 0));
  for (let t = 0; t < n; t++) { let now = false, c = 0; for (const id of ids) { const a = S[id]; if (a[t]) now = true; let f = false; for (let u = Math.max(0, t - W + 1); u <= t && !f; u++) if (a[u]) f = true; if (f) c++; } if (now && c >= K) o[t] = 1; } return o; }
// 판 하나 — P = [{ code, C(종가 줄), S: { buy:{id:Uint8Array}, sell:{…} } }] · o = { side, ids, K, W, N, key('lab|시장|봉|판') }
function labCard(P, o) { const side = o.side === 'sell' ? 'sell' : 'buy', N = Math.max(1, o.N | 0), hitOf = (a, b) => side === 'buy' ? b > a : b < a;
  let nE = 0, nB = 0, nSig = 0, nHit = 0, nStk = 0, sumAll = 0, sumSig = 0, ovN = 0, ovH = 0, stA = 0, stB = 0; const rq = new Array(LAB_NR).fill(0);
  for (const p of P) { const C = p.C, n = C.length, e = n - 1 - N; if (e < LAB_S0) continue; const sg = labComb(p.S[side], o.ids, o.K, o.W), el = [], hs = [];
    let ki = 0, hi = 0, bi = 0, last = -1e9;
    for (let t = LAB_S0; t <= e; t++) { const a = C[t], b = C[t + N]; if (!(fin(a) && fin(b) && a > 0 && b > 0) || a === b) continue; const h = hitOf(a, b); el.push(t); hs.push(h ? 1 : 0); if (h) bi++; sumAll += Math.log(b / a);
      if (sg[t]) { ki++; if (h) hi++; sumSig += Math.log(b / a); if (t >= last + N) { ovN++; if (h) ovH++; last = t; } } }
    if (!el.length) continue; nStk++; nE += el.length; nB += bi; nSig += ki; nHit += hi;
    if (ki >= 3) { stB++; if (hi / ki > bi / el.length) stA++; }
    if (ki > 0) { const m = el.length; for (let q = 0; q < LAB_NR; q++) { const rg = labRng(o.key + '|' + side + '|' + N + '|' + p.code + '|' + q), ix = Array.from({ length: m }, (_, i) => i); let c = 0;
        for (let i = 0; i < ki; i++) { const j = i + Math.floor(rg() * (m - i)); const tmp = ix[i]; ix[i] = ix[j]; ix[j] = tmp; c += hs[ix[i]]; } rq[q] += c; } } }
  const rate = nSig ? nHit / nSig : null, base = nE ? nB / nE : null, rr = nSig ? rq.map(c => c / nSig) : null, srt = rr ? rr.slice().sort((x, y) => x - y) : null;
  const rmin = srt ? srt[0] : null, rmax = srt ? srt[LAB_NR - 1] : null, rmed = srt ? srt[(LAB_NR - 1) / 2] : null;
  return { side, N, K: o.K, W: o.W, ids: o.ids.slice(), nStk, nE, base, nSig, nHit, rate, diff: (rate != null && base != null) ? rate - base : null, rq: rr, rmin, rmed, rmax,
    mark: rate == null ? null : (rate > rmax ? 'up' : (rate < rmin ? 'down' : 'in')), ovN, ovH, ovRate: ovN ? ovH / ovN : null, stA, stB, mSig: nSig ? sumSig / nSig : null, mAll: nE ? sumAll / nE : null }; }
if(typeof window!=='undefined') window.SXSigLab = { CHIP_IDS, chips: labChips, card: (typeof labCard==='function')?labCard:null, comb: (typeof labComb==='function')?labComb:null };
if(typeof module!=='undefined' && module.exports) module.exports = { CHIP_IDS, labChips, astDir, mlmiPred, knnsSig, logrSig, labCard, labComb };
})();
