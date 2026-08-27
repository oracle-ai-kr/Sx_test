// ════════════════════════════════════════════════════════════
//  sx_exec_core.js · v10 [S1219] — 시즌1/2 공유 실행 SSOT
// ════════════════════════════════════════════════════════════
//  일원화(b): 시즌2 자동매매 · 시즌1 BT · 시즌1 분석탭 신호가 모두 이 코어를 공유.
//    진입 = 레시피 votes≥1 (recipe_core _sxRecipeVotesCore)
//    청산 = 이중ATR(초기 2× 손절 + peak 3× 트레일) + MA5×20 데드크로스(유예 10일)
//
//  계약: recipe_core / risk_core 와 동일 (ind, rows, i).
//    ind  = calcAllScreener(rows.slice(..i+1), 'day')  (진입 신호용)
//    rows = [{date,open,high,low,close,volume}, ...]    (OHLC·청산 계산용)
//    i    = 현재 봉 인덱스
//
//  수식 = 워커 runAutotradeExit(workers_v9.js) **정확 복제** — 골든테스트로 일치 박제.
//    entryATR = 진입봉 sxATR(14) 고정 · peakHigh = 진입 후 종가 최고 추적
//    initStop = entry − 2×ATR · trailStop = peak − 3×ATR · stop = max(둘) · curPrice≤stop → 손절/트레일
//    MA: 유예 후 미완성봉 제외 MA5×20 데드크로스(ma5p≥ma20p ∧ ma5n<ma20n)
//
//  ★1차 패스에선 워커(runAutotradeExit)는 안 건드림 — 코어=충실 복제라 시즌2 동작 동일·실거래 리스크 회피.
//    Phase 5에서 워커도 이 코어를 import하도록 통합 예정.
// ════════════════════════════════════════════════════════════
(function(){
'use strict';

// 고정 파라미터 (레시피-BT는 튜닝/모드 대상 없음 — 옵티마이저 소멸 근거)
var CFG = { atrOn:true, atrInitMult:2, atrTrailMult:3, deadOn:true, maFast:5, maSlow:20, graceDays:10, cfakeOn:true, cdownOn:true, nbarOn:false, nbarDays:30, gateOn:false, atrPeriod:14 };   // [S1397] 워커 S1393 미러 — 택1(maxHoldMode) 철거 → 4종 독립 칩 + N일 공통 + 3×3판 게이트(기본 OFF·PREREG_S1392 [측정 미달])

// ── 워커식 그대로 이식한 헬퍼 (sxATR·sxSMA) ──
function sxATR(candles, period){
  if(!candles || candles.length < period+1) return null;
  var sum=0;
  for(var i=candles.length-period; i<candles.length; i++){
    var h=candles[i].high, l=candles[i].low, pc=candles[i-1].close;
    if(!(h>=0)||!(l>=0)||!(pc>=0)) return null;
    sum += Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  return sum/period;
}
function sxSMA(arr, n){
  if(!arr || arr.length < n) return null;
  var s=0; for(var i=arr.length-n; i<arr.length; i++) s+=arr[i];
  return s/n;
}
// 유예 계산용 — 달력일(시장별 날짜포맷 대응: KR=YYYYMMDD · US/COIN=ISO)
function _dateDays(d){
  var s=String(d);
  if(/^\d{8}$/.test(s)) return Math.floor(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))/86400000);
  var t=Date.parse(s); return isFinite(t)?Math.floor(t/86400000):null;
}

// ── 진입 신호: 레시피 votes≥1 ──
//   recipe_core 로드 필요(_sxRecipeVotesCore 전역). 미로드=fail-safe(진입 안 함).
// ══ [S1201] 시즌2 진입 3원화 미러 ══
//   시즌2 sig_runner_s927.js(87~97)의 상호배타 우선순위를 그대로 복제: recipe > bullVol > v2 (검증강도순).
//   〔이력〕 코어 v1(S1017)은 votes≥1 단일 진입만 재현 → bullVol(S1041)·v2 어휘규칙(S1180)이 라이브에만
//           있고 BT엔 없어 시즌1 단일검증이 시즌2와 **두 세대** 어긋나 있었음. 이 배선으로 정합 복구.
//   ★정직: v2 규칙(SX_CELL_DATA.meta.caveat)은 발굴풀 **in-sample 적합**. 시즌2 paper는 시간축 OOS라
//           정직하지만, BT는 규칙을 만든 과거를 다시 도는 것 → BT의 v2 성과는 검증이 아니라 재현이다.
//           화면(단일검증 결과 카드)에 src별 분리 + in-sample 경고 병기 필수.
function _ltBearCore(ind){
  try{
    if(typeof _ltStr733==='function') return _ltStr733(ind&&ind.maAlignLT)==='bear';
    var lt=ind&&ind.maAlignLT; return !!(lt&&lt.gateOn&&lt.bearish);
  }catch(e){ return false; }
}
// bullVol [S1041] — sig_runner bullVolSignal verbatim. KR 전용(US/COIN 부호 반대라 미적용).
function bullVolAt(mk, ind){
  try{
    if(mk!=='kr') return false;
    if(!ind||!ind.maAlign||!ind.maAlign.bullish) return false;         // 강세(단기 5>20>60)
    if(!_ltBearCore(ind)) return false;                                // 하락장(장기 60<120<200)
    if(typeof ind.volOsc!=='number'||ind.volOsc<73.31) return false;   // 거래량OSC
    if(typeof ind.vr!=='number'||ind.vr<389.41) return false;          // VR
    return true;
  }catch(e){ return false; }
}
// v2 어휘규칙 [S1178→S1180] — real-kind hit만 매수 후보(DOWN·FAKE 매수투표 금지 · S1102 §8-3).
//   strict(강) 우선 → k 내림차 = sig_runner 정렬 동일.
//   btMode:true → 활동층(act) 스킵. BT는 봉마다 부르므로 전 카테고리 순회(어휘 1,247) 비용을 뺀다.
function v2SignalAt(mk, ind, rows, i){
  try{
    if(typeof _sxCellSignalCore!=='function') return null;
    var cs=_sxCellSignalCore(mk, ind, rows, i, { btMode:true });
    if(!cs||!Array.isArray(cs.sig)) return null;
    var buy=cs.sig.filter(function(s){ return s && s.hit && s.kind==='real'; })
      .sort(function(a,b){ return ((a.tier==='strict'?0:1)-(b.tier==='strict'?0:1))||(b.k-a.k); });
    if(!buy.length) return null;
    var t=buy[0];
    return { cat:t.cat, tier:t.tier||'strict', k:t.k, kStar:t.kStarN, cell:cs.cell, lbl:cs.lbl||null };
  }catch(e){ return null; }
}
var SRC_ALL = { recipe:true, bullVol:true, v2:true, maCross:true };   // [S1397] 4원 전부 ON — maCross=크로스(S1396 시즌2 배선·장기정배 라우팅 내장·provisional)
// opts.srcOn = { recipe, bullVol, v2 } — 개별 false로 끄면 그 진입원만 건너뜀(단일검증 토글).
function entrySignalAt(mk, ind, rows, i, opts){
  var on=(opts&&opts.srcOn)||SRC_ALL;
  var votes=0;
  try{ if(typeof _sxRecipeVotesCore==='function'){ var v=_sxRecipeVotesCore(mk, ind, rows, i); votes=(v&&v.votes)||0; } }catch(_){}
  var _cfg=(opts&&opts.cfg)||CFG;
  var _av=avoidAt(mk, ind, rows, i);   // [S1397] 전 봉 avoid 상시 각인 — 미러 청산(칸fake/칸down·전일 신호=원장 파리티)의 소스
  if(on.recipe!==false && votes>=1) return { buy:true, votes:votes, src:'recipe', avoid:_av, cell:cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };   // [S1210] 전 진입원 칸 각인 [S1211] 추세나이
  if(on.bullVol!==false && bullVolAt(mk, ind)) return { buy:true, votes:votes, src:'bullVol', avoid:_av, cell:cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };
  if(on.maCross===true && maCrossAt(rows, i, _cfg) && ltAt(rows,i)==='bull'){   // [S1397] 크로스(S1396 시즌2 정합) — 장기 정배 라우팅 내장·사슬 3순위(recipe>bullVol>크로스>v2=시즌2 실효 순서·동시발화는 귀속만 S1392 Q3). 구 mGate(레짐5 축·S1212) 철거.
    return { buy:true, votes:votes, src:'maCross', avoid:_av, cell:cellOfAt(ind,rows,i), gcAge:0 };
  }
  if(on.v2!==false){
    var h=v2SignalAt(mk, ind, rows, i);
    if(h) return { buy:true, votes:votes, src:'v2', avoid:_av, v2Cat:h.cat, v2Tier:h.tier, v2K:h.k, v2Cell:h.cell, v2Lbl:h.lbl, cell:h.cell||cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };
  }
  return { buy:false, votes:votes, src:null, avoid:_av };
}


// [S1397] 장기축(60/120/200 정배/혼조/역배) — S1396 crossSignal·S1393 게이트와 동일하게 종가 SMA 직접 계산(축 이원화 차단).
function ltAt(rows, i){
  try{
    if(!rows || i==null || i<199) return null;
    var sc=[]; for(var k=0;k<=i;k++) sc.push(+(rows[k].close!=null?rows[k].close:rows[k].c));
    function _m(len){ var t=0; for(var k2=i-len+1;k2<=i;k2++){ if(!(sc[k2]>0)) return null; t+=sc[k2]; } return t/len; }
    var a=_m(60), b=_m(120), c=_m(200);
    if(a==null||b==null||c==null) return null;
    return (a>b&&b>c)?'bull':((a<b&&b<c)?'bear':'mixed');
  }catch(e){ return null; }
}
// [S1397] 봉별 칸 경보(avoid) — 러너 원장 v2.avoid와 동일 소스(_sxCellSignalCore kind fake/down). 미러 BT 청산(칸fake/칸down)용.
function avoidAt(mk, ind, rows, i){
  try{
    if(typeof _sxCellSignalCore!=='function') return null;
    var cs=_sxCellSignalCore(mk, ind, rows, i);
    if(!cs||!Array.isArray(cs.sig)) return { fake:false, down:false };
    var f=false, d=false;
    cs.sig.forEach(function(x){ if(x&&x.hit){ if(x.kind==='fake') f=true; else if(x.kind==='down') d=true; } });
    return { fake:f, down:d };
  }catch(e){ return null; }
}
// ══ [S1210] MA5×20 골든크로스 — 후보 진입원(기본 OFF·미검증) ══
//   가설(희창): 상승추세 칸에서 레거시·v2보다 강한 구간 존재 + 3원이 못 덮는 구멍칸(bull|mixed 등) 커버.
//   정의 = 청산 데드크로스(evalExitAt)의 정확한 거울: 완성봉 종가 SMA · 직전봉 5≤20 ∧ 현재봉 5>20.
//   파라미터는 CFG.maFast/maSlow 공유(진입·청산 대칭 5×20 — 한 추세를 크로스로 열고 데드로 닫는다).
//   ★채택 경로: 단일검증 정찰(진입원×칸 분해) → PREREG 동결 측정(발굴풀+시간분리 OOS·bullVol S1041 선례) → 통과 시에만 시즌2 배선.
function maCrossAt(rows, i, cfg){
  cfg = cfg || CFG;
  try{
    if(!rows || i==null || i+1 < cfg.maSlow+1) return false;   // 직전봉 SMA까지 필요 → 최소 maSlow+1봉
    var sc=[]; for(var k=0;k<=i;k++) sc.push(rows[k].close);
    var a5=sxSMA(sc,cfg.maFast), a20=sxSMA(sc,cfg.maSlow), p5=sxSMA(sc.slice(0,-1),cfg.maFast), p20=sxSMA(sc.slice(0,-1),cfg.maSlow);
    if(a5==null||a20==null||p5==null||p20==null) return false;
    return (p5<=p20 && a5>a20);
  }catch(e){ return false; }
}

// [S1211] 진입봉의 5×20 골든크로스 경과("추세 나이") — 전 진입원 각인.
//   근거(합성 3형상 실측): GC봉은 엄격 정배(5>10>20) 성립 2~3봉 前(MA10이 아직 20 아래) → M 진입은 중립칸에 찍히고 정배칸으로 타고 들어간다.
//   따라서 "단기강세에서 M vs 타원" 비교는 칸(상태)만으론 불충분 — 이 나이(이벤트 기준) 축이 정면 비교축.
//   M=0(정의역) · 레시피/v2=크로스 후 n봉째 중간 탑승 · null=250봉 내 GC 없음(장기 역배 등).
function gcAgeAt(rows, i, cfg){
  cfg = cfg || CFG;
  try{
    var lo = Math.max(cfg.maSlow, i - 250);
    for(var j=i; j>=lo; j--){ if(maCrossAt(rows, j, cfg)) return i - j; }
    return null;
  }catch(e){ return null; }
}
// [S1210] 진입봉 칸 판정 — 시즌2 S1209 각인·시즌1 3×3과 동일 축(axisGen은 SX_CELL_DATA.meta 추종, _sxCellSignalCore 규약 동일).
function cellOfAt(ind, rows, i){
  try{
    if(typeof _cellKeyOf!=='function') return null;
    var D=(typeof SX_CELL_DATA!=='undefined')?SX_CELL_DATA:((typeof globalThis!=='undefined'&&globalThis.SX_CELL_DATA)||null);
    return _cellKeyOf(ind, rows, i, (D&&D.meta&&D.meta.axisGen)||'ma51020');
  }catch(e){ return null; }
}


// [S1212] S544 레짐 분류 — sx_bt.js _btRegimeAt에서 SSOT 이동(설계원칙1: 미러 이중구현 금지 — sx_bt는 이 함수로 위임).
//   SMA 20/60/120/200: |20−장기|<±1.5%=side(크로스 부근) · 20>장기: 60>120>200 정배면 bull(불장·200봉 확보 시만) 아니면 up(상승장) · 20<장기=down.
//   장기선 폴백 200→120→60. ★3×3 장기축(maAlignLT)·S543(ADX 미러)과는 별개 어휘 — 혼용 금지.
function regimeAt(rows, idx){
  if(!rows || idx < 30) return 'side';
  function _sm(len){ if(idx < len-1) return null; var s=0,k,c; for(k=idx-len+1;k<=idx;k++){ c=+(rows[k].close!=null?rows[k].close:rows[k].c); s+=c; } return s/len; }
  var ma20=_sm(20);
  var maLong=_sm(200), longFull=(maLong!=null);
  if(maLong==null) maLong=_sm(120);
  if(maLong==null) maLong=_sm(60);
  if(ma20==null || maLong==null || maLong===0) return 'side';
  var distPct=(ma20-maLong)/maLong*100;
  if(Math.abs(distPct) < 1.5) return 'side';
  if(distPct > 0){
    if(longFull){ var ma60=_sm(60), ma120=_sm(120); if(ma60!=null && ma120!=null && ma60>ma120 && ma120>maLong) return 'bull'; }
    return 'up';
  }
  return 'down';
}


// ══ [S1217] 상태 어휘 SSOT(희창 확정) — "세"(종목 3×3 추세축)와 "장"(레짐 국면)의 언어 분리 ══
//   ★칸 키('bull|bear' 등)는 측정 정체성 — **동결**. 라벨만 여기서 파생(cell_data cellLbl·KV 저장 cellLbl은 참고용 미러·소비자는 이 맵).
//   셀 재배치: 눌림목·바닥확인 약세행→중립행(골든크로스가 중립행에 찍히는 S1211 실측과 정합) · 약세행=되돌림·추가하락 · 횡보장유지→추세중립.
//   장기축 상승장→상승세 등 — '장' 어휘를 레짐 전용으로 해방(불장/상승장/횡보장/하락장/폭락장).
var STATE_VOCAB = {
  axisShort: { bull:'강세', bear:'약세', mixed:'중립' },
  axisLong:  { bull:'상승세', bear:'하락세', mixed:'혼조세' },
  cell: {
    'bull|bull':'추가상승','bull|bear':'기술적반등','bull|mixed':'상승세전환',
    'bear|bull':'되돌림','bear|bear':'추가하락','bear|mixed':'하락세전환',
    'mixed|bull':'눌림목','mixed|bear':'바닥확인','mixed|mixed':'추세중립'
  },
  regime: { bull:'불장', up:'상승장', side:'횡보장', down:'하락장', crash:'폭락장' },
  // [S1449] ★레짐 아이콘 SSOT — 라벨이 여기 있으니 아이콘도 여기다(둘은 한 어휘의 두 면이다).
  //   ⚠**표가 세 벌로 갈려 있었다**: 전광판 `{🔥,🌤️,〰️,🌧️,🌋}`(날씨 은유) · sx_bt `RG_L`·`L` `{🔥,📈,➡️,📉,🌋}`(방향 은유).
  //     같은 레짐이 두 화면에서 다른 글리프였고, sx_bt 안에서도 두 표가 라벨 형태만 달리 적혀 있었다(`횡보` vs `횡보장`).
  //   ★**방향 세트를 채택했다** — 새 이모지를 만들지 않고 **이미 있던 두 세트 중 하나를 고른 것**이라 자유도가 0이다. 근거 셋:
  //     ㉠전광판 3개만 바뀌고 sx_bt 두 표는 글리프가 그대로다(bull 🔥·crash 🌋는 두 세트가 이미 같았다).
  //     ㉡**`🌤️` 충돌이 해소된다** — 날씨 세트의 `up`이 변동성 안전렌즈 `🌤️ 변동성 낮음`과 한 밴드에서 겹쳤다.
  //        방향 세트로 가면 변동성 3종(🌪️/🌫️/🌤️)을 **한 글자도 안 건드리고** 충돌이 사라진다.
  //     ㉢S1243이 날씨 은유를 고른 이유는 *'전이 배지(📈📉)와 비겹침'*이었는데 **S1448이 전이 배지를 철거해 그 제약이 사라졌다.**
  //   ⚠키는 측정 정체성이라 동결(STATE_VOCAB 규약 그대로) · 바뀌는 것은 표시 글리프뿐이다.
  regimeIcon: { bull:'🔥', up:'📈', side:'➡️', down:'📉', crash:'🌋' }
};
function cellLblOf(ck){ return (ck&&STATE_VOCAB.cell[ck])||ck||'?'; }
// [S1450] 레짐 표기 조립도 SSOT가 맡는다 — S1449는 아이콘 표만 여기 두고 **조립은 render·bt가 각자** 했다.
//   조립 규칙이 두 벌이면 그것도 미러다(붙임/띄어쓰기 차이가 곧 갈림의 씨앗). sp=true면 아이콘과 라벨 사이 공백.
//   ⚠아이콘이 없으면 라벨만 — 글리프를 지어내지 않는다(S1423).
function regimeTagOf(rg, sp){
  var ic = (STATE_VOCAB.regimeIcon && STATE_VOCAB.regimeIcon[rg]) || '';
  var lb = (STATE_VOCAB.regime && STATE_VOCAB.regime[rg]) || rg;
  return ic ? (ic + (sp ? ' ' : '') + lb) : lb;
}
// [S1219] 레짐 v3(5국면·전면 재구성) — 골격(20 vs 200 ±1.5%)은 유지, **분화는 전부 동역학**(기울기·변동성·이격도):
//   ① 상승측: 불장 = 기울기(MA20 10봉) ≥ +0.15%/봉 · 상승장 = 미달. **구 60>120>200 조항 폐기** — 3×3 장기축(상승세)과 문자 그대로 중복이라(희창 지적) 위치는 3×3, 동역학은 레짐으로 직교화.
//   ② 하락측(S1218 유지): 폭락 = 기울기 ≤ −0.5%/봉 ∨ ATR14/종가 ≥ 5% ∨ 이격(종가/MA20) ≤ −7% · 하락장 = 미달.
//   ③ 횡보장 = 밴드 안(전환 구간·v1 동일). ★게이트 불변 증명: 게이트 소비는 합집합 {불장,상승장}이고 그 합집합(=20>200+1.5%)은 v1≡v3 — 테스트 박제.
//   전 임계값은 선언값 초안(측정 전·조정 가능). 함수명은 regime5At 유지(소비자 배선 불변).
function regime5At(rows, idx){
  var base = regimeAt(rows, idx);
  if(base === 'side') return 'side';
  if(base === 'bull' || base === 'up'){                                              // [S1219] 상승측 재분화 — 기울기 축
    try{
      function _smU(end,len){ if(end<len-1) return null; var t=0,k,c; for(k=end-len+1;k<=end;k++){ c=+(rows[k].close!=null?rows[k].close:rows[k].c); t+=c; } return t/len; }
      var u0=_smU(idx,20), u1=_smU(idx-10,20);
      var us=(u0!=null&&u1!=null&&u1>0)?((u0-u1)/u1*100/10):null;                     // %/봉
      return (us!=null&&us>=0.15)?'bull':'up';
    }catch(e){ return 'up'; }
  }
  try{
    function _sm(end,len){ if(end<len-1) return null; var t=0,k,c; for(k=end-len+1;k<=end;k++){ c=+(rows[k].close!=null?rows[k].close:rows[k].c); t+=c; } return t/len; }
    var m0=_sm(idx,20), m1=_sm(idx-10,20);
    var slope=(m0!=null&&m1!=null&&m1>0)?((m0-m1)/m1*100/10):null;      // %/봉
    var atr=sxATR(rows.slice(0, idx+1), 14), cp=+(rows[idx].close!=null?rows[idx].close:rows[idx].c);
    var atrPct=(atr!=null&&cp>0)?(atr/cp*100):null;
    var disp=(m0!=null&&m0>0&&cp>0)?((cp-m0)/m0*100):null;                          // [S1218] 이격도(종가 vs MA20, %)
    if((slope!=null&&slope<=-0.5)||(atrPct!=null&&atrPct>=5)||(disp!=null&&disp<=-7)) return 'crash';
  }catch(e){}
  return 'down';
}
// [S1217] 종목 상태 헬퍼 — 전광판·조건검색 상태필터의 SSOT 기반(배선은 차후 세션).
function stockStateAt(ind, rows, i){
  var ck=cellOfAt(ind, rows, i), rg=regime5At(rows, i);
  return { cell:ck, cellLbl:cellLblOf(ck), regime:rg, regimeLbl:STATE_VOCAB.regime[rg]||rg };
}

// ── 진입봉 ATR (진입 시 고정될 값) ──
function entryATRat(rows, entryIdx, cfg){
  cfg = cfg || CFG;
  return sxATR(rows.slice(0, entryIdx+1), cfg.atrPeriod);
}

// ── 청산 평가: 열린 포지션 + 현재 봉 → { exit, reason, price } ──
//   pos = { entryPrice, entryATR, peakHigh, entryDay }  (호출자가 상태 유지 · peakHigh는 여기서 갱신)
//   워커 runAutotradeExit 로직 정확 복제. 청산 트리거·가격은 raw 종가 기준.
function evalExitAt(pos, rows, i, cfg, sigPrev){
  // [S1397] 워커 atExitDecide(S1393) 미러 — 4종 독립 칩 OR + 3×3판 게이트 + N일 공통. 우선순위=데드→칸fake→칸down→N일→ATR(동시 충족=사유 라벨만 결정).
  //   칸fake/칸down: sigPrev(전일 봉 신호=원장 파리티·1봉 지연) 기반 — sigPrev 없음(워밍업 등)=보류(워커 stale 동형). 트리거·가격은 종가(기존 관례).
  //   게이트: 장기축 ltAt(전일 봉) — 'bull'=데드만·ATR 억제 / 'mixed'·'bear'=ATR만·데드 무시 / 축 불명=해제(전 칩). 칸·N일 불개입.
  //   구 S1215(무시)·S1216(분할·레짐5 축) 정찰 옵션은 철거 — 시즌2 부재·게이트(3×3판)가 그 자리.
  cfg = cfg || CFG;
  var cur = rows[i]; if(!cur) return { exit:false };
  var cp = cur.close;
  if(!(pos.peakHigh > 0)) pos.peakHigh = pos.entryPrice;
  if(cp > pos.peakHigh) pos.peakHigh = cp;
  var initStop  = pos.entryPrice - cfg.atrInitMult  * pos.entryATR;
  var trailStop = pos.peakHigh   - cfg.atrTrailMult * pos.entryATR;
  var lt = ltAt(rows, i-1);
  var gated = (cfg.gateOn === true) && (lt === 'bull' || lt === 'mixed' || lt === 'bear');
  var deadAllowed = (cfg.deadOn !== false) && (!gated || lt === 'bull');
  var atrAllowed  = (cfg.atrOn  !== false) && (!gated || lt !== 'bull');
  if(deadAllowed){
    var held = _dateDays(cur.date) - pos.entryDay;
    if(held != null && held >= cfg.graceDays){
      var sc=[]; for(var k=0;k<=i;k++) sc.push(rows[k].close);
      var a5=sxSMA(sc,cfg.maFast), a20=sxSMA(sc,cfg.maSlow), p5=sxSMA(sc.slice(0,-1),cfg.maFast), p20=sxSMA(sc.slice(0,-1),cfg.maSlow);
      if(a5!=null&&a20!=null&&p5!=null&&p20!=null && p5>=p20 && a5<a20)
        return { exit:true, reason:'MA'+cfg.maFast+'x'+cfg.maSlow+'데드', price:cp };
    }
  }
  var _av=(sigPrev && sigPrev.avoid) ? sigPrev.avoid : null;
  if(cfg.cfakeOn !== false && _av && _av.fake) return { exit:true, reason:'칸fake', price:cp };
  if(cfg.cdownOn !== false && _av && _av.down) return { exit:true, reason:'칸down', price:cp };
  if(cfg.nbarOn === true){
    var heldD = _dateDays(cur.date) - pos.entryDay;
    if(heldD != null && heldD >= (cfg.nbarDays||30)) return { exit:true, reason:'보유상한', price:cp };   // 표기=구 문자열 유지(워커 'N일 상한'과 의미 동일)
  }
  if(atrAllowed && cp <= Math.max(initStop, trailStop))
    return { exit:true, reason:(initStop >= trailStop) ? 'ATR손절' : 'ATR트레일', price:cp };
  return { exit:false };
}

// ── 전체 라이프사이클 러너 (시즌1 BT용) ──
//   단일포지션 순차(사이징 노이즈 격리). 호출자가 votesAt(i)=봉 i의 votes 제공(calcAllScreener 비용 위임).
//   opts: { entryMode:'nextOpen'|'close'(기본 nextOpen=공식프레임), slippage(기본 0), cfg, minIdx(기본 250), tailPad(기본 1) }
//   반환: { trades:[{entryIdx,entryPrice,entryDate,exitIdx,exitPrice,exitDate,reason,ret,bars}], stats:{...} }
function runLifecycle(rows, votesAt, opts){
  opts = opts || {};
  var cfg = opts.cfg || CFG;
  var entryMode = opts.entryMode || 'nextOpen';
  var slip = opts.slippage || 0;
  var minIdx = (opts.minIdx != null) ? opts.minIdx : 250;
  var tailPad = (opts.tailPad != null) ? opts.tailPad : (entryMode === 'nextOpen' ? 1 : 0);   // 진입봉 뒤 청산봉 확보
  var N = rows.length, trades = [], cursor = minIdx;
  while(cursor < N - 1 - tailPad){
    // 진입 스캔
    var si = -1;
    // [S1201] votesAt 콜백은 숫자(구) 또는 {buy,src,...}(신) 둘 다 허용 — 하위호환.
    var siSig=null;
    for(var k=cursor; k < N-1-tailPad; k++){
      var _sg=votesAt(k), _ok;
      if(_sg && typeof _sg==='object'){ _ok=!!_sg.buy; } else { _ok=((_sg||0)>=1); }
      if(_ok){ si=k; siSig=(_sg&&typeof _sg==='object')?_sg:{ src:'recipe', votes:(_sg||0) }; break; }
    }
    if(si < 0) break;
    var entryIdx = (entryMode === 'nextOpen') ? si+1 : si;
    var rawEntry = (entryMode === 'nextOpen') ? rows[entryIdx].open : rows[entryIdx].close;
    if(!(rawEntry > 0)){ cursor = si+1; continue; }
    var eATR = entryATRat(rows, entryIdx, cfg);
    if(!(eATR > 0)){ cursor = si+1; continue; }
    var pos = { entryPrice: rawEntry, entryATR: eATR, peakHigh: rawEntry, entryDay: _dateDays(rows[entryIdx].date) };
    var exitIdx=-1, reason=null;
    for(var bj = entryIdx+1; bj < N; bj++){
      var _sp=null; try{ var _s0=votesAt(bj-1); if(_s0 && typeof _s0==='object') _sp=_s0; }catch(_e){}   // [S1397] 전일 봉 신호=원장 파리티(칸fake/칸down 1봉 지연 소스)
      var ev = evalExitAt(pos, rows, bj, cfg, _sp);
      if(ev.exit){ exitIdx=bj; reason=ev.reason; break; }
    }
    if(exitIdx < 0){ exitIdx = N-1; reason = 'EOD'; }              // 데이터 끝까지 보유(미청산)
    var entryFill = rawEntry * (1 + slip);
    var exitFill  = rows[exitIdx].close * (1 - slip);
    trades.push({
      entryIdx: entryIdx, entryPrice: entryFill, entryDate: rows[entryIdx].date,
      exitIdx: exitIdx, exitPrice: exitFill, exitDate: rows[exitIdx].date,
      reason: reason, ret: exitFill/entryFill - 1, bars: exitIdx - entryIdx,
      src: (siSig&&siSig.src)||'recipe', votes: (siSig&&siSig.votes)||0,               // [S1201] 진입원 각인
      v2Cat: (siSig&&siSig.v2Cat)||null, v2Tier: (siSig&&siSig.v2Tier)||null, v2K: (siSig&&siSig.v2K)||null,
      cell: (siSig&&siSig.cell)||null,                                                  // [S1210] 진입봉 칸(3×3) — 진입원×칸 분해용
      gcAge: (siSig&&siSig.gcAge!=null)?siSig.gcAge:null                                 // [S1211] 진입봉 추세나이(5×20 GC 경과봉·null=250봉 내 없음) · [S1397] maSkips/atrSkips 각인 철거(S1215/16 옵션 소멸)
    });
    cursor = exitIdx + 1;
  }
  return { trades: trades, stats: _tradeStats(trades) };
}

function _tradeStats(trades){
  var n=trades.length; if(!n) return { n:0 };
  var rs=trades.map(function(t){return t.ret;});
  var wins=rs.filter(function(r){return r>0;}), losses=rs.filter(function(r){return r<=0;});
  var sumW=wins.reduce(function(a,b){return a+b;},0), sumL=losses.reduce(function(a,b){return a+Math.abs(b);},0);
  var eq=1, pk=1, mdd=0;
  trades.slice().sort(function(a,b){return (_dateDays(a.entryDate)||0)-(_dateDays(b.entryDate)||0);})
    .forEach(function(t){ eq*=(1+t.ret); if(eq>pk)pk=eq; var dd=(pk-eq)/pk; if(dd>mdd)mdd=dd; });
  return {
    n:n, mean: rs.reduce(function(a,b){return a+b;},0)/n,
    win: wins.length/n, pf: (sumL>0? sumW/sumL : (sumW>0?Infinity:null)),
    mdd: mdd, avgBars: trades.reduce(function(a,t){return a+t.bars;},0)/n
  };
}

var API = {
  VERSION: 'S1219', CFG: CFG, SRC_ALL: SRC_ALL,
  sxATR: sxATR, sxSMA: sxSMA,
  entrySignalAt: entrySignalAt, entryATRat: entryATRat, evalExitAt: evalExitAt,
  bullVolAt: bullVolAt, v2SignalAt: v2SignalAt,                                        // [S1201]
  maCrossAt: maCrossAt, cellOfAt: cellOfAt, gcAgeAt: gcAgeAt, regimeAt: regimeAt,      // [S1210·S1211·S1212]
  STATE_VOCAB: STATE_VOCAB, cellLblOf: cellLblOf, regime5At: regime5At, stockStateAt: stockStateAt,   // [S1217]
  regimeTagOf: regimeTagOf,                                                                           // [S1450]
  runLifecycle: runLifecycle
};
if(typeof module !== 'undefined' && module.exports) module.exports = API;
// [S1201·버그] 구: window 전용 export → **워커에선 SXExecCore가 항상 undefined**.
//   sxRunBtEngine이 `if(!EC) return {error:'sx_exec_core 미로드'}` 하고,
//   워커는 `if(btResult && !btResult.error)`로 조용히 건너뜀 → 조건검색 BT 배지·P&L 필터가
//   S1018(코어 도입) 이후 **줄곧 죽어 있었다**. globalThis로 바꿔 window/self 양쪽 커버.
if(typeof globalThis !== 'undefined') globalThis.SXExecCore = API;
else if(typeof window !== 'undefined') window.SXExecCore = API;

})();
