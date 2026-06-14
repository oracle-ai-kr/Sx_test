// ════════════════════════════════════════════════════════════
//  SIGNAL X — Diagnostic Module v1.4
//  5개 카테고리: 시스템 상태 / 데이터 품질 / 스캔 성능 / 환경 / 프로젝트 C 정합
//  sx_diag.js — sx_screener.html 설정탭에서 호출
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// [S171] 로그 캡처 시스템 — 모바일 환경 점검용 (PC 콘솔 대체)
//   옵티마이저(S170)에서 시작했으나 sx_diag.js로 이전:
//     ① 옵티마이저 진입 전 로그도 캡처 가능 (sx_diag.js가 더 일찍 로드)
//     ② 시스템 진단 화면에서도 로그 확인/저장 가능
//     ③ 옵티마이저 📋 Log 버튼은 그대로 유지 (_optShowLogModal 별칭)
//
//   진입점:
//     window._optShowLogModal() — 옵티마이저 📋 Log 버튼이 호출
//     window.openLogModal()     — 시스템 진단 카드 [📋 로그 보기] 버튼이 호출
//     window.downloadLogFile()  — 시스템 진단 카드 [💾 파일 저장] 버튼이 호출
//
//   동작:
//   [S171] 시스템 로그 후킹 — _sxLogBuffer (별도 버퍼, 500줄 FIFO)
//     - 파일 로드 즉시 console.log/warn/error 후킹 시작
//     - 메모리 버퍼에 최근 500줄 보관 (FIFO)
//     - 원본 console 동작은 그대로 유지 (PC 디버깅 영향 없음)
//   참고: window._s107Logs는 sx_screener.html 20~38행이 별도로 후킹 (태그 필터링 버전)
// ════════════════════════════════════════════════════════════
const SX_LOG_BUFFER_MAX = 500;
let _sxLogBuffer = []; // [{time, level, msg}, ...]
let _sxLogHookInstalled = false;

function _sxInstallLogHook(){
  if(_sxLogHookInstalled) return;
  _sxLogHookInstalled = true;

  const _origLog = console.log;
  const _origWarn = console.warn;
  const _origError = console.error;

  const _formatArg = (a) => {
    if(typeof a === 'string') return a;
    if(a instanceof Error) return a.stack || a.message || String(a);
    try { return JSON.stringify(a); } catch(_) { return String(a); }
  };

  const _capture = (level, args) => {
    try {
      const msg = Array.from(args).map(_formatArg).join(' ');
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      _sxLogBuffer.push({ time, level, msg });
      if(_sxLogBuffer.length > SX_LOG_BUFFER_MAX){
        _sxLogBuffer.splice(0, _sxLogBuffer.length - SX_LOG_BUFFER_MAX);
      }
    } catch(_){}
  };

  console.log = function(){
    _capture('log', arguments);
    _origLog.apply(console, arguments);
  };
  console.warn = function(){
    _capture('warn', arguments);
    _origWarn.apply(console, arguments);
  };
  console.error = function(){
    _capture('error', arguments);
    _origError.apply(console, arguments);
  };

  console.log('[S171] 로그 캡처 시스템 활성화 (sx_diag.js)');
}

// 필터 모드 — true면 옵티마이저/캔들 관련 로그만 표시
let _sxLogFilterEnabled = true;
const SX_LOG_FILTER_KEYWORDS = [
  // 패치 마커
  'S168', 'S169', 'S170', 'S171', 'S172', 'S173', 'S174', 'S175', 'S176',
  'S109', 'S113', 'S114', 'S115', 'S119', 'S162',
  // 함수/모듈 식별자
  'fetchExt', 'fetchCandles', '[opt', '_opt',
  'btFetch', 'currentMarket',
  // 한글 키워드
  '[엔진', 'BT', '봉', '캔들', '시장', '확장', '백테스트', '검증',
  '단일값', '최소값', '결과보기', '최고기록', '파라미터',
  '탐색', '베스트', '후보', '필터'
];

function _sxFilterLogLine(line){
  if(!_sxLogFilterEnabled) return true;
  const msg = line.msg || '';
  // [S241] 시리얼 태그 자동 통과 — [S###] 패턴 정규식 매칭
  //   배경: 신규 패치 시리얼([S240], [S241], 이후 [S242]…)을 추가할 때마다 SX_LOG_FILTER_KEYWORDS를
  //        수동으로 갱신해야 했음 → 갱신 누락 시 로그가 필터에 차단되어 진단 불가.
  //   해결: [S###] (3자리 숫자) 패턴이면 무조건 통과 → 신규 시리얼 자동 인식.
  //        한글 키워드 리스트는 보존 (시리얼 없는 함수/모듈 식별자용).
  if(/\[S\d{3}\]/.test(msg)) return true;
  for(const kw of SX_LOG_FILTER_KEYWORDS){
    if(msg.includes(kw)) return true;
  }
  return false;
}

// 진동 헬퍼 (sx_screener.html의 _sxVib가 있으면 사용)
function _sxLogVib(p){
  try { if(typeof _sxVib === 'function') _sxVib(p); else if(navigator.vibrate) navigator.vibrate(p); } catch(_){}
}

// ════════════════════════════════════════════════════════════
// [S171] 로그 모달 표시
// ════════════════════════════════════════════════════════════
function openLogModal(){
  _sxLogVib(10);
  // 기존 모달 있으면 제거
  const existing = document.getElementById('sxLogOverlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sxLogOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:10px';
  overlay.addEventListener('click', e => { if(e.target === overlay) closeLogModal(); });

  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:10px;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border,#ddd)">
        <h4 style="margin:0;font-size:14px;color:var(--text,#222)">📋 시스템 로그</h4>
        <span style="font-size:18px;cursor:pointer;color:var(--text3,#999);padding:0 6px" onclick="closeLogModal()">✕</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-bottom:1px solid var(--border,#ddd);background:var(--surface2,#f5f5f5);flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2,#666);cursor:pointer">
          <input type="checkbox" id="sxLogFilterChk" ${_sxLogFilterEnabled?'checked':''} onchange="toggleLogFilter()" style="width:14px;height:14px">
          <span>옵티마이저/캔들만</span>
        </label>
        <span style="margin-left:auto;font-size:10px;color:var(--text3,#999)" id="sxLogCount">총 ${_sxLogBuffer.length}줄</span>
      </div>
      <div id="sxLogContent" style="flex:1;overflow-y:auto;padding:8px 12px;background:#1e1e1e;color:#d4d4d4;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.5;min-height:300px">
        로딩 중...
      </div>
      <div style="display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--border,#ddd);flex-wrap:wrap">
        <button onclick="refreshLogContent()" style="flex:1;min-width:70px;padding:8px;font-size:11px;border-radius:5px;border:1px solid var(--border,#ddd);background:var(--surface2,#f0f0f0);color:var(--text,#222);cursor:pointer">🔄 새로고침</button>
        <button onclick="downloadLogFile()" style="flex:1;min-width:70px;padding:8px;font-size:11px;border-radius:5px;border:1px solid var(--accent,#2563eb);background:var(--accent,#2563eb);color:#fff;cursor:pointer;font-weight:600">💾 파일 저장</button>
        <button onclick="clearLogBuffer()" style="flex:1;min-width:70px;padding:8px;font-size:11px;border-radius:5px;border:1px solid var(--border,#ddd);background:var(--surface2,#f0f0f0);color:var(--text,#222);cursor:pointer">🗑️ 지우기</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  // [S213] 모바일 뒤로가기 지원 — popstate에서 sxLogOverlay 발견 시 remove
  try{ history.pushState({view:'logModal'}, ''); }catch(_){}
  refreshLogContent();
}

function closeLogModal(){
  _sxLogVib(8);
  const overlay = document.getElementById('sxLogOverlay');
  if(overlay) overlay.remove();
}

function refreshLogContent(){
  const contentEl = document.getElementById('sxLogContent');
  const countEl = document.getElementById('sxLogCount');
  if(!contentEl) return;

  const filtered = _sxLogBuffer.filter(_sxFilterLogLine);
  if(countEl){
    countEl.textContent = _sxLogFilterEnabled
      ? `필터 ${filtered.length}줄 / 전체 ${_sxLogBuffer.length}줄`
      : `총 ${_sxLogBuffer.length}줄`;
  }

  if(filtered.length === 0){
    contentEl.innerHTML = '<div style="color:#888;text-align:center;padding:40px 0">로그 없음<br><span style="font-size:10px">옵티마이저/캔들 갱신을 실행하면 로그가 표시됩니다</span></div>';
    return;
  }

  // HTML escape
  const _esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const lines = filtered.map(line => {
    const colorMap = { log: '#d4d4d4', warn: '#f0c674', error: '#e06c75' };
    const color = colorMap[line.level] || '#d4d4d4';
    const levelTag = line.level === 'log' ? '' : `<span style="color:${color};font-weight:600">[${line.level.toUpperCase()}] </span>`;
    return `<div style="white-space:pre-wrap;word-break:break-all;margin-bottom:2px"><span style="color:#888">[${line.time}]</span> ${levelTag}<span style="color:${color}">${_esc(line.msg)}</span></div>`;
  }).join('');

  contentEl.innerHTML = lines;
  contentEl.scrollTop = contentEl.scrollHeight;
}

function toggleLogFilter(){
  const chk = document.getElementById('sxLogFilterChk');
  _sxLogFilterEnabled = chk ? chk.checked : true;
  refreshLogContent();
}

// [S224] async 변환 — sxConfirm 사용
async function clearLogBuffer(){
  const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
  if(!await _conf('로그 버퍼를 모두 비울까요?\n(저장 안 한 로그는 사라집니다)')) return;
  _sxLogVib(15);
  _sxLogBuffer = [];
  console.log('[S171] 로그 버퍼 초기화');
  refreshLogContent();
}

// ════════════════════════════════════════════════════════════
// [S171] 파일 저장 — 텍스트 파일 다운로드
//   파일명: oracle_log_YYYY-MM-DD_HH-MM-SS.txt
//   내용: 헤더(메타정보) + 로그 본문
// ════════════════════════════════════════════════════════════
function downloadLogFile(){
  _sxLogVib(20);
  const filtered = _sxLogBuffer.filter(_sxFilterLogLine);
  if(filtered.length === 0){
    if(typeof toast === 'function') toast('저장할 로그가 없습니다');
    return;
  }

  // 메타정보
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  const tsHuman = now.toLocaleString('ko-KR');

  const _safe = (fn, fallback) => { try { return fn() ?? fallback; } catch(_) { return fallback; } };
  const meta = {
    저장시각: tsHuman,
    글로벌시장: _safe(() => currentMarket, 'unknown'),
    글로벌TF: _safe(() => currentTF, 'unknown'),
    분석종목: _safe(() => (currentAnalStock && (currentAnalStock.name || currentAnalStock.code)) || '', ''),
    옵티마이저시장: _safe(() => window._optMarket, 'unknown'),
    필터: _sxLogFilterEnabled ? '옵티마이저/캔들만' : '전체',
    브라우저: _safe(() => navigator.userAgent.substring(0, 100), ''),
    URL: _safe(() => location.href, ''),
  };

  let content = '';
  content += '==============================================\n';
  content += 'Oracle 시스템 로그\n';
  content += '==============================================\n';
  Object.entries(meta).forEach(([k, v]) => {
    content += `${k}: ${v}\n`;
  });
  content += '==============================================\n';
  content += `로그 ${filtered.length}줄 (전체 버퍼: ${_sxLogBuffer.length}줄)\n`;
  content += '==============================================\n\n';

  filtered.forEach(line => {
    const tag = line.level === 'log' ? '' : `[${line.level.toUpperCase()}] `;
    content += `[${line.time}] ${tag}${line.msg}\n`;
  });

  // 다운로드
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oracle_log_${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if(typeof toast === 'function') toast(`✅ 로그 저장: oracle_log_${ts}.txt`);
  } catch(e) {
    console.error('[S171] 파일 저장 실패:', e);
    if(typeof toast === 'function') toast('❌ 파일 저장 실패');
  }
}

// 즉시 후킹 활성화 (sx_diag.js 로드 시점 = 모듈 로드 가장 빠른 시점)
_sxInstallLogHook();

// 전역 노출
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;
window.refreshLogContent = refreshLogContent;
window.toggleLogFilter = toggleLogFilter;
window.clearLogBuffer = clearLogBuffer;
window.downloadLogFile = downloadLogFile;
// [S171] 옵티마이저 📋 Log 버튼이 호출하는 별칭 (이전 _optShowLogModal 호환)
window._optShowLogModal = openLogModal;

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
  // [진단 다운로드용] 카드 HTML과 별개로 텍스트 변환용 rows 데이터도 모음
  //   각 진단 함수가 _diagCard()로 HTML 만들면서 동시에 window._diagRawData에 push
  window._diagRawData = [];

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

  // 7. [S171] 시스템 로그 (모바일 콘솔 대체 — 점검용)
  try{ results.push(_diagLog()); }catch(e){ results.push(_diagError('시스템 로그', e)); }

  // 8. [S328] 적정주가 평가 진단 (Phase 2 historical PER 추적용)
  try{ results.push(_diagValuation()); }catch(e){ results.push(_diagError('적정주가 평가', e)); }

  // 9. [S373] 전광판 maAlign 누락 추적 — "이평선 (?)" 디버그용
  try{ results.push(_diagMaAlign()); }catch(e){ results.push(_diagError('이평선 진단', e)); }

  // 10. [S452] 지표 정합 점검 — EOM 라벨 수정 검증 + 섹터 순위 매핑 + ADX/DI 값 (모바일 console 대체)
  try{ results.push(_diagIndicators()); }catch(e){ results.push(_diagError('지표 정합 점검', e)); }

  body.innerHTML = results.join('');
  btn.disabled = false; btn.textContent = '전체 검사';
  // [진단 다운로드] 결과 시간 저장 — 파일명에 활용
  window._diagLastRunAt = Date.now();
}

// ── 결과 카드 HTML 헬퍼 ──
function _diagCard(title, icon, rows){
  // [진단 다운로드] HTML 만들면서 동시에 raw 데이터 저장 — 다운로드 시 텍스트 변환용
  if (window._diagRawData) {
    window._diagRawData.push({ title, icon, rows: rows.map(r => ({ label: r.label, value: r.value })) });
  }
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
  // KRX 응답 시간 임계값 (현재): 4s 양호(캐시 히트) / 10s 보통(캐시 미스 정상) / 10s+ 느림
  //   KRX는 2400+ 종목 일괄 조회라 일반 단일 API보다 느림 — 임계값 별도 적용 필요
  //   〔이력〕 [S214] KRX 별도 임계값 도입 → [S215] 캐시 미스 5~8s 반영 →
  //     [S216] 모바일 RTT 200~300ms 환경 고려하여 8s+도 정상 범위 인정 (수정됨)
  const _krxColor = (ms) => ms < 4000 ? 'var(--buy)' : ms < 10000 ? 'var(--accent)' : 'var(--sell)';
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/krx/market-cap?market=STK', {signal: AbortSignal.timeout(15000)});
    const ms = Math.round(performance.now() - t0);
    const json = await res.json().catch(()=>null);
    const cnt = (json && json.items||[]).length;
    const fb = json && json.fallback ? ' (폴백)' : '';
    if (cnt > 0) {
      // [S216] 4초 초과면 캐시 미스 안내 (10초까진 정상 범위)
      const _hint = (ms >= 4000 && ms < 10000) ? ' (캐시 미스)' : '';
      rows.push({label:'KRX 시세', value:`${cnt}종목 ${ms}ms${fb}${_hint}`, color: _krxColor(ms)});
    } else {
      const err = json && json.error ? ` — ${json.error}` : '';
      rows.push({label:'KRX 시세', value:`0종목 ${ms}ms${fb}${err}`, color:'var(--sell)'});
    }
  }catch(e){
    rows.push({label:'KRX 시세', value:'실패: ' + (e.message||'네트워크'), color:'var(--sell)'});
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

  // [S391] 네이버 수급 (외국인/기관) — 순매수 파싱 진단: 실제 응답 키/구조 확인용
  try{
    const t0 = performance.now();
    const res = await fetch(base + `/naver/investor?symbol=005930&pageSize=3`, {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    const j = await res.json();
    const dd = j.data;
    let irows = [];
    if(dd && dd.result && Array.isArray(dd.result.trendList)) irows = dd.result.trendList;
    else if(dd && Array.isArray(dd.trendList)) irows = dd.trendList;
    else if(Array.isArray(dd)) irows = dd;
    else if(dd && Array.isArray(dd.result)) irows = dd.result;
    const src = j.source || '?';
    if(irows.length){
      rows.push({label:'네이버 수급', value:`${irows.length}건 ${ms}ms · src=${src}`, color:_msColor(ms)});
      rows.push({label:'  └ row 키', value:Object.keys(irows[0]).join(',').slice(0,140), color:'var(--text3)'});
    } else {
      rows.push({label:'네이버 수급', value:`rows 파싱 실패 · src=${src}`, color:'var(--sell)'});
      rows.push({label:'  └ data 키', value:(dd&&typeof dd==='object'?Object.keys(dd).join(','):String(dd)).slice(0,140), color:'var(--accent)'});
    }
  }catch(e){
    rows.push({label:'네이버 수급', value:'실패: ' + (e.message||'네트워크'), color:'var(--sell)'});
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
    // [S214] 응답 구조 안전 파싱 — 업비트는 보통 배열, 워커 가공 시 {data:[...]} 또는 {error:'...'}
    //   〔이력〕 이전 (json.data||json||[]).length는 json이 빈 객체 {}일 때 undefined 반환되는 버그 (수정됨)
    let cnt = 0;
    if (Array.isArray(json)) cnt = json.length;
    else if (Array.isArray(json?.data)) cnt = json.data.length;
    else if (Array.isArray(json?.markets)) cnt = json.markets.length;
    const ok = cnt > 0 && res.ok;
    rows.push({label:'업비트 API', value:`${cnt}마켓 ${ms}ms`, color: ok ? _msColor(ms) : 'var(--sell)'});
  }catch(e){
    rows.push({label:'업비트 API', value:'실패', color:'var(--sell)'});
  }

  // KIS 상태
  const kisEnabled = typeof window._kisEnabled !== 'undefined' && window._kisEnabled;
  rows.push({label:'KIS API', value: kisEnabled ? '연동됨' : '미연결', color: kisEnabled ? 'var(--buy)' : 'var(--text3)'});

  // DART
  // [진단 강화] 워커 /dart/disclosure는 stock_code 사용. 실패 시 응답 본문에 {error, status} 들어있음
  try{
    const t0 = performance.now();
    const res = await fetch(base + '/dart/disclosure?stock_code=005930&page_count=1', {signal: AbortSignal.timeout(8000)});
    const ms = Math.round(performance.now() - t0);
    if (res.ok) {
      rows.push({label:'DART 공시', value:`OK ${ms}ms`, color: _msColor(ms)});
    } else {
      let detail = '';
      try { const eb = await res.json(); detail = eb.status ? ` (${eb.status}: ${eb.error||''})` : ` (${eb.error||'HTTP '+res.status})`; } catch(_) { detail = ` (HTTP ${res.status})`; }
      rows.push({label:'DART 공시', value:`실패 ${ms}ms${detail}`, color:'var(--sell)'});
    }
  }catch(e){
    rows.push({label:'DART 공시', value:'실패: ' + (e.message||'네트워크'), color:'var(--sell)'});
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
    // [S214] 누락 체크 — 네이버 워커 응답은 한글 필드(종가)를 사용 → c.close ?? c['종가'] ?? c.Close
    //   〔이력〕 이전: c.close만 봐서 정상 데이터도 모두 누락으로 잡혔음 (수정됨)
    const _close = (c) => c.close ?? c['종가'] ?? c.Close;
    const nullClose = candles.filter(c => { const v = _close(c); return v == null || v === 0; }).length;
    rows.push({label:'캔들 품질 (005930)', value:`${candles.length}봉 / 누락${nullClose}`, color: nullClose === 0 ? 'var(--buy)' : 'var(--sell)'});
  }catch(e){
    rows.push({label:'캔들 품질', value:'테스트 실패', color:'var(--sell)'});
  }

  // 재무 데이터 (삼성전자 DART)
  // [진단 강화] 워커는 stock_code 파라미터 사용, 응답은 items 배열
  // 실패 응답이면 워커가 {error, status, hint} 형태 JSON 반환 → 정확한 사유 표시
  try{
    const res = await fetch(base + '/dart/finance?stock_code=005930&year=2024&report=annual', {signal: AbortSignal.timeout(8000)});
    const json = await res.json().catch(()=>null);
    if (res.ok && json && json.items && json.items.length > 0) {
      rows.push({label:'재무 데이터 (DART)', value:`${json.items.length}항목`, color:'var(--buy)'});
    } else if (json && json.error) {
      // 워커 실패 응답: {error, status (DART 코드), hint}
      const detail = json.status ? `(${json.status}) ${json.error}` : json.error;
      rows.push({label:'재무 데이터 (DART)', value:`실패: ${detail}`, color:'var(--sell)'});
    } else {
      rows.push({label:'재무 데이터 (DART)', value:`데이터 없음 (HTTP ${res.status})`, color:'var(--accent)'});
    }
  }catch(e){
    rows.push({label:'재무 데이터', value:'테스트 실패: ' + (e.message||'네트워크'), color:'var(--sell)'});
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
  // [S215] 메모리 변수가 비어있어도 localStorage 폴백으로 읽음 (새로고침 후에도 표시)
  let _scanDt = (typeof _lastScanTime !== 'undefined' && _lastScanTime) ? _lastScanTime : null;
  if(!_scanDt){
    try{
      const _iso = localStorage.getItem('SX_LAST_SCAN_TIME');
      if(_iso) _scanDt = new Date(_iso);
    }catch(_){}
  }
  if(_scanDt && !isNaN(_scanDt.getTime())){
    const ago = Math.round((Date.now() - _scanDt.getTime()) / 60000);
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
// [BUGFIX] dead code 제거 — _isConsistentWithC, _diagCStatus, _checkLayerSeparation 3개 함수 (~60줄)
//   이전(v1.2b)엔 _diagProjectC가 직접 호출했으나, Phase 3-B-7.1에서 SXC.checkConsistency로 위임 후 미정리.
//   sx_project_c.js에 동일한 함수 존재 (이중 정의 위험) — 한쪽만 수정 시 미스매치 가능했음. 정리 완료.

// ── 메인: 프로젝트 C 정합 진단 (Phase 3-B-7.1: SXC 위임) ──
// 이전(v1.2b)엔 이 함수가 9개 체크를 직접 수행했으나, Phase 3-B-7.1에서
// sx_project_c.js의 SXC.checkConsistency / SXC.renderConsistencyHTML로 이전.
// 여기서는 _diagCard 형식 카드를 만들기 위한 얇은 래퍼만 유지.
//   [D1] title에서 🎯 제거 — icon 인자(2번째)에 이미 🎯 있음 (다른 카드들과 일관성)
//   〔이력〕 이전: title에도 🎯 포함 → "🎯 프로젝트 C 정합 🎯" 두 번 표시 (수정됨)
function _diagProjectC(){
  // SXC 가용성 체크 (로드 순서 안전장치)
  if(typeof SXC === 'undefined' || typeof SXC.checkConsistency !== 'function'){
    return _diagCard('프로젝트 C 정합', '🎯', [
      { label: 'SXC 모듈', value: '✗ sx_project_c.js 로드 안됨', color: 'var(--sell)' }
    ]);
  }

  // SXC.checkConsistency 호출 — stock은 currentAnalStock, fallback은 searchResults
  const _stock = typeof currentAnalStock !== 'undefined' && currentAnalStock ? currentAnalStock : null;
  const _sr = typeof searchResults !== 'undefined' ? searchResults : [];
  const result = SXC.checkConsistency(_stock, { searchResults: _sr });

  // _diagCard에 row 배열 그대로 전달 (표시 형식 동일)
  return _diagCard('프로젝트 C 정합', '🎯', result.rows);
}


// ════════════════════════════════════════════════════════════
//  S107 Phase 3-B-9a: 데이터 확장 진단 (Reactive Loading 상태 + 최근 로그)
// ════════════════════════════════════════════════════════════
//  목적: 모바일 환경에서 console.log 접근이 어려워 진단 탭으로 가시화
//  수집 대상: window._s107Logs 사용 — sx_screener.html 20~38행에서 후킹/관리
//    (HTML이 sx_diag.js보다 먼저 평가되므로 _s107Logs는 항상 HTML 버전이 유효)
//  표시:
//    - 현재 분석 종목의 확장 상태 (플래그, BT 거래 수, 시장 지원 여부)
//    - localStorage 캐시 현황 (sx_ext_* 키 개수)
//    - 최근 로그 (시간 역순)
//
//   [D2] 이중 후킹 제거됨
//   〔이력〕 이전: 740~767행에 별도 [S107] 후킹 (가드 `!window._s107Logs`로 항상 false → dead) (수정됨)
// ════════════════════════════════════════════════════════════

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
    // 확장 단계 판정: _analCandlesExtendedStage(0/1/2/3) 우선, 없으면 구버전 _analCandlesExtended(boolean) fallback
    //   stage: 0=미확장(200봉) / 1=자동 확장(400봉) / 2=수동 확장(600봉) / 3=KIS 700봉 모드
    //   〔이력〕 [BUGFIX] 이전: !!_stock._analCandlesExtended → stage 1, 2 케이스를 "미확장"으로 잘못 표시 (수정됨)
    //   〔이력〕 [B3] stage=3 (KIS 700봉) 추가 — 이전엔 700봉이어도 "600봉"으로만 표시 (수정됨)
    const _stage = _stock._analCandlesExtendedStage || (_stock._analCandlesExtended ? 1 : 0);
    const _stageLabel = _stage === 3 ? '✓ 700봉 (KIS 확장)' : _stage === 2 ? '✓ 600봉 (수동 확장)' : _stage === 1 ? '✓ 400봉 (자동 확장)' : '미확장 (200봉)';
    rows.push({
      label: '확장 단계',
      value: _stageLabel,
      color: _stage > 0 ? 'var(--buy)' : 'var(--text3)'
    });
    const _btTrades = _stock._btResult?.totalTrades ?? 0;
    const _btMin = typeof BT_MIN_TRADES !== 'undefined' ? BT_MIN_TRADES : 10;
    rows.push({
      label: 'BT 거래 수',
      value: `${_btTrades}회 / 최소 ${_btMin}`,
      color: _btTrades >= _btMin ? 'var(--buy)' : 'var(--sell)'
    });
    const _mkt = _stock._mkt || _stock.market || (typeof currentMarket !== 'undefined' ? currentMarket : '');
    // 시장 확장 지원: kr/coin/us 3개 시장 (S114 패치로 us 추가)
    //   〔이력〕 S114 이전: kr/coin만 지원 → 미국 종목 분석 시 "미지원" 잘못 표시 (수정됨)
    const _supported = (_mkt === 'coin' || _mkt === 'kr' || _mkt === 'us');
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
  // [진단 다운로드] 진단 결과를 .txt 파일로 저장하는 버튼 추가 — 모바일에서 스크린샷보다 정확한 분석 가능
  const cardHTML = _diagCard('데이터 확장 진단 (Phase 3-B-9a)', '📈', rows);
  const btnsHTML = `<div style="text-align:right;margin-top:-6px;margin-bottom:10px;display:flex;gap:6px;justify-content:flex-end">
    <button onclick="_downloadDiagReport()" style="padding:4px 10px;font-size:10px;background:#7c3aed;border:1px solid #7c3aed;border-radius:4px;color:#fff;cursor:pointer;font-weight:600">📥 진단 결과 저장</button>
    <button onclick="if(window._s107Logs){window._s107Logs.length=0;runAllDiag();}" style="padding:4px 10px;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text2);cursor:pointer">로그 지우기</button>
  </div>`;
  return cardHTML + btnsHTML;
}

// [진단 다운로드] 진단 결과를 .txt 파일로 저장
//   포함 정보: 진단 카드 6개 (rows) + 환경 (UA, 시각, URL) + 최근 확장 로그
//   목적: 모바일 사용자가 진단 결과를 정확하게 공유 가능하게 — 스크린샷 한계 보완
function _downloadDiagReport(){
  try {
    const lines = [];
    const now = new Date();
    const tStr = now.toISOString();
    lines.push('='.repeat(60));
    lines.push('SIGNAL X 진단 결과');
    lines.push('='.repeat(60));
    lines.push(`생성: ${tStr}`);
    lines.push(`URL: ${location.href}`);
    lines.push(`UA: ${navigator.userAgent}`);
    lines.push(`Online: ${navigator.onLine}`);
    if (navigator.connection) {
      lines.push(`Network: ${navigator.connection.effectiveType||'?'} (downlink=${navigator.connection.downlink||'?'}Mbps, rtt=${navigator.connection.rtt||'?'}ms)`);
    }
    if (window._diagLastRunAt) {
      lines.push(`진단 실행: ${new Date(window._diagLastRunAt).toISOString()} (${Math.round((Date.now()-window._diagLastRunAt)/1000)}초 전)`);
    }
    lines.push('');

    // 진단 카드들
    const raw = window._diagRawData || [];
    if (raw.length === 0) {
      lines.push('⚠ 진단 결과 데이터 없음 — "전체 검사" 먼저 실행해야 함');
    } else {
      raw.forEach(card => {
        lines.push('─'.repeat(60));
        lines.push(`${card.icon||''} ${card.title}`);
        lines.push('─'.repeat(60));
        card.rows.forEach(r => {
          // HTML 태그 제거 (value에 <span> 같은 게 들어있을 수 있음)
          const cleanLabel = String(r.label).replace(/<[^>]*>/g, '').replace(/━/g, '-');
          const cleanValue = String(r.value).replace(/<[^>]*>/g, '');
          lines.push(`  ${cleanLabel.padEnd(28)} ${cleanValue}`);
        });
        lines.push('');
      });
    }

    // localStorage 키 통계
    lines.push('='.repeat(60));
    lines.push('[localStorage 주요 키]');
    lines.push('='.repeat(60));
    try {
      const keys = Object.keys(localStorage).sort();
      const stats = keys.map(k => ({ key: k, size: (localStorage.getItem(k)||'').length }));
      stats.sort((a,b) => b.size - a.size);
      stats.slice(0, 30).forEach(s => {
        lines.push(`  ${(s.size+'').padStart(8)} bytes  ${s.key}`);
      });
      if (stats.length > 30) lines.push(`  … (총 ${stats.length}개 중 상위 30개)`);
    } catch(e) {
      lines.push(`  localStorage 접근 실패: ${e.message}`);
    }
    lines.push('');

    // 최근 확장 로그 (있으면)
    const logs = (window._s107Logs || []);
    if (logs.length > 0) {
      lines.push('='.repeat(60));
      lines.push(`[최근 확장 로그 — 시간순, 총 ${logs.length}개]`);
      lines.push('='.repeat(60));
      logs.forEach(l => {
        const dt = new Date(l.ts);
        const t = `${(dt.getHours()+'').padStart(2,'0')}:${(dt.getMinutes()+'').padStart(2,'0')}:${(dt.getSeconds()+'').padStart(2,'0')}.${(dt.getMilliseconds()+'').padStart(3,'0')}`;
        const lvl = (l.level||'info').toUpperCase().padEnd(5);
        lines.push(`${t} [${lvl}] ${l.msg}`);
      });
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fname = `sx_diag_${now.getFullYear()}${(now.getMonth()+1+'').padStart(2,'0')}${(now.getDate()+'').padStart(2,'0')}_${(now.getHours()+'').padStart(2,'0')}${(now.getMinutes()+'').padStart(2,'0')}${(now.getSeconds()+'').padStart(2,'0')}.txt`;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    if (typeof toast === 'function') toast(`진단 저장됨: ${fname}`);
  } catch(e) {
    console.error('[diag] 진단 저장 실패:', e);
    if (typeof toast === 'function') toast('진단 저장 실패: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// [S171] 시스템 로그 카드 — 진단 화면에서 로그 보기/저장 진입점
//   진단 카드 디자인을 사용하면서 행에 클릭 가능한 액션 버튼 포함
// ════════════════════════════════════════════════════════════
function _diagLog(){
  const total = _sxLogBuffer.length;
  const filtered = _sxLogBuffer.filter(_sxFilterLogLine).length;
  const hookOk = _sxLogHookInstalled;

  // 액션 버튼 HTML (인라인 스타일 — 카드 안 전용)
  const btnStyle = 'display:inline-block;padding:5px 10px;margin-left:4px;font-size:11px;border-radius:5px;cursor:pointer;font-weight:600;border:1px solid';
  const viewBtn = `<span style="${btnStyle} var(--accent,#2563eb);background:var(--accent,#2563eb);color:#fff" onclick="openLogModal()">📋 보기</span>`;
  const saveBtn = `<span style="${btnStyle} var(--border,#ddd);background:var(--surface2,#f5f5f5);color:var(--text,#222)" onclick="downloadLogFile()">💾 저장</span>`;

  const rows = [
    { label: '캡처 상태', value: hookOk ? '✓ 활성' : '✗ 비활성', color: _statusColor(hookOk) },
    { label: '버퍼 (전체)', value: `${total}줄 / ${SX_LOG_BUFFER_MAX}줄`, color: total > 0 ? 'var(--buy)' : 'var(--text3)' },
    { label: '필터 (옵티마이저/캔들)', value: `${filtered}줄`, color: filtered > 0 ? 'var(--accent)' : 'var(--text3)' },
    { label: '액션', value: `${viewBtn}${saveBtn}` },
  ];

  return _diagCard('시스템 로그', '📋', rows);
}

// ════════════════════════════════════════════════════════════
//  [S328] 적정주가/목표주가 평가 진단 (valuation diagnostic)
// ════════════════════════════════════════════════════════════
//  〔배경〕 Phase 2 historical PER이 적용 안 되는 원인 추적용
//          모바일 환경에서 console 접근 어려움 → 설정탭 DIG에 진단 카드 추가
//
//  〔사용법〕
//    1. 종목 분석탭에 한 번 진입 (window._sxValDebug 채워짐)
//    2. 설정탭 → DIG → 전체 검사
//    3. "적정주가 평가" 카드에서 흐름 단계별 상태 확인
//
//  〔표시 정보〕
//    - 종목 식별 (이름/코드)
//    - fin._historicalEps 유무 + 항목별 EPS
//    - candles 메타 (개수/첫·마지막 날짜)
//    - calcHistoricalPer 결과 (validYears, avgPer, min/max)
//    - 부적합 분류 여부 (isPerInadequate)
//    - 최종 적용 PER (historical or 시장평균)
// ════════════════════════════════════════════════════════════
function _diagValuation(){
  const dbg = window._sxValDebug || null;
  const rows = [];

  if(!dbg){
    rows.push({
      label: '상태',
      value: '데이터 없음 — 종목 분석탭 진입 후 다시 진단',
      color: 'var(--text3)'
    });
    return _diagCard('적정주가 평가', '📊', rows);
  }

  // 종목 식별
  rows.push({ label: '종목', value: `${dbg.stockName||'?'} (${dbg.stockCode||'?'})` });

  // [S339] early-return 사유 우선 표시 — eps≤0, fin 없음, 코인 시장 등
  //   _reason 있으면 평가 자체가 불가능한 케이스라 historicalEps 검사 의미 없음
  if(dbg._reason){
    rows.push({
      label: '평가 불가 사유',
      value: dbg._reason,
      color: 'var(--accent)'
    });
    if(dbg.eps != null) rows.push({
      label: 'EPS',
      value: Math.round(dbg.eps).toLocaleString(),
      color: dbg.eps <= 0 ? 'var(--sell)' : 'var(--text2)'
    });
    if(dbg.finSource) rows.push({ label: '재무 출처', value: dbg.finSource });
    if(dbg.epsSource) rows.push({ label: 'EPS 출처', value: dbg.epsSource });
    return _diagCard('적정주가 평가', '📊', rows);
  }

  // historicalEps 상태
  if(!dbg.historicalEps){
    rows.push({
      label: 'historicalEps',
      value: dbg.reason || '없음',
      color: 'var(--sell)'
    });
    if(dbg.finSource) rows.push({ label: '재무 출처', value: dbg.finSource });
    if(dbg.epsSource) rows.push({
      label: 'EPS 출처',
      value: dbg.epsSource,
      color: dbg.epsSource === 'dart' || dbg.epsSource === 'sec' ? 'var(--buy)' : 'var(--accent)'
    });
    if(dbg.eps != null) rows.push({
      label: '현재 EPS',
      value: Math.round(dbg.eps).toLocaleString(),
      color: 'var(--text2)'
    });
    return _diagCard('적정주가 평가', '📊', rows);
  }

  // historicalEps 있음 — 항목 표시
  const heArr = Array.isArray(dbg.historicalEps) ? dbg.historicalEps : [];
  rows.push({
    label: 'historicalEps 항목 수',
    value: `${heArr.length}년치`,
    color: heArr.length >= 2 ? 'var(--buy)' : 'var(--sell)'
  });
  for(const e of heArr.slice(0, 5)){
    rows.push({
      label: `  ${e.year} EPS`,
      value: e.eps != null ? (Math.round(e.eps).toLocaleString()) : 'null',
      color: e.eps != null && e.eps > 0 ? 'var(--text2)' : 'var(--sell)'
    });
  }

  // candles 메타
  rows.push({
    label: 'candles 개수',
    value: `${dbg.candlesLen || 0}봉`,
    color: dbg.candlesLen > 0 ? 'var(--buy)' : 'var(--sell)'
  });
  if(dbg.candlesFirstDate) rows.push({ label: '  첫 봉', value: dbg.candlesFirstDate, color:'var(--text3)' });
  if(dbg.candlesLastDate)  rows.push({ label: '  마지막 봉', value: dbg.candlesLastDate, color:'var(--text3)' });

  // calcHistoricalPer 결과
  const hp = dbg.histPerResult;
  if(!hp){
    rows.push({ label: 'calcHistoricalPer', value: '호출 안 됨', color: 'var(--sell)' });
  } else {
    rows.push({
      label: '유효 년수',
      value: `${hp.validYears || 0}년`,
      color: hp.validYears >= 2 ? 'var(--buy)' : 'var(--sell)'
    });
    if(hp.avgPer != null){
      rows.push({ label: '평균 PER', value: hp.avgPer.toFixed(2) + '배', color: 'var(--buy)' });
      if(hp.minPer != null) rows.push({ label: '  최소 PER', value: hp.minPer.toFixed(2) + '배', color: 'var(--text3)' });
      if(hp.maxPer != null) rows.push({ label: '  최대 PER', value: hp.maxPer.toFixed(2) + '배', color: 'var(--text3)' });
      if(hp.details && hp.details.length > 0){
        for(const d of hp.details){
          rows.push({
            label: `  ${d.year}`,
            value: `종가 ${Math.round(d.close).toLocaleString()} / PER ${d.per.toFixed(1)}`,
            color: 'var(--text3)'
          });
        }
      }
    } else {
      rows.push({
        label: '평균 PER',
        value: '계산 실패 (시장평균 폴백)',
        color: 'var(--sell)'
      });
    }
  }

  // 최종 적용 결과 (현재 valuationJudge 결과)
  const willUseHist = hp && hp.avgPer != null && hp.validYears >= 2;
  rows.push({
    label: '최종 적용',
    value: willUseHist ? `✓ ${hp.validYears}년 평균 PER ${hp.avgPer.toFixed(1)}배` : '✗ 시장평균 폴백',
    color: willUseHist ? 'var(--buy)' : 'var(--accent)'
  });

  return _diagCard('적정주가 평가', '📊', rows);
}

// [S373] 전광판 maAlign 누락 추적 — "이평선 (?)" 표시 원인 디버그용
//   분석탭 진입 시 sx_render의 renderAnalysisResult가 window._sxMaAlignDiag에 push한 스냅샷 표시
//   각 진입마다: indicators 키 목록 + maAlign 존재 여부 (전/후) + [S372] 보강 시도 결과
function _diagMaAlign(){
  const diag = window._sxMaAlignDiag || [];
  if(diag.length === 0){
    return _diagCard('전광판 maAlign 추적 [S373]', '🔍', [
      { label: '상태', value: '데이터 없음 — 분석탭 진입 후 다시 검사', color: 'var(--text3)' }
    ]);
  }
  const latest = diag[diag.length - 1];
  const rows = [];
  rows.push({ label: '마지막 진입 시각', value: latest.t });
  rows.push({ label: '종목 / TF', value: `${latest.name} (${latest.code}) · ${latest.analTF || '?'}` });
  rows.push({
    label: '진입 시 maAlign',
    value: latest.beforeHasMaAlign ? '✓ 정상' : `✗ 누락 (type=${latest.beforeMaAlignType})`,
    color: latest.beforeHasMaAlign ? 'var(--buy)' : 'var(--sell)'
  });
  rows.push({ label: 'indicators 키 개수', value: latest.indicatorKeyCount });
  rows.push({
    label: 'indicators ≡ stock._indicators',
    value: latest.indicatorsIsStockRef ? '동일 참조' : '다른 객체',
    color: latest.indicatorsIsStockRef ? 'var(--accent)' : 'var(--text3)'
  });
  rows.push({ label: '캔들 소스', value: latest.candleSource });
  rows.push({
    label: '[S372] 보강 시도',
    value: latest.fixAttempted ? latest.fixResult : (latest.fixResult === 'NOT_NEEDED' ? '불필요(이미 정상)' : '미시도'),
    color: latest.fixAttempted && latest.fixResult.startsWith('OK') ? 'var(--buy)'
         : latest.fixAttempted && latest.fixResult.startsWith('FAIL') ? 'var(--sell)'
         : latest.fixAttempted && latest.fixResult.startsWith('ERR') ? 'var(--sell)'
         : 'var(--text3)'
  });
  rows.push({
    label: '최종 maAlign',
    value: latest.afterHasMaAlign ? '✓ 정상' : '✗ 여전히 누락',
    color: latest.afterHasMaAlign ? 'var(--buy)' : 'var(--sell)'
  });
  if(latest.afterSample){
    const s = latest.afterSample;
    rows.push({ label: '  bullish/bearish', value: `${s.bullish}/${s.bearish}` });
    rows.push({
      label: '  MA5/20/60',
      value: `${s.short != null ? Math.round(s.short).toLocaleString() : '?'} / ${s.mid != null ? Math.round(s.mid).toLocaleString() : '?'} / ${s.long != null ? Math.round(s.long).toLocaleString() : '?'}`
    });
  }
  rows.push({
    label: 'indicators 키 (앞 30자)',
    value: latest.indicatorKeys.length > 60 ? latest.indicatorKeys.slice(0, 60) + '…' : latest.indicatorKeys,
    color: 'var(--text3)'
  });
  if(diag.length > 1){
    rows.push({ label: '누적 추적 횟수', value: `${diag.length}회 (최근 10개 보존)`, color: 'var(--text3)' });
  }
  return _diagCard('전광판 maAlign 추적 [S373]', '🔍', rows);
}

// ════════════════════════════════════════════════════════════
//  [S452] 지표 정합 점검 — 모바일 console 대체 검증 카드
// ════════════════════════════════════════════════════════════
//  〔목적〕
//    ① EOM 라벨 버그([S452]) 수정 검증 — 엔진 trend(bullish/bearish)와
//       전광판 score100, 상세 라벨이 서로 일치하는지 한눈에 확인
//    ② 섹터 점수(펀더 1점 등)가 폴백이 아니라 실제 업종 순위인지
//       업종명·순위(_sname/_rank/_total) 노출 → industryCode 매핑 오류 검출
//    ③ +DI/-DI 값 노출 — 증권사 차트와 눈으로 대조 (KIS OFF면 오늘 봉 차이 정상)
//
//  〔사용법〕 종목 분석탭 1회 진입(→ sx_render가 window._sxIndDiag 채움) →
//            설정탭 DIG → 전체 검사 → "지표 정합 점검" 카드 확인
//  〔데이터 소스〕
//    - EOM/ADX/DI : window._sxIndDiag (renderAnalysisResult 스냅샷)
//    - 섹터        : window._sxBoard.groups(fund).items('섹터')  (비동기 도착분 직접 읽기)
// ════════════════════════════════════════════════════════════
function _diagIndicators(){
  const d = window._sxIndDiag || null;
  const rows = [];
  if(!d){
    rows.push({ label:'상태', value:'데이터 없음 — 종목 분석탭 진입 후 다시 검사', color:'var(--text3)' });
    return _diagCard('지표 정합 점검 [S452]', '🧪', rows);
  }
  rows.push({ label:'종목 / TF', value:`${d.name} (${d.code}) · ${d.tf} · KIS ${d.kisOn?'ON':'OFF'}` });

  // ── ① EOM 라벨 버그 수정 검증 ──
  rows.push({ label:'EOM trend(엔진)', value: d.eomTrend!=null?String(d.eomTrend):'—', color:'var(--text3)' });
  rows.push({ label:'EOM val', value: d.eomVal!=null?d.eomVal.toFixed(3):'—', color:'var(--text3)' });
  rows.push({ label:'EOM score100(전광판)', value: d.eomScore!=null?String(d.eomScore):'—' });
  const _eomOk = (d.eomScore!=null) && (
       (d.eomScore>=65 && d.eomLabel==='매수세')
    || (d.eomScore<35  && d.eomLabel==='매도세')
    || (d.eomScore>=35 && d.eomScore<65 && d.eomLabel==='중립'));
  rows.push({
    label:'EOM 라벨(상세)',
    value: `${d.eomLabel} ${_eomOk?'✓ score와 일치':'✗ 불일치'}`,
    color: _eomOk ? 'var(--buy)' : 'var(--sell)'
  });

  // ── ② 섹터 순위 매핑 (industryCode 정확성) ──
  try{
    const B = window._sxBoard;
    const fg = B && B.groups && B.groups.find(g=>g.id==='fund');
    const sec = fg && fg.items && fg.items.find(it=>it.k==='섹터');
    if(sec){
      rows.push({
        label:'섹터 점수',
        value:String(sec.v),
        color: sec.v<35?'var(--sell)':sec.v>=65?'var(--buy)':'var(--accent)'
      });
      const _nm = sec._sname || sec._etf || '?';
      const _rk = (sec._rank!=null && sec._total!=null) ? `${sec._rank}/${sec._total}위` : '순위정보 없음';
      rows.push({ label:'섹터 업종/순위', value:`${_nm} · ${_rk}`, color:'var(--text2)' });
      rows.push({ label:'  (업종명 확인)', value:'엉뚱하면 industryCode 매핑 오류', color:'var(--text3)' });
    } else {
      rows.push({ label:'섹터', value:'보드에 없음 (null=데이터 미수신→도넛 생략)', color:'var(--text3)' });
    }
  }catch(_){ rows.push({ label:'섹터', value:'읽기 실패', color:'var(--sell)' }); }

  // ── ③ ADX / +DI·-DI (코드는 표준 Wilder — 증권사와 눈 대조용) ──
  rows.push({ label:'ADX', value: d.adx!=null?d.adx.toFixed(1):'—' });
  rows.push({
    label:'+DI / -DI',
    value: `${d.plusDI!=null?d.plusDI.toFixed(1):'?'} / ${d.minusDI!=null?d.minusDI.toFixed(1):'?'}`,
    color:'var(--text3)'
  });
  rows.push({ label:'  (증권사와 대조)', value:'KIS OFF면 오늘 봉 H/L 차이로 갈림(정상)', color:'var(--text3)' });

  return _diagCard('지표 정합 점검 [S452]', '🧪', rows);
}

