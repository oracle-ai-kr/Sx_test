/* ════════════════════════════════════════════════════════════════════
 * sx_recipe_signal.js — [S841] 레시피 신호감지 카드 (분석탭)
 *   교차검증 도구에서 발굴한 '레시피(재료 2~4 조합)'를 현재 종목에 평가.
 *   - 현재봉 발동 시 [상승신호]/[하락신호] 배지 (진짜반등=상승 / 가짜반등=하락)
 *   - 과거 발동 지점들의 '후반평균([+6..+10]) 방향'으로 적중/실패 + 적중률 (이 종목)
 *   - 4분류: 역배열/정배열 × 진짜반등/가짜반등
 *   레시피는 auto-scan 결과 JSON에서 등록 — [S849] 시장별 RECIPES_BY_MKT{kr,us,coin}에 추가(발굴풀 스냅샷 기준·등록컷 적용). 소비는 _R()/recipesFor(mk).
 *   데이터소스: [S782] SXCandleBT.fetchRows600 단일소스(600봉 보장 · 교차검증과 동일 캔들 · 'mkt|tf|code' 캐시).
 *   재사용 전역(sx_render.js): SXE.calcAllScreener · _extractFeats733 · _condMatch733 · _ltStr733
 *   [S795] _pendingByCat(sym,rows) 노출 — 카테고리별 '관찰중'(최근발동 0-9봉=N10 미확정) 집계 · 배지 인벤토리가 당겨씀(동일 _scanStock 캐시).
 *   [S807] realFireBars(sym,rows) 노출 — 진짜반등(real=pullback-real 정배 + deadcat-real 역배) 발동 봉맵 {barIdx:true}. 단기추세매매 검증모달 물타기용(동일 _scanStock 캐시 공유 · 같은 rows 넘기면 봉 인덱스 일치).
 *   [S809] overlapScan(sym,rows) 노출 — 봉별 real 레시피 동시발동 수(겹침)+N10 후반평균 적중. 교차검증 '레시피 겹침' 도구용(동일 _scanStock 캐시 공유). _realFireBars와 달리 break 없이 발동수 끝까지 카운트.
 *   측정 전용 · 엔진 무변경 · 일봉 기준 · 펼칠 때 평가(접힘=fetch 없음).
 * ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  /* ───────── 레시피 레지스트리 ─────────
   * pool: 'deadcat'(역배열) | 'pullback'(정배열)
   * kind: 'real'(진짜반등→상승신호) | 'fake'(가짜반등→하락신호)
   * conds: [{key,type:'num',dir:'lt'|'gt',th} | {key,type:'bin'}]
   * src : auto-scan JSON 글로벌통계 {n, late(후반평균), n10, surv}  (표시용)
   */
  // [S865] 세트 전면 교체 — S864 지평렌즈 빔서치(스냅샷 20260701) + 통일 등록표준: 기간반분 부호일치(h1·h2·각 n≥10) + fake Δ렌즈≥5%p + 다양성(J≥0.5 클러스터당 4) + 상한130. 구세트(991개·혼재혈통)는 sx_recipes_backup_S862_20260702.json 백업. src에 lens/retLens/h1/h2 확장(표시 호환 유지).
  // [S849] 레시피 3시장 분리 — 시장특성이 달라 세트 비혼용. kr=기존311(확장풀 v34 유산)+발굴풀 신규55(중복13 제외) / us·coin=발굴풀 스냅샷(20260701) 전용. 소비처는 _R()(currentMarket 기준) 또는 recipesFor(mk). 등록 표준: 게이트(S848 상대화) + n≥30 + fake ΔN10≥5%p + 카테고리 상한 130.
var RECIPES_BY_MKT = {
  kr: [
  // ── deadcat · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 70개 ──
  {id:'dc_r_L01', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + CCI<-135.72 + MA200 이격도%<-28.66',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'dev200',type:'num',dir:'lt',th:-28.66}], src:{n:94,late:0.1009,n10:0.777,surv:0.713,lens:0.777,retLens:0.1253,h1:0.82,h2:0.72}},
  {id:'dc_r_L02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + BB %B<0.07 + MA200 이격도%<-28.66',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev200',type:'num',dir:'lt',th:-28.66}], src:{n:83,late:0.097,n10:0.771,surv:0.737,lens:0.771,retLens:0.1212,h1:0.8,h2:0.73}},
  {id:'dc_r_L03', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + RSI<36.8 + MA200 이격도%<-28.66',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev200',type:'num',dir:'lt',th:-28.66}], src:{n:116,late:0.1054,n10:0.776,surv:0.76,lens:0.776,retLens:0.1189,h1:0.76,h2:0.8}},
  {id:'dc_r_L04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA200 이격도%<-28.66 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:122,late:0.099,n10:0.721,surv:0.692,lens:0.738,retLens:0.1163,h1:0.71,h2:0.77}},
  {id:'dc_r_L05', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA120 이격도%<-20.38 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev120',type:'num',dir:'lt',th:-20.38}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:148,late:0.0906,n10:0.743,surv:0.693,lens:0.764,retLens:0.1065,h1:0.74,h2:0.79}},
  {id:'dc_r_L06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + BB %B<0.07 + MA20 이격도%<-7.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:167,late:0.0838,n10:0.802,surv:0.723,lens:0.784,retLens:0.1033,h1:0.89,h2:0.65}},
  {id:'dc_r_L07', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + RSI<36.8 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:187,late:0.0868,n10:0.786,surv:0.712,lens:0.781,retLens:0.102,h1:0.83,h2:0.71}},
  {id:'dc_r_L08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + BB %B<0.07 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:151,late:0.0798,n10:0.795,surv:0.691,lens:0.788,retLens:0.1012,h1:0.83,h2:0.73}},
  {id:'dc_r_L09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA60 이격도%<-12.44 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:159,late:0.0881,n10:0.78,surv:0.697,lens:0.786,retLens:0.1007,h1:0.82,h2:0.74}},
  {id:'dc_r_L10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA20 이격도%<-7.12 + MFI(자금흐름)<35.82',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:198,late:0.0826,n10:0.773,surv:0.701,lens:0.753,retLens:0.0963,h1:0.89,h2:0.6}},
  {id:'dc_r_L11', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA200 이격도%<-28.66 + MFI(자금흐름)<35.82',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:230,late:0.0825,n10:0.783,surv:0.693,lens:0.774,retLens:0.0962,h1:0.83,h2:0.71}},
  {id:'dc_r_L12', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + RSI<36.8 + MA20 이격도%<-7.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:226,late:0.0837,n10:0.779,surv:0.736,lens:0.761,retLens:0.0962,h1:0.85,h2:0.64}},
  {id:'dc_r_L13', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA20 이격도%<-7.12 + VR(거래량비율)<60.95',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:160,late:0.0831,n10:0.794,surv:0.719,lens:0.781,retLens:0.0962,h1:0.9,h2:0.64}},
  {id:'dc_r_L14', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA200 이격도%<-28.66 + MA5 기울기%<-3.61',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:160,late:0.078,n10:0.75,surv:0.67,lens:0.731,retLens:0.0953,h1:0.79,h2:0.63}},
  {id:'dc_r_L15', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA200 이격도%<-28.66 + MA5 기울기%<-3.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:228,late:0.0805,n10:0.763,surv:0.692,lens:0.754,retLens:0.0934,h1:0.8,h2:0.69}},
  {id:'dc_r_L16', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA200 이격도%<-28.66 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'sarBear',type:'bin'}], src:{n:306,late:0.0742,n10:0.752,surv:0.666,lens:0.748,retLens:0.0929,h1:0.79,h2:0.68}},
  {id:'dc_r_L17', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + RSI<36.8 + MA60 이격도%<-12.44',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:188,late:0.0814,n10:0.75,surv:0.717,lens:0.75,retLens:0.092,h1:0.83,h2:0.66}},
  {id:'dc_r_L18', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA60 이격도%<-12.44 + MFI(자금흐름)<35.82',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:180,late:0.0791,n10:0.728,surv:0.687,lens:0.733,retLens:0.0914,h1:0.88,h2:0.62}},
  {id:'dc_r_L19', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MA60 이격도%<-12.44 + VR(거래량비율)<60.95',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:154,late:0.0746,n10:0.76,surv:0.69,lens:0.773,retLens:0.0914,h1:0.92,h2:0.65}},
  {id:'dc_r_L20', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-28.66 + MA5 기울기%<-3.61 + MFI(자금흐름)<35.82',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:182,late:0.0799,n10:0.742,surv:0.673,lens:0.731,retLens:0.0914,h1:0.8,h2:0.66}},
  {id:'dc_r_L21', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + Stoch %K<7.95 + VR(거래량비율)<60.95',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:132,late:0.0738,n10:0.811,surv:0.716,lens:0.803,retLens:0.0898,h1:0.86,h2:0.75}},
  {id:'dc_r_L22', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + Stoch %K<7.95 + MA60 이격도%<-12.44',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:110,late:0.0756,n10:0.818,surv:0.734,lens:0.818,retLens:0.0876,h1:0.88,h2:0.77}},
  {id:'dc_r_L23', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + RSI<36.8 + MA120 이격도%<-20.38',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev120',type:'num',dir:'lt',th:-20.38}], src:{n:258,late:0.068,n10:0.76,surv:0.673,lens:0.752,retLens:0.0869,h1:0.87,h2:0.64}},
  {id:'dc_r_L24', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + VR(거래량비율)<60.95 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'vr',type:'num',dir:'lt',th:60.95}, {key:'nearSup',type:'bin'}], src:{n:193,late:0.0689,n10:0.803,surv:0.7,lens:0.793,retLens:0.0848,h1:0.87,h2:0.73}},
  {id:'dc_r_L25', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + MA20 이격도%<-7.12 + MA120 이격도%<-20.38',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'dev120',type:'num',dir:'lt',th:-20.38}], src:{n:243,late:0.0697,n10:0.77,surv:0.68,lens:0.749,retLens:0.0839,h1:0.85,h2:0.63}},
  {id:'dc_r_L26', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + Stoch %K<7.95 + MA120 이격도%<-20.38',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev120',type:'num',dir:'lt',th:-20.38}], src:{n:207,late:0.0622,n10:0.773,surv:0.68,lens:0.773,retLens:0.0838,h1:0.85,h2:0.7}},
  {id:'dc_r_L27', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + ADX>23.35 + MA120 이격도%<-20.38',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev120',type:'num',dir:'lt',th:-20.38}], src:{n:127,late:0.0579,n10:0.709,surv:0.686,lens:0.732,retLens:0.0817,h1:0.75,h2:0.72}},
  {id:'dc_r_L28', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + ADX>23.35 + MA200 이격도%<-28.66',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev200',type:'num',dir:'lt',th:-28.66}], src:{n:107,late:0.0614,n10:0.72,surv:0.666,lens:0.729,retLens:0.0803,h1:0.66,h2:0.81}},
  {id:'dc_r_L29', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA5 기울기%<-3.61 + VR(거래량비율)<60.95',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:150,late:0.0662,n10:0.793,surv:0.693,lens:0.767,retLens:0.08,h1:0.84,h2:0.69}},
  {id:'dc_r_L30', pool:'deadcat', kind:'real', mode:'and', label:'ADX>23.35 + 골든크로스 5×9 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:91,late:0.0722,n10:0.769,surv:0.709,lens:0.78,retLens:0.0786,h1:0.71,h2:0.86}},
  {id:'dc_r_L31', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + ADX>23.35 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'gx5_20',type:'bin'}], src:{n:98,late:0.0789,n10:0.745,surv:0.726,lens:0.735,retLens:0.0776,h1:0.67,h2:0.8}},
  {id:'dc_r_L32', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-28.66 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:133,late:0.0539,n10:0.752,surv:0.65,lens:0.744,retLens:0.076,h1:0.69,h2:0.8}},
  {id:'dc_r_L33', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + MA20 이격도%<-7.12 + MA60 이격도%<-12.44',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:308,late:0.0632,n10:0.747,surv:0.665,lens:0.75,retLens:0.0755,h1:0.87,h2:0.6}},
  {id:'dc_r_L34', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA60 이격도%<-12.44 + MA5 기울기%<-3.61',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:245,late:0.0613,n10:0.776,surv:0.669,lens:0.763,retLens:0.0749,h1:0.85,h2:0.65}},
  {id:'dc_r_L35', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + MA60 이격도%<-12.44 + MA5 기울기%<-3.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:278,late:0.0642,n10:0.77,surv:0.674,lens:0.763,retLens:0.0748,h1:0.87,h2:0.63}},
  {id:'dc_r_L36', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + Stoch %K<7.95 + MA60 이격도%<-12.44',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:246,late:0.0587,n10:0.768,surv:0.679,lens:0.772,retLens:0.0739,h1:0.87,h2:0.65}},
  {id:'dc_r_L37', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA60 이격도%<-12.44 + VR(거래량비율)<60.95',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:166,late:0.0617,n10:0.759,surv:0.687,lens:0.765,retLens:0.0736,h1:0.81,h2:0.73}},
  {id:'dc_r_L38', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<7.95 + MA120 이격도%<-20.38',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev120',type:'num',dir:'lt',th:-20.38}], src:{n:254,late:0.057,n10:0.76,surv:0.686,lens:0.744,retLens:0.0732,h1:0.81,h2:0.68}},
  {id:'dc_r_L39', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + MA5 기울기%<-3.61 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'rsiDiv',type:'bin'}], src:{n:80,late:0.0545,n10:0.788,surv:0.687,lens:0.8,retLens:0.0725,h1:0.84,h2:0.77}},
  {id:'dc_r_L40', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + MFI(자금흐름)<35.82 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'mfi',type:'num',dir:'lt',th:35.82}, {key:'nearSup',type:'bin'}], src:{n:235,late:0.0596,n10:0.749,surv:0.671,lens:0.736,retLens:0.0725,h1:0.83,h2:0.67}},
  {id:'dc_r_L41', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<7.95 + ADX>23.35',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'adx',type:'num',dir:'gt',th:23.35}], src:{n:175,late:0.0562,n10:0.789,surv:0.728,lens:0.794,retLens:0.0713,h1:0.87,h2:0.69}},
  {id:'dc_r_L42', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA20 이격도%<-7.12 + MA60 이격도%<-12.44',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:282,late:0.0605,n10:0.773,surv:0.692,lens:0.759,retLens:0.0712,h1:0.83,h2:0.67}},
  {id:'dc_r_L43', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA5 기울기%<-3.61 + VR(거래량비율)<60.95',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:261,late:0.0606,n10:0.755,surv:0.677,lens:0.732,retLens:0.0709,h1:0.84,h2:0.61}},
  {id:'dc_r_L44', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<7.95 + MA5 기울기%<-3.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:292,late:0.0579,n10:0.798,surv:0.699,lens:0.771,retLens:0.0708,h1:0.85,h2:0.66}},
  {id:'dc_r_L45', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA60 이격도%<-12.44 + MFI(자금흐름)<35.82',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:212,late:0.0606,n10:0.755,surv:0.674,lens:0.741,retLens:0.0701,h1:0.85,h2:0.65}},
  {id:'dc_r_L46', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA60 이격도%<-12.44 + MA5 기울기%<-3.61',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:229,late:0.0584,n10:0.795,surv:0.69,lens:0.773,retLens:0.0701,h1:0.86,h2:0.67}},
  {id:'dc_r_L47', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:107,late:0.0436,n10:0.748,surv:0.678,lens:0.757,retLens:0.0694,h1:0.83,h2:0.71}},
  {id:'dc_r_L48', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA5 기울기%<-3.61 + MFI(자금흐름)<35.82',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:205,late:0.0582,n10:0.785,surv:0.674,lens:0.741,retLens:0.0688,h1:0.85,h2:0.63}},
  {id:'dc_r_L49', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.72 + Stoch %K<7.95 + MA5 기울기%<-3.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.72}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:299,late:0.0558,n10:0.796,surv:0.682,lens:0.769,retLens:0.0688,h1:0.83,h2:0.68}},
  {id:'dc_r_L50', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-28.66 + MA5 기울기%<-3.61 + RSI 상승다이버전스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-28.66}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'rsiDiv',type:'bin'}], src:{n:68,late:0.0522,n10:0.765,surv:0.65,lens:0.765,retLens:0.0684,h1:0.8,h2:0.73}},
  {id:'dc_r_L51', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA60 이격도%<-12.44 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'diBear',type:'bin'}], src:{n:324,late:0.0533,n10:0.735,surv:0.661,lens:0.735,retLens:0.067,h1:0.83,h2:0.64}},
  {id:'dc_r_L52', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + ADX>23.35 + MA60 이격도%<-12.44',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev60',type:'num',dir:'lt',th:-12.44}], src:{n:139,late:0.0595,n10:0.777,surv:0.727,lens:0.777,retLens:0.0663,h1:0.86,h2:0.68}},
  {id:'dc_r_L53', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA20 이격도%<-7.12 + MA5 기울기%<-3.61',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:348,late:0.0519,n10:0.753,surv:0.656,lens:0.724,retLens:0.0661,h1:0.75,h2:0.68}},
  {id:'dc_r_L54', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-12.44 + VR(거래량비율)<60.95 + 골든크로스 5×9',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'vr',type:'num',dir:'lt',th:60.95}, {key:'gx5_9',type:'bin'}], src:{n:53,late:0.0584,n10:0.792,surv:0.696,lens:0.792,retLens:0.0661,h1:0.94,h2:0.59}},
  {id:'dc_r_L55', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<7.95 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'rsiDiv',type:'bin'}], src:{n:98,late:0.0484,n10:0.765,surv:0.718,lens:0.745,retLens:0.0657,h1:0.77,h2:0.73}},
  {id:'dc_r_L56', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.12 + MA120 이격도%<-20.38 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'dev120',type:'num',dir:'lt',th:-20.38}, {key:'rsiDiv',type:'bin'}], src:{n:94,late:0.0534,n10:0.766,surv:0.714,lens:0.755,retLens:0.0654,h1:0.76,h2:0.75}},
  {id:'dc_r_L57', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + RSI 상승다이버전스 + VR(거래량비율)<60.95',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:61,late:0.0605,n10:0.77,surv:0.754,lens:0.787,retLens:0.0651,h1:0.94,h2:0.72}},
  {id:'dc_r_L58', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA5 기울기%<-3.61 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'rsiDiv',type:'bin'}], src:{n:86,late:0.0548,n10:0.721,surv:0.699,lens:0.744,retLens:0.0645,h1:0.74,h2:0.75}},
  {id:'dc_r_L59', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<7.95 + MA20 이격도%<-7.12',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:397,late:0.052,n10:0.763,surv:0.681,lens:0.751,retLens:0.0643,h1:0.82,h2:0.65}},
  {id:'dc_r_L60', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<7.95 + MA20 이격도%<-7.12 + RSI 상승다이버전스',
   conds:[{key:'stochK',type:'num',dir:'lt',th:7.95}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'rsiDiv',type:'bin'}], src:{n:79,late:0.0537,n10:0.772,surv:0.705,lens:0.747,retLens:0.0635,h1:0.73,h2:0.76}},
  {id:'dc_r_L61', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA20 이격도%<-7.12 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'rsiDiv',type:'bin'}], src:{n:109,late:0.0555,n10:0.725,surv:0.717,lens:0.734,retLens:0.0633,h1:0.74,h2:0.73}},
  {id:'dc_r_L62', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:134,late:0.048,n10:0.746,surv:0.716,lens:0.731,retLens:0.0631,h1:0.74,h2:0.73}},
  {id:'dc_r_L63', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + ADX>23.35 + MFI(자금흐름)<35.82',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'mfi',type:'num',dir:'lt',th:35.82}], src:{n:184,late:0.0463,n10:0.734,surv:0.681,lens:0.766,retLens:0.0621,h1:0.88,h2:0.64}},
  {id:'dc_r_L64', pool:'deadcat', kind:'real', mode:'and', label:'ADX>23.35 + MA5 기울기%<-3.61 + VR(거래량비율)<60.95',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:164,late:0.0509,n10:0.744,surv:0.706,lens:0.75,retLens:0.062,h1:0.85,h2:0.63}},
  {id:'dc_r_L65', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.95 + 지지선 근접',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.95}, {key:'nearSup',type:'bin'}], src:{n:60,late:0.0575,n10:0.833,surv:0.762,lens:0.817,retLens:0.062,h1:0.9,h2:0.78}},
  {id:'dc_r_L66', pool:'deadcat', kind:'real', mode:'and', label:'ADX>23.35 + VR(거래량비율)<60.95 + 골든크로스 5×9',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'vr',type:'num',dir:'lt',th:60.95}, {key:'gx5_9',type:'bin'}], src:{n:126,late:0.049,n10:0.754,surv:0.732,lens:0.738,retLens:0.0613,h1:0.79,h2:0.67}},
  {id:'dc_r_L67', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.12 + RSI 상승다이버전스 + VR(거래량비율)<60.95',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:52,late:0.0627,n10:0.75,surv:0.742,lens:0.75,retLens:0.0612,h1:0.92,h2:0.69}},
  {id:'dc_r_L68', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + ADX>23.35 + VR(거래량비율)<60.95',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:107,late:0.0481,n10:0.748,surv:0.695,lens:0.785,retLens:0.0612,h1:0.85,h2:0.69}},
  {id:'dc_r_L69', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>10.9 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:10.9}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:163,late:0.049,n10:0.761,surv:0.679,lens:0.742,retLens:0.0611,h1:0.77,h2:0.71}},
  {id:'dc_r_L70', pool:'deadcat', kind:'real', mode:'and', label:'ADX>23.35 + MA20 이격도%<-7.12 + VR(거래량비율)<60.95',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'vr',type:'num',dir:'lt',th:60.95}], src:{n:248,late:0.0451,n10:0.746,surv:0.704,lens:0.746,retLens:0.0596,h1:0.86,h2:0.6}},
  // ── deadcat · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 11개 ──
  {id:'dc_f_L01', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:61,late:-0.017,n10:0.492,surv:0.51,lens:0.361,retLens:-0.0227,h1:0.4,h2:0.31}},
  {id:'dc_f_L02', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-12.44 + OBV 상승추세 + 골든크로스 5×20',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:32,late:0.0001,n10:0.5,surv:0.559,lens:0.5,retLens:-0.0144,h1:0.47,h2:0.54}},
  {id:'dc_f_L03', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-12.44 + OBV 상승추세 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:32,late:0.0001,n10:0.5,surv:0.559,lens:0.5,retLens:-0.0144,h1:0.47,h2:0.54}},
  {id:'dc_f_L04', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-12.44 + OBV 상승추세 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-12.44}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:32,late:0.0001,n10:0.5,surv:0.559,lens:0.5,retLens:-0.0144,h1:0.47,h2:0.54}},
  {id:'dc_f_L05', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:103,late:-0.008,n10:0.524,surv:0.515,lens:0.437,retLens:-0.0144,h1:0.5,h2:0.33}},
  {id:'dc_f_L06', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:98,late:-0.007,n10:0.541,surv:0.527,lens:0.449,retLens:-0.0131,h1:0.49,h2:0.37}},
  {id:'dc_f_L07', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + 골든크로스 5×9',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:41,late:0.0043,n10:0.488,surv:0.559,lens:0.366,retLens:-0.0097,h1:0.31,h2:0.47}},
  {id:'dc_f_L08', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-20.38 + OBV 상승추세 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-20.38}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:42,late:0.0066,n10:0.381,surv:0.505,lens:0.429,retLens:-0.0068,h1:0.5,h2:0.33}},
  {id:'dc_f_L09', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:183,late:-0.0016,n10:0.557,surv:0.533,lens:0.492,retLens:-0.0062,h1:0.47,h2:0.54}},
  {id:'dc_f_L10', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:83,late:-0.0055,n10:0.578,surv:0.543,lens:0.494,retLens:-0.0061,h1:0.55,h2:0.4}},
  {id:'dc_f_L11', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-20.38 + 지지선 근접 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-20.38}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:32,late:-0.0049,n10:0.469,surv:0.513,lens:0.438,retLens:-0.0058,h1:0.38,h2:0.47}},
  // ── pullback · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 11개 ──
  {id:'pb_r_L01', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>75.26 + ADX<14.11 + MA5 기울기%>2.07',
   conds:[{key:'stochK',type:'num',dir:'gt',th:75.26}, {key:'adx',type:'num',dir:'lt',th:14.11}, {key:'ma5slope',type:'num',dir:'gt',th:2.07}], src:{n:206,late:0.0853,n10:0.709,surv:0.678,lens:0.772,retLens:0.138,h1:0.76,h2:0.78}},
  {id:'pb_r_L02', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.11 + MA20 이격도%>4.03 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.11}, {key:'dev20',type:'num',dir:'gt',th:4.03}, {key:'gx5_20',type:'bin'}], src:{n:149,late:0.0879,n10:0.705,surv:0.672,lens:0.785,retLens:0.1365,h1:0.8,h2:0.78}},
  {id:'pb_r_L03', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.82 + ADX<14.11 + MA5 기울기%>2.07',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.82}, {key:'adx',type:'num',dir:'lt',th:14.11}, {key:'ma5slope',type:'num',dir:'gt',th:2.07}], src:{n:223,late:0.0803,n10:0.7,surv:0.662,lens:0.762,retLens:0.1327,h1:0.74,h2:0.78}},
  {id:'pb_r_L04', pool:'pullback', kind:'real', mode:'and', label:'CCI>51.82 + 골든크로스 5×20 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'gt',th:51.82}, {key:'gx5_20',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:64,late:0.0791,n10:0.75,surv:0.695,lens:0.75,retLens:0.1277,h1:0.63,h2:0.79}},
  {id:'pb_r_L05', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.82 + ADX<14.11 + 골든크로스 5×20',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.82}, {key:'adx',type:'num',dir:'lt',th:14.11}, {key:'gx5_20',type:'bin'}], src:{n:195,late:0.0859,n10:0.672,surv:0.666,lens:0.754,retLens:0.1276,h1:0.69,h2:0.8}},
  {id:'pb_r_L06', pool:'pullback', kind:'real', mode:'and', label:'CCI>51.82 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'gt',th:51.82}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:120,late:0.074,n10:0.792,surv:0.667,lens:0.808,retLens:0.1223,h1:0.78,h2:0.83}},
  {id:'pb_r_L07', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-6.55 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-6.55}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:257,late:0.067,n10:0.782,surv:0.663,lens:0.763,retLens:0.1217,h1:0.71,h2:0.79}},
  {id:'pb_r_L08', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-6.55 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-6.55}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:144,late:0.0716,n10:0.785,surv:0.677,lens:0.757,retLens:0.1174,h1:0.68,h2:0.83}},
  {id:'pb_r_L09', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.11 + MA60 이격도%<-6.55 + RSI 상승다이버전스',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.11}, {key:'dev60',type:'num',dir:'lt',th:-6.55}, {key:'rsiDiv',type:'bin'}], src:{n:56,late:0.0938,n10:0.696,surv:0.646,lens:0.768,retLens:0.1096,h1:0.67,h2:0.88}},
  {id:'pb_r_L10', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%>4.03 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'gt',th:4.03}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:56,late:0.0601,n10:0.821,surv:0.666,lens:0.75,retLens:0.1082,h1:0.85,h2:0.72}},
  {id:'pb_r_L11', pool:'pullback', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 지지선 근접 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:157,late:0.0659,n10:0.777,surv:0.668,lens:0.752,retLens:0.1072,h1:0.68,h2:0.83}},
  // ── pullback · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 2개 ──
  {id:'pb_f_L01', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<-2.45 + OBV 상승다이버전스 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-2.45}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:46,late:-0.0067,n10:0.587,surv:0.537,lens:0.457,retLens:-0.009,h1:0.52,h2:0.38}},
  {id:'pb_f_L02', pool:'pullback', kind:'fake', mode:'and', label:'BB %B>0.82 + OBV 상승추세 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.82}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:36,late:0.0077,n10:0.5,surv:0.525,lens:0.444,retLens:-0.0072,h1:0.48,h2:0.38}},
  ],
  us: [
  // ── deadcat · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 12개 ──
  {id:'dc_r_L01', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + BB %B>0.77 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'gx5_20',type:'bin'}], src:{n:61,late:0.0663,n10:0.803,surv:0.731,lens:0.82,retLens:0.1032,h1:0.95,h2:0.55}},
  {id:'dc_r_L02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + Stoch %K>84.74 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'gx5_9',type:'bin'}], src:{n:59,late:0.0475,n10:0.763,surv:0.715,lens:0.814,retLens:0.0885,h1:0.87,h2:0.58}},
  {id:'dc_r_L03', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + MA60 이격도%<-13 + VR(거래량비율)<100.43',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'dev60',type:'num',dir:'lt',th:-13}, {key:'vr',type:'num',dir:'lt',th:100.43}], src:{n:76,late:0.0678,n10:0.776,surv:0.709,lens:0.763,retLens:0.0778,h1:0.74,h2:0.78}},
  {id:'dc_r_L04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + MA200 이격도%<-26.2 + VR(거래량비율)<100.43',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'dev200',type:'num',dir:'lt',th:-26.2}, {key:'vr',type:'num',dir:'lt',th:100.43}], src:{n:79,late:0.0654,n10:0.709,surv:0.658,lens:0.684,retLens:0.0731,h1:0.82,h2:0.59}},
  {id:'dc_r_L05', pool:'deadcat', kind:'real', mode:'and', label:'ADX>24.5 + MA20 이격도%<-6.78 + MA200 이격도%<-26.2',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.5}, {key:'dev20',type:'num',dir:'lt',th:-6.78}, {key:'dev200',type:'num',dir:'lt',th:-26.2}], src:{n:280,late:0.0445,n10:0.711,surv:0.627,lens:0.754,retLens:0.068,h1:0.87,h2:0.68}},
  {id:'dc_r_L06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + MA120 이격도%<-20.42 + VR(거래량비율)<100.43',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'dev120',type:'num',dir:'lt',th:-20.42}, {key:'vr',type:'num',dir:'lt',th:100.43}], src:{n:81,late:0.0625,n10:0.716,surv:0.663,lens:0.691,retLens:0.0671,h1:0.8,h2:0.64}},
  {id:'dc_r_L07', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-6.78 + MA120 이격도%<-20.42 + VR(거래량비율)<100.43',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.78}, {key:'dev120',type:'num',dir:'lt',th:-20.42}, {key:'vr',type:'num',dir:'lt',th:100.43}], src:{n:419,late:0.041,n10:0.699,surv:0.627,lens:0.737,retLens:0.066,h1:0.86,h2:0.66}},
  {id:'dc_r_L08', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K>84.74 + MA5 기울기%>2.6 + VR(거래량비율)<100.43',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'ma5slope',type:'num',dir:'gt',th:2.6}, {key:'vr',type:'num',dir:'lt',th:100.43}], src:{n:122,late:0.0382,n10:0.664,surv:0.674,lens:0.664,retLens:0.0645,h1:0.76,h2:0.55}},
  {id:'dc_r_L09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + ADX>24.5 + MA60 이격도%<-13',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'adx',type:'num',dir:'gt',th:24.5}, {key:'dev60',type:'num',dir:'lt',th:-13}], src:{n:72,late:0.0548,n10:0.708,surv:0.671,lens:0.694,retLens:0.0548,h1:0.75,h2:0.66}},
  {id:'dc_r_L10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.77 + CCI>66.29 + ADX>24.5',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'cci',type:'num',dir:'gt',th:66.29}, {key:'adx',type:'num',dir:'gt',th:24.5}], src:{n:51,late:0.0322,n10:0.706,surv:0.678,lens:0.725,retLens:0.0477,h1:0.96,h2:0.52}},
  {id:'dc_r_L11', pool:'deadcat', kind:'real', mode:'and', label:'RSI<33.77 + MA20 이격도%<-6.78 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.77}, {key:'dev20',type:'num',dir:'lt',th:-6.78}, {key:'rsiDiv',type:'bin'}], src:{n:57,late:0.0417,n10:0.719,surv:0.711,lens:0.667,retLens:0.0455,h1:0.8,h2:0.64}},
  {id:'dc_r_L12', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:58,late:0.032,n10:0.672,surv:0.667,lens:0.707,retLens:0.039,h1:1,h2:0.65}},
  // ── deadcat · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 40개 ──
  {id:'dc_f_L01', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:65,late:-0.026,n10:0.323,surv:0.414,lens:0.292,retLens:-0.0289,h1:0.42,h2:0.14}},
  {id:'dc_f_L02', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.5 + MA5 기울기%>2.6 + MFI(자금흐름)>63.7 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.5}, {key:'ma5slope',type:'num',dir:'gt',th:2.6}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'gx5_20',type:'bin'}], src:{n:48,late:-0.0096,n10:0.292,surv:0.475,lens:0.333,retLens:-0.0229,h1:0.36,h2:0.32}},
  {id:'dc_f_L03', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:49,late:-0.018,n10:0.327,surv:0.422,lens:0.265,retLens:-0.0209,h1:0.37,h2:0.14}},
  {id:'dc_f_L04', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.7 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:32,late:-0.011,n10:0.375,surv:0.456,lens:0.375,retLens:-0.0204,h1:0.43,h2:0.33}},
  {id:'dc_f_L05', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:120,late:-0.0142,n10:0.467,surv:0.486,lens:0.442,retLens:-0.0203,h1:0.47,h2:0.43}},
  {id:'dc_f_L06', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:45,late:-0.016,n10:0.356,surv:0.462,lens:0.311,retLens:-0.0165,h1:0.38,h2:0.19}},
  {id:'dc_f_L07', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:127,late:-0.0124,n10:0.457,surv:0.48,lens:0.457,retLens:-0.0161,h1:0.48,h2:0.44}},
  {id:'dc_f_L08', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:130,late:-0.0121,n10:0.454,surv:0.476,lens:0.454,retLens:-0.0159,h1:0.48,h2:0.44}},
  {id:'dc_f_L09', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.77 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.77}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:289,late:-0.007,n10:0.446,surv:0.48,lens:0.433,retLens:-0.0158,h1:0.45,h2:0.42}},
  {id:'dc_f_L10', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.7 + BB 스퀴즈 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:32,late:-0.0146,n10:0.344,surv:0.416,lens:0.313,retLens:-0.0154,h1:0.39,h2:0.21}},
  {id:'dc_f_L11', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:37,late:-0.0138,n10:0.351,surv:0.465,lens:0.297,retLens:-0.0151,h1:0.38,h2:0.09}},
  {id:'dc_f_L12', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.5 + OBV 상승추세 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.5}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:51,late:-0.0047,n10:0.353,surv:0.482,lens:0.333,retLens:-0.0148,h1:0.31,h2:0.36}},
  {id:'dc_f_L13', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:40,late:-0.0156,n10:0.325,surv:0.423,lens:0.3,retLens:-0.0148,h1:0.36,h2:0.2}},
  {id:'dc_f_L14', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + BB 스퀴즈 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:43,late:-0.0149,n10:0.326,surv:0.414,lens:0.326,retLens:-0.0132,h1:0.39,h2:0.2}},
  {id:'dc_f_L15', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + BB %B>0.77 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:44,late:-0.0142,n10:0.341,surv:0.423,lens:0.341,retLens:-0.0128,h1:0.41,h2:0.2}},
  {id:'dc_f_L16', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.7 + OBV 상승추세 + DI 하락우위 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:-0.0056,n10:0.34,surv:0.436,lens:0.415,retLens:-0.0122,h1:0.46,h2:0.4}},
  {id:'dc_f_L17', pool:'deadcat', kind:'fake', mode:'and', label:'VR(거래량비율)<100.43 + OBV 상승추세 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'vr',type:'num',dir:'lt',th:100.43}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:59,late:-0.0046,n10:0.492,surv:0.532,lens:0.424,retLens:-0.0121,h1:0.37,h2:0.5}},
  {id:'dc_f_L18', pool:'deadcat', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:49,late:-0.0144,n10:0.367,surv:0.435,lens:0.327,retLens:-0.0121,h1:0.41,h2:0.2}},
  {id:'dc_f_L19', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:110,late:-0.0071,n10:0.509,surv:0.474,lens:0.445,retLens:-0.0115,h1:0.49,h2:0.42}},
  {id:'dc_f_L20', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:110,late:-0.0071,n10:0.509,surv:0.474,lens:0.445,retLens:-0.0115,h1:0.49,h2:0.42}},
  {id:'dc_f_L21', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.5 + OBV 상승추세 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.5}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:135,late:-0.0044,n10:0.4,surv:0.476,lens:0.378,retLens:-0.0113,h1:0.38,h2:0.38}},
  {id:'dc_f_L22', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 지지선 근접 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:81,late:-0.0093,n10:0.457,surv:0.489,lens:0.42,retLens:-0.0101,h1:0.35,h2:0.5}},
  {id:'dc_f_L23', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + MFI(자금흐름)>63.7 + BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:30,late:-0.0102,n10:0.367,surv:0.433,lens:0.333,retLens:-0.0095,h1:0.41,h2:0.23}},
  {id:'dc_f_L24', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + MFI(자금흐름)>63.7 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}], src:{n:72,late:-0.008,n10:0.389,surv:0.464,lens:0.333,retLens:-0.009,h1:0.41,h2:0.21}},
  {id:'dc_f_L25', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + BB %B>0.77 + MFI(자금흐름)>63.7 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}], src:{n:72,late:-0.008,n10:0.389,surv:0.464,lens:0.333,retLens:-0.009,h1:0.41,h2:0.21}},
  {id:'dc_f_L26', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + MFI(자금흐름)>63.7 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:72,late:-0.008,n10:0.389,surv:0.464,lens:0.333,retLens:-0.009,h1:0.41,h2:0.21}},
  {id:'dc_f_L27', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + MFI(자금흐름)>63.7 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:71,late:-0.0081,n10:0.38,surv:0.463,lens:0.338,retLens:-0.0088,h1:0.42,h2:0.21}},
  {id:'dc_f_L28', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:119,late:0.002,n10:0.471,surv:0.524,lens:0.437,retLens:-0.0085,h1:0.39,h2:0.48}},
  {id:'dc_f_L29', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.5 + MFI(자금흐름)>63.7 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.5}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.0006,n10:0.3,surv:0.457,lens:0.35,retLens:-0.0083,h1:0.31,h2:0.37}},
  {id:'dc_f_L30', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.74 + RSI 상승다이버전스',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'rsiDiv',type:'bin'}], src:{n:90,late:-0.006,n10:0.478,surv:0.523,lens:0.444,retLens:-0.0083,h1:0.41,h2:0.46}},
  {id:'dc_f_L31', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.74 + RSI 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:90,late:-0.006,n10:0.478,surv:0.523,lens:0.444,retLens:-0.0083,h1:0.41,h2:0.46}},
  {id:'dc_f_L32', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.77 + MFI(자금흐름)>63.7 + OBV 상승추세 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.77}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:69,late:-0.0079,n10:0.391,surv:0.459,lens:0.333,retLens:-0.0082,h1:0.4,h2:0.23}},
  {id:'dc_f_L33', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.7 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:86,late:-0.0062,n10:0.407,surv:0.479,lens:0.36,retLens:-0.0074,h1:0.43,h2:0.24}},
  {id:'dc_f_L34', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.7 + OBV 상승추세 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:79,late:-0.0062,n10:0.418,surv:0.484,lens:0.367,retLens:-0.007,h1:0.45,h2:0.23}},
  {id:'dc_f_L35', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + MFI(자금흐름)>63.7 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:81,late:-0.0057,n10:0.407,surv:0.479,lens:0.358,retLens:-0.0069,h1:0.43,h2:0.21}},
  {id:'dc_f_L36', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + MFI(자금흐름)>63.7 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'mfi',type:'num',dir:'gt',th:63.7}, {key:'squeeze',type:'bin'}], src:{n:82,late:-0.0052,n10:0.415,surv:0.483,lens:0.366,retLens:-0.0067,h1:0.44,h2:0.21}},
  {id:'dc_f_L37', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>66.29 + Stoch %K>84.74 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'cci',type:'num',dir:'gt',th:66.29}, {key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:65,late:-0.0054,n10:0.523,surv:0.54,lens:0.446,retLens:-0.0065,h1:0.43,h2:0.45}},
  {id:'dc_f_L38', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.74 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.74}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:74,late:-0.005,n10:0.514,surv:0.543,lens:0.459,retLens:-0.0062,h1:0.41,h2:0.48}},
  {id:'dc_f_L39', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 지지선 근접 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:54,late:-0.003,n10:0.444,surv:0.489,lens:0.407,retLens:-0.0054,h1:0.47,h2:0.38}},
  {id:'dc_f_L40', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 지지선 근접 + BB 스퀴즈',
   conds:[{key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:55,late:-0.0027,n10:0.455,surv:0.498,lens:0.418,retLens:-0.0051,h1:0.47,h2:0.39}},
  // ── pullback · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 26개 ──
  {id:'pb_r_L01', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + MFI(자금흐름)>59.89 + BB 스퀴즈',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'mfi',type:'num',dir:'gt',th:59.89}, {key:'squeeze',type:'bin'}], src:{n:50,late:0.1154,n10:0.72,surv:0.718,lens:0.76,retLens:0.0794,h1:0.8,h2:0.7}},
  {id:'pb_r_L02', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:65,late:0.0987,n10:0.738,surv:0.742,lens:0.831,retLens:0.0658,h1:0.85,h2:0.82}},
  {id:'pb_r_L03', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}], src:{n:77,late:0.0833,n10:0.688,surv:0.686,lens:0.792,retLens:0.0619,h1:0.79,h2:0.79}},
  {id:'pb_r_L04', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA200 이격도%>23.39 + MFI(자금흐름)>59.89',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'mfi',type:'num',dir:'gt',th:59.89}], src:{n:57,late:0.0831,n10:0.702,surv:0.718,lens:0.754,retLens:0.0603,h1:0.89,h2:0.69}},
  {id:'pb_r_L05', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78 + OBV 상승추세',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'obvUp',type:'bin'}], src:{n:63,late:0.075,n10:0.683,surv:0.683,lens:0.73,retLens:0.0562,h1:0.81,h2:0.7}},
  {id:'pb_r_L06', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.65 + MA120 이격도%>14.78 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}], src:{n:80,late:0.0722,n10:0.675,surv:0.656,lens:0.763,retLens:0.0548,h1:0.75,h2:0.77}},
  {id:'pb_r_L07', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78 + MA200 이격도%>23.39',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:84,late:0.0855,n10:0.738,surv:0.696,lens:0.738,retLens:0.054,h1:0.91,h2:0.67}},
  {id:'pb_r_L08', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + 골든크로스 5×9',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}], src:{n:78,late:0.0787,n10:0.705,surv:0.713,lens:0.833,retLens:0.0539,h1:0.86,h2:0.82}},
  {id:'pb_r_L09', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:83,late:0.0828,n10:0.759,surv:0.696,lens:0.783,retLens:0.0536,h1:0.78,h2:0.79}},
  {id:'pb_r_L10', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:92,late:0.0838,n10:0.75,surv:0.725,lens:0.826,retLens:0.0528,h1:0.77,h2:0.86}},
  {id:'pb_r_L11', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}], src:{n:90,late:0.083,n10:0.744,surv:0.701,lens:0.744,retLens:0.0525,h1:0.9,h2:0.67}},
  {id:'pb_r_L12', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + ADX<14.48 + MA200 이격도%>23.39',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:72,late:0.0722,n10:0.681,surv:0.663,lens:0.694,retLens:0.052,h1:0.89,h2:0.63}},
  {id:'pb_r_L13', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.65 + MA120 이격도%>14.78 + 골든크로스 5×9',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}], src:{n:85,late:0.0726,n10:0.682,surv:0.689,lens:0.8,retLens:0.0495,h1:0.81,h2:0.79}},
  {id:'pb_r_L14', pool:'pullback', kind:'real', mode:'and', label:'RSI>54.29 + ADX<14.48 + MA200 이격도%>23.39',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:70,late:0.0634,n10:0.686,surv:0.663,lens:0.729,retLens:0.0468,h1:0.86,h2:0.7}},
  {id:'pb_r_L15', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%>4.96 + OBV 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'gt',th:4.96}, {key:'obvDiv',type:'bin'}], src:{n:54,late:0.0556,n10:0.63,surv:0.669,lens:0.741,retLens:0.0436,h1:0.79,h2:0.73}},
  {id:'pb_r_L16', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.65 + MA120 이격도%>14.78 + MA20 돌파안착(상승)',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'settle20',type:'bin'}], src:{n:193,late:0.0659,n10:0.684,surv:0.653,lens:0.689,retLens:0.0415,h1:0.72,h2:0.67}},
  {id:'pb_r_L17', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + MA20 돌파안착(상승)',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'settle20',type:'bin'}], src:{n:195,late:0.0651,n10:0.672,surv:0.648,lens:0.687,retLens:0.0409,h1:0.72,h2:0.67}},
  {id:'pb_r_L18', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×20',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_20',type:'bin'}], src:{n:75,late:0.0696,n10:0.64,surv:0.656,lens:0.72,retLens:0.0399,h1:0.67,h2:0.76}},
  {id:'pb_r_L19', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:70,late:0.0628,n10:0.643,surv:0.633,lens:0.686,retLens:0.0394,h1:0.7,h2:0.67}},
  {id:'pb_r_L20', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + 골든크로스 5×20',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_20',type:'bin'}], src:{n:56,late:0.0678,n10:0.643,surv:0.655,lens:0.732,retLens:0.0393,h1:0.62,h2:0.8}},
  {id:'pb_r_L21', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.65 + MA120 이격도%>14.78 + 골든크로스 5×20',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_20',type:'bin'}], src:{n:56,late:0.0678,n10:0.643,surv:0.655,lens:0.732,retLens:0.0393,h1:0.62,h2:0.8}},
  {id:'pb_r_L22', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA20 이격도%<-7.08 + MA200 이격도%>23.39',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev20',type:'num',dir:'lt',th:-7.08}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:75,late:0.0678,n10:0.693,surv:0.677,lens:0.693,retLens:0.0384,h1:0.55,h2:0.78}},
  {id:'pb_r_L23', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + MA200 이격도%>23.39 + 골든크로스 5×20',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'gx5_20',type:'bin'}], src:{n:70,late:0.0647,n10:0.629,surv:0.647,lens:0.7,retLens:0.0376,h1:0.61,h2:0.76}},
  {id:'pb_r_L24', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + OBV 상승다이버전스 + OBV 상승추세',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:52,late:0.0742,n10:0.846,surv:0.767,lens:0.769,retLens:0.0358,h1:0.68,h2:0.9}},
  {id:'pb_r_L25', pool:'pullback', kind:'real', mode:'and', label:'RSI>54.29 + MA120 이격도%>14.78 + 골든크로스 5×20',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_20',type:'bin'}], src:{n:55,late:0.0596,n10:0.636,surv:0.645,lens:0.727,retLens:0.0346,h1:0.59,h2:0.79}},
  {id:'pb_r_L26', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>23.39 + OBV 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'obvDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:72,late:0.0619,n10:0.653,surv:0.671,lens:0.708,retLens:0.0346,h1:0.67,h2:0.72}},
  // ── pullback · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 4개 ──
  {id:'pb_f_L01', pool:'pullback', kind:'fake', mode:'and', label:'RSI>54.29 + BB %B>0.65 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:0.0014,n10:0.606,surv:0.482,lens:0.455,retLens:-0.0071,h1:0.44,h2:0.47}},
  {id:'pb_f_L02', pool:'pullback', kind:'fake', mode:'and', label:'RSI>54.29 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:32,late:0.0027,n10:0.625,surv:0.478,lens:0.469,retLens:-0.0062,h1:0.44,h2:0.5}},
  {id:'pb_f_L03', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×20 + MA20 돌파안착(상승) + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'settle20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:92,late:-0.0141,n10:0.446,surv:0.451,lens:0.446,retLens:-0.0055,h1:0.36,h2:0.53}},
  {id:'pb_f_L04', pool:'pullback', kind:'fake', mode:'and', label:'RSI>54.29 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:38,late:0.0027,n10:0.605,surv:0.482,lens:0.447,retLens:-0.0054,h1:0.38,h2:0.53}},
  ],
  coin: [
  // ── deadcat · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 41개 ──
  {id:'dc_r_L01', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:120,late:0.1112,n10:0.783,surv:0.737,lens:0.767,retLens:0.0623,h1:0.8,h2:0.73}},
  {id:'dc_r_L02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:77,late:0.0951,n10:0.727,surv:0.63,lens:0.61,retLens:0.0577,h1:0.63,h2:0.59}},
  {id:'dc_r_L03', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA200 이격도%<-47.2 + MACD 골든크로스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdGc',type:'bin'}], src:{n:66,late:0.0688,n10:0.606,surv:0.668,lens:0.697,retLens:0.0496,h1:0.61,h2:0.76}},
  {id:'dc_r_L04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:64,late:0.0511,n10:0.719,surv:0.692,lens:0.766,retLens:0.0459,h1:0.67,h2:0.85}},
  {id:'dc_r_L05', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:80,late:0.0706,n10:0.75,surv:0.678,lens:0.7,retLens:0.0422,h1:0.81,h2:0.61}},
  {id:'dc_r_L06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:105,late:0.0779,n10:0.657,surv:0.624,lens:0.676,retLens:0.0413,h1:0.71,h2:0.66}},
  {id:'dc_r_L07', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:80,late:0.0386,n10:0.613,surv:0.621,lens:0.688,retLens:0.0402,h1:0.63,h2:0.73}},
  {id:'dc_r_L08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:75,late:0.0452,n10:0.72,surv:0.656,lens:0.653,retLens:0.0387,h1:0.59,h2:0.71}},
  {id:'dc_r_L09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'nearSup',type:'bin'}], src:{n:139,late:0.0434,n10:0.647,surv:0.645,lens:0.712,retLens:0.0385,h1:0.69,h2:0.74}},
  {id:'dc_r_L10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:112,late:0.0439,n10:0.661,surv:0.664,lens:0.705,retLens:0.0372,h1:0.75,h2:0.64}},
  {id:'dc_r_L11', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2 + MACD 골든크로스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdGc',type:'bin'}], src:{n:57,late:0.0472,n10:0.684,surv:0.621,lens:0.596,retLens:0.0369,h1:0.73,h2:0.44}},
  {id:'dc_r_L12', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:115,late:0.0445,n10:0.626,surv:0.672,lens:0.713,retLens:0.0365,h1:0.63,h2:0.81}},
  {id:'dc_r_L13', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + OBV 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvDiv',type:'bin'}], src:{n:53,late:0.0312,n10:0.566,surv:0.57,lens:0.642,retLens:0.036,h1:0.64,h2:0.64}},
  {id:'dc_r_L14', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + MFI(자금흐름)>51.87',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:63,late:0.037,n10:0.556,surv:0.606,lens:0.667,retLens:0.0359,h1:0.69,h2:0.65}},
  {id:'dc_r_L15', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:182,late:0.0507,n10:0.599,surv:0.568,lens:0.588,retLens:0.0354,h1:0.56,h2:0.6}},
  {id:'dc_r_L16', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA20 이격도%<-11.66 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:66,late:0.0359,n10:0.576,surv:0.608,lens:0.667,retLens:0.0338,h1:0.81,h2:0.6}},
  {id:'dc_r_L17', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA5 기울기%<-5.14 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'nearSup',type:'bin'}], src:{n:159,late:0.0365,n10:0.597,surv:0.62,lens:0.667,retLens:0.0335,h1:0.64,h2:0.69}},
  {id:'dc_r_L18', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:59,late:0.0495,n10:0.695,surv:0.681,lens:0.712,retLens:0.0324,h1:0.75,h2:0.6}},
  {id:'dc_r_L19', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + BB %B<0.12 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:114,late:0.0316,n10:0.579,surv:0.636,lens:0.667,retLens:0.0323,h1:0.63,h2:0.71}},
  {id:'dc_r_L20', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:100,late:0.0385,n10:0.68,surv:0.635,lens:0.66,retLens:0.0323,h1:0.51,h2:0.76}},
  {id:'dc_r_L21', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA120 이격도%<-33.4 + BB 스퀴즈',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}], src:{n:61,late:0.0479,n10:0.557,surv:0.58,lens:0.59,retLens:0.0318,h1:0.59,h2:0.59}},
  {id:'dc_r_L22', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:53,late:0.0373,n10:0.604,surv:0.581,lens:0.623,retLens:0.0296,h1:0.59,h2:0.65}},
  {id:'dc_r_L23', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + OBV 상승추세',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvUp',type:'bin'}], src:{n:70,late:0.0351,n10:0.586,surv:0.604,lens:0.671,retLens:0.029,h1:0.71,h2:0.64}},
  {id:'dc_r_L24', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + OBV 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvDiv',type:'bin'}], src:{n:72,late:0.0347,n10:0.556,surv:0.596,lens:0.681,retLens:0.0287,h1:0.61,h2:0.81}},
  {id:'dc_r_L25', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:126,late:0.0328,n10:0.651,surv:0.629,lens:0.667,retLens:0.0282,h1:0.62,h2:0.72}},
  {id:'dc_r_L26', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:50,late:0.0474,n10:0.58,surv:0.586,lens:0.62,retLens:0.0279,h1:0.45,h2:0.94}},
  {id:'dc_r_L27', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + OBV 상승추세',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvUp',type:'bin'}], src:{n:62,late:0.0258,n10:0.548,surv:0.605,lens:0.661,retLens:0.0238,h1:0.72,h2:0.62}},
  {id:'dc_r_L28', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'squeeze',type:'bin'}], src:{n:82,late:0.04,n10:0.585,surv:0.606,lens:0.61,retLens:0.0236,h1:0.54,h2:0.76}},
  {id:'dc_r_L29', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + Stoch %K<9.23 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:64,late:0.0297,n10:0.641,surv:0.608,lens:0.625,retLens:0.0233,h1:0.63,h2:0.62}},
  {id:'dc_r_L30', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:56,late:0.0339,n10:0.607,surv:0.573,lens:0.625,retLens:0.0232,h1:0.66,h2:0.56}},
  {id:'dc_r_L31', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:59,late:0.0227,n10:0.576,surv:0.556,lens:0.61,retLens:0.0231,h1:0.56,h2:0.68}},
  {id:'dc_r_L32', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:131,late:0.0222,n10:0.58,surv:0.565,lens:0.588,retLens:0.0228,h1:0.5,h2:0.66}},
  {id:'dc_r_L33', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA20 이격도%<-11.66 + MA60 이격도%<-23.29',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:180,late:0.0172,n10:0.55,surv:0.609,lens:0.656,retLens:0.0221,h1:0.69,h2:0.6}},
  {id:'dc_r_L34', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA120 이격도%<-33.4 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}], src:{n:67,late:0.0388,n10:0.478,surv:0.572,lens:0.597,retLens:0.0221,h1:0.45,h2:0.87}},
  {id:'dc_r_L35', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:260,late:0.0272,n10:0.612,surv:0.582,lens:0.608,retLens:0.0217,h1:0.56,h2:0.65}},
  {id:'dc_r_L36', pool:'deadcat', kind:'real', mode:'and', label:'ADX<17.61 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:55,late:0.0424,n10:0.582,surv:0.604,lens:0.636,retLens:0.0214,h1:0.52,h2:0.72}},
  {id:'dc_r_L37', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA60 이격도%<-23.29 + VR(거래량비율)<70.47',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:194,late:0.0171,n10:0.546,surv:0.601,lens:0.629,retLens:0.0214,h1:0.63,h2:0.63}},
  {id:'dc_r_L38', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + BB %B<0.12 + MA60 이격도%<-23.29',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:218,late:0.0185,n10:0.555,surv:0.6,lens:0.619,retLens:0.0212,h1:0.63,h2:0.6}},
  {id:'dc_r_L39', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + ADX<17.61 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:77,late:0.0271,n10:0.636,surv:0.564,lens:0.571,retLens:0.0205,h1:0.46,h2:0.67}},
  {id:'dc_r_L40', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + OBV 상승추세',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvUp',type:'bin'}], src:{n:94,late:0.021,n10:0.521,surv:0.573,lens:0.628,retLens:0.0203,h1:0.7,h2:0.57}},
  {id:'dc_r_L41', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + Stoch %K<9.23 + MA60 이격도%<-23.29',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:144,late:0.0208,n10:0.611,surv:0.615,lens:0.653,retLens:0.0202,h1:0.61,h2:0.7}},
  // ── deadcat · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 42개 ──
  {id:'dc_f_L01', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:53,late:-0.0456,n10:0.264,surv:0.342,lens:0.321,retLens:-0.0309,h1:0.25,h2:0.38}},
  {id:'dc_f_L02', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:44,late:-0.0369,n10:0.341,surv:0.38,lens:0.318,retLens:-0.0304,h1:0.18,h2:0.41}},
  {id:'dc_f_L03', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + RSI 상승다이버전스 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:50,late:-0.0101,n10:0.46,surv:0.404,lens:0.34,retLens:-0.0272,h1:0.33,h2:0.4}},
  {id:'dc_f_L04', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:69,late:-0.0418,n10:0.261,surv:0.377,lens:0.319,retLens:-0.0259,h1:0.39,h2:0.25}},
  {id:'dc_f_L05', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:58,late:-0.041,n10:0.31,surv:0.386,lens:0.345,retLens:-0.0254,h1:0.38,h2:0.31}},
  {id:'dc_f_L06', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:56,late:-0.0447,n10:0.304,surv:0.384,lens:0.339,retLens:-0.0253,h1:0.39,h2:0.28}},
  {id:'dc_f_L07', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}], src:{n:51,late:-0.0388,n10:0.314,surv:0.382,lens:0.353,retLens:-0.0249,h1:0.4,h2:0.31}},
  {id:'dc_f_L08', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:59,late:-0.0403,n10:0.305,surv:0.386,lens:0.356,retLens:-0.0248,h1:0.38,h2:0.33}},
  {id:'dc_f_L09', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + MA120 이격도%<-33.4 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:113,late:-0.0323,n10:0.398,surv:0.347,lens:0.327,retLens:-0.0238,h1:0.36,h2:0.26}},
  {id:'dc_f_L10', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + Stoch %K<9.23 + ADX<17.61 + MA120 이격도%<-33.4',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:48,late:-0.0389,n10:0.375,surv:0.387,lens:0.354,retLens:-0.0228,h1:0.4,h2:0.3}},
  {id:'dc_f_L11', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:42,late:-0.0223,n10:0.333,surv:0.348,lens:0.357,retLens:-0.0225,h1:0.29,h2:0.4}},
  {id:'dc_f_L12', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}], src:{n:78,late:-0.0369,n10:0.269,surv:0.385,lens:0.346,retLens:-0.0225,h1:0.4,h2:0.3}},
  {id:'dc_f_L13', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:74,late:-0.0407,n10:0.284,surv:0.33,lens:0.297,retLens:-0.0224,h1:0.33,h2:0.1}},
  {id:'dc_f_L14', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328,lens:0.293,retLens:-0.0223,h1:0.33,h2:0.09}},
  {id:'dc_f_L15', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328,lens:0.293,retLens:-0.0223,h1:0.33,h2:0.09}},
  {id:'dc_f_L16', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + PSAR 하락',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'sarBear',type:'bin'}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328,lens:0.293,retLens:-0.0223,h1:0.33,h2:0.09}},
  {id:'dc_f_L17', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:48,late:-0.0401,n10:0.313,surv:0.398,lens:0.354,retLens:-0.0218,h1:0.41,h2:0.29}},
  {id:'dc_f_L18', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + VR(거래량비율)<70.47 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:56,late:-0.0305,n10:0.339,surv:0.366,lens:0.339,retLens:-0.0211,h1:0.3,h2:0.36}},
  {id:'dc_f_L19', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:104,late:-0.0382,n10:0.24,surv:0.311,lens:0.337,retLens:-0.0199,h1:0.33,h2:0.38}},
  {id:'dc_f_L20', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + RSI 상승다이버전스 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:34,late:-0.011,n10:0.412,surv:0.397,lens:0.265,retLens:-0.0193,h1:0.25,h2:0.3}},
  {id:'dc_f_L21', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + Stoch %K<9.23 + OBV 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:71,late:-0.026,n10:0.338,surv:0.38,lens:0.352,retLens:-0.0174,h1:0.32,h2:0.38}},
  {id:'dc_f_L22', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-47.2 + RSI 상승다이버전스 + OBV 상승다이버전스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}], src:{n:93,late:-0.0219,n10:0.376,surv:0.365,lens:0.355,retLens:-0.0167,h1:0.35,h2:0.36}},
  {id:'dc_f_L23', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-47.2 + RSI 상승다이버전스 + OBV 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:93,late:-0.0219,n10:0.376,surv:0.365,lens:0.355,retLens:-0.0167,h1:0.35,h2:0.36}},
  {id:'dc_f_L24', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + VR(거래량비율)<70.47 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'gx5_9',type:'bin'}], src:{n:30,late:0.0051,n10:0.5,surv:0.383,lens:0.333,retLens:-0.0162,h1:0.27,h2:0.4}},
  {id:'dc_f_L25', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×20 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_20',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:59,late:-0.0243,n10:0.373,surv:0.356,lens:0.356,retLens:-0.0153,h1:0.36,h2:0.35}},
  {id:'dc_f_L26', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MFI(자금흐름)>51.87 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:91,late:-0.0307,n10:0.286,surv:0.338,lens:0.33,retLens:-0.0151,h1:0.21,h2:0.38}},
  {id:'dc_f_L27', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MFI(자금흐름)>51.87 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:140,late:-0.0292,n10:0.293,surv:0.347,lens:0.343,retLens:-0.015,h1:0.34,h2:0.34}},
  {id:'dc_f_L28', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:83,late:-0.0295,n10:0.265,surv:0.335,lens:0.337,retLens:-0.0138,h1:0.29,h2:0.38}},
  {id:'dc_f_L29', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'settle20',type:'bin'}], src:{n:178,late:-0.0286,n10:0.275,surv:0.342,lens:0.348,retLens:-0.0137,h1:0.27,h2:0.4}},
  {id:'dc_f_L30', pool:'deadcat', kind:'fake', mode:'and', label:'VR(거래량비율)<70.47 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'vr',type:'num',dir:'lt',th:70.47}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:375,late:-0.0264,n10:0.395,surv:0.371,lens:0.344,retLens:-0.0137,h1:0.34,h2:0.35}},
  {id:'dc_f_L31', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:172,late:-0.0276,n10:0.279,surv:0.347,lens:0.355,retLens:-0.013,h1:0.29,h2:0.4}},
  {id:'dc_f_L32', pool:'deadcat', kind:'fake', mode:'and', label:'VR(거래량비율)<70.47 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'vr',type:'num',dir:'lt',th:70.47}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:366,late:-0.025,n10:0.404,surv:0.377,lens:0.352,retLens:-0.0129,h1:0.35,h2:0.36}},
  {id:'dc_f_L33', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:111,late:-0.0304,n10:0.279,surv:0.334,lens:0.333,retLens:-0.0127,h1:0.19,h2:0.41}},
  {id:'dc_f_L34', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<32.65 + VR(거래량비율)<70.47 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:86,late:-0.0164,n10:0.384,surv:0.422,lens:0.337,retLens:-0.0125,h1:0.4,h2:0.23}},
  {id:'dc_f_L35', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:110,late:-0.0298,n10:0.282,surv:0.337,lens:0.336,retLens:-0.0123,h1:0.19,h2:0.41}},
  {id:'dc_f_L36', pool:'deadcat', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×9 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:277,late:-0.0174,n10:0.419,surv:0.382,lens:0.354,retLens:-0.0119,h1:0.36,h2:0.35}},
  {id:'dc_f_L37', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + VR(거래량비율)<70.47 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdGc',type:'bin'}], src:{n:264,late:-0.0136,n10:0.394,surv:0.371,lens:0.345,retLens:-0.0112,h1:0.34,h2:0.35}},
  {id:'dc_f_L38', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + VR(거래량비율)<70.47 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:259,late:-0.0134,n10:0.394,surv:0.373,lens:0.347,retLens:-0.0109,h1:0.35,h2:0.35}},
  {id:'dc_f_L39', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + VR(거래량비율)<70.47 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdGc',type:'bin'}], src:{n:67,late:-0.0038,n10:0.522,surv:0.412,lens:0.328,retLens:-0.0108,h1:0.28,h2:0.39}},
  {id:'dc_f_L40', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<32.65 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:96,late:-0.0131,n10:0.385,surv:0.433,lens:0.344,retLens:-0.0079,h1:0.41,h2:0.24}},
  {id:'dc_f_L41', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<32.65 + VR(거래량비율)<70.47 + BB 스퀴즈 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:96,late:-0.0131,n10:0.385,surv:0.433,lens:0.344,retLens:-0.0079,h1:0.41,h2:0.24}},
  {id:'dc_f_L42', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + VR(거래량비율)<70.47 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:101,late:-0.0149,n10:0.347,surv:0.356,lens:0.307,retLens:-0.0058,h1:0.29,h2:0.33}},
  // ── pullback · real — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 32개 ──
  {id:'pb_r_L01', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.15 + MA5 기울기%<-3.13 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}, {key:'nearSup',type:'bin'}], src:{n:79,late:0.0427,n10:0.684,surv:0.641,lens:0.684,retLens:0.0407,h1:0.97,h2:0.45}},
  {id:'pb_r_L02', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + BB %B<0.13 + MA5 기울기%<-3.13',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}], src:{n:59,late:0.0425,n10:0.576,surv:0.668,lens:0.644,retLens:0.0376,h1:0.82,h2:0.54}},
  {id:'pb_r_L03', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.15 + MA5 기울기%<-3.13',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}], src:{n:91,late:0.0388,n10:0.659,surv:0.62,lens:0.67,retLens:0.0367,h1:0.93,h2:0.43}},
  {id:'pb_r_L04', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.15 + MA5 기울기%<-3.13 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}, {key:'sarBear',type:'bin'}], src:{n:91,late:0.0388,n10:0.659,surv:0.62,lens:0.67,retLens:0.0367,h1:0.93,h2:0.43}},
  {id:'pb_r_L05', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + Stoch %K<14.15 + MA5 기울기%<-3.13',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}], src:{n:71,late:0.0395,n10:0.648,surv:0.617,lens:0.648,retLens:0.0365,h1:0.97,h2:0.43}},
  {id:'pb_r_L06', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.13 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}, {key:'diBear',type:'bin'}], src:{n:71,late:0.0407,n10:0.592,surv:0.666,lens:0.648,retLens:0.0364,h1:0.8,h2:0.54}},
  {id:'pb_r_L07', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.13',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}], src:{n:73,late:0.04,n10:0.589,surv:0.662,lens:0.644,retLens:0.0355,h1:0.81,h2:0.52}},
  {id:'pb_r_L08', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.13 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.13}, {key:'sarBear',type:'bin'}], src:{n:73,late:0.04,n10:0.589,surv:0.662,lens:0.644,retLens:0.0355,h1:0.81,h2:0.52}},
  {id:'pb_r_L09', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + ADX>23.07',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'adx',type:'num',dir:'gt',th:23.07}], src:{n:50,late:0.0368,n10:0.6,surv:0.576,lens:0.66,retLens:0.0332,h1:0.9,h2:0.6}},
  {id:'pb_r_L10', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + Stoch %K<14.15 + MA60 이격도%<-5.23',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'dev60',type:'num',dir:'lt',th:-5.23}], src:{n:69,late:0.0354,n10:0.652,surv:0.62,lens:0.652,retLens:0.0329,h1:1,h2:0.49}},
  {id:'pb_r_L11', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + 지지선 근접 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:69,late:0.0317,n10:0.681,surv:0.584,lens:0.681,retLens:0.0301,h1:0.94,h2:0.43}},
  {id:'pb_r_L12', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + Stoch %K<14.15',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'stochK',type:'num',dir:'lt',th:14.15}], src:{n:97,late:0.0316,n10:0.649,surv:0.597,lens:0.639,retLens:0.0298,h1:0.89,h2:0.43}},
  {id:'pb_r_L13', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + Stoch %K<14.15 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'sarBear',type:'bin'}], src:{n:97,late:0.0316,n10:0.649,surv:0.597,lens:0.639,retLens:0.0298,h1:0.89,h2:0.43}},
  {id:'pb_r_L14', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + Stoch %K<14.15 + MACD 영선아래',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'macdBelow0',type:'bin'}], src:{n:89,late:0.0313,n10:0.629,surv:0.594,lens:0.629,retLens:0.0294,h1:0.89,h2:0.44}},
  {id:'pb_r_L15', pool:'pullback', kind:'real', mode:'and', label:'RSI<37.81 + BB %B<0.13 + 지지선 근접',
   conds:[{key:'rsi',type:'num',dir:'lt',th:37.81}, {key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}], src:{n:53,late:0.03,n10:0.623,surv:0.57,lens:0.623,retLens:0.0274,h1:1,h2:0.43}},
  {id:'pb_r_L16', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.58 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.58}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:55,late:0.029,n10:0.636,surv:0.627,lens:0.618,retLens:0.0264,h1:0.79,h2:0.42}},
  {id:'pb_r_L17', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + 지지선 근접 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:110,late:0.0278,n10:0.655,surv:0.586,lens:0.627,retLens:0.0263,h1:0.88,h2:0.42}},
  {id:'pb_r_L18', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}], src:{n:59,late:0.0281,n10:0.644,surv:0.647,lens:0.644,retLens:0.0257,h1:1,h2:0.55}},
  {id:'pb_r_L19', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:0.0281,n10:0.644,surv:0.647,lens:0.644,retLens:0.0257,h1:1,h2:0.55}},
  {id:'pb_r_L20', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:59,late:0.0281,n10:0.644,surv:0.647,lens:0.644,retLens:0.0257,h1:1,h2:0.55}},
  {id:'pb_r_L21', pool:'pullback', kind:'real', mode:'and', label:'RSI<37.81 + MA20 이격도%<-10.27 + 지지선 근접',
   conds:[{key:'rsi',type:'num',dir:'lt',th:37.81}, {key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}], src:{n:56,late:0.0268,n10:0.643,surv:0.65,lens:0.643,retLens:0.0247,h1:1,h2:0.57}},
  {id:'pb_r_L22', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:58,late:0.0258,n10:0.638,surv:0.641,lens:0.638,retLens:0.0235,h1:1,h2:0.55}},
  {id:'pb_r_L23', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.23 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.23}, {key:'nearSup',type:'bin'}], src:{n:111,late:0.0242,n10:0.631,surv:0.597,lens:0.604,retLens:0.0232,h1:1,h2:0.45}},
  {id:'pb_r_L24', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.23 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.23}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:111,late:0.0242,n10:0.631,surv:0.597,lens:0.604,retLens:0.0232,h1:1,h2:0.45}},
  {id:'pb_r_L25', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.23 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.23}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:111,late:0.0242,n10:0.631,surv:0.597,lens:0.604,retLens:0.0232,h1:1,h2:0.45}},
  {id:'pb_r_L26', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.15 + MFI(자금흐름)<31.17',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'mfi',type:'num',dir:'lt',th:31.17}], src:{n:51,late:0.0208,n10:0.608,surv:0.653,lens:0.647,retLens:0.0189,h1:0.82,h2:0.52}},
  {id:'pb_r_L27', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.15 + MFI(자금흐름)<31.17 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.15}, {key:'mfi',type:'num',dir:'lt',th:31.17}, {key:'sarBear',type:'bin'}], src:{n:51,late:0.0208,n10:0.608,surv:0.653,lens:0.647,retLens:0.0189,h1:0.82,h2:0.52}},
  {id:'pb_r_L28', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.17 + 지지선 근접',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.17}, {key:'nearSup',type:'bin'}], src:{n:60,late:0.0203,n10:0.65,surv:0.657,lens:0.65,retLens:0.0184,h1:0.81,h2:0.56}},
  {id:'pb_r_L29', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + MFI(자금흐름)<31.17',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'mfi',type:'num',dir:'lt',th:31.17}], src:{n:63,late:0.0211,n10:0.603,surv:0.646,lens:0.651,retLens:0.0184,h1:0.79,h2:0.59}},
  {id:'pb_r_L30', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.44 + MFI(자금흐름)<31.17 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.44}, {key:'mfi',type:'num',dir:'lt',th:31.17}, {key:'sarBear',type:'bin'}], src:{n:63,late:0.0211,n10:0.603,surv:0.646,lens:0.651,retLens:0.0184,h1:0.79,h2:0.59}},
  {id:'pb_r_L31', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.17 + 지지선 근접 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.17}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:0.0191,n10:0.644,surv:0.653,lens:0.644,retLens:0.0174,h1:0.8,h2:0.56}},
  {id:'pb_r_L32', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.17 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.17}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:55,late:0.0183,n10:0.636,surv:0.645,lens:0.636,retLens:0.0167,h1:0.76,h2:0.58}},
  // ── pullback · fake — [S865] 렌즈발굴(S864)·통일표준(반분 안정·Δ렌즈5%p·다양성 cap4·상한130) 7개 ──
  {id:'pb_f_L01', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.58 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.58}, {key:'settle20',type:'bin'}], src:{n:34,late:-0.069,n10:0.235,surv:0.341,lens:0.206,retLens:-0.0673,h1:0.32,h2:0}},
  {id:'pb_f_L02', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:41,late:-0.0641,n10:0.244,surv:0.385,lens:0.268,retLens:-0.065,h1:0.36,h2:0.16}},
  {id:'pb_f_L03', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:74,late:-0.0579,n10:0.203,surv:0.357,lens:0.23,retLens:-0.0608,h1:0.25,h2:0.17}},
  {id:'pb_f_L04', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:36,late:-0.0573,n10:0.222,surv:0.428,lens:0.278,retLens:-0.0593,h1:0.37,h2:0.18}},
  {id:'pb_f_L05', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0564,n10:0.25,surv:0.342,lens:0.25,retLens:-0.0562,h1:0.28,h2:0.19}},
  {id:'pb_f_L06', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:64,late:-0.0506,n10:0.266,surv:0.348,lens:0.297,retLens:-0.0513,h1:0.3,h2:0.29}},
  {id:'pb_f_L07', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:33,late:-0.0381,n10:0.303,surv:0.455,lens:0.333,retLens:-0.0379,h1:0.4,h2:0.23}},
  ],
};
  function _R(){ return RECIPES_BY_MKT[(typeof currentMarket!=='undefined')?currentMarket:'kr'] || RECIPES_BY_MKT.kr; }   // [S849] 현재 시장 세트(앱은 단일시장 컨텍스트 불변식)
  function _recipesFor(mk){ return RECIPES_BY_MKT[mk] || RECIPES_BY_MKT.kr; }

  // 4분류 정의 (표시 순서)
  var CATS = [
    {pool:'deadcat',  kind:'real', label:'역배열 · 진짜반등', tone:'#16a34a'},
    {pool:'deadcat',  kind:'fake', label:'역배열 · 가짜반등', tone:'#dc2626'},
    {pool:'pullback', kind:'real', label:'정배열 · 진짜반등', tone:'#16a34a'},
    {pool:'pullback', kind:'fake', label:'정배열 · 가짜반등', tone:'#dc2626'}
  ];

  var GR='#16a34a', RD='#dc2626', AM='#d97706';

  /* ───────── 평가 헬퍼 (전역 재사용) ───────── */
  function _calc(slice){ try { return (typeof SXE!=='undefined' && SXE.calcAllScreener) ? SXE.calcAllScreener(slice,'day') : null; } catch(e){ return null; } }
  function _feats(ind, rows, i){ try { return (typeof _extractFeats733==='function') ? _extractFeats733(ind, rows, i) : null; } catch(e){ return null; } }
  function _match(f, conds, mode){ try { return (typeof _condMatch733==='function') ? _condMatch733(f, conds, mode) : false; } catch(e){ return false; } }
  function _ltOf(ind){ try { return (typeof _ltStr733==='function') ? _ltStr733(ind.maAlignLT) : null; } catch(e){ return null; } }
  function _curTf(){ try { return (typeof _analTF!=='undefined' && _analTF) ? _analTF : 'day'; } catch(e){ return 'day'; } }
  function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function _pct(x){ return (x>=0?'+':'')+(100*x).toFixed(1)+'%'; }

  // 후반평균 수익률 [+6..+10] (교차검증 도구와 동일 정의)
  // 발동 후 [+k1..+k2]봉 평균수익(진입종가 대비). 끝봉 미존재시 부분평균(완성판정은 _hzComplete 별도).
  function _retWindow(rows, bi, k1, k2){
    var ep = (rows[bi] && typeof rows[bi].close==='number') ? rows[bi].close : null; if(ep==null) return null;
    var s=0,c=0; for(var k=k1;k<=k2;k++){ var j=bi+k; if(rows[j] && typeof rows[j].close==='number'){ s+=rows[j].close/ep-1; c++; } }
    return c?s/c:null;
  }
  function _hzComplete(rows, bi, k2){ return (bi+k2) < rows.length; }   // [+k2]봉 존재 = 그 윈도우 완성
  // [S801] 다호라이즌 적중 비교 — N10(기본·배지/관찰중)에 N15·N20 병행(데드캣은 늦게 무너짐→horizon↑면 가짜 변별력↑ 가설 검증). 측정전용·각 윈도우는 비겹침 5봉·완성분만 집계.
  var _HZ = [{k:'h10',k1:6,k2:10,lab:'N10'},{k:'h15',k1:11,k2:15,lab:'N15'},{k:'h20',k1:16,k2:20,lab:'N20'}];
  function _emptyHz(){ return {h10:{h:0,t:0},h15:{h:0,t:0},h20:{h:0,t:0}}; }
  function _lateRet(rows, bi){ return _retWindow(rows, bi, 6, 10); }   // 하위호환(=N10 [+6..+10])
  // [S796 복구] N10 풀윈도우 완성(barsAgo≥10) → 결과확정. barsAgo 0-9 = 관찰중. (S797 cp사고로 누락됐던 것 복구)
  function _lateComplete(rows, bi){ return _hzComplete(rows, bi, 10); }

  function _wantLt(rec){ return rec.pool==='pullback' ? 'bull' : 'bear'; }
  // 발동 = 풀 정렬(역배열/정배열) + 단기약세(!maBull) + 재료조건 충족
  function _fires(rec, f, lt, maBull){ return lt===_wantLt(rec) && !maBull && !!f && _match(f, rec.conds, rec.mode); }

  /* ───────── 종목 과거 스캔 (봉별 정렬+재료) · 캐시 ───────── */
  var _scanCache = {};
  function _cacheKey(sym, rows){ return sym+'_'+rows.length+'_'+(rows.length?rows[rows.length-1].close:0); }
  async function _scanStock(sym, rows){
    var ck=_cacheKey(sym, rows); if(_scanCache[ck]) return _scanCache[ck];
    var arr=[], start=250;
    for(var bi=start; bi<rows.length; bi++){
      var slice = rows.slice(Math.max(0, bi-249), bi+1);
      var ind = _calc(slice);
      if(ind){ var f=_feats(ind, rows, bi); if(f){
        var _rd=null,_en=null,_tp=null,_up=null;   // [S861] 4축 순수점수 저장 — momDir 재현·동반조건(trend≥50) 측정용. 순수함수 4개=봉당 저비용(calcAllScreener 대비 미미).
        try{ _rd=(typeof scrReadyScore==='function')?scrReadyScore(ind).score:null; }catch(_e1){}
        try{ _en=(typeof scrEntryScore==='function')?scrEntryScore(ind).score:null; }catch(_e2){}
        try{ _tp=(typeof scrTrendPure==='function')?scrTrendPure(ind).score:null; }catch(_e3){}
        try{ _up=(typeof scrUpsideScore==='function')?scrUpsideScore(ind).score:null; }catch(_e4){}
        arr.push({ bar:bi, lt:_ltOf(ind), maBull:!!(ind.maAlign && ind.maAlign.bullish), maBear:!!(ind.maAlign && ind.maAlign.bearish), f:f, rd:_rd, en:_en, tp:_tp, up:_up });   // [S824] maBear=단기 역배(MA5<20<60) — 데드캣 단기쪼개기 측정용 · [S861] rd/en/tp/up
      } }
      if((bi-start)%40===39){ await new Promise(function(r){ setTimeout(r,0); }); }   // UI 양보
    }
    _scanCache[ck]=arr; return arr;
  }

  /* ───────── 레시피 과거 적중 평가 ───────── */
  function _evalHistory(rec, scan, rows){
    var lastBar = rows.length-1, firings=[];
    for(var i=0;i<scan.length;i++){ var s=scan[i]; if(_fires(rec, s.f, s.lt, s.maBull)) firings.push(s.bar); }
    var hz=_emptyHz();   // [S801] 호라이즌별 적중(각 윈도우 완성분만)
    for(var k=0;k<firings.length;k++){
      var bi=firings[k];
      for(var hi=0;hi<_HZ.length;hi++){ var H=_HZ[hi];
        if(!_hzComplete(rows, bi, H.k2)) continue;          // 그 윈도우 미완성 → 제외
        var r=_retWindow(rows, bi, H.k1, H.k2); if(r==null) continue;
        var hit = rec.kind==='real' ? (r>0) : (r<0);        // 진짜=올랐으면 / 가짜=떨어졌으면 적중
        hz[H.k].t++; if(hit) hz[H.k].h++;
      }
    }
    var hits=hz.h10.h, total=hz.h10.t;                      // 기본=N10 (per-row 적중률·배지)
    var last=null;                                          // 가장 최근 발동 1건 (완성=N10 풀윈도우 barsAgo≥10)
    if(firings.length){ var lb=firings[firings.length-1], comp=_lateComplete(rows, lb), r10=comp?_lateRet(rows, lb):null;
      var _ep=(rows[lb]&&typeof rows[lb].close==='number')?rows[lb].close:null, _cur=(rows[lastBar]&&typeof rows[lastBar].close==='number')?rows[lastBar].close:null;
      var _alive=(_ep>0&&_cur!=null)?(_cur/_ep-1):null;   // [S836] 현재봉 종가/발동가-1 = 측정 traj[barsAgo-1] (각 시점 독립·>0=살아있음)
      last={ bar:lb, barsAgo:(lastBar-lb), complete:comp, aliveRet:_alive, hit:(comp&&r10!=null ? (rec.kind==='real'?r10>0:r10<0) : null) }; }
    return { fireCount:firings.length, hits:hits, total:total, hitRate:(total?hits/total:null), last:last, lastBar:lastBar, hz:hz };
  }

  /* ───────── 카테고리별 '관찰중' 집계 (최근발동 0-9봉=N10 결과 미확정) · _scanStock 캐시 공유 · 배지 인벤토리가 당겨씀 ───────── */
  async function _pendingByCat(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var out={};   // 'pool|kind' → {count, oldest, ids:[], overlap}  (oldest=확정임박·overlap=현재봉 동시발동 겹침)
    _R().forEach(function(rec){
      var h; try { h=_evalHistory(rec, scan, rows); } catch(e){ return; }
      if(h.last && !h.last.complete){          // 최근발동 미완성 = 관찰중 (레시피카드 '관찰중'과 동일 정의)
        var key=rec.pool+'|'+rec.kind;
        if(!out[key]) out[key]={count:0, oldest:-1, ids:[], overlap:0};
        out[key].count++; out[key].ids.push(rec.id);
        if(h.last.barsAgo>out[key].oldest) out[key].oldest=h.last.barsAgo;
      }
    });
    // [S840] 현재봉 겹침(동시발동 수) — 배지 인벤토리 겹침 전환. 정배 N10·역배 N15 검증된 겹침 단계용.
    var _last=scan.length?scan[scan.length-1]:null;
    if(_last){
      _R().forEach(function(rec){
        if(_fires(rec, _last.f, _last.lt, _last.maBull)){
          var key=rec.pool+'|'+rec.kind;
          if(!out[key]) out[key]={count:0, oldest:-1, ids:[], overlap:0};
          out[key].overlap=(out[key].overlap||0)+1;
        }
      });
    }
    return out;
  }

  /* ───────── [S807] 진짜반등(real) 발동 봉맵 — 단기추세매매 검증모달 물타기용 ─────────
   *   _scanStock 재사용(무거운 봉별 calcAllScreener는 1회·캐시 공유). real = pullback-real(정배 bull)+deadcat-real(역배 bear) 둘 다.
   *   각 봉은 _fires(정렬 일치 + 단기약세 !maBull + 재료조건)로 판정 → 그 봉 정렬상태에 맞는 real만 발동.
   *   반환 {barIdx:true} (real 레시피 하나라도 발동한 봉). 같은 rows 넘기면 단기추세매매 BT와 봉 인덱스 1:1.
   *   [S814] opts.excludeBear=true → deadcat(역배) 제외·pullback(정배 눌림목) real만. 역배 물타기가 손실 키우는 경향 → 검증모달 '역배열 제외' 체크박스(기본ON)용.
   */
  async function _realFireBars(sym, rows, opts){
    opts = opts || {};
    if(!Array.isArray(rows) || rows.length<260) return {};
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return {}; }
    var reals = _R().filter(function(r){
      if(r.kind!=='real') return false;
      if(opts.excludeBear && r.pool==='deadcat') return false;   // [S814] 역배(데드캣) 제외 → 정배 눌림목 real만
      return true;
    });
    var fire = {};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      for(var k=0;k<reals.length;k++){
        if(_fires(reals[k], s.f, s.lt, s.maBull)){ fire[s.bar]=true; break; }
      }
    }
    return fire;
  }

  /* ───────── [S816] 정배열 눌림목 신호 봉맵 — 단기추세매매 '정배열 레시피 엔진'용 ─────────
   *   pullback-real(진입) + pullback-fake(청산) 발동 봉. 역배(deadcat)·크로스 무관·정배열만.
   *   _scanStock 재사용(캐시 공유). 같은 rows 넘기면 BT와 봉 인덱스 1:1.
   *   반환 {real:{barIdx:true}, fake:{barIdx:true}}.
   */
  async function _pullbackSignalBars(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return {real:{},fake:{}};
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return {real:{},fake:{}}; }
    var pbReal = _R().filter(function(r){ return r.kind==='real' && r.pool==='pullback'; });
    var pbFake = _R().filter(function(r){ return r.kind==='fake' && r.pool==='pullback'; });
    var real={}, fake={};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      for(var k=0;k<pbReal.length;k++){ if(_fires(pbReal[k], s.f, s.lt, s.maBull)){ real[s.bar]=true; break; } }
      for(var k2=0;k2<pbFake.length;k2++){ if(_fires(pbFake[k2], s.f, s.lt, s.maBull)){ fake[s.bar]=true; break; } }
    }
    return {real:real, fake:fake};
  }

  /* ───────── [S809] 겹침 측정 — 봉별 real 레시피 동시발동 수 + N10 후반평균 적중 ─────────
   *   _realFireBars와 동일 _scanStock 캐시 공유. 차이: break(1개라도) 대신 발동 레시피 수(k)를 끝까지 카운트.
   *   _fires가 정렬+단기약세 매칭하니 역배봉=deadcat-{real,fake}만·정배봉=pullback-{real,fake}만 자동 집계(풀 구분 공짜).
   *   [S813] real+fake 둘 다 카운트(realK·fakeK). hit=real기준(상승). fake 적중(하락)은 호출측이 ret<0으로 계산. k=realK(하위호환).
   *   반환 [{bar, lt('bear'/'bull'), realK, fakeK, k(=realK), complete, hit(real=상승), ret}].
   *   교차검증 '레시피 겹침' 도구가 종목 전수로 모아 4사분면(역배/정배 × real/fake) 겹침수별 적중비율 집계. N10=실전 판정기준(S806).
   */
  async function _overlapScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real'; });
    var fakes = _R().filter(function(r){ return r.kind==='fake'; });
    var out = [];
    for(var i=0;i<scan.length;i++){
      var s=scan[i], rk=0, fk=0;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
      for(var j2=0;j2<fakes.length;j2++){ if(_fires(fakes[j2], s.f, s.lt, s.maBull)) fk++; }
      if(rk===0 && fk===0) continue;                                 // real·fake 둘 다 0이면 제외
      var comp=_lateComplete(rows, s.bar), ret=comp?_lateRet(rows, s.bar):null;
      out.push({ bar:s.bar, lt:s.lt, stBear:!!s.maBear, realK:rk, fakeK:fk, k:rk, complete:comp, ret:ret, hit:(comp&&ret!=null)?(ret>0):null });   // [S824] stBear=단기 역배 — (하,하)/(하,혼조) 쪼개기
    }
    return out;
  }

  /* ───────── [S859] 봉 단위 발동 평가(동기·경량) — C 반등경로 레시피표 A/B용.
   *   _scanStock 불사용: 호출측이 이미 계산한 ind(calcAllScreener 결과)를 받아 feats 추출+매칭만 수행(봉당 수백 비교·저비용).
   *   mk 지정 시 그 시장 세트(recipesFor), 미지정=현재 시장(_R). idx=rows상 평가봉 인덱스(보통 마지막 봉).
   *   반환 { realK, fakeK, lt, maBull, pure(real 발동 & fake 무발동), mixed(real·fake 동시) } | null.
   */
  function _evalBar(ind, rows, idx, mk){
    if(!ind || !Array.isArray(rows)) return null;
    var f=null; try{ f=_feats(ind, rows, idx); }catch(e){ return null; }
    if(!f) return null;
    var lt=_ltOf(ind), maBull=!!(ind.maAlign && ind.maAlign.bullish);
    var set=mk?_recipesFor(mk):_R(), rk=0, fk=0;
    for(var i=0;i<set.length;i++){ var r=set[i]; if(_fires(r, f, lt, maBull)){ if(r.kind==='real') rk++; else fk++; } }
    return { realK:rk, fakeK:fk, lt:lt, maBull:maBull, pure:(rk>0&&fk===0), mixed:(rk>0&&fk>0) };
  }

  /* ───────── [S861] C momDir 재현(측정전용 복제) — scoreMomentum(S86: 현재 vs 1~3봉전 평균 델타) + momentumBadge(±5 임계·2표 우세) 규칙.
   *   scoreMomentum 직접 호출은 봉당 scrQuickScore×5라 비용 폭탄 → _scanStock에 저장한 rd/en/tp/up 순수점수로 재현. 엔진 규칙 변경 시 드리프트 주의(미러성 주석).
   */
  function _mdAt(scan, i){
    if(i<1) return null;
    var cur=scan[i];
    if(cur.rd==null||cur.en==null||cur.tp==null||cur.up==null) return null;
    var lo=Math.max(0,i-3), n=0, sums={rd:0,en:0,tp:0,up:0};
    for(var j=i-1;j>=lo;j--){ var e2=scan[j]; if(e2.rd==null||e2.en==null||e2.tp==null||e2.up==null) break; sums.rd+=e2.rd; sums.en+=e2.en; sums.tp+=e2.tp; sums.up+=e2.up; n++; }
    if(!n) return null;
    var up=0,down=0,ks=['rd','en','tp','up'];
    for(var k=0;k<ks.length;k++){ var key=ks[k], d=cur[key]-Math.round(sums[key]/n); if(d>=5)up++; else if(d<=-5)down++; }
    return (up>=2&&up>down)?'up':((down>=2&&down>up)?'down':'flat');
  }

  /* ───────── [S856] 발동 후 시간 프로파일 — "발동 후 t+k 경과 시 신호가 유력해지는 시점" 측정.
   *   개념(반등준비/전환 재설계 근거): 준비=발동 후 아직 유력 전 대기구간 · 전환=유력 진입시점. 이 도구가 그 경계(t+k)를 데이터로 정함.
   *   이벤트=신규발동(onset): 같은 kind(real/fake) 발동이 직전 5봉 내 없던 봉만 — 군집 연속발동은 t+k 축을 뭉개므로 제외(발동 상태는 lastFire로 계속 추적).
   *   각 이벤트: cum[j]=close[bar+1+j]/close[bar]−1 (t+1..t+20). bar+20 완성 이벤트만(전 오프셋 동일 표본 = 열간 비교 가능).
   *   base: 발동 무관 해당 레짐(lt bear/bull) 전체 완성봉의 동일 cum — 불장 기준선(S825 교훈 · 리프트 계산용). 동일 완성창 기준이라 이벤트와 사과대사과.
   *   반환 { events:[{bar,lt,kind,k(겹침수),xk(상대kind 동시발동수·[S857] 오염측정),cum:[20]}], base:{bear:{n,hit[20](상승수),sum[20]},bull:{...}} } | null. _scanStock 캐시 공유 · 측정전용.
   */
  async function _profileScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<280) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals=_R().filter(function(r){ return r.kind==='real'; });
    var fakes=_R().filter(function(r){ return r.kind==='fake'; });
    var H=20, events=[];
    var base={ bear:{n:0,hit:new Array(H).fill(0),sum:new Array(H).fill(0)}, bull:{n:0,hit:new Array(H).fill(0),sum:new Array(H).fill(0)} };
    var lastReal=-99, lastFake=-99;
    for(var i=0;i<scan.length;i++){
      var s=scan[i], b=s.bar;
      if(b+H>=rows.length) break;                                   // 정렬 순회 — 최초 미완성 이후 전부 미완성
      var ep=(rows[b]&&typeof rows[b].close==='number')?rows[b].close:null; if(!(ep>0)) continue;
      var cum=new Array(H), ok=true;
      for(var j=0;j<H;j++){ var c=(rows[b+1+j]&&typeof rows[b+1+j].close==='number')?rows[b+1+j].close:null; if(c==null){ ok=false; break; } cum[j]=c/ep-1; }
      if(!ok) continue;
      var side=(s.lt==='bear')?'bear':(s.lt==='bull'?'bull':null);
      if(side){ var bb=base[side]; bb.n++; for(var j2=0;j2<H;j2++){ if(cum[j2]>0) bb.hit[j2]++; bb.sum[j2]+=cum[j2]; } }
      var rk=0, fk=0;
      for(var jr=0;jr<reals.length;jr++){ if(_fires(reals[jr], s.f, s.lt, s.maBull)) rk++; }
      for(var jf=0;jf<fakes.length;jf++){ if(_fires(fakes[jf], s.f, s.lt, s.maBull)) fk++; }
      if(rk>0){ if(side && b-lastReal>5) events.push({ bar:b, lt:side, kind:'real', k:rk, xk:fk, tp:s.tp, md:_mdAt(scan,i), cum:cum }); lastReal=b; }   // [S857] xk=상대 kind 동시발동 · [S861] tp=trendPure·md=momDir 재현(동반조건 측정)
      if(fk>0){ if(side && b-lastFake>5) events.push({ bar:b, lt:side, kind:'fake', k:fk, xk:rk, tp:s.tp, md:_mdAt(scan,i), cum:cum }); lastFake=b; }
    }
    return { events:events, base:base };
  }

  /* ───────── [S825] base rate 스캔 — 발동 무관 전체 봉의 N10 상승비율(불장 기준선). _scanStock 캐시 공유.
   *   (하,하) deadcat-real 67%가 진짜 변별력인지 "불장이라 뭘 사도 오름"인지 분해용. 레짐별 base rate 제공.
   *   반환 [{bar, lt, stBull, stBear, complete, ret, up}] (모든 봉·발동 조건 무관).
   */
  async function _baseRateScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var out=[];
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      var comp=_lateComplete(rows, s.bar), ret=comp?_lateRet(rows, s.bar):null;
      out.push({ bar:s.bar, lt:s.lt, stBull:!!s.maBull, stBear:!!s.maBear, complete:comp, ret:ret, up:(comp&&ret!=null)?(ret>0):null });
    }
    return out;
  }

  /* ───────── [S827] deadcat-real 진입 후 궤적 — 발동봉 이후 t+1~t+10 봉별 누적수익 + N10 진짜/가짜 라벨.
   *   진입 시점 예측(5번 실패)이 아니라 "진입 후 빨리 가짜를 감지할 수 있나"(조기 손절) 측정. _scanStock 캐시 공유.
   *   label=_lateRet(N10 [+6..+10] 평균)>0?real:fake. traj[k]=t+(k+1) 누적수익(진입종가 대비). N10 완성봉만.
   *   ★t+1~t+5=라벨과 독립(조기 감지 실거리) · t+6~t+10=라벨이 이 구간 결과라 순환(당연히 갈림). 반환 [{label, stBear, traj:[10]}].
   */
  async function _deadcatTrajScan(sym, rows, pool){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var POOL=pool||'deadcat', WLT=(POOL==='pullback')?'bull':'bear';   // [S831] pool 파라미터화 — 정배(pullback,bull)/역배(deadcat,bear) 공용
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool===POOL; });
    var out=[];
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!==WLT) continue;
      var fired=false;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)){ fired=true; break; } }
      if(!fired) continue;
      if(!_lateComplete(rows, s.bar)) continue;   // N10 완성봉만(t+10 존재)
      var lr=_lateRet(rows, s.bar); if(lr==null) continue;
      var ep=(rows[s.bar]&&typeof rows[s.bar].close==='number')?rows[s.bar].close:null; if(!(ep>0)) continue;
      var traj=[];
      for(var k=1;k<=10;k++){ var j2=s.bar+k, c=(rows[j2]&&typeof rows[j2].close==='number')?rows[j2].close:null; traj.push(c!=null?(c/ep-1):null); }
      out.push({ label:(lr>0?'real':'fake'), stBear:!!s.maBear, traj:traj });
    }
    return out;
  }

  /* ───────── [S829] deadcat-real 확인 후 진입 — 즉시 vs t+1확인 vs t+2확인. "신호 후 1~2봉 살아남으면(진입가 위) 그때 진입" 검증.
   *   진입가↑(이미 오름) vs 가짜 거름↑ 트레이드오프를 N10 수익으로 비교. _scanStock 캐시 공유.
   *   imm=신호봉 진입(진입가 close[bar]). c1=t+1 종가>신호봉 종가일 때만 t+1 진입(진입가 close[bar+1]). c2=t+2 동일. 각 진입시점 기준 N10 _lateRet.
   *   반환 [{imm:{ret,real}|null, c1:..|null, c2:..|null}].
   */
  /* ───────── [S830] deadcat-real 진입 4방식 — 손절 시나리오 + MDD 포함. 공정 비교.
   *   imm=즉시+N10보유 · immSl=즉시+t+1손절(t+1 종가<진입가면 t+1 매도) · c1=t+1확인진입+보유 · c1Sl=t+1확인+t+2손절.
   *   각 {ret(N10수익 or 손절수익), real(ret>0), mdd(진입후 보유중 최저점·진입가 대비)}. 손절시 mdd=손절가. _scanStock 캐시 공유.
   *   ★immSl이 "즉시+빠른손절"의 진짜 수익(가짜 큰손실→t+1 작은손실로 전환). c1=관찰후진입(진입가 상승 비용). MDD로 변동성 종목 효과 확인.
   */
  async function _deadcatConfirmScan(sym, rows, pool){
    if(!Array.isArray(rows) || rows.length<260) return [];
    var POOL=pool||'deadcat', WLT=(POOL==='pullback')?'bull':'bear';   // [S831] pool 파라미터화 — 정배(pullback,bull)/역배(deadcat,bear) 공용
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return []; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool===POOL; });
    var out=[];
    function mddOf(bar0, ep){ var lo=0, any=false; for(var k=1;k<=10;k++){ var c=(rows[bar0+k]&&typeof rows[bar0+k].close==='number')?rows[bar0+k].close:null; if(c==null)continue; var rr=c/ep-1; if(rr<lo)lo=rr; any=true; } return any?lo:null; }
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!==WLT) continue;
      var fired=false;
      for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)){ fired=true; break; } }
      if(!fired) continue;
      var bar=s.bar, ep=(rows[bar]&&typeof rows[bar].close==='number')?rows[bar].close:null; if(!(ep>0)) continue;
      var rec={imm:null,immSl:null,c1:null,c1Sl:null};
      // 즉시+보유
      var immRet=null, immMdd=0;
      if(_lateComplete(rows,bar)){ immRet=_lateRet(rows,bar); if(immRet!=null){ var mm=mddOf(bar,ep); immMdd=(mm!=null?mm:0); rec.imm={ret:immRet,real:immRet>0,mdd:immMdd}; } }
      // 즉시+t+1손절
      var c1px=(rows[bar+1]&&typeof rows[bar+1].close==='number')?rows[bar+1].close:null;
      if(c1px!=null){
        if(c1px<ep){ var sl=c1px/ep-1; rec.immSl={ret:sl,real:false,mdd:sl}; }   // t+1 빠짐→손절(작은손실·최저=손절가)
        else if(immRet!=null){ rec.immSl={ret:immRet,real:immRet>0,mdd:immMdd}; }   // 살아남음→보유(=imm)
      }
      // t+1확인+보유 (t+1 살아남아 진입)
      var c1Ret=null, c1Mdd=0;
      if(c1px!=null && c1px>ep && _lateComplete(rows,bar+1)){ c1Ret=_lateRet(rows,bar+1); if(c1Ret!=null){ var mm2=mddOf(bar+1,c1px); c1Mdd=(mm2!=null?mm2:0); rec.c1={ret:c1Ret,real:c1Ret>0,mdd:c1Mdd}; } }
      // t+1확인+t+2손절 (t+1 진입 후 t+2 빠지면 손절)
      if(c1px!=null && c1px>ep){
        var c2px=(rows[bar+2]&&typeof rows[bar+2].close==='number')?rows[bar+2].close:null;
        if(c2px!=null){
          if(c2px<c1px){ var sl2=c2px/c1px-1; rec.c1Sl={ret:sl2,real:false,mdd:sl2}; }   // t+2 빠짐→손절
          else if(c1Ret!=null){ rec.c1Sl={ret:c1Ret,real:c1Ret>0,mdd:c1Mdd}; }   // 보유
        }
      }
      if(rec.imm||rec.immSl||rec.c1||rec.c1Sl) out.push(rec);
    }
    return out;
  }

  /* ───────── [S837] 역배 데드캣-real 겹침 × 다호라이즌(N10/N15/N20) — 최종 검증. "역배는 느리게 반응"(침체 종목 관심밖 가설) → N10 단조 깨짐(62→61→71)이 긴 horizon에선 살아나나?
   *   각 horizon 겹침 진짜비율 + 역배 레짐 base rate(각 horizon) → lift로 불장빨 배제. N15/N20 단조+lift 유지면 역배도 겹침 배지 가능. _scanStock 캐시 공유.
   *   반환 {baseR:[{n,up}×3hz], ov:{1/2/3/4:[{t,h}×3hz]}} (역배 봉만·hz=[N10,N15,N20]).
   */
  async function _deadcatOverlapHzScan(sym, rows){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool==='deadcat'; });
    var HZ=[[6,10],[11,15],[16,20]];   // N10, N15, N20 (헤더 통계바와 동일)
    var baseR=[{n:0,up:0},{n:0,up:0},{n:0,up:0}];
    var ov={1:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 2:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 3:[{t:0,h:0},{t:0,h:0},{t:0,h:0}], 4:[{t:0,h:0},{t:0,h:0},{t:0,h:0}]};
    for(var i=0;i<scan.length;i++){
      var s=scan[i];
      if(s.lt!=='bear') continue;   // 역배만
      var rets=[];
      for(var hi=0;hi<3;hi++){ rets.push(_hzComplete(rows,s.bar,HZ[hi][1]) ? _retWindow(rows,s.bar,HZ[hi][0],HZ[hi][1]) : null); }
      for(var hb=0;hb<3;hb++){ if(rets[hb]!=null){ baseR[hb].n++; if(rets[hb]>0) baseR[hb].up++; } }   // base(발동무관·역배 레짐)
      var rk=0; for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
      if(rk>=1){ var key=(rk>=4)?4:rk; for(var ho=0;ho<3;ho++){ if(rets[ho]!=null){ ov[key][ho].t++; if(rets[ho]>0) ov[key][ho].h++; } } }
    }
    return { baseR:baseR, ov:ov };
  }

  /* ───────── [S838] 역배 겹침 BT — 겹침 minK+ 진입 → hz봉 보유 청산(고정) → 복리 자산곡선. N15/N20 유효 통계가 실전 수익/MDD로 이어지나(긴 호흡 단서 검증). 1포지션·보유중 재진입X. _scanStock 캐시 공유.
   *   반환 {nT, eqEnd(복리 자산배수), mdd(자산곡선 최대낙폭), wins, sumPnl, mddSum(거래별 진입후 최저 합)}.
   */
  async function _deadcatHzBtScan(sym, rows, hz, minK){
    if(!Array.isArray(rows) || rows.length<260) return null;
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return null; }
    var reals = _R().filter(function(r){ return r.kind==='real' && r.pool==='deadcat'; });
    var close = rows.map(function(r){ return +(r.close!=null?r.close:r.c); });
    var trades=[], pos=null;
    for(var i=0;i<scan.length;i++){
      var s=scan[i], bi=s.bar;
      if(pos!=null && bi>=pos.exitBar){   // hz봉 도달 → 청산
        var ex=close[pos.exitBar];
        if(ex>0){ var pnl=ex/pos.entry-1, lo=0;
          for(var k=pos.entryIdx+1;k<=pos.exitBar;k++){ if(close[k]>0){ var rr=close[k]/pos.entry-1; if(rr<lo)lo=rr; } }
          trades.push({pnl:pnl, mdd:lo});
        }
        pos=null;
      }
      if(pos==null && s.lt==='bear'){   // 역배 겹침 minK+ 진입
        var rk=0; for(var j=0;j<reals.length;j++){ if(_fires(reals[j], s.f, s.lt, s.maBull)) rk++; }
        if(rk>=minK){ var eb=bi+hz; if(eb<close.length && close[bi]>0){ pos={entry:close[bi], entryIdx:bi, exitBar:eb}; } }
      }
    }
    var eq=1,peak=1,mdd=0,wins=0,sum=0,mddSum=0;
    trades.forEach(function(t){ eq*=(1+t.pnl); if(eq>peak)peak=eq; var dd=peak>0?(peak-eq)/peak:0; if(dd>mdd)mdd=dd; if(t.pnl>0)wins++; sum+=t.pnl; mddSum+=t.mdd; });
    return { nT:trades.length, eqEnd:eq, mdd:mdd, wins:wins, sumPnl:sum, mddSum:mddSum };
  }

  /* ───────── 렌더 ───────── */
  // [S798] 레시피 행 배지 — 관찰 단계 동적 표시. 진짜: 관망/조짐/유력 · 가짜: 관망/주의/위험. early(0-5봉)=틴트, late(6-9봉)=솔리드. last=_evalHistory.last(관찰중이면 미완성).
  // [S836] 배지 단계 — 봉수가 아니라 진입 후 궤적(발동가 대비 살아있음) 기준. 측정(t+1/t+2/t+3 종가>발동가=진짜 쪽) 그대로. 브리핑용(방향성 보도·매매 확정 아님).
  //   진짜반등: 살아있을수록 유력(발생→조짐 t1~2→유력 t3+) · 빠지면 약화. 가짜반등: 빠질수록 위험(발생→주의 t1~2→위험 t3+) · 살아있으면 해소중.
  function _stageBadge(rec, last){
    var base='display:inline-block;font-weight:800;padding:3px 9px;border-radius:5px;';
    var grey='<span style="'+base+'font-size:9.5px;font-weight:700;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">';
    if(!last) return grey+'관망</span>';
    if(last.complete) return grey+'관망</span>';   // N10 완성 → 결과 확정
    var up=(rec.kind==='real'), ba=last.barsAgo||0, alive=(last.aliveRet==null)?null:(last.aliveRet>0);
    var C=up?GR:RD;
    if(ba<=0) return '<span style="'+base+'font-size:10px;background:'+C+'22;color:'+C+';border:1px solid '+C+'">발생</span>';   // 발동 당봉 (아직 t+1 안 옴)
    if(up){   // 진짜반등 — 발동가 위 유지할수록 진짜(유력)
      if(alive===false) return grey+'약화</span>';   // 빠짐 = 가짜 쪽 흐름
      if(ba>=3) return '<span style="'+base+'font-size:10px;background:'+GR+';color:#fff">유력</span>';   // t3+ 살아있음 (진짜 82%)
      return '<span style="'+base+'font-size:10px;background:'+GR+'22;color:'+GR+';border:1px solid '+GR+'">조짐</span>';   // t1~t2 살아있음 (진짜 73~78%)
    }
    // 가짜반등 — 발동가 아래로 빠질수록 가짜 진행(위험)
    if(alive===true) return grey+'해소중</span>';   // 안 빠짐 = 경고 약화
    if(ba>=3) return '<span style="'+base+'font-size:10px;background:'+RD+';color:#fff">위험</span>';   // t3+ 빠짐 (가짜 진행)
    return '<span style="'+base+'font-size:10px;background:'+AM+'22;color:'+AM+';border:1px solid '+AM+'">주의</span>';   // t1~t2 빠짐
  }

  function _recipeRow(rec, firing, idPfx){
    var pfx=idPfx||'';
    var s=rec.src;
    var stat = '표본'+s.n+' · 후반 '+_pct(s.late)+' · N10 '+Math.round(100*s.n10)+'%';
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 9px;border-top:1px solid var(--border)">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:10.5px;font-weight:700;color:var(--text);line-height:1.32">'+_esc(rec.label)+'</div>'
        + '<div style="font-size:8px;color:var(--text3);margin-top:2px">'+stat+'</div>'
      + '</div>'
      + '<div style="flex-shrink:0;text-align:right">'
        + '<span id="rcpbadge_'+pfx+rec.id+'">'+_stageBadge(rec, firing?{barsAgo:0,complete:false}:null)+'</span>'
        + '<div id="rcphit_'+pfx+rec.id+'" style="font-size:8px;color:var(--text3);margin-top:3px;white-space:nowrap">적중률 …</div>'
      + '</div>'
    + '</div>';
  }

  function _hitHtml(rec, h){
    if(h.fireCount===0) return '<span style="color:var(--text3)">발동이력 없음</span>';
    var rate = (h.hitRate!=null) ? ('적중 <b style="color:'+(h.hitRate>=0.5?GR:RD)+'">'+Math.round(100*h.hitRate)+'%</b> ('+h.hits+'/'+h.total+')') : '적중 —';
    var tail='';
    if(h.last){
      if(h.last.complete) tail = ' · '+h.last.barsAgo+'봉전 '+(h.last.hit?'<b style="color:'+GR+'">✓적중</b>':'<b style="color:'+RD+'">✗실패</b>');
      else tail = ' · '+h.last.barsAgo+'봉전 <b style="color:'+AM+'">관찰중</b>';
    }
    return rate+tail;
  }

  // [S797] 탭(풀)별 통계 바 — 관찰중·확정임박 + [S801] 진짜/가짜 적중률 N10·N15·N20 병행(데드캣 horizon 검증). ps={pend,oldest,R,F} (R/F=_emptyHz 누적)
  function _statHtml(ps){
    if(!ps) ps={pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()};
    var l1 = ps.pend>0
      ? ('<span style="color:'+AM+'">⏳관찰중 '+ps.pend+'</span>'+(ps.oldest>=0?('<span style="color:var(--text3)"> · 확정임박 '+ps.oldest+'봉</span>'):''))
      : '<span style="color:var(--text3)">관찰중 0</span>';
    function _row(lab, side, kindCol){
      if((side.h10.t+side.h15.t+side.h20.t)<=0) return '<span style="color:'+kindCol+';font-weight:800">'+lab+'</span> <span style="color:var(--text3)">표본없음</span>';
      var segs = _HZ.map(function(H){ var d=side[H.k];
        if(d.t<=0) return '<span style="color:var(--text3)">'+H.lab+' —</span>';
        var p=Math.round(100*d.h/d.t);
        return '<span style="color:var(--text3)">'+H.lab+' </span><b style="color:'+(p>=50?GR:RD)+'">'+p+'%</b><span style="color:var(--text3)">/'+d.t+'</span>';
      }).join('<span style="color:var(--text3)"> · </span>');
      return '<span style="color:'+kindCol+';font-weight:800">'+lab+'</span> '+segs;
    }
    return l1
      + '<div style="font-size:8.5px;margin-top:2px">'+_row('진짜', ps.R, GR)+'</div>'
      + '<div style="font-size:8.5px">'+_row('가짜', ps.F, RD)+'</div>';
  }

  // 헤더 요약 갱신
  function _setSummary(html){ var el=document.getElementById('sxRecipeSummary'); if(el) el.innerHTML=html; }

  // 그룹 본문 렌더 (2탭: 역배열/정배열 · 현재 레짐 우선) → {inner, fireCount, ltLabel} [S790]
  function _renderBody(fNow, ltNow, maBullNow){
    var ltLabel = ltNow==='bear'?'역배열':ltNow==='bull'?'정배열':'중립';
    var regimePool = ltNow==='bull' ? 'pullback' : 'deadcat';   // 현재 레짐 = 기본 선택 탭
    var POOLS=[{key:'pullback',label:'정배열'},{key:'deadcat',label:'역배열'}];
    var fireReal=0, fireFake=0;
    // [S797] 탭별 통계 바 (탭 버튼 위 한 줄) — 현재 탭만 표시, 나머지 hidden · async로 채움
    var statBar='<div style="padding:8px 10px 0">';
    POOLS.forEach(function(p){
      var show=(p.key===regimePool);
      statBar += '<div id="sxRcpStat_'+p.key+'" style="display:'+(show?'block':'none')+';font-size:9px;line-height:1.55;font-weight:700">평가 중…</div>';
    });
    statBar+='</div>';
    // 탭 바 (현재 레짐 탭에 ● 표시)
    var tab='<div style="display:flex;gap:6px;padding:8px 9px 6px">';
    POOLS.forEach(function(p){
      var on=(p.key===regimePool);
      tab += '<button id="sxRcpTabBtn_'+p.key+'" onclick="window.SXRecipeSignal&&SXRecipeSignal.tab(\''+p.key+'\')" '
        + 'style="flex:1;font-size:11px;font-weight:800;padding:7px 0;border-radius:7px;cursor:pointer;border:1px solid '
        + (on?'var(--accent);background:var(--accent);color:#fff':'var(--border);background:var(--surface2);color:var(--text3)')+'">'
        + (p.key===regimePool?'<span style="font-size:8px">● </span>':'') + p.label + '</button>';
    });
    tab+='</div>';
    // 풀별 섹션 — [S853] 4분류 접기/펼치기 + '발동만' 체크(기본 ON=발동 레시피만). 상단 활성 섹션은 제거(발동 다수 시 카드 점령 문제).
    var sections='';
    POOLS.forEach(function(p){
      var show=(p.key===regimePool);
      var catBlocks='';   // [S853] 상단 활성 섹션 제거 — 발동 노출은 '발동만' 체크(기본 ON)가 담당
      CATS.filter(function(c){ return c.pool===p.key; }).forEach(function(cat){
        var recs = _R().filter(function(r){ return r.pool===cat.pool && r.kind===cat.kind; });
        var catId='rcpCat_'+cat.pool+'_'+cat.kind;
        if(!recs.length){ catBlocks += '<div style="font-size:8px;color:var(--text3);padding:8px 10px 2px">'+cat.label+' — 미등록</div>'; return; }
        var rowsHtml='', catFire=0;
        recs.forEach(function(r){
          var fr=_fires(r, fNow, ltNow, maBullNow);
          if(fr){ if(r.kind==='real') fireReal++; else fireFake++; catFire++; }
          rowsHtml += '<div data-rcpfired="'+(fr?1:0)+'"'+((!fr&&FIRE_ONLY)?' style="display:none"':'')+'>'+_recipeRow(r, fr, '')+'</div>';
        });
        catBlocks += '<div style="border-top:1px solid var(--border)">'
          + '<div onclick="window.SXRecipeSignal&&SXRecipeSignal.catToggle(\''+catId+'\')" style="display:flex;align-items:center;font-size:10px;font-weight:800;color:'+cat.tone+';padding:9px 9px;cursor:pointer;overflow:hidden">'
            + '<span id="'+catId+'_arr" style="font-size:9px;margin-right:5px;color:var(--text3);width:9px;display:inline-block">▶</span>'
            + cat.label + '<span style="color:var(--text3);font-weight:600">&nbsp;('+recs.length+')</span>'
            + (catFire?' <span style="color:'+cat.tone+';font-weight:800">&nbsp;🔥'+catFire+'</span>':'')
            + '<span id="rcpcat_'+cat.pool+'_'+cat.kind+'" style="margin-left:auto;font-size:8.5px;font-weight:700;color:var(--text3)"></span>'
          + '</div>'
          + '<div id="'+catId+'" style="display:none"><div data-rcpfireempty="'+catFire+'" style="display:'+((FIRE_ONLY&&catFire===0)?'block':'none')+';font-size:8px;color:var(--text3);padding:7px 10px">관찰중 없음 — [관찰중만] 해제 시 전체 '+recs.length+'개</div>'+rowsHtml+'</div>'
        + '</div>';
      });
      var fireChk='<div style="display:flex;justify-content:flex-end;align-items:center;padding:4px 10px 0"><label style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:var(--text3);cursor:pointer"><input type="checkbox" data-rcpfireonly="1" '+(FIRE_ONLY?'checked':'')+' onchange="window.SXRecipeSignal&&SXRecipeSignal.fireOnly(this.checked)" style="width:12px;height:12px;accent-color:var(--accent)">관찰중만 보기</label></div>';   // [S853]
      var sec='<div id="sxRcpTab_'+p.key+'" style="display:'+(show?'block':'none')+'">'+fireChk+catBlocks+'</div>';
      sections+=sec;
    });
    var note='<div style="font-size:8px;color:var(--text3);padding:8px 10px 2px;line-height:1.5;border-top:1px solid var(--border);margin-top:4px">발동 = 현재봉이 (그 풀 정렬+단기약세 + 재료조건) 충족 — <b>현재 레짐('+ltLabel+') 탭에서만</b> 발동, 반대 탭은 관찰용. 적중 = 과거 발동 후 <b>후반평균 방향</b>이 신호와 일치(진짜=상승/가짜=하락). 행 적중률·관찰중·배지는 <b>N10([+6..+10])</b> 기준. <b>헤더 통계바</b>=진짜/가짜 적중률을 <b>N10·N15([+11..+15])·N20([+16..+20])</b> 병행 — 데드캣은 늦게 무너지니 horizon↑면 가짜%↑·진짜 유지면 장기horizon 유효(측정·비교용). 적중률·최근은 <b>이 종목 600봉</b> 기준 · 표본/후반은 풀 전체. 일봉 · fetchRows600 단일소스.</div>';
    return { inner:statBar+tab+sections+note, fireCount:(fireReal+fireFake), fireReal:fireReal, fireFake:fireFake, ltLabel:ltLabel };
  }

  // 탭 전환 (재평가 없음 — display 토글 + 버튼 활성색) [S790]
  function _tab(pool){
    try {
      ['deadcat','pullback'].forEach(function(p){
        var sec=document.getElementById('sxRcpTab_'+p); if(sec) sec.style.display=(p===pool)?'block':'none';
        var st=document.getElementById('sxRcpStat_'+p); if(st) st.style.display=(p===pool)?'block':'none';   // [S797] 통계 바도 토글
        var btn=document.getElementById('sxRcpTabBtn_'+p);
        if(btn){ var on=(p===pool); btn.style.background=on?'var(--accent)':'var(--surface2)'; btn.style.color=on?'#fff':'var(--text3)'; btn.style.borderColor=on?'var(--accent)':'var(--border)'; }
      });
      if(typeof _sxVib==='function') _sxVib(6);
    } catch(e){}
  }

  // [S853→S854] 관찰중만 보기 — 상단 활성 섹션 제거 대체. 기본 ON: 관찰중(최근발동 0~5봉·미확정, 발동 포함) 레시피만 노출, 해제 시 전체(3시장 공통). 발동은 렌더시 표시, 관찰중은 비동기 적중패스에서 승격.
  var FIRE_ONLY=true;
  function _fireOnlySet(v){
    FIRE_ONLY=!!v;
    try{
      var rows=document.querySelectorAll('[data-rcpfired]');
      for(var i=0;i<rows.length;i++){ rows[i].style.display=(FIRE_ONLY && rows[i].getAttribute('data-rcpfired')==='0')?'none':''; }
      _fireOnlyNotes();
      var cbs=document.querySelectorAll('input[data-rcpfireonly]');
      for(var k=0;k<cbs.length;k++){ cbs[k].checked=FIRE_ONLY; }
      if(typeof _sxVib==='function') _sxVib(6);
    }catch(_e){}
  }
  function _fireOnlyNotes(){   // [S854] 빈안내 = FIRE_ONLY && 그 카테고리에 표시행(data-rcpfired=1) 0일 때만
    try{
      var em=document.querySelectorAll('[data-rcpfireempty]');
      for(var i=0;i<em.length;i++){ var box=em[i].parentElement; var any=box?box.querySelector('[data-rcpfired=\"1\"]'):null; em[i].style.display=(FIRE_ONLY&&!any)?'block':'none'; }
    }catch(_e){}
  }
  // [S834] 분류 접기/펼치기 — 합본 311개라 기본 접힘, 헤더 클릭으로 토글
  function _catToggle(catId){
    try{
      var el=document.getElementById(catId);
      var arr=document.getElementById(catId+'_arr');
      if(el){ var open=el.style.display!=='none'; el.style.display=open?'none':'block'; if(arr) arr.textContent=open?'▶':'▼'; }
      if(typeof _sxVib==='function') _sxVib(6);
    }catch(e){}
  }

  // 비동기: fetchRows600 단일소스 → 현재봉 발동 + 그룹 + 헤더 + 과거 적중률 (종목 가드)
  async function _populate(sym){
    var ctx = window._sxRecipeCtx; if(!ctx || ctx.sym!==sym) return;
    var body = document.getElementById('sxRecipeBody'); if(!body) return;
    body.setAttribute('data-populated','1');
    var rows;
    try { rows = (window.SXCandleBT && SXCandleBT.fetchRows600) ? await SXCandleBT.fetchRows600(ctx.mk, ctx.tf, ctx.code) : null; } catch(e){ rows=null; }
    if(window._sxRecipeActiveSym!==sym) return;                 // 다른 종목 이동 → 폐기
    body = document.getElementById('sxRecipeBody'); if(!body) return;
    if(!Array.isArray(rows) || rows.length<260){
      body.innerHTML='<div style="padding:14px 12px;font-size:10px;color:var(--text3);line-height:1.5">600봉 미확보(또는 상장 짧음) — 잠시 후 다시 펼쳐 주세요.</div>';
      _setSummary('<span style="color:var(--text3)">데이터 부족</span>'); return;
    }
    // 현재봉 발동 (calcAllScreener 1회)
    var indNow=_calc(rows), fNow=indNow?_feats(indNow, rows, rows.length-1):null;
    var ltNow=indNow?_ltOf(indNow):null, maBullNow=!!(indNow && indNow.maAlign && indNow.maAlign.bullish);
    var rb=_renderBody(fNow, ltNow, maBullNow);
    body.innerHTML = rb.inner;
    _setSummary(rb.fireCount>0
      ? ('<span style="font-weight:700"><span style="color:'+GR+'">진짜 '+rb.fireReal+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+rb.fireFake+'</span></span> <span style="color:var(--text3);font-weight:500">· '+rb.ltLabel+'</span>')
      : ('<span style="color:var(--text3)">관망 · '+rb.ltLabel+'</span>'));
    // [S832] 정배 강겹침(4+) 현재봉 발동 시 summary에 적중률 — 카드 접어도 한눈에. _renderBody 후 fNow/ltNow/maBullNow 재사용.
    var _pbK=0; for(var _ri=0;_ri<_R().length;_ri++){ var _rc=_R()[_ri]; if(_rc.pool==='pullback'&&_rc.kind==='real'&&_fires(_rc, fNow, ltNow, maBullNow)) _pbK++; }
    if(_pbK>=4){ var _sm=document.getElementById('sxRecipeSummary'); if(_sm){ _sm.innerHTML='<span style="color:#2563eb;font-weight:800">🔵 발동 '+_pbK+' · 적중 ~68% 강</span> <span style="color:var(--text3);font-weight:500">· '+rb.ltLabel+'</span>'; } }
    // 과거 적중률 (받은 rows 재사용 · 추가 fetch 없음)
    var scan; try { scan = await _scanStock(sym, rows); } catch(e){ return; }
    if(window._sxRecipeActiveSym!==sym) return;
    // 레시피별 적중률 표시 + 카테고리/풀 통계 누적 (단일 _evalHistory 패스) · catPend는 배지 _pendingByCat과 동일 정의
    var catPend={}, poolStat={pullback:{pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()}, deadcat:{pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()}};
    _R().forEach(function(rec){
      var h=null; try { h=_evalHistory(rec, scan, rows); } catch(e){}
      var el=document.getElementById('rcphit_'+rec.id); if(el){ try { el.innerHTML=_hitHtml(rec, h||{fireCount:0}); } catch(e){ el.textContent='–'; } }
      var bel=document.getElementById('rcpbadge_'+rec.id); if(bel){ try { bel.innerHTML=_stageBadge(rec, h?h.last:null); } catch(e){} }   // [S798] 행 배지 동적 단계
      if(h && h.last && !h.last.complete && el){   // [S854] 관찰중(최근발동·미확정)이면 필터 표시 승격 — 필터 기준=관찰중(발동은 그 0봉 부분집합)
        try{ var _w=(el.closest)?el.closest('[data-rcpfired]'):null; if(_w){ _w.setAttribute('data-rcpfired','1'); if(FIRE_ONLY) _w.style.display=''; } }catch(_eW){}
      }
      if(!h) return;
      var ck=rec.pool+'|'+rec.kind; if(!catPend[ck]) catPend[ck]={count:0,oldest:-1};
      var ps=poolStat[rec.pool]; if(!ps) ps=poolStat[rec.pool]={pend:0,oldest:-1,R:_emptyHz(),F:_emptyHz()};
      if(h.last && !h.last.complete){ catPend[ck].count++; if(h.last.barsAgo>catPend[ck].oldest) catPend[ck].oldest=h.last.barsAgo; ps.pend++; if(h.last.barsAgo>ps.oldest) ps.oldest=h.last.barsAgo; }
      if(h.hz){ var side=(rec.kind==='real')?ps.R:ps.F; for(var hi=0;hi<_HZ.length;hi++){ var hk=_HZ[hi].k; side[hk].h+=h.hz[hk].h; side[hk].t+=h.hz[hk].t; } }   // [S801] 호라이즌별 진짜/가짜 누적
    });
    _fireOnlyNotes();   // [S854] 관찰중 승격 반영 후 카테고리 빈안내 갱신
    if(rb.fireCount===0){   // [S855] 발동 0이면 '관망' 대신 관찰중 요약(접힘 요약과 동일 기준)
      var _rp2=(ltNow==='bull')?'pullback':'deadcat';
      var _pr2=(catPend[_rp2+'|real']||{}).count||0, _pf2=(catPend[_rp2+'|fake']||{}).count||0;
      _setSummary((_pr2+_pf2>0)
        ? ('<span style="font-weight:700">⏳ <span style="color:'+GR+'">진짜 '+_pr2+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+_pf2+'</span></span> <span style="color:var(--text3);font-weight:500">관찰중 · '+rb.ltLabel+'</span>')
        : ('<span style="color:var(--text3)">신호없음 · '+rb.ltLabel+'</span>'));
    }
    if(window._sxRecipeActiveSym!==sym) return;
    // [S832] 현재봉 pullback-real 동시발동 개수(겹침) — 정배열·진짜반등 헤더에 적중률 표시. 대표풀 전수측정(S831): 1~3개 ~60% · 4+개 ~67%(임계점). 겹침=개수만·조합 우열 안 가림. 정배열 탭에서만(역배 무의미).
    var pbRealK=0;
    for(var ri=0;ri<_R().length;ri++){ var rc=_R()[ri]; if(rc.pool==='pullback'&&rc.kind==='real'&&_fires(rc, fNow, ltNow, maBullNow)) pbRealK++; }
    var ovHit=(pbRealK>=4)?68:(pbRealK>=3?62:61);   // [S834] 합본 측정 갱신: 1~2개 61% · 3개 62% · 4+개 68%(단조 유지·robust)
    // 카테고리 헤더 요약 (확정임박 N봉 · 관찰중 M개 · 정배진짜는 겹침 발동)
    CATS.forEach(function(cat){
      var pel=document.getElementById('rcpcat_'+cat.pool+'_'+cat.kind); if(!pel) return;
      var p=catPend[cat.pool+'|'+cat.kind];
      var base='';
      if(p && p.count>0){ var col=(cat.kind==='real')?GR:RD; base='<span style="color:'+col+'">⏳관찰중 '+p.count+'</span><span style="color:var(--text3)"> ·확정임박 '+p.oldest+'봉전</span>'; }
      else base='<span style="color:var(--text3)">관찰중 0</span>';
      var ov='';
      if(cat.pool==='pullback'&&cat.kind==='real'&&pbRealK>0){ var strong=pbRealK>=4; ov=' <span style="color:#2563eb;font-weight:800">· 🔵 '+pbRealK+'개 발동 · 적중 ~'+ovHit+'%'+(strong?' <span style="background:#2563eb;color:#fff;padding:1px 5px;border-radius:4px;font-size:8px">강</span>':'')+'</span>'; }
      pel.innerHTML=base+ov;
    });
    // [S797] 탭별 통계 바 (정/역배 각각) — 관찰중·확정임박·적중평균
    ['pullback','deadcat'].forEach(function(pk){
      var sel=document.getElementById('sxRcpStat_'+pk); if(sel) sel.innerHTML=_statHtml(poolStat[pk]);
    });
  }

  // 시장 유도 (캔들카드 _mktCT와 동일 · fetchRows600 내부 _normMkt가 정규화)
  function _mkOf(stock){ return (stock && (stock._mkt || stock.market)) || ((typeof currentMarket!=='undefined') ? currentMarket : 'kr'); }

  function _wrap(inner, summaryHtml, open){
    return '<div class="anal-card" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin:0 0 8px;overflow:hidden">'
      + '<div onclick="window.SXRecipeSignal&&SXRecipeSignal.toggle()" style="display:flex;align-items:center;gap:7px;padding:12px 14px;cursor:pointer">'
        + '<span id="sxRecipeArrow" style="color:var(--accent);font-size:12px">'+(open?'▼':'▶')+'</span>'
        + '<span style="font-size:13px;font-weight:800;color:var(--text)">🎯 레시피 신호감지</span>'
        + '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span>'
        + '<span id="sxRecipeSummary" style="margin-left:auto;font-size:10px;font-weight:700">'+summaryHtml+'</span>'
      + '</div>'
      + '<div id="sxRecipeBody" data-populated="0" style="display:'+(open?'block':'none')+';padding:0 4px 8px">'+inner+'</div>'
    + '</div>';
  }

  function buildCard(stock, indicators){
    var sym = (stock && (stock.code||stock.name)) || '?';
    window._sxRecipeActiveSym = sym;
    var open = !!window._sxRecipeOpen;
    if(_curTf()!=='day'){
      return _wrap('<div style="padding:12px 12px;font-size:10px;color:var(--text3);line-height:1.5">레시피는 <b>일봉 기준</b>이라 현재 시간프레임에선 평가하지 않아요. 일봉으로 전환 시 표시됩니다.</div>', '<span style="color:var(--text3)">일봉 전용</span>', open);
    }
    window._sxRecipeCtx = { sym:sym, tf:_curTf(), code:(stock && stock.code) || sym, mk:_mkOf(stock) };
    if(open){ setTimeout(function(){ try{ _populate(sym); }catch(e){} }, 60); }
    else {   // [S855] 접힘 요약 자체평가 — 탭 없이 '관찰중 진짜N·가짜M'/'신호없음'. rows600·_scanStock 캐시가 배지카드와 공유라 추가비용 미미. 평가 완료 전엔 '탭하여' 유지, 전개 평가가 먼저 끝나면 양보.
      setTimeout(async function(){
        try{
          if(window._sxRecipeActiveSym!==sym) return;
          var el=document.getElementById('sxRecipeSummary');
          if(!el || el.innerHTML.indexOf('탭하여')<0) return;
          if(!(window.SXCandleBT&&SXCandleBT.fetchRows600)) return;
          var rows=await SXCandleBT.fetchRows600(_mkOf(stock),'day',(stock&&stock.code)||sym);
          if(window._sxRecipeActiveSym!==sym || !Array.isArray(rows) || rows.length<260) return;
          var pend=await _pendingByCat(sym, rows); if(!pend) pend={};
          if(window._sxRecipeActiveSym!==sym) return;
          el=document.getElementById('sxRecipeSummary');
          if(!el || el.innerHTML.indexOf('탭하여')<0) return;
          var lt=null; try{ lt=_ltOf(indicators); }catch(_e){}
          var _rp=(lt==='bull')?'pullback':'deadcat';
          var pr=(pend[_rp+'|real']||{}).count||0, pf=(pend[_rp+'|fake']||{}).count||0;
          el.innerHTML=(pr+pf>0)
            ? '<span style="font-weight:700">⏳ <span style="color:'+GR+'">진짜 '+pr+'</span> <span style="color:var(--text3)">·</span> <span style="color:'+RD+'">가짜 '+pf+'</span></span> <span style="color:var(--text3);font-weight:500">관찰중</span>'
            : '<span style="color:var(--text3)">신호없음</span>';
        }catch(_e){}
      }, 120);
    }
    var loading = '<div style="padding:14px 12px;font-size:10px;color:var(--text3)">레시피 평가 중… <span style="font-size:9px">(600봉 로드)</span></div>';
    var summary = open ? '<span style="color:var(--text3)">분석중…</span>' : '<span style="color:var(--accent)">탭하여 신호 평가 ▸</span>';
    return _wrap(loading, summary, open);
  }

  function toggle(){
    try {
      var body=document.getElementById('sxRecipeBody'), arr=document.getElementById('sxRecipeArrow');
      if(!body) return;
      var open = body.style.display!=='none';
      body.style.display = open?'none':'block';
      if(arr) arr.textContent = open?'▶':'▼';
      window._sxRecipeOpen = !open;
      if(typeof _sxVib==='function') _sxVib(8);
      if(!open && body.getAttribute('data-populated')!=='1'){
        _setSummary('<span style="color:var(--text3)">분석중…</span>');
        var ctx=window._sxRecipeCtx; if(ctx) _populate(ctx.sym);
      }
    } catch(e){}
  }

  window.SXRecipeSignal = { buildCard:buildCard, toggle:toggle, tab:_tab, catToggle:_catToggle, _populate:_populate, _pendingByCat:_pendingByCat, realFireBars:_realFireBars, pullbackSignalBars:_pullbackSignalBars, overlapScan:_overlapScan, profileScan:_profileScan, evalBar:_evalBar, baseRateScan:_baseRateScan, deadcatTrajScan:_deadcatTrajScan, deadcatConfirmScan:_deadcatConfirmScan, deadcatOverlapHzScan:_deadcatOverlapHzScan, deadcatHzBtScan:_deadcatHzBtScan, fireOnly:_fireOnlySet, recipesFor:_recipesFor };
  try{ Object.defineProperty(window.SXRecipeSignal,'RECIPES',{ get:function(){ return _R(); } }); }catch(_e){ window.SXRecipeSignal.RECIPES=RECIPES_BY_MKT.kr; }   // [S849] 구소비처 호환 — currentMarket 세트 동적 반환
})();
