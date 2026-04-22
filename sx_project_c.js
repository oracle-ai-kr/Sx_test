// ════════════════════════════════════════════════════════════
//  SIGNAL X — Project C Module v1.4 <!-- S105 Phase3-B-4f.5 매수 근거 평가 함수 신규: calcEntryEvaluation(analScore, rr, btScore, mom) 추가 - v3.0 4.5 공식 구현(4요인 가중 합산, 0~100점, 4등급). 배너 중단의 매수 시점 스냅샷(과거 이력) + 엔진판단 근거 버튼의 실시간 재평가(현재) 양쪽에서 공통 사용. 스냅샷 저장 불필요 - BT 매수 봉 인덱스로 역산 가능(Phase 3-B-9a 이후 완전 커버). 반환 {score, reasons, grade}. --> v1.3 <!-- S104 Phase3-B-4f.4b 양방향 게이지 재설계: calcVerdictTransition을 단방향 확률 합산 → 양방향 게이지(정방향+역방향)로 전면 재작성. ①"게이지" 개념 (늘어나면 전이 / 줄어들면 현상태 유지) ②양방향 요인 (충전+방전 동시 계산, Math.max/min으로 0~95 클램프) ③역방향 게이지 신규 (현 C와 반대 방향 경고 감지 — "중동 쇼크" 시나리오 대응: buy_signal 2봉 공백 구간에서 위험 조기경보) ④경고 모드 (역방향 > 정방향 시 역방향 우선 표시, warningMode:true) ⑤신호성 판정(매수/즉시 청산/매도 완료) = 전이 직후 = 낮은 기본값. 반환 객체에 {reverse, warningMode} 필드 추가(기존 API 호환 유지). C 정합성 5원칙 전부 준수 (①독자판정금지 ②단일성 ⑤정합 ⑥내러티브 ④신호·상태 공백 해소). --> v1.2 <!-- S103-fix7 Phase3-B-4f.4 ③ 진입/매도 검토 C 전이 확률화: calcVerdictTransition(currentVerdict, analScore, mom, rr, btState) 신규 - 9종 C 판정별 다음 상태 전이 확률(0~95) 계산 + getTimingButtonLabel(verdictAction) 신규 - 현재 C에서 타이밍 버튼 라벨("진입 검토"/"매도 검토") 도출. v3.0 원칙 ⑥(다음 단계 예측) 구현. 모멘텀 _mom.delta 기반 레거시 판단을 C 기반으로 전환하기 위한 Layer 2 함수. --> v1.1 <!-- S103-fix7 Phase3-B-7.1 checkConsistency + renderConsistencyHTML API 추가 - 분석탭/BT탭 도움말 모달에서 즉시 정합성 체크 가능. sx_diag.js의 _diagProjectC 로직을 SXC로 이전(단일 소스) - 설정탭 진단도 SXC.checkConsistency 위임. --> v1.0 <!-- S103-fix7 Phase3-B-7 C 로직 모듈 분리 (sx_render.js에서 supervisorJudge/unifiedVerdict/_mapVerdictToBtAction/_verdictMap/_verdictBadgeTop 추출 → SXC 네임스페이스로 통합) -->
//
//  프로젝트 C (Project C, "A+B=C") — SIGNAL X 통합 판정 아키텍처
//
//  ┌─ A (분석 scrQuickScore) ─┐
//  │                          ├─→ C (unifiedVerdict, 9종 단일 판정)
//  └─ B (runBtEngine)         ─┘
//
//  5개 절대 원칙:
//    ① 독자 판정 금지      — UI는 C만 소비, 독자 로직 금지
//    ② C의 단일성         — 모든 판정 경로는 C로 수렴
//    ③ Layer 1 불변       — 엔진/BT는 데이터 공급만 (수정 최소화)
//    ④ 신호 vs 상태 구분   — 2봉 이내 신호 vs 2봉 초과 상태 구분
//    ⑤ 정합 우선          — C와 충돌 시 C화 or 숨김 or 데이터 강등
//                          ("기능 축소가 판정 혼란보다 낫다")
//
//  9종 verdictAction:
//    비보유 4종: 매수 / 관심 / 관망 / 회피
//    보유중 5종: 보유 유지 / 청산 준비 / 청산 검토 / 즉시 청산 / 매도 완료
//
//  Phase 진행 이력:
//    Phase 3-A-1,2,3: 근본 버그 수정 + 감독관 아키텍처 재설계
//    Phase 3-B-0:     진단 가드레일 (sx_diag.js)
//    Phase 3-B-1:     practicalGuide C화 (sx_interpret.js)
//    Phase 3-B-2:     _btAction C 매핑
//    Phase 3-B-3:     summary C화 (보유중 맥락)
//    Phase 3-B-7:     이 파일 (C 로직 모듈화)
//    Phase 3-B-7.1:   정합성 체크 API (checkConsistency)
//    Phase 3-B-4f.4:  ③ 진입/매도 검토 C 전이 확률화 (v1.2)
//                     - calcVerdictTransition 단방향 확률 합산
//    Phase 3-B-4f.4b: 양방향 게이지 재설계 (v1.3)
//                     - 게이지 개념 (늘어남/줄어듦 양방향)
//                     - 역방향 게이지 (중동 쇼크 등 급변 경고)
//                     - 경고 모드 (역방향 > 정방향 시 우선 표시)
//    Phase 3-B-4f.5:  ④ 엔진판단 근거 매수 근거 평가 (v1.4) ← 현재
//                     - calcEntryEvaluation 신규 (4요인 가중 합산, 0~100)
//                     - 배너 중단 과거 스냅샷 + 버튼 현재 재평가
//
//  본 파일은 render.js의 supervisorJudge/unifiedVerdict/_mapVerdictToBtAction/
//  _verdictMap/_verdictBadgeTop를 한 모듈(SXC)로 통합. 기능 변경 없음,
//  구조 개선만. render.js에서 SXC.xxx(...) 형태로 호출.
// ════════════════════════════════════════════════════════════

(function(global){
  'use strict';

  // ══════════════════════════════════════════════════════════════
  //  상수 정의
  // ══════════════════════════════════════════════════════════════

  // 9종 verdictAction 전체
  const VERDICT_ACTIONS = [
    '매수', '관심', '관망', '회피',
    '보유 유지', '청산 준비', '청산 검토', '즉시 청산', '매도 완료'
  ];

  // 보유중 5종 (SXI.summary, SXI.practicalGuide 등에서 보유자 맥락 처리용)
  const HOLDING_ACTIONS = ['보유 유지', '청산 준비', '청산 검토', '즉시 청산', '매도 완료'];

  // 비보유 4종
  const NON_HOLDING_ACTIONS = ['매수', '관심', '관망', '회피'];

  // 9종 → 결과탭 배지 그룹 매핑 (6종 그룹)
  //   buy: 매수
  //   interest: 관심
  //   hold: 보유 유지
  //   watch: 관망 / 청산 준비
  //   avoid: 회피 / 청산 검토
  //   sell: 즉시 청산 / 매도 완료
  const VERDICT_GROUP_MAP = {
    '매수':'buy',
    '관심':'interest',
    '보유 유지':'hold',
    '관망':'watch',
    '청산 준비':'watch',
    '회피':'avoid',
    '청산 검토':'avoid',
    '즉시 청산':'sell',
    '매도 완료':'sell'
  };

  // ══════════════════════════════════════════════════════════════
  //  Layer 2: 판정 로직 (감독관 + C)
  // ══════════════════════════════════════════════════════════════

  // S99: 감독관 2차 판정
  //   analScore: 진입타이밍 점수 (readyScore)
  //   momentum:  {delta, direction:'up'|'down'|'flat'}
  //   rr:        손익비 (calcTpSlRr.rr)
  //   → 반환: 'buy_ready'|'interest'|'hold'|'watch'|'avoid'|'sell_ready'
  function supervisorJudge(analScore, momentum, rr) {
    const dir = momentum?.direction || 'flat';
    const delta = momentum?.delta || 0;
    // 저점에서 상승중 — 전이↑ 필수
    if (analScore <= 55 && dir === 'up' && delta > 3) {
      return rr >= 1.0 ? 'buy_ready' : 'interest';
    }
    // 중간 구간 + 상승 전이
    if (analScore >= 55 && analScore <= 70 && dir === 'up') {
      return rr >= 1.0 ? 'buy_ready' : 'interest';
    }
    // 중간 구간 + 횡보 (전이↑ 아님)
    if (analScore >= 50 && analScore <= 70 && dir === 'flat') {
      return rr >= 1.0 ? 'hold' : 'hold';
    }
    // 고점 유지
    if (analScore >= 70 && dir !== 'down') {
      return 'hold';
    }
    // 고점에서 하락 시작
    if (analScore >= 55 && dir === 'down') {
      return 'watch';
    }
    // 저점 하락중
    if (analScore <= 40 && dir === 'down') {
      return rr < 0.5 ? 'sell_ready' : 'avoid';
    }
    // 기본
    if (dir === 'down') return 'watch';
    if (rr >= 1.0 && analScore >= 50 && dir === 'up') return 'interest';
    return 'avoid';
  }

  // S99: BT × 감독관 → 통합 판정 (C)
  // S103-fix7 Phase3-A-2: 채희창 2×2 매트릭스 반영 (BT점수×분석점수)
  //   - empty Stage: BT◯+분석◯는 경계(곧 buy_signal로 전이)=관심, BT◯+분석✗=관심(타이밍 대기),
  //                 BT✗+분석◯=관망(함정 가능성), BT✗+분석✗=회피
  //   - "대기" 값 완전 폐지 → "회피"로 통합 (비보유=진입안함의 의미로 동일)
  //   - 매도완료: 배지 "하락유력" 부여 (차트 마커 ▼과 동기화)
  // S103-fix7 Phase3-A-3: btStateObj 4번째 인자 추가 — 매도 완료(sell_signal)에서 익절/손절+수익률 라벨 강화
  //
  //   btState:     'buy_signal'|'holding'|'sell_signal'|'waiting'
  //   svJudge:     supervisorJudge 결과
  //   btScore:     BT 전략점수 (empty Stage에서 BT◯/✗ 판정용, nullable)
  //   btStateObj:  stock._btState 원본 (매도 시 pnl/isWin/exitDate 등 맥락 정보용, nullable)
  //   → {action, icon, color, chartMarker(null|'buy'|'sell'), label}
  function unifiedVerdict(btState, svJudge, btScore, btStateObj) {
    // Stage: just_bought — BT 매수 신호 방금 (1~2봉 이내)
    if (btState === 'buy_signal') {
      if (svJudge === 'buy_ready')
        return {action:'매수', icon:'🟢', color:'#22c55e', chartMarker:'buy', label:'BT 매수 + 상승 전이중'};
      if (svJudge === 'interest')
        return {action:'관심', icon:'🔵', color:'#3b82f6', chartMarker:null, label:'BT 신호 + 손익비 부족'};
      // 분석 약함 (hold/watch/avoid) — BT는 유효하나 현재 타이밍 애매 → 관심
      return {action:'관심', icon:'🔵', color:'#3b82f6', chartMarker:null, label:'BT 신호 + 타이밍 대기'};
    }
    // Stage: holding — 보유중 (▲ 있고 ▼ 없음, 2봉 초과)
    if (btState === 'holding') {
      if (svJudge === 'buy_ready' || svJudge === 'hold' || svJudge === 'interest')
        return {action:'보유 유지', icon:'🟢', color:'#22c55e', chartMarker:null, label:'보유 유지'};
      if (svJudge === 'watch')
        return {action:'청산 준비', icon:'🟡', color:'#f59e0b', chartMarker:null, label:'청산 준비'};
      if (svJudge === 'avoid')
        return {action:'청산 검토', icon:'🟠', color:'#ff8c00', chartMarker:null, label:'청산 검토'};
      if (svJudge === 'sell_ready')
        return {action:'즉시 청산', icon:'🔴', color:'#e8365a', chartMarker:'sell', label:'지지선 이탈 + 하락 가속'};
      return {action:'보유 유지', icon:'🟢', color:'#22c55e', chartMarker:null, label:'보유 유지'};
    }
    // Stage: just_sold — BT 매도 신호 방금 (▼ 발생, 2봉 이내)
    // S103-fix7 Phase3-A-3: 익절/손절 + pnl% 맥락 표시 (단순 "매도 확인" → 풍부한 라벨)
    if (btState === 'sell_signal') {
      var _sellLabel = '매도 확인';
      if (btStateObj && btStateObj.isWin != null && btStateObj.pnl != null) {
        var _pnlS = btStateObj.pnl >= 0 ? '+' + btStateObj.pnl.toFixed(1) : btStateObj.pnl.toFixed(1);
        _sellLabel = (btStateObj.isWin ? '익절' : '손절') + ' ' + _pnlS + '%';
      }
      return {action:'매도 완료', icon:'🔴', color:'#e8365a', chartMarker:'sell', label:_sellLabel};
    }
    // Stage: empty — 비보유 (waiting, 매수 이력 없거나 완결 이후)
    //   채희창 매트릭스: BT점수(btScore ≥60) × 분석점수(svJudge 강도)로 2×2
    const _btGood = (btScore != null && btScore >= 60);
    const _analGood = (svJudge === 'buy_ready' || svJudge === 'interest');
    if (_btGood) {
      // BT 검증 성공 → 분석 무관 "관심" (전략 유효, 타이밍 대기)
      return {action:'관심', icon:'🔵', color:'#3b82f6', chartMarker:null, label:_analGood?'BT 검증 + 분석 개선중':'BT 검증 성공, 타이밍 대기'};
    }
    if (_analGood) {
      // BT 검증 실패 + 분석만 좋음 → 관망 (함정 가능성)
      return {action:'관망', icon:'🟡', color:'#f59e0b', chartMarker:null, label:'BT 미검증, 함정 주의'};
    }
    // BT ✗ + 분석 ✗ → 회피 (처음부터 진입하지 않음 — "대기"와 통합)
    return {action:'회피', icon:'⚪', color:'#9e9e9e', chartMarker:null, label:'진입 불가'};
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 3: UI 헬퍼
  // ══════════════════════════════════════════════════════════════

  // S103-fix7 Phase3-B-2: C(_svVerdict.action 9종) → _btAction (4종) 매핑
  //   진단 결과 14종목 14/14 정합 실패 → 기존 점수 기반 es×bs 4분류 폐기하고 C 기반 매핑으로 교체
  //   매핑 기준: "신규 진입자 관점" (결과탭 칩은 새로운 진입 시 참고용)
  //     매수/보유 유지 → 진입 적기   (지금 들어가도 OK)
  //     관심          → 관심 등록   (BT만 좋음, 타이밍 대기)
  //     관망/청산 준비/청산 검토 → 단기급등 주의 (조심, 함정 가능성 또는 보유중 경계)
  //     즉시 청산/회피/매도 완료  → 회피        (진입 금지)
  function mapVerdictToBtAction(verdictAction){
    if(!verdictAction) return null;
    switch(verdictAction){
      case '매수':
      case '보유 유지':
        return '진입 적기';
      case '관심':
        return '관심 등록';
      case '관망':
      case '청산 준비':
      case '청산 검토':
        return '단기급등 주의';
      case '즉시 청산':
      case '회피':
      case '매도 완료':
        return '회피';
      default:
        return null;
    }
  }

  // S103-fix6c Phase2: 감독관 통합판정 기반 행동 배지 (진입타이밍 버튼 위 좌측 정렬)
  //   유력(실선 진한색): 매수→반등유력 / 즉시 청산·매도 완료→하락유력 (차트마커 ▲▼과 동기화)
  //   조짐(실선 연한색): 관심→반등조짐 / 청산 준비·청산 검토→하락조짐 (예고 단계)
  //   그 외(보유 유지·관망·회피): 배지 없음 (회피=비보유 진입안함이라 경고 표시 불필요)
  // S103-fix7 Phase3-A-2: '매도 완료'에 하락유력 배지 추가 (▼ 차트마커와 쌍), '회피'는 배지 제거 (비보유 상태)
  //   → 반환: HTML string (빈 문자열이면 배지 없음)
  function getVerdictBadge(verdictAction){
    if(!verdictAction) return '';
    switch(verdictAction){
      case '매수':
        return '<span class="tx-badge up">반등유력</span>';
      case '관심':
        return '<span class="tx-badge up-soft">반등조짐</span>';
      case '청산 준비':
      case '청산 검토':
        return '<span class="tx-badge down-soft">하락조짐</span>';
      case '즉시 청산':
      case '매도 완료':
        return '<span class="tx-badge down">하락유력</span>';
      default:
        return '';
    }
  }

  // 9종 → 결과탭 배지 그룹 조회 (buy/interest/hold/watch/avoid/sell)
  //   미매칭 시 'none' 반환
  function getVerdictGroup(verdictAction){
    if(!verdictAction) return 'none';
    return VERDICT_GROUP_MAP[verdictAction] || 'none';
  }

  // 보유중 5종 체크 (SXI.summary의 _isHolding 판단과 동일 로직 공유)
  function isHolding(verdictAction){
    if(!verdictAction) return false;
    return HOLDING_ACTIONS.indexOf(verdictAction) >= 0;
  }

  // ══════════════════════════════════════════════════════════════
  //  Layer 3.5: C 전이 확률 & 타이밍 버튼 라벨 (Phase 3-B-4f.4)
  //    v3.0 원칙 ⑥: ③ 진입/매도 검토 = "다음 단계 예측" (C 전이 확률)
  //    ──────────────────────────────────────────────────────────
  //    기존 (v2.0): 버튼에 분석점수 62 +1 → 의미 불명
  //    신규 (v3.0): 버튼에 "청산 준비 전이 82%" → 의사결정 직결
  //
  //    채희창 설계 철학:
  //    "진입검토란 말답게 시뮬레이션이 어디로 전이될지를 보여주면 될거같아.
  //     청산준비면 82% 라고 하면 거의 유력에 가까워지고,
  //     청산준비 32%라면 아직 시간이 조금 남아있는거야."
  //                                                   — 2026-04-18
  // ══════════════════════════════════════════════════════════════

  // 타이밍 버튼 라벨 (현재 C에서 다음 단계로 가는 관점)
  //   보유중 5종                → '매도 검토' (다음 단계 = 하락/청산)
  //   비보유 4종 + 매도 완료     → '진입 검토' (다음 단계 = 상승/매수)
  //   v3.0 문서 3.4 표 기준 (9종 전체 커버)
  function getTimingButtonLabel(verdictAction){
    if(!verdictAction) return '진입 검토'; // 안전 기본값
    // 보유중 5종 중 매도 완료는 예외 (이미 청산됨 → 재진입 관점)
    if(verdictAction === '매도 완료') return '진입 검토';
    if(isHolding(verdictAction)) return '매도 검토';
    return '진입 검토';
  }

  // ══════════════════════════════════════════════════════════════
  //  calcVerdictTransition — 양방향 C 전이 게이지 (v1.3 재설계)
  // ══════════════════════════════════════════════════════════════
  //
  //  게이지 개념:
  //    - 전이% = 현재 C에서 다음 C로 넘어갈 준비도 (0~95)
  //    - 0 = 현 상태 매우 공고 (안 바뀜)
  //    - 95 = 다음 상태 전이 임박
  //    - 매 순간 양방향 오르내림 (충전+방전 동시 계산)
  //
  //  양방향:
  //    - 정방향 (primary): 현 C → 다음 C (자연 전이 경로)
  //    - 역방향 (reverse): 현 C → 이전/반대 C (경고/강등 감지)
  //    - 역방향 > 정방향 → warningMode=true (중동 쇼크 등 급변 대응)
  //
  //  채희창 핵심 시나리오 (S104):
  //    "방금 매수했는데 중동 전쟁으로 차트 급락 → C는 아직 매수 유지 중
  //     (BT buy_signal 2봉 공백) → 사용자는 위험 감지 못함"
  //    → 역방향 게이지가 이 공백에서 경고를 채움 (원칙 ④ 신호·상태 보완)
  //
  //  입력:
  //    currentVerdict : 9종 C 판정 문자열
  //    analScore      : 분석 점수 (0~100)
  //    mom            : scoreMomentum {delta, direction, history, ...} | null
  //    rr             : 손익비 (0~∞)
  //    btState        : stock._btState {pnl, isWin, state, ...} | null
  //
  //  반환:
  //    {label, value, nextVerdict, polarity, warningMode, reverse}
  //      label         : 표시용 라벨 ('청산 준비 전이' 등, 경고 모드면 '⚠ xxx 경고')
  //      value         : 0~95 정수 (표시할 게이지%, 경고 모드면 역방향 value)
  //      nextVerdict   : 다음 C 상태 (경고 모드면 역방향 대상)
  //      polarity      : 'up'(기회)/'down'(위험) — 경고 모드는 항상 'down'
  //      warningMode   : true면 역방향 우선 표시 (중동 쇼크 대응)
  //      reverse       : 역방향 원본 정보 {label, value, nextVerdict} (경고 모드 아닐 때도 디버그용 제공)
  // ══════════════════════════════════════════════════════════════
  function calcVerdictTransition(currentVerdict, analScore, mom, rr, btState){
    const dir    = (mom && mom.direction) ? mom.direction : 'flat';
    const delta  = (mom && typeof mom.delta === 'number') ? mom.delta : 0;
    const score  = typeof analScore === 'number' ? analScore : 50;
    const rrv    = typeof rr === 'number' ? rr : 1.0;
    const pnl    = (btState && typeof btState.pnl === 'number') ? btState.pnl : 0;

    // 헬퍼: 게이지 값 0~95 클램프
    const clamp = (v) => Math.max(0, Math.min(95, Math.round(v)));

    // ─── 정방향/역방향 게이지 계산 결과 컨테이너 ───
    let primary = null;   // 정방향 (자연 전이)
    let reverse = null;   // 역방향 (경고/강등)

    // ─── 상태성 6종: 양방향 게이지 (충전+방전) ───

    if (currentVerdict === '보유 유지') {
      // 정방향: 청산 준비로 기울기 (악재 충전, 호재 방전)
      let g = 0;
      if (dir === 'down') g += 35;
      if (score < 55) g += 20;
      if (rrv < 1.0) g += 15;
      if (delta < -3) g += 15;
      if (pnl < 0) g += 10;
      // 방전 (보유 유지 공고화)
      if (dir === 'up') g -= 20;
      if (score > 65) g -= 15;
      if (rrv > 1.5) g -= 10;
      if (delta > 3) g -= 10;
      if (pnl > 5) g -= 10;
      primary = { label:'청산 준비 전이', value:clamp(g), nextVerdict:'청산 준비', polarity:'down' };
      // 역방향: 이미 "최상위 보유" 상태 → 더 위로 갈 곳 없음 → null
      reverse = null;
    }

    else if (currentVerdict === '청산 준비') {
      // 정방향: 청산 검토로 기울기
      let g = 15;
      if (score < 45) g += 30;
      if (dir === 'down' && delta < -5) g += 25;
      if (rrv < 0.5) g += 15;
      if (pnl < -3) g += 10;
      if (dir === 'up') g -= 20;
      if (score > 55) g -= 15;
      if (delta > 3) g -= 10;
      if (pnl > 0) g -= 10;
      primary = { label:'청산 검토 전이', value:clamp(g), nextVerdict:'청산 검토', polarity:'down' };
      // 역방향: 회복 → 보유 유지 복귀 (강등이 아니라 "복귀")
      let rg = 0;
      if (dir === 'up') rg += 35;
      if (delta > 5) rg += 25;
      if (score > 60) rg += 20;
      if (rrv > 1.5) rg += 15;
      if (pnl > 3) rg += 10;
      if (dir === 'down') rg -= 20;
      if (score < 45) rg -= 15;
      reverse = { label:'보유 유지 복귀', value:clamp(rg), nextVerdict:'보유 유지', polarity:'up' };
    }

    else if (currentVerdict === '청산 검토') {
      // 정방향: 즉시 청산
      let g = 30;
      if (score < 40) g += 25;
      if (dir === 'down' && delta < -3) g += 20;
      if (rrv < 0.5) g += 15;
      if (pnl < -5) g += 15;
      if (dir === 'up') g -= 25;
      if (score > 50) g -= 15;
      if (delta > 3) g -= 10;
      primary = { label:'즉시 청산 전이', value:clamp(g), nextVerdict:'즉시 청산', polarity:'down' };
      // 역방향: 청산 준비로 완화 복귀
      let rg = 0;
      if (dir === 'up' && delta > 3) rg += 30;
      if (score > 55) rg += 25;
      if (rrv > 1.2) rg += 15;
      if (pnl > 0) rg += 10;
      if (dir === 'down') rg -= 15;
      reverse = { label:'청산 준비 복귀', value:clamp(rg), nextVerdict:'청산 준비', polarity:'up' };
    }

    else if (currentVerdict === '관심') {
      // 정방향: 매수 전이
      let g = 15;
      if (dir === 'up' && delta > 5) g += 35;
      if (score > 55) g += 20;
      if (rrv > 1.5) g += 15;
      if (delta > 3) g += 10;
      if (dir === 'down') g -= 25;
      if (score < 45) g -= 20;
      if (delta < -3) g -= 15;
      primary = { label:'매수 전이', value:clamp(g), nextVerdict:'매수', polarity:'up' };
      // 역방향: 관망 강등 (관심 이유 약화)
      let rg = 0;
      if (dir === 'down') rg += 30;
      if (score < 45) rg += 25;
      if (delta < -5) rg += 20;
      if (rrv < 0.8) rg += 15;
      if (dir === 'up') rg -= 20;
      if (score > 55) rg -= 15;
      reverse = { label:'관망 강등', value:clamp(rg), nextVerdict:'관망', polarity:'down' };
    }

    else if (currentVerdict === '관망') {
      // 정방향: 관심 승격
      let g = 10;
      if (dir === 'up') g += 25;
      if (score > 50) g += 20;
      if (delta > 3) g += 15;
      if (rrv > 1.2) g += 10;
      if (dir === 'down') g -= 20;
      if (score < 40) g -= 15;
      primary = { label:'관심 전이', value:clamp(g), nextVerdict:'관심', polarity:'up' };
      // 역방향: 회피 강등
      let rg = 0;
      if (dir === 'down' && delta < -3) rg += 30;
      if (score < 40) rg += 25;
      if (rrv < 0.8) rg += 15;
      if (dir === 'up') rg -= 15;
      if (score > 50) rg -= 10;
      reverse = { label:'회피 강등', value:clamp(rg), nextVerdict:'회피', polarity:'down' };
    }

    else if (currentVerdict === '회피') {
      // 정방향: 관망 승격
      let g = 0;
      if (dir === 'up' && delta > 5) g += 25;
      if (score > 45) g += 15;
      if (rrv > 1.0) g += 10;
      if (delta > 3) g += 10;
      if (dir === 'down') g -= 15;
      if (score < 35) g -= 10;
      primary = { label:'관망 전이', value:clamp(g), nextVerdict:'관망', polarity:'up' };
      // 역방향: 회피가 이미 최하단 → 없음
      reverse = null;
    }

    // ─── 신호성 3종: 전이 직후 리셋 (낮은 기본값) + 역방향 경고 ───
    //   원칙 ④: 매수/즉시 청산/매도 완료는 이벤트 → 다음 상태로 자연 이행
    //   단, "중동 쇼크" 시나리오: 매수 판정 유지 중에도 차트 급변 → 역방향 경고 필요

    else if (currentVerdict === '매수') {
      // 정방향: 보유 유지로 자연 이행 (방금 매수 → 0에서 시작)
      let g = 0;
      if (dir === 'up') g += 30;
      if (rrv >= 1.5) g += 20;
      if (score > 60) g += 15;
      if (delta > 0) g += 10;
      if (dir === 'down') g -= 25;
      if (score < 50) g -= 20;
      if (delta < -3) g -= 20;
      if (pnl < -2) g -= 15;
      primary = { label:'보유 유지 전이', value:clamp(g), nextVerdict:'보유 유지', polarity:'up' };
      // 역방향 (CRITICAL): 매수 직후 급변 → 즉시 청산 경고 (중동 쇼크 대응)
      //   channels.ia._rr, 분석 점수 급락, 하락 가속, 손실 발생을 누적
      let rg = 0;
      if (dir === 'down' && delta < -5) rg += 35;  // 급락 가속
      if (score < 40) rg += 25;                    // 점수 급락
      if (rrv < 0.5) rg += 20;                     // RR 악화
      if (pnl < -3) rg += 20;                      // 매수 직후 손실
      if (delta < -3) rg += 15;                    // 하락 지속
      if (dir === 'up') rg -= 25;                  // 상승이면 경고 방전
      if (score > 60) rg -= 15;
      reverse = { label:'매도 경고', value:clamp(rg), nextVerdict:'즉시 청산', polarity:'down' };
    }

    else if (currentVerdict === '즉시 청산') {
      // 정방향: 매도 완료 이행 (이미 임박 상태)
      let g = 20;
      if (dir === 'down') g += 30;
      if (score < 35) g += 20;
      if (delta < -3) g += 15;
      if (pnl < -5) g += 10;
      if (dir === 'up' && delta > 5) g -= 30;  // 급반등이면 게이지 방전
      if (score > 55) g -= 15;
      primary = { label:'매도 완료 전이', value:clamp(g), nextVerdict:'매도 완료', polarity:'down' };
      // 역방향: 급반등 시 청산 검토로 복귀 (매도 취소)
      let rg = 0;
      if (dir === 'up' && delta > 5) rg += 35;
      if (score > 55) rg += 25;
      if (rrv > 1.2) rg += 15;
      if (pnl > 0) rg += 10;
      if (dir === 'down') rg -= 20;
      reverse = { label:'청산 검토 복귀', value:clamp(rg), nextVerdict:'청산 검토', polarity:'up' };
    }

    else if (currentVerdict === '매도 완료') {
      // 정방향: 관심 재진입 대기 (매도 직후 → 0에서 시작)
      let g = 0;
      if (dir === 'up') g += 25;
      if (score > 55) g += 20;
      if (delta > 3) g += 15;
      if (rrv > 1.5) g += 10;
      if (dir === 'down') g -= 20;
      if (score < 45) g -= 15;
      primary = { label:'관심 전이', value:clamp(g), nextVerdict:'관심', polarity:'up' };
      // 역방향: 매도 완료는 이벤트 종결 상태 → 역방향 없음
      reverse = null;
    }

    // ─── 폴백 (알 수 없는 판정) ───
    else {
      return {
        label: '전이 미확정',
        value: 0,
        nextVerdict: '—',
        polarity: 'up',
        warningMode: false,
        reverse: null
      };
    }

    // ─── 경고 모드 판정: 역방향 > 정방향 + 임계치 ───
    //   역방향 polarity='down' (위험 방향)이고 값이 정방향 초과하면 경고
    //   단, reverse.value >= 40 이상일 때만 발동 (노이즈 방지)
    const isWarning = !!(
      reverse &&
      reverse.polarity === 'down' &&
      reverse.value >= 40 &&
      reverse.value > primary.value
    );

    if (isWarning) {
      return {
        label: '⚠ ' + reverse.label,
        value: reverse.value,
        nextVerdict: reverse.nextVerdict,
        polarity: 'down',
        warningMode: true,
        reverse: { label:reverse.label, value:reverse.value, nextVerdict:reverse.nextVerdict }
      };
    }

    return {
      label: primary.label,
      value: primary.value,
      nextVerdict: primary.nextVerdict,
      polarity: primary.polarity,
      warningMode: false,
      reverse: reverse ? { label:reverse.label, value:reverse.value, nextVerdict:reverse.nextVerdict } : null
    };
  }


  // ══════════════════════════════════════════════════════════════
  //  calcEntryEvaluation — 매수 근거 평가 (v1.4 신규, Phase 3-B-4f.5)
  // ══════════════════════════════════════════════════════════════
  //
  //  목적:
  //    C가 매수 결정한 시점의 "확신 강도"를 0~100점으로 점수화
  //
  //  용도:
  //    ① 배너 중단 스냅샷 (매수 봉 기준 = 과거 이력)
  //       - BT _btState.entryIdx 위치의 indicators row로 역산
  //       - "📸 매수 근거 82점 (4/6 진입)" 표시
  //    ② 엔진판단 근거 버튼 실시간 재평가 (현재 봉 기준)
  //       - "오늘 다시 본다면 43점"
  //
  //  채희창 철학 (v3.0 4.1):
  //    "근거점수는 C가 이번에 매수한 시점에 받아들인 데이터의 평가점수가
  //     되면 될 거 같아."
  //
  //  v3.0 4.5 공식 구현:
  //    분석점수 (최대 30점) + RR (최대 25점) + BT 검증 (최대 25점) + 모멘텀 (최대 20점)
  //
  //  입력:
  //    analScore : 분석 점수 (0~100, readyScore 또는 score)
  //    rr        : 손익비 (0~∞)
  //    btScore   : BT 검증 점수 (0~100) | null
  //    mom       : {direction:'up'|'down'|'flat', delta:number, ...} | null
  //
  //  반환:
  //    {score, reasons, grade}
  //      score   : 0~100 (정수)
  //      reasons : ['양호한 분석점수 68', '유리한 손익비 1.5', ...] 설명 배열
  //      grade   : '강한 매수' (80+) / '양호한 매수' (60~79) / '보통 매수' (40~59) / '약한 매수' (0~39)
  // ══════════════════════════════════════════════════════════════
  function calcEntryEvaluation(analScore, rr, btScore, mom){
    const score0 = typeof analScore === 'number' ? analScore : 50;
    const rrv    = typeof rr === 'number' ? rr : 1.0;
    const bt     = typeof btScore === 'number' ? btScore : null;
    const dir    = (mom && mom.direction) ? mom.direction : 'flat';
    const delta  = (mom && typeof mom.delta === 'number') ? mom.delta : 0;

    let score = 0;
    const reasons = [];

    // ─── 1. 분석점수 기여 (최대 30점) ───
    if (score0 >= 70) {
      score += 30;
      reasons.push('강한 분석점수 ' + score0);
    } else if (score0 >= 55) {
      score += 20;
      reasons.push('양호한 분석점수 ' + score0);
    } else if (score0 >= 45) {
      score += 10;
      reasons.push('보통 분석점수 ' + score0);
    }

    // ─── 2. RR 기여 (최대 25점) ───
    if (rrv >= 2.0) {
      score += 25;
      reasons.push('유리한 손익비 ' + rrv.toFixed(2));
    } else if (rrv >= 1.5) {
      score += 18;
      reasons.push('양호한 손익비 ' + rrv.toFixed(2));
    } else if (rrv >= 1.0) {
      score += 10;
      reasons.push('기본 손익비 ' + rrv.toFixed(2));
    }

    // ─── 3. BT 검증 기여 (최대 25점) ───
    if (bt != null) {
      if (bt >= 70) {
        score += 25;
        reasons.push('BT 검증 강함 ' + bt);
      } else if (bt >= 55) {
        score += 15;
        reasons.push('BT 검증 보통 ' + bt);
      } else if (bt >= 40) {
        score += 8;
        reasons.push('BT 검증 약함 ' + bt);
      }
    }

    // ─── 4. 모멘텀 기여 (최대 20점) ───
    if (dir === 'up' && delta > 5) {
      score += 20;
      reasons.push('강한 상승 전이 +' + delta);
    } else if (dir === 'up' && delta > 2) {
      score += 12;
      reasons.push('양호한 상승 전이 +' + delta);
    } else if (dir === 'up') {
      score += 5;
      reasons.push('약한 상승 전이');
    }

    // ─── 등급 판정 ───
    const finalScore = Math.min(Math.round(score), 100);
    let grade;
    if (finalScore >= 80) grade = '강한 매수';
    else if (finalScore >= 60) grade = '양호한 매수';
    else if (finalScore >= 40) grade = '보통 매수';
    else grade = '약한 매수';

    return {
      score: finalScore,
      reasons: reasons,
      grade: grade
    };
  }


  // ══════════════════════════════════════════════════════════════
  //  Layer 4: 정합성 체크 (Phase 3-B-7.1)
  //    - 분석탭/BT탭 도움말 모달에서 [정합성 체크] 버튼으로 즉시 호출
  //    - 설정탭 시스템 진단에서도 SXC.checkConsistency 위임 (단일 소스)
  //    - 9개 체크 항목 (전역 3개 + 종목별 6개)
  // ══════════════════════════════════════════════════════════════

  // 내부: legacy action vs C 정합 상태 판정 (ok/warn/fail/na)
  function _isConsistentWithC(legacyAction, svVerdict){
    if(!svVerdict || !svVerdict.action) return 'na';
    if(!legacyAction) return 'na';

    const cAction = svVerdict.action;
    if(cAction === legacyAction) return 'ok'; // 완벽 동일

    // C 9종 → 방향성 매핑
    const _cBullish = ['매수','관심','보유 유지'].indexOf(cAction) >= 0;
    const _cBearish = ['회피','즉시 청산','청산 검토','매도 완료'].indexOf(cAction) >= 0;
    const _cNeutral = ['관망','청산 준비'].indexOf(cAction) >= 0; // 경계

    // _btAction 4종 → 방향성 매핑 (점수 기반 레거시)
    const _legBullish = ['진입 적기'].indexOf(legacyAction) >= 0;
    const _legBearish = ['회피'].indexOf(legacyAction) >= 0;
    const _legNeutral = ['단기급등 주의','관심 등록'].indexOf(legacyAction) >= 0;

    // _buildVerdict 레거시 5종 (Phase 3-A-3 이전 버전 하위 호환)
    if(['보유 확인','진입 검토'].indexOf(legacyAction) >= 0){
      if(_cBullish) return 'warn'; if(_cBearish) return 'fail'; return 'warn';
    }
    if(legacyAction === '과열 주의'){
      if(_cBearish || _cNeutral) return 'warn'; if(_cBullish) return 'fail'; return 'warn';
    }

    // 정반대 충돌 = fail
    if(_cBullish && _legBearish) return 'fail';
    if(_cBearish && _legBullish) return 'fail';

    // 방향성 일치 (부분 정합) = warn
    if(_cBullish && _legBullish) return 'warn';
    if(_cBearish && _legBearish) return 'warn';
    if(_cNeutral || _legNeutral) return 'warn';

    return 'warn'; // fallback
  }

  // 내부: Layer 1 + C 엔진 가용성 확인
  function _checkLayerSeparation(){
    const _engineOk = typeof SXE !== 'undefined' && typeof SXE.runBtEngine === 'function' && typeof SXE.calcIndicators === 'function';
    const _cEngineOk = typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function' && typeof SXC.unifiedVerdict === 'function';
    return { layer1: _engineOk, layerC: _cEngineOk };
  }

  // 내부: 정합 상태 → 표시 변환
  function _statusToDisplay(status, legacyAction, cAction){
    switch(status){
      case 'ok':   return {value: '✓ ' + legacyAction, color:'var(--buy)'};
      case 'warn': return {value: '⚠ ' + legacyAction + ' ↔ ' + cAction, color:'var(--accent)'};
      case 'fail': return {value: '✗ ' + legacyAction + ' ↔ ' + cAction, color:'var(--sell)'};
      case 'na':   return {value: '판정 불가', color:'var(--text3)'};
      default:     return {value: '알 수 없음', color:'var(--text3)'};
    }
  }

  // 공개: 종목에 대한 프로젝트 C 정합성 체크
  //   stock: 분석 완료된 종목 객체 (null 가능 — currentAnalStock 또는 searchResults에서 fallback)
  //   options.searchResults: fallback 탐색용 배열 (optional)
  //   → 반환: { rows: [{label, value, color}], hasStock: bool }
  function checkConsistency(stock, options){
    options = options || {};
    const rows = [];

    // ── 전역 체크 3개 ──

    // 1) 감독관 + C 엔진 가용성
    const _layers = _checkLayerSeparation();
    rows.push({
      label: '감독관 가용성',
      value: _layers.layerC ? '✓ supervisorJudge + unifiedVerdict' : '✗ 연결 안됨',
      color: _layers.layerC ? 'var(--buy)' : 'var(--sell)'
    });

    // 2) Layer 1 (엔진/BT) 불변성
    rows.push({
      label: 'Layer 1 (엔진/BT)',
      value: _layers.layer1 ? '✓ 준수' : '✗ SXE 누락',
      color: _layers.layer1 ? 'var(--buy)' : 'var(--sell)'
    });

    // 3) "대기" 값 폐지 확인 (Phase 3-A-2)
    let _daegiPhased = true;
    try {
      const _testEmpty = unifiedVerdict('waiting', 'avoid', 30, null);
      if(_testEmpty && _testEmpty.action === '대기') _daegiPhased = false;
    } catch(e){}
    rows.push({
      label: '"대기" 폐지 (3-A-2)',
      value: _daegiPhased ? '✓ 회피로 통합' : '✗ 대기 잔존',
      color: _daegiPhased ? 'var(--buy)' : 'var(--sell)'
    });

    // ── 종목별 체크 6개 (stock 필요) ──

    // Fallback 1: searchResults에서 _svVerdict 가진 마지막 종목
    let _stock = stock && stock._svVerdict ? stock : null;
    let _stockSource = _stock ? 'current' : null;

    if(!_stock && options.searchResults && options.searchResults.length){
      for(let i = options.searchResults.length - 1; i >= 0; i--){
        if(options.searchResults[i] && options.searchResults[i]._svVerdict){
          _stock = options.searchResults[i];
          _stockSource = 'searchResults';
          break;
        }
      }
    }

    if(!_stock || !_stock._svVerdict){
      const _srCount = options.searchResults ? options.searchResults.length : 0;
      const _svCount = options.searchResults
        ? options.searchResults.filter(function(s){ return s && s._svVerdict; }).length : 0;
      rows.push({
        label: '종목 판정',
        value: _srCount > 0 ? _svCount + '/' + _srCount + '개 분석됨' : '검색 결과 없음',
        color: 'var(--text3)'
      });
      rows.push({
        label: '안내',
        value: _svCount === 0 ? '분석 탭에서 종목 분석 후 진단' : '최근 분석 종목 대기중...',
        color: 'var(--text3)'
      });
      return { rows: rows, hasStock: false };
    }

    // 진단 대상 표시
    rows.push({
      label: '진단 대상',
      value: _stockSource === 'current'
        ? (_stock.name || _stock.code) + ' (분석중)'
        : (_stock.name || _stock.code) + ' (최근분석)',
      color: 'var(--text2)'
    });

    // 4) C 현재 판정
    const _C = _stock._svVerdict;
    rows.push({
      label: 'C 현재 판정',
      value: (_C.icon || '') + ' ' + _C.action,
      color: _C.color || 'var(--text)'
    });

    // 5) _btAction 정합 확인
    if(_stock._btAction){
      const _cstat = _isConsistentWithC(_stock._btAction, _C);
      const _disp = _statusToDisplay(_cstat, _stock._btAction, _C.action);
      rows.push({ label: '_btAction 정합', value: _disp.value, color: _disp.color });
    } else {
      rows.push({ label: '_btAction 정합', value: '미생성', color: 'var(--text3)' });
    }

    // 6) _buildVerdict 정합 (Phase 3-A-3 자동 정합)
    const _report = _stock._threeStageReport || null;
    if(_report && _report.verdict){
      const _vAction = _report.verdict.action || _report.verdict.label;
      if(_vAction){
        const _cstat = _isConsistentWithC(_vAction, _C);
        const _disp = _statusToDisplay(_cstat, _vAction, _C.action);
        rows.push({ label: '_buildVerdict 정합', value: _disp.value, color: _disp.color });
      } else {
        rows.push({ label: '_buildVerdict 정합', value: '판정 없음', color: 'var(--text3)' });
      }
    } else {
      rows.push({
        label: '_buildVerdict 정합',
        value: '✓ 3-A-3 자동 정합 (verdictAction 직수신)',
        color: 'var(--buy)'
      });
    }

    // 7) 차트 마커 정합
    const _mk = _C.chartMarker;
    const _mkLabel = _mk === 'buy'  ? '▲ (C=' + _C.action + ')'
                   : _mk === 'sell' ? '▼ (C=' + _C.action + ')'
                                    : '없음 (C=' + _C.action + ')';
    rows.push({ label: '차트 마커', value: _mkLabel, color: 'var(--text2)' });

    // 8) 신호 vs 상태 구분 (2봉 원칙)
    const _btSt = _stock._btState;
    if(_btSt){
      const _isSignal = _btSt._isBuySignal || _btSt.state === 'sell_signal';
      const _signalLabel = _isSignal
        ? '신호 (≤2봉, ' + _btSt.state + ')'
        : (_btSt.state === 'holding' ? '상태 (>2봉, 보유중)' : '상태 (' + _btSt.state + ')');
      rows.push({ label: '신호 vs 상태', value: _signalLabel, color: 'var(--text2)' });
    } else {
      rows.push({ label: '신호 vs 상태', value: '_btState 없음', color: 'var(--text3)' });
    }

    // 9) rowsLength 반영 (v4.4 엔진 확인, Phase 3-A-1 근본 버그 수정 유효성)
    const _btRes = _stock._btResult;
    if(_btRes){
      const _hasRowsLen = typeof _btRes.rowsLength === 'number' && _btRes.rowsLength > 0;
      rows.push({
        label: 'rowsLength 반영',
        value: _hasRowsLen ? '✓ v4.4+ (' + _btRes.rowsLength + '봉)' : '⚠ 구버전 엔진',
        color: _hasRowsLen ? 'var(--buy)' : 'var(--accent)'
      });
    } else {
      rows.push({ label: 'rowsLength 반영', value: '_btResult 없음', color: 'var(--text3)' });
    }

    return { rows: rows, hasStock: true };
  }

  // 공개: 정합성 체크 결과 → HTML 문자열 (인라인 아코디언 렌더링용)
  //   result: checkConsistency() 반환값
  //   → 반환: HTML 문자열 (모달에 바로 innerHTML 삽입 가능)
  function renderConsistencyHTML(result){
    if(!result || !result.rows) return '';
    const rows = result.rows;
    let html = '<div style="margin-top:8px;padding:10px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">';
    html += '<div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:8px">🎯 프로젝트 C 정합 체크</div>';
    for(let i = 0; i < rows.length; i++){
      const r = rows[i];
      const label = r.label || '';
      const value = r.value || '';
      const color = r.color || 'var(--text2)';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:4px 0;font-size:10px;line-height:1.5;border-bottom:1px dashed var(--border)">';
      html += '<span style="color:var(--text2);flex-shrink:0">' + label + '</span>';
      html += '<span style="color:' + color + ';font-weight:600;text-align:right">' + value + '</span>';
      html += '</div>';
    }
    if(!result.hasStock){
      html += '<div style="margin-top:6px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;font-size:9px;color:var(--text3);line-height:1.5">종목을 먼저 분석 탭에서 선택·분석한 후 다시 시도해주세요.</div>';
    }
    html += '</div>';
    return html;
  }

  // ══════════════════════════════════════════════════════════════
  //  공개 API
  // ══════════════════════════════════════════════════════════════

  global.SXC = {
    // 버전 정보
    VERSION: '1.4',

    // 상수
    VERDICT_ACTIONS: VERDICT_ACTIONS,
    HOLDING_ACTIONS: HOLDING_ACTIONS,
    NON_HOLDING_ACTIONS: NON_HOLDING_ACTIONS,
    VERDICT_GROUP_MAP: VERDICT_GROUP_MAP,

    // Layer 2: 판정
    supervisorJudge: supervisorJudge,
    unifiedVerdict: unifiedVerdict,

    // Layer 3: UI 헬퍼
    mapVerdictToBtAction: mapVerdictToBtAction,
    getVerdictBadge: getVerdictBadge,
    getVerdictGroup: getVerdictGroup,
    isHolding: isHolding,

    // Layer 3.5: C 전이 게이지 (Phase 3-B-4f.4/4b 신규)
    calcVerdictTransition: calcVerdictTransition,
    getTimingButtonLabel: getTimingButtonLabel,

    // Layer 3.6: 매수 근거 평가 (Phase 3-B-4f.5 신규)
    calcEntryEvaluation: calcEntryEvaluation,

    // Layer 4: 정합성 체크 (Phase 3-B-7.1 신규)
    checkConsistency: checkConsistency,
    renderConsistencyHTML: renderConsistencyHTML
  };

})(typeof window !== 'undefined' ? window : this);
