// sx_tvind_nolic.js — [S1864] 풀차트 TradingView 지표 · 라이선스 표기 없는 소스(원본 머리에 라이선스 줄이 없음)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   원본 소스 = offline/tvchart/*.txt (사용자가 TradingView 에서 고름 · 2026-11-02)
//     ① Squeeze Momentum Indicator [LazyBear] — 작성자 LazyBear · 라이선스 표기 없음 · "Squeeze Momentum Indicator (by LazyBear).txt"
//     ② UT Bot Alerts — 작성자 표기 없음 · 라이선스 표기 없음 · "UT Bot Alerts.txt"
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
if (typeof module !== 'undefined' && module.exports) module.exports = { sqzCalc, utCalc, trF };
})();
