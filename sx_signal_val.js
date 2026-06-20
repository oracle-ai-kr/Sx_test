// ════════════════════════════════════════════════════════════════
//  sx_signal_val.js  —  [S667] 범용 신호 검증기 (SXVAL)
//  목적: 차트예측 백테스트 하네스의 "지표 엔진"을 신호 무관하게 일반화.
//        앱의 여러 방향신호를 워크포워드(룩어헤드 0)로 한 잣대에 비교 →
//        "어느 신호가 다음 캔들(양봉/음봉)을 실제로 맞히나"를 정직하게 측정.
//
//  평가 대상(모두 '다음 캔들 양봉예측', 룩어헤드 0):
//    · 캔들 kNN  = SXKNN.scoreAt(rows,e,pre).upFrac   (인덱스필터로 미래 차단)
//    · LR        = SXLR.scoreAt(rows,e,pre).prob       (학습표본 e'≤sigE-1, 같은 pre 공유)
//    · RSI 역추세 = RSI(14) 과매도→상승 (rows[0..e]만 인라인 계산)
//    · MA5/20 추세 = 골든→상승
//    · MACD 부호  = 히스토>0→상승
//
//  지표: 기준선(실제 양봉률) / 균형정확도(50%=찍기, 기준독립) / 방향정확도 /
//        상승·하락 콜 정확도 / 캘리브레이션(upProb→실제) / 지속→전환 적중(추세추종 함정).
//
//  결과봉 판정: _isUp(close ≥ open) — SXKNN._isUp과 동일(같은 잣대로 비교).
//  ★ 단일 종목 N시점은 노이즈 큼 — 여러 종목 집계해야 신뢰(차트예측 하네스와 동일 철학).
//  로드 순서: SXKNN·SXLR 뒤(둘을 호출). 없으면 해당 신호만 비활성, 나머지는 동작.
//  node 호환: globalThis 폴백.
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var G = (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _close(r){ return _num(r && (r.close != null ? r.close : r.c)); }
  function _isUp(r){ return _num(r.close) >= _num(r.open); }           // 양봉 = close ≥ open (kNN과 동일)
  function _sign(x){ return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function _maAt(c, e, len){ if(e - len + 1 < 0) return null; var t = 0; for(var i = e - len + 1; i <= e; i++) t += c[i]; return t / len; }
  function _regimeAt(c, e, band){
    if(e < 60) return 0;
    var a = _maAt(c, e, 20), b = _maAt(c, e, 60);
    if(a == null || b == null || b <= 0) return 0;
    var s = (a - b) / b, bb = (band != null ? band : 0.01);
    return s > bb ? 1 : s < -bb ? -1 : 0;
  }
  // 인과적 보조 시계열 (RSI/MACD) — 각 인덱스는 과거만 사용
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

  // ── 지표 코어 ── records: [{prob(0-100), actUp(0/1), trend(-1/0/1)}] → 단일 신호 지표
  function computeMetrics(records){
    var n = records.length;
    if(n < 20) return { ok:false, n:n, reason:'표본 부족' };
    var R1 = function(x){ return Math.round(x * 1000) / 10; };
    var baseUp = 0, hit = 0, upCall = 0, upHit = 0, dnCall = 0, dnHit = 0, tie = 0, contN = 0, contHit = 0, revN = 0, revHit = 0;
    var CB = [[0,40],[40,50],[50,60],[60,70],[70,80],[80,101]], calib = CB.map(function(b){ return { lo:b[0], hi:b[1], n:0, up:0 }; });
    for(var i = 0; i < n; i++){
      var r = records[i], au = r.actUp, ad = au ? 1 : -1; baseUp += au;
      var lean = _sign(r.prob - 50);
      if(lean === 0){ tie++; }
      else {
        var h = (lean === ad) ? 1 : 0; hit += h;
        if(lean > 0){ upCall++; upHit += au; } else { dnCall++; dnHit += (au ? 0 : 1); }
        if(r.trend !== 0){ if(ad === r.trend){ contN++; contHit += h; } else { revN++; revHit += h; } }
      }
      for(var ci = 0; ci < calib.length; ci++){ var cb = calib[ci]; if(r.prob >= cb.lo && r.prob < cb.hi){ cb.n++; cb.up += au; break; } }
    }
    var dirN = upCall + dnCall;
    var upAcc = upCall ? upHit / upCall : null, dnAcc = dnCall ? dnHit / dnCall : null;
    var balAcc = (upAcc != null && dnAcc != null) ? (upAcc + dnAcc) / 2 : (upAcc != null ? upAcc : dnAcc);
    return {
      ok:true, n:n, decisive:dirN, tie:tie, baseRate:R1(baseUp / n),
      balAcc: balAcc != null ? R1(balAcc) : null,
      dirAcc: dirN ? R1(hit / dirN) : null,
      upAcc: upAcc != null ? R1(upAcc) : null, upCalls:upCall,
      dnAcc: dnAcc != null ? R1(dnAcc) : null, dnCalls:dnCall,
      contAcc: contN ? R1(contHit / contN) : null, contN:contN,
      revAcc:  revN  ? R1(revHit  / revN ) : null, revN:revN,
      calib: calib.map(function(cb){ return { lo:cb.lo, hi:cb.hi, n:cb.n, actUp: cb.n ? R1(cb.up / cb.n) : null }; })
    };
  }

  // ── 신호 레지스트리 ── fn(ctx,e) → 상승확률(0-100) | null(비활성). 전부 다음캔들 양봉예측, 룩어헤드 0.
  var SIGNALS = [
    { key:'knn',  label:'캔들 kNN',   fn:function(ctx, e){ if(!ctx.SK) return null; var r = ctx.SK.scoreAt(ctx.rows, e, ctx.pre); return (r && r.active) ? r.upFrac : null; } },
    { key:'lr',   label:'LR',         fn:function(ctx, e){ if(!ctx.LR) return null; var r = ctx.LR.scoreAt(ctx.rows, e, ctx.pre); return (r && r.active) ? r.prob : null; } },
    { key:'rsi',  label:'RSI 역추세', fn:function(ctx, e){ var v = ctx.rsi[e]; if(v == null) return null; return Math.max(5, Math.min(95, 50 + (50 - v) * 0.6)); } },   // 과매도→상승
    { key:'ma',   label:'MA5/20 추세', fn:function(ctx, e){ var a = _maAt(ctx.closes, e, 5), b = _maAt(ctx.closes, e, 20); if(a == null || b == null) return null; return 50 + _sign(a - b) * 12; } },   // 골든→상승
    { key:'macd', label:'MACD 부호',  fn:function(ctx, e){ var hh = ctx.macd[e]; if(hh == null) return null; return 50 + _sign(hh) * 12; } }                              // 히스토>0→상승
  ];

  function _buildCtx(rows){
    var n = rows.length, closes = new Array(n); for(var i = 0; i < n; i++) closes[i] = _close(rows[i]);
    var SK = (G.SXKNN && G.SXKNN.buildVecs && G.SXKNN.scoreAt) ? G.SXKNN : null;
    var LR = (G.SXLR && G.SXLR.scoreAt) ? G.SXLR : null;
    var pre = SK ? SK.buildVecs(rows) : null;   // kNN·LR 공용 (1회)
    return { rows:rows, closes:closes, SK:SK, LR:LR, pre:pre, rsi:_rsiArr(closes, 14), macd:_macdHistArr(closes) };
  }

  // ── 스위트: 모든 신호를 동일 시점들에 워크포워드 → 신호별 지표(균형정확도순 정렬) ──
  function runSuite(rows, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    var n = rows.length;
    var warmup = opts.warmup != null ? opts.warmup : 140;   // LR MIN_TRAIN(80)+창+컨텍스트 여유
    var lastE = n - 2;                                        // 다음캔들(e+1) 필요 → e ≤ n-2
    if(lastE - warmup < 30) return { ok:false, reason:'백테스트 표본 부족(' + n + '봉, ' + (warmup + 32) + '+ 필요)' };
    var target = opts.target || 90, step = Math.max(1, Math.ceil((lastE - warmup) / target));   // LR 비용↓: 시점수 ~target
    var ctx = _buildCtx(rows);
    var recs = SIGNALS.map(function(){ return []; });
    var nPts = 0, baseUp = 0;
    for(var e = warmup; e <= lastE; e += step){
      var au = _isUp(rows[e + 1]) ? 1 : 0;
      var trend = _regimeAt(ctx.closes, e, opts.regimeBand);
      nPts++; baseUp += au;
      for(var s = 0; s < SIGNALS.length; s++){
        var p = SIGNALS[s].fn(ctx, e);
        if(p != null) recs[s].push({ prob:p, actUp:au, trend:trend });
      }
    }
    var out = SIGNALS.map(function(sig, s){ return { key:sig.key, label:sig.label, metrics:computeMetrics(recs[s]) }; });
    out.sort(function(a, b){
      var va = (a.metrics.ok && a.metrics.balAcc != null) ? a.metrics.balAcc : -1;
      var vb = (b.metrics.ok && b.metrics.balAcc != null) ? b.metrics.balAcc : -1;
      return vb - va;
    });
    return {
      ok:true, nPts:nPts, step:step, warmup:warmup,
      baseRate: nPts ? Math.round(baseUp / nPts * 1000) / 10 : null,
      signals:out, knnReady:!!ctx.SK, lrReady:!!ctx.LR
    };
  }

  G.SXVAL = { runSuite:runSuite, computeMetrics:computeMetrics, SIGNALS:SIGNALS };
})();
