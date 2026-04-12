// ════════════════════════════════════════════════════════════
//  SIGNAL X — Diagnostic Module v1.1 <!-- S78 -->
//  S78: SX_REGIME_ADAPT 비교 수정 ('1'→'off' 기반)
//  4개 카테고리: 시스템 상태 / 데이터 품질 / 스캔 성능 / 사용자 환경
//  sx_diag.js — sx_screener.html 설정탭에서 호출
// ════════════════════════════════════════════════════════════

// ── 진단 패널 열기/닫기 ──
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
  const parallel = localStorage.getItem('SX_PARALLEL_FETCH') === '1';
  rows.push({label:'캔들 병렬 로딩', value: parallel ? 'ON' : 'OFF', color: parallel ? 'var(--accent)' : 'var(--text3)'});

  // 레짐 적응형
  const regimeAdapt = localStorage.getItem('SX_REGIME_ADAPT') !== 'off';
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
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    const v = localStorage.getItem(k);
    const bytes = new Blob([k + v]).size;
    totalBytes += bytes;
    keyDetails.push({key:k, bytes});
  }
  const totalMB = (totalBytes / (1024*1024)).toFixed(2);
  const limitMB = 5; // 일반적 브라우저 한도
  const pct = ((totalBytes / (limitMB*1024*1024)) * 100).toFixed(1);
  rows.push({label:'localStorage 사용량', value:`${totalMB}MB / ~${limitMB}MB (${pct}%)`, color: parseFloat(pct) > 80 ? 'var(--sell)' : parseFloat(pct) > 50 ? 'var(--accent)' : 'var(--buy)'});

  // 키 수
  rows.push({label:'저장된 키 수', value:`${localStorage.length}개`, color:'var(--text)'});

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
