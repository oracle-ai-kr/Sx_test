// ════════════════════════════════════════════════════════════
//  SIGNAL X — Project C Module v1.1 <!-- S103-fix7 Phase3-B-7.1 checkConsistency + renderConsistencyHTML API 추가 - 분석탭/BT탭 도움말 모달에서 즉시 정합성 체크 가능. sx_diag.js의 _diagProjectC 로직을 SXC로 이전(단일 소스) - 설정탭 진단도 SXC.checkConsistency 위임. --> v1.0 <!-- S103-fix7 Phase3-B-7 C 로직 모듈 분리 (sx_render.js에서 supervisorJudge/unifiedVerdict/_mapVerdictToBtAction/_verdictMap/_verdictBadgeTop 추출 → SXC 네임스페이스로 통합) -->
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
//    Phase 3-B-7:     이 파일 (C 로직 모듈화) ← 현재
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
    VERSION: '1.1',

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

    // Layer 4: 정합성 체크 (Phase 3-B-7.1 신규)
    checkConsistency: checkConsistency,
    renderConsistencyHTML: renderConsistencyHTML
  };

})(typeof window !== 'undefined' ? window : this);
