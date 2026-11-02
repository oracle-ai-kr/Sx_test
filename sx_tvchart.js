// sx_tvchart.js — [S1864] 풀차트(상세 차트) TradingView 지표 틀 — [＋ 지표] 목록 · 범례(⚙️ 👁 ✕) · 설정 시트 · 저장 · 보일 봉 수 · 가로 보기
//   표시용 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 측정도 BT 도 아니다. 설계 = offline/tvchart/design_tvchart.md · offline/s1864/design_s1864.md
//   지표는 라이선스별 파일이 SXTV.reg 로 단다: sx_tvind_nolic.js(표기 없음) · sx_tvind_ccbyncsa.js(CC BY-NC-SA 4.0) — 출처는 각 파일 머리
//   계산 = 넘겨받은 봉 전부(보통 600) · 보이기 = 마지막 N봉(60 · 120 · 200) · 설정 = 이 브라우저 저장소 SX_TVCHART_V1(try/catch · 종목이 바뀌어도 유지)
//   sx_chart.js 는 고리만 단다(openFull → renderFull · 캔들 칸 범위 · 봉 색 · 위에 그리기 · 아래 칸)
//   [S1866] 입력 종류 'sel'(고르기 · 원본 input.string options) · 3단계 지표 파일 sx_tvind_mpl.js(MPL 2.0) 추가
//   [S1870] 지표 정의에 app(앱 자체 정의 · 출처 글) 이 있으면 설정 시트 출처 줄을 그 글로(🎯 ICT 오더블록 — TradingView 스크립트가 아님)
var SXTV = (function(){
'use strict';
// ── 파인 약속(offline/_pta.js fe4a960e2934 5 ~ 35줄 글자 그대로) ──
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
const pta = { fin, nz, smaAt, sma, ema, rma, emaG, smaS, stdevS, smaSdS, stdev, rsi, trS, atr, highest, lowest, linreg, cci, pivotHigh, pivotLow, clamp };

// ── 등록 · 저장 ──
const IND = {}, ORDER = [], KEY = 'SX_TVCHART_V1', BARS = [60, 120, 200], DEF_BARS = 60;
function reg(d) { if (!d || !d.id || IND[d.id]) return; IND[d.id] = d; ORDER.push(d.id); }
// 앱 기본 지표 둘 — 계산 · 그리기는 sx_chart.js(calcRSI · calcMACD · _drawFullRSI · _drawFullMACD) 그대로 · 여기는 목록 · 범례 · 입력값만
reg({ id: 'rsi', place: 'pane', builtin: true, name: 'Relative Strength Index', short: 'RSI', kname: 'RSI', author: 'J. Welles Wilder(앱 기본)', license: '앱 기본 지표',
  inputs: [{ k: 'len', nm: '길이', o: 'Length', t: 'int', d: 14, min: 2, max: 200 }], legend: p => 'RSI (' + p.len + ')' });
reg({ id: 'macd', place: 'pane', builtin: true, name: 'MACD', short: 'MACD', kname: 'MACD', author: 'Gerald Appel(앱 기본)', license: '앱 기본 지표',
  inputs: [{ k: 'fast', nm: '빠른 길이', o: 'Fast Length', t: 'int', d: 12, min: 1, max: 200 }, { k: 'slow', nm: '느린 길이', o: 'Slow Length', t: 'int', d: 26, min: 2, max: 400 }, { k: 'sig', nm: '시그널 길이', o: 'Signal Smoothing', t: 'int', d: 9, min: 1, max: 100 }],
  legend: p => 'MACD (' + p.fast + ', ' + p.slow + ', ' + p.sig + ')' });
function blank() { return { v: 1, bars: DEF_BARS, on: ['rsi', 'macd'], hide: {}, p: {} }; }   // 처음엔 예전처럼 RSI · MACD 칸이 보인다(✕ 로 끔)
function load() { let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { o = null; }
  const s = blank(); if (!o || typeof o !== 'object') return s;
  if (BARS.indexOf(o.bars) >= 0) s.bars = o.bars;
  if (Array.isArray(o.on)) { s.on = []; o.on.forEach(id => { if (typeof id === 'string' && s.on.indexOf(id) < 0) s.on.push(id); }); }   // 저장된 목록이 있으면 그것만(다 껐으면 빈 채)
  if (o.hide && typeof o.hide === 'object') Object.keys(o.hide).forEach(id => { if (o.hide[id]) s.hide[id] = 1; });
  if (o.p && typeof o.p === 'object') Object.keys(o.p).forEach(id => { if (o.p[id] && typeof o.p[id] === 'object') s.p[id] = Object.assign({}, o.p[id]); });
  return s; }
let S = null; function st() { if (!S) S = load(); return S; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st())); } catch (_) { } }
// 입력값 하나 고르기 — 정수는 반올림 · 범위 밖은 끝값 · 숫자가 아니면 기본값
function clean(inp, v) {
  if (inp.t === 'sel') return ((inp.opts || []).indexOf(v) >= 0) ? v : inp.d;   // [S1866] 고르기 — 목록 밖이면 기본값
  if (inp.t === 'bool') return (typeof v === 'boolean') ? v : inp.d;
  let x = +v; if (v === null || v === '' || !fin(x)) return inp.d;
  if (inp.t === 'int') x = Math.round(x);
  if (inp.min != null && x < inp.min) x = inp.min; if (inp.max != null && x > inp.max) x = inp.max;
  return x; }
function params(id) { const d = IND[id], q = (st().p[id]) || {}, o = {}; if (!d) return o; d.inputs.forEach(i => { o[i.k] = clean(i, q[i.k]); }); return o; }
function isOn(id) { return !!IND[id] && st().on.indexOf(id) >= 0; }
function shown(id) { return isOn(id) && !st().hide[id]; }
function onList() { return st().on.filter(id => !!IND[id]); }
function bars() { return st().bars; }

// ── 계산(같은 봉 배열 · 같은 입력이면 다시 안 셈) ──
let _cache = { rows: null, m: {} };
function result(id, rows) { if (_cache.rows !== rows) _cache = { rows, m: {} };
  const p = params(id), k = id + '|' + JSON.stringify(p); if (!(k in _cache.m)) { let r = null; try { r = IND[id].calc(rows, p); } catch (e) { r = null; try { console.warn('[S1864] 지표 계산 실패', id, e); } catch (_) { } } _cache.m[k] = r; }
  return { R: _cache.m[k], p }; }

// ── sx_chart.js 고리 ──
// 가격 범위에 차트 위 지표의 보이는 값을 넣는다(TV 자동 범위처럼)
function rangeVals(rows, s, e, out) { let any = false; onList().forEach(id => { const d = IND[id]; if (d.place !== 'over' || !shown(id) || !d.range) return; if (!d.noMargin) any = true;   /* [S1866] noMargin = 글자 없는 지표(볼륨 프로파일)는 여유를 안 부름 */ const x = result(id, rows); if (x.R) d.range(x.R, s, e, x.p, out); });
  if (!any) return; let mx = -Infinity, mn = Infinity; for (const v of out) if (fin(v)) { if (v > mx) mx = v; if (v < mn) mn = v; } if (mx > mn) { const m = (mx - mn) * 0.07; out.push(mx + m, mn - m); } }   // 차트 위 지표를 켰을 때만 위아래 7% 여유(신호 글자 자리)
// 봉 색(원본 barcolor) — 마지막에 켠 지표가 이긴다(파인과 같음 · 뒤에 그린 것이 덮음)
function barColorFn(rows, off) { const fs = []; onList().forEach(id => { const d = IND[id]; if (d.place === 'over' && shown(id) && d.barColor) { const x = result(id, rows); if (x.R) fs.push([d, x]); } });
  if (!fs.length) return null; return i => { let c = null; fs.forEach(([d, x]) => { const v = d.barColor(x.R, off + i, x.p); if (v) c = v; }); return c; }; }
// 캔들 칸 위에 그리기 — g = { pad, cw, yFn, W, H, off, rows }
function drawOver(ctx, g) { const list = onList().filter(id => IND[id].place === 'over' && shown(id)); if (!list.length) return;
  const n = g.rows.length, s = g.off, e = n, stack = {};
  const G = { s, e, cw: g.cw, pad: g.pad, W: g.W, H: g.H, x: i => g.pad.l + (i - s) * g.cw + g.cw / 2, y: g.yFn,
    label(i, txt, col, above) {   // TV labelup / labeldown — 봉 아래(▲) · 위(▼) · 같은 봉이면 쌓음
      const r = g.rows[i]; if (!r) return; const k = i + (above ? 'a' : 'b'), j = stack[k] = (stack[k] || 0) + 1;
      ctx.save(); ctx.font = 'bold 9px Outfit,sans-serif'; const w = ctx.measureText(txt).width + 6, h = 12, x = G.x(i);
      let y = above ? g.yFn(+r.high) - 5 - j * (h + 2) : g.yFn(+r.low) + 5 + (j - 1) * (h + 2);
      ctx.fillStyle = col; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y, w, h, 3); else ctx.rect(x - w / 2, y, w, h); ctx.fill();
      ctx.beginPath(); if (above) { ctx.moveTo(x - 3, y + h); ctx.lineTo(x + 3, y + h); ctx.lineTo(x, y + h + 3); } else { ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.lineTo(x, y - 3); } ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + h / 2 + 0.5); ctx.restore(); } };
  ctx.save(); ctx.beginPath(); ctx.rect(g.pad.l, 0, g.W - g.pad.l - g.pad.r, g.H); ctx.clip();
  list.forEach(id => { const x = result(id, g.rows); if (!x.R) return; try { IND[id].draw(ctx, x.R, G, x.p); } catch (e) { try { console.warn('[S1864] 지표 그리기 실패', id, e); } catch (_) { } } });
  ctx.restore(); }
// 아래 칸(캔버스) HTML · 그리기
function paneList() { return onList().filter(id => IND[id].place === 'pane' && !IND[id].builtin && shown(id)); }
function paneHtml() { return paneList().map(id => { const d = IND[id], p = params(id);
  return '<div style="font-size:10px;font-weight:600;color:#888;margin:12px 0 4px">' + esc(d.legend(p)) + '</div>' +
    '<canvas id="sxTvPane_' + id + '" style="width:100%;height:90px;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:8px"></canvas>'; }).join(''); }
function drawPanes(rows, off, setup) { paneList().forEach(id => { const cv = document.getElementById('sxTvPane_' + id); if (!cv) return; const x = result(id, rows); if (!x.R) return;
  const rect = cv.getBoundingClientRect(), W = Math.round(rect.width) || 360, H = 90, ctx = setup(cv, W, H), pad = { t: 8, b: 8, l: 8, r: 42 }, n = rows.length - off, cw = (W - pad.l - pad.r) / n;
  const G = { s: off, e: rows.length, cw, pad, W, H, x: i => pad.l + (i - off) * cw + cw / 2,
    axisText(c, a, b) { c.font = '8px Outfit,sans-serif'; c.fillStyle = '#888'; c.textAlign = 'right'; c.fillText(String(a), W - 3, pad.t + 8); c.fillText(String(b), W - 3, H - pad.b - 2); } };
  try { IND[id].drawPane(ctx, x.R, G, x.p); } catch (e) { try { console.warn('[S1864] 아래 칸 그리기 실패', id, e); } catch (_) { } } }); }

// ── 가로 보기 ──
function ovEl() { return document.getElementById('sxChartOverlay'); }
function isFs() { const f = document.fullscreenElement || document.webkitFullscreenElement; return !!f && f === ovEl(); }
function phoneLand() { return window.innerWidth > window.innerHeight && window.innerHeight <= 500; }   // 폰 가로(PC 넓은 창은 높이가 커서 아님 · S282 480px 뜻 지킴)
function wide() { return isFs() || phoneLand(); }
function layout(ov) { if (ov) ov.style.maxWidth = wide() ? 'none' : '480px'; }
function candleH() { return wide() ? Math.max(180, Math.round(window.innerHeight - 118)) : 240; }
// 가로일 때 그린 뒤 캔들 칸을 화면에 남은 높이에 맞춘다(머리 줄 · 범례 높이를 재서) — 세로면 그대로
function fitH(cv, h) { if (!cv || !wide()) return h; try { const b = document.getElementById('sxChartBody'); if (!b) return h; const rb = b.getBoundingClientRect(), rc = cv.getBoundingClientRect(); const v = Math.max(160, Math.round(rb.bottom - rc.top - 14)); cv.style.height = v + 'px'; return v; } catch (_) { return h; } }
function toggleFs() { const ov = ovEl(); if (!ov) return;
  try { if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const rq = ov.requestFullscreen || ov.webkitRequestFullscreen; if (!rq) { toast('이 브라우저는 전체화면을 지원하지 않아요'); return; }
    const pr = rq.call(ov, { navigationUI: 'hide' }); const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => { }); } catch (_) { } };
    if (pr && pr.then) pr.then(lock).catch(() => { toast('전체화면을 열지 못했어요'); }); else lock(); } catch (_) { } }
function exitFs() { try { if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { } }
function toast(m) { try { if (typeof window.toast === 'function') window.toast(m); } catch (_) { } }
let _lastW = null;
function rerender() { try { const X = (typeof SXChart !== 'undefined') ? SXChart : null; if (X && X.renderFull) X.renderFull(); } catch (_) { } }   // SXChart 는 sx_chart.js 최상위 const(window 속성이 아님)
if (typeof window !== 'undefined' && window.addEventListener) {
  let tmr = null; const onSz = () => { clearTimeout(tmr); tmr = setTimeout(() => { const ov = ovEl(); if (!ov || ov.style.display === 'none' || ov.style.display === '') return; const k = window.innerWidth + '|' + wide(); if (k === _lastW) return; _lastW = k; rerender(); }, 180); };
  window.addEventListener('resize', onSz); window.addEventListener('orientationchange', onSz);
  document.addEventListener && document.addEventListener('fullscreenchange', () => { _lastW = null; onSz(); });
}

// ── 화면 조각 ──
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const BTN = 'border:1px solid #d1d5db;background:#fff;color:#374151;font-size:10px;font-weight:700;padding:4px 7px;border-radius:6px;cursor:pointer;flex-shrink:0;margin-left:4px';
function headHtml() { return '<button id="sxTvAddBtn" onclick="window._sxTv&&_sxTv.list()" style="' + BTN + '">＋ 지표</button>' +
  '<button id="sxTvFsBtn" onclick="window._sxTv&&_sxTv.fs()" title="전체화면 + 가로" style="' + BTN + '">' + (isFs() ? '⤡' : '⤢') + '</button>'; }
function topHtml() { const s = st();
  let h = '<div id="sxTvTop" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:6px">';
  h += '<span style="font-size:10px;color:#888;font-weight:600">보일 봉</span>' + BARS.map(b => '<button data-tv-bars="' + b + '" onclick="window._sxTv&&_sxTv.bars(' + b + ')" style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;cursor:pointer;border:1px solid ' + (s.bars === b ? '#2563eb;background:#2563eb;color:#fff' : '#d1d5db;background:#fff;color:#374151') + '">' + b + '</button>').join('');
  h += '</div>';
  const on = onList(), wd = wide(); if (on.length) { h += '<div id="sxTvLegend" style="display:flex;' + (wd ? 'flex-wrap:wrap;gap:3px 14px' : 'flex-direction:column;gap:3px') + ';margin-bottom:6px">';
    on.forEach(id => { const d = IND[id], p = params(id), hid = !!s.hide[id];
      h += '<div data-tv-leg="' + id + '" style="display:flex;align-items:center;gap:6px;font-size:10px;color:' + (hid ? '#bbb' : '#374151') + '">' +
        '<span style="' + (wd ? '' : 'flex:1;') + 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (d.place === 'pane' ? '▤ ' : '') + esc(d.legend(p)) + '</span>' +
        '<span onclick="window._sxTv&&_sxTv.gear(\'' + id + '\')" style="cursor:pointer;padding:0 3px">⚙️</span>' +
        '<span onclick="window._sxTv&&_sxTv.eye(\'' + id + '\')" style="cursor:pointer;padding:0 3px;opacity:' + (hid ? '.35' : '1') + '">👁</span>' +
        '<span onclick="window._sxTv&&_sxTv.off(\'' + id + '\')" style="cursor:pointer;padding:0 3px;color:#9ca3af">✕</span></div>'; });
    h += '</div>'; }
  return h; }
// 시트(목록 · 설정) — 다시 그려도 열린 채로
let _sheet = null;   // { kind:'list' } | { kind:'gear', id }
const SHEET = 'position:absolute;left:0;right:0;bottom:0;max-height:72%;overflow-y:auto;background:#fff;border-top:1px solid #e5e7eb;border-radius:14px 14px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.18);padding:12px 14px 18px;z-index:5';
function sheetHtml() { if (!_sheet) return '';
  const close = '<span onclick="window._sxTv&&_sxTv.close()" style="cursor:pointer;font-size:14px;color:#6b7280;padding:0 4px">✕</span>';
  if (_sheet.kind === 'list') { let h = '<div id="sxTvSheet" data-tv-sheet="list" style="' + SHEET + '"><div style="display:flex;align-items:center;margin-bottom:8px"><b style="flex:1;font-size:13px;color:#111">지표 더하기</b>' + close + '</div>';
    h += '<div style="font-size:10px;color:#9ca3af;margin-bottom:8px">TradingView 공개 스크립트를 옮긴 것 · 표시만 · 판정 아님 · 성적 주장 없음</div>';
    [['over', '차트 위'], ['pane', '아래 칸']].forEach(([pl, nm]) => { const ids = ORDER.filter(id => IND[id].place === pl); if (!ids.length) return;
      h += '<div style="font-size:11px;font-weight:700;color:#6b7280;margin:8px 0 4px">' + nm + '</div>';
      ids.forEach(id => { const d = IND[id], on = isOn(id);
        h += '<div data-tv-item="' + id + '" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6"><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:#111">' + esc(d.kname) + '</div><div style="font-size:9px;color:#9ca3af">' + esc(d.name) + ' · ' + esc(d.author) + ' · ' + esc(d.license) + '</div></div>' +
          '<button onclick="window._sxTv&&_sxTv.tog(\'' + id + '\')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;cursor:pointer;border:1px solid ' + (on ? '#16a34a;background:#16a34a;color:#fff">✓ 켬' : '#d1d5db;background:#fff;color:#374151">켜기') + '</button></div>'; }); });
    return h + '</div>'; }
  const id = _sheet.id, d = IND[id]; if (!d) return ''; const p = params(id);
  let h = '<div id="sxTvSheet" data-tv-sheet="gear" data-tv-id="' + id + '" style="' + SHEET + '"><div style="display:flex;align-items:center;margin-bottom:4px"><b style="flex:1;font-size:13px;color:#111">⚙️ ' + esc(d.kname) + '</b>' + close + '</div>';
  h += '<div style="font-size:9px;color:#9ca3af;margin-bottom:8px">' + esc(d.name) + '</div>';
  d.inputs.forEach(i => { const v = p[i.k];
    h += '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f3f4f6"><span style="flex:1;min-width:0"><span style="font-size:12px;color:#111">' + esc(i.nm) + '</span><br><span style="font-size:9px;color:#9ca3af">' + esc(i.o) + ' · 기본 ' + esc(i.t === 'bool' ? (i.d ? '켬' : '끔') : i.d) + '</span></span>';
    if (i.t === 'sel') h += '<select data-tv-in="' + i.k + '" onchange="window._sxTv&&_sxTv.set(\'' + id + '\',\'' + i.k + '\',this.value)" style="font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;background:#fff;max-width:150px">' + (i.opts || []).map(o => '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc((i.optNm && i.optNm[o]) || o) + '</option>').join('') + '</select>';   // [S1866]
    else if (i.t === 'bool') h += '<input type="checkbox" data-tv-in="' + i.k + '"' + (v ? ' checked' : '') + ' onchange="window._sxTv&&_sxTv.set(\'' + id + '\',\'' + i.k + '\',this.checked)" style="width:20px;height:20px">';
    else h += '<input type="number" inputmode="decimal" data-tv-in="' + i.k + '" value="' + esc(v) + '"' + (i.min != null ? ' min="' + i.min + '"' : '') + (i.max != null ? ' max="' + i.max + '"' : '') + ' step="' + (i.t === 'int' ? 1 : (i.step || 'any')) + '" onchange="window._sxTv&&_sxTv.set(\'' + id + '\',\'' + i.k + '\',this.value)" style="width:76px;font-size:13px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;text-align:right">';
    h += '</label>'; });
  h += '<div style="display:flex;gap:8px;margin-top:10px"><button onclick="window._sxTv&&_sxTv.reset(\'' + id + '\')" style="font-size:11px;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid #d1d5db;background:#fff;color:#374151">기본값 되돌리기</button></div>';
  h += '<div style="font-size:9px;color:#9ca3af;margin-top:10px;line-height:1.5">' + (d.app ? '출처: ' + esc(d.app) : '출처: TradingView 공개 스크립트 "' + esc(d.name) + '" · 작성자 ' + esc(d.author) + ' · ' + esc(d.license)) + ' · 표시만 · 판정 아님</div>';   // [S1870] app = 앱 자체 정의
  return h + '</div>'; }

// ── 누름 ──
function chg(fn) { return function () { try { if (typeof _sxVib === 'function') _sxVib(8); } catch (_) { } fn.apply(null, arguments); save(); rerender(); }; }
const H = {
  list: chg(() => { _sheet = (_sheet && _sheet.kind === 'list') ? null : { kind: 'list' }; }),
  close: chg(() => { _sheet = null; }),
  tog: chg(id => { const s = st(), i = s.on.indexOf(id); if (i >= 0) { s.on.splice(i, 1); delete s.hide[id]; } else if (IND[id]) s.on.push(id); }),
  off: chg(id => { const s = st(), i = s.on.indexOf(id); if (i >= 0) s.on.splice(i, 1); delete s.hide[id]; if (_sheet && _sheet.id === id) _sheet = null; }),
  eye: chg(id => { const s = st(); if (s.hide[id]) delete s.hide[id]; else s.hide[id] = 1; }),
  gear: chg(id => { _sheet = (_sheet && _sheet.kind === 'gear' && _sheet.id === id) ? null : { kind: 'gear', id }; }),
  set: chg((id, k, v) => { const d = IND[id]; if (!d) return; const inp = d.inputs.filter(i => i.k === k)[0]; if (!inp) return; const s = st(); s.p[id] = s.p[id] || {}; const x = clean(inp, inp.t === 'bool' ? !!v : v); if (x === inp.d) delete s.p[id][k]; else s.p[id][k] = x; if (!Object.keys(s.p[id]).length) delete s.p[id]; }),
  reset: chg(id => { delete st().p[id]; }),
  bars: chg(b => { if (BARS.indexOf(b) >= 0) st().bars = b; }),
  fs: () => { try { if (typeof _sxVib === 'function') _sxVib(8); } catch (_) { } toggleFs(); }
};
if (typeof window !== 'undefined') window._sxTv = H;

return { pta, reg, IND, ORDER, KEY, BARS, params, isOn, shown, bars, result, rangeVals, barColorFn, drawOver, paneHtml, drawPanes, headHtml, topHtml, sheetHtml, layout, candleH, fitH, wide, exitFs, _state: st, _reload: () => { S = null; _cache = { rows: null, m: {} }; } };
})();
if (typeof window !== 'undefined') window.SXTV = SXTV;
if (typeof module !== 'undefined' && module.exports) module.exports = SXTV;
