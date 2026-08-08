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
var CFG = { atrInitMult:2, atrTrailMult:3, maFast:5, maSlow:20, maxHoldMode:'ma', maxHoldDays:30, graceDays:10, atrPeriod:14 };

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
var SRC_ALL = { recipe:true, bullVol:true, v2:true, maCross:false };   // 기본 = 3원 전부 ON (시즌2 정합) · [S1210] maCross=후보(미검증·기본 OFF — 명시적 true일 때만 발동, 워커/시즌2 무영향)
// opts.srcOn = { recipe, bullVol, v2 } — 개별 false로 끄면 그 진입원만 건너뜀(단일검증 토글).
function entrySignalAt(mk, ind, rows, i, opts){
  var on=(opts&&opts.srcOn)||SRC_ALL;
  var votes=0;
  try{ if(typeof _sxRecipeVotesCore==='function'){ var v=_sxRecipeVotesCore(mk, ind, rows, i); votes=(v&&v.votes)||0; } }catch(_){}
  var _cfg=(opts&&opts.cfg)||CFG;
  if(on.recipe!==false && votes>=1) return { buy:true, votes:votes, src:'recipe', cell:cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };   // [S1210] 전 진입원 칸 각인 [S1211] 추세나이
  if(on.bullVol!==false && bullVolAt(mk, ind)) return { buy:true, votes:votes, src:'bullVol', cell:cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };
  if(on.v2!==false){
    var h=v2SignalAt(mk, ind, rows, i);
    if(h) return { buy:true, votes:votes, src:'v2', v2Cat:h.cat, v2Tier:h.tier, v2K:h.k, v2Cell:h.cell, v2Lbl:h.lbl, cell:h.cell||cellOfAt(ind,rows,i), gcAge:gcAgeAt(rows,i,_cfg) };
  }
  if(on.maCross===true && maCrossAt(rows, i, _cfg)){   // [S1210] 후보 — 꼴찌 우선순위(3원이 잡던 거래 불변·남는 구간만 추가) · 기본 OFF [S1211] M=크로스 당일=나이0(정의)
    // [S1212] 레짐게이트(희창 가설: 불장·상승장 크로스만·하락장 데드캣 크로스 배제) — opts.maCrossRegime=['bull','up'] 등. null/미지정=무게이트.
    var _mg=(opts&&opts.maCrossRegime)||null;
    if(!_mg || _mg.indexOf(regimeAt(rows,i))>=0)
      return { buy:true, votes:votes, src:'maCross', cell:cellOfAt(ind,rows,i), gcAge:0 };
  }
  return { buy:false, votes:votes, src:null };
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
  regime: { bull:'불장', up:'상승장', side:'횡보장', down:'하락장', crash:'폭락장' }
};
function cellLblOf(ck){ return (ck&&STATE_VOCAB.cell[ck])||ck||'?'; }
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
function evalExitAt(pos, rows, i, cfg){
  cfg = cfg || CFG;
  var cur = rows[i]; if(!cur) return { exit:false };
  var cp = cur.close;
  if(!(pos.peakHigh > 0)) pos.peakHigh = pos.entryPrice;
  if(cp > pos.peakHigh) pos.peakHigh = cp;                          // 트레일 최고가 갱신
  var initStop  = pos.entryPrice - cfg.atrInitMult  * pos.entryATR; // 초기 손절
  var trailStop = pos.peakHigh   - cfg.atrTrailMult * pos.entryATR; // 트레일
  var stop = Math.max(initStop, trailStop);
  // [S1216] 레짐 분할 출구(기본 미지정=현행) — cfg.exitSplitRegime=['bull','up']:
  //   그 레짐 = MA데드만(ATR 손절·트레일 억제·억제봉 atrSkips 각인) / 나머지 레짐 = ATR만(데드 무시·maSkips 각인).
  //   ★지정 레짐 ATR 억제 = 급락 하드브레이크 부재(데드 확정까지 노출·레짐 반전은 느림) — 정찰 전용·시즌2 비배선.
  //   지정 시 S1215 무시모드(maExitSkipRegime)보다 우선(UI가 한 모드만 켠다).
  var _sp=(cfg.exitSplitRegime&&cfg.exitSplitRegime.length)?cfg.exitSplitRegime:null;
  var _inSp=_sp?(_sp.indexOf(regimeAt(rows,i))>=0):false;
  if(cp <= stop){
    if(_sp && _inSp){ pos.atrSkips=(pos.atrSkips||0)+1; }   // [S1216] 분할: 지정 레짐에선 ATR 억제(스톱 이하 버틴 봉수=반사실)
    else return { exit:true, reason:(initStop >= trailStop) ? 'ATR손절' : 'ATR트레일', price:cp };
  }
  // MA 청산 (유예 경과 후)
  if(cfg.maxHoldMode === 'ma'){
    var held = _dateDays(cur.date) - pos.entryDay;
    if(held != null && held >= cfg.graceDays){
      var sc=[]; for(var k=0;k<=i;k++) sc.push(rows[k].close);
      var a5=sxSMA(sc,cfg.maFast), a20=sxSMA(sc,cfg.maSlow), p5=sxSMA(sc.slice(0,-1),cfg.maFast), p20=sxSMA(sc.slice(0,-1),cfg.maSlow);
      if(a5!=null&&a20!=null&&p5!=null&&p20!=null && p5>=p20 && a5<a20){
        // [S1215] 출구 레짐게이트(기본 미지정=현행) — cfg.maExitSkipRegime에 든 레짐이면 데드크로스 무시(개입 횟수 각인).
        //   ★데드는 이벤트라 한 번 무시하면 재발동 안 할 수 있음 → 사실상 그 거래는 트레일(고점−3×ATR) 단독 출구.
        //   워커(runAutotradeExit)·시즌2는 이 옵션을 모름 — 시즌1 정찰 전용. 채택은 PREREG 측정 후.
        if(_sp && !_inSp){                                                      // [S1216] 분할: 나머지 레짐에선 데드 무시(ATR이 출구)
          pos.maSkips=(pos.maSkips||0)+1;
        } else if(!_sp && cfg.maExitSkipRegime && cfg.maExitSkipRegime.length && cfg.maExitSkipRegime.indexOf(regimeAt(rows,i))>=0){
          pos.maSkips=(pos.maSkips||0)+1;
        } else
        return { exit:true, reason:'MA'+cfg.maFast+'x'+cfg.maSlow+'데드', price:cp };
      }
    }
  } else if(cfg.maxHoldMode === 'days'){
    var heldD = _dateDays(cur.date) - pos.entryDay;
    if(heldD != null && heldD >= cfg.maxHoldDays) return { exit:true, reason:'보유상한', price:cp };
  }
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
      var ev = evalExitAt(pos, rows, bj, cfg);
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
      gcAge: (siSig&&siSig.gcAge!=null)?siSig.gcAge:null,                                // [S1211] 진입봉 추세나이(5×20 GC 경과봉·null=250봉 내 없음)
      maSkips: pos.maSkips||0,                                                           // [S1215] 무시된 데드크로스 횟수(0=미개입)
      atrSkips: pos.atrSkips||0                                                          // [S1216] 분할모드에서 억제된 ATR 스톱 봉수(0=미개입)
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
