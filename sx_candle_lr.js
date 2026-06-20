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

  // [S661] ADX 사전계산 배열 — 1회 O(n) 패스로 전체 adx 계산 (레짐 배열 생성 최적화용)
  function _adxArr(rows, period){
    var n=rows.length, out=new Array(n).fill(null);
    if(n<period+1) return out;
    var atr=0,pDM=0,mDM=0,adxVal=0,dxSeries=[];
    for(var i=1;i<=period;i++){
      var h=+rows[i].high-(+rows[i-1].high),l=(+rows[i-1].low)-(+rows[i].low);
      pDM+=(h>l&&h>0)?h:0; mDM+=(l>h&&l>0)?l:0;
      atr+=Math.max(+rows[i].high-(+rows[i].low),Math.abs(+rows[i].high-(+rows[i-1].close)),Math.abs(+rows[i].low-(+rows[i-1].close)));
    }
    var p0=atr>0?(pDM/atr)*100:0,m0=atr>0?(mDM/atr)*100:0;
    dxSeries.push((p0+m0)>0?Math.abs(p0-m0)/(p0+m0)*100:0);
    for(var i=period+1;i<n;i++){
      var h=+rows[i].high-(+rows[i-1].high),l=(+rows[i-1].low)-(+rows[i].low);
      var tr=Math.max(+rows[i].high-(+rows[i].low),Math.abs(+rows[i].high-(+rows[i-1].close)),Math.abs(+rows[i].low-(+rows[i-1].close)));
      atr=atr-atr/period+tr; pDM=pDM-pDM/period+((h>l&&h>0)?h:0); mDM=mDM-mDM/period+((l>h&&l>0)?l:0);
      var pI=atr>0?(pDM/atr)*100:0,mI=atr>0?(mDM/atr)*100:0;
      dxSeries.push((pI+mI)>0?Math.abs(pI-mI)/(pI+mI)*100:0);
      if(dxSeries.length>=period){
        if(adxVal===0){var s=0;for(var k=0;k<period;k++)s+=dxSeries[dxSeries.length-period+k];adxVal=s/period;}
        else adxVal=(adxVal*(period-1)+dxSeries[dxSeries.length-1])/period;
        out[i]=adxVal;
      }
    }
    return out;
  }
  function _regimeAt(rows,e,adxArr){
    if(!adxArr||e<60||adxArr[e]==null) return 'side';
    var s20=0;for(var k=e-19;k<=e;k++)s20+=+rows[k].close;var ma20=s20/20;
    var s60=0;for(var k=e-59;k<=e;k++)s60+=+rows[k].close;var ma60=s60/60;
    var adx=adxArr[e];
    if(adx<20) return 'side';
    if(ma20>=ma60) return adx>=35?'bull':'up';
    return 'down';
  }
  // [S661] 레짐 전환 임박 확률 — kNN+LR 동시 계산.
  //   crossDday와 구조 동일(라벨만 "레짐 전환 여부"로 변경). ADX 사전계산으로 최적화.
  //   비동기 호출 권장(캔들전이 카드 LR과 동일 패턴 — 렌더 블로킹 없이).
  function regimeFlip(rows,opts){
    opts=opts||{};
    var win=opts.win||16,maxLead=opts.maxLead||5,k=opts.k||10;
    var n=rows.length;
    if(!Array.isArray(rows)||n<60+win+maxLead+80) return {active:false,reason:'데이터 부족'};
    var SK=self_or_window().SXKNN;
    if(!SK||!SK.buildVecs) return {active:false,reason:'SXKNN 미로드'};
    var adxArr=_adxArr(rows,14);
    var pre=SK.buildVecs(rows,win);
    var li=n-1,curRegime=_regimeAt(rows,li,adxArr);
    var q=pre.vecs[li-pre.from];if(!q) return {active:false};
    var X=[],y=[],vecs=[];
    for(var e=Math.max(60,pre.from);e<=li-maxLead;e++){
      var v=pre.vecs[e-pre.from];if(!v) continue;
      var base=_regimeAt(rows,e,adxArr),flip=0;
      for(var j=1;j<=maxLead;j++){if(_regimeAt(rows,e+j,adxArr)!==base){flip=1;break;}}
      X.push(v);y.push(flip);vecs.push(v);
    }
    if(X.length<60) return {active:false,reason:'학습표본 부족('+X.length+')',currentRegime:curRegime};
    var nPos=y.reduce(function(a,b){return a+b;},0);
    if(nPos===0||nPos===y.length) return {active:false,reason:'학습라벨 편향',currentRegime:curRegime};
    // kNN
    var W=pre.W||null;
    var dl=[];
    for(var i=0;i<vecs.length;i++){
      var d=0;for(var t=0;t<q.length;t++){var df=(q[t]-vecs[i][t])*(W?W[t]:1);d+=df*df;}
      dl.push({d:d,lab:y[i]});
    }
    dl.sort(function(a,b){return a.d-b.d;});
    var kk=Math.min(k,dl.length),sc=Math.sqrt(dl[kk-1].d)||1e-6,wU=0,wA=0;
    for(var j=0;j<kk;j++){var dist=Math.sqrt(dl[j].d),w=Math.exp(-(dist*dist)/(2*sc*sc+1e-9));wA+=w;if(dl[j].lab)wU+=w;}
    var probKnn=wA>0?wU/wA:0;
    // LR
    var probLr=null;
    try{
      var std=_standardize(X),model=_trainLR(std.Xs,y,opts);
      var qs2=q.map(function(v2,j2){return (v2-std.mean[j2])/std.std[j2];});
      var z=model.b;for(var j4=0;j4<qs2.length;j4++)z+=model.w[j4]*qs2[j4];
      if(z>30)z=30;else if(z<-30)z=-30;
      probLr=Math.round((1/(1+Math.exp(-z)))*100);
    }catch(_e){probLr=null;}
    return {active:true,currentRegime:curRegime,probKnn:Math.round(probKnn*100),probLr:probLr,n:X.length};
  }


  function _smaArr(arr, period){
    var n = arr.length, out = new Array(n).fill(null), sum = 0;
    for(var i=0;i<n;i++){
      sum += arr[i];
      if(i>=period) sum -= arr[i-period];
      if(i>=period-1) out[i] = sum/period;
    }
    return out;
  }

  // [S659] 골든/데드크로스 임박(D-day) — SXKNN.crossDday와 동일한 MA수렴 게이트(해석적 선형추정)를 쓰되,
  //   "이 수렴 패턴이 실제로 N봉 내 교차로 이어지는지"를 kNN 투표 대신 LR 학습으로 검증.
  //   단기추세매매 카드의 기존 kNN D-day 예보(🔮)와 같은 자리에 병렬 보조 표시용 — BT 진입/청산 로직에는 미적용(정보 제공만).
  function crossDday(rows, opts){
    opts = opts || {};
    var s = opts.s||5, l = opts.l||9, win = opts.win||WIN, maxLead = opts.maxLead||3, maxBtc = opts.maxBtc||3.5, thr = (opts.thr!=null?opts.thr:0.5);
    if(!Array.isArray(rows)) return { active:false };
    var n = rows.length;
    if(n < win + MIN_TRAIN + maxLead) return { active:false, reason:'데이터 부족' };
    var close = []; for(var i=0;i<n;i++){ var c=rows[i]; close.push(_num(c.close!=null?c.close:c.c)); }
    var maS = _smaArr(close,s), maL = _smaArr(close,l), li = n-1;
    if(maS[li]==null||maL[li]==null||maS[li-1]==null||maL[li-1]==null) return { active:false };
    var gap = maS[li]-maL[li], conv = gap-(maS[li-1]-maL[li-1]), type=null, btc=0;
    if(gap<0 && conv>0){ type='gc'; btc=-gap/conv; }
    else if(gap>0 && conv<0){ type='dc'; btc=gap/(-conv); }
    else return { active:false };
    if(!(btc<=maxBtc)) return { active:false };

    var SK = self_or_window().SXKNN;
    if(!SK || !SK.buildVecs) return { active:false, reason:'SXKNN 미로드' };
    var pre = SK.buildVecs(rows, win);
    var q = pre.vecs[li - pre.from];
    if(!q) return { active:false };

    function _lab(e){
      for(var j=e+1;j<=e+maxLead;j++){
        if(j<1||j>=n) break;
        if(maS[j]==null||maL[j]==null||maS[j-1]==null||maL[j-1]==null) continue;
        if(type==='gc'){ if(maS[j]>maL[j]&&maS[j-1]<=maL[j-1]) return true; }
        else { if(maS[j]<maL[j]&&maS[j-1]>=maL[j-1]) return true; }
      }
      return false;
    }

    var X=[], y=[];
    for(var e=pre.from; e<=li-maxLead; e++){
      var v = pre.vecs[e-pre.from]; if(!v) continue;
      X.push(v); y.push(_lab(e) ? 1 : 0);
    }
    if(X.length < MIN_TRAIN) return { active:false, reason:'학습표본 부족('+X.length+')' };
    var nPos = y.reduce(function(a,b){return a+b;}, 0);
    if(nPos===0 || nPos===y.length) return { active:false, reason:'학습라벨 편향(전부 동일)' };

    var std = _standardize(X);
    var model = _trainLR(std.Xs, y, opts);
    var qs = q.map(function(v,j){ return (v-std.mean[j])/std.std[j]; });
    var z = model.b; for(var j=0;j<qs.length;j++) z += model.w[j]*qs[j];
    if(z > 30) z = 30; else if(z < -30) z = -30;
    var prob = 1/(1+Math.exp(-z));
    var dday = Math.max(1, Math.round(btc));
    if(prob < thr) return { active:false, type:type, dday:dday, prob:Math.round(prob*100) };
    return { active:true, type:type, dday:dday, prob:Math.round(prob*100), n:X.length };
  }

  function self_or_window(){ return (typeof self !== 'undefined' ? self : window); }

  // [S656] 워커(importScripts)·메인스레드 양쪽 호환 (SXKNN과 동일 패턴)
  // [S661] standardize/trainLR도 공개 — crossDday 외 다른 커스텀 라벨(예: 레짐 전환확률)에서도
  //   같은 학습 루틴 재사용 가능하게(피처 추출 중복 없는 것과 동일한 이유로 학습 코드도 중복 없게).
  self_or_window().SXLR = { score:score, scoreAt:scoreAt, crossDday:crossDday, regimeFlip:regimeFlip, standardize:_standardize, trainLR:_trainLR, WIN:WIN, MIN_TRAIN:MIN_TRAIN };
})();
