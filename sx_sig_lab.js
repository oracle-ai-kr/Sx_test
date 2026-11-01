// [S1858] 🧪 신호 실험 칩 31(17 + 새 14) — 조립 = offline/mlsig2/gen_lab2.js · 정의 = offline/bat/PREREG_S1858_siglab2.md §0 · 새 칩 출처 = offline/mlsig2/sources2.md · 앞 17칩 = 아래 S1854 조립 바이트 그대로(b0321cf1c503)
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
// ── chips_g1a.js(4a1b4c2bd399) 글자 그대로 — module.exports 한 줄만 뺌 ──
const G1A = (function(){
// chips_g1a.js — 묶음 g1a · 🧪 신호 실험 카드 새 칩 넷(st3x · jst · stx · vwst · 모두 슈퍼트렌드 계열) · S1858 준비 · 측정 전용 · 2026-11-01
//   약속: <id>Sig(rows, intra, T) → { B, S, info } · B · S = Uint8Array(n) · 1 = 그 봉에 신호 · T = offline/_pta.js 함수 묶음(fin · ema · rsi · atr 를 씀)
//   정의 = defs_g1a.md(원문 파인을 봉마다 그대로 · 다르게 둔 곳 적음) · 원문 = offline/mlsig2/src/ · 읽기 도움 · 판정 아님 · 성적 주장 없음
//   앞 측정 함수는 글자 그대로(줄 앞 빈칸까지) 칩 함수 안에 넣었다 — 칩끼리 · 다른 묶음과 이름이 겹치지 않게 · pineST 는 앞 측정이 쓰던 이름 T_ 로 T 를 받는다.
//   네 칩 모두 하루 경계 · 세션을 쓰지 않는다(intra 안 씀).

// ── st3x · 3x SuperTrend Strategy (Mel0nTek) V1 (원문 31c39c825833 · 파인 v4 · 라이선스 줄 없음) ──
//   매수 = 원문 plotshape 'BUY' · alertcondition '3xST Buy alert' = longCondition · 매도 = plotshape 'SELL' · '3xST SELL alert' = shortCondition
//   longCondition  = (EMA200 < 종가) and K < 20 and crossover(K, D) and (빠름 + 보통 + 느림 추세 ≥ 1)
//   shortCondition = not(EMA200 < 종가) and K > 80 and crossunder(K, D) and (추세 합 ≤ −1) — EMA 가 na 인 봉은 원문 식대로 숏 쪽(emaTrend = −1)
//   슈퍼트렌드 셋 = 원문 superTrend()(KivancOzbilgic 식 · 앞 봉 띠와 비교 · hl2 · 와일더 ATR) = meas_sx.js stLineC · (12, 3) · (11, 2) · (10, 1)
//   스토캐스틱 RSI(3, 3, 14, 14, 종가) = meas_sx.js stochRsi · EMA200 = T.ema(첫 값 = 첫 200개 평균 · 그 전 na — meas_sx.js emaP(첫 값 = 첫 종가)는 안 씀)
function st3xSig(rows, intra, T) {
  // ↓ 글자 그대로: /home/claude/work/offline/stsrx/meas_sx.js (6112986c5d33) 63~69줄 stLineC · 73~78줄 rsiW · smaN · stochRsi
function stLineC(H, L, Cc, P, M, center) { const n = Cc.length, atr = new Array(n).fill(null), dir = new Array(n).fill(0), UP = new Array(n).fill(null), DN = new Array(n).fill(null); let s = 0, started = false;
  for (let i = 0; i < n; i++) { const tr = i ? Math.max(H[i] - L[i], Math.abs(H[i] - Cc[i - 1]), Math.abs(L[i] - Cc[i - 1])) : (H[i] - L[i]); if (i < P) { s += tr; if (i === P - 1) atr[i] = s / P; } else atr[i] = (atr[i - 1] * (P - 1) + tr) / P; }
  for (let i = 0; i < n; i++) { if (atr[i] == null) continue; const mid = center ? center[i] : (H[i] + L[i]) / 2; let up = mid - M * atr[i], dn = mid + M * atr[i];
    if (!started) { UP[i] = up; DN[i] = dn; dir[i] = 1; started = true; continue; }
    const up1 = UP[i - 1], dn1 = DN[i - 1]; if (Cc[i - 1] > up1) up = Math.max(up, up1); if (Cc[i - 1] < dn1) dn = Math.min(dn, dn1); UP[i] = up; DN[i] = dn;
    const d1 = dir[i - 1]; dir[i] = (d1 === -1 && Cc[i] > dn1) ? 1 : ((d1 === 1 && Cc[i] < up1) ? -1 : d1); }
  return { atr, dir, UP, DN, st: P - 1 }; }
function rsiW(Cc, P) { const n = Cc.length, o = new Array(n).fill(null); if (n <= P) return o; let au = 0, ad = 0; for (let i = 1; i <= P; i++) { const d = Cc[i] - Cc[i - 1]; au += Math.max(d, 0); ad += Math.max(-d, 0); } au /= P; ad /= P;
  const val = () => ad === 0 ? 100 : (au === 0 ? 0 : 100 - 100 / (1 + au / ad)); o[P] = val();
  for (let i = P + 1; i < n; i++) { const d = Cc[i] - Cc[i - 1]; au = (au * (P - 1) + Math.max(d, 0)) / P; ad = (ad * (P - 1) + Math.max(-d, 0)) / P; o[i] = val(); } return o; }
function smaN(x, len) { const n = x.length, o = new Array(n).fill(null); for (let i = len - 1; i < n; i++) { let s = 0, ok = true; for (let j = i - len + 1; j <= i; j++) { if (x[j] == null) { ok = false; break; } s += x[j]; } if (ok) o[i] = s / len; } return o; }
function stochRsi(Cc) { const R = rsiW(Cc, 14), n = Cc.length, st = new Array(n).fill(null); for (let i = 13; i < n; i++) { let hh = -Infinity, ll = Infinity, ok = true; for (let j = i - 13; j <= i; j++) { if (R[j] == null) { ok = false; break; } if (R[j] > hh) hh = R[j]; if (R[j] < ll) ll = R[j]; } if (ok && hh > ll) st[i] = 100 * (R[i] - ll) / (hh - ll); }
  const K = smaN(st, 3), D = smaN(K, 3); return { R, K, D }; }
  const n = rows.length, H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close);
  const s1 = stLineC(H, L, C, 12, 3, null), s2 = stLineC(H, L, C, 11, 2, null), s3 = stLineC(H, L, C, 10, 1, null), E = T.ema(C, 200), SR = stochRsi(C), K = SR.K, D = SR.D;
  const B = new Uint8Array(n), S = new Uint8Array(n); let sEmaNa = 0;
  for (let t = 1; t < n; t++) {
    if (K[t] == null || D[t] == null || K[t - 1] == null || D[t - 1] == null) continue;   // K · D 의 na = null · na 와의 비교는 거짓
    const cnt = s1.dir[t] + s2.dir[t] + s3.dir[t], emaUp = E[t] < C[t];                    // 원문 stCount · emaTrend = emaVal < close ? 1 : −1 (na · 같음 → −1)
    if (emaUp && K[t] < 20 && K[t] > D[t] && K[t - 1] <= D[t - 1] && cnt >= 1) B[t] = 1;
    if (!emaUp && K[t] > 80 && K[t] < D[t] && K[t - 1] >= D[t - 1] && cnt <= -1) { S[t] = 1; if (!T.fin(E[t])) sEmaNa++; } }
  return { B, S, info: { sEmaNa } }; }

// ── jst · Supertrend (JS_TechTrading) (원문 284126d1f593 · 파인 v5 · MPL 2.0) ──
//   원문 기본: 'Pullback' · ta.supertrend(3.0, 10) · EMA200 거름 켬 · RSI14 거름 켬(매수 ≥ 50 · 매도 ≤ 50) · 방향 Both · 손절 1% · 익절 1% · 기간 2005-01-01 ~ 2045-03-01
//   매수 = 원문 strategy.entry('long') 이 나가는 봉 = buy_cond and strategy.position_size == 0 · 매도 = strategy.entry('short') = sell_cond and position_size == 0
//   buy_cond  = ta.crossunder(low[1], long) and long and high > high[1] and RSI ≥ 50 and close > EMA200   (long  = 방향 < 0 ? ST 선 : na)
//   sell_cond = ta.crossover(high[1], short) and short and low < low[1] and RSI ≤ 50 and close < EMA200  (short = 방향 < 0 ? na : ST 선)
//   진입이 '포지션 없을 때만' 이라 포지션을 원문대로 흉내 낸다: 다음 봉 시가 체결 · 그다음 봉부터 체결가 ±1% 에 닿으면 그 봉에 빈 손(그 봉 종가 때 다시 진입 가능)
//   crossunder(low[1], long) 는 원문 글자 그대로 = low[t−1] < long[t] 이고 low[t−2] ≥ long[t−1] (앞 측정 ST1 은 같은 봉끼리로 고쳤었다 — 칩은 원문대로)
function jstSig(rows, intra, T) {
  const T_ = T;
  // ↓ 글자 그대로: /home/claude/work/offline/fluxpv/meas_pv.js (cfae5d8825ad) 93~98줄 pineST(파인 ta.supertrend 내장 식 · 검산 check_pv.py 다름 0)
function pineST(H, L, Cc, P, M) { const n = Cc.length, atr = T_.atr(H, L, Cc, P), d = new Float64Array(n), u = new Float64Array(n), st = new Float64Array(n), pd = new Int8Array(n);
  for (let t = 0; t < n; t++) { const src = (H[t] + L[t]) / 2, ur = src + M * atr[t], dr = src - M * atr[t], pD = (t > 0 && isFinite(d[t - 1])) ? d[t - 1] : 0, pU = (t > 0 && isFinite(u[t - 1])) ? u[t - 1] : 0, c1 = t > 0 ? Cc[t - 1] : NaN;
    d[t] = (dr > pD || c1 < pD) ? dr : pD; u[t] = (ur < pU || c1 > pU) ? ur : pU;
    if (t === 0 || !isFinite(atr[t - 1])) pd[t] = 1; else if (st[t - 1] === pU) pd[t] = Cc[t] > u[t] ? -1 : 1; else pd[t] = Cc[t] < d[t] ? 1 : -1;
    st[t] = pd[t] === -1 ? d[t] : u[t]; }
  return { st, pd, atr }; }
  const n = rows.length, O = rows.map(r => r.open), H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), fin = T.fin;
  const PS = pineST(H, L, C, 10, 3.0), E = T.ema(C, 200), R = T.rsi(C, 14), lng = new Float64Array(n), sht = new Float64Array(n);
  for (let t = 0; t < n; t++) { lng[t] = PS.pd[t] < 0 ? PS.st[t] : NaN; sht[t] = PS.pd[t] < 0 ? NaN : PS.st[t]; }
  const tru = x => fin(x) && x !== 0;   // 파인 v5: 수를 참 · 거짓으로 쓰면 na · 0 은 거짓
  const bc = new Uint8Array(n), sc = new Uint8Array(n); let rawB = 0, rawS = 0;
  for (let t = 2; t < n; t++) {
    const pb = L[t - 1] < lng[t] && L[t - 2] >= lng[t - 1] && tru(lng[t]) && H[t] > H[t - 1];   // NaN 과의 비교는 거짓
    const ps = H[t - 1] > sht[t] && H[t - 2] <= sht[t - 1] && tru(sht[t]) && L[t] < L[t - 1];
    if (pb && R[t] >= 50 && C[t] > E[t]) { bc[t] = 1; rawB++; }
    if (ps && R[t] <= 50 && C[t] < E[t]) { sc[t] = 1; rawS++; } }
  // 포지션 흉내 — process_orders_on_close = false(봉 t 종가의 주문 → t+1 시가 체결) · strategy.exit 는 체결 봉 종가에 처음 걸려 그다음 봉부터 봄
  //   롱: 저가 ≤ 평균가 × (1 − 0.01) 또는 고가 ≥ 평균가 × (1 + 0.01) 이면 그 봉에 청산 · 숏: 고가 ≥ 평균가 × (1 + 0.01) 또는 저가 ≤ 평균가 × (1 − 0.01) · 평균가 = 체결 시가
  const B = new Uint8Array(n), S = new Uint8Array(n), stopPer = 1.0 / 100, takePer = 1.0 / 100; let pos = 0, avg = NaN, eBar = -1, pend = 0, exits = 0;
  for (let t = 0; t < n; t++) {
    if (pend !== 0) { pos = pend; avg = O[t]; eBar = t; pend = 0; }
    else if (pos > 0 && t > eBar) { if (L[t] <= avg * (1 - stopPer) || H[t] >= avg * (1 + takePer)) { pos = 0; exits++; } }
    else if (pos < 0 && t > eBar) { if (H[t] >= avg * (1 + stopPer) || L[t] <= avg * (1 - takePer)) { pos = 0; exits++; } }
    if (bc[t] && pos === 0) { B[t] = 1; pend = 1; }
    if (sc[t] && pos === 0) { S[t] = 1; pend = -1; } }
  return { B, S, info: { rawB, rawS, exits } }; }

// ── stx · SuperTrend Strategy with Trend-Based Exits (원문 ea806da807d7 · 파인 v6 · 작성자 · 라이선스 줄 없음) ──
//   원문 기본 ta.supertrend(4.6, 92)(원문 주석: ETH 맞춤 값 — 그래도 원문 기본값 그대로)
//   매수 = isNewDirection and direction == −1 (strategy.entry 'Long') · 매도 = isNewDirection and direction == 1 (strategy.entry 'Short')
//   isNewDirection = na(lastDirection) or direction != lastDirection (var · 그 봉에 갱신) → 첫 봉(0)은 늘 참이고 방향 1 → 0 봉에 매도 1
//   원문 position_size ≤ 0 · ≥ 0 조건은 원문 주문 흐름에서 뒤집힘 봉마다 늘 참이라 따로 흉내 내지 않음(defs_g1a.md 에 까닭) · ST 선 손절(strategy.exit)은 신호에 안 넣음
function stxSig(rows, intra, T) {
  const T_ = T;
  // ↓ 글자 그대로: /home/claude/work/offline/fluxpv/meas_pv.js (cfae5d8825ad) 93~98줄 pineST(파인 ta.supertrend 내장 식 · 검산 check_pv.py 다름 0)
function pineST(H, L, Cc, P, M) { const n = Cc.length, atr = T_.atr(H, L, Cc, P), d = new Float64Array(n), u = new Float64Array(n), st = new Float64Array(n), pd = new Int8Array(n);
  for (let t = 0; t < n; t++) { const src = (H[t] + L[t]) / 2, ur = src + M * atr[t], dr = src - M * atr[t], pD = (t > 0 && isFinite(d[t - 1])) ? d[t - 1] : 0, pU = (t > 0 && isFinite(u[t - 1])) ? u[t - 1] : 0, c1 = t > 0 ? Cc[t - 1] : NaN;
    d[t] = (dr > pD || c1 < pD) ? dr : pD; u[t] = (ur < pU || c1 > pU) ? ur : pU;
    if (t === 0 || !isFinite(atr[t - 1])) pd[t] = 1; else if (st[t - 1] === pU) pd[t] = Cc[t] > u[t] ? -1 : 1; else pd[t] = Cc[t] < d[t] ? 1 : -1;
    st[t] = pd[t] === -1 ? d[t] : u[t]; }
  return { st, pd, atr }; }
  const n = rows.length, H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), PS = pineST(H, L, C, 92, 4.6);
  const B = new Uint8Array(n), S = new Uint8Array(n); let lastDirection = NaN;
  for (let t = 0; t < n; t++) { const d = PS.pd[t], isNew = !Number.isFinite(lastDirection) || d !== lastDirection;
    if (isNew) { if (d === -1) B[t] = 1; else if (d === 1) S[t] = 1; lastDirection = d; } }
  return { B, S, info: {} }; }

// ── vwst · Volume-Weighted Supertrend Strategy [wbburgin] (원문 9edf604f5cf3 · 파인 v5 · MPL 2.0) ──
//   원문 vwsupertrend(close, 10, 3.0, 10): 가운데 = 최근 10봉 거래량 가중 종가(그 봉 포함) · ATR10 · 띠 굳힘 · 방향은 ta.supertrend 와 같은 식(지금 띠와 종가 비교)
//   원문 Buy · Sell 표(buyconditions · sellconditions)는 거래량 슈퍼트렌드 u.supertrend_anysource(volume, 3, 10)(라이브러리 wbburgin/wbburgin_utils/2 · 소스 없음)가 있어야 한다 → 못 옮김
//   그래서 칩 = 원문 파일 안에 정의된 신호만: 매수 = 'Supertrend Up Start'(dir == −1 and dir[1] == 1) · 매도 = 'Supertrend Down Start'(dir == 1 and dir[1] == −1)
function vwstSig(rows, intra, T) {
  const T_ = T;
  // ↓ 글자 그대로: /home/claude/work/offline/stsrx/meas_sx.js (6112986c5d33) 70줄 vw10
function vw10(Cc, V) { const n = Cc.length, o = new Array(n); for (let i = 0; i < n; i++) { let a = 0, b = 0, c = 0, k = 0; for (let j = Math.max(0, i - 9); j <= i; j++) { a += Cc[j] * V[j]; b += V[j]; c += Cc[j]; k++; } o[i] = b > 0 ? a / b : c / k; } return o; }
  // ↓ /home/claude/work/offline/fluxpv/meas_pv.js (cfae5d8825ad) 93~98줄 pineST 에서 두 곳만 바꿈: 이름 · 인수 VW 더함 · 가운데 (H[t] + L[t]) / 2 → VW[t](원문 vwsupertrend 의 vwap)
function pineSTvw(H, L, Cc, P, M, VW) { const n = Cc.length, atr = T_.atr(H, L, Cc, P), d = new Float64Array(n), u = new Float64Array(n), st = new Float64Array(n), pd = new Int8Array(n);
  for (let t = 0; t < n; t++) { const src = VW[t], ur = src + M * atr[t], dr = src - M * atr[t], pD = (t > 0 && isFinite(d[t - 1])) ? d[t - 1] : 0, pU = (t > 0 && isFinite(u[t - 1])) ? u[t - 1] : 0, c1 = t > 0 ? Cc[t - 1] : NaN;
    d[t] = (dr > pD || c1 < pD) ? dr : pD; u[t] = (ur < pU || c1 > pU) ? ur : pU;
    if (t === 0 || !isFinite(atr[t - 1])) pd[t] = 1; else if (st[t - 1] === pU) pd[t] = Cc[t] > u[t] ? -1 : 1; else pd[t] = Cc[t] < d[t] ? 1 : -1;
    st[t] = pd[t] === -1 ? d[t] : u[t]; }
  return { st, pd, atr }; }
  const n = rows.length, H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), V = rows.map(r => r.volume || 0), w = vw10(C, V), VW = new Float64Array(n); let vwNa = 0;
  for (let i = 0; i < n; i++) { if (i < 9) { VW[i] = NaN; continue; } let b = 0; for (let j = i - 9; j <= i; j++) b += V[j]; VW[i] = b > 0 ? w[i] : NaN; if (!(b > 0)) vwNa++; }   // 원문: 10봉이 안 차면 na(src[i] 가 na) · 거래량 합 0 → 0 ÷ 0 = na(약속) — vw10 의 '앞 봉 줄임 · 종가 평균' 대신
  const PS = pineSTvw(H, L, C, 10, 3.0, VW), B = new Uint8Array(n), S = new Uint8Array(n);
  for (let t = 1; t < n; t++) { if (PS.pd[t] === -1 && PS.pd[t - 1] === 1) B[t] = 1; if (PS.pd[t] === 1 && PS.pd[t - 1] === -1) S[t] = 1; }
  return { B, S, info: { vwNa } }; }
return { st3xSig, jstSig, stxSig, vwstSig };
})();
// ── chips_g1b.js(9400671e185c) 글자 그대로 — module.exports 한 줄만 뺌 ──
const G1B = (function(){
// chips_g1b.js — 묶음 g1b · 🧪 신호 실험 카드 새 칩 둘(strv · stlr) · S1858 준비 · 측정 전용 · 2026-11-01
//   원문 둘 다: TradingView 공개 스크립트 · © fluxchart · Mozilla Public License 2.0 (정의 = defs_g1b.md)
//   약속: <id>Sig(rows, intra, T) → { B, S, info } · B · S = Uint8Array(n) · 1 = 그 봉에 신호 · T = offline/_pta.js 함수 묶음
//   앞 측정 함수는 글자 그대로(줄 앞 빈칸까지) 칩 함수 안에 넣었다 — 두 칩의 같은 이름(pineST)이 겹치지 않게 · 앞 측정이 쓰던 이름 T_ 로 T 를 받는다.
//   두 칩 모두 하루 경계 · 세션을 쓰지 않는다(intra 안 씀).

// ── strv · SuperTrend + Relative Volume (Kernel Optimized) | Flux Charts (원문 56cddce1298f) ──
//   매수 = 원문 alertcondition(bull_condition, "Bullish Trend") · 매도 = alertcondition(bear_condition, "Bearish Trend")
//   bull_condition = ta.crossover(close, ta.supertrend(3, 10) 선) and barstate.isconfirmed and threshold_condition (bear = crossunder)
//   원문 기본 activationThresholdEnabled = false → threshold_condition 늘 참 → 거래량 KDE 는 신호에 안 들어간다(= 종가가 ST 선을 교차한 봉)
//   gate(넷째 인수 · 생략 = 원문 기본 false): true 면 원문 'Enable Activation Threshold' 켬 = 그 봉 KDE 백분위 ≥ 0.70 일 때만(참고용 · 칩은 기본값)
function strvSig(rows, intra, T, gate) {
  const T_ = T;
  // ↓ 글자 그대로: /home/claude/work/offline/fluxpv/meas_pv.js (cfae5d8825ad) 93~123줄 — pineST 24139b10471d · emaSkip bcd754ca4dbe · KX · KC · kdeCum 86ead4dd13ba · nearIdx 5e6d98e7bcf3 · volProb 12b1e641d56f · gateOk
function pineST(H, L, Cc, P, M) { const n = Cc.length, atr = T_.atr(H, L, Cc, P), d = new Float64Array(n), u = new Float64Array(n), st = new Float64Array(n), pd = new Int8Array(n);
  for (let t = 0; t < n; t++) { const src = (H[t] + L[t]) / 2, ur = src + M * atr[t], dr = src - M * atr[t], pD = (t > 0 && isFinite(d[t - 1])) ? d[t - 1] : 0, pU = (t > 0 && isFinite(u[t - 1])) ? u[t - 1] : 0, c1 = t > 0 ? Cc[t - 1] : NaN;
    d[t] = (dr > pD || c1 < pD) ? dr : pD; u[t] = (ur < pU || c1 > pU) ? ur : pU;
    if (t === 0 || !isFinite(atr[t - 1])) pd[t] = 1; else if (st[t - 1] === pU) pd[t] = Cc[t] > u[t] ? -1 : 1; else pd[t] = Cc[t] < d[t] ? 1 : -1;
    st[t] = pd[t] === -1 ? d[t] : u[t]; }
  return { st, pd, atr }; }
// 값 없는 봉을 건너뛰는 EMA(첫 값 = 첫 n 개 단순 평균) · 그 봉 출력은 없음
function emaSkip(src, n) { const N = src.length, o = new Float64Array(N).fill(NaN), a = 2 / (n + 1); let cnt = 0, sum = 0, prev = NaN;
  for (let t = 0; t < N; t++) { const x = src[t]; if (!isFinite(x)) continue; if (!isFinite(prev)) { cnt++; sum += x; if (cnt === n) { prev = sum / n; o[t] = prev; } continue; } prev = a * x + (1 - a) * prev; o[t] = prev; }
  return o; }
const KX = Array.from({ length: 100 }, (_, i) => -3 + i * 0.06), KC = 1 / Math.sqrt(2 * Math.PI);
function kdeCum(A) { const m = A.reduce((s, v) => s + v, 0) / A.length; let vv = 0; for (const v of A) vv += (v - m) * (v - m); const sd = Math.sqrt(vv / A.length), Z = A.map(v => (v - m) / sd), Y = new Float64Array(100); let tot = 0;
  for (let i = 0; i < 100; i++) { let s = 0; for (const z of Z) { const q = (KX[i] - z) / 0.1; s += KC * Math.exp(-0.5 * q * q); } Y[i] = s; tot += s; }
  const S = new Float64Array(100); let c = 0; for (let i = 0; i < 100; i++) { c += Y[i] / tot; S[i] = c; } return { S, m, sd }; }
function nearIdx(v) { if (v <= KX[0]) return 0; if (v >= KX[99]) return 99; let lo = 0; for (let i = 0; i < 100; i++) if (KX[i] <= v) lo = i; const hi = KX[lo] === v ? lo : lo + 1; return (Math.abs(v - KX[lo]) < Math.abs(v - KX[hi])) ? lo : hi; }
// 백분위 열 · 돌파 · 순위 백분위(서술)
function volProb(B, line, up, dn) { const n = B.C.length, bv = new Float64Array(n), sv = new Float64Array(n);
  for (let t = 0; t < n; t++) { const r = B.H[t] - B.L[t]; if (r > 0) { bv[t] = B.V[t] * (B.C[t] - B.L[t]) / r; sv[t] = B.V[t] * (B.H[t] - B.C[t]) / r; } else { bv[t] = NaN; sv[t] = NaN; } }
  const bs = emaSkip(bv, 10), bl = emaSkip(bv, 25), ss = emaSkip(sv, 10), sl = emaSkip(sv, 25), bR = new Float64Array(n), sR = new Float64Array(n);
  for (let t = 0; t < n; t++) { bR[t] = (isFinite(bs[t]) && isFinite(bl[t]) && bl[t] !== 0) ? bs[t] / bl[t] : NaN; sR[t] = (isFinite(ss[t]) && isFinite(sl[t]) && sl[t] !== 0) ? ss[t] / sl[t] : NaN; }
  const bull = new Uint8Array(n), bear = new Uint8Array(n), prob = new Float64Array(n).fill(NaN), rank = new Float64Array(n).fill(NaN), Ab = [], Ad = []; let Kb = null, Kd = null, vp = NaN, rp = NaN;
  for (let t = 0; t < n; t++) {
    if (t >= 1 && isFinite(line[t]) && isFinite(line[t - 1])) { if (B.C[t] > line[t] && B.C[t - 1] <= line[t - 1]) bull[t] = 1; if (B.C[t] < line[t] && B.C[t - 1] >= line[t - 1]) bear[t] = 1; }
    if (bull[t] && isFinite(bR[t])) { if (Ab.length >= 100) Ab.shift(); Ab.push(bR[t]); Kb = kdeCum(Ab); }
    if (bear[t] && isFinite(sR[t])) { if (Ad.length >= 100) Ad.shift(); Ad.push(sR[t]); Kd = kdeCum(Ad); }
    const side = up[t] ? 1 : (dn[t] ? -1 : 0);
    if (side) { const Aa = side > 0 ? Ab : Ad, K = side > 0 ? Kb : Kd, x = side > 0 ? bR[t] : sR[t];
      if (Aa.length > 0) { const v = (x - K.m) / K.sd; if (isFinite(v) && isFinite(K.S[99])) vp = K.S[nearIdx(v)]; else vp = NaN; rp = isFinite(x) ? Aa.filter(a => a <= x).length / Aa.length : NaN; } }
    prob[t] = vp; rank[t] = rp; }
  return { bull, bear, prob, rank }; }
const gateOk = p => isFinite(p) && p >= 0.70;
  // ↑ 복사 끝
  const n = rows.length, bars = { O: rows.map(r => r.open), H: rows.map(r => r.high), L: rows.map(r => r.low), C: rows.map(r => r.close), V: rows.map(r => +r.volume || 0) };
  const PS = pineST(bars.H, bars.L, bars.C, 10, 3), st = PS.st, Cc = bars.C, B = new Uint8Array(n), S = new Uint8Array(n);
  // 원문 79 · 80줄: 교차 = 지금 종가와 선 · 앞 종가와 앞 선 네 값이 모두 수 · barstate.isconfirmed = 지난 봉은 늘 참(받은 봉은 모두 닫힌 봉으로 봄)
  for (let t = 1; t < n; t++) { if (!isFinite(st[t]) || !isFinite(st[t - 1])) continue;
    if (Cc[t] > st[t] && Cc[t - 1] <= st[t - 1]) B[t] = 1;
    if (Cc[t] < st[t] && Cc[t - 1] >= st[t - 1]) S[t] = 1; }
  const info = { gate: !!gate, flipDiffB: 0, flipDiffS: 0 };
  if (gate) { const VP = volProb(bars, st, Array.from(PS.pd, v => v === -1), Array.from(PS.pd, v => v === 1));   // 원문 196 · 197줄: bull_condition = bullishBreak and threshold_condition
    for (let t = 0; t < n; t++) { if (B[t] && !gateOk(VP.prob[t])) B[t] = 0; if (S[t] && !gateOk(VP.prob[t])) S[t] = 0; } }
  // 서술: ST 방향 뒤집힘(dir 1 → −1 · −1 → 1)과 다른 봉 수(게이트 꺼짐일 때 교차 ≠ 뒤집힘인 봉)
  for (let t = 1; t < n; t++) { const fu = PS.pd[t] === -1 && PS.pd[t - 1] === 1, fd = PS.pd[t] === 1 && PS.pd[t - 1] === -1; if (!!B[t] !== fu) info.flipDiffB++; if (!!S[t] !== fd) info.flipDiffS++; }
  return { B, S, info }; }

// ── stlr · SuperTrend Logistic Regression | Flux Charts (원문 04d49a199eca) ──
//   매수 = 원문 alertcondition(bullAlert, "Bull Flip") · 매도 = alertcondition(bearAlert, "Bear Flip")
//   bullAlert = 상승 뒤집힘(dir −1 · 앞 1) 이고 상승 모델에 풀린 신호 ≥ 15 이고 확률 × 100 ≥ minProb(기본 0 → 확률이 서면 참)
//   상승 모델 = 앞 측정 lrModel 그대로 · 하락 모델(앞 측정엔 없음) = lrModel 글자에서 이름과 '풀기' 한 줄만 바꾼 lrModelBear(원문 321줄 close < 진입가)
function stlrSig(rows, intra, T) {
  const T_ = T;
  // ↓ 글자 그대로: /home/claude/work/offline/stlr/meas_lr.js (0c27d3b999b7) 55~87줄 — pineST 24139b10471d(fluxpv 것과 같은 글자) · 상수 두 줄 · lrModel 2ce1e0ffde43 · train 0f29502f6d58
function pineST(H, L, Cc, P, M) { const n = Cc.length, atr = T_.atr(H, L, Cc, P), d = new Float64Array(n), u = new Float64Array(n), st = new Float64Array(n), pd = new Int8Array(n);
  for (let t = 0; t < n; t++) { const src = (H[t] + L[t]) / 2, ur = src + M * atr[t], dr = src - M * atr[t], pD = (t > 0 && isFinite(d[t - 1])) ? d[t - 1] : 0, pU = (t > 0 && isFinite(u[t - 1])) ? u[t - 1] : 0, c1 = t > 0 ? Cc[t - 1] : NaN;
    d[t] = (dr > pD || c1 < pD) ? dr : pD; u[t] = (ur < pU || c1 > pU) ? ur : pU;
    if (t === 0 || !isFinite(atr[t - 1])) pd[t] = 1; else if (st[t - 1] === pU) pd[t] = Cc[t] > u[t] ? -1 : 1; else pd[t] = Cc[t] < d[t] ? 1 : -1;
    st[t] = pd[t] === -1 ? d[t] : u[t]; }
  return { st, pd, atr }; }
const NF = 14, LB = 20, TRW = 200, DEC = 0.97, LRT = 0.05, EP = 30, MINS = 15, LAM = 0.01, CLIP = 10, MAXH = 500;
const cl1 = x => Math.max(-1, Math.min(1, x)), nc = (v, a) => a > 0 ? cl1(v / a - 1) : 0, sigm = z => 1 / (1 + Math.exp(-Math.max(Math.min(z, 15), -15)));
// bullF · bearF(t) = 그 봉이 상승 · 하락 뒤집힘 · line[t] = ST 선 · A = 특징 ATR 줄
function lrModel(B, bullF, bearF, line, A) { const n = B.C.length, O = B.O, H = B.H, L = B.L, Cc = B.C, V = B.V;
  const body = Cc.map((c, t) => Math.abs(c - O[t])), upw = Cc.map((c, t) => H[t] - Math.max(c, O[t])), rng = H.map((h, t) => h - L[t]), sgn = Cc.map((c, t) => c - O[t]);
  const sB = T_.sma(body, LB), sU = T_.sma(upw, LB), sR = T_.sma(rng, LB), sV = T_.sma(V, LB), sS = T_.sma(sgn, LB), R20 = T_.rsi(Cc, LB), bb = T_.sma(Cc, LB), sd = T_.stdev(Cc, LB);
  const sig = [], w = new Float64Array(NF + 1), prob = new Float64Array(n).fill(NaN), calib = []; let consec = 0, lastFlip = 0;
  for (let t = 0; t < n; t++) {
    if (Cc[t] > O[t]) consec = consec > 0 ? consec + 1 : 1; else if (Cc[t] < O[t]) consec = consec < 0 ? consec - 1 : -1; else consec = 0;
    const bu = bullF(t), be = bearF(t); if (!bu && !be) continue;
    if (sig.length && sig[sig.length - 1].y === -1) sig[sig.length - 1].y = Cc[t] > sig[sig.length - 1].en ? 1 : 0;
    if (bu) { const rs = isFinite(R20[t]) ? R20[t] : 50;
      const x = [nc(body[t], sB[t]), nc(upw[t], sU[t]), 0, nc(rng[t], sR[t]), nc(V[t], sV[t]), cl1(consec / 10), 0, sR[t] > 0 ? cl1(sS[t] / sR[t]) : 0, (t >= LB && A[t - LB] > 0) ? cl1(A[t] / A[t - LB] - 1) : 0, 0,
        A[t] > 0 ? cl1(((Cc[t] - line[t]) / A[t]) / 3) : 0, cl1((t - lastFlip) / 50 - 1), cl1((rs - 50) / 50), sd[t] > 0 ? cl1((Cc[t] - bb[t]) / (2 * sd[t])) : 0];
      const s0 = { t, en: Cc[t], x, y: -1 }; sig.push(s0); if (sig.length > MAXH) sig.shift();
      train(w, sig);
      let nr = 0; for (const s of sig) if (s.y !== -1) nr++;
      if (nr >= MINS) { let z = 0; for (let i = 0; i < NF; i++) z += w[i] * x[i]; z += w[NF]; prob[t] = sigm(z); s0.p = prob[t]; calib.push(s0); } }
    lastFlip = t; }
  return { prob, calib: calib.map(s => [s.t, s.p, s.y]) }; }
function train(w, data) { const total = data.length; if (total < 2) return; const res = []; for (let i = 0; i < total; i++) if (data[i].y !== -1) res.push(i); const nr = res.length; if (nr < 2) return;
  const sw = new Float64Array(nr); let peak = 0; for (let k = 0; k < nr; k++) { const v = Math.pow(DEC, total - 1 - res[k]); sw[k] = v; peak = Math.max(peak, v); } if (peak > 0) for (let k = 0; k < nr; k++) sw[k] = sw[k] / peak;
  const tw = Array.from(w), st0 = Math.max(0, nr - TRW);
  for (let e = 0; e < EP; e++) { const g = new Float64Array(NF + 1); let ws = 0;
    for (let k = st0; k < nr; k++) { const s = data[res[k]], x = s.x; let z = 0; for (let i = 0; i < NF; i++) z += tw[i] * x[i]; z += tw[NF]; const er = (sigm(z) - s.y) * sw[k]; for (let i = 0; i < NF; i++) g[i] += er * x[i]; g[NF] += er; ws += sw[k]; }
    if (ws > 0) { const step = LRT / ws; for (let i = 0; i < NF; i++) tw[i] -= step * (g[i] + LAM * tw[i]); tw[NF] -= step * g[NF]; } }
  for (let i = 0; i <= NF; i++) w[i] = Math.max(-CLIP, Math.min(CLIP, tw[i])); }
  // ↑ 복사 끝
  // 하락 모델: 위 lrModel 과 글자가 같고 (1) 이름 (2) 풀기 줄의 '>' → '<' 만 다르다. 첫째 인수 = 신호를 만드는 뒤집힘(여기선 하락) · 둘째 = 반대 뒤집힘(풀기 · 추세 길이에만 쓰임)
function lrModelBear(B, bullF, bearF, line, A) { const n = B.C.length, O = B.O, H = B.H, L = B.L, Cc = B.C, V = B.V;
  const body = Cc.map((c, t) => Math.abs(c - O[t])), upw = Cc.map((c, t) => H[t] - Math.max(c, O[t])), rng = H.map((h, t) => h - L[t]), sgn = Cc.map((c, t) => c - O[t]);
  const sB = T_.sma(body, LB), sU = T_.sma(upw, LB), sR = T_.sma(rng, LB), sV = T_.sma(V, LB), sS = T_.sma(sgn, LB), R20 = T_.rsi(Cc, LB), bb = T_.sma(Cc, LB), sd = T_.stdev(Cc, LB);
  const sig = [], w = new Float64Array(NF + 1), prob = new Float64Array(n).fill(NaN), calib = []; let consec = 0, lastFlip = 0;
  for (let t = 0; t < n; t++) {
    if (Cc[t] > O[t]) consec = consec > 0 ? consec + 1 : 1; else if (Cc[t] < O[t]) consec = consec < 0 ? consec - 1 : -1; else consec = 0;
    const bu = bullF(t), be = bearF(t); if (!bu && !be) continue;
    if (sig.length && sig[sig.length - 1].y === -1) sig[sig.length - 1].y = Cc[t] < sig[sig.length - 1].en ? 1 : 0;
    if (bu) { const rs = isFinite(R20[t]) ? R20[t] : 50;
      const x = [nc(body[t], sB[t]), nc(upw[t], sU[t]), 0, nc(rng[t], sR[t]), nc(V[t], sV[t]), cl1(consec / 10), 0, sR[t] > 0 ? cl1(sS[t] / sR[t]) : 0, (t >= LB && A[t - LB] > 0) ? cl1(A[t] / A[t - LB] - 1) : 0, 0,
        A[t] > 0 ? cl1(((Cc[t] - line[t]) / A[t]) / 3) : 0, cl1((t - lastFlip) / 50 - 1), cl1((rs - 50) / 50), sd[t] > 0 ? cl1((Cc[t] - bb[t]) / (2 * sd[t])) : 0];
      const s0 = { t, en: Cc[t], x, y: -1 }; sig.push(s0); if (sig.length > MAXH) sig.shift();
      train(w, sig);
      let nr = 0; for (const s of sig) if (s.y !== -1) nr++;
      if (nr >= MINS) { let z = 0; for (let i = 0; i < NF; i++) z += w[i] * x[i]; z += w[NF]; prob[t] = sigm(z); s0.p = prob[t]; calib.push(s0); } }
    lastFlip = t; }
  return { prob, calib: calib.map(s => [s.t, s.p, s.y]) }; }
  const n = rows.length, bars = { O: rows.map(r => r.open), H: rows.map(r => r.high), L: rows.map(r => r.low), C: rows.map(r => r.close), V: rows.map(r => +r.volume || 0) };
  const PS = pineST(bars.H, bars.L, bars.C, 10, 3), A10 = T_.atr(bars.H, bars.L, bars.C, 10);   // meas_lr.js models() 105줄과 같음(원문 stFactor 3 · stPeriod 10 · 특징 ATR = ta.atr(stPeriod))
  const bullF = t => t >= 1 && PS.pd[t] === -1 && PS.pd[t - 1] === 1, bearF = t => t >= 1 && PS.pd[t] === 1 && PS.pd[t - 1] === -1;   // 원문 245 · 246줄(models() 106줄과 같음)
  const MP = lrModel(bars, bullF, bearF, PS.st, A10), MB = lrModelBear(bars, bearF, bullF, PS.st, A10), MINPROB = 0;   // 원문 'Min Probability %' 기본 0
  const B = new Uint8Array(n), S = new Uint8Array(n), info = { nBullFlip: 0, nBearFlip: 0 };
  for (let t = 0; t < n; t++) { const bu = bullF(t), be = bearF(t); if (bu) info.nBullFlip++; if (be) info.nBearFlip++;
    if (bu && isFinite(MP.prob[t]) && MP.prob[t] * 100 >= MINPROB) B[t] = 1;   // 원문 363 · 367줄: countResolved ≥ minSamples 일 때만 prob 이 서고 prob ≥ minProb
    if (be && isFinite(MB.prob[t]) && MB.prob[t] * 100 >= MINPROB) S[t] = 1; }
  return { B, S, info }; }
return { strvSig };
})();
// ── chips_g2.js(5b5aecc20dcd) 글자 그대로 — module.exports 한 줄만 뺌 ──
const G2 = (function(){
// chips_g2.js — 🧪 신호 실험 칩 묶음 g2(스크립트 다섯 × 매수 · 매도) — S1858 준비 · 측정 전용 · 읽기 도움 · 판정 아님 · 실험 도구(성적 주장 없음)
//   정의 = offline/mlsig2/defs_g2.md · 원문 = offline/mlsig2/src/ · 파인 약속 = offline/_pta.js(fe4a960e2934 · 객체 T 로 받음 · 이 파일 안에서 require 안 함)
//   꼴: <id>Sig(rows, intra, T) → { B, S, info } · B · S = Uint8Array(n) · 1 = 그 봉에 신호 · 봉 t 의 신호는 0 … t 봉만 씀(피벗은 확정 봉에 찍음)
//   출처(작성자 · 라이선스 · 우리 앱은 유료화 안 함 · 출처 밝힘):
//     zl   = Zero Lag Trend Signals (MTF) [AlgoAlpha] · © AlgoAlpha · MPL 2.0
//     ht   = HalfTrend · © Alex Orekhov (everget) · GPL-3.0
//     src  = Support Resistance - Dynamic v2 · © LonesomeTheBlue · MPL 2.0
//     srlr = Support and Resistance Logistic Regression | Flux Charts · © fluxchart · MPL 2.0
//     lg   = Liquidity Grabs | Flux Charts · © fluxchart · MPL 2.0
//   앞 측정 함수는 칩 함수 안에 글자 그대로 넣었다(이름이 바깥으로 새지 않게) — 복사한 파일 경로 · md5(앞 12자리)는 그 위 주석.
//   intra(일봉 아님)는 다섯 칩 모두 쓰지 않는다(하루 경계 · 세션이 신호에 안 들어감).
'use strict';
const G2_IDS = ['zl', 'ht', 'src', 'srlr', 'lg'];

// ── zl · Zero Lag Trend Signals (MTF) [AlgoAlpha] — 매수 = 'Bullish Trend'(ta.crossover(trend, 0) · ▲) · 매도 = 'Bearish Trend'(ta.crossunder(trend, 0) · ▼) ──
//   기본값 길이 70 · 띠 배수 1.2 · 위 시간 틀 다섯(s1 … s5) · 표 · 'Bullish/Bearish Entry'(추세 안 ZLEMA 재교차)는 안 씀
function zlSig(rows, intra, T) {
  // 옮김: offline/zlts/meas_zl.js(29596b4efb3d) zlOf — 8줄 중 6줄(1 · 3 · 4 · 6 · 7 · 8줄)은 글자 그대로 · **2 · 5줄만 고침(앞부분 데우기만 · 2026-11-01 조정자 결정 '원문 파인 + _pta 약속')**:
  //   2줄 ZLEMA: 앞 측정 = 첫 값 x[34](t = 34) → 여기 = _pta EMA 약속 · 첫 값 = x[34 … 103] 단순 평균(t = 103 · T.ema(x, 70) 과 같은 덧셈 차례) · 그 뒤 같은 재귀
  //   5줄 vol: 앞 측정 = 창 210 이 안 차도 서 있는 ATR 의 최댓값(t ≥ 69) → 여기 = _pta 최고 약속 · t < 209 면 na(띠 없음) · t ≥ 209 면 창 t − 209 … t 의 서 있는 ATR 최댓값 × 1.2
  //   그래서 첫 뒤집힘 가능 봉 = 70 → 210. 이 자료(KR 188 · 코인 5)에서 앞 측정 판과 신호가 다른 봉은 t ≤ 350 뿐(smoke_g2.out)
  function zlOf(rows) { const n = rows.length, C = rows.map(r => r.close), H = rows.map(r => r.high), L = rows.map(r => r.low), a = 2 / 71, ze = new Array(n).fill(null), atr = new Array(n).fill(null), vol = new Array(n).fill(null), tr = new Array(n);
  for (let t = 103; t < n; t++) { const x = C[t] + (C[t] - C[t - 34]); if (t === 103) { let s = 0; for (let k = 34; k <= 103; k++) s += C[k] + (C[k] - C[k - 34]); ze[t] = s / 70; } else ze[t] = a * x + (1 - a) * ze[t - 1]; }
  for (let t = 0; t < n; t++) tr[t] = (t === 0) ? H[t] - L[t] : Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1]), Math.abs(L[t] - C[t - 1]));
  if (n >= 70) { let s = 0; for (let t = 0; t < 70; t++) s += tr[t]; atr[69] = s / 70; for (let t = 70; t < n; t++) atr[t] = (atr[t - 1] * 69 + tr[t]) / 70; }
  for (let t = 209; t < n; t++) { let m = null; for (let k = t - 209; k <= t; k++) if (atr[k] != null && (m == null || atr[k] > m)) m = atr[k]; vol[t] = (m == null) ? null : m * 1.2; }
  const tdir = new Array(n).fill(0), ok = new Array(n).fill(false); let st = 0;
  for (let t = 1; t < n; t++) { if (ze[t] != null && vol[t] != null && ze[t - 1] != null && vol[t - 1] != null) { ok[t] = true; const u1 = ze[t] + vol[t], u0 = ze[t - 1] + vol[t - 1], d1 = ze[t] - vol[t], d0 = ze[t - 1] - vol[t - 1]; if (C[t] > u1 && C[t - 1] <= u0) st = 1; if (C[t] < d1 && C[t - 1] >= d0) st = -1; } tdir[t] = st; }
  return { ze, vol, atr, tdir, ok }; }
  const n = rows.length, Z = zlOf(rows), B = new Uint8Array(n), S = new Uint8Array(n); let up = 0;
  for (let t = 1; t < n; t++) { const a = Z.tdir[t - 1], b = Z.tdir[t]; if (b > 0 && a <= 0) B[t] = 1; if (b < 0 && a >= 0) S[t] = 1; if (b === 1) up++; }   // trend 는 0 에서 시작 · 늘 수(na 없음) · t = 0 은 trend[1] 이 na 라 거짓
  return { B, S, info: { upBars: up } }; }

// ── ht · HalfTrend(everget) — 매수 = 'HalfTrend Buy'(buySignal) · 매도 = 'HalfTrend Sell'(sellSignal) ──
//   기본값 amplitude 2 · channelDeviation 2(채널 폭은 신호에 안 들어감 · ATR(100) 은 '값이 있나'만 들어감)
function htSig(rows, intra, T) {
  // 복사: offline/stockind/meas_ht.js(255d692cce51) halftrend 글자 그대로 — buy · sell = 원문 94 · 95줄
  function halftrend(H, L, C) {
  const n = C.length, tr = new Array(n), trend = new Int8Array(n), buy = new Uint8Array(n), sell = new Uint8Array(n);
  for (let t = 0; t < n; t++) tr[t] = t === 0 ? H[t] - L[t] : Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1]), Math.abs(L[t] - C[t - 1]));
  const atr = new Array(n).fill(null); if (n >= 100) { let s = 0; for (let t = 0; t < 100; t++) s += tr[t]; atr[99] = s / 100; for (let t = 100; t < n; t++) atr[t] = atr[t - 1] + (tr[t] - atr[t - 1]) / 100; }
  let tr_ = 0, nt = 0, maxLow = L[0], minHigh = H[0];
  for (let t = 0; t < n; t++) {
    const hp = t >= 1 ? Math.max(H[t], H[t - 1]) : H[t], lp = t >= 1 ? Math.min(L[t], L[t - 1]) : L[t], hma = t >= 1 ? (H[t] + H[t - 1]) / 2 : NaN, lma = t >= 1 ? (L[t] + L[t - 1]) / 2 : NaN;
    if (nt === 1) { maxLow = Math.max(lp, maxLow); if (hma < maxLow && C[t] < (t >= 1 ? L[t - 1] : L[t])) { tr_ = 1; nt = 0; minHigh = hp; } }
    else { minHigh = Math.min(hp, minHigh); if (lma > minHigh && C[t] > (t >= 1 ? H[t - 1] : H[t])) { tr_ = 0; nt = 1; maxLow = lp; } }
    trend[t] = tr_;
    if (t >= 1 && atr[t] != null) { if (tr_ === 0 && trend[t - 1] === 1) buy[t] = 1; if (tr_ === 1 && trend[t - 1] === 0) sell[t] = 1; }
  }
  let wr = n; for (let t = 1; t < n; t++) if (atr[t] != null) { wr = t; break; }
  return { trend, buy, sell, wr };
}
  const H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), Z = halftrend(H, L, C);
  return { B: Z.buy, S: Z.sell, info: { firstAtr: Z.wr } }; }

// ── src · Support Resistance - Dynamic v2(LonesomeTheBlue) — 매수 = 'Resistance Broken'(crossed_over) · 매도 = 'Support Broken'(crossed_under) ──
//   기본값 피벗 10 · High/Low · 피벗 최대 20 · 채널 폭 10% · S/R 최대 5 · 최소 강도 2 · 선 = 채널 가운데(round_to_mintick 은 안 함 · 앞 측정과 같음)
function srcSig(rows, intra, T) {
  // 복사: offline/stsrx/meas_sx.js(6112986c5d33) pivAt · MAXPP 줄 · channelsOf 글자 그대로(원문 get_sr_vals · check_sr · find_loc)
  function pivAt(H, L, prd) { const n = H.length, PH = new Array(n).fill(null), PL = new Array(n).fill(null);
  for (let i = prd; i + prd < n; i++) { let hi = true, lo = true; for (let j = i - prd; j <= i + prd && (hi || lo); j++) { if (j === i) continue; if (j < i) { if (!(H[i] > H[j])) hi = false; if (!(L[i] < L[j])) lo = false; } else { if (!(H[i] >= H[j])) hi = false; if (!(L[i] <= L[j])) lo = false; } } if (hi) PH[i + prd] = H[i]; if (lo) PL[i + prd] = L[i]; }
  return { PH, PL }; }
  const MAXPP = 20, CHW = 10, MAXSR = 5;
  function channelsOf(pv, cw, minStr) { const up = [], dn = [], sg = [];
  for (let x = 0; x < pv.length; x++) { let lo = pv[x], hi = lo, num = 0;
    for (let y = 0; y < pv.length; y++) { const c = pv[y], w = (c <= lo) ? hi - c : c - lo; if (w <= cw) { if (c <= hi) lo = Math.min(lo, c); else hi = Math.max(hi, c); num++; } }
    let ok = true; for (let i = 0; i < up.length; i++) { if ((up[i] >= lo && up[i] <= hi) || (dn[i] >= lo && dn[i] <= hi)) { if (num >= sg[i]) { up.splice(i, 1); dn.splice(i, 1); sg.splice(i, 1); } else ok = false; break; } }
    if (!ok) continue; let loc = sg.length; for (let i = sg.length - 1; i >= 0; i--) { if (num <= sg[i]) break; loc = i; }
    if (loc < MAXSR && num >= minStr) { sg.splice(loc, 0, num); up.splice(loc, 0, hi); dn.splice(loc, 0, lo); if (sg.length > MAXSR) { sg.pop(); up.pop(); dn.pop(); } } }
  return sg.map((s, i) => ({ hi: up[i], lo: dn[i], s })); }
  // 사건 뽑기(원문 36 ~ 39 · 99 ~ 118 · 131 ~ 149줄 · 피벗 다루기는 같은 파일 clEvents 의 피벗 줄과 같은 꼴)
  const n = rows.length, H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), P10 = pivAt(H, L, 10), pv = [], B = new Uint8Array(n), S = new Uint8Array(n); let mids = [], nRc = 0;
  for (let t = 0; t < n; t++) {
    const v = (P10.PH[t] != null) ? P10.PH[t] : P10.PL[t];   // ph ? ph : pl — 같은 봉 둘이면 고점만
    if (v != null) { pv.unshift(v); if (pv.length > MAXPP) pv.pop();
      if (t >= 299) { let hh = -Infinity, ll = Infinity; for (let j = t - 299; j <= t; j++) { if (H[j] > hh) hh = H[j]; if (L[j] < ll) ll = L[j]; } mids = channelsOf(pv, (hh - ll) * CHW / 100, 2).map(c => (c.hi + c.lo) / 2); nRc++; }
      else mids = []; }   // ta.highest(300) 이 na → 폭 na → 강도 0 → 채널 없음(원문은 지우고 아무것도 안 넣음)
    if (t >= 1) for (const m of mids) { if (C[t - 1] <= m && C[t] > m) B[t] = 1; if (C[t - 1] >= m && C[t] < m) S[t] = 1; } }
  return { B, S, info: { recalc: nRc } }; }

// ── srlr · Support and Resistance Logistic Regression(Flux Charts) — 매수 = 'Support Retest' 또는 'Resistance Break' · 매도 = 'Resistance Retest' 또는 'Support Break' ──
//   기본값 피벗 14 · 목표 지켜짐 3 · 확률 문턱 0.7 · 되시험 쉼 3 · hideFarLines 는 그림만(신호와 무관)
function srlrSig(rows, intra, T) {
  // 복사: offline/srlr/meas_lr.js(49be7606c105) logi 줄 · srLines 글자 그대로(T = 이 함수의 T) · LRATE 는 같은 파일 4줄의 값(0.008 · 그 줄은 process.env 가 섞여 값만 옮김)
  //   srLines 는 지지선 사건(되시험 retest · 깨짐 brk · 고른 선만)만 표시하므로, 저항선 사건은 같은 선 목록으로 원문 172 ~ 189줄을 다시 돌려 낸다(아래).
  const LRATE = 0.008;
  const logi = (x1, x2, y0, y1, y2) => 1.0 / (1.0 + Math.exp(-(y0 + y1 * x1 + y2 * x2)));
  function srLines(B) { const { O, H: Hh, L, C } = B, n = C.length, PH = T.pivotHigh(Hh, 14, 14), PL = T.pivotLow(L, 14, 14), R = T.rsi(C, 14).map(v => Number.isFinite(v) ? v : 0), A = T.atr(Hh, L, C, 14);
  const lines = [], retest = new Uint8Array(n), brk = new Uint8Array(n);
  const predict = (sup, xr, xb) => { let rb = 1.0, bb = 1.0, res = 0.0; for (const s of lines) { if (s.sup !== sup) continue; const y = s.times >= 3 ? 1.0 : -1.0, p = logi(s.xr, s.xb, 1.0, rb, bb), loss = -y * Math.log(p) - (1 - y) * Math.log(1 - p);
      rb -= LRATE * (p + loss) * s.xr; bb -= LRATE * (p + loss) * s.xb; res = logi(xr, xb, 1.0, rb, bb); } return res; };
  for (let t = 0; t < n; t++) {
    for (const [val, sup] of [[PH[t], false], [PL[t], true]]) { if (!Number.isFinite(val)) continue; const xr = R[t - 14] > 50 ? 1 : -1, xb = Math.abs(C[t - 14] - O[t - 14]) > A[t] ? 1 : -1;
      const s = { sup, level: val, t, xr, xb, times: 0, end: null, reg: false, pred: NaN, last: 0, r3: null }; lines.push(s); const pv = predict(sup, xr, xb); s.pred = pv; if (pv >= 0.7) s.reg = true; }
    for (const s of lines) { if (s.end != null) continue;
      if (s.sup) { if (L[t] < s.level) { if (C[t] > s.level) { if (s.reg && t > s.last + 3) { retest[t] = 1; s.last = t; } s.times++; if (s.times === 3) s.r3 = t; } else { if (s.reg) brk[t] = 1; s.end = t; } } }
      else { if (Hh[t] > s.level) { if (C[t] < s.level) { if (s.reg && t > s.last + 3) { s.last = t; } s.times++; if (s.times === 3) s.r3 = t; } else { s.end = t; } } } }
  }
  return { lines, retest, brk }; }
  const n = rows.length, O = rows.map(r => r.open), H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), Z = srLines({ O, H, L, C });
  const rR = new Uint8Array(n), rB = new Uint8Array(n), B = new Uint8Array(n), S = new Uint8Array(n); let nReg = 0, endMis = 0;
  for (const s of Z.lines) { if (s.reg) nReg++; if (s.sup || !s.reg) continue; let last = 0, end = null;   // 고른 저항선만 사건을 냄 · latestRetestIndex 처음 0
    for (let u = s.t; u < n; u++) { if (H[u] > s.level) { if (C[u] < s.level) { if (u > last + 3) { rR[u] = 1; last = u; } } else { rB[u] = 1; end = u; break; } } }   // 만든 봉부터 · 고가 > 선: 종가 < 선 → 되시험(쉼 3) · 아니면 깨짐(선 끝)
    if (end !== s.end) endMis++; }   // srLines 의 끝 봉과 같아야 함(0)
  for (let t = 0; t < n; t++) { if (Z.retest[t] || rB[t]) B[t] = 1; if (rR[t] || Z.brk[t]) S[t] = 1; }
  return { B, S, info: { lines: Z.lines.length, reg: nReg, endMis } }; }

// ── lg · Liquidity Grabs(Flux Charts) — 매수 = 'Sellside' 스윕 표시(저점 아래 쓸고 몸통은 위 · 초록) · 매도 = 'Buyside' 스윕 표시(고점 위 쓸고 몸통은 아래 · 빨강) ──
//   기본값 피벗 25 · WBR 0.5 · 쿨다운 3 · 자리 5개 · 표시(plot) = 스윕 · 크기 > 0 · 쿨다운 OK(알림 두 줄은 쿨다운을 안 봄 — defs_g2.md)
function lgSig(rows, intra, T) {
  const T_ = T;
  // 복사: offline/fxb/meas_xb.js(bba0905ac0a3) lgSig 글자 그대로(T_ = 이 함수의 T) — 칩 함수와 이름이 같아 안쪽 묶음에 가둠 · buy = 아래쪽(sellside) · sell = 위쪽(buyside) · 값 = 크기 1 ~ 3
  const lgSrc = (function () {
  function lgSig(O, H, L, C) { const n = C.length, PH = T_.pivotHigh(H, 25, 25), PL = T_.pivotLow(L, 25, 25), bs = [], ss = [], buy = new Int8Array(n), sell = new Int8Array(n); let lb = 0, lsI = 0, naSz = 0;
  for (let t = 0; t < n; t++) { if (isFinite(PH[t])) { bs.push(PH[t]); if (bs.length > 5) bs.shift(); } if (isFinite(PL[t])) { ss.push(PL[t]); if (ss.length > 5) ss.shift(); }
    let found = false, gb = true, size = 1; const rm = [], top = Math.max(C[t], O[t]), bot = Math.min(C[t], O[t]), body = Math.abs(C[t] - O[t]);
    for (const lv of bs) { if (H[t] > lv && top < lv) { const w = H[t] - top, wbr = body === 0 ? NaN : w / body; found = true; gb = true; size = Math.floor(Math.min(wbr / 0.5, 3)); rm.push(lv); break; } if (top > lv) { rm.push(lv); break; } }
    if (!found) for (const lv of ss) { if (L[t] < lv && bot > lv) { const w = bot - L[t], wbr = body === 0 ? NaN : w / body; found = true; gb = false; size = Math.floor(Math.min(wbr / 0.5, 3)); rm.push(lv); break; } if (bot < lv) { rm.push(lv); break; } }
    for (const lv of rm) { const bi = bs.indexOf(lv); if (bi !== -1) { bs.splice(bi, 1); continue; } const si = ss.indexOf(lv); if (si !== -1) ss.splice(si, 1); }
    const cd = (gb && t - lb > 3) || (!gb && t - lsI > 3); if (found && !(size > 0) && !isFinite(size)) naSz++;
    if (found && size > 0 && cd) { if (gb) { lb = t; sell[t] = size; } else { lsI = t; buy[t] = size; } } }
  return { buy, sell, naSz }; }
  return lgSig; })();
  const O = rows.map(r => r.open), H = rows.map(r => r.high), L = rows.map(r => r.low), C = rows.map(r => r.close), n = C.length, G = lgSrc(O, H, L, C), B = new Uint8Array(n), S = new Uint8Array(n);
  for (let t = 0; t < n; t++) { if (G.buy[t] > 0) B[t] = 1; if (G.sell[t] > 0) S[t] = 1; }
  return { B, S, info: { naSize: G.naSz } }; }
return { zlSig, htSig, srcSig, srlrSig, lgSig };
})();
// ── chips_g3.js(e769efbf7319) 글자 그대로 — module.exports 한 줄만 뺌 ──
const G3 = (function(){
// chips_g3.js — 🧪 신호 실험 칩 묶음 g3(S1858 준비 · 측정 전용 폴더 offline/mlsig2) — 칩 넷 × 매수 · 매도 · 읽기 도움 · 판정 아님 · 실험 도구
//   mlr  = Machine Learning RSI | AI Classification & Ranking (Zeiierman) · © Zeiierman · CC BY-NC-SA 4.0 · 원문 src/Machine Learning RSI.txt (abb49d00ff9d)
//   bn   = Bollinger Bands (Nadaraya Smoothed) | Flux Charts · © fluxchart · MPL 2.0 · 원문 src/Bollinger Bands (Nadaraya Smoothed).txt (b922b61220bc)
//   gtf  = Gaussian Trend Filter | Lyro RS · © LyroRS · MPL 2.0 · 원문 src/Gaussian.txt (64fa9a073114)
//   rswb = RSWB Momentum Confirmation v1 · 원문 머리에 작성자 · 라이선스 표기 없음 · 원문 src/Rswb.txt (bf17d20c4d0d)
//   정의 = defs_g3.md · 꼴 = function <id>Sig(rows, intra, T) → { B, S, info } (B · S = Uint8Array(n) · 1 = 그 봉에 신호) · T = offline/_pta.js 약속(조립 때 넘어옴)
//   "//<<복사 <파일> a-b" ~ "//>>" 사이 줄 = 앞 측정 파일 a ~ b 줄 글자 그대로(들여쓰기와 이름 앞 '<id>_' 만 다름) · 다르게 둔 줄은 줄 끝 "// [바꿈] …" — smoke_g3.js 가 줄마다 대 봄
//   복사 원본 md5(앞 12자리): offline/mlrsi/meas_mr.js 8295618d5d04 · offline/fxb/meas_xb.js bba0905ac0a3 · offline/gtf/meas_gt.js fbe99a1e1e3b · offline/gtf/meas_gt2.js 6d27f3369db3
'use strict';

// ═══ mlr — ML RSI(Zeiierman) · 매수 = 원문 triggerLong('L' 표시 · 'Long Signal' 알림) · 매도 = triggerShort('S' · 'Short Signal') · 엔진 = 원문 316 ~ 501줄(앞 측정 offline/mlrsi 그대로 · 검산 다름 0) ═══
//   ta 풀이(앞 측정 mr_criteria.md §2 · RMA/EMA 첫 값 = 값 있는 첫 L 개 평균 · RSI 둘 다 0 → 50 · 최고/최저 · percentrank 는 창 안 na 하나라도 있으면 na)
//<<복사 offline/mlrsi/meas_mr.js 27-49
function mlr_smoothSeed(x, L, alpha) { const n = x.length, o = new Float64Array(n).fill(NaN); let cnt = 0, s = 0, started = false;
  for (let i = 0; i < n; i++) { const v = x[i];
    if (!started) { if (Number.isNaN(v)) continue; s += v; cnt++; if (cnt === L) { o[i] = s / L; started = true; } }
    else o[i] = alpha * v + (1 - alpha) * o[i - 1]; }
  return o; }
const mlr_rma = (x, L) => mlr_smoothSeed(x, L, 1 / L), mlr_ema = (x, L) => mlr_smoothSeed(x, L, 2 / (L + 1));
function mlr_rsi(x, L) { const n = x.length, u = new Float64Array(n).fill(NaN), d = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) { u[i] = Math.max(x[i] - x[i - 1], 0); d[i] = Math.max(x[i - 1] - x[i], 0); }
  const U = mlr_rma(u, L), D = mlr_rma(d, L), o = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { if (Number.isNaN(U[i]) || Number.isNaN(D[i])) continue; o[i] = (D[i] === 0 && U[i] > 0) ? 100 : ((U[i] === 0 && D[i] > 0) ? 0 : ((U[i] === 0 && D[i] === 0) ? 50 : 100 - 100 / (1 + U[i] / D[i]))); }
  return o; }
function mlr_atr(H, L, C, len) { const n = C.length, tr = new Float64Array(n); tr[0] = H[0] - L[0]; for (let i = 1; i < n; i++) tr[i] = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])); return mlr_rma(tr, len); }
function mlr_winMinMax(x, L) { const n = x.length, lo = new Float64Array(n).fill(NaN), hi = new Float64Array(n).fill(NaN);
  for (let i = L - 1; i < n; i++) { let a = Infinity, b = -Infinity, bad = false; for (let k = i - L + 1; k <= i; k++) { const v = x[k]; if (Number.isNaN(v)) { bad = true; break; } if (v < a) a = v; if (v > b) b = v; } if (!bad) { lo[i] = a; hi[i] = b; } }
  return [lo, hi]; }
function mlr_scale01(x, L) { const [lo, hi] = mlr_winMinMax(x, L), n = x.length, o = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) o[i] = hi[i] === lo[i] ? 0.5 : (x[i] - lo[i]) / (hi[i] - lo[i]); return o; }
function mlr_stdev(x, L) { const n = x.length, o = new Float64Array(n).fill(NaN);
  for (let i = L - 1; i < n; i++) { let s = 0, bad = false; for (let k = i - L + 1; k <= i; k++) { if (Number.isNaN(x[k])) { bad = true; break; } s += x[k]; } if (bad) continue; const m = s / L; let q = 0; for (let k = i - L + 1; k <= i; k++) q += (x[k] - m) * (x[k] - m); o[i] = Math.sqrt(q / L); }
  return o; }
function mlr_prank(x, L) { const n = x.length, o = new Float64Array(n).fill(NaN);
  for (let i = L; i < n; i++) { if (Number.isNaN(x[i])) continue; let c = 0, bad = false; for (let j = 1; j <= L; j++) { const v = x[i - j]; if (Number.isNaN(v)) { bad = true; break; } if (v <= x[i]) c++; } if (!bad) o[i] = 100 * c / L; }
  return o; }
const mlr_sub = (a, b) => a.map((v, i) => v - b[i]);
//>>
function mlrSig(rows, intra, T) { const n = rows.length;   // [더함] meas_mr.js 58줄(계열 돌기 · n < 320 건너뜀 · 계열 수 = 측정 틀) 대신 — 칩은 길이와 상관없이 0 봉부터 돈다
//<<복사 offline/mlrsi/meas_mr.js 56-56
const K = 8, MEM = 500, SPC = 4, HZ = 4;
//>>
//<<복사 offline/mlrsi/meas_mr.js 59-122
  const C = rows.map(r => r.close), H = rows.map(r => r.high), Lw = rows.map(r => r.low), HL2 = rows.map(r => (r.high + r.low) / 2);   // [바꿈] 자료 꼴만(B[i].c · h · l → rows[i].close · high · low) — 같은 값
  // 특징(원문 316 ~ 325)
  const rO = mlr_rsi(C, 14), rF = mlr_rsi(C, Math.max(2, Math.round(14 / 2))), rS = mlr_rsi(C, 28), atrV = mlr_atr(H, Lw, C, 14);
  const d3 = new Float64Array(n).fill(NaN), ac = new Float64Array(n).fill(NaN); for (let i = 3; i < n; i++) d3[i] = rO[i] - rO[i - 3]; for (let i = 6; i < n; i++) ac[i] = rO[i] - rO[i - 3] - (rO[i - 3] - rO[i - 6]);
  const fV = rO.map(v => v / 100.0), fS = mlr_scale01(d3, 100), fA = mlr_scale01(ac, 100), fM = rO.map(v => Math.abs(v - 50.0) / 50.0), fP = mlr_prank(rO, 100).map(v => v / 100.0), fC = mlr_scale01(mlr_stdev(rO, 14), 100), fSp = mlr_scale01(mlr_sub(rF, rS), 100), e20 = mlr_ema(rO, 20), fR = mlr_scale01(e20.map(v => v - 50.0), 100);
  const F = i => [fV[i], fS[i], fA[i], fM[i], fP[i], fC[i], fSp[i], fR[i]];
  // 맥락 계열
  const emaT = mlr_ema(C, 50), emaQ = mlr_ema(C, 5), atrPct = mlr_prank(atrV, 100), e5 = mlr_ema(rO, 5), stAtr = mlr_atr(H, Lw, C, 10);
  // 상태
  const bank = []; let wAuto = [1, 1, 1, 1, 1, 1, 1, 1];
  const conv = new Float64Array(n); let cs = NaN, csN = 0, csS = 0, csStarted = false;   // mlr_ema(convInst, 10)
  let stLongP = NaN, stShortP = NaN, stDirP = NaN, stanceP = NaN, ageP = 0, lastEntry = null; const sc = new Uint8Array(n);
  const bias = new Int8Array(n), tL = new Uint8Array(n), tS = new Uint8Array(n), stDirA = new Int8Array(n), rankA = new Float64Array(n), confA = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // 은행(원문 332 ~ 353)
    if (i > HZ) { const moveFwd = C[i] - C[i - HZ], bandFwd = 0.5 * atrV[i - HZ];
      const outcome = moveFwd > 2 * bandFwd ? 3 : moveFwd > bandFwd ? 2 : moveFwd > 0 ? 1 : moveFwd < -2 * bandFwd ? -3 : moveFwd < -bandFwd ? -2 : moveFwd < 0 ? -1 : 0;
      const f = F(i - HZ), ok = f.every(v => !Number.isNaN(v)); bank.unshift({ f, o: outcome, ok }); if (bank.length > MEM) bank.pop(); }
    // 가중치(원문 232 ~ 274 · 357 ~ 362)
    { const nb = bank.length; let imp = [1, 1, 1, 1, 1, 1, 1, 1];
      if (nb >= 60) { const sB = new Float64Array(8), sBe = new Float64Array(8), qB = new Float64Array(8), qBe = new Float64Array(8); let cB = 0, cBe = 0;
        for (let r = 0; r < nb; r++) { const row = bank[r]; if (!row.ok) continue; const o = row.o; if (o > 0 || o < 0) { const isB = o > 0; for (let j = 0; j < 8; j++) { const v = row.f[j]; if (isB) { sB[j] = sB[j] + v; qB[j] = qB[j] + v * v; } else { sBe[j] = sBe[j] + v; qBe[j] = qBe[j] + v * v; } } if (isB) cB++; else cBe++; } }
        if (cB > 2 && cBe > 2) { const fish = new Float64Array(8); let maxF = 0.0; for (let j = 0; j < 8; j++) { const mB = sB[j] / cB, mBe = sBe[j] / cBe, vB = Math.max(0.0, qB[j] / cB - mB * mB), vBe = Math.max(0.0, qBe[j] / cBe - mBe * mBe), ff = Math.pow(mB - mBe, 2) / (vB + vBe + 1e-6); fish[j] = ff; maxF = Math.max(maxF, ff); }
          for (let j = 0; j < 8; j++) { const norm = maxF > 0 ? fish[j] / maxF : 1.0; imp[j] = Math.max(0.5, norm * 10.0); } } }
      wAuto = wAuto.map((prev, j) => prev + 1 * (imp[j] - prev)); }
    const w = wAuto;
    // 이웃(원문 376 ~ 387)
    const cur = F(i), nbrs = [], bankN = bank.length, scanEnd = Math.min(MEM - 1, bankN - 1);
    if (bankN > 1) for (let idx = 0; idx <= scanEnd; idx++) { if (idx % SPC !== 0) continue; const row = bank[idx]; if (!row.ok) continue;
      const rf = row.f; const g = w[0] * Math.log(1.0 + Math.abs(cur[0] - rf[0])) + w[1] * Math.log(1.0 + Math.abs(cur[1] - rf[1])) + w[2] * Math.log(1.0 + Math.abs(cur[2] - rf[2])) + w[3] * Math.log(1.0 + Math.abs(cur[3] - rf[3])) + w[4] * Math.log(1.0 + Math.abs(cur[4] - rf[4])) + w[5] * Math.log(1.0 + Math.abs(cur[5] - rf[5])) + w[6] * Math.log(1.0 + Math.abs(cur[6] - rf[6])) + w[7] * Math.log(1.0 + Math.abs(cur[7] - rf[7]));
      if (Number.isNaN(g)) continue;
      if (nbrs.length < K) nbrs.push({ gap: g, cls: row.o }); else { let worst = 0, wg = nbrs[0].gap; for (let q = 1; q < nbrs.length; q++) if (nbrs[q].gap > wg) { wg = nbrs[q].gap; worst = q; } if (g < wg) nbrs[worst] = { gap: g, cls: row.o }; } }
    // 투표(원문 391 ~ 407)
    let vt = 0, vb = 0, vbe = 0, vs = 0, gs = 0; for (const nb of nbrs) { const ww = 1.0 / (1.0 + nb.gap); vt = vt + ww; vs = vs + nb.cls * ww; if (nb.cls > 0) vb = vb + ww; else if (nb.cls < 0) vbe = vbe + ww; gs = gs + nb.gap; }
    const kC = nbrs.length, aScore = vt > 0 ? vs / vt : 0.0, bDir = aScore > 0.15 ? 1 : (aScore < -0.15 ? -1 : 0), agree = vt > 0 ? (bDir === 1 ? vb : (bDir === -1 ? vbe : 0.0)) / vt : 0.0;
    const avgGap = kC > 0 ? gs / kC : 0.0, gapScale = (w[0] + w[1] + w[2] + w[3] + w[4] + w[5] + w[6] + w[7]) * 0.45 + 1e-9, gapTight = Math.max(0.0, Math.min(1.0, 1.0 - avgGap / gapScale));
    // 맥락(원문 415 ~ 422)
    const trendForce = atrV[i] > 0 ? Math.abs(emaQ[i] - emaT[i]) / atrV[i] : 0.0, chopRaw = trendForce < 0.5, slopeUp = i >= 3 && rO[i] > rO[i - 3], oscReg = e20[i], chopNow = chopRaw;
    // ML 슈퍼트렌드(원문 425 ~ 441)
    const convInst = Math.max(-1.0, Math.min(1.0, aScore / 1.5));
    if (!csStarted) { csS += convInst; csN++; if (csN === 10) { cs = csS / 10; csStarted = true; } } else cs = (2 / 11) * convInst + (1 - 2 / 11) * cs;
    let mlDrive = Math.max(0.0, Math.min(1.0, Math.abs(cs) * 0.5 + gapTight * 0.3 + agree * 0.2)); mlDrive = chopNow ? mlDrive * 0.35 : mlDrive;
    const adaptMult = 1.5 * (1.0 + 1 * (1.0 - mlDrive)), upBand = HL2[i] - adaptMult * stAtr[i], dnBand = HL2[i] + adaptMult * stAtr[i];
    const stLong = Number.isNaN(stLongP) ? upBand : (C[i - 1] > stLongP ? Math.max(upBand, stLongP) : upBand);
    const stShort = Number.isNaN(stShortP) ? dnBand : (C[i - 1] < stShortP ? Math.min(dnBand, stShortP) : dnBand);
    const stDir = Number.isNaN(stDirP) ? 1 : (stDirP === -1 && C[i] > stShortP ? 1 : (stDirP === 1 && C[i] < stLongP ? -1 : stDirP));
    // 문 · 상태(원문 444 ~ 458)
    const upT = stDir === 1, dnT = stDir === -1, volH = atrPct[i] >= 20 && atrPct[i] <= 85, slopeFit = (bDir === 1 && slopeUp) || (bDir === -1 && !slopeUp), stretched = (bDir === 1 && rO[i] > 70) || (bDir === -1 && rO[i] < 30), oscSU = i >= 1 && e5[i] > e5[i - 1];
    const aligned = d => (d === 1 && upT) || (d === -1 && dnT);
    const gatesPass = aligned(bDir) && volH && !chopNow;
    const stance = (bDir === 1 && gatesPass) ? 1 : ((bDir === -1 && gatesPass) ? -1 : (Number.isNaN(stanceP) ? 0 : stanceP));
    const changed = !Number.isNaN(stanceP) && stance !== stanceP; sc[i] = changed ? 1 : 0;
    const age = changed ? 0 : ageP + 1, early = changed && ((i >= 1 && sc[i - 1]) || (i >= 2 && sc[i - 2]) || (i >= 3 && sc[i - 3])) ? true : false;
    // 순위 · 확신(원문 462 ~ 485)
    const pAgree = 25.0 * agree, pGap = 15.0 * gapTight, pStruct = (slopeFit ? 10.0 : 0.0) + (stretched ? 0.0 : 5.0), pTrend = aligned(bDir) ? 10.0 : 0.0, pVol = volH ? 10.0 : (atrPct[i] < 20 ? 5.0 : 3.0);
    const regFit = (bDir === 1 && oscReg > 55) || (bDir === -1 && oscReg < 45), pReg = regFit ? 10.0 : ((oscReg >= 45 && oscReg <= 55) ? 4.0 : 6.0), pSmooth = ((bDir === 1 && oscSU) || (bDir === -1 && !oscSU)) ? 5.0 : 0.0, pHold = Math.min(5.0, age);
    const pPen = Math.min(20.0, (chopRaw ? 8.0 : 0.0) + (stretched ? 6.0 : 0.0) + (early ? 6.0 : 0.0) + (kC < K ? 5.0 * (K - kC) / K : 0.0));
    const rawR = pAgree + pGap + pStruct + pTrend + pVol + pReg + pSmooth + pHold - pPen, rank = bDir === 0 ? 0.0 : Math.max(0.0, Math.min(100.0, rawR));
    const rawC = 40.0 * agree + 25.0 * gapTight + 15.0 * Math.min(1.0, age / 5.0) + 10.0 * (slopeFit ? 1.0 : 0.0) - (early ? 15.0 : 0.0) - (kC < K ? 10.0 * (K - kC) / K : 0.0), conf = bDir === 0 ? 0.0 : Math.max(0.0, Math.min(100.0, rawC));
    // 신호(원문 489 ~ 501)
    const flipL = stance === 1 && stanceP !== 1 && !Number.isNaN(stanceP), flipS = stance === -1 && stanceP !== -1 && !Number.isNaN(stanceP), qual = rank >= 60 && conf >= 50, coolOK = lastEntry === null || i - lastEntry >= 5;
    const trL = flipL && qual && coolOK, trS = flipS && qual && coolOK; if (trL || trS) lastEntry = i;
    bias[i] = bDir; tL[i] = trL ? 1 : 0; tS[i] = trS ? 1 : 0; stDirA[i] = stDir; rankA[i] = rank; confA[i] = conf;
    stLongP = stLong; stShortP = stShort; stDirP = stDir; stanceP = stance; ageP = age; }
//>>
  return { B: tL, S: tS, info: { bias, stDir: stDirA, rank: rankA, conf: confA } }; }   // [더함] 매수 = triggerLong · 매도 = triggerShort(meas_mr.js 121줄의 tL · tS 그대로)

// ═══ bn — 볼린저 나다라야(Flux Charts) · 매수 = 아래 띠 화살표(원문 lower_band_test · 초록 shape.triangleup) · 매도 = 위 띠 화살표(upper_band_test · 빨강 shape.triangledown) ═══
//   원문 기본: h 6 · 띠 = tp(고+저+종 ÷ 3) SMA 20 ± 3 × stdev 20 · Label Source 'Close' · repaint 끔 · 매끈하게 n = 499(앞 518봉 na) · 화살표 자리 값 = 종가 ± ATR(300) × 1.01(ATR 300 이 na 면 안 그려짐)
//<<복사 offline/fxb/meas_xb.js 41-43
const bn_NW_H = 6, bn_NW_K = 60, bn_NW_N = 499;
const bn_NW_G = (() => { const g = []; let G = 0; for (let i = 0; i <= bn_NW_N; i++) { const w = Math.exp(-1 * ((i * i) / (2 * (bn_NW_H * bn_NW_H)))); g.push(w); } for (let i = 0; i <= bn_NW_N; i++) G += g[i]; return { g, G }; })();
function bn_nwSmooth(x, K) { const n = x.length, o = new Float64Array(n).fill(NaN), { g, G } = bn_NW_G; for (let t = K; t < n; t++) { let s = 0, bad = false; for (let i = K; i >= 0; i--) { const v = x[t - i]; if (!isFinite(v)) { bad = true; break; } s += v * (g[i] / G); } if (!bad) o[t] = s; } return o; }
//>>
//<<복사 offline/fxb/meas_xb.js 45-45
function bn_arrows(C, U, D) { const n = C.length, b = new Uint8Array(n), s = new Uint8Array(n); for (let t = 1; t < n; t++) { if (C[t] <= D[t] && C[t - 1] >= D[t]) b[t] = 1; if (C[t] >= U[t] && C[t - 1] <= U[t]) s[t] = 1; } return { b, s }; }
//>>
function bn_core(rows, T, K, mask) { const T_ = T;   // [더함] 앞 측정 bands 가 부르는 T_(= offline/_pta.js) 를 받은 T 로 이음 · K = 매끈하게 길이(원문 499) · mask = ATR(300) na 봉 지움(원문 그림)
//<<복사 offline/fxb/meas_xb.js 44-44
function bn_bands(src, n, k) { const m = T_.sma(src, n), sd = T_.stdev(src, n), U = new Float64Array(src.length), D = new Float64Array(src.length); for (let t = 0; t < src.length; t++) { U[t] = m[t] + k * sd[t]; D[t] = m[t] - k * sd[t]; } return { U, D }; }
//>>
  const n = rows.length, C = rows.map(r => r.close), tp = rows.map(r => (r.high + r.low + r.close) / 3), BB = bn_bands(tp, 20, 3), SU = bn_nwSmooth(BB.U, K), SD = bn_nwSmooth(BB.D, K), AN = bn_arrows(C, SU, SD);   // meas_xb.js 93줄 꼴(NW_K 자리만 인자 K)
  const sp = T.atr(rows.map(r => r.high), rows.map(r => r.low), C, 300), B = new Uint8Array(n), S = new Uint8Array(n);   // 원문 spacing = ta.atr(300) · 화살표 값 = 종가 ∓ spacing × 1.01 · na 면 plotshape 가 안 그림
  for (let t = 0; t < n; t++) { const ok = !mask || T.fin(sp[t]); if (AN.b[t] && ok) B[t] = 1; if (AN.s[t] && ok) S[t] = 1; }
  let first = -1; for (let t = 0; t < n; t++) if (T.fin(SU[t]) && T.fin(SD[t])) { first = t; break; }
  return { B, S, info: { firstBand: first } }; }
function bnSig(rows, intra, T) { return bn_core(rows, T, bn_NW_N, true); }   // 원문 그대로: K = 499 · ATR(300) 그림 규칙 — 앞 측정 offline/fxb 는 K = 60(값은 1e−12 안에서 같고 앞 na 구간만 짧음 · defs_g3.md)

// ═══ gtf — Gaussian Trend Filter(Lyro RS) · 매수 = flipUp('Long Flip' · 'Bullish Flip' 알림) · 매도 = flipDown('Short Flip' · 'Bearish Flip') · 기본 Kernel Length 30 · Blur Width 0.35 ═══
//<<복사 offline/gtf/meas_gt.js 25-28
function gtf_gaussma(s, len, sigma) { const n = s.length, out = new Array(n).fill(null), w = []; let den = 0; for (let i = 0; i < len; i++) { const x = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(x); den += x; }
  for (let t = len - 1; t < n; t++) { let num = 0, ok = true; for (let i = 0; i < len; i++) { const v = s[t - i]; if (v == null) { ok = false; break; } num += v * w[i]; } if (ok) out[t] = num / den; } return out; }
function gtf_gtf(Cc, len, sp) { const sg = len * sp, b1 = gtf_gaussma(Cc, len, sg), b2 = gtf_gaussma(b1, len, sg), n = Cc.length, tr = new Array(n).fill(0); let cur = 0;
  for (let t = 0; t < n; t++) { if (t > 0 && b2[t] != null && b2[t - 1] != null) { if (b2[t] > b2[t - 1] && Cc[t] > b2[t]) cur = 1; else if (b2[t] < b2[t - 1] && Cc[t] < b2[t]) cur = -1; } tr[t] = cur; } return { b2, tr }; }
//>>
function gtfSig(rows, intra, T) { const n = rows.length, C = rows.map(r => r.close), G = gtf_gtf(C, 30, 0.35), B = new Uint8Array(n), S = new Uint8Array(n);
  for (let t = 1; t < n; t++) { if (G.tr[t] === 1 && G.tr[t - 1] !== 1) B[t] = 1; if (G.tr[t] === -1 && G.tr[t - 1] !== -1) S[t] = 1; }   // 원문 70 · 71줄(봉 0 은 trend 0 이라 신호 없음)
  let first = -1; for (let t = 0; t < n; t++) if (G.b2[t] != null) { first = t; break; }
  return { B, S, info: { firstBlur2: first } }; }

// ═══ rswb — RSWB Momentum Confirmation v1 · 매수 = bullConfirm(초록 점 · 'Bullish Confirmation') · 매도 = bearConfirm(빨간 점 · 'Bearish Confirmation') ═══
//   bullConfirm = ta.crossover(hist, hist[1]) 그리고 RSI(14) < 35 · bearConfirm = ta.crossunder(hist, hist[1]) 그리고 RSI(14) > 65 · hist = MACD(12, 26, 9) 히스토그램
//<<복사 offline/gtf/meas_gt2.js 29-30
function rswb_rsi(Cc, P) { const n = Cc.length, out = new Array(n).fill(null); let ag = 0, al = 0;
  for (let t = 1; t < n; t++) { const d = Cc[t] - Cc[t - 1], g = Math.max(d, 0), l = Math.max(-d, 0); if (t <= P) { ag += g; al += l; if (t === P) { ag /= P; al /= P; out[t] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } } else { ag = (ag * (P - 1) + g) / P; al = (al * (P - 1) + l) / P; out[t] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } } return out; }
//>>
//<<복사 offline/gtf/meas_gt2.js 50-53
function rswb_emaP(s, len) { const n = s.length, out = new Array(n).fill(null), a = 2 / (len + 1); let prev = null, buf = [];
  for (let t = 0; t < n; t++) { const v = s[t]; if (prev == null) { if (v == null) { buf = []; continue; } buf.push(v); if (buf.length > len) buf.shift(); if (buf.length === len) { prev = buf.reduce((x, y) => x + y, 0) / len; out[t] = prev; } } else { prev = a * v + (1 - a) * prev; out[t] = prev; } } return out; }
function rswb_macdHist(Cc) { const f = rswb_emaP(Cc, 12), s = rswb_emaP(Cc, 26), m = Cc.map((_, i) => (f[i] != null && s[i] != null) ? f[i] - s[i] : null), sg = rswb_emaP(m, 9); return m.map((v, i) => (v != null && sg[i] != null) ? v - sg[i] : null); }
function rswb_dots(Hh, R14) { const n = Hh.length, bull = new Uint8Array(n), bear = new Uint8Array(n); for (let t = 2; t < n; t++) { const a = Hh[t], b = Hh[t - 1], c = Hh[t - 2]; if (a == null || b == null || c == null || R14[t] == null) continue; if (a > b && b <= c && R14[t] < 35) bull[t] = 1; if (a < b && b >= c && R14[t] > 65) bear[t] = 1; } return { bull, bear }; }
//>>
function rswbSig(rows, intra, T) { const C = rows.map(r => r.close), D = rswb_dots(rswb_macdHist(C), rswb_rsi(C, 14));   // meas_gt2.js 62줄 꼴(R14 = rsi(Cc, 14) · Hh = macdHist(Cc) · D = dots(Hh, R14))
  return { B: D.bull, S: D.bear, info: {} }; }
return { mlrSig, bnSig, gtfSig, rswbSig };
})();
// ── [S1858] 새 칩 14 붙이기 — 앞 17칩 셈(labChips)은 그대로 · 새 칩은 T_(파인 약속 17이름)로 ──
const CHIP_IDS2 = CHIP_IDS.concat(["zl","ht","gtf","rswb","st3x","jst","strv","stx","vwst","src","srlr","bn","lg","mlr"]);
const NEW_FN = { zl: G2.zlSig, ht: G2.htSig, gtf: G3.gtfSig, rswb: G3.rswbSig, st3x: G1A.st3xSig, jst: G1A.jstSig, strv: G1B.strvSig, stx: G1A.stxSig, vwst: G1A.vwstSig, src: G2.srcSig, srlr: G2.srlrSig, bn: G3.bnSig, lg: G2.lgSig, mlr: G3.mlrSig };
function labChips2(rows, intra) { const R = labChips(rows, intra); R.info.err = R.info.err || {};
  for (const id of ["zl","ht","gtf","rswb","st3x","jst","strv","stx","vwst","src","srlr","bn","lg","mlr"]) { let r = null; try { r = NEW_FN[id](rows, intra, T_); } catch (e) { r = null; R.info.err[id] = String(e && e.message || e); }
    R.buy[id] = (r && r.B) ? r.B : new Uint8Array(rows.length); R.sell[id] = (r && r.S) ? r.S : new Uint8Array(rows.length); }
  return R; }
if(typeof window!=='undefined') window.SXSigLab = { CHIP_IDS: CHIP_IDS2, chips: labChips2, card: (typeof labCard==='function')?labCard:null, comb: (typeof labComb==='function')?labComb:null };
if(typeof module!=='undefined' && module.exports) module.exports = { CHIP_IDS: CHIP_IDS2, CHIP_IDS17: CHIP_IDS, labChips: labChips2, labChips17: labChips, NEW_FN, astDir, mlmiPred, knnsSig, logrSig, labCard, labComb };
})();
