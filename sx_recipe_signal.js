/* ════════════════════════════════════════════════════════════════════
 * sx_recipe_signal.js — [S782] 레시피 신호감지 카드 (분석탭)
 *   교차검증 도구에서 발굴한 '레시피(재료 2~4 조합)'를 현재 종목에 평가.
 *   - 현재봉 발동 시 [상승신호]/[하락신호] 배지 (진짜반등=상승 / 가짜반등=하락)
 *   - 과거 발동 지점들의 '후반평균([+6..+10]) 방향'으로 적중/실패 + 적중률 (이 종목)
 *   - 4분류: 역배열/정배열 × 진짜반등/가짜반등
 *   레시피는 auto-scan 결과 JSON에서 등록(아래 RECIPES 배열에 추가).
 *   데이터소스: [S782] SXCandleBT.fetchRows600 단일소스(600봉 보장 · 교차검증과 동일 캔들 · 'mkt|tf|code' 캐시).
 *   재사용 전역(sx_render.js): SXE.calcAllScreener · _extractFeats733 · _condMatch733 · _ltStr733
 *   측정 전용 · 엔진 무변경 · 일봉 기준 · 펼칠 때 평가(접힘=fetch 없음).
 * ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  /* ───────── 레시피 레지스트리 ─────────
   * pool: 'deadcat'(역배열) | 'pullback'(정배열)
   * kind: 'real'(진짜반등→상승신호) | 'fake'(가짜반등→하락신호)
   * conds: [{key,type:'num',dir:'lt'|'gt',th} | {key,type:'bin'}]
   * src : auto-scan JSON 글로벌통계 {n, late(후반평균), n10, surv}  (표시용)
   */
  var RECIPES = [
  // ── 역배열 · 진짜반등 (상승신호) · auto-scan JSON ──
  {id:'dc_r_01', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-139.53 + MA200 이격도%<-23.12 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'squeeze',type:'bin'}], src:{n:37,late:0.1778,n10:0.703,surv:0.546}},
  {id:'dc_r_02', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-139.53 + MA120 이격도%<-17.06 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'squeeze',type:'bin'}], src:{n:32,late:0.1731,n10:0.719,surv:0.566}},
  {id:'dc_r_03', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-139.53 + MA5 기울기%<-2.57 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'squeeze',type:'bin'}], src:{n:45,late:0.1219,n10:0.711,surv:0.578}},
  {id:'dc_r_04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + CCI<-139.53 + MA200 이격도%<-23.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'dev200',type:'num',dir:'lt',th:-23.12}], src:{n:33,late:0.118,n10:0.697,surv:0.673}},
  {id:'dc_r_05', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + RSI<35.84 + MA200 이격도%<-23.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'dev200',type:'num',dir:'lt',th:-23.12}], src:{n:51,late:0.1152,n10:0.686,surv:0.704}},
  {id:'dc_r_06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA120 이격도%<-17.06 + CCI<-139.53',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'cci',type:'num',dir:'lt',th:-139.53}], src:{n:38,late:0.1127,n10:0.737,surv:0.7}},
  {id:'dc_r_07', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-17.06 + OBV 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:33,late:0.1101,n10:0.788,surv:0.606}},
  {id:'dc_r_08', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-139.53 + MA60 이격도%<-11.21 + 거래량 OSC>22.87',
   conds:[{key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'volOsc',type:'num',dir:'gt',th:22.87}], src:{n:41,late:0.1062,n10:0.732,surv:0.688}},
  {id:'dc_r_09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA5 기울기%<-2.57 + MA200 이격도%<-23.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'dev200',type:'num',dir:'lt',th:-23.12}], src:{n:52,late:0.1049,n10:0.615,surv:0.648}},
  {id:'dc_r_10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA20 이격도%<-6.57 + MA60 이격도%<-11.21',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'dev60',type:'num',dir:'lt',th:-11.21}], src:{n:66,late:0.0976,n10:0.682,surv:0.694}},
  {id:'dc_r_11', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.1 + MA120 이격도%<-17.06 + CCI<-139.53',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'cci',type:'num',dir:'lt',th:-139.53}], src:{n:115,late:0.0832,n10:0.661,surv:0.577}},
  {id:'dc_r_12', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-11.21 + OBV 상승다이버전스 + MA200 이격도%<-23.12',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'obvDiv',type:'bin'}, {key:'dev200',type:'num',dir:'lt',th:-23.12}], src:{n:44,late:0.0555,n10:0.705,surv:0.664}},
  // ── 역배열 · 진짜반등 · 빌더 직접등록(사진 3장) ──
  {id:'dc_rs_01', pool:'deadcat', kind:'real', mode:'and', label:'ADX<14.18 + MA5 기울기%<-2.57',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}], src:{n:38,late:0.121,n10:0.92,surv:0.76}},
  {id:'dc_rs_02', pool:'deadcat', kind:'real', mode:'and', label:'ADX<14.18 + RSI 상승다이버전스',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'rsiDiv',type:'bin'}], src:{n:31,late:0.127,n10:0.77,surv:0.73}},
  {id:'dc_rs_03', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<37.33 + MA20 돌파안착(상승)',
   conds:[{key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'settle20',type:'bin'}], src:{n:33,late:0.026,n10:0.7,surv:0.64}}
  ];

  // 4분류 정의 (표시 순서)
  var CATS = [
    {pool:'deadcat',  kind:'real', label:'역배열 · 진짜반등', tone:'#16a34a'},
    {pool:'deadcat',  kind:'fake', label:'역배열 · 가짜반등', tone:'#dc2626'},
    {pool:'pullback', kind:'real', label:'정배열 · 진짜반등', tone:'#16a34a'},
    {pool:'pullback', kind:'fake', label:'정배열 · 가짜반등', tone:'#dc2626'}
  ];

  var GR='#16a34a', RD='#dc2626', AM='#d97706';

  /* ───────── 평가 헬퍼 (전역 재사용) ───────── */
  function _calc(slice){ try { return (typeof SXE!=='undefined' && SXE.calcAllScreener) ? SXE.calcAllScreener(slice,'day') : null; } catch(e){ return null; } }
  function _feats(ind, rows, i){ try { return (typeof _extractFeats733==='function') ? _extractFeats733(ind, rows, i) : null; } catch(e){ return null; } }
  function _match(f, conds, mode){ try { return (typeof _condMatch733==='function') ? _condMatch733(f, conds, mode) : false; } catch(e){ return false; } }
  function _ltOf(ind){ try { return (typeof _ltStr733==='function') ? _ltStr733(ind.maAlignLT) : null; } catch(e){ return null; } }
  function _curTf(){ try { return (typeof _analTF!=='undefined' && _analTF) ? _analTF : 'day'; } catch(e){ return 'day'; } }
  function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function _pct(x){ return (x>=0?'+':'')+(100*x).toFixed(1)+'%'; }

  // 후반평균 수익률 [+6..+10] (교차검증 도구와 동일 정의)
  function _lateRet(rows, bi){
    var ep = (rows[bi] && typeof rows[bi].close==='number') ? rows[bi].close : null; if(ep==null) return null;
    var s=0,c=0; for(var k=6;k<=10;k++){ var j=bi+k; if(rows[j] && typeof rows[j].close==='number'){ s+=rows[j].close/ep-1; c++; } }
    return c?s/c:null;
  }

  function _wantLt(rec){ return rec.pool==='pullback' ? 'bull' : 'bear'; }
  // 발동 = 풀 정렬(역배열/정배열) + 단기약세(!maBull) + 재료조건 충족
  function _fires(rec, f, lt, maBull){ return lt===_wantLt(rec) && !maBull && !!f && _match(f, rec.conds, rec.mode); }

  /* ───────── 종목 과거 스캔 (봉별 정렬+재료) · 캐시 ───────── */
  var _scanCache = {};
  function _cacheKey(sym, rows){ return sym+'_'+rows.length+'_'+(rows.length?rows[rows.length-1].close:0); }
  async function _scanStock(sym, rows){
    var ck=_cacheKey(sym, rows); if(_scanCache[ck]) return _scanCache[ck];
    var arr=[], start=250;
    for(var bi=start; bi<rows.length; bi++){
      var slice = rows.slice(Math.max(0, bi-249), bi+1);
      var ind = _calc(slice);
      if(ind){ var f=_feats(ind, rows, bi); if(f) arr.push({ bar:bi, lt:_ltOf(ind), maBull:!!(ind.maAlign && ind.maAlign.bullish), f:f }); }
      if((bi-start)%40===39){ await new Promise(function(r){ setTimeout(r,0); }); }   // UI 양보
    }
    _scanCache[ck]=arr; return arr;
  }

  /* ───────── 레시피 과거 적중 평가 ───────── */
  function _evalHistory(rec, scan, rows){
    var lastBar = rows.length-1, firings=[];
    for(var i=0;i<scan.length;i++){ var s=scan[i]; if(_fires(rec, s.f, s.lt, s.maBull)) firings.push(s.bar); }
    var hits=0, total=0;
    for(var k=0;k<firings.length;k++){
      var bi=firings[k], late=_lateRet(rows, bi);
      if(late==null) continue;                              // forward 미완성(너무 최근) → 적중률 제외
      var hit = rec.kind==='real' ? (late>0) : (late<0);    // 진짜=올랐으면 / 가짜=떨어졌으면 적중
      total++; if(hit) hits++;
    }
    var last=null;                                          // 가장 최근 발동 1건 (완성=적중/실패 · 미완성=관찰중)
    if(firings.length){ var lb=firings[firings.length-1], lr=_lateRet(rows, lb); last={ bar:lb, barsAgo:(lastBar-lb), complete:(lr!=null), hit:(lr!=null ? (rec.kind==='real'?lr>0:lr<0) : null) }; }
    return { fireCount:firings.length, hits:hits, total:total, hitRate:(total?hits/total:null), last:last, lastBar:lastBar };
  }

  /* ───────── 렌더 ───────── */
  function _sigBadge(rec, firing){
    var up = rec.kind==='real';
    if(firing){ var c=up?GR:RD; return '<span style="display:inline-block;font-size:10px;font-weight:800;padding:3px 9px;border-radius:5px;background:'+c+';color:#fff">'+(up?'상승신호':'하락신호')+'</span>'; }
    return '<span style="display:inline-block;font-size:9.5px;font-weight:700;padding:3px 9px;border-radius:5px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">관망</span>';
  }

  function _recipeRow(rec, firing){
    var s=rec.src;
    var stat = '표본'+s.n+' · 후반 '+_pct(s.late)+' · N10 '+Math.round(100*s.n10)+'%';
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 9px;border-top:1px solid var(--border)">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:10.5px;font-weight:700;color:var(--text);line-height:1.32">'+_esc(rec.label)+'</div>'
        + '<div style="font-size:8px;color:var(--text3);margin-top:2px">'+stat+'</div>'
      + '</div>'
      + '<div style="flex-shrink:0;text-align:right">'
        + _sigBadge(rec, firing)
        + '<div id="rcphit_'+rec.id+'" style="font-size:8px;color:var(--text3);margin-top:3px;white-space:nowrap">적중률 …</div>'
      + '</div>'
    + '</div>';
  }

  function _hitHtml(rec, h){
    if(h.fireCount===0) return '<span style="color:var(--text3)">발동이력 없음</span>';
    var rate = (h.hitRate!=null) ? ('적중 <b style="color:'+(h.hitRate>=0.5?GR:RD)+'">'+Math.round(100*h.hitRate)+'%</b> ('+h.hits+'/'+h.total+')') : '적중 —';
    var tail='';
    if(h.last){
      if(h.last.complete) tail = ' · '+h.last.barsAgo+'봉전 '+(h.last.hit?'<b style="color:'+GR+'">✓적중</b>':'<b style="color:'+RD+'">✗실패</b>');
      else tail = ' · '+h.last.barsAgo+'봉전 <b style="color:'+AM+'">관찰중</b>';
    }
    return rate+tail;
  }

  // 헤더 요약 갱신
  function _setSummary(html){ var el=document.getElementById('sxRecipeSummary'); if(el) el.innerHTML=html; }

  // 그룹 본문 렌더 (현재봉 발동 기준) → {inner, fireCount, ltLabel}
  function _renderBody(fNow, ltNow, maBullNow){
    var ltLabel = ltNow==='bear'?'역배열':ltNow==='bull'?'정배열':'중립';
    var fireCount=0, inner='';
    CATS.forEach(function(cat){
      var recs = RECIPES.filter(function(r){ return r.pool===cat.pool && r.kind===cat.kind; });
      if(!recs.length) return;
      inner += '<div style="font-size:10px;font-weight:800;color:'+cat.tone+';padding:8px 9px 2px">'+cat.label+' <span style="color:var(--text3);font-weight:600">('+recs.length+')</span></div>';
      recs.forEach(function(r){ var fr=_fires(r, fNow, ltNow, maBullNow); if(fr) fireCount++; inner += _recipeRow(r, fr); });
    });
    var emptyCats = CATS.filter(function(c){ return !RECIPES.some(function(r){ return r.pool===c.pool && r.kind===c.kind; }); });
    if(emptyCats.length){
      inner += '<div style="font-size:8px;color:var(--text3);padding:8px 10px 2px;line-height:1.5;border-top:1px dashed var(--border);margin-top:4px">미등록 분류: '+emptyCats.map(function(c){return c.label;}).join(' / ')+' — 레시피 추가 시 표시</div>';
    }
    inner += '<div style="font-size:8px;color:var(--text3);padding:4px 10px 2px;line-height:1.5">발동 = 현재봉이 (그 풀 정렬+단기약세 + 재료조건) 충족. 적중 = 과거 발동 후 <b>후반평균([+6..+10]) 방향</b>이 신호와 일치(진짜=상승/가짜=하락). 적중률·최근은 <b>이 종목 600봉</b> 기준 · 표본/후반은 풀 전체. 일봉 기준 · fetchRows600 단일소스(교차검증과 동일 캔들).</div>';
    return { inner:inner, fireCount:fireCount, ltLabel:ltLabel };
  }

  // 비동기: fetchRows600 단일소스 → 현재봉 발동 + 그룹 + 헤더 + 과거 적중률 (종목 가드)
  async function _populate(sym){
    var ctx = window._sxRecipeCtx; if(!ctx || ctx.sym!==sym) return;
    var body = document.getElementById('sxRecipeBody'); if(!body) return;
    body.setAttribute('data-populated','1');
    var rows;
    try { rows = (window.SXCandleBT && SXCandleBT.fetchRows600) ? await SXCandleBT.fetchRows600(ctx.mk, ctx.tf, ctx.code) : null; } catch(e){ rows=null; }
    if(window._sxRecipeActiveSym!==sym) return;                 // 다른 종목 이동 → 폐기
    body = document.getElementById('sxRecipeBody'); if(!body) return;
    if(!Array.isArray(rows) || rows.length<260){
      body.innerHTML='<div style="padding:14px 12px;font-size:10px;color:var(--text3);line-height:1.5">600봉 미확보(또는 상장 짧음) — 잠시 후 다시 펼쳐 주세요.</div>';
      _setSummary('<span style="color:var(--text3)">데이터 부족</span>'); return;
    }
    // 현재봉 발동 (calcAllScreener 1회)
    var indNow=_calc(rows), fNow=indNow?_feats(indNow, rows, rows.length-1):null;
    var ltNow=indNow?_ltOf(indNow):null, maBullNow=!!(indNow && indNow.maAlign && indNow.maAlign.bullish);
    var rb=_renderBody(fNow, ltNow, maBullNow);
    body.innerHTML = rb.inner;
    _setSummary(rb.fireCount>0
      ? ('<span style="color:'+GR+'">● 신호 '+rb.fireCount+'개 발동</span> <span style="color:var(--text3);font-weight:500">· '+rb.ltLabel+'</span>')
      : ('<span style="color:var(--text3)">관망 · '+rb.ltLabel+'</span>'));
    // 과거 적중률 (받은 rows 재사용 · 추가 fetch 없음)
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return; }
    if(window._sxRecipeActiveSym!==sym) return;
    RECIPES.forEach(function(rec){
      var el=document.getElementById('rcphit_'+rec.id); if(!el) return;
      try { el.innerHTML=_hitHtml(rec, _evalHistory(rec, scan, rows)); } catch(e){ el.textContent='–'; }
    });
  }

  // 시장 유도 (캔들카드 _mktCT와 동일 · fetchRows600 내부 _normMkt가 정규화)
  function _mkOf(stock){ return (stock && (stock._mkt || stock.market)) || ((typeof currentMarket!=='undefined') ? currentMarket : 'kr'); }

  function _wrap(inner, summaryHtml, open){
    return '<div class="anal-card" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin:0 0 8px;overflow:hidden">'
      + '<div onclick="window.SXRecipeSignal&&SXRecipeSignal.toggle()" style="display:flex;align-items:center;gap:7px;padding:12px 14px;cursor:pointer">'
        + '<span id="sxRecipeArrow" style="color:var(--accent);font-size:12px">'+(open?'▼':'▶')+'</span>'
        + '<span style="font-size:13px;font-weight:800;color:var(--text)">🎯 레시피 신호감지</span>'
        + '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span>'
        + '<span id="sxRecipeSummary" style="margin-left:auto;font-size:10px;font-weight:700">'+summaryHtml+'</span>'
      + '</div>'
      + '<div id="sxRecipeBody" data-populated="0" style="display:'+(open?'block':'none')+';padding:0 4px 8px">'+inner+'</div>'
    + '</div>';
  }

  function buildCard(stock, indicators){
    var sym = (stock && (stock.code||stock.name)) || '?';
    window._sxRecipeActiveSym = sym;
    var open = !!window._sxRecipeOpen;
    if(_curTf()!=='day'){
      return _wrap('<div style="padding:12px 12px;font-size:10px;color:var(--text3);line-height:1.5">레시피는 <b>일봉 기준</b>이라 현재 시간프레임에선 평가하지 않아요. 일봉으로 전환 시 표시됩니다.</div>', '<span style="color:var(--text3)">일봉 전용</span>', open);
    }
    window._sxRecipeCtx = { sym:sym, tf:_curTf(), code:(stock && stock.code) || sym, mk:_mkOf(stock) };
    if(open){ setTimeout(function(){ try{ _populate(sym); }catch(e){} }, 60); }
    var loading = '<div style="padding:14px 12px;font-size:10px;color:var(--text3)">레시피 평가 중… <span style="font-size:9px">(600봉 로드)</span></div>';
    var summary = open ? '<span style="color:var(--text3)">분석중…</span>' : '<span style="color:var(--accent)">탭하여 신호 평가 ▸</span>';
    return _wrap(loading, summary, open);
  }

  function toggle(){
    try {
      var body=document.getElementById('sxRecipeBody'), arr=document.getElementById('sxRecipeArrow');
      if(!body) return;
      var open = body.style.display!=='none';
      body.style.display = open?'none':'block';
      if(arr) arr.textContent = open?'▶':'▼';
      window._sxRecipeOpen = !open;
      if(typeof _sxVib==='function') _sxVib(8);
      if(!open && body.getAttribute('data-populated')!=='1'){
        _setSummary('<span style="color:var(--text3)">분석중…</span>');
        var ctx=window._sxRecipeCtx; if(ctx) _populate(ctx.sym);
      }
    } catch(e){}
  }

  window.SXRecipeSignal = { buildCard:buildCard, toggle:toggle, _populate:_populate, RECIPES:RECIPES };
})();
