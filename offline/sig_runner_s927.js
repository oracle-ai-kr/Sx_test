// [S927] SX 신호생성기 (시즌2 두뇌 출력) — 스냅 각 종목 최신봉 verdict → 정책레이어 → 신호원장 JSON
//  전역(cat 선행): SXVVAL(run·_assembleScores) · SXE · _C(unifiedVerdictV2 내부호출) · recipe_core
//  [S1180] +SXFeatureLib(sx_feature_library.js)·SX_CELL_DATA(sx_cell_data.js) — 레시피 v2(어휘규칙) 판정용. 미로드 시 v2=null(레거시만 동작·안전).
//  [S1651] 코인 신호에 univ('pool'=커밋 스냅 측정 풀 · 'ext'=업비트 자동 편입)와 tv30(30 완성봉 중위 거래대금·원)을 싣는다 — 빌더 동적 스냅이 준 값 그대로(계산 0).
//    폴백 스냅(커밋본·구 빌더)이면 univ 'pool' · tv30 null → 워커 정렬은 종전과 같은 답. 원장에 ledger.univ(유니버스 메타)·summary.extN/extBUY. KR·US는 키 추가 0.
//  [S1632] US 분기 = 카드 사진1 세트(DECL §14) — 크로스(라우팅 없음=카드 3×3 OFF)·BB회귀(카드 range 진입식) 신호 + 귀속 BB회귀>크로스>레거시>칸real. KR·코인 원장 바이트 동일.
//  [S1209] +칸 각인 — 모든 신호에 진입 시점 칸(cell/cellLbl)을 hit 여부와 무관하게 기록(3×3 진입 분포 관찰용). 미로드 시 cell=null(안전).
//  최신봉 = V.run(h=0, warmup=n-4, target=5) 후 e최대 레코드. dck/dcf는 cv2rec 훅(§3 동일).
//  정책레이어 = 등급→{action,score} 시장별. 근거 §1(시장분기)·②(US 회피특례)·S926(dck는 진입전용·물타기X).
//  ★정책값 provisional — 미래 OOS(0723~24·oos_gates_s924.txt 축2) 통과가 채택 최종조건.
//  [S1762] 🔊 bullVol 원자(PREREG_S1762) — 모든 행에 bv{a,r3,r2,o,v}(단기 정배열 · 세 줄 국면 · 두 줄 국면 · 급증 % · VR) · 설정 무관 · 국면 비트·문턱은 워커가 댄다. 종전 `bullVol` 플래그는 그대로.
//  [S1761] 🌀 BB회귀 원자(PREREG_S1761) — 모든 행에 rgL(마지막 하단 조건 봉까지 봉 수 · ≤30)·rgRb(그 뒤 첫 반등 봉) · 스펙 bp{af,mx}·bpKey 가 있으면 bp{k,f}(전용 PSAR 하락→상승) · 서명 세 토막. 없으면 키 추가 0.
//  [S1759] 📅 월봉 구간 원자(PREREG_S1759) — 모든 행에 mz('up'·'dn'·'mid'·'na' = 마지막 확정 봉의 월봉 MA5×MA10+종가 위치). 설정에 안 매여 스펙 없이 늘 싣는다 · 다른 바이트는 S1758 그대로.
//  [S1758] 🔵 PSAR 방향 원자(PREREG_S1758) — 스펙에 ps{af,mx}·psKey 가 있으면 행에 ps{k,u}·원장에 ps·sig 를 싣는다. 없으면 키 추가 0.
//  [S1757] 📈 크로스 축 원자(PREREG_S1757) — env SX_SPEC(워커 /sx/autotrade/spec 응답)이 축(🧬TRIX·🎚️SMI·임의 MA쌍)을 주면 행에 xa{k,g,d,s,r}·원장에 ax 를 싣는다. 없으면 키 추가 0(바이트 동일).
'use strict';
const fs=require('fs');
const mk=process.argv[2], LIMIT=process.argv[3]?parseInt(process.argv[3],10):0;
// [S1663] 코인 4시간봉 트랙 — mk='coin4h'(사용자 결정 2026-09-23 "코인만 4시간 · 일봉과 별도 탭"). 엔진·레시피·칸은 시장 키 'coin'으로 부른다(mkE) — 시즌1 4시간 카드도
//   같은 엔진을 'day' 파라미터 그대로 4시간 rows에 태운다(sx_recipe_signal `_calc` · S1657) ⇒ 이 러너도 rows만 4시간이고 계산은 같다. 원장 mkt·정책 문구·출력 파일명은 coin4h.
const mkE=(mk==='coin4h')?'coin':mk;   // 엔진 시장 키(레시피 세트·칸 규칙·정책 분기)
const IS_COIN=(mk==='coin'||mk==='coin4h');
const snapPath=process.env.SNAP;
const outPath=process.env.OUT||('/tmp/sig/sig_'+mk+'.json');
const _E=(typeof SXE!=='undefined')?SXE:global.SXE;
_E._workerMarket=mkE;   /* [S1725] ★지표 파라미터를 그 시장 것으로 — 종전엔 미설정이라 `_getCurrentMarketKey()` 가 'kr' 로 떨어져 코인·US 도 KR 파라미터(BB 14·1.9σ)로 돌았다(시즌1 화면은 crypto 9·2.1σ / us 20·2.0σ · MEAS PREREG_S1725 §2) */
if(typeof _sxLegacyPoolCore!=='function' || typeof _sxVotesLadder!=='function') throw new Error('[S1725] sx_recipe_core.js 가 옛것(_sxLegacyPoolCore·_sxVotesLadder 없음) — 공용 코어를 먼저 배포. 조용히 레거시 0으로 돌지 않는다(규율 9)');   /* [S1725] 배포 순서 가드 — 코어 없이 돌면 try/catch 가 삼켜 레거시가 전부 0이 된다 */
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
// ── [S1396] 크로스 진입(provisional·paper 전진검증) — MA5×20 골든크로스(마지막 완성봉) + 장기 60/120/200 정배 라우팅 내장 ──
//   식은 시즌1 _stratBt·PREREG_S1392 하네스와 동일하게 종가 SMA 직접 계산 — maAlignLT 미사용(게이트 의미 차이 가능성 차단·측정 정합 우선).
//   근거: PREREG_S1392 A부 — 크로스 에피소드 3창 전부 양(+9.59/+2.86/+3.47·4종 청산 고정) · 라우팅 Δ 방향 3/3(+4.60/+2.09/+0.31).
//   ★전진 판정 게이트(사전선언·사후 변경 금지): src='cross' 완성거래 N≥20 도달 시점에 건당 기대값>0 AND 승률≥35% — 미충족이면 본 편입 OFF.
//   BB회귀는 보류(S1392: 3창 평균 ~0에 신호 대량 — 자본 분산·수수료 출혈) · 재론=정의 개선 후 재측정 통과 시.
function crossSignal(rows){
  try{
    var n=rows.length; if(n<201) return false;
    var cl=rows.map(function(r){ return +((r.close!=null)?r.close:r.c); });
    var sm=function(i,len){ if(i<len-1) return null; var t=0; for(var k=i-len+1;k<=i;k++){ var v=cl[k]; if(!(v>0)) return null; t+=v; } return t/len; };
    var i=n-1;
    var s5=sm(i,5), s20=sm(i,20), p5=sm(i-1,5), p20=sm(i-1,20);
    if(!(s5!=null&&s20!=null&&p5!=null&&p20!=null&&s5>s20&&p5<=p20)) return false;
    var m60=sm(i,60), m120=sm(i,120), m200=sm(i,200);
    return !!(m60!=null&&m120!=null&&m200!=null&&m60>m120&&m120>m200);
  }catch(e){ return false; }
}
// [S1663] 순수 골든크로스(라우팅 없음) — 시즌1 카드 `gc`(maS[i]>maL[i] && maS[i-1]<=maL[i-1] · 종가 SMA)와 같은 식. crossSignal의 앞 절과 같고 60/120/200 절만 없다.
function crossPlain(rows,s,l){
  try{
    var n=rows.length; if(n<l+2) return false;
    var cl=rows.map(function(r){ return +((r.close!=null)?r.close:r.c); });
    var sm=function(i,len){ if(i<len-1) return null; var t=0; for(var k=i-len+1;k<=i;k++){ var v=cl[k]; if(!(v>0)) return null; t+=v; } return t/len; };
    var i=n-1, a=sm(i,s), b=sm(i,l), pa=sm(i-1,s), pb=sm(i-1,l);
    return !!(a!=null&&b!=null&&pa!=null&&pb!=null&&a>b&&pa<=pb);
  }catch(e){ return false; }
}
// ═══ [S1709] 시즌1 sx_render.js **원문 복사**(글자 그대로 · 배터리가 대조) — 크로스 게이트 원자용 ═══
function _trSma(a,p){ const o=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=p) s-=a[i-p]; if(i>=p-1) o[i]=s/p; } return o; }
function _trEma(a,p){ const o=new Array(a.length).fill(null); const k=2/(p+1); let e=null,cnt=0,acc=0; for(let i=0;i<a.length;i++){ const v=a[i]; if(v==null){ o[i]=null; continue; } if(e==null){ acc+=v; cnt++; if(cnt>=p){ e=acc/p; o[i]=e; } } else { e=v*k+e*(1-k); o[i]=e; } } return o; }
function _trTrix(close,p,sp){
  const n=close.length, line=new Array(n).fill(null), sig=new Array(n).fill(null);
  const _p=Math.max(1,Math.min(400,Math.round(+p||15))), _sp=Math.max(1,Math.min(400,Math.round(+sp||9)));
  if(!n) return {line:line, sig:sig, p:_p, sp:_sp, first:-1};
  const e1=_trEma(close,_p), e2=_trEma(e1,_p), e3=_trEma(e2,_p);
  for(let i=1;i<n;i++){ const a=e3[i-1], b=e3[i]; if(a==null||b==null||a===0) continue; line[i]=((b-a)/a)*100; }
  let f=-1; for(let i=0;i<n;i++){ if(line[i]!=null){ f=i; break; } }
  if(f>=0){ let s=0; for(let i=f;i<n;i++){ s+=line[i]; if(i-f>=_sp) s-=line[i-_sp]; if(i-f>=_sp-1) sig[i]=s/_sp; } }
  let first=-1; for(let i=0;i<n;i++){ if(line[i]!=null&&sig[i]!=null){ first=i; break; } }
  return {line:line, sig:sig, p:_p, sp:_sp, first:first};
}
// [S1709] 크로스 게이트 원자 3종 — 마지막 봉(i=n-1)에서 잰다. 시즌1 `_coinSlopeUp`·`_trGateOk`와 같은 식·같은 웜업 규약(null=막음).
// [S1711] 진입쌍 **정배열 상태** — 시즌1 재진입 조건 `maS[i]>maL[i]`(교차가 아니라 상태). `crossPlain`과 같은 `sm()` 식의 부등호 하나 · 봉 부족=false.
function maState(rows,s,l){
  try{
    var n=rows.length; if(n<l+1) return false;
    var cl=rows.map(function(r){ return +((r.close!=null)?r.close:r.c); });
    var sm=function(i,len){ if(i<len-1) return null; var t=0; for(var k=i-len+1;k<=i;k++){ var v=cl[k]; if(!(v>0)) return null; t+=v; } return t/len; };
    var i=n-1, a=sm(i,s), b=sm(i,l);
    return !!(a!=null&&b!=null&&a>b);
  }catch(e){ return false; }
}
function gateAtoms(rows){
  try{
    var cl=rows.map(function(r){ return +((r.close!=null)?r.close:r.c); }), i=cl.length-1;
    if(i<1) return { g60up:false, gMa1060:false, gTx1060:false };
    var m60=_trSma(cl,60), m10=_trSma(cl,10), tx=_trTrix(cl,10,60);
    return {
      g60up:   !!(i>=10 && m60[i]!=null && m60[i-10]!=null && m60[i]>m60[i-10]),
      gMa1060: !!(m10[i]!=null && m60[i]!=null && m10[i]>m60[i]),
      gTx1060: !!(tx.line[i]!=null && tx.sig[i]!=null && tx.line[i]>tx.sig[i])
    };
  }catch(e){ return { g60up:false, gMa1060:false, gTx1060:false }; }
}
// ═══ [S1757] 📈 크로스 축 원자(스펙 왕복 · PREREG_S1757) ═══
//   시즌1 sx_render.js `_trSmi` **원문 복사**(글자 그대로 · 배터리가 대조). `_trTrix`·`_trSma`·`_trEma` 는 위 S1709 복사본을 그대로 쓴다.
function _trSmi(rows,k,s,ds,d){
  const n=rows.length, line=new Array(n).fill(null); let sig=new Array(n).fill(null);
  const _k=Math.max(2,Math.min(400,Math.round(+k||10))), _s=Math.max(1,Math.min(100,Math.round(+s||3))), _ds=Math.max(1,Math.min(100,Math.round(+ds||3))), _d=Math.max(1,Math.min(400,Math.round(+d||10)));
  if(!n) return {line:line, sig:sig, k:_k, s:_s, ds:_ds, d:_d, first:-1};
  const hi=rows.map(r=>+(r.high!=null?r.high:r.h)), lo=rows.map(r=>+(r.low!=null?r.low:r.l)), cl=rows.map(r=>+(r.close!=null?r.close:r.c));
  const M=new Array(n).fill(null), R=new Array(n).fill(null);
  for(let i=_k-1;i<n;i++){ let hh=-Infinity, ll=Infinity; for(let q=i-_k+1;q<=i;q++){ if(hi[q]>hh) hh=hi[q]; if(lo[q]<ll) ll=lo[q]; } if(!isFinite(hh)||!isFinite(ll)||!isFinite(cl[i])) continue; M[i]=cl[i]-(hh+ll)/2; R[i]=hh-ll; }
  const e=_trEma(_trEma(M,_s),_ds), f=_trEma(_trEma(R,_s),_ds);
  for(let i=0;i<n;i++){ if(e[i]!=null && f[i]!=null && f[i]>0) line[i]=100*e[i]/(f[i]/2); }
  sig=_trEma(line,_d);
  let first=-1; for(let i=0;i<n;i++){ if(line[i]!=null&&sig[i]!=null){ first=i; break; } }
  return {line:line, sig:sig, k:_k, s:_s, ds:_ds, d:_d, first:first};
}
//   스펙 = 워커 GET /sx/autotrade/spec 응답 { ok, mkt, ax:{t,e,x,r,sm}, key } — 푸시 스크립트가 env SX_SPEC 로 넘긴다. 없음·깨짐·축 없음 = null(원자 0 = 종전 원장과 같은 바이트).
//   key 는 워커가 만든 문자열을 **그대로** 싣는다(러너가 다시 만들지 않는다 — 두 벌이면 어긋난다). 워커는 행의 xa.k 가 지금 설정의 키와 같을 때만 그 원자를 읽는다.
const _axPairOk=(p)=>Array.isArray(p)&&p.length===2&&isFinite(+p[0])&&isFinite(+p[1])&&+p[0]>=1&&+p[1]>=1;
const AX=(function(){ try{ const raw=process.env.SX_SPEC; if(!raw) return null; const o=JSON.parse(raw), a=o&&o.ax, k=o&&o.key; if(!a||typeof a!=='object'||typeof k!=='string'||!k) return null;
    if(['trix','smi','ma'].indexOf(a.t)<0||!_axPairOk(a.e)||!_axPairOk(a.x)||!_axPairOk(a.r)) return null;
    if(a.t==='smi'&&!_axPairOk(a.sm)) return null;
    const P=(p)=>[Math.round(+p[0]),Math.round(+p[1])];
    return { t:a.t, e:P(a.e), x:P(a.x), r:P(a.r), sm:(a.t==='smi')?P(a.sm):null, key:k }; }catch(e){ return null; } })();
// 쌍 p 의 선·시그널 — 시즌1 `_stratBt` 가 축마다 부르는 함수와 같다(🧬 `_trTrix(close,p,sp)` · 🎚️ `_trSmi(rows,k,s,ds,d)` · MA `_trSma(close,s)`·`_trSma(close,l)`)
function axSeries(rows, close, A, p){ if(A.t==='smi') return _trSmi(rows,p[0],A.sm[0],A.sm[1],p[1]); if(A.t==='trix') return _trTrix(close,p[0],p[1]); return { line:_trSma(close,p[0]), sig:_trSma(close,p[1]) }; }
// 마지막 봉(i=n-1)의 원자 — 시즌1 식 그대로: g = 진입쌍 gc · d = 청산쌍 dx · s = 진입쌍 선>시그널(재진입 조건의 상태) · r = 재진입쌍 gc. 값이 없으면(웜업) 0.
function axAtoms(rows, A){
  try{
    const close=rows.map(r=>+(r.close!=null?r.close:r.c)), i=rows.length-1, same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
    const E=axSeries(rows,close,A,A.e), X=same(A.x,A.e)?E:axSeries(rows,close,A,A.x), R=same(A.r,A.e)?E:axSeries(rows,close,A,A.r);
    const ok=(S)=>(i>0&&S.line[i]!=null&&S.sig[i]!=null&&S.line[i-1]!=null&&S.sig[i-1]!=null);
    return { k:A.key,
      g:(ok(E)&&E.line[i]>E.sig[i]&&E.line[i-1]<=E.sig[i-1])?1:0,
      d:(ok(X)&&X.line[i]<X.sig[i]&&X.line[i-1]>=X.sig[i-1])?1:0,
      s:(E.line[i]!=null&&E.sig[i]!=null&&E.line[i]>E.sig[i])?1:0,
      r:(ok(R)&&R.line[i]>R.sig[i]&&R.line[i-1]<=R.sig[i-1])?1:0 };
  }catch(e){ return null; }   // 계산 실패 = 원자 없음(워커가 대기로 읽는다 — 0 으로 지어내지 않는다)
}
// ═══ [S1758] 🔵 PSAR 방향 원자(PREREG_S1758) ═══
//   시즌1 sx_render.js `_sxPsarSeries` **원문 복사**(글자 그대로 · 배터리가 대조) — 재료 「PSAR 상승/하락」·전략 조합 🔵 게이트가 읽는 바로 그 식(가속 = 시작값이자 증가폭).
function _sxPsarSeries(rows, close, step, mx){ const n=rows.length, up=new Array(n).fill(null), sr=new Array(n).fill(null); if(n<3) return {up:up, sar:sr};
  const hi=rows.map((r,i)=>+(r.high!=null?r.high:(r.h!=null?r.h:close[i]))), lo=rows.map((r,i)=>+(r.low!=null?r.low:(r.l!=null?r.l:close[i])));
  const s0=Math.min(step,mx); let isUp=close[1]>close[0], sar=isUp?lo[0]:hi[0], ep=isUp?hi[1]:lo[1], af=s0;
  for(let i=2;i<n;i++){ sar=sar+af*(ep-sar);
    if(isUp){ if(lo[i]<sar){ isUp=false; sar=ep; ep=lo[i]; af=s0; } else { if(hi[i]>ep){ ep=hi[i]; af=Math.min(af+step,mx); } } }
    else { if(hi[i]>sar){ isUp=true; sar=ep; ep=hi[i]; af=s0; } else { if(lo[i]<ep){ ep=lo[i]; af=Math.min(af+step,mx); } } }
    up[i]=isUp; sr[i]=sar; }
  return {up:up, sar:sr}; }
//   스펙의 ps{af,mx}·psKey(워커가 만든 문자열 그대로) — 없음·깨짐 = null(원자 0). sig = 축 키와 PSAR 키를 묶은 서명(원장에 그대로 싣는다).
const _SPEC_O=(function(){ try{ const raw=process.env.SX_SPEC; if(!raw) return null; const o=JSON.parse(raw); return (o&&typeof o==='object')?o:null; }catch(e){ return null; } })();
const PS=(function(){ const p=_SPEC_O&&_SPEC_O.ps, k=_SPEC_O&&_SPEC_O.psKey; if(!p||typeof p!=='object'||typeof k!=='string'||!k) return null; const af=+p.af, mx=+p.mx; if(!(af>0)||!(mx>0)||!isFinite(af)||!isFinite(mx)) return null; return { af:af, mx:mx, key:k }; })();
const SPEC_SIG=(_SPEC_O&&typeof _SPEC_O.sig==='string'&&_SPEC_O.sig&&(AX||PS||(_SPEC_O.bp&&_SPEC_O.bpKey)))?_SPEC_O.sig:null;   /* [S1761] bp 만 있는 스펙도 서명을 싣는다 */
// 마지막 봉의 방향 — up[n-1] 이 null(봉 3개 미만)이면 원자 없음(지어내지 않는다)
function psAtom(rows, P){ try{ const close=rows.map(r=>+(r.close!=null?r.close:r.c)); const u=_sxPsarSeries(rows, close, P.af, P.mx).up[rows.length-1]; return (u==null)?null:{ k:P.key, u:(u?1:0) }; }catch(e){ return null; } }
// ═══ [S1759] 📅 월봉 구간 원자(PREREG_S1759) ═══
//   시즌1 sx_render.js `_sxYmKey`·`_sxMonthZones` **원문 복사**(글자 그대로 · 배터리가 대조) — 전략 조합 📅 구간별 배수가 읽는 바로 그 식(월봉 = 일봉을 연-월로 묶음 · 진행 중인 달은 그 봉까지 · 월 10개 미만 null).
function _sxYmKey(r){ const d=(r&&(r.date!=null?r.date:r.t)); if(typeof d==='string'){ return /^\d{8}/.test(d)?(d.slice(0,4)+'-'+d.slice(4,6)):d.slice(0,7); } if(typeof d==='number'&&isFinite(d)){ if(d>=19000101&&d<=21001231){ const t=String(Math.round(d)); return t.slice(0,4)+'-'+t.slice(4,6); } return new Date(d>1e12?d:d*1000).toISOString().slice(0,7); } return ''; }
function _sxMonthZones(rows, close){ const n=rows.length, out=new Array(n), mc=[]; let mk=null;
  for(let i=0;i<n;i++){ const k=_sxYmKey(rows[i]); if(k!==mk){ mc.push(close[i]); mk=k; } else mc[mc.length-1]=close[i];
    if(mc.length>=10){ let s5=0,s10=0; for(let q=1;q<=10;q++){ const v=mc[mc.length-q]; s10+=v; if(q<=5) s5+=v; } s5/=5; s10/=10; const c=close[i]; out[i]=(s5>s10&&c>s5)?'up':((s5<s10&&c<s5)?'dn':'mid'); } else out[i]=null; }
  return out; }
//   마지막 봉의 구간 — 설정에 안 매이는 값이라 스펙·키가 없다. null(월 10개 미만 · 4H 는 늘)은 'na' 로 적어 「원자 없음」과 가른다(워커: 'na' = 혼조 칸 · 없음 = 단일 배수).
function mzAtom(rows){ try{ const close=rows.map(r=>+(r.close!=null?r.close:r.c)); const z=_sxMonthZones(rows, close)[rows.length-1]; return (z==='up'||z==='dn'||z==='mid')?z:'na'; }catch(e){ return null; } }
// ═══ [S1761] 🌀 BB회귀 원자(PREREG_S1761) ═══
//   하단 조건 열 = `rangeSignalUS` 와 같은 줄(시즌1 `_bbCond` · 횡보 && %B≤0.2 && 이격<−8%) · 시즌1 `_bbSigA` 루프(S1749)의 lc·seen 을 마지막 봉까지 돌린다:
//     rgL = i−lc(lc = 마지막 조건 봉 · 이 봉 포함 · 30 넘으면 없음 = 어떤 대기(≤30)에도 못 든다) · rgRb = 조건 봉이 아닌 이 봉이 lc 뒤 **첫** 반등 봉(close[i]>close[i−1])인가(늘 싣는다 — 워커·카드가 「러너가 이 원자를 내는가」를 이것으로 본다).
//   방식 1(첫 반등 봉) 신호 = rgRb && rgL<대기 · 방식 2(PSAR 전환) 신호 = bp.f && rgL<대기 — 대기 값은 워커가 넣는다(설정을 바꿔도 러너를 다시 안 돌린다).
function rangeAtoms(rows){ try{
    const n=rows.length; if(n<2) return null;
    const close=rows.map(r=>+(r.close!=null?r.close:r.c));
    const maR60=_usTrSma(close,60), maR120=_usTrSma(close,120), maR200=_usTrSma(close,200);
    const maBB20=_usTrSma(close,20), stdBB=_usTrStd(close,maBB20,20);
    const _isFlat=(i)=>{ const a=maR60[i],b=maR120[i],c=maR200[i]; return (a!=null&&b!=null&&c!=null&&!(a>b&&b>c)&&!(a<b&&b<c)); };
    const _pctB=(i)=>{ const m=maBB20[i],s=stdBB[i]; if(m==null||s==null||s<=0) return 0.5; return (close[i]-(m-2*s))/(4*s); };
    const _dev20=(i)=>{ const m=maBB20[i]; return (m!=null&&m>0)?(close[i]/m-1)*100:0; };
    let lc=-1, seen=false, rb=false;
    for(let i=0;i<n;i++){ rb=false; const c=!!(_isFlat(i) && _pctB(i)<=0.2 && _dev20(i)<-8);
      if(c){ lc=i; seen=false; }
      else if(lc>=0 && i>=1 && close[i]>close[i-1]){ if(!seen) rb=true; seen=true; } }
    const i=n-1; return { rgL:(lc>=0 && i-lc<=30) ? (i-lc) : null, rgRb:rb };   // rgL 은 30봉 안일 때만 값 · rgRb 는 늘(불리언 = 러너가 이 원자를 내는가의 표지)
  }catch(e){ return null; } }
//   전용 PSAR 전환 — 스펙 bp{af,mx}·bpKey(워커가 만든 문자열 그대로) · f 1 = 이 봉에서 하락→상승(시즌1 `_bu[i]===true && _bu[i-1]===false`) · 첫 2봉(null)은 원자 없음
const BP=(function(){ const p=_SPEC_O&&_SPEC_O.bp, k=_SPEC_O&&_SPEC_O.bpKey; if(!p||typeof p!=='object'||typeof k!=='string'||!k) return null; const af=+p.af, mx=+p.mx; if(!(af>0)||!(mx>0)||!isFinite(af)||!isFinite(mx)) return null; return { af:af, mx:mx, key:k }; })();
function bpAtom(rows, P){ try{ const close=rows.map(r=>+(r.close!=null?r.close:r.c)); const up=_sxPsarSeries(rows, close, P.af, P.mx).up, i=rows.length-1; if(i<1||up[i]==null||up[i-1]==null) return null; return { k:P.key, f:(up[i]===true&&up[i-1]===false)?1:0 }; }catch(e){ return null; } }
// ═══ [S1762] 🔊 bullVol 원자(PREREG_S1762) ═══
//   시즌1 `_stratBt` S1753 의 네 조건 재료를 마지막 봉에서 그대로 떠낸다(`_usTrSma` = 시즌1 `_trSma` 본문 · 누적합):
//     a  = 단기 5>20>60 정배열(1/0 · 하나라도 null 이면 0)
//     r3 = 세 줄 국면(60·120·200): 1 하락(60<120<200) · 4 정배열(60>120>200) · 2 혼조 — i<199 이면 null
//     r2 = 두 줄 국면(60·120):     1 하락(60<120) · 4 상승(60>120) · 0 같음 — i<119 이면 null
//     o  = 급증 % = (vS5−vL20)/vL20×100 (vL20≤0 이면 null) · v = VR = 20봉 오른 날 거래량 ÷ 내린 날 거래량 ×100 (내린 날 0 이면 300)
//   시즌1 루프가 i≥20 부터라 i<20 이면 원자 없음. 국면 비트(bvReg)·기준(bvBase)·문턱(bvOsc·bvVr)은 워커 `_bvSigOf` 가 댄다 — 설정을 바꿔도 러너를 다시 안 돌린다.
function bvAtom(rows){ try{
    const n=rows.length, i=n-1; if(i<20) return null;
    const close=rows.map(r=>+(r.close!=null?r.close:r.c)), vol=rows.map(r=>+(r.volume!=null?r.volume:(r.v!=null?r.v:0)));
    const b5=_usTrSma(close,5), b20=_usTrSma(close,20), b60=_usTrSma(close,60), m120=_usTrSma(close,120), m200=_usTrSma(close,200), vS=_usTrSma(vol,5), vL=_usTrSma(vol,20);
    const a=(b5[i]!=null&&b20[i]!=null&&b60[i]!=null&&b5[i]>b20[i]&&b20[i]>b60[i])?1:0;
    const r3=(i>=199&&b60[i]!=null&&m120[i]!=null&&m200[i]!=null)?((b60[i]<m120[i]&&m120[i]<m200[i])?1:((b60[i]>m120[i]&&m120[i]>m200[i])?4:2)):null;
    const r2=(i>=119&&b60[i]!=null&&m120[i]!=null)?((b60[i]<m120[i])?1:((b60[i]>m120[i])?4:0)):null;
    const o=(vS[i]!=null&&vL[i]!=null&&vL[i]>0)?((vS[i]-vL[i])/vL[i]*100):null;
    let up=0, dn=0; for(let k=Math.max(1,i-19);k<=i;k++){ if(close[k]>close[k-1]) up+=vol[k]; else if(close[k]<close[k-1]) dn+=vol[k]; }
    const v=(dn===0)?300:(up/dn*100);
    return { a:a, r3:r3, r2:r2, o:o, v:v };
  }catch(e){ return null; } }
function bullVolSignal(ind){ try{
  if(!ind||!ind.maAlign||!ind.maAlign.bullish) return false;         // 강세(단기 5/20/60 정배열)
  if(!_ltBear(ind)) return false;                                    // 하락장(장기 60/120/200 역배열)
  if(typeof ind.volOsc!=='number'||ind.volOsc<73.31) return false;   // 거래량OSC≥73.31
  if(typeof ind.vr!=='number'||ind.vr<389.41) return false;          // VR(거래량비율)≥389.41
  return true;
}catch(e){ return false; } }

// ── [S1632] US 카드 세트 신호(DECL §14 · 사용자 결정 2026-09-19 · 카드 사진1) — 카드 _stratBt(sx_render.js) 식을 복사했다(재구현 아님 · 배터리가 원문 대조).
//   _usTrSma/_usTrStd = 카드 _trSma/_trStd 본문 그대로(누적합 SMA·모표준편차) — 카드와 같은 부동소수 경로라 경계 봉에서도 같은 답.
//   크로스(US) = 카드 크로스(3×3 라우팅 OFF·월봉게이트 OFF·kNN OFF): 마지막 봉 MA5×20 골든만 — 장기축(60/120/200) 조건 없음. KR·코인 crossSignal(라우팅 내장)은 그대로.
//   BB회귀(US) = 카드 range 진입(S1064): 장기 혼재(60/120/200 정배도 역배도 아님) ∧ %B(20,2) ≤ 0.2 ∧ 20일선 이격 < −8%. BB회귀 청산 레그(%B≥0.5·20봉캡)는 워커 몫(S1633).
//   ⚠카드의 해외 단기MA(5×20)를 바꾸면 여기도 같이 바꿔야 한다(카드 cfg.s/cfg.l · 러너는 5×20 고정).
function _usTrSma(a,p){ const o=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=p) s-=a[i-p]; if(i>=p-1) o[i]=s/p; } return o; }
function _usTrStd(a,m,p){ const o=new Array(a.length).fill(null); for(let i=p-1;i<a.length;i++){ if(m[i]==null){o[i]=null;continue;} let s=0; for(let k=i-p+1;k<=i;k++){ const d=a[k]-m[i]; s+=d*d; } o[i]=Math.sqrt(s/p); } return o; }
function crossSignalUS(rows){
  try{
    const n=rows.length; if(n<2) return false;
    const close=rows.map(r=>+(r.close!=null?r.close:r.c));
    const maS=_usTrSma(close,5), maL=_usTrSma(close,20);
    const i=n-1;
    const gc=(i>0&&maS[i]!=null&&maL[i]!=null&&maS[i-1]!=null&&maL[i-1]!=null&&maS[i]>maL[i]&&maS[i-1]<=maL[i-1]);
    return !!gc;
  }catch(e){ return false; }
}
function rangeSignalUS(rows){
  try{
    const n=rows.length; if(n<1) return false;
    const close=rows.map(r=>+(r.close!=null?r.close:r.c));
    const maR60=_usTrSma(close,60), maR120=_usTrSma(close,120), maR200=_usTrSma(close,200);
    const maBB20=_usTrSma(close,20), stdBB=_usTrStd(close,maBB20,20);
    const _isFlat=(i)=>{ const a=maR60[i],b=maR120[i],c=maR200[i]; return (a!=null&&b!=null&&c!=null&&!(a>b&&b>c)&&!(a<b&&b<c)); };
    const _pctB=(i)=>{ const m=maBB20[i],s=stdBB[i]; if(m==null||s==null||s<=0) return 0.5; return (close[i]-(m-2*s))/(4*s); };
    const _dev20=(i)=>{ const m=maBB20[i]; return (m!=null&&m>0)?(close[i]/m-1)*100:0; };
    const i=n-1;
    return !!(_isFlat(i) && _pctB(i)<=0.2 && _dev20(i)<-8);
  }catch(e){ return false; }
}

// ── 최신봉 verdict 직접 추출 (vv 검증가드 우회) → {grade, rawScore, dck, dcf, lt} ──
function latestSignal(rows){
  const idx=rows.length-1;
  const qs=_E.scrQuickScore(rows,'day',mkE);   // [S1663] mkE
  const mom=_E.scoreMomentum(rows,'day',5);
  const sc=_V._assembleScores(qs);
  const verdict=_C.unifiedVerdictV2(null, sc, mom, null); // 등급(표시·evidence용·행동엔 미사용 S948)
  // [S948] 레시피 투표 = 진입 결정 근거. realK/fakeK = 발동 real/fake 겹침수.
  // [S1725] ★레거시 = 시즌1 전략조합 봉맵(`_stratSignalBars`→`_stratBt`)과 같은 식(PREREG_S1725) —
  //   ①장기축 풀만 센다(정배=pullback 풀 · 역배=deadcat 풀 · 코인 bullrun·sidebear 는 안 센다 · tradable:false 도 센다) ②지표는 시즌1 `_scanStock` 과 같은 250봉 슬라이스 ind ③rows<260 이면 봉맵이 없으니 레거시·칸도 없다(웜업)
  //   종전 `_sxRecipeVotesCore`(세트 전 풀 합산 · 전 이력 ind)는 코인 역배 겹침을 시즌1보다 크게, squeeze 계열 재료를 다르게 냈다(MEAS §2-A). 사다리(`_sxVotesLadder`)는 같은 함수.
  const _indS=(rows.length>=260)?_E.calcAllScreener(rows.slice(idx-249, idx+1),'day'):null;
  let votes=0, realK=0, fakeK=0, pure=false, _ltS=null;
  try{ if(_indS){ const _f=_extractFeats733(_indS, rows, idx); _ltS=_ltOf(_indS); const _mb=!!(_indS.maAlign && _indS.maAlign.bullish);
    const Lg=_sxLegacyPoolCore(RECIPES_BY_MKT[mkE]||RECIPES_BY_MKT.kr, _f, _ltS, _mb);
    realK=(_ltS==='bull')?Lg.kPb:((_ltS==='bear')?Lg.kDc:0); fakeK=Lg.kPbFake+Lg.kDcFake; pure=(realK>0 && fakeK===0); votes=pure?_sxVotesLadder(mkE, realK, _ltS):0; } }catch(e){}
  let bullVol=false, cross=false, atrPct=null; try{ const fullInd=(_E.calcAllScreener)?_E.calcAllScreener(rows,'day'):qs.ind; bullVol=bullVolSignal(fullInd); cross=crossSignal(rows); /* [S1396] */ atrPct=(fullInd&&fullInd.atr&&typeof fullInd.atr.pct==='number')?fullInd.atr.pct:null; }catch(e){}  // [S1041] 강세 거래량급증 · [S1050] ATR%(게이트용)
  let rangeUs=false;   // [S1632] US 전용 — KR·코인은 이 두 줄을 안 탄다(crossSignal 라우팅판 그대로)
  if(mk==='us'){ cross=crossSignalUS(rows); rangeUs=rangeSignalUS(rows); }
  // [S1180] 레시피 v2(어휘규칙 S1178) — _sxCellSignalCore를 시즌1 판정과 동일하게 호출(qs.ind·같은 봉 idx). 데이터/라이브러리 미로드 시 null(안전).
  //   real-kind hit만 매수 후보(S1102 §8-3: DOWN·FAKE는 어떤 경로로도 매수투표 금지 — down/fake hit은 avoid로 기록만).
  //   strict(강)+soft(일반) 모두 수집(모의 최대관찰·tier 각인) — buy는 strict 우선 → k 내림차 정렬.
  let v2=null, cellK=null, cellL=null;   // [S1209] 칸 각인(현재 칸 — v2 hit 없어도 기록)
  try{
    if(typeof _sxCellSignalCore==='function' && _indS){   /* [S1725] 250봉 슬라이스 ind(시즌1 `_scanStock` 과 같은 입력) · 웜업이면 칸도 없음 */
      const cs=_sxCellSignalCore(mkE, _indS, rows, idx);
      if(cs){ cellK=cs.cell||null; cellL=cs.lbl||null; }   // [S1209] cell은 규칙 유무와 무관하게 옴 · lbl은 그 칸에 규칙 있을 때만(없으면 null — 소비측이 9칸 고정맵으로 보완)
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
  // [S1663] 코인 트랙 원자 — ①크로스 두 쌍(5×10 · 5×20 · 라우팅 없음 = 시즌1 4시간 카드 3×3 OFF의 순수 골든크로스 · 워커 칩이 고른다) ②레짐 v3(rg5 · 🚪 출구 분할 축 · SXExecCore.regime5At 그대로 · 미로드면 null)
  let cross510=null, cross520=null, rg5=null;
  cross510=crossPlain(rows,5,10); cross520=crossPlain(rows,5,20);   /* [S1707] 빗장 해제 — KR·US도 낸다(S1705가 KR에 5×10·5×20 칩을 줬는데 원자가 영원히 안 오던 구멍) */
  if(IS_COIN){ try{ const EC=(typeof SXExecCore!=='undefined')?SXExecCore:global.SXExecCore; rg5=(EC&&EC.regime5At)?(EC.regime5At(rows,idx)||null):null; }catch(e){ rg5=null; } }
  /* [S1704] 신설 원자 2종 — **3시장 전부**(프리셋 진입쌍: 코인 [MA모드] 20×60 · US [MA단타]/[MA스윙] 10×60).
     ⚠위 두 원자의 `IS_COIN` 빗장은 일부러 안 건드렸다 — KR·US에서 null이던 값이 boolean이 되면
       이 시리얼의 "거래 한 건도 안 바뀐다" 주장이 깨진다. 새 필드만 늘린다.
     ⚠`crossPlain`은 이미 일반화된 감지기다(L53) — 새 판정 로직 0·새 지표 0, 인자만 다르다.
     ⚠웜업: `n < l+2`면 false. 60×쌍은 62봉이 필요하다 — 3시장 스냅 실측 부족 0종(평균 600봉). */
  const cross2060=crossPlain(rows,20,60), cross1060=crossPlain(rows,10,60);
  const st510=maState(rows,5,10), st520=maState(rows,5,20), st2060=maState(rows,20,60), st1060=maState(rows,10,60);   /* [S1711] 🔄 재진입용 진입쌍 정배열 상태 4종 — 아직 읽는 곳 없음(워커 S1711) */
  const _ga=gateAtoms(rows);   /* [S1709] 크로스 게이트 원자 3종 */
  return { grade:verdict.action, rawScore:(qs&&qs.score!=null?qs.score:0), votes, realK, fakeK, pure, dck:realK, dcf:fakeK, lt:_ltS||(sc&&sc.ltAlign)||'off' /* [S1725] 레거시 판정과 같은 축(슬라이스 ind) · 웜업이면 종전 */, bullVol:bullVol, cross:!!cross /* [S1396] 전 종목 상시 각인(알갱이) */, atrPct:atrPct, v2:v2, cell:cellK, cellLbl:cellL, range:rangeUs /* [S1632] us만 참이 될 수 있음 */, cross510, cross520, rg5 /* [S1663] 코인만 값 · 그 외 null */, cross2060, cross1060 /* [S1704] 3시장 공통 */, g60up:_ga.g60up, gMa1060:_ga.gMa1060, gTx1060:_ga.gTx1060 /* [S1709] */, st510, st520, st2060, st1060 /* [S1711] */ };
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

// [S1497] 코인 확정봉 판정 — 업비트 일봉 경계 09:00 KST(=00:00 UTC): 형성중 봉 날짜 = 현재 UTC 날짜. 실행 시각의 형성중 봉을 제거하고 마지막 확정봉을 asof로(KR/US는 장마감 후 실행=이미 확정봉·무관). 끄기=env COIN_FORMING=1 · 테스트=env SX_NOW.
const _nowMs = process.env.SX_NOW ? Date.parse(process.env.SX_NOW) : Date.now();
const COIN_COMPLETED_ONLY = IS_COIN && (process.env.COIN_FORMING!=='1');   // [S1663] coin4h도
const _coinBarDay = new Date(_nowMs).toISOString().slice(0,10);
// [S1663] 봉 길이(ms) — 확정봉 규칙을 시각으로: 마지막 행의 봉 시작(KST 표기 → +09:00)에 봉 길이를 더한 마감이 아직 안 왔으면 형성 중 → 제거. 일봉은 종전 UTC 날짜 규칙과 같은 답(경계가 같다).
const COIN_BAR_MS = (mk==='coin4h') ? 4*3600*1000 : 86400000;
const _coinBarStartMs = (d) => { const s=String(d||''); const m=s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?/); if(!m) return NaN; return Date.parse(m[1]+'T'+(m[2]||'09')+':'+(m[3]||'00')+':00+09:00'); };
let signals=[], errs=[], skip=0;
const t0=Date.now();
codes.forEach((c,i)=>{
  let raw=snap.stocks[c].rows;
  if(COIN_COMPLETED_ONLY && raw && raw.length){ const lr=raw[raw.length-1]; const _ds=String(Array.isArray(lr)?lr[0]:(lr&&lr.date)); const ld=_ds.slice(0,10);
    if(mk==='coin4h'){ const _st=_coinBarStartMs(_ds); if(isFinite(_st) ? (_st+COIN_BAR_MS>_nowMs) : (ld===_coinBarDay)) raw=raw.slice(0,-1); }   // [S1663] 4시간봉: 마감 전이면 형성 중(파싱 실패 시 날짜 규칙 폴백)
    else if(ld===_coinBarDay) raw=raw.slice(0,-1); }  // [S1497] 형성중 봉 제거 → 마지막 행=확정봉
  if(!raw||raw.length<160){ skip++; return; }
  const rows=raw.map(r=>Array.isArray(r)?({date:r[0],open:r[1],o:r[1],high:r[2],h:r[2],low:r[3],l:r[3],close:r[4],c:r[4],volume:r[5],v:r[5]}):r);
  let sig=null;
  try{ sig=latestSignal(rows); }catch(e){ errs.push(c+':'+(e&&e.message)); return; }
  const {grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, bullVol, cross:_crossR /* [S1396] */, atrPct, v2, cell, cellLbl, range /* [S1632] */, cross510, cross520, rg5 /* [S1663] */, cross2060, cross1060 /* [S1704] */, g60up, gMa1060, gTx1060 /* [S1709] */, st510, st520, st2060, st1060 /* [S1711] */}=sig;
  const cross=(mk==='coin4h')?!!cross510:_crossR;   // [S1663] coin4h의 사슬 원자 = 순수 5×10(카드 4시간 세트 기본 · 워커 칩이 5×20으로 바꿔 읽을 수 있다 · cross520 동봉) · 코인 일봉·KR은 라우팅판 그대로
  let P=policy(mk, votes, realK, rawScore);
  let src=(P.action==='BUY')?'recipe':null;
  // [S1632] US 우선순위 = 카드 _stratBt 진입 사슬(range → trend(크로스) → deadcat/pullback(레거시) → cell(칸real)) — BB회귀·크로스가 레거시보다 앞. KR·코인은 아래 기존 사슬 그대로.
  if(mk==='us' && range){ P={ action:'BUY', score:(rawScore||0), policy:'us:BB회귀(장기혼재·%B≤0.2·20일선이격<−8%)→BUY', provisional:true }; src='range'; }
  else if(mk==='us' && cross){ P={ action:'BUY', score:(rawScore||0), policy:'us:크로스(MA5×20 골든·라우팅 없음=카드 3×3 OFF)→BUY', provisional:true }; src='cross'; }
  // [S1041] 강세 거래량급증 편입 — votes-BUY(약세반등)가 아닐 때만 별도 BUY(상호배타). KR 전용. src=bullVol 태그(가계부 전략구분용).
  if(P.action!=='BUY' && bullVol && (mk==='kr'||IS_COIN)){ P={ action:'BUY', score:(rawScore||0), policy:mk+':bullVol(하락장×강세·거래량OSC≥73.31&VR≥389.41)→BUY', provisional:true }; src='bullVol'; }
    if(P.action!=='BUY' && cross && (mk==='kr'||IS_COIN)){ P={ action:'BUY', score:(rawScore||0), policy:mk+((mk==='coin4h')?':크로스(MA5×10 골든·라우팅 없음=카드 3×3 OFF)→BUY':':크로스(MA5×20 골든·장기정배 라우팅)→BUY'), provisional:true }; src='cross'; } /* [S1396] 사슬 말미(recipe>bullVol>cross) — 동시발화는 귀속만 바뀌고 매수 무영향(S1392 Q3) · S1050 ATR게이트 미적용(v2·bullVol 선례=모의 최대관찰·atrPct 각인) · legacyV4Only 비대상(src recipe 전용) */ /* [S1477] coin 개방 — 게이트는 워커측(runCoinPaperExec) */
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
  signals.push({ code:c, name:(snap.stocks[c]&&snap.stocks[c].name)||c, grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, bullVol:!!bullVol, cross:!!cross, v2:(v2||null), src:src, action:P.action, score:P.score, policy:P.policy, provisional:P.provisional, atrGate:atrGate, atrPct:(atrPct!=null?+atrPct.toFixed(2):null), cell:(cell||null), cellLbl:(cellLbl||null), barDate:(rows[rows.length-1]&&rows[rows.length-1].date)||null, close:(rows[rows.length-1]&&+rows[rows.length-1].close)||null }); // [S945]name [S948]votes [S1041]bullVol/src [S1083]close=금액균등 사이징용(워커 시세조회 없이) [S1180]v2=어휘규칙 판정(발동 시) [S1209]cell/cellLbl=진입 시점 칸(항상)
  if(mk==='us') signals[signals.length-1].range=!!range;   // [S1632] US만 — KR·코인 행은 키 추가 0(바이트 동일)
  else signals[signals.length-1].range=!!rangeSignalUS(rows);   /* [S1712] 🌀 BB회귀 원자 — KR·코인도 같은 식(시즌1 range 진입식 복사본 · S1632). 필드만, src·action 불변 — 워커가 srcOn.range 켜졌을 때만 읽는다 */
  if(IS_COIN){ const _st=snap.stocks[c]||{}, _sg=signals[signals.length-1]; _sg.univ=(_st.univ==='ext')?'ext':'pool'; _sg.tv30=(typeof _st.tv30==='number'&&isFinite(_st.tv30))?Math.round(_st.tv30):null; _sg.rg5=rg5||null; }   // [S1651] 코인만 — 확장 표시·거래대금(워커 후보 정렬 SSOT _coinCandCmp가 읽는다) · [S1663] 크로스 원자 2종·레짐 v3(coin·coin4h)
  { const _sg=signals[signals.length-1]; _sg.cross510=!!cross510; _sg.cross520=!!cross520; _sg.cross2060=!!cross2060; _sg.cross1060=!!cross1060; _sg.g60up=!!g60up; _sg.gMa1060=!!gMa1060; _sg.gTx1060=!!gTx1060;
    _sg.st510=!!st510; _sg.st520=!!st520; _sg.st2060=!!st2060; _sg.st1060=!!st1060; _sg.pbar=(rows.length>=2&&rows[rows.length-2]&&rows[rows.length-2].date)||null; }   /* [S1711] 🔄 재진입 원자 — 진입쌍 정배열 상태 4종 + 앞 봉 날짜(청산 봉 < i-1 판정용) · 아직 읽는 곳 없음(워커 S1711) */   /* [S1709] 게이트 원자 — 아직 읽는 곳 없음(워커 S1709가 읽는다) */   /* [S1707] 네 원자 전부 3시장 공통 */   /* [S1704] 3시장 공통 — 아직 **읽는 곳이 없다**(S1705가 읽는다) */
  if(AX){ const _xa=axAtoms(rows,AX); if(_xa) signals[signals.length-1].xa=_xa; }   /* [S1757] 📈 크로스 축 원자 — 스펙이 있을 때만(없으면 키 추가 0) */
  if(PS){ const _pa=psAtom(rows,PS); if(_pa) signals[signals.length-1].ps=_pa; }   /* [S1758] 🔵 PSAR 방향 원자 */
  { const _mz=mzAtom(rows); if(_mz) signals[signals.length-1].mz=_mz; }   /* [S1759] 📅 월봉 구간 원자 — 늘(스펙 무관) */
  { const _rg=rangeAtoms(rows); if(_rg){ if(_rg.rgL!=null) signals[signals.length-1].rgL=_rg.rgL; signals[signals.length-1].rgRb=_rg.rgRb; } }   /* [S1761] 🌀 BB회귀 원자 — 늘(스펙 무관) · rgL 은 조건 봉이 30봉 안에 있을 때만 */
  if(BP){ const _bp=bpAtom(rows,BP); if(_bp) signals[signals.length-1].bp=_bp; }   /* [S1761] 🌀 전용 PSAR 전환 원자 — 스펙이 있을 때만 */
  { const _bv=bvAtom(rows); if(_bv) signals[signals.length-1].bv=_bv; }   /* [S1762] 🔊 bullVol 원자 — 늘(스펙 무관) · i<20 이면 없음 */
  if((i+1)%40===0) console.error('  '+(i+1)+'/'+codes.length+' ('+((Date.now()-t0)/1000|0)+'s)');
});
// 요약
const cnt=(f)=>signals.filter(f).length;
const asofFinal = (COIN_COMPLETED_ONLY && signals.length) ? (signals.map(s=>s.barDate).filter(Boolean).sort().pop() || snap.baseDate) : snap.baseDate;  // [S1497] 코인=마지막 확정봉 날짜(ISO 09:00 형식 그대로)
const ledger={ schema:'sx_signal_ledger_v1', mkt:mk, asof:asofFinal, generated:new Date().toISOString(),
  universe:codes.length, evaluated:signals.length, skipped:skip, errN:errs.length, errs:errs.slice(0,5),
  summary:{ BUY:cnt(s=>s.action==='BUY'), bullVolBUY:cnt(s=>s.src==='bullVol'), v2BUY:cnt(s=>s.src==='v2'), v2Overlap:cnt(s=>s.src==='recipe'&&s.v2&&s.v2.buy&&s.v2.buy.length>0), v2AvoidHit:cnt(s=>s.v2&&s.v2.avoid&&s.v2.avoid.length>0), atrGated:cnt(s=>s.atrGate), HOLD:cnt(s=>s.action==='HOLD'), SELL:cnt(s=>s.action==='SELL'), provisional:cnt(s=>s.provisional), // [S1180] v2BUY=v2 단독진입 · v2Overlap=레거시BUY∩v2hit(겹침 관찰) · v2AvoidHit=down/fake hit(기록만)
            votes:{ v1:cnt(s=>s.votes===1), v2:cnt(s=>s.votes===2), v3:cnt(s=>s.votes===3), v4:cnt(s=>s.votes>=4) }, // [S948] 레시피 투표 분포
            grade:{ 매수:cnt(s=>s.grade==='매수'), 관심:cnt(s=>s.grade==='관심'), 관망:cnt(s=>s.grade==='관망'), 회피:cnt(s=>s.grade==='회피') } },
  signals };
if(mk==='us'){ ledger.summary.rangeBUY=cnt(s=>s.src==='range'); ledger.summary.crossBUY=cnt(s=>s.src==='cross'); }   // [S1632] US만(KR·코인 요약 키 불변)
if(IS_COIN){ ledger.univ=snap.univ||null; ledger.summary.extN=cnt(s=>s.univ==='ext'); ledger.summary.extBUY=cnt(s=>s.univ==='ext'&&s.action==='BUY'); ledger.summary.crossBUY=cnt(s=>s.src==='cross'); ledger.tf=(mk==='coin4h')?'240m':'day'; ledger.barMs=COIN_BAR_MS; }   // [S1651] 코인만 — 유니버스 메타(빌더 동적 스냅 · 폴백이면 null) · [S1663] 봉 주기·크로스 BUY 수
if(AX){ ledger.ax={ k:AX.key, t:AX.t, e:AX.e, x:AX.x, r:AX.r, sm:AX.sm }; ledger.summary.axN=cnt(s=>!!s.xa); ledger.summary.axG=cnt(s=>s.xa&&s.xa.g===1); ledger.summary.axD=cnt(s=>s.xa&&s.xa.d===1); }   /* [S1757] 이 원장의 원자를 만든 스펙 · 원자 재고 */
if(PS){ ledger.ps={ k:PS.key, af:PS.af, mx:PS.mx }; ledger.summary.psN=cnt(s=>!!s.ps); ledger.summary.psUp=cnt(s=>s.ps&&s.ps.u===1); }   /* [S1758] */
if(SPEC_SIG) ledger.sig=SPEC_SIG;   /* [S1758] 이 원장을 만든 스펙 서명(축·PSAR) */
ledger.summary.mz={ up:cnt(s=>s.mz==='up'), mid:cnt(s=>s.mz==='mid'), dn:cnt(s=>s.mz==='dn'), na:cnt(s=>s.mz==='na') };   /* [S1759] 📅 구간 재고 */
ledger.summary.rg={ n:cnt(s=>s.rgL!=null), c:cnt(s=>s.rgL===0), rb:cnt(s=>s.rgRb===true) };   /* [S1761] 🌀 조건 봉 30봉 안 · 이 봉이 조건 봉 · 첫 반등 봉 */
ledger.summary.bv={ n:cnt(s=>!!s.bv), a:cnt(s=>s.bv&&s.bv.a===1), r3:cnt(s=>s.bv&&s.bv.r3!=null), r2:cnt(s=>s.bv&&s.bv.r2!=null) };   /* [S1762] 🔊 원자 행 · 단기 정배열 · 세 줄 국면 있음 · 두 줄 국면 있음 */
if(BP){ ledger.bp={ k:BP.key, af:BP.af, mx:BP.mx }; ledger.summary.bpN=cnt(s=>!!s.bp); ledger.summary.bpF=cnt(s=>s.bp&&s.bp.f===1); }   /* [S1761] */
fs.writeFileSync(outPath, JSON.stringify(ledger,null,1));
console.error('DONE sig '+mk+' asof='+asofFinal+(COIN_COMPLETED_ONLY?'(확정봉·S1497)':'')+': 평가 '+signals.length+'/'+codes.length+' | BUY '+ledger.summary.BUY+'(bullVol '+ledger.summary.bullVolBUY+'·v2 '+ledger.summary.v2BUY+'·겹침 '+ledger.summary.v2Overlap+') atrGated '+ledger.summary.atrGated+' HOLD '+ledger.summary.HOLD+' SELL '+ledger.summary.SELL+' (prov '+ledger.summary.provisional+') err='+errs.length+' '+((Date.now()-t0)/1000|0)+'s → '+outPath);
console.error('  [S1757] 크로스 축 '+(AX?(AX.key+' · 원자 '+ledger.summary.axN+'행 · 골든 '+ledger.summary.axG+' · 데드 '+ledger.summary.axD):(process.env.SX_SPEC?'스펙에 축 없음(MA 진입쌍 경로 그대로)':'스펙 없음(SX_SPEC 미전달 — 종전 원장)')));
if(PS) console.error('  [S1758] PSAR '+PS.key+' · 원자 '+ledger.summary.psN+'행 · 상승 '+ledger.summary.psUp+' · 하락 '+(ledger.summary.psN-ledger.summary.psUp));
console.error('  [S1762] bullVol 원자 '+ledger.summary.bv.n+'행 · 단기 정배열 '+ledger.summary.bv.a+' · 세 줄 국면 '+ledger.summary.bv.r3+' · 두 줄 국면 '+ledger.summary.bv.r2);
console.error('  [S1761] BB회귀 조건 봉 30봉 안 '+ledger.summary.rg.n+'행 · 이 봉이 조건 봉 '+ledger.summary.rg.c+' · 첫 반등 봉 '+ledger.summary.rg.rb+(BP?(' · 전용 PSAR '+BP.key+' 원자 '+ledger.summary.bpN+'행 · 전환 '+ledger.summary.bpF):' · 전용 PSAR 스펙 없음'));
console.error('  [S1759] 월봉 구간 상승 '+ledger.summary.mz.up+' · 혼조 '+ledger.summary.mz.mid+' · 하락 '+ledger.summary.mz.dn+' · 판정 불가 '+ledger.summary.mz.na);
if(mk==='us') console.error('  [S1632] US BB회귀 BUY '+ledger.summary.rangeBUY+' · 크로스 BUY '+ledger.summary.crossBUY+' (카드 사진1 세트 · DECL §14)');
if(IS_COIN) console.error('  [S1651] 코인 유니버스 '+(ledger.univ?(ledger.univ.mode+' · 풀 '+ledger.univ.poolIn+' · 확장 '+ledger.univ.ext):'메타 없음(폴백 스냅)')+' · 확장 평가 '+ledger.summary.extN+' · 확장 BUY '+ledger.summary.extBUY);
