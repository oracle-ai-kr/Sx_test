// ════════════════════════════════════════════════════════════════
//  sx_candle_bt.js  —  [S525] 캔들 전이 미니 백테스트  (+[S530] 뒤로가기 닫기·임계값 선택)  (+[S601] 자기유사도 kNN 대안경로 비교)  (+[S603] kNN 창길이/K 토글 A/B)  (+[S604] 9조합 자동탐색·JSON 다운로드) (+[S605] 랭킹 게이트+가중에지 정렬)
//  목적: 분석탭 '캔들 전이 점수'(실험 카드)의 다음봉 색 예측 적중률을
//        과거 데이터로 워크포워드 검증한다. "이 점수가 베이스라인(단순 양봉비율)보다 나은가"를 본다.
//
//  룩어헤드 없음: 각 과거 봉 i에 대해 rows[0..i]까지의 데이터로만
//        SXE.calcAllScreener(slice) → _candleTransitionScore(slice) 예측 후, 실제 다음 봉 rows[i+1]과 대조.
//
//  [S530] 무거운 표본수집(calcAllScreener 루프)은 1회만 → _cache. 임계값(30/40/50)은 캐시 재집계라 즉시.
//  [S530] 닫기: 앱 공통 패턴(history.pushState{view:'candleBTModal'} + 중앙 popstate 핸들러가 DOM 제거).
//
//  의존: window.SXE.calcAllScreener, window._candleTransitionScore (sx_render.js), window._sxCTBT.
//  로드 순서: sx_analysis_engine.js → sx_render.js → (이 파일).
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var MIN_BARS = 60;            // 신호 산출에 필요한 최소 과거 봉
  var DEFAULT_MAX = 150;        // 기본 검증 표본 수 (모바일 성능 고려)
  var THRESHOLDS = [20, 30, 35, 40, 45, 50];// [S533] 35/45 추가 — sweet spot(≈40) 주변 촘촘히 / [S539] 20 추가 — 단일봉 약확신 콜(±20~30) edge 검증용
  var STRONG = 50;              // 강신호 버킷 경계

  var _cache = null;            // 마지막 표본 캐시 {ok, samples:[{score,knn,up,regime,i}], rows, evaluated, baseUpRate, baseDnRate, window, errors}
  var _curThr = 30;             // 현재 선택 임계
  var _knnWin = 8;              // [S603] kNN 창 길이 토글 (8/12/16)
  var _knnK = 25;               // [S603] kNN 이웃 수 토글 (10/25/50)
  var _knnGrid = null;          // [S604] 자동탐색 결과 {combos:[{win,K,knn:[score|null,...]}], builtAt} — knn 원본배열 보관(임계 재집계용)

  function _isUp(r){ return (+r.close) >= (+r.open); }
  // [S542] 레짐 분류 — ADX(추세 강도, 자산 무관) + 20/60MA 방향. 신호봉 i 시점, 룩어헤드 없음.
  //   불장(강한 상승)/상승장(완만 상승)/하락장/횡보장(ADX<20 추세 약함). 측정 전용 — 예측 로직 무관.
  var RG_LABEL = { bull:'불장', up:'상승장', side:'횡보장', down:'하락장' };
  var RG_ORDER = ['bull', 'up', 'side', 'down'];
  function _regimeAt(rows, i, ind){
    if(i < 60) return 'side';
    var ma = function(len){ var s=0,k; for(k=i-len+1;k<=i;k++) s += +rows[k].close; return s/len; };
    var ma20 = ma(20), ma60 = ma(60);
    var adx = (ind && ind.adx && ind.adx.adx != null) ? +ind.adx.adx : null;
    if(adx == null || adx < 20) return 'side';      // 추세 약함 = 횡보장
    if(ma20 >= ma60) return adx >= 35 ? 'bull' : 'up';  // 상승 방향: 강하면 불장, 완만하면 상승장
    return 'down';                                    // 하락 방향
  }
  function _pct(h, p){ return p > 0 ? Math.round((h / p) * 1000) / 10 : null; }

  // ── 표본 수집 (무거운 부분 — 1회만) : 각 봉의 {score, up} ──
  function runBacktest(rows, market, tf, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    var n = rows.length;
    if(n < MIN_BARS + 5) return { ok:false, reason:'데이터 부족 (최소 ' + (MIN_BARS + 5) + '봉 필요, 현재 ' + n + '봉)' };
    if(typeof SXE === 'undefined' || !SXE.calcAllScreener || typeof _candleTransitionScore !== 'function')
      return { ok:false, reason:'엔진 미로드 (SXE / 전이 함수)' };

    var maxTests = opts.maxTests || DEFAULT_MAX;
    var startI = Math.max(MIN_BARS, n - 1 - maxTests);
    var samples = [], baseUp = 0, errors = 0, regimeBase = {};   // [S542] regimeBase: 레짐별 {n, up} = 레짐 자체 베이스라인
    // [S601] 자기유사도 kNN 사전벡터 1회 구축 (가속). 인덱스 필터로 룩어헤드 차단 — sx_candle_knn.js 참고.
    var _knnPre = null, _knnOn = (typeof SXKNN !== 'undefined' && SXKNN.buildVecs && SXKNN.scoreAt);
    if(_knnOn){ try { _knnPre = SXKNN.buildVecs(rows); } catch(ek){ _knnPre = null; } }

    for(var i = startI; i <= n - 2; i++){
      var slice = rows.slice(0, i + 1);   // rows[0..i] — i가 신호(확정)봉, i+1이 예측 대상
      var ind, r;
      try { ind = SXE.calcAllScreener(slice, tf || 'day'); } catch(e1){ errors++; continue; }
      try { r = _candleTransitionScore(slice, ind, market, tf || 'day'); } catch(e2){ errors++; continue; }
      if(!r || !r.active) continue;
      var up = _isUp(rows[i + 1]);
      var rg = _regimeAt(rows, i, ind);   // [S542] 신호봉 시점 레짐
      // [S601] kNN 점수 (대안 경로) — 신호봉 i의 창을 쿼리, 후보는 i-1까지(룩어헤드 없음). inactive면 null.
      var _knn = null;
      if(_knnPre){ try { var _rk = SXKNN.scoreAt(rows, i, _knnPre); if(_rk && _rk.active) _knn = _rk.score; } catch(e3){} }
      samples.push({ score: r.score, knn: _knn, up: up, regime: rg, i: i });   // [S603] i = 봉 인덱스 (kNN win/K 토글 재계산용)
      if(up) baseUp++;
      if(!regimeBase[rg]) regimeBase[rg] = { n: 0, up: 0 };
      regimeBase[rg].n++; if(up) regimeBase[rg].up++;
    }
    var evaluated = samples.length;
    var baseUpRate = evaluated > 0 ? Math.round((baseUp / evaluated) * 1000) / 10 : null;
    return {
      ok: true,
      samples: samples,
      rows: rows,                                                              // [S603] kNN win/K 토글 시 재계산용 (rule 표본은 불변)
      evaluated: evaluated,
      baseUpRate: baseUpRate,                                                  // 베이스라인: 양봉 예측이 넘어야 할 기준
      baseDnRate: baseUpRate != null ? Math.round((100 - baseUpRate) * 10) / 10 : null,
      regimeBase: regimeBase,                                                  // [S542] 레짐별 베이스라인
      window: { from: rows[startI].date, to: rows[n - 1].date, bars: (n - 1) - startI },
      errors: errors
    };
  }

  // ── 임계값별 집계 (캐시 표본 재사용 — 재계산 없음) ──
  function _aggregate(bt, thr){
    var pred=0, hit=0, neutral=0, bullPred=0, bullHit=0, bearPred=0, bearHit=0;
    var strong = { p:0, h:0 }, mid = { p:0, h:0 };
    // [S601] kNN 집계 (같은 임계·같은 베이스라인 — 룰과 직접 비교)
    var kPred=0, kHit=0, kNeu=0, kInact=0, kBullP=0, kBullH=0, kBearP=0, kBearH=0;
    for(var k=0; k<bt.samples.length; k++){
      var sc = bt.samples[k].score, up = bt.samples[k].up;
      if(Math.abs(sc) < thr){ neutral++; }
      else {
        var predUp = sc > 0, ok = (predUp === up);
        pred++; if(ok) hit++;
        var bk = (Math.abs(sc) >= STRONG) ? strong : mid; bk.p++; if(ok) bk.h++;
        if(predUp){ bullPred++; if(ok) bullHit++; } else { bearPred++; if(ok) bearHit++; }
      }
      // kNN
      var kn = bt.samples[k].knn;
      if(kn == null){ kInact++; }
      else if(Math.abs(kn) < thr){ kNeu++; }
      else {
        var kUp = kn > 0, kok = (kUp === up);
        kPred++; if(kok) kHit++;
        if(kUp){ kBullP++; if(kok) kBullH++; } else { kBearP++; if(kok) kBearH++; }
      }
    }
    return {
      thr: thr, evaluated: bt.evaluated, pred: pred, neutral: neutral,
      hitRate: _pct(hit, pred),
      bullPred: bullPred, bullHitRate: _pct(bullHit, bullPred),
      bearPred: bearPred, bearHitRate: _pct(bearHit, bearPred),
      baseUpRate: bt.baseUpRate, baseDnRate: bt.baseDnRate,
      strong: { n: strong.p, rate: _pct(strong.h, strong.p) },
      mid:    { n: mid.p,    rate: _pct(mid.h,    mid.p) },
      knn: { pred:kPred, hitRate:_pct(kHit,kPred), neutral:kNeu, inactive:kInact,
             bullPred:kBullP, bullHitRate:_pct(kBullH,kBullP),
             bearPred:kBearP, bearHitRate:_pct(kBearH,kBearP) },   // [S601]
      regime: _aggregateRegime(bt.samples, bt.regimeBase || {}, thr),   // [S542] 레짐별 breakdown
      window: bt.window, errors: bt.errors
    };
  }

  // ── 렌더 헬퍼 ──
  // [S542] 레짐별 집계 — samples(레짐 태그)+regimeBase로 레짐 자체 베이스라인 대비 음봉/양봉 edge 산출. 단일·바스켓 공용.
  function _aggregateRegime(samples, regimeBase, thr){
    var R = {};
    for(var rg in regimeBase){ var b = regimeBase[rg]; R[rg] = { n:b.n, baseUp:_pct(b.up,b.n), baseDn:_pct(b.n-b.up,b.n), bullP:0,bullH:0,bearP:0,bearH:0 }; }
    samples.forEach(function(s){
      if(Math.abs(s.score) < thr) return;
      var r = R[s.regime]; if(!r) return;
      if(s.score > 0){ r.bullP++; if(s.up) r.bullH++; } else { r.bearP++; if(!s.up) r.bearH++; }
    });
    return R;
  }
  function _renderRegime(R, thr){
    if(!R) return '';
    var rows = '';
    RG_ORDER.forEach(function(rg){
      var r = R[rg]; if(!r || r.n < 5) return;
      var bearHit = _pct(r.bearH, r.bearP), bullHit = _pct(r.bullH, r.bullP);
      var bearEdge = (bearHit!=null && r.baseDn!=null) ? Math.round((bearHit-r.baseDn)*10)/10 : null;
      var bullEdge = (bullHit!=null && r.baseUp!=null) ? Math.round((bullHit-r.baseUp)*10)/10 : null;
      rows += '<div style="padding:6px 0;border-bottom:1px solid var(--border)">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text)">' + RG_LABEL[rg]
        +   ' <span style="font-size:9px;font-weight:600;color:var(--text3)">· ' + r.n + '봉 · 기준 상승 ' + (r.baseUp!=null?r.baseUp+'%':'—') + '</span></div>'
        + '<div style="display:flex;gap:10px;font-size:11px;margin-top:2px">'
        +   '<span style="flex:1;color:var(--text2)">🔻 음봉 <b style="color:var(--text)">' + (bearHit!=null?bearHit+'%':'—') + '</b> ' + _bEdge(bearEdge) + ' <span style="font-size:9px;color:var(--text3)">(' + r.bearP + ')</span></span>'
        +   '<span style="flex:1;color:var(--text2)">🔺 양봉 <b style="color:var(--text)">' + (bullHit!=null?bullHit+'%':'—') + '</b> ' + _bEdge(bullEdge) + ' <span style="font-size:9px;color:var(--text3)">(' + r.bullP + ')</span></span>'
        + '</div></div>';
    });
    if(!rows) return '';
    return '<div style="margin-top:12px;padding:10px 11px;background:var(--surface2);border-radius:9px">'
      + '<div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:4px">📊 레짐별 적중 (|점수|≥' + thr + ') <span style="font-size:8px;padding:1px 5px;border-radius:4px;background:var(--surface);color:var(--text3);border:1px solid var(--border)">실험</span></div>'
      + rows
      + '<div style="font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6">레짐 = ADX(추세강도)+20/60MA 방향 · 각 레짐 <b>자체 베이스라인</b> 대비 edge. 같은 종목도 추세 구간에 따라 적중률이 달라지는지 보는 검증. ()=예측 건수.</div></div>';
  }

  function _edgeBadge(rate, base){
    if(rate == null || base == null) return '';
    var d = Math.round((rate - base) * 10) / 10;
    var c = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#6b7280';
    return '<span style="color:' + c + ';font-weight:800">' + (d > 0 ? '+' : '') + d + '%p</span>';
  }
  // [S603] kNN 창길이/K 토글 (A/B · 즉시 재계산). rule 표본 불변이라 빠름.
  function _knnToggles(){
    var WINS = (typeof SXKNN!=='undefined'&&SXKNN.WINS)||[8,12,16];
    var KS = (typeof SXKNN!=='undefined'&&SXKNN.KS)||[10,25,50];
    function row(label, suffix, arr, cur, fn){
      return '<div style="display:flex;align-items:center;gap:5px;margin-top:6px">'
        + '<span style="font-size:9px;color:var(--text3);width:30px;flex-shrink:0">' + label + '</span>'
        + arr.map(function(x){ var on=(x===cur);
            return '<button onclick="window.SXCandleBT&&SXCandleBT.' + fn + '(' + x + ')" style="flex:1;font-size:10px;font-weight:' + (on?800:600) + ';padding:5px 0;border-radius:6px;cursor:pointer;'
              + (on?'color:#fff;background:#7c3aed;border:1px solid #7c3aed':'color:var(--text2);background:var(--surface);border:1px solid var(--border)') + '">' + x + suffix + '</button>';
          }).join('')
        + '</div>';
    }
    return '<div style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--border)">'
      + '<div style="font-size:9px;color:var(--text3)">⚙️ kNN 튜닝 (A/B · 즉시 재계산)</div>'
      + row('창', '봉', WINS, _knnWin, 'setKnnWin')
      + row('K', '', KS, _knnK, 'setKnnK')
      + '</div>';
  }
  // [S604] kNN 점수배열을 임계 thr로 집계 (_cache.samples의 up·베이스라인 사용). _aggregate의 kNN부와 동일 로직.
  function _aggKnnArr(knnArr, thr){
    var samples=_cache.samples, baseUp=_cache.baseUpRate, baseDn=_cache.baseDnRate;
    var pred=0,hit=0,neu=0,inact=0,bP=0,bH=0,rP=0,rH=0;
    for(var k=0;k<samples.length;k++){
      var kn=knnArr[k], up=samples[k].up;
      if(kn==null){ inact++; continue; }
      if(Math.abs(kn)<thr){ neu++; continue; }
      var u=kn>0, ok=(u===up); pred++; if(ok)hit++;
      if(u){ bP++; if(ok)bH++; } else { rP++; if(ok)rH++; }
    }
    var bHit=_pct(bH,bP), rHit=_pct(rH,rP);
    return { pred:pred, hitRate:_pct(hit,pred), neutral:neu, inactive:inact,
             bullPred:bP, bullHitRate:bHit, bearPred:rP, bearHitRate:rHit,
             bullEdge:(bHit!=null&&baseUp!=null)?Math.round((bHit-baseUp)*10)/10:null,
             bearEdge:(rHit!=null&&baseDn!=null)?Math.round((rHit-baseDn)*10)/10:null };
  }
  // [S604] 자동탐색 결과표 (현재 임계 thr 기준). 적중률 내림차순, 신뢰(예측≥10) 최상위 강조.
  var KNN_GATE = 15;   // [S605] 신뢰 표본 게이트 — 예측 N건 미만은 랭킹 하단·흐리게(노이즈 차단)
  function _renderKnnGrid(thr){
    if(!_knnGrid) return '';
    var arr=_knnGrid.combos.map(function(c){
      var a=_aggKnnArr(c.knn, thr);
      // [S605] edge = 예측수 가중 방향 edge (한쪽 소표본이 튀어도 안 부풀려짐)
      var num=0, den=0;
      if(a.bullEdge!=null){ num+=a.bullEdge*a.bullPred; den+=a.bullPred; }
      if(a.bearEdge!=null){ num+=a.bearEdge*a.bearPred; den+=a.bearPred; }
      var edgeW = den>0 ? Math.round((num/den)*10)/10 : null;
      return { key:c.win+'×'+c.K, hitRate:a.hitRate, pred:a.pred, edge:edgeW, ok:(a.pred>=KNN_GATE) };
    });
    // [S605] 신뢰권(예측≥GATE) 먼저: 에지↓ → 확률↓ → 건수↓. 표본부족은 아래로(건수↓), 흐리게.
    arr.sort(function(x,y){
      if(x.ok!==y.ok) return x.ok ? -1 : 1;
      if(x.ok){
        var ex=x.edge==null?-999:x.edge, ey=y.edge==null?-999:y.edge; if(ey!==ex) return ey-ex;
        var hx=x.hitRate==null?-1:x.hitRate, hy=y.hitRate==null?-1:y.hitRate; if(hy!==hx) return hy-hx;
      }
      return y.pred-x.pred;
    });
    var bestKey=null, anyOk=false; for(var i=0;i<arr.length;i++){ if(arr[i].ok){ bestKey=arr[i].key; anyOk=true; break; } }
    var head='<div style="display:flex;font-size:9px;color:var(--text3);font-weight:700;padding:3px 4px;border-bottom:1px solid var(--border)">'
      + '<span style="flex:1.2">조합(창×K)</span><span style="flex:1;text-align:right">edge</span><span style="flex:1;text-align:right">적중률</span><span style="flex:0.8;text-align:right">건수</span></div>';
    var body=arr.map(function(r){
      var on=(r.key===bestKey);
      var dim=!r.ok;
      var hc=dim?'var(--text3)':r.hitRate==null?'var(--text3)':r.hitRate>=55?'#16a34a':r.hitRate>=50?'#f59e0b':'#dc2626';
      var ec=dim?'var(--text3)':r.edge==null?'var(--text3)':r.edge>0?'#16a34a':r.edge<0?'#dc2626':'var(--text3)';
      return '<div style="display:flex;align-items:center;font-size:11px;padding:4px;border-radius:5px;'+(on?'background:#7c3aed18;':'')+(dim?'opacity:.45;':'')+'">'
        + '<span style="flex:1.2;font-weight:'+(on?800:600)+';color:var(--text)">'+(on?'⭐ ':'')+r.key+'</span>'
        + '<span style="flex:1;text-align:right;font-weight:700;color:'+ec+'">'+(r.edge!=null?(r.edge>0?'+':'')+r.edge:'—')+'</span>'
        + '<span style="flex:1;text-align:right;font-weight:700;color:'+hc+'">'+(r.hitRate!=null?r.hitRate+'%':'—')+'</span>'
        + '<span style="flex:0.8;text-align:right;color:var(--text3)">'+r.pred+'</span></div>';
    }).join('');
    return '<div style="margin-top:8px;padding:8px 9px;background:var(--surface);border:1px solid var(--border);border-radius:9px">'
      + '<div style="font-size:10px;font-weight:800;color:var(--text);margin-bottom:4px">🔍 9조합 자동탐색 <span style="font-size:9px;font-weight:600;color:var(--text3)">· |점수|≥'+thr+' · ⭐=신뢰권 최상위</span></div>'
      + head + body
      + '<div style="font-size:9px;color:var(--text3);margin-top:5px;line-height:1.6">정렬 = <b>예측 '+KNN_GATE+'건↑(신뢰권)</b> 먼저, 그 안에서 <b>에지→확률→건수</b>. 예측 '+KNN_GATE+'건 미만은 흐리게(아래) — 운빨이라 순위서 제외.'+(anyOk?'':' <b style="color:#dc2626">이 임계엔 신뢰권 조합이 없어요 — 임계를 낮춰보세요.</b>')+' edge=예측수 가중(베이스라인 대비). 임계 버튼 바꾸면 재집계.</div></div>';
  }
  // [S604] 자동탐색 버튼(미실행) 또는 결과표+JSON저장 버튼(실행후)
  function _knnGridBlock(){
    if(!_knnGrid){
      return '<div style="margin-top:8px"><button id="sxKnnGridBtn" onclick="window.SXCandleBT&&SXCandleBT.runKnnGrid()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#7c3aed;background:var(--surface);border:1px solid #7c3aed66">🔍 창·K 9조합 자동탐색</button></div>';
    }
    return _renderKnnGrid(_curThr)
      + '<div style="margin-top:6px"><button onclick="window.SXCandleBT&&SXCandleBT.downloadKnnJson()" style="width:100%;font-size:11px;font-weight:700;padding:7px 0;border-radius:8px;cursor:pointer;color:var(--text);background:var(--surface);border:1px solid var(--border)">⬇️ 탐색결과 JSON 저장</button></div>';
  }
  // [S601] 자기유사도 kNN 비교 카드 — 같은 임계·같은 베이스라인에서 룰과 나란히. 실험.
  function _renderKnn(a){
    var kn = a.knn; if(!kn) return '';
    var badge = '<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:var(--surface);color:var(--text3);border:1px solid var(--border)">실험</span>';
    if(kn.pred === 0){
      var why = (kn.inactive > 0 && kn.neutral === 0) ? ('kNN 미가동 (모듈 미로드 또는 표본 부족 ' + kn.inactive + '건)')
                : ('|점수|≥' + a.thr + '인 kNN 방향 예측 없음 (중립 ' + kn.neutral + '건' + (kn.inactive?' · 미가동 '+kn.inactive+'건':'') + ') — 임계를 낮춰보세요');
      return '<div style="margin-top:12px;padding:9px 11px;background:var(--surface2);border-radius:9px;border-left:3px solid #7c3aed">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text)">🧬 자기유사도 kNN ' + badge + '</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:3px">' + why + '</div>'
        + _knnToggles() + _knnGridBlock() + '</div>';
    }
    var kr = kn.hitRate, krCol = kr==null?'var(--text)':kr>=60?'#16a34a':kr>=50?'#f59e0b':'#dc2626';
    var cmp = '';
    if(kr!=null && a.hitRate!=null){
      var d = Math.round((kr - a.hitRate)*10)/10;
      cmp = d>0 ? '✓ 룰 기반(' + a.hitRate + '%)보다 <b style="color:#16a34a">+' + d + '%p</b> 높음'
          : d<0 ? '△ 룰 기반(' + a.hitRate + '%)보다 <b style="color:#dc2626">' + d + '%p</b> 낮음'
          : '룰 기반(' + a.hitRate + '%)과 동률';
    }
    return '<div style="margin-top:12px;padding:10px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid #7c3aed">'
      + '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">'
      +   '<span style="font-size:12px;font-weight:800;color:var(--text)">🧬 자기유사도 kNN</span>' + badge
      +   '<span style="margin-left:auto;font-size:18px;font-weight:800;color:' + krCol + '">' + (kr!=null?kr+'%':'—') + '</span>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);margin:-2px 0 6px">전체 적중률 · |점수|≥' + a.thr + ' 예측 ' + kn.pred + '건 · 중립 ' + kn.neutral + ' · 미가동 ' + kn.inactive + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span style="color:var(--text2)">🔺 양봉</span>'
      +   '<span style="font-weight:700">' + (kn.bullHitRate!=null?kn.bullHitRate+'%':'—') + ' ' + _edgeBadge(kn.bullHitRate, a.baseUpRate) + ' <span style="font-size:10px;color:var(--text3)">· ' + kn.bullPred + '건</span></span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span style="color:var(--text2)">🔻 음봉</span>'
      +   '<span style="font-weight:700">' + (kn.bearHitRate!=null?kn.bearHitRate+'%':'—') + ' ' + _edgeBadge(kn.bearHitRate, a.baseDnRate) + ' <span style="font-size:10px;color:var(--text3)">· ' + kn.bearPred + '건</span></span></div>'
      + (cmp ? '<div style="font-size:10px;color:var(--text2);margin-top:6px;line-height:1.6">' + cmp + '</div>' : '')
      + '<div style="font-size:9px;color:var(--text3);margin-top:5px;line-height:1.6">최근 ' + _knnWin + '봉을 정규화 벡터로 만들어 같은 종목 과거 ' + _knnWin + '봉 중 가장 닮은 ' + _knnK + '개의 다음봉 색으로 예측. 룩어헤드 없음 · 베이스라인 동일.</div>'
      + _knnToggles()
      + _knnGridBlock()
      + '</div>';
  }
  function _rowH(label, value, sub){
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">'
      + '<span style="font-size:12px;color:var(--text2)">' + label + '</span>'
      + '<span style="font-size:13px;font-weight:700;color:var(--text)">' + value + (sub ? ' <span style="font-size:10px;font-weight:600;color:var(--text3)">' + sub + '</span>' : '') + '</span></div>';
  }
  function _thrButtons(cur){
    return '<div style="display:flex;gap:4px;justify-content:center;margin:0 0 12px">'
      + THRESHOLDS.map(function(t){
          var on = (t === cur);
          return '<button onclick="window.SXCandleBT&&SXCandleBT.setThr(' + t + ')" style="flex:1;font-size:12px;font-weight:' + (on ? 800 : 600) + ';padding:7px 0;border-radius:8px;cursor:pointer;white-space:nowrap;'
            + (on ? 'color:#fff;background:#7c3aed;border:1px solid #7c3aed' : 'color:var(--text2);background:var(--surface2);border:1px solid var(--border)') + '">≥' + t + '</button>';
        }).join('')
      + '</div>';
  }

  function _renderResults(a){
    if(!a.ok && a.reason) return '<div style="font-size:12px;color:#dc2626;padding:14px 2px">검증 불가 — ' + a.reason + '</div>';
    if(a.pred === 0) return '<div style="font-size:12px;color:var(--text3);padding:10px 2px">표본 ' + a.evaluated + '봉 중 |점수|≥' + a.thr + '인 방향 예측이 없습니다. 임계값을 낮추거나 다른 종목으로 시도해보세요.</div>';

    var hr = a.hitRate;
    var hrCol = hr == null ? 'var(--text)' : hr >= 60 ? '#16a34a' : hr >= 50 ? '#f59e0b' : '#dc2626';
    var head = '<div style="text-align:center;margin:2px 0 12px">'
      + '<div style="font-size:34px;font-weight:800;color:' + hrCol + ';line-height:1">' + (hr != null ? hr + '%' : '—') + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px">전체 적중률 · |점수|≥' + a.thr + ' 예측 ' + a.pred + '건 / 평가 ' + a.evaluated + '봉</div></div>';

    var body = ''
      + _rowH('🔺 양봉 예측', (a.bullHitRate != null ? a.bullHitRate + '%' : '—') + ' ' + _edgeBadge(a.bullHitRate, a.baseUpRate), a.bullPred + '건 · 기준 ' + (a.baseUpRate != null ? a.baseUpRate + '%' : '—'))
      + _rowH('🔻 음봉 예측', (a.bearHitRate != null ? a.bearHitRate + '%' : '—') + ' ' + _edgeBadge(a.bearHitRate, a.baseDnRate), a.bearPred + '건 · 기준 ' + (a.baseDnRate != null ? a.baseDnRate + '%' : '—'))
      + _rowH('💪 강신호 (|점수|≥' + STRONG + ')', (a.strong.rate != null ? a.strong.rate + '%' : '—'), a.strong.n + '건')
      + (a.thr < STRONG ? _rowH('· 중신호 (' + a.thr + '~' + (STRONG - 1) + ')', (a.mid.rate != null ? a.mid.rate + '%' : '—'), a.mid.n + '건') : '')
      + _rowH('중립(예측 보류)', a.neutral + '건', '');

    var interp = '';
    if(a.baseUpRate != null && hr != null){
      var beatsBase = (a.bullHitRate != null && a.bullHitRate > a.baseUpRate) || (a.bearHitRate != null && a.bearHitRate > a.baseDnRate);
      var strongBeats = (a.strong.n >= 5 && a.strong.rate != null && a.mid.rate != null && a.strong.rate > a.mid.rate);
      interp = '<div style="font-size:11px;color:var(--text2);line-height:1.7;margin-top:10px;padding:9px 11px;background:var(--surface2);border-radius:9px">'
        + (beatsBase ? '✓ 한쪽 이상이 베이스라인을 상회 — 점수에 예측력이 있습니다. ' : '△ 베이스라인 대비 우위가 약합니다 — 임계를 올리거나 신호 가중치 조정 여지. ')
        + (a.thr < STRONG && strongBeats ? '강신호(≥' + STRONG + ')가 중신호보다 적중률이 높아 점수 크기가 신뢰도와 비례합니다 — 임계를 올릴수록 정확↑·표본↓.' : '')
        + '</div>';
    }

    var foot = '<div style="font-size:9px;color:var(--text3);margin-top:10px;border-top:1px solid var(--border);padding-top:7px;line-height:1.6">'
      + '기간 ' + (a.window.from || '') + ' ~ ' + (a.window.to || '') + ' · ' + a.window.bars + '봉 워크포워드 · 룩어헤드 없음<br>'
      + '베이스라인 = 무작정 그 방향으로 찍었을 때 적중률. 이걸 넘겨야 예측력 있음.'
      + (a.errors ? ' · 계산 스킵 ' + a.errors + '건' : '')
      + '</div>';

    return _thrButtons(a.thr) + head + body + interp + _renderKnn(a) + _renderRegime(a.regime, a.thr) + foot;
  }

  // ── 캐시 기반 재렌더 (임계값만 바꿀 때) ──
  function _renderInto(){
    var body = document.getElementById('sxCTBTBody');
    if(!body) return;
    if(!_cache || !_cache.ok){ body.innerHTML = _renderResults(_cache || { ok:false, reason:'표본 없음' }); return; }
    body.innerHTML = _renderResults(_aggregate(_cache, _curThr));
  }
  function setThr(t){ _curThr = t; _renderInto(); }
  // [S603] kNN 창길이/K 토글 — rule 표본(calcAllScreener)은 불변, kNN 점수만 재계산(가볍다). 룩어헤드 없음.
  function _recomputeKnn(){
    if(!_cache || !_cache.ok || !Array.isArray(_cache.rows)) return;
    if(typeof SXKNN === 'undefined' || !SXKNN.buildVecs || !SXKNN.scoreAt) return;
    var pre; try { pre = SXKNN.buildVecs(_cache.rows, _knnWin); } catch(e){ return; }
    for(var k=0;k<_cache.samples.length;k++){
      var smp=_cache.samples[k];
      if(smp.i == null){ smp.knn=null; continue; }
      try { var r=SXKNN.scoreAt(_cache.rows, smp.i, pre, { k:_knnK }); smp.knn = (r && r.active) ? r.score : null; }
      catch(e2){ smp.knn=null; }
    }
  }
  function setKnnWin(w){ if(w===_knnWin) return; _knnWin = w; _recomputeKnn(); _renderInto(); }
  function setKnnK(k){ if(k===_knnK) return; _knnK = k; _recomputeKnn(); _renderInto(); }
  // [S604] 9조합(창3×K3) 자동탐색 — rule 표본 불변, 조합별 kNN 점수배열만 수집(가볍다). 룩어헤드 없음.
  async function runKnnGrid(){
    if(!_cache || !_cache.ok || !Array.isArray(_cache.rows)) return;
    if(typeof SXKNN === 'undefined' || !SXKNN.buildVecs || !SXKNN.scoreAt) return;
    var rows=_cache.rows, samples=_cache.samples;
    var WINS=(SXKNN.WINS||[8,12,16]), KS=(SXKNN.KS||[10,25,50]);
    var btn=document.getElementById('sxKnnGridBtn');
    var combos=[];
    for(var wi=0; wi<WINS.length; wi++){
      var win=WINS[wi];
      if(btn) btn.textContent='탐색 중… 창 '+win+'봉 ('+(wi+1)+'/'+WINS.length+')';
      await _sleep(0);
      var pre; try { pre=SXKNN.buildVecs(rows, win); } catch(e){ continue; }
      for(var ki=0; ki<KS.length; ki++){
        var Kv=KS[ki], arr=[];
        for(var s=0; s<samples.length; s++){
          var smp=samples[s], sc=null;
          if(smp.i!=null){ try { var r=SXKNN.scoreAt(rows, smp.i, pre, { k:Kv }); if(r && r.active) sc=r.score; } catch(e2){} }
          arr.push(sc);
        }
        combos.push({ win:win, K:Kv, knn:arr });
        await _sleep(0);
      }
    }
    _knnGrid={ combos:combos, builtAt:Date.now() };
    _renderInto();
  }
  // [S604] 탐색결과 JSON 다운로드 — 임계별 룰/조합 집계 + 봉별 원본(다종목 교차분석용). Blob 저장.
  function downloadKnnJson(){
    if(!_knnGrid || !_cache || !_cache.ok){ alert('먼저 자동탐색을 실행하세요.'); return; }
    var ctx=window._sxCTBT || {}, samples=_cache.samples;
    var ruleByThr={}; THRESHOLDS.forEach(function(t){ var a=_aggregate(_cache,t);
      ruleByThr[t]={ hitRate:a.hitRate, pred:a.pred, neutral:a.neutral, bullPred:a.bullPred, bullHitRate:a.bullHitRate, bearPred:a.bearPred, bearHitRate:a.bearHitRate }; });
    var grid=_knnGrid.combos.map(function(c){ var byThr={}; THRESHOLDS.forEach(function(t){ byThr[t]=_aggKnnArr(c.knn,t); }); return { win:c.win, K:c.K, byThr:byThr }; });
    var samp=samples.map(function(smp,idx){ var kn={}; _knnGrid.combos.forEach(function(c){ kn[c.win+'_'+c.K]=c.knn[idx]; });
      return { i:smp.i, date:((_cache.rows[smp.i]||{}).date)||null, up:smp.up?1:0, regime:smp.regime, rule:smp.score, knn:kn }; });
    var payload={ app:'SIGNAL X', feature:'candle_knn_grid', serial:'S604', generatedAt:new Date().toISOString(),
      stock:ctx.name||'', market:ctx.market||'', tf:ctx.tf||'day',
      window:_cache.window, evaluated:_cache.evaluated, baseline:{ up:_cache.baseUpRate, dn:_cache.baseDnRate },
      thresholds:THRESHOLDS, rule:{ byThr:ruleByThr }, grid:grid, samples:samp };
    var nm=(ctx.name||'stock').replace(/[^\w가-힣]/g,'_');
    var asOf=(((_cache.window||{}).to)||'').replace(/[^\d]/g,'');
    var fn='sx_knn_'+nm+(asOf?'_'+asOf:'')+'.json';
    try {
      var blob=new Blob([JSON.stringify(payload)], { type:'application/json' });
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=url; a.download=fn; document.body.appendChild(a); a.click();
      setTimeout(function(){ try{ document.body.removeChild(a); }catch(_){} URL.revokeObjectURL(url); }, 120);
    } catch(e){ alert('다운로드 실패: '+(e&&e.message?e.message:e)); }
  }

  // ════════ [S532] 바스켓 스윕 — 관심목록 여러 종목 풀링 + 종목별 베이스라인 상회 카운트 (과적합 점검) ════════
  var _basketCache = null;
  function _sleep(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }
  function _normMkt(m){
    var s = String(m||'').toLowerCase();
    if(s.indexOf('coin')>=0 || s.indexOf('crypto')>=0 || s.indexOf('upbit')>=0 || s.indexOf('krw')>=0 || s.indexOf('코인')>=0) return 'coin';
    if(s.indexOf('us')>=0 || s.indexOf('nasdaq')>=0 || s.indexOf('nyse')>=0 || s.indexOf('해외')>=0) return 'us';
    return 'kr';
  }
  // [S532fix] btFetchCandles는 BT포맷({t,o,h,l,c,v})을 반환 → calcAllScreener/_candleTransitionScore가 기대하는 스크리너포맷({date,open,high,low,close,volume})으로 변환.
  //   변환 안 하면 r.close 등이 전부 undefined → 점수 0 → 예측 0건(바스켓이 잡히지 않던 원인).
  function _toScreenerRows(rows){
    if(!Array.isArray(rows) || !rows.length) return rows;
    if(rows[0].close !== undefined && rows[0].open !== undefined) return rows; // 이미 스크리너 포맷
    return rows.map(function(r){
      return {
        date: r.date || r.t || '',
        open:  +((r.o != null ? r.o : r.open) || 0),
        high:  +((r.h != null ? r.h : r.high) || 0),
        low:   +((r.l != null ? r.l : r.low) || 0),
        close: +((r.c != null ? r.c : r.close) || 0),
        volume:+((r.v != null ? r.v : r.volume) || 0)
      };
    });
  }
  // 관심목록 바스켓 표본 수집 (무거움 — 종목별 calcAllScreener 루프). onProgress(i,total,name).
  async function runBasket(market, tf, onProgress){
    if(typeof _getWatchlist !== 'function') return { ok:false, reason:'관심목록 접근 불가(_getWatchlist 없음)' };
    if(typeof btFetchCandles !== 'function') return { ok:false, reason:'캔들 fetch 접근 불가(btFetchCandles 없음)' };
    var mk = _normMkt(market);
    var list = (_getWatchlist(mk) || []).filter(function(s){ return s && s.code; });
    if(!list.length) return { ok:false, reason:'관심목록(' + mk + ')이 비어있음 — 종목을 추가하세요' };
    var CAP = 12; // 성능 상한 (종목당 BT가 무거움)
    var capped = list.length > CAP;
    list = list.slice(0, CAP);
    var isCoin = (mk === 'coin');
    var perStock = [], skipped = 0;
    for(var i=0; i<list.length; i++){
      var s = list[i];
      if(onProgress) onProgress(i+1, list.length, s.name || s.code);
      await _sleep(0); // 진행 텍스트 페인트
      var rows = null;
      try { rows = _toScreenerRows(await btFetchCandles(s.code, isCoin, tf || 'day', 250)); } catch(e){ rows = null; }
      if(!Array.isArray(rows) || rows.length < MIN_BARS + 5 || !(rows[rows.length-1].close > 0)){ skipped++; continue; }
      var bt = null;
      try { bt = runBacktest(rows, mk, tf || 'day', { maxTests: 120 }); } catch(e2){ bt = null; }
      if(bt && bt.ok && bt.evaluated > 0) perStock.push({ name: s.name || s.code, bt: bt });
      else skipped++;
      await _sleep(30);
    }
    return { ok: perStock.length > 0, perStock: perStock, market: mk, skipped: skipped, capped: capped, total: list.length, reason: perStock.length ? null : '유효 데이터 종목이 없습니다 (캔들 부족/조회 실패)' };
  }
  // 임계값별 집계: 풀링(전체 합산) + 종목별 상회 카운트
  function _aggBasket(perStock, thr){
    var pool = [];
    var bullBeat=0, bullTot=0, bearBeat=0, bearTot=0;
    perStock.forEach(function(ps){
      var bt = ps.bt;
      var bp=0,bh=0,rp=0,rh=0;
      bt.samples.forEach(function(s){
        pool.push(s);
        if(Math.abs(s.score) < thr) return;
        if(s.score > 0){ bp++; if(s.up) bh++; } else { rp++; if(!s.up) rh++; }
      });
      if(bp >= 3){ bullTot++; var bhr=_pct(bh,bp); if(bhr!=null && bt.baseUpRate!=null && bhr > bt.baseUpRate) bullBeat++; }
      if(rp >= 3){ bearTot++; var rhr=_pct(rh,rp); if(rhr!=null && bt.baseDnRate!=null && rhr > bt.baseDnRate) bearBeat++; }
    });
    var n=pool.length, pUp=0;
    pool.forEach(function(s){ if(s.up) pUp++; });
    var pooledUp = n ? Math.round(pUp/n*1000)/10 : null;
    var pooledDn = pooledUp!=null ? Math.round((100-pooledUp)*10)/10 : null;
    var bP=0,bH=0,rP=0,rH=0;
    pool.forEach(function(s){ if(Math.abs(s.score) < thr) return; if(s.score>0){bP++; if(s.up)bH++;} else {rP++; if(!s.up)rH++;} });
    var bHit=_pct(bH,bP), rHit=_pct(rH,rP);
    return {
      thr: thr, nStocks: perStock.length, pred: bP+rP,
      bull: { pred:bP, hitRate:bHit, edge:(bHit!=null&&pooledUp!=null)?Math.round((bHit-pooledUp)*10)/10:null, beat:bullBeat, beatTot:bullTot },
      bear: { pred:rP, hitRate:rHit, edge:(rHit!=null&&pooledDn!=null)?Math.round((rHit-pooledDn)*10)/10:null, beat:bearBeat, beatTot:bearTot },
      pooledUp: pooledUp, pooledDn: pooledDn
    };
  }
  function _bEdge(e){
    if(e==null) return '';
    var c = e>0?'#16a34a':e<0?'#dc2626':'#6b7280';
    return '<span style="color:'+c+';font-weight:800">'+(e>0?'+':'')+e+'%p</span>';
  }
  function _renderBasket(res){
    if(!res.ok) return '<div style="font-size:12px;color:#dc2626;padding:14px 2px">바스켓 불가 — ' + res.reason + '</div>';
    var head = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">'
      + '<span onclick="window.SXCandleBT&&SXCandleBT.backToSingle()" style="font-size:11px;color:#7c3aed;cursor:pointer;font-weight:700">‹ 단일 종목</span>'
      + '<span style="margin-left:auto;font-size:11px;color:var(--text3)">관심목록 ' + res.market + ' · ' + res.perStock.length + '종목 풀링'
      + (res.skipped ? ' (스킵 ' + res.skipped + ')' : '') + (res.capped ? ' · 상위 12개' : '') + '</span></div>';
    var body = '';
    THRESHOLDS.forEach(function(thr){
      var a = _aggBasket(res.perStock, thr);
      var bestEdge = Math.max(a.bull.edge==null?-99:a.bull.edge, a.bear.edge==null?-99:a.bear.edge);
      var hl = bestEdge >= 5 ? '#16a34a' : bestEdge > 0 ? '#f59e0b' : '#dc2626';
      body += '<div style="border:1px solid var(--border);border-left:3px solid ' + hl + ';border-radius:9px;padding:9px 11px;margin-bottom:9px">'
        + '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:5px">|점수|≥' + thr + ' <span style="font-size:10px;font-weight:600;color:var(--text3)">· 예측 ' + a.pred + '건</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span style="color:var(--text2)">🔻 음봉</span>'
        +   '<span style="font-weight:700">' + (a.bear.hitRate!=null?a.bear.hitRate+'%':'—') + ' ' + _bEdge(a.bear.edge)
        +   ' <span style="font-size:10px;color:var(--text3)">· 상회 ' + a.bear.beat + '/' + a.bear.beatTot + '종목 · ' + a.bear.pred + '건</span></span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span style="color:var(--text2)">🔺 양봉</span>'
        +   '<span style="font-weight:700">' + (a.bull.hitRate!=null?a.bull.hitRate+'%':'—') + ' ' + _bEdge(a.bull.edge)
        +   ' <span style="font-size:10px;color:var(--text3)">· 상회 ' + a.bull.beat + '/' + a.bull.beatTot + '종목 · ' + a.bull.pred + '건</span></span></div>'
        + '</div>';
    });
    // [S542] 레짐별 (바스켓 풀링, ≥30 고정) — 전 종목 표본을 레짐별로 모아 추세 구간별 edge 측정
    var poolS = [], poolRB = {};
    res.perStock.forEach(function(ps){
      (ps.bt.samples || []).forEach(function(s){ poolS.push(s); });
      var rb = ps.bt.regimeBase || {};
      for(var rg in rb){ if(!poolRB[rg]) poolRB[rg] = { n:0, up:0 }; poolRB[rg].n += rb[rg].n; poolRB[rg].up += rb[rg].up; }
    });
    var regimeHtml = _renderRegime(_aggregateRegime(poolS, poolRB, 30), 30);
    var foot = '<div style="font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6">'
      + '풀링 = 전 종목 표본 합산 적중률 · edge = 베이스라인 대비.<br>'
      + '<b>상회 X/Y종목</b> = 개별 종목이 자기 베이스라인을 넘은 비율(≥3예측 종목 중). <b>이게 높을수록 robust</b> — 한 종목 운빨이 아니라 두루 통한다는 뜻. 임계 선택의 핵심 지표.'
      + '</div>';
    return head + body + regimeHtml + foot;
  }
  async function runBasketUI(){
    var ctx = window._sxCTBT || {};
    var body = document.getElementById('sxCTBTBody');
    if(!body) return;
    body.innerHTML = '<div style="text-align:center;padding:20px 2px;font-size:12px;color:var(--text3)">바스켓 준비 중…</div>';
    var res;
    try {
      res = await runBasket(ctx.market, ctx.tf, function(i,total,name){
        var b = document.getElementById('sxCTBTBody');
        if(b) b.innerHTML = '<div style="text-align:center;padding:20px 2px;font-size:12px;color:var(--text3)">바스켓 백테스트 ' + i + '/' + total + '<br><span style="font-size:11px">' + (name||'') + '</span><br><span style="font-size:10px;color:var(--text3)">종목당 과거 봉 재현 — 잠시 걸려요</span></div>';
      });
    } catch(e){ res = { ok:false, reason:'실행 오류: ' + (e&&e.message?e.message:e) }; }
    _basketCache = res;
    var b2 = document.getElementById('sxCTBTBody');
    if(b2){ b2.setAttribute('style','text-align:left'); b2.innerHTML = _renderBasket(res); }
  }
  function backToSingle(){ _renderInto(); }

  // ── 모달 (앱 공통 닫기 패턴: pushState + 중앙 popstate 핸들러) ──
  function _removeOverlay(){ // 실제 DOM 제거 — 중앙 popstate 핸들러/폴백이 호출
    var el = document.getElementById('sxCTBTOverlay');
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }
  function _close(){ // 사용자 닫기(×/배경) — [S530] history.back()→popstate가 제거 (통일 닫기 경로)
    try { history.back(); } catch(e){ _removeOverlay(); }
  }
  function open(){
    var ctx = window._sxCTBT || null;
    if(!ctx || !Array.isArray(ctx.rows) || ctx.rows.length < MIN_BARS + 5){
      alert('백테스트할 데이터가 부족합니다. 종목 분석을 먼저 실행해주세요.');
      return;
    }
    _removeOverlay(); // 잔류 오버레이 정리 (history 미관여)
    var ov = document.createElement('div');
    ov.id = 'sxCTBTOverlay';
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:18px');
    ov.addEventListener('click', function(e){ if(e.target === ov) _close(); });

    var nm = ctx.name ? (' · ' + ctx.name) : '';
    ov.innerHTML =
      '<div style="width:100%;max-width:380px;max-height:86vh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      +   '<span style="font-size:14px;font-weight:800;color:var(--text)">🧪 캔들 전이 미니 백테스트</span>'
      +   '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span>'
      +   '<span onclick="window.SXCandleBT&&SXCandleBT.close()" style="margin-left:auto;font-size:20px;line-height:1;color:var(--text3);cursor:pointer;padding:2px 6px">×</span>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);margin-bottom:10px">다음봉 색(양/음) 예측의 과거 적중률 · 임계값을 바꿔 정확도↔표본 균형을 보세요' + nm + '</div>'
      + '<div style="margin-bottom:12px"><button onclick="window.SXCandleBT&&SXCandleBT.runBasketUI()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#7c3aed;background:var(--surface2);border:1px solid var(--border)">📊 관심목록 바스켓으로 임계 비교 (과적합 점검)</button></div>'
      + '<div id="sxCTBTBody" style="text-align:center;padding:24px 2px;font-size:12px;color:var(--text3)">계산 중… (과거 봉을 하나씩 재현하는 중)</div>'
      + '</div>';
    document.body.appendChild(ov);
    try { history.pushState({ view: 'candleBTModal' }, ''); } catch(e){} // [S530] 뒤로가기로 닫기

    // 로딩 페인트 후 표본 수집 1회 (calcAllScreener × 표본 수 → 1~3초)
    setTimeout(function(){
      _curThr = 30; _knnWin = 8; _knnK = 25; _knnGrid = null;   // [S603/S604] kNN 토글·탐색 캐시 리셋
      try { _cache = runBacktest(ctx.rows, ctx.market, ctx.tf); }
      catch(e){ _cache = { ok:false, reason:'실행 오류: ' + (e && e.message ? e.message : e) }; }
      var body = document.getElementById('sxCTBTBody');
      if(body){ body.setAttribute('style', 'text-align:left'); }
      _renderInto();
    }, 40);
  }

  window.SXCandleBT = { open: open, close: _close, setThr: setThr, setKnnWin: setKnnWin, setKnnK: setKnnK, runKnnGrid: runKnnGrid, downloadKnnJson: downloadKnnJson, run: runBacktest, runBasket: runBasket, runBasketUI: runBasketUI, backToSingle: backToSingle, _remove: _removeOverlay };
})();
