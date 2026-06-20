// ════════════════════════════════════════════════════════════════
//  sx_chart_predict.js  —  [S663] 차트예측 (라인형태 kNN 아날로그)  (실험)
//  목적: 증권플러스 '차트예측' 모방. 최근 win봉 확정 종가를 z정규화한 '라인 형태'로
//        인코딩 → 같은 종목 과거에서 형태가 가장 닮은 K개 구간(아날로그)을 찾아,
//        그들의 '이후 H봉 경로'를 모아 상승확률·평균/최대/최소수익·분포·예상경로를 낸다.
//
//  ★ 예측 정확도 보장 아님 — 실험·서술용. 단정 톤 금지(분포를 '보여주는' 게 목적).
//    BT 진입/청산·C 슈퍼바이저에 미반영(정보 제공만). [실험] 라벨 유지.
//
//  피처(=B안): 종가 z-score 시퀀스(win차원)만. 캔들구조/거래량/레짐 미포함 →
//        '라인이 실제로 닮은' 이웃만 매칭(오버레이가 시각적으로 일치). 가중치 전부 1.0이라
//        SXKNN.buildVecs(138차원·컨텍스트 가중 2~3)와 의도적으로 다름(용도 분리).
//
//  룩어헤드 없음:
//    · 쿼리 = 최근 win봉(끝 li=n-1). 후보 = 끝 e'인 구간, e' ≤ li - max(win,H).
//        → 후보창은 쿼리창보다 '먼저' 끝나고(겹침방지), 후보의 forward H봉(e'+1..e'+H)도
//           전부 li 이전 → 미래 누수 0.
//    · 아날로그 중복방지: 거리순 그리디로 서로 GAP봉 이상 떨어진 것만 채택
//        (인접창 종가공유로 같은 에피소드에 K개가 쏠려 분포가 가짜로 모이는 것 차단).
//
//  표본 게이트: 채택된 '서로 구분되는' 유효 아날로그가 MIN_N개 미만이면 active:false.
//        (신규상장/단기이력/평탄구간은 자동 비활성 — 과신 카드 방지.)
//
//  자기완결: rows( {open?,high?,low?,close,date?} )의 close만 사용. SXE/SXKNN/엔진 의존 없음.
//  로드 순서: 독립(아무 곳). 카드는 sx_render.js에서 SXCP.predict 호출.
//  node 호환: globalThis 폴백(브라우저/워커는 self, node는 globalThis).
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // 기본 파라미터 ([S663] 사용자 결정: win20=MA20 정합 / H10 / K10 / 표본 ≥10)
  var WIN = 20;   // 쿼리·후보 창 길이 (MA20 정합)
  var H   = 10;   // 예측 지평(이후 봉 수)
  var K   = 10;   // 표시·집계할 아날로그 수(증권플러스 '10개')
  var MIN_N = 10; // 이 미만이면 비활성 (win/loss 표본 부족)
  var GAP = 10;   // 아날로그 간 최소 간격(봉) — 종가공유 50%↓로 에피소드 구분

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _close(r){ return _num(r && (r.close != null ? r.close : r.c)); }

  // 한 구간(끝 e)의 z정규화 종가벡터(win차원). 데이터부족/완전평탄 시 null.
  function _shapeVec(closes, e, win){
    if(e < win - 1) return null;
    var s = e - win + 1, i, mean = 0;
    for(i = s; i <= e; i++) mean += closes[i];
    mean /= win;
    var sd = 0; for(i = s; i <= e; i++){ var d = closes[i] - mean; sd += d * d; }
    sd = Math.sqrt(sd / win);
    if(sd <= 0) return null;             // 평탄 → 형태 없음
    var v = new Array(win);
    for(i = 0; i < win; i++) v[i] = (closes[s + i] - mean) / sd;
    return v;
  }

  // 형태거리(가중치 전부 1.0 → 순수 라인형태 L2제곱)
  function _dist(a, b){ var s = 0, n = a.length; for(var i = 0; i < n; i++){ var d = a[i] - b[i]; s += d * d; } return s; }

  // ── 구조 피처(유사도% 보강용) — MA배열·크로스·BB형태/위치·캔들위치 ──  [S663]
  //   ★ 선택(아날로그 탐색)은 형태(z종가)만 사용. 구조는 '표시 유사도%'에만 반영해
  //     라인 매칭의 시각적 일관성(오버레이가 닮아 보임)을 보존하면서 % 신뢰도만 높인다.
  function _maC(closes, e, len){ if(e-len+1<0) return null; var t=0; for(var i=e-len+1;i<=e;i++) t+=closes[i]; return t/len; }
  function _bbC(closes, e, len, mult){
    if(e-len+1<0) return null; var t=0,i; for(i=e-len+1;i<=e;i++) t+=closes[i];
    var m=t/len, sd=0; for(i=e-len+1;i<=e;i++){ var d=closes[i]-m; sd+=d*d; } sd=Math.sqrt(sd/len);
    return { mid:m, lo:m-mult*sd, w:(2*mult*sd)||1e-9 };
  }
  // 한 구간(끝 e)의 구조 상태. ohlc=원본 rows(캔들위치 high/low용). 과거부족 필드는 중립 폴백.
  function _structFeat(closes, ohlc, e, win){
    var s=e-win+1, k;
    var ma5=_maC(closes,e,5), ma20=_maC(closes,e,20), ma60=_maC(closes,e,60);
    var align=0;                                          // MA배열: 정배열(+2)~역배열(-2)
    if(ma5!=null&&ma20!=null) align += (ma5>=ma20?1:-1);
    if(ma20!=null&&ma60!=null) align += (ma20>=ma60?1:-1);
    var a05=_maC(closes,s,5), a020=_maC(closes,s,20), cross=0;   // 크로스: 윈도우 내 5/20 교차
    if(a05!=null&&a020!=null&&ma5!=null&&ma20!=null){ var d0=a05-a020, d1=ma5-ma20; if(d0<=0&&d1>0)cross=1; else if(d0>0&&d1<=0)cross=-1; }
    var bb=_bbC(closes,e,20,2), c=closes[e];               // BB: %B(위치) + 폭/가격(형태)
    var pctB = bb ? Math.max(-0.5, Math.min(1.5, (c-bb.lo)/bb.w)) : 0.5;
    var bbW  = bb ? bb.w/(bb.mid||1e-9) : 0;
    var hi=-Infinity, lo=Infinity;                         // 캔들위치: 최근 win 범위 내 종가 위치
    for(k=s;k<=e;k++){ var rr=ohlc&&ohlc[k]; var h=+(rr&&rr.high!=null?rr.high:closes[k]); var l=+(rr&&rr.low!=null?rr.low:closes[k]); if(h>hi)hi=h; if(l<lo)lo=l; }
    var srPos = (hi>lo)?(c-lo)/(hi-lo):0.5;
    return { align:align, cross:cross, pctB:pctB, bbW:bbW, srPos:srPos };
  }
  // 두 구간 구조 일치도 0~1 (MA배열 .30 / 크로스 .20 / %B .25 / BB폭 .10 / 캔들위치 .15)
  function _structSim(q, a){
    var alignA = 1 - Math.min(1, Math.abs(q.align-a.align)/2);
    var crossA = (q.cross===a.cross) ? 1 : (q.cross===0||a.cross===0) ? 0.5 : 0;
    var pctA   = 1 - Math.min(1, Math.abs(q.pctB-a.pctB));
    var wA     = 1 - Math.min(1, Math.abs(Math.log((q.bbW+1e-6)/(a.bbW+1e-6))));
    var srA    = 1 - Math.min(1, Math.abs(q.srPos-a.srPos));
    return 0.30*alignA + 0.20*crossA + 0.25*pctA + 0.10*wA + 0.15*srA;
  }

  // 증권플러스 분포 구간 (비율 입력, 0.03 = +3%)
  var BIN_LABELS = ['5% ~', '2% ~ 5%', '0% ~ 2%', '-2% ~ 0%', '-5% ~ -2%', '~ -5%'];
  function _binIdx(ret){
    var p = ret * 100;
    if(p > 5)  return 0;
    if(p > 2)  return 1;
    if(p > 0)  return 2;
    if(p > -2) return 3;
    if(p > -5) return 4;
    return 5;
  }

  function _median(arr){
    if(!arr.length) return 0;
    var a = arr.slice().sort(function(x, y){ return x - y; }), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // ── 메인: 최근 win봉을 쿼리로 과거 아날로그 K개 → forward 분포 ──
  function predict(rows, opts){
    opts = opts || {};
    var win = opts.win || WIN, h = opts.h || H, k = opts.k || K,
        minN = opts.minN || MIN_N, gap = (opts.gap != null ? opts.gap : GAP);

    if(!Array.isArray(rows)) return { active:false, reason:'데이터 없음' };
    var n = rows.length;
    if(n < 2 * win + h) return { active:false, reason:'데이터 부족(' + n + ')' };

    var closes = new Array(n); for(var t = 0; t < n; t++) closes[t] = _close(rows[t]);
    var li = n - 1;

    var q = _shapeVec(closes, li, win);
    if(!q) return { active:false, reason:'쿼리형태 불가(평탄)' };

    // 후보: 끝 e' ∈ [win-1, li - max(win,h)]  (쿼리창 비겹침 + forward 정의 보장)
    var hi = li - Math.max(win, h), cand = [];
    for(var e = win - 1; e <= hi; e++){
      var v = _shapeVec(closes, e, win); if(!v) continue;
      cand.push({ e:e, d:_dist(q, v) });
    }
    if(cand.length < minN) return { active:false, reason:'후보 부족(' + cand.length + ')' };
    cand.sort(function(a, b){ return a.d - b.d; });

    // 그리디 비겹침(서로 gap봉 이상) 채택 → 서로 구분되는 가장 닮은 K개
    var picked = [];
    for(var i = 0; i < cand.length && picked.length < k; i++){
      var ce = cand[i].e, ok = true;
      for(var j = 0; j < picked.length; j++){ if(Math.abs(ce - picked[j].e) < gap){ ok = false; break; } }
      if(ok) picked.push(cand[i]);
    }
    if(picked.length < minN) return { active:false, reason:'유사패턴 부족(' + picked.length + '<' + minN + ')' };

    // 쿼리 구조 피처(1회) — 표시 유사도% 보강용
    var qf = _structFeat(closes, rows, li, win);
    var wShape = (opts.wShape != null ? opts.wShape : 0.55);   // 형태:구조 가중(나머지=구조)
    var simRef = opts.simRef || 1.35;                          // 형태% 절대척도 기준(z-RMSE '무관'≈√2)

    // 아날로그별 forward 경로 + 최종수익 + 구간내 최대낙폭 + 종합 유사도%
    var analogs = [], rets = [], bins = [0,0,0,0,0,0], up = 0;
    for(var p = 0; p < picked.length; p++){
      var pe = picked[p].e, base = closes[pe]; if(base <= 0) continue;
      var path = new Array(h + 1); path[0] = 0;
      var dd = 0;
      for(var s = 1; s <= h; s++){ var rr = closes[pe + s] / base - 1; path[s] = rr; if(rr < dd) dd = rr; }
      var fin = path[h];
      rets.push(fin); if(fin > 0) up++; bins[_binIdx(fin)]++;
      // 형태% = z-RMSE 절대매핑(0%=무관 / 100%=동일, 종목 간 비교 가능). 구조% = MA/크로스/BB/캔들 일치.
      var rmse = Math.sqrt(picked[p].d / win);
      var simShape = Math.max(0, Math.min(1, 1 - rmse / simRef));
      var simStruct = _structSim(qf, _structFeat(closes, rows, pe, win));
      var comp = wShape * simShape + (1 - wShape) * simStruct;
      analogs.push({
        e:pe, date:(rows[pe] && rows[pe].date) || null,
        sim: Math.round(comp * 100), simShape: Math.round(simShape * 100), simStruct: Math.round(simStruct * 100),
        ret:Math.round(fin * 1000) / 10, maxDD:Math.round(dd * 1000) / 10, path:path
      });
    }
    var nA = analogs.length;
    if(nA < minN) return { active:false, reason:'유효 아날로그 부족(' + nA + ')' };

    // 중앙값 경로(오버레이 굵은선) — t별 median. 드로잉 전용이라 raw 비율 유지(반올림 X, 정밀도 보존).
    var medPath = new Array(h + 1); medPath[0] = 0;
    for(var s2 = 1; s2 <= h; s2++){
      var col = analogs.map(function(a){ return a.path[s2]; });
      medPath[s2] = _median(col);   // 비율(0.03 = +3%)
    }

    rets.sort(function(x, y){ return x - y; });
    var sum = 0; for(var u = 0; u < rets.length; u++) sum += rets[u];

    return {
      active:true, n:nA, win:win, h:h,
      upProb: Math.round(up / nA * 100),                 // 상승확률(%) — 단순 카운트
      avg:    Math.round((sum / nA) * 1000) / 10,        // 평균수익(%)
      median: Math.round(_median(rets) * 1000) / 10,     // 중앙수익(%)
      max:    Math.round(rets[rets.length - 1] * 1000) / 10, // 최대수익(%)
      min:    Math.round(rets[0] * 1000) / 10,           // 최소수익(%)
      bins:   bins,
      binsPct: bins.map(function(b){ return Math.round(b / nA * 100); }),
      binLabels: BIN_LABELS,
      medPath: medPath,                                  // 길이 h+1, [0]=0, 비율
      analogs: analogs.sort(function(a, b){ return b.sim - a.sim; }), // 유사도순 정렬
      nearSim: analogs.reduce(function(mx, a){ return a.sim > mx ? a.sim : mx; }, 0)
    };
  }

  var G = (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  G.SXCP = { predict:predict, WIN:WIN, H:H, K:K, MIN_N:MIN_N, GAP:GAP };
})();
