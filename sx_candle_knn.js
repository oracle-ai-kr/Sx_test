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
//    → 단기추세매매(5×9) 구조와 정합. 벡터 74차원.
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

  // ── 한 창(끝 인덱스 e)의 피처벡터 ──  (룩어헤드 없음: rows[e-7..e] + 컨텍스트 룩백만 사용)
  //   반환: number[] (길이 45) 또는 null(데이터 부족)
  function _vec(rows, e){
    if(e < WIN - 1) return null;
    var s = e - WIN + 1, k, r;
    // 1) 정규화 종가 (창 z-score) — 추세 형태·방향, 가격 스케일 무관
    var cs = [], mean = 0;
    for(k=s;k<=e;k++){ var c=_num(rows[k].close); cs.push(c); mean+=c; }
    mean /= WIN;
    var sd = 0; for(k=0;k<WIN;k++){ var dd=cs[k]-mean; sd+=dd*dd; } sd=Math.sqrt(sd/WIN);
    if(sd<=0) sd=1e-9;
    var nc = cs.map(function(c){ return (c-mean)/sd; });
    // 2) 봉 형태 (몸통·윗꼬리·아랫꼬리, 부호 포함 — 전부 scale-free [0~1, 몸통은 -1~1])
    //    + [S601] 봉별 MA5/MA9 상대갭: (종가-MAx)/종가. 부호=이평선 위/아래, 두 부호 엇갈림=이평선 '사이'. scale-free.
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
      // [S602] 봉별 %B = 밴드 내 위치. >1 상단완전이탈 · 0.5 미들 · <0 하단완전이탈. 클램프[-1,2].
      var bbk=_bbAt(rows,k,20,2);
      pctb.push(bbk ? _clamp((c2-bbk.lower)/bbk.width, -1, 2) : 0.5);
    }
    vmean/=WIN; if(vmean<=0) vmean=1e-9;
    // 3) 상대 거래량 (거래량 증가 여부) — log 안정화
    var vr = vols.map(function(v){ return Math.log((v/vmean)+1e-6); });
    // 4) 컨텍스트 — 단일값들 (사용자 요청 축)
    // 4a) 추세 방향: (뒤3 평균 - 앞3 평균)/sd
    var f3=(cs[0]+cs[1]+cs[2])/3, b3=(cs[WIN-1]+cs[WIN-2]+cs[WIN-3])/3;
    var trend=(b3-f3)/sd;
    // 4b) 변동성 변화: 최근4 평균레인지 / 이전4 평균레인지 (log)
    var avgRng = function(a,b){ var t=0,nn=0; for(var i=a;i<=b;i++){ var rr=rows[i]; t+=(_num(rr.high)-_num(rr.low)); nn++; } return nn?t/nn:0; };
    var rNew=avgRng(e-3,e), rOld=avgRng(s,s+3);
    var volChg = rOld>0 ? Math.log((rNew/rOld)+1e-6) : 0;
    // 4c) 지지/저항 위치: 최근 CTX봉 고저 레인지 내 현재 종가 위치 (0=저점,1=고점)
    var cb=Math.max(0,e-CTX+1), hi=-Infinity, lo=Infinity;
    for(k=cb;k<=e;k++){ var hh=_num(rows[k].high),ll=_num(rows[k].low); if(hh>hi)hi=hh; if(ll<lo)lo=ll; }
    var srPos = (hi>lo) ? (_num(rows[e].close)-lo)/(hi-lo) : 0.5;
    // 4d) 시장 상태(레짐 근사): MA20/MA60 괴리 + 60봉 수익률 (rows 충분할 때만, 아니면 0)
    var ma = function(len){ if(e-len+1<0) return null; var t=0; for(var i=e-len+1;i<=e;i++) t+=_num(rows[i].close); return t/len; };
    var ma20=ma(20), ma60=ma(60);
    var maRatio = (ma20!=null&&ma60!=null&&ma60>0) ? (ma20/ma60-1) : 0;
    var ret60 = (e-60>=0 && _num(rows[e-60].close)>0) ? (_num(rows[e].close)/_num(rows[e-60].close)-1) : 0;
    // 4e) [S601] 단기 MA5/MA9 — 끝봉 스프레드(현재 크로스 상태) + 창 내 크로스 이벤트(골든+1/데드-1/없음0)
    var m5e=_maAt(rows,e,5), m9e=_maAt(rows,e,9), ce=(_num(rows[e].close)||1e-9);
    var ma59Spread = (m5e!=null&&m9e!=null) ? (m5e-m9e)/ce : 0;   // +면 MA5>MA9(단기 상방 정배열)
    var cross59 = 0, prevDiff = null;
    for(k=s;k<=e;k++){
      var a5=_maAt(rows,k,5), a9=_maAt(rows,k,9);
      if(a5==null||a9==null){ prevDiff=null; continue; }
      var diff=a5-a9;
      if(prevDiff!=null){ if(prevDiff<=0 && diff>0) cross59=1; else if(prevDiff>0 && diff<=0) cross59=-1; } // 창 내 마지막 크로스 방향
      prevDiff=diff;
    }
    // 4f) [S602] 볼린저밴드 — 끝봉 기준 스퀴즈/확장 상태 + 밴드워크 + 몸통이탈
    var bbE=_bbAt(rows,e,20,2);
    var bbWidthState=0, bandWalk=0, bodyBreak=0;
    if(bbE){
      // 스퀴즈(음)/확장(양): 현재 밴드폭 vs 최근 CTX봉 평균 밴드폭 (log)
      var wSum=0, wN=0;
      for(k=Math.max(0,e-CTX+1);k<=e;k++){ var bk=_bbAt(rows,k,20,2); if(bk){ wSum+=bk.width; wN++; } }
      var wAvg = wN? wSum/wN : bbE.width;
      bbWidthState = wAvg>0 ? Math.log((bbE.width/wAvg)+1e-6) : 0;
      // 밴드워크: 최근 5봉 중 상단주행(%B≥0.8)−하단주행(%B≤0.2) 비율 [-1~1]
      var up=0, dn=0, wk=Math.min(5,WIN);
      for(k=WIN-wk;k<WIN;k++){ if(pctb[k]>=0.8) up++; else if(pctb[k]<=0.2) dn++; }
      bandWalk = (up-dn)/wk;
      // 몸통이탈: 끝봉 몸통이 밴드 밖으로 나간 정도 (상단+ / 하단−). 꼬리만 삐친 건 제외(몸통 기준).
      var oE=_num(rows[e].open), cE=_num(rows[e].close), bHi=Math.max(oE,cE), bLo=Math.min(oE,cE);
      if(bHi>bbE.upper) bodyBreak = _clamp((bHi-bbE.upper)/bbE.width, 0, 1);
      else if(bLo<bbE.lower) bodyBreak = -_clamp((bbE.lower-bLo)/bbE.width, 0, 1);
    }

    // ── 벡터 조립 (가중치는 _dist2에서 _W로 적용) ──
    var out = [];
    for(k=0;k<WIN;k++) out.push(nc[k]);    // 0..7   형태(종가 z)
    for(k=0;k<WIN;k++) out.push(body[k]);  // 8..15  몸통
    for(k=0;k<WIN;k++) out.push(uw[k]);    // 16..23 윗꼬리
    for(k=0;k<WIN;k++) out.push(lw[k]);    // 24..31 아랫꼬리
    for(k=0;k<WIN;k++) out.push(vr[k]);    // 32..39 상대거래량
    out.push(trend);    // 40 추세 방향
    out.push(volChg);   // 41 변동성 변화
    out.push(srPos);    // 42 지지/저항 위치
    out.push(maRatio);  // 43 레짐(MA20/60 괴리)
    out.push(ret60);    // 44 레짐(60봉 수익률)
    for(k=0;k<WIN;k++) out.push(g5[k]);    // 45..52 봉별 종가-MA5 갭 (단기 이평선 위/아래/사이)
    for(k=0;k<WIN;k++) out.push(g9[k]);    // 53..60 봉별 종가-MA9 갭
    out.push(ma59Spread); // 61 끝봉 MA5-MA9 스프레드 (현재 단기 크로스 상태)
    out.push(cross59);    // 62 창 내 MA5×MA9 크로스 이벤트 (골든+1/데드-1/없음0)
    for(k=0;k<WIN;k++) out.push(pctb[k]);  // 63..70 봉별 %B (밴드 내 위치: 상단이탈~미들~하단이탈)
    out.push(bbWidthState); // 71 BB 스퀴즈(음)/확장(양) — 현재폭 vs 최근평균폭
    out.push(bandWalk);     // 72 밴드워크 (상단주행+ / 하단주행−)
    out.push(bodyBreak);    // 73 끝봉 몸통 밴드이탈 (상단+ / 하단−)
    return out;
  }

  // 차원별 가중치 — 형태/거래량은 봉당 분산이라 항당 가중↓, 컨텍스트는 단일값이라 ↑
  var _W = (function(){
    var w=[], i;
    for(i=0;i<WIN;i++) w.push(1.0);  // 종가형태
    for(i=0;i<WIN;i++) w.push(0.6);  // 몸통
    for(i=0;i<WIN;i++) w.push(0.4);  // 윗꼬리
    for(i=0;i<WIN;i++) w.push(0.4);  // 아랫꼬리
    for(i=0;i<WIN;i++) w.push(0.5);  // 거래량
    w.push(3.0);  // 추세
    w.push(2.0);  // 변동성변화
    w.push(3.0);  // 지지/저항
    w.push(2.5);  // MA20/60 레짐
    w.push(2.0);  // 60봉수익
    for(i=0;i<WIN;i++) w.push(0.7);  // [S601] 봉별 종가-MA5 갭
    for(i=0;i<WIN;i++) w.push(0.7);  // [S601] 봉별 종가-MA9 갭
    w.push(2.5);  // [S601] MA5-MA9 스프레드(현재 크로스 상태)
    w.push(2.5);  // [S601] MA5×MA9 크로스 이벤트
    for(i=0;i<WIN;i++) w.push(0.55); // [S602] 봉별 %B (밴드 내 위치)
    w.push(2.0);  // [S602] BB 스퀴즈/확장
    w.push(2.0);  // [S602] 밴드워크
    w.push(1.5);  // [S602] 몸통 밴드이탈
    return w;
  })();

  function _dist2(a,b){
    var s=0, n=a.length;
    for(var i=0;i<n;i++){ var d=(a[i]-b[i])*_W[i]; s+=d*d; }
    return s;
  }

  // ── 전체 rows의 모든 창벡터를 1회 구축 (백테스트 가속 캐시) ──
  //   인과적: vecs[e-from] = 창(끝 e) 벡터, rows[e-7..e]만 사용. 미래 누수는 scoreAt 인덱스 필터가 차단.
  function buildVecs(rows){
    var from=WIN-1, last=rows.length-1, vecs=[];
    for(var e=from;e<=last;e++) vecs.push(_vec(rows,e));
    return { from:from, vecs:vecs };
  }

  // ── 신호봉 sigE에서 kNN 예측 ──  pre=buildVecs 결과(없으면 내부 1회 구축)
  //   쿼리=창(끝 sigE) / 후보=e'∈[WIN-1, sigE-1], 결과=isUp(rows[e'+1]). 룩어헤드 없음.
  function scoreAt(rows, sigE, pre, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { active:false, reason:'데이터 없음' };
    var last = rows.length-1;
    if(sigE < WIN-1 || sigE > last) return { active:false, reason:'인덱스 범위 밖' };
    if(!pre) pre = buildVecs(rows);
    var q = pre.vecs[sigE - pre.from];
    if(!q) return { active:false, reason:'쿼리벡터 불가' };
    var cand=[];
    for(var e=WIN-1;e<=sigE-1;e++){
      var v=pre.vecs[e - pre.from]; if(!v) continue;
      cand.push({ d:_dist2(q,v), up:_isUp(rows[e+1]) });
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
      k:k, nUp:nUp, nDn:k-nUp, bank:cand.length,
      nearDist:Math.round(Math.sqrt(cand[0].d)*1000)/1000
    };
  }

  // ── 라이브 단건: rows의 마지막 봉을 쿼리로 예측 ──
  function score(rows, opts){
    if(!Array.isArray(rows) || rows.length < WIN + MIN_BANK) return { active:false, reason:'데이터 부족' };
    var pre = buildVecs(rows);
    return scoreAt(rows, rows.length-1, pre, opts);
  }

  window.SXKNN = { score:score, scoreAt:scoreAt, buildVecs:buildVecs, _vec:_vec, WIN:WIN, K:K, MIN_BANK:MIN_BANK };
})();
