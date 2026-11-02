// sx_tvind_nolic.js — [S1864] 풀차트 TradingView 지표 · 라이선스 표기 없는 소스(원본 머리에 라이선스 줄이 없음)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   원본 소스 = offline/tvchart/*.txt (사용자가 TradingView 에서 고름 · 2026-11-02)
//     ① Squeeze Momentum Indicator [LazyBear] — 작성자 LazyBear · 라이선스 표기 없음 · "Squeeze Momentum Indicator (by LazyBear).txt"
//     ② UT Bot Alerts — 작성자 표기 없음 · 라이선스 표기 없음 · "UT Bot Alerts.txt"
//     ③ [S1866] WaveTrend Oscillator [Krypt] — 작성자 Krypt · 라이선스 표기 없음 · "WaveTrend Oscillator.txt"(파인 v3)
//     ④ [S1866] CM_Williams_Vix_Fix — 작성자 ChrisMoody · 라이선스 표기 없음 · "CM_Williams_Vix_Fix.txt"
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만). 앱이 더한 설정은 이름에 '앱' 을 단다.
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin, nz = T.nz;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na(+null 이 0 이 되지 않게)
const fmt = v => !fin(v) ? '' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3)));   // 축 · 값 글자(지수 꼴 안 씀)
function cols(rows) { const n = rows.length, O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; O[i] = num(r.open); H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); V[i] = num(r.volume); } return { n, O, H, L, C, V }; }
// 파인 `tr`(= tr(false)) — 앞 종가가 없으면(첫 봉) na · 셋 중 하나라도 숫자가 아니면 na
function trF(H, L, C) { const N = C.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { if (t === 0) { o[t] = NaN; continue; } const a = H[t] - L[t], b = Math.abs(H[t] - C[t - 1]), c = Math.abs(L[t] - C[t - 1]); o[t] = (fin(a) && fin(b) && fin(c)) ? Math.max(a, b, c) : NaN; } return o; }

// ── ① Squeeze Momentum Indicator [LazyBear] ──
//   원본: basis = sma(close, length) · dev = multKC * stdev(close, length)  ← 원본 버릇(BB MultFactor 를 안 씀)
//         ma = sma(close, lengthKC) · range = useTrueRange ? tr : high − low · rangema = sma(range, lengthKC) · KC = ma ± rangema × multKC
//         sqzOn = lowerBB > lowerKC and upperBB < upperKC · sqzOff = lowerBB < lowerKC and upperBB > upperKC · noSqz = 둘 다 아님
//         val = linreg(close − avg(avg(highest(high, lengthKC), lowest(low, lengthKC)), sma(close, lengthKC)), lengthKC, 0)
//         막대 색: val > 0 → (val > nz(val[1]) ? lime : green) · 아니면 (val < nz(val[1]) ? red : maroon) · 0선 점: noSqz 파랑 · sqzOn 검정 · 아니면 회색
function sqzCalc(rows, p) {
  const { n, H, L, C } = cols(rows), len = p.length, lenKC = p.lengthKC, kBB = p.useBBMult ? p.mult : p.multKC;
  const basis = T.sma(C, len), sd = T.stdev(C, len), ma = T.sma(C, lenKC);
  let rg; if (p.useTrueRange) rg = trF(H, L, C); else { rg = new Float64Array(n); for (let t = 0; t < n; t++) rg[t] = H[t] - L[t]; }
  const rgm = T.sma(rg, lenKC), hh = T.highest(H, lenKC), ll = T.lowest(L, lenKC), x = new Float64Array(n);
  for (let t = 0; t < n; t++) x[t] = C[t] - ((hh[t] + ll[t]) / 2 + ma[t]) / 2;
  const val = T.linreg(x, lenKC), sc = new Int8Array(n), bc = new Int8Array(n);
  for (let t = 0; t < n; t++) {
    const uB = basis[t] + kBB * sd[t], lB = basis[t] - kBB * sd[t], uK = ma[t] + rgm[t] * p.multKC, lK = ma[t] - rgm[t] * p.multKC;
    const on = (lB > lK) && (uB < uK), off = (lB < lK) && (uB > uK);
    sc[t] = on ? 1 : (off ? 2 : 0);   // 0 = 없음(파랑) · 1 = 켜짐(검정) · 2 = 풀림(회색)
    const v = val[t], pv = t > 0 ? nz(val[t - 1]) : 0;
    bc[t] = !fin(v) ? -1 : (v > 0 ? (v > pv ? 0 : 1) : (v < pv ? 2 : 3));   // 0 라임 · 1 초록 · 2 빨강 · 3 밤색 · −1 그리지 않음
  }
  return { val, sc, bc };
}
const SQZ_BC = ['#00e600', '#008000', '#ff0000', '#800000'], SQZ_SC = ['#2962ff', '#000000', '#9e9e9e'];
TV.reg({
  id: 'sqz', place: 'pane', name: 'Squeeze Momentum Indicator [LazyBear]', short: 'SQZMOM_LB', kname: '스퀴즈 모멘텀',
  author: 'LazyBear', license: '라이선스 표기 없음', srcFile: 'Squeeze Momentum Indicator (by LazyBear).txt',
  inputs: [
    { k: 'length', nm: 'BB 길이', o: 'BB Length', t: 'int', d: 20, min: 1, max: 500 },
    { k: 'mult', nm: 'BB 배수', o: 'BB MultFactor', t: 'float', d: 2.0, min: 0.1, max: 50, step: 0.1 },
    { k: 'lengthKC', nm: 'KC 길이', o: 'KC Length', t: 'int', d: 20, min: 2, max: 500 },
    { k: 'multKC', nm: 'KC 배수', o: 'KC MultFactor', t: 'float', d: 1.5, min: 0.1, max: 50, step: 0.1 },
    { k: 'useTrueRange', nm: 'KC 에 True Range 쓰기', o: 'Use TrueRange (KC)', t: 'bool', d: true },
    { k: 'useBBMult', nm: '볼밴 폭에 BB 배수 쓰기(앱 · 원본은 KC 배수를 씀)', o: '—', t: 'bool', d: false, app: true }
  ],
  legend: p => 'SQZMOM_LB ' + [p.length, p.mult, p.lengthKC, p.multKC].join(' ') + (p.useBBMult ? ' · BB배수' : ''),
  calc: sqzCalc,
  drawPane(ctx, R, G) {   // 막대(넓이 4) + 0선 점(십자)
    let mx = 0; for (let i = G.s; i < G.e; i++) { const v = R.val[i]; if (fin(v) && Math.abs(v) > mx) mx = Math.abs(v); } if (!(mx > 0)) mx = 1;
    const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + ch / 2 - (v / mx) * (ch / 2 * 0.92);
    for (let i = G.s; i < G.e; i++) { const v = R.val[i], c = R.bc[i]; if (c < 0) continue; const x = G.x(i), bw = Math.max(G.cw * 0.7, 1);
      ctx.fillStyle = SQZ_BC[c]; const y0 = y(0), y1 = y(v); ctx.fillRect(x - bw / 2, Math.min(y0, y1), bw, Math.max(Math.abs(y1 - y0), 0.5)); }
    const r = Math.max(Math.min(G.cw * 0.32, 3), 1.2);
    for (let i = G.s; i < G.e; i++) { const x = G.x(i), y0 = y(0); ctx.strokeStyle = SQZ_SC[R.sc[i]]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - r, y0 - r); ctx.lineTo(x + r, y0 + r); ctx.moveTo(x + r, y0 - r); ctx.lineTo(x - r, y0 + r); ctx.stroke(); }
    G.axisText(ctx, fmt(mx), fmt(-mx));
    const li = G.e - 1, lv = R.val[li]; if (fin(lv)) { ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = SQZ_BC[R.bc[li]] || '#888'; ctx.fillText(fmt(lv) + ' · ' + ['스퀴즈 없음', '스퀴즈 켜짐', '스퀴즈 풀림'][R.sc[li]], G.pad.l + 4, G.pad.t + 9); }
  }
});

// ── ② UT Bot Alerts ──
//   원본: xATR = atr(c) · nLoss = a × xATR · src = h ? 하이킨아시 종가 : close
//         xATRTrailingStop = iff(src > nz(ts[1], 0) and src[1] > nz(ts[1], 0), max(nz(ts[1]), src − nLoss),
//                            iff(src < nz(ts[1], 0) and src[1] < nz(ts[1], 0), min(nz(ts[1]), src + nLoss), iff(src > nz(ts[1], 0), src − nLoss, src + nLoss)))
//         pos = iff(src[1] < nz(ts[1], 0) and src > nz(ts[1], 0), 1, iff(src[1] > nz(ts[1], 0) and src < nz(ts[1], 0), −1, nz(pos[1], 0)))  (원본 xcolor — 계산만 하고 안 그림)
//         buy = src > ts and crossover(ema(src, 1), ts) · sell = src < ts and crossover(ts, ema(src, 1)) · barcolor: src > ts 초록 · src < ts 빨강
//   ema(src, 1) = src(파인 약속 · 첫 값 = 첫 1개 평균) · 하이킨아시 종가 = (시 + 고 + 저 + 종) / 4(원래 봉 · security lookahead 끔 · 같은 주기)
function utCalc(rows, p) {
  const { n, O, H, L, C } = cols(rows), A = T.atr(H, L, C, p.atrLen), src = new Float64Array(n);
  for (let t = 0; t < n; t++) src[t] = p.ha ? (O[t] + H[t] + L[t] + C[t]) / 4 : C[t];
  const ts = new Float64Array(n), pos = new Int8Array(n), buy = new Uint8Array(n), sell = new Uint8Array(n), side = new Int8Array(n);
  for (let t = 0; t < n; t++) {
    const q = (t > 0 && fin(ts[t - 1])) ? ts[t - 1] : 0, loss = p.key * A[t], s = src[t], s1 = t > 0 ? src[t - 1] : NaN;
    if (!fin(loss) || !fin(s)) ts[t] = NaN;
    else ts[t] = (s > q && s1 > q) ? Math.max(q, s - loss) : (s < q && s1 < q) ? Math.min(q, s + loss) : (s > q ? s - loss : s + loss);
    pos[t] = (s1 < q && s > q) ? 1 : (s1 > q && s < q) ? -1 : (t > 0 ? pos[t - 1] : 0);
    if (t > 0 && fin(ts[t]) && fin(ts[t - 1]) && fin(s) && fin(s1)) { if (s > ts[t] && s1 <= ts[t - 1]) buy[t] = 1; if (ts[t] > s && ts[t - 1] <= s1) sell[t] = 1; }
    side[t] = (fin(ts[t]) && s > ts[t]) ? 1 : ((fin(ts[t]) && s < ts[t]) ? -1 : 0);
  }
  return { ts, pos, buy, sell, side };
}
TV.reg({
  id: 'ut', place: 'over', name: 'UT Bot Alerts', short: 'UT Bot', kname: 'UT Bot',
  author: '표기 없음', license: '라이선스 표기 없음', srcFile: 'UT Bot Alerts.txt',
  inputs: [
    { k: 'key', nm: '키 값(민감도)', o: "Key Vaule. 'This changes the sensitivity'", t: 'float', d: 1, min: 0.1, max: 50, step: 0.1 },
    { k: 'atrLen', nm: 'ATR 기간', o: 'ATR Period', t: 'int', d: 10, min: 1, max: 500 },
    { k: 'ha', nm: '하이킨아시 봉으로 신호', o: 'Signals from Heikin Ashi Candles', t: 'bool', d: false },
    { k: 'line', nm: '추적선 보이기(앱 · 원본은 계산만 함)', o: '—', t: 'bool', d: true, app: true },
    { k: 'barc', nm: '봉 색칠(원본 · 초록/빨강)', o: 'barcolor', t: 'bool', d: false, app: true }
  ],
  legend: p => 'UT Bot ' + p.key + ' ' + p.atrLen + (p.ha ? ' HA' : ''),
  calc: utCalc,
  range(R, s, e, p, out) { if (!p.line) return; for (let i = s; i < e; i++) if (fin(R.ts[i])) out.push(R.ts[i]); },
  barColor(R, i, p) { if (!p.barc) return null; return R.side[i] > 0 ? '#22c55e' : (R.side[i] < 0 ? '#ef4444' : null); },
  draw(ctx, R, G, p) {
    if (p.line) { ctx.save(); ctx.lineWidth = 1.4; for (let i = Math.max(G.s, 1); i < G.e; i++) { const a = R.ts[i - 1], b = R.ts[i]; if (!fin(a) || !fin(b) || i - 1 < G.s) continue;
      ctx.strokeStyle = R.pos[i] === 1 ? '#16a34a' : (R.pos[i] === -1 ? '#dc2626' : '#2563eb'); ctx.beginPath(); ctx.moveTo(G.x(i - 1), G.y(a)); ctx.lineTo(G.x(i), G.y(b)); ctx.stroke(); } ctx.restore(); }
    for (let i = G.s; i < G.e; i++) { if (R.buy[i]) G.label(i, 'UT▲', '#16a34a', false); if (R.sell[i]) G.label(i, 'UT▼', '#dc2626', true); }
  }
});
// ── ③ [S1866] WaveTrend Oscillator [Krypt](파인 v3) ──
//   원본: price = log(dropn(src, 1)) · delta = price − xema(price, n1) · d = xema(abs(delta), n1) · ci = d == 0 ? 0 : delta / d
//         sig = EhlersSuperSmoother(xema(ci, n2), smoothing) · ma = sma(sig, maperiod) · 히스토그램 = sig − ma
//         xema: res := mult × src + (1 − mult) × nz(res[1], src) · 슈퍼스무더: filt := nz(c1 × (src + nz(src[1], src)) + c2 × filt[1] + c3 × nz(filt[2], filt[1]), src) · PI = 3.14159265359(원본 상수)
//         매수 · 매도 점 = allbottoms · alltops(교차 + 5봉 합) · step · casc · cdesc · findhidden(원본 식 그대로) — 파인 v3 에서 실수의 참 = 0 도 na 도 아님
//   na = 숫자가 아님(유한하지 않음) · 비교에 na 가 끼면 거짓 · nz(x, y) = x 가 na 면 y
const WT_PI = 3.14159265359;
const isNa = x => !fin(x), nzv = (x, y) => fin(x) ? x : y, truthy = x => fin(x) && x !== 0;
function wtDropn(src, k) { const N = src.length, o = new Float64Array(N); for (let t = 0; t < N; t++) o[t] = (t < k || isNa(src[t - k])) ? NaN : src[t]; return o; }
function wtXema(src, len) { const N = src.length, o = new Float64Array(N), m = 2.0 / (len + 1.0); for (let t = 0; t < N; t++) { const p = nzv(t > 0 ? o[t - 1] : NaN, src[t]); o[t] = m * src[t] + (1.0 - m) * p; } return o; }
function wtSuper(src, lower) { const N = src.length, o = new Float64Array(N), a1 = Math.exp(-WT_PI * Math.sqrt(2) / lower), c2 = 2 * a1 * Math.cos(Math.sqrt(2) * WT_PI / lower), c3 = -Math.pow(a1, 2), c1 = (1 - c2 - c3) / 2;
  for (let t = 0; t < N; t++) { const s1 = nzv(t > 0 ? src[t - 1] : NaN, src[t]), f1 = t > 0 ? o[t - 1] : NaN, f2 = nzv(t > 1 ? o[t - 2] : NaN, f1); o[t] = nzv(c1 * (src[t] + s1) + c2 * f1 + c3 * f2, src[t]); } return o; }
function wtStep(xs, vals) { const N = vals.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const v = xs[t] ? vals[t] : (t > 0 ? o[t - 1] : NaN); o[t] = nzv(v, vals[t]); } return o; }
function wtCasc(xs, start, wh) { const N = xs.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const x1 = t > 0 ? xs[t - 1] : NaN, r1 = t > 0 ? o[t - 1] : NaN;
    const v = (start[t] && xs[t] > x1 && !truthy(r1) && wh[t]) ? xs[t] - x1 : ((xs[t] >= x1 && wh[t]) ? r1 + xs[t] - x1 : 0.0); o[t] = Math.abs(nzv(v, 0)); } return o; }
function wtCdesc(xs, start, wh) { const N = xs.length, o = new Float64Array(N); for (let t = 0; t < N; t++) { const x1 = t > 0 ? xs[t - 1] : NaN, r1 = t > 0 ? o[t - 1] : NaN;
    const v = (start[t] && xs[t] < x1 && !truthy(r1) && wh[t]) ? x1 - xs[t] : ((xs[t] <= x1 && wh[t]) ? r1 + x1 - xs[t] : 0.0); o[t] = Math.abs(nzv(v, 0)); } return o; }
function wtkCalc(rows, p) {
  const { n, C } = cols(rows), ON = new Uint8Array(n).fill(1);
  const price = wtDropn(C, 1); for (let t = 0; t < n; t++) price[t] = Math.log(price[t]);
  const xe = wtXema(price, p.n1), delta = new Float64Array(n); for (let t = 0; t < n; t++) delta[t] = price[t] - xe[t];
  const ad = new Float64Array(n); for (let t = 0; t < n; t++) ad[t] = Math.abs(delta[t]);
  const d = wtXema(ad, p.n1), ci = new Float64Array(n); for (let t = 0; t < n; t++) ci[t] = (d[t] === 0) ? 0 : delta[t] / d[t];
  const sig = wtSuper(wtXema(ci, p.n2), p.smoothing), ma = T.sma(sig, p.maperiod);
  const ob = p.ob, os = p.os, mid = (ob + os) / 2, exoff = (ob - mid) / 7, ploff = (ob - mid) / 8, hup = mid + 0.61803398875, hlo = mid - 0.61803398875;
  const sum5 = a => { const o = new Float64Array(n); for (let t = 0; t < n; t++) { if (t < 4) { o[t] = NaN; continue; } let s = 0, ok = true; for (let j = t - 4; j <= t; j++) { if (isNa(a[j])) { ok = false; break; } s += a[j]; } o[t] = ok ? s : NaN; } return o; };
  const ss = sum5(sig), sm = sum5(ma), ab = new Uint8Array(n), at = new Uint8Array(n);
  for (let t = 1; t < n; t++) { if (!p.showsignals) continue;
    const xo = fin(sig[t]) && fin(ma[t]) && fin(sig[t - 1]) && fin(ma[t - 1]) && sig[t] > ma[t] && sig[t - 1] <= ma[t - 1], xu = fin(sig[t]) && fin(ma[t]) && fin(sig[t - 1]) && fin(ma[t - 1]) && sig[t] < ma[t] && sig[t - 1] >= ma[t - 1];
    ab[t] = (ma[t] < ob && xo && ss[t - 1] < sm[t - 1]) ? 1 : 0; at[t] = (ma[t] > os && xu && ss[t - 1] > sm[t - 1]) ? 1 : 0; }
  const bst = wtStep(ab, ma), tst = wtStep(at, ma);
  const pb = wtStep(ab, T.lowest(price, 5)), pt = wtStep(at, T.highest(price, 5));
  const c1 = wtCdesc(bst, ON, ON), c2 = wtCasc(pb, ON, ON), c3 = wtCasc(tst, ON, ON), c4 = wtCdesc(pt, ON, ON), hb = new Float64Array(n), hr = new Float64Array(n);
  for (let t = 0; t < n; t++) { const hbull = Math.sqrt(c1[t] * c2[t]), hbear = Math.sqrt(c3[t] * c4[t]); hb[t] = hbull / (1.0 + hbear); hr[t] = hbear / (1.0 + hbull); }
  const stB = new Uint8Array(n), whB = new Uint8Array(n), stR = new Uint8Array(n), whR = new Uint8Array(n);
  for (let t = 0; t < n; t++) { const b1 = t > 0 ? bst[t - 1] : NaN, r1 = t > 0 ? tst[t - 1] : NaN, hb1 = t > 0 ? hb[t - 1] : NaN, hr1 = t > 0 ? hr[t - 1] : NaN;
    stB[t] = (b1 < os || hb1 > hr1) ? 1 : 0; whB[t] = (sig[t] < ob) ? 1 : 0; stR[t] = (r1 > ob || hr1 > hb1) ? 1 : 0; whR[t] = (sig[t] > os) ? 1 : 0; }
  const pbu = wtCasc(bst, stB, whB), pbe = wtCdesc(tst, stR, whR), buy = new Uint8Array(n), sell = new Uint8Array(n);
  for (let t = 0; t < n; t++) { const bt = pbu[t] / (1.0 + pbe[t]), rt = pbe[t] / (1.0 + pbu[t]), s1 = t > 0 ? sig[t - 1] : NaN;
    buy[t] = (ab[t] && ((ma[t] < mid && (s1 < os - exoff || bt > hr[t])) || (ma[t] < hup && hb[t] > rt))) ? 1 : 0;
    sell[t] = (at[t] && ((ma[t] > mid && (s1 > ob + exoff || rt > hb[t])) || (ma[t] > hlo && hr[t] > bt))) ? 1 : 0; }
  return { sig, ma, buy, sell, ploff };
}
TV.reg({
  id: 'wtk', place: 'pane', name: 'WaveTrend Oscillator [Krypt]', short: 'WT_Krypt', kname: 'WaveTrend [Krypt]',
  author: 'Krypt', license: '라이선스 표기 없음', srcFile: 'WaveTrend Oscillator.txt',
  inputs: [
    { k: 'n1', nm: '채널 길이', o: 'Channel Length', t: 'int', d: 10, min: 1, max: 200 },
    { k: 'n2', nm: '평균 길이', o: 'Average Length', t: 'int', d: 21, min: 1, max: 200 },
    { k: 'smoothing', nm: '시그널 스무딩', o: 'Signal Smoothing', t: 'int', d: 4, min: 0, max: 100 },
    { k: 'maperiod', nm: 'MA 기간', o: 'MA Period', t: 'int', d: 4, min: 1, max: 100 },
    { k: 'ob', nm: '과매수 줄', o: 'Overbought Level', t: 'float', d: 0.75, min: 0, max: 5, step: 0.05 },
    { k: 'os', nm: '과매도 줄', o: 'Oversold Level', t: 'float', d: -0.75, min: -5, max: 0, step: 0.05 },
    { k: 'showhist', nm: '히스토그램', o: 'Histogram', t: 'bool', d: true },
    { k: 'showsignals', nm: '매수 · 매도 신호', o: 'Buy/Sell Signals', t: 'bool', d: true }
  ],
  legend: p => 'WT_Krypt ' + [p.n1, p.n2, p.smoothing, p.maperiod].join(' '),
  calc: wtkCalc,
  drawPane(ctx, R, G, p) {
    let lo = Math.min(p.os, -1), hi = Math.max(p.ob, 1); for (let i = G.s; i < G.e; i++) { for (const v of [R.sig[i], R.ma[i]]) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    lo -= 0.15; hi += 0.15; const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + (hi - v) / (hi - lo) * ch, L = G.pad.l, Rx = G.W - G.pad.r;
    ctx.save(); ctx.lineWidth = 1; [[p.ob, '#00bb00'], [p.os, '#ff9800']].forEach(([v, c]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(Rx, y(v)); ctx.stroke(); }); ctx.restore();
    for (let i = G.s; i < G.e; i++) { const v = R.sig[i]; if (!fin(v)) continue; const x = G.x(i), w = Math.max(G.cw, 1);   // 과매도 · 과매수 영역 채움(원본 fill)
      if (v < p.os) { ctx.fillStyle = 'rgba(255,152,0,.45)'; ctx.fillRect(x - w / 2, y(p.os), w, y(v) - y(p.os)); } if (v > p.ob) { ctx.fillStyle = 'rgba(0,187,0,.35)'; ctx.fillRect(x - w / 2, y(v), w, y(p.ob) - y(v)); } }
    if (p.showhist) for (let i = G.s; i < G.e; i++) { const a = R.sig[i], b = R.ma[i]; if (!fin(a) || !fin(b)) continue; const x = G.x(i), w = Math.max(G.cw, 1), y0 = y(0), y1 = y(a - b); ctx.fillStyle = a > b ? 'rgba(95,200,255,.35)' : 'rgba(255,153,0,.35)'; ctx.fillRect(x - w / 2, Math.min(y0, y1), w, Math.max(Math.abs(y1 - y0), 0.5)); }
    const line = (arr, col) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = arr[i]; if (!fin(v)) { on = false; continue; } if (!on) { ctx.moveTo(G.x(i), y(v)); on = true; } else ctx.lineTo(G.x(i), y(v)); } ctx.stroke(); ctx.restore(); };
    line(R.sig, '#0094ff'); line(R.ma, '#ff6a00');
    for (let i = Math.max(G.s, 1); i < G.e; i++) { const s1 = R.sig[i - 1]; if (!fin(s1)) continue; const mk = (yy, col, txt, up) => { ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(G.x(i), yy, 3, 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold 8px Outfit,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(txt, G.x(i), up ? yy + 11 : yy - 6); ctx.restore(); };
      if (R.buy[i]) mk(y(s1 - R.ploff), '#008fff', 'WT▲', true); if (R.sell[i]) mk(y(s1 + R.ploff), '#ff0000', 'WT▼', false); }
    G.axisText(ctx, hi.toFixed(2), lo.toFixed(2));
    const li = G.e - 1; if (fin(R.sig[li])) { ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#0094ff'; ctx.fillText('시그널 ' + R.sig[li].toFixed(3), L + 4, G.pad.t + 9); if (fin(R.ma[li])) { ctx.fillStyle = '#ff6a00'; ctx.fillText('MA ' + R.ma[li].toFixed(3), L + 80, G.pad.t + 9); } }
  }
});

// ── ④ [S1866] CM_Williams_Vix_Fix(ChrisMoody) ──
//   원본: wvf = ((highest(close, pd) − low) / highest(close, pd)) × 100 · sDev = mult × stdev(wvf, bbl) · midLine = sma(wvf, bbl) · upperBand = midLine + sDev
//         rangeHigh = highest(wvf, lb) × ph · rangeLow = lowest(wvf, lb) × pl · 막대 색 = (wvf ≥ upperBand 또는 wvf ≥ rangeHigh) ? 라임 : 회색
function wvfCalc(rows, p) { const { n, L, C } = cols(rows), hc = T.highest(C, p.pd), w = new Float64Array(n);
  for (let t = 0; t < n; t++) w[t] = ((hc[t] - L[t]) / hc[t]) * 100;
  const sd = T.stdev(w, p.bbl), mid = T.sma(w, p.bbl), rh = T.highest(w, p.lb), rl = T.lowest(w, p.lb), ub = new Float64Array(n), RH = new Float64Array(n), RL = new Float64Array(n), g = new Uint8Array(n);
  for (let t = 0; t < n; t++) { ub[t] = mid[t] + p.mult * sd[t]; RH[t] = rh[t] * p.ph; RL[t] = rl[t] * p.pl; g[t] = (w[t] >= ub[t] || w[t] >= RH[t]) ? 1 : 0; }
  return { wvf: w, ub, rh: RH, rl: RL, g }; }
TV.reg({
  id: 'wvf', place: 'pane', name: 'CM_Williams_Vix_Fix', short: 'CM_WVF', kname: 'Williams Vix Fix',
  author: 'ChrisMoody', license: '라이선스 표기 없음', srcFile: 'CM_Williams_Vix_Fix.txt',
  inputs: [
    { k: 'pd', nm: '최고 종가 기간', o: 'LookBack Period Standard Deviation High', t: 'int', d: 22, min: 1, max: 200 },
    { k: 'bbl', nm: '볼밴 길이', o: 'Bolinger Band Length', t: 'int', d: 20, min: 1, max: 200 },
    { k: 'mult', nm: '볼밴 위 배수', o: 'Bollinger Band Standard Devaition Up', t: 'float', d: 2.0, min: 1, max: 5, step: 0.1 },
    { k: 'lb', nm: '백분위 기간', o: 'Look Back Period Percentile High', t: 'int', d: 50, min: 1, max: 300 },
    { k: 'ph', nm: '높은 백분위', o: 'Highest Percentile - 0.90=90%, 0.95=95%, 0.99=99%', t: 'float', d: 0.85, min: 0.5, max: 1, step: 0.01 },
    { k: 'pl', nm: '낮은 백분위', o: 'Lowest Percentile - 1.10=90%, 1.05=95%, 1.01=99%', t: 'float', d: 1.01, min: 1, max: 1.5, step: 0.01 },
    { k: 'hp', nm: '백분위 줄 보이기', o: 'Show High Range - Based on Percentile and LookBack Period?', t: 'bool', d: false },
    { k: 'sd', nm: '볼밴 위 줄 보이기', o: 'Show Standard Deviation Line?', t: 'bool', d: false }
  ],
  legend: p => 'CM_WVF ' + [p.pd, p.bbl, p.mult, p.lb, p.ph, p.pl].join(' '),
  calc: wvfCalc,
  drawPane(ctx, R, G, p) { let hi = 0; for (let i = G.s; i < G.e; i++) { for (const v of [R.wvf[i], p.sd ? R.ub[i] : NaN, p.hp ? R.rh[i] : NaN]) if (fin(v) && v > hi) hi = v; } if (!(hi > 0)) hi = 1;
    const ch = G.H - G.pad.t - G.pad.b, y = v => G.pad.t + (hi - v) / hi * ch;
    for (let i = G.s; i < G.e; i++) { const v = R.wvf[i]; if (!fin(v)) continue; const x = G.x(i), w = Math.max(G.cw * 0.7, 1); ctx.fillStyle = R.g[i] ? '#00e600' : '#9e9e9e'; ctx.fillRect(x - w / 2, y(v), w, Math.max(y(0) - y(v), 0.5)); }
    const line = (arr, col, lw) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = arr[i]; if (!fin(v)) { on = false; continue; } if (!on) { ctx.moveTo(G.x(i), y(v)); on = true; } else ctx.lineTo(G.x(i), y(v)); } ctx.stroke(); ctx.restore(); };
    if (p.hp) { line(R.rh, '#ff9800', 2); line(R.rl, '#ff9800', 2); } if (p.sd) line(R.ub, '#00bcd4', 1.5);
    G.axisText(ctx, hi.toFixed(1), '0');
    const li = G.e - 1; if (fin(R.wvf[li])) { ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = R.g[li] ? '#00a000' : '#6b7280'; ctx.fillText('WVF ' + R.wvf[li].toFixed(2) + (R.g[li] ? ' · 공포 극단(라임)' : ''), G.pad.l + 4, G.pad.t + 9); } }
});
if (typeof module !== 'undefined' && module.exports) module.exports = { sqzCalc, utCalc, trF, wtkCalc, wvfCalc };
})();
