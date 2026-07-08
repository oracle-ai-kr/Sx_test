// [S927] SX 신호생성기 (시즌2 두뇌 출력) — 스냅 각 종목 최신봉 verdict → 정책레이어 → 신호원장 JSON
//  전역(cat 선행): SXVVAL(run·_assembleScores) · SXE · _C(unifiedVerdictV2 내부호출) · recipe_core
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

// ── 최신봉 verdict 직접 추출 (vv 검증가드 우회) → {grade, rawScore, dck, dcf, lt} ──
function latestSignal(rows){
  const idx=rows.length-1;
  const qs=_E.scrQuickScore(rows,'day',mk);
  const mom=_E.scoreMomentum(rows,'day',5);
  const sc=_V._assembleScores(qs);
  const verdict=_C.unifiedVerdictV2(null, sc, mom, null); // btState=null → 비보유 진입등급
  let dck=0,dcf=0;
  const f=(qs&&qs.ind)?_extractFeats733(qs.ind,rows,idx):null;
  if(f){ const lt=_ltOf(qs.ind), mb=!!(qs.ind.maAlign&&qs.ind.maAlign.bullish), set=RECIPES_BY_MKT[mk]||RECIPES_BY_MKT.kr;
    for(let i=0;i<set.length;i++){ const r=set[i]; if(r.pool==='deadcat'&&_fires(r,f,lt,mb)){ if(r.kind==='real')dck++; else dcf++; } } }
  return { grade:verdict.action, rawScore:(qs&&qs.score!=null?qs.score:0), dck, dcf, lt:(sc&&sc.ltAlign)||'off', passCount:verdict.passCount };
}

// ── 정책레이어 (등급 → {action, score, policy, provisional}) ──
//  score: BUY 사이징용(quant_trader _signal_scale 0.5~1.5 매핑 입력). rawScore(0~100) 기반.
function policy(mk, grade, rawScore, dck, dcf){
  const rs = (typeof rawScore==='number'?rawScore:0);
  if(mk==='kr'){
    if(grade==='매수') return {action:'BUY', score:rs, policy:'kr:매수→BUY(최고신뢰·§1)', provisional:false};
    if(grade==='회피') return {action:'SELL', score:0, policy:'kr:회피→SELL(dck특례無·§3 kr미채택)', provisional:false};
    return {action:'HOLD', score:0, policy:'kr:'+grade+'→HOLD', provisional:false};
  }
  if(mk==='us'){
    if(grade==='매수') return {action:'BUY', score:Math.round(rs*0.7), policy:'us:매수→BUY(하향0.7·§1 상단역전)', provisional:true};
    if(grade==='회피'){
      if(dck>=2 && dcf<dck) return {action:'HOLD', score:0, policy:'us:회피+dck≥2&dcf<dck→HOLD(반등후보·②)', provisional:true};
      return {action:'SELL', score:0, policy:'us:회피→SELL', provisional:false};
    }
    return {action:'HOLD', score:0, policy:'us:'+grade+'→HOLD', provisional:false};
  }
  // coin
  if(grade==='매수') return {action:'BUY', score:rs, policy:'coin:매수→BUY(보수)', provisional:true};
  if(grade==='회피') return {action:'SELL', score:0, policy:'coin:회피→SELL(dck엣지無·②)', provisional:false};
  return {action:'HOLD', score:0, policy:'coin:'+grade+'→HOLD', provisional:false};
}

let signals=[], errs=[], skip=0;
const t0=Date.now();
codes.forEach((c,i)=>{
  const raw=snap.stocks[c].rows;
  if(!raw||raw.length<160){ skip++; return; }
  const rows=raw.map(r=>Array.isArray(r)?({date:r[0],open:r[1],o:r[1],high:r[2],h:r[2],low:r[3],l:r[3],close:r[4],c:r[4],volume:r[5],v:r[5]}):r);
  let sig=null;
  try{ sig=latestSignal(rows); }catch(e){ errs.push(c+':'+(e&&e.message)); return; }
  const {grade, rawScore, dck, dcf, lt}=sig;
  const P=policy(mk, grade, rawScore, dck, dcf);
  signals.push({ code:c, grade, rawScore, dck, dcf, lt, action:P.action, score:P.score, policy:P.policy, provisional:P.provisional, barDate:(rows[rows.length-1]&&rows[rows.length-1].date)||null });
  if((i+1)%40===0) console.error('  '+(i+1)+'/'+codes.length+' ('+((Date.now()-t0)/1000|0)+'s)');
});
// 요약
const cnt=(f)=>signals.filter(f).length;
const ledger={ schema:'sx_signal_ledger_v1', mkt:mk, asof:snap.baseDate, generated:new Date().toISOString(),
  universe:codes.length, evaluated:signals.length, skipped:skip, errN:errs.length, errs:errs.slice(0,5),
  summary:{ BUY:cnt(s=>s.action==='BUY'), HOLD:cnt(s=>s.action==='HOLD'), SELL:cnt(s=>s.action==='SELL'), provisional:cnt(s=>s.provisional),
            grade:{ 매수:cnt(s=>s.grade==='매수'), 관심:cnt(s=>s.grade==='관심'), 관망:cnt(s=>s.grade==='관망'), 회피:cnt(s=>s.grade==='회피') } },
  signals };
fs.writeFileSync(outPath, JSON.stringify(ledger,null,1));
console.error('DONE sig '+mk+' asof='+snap.baseDate+': 평가 '+signals.length+'/'+codes.length+' | BUY '+ledger.summary.BUY+' HOLD '+ledger.summary.HOLD+' SELL '+ledger.summary.SELL+' (prov '+ledger.summary.provisional+') err='+errs.length+' '+((Date.now()-t0)/1000|0)+'s → '+outPath);
