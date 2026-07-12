// ═══════════════════ SIGNAL X — sx_risk_core.js · v2 [S1004 · 청산캐논 S1015] ═══════════════════
// 위험 시그니처 SSOT — 시즌1(분석탭 배지→BT게이트→C3.0 1차필터) · 시즌2(보유 중 경고/청산 보조) 공용.
//
// 계약: recipe_core(_extractFeats733)·feature_library와 동일 — (ind, rows, i)
//   ind  = SXE.calcAllScreener(slice,'day') 반환(풀 지표 · 시즌2 Node 합본빌드도 엔진 포함이라 동일 사용 가능)
//   rows = OHLCV 행 배열 [{date,open,high,low,close,volume},...] · i = 평가 봉 인덱스
//
// 수식 = 측정 하네스 _riskCondsAt(sx_render.js · S994) 정의 **그대로 이식** — 아래 stats 스탬프의 정직성 근거.
// 측정 근거: S1001~S1003 조합 측정 · 3시장 × 3중검증(종목 OOS: 발굴↔확장 · 시간 준OOS: 스냅↔라이브 교대표본 · 시장 OOS: KR/US/COIN)
//   스냅 앵커 = 2026-07-01 동결본 · 판정: crashLift(폭락집중) 타겟 · 전부 "현 기준하 보임" — 확정 아님.
// ★캐논(진입측): 위험 시그니처는 시장별(KR 승자가 US/COIN서 무효 — 등급사다리 역전과 동급). 침체군(ADX<15·MA60저항·고점근접)=3시장 공통 안전이라 미수록. ATR%≥10=고변동 표지(대박 동반)라 차단용 아님 → 미수록.
// ★★캐논(청산측·S1014): 시즌2 자동매매 "보유 중 tier1 청산" 유효성(진입게이트와 별개 축). 측정=워커 runAutotradeExit 복제 sim(votes≥1 진입·2×/3×ATR·MA5×20 유예10일) 위 tier1 청산 arm A/B · 3시장 × 대표/발굴OOS · 7/1 앵커.
//   ★진입 위험신호 ≠ 청산 신호 — 청산 유효성도 시장별(진입 캐논과 동형). 중복률 ~0%(기준 ATR/MA청산이 아직 안 걸림 = 시그니처는 다른 걸 잡음).
//   • COIN(이격20): 보유 중 발동=위험 확장 → 조기청산 +EV(회피이득 +12.96%p · n18 modest · rep/OOS/유예변형 부호 일치) → COIN 자동매매 구축 시 청산 배선 ✓
//   • US(3연속양봉∧갭3%): 추격패턴=보유 중엔 상승 지속 → 조기청산 −EV(승자 절단 −9.68%p · n37) → 청산 배선 ✗ (시즌1 경고로만)
//   • KR(이격8∧MACD음전): 보유 중 발동 2/576회(기준 ATR/MA청산이 먼저 닫아 시그니처 상태 도달 前 종료) → 청산 무의미·배선 실익 없음
//   현 자동매매 = KR 전용 v1(worker mkt='kr' · 2692행). US/COIN 미구축 → 위는 추후 확장 시 사전답(EV 표본 modest = 라이브 재확인 여지 · "현 기준하 보임").
// tier: 1=주력(다중재현+농축+평균lift≤0=막아도 대박 손실 없음) · 2=2군(폭락집중 재현되나 평균lift 양수=대박 일부 동반, 또는 소표본⚠)
// group: 같은 계열(포함관계) — 표시 dedupe용(그룹당 최강 1개만 배지).
(function(){
  'use strict';

  // ── 원자 조건 — _riskCondsAt 정의 미러 (수정 금지 · 바꾸면 stats 무효) ──
  function _disp20(ind){ return (ind && ind.maDisparity && typeof ind.maDisparity.disparity20==='number') ? ind.maDisparity.disparity20 : null; }
  function _macdNegStreak(ind, n){
    var h = ind && ind.macd && ind.macd.arr && ind.macd.arr.hist;
    if(!h || h.length < n) return false;
    for(var k=h.length-n; k<h.length; k++){ if(!(h[k] < 0)) return false; }
    return true;
  }
  function _rsiVal(ind){ return (ind && ind.rsi && typeof ind.rsi.val==='number') ? ind.rsi.val : null; }
  function _rsiDivBear(ind){ return !!(ind && ind.rsi && ind.rsi.div === 'bearish'); }
  function _consecUp(rows, i, n){
    if(i < n-1) return false;
    for(var k=i-n+1; k<=i; k++){ var r=rows[k]; if(!r || !(r.close > r.open)) return false; }
    return true;
  }
  function _gapUp3(rows, i){
    if(i < 1) return false;
    var pc = rows[i-1] && rows[i-1].close, o = rows[i] && rows[i].open;
    if(!(pc > 0) || !(o > 0)) return false;
    return ((o/pc - 1) * 100) >= 3;
  }
  function _rise10Pct(rows, i){   // 최근10봉 상승% (recentHigh20 원자)
    var n=10, s=Math.max(0, i-n+1), base = rows[s] && rows[s].close, p = rows[i] && rows[i].close;
    if(!(base > 0) || !(p > 0)) return null;
    return (p/base - 1) * 100;
  }
  function _highProx95(rows, i){   // 최근10봉 고가 대비 현재가 ≥95%
    var n=10, s=Math.max(0, i-n+1), hi=0;
    for(var k=s; k<=i; k++){ if(rows[k] && rows[k].high > hi) hi = rows[k].high; }
    var p = rows[i] && rows[i].close;
    if(!(hi > 0) || !(p > 0)) return null;
    return (p/hi*100) >= 95;
  }
  function _volDry50(rows, i){
    var n=20, s=Math.max(0, i-n), sum=0, c=0;
    for(var k=s; k<i; k++){ var v=(rows[k] && rows[k].volume) || 0; if(v > 0){ sum+=v; c++; } }
    var a = c ? sum/c : 0, cv = (rows[i] && rows[i].volume) || 0;
    return a > 0 ? (cv < a*0.5) : false;
  }

  // ── 시그니처 테이블 (시장별 SSOT) ──
  // stats: crash=발동봉 절대폭락률(≤-10% @N10) · crashLift=vs baseline · meanLift=평균수익 lift · n=발굴📦 표본 · oos=재현 기록
  var SIGS = {
    kr: [
      { id:'kr_disp8_macd5', group:'kr_dispmacd', tier:1, label:'이격≥8% ∧ MACD 5봉음전',
        stats:{ crash:0.34, crashLift:0.219, meanLift:-0.025, n:175, oos:'확장📦 +19.3 · 라이브🔴 +15.4', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=8 && _macdNegStreak(ind,5); } },
      { id:'kr_disp8_macd3', group:'kr_dispmacd', tier:1, label:'이격≥8% ∧ MACD 3봉음전',
        stats:{ crash:0.32, crashLift:0.201, meanLift:-0.019, n:276, oos:'확장📦 +18.5 · 라이브🔴 +13.7', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=8 && _macdNegStreak(ind,3); } },
      { id:'kr_disp8_voldry', group:'kr_dispdry', tier:2, label:'이격≥8% ∧ 거래량 빈사<50%',
        stats:{ crash:0.24, crashLift:0.120, meanLift:0.008, n:534, oos:'확장📦 +12.3 · 라이브🔴 +8.2', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=8 && _volDry50(rows, i); } },
      { id:'kr_disp20_rsidiv', group:'kr_dispdiv', tier:2, label:'이격≥20% ∧ RSI 약세다이버',
        stats:{ crash:0.30, crashLift:0.178, meanLift:0.019, n:253, oos:'확장📦 +22.8 · 라이브🔴 +13.4', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=20 && _rsiDivBear(ind); } },
      { id:'kr_rsi70_nhigh', group:'kr_rsinh', tier:2, label:'RSI≥70 ∧ 고점 이탈(¬95%근접)',
        stats:{ crash:0.23, crashLift:0.112, meanLift:0.021, n:904, oos:'확장📦 +9.6 · 라이브🔴 +7.9', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var r=_rsiVal(ind), hp=_highProx95(rows, i); return r!=null && r>=70 && hp===false; } }
    ],
    us: [
      { id:'us_consec3_gap3', group:'us_chase', tier:1, label:'3연속 양봉 ∧ 갭 +3%↑',
        stats:{ crash:0.30, crashLift:0.234, meanLift:-0.035, n:56, oos:'라이브🔴 +22.8(농축 재현) · 확장 표본부족', snap:'2026-07-01' },
        eval:function(ind, rows, i){ return _consecUp(rows, i, 3) && _gapUp3(rows, i); } },
      { id:'us_rise20_rsidiv', group:'us_risediv', tier:2, label:'최근10봉 +20%↑ ∧ RSI 약세다이버',
        stats:{ crash:0.25, crashLift:0.180, meanLift:0.013, n:56, oos:'라이브🔴 +18.5', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var r=_rise10Pct(rows, i); return r!=null && r>=20 && _rsiDivBear(ind); } },
      { id:'us_disp8_rsidiv', group:'us_dispdiv', tier:2, label:'이격≥8% ∧ RSI 약세다이버',
        stats:{ crash:0.19, crashLift:0.116, meanLift:0.014, n:188, oos:'라이브🔴 +12.4', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=8 && _rsiDivBear(ind); } },
      { id:'us_voldry_rsidiv', group:'us_drydiv', tier:2, label:'거래량 빈사<50% ∧ RSI 약세다이버',
        stats:{ crash:0.17, crashLift:0.101, meanLift:-0.003, n:41, oos:'라이브🔴 +10.2', snap:'2026-07-01' },
        eval:function(ind, rows, i){ return _volDry50(rows, i) && _rsiDivBear(ind); } }
    ],
    coin: [
      { id:'coin_disp20', group:'coin_disp', tier:1, label:'이격≥20% (단독)',
        stats:{ crash:0.57, crashLift:0.343, meanLift:-0.078, n:92, oos:'라이브🔴 +33.2 · 확장📦 재현 · 조합 농축~0=단독으로 설명', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var d=_disp20(ind); return d!=null && d>=20; } },
      { id:'coin_rsi70_nhigh', group:'coin_rsinh', tier:2, label:'RSI≥70 ∧ 고점 이탈(¬95%근접) ⚠소표본',
        stats:{ crash:0.49, crashLift:0.267, meanLift:-0.073, n:45, oos:'확장📦 +21.3 · 라이브🔴 +40.9 · n24~45 ⚠', snap:'2026-07-01' },
        eval:function(ind, rows, i){ var r=_rsiVal(ind), hp=_highProx95(rows, i); return r!=null && r>=70 && hp===false; } }
    ]
  };

  function _normMk(m){
    var s = String(m || '').toLowerCase();
    if(s.indexOf('coin') >= 0 || s.indexOf('crypto') >= 0 || s.indexOf('upbit') >= 0 || s.indexOf('krw') >= 0) return 'coin';
    if(s.indexOf('us') >= 0 || s.indexOf('nasdaq') >= 0 || s.indexOf('nyse') >= 0) return 'us';
    return 'kr';
  }

  // 현재 봉 발동 시그니처 목록 (그룹당 최강 1개 · tier 오름차순 = 테이블 순서 유지)
  function evalRiskAt(mk, ind, rows, i){
    var list = SIGS[_normMk(mk)] || [];
    var out = [], seen = {};
    for(var k=0; k<list.length; k++){
      var s = list[k];
      if(seen[s.group]) continue;
      var fired = false;
      try { fired = !!s.eval(ind, rows, i); } catch(e){ fired = false; }
      if(fired){ seen[s.group] = 1; out.push({ id:s.id, label:s.label, tier:s.tier, group:s.group, stats:s.stats }); }
    }
    return out;
  }

  // 전 시그니처 원시 평가 (dedupe 없음 · BT/측정용)
  function evalRiskAllRaw(mk, ind, rows, i){
    var list = SIGS[_normMk(mk)] || [];
    var out = {};
    for(var k=0; k<list.length; k++){
      var s = list[k], f=false;
      try { f = !!s.eval(ind, rows, i); } catch(e){}
      out[s.id] = f;
    }
    return out;
  }

  var API = { SIGS:SIGS, evalRiskAt:evalRiskAt, evalRiskAllRaw:evalRiskAllRaw, VERSION:'S1004' };
  if(typeof window !== 'undefined') window.SXRiskCore = API;
  if(typeof module !== 'undefined' && module.exports) module.exports = API;
})();
