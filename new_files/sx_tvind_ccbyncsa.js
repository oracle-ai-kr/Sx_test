// sx_tvind_ccbyncsa.js — [S1864] 풀차트 TradingView 지표 · CC BY-NC-SA 4.0 소스(https://creativecommons.org/licenses/by-nc-sa/4.0/)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   이 파일은 아래 원본을 JS 로 옮긴 것이고 같은 라이선스(CC BY-NC-SA 4.0 · 비상업 · 같은 조건 나눔)를 따른다.
//     ① Support and Resistance Levels with Breaks [LuxAlgo] — © LuxAlgo · CC BY-NC-SA 4.0 · 원본 = offline/tvchart/"Support and Resistance Levels with Breaks.txt"
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만). 앱이 더한 설정은 이름에 '앱' 을 단다.
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na(+null 이 0 이 되지 않게)

// ── ① Support and Resistance Levels with Breaks [LuxAlgo] ──
//   원본: highUsePivot = fixnan(pivothigh(leftBars, rightBars)[1]) · lowUsePivot = fixnan(pivotlow(leftBars, rightBars)[1])
//         plot(… color = change(x) ? na : 색, linewidth = 3, offset = −(rightBars + 1))
//         osc = 100 × (ema(volume, 5) − ema(volume, 10)) / ema(volume, 10)
//         'B'(빨강 · 위)        = toggleBreaks and crossunder(close, lowUsePivot) and not (open − close < high − open) and osc > volumeThresh
//         'B'(초록 · 아래)      = toggleBreaks and crossover(close, highUsePivot) and not (open − low > close − open) and osc > volumeThresh
//         'Bull Wick'(초록 · 아래) = toggleBreaks and crossover(close, highUsePivot) and open − low > close − open
//         'Bear Wick'(빨강 · 위)   = toggleBreaks and crossunder(close, lowUsePivot) and open − close < high − open
//   글자 = 약자 + ▲▼(사용자 2026-11-02 01:20): B → SR▲ · SR▼ · Wick → SR꼬리▲ · SR꼬리▼
function srbCalc(rows, p) {
  const n = rows.length, O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; O[i] = num(r.open); H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); V[i] = num(r.volume); }
  const ph = T.pivotHigh(H, p.leftBars, p.rightBars), pl = T.pivotLow(L, p.leftBars, p.rightBars), hp = new Float64Array(n), lp = new Float64Array(n);
  let lh = NaN, ll = NaN; for (let t = 0; t < n; t++) { const a = t > 0 ? ph[t - 1] : NaN, b = t > 0 ? pl[t - 1] : NaN; if (fin(a)) lh = a; if (fin(b)) ll = b; hp[t] = lh; lp[t] = ll; }
  const e5 = T.ema(V, 5), e10 = T.ema(V, 10), osc = new Float64Array(n);
  for (let t = 0; t < n; t++) osc[t] = (fin(e5[t]) && fin(e10[t]) && e10[t] !== 0) ? 100 * (e5[t] - e10[t]) / e10[t] : NaN;
  const bUp = new Uint8Array(n), bDn = new Uint8Array(n), wUp = new Uint8Array(n), wDn = new Uint8Array(n), gH = new Uint8Array(n), gL = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    if (t > 0) { gH[t] = (fin(hp[t]) && fin(hp[t - 1]) && hp[t] !== hp[t - 1]) ? 1 : 0; gL[t] = (fin(lp[t]) && fin(lp[t - 1]) && lp[t] !== lp[t - 1]) ? 1 : 0; }   // change(x) ≠ 0 → 그 봉 선 색 na(끊김)
    if (!p.toggleBreaks || t === 0) continue;
    const xo = fin(C[t]) && fin(C[t - 1]) && fin(hp[t]) && fin(hp[t - 1]) && C[t] > hp[t] && C[t - 1] <= hp[t - 1];
    const xu = fin(C[t]) && fin(C[t - 1]) && fin(lp[t]) && fin(lp[t - 1]) && C[t] < lp[t] && C[t - 1] >= lp[t - 1];
    const vol = osc[t] > p.volumeThresh, bullW = (O[t] - L[t]) > (C[t] - O[t]), bearW = (O[t] - C[t]) < (H[t] - O[t]);
    if (xu && !bearW && vol) bDn[t] = 1;
    if (xo && !bullW && vol) bUp[t] = 1;
    if (xo && bullW) wUp[t] = 1;
    if (xu && bearW) wDn[t] = 1;
  }
  return { hp, lp, gH, gL, osc, bUp, bDn, wUp, wDn };
}
TV.reg({
  id: 'srb', place: 'over', name: 'Support and Resistance Levels with Breaks [LuxAlgo]', short: 'S/R Breaks', kname: '지지/저항 돌파',
  author: 'LuxAlgo', license: 'CC BY-NC-SA 4.0', srcFile: 'Support and Resistance Levels with Breaks.txt',
  inputs: [
    { k: 'toggleBreaks', nm: '돌파 보이기', o: 'Show Breaks', t: 'bool', d: true },
    { k: 'leftBars', nm: '왼쪽 봉', o: 'Left Bars', t: 'int', d: 15, min: 1, max: 200 },
    { k: 'rightBars', nm: '오른쪽 봉', o: 'Right Bars', t: 'int', d: 15, min: 1, max: 200 },
    { k: 'volumeThresh', nm: '거래량 기준', o: 'Volume Threshold', t: 'float', d: 20, min: -100, max: 1000, step: 1 },
    { k: 'shift', nm: '선 앞으로 당겨 그리기(원본 · 오른쪽 봉 + 1)', o: 'offset', t: 'bool', d: true, app: true }
  ],
  legend: p => 'S/R Breaks ' + p.leftBars + ' ' + p.rightBars + ' ' + p.volumeThresh + (p.shift ? ' · 선 ' + (p.rightBars + 1) + '봉 당김' : ''),
  calc: srbCalc,
  _off: p => p.shift ? -(p.rightBars + 1) : 0,
  range(R, s, e, p, out) { const o = p.shift ? (p.rightBars + 1) : 0; for (let i = s; i < e; i++) { const j = i + o; if (j >= R.hp.length) break; if (fin(R.hp[j])) out.push(R.hp[j]); if (fin(R.lp[j])) out.push(R.lp[j]); } },
  draw(ctx, R, G, p) {
    const o = p.shift ? (p.rightBars + 1) : 0;   // 값 봉 t 를 화면 봉 t − o 자리에 그린다(원본 offset)
    ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'butt';
    [[R.hp, R.gH, '#ff0000'], [R.lp, R.gL, '#233dee']].forEach(([v, g, col]) => { ctx.strokeStyle = col;
      for (let t = 1; t < v.length; t++) { const xi = t - o; if (xi - 1 < G.s || xi >= G.e) continue; if (!fin(v[t]) || !fin(v[t - 1]) || g[t]) continue;
        ctx.beginPath(); ctx.moveTo(G.x(xi - 1), G.y(v[t - 1])); ctx.lineTo(G.x(xi), G.y(v[t])); ctx.stroke(); } });
    ctx.restore();
    for (let i = G.s; i < G.e; i++) { if (R.bUp[i]) G.label(i, 'SR▲', '#16a34a', false); if (R.wUp[i]) G.label(i, 'SR꼬리▲', '#16a34a', false); if (R.bDn[i]) G.label(i, 'SR▼', '#dc2626', true); if (R.wDn[i]) G.label(i, 'SR꼬리▼', '#dc2626', true); }
  }
});
if (typeof module !== 'undefined' && module.exports) module.exports = { srbCalc };
})();
