// sx_tvind_bbset.js — [S1873] 풀차트 '볼린저 풀세트' 아래 칸 넷(사용자 2026-11-03 00:35 · 00:43) — 라이선스 없는 둘만 · PREREG_S1873_bbset.md §1
//   표시용 · 읽기 도움 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   ① Bollinger Bands %B — TradingView 내장 지표 식(라이선스 없음) · %B = (src − 하단) / (상단 − 하단)
//   ② Bollinger BandWidth — TradingView 내장 지표 식(라이선스 없음) · BBW = (상단 − 하단) / 중심 × 100 · 최고 확장 · 최저 수축(125봉)
//      + 앱 '수축 띠'(기본 끔) = 'Bollinger Bandwidth' 공개 스크립트(파인 v3 · 작성자 표기 없음 · 라이선스 표기 없음 · 원본 = offline/tvchart/Bollinger Bandwidth (BBW percent).txt)의 BBW %(100봉 안 자리 · 20 위 빨강 · 아니면 노랑)
//   ③ BBTrend — TradingView 내장 지표 식(John Bollinger · 라이선스 없음) · (|짧은 하단 − 긴 하단| − |짧은 상단 − 긴 상단|) / 짧은 중심 × 100
//      색 넷 = TV 도움말('0 에서 멀어지면 진하게 · 가까워지면 옅게') — 옛 공개판 BBTrend(optictropic · offline/tvchart/BBTrend (optictropic).txt)도 같은 네 갈래(그쪽은 × 100 없음 · 색 aqua · blue · red · maroon)
//   ④ Bollinger Bands Impulse [LazyBear] — 작성자 LazyBear · 라이선스 표기 없음 · 원본 = offline/tvchart/Bollinger_Bands_Impulse.txt(사용자가 받아옴 · 파인 v1/v2)
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만). 읽기 글 넷은 이 파일에서 SXTV.READ 에 더한다(sx_tvread.js 는 그대로).
//   ⑤ [S1878] 〰️ 볼린저 구역 배지(차트 위 · 선 없음) — 앱 자체 정의 · 계산 = 📈 크로스 탭 〰️ 볼린저 모드와 같은 함수(window._bbzSer · _bbzZone · sx_render.js S1876) 를 그대로 부름
//      캔들 칸 왼쪽 위 배지 하나(지금 구역 · σ 자리 · 과열 이탈 잠금) + 읽기 글 — 사용자 2026-11-03 09:45 '풀차트에는 선은 그리지 말고 배지로' · PREREG_S1878
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na
const closes = rows => { const n = rows.length, C = new Float64Array(n); for (let i = 0; i < n; i++) C[i] = num((rows[i] || {}).close); return C; };
// 파인 ta.bb(src, len, mult) = [basis, basis + mult × stdev, basis − mult × stdev] · stdev = 모집단(파인 ta.stdev 기본)
function bb(C, len, mult) { const basis = T.sma(C, len), sd = T.stdev(C, len), n = C.length, up = new Float64Array(n), lo = new Float64Array(n);
  for (let t = 0; t < n; t++) { const d = mult * sd[t]; up[t] = basis[t] + d; lo[t] = basis[t] - d; } return { basis, up, lo }; }
// 파인 나눗셈 — 분모 0 이거나 숫자가 아니면 na
const div = (a, b) => (fin(a) && fin(b) && b !== 0) ? a / b : NaN;
// 파인 ta.highest · ta.lowest(창 안 na 는 건너뜀 · 창이 다 na 면 na · 앞 len − 1 봉은 na)
function hiN(src, m) { const N = src.length, o = new Float64Array(N).fill(NaN); for (let t = m - 1; t < N; t++) { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = src[j]; if (fin(v) && (!fin(x) || v > x)) x = v; } o[t] = x; } return o; }
function loN(src, m) { const N = src.length, o = new Float64Array(N).fill(NaN); for (let t = m - 1; t < N; t++) { let x = NaN; for (let j = t - m + 1; j <= t; j++) { const v = src[j]; if (fin(v) && (!fin(x) || v < x)) x = v; } o[t] = x; } return o; }
const fmt2 = v => !fin(v) ? '' : v.toFixed(2);

// ── 그림 도우미 ──
function hband(ctx, G, y, v, col, dash) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(G.pad.l, y(v)); ctx.lineTo(G.W - G.pad.r, y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
function line(ctx, G, y, a, col, w) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w || 1.2; ctx.beginPath(); let on = false; for (let i = G.s; i < G.e; i++) { const v = a[i]; if (!fin(v)) { on = false; continue; } const x = G.x(i), yy = y(v); if (!on) { ctx.moveTo(x, yy); on = true; } else ctx.lineTo(x, yy); } ctx.stroke(); ctx.restore(); }
// 보이는 봉의 값 범위(더할 값 포함) · 위아래 6% 여유
function span(G, arrs, extra) { let lo = Infinity, hi = -Infinity; (extra || []).forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
  for (const a of arrs) for (let i = G.s; i < G.e; i++) { const v = a[i]; if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (!fin(lo) || !fin(hi)) { lo = 0; hi = 1; } if (hi === lo) { hi += 0.5; lo -= 0.5; } const m = (hi - lo) * 0.06; return [lo - m, hi + m]; }
function yOf(G, lo, hi) { const ch = G.H - G.pad.t - G.pad.b; return v => G.pad.t + (hi - v) / (hi - lo) * ch; }
function head(ctx, G, s, col) { ctx.font = 'bold 9px Outfit,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.fillText(s, G.pad.l + 4, G.pad.t + 9); }
function bars(ctx, G, y, a, colAt) { const bw = Math.max(G.cw * 0.7, 1), y0 = y(0); for (let i = G.s; i < G.e; i++) { const v = a[i], c = colAt(i); if (!fin(v) || !c) continue; const x = G.x(i), y1 = y(v); ctx.fillStyle = c; ctx.fillRect(x - bw / 2, Math.min(y0, y1), bw, Math.max(Math.abs(y1 - y0), 0.5)); } }

// ── ① Bollinger Bands %B(TV 내장) ──
function bbpbCalc(rows, p) { const C = closes(rows), { up, lo } = bb(C, p.length, p.mult), n = C.length, pb = new Float64Array(n);
  for (let t = 0; t < n; t++) pb[t] = div(C[t] - lo[t], up[t] - lo[t]); return { pb }; }
TV.reg({
  id: 'bbpb', place: 'pane', name: 'Bollinger Bands %B', short: 'BB %B', kname: '볼린저 %B',
  author: 'TradingView 내장 지표', license: '라이선스 없음(내장 식)', srcFile: '—',
  inputs: [
    { k: 'length', nm: '길이', o: 'Length', t: 'int', d: 20, min: 1, max: 500 },
    { k: 'mult', nm: '표준편차 배수', o: 'StdDev', t: 'float', d: 2.0, min: 0.001, max: 50, step: 0.1 }
  ],
  legend: p => 'BB %B ' + p.length + ' ' + p.mult,
  calc: bbpbCalc,
  drawPane(ctx, R, G) { const [lo, hi] = span(G, [R.pb], [0, 1]), y = yOf(G, lo, hi);
    ctx.save(); ctx.fillStyle = 'rgba(38,166,154,0.1)'; ctx.fillRect(G.pad.l, y(1), G.W - G.pad.r - G.pad.l, y(0) - y(1)); ctx.restore();
    hband(ctx, G, y, 1, '#787b86', [4, 3]); hband(ctx, G, y, 0.5, 'rgba(120,123,134,0.5)'); hband(ctx, G, y, 0, '#787b86', [4, 3]);
    line(ctx, G, y, R.pb, '#26a69a'); G.axisText(ctx, hi.toFixed(2), lo.toFixed(2)); const v = R.pb[G.e - 1]; if (fin(v)) head(ctx, G, '%B ' + fmt2(v), '#26a69a'); }
});

// ── ② Bollinger BandWidth(TV 내장) ──
function bbwCalc(rows, p) { const C = closes(rows), { basis, up, lo } = bb(C, p.length, p.mult), n = C.length, w = new Float64Array(n);
  for (let t = 0; t < n; t++) w[t] = fin(up[t]) && fin(lo[t]) ? div(up[t] - lo[t], basis[t]) * 100 : NaN;
  // 앱 '수축 띠' — 원본 bbwporc = (bbw − nmin) × 100 / (nmax − nmin) · 색 = bbwporc > percent ? red : yellow(원본은 na 도 노랑 · 앱은 na 면 띠 없음)
  const ph = hiN(w, p.pctLen), pl = loN(w, p.pctLen), pr = new Float64Array(n), pc = new Int8Array(n);
  for (let t = 0; t < n; t++) { pr[t] = fin(w[t]) && fin(pl[t]) ? div((w[t] - pl[t]) * 100, ph[t] - pl[t]) : NaN; pc[t] = !fin(pr[t]) ? -1 : (pr[t] > p.pctTh ? 1 : 0); }   // 1 빨강 · 0 노랑(수축) · −1 없음
  return { w, hx: hiN(w, p.expLen), lc: loN(w, p.conLen), pr, pc }; }
const PCT_C = ['#ffd600', '#ff0000'];
TV.reg({
  id: 'bbw', place: 'pane', name: 'Bollinger BandWidth', short: 'BBW', kname: '볼린저 밴드폭(BandWidth)',
  author: 'TradingView 내장 지표', license: '라이선스 없음(내장 식)', srcFile: '—',
  inputs: [
    { k: 'length', nm: '길이', o: 'Length', t: 'int', d: 20, min: 1, max: 500 },
    { k: 'mult', nm: '표준편차 배수', o: 'StdDev', t: 'float', d: 2.0, min: 0.001, max: 50, step: 0.1 },
    { k: 'expLen', nm: '최고 확장 길이', o: 'Highest Expansion Length', t: 'int', d: 125, min: 1, max: 1000 },
    { k: 'conLen', nm: '최저 수축 길이', o: 'Lowest Contraction Length', t: 'int', d: 125, min: 1, max: 1000 },
    { k: 'pctOn', nm: '수축 띠 보이기(앱 · BBW % 스크립트 식)', o: '—', t: 'bool', d: false, app: true },
    { k: 'pctLen', nm: '수축 띠 길이(앱)', o: 'Periods Bollinger Bands', t: 'int', d: 100, min: 1, max: 1000, app: true },
    { k: 'pctTh', nm: '수축 띠 문턱 %(앱)', o: 'Percent value', t: 'float', d: 20, min: 0, max: 100, step: 1, app: true }
  ],
  legend: p => 'BBW ' + [p.length, p.mult, p.expLen, p.conLen].join(' ') + (p.pctOn ? ' · 띠 ' + p.pctLen + ' ' + p.pctTh : ''),
  calc: bbwCalc,
  drawPane(ctx, R, G, p) { const [lo, hi] = span(G, [R.w, R.hx, R.lc]), y = yOf(G, lo, hi);
    if (p && p.pctOn) { const bw = Math.max(G.cw, 1), yb = G.H - G.pad.b + 2; for (let i = G.s; i < G.e; i++) { const c = R.pc[i]; if (c < 0) continue; ctx.fillStyle = PCT_C[c]; ctx.fillRect(G.x(i) - bw / 2, yb, bw, 4); } }
    line(ctx, G, y, R.hx, '#f23645', 1); line(ctx, G, y, R.lc, '#089981', 1); line(ctx, G, y, R.w, '#2962ff');
    G.axisText(ctx, hi.toFixed(2), lo.toFixed(2)); const v = R.w[G.e - 1]; if (fin(v)) head(ctx, G, 'BBW ' + fmt2(v), '#2962ff'); }
});

// ── ③ BBTrend(TV 내장 · John Bollinger) ──
//   색: 0 위 → 앞 봉보다 크면 진한 초록(0 에서 멀어짐) · 아니면 옅은 초록 / 0 이하 → 앞 봉보다 작으면 진한 빨강 · 아니면 옅은 빨강(앞 봉 na 면 비교 거짓 = 옅게 — 파인 꼴)
function bbtrCalc(rows, p) { const C = closes(rows), S = bb(C, p.shortLen, p.mult), L = bb(C, p.longLen, p.mult), n = C.length, v = new Float64Array(n), bc = new Int8Array(n);
  for (let t = 0; t < n; t++) { const a = Math.abs(S.lo[t] - L.lo[t]) - Math.abs(S.up[t] - L.up[t]); v[t] = fin(a) ? div(a, S.basis[t]) * 100 : NaN; }
  for (let t = 0; t < n; t++) { const x = v[t], x1 = t > 0 ? v[t - 1] : NaN; bc[t] = !fin(x) ? -1 : (x > 0 ? (fin(x1) && x > x1 ? 0 : 1) : (fin(x1) && x < x1 ? 2 : 3)); }   // 0 진초록 · 1 옅은 초록 · 2 진빨강 · 3 옅은 빨강 · −1 없음
  return { v, bc }; }
const TR_BC = ['#089981', '#a5d6a7', '#f23645', '#faa1a4'];
TV.reg({
  id: 'bbtr', place: 'pane', name: 'BBTrend', short: 'BBTrend', kname: 'BBTrend(볼린저 추세)',
  author: 'TradingView 내장 지표(John Bollinger)', license: '라이선스 없음(내장 식)', srcFile: '—',
  inputs: [
    { k: 'shortLen', nm: '짧은 BB 길이', o: 'Short BB Length', t: 'int', d: 20, min: 1, max: 500 },
    { k: 'longLen', nm: '긴 BB 길이', o: 'Long BB Length', t: 'int', d: 50, min: 1, max: 1000 },
    { k: 'mult', nm: '표준편차 배수', o: 'StdDev', t: 'float', d: 2.0, min: 0.001, max: 50, step: 0.1 }
  ],
  legend: p => 'BBTrend ' + [p.shortLen, p.longLen, p.mult].join(' '),
  calc: bbtrCalc,
  drawPane(ctx, R, G) { const [lo, hi] = span(G, [R.v], [0]), y = yOf(G, lo, hi);
    hband(ctx, G, y, 0, '#787b86'); bars(ctx, G, y, R.v, i => TR_BC[R.bc[i]]); G.axisText(ctx, hi.toFixed(2), lo.toFixed(2));
    const li = G.e - 1, v = R.v[li]; if (fin(v)) head(ctx, G, 'BBTrend ' + fmt2(v), TR_BC[R.bc[li]] || '#888'); }
});

// ── ④ Bollinger Bands Impulse [LazyBear] ──
//   원본: bbr = (source − lower) / (upper − lower) · bbi = bbr − nz(bbr[1])(앞 봉 na 면 0 → 값이 처음 나는 봉은 bbi = bbr)
//         bbc = bbi > 0 ? (bbi > alert and bbi < impulse ? lime : bbi > impulse ? orange : aqua) : (bbi < −alert and bbi > −impulse ? red : bbi < −impulse ? orange : aqua)
//         줄: 0(style=3) · ±impulse(실선) · ±alert(style=3) · Range(showRange · bbr · −bbr 회색 면 transp 80) · bbi 막대(linewidth 2)
function bbimpCalc(rows, p) { const C = closes(rows), { up, lo } = bb(C, p.length, p.mult), n = C.length, bbr = new Float64Array(n), bbi = new Float64Array(n), bc = new Int8Array(n), A = p.alertLevel, I = p.impulseLevel;
  for (let t = 0; t < n; t++) bbr[t] = div(C[t] - lo[t], up[t] - lo[t]);
  for (let t = 0; t < n; t++) { const pv = t > 0 && fin(bbr[t - 1]) ? bbr[t - 1] : 0; bbi[t] = fin(bbr[t]) ? bbr[t] - pv : NaN; const x = bbi[t];
    bc[t] = !fin(x) ? -1 : (x > 0 ? ((x > A && x < I) ? 1 : (x > I ? 2 : 0)) : ((x < -A && x > -I) ? 3 : (x < -I ? 4 : 0))); }   // 0 하늘 · 1 라임(경고 +) · 2 주황(충격 +) · 3 빨강(경고 −) · 4 주황(충격 −) · −1 없음
  return { bbr, bbi, bc }; }
const IMP_BC = ['#00bcd4', '#00e600', '#ff9800', '#ff0000', '#ff9800'];
TV.reg({
  id: 'bbimp', place: 'pane', name: 'Bollinger Bands Impulse [LazyBear]', short: 'BBIMP_LB', kname: '볼린저 임펄스(BBImpulse)',
  author: 'LazyBear', license: '라이선스 표기 없음', srcFile: 'Bollinger_Bands_Impulse.txt',
  inputs: [
    { k: 'length', nm: '길이', o: 'length', t: 'int', d: 20, min: 1, max: 500 },
    { k: 'mult', nm: '배수', o: 'Mult Factor', t: 'float', d: 2.0, min: 0.001, max: 50, step: 0.1 },
    { k: 'alertLevel', nm: '경고선', o: 'alertLevel', t: 'float', d: 0.24, min: 0, max: 5, step: 0.01 },
    { k: 'impulseLevel', nm: '충격선', o: 'impulseLevel', t: 'float', d: 0.40, min: 0, max: 5, step: 0.01 },
    { k: 'showRange', nm: 'Range 보이기(%b 회색 면)', o: 'showRange', t: 'bool', d: false }
  ],
  legend: p => 'BBIMP_LB ' + [p.length, p.mult, p.alertLevel, p.impulseLevel].join(' '),
  calc: bbimpCalc,
  drawPane(ctx, R, G, p) { const A = +p.alertLevel, I = +p.impulseLevel, ext = [I, -I, A, -A, 0], arr = [R.bbi]; if (p.showRange) { arr.push(R.bbr); arr.push(Array.from(R.bbr, v => -v)); }
    const [lo, hi] = span(G, arr, ext), y = yOf(G, lo, hi);
    if (p.showRange) { ctx.save(); ctx.fillStyle = 'rgba(128,128,128,0.2)'; const bw = Math.max(G.cw, 1), y0 = y(0); for (let i = G.s; i < G.e; i++) { const v = R.bbr[i]; if (!fin(v)) continue; const x = G.x(i), a = y(v), b = y(-v); ctx.fillRect(x - bw / 2, Math.min(y0, a), bw, Math.abs(a - y0)); ctx.fillRect(x - bw / 2, Math.min(y0, b), bw, Math.abs(b - y0)); } ctx.restore(); }
    hband(ctx, G, y, 0, '#9e9e9e', [2, 3]); hband(ctx, G, y, I, '#9e9e9e'); hband(ctx, G, y, A, '#9e9e9e', [2, 3]); hband(ctx, G, y, -A, '#9e9e9e', [2, 3]); hband(ctx, G, y, -I, '#9e9e9e');
    bars(ctx, G, y, R.bbi, i => R.bc[i] >= 0 ? IMP_BC[R.bc[i]] : null); G.axisText(ctx, hi.toFixed(2), lo.toFixed(2));
    const li = G.e - 1, v = R.bbi[li]; if (fin(v)) head(ctx, G, (v >= 0 ? '+' : '') + fmt2(v) + ' · 경고 ±' + A + ' · 충격 ±' + I, IMP_BC[R.bc[li]] || '#888'); }
});

// ── ⑤ 〰️ 볼린저 구역 배지 [S1878] — 앱 자체 정의(📈 크로스 탭 〰️ 볼린저 모드와 같은 계산 함수) · 선 없이 지금 구역만(사용자 2026-11-03 09:45) ──
//   계산: window._bbzSer(rows, 종가, 설정) · window._bbzZone(sx_render.js · S1876) 를 그대로 부른다 → 구역 · 잠금이 탭 BT 와 같은 값
//         함수가 없으면(sx_render.js 가 안 실린 곳) 배지를 안 그리고 읽기 글에 그렇게 적는다(지어내지 않음)
//   배지(캔들 칸 왼쪽 위 · 마지막 봉 기준): '〰️ 구역 ±x.xσ' + 과열 이탈 잠금이면 ' · 🔒 잠금' · 색 = 과열 주황 · 상승 쪽 초록 · 횡보 회색 · 하락 쪽 빨강 · 폭락 보라(원안 v3 색)
//   σ 자리 = (종가 − 중심선) ÷ σ · 과열 이탈 = 종가가 맨 위 선 아래로 내려온 봉(탭의 과열 이탈 청산 · 잠금과 같은 정의 · 읽기 글에 '마지막 과열 이탈 n봉 전')
const BZ_RGB = { side: [100, 116, 139], up: [22, 163, 74], dn: [220, 38, 38], hot: [234, 88, 12], crash: [147, 51, 234] };
const bzRgba = (c, a) => 'rgba(' + c.join(',') + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
const bzCol = z => z === '과열' ? BZ_RGB.hot : z === '폭락' ? BZ_RGB.crash : /상승/.test(z) ? BZ_RGB.up : /하락/.test(z) ? BZ_RGB.dn : BZ_RGB.side;
const bzSg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + 'σ';
function bbzCfg(p) { return { bbzOn: true, bbzP: p.P, bbzM1: p.m1, bbzM2: p.m2, bbzM3: p.m3, bbzB1: !!p.b1, bbzB2: !!p.b2, bbzB3: !!p.b3, bbzBs: p.bs, bbzBN: p.bN }; }
function bbzCalc(rows, p) { const W = (typeof window !== 'undefined') ? window : {}, f = W._bbzSer, zf = W._bbzZone;
  if (typeof f !== 'function' || typeof zf !== 'function') return { none: true };
  const n = rows.length, close = rows.map(r => +((r || {}).close)), S = f(rows, close, bbzCfg(p)), top = S.top, li = n - 1;
  const hotX = new Uint8Array(n); for (let i = 1; i < n; i++) if (top && top[i] != null && top[i - 1] != null && close[i] < top[i] && close[i - 1] >= top[i - 1]) hotX[i] = 1;
  const m = li >= 0 ? S.mid[li] : null, d = li >= 0 ? S.sd[li] : null, z = (m != null && d != null && fin(m) && d > 0 && fin(close[li])) ? (close[li] - m) / d : null;
  return { S, close, hotX, zone: li >= 0 ? (zf(S, li, close[li]) || '') : '', z, lock: li >= 0 ? S.lock[li] === 1 : false }; }
function bzBadgeTxt(R) { return '〰️ ' + R.zone + (R.z != null ? ' ' + bzSg(R.z) : '') + (R.lock ? ' · 🔒 잠금' : ''); }
TV.reg({
  id: 'bbz', place: 'over', name: 'Bollinger Zone Badge (앱 〰️ 볼린저 모드 정의)', short: 'BB Zone', kname: '〰️ 볼린저 구역 배지',
  author: '앱(📈 크로스 탭 〰️ 볼린저 모드와 같은 계산 함수 · 사용자 설계)', license: '앱 자체 정의 · 라이선스 없음',
  app: '앱 자체 정의 — 📈 크로스 탭 〰️ 볼린저 모드(S1876)와 같은 계산 함수(_bbzSer · 같은 기간 SMA ± 모집단 σ × 승수 · 과열 이탈 잠금) · 선 없이 지금 구역 배지만(사용자 2026-11-03)',
  inputs: [
    { k: 'P', nm: '기간(밴드 셋 같이)', o: '—', t: 'int', d: 200, min: 2, max: 1000, app: true },
    { k: 'b1', nm: '밴드 1 쓰기', o: '—', t: 'bool', d: true, app: true },
    { k: 'm1', nm: '  밴드 1 승수', o: '—', t: 'float', d: 1, min: 0.1, max: 10, step: 0.1, app: true },
    { k: 'b2', nm: '밴드 2 쓰기', o: '—', t: 'bool', d: true, app: true },
    { k: 'm2', nm: '  밴드 2 승수', o: '—', t: 'float', d: 2, min: 0.1, max: 10, step: 0.1, app: true },
    { k: 'b3', nm: '밴드 3 쓰기', o: '—', t: 'bool', d: true, app: true },
    { k: 'm3', nm: '  밴드 3 승수', o: '—', t: 'float', d: 3, min: 0.1, max: 10, step: 0.1, app: true },
    { k: 'bs', nm: '기준(잠금 풀림 판단 · 구역은 늘 종가)', o: '—', t: 'sel', d: 'c', opts: ['c', 'ma'], optNm: { c: '종가', ma: 'MA' }, app: true },
    { k: 'bN', nm: '  MA 길이', o: '—', t: 'int', d: 5, min: 1, max: 400, app: true }
  ],
  legend: p => '〰️ 볼린저 구역 ' + p.P + ' ±' + [[p.b1, p.m1], [p.b2, p.m2], [p.b3, p.m3]].filter(x => x[0]).map(x => x[1]).join('/') + (p.bs === 'ma' ? ' · MA' + p.bN : ''),
  calc: bbzCalc,
  draw(ctx, R, G, p) { if (!R || R.none || !R.zone) return; const t = bzBadgeTxt(R), c = bzCol(R.zone);
    ctx.save(); ctx.font = 'bold 10px Outfit,sans-serif'; const w = ctx.measureText(t).width + 12, h = 17, x = G.pad.l + 4, y = G.pad.t + 4;
    ctx.fillStyle = bzRgba(c, 0.9); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 6, y + h / 2 + 0.5); ctx.restore(); }
});

// ── 읽기 글(마지막 봉 · S1872 sx_tvread.js 와 같은 꼴 · 🧩 칩은 S1874 — 여기는 ok = null) ──
const ago = (li, i) => li - i === 0 ? '이 봉' : (li - i) + '봉 전';
const px = v => !fin(v) ? '—' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 1 ? (+v.toFixed(2)).toString() : (+v.toPrecision(4)).toString());
const sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
const RD = {
  bbpb(R, p, rows) { const v = R.pb[rows.length - 1]; if (!fin(v)) return null;
    const z = (v - 0.5) * 2 * p.mult;   // 중심선에서 몇 σ — %B = 0.5 + (종가 − 중심) / (2 × 배수 × σ) 를 거꾸로(더블 · 트리플 선 자리와 바로 견줌)
    return { t: '%B ' + v.toFixed(2) + '(중심선에서 ' + (z > 0 ? '+' : z < 0 ? '−' : '') + Math.abs(z).toFixed(2) + 'σ) · ' + (v > 1 ? '상단선 위(1 넘음)' : v >= 0.5 ? '중심선 ~ 상단선 사이' : v >= 0 ? '하단선 ~ 중심선 사이' : '하단선 아래(0 밑)'), ok: null }; },
  bbw(R, p, rows) { const li = rows.length - 1, v = R.w[li], h = R.hx[li], l = R.lc[li]; if (!fin(v)) return null;
    let s; if (fin(h) && fin(l)) s = v <= l ? p.conLen + '봉 최저(수축)' : v >= h ? p.expLen + '봉 최고(확장)' : '최저 ~ 최고 사이 ' + Math.round((v - l) / (h - l) * 100) + '% 자리'; else s = '최고 · 최저 계산 전(봉 모자람)';
    if (p.pctOn) { const q = R.pr[li]; s += fin(q) ? ' · 수축 띠 ' + p.pctLen + '봉 안 ' + Math.round(q) + '% ' + (q > p.pctTh ? '(빨강)' : '(노랑 · ' + p.pctTh + ' 이하 = 수축)') : ' · 수축 띠 계산 전'; }
    return { t: 'BBW ' + px(v) + ' · ' + s, ok: null }; },
  bbtr(R, p, rows) { const li = rows.length - 1, v = R.v[li], v1 = li > 0 ? R.v[li - 1] : NaN; if (!fin(v)) return null;
    return { t: sg(v) + ' · ' + (v > 0 ? '0 위(상승 쪽)' : v < 0 ? '0 아래(하락 쪽)' : '0') + ' · ' + ['0 에서 멀어짐(진한 초록)', '0 쪽으로 줄어듦(옅은 초록)', '0 에서 멀어짐(진한 빨강)', '0 쪽으로 줄어듦(옅은 빨강)'][R.bc[li]], ok: null }; },
  bbimp(R, p, rows) { const li = rows.length - 1, v = R.bbi[li]; if (!fin(v)) return null; let k = -1; for (let i = li; i >= 0; i--) if (R.bc[i] >= 1) { k = i; break; }
    return { t: sg(v) + ' · 이 봉 ' + ['보통(하늘)', '경고 +(라임)', '충격 +(주황)', '경고 −(빨강)', '충격 −(주황)'][R.bc[li]] + (k >= 0 ? ' · 마지막 경고 · 충격 ' + (R.bc[k] <= 2 ? '+ 쪽' : '− 쪽') + ' ' + ago(li, k) : ' · 경고 · 충격 아직 없음'), ok: null }; },
  bbz(R, p, rows) { if (!R || R.none) return { t: '⚠ 계산 함수 없음(📈 크로스 탭 sx_render.js 가 안 실림) — 배지 안 그림', ok: null }; if (!R.zone) return null; const li = rows.length - 1;
    let k = -1; for (let i = li; i >= 0; i--) if (R.hotX[i]) { k = i; break; }
    return { t: '지금 구역 ' + R.zone + (R.z != null ? '(' + bzSg(R.z) + ')' : '') + (R.lock ? ' · 과열 이탈 잠금(기준이 녹색 아래로 내려오기 전엔 탭 새 진입 금지)' : '') + ' · ' + (k >= 0 ? '마지막 과열 이탈 ' + ago(li, k) : '과열 이탈 아직 없음'), ok: null }; }
};
if (TV.READ) Object.keys(RD).forEach(k => { TV.READ[k] = RD[k]; });
if (typeof module !== 'undefined' && module.exports) module.exports = { bbpbCalc, bbwCalc, bbtrCalc, bbimpCalc, bb, hiN, loN, RD, bbzCalc, bbzCfg, bzBadgeTxt /* [S1878] */ };
})();
