/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// sx_ict_flux.js — [S1847] 🎯 ICT 탭 🧪 실험 셋업 엔진(Turtle Soup · Unicorn · Judas 주간) · MPL 2.0 · [S1850] + Power Of Three
//   이 파일은 Flux Charts 의 TradingView Pine Script 세 개에서 옮겼다(원본 저작자 © fluxchart · 원본 라이선스 MPL 2.0):
//     "ICT Turtle Soup" · "ICT Unicorn" · "ICT Judas Swing". 그래서 이 파일도 MPL 2.0 이다(파일 단위 · sx_render.js 는 부르기만 함).
//   [S1850] 넷째 원본: Flux Charts "ICT Power Of Three"(© fluxchart · MPL 2.0) — 같은 저작자 · 같은 라이선스. SIGNAL X offline/fluxpv/src 에 원문을 둠.
//   바꾼 점(원본과 다름):
//     ① 파인 → 자바스크립트 · 화면 그림(상자 · 선 · 표)은 옮기지 않음 · 계산만.
//     ② 원본은 양쪽(매수 · 매도) 상태 기계다 — 기계는 양쪽 그대로 돌리고 **매수 진입만** 거래로 기록한다(매도 쪽 셋업이 기계를 잡고 있는 동안은 새 매수가 안 나옴).
//     ③ 미래 보기 고침(F1 ~ F5 · SIGNAL X offline/ictx2/tx_criteria.md): 봉 안 체결은 max(시가, 선) · 손절 · 목표는 진입 다음 봉부터(진입 봉은 체결 뒤 손절 · 목표만) ·
//        같은 봉에 손절 · 목표 둘 다면 손절 먼저 · 갭이면 시가 · Turtle Soup 손절 지표는 앞 봉 값.
//     ④ Judas 의 시계(뉴욕 개장 뒤 15분)는 달력 묶음으로 옮김: 일봉 = 주(월요일 시작) · 첫 2봉 / 4시간 = UTC 하루(한국 09:00 시작) · 첫 2봉 / 1시간 = 같은 하루 · 첫 6봉.
//        Turtle Soup 의 위 시간 틀(원본 기본 60분)은 일봉 7봉 · 4시간 6봉 · 1시간 4봉으로 옮김.
//     ⑤ 원본의 maxDistanceToLastBar(마지막 몇 천 봉만 계산)는 실행 시간 장치라 쓰지 않음.
//     ⑥ [S1850] Power Of Three 는 기본값만(Algorithm Mode "Small Manipulation" · 깸 = 꼬리 · TP/SL = Dynamic · 위험 Normal = 손절 5 × ATR50 · 목표 0.86R).
//        원본 '분배 대기'는 같은 봉에서 바로 진입으로 바뀌므로 조작 봉 종가에 진입 · 손절 · 목표는 다음 봉부터(③ 과 같은 체결) · 화면 그림 · 백테스트 표 · 알림은 옮기지 않음.
//   계산은 SIGNAL X offline/ictx2/meas_tx.js(측정 코드 · 2026-10-29)의 runTS · runUC · runJD 와 같다(verify_s1847 이 전 종목 대조).
//   성적 주장 없음 — 측정(offline/ictx2/tx_result.md)에서 자리 제안 규칙(무작위 · 그냥 두기 둘 다 넘음) 통과 0.
//   [S1850] PO3 계산은 SIGNAL X offline/fluxpv/meas_pv.js(측정 코드 · 2026-10-31)의 po3Run(P3) 와 같다(verify_s1850 이 전 종목 대조).
//     측정(offline/fluxpv/pv_result.md)에서 KR · US 일봉만 자리 제안 규칙을 넘었다(차이 작음 · 다른 모드 못 넘음 · 코인 · 시간봉 기각) — 앱은 KR · US 일봉에서만 부른다 · 성적 주장 없음.
(function (G) {
  'use strict';
  var fin = Number.isFinite;
  // ── 파인 기본 함수(NaN = na · 첫 값 = 첫 n개 평균) ──
  function smaAt(src, n, t) { if (t < n - 1) return NaN; var s = 0; for (var j = t - n + 1; j <= t; j++) { var v = src[j]; if (!fin(v)) return NaN; s += v; } return s / n; }
  function rma(src, n) { var o = new Float64Array(src.length), al = 1 / n; for (var t = 0; t < src.length; t++) { var p = t > 0 ? o[t - 1] : NaN; o[t] = !fin(p) ? smaAt(src, n, t) : al * src[t] + (1 - al) * p; } return o; }
  function trS(H, L, C) { var N = C.length, tr = new Float64Array(N); for (var t = 0; t < N; t++) tr[t] = t === 0 ? H[t] - L[t] : Math.max(Math.max(H[t] - L[t], Math.abs(H[t] - C[t - 1])), Math.abs(L[t] - C[t - 1])); return tr; }
  function atr(H, L, C, n) { return rma(trS(H, L, C), n); }
  function highest(src, n) { var N = src.length, o = new Float64Array(N); for (var t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } var m = -Infinity; for (var j = t - n + 1; j <= t; j++) if (src[j] > m) m = src[j]; o[t] = m; } return o; }
  function lowest(src, n) { var N = src.length, o = new Float64Array(N); for (var t = 0; t < N; t++) { if (t < n - 1) { o[t] = NaN; continue; } var m = Infinity; for (var j = t - n + 1; j <= t; j++) if (src[j] < m) m = src[j]; o[t] = m; } return o; }
  function pivotHigh(H, Lb, Rb) { var N = H.length, o = new Float64Array(N).fill(NaN); for (var t = Lb + Rb; t < N; t++) { var c = t - Rb, v = H[c], ok = true; for (var j = c - Lb; j < c && ok; j++) if (!(v > H[j])) ok = false; for (j = c + 1; j <= t && ok; j++) if (!(v >= H[j])) ok = false; if (ok) o[t] = v; } return o; }
  function pivotLow(L, Lb, Rb) { var N = L.length, o = new Float64Array(N).fill(NaN); for (var t = Lb + Rb; t < N; t++) { var c = t - Rb, v = L[c], ok = true; for (var j = c - Lb; j < c && ok; j++) if (!(v < L[j])) ok = false; for (j = c + 1; j <= t && ok; j++) if (!(v <= L[j])) ok = false; if (ok) o[t] = v; } return o; }
  // ── 묶음(Judas 세션) ──
  function dayNumDaily(d) { if (/^\d{8}$/.test(d)) return Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 864e5); return Math.floor(Date.parse(d.slice(0, 10) + 'T00:00:00Z') / 864e5); }
  function msKST(d) { return Date.parse(d.slice(0, 19) + 'Z') - 9 * 3600e3; }
  function periodsOf(B, tf) { var n = B.C.length, pid = new Float64Array(n), pos = new Int32Array(n);
    for (var t = 0; t < n; t++) { var d = B.D[t]; pid[t] = tf === 'd' ? Math.floor((dayNumDaily(d) + 3) / 7) : Math.floor(msKST(d) / 864e5); pos[t] = t > 0 && pid[t] === pid[t - 1] ? pos[t - 1] + 1 : 0; }
    return { pid: pid, pos: pos }; }
  // ── 청산(봉 안 · 손절 먼저 · 갭이면 시가) ──
  function exL(B, t, sl, tp) { if (B.L[t] <= sl) return { px: Math.min(B.O[t], sl), why: 'sl' }; if (B.H[t] >= tp) return { px: Math.max(B.O[t], tp), why: 'tp' }; return null; }
  function exS(B, t, sl, tp) { if (B.H[t] >= sl) return { px: Math.max(B.O[t], sl), why: 'sl' }; if (B.L[t] <= tp) return { px: Math.min(B.O[t], tp), why: 'tp' }; return null; }
  function ind(B) { var Hh = B.H, L = B.L, C = B.C; return { A5: atr(Hh, L, C, 5), A10: atr(Hh, L, C, 10), A50: atr(Hh, L, C, 50), HH10: highest(Hh, 10), LL10: lowest(L, 10), HH100: highest(Hh, 100), LL100: lowest(L, 100) }; }
  // ── Flux FVG 장치(Unicorn · Judas) ──
  function fvgMachine(B, A10) { var O = B.O, Hh = B.H, L = B.L, C = B.C, list = [];
    return { list: list, step: function (t) { var formed = null;
      if (t >= 2) { var same = (O[t] > C[t] && O[t - 1] > C[t - 1] && O[t - 2] > C[t - 2]) || (O[t] <= C[t] && O[t - 1] <= C[t - 1] && O[t - 2] <= C[t - 2]), cond = false;
        if (same) { var bs = Math.abs(C[t] - O[t]) + Math.abs(C[t - 1] - O[t - 1]) + Math.abs(C[t - 2] - O[t - 2]), mco = Math.max(Math.abs(C[t - 2] - O[t - 1]), Math.abs(C[t - 1] - O[t])); cond = (bs * 1.5 > A10[t] / 1.5) && (mco <= A10[t]); }
        var bear = Hh[t] < L[t - 2] && C[t - 1] < L[t - 2] && cond, bull = L[t] > Hh[t - 2] && C[t - 1] > Hh[t - 2] && cond;
        var size = bear ? Math.abs(L[t - 2] - Hh[t]) : bull ? Math.abs(L[t] - Hh[t - 2]) : 0;
        if (size * 1.5 > A10[t] && (bear || bull)) { list.unshift(bear ? { max: L[t - 2], min: Hh[t], bull: false, start: t, touched: t, inv: false } : { max: L[t], min: Hh[t - 2], bull: true, start: t, touched: t, inv: false }); if (list.length > 20) list.pop(); formed = bear ? 'bear' : 'bull'; } }
      for (var a = 0; a < list.length; a++) { var f = list[a]; if ((f.bull && L[t] <= f.max) || (!f.bull && Hh[t] >= f.min)) f.touched = t; if (!f.inv) { if (f.bull && C[t] < f.min) f.inv = true; if (!f.bull && C[t] > f.max) f.inv = true; } }
      for (var i = list.length - 1; i >= 0; i--) { var g = list[i]; if (g.inv || (t - g.touched) > 200) list.splice(i, 1); }
      return formed; } }; }
  // ── 오더블록 · 브레이커 장치(Unicorn) ──
  function obMachine(B, A10) { var O = B.O, Hh = B.H, L = B.L, C = B.C, HH = highest(Hh, 10), LLw = lowest(L, 10), bullL = [], bearL = [], st = 0, top = { x: NaN, y: NaN, crossed: false }, btm = { x: NaN, y: NaN, crossed: false };
    return { bullL: bullL, bearL: bearL, step: function (t) { var prev = st; if (t >= 10) { if (Hh[t - 10] > HH[t]) st = 0; else if (L[t - 10] < LLw[t]) st = 1; }
        if (st === 0 && prev !== 0) { top.x = t - 10; top.y = Hh[t - 10]; top.crossed = false; } if (st === 1 && prev !== 1) { btm.x = t - 10; btm.y = L[t - 10]; btm.crossed = false; }
        var bBtm = NaN, bTop = NaN, bLoc = NaN, sTop = NaN, sBtm = NaN, sLoc = NaN, N, i, ob;
        if (t >= 1) { bBtm = Hh[t - 1]; bTop = L[t - 1]; bLoc = t - 1; if (fin(top.x)) { N = t - top.x; for (i = 1; i <= N - 1; i++) { bBtm = Math.min(L[t - i], bBtm); if (bBtm === L[t - i]) { bTop = Hh[t - i]; bLoc = t - i; } } }
          sBtm = L[t - 1]; sTop = Hh[t - 1]; sLoc = t - 1; if (fin(btm.x)) { N = t - btm.x; for (i = 1; i <= N - 1; i++) { sTop = Math.max(Hh[t - i], sTop); if (sTop === Hh[t - i]) { sBtm = L[t - i]; sLoc = t - i; } } } }
        for (i = bullL.length - 1; i >= 0; i--) { ob = bullL[i]; if (!ob.brk) { if (Math.min(O[t], C[t]) < ob.bottom) { ob.brk = true; ob.brkBar = t; } } else if (C[t] > ob.top) bullL.splice(i, 1); }
        if (C[t] > top.y && !top.crossed) { top.crossed = true; ob = { top: bTop, bottom: bBtm, type: 'Bull', start: bLoc, brk: false, brkBar: NaN }; if (Math.abs(ob.top - ob.bottom) <= A10[t] * 3.5) { bullL.unshift(ob); if (bullL.length > 40) bullL.pop(); } }
        for (i = bearL.length - 1; i >= 0; i--) { ob = bearL[i]; if (!ob.brk) { if (Math.max(O[t], C[t]) > ob.top) { ob.brk = true; ob.brkBar = t; } } else if (C[t] < ob.bottom) bearL.splice(i, 1); }
        if (C[t] < btm.y && !btm.crossed) { btm.crossed = true; ob = { top: sTop, bottom: sBtm, type: 'Bear', start: sLoc, brk: false, brkBar: NaN }; if (Math.abs(ob.top - ob.bottom) <= A10[t] * 3.5) { bearL.unshift(ob); if (bearL.length > 40) bearL.pop(); } }
      }, all: function () { return bullL.slice(0, 20).concat(bearL.slice(0, 20)); } }; }
  function newRec() { return { trades: [], nSet: 0, nShort: 0, open: null, xShort: false }; }
  function finish(R, pos) { if (pos && pos.long) R.open = { e: pos.e, i: pos.i, sl: pos.sl, tp: pos.tp }; R.xShort = !!(pos && !pos.long); return R; }
  // ── Turtle Soup ──
  function runTS(B, I, bl) { var n = B.C.length, HHb = highest(B.H, bl), LLb = lowest(B.L, bl), R = newRec(), t0 = Math.max(10, bl - 1), ts = null, pos = null, x;
    for (var t = t0; t < n; t++) {
      if (pos && pos.long && t > pos.i) { x = exL(B, t, pos.sl, pos.tp); if (x) { R.trades.push({ e: pos.e, i: pos.i, x: x.px, xi: t, why: x.why, sl: pos.sl, tp: pos.tp }); pos = null; ts.done = true; ts.db = t; } }
      if (pos && !pos.long && t > pos.i) { x = exS(B, t, pos.sl, pos.tp); if (x) { pos = null; ts.done = true; ts.db = t; } }
      if (!ts || (ts.done && t > ts.db)) ts = { st: 'wait', hi: HHb[t], lo: LLb[t], start: t, done: false, db: -1 };
      if (ts.st === 'wait' && t > ts.start) { if (B.L[t] < ts.lo) { ts.st = 'exec'; ts.dir = 1; ts.brk = t; } else if (B.H[t] > ts.hi) { ts.st = 'exec'; ts.dir = -1; ts.brk = t; } }
      if (ts.st === 'exec' && t > ts.brk) {
        var lvl, fill, sl, tp;
        if (ts.dir === 1 && B.H[t] > I.HH10[t - 1]) { lvl = I.HH10[t - 1]; fill = Math.max(B.O[t], lvl); sl = I.LL10[t - 1] - 3.5 * I.A5[t - 1]; tp = fill + 0.9 * Math.abs(fill - sl); ts.st = 'taken';
          pos = { long: true, e: fill, i: t, sl: sl, tp: tp }; R.nSet++;
          x = B.L[t] <= sl ? { px: Math.min(B.O[t], sl), why: 'sl' } : (B.H[t] >= tp ? { px: Math.max(B.O[t], tp), why: 'tp' } : null);
          if (x) { R.trades.push({ e: fill, i: t, x: x.px, xi: t, why: x.why + '0', sl: sl, tp: tp }); pos = null; ts.done = true; ts.db = t; } }
        else if (ts.dir === -1 && B.L[t] < I.LL10[t - 1]) { lvl = I.LL10[t - 1]; fill = Math.min(B.O[t], lvl); sl = I.HH10[t - 1] + 3.5 * I.A5[t - 1]; tp = fill - 0.9 * Math.abs(fill - sl); ts.st = 'taken'; R.nShort++;
          pos = { long: false, e: fill, i: t, sl: sl, tp: tp };
          x = B.H[t] >= sl ? { px: sl, why: 'sl' } : (B.L[t] <= tp ? { px: tp, why: 'tp' } : null); if (x) { pos = null; ts.done = true; ts.db = t; } } }
    }
    R.t0 = t0; return finish(R, pos); }
  // ── Unicorn ──
  function runUC(B, I) { var n = B.C.length, R = newRec(), FM = fvgMachine(B, I.A10), OM = obMachine(B, I.A10), t0 = 100, uc = null, pos = null, x;
    for (var t = 0; t < n; t++) { OM.step(t); FM.step(t); if (t < t0) continue;
      if (pos && t > pos.i) { x = pos.long ? exL(B, t, pos.sl, pos.tp) : exS(B, t, pos.sl, pos.tp); if (x) { if (pos.long) R.trades.push({ e: pos.e, i: pos.i, x: x.px, xi: t, why: x.why, sl: pos.sl, tp: pos.tp }); pos = null; uc.done = true; uc.db = t; } }
      if (!uc || (uc.done && t > uc.db)) uc = { st: 'wait', done: false, db: -1 };
      if (uc.st === 'wait') { var F = FM.list, OB = OM.all(); for (var i = 0; i < F.length; i++) { var f = F[i]; for (var j = 0; j < OB.length; j++) { var ob = OB[j]; if (!ob.brk) continue; if (!((ob.type === 'Bear' && f.bull) || (ob.type === 'Bull' && !f.bull))) continue;
            var yov = Math.min(ob.top, f.max) - Math.max(ob.bottom, f.min); if (yov > 0 && (t === f.start || t === ob.brkBar)) { uc.st = 'ovl'; uc.dir = f.bull ? 1 : -1; } } } }
      if (uc.st === 'ovl') { uc.st = 'enter'; uc.eb = t; }
      if (uc.st === 'enter' && t >= uc.eb + 1) { var e = B.C[t], sl, tp; uc.st = 'taken';
        if (uc.dir === 1) { sl = I.LL100[t] - I.A50[t] * 4.75; tp = e + Math.abs(e - sl) * 0.57; pos = { long: true, e: e, i: t, sl: sl, tp: tp }; R.nSet++; }
        else { sl = I.HH100[t] + I.A50[t] * 4.75; tp = e - Math.abs(e - sl) * 0.57; pos = { long: false, e: e, i: t, sl: sl, tp: tp }; R.nShort++; } }
    }
    R.t0 = t0; return finish(R, pos); }
  // ── Judas(달력 묶음으로 옮긴 판) ──
  function runJD(B, I, P, k) { var n = B.C.length, R = newRec(), FM = fvgMachine(B, I.A10), PH = pivotHigh(B.H, 3, 3), PL = pivotLow(B.L, 3, 3), t0 = 50, hiLiq = 0, loLiq = 0, jd = null, pos = null, x;
    function newS(t) { return P.pos[t] === 0; } function ended(t) { return P.pos[t] === k || (P.pos[t] === 0 && t > 0 && P.pos[t - 1] < k); }
    for (var t = 0; t < n; t++) { var formed = FM.step(t); if (fin(PL[t])) loLiq = PL[t]; if (fin(PH[t])) hiLiq = PH[t]; if (t < t0) continue;
      if (pos && t > pos.i) { x = pos.long ? exL(B, t, pos.sl, pos.tp) : exS(B, t, pos.sl, pos.tp); if (x) { if (pos.long) R.trades.push({ e: pos.e, i: pos.i, x: x.px, xi: t, why: x.why, sl: pos.sl, tp: pos.tp }); pos = null; jd.done = true; jd.db = t; } }
      if (!jd || (jd.done && t > jd.db) || jd.st === 'abort') jd = { st: 'open', done: false, db: -1 };
      if (jd.st === 'open' && newS(t)) { jd.st = 'brk'; jd.hi = hiLiq; jd.lo = loLiq; }
      if (jd.st === 'brk') { if (B.C[t] > jd.hi && B.C[t - 1] <= jd.hi) { jd.st = 'fvg'; jd.dir = -1; } else if (B.C[t] < jd.lo && B.C[t - 1] >= jd.lo) { jd.st = 'fvg'; jd.dir = 1; } if (ended(t)) jd.st = 'abort'; }
      if (jd.st === 'fvg') { if ((jd.dir === -1 && formed === 'bear') || (jd.dir === 1 && formed === 'bull')) jd.st = 'enter'; }
      if (jd.st === 'enter') { var e = B.C[t], sl, tp; jd.st = 'taken';
        if (jd.dir === 1) { sl = e - I.A50[t] * 6.5; tp = e + Math.abs(e - sl) * 0.47; pos = { long: true, e: e, i: t, sl: sl, tp: tp }; R.nSet++; }
        else { sl = e + I.A50[t] * 6.5; tp = e - Math.abs(e - sl) * 0.47; pos = { long: false, e: e, i: t, sl: sl, tp: tp }; R.nShort++; } }
    }
    R.t0 = t0; return finish(R, pos); }
  // ── [S1850] ICT Power Of Three(기본값 Small Manipulation · 꼬리 깸 · Dynamic Normal) — 매집(40봉 폭 ≤ 5 × ATR50) → 박스 깸 → 조작(박스 밖 0.6 × ATR50 더) 봉 종가에 반대로 ──
  function runPO3(B, I) { var n = B.C.length, A = I.A50, HH = highest(B.H, 40), LL = lowest(B.L, 40), R = newRec(), t0 = 49, cur = null, x, e, sl, tp;
    for (var t = t0; t < n; t++) {
      if (!cur || cur.done) cur = { st: 'WA', done: false };
      if (cur.st === 'WA') { if (HH[t] - LL[t] <= A[t] * 5) { cur.st = 'WAE'; cur.top = HH[t] + A[t] * 0.5; cur.bot = LL[t] - A[t] * 0.5; cur.aEnd = t; } }
      if (cur.st === 'WAE') { if (B.H[t] > cur.top || B.L[t] < cur.bot) cur.st = 'WM'; else cur.aEnd = t; }
      if (cur.st === 'WM') { if (t > cur.aEnd) { if (B.H[t] > cur.top + A[t] * 0.6) { cur.st = 'WD'; cur.long = false; } else if (B.L[t] < cur.bot - A[t] * 0.6) { cur.st = 'WD'; cur.long = true; } } }
      if (cur.st === 'WD') { cur.st = 'ET'; e = B.C[t]; cur.e = e; cur.i = t;
        if (cur.long) { sl = e - A[t] * 5; tp = e + Math.abs(e - sl) * 0.86; R.nSet++; } else { sl = e + A[t] * 5; tp = e - Math.abs(e - sl) * 0.86; R.nShort++; }
        cur.sl = sl; cur.tp = tp; }
      if (cur.st === 'ET' && t > cur.i) { x = cur.long ? exL(B, t, cur.sl, cur.tp) : exS(B, t, cur.sl, cur.tp);
        if (x) { if (cur.long) R.trades.push({ e: cur.e, i: cur.i, x: x.px, xi: t, why: x.why, sl: cur.sl, tp: cur.tp }); cur.st = 'DONE'; cur.done = true; } }
    }
    R.t0 = t0; return finish(R, (cur && cur.st === 'ET') ? { long: cur.long, e: cur.e, i: cur.i, sl: cur.sl, tp: cur.tp } : null); }
  // ── 들어가는 곳 ──
  var BL = { d: 7, h4: 6, h1: 4 }, KJ = { d: 2, h4: 2, h1: 6 };
  function run(kind, rows, tf) {
    if (!BL[tf] || !Array.isArray(rows)) return null; var n = rows.length, num = function (v) { v = +v; return fin(v) ? v : NaN; }, B = { O: new Array(n), H: new Array(n), L: new Array(n), C: new Array(n), D: new Array(n) };
    for (var i = 0; i < n; i++) { var r = rows[i] || {}; B.O[i] = num(r.open != null ? r.open : r.o); B.H[i] = num(r.high != null ? r.high : r.h); B.L[i] = num(r.low != null ? r.low : r.l); B.C[i] = num(r.close != null ? r.close : r.c); B.D[i] = String(r.date != null ? r.date : (r.t != null ? r.t : '')); }
    var I = ind(B);
    if (kind === 'ts') return runTS(B, I, BL[tf]);
    if (kind === 'uc') return runUC(B, I);
    if (kind === 'jdw') return runJD(B, I, periodsOf(B, tf), KJ[tf]);
    if (kind === 'po3') return runPO3(B, I);   // [S1850]
    return null; }
  G.SXIctFlux = { ver: 2 /* [S1850] PO3 있음 */, run: run };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
