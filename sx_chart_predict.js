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
//  [S664] 매칭모드 토글(실험): opts.match='shape'(기본·순수 형태) | 'hybrid'(형태+구조).
//        하이브리드는 선택거리=형태 wHybrid + 구조 (1-wHybrid)로 섞어 '라인도 닮고 셋업도 같은'
//        이웃을 뽑는다(오버레이는 형태일치가 약해지는 트레이드오프). 구조피처 보강:
//        기존 MA배열·크로스·%B·BB폭·캔들위치 + RSI레벨·MACD모멘텀부호·거래량추세·MA20기울기.
//        ★ 어느 모드/피처가 실제로 정확한지는 워크포워드 백테스트(검증 하네스)로만 판정 가능.
//        구조 가중은 opts.structW로 개별 조정/프루닝 가능(검증으로 쳐내기 위함).
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

  // ── [S664] 보조 시계열(국면·모멘텀·수급) 사전계산 — predict당 1회 O(N) ──
  //   RSI/MACD는 트레일링 점화식이라 후보별 즉석계산이 비싸 배열 사전계산. 거래량추세도 동일.
  //   (하이브리드 ON이면 후보 전수에 구조피처가 필요 → 사전계산이 비용 핵심.)
  function _vol(r){ return _num(r && (r.volume != null ? r.volume : (r.v != null ? r.v : r.vol))); }
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
  function _emaSeed(c, p){ var n = c.length, o = new Array(n), kk = 2 / (p + 1), pv;
    for(var i = 0; i < n; i++){ if(i === 0) pv = c[0]; else pv = c[i] * kk + pv * (1 - kk); o[i] = pv; } return o; }
  function _macdSignArr(c){            // MACD 히스토 부호: +1 강세 / -1 약세 / 0
    var n = c.length, e12 = _emaSeed(c, 12), e26 = _emaSeed(c, 26), mac = new Array(n), i;
    for(i = 0; i < n; i++) mac[i] = e12[i] - e26[i];
    var sig = _emaSeed(mac, 9), o = new Array(n);
    for(i = 0; i < n; i++){ var hh = mac[i] - sig[i]; o[i] = hh > 0 ? 1 : hh < 0 ? -1 : 0; }
    return o;
  }
  function _volTrArr(rows){            // 거래량추세: 최근5평균/직전20평균 − 1 (확장>0 / 위축<0), clamp[-1,2]
    var n = rows.length, o = new Array(n), i, j, vols = new Array(n);
    for(i = 0; i < n; i++) vols[i] = _vol(rows[i]);
    for(i = 0; i < n; i++){
      if(i < 24){ o[i] = 0; continue; }
      var r5 = 0, p20 = 0;
      for(j = i - 4; j <= i; j++) r5 += vols[j]; r5 /= 5;
      for(j = i - 24; j <= i - 5; j++) p20 += vols[j]; p20 /= 20;
      o[i] = p20 > 0 ? Math.max(-1, Math.min(2, r5 / p20 - 1)) : 0;
    }
    return o;
  }
  function _buildCtx(closes, rows){
    return { rsi: _rsiArr(closes, 14), macdSign: _macdSignArr(closes), volTr: _volTrArr(rows) };
  }

  // 구조 가중 기본값(합=1.0). opts.structW로 개별 덮어쓰기 → 검증 하네스로 프루닝.  [S664]
  var _SW = { align:0.18, cross:0.12, pctB:0.15, bbW:0.06, srPos:0.09, rsi:0.16, macd:0.10, vol:0.08, slope:0.06 };
  function _merge(base, ov){ var o = {}, kk; for(kk in base) o[kk] = base[kk]; for(kk in ov){ if(ov[kk] != null) o[kk] = ov[kk]; } return o; }

  // ── 구조 피처(유사도% 보강용) — MA배열·크로스·BB형태/위치·캔들위치 ──  [S663]
  //   ★ 선택(아날로그 탐색)은 형태(z종가)만 사용. 구조는 '표시 유사도%'에만 반영해
  //     라인 매칭의 시각적 일관성(오버레이가 닮아 보임)을 보존하면서 % 신뢰도만 높인다.
  function _maC(closes, e, len){ if(e-len+1<0) return null; var t=0; for(var i=e-len+1;i<=e;i++) t+=closes[i]; return t/len; }
  function _bbC(closes, e, len, mult){
    if(e-len+1<0) return null; var t=0,i; for(i=e-len+1;i<=e;i++) t+=closes[i];
    var m=t/len, sd=0; for(i=e-len+1;i<=e;i++){ var d=closes[i]-m; sd+=d*d; } sd=Math.sqrt(sd/len);
    return { mid:m, lo:m-mult*sd, w:(2*mult*sd)||1e-9 };
  }
  // 한 구간(끝 e)의 구조 상태. ohlc=원본 rows(캔들위치 high/low용). ctx=보조시계열(RSI/MACD/거래량).
  //   과거부족 필드는 중립 폴백.  [S664] RSI레벨·MACD모멘텀·거래량추세·MA20기울기 추가.
  function _structFeat(closes, ohlc, e, win, ctx){
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
    // [S664] 보강 — 모멘텀/수급 (직교 신호: 같은 형태도 RSI 30 vs 70, 거래량 확장 vs 위축은 다른 자리)
    var rsi      = (ctx&&ctx.rsi&&ctx.rsi[e]!=null) ? ctx.rsi[e] : 50;          // 0~100
    var macdSign = (ctx&&ctx.macdSign&&ctx.macdSign[e]!=null) ? ctx.macdSign[e] : 0;  // -1/0/+1
    var volTr    = (ctx&&ctx.volTr&&ctx.volTr[e]!=null) ? ctx.volTr[e] : 0;     // 거래량 확장도
    var ma20p=_maC(closes,e-5,20);                                              // MA20 5봉전 → 기울기
    var maSlope = (ma20!=null&&ma20p!=null&&ma20p>0) ? Math.max(-0.2,Math.min(0.2,(ma20-ma20p)/ma20p)) : 0;
    return { align:align, cross:cross, pctB:pctB, bbW:bbW, srPos:srPos, rsi:rsi, macdSign:macdSign, volTr:volTr, maSlope:maSlope };
  }
  // 두 구간 구조 일치도 0~1. W=가중치맵(_SW 기본/ opts.structW 병합).  [S664] 9피처
  function _structSim(q, a, W){
    W = W || _SW;
    var alignA = 1 - Math.min(1, Math.abs(q.align-a.align)/2);
    var crossA = (q.cross===a.cross) ? 1 : (q.cross===0||a.cross===0) ? 0.5 : 0;
    var pctA   = 1 - Math.min(1, Math.abs(q.pctB-a.pctB));
    var wA     = 1 - Math.min(1, Math.abs(Math.log((q.bbW+1e-6)/(a.bbW+1e-6))));
    var srA    = 1 - Math.min(1, Math.abs(q.srPos-a.srPos));
    var rsiA   = 1 - Math.min(1, Math.abs(q.rsi-a.rsi)/50);          // 50p 차이 → 0
    var macdA  = (q.macdSign===a.macdSign) ? 1 : (q.macdSign===0||a.macdSign===0) ? 0.5 : 0;
    var volA   = 1 - Math.min(1, Math.abs(q.volTr-a.volTr));         // 확장도 차이
    var slpA   = 1 - Math.min(1, Math.abs(q.maSlope-a.maSlope)/0.1); // 10%p 차이 → 0
    return W.align*alignA + W.cross*crossA + W.pctB*pctA + W.bbW*wA + W.srPos*srA
         + W.rsi*rsiA + W.macd*macdA + W.vol*volA + W.slope*slpA;
  }

  // ── 추세 국면(레짐) — MA20 vs MA60 스프레드 기준 3분류 ──  [S663] 레짐필터용(self-contained)
  //   'up'(상승추세) / 'side'(횡보) / 'down'(하락추세). band=중립밴드(스프레드 |.|≤band → 횡보).
  //   ※ SXLR의 ADX기반 _regimeAt와 별개인 '차트예측 자체 국면'(라벨 단순화·자기완결). 필터 맥락 매칭용.
  var REGIME_LABEL = { up:'상승추세', side:'횡보', down:'하락추세' };
  function _regimeAt(closes, e, band){
    if(e < 60) return 'side';
    var ma20 = _maC(closes, e, 20), ma60 = _maC(closes, e, 60);
    if(ma20 == null || ma60 == null || ma60 <= 0) return 'side';
    var spread = (ma20 - ma60) / ma60;
    var b = (band != null ? band : 0.01);
    if(spread >  b) return 'up';
    if(spread < -b) return 'down';
    return 'side';
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

    // [S664] 보조시계열 + 쿼리 구조피처(하이브리드 선택 & 표시% 공용) + 매칭모드
    var ctx     = _buildCtx(closes, rows);
    var qf      = _structFeat(closes, rows, li, win, ctx);
    var structW = opts.structW ? _merge(_SW, opts.structW) : _SW;
    var simRef  = opts.simRef || 1.35;                         // 형태% 절대척도(z-RMSE '무관'≈√2)
    var match   = (opts.match === 'hybrid') ? 'hybrid' : 'shape';
    var wHyb    = (opts.wHybrid != null ? opts.wHybrid : 0.6); // 하이브리드 형태비중(나머지 구조)

    // 후보: 끝 e' ∈ [win-1, li - max(win,h)]  (쿼리창 비겹침 + forward 정의 보장)
    //   shape=순수 형태거리 / hybrid=형태(1-shSim)·wHyb + 구조(1-structSim)·(1-wHyb)  [0~1 정규화 혼합]
    var hi = li - Math.max(win, h), cand = [];
    for(var e = win - 1; e <= hi; e++){
      var v = _shapeVec(closes, e, win); if(!v) continue;
      var dS = _dist(q, v);                                    // 형태 L2(표시 rmse용 보존)
      if(match === 'hybrid'){
        var sf = _structFeat(closes, rows, e, win, ctx);
        var ss = _structSim(qf, sf, structW);
        var shSim = Math.max(0, Math.min(1, 1 - Math.sqrt(dS / win) / simRef));
        cand.push({ e:e, d: wHyb * (1 - shSim) + (1 - wHyb) * (1 - ss), dShape:dS, _ss:ss });
      } else {
        cand.push({ e:e, d:dS, dShape:dS });
      }
    }
    if(cand.length < minN) return { active:false, reason:'후보 부족(' + cand.length + ')' };
    cand.sort(function(a, b){ return a.d - b.d; });

    // 레짐(상승/횡보/하락) — 항상 계산(표시용). 토글 ON이면 같은 레짐 후보만 사용(장분위기 매칭).
    var curRegime = _regimeAt(closes, li, opts.regimeBand);
    var curRegimeKr = REGIME_LABEL[curRegime];
    var regimeOn = !!opts.regime, regimeMatched = null;
    var pool = cand;
    if(regimeOn){
      pool = cand.filter(function(c){ return _regimeAt(closes, c.e, opts.regimeBand) === curRegime; });
      regimeMatched = pool.length;
    }

    // 그리디 비겹침(서로 gap봉 이상) 채택 → 서로 구분되는 가장 닮은 K개 (레짐ON이면 같은 레짐 내)
    var picked = [];
    for(var i = 0; i < pool.length && picked.length < k; i++){
      var ce = pool[i].e, ok = true;
      for(var j = 0; j < picked.length; j++){ if(Math.abs(ce - picked[j].e) < gap){ ok = false; break; } }
      if(ok) picked.push(pool[i]);
    }
    if(picked.length < minN) return { active:false, reason:(regimeOn?curRegimeKr+' ':'')+'유사패턴 부족('+picked.length+'<'+minN+')', regimeOn:regimeOn, curRegime:curRegime, curRegimeKr:curRegimeKr, regimeMatched:regimeMatched, matchMode:match };

    var wShape = (opts.wShape != null ? opts.wShape : 0.55);   // 표시 종합%: 형태:구조 가중(나머지=구조)

    // 아날로그별 forward 경로 + 최종수익 + 구간내 최대낙폭 + 종합 유사도%
    var analogs = [], rets = [], bins = [0,0,0,0,0,0], up = 0;
    for(var p = 0; p < picked.length; p++){
      var pe = picked[p].e, base = closes[pe]; if(base <= 0) continue;
      var path = new Array(h + 1); path[0] = 0;
      var dd = 0;
      for(var s = 1; s <= h; s++){ var rr = closes[pe + s] / base - 1; path[s] = rr; if(rr < dd) dd = rr; }
      var fin = path[h];
      rets.push(fin); if(fin > 0) up++; bins[_binIdx(fin)]++;
      // 형태% = z-RMSE 절대매핑(0%=무관 / 100%=동일, 종목 간 비교 가능). 구조% = MA/크로스/BB/캔들/RSI/MACD/거래량/기울기 일치.
      var rmse = Math.sqrt(picked[p].dShape / win);            // dShape=형태 L2(하이브리드에서도 형태기준 표시)
      var simShape = Math.max(0, Math.min(1, 1 - rmse / simRef));
      var simStruct = (picked[p]._ss != null) ? picked[p]._ss
                    : _structSim(qf, _structFeat(closes, rows, pe, win, ctx), structW);
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
      regimeOn: regimeOn, curRegime: curRegime, curRegimeKr: curRegimeKr, regimeMatched: regimeMatched,
      matchMode: match,                                  // [S664] 'shape' | 'hybrid'
      medPath: medPath,                                  // 길이 h+1, [0]=0, 비율
      analogs: analogs.sort(function(a, b){ return b.sim - a.sim; }), // 유사도순 정렬
      nearSim: analogs.reduce(function(mx, a){ return a.sim > mx ? a.sim : mx; }, 0)
    };
  }

  function _sign(x){ return x > 0 ? 1 : x < 0 ? -1 : 0; }

  // ── [S665] 워크포워드 백테스트 하네스 ──
  //   과거 각 시점 ti에서 "rows[0..ti]만 보이는 상태"로 predict → 실제 H봉 후 결과(closes[ti+h]/closes[ti])와 대조.
  //   룩어헤드 0(predict 자체가 ti 이전만 사용, actual은 ti+h로 분리). 4모드(레짐×하이브리드) 동시.
  //   지표: 기준선(실제 상승률) / 방향정확도 / 균형정확도(50%=찍기) / 상승·하락 콜 정확도 /
  //         캘리브레이션(upProb 버킷별 실제상승률) / 함정(추세 지속 vs 전환 적중) / 중앙값↔실제 상관·MAE.
  //   ★ 단일 종목 N시점은 노이즈 큼 — 신뢰하려면 여러 종목 집계 필요(다음 단계: 배치).
  function backtest(rows, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    var n = rows.length, win = opts.win || WIN, h = opts.h || H;
    var warmup = opts.warmup != null ? opts.warmup : Math.max(2 * win + h, 150);
    var step = opts.step || 1;
    if(n < warmup + h + 10) return { ok:false, reason:'백테스트 표본 부족(' + n + '봉, ' + warmup + '+ 필요)' };

    var closes = new Array(n); for(var t = 0; t < n; t++) closes[t] = _close(rows[t]);

    var MODES = opts.modes || [
      { key:'shape',  regime:false, label:'형태' },
      { key:'shape',  regime:true,  label:'형태+레짐' },
      { key:'hybrid', regime:false, label:'하이브리드' },
      { key:'hybrid', regime:true,  label:'하이브리드+레짐' }
    ];
    var CALIB = [[0,40],[40,50],[50,60],[60,70],[70,80],[80,101]];
    var out = MODES.map(function(m){ return {
      key:m.key, regime:m.regime, label:m.label,
      n:0, skipped:0, tie:0, hit:0,
      upCall:0, upHit:0, dnCall:0, dnHit:0,
      contN:0, contHit:0, revN:0, revHit:0,
      calib: CALIB.map(function(b){ return { lo:b[0], hi:b[1], n:0, up:0 }; }),
      sxy:0, sx:0, sy:0, sxx:0, syy:0, mae:0, k:0
    }; });

    var lastT = n - 1 - h, baseUp = 0, baseN = 0;
    for(var ti = warmup; ti <= lastT; ti += step){
      var actRet = closes[ti + h] / closes[ti] - 1;
      var actUp = actRet > 0 ? 1 : 0, actDir = _sign(actRet);
      baseUp += actUp; baseN++;
      var reg = _regimeAt(closes, ti, opts.regimeBand);   // ti까지만 사용(룩어헤드 0) — 함정 분류용
      var trend = reg === 'up' ? 1 : reg === 'down' ? -1 : 0;
      var sub = rows.slice(0, ti + 1);
      for(var mi = 0; mi < MODES.length; mi++){
        var pr; try { pr = predict(sub, { win:win, h:h, regime:MODES[mi].regime, match:MODES[mi].key, structW:opts.structW, wHybrid:opts.wHybrid }); }
        catch(_e){ pr = null; }
        var O = out[mi];
        if(!pr || !pr.active){ O.skipped++; continue; }
        O.n++;
        var lean = _sign(pr.upProb - 50), predMed = pr.median / 100;
        if(lean === 0){ O.tie++; }
        else {
          var hit = (lean === actDir) ? 1 : 0; O.hit += hit;
          if(lean > 0){ O.upCall++; O.upHit += actUp; } else { O.dnCall++; O.dnHit += (actUp ? 0 : 1); }
          if(trend !== 0){ if(actDir === trend){ O.contN++; O.contHit += hit; } else { O.revN++; O.revHit += hit; } }
        }
        for(var ci = 0; ci < O.calib.length; ci++){ var cb = O.calib[ci]; if(pr.upProb >= cb.lo && pr.upProb < cb.hi){ cb.n++; cb.up += actUp; break; } }
        O.sxy += predMed * actRet; O.sx += predMed; O.sy += actRet; O.sxx += predMed * predMed; O.syy += actRet * actRet; O.mae += Math.abs(predMed - actRet); O.k++;
      }
    }
    if(baseN < 20) return { ok:false, reason:'유효 시점 부족(' + baseN + ')' };

    var R1 = function(x){ return Math.round(x * 1000) / 10; };
    var modes = out.map(function(O){
      var dirN = O.upCall + O.dnCall;
      var upAcc = O.upCall ? O.upHit / O.upCall : null, dnAcc = O.dnCall ? O.dnHit / O.dnCall : null;
      var balAcc = (upAcc != null && dnAcc != null) ? (upAcc + dnAcc) / 2 : (upAcc != null ? upAcc : dnAcc);
      var k = O.k || 1, cov = O.sxy / k - (O.sx / k) * (O.sy / k);
      var vx = O.sxx / k - (O.sx / k) * (O.sx / k), vy = O.syy / k - (O.sy / k) * (O.sy / k);
      var corr = (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : 0;
      return {
        key:O.key, regime:O.regime, label:O.label, n:O.n, skipped:O.skipped, tie:O.tie, decisive:dirN,
        dirAcc: dirN ? R1(O.hit / dirN) : null,
        balAcc: balAcc != null ? R1(balAcc) : null,
        upAcc: upAcc != null ? R1(upAcc) : null, upCalls:O.upCall,
        dnAcc: dnAcc != null ? R1(dnAcc) : null, dnCalls:O.dnCall,
        contAcc: O.contN ? R1(O.contHit / O.contN) : null, contN:O.contN,
        revAcc:  O.revN  ? R1(O.revHit  / O.revN ) : null, revN:O.revN,
        calib: O.calib.map(function(cb){ return { lo:cb.lo, hi:cb.hi, n:cb.n, actUp: cb.n ? R1(cb.up / cb.n) : null }; }),
        medCorr: Math.round(corr * 100) / 100, medMAE: R1(O.mae / k)
      };
    });
    var best = 0, bestV = -1;
    modes.forEach(function(m, i){ var v = (m.balAcc != null ? m.balAcc : (m.dirAcc != null ? m.dirAcc : -1)); if(v > bestV){ bestV = v; best = i; } });

    return { ok:true, win:win, h:h, nTests:baseN, step:step, warmup:warmup, baseRate: R1(baseUp / baseN), modes:modes, best:best };
  }

  var G = (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  G.SXCP = { predict:predict, backtest:backtest, WIN:WIN, H:H, K:K, MIN_N:MIN_N, GAP:GAP };
})();
