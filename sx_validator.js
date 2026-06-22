//  sx_validator.js — [S704] 범용 검증기 (SXUV)  ·  [S706] 배리어 자(익절/손절) 추가
//  ────────────────────────────────────────────────────────────────────────
//  목적: "신호가 진짜 예측력이 있나(정밀/재현/리프트)"를 재는 자(尺)를 범용화.
//  지금까지 카드마다 따로 박혀있던 측정 로직(_mxRunStats 등)을 하나의 엔진으로 추출.
//
//  구조:
//    · 자(RULER)      = 무엇을 예측하나 + 실제 언제 발생했나  { type, eligible(t), occurred(t) }
//    · 신호(PREDICTOR) = 추측성 신호 하나                      { fire(t) }  (룩어헤드 안전: rows[≤t]만)
//    · 엔진 run()      = 신호 × 자 → 정밀/재현/리프트/리드 + 합격/불합격
//
//  워크포워드 안전: 신호는 시점 t의 rows[≤t]만 사용. 타깃은 t+1..t+N(미래)에서만 평가.
//  설계: _mxRunStats(MA크로스 전이)를 이 엔진의 'cross' 프리셋으로 정확히 재현(리그레션).
//  ────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ===== 지표 헬퍼 (자족 — _trSma/_mxObv/_mxEma/_mxRsi와 동일 공식) =====
  function _sma(a, p) { var o = new Array(a.length).fill(null), s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; }
  function _ema(a, p) { var o = new Array(a.length).fill(null), k = 2 / (p + 1), prev = null; for (var i = 0; i < a.length; i++) { var v = a[i]; if (v == null) { o[i] = prev; continue; } prev = (prev == null) ? v : (v * k + prev * (1 - k)); o[i] = prev; } return o; }
  function _rsi(c, p) { var o = new Array(c.length).fill(null), ag = 0, al = 0; for (var i = 1; i < c.length; i++) { var ch = c[i] - c[i - 1], g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0; if (i <= p) { ag += g; al += l; if (i === p) { ag /= p; al /= p; o[i] = (al === 0) ? 100 : (100 - 100 / (1 + ag / al)); } } else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; o[i] = (al === 0) ? 100 : (100 - 100 / (1 + ag / al)); } } return o; }
  function _obv(c, v) { var o = new Array(c.length).fill(null), acc = 0; o[0] = 0; for (var i = 1; i < c.length; i++) { if (c[i] > c[i - 1]) acc += v[i]; else if (c[i] < c[i - 1]) acc -= v[i]; o[i] = acc; } return o; }
  function _g(x) { return x != null; }   // not-null 가드

  // ===== 컨텍스트 빌더 — 종목당 1회 지표 계산 =====
  // ⚠️ 순수수학형 지표만(평탄화 함정 회피). 엔진결합형(점수 텍스트노트)은 후속 단계에서 별도 어댑터로.
  function buildContext(rows, opt) {
    opt = opt || {};
    var s = opt.s || 5, l = opt.l || 9;
    var close = rows.map(function (r) { return (r && r.close != null) ? r.close : (r && r.c != null ? r.c : 0); });
    var vol = rows.map(function (r) { return (r && r.volume != null) ? r.volume : (r && r.v != null ? r.v : 0); });
    // [S706] 고가/저가 — 배리어 자(익절/손절) 인트라바 터치용. 없으면 종가 폴백(터치 의미만 약화).
    var high = rows.map(function (r) { return (r && r.high != null) ? r.high : (r && r.h != null ? r.h : (r && r.close != null ? r.close : (r && r.c != null ? r.c : 0))); });
    var low = rows.map(function (r) { return (r && r.low != null) ? r.low : (r && r.l != null ? r.l : (r && r.close != null ? r.close : (r && r.c != null ? r.c : 0))); });
    var maS = _sma(close, s), maL = _sma(close, l);
    var obv = _obv(close, vol), obvSig = _sma(obv, 14);
    var e12 = _ema(close, 12), e26 = _ema(close, 26);
    var macdLine = close.map(function (_, i) { return (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null; });
    var macdSig = _ema(macdLine, 9);
    var macdHist = close.map(function (_, i) { return (macdLine[i] != null && macdSig[i] != null) ? macdLine[i] - macdSig[i] : null; });
    var rsi = _rsi(close, 14), rsiSig = _ema(rsi, 9);
    return { rows: rows, n: rows.length, s: s, l: l, close: close, vol: vol, high: high, low: low, maS: maS, maL: maL, obv: obv, obvSig: obvSig, macdHist: macdHist, rsi: rsi, rsiSig: rsiSig };
  }

  // ===== 자(RULER) 레지스트리 =====
  //  각 자: { id, label, type:'event'|'return', warm(ctx,p), eligible(ctx,t,p), occurred(ctx,t,p) }
  //    occurred 반환: event형 → 발생까지 봉수(>0=발생, 0=미발생) · return형 → 1/0
  var RULERS = {
    // ── MA 크로스 (MA크로스 전이 재현) — dir 'gc'/'dc' ──
    cross: {
      id: 'cross', label: 'MA 크로스', type: 'event', polarity: 'dir',
      warm: function (ctx) { return ctx.l + 1; },
      eligible: function (ctx, t, p) {
        var d = p.dir || 'gc';
        if (!(_g(ctx.maS[t]) && _g(ctx.maL[t]) && _g(ctx.maS[t - 1]) && _g(ctx.maL[t - 1]))) return false;
        return (d === 'gc') ? (ctx.maS[t] <= ctx.maL[t]) : (ctx.maS[t] >= ctx.maL[t]);
      },
      occurred: function (ctx, t, p) {
        var d = p.dir || 'gc', N = p.N || 3;
        for (var j = t + 1; j <= t + N; j++) {
          if (j < 1 || j >= ctx.n) break;
          if (!(_g(ctx.maS[j]) && _g(ctx.maL[j]) && _g(ctx.maS[j - 1]) && _g(ctx.maL[j - 1]))) continue;
          var gc = ctx.maS[j] > ctx.maL[j] && ctx.maS[j - 1] <= ctx.maL[j - 1];
          var dc = ctx.maS[j] < ctx.maL[j] && ctx.maS[j - 1] >= ctx.maL[j - 1];
          if ((d === 'gc' && gc) || (d === 'dc' && dc)) return j - t;
        }
        return 0;
      }
    },
    // ── 미래 상승 — 향후 N봉 고점수익 ≥ thr% (상승 예측자용 · polarity bull) ──
    upmove: {
      id: 'upmove', label: '미래 상승', type: 'return', polarity: 'bull',
      warm: function (ctx) { return ctx.l + 1; },
      eligible: function (ctx, t) { return ctx.close[t] > 0; },
      occurred: function (ctx, t, p) {
        var N = p.N || 5, thr = (p.thr != null ? p.thr : 3) / 100, base = ctx.close[t], pk = base;
        for (var j = t + 1; j <= t + N && j < ctx.n; j++) { if (ctx.close[j] > pk) pk = ctx.close[j]; }
        return (base > 0 && (pk / base - 1) >= thr) ? 1 : 0;
      }
    },
    // ── 미래 하락(MDD) — 향후 N봉 저점낙폭 ≥ thr% (안전필터/경고 예측자용 · polarity bear) ──
    drawdown: {
      id: 'drawdown', label: '미래 하락', type: 'return', polarity: 'bear',
      warm: function (ctx) { return ctx.l + 1; },
      eligible: function (ctx, t) { return ctx.close[t] > 0; },
      occurred: function (ctx, t, p) {
        var N = p.N || 5, thr = (p.thr != null ? p.thr : 3) / 100, base = ctx.close[t], tr = base;
        for (var j = t + 1; j <= t + N && j < ctx.n; j++) { if (ctx.close[j] < tr) tr = ctx.close[j]; }
        return (base > 0 && (1 - tr / base) >= thr) ? 1 : 0;
      }
    },
    // ── [S705-3] 고점되돌림 — 진입 후 고점 대비 thr% 되돌림(트레일링/진짜 MDD) ──
    peakdraw: {
      id: 'peakdraw', label: '고점되돌림', type: 'return', polarity: 'bear',
      warm: function (ctx) { return ctx.l + 1; },
      eligible: function (ctx, t) { return ctx.close[t] > 0; },
      occurred: function (ctx, t, p) {
        var N = p.N || 5, thr = (p.thr != null ? p.thr : 3) / 100, base = ctx.close[t], pk = base;
        for (var j = t + 1; j <= t + N && j < ctx.n; j++) { if (ctx.close[j] > pk) pk = ctx.close[j]; if (pk > 0 && (1 - ctx.close[j] / pk) >= thr) return 1; }
        return 0;
      }
    },
    // ── [S706] 배리어(익절/손절) — 진입 close[t] 기준 +익절% 먼저 닿나 vs −손절% 먼저 닿나(인트라바 고가/저가 터치). ──
    //  매수(롱) 전용(polarity bull). occurred=1(익절 먼저=승)·0(손절 먼저/타임아웃=패). 동봉 양쪽 터치=비관(손절 먼저로 간주).
    //  opt.tp(익절%)·opt.sl(손절%). 가장 매매다운 성패 — 종가기반 자(상승/하락)와 다른 방법론(의도적).
    barrier: {
      id: 'barrier', label: '익절/손절', type: 'return', polarity: 'bull',
      warm: function (ctx) { return ctx.l + 1; },
      eligible: function (ctx, t) { return ctx.close[t] > 0; },
      occurred: function (ctx, t, p) {
        var N = p.N || 5;
        var tp = (p.tp != null ? p.tp : 5) / 100;
        var sl = (p.sl != null ? p.sl : 3) / 100;
        var base = ctx.close[t]; if (!(base > 0)) return 0;
        var up = base * (1 + tp), dn = base * (1 - sl);
        for (var j = t + 1; j <= t + N && j < ctx.n; j++) {
          var hi = (ctx.high[j] != null ? ctx.high[j] : ctx.close[j]);
          var lo = (ctx.low[j] != null ? ctx.low[j] : ctx.close[j]);
          var hitUp = hi >= up, hitDn = lo <= dn;
          if (hitUp && hitDn) return 0;   // 동봉 양쪽 → 비관(손절 먼저)
          if (hitUp) return 1;            // 익절 먼저 = 승
          if (hitDn) return 0;            // 손절 먼저 = 패
        }
        return 0;   // 타임아웃(만기까지 둘 다 미달) = 미적중
      }
    }
  };

  // ===== 신호(PREDICTOR) 레지스트리 =====
  //  각 신호: { id, label, fire(ctx,t,p) }  — p.dir: 'gc'(강세) / 'dc'(약세)로 방향 반전
  //  fire는 반드시 rows[≤t]만 참조(룩어헤드 금지). 상태형(state)과 전환형(turn) 구분.
  var PREDICTORS = {
    slope: {
      id: 'slope', label: '단기선 기울기(상태)',
      fire: function (c, t, p) { return _g(c.maS[t]) && _g(c.maS[t - 1]) && ((p.dir === 'dc') ? (c.maS[t] < c.maS[t - 1]) : (c.maS[t] > c.maS[t - 1])); }
    },
    slopeTurn: {
      id: 'slopeTurn', label: '단기선 기울기(전환)',
      fire: function (c, t, p) {
        if (!(_g(c.maS[t]) && _g(c.maS[t - 1]) && _g(c.maS[t - 2]))) return false;
        return (p.dir === 'dc') ? (c.maS[t] < c.maS[t - 1] && c.maS[t - 1] >= c.maS[t - 2]) : (c.maS[t] > c.maS[t - 1] && c.maS[t - 1] <= c.maS[t - 2]);
      }
    },
    rsiGc: {
      id: 'rsiGc', label: 'RSI vs 시그널',
      fire: function (c, t, p) { return _g(c.rsi[t]) && _g(c.rsiSig[t]) && ((p.dir === 'dc') ? (c.rsi[t] < c.rsiSig[t]) : (c.rsi[t] > c.rsiSig[t])); }
    },
    obv: {
      id: 'obv', label: 'OBV 방향',
      fire: function (c, t, p) { return _g(c.obv[t]) && _g(c.obv[t - 1]) && ((p.dir === 'dc') ? (c.obv[t] < c.obv[t - 1]) : (c.obv[t] > c.obv[t - 1])); }
    },
    macd: {
      id: 'macd', label: 'MACD 히스토 방향',
      fire: function (c, t, p) { return _g(c.macdHist[t]) && _g(c.macdHist[t - 1]) && ((p.dir === 'dc') ? (c.macdHist[t] < c.macdHist[t - 1]) : (c.macdHist[t] > c.macdHist[t - 1])); }
    },
    // ── [S705-3] 추가 신호 (매수/청산 양방향·dir-aware) ──
    closeVsMa: {
      id: 'closeVsMa', label: '종가 vs 단기MA',
      fire: function (c, t, p) { return _g(c.close[t]) && _g(c.maS[t]) && ((p.dir === 'dc') ? (c.close[t] < c.maS[t]) : (c.close[t] > c.maS[t])); }
    },
    rsi50: {
      id: 'rsi50', label: 'RSI 50선',
      fire: function (c, t, p) { return _g(c.rsi[t]) && ((p.dir === 'dc') ? (c.rsi[t] < 50) : (c.rsi[t] > 50)); }
    },
    macdCross: {
      id: 'macdCross', label: 'MACD 라인>시그널',
      fire: function (c, t, p) { return _g(c.macdHist[t]) && ((p.dir === 'dc') ? (c.macdHist[t] < 0) : (c.macdHist[t] > 0)); }
    },
    // ── 조합 ──
    slopeOrRsi: {
      id: 'slopeOrRsi', label: '기울기 OR rsiGc',
      fire: function (c, t, p) { return PREDICTORS.slope.fire(c, t, p) || PREDICTORS.rsiGc.fire(c, t, p); }
    },
    slopeAndRsi: {
      id: 'slopeAndRsi', label: '기울기 & rsiGc',
      fire: function (c, t, p) { return PREDICTORS.slope.fire(c, t, p) && PREDICTORS.rsiGc.fire(c, t, p); }
    }
  };

  // ===== 엔진 — 단일 종목 =====
  //  opt: { s, l, dir, N, thr, cap }  (cap>0이면 균등샘플, 0/미지정=전수)
  function run(rows, rulerId, predIds, opt) {
    opt = opt || {};
    var ruler = RULERS[rulerId]; if (!ruler) return null;
    var ctx = buildContext(rows, opt);
    // 방향: cross는 명시(opt.dir), 그 외엔 자의 polarity로 결정(bull→gc, bear→dc)
    var dir = opt.dir || (ruler.polarity === 'bear' ? 'dc' : 'gc');
    var p = { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl };
    var preds = (predIds || []).map(function (id) { return PREDICTORS[id]; }).filter(Boolean);
    var acc = _freshAcc(preds);
    _accumulate(ctx, ruler, preds, p, opt.cap || 0, acc);
    return _finalize(acc, preds, ruler, p, false);
  }

  // ===== 엔진 — 멀티 종목 풀링 (부호 일관성·단일종목 운 제거) =====
  //  rowsList: [{name, rows}] 또는 [rows]
  function runPool(rowsList, rulerId, predIds, opt) {
    opt = opt || {};
    var ruler = RULERS[rulerId]; if (!ruler) return null;
    var preds = (predIds || []).map(function (id) { return PREDICTORS[id]; }).filter(Boolean);
    var dir = opt.dir || (ruler.polarity === 'bear' ? 'dc' : 'gc');
    var acc = _freshAcc(preds);
    var used = 0, posStocks = {};   // posStocks: 종목별 prec>baseRate 카운트(부호 일관성)
    preds.forEach(function (pr) { posStocks[pr.id] = { up: 0, tot: 0 }; });
    for (var si = 0; si < rowsList.length; si++) {
      var entry = rowsList[si];
      var rows = entry && entry.rows ? entry.rows : entry;
      if (!Array.isArray(rows) || rows.length < 40) continue;
      var ctx = buildContext(rows, opt);
      var p = { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl };
      var sAcc = _freshAcc(preds);
      _accumulate(ctx, ruler, preds, p, opt.cap || 0, sAcc);
      if (sAcc.eligN < 5) continue;   // 표본 너무 적은 종목 제외
      used++;
      // 풀 누적
      acc.eligN += sAcc.eligN; acc.eligHit += sAcc.eligHit;
      for (var k in sAcc.allEvent) acc.allEvent[k + '@' + si] = 1;   // 종목별 네임스페이스로 중복 방지
      preds.forEach(function (pr) {
        var a = acc.stat[pr.id], b = sAcc.stat[pr.id];
        a.n += b.n; a.hit += b.hit; a.leadSum += b.leadSum;
        for (var kk in sAcc.caught[pr.id]) acc.caught[pr.id][kk + '@' + si] = 1;
        // 부호 일관성: 이 종목서 신호 정밀 > 종목 기저율?
        var sBase = sAcc.eligN > 0 ? sAcc.eligHit / sAcc.eligN : 0;
        var sPrec = b.n > 0 ? b.hit / b.n : null;
        if (sPrec != null) { posStocks[pr.id].tot++; if (sPrec > sBase) posStocks[pr.id].up++; }
      });
    }
    var out = _finalize(acc, preds, ruler, { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl }, true);
    out.stocks = used;
    // 부호 일관성 비율(종목 중 신호가 기저율 상회한 비율) 부착
    out.rows.forEach(function (r) { var ps = posStocks[r.id]; r.consistency = (ps && ps.tot > 0) ? ps.up / ps.tot : null; });
    return out;
  }

  // ── 내부: 누산기 ──
  function _freshAcc(preds) {
    var stat = {}, caught = {}; preds.forEach(function (pr) { stat[pr.id] = { n: 0, hit: 0, leadSum: 0 }; caught[pr.id] = {}; });
    return { stat: stat, caught: caught, allEvent: {}, eligN: 0, eligHit: 0, eligTotal: 0 };
  }

  // ── 내부: 워크포워드 누적 ──
  function _accumulate(ctx, ruler, preds, p, cap, acc) {
    var warm = ruler.warm(ctx, p), n = ctx.n;
    var elig = [];
    for (var i = warm; i <= n - 1 - p.N; i++) { if (ruler.eligible(ctx, i, p)) elig.push(i); }
    acc.eligTotal += elig.length;
    var idxs = elig;
    if (cap > 0 && elig.length > cap) { idxs = []; var st = elig.length / cap; for (var s2 = 0; s2 < cap; s2++) idxs.push(elig[Math.floor(s2 * st)]); }
    for (var ii = 0; ii < idxs.length; ii++) {
      var t = idxs[ii];
      var lead = ruler.occurred(ctx, t, p);     // event: 봉수(>0) · return: 1/0
      var did = lead > 0;
      acc.eligN++; if (did) acc.eligHit++;
      // 이벤트 식별키: event형은 발생봉(t+lead)로 중복제거, return형은 t 자체
      var evKey = did ? ((ruler.type === 'event') ? ('x' + (t + lead)) : ('r' + t)) : null;
      if (did) acc.allEvent[evKey] = 1;
      for (var pi = 0; pi < preds.length; pi++) {
        var pr = preds[pi];
        if (pr.fire(ctx, t, p)) {
          var s = acc.stat[pr.id]; s.n++;
          if (did) { s.hit++; s.leadSum += (ruler.type === 'event' ? lead : 0); acc.caught[pr.id][evKey] = 1; }
        }
      }
    }
  }

  // ── 내부: 통계 마감 ──
  function _finalize(acc, preds, ruler, p, pooled) {
    var baseRate = acc.eligN > 0 ? acc.eligHit / acc.eligN : 0;
    var totalEvent = Object.keys(acc.allEvent).length;
    var rows = preds.map(function (pr) {
      var s = acc.stat[pr.id];
      var prec = s.n > 0 ? s.hit / s.n : null;
      var rec = totalEvent > 0 ? Object.keys(acc.caught[pr.id]).length / totalEvent : null;
      var lead = (ruler.type === 'event' && s.hit > 0) ? s.leadSum / s.hit : null;
      var lift = (prec != null && baseRate > 0) ? prec / baseRate : null;
      return {
        id: pr.id, label: pr.label, n: s.n, prec: prec, rec: rec, lead: lead, lift: lift,
        pass: (lift != null && lift >= 1.3), inverse: (lift != null && lift < 0.8)   // 합격(≥1.3 유의) / 역효과(<0.8)
      };
    });
    return { ruler: ruler.id, rulerLabel: ruler.label, type: ruler.type, dir: p.dir, N: p.N, thr: p.thr, tp: p.tp, sl: p.sl, baseRate: baseRate, totalEvent: totalEvent, nTests: acc.eligN, eligTotal: acc.eligTotal, pooled: !!pooled, rows: rows };
  }

  // ===== 공개 API =====
  var SXUV = {
    buildContext: buildContext,
    run: run,
    runPool: runPool,
    RULERS: RULERS,
    PREDICTORS: PREDICTORS,
    // 확장: 자/신호 하나씩 추가
    registerRuler: function (def) { if (def && def.id) RULERS[def.id] = def; return SXUV; },
    registerPredictor: function (def) { if (def && def.id) PREDICTORS[def.id] = def; return SXUV; },
    listRulers: function () { return Object.keys(RULERS); },
    listPredictors: function () { return Object.keys(PREDICTORS); },
    _helpers: { _sma: _sma, _ema: _ema, _rsi: _rsi, _obv: _obv }   // 테스트/재사용용
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SXUV;
  if (typeof window !== 'undefined') window.SXUV = SXUV;
  else if (typeof globalThis !== 'undefined') globalThis.SXUV = SXUV;
})();
