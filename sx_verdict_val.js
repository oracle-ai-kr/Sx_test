// ════════════════════════════════════════════════════════════════
//  sx_verdict_val.js — [S672] C 판정 검증 (SXVVAL)
//  목적: 워크포워드(룩어헤드 0)로 C(unifiedVerdictV2)의 진입판정이 이후 결과를
//        실제로 가르는지 검증. "등급이 결과를 가르나 + 안전캡이 하방을 줄이나".
//
//  방법: 각 과거 봉 t(샘플링)에서 —
//    1. qs  = SXE.scrQuickScore(rows.slice(0,t+1), tf, market)   ← A 4축 점수+안전위반
//    2. mom = SXE.scoreMomentum(rows.slice(0,t+1), tf, 5)
//    3. scores4 조립 → SXC.unifiedVerdictV2('waiting', scores4, mom, null)  ← C 진입판정
//    4. 이후 H봉 수익(종가→종가) 기록
//    → passCount(0-4)·verdict(매수/관심/관망/회피)·안전캡(위반 vs 무위반)별 버킷.
//
//  ★ 룩어헤드 0: rows.slice(0,t+1)만 사용(scrQuickScore의 max/min/중심창 전부 슬라이스
//    하에서 인과적, S254로 호출간 캐시 제거). 결과봉은 t+1..t+H ≤ 평가시점.
//  ★ 실엔진(SXE/SXC)은 브라우저서만 로드 → node는 실 SXC + 목 SXE로 하네스 로직검증.
//  ★ 정직한 기대: 방향은 효율적이라 등급이 *수익방향*을 크게 가르긴 어려울 수 있음.
//    C의 진짜 가치는 (a)선택성 (b)안전캡의 하방/꼬리 축소 → 하방 차원을 특히 봐야.
//  [S680] 체결 현실성 — 결과를 두 모델로: 종가체결(close[t]) vs 익일시가체결(open[t+1]).
//    청산봉(close[t+H]) 동일 → 차이=갭. stat=종가·statO=익일. "등급 변별/하방이 실체결서도 사나".
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var G = (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;

  function _num(x){ var v = +x; return isFinite(v) ? v : 0; }
  function _close(r){ return _num(r && (r.close != null ? r.close : r.c)); }
  function _open(r){ return _num(r && (r.open != null ? r.open : r.o)); }   // [S680] 익일시가 진입가용

  // scrQuickScore(qs) → unifiedVerdictV2가 받는 scores 형태 (sx_render.js _scores4 조립과 동일)
  function _assembleScores(qs){
    if(!qs) return null;
    return {
      readyScore:  qs.readyScore || 0,
      entryScore:  qs.entryScore || 0,
      trendScore:  (qs.trendScore != null ? qs.trendScore : (qs.score || 0)),
      upsideScore: qs.upsideScore || 0,
      maAlignBull: qs.maAlignBull === true,
      ltAlign:     qs.ltAlign || 'off',
      aTimingOn:   qs.aTimingOn,
      btScore:     0,                                  // 4축 passCount 무관(진입판정) → 0
      safetyViol:  Array.isArray(qs._safetyViol) ? qs._safetyViol : []
    };
  }

  // 버킷 통계: 이후 H봉 수익 분포 ([S680] 버킷원소 = {c:종가체결, o:익일시가체결}, key로 선택)
  function _stat(rets, key){
    key = key || 'c';
    var n = rets.length; if(!n) return { n:0 };
    var sum = 0, win = 0, lossSum = 0, lossN = 0, worst = 0;
    for(var i = 0; i < n; i++){ var r = (rets[i] && typeof rets[i] === 'object') ? rets[i][key] : rets[i]; sum += r; if(r > 0) win++; if(r < 0){ lossSum += r; lossN++; } if(r < worst) worst = r; }
    var RR = function(x){ return Math.round(x * 1e4) / 100; };
    return {
      n:n, ret:RR(sum / n), winRate:Math.round(win / n * 1000) / 10,
      avgLoss: lossN ? RR(lossSum / lossN) : 0,        // 평균 하락폭(손실봉만)
      worst: RR(worst)                                 // 최악(최저 수익)
    };
  }

  function run(rows, tf, market, opts){
    opts = opts || {};
    if(!Array.isArray(rows)) return { ok:false, reason:'데이터 없음' };
    // [S673] SXE는 const 전역(self/globalThis 속성 아님) → bare 이름으로 해석해야 함. SXC도 동일 취급. 로컬명은 _E/_C(전역 SXE 미섀도잉).
    var _E = (typeof SXE !== 'undefined' && SXE) ? SXE : (G.SXE || null);
    var _C = (typeof SXC !== 'undefined' && SXC) ? SXC : (G.SXC || null);
    if(!(_E && _E.scrQuickScore && _E.scoreMomentum)) return { ok:false, reason:'분석엔진(SXE) 미로드' };
    if(!(_C && _C.unifiedVerdictV2)) return { ok:false, reason:'C엔진(SXC) 미로드' };

    var n = rows.length, h = opts.h || 10;
    var warmup = opts.warmup != null ? opts.warmup : 150;   // scoreMomentum≥80 + 지표 충분 이력
    var lastE = n - 1 - h;
    if(lastE - warmup < 30) return { ok:false, reason:'표본 부족(' + n + '봉, ' + (warmup + h + 32) + '+ 필요)' };
    var target = opts.target || 80, step = Math.max(1, Math.ceil((lastE - warmup) / target));
    var closes = new Array(n), opens = new Array(n);
    for(var i = 0; i < n; i++){ closes[i] = _close(rows[i]); opens[i] = _open(rows[i]); }

    var byPass = [[], [], [], [], []];        // passCount 0-4 → rets
    var byPathPass = { rebound: [[],[],[],[],[]], trend: [[],[],[],[],[]] };  // [S674] 분기별 passCount → rets (4축 딥이 추세경로발인지 분리)
    var byVerdict = {};                        // action → rets
    var capRets = [], entryUncapRets = [];     // passCount≥3 中 안전위반 vs 무위반
    var records = opts.raw ? [] : null;        // [S674] 집계용 원시 레코드(다종목 풀링)
    var allRets = [], nPts = 0, errN = 0;

    for(var e = warmup; e <= lastE; e += step){
      var slice = rows.slice(0, e + 1), qs, mom, sc, v;
      try{
        qs = _E.scrQuickScore(slice, tf, market);
        mom = _E.scoreMomentum(slice, tf, 5);
        sc = _assembleScores(qs);
        if(!sc) { errN++; continue; }
        v = _C.unifiedVerdictV2('waiting', sc, mom, null);
      }catch(err){ errN++; continue; }
      if(!v) { errN++; continue; }
      var ce = closes[e]; if(!(ce > 0)) continue;
      var oe = opens[e + 1];                               // [S680] 익일시가 진입가
      var retC = closes[e + h] / ce - 1;                   // 종가체결(close[e])
      var retO = (oe > 0) ? closes[e + h] / oe - 1 : retC; // [S680] 익일시가체결(open[e+1]) — 차이=갭
      var rr = { c:retC, o:retO };
      nPts++; allRets.push(rr);

      var pass = (v.passCount != null ? v.passCount : 0); if(pass < 0) pass = 0; if(pass > 4) pass = 4;
      byPass[pass].push(rr);
      var path = v.passPath || 'none';   // [S674] 합격 경로(rebound/trend/none) — C가 이미 반환
      if(path === 'rebound' || path === 'trend') byPathPass[path][pass].push(rr);
      var act = v.action || '-';
      (byVerdict[act] = byVerdict[act] || []).push(rr);
      var _capped = !!(v.capReason && v.capReason.length), _hasViol = sc.safetyViol.length > 0;
      // 안전캡 효과: 4축상 진입급(passCount≥3)인데 안전위반 있음(→캡됨) vs 무위반(→진입)
      if(pass >= 3){
        if(_hasViol) capRets.push(rr); else entryUncapRets.push(rr);
      }
      if(records) records.push({ p:pass, path:path, ret:retC, retO:retO, cap:_capped?1:0, viol:_hasViol?1:0 });
    }
    if(nPts < 20) return { ok:false, reason:'유효 표본 부족(' + nPts + '시점 · ' + errN + ' 오류)' };

    var VERDICT_ORDER = ['매수', '관심', '관망', '회피', '보유 유지', '청산 준비', '청산 검토', '즉시 청산', '매도 완료'];
    var verdictArr = [];
    for(var k in byVerdict){ if(byVerdict.hasOwnProperty(k)) verdictArr.push({ action:k, stat:_stat(byVerdict[k], 'c'), statO:_stat(byVerdict[k], 'o') }); }
    verdictArr.sort(function(a, b){ var ia = VERDICT_ORDER.indexOf(a.action), ib = VERDICT_ORDER.indexOf(b.action); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });

    return {
      ok:true, nPts:nPts, errN:errN, step:step, h:h, warmup:warmup,
      drift: _stat(allRets, 'c'), driftO: _stat(allRets, 'o'),                 // [S680] 종가·익일시가 드리프트
      byPass: byPass.map(function(rets, p){ return { pass:p, stat:_stat(rets, 'c'), statO:_stat(rets, 'o') }; }),
      byPathPass: {   // [S674] 분기별 passCount 분리
        rebound: byPathPass.rebound.map(function(r, p){ return { pass:p, stat:_stat(r, 'c'), statO:_stat(r, 'o') }; }),
        trend:   byPathPass.trend.map(function(r, p){ return { pass:p, stat:_stat(r, 'c'), statO:_stat(r, 'o') }; })
      },
      byVerdict: verdictArr,
      safetyCap: { capped:_stat(capRets, 'c'), cappedO:_stat(capRets, 'o'), uncapped:_stat(entryUncapRets, 'c'), uncappedO:_stat(entryUncapRets, 'o') },
      records: records   // [S674] opts.raw 시에만 채워짐(다종목 풀링용) — [S680] ret(종가)·retO(익일) 둘 다
    };
  }

  G.SXVVAL = { run:run, _assembleScores:_assembleScores, _stat:_stat };
})();
