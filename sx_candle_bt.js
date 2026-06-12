// ════════════════════════════════════════════════════════════════
//  sx_candle_bt.js  —  [S525] 캔들 전이 미니 백테스트
//  목적: 분석탭 '캔들 전이 점수'(실험 카드)의 다음봉 색 예측 적중률을
//        과거 데이터로 워크포워드 검증한다. 100% 적중이 목표가 아니라
//        "이 점수가 베이스라인(단순 양봉비율)보다 나은가"를 숫자로 본다.
//
//  룩어헤드 없음: 각 과거 봉 i에 대해 rows[0..i]까지의 데이터로만
//        SXE.calcAllScreener(slice) → _candleTransitionScore(slice) 예측 후,
//        실제 다음 봉 rows[i+1]의 양/음과 대조한다.
//
//  의존: window.SXE.calcAllScreener, window._candleTransitionScore (sx_render.js),
//        window._sxCTBT (카드 렌더 시 저장된 {rows, market, tf, name}).
//  로드 순서: sx_analysis_engine.js → sx_render.js → (이 파일).
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var PRED_THR = 30;     // |score| >= 30 을 '예측'으로 간주 (카드 라벨 임계와 동일)
  var MIN_BARS = 60;     // 신호 산출에 필요한 최소 과거 봉
  var DEFAULT_MAX = 150; // 기본 검증 표본 수 (모바일 성능 고려)

  function _isUp(r){ return (+r.close) >= (+r.open); }
  function _pct(h, p){ return p > 0 ? Math.round((h / p) * 1000) / 10 : null; }

  // ── 워크포워드 백테스트 ──
  function runBacktest(rows, market, tf, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    var n = rows.length;
    if(n < MIN_BARS + 5) return { ok:false, reason:'데이터 부족 (최소 ' + (MIN_BARS + 5) + '봉 필요, 현재 ' + n + '봉)' };
    if(typeof SXE === 'undefined' || !SXE.calcAllScreener || typeof _candleTransitionScore !== 'function')
      return { ok:false, reason:'엔진 미로드 (SXE / 전이 함수)' };

    var maxTests = opts.maxTests || DEFAULT_MAX;
    var startI = Math.max(MIN_BARS, n - 1 - maxTests);

    var pred = 0, hit = 0, neutral = 0;
    var bullPred = 0, bullHit = 0, bearPred = 0, bearHit = 0;
    var baseUp = 0, baseTot = 0;
    var strong = { p:0, h:0 }, mid = { p:0, h:0 };  // |score|>=50 vs 30~50 신뢰도 버킷
    var errors = 0;

    for(var i = startI; i <= n - 2; i++){
      var slice = rows.slice(0, i + 1);   // rows[0..i] — i가 신호(확정)봉, i+1이 예측 대상
      var ind, r;
      try { ind = SXE.calcAllScreener(slice, tf || 'day'); } catch(e1){ errors++; continue; }
      try { r = _candleTransitionScore(slice, ind, market, tf || 'day'); } catch(e2){ errors++; continue; }
      if(!r || !r.active) continue;

      var actualUp = _isUp(rows[i + 1]);
      baseTot++; if(actualUp) baseUp++;

      var sc = r.score;
      if(Math.abs(sc) < PRED_THR){ neutral++; continue; }   // 중립 = 예측 안 함

      var predUp = sc > 0;
      var ok = (predUp === actualUp);
      pred++; if(ok) hit++;

      var bk = (Math.abs(sc) >= 50) ? strong : mid;
      bk.p++; if(ok) bk.h++;

      if(predUp){ bullPred++; if(ok) bullHit++; }
      else      { bearPred++; if(ok) bearHit++; }
    }

    var baseUpRate = baseTot > 0 ? Math.round((baseUp / baseTot) * 1000) / 10 : null;       // 그냥 양봉일 확률
    var baseDnRate = baseUpRate != null ? Math.round((100 - baseUpRate) * 10) / 10 : null;   // 그냥 음봉일 확률

    return {
      ok: true,
      window: { from: rows[startI].date, to: rows[n - 1].date, bars: (n - 1) - startI },
      evaluated: baseTot,           // 방향성 평가 가능했던 봉 수
      pred: pred,                   // 실제 예측(|score|>=30) 수
      neutral: neutral,             // 중립(예측 보류) 수
      hitRate: _pct(hit, pred),     // 전체 예측 적중률
      bullPred: bullPred, bullHitRate: _pct(bullHit, bullPred),
      bearPred: bearPred, bearHitRate: _pct(bearHit, bearPred),
      baseUpRate: baseUpRate,       // 베이스라인: 양봉 예측을 이겨야 할 기준
      baseDnRate: baseDnRate,       // 베이스라인: 음봉 예측을 이겨야 할 기준
      strong: { n: strong.p, rate: _pct(strong.h, strong.p) },
      mid:    { n: mid.p,    rate: _pct(mid.h,    mid.p) },
      errors: errors
    };
  }

  // ── 결과 렌더 헬퍼 ──
  function _edgeBadge(rate, base){
    if(rate == null || base == null) return '';
    var d = Math.round((rate - base) * 10) / 10;
    var c = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#6b7280';
    var s = d > 0 ? '+' : '';
    return '<span style="color:' + c + ';font-weight:800">' + s + d + '%p</span>';
  }
  function _row(label, value, sub){
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">'
         + '<span style="font-size:12px;color:var(--text2)">' + label + '</span>'
         + '<span style="font-size:13px;font-weight:700;color:var(--text)">' + value + (sub ? ' <span style="font-size:10px;font-weight:600;color:var(--text3)">' + sub + '</span>' : '') + '</span></div>';
  }

  function _renderResults(res){
    if(!res.ok) return '<div style="font-size:12px;color:#dc2626;padding:14px 2px">검증 불가 — ' + res.reason + '</div>';
    if(res.pred === 0) return '<div style="font-size:12px;color:var(--text3);padding:14px 2px">표본 ' + res.evaluated + '봉 중 |점수|≥' + PRED_THR + '인 방향 예측이 없었습니다 (전부 중립). 다른 종목으로 시도해보세요.</div>';

    var hr = res.hitRate;
    var hrCol = hr == null ? 'var(--text)' : hr >= 60 ? '#16a34a' : hr >= 50 ? '#f59e0b' : '#dc2626';

    var head = '<div style="text-align:center;margin:4px 0 12px">'
      + '<div style="font-size:34px;font-weight:800;color:' + hrCol + ';line-height:1">' + (hr != null ? hr + '%' : '—') + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px">전체 적중률 · 예측 ' + res.pred + '건 / 평가 ' + res.evaluated + '봉</div></div>';

    var body = ''
      + _row('🔺 양봉 예측', (res.bullHitRate != null ? res.bullHitRate + '%' : '—') + ' ' + _edgeBadge(res.bullHitRate, res.baseUpRate), res.bullPred + '건 · 기준 ' + (res.baseUpRate != null ? res.baseUpRate + '%' : '—'))
      + _row('🔻 음봉 예측', (res.bearHitRate != null ? res.bearHitRate + '%' : '—') + ' ' + _edgeBadge(res.bearHitRate, res.baseDnRate), res.bearPred + '건 · 기준 ' + (res.baseDnRate != null ? res.baseDnRate + '%' : '—'))
      + _row('💪 강신호 (|점수|≥50)', (res.strong.rate != null ? res.strong.rate + '%' : '—'), res.strong.n + '건')
      + _row('· 중신호 (30~50)', (res.mid.rate != null ? res.mid.rate + '%' : '—'), res.mid.n + '건')
      + _row('중립(예측 보류)', res.neutral + '건', '')
      ;

    var interp = '';
    if(res.baseUpRate != null && hr != null){
      var beatsBase = (res.bullHitRate != null && res.baseUpRate != null && res.bullHitRate > res.baseUpRate)
                   || (res.bearHitRate != null && res.baseDnRate != null && res.bearHitRate > res.baseDnRate);
      var strongBeatsAll = (res.strong.n >= 5 && res.strong.rate != null && res.mid.rate != null && res.strong.rate > res.mid.rate);
      interp = '<div style="font-size:11px;color:var(--text2);line-height:1.7;margin-top:10px;padding:9px 11px;background:var(--surface2);border-radius:9px">'
        + (beatsBase ? '✓ 한쪽 이상이 베이스라인을 상회 — 점수에 예측력이 있습니다. ' : '△ 베이스라인 대비 우위가 약합니다 — 신호 가중치 조정 여지. ')
        + (strongBeatsAll ? '강신호(≥50)가 중신호보다 적중률이 높아 점수 크기가 신뢰도와 비례합니다.' : '강·중 신호 적중률 차이가 작아, 점수 크기와 신뢰도의 비례성은 약합니다.')
        + '</div>';
    }

    var foot = '<div style="font-size:9px;color:var(--text3);margin-top:10px;border-top:1px solid var(--border);padding-top:7px;line-height:1.6">'
      + '기간 ' + (res.window.from || '') + ' ~ ' + (res.window.to || '') + ' · ' + res.window.bars + '봉 워크포워드 · 룩어헤드 없음<br>'
      + '베이스라인 = 무작정 그 방향으로 찍었을 때 적중률. 이걸 넘겨야 예측력 있음.'
      + (res.errors ? ' · 계산 스킵 ' + res.errors + '건' : '')
      + '</div>';

    return head + body + interp + foot;
  }

  // ── 모달 ──
  function _close(){
    var el = document.getElementById('sxCTBTOverlay');
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }
  function open(){
    var ctx = window._sxCTBT || null;
    if(!ctx || !Array.isArray(ctx.rows) || ctx.rows.length < MIN_BARS + 5){
      alert('백테스트할 데이터가 부족합니다. 종목 분석을 먼저 실행해주세요.');
      return;
    }
    _close();
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
      + '<div style="font-size:10px;color:var(--text3);margin-bottom:12px">다음봉 색(양/음) 예측의 과거 적중률' + nm + '</div>'
      + '<div id="sxCTBTBody" style="text-align:center;padding:24px 2px;font-size:12px;color:var(--text3)">계산 중… (과거 봉을 하나씩 재현하는 중)</div>'
      + '</div>';
    document.body.appendChild(ov);

    // 로딩 페인트 후 실행 (calcAllScreener × 표본 수 → 1~3초 소요 가능)
    setTimeout(function(){
      var res;
      try { res = runBacktest(ctx.rows, ctx.market, ctx.tf); }
      catch(e){ res = { ok:false, reason:'실행 오류: ' + (e && e.message ? e.message : e) }; }
      var body = document.getElementById('sxCTBTBody');
      if(body){ body.setAttribute('style', 'text-align:left'); body.innerHTML = _renderResults(res); }
    }, 40);
  }

  window.SXCandleBT = { open: open, close: _close, run: runBacktest };
})();
