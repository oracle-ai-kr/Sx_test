//  sx_validator.js — [S704] 범용 검증기 (SXUV)  ·  [S706] 배리어 자(익절/손절)  ·  [S707] 레짐 필터(ltAlign) + 구조/돌파 신호(저항돌파 등)
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
  // [S710] ADX 시리즈 (Wilder, 기간 14) — C ADX.calc 정확복제, 봉별 워크포워드 배열로 산출(룩어헤드 안전).
  //   각 봉 t의 adx[t]/pdi[t]/mdi[t] = rows[0..t]로 C가 계산하는 마지막 평활값과 동일. pdi/mdi는 t≥period, adx는 t≥2·period−1부터.
  function _adxSeries(high, low, close, period) {
    var n = high.length, adx = new Array(n).fill(null), pdi = new Array(n).fill(null), mdi = new Array(n).fill(null);
    if (n < period + 1) return { adx: adx, pdi: pdi, mdi: mdi };
    var atr = 0, pDM = 0, mDM = 0;
    for (var i = 1; i <= period; i++) {
      var h = high[i] - high[i - 1], lo = low[i - 1] - low[i];
      pDM += (h > lo && h > 0) ? h : 0; mDM += (lo > h && lo > 0) ? lo : 0;
      atr += Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    }
    var dxSeries = [], pdi0 = atr > 0 ? (pDM / atr) * 100 : 0, mdi0 = atr > 0 ? (mDM / atr) * 100 : 0;
    dxSeries.push((pdi0 + mdi0) > 0 ? Math.abs(pdi0 - mdi0) / (pdi0 + mdi0) * 100 : 0);
    pdi[period] = pdi0; mdi[period] = mdi0;
    for (var i2 = period + 1; i2 < n; i2++) {
      var h2 = high[i2] - high[i2 - 1], lo2 = low[i2 - 1] - low[i2];
      var tr = Math.max(high[i2] - low[i2], Math.abs(high[i2] - close[i2 - 1]), Math.abs(low[i2] - close[i2 - 1]));
      atr = atr - atr / period + tr;
      pDM = pDM - pDM / period + ((h2 > lo2 && h2 > 0) ? h2 : 0);
      mDM = mDM - mDM / period + ((lo2 > h2 && lo2 > 0) ? lo2 : 0);
      var pdiI = atr > 0 ? (pDM / atr) * 100 : 0, mdiI = atr > 0 ? (mDM / atr) * 100 : 0;
      var dxI = (pdiI + mdiI) > 0 ? Math.abs(pdiI - mdiI) / (pdiI + mdiI) * 100 : 0;
      dxSeries.push(dxI); pdi[i2] = pdiI; mdi[i2] = mdiI;
      var m = dxSeries.length;
      if (m === period) { var sum = 0; for (var k = 0; k < period; k++) sum += dxSeries[k]; adx[i2] = sum / period; }
      else if (m > period) { adx[i2] = (adx[i2 - 1] * (period - 1) + dxI) / period; }
    }
    return { adx: adx, pdi: pdi, mdi: mdi };
  }
  // [S710] 볼린저 %B 시리즈 (기간 20, 2σ, 모표준편차) — C BollingerBands.calc 정확복제. pctB[t]=(close−하단)/(상단−하단).
  function _pctBSeries(close, period, mult) {
    var n = close.length, out = new Array(n).fill(null), mid = _sma(close, period);
    for (var i = 0; i < n; i++) {
      if (mid[i] == null) continue;
      var sum2 = 0; for (var j = i - period + 1; j <= i; j++) sum2 += (close[j] - mid[i]) * (close[j] - mid[i]);
      var sd = Math.sqrt(sum2 / period), up = mid[i] + sd * mult, lo = mid[i] - sd * mult;
      out[i] = (up - lo) > 0 ? (close[i] - lo) / (up - lo) : 0.5;
    }
    return out;
  }

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
    // [S707] 장기 MA 배열 → ltAlign(bull/bear/mixed/null) — C 경로 게이트(_maAlignLT) 복제. 일봉 [60,120,200].
    //   bull=장기 정배열(60>120>200) · bear=역배열(60<120<200) · mixed=혼조 · null=장기MA 미성숙(C 'off' 등가).
    //   용도: 추가상승(추세 경로) 신호를 C가 실제 쓰는 맥락(ltAlign≠bear)에서만 감사하는 레짐 필터.
    var ltTrip = opt.ltTrip || [60, 120, 200];
    var maLtA = _sma(close, ltTrip[0]), maLtB = _sma(close, ltTrip[1]), maLtC = _sma(close, ltTrip[2]);
    var ltAlign = close.map(function (_, i) {
      if (maLtA[i] == null || maLtB[i] == null || maLtC[i] == null) return null;
      if (maLtA[i] > maLtB[i] && maLtB[i] > maLtC[i]) return 'bull';
      if (maLtA[i] < maLtB[i] && maLtB[i] < maLtC[i]) return 'bear';
      return 'mixed';
    });
    // [S710] C upside 잔여 3조건용 지표 — 전부 C 엔진 정확복제. 정배열용 5/20/60은 거래 MA쌍(s/l)과 독립(고정).
    var ma5f = _sma(close, 5), ma20 = _sma(close, 20), ma60 = _sma(close, 60);
    var align3 = close.map(function (_, i) {   // 이평선 정배열(C maAlign): 5>20>60=bull · 5<20<60=bear
      if (ma5f[i] == null || ma20[i] == null || ma60[i] == null) return null;
      if (ma5f[i] > ma20[i] && ma20[i] > ma60[i]) return 'bull';
      if (ma5f[i] < ma20[i] && ma20[i] < ma60[i]) return 'bear';
      return 'mixed';
    });
    // 골든/데드크로스(5/20) 최근 5봉내 전환 — C _maGoldenCross/_maDeadCross(5,20,5) 근사(upsideMix 골든크로스 조건용). 룩어헤드 안전(과거 교차만 미래봉 플래그).
    var n0 = close.length, gcRecent = new Array(n0).fill(false), dcRecent = new Array(n0).fill(false);
    for (var gi = 1; gi < n0; gi++) {
      if (ma5f[gi] == null || ma20[gi] == null || ma5f[gi - 1] == null || ma20[gi - 1] == null) continue;
      if (ma5f[gi] > ma20[gi] && ma5f[gi - 1] <= ma20[gi - 1]) { for (var gk = gi; gk < Math.min(n0, gi + 5); gk++) gcRecent[gk] = true; }
      if (ma5f[gi] < ma20[gi] && ma5f[gi - 1] >= ma20[gi - 1]) { for (var dj = gi; dj < Math.min(n0, gi + 5); dj++) dcRecent[dj] = true; }
    }
    var _adx = _adxSeries(high, low, close, 14);   // ADX 추세강도(Wilder14)
    var pctB = _pctBSeries(close, 20, 2);           // 볼린저 %B(20,2σ) — 밴드워킹
    return { rows: rows, n: rows.length, s: s, l: l, close: close, vol: vol, high: high, low: low, maS: maS, maL: maL, obv: obv, obvSig: obvSig, macdHist: macdHist, rsi: rsi, rsiSig: rsiSig, ltAlign: ltAlign, ltTrip: ltTrip, ma5f: ma5f, ma20: ma20, ma60: ma60, align3: align3, gcRecent: gcRecent, dcRecent: dcRecent, adx: _adx.adx, pdi: _adx.pdi, mdi: _adx.mdi, pctB: pctB };
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
    },
    // ── [S707] 구조/돌파 신호 (C upside 11조건 감사용) — high/low/vol 순수수학. dir-aware(dc=하향 대칭). ──
    resBreak: {
      id: 'resBreak', label: '저항/신고가 돌파',   // C '저항/신고가 돌파'(maxW14) 프록시: 종가가 직전 N봉 고가 최대 돌파
      fire: function (c, t, p) {
        var N = (p && p.brkN) || 20; if (t < N || !_g(c.close[t])) return false;
        if (p.dir === 'dc') { var lo = Infinity; for (var j = t - N; j < t; j++) { if (c.low[j] != null && c.low[j] < lo) lo = c.low[j]; } return lo < Infinity && c.close[t] < lo; }
        var hi = -Infinity; for (var j2 = t - N; j2 < t; j2++) { if (c.high[j2] != null && c.high[j2] > hi) hi = c.high[j2]; } return hi > -Infinity && c.close[t] > hi;
      }
    },
    hhBreak: {
      id: 'hhBreak', label: '고점 갱신(HH)',   // C '고점 갱신(HH)'(maxW10) 프록시: 종가가 직전 N봉 종가 최고(신고가 종가)
      fire: function (c, t, p) {
        var N = (p && p.brkN) || 20; if (t < N || !_g(c.close[t])) return false;
        if (p.dir === 'dc') { var lo = Infinity; for (var j = t - N; j < t; j++) { if (c.close[j] != null && c.close[j] < lo) lo = c.close[j]; } return lo < Infinity && c.close[t] < lo; }
        var hi = -Infinity; for (var j2 = t - N; j2 < t; j2++) { if (c.close[j2] != null && c.close[j2] > hi) hi = c.close[j2]; } return hi > -Infinity && c.close[t] > hi;
      }
    },
    volSurge: {
      id: 'volSurge', label: '거래량 급증',   // C '거래량 동반'(maxW13) 프록시: 거래량 ≥ 1.5×직전 N봉 평균. 방향 무관.
      fire: function (c, t, p) {
        var N = (p && p.brkN) || 20, k = 1.5; if (t < N || c.vol[t] == null) return false;
        var sum = 0, cnt = 0; for (var j = t - N; j < t; j++) { if (c.vol[j] != null) { sum += c.vol[j]; cnt++; } }
        var avg = cnt > 0 ? sum / cnt : 0;
        return avg > 0 && c.vol[t] >= k * avg;
      }
    },
    // ── [S710] C upside 잔여 3조건(정배열12·ADX11·밴드워킹6) — buildContext 정확복제. 이로써 11조건 개별감사 완성. ──
    align3: {
      id: 'align3', label: '정배열(5·20·60)',   // C '이평선 정배열'(maxW12): MA5>20>60 (dc=역배열).
      fire: function (c, t, p) {
        if (!c.align3 || c.align3[t] == null) return false;
        return (p.dir === 'dc') ? (c.align3[t] === 'bear') : (c.align3[t] === 'bull');
      }
    },
    adx: {
      id: 'adx', label: 'ADX 추세강도',   // C '추세 강도'(maxW11): ADX≥25 & +DI>−DI (dc=−DI>+DI). Wilder14. C는 ≥30서 만점(11), ≥25서 10 — 발화는 ≥25(조건 충족점).
      fire: function (c, t, p) {
        if (!c.adx || c.adx[t] == null || c.pdi[t] == null || c.mdi[t] == null || c.adx[t] < 25) return false;
        return (p.dir === 'dc') ? (c.mdi[t] > c.pdi[t]) : (c.pdi[t] > c.mdi[t]);
      }
    },
    bandWalk: {
      id: 'bandWalk', label: '밴드워킹(BB상단)',   // C '볼린저 밴드워킹'(maxW6): %B∈[0.8,1.05] & 상승 (dc=하단 [−0.05,0.2] & 하락).
      fire: function (c, t, p) {
        if (!c.pctB || c.pctB[t] == null || t < 1) return false;
        if (p.dir === 'dc') return c.pctB[t] >= -0.05 && c.pctB[t] <= 0.2 && c.close[t] < c.close[t - 1];
        return c.pctB[t] >= 0.8 && c.pctB[t] <= 1.05 && c.close[t] > c.close[t - 1];
      }
    },
    // ── [S710] AND 조합 — 합산(upsideMix)이 실패한 뒤의 대안 가설: "강조건의 공존(AND)이 개별보다 나은가". C의 실제 합산과 다른 별개 실험. ──
    andCore: {
      id: 'andCore', label: 'AND 정배열&ADX',   // 추세확증 2중: 정배열 AND ADX≥25.
      fire: function (c, t, p) { return PREDICTORS.align3.fire(c, t, p) && PREDICTORS.adx.fire(c, t, p); }
    },
    andStrong: {
      id: 'andStrong', label: 'AND 정배열&ADX&돌파',   // 강조건 3중: 정배열 AND ADX AND 저항돌파. ⚠표본 작을 수 있음(리프트 노이즈 주의).
      fire: function (c, t, p) { return PREDICTORS.align3.fire(c, t, p) && PREDICTORS.adx.fire(c, t, p) && PREDICTORS.resBreak.fire(c, t, p); }
    },
    // ── [S710] 조합 테스트(합산) — 11조건 완성판. C upside 11조건 전부를 C 실제 maxW로 가중합(114점)→임계 점화. 기본 60 = C 게이트(60/114). ──
    //  각 조건 프록시: 정배열·골든크로스(전환 근사)·가격>MA20·ADX·HH·저항돌파·밴드워킹·OBV·거래량·MACD·RSI50. 정배열/골든크로스는 상호배타(C 게이팅 반영).
    upsideMix: {
      id: 'upsideMix', label: 'C상승 조합(11조건)',
      fire: function (c, t, p) {
        var thr = (p && p.mixThr != null) ? p.mixThr : 60;
        var P = PREDICTORS, s = 0, dc = (p.dir === 'dc');
        if (P.align3.fire(c, t, p)) s += 12;                                                    // ① 정배열(12)
        else if (c.align3 && c.align3[t] != null && (dc ? c.dcRecent[t] : c.gcRecent[t])) s += 12;  // ② 골든크로스(12) — 정배열 아닐 때 최근 전환
        if (_g(c.ma20[t]) && (dc ? (c.close[t] < c.ma20[t]) : (c.close[t] > c.ma20[t]))) s += 10;   // ③ 가격>MA20(10)
        if (P.adx.fire(c, t, p)) s += 11;            // ④ ADX(11)
        if (P.hhBreak.fire(c, t, p)) s += 10;        // ⑤ HH(10)
        if (P.resBreak.fire(c, t, p)) s += 14;       // ⑥ 저항/신고가(14)
        if (P.bandWalk.fire(c, t, p)) s += 6;        // ⑦ 밴드워킹(6)
        if (P.obv.fire(c, t, p)) s += 12;            // ⑧ OBV(12)
        if (P.volSurge.fire(c, t, p)) s += 13;       // ⑨ 거래량(13)
        if (P.macdCross.fire(c, t, p)) s += 8;       // ⑩ MACD(8)
        if (P.rsi50.fire(c, t, p)) s += 6;           // ⑪ RSI50(6)
        return s >= thr;   // 합계 최대 114
      }
    }
  };

  // ===== 엔진 — 단일 종목 =====
  //  opt: { s, l, dir, N, thr, cap, regime, brkN }  (regime>0이면 ltAlign 필터·기본 'all'=전 봉 · brkN=돌파 룩백·기본20)
  function run(rows, rulerId, predIds, opt) {
    opt = opt || {};
    var ruler = RULERS[rulerId]; if (!ruler) return null;
    var ctx = buildContext(rows, opt);
    // 방향: cross는 명시(opt.dir), 그 외엔 자의 polarity로 결정(bull→gc, bear→dc)
    var dir = opt.dir || (ruler.polarity === 'bear' ? 'dc' : 'gc');
    var p = { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl, regime: opt.regime, brkN: opt.brkN, mixThr: opt.mixThr };
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
      var p = { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl, regime: opt.regime, brkN: opt.brkN, mixThr: opt.mixThr };
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
    var out = _finalize(acc, preds, ruler, { dir: dir, N: opt.N || (ruler.type === 'event' ? 3 : 5), thr: opt.thr, tp: opt.tp, sl: opt.sl, regime: opt.regime, brkN: opt.brkN, mixThr: opt.mixThr }, true);
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

  // ── [S707] 레짐 필터 — C가 추가상승(추세 경로)을 실제 쓰는 맥락에서만 측정. 기본 OFF(전 봉=리그레션 보존). ──
  //   'all'(기본)=전체 · 'trend'=ltAlign≠bear(C 추세 경로 가능, 추가상승 실사용) · 'bull'=장기 정배열만 · 'bear'=역배열만(대조군).
  function _regimeOk(ctx, t, p) {
    var rg = p && p.regime;
    if (!rg || rg === 'all') return true;
    var a = ctx.ltAlign ? ctx.ltAlign[t] : null;
    if (a == null) return false;                 // 장기MA 미성숙(=C 'off') 봉 제외
    if (rg === 'trend') return a !== 'bear';
    if (rg === 'bull') return a === 'bull';
    if (rg === 'bear') return a === 'bear';
    return true;
  }

  // ── 내부: 워크포워드 누적 ──
  function _accumulate(ctx, ruler, preds, p, cap, acc) {
    var warm = ruler.warm(ctx, p), n = ctx.n;
    var elig = [];
    for (var i = warm; i <= n - 1 - p.N; i++) { if (ruler.eligible(ctx, i, p) && _regimeOk(ctx, i, p)) elig.push(i); }
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
    return { ruler: ruler.id, rulerLabel: ruler.label, type: ruler.type, dir: p.dir, N: p.N, thr: p.thr, tp: p.tp, sl: p.sl, regime: p.regime, brkN: p.brkN, mixThr: p.mixThr, baseRate: baseRate, totalEvent: totalEvent, nTests: acc.eligN, eligTotal: acc.eligTotal, pooled: !!pooled, rows: rows };
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
