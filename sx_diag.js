// ════════════════════════════════════════════════════════════
//  SIGNAL X — Diagnostic Module v1.4
//  5개 카테고리: 시스템 상태 / 데이터 품질 / 스캔 성능 / 환경 / 프로젝트 C 정합
//  sx_diag.js — sx_screener.html 설정탭에서 호출
// ════════════════════════════════════════════════════════════
function openDiagPanel(){
  document.getElementById('diagOverlay').classList.add('show');
  history.pushState({view:'diag'}, '');
}
function closeDiagPanel(){
  document.getElementById('diagOverlay').classList.remove('show');
}

// ── 전체 검사 실행 ──
async function runAllDiag(){
  const body = document.getElementById('diagBody');
  const btn = document.getElementById('btnRunDiag');
  btn.disabled = true; btn.textContent = '검사중...';
  body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px"><div class="spinner"></div><br>진단 실행중...</div>';

  const results = [];

  // 1. 시스템 상태
  try{ results.push(await _diagSystem()); }catch(e){ results.push(_diagError('시스템 상태', e)); }

  // 2. 데이터 품질
  try{ results.push(await _diagData()); }catch(e){ results.push(_diagError('데이터 품질', e)); }

  // 3. 스캔 성능
  try{ results.push(_diagScan()); }catch(e){ results.push(_diagError('스캔 성능', e)); }

  // 4. 사용자 환경
  try{ results.push(_diagEnvironment()); }catch(e){ results.push(_diagError('사용자 환경', e)); }

  // 5. 프로젝트 C 정합 (S103-fix7 Phase3-B-0: 관찰만, UI 영향 없음)
  try{ results.push(_diagProjectC()); }catch(e){ results.push(_diagError('프로젝트 C 정합', e)); }

  // 6. 데이터 확장 진단 (S107 Phase 3-B-9a: Reactive Loading 상태 + 최근 로그)
  try{ results.push(_diagDataExtension()); }catch(e){ results.push(_diagError('데이터 확장 진단', e)); }

  body.innerHTML = results.join('');
  btn.disabled = false; btn.textContent = '전체 검사';
}

// ── 결과 카드 HTML 헬퍼 ──
function _diagCard(title, icon, rows){
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">${icon} ${title}</div>
    ${rows.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span style="color:var(--text2)">${r.label}</span>
      <span style="font-weight:600;color:${r.color||'var(--text)'};font-family:'Outfit',monospace">${r.value}</span>
    </div>`).join('')}
  </div>`;
}

function _diagError(title, e){
  return _diagCard(title, '❌', [{label:'오류', value:e.message||'알 수 없음', color:'var(--sell)'}]);
}

function _statusColor(ok){ return ok ? 'var(--buy)' : 'var(--sell)'; }
function _msColor(ms){ return ms < 500 ? 'var(--buy)' : ms < 1500 ? 'var(--accent)' : 'var(--sell)'; }

// ════════════════════════════════════════════════════════════
//  1. 시스템 상태 진단
// ════════════════════════════════════════════════════════════
async function _diagSystem(){
  const rows = [];
  const base = typeof WORKER_BASE !== 'undefined' ? WORKER_BASE : '';

  // Workers health
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/health', {signal: AbortSignal.timeout(5000)});
    const ms = Math.round(performance.now() - t0);
    const json = await res.json();
    rows.push({label:'Workers 상태', value:`${json.version || 'OK'} (${ms}ms)`, color:_msColor(ms)});
  }catch(e){
    rows.push({label:'Workers 상태', value:'연결 실패', color:'var(--sell)'});
  }

  // KRX market-cap
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/krx/market-cap?market=STK', {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    const json = await res.json();
    const cnt = (json.items||[]).length;
    const fb = json.fallback ? ' (폴백)' : '';
    rows.push({label:'KRX 시세', value:`${cnt}종목 ${ms}ms${fb}`, color: cnt > 0 ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'KRX 시세', value:'실패', color:'var(--sell)'});
  }

  // 네이버 sise (삼성전자 테스트)
  try{
    const t0 = performance.now();
    const end = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const res = await fetch(base + `/naver/sise?symbol=005930&timeframe=day&start=20260101&end=${end}`, {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    const json = await res.json();
    const candles = json.candles || json.data || [];
    rows.push({label:'네이버 시세', value:`${candles.length}봉 ${ms}ms`, color: candles.length > 0 ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'네이버 시세', value:'실패', color:'var(--sell)'});
  }

  // Yahoo (S&P 500 테스트)
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/proxy?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d'), {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    rows.push({label:'Yahoo Finance', value:`${res.ok?'OK':'실패'} ${ms}ms`, color: res.ok ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'Yahoo Finance', value:'실패', color:'var(--sell)'});
  }

  // 업비트
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/upbit/market-all', {signal: AbortSignal.timeout(5000)});
    const ms = Math.round(performance.now() - t0);
    const json = await res.json();
    const cnt = (json.data||json||[]).length;
    rows.push({label:'업비트 API', value:`${cnt}마켓 ${ms}ms`, color: cnt > 0 ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'업비트 API', value:'실패', color:'var(--sell)'});
  }

  // KIS 상태
  const kisEnabled = typeof window._kisEnabled !== 'undefined' && window._kisEnabled;
  rows.push({label:'KIS API', value: kisEnabled ? '연동됨' : '미연결', color: kisEnabled ? 'var(--buy)' : 'var(--text3)'});

  // DART
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/dart/disclosure?corp_code=00126380&bgn_de=20260101&end_de=20261231&page_count=1', {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    rows.push({label:'DART 공시', value:`${res.ok?'OK':'실패'} ${ms}ms`, color: res.ok ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'DART 공시', value:'실패', color:'var(--sell)'});
  }

  return _diagCard('시스템 상태', '🔌', rows);
}

// ════════════════════════════════════════════════════════════
//  2. 데이터 품질 진단
// ════════════════════════════════════════════════════════════
async function _diagData(){
  const rows = [];

  // 종목풀 (ORACLE 키)
  let oracleCount = 0;
  try{
    const k = JSON.parse(localStorage.getItem('ORACLE_KOSPI')||'[]');
    const d = JSON.parse(localStorage.getItem('ORACLE_KOSDAQ')||'[]');
    const e = JSON.parse(localStorage.getItem('ORACLE_ETF')||'[]');
    oracleCount = k.length + d.length + e.length;
  }catch(_){}
  rows.push({label:'ORACLE 종목풀', value: oracleCount > 0 ? `${oracleCount}종목` : '없음 (KRX 단독)', color: oracleCount > 0 ? 'var(--buy)' : 'var(--accent)'});

  // 마스터 캐시
  try{
    const cached = localStorage.getItem(typeof KEYS !== 'undefined' ? KEYS.STOCK_MASTER : 'SX_SCR_STOCK_MASTER');
    if(cached){
      const d = JSON.parse(cached);
      const age = Math.round((Date.now() - d.ts) / 60000);
      const cnt = (d.data||[]).length;
      const fresh = age < 360;
      rows.push({label:'마스터 캐시', value:`${cnt}종목 (${age}분 전)`, color: fresh ? 'var(--buy)' : 'var(--accent)'});
    } else {
      rows.push({label:'마스터 캐시', value:'없음', color:'var(--text3)'});
    }
  }catch(_){
    rows.push({label:'마스터 캐시', value:'파싱 오류', color:'var(--sell)'});
  }

  // 캔들 테스트 (삼성전자 네이버)
  const base = typeof WORKER_BASE !== 'undefined' ? WORKER_BASE : '';
  try{
    const end = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const res = await fetch(base + `/naver/sise?symbol=005930&timeframe=day&start=20250101&end=${end}`, {signal: AbortSignal.timeout(8000)});
    const json = await res.json();
    const candles = json.candles || json.data || [];
    // 누락 체크 — 최근 봉에 close=0 있는지
    const nullClose = candles.filter(c => !c.close || c.close === 0).length;
    rows.push({label:'캔들 품질 (005930)', value:`${candles.length}봉 / 누락${nullClose}`, color: nullClose === 0 ? 'var(--buy)' : 'var(--sell)'});
  }catch(e){
    rows.push({label:'캔들 품질', value:'테스트 실패', color:'var(--sell)'});
  }

  // 재무 데이터 (삼성전자 DART)
  try{
    const res = await fetch(base + '/dart/finance?corp_code=00126380&bsns_year=2025&reprt_code=11011', {signal: AbortSignal.timeout(8000)});
    const json = await res.json();
    const hasData = json.list && json.list.length > 0;
    rows.push({label:'재무 데이터 (DART)', value: hasData ? `${json.list.length}항목` : '데이터 없음', color: hasData ? 'var(--buy)' : 'var(--accent)'});
  }catch(e){
    rows.push({label:'재무 데이터', value:'테스트 실패', color:'var(--sell)'});
  }

  // 코인 풀
  let coinCount = 0;
  try{ coinCount = JSON.parse(localStorage.getItem('ORACLE_COIN')||'[]').length; }catch(_){}
  rows.push({label:'코인 종목풀', value: coinCount > 0 ? `${coinCount}종목` : '없음 (업비트 조회)', color: coinCount > 0 ? 'var(--buy)' : 'var(--accent)'});

  // 해외 풀
  let usCount = 0;
  ['SP500','NDX','DOW','ETF'].forEach(k => {
    try{ usCount += JSON.parse(localStorage.getItem('ORACLE_US_'+k)||'[]').length; }catch(_){}
  });
  rows.push({label:'해외 종목풀', value: usCount > 0 ? `${usCount}종목` : '없음', color: usCount > 0 ? 'var(--buy)' : 'var(--text3)'});

  return _diagCard('데이터 품질', '📊', rows);
}

// ════════════════════════════════════════════════════════════
//  3. 스캔 성능 진단
// ════════════════════════════════════════════════════════════
function _diagScan(){
  const rows = [];

  // Web Worker 지원
  const workerOk = typeof Worker !== 'undefined';
  rows.push({label:'Web Worker', value: workerOk ? '지원됨' : '미지원 (Legacy)', color: _statusColor(workerOk)});

  // Worker 생성 테스트
  if(workerOk){
    try{
      const w = new Worker('sx_scan_worker.js');
      w.terminate();
      rows.push({label:'Worker 생성', value:'성공', color:'var(--buy)'});
    }catch(e){
      rows.push({label:'Worker 생성', value:'실패: ' + e.message, color:'var(--sell)'});
    }
  }

  // 마지막 스캔 시간
  if(typeof _lastScanTime !== 'undefined' && _lastScanTime){
    const ago = Math.round((Date.now() - _lastScanTime.getTime()) / 60000);
    rows.push({label:'마지막 스캔', value:`${ago}분 전`, color: ago < 60 ? 'var(--buy)' : 'var(--text3)'});
  } else {
    rows.push({label:'마지막 스캔', value:'기록 없음', color:'var(--text3)'});
  }

  // 검색 결과 수
  const resultCount = typeof searchResults !== 'undefined' ? searchResults.length : 0;
  rows.push({label:'현재 검색 결과', value:`${resultCount}종목`, color: resultCount > 0 ? 'var(--buy)' : 'var(--text3)'});

  // 활성 필터 수
  const filterCount = typeof activeFilters !== 'undefined' ? activeFilters.length : 0;
  rows.push({label:'활성 필터', value:`${filterCount}개`, color: filterCount > 0 ? 'var(--buy)' : 'var(--text3)'});

  // 병렬 모드
  let parallel = false; try { parallel = localStorage.getItem('SX_PARALLEL_FETCH') === '1'; } catch(_){}
  rows.push({label:'캔들 병렬 로딩', value: parallel ? 'ON' : 'OFF', color: parallel ? 'var(--accent)' : 'var(--text3)'});

  // 레짐 적응형
  let regimeAdapt = true; try { regimeAdapt = localStorage.getItem('SX_REGIME_ADAPT') !== 'off'; } catch(_){}
  rows.push({label:'레짐 적응형', value: regimeAdapt ? 'ON' : 'OFF', color: regimeAdapt ? 'var(--accent)' : 'var(--text3)'});

  // 엔진 로드 상태
  const engineOk = typeof SXE !== 'undefined' && typeof SXE.calcIndicators === 'function';
  rows.push({label:'분석 엔진 (SXE)', value: engineOk ? '로드됨' : '미로드', color: _statusColor(engineOk)});

  const interpOk = typeof SXI !== 'undefined' && typeof SXI.basicInfo === 'function';
  rows.push({label:'해석 엔진 (SXI)', value: interpOk ? '로드됨' : '미로드', color: _statusColor(interpOk)});

  const condOk = typeof SXC !== 'undefined' || typeof checkTechConditions === 'function';
  rows.push({label:'조건 모듈 (SXC)', value: condOk ? '로드됨' : '미로드', color: _statusColor(condOk)});

  return _diagCard('스캔 성능', '⚡', rows);
}

// ════════════════════════════════════════════════════════════
//  4. 사용자 환경 진단
// ════════════════════════════════════════════════════════════
function _diagEnvironment(){
  const rows = [];

  // localStorage 총 사용량
  let totalBytes = 0;
  const keyDetails = [];
  let lsLen = 0;
  try {
    lsLen = localStorage.length;
    for(let i = 0; i < lsLen; i++){
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      const bytes = new Blob([k + v]).size;
      totalBytes += bytes;
      keyDetails.push({key:k, bytes});
    }
  } catch(_){}
  const totalMB = (totalBytes / (1024*1024)).toFixed(2);
  const limitMB = 5; // 일반적 브라우저 한도
  const pct = ((totalBytes / (limitMB*1024*1024)) * 100).toFixed(1);
  rows.push({label:'localStorage 사용량', value:`${totalMB}MB / ~${limitMB}MB (${pct}%)`, color: parseFloat(pct) > 80 ? 'var(--sell)' : parseFloat(pct) > 50 ? 'var(--accent)' : 'var(--buy)'});

  // 키 수
  rows.push({label:'저장된 키 수', value:`${lsLen}개`, color:'var(--text)'});

  // 대형 키 TOP 5
  keyDetails.sort((a,b) => b.bytes - a.bytes);
  const top5 = keyDetails.slice(0,5);
  top5.forEach((d,i) => {
    const kb = (d.bytes/1024).toFixed(1);
    rows.push({label:`#${i+1} ${d.key.length > 25 ? d.key.slice(0,25)+'...' : d.key}`, value:`${kb}KB`, color:'var(--text2)'});
  });

  // 만료 캐시 확인 (ts 기반)
  let expiredCount = 0;
  const now = Date.now();
  const cacheKeys = ['SX_SCR_STOCK_MASTER','SX_MARKET_INDEX','SX_MACRO_CONTEXT'];
  cacheKeys.forEach(k => {
    try{
      const d = JSON.parse(localStorage.getItem(k)||'null');
      if(d && d.ts){
        const age = now - d.ts;
        if(age > 6*3600*1000) expiredCount++;
      }
    }catch(_){}
  });
  rows.push({label:'만료된 캐시', value: expiredCount > 0 ? `${expiredCount}개` : '없음', color: expiredCount > 0 ? 'var(--accent)' : 'var(--buy)'});

  // 설정 충돌 검사
  let conflicts = [];
  try {
    // 안전필터 키 존재 확인
    const sfKey = localStorage.getItem('SX_SAFETY_FILTER');
    if(sfKey){
      try{ JSON.parse(sfKey); }catch(_){ conflicts.push('안전필터 JSON 깨짐'); }
    }
    // 프리셋 키 확인
    const presetKey = localStorage.getItem('SX_SCR_PRESETS');
    if(presetKey){
      try{ JSON.parse(presetKey); }catch(_){ conflicts.push('프리셋 JSON 깨짐'); }
    }
    // 검색 결과 키 확인
    const srKey = localStorage.getItem('SX_SCR_SEARCH_RESULTS');
    if(srKey){
      try{ JSON.parse(srKey); }catch(_){ conflicts.push('검색결과 JSON 깨짐'); }
    }
  } catch(_){}

  if(conflicts.length){
    rows.push({label:'설정 충돌', value: conflicts.join(', '), color:'var(--sell)'});
  } else {
    rows.push({label:'설정 충돌', value:'없음', color:'var(--buy)'});
  }

  // 현재 시장/TF
  const mkt = typeof currentMarket !== 'undefined' ? currentMarket : '?';
  const tf = typeof currentTF !== 'undefined' ? currentTF : '?';
  rows.push({label:'현재 시장/TF', value:`${mkt} / ${tf}`, color:'var(--text)'});

  // 브라우저 정보
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  rows.push({label:'환경', value: isMobile ? '모바일' : 'PC', color:'var(--text)'});

  return _diagCard('사용자 환경', '🖥️', rows);
}
// ════════════════════════════════════════════════════════════
//  5. 프로젝트 C 정합 진단 (S103-fix7 Phase3-B-0)
//  A(분석) + B(BT) = C(_svVerdict)
//  모든 UI 판정이 C 단일 원천에서만 파생되는지 관찰
//  ※ 관찰 전용 — Phase 3-B-3 이후 가드(자동 숨김) 전환 예정
// ════════════════════════════════════════════════════════════

// ── 헬퍼: 레거시 판정과 C의 정합성 체크 (moderate 기준) ──
// 반환: 'ok' (완벽 정합) / 'warn' (방향성만 일치) / 'fail' (정반대 충돌) / 'na' (판정 불가)
function _isConsistentWithC(legacyAction, svVerdict){
  if(!svVerdict || !svVerdict.action) return 'na';
  if(!legacyAction) return 'na';

  const cAction = svVerdict.action;
  if(cAction === legacyAction) return 'ok'; // 완벽 동일

  // C 9종 → 방향성 매핑
  const _cBullish = ['매수','관심','보유 유지'].includes(cAction);
  const _cBearish = ['회피','즉시 청산','청산 검토','매도 완료'].includes(cAction);
  const _cNeutral = ['관망','청산 준비'].includes(cAction); // 경계

  // _btAction 4종 → 방향성 매핑 (점수 기반 레거시)
  //   '진입 적기' = es≥60 & bs≥60 (매수)
  //   '단기급등 주의' = es≥60 & bs<60 (경계)
  //   '관심 등록' = es<60 & bs≥60 (경계)
  //   '회피' = es<60 & bs<60 (회피)
  const _legBullish = ['진입 적기'].includes(legacyAction);
  const _legBearish = ['회피'].includes(legacyAction);
  const _legNeutral = ['단기급등 주의','관심 등록'].includes(legacyAction);

  // _buildVerdict 레거시 5종 (Phase 3-A-3 이전 버전과의 하위 호환용)
  //   '보유 확인','진입 검토' (bullish)
  //   '관심' (neutral)
  //   '과열 주의','관망' (bearish/neutral)
  if(['보유 확인','진입 검토'].includes(legacyAction)){ if(_cBullish) return 'warn'; if(_cBearish) return 'fail'; return 'warn'; }
  if(legacyAction === '과열 주의'){ if(_cBearish || _cNeutral) return 'warn'; if(_cBullish) return 'fail'; return 'warn'; }

  // 정반대 충돌 = fail
  if(_cBullish && _legBearish) return 'fail';
  if(_cBearish && _legBullish) return 'fail';

  // 방향성 일치 (부분 정합) = warn
  if(_cBullish && _legBullish) return 'warn';
  if(_cBearish && _legBearish) return 'warn';
  if(_cNeutral || _legNeutral) return 'warn';

  return 'warn'; // fallback
}

// ── 헬퍼: 정합 상태 → 표시용 변환 ──
function _diagCStatus(status, legacyAction, cAction){
  switch(status){
    case 'ok':   return {value: `✓ ${legacyAction}`, color:'var(--buy)'};
    case 'warn': return {value: `⚠ ${legacyAction} ↔ ${cAction}`, color:'var(--accent)'};
    case 'fail': return {value: `✗ ${legacyAction} ↔ ${cAction}`, color:'var(--sell)'};
    case 'na':   return {value: '판정 불가', color:'var(--text3)'};
    default:     return {value: '알 수 없음', color:'var(--text3)'};
  }
}

// ── 헬퍼: Layer 1 불변성 확인 ──
// Layer 1 = 엔진(A) + BT(B) 계산 함수들. C 때문에 변하지 않았는지 기본 가용성 체크
function _checkLayerSeparation(){
  const _engineOk = typeof SXE !== 'undefined' && typeof SXE.runBtEngine === 'function' && typeof SXE.calcIndicators === 'function';
  // S-BUGFIX: SXC 네임스페이스 이전 후 구버전 가드 잔존 버그 수정 (이전: typeof supervisorJudge — 항상 false)
  const _cEngineOk = typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function' && typeof SXC.unifiedVerdict === 'function';
  return { layer1: _engineOk, layerC: _cEngineOk };
}

// ── 메인: 프로젝트 C 정합 진단 ──
// ── 메인: 프로젝트 C 정합 진단 (Phase 3-B-7.1: SXC 위임) ──
// 이전(v1.2b)엔 이 함수가 9개 체크를 직접 수행했으나, Phase 3-B-7.1에서
// sx_project_c.js의 SXC.checkConsistency / SXC.renderConsistencyHTML로 이전.
// 여기서는 _diagCard 형식 카드를 만들기 위한 얇은 래퍼만 유지.
function _diagProjectC(){
  // SXC 가용성 체크 (로드 순서 안전장치)
  if(typeof SXC === 'undefined' || typeof SXC.checkConsistency !== 'function'){
    return _diagCard('프로젝트 C 정합 🎯', '🎯', [
      { label: 'SXC 모듈', value: '✗ sx_project_c.js 로드 안됨', color: 'var(--sell)' }
    ]);
  }

  // SXC.checkConsistency 호출 — stock은 currentAnalStock, fallback은 searchResults
  const _stock = typeof currentAnalStock !== 'undefined' && currentAnalStock ? currentAnalStock : null;
  const _sr = typeof searchResults !== 'undefined' ? searchResults : [];
  const result = SXC.checkConsistency(_stock, { searchResults: _sr });

  // _diagCard에 row 배열 그대로 전달 (표시 형식 동일)
  return _diagCard('프로젝트 C 정합 🎯', '🎯', result.rows);
}


// ════════════════════════════════════════════════════════════
//  S107 Phase 3-B-9a: 데이터 확장 진단 (Reactive Loading 상태 + 최근 로그)
// ════════════════════════════════════════════════════════════
//  목적: 모바일 환경에서 console.log 접근이 어려워 진단 탭으로 가시화
//  수집 대상: [S107-9a] [fetchExt] 태그가 있는 로그 (최근 100개)
//  표시:
//    - 현재 분석 종목의 확장 상태 (플래그, BT 거래 수, 시장 지원 여부)
//    - localStorage 캐시 현황 (sx_ext_* 키 개수)
//    - 최근 로그 (시간 역순)
// ════════════════════════════════════════════════════════════

// 전역 로그 버퍼 (자동 초기화)
if(typeof window !== 'undefined' && !window._s107Logs){
  window._s107Logs = [];
  window._s107MaxLogs = 100;

  // console.log/warn/error 후킹 — [S107-9a] 또는 [fetchExt] 태그 로그만 수집
  const _origLog = console.log.bind(console);
  const _origWarn = console.warn.bind(console);
  const _origErr = console.error.bind(console);
  const _s107Capture = (level, args) => {
    const msg = args.map(a => {
      if(typeof a === 'string') return a;
      try{ return JSON.stringify(a); }catch(_){ return String(a); }
    }).join(' ');
    if(/\[S107-9a|\[fetchExt|\[runAnalysis\] BT 거래|\[runAnalysis\] 확장|\[runAnalysis\] 자동 확장/.test(msg)){
      window._s107Logs.push({
        ts: Date.now(),
        level: level,
        msg: msg
      });
      if(window._s107Logs.length > window._s107MaxLogs){
        window._s107Logs.shift();
      }
    }
  };
  console.log = function(...args){ _s107Capture('log', args); _origLog(...args); };
  console.warn = function(...args){ _s107Capture('warn', args); _origWarn(...args); };
  console.error = function(...args){ _s107Capture('error', args); _origErr(...args); };
}

function _diagDataExtension(){
  const rows = [];

  // 1. 현재 분석 종목 상태
  const _stock = typeof currentAnalStock !== 'undefined' && currentAnalStock ? currentAnalStock : null;
  if(_stock){
    rows.push({
      label: '현재 종목',
      value: `${_stock.name || _stock.code} (${_stock._mkt || _stock.market || 'N/A'})`,
      color: 'var(--accent)'
    });
    const _ext = !!_stock._analCandlesExtended;
    rows.push({
      label: '확장 플래그',
      value: _ext ? '✓ 확장됨' : '미확장',
      color: _ext ? 'var(--buy)' : 'var(--text3)'
    });
    const _btTrades = _stock._btResult?.totalTrades ?? 0;
    const _btMin = typeof BT_MIN_TRADES !== 'undefined' ? BT_MIN_TRADES : 10;
    rows.push({
      label: 'BT 거래 수',
      value: `${_btTrades}회 / 최소 ${_btMin}`,
      color: _btTrades >= _btMin ? 'var(--buy)' : 'var(--sell)'
    });
    const _mkt = _stock._mkt || _stock.market || (typeof currentMarket !== 'undefined' ? currentMarket : '');
    const _supported = (_mkt === 'coin' || _mkt === 'kr');
    rows.push({
      label: '시장 확장 지원',
      value: _supported ? `✓ ${_mkt}` : `✗ ${_mkt} (미지원)`,
      color: _supported ? 'var(--buy)' : 'var(--sell)'
    });
  } else {
    rows.push({
      label: '현재 종목',
      value: '분석탭 진입 전',
      color: 'var(--text3)'
    });
  }

  // 2. localStorage 캐시 현황
  let _cacheCount = 0;
  let _cacheSize = 0;
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('sx_ext_')){
        _cacheCount++;
        const v = localStorage.getItem(k) || '';
        _cacheSize += v.length;
      }
    }
  }catch(_){}
  rows.push({
    label: '확장 캐시',
    value: `${_cacheCount}개 (${(_cacheSize/1024).toFixed(1)}KB)`,
    color: _cacheCount > 0 ? 'var(--accent)' : 'var(--text3)'
  });

  // 3. fetchCandlesExtended 함수 존재 확인
  const _fnOk = typeof fetchCandlesExtended === 'function';
  rows.push({
    label: '확장 함수',
    value: _fnOk ? '✓ 로드됨' : '✗ 미로드',
    color: _fnOk ? 'var(--buy)' : 'var(--sell)'
  });

  // 4. 최근 로그 (시간 역순, 최대 20개)
  const _logs = (typeof window !== 'undefined' && window._s107Logs) || [];
  if(_logs.length > 0){
    rows.push({
      label: '━━━ 최근 로그 ━━━',
      value: `총 ${_logs.length}개`,
      color: 'var(--text3)'
    });
    const _recentLogs = _logs.slice(-20).reverse();
    _recentLogs.forEach(l => {
      const dt = new Date(l.ts);
      const tStr = `${(dt.getHours()+'').padStart(2,'0')}:${(dt.getMinutes()+'').padStart(2,'0')}:${(dt.getSeconds()+'').padStart(2,'0')}`;
      const clr = l.level === 'error' ? 'var(--sell)' : l.level === 'warn' ? '#ff8c00' : 'var(--text2)';
      // 긴 로그는 줄바꿈
      const shortMsg = l.msg.length > 90 ? l.msg.slice(0, 90) + '…' : l.msg;
      rows.push({
        label: tStr,
        value: shortMsg,
        color: clr
      });
    });
  } else {
    rows.push({
      label: '최근 로그',
      value: '기록 없음 (아직 확장 미발생)',
      color: 'var(--text3)'
    });
  }

  // 로그 클리어 버튼은 카드 밖으로 — 수동 추가
  const cardHTML = _diagCard('데이터 확장 진단 (Phase 3-B-9a)', '📈', rows);
  const clearBtnHTML = `<div style="text-align:right;margin-top:-6px;margin-bottom:10px">
    <button onclick="if(window._s107Logs){window._s107Logs.length=0;runAllDiag();}" style="padding:4px 10px;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text2);cursor:pointer">로그 지우기</button>
  </div>`;
  return cardHTML + clearBtnHTML;
}
