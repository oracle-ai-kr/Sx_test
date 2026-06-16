// ════════════════════════════════════════════════════════════════
//  sx_candle_knn.js  —  [S601] 캔들 전이 자기유사도 kNN  (실험)
//  목적: 최근 8봉을 정규화 피처벡터('이미지')로 인코딩 → 같은 종목 과거 8봉 창들 중
//        가장 유사한 k개를 찾아 그들의 '다음봉 색(양/음)' 결과로 점수를 낸다.
//        룰 기반 _candleTransitionScore(sx_render.js)의 '대안 점수 경로'.
//
//  ★ 예측 정확도 보장 아님 — 실험영역. 기존 SXCandleBT 미니 백테스트에 점수 경로로 합류시켜
//    '룰 vs kNN'을 같은 임계·같은 베이스라인에서 나란히 실측 비교하는 게 목적.
//
//  룩어헤드 없음:
//    · 각 창의 벡터는 그 창 끝(e)까지의 rows[e-7..e]만 사용 (인과적).
//    · 쿼리=신호봉 e의 벡터 / 후보=e' ≤ e-1 의 벡터, 후보 결과=rows[e'+1] (e'+1 ≤ e).
//    · buildVecs는 전체 rows의 창벡터를 1회 구축하지만, scoreAt이 인덱스로 후보를 e-1까지만
//      필터하므로 미래 창은 절대 후보/쿼리에 끼지 않음 (가속용 캐시일 뿐).
//
//  자기완결: rows(스크리너 포맷 {open,high,low,close,volume})만 필요. SXE/엔진 의존 없음.
//  피처(이미지3 사용자 요청 반영): 8봉 종가형태(z-score)·몸통·윗꼬리·아랫꼬리·상대거래량
//    + 컨텍스트(추세 방향·변동성 변화·지지/저항 위치·MA20/60 레짐·60봉 수익률)
//    + [S601 보강] 봉별 종가-MA5/MA9 갭(이평선 위/아래/사이 위치)·MA5-MA9 스프레드(크로스 상태)·창내 5×9 크로스(골든/데드).
//    + [S602 보강] 봉별 %B(밴드 내 위치: 상단/하단 완전이탈~미들)·BB 스퀴즈/확장·밴드워크·끝봉 몸통 밴드이탈.
//    → 단기추세매매(5×9) 구조와 정합. 벡터 8*win+10차원.
//    + [S603] 창 길이(win=8/12/16)·K(이웃수)를 파라미터화 — 백테스트 모달에서 토글로 A/B 비교. 가중치는 win에 맞춰 동적 생성.
//  로드 순서: sx_render.js 다음, sx_candle_bt.js 이전 (BT가 SXKNN을 호출).
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var WIN = 8;        // 패턴 창 길이 (8봉)
  var CTX = 20;       // 지지/저항 위치 산출 룩백
  var MIN_BANK = 40;  // 최소 후보 창 수 (미만이면 inactive — 자기유사도 표본 부족)
  var K = 25;         // 이웃 수

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _isUp(r){ return _num(r.close) >= _num(r.open); }
  // [S601] 특정 봉(idx)에서의 MA(len). 과거 부족 시 null (해당 갭은 0=중립으로 폴백).
  function _maAt(rows, idx, len){
    if(idx - len + 1 < 0) return null;
    var t = 0; for(var i = idx - len + 1; i <= idx; i++) t += _num(rows[i].close);
    return t / len;
  }
  // [S602] 특정 봉(idx)에서의 볼린저밴드(len,mult). 과거 부족 시 null.
  function _bbAt(rows, idx, len, mult){
    if(idx - len + 1 < 0) return null;
    var t = 0, i; for(i = idx - len + 1; i <= idx; i++) t += _num(rows[i].close);
    var mid = t / len, s = 0;
    for(i = idx - len + 1; i <= idx; i++){ var d = _num(rows[i].close) - mid; s += d * d; }
    var sd = Math.sqrt(s / len), w = 2 * mult * sd;   // width = upper-lower
    return { mid: mid, upper: mid + mult * sd, lower: mid - mult * sd, width: (w > 0 ? w : 1e-9) };
  }
  function _clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

  // ── 한 창(끝 인덱스 e)의 피처벡터 ──  (룩어헤드 없음: rows[e-(win-1)..e] + 컨텍스트 룩백만 사용)
  //   [S603] win=창 길이(기본 WIN=8). 반환: number[] (길이 8*win+10) 또는 null(데이터 부족)
  function _vec(rows, e, win){
    win = win || WIN;
    if(e < win - 1) return null;
    var s = e - win + 1, k, r;
    // 1) 정규화 종가 (창 z-score) — 추세 형태·방향, 가격 스케일 무관
    var cs = [], mean = 0;
    for(k=s;k<=e;k++){ var c=_num(rows[k].close); cs.push(c); mean+=c; }
    mean /= win;
    var sd = 0; for(k=0;k<win;k++){ var dd=cs[k]-mean; sd+=dd*dd; } sd=Math.sqrt(sd/win);
    if(sd<=0) sd=1e-9;
    var nc = cs.map(function(c){ return (c-mean)/sd; });
    // 2) 봉 형태(몸통·꼬리) + [S601] 봉별 MA5/MA9 갭(이평선 위/아래/사이) + [S602] 봉별 %B(밴드 내 위치)
    var body=[], uw=[], lw=[], vols=[], vmean=0, g5=[], g9=[], pctb=[];
    for(k=s;k<=e;k++){
      r=rows[k];
      var o=_num(r.open),h=_num(r.high),l=_num(r.low),c2=_num(r.close);
      var rng=h-l; if(rng<=0) rng=1e-9;
      body.push((c2-o)/rng);
      uw.push((h-Math.max(o,c2))/rng);
      lw.push((Math.min(o,c2)-l)/rng);
      var v=_num(r.volume); vols.push(v); vmean+=v;
      var m5=_maAt(rows,k,5), m9=_maAt(rows,k,9), cc=(c2>0?c2:1e-9);
      g5.push(m5!=null ? (c2-m5)/cc : 0);
      g9.push(m9!=null ? (c2-m9)/cc : 0);
      var bbk=_bbAt(rows,k,20,2);
      pctb.push(bbk ? _clamp((c2-bbk.lower)/bbk.width, -1, 2) : 0.5);
    }
    vmean/=win; if(vmean<=0) vmean=1e-9;
    var vr = vols.map(function(v){ return Math.log((v/vmean)+1e-6); });   // 3) 상대 거래량
    // 4) 컨텍스트 단일값들
    var f3=(cs[0]+cs[1]+cs[2])/3, b3=(cs[win-1]+cs[win-2]+cs[win-3])/3;   // 4a) 추세 방향
    var trend=(b3-f3)/sd;
    var avgRng = function(a,b){ var t=0,nn=0; for(var i=a;i<=b;i++){ var rr=rows[i]; t+=(_num(rr.high)-_num(rr.low)); nn++; } return nn?t/nn:0; };
    var rNew=avgRng(e-3,e), rOld=avgRng(s,s+3);                            // 4b) 변동성 변화
    var volChg = rOld>0 ? Math.log((rNew/rOld)+1e-6) : 0;
    var cb=Math.max(0,e-CTX+1), hi=-Infinity, lo=Infinity;                 // 4c) 지지/저항 위치
    for(k=cb;k<=e;k++){ var hh=_num(rows[k].high),ll=_num(rows[k].low); if(hh>hi)hi=hh; if(ll<lo)lo=ll; }
    var srPos = (hi>lo) ? (_num(rows[e].close)-lo)/(hi-lo) : 0.5;
    var ma = function(len){ if(e-len+1<0) return null; var t=0; for(var i=e-len+1;i<=e;i++) t+=_num(rows[i].close); return t/len; };
    var ma20=ma(20), ma60=ma(60);                                         // 4d) 레짐
    var maRatio = (ma20!=null&&ma60!=null&&ma60>0) ? (ma20/ma60-1) : 0;
    var ret60 = (e-60>=0 && _num(rows[e-60].close)>0) ? (_num(rows[e].close)/_num(rows[e-60].close)-1) : 0;
    var m5e=_maAt(rows,e,5), m9e=_maAt(rows,e,9), ce=(_num(rows[e].close)||1e-9);   // 4e) MA5/9 스프레드·크로스
    var ma59Spread = (m5e!=null&&m9e!=null) ? (m5e-m9e)/ce : 0;
    var cross59 = 0, prevDiff = null;
    for(k=s;k<=e;k++){
      var a5=_maAt(rows,k,5), a9=_maAt(rows,k,9);
      if(a5==null||a9==null){ prevDiff=null; continue; }
      var diff=a5-a9;
      if(prevDiff!=null){ if(prevDiff<=0 && diff>0) cross59=1; else if(prevDiff>0 && diff<=0) cross59=-1; }
      prevDiff=diff;
    }
    var bbE=_bbAt(rows,e,20,2);                                            // 4f) BB 스퀴즈/확장·밴드워크·몸통이탈
    var bbWidthState=0, bandWalk=0, bodyBreak=0;
    if(bbE){
      var wSum=0, wN=0;
      for(k=Math.max(0,e-CTX+1);k<=e;k++){ var bk=_bbAt(rows,k,20,2); if(bk){ wSum+=bk.width; wN++; } }
      var wAvg = wN? wSum/wN : bbE.width;
      bbWidthState = wAvg>0 ? Math.log((bbE.width/wAvg)+1e-6) : 0;
      var up=0, dn=0, wk=Math.min(5,win);
      for(k=win-wk;k<win;k++){ if(pctb[k]>=0.8) up++; else if(pctb[k]<=0.2) dn++; }
      bandWalk = (up-dn)/wk;
      var oE=_num(rows[e].open), cE=_num(rows[e].close), bHi=Math.max(oE,cE), bLo=Math.min(oE,cE);
      if(bHi>bbE.upper) bodyBreak = _clamp((bHi-bbE.upper)/bbE.width, 0, 1);
      else if(bLo<bbE.lower) bodyBreak = -_clamp((bbE.lower-bLo)/bbE.width, 0, 1);
    }
    // ── 벡터 조립 (per-bar 블록은 win 길이, 가중치는 _dist2에서 _W(win) 적용) ──
    var out = [];
    for(k=0;k<win;k++) out.push(nc[k]);    // 형태(종가 z)
    for(k=0;k<win;k++) out.push(body[k]);  // 몸통
    for(k=0;k<win;k++) out.push(uw[k]);    // 윗꼬리
    for(k=0;k<win;k++) out.push(lw[k]);    // 아랫꼬리
    for(k=0;k<win;k++) out.push(vr[k]);    // 상대거래량
    out.push(trend, volChg, srPos, maRatio, ret60);   // 추세·변동성·지지저항·MA20/60·60봉수익
    for(k=0;k<win;k++) out.push(g5[k]);    // 봉별 종가-MA5 갭
    for(k=0;k<win;k++) out.push(g9[k]);    // 봉별 종가-MA9 갭
    out.push(ma59Spread, cross59);         // MA5-9 스프레드·크로스
    for(k=0;k<win;k++) out.push(pctb[k]);  // 봉별 %B
    out.push(bbWidthState, bandWalk, bodyBreak);   // 스퀴즈/확장·밴드워크·몸통이탈
    return out;
  }

  // [S603] 차원별 가중치 — win 길이에 맞춰 동적 생성·캐시. per-bar 블록은 win개씩, 컨텍스트는 단일.
  var _Wcache = {};
  function _W(win){
    if(_Wcache[win]) return _Wcache[win];
    var w=[], i;
    for(i=0;i<win;i++) w.push(1.0);   // 종가형태
    for(i=0;i<win;i++) w.push(0.6);   // 몸통
    for(i=0;i<win;i++) w.push(0.4);   // 윗꼬리
    for(i=0;i<win;i++) w.push(0.4);   // 아랫꼬리
    for(i=0;i<win;i++) w.push(0.5);   // 거래량
    w.push(3.0, 2.0, 3.0, 2.5, 2.0);  // 추세·변동성·지지저항·MA20/60·60봉수익
    for(i=0;i<win;i++) w.push(0.7);   // [S601] 봉별 MA5 갭
    for(i=0;i<win;i++) w.push(0.7);   // [S601] 봉별 MA9 갭
    w.push(2.5, 2.5);                 // [S601] MA5-9 스프레드·크로스
    for(i=0;i<win;i++) w.push(0.55);  // [S602] 봉별 %B
    w.push(2.0, 2.0, 1.5);            // [S602] 스퀴즈/확장·밴드워크·몸통이탈
    _Wcache[win] = w; return w;
  }

  function _dist2(a,b,W){
    var s=0, n=a.length;
    for(var i=0;i<n;i++){ var d=(a[i]-b[i])*W[i]; s+=d*d; }
    return s;
  }

  // ── 전체 rows의 모든 창벡터를 1회 구축 (백테스트 가속 캐시) ──  [S603] win 파라미터화
  //   인과적: vecs[e-from] = 창(끝 e) 벡터, rows[e-(win-1)..e]만 사용. 미래 누수는 scoreAt 인덱스 필터가 차단.
  function buildVecs(rows, win){
    win = win || WIN;
    var from=win-1, last=rows.length-1, vecs=[];
    for(var e=from;e<=last;e++) vecs.push(_vec(rows,e,win));
    return { from:from, vecs:vecs, win:win, W:_W(win) };
  }

  // ── 신호봉 sigE에서 kNN 예측 ──  pre=buildVecs 결과(없으면 내부 1회 구축). opts.win·opts.k 지원.
  //   쿼리=창(끝 sigE) / 후보=e'∈[win-1, sigE-1], 결과=isUp(rows[e'+1]). 룩어헤드 없음.
  function scoreAt(rows, sigE, pre, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { active:false, reason:'데이터 없음' };
    if(!pre) pre = buildVecs(rows, opts.win);
    var last = rows.length-1, win = pre.win, W = pre.W;
    if(sigE < win-1 || sigE > last) return { active:false, reason:'인덱스 범위 밖' };
    var q = pre.vecs[sigE - pre.from];
    if(!q) return { active:false, reason:'쿼리벡터 불가' };
    var cand=[];
    for(var e=win-1;e<=sigE-1;e++){
      var v=pre.vecs[e - pre.from]; if(!v) continue;
      cand.push({ d:_dist2(q,v,W), up:_isUp(rows[e+1]) });
    }
    if(cand.length < MIN_BANK) return { active:false, reason:'후보 부족('+cand.length+')' };
    cand.sort(function(a,b){ return a.d-b.d; });
    var k = Math.min(opts.k || K, cand.length);
    // 거리가중 투표 (가우시안, 스케일=k번째 이웃 거리)
    var scale = Math.sqrt(cand[k-1].d) || 1e-6;
    var wUp=0, wAll=0, nUp=0;
    for(var j=0;j<k;j++){
      var dist=Math.sqrt(cand[j].d);
      var w=Math.exp(-(dist*dist)/(2*scale*scale + 1e-9));
      wAll+=w; if(cand[j].up){ wUp+=w; nUp++; }
    }
    var upFrac = wAll>0 ? wUp/wAll : 0.5;
    var sc = Math.max(-100, Math.min(100, Math.round((upFrac-0.5)*200)));
    return {
      active:true, score:sc, upFrac:Math.round(upFrac*1000)/10,
      k:k, nUp:nUp, nDn:k-nUp, bank:cand.length, win:win,
      nearDist:Math.round(Math.sqrt(cand[0].d)*1000)/1000
    };
  }

  // ── 라이브 단건: rows의 마지막 봉을 쿼리로 예측 ──  opts.win·opts.k 지원
  function score(rows, opts){
    opts = opts || {};
    var win = opts.win || WIN;
    if(!Array.isArray(rows) || rows.length < win + MIN_BANK) return { active:false, reason:'데이터 부족' };
    var pre = buildVecs(rows, win);
    return scoreAt(rows, rows.length-1, pre, opts);
  }

  window.SXKNN = { score:score, scoreAt:scoreAt, buildVecs:buildVecs, _vec:_vec, WIN:WIN, K:K, MIN_BANK:MIN_BANK, WINS:[8,12,16], KS:[10,25,50] };
})();
