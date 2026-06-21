// ════════════════════════════════════════════════════════════════
//  sx_signal_val.js  —  [S667/S669] 범용 신호 검증기 (SXVAL)  v2
//  목적: 하네스의 지표 엔진을 신호 무관하게 일반화. 워크포워드(룩어헤드 0)로
//        앱의 방향신호들을 한 잣대로 비교.
//
//  [S669] v2 — 두 사각지대 보완:
//    ① 호라이즌 — h=1(다음봉)만이 아니라 여러 호라이즌(1·5·10·20봉)에서 평가.
//       "지표는 제 호라이즌(며칠~몇주)에선 정보가 있나?"를 같은 잣대로 확인.
//    ② 크기/비대칭 — 균형정확도(방향)만이 아니라 기대값/페이오프도 측정.
//       종가→종가 H봉 수익(ret)을 결과로 써서 방향+크기를 한 틀에서.
//       · 드리프트(항상 롱 평균수익) = 매수후보유 기준선
//       · 방향 기대값 = 신호대로 롱/숏 시 트레이드당 평균수익
//       · 롱선택 엣지 = E[ret|상승콜] − 드리프트 (상승콜이 그냥 보유보다 나은가)
//       · 손익비 = 맞을때 평균크기 / 틀릴때 평균크기 (50% 적중이어도 >1이면 +)
//
//  ★ 핵심 효율: 신호 prob는 호라이즌 무관(다음봉 확률/그 봉 상태값) → e 1회 순회에서
//    prob 1회 계산 + 모든 호라이즌 수익 동시 기록. 스윕이 단일실행과 거의 같은 비용.
//  평가 대상(룩어헤드 0): 캔들 kNN(scoreAt.upFrac) · LR(scoreAt.prob) ·
//    RSI 역추세 · MA5/20 추세 · MACD 부호.
//  ★ 단일종목 N시점은 노이즈 큼 — 여러 종목 집계해야 신뢰.
//  [S680] 체결 현실성 — ret을 두 모델로: 종가체결(close[e], 코인≈현실/KRX 시간외종가 근사) vs
//    익일시가체결(open[e+1], 미국·일반 익일진입). 청산봉 동일 → 차이=갭. byH(종가)·byHopen(익일).
//    "이 엣지가 종가확정 룩어헤드 없이 실제 들어가도 살아남나"를 같은 잣대로.
//  로드 순서: SXKNN·SXLR 뒤. node 호환(globalThis 폴백).
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var G = (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _close(r){ return _num(r && (r.close != null ? r.close : r.c)); }
  function _open(r){ return _num(r && (r.open != null ? r.open : r.o)); }   // [S680] 익일시가 진입가용
  function _sign(x){ return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function _maAt(c, e, len){ if(e - len + 1 < 0) return null; var t = 0; for(var i = e - len + 1; i <= e; i++) t += c[i]; return t / len; }
  function _regimeAt(c, e, band){
    if(e < 60) return 0;
    var a = _maAt(c, e, 20), b = _maAt(c, e, 60);
    if(a == null || b == null || b <= 0) return 0;
    var s = (a - b) / b, bb = (band != null ? band : 0.01);
    return s > bb ? 1 : s < -bb ? -1 : 0;
  }
  function _rsiArr(c, p){
    var n = c.length, o = new Array(n); for(var z = 0; z < n; z++) o[z] = null;
    if(n < p + 1) return o;
    var g = 0, l = 0, i, ch;
    for(i = 1; i <= p; i++){ ch = c[i] - c[i - 1]; if(ch >= 0) g += ch; else l -= ch; }
    var ag = g / p, al = l / p;
    o[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for(i = p + 1; i < n; i++){ ch = c[i] - c[i - 1]; var gg = ch > 0 ? ch : 0, ll = ch < 0 ? -ch : 0;
      ag = (ag * (p - 1) + gg) / p; al = (al * (p - 1) + ll) / p;
      o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    return o;
  }
  function _ema(c, p){ var n = c.length, o = new Array(n), k = 2 / (p + 1), pv; for(var i = 0; i < n; i++){ if(i === 0) pv = c[0]; else pv = c[i] * k + pv * (1 - k); o[i] = pv; } return o; }
  function _macdHistArr(c){ var n = c.length, e12 = _ema(c, 12), e26 = _ema(c, 26), m = new Array(n), i; for(i = 0; i < n; i++) m[i] = e12[i] - e26[i]; var s = _ema(m, 9), o = new Array(n); for(i = 0; i < n; i++) o[i] = m[i] - s[i]; return o; }

  // ── 지표 코어 ── records: [{prob(0-100), ret(분수), trend(-1/0/1)}]
  //   ret = 종가→종가 H봉 수익(분수). 방향 = sign(ret). 크기 = ret.
  function computeMetrics(records, fk){
    fk = fk || 'ret';
    var n = records.length;
    if(n < 20) return { ok:false, n:n, reason:'표본 부족' };
    var R1 = function(x){ return Math.round(x * 1000) / 10; };        // 정확도% (0-1 → %)
    var RR = function(x){ return Math.round(x * 1e4) / 100; };        // 수익분수 → % (2dp)
    var baseUp = 0, hit = 0, upCall = 0, upHit = 0, dnCall = 0, dnHit = 0, tie = 0;
    var sumRet = 0, sumUpRet = 0, nUp = 0, sumDirRet = 0, decis = 0;
    var sumWin = 0, nWin = 0, sumLoss = 0, nLoss = 0;
    var contN = 0, contHit = 0, revN = 0, revHit = 0;
    var CB = [[0,40],[40,50],[50,60],[60,70],[70,80],[80,101]], calib = CB.map(function(b){ return { lo:b[0], hi:b[1], n:0, up:0 }; });
    for(var i = 0; i < n; i++){
      var r = records[i], ret = r[fk], au = ret > 0 ? 1 : 0, ad = au ? 1 : -1;
      baseUp += au; sumRet += ret;
      var lean = _sign(r.prob - 50);
      if(lean === 0){ tie++; }
      else {
        decis++; var correct = (lean === ad) ? 1 : 0; hit += correct;
        sumDirRet += lean * ret;                              // 롱/숏 기대값
        if(correct){ sumWin += Math.abs(ret); nWin++; } else { sumLoss += Math.abs(ret); nLoss++; }
        if(lean > 0){ upCall++; upHit += au; sumUpRet += ret; nUp++; } else { dnCall++; dnHit += (au ? 0 : 1); }
        if(r.trend !== 0){ if(ad === r.trend){ contN++; contHit += correct; } else { revN++; revHit += correct; } }
      }
      for(var ci = 0; ci < calib.length; ci++){ var cb = calib[ci]; if(r.prob >= cb.lo && r.prob < cb.hi){ cb.n++; cb.up += au; break; } }
    }
    var dirN = upCall + dnCall;
    var upAcc = upCall ? upHit / upCall : null, dnAcc = dnCall ? dnHit / dnCall : null;
    var balAcc = (upAcc != null && dnAcc != null) ? (upAcc + dnAcc) / 2 : (upAcc != null ? upAcc : dnAcc);
    var drift = sumRet / n, longExp = nUp ? sumUpRet / nUp : null, dirExp = decis ? sumDirRet / decis : null;
    var avgWin = nWin ? sumWin / nWin : null, avgLoss = nLoss ? sumLoss / nLoss : null;
    return {
      ok:true, n:n, decisive:dirN, tie:tie, baseRate:R1(baseUp / n),
      balAcc: balAcc != null ? R1(balAcc) : null,
      dirAcc: dirN ? R1(hit / dirN) : null,
      upAcc: upAcc != null ? R1(upAcc) : null, upCalls:upCall,
      dnAcc: dnAcc != null ? R1(dnAcc) : null, dnCalls:dnCall,
      drift: RR(drift),
      longExp: longExp != null ? RR(longExp) : null,
      longEdge: longExp != null ? RR(longExp - drift) : null,   // 상승콜이 그냥 보유보다 나은가
      dirExp: dirExp != null ? RR(dirExp) : null,               // 롱/숏 트레이드당 기대수익%
      avgWin: avgWin != null ? RR(avgWin) : null, avgLoss: avgLoss != null ? RR(avgLoss) : null,
      wlRatio: (avgWin != null && avgLoss) ? Math.round(avgWin / avgLoss * 100) / 100 : null,
      contAcc: contN ? R1(contHit / contN) : null, contN:contN,
      revAcc:  revN  ? R1(revHit  / revN ) : null, revN:revN,
      calib: calib.map(function(cb){ return { lo:cb.lo, hi:cb.hi, n:cb.n, actUp: cb.n ? R1(cb.up / cb.n) : null }; })
    };
  }

  // ── 신호 레지스트리 ── fn(ctx,e) → 상승확률(0-100) | null. 룩어헤드 0. prob는 호라이즌 무관.
  var SIGNALS = [
    { key:'knn',  label:'캔들 kNN',   fn:function(ctx, e){ if(!ctx.SK) return null; var r = ctx.SK.scoreAt(ctx.rows, e, ctx.pre); return (r && r.active) ? r.upFrac : null; } },
    { key:'lr',   label:'LR',         fn:function(ctx, e){ if(!ctx.LR) return null; var r = ctx.LR.scoreAt(ctx.rows, e, ctx.pre); return (r && r.active) ? r.prob : null; } },
    { key:'rsi',  label:'RSI 역추세', fn:function(ctx, e){ var v = ctx.rsi[e]; if(v == null) return null; return Math.max(5, Math.min(95, 50 + (50 - v) * 0.6)); } },
    { key:'ma',   label:'MA5/20 추세', fn:function(ctx, e){ var a = _maAt(ctx.closes, e, 5), b = _maAt(ctx.closes, e, 20); if(a == null || b == null) return null; return 50 + _sign(a - b) * 12; } },
    { key:'macd', label:'MACD 부호',  fn:function(ctx, e){ var hh = ctx.macd[e]; if(hh == null) return null; return 50 + _sign(hh) * 12; } }
  ];

  function _buildCtx(rows){
    var n = rows.length, closes = new Array(n), opens = new Array(n);
    for(var i = 0; i < n; i++){ closes[i] = _close(rows[i]); opens[i] = _open(rows[i]); }
    var SK = (G.SXKNN && G.SXKNN.buildVecs && G.SXKNN.scoreAt) ? G.SXKNN : null;
    var LR = (G.SXLR && G.SXLR.scoreAt) ? G.SXLR : null;
    var pre = SK ? SK.buildVecs(rows) : null;
    return { rows:rows, closes:closes, opens:opens, SK:SK, LR:LR, pre:pre, rsi:_rsiArr(closes, 14), macd:_macdHistArr(closes) };
  }

  // ── 호라이즌 스윕 ── 모든 신호 × 여러 호라이즌, e 1회 순회(신호 prob 1회 계산) ──
  function runHorizonSweep(rows, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    var HS = opts.horizons || [1, 5, 10, 20];
    var maxH = Math.max.apply(null, HS), n = rows.length;
    var warmup = opts.warmup != null ? opts.warmup : 140;
    var lastE = n - 1 - maxH;                                   // 최장 호라이즌 결과 필요
    if(lastE - warmup < 30) return { ok:false, reason:'백테스트 표본 부족(' + n + '봉, ' + (warmup + maxH + 32) + '+ 필요)' };
    var target = opts.target || 90, step = Math.max(1, Math.ceil((lastE - warmup) / target));
    var ctx = _buildCtx(rows);
    var recs = SIGNALS.map(function(){ return HS.map(function(){ return []; }); });
    var driftC = HS.map(function(){ return { s:0, n:0 }; }), driftO = HS.map(function(){ return { s:0, n:0 }; });
    var nPts = 0;
    for(var e = warmup; e <= lastE; e += step){
      var trend = _regimeAt(ctx.closes, e, opts.regimeBand), ce = ctx.closes[e], oe = ctx.opens[e + 1];
      nPts++;
      // [S680] 종가체결(ce=close[e]) vs 익일시가체결(oe=open[e+1]) — 청산봉(close[e+h]) 동일. 차이=갭(oe-ce).
      var retsC = HS.map(function(h){ return ce > 0 ? ctx.closes[e + h] / ce - 1 : 0; });
      var retsO = HS.map(function(h, hi){ return (oe > 0) ? ctx.closes[e + h] / oe - 1 : retsC[hi]; });
      HS.forEach(function(h, hi){ driftC[hi].s += retsC[hi]; driftC[hi].n++; driftO[hi].s += retsO[hi]; driftO[hi].n++; });
      for(var s = 0; s < SIGNALS.length; s++){
        var p = SIGNALS[s].fn(ctx, e);                          // prob 1회 → 모든 호라이즌·체결모델 공유
        if(p == null) continue;
        for(var hi = 0; hi < HS.length; hi++) recs[s][hi].push({ prob:p, ret:retsC[hi], retO:retsO[hi], trend:trend });
      }
    }
    var signals = SIGNALS.map(function(sig, s){
      return { key:sig.key, label:sig.label,
        byH:     HS.map(function(h, hi){ return computeMetrics(recs[s][hi], 'ret'); }),       // 종가체결
        byHopen: HS.map(function(h, hi){ return computeMetrics(recs[s][hi], 'retO'); }) };    // [S680] 익일시가체결
    });
    var _dr = function(acc){ return HS.map(function(h, hi){ return acc[hi].n ? Math.round(acc[hi].s / acc[hi].n * 1e4) / 100 : null; }); };
    return { ok:true, horizons:HS, nPts:nPts, step:step, warmup:warmup, drift:_dr(driftC), driftOpen:_dr(driftO), signals:signals, knnReady:!!ctx.SK, lrReady:!!ctx.LR };
  }

  // 단일 호라이즌(h=1) — 구버전 호출 호환(균형정확도순 정렬 평탄 반환)
  function runSuite(rows, opts){
    var r = runHorizonSweep(rows, Object.assign({}, opts || {}, { horizons:[1] }));
    if(!r.ok) return r;
    var flat = r.signals.map(function(s){ return { key:s.key, label:s.label, metrics:s.byH[0] }; });
    flat.sort(function(a, b){ var va = (a.metrics.ok && a.metrics.balAcc != null) ? a.metrics.balAcc : -1, vb = (b.metrics.ok && b.metrics.balAcc != null) ? b.metrics.balAcc : -1; return vb - va; });
    return { ok:true, nPts:r.nPts, step:r.step, warmup:r.warmup, baseRate:(r.signals[0] && r.signals[0].byH[0].ok ? r.signals[0].byH[0].baseRate : null), signals:flat, knnReady:r.knnReady, lrReady:r.lrReady };
  }

  G.SXVAL = { runHorizonSweep:runHorizonSweep, runSuite:runSuite, computeMetrics:computeMetrics, SIGNALS:SIGNALS };
})();
