/* ═══════════════════════════════════════════════════════════════════════════
 * sx_feature_library.js — [S1095] 통합 재료 라이브러리 (SSOT · **106재료** = 이진 62 + 연속 44)
 * ───────────────────────────────────────────────────────────────────────────
 *  [S1098] 재료 수 정정: 헤더가 S1095 시점 79에 멈춰 있었다. 실제는 S1095c 발굴 27종 편입 후 106.
 *  ★재료 수는 코드에 박지 말 것 — 살아있는 값은 `SXFeatureLib.features.length` · `SXFeatureLib.version`.
 *    아래 숫자는 사람이 읽는 이정표일 뿐이고, 어긋나면 **런타임 값이 옳다.**
 *  ★소비처별 개수가 다른 건 정상이다(전부 정당한 차이):
 *      106 = 라이브러리 전체        · 62 = 전광판 점등 분모(이진만 · 연속은 숫자 표시)
 *      104 = 시즌3 L0 (106 − 앵커 `gx5_20` − 청산 `deadCross` · PREREG_S1096 §1-1)
 *       35 = 매매 어휘(`_F733_KEYS` 고정 · recipe_core) — 라이브러리 확장이 매매로 새지 않는 차단막
 * ───────────────────────────────────────────────────────────────────────────
 *  목적: 앱이 다루는 재료 어휘 전체를 한 곳에 정의. 레시피·위험필터·교차검증·시즌3가 전부 여기서 읽는다.
 *        각 재료는 value(ind, rows, i) → 연속값(숫자) 또는 이진(0/1) 반환.
 *
 *  [S1095] 세 갈래로 흩어져 있던 어휘를 합쳤다 (S1095 전수대조 근거):
 *    ① 구 라이브러리 39      (S1057 · 이 파일)
 *    ② 교차검증 35           (`_DISCRIM_FEATS`/`_extractFeats733` — 레시피 발동·빌더가 쓰던 것)
 *    ③ 시즌3 L0 73           (`l1_fire.js` S1084 · 측정 전용)
 *    → 원시 키 합집합 81 · 진짜중복 2쌍(rsiDiv=rsiDivBull · obvDiv=obvDivBull) 병합 = **79**
 *
 *  layers 필드: 그 재료가 어느 층에서 왔는지. '1'=구라이브러리 '2'=교차검증/레시피 '3'=시즌3.
 *    예) rsi='123'(세 곳 다) · dev120='23' · trix='3' · psycho='13'
 *
 *  ★카노니컬 판정 원칙 — 겹치는 재료의 구현이 갈릴 땐 **매매 경로(②·_extractFeats733)를 권위**로 삼는다.
 *    실측(S1095 · KR 188종 × 최근5봉 940샘플, 엄격일치):
 *      · 겹침 수치 11개 중 10개 100% 완전동일 → 병합 안전
 *      · dev20만 불일치: ②는 소수2자리 반올림 / ①은 엔진 원값(최대차 0.005) → **②(반올림) 채택**
 *      · 이진 겹침 전부 동일. 단 크로스 3종(gx5_9/20/60)만 ~1% 차이 → 원인=확인창 폭(①3봉 vs ②4봉)
 *  ⚠크로스 확인창 통일: gx5_9/gx5_20/gx5_60/deadCross = **4봉**(②_goldenX733 = 매매 권위)로 통일.
 *    S1084/S1085 시즌3 L1 원장은 ①의 3봉 기준으로 만들어졌다 → 그 원장과 직접 비교는 불가(gx5_9 ~1.6%p 차이).
 *    시즌3에서 이 재료를 다시 쓸 땐 사전등록(PREREG)에 확인창 4봉을 명시할 것. (창은 비가역 · 정의도 동일 규율)
 *
 *  ⚠[S1095] volBreak 죽은배선 수리 — 구 ②구현은 `typeof ind.volumeMA==='number'`로 읽었으나
 *    엔진 반환은 항상 객체{vma5,vma20,...} → volMA=null → **1880봉 전수 0% 점등**(실측).
 *    settle20은 같은 표본서 8.2% 점등이라 게이트 문제 아님. 레시피 conds 미사용(매매 무영향) 확인 후 vma20 기준으로 수리.
 *    ⇒ 교차검증 빌더 '돌파+거래량동반' 체크박스가 이제 실제로 표본을 만든다(이전엔 항상 0).
 *
 *  자기완결: recipe_core 의존 없이 ind(calcAllScreener 반환) + rows(OHLCV)로만 계산.
 *  확장: 새 재료는 FEATURES 배열에 1개 추가 → 레시피·위험·교차검증·카드가 자동으로 본다.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ── 내부 헬퍼 (자기완결) ──
  function _num(v){ return (typeof v==='number' && isFinite(v)) ? v : null; }
  function _r2(v){ return (v==null||!isFinite(v)) ? null : +(v).toFixed(2); }   // [S1095] ②권위 = 소수2자리

  function _sma(arr, p, endIdx){
    if(!arr || endIdx < p-1) return null;
    var s=0; for(var k=endIdx-p+1;k<=endIdx;k++){ if(typeof arr[k]!=='number') return null; s+=arr[k]; }
    return s/p;
  }

  // [S1057] 인덱스-세이프 closes — 소비처가 250봉 윈도 ind + 전역 i를 넘겨도 범위 초과 안 나게.
  function _closesFor(ind, rows, i){
    var cl = ind && ind.closes;
    if(cl && i < cl.length) return cl;
    return rows ? rows.map(function(r){ return r.close; }) : null;
  }
  // [S1095] 평가 컨텍스트 — closes 배열 + 유효 인덱스. i가 범위 밖이면 마지막 봉(=②_extractFeats733 관행)으로.
  function _ctx(ind, rows, i){
    var cl=_closesFor(ind, rows, i);
    if(!cl || !cl.length) return null;
    var ix=(typeof i==='number' && i>=0 && i<cl.length) ? i : cl.length-1;
    return { cl:cl, ix:ix };
  }
  // 최근 nBar 내 maFast가 maSlow를 상향(골든)/하향(데드) 교차했나. [S1095] nBar 기본 4 = ②_goldenX733 동치.
  function _crossed(closes, i, fast, slow, nBar, dir){
    if(!closes || i < slow+nBar) return 0;
    for(var b=0;b<nBar;b++){
      var t=i-b;
      var fN=_sma(closes,fast,t), sN=_sma(closes,slow,t);
      var fP=_sma(closes,fast,t-1), sP=_sma(closes,slow,t-1);
      if(fN==null||sN==null||fP==null||sP==null) continue;
      if(dir==='golden' && fP<=sP && fN>sN) return 1;
      if(dir==='dead'   && fP>=sP && fN<sN) return 1;
    }
    return 0;
  }
  var CROSS_NBAR = 4;   // [S1095] 확인창 폭 — ②매매 권위(_goldenX733 lookback 3 = 4봉 확인)

  // MA 이격%(닫힘가 기준) — dev20/60/120/200 공통
  function _dev(ind, rows, i, p){
    var c=_ctx(ind,rows,i); if(!c) return null;
    var m=_sma(c.cl, p, c.ix), cN=c.cl[c.ix];
    return (m!=null && m!==0 && typeof cN==='number') ? _r2(100*(cN-m)/m) : null;
  }
  // 배열의 직전값 (전봉 필요한 교과서 임계용) — ind 배열은 항상 그 창의 마지막이 현재봉
  function _prevOf(arr){
    if(!arr || !arr.length || arr.length<2) return null;
    return _num(arr[arr.length-2]);
  }
  function _lastOf(arr){
    if(!arr || !arr.length) return null;
    return _num(arr[arr.length-1]);
  }
  // 거래량 SMA (volMaGc용) — rows 직접
  function _volSma(rows, p, ix){
    if(!rows || ix < p-1) return null;
    var s=0; for(var k=ix-p+1;k<=ix;k++){ var v=rows[k] && rows[k].volume; if(typeof v!=='number') return null; s+=v; }
    return s/p;
  }
  function _rowIx(rows, ind, i){
    if(!rows || !rows.length) return -1;
    return (typeof i==='number' && i>=0 && i<rows.length) ? i : rows.length-1;
  }

  // ── 재료 정의 ──
  //  kind  : 'cont'(연속) | 'bin'(이진 0/1)
  //  layers: '1'=구라이브러리39 · '2'=교차검증/레시피(733) · '3'=시즌3 L0
  var FEATURES = [
    // ═══════════ 오실레이터 ═══════════
    { id:'rsi',     label:'RSI',            group:'osc', kind:'cont', layers:'123', value:function(ind){ return ind.rsi?_num(ind.rsi.val):null; } },
    { id:'stochK',  label:'Stoch %K',       group:'osc', kind:'cont', layers:'123', value:function(ind){ return ind.stoch?_num(ind.stoch.k):null; } },
    { id:'cci',     label:'CCI',            group:'osc', kind:'cont', layers:'123', value:function(ind){ return _num(ind.cci); } },
    { id:'bbPctB',  label:'BB %B',          group:'osc', kind:'cont', layers:'123', value:function(ind){ return ind.bb?_num(ind.bb.pctB):null; } },
    // [S1057] 투자심리도(상승일 비율 0~100) — 도넛 원천(psychoLegacy·평탄화 폴백) 그대로.
    { id:'psycho',  label:'투자심리도',       group:'osc', kind:'cont', layers:'13',  value:function(ind){ var p=(ind.psychoLegacy&&ind.psychoLegacy.psycho!=null)?ind.psychoLegacy.psycho:((ind.psycho&&ind.psycho.psycho!=null)?ind.psycho.psycho:null); return _num(p); } },
    { id:'stochSlowGc',label:'슬로우스토 골든', group:'osc', kind:'bin', layers:'23', value:function(ind){ return (ind.stochSlow && ind.stochSlow.cross==='golden')?1:0; } },

    // ═══════════ 이격도 ═══════════  (과열군 핵심 · dev120/200은 레시피 70+회 사용)
    { id:'dev20',   label:'MA20 이격%',      group:'ma', kind:'cont', layers:'123', value:function(ind,rows,i){ return _dev(ind,rows,i,20); } },
    { id:'dev60',   label:'MA60 이격%',      group:'ma', kind:'cont', layers:'123', value:function(ind,rows,i){ return _dev(ind,rows,i,60); } },
    { id:'dev120',  label:'MA120 이격%',     group:'ma', kind:'cont', layers:'2',   value:function(ind,rows,i){ return _dev(ind,rows,i,120); } },
    { id:'dev200',  label:'MA200 이격%',     group:'ma', kind:'cont', layers:'2',   value:function(ind,rows,i){ return _dev(ind,rows,i,200); } },
    { id:'ma5slope',label:'MA5 기울기%',     group:'ma', kind:'cont', layers:'123', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); if(!c||c.ix<7) return null; var a=_sma(c.cl,5,c.ix), b=_sma(c.cl,5,c.ix-3); return (a!=null&&b!=null&&b!==0)?_r2(100*(a-b)/Math.abs(b)):null; } },
    { id:'vwapDev', label:'VWAP 이격%',      group:'ma', kind:'cont', layers:'3',   value:function(ind){ return ind.vwap?_num(ind.vwap.pct):null; } },

    // ═══════════ 변동성 ═══════════
    { id:'atrPct',  label:'ATR%',           group:'vol', kind:'cont', layers:'13',  value:function(ind){ return ind.atr?_num(ind.atr.pct):null; } },
    { id:'squeeze', label:'BB 스퀴즈',       group:'vol', kind:'bin',  layers:'123', value:function(ind){ return (ind.squeeze&&ind.squeeze.squeeze)?1:0; } },
    { id:'massBulge',label:'매스인덱스 벌지', group:'vol', kind:'bin',  layers:'3',   value:function(ind){ return (ind.massIndex && ind.massIndex.bulge===true)?1:0; } },

    // ═══════════ 추세강도 ═══════════
    { id:'adx',     label:'ADX',            group:'trend', kind:'cont', layers:'123', value:function(ind){ return ind.adx?_num(ind.adx.adx):null; } },
    { id:'dxVal',   label:'DX',             group:'trend', kind:'cont', layers:'3',   value:function(ind){ return ind.dx?_num(ind.dx.val):null; } },
    { id:'vhf',     label:'VHF',            group:'trend', kind:'cont', layers:'3',   value:function(ind){ return ind.vhf?_num(ind.vhf.val):null; } },
    { id:'diBear',  label:'DI 하락우위',      group:'trend', kind:'bin',  layers:'123', value:function(ind){ return (ind.adx&&typeof ind.adx.pdi==='number'&&typeof ind.adx.mdi==='number'&&ind.adx.mdi>ind.adx.pdi)?1:0; } },
    // [S1057] DI 레짐 2종 — S1055(OOS 발견) → S1056 발굴풀 종목-홀드아웃 재현.
    //   diRebound: KR n289 crash 4.2%(lift −7.6pp)·meanR10 +6.7% / COIN n861 lift −5.7pp. 투매소진 반등.
    { id:'diRebound', label:'DI 강추세 투매소진', group:'trend', kind:'bin', layers:'123', value:function(ind){ var a=ind.adx; return (a&&typeof a.adx==='number'&&typeof a.pdi==='number'&&typeof a.mdi==='number'&&a.adx>40&&a.mdi>a.pdi)?1:0; } },
    //   diOverheat: KR n9739 crash 18.3%(lift +6.6pp)·ret +4.5%(수익꼬리 동반=단독 숏 불가) / ⚠COIN 미재현=KR 전용 권장.
    { id:'diOverheat', label:'DI 강추세 상승과열', group:'trend', kind:'bin', layers:'123', value:function(ind){ var a=ind.adx; return (a&&typeof a.adx==='number'&&typeof a.pdi==='number'&&typeof a.mdi==='number'&&a.adx>40&&a.pdi>a.mdi)?1:0; } },
    { id:'sarBear', label:'PSAR 하락',       group:'trend', kind:'bin',  layers:'123', value:function(ind){ return (ind.psar&&ind.psar.trend==='down')?1:0; } },

    // ═══════════ 모멘텀(신규 연속) ═══════════
    { id:'trix',    label:'TRIX',           group:'momo', kind:'cont', layers:'3', value:function(ind){ return ind.trix?_num(ind.trix.val):null; } },
    { id:'priceOsc',label:'가격 오실레이터',   group:'momo', kind:'cont', layers:'3', value:function(ind){ return ind.priceOsc?_num(ind.priceOsc.val):null; } },
    { id:'sonarVal',label:'Sonar',          group:'momo', kind:'cont', layers:'3', value:function(ind){ return ind.sonar?_num(ind.sonar.val):null; } },

    // ═══════════ 추격/과열 ═══════════
    { id:'rise10',  label:'최근10봉 상승%',   group:'chase', kind:'cont', layers:'13', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<0) return null; var s=Math.max(0,ix-9), base=rows[s]&&rows[s].close, c=rows[ix]&&rows[ix].close; return (base>0)?_r2((c/base-1)*100):null; } },
    { id:'highProx',label:'고점 근접%',       group:'chase', kind:'cont', layers:'13', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<0) return null; var s=Math.max(0,ix-9),hi=0; for(var k=s;k<=ix;k++){ if(rows[k].high>hi) hi=rows[k].high; } var c=rows[ix]&&rows[ix].close; return (hi>0)?_r2(c/hi*100):null; } },
    { id:'gapPct',  label:'갭%',             group:'chase', kind:'cont', layers:'13', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<1) return null; var pc=rows[ix-1].close, o=rows[ix].open; return (pc>0)?_r2((o/pc-1)*100):null; } },
    { id:'consecUp',label:'연속 양봉 수',      group:'chase', kind:'cont', layers:'13', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<0) return null; var n=0; for(var k=ix;k>=0 && k>ix-10;k--){ if(rows[k].close>rows[k].open) n++; else break; } return n; } },

    // ═══════════ 수급/거래량 ═══════════
    { id:'volOsc',  label:'거래량 OSC',       group:'flow', kind:'cont', layers:'123', value:function(ind){ return _num(ind.volOsc); } },
    { id:'vr',      label:'VR(거래량비율)',    group:'flow', kind:'cont', layers:'123', value:function(ind){ return _num(ind.vr); } },
    { id:'mfi',     label:'MFI(자금흐름)',     group:'flow', kind:'cont', layers:'123', value:function(ind){ return _num(ind.mfi); } },
    { id:'volRatio',label:'거래량 배율',       group:'flow', kind:'cont', layers:'13',  value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<0) return null; var s=Math.max(0,ix-20),sum=0,c=0; for(var k=s;k<ix;k++){ var v=rows[k].volume||0; if(v>0){sum+=v;c++;} } var a=c?sum/c:0; return (a>0)?_r2((rows[ix].volume||0)/a):null; } },
    { id:'obvUp',   label:'OBV 상승추세',      group:'flow', kind:'bin',  layers:'123', value:function(ind){ return (ind.obv&&ind.obv.trend==='up')?1:0; } },
    // [S1057] 대금전이 — SXE.calcDumpWarn(S431 SSOT) tvScore 동일식 자기완결 이식.
    { id:'tvTrend', label:'대금전이',          group:'flow', kind:'cont', layers:'13', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(!rows||ix<12) return null; var s=0,p=0,k,r; for(k=ix-2;k<=ix;k++){ r=rows[k]; if(!r) return null; s+=(r.close||0)*(r.volume||0); } for(k=ix-12;k<=ix-3;k++){ r=rows[k]; if(!r) return null; p+=(r.close||0)*(r.volume||0); } var aR=s/3, aP=p/10; return (aP>0)?Math.max(0,Math.min(100,Math.round(50+Math.log2(aR/aP)*25))):null; } },
    // [S1057] A/D 라인 점수(0~100) — 도넛 원천(adLegacy.score100·평탄화 폴백).
    { id:'adScore', label:'A/D 점수',          group:'flow', kind:'cont', layers:'13', value:function(ind){ var a=(ind.adLegacy&&ind.adLegacy.score100!=null)?ind.adLegacy.score100:((ind.ad&&ind.ad.score100!=null)?ind.ad.score100:null); return _num(a); } },
    { id:'eom',     label:'이동성 용이도(EOM)', group:'flow', kind:'cont', layers:'3', value:function(ind){ return ind.eom?_num(ind.eom.val):null; } },
    { id:'abRatio', label:'AB Ratio',         group:'flow', kind:'cont', layers:'3', value:function(ind){ return ind.abRatio?_num(ind.abRatio.ratio):null; } },
    // ⚠[S1084 판단 계승] nvi/pvi 모두 누적지수 → 종목내 중앙값 이진화 시 시간축이 됨. 상대비의 로그로 표류를 줄인다.
    { id:'volIndex',label:'PVI/NVI 로그비',    group:'flow', kind:'cont', layers:'3', value:function(ind){ var v=ind.volIndex; if(!v) return null; var a=_num(v.pvi), b=_num(v.nvi); return (a>0&&b>0)?Math.log(a/b):null; } },
    { id:'chaikinGc',label:'차이킨 골든',       group:'flow', kind:'bin',  layers:'3', value:function(ind){ return (ind.chaikinOsc && ind.chaikinOsc.cross==='golden')?1:0; } },

    // ═══════════ MACD ═══════════
    { id:'macdHist',    label:'MACD 히스토값',   group:'macd', kind:'cont', layers:'13', value:function(ind){ return (ind.macd)?_num(ind.macd.hist):null; } },
    { id:'macdNegStreak',label:'MACD 연속음전 수',group:'macd', kind:'cont', layers:'13', value:function(ind){ var h=ind.macd&&ind.macd.arr&&ind.macd.arr.hist; if(!h) return null; var n=0; for(var k=h.length-1;k>=0;k--){ if(h[k]<0) n++; else break; } return n; } },
    { id:'macdGc',      label:'MACD 골든크로스',  group:'macd', kind:'bin',  layers:'123', value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&typeof ind.macd.sig==='number'&&ind.macd.line>ind.macd.sig)?1:0; } },
    // ❗[S1096d] macdHistUp ≡ macdGc — **수학적으로 동일**. 엔진 hist = line − sig (sx_analysis_engine.js:396)이므로
    //   hist>0 ⟺ line>sig. 실측 320/320 100% 일치 · 자카드 1.000(SSOT 자기중복 감사 S1096d).
    //   ⇒ 제거하지 않는다: ②교차검증 빌더가 노출하는 35키(_F733_KEYS)에 포함돼 UI 호환이 필요하고,
    //     시즌3에선 **L2(자카드 ≥0.80)가 자동으로 떨군다**(L2가 실제로 일하는 증거). 예상 결과는 PREREG_S1096에 선언됨.
    { id:'macdHistUp',  label:'MACD 히스토 양',   group:'macd', kind:'bin',  layers:'2',   value:function(ind){ return (ind.macd&&typeof ind.macd.hist==='number'&&ind.macd.hist>0)?1:0; } },
    { id:'macdBelow0',  label:'MACD 영선아래',    group:'macd', kind:'bin',  layers:'123', value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&ind.macd.line<0)?1:0; } },

    // ═══════════ 다이버전스/구조 ═══════════
    //  [S1095] 별칭: rsiDiv(②) = rsiDivBull · obvDiv(②) = obvDivBull — 실측 100% 동일, canonical은 Bull 표기.
    { id:'rsiDivBull',label:'RSI 상승다이버',   group:'div', kind:'bin', layers:'123', value:function(ind){ return (ind.rsi&&ind.rsi.div==='bullish')?1:0; } },
    { id:'rsiDivBear',label:'RSI 약세다이버',   group:'div', kind:'bin', layers:'13',  value:function(ind){ return (ind.rsi&&ind.rsi.div==='bearish')?1:0; } },
    { id:'obvDivBull',label:'OBV 상승다이버',   group:'div', kind:'bin', layers:'123', value:function(ind){ return (ind.obv&&ind.obv.div==='bullish')?1:0; } },
    { id:'nearSup',   label:'지지선 근접',      group:'struct', kind:'bin', layers:'123', value:function(ind){ return (ind.trend&&ind.trend.struct&&ind.trend.struct.nearSupport)?1:0; } },
    { id:'demarkPerf',label:'DeMark 셋업 완성',  group:'struct', kind:'bin', layers:'3',  value:function(ind){ return (ind.demark && ind.demark.perfected===true)?1:0; } },

    // ═══════════ 밴드/채널/일목 ═══════════
    { id:'envUp',      label:'엔벨로프 상단이탈', group:'band', kind:'bin', layers:'23', value:function(ind){ var p=ind.envelope&&ind.envelope.position; return (p==='above_upper'||p==='near_upper')?1:0; } },
    { id:'envDn',      label:'엔벨로프 하단이탈', group:'band', kind:'bin', layers:'23', value:function(ind){ var p=ind.envelope&&ind.envelope.position; return (p==='below_lower'||p==='near_lower')?1:0; } },
    { id:'pcUp',       label:'가격채널 상단돌파', group:'band', kind:'bin', layers:'3',  value:function(ind){ return (ind.priceChannel && ind.priceChannel.position==='breakout_up')?1:0; } },
    { id:'pivotAbove', label:'피벗 P 상회',      group:'band', kind:'bin', layers:'3',  value:function(ind){ var l=ind.pivot&&ind.pivot.level; return (l==='P~R1'||l==='R1~R2'||l==='R2+')?1:0; } },
    { id:'ichiCloudUp',  label:'일목 구름위',     group:'ichi', kind:'bin', layers:'23', value:function(ind){ return (ind.ichimoku && ind.ichimoku.priceVsCloud==='above')?1:0; } },
    { id:'ichiTK',       label:'일목 전환>기준',   group:'ichi', kind:'bin', layers:'23', value:function(ind){ var t=ind.ichimoku&&ind.ichimoku.tenkan, k=ind.ichimoku&&ind.ichimoku.kijun; return (_num(t)!=null&&_num(k)!=null&&t>k)?1:0; } },
    // ⚠[S1096d] ichiSignal ↔ ichiCloudUp 자카드 0.816(임계 0.80 초과) — 동일하진 않으나 L2서 한쪽 탈락 예상. PREREG_S1096 선언분.
    { id:'ichiSignal',   label:'일목 종합 신호',   group:'ichi', kind:'bin', layers:'3',  value:function(ind){ var s=ind.ichimoku&&ind.ichimoku.signal; return (s && s.type==='buy')?1:0; } },
    { id:'ichiCloudBull',label:'일목 양운',       group:'ichi', kind:'bin', layers:'3',  value:function(ind){ return (ind.ichimoku && ind.ichimoku.cloudTrend==='bullish')?1:0; } },

    // ═══════════ 크로스/안착 ═══════════  [S1095] 확인창 4봉 통일(②매매 권위)
    { id:'gx5_9',   label:'골든크로스 5×9',   group:'cross', kind:'bin', layers:'123', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 9, CROSS_NBAR, 'golden'):0; } },
    { id:'gx5_20',  label:'골든크로스 5×20',  group:'cross', kind:'bin', layers:'12',  value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 20, CROSS_NBAR, 'golden'):0; } },
    { id:'gx5_60',  label:'골든크로스 5×60',  group:'cross', kind:'bin', layers:'123', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 60, CROSS_NBAR, 'golden'):0; } },
    { id:'deadCross',label:'데드크로스 5×20',  group:'cross', kind:'bin', layers:'1',   value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 20, CROSS_NBAR, 'dead'):0; } },
    { id:'settle20',label:'MA20 돌파안착',    group:'cross', kind:'bin', layers:'123', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); if(!c) return 0; var m=_sma(c.cl,20,c.ix), mp=_sma(c.cl,20,c.ix-1), cN=c.cl[c.ix], cP=c.cl[c.ix-1], c3=c.cl[c.ix-3]; return (m!=null&&mp!=null&&cN>m&&cP>mp&&c3!=null&&cN>c3)?1:0; } },
    // ⚠[S1095] 죽은배선 수리 — 구현이 ind.volumeMA를 숫자로 읽어 1880봉 전수 0% 점등이던 것을 vma20 기준으로 수리.
    { id:'volBreak',label:'돌파+거래량동반',   group:'cross', kind:'bin', layers:'2',   value:function(ind,rows,i){
        var c=_ctx(ind,rows,i); if(!c) return 0;
        var m=_sma(c.cl,20,c.ix), mp=_sma(c.cl,20,c.ix-1), cN=c.cl[c.ix], cP=c.cl[c.ix-1], c3=c.cl[c.ix-3];
        var settled=(m!=null&&mp!=null&&cN>m&&cP>mp&&c3!=null&&cN>c3);
        if(!settled) return 0;
        var ix=_rowIx(rows,ind,i); var vol=(ix>=0&&rows[ix])?_num(rows[ix].volume):null;
        var vm=ind.volumeMA;
        var vMA=(typeof vm==='number')?vm:(vm?_num(vm.vma20):null);   // 엔진은 {vma5,vma20,...} 객체 반환
        return (vol!=null && vMA!=null && vMA>0 && vol>vMA)?1:0;
      } },

    // ═══════════ 교과서 임계 15 ═══════════ (③ 시즌3 L0 · 전봉 필요분은 ind 배열의 직전값 사용)
    { id:'rsiOS30',  label:'RSI 30↓',        group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.rsi?_num(ind.rsi.val):null; return (v!=null&&v<30)?1:0; } },
    { id:'rsiOB70',  label:'RSI 70↑',        group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.rsi?_num(ind.rsi.val):null; return (v!=null&&v>70)?1:0; } },
    { id:'rsi50up',  label:'RSI 50 상향',     group:'thr', kind:'bin', layers:'3', value:function(ind){ var a=ind.rsi?_num(ind.rsi.val):null, b=_prevOf(ind.rsi&&ind.rsi.arr); return (a!=null&&b!=null&&a>50&&b<=50)?1:0; } },
    { id:'stochOS20',label:'Stoch 20↓',      group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.stoch?_num(ind.stoch.k):null; return (v!=null&&v<20)?1:0; } },
    { id:'stochOB80',label:'Stoch 80↑',      group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.stoch?_num(ind.stoch.k):null; return (v!=null&&v>80)?1:0; } },
    { id:'cciOS100', label:'CCI −100↓',      group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=_num(ind.cci); return (v!=null&&v<-100)?1:0; } },
    { id:'cciOB100', label:'CCI +100↑',      group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=_num(ind.cci); return (v!=null&&v>100)?1:0; } },
    { id:'mfiOS20',  label:'MFI 20↓',        group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=_num(ind.mfi); return (v!=null&&v<20)?1:0; } },
    { id:'mfiOB80',  label:'MFI 80↑',        group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=_num(ind.mfi); return (v!=null&&v>80)?1:0; } },
    { id:'adx25',    label:'ADX 25↑',        group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.adx?_num(ind.adx.adx):null; return (v!=null&&v>25)?1:0; } },
    { id:'bbLower',  label:'BB %B 0↓',       group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.bb?_num(ind.bb.pctB):null; return (v!=null&&v<0)?1:0; } },
    { id:'bbUpper',  label:'BB %B 1↑',       group:'thr', kind:'bin', layers:'3', value:function(ind){ var v=ind.bb?_num(ind.bb.pctB):null; return (v!=null&&v>1)?1:0; } },
    { id:'macdSigGc',label:'MACD 시그널 골든', group:'thr', kind:'bin', layers:'3', value:function(ind){ var m=ind.macd; if(!m) return 0; var a=_num(m.line), b=_num(m.sig); var pa=_prevOf(m.arr&&m.arr.line), pb=_prevOf(m.arr&&m.arr.sig); return (a!=null&&b!=null&&pa!=null&&pb!=null&&a>b&&pa<=pb)?1:0; } },
    { id:'macd0up',  label:'MACD 0선 상향',   group:'thr', kind:'bin', layers:'3', value:function(ind){ var m=ind.macd; if(!m) return 0; var a=_num(m.line), pa=_prevOf(m.arr&&m.arr.line); return (a!=null&&pa!=null&&a>0&&pa<=0)?1:0; } },
    { id:'volMaGc',  label:'거래량 5×20 골든', group:'thr', kind:'bin', layers:'3', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<20) return 0; var a5=_volSma(rows,5,ix), a20=_volSma(rows,20,ix), p5=_volSma(rows,5,ix-1), p20=_volSma(rows,20,ix-1); return (a5!=null&&a20!=null&&p5!=null&&p20!=null&&a5>a20&&p5<=p20)?1:0; } },

    // ═══════════ [S1095c] 카드 탐색 발굴 27종 (layers '4') ═══════════
    //  경위: 재료 전광판 '새 재료 탐색' A등급(재료가 안 쓰는 엔진 필드) 59개를 실측으로 선별.
    //   ❌가격스케일 함정 15 제외 — 종가와 |r| 0.93~1.00(price·ma5/20/60/120·maAlign.short/mid/long·maDisparity.ma20/ma60·psychLevel.level·trueRange.val·stdDev.val).
    //     절대 원화라 종목간 비교 불가 + 종목내 중앙값 이진화 시 시간축이 됨(l1_fire가 nvi/pvi에 로그비 쓴 것과 동일 이유).
    //   ⚠기존 SSOT와 사실상 중복 5 제외 — maDisparity.disparity20≈dev20(r=1.00) · disparity60≈dev60(1.00) · regime.adx≈adx(1.00) · priceAction.prevHighBreak≈pcUp(1.00) · volPattern.volRatio≈volRatio(0.998).
    //   ❌분산0 제외 — maAlignLT.gateOn은 480봉 전수 100% 참(재료가치 없음).
    //   ✅채택 기준: 기존 79재료 중 최근접과 |r| < 0.7 (겹치면 새 정보가 아님). KR 100종 마지막봉 기준.
    //     ※[S1098] 여기의 79는 **발굴 당시(S1095) 모집단**이다 — 현행 106으로 고치면 안 된다(기준이 달라짐).
    //  ⚠시즌3 영향: binIds/contIds가 곧 L0라서 이 추가는 **사전등록(PREREG) 사안**. L1 원장 재산출 시 재료 수가 73→다름.
    //  ★매매 무영향 증명: _extractFeats733 shim은 _F733_KEYS 35개 고정 → 라이브러리 추가가 레시피 발동에 안 샌다(S1095c 60종 골든 동일).
    { id:'maAlignBear', label:'MA 역배열',      group:'trend', kind:'bin', layers:'4', value:function(ind){ return (ind.maAlign&&ind.maAlign.bearish)?1:0; } },
    { id:'ltBull',      label:'장기 정배열',     group:'trend', kind:'bin', layers:'4', value:function(ind){ return (ind.maAlignLT&&ind.maAlignLT.bullish)?1:0; } },
    { id:'ltBear',      label:'장기 역배열',     group:'trend', kind:'bin', layers:'4', value:function(ind){ return (ind.maAlignLT&&ind.maAlignLT.bearish)?1:0; } },
    { id:'regimeScore', label:'레짐 점수',       group:'trend', kind:'cont', layers:'4', value:function(ind){ return (ind.regime&&typeof ind.regime.score==='number'&&isFinite(ind.regime.score))?ind.regime.score:null; } },
    { id:'maConv',      label:'MA 수렴',        group:'ma', kind:'bin', layers:'4', value:function(ind){ return (ind.maConv&&ind.maConv.converging)?1:0; } },
    { id:'maSpread',    label:'MA 스프레드%',    group:'ma', kind:'cont', layers:'4', value:function(ind){ return (ind.maConv&&typeof ind.maConv.spread==='number'&&isFinite(ind.maConv.spread))?ind.maConv.spread:null; } },
    { id:'candleBull',  label:'캔들 강세패턴',    group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.candle&&ind.candle.bullish)?1:0; } },
    { id:'candleBear',  label:'캔들 약세패턴',    group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.candle&&ind.candle.bearish)?1:0; } },
    { id:'candleScore', label:'캔들 점수',       group:'struct', kind:'cont', layers:'4', value:function(ind){ return (ind.candle&&typeof ind.candle.score==='number'&&isFinite(ind.candle.score))?ind.candle.score:null; } },
    { id:'swingHH',     label:'고점 higher-high', group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.swingStruct&&ind.swingStruct.higherHighs)?1:0; } },
    { id:'swingLL',     label:'저점 lower-low',  group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.swingStruct&&ind.swingStruct.lowerLows)?1:0; } },
    { id:'tlbRev',      label:'삼선전환 반전',    group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.threeLineBreak&&ind.threeLineBreak.reversal)?1:0; } },
    { id:'tlbLines',    label:'삼선전환 선수',    group:'struct', kind:'cont', layers:'4', value:function(ind){ return (ind.threeLineBreak&&typeof ind.threeLineBreak.lines==='number'&&isFinite(ind.threeLineBreak.lines))?ind.threeLineBreak.lines:null; } },
    { id:'psychNear',   label:'심리가격 근접',    group:'struct', kind:'bin', layers:'4', value:function(ind){ return (ind.psychLevel&&ind.psychLevel.near)?1:0; } },
    { id:'pbScore',     label:'눌림목 점수',      group:'struct', kind:'cont', layers:'4', value:function(ind){ return (ind.pullback&&typeof ind.pullback.score==='number'&&isFinite(ind.pullback.score))?ind.pullback.score:null; } },
    { id:'volPatBull',  label:'거래량패턴 강세',  group:'flow', kind:'bin', layers:'4', value:function(ind){ return (ind.volPattern&&ind.volPattern.bullish)?1:0; } },
    { id:'volPatBear',  label:'거래량패턴 약세',  group:'flow', kind:'bin', layers:'4', value:function(ind){ return (ind.volPattern&&ind.volPattern.bearish)?1:0; } },
    { id:'volPatScore', label:'거래량패턴 점수',  group:'flow', kind:'cont', layers:'4', value:function(ind){ return (ind.volPattern&&typeof ind.volPattern.score==='number'&&isFinite(ind.volPattern.score))?ind.volPattern.score:null; } },
    { id:'newHighN',    label:'N봉 신고가',      group:'chase', kind:'bin', layers:'4', value:function(ind){ return (ind.priceAction&&ind.priceAction.newHighN)?1:0; } },
    { id:'newLowN',     label:'N봉 신저가',      group:'chase', kind:'bin', layers:'4', value:function(ind){ return (ind.priceAction&&ind.priceAction.newLowN)?1:0; } },
    { id:'newLow52',    label:'52주 신저가',     group:'chase', kind:'bin', layers:'4', value:function(ind){ return (ind.priceAction&&ind.priceAction.newLow52)?1:0; } },
    { id:'rangeRate',   label:'레인지 비율%',    group:'chase', kind:'cont', layers:'4', value:function(ind){ return (ind.priceAction&&typeof ind.priceAction.rangeRate==='number'&&isFinite(ind.priceAction.rangeRate))?ind.priceAction.rangeRate:null; } },
    { id:'intraRange',  label:'장중 변동폭%',    group:'chase', kind:'cont', layers:'4', value:function(ind){ return (ind.priceAction&&typeof ind.priceAction.intradayRange==='number'&&isFinite(ind.priceAction.intradayRange))?ind.priceAction.intradayRange:null; } },
    { id:'paScore',     label:'가격행동 점수',    group:'chase', kind:'cont', layers:'4', value:function(ind){ return (ind.priceAction&&typeof ind.priceAction.score==='number'&&isFinite(ind.priceAction.score))?ind.priceAction.score:null; } },
    { id:'bwNeutral',   label:'바이너리웨이브 중립', group:'momo', kind:'bin', layers:'4', value:function(ind){ return (ind.binaryWave&&ind.binaryWave.neutral)?1:0; } },
    { id:'macdOsc',     label:'MACD 오실레이터',  group:'macd', kind:'cont', layers:'4', value:function(ind){ return (ind.macdOsc&&typeof ind.macdOsc.val==='number'&&isFinite(ind.macdOsc.val))?ind.macdOsc.val:null; } },
    // ⚠gapReal: 엔진 priceAction.gapPct는 라이브러리 gapPct(단순 시가/전일종가)와 달리 **임계 넘은 진짜 갭만** 값을 낸다(480봉 중 일치 42) — 별개 재료로 등록.
    { id:'gapReal',     label:'유효 갭%',        group:'chase', kind:'cont', layers:'4', value:function(ind){ return (ind.priceAction&&typeof ind.priceAction.gapPct==='number'&&isFinite(ind.priceAction.gapPct))?ind.priceAction.gapPct:null; } },
    // ── [S1122] 거울상 재료 — 상승계 불리언의 하락 대칭 19 + 상태 bull 미러 4(macdAbove0·diBull·sarBull·maAlignBull). 기존 정의 무변경(측정 연속성)·layers'2'(매매/교차 어휘). ──
    { id:'dx5_9', label:'데드크로스 5×9', group:'cross', kind:'bin', layers:'2', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 9, CROSS_NBAR, 'dead'):0; } },
    { id:'dx5_60', label:'데드크로스 5×60', group:'cross', kind:'bin', layers:'2', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); return c?_crossed(c.cl, c.ix, 5, 60, CROSS_NBAR, 'dead'):0; } },
    { id:'obvDivBear', label:'OBV 하락다이버', group:'div', kind:'bin', layers:'2', value:function(ind){ return (ind.obv&&ind.obv.div==='bearish')?1:0; } },
    { id:'obvDown', label:'OBV 하락추세', group:'flow', kind:'bin', layers:'2', value:function(ind){ return (ind.obv&&ind.obv.trend==='down')?1:0; } },
    { id:'nearRes', label:'저항선 근접', group:'struct', kind:'bin', layers:'2', value:function(ind){ return (ind.trend&&ind.trend.struct&&ind.trend.struct.nearResistance)?1:0; } },
    { id:'settle20Dn', label:'MA20 이탈안착(하락)', group:'cross', kind:'bin', layers:'2', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); if(!c) return 0; var m=_sma(c.cl,20,c.ix), mp=_sma(c.cl,20,c.ix-1), cN=c.cl[c.ix], cP=c.cl[c.ix-1], c3=c.cl[c.ix-3]; return (m!=null&&mp!=null&&cN<m&&cP<mp&&c3!=null&&cN<c3)?1:0; } },
    { id:'volBreakDn', label:'붕괴+거래량동반', group:'cross', kind:'bin', layers:'2', value:function(ind,rows,i){ var c=_ctx(ind,rows,i); if(!c) return 0; var m=_sma(c.cl,20,c.ix), mp=_sma(c.cl,20,c.ix-1), cN=c.cl[c.ix], cP=c.cl[c.ix-1], c3=c.cl[c.ix-3]; var settled=(m!=null&&mp!=null&&cN<m&&cP<mp&&c3!=null&&cN<c3); if(!settled) return 0; var ix=_rowIx(rows,ind,i); var vol=(ix>=0&&rows[ix])?_num(rows[ix].volume):null; var vm=ind.volumeMA; var vMA=(typeof vm==='number')?vm:(vm?_num(vm.vma20):null); return (vol!=null && vMA!=null && vMA>0 && vol>vMA)?1:0; } },
    { id:'macdDead', label:'MACD 데드크로스', group:'macd', kind:'bin', layers:'2', value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&typeof ind.macd.sig==='number'&&ind.macd.line<ind.macd.sig)?1:0; } },
    { id:'macdHistDn', label:'MACD 히스토 음', group:'macd', kind:'bin', layers:'2', value:function(ind){ return (ind.macd&&typeof ind.macd.hist==='number'&&ind.macd.hist<0)?1:0; } },
    { id:'macdAbove0', label:'MACD 영선위', group:'macd', kind:'bin', layers:'2', value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&ind.macd.line>0)?1:0; } },
    { id:'diBull', label:'DI 상승우위', group:'trend', kind:'bin', layers:'2', value:function(ind){ return (ind.adx&&typeof ind.adx.pdi==='number'&&typeof ind.adx.mdi==='number'&&ind.adx.pdi>ind.adx.mdi)?1:0; } },
    { id:'sarBull', label:'PSAR 상승', group:'trend', kind:'bin', layers:'2', value:function(ind){ return (ind.psar&&ind.psar.trend==='up')?1:0; } },
    { id:'ichiCloudDn', label:'일목 구름아래', group:'ichi', kind:'bin', layers:'2', value:function(ind){ return (ind.ichimoku && ind.ichimoku.priceVsCloud==='below')?1:0; } },
    { id:'ichiTKDn', label:'일목 전환<기준', group:'ichi', kind:'bin', layers:'2', value:function(ind){ var t=ind.ichimoku&&ind.ichimoku.tenkan, k=ind.ichimoku&&ind.ichimoku.kijun; return (_num(t)!=null&&_num(k)!=null&&t<k)?1:0; } },
    { id:'ichiCloudBear', label:'일목 음운', group:'ichi', kind:'bin', layers:'2', value:function(ind){ return (ind.ichimoku && ind.ichimoku.cloudTrend==='bearish')?1:0; } },
    { id:'stochSlowDead', label:'슬로우스토 데드', group:'osc', kind:'bin', layers:'2', value:function(ind){ return (ind.stochSlow && ind.stochSlow.cross==='dead')?1:0; } },
    { id:'chaikinDead', label:'차이킨 데드', group:'flow', kind:'bin', layers:'2', value:function(ind){ return (ind.chaikinOsc && ind.chaikinOsc.cross==='dead')?1:0; } },
    { id:'pcDn', label:'가격채널 하단이탈', group:'band', kind:'bin', layers:'2', value:function(ind){ return (ind.priceChannel && ind.priceChannel.position==='breakout_down')?1:0; } },
    { id:'pivotBelow', label:'피벗 P 하회', group:'band', kind:'bin', layers:'2', value:function(ind){ var l=ind.pivot&&ind.pivot.level; return (l==='S1~P'||l==='S1~S2'||l==='S2-')?1:0; } },
    { id:'rsi50dn', label:'RSI 50 하향', group:'thr', kind:'bin', layers:'2', value:function(ind){ var a=ind.rsi?_num(ind.rsi.val):null, b=_prevOf(ind.rsi&&ind.rsi.arr); return (a!=null&&b!=null&&a<50&&b>=50)?1:0; } },
    { id:'volMaDead', label:'거래량 5×20 데드', group:'thr', kind:'bin', layers:'2', value:function(ind,rows,i){ var ix=_rowIx(rows,ind,i); if(ix<20) return 0; var a5=_volSma(rows,5,ix), a20=_volSma(rows,20,ix), p5=_volSma(rows,5,ix-1), p20=_volSma(rows,20,ix-1); return (a5!=null&&a20!=null&&p5!=null&&p20!=null&&a5<a20&&p5>=p20)?1:0; } },
    { id:'tlbRevDn', label:'삼선전환 하락반전', group:'struct', kind:'bin', layers:'2', value:function(ind){ var t=ind.threeLineBreak; return (t&&t.reversal&&t.direction==='down')?1:0; } },
    { id:'maAlignBull', label:'MA 정배열', group:'trend', kind:'bin', layers:'2', value:function(ind){ return (ind.maAlign&&ind.maAlign.bullish)?1:0; } }
  ];

  // ── [S1095] 별칭 — 구 교차검증/레시피 키(②) → canonical. 실측 100% 동일 확인분만 등록. ──
  var ALIAS = { rsiDiv:'rsiDivBull', obvDiv:'obvDivBull' };

  // ── 소비처용 API ──
  var _byId = {}; FEATURES.forEach(function(f){ _byId[f.id]=f; });
  function _resolve(id){ return ALIAS[id] || id; }

  // 한 봉에서 모든 재료 값 계산 → { id: value }
  function evalAll(ind, rows, i){
    var out = {};
    for(var k=0;k<FEATURES.length;k++){
      var f=FEATURES[k];
      try { out[f.id] = f.value(ind, rows, i); } catch(_e){ out[f.id] = null; }
    }
    return out;
  }
  // 특정 재료만 (별칭 허용)
  function evalOne(id, ind, rows, i){ var f=_byId[_resolve(id)]; if(!f) return null; try{ return f.value(ind,rows,i); }catch(_e){ return null; } }
  // 연속재료만 (crash-IC 측정용 — 무거운 이진 크로스 계산 스킵)
  var _contFeats = FEATURES.filter(function(f){ return f.kind==='cont'; });
  function evalCont(ind, rows, i){ var out={}; for(var k=0;k<_contFeats.length;k++){ var f=_contFeats[k]; try{ out[f.id]=f.value(ind,rows,i); }catch(_e){ out[f.id]=null; } } return out; }

  // 층 필터 — layersHas('2') = 교차검증/레시피 어휘만 · '3' = 시즌3 L0만
  function layersHas(ch){ return FEATURES.filter(function(f){ return f.layers.indexOf(ch)>=0; }).map(function(f){ return f.id; }); }

  // [S1095] 워커-안전 노출 — Worker엔 window가 없다(sx_scan_worker.js importScripts 대상).
  //   기존 `window.SXFeatureLib=` 는 워커서 ReferenceError → importScripts 전체 실패 → 스캔 엔진 사망.
  var _G = (typeof window!=='undefined') ? window : ((typeof self!=='undefined') ? self : (typeof globalThis!=='undefined' ? globalThis : this));
  _G.SXFeatureLib = {
    features: FEATURES,          // 정의 배열 (id/label/group/kind/layers/value)
    byId: _byId,
    alias: ALIAS,
    resolve: _resolve,
    ids: FEATURES.map(function(f){ return f.id; }),
    contIds: FEATURES.filter(function(f){ return f.kind==='cont'; }).map(function(f){ return f.id; }),
    binIds:  FEATURES.filter(function(f){ return f.kind==='bin';  }).map(function(f){ return f.id; }),
    groups:  FEATURES.reduce(function(a,f){ if(a.indexOf(f.group)<0) a.push(f.group); return a; }, []),
    layersHas: layersHas,
    evalAll: evalAll,
    evalCont: evalCont,
    evalOne: evalOne,
    CROSS_NBAR: CROSS_NBAR,
    version: 'S1122'  // [S1122] 129재료(106+거울상 23·layers'2'). 이전: [S1096d] 106재료 — S1095 통합 SSOT 79 + 발굴 27(layers'4'). 자기중복 감사: 이진 자카드≥0.80 2쌍(macdGc≡macdHistUp 동일 · ichiSignal↔ichiCloudUp 0.816) · 연속 |r|≥0.98 0쌍. 매매 무영향(shim 35키 고정)
  };
})();
