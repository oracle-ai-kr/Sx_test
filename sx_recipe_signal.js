/* ════════════════════════════════════════════════════════════════════
 * sx_recipe_signal.js — [S841] 레시피 신호감지 카드 (분석탭)
 *   교차검증 도구에서 발굴한 '레시피(재료 2~4 조합)'를 현재 종목에 평가.
 *   - 현재봉 발동 시 [상승신호]/[하락신호] 배지 (진짜반등=상승 / 가짜반등=하락)
 *   - 과거 발동 지점들의 '후반평균([+6..+10]) 방향'으로 적중/실패 + 적중률 (이 종목)
 *   - 4분류: 역배열/정배열 × 진짜반등/가짜반등
 *   레시피는 auto-scan 결과 JSON에서 등록 — [S849] 시장별 RECIPES_BY_MKT{kr,us,coin}에 추가(발굴풀 스냅샷 기준·등록컷 적용). 소비는 _R()/recipesFor(mk).
 *   데이터소스: [S782] SXCandleBT.fetchRows600 단일소스(600봉 보장 · 교차검증과 동일 캔들 · 'mkt|tf|code' 캐시).
 *   재사용 전역(sx_render.js): SXE.calcAllScreener · _extractFeats733 · _condMatch733 · _ltStr733
 *   [S795] _pendingByCat(sym,rows) 노출 — 카테고리별 '관찰중'(최근발동 0-9봉=N10 미확정) 집계 · 배지 인벤토리가 당겨씀(동일 _scanStock 캐시).
 *   [S807] realFireBars(sym,rows) 노출 — 진짜반등(real=pullback-real 정배 + deadcat-real 역배) 발동 봉맵 {barIdx:true}. 단기추세매매 검증모달 물타기용(동일 _scanStock 캐시 공유 · 같은 rows 넘기면 봉 인덱스 일치).
 *   [S809] overlapScan(sym,rows) 노출 — 봉별 real 레시피 동시발동 수(겹침)+N10 후반평균 적중. 교차검증 '레시피 겹침' 도구용(동일 _scanStock 캐시 공유). _realFireBars와 달리 break 없이 발동수 끝까지 카운트.
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
  /* [S877] RECIPES_BY_MKT + [S865] 주석 → sx_recipe_core.js 이관(전역 var — _R() 무변경 참조) */
  var _preview=null;   // [S872] 미리보기 세트 {set:[registry형], meta:{name,mkt,counts}} — 측정 도구 전용. 라이브/풀링 오염 차단은 render _sxRecipeSigFor 가드.
  function _R(){ if(_preview&&_preview.set) return _preview.set; return RECIPES_BY_MKT[(typeof currentMarket!=='undefined')?currentMarket:'kr'] || RECIPES_BY_MKT.kr; }   // [S849] 현재 시장 세트 · [S872] 미리보기 우선
  function _setPreview(set, meta){ _preview=(Array.isArray(set)&&set.length)?{set:set, meta:meta||{}}:null; return !!_preview; }
  function _clearPreview(){ _preview=null; }
  function _previewInfo(){ return _preview?(_preview.meta||{}):null; }
  function _recipesFor(mk){ return RECIPES_BY_MKT[mk] || RECIPES_BY_MKT.kr; }

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
  /* [S877] _match → core 이관 */
  /* [S877] _ltOf → sx_recipe_core.js 이관(전역 동명 — 호출부 무변경) */
  function _curTf(){ try { return (typeof _analTF!=='undefined' && _analTF) ? _analTF : 'day'; } catch(e){ return 'day'; } }
  function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function _pct(x){ return (x>=0?'+':'')+(100*x).toFixed(1)+'%'; }

  // 후반평균 수익률 [+6..+10] (교차검증 도구와 동일 정의)
  // 발동 후 [+k1..+k2]봉 평균수익(진입종가 대비). 끝봉 미존재시 부분평균(완성판정은 _hzComplete 별도).
  function _retWindow(rows, bi, k1, k2){
    var ep = (rows[bi] && typeof rows[bi].close==='number') ? rows[bi].close : null; if(ep==null) return null;
    var s=0,c=0; for(var k=k1;k<=k2;k++){ var j=bi+k; if(rows[j] && typeof rows[j].close==='number'){ s+=rows[j].close/ep-1; c++; } }
    return c?s/c:null;
  }
  function _hzComplete(rows, bi, k2){ return (bi+k2) < rows.length; }   // [+k2]봉 존재 = 그 윈도우 완성
  // [S801] 다호라이즌 적중 비교 — N10(기본·배지/관찰중)에 N15·N20 병행(데드캣은 늦게 무너짐→horizon↑면 가짜 변별력↑ 가설 검증). 측정전용·각 윈도우는 비겹침 5봉·완성분만 집계.
  var _HZ = [{k:'h10',k1:6,k2:10,lab:'N10'},{k:'h15',k1:11,k2:15,lab:'N15'},{k:'h20',k1:16,k2:20,lab:'N20'}];
  function _emptyHz(){ return {h10:{h:0,t:0},h15:{h:0,t:0},h20:{h:0,t:0}}; }
  function _lateRet(rows, bi){ return _retWindow(rows, bi, 6, 10); }   // 하위호환(=N10 [+6..+10])
  // [S796 복구] N10 풀윈도우 완성(barsAgo≥10) → 결과확정. barsAgo 0-9 = 관찰중. (S797 cp사고로 누락됐던 것 복구)
  function _lateComplete(rows, bi){ return _hzComplete(rows, bi, 10); }

  /* [S877] _wantLt → sx_recipe_core.js 이관(전역 동명 — 호출부 무변경) */
  // 발동 = 풀 정렬(역배열/정배열) + 단기약세(!maBull) + 재료조건 충족
  /* [S877] _fires → sx_recipe_core.js 이관(전역 동명 — 호출부 무변경) */

  /* ───────── 종목 과거 스캔 (봉별 정렬+재료) · 캐시 ───────── */
  var _scanCache = {};
  function _cacheKey(sym, rows){ return sym+'_'+rows.length+'_'+(rows.length?rows[rows.length-1].close:0); }
  async function _scanStock(sym, rows){
    var ck=_cacheKey(sym, rows); if(_scanCache[ck]) return _scanCache[ck];
    var arr=[], start=250;
    for(var bi=start; bi<rows.length; bi++){
      var slice = rows.slice(Math.max(0, bi-249), bi+1);
      var ind = _calc(slice);
      if(ind){ var f=_feats(ind, rows, bi); if(f){
        var _rd=null,_en=null,_tp=null,_up=null;   // [S861] 4축 순수점수 저장 — momDir 재현·동반조건(trend≥50) 측정용. 순수함수 4개=봉당 저비용(calcAllScreener 대비 미미).
        try{ _rd=(typeof scrReadyScore==='function')?scrReadyScore(ind).score:null; }catch(_e1){}
        try{ _en=(typeof scrEntryScore==='function')?scrEntryScore(ind).score:null; }catch(_e2){}
        try{ _tp=(typeof scrTrendPure==='function')?scrTrendPure(ind).score:null; }catch(_e3){}
        try{ _up=(typeof scrUpsideScore==='function')?scrUpsideScore(ind).score:null; }catch(_e4){}
        arr.push({ bar:bi, lt:_ltOf(ind), maBull:!!(ind.maAlign && ind.maAlign.bullish), maBear:!!(ind.maAlign && ind.maAlign.bearish), f:f, rd:_rd, en:_en, tp:_tp, up:_up });   // [S824] maBear=단기 역배(MA5<20<60) — 데드캣 단기쪼개기 측정용 · [S861] rd/en/tp/up
      } }
      if((bi-start)%40===39){ await new Promise(function(r){ setTimeout(r,0); }); }   // UI 양보
    }
    _scanCache[ck]=arr; return arr;
  }

  /* ───────── 레시피 과거 적중 평가 ───────── */
  function _evalHistory(rec, scan, rows){
    var lastBar = rows.length-1, firings=[];
    for(var i=0;i<scan.length;i++){ var s=scan[i]; if(_fires(rec, s.f, s.lt, s.maBull)) firings.push(s.bar); }
    var hz=_emptyHz();   // [S801] 호라이즌별 적중(각 윈도우 완성분만)
    for(var k=0;k<firings.length;k++){
      var bi=firings[k];
      for(var hi=0;hi<_HZ.length;hi++){ var H=_HZ[hi];
        if(!_hzComplete(rows, bi, H.k2)) continue;          // 그 윈도우 미완성 → 제외
        var r=_retWindow(rows, bi, H.k1, H.k2); if(r==null) continue;
        var hit = rec.kind==='real' ? (r>0) : (r<0);        // 진짜=올랐으면 / 가짜=떨어졌으면 적중
        hz[H.k].t++; if(hit) hz[H.k].h++;
      }
    }
    var hits=hz.h10.h, total=hz.h10.t;                      // 기본=N10 (per-row 적중률·배지)
    var last=null;                                          // 가장 최근 발동 1건 (완성=N10 풀윈도우 barsAgo≥10)
    if(firings.length){ var lb=firings[firings.length-1], comp=_lateComplete(rows, lb), r10=comp?_lateRet(rows, lb):null;
      var _ep=(rows[lb]&&typeof rows[lb].close==='number')?rows[lb].close:null, _cur=(rows[lastBar]&&typeof rows[lastBar].close==='number')?rows[lastBar].close:null;
      var _alive=(_ep>0&&_cur!=null)?(_cur/_ep-1):null;   // [S836] 현재봉 종가/발동가-1 = 측정 traj[barsAgo-1] (각 시점 독립·>0=살아있음)
      last={ bar:lb, barsAgo:(lastBar-lb), complete:comp, aliveRet:_alive, hit:(comp&&r10!=null ? (rec.kind==='real'?r10>0:r10<0) : null) }; }
    return { fireCount:firings.length, hits:hits, total:total, hitRate:(total?hits/total:null), last:last, lastBar:lastBar, hz:hz };
  }

  /* ───────── 카테고리별 '관찰중' 집계 (최근발동 0-9봉=N10 결과 미확정) · _scanStock 캐시 공유 · 배지 인벤토리가 당겨씀 ───────── */
  async function _pendingByCat(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var out={};   // 'pool|kind' → {count, oldest, ids:[], overlap}  (oldest=확정임박·overlap=현재봉 동시발동 겹침)
    _R().forEach(function(rec){
      var h; try { h=_evalHistory(rec, scan, rows); } catch(e){ return; }
      if(h.last && !h.last.complete){          // 최근발동 미완성 = 관찰중 (레시피카드 '관찰중'과 동일 정의)
        var key=rec.pool+'|'+rec.kind;
        if(!out[key]) out[key]={count:0, oldest:-1, ids:[], overlap:0};
        out[key].count++; out[key].ids.push(rec.id);
        if(h.last.barsAgo>out[key].oldest) out[key].oldest=h.last.barsAgo;
      }
    });
    // [S840] 현재봉 겹침(동시발동 수) — 배지 인벤토리 겹침 전환. 정배 N10·역배 N15 검증된 겹침 단계용.
    var _last=scan.length?scan[scan.length-1]:null;
    if(_last){
      _R().forEach(function(rec){
        if(_fires(rec, _last.f, _last.lt, _last.maBull)){
          var key=rec.pool+'|'+rec.kind;
          if(!out[key]) out[key]={count:0, oldest:-1, ids:[], overlap:0};
          out[key].overlap=(out[key].overlap||0)+1;
        }
      });
    }
    return out;
  }

  /* ───────── [S807] 진짜반등(real) 발동 봉맵 — 단기추세매매 검증모달 물타기용 ─────────
   *   _scanStock 재사용(무거운 봉별 calcAllScreener는 1회·캐시 공유). real = pullback-real(정배 bull)+deadcat-real(역배 bear) 둘 다.
   *   각 봉은 _fires(정렬 일치 + 단기약세 !maBull + 재료조건)로 판정 → 그 봉 정렬상태에 맞는 real만 발동.
   *   반환 {barIdx:true} (real 레시피 하나라도 발동한 봉). 같은 rows 넘기면 단기추세매매 BT와 봉 인덱스 1:1.
   *   [S814] opts.excludeBear=true → deadcat(역배) 제외·pullback(정배 눌림목) real만. 역배 물타기가 손실 키우는 경향 → 검증모달 '역배열 제외' 체크박스(기본ON)용.
   */
  async function _realFireBars(sym, rows, opts){
    opts = opts || {};
    if(!Array.isArray(rows) || rows.length<260) return {};
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return {}; }
    var reals = _R().filter(function(r){
      if(r.kind!=='real') return false;
      if(opts.excludeBear && r.pool==='deadcat') return false;   // [S814] 역배(데드캣) 제외 → 정배 눌림목 real만
      return true;
    });
    var fire = {};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      for(var k=0;k<reals.length;k++){
        if(_fires(reals[k], s.f, s.lt, s.maBull)){ fire[s.bar]=true; break; }
      }
    }
    return fire;
  }

  /* ───────── [S816] 정배열 눌림목 신호 봉맵 — 단기추세매매 '정배열 레시피 엔진'용 ─────────
   *   pullback-real(진입) + pullback-fake(청산) 발동 봉. 역배(deadcat)·크로스 무관·정배열만.
   *   _scanStock 재사용(캐시 공유). 같은 rows 넘기면 BT와 봉 인덱스 1:1.
   *   반환 {real:{barIdx:true}, fake:{barIdx:true}}.
   */
  async function _pullbackSignalBars(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return {real:{},fake:{}};
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return {real:{},fake:{}}; }
    var pbReal = _R().filter(function(r){ return r.kind==='real' && r.pool==='pullback'; });
    var pbFake = _R().filter(function(r){ return r.kind==='fake' && r.pool==='pullback'; });
    var real={}, fake={};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      for(var k=0;k<pbReal.length;k++){ if(_fires(pbReal[k], s.f, s.lt, s.maBull)){ real[s.bar]=true; break; } }
      for(var k2=0;k2<pbFake.length;k2++){ if(_fires(pbFake[k2], s.f, s.lt, s.maBull)){ fake[s.bar]=true; break; } }
    }
    return {real:real, fake:fake};
  }

  /* ───────── [S809] 겹침 측정 — 봉별 real 레시피 동시발동 수 + N10 후반평균 적중 ─────────
   *   _realFireBars와 동일 _scanStock 캐시 공유. 차이: break(1개라도) 대신 발동 레시피 수(k)를 끝까지 카운트.
   *   _fires가 정렬+단기약세 매칭하니 역배봉=deadcat-{real,fake}만·정배봉=pullback-{real,fake}만 자동 집계(풀 구분 공짜).
   *   [S813] real+fake 둘 다 카운트(realK·fakeK). hit=real기준(상승). fake 적중(하락)은 호출측이 ret<0으로 계산. k=realK(하위호환).
   *   반환 [{bar, lt('bear'/'bull'), realK, fakeK, k(=realK), complete, hit(real=상승), ret}].
   *   교차검증 '레시피 겹침' 도구가 종목 전수로 모아 4사분면(역배/정배 × real/fake) 겹침수별 적중비율 집계. N10=실전 판정기준(S806).
   */
  async function _overlapScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real'; });
    var fakes = _R().filter(function(r){ return r.kind==='fake'; });
    var out = [];
    for(var i=0;i<scan.length;i++){
      var s=scan[i], rk=0, fk=0;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
      for(var j2=0;j2<fakes.length;j2++){ if(_fires(fakes[j2], s.f, s.lt, s.maBull)) fk++; }
      if(rk===0 && fk===0) continue;                                 // real·fake 둘 다 0이면 제외
      var comp=_lateComplete(rows, s.bar), ret=comp?_lateRet(rows, s.bar):null;
      out.push({ bar:s.bar, lt:s.lt, stBear:!!s.maBear, realK:rk, fakeK:fk, k:rk, complete:comp, ret:ret, hit:(comp&&ret!=null)?(ret>0):null });   // [S824] stBear=단기 역배 — (하,하)/(하,혼조) 쪼개기
    }
    return out;
  }

  /* ───────── [S859] 봉 단위 발동 평가(동기·경량) — C 반등경로 레시피표 A/B용.
   *   _scanStock 불사용: 호출측이 이미 계산한 ind(calcAllScreener 결과)를 받아 feats 추출+매칭만 수행(봉당 수백 비교·저비용).
   *   mk 지정 시 그 시장 세트(recipesFor), 미지정=현재 시장(_R). idx=rows상 평가봉 인덱스(보통 마지막 봉).
   *   반환 { realK, fakeK, lt, maBull, pure(real 발동 & fake 무발동), mixed(real·fake 동시) } | null.
   */
  function _evalBar(ind, rows, idx, mk){
    if(!ind || !Array.isArray(rows)) return null;
    var f=null; try{ f=_feats(ind, rows, idx); }catch(e){ return null; }
    if(!f) return null;
    var lt=_ltOf(ind), maBull=!!(ind.maAlign && ind.maAlign.bullish);
    var set=mk?_recipesFor(mk):_R(), rk=0, fk=0;
    for(var i=0;i<set.length;i++){ var r=set[i]; if(_fires(r, f, lt, maBull)){ if(r.kind==='real') rk++; else fk++; } }
    return { realK:rk, fakeK:fk, lt:lt, maBull:maBull, pure:(rk>0&&fk===0), mixed:(rk>0&&fk>0) };
  }

  /* ───────── [S861] C momDir 재현(측정전용 복제) — scoreMomentum(S86: 현재 vs 1~3봉전 평균 델타) + momentumBadge(±5 임계·2표 우세) 규칙.
   *   scoreMomentum 직접 호출은 봉당 scrQuickScore×5라 비용 폭탄 → _scanStock에 저장한 rd/en/tp/up 순수점수로 재현. 엔진 규칙 변경 시 드리프트 주의(미러성 주석).
   */
  function _mdAt(scan, i){
    if(i<1) return null;
    var cur=scan[i];
    if(cur.rd==null||cur.en==null||cur.tp==null||cur.up==null) return null;
    var lo=Math.max(0,i-3), n=0, sums={rd:0,en:0,tp:0,up:0};
    for(var j=i-1;j>=lo;j--){ var e2=scan[j]; if(e2.rd==null||e2.en==null||e2.tp==null||e2.up==null) break; sums.rd+=e2.rd; sums.en+=e2.en; sums.tp+=e2.tp; sums.up+=e2.up; n++; }
    if(!n) return null;
    var up=0,down=0,ks=['rd','en','tp','up'];
    for(var k=0;k<ks.length;k++){ var key=ks[k], d=cur[key]-Math.round(sums[key]/n); if(d>=5)up++; else if(d<=-5)down++; }
    return (up>=2&&up>down)?'up':((down>=2&&down>up)?'down':'flat');
  }

  /* ───────── [S873] 재료 불켜짐 스캔 — real 레시피를 단일재료로 분해해 봉별 활성 수(불켜짐)를 셈.
   *   사전: 현재 세트(미리보기 포함) real 레시피의 conds를 (key,dir) 단위로 통합 — 같은 지표·방향은 가장 느슨한 임계(lt→max th, gt→min th)로 OR. bin은 key.
   *   판정은 _condMatch733 단일조건 호출로 위임(매칭 로직 드리프트 방지). 레짐 일치(lt===wantLt && !maBull) 봉만, t+15 완성봉만.
   *   반환 { dict:{bear:K,bull:K}, bars:[{b,side,ing,rk,c7,c10,c15,nf(다음 real 발동까지 봉수|null)}] } — 방향성/전이/결합 측정 원료.
   */
  async function _ingScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<280) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var mkDict=function(pool){
      var g={};
      _R().filter(function(r){ return r.kind==='real'&&r.pool===pool; }).forEach(function(r){
        r.conds.forEach(function(c){
          var k=c.key+(c.dir?('_'+c.dir):'');
          if(c.type==='num'){
            if(!g[k]) g[k]={key:c.key,type:'num',dir:c.dir,th:c.th};
            else g[k].th=(c.dir==='lt')?Math.max(g[k].th,c.th):Math.min(g[k].th,c.th);
          } else if(!g[k]) g[k]={key:c.key,type:'bin'};
        });
      });
      return Object.keys(g).map(function(k){ return g[k]; });
    };
    var dict={ bear:mkDict('deadcat'), bull:mkDict('pullback') };
    var reals={ bear:_R().filter(function(r){return r.kind==='real'&&r.pool==='deadcat';}), bull:_R().filter(function(r){return r.kind==='real'&&r.pool==='pullback';}) };
    var H=15, bars=[];
    for(var i=0;i<scan.length;i++){
      var s0=scan[i], b=s0.bar;
      if(b+H>=rows.length) break;
      var side=(s0.lt==='bear')?'bear':(s0.lt==='bull'?'bull':null);
      if(!side || s0.maBull) continue;                                   // _fires 게이트와 동일 레짐 조건
      var ep=rows[b]&&rows[b].close; if(!(ep>0)) continue;
      var c7=rows[b+7]?rows[b+7].close/ep-1:null, c10=rows[b+10]?rows[b+10].close/ep-1:null, c15=rows[b+15]?rows[b+15].close/ep-1:null;
      if(c7==null||c10==null||c15==null) continue;
      var dd=dict[side], ing=0;
      for(var di=0;di<dd.length;di++){ try{ if(_condMatch733(s0.f, [dd[di]], 'and')) ing++; }catch(_e){} }
      var rr=reals[side], rk=0;
      for(var ri=0;ri<rr.length;ri++){ if(_fires(rr[ri], s0.f, s0.lt, s0.maBull)) rk++; }
      bars.push({ b:b, si:i, side:side, ing:ing, rk:rk, c7:c7, c10:c10, c15:c15, nf:null });
    }
    // 전이: 미발동 봉 → 다음 real 발동까지 봉수 (scan 인덱스 기준 — 레짐 이탈 봉은 발동 불가라 건너뜀 자체가 정보)
    var lastFireBar=null;
    for(var j=bars.length-1;j>=0;j--){
      if(bars[j].rk>0){ lastFireBar=bars[j].b; bars[j].nf=0; }
      else bars[j].nf=(lastFireBar!=null)?(lastFireBar-bars[j].b):null;
    }
    return { dict:{bear:dict.bear.length, bull:dict.bull.length}, bars:bars };
  }

  /* ───────── [S856] 발동 후 시간 프로파일 — "발동 후 t+k 경과 시 신호가 유력해지는 시점" 측정.
   *   개념(반등준비/전환 재설계 근거): 준비=발동 후 아직 유력 전 대기구간 · 전환=유력 진입시점. 이 도구가 그 경계(t+k)를 데이터로 정함.
   *   이벤트=신규발동(onset): 같은 kind(real/fake) 발동이 직전 5봉 내 없던 봉만 — 군집 연속발동은 t+k 축을 뭉개므로 제외(발동 상태는 lastFire로 계속 추적).
   *   각 이벤트: cum[j]=close[bar+1+j]/close[bar]−1 (t+1..t+20). bar+20 완성 이벤트만(전 오프셋 동일 표본 = 열간 비교 가능).
   *   base: 발동 무관 해당 레짐(lt bear/bull) 전체 완성봉의 동일 cum — 불장 기준선(S825 교훈 · 리프트 계산용). 동일 완성창 기준이라 이벤트와 사과대사과.
   *   반환 { events:[{bar,lt,kind,k(겹침수),xk(상대kind 동시발동수·[S857] 오염측정),cum:[20]}], base:{bear:{n,hit[20](상승수),sum[20]},bull:{...}} } | null. _scanStock 캐시 공유 · 측정전용.
   */
  async function _profileScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<280) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals=_R().filter(function(r){ return r.kind==='real'; });
    var fakes=_R().filter(function(r){ return r.kind==='fake'; });
    var H=20, events=[];
    var base={ bear:{n:0,hit:new Array(H).fill(0),sum:new Array(H).fill(0)}, bull:{n:0,hit:new Array(H).fill(0),sum:new Array(H).fill(0)} };
    var lastReal=-99, lastFake=-99;
    for(var i=0;i<scan.length;i++){
      var s=scan[i], b=s.bar;
      if(b+H>=rows.length) break;                                   // 정렬 순회 — 최초 미완성 이후 전부 미완성
      var ep=(rows[b]&&typeof rows[b].close==='number')?rows[b].close:null; if(!(ep>0)) continue;
      var cum=new Array(H), ok=true;
      for(var j=0;j<H;j++){ var c=(rows[b+1+j]&&typeof rows[b+1+j].close==='number')?rows[b+1+j].close:null; if(c==null){ ok=false; break; } cum[j]=c/ep-1; }
      if(!ok) continue;
      var side=(s.lt==='bear')?'bear':(s.lt==='bull'?'bull':null);
      if(side){ var bb=base[side]; bb.n++; for(var j2=0;j2<H;j2++){ if(cum[j2]>0) bb.hit[j2]++; bb.sum[j2]+=cum[j2]; } }
      var rk=0, fk=0;
      for(var jr=0;jr<reals.length;jr++){ if(_fires(reals[jr], s.f, s.lt, s.maBull)) rk++; }
      for(var jf=0;jf<fakes.length;jf++){ if(_fires(fakes[jf], s.f, s.lt, s.maBull)) fk++; }
      if(rk>0){ if(side && b-lastReal>5) events.push({ bar:b, lt:side, kind:'real', k:rk, xk:fk, tp:s.tp, md:_mdAt(scan,i), cum:cum }); lastReal=b; }   // [S857] xk=상대 kind 동시발동 · [S861] tp=trendPure·md=momDir 재현(동반조건 측정)
      if(fk>0){ if(side && b-lastFake>5) events.push({ bar:b, lt:side, kind:'fake', k:fk, xk:rk, tp:s.tp, md:_mdAt(scan,i), cum:cum }); lastFake=b; }
    }
    return { events:events, base:base };
  }

  /* ───────── [S825] base rate 스캔 — 발동 무관 전체 봉의 N10 상승비율(불장 기준선). _scanStock 캐시 공유.
   *   (하,하) deadcat-real 67%가 진짜 변별력인지 "불장이라 뭘 사도 오름"인지 분해용. 레짐별 base rate 제공.
   *   반환 [{bar, lt, stBull, stBear, complete, ret, up}] (모든 봉·발동 조건 무관).
   */
  async function _baseRateScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var out=[];
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      var comp=_lateComplete(rows, s.bar), ret=comp?_lateRet(rows, s.bar):null;
      out.push({ bar:s.bar, lt:s.lt, stBull:!!s.maBull, stBear:!!s.maBear, complete:comp, ret:ret, up:(comp&&ret!=null)?(ret>0):null });
    }
    return out;
  }

  /* ───────── [S827] deadcat-real 진입 후 궤적 — 발동봉 이후 t+1~t+10 봉별 누적수익 + N10 진짜/가짜 라벨.
   *   진입 시점 예측(5번 실패)이 아니라 "진입 후 빨리 가짜를 감지할 수 있나"(조기 손절) 측정. _scanStock 캐시 공유.
   *   label=_lateRet(N10 [+6..+10] 평균)>0?real:fake. traj[k]=t+(k+1) 누적수익(진입종가 대비). N10 완성봉만.
   *   ★t+1~t+5=라벨과 독립(조기 감지 실거리) · t+6~t+10=라벨이 이 구간 결과라 순환(당연히 갈림). 반환 [{label, stBear, traj:[10]}].
   */
  async function _deadcatTrajScan(sym, rows, pool){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var POOL=pool||'deadcat', WLT=(POOL==='pullback')?'bull':'bear';   // [S831] pool 파라미터화 — 정배(pullback,bull)/역배(deadcat,bear) 공용
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool===POOL; });
    var out=[];
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!==WLT) continue;
      var fired=false;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)){ fired=true; break; } }
      if(!fired) continue;
      if(!_lateComplete(rows, s.bar)) continue;   // N10 완성봉만(t+10 존재)
      var lr=_lateRet(rows, s.bar); if(lr==null) continue;
      var ep=(rows[s.bar]&&typeof rows[s.bar].close==='number')?rows[s.bar].close:null; if(!(ep>0)) continue;
      var traj=[];
      for(var k=1;k<=10;k++){ var j2=s.bar+k, c=(rows[j2]&&typeof rows[j2].close==='number')?rows[j2].close:null; traj.push(c!=null?(c/ep-1):null); }
      out.push({ label:(lr>0?'real':'fake'), stBear:!!s.maBear, traj:traj });
    }
    return out;
  }

  /* ───────── [S829] deadcat-real 확인 후 진입 — 즉시 vs t+1확인 vs t+2확인. "신호 후 1~2봉 살아남으면(진입가 위) 그때 진입" 검증.
   *   진입가↑(이미 오름) vs 가짜 거름↑ 트레이드오프를 N10 수익으로 비교. _scanStock 캐시 공유.
   *   imm=신호봉 진입(진입가 close[bar]). c1=t+1 종가>신호봉 종가일 때만 t+1 진입(진입가 close[bar+1]). c2=t+2 동일. 각 진입시점 기준 N10 _lateRet.
   *   반환 [{imm:{ret,real}|null, c1:..|null, c2:..|null}].
   */
  /* ───────── [S830] deadcat-real 진입 4방식 — 손절 시나리오 + MDD 포함. 공정 비교.
   *   imm=즉시+N10보유 · immSl=즉시+t+1손절(t+1 종가<진입가면 t+1 매도) · c1=t+1확인진입+보유 · c1Sl=t+1확인+t+2손절.
   *   각 {ret(N10수익 or 손절수익), real(ret>0), mdd(진입후 보유중 최저점·진입가 대비)}. 손절시 mdd=손절가. _scanStock 캐시 공유.
   *   ★immSl이 "즉시+빠른손절"의 진짜 수익(가짜 큰손실→t+1 작은손실로 전환). c1=관찰후진입(진입가 상승 비용). MDD로 변동성 종목 효과 확인.
   */
  async function _deadcatConfirmScan(sym, rows, pool){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var POOL=pool||'deadcat', WLT=(POOL==='pullback')?'bull':'bear';   // [S831] pool 파라미터화 — 정배(pullback,bull)/역배(deadcat,bear) 공용
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool===POOL; });
    var out=[];
    function mddOf(bar0, ep){ var lo=0, any=false; for(var k=1;k<=10;k++){ var c=(rows[bar0+k]&&typeof rows[bar0+k].close==='number')?rows[bar0+k].close:null; if(c==null)continue; var rr=c/ep-1; if(rr<lo)lo=rr; any=true; } return any?lo:null; }
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!==WLT) continue;
      var fired=false;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)){ fired=true; break; } }
      if(!fired) continue;
      var bar=s.bar, ep=(rows[bar]&&typeof rows[bar].close==='number')?rows[bar].close:null; if(!(ep>0)) continue;
      var rec={imm:null,immSl:null,c1:null,c1Sl:null};
      // 즉시+보유
      var immRet=null, immMdd=0;
      if(_lateComplete(rows,bar)){ immRet=_lateRet(rows,bar); if(immRet!=null){ var mm=mddOf(bar,ep); immMdd=(mm!=null?mm:0); rec.imm={ret:immRet,real:immRet>0,mdd:immMdd}; } }
      // 즉시+t+1손절
      var c1px=(rows[bar+1]&&typeof rows[bar+1].close==='number')?rows[bar+1].close:null;
      if(c1px!=null){
        if(c1px<ep){ var sl=c1px/ep-1; rec.immSl={ret:sl,real:false,mdd:sl}; }   // t+1 빠짐→손절(작은손실·최저=손절가)
        else if(immRet!=null){ rec.immSl={ret:immRet,real:immRet>0,mdd:immMdd}; }   // 살아남음→보유(=imm)
      }
      // t+1확인+보유 (t+1 살아남아 진입)
      var c1Ret=null, c1Mdd=0;
      if(c1px!=null && c1px>ep && _lateComplete(rows,bar+1)){ c1Ret=_lateRet(rows,bar+1); if(c1Ret!=null){ var mm2=mddOf(bar+1,c1px); c1Mdd=(mm2!=null?mm2:0); rec.c1={ret:c1Ret,real:c1Ret>0,mdd:c1Mdd}; } }
      // t+1확인+t+2손절 (t+1 진입 후 t+2 빠지면 손절)
      if(c1px!=null && c1px>ep){
        var c2px=(rows[bar+2]&&typeof rows[bar+2].close==='number')?rows[bar+2].close:null;
        if(c2px!=null){
          if(c2px<c1px){ var sl2=c2px/c1px-1; rec.c1Sl={ret:sl2,real:false,mdd:sl2}; }   // t+2 빠짐→손절
          else if(c1Ret!=null){ rec.c1Sl={ret:c1Ret,real:c1Ret>0,mdd:c1Mdd}; }   // 보유
        }
      }
      if(rec.imm||rec.immSl||rec.c1||rec.c1Sl) out.push(rec);
    }
    return out;
  }

  /* ───────── [S837] 역배 데드캣-real 겹침 × 다호라이즌(N10/N15/N20) — 최종 검증. "역배는 느리게 반응"(침체 종목 관심밖 가설) → N10 단조 깨짐(62→61→71)이 긴 horizon에선 살아나나?
   *   각 horizon 겹침 진짜비율 + 역배 레짐 base rate(각 horizon) → lift로 불장빨 배제. N15/N20 단조+lift 유지면 역배도 겹침 배지 가능. _scanStock 캐시 공유.
   *   반환 {baseR:[{n,up}×3hz], ov:{1/2/3/4:[{t,h}×3hz]}} (역배 봉만·hz=[N10,N15,N20]).
   */
  async function _deadcatOverlapHzScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool==='deadcat'; });
    var HZ=[[6,10],[11,15],[16,20]];   // N10, N15, N20 (헤더 통계바와 동일)
    var baseR=[{n:0,up:0},{n:0,up:0},{n:0,up:0}];
    var ov={1:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 2:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 3:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 4:[{t:0,h:0},{t:0,h:0},{t:0,h:0}]};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!=='bear') continue;   // 역배만
      var rets=[];
      for(var hi=0;hi<3;hi++){ rets.push(_hzComplete(rows,s.bar,HZ[hi][1]) ? _retWindow(rows,s.bar,HZ[hi][0],HZ[hi][1]) : null); }
      for(var hb=0;hb<3;hb++){ if(rets[hb]!=null){ baseR[hb].n++; if(rets[hb]>0) baseR[hb].up++; } }   // base(발동무관·역배 레짐)
      var rk=0; for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
      if(rk>=1){ var key=(rk>=4)?4:rk; for(var ho=0;ho<3;ho++){ if(rets[ho]!=null){ ov[key][ho].t++; if(rets[ho]>0) ov[key][ho].h++; } } }
    }
    return { baseR:baseR, ov:ov };
  }

  /* ───────── [S838] 역배 겹침 BT — 겹침 minK+ 진입 → hz봉 보유 청산(고정) → 복리 자산곡선. N15/N20 유효 통계가 실전 수익/MDD로 이어지나(긴 호흡 단서 검증). 1포지션·보유중 재진입X. _scanStock 캐시 공유.
   *   반환 {nT, eqEnd(복리 자산배수), mdd(자산곡선 최대낙폭), wins, sumPnl, mddSum(거래별 진입후 최저 합)}.
   */
  async function _deadcatHzBtScan(sym, rows, hz, minK){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool==='deadcat'; });
    var close = rows.map(function(r){ return +(r.close!=null?r.close:r.c); });
    var trades=[], pos=null;
    for(var i=0;i<scan.length;i++){
      var s=scan[i], bi=s.bar;
      if(pos!=null && bi>=pos.exitBar){   // hz봉 도달 → 청산
        var ex=close[pos.exitBar];
        if(ex>0){ var pnl=ex/pos.entry-1, lo=0;
          for(var k=pos.entryIdx+1;k<=pos.exitBar;k++){ if(close[k]>0){ var rr=close[k]/pos.entry-1; if(rr<lo)lo=rr; } }
          trades.push({pnl:pnl, mdd:lo});
        }
        pos=null;
      }
      if(pos==null && s.lt==='bear'){   // 역배 겹침 minK+ 진입
        var rk=0; for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
        if(rk>=minK){ var eb=bi+hz; if(eb<close.length && close[bi]>0){ pos={entry:close[bi], entryIdx:bi, exitBar:eb}; } }
      }
    }
    var eq=1,peak=1,mdd=0,wins=0,sum=0,mddSum=0;
    trades.forEach(function(t){ eq*=(1+t.pnl); if(eq>peak)peak=eq; var dd=peak>0?(peak-eq)/peak:0; if(dd>mdd)mdd=dd; if(t.pnl>0)wins++; sum+=t.pnl; mddSum+=t.mdd; });
    return { nT:trades.length, eqEnd:eq, mdd:mdd, wins:wins, sumPnl:sum, mddSum:mddSum };
  }

  /* ───────── 렌더 ───────── */
  // [S798] 레시피 행 배지 — 관찰 단계 동적 표시. 진짜: 관망/조짐/유력 · 가짜: 관망/주의/위험. early(0-5봉)=틴트, late(6-9봉)=솔리드. last=_evalHistory.last(관찰중이면 미완성).
  // [S836] 배지 단계 — 봉수가 아니라 진입 후 궤적(발동가 대비 살아있음) 기준. 측정(t+1/t+2/t+3 종가>발동가=진짜 쪽) 그대로. 브리핑용(방향성 보도·매매 확정 아님).
  //   진짜반등: 살아있을수록 유력(발생→조짐 t1~2→유력 t3+) · 빠지면 약화. 가짜반등: 빠질수록 위험(발생→주의 t1~2→위험 t3+) · 살아있으면 해소중.
  function _stageBadge(rec, last){
    var base='display:inline-block;font-weight:800;padding:3px 9px;border-radius:5px;';
    var grey='<span style="'+base+'font-size:9.5px;font-weight:700;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">';
    if(!last) return grey+'관망</span>';
    if(last.complete) return grey+'관망</span>';   // N10 완성 → 결과 확정
    var up=(rec.kind==='real'), ba=last.barsAgo||0, alive=(last.aliveRet==null)?null:(last.aliveRet>0);
    var C=up?GR:RD;
    if(ba<=0) return '<span style="'+base+'font-size:10px;background:'+C+'22;color:'+C+';border:1px solid '+C+'">발생</span>';   // 발동 당봉 (아직 t+1 안 옴)
    if(up){   // 진짜반등 — 발동가 위 유지할수록 진짜(유력)
      if(alive===false) return grey+'약화</span>';   // 빠짐 = 가짜 쪽 흐름
      if(ba>=3) return '<span style="'+base+'font-size:10px;background:'+GR+';color:#fff">유력</span>';   // t3+ 살아있음 (진짜 82%)
      return '<span style="'+base+'font-size:10px;background:'+GR+'22;color:'+GR+';border:1px solid '+GR+'">조짐</span>';   // t1~t2 살아있음 (진짜 73~78%)
    }
    // 가짜반등 — 발동가 아래로 빠질수록 가짜 진행(위험)
    if(alive===true) return grey+'해소중</span>';   // 안 빠짐 = 경고 약화
    if(ba>=3) return '<span style="'+base+'font-size:10px;background:'+RD+';color:#fff">위험</span>';   // t3+ 빠짐 (가짜 진행)
    return '<span style="'+base+'font-size:10px;background:'+AM+'22;color:'+AM+';border:1px solid '+AM+'">주의</span>';   // t1~t2 빠짐
  }

  function _recipeRow(rec, firing, idPfx){
    var pfx=idPfx||'';
    var s=rec.src;
    var stat = '표본'+s.n+' · 후반 '+_pct(s.late)+' · N10 '+Math.round(100*s.n10)+'%';
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 9px;border-top:1px solid var(--border)">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:10.5px;font-weight:700;color:var(--text);line-height:1.32">'+_esc(rec.label)+'</div>'
        + '<div style="font-size:8px;color:var(--text3);margin-top:2px">'+stat+'</div>'
      + '</div>'
      + '<div style="flex-shrink:0;text-align:right">'
        + '<span id="rcpbadge_'+pfx+rec.id+'">'+_stageBadge(rec, firing?{barsAgo:0,complete:false}:null)+'</span>'
        + '<div id="rcphit_'+pfx+rec.id+'" style="font-size:8px;color:var(--text3);margin-top:3px;white-space:nowrap">적중률 …</div>'
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

  // [S797] 탭(풀)별 통계 바 — 관찰중·확정임박 + [S801] 진짜/가짜 적중률 N10·N15·N20 병행(데드캣 horizon 검증). ps={pend,oldest,R,F} (R/F=_emptyHz 누적)
  function _statHtml(ps){
    if(!ps) ps={pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()};
    var l1 = ps.pend>0
      ? ('<span style="color:'+AM+'">⏳관찰중 '+ps.pend+'</span>'+(ps.oldest>=0?('<span style="color:var(--text3)"> · 확정임박 '+ps.oldest+'봉</span>'):''))
      : '<span style="color:var(--text3)">관찰중 0</span>';
    function _row(lab, side, kindCol){
      if((side.h10.t+side.h15.t+side.h20.t)<=0) return '<span style="color:'+kindCol+';font-weight:800">'+lab+'</span> <span style="color:var(--text3)">표본없음</span>';
      var segs = _HZ.map(function(H){ var d=side[H.k];
        if(d.t<=0) return '<span style="color:var(--text3)">'+H.lab+' —</span>';
        var p=Math.round(100*d.h/d.t);
        return '<span style="color:var(--text3)">'+H.lab+' </span><b style="color:'+(p>=50?GR:RD)+'">'+p+'%</b><span style="color:var(--text3)">/'+d.t+'</span>';
      }).join('<span style="color:var(--text3)"> · </span>');
      return '<span style="color:'+kindCol+';font-weight:800">'+lab+'</span> '+segs;
    }
    return l1
      + '<div style="font-size:8.5px;margin-top:2px">'+_row('진짜', ps.R, GR)+'</div>'
      + '<div style="font-size:8.5px">'+_row('가짜', ps.F, RD)+'</div>';
  }

  // 헤더 요약 갱신
  function _setSummary(html){ var el=document.getElementById('sxRecipeSummary'); if(el) el.innerHTML=html; }

  // 그룹 본문 렌더 (2탭: 역배열/정배열 · 현재 레짐 우선) → {inner, fireCount, ltLabel} [S790]
  function _renderBody(fNow, ltNow, maBullNow){
    var ltLabel = ltNow==='bear'?'역배열':ltNow==='bull'?'정배열':'중립';
    var regimePool = ltNow==='bull' ? 'pullback' : 'deadcat';   // 현재 레짐 = 기본 선택 탭
    var POOLS=[{key:'pullback',label:'정배열'},{key:'deadcat',label:'역배열'}];
    var fireReal=0, fireFake=0;
    // [S797] 탭별 통계 바 (탭 버튼 위 한 줄) — 현재 탭만 표시, 나머지 hidden · async로 채움
    var statBar='<div style="padding:8px 10px 0">';
    POOLS.forEach(function(p){
      var show=(p.key===regimePool);
      statBar += '<div id="sxRcpStat_'+p.key+'" style="display:'+(show?'block':'none')+';font-size:9px;line-height:1.55;font-weight:700">평가 중…</div>';
    });
    statBar+='</div>';
    // 탭 바 (현재 레짐 탭에 ● 표시)
    var tab='<div style="display:flex;gap:6px;padding:8px 9px 6px">';
    POOLS.forEach(function(p){
      var on=(p.key===regimePool);
      tab += '<button id="sxRcpTabBtn_'+p.key+'" onclick="window.SXRecipeSignal&&SXRecipeSignal.tab(\''+p.key+'\')" '
        + 'style="flex:1;font-size:11px;font-weight:800;padding:7px 0;border-radius:7px;cursor:pointer;border:1px solid '
        + (on?'var(--accent);background:var(--accent);color:#fff':'var(--border);background:var(--surface2);color:var(--text3)')+'">'
        + (p.key===regimePool?'<span style="font-size:8px">● </span>':'') + p.label + '</button>';
    });
    tab+='</div>';
    // 풀별 섹션 — [S853] 4분류 접기/펼치기 + '발동만' 체크(기본 ON=발동 레시피만). 상단 활성 섹션은 제거(발동 다수 시 카드 점령 문제).
    var sections='';
    POOLS.forEach(function(p){
      var show=(p.key===regimePool);
      var catBlocks='';   // [S853] 상단 활성 섹션 제거 — 발동 노출은 '발동만' 체크(기본 ON)가 담당
      CATS.filter(function(c){ return c.pool===p.key; }).forEach(function(cat){
        var recs = _R().filter(function(r){ return r.pool===cat.pool && r.kind===cat.kind; });
        var catId='rcpCat_'+cat.pool+'_'+cat.kind;
        if(!recs.length){ catBlocks += '<div style="font-size:8px;color:var(--text3);padding:8px 10px 2px">'+cat.label+' — 미등록</div>'; return; }
        var rowsHtml='', catFire=0;
        recs.forEach(function(r){
          var fr=_fires(r, fNow, ltNow, maBullNow);
          if(fr){ if(r.kind==='real') fireReal++; else fireFake++; catFire++; }
          rowsHtml += '<div data-rcpfired="'+(fr?1:0)+'"'+((!fr&&FIRE_ONLY)?' style="display:none"':'')+'>'+_recipeRow(r, fr, '')+'</div>';
        });
        catBlocks += '<div style="border-top:1px solid var(--border)">'
          + '<div onclick="window.SXRecipeSignal&&SXRecipeSignal.catToggle(\''+catId+'\')" style="display:flex;align-items:center;font-size:10px;font-weight:800;color:'+cat.tone+';padding:9px 9px;cursor:pointer;overflow:hidden">'
            + '<span id="'+catId+'_arr" style="font-size:9px;margin-right:5px;color:var(--text3);width:9px;display:inline-block">▶</span>'
            + cat.label + '<span style="color:var(--text3);font-weight:600">&nbsp;('+recs.length+')</span>'
            + (catFire?' <span style="color:'+cat.tone+';font-weight:800">&nbsp;🔥'+catFire+'</span>':'')
            + '<span id="rcpcat_'+cat.pool+'_'+cat.kind+'" style="margin-left:auto;font-size:8.5px;font-weight:700;color:var(--text3)"></span>'
          + '</div>'
          + '<div id="'+catId+'" style="display:none"><div data-rcpfireempty="'+catFire+'" style="display:'+((FIRE_ONLY&&catFire===0)?'block':'none')+';font-size:8px;color:var(--text3);padding:7px 10px">관찰중 없음 — [관찰중만] 해제 시 전체 '+recs.length+'개</div>'+rowsHtml+'</div>'
        + '</div>';
      });
      var fireChk='<div style="display:flex;justify-content:flex-end;align-items:center;padding:4px 10px 0"><label style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:var(--text3);cursor:pointer"><input type="checkbox" data-rcpfireonly="1" '+(FIRE_ONLY?'checked':'')+' onchange="window.SXRecipeSignal&&SXRecipeSignal.fireOnly(this.checked)" style="width:12px;height:12px;accent-color:var(--accent)">관찰중만 보기</label></div>';   // [S853]
      var sec='<div id="sxRcpTab_'+p.key+'" style="display:'+(show?'block':'none')+'">'+fireChk+catBlocks+'</div>';
      sections+=sec;
    });
    var note='<div style="font-size:8px;color:var(--text3);padding:8px 10px 2px;line-height:1.5;border-top:1px solid var(--border);margin-top:4px">발동 = 현재봉이 (그 풀 정렬+단기약세 + 재료조건) 충족 — <b>현재 레짐('+ltLabel+') 탭에서만</b> 발동, 반대 탭은 관찰용. 적중 = 과거 발동 후 <b>후반평균 방향</b>이 신호와 일치(진짜=상승/가짜=하락). 행 적중률·관찰중·배지는 <b>N10([+6..+10])</b> 기준. <b>헤더 통계바</b>=진짜/가짜 적중률을 <b>N10·N15([+11..+15])·N20([+16..+20])</b> 병행 — 데드캣은 늦게 무너지니 horizon↑면 가짜%↑·진짜 유지면 장기horizon 유효(측정·비교용). 적중률·최근은 <b>이 종목 600봉</b> 기준 · 표본/후반은 풀 전체. 일봉 · fetchRows600 단일소스.</div>';
    return { inner:statBar+tab+sections+note, fireCount:(fireReal+fireFake), fireReal:fireReal, fireFake:fireFake, ltLabel:ltLabel };
  }

  // 탭 전환 (재평가 없음 — display 토글 + 버튼 활성색) [S790]
  function _tab(pool){
    try {
      ['deadcat','pullback'].forEach(function(p){
        var sec=document.getElementById('sxRcpTab_'+p); if(sec) sec.style.display=(p===pool)?'block':'none';
        var st=document.getElementById('sxRcpStat_'+p); if(st) st.style.display=(p===pool)?'block':'none';   // [S797] 통계 바도 토글
        var btn=document.getElementById('sxRcpTabBtn_'+p);
        if(btn){ var on=(p===pool); btn.style.background=on?'var(--accent)':'var(--surface2)'; btn.style.color=on?'#fff':'var(--text3)'; btn.style.borderColor=on?'var(--accent)':'var(--border)'; }
      });
      if(typeof _sxVib==='function') _sxVib(6);
    } catch(e){}
  }

  // [S853→S854] 관찰중만 보기 — 상단 활성 섹션 제거 대체. 기본 ON: 관찰중(최근발동 0~5봉·미확정, 발동 포함) 레시피만 노출, 해제 시 전체(3시장 공통). 발동은 렌더시 표시, 관찰중은 비동기 적중패스에서 승격.
  var FIRE_ONLY=true;
  function _fireOnlySet(v){
    FIRE_ONLY=!!v;
    try{
      var rows=document.querySelectorAll('[data-rcpfired]');
      for(var i=0;i<rows.length;i++){ rows[i].style.display=(FIRE_ONLY && rows[i].getAttribute('data-rcpfired')==='0')?'none':''; }
      _fireOnlyNotes();
      var cbs=document.querySelectorAll('input[data-rcpfireonly]');
      for(var k=0;k<cbs.length;k++){ cbs[k].checked=FIRE_ONLY; }
      if(typeof _sxVib==='function') _sxVib(6);
    }catch(_e){}
  }
  function _fireOnlyNotes(){   // [S854] 빈안내 = FIRE_ONLY && 그 카테고리에 표시행(data-rcpfired=1) 0일 때만
    try{
      var em=document.querySelectorAll('[data-rcpfireempty]');
      for(var i=0;i<em.length;i++){ var box=em[i].parentElement; var any=box?box.querySelector('[data-rcpfired=\"1\"]'):null; em[i].style.display=(FIRE_ONLY&&!any)?'block':'none'; }
    }catch(_e){}
  }
  // [S834] 분류 접기/펼치기 — 합본 311개라 기본 접힘, 헤더 클릭으로 토글
  function _catToggle(catId){
    try{
      var el=document.getElementById(catId);
      var arr=document.getElementById(catId+'_arr');
      if(el){ var open=el.style.display!=='none'; el.style.display=open?'none':'block'; if(arr) arr.textContent=open?'▶':'▼'; }
      if(typeof _sxVib==='function') _sxVib(6);
    }catch(e){}
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
      ? ('<span style="font-weight:700"><span style="color:'+GR+'">진짜 '+rb.fireReal+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+rb.fireFake+'</span></span> <span style="color:var(--text3);font-weight:500">· '+rb.ltLabel+'</span>')
      : ('<span style="color:var(--text3)">관망 · '+rb.ltLabel+'</span>'));
    // [S832] 정배 강겹침(4+) 현재봉 발동 시 summary에 적중률 — 카드 접어도 한눈에. _renderBody 후 fNow/ltNow/maBullNow 재사용.
    var _pbK=0; for(var _ri=0;_ri<_R().length;_ri++){ var _rc=_R()[_ri]; if(_rc.pool==='pullback'&&_rc.kind==='real'&&_fires(_rc, fNow, ltNow, maBullNow)) _pbK++; }
    if(_pbK>=4){ var _sm=document.getElementById('sxRecipeSummary'); if(_sm){ _sm.innerHTML='<span style="color:#2563eb;font-weight:800">🔵 발동 '+_pbK+' · 적중 ~68% 강</span> <span style="color:var(--text3);font-weight:500">· '+rb.ltLabel+'</span>'; } }
    // 과거 적중률 (받은 rows 재사용 · 추가 fetch 없음)
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return; }
    if(window._sxRecipeActiveSym!==sym) return;
    // 레시피별 적중률 표시 + 카테고리/풀 통계 누적 (단일 _evalHistory 패스) · catPend는 배지 _pendingByCat과 동일 정의
    var catPend={}, poolStat={pullback:{pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()}, deadcat:{pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()}};
    _R().forEach(function(rec){
      var h=null; try { h=_evalHistory(rec, scan, rows); } catch(e){}
      var el=document.getElementById('rcphit_'+rec.id); if(el){ try { el.innerHTML=_hitHtml(rec, h||{fireCount:0}); } catch(e){ el.textContent='–'; } }
      var bel=document.getElementById('rcpbadge_'+rec.id); if(bel){ try { bel.innerHTML=_stageBadge(rec, h?h.last:null); } catch(e){} }   // [S798] 행 배지 동적 단계
      if(h && h.last && !h.last.complete && el){   // [S854] 관찰중(최근발동·미확정)이면 필터 표시 승격 — 필터 기준=관찰중(발동은 그 0봉 부분집합)
        try{ var _w=(el.closest)?el.closest('[data-rcpfired]'):null; if(_w){ _w.setAttribute('data-rcpfired','1'); if(FIRE_ONLY) _w.style.display=''; } }catch(_eW){}
      }
      if(!h) return;
      var ck=rec.pool+'|'+rec.kind; if(!catPend[ck]) catPend[ck]={count:0,oldest:-1};
      var ps=poolStat[rec.pool]; if(!ps) ps=poolStat[rec.pool]={pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()};
      if(h.last && !h.last.complete){ catPend[ck].count++; if(h.last.barsAgo>catPend[ck].oldest) catPend[ck].oldest=h.last.barsAgo; ps.pend++; if(h.last.barsAgo>ps.oldest) ps.oldest=h.last.barsAgo; }
      if(h.hz){ var side=(rec.kind==='real')?ps.R:ps.F; for(var hi=0;hi<_HZ.length;hi++){ var hk=_HZ[hi].k; side[hk].h+=h.hz[hk].h; side[hk].t+=h.hz[hk].t; } }   // [S801] 호라이즌별 진짜/가짜 누적
    });
    _fireOnlyNotes();   // [S854] 관찰중 승격 반영 후 카테고리 빈안내 갱신
    if(rb.fireCount===0){   // [S855] 발동 0이면 '관망' 대신 관찰중 요약(접힘 요약과 동일 기준)
      var _rp2=(ltNow==='bull')?'pullback':'deadcat';
      var _pr2=(catPend[_rp2+'|real']||{}).count||0, _pf2=(catPend[_rp2+'|fake']||{}).count||0;
      _setSummary((_pr2+_pf2>0)
        ? ('<span style="font-weight:700">⏳ <span style="color:'+GR+'">진짜 '+_pr2+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+_pf2+'</span></span> <span style="color:var(--text3);font-weight:500">관찰중 · '+rb.ltLabel+'</span>')
        : ('<span style="color:var(--text3)">신호없음 · '+rb.ltLabel+'</span>'));
    }
    if(window._sxRecipeActiveSym!==sym) return;
    // [S832] 현재봉 pullback-real 동시발동 개수(겹침) — 정배열·진짜반등 헤더에 적중률 표시. 대표풀 전수측정(S831): 1~3개 ~60% · 4+개 ~67%(임계점). 겹침=개수만·조합 우열 안 가림. 정배열 탭에서만(역배 무의미).
    var pbRealK=0;
    for(var ri=0;ri<_R().length;ri++){ var rc=_R()[ri]; if(rc.pool==='pullback'&&rc.kind==='real'&&_fires(rc, fNow, ltNow, maBullNow)) pbRealK++; }
    var ovHit=(pbRealK>=4)?68:(pbRealK>=3?62:61);   // [S834] 합본 측정 갱신: 1~2개 61% · 3개 62% · 4+개 68%(단조 유지·robust)
    // 카테고리 헤더 요약 (확정임박 N봉 · 관찰중 M개 · 정배진짜는 겹침 발동)
    CATS.forEach(function(cat){
      var pel=document.getElementById('rcpcat_'+cat.pool+'_'+cat.kind); if(!pel) return;
      var p=catPend[cat.pool+'|'+cat.kind];
      var base='';
      if(p && p.count>0){ var col=(cat.kind==='real')?GR:RD; base='<span style="color:'+col+'">⏳관찰중 '+p.count+'</span><span style="color:var(--text3)"> ·확정임박 '+p.oldest+'봉전</span>'; }
      else base='<span style="color:var(--text3)">관찰중 0</span>';
      var ov='';
      if(cat.pool==='pullback'&&cat.kind==='real'&&pbRealK>0){ var strong=pbRealK>=4; ov=' <span style="color:#2563eb;font-weight:800">· 🔵 '+pbRealK+'개 발동 · 적중 ~'+ovHit+'%'+(strong?' <span style="background:#2563eb;color:#fff;padding:1px 5px;border-radius:4px;font-size:8px">강</span>':'')+'</span>'; }
      pel.innerHTML=base+ov;
    });
    // [S797] 탭별 통계 바 (정/역배 각각) — 관찰중·확정임박·적중평균
    ['pullback','deadcat'].forEach(function(pk){
      var sel=document.getElementById('sxRcpStat_'+pk); if(sel) sel.innerHTML=_statHtml(poolStat[pk]);
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
    else {   // [S855] 접힘 요약 자체평가 — 탭 없이 '관찰중 진짜N·가짜M'/'신호없음'. rows600·_scanStock 캐시가 배지카드와 공유라 추가비용 미미. 평가 완료 전엔 '탭하여' 유지, 전개 평가가 먼저 끝나면 양보.
      setTimeout(async function(){
        try{
          if(window._sxRecipeActiveSym!==sym) return;
          var el=document.getElementById('sxRecipeSummary');
          if(!el || el.innerHTML.indexOf('탭하여')<0) return;
          if(!(window.SXCandleBT&&SXCandleBT.fetchRows600)) return;
          var rows=await SXCandleBT.fetchRows600(_mkOf(stock),'day',(stock&&stock.code)||sym);
          if(window._sxRecipeActiveSym!==sym || !Array.isArray(rows) || rows.length<260) return;
          var pend=await _pendingByCat(sym, rows); if(!pend) pend={};
          if(window._sxRecipeActiveSym!==sym) return;
          el=document.getElementById('sxRecipeSummary');
          if(!el || el.innerHTML.indexOf('탭하여')<0) return;
          var lt=null; try{ lt=_ltOf(indicators); }catch(_e){}
          var _rp=(lt==='bull')?'pullback':'deadcat';
          var pr=(pend[_rp+'|real']||{}).count||0, pf=(pend[_rp+'|fake']||{}).count||0;
          el.innerHTML=(pr+pf>0)
            ? '<span style="font-weight:700">⏳ <span style="color:'+GR+'">진짜 '+pr+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+pf+'</span></span> <span style="color:var(--text3);font-weight:500">관찰중</span>'
            : '<span style="color:var(--text3)">신호없음</span>';
        }catch(_e){}
      }, 120);
    }
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

  window.SXRecipeSignal = { setPreview:_setPreview, ingScan:_ingScan, clearPreview:_clearPreview, previewInfo:_previewInfo, buildCard:buildCard, toggle:toggle, tab:_tab, catToggle:_catToggle, _populate:_populate, _pendingByCat:_pendingByCat, realFireBars:_realFireBars, pullbackSignalBars:_pullbackSignalBars, overlapScan:_overlapScan, profileScan:_profileScan, evalBar:_evalBar, baseRateScan:_baseRateScan, deadcatTrajScan:_deadcatTrajScan, deadcatConfirmScan:_deadcatConfirmScan, deadcatOverlapHzScan:_deadcatOverlapHzScan, deadcatHzBtScan:_deadcatHzBtScan, fireOnly:_fireOnlySet, recipesFor:_recipesFor };
  try{ Object.defineProperty(window.SXRecipeSignal,'RECIPES',{ get:function(){ return _R(); } }); }catch(_e){ window.SXRecipeSignal.RECIPES=RECIPES_BY_MKT.kr; }   // [S849] 구소비처 호환 — currentMarket 세트 동적 반환
})();
