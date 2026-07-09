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
  const verdict=_C.unifiedVerdictV2(null, sc, mom, null); // 등급(표시·evidence용·행동엔 미사용 S948)
  // [S948] 레시피 투표 = 진입 결정 근거 (SSOT=_sxRecipeVotesCore). realK/fakeK = 발동 real/fake 겹침수.
  let votes=0, realK=0, fakeK=0, pure=false;
  try{ const rsig=_sxRecipeVotesCore(mk, qs.ind, rows, idx); if(rsig){ votes=rsig.votes||0; realK=rsig.realK||0; fakeK=rsig.fakeK||0; pure=!!rsig.pure; } }catch(e){}
  return { grade:verdict.action, rawScore:(qs&&qs.score!=null?qs.score:0), votes, realK, fakeK, pure, dck:realK, dcf:fakeK, lt:(sc&&sc.ltAlign)||'off' };
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
  const {grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt}=sig;
  const P=policy(mk, votes, realK, rawScore);
  signals.push({ code:c, name:(snap.stocks[c]&&snap.stocks[c].name)||c, grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, action:P.action, score:P.score, policy:P.policy, provisional:P.provisional, barDate:(rows[rows.length-1]&&rows[rows.length-1].date)||null }); // [S945]name [S948]votes기반
  if((i+1)%40===0) console.error('  '+(i+1)+'/'+codes.length+' ('+((Date.now()-t0)/1000|0)+'s)');
});
// 요약
const cnt=(f)=>signals.filter(f).length;
const ledger={ schema:'sx_signal_ledger_v1', mkt:mk, asof:snap.baseDate, generated:new Date().toISOString(),
  universe:codes.length, evaluated:signals.length, skipped:skip, errN:errs.length, errs:errs.slice(0,5),
  summary:{ BUY:cnt(s=>s.action==='BUY'), HOLD:cnt(s=>s.action==='HOLD'), SELL:cnt(s=>s.action==='SELL'), provisional:cnt(s=>s.provisional),
            votes:{ v1:cnt(s=>s.votes===1), v2:cnt(s=>s.votes===2), v3:cnt(s=>s.votes===3), v4:cnt(s=>s.votes>=4) }, // [S948] 레시피 투표 분포
            grade:{ 매수:cnt(s=>s.grade==='매수'), 관심:cnt(s=>s.grade==='관심'), 관망:cnt(s=>s.grade==='관망'), 회피:cnt(s=>s.grade==='회피') } },
  signals };
fs.writeFileSync(outPath, JSON.stringify(ledger,null,1));
console.error('DONE sig '+mk+' asof='+snap.baseDate+': 평가 '+signals.length+'/'+codes.length+' | BUY '+ledger.summary.BUY+' HOLD '+ledger.summary.HOLD+' SELL '+ledger.summary.SELL+' (prov '+ledger.summary.provisional+') err='+errs.length+' '+((Date.now()-t0)/1000|0)+'s → '+outPath);
