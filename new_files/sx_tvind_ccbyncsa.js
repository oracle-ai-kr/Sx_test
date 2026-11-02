// sx_tvind_ccbyncsa.js — [S1864] 풀차트 TradingView 지표 · CC BY-NC-SA 4.0 소스(https://creativecommons.org/licenses/by-nc-sa/4.0/)
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   이 파일은 아래 원본을 JS 로 옮긴 것이고 같은 라이선스(CC BY-NC-SA 4.0 · 비상업 · 같은 조건 나눔)를 따른다.
//     ① Support and Resistance Levels with Breaks [LuxAlgo] — © LuxAlgo · CC BY-NC-SA 4.0 · 원본 = offline/tvchart/"Support and Resistance Levels with Breaks.txt"
//     ② [S1866] Volume Profile [LuxAlgo] — © LuxAlgo · CC BY-NC-SA 4.0 · 원본 = offline/tvchart/"Volume Profile.txt"
//     ③ [S1868] Smart Money Concepts Pro [Neon] — © LuxAlgo(원본 Smart Money Concepts) · 파인 v6 옮김 · 고침 · Neon 화면(옮긴 이 이름 없음) · CC BY-NC-SA 4.0 · 원본 = offline/tvchart/"Smart Money Concepts (by LuxAlgo).txt"
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
// ── ② [S1866] Volume Profile [LuxAlgo] ──
//   원본(봉 t · 지난 length 봉): hh = highest(length) · ll = lowest(length) · levels[i] = ll + i / row × (hh − ll)(i = 0 … row)
//         sumv[j] = Σ_{k=0..length−1} (high[t−k] > levels[j] and low[t−k] < levels[j+1]) ? volume[t−k] : 0 · POC = 가장 큰 칸
//         막대 길이 = round(length × width / 100 × sumv[j] / max) · POC 점선(그리기는 마지막 sumv[j] = max 칸 · 롤링 POC 는 첫 칸 = array.indexof)
//   계산은 원본 그대로 · ★그리기는 화면 상자에 맞춤(사용자 2026-11-02 11:37 — 500봉 상자 왼쪽이 화면 밖이라 원본 자리면 막대가 안 보임): 기준 = 화면 왼쪽(뒤집기 = 오른쪽) · 길이 = 화면 폭 × width% × mult
//   빠른 셈: 봉 k 마다 닿는 칸이 이어져 있어(levels 오름차순) 그 칸들에만 더한다 — 칸마다 더하는 차례(k = 0 → length−1)는 원본과 같아 합이 글자 그대로 같다
function vpProfile(H, L, V, t, length, row) {   // 봉 t 의 프로파일 — { levels, sumv, max, first, last } 또는 null(봉 모자람 · 값 없음)
  if (t < length - 1) return null; let hh = -Infinity, ll = Infinity; for (let k = 0; k < length; k++) { const h = H[t - k], l = L[t - k]; if (h > hh) hh = h; if (l < ll) ll = l; }
  if (!fin(hh) || !fin(ll)) return null; const lv = new Float64Array(row + 1); for (let i = 0; i <= row; i++) lv[i] = ll + i / row * (hh - ll);
  const sv = new Float64Array(row);
  for (let k = 0; k < length; k++) { const i = t - k, h = H[i], l = L[i]; if (!(h > lv[0]) || !(l < lv[row])) continue;
    let a = 0, b = row - 1; while (a < b) { const m = (a + b) >> 1; if (lv[m + 1] > l) b = m; else a = m + 1; } const jlo = a;   // 첫 j: levels[j+1] > low
    a = 0; b = row - 1; while (a < b) { const m = (a + b + 1) >> 1; if (lv[m] < h) a = m; else b = m - 1; } const jhi = a;      // 끝 j: levels[j] < high
    for (let j = jlo; j <= jhi; j++) sv[j] += V[i]; }
  let mx = -Infinity, first = -1, last = -1; for (let j = 0; j < row; j++) { const v = sv[j]; if (v > mx) { mx = v; first = j; last = j; } else if (v === mx) last = j; }
  return { levels: lv, sumv: sv, max: mx, first, last }; }   // max 가 0 이면(거래량 0) 롤링 POC 는 첫 칸(원본 indexof) · 막대는 안 그림(mult = 0/0)
function vpCalc(rows, p) { const n = rows.length, H = new Float64Array(n), L = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; H[i] = num(r.high); L[i] = num(r.low); V[i] = num(r.volume); }
  const last = vpProfile(H, L, V, n - 1, p.length, p.row), rp = new Float64Array(n).fill(NaN);
  if (p.show_rpoc) for (let t = 0; t < n; t++) { const P = vpProfile(H, L, V, t, p.length, p.row); if (P && P.first >= 0 && fin(P.max)) rp[t] = (P.levels[P.first] + P.levels[P.first + 1]) / 2; }
  return { last, rpoc: rp }; }
TV.reg({
  id: 'vp', place: 'over', name: 'Volume Profile [LuxAlgo]', short: 'Volume Profile', kname: '볼륨 프로파일',
  author: 'LuxAlgo', license: 'CC BY-NC-SA 4.0', srcFile: 'Volume Profile.txt',
  inputs: [
    { k: 'length', nm: '살펴볼 봉', o: 'Lookback', t: 'int', d: 500, min: 1, max: 1000 },
    { k: 'row', nm: '칸 수', o: 'Row Size', t: 'int', d: 200, min: 1, max: 500 },
    { k: 'show_rpoc', nm: '롤링 POC 보이기', o: 'Show Rolling POC', t: 'bool', d: false },
    { k: 'width', nm: '막대 길이(상자 폭 %)', o: 'Width (% of the box)', t: 'int', d: 50, min: 1, max: 100 },
    { k: 'bar_width', nm: '막대 두께', o: 'Bar Width', t: 'int', d: 2, min: 1, max: 10 },
    { k: 'flip', nm: '뒤집기(오른쪽 기준)', o: 'Flip Histogram', t: 'bool', d: false },
    { k: 'grad', nm: '진하기(길이에 따라)', o: 'Gradient', t: 'bool', d: true }
  ],
  legend: p => 'Volume Profile ' + p.length + ' ' + p.row + ' · 막대 = 화면 상자에 맞춤',
  noMargin: true,   // 막대 · POC 는 가격 범위 · 위아래 여유에 안 끼어든다(롤링 POC 줄만 범위에 넣음)
  calc: vpCalc,
  range(R, s, e, p, out) { if (!p.show_rpoc) return; for (let i = s; i < e; i++) if (fin(R.rpoc[i])) out.push(R.rpoc[i]); },   // 프로파일 막대 · POC 는 가격 범위에 안 넣음(화면 밖 칸은 자름)
  draw(ctx, R, G, p) { const P = R.last, L0 = G.pad.l, R0 = G.W - G.pad.r, bw = R0 - L0;
    if (P && P.first >= 0 && P.max > 0) { ctx.save(); ctx.lineWidth = p.bar_width;
      for (let j = 0; j < p.row; j++) { const m = P.sumv[j] / P.max; if (!(m > 0)) continue; const len = Math.round(bw * p.width / 100 * m), yy = G.y(P.levels[j]);
        ctx.strokeStyle = p.grad ? ('rgba(33,87,243,' + (0.10 + 0.45 * m).toFixed(3) + ')') : 'rgba(33,87,243,.45)';   /* 흰 바탕 · 캔들이 비쳐 보이게 */ ctx.beginPath(); if (p.flip) { ctx.moveTo(R0, yy); ctx.lineTo(R0 - len, yy); } else { ctx.moveTo(L0, yy); ctx.lineTo(L0 + len, yy); } ctx.stroke(); }
      const pj = P.last, py = G.y((P.levels[pj] + P.levels[pj + 1]) / 2); ctx.strokeStyle = p.grad ? '#5AB1BB' : '#ff5d00'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(L0, py); ctx.lineTo(R0, py); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
    if (p.show_rpoc) { ctx.save(); ctx.strokeStyle = '#ff1100'; ctx.lineWidth = 1.2; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = R.rpoc[i]; if (!fin(v)) { on = false; continue; } if (!on) { ctx.moveTo(G.x(i), G.y(v)); on = true; } else ctx.lineTo(G.x(i), G.y(v)); } ctx.stroke(); ctx.restore(); } }
});
// ── ③ [S1868] Smart Money Concepts Pro [Neon] — LuxAlgo 원본 SMC 를 다른 사람이 파인 v6 로 옮기고 고친 판(Neon 화면) · CC BY-NC-SA 4.0 ──
//   원본 = offline/tvchart/"Smart Money Concepts (by LuxAlgo).txt"(e4691b87dd78 · 🧪 SMC 칩이 옮긴 파일과 같음)
//   계산 = 원본 봉 차례 그대로(봉마다 · 그 봉까지 자료만 · 664 ~ 716줄 차례) — 그리기 = 마지막 봉의 상태(원본 Historical = 지난 선 · 글자를 남김 · Present = 자리마다 마지막 것만)
//   풀이(원본 글자가 정하지 않는 곳 · PREREG_S1868 §1): na 와의 비교는 거짓(!= 도 · 앱 🧪 칩과 같음) · math.max/min 에 na 가 끼면 na · ta.cum 은 na 를 건너뜀
//     · for…in 안의 remove = 다음 칸은 그 봉에 안 봄(TV 문서 'Loops': 크기가 바뀌면 바뀐 크기로 다음 차례) · ta.highest/lowest 창이 다 na 면 na · array.max/min 은 na 건너뜀(다 na 면 오더블록 안 만듦)
//   앱 차이(화면만): FVG 시간 프레임 고르기 없음(차트 봉) · 맞춤 색 셋 없음(색 고르기 칸 없음) · FVG 늘이기 = 봉 단위 · 오른쪽 끝(마지막 봉 + 20봉) 글자 = 상자 오른쪽 끝(겹치면 위아래로 비킴) · 글자에 흰 테두리 · 500개 한도 안 씀
const SMC_BULL = 1, SMC_BEAR = -1, SMC_NEON = 'Futuristic Neon', SMC_PRO = 'Modern Professional', SMC_MIN = 'Minimal Clean';
const smcNeq = (a, b) => fin(a) && fin(b) && a !== b;
function smcDayKey(d) { const s = String(d == null ? '' : d).slice(0, 10).replace(/-/g, ''); return /^\d{8}$/.test(s) ? +s : NaN; }   // 'YYYYMMDD' · 'YYYY-MM-DD…' → 20240111
function smcDays(k) { return Math.round(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100) / 86400000); }   // 1970-01-01 부터 날 수
function smcWeekKey(k) { const d = smcDays(k), dow = (d + 3) % 7; return d - dow; }   // 그 주 월요일(1970-01-01 = 목 → (d + 3) % 7 = 월 0 … 일 6)
function smcCalc(rows, p) {
  const n = rows.length, O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; O[i] = num(r.open); H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); }
  const A = T.atr(H, L, C, p.atrLen);   // ta.atr(atrLenInp) = rma(TR) · TR[0] = 고 − 저
  // 미리 셈(269 ~ 284줄): volMeasure · parsedHigh/Low — ta.tr(na 처리 안 함 = 첫 봉 na) · ta.cum 은 na 건너뜀
  const pH = new Float64Array(n), pL = new Float64Array(n); let cumTR = 0;
  for (let t = 0; t < n; t++) { const tr = t === 0 ? NaN : Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1]), Math.abs(L[t] - C[t - 1])); if (fin(tr)) cumTR += tr;
    const vm = p.obFilter === 'ATR' ? A[t] : cumTR / Math.max(t, 1), hv = (H[t] - L[t]) >= 2 * vm; pH[t] = hv ? L[t] : H[t]; pL[t] = hv ? H[t] : L[t]; }
  const bearSrc = p.obMitig === 'Close' ? C : H, bullSrc = p.obMitig === 'Close' ? C : L;
  // leg(size) — 부르는 자리마다 따로(파인 함수 안 var) · high[size] > ta.highest(size) → 하락 다리 0 · low[size] < ta.lowest(size) → 상승 다리 1
  const legOf = sz => { const g = new Int8Array(n), hh = T.highest(H, sz), ll = T.lowest(L, sz); let st = 0;
    for (let t = 0; t < n; t++) { if (t >= sz) { if (fin(hh[t]) && H[t - sz] > hh[t]) st = 0; else if (fin(ll[t]) && L[t - sz] < ll[t]) st = 1; } g[t] = st; } return g; };
  const mkP = () => ({ cur: NaN, last: NaN, x: false, i: 0 });   // pivot.new(na, na, false) · barIndex 기본 = 처음 봉
  const sH = mkP(), sL = mkP(), iH = mkP(), iL = mkP(), eH = mkP(), eL = mkP(), sT = { b: 0 }, iT = { b: 0 };
  const tr = { top: NaN, bot: NaN, i: NaN, topI: NaN, botI: NaN };   // trailingExtremes.new() — 값 na
  const PRES = p.mode === 'Present', gS = legOf(p.swLen), gI = legOf(5), gE = p.showEQ ? legOf(p.eqLen) : null;
  const lvl = { sH: new Float64Array(n), sL: new Float64Array(n), iH: new Float64Array(n), iL: new Float64Array(n) };
  const iUp = new Int8Array(n), iDn = new Int8Array(n), sUp = new Int8Array(n), sDn = new Int8Array(n), iB = new Int8Array(n), sB = new Int8Array(n), cb = new Int8Array(n);
  const cxI = { h: new Float64Array(n), l: new Float64Array(n) }, cxS = { h: new Float64Array(n), l: new Float64Array(n) };   // ta.crossover/under 가 본 레벨(부르는 자리마다)
  const lines = [], lnLast = {}, eqs = [], eqLast = [null, null], swl = [], swLast = [null, null], obI = [], obS = [], fvgs = [];
  let cumD = 0;
  function gcs(g, sz, eq, internal, t) {   // getCurrentStructure(345 ~ 391줄)
    if (t < 1) return; const ch = g[t] - g[t - 1]; if (ch === 0) return;
    if (ch === 1) { const q = eq ? eL : internal ? iL : sL, lv = L[t - sz];
      if (eq && Math.abs(q.cur - lv) < p.eqThresh * A[t]) { const e = { hi: false, i0: q.i, lv0: q.cur, i1: t - sz, lv1: lv, li: Math.round(0.5 * (q.i + t - sz)) }; if (PRES) eqLast[0] = e; else eqs.push(e); }
      q.last = q.cur; q.cur = lv; q.x = false; q.i = t - sz;
      if (!eq && !internal) { tr.bot = q.cur; tr.i = q.i; tr.botI = q.i; }
      if (p.showSwings && !internal && !eq) { const s = { i: t - sz, lv: q.cur, tag: q.cur < q.last ? 'LL' : 'HL', hi: false }; if (PRES) swLast[0] = s; else swl.push(s); }
    } else { const q = eq ? eH : internal ? iH : sH, lv = H[t - sz];
      if (eq && Math.abs(q.cur - lv) < p.eqThresh * A[t]) { const e = { hi: true, i0: q.i, lv0: q.cur, i1: t - sz, lv1: lv, li: Math.round(0.5 * (q.i + t - sz)) }; if (PRES) eqLast[1] = e; else eqs.push(e); }
      q.last = q.cur; q.cur = lv; q.x = false; q.i = t - sz;
      if (!eq && !internal) { tr.top = q.cur; tr.i = q.i; tr.topI = q.i; }
      if (p.showSwings && !internal && !eq) { const s = { i: t - sz, lv: q.cur, tag: q.cur > q.last ? 'HH' : 'LH', hi: true }; if (PRES) swLast[1] = s; else swl.push(s); }
    } }
  function storeOB(q, internal, bias, t) {   // storeOrderBlock(433 ~ 447줄) — slice(p.barIndex, bar_index) · indexof(max) = 첫 최댓값
    const src = bias === SMC_BEAR ? pH : pL; let m = NaN, idx = -1;
    for (let j = q.i; j < t; j++) { const v = src[j]; if (!fin(v)) continue; if (!fin(m) || (bias === SMC_BEAR ? v > m : v < m)) { m = v; idx = j; } }
    if (idx < 0) return;   // 창이 다 na(풀이)
    const obs = internal ? obI : obS; if (obs.length >= 100) obs.pop(); obs.unshift({ hi: pH[idx], lo: pL[idx], i: idx, d: bias }); }
  function brk(internal, bull, q, tg, t) {   // 깨짐 하나 — 줄 · 글자(보이면) · 오더블록
    const filt = internal ? (bull ? p.intBullF : p.intBearF) : (bull ? p.swBullF : p.swBearF), cat = internal ? p.showInt : p.showSw;
    if (cat && (filt === 'All' || (filt === 'BOS' && tg !== 'CHoCH') || (filt === 'CHoCH' && tg === 'CHoCH'))) {
      const r = p.gradient ? Math.min(Math.abs(C[t] - q.cur) / Math.max(A[t], 1e-10), 3.0) / 3.0 : NaN;   // strengthCol — A na 면 na(풀이: math.max 에 na)
      const L1 = { k: internal ? 0 : 1, d: bull ? SMC_BULL : SMC_BEAR, tag: tg, i0: q.i, i1: t, lv: q.cur, li: Math.round(0.5 * (q.i + t)), r };
      if (PRES) lnLast[L1.k + '' + L1.d] = L1; else lines.push(L1); }
    if (internal ? p.showIntOB : p.showSwOB) storeOB(q, internal, bull ? SMC_BULL : SMC_BEAR, t); }
  function ds(internal, t) {   // displayStructure(469 ~ 525줄)
    let bullBar = true, bearBar = true;
    if (p.intConfl) { const uw = H[t] - Math.max(C[t], O[t]), m = Math.min(C[t], O[t] - L[t]); bullBar = uw > m; bearBar = uw < m; }   // 원본 글자 그대로(open − low)
    const T1 = internal ? iT : sT, cx = internal ? cxI : cxS;
    let q = internal ? iH : sH; cx.h[t] = q.cur;
    const xo = t > 0 && fin(C[t]) && fin(C[t - 1]) && fin(cx.h[t]) && fin(cx.h[t - 1]) && C[t] > cx.h[t] && C[t - 1] <= cx.h[t - 1];
    if (xo && !q.x && (internal ? (smcNeq(iH.cur, sH.cur) && bullBar) : true)) { const tg = T1.b === SMC_BEAR ? 'CHoCH' : 'BOS';
      (internal ? iUp : sUp)[t] = tg === 'CHoCH' ? 2 : 1; q.x = true; T1.b = SMC_BULL; brk(internal, true, q, tg, t); }
    q = internal ? iL : sL; cx.l[t] = q.cur;
    const xu = t > 0 && fin(C[t]) && fin(C[t - 1]) && fin(cx.l[t]) && fin(cx.l[t - 1]) && C[t] < cx.l[t] && C[t - 1] >= cx.l[t - 1];
    if (xu && !q.x && (internal ? (smcNeq(iL.cur, sL.cur) && bearBar) : true)) { const tg = T1.b === SMC_BULL ? 'CHoCH' : 'BOS';
      (internal ? iDn : sDn)[t] = tg === 'CHoCH' ? 2 : 1; q.x = true; T1.b = SMC_BEAR; brk(internal, false, q, tg, t); } }
  function delOB(obs, t) { for (let k = 0; k < obs.length; k++) { const ob = obs[k]; let x = false;   // deleteOrderBlocks(414 ~ 431줄) — 지우면 다음 칸은 이번 봉에 안 봄(풀이)
    if (bearSrc[t] > ob.hi && ob.d === SMC_BEAR) x = true; else if (bullSrc[t] < ob.lo && ob.d === SMC_BULL) x = true;
    if (x) obs.splice(k, 1); } }
  const doInt = p.showInt || p.showIntOB || p.colorBars, doSw = p.showSw || p.showSwOB || p.showHL;
  for (let t = 0; t < n; t++) {
    cb[t] = iT.b;   // 666 ~ 668줄 plotcandle 색 = 이 봉 구조 셈 전의 내부 추세
    if (p.showHL || p.showPDZ) { tr.top = Math.max(H[t], tr.top); if (tr.top === H[t]) tr.topI = t; tr.bot = Math.min(L[t], tr.bot); if (tr.bot === L[t]) tr.botI = t; }   // updateTrailingExtremes(616 ~ 620줄)
    if (p.showFVG) for (let k = 0; k < fvgs.length; k++) { const f = fvgs[k]; if ((L[t] < f.bot && f.d === SMC_BULL) || (H[t] > f.top && f.d === SMC_BEAR)) fvgs.splice(k, 1); }   // deleteFairValueGaps(538 ~ 543줄)
    gcs(gS, p.swLen, false, false, t); gcs(gI, 5, false, true, t); if (gE) gcs(gE, p.eqLen, true, false, t);
    lvl.sH[t] = sH.cur; lvl.sL[t] = sL.cur; lvl.iH[t] = iH.cur; lvl.iL[t] = iL.cur;
    if (doInt) ds(true, t);
    if (doSw) ds(false, t);
    if (p.showIntOB) delOB(obI, t);
    if (p.showSwOB) delOB(obS, t);
    if (p.showFVG && t >= 1) {   // drawFairValueGaps(545 ~ 569줄) — 차트 봉(request.security 같은 봉) · timeframe.change('') 늘 참
      const lc = C[t - 1], lo = O[t - 1], dp = (lc - lo) / (lo * 100); if (fin(dp)) cumD += Math.abs(dp);
      const thr = p.fvgAutoT ? cumD / Math.max(t, 1) * 2 : 0.0;
      if (t >= 2) { const ch = H[t], cl = L[t], h2 = H[t - 2], l2 = L[t - 2];
        if (cl > h2 && lc > h2 && dp > thr) fvgs.unshift({ top: cl, bot: h2, mid: (cl + h2) / 2, d: SMC_BULL, i0: t - 1, i1: t + p.fvgExt });
        if (ch < l2 && lc < l2 && -dp > thr) fvgs.unshift({ top: ch, bot: l2, mid: (ch + l2) / 2, d: SMC_BEAR, i0: t - 1, i1: t + p.fvgExt }); } }
    iB[t] = iT.b; sB[t] = sT.b;
  }
  if (PRES) { ['01', '0-1', '11', '1-1'].forEach(k => { if (lnLast[k]) lines.push(lnLast[k]); }); lines.sort((a, b) => a.i1 - b.i1 || a.k - b.k || b.d - a.d); eqLast.forEach(e => { if (e) eqs.push(e); }); swLast.forEach(s => { if (s) swl.push(s); }); }
  // 일 · 주 · 월 기준선(576 ~ 611 · 710 ~ 716줄) — 마지막 봉에서 한 번 · 앞 기간(그 기간 봉들) 고가 · 저가와 그 봉
  const mtf = [];
  if ((p.showD || p.showW || p.showM) && n > 0) {
    const DK = new Float64Array(n); for (let i = 0; i < n; i++) DK[i] = smcDayKey(rows[i] && rows[i].date);
    let intra = false; const gaps = []; for (let i = 1; i < n; i++) { if (!fin(DK[i]) || !fin(DK[i - 1])) continue; if (DK[i] === DK[i - 1]) intra = true; else gaps.push(smcDays(DK[i]) - smcDays(DK[i - 1])); }
    gaps.sort((a, b) => a - b); const md = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 1;
    const ctf = intra ? 0 : md >= 25 ? 3 : md >= 5 ? 2 : 1;   // 차트 봉 종류: 0 일보다 짧음 · 1 일 · 2 주 · 3 월
    const keyOf = [k => k, k => smcWeekKey(k), k => Math.floor(k / 100)];
    [['D', 1, p.showD], ['W', 2, p.showW], ['M', 3, p.showM]].forEach(([tf, rk, on]) => { if (!on || ctf > rk) return;   // higherTimeframe(tf) 면 안 그림
      if (ctf === rk) { mtf.push({ tf, top: H[n - 1], topI: n - 1, bot: L[n - 1], botI: n - 1 }); return; }   // 같은 봉: 그 봉 고가 · 저가(원본 sameTF)
      const kf = keyOf[rk - 1], lk = fin(DK[n - 1]) ? kf(DK[n - 1]) : NaN; if (!fin(lk)) return;
      let pk = NaN; for (let i = 0; i < n; i++) { if (!fin(DK[i])) continue; const k = kf(DK[i]); if (k < lk && (!fin(pk) || k > pk)) pk = k; }
      if (!fin(pk)) return;   // 앞 기간 봉이 자료에 없음(앱: 원본은 상위 봉 자료를 따로 받음)
      let top = NaN, topI = -1, bot = NaN, botI = -1;
      for (let i = 0; i < n; i++) { if (!fin(DK[i]) || kf(DK[i]) !== pk) continue; if (fin(H[i]) && (!fin(top) || H[i] > top)) { top = H[i]; topI = i; } if (fin(L[i]) && (!fin(bot) || L[i] < bot)) { bot = L[i]; botI = i; } }
      mtf.push({ tf, top, topI, bot, botI }); });
  }
  const nI = Math.min(p.intOBCnt, obI.length), nS = Math.min(p.swOBCnt, obS.length);
  return { n, iUp, iDn, sUp, sDn, iB, sB, cb, lvl, lines, eqs, swl,
    obI: p.showIntOB ? obI.slice(0, nI) : [], obS: p.showSwOB ? obS.slice(0, nS) : [], fvg: p.showFVG ? fvgs.slice() : [],
    hl: p.showHL ? { top: tr.top, topI: tr.topI, bot: tr.bot, botI: tr.botI, sb: sT.b } : null,
    pdz: p.showPDZ ? { top: tr.top, bot: tr.bot, i: tr.i } : null, mtf };
}
const smcHex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smcCol = (rgb, tr) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (Math.round((100 - tr)) / 100) + ')';   // color.new(c, 투명도)
function smcTheme(p) {   // 테마(131 ~ 168줄) — 맞춤 색 셋은 앱에 없음(색 고르기 칸 없음)
  const th = p.theme, nb = p.neonBull === 'Neon Cyan' ? '#00ffd5' : p.neonBull === 'Lime Green' ? '#39ff14' : '#00d4ff', nr = p.neonBear === 'Hot Pink' ? '#ff3a8c' : '#b537f2';
  const bull = smcHex(th === SMC_NEON ? nb : th === SMC_PRO ? '#2962ff' : '#b2b5be'), bear = smcHex(th === SMC_NEON ? nr : th === SMC_PRO ? '#ff5252' : '#5d606b');
  const accent = smcHex(th === SMC_NEON ? '#00d4ff' : th === SMC_PRO ? '#4a90e2' : '#878b94'), neutral = th === SMC_NEON ? [170, 175, 200] : smcHex('#878b94');
  const obT = p.glow ? 87 : 75, fvgT = p.glow ? 82 : 70, zoneT = p.glow ? 90 : 78;
  return { bull, bear, accent, neutral, obT, fvgT, zoneT }; }
const SMC_FZ = { Tiny: 8, Small: 9, Normal: 11 };   // 앱: 글자 크기(px) — TV tiny · small · normal
const SMC_DASH = { '⎯⎯⎯': [], '----': [5, 3], '····': [1, 2] };
function smcDraw(ctx, R, G, p) {
  const th = smcTheme(p), x = G.x, y = G.y, RE = G.W - G.pad.r, n = R.n;
  const lineAt = (x0, y0, x1, y1, col, dash, w) => { ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); };
  const boxAt = (x0, x1, a, b, fill, stroke) => { if (!fin(a) || !fin(b)) return; const y0 = y(Math.max(a, b)), y1 = y(Math.min(a, b)); ctx.fillStyle = fill; ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), Math.max(y1 - y0, 0.5)); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), Math.max(y1 - y0, 0.5)); } };
  const texts = [];   // 글자는 맨 나중(선 · 상자 위)
  const text = (xx, yv, s, col, pos, sz, align) => { if (fin(yv)) texts.push([xx, y(yv), s, col, pos, SMC_FZ[sz] || 9, align || 'center']); };
  ctx.save();
  // 1) 상자: 프리미엄 · 디스카운트 → 오더블록 → FVG
  if (R.pdz && fin(R.pdz.top) && fin(R.pdz.bot) && fin(R.pdz.i)) { const z = R.pdz, xl = x(z.i), xr = x(n - 1), mi = Math.round(0.5 * (z.i + n - 1));
    boxAt(xl, xr, z.top, 0.95 * z.top + 0.05 * z.bot, smcCol(th.bear, th.zoneT)); text(x(mi), z.top, 'Premium', smcCol(th.bear, 0), 'down', 'Small');
    const eq = (z.top + z.bot) / 2; boxAt(xl, xr, 0.525 * z.top + 0.475 * z.bot, 0.525 * z.bot + 0.475 * z.top, smcCol(th.neutral, th.zoneT)); text(RE - 2, eq, 'Equilibrium', smcCol(th.neutral, 0), 'mid', 'Small', 'right');
    boxAt(xl, xr, 0.95 * z.bot + 0.05 * z.top, z.bot, smcCol(th.bull, th.zoneT)); text(x(mi), z.bot, 'Discount', smcCol(th.bull, 0), 'up', 'Small'); }
  [[R.obS, false], [R.obI, true]].forEach(([obs, int]) => obs.forEach(ob => { const c = smcCol(ob.d === SMC_BEAR ? th.bear : th.bull, int ? th.obT + 1 : th.obT - 6); boxAt(x(ob.i), RE, ob.hi, ob.lo, c, int ? null : c); }));
  R.fvg.forEach(f => { const c = smcCol(f.d === SMC_BEAR ? th.bear : th.bull, th.fvgT), x0 = x(f.i0), x1 = x(f.i1); boxAt(x0, x1, f.top, f.mid, c, c); boxAt(x0, x1, f.mid, f.bot, c, c); });
  // 2) 선: 구조(내부 점선 · 스윙 실선) · EQH/EQL(점) · 강한/약한 고저 · 일 · 주 · 월
  R.lines.forEach(l => { const base = l.d === SMC_BULL ? th.bull : th.bear;
    const a = p.gradient ? (fin(l.r) ? (55 + (0 - 55) * l.r) : 55) : (l.k === 0 ? 25 : 0);   // color.from_gradient(r, 0, 1, 투명 55, 투명 0) · 끄면 내부 25 · 스윙 0 · r 이 na 면 옅은 끝(풀이)
    const col = smcCol(base, a); lineAt(x(l.i0), y(l.lv), x(l.i1), y(l.lv), col, l.k === 0 ? [4, 3] : []);
    text(x(l.li), l.lv, l.tag, col, l.d === SMC_BULL ? 'down' : 'up', l.k === 0 ? p.intLblSz : p.swLblSz); });
  R.eqs.forEach(e => { const col = smcCol(e.hi ? th.bear : th.bull, 0); if (fin(e.lv0)) lineAt(x(e.i0), y(e.lv0), x(e.i1), y(e.lv1), col, [1, 2]); text(x(e.li), e.lv1, e.hi ? 'EQH' : 'EQL', col, e.hi ? 'down' : 'up', p.eqLblSz); });
  R.swl.forEach(s => { const col = smcCol(s.hi ? th.bear : th.bull, 0); text(x(s.i), s.lv, s.tag, col, s.hi ? 'down' : 'up', 'Small'); });
  if (R.hl) { const h = R.hl, cT = smcCol(th.bear, 0), cB = smcCol(th.bull, 0);
    if (fin(h.top) && fin(h.topI)) { lineAt(x(h.topI), y(h.top), RE, y(h.top), cT); text(RE - 2, h.top, h.sb === SMC_BEAR ? 'Strong High' : 'Weak High', cT, 'down', 'Tiny', 'right'); }
    if (fin(h.bot) && fin(h.botI)) { lineAt(x(h.botI), y(h.bot), RE, y(h.bot), cB); text(RE - 2, h.bot, h.sb === SMC_BULL ? 'Strong Low' : 'Weak Low', cB, 'up', 'Tiny', 'right'); } }
  R.mtf.forEach(m => { const col = smcCol(th.accent, 0), dash = SMC_DASH[p[m.tf.toLowerCase() + 'Style']] || [];
    if (fin(m.top) && m.topI >= 0) { lineAt(x(m.topI), y(m.top), RE, y(m.top), col, dash); text(RE - 2, m.top, 'P' + m.tf + 'H', col, 'mid', 'Small', 'right'); }
    if (fin(m.bot) && m.botI >= 0) { lineAt(x(m.botI), y(m.bot), RE, y(m.bot), col, dash); text(RE - 2, m.bot, 'P' + m.tf + 'L', col, 'mid', 'Small', 'right'); } });
  // 3) 글자(배경 없음 · 원본 color(na)) — label_down = 점 위 · label_up = 점 아래 · 앱: 흰 테두리 · 오른쪽 끝 글자(강약 · 일주월 · 균형)는 겹치지 않게 위아래로 비킴
  const cy = t => t[4] === 'down' ? t[1] - 2 - t[5] / 2 : t[4] === 'up' ? t[1] + 2 + t[5] / 2 : t[1];
  const edge = texts.filter(t => t[6] === 'right').map(t => [t, cy(t)]).sort((a, b) => a[1] - b[1]); let lastY = -Infinity;
  edge.forEach(e => { const fz = e[0][5]; if (e[1] < lastY + fz + 1) e[1] = lastY + fz + 1; lastY = e[1]; });
  texts.filter(t => t[6] !== 'right').map(t => [t, cy(t)]).concat(edge).forEach(([[xx, , s, col, , fz, al], yy]) => { ctx.font = '600 ' + fz + 'px Outfit,sans-serif'; ctx.textAlign = al; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(s, xx, yy); ctx.fillStyle = col; ctx.fillText(s, xx, yy); });
  ctx.restore(); }
const SMC_SZ = ['Tiny', 'Small', 'Normal'], SMC_SZNM = { Tiny: '아주 작게', Small: '작게', Normal: '보통' }, SMC_FL = ['All', 'BOS', 'CHoCH'], SMC_FLNM = { All: '전부', BOS: 'BOS 만', CHoCH: 'CHoCH 만' };
const SMC_ST = ['⎯⎯⎯', '----', '····'], SMC_STNM = { '⎯⎯⎯': '실선', '----': '긴 점선', '····': '점선' };
TV.reg({
  id: 'smc', place: 'over', name: 'Smart Money Concepts Pro [Neon]', short: 'SMC Pro', kname: 'Smart Money Concepts',
  author: 'LuxAlgo(원본) · v6 옮김 · Neon 화면', license: 'CC BY-NC-SA 4.0', srcFile: 'Smart Money Concepts (by LuxAlgo).txt',
  inputs: [
    { k: 'mode', nm: '보이기(과거 전부 · 최근 것만)', o: 'Display Mode', t: 'sel', d: 'Historical', opts: ['Historical', 'Present'], optNm: { Historical: '과거 전부', Present: '최근 것만' } },
    { k: 'colorBars', nm: '추세로 캔들 색', o: 'Color Candles by Trend', t: 'bool', d: false },
    { k: 'showSwings', nm: '스윙 점 글자(HH · HL · LH · LL)', o: 'Show Swing Point Labels (HH/HL/LH/LL)', t: 'bool', d: false },
    { k: 'showHL', nm: '강한 · 약한 고점 · 저점', o: 'Show Strong / Weak High & Low', t: 'bool', d: true },
    { k: 'showInt', nm: '내부 구조 보이기', o: 'Show Internal Structure', t: 'bool', d: true },
    { k: 'intBullF', nm: '내부 상승 거름', o: 'Internal Bullish Filter', t: 'sel', d: 'All', opts: SMC_FL, optNm: SMC_FLNM },
    { k: 'intBearF', nm: '내부 하락 거름', o: 'Internal Bearish Filter', t: 'sel', d: 'All', opts: SMC_FL, optNm: SMC_FLNM },
    { k: 'intConfl', nm: '내부 컨플루언스 거름(망설인 봉 빼기)', o: 'Internal Confluence Filter', t: 'bool', d: false },
    { k: 'intLblSz', nm: '내부 글자 크기', o: 'Internal Label Size', t: 'sel', d: 'Tiny', opts: SMC_SZ, optNm: SMC_SZNM },
    { k: 'showSw', nm: '스윙 구조 보이기', o: 'Show Swing Structure', t: 'bool', d: true },
    { k: 'swBullF', nm: '스윙 상승 거름', o: 'Swing Bullish Filter', t: 'sel', d: 'All', opts: SMC_FL, optNm: SMC_FLNM },
    { k: 'swBearF', nm: '스윙 하락 거름', o: 'Swing Bearish Filter', t: 'sel', d: 'All', opts: SMC_FL, optNm: SMC_FLNM },
    { k: 'swLen', nm: '스윙 길이(봉)', o: 'Swing Length (bars)', t: 'int', d: 50, min: 10 },
    { k: 'swLblSz', nm: '스윙 글자 크기', o: 'Swing Label Size', t: 'sel', d: 'Small', opts: SMC_SZ, optNm: SMC_SZNM },
    { k: 'showIntOB', nm: '내부 오더블록 보이기', o: 'Show Internal Order Blocks', t: 'bool', d: true },
    { k: 'intOBCnt', nm: '내부 오더블록 개수', o: 'Internal OB Count', t: 'int', d: 5, min: 1, max: 20 },
    { k: 'showSwOB', nm: '스윙 오더블록 보이기', o: 'Show Swing Order Blocks', t: 'bool', d: false },
    { k: 'swOBCnt', nm: '스윙 오더블록 개수', o: 'Swing OB Count', t: 'int', d: 5, min: 1, max: 20 },
    { k: 'obFilter', nm: '오더블록 변동성 거름', o: 'OB Volatility Filter', t: 'sel', d: 'ATR', opts: ['ATR', 'Cumulative Mean Range'], optNm: { ATR: 'ATR', 'Cumulative Mean Range': '누적 평균 범위' } },
    { k: 'obMitig', nm: '오더블록 깨짐 기준', o: 'OB Mitigation Source', t: 'sel', d: 'High / Low', opts: ['Close', 'High / Low'], optNm: { Close: '종가', 'High / Low': '고가 · 저가' } },
    { k: 'showEQ', nm: '같은 고점 · 저점(EQH · EQL)', o: 'Show Equal Highs / Lows', t: 'bool', d: true },
    { k: 'eqLen', nm: '확인 봉', o: 'Confirmation Bars', t: 'int', d: 3, min: 1 },
    { k: 'eqThresh', nm: '같다고 볼 폭(ATR 배수)', o: 'Threshold (ATR mult)', t: 'float', d: 0.1, min: 0, max: 0.5, step: 0.05 },
    { k: 'eqLblSz', nm: 'EQ 글자 크기', o: 'Label Size', t: 'sel', d: 'Tiny', opts: SMC_SZ, optNm: SMC_SZNM },
    { k: 'showFVG', nm: 'FVG 보이기(차트 봉)', o: 'Show Fair Value Gaps', t: 'bool', d: false },
    { k: 'fvgAutoT', nm: 'FVG 자동 문턱(약한 것 거름)', o: 'Auto Threshold (filter weak FVGs)', t: 'bool', d: true },
    { k: 'fvgExt', nm: 'FVG 늘이기(봉)', o: 'FVG Extend (bars)', t: 'int', d: 1, min: 0 },
    { k: 'showD', nm: '앞 날 고가 · 저가', o: 'Show Daily H/L', t: 'bool', d: false },
    { k: 'dStyle', nm: '앞 날 선 모양', o: 'Daily style', t: 'sel', d: '⎯⎯⎯', opts: SMC_ST, optNm: SMC_STNM },
    { k: 'showW', nm: '앞 주 고가 · 저가', o: 'Show Weekly H/L', t: 'bool', d: false },
    { k: 'wStyle', nm: '앞 주 선 모양', o: 'Weekly style', t: 'sel', d: '⎯⎯⎯', opts: SMC_ST, optNm: SMC_STNM },
    { k: 'showM', nm: '앞 달 고가 · 저가', o: 'Show Monthly H/L', t: 'bool', d: false },
    { k: 'mStyle', nm: '앞 달 선 모양', o: 'Monthly style', t: 'sel', d: '⎯⎯⎯', opts: SMC_ST, optNm: SMC_STNM },
    { k: 'showPDZ', nm: '프리미엄 · 디스카운트 · 균형', o: 'Show Premium / Discount / Equilibrium', t: 'bool', d: false },
    { k: 'theme', nm: '테마(앱 기본 프로 · 원본 기본 네온은 어두운 바탕용)', o: 'Theme', t: 'sel', d: SMC_PRO, opts: [SMC_NEON, SMC_PRO, SMC_MIN], optNm: { [SMC_NEON]: '네온', [SMC_PRO]: '프로', [SMC_MIN]: '미니멀' } },
    { k: 'neonBull', nm: '네온 상승 색', o: 'Neon Bullish Accent', t: 'sel', d: 'Neon Cyan', opts: ['Neon Cyan', 'Lime Green', 'Electric Blue'], optNm: { 'Neon Cyan': '청록', 'Lime Green': '라임', 'Electric Blue': '파랑' } },
    { k: 'neonBear', nm: '네온 하락 색', o: 'Neon Bearish Accent', t: 'sel', d: 'Hot Pink', opts: ['Hot Pink', 'Cyberpunk Purple'], optNm: { 'Hot Pink': '분홍', 'Cyberpunk Purple': '보라' } },
    { k: 'glow', nm: '구역 옅게(글로 구름)', o: 'Soft Glow Clouds on Zones', t: 'bool', d: true },
    { k: 'gradient', nm: '깨짐 크기로 선 진하기', o: 'Gradient Trend-Strength Coloring', t: 'bool', d: true },
    { k: 'atrLen', nm: 'ATR 길이(변동성 · 오더블록 거름)', o: 'ATR Length (volatility / OB filter)', t: 'int', d: 200, min: 10 }
  ],
  legend: p => 'SMC Pro ' + p.swLen + ' · 내부 5' + (p.mode === 'Present' ? ' · 최근 것만' : ''),
  calc: smcCalc,
  range() { },   // 원본은 그림(선 · 상자 · 글자)만 — 가격 범위에 안 넣음(TV 자동 범위도 그림은 안 봄) · 글자 자리 여유 7% 만
  barColor(R, i, p) { if (!p.colorBars || !R.cb) return null; const th = smcTheme(p); return smcCol(R.cb[i] === SMC_BULL ? th.bull : th.bear, 0); },
  draw: smcDraw
});
if (typeof module !== 'undefined' && module.exports) module.exports = { srbCalc, vpCalc, vpProfile, smcCalc, smcTheme };
})();
