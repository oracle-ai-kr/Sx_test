// ════════════════════════════════════════════════════════════════
//  sx_candle_lr.js  —  [S656] 캔들 전이 로지스틱 회귀(LR) 보조  (실험)
//  목적: kNN(자기유사도, sx_candle_knn.js)과 같은 피처벡터로 종목 자기 과거 데이터를
//        학습해 "다음봉 양봉 확률"을 예측. kNN의 "닮은꼴 투표"와 다른 방식(선형 결합)이라
//        같은 입력에서 서로 다른 모델이 동의/불일치하는지 교차검증 용도로 캔들전이 카드에 병렬 표시.
//
//  ★ 예측 정확도 보장 아님 — 실험영역. kNN보다 더 그렇다 — 표본(수백 개) < 차원(8*win+10=138)
//    이라 과적합 위험이 본질적으로 큼. L2 정규화로 완화하지만 한계는 있음.
//
//  피처: SXKNN.buildVecs(rows, win) 그대로 재사용 — 별도 피처 추출 코드 없음(중복 제거,
//        kNN과 100% 동일 입력 기준이라 두 모델 비교가 공정함).
//
//  학습 방식: 워크포워드 — 신호봉 sigE 시점에서 그 이전 데이터(e+1≤sigE)만으로 매번 새로
//        배치 경사하강법 학습(룩어헤드 없음, kNN의 "후보는 과거만" 원칙과 동일).
//        라이브 1회 호출은 빠름(수백 샘플×138차원×수백 epoch ≈ 수십 ms). 단, 워크포워드
//        구간 전체(예: 150봉) 적중률 검증은 매 시점 재학습이 필요해 비용이 커서 v1은 미구현
//        (kNN처럼 backtestHit 추가는 향후 과제 — 비동기/throttle 필요).
//
//  의존: SXKNN(sx_candle_knn.js)이 먼저 로드되어 있어야 함(buildVecs 재사용).
//  로드 순서: sx_candle_knn.js 다음, sx_render.js가 호출하기 전.
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var WIN = 16;        // [S656] kNN 기본값과 통일(같은 sigE에서 같은 win 비교가 자연스러움)
  var MIN_TRAIN = 80;   // 최소 학습 표본 — kNN MIN_BANK(40)보다 높게: 138차원 선형모델은 표본이 더 필요
  var LAMBDA = 0.05;    // L2 정규화 강도 — 표본<차원 상황의 과적합 완화용 초기값(실험적, 추후 검증 후 조정 가능)
  var LR_RATE = 0.15;   // 경사하강 학습률
  var EPOCHS = 250;     // 경사하강 반복 수

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _isUp(r){ return _num(r.close) >= _num(r.open); }

  // ── 표준화(z-score) — 학습셋 기준 평균/표준편차로 학습+쿼리 벡터 모두 변환 ──
  //   피처마다 스케일이 달라(z-score 형태 vs 비율 vs log 등) 정규화 없으면 경사하강·L2가 불균등해짐.
  function _standardize(X){
    var n = X.length, d = X[0].length, i, j;
    var mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for(i=0;i<n;i++) for(j=0;j<d;j++) mean[j] += X[i][j];
    for(j=0;j<d;j++) mean[j] /= n;
    for(i=0;i<n;i++) for(j=0;j<d;j++){ var dd = X[i][j]-mean[j]; std[j] += dd*dd; }
    for(j=0;j<d;j++){ std[j] = Math.sqrt(std[j]/n); if(std[j] <= 1e-9) std[j] = 1; }
    var Xs = new Array(n);
    for(i=0;i<n;i++){ var row=new Array(d); for(j=0;j<d;j++) row[j]=(X[i][j]-mean[j])/std[j]; Xs[i]=row; }
    return { Xs:Xs, mean:mean, std:std };
  }

  // ── 배치 경사하강 로지스틱 회귀 (L2 정규화, 표준화된 입력 가정) ──
  function _trainLR(Xs, y, opts){
    opts = opts || {};
    var lr = opts.lr!=null?opts.lr:LR_RATE, lambda = opts.lambda!=null?opts.lambda:LAMBDA, epochs = opts.epochs||EPOCHS;
    var n = Xs.length, d = Xs[0].length, i, j;
    var w = new Array(d).fill(0), b = 0;
    for(var ep=0; ep<epochs; ep++){
      var gw = new Array(d).fill(0), gb = 0;
      for(i=0;i<n;i++){
        var z = b; for(j=0;j<d;j++) z += w[j]*Xs[i][j];
        if(z > 30) z = 30; else if(z < -30) z = -30;   // [안전] sigmoid 오버플로 방지
        var p = 1/(1+Math.exp(-z));
        var err = p - y[i];
        for(j=0;j<d;j++) gw[j] += err*Xs[i][j];
        gb += err;
      }
      for(j=0;j<d;j++) w[j] -= lr*(gw[j]/n + lambda*w[j]);
      b -= lr*(gb/n);
    }
    return { w:w, b:b };
  }

  // ── 신호봉 sigE에서 LR 예측 ──  pre=SXKNN.buildVecs 결과(없으면 내부 1회 구축). opts.win 지원.
  //   학습 표본: e∈[pre.from, sigE-1] (결과=rows[e+1] 필요 + sigE 자체는 결과를 모르므로 학습에서 제외 → 룩어헤드 없음)
  function scoreAt(rows, sigE, pre, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { active:false, reason:'데이터 없음' };
    var win = opts.win || WIN;
    if(!pre){
      if(!(self_or_window().SXKNN && self_or_window().SXKNN.buildVecs)) return { active:false, reason:'SXKNN 미로드' };
      pre = self_or_window().SXKNN.buildVecs(rows, win);
    }
    var last = rows.length-1; win = pre.win;
    if(sigE < win-1 || sigE > last) return { active:false, reason:'인덱스 범위 밖' };
    var q = pre.vecs[sigE - pre.from];
    if(!q) return { active:false, reason:'쿼리벡터 불가' };
    var X=[], y=[];
    for(var e=pre.from; e<=sigE-1; e++){
      var v = pre.vecs[e - pre.from];
      if(!v || e+1>last) continue;
      X.push(v); y.push(_isUp(rows[e+1]) ? 1 : 0);
    }
    if(X.length < MIN_TRAIN) return { active:false, reason:'학습표본 부족('+X.length+')' };
    // [과적합 가드] 라벨이 한쪽으로 완전히 쏠리면(전부 양봉/전부 음봉) 학습 의미 없음 — 비활성 처리
    var nUpLabel = y.reduce(function(a,b){return a+b;}, 0);
    if(nUpLabel === 0 || nUpLabel === y.length) return { active:false, reason:'학습라벨 편향(전부 동일)' };
    var std = _standardize(X);
    var model = _trainLR(std.Xs, y, opts);
    var qs = q.map(function(v,j){ return (v-std.mean[j])/std.std[j]; });
    var z = model.b; for(var j=0;j<qs.length;j++) z += model.w[j]*qs[j];
    if(z > 30) z = 30; else if(z < -30) z = -30;
    var prob = 1/(1+Math.exp(-z));
    var sc = Math.max(-100, Math.min(100, Math.round((prob-0.5)*200)));
    return { active:true, score:sc, prob:Math.round(prob*1000)/10, n:X.length, win:win };
  }

  // ── 라이브 단건: rows의 마지막 봉을 신호봉으로 예측 ──
  function score(rows, opts){
    opts = opts || {};
    var win = opts.win || WIN;
    if(!Array.isArray(rows) || rows.length < win + MIN_TRAIN + 1) return { active:false, reason:'데이터 부족' };
    var SK = self_or_window().SXKNN;
    if(!SK || !SK.buildVecs) return { active:false, reason:'SXKNN 미로드' };
    var pre = SK.buildVecs(rows, win);
    return scoreAt(rows, rows.length-1, pre, opts);
  }

  function self_or_window(){ return (typeof self !== 'undefined' ? self : window); }

  // [S656] 워커(importScripts)·메인스레드 양쪽 호환 (SXKNN과 동일 패턴)
  self_or_window().SXLR = { score:score, scoreAt:scoreAt, WIN:WIN, MIN_TRAIN:MIN_TRAIN };
})();
