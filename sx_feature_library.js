/* ═══════════════════════════════════════════════════════════════════════════
 * sx_feature_library.js — [S999] 통합 재료 라이브러리 (SSOT)
 * ───────────────────────────────────────────────────────────────────────────
 *  목적: 레시피(진짜/가짜 반등)와 위험필터(폭락/안전)가 쓰는 재료를 한 곳에 정의.
 *        각 재료는 value(ind, rows, i) → 연속값(숫자) 또는 이진(0/1) 반환.
 *        임계값은 소비처에서 적용 → 레시피는 IC(순위상관), 위험은 crash-IC / 임계 lift.
 *  통합 원칙: 겹치는 지표(RSI·Stoch·BB·이격·ADX·MACD·거래량)는 연속값으로 1개만.
 *  확장: 새 재료 후보는 아래 FEATURES 배열에 1개 추가 → 레시피·위험 양쪽 자동 사용.
 *  자기완결: recipe_core 의존 없이 ind(calcAllScreener 반환) + rows(OHLCV)로만 계산.
 *  ind 필드 가정: rsi.val/rsi.div, stoch.k, cci, bb.pctB/bb.upper, volOsc, adx.adx/adx.pdi/adx.mdi,
 *                mfi, vr, obv.div/obv.trend, macd.line/macd.sig/macd.hist, psar.trend,
 *                squeeze.squeeze, trend.struct.nearSupport, atr.pct, maDisparity.disparity20,
 *                maAlign.ma60, volumeMA, closes[]
 * ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ── 내부 헬퍼 (자기완결) ──
  function _sma(arr, p, endIdx){
    if(!arr || endIdx < p-1) return null;
    var s=0; for(var k=endIdx-p+1;k<=endIdx;k++){ if(typeof arr[k]!=='number') return null; s+=arr[k]; }
    return s/p;
  }
  // 최근 nBar 내 maFast가 maSlow를 상향(골든)/하향(데드) 교차했나
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
  function _num(v){ return (typeof v==='number' && isFinite(v)) ? v : null; }

  // ── 재료 정의 ──
  //  kind: 'cont'(연속·IC용) | 'bin'(이진 0/1)
  //  dir : 재료 의미 힌트 — 'up'(높을수록 강세/과열) | 'down'(높을수록 약세) | 'flag'
  var FEATURES = [
    // ═══ 오실레이터 (연속) ═══
    { id:'rsi',     label:'RSI',            group:'osc', kind:'cont', value:function(ind){ return ind.rsi?_num(ind.rsi.val):null; } },
    { id:'stochK',  label:'Stoch %K',       group:'osc', kind:'cont', value:function(ind){ return ind.stoch?_num(ind.stoch.k):null; } },
    { id:'cci',     label:'CCI',            group:'osc', kind:'cont', value:function(ind){ return _num(ind.cci); } },
    { id:'bbPctB',  label:'BB %B',          group:'osc', kind:'cont', value:function(ind){ return ind.bb?_num(ind.bb.pctB):null; } },

    // ═══ 이격도 (연속) ═══  — 과열군의 핵심(200종서 crashLift 최강)
    { id:'dev20',   label:'MA20 이격%',      group:'ma', kind:'cont', value:function(ind){ return ind.maDisparity?_num(ind.maDisparity.disparity20):null; } },
    { id:'dev60',   label:'MA60 이격%',      group:'ma', kind:'cont', value:function(ind,rows,i){ var m=ind.maAlign&&ind.maAlign.ma60, c=rows[i]&&rows[i].close; return (m&&c)?+(100*(c-m)/m).toFixed(2):null; } },
    { id:'ma5slope',label:'MA5 기울기%',     group:'ma', kind:'cont', value:function(ind,rows,i){ var cl=ind.closes; if(!cl||i<6) return null; var a=_sma(cl,5,i), b=_sma(cl,5,i-3); return (a!=null&&b!=null&&b!==0)?+(100*(a-b)/Math.abs(b)).toFixed(2):null; } },

    // ═══ 변동성 (연속) ═══
    { id:'atrPct',  label:'ATR%',           group:'vol', kind:'cont', value:function(ind){ return ind.atr?_num(ind.atr.pct):null; } },
    { id:'squeeze', label:'BB 스퀴즈',       group:'vol', kind:'bin',  value:function(ind){ return (ind.squeeze&&ind.squeeze.squeeze)?1:0; } },

    // ═══ 추세강도 (연속/이진) ═══
    { id:'adx',     label:'ADX',            group:'trend', kind:'cont', value:function(ind){ return ind.adx?_num(ind.adx.adx):null; } },
    { id:'diBear',  label:'DI 하락우위',      group:'trend', kind:'bin',  value:function(ind){ return (ind.adx&&typeof ind.adx.pdi==='number'&&typeof ind.adx.mdi==='number'&&ind.adx.mdi>ind.adx.pdi)?1:0; } },
    { id:'sarBear', label:'PSAR 하락',       group:'trend', kind:'bin',  value:function(ind){ return (ind.psar&&ind.psar.trend==='down')?1:0; } },

    // ═══ 추격/과열 (연속) ═══  — 위험 고유(고변동 마커)
    { id:'rise10',  label:'최근10봉 상승%',   group:'chase', kind:'cont', value:function(ind,rows,i){ var s=Math.max(0,i-9), base=rows[s]&&rows[s].close, c=rows[i]&&rows[i].close; return (base>0)?+((c/base-1)*100).toFixed(2):null; } },
    { id:'highProx',label:'고점 근접%',       group:'chase', kind:'cont', value:function(ind,rows,i){ var s=Math.max(0,i-9),hi=0; for(var k=s;k<=i;k++){ if(rows[k].high>hi) hi=rows[k].high; } var c=rows[i]&&rows[i].close; return (hi>0)?+(c/hi*100).toFixed(2):null; } },
    { id:'gapPct',  label:'갭%',             group:'chase', kind:'cont', value:function(ind,rows,i){ if(i<1) return null; var pc=rows[i-1].close, o=rows[i].open; return (pc>0)?+((o/pc-1)*100).toFixed(2):null; } },
    { id:'consecUp',label:'연속 양봉 수',      group:'chase', kind:'cont', value:function(ind,rows,i){ var n=0; for(var k=i;k>=0 && k>i-10;k--){ if(rows[k].close>rows[k].open) n++; else break; } return n; } },

    // ═══ 수급/거래량 (연속) ═══
    { id:'volOsc',  label:'거래량 OSC',       group:'flow', kind:'cont', value:function(ind){ return _num(ind.volOsc); } },
    { id:'vr',      label:'VR(거래량비율)',    group:'flow', kind:'cont', value:function(ind){ return _num(ind.vr); } },
    { id:'mfi',     label:'MFI(자금흐름)',     group:'flow', kind:'cont', value:function(ind){ return _num(ind.mfi); } },
    { id:'volRatio',label:'거래량 배율',       group:'flow', kind:'cont', value:function(ind,rows,i){ var s=Math.max(0,i-20),sum=0,c=0; for(var k=s;k<i;k++){ var v=rows[k].volume||0; if(v>0){sum+=v;c++;} } var a=c?sum/c:0; return (a>0)?+((rows[i].volume||0)/a).toFixed(2):null; } },
    { id:'obvUp',   label:'OBV 상승추세',      group:'flow', kind:'bin',  value:function(ind){ return (ind.obv&&ind.obv.trend==='up')?1:0; } },

    // ═══ MACD (연속/이진) ═══
    { id:'macdHist',    label:'MACD 히스토값',   group:'macd', kind:'cont', value:function(ind){ return (ind.macd)?_num(ind.macd.hist):null; } },
    { id:'macdNegStreak',label:'MACD 연속음전 수',group:'macd', kind:'cont', value:function(ind){ var h=ind.macd&&ind.macd.arr&&ind.macd.arr.hist; if(!h) return null; var n=0; for(var k=h.length-1;k>=0;k--){ if(h[k]<0) n++; else break; } return n; } },
    { id:'macdGc',      label:'MACD 골든크로스',  group:'macd', kind:'bin',  value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&typeof ind.macd.sig==='number'&&ind.macd.line>ind.macd.sig)?1:0; } },
    { id:'macdBelow0',  label:'MACD 영선아래',    group:'macd', kind:'bin',  value:function(ind){ return (ind.macd&&typeof ind.macd.line==='number'&&ind.macd.line<0)?1:0; } },

    // ═══ 다이버전스/구조 (이진) ═══
    { id:'rsiDivBull',label:'RSI 상승다이버',   group:'div', kind:'bin', value:function(ind){ return (ind.rsi&&ind.rsi.div==='bullish')?1:0; } },
    { id:'rsiDivBear',label:'RSI 약세다이버',   group:'div', kind:'bin', value:function(ind){ return (ind.rsi&&ind.rsi.div==='bearish')?1:0; } },
    { id:'obvDivBull',label:'OBV 상승다이버',   group:'div', kind:'bin', value:function(ind){ return (ind.obv&&ind.obv.div==='bullish')?1:0; } },
    { id:'nearSup',   label:'지지선 근접',      group:'struct', kind:'bin', value:function(ind){ return (ind.trend&&ind.trend.struct&&ind.trend.struct.nearSupport)?1:0; } },

    // ═══ 크로스/안착 (이진) ═══
    { id:'gx5_9',   label:'골든크로스 5×9',   group:'cross', kind:'bin', value:function(ind,rows,i){ return _crossed(ind.closes||rows.map(function(r){return r.close;}), i, 5, 9, 3, 'golden'); } },
    { id:'gx5_20',  label:'골든크로스 5×20',  group:'cross', kind:'bin', value:function(ind,rows,i){ return _crossed(ind.closes||rows.map(function(r){return r.close;}), i, 5, 20, 3, 'golden'); } },
    { id:'gx5_60',  label:'골든크로스 5×60',  group:'cross', kind:'bin', value:function(ind,rows,i){ return _crossed(ind.closes||rows.map(function(r){return r.close;}), i, 5, 60, 3, 'golden'); } },
    { id:'deadCross',label:'데드크로스 5×20',  group:'cross', kind:'bin', value:function(ind,rows,i){ return _crossed(ind.closes||rows.map(function(r){return r.close;}), i, 5, 20, 3, 'dead'); } },
    { id:'settle20',label:'MA20 돌파안착',    group:'cross', kind:'bin', value:function(ind,rows,i){ var cl=ind.closes||rows.map(function(r){return r.close;}); var m=_sma(cl,20,i), mp=_sma(cl,20,i-1), cN=cl[i], cP=cl[i-1], c3=cl[i-3]; return (m!=null&&mp!=null&&cN>m&&cP>mp&&c3!=null&&cN>c3)?1:0; } }
  ];

  // ── 소비처용 API ──
  var _byId = {}; FEATURES.forEach(function(f){ _byId[f.id]=f; });

  // 한 봉에서 모든 재료 값 계산 → { id: value }
  function evalAll(ind, rows, i){
    var out = {};
    for(var k=0;k<FEATURES.length;k++){
      var f=FEATURES[k];
      try { out[f.id] = f.value(ind, rows, i); } catch(_e){ out[f.id] = null; }
    }
    return out;
  }
  // 특정 재료만
  function evalOne(id, ind, rows, i){ var f=_byId[id]; if(!f) return null; try{ return f.value(ind,rows,i); }catch(_e){ return null; } }
  // 연속재료만 (crash-IC 측정용 — 무거운 이진 크로스 계산 스킵)
  var _contFeats = FEATURES.filter(function(f){ return f.kind==='cont'; });
  function evalCont(ind, rows, i){ var out={}; for(var k=0;k<_contFeats.length;k++){ var f=_contFeats[k]; try{ out[f.id]=f.value(ind,rows,i); }catch(_e){ out[f.id]=null; } } return out; }

  window.SXFeatureLib = {
    features: FEATURES,          // 정의 배열 (id/label/group/kind/value)
    byId: _byId,
    ids: FEATURES.map(function(f){ return f.id; }),
    contIds: FEATURES.filter(function(f){ return f.kind==='cont'; }).map(function(f){ return f.id; }),
    binIds:  FEATURES.filter(function(f){ return f.kind==='bin';  }).map(function(f){ return f.id; }),
    evalAll: evalAll,
    evalCont: evalCont,
    evalOne: evalOne,
    version: 'S999'
  };
})();
