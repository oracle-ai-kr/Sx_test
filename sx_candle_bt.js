// ════════════════════════════════════════════════════════════════
//  sx_candle_bt.js  —  [S525] 캔들 전이 미니 백테스트  (+[S530] 뒤로가기 닫기·임계값 선택)  (+[S601] 자기유사도 kNN 대안경로 비교)  (+[S603] kNN 창길이/K 토글 A/B)  (+[S604] 9조합 자동탐색·JSON 다운로드) (+[S605] 랭킹 게이트+가중에지 정렬) (+[S606] 기본 16×10) (+[S607] 룰+kNN 블렌드) (+[S608] 이웃 품질 게이팅) (+[S609] 재탐색 버튼 유지)
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
  var _knnWin = 16;             // [S603] kNN 창 길이 토글 (8/12/16) · [S606] 기본 16
  var _knnK = 10;               // [S603] kNN 이웃 수 토글 (10/25/50) · [S606] 기본 10
  var _knnGrid = null;          // [S604] 자동탐색 결과 {combos:[{win,K,knn:[score|null,...]}], builtAt} — knn 원본배열 보관(임계 재집계용)
  var _knnGateRatio = null;     // [S608] 이웃 품질 게이팅 (null=OFF / 0.50=약 / 0.42=강). tightRatio>이 값이면 신호 억제. 값은 tightRatio 분포(중앙~0.42)에 맞춰 보정

  function _isUp(r){ return (+r.close) >= (+r.open); }

  // [S635] 캔들전이 풀링 자동전환 — 도너 풀 = 시총 상위 대표목록(고정). 관심목록 대신 안정·재현성 확보.
  //   KR=6자리코드 / US=티커 / coin=업비트 심볼. 2026-06 시총 상위 기준(정적 스냅샷, 가끔 갱신 필요).
  var _REP_POOL = {
    kr: [['005930','삼성전자'],['000660','SK하이닉스'],['373220','LG에너지솔루션'],['207940','삼성바이오로직스'],['005380','현대차'],['000270','기아'],['068270','셀트리온'],['006400','삼성SDI'],['005490','POSCO홀딩스'],['035420','NAVER'],['035720','카카오'],['012330','현대모비스'],['051910','LG화학'],['247540','에코프로비엠'],['032830','삼성생명']],
    us: [['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','NVIDIA'],['GOOGL','Alphabet'],['AMZN','Amazon'],['META','Meta'],['AVGO','Broadcom'],['TSLA','Tesla'],['LLY','Eli Lilly'],['JPM','JPMorgan'],['V','Visa'],['WMT','Walmart'],['MA','Mastercard'],['XOM','ExxonMobil'],['UNH','UnitedHealth']],
    coin: [['BTC','비트코인'],['ETH','이더리움'],['XRP','리플'],['SOL','솔라나'],['ADA','에이다'],['DOGE','도지코인'],['TRX','트론'],['AVAX','아발란체'],['LINK','체인링크'],['DOT','폴카닷'],['BCH','비트코인캐시'],['ETC','이더리움클래식'],['ATOM','코스모스'],['NEAR','니어'],['SUI','수이']]
  };
  var _repBankCache = {};   // 'mkt|tf|win' → { bank, W, win, donors:[names], ts } — 세션 재사용
  var _rows600Cache = {};   // [S637] 'mkt|tf|code' → 600봉 screener rows | null. 카드 kNN/게이트를 검증툴과 동일 600봉 기준으로 통일.
  async function fetchRows600(mk, tf, code){
    mk=_normMkt(mk); tf=tf||'day';
    var key=mk+'|'+tf+'|'+code;
    if(_rows600Cache[key]!==undefined) return _rows600Cache[key];
    // [S643] 목표 봉수 = 라이브 카드와 동일(_btTargetBars: KIS ON 700 / OFF 600 / 주·월 400) — 게이트/카드 정합.
    var _tgt = (typeof _btTargetBars==='function') ? _btTargetBars(mk, tf) : 600;
    var _floor = Math.floor(_tgt * 0.95);
    var r=null;
    // [S643] 1차: 공유 캐시 경유(btFetchCandles, 빠름). 단 candleCache 공유 루프가 요청 봉수를 무시하고
    //   분석탭 짧은 캐시(200/400봉, Math.min(count,60) 가드)를 줄 수 있어 → kNN/검증 600봉 계약이 깨졌음(self 불일치 뿌리).
    try { if(typeof btFetchCandles==='function') r=_toScreenerRows(await btFetchCandles(code, mk==='coin', tf, _tgt)); } catch(e){ r=null; }
    // [S643] 2차: 1차가 목표 미달이면 candleCache 우회 독립 fetch로 재시도(_btCandleCache는 S641 length>=count 가드 有).
    //   kNN 진입점(fetchRows600)에만 적용 → btFetchCandles 30개 호출처(BT/옵티마이저/페이퍼)는 무영향.
    if(!Array.isArray(r) || r.length < _floor){
      var r2=null;
      try {
        if(mk==='coin'){ if(typeof btFetchCandlesCoin==='function') r2=_toScreenerRows(await btFetchCandlesCoin(code, tf, _tgt)); }
        else if(mk==='us'){ if(typeof btFetchCandlesYF==='function') r2=_toScreenerRows(await btFetchCandlesYF(code, tf, _tgt)); }
        else { if(typeof btFetchCandlesKR==='function') r2=_toScreenerRows(await btFetchCandlesKR(code, tf, _tgt)); }
      } catch(e2){ r2=null; }
      if(Array.isArray(r2) && (!Array.isArray(r) || r2.length>r.length)) r=r2;   // 더 긴 쪽 채택(짧은 종목은 가용 최대)
    }
    _rows600Cache[key] = (Array.isArray(r)&&r.length)? r : null;
    return _rows600Cache[key];
  }
  function _ctPoolAutoOn(){ try { return localStorage.getItem('SX_CT_POOL_AUTO')==='1'; } catch(_){ return false; } }
  function _ctPoolAutoSet(on){ try { localStorage.setItem('SX_CT_POOL_AUTO', on?'1':'0'); } catch(_){} }

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
      if(_knnPre){ try { var _rk = SXKNN.scoreAt(rows, i, _knnPre, { k:_knnK, gateRatio:_knnGateRatio }); if(_rk && _rk.active) _knn = _rk.score; } catch(e3){} }
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
    // [S607] 블렌드 집계 — 룰·kNN 점수 평균(kNN 미가동 시 룰 단독). 앙상블.
    var bPred=0, bHit=0, bNeu=0, bBullP=0, bBullH=0, bBearP=0, bBearH=0;
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
      // [S607] 블렌드 = (룰 + kNN)/2, kNN 미가동이면 룰 단독
      var bl = (kn == null) ? sc : Math.round((sc + kn) / 2);
      if(Math.abs(bl) < thr){ bNeu++; }
      else {
        var bUp = bl > 0, bok = (bUp === up);
        bPred++; if(bok) bHit++;
        if(bUp){ bBullP++; if(bok) bBullH++; } else { bBearP++; if(bok) bBearH++; }
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
      blend: { pred:bPred, hitRate:_pct(bHit,bPred), neutral:bNeu,
               bullPred:bBullP, bullHitRate:_pct(bBullH,bBullP),
               bearPred:bBearP, bearHitRate:_pct(bBearH,bBearP) },  // [S607]
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
      + _gateRow()
      + '</div>';
  }
  // [S608] 이웃 품질 게이팅 토글 (OFF / 약 0.85 / 강 0.72) — 닮은꼴 밀집할 때만 신호
  function _gateRow(){
    var opts=[['OFF',0],['약',0.50],['강',0.42]];
    return '<div style="display:flex;align-items:center;gap:5px;margin-top:6px">'
      + '<span style="font-size:9px;color:var(--text3);width:30px;flex-shrink:0">게이팅</span>'
      + opts.map(function(o){ var on=((o[1]===0&&_knnGateRatio==null)||o[1]===_knnGateRatio);
          return '<button onclick="window.SXCandleBT&&SXCandleBT.setKnnGate('+o[1]+')" style="flex:1;font-size:10px;font-weight:'+(on?800:600)+';padding:5px 0;border-radius:6px;cursor:pointer;'
            +(on?'color:#fff;background:#0ea5e9;border:1px solid #0ea5e9':'color:var(--text2);background:var(--surface);border:1px solid var(--border)')+'">'+o[0]+'</button>';
        }).join('')
      + '</div>'
      + '<div style="font-size:8px;color:var(--text3);margin-top:3px;line-height:1.5">닮은꼴이 충분히 가까울 때만 신호(정밀도↑·신호↓). 약/강 켜고 \'미가동\'↑·적중률 변화를 보세요.</div>';
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
  // [S604] 자동탐색 버튼(미실행) 또는 결과표+재탐색·JSON저장(실행후)
  function _knnGridBlock(){
    if(!_knnGrid){
      return '<div style="margin-top:8px"><button id="sxKnnGridBtn" onclick="window.SXCandleBT&&SXCandleBT.runKnnGrid()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#7c3aed;background:var(--surface);border:1px solid #7c3aed66">🔍 창·K 9조합 자동탐색</button></div>';
    }
    return _renderKnnGrid(_curThr)
      + '<div style="display:flex;gap:6px;margin-top:6px">'
      +   '<button id="sxKnnGridBtn" onclick="window.SXCandleBT&&SXCandleBT.runKnnGrid()" style="flex:1;font-size:11px;font-weight:700;padding:7px 0;border-radius:8px;cursor:pointer;color:#7c3aed;background:var(--surface);border:1px solid #7c3aed66">🔄 재탐색</button>'
      +   '<button onclick="window.SXCandleBT&&SXCandleBT.downloadKnnJson()" style="flex:1;font-size:11px;font-weight:700;padding:7px 0;border-radius:8px;cursor:pointer;color:var(--text);background:var(--surface);border:1px solid var(--border)">⬇️ JSON 저장</button>'
      + '</div>';
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
      + _poolBlock()
      + '</div>';
  }
  // [S612] 다종목 풀링 뱅크 비교 버튼 + 결과 영역
  function _poolBlock(){
    return '<div style="margin-top:8px">'
      + '<button onclick="window.SXCandleBT&&SXCandleBT.runPoolCompareUI()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#0ea5e9;background:var(--surface);border:1px solid #0ea5e966">🌐 대표목록 풀 비교 (이 종목)</button>'
      + '<button onclick="window.SXCandleBT&&SXCandleBT.runPoolVerifyUI()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#16a34a;background:var(--surface);border:1px solid #16a34a66;margin-top:5px">🔬 풀링 로직 검증 (대표목록 전체)</button>'
      + '<div id="sxPoolResult" style="margin-top:6px"></div></div>';
  }
  function _renderBlend(a){
    var bl=a.blend, kn=a.knn; if(!bl) return '';
    var badge='<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:var(--surface);color:var(--text3);border:1px solid var(--border)">실험</span>';
    if(bl.pred===0){
      return '<div style="margin-top:10px;padding:9px 11px;background:var(--surface2);border-radius:9px;border-left:3px solid #0ea5e9">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text)">🔀 블렌드 (룰+kNN) ' + badge + '</div>'
        + '<div style="font-size:10px;color:var(--text3);margin-top:3px">|점수|≥' + a.thr + '인 블렌드 예측 없음 — 임계를 낮춰보세요.</div></div>';
    }
    var br=bl.hitRate, bc=br==null?'var(--text)':br>=60?'#16a34a':br>=50?'#f59e0b':'#dc2626';
    // 3자 비교 (룰 / kNN / 블렌드)
    var ruleHr=a.hitRate, knnHr=(kn?kn.hitRate:null);
    var vals=[['룰',ruleHr],['kNN',knnHr],['블렌드',br]].filter(function(v){return v[1]!=null;});
    var best=vals.reduce(function(m,v){return (m==null||v[1]>m[1])?v:m;}, null);
    var threeway=vals.map(function(v){ var win=(best&&v[0]===best[0]);
      return '<span style="color:'+(win?'#16a34a':'var(--text3)')+';font-weight:'+(win?800:600)+'">'+v[0]+' '+v[1]+'%'+(win?' ★':'')+'</span>'; }).join(' · ');
    return '<div style="margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid #0ea5e9">'
      + '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px">'
      +   '<span style="font-size:12px;font-weight:800;color:var(--text)">🔀 블렌드 (룰+kNN 평균)</span>' + badge
      +   '<span style="margin-left:auto;font-size:18px;font-weight:800;color:'+bc+'">'+(br!=null?br+'%':'—')+'</span>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);margin:-2px 0 6px">|점수|≥'+a.thr+' 예측 '+bl.pred+'건 · 중립 '+bl.neutral+'</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--text2)">🔺 양봉</span>'
      +   '<span style="font-weight:700">'+(bl.bullHitRate!=null?bl.bullHitRate+'%':'—')+' '+_edgeBadge(bl.bullHitRate,a.baseUpRate)+' <span style="font-size:10px;color:var(--text3)">· '+bl.bullPred+'건</span></span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--text2)">🔻 음봉</span>'
      +   '<span style="font-weight:700">'+(bl.bearHitRate!=null?bl.bearHitRate+'%':'—')+' '+_edgeBadge(bl.bearHitRate,a.baseDnRate)+' <span style="font-size:10px;color:var(--text3)">· '+bl.bearPred+'건</span></span></div>'
      + '<div style="font-size:11px;color:var(--text2);margin-top:6px;padding-top:5px;border-top:1px dashed var(--border)">3자 비교 · '+threeway+'</div>'
      + '<div style="font-size:9px;color:var(--text3);margin-top:4px;line-height:1.6">블렌드 = (룰점수 + kNN점수)/2 후 같은 임계 적용. 둘이 다른 실수를 하면 합쳤을 때 상쇄돼 더 안정적일 수 있어요(앙상블).</div>'
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

    return _thrButtons(a.thr) + head + body + interp + _renderKnn(a) + _renderBlend(a) + _renderRegime(a.regime, a.thr) + foot;
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
      try { var r=SXKNN.scoreAt(_cache.rows, smp.i, pre, { k:_knnK, gateRatio:_knnGateRatio }); smp.knn = (r && r.active) ? r.score : null; }
      catch(e2){ smp.knn=null; }
    }
  }
  function setKnnWin(w){ if(w===_knnWin) return; _knnWin = w; _recomputeKnn(); _renderInto(); }
  function setKnnK(k){ if(k===_knnK) return; _knnK = k; _recomputeKnn(); _renderInto(); }
  function setKnnGate(r){ var v=(r>0?r:null); if(v===_knnGateRatio) return; _knnGateRatio = v; _recomputeKnn(); if(_knnGrid){ runKnnGrid(); } else { _renderInto(); } }  // [S608] 게이팅 변경 시 grid도 재탐색
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
          if(smp.i!=null){ try { var r=SXKNN.scoreAt(rows, smp.i, pre, { k:Kv, gateRatio:_knnGateRatio }); if(r && r.active) sc=r.score; } catch(e2){} }
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

  // ════════ [S612] 다종목 풀링 뱅크 — 현재 종목에서 자기-kNN vs (자기+관심목록 타종목) 풀링-kNN 비교 ════════
  async function runPoolCompare(onProgress){
    var ctx = window._sxCTBT || {};
    var rows = ctx.rows, mk = _normMkt(ctx.market), tf = ctx.tf || 'day';
    if(!Array.isArray(rows) || rows.length < MIN_BARS+5) return { ok:false, reason:'현재 종목 데이터 부족' };
    if(typeof SXKNN==='undefined' || !SXKNN.buildPoolBank) return { ok:false, reason:'kNN 풀링 미로드' };
    if(typeof btFetchCandles!=='function') return { ok:false, reason:'캔들 접근 불가' };
    var win = _knnWin, k = _knnK;
    // [S635] 도너 = 시총 상위 대표목록(고정). 세션 캐시 재사용. 관심목록 의존 제거.
    if(onProgress) onProgress(0,0,'⏳ 대표목록 풀 뱅크 준비…');
    var rep = await _ensureRepBank(mk, tf, win);
    if(!rep || !rep.bank || !rep.bank.length) return { ok:false, reason:'대표목록 풀 구축 실패 — 네트워크 확인('+mk+')' };
    if(onProgress) onProgress(0,0,'⏳ 풀링 뱅크 분석 중… (잠시)');
    await _sleep(15);
    // 풀뱅크 = 자기(현재 종목) + 대표목록 = self+others. 자기 벡터만 매번 concat(대표 뱅크는 캐시).
    var selfBank = SXKNN.buildPoolBank([{ name:ctx.name||'(현재)', code:ctx.code||'', rows:rows }], win);
    // [S644] 도너 풀에서 자기 종목 벡터 제외 — 자기는 selfBank로 이미 1벌 포함(중복 계상 방지).
    var _repBank = (ctx.code) ? rep.bank.filter(function(b){ return b.src !== ctx.code; }) : rep.bank;
    var pool = { bank: selfBank.bank.concat(_repBank), win:win, W:rep.W };
    var selfPre = SXKNN.buildVecs(rows, win);
    var n=rows.length, startI=Math.max(MIN_BARS, n-1-DEFAULT_MAX);
    var sP=0,sH=0,sBullP=0,sBullH=0,sBearP=0,sBearH=0, pP=0,pH=0,pBullP=0,pBullH=0,pBearP=0,pBearH=0;
    for(var q=startI; q<=n-2; q++){
      var up=_isUp(rows[q+1]);
      var rs=SXKNN.scoreAt(rows,q,selfPre,{k:k});
      if(rs&&rs.active&&Math.abs(rs.score)>=30){ var su=rs.score>0; sP++; if(su===up)sH++; if(su){sBullP++;if(su===up)sBullH++;}else{sBearP++;if(su===up)sBearH++;} }
      var qv=selfPre.vecs[q - selfPre.from];
      var rp=SXKNN.scorePooled(qv, SXKNN._dnum(rows[q].date), pool, {k:k});
      if(rp&&rp.active&&Math.abs(rp.score)>=30){ var pu=rp.score>0; pP++; if(pu===up)pH++; if(pu){pBullP++;if(pu===up)pBullH++;}else{pBearP++;if(pu===up)pBearH++;} }
    }
    var _donors = (rep.donors||[]).filter(function(n){ return n !== (ctx.name||''); });   // [S644] 표시 도너에서도 자기 제외
    return { ok:true, name:ctx.name||'(현재)', nOthers:_donors.length, others:_donors,
      win:win, k:k, poolSize:pool.bank.length, evalBars:(n-1)-startI,
      self:{ pred:sP, hit:_pct(sH,sP), bull:_pct(sBullH,sBullP), bullN:sBullP, bear:_pct(sBearH,sBearP), bearN:sBearP },
      pooled:{ pred:pP, hit:_pct(pH,pP), bull:_pct(pBullH,pBullP), bullN:pBullP, bear:_pct(pBearH,pBearP), bearN:pBearP } };
  }
  async function runPoolCompareUI(){
    var el=document.getElementById('sxPoolResult'); if(!el) return;
    el.innerHTML='<div style="text-align:center;padding:14px 2px;font-size:11px;color:var(--text3)">풀링 뱅크 준비 — 대표목록 캔들 수집 중…</div>';
    var res;
    try {
      res = await runPoolCompare(function(i,total,name){
        var e=document.getElementById('sxPoolResult'); if(!e) return;
        var msg = (name && name.charAt(0)==='⏳') ? name : ('타종목 캔들 수집 '+i+'/'+total+'<br><span style="font-size:10px">'+(name||'')+'</span>');
        e.innerHTML='<div style="text-align:center;padding:14px 2px;font-size:11px;color:var(--text3)">'+msg+'</div>';
      });
    } catch(e){ res={ ok:false, reason:String((e&&e.message)||e) }; }
    var e2=document.getElementById('sxPoolResult'); if(e2) e2.innerHTML=_renderPool(res);
  }
  function _renderPool(res){
    if(!res || !res.ok) return '<div style="font-size:11px;color:#dc2626;padding:10px 2px">풀링 불가 — '+((res&&res.reason)||'')+'</div>';
    var s=res.self, p=res.pooled;
    var d = (s.hit!=null && p.hit!=null) ? Math.round((p.hit-s.hit)*10)/10 : null;
    var verdict = d==null ? '<b style="color:#6b7280">비교 불가 — 예측 표본 부족</b>'
      : d>=3 ? '<b style="color:#16a34a">풀링 우세 +'+d+'%p</b> — 타종목 닮은꼴이 도움'
      : d<=-3 ? '<b style="color:#dc2626">자기 우세 '+d+'%p</b> — 풀링이 노이즈만 추가'
      : '<b style="color:#6b7280">차이 미미 ('+(d>0?'+':'')+d+'%p)</b> — 풀링 이득 없음';
    function pr(lbl,o,col){ return '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span style="color:var(--text2)">'+lbl+'</span><span style="font-weight:800;color:'+col+'">'+(o.hit!=null?o.hit+'%':'—')+' <span style="font-size:10px;font-weight:600;color:var(--text3)">· '+o.pred+'건</span></span></div>'; }
    return '<div style="margin-top:4px;padding:10px 12px;background:var(--surface);border-radius:9px;border:1px solid #0ea5e955">'
      + '<div style="font-size:11px;font-weight:800;color:#0ea5e9;margin-bottom:5px">🌐 풀링 뱅크 비교 · |점수|≥30</div>'
      + pr('자기 과거만 (kNN)', s, '#7c3aed')
      + pr('자기 + 타'+res.nOthers+'종목 (풀링)', p, '#0ea5e9')
      + '<div style="font-size:11px;margin-top:6px;padding-top:5px;border-top:1px dashed var(--border)">'+verdict+'</div>'
      + '<div style="font-size:9px;color:var(--text3);margin-top:5px;line-height:1.65">풀 후보 '+res.poolSize+'개('+res.win+'×'+res.k+') · 타종목: '+res.others.join(', ')+' · 평가 '+res.evalBars+'봉. 교차종목 룩어헤드 차단(결과날짜 ≤ 쿼리). 풀링이 +3%p↑ 확실히 이길 때만 의미 있어요.</div>'
      + '</div>';
  }

  // ════════ [S616] 풀링 로직 검증 — 관심목록 전 종목에서 자기-kNN vs 풀링-kNN 측정 → "자기<50% ⇒ 풀링 도움" 가설 실측 ════════
  async function runPoolVerify(onProgress){
    var ctx = window._sxCTBT || {};
    var mk = _normMkt(ctx.market), tf = ctx.tf || 'day', isCoin = (mk==='coin');
    if(typeof btFetchCandles!=='function') return { ok:false, reason:'캔들 접근 불가' };
    if(typeof SXKNN==='undefined' || !SXKNN.buildPoolBank) return { ok:false, reason:'kNN 풀링 미로드' };
    var win=_knnWin, k=_knnK;
    // [S635] 검증 대상 = 시총 상위 대표목록(고정). 관심목록 의존 제거 → 자동전환과 동일 풀 기준 재검증.
    var list=(_REP_POOL[mk]||[]).map(function(p){ return { code:p[0], name:p[1] }; });
    if(!list.length) return { ok:false, reason:'대표목록 없음('+mk+')' };
    var stocksRows=[];
    var _curNm = ctx.name||'', _curCd = ctx.code||'', _curRows = (Array.isArray(ctx.rows)?ctx.rows:null);
    for(var i=0;i<list.length;i++){
      var s=list[i];
      if(onProgress) onProgress(stocksRows.length+1, list.length, s.name);
      await _sleep(0);
      var r=null;
      // [S642] 현재 분석 종목은 라이브 카드와 동일 rows(_knnRows=_sxCTBT.rows) 사용 → 검증 self가 라이브 self와 정합. (다른 종목은 600봉 fetch)
      if(_curRows && _curRows.length>=win+SXKNN.MIN_BANK+5 && ((_curCd && s.code===_curCd) || (_curNm && s.name===_curNm))){
        r=_curRows;
      } else {
        // [S645] btFetchCandles 직접호출 → fetchRows600으로 교체. candleCache 공유루프(Math.min(count,60)) 누수를 우회해
        //   모든 종목이 안정적으로 600봉 확보 → 검증 표 '자기' 열이 현재종목/타종목·탭에 무관하게 일관(탭 의존성 제거).
        //   (S617 의도=자기 600봉 유지. 풀의 타종목 250 slice는 아래 그대로라 카드 정합 불변.)
        try{ r=await fetchRows600(mk, tf, s.code); }catch(e){}
      }
      if(Array.isArray(r) && r.length>=win+SXKNN.MIN_BANK+5) stocksRows.push({name:s.name, rows:r});
      await _sleep(15);
    }
    if(stocksRows.length<3) return { ok:false, reason:'대표목록 유효 종목 3개 미만 — 네트워크 확인('+mk+')' };
    var per=[];
    for(var j=0;j<stocksRows.length;j++){
      if(onProgress) onProgress(0,0,'⏳ 분석 '+(j+1)+'/'+stocksRows.length+' — '+stocksRows[j].name);
      await _sleep(0);
      var rows=stocksRows[j].rows;
      // [S617] 풀 = 자기(600봉) + 타종목(마지막 250봉) — 라이브 🌐 단일비교와 동일 구성. 종목마다 재구성.
      var forPool=[{ name:stocksRows[j].name, rows:rows }];
      for(var m=0;m<stocksRows.length;m++){ if(m!==j){ var o=stocksRows[m].rows; forPool.push({ name:stocksRows[m].name, rows:(o.length>250?o.slice(-250):o) }); } }
      var pool=SXKNN.buildPoolBank(forPool, win);
      var pre=SXKNN.buildVecs(rows,win);
      var n=rows.length, startI=Math.max(MIN_BARS, n-1-DEFAULT_MAX);
      var sP=0,sH=0,pP=0,pH=0;
      for(var q=startI;q<=n-2;q++){
        var up=_isUp(rows[q+1]);
        var rs=SXKNN.scoreAt(rows,q,pre,{k:k});
        if(rs&&rs.active&&Math.abs(rs.score)>=30){ sP++; if((rs.score>0)===up)sH++; }
        var rp=SXKNN.scorePooled(pre.vecs[q-pre.from], SXKNN._dnum(rows[q].date), pool, {k:k});
        if(rp&&rp.active&&Math.abs(rp.score)>=30){ pP++; if((rp.score>0)===up)pH++; }
      }
      var sh=_pct(sH,sP), ph=_pct(pH,pP);
      per.push({ name:stocksRows[j].name, selfHit:sh, selfN:sP, poolHit:ph, poolN:pP,
                 delta:(sh!=null&&ph!=null)?Math.round((ph-sh)*10)/10:null });
      await _sleep(8);
    }
    return { ok:true, win:win, k:k, n:stocksRows.length, per:per };
  }
  async function runPoolVerifyUI(){
    var el=document.getElementById('sxPoolResult'); if(!el) return;
    el.innerHTML='<div style="text-align:center;padding:14px 2px;font-size:11px;color:var(--text3)">풀링 검증 준비 — 대표목록 캔들 수집…</div>';
    var res;
    try {
      res = await runPoolVerify(function(i,total,name){
        var e=document.getElementById('sxPoolResult'); if(!e) return;
        var msg=(name&&name.charAt(0)==='⏳')?name:('타종목 캔들 수집 '+i+'/'+total+'<br><span style="font-size:10px">'+(name||'')+'</span>');
        e.innerHTML='<div style="text-align:center;padding:14px 2px;font-size:11px;color:var(--text3)">'+msg+'<br><span style="font-size:9px;color:var(--text3)">전 종목 자기 vs 풀링 — 수십 초 걸려요</span></div>';
      });
    } catch(e){ res={ ok:false, reason:String((e&&e.message)||e) }; }
    var e2=document.getElementById('sxPoolResult'); if(e2) e2.innerHTML=_renderPoolVerify(res);
  }
  function _renderPoolVerify(res){
    if(!res || !res.ok) return '<div style="font-size:11px;color:#dc2626;padding:10px 2px">검증 불가 — '+((res&&res.reason)||'')+'</div>';
    var per=res.per.filter(function(p){ return p.selfHit!=null && p.poolHit!=null; });
    if(per.length<3) return '<div style="font-size:11px;color:#dc2626;padding:10px 2px">유효 표본 부족(예측 있는 종목 3개 미만)</div>';
    per.sort(function(a,b){ return a.selfHit-b.selfHit; });   // 약함 먼저
    var weak=per.filter(function(p){ return p.selfHit<50; }), strong=per.filter(function(p){ return p.selfHit>=50; });
    var avg=function(arr){ return arr.length? Math.round(arr.reduce(function(s,p){return s+p.delta;},0)/arr.length*10)/10 : null; };
    var weakAvg=avg(weak), strongAvg=avg(strong);
    var weakHelp=weak.filter(function(p){return p.delta>0;}).length, strongOk=strong.filter(function(p){return p.delta<=0;}).length;
    var rowsHtml=per.map(function(p){
      var w=p.selfHit<50, dc=p.delta>0?'#16a34a':p.delta<0?'#dc2626':'#6b7280';
      return '<div style="display:flex;align-items:center;font-size:10.5px;padding:3px 0;border-bottom:1px solid var(--border)">'
        +'<span style="flex:1;font-weight:'+(w?800:600)+';color:'+(w?'#0ea5e9':'var(--text2)')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(w?'🌐 ':'')+p.name+'</span>'
        +'<span style="width:38px;text-align:right;color:var(--text3)">'+p.selfHit+'</span>'
        +'<span style="width:16px;text-align:center;color:var(--text3)">→</span>'
        +'<span style="width:38px;text-align:right;color:var(--text2)">'+p.poolHit+'</span>'
        +'<span style="width:46px;text-align:right;font-weight:800;color:'+dc+'">'+(p.delta>0?'+':'')+p.delta+'</span></div>';
    }).join('');
    // 가설: 약함(자기<50) → 풀링 도움(+), 강함 → 무익/해. 두 그룹 평균 델타로 판정.
    var holds = (weakAvg!=null && strongAvg!=null) ? (weakAvg > 0 && weakAvg - strongAvg >= 3) : null;
    var verdict = holds==null ? '<b style="color:#6b7280">판정 보류 — 한쪽 그룹 표본 없음</b>'
      : holds ? '<b style="color:#16a34a">✓ 로직 성립</b> — 약한 종목은 풀링이 평균 '+(weakAvg>0?'+':'')+weakAvg+'%p 끌어올리고, 강한 종목은 '+(strongAvg>0?'+':'')+strongAvg+'%p. 넛지(자기<50%→풀링)가 방향을 맞게 짚어요.'
      : '<b style="color:#dc2626">✗ 로직 약함</b> — 약함 평균 '+(weakAvg!=null?(weakAvg>0?'+':'')+weakAvg:'—')+'%p / 강함 '+(strongAvg!=null?(strongAvg>0?'+':'')+strongAvg:'—')+'%p. 단순 50% 임계가 잘 안 갈라요 — 표(크로스오버 지점) 보고 임계 조정 필요.';
    return '<div style="margin-top:4px;padding:10px 12px;background:var(--surface);border-radius:9px;border:1px solid #16a34a55">'
      + '<div style="font-size:11px;font-weight:800;color:#16a34a;margin-bottom:5px">🔬 풀링 로직 검증 · '+res.n+'종목 · |점수|≥30</div>'
      + '<div style="display:flex;font-size:9px;font-weight:700;color:var(--text3);padding-bottom:3px;border-bottom:1px solid var(--border)"><span style="flex:1">종목 (자기<50%=🌐)</span><span style="width:38px;text-align:right">자기</span><span style="width:16px"></span><span style="width:38px;text-align:right">풀링</span><span style="width:46px;text-align:right">Δ%p</span></div>'
      + rowsHtml
      + '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:6px;color:var(--text2)"><span>약함(자기<50): '+weak.length+'종목 · 풀링도움 '+weakHelp+'</span><span style="font-weight:800;color:'+(weakAvg>0?'#16a34a':'#dc2626')+'">평균 '+(weakAvg!=null?(weakAvg>0?'+':'')+weakAvg:'—')+'%p</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2)"><span>강함(자기≥50): '+strong.length+'종목 · 풀링무익 '+strongOk+'</span><span style="font-weight:800;color:'+(strongAvg!=null&&strongAvg<=0?'#16a34a':'#dc2626')+'">평균 '+(strongAvg!=null?(strongAvg>0?'+':'')+strongAvg:'—')+'%p</span></div>'
      + '<div style="font-size:11px;margin-top:6px;padding-top:5px;border-top:1px dashed var(--border)">'+verdict+'</div>'
      + '<div style="font-size:9px;color:var(--text3);margin-top:5px;line-height:1.6">자기 600봉(라이브 카드와 동일 기준) · 타종목 250봉 · '+res.win+'×'+res.k+' · 평가 150봉. 교차종목 룩어헤드 차단.</div>'
      + '</div>';
  }

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
      _curThr = 30; _knnWin = 16; _knnK = 10; _knnGrid = null; _knnGateRatio = null;   // [S603/S604/S606/S608] kNN 토글·탐색·게이팅 리셋(기본 16×10)
      try { _cache = runBacktest(ctx.rows, ctx.market, ctx.tf); }
      catch(e){ _cache = { ok:false, reason:'실행 오류: ' + (e && e.message ? e.message : e) }; }
      var body = document.getElementById('sxCTBTBody');
      if(body){ body.setAttribute('style', 'text-align:left'); }
      _renderInto();
    }, 40);
  }

  window.SXCandleBT = { open: open, close: _close, setThr: setThr, setKnnWin: setKnnWin, setKnnK: setKnnK, setKnnGate: setKnnGate, runKnnGrid: runKnnGrid, downloadKnnJson: downloadKnnJson, run: runBacktest, runBasket: runBasket, runBasketUI: runBasketUI, runPoolCompareUI: runPoolCompareUI, runPoolCompare: runPoolCompare, runPoolVerifyUI: runPoolVerifyUI, runPoolVerify: runPoolVerify, backToSingle: backToSingle, evalPoolAuto: evalPoolAuto, poolAutoOn: _ctPoolAutoOn, poolAutoSet: _ctPoolAutoSet, fetchRows600: fetchRows600, _remove: _removeOverlay };

  // [S635] 대표목록 도너 뱅크 구축(세션 1회/시장·TF, 캐시 재사용). fetch 실패 종목 graceful skip.
  async function _ensureRepBank(mk, tf, win){
    var key = mk+'|'+tf+'|'+win;
    if(_repBankCache[key]) return _repBankCache[key];
    if(typeof SXKNN==='undefined' || !SXKNN.buildPoolBank) return null;
    if(typeof btFetchCandles!=='function') return null;
    var list = _REP_POOL[mk] || []; if(!list.length) return null;
    var isCoin=(mk==='coin'), stocksRows=[], names=[];
    for(var i=0;i<list.length;i++){
      var code=list[i][0], nm=list[i][1];
      await _sleep(0);
      // [S646] btFetchCandles(...,250) 직접호출 → fetchRows600(600)→마지막 250 slice. candleCache 공유루프(Math.min(count,60)) 누수를
      //   우회해 타종목을 세션상태 무관 안정적으로 받음. 검증(runPoolVerify, S645)과 동일 경로 → 카드 풀링 = 검증 완전 정합.
      //   풀엔 250봉만 사용(기존과 동일) → 품질·카드정합 불변. 누수로 인한 풀링 게이트 오적용 제거.
      var r=null;
      try {
        var _r6 = await fetchRows600(mk, tf, code);
        if(Array.isArray(_r6) && _r6.length) r = (_r6.length > 250) ? _r6.slice(-250) : _r6;
      } catch(e){ r=null; }
      if(Array.isArray(r) && r.length >= win+SXKNN.MIN_BANK+5){ stocksRows.push({ name:nm, code:code, rows:r }); names.push(nm); }   // [S644] code 보존 → 풀에서 자기 제외용
      await _sleep(15);
    }
    if(stocksRows.length < 3) return null;
    var pool = SXKNN.buildPoolBank(stocksRows, win);
    if(!pool || !pool.bank || pool.bank.length < SXKNN.MIN_BANK) return null;
    var rec = { bank:pool.bank, W:pool.W, win:pool.win, donors:names, ts:Date.now() };
    _repBankCache[key] = rec; return rec;
  }

  // [S635] 종목별 풀 자동전환 판정 — 자기 vs (자기+대표목록) 백테스트 비교. 확실히 이기면(+3%p) 현재봉 풀링 점수 반환.
  //   win/k = 카드 kNN과 동일(16×10) 고정. 룩어헤드: scorePooled의 oDate≤qDate 게이트로 차단.
  async function evalPoolAuto(rows, mk, tf, code, name){
    try {
      if(!Array.isArray(rows) || rows.length < MIN_BARS+5) return { applies:false, reason:'데이터 부족' };
      if(typeof SXKNN==='undefined' || !SXKNN.buildVecs || !SXKNN.scorePooled) return { applies:false, reason:'kNN 미로드' };
      mk = _normMkt(mk); tf = tf || 'day';
      var win=16, k=10;
      var rep = await _ensureRepBank(mk, tf, win);
      if(!rep) return { applies:false, reason:'대표목록 풀 구축 실패' };
      var selfPre = SXKNN.buildVecs(rows, win);
      if(!selfPre || !selfPre.vecs || !selfPre.vecs.length) return { applies:false, reason:'자기 벡터 부족' };
      var selfBank = SXKNN.buildPoolBank([{ name:name||'(self)', code:code, rows:rows }], win);
      // [S644] 도너 풀(rep)에서 자기 종목 벡터 제외 — 자기는 selfBank로 이미 1벌 포함되므로 중복 계상 방지. 캐시(rep)는 전체 유지, 런타임 필터만.
      var _repBank = (code) ? rep.bank.filter(function(b){ return b.src !== code; }) : rep.bank;
      var combined = { bank: selfBank.bank.concat(_repBank), win:win, W:rep.W };   // 자기(1벌) + 대표(자기 제외)
      var n=rows.length, startI=Math.max(MIN_BARS, n-1-DEFAULT_MAX);
      var sP=0,sH=0,pP=0,pH=0;
      for(var q=startI;q<=n-2;q++){
        var up=_isUp(rows[q+1]);
        var rs=SXKNN.scoreAt(rows,q,selfPre,{k:k});
        if(rs&&rs.active&&Math.abs(rs.score)>=30){ sP++; if((rs.score>0)===up) sH++; }
        var qv=selfPre.vecs[q - selfPre.from];
        var rp=SXKNN.scorePooled(qv, SXKNN._dnum(rows[q].date), combined, {k:k});
        if(rp&&rp.active&&Math.abs(rp.score)>=30){ pP++; if((rp.score>0)===up) pH++; }
      }
      var selfHit=_pct(sH,sP), pooledHit=_pct(pH,pP);
      var delta = (selfHit!=null && pooledHit!=null) ? Math.round((pooledHit-selfHit)*10)/10 : null;
      var lastVec = selfPre.vecs[(n-1) - selfPre.from];
      var poolCur = lastVec ? SXKNN.scorePooled(lastVec, SXKNN._dnum(rows[n-1].date), combined, {k:k}) : null;
      // [S636] 자기<50% 게이트 — 풀링 신뢰 구간은 "자기 약함"(검증: 약함 3/3 도움 +7.3%p, 강함 8/12 손해). 강한데 우연히 +3%p 뜬 노이즈 제외.
      var applies = !!(delta!=null && delta>=3 && pP>=8 && sP>=8 && poolCur && poolCur.active && selfHit!=null && selfHit<50);
      var _donors = (rep.donors||[]).filter(function(n){ return n !== name; });   // [S644] 표시 도너에서도 자기 제외
      return { applies:applies, delta:delta, selfHit:selfHit, pooledHit:pooledHit, selfN:sP, pooledN:pP, poolCur:poolCur, poolSize:combined.bank.length, donors:_donors };
    } catch(e){ return { applies:false, reason:String((e&&e.message)||e) }; }
  }
})();
