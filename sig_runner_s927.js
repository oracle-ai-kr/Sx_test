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
  // [S948] 레시피 투표 = 진입 결정 근거 (SSOT=_sxRecipeVotesCore). realK/fakeK = 발동 real/fake 겹침수.
  let votes=0, realK=0, fakeK=0, pure=false;
  try{ const rsig=_sxRecipeVotesCore(mkE, qs.ind, rows, idx); if(rsig){ votes=rsig.votes||0; realK=rsig.realK||0; fakeK=rsig.fakeK||0; pure=!!rsig.pure; } }catch(e){}
  let bullVol=false, cross=false, atrPct=null; try{ const fullInd=(_E.calcAllScreener)?_E.calcAllScreener(rows,'day'):qs.ind; bullVol=bullVolSignal(fullInd); cross=crossSignal(rows); /* [S1396] */ atrPct=(fullInd&&fullInd.atr&&typeof fullInd.atr.pct==='number')?fullInd.atr.pct:null; }catch(e){}  // [S1041] 강세 거래량급증 · [S1050] ATR%(게이트용)
  let rangeUs=false;   // [S1632] US 전용 — KR·코인은 이 두 줄을 안 탄다(crossSignal 라우팅판 그대로)
  if(mk==='us'){ cross=crossSignalUS(rows); rangeUs=rangeSignalUS(rows); }
  // [S1180] 레시피 v2(어휘규칙 S1178) — _sxCellSignalCore를 시즌1 판정과 동일하게 호출(qs.ind·같은 봉 idx). 데이터/라이브러리 미로드 시 null(안전).
  //   real-kind hit만 매수 후보(S1102 §8-3: DOWN·FAKE는 어떤 경로로도 매수투표 금지 — down/fake hit은 avoid로 기록만).
  //   strict(강)+soft(일반) 모두 수집(모의 최대관찰·tier 각인) — buy는 strict 우선 → k 내림차 정렬.
  let v2=null, cellK=null, cellL=null;   // [S1209] 칸 각인(현재 칸 — v2 hit 없어도 기록)
  try{
    if(typeof _sxCellSignalCore==='function'){
      const cs=_sxCellSignalCore(mkE, qs.ind, rows, idx);
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
  if(IS_COIN){ cross510=crossPlain(rows,5,10); cross520=crossPlain(rows,5,20); try{ const EC=(typeof SXExecCore!=='undefined')?SXExecCore:global.SXExecCore; rg5=(EC&&EC.regime5At)?(EC.regime5At(rows,idx)||null):null; }catch(e){ rg5=null; } }
  return { grade:verdict.action, rawScore:(qs&&qs.score!=null?qs.score:0), votes, realK, fakeK, pure, dck:realK, dcf:fakeK, lt:(sc&&sc.ltAlign)||'off', bullVol:bullVol, cross:!!cross /* [S1396] 전 종목 상시 각인(알갱이) */, atrPct:atrPct, v2:v2, cell:cellK, cellLbl:cellL, range:rangeUs /* [S1632] us만 참이 될 수 있음 */, cross510, cross520, rg5 /* [S1663] 코인만 값 · 그 외 null */ };
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
  const {grade, rawScore, votes, realK, fakeK, pure, dck, dcf, lt, bullVol, cross:_crossR /* [S1396] */, atrPct, v2, cell, cellLbl, range /* [S1632] */, cross510, cross520, rg5 /* [S1663] */}=sig;
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
  if(IS_COIN){ const _st=snap.stocks[c]||{}, _sg=signals[signals.length-1]; _sg.univ=(_st.univ==='ext')?'ext':'pool'; _sg.tv30=(typeof _st.tv30==='number'&&isFinite(_st.tv30))?Math.round(_st.tv30):null; _sg.cross510=!!cross510; _sg.cross520=!!cross520; _sg.rg5=rg5||null; }   // [S1651] 코인만 — 확장 표시·거래대금(워커 후보 정렬 SSOT _coinCandCmp가 읽는다) · [S1663] 크로스 원자 2종·레짐 v3(coin·coin4h)
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
fs.writeFileSync(outPath, JSON.stringify(ledger,null,1));
console.error('DONE sig '+mk+' asof='+asofFinal+(COIN_COMPLETED_ONLY?'(확정봉·S1497)':'')+': 평가 '+signals.length+'/'+codes.length+' | BUY '+ledger.summary.BUY+'(bullVol '+ledger.summary.bullVolBUY+'·v2 '+ledger.summary.v2BUY+'·겹침 '+ledger.summary.v2Overlap+') atrGated '+ledger.summary.atrGated+' HOLD '+ledger.summary.HOLD+' SELL '+ledger.summary.SELL+' (prov '+ledger.summary.provisional+') err='+errs.length+' '+((Date.now()-t0)/1000|0)+'s → '+outPath);
if(mk==='us') console.error('  [S1632] US BB회귀 BUY '+ledger.summary.rangeBUY+' · 크로스 BUY '+ledger.summary.crossBUY+' (카드 사진1 세트 · DECL §14)');
if(IS_COIN) console.error('  [S1651] 코인 유니버스 '+(ledger.univ?(ledger.univ.mode+' · 풀 '+ledger.univ.poolIn+' · 확장 '+ledger.univ.ext):'메타 없음(폴백 스냅)')+' · 확장 평가 '+ledger.summary.extN+' · 확장 BUY '+ledger.summary.extBUY);
