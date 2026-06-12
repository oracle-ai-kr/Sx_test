// ════════════════════════════════════════════════════════════════
//  sx_candle_bt.js  —  [S525] 캔들 전이 미니 백테스트  (+[S530] 뒤로가기 닫기·임계값 선택)
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
  var THRESHOLDS = [30, 35, 40, 45, 50];// [S533] 35/45 추가 — sweet spot(≈40) 주변 촘촘히
  var STRONG = 50;              // 강신호 버킷 경계

  var _cache = null;            // 마지막 표본 캐시 {ok, samples:[{score,up}], evaluated, baseUpRate, baseDnRate, window, errors}
  var _curThr = 30;             // 현재 선택 임계

  function _isUp(r){ return (+r.close) >= (+r.open); }
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
    var samples = [], baseUp = 0, errors = 0;

    for(var i = startI; i <= n - 2; i++){
      var slice = rows.slice(0, i + 1);   // rows[0..i] — i가 신호(확정)봉, i+1이 예측 대상
      var ind, r;
      try { ind = SXE.calcAllScreener(slice, tf || 'day'); } catch(e1){ errors++; continue; }
      try { r = _candleTransitionScore(slice, ind, market, tf || 'day'); } catch(e2){ errors++; continue; }
      if(!r || !r.active) continue;
      var up = _isUp(rows[i + 1]);
      samples.push({ score: r.score, up: up });
      if(up) baseUp++;
    }
    var evaluated = samples.length;
    var baseUpRate = evaluated > 0 ? Math.round((baseUp / evaluated) * 1000) / 10 : null;
    return {
      ok: true,
      samples: samples,
      evaluated: evaluated,
      baseUpRate: baseUpRate,                                                  // 베이스라인: 양봉 예측이 넘어야 할 기준
      baseDnRate: baseUpRate != null ? Math.round((100 - baseUpRate) * 10) / 10 : null,
      window: { from: rows[startI].date, to: rows[n - 1].date, bars: (n - 1) - startI },
      errors: errors
    };
  }

  // ── 임계값별 집계 (캐시 표본 재사용 — 재계산 없음) ──
  function _aggregate(bt, thr){
    var pred=0, hit=0, neutral=0, bullPred=0, bullHit=0, bearPred=0, bearHit=0;
    var strong = { p:0, h:0 }, mid = { p:0, h:0 };
    for(var k=0; k<bt.samples.length; k++){
      var sc = bt.samples[k].score, up = bt.samples[k].up;
      if(Math.abs(sc) < thr){ neutral++; continue; }
      var predUp = sc > 0, ok = (predUp === up);
      pred++; if(ok) hit++;
      var bk = (Math.abs(sc) >= STRONG) ? strong : mid; bk.p++; if(ok) bk.h++;
      if(predUp){ bullPred++; if(ok) bullHit++; } else { bearPred++; if(ok) bearHit++; }
    }
    return {
      thr: thr, evaluated: bt.evaluated, pred: pred, neutral: neutral,
      hitRate: _pct(hit, pred),
      bullPred: bullPred, bullHitRate: _pct(bullHit, bullPred),
      bearPred: bearPred, bearHitRate: _pct(bearHit, bearPred),
      baseUpRate: bt.baseUpRate, baseDnRate: bt.baseDnRate,
      strong: { n: strong.p, rate: _pct(strong.h, strong.p) },
      mid:    { n: mid.p,    rate: _pct(mid.h,    mid.p) },
      window: bt.window, errors: bt.errors
    };
  }

  // ── 렌더 헬퍼 ──
  function _edgeBadge(rate, base){
    if(rate == null || base == null) return '';
    var d = Math.round((rate - base) * 10) / 10;
    var c = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#6b7280';
    return '<span style="color:' + c + ';font-weight:800">' + (d > 0 ? '+' : '') + d + '%p</span>';
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

    return _thrButtons(a.thr) + head + body + interp + foot;
  }

  // ── 캐시 기반 재렌더 (임계값만 바꿀 때) ──
  function _renderInto(){
    var body = document.getElementById('sxCTBTBody');
    if(!body) return;
    if(!_cache || !_cache.ok){ body.innerHTML = _renderResults(_cache || { ok:false, reason:'표본 없음' }); return; }
    body.innerHTML = _renderResults(_aggregate(_cache, _curThr));
  }
  function setThr(t){ _curThr = t; _renderInto(); }

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
    var foot = '<div style="font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6">'
      + '풀링 = 전 종목 표본 합산 적중률 · edge = 베이스라인 대비.<br>'
      + '<b>상회 X/Y종목</b> = 개별 종목이 자기 베이스라인을 넘은 비율(≥3예측 종목 중). <b>이게 높을수록 robust</b> — 한 종목 운빨이 아니라 두루 통한다는 뜻. 임계 선택의 핵심 지표.'
      + '</div>';
    return head + body + foot;
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
      _curThr = 30;
      try { _cache = runBacktest(ctx.rows, ctx.market, ctx.tf); }
      catch(e){ _cache = { ok:false, reason:'실행 오류: ' + (e && e.message ? e.message : e) }; }
      var body = document.getElementById('sxCTBTBody');
      if(body){ body.setAttribute('style', 'text-align:left'); }
      _renderInto();
    }, 40);
  }

  window.SXCandleBT = { open: open, close: _close, setThr: setThr, run: runBacktest, runBasket: runBasket, runBasketUI: runBasketUI, backToSingle: backToSingle, _remove: _removeOverlay };
})();
