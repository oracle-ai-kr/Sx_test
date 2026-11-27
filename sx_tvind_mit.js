// sx_tvind_mit.js — [S1962] 풀차트 TradingView 지표 · MIT 소스(https://opensource.org/licenses/MIT)
//   표시용 · 읽기 도움 · 판정 아님 · 성적 주장 없음 — 틀 = sx_tvchart.js(SXTV) · 파인 약속 = SXTV.pta(offline/_pta.js 5 ~ 35줄 글자 그대로)
//   이 파일은 아래 원본을 JS 로 옮긴 것이고 원본의 MIT 허가 글을 그대로 붙인다(아래 ── MIT License ── 줄).
//     ① [S1962] Support and Resistance Zones [FEELS] — © 2026 Volodymyr Filias (FeelsStrategy) · MIT · 파인 v6 · 원본 = offline/s1962/src/support-resistance-zones.pine(5c565c105975 · 사본 offline/tvchart/"Support and Resistance Zones [FEELS].txt")
//        github feels-indicators(사용자 2026-11-25 첨부 zip) · 피벗 고점 · 저점을 ATR 폭으로 묶어 닿음 둘 이상인 자리만 구역 · 거래량 진하기 · 오래 안 닿으면 옅어짐 · 깨진 · 빠진 구역 · 시험 · 되시험 · 반응 표시(기본 끔)
//        앱: 마지막 봉 오른쪽 25봉 자리가 없어 구역을 차트 오른쪽 끝까지 긋고 글자를 끝에 붙임 · 색 고르기 칸 없음(원본 기본 색) · 알림 줄 안 옮김 · 600봉 안에서만 셈(TradingView 보다 피벗이 적음)
//   봉마다 파인 그대로 계산한다(전체 봉 · 그 봉까지 자료만).
//
//   ── MIT License(원본 LICENSE 글자 그대로 · offline/s1962/src/LICENSE 416eca8cfb9e) ──
//   MIT License
//
//   Copyright (c) 2026 Volodymyr Filias (FeelsStrategy)
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//   ── 끝 ──
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const T = TV.pta, fin = T.fin;
const num = v => { if (v == null) return NaN; v = +v; return fin(v) ? v : NaN; };   // null · undefined = na
function cols(rows) { const n = rows.length, O = new Float64Array(n), H = new Float64Array(n), L = new Float64Array(n), C = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = rows[i] || {}; O[i] = num(r.open); H[i] = num(r.high); L[i] = num(r.low); C[i] = num(r.close); V[i] = num(r.volume); } return { n, O, H, L, C, V }; }

// ── ① Support and Resistance Zones [FEELS] — 원본 52 ~ 645줄 봉마다 그대로 ──
//   묶음(preset): Local 6 · 4 · 0.5 · 8 / Swing 15 · 8 · 0.9 · 20 / Major 35 · 15 · 1.4 · 50(왼쪽 · 오른쪽 봉 · 묶음 폭 × ATR · 닿음 사이 최소 봉) / Custom = 입력값
//   봉마다 차례(원본 그대로): 새 피벗(ATR 50 이 있고 > 0 일 때만 · 거래량 na · 0 이하 = 1 · 꼬리) → 저항 깨짐(종가 > 위끝 + ATR × 0.3) · 지지 깨짐(종가 < 아래끝 − ATR × 0.3) → 닿음 봉 → 새 피벗이 있으면 구역 다시 묶음
//     다시 묶음: 앞 피벗부터 씨앗 · 씨앗과 ATR × 묶음 폭 안 · 이미 든 피벗과 최소 봉 넘게 떨어진 것만 · 닿음 수 이상이면 구역(가운데 = 무게 평균 · 폭 = 가운데 ± ATR × 0.25)
//       무게 = (1 + 거래량 ÷ 거래량 50봉 평균 × 0.5 + 꼬리 ÷ ATR × 0.5) ÷ (1 + 나이 ÷ 200) · 세기 = 무게 합 · 한쪽 세기 큰 차례로 N 개
//       살던 구역이 새 묶음(ATR × 묶음 폭 안)에 없으면 '빠짐' · 깨진 구역(ATR × 묶음 폭 × 0.7 안)과 겹치는 새 구역은 버림 · 가까운 옛 구역의 닿음 봉을 이어받음
//   표시(기본 끔): 시험 ●(구역 끝을 찌르고 되돌아 마감 · 쉼 봉) · 되시험 ◆(깨진 구역을 반대쪽에서 다시 시험) · 반응 ◆ · 'Break R' · 'Break S'(다시 묶지 않은 봉에 깨진 구역 · 원본 그대로)
//   그림(마지막 봉): 산 구역 = 처음 피벗 봉 ~ 오른쪽 끝 · 가운데 점선 · 진하기 = 투명 82 + 옅어짐(안 닿은 봉 ÷ 옅어짐 봉 × 15 · 최대 15) − 거래량(÷ 가장 큰 구역 × 35) · 40 ~ 95 · 멀면 숨김(가운데가 종가에서 % 넘게)
//     글자 = 세기 ★★★(가장 센 구역의 0.85 이상) · ★★(0.55 이상) · ★ + 닿음 수 × + 거래량 합(K · M · B 또는 %) — 세기는 이 차트 구역끼리 견준 무게(버틸지는 모름)
const SRZ_PRE = { Local: [6, 4, 0.5, 8], Swing: [15, 8, 0.9, 20], Major: [35, 15, 1.4, 50] };
// 피벗(원본 ta.pivothigh · ta.pivotlow) — 봉 t 에 확정 · 가운데 c = t − 오른쪽 봉이 마지막 (왼쪽 + 오른쪽 + 1)개 값 중 가장 높음(낮음) · 같은 값이면 새 봉(오른쪽에 같은 값이 있으면 아님 · 왼쪽 같은 값은 괜찮음)
//   = PineTS 0.13.1 이 적은 TradingView 꼴(2026-10-09 부터) — 앱 공용 약속 SXTV.pta.pivotHigh · pivotLow(왼쪽 > · 오른쪽 ≥ · 동률을 옛 봉으로)와 동률만 다름 · 공용 약속은 안 바꿈(다른 지표 그대로)
function srzPiv(S, Lb, Rb, hi) { const N = S.length, o = new Float64Array(N).fill(NaN);
  for (let t = Lb + Rb; t < N; t++) { const c = t - Rb, p = S[c]; if (!fin(p)) continue; let k = 0, ok = true;
    for (let j = t; j >= 0 && k < Lb + Rb + 1; j--) { const v = S[j]; if (!fin(v)) continue; k++; if (j === c) continue; if (hi ? (v > p || (j > c && v === p)) : (v < p || (j > c && v === p))) { ok = false; break; } }
    if (ok) o[t] = p; } return o; }
function srzCalc(rows, p) { const { n, O, H, L, C, V } = cols(rows), pr = SRZ_PRE[p.preset];
  const pivLeft = pr ? pr[0] : p.pivLeft, pivRight = pr ? pr[1] : p.pivRight, clusterTol = pr ? pr[2] : p.clusterTol, minSpacing = pr ? pr[3] : p.minSpacing;
  const A = T.atr(H, L, C, 50), VM = T.sma(V, 50), RS = T.rsi(C, p.rsiLen), PH = srzPiv(H, pivLeft, pivRight, true), PL = srzPiv(L, pivLeft, pivRight, false);
  const hp = [], lp = [], broken = [], sigC = [], sigB = []; let res = [], sup = [];
  const safeV = i => { const v = V[i]; return (!fin(v) || v <= 0) ? 1.0 : v; };
  const weight = (pv, a, vAvg, t) => { const sv = (!fin(pv.vol) || pv.vol <= 0) ? 0.0 : pv.vol, sw = (!fin(pv.wick) || pv.wick < 0) ? 0.0 : pv.wick, age = Math.max(1, t - pv.bar), decay = 1.0 / (1.0 + age / 200.0);
    const vn = vAvg > 0 ? sv / vAvg : 1.0, wn = a > 0 ? sw / a : 0.0; return (1.0 + vn * 0.5 + wn * 0.5) * decay; };
  const build = (src, isRes, a, vAvg, t) => { const out = []; if (!(src.length >= p.minTouches && a > 0)) return out; const used = src.map(() => false), tol = a * clusterTol;
    for (let i = 0; i < src.length; i++) { if (used[i]) continue; const seed = src[i], mem = [seed]; used[i] = true;
      for (let j = i + 1; j < src.length; j++) { if (used[j]) continue; const c = src[j]; if (Math.abs(c.price - seed.price) <= tol) { let far = true; if (minSpacing > 0) for (let k = 0; k < mem.length; k++) if (Math.abs(c.bar - mem[k].bar) < minSpacing) { far = false; break; } if (far) { mem.push(c); used[j] = true; } } }
      if (mem.length >= p.minTouches) { let ps = 0.0, ws = 0.0, vs = 0.0, e0 = mem[0].bar, e1 = mem[0].bar;
        for (const m of mem) { const w = weight(m, a, vAvg, t); ps += m.price * w; ws += w; vs += fin(m.vol) ? m.vol : 0.0; e0 = Math.min(e0, m.bar); e1 = Math.max(e1, m.bar); }
        if (ws > 0) { const c = ps / ws, pad = a * 0.25; out.push({ top: c + pad, bot: c - pad, center: c, strength: ws, volSum: vs, touches: mem.length, firstBar: e0, lastTouch: e1, died: null, isRes, wasBroken: false }); } } }
    return out; };
  const trim = (zs, keep) => { const r = [], cp = zs.slice(), lim = Math.min(keep, cp.length); for (let i = 0; i < lim; i++) { let bi = 0, bv = cp[0].strength; for (let j = 1; j < cp.length; j++) if (cp[j].strength > bv) { bv = cp[j].strength; bi = j; } r.push(cp[bi]); cp.splice(bi, 1); } return r; };
  const archive = (z, a) => { let dup = false; const tol = a * clusterTol * 0.7; for (const ex of broken) if (ex.isRes === z.isRes && Math.abs(ex.center - z.center) <= tol) { dup = true; if (z.wasBroken && !ex.wasBroken) { ex.wasBroken = true; ex.died = z.died; } break; }
    if (!dup) { broken.push(z); if (broken.length > 60) broken.shift(); } };
  const survives = (old, ns, a) => { for (const z of ns) if (Math.abs(z.center - old.center) <= a * clusterTol) return true; return false; };
  const already = (z, a) => { for (const b of broken) if (b.isRes === z.isRes && b.wasBroken && Math.abs(b.center - z.center) <= a * clusterTol * 0.7) return true; return false; };
  const inherit = (nz, olds, a) => { for (const o of olds) if (Math.abs(o.center - nz.center) <= a * clusterTol) { nz.lastTouch = o.lastTouch; break; } return nz; };
  const rend = z => z.died == null && z.touches >= p.minTouches && fin(z.top) && fin(z.bot) && z.top > 0 && z.bot > 0 && z.bot < z.top;
  const cool = (c, a, t) => { for (let i = 0; i < sigC.length; i++) if (Math.abs(sigC[i] - c) <= a * clusterTol && t - sigB[i] < p.sigCooldown) return false; return true; };   // 원본 cooldownOk: 가까운 기록 중 쉼 안 지난 것이 하나라도 있으면 막음
  const rec = (c, t) => { sigC.push(c); sigB.push(t); if (sigC.length > 50) { sigC.shift(); sigB.shift(); } };
  const sh = { tu: new Uint8Array(n), td: new Uint8Array(n), ru: new Uint8Array(n), rd: new Uint8Array(n), hu: new Uint8Array(n), hd: new Uint8Array(n) }, brk = [];
  for (let t = 0; t < n; t++) { const a = A[t], ready = fin(a) && a > 0; let nH = false, nL = false;
    if (fin(PH[t]) && PH[t] > 0 && ready) { const c = t - pivRight; hp.push({ price: PH[t], bar: c, vol: safeV(c), wick: H[c] - Math.max(O[c], C[c]) }); if (hp.length > p.pivBuffer) hp.shift(); nH = true; }
    if (fin(PL[t]) && PL[t] > 0 && ready) { const c = t - pivRight; lp.push({ price: PL[t], bar: c, vol: safeV(c), wick: Math.min(O[c], C[c]) - L[c] }); if (lp.length > p.pivBuffer) lp.shift(); nL = true; }
    for (const z of res) if (z.died == null && C[t] > z.top + a * 0.3) { z.died = t; z.wasBroken = true; archive(z, a); }
    for (const z of sup) if (z.died == null && C[t] < z.bot - a * 0.3) { z.died = t; z.wasBroken = true; archive(z, a); }
    for (const z of res) if (z.died == null && H[t] >= z.bot && L[t] <= z.top) z.lastTouch = t;
    for (const z of sup) if (z.died == null && H[t] >= z.bot && L[t] <= z.top) z.lastTouch = t;
    if (nH || nL) { const nr = trim(build(hp, true, a, VM[t], t), p.zoneCount), ns = trim(build(lp, false, a, VM[t], t), p.zoneCount);
      for (const o of res) if (o.died == null && o.touches >= p.minTouches && !survives(o, nr, a)) { o.died = t; o.wasBroken = false; archive(o, a); }
      for (const o of sup) if (o.died == null && o.touches >= p.minTouches && !survives(o, ns, a)) { o.died = t; o.wasBroken = false; archive(o, a); }
      const orc = res.slice(), osc = sup.slice(); res = []; for (const z of nr) if (!already(z, a)) res.push(inherit(z, orc, a)); sup = []; for (const z of ns) if (!already(z, a)) sup.push(inherit(z, osc, a)); }
    let bu = false, bd = false, ru = false, rdn = false, rh = false, shd = false, bR = false, bS = false;
    for (const z of sup) if (rend(z)) { const pc = L[t] <= z.top && L[t] >= z.bot - a * 0.5, held = C[t] > z.bot && C[t] > O[t], rk = !p.useRsi || RS[t] <= p.rsiOversold; if (pc && held && rk && cool(z.center, a, t)) { rec(z.center, t); bu = true; break; } }
    for (const z of res) if (rend(z)) { const pc = H[t] >= z.bot && H[t] <= z.top + a * 0.5, held = C[t] < z.top && C[t] < O[t], rk = !p.useRsi || RS[t] >= p.rsiOverbought; if (pc && held && rk && cool(z.center, a, t)) { rec(z.center, t); bd = true; break; } }
    for (const z of broken) if (z.isRes && z.wasBroken && z.died != null) { const ag = t - z.died; if (ag > 0 && ag <= p.retestWindow && L[t] <= z.top && L[t] >= z.bot - a * 0.3 && C[t] > z.top && C[t] > O[t] && (!p.useRsi || RS[t] <= p.rsiOversold)) { ru = true; break; } }
    for (const z of broken) if (!z.isRes && z.wasBroken && z.died != null) { const ag = t - z.died; if (ag > 0 && ag <= p.retestWindow && H[t] >= z.bot && H[t] <= z.top + a * 0.3 && C[t] < z.bot && C[t] < O[t] && (!p.useRsi || RS[t] >= p.rsiOverbought)) { rdn = true; break; } }
    for (const z of res) if (rend(z) && H[t] >= z.bot && H[t] <= z.top + a * 0.3 && C[t] < z.top) { rh = true; break; }
    for (const z of sup) if (rend(z) && L[t] <= z.top && L[t] >= z.bot - a * 0.3 && C[t] > z.bot) { shd = true; break; }
    for (const z of res) if (z.died != null && z.died === t && z.touches >= p.minTouches) bR = true;
    for (const z of sup) if (z.died != null && z.died === t && z.touches >= p.minTouches) bS = true;
    sh.tu[t] = bu; sh.td[t] = bd; sh.ru[t] = ru; sh.rd[t] = rdn; sh.hu[t] = shd; sh.hd[t] = rh;
    if (bR) brk.push({ x: t, r: 1 }); if (bS) brk.push({ x: t, r: 0 }); }
  // ── 그림 값(마지막 봉 · 원본 barstate.islast) ──
  const li = n - 1, cl = C[li], alive = res.concat(sup).filter(z => z.died == null); let mx = 0.0, mv = 0.0; for (const z of alive) { mx = Math.max(mx, z.strength); mv = Math.max(mv, z.volSum); }
  const far = c => !(p.hideFar <= 0 || !(cl > 0)) && Math.abs(c - cl) / cl * 100.0 > p.hideFar, ok = z => fin(z.top) && fin(z.bot) && z.top > 0 && z.bot > 0 && z.bot < z.top && !far(z.center);
  const stars = s => { const r = mx > 0 ? s / mx : 0.0; return r >= 0.85 ? '★★★' : r >= 0.55 ? '★★' : '★'; };
  const f2 = v => { const r = Math.round(v * 100) / 100; return String(r); }, fmtV = v => v >= 1e9 ? f2(v / 1e9) + 'B' : v >= 1e6 ? f2(v / 1e6) + 'M' : v >= 1e3 ? f2(v / 1e3) + 'K' : f2(v);   // 원본 str.tostring(v, "#.##")
  const zones = [];
  for (const z of alive) { if (!fin(z.center) || !ok(z)) continue;
    const ag = li - z.lastTouch, extra = p.fadeAge <= 0 ? 0 : (ag <= 0 ? 0 : Math.min(15, Math.trunc(ag * 15.0 / p.fadeAge))), vb = (p.useVolColor && mv > 0) ? Math.trunc(Math.min(1.0, z.volSum / mv) * 35) : 0;
    let vt = ''; if (p.showVolText && mv > 0) vt = p.volFormat === 'Percentage' ? '  •  ' + Math.trunc((z.volSum / mv) * 100) + '%' : '  •  ' + fmtV(z.volSum);
    zones.push({ isRes: z.isRes, top: z.top, bot: z.bot, center: z.center, strength: z.strength, volSum: z.volSum, touches: z.touches, firstBar: z.firstBar, lastTouch: z.lastTouch,
      fillOp: Math.max(40, Math.min(95, p.zoneOpacity + extra - vb)), edgeOp: Math.min(95, 35 + extra - vb / 2), txt: stars(z.strength) + ' ' + z.touches + '×' + vt }); }
  const gone = broken.filter(z => ((z.wasBroken && p.showBroken) || (!z.wasBroken && p.showDropped)) && ok(z)).map(z => ({ isRes: z.isRes, wasBroken: z.wasBroken, top: z.top, bot: z.bot, center: z.center, firstBar: z.firstBar, end: z.died == null ? li : z.died }));
  return { n, H, L, zones, gone, sh, brk: brk.slice(-500), last: cl, pre: { pivLeft, pivRight, clusterTol, minSpacing } }; }
const SRZ_C = { res: [244, 67, 79], sup: [38, 166, 154], bb: [105, 140, 125], br: [165, 105, 110] };   // 원본 기본 색(저항 · 지지 · 깨진 지지 · 깨진 저항)
const srzRgba = (c, tr) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + ((100 - tr) / 100).toFixed(3) + ')';   // 파인 color.new(색, 투명 %)
TV.reg({
  id: 'srz', place: 'over', name: 'Support and Resistance Zones [FEELS]', short: 'S&R Zones', kname: '지지 · 저항 구역(S&R Zones)',
  author: 'FeelsStrategy', license: 'MIT', srcFile: 'Support and Resistance Zones [FEELS].txt',
  inputs: [
    { k: 'preset', nm: '세기 묶음', o: 'Strength preset', t: 'sel', d: 'Swing', opts: ['Local', 'Swing', 'Major', 'Custom'], optNm: { Local: '가까운(Local)', Swing: '스윙(Swing)', Major: '큰(Major)', Custom: '직접(Custom)' } },
    { k: 'pivLeft', nm: '왼쪽 봉(직접일 때)', o: 'Left bars', t: 'int', d: 15, min: 2, max: 100 },
    { k: 'pivRight', nm: '오른쪽 봉(직접일 때)', o: 'Right bars', t: 'int', d: 8, min: 2, max: 50 },
    { k: 'clusterTol', nm: '묶음 폭 × ATR(직접일 때)', o: 'Cluster tolerance (× ATR)', t: 'float', d: 0.9, min: 0.2, max: 3.0, step: 0.1 },
    { k: 'minSpacing', nm: '닿음 사이 최소 봉(직접일 때)', o: 'Minimum bars between touches', t: 'int', d: 20, min: 0, max: 200 },
    { k: 'pivBuffer', nm: '기억할 피벗 수', o: 'Pivot memory', t: 'int', d: 80, min: 20, max: 200 },
    { k: 'zoneCount', nm: '한쪽 구역 수', o: 'Active zones per side', t: 'int', d: 6, min: 1, max: 8 },
    { k: 'minTouches', nm: '최소 닿음', o: 'Minimum touches', t: 'int', d: 2, min: 2, max: 10 },
    { k: 'fadeAge', nm: '옅어짐 봉(0 = 끔)', o: 'Fade after (bars)', t: 'int', d: 120, min: 0, max: 500 },
    { k: 'hideFar', nm: '멀면 숨김 %(0 = 끔)', o: 'Hide zones farther than (%)', t: 'float', d: 60.0, min: 0, max: 200, step: 5 },
    { k: 'showBroken', nm: '깨진 구역 보이기', o: 'Show confirmed broken zones', t: 'bool', d: false },
    { k: 'showDropped', nm: '빠진 구역 보이기', o: 'Show dropped zones', t: 'bool', d: false },
    { k: 'brokenOp', nm: '깨진 구역 투명', o: 'Broken zone opacity', t: 'int', d: 85, min: 30, max: 95 },
    { k: 'showTest', nm: '시험 표시 ●', o: 'Show successful test markers', t: 'bool', d: false },
    { k: 'showRetest', nm: '되시험 표시 ◆', o: 'Show retest markers', t: 'bool', d: false },
    { k: 'showReaction', nm: '반응 표시 ◆ · Break 글자', o: 'Show zone reaction marks', t: 'bool', d: false },
    { k: 'useRsi', nm: '표시를 RSI 로 거름', o: 'Filter signals with RSI', t: 'bool', d: false },
    { k: 'rsiLen', nm: 'RSI 길이', o: 'RSI length', t: 'int', d: 14, min: 2, max: 50 },
    { k: 'rsiOversold', nm: 'RSI 과매도', o: 'RSI oversold', t: 'int', d: 35, min: 10, max: 49 },
    { k: 'rsiOverbought', nm: 'RSI 과매수', o: 'RSI overbought', t: 'int', d: 65, min: 51, max: 90 },
    { k: 'sigCooldown', nm: '시험 표시 쉼 봉', o: 'Cooldown bars', t: 'int', d: 20, min: 0, max: 100 },
    { k: 'retestWindow', nm: '되시험 창 봉', o: 'Retest window (bars)', t: 'int', d: 50, min: 5, max: 200 },
    { k: 'useVolColor', nm: '거래량으로 진하기', o: 'Color zones by volume', t: 'bool', d: true },
    { k: 'showLabels', nm: '세기 글자', o: 'Show zone strength label', t: 'bool', d: true },
    { k: 'showVolText', nm: '거래량 글자', o: 'Show volume score', t: 'bool', d: true },
    { k: 'volFormat', nm: '거래량 꼴', o: 'Volume format', t: 'sel', d: 'Absolute', opts: ['Absolute', 'Percentage'], optNm: { Absolute: '수(Absolute)', Percentage: '%(Percentage)' } },
    { k: 'zoneOpacity', nm: '구역 투명(거래량 적을 때)', o: 'Zone opacity (low volume)', t: 'int', d: 82, min: 60, max: 95 }
  ],
  legend: p => 'S&R Zones ' + p.preset,
  calc: srzCalc,
  range() { },   // 값은 안 넣음 — 원본 · TradingView 처럼 보이는 가격 범위 안 구역만 보임(밖 구역은 📖 읽기 한 줄의 거리로 · 사용자 23:38 '추천대로')
  noMargin: true,   // 글자가 오른쪽 끝 · 차트 안 — 위아래 7% 여유를 안 부름
  draw(ctx, R, G, p) { const RE = G.W - G.pad.r, L0 = G.pad.l, x = G.x, y = G.y, box = (x0, x1, z, fc, lc) => { const y0 = y(z.top), y1 = y(z.bot), yc = y(z.center);
      ctx.fillStyle = fc; ctx.fillRect(x0, y0, x1 - x0, Math.max(y1 - y0, 0.5)); ctx.strokeStyle = lc; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke(); ctx.setLineDash([]); };
    ctx.save();
    R.zones.forEach(z => { const col = z.isRes ? SRZ_C.res : SRZ_C.sup, x0 = Math.max(x(z.firstBar), L0); if (x0 < RE) box(x0, RE, z, srzRgba(col, z.fillOp), srzRgba(col, z.edgeOp)); });   // 산 구역 — 저항 다음 지지(원본 차례)
    R.gone.forEach(z => { const col = z.isRes ? SRZ_C.br : SRZ_C.bb, x0 = Math.max(x(z.firstBar), L0), x1 = Math.min(x(z.end), RE); if (x1 > x0) box(x0, x1, z, srzRgba(col, p.brokenOp), srzRgba(col, Math.min(90, p.brokenOp + 10))); });   // 깨진 · 빠진 구역(켰을 때만)
    if (p.showLabels) { const tx = []; R.zones.forEach(z => { const yc = y(z.center); if (yc >= G.pad.t && yc <= G.H - G.pad.b) tx.push({ y: yc, s: z.txt, c: z.isRes ? SRZ_C.res : SRZ_C.sup }); });   // 글자 = 오른쪽 끝(원본 label_left · 25봉 오른쪽 자리 대신) · 가운데가 차트 밖이면 안 씀
      tx.sort((a, b) => a.y - b.y); let ly = -1e9; ctx.font = '8.5px Outfit,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      tx.forEach(t => { const yy = Math.min(Math.max(t.y, ly + 11), G.H - 6); ly = yy; const w = ctx.measureText(t.s).width + 6;
        ctx.fillStyle = srzRgba(t.c, 75); ctx.fillRect(RE - 2 - w, yy - 5.5, w, 11); ctx.fillStyle = '#131722'; ctx.fillText(t.s, RE - 5, yy + 0.5); }); }
    const sh = R.sh, mk = (i, above, s, col, tr) => { const yy = above ? y(R.H[i]) - 6 : y(R.L[i]) + 6; ctx.fillStyle = srzRgba(col, tr); ctx.fillText(s, x(i), yy); };   // 원본 plotshape tiny · 봉 위(abovebar) · 아래(belowbar)
    ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = G.s; i < G.e; i++) { if (!fin(R.H[i]) || !fin(R.L[i])) continue;
      if (p.showTest && sh.tu[i]) mk(i, false, '●', SRZ_C.sup, 0); if (p.showTest && sh.td[i]) mk(i, true, '●', SRZ_C.res, 0);
      if (p.showRetest && sh.ru[i]) mk(i, false, '◆', SRZ_C.sup, 0); if (p.showRetest && sh.rd[i]) mk(i, true, '◆', SRZ_C.res, 0);
      if (p.showReaction && sh.hu[i]) mk(i, false, '◆', SRZ_C.sup, 30); if (p.showReaction && sh.hd[i]) mk(i, true, '◆', SRZ_C.res, 30); }
    ctx.restore();
    if (p.showReaction) R.brk.forEach(b => { if (b.x >= G.s && b.x < G.e) G.label(b.x, b.r ? 'Break R' : 'Break S', srzRgba(b.r ? SRZ_C.res : SRZ_C.sup, 25), !!b.r); }); }   // 원본 label.new(Break R · 고가 위 / Break S · 저가 아래)
});
if (typeof module !== 'undefined' && module.exports) module.exports = { srzCalc, SRZ_PRE };   // [S1962] 배터리 · 검산이 같은 셈을 부름
})();
