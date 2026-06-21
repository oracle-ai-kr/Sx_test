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
//  [S681] 점수 신뢰성(2분류) — 봉마다 이미 도는 qs에서 4축(반등/진입/추세/추가상승) 추출 → 추가비용 0.
//    축마다 IC(점수↔이후수익 순위상관) + 고/저 1/3 스프레드(종가·익일시가). "70점이 40점보다 실제 더 오르나".
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

  // [S681] 점수 신뢰성 — 축점수↔이후수익 순위상관(Spearman IC). recs:[{rd,en,tr,up,c,o}], key=축, fill='c'|'o'.
  function _spearman(recs, key, fill){
    var n = recs.length; if(n < 10) return null;
    var ix = []; for(var i=0;i<n;i++) ix.push(i);
    var bs = ix.slice().sort(function(a,b){ return recs[a][key]-recs[b][key]; });
    var br = ix.slice().sort(function(a,b){ return recs[a][fill]-recs[b][fill]; });
    var rs = new Array(n), rr = new Array(n);
    bs.forEach(function(i,rank){ rs[i]=rank; }); br.forEach(function(i,rank){ rr[i]=rank; });
    var ms = (n-1)/2, num=0, ds=0, dr=0;
    for(var j=0;j<n;j++){ var a=rs[j]-ms, b=rr[j]-ms; num+=a*b; ds+=a*a; dr+=b*b; }
    return (ds>0 && dr>0) ? Math.round(num/Math.sqrt(ds*dr)*1000)/1000 : null;
  }
  // 고점수 상위⅓ vs 하위⅓ 평균 이후수익(fill 기준) — "70점이 40점보다 실제 더 오르나"
  function _hiLo(recs, key, fill){
    var n = recs.length; if(n < 12) return null;
    var s = recs.slice().sort(function(a,b){ return a[key]-b[key]; });
    var t = Math.floor(n/3); if(t < 3) return null;
    var mean = function(arr){ var v=0; for(var i=0;i<arr.length;i++) v+=arr[i][fill]; return arr.length? v/arr.length : 0; };
    var lo = mean(s.slice(0,t)), hi = mean(s.slice(n-t)), RR = function(x){ return Math.round(x*1e4)/100; };
    return { lo:RR(lo), hi:RR(hi), spread:RR(hi-lo), t:t };
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
    var allRets = [], scoreRecs = [], nPts = 0, errN = 0;   // [S681] scoreRecs = 4축 점수+이후수익(점수 캘리브)

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
      // [S681] 4축 점수(0-100) 기록 — 점수레벨 캘리브레이션용. scrQuickScore가 봉마다 반환 → 추가비용 0.
      var _ax = { rd:qs.readyScore||0, en:qs.entryScore||0, tr:(qs.trendScore!=null?qs.trendScore:(qs.score||0)), up:qs.upsideScore||0, c:retC, o:retO };
      scoreRecs.push(_ax);
      if(records) records.push({ p:pass, path:path, act:act, ret:retC, retO:retO, cap:_capped?1:0, viol:_hasViol?1:0, rd:_ax.rd, en:_ax.en, tr:_ax.tr, up:_ax.up });
    }
    if(nPts < 20) return { ok:false, reason:'유효 표본 부족(' + nPts + '시점 · ' + errN + ' 오류)' };

    var VERDICT_ORDER = ['매수', '관심', '관망', '회피', '보유 유지', '청산 준비', '청산 검토', '즉시 청산', '매도 완료'];
    var verdictArr = [];
    for(var k in byVerdict){ if(byVerdict.hasOwnProperty(k)) verdictArr.push({ action:k, stat:_stat(byVerdict[k], 'c'), statO:_stat(byVerdict[k], 'o') }); }
    verdictArr.sort(function(a, b){ var ia = VERDICT_ORDER.indexOf(a.action), ib = VERDICT_ORDER.indexOf(b.action); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });

    // [S681] 4축 점수 캘리브레이션 — 축마다 점수↔이후수익 순위상관(IC) + 고/저 1/3 스프레드(종가·익일시가)
    var SCORE_AXES = [{k:'rd',label:'반등신호'},{k:'en',label:'반등강도'},{k:'tr',label:'추세방향'},{k:'up',label:'추가상승'}]; // [S690] 카드 라벨 동기화(ready=반등신호/entry=반등강도/trend=추세방향)
    var scoreCalib = SCORE_AXES.map(function(ax){
      return { key:ax.k, label:ax.label,
        icC:_spearman(scoreRecs,ax.k,'c'),  icO:_spearman(scoreRecs,ax.k,'o'),
        hiLoC:_hiLo(scoreRecs,ax.k,'c'),    hiLoO:_hiLo(scoreRecs,ax.k,'o') };
    });

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
      records: records,   // [S674] opts.raw 시에만 채워짐(다종목 풀링용) — [S680] ret(종가)·retO(익일) 둘 다 · [S681] 4축점수
      scoreCalib: scoreCalib   // [S681] 4축 점수 캘리브레이션(IC + 고/저 스프레드)
    };
  }

  // [S689] 다종목 풀링 집계 — run({raw:true})의 records를 여러 종목 합쳐 받아 노이즈 상쇄.
  //   축별 풀링 IC(핵심: 부호 일관성이 단일종목 운에서 벗어남) + 등급 변별(verdict별 + 진입급 p≥3 vs 회피급 p≤1) + passCount 분포. 종가(ret)·익일(retO) 둘 다.
  //   내부 _spearman/_hiLo/_stat 재사용 — records 필드(rd/en/tr/up · ret/retO)를 key/fill로 직접 인덱싱.
  function pool(records){
    if(!Array.isArray(records) || records.length < 20) return { ok:false, reason:'풀 표본 부족(' + (records ? records.length : 0) + '시점 · 20+ 필요)', n:(records ? records.length : 0) };
    var AX = [{k:'rd',label:'반등신호'},{k:'en',label:'반등강도'},{k:'tr',label:'추세방향'},{k:'up',label:'추가상승'}]; // [S690] 카드 라벨 동기화
    var axes = AX.map(function(a){
      return { key:a.k, label:a.label,
        icC:_spearman(records, a.k, 'ret'),  icO:_spearman(records, a.k, 'retO'),
        hiLoC:_hiLo(records, a.k, 'ret'),    hiLoO:_hiLo(records, a.k, 'retO') };
    });
    var byPass = [[], [], [], [], []];
    records.forEach(function(r){ var p = r.p; if(p < 0) p = 0; if(p > 4) p = 4; byPass[p].push(r); });
    var byAct = {};
    records.forEach(function(r){ var a = r.act || '-'; (byAct[a] = byAct[a] || []).push(r); });
    var VORD = ['매수', '관심', '관망', '회피'];
    var verdictArr = [];
    for(var k in byAct){ if(byAct.hasOwnProperty(k)) verdictArr.push({ action:k, n:byAct[k].length, stat:_stat(byAct[k], 'ret'), statO:_stat(byAct[k], 'retO') }); }
    verdictArr.sort(function(a, b){ var ia = VORD.indexOf(a.action), ib = VORD.indexOf(b.action); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    var entryRecs = [], avoidRecs = [];
    records.forEach(function(r){ if(r.p >= 3) entryRecs.push(r); else if(r.p <= 1) avoidRecs.push(r); });
    // [S690] 경로 분할 검증 — C는 경로별 다른 축 사용(rebound:반등신호+반등강도+추세 / trend:추세+추가상승). 섞으면 안 쓰는 경로 축 IC가 오염.
    //   경로별로 활성 축만 IC + 경로 수익(익일) + 경로내 등급격차 → 각 축을 '쓰이는 경로에서' 격리 평가 + 분기 결정 검증.
    var PATH_ACT = { rebound:['rd','en','tr'], trend:['tr','up'] }, AXLBL = { rd:'반등신호', en:'반등강도', tr:'추세방향', up:'추가상승' };
    function _poolPath(pn){
      var rs = records.filter(function(r){ return r.path === pn; }), act = PATH_ACT[pn];
      var o = { name:pn, n:rs.length, active:act, axes:[], retC:null, retO:null, entry:null, avoid:null, gap:null };
      if(rs.length >= 15){
        o.axes = act.map(function(k){ return { key:k, label:AXLBL[k], icC:_spearman(rs, k, 'ret'), icO:_spearman(rs, k, 'retO') }; });
        o.retC = _stat(rs, 'ret').ret; o.retO = _stat(rs, 'retO').ret;
        var en = rs.filter(function(r){ return r.p >= 3; }), av = rs.filter(function(r){ return r.p <= 1; });
        var eo = en.length ? _stat(en, 'retO').ret : null, ao = av.length ? _stat(av, 'retO').ret : null;
        o.entry = { n:en.length, ret:eo }; o.avoid = { n:av.length, ret:ao };
        o.gap = (eo != null && ao != null) ? Math.round((eo - ao) * 100) / 100 : null;
      }
      return o;
    }
    var byPath = { rebound:_poolPath('rebound'), trend:_poolPath('trend'), noneN: records.filter(function(r){ return r.path !== 'rebound' && r.path !== 'trend'; }).length };
    return {
      ok:true, n:records.length,
      axes: axes,
      byPath: byPath,   // [S690] 경로별 활성 축 IC + 경로 수익·등급격차
      byPass: byPass.map(function(rets, p){ return { pass:p, n:rets.length, stat:_stat(rets, 'ret'), statO:_stat(rets, 'retO') }; }),
      byVerdict: verdictArr,
      entry: { n:entryRecs.length, stat:_stat(entryRecs, 'ret'), statO:_stat(entryRecs, 'retO') },
      avoid: { n:avoidRecs.length, stat:_stat(avoidRecs, 'ret'), statO:_stat(avoidRecs, 'retO') }
    };
  }

  G.SXVVAL = { run:run, pool:pool, _assembleScores:_assembleScores, _stat:_stat };
})();
