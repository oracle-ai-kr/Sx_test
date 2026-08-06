// [S927] SX 신호생성기 (시즌2 두뇌 출력) — 스냅 각 종목 최신봉 verdict → 정책레이어 → 신호원장 JSON
//  전역(cat 선행): SXVVAL(run·_assembleScores) · SXE · _C(unifiedVerdictV2 내부호출) · recipe_core
//  [S1180] +SXFeatureLib(sx_feature_library.js)·SX_CELL_DATA(sx_cell_data.js) — 레시피 v2(어휘규칙) 판정용. 미로드 시 v2=null(레거시만 동작·안전).
//  최신봉 = V.run(h=0, warmup=n-4, target=5) 후 e최대 레코드. dck/dcf는 cv2rec 훅(§3 동일).
//  정책레이어 = 등급→{action,score} 시장별. 근거 §1(시장분기)·②(US 회피특례)·S926(dck는 진입전용·물타기X).
//  ★정책값 provisional — 미래 OOS(0723~24·oos_gates_s924.txt 축2) 통과가 채택 최종조건.
'use strict';
const fs=require('fs');
const mk=process.argv[2], LIMIT=process.argv[3]?parseInt(process.argv[3],10):0;
const snapPath=process.env.SNAP;
const outPath=process.env.OUT||('/tmp/sig/sig_'+mk+'.json');
const _E=(typeof SXE!=='undefined')?SXE:global.SXE;
const _V=(typeof SXVVAL!=='undefined')?SXVVAL:global.SXVVAL;
const _C=(typeof SXC!=='undefined')?SXC:global.SXC;
if(!_E||!_E.scrQuickScore||!_V||!_V._assembleScores||!_C||!_C.unifiedVerdictV2){ console.error('엔진/vv/project_c 미로드'); process.exit(1); }
const snap=JSON.parse(fs.readFileSync(snapPath,'utf8'));
let codes=Object.keys(snap.stocks); if(LIMIT) codes=codes.slice(0,LIMIT);

// [S1050] KR ATR 안전게이트 — 고변동 진입 배제. 근거: crashLift 캐논(KR 1차위험=변동성) + 3-way BT OOS(KR per-trade 개선·US 역효과=KR전용·COIN 무의미).
//   레시피 신호 전용(bullVol은 별도검증 S1041·고변동이 본질이라 미적용). provisional 임계=KR OOS p80 근사 8.5%(라이브 관찰로 튜닝). 끄기=env ATR_GATE=0.
const ATR_GATE_ON = (mk==='kr') && (process.env.ATR_GATE!=='0');
const ATR_GATE_TH = parseFloat(process.env.ATR_GATE_TH||'8.5');

// ── [S1041] 강세 거래량급증 신호 — KR 하락장×강세 + 거래량OSC≥73.31 & VR≥389.41 (검증완료: 발굴풀 전체게이트 + 시간분리 held-out 후반 통과). ──
//   검증 때와 동일 ind(calcAllScreener)로 계산 → qs.ind 필드누락에 의한 조용한 실패 방지. KR 전용(US/COIN 부호 반대). provisional=paper 전진검증 중.
function _ltBear(ind){ try{ if(typeof _ltStr733==='function') return _ltStr733(ind.maAlignLT)==='bear'; var lt=ind&&ind.maAlignLT; return !!(lt&&lt.gateOn&&lt.bearish); }catch(e){ return false; } }
function bullVolSignal(ind){ try{
  if(!ind||!ind.maAlign||!ind.maAlign.bullish) return false;         // 강세(단기 5/20/60 정배열)
  if(!_ltBear(ind)) return false;                                    // 하락장(장기 60/120/200 역배열)
  if(typeof ind.volOsc!=='number'||ind.volOsc<73.31) return false;   // 거래량OSC≥73.31
  if(typeof ind.vr!=='number'||ind.vr<389.41) return false;          // VR(거래량비율)≥389.41
  return true;
}catch(e){ return false; } }

// ── 최신봉 verdict 직접 추출 (vv 검증가드 우회) → {grade, rawScore, dck, dcf, lt} ──
function latestSignal(rows){
  const idx=rows.length-1;
  const qs=_E.scrQuickScore(rows,'day',mk);
  const mom=_E.scoreMomentum(rows,'day',5);
  const sc=_V._assembleScores(qs);
  const verdict=_C.unifiedVerdictV2(null, sc, mom, null); // 등급(표시·evidence용·행동엔 미사용 S948)
  // [S948] 레시피 투표 = 진입 결정 근거 (SSOT=_sxRecipeVotesCore). realK/fakeK = 발동 real/fake 겹침수.
  let votes=0, realK=0, fakeK=0, pure=false;
  try{ const rsig=_sxRecipeVotesCore(mk, qs.ind, rows, idx); if(rsig){ votes=rsig.votes||0; realK=rsig.realK||0; fakeK=rsig.fakeK||0; pure=!!rsig.pure; } }catch(e){}
  let bullVol=false, atrPct=null; try{ const fullInd=(_E.calcAllScreener)?_E.calcAllScreener(rows,'day'):qs.ind; bullVol=bullVolSignal(fullInd); atrPct=(fullInd&&fullInd.atr&&typeof fullInd.atr.pct==='number')?fullInd.atr.pct:null; }catch(e){}  // [S1041] 강세 거래량급증 · [S1050] ATR%(게이트용)
  // [S1180] 레시피 v2(어휘규칙 S1178) — _sxCellSignalCore를 시즌1 판정과 동일하게 호출(qs.ind·같은 봉 idx). 데이터/라이브러리 미로드 시 null(안전).
  //   real-kind hit만 매수 후보(S1102 §8-3: DOWN·FAKE는 어떤 경로로도 매수투표 금지 — down/fake hit은 avoid로 기록만).
  //   strict(강)+soft(일반) 모두 수집(모의 최대관찰·tier 각인) — buy는 strict 우선 → k 내림차 정렬.
  let v2=null;
  try{
    if(typeof _sxCellSignalCore==='function'){
      const cs=_sxCellSignalCore(mk, qs.ind, rows, idx);
      if(cs&&Array.isArray(cs.sig)){
        const hits=cs.sig.filter(s=>s&&s.hit);
        const mapH=s=>({cat:s.cat,tier:s.tier||'strict',k:s.k,kStar:s.kStarN});
        const buy=hits.filter(s=>s.kind==='real').map(mapH)
          .sort((a,b)=>((a.tier==='strict'?0:1)-(b.tier==='strict'?0:1))||(b.k-a.k));
        const avoid=hits.filter(s=>s.kind!=='real').map(s=>Object.assign(mapH(s),{kind:s.kind}));
        if(buy.length||avoid.length) v2={ cell:cs.cell, lbl:cs.lbl||null, buy:buy, avoid:avoid };
      }
    }
  }catch(e){}
  return { grade:verdict.action, rawScore:(qs&&qs.score!=null?qs.score:0), votes, realK, fakeK, pure, dck:realK, dcf:fakeK, lt:(sc&&sc.ltAlign)||'off', bullVol:bullVol, atrPct:atrPct, v2:v2 };
}

// ── [S948] 레시피 기반 진입 정책 — votes≥1 → BUY. 엔진 점수축(등급) 미사용(원천 재료감사: ready/entry/trend/upside 다 약/역전).
//   청산은 워커(이중ATR + MA5×20/N일)가 담당 → 신호는 진입(BUY)만 생성. SELL/HOLD는 실행 안 함(HOLD=무동작).
//   provisional: us 레시피 OOS 로버스트(채택) / kr·coin OOS 미확정(paper 전진검증 중).
function policy(mk, votes, realK, rawScore){
  const rs=(typeof rawScore==='number'?rawScore:0);
  if((votes||0)>=1){
    return { action:'BUY', score:rs, policy:mk+':votes'+votes+'/realK'+realK+'→BUY(레시피)', provisional:(mk!=='us') };
  }
  return { action:'HOLD', score:0, policy:mk+':votes0→HOLD(레시피 미발동)', provisional:false };
}

let signals=[], errs=[], skip=0;
const t0=Date.now();
codes.forEach((c,i)=>{
  const raw=snap.stocks[c].rows;
  if(!raw||raw.length<160){ skip++; return; }
  const rows=raw.map(r=>Array.isArray(r)?({date:r[0],open:r[1],o:r[1],high:r[2],h:r[2],low:r[3],l:r[3],close:r[4],c:r[4],volume:r[5],v:r[5]}):r);
  let sig=null;
  try{ sig=latestSignal(rows); }catch(e){ errs.push(c+':'+(e&&e.message)); return; }
  const {grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, bullVol, atrPct, v2}=sig;
  let P=policy(mk, votes, realK, rawScore);
  let src=(P.action==='BUY')?'recipe':null;
  // [S1041] 강세 거래량급증 편입 — votes-BUY(약세반등)가 아닐 때만 별도 BUY(상호배타). KR 전용. src=bullVol 태그(가계부 전략구분용).
  if(P.action!=='BUY' && bullVol && mk==='kr'){ P={ action:'BUY', score:(rawScore||0), policy:'kr:bullVol(하락장×강세·거래량OSC≥73.31&VR≥389.41)→BUY', provisional:true }; src='bullVol'; }
  // [S1180] 레시피 v2 진입 — 레거시·bullVol 미발동일 때만 별도 BUY(상호배타 우선순위: recipe > bullVol > v2 · 검증강도순).
  //   동시발동 정보는 v2 필드가 항상 실려 관찰 가능(레거시 BUY + v2 hit = 겹침). score는 워커 필터(score>0) 통과용 max(raw,1).
  //   ATR게이트(S1050)는 src==='recipe' 전용이라 v2엔 미적용(모의 최대관찰) — atrPct는 기록되므로 사후 분석 가능.
  if(P.action!=='BUY' && v2 && v2.buy && v2.buy.length){
    const top=v2.buy[0];
    P={ action:'BUY', score:Math.max((typeof rawScore==='number'?rawScore:0),1), policy:mk+':v2 '+(v2.lbl||v2.cell)+' '+top.cat+'·'+(top.tier==='strict'?'강':'일반')+' k'+top.k+'/'+top.kStar+'→BUY(어휘규칙 S1178)', provisional:true };
    src='v2';
  }
  // [S1050] KR ATR 안전게이트 — 레시피 BUY이고 ATR% 초과 시 진입 억제(→HOLD). bullVol 미적용(별도검증·고변동 본질). src 유지(원 신호 기록).
  let atrGate=false;
  if(ATR_GATE_ON && P.action==='BUY' && src==='recipe' && atrPct!=null && atrPct>ATR_GATE_TH){ atrGate=true; P={ action:'HOLD', score:0, policy:'kr:ATR게이트(ATR%'+atrPct.toFixed(1)+'>'+ATR_GATE_TH+')→진입억제', provisional:true }; }
  signals.push({ code:c, name:(snap.stocks[c]&&snap.stocks[c].name)||c, grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, bullVol:!!bullVol, v2:(v2||null), src:src, action:P.action, score:P.score, policy:P.policy, provisional:P.provisional, atrGate:atrGate, atrPct:(atrPct!=null?+atrPct.toFixed(2):null), barDate:(rows[rows.length-1]&&rows[rows.length-1].date)||null, close:(rows[rows.length-1]&&+rows[rows.length-1].close)||null }); // [S945]name [S948]votes [S1041]bullVol/src [S1083]close=금액균등 사이징용(워커 시세조회 없이) [S1180]v2=어휘규칙 판정(발동 시)
  if((i+1)%40===0) console.error('  '+(i+1)+'/'+codes.length+' ('+((Date.now()-t0)/1000|0)+'s)');
});
// 요약
const cnt=(f)=>signals.filter(f).length;
const ledger={ schema:'sx_signal_ledger_v1', mkt:mk, asof:snap.baseDate, generated:new Date().toISOString(),
  universe:codes.length, evaluated:signals.length, skipped:skip, errN:errs.length, errs:errs.slice(0,5),
  summary:{ BUY:cnt(s=>s.action==='BUY'), bullVolBUY:cnt(s=>s.src==='bullVol'), v2BUY:cnt(s=>s.src==='v2'), v2Overlap:cnt(s=>s.src==='recipe'&&s.v2&&s.v2.buy&&s.v2.buy.length>0), v2AvoidHit:cnt(s=>s.v2&&s.v2.avoid&&s.v2.avoid.length>0), atrGated:cnt(s=>s.atrGate), HOLD:cnt(s=>s.action==='HOLD'), SELL:cnt(s=>s.action==='SELL'), provisional:cnt(s=>s.provisional), // [S1180] v2BUY=v2 단독진입 · v2Overlap=레거시BUY∩v2hit(겹침 관찰) · v2AvoidHit=down/fake hit(기록만)
            votes:{ v1:cnt(s=>s.votes===1), v2:cnt(s=>s.votes===2), v3:cnt(s=>s.votes===3), v4:cnt(s=>s.votes>=4) }, // [S948] 레시피 투표 분포
            grade:{ 매수:cnt(s=>s.grade==='매수'), 관심:cnt(s=>s.grade==='관심'), 관망:cnt(s=>s.grade==='관망'), 회피:cnt(s=>s.grade==='회피') } },
  signals };
fs.writeFileSync(outPath, JSON.stringify(ledger,null,1));
console.error('DONE sig '+mk+' asof='+snap.baseDate+': 평가 '+signals.length+'/'+codes.length+' | BUY '+ledger.summary.BUY+'(bullVol '+ledger.summary.bullVolBUY+'·v2 '+ledger.summary.v2BUY+'·겹침 '+ledger.summary.v2Overlap+') atrGated '+ledger.summary.atrGated+' HOLD '+ledger.summary.HOLD+' SELL '+ledger.summary.SELL+' (prov '+ledger.summary.provisional+') err='+errs.length+' '+((Date.now()-t0)/1000|0)+'s → '+outPath);
