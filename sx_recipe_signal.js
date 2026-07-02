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
  // [S849] 레시피 3시장 분리 — 시장특성이 달라 세트 비혼용. kr=기존311(확장풀 v34 유산)+발굴풀 신규55(중복13 제외) / us·coin=발굴풀 스냅샷(20260701) 전용. 소비처는 _R()(currentMarket 기준) 또는 recipesFor(mk). 등록 표준: 게이트(S848 상대화) + n≥30 + fake ΔN10≥5%p + 카테고리 상한 130.
var RECIPES_BY_MKT = {
  kr: [
  // ── 역배열 · 진짜반등 (상승신호) · 빔서치 강티어+중복제거 [S789] ──
  {id:'dc_r_01', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + RSI<35.84 + MA200 이격도%<-23.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'dev200',type:'num',dir:'lt',th:-23.12}], src:{n:51,late:0.1152,n10:0.686,surv:0.704}},
  {id:'dc_r_02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA200 이격도%<-23.12 + MFI(자금흐름)<36.84',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'mfi',type:'num',dir:'lt',th:36.84}], src:{n:51,late:0.1117,n10:0.686,surv:0.676}},
  {id:'dc_r_03', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + RSI<35.84 + MA120 이격도%<-17.06',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'dev120',type:'num',dir:'lt',th:-17.06}], src:{n:56,late:0.1114,n10:0.696,surv:0.714}},
  {id:'dc_r_04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA120 이격도%<-17.06 + MFI(자금흐름)<36.84',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'mfi',type:'num',dir:'lt',th:36.84}], src:{n:55,late:0.1087,n10:0.691,surv:0.684}},
  {id:'dc_r_05', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA60 이격도%<-11.21 + MFI(자금흐름)<36.84',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'mfi',type:'num',dir:'lt',th:36.84}], src:{n:57,late:0.1075,n10:0.684,surv:0.675}},
  {id:'dc_r_06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + RSI<35.84 + MA60 이격도%<-11.21',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'dev60',type:'num',dir:'lt',th:-11.21}], src:{n:62,late:0.1058,n10:0.71,surv:0.718}},
  {id:'dc_r_07', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA20 이격도%<-6.57 + MFI(자금흐름)<36.84',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'mfi',type:'num',dir:'lt',th:36.84}], src:{n:59,late:0.1039,n10:0.678,surv:0.651}},
  {id:'dc_r_08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA60 이격도%<-11.21 + MA5 기울기%<-2.57',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}], src:{n:63,late:0.1,n10:0.667,surv:0.681}},
  {id:'dc_r_09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA20 이격도%<-6.57 + MA60 이격도%<-11.21',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'dev60',type:'num',dir:'lt',th:-11.21}], src:{n:66,late:0.0976,n10:0.682,surv:0.694}},
  {id:'dc_r_10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + Stoch %K<37.33 + MA60 이격도%<-11.21',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'dev60',type:'num',dir:'lt',th:-11.21}], src:{n:68,late:0.0959,n10:0.676,surv:0.704}},
  {id:'dc_r_11', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + MA20 이격도%<-6.57 + MA5 기울기%<-2.57',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}], src:{n:67,late:0.0944,n10:0.672,surv:0.678}},
  {id:'dc_r_12', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>22.87 + CCI<-139.53 + MA5 기울기%<-2.57',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}], src:{n:66,late:0.078,n10:0.712,surv:0.648}},
  {id:'dc_r_13', pool:'deadcat', kind:'real', mode:'and', label:'ADX<14.18 + MFI(자금흐름)<36.84 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdBelow0',type:'bin'}], src:{n:80,late:0.0481,n10:0.725,surv:0.654}},
  // ── 역배열 · 가짜반등 (하락신호) · 빔서치 패턴게이트 [S789] ──
  {id:'dc_f_01', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + RSI 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:36,late:-0.0178,n10:0.333,surv:0.45}},
  {id:'dc_f_02', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-23.12 + RSI 상승다이버전스 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:31,late:-0.017,n10:0.258,surv:0.416}},
  {id:'dc_f_03', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:40,late:-0.0159,n10:0.375,surv:0.463}},
  {id:'dc_f_04', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×20',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:50,late:-0.0156,n10:0.42,surv:0.466}},
  {id:'dc_f_05', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA120 이격도%<-17.06 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:44,late:-0.0118,n10:0.455,surv:0.477}},
  {id:'dc_f_06', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:53,late:-0.0112,n10:0.434,surv:0.453}},
  {id:'dc_f_07', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:53,late:-0.0112,n10:0.434,surv:0.453}},
  {id:'dc_f_08', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<37.33 + MA60 이격도%<-11.21 + MFI(자금흐름)<36.84 + MACD 골든크로스',
   conds:[{key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}], src:{n:30,late:-0.0107,n10:0.367,surv:0.447}},
  {id:'dc_f_09', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.57 + OBV 상승다이버전스 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:52,late:-0.0104,n10:0.519,surv:0.479}},
  {id:'dc_f_10', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.1 + MA20 이격도%<-6.57 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:43,late:-0.0103,n10:0.512,surv:0.479}},
  {id:'dc_f_11', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + MA200 이격도%<-23.12 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0102,n10:0.417,surv:0.431}},
  {id:'dc_f_12', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:34,late:-0.0099,n10:0.382,surv:0.488}},
  {id:'dc_f_13', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:34,late:-0.0099,n10:0.382,surv:0.488}},
  {id:'dc_f_14', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA200 이격도%<-23.12 + 골든크로스 5×9',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'gx5_9',type:'bin'}], src:{n:46,late:-0.0098,n10:0.478,surv:0.474}},
  {id:'dc_f_15', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA200 이격도%<-23.12 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:46,late:-0.0098,n10:0.478,surv:0.474}},
  {id:'dc_f_16', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + MA200 이격도%<-23.12 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'macdGc',type:'bin'}], src:{n:49,late:-0.0097,n10:0.408,surv:0.437}},
  {id:'dc_f_17', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<14.18 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:30,late:-0.0095,n10:0.3,surv:0.41}},
  {id:'dc_f_18', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + RSI 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:49,late:-0.0093,n10:0.449,surv:0.476}},
  {id:'dc_f_19', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<14.18 + BB 스퀴즈 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'squeeze',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:35,late:-0.0092,n10:0.343,surv:0.377}},
  {id:'dc_f_20', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<35.84 + BB %B<0.1 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:54,late:-0.0089,n10:0.5,surv:0.5}},
  {id:'dc_f_21', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<14.18 + BB 스퀴즈 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'squeeze',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:32,late:-0.0087,n10:0.312,surv:0.388}},
  {id:'dc_f_22', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA120 이격도%<-17.06 + 골든크로스 5×9',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'gx5_9',type:'bin'}], src:{n:48,late:-0.0086,n10:0.5,surv:0.494}},
  {id:'dc_f_23', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA120 이격도%<-17.06 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:48,late:-0.0086,n10:0.5,surv:0.494}},
  {id:'dc_f_24', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MFI(자금흐름)<36.84 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}], src:{n:40,late:-0.0083,n10:0.4,surv:0.47}},
  {id:'dc_f_25', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MFI(자금흐름)<36.84 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.0083,n10:0.4,surv:0.47}},
  {id:'dc_f_26', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MFI(자금흐름)<36.84 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:40,late:-0.0083,n10:0.4,surv:0.47}},
  {id:'dc_f_27', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + MACD 골든크로스 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:38,late:-0.0083,n10:0.447,surv:0.434}},
  {id:'dc_f_28', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:37,late:-0.008,n10:0.378,surv:0.489}},
  {id:'dc_f_29', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.1 + MA20 이격도%<-6.57 + MA5 기울기%<-2.57 + OBV 상승다이버전스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'obvDiv',type:'bin'}], src:{n:39,late:-0.0079,n10:0.538,surv:0.49}},
  {id:'dc_f_30', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA200 이격도%<-23.12 + MFI(자금흐름)<36.84 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}], src:{n:32,late:-0.0076,n10:0.438,surv:0.497}},
  {id:'dc_f_31', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-2.57 + VR(거래량비율)>176.31 + OBV 상승추세',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'vr',type:'num',dir:'gt',th:176.31}, {key:'obvUp',type:'bin'}], src:{n:32,late:-0.0074,n10:0.469,surv:0.425}},
  {id:'dc_f_32', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-139.53 + BB %B<0.1 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.007,n10:0.483,surv:0.472}},
  {id:'dc_f_33', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA120 이격도%<-17.06 + MFI(자금흐름)<36.84 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}], src:{n:33,late:-0.0069,n10:0.455,surv:0.509}},
  {id:'dc_f_34', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + MA200 이격도%<-23.12 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'obvUp',type:'bin'}], src:{n:53,late:-0.0068,n10:0.396,surv:0.423}},
  {id:'dc_f_35', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<14.18 + 골든크로스 5×60',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.18}, {key:'gx5_60',type:'bin'}], src:{n:33,late:-0.0068,n10:0.303,surv:0.436}},
  {id:'dc_f_36', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + 골든크로스 5×20',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:40,late:-0.0067,n10:0.425,surv:0.508}},
  {id:'dc_f_37', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<35.84 + MA20 이격도%<-6.57 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:35.84}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:46,late:-0.0066,n10:0.5,surv:0.485}},
  {id:'dc_f_38', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + Stoch %K<37.33 + VR(거래량비율)>176.31',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'vr',type:'num',dir:'gt',th:176.31}], src:{n:31,late:-0.0062,n10:0.419,surv:0.403}},
  {id:'dc_f_39', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + Stoch %K<37.33 + VR(거래량비율)>176.31 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'vr',type:'num',dir:'gt',th:176.31}, {key:'obvUp',type:'bin'}], src:{n:31,late:-0.0062,n10:0.419,surv:0.403}},
  {id:'dc_f_40', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-17.06 + MA200 이격도%<-23.12 + MFI(자금흐름)<36.84 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}], src:{n:36,late:-0.0059,n10:0.444,surv:0.503}},
  {id:'dc_f_41', pool:'deadcat', kind:'fake', mode:'and', label:'골든크로스 5×20 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:88,late:-0.0059,n10:0.511,surv:0.523}},
  {id:'dc_f_42', pool:'deadcat', kind:'fake', mode:'and', label:'골든크로스 5×20 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:88,late:-0.0059,n10:0.511,surv:0.523}},
  {id:'dc_f_43', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-17.06 + MFI(자금흐름)<36.84 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-17.06}, {key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:36,late:-0.0059,n10:0.444,surv:0.503}},
  {id:'dc_f_44', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.57 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:-0.0055,n10:0.525,surv:0.486}},
  {id:'dc_f_45', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<37.33 + MA20 이격도%<-6.57 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:-0.0055,n10:0.525,surv:0.486}},
  {id:'dc_f_46', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.57 + OBV 상승다이버전스 + DI 하락우위 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:59,late:-0.0055,n10:0.525,surv:0.486}},
  {id:'dc_f_47', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-11.21 + MA200 이격도%<-23.12 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-11.21}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:42,late:-0.0055,n10:0.524,surv:0.488}},
  {id:'dc_f_48', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + CCI<-139.53 + BB %B<0.1 + RSI 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'cci',type:'num',dir:'lt',th:-139.53}, {key:'bbPctB',type:'num',dir:'lt',th:0.1}, {key:'rsiDiv',type:'bin'}], src:{n:33,late:-0.0054,n10:0.455,surv:0.436}},
  {id:'dc_f_49', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.57 + MA5 기울기%<-2.57 + OBV 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.57}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:43,late:-0.0053,n10:0.558,surv:0.502}},
  {id:'dc_f_50', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>22.87 + MA200 이격도%<-23.12 + OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:22.87}, {key:'dev200',type:'num',dir:'lt',th:-23.12}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:30,late:-0.0053,n10:0.3,surv:0.393}},
  {id:'dc_f_51', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<37.33 + MA5 기울기%<-2.57 + VR(거래량비율)>176.31 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:37.33}, {key:'ma5slope',type:'num',dir:'lt',th:-2.57}, {key:'vr',type:'num',dir:'gt',th:176.31}, {key:'sarBear',type:'bin'}], src:{n:33,late:-0.0052,n10:0.455,surv:0.421}},
  {id:'dc_f_52', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)<36.84 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:36.84}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:124,late:-0.0051,n10:0.387,surv:0.444}},
  // ── 정배열 · 진짜반등 (상승신호) · 빔서치 강티어+중복제거 [S789] ──
  {id:'pb_r_01', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%>2.14 + BB 스퀴즈 + 골든크로스 5×20',
   conds:[{key:'ma5slope',type:'num',dir:'gt',th:2.14}, {key:'squeeze',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:61,late:0.1467,n10:0.721,surv:0.67}},
  {id:'pb_r_02', pool:'pullback', kind:'real', mode:'and', label:'CCI>47 + MA5 기울기%>2.14 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:47}, {key:'ma5slope',type:'num',dir:'gt',th:2.14}, {key:'squeeze',type:'bin'}], src:{n:77,late:0.1351,n10:0.727,surv:0.666}},
  {id:'pb_r_03', pool:'pullback', kind:'real', mode:'and', label:'ADX<15.5 + MA200 이격도%>27.03',
   conds:[{key:'adx',type:'num',dir:'lt',th:15.5}, {key:'dev200',type:'num',dir:'gt',th:27.03}], src:{n:169,late:0.1301,n10:0.905,surv:0.771}},
  {id:'pb_r_04', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>13.78 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:59,late:0.1289,n10:0.864,surv:0.763}},
  {id:'pb_r_05', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%>2.14 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'ma5slope',type:'num',dir:'gt',th:2.14}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:88,late:0.1276,n10:0.716,surv:0.675}},
  {id:'pb_r_06', pool:'pullback', kind:'real', mode:'and', label:'RSI>55.01 + ADX<15.5 + MFI(자금흐름)>50.87',
   conds:[{key:'rsi',type:'num',dir:'gt',th:55.01}, {key:'adx',type:'num',dir:'lt',th:15.5}, {key:'mfi',type:'num',dir:'gt',th:50.87}], src:{n:75,late:0.1263,n10:0.733,surv:0.683}},
  {id:'pb_r_07', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%>2.87 + BB 스퀴즈 + 골든크로스 5×20',
   conds:[{key:'dev20',type:'num',dir:'gt',th:2.87}, {key:'squeeze',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:58,late:0.1261,n10:0.707,surv:0.667}},
  {id:'pb_r_08', pool:'pullback', kind:'real', mode:'and', label:'CCI>47 + MA200 이격도%>27.03 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:47}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}], src:{n:71,late:0.1249,n10:0.831,surv:0.713}},
  {id:'pb_r_09', pool:'pullback', kind:'real', mode:'and', label:'ADX<15.5 + MA20 이격도%>2.87',
   conds:[{key:'adx',type:'num',dir:'lt',th:15.5}, {key:'dev20',type:'num',dir:'gt',th:2.87}], src:{n:130,late:0.1217,n10:0.731,surv:0.69}},
  {id:'pb_r_10', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>13.78 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:67,late:0.1216,n10:0.791,surv:0.709}},
  {id:'pb_r_11', pool:'pullback', kind:'real', mode:'and', label:'ADX<15.5 + MA120 이격도%>13.78',
   conds:[{key:'adx',type:'num',dir:'lt',th:15.5}, {key:'dev120',type:'num',dir:'gt',th:13.78}], src:{n:143,late:0.1199,n10:0.874,surv:0.743}},
  {id:'pb_r_12', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%>2.87 + MA200 이격도%>27.03 + BB 스퀴즈',
   conds:[{key:'dev20',type:'num',dir:'gt',th:2.87}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}], src:{n:54,late:0.1185,n10:0.815,surv:0.687}},
  {id:'pb_r_13', pool:'pullback', kind:'real', mode:'and', label:'CCI>47 + MA120 이격도%>13.78 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:47}, {key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'squeeze',type:'bin'}], src:{n:64,late:0.1182,n10:0.781,surv:0.705}},
  {id:'pb_r_14', pool:'pullback', kind:'real', mode:'and', label:'RSI>55.01 + ADX<15.5 + MA60 이격도%>-1.82',
   conds:[{key:'rsi',type:'num',dir:'gt',th:55.01}, {key:'adx',type:'num',dir:'lt',th:15.5}, {key:'dev60',type:'num',dir:'gt',th:-1.82}], src:{n:81,late:0.1181,n10:0.716,surv:0.663}},
  {id:'pb_r_15', pool:'pullback', kind:'real', mode:'and', label:'ADX<15.5 + MA5 기울기%>2.14',
   conds:[{key:'adx',type:'num',dir:'lt',th:15.5}, {key:'ma5slope',type:'num',dir:'gt',th:2.14}], src:{n:125,late:0.1151,n10:0.736,surv:0.732}},
  {id:'pb_r_16', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + 골든크로스 5×20',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'gx5_20',type:'bin'}], src:{n:74,late:0.1147,n10:0.784,surv:0.723}},
  {id:'pb_r_17', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.66 + MA200 이격도%>27.03 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.66}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'macdBelow0',type:'bin'}], src:{n:72,late:0.1121,n10:0.847,surv:0.722}},
  {id:'pb_r_18', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>59.58 + MA5 기울기%>2.14 + BB 스퀴즈',
   conds:[{key:'stochK',type:'num',dir:'gt',th:59.58}, {key:'ma5slope',type:'num',dir:'gt',th:2.14}, {key:'squeeze',type:'bin'}], src:{n:76,late:0.11,n10:0.711,surv:0.697}},
  {id:'pb_r_19', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.66 + MA120 이격도%>13.78 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.66}, {key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'macdBelow0',type:'bin'}], src:{n:65,late:0.1063,n10:0.815,surv:0.697}},
  {id:'pb_r_20', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:64,late:0.1055,n10:0.766,surv:0.678}},
  {id:'pb_r_21', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>59.58 + MA200 이격도%>27.03 + BB 스퀴즈',
   conds:[{key:'stochK',type:'num',dir:'gt',th:59.58}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}], src:{n:99,late:0.1022,n10:0.747,surv:0.652}},
  {id:'pb_r_22', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC>21.28 + ADX<15.5 + MA60 이격도%>-1.82',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:21.28}, {key:'adx',type:'num',dir:'lt',th:15.5}, {key:'dev60',type:'num',dir:'gt',th:-1.82}], src:{n:50,late:0.1014,n10:0.72,surv:0.64}},
  {id:'pb_r_23', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + 골든크로스 5×60',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'gx5_60',type:'bin'}], src:{n:93,late:0.0997,n10:0.731,surv:0.663}},
  {id:'pb_r_24', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>13.78 + 골든크로스 5×20',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'gx5_20',type:'bin'}], src:{n:71,late:0.0981,n10:0.746,surv:0.701}},
  {id:'pb_r_25', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.66 + MA200 이격도%>27.03 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.66}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}], src:{n:92,late:0.0979,n10:0.739,surv:0.66}},
  {id:'pb_r_26', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + MACD 골든크로스',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'macdGc',type:'bin'}], src:{n:216,late:0.0976,n10:0.755,surv:0.682}},
  {id:'pb_r_27', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>59.58 + MA120 이격도%>13.78 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'gt',th:59.58}, {key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'macdBelow0',type:'bin'}], src:{n:72,late:0.0964,n10:0.764,surv:0.657}},
  {id:'pb_r_28', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + BB 스퀴즈 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:144,late:0.0956,n10:0.819,surv:0.692}},
  {id:'pb_r_29', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>59.58 + MA200 이격도%>27.03 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'gt',th:59.58}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'macdBelow0',type:'bin'}], src:{n:81,late:0.0949,n10:0.778,surv:0.67}},
  {id:'pb_r_30', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC>21.28 + BB %B>0.66 + ADX<15.5',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:21.28}, {key:'bbPctB',type:'num',dir:'gt',th:0.66}, {key:'adx',type:'num',dir:'lt',th:15.5}], src:{n:50,late:0.0894,n10:0.78,surv:0.676}},
  {id:'pb_r_31', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:111,late:0.087,n10:0.811,surv:0.658}},
  {id:'pb_r_32', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>27.03 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:121,late:0.0746,n10:0.826,surv:0.679}},
  // ── 정배열 · 가짜반등 (하락신호) · 빔서치 패턴게이트 [S789] ──
  {id:'pb_f_01', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%>-1.82 + VR(거래량비율)>113.95 + OBV 상승추세 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'gt',th:-1.82}, {key:'vr',type:'num',dir:'gt',th:113.95}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:40,late:-0.0229,n10:0.325,surv:0.435}},
  {id:'pb_f_02', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:45,late:-0.0214,n10:0.356,surv:0.447}},
  {id:'pb_f_03', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + 지지선 근접',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}], src:{n:50,late:-0.0204,n10:0.36,surv:0.456}},
  {id:'pb_f_04', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + 지지선 근접 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:50,late:-0.0204,n10:0.36,surv:0.456}},
  {id:'pb_f_05', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + OBV 상승추세 + 지지선 근접',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:34,late:-0.0199,n10:0.382,surv:0.456}},
  {id:'pb_f_06', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%>13.78 + MA200 이격도%>27.03 + MFI(자금흐름)>50.87 + 지지선 근접',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}], src:{n:41,late:-0.0179,n10:0.341,surv:0.517}},
  {id:'pb_f_07', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>27.03 + MFI(자금흐름)>50.87 + 지지선 근접',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}], src:{n:59,late:-0.0172,n10:0.322,surv:0.476}},
  {id:'pb_f_08', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>27.03 + MFI(자금흐름)>50.87 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:57,late:-0.0131,n10:0.333,surv:0.493}},
  {id:'pb_f_09', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + 지지선 근접 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.013,n10:0.424,surv:0.539}},
  {id:'pb_f_10', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>27.03 + OBV 상승다이버전스 + MFI(자금흐름)>50.87 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'sarBear',type:'bin'}], src:{n:42,late:-0.0128,n10:0.452,surv:0.519}},
  {id:'pb_f_11', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%>13.78 + MFI(자금흐름)>50.87 + 지지선 근접',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}], src:{n:44,late:-0.0113,n10:0.364,surv:0.509}},
  {id:'pb_f_12', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%>13.78 + OBV 상승다이버전스 + MFI(자금흐름)>50.87 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0073,n10:0.441,surv:0.485}},
  {id:'pb_f_13', pool:'pullback', kind:'fake', mode:'and', label:'VR(거래량비율)>113.95 + OBV 상승추세 + 지지선 근접 + DI 하락우위',
   conds:[{key:'vr',type:'num',dir:'gt',th:113.95}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:32,late:-0.0071,n10:0.469,surv:0.528}},
  {id:'pb_f_14', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%>-1.82 + MFI(자금흐름)>50.87 + VR(거래량비율)>113.95 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'gt',th:-1.82}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'vr',type:'num',dir:'gt',th:113.95}, {key:'nearSup',type:'bin'}], src:{n:30,late:-0.0065,n10:0.333,surv:0.483}},
  {id:'pb_f_15', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>50.87 + VR(거래량비율)>113.95 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'vr',type:'num',dir:'gt',th:113.95}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0062,n10:0.432,surv:0.48}},
  {id:'pb_f_16', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%>13.78 + MFI(자금흐름)>50.87 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev120',type:'num',dir:'gt',th:13.78}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:42,late:-0.0054,n10:0.381,surv:0.533}},
  {id:'pb_f_17', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>27.03 + MFI(자금흐름)>50.87 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'gt',th:27.03}, {key:'mfi',type:'num',dir:'gt',th:50.87}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:49,late:-0.0052,n10:0.408,surv:0.541}},
  // ════ [S834] 확장풀(115종) beam-search 합본 — 정식 채택(정배 4+겹침 68% 단조유지 검증·역배는 단조깨짐 미표시). ext:1 ════
  // ── deadcat-real 신규(116) ──
  {id:'dc_r_x001', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K>33.34 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'gt',th:33.34}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:0.0836,n10:0.7924528301886793,surv:0.7226415094339623},ext:1},
  {id:'dc_r_x002', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:59,late:0.0772,n10:0.9152542372881356,surv:0.766101694915254},ext:1},
  {id:'dc_r_x003', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA200 이격도%<-30.27 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'rsiDiv',type:'bin'}], src:{n:60,late:0.0761,n10:0.8666666666666667,surv:0.7283333333333334},ext:1},
  {id:'dc_r_x004', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + MA120 이격도%<-21.5 + MFI(자금흐름)<31.18',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:51,late:0.0746,n10:0.7450980392156863,surv:0.7117647058823527},ext:1},
  {id:'dc_r_x005', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-30.27 + RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:56,late:0.0742,n10:0.8928571428571429,surv:0.7410714285714285},ext:1},
  {id:'dc_r_x006', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:54,late:0.0742,n10:0.8703703703703703,surv:0.7351851851851853},ext:1},
  {id:'dc_r_x007', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA200 이격도%<-30.27 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'rsiDiv',type:'bin'}], src:{n:66,late:0.0725,n10:0.8636363636363636,surv:0.7242424242424244},ext:1},
  {id:'dc_r_x008', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + RSI<36.65 + MA200 이격도%<-30.27',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev200',type:'num',dir:'lt',th:-30.27}], src:{n:54,late:0.0723,n10:0.7037037037037037,surv:0.7370370370370369},ext:1},
  {id:'dc_r_x009', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MA200 이격도%<-30.27 + MFI(자금흐름)<31.18',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:90,late:0.0722,n10:0.7777777777777778,surv:0.6988888888888886},ext:1},
  {id:'dc_r_x010', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:56,late:0.0697,n10:0.875,surv:0.7464285714285713},ext:1},
  {id:'dc_r_x011', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:65,late:0.0691,n10:0.8307692307692308,surv:0.7323076923076923},ext:1},
  {id:'dc_r_x012', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.61 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}, {key:'sarBear',type:'bin'}], src:{n:70,late:0.0687,n10:0.8428571428571429,surv:0.6971428571428571},ext:1},
  {id:'dc_r_x013', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K>33.34 + MA200 이격도%<-30.27 + BB 스퀴즈',
   conds:[{key:'stochK',type:'num',dir:'gt',th:33.34}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'squeeze',type:'bin'}], src:{n:63,late:0.0683,n10:0.746031746031746,surv:0.6650793650793649},ext:1},
  {id:'dc_r_x014', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-21.5 + RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:60,late:0.0681,n10:0.8833333333333333,surv:0.7433333333333333},ext:1},
  {id:'dc_r_x015', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:65,late:0.0679,n10:0.8307692307692308,surv:0.7230769230769231},ext:1},
  {id:'dc_r_x016', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.61',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:79,late:0.0675,n10:0.7848101265822784,surv:0.6924050632911393},ext:1},
  {id:'dc_r_x017', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.61 + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}, {key:'macdBelow0',type:'bin'}], src:{n:79,late:0.0675,n10:0.7848101265822784,surv:0.6924050632911393},ext:1},
  {id:'dc_r_x018', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA20 이격도%<-7.4 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}], src:{n:72,late:0.0674,n10:0.8611111111111112,surv:0.7111111111111111},ext:1},
  {id:'dc_r_x019', pool:'deadcat', kind:'real', mode:'and', label:'MFI(자금흐름)<31.18 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:0.0663,n10:0.8166666666666667,surv:0.7200000000000001},ext:1},
  {id:'dc_r_x020', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + MA120 이격도%<-21.5 + VR(거래량비율)<60.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:52,late:0.0662,n10:0.7884615384615384,surv:0.7288461538461537},ext:1},
  {id:'dc_r_x021', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA120 이격도%<-21.5 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}], src:{n:81,late:0.0661,n10:0.8518518518518519,surv:0.7246913580246914},ext:1},
  {id:'dc_r_x022', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MA120 이격도%<-21.5 + MFI(자금흐름)<31.18',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:98,late:0.0660,n10:0.7653061224489796,surv:0.6775510204081631},ext:1},
  {id:'dc_r_x023', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.61 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}, {key:'diBear',type:'bin'}], src:{n:76,late:0.0660,n10:0.7763157894736842,surv:0.6921052631578948},ext:1},
  {id:'dc_r_x024', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + VR(거래량비율)<60.61 + 지지선 근접',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}, {key:'nearSup',type:'bin'}], src:{n:54,late:0.0656,n10:0.7962962962962963,surv:0.6944444444444444},ext:1},
  {id:'dc_r_x025', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)<31.18 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'sarBear',type:'bin'}], src:{n:83,late:0.0655,n10:0.8554216867469879,surv:0.7132530120481928},ext:1},
  {id:'dc_r_x026', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)<31.18 + 지지선 근접',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'nearSup',type:'bin'}], src:{n:64,late:0.0638,n10:0.84375,surv:0.71875},ext:1},
  {id:'dc_r_x027', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA200 이격도%<-30.27 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'rsiDiv',type:'bin'}], src:{n:59,late:0.0636,n10:0.864406779661017,surv:0.6813559322033899},ext:1},
  {id:'dc_r_x028', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MA60 이격도%<-13.23 + MFI(자금흐름)<31.18',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:122,late:0.0636,n10:0.7786885245901639,surv:0.6901639344262294},ext:1},
  {id:'dc_r_x029', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA60 이격도%<-13.23 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}], src:{n:78,late:0.0635,n10:0.8589743589743589,surv:0.7282051282051283},ext:1},
  {id:'dc_r_x030', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:88,late:0.0632,n10:0.8409090909090909,surv:0.7102272727272726},ext:1},
  {id:'dc_r_x031', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)<31.18 + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}], src:{n:88,late:0.0632,n10:0.8409090909090909,surv:0.7102272727272726},ext:1},
  {id:'dc_r_x032', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)<31.18 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'diBear',type:'bin'}], src:{n:88,late:0.0632,n10:0.8409090909090909,surv:0.7102272727272726},ext:1},
  {id:'dc_r_x033', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA20 이격도%<-7.4 + RSI 상승다이버전스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}], src:{n:63,late:0.0626,n10:0.8571428571428571,surv:0.7000000000000001},ext:1},
  {id:'dc_r_x034', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA20 이격도%<-7.4 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}], src:{n:87,late:0.0626,n10:0.8045977011494253,surv:0.7080459770114942},ext:1},
  {id:'dc_r_x035', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-30.27 + MFI(자금흐름)<31.18 + 지지선 근접',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'nearSup',type:'bin'}], src:{n:141,late:0.0626,n10:0.75177304964539,surv:0.670921985815603},ext:1},
  {id:'dc_r_x036', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA200 이격도%<-30.27 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:150,late:0.0625,n10:0.7533333333333333,surv:0.6853333333333335},ext:1},
  {id:'dc_r_x037', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA120 이격도%<-21.5 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}], src:{n:70,late:0.0618,n10:0.8857142857142857,surv:0.6971428571428573},ext:1},
  {id:'dc_r_x038', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MA200 이격도%<-30.27 + MFI(자금흐름)<31.18',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:166,late:0.0617,n10:0.7530120481927711,surv:0.6771084337349401},ext:1},
  {id:'dc_r_x039', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:50,late:0.0615,n10:0.86,surv:0.71},ext:1},
  {id:'dc_r_x040', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-30.27 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:118,late:0.0612,n10:0.7288135593220338,surv:0.6881355932203389},ext:1},
  {id:'dc_r_x041', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:69,late:0.0611,n10:0.855072463768116,surv:0.6782608695652175},ext:1},
  {id:'dc_r_x042', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA120 이격도%<-21.5 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}], src:{n:85,late:0.0609,n10:0.8352941176470589,surv:0.715294117647059},ext:1},
  {id:'dc_r_x043', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:102,late:0.0607,n10:0.803921568627451,surv:0.6999999999999997},ext:1},
  {id:'dc_r_x044', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:96,late:0.0606,n10:0.7916666666666666,surv:0.7041666666666666},ext:1},
  {id:'dc_r_x045', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:124,late:0.0606,n10:0.7580645161290323,surv:0.6862903225806455},ext:1},
  {id:'dc_r_x046', pool:'deadcat', kind:'real', mode:'and', label:'MFI(자금흐름)<31.18 + MACD 골든크로스',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdGc',type:'bin'}], src:{n:70,late:0.0598,n10:0.8,surv:0.7100000000000001},ext:1},
  {id:'dc_r_x047', pool:'deadcat', kind:'real', mode:'and', label:'MFI(자금흐름)<31.18 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:70,late:0.0598,n10:0.8,surv:0.7100000000000001},ext:1},
  {id:'dc_r_x048', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-21.5 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:66,late:0.0592,n10:0.8484848484848485,surv:0.6984848484848485},ext:1},
  {id:'dc_r_x049', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}], src:{n:105,late:0.0587,n10:0.7904761904761904,surv:0.6914285714285713},ext:1},
  {id:'dc_r_x050', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:105,late:0.0587,n10:0.7904761904761904,surv:0.6914285714285713},ext:1},
  {id:'dc_r_x051', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + RSI 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'rsiDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:104,late:0.0585,n10:0.7884615384615384,surv:0.6923076923076922},ext:1},
  {id:'dc_r_x052', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + BB %B<0.07 + MFI(자금흐름)<31.18',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:56,late:0.0584,n10:0.7142857142857143,surv:0.6928571428571427},ext:1},
  {id:'dc_r_x053', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA200 이격도%<-30.27 + MFI(자금흐름)<31.18',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:158,late:0.0582,n10:0.740506329113924,surv:0.6753164556962027},ext:1},
  {id:'dc_r_x054', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-30.27 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:56,late:0.0580,n10:0.8214285714285714,surv:0.6696428571428571},ext:1},
  {id:'dc_r_x055', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:0.0577,n10:0.7796610169491526,surv:0.6847457627118644},ext:1},
  {id:'dc_r_x056', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + RSI<36.65 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}], src:{n:89,late:0.0576,n10:0.797752808988764,surv:0.6786516853932586},ext:1},
  {id:'dc_r_x057', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + MFI(자금흐름)<31.18',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:179,late:0.0576,n10:0.7318435754189944,surv:0.662569832402235},ext:1},
  {id:'dc_r_x058', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:108,late:0.0575,n10:0.7592592592592593,surv:0.698148148148148},ext:1},
  {id:'dc_r_x059', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA60 이격도%<-13.23 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}], src:{n:74,late:0.0573,n10:0.8243243243243243,surv:0.7054054054054053},ext:1},
  {id:'dc_r_x060', pool:'deadcat', kind:'real', mode:'and', label:'MA5 기울기%<-3.66 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:146,late:0.0570,n10:0.7123287671232876,surv:0.6835616438356165},ext:1},
  {id:'dc_r_x061', pool:'deadcat', kind:'real', mode:'and', label:'MA5 기울기%<-3.66 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:70,late:0.0563,n10:0.7714285714285715,surv:0.6857142857142857},ext:1},
  {id:'dc_r_x062', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + BB %B<0.07 + ADX>27.53',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'adx',type:'num',dir:'gt',th:27.53}], src:{n:53,late:0.0562,n10:0.7169811320754716,surv:0.7150943396226415},ext:1},
  {id:'dc_r_x063', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + RSI<36.65 + MFI(자금흐름)<31.18',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:79,late:0.0561,n10:0.7088607594936709,surv:0.670886075949367},ext:1},
  {id:'dc_r_x064', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + MA20 이격도%<-7.4 + MFI(자금흐름)<31.18',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:77,late:0.0560,n10:0.7012987012987013,surv:0.6597402597402597},ext:1},
  {id:'dc_r_x065', pool:'deadcat', kind:'real', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:58,late:0.0559,n10:0.7758620689655172,surv:0.6482758620689656},ext:1},
  {id:'dc_r_x066', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA120 이격도%<-21.5 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:181,late:0.0549,n10:0.7292817679558011,surv:0.6674033149171273},ext:1},
  {id:'dc_r_x067', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MFI(자금흐름)<31.18 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'diBear',type:'bin'}], src:{n:166,late:0.0549,n10:0.7951807228915663,surv:0.7018072289156626},ext:1},
  {id:'dc_r_x068', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:150,late:0.0548,n10:0.76,surv:0.6833333333333336},ext:1},
  {id:'dc_r_x069', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:185,late:0.0546,n10:0.7405405405405405,surv:0.683783783783784},ext:1},
  {id:'dc_r_x070', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MA200 이격도%<-30.27 + RSI 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'rsiDiv',type:'bin'}], src:{n:86,late:0.0545,n10:0.7906976744186046,surv:0.6872093023255815},ext:1},
  {id:'dc_r_x071', pool:'deadcat', kind:'real', mode:'and', label:'MA5 기울기%<-3.66 + MFI(자금흐름)<31.18 + 지지선 근접',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'nearSup',type:'bin'}], src:{n:164,late:0.0544,n10:0.7439024390243902,surv:0.6713414634146345},ext:1},
  {id:'dc_r_x072', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MA120 이격도%<-21.5 + RSI 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}], src:{n:102,late:0.0542,n10:0.8137254901960784,surv:0.7058823529411765},ext:1},
  {id:'dc_r_x073', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:118,late:0.0538,n10:0.7796610169491526,surv:0.6949152542372883},ext:1},
  {id:'dc_r_x074', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:118,late:0.0537,n10:0.7796610169491526,surv:0.6915254237288136},ext:1},
  {id:'dc_r_x075', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:170,late:0.0533,n10:0.7235294117647059,surv:0.6711764705882356},ext:1},
  {id:'dc_r_x076', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}], src:{n:119,late:0.0531,n10:0.773109243697479,surv:0.689075630252101},ext:1},
  {id:'dc_r_x077', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:119,late:0.0531,n10:0.773109243697479,surv:0.689075630252101},ext:1},
  {id:'dc_r_x078', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-21.5 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:159,late:0.0526,n10:0.7295597484276729,surv:0.688050314465409},ext:1},
  {id:'dc_r_x079', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:133,late:0.0523,n10:0.7518796992481203,surv:0.6879699248120302},ext:1},
  {id:'dc_r_x080', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'sarBear',type:'bin'}], src:{n:166,late:0.0522,n10:0.7409638554216867,surv:0.6879518072289155},ext:1},
  {id:'dc_r_x081', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:111,late:0.0521,n10:0.8198198198198198,surv:0.6873873873873875},ext:1},
  {id:'dc_r_x082', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:201,late:0.0516,n10:0.736318407960199,surv:0.6741293532338313},ext:1},
  {id:'dc_r_x083', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:123,late:0.0514,n10:0.8048780487804879,surv:0.6967479674796747},ext:1},
  {id:'dc_r_x084', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MA5 기울기%<-3.66 + RSI 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'rsiDiv',type:'bin'}], src:{n:62,late:0.0512,n10:0.8225806451612904,surv:0.6838709677419356},ext:1},
  {id:'dc_r_x085', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA60 이격도%<-13.23 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:229,late:0.0510,n10:0.74235807860262,surv:0.6663755458515287},ext:1},
  {id:'dc_r_x086', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}], src:{n:124,late:0.0509,n10:0.7983870967741935,surv:0.696774193548387},ext:1},
  {id:'dc_r_x087', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:124,late:0.0509,n10:0.7983870967741935,surv:0.696774193548387},ext:1},
  {id:'dc_r_x088', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:113,late:0.0507,n10:0.7610619469026548,surv:0.6831858407079647},ext:1},
  {id:'dc_r_x089', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + ADX>27.53 + VR(거래량비율)<60.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:50,late:0.0503,n10:0.74,surv:0.72},ext:1},
  {id:'dc_r_x090', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MFI(자금흐름)<31.18 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}], src:{n:170,late:0.0498,n10:0.7705882352941177,surv:0.6876470588235294},ext:1},
  {id:'dc_r_x091', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:117,late:0.0497,n10:0.7863247863247863,surv:0.7350427350427352},ext:1},
  {id:'dc_r_x092', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + MA5 기울기%<-3.66 + MFI(자금흐름)<31.18',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:75,late:0.0497,n10:0.72,surv:0.6813333333333331},ext:1},
  {id:'dc_r_x093', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + MFI(자금흐름)<31.18 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'sarBear',type:'bin'}], src:{n:116,late:0.0496,n10:0.7241379310344828,surv:0.6758620689655171},ext:1},
  {id:'dc_r_x094', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MA20 이격도%<-7.4 + MFI(자금흐름)<31.18',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:111,late:0.0495,n10:0.7297297297297297,surv:0.6747747747747749},ext:1},
  {id:'dc_r_x095', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:89,late:0.0488,n10:0.797752808988764,surv:0.69438202247191},ext:1},
  {id:'dc_r_x096', pool:'deadcat', kind:'real', mode:'and', label:'MA5 기울기%<-3.66 + MFI(자금흐름)<31.18 + MACD 영선아래',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.66}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}], src:{n:223,late:0.0485,n10:0.726457399103139,surv:0.6659192825112111},ext:1},
  {id:'dc_r_x097', pool:'deadcat', kind:'real', mode:'and', label:'VR(거래량비율)<60.61 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'vr',type:'num',dir:'lt',th:60.61}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:58,late:0.0479,n10:0.8103448275862069,surv:0.6620689655172413},ext:1},
  {id:'dc_r_x098', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-13.23 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:191,late:0.0474,n10:0.7382198952879581,surv:0.6816753926701573},ext:1},
  {id:'dc_r_x099', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:149,late:0.0472,n10:0.738255033557047,surv:0.6859060402684566},ext:1},
  {id:'dc_r_x100', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + MA60 이격도%<-13.23 + RSI 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'rsiDiv',type:'bin'}], src:{n:65,late:0.0472,n10:0.8153846153846154,surv:0.66},ext:1},
  {id:'dc_r_x101', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.39 + ADX>27.53 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'sarBear',type:'bin'}], src:{n:66,late:0.0472,n10:0.7121212121212122,surv:0.6681818181818181},ext:1},
  {id:'dc_r_x102', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MA20 이격도%<-7.4 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:263,late:0.0472,n10:0.7224334600760456,surv:0.6661596958174908},ext:1},
  {id:'dc_r_x103', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'diBear',type:'bin'}], src:{n:188,late:0.0471,n10:0.7180851063829787,surv:0.6749999999999999},ext:1},
  {id:'dc_r_x104', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + MFI(자금흐름)<31.18',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:181,late:0.0470,n10:0.7458563535911602,surv:0.6740331491712708},ext:1},
  {id:'dc_r_x105', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}], src:{n:189,late:0.0465,n10:0.7142857142857143,surv:0.6730158730158728},ext:1},
  {id:'dc_r_x106', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'macdBelow0',type:'bin'}], src:{n:189,late:0.0465,n10:0.7142857142857143,surv:0.6730158730158728},ext:1},
  {id:'dc_r_x107', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:230,late:0.0464,n10:0.7434782608695653,surv:0.6960869565217395},ext:1},
  {id:'dc_r_x108', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.53 + RSI<36.65 + ADX>27.53',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.53}, {key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}], src:{n:66,late:0.0462,n10:0.7424242424242424,surv:0.6787878787878786},ext:1},
  {id:'dc_r_x109', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MFI(자금흐름)<31.18 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'sarBear',type:'bin'}], src:{n:299,late:0.0453,n10:0.7290969899665551,surv:0.6702341137123751},ext:1},
  {id:'dc_r_x110', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + ADX>27.53 + 지지선 근접',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'adx',type:'num',dir:'gt',th:27.53}, {key:'nearSup',type:'bin'}], src:{n:127,late:0.0451,n10:0.7086614173228346,surv:0.6692913385826773},ext:1},
  {id:'dc_r_x111', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MFI(자금흐름)<31.18',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:314,late:0.0444,n10:0.732484076433121,surv:0.6735668789808923},ext:1},
  {id:'dc_r_x112', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MFI(자금흐름)<31.18 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}], src:{n:314,late:0.0444,n10:0.732484076433121,surv:0.6735668789808923},ext:1},
  {id:'dc_r_x113', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.65 + MFI(자금흐름)<31.18 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.65}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'diBear',type:'bin'}], src:{n:314,late:0.0444,n10:0.732484076433121,surv:0.6735668789808923},ext:1},
  {id:'dc_r_x114', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.4 + MFI(자금흐름)<31.18 + VR(거래량비율)<60.61',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'vr',type:'num',dir:'lt',th:60.61}], src:{n:213,late:0.0443,n10:0.7183098591549296,surv:0.6727699530516437},ext:1},
  {id:'dc_r_x115', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-21.5 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:97,late:0.0432,n10:0.7525773195876289,surv:0.6587628865979381},ext:1},
  {id:'dc_r_x116', pool:'deadcat', kind:'real', mode:'and', label:'ADX>27.53 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'gt',th:27.53}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:72,late:0.0429,n10:0.7638888888888888,surv:0.6277777777777778},ext:1},
  // ── deadcat-fake 신규(45) ──
  {id:'dc_f_x001', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>26.39 + MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvUp',type:'bin'}], src:{n:32,late:-0.0362,n10:0.25,surv:0.39687500000000003},ext:1},
  {id:'dc_f_x002', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:37,late:-0.0279,n10:0.3783783783783784,surv:0.4594594594594594},ext:1},
  {id:'dc_f_x003', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>26.39 + MA120 이격도%<-21.5 + OBV 상승추세 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:32,late:-0.0250,n10:0.25,surv:0.41875},ext:1},
  {id:'dc_f_x004', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<60.61 + 지지선 근접 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.61}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:31,late:-0.0208,n10:0.45161290322580644,surv:0.4806451612903226},ext:1},
  {id:'dc_f_x005', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:61,late:-0.0195,n10:0.4098360655737705,surv:0.45737704918032773},ext:1},
  {id:'dc_f_x006', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:40,late:-0.0190,n10:0.225,surv:0.41999999999999993},ext:1},
  {id:'dc_f_x007', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:56,late:-0.0187,n10:0.42857142857142855,surv:0.4732142857142856},ext:1},
  {id:'dc_f_x008', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + BB 스퀴즈 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:48,late:-0.0160,n10:0.5625,surv:0.4833333333333334},ext:1},
  {id:'dc_f_x009', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:40,late:-0.0155,n10:0.4,surv:0.4574999999999999},ext:1},
  {id:'dc_f_x010', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + BB 스퀴즈 + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.0155,n10:0.4,surv:0.4574999999999999},ext:1},
  {id:'dc_f_x011', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-30.27 + OBV 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:39,late:-0.0150,n10:0.5128205128205128,surv:0.4769230769230769},ext:1},
  {id:'dc_f_x012', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-30.27 + OBV 상승다이버전스 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:39,late:-0.0150,n10:0.5128205128205128,surv:0.4769230769230769},ext:1},
  {id:'dc_f_x013', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-30.27 + OBV 상승다이버전스 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:39,late:-0.0150,n10:0.5128205128205128,surv:0.4769230769230769},ext:1},
  {id:'dc_f_x014', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:55,late:-0.0139,n10:0.41818181818181815,surv:0.47818181818181804},ext:1},
  {id:'dc_f_x015', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>26.39 + OBV 상승다이버전스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'obvDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:50,late:-0.0132,n10:0.44,surv:0.45800000000000013},ext:1},
  {id:'dc_f_x016', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + BB 스퀴즈 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:37,late:-0.0131,n10:0.5675675675675675,surv:0.5162162162162163},ext:1},
  {id:'dc_f_x017', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)<31.18 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'sarBear',type:'bin'}], src:{n:70,late:-0.0124,n10:0.4857142857142857,surv:0.4785714285714285},ext:1},
  {id:'dc_f_x018', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)<31.18 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:70,late:-0.0124,n10:0.4857142857142857,surv:0.4785714285714285},ext:1},
  {id:'dc_f_x019', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + OBV 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:38,late:-0.0114,n10:0.5263157894736842,surv:0.4894736842105263},ext:1},
  {id:'dc_f_x020', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + BB 스퀴즈 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:43,late:-0.0113,n10:0.4186046511627907,surv:0.502325581395349},ext:1},
  {id:'dc_f_x021', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)<31.18 + DI 하락우위 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:67,late:-0.0111,n10:0.47761194029850745,surv:0.4716417910447761},ext:1},
  {id:'dc_f_x022', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + BB 스퀴즈 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:51,late:-0.0111,n10:0.43137254901960786,surv:0.46078431372549017},ext:1},
  {id:'dc_f_x023', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-7.4 + MA60 이격도%<-13.23 + OBV 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.4}, {key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:35,late:-0.0101,n10:0.45714285714285713,surv:0.4771428571428573},ext:1},
  {id:'dc_f_x024', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + 골든크로스 5×20',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'gx5_20',type:'bin'}], src:{n:30,late:-0.0097,n10:0.5333333333333333,surv:0.52},ext:1},
  {id:'dc_f_x025', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + MA200 이격도%<-30.27 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:30,late:-0.0097,n10:0.5333333333333333,surv:0.52},ext:1},
  {id:'dc_f_x026', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.07 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:35,late:-0.0082,n10:0.5428571428571428,surv:0.4742857142857142},ext:1},
  {id:'dc_f_x027', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.07 + 골든크로스 5×9 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:32,late:-0.0080,n10:0.46875,surv:0.47187500000000004},ext:1},
  {id:'dc_f_x028', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + OBV 상승다이버전스 + MFI(자금흐름)<31.18',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}], src:{n:39,late:-0.0075,n10:0.46153846153846156,surv:0.48717948717948734},ext:1},
  {id:'dc_f_x029', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + OBV 상승다이버전스 + MFI(자금흐름)<31.18 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'macdBelow0',type:'bin'}], src:{n:39,late:-0.0075,n10:0.46153846153846156,surv:0.48717948717948734},ext:1},
  {id:'dc_f_x030', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + OBV 상승다이버전스 + MFI(자금흐름)<31.18 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'diBear',type:'bin'}], src:{n:39,late:-0.0075,n10:0.46153846153846156,surv:0.48717948717948734},ext:1},
  {id:'dc_f_x031', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + BB 스퀴즈 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:40,late:-0.0072,n10:0.55,surv:0.4950000000000001},ext:1},
  {id:'dc_f_x032', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)<31.18 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:36,late:-0.0071,n10:0.5,surv:0.525},ext:1},
  {id:'dc_f_x033', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:92,late:-0.0069,n10:0.5217391304347826,surv:0.48043478260869577},ext:1},
  {id:'dc_f_x034', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>26.39 + Stoch %K>33.34 + MA200 이격도%<-30.27 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.39}, {key:'stochK',type:'num',dir:'gt',th:33.34}, {key:'dev200',type:'num',dir:'lt',th:-30.27}, {key:'macdBelow0',type:'bin'}], src:{n:45,late:-0.0068,n10:0.3111111111111111,surv:0.4511111111111111},ext:1},
  {id:'dc_f_x035', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:104,late:-0.0067,n10:0.5288461538461539,surv:0.4990384615384616},ext:1},
  {id:'dc_f_x036', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:44,late:-0.0067,n10:0.5681818181818182,surv:0.5022727272727273},ext:1},
  {id:'dc_f_x037', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + BB 스퀴즈 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:44,late:-0.0067,n10:0.5681818181818182,surv:0.5022727272727273},ext:1},
  {id:'dc_f_x038', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + RSI 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:30,late:-0.0067,n10:0.36666666666666664,surv:0.48666666666666675},ext:1},
  {id:'dc_f_x039', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-21.5 + RSI 상승다이버전스 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-21.5}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:30,late:-0.0067,n10:0.36666666666666664,surv:0.48666666666666675},ext:1},
  {id:'dc_f_x040', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)<31.18 + BB 스퀴즈 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:89,late:-0.0055,n10:0.5056179775280899,surv:0.4741573033707867},ext:1},
  {id:'dc_f_x041', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:75,late:-0.0052,n10:0.5466666666666666,surv:0.492},ext:1},
  {id:'dc_f_x042', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:87,late:-0.0052,n10:0.5517241379310345,surv:0.5126436781609198},ext:1},
  {id:'dc_f_x043', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:37,late:-0.0052,n10:0.4864864864864865,surv:0.518918918918919},ext:1},
  {id:'dc_f_x044', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13.23 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13.23}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:37,late:-0.0052,n10:0.4864864864864865,surv:0.518918918918919},ext:1},
  {id:'dc_f_x045', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)<31.18 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.18}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:94,late:-0.0050,n10:0.5212765957446809,surv:0.4755319148936172},ext:1},
  // ── pullback-real 신규(13) ──
  {id:'pb_r_x001', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.17 + MA200 이격도%>19.06 + 지지선 근접',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.17}, {key:'dev200',type:'num',dir:'gt',th:19.06}, {key:'nearSup',type:'bin'}], src:{n:70,late:0.1019,n10:0.8857142857142857,surv:0.8057142857142853},ext:1},
  {id:'pb_r_x002', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.17 + MA20 이격도%>3.82 + MA60 이격도%<-0.19',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.17}, {key:'dev20',type:'num',dir:'gt',th:3.82}, {key:'dev60',type:'num',dir:'lt',th:-0.19}], src:{n:59,late:0.0987,n10:0.7966101694915254,surv:0.7084745762711864},ext:1},
  {id:'pb_r_x003', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%>3.82 + MA60 이격도%<-0.19 + BB 스퀴즈',
   conds:[{key:'dev20',type:'num',dir:'gt',th:3.82}, {key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'squeeze',type:'bin'}], src:{n:113,late:0.0952,n10:0.7345132743362832,surv:0.6504424778761063},ext:1},
  {id:'pb_r_x004', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-0.19 + MA200 이격도%>19.06 + RSI 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'dev200',type:'num',dir:'gt',th:19.06}, {key:'rsiDiv',type:'bin'}], src:{n:60,late:0.0859,n10:0.7666666666666667,surv:0.6283333333333333},ext:1},
  {id:'pb_r_x005', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.82 + ADX<14.17 + MA60 이격도%<-0.19',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.82}, {key:'adx',type:'num',dir:'lt',th:14.17}, {key:'dev60',type:'num',dir:'lt',th:-0.19}], src:{n:99,late:0.0859,n10:0.7575757575757576,surv:0.6858585858585857},ext:1},
  {id:'pb_r_x006', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>74.64 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'gt',th:74.64}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:55,late:0.0848,n10:0.8,surv:0.7309090909090908},ext:1},
  {id:'pb_r_x007', pool:'pullback', kind:'real', mode:'and', label:'골든크로스 5×20 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:113,late:0.0824,n10:0.7256637168141593,surv:0.6849557522123897},ext:1},
  {id:'pb_r_x008', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.82 + MA20 이격도%>3.82 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.82}, {key:'dev20',type:'num',dir:'gt',th:3.82}, {key:'sarBear',type:'bin'}], src:{n:56,late:0.0813,n10:0.7678571428571429,surv:0.6678571428571428},ext:1},
  {id:'pb_r_x009', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%>19.06 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'gt',th:19.06}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:67,late:0.0787,n10:0.7761194029850746,surv:0.6119402985074628},ext:1},
  {id:'pb_r_x010', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.17 + MA200 이격도%>19.06 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.17}, {key:'dev200',type:'num',dir:'gt',th:19.06}, {key:'sarBear',type:'bin'}], src:{n:349,late:0.0781,n10:0.7707736389684814,surv:0.6727793696275077},ext:1},
  {id:'pb_r_x011', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>74.64 + MA60 이격도%<-0.19 + 골든크로스 5×9',
   conds:[{key:'stochK',type:'num',dir:'gt',th:74.64}, {key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'gx5_9',type:'bin'}], src:{n:168,late:0.0750,n10:0.7202380952380952,surv:0.6726190476190478},ext:1},
  {id:'pb_r_x012', pool:'pullback', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:51,late:0.0682,n10:0.7450980392156863,surv:0.6294117647058823},ext:1},
  {id:'pb_r_x013', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>74.64 + MA120 이격도%<23.49 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'gt',th:74.64}, {key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'sarBear',type:'bin'}], src:{n:69,late:0.0666,n10:0.782608695652174,surv:0.6652173913043476},ext:1},
  // ── pullback-fake 신규(23) ──
  {id:'pb_f_x001', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + 골든크로스 5×60 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:36,late:-0.0231,n10:0.3055555555555556,surv:0.42222222222222217},ext:1},
  {id:'pb_f_x002', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)>96.82 + 골든크로스 5×60 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'gt',th:96.82}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:37,late:-0.0189,n10:0.3783783783783784,surv:0.44594594594594583},ext:1},
  {id:'pb_f_x003', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<23.49 + OBV 상승다이버전스 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:66,late:-0.0160,n10:0.4393939393939394,surv:0.47424242424242424},ext:1},
  {id:'pb_f_x004', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:67,late:-0.0143,n10:0.44776119402985076,surv:0.48059701492537316},ext:1},
  {id:'pb_f_x005', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + OBV 상승다이버전스 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:62,late:-0.0142,n10:0.43548387096774194,surv:0.4790322580645161},ext:1},
  {id:'pb_f_x006', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + DI 하락우위 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:48,late:-0.0141,n10:0.3958333333333333,surv:0.43541666666666673},ext:1},
  {id:'pb_f_x007', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:57,late:-0.0137,n10:0.40350877192982454,surv:0.43508771929824563},ext:1},
  {id:'pb_f_x008', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:66,late:-0.0131,n10:0.45454545454545453,surv:0.48484848484848486},ext:1},
  {id:'pb_f_x009', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.0119,n10:0.4166666666666667,surv:0.43},ext:1},
  {id:'pb_f_x010', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + 지지선 근접 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.0119,n10:0.4166666666666667,surv:0.43},ext:1},
  {id:'pb_f_x011', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<23.49 + 지지선 근접 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.0119,n10:0.4166666666666667,surv:0.43},ext:1},
  {id:'pb_f_x012', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:50,late:-0.0116,n10:0.42,surv:0.47},ext:1},
  {id:'pb_f_x013', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:54,late:-0.0097,n10:0.4444444444444444,surv:0.46481481481481485},ext:1},
  {id:'pb_f_x014', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + 지지선 근접 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:54,late:-0.0097,n10:0.4444444444444444,surv:0.46481481481481485},ext:1},
  {id:'pb_f_x015', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<23.49 + 지지선 근접 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:54,late:-0.0097,n10:0.4444444444444444,surv:0.46481481481481485},ext:1},
  {id:'pb_f_x016', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:63,late:-0.0096,n10:0.4444444444444444,surv:0.4666666666666667},ext:1},
  {id:'pb_f_x017', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + 지지선 근접 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:63,late:-0.0096,n10:0.4444444444444444,surv:0.4666666666666667},ext:1},
  {id:'pb_f_x018', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<23.49 + 지지선 근접 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:63,late:-0.0096,n10:0.4444444444444444,surv:0.4666666666666667},ext:1},
  {id:'pb_f_x019', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:67,late:-0.0082,n10:0.4626865671641791,surv:0.46268656716417916},ext:1},
  {id:'pb_f_x020', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:67,late:-0.0082,n10:0.4626865671641791,surv:0.46268656716417916},ext:1},
  {id:'pb_f_x021', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<23.49 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:67,late:-0.0082,n10:0.4626865671641791,surv:0.46268656716417916},ext:1},
  {id:'pb_f_x022', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-0.19 + MA120 이격도%<23.49 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.19}, {key:'dev120',type:'num',dir:'lt',th:23.49}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:67,late:-0.0082,n10:0.4626865671641791,surv:0.46268656716417916},ext:1},
  {id:'pb_f_x023', pool:'pullback', kind:'fake', mode:'and', label:'MA5 기울기%>1.51 + OBV 상승추세 + 골든크로스 5×60 + MACD 영선아래',
   conds:[{key:'ma5slope',type:'num',dir:'gt',th:1.51}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:76,late:-0.0058,n10:0.42105263157894735,surv:0.5157894736842106},ext:1},
  // ── [S849] KR · deadcat-real · 발굴풀 스냅샷(20260701) 빔서치 · 게이트S848 · 등록컷(n≥30)·기존중복6제외 ──
  {id:'dc_r_m01', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + ADX>23.35 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'gx5_20',type:'bin'}], src:{n:73,late:0.0837,n10:0.7945,surv:0.7397}},
  {id:'dc_r_m02', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + ADX>23.35 + VR(거래량비율)<60.64',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:111,late:0.0595,n10:0.8198,surv:0.7613}},
  {id:'dc_r_m03', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.42 + MA120 이격도%<-20.44 + MA5 기울기%<-3.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'dev120',type:'num',dir:'lt',th:-20.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:219,late:0.0702,n10:0.7808,surv:0.6913}},
  {id:'dc_r_m04', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA200 이격도%<-28.7 + MA5 기울기%<-3.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev200',type:'num',dir:'lt',th:-28.7}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:231,late:0.0784,n10:0.7532,surv:0.6892}},
  {id:'dc_r_m05', pool:'deadcat', kind:'real', mode:'and', label:'ADX>23.35 + 골든크로스 5×9 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:91,late:0.0722,n10:0.7692,surv:0.7088}},
  {id:'dc_r_m06', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.07 + MA120 이격도%<-20.44 + MA5 기울기%<-3.61',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'dev120',type:'num',dir:'lt',th:-20.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:192,late:0.0675,n10:0.7812,surv:0.688}},
  {id:'dc_r_m07', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA5 기울기%<-3.61 + VR(거래량비율)<60.64',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:149,late:0.0648,n10:0.7852,surv:0.6866}},
  {id:'dc_r_m08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + Stoch %K<8.07 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:59,late:0.0602,n10:0.7966,surv:0.722}},
  {id:'dc_r_m09', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<8.07 + MA5 기울기%<-3.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:293,late:0.0572,n10:0.7952,surv:0.6962}},
  {id:'dc_r_m10', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + ADX>23.35 + MA60 이격도%<-12.54',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev60',type:'num',dir:'lt',th:-12.54}], src:{n:139,late:0.0608,n10:0.7842,surv:0.7345}},
  {id:'dc_r_m11', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA60 이격도%<-12.54 + MA5 기울기%<-3.61',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev60',type:'num',dir:'lt',th:-12.54}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:230,late:0.0576,n10:0.7913,surv:0.6865}},
  {id:'dc_r_m12', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + CCI<-135.42 + MA120 이격도%<-20.44',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'dev120',type:'num',dir:'lt',th:-20.44}], src:{n:70,late:0.0678,n10:0.7571,surv:0.6957}},
  {id:'dc_r_m13', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<8.07 + ADX>23.35',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'adx',type:'num',dir:'gt',th:23.35}], src:{n:176,late:0.0566,n10:0.7898,surv:0.7295}},
  {id:'dc_r_m14', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA5 기울기%<-3.61 + MFI(자금흐름)<35.79',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}, {key:'mfi',type:'num',dir:'lt',th:35.79}], src:{n:205,late:0.058,n10:0.7854,surv:0.6737}},
  {id:'dc_r_m15', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.42 + Stoch %K<8.07 + MA5 기울기%<-3.61',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:301,late:0.0549,n10:0.7907,surv:0.6771}},
  {id:'dc_r_m16', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + RSI 상승다이버전스 + VR(거래량비율)<60.64',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:61,late:0.0605,n10:0.7705,surv:0.7541}},
  {id:'dc_r_m17', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA20 이격도%<-7.12 + MA60 이격도%<-12.54',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'dev60',type:'num',dir:'lt',th:-12.54}], src:{n:284,late:0.06,n10:0.7711,surv:0.6908}},
  {id:'dc_r_m18', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-135.42 + Stoch %K<8.07 + MA20 이격도%<-7.12',
   conds:[{key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:355,late:0.0568,n10:0.7803,surv:0.6828}},
  {id:'dc_r_m19', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA120 이격도%<-20.44 + MA5 기울기%<-3.61',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev120',type:'num',dir:'lt',th:-20.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:188,late:0.0598,n10:0.766,surv:0.6862}},
  {id:'dc_r_m20', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + Stoch %K<8.07 + MA20 이격도%<-7.12',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:75,late:0.0566,n10:0.7733,surv:0.7173}},
  {id:'dc_r_m21', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + CCI<-135.42 + ADX>23.35',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'adx',type:'num',dir:'gt',th:23.35}], src:{n:77,late:0.0488,n10:0.7922,surv:0.6792}},
  {id:'dc_r_m22', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + MA120 이격도%<-20.44 + MA5 기울기%<-3.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev120',type:'num',dir:'lt',th:-20.44}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:284,late:0.0664,n10:0.7394,surv:0.693}},
  {id:'dc_r_m23', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-7.12 + RSI 상승다이버전스 + VR(거래량비율)<60.64',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:52,late:0.0627,n10:0.75,surv:0.7423}},
  {id:'dc_r_m24', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA60 이격도%<-12.54 + VR(거래량비율)<60.64',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev60',type:'num',dir:'lt',th:-12.54}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:167,late:0.0607,n10:0.7545,surv:0.6826}},
  {id:'dc_r_m25', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + CCI<-135.42 + RSI<36.8',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'cci',type:'num',dir:'lt',th:-135.42}, {key:'rsi',type:'num',dir:'lt',th:36.8}], src:{n:130,late:0.0559,n10:0.7615,surv:0.6677}},
  {id:'dc_r_m26', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + BB %B<0.07 + MA5 기울기%<-3.61',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'ma5slope',type:'num',dir:'lt',th:-3.61}], src:{n:86,late:0.0536,n10:0.7674,surv:0.6895}},
  {id:'dc_r_m27', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<8.07 + MA60 이격도%<-12.54',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev60',type:'num',dir:'lt',th:-12.54}], src:{n:309,late:0.0569,n10:0.754,surv:0.6861}},
  {id:'dc_r_m28', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<8.07 + MA20 이격도%<-7.12 + VR(거래량비율)<60.64',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:219,late:0.0552,n10:0.758,surv:0.6813}},
  {id:'dc_r_m29', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + Stoch %K<8.07 + MA20 이격도%<-7.12',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'stochK',type:'num',dir:'lt',th:8.07}, {key:'dev20',type:'num',dir:'lt',th:-7.12}], src:{n:399,late:0.0517,n10:0.7619,surv:0.6805}},
  {id:'dc_r_m30', pool:'deadcat', kind:'real', mode:'and', label:'RSI<36.8 + ADX>23.35 + MA200 이격도%<-28.7',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev200',type:'num',dir:'lt',th:-28.7}], src:{n:201,late:0.0487,n10:0.7612,surv:0.7025}},
  {id:'dc_r_m31', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC>26.05 + BB %B<0.07 + ADX>23.35',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'bbPctB',type:'num',dir:'lt',th:0.07}, {key:'adx',type:'num',dir:'gt',th:23.35}], src:{n:60,late:0.0558,n10:0.7333,surv:0.7083}},
  // ── [S849] KR · deadcat-fake · 발굴풀 스냅샷(20260701) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p)·기존중복1제외 ──
  {id:'dc_f_m01', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC>26.05 + MA200 이격도%<-28.7 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:26.05}, {key:'dev200',type:'num',dir:'lt',th:-28.7}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:32,late:-0.0065,n10:0.25,surv:0.4187}},
  {id:'dc_f_m02', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<36.8 + MA20 이격도%<-7.12 + OBV 상승다이버전스 + VR(거래량비율)<60.64',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.8}, {key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.64}], src:{n:31,late:-0.0461,n10:0.4516,surv:0.4355}},
  {id:'dc_f_m03', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-28.7 + RSI 상승다이버전스 + 골든크로스 5×9',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-28.7}, {key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:41,late:-0.0058,n10:0.3415,surv:0.461}},
  {id:'dc_f_m04', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-7.12 + OBV 상승다이버전스 + VR(거래량비율)<60.64 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-7.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:60.64}, {key:'sarBear',type:'bin'}], src:{n:38,late:-0.0356,n10:0.4737,surv:0.4895}},
  {id:'dc_f_m05', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:39,late:-0.0114,n10:0.4103,surv:0.5077}},
  {id:'dc_f_m06', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:41,late:-0.0119,n10:0.4146,surv:0.5098}},
  {id:'dc_f_m07', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>23.35 + MA120 이격도%<-20.44 + RSI 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.35}, {key:'dev120',type:'num',dir:'lt',th:-20.44}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:34,late:-0.005,n10:0.4118,surv:0.5324}},
  {id:'dc_f_m08', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:46,late:-0.0072,n10:0.4348,surv:0.5391}},
  {id:'dc_f_m09', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:41,late:-0.006,n10:0.439,surv:0.5098}},
  {id:'dc_f_m10', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×20',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:52,late:-0.0085,n10:0.4615,surv:0.5269}},
  {id:'dc_f_m11', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + 골든크로스 5×20 + MA20 돌파안착(상승)',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:30,late:-0.0079,n10:0.5,surv:0.55}},
  // ── [S849] KR · pullback-real · 발굴풀 스냅샷(20260701) 빔서치 · 게이트S848 · 등록컷(n≥30)·기존중복2제외 ──
  {id:'pb_r_m01', pool:'pullback', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 지지선 근접 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:159,late:0.0644,n10:0.7673,surv:0.6642}},
  {id:'pb_r_m02', pool:'pullback', kind:'real', mode:'and', label:'MA200 이격도%<50.47 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev200',type:'num',dir:'lt',th:50.47}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:162,late:0.0646,n10:0.7654,surv:0.6636}},
  {id:'pb_r_m03', pool:'pullback', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:163,late:0.0633,n10:0.7607,surv:0.6595}},
  {id:'pb_r_m04', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-0.2 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-0.2}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:163,late:0.0633,n10:0.7607,surv:0.6595}},
  {id:'pb_r_m05', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%<21.72 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'dev120',type:'num',dir:'lt',th:21.72}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:163,late:0.0633,n10:0.7607,surv:0.6595}},
  {id:'pb_r_m06', pool:'pullback', kind:'real', mode:'and', label:'RSI 상승다이버전스 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:163,late:0.0633,n10:0.7607,surv:0.6595}},
  {id:'pb_r_m07', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC>6.59 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:6.59}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:78,late:0.0685,n10:0.7436,surv:0.6564}},
  {id:'pb_r_m08', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K>74.47 + MA5 기울기%>1.55 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'gt',th:74.47}, {key:'ma5slope',type:'num',dir:'gt',th:1.55}, {key:'diBear',type:'bin'}], src:{n:98,late:0.0594,n10:0.7041,surv:0.6908}},
  // ── [S849] KR · pullback-fake · 발굴풀 스냅샷(20260701) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p)·기존중복4제외 ──
  {id:'pb_f_m01', pool:'pullback', kind:'fake', mode:'and', label:'MFI(자금흐름)>65.46 + VR(거래량비율)>93.91 + 골든크로스 5×60 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:65.46}, {key:'vr',type:'num',dir:'gt',th:93.91}, {key:'gx5_60',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:33,late:-0.0067,n10:0.3636,surv:0.4545}},
  {id:'pb_f_m02', pool:'pullback', kind:'fake', mode:'and', label:'MFI(자금흐름)>65.46 + OBV 상승추세 + 골든크로스 5×60 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:65.46}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:32,late:-0.0079,n10:0.375,surv:0.4437}},
  {id:'pb_f_m03', pool:'pullback', kind:'fake', mode:'and', label:'MA5 기울기%>1.55 + MFI(자금흐름)>65.46 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'ma5slope',type:'num',dir:'gt',th:1.55}, {key:'mfi',type:'num',dir:'gt',th:65.46}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:30,late:-0.0206,n10:0.4667,surv:0.5267}},
  {id:'pb_f_m04', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%<50.47 + 지지선 근접 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:50.47}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:79,late:-0.012,n10:0.4557,surv:0.4709}},
  {id:'pb_f_m05', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×60 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:33,late:-0.0079,n10:0.4545,surv:0.5333}},
  ],
  us: [
  // ── [S849] US · deadcat-real · 발굴풀 스냅샷(2026-07-01T13:30:00.000Z) 빔서치 · 게이트S848 · 등록컷(n≥30) ──
  {id:'u_dc_r_01', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + MA5 기울기%>2.58',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}], src:{n:67,late:0.0701,n10:0.8507,surv:0.8104}},
  {id:'u_dc_r_02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + MA5 기울기%>2.58',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}], src:{n:73,late:0.075,n10:0.8356,surv:0.8123}},
  {id:'u_dc_r_03', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + MA5 기울기%>2.58',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}], src:{n:86,late:0.0677,n10:0.814,surv:0.7849}},
  {id:'u_dc_r_04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'gx5_20',type:'bin'}], src:{n:73,late:0.0664,n10:0.8082,surv:0.7685}},
  {id:'u_dc_r_05', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'settle20',type:'bin'}], src:{n:82,late:0.0613,n10:0.8171,surv:0.7854}},
  {id:'u_dc_r_06', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'macdBelow0',type:'bin'}], src:{n:100,late:0.0685,n10:0.79,surv:0.721}},
  {id:'u_dc_r_07', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'macdBelow0',type:'bin'}], src:{n:108,late:0.0689,n10:0.787,surv:0.725}},
  {id:'u_dc_r_08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'obvUp',type:'bin'}], src:{n:95,late:0.0649,n10:0.7895,surv:0.7632}},
  {id:'u_dc_r_09', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'gx5_20',type:'bin'}], src:{n:61,late:0.0596,n10:0.8033,surv:0.7213}},
  {id:'u_dc_r_10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'gx5_20',type:'bin'}], src:{n:69,late:0.0642,n10:0.7826,surv:0.7275}},
  {id:'u_dc_r_11', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'macdBelow0',type:'bin'}], src:{n:133,late:0.0601,n10:0.7744,surv:0.6992}},
  {id:'u_dc_r_12', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + Stoch %K>84.6',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'stochK',type:'num',dir:'gt',th:84.6}], src:{n:155,late:0.0605,n10:0.7613,surv:0.7174}},
  {id:'u_dc_r_13', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + Stoch %K>84.6',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'stochK',type:'num',dir:'gt',th:84.6}], src:{n:138,late:0.0582,n10:0.7609,surv:0.7087}},
  {id:'u_dc_r_14', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'gx5_20',type:'bin'}], src:{n:84,late:0.0546,n10:0.7619,surv:0.6917}},
  {id:'u_dc_r_15', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA60 이격도%<-13 + VR(거래량비율)<100.53',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'dev60',type:'num',dir:'lt',th:-13}, {key:'vr',type:'num',dir:'lt',th:100.53}], src:{n:82,late:0.0581,n10:0.7317,surv:0.6659}},
  {id:'u_dc_r_16', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'macdGc',type:'bin'}], src:{n:115,late:0.0547,n10:0.7391,surv:0.7348}},
  {id:'u_dc_r_17', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'settle20',type:'bin'}], src:{n:170,late:0.0538,n10:0.7412,surv:0.7035}},
  {id:'u_dc_r_18', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'settle20',type:'bin'}], src:{n:155,late:0.0526,n10:0.7419,surv:0.6961}},
  {id:'u_dc_r_19', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + 골든크로스 5×9 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:69,late:0.047,n10:0.7536,surv:0.7246}},
  {id:'u_dc_r_20', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'gx5_9',type:'bin'}], src:{n:61,late:0.0466,n10:0.7541,surv:0.7066}},
  {id:'u_dc_r_21', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'macdBelow0',type:'bin'}], src:{n:97,late:0.0543,n10:0.7216,surv:0.7155}},
  {id:'u_dc_r_22', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + VR(거래량비율)<100.53',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'vr',type:'num',dir:'lt',th:100.53}], src:{n:75,late:0.0459,n10:0.7467,surv:0.6773}},
  {id:'u_dc_r_23', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + BB %B>0.76',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}], src:{n:162,late:0.0517,n10:0.7284,surv:0.684}},
  {id:'u_dc_r_24', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + VR(거래량비율)<100.53',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'vr',type:'num',dir:'lt',th:100.53}], src:{n:66,late:0.0466,n10:0.7424,surv:0.6667}},
  {id:'u_dc_r_25', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}], src:{n:120,late:0.0521,n10:0.725,surv:0.7242}},
  {id:'u_dc_r_26', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}], src:{n:192,late:0.0514,n10:0.724,surv:0.6891}},
  {id:'u_dc_r_27', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'macdGc',type:'bin'}], src:{n:191,late:0.0516,n10:0.7225,surv:0.689}},
  {id:'u_dc_r_28', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'settle20',type:'bin'}], src:{n:178,late:0.0504,n10:0.7247,surv:0.6876}},
  {id:'u_dc_r_29', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}], src:{n:175,late:0.0518,n10:0.72,surv:0.6834}},
  {id:'u_dc_r_30', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'macdGc',type:'bin'}], src:{n:175,late:0.0518,n10:0.72,surv:0.6834}},
  {id:'u_dc_r_31', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'obvUp',type:'bin'}], src:{n:169,late:0.0531,n10:0.716,surv:0.6964}},
  {id:'u_dc_r_32', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'obvUp',type:'bin'}], src:{n:154,late:0.0536,n10:0.7143,surv:0.6929}},
  {id:'u_dc_r_33', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA5 기울기%>2.58 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'gx5_9',type:'bin'}], src:{n:61,late:0.0432,n10:0.7377,surv:0.6984}},
  {id:'u_dc_r_34', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'obvUp',type:'bin'}], src:{n:182,late:0.0502,n10:0.7143,surv:0.6676}},
  {id:'u_dc_r_35', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + 골든크로스 5×20 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'gx5_20',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:95,late:0.0431,n10:0.7263,surv:0.6705}},
  {id:'u_dc_r_36', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'macdGc',type:'bin'}], src:{n:205,late:0.0474,n10:0.7122,surv:0.6654}},
  {id:'u_dc_r_37', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}], src:{n:208,late:0.047,n10:0.7115,surv:0.6649}},
  {id:'u_dc_r_38', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:160,late:0.0455,n10:0.7063,surv:0.6506}},
  {id:'u_dc_r_39', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + OBV 상승추세 + 골든크로스 5×20',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}], src:{n:112,late:0.0451,n10:0.7054,surv:0.6455}},
  {id:'u_dc_r_40', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + CCI>83.91 + MFI(자금흐름)>63.59',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'cci',type:'num',dir:'gt',th:83.91}, {key:'mfi',type:'num',dir:'gt',th:63.59}], src:{n:97,late:0.0453,n10:0.6907,surv:0.6948}},
  {id:'u_dc_r_41', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + MFI(자금흐름)>63.59',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'mfi',type:'num',dir:'gt',th:63.59}], src:{n:95,late:0.0415,n10:0.6947,surv:0.6726}},
  {id:'u_dc_r_42', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + BB %B>0.76 + MFI(자금흐름)>63.59',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}], src:{n:102,late:0.0403,n10:0.6863,surv:0.6794}},
  {id:'u_dc_r_43', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:75,late:0.0374,n10:0.6933,surv:0.668}},
  {id:'u_dc_r_44', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + Stoch %K>84.6 + VR(거래량비율)<100.53',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'vr',type:'num',dir:'lt',th:100.53}], src:{n:99,late:0.036,n10:0.6869,surv:0.6374}},
  {id:'u_dc_r_45', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + OBV 상승추세 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:221,late:0.0386,n10:0.6697,surv:0.6452}},
  {id:'u_dc_r_46', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-24.73 + MFI(자금흐름)>63.59 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'settle20',type:'bin'}], src:{n:116,late:0.0368,n10:0.6724,surv:0.6526}},
  // ── [S849] US · deadcat-fake · 발굴풀 스냅샷(2026-07-01T13:30:00.000Z) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p) ──
  {id:'u_dc_f_01', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-20.34 + MFI(자금흐름)>63.59 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:30,late:-0.0186,n10:0.1333,surv:0.3967}},
  {id:'u_dc_f_02', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:31,late:-0.0446,n10:0.2258,surv:0.3645}},
  {id:'u_dc_f_03', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-26.27 + MFI(자금흐름)>63.59 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:32,late:-0.0158,n10:0.1562,surv:0.4031}},
  {id:'u_dc_f_04', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + MA200 이격도%<-26.27 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:30,late:-0.0131,n10:0.2667,surv:0.4333}},
  {id:'u_dc_f_05', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:33,late:-0.0162,n10:0.303,surv:0.4242}},
  {id:'u_dc_f_06', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:53,late:-0.0215,n10:0.3208,surv:0.4245}},
  {id:'u_dc_f_07', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 지지선 근접 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:53,late:-0.0215,n10:0.3208,surv:0.4245}},
  {id:'u_dc_f_08', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:42,late:-0.0173,n10:0.3095,surv:0.4048}},
  {id:'u_dc_f_09', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + MA200 이격도%<-26.27 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:36,late:-0.0248,n10:0.3333,surv:0.4306}},
  {id:'u_dc_f_10', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + VR(거래량비율)<100.53 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'vr',type:'num',dir:'lt',th:100.53}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:50,late:-0.0201,n10:0.32,surv:0.428}},
  {id:'u_dc_f_11', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 지지선 근접 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:51,late:-0.0212,n10:0.3333,surv:0.4412}},
  {id:'u_dc_f_12', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-26.27 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:45,late:-0.0175,n10:0.3333,surv:0.4333}},
  {id:'u_dc_f_13', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-26.27 + RSI 상승다이버전스 + OBV 상승추세 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:45,late:-0.0175,n10:0.3333,surv:0.4333}},
  {id:'u_dc_f_14', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}], src:{n:40,late:-0.0142,n10:0.325,surv:0.4225}},
  {id:'u_dc_f_15', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.0142,n10:0.325,surv:0.4225}},
  {id:'u_dc_f_16', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.59 + BB 스퀴즈 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:38,late:-0.0103,n10:0.3158,surv:0.3842}},
  {id:'u_dc_f_17', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:39,late:-0.0157,n10:0.3333,surv:0.4436}},
  {id:'u_dc_f_18', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:47,late:-0.0175,n10:0.3404,surv:0.4447}},
  {id:'u_dc_f_19', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>83.91 + BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'cci',type:'num',dir:'gt',th:83.91}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:45,late:-0.0145,n10:0.3333,surv:0.4222}},
  {id:'u_dc_f_20', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:39,late:-0.013,n10:0.3333,surv:0.4282}},
  {id:'u_dc_f_21', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-20.34 + MA200 이격도%<-26.27 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:40,late:-0.0254,n10:0.375,surv:0.435}},
  {id:'u_dc_f_22', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + MA120 이격도%<-20.34 + 골든크로스 5×20',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}], src:{n:30,late:-0.0114,n10:0.3333,surv:0.46}},
  {id:'u_dc_f_23', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + MA120 이격도%<-20.34 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:30,late:-0.0114,n10:0.3333,surv:0.46}},
  {id:'u_dc_f_24', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>83.91 + OBV 상승추세 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'cci',type:'num',dir:'gt',th:83.91}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:41,late:-0.0135,n10:0.3415,surv:0.4512}},
  {id:'u_dc_f_25', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + OBV 상승추세 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:67,late:-0.0139,n10:0.3433,surv:0.4403}},
  {id:'u_dc_f_26', pool:'deadcat', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:51,late:-0.0158,n10:0.3529,surv:0.4196}},
  {id:'u_dc_f_27', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + MA200 이격도%<-26.27 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_20',type:'bin'}], src:{n:38,late:-0.0115,n10:0.3421,surv:0.4342}},
  {id:'u_dc_f_28', pool:'deadcat', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×60 + MA20 돌파안착(상승)',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:58,late:-0.0167,n10:0.3621,surv:0.4345}},
  {id:'u_dc_f_29', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.59 + OBV 상승추세 + DI 하락우위 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:58,late:-0.0092,n10:0.3448,surv:0.4328}},
  {id:'u_dc_f_30', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 지지선 근접 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:46,late:-0.0235,n10:0.3913,surv:0.4717}},
  {id:'u_dc_f_31', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + OBV 상승추세 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:-0.0054,n10:0.3396,surv:0.4679}},
  {id:'u_dc_f_32', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA200 이격도%<-26.27 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_20',type:'bin'}], src:{n:48,late:-0.0083,n10:0.3542,surv:0.4354}},
  {id:'u_dc_f_33', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA200 이격도%<-26.27 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0083,n10:0.3542,surv:0.4354}},
  {id:'u_dc_f_34', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA200 이격도%<-26.27 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:48,late:-0.0083,n10:0.3542,surv:0.4354}},
  {id:'u_dc_f_35', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:-0.0202,n10:0.3962,surv:0.4792}},
  {id:'u_dc_f_36', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:-0.0202,n10:0.3962,surv:0.4792}},
  {id:'u_dc_f_37', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:-0.0202,n10:0.3962,surv:0.4792}},
  {id:'u_dc_f_38', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.59 + BB 스퀴즈 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:33,late:-0.0093,n10:0.3636,surv:0.4333}},
  {id:'u_dc_f_39', pool:'deadcat', kind:'fake', mode:'and', label:'MFI(자금흐름)>63.59 + OBV 상승추세 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:60,late:-0.0101,n10:0.3667,surv:0.435}},
  {id:'u_dc_f_40', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + MA5 기울기%>2.58 + OBV 상승추세',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'obvUp',type:'bin'}], src:{n:48,late:-0.0055,n10:0.3542,surv:0.4812}},
  {id:'u_dc_f_41', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:48,late:-0.0105,n10:0.375,surv:0.4521}},
  {id:'u_dc_f_42', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 지지선 근접 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:48,late:-0.0105,n10:0.375,surv:0.4521}},
  {id:'u_dc_f_43', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 지지선 근접 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:48,late:-0.0105,n10:0.375,surv:0.4521}},
  {id:'u_dc_f_44', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.6 + ADX>24.35 + MA5 기울기%>2.58 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'adx',type:'num',dir:'gt',th:24.35}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'macdBelow0',type:'bin'}], src:{n:87,late:-0.0073,n10:0.3678,surv:0.4989}},
  {id:'u_dc_f_45', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×60 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:46,late:-0.0142,n10:0.3913,surv:0.4717}},
  {id:'u_dc_f_46', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + VR(거래량비율)<100.53 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'vr',type:'num',dir:'lt',th:100.53}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:51,late:-0.0209,n10:0.4118,surv:0.4686}},
  {id:'u_dc_f_47', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-26.27 + RSI 상승다이버전스 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:37,late:-0.0084,n10:0.3784,surv:0.4865}},
  {id:'u_dc_f_48', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + 골든크로스 5×9',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}], src:{n:40,late:-0.006,n10:0.375,surv:0.46}},
  {id:'u_dc_f_49', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.006,n10:0.375,surv:0.46}},
  {id:'u_dc_f_50', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:40,late:-0.006,n10:0.375,surv:0.46}},
  {id:'u_dc_f_51', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA60 이격도%<-13 + 골든크로스 5×20',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}], src:{n:32,late:-0.0053,n10:0.375,surv:0.4844}},
  {id:'u_dc_f_52', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA60 이격도%<-13 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:32,late:-0.0053,n10:0.375,surv:0.4844}},
  {id:'u_dc_f_53', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + MA20 이격도%<-6.83 + VR(거래량비율)<100.53 + 골든크로스 5×9',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'vr',type:'num',dir:'lt',th:100.53}, {key:'gx5_9',type:'bin'}], src:{n:39,late:-0.0056,n10:0.3846,surv:0.4538}},
  {id:'u_dc_f_54', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 지지선 근접 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:30,late:-0.0104,n10:0.4,surv:0.47}},
  {id:'u_dc_f_55', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}], src:{n:38,late:-0.008,n10:0.3947,surv:0.4895}},
  {id:'u_dc_f_56', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:38,late:-0.008,n10:0.3947,surv:0.4895}},
  {id:'u_dc_f_57', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + MFI(자금흐름)>63.59 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:72,late:-0.0057,n10:0.3889,surv:0.4708}},
  {id:'u_dc_f_58', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + MFI(자금흐름)>63.59 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:31,late:-0.005,n10:0.3871,surv:0.4355}},
  {id:'u_dc_f_59', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + VR(거래량비율)<100.53 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'vr',type:'num',dir:'lt',th:100.53}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:65,late:-0.0141,n10:0.4154,surv:0.4692}},
  {id:'u_dc_f_60', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0126,n10:0.4118,surv:0.4824}},
  {id:'u_dc_f_61', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0126,n10:0.4118,surv:0.4824}},
  {id:'u_dc_f_62', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + MFI(자금흐름)>63.59 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}], src:{n:74,late:-0.0058,n10:0.3919,surv:0.4649}},
  {id:'u_dc_f_63', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + MFI(자금흐름)>63.59 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:74,late:-0.0058,n10:0.3919,surv:0.4649}},
  {id:'u_dc_f_64', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + ADX>24.35 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'adx',type:'num',dir:'gt',th:24.35}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:37,late:-0.0095,n10:0.4054,surv:0.4703}},
  {id:'u_dc_f_65', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B>0.76 + MFI(자금흐름)>63.59 + OBV 상승추세 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'obvUp',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:71,late:-0.0057,n10:0.3944,surv:0.4606}},
  {id:'u_dc_f_66', pool:'deadcat', kind:'fake', mode:'and', label:'CCI>83.91 + BB %B>0.76 + MFI(자금흐름)>63.59 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:83.91}, {key:'bbPctB',type:'num',dir:'gt',th:0.76}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'squeeze',type:'bin'}], src:{n:73,late:-0.0057,n10:0.3973,surv:0.4712}},
  {id:'u_dc_f_67', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + MA60 이격도%<-13 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:55,late:-0.0121,n10:0.4182,surv:0.4764}},
  {id:'u_dc_f_68', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + MACD 골든크로스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:37,late:-0.0065,n10:0.4054,surv:0.4973}},
  {id:'u_dc_f_69', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:37,late:-0.0065,n10:0.4054,surv:0.4973}},
  {id:'u_dc_f_70', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:70,late:-0.0135,n10:0.4286,surv:0.48}},
  {id:'u_dc_f_71', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:70,late:-0.0135,n10:0.4286,surv:0.48}},
  {id:'u_dc_f_72', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 지지선 근접 + BB 스퀴즈',
   conds:[{key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:31,late:-0.0097,n10:0.4194,surv:0.4871}},
  {id:'u_dc_f_73', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-13 + 골든크로스 5×20 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-13}, {key:'gx5_20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.0111,n10:0.4242,surv:0.4909}},
  {id:'u_dc_f_74', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:114,late:-0.0068,n10:0.4123,surv:0.4746}},
  {id:'u_dc_f_75', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA200 이격도%<-26.27 + 골든크로스 5×20 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'gx5_20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0065,n10:0.4118,surv:0.4794}},
  {id:'u_dc_f_76', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA5 기울기%>2.58 + 골든크로스 5×20 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'gx5_20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0055,n10:0.4118,surv:0.5}},
  {id:'u_dc_f_77', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:136,late:-0.0131,n10:0.4412,surv:0.4654}},
  {id:'u_dc_f_78', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-6.83 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-6.83}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:68,late:-0.013,n10:0.4412,surv:0.4941}},
  {id:'u_dc_f_79', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA120 이격도%<-20.34 + 골든크로스 5×20 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'dev120',type:'num',dir:'lt',th:-20.34}, {key:'gx5_20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:31,late:-0.0056,n10:0.4194,surv:0.4742}},
  {id:'u_dc_f_80', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + DI 하락우위 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:133,late:-0.0134,n10:0.4436,surv:0.4684}},
  {id:'u_dc_f_81', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + ADX>24.35 + MFI(자금흐름)>63.59 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'adx',type:'num',dir:'gt',th:24.35}, {key:'mfi',type:'num',dir:'gt',th:63.59}, {key:'macdGc',type:'bin'}], src:{n:40,late:-0.0068,n10:0.425,surv:0.45}},
  {id:'u_dc_f_82', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 지지선 근접 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:30,late:-0.0095,n10:0.4333,surv:0.4867}},
  {id:'u_dc_f_83', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.6 + ADX>24.35 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'adx',type:'num',dir:'gt',th:24.35}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:56,late:-0.0079,n10:0.4286,surv:0.4821}},
  {id:'u_dc_f_84', pool:'deadcat', kind:'fake', mode:'and', label:'지지선 근접 + 골든크로스 5×9 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:126,late:-0.0152,n10:0.4524,surv:0.4738}},
  {id:'u_dc_f_85', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:51,late:-0.0071,n10:0.4314,surv:0.5}},
  {id:'u_dc_f_86', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 지지선 근접 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:51,late:-0.0071,n10:0.4314,surv:0.5}},
  {id:'u_dc_f_87', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + 지지선 근접 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:51,late:-0.0071,n10:0.4314,surv:0.5}},
  {id:'u_dc_f_88', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K>84.6 + ADX>24.35 + MA20 돌파안착(상승) + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'gt',th:84.6}, {key:'adx',type:'num',dir:'gt',th:24.35}, {key:'settle20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:41,late:-0.0062,n10:0.439,surv:0.4488}},
  {id:'u_dc_f_89', pool:'deadcat', kind:'fake', mode:'and', label:'MA200 이격도%<-26.27 + OBV 상승다이버전스 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-26.27}, {key:'obvDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:34,late:-0.0056,n10:0.4412,surv:0.4735}},
  {id:'u_dc_f_90', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-24.73 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-24.73}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:302,late:-0.007,n10:0.447,surv:0.4772}},
  {id:'u_dc_f_91', pool:'deadcat', kind:'fake', mode:'and', label:'RSI<33.79 + VR(거래량비율)<100.53 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'rsi',type:'num',dir:'lt',th:33.79}, {key:'vr',type:'num',dir:'lt',th:100.53}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:49,late:-0.0073,n10:0.449,surv:0.4898}},
  {id:'u_dc_f_92', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승추세 + 지지선 근접 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:81,late:-0.0093,n10:0.4568,surv:0.4889}},
  {id:'u_dc_f_93', pool:'deadcat', kind:'fake', mode:'and', label:'ADX>24.35 + MA5 기울기%>2.58 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'adx',type:'num',dir:'gt',th:24.35}, {key:'ma5slope',type:'num',dir:'gt',th:2.58}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:48,late:-0.0075,n10:0.4583,surv:0.5042}},
  // ── [S849] US · pullback-real · 발굴풀 스냅샷(2026-07-01T13:30:00.000Z) 빔서치 · 게이트S848 · 등록컷(n≥30) ──
  {id:'u_pb_r_01', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + OBV 상승다이버전스 + OBV 상승추세',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:52,late:0.0742,n10:0.8462,surv:0.7673}},
  {id:'u_pb_r_02', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + MFI(자금흐름)>59.89 + BB 스퀴즈',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'mfi',type:'num',dir:'gt',th:59.89}, {key:'squeeze',type:'bin'}], src:{n:50,late:0.1154,n10:0.72,surv:0.718}},
  {id:'u_pb_r_03', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78 + BB 스퀴즈',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}], src:{n:52,late:0.0914,n10:0.7692,surv:0.6635}},
  {id:'u_pb_r_04', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:65,late:0.0987,n10:0.7385,surv:0.7415}},
  {id:'u_pb_r_05', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + BB 스퀴즈 + MA20 돌파안착(상승)',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:83,late:0.0828,n10:0.759,surv:0.6964}},
  {id:'u_pb_r_06', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:92,late:0.0838,n10:0.75,surv:0.725}},
  {id:'u_pb_r_07', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78 + MA200 이격도%>23.39',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:84,late:0.0855,n10:0.7381,surv:0.6964}},
  {id:'u_pb_r_08', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA120 이격도%>14.78',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev120',type:'num',dir:'gt',th:14.78}], src:{n:90,late:0.083,n10:0.7444,surv:0.7011}},
  {id:'u_pb_r_09', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC>4.21 + MA120 이격도%>14.78 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:4.21}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'macdBelow0',type:'bin'}], src:{n:58,late:0.0547,n10:0.8103,surv:0.6914}},
  {id:'u_pb_r_10', pool:'pullback', kind:'real', mode:'and', label:'ADX<14.48 + MA200 이격도%>23.39 + MFI(자금흐름)>59.89',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'mfi',type:'num',dir:'gt',th:59.89}], src:{n:57,late:0.0831,n10:0.7018,surv:0.7175}},
  {id:'u_pb_r_11', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA200 이격도%>23.39 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'macdBelow0',type:'bin'}], src:{n:53,late:0.0716,n10:0.7358,surv:0.6774}},
  {id:'u_pb_r_12', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + 골든크로스 5×9',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}], src:{n:78,late:0.0787,n10:0.7051,surv:0.7128}},
  {id:'u_pb_r_13', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + MA120 이격도%>14.78 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'squeeze',type:'bin'}], src:{n:77,late:0.0833,n10:0.6883,surv:0.6857}},
  {id:'u_pb_r_14', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA200 이격도%>23.39 + MA5 기울기%<-2.9',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'ma5slope',type:'num',dir:'lt',th:-2.9}], src:{n:74,late:0.0643,n10:0.7162,surv:0.6892}},
  {id:'u_pb_r_15', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA200 이격도%>23.39 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'sarBear',type:'bin'}], src:{n:112,late:0.0593,n10:0.7232,surv:0.6679}},
  {id:'u_pb_r_16', pool:'pullback', kind:'real', mode:'and', label:'MA120 이격도%>14.78 + MA5 기울기%<-2.9 + MACD 영선아래',
   conds:[{key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'ma5slope',type:'num',dir:'lt',th:-2.9}, {key:'macdBelow0',type:'bin'}], src:{n:53,late:0.0487,n10:0.7547,surv:0.6585}},
  {id:'u_pb_r_17', pool:'pullback', kind:'real', mode:'and', label:'BB %B>0.65 + MA120 이격도%>14.78 + 골든크로스 5×9',
   conds:[{key:'bbPctB',type:'num',dir:'gt',th:0.65}, {key:'dev120',type:'num',dir:'gt',th:14.78}, {key:'gx5_9',type:'bin'}], src:{n:85,late:0.0726,n10:0.6824,surv:0.6894}},
  {id:'u_pb_r_18', pool:'pullback', kind:'real', mode:'and', label:'CCI>44.78 + ADX<14.48 + MA200 이격도%>23.39',
   conds:[{key:'cci',type:'num',dir:'gt',th:44.78}, {key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:72,late:0.0722,n10:0.6806,surv:0.6625}},
  {id:'u_pb_r_19', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA20 이격도%<-7.08 + MA200 이격도%>23.39',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev20',type:'num',dir:'lt',th:-7.08}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:75,late:0.0678,n10:0.6933,surv:0.6773}},
  {id:'u_pb_r_20', pool:'pullback', kind:'real', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×60',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:50,late:0.049,n10:0.74,surv:0.72}},
  {id:'u_pb_r_21', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA200 이격도%>23.39 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'diBear',type:'bin'}], src:{n:98,late:0.0547,n10:0.7143,surv:0.6735}},
  {id:'u_pb_r_22', pool:'pullback', kind:'real', mode:'and', label:'RSI>54.29 + ADX<14.48 + MA200 이격도%>23.39',
   conds:[{key:'rsi',type:'num',dir:'gt',th:54.29}, {key:'adx',type:'num',dir:'lt',th:14.48}, {key:'dev200',type:'num',dir:'gt',th:23.39}], src:{n:70,late:0.0634,n10:0.6857,surv:0.6629}},
  {id:'u_pb_r_23', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA60 이격도%>4.96 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev60',type:'num',dir:'gt',th:4.96}, {key:'sarBear',type:'bin'}], src:{n:54,late:0.0437,n10:0.7222,surv:0.6963}},
  {id:'u_pb_r_24', pool:'pullback', kind:'real', mode:'and', label:'골든크로스 5×9 + 골든크로스 5×20 + 골든크로스 5×60',
   conds:[{key:'gx5_9',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:79,late:0.0473,n10:0.7089,surv:0.7063}},
  {id:'u_pb_r_25', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<8.94 + MA60 이격도%>4.96',
   conds:[{key:'stochK',type:'num',dir:'lt',th:8.94}, {key:'dev60',type:'num',dir:'gt',th:4.96}], src:{n:58,late:0.0397,n10:0.7241,surv:0.6707}},
  {id:'u_pb_r_26', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%<-2.9 + OBV 상승다이버전스 + VR(거래량비율)>123.13',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-2.9}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'gt',th:123.13}], src:{n:61,late:0.0382,n10:0.6885,surv:0.7082}},
  // ── [S849] US · pullback-fake · 발굴풀 스냅샷(2026-07-01T13:30:00.000Z) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p) ──
  {id:'u_pb_f_01', pool:'pullback', kind:'fake', mode:'and', label:'VR(거래량비율)>123.13 + BB 스퀴즈 + 골든크로스 5×9 + 골든크로스 5×60',
   conds:[{key:'vr',type:'num',dir:'gt',th:123.13}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:37,late:-0.0094,n10:0.2973,surv:0.4892}},
  {id:'u_pb_f_02', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>23.39 + OBV 상승추세 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:67,late:-0.0194,n10:0.3433,surv:0.4194}},
  {id:'u_pb_f_03', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>59.89 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:59.89}, {key:'sarBear',type:'bin'}], src:{n:35,late:-0.0067,n10:0.3143,surv:0.4486}},
  {id:'u_pb_f_04', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>23.39 + VR(거래량비율)>123.13 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'vr',type:'num',dir:'gt',th:123.13}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.0258,n10:0.3939,surv:0.3667}},
  {id:'u_pb_f_05', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×60 + DI 하락우위 + PSAR 하락',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:31,late:-0.0235,n10:0.3871,surv:0.5194}},
  {id:'u_pb_f_06', pool:'pullback', kind:'fake', mode:'and', label:'MFI(자금흐름)>59.89 + 골든크로스 5×60 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'gt',th:59.89}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:31,late:-0.008,n10:0.3548,surv:0.4645}},
  {id:'u_pb_f_07', pool:'pullback', kind:'fake', mode:'and', label:'VR(거래량비율)>123.13 + 골든크로스 5×60 + DI 하락우위',
   conds:[{key:'vr',type:'num',dir:'gt',th:123.13}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:39,late:-0.0076,n10:0.359,surv:0.4872}},
  {id:'u_pb_f_08', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + 골든크로스 5×60 + DI 하락우위',
   conds:[{key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:48,late:-0.0191,n10:0.4167,surv:0.4958}},
  {id:'u_pb_f_09', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×60 + MACD 영선아래 + DI 하락우위 + PSAR 하락',
   conds:[{key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:31,late:-0.0189,n10:0.4194,surv:0.5}},
  {id:'u_pb_f_10', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×60 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:79,late:-0.0124,n10:0.4051,surv:0.4937}},
  {id:'u_pb_f_11', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + 골든크로스 5×60 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:45,late:-0.0173,n10:0.4222,surv:0.5089}},
  {id:'u_pb_f_12', pool:'pullback', kind:'fake', mode:'and', label:'MFI(자금흐름)>59.89 + VR(거래량비율)>123.13 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'mfi',type:'num',dir:'gt',th:59.89}, {key:'vr',type:'num',dir:'gt',th:123.13}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:40,late:-0.0096,n10:0.4,surv:0.5125}},
  {id:'u_pb_f_13', pool:'pullback', kind:'fake', mode:'and', label:'VR(거래량비율)>123.13 + BB 스퀴즈 + MA20 돌파안착(상승) + PSAR 하락',
   conds:[{key:'vr',type:'num',dir:'gt',th:123.13}, {key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:50,late:-0.0052,n10:0.4,surv:0.55}},
  {id:'u_pb_f_14', pool:'pullback', kind:'fake', mode:'and', label:'MA200 이격도%>23.39 + OBV 상승추세 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'gt',th:23.39}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:115,late:-0.0125,n10:0.4261,surv:0.4809}},
  {id:'u_pb_f_15', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.0147,n10:0.4333,surv:0.505}},
  {id:'u_pb_f_16', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:-0.0147,n10:0.4333,surv:0.505}},
  {id:'u_pb_f_17', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×60 + DI 하락우위 + PSAR 하락',
   conds:[{key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:52,late:-0.0101,n10:0.4231,surv:0.5212}},
  {id:'u_pb_f_18', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×60 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:76,late:-0.0092,n10:0.4211,surv:0.5013}},
  {id:'u_pb_f_19', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×60 + DI 하락우위',
   conds:[{key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:121,late:-0.0064,n10:0.4132,surv:0.4967}},
  {id:'u_pb_f_20', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:61,late:-0.0134,n10:0.4426,surv:0.5082}},
  {id:'u_pb_f_21', pool:'pullback', kind:'fake', mode:'and', label:'지지선 근접 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:61,late:-0.0134,n10:0.4426,surv:0.5082}},
  {id:'u_pb_f_22', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×20 + MA20 돌파안착(상승) + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_20',type:'bin'}, {key:'settle20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:92,late:-0.0141,n10:0.4457,surv:0.4511}},
  {id:'u_pb_f_23', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×60 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:46,late:-0.0097,n10:0.4348,surv:0.4478}},
  {id:'u_pb_f_24', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + 골든크로스 5×60 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:30,late:-0.0187,n10:0.4667,surv:0.5167}},
  {id:'u_pb_f_25', pool:'pullback', kind:'fake', mode:'and', label:'ADX<14.48 + OBV 상승추세 + 골든크로스 5×9 + 골든크로스 5×60',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:32,late:-0.0186,n10:0.4688,surv:0.4531}},
  {id:'u_pb_f_26', pool:'pullback', kind:'fake', mode:'and', label:'ADX<14.48 + 골든크로스 5×9 + 골든크로스 5×60',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'gx5_9',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:45,late:-0.0159,n10:0.4667,surv:0.4489}},
  {id:'u_pb_f_27', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×60 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:46,late:-0.0102,n10:0.4565,surv:0.5283}},
  {id:'u_pb_f_28', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MA20 돌파안착(상승) + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:98,late:-0.0067,n10:0.4694,surv:0.4776}},
  {id:'u_pb_f_29', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC>4.21 + ADX<14.48 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'gt',th:4.21}, {key:'adx',type:'num',dir:'lt',th:14.48}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:166,late:-0.0075,n10:0.4759,surv:0.5139}},
  {id:'u_pb_f_30', pool:'pullback', kind:'fake', mode:'and', label:'ADX<14.48 + OBV 상승추세 + MA20 돌파안착(상승) + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'lt',th:14.48}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:42,late:-0.0054,n10:0.4762,surv:0.5833}},
  ],
  coin: [
  // ── [S849] COIN · deadcat-real · 발굴풀 스냅샷(2026-07-01T09:00:00) 빔서치 · 게이트S848 · 등록컷(n≥30)·상위130 ──
  {id:'c_dc_r_01', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:120,late:0.1112,n10:0.7833,surv:0.7367}},
  {id:'c_dc_r_02', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:77,late:0.0951,n10:0.7273,surv:0.6299}},
  {id:'c_dc_r_03', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:80,late:0.0706,n10:0.75,surv:0.6775}},
  {id:'c_dc_r_04', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:105,late:0.0779,n10:0.6571,surv:0.6238}},
  {id:'c_dc_r_05', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA120 이격도%<-33.4 + BB 스퀴즈',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}], src:{n:108,late:0.073,n10:0.6574,surv:0.5917}},
  {id:'c_dc_r_06', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + 골든크로스 5×9',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'gx5_9',type:'bin'}], src:{n:77,late:0.0576,n10:0.7013,surv:0.5662}},
  {id:'c_dc_r_07', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:61,late:0.0723,n10:0.6557,surv:0.6705}},
  {id:'c_dc_r_08', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:64,late:0.0511,n10:0.7188,surv:0.6922}},
  {id:'c_dc_r_09', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:152,late:0.0707,n10:0.6513,surv:0.6112}},
  {id:'c_dc_r_10', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:75,late:0.0452,n10:0.72,surv:0.656}},
  {id:'c_dc_r_11', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + 지지선 근접 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'nearSup',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:100,late:0.0537,n10:0.69,surv:0.652}},
  {id:'c_dc_r_12', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:59,late:0.0495,n10:0.6949,surv:0.6814}},
  {id:'c_dc_r_13', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:201,late:0.0652,n10:0.6468,surv:0.6025}},
  {id:'c_dc_r_14', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:202,late:0.0605,n10:0.6485,surv:0.5985}},
  {id:'c_dc_r_15', pool:'deadcat', kind:'real', mode:'and', label:'ADX<17.61 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:54,late:0.0481,n10:0.6852,surv:0.6593}},
  {id:'c_dc_r_16', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2 + MACD 골든크로스',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdGc',type:'bin'}], src:{n:57,late:0.0472,n10:0.6842,surv:0.6211}},
  {id:'c_dc_r_17', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:110,late:0.0535,n10:0.6636,surv:0.6427}},
  {id:'c_dc_r_18', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + MACD 골든크로스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdGc',type:'bin'}], src:{n:206,late:0.0571,n10:0.6505,surv:0.5782}},
  {id:'c_dc_r_19', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + RSI 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'rsiDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:74,late:0.0467,n10:0.6757,surv:0.5959}},
  {id:'c_dc_r_20', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA200 이격도%<-47.2 + MACD 골든크로스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdGc',type:'bin'}], src:{n:66,late:0.0688,n10:0.6061,surv:0.6682}},
  {id:'c_dc_r_21', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + MA20 이격도%<-11.66',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev20',type:'num',dir:'lt',th:-11.66}], src:{n:92,late:0.0461,n10:0.6739,surv:0.662}},
  {id:'c_dc_r_22', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + ADX<17.61 + VR(거래량비율)<70.47',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:82,late:0.0416,n10:0.6829,surv:0.6488}},
  {id:'c_dc_r_23', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:257,late:0.0578,n10:0.6265,surv:0.5973}},
  {id:'c_dc_r_24', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:100,late:0.0385,n10:0.68,surv:0.635}},
  {id:'c_dc_r_25', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:112,late:0.0439,n10:0.6607,surv:0.6643}},
  {id:'c_dc_r_26', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA120 이격도%<-33.4 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:121,late:0.059,n10:0.6116,surv:0.5455}},
  {id:'c_dc_r_27', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'nearSup',type:'bin'}], src:{n:139,late:0.0434,n10:0.6475,surv:0.6453}},
  {id:'c_dc_r_28', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:298,late:0.0526,n10:0.6174,surv:0.5946}},
  {id:'c_dc_r_29', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:311,late:0.0514,n10:0.6206,surv:0.5945}},
  {id:'c_dc_r_30', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:111,late:0.0503,n10:0.6216,surv:0.5901}},
  {id:'c_dc_r_31', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + MA20 이격도%<-11.66',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev20',type:'num',dir:'lt',th:-11.66}], src:{n:174,late:0.0412,n10:0.6437,surv:0.6351}},
  {id:'c_dc_r_32', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:118,late:0.0434,n10:0.6356,surv:0.5992}},
  {id:'c_dc_r_33', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:115,late:0.0445,n10:0.6261,surv:0.6722}},
  {id:'c_dc_r_34', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:216,late:0.0393,n10:0.6389,surv:0.6009}},
  {id:'c_dc_r_35', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:182,late:0.0507,n10:0.5989,surv:0.5681}},
  {id:'c_dc_r_36', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:126,late:0.0328,n10:0.6508,surv:0.6286}},
  {id:'c_dc_r_37', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MA20 이격도%<-11.66',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev20',type:'num',dir:'lt',th:-11.66}], src:{n:59,late:0.0349,n10:0.6441,surv:0.6356}},
  {id:'c_dc_r_38', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA200 이격도%<-47.2 + BB 스퀴즈',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'squeeze',type:'bin'}], src:{n:50,late:0.0421,n10:0.62,surv:0.63}},
  {id:'c_dc_r_39', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA120 이격도%<-33.4 + MA200 이격도%<-47.2',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:186,late:0.0494,n10:0.5914,surv:0.5645}},
  {id:'c_dc_r_40', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + Stoch %K<9.23 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:64,late:0.0297,n10:0.6406,surv:0.6078}},
  {id:'c_dc_r_41', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:80,late:0.0386,n10:0.6125,surv:0.6212}},
  {id:'c_dc_r_42', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MA200 이격도%<-47.2',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:71,late:0.0298,n10:0.6338,surv:0.6183}},
  {id:'c_dc_r_43', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:50,late:0.0474,n10:0.58,surv:0.586}},
  {id:'c_dc_r_44', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + Stoch %K<9.23',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}], src:{n:77,late:0.0286,n10:0.6364,surv:0.6221}},
  {id:'c_dc_r_45', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + MFI(자금흐름)>51.87 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'squeeze',type:'bin'}], src:{n:127,late:0.0382,n10:0.6063,surv:0.6}},
  {id:'c_dc_r_46', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:113,late:0.0273,n10:0.6372,surv:0.6142}},
  {id:'c_dc_r_47', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + ADX<17.61 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:77,late:0.0271,n10:0.6364,surv:0.5636}},
  {id:'c_dc_r_48', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:120,late:0.0363,n10:0.6083,surv:0.6433}},
  {id:'c_dc_r_49', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:53,late:0.0373,n10:0.6038,surv:0.5811}},
  {id:'c_dc_r_50', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:56,late:0.035,n10:0.6071,surv:0.65}},
  {id:'c_dc_r_51', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'sarBear',type:'bin'}], src:{n:190,late:0.0349,n10:0.6053,surv:0.6063}},
  {id:'c_dc_r_52', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA5 기울기%<-5.14 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'diBear',type:'bin'}], src:{n:146,late:0.0355,n10:0.6027,surv:0.5774}},
  {id:'c_dc_r_53', pool:'deadcat', kind:'real', mode:'and', label:'ADX<17.61 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:55,late:0.0424,n10:0.5818,surv:0.6036}},
  {id:'c_dc_r_54', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:56,late:0.0339,n10:0.6071,surv:0.5732}},
  {id:'c_dc_r_55', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA5 기울기%<-5.14 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'nearSup',type:'bin'}], src:{n:159,late:0.0365,n10:0.5975,surv:0.6201}},
  {id:'c_dc_r_56', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + BB 스퀴즈',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'squeeze',type:'bin'}], src:{n:82,late:0.04,n10:0.5854,surv:0.6061}},
  {id:'c_dc_r_57', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + OBV 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'obvDiv',type:'bin'}], src:{n:76,late:0.0241,n10:0.6316,surv:0.575}},
  {id:'c_dc_r_58', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:52,late:0.0423,n10:0.5769,surv:0.6135}},
  {id:'c_dc_r_59', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + ADX<17.61 + VR(거래량비율)<70.47',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:67,late:0.0157,n10:0.6567,surv:0.5522}},
  {id:'c_dc_r_60', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MFI(자금흐름)>51.87',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:96,late:0.0331,n10:0.6042,surv:0.5719}},
  {id:'c_dc_r_61', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}], src:{n:202,late:0.0348,n10:0.599,surv:0.6114}},
  {id:'c_dc_r_62', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + ADX<17.61 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:185,late:0.0247,n10:0.627,surv:0.5692}},
  {id:'c_dc_r_63', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA120 이격도%<-33.4 + BB 스퀴즈',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}], src:{n:61,late:0.0479,n10:0.5574,surv:0.5803}},
  {id:'c_dc_r_64', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:201,late:0.034,n10:0.592,surv:0.5771}},
  {id:'c_dc_r_65', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:260,late:0.0272,n10:0.6115,surv:0.5815}},
  {id:'c_dc_r_66', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:241,late:0.041,n10:0.5685,surv:0.5158}},
  {id:'c_dc_r_67', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + Stoch %K<9.23 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:133,late:0.0249,n10:0.6165,surv:0.5865}},
  {id:'c_dc_r_68', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + MFI(자금흐름)>51.87 + VR(거래량비율)<70.47',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:59,late:0.027,n10:0.6102,surv:0.5746}},
  {id:'c_dc_r_69', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + OBV 상승추세',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvUp',type:'bin'}], src:{n:70,late:0.0351,n10:0.5857,surv:0.6043}},
  {id:'c_dc_r_70', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA5 기울기%<-5.14 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'sarBear',type:'bin'}], src:{n:230,late:0.0314,n10:0.5957,surv:0.5817}},
  {id:'c_dc_r_71', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'macdBelow0',type:'bin'}], src:{n:184,late:0.0319,n10:0.5924,surv:0.606}},
  {id:'c_dc_r_72', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:90,late:0.0255,n10:0.6111,surv:0.5522}},
  {id:'c_dc_r_73', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'diBear',type:'bin'}], src:{n:156,late:0.0347,n10:0.5833,surv:0.6276}},
  {id:'c_dc_r_74', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:71,late:0.031,n10:0.5915,surv:0.5859}},
  {id:'c_dc_r_75', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA20 이격도%<-11.66 + MFI(자금흐름)>51.87',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:66,late:0.0359,n10:0.5758,surv:0.6076}},
  {id:'c_dc_r_76', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:51,late:0.0381,n10:0.5686,surv:0.5451}},
  {id:'c_dc_r_77', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA20 이격도%<-11.66 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:54,late:0.0175,n10:0.6296,surv:0.5593}},
  {id:'c_dc_r_78', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:105,late:0.033,n10:0.581,surv:0.56}},
  {id:'c_dc_r_79', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + OBV 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:68,late:0.0354,n10:0.5735,surv:0.5529}},
  {id:'c_dc_r_80', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:56,late:0.0299,n10:0.5893,surv:0.6125}},
  {id:'c_dc_r_81', pool:'deadcat', kind:'real', mode:'and', label:'ADX<17.61 + MFI(자금흐름)>51.87 + VR(거래량비율)<70.47',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:87,late:0.0115,n10:0.6437,surv:0.5632}},
  {id:'c_dc_r_82', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA5 기울기%<-5.14',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:239,late:0.0291,n10:0.59,surv:0.5686}},
  {id:'c_dc_r_83', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:260,late:0.0255,n10:0.6,surv:0.5785}},
  {id:'c_dc_r_84', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + Stoch %K<9.23 + BB 스퀴즈',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'squeeze',type:'bin'}], src:{n:61,late:0.0286,n10:0.5902,surv:0.5459}},
  {id:'c_dc_r_85', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA120 이격도%<-33.4 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'diBear',type:'bin'}], src:{n:224,late:0.0374,n10:0.5625,surv:0.5281}},
  {id:'c_dc_r_86', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + BB %B<0.12 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:114,late:0.0316,n10:0.5789,surv:0.636}},
  {id:'c_dc_r_87', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + Stoch %K<9.23 + MA60 이격도%<-23.29',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:144,late:0.0208,n10:0.6111,surv:0.6153}},
  {id:'c_dc_r_88', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:232,late:0.0247,n10:0.5991,surv:0.5836}},
  {id:'c_dc_r_89', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:346,late:0.0265,n10:0.5925,surv:0.5639}},
  {id:'c_dc_r_90', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:484,late:0.0297,n10:0.5826,surv:0.55}},
  {id:'c_dc_r_91', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:484,late:0.0297,n10:0.5826,surv:0.55}},
  {id:'c_dc_r_92', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:61,late:0.0211,n10:0.6066,surv:0.5984}},
  {id:'c_dc_r_93', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'nearSup',type:'bin'}], src:{n:229,late:0.0243,n10:0.5939,surv:0.559}},
  {id:'c_dc_r_94', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + MFI(자금흐름)>51.87',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:63,late:0.037,n10:0.5556,surv:0.6063}},
  {id:'c_dc_r_95', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + RSI<32.65 + MA200 이격도%<-47.2',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:280,late:0.0226,n10:0.5964,surv:0.5679}},
  {id:'c_dc_r_96', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA200 이격도%<-47.2 + OBV 상승추세',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvUp',type:'bin'}], src:{n:67,late:0.0273,n10:0.5821,surv:0.5776}},
  {id:'c_dc_r_97', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA20 이격도%<-11.66 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'obvUp',type:'bin'}], src:{n:100,late:0.0269,n10:0.58,surv:0.568}},
  {id:'c_dc_r_98', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MFI(자금흐름)>51.87',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:149,late:0.0167,n10:0.6107,surv:0.5671}},
  {id:'c_dc_r_99', pool:'deadcat', kind:'real', mode:'and', label:'MA20 이격도%<-11.66 + MA60 이격도%<-23.29 + OBV 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvDiv',type:'bin'}], src:{n:72,late:0.0347,n10:0.5556,surv:0.5958}},
  {id:'c_dc_r_100', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + OBV 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'obvDiv',type:'bin'}], src:{n:53,late:0.0312,n10:0.566,surv:0.5698}},
  {id:'c_dc_r_101', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + Stoch %K<9.23 + ADX<17.61',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'adx',type:'num',dir:'lt',th:17.61}], src:{n:65,late:0.0198,n10:0.6,surv:0.5262}},
  {id:'c_dc_r_102', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA20 이격도%<-11.66 + MA200 이격도%<-47.2',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:140,late:0.015,n10:0.6143,surv:0.5721}},
  {id:'c_dc_r_103', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:292,late:0.0222,n10:0.5925,surv:0.5654}},
  {id:'c_dc_r_104', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:337,late:0.0225,n10:0.5905,surv:0.5421}},
  {id:'c_dc_r_105', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + RSI<32.65 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:104,late:0.0232,n10:0.5865,surv:0.5442}},
  {id:'c_dc_r_106', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + Stoch %K<9.23 + MA200 이격도%<-47.2',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:120,late:0.0211,n10:0.5917,surv:0.5958}},
  {id:'c_dc_r_107', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + VR(거래량비율)<70.47',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:436,late:0.0263,n10:0.5757,surv:0.5383}},
  {id:'c_dc_r_108', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA5 기울기%<-5.14 + OBV 상승추세',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'obvUp',type:'bin'}], src:{n:88,late:0.0249,n10:0.5795,surv:0.5898}},
  {id:'c_dc_r_109', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA120 이격도%<-33.4 + BB 스퀴즈',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}], src:{n:135,late:0.0279,n10:0.5704,surv:0.5437}},
  {id:'c_dc_r_110', pool:'deadcat', kind:'real', mode:'and', label:'CCI<-80.77 + MA200 이격도%<-47.2 + MACD 골든크로스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdGc',type:'bin'}], src:{n:152,late:0.0309,n10:0.5592,surv:0.552}},
  {id:'c_dc_r_111', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + Stoch %K<9.23 + MA5 기울기%<-5.14',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}], src:{n:173,late:0.0198,n10:0.5896,surv:0.615}},
  {id:'c_dc_r_112', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:297,late:0.0208,n10:0.5859,surv:0.5593}},
  {id:'c_dc_r_113', pool:'deadcat', kind:'real', mode:'and', label:'RSI<32.65 + MA200 이격도%<-47.2 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:32.65}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdBelow0',type:'bin'}], src:{n:297,late:0.0208,n10:0.5859,surv:0.5593}},
  {id:'c_dc_r_114', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:131,late:0.0222,n10:0.5802,surv:0.5649}},
  {id:'c_dc_r_115', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA60 이격도%<-23.29 + MA120 이격도%<-33.4',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev120',type:'num',dir:'lt',th:-33.4}], src:{n:150,late:0.0172,n10:0.5933,surv:0.5433}},
  {id:'c_dc_r_116', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:448,late:0.0223,n10:0.5781,surv:0.5386}},
  {id:'c_dc_r_117', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA120 이격도%<-33.4 + MFI(자금흐름)>51.87',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:59,late:0.0227,n10:0.5763,surv:0.5559}},
  {id:'c_dc_r_118', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:454,late:0.0261,n10:0.5661,surv:0.5372}},
  {id:'c_dc_r_119', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + BB 스퀴즈 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'squeeze',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:288,late:0.0318,n10:0.5486,surv:0.5264}},
  {id:'c_dc_r_120', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA5 기울기%<-5.14 + MFI(자금흐름)>51.87',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:99,late:0.0226,n10:0.5758,surv:0.5707}},
  {id:'c_dc_r_121', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:173,late:0.0314,n10:0.5491,surv:0.6017}},
  {id:'c_dc_r_122', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}], src:{n:462,late:0.0221,n10:0.5758,surv:0.5403}},
  {id:'c_dc_r_123', pool:'deadcat', kind:'real', mode:'and', label:'MA60 이격도%<-23.29 + MA200 이격도%<-47.2 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'macdBelow0',type:'bin'}], src:{n:462,late:0.0221,n10:0.5758,surv:0.5403}},
  {id:'c_dc_r_124', pool:'deadcat', kind:'real', mode:'and', label:'MA200 이격도%<-47.2 + VR(거래량비율)<70.47 + 지지선 근접',
   conds:[{key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}], src:{n:212,late:0.0216,n10:0.5755,surv:0.5514}},
  {id:'c_dc_r_125', pool:'deadcat', kind:'real', mode:'and', label:'MA120 이격도%<-33.4 + MA5 기울기%<-5.14 + OBV 상승추세',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'obvUp',type:'bin'}], src:{n:50,late:0.0267,n10:0.56,surv:0.548}},
  {id:'c_dc_r_126', pool:'deadcat', kind:'real', mode:'and', label:'Stoch %K<9.23 + MA200 이격도%<-47.2 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'diBear',type:'bin'}], src:{n:177,late:0.0193,n10:0.5819,surv:0.5847}},
  {id:'c_dc_r_127', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:78,late:0.0166,n10:0.5897,surv:0.6244}},
  {id:'c_dc_r_128', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + MA200 이격도%<-47.2 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'sarBear',type:'bin'}], src:{n:201,late:0.027,n10:0.5572,surv:0.5403}},
  {id:'c_dc_r_129', pool:'deadcat', kind:'real', mode:'and', label:'거래량 OSC<-35.25 + BB %B<0.12 + MA60 이격도%<-23.29',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev60',type:'num',dir:'lt',th:-23.29}], src:{n:50,late:0.0127,n10:0.6,surv:0.578}},
  {id:'c_dc_r_130', pool:'deadcat', kind:'real', mode:'and', label:'BB %B<0.12 + MA5 기울기%<-5.14 + MFI(자금흐름)>51.87',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:59,late:0.0258,n10:0.5593,surv:0.5746}},
  // ── [S849] COIN · deadcat-fake · 발굴풀 스냅샷(2026-07-01T09:00:00) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p)·상위130 ──
  {id:'c_dc_f_01', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:74,late:-0.0609,n10:0.1351,surv:0.2851}},
  {id:'c_dc_f_02', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + RSI 상승다이버전스 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.0522,n10:0.1212,surv:0.2758}},
  {id:'c_dc_f_03', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-11.66 + RSI 상승다이버전스 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.0696,n10:0.1818,surv:0.2848}},
  {id:'c_dc_f_04', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + OBV 상승다이버전스 + MFI(자금흐름)>51.87 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'macdGc',type:'bin'}], src:{n:49,late:-0.0673,n10:0.1837,surv:0.3041}},
  {id:'c_dc_f_05', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + RSI 상승다이버전스 + OBV 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}], src:{n:39,late:-0.0419,n10:0.1795,surv:0.3256}},
  {id:'c_dc_f_06', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + RSI 상승다이버전스 + OBV 상승다이버전스 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:39,late:-0.0419,n10:0.1795,surv:0.3256}},
  {id:'c_dc_f_07', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + RSI 상승다이버전스 + OBV 상승다이버전스 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:39,late:-0.0419,n10:0.1795,surv:0.3256}},
  {id:'c_dc_f_08', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:44,late:-0.0449,n10:0.2045,surv:0.3295}},
  {id:'c_dc_f_09', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + RSI 상승다이버전스 + OBV 상승다이버전스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}], src:{n:35,late:-0.0425,n10:0.2,surv:0.34}},
  {id:'c_dc_f_10', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + BB 스퀴즈 + 골든크로스 5×60',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'squeeze',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:33,late:-0.0293,n10:0.1818,surv:0.3788}},
  {id:'c_dc_f_11', pool:'deadcat', kind:'fake', mode:'and', label:'MA60 이격도%<-23.29 + MA120 이격도%<-33.4 + RSI 상승다이버전스 + OBV 상승다이버전스',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}], src:{n:35,late:-0.0346,n10:0.2,surv:0.3514}},
  {id:'c_dc_f_12', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승추세 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:32,late:-0.0403,n10:0.2188,surv:0.3875}},
  {id:'c_dc_f_13', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승추세 + 골든크로스 5×60',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:42,late:-0.0356,n10:0.2143,surv:0.3929}},
  {id:'c_dc_f_14', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:302,late:-0.042,n10:0.2384,surv:0.3295}},
  {id:'c_dc_f_15', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:45,late:-0.0434,n10:0.2444,surv:0.3444}},
  {id:'c_dc_f_16', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + 지지선 근접 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:-0.0404,n10:0.2373,surv:0.3475}},
  {id:'c_dc_f_17', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + BB 스퀴즈',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}], src:{n:30,late:-0.0384,n10:0.2333,surv:0.3833}},
  {id:'c_dc_f_18', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + Stoch %K<9.23 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:38,late:-0.0391,n10:0.2368,surv:0.3579}},
  {id:'c_dc_f_19', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:50,late:-0.0592,n10:0.3,surv:0.34}},
  {id:'c_dc_f_20', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:104,late:-0.0382,n10:0.2404,surv:0.3106}},
  {id:'c_dc_f_21', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + MFI(자금흐름)>51.87 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_9',type:'bin'}], src:{n:37,late:-0.0391,n10:0.2432,surv:0.3892}},
  {id:'c_dc_f_22', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:53,late:-0.0456,n10:0.2642,surv:0.3415}},
  {id:'c_dc_f_23', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:276,late:-0.0371,n10:0.2391,surv:0.3442}},
  {id:'c_dc_f_24', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:101,late:-0.0365,n10:0.2376,surv:0.3574}},
  {id:'c_dc_f_25', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:38,late:-0.0357,n10:0.2368,surv:0.3895}},
  {id:'c_dc_f_26', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + ADX<17.61 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:76,late:-0.0396,n10:0.25,surv:0.3461}},
  {id:'c_dc_f_27', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:68,late:-0.0346,n10:0.2353,surv:0.3794}},
  {id:'c_dc_f_28', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + MFI(자금흐름)>51.87 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:40,late:-0.0474,n10:0.275,surv:0.34}},
  {id:'c_dc_f_29', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:57,late:-0.0369,n10:0.2456,surv:0.3544}},
  {id:'c_dc_f_30', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:69,late:-0.0418,n10:0.2609,surv:0.3768}},
  {id:'c_dc_f_31', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + MFI(자금흐름)>51.87 + OBV 상승추세',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'obvUp',type:'bin'}], src:{n:41,late:-0.044,n10:0.2683,surv:0.3756}},
  {id:'c_dc_f_32', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:41,late:-0.0352,n10:0.2439,surv:0.3805}},
  {id:'c_dc_f_33', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:51,late:-0.0449,n10:0.2745,surv:0.3471}},
  {id:'c_dc_f_34', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:41,late:-0.0428,n10:0.2683,surv:0.3366}},
  {id:'c_dc_f_35', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + RSI 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:76,late:-0.0304,n10:0.2368,surv:0.3526}},
  {id:'c_dc_f_36', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:96,late:-0.0347,n10:0.25,surv:0.3646}},
  {id:'c_dc_f_37', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:238,late:-0.0365,n10:0.2563,surv:0.3559}},
  {id:'c_dc_f_38', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + RSI 상승다이버전스 + OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:45,late:-0.0399,n10:0.2667,surv:0.3378}},
  {id:'c_dc_f_39', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:32,late:-0.0341,n10:0.25,surv:0.3563}},
  {id:'c_dc_f_40', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + MA60 이격도%<-23.29 + MFI(자금흐름)>51.87 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'dev60',type:'num',dir:'lt',th:-23.29}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:34,late:-0.0389,n10:0.2647,surv:0.3735}},
  {id:'c_dc_f_41', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:49,late:-0.0322,n10:0.2449,surv:0.4265}},
  {id:'c_dc_f_42', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + OBV 상승추세 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0486,n10:0.2955,surv:0.3568}},
  {id:'c_dc_f_43', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:65,late:-0.0424,n10:0.2769,surv:0.3338}},
  {id:'c_dc_f_44', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + 골든크로스 5×9 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:73,late:-0.0409,n10:0.274,surv:0.3562}},
  {id:'c_dc_f_45', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + RSI 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:120,late:-0.0384,n10:0.2667,surv:0.3667}},
  {id:'c_dc_f_46', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + MFI(자금흐름)>51.87 + OBV 상승추세 + 골든크로스 5×60',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'obvUp',type:'bin'}, {key:'gx5_60',type:'bin'}], src:{n:37,late:-0.0306,n10:0.2432,surv:0.4135}},
  {id:'c_dc_f_47', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + MA120 이격도%<-33.4 + OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:32,late:-0.032,n10:0.25,surv:0.4}},
  {id:'c_dc_f_48', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + OBV 상승추세 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:36,late:-0.0308,n10:0.25,surv:0.3611}},
  {id:'c_dc_f_49', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328}},
  {id:'c_dc_f_50', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328}},
  {id:'c_dc_f_51', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + PSAR 하락',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'sarBear',type:'bin'}], src:{n:75,late:-0.0405,n10:0.28,surv:0.328}},
  {id:'c_dc_f_52', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}], src:{n:78,late:-0.0369,n10:0.2692,surv:0.3846}},
  {id:'c_dc_f_53', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:51,late:-0.0382,n10:0.2745,surv:0.3529}},
  {id:'c_dc_f_54', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:429,late:-0.0385,n10:0.2774,surv:0.3392}},
  {id:'c_dc_f_55', pool:'deadcat', kind:'fake', mode:'and', label:'MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:74,late:-0.0407,n10:0.2838,surv:0.3297}},
  {id:'c_dc_f_56', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:117,late:-0.0342,n10:0.265,surv:0.3735}},
  {id:'c_dc_f_57', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:48,late:-0.0431,n10:0.2917,surv:0.3479}},
  {id:'c_dc_f_58', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0431,n10:0.2917,surv:0.3479}},
  {id:'c_dc_f_59', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승추세 + 지지선 근접 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:50,late:-0.0388,n10:0.28,surv:0.346}},
  {id:'c_dc_f_60', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:124,late:-0.0314,n10:0.2581,surv:0.354}},
  {id:'c_dc_f_61', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + MA20 이격도%<-11.66 + MA200 이격도%<-47.2 + OBV 상승다이버전스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}], src:{n:33,late:-0.046,n10:0.303,surv:0.3394}},
  {id:'c_dc_f_62', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-11.66 + MA120 이격도%<-33.4 + RSI 상승다이버전스 + OBV 상승다이버전스',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}], src:{n:35,late:-0.0392,n10:0.2857,surv:0.3886}},
  {id:'c_dc_f_63', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:45,late:-0.0327,n10:0.2667,surv:0.4333}},
  {id:'c_dc_f_64', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:194,late:-0.0314,n10:0.2629,surv:0.3644}},
  {id:'c_dc_f_65', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:56,late:-0.0447,n10:0.3036,surv:0.3839}},
  {id:'c_dc_f_66', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:37,late:-0.0425,n10:0.2973,surv:0.3784}},
  {id:'c_dc_f_67', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MA20 돌파안착(상승) + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:49,late:-0.0386,n10:0.2857,surv:0.3592}},
  {id:'c_dc_f_68', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + MA5 기울기%<-5.14 + RSI 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'ma5slope',type:'num',dir:'lt',th:-5.14}, {key:'rsiDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:73,late:-0.0389,n10:0.2877,surv:0.3315}},
  {id:'c_dc_f_69', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:401,late:-0.0352,n10:0.2768,surv:0.3489}},
  {id:'c_dc_f_70', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승다이버전스 + MFI(자금흐름)>51.87',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}], src:{n:44,late:-0.0411,n10:0.2955,surv:0.3682}},
  {id:'c_dc_f_71', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + ADX<17.61 + OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:59,late:-0.0375,n10:0.2881,surv:0.3831}},
  {id:'c_dc_f_72', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + OBV 상승다이버전스 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:83,late:-0.0295,n10:0.2651,surv:0.3349}},
  {id:'c_dc_f_73', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + RSI 상승다이버전스 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:103,late:-0.0317,n10:0.2718,surv:0.3359}},
  {id:'c_dc_f_74', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'macdGc',type:'bin'}], src:{n:286,late:-0.0343,n10:0.2797,surv:0.3678}},
  {id:'c_dc_f_75', pool:'deadcat', kind:'fake', mode:'and', label:'MA20 이격도%<-11.66 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-11.66}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'sarBear',type:'bin'}], src:{n:38,late:-0.0373,n10:0.2895,surv:0.3868}},
  {id:'c_dc_f_76', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:191,late:-0.0297,n10:0.267,surv:0.3665}},
  {id:'c_dc_f_77', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:150,late:-0.0316,n10:0.2733,surv:0.3533}},
  {id:'c_dc_f_78', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + OBV 상승추세 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:92,late:-0.031,n10:0.2717,surv:0.3424}},
  {id:'c_dc_f_79', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:40,late:-0.0402,n10:0.3,surv:0.375}},
  {id:'c_dc_f_80', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:50,late:-0.0401,n10:0.3,surv:0.382}},
  {id:'c_dc_f_81', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승추세 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:50,late:-0.0401,n10:0.3,surv:0.382}},
  {id:'c_dc_f_82', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + OBV 상승다이버전스',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}], src:{n:33,late:-0.0409,n10:0.303,surv:0.3303}},
  {id:'c_dc_f_83', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:58,late:-0.0255,n10:0.2586,surv:0.3776}},
  {id:'c_dc_f_84', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + RSI 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}], src:{n:64,late:-0.0382,n10:0.2969,surv:0.3719}},
  {id:'c_dc_f_85', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + RSI 상승다이버전스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:64,late:-0.0382,n10:0.2969,surv:0.3719}},
  {id:'c_dc_f_86', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + MFI(자금흐름)>51.87 + 골든크로스 5×60 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_60',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:33,late:-0.0301,n10:0.2727,surv:0.4152}},
  {id:'c_dc_f_87', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승추세 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:142,late:-0.0259,n10:0.2606,surv:0.3507}},
  {id:'c_dc_f_88', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:49,late:-0.041,n10:0.3061,surv:0.3776}},
  {id:'c_dc_f_89', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + OBV 상승추세 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:143,late:-0.0296,n10:0.2727,surv:0.3469}},
  {id:'c_dc_f_90', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:59,late:-0.0403,n10:0.3051,surv:0.3864}},
  {id:'c_dc_f_91', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + RSI 상승다이버전스 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}], src:{n:63,late:-0.039,n10:0.3016,surv:0.3651}},
  {id:'c_dc_f_92', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + 골든크로스 5×60',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'gx5_60',type:'bin'}], src:{n:57,late:-0.0255,n10:0.2632,surv:0.4246}},
  {id:'c_dc_f_93', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:45,late:-0.0414,n10:0.3111,surv:0.3778}},
  {id:'c_dc_f_94', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:58,late:-0.041,n10:0.3103,surv:0.3862}},
  {id:'c_dc_f_95', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:78,late:-0.0358,n10:0.2949,surv:0.3346}},
  {id:'c_dc_f_96', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MFI(자금흐름)>51.87 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvDiv',type:'bin'}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:261,late:-0.0293,n10:0.2759,surv:0.3828}},
  {id:'c_dc_f_97', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:111,late:-0.0304,n10:0.2793,surv:0.3342}},
  {id:'c_dc_f_98', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + OBV 상승추세 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:145,late:-0.0291,n10:0.2759,surv:0.3503}},
  {id:'c_dc_f_99', pool:'deadcat', kind:'fake', mode:'and', label:'MA120 이격도%<-33.4 + MA200 이격도%<-47.2 + OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-33.4}, {key:'dev200',type:'num',dir:'lt',th:-47.2}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:58,late:-0.0288,n10:0.2759,surv:0.3448}},
  {id:'c_dc_f_100', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0341,n10:0.2917,surv:0.3604}},
  {id:'c_dc_f_101', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + 지지선 근접 + MACD 골든크로스',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'nearSup',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0341,n10:0.2917,surv:0.3604}},
  {id:'c_dc_f_102', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'settle20',type:'bin'}], src:{n:178,late:-0.0286,n10:0.2753,surv:0.3421}},
  {id:'c_dc_f_103', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'obvDiv',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:204,late:-0.0349,n10:0.2941,surv:0.3426}},
  {id:'c_dc_f_104', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:284,late:-0.033,n10:0.2887,surv:0.3585}},
  {id:'c_dc_f_105', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + OBV 상승추세 + MA20 돌파안착(상승) + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvUp',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:100,late:-0.0332,n10:0.29,surv:0.367}},
  {id:'c_dc_f_106', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + OBV 상승추세 + MACD 골든크로스 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:56,late:-0.0258,n10:0.2679,surv:0.3786}},
  {id:'c_dc_f_107', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:186,late:-0.0314,n10:0.2849,surv:0.3608}},
  {id:'c_dc_f_108', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'sarBear',type:'bin'}], src:{n:114,late:-0.0356,n10:0.2982,surv:0.4026}},
  {id:'c_dc_f_109', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + Stoch %K<9.23 + RSI 상승다이버전스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}], src:{n:62,late:-0.0383,n10:0.3065,surv:0.3694}},
  {id:'c_dc_f_110', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + CCI<-80.77 + OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:58,late:-0.0395,n10:0.3103,surv:0.3707}},
  {id:'c_dc_f_111', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:48,late:-0.0401,n10:0.3125,surv:0.3979}},
  {id:'c_dc_f_112', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + 골든크로스 5×9 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:110,late:-0.0298,n10:0.2818,surv:0.3373}},
  {id:'c_dc_f_113', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세 + MACD 영선아래',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:227,late:-0.0298,n10:0.2819,surv:0.3626}},
  {id:'c_dc_f_114', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + Stoch %K<9.23 + RSI 상승다이버전스 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:62,late:-0.0377,n10:0.3065,surv:0.3694}},
  {id:'c_dc_f_115', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MFI(자금흐름)>51.87 + 골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'mfi',type:'num',dir:'gt',th:51.87}, {key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:91,late:-0.0307,n10:0.2857,surv:0.3385}},
  {id:'c_dc_f_116', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'sarBear',type:'bin'}], src:{n:55,late:-0.0385,n10:0.3091,surv:0.3945}},
  {id:'c_dc_f_117', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + MACD 골든크로스 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:282,late:-0.0323,n10:0.2908,surv:0.3606}},
  {id:'c_dc_f_118', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:172,late:-0.0276,n10:0.2791,surv:0.3471}},
  {id:'c_dc_f_119', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + BB %B<0.12 + RSI 상승다이버전스 + OBV 상승추세',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:32,late:-0.0282,n10:0.2812,surv:0.3719}},
  {id:'c_dc_f_120', pool:'deadcat', kind:'fake', mode:'and', label:'거래량 OSC<-35.25 + OBV 상승다이버전스 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-35.25}, {key:'obvDiv',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:165,late:-0.0334,n10:0.297,surv:0.3782}},
  {id:'c_dc_f_121', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}], src:{n:127,late:-0.0367,n10:0.3071,surv:0.3984}},
  {id:'c_dc_f_122', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:127,late:-0.0367,n10:0.3071,surv:0.3984}},
  {id:'c_dc_f_123', pool:'deadcat', kind:'fake', mode:'and', label:'ADX<17.61 + OBV 상승다이버전스 + OBV 상승추세 + PSAR 하락',
   conds:[{key:'adx',type:'num',dir:'lt',th:17.61}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:178,late:-0.0373,n10:0.309,surv:0.3742}},
  {id:'c_dc_f_124', pool:'deadcat', kind:'fake', mode:'and', label:'BB %B<0.12 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.12}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}], src:{n:51,late:-0.0388,n10:0.3137,surv:0.3824}},
  {id:'c_dc_f_125', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + DI 하락우위 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:113,late:-0.0371,n10:0.3097,surv:0.4009}},
  {id:'c_dc_f_126', pool:'deadcat', kind:'fake', mode:'and', label:'RSI 상승다이버전스 + OBV 상승다이버전스 + OBV 상승추세',
   conds:[{key:'rsiDiv',type:'bin'}, {key:'obvDiv',type:'bin'}, {key:'obvUp',type:'bin'}], src:{n:234,late:-0.0293,n10:0.2863,surv:0.3624}},
  {id:'c_dc_f_127', pool:'deadcat', kind:'fake', mode:'and', label:'Stoch %K<9.23 + RSI 상승다이버전스 + OBV 상승추세 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'lt',th:9.23}, {key:'rsiDiv',type:'bin'}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:49,late:-0.0353,n10:0.3061,surv:0.3898}},
  {id:'c_dc_f_128', pool:'deadcat', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + VR(거래량비율)<70.47 + 지지선 근접 + PSAR 하락',
   conds:[{key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:83,late:-0.0292,n10:0.2892,surv:0.4133}},
  {id:'c_dc_f_129', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}], src:{n:118,late:-0.0342,n10:0.3051,surv:0.4059}},
  {id:'c_dc_f_130', pool:'deadcat', kind:'fake', mode:'and', label:'CCI<-80.77 + OBV 상승다이버전스 + VR(거래량비율)<70.47 + MACD 영선아래',
   conds:[{key:'cci',type:'num',dir:'lt',th:-80.77}, {key:'obvDiv',type:'bin'}, {key:'vr',type:'num',dir:'lt',th:70.47}, {key:'macdBelow0',type:'bin'}], src:{n:118,late:-0.0342,n10:0.3051,surv:0.4059}},
  // ── [S849] COIN · pullback-real · 발굴풀 스냅샷(2026-07-01T09:00:00) 빔서치 · 게이트S848 · 등록컷(n≥30) ──
  {id:'c_pb_r_01', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA5 기울기%<-3.69 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}], src:{n:67,late:0.0447,n10:0.7015,surv:0.6657}},
  {id:'c_pb_r_02', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + ADX>23.11 + MA20 이격도%<-10.27',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev20',type:'num',dir:'lt',th:-10.27}], src:{n:60,late:0.047,n10:0.6667,surv:0.7033}},
  {id:'c_pb_r_03', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA5 기울기%<-3.69',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:78,late:0.0406,n10:0.6795,surv:0.6385}},
  {id:'c_pb_r_04', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA5 기울기%<-3.69 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'sarBear',type:'bin'}], src:{n:78,late:0.0406,n10:0.6795,surv:0.6385}},
  {id:'c_pb_r_05', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + MA5 기울기%<-3.69 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}], src:{n:66,late:0.0398,n10:0.6818,surv:0.6485}},
  {id:'c_pb_r_06', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%<-3.69 + 지지선 근접',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}], src:{n:78,late:0.0383,n10:0.6795,surv:0.6474}},
  {id:'c_pb_r_07', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%<-3.69 + 지지선 근접 + DI 하락우위',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:78,late:0.0383,n10:0.6795,surv:0.6474}},
  {id:'c_pb_r_08', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%<-3.69 + 지지선 근접 + PSAR 하락',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:77,late:0.0392,n10:0.6753,surv:0.6506}},
  {id:'c_pb_r_09', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA5 기울기%<-3.69 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'diBear',type:'bin'}], src:{n:73,late:0.0397,n10:0.6712,surv:0.6411}},
  {id:'c_pb_r_10', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + MA5 기울기%<-3.69',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:60,late:0.041,n10:0.6667,surv:0.6417}},
  {id:'c_pb_r_11', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + 지지선 근접 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:63,late:0.0348,n10:0.6825,surv:0.6429}},
  {id:'c_pb_r_12', pool:'pullback', kind:'real', mode:'and', label:'MA5 기울기%<-3.69 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:74,late:0.0371,n10:0.6757,surv:0.6514}},
  {id:'c_pb_r_13', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + Stoch %K<14.23 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}], src:{n:50,late:0.0352,n10:0.68,surv:0.642}},
  {id:'c_pb_r_14', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + 지지선 근접',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'nearSup',type:'bin'}], src:{n:68,late:0.0315,n10:0.6912,surv:0.6368}},
  {id:'c_pb_r_15', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.69 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'diBear',type:'bin'}], src:{n:58,late:0.0469,n10:0.6379,surv:0.7017}},
  {id:'c_pb_r_16', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + 지지선 근접 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:69,late:0.0317,n10:0.6812,surv:0.5841}},
  {id:'c_pb_r_17', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:53,late:0.026,n10:0.6981,surv:0.5943}},
  {id:'c_pb_r_18', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + Stoch %K<14.23 + 지지선 근접',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}], src:{n:61,late:0.0341,n10:0.6721,surv:0.5918}},
  {id:'c_pb_r_19', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.69',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:60,late:0.0458,n10:0.6333,surv:0.695}},
  {id:'c_pb_r_20', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.69 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'sarBear',type:'bin'}], src:{n:60,late:0.0458,n10:0.6333,surv:0.695}},
  {id:'c_pb_r_21', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA5 기울기%<-3.69 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'macdBelow0',type:'bin'}], src:{n:67,late:0.0379,n10:0.6567,surv:0.6433}},
  {id:'c_pb_r_22', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + 지지선 근접 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:63,late:0.0285,n10:0.6825,surv:0.619}},
  {id:'c_pb_r_23', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + BB 스퀴즈',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'squeeze',type:'bin'}], src:{n:55,late:0.0252,n10:0.6909,surv:0.5909}},
  {id:'c_pb_r_24', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}], src:{n:96,late:0.0333,n10:0.6667,surv:0.6073}},
  {id:'c_pb_r_25', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + 지지선 근접',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}], src:{n:71,late:0.0295,n10:0.6761,surv:0.5746}},
  {id:'c_pb_r_26', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + Stoch %K<14.23 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'sarBear',type:'bin'}], src:{n:72,late:0.0326,n10:0.6667,surv:0.6347}},
  {id:'c_pb_r_27', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + BB %B<0.13 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}], src:{n:54,late:0.0324,n10:0.6667,surv:0.5889}},
  {id:'c_pb_r_28', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.2 + MA5 기울기%<-3.69 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'nearSup',type:'bin'}], src:{n:67,late:0.0352,n10:0.6567,surv:0.6433}},
  {id:'c_pb_r_29', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + MA60 이격도%<-5.2',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}], src:{n:70,late:0.0349,n10:0.6571,surv:0.6186}},
  {id:'c_pb_r_30', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2 + MA5 기울기%<-3.69',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:60,late:0.0364,n10:0.65,surv:0.6283}},
  {id:'c_pb_r_31', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + 지지선 근접 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:70,late:0.0292,n10:0.6714,surv:0.5743}},
  {id:'c_pb_r_32', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + Stoch %K<14.23',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'stochK',type:'num',dir:'lt',th:14.23}], src:{n:73,late:0.0313,n10:0.6575,surv:0.626}},
  {id:'c_pb_r_33', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}], src:{n:98,late:0.0313,n10:0.6531,surv:0.5959}},
  {id:'c_pb_r_34', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'sarBear',type:'bin'}], src:{n:98,late:0.0313,n10:0.6531,surv:0.5959}},
  {id:'c_pb_r_35', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + MA60 이격도%<-5.2 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}], src:{n:82,late:0.0288,n10:0.6585,surv:0.6037}},
  {id:'c_pb_r_36', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}], src:{n:85,late:0.0321,n10:0.6471,surv:0.6353}},
  {id:'c_pb_r_37', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + 지지선 근접',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'nearSup',type:'bin'}], src:{n:112,late:0.0267,n10:0.6607,surv:0.5839}},
  {id:'c_pb_r_38', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + BB %B<0.13 + MA5 기울기%<-3.69',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:50,late:0.0465,n10:0.6,surv:0.702}},
  {id:'c_pb_r_39', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + 지지선 근접 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:110,late:0.0278,n10:0.6545,surv:0.5864}},
  {id:'c_pb_r_40', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + DI 하락우위',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'diBear',type:'bin'}], src:{n:96,late:0.0305,n10:0.6458,surv:0.5927}},
  {id:'c_pb_r_41', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + 지지선 근접 + DI 하락우위',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:110,late:0.026,n10:0.6545,surv:0.5809}},
  {id:'c_pb_r_42', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:66,late:0.0268,n10:0.6515,surv:0.5621}},
  {id:'c_pb_r_43', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}], src:{n:59,late:0.0281,n10:0.6441,surv:0.6475}},
  {id:'c_pb_r_44', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:59,late:0.0281,n10:0.6441,surv:0.6475}},
  {id:'c_pb_r_45', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:59,late:0.0281,n10:0.6441,surv:0.6475}},
  {id:'c_pb_r_46', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA5 기울기%<-3.69 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}, {key:'macdBelow0',type:'bin'}], src:{n:55,late:0.0425,n10:0.6,surv:0.6855}},
  {id:'c_pb_r_47', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + Stoch %K<14.23 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'sarBear',type:'bin'}], src:{n:72,late:0.0292,n10:0.6389,surv:0.5708}},
  {id:'c_pb_r_48', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + Stoch %K<14.23 + MACD 영선아래',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'macdBelow0',type:'bin'}], src:{n:90,late:0.0309,n10:0.6333,surv:0.5933}},
  {id:'c_pb_r_49', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + Stoch %K<14.23 + DI 하락우위',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'diBear',type:'bin'}], src:{n:69,late:0.0291,n10:0.6377,surv:0.5725}},
  {id:'c_pb_r_50', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA20 이격도%<-10.27 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}], src:{n:52,late:0.03,n10:0.6346,surv:0.6442}},
  {id:'c_pb_r_51', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA20 이격도%<-10.27 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'diBear',type:'bin'}], src:{n:52,late:0.03,n10:0.6346,surv:0.6442}},
  {id:'c_pb_r_52', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:55,late:0.029,n10:0.6364,surv:0.6273}},
  {id:'c_pb_r_53', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:104,late:0.0261,n10:0.6442,surv:0.5808}},
  {id:'c_pb_r_54', pool:'pullback', kind:'real', mode:'and', label:'MA20 이격도%<-10.27 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'dev20',type:'num',dir:'lt',th:-10.27}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:58,late:0.0258,n10:0.6379,surv:0.6414}},
  {id:'c_pb_r_55', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'diBear',type:'bin'}], src:{n:89,late:0.0284,n10:0.6292,surv:0.6124}},
  {id:'c_pb_r_56', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + MA60 이격도%<-5.2 + MA5 기울기%<-3.69',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'ma5slope',type:'num',dir:'lt',th:-3.69}], src:{n:54,late:0.0406,n10:0.5926,surv:0.6833}},
  {id:'c_pb_r_57', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + Stoch %K<14.23',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'stochK',type:'num',dir:'lt',th:14.23}], src:{n:73,late:0.0279,n10:0.6301,surv:0.563}},
  {id:'c_pb_r_58', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + ADX>23.11',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'adx',type:'num',dir:'gt',th:23.11}], src:{n:50,late:0.0368,n10:0.6,surv:0.576}},
  {id:'c_pb_r_59', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.2 + 지지선 근접',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}], src:{n:111,late:0.0242,n10:0.6306,surv:0.5973}},
  {id:'c_pb_r_60', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.2 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:111,late:0.0242,n10:0.6306,surv:0.5973}},
  {id:'c_pb_r_61', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.2 + 지지선 근접 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:111,late:0.0242,n10:0.6306,surv:0.5973}},
  {id:'c_pb_r_62', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + DI 하락우위 + PSAR 하락',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:123,late:0.025,n10:0.626,surv:0.5967}},
  {id:'c_pb_r_63', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + 지지선 근접 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:141,late:0.0255,n10:0.6241,surv:0.5851}},
  {id:'c_pb_r_64', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.22 + 지지선 근접',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'nearSup',type:'bin'}], src:{n:61,late:0.0197,n10:0.6393,surv:0.6557}},
  {id:'c_pb_r_65', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}], src:{n:143,late:0.0252,n10:0.6224,surv:0.5839}},
  {id:'c_pb_r_66', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'sarBear',type:'bin'}], src:{n:170,late:0.0244,n10:0.6235,surv:0.5782}},
  {id:'c_pb_r_67', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}], src:{n:91,late:0.0263,n10:0.6154,surv:0.5989}},
  {id:'c_pb_r_68', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + 지지선 근접 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:139,late:0.0247,n10:0.6187,surv:0.5813}},
  {id:'c_pb_r_69', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'macdBelow0',type:'bin'}], src:{n:90,late:0.0262,n10:0.6111,surv:0.6011}},
  {id:'c_pb_r_70', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.22 + 지지선 근접 + DI 하락우위',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:60,late:0.0186,n10:0.6333,surv:0.6517}},
  {id:'c_pb_r_71', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MA60 이격도%<-5.2 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'sarBear',type:'bin'}], src:{n:90,late:0.0258,n10:0.6111,surv:0.5944}},
  {id:'c_pb_r_72', pool:'pullback', kind:'real', mode:'and', label:'MA60 이격도%<-5.2 + 지지선 근접 + PSAR 하락',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:106,late:0.0246,n10:0.6132,surv:0.5896}},
  {id:'c_pb_r_73', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.22 + 지지선 근접 + PSAR 하락',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:59,late:0.0191,n10:0.6271,surv:0.6458}},
  {id:'c_pb_r_74', pool:'pullback', kind:'real', mode:'and', label:'MFI(자금흐름)<31.22 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:56,late:0.0177,n10:0.625,surv:0.6446}},
  {id:'c_pb_r_75', pool:'pullback', kind:'real', mode:'and', label:'거래량 OSC<-14.7 + Stoch %K<14.23 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'diBear',type:'bin'}], src:{n:57,late:0.0269,n10:0.5965,surv:0.6158}},
  {id:'c_pb_r_76', pool:'pullback', kind:'real', mode:'and', label:'BB %B<0.13 + Stoch %K<14.23 + MACD 영선아래',
   conds:[{key:'bbPctB',type:'num',dir:'lt',th:0.13}, {key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'macdBelow0',type:'bin'}], src:{n:60,late:0.0242,n10:0.6,surv:0.5417}},
  {id:'c_pb_r_77', pool:'pullback', kind:'real', mode:'and', label:'지지선 근접 + DI 하락우위',
   conds:[{key:'nearSup',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:173,late:0.0199,n10:0.6127,surv:0.559}},
  {id:'c_pb_r_78', pool:'pullback', kind:'real', mode:'and', label:'지지선 근접 + PSAR 하락',
   conds:[{key:'nearSup',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:173,late:0.0217,n10:0.6069,surv:0.563}},
  {id:'c_pb_r_79', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + MFI(자금흐름)<31.22',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'mfi',type:'num',dir:'lt',th:31.22}], src:{n:63,late:0.0211,n10:0.6032,surv:0.646}},
  {id:'c_pb_r_80', pool:'pullback', kind:'real', mode:'and', label:'CCI<-121.24 + MFI(자금흐름)<31.22 + PSAR 하락',
   conds:[{key:'cci',type:'num',dir:'lt',th:-121.24}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'sarBear',type:'bin'}], src:{n:63,late:0.0211,n10:0.6032,surv:0.646}},
  {id:'c_pb_r_81', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MFI(자금흐름)<31.22',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'mfi',type:'num',dir:'lt',th:31.22}], src:{n:53,late:0.0198,n10:0.6038,surv:0.6491}},
  {id:'c_pb_r_82', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MFI(자금흐름)<31.22 + PSAR 하락',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'sarBear',type:'bin'}], src:{n:53,late:0.0198,n10:0.6038,surv:0.6491}},
  {id:'c_pb_r_83', pool:'pullback', kind:'real', mode:'and', label:'RSI<36.59 + MFI(자금흐름)<31.22',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.59}, {key:'mfi',type:'num',dir:'lt',th:31.22}], src:{n:76,late:0.0178,n10:0.6053,surv:0.6579}},
  {id:'c_pb_r_84', pool:'pullback', kind:'real', mode:'and', label:'RSI<36.59 + MFI(자금흐름)<31.22 + MACD 영선아래',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.59}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'macdBelow0',type:'bin'}], src:{n:76,late:0.0178,n10:0.6053,surv:0.6579}},
  {id:'c_pb_r_85', pool:'pullback', kind:'real', mode:'and', label:'RSI<36.59 + MFI(자금흐름)<31.22 + DI 하락우위',
   conds:[{key:'rsi',type:'num',dir:'lt',th:36.59}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'diBear',type:'bin'}], src:{n:76,late:0.0178,n10:0.6053,surv:0.6579}},
  {id:'c_pb_r_86', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + 지지선 근접 + MACD 영선아래',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'nearSup',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:124,late:0.0232,n10:0.5887,surv:0.579}},
  {id:'c_pb_r_87', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MFI(자금흐름)<31.22 + 지지선 근접',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'nearSup',type:'bin'}], src:{n:50,late:0.0174,n10:0.6,surv:0.64}},
  {id:'c_pb_r_88', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:128,late:0.0207,n10:0.5703,surv:0.5672}},
  {id:'c_pb_r_89', pool:'pullback', kind:'real', mode:'and', label:'Stoch %K<14.23 + MFI(자금흐름)<31.22 + DI 하락우위',
   conds:[{key:'stochK',type:'num',dir:'lt',th:14.23}, {key:'mfi',type:'num',dir:'lt',th:31.22}, {key:'diBear',type:'bin'}], src:{n:50,late:0.0161,n10:0.58,surv:0.636}},
  // ── [S849] COIN · pullback-fake · 발굴풀 스냅샷(2026-07-01T09:00:00) 빔서치 · 게이트S848 · 등록컷(n≥30·ΔN10≥5%p) ──
  {id:'c_pb_f_01', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:31,late:-0.0802,n10:0.0968,surv:0.271}},
  {id:'c_pb_f_02', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:34,late:-0.0791,n10:0.1471,surv:0.3147}},
  {id:'c_pb_f_03', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'obvUp',type:'bin'}], src:{n:32,late:-0.0824,n10:0.1875,surv:0.3344}},
  {id:'c_pb_f_04', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + MA20 돌파안착(상승)',
   conds:[{key:'gx5_9',type:'bin'}, {key:'settle20',type:'bin'}], src:{n:39,late:-0.0743,n10:0.1795,surv:0.3}},
  {id:'c_pb_f_05', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA20 돌파안착(상승)',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'settle20',type:'bin'}], src:{n:36,late:-0.0661,n10:0.2222,surv:0.3389}},
  {id:'c_pb_f_06', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:74,late:-0.0579,n10:0.2027,surv:0.3568}},
  {id:'c_pb_f_07', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA20 돌파안착(상승) + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:31,late:-0.0628,n10:0.2258,surv:0.3871}},
  {id:'c_pb_f_08', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}], src:{n:38,late:-0.0562,n10:0.2105,surv:0.3842}},
  {id:'c_pb_f_09', pool:'pullback', kind:'fake', mode:'and', label:'BB 스퀴즈 + MA20 돌파안착(상승) + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'squeeze',type:'bin'}, {key:'settle20',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:32,late:-0.0573,n10:0.2188,surv:0.3719}},
  {id:'c_pb_f_10', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:36,late:-0.0573,n10:0.2222,surv:0.4278}},
  {id:'c_pb_f_11', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 골든크로스 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:41,late:-0.0641,n10:0.2439,surv:0.3854}},
  {id:'c_pb_f_12', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:36,late:-0.0542,n10:0.2222,surv:0.3833}},
  {id:'c_pb_f_13', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:62,late:-0.0582,n10:0.2419,surv:0.3532}},
  {id:'c_pb_f_14', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:34,late:-0.0547,n10:0.2353,surv:0.3912}},
  {id:'c_pb_f_15', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:48,late:-0.0564,n10:0.25,surv:0.3417}},
  {id:'c_pb_f_16', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + BB 스퀴즈 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:47,late:-0.05,n10:0.234,surv:0.3489}},
  {id:'c_pb_f_17', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:31,late:-0.0447,n10:0.2258,surv:0.4129}},
  {id:'c_pb_f_18', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:57,late:-0.0544,n10:0.2632,surv:0.3684}},
  {id:'c_pb_f_19', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + 골든크로스 5×9 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:57,late:-0.0544,n10:0.2632,surv:0.3684}},
  {id:'c_pb_f_20', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:81,late:-0.0616,n10:0.2963,surv:0.3765}},
  {id:'c_pb_f_21', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:64,late:-0.0506,n10:0.2656,surv:0.3484}},
  {id:'c_pb_f_22', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + BB 스퀴즈 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:31,late:-0.0582,n10:0.2903,surv:0.3742}},
  {id:'c_pb_f_23', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + VR(거래량비율)<49.68',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:32,late:-0.0429,n10:0.25,surv:0.4094}},
  {id:'c_pb_f_24', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:32,late:-0.0429,n10:0.25,surv:0.4094}},
  {id:'c_pb_f_25', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + BB 스퀴즈 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:30,late:-0.0595,n10:0.3,surv:0.3767}},
  {id:'c_pb_f_26', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + OBV 상승추세 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:44,late:-0.0541,n10:0.2955,surv:0.4091}},
  {id:'c_pb_f_27', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + OBV 상승추세',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'obvUp',type:'bin'}], src:{n:76,late:-0.0511,n10:0.2895,surv:0.3842}},
  {id:'c_pb_f_28', pool:'pullback', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:63,late:-0.0603,n10:0.3175,surv:0.3984}},
  {id:'c_pb_f_29', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + BB 스퀴즈 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:53,late:-0.0461,n10:0.283,surv:0.3792}},
  {id:'c_pb_f_30', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:32,late:-0.0544,n10:0.3125,surv:0.3938}},
  {id:'c_pb_f_31', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + BB 스퀴즈 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:96,late:-0.0424,n10:0.2812,surv:0.4312}},
  {id:'c_pb_f_32', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + VR(거래량비율)<49.68 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'sarBear',type:'bin'}], src:{n:30,late:-0.0359,n10:0.2667,surv:0.4367}},
  {id:'c_pb_f_33', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:106,late:-0.0409,n10:0.283,surv:0.4396}},
  {id:'c_pb_f_34', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + OBV 상승추세 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'obvUp',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:33,late:-0.0474,n10:0.303,surv:0.4424}},
  {id:'c_pb_f_35', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승다이버전스 + BB 스퀴즈',
   conds:[{key:'obvDiv',type:'bin'}, {key:'squeeze',type:'bin'}], src:{n:32,late:-0.0388,n10:0.2812,surv:0.3937}},
  {id:'c_pb_f_36', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + VR(거래량비율)<49.68 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:55,late:-0.0414,n10:0.2909,surv:0.3945}},
  {id:'c_pb_f_37', pool:'pullback', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:123,late:-0.0414,n10:0.2927,surv:0.4163}},
  {id:'c_pb_f_38', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + 골든크로스 5×9 + MACD 골든크로스',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}], src:{n:63,late:-0.0548,n10:0.3333,surv:0.3921}},
  {id:'c_pb_f_39', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:60,late:-0.0547,n10:0.3333,surv:0.3983}},
  {id:'c_pb_f_40', pool:'pullback', kind:'fake', mode:'and', label:'골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:169,late:-0.0428,n10:0.3018,surv:0.397}},
  {id:'c_pb_f_41', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MA60 이격도%<-5.2 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'sarBear',type:'bin'}], src:{n:78,late:-0.0262,n10:0.2564,surv:0.4051}},
  {id:'c_pb_f_42', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + 골든크로스 5×9 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'gx5_9',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0463,n10:0.3182,surv:0.3955}},
  {id:'c_pb_f_43', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:115,late:-0.0374,n10:0.2957,surv:0.433}},
  {id:'c_pb_f_44', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + VR(거래량비율)<49.68 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:47,late:-0.0374,n10:0.2979,surv:0.4085}},
  {id:'c_pb_f_45', pool:'pullback', kind:'fake', mode:'and', label:'BB 스퀴즈 + 골든크로스 5×9',
   conds:[{key:'squeeze',type:'bin'}, {key:'gx5_9',type:'bin'}], src:{n:150,late:-0.0394,n10:0.3067,surv:0.4067}},
  {id:'c_pb_f_46', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:33,late:-0.0381,n10:0.303,surv:0.4545}},
  {id:'c_pb_f_47', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + OBV 상승추세 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:43,late:-0.0443,n10:0.3256,surv:0.4488}},
  {id:'c_pb_f_48', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'gx5_9',type:'bin'}], src:{n:132,late:-0.0358,n10:0.3106,surv:0.4394}},
  {id:'c_pb_f_49', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + VR(거래량비율)<49.68 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'sarBear',type:'bin'}], src:{n:48,late:-0.0363,n10:0.3125,surv:0.4062}},
  {id:'c_pb_f_50', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'obvUp',type:'bin'}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:82,late:-0.0392,n10:0.3293,surv:0.3927}},
  {id:'c_pb_f_51', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:38,late:-0.034,n10:0.3158,surv:0.4184}},
  {id:'c_pb_f_52', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:38,late:-0.034,n10:0.3158,surv:0.4184}},
  {id:'c_pb_f_53', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:38,late:-0.034,n10:0.3158,surv:0.4184}},
  {id:'c_pb_f_54', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + 골든크로스 5×9',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'gx5_9',type:'bin'}], src:{n:46,late:-0.0428,n10:0.3478,surv:0.4174}},
  {id:'c_pb_f_55', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:46,late:-0.0428,n10:0.3478,surv:0.4174}},
  {id:'c_pb_f_56', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + OBV 상승추세 + MACD 골든크로스 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'obvUp',type:'bin'}, {key:'macdGc',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:35,late:-0.0408,n10:0.3429,surv:0.4771}},
  {id:'c_pb_f_57', pool:'pullback', kind:'fake', mode:'and', label:'OBV 상승추세 + 골든크로스 5×9 + MACD 영선아래',
   conds:[{key:'obvUp',type:'bin'}, {key:'gx5_9',type:'bin'}, {key:'macdBelow0',type:'bin'}], src:{n:37,late:-0.0339,n10:0.3243,surv:0.4811}},
  {id:'c_pb_f_58', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'sarBear',type:'bin'}], src:{n:34,late:-0.0308,n10:0.3235,surv:0.4294}},
  {id:'c_pb_f_59', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MA60 이격도%<-5.2',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}], src:{n:87,late:-0.0202,n10:0.2989,surv:0.4402}},
  {id:'c_pb_f_60', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + VR(거래량비율)<49.68 + DI 하락우위 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:45,late:-0.0298,n10:0.3333,surv:0.4333}},
  {id:'c_pb_f_61', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + BB 스퀴즈 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'squeeze',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:52,late:-0.0315,n10:0.3462,surv:0.3942}},
  {id:'c_pb_f_62', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<-11.37 + VR(거래량비율)<49.68',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_63', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-5.2 + MA120 이격도%<-11.37 + VR(거래량비율)<49.68',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_64', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<-11.37 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_65', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<-11.37 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_66', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-5.2 + MA120 이격도%<-11.37 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_67', pool:'pullback', kind:'fake', mode:'and', label:'MA60 이격도%<-5.2 + MA120 이격도%<-11.37 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_68', pool:'pullback', kind:'fake', mode:'and', label:'MA120 이격도%<-11.37 + VR(거래량비율)<49.68 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'dev120',type:'num',dir:'lt',th:-11.37}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:44,late:-0.0052,n10:0.2727,surv:0.4182}},
  {id:'c_pb_f_69', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'macdBelow0',type:'bin'}], src:{n:114,late:-0.0202,n10:0.3246,surv:0.4719}},
  {id:'c_pb_f_70', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MA60 이격도%<-5.2 + MACD 영선아래',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'macdBelow0',type:'bin'}], src:{n:84,late:-0.0151,n10:0.3095,surv:0.4524}},
  {id:'c_pb_f_71', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MA60 이격도%<-5.2 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'diBear',type:'bin'}], src:{n:84,late:-0.0151,n10:0.3095,surv:0.4524}},
  {id:'c_pb_f_72', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MACD 영선아래 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'macdBelow0',type:'bin'}, {key:'sarBear',type:'bin'}], src:{n:89,late:-0.0164,n10:0.3146,surv:0.4539}},
  {id:'c_pb_f_73', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:72,late:-0.0109,n10:0.3056,surv:0.4444}},
  {id:'c_pb_f_74', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + VR(거래량비율)<49.68 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:72,late:-0.0109,n10:0.3056,surv:0.4444}},
  {id:'c_pb_f_75', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + ADX>23.11 + MACD 영선아래 + DI 하락우위',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'adx',type:'num',dir:'gt',th:23.11}, {key:'macdBelow0',type:'bin'}, {key:'diBear',type:'bin'}], src:{n:111,late:-0.0198,n10:0.3333,surv:0.4775}},
  {id:'c_pb_f_76', pool:'pullback', kind:'fake', mode:'and', label:'거래량 OSC<-14.7 + MA60 이격도%<-5.2 + PSAR 하락',
   conds:[{key:'volOsc',type:'num',dir:'lt',th:-14.7}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'sarBear',type:'bin'}], src:{n:122,late:-0.0208,n10:0.3443,surv:0.4385}},
  {id:'c_pb_f_77', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + VR(거래량비율)<49.68',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:73,late:-0.0106,n10:0.3151,surv:0.4425}},
  {id:'c_pb_f_78', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:73,late:-0.0106,n10:0.3151,surv:0.4425}},
  {id:'c_pb_f_79', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}], src:{n:65,late:-0.0075,n10:0.3077,surv:0.4462}},
  {id:'c_pb_f_80', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68 + MACD 영선아래',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'macdBelow0',type:'bin'}], src:{n:65,late:-0.0075,n10:0.3077,surv:0.4462}},
  {id:'c_pb_f_81', pool:'pullback', kind:'fake', mode:'and', label:'ADX>23.11 + MA60 이격도%<-5.2 + VR(거래량비율)<49.68 + DI 하락우위',
   conds:[{key:'adx',type:'num',dir:'gt',th:23.11}, {key:'dev60',type:'num',dir:'lt',th:-5.2}, {key:'vr',type:'num',dir:'lt',th:49.68}, {key:'diBear',type:'bin'}], src:{n:65,late:-0.0075,n10:0.3077,surv:0.4462}},
  ]
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
