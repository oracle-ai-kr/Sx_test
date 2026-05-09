// ════════════════════════════════════════════════════════════
//  SIGNAL X — Storage Manager (sx_storage.js)
//  버전: v1.1
//
//  역할:
//    - localStorage 사용량 진단 (시각화 + 카테고리/개별 키 펼치기)
//    - 통합 캐시 초기화 (스크리너 + 인덱스)
//    - 통합 전체 초기화
//    - 개별 키 삭제 (NEW v1.1)
//    - 메모리 캐시 헬퍼 — ORACLE_* 종목풀 마스터를 localStorage 대신 세션 메모리에 보관 (NEW v1.1)
//
//  사용처:
//    - sx_screener.html: 설정탭 데이터 관리 → SXS.showDiag(), SXS.clearCache(), SXS.resetAll()
//    - index.html:       설정탭 데이터 관리 → 동일
//    - SXS.cacheGet/Set:  ORACLE_* 마스터 데이터를 점진 이전할 때 사용 (선택 도입)
// ════════════════════════════════════════════════════════════

(function(global){
  'use strict';

  // ─── 키 정의 (한 곳에서 관리) ───
  const CACHE_PREFIXES = ['SX_DISC_','sx_ext_','SX_CDL_','SX_FIN_','ORACLE_','SX_DASH_CACHE_'];
  const EXCLUDE_FROM_CACHE_CLEAR = new Set(['SX_FIN_REPORT']);  // 사용자 설정 — 캐시 정리에서 제외
  const ALL_PREFIXES = ['SX_','ORACLE_','sx_ext_'];

  // 카테고리 표시 이름 (진단 화면용)
  const CATEGORY_LABELS = {
    'ORACLE_':         { icon:'🌐', name:'종목풀 마스터', desc:'KOSPI/KOSDAQ/ETF/COIN/US 마스터 데이터' },
    'sx_ext_':         { icon:'📊', name:'확장 캔들',     desc:'KIS 700/600/400봉 확장 캐시' },
    'SX_CDL_':         { icon:'🕯️', name:'기본 캔들',     desc:'일반 캔들 데이터 캐시' },
    'SX_DISC_':        { icon:'📅', name:'공시 정보',     desc:'DART 공시 캐시' },
    'SX_FIN_':         { icon:'📈', name:'재무 데이터',   desc:'재무제표·이익 캐시' },
    'SX_OPT_':         { icon:'🎯', name:'옵티마이저',    desc:'프리셋·랭킹·가중치' },
    'SX_BT_':          { icon:'💼', name:'BT 결과',       desc:'백테스팅 이력 + 설정' },
    'SX_SCR_':         { icon:'🔍', name:'스크리너 설정', desc:'필터·프리셋·검색결과' },
    'SX_DASH_CACHE_':  { icon:'📊', name:'대시보드 캐시', desc:'인덱스 페이지 차트' },
    'SX_WATCH':        { icon:'⭐', name:'관심종목',      desc:'WATCHLIST + WATCH_BT_CACHE' },
    'SX_KIS_':         { icon:'🔑', name:'KIS API',       desc:'토큰 + 만료시각' },
    'SX_ANAL_':        { icon:'🔬', name:'분석 설정',     desc:'TF, 안전필터' },
  };

  // 펼침 상태 보관 (모달 다시 그릴 때 유지)
  const _expandedCategories = new Set();

  // ─── [v1.1] 메모리 캐시 헬퍼 ───
  // 용도: ORACLE_* 종목풀 마스터를 localStorage 대신 세션 메모리에 저장
  //       (페이지 새로고침 시 사라지지만, fetch는 보통 1회 — 한 세션에 1회)
  // 사용 예시:
  //   SXS.cacheSet('ORACLE_KOSPI', kospiArray);   // 메모리에 저장
  //   const data = SXS.cacheGet('ORACLE_KOSPI');  // 메모리 → localStorage 폴백
  //   SXS.cacheHas('ORACLE_KOSPI');               // 어디든 있으면 true
  const _memCache = {};
  const _memCacheTS = {};

  function cacheSet(key, value){
    _memCache[key] = value;
    _memCacheTS[key] = Date.now();
  }
  function cacheGet(key){
    if(_memCache[key] !== undefined) return _memCache[key];
    // 폴백: localStorage (점진 이전 호환)
    try {
      const raw = localStorage.getItem(key);
      if(raw === null) return null;
      try { return JSON.parse(raw); } catch(_) { return raw; }
    } catch(_) { return null; }
  }
  function cacheHas(key){
    return _memCache[key] !== undefined || (function(){
      try { return localStorage.getItem(key) !== null; } catch(_) { return false; }
    })();
  }
  function cacheClear(prefix){
    if(prefix){
      Object.keys(_memCache).forEach(k => {
        if(k.startsWith(prefix)){ delete _memCache[k]; delete _memCacheTS[k]; }
      });
    } else {
      // 전체 초기화
      Object.keys(_memCache).forEach(k => delete _memCache[k]);
      Object.keys(_memCacheTS).forEach(k => delete _memCacheTS[k]);
    }
  }
  function cacheStats(){
    let totalKeys = 0;
    let totalBytes = 0;
    Object.keys(_memCache).forEach(k => {
      totalKeys++;
      try {
        // 추정: JSON.stringify 길이 × 2 (UTF-16)
        totalBytes += (k.length + JSON.stringify(_memCache[k]).length) * 2;
      } catch(_) {}
    });
    return { keys: totalKeys, bytes: totalBytes };
  }

  // ─── 1. 진단 (analyze) ───
  function analyze(){
    const items = [];
    let totalBytes = 0;
    try {
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!k) continue;
        let v;
        try { v = localStorage.getItem(k) || ''; } catch(_) { v = ''; }
        const bytes = (k.length + v.length) * 2;
        items.push({ key: k, bytes });
        totalBytes += bytes;
      }
    } catch(e) {
      console.warn('[SXS.analyze]', e);
    }

    // 카테고리별 집계
    const byCategory = {};
    items.forEach(item => {
      let matched = '기타';
      for(const prefix of Object.keys(CATEGORY_LABELS)){
        if(item.key.startsWith(prefix)){ matched = prefix; break; }
      }
      if(!byCategory[matched]){
        byCategory[matched] = { bytes: 0, count: 0, items: [] };
      }
      byCategory[matched].bytes += item.bytes;
      byCategory[matched].count++;
      byCategory[matched].items.push(item);
    });

    // 카테고리 안 항목들도 큰 순으로 정렬
    Object.values(byCategory).forEach(cat => {
      cat.items.sort((a,b) => b.bytes - a.bytes);
    });

    return { totalBytes, byCategory, items };
  }

  // ─── 2. 사이즈 포맷 ───
  function formatSize(bytes){
    if(bytes < 1024) return bytes + 'B';
    if(bytes < 1024 * 1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(2) + 'MB';
  }

  // ─── 3. 진단 HTML ───
  function renderDiagHTML(){
    const data = analyze();
    const QUOTA = 5 * 1024 * 1024;  // 추정 5MB (브라우저별 다름)
    const usedPct = (data.totalBytes / QUOTA * 100).toFixed(1);

    // 진행 바 색상 (사용률에 따라)
    let pctColor = 'var(--buy, #16a34a)';
    if(usedPct > 70) pctColor = '#f59e0b';
    if(usedPct > 85) pctColor = 'var(--sell, #dc2626)';

    let html = `
      <div style="padding:12px;font-size:13px;color:var(--text,#000)">
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span style="font-size:14px;font-weight:600">총 사용량</span>
            <span style="font-size:13px;color:${pctColor};font-weight:600">${formatSize(data.totalBytes)} / ~5MB (${usedPct}%)</span>
          </div>
          <div style="height:10px;background:var(--surface2,#eee);border-radius:5px;overflow:hidden">
            <div style="height:100%;width:${Math.min(usedPct,100)}%;background:${pctColor};transition:width .3s"></div>
          </div>
          ${usedPct > 80 ? '<div style="margin-top:6px;font-size:11px;color:#dc2626">⚠️ 용량 한계 근접 — 캐시 초기화 권장</div>' : ''}
        </div>

        <div style="font-size:12px;color:var(--text2,#666);margin-bottom:8px;font-weight:600">카테고리별 분포 <span style="font-weight:400;color:var(--text3,#999)">(클릭하면 개별 키 표시)</span></div>
    `;

    // 카테고리 정렬: bytes 큰 순
    const sortedCats = Object.entries(data.byCategory).sort((a,b) => b[1].bytes - a[1].bytes);
    for(const [prefix, info] of sortedCats){
      const lbl = CATEGORY_LABELS[prefix] || { icon:'📁', name: prefix === '기타' ? '기타' : prefix, desc:'' };
      const pct = (info.bytes / data.totalBytes * 100).toFixed(1);
      const barW = Math.max(2, Math.min(100, info.bytes / data.totalBytes * 100));
      const isExpanded = _expandedCategories.has(prefix);
      const arrow = isExpanded ? '▼' : '▶';

      html += `
        <div style="margin-bottom:8px;background:var(--surface,#fafafa);border-radius:6px;overflow:hidden">
          <div style="padding:8px;cursor:pointer" onclick="SXS._toggleCategory('${prefix}')">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
              <span style="font-size:12px;font-weight:600">
                <span style="color:var(--text3,#999);font-size:9px;margin-right:4px">${arrow}</span>${lbl.icon} ${lbl.name}
              </span>
              <span style="font-size:11px;color:var(--text2,#666)">${formatSize(info.bytes)} · ${info.count}개 (${pct}%)</span>
            </div>
            <div style="height:6px;background:var(--surface2,#eee);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${barW}%;background:var(--accent,#2563eb)"></div>
            </div>
            ${lbl.desc ? `<div style="margin-top:4px;font-size:10px;color:var(--text3,#999)">${lbl.desc}</div>` : ''}
          </div>
      `;

      // [v1.1] 펼친 상태면 개별 키 목록 표시
      if(isExpanded){
        html += `<div style="padding:0 8px 8px 8px;border-top:1px solid var(--border,#eee)">`;
        const showItems = info.items.slice(0, 30);  // 최대 30개 표시
        for(const item of showItems){
          const safeKey = item.key.replace(/"/g, '&quot;').replace(/'/g, "\\'");
          html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid var(--border,#f0f0f0);font-size:11px">
              <span style="color:var(--text2,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:8px">${item.key}</span>
              <span style="color:var(--text3,#999);font-size:10px;margin-right:8px;white-space:nowrap">${formatSize(item.bytes)}</span>
              <button onclick="SXS.removeKey('${safeKey}')" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;color:var(--sell,#dc2626);font-size:10px;padding:2px 6px;cursor:pointer">삭제</button>
            </div>
          `;
        }
        if(info.items.length > 30){
          html += `<div style="padding:6px 4px;font-size:10px;color:var(--text3,#999);text-align:center">… 외 ${info.items.length - 30}개</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    // 액션 버튼
    const cacheBytes = sortedCats
      .filter(([prefix]) => CACHE_PREFIXES.some(p => prefix === p))
      .reduce((sum,[,info]) => sum + info.bytes, 0);

    // 메모리 캐시 통계 (사용 중일 때만 표시)
    const memStats = cacheStats();
    let memInfo = '';
    if(memStats.keys > 0){
      memInfo = `
        <div style="margin-top:14px;padding:8px;background:var(--surface,#f0f9ff);border-radius:6px;font-size:11px;color:var(--text2,#666)">
          💡 세션 메모리 캐시: ${memStats.keys}개 키 (${formatSize(memStats.bytes)})
          <span style="color:var(--text3,#999);font-size:10px">— 페이지 새로고침 시 자동 정리</span>
        </div>
      `;
    }

    html += `
        ${memInfo}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px">
          <button onclick="SXS.clearCache()" style="padding:10px;background:var(--accent,#2563eb);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">
            🧹 캐시 초기화<br><span style="font-size:10px;opacity:.85">${formatSize(cacheBytes)} 회수 예상</span>
          </button>
          <button onclick="SXS.resetAll()" style="padding:10px;background:var(--sell,#dc2626);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">
            🗑️ 전체 초기화<br><span style="font-size:10px;opacity:.85">${formatSize(data.totalBytes)} 회수</span>
          </button>
        </div>
        <div style="margin-top:10px;font-size:10px;color:var(--text3,#999);line-height:1.5">
          • <b>카테고리 클릭</b>: 개별 키 펼쳐 보기 + 삭제<br>
          • <b>캐시 초기화</b>: 공시·캔들·재무·종목풀 삭제 (관심종목/프리셋/API키 보존)<br>
          • <b>전체 초기화</b>: 모든 데이터 삭제 + 페이지 새로고침
        </div>
      </div>
    `;

    return html;
  }

  // ─── 4. 진단 모달 표시 ───
  //   [v1.2] 모바일 뒤로가기 지원 — history.pushState + popstate (sx_screener.html)
  //          ×/배경 클릭 시 history.back()으로 일관성 유지 (popstate가 모달 제거)
  function showDiag(){
    try { if(typeof _sxVib === 'function') _sxVib(8); } catch(_) {}

    const old = document.getElementById('sxsStorageDiag');
    if(old) old.remove();

    // 뒤로가기 지원: history 항목 추가 → 뒤로가기 시 popstate 핸들러가 모달 제거
    try { history.pushState({view:'sxsStorageDiag'}, ''); } catch(_) {}

    const modal = document.createElement('div');
    modal.id = 'sxsStorageDiag';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = function(e){
      // 배경 클릭 시 history.back() — popstate 핸들러가 실제 제거 담당 (일관성)
      if(e.target === modal){ try { history.back(); } catch(_) { modal.remove(); } }
    };

    const inner = document.createElement('div');
    inner.style.cssText = 'background:var(--bg,#fff);border-radius:12px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)';
    inner.id = 'sxsStorageDiagInner';

    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 16px;border-bottom:1px solid var(--border,#eee);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg,#fff);z-index:1';
    // × 버튼: history.back() (popstate 핸들러가 제거 담당)
    header.innerHTML = `
      <span style="font-size:15px;font-weight:600">📦 localStorage 진단</span>
      <button onclick="try{history.back()}catch(_){document.getElementById('sxsStorageDiag').remove()}" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text2,#666);padding:0 4px">×</button>
    `;
    inner.appendChild(header);

    const body = document.createElement('div');
    body.id = 'sxsStorageDiagBody';
    body.innerHTML = renderDiagHTML();
    inner.appendChild(body);

    modal.appendChild(inner);
    document.body.appendChild(modal);
  }

  // ─── [v1.1] 모달 내부 다시 그리기 (펼침 상태 토글, 키 삭제 후 등) ───
  function _refreshDiag(){
    const body = document.getElementById('sxsStorageDiagBody');
    if(body) body.innerHTML = renderDiagHTML();
  }

  // ─── [v1.1] 카테고리 펼침/접기 토글 ───
  function _toggleCategory(prefix){
    if(_expandedCategories.has(prefix)) _expandedCategories.delete(prefix);
    else _expandedCategories.add(prefix);
    _refreshDiag();
  }

  // ─── [v1.1] 개별 키 삭제 ───
  // [S224] async 변환 — sxConfirm 사용
  async function removeKey(key){
    if(!key) return;
    try { if(typeof _sxVib === 'function') _sxVib(10); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf(`다음 키를 삭제할까요?\n\n${key}`)) return;
    try {
      localStorage.removeItem(key);
      // 메모리 캐시도 함께 정리 (있는 경우)
      if(_memCache[key] !== undefined){ delete _memCache[key]; delete _memCacheTS[key]; }
      const msg = `✓ ${key} 삭제됨`;
      if(typeof toast === 'function') toast(msg);
      else console.log(msg);
    } catch(e) {
      // [S224] alert → toast (폴백은 console)
      const msg = `삭제 실패: ${e.message}`;
      if(typeof toast === 'function') toast(msg);
      else console.error(msg);
    }
    _refreshDiag();
  }

  // ─── 5. 캐시 초기화 (통합) ───
  // [S224] async 변환 — sxConfirm 사용
  async function clearCache(){
    try { if(typeof _sxVib === 'function') _sxVib(15); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    if(!await _conf('캐시만 초기화하시겠습니까?\n(공시·캔들·재무·종목풀·대시보드 캐시 삭제 · 관심종목/프리셋/API키 등은 보존)')) return;

    let removed = 0;
    let bytesFreed = 0;
    try {
      for(let i = localStorage.length - 1; i >= 0; i--){
        const k = localStorage.key(i);
        if(!k) continue;
        if(CACHE_PREFIXES.some(p => k.startsWith(p)) && !EXCLUDE_FROM_CACHE_CLEAR.has(k)){
          try {
            const v = localStorage.getItem(k) || '';
            bytesFreed += (k.length + v.length) * 2;
            localStorage.removeItem(k);
            removed++;
          } catch(_) {}
        }
      }
      ['SX_SCR_STOCK_MASTER'].forEach(k => {
        try {
          if(localStorage.getItem(k) !== null){
            const v = localStorage.getItem(k) || '';
            bytesFreed += (k.length + v.length) * 2;
            localStorage.removeItem(k);
            removed++;
          }
        } catch(_) {}
      });
    } catch(e) {
      console.warn('[SXS.clearCache] err', e);
    }

    // 메모리 캐시도 정리 (ORACLE_, sx_ext_ 등)
    cacheClear('ORACLE_');
    cacheClear('sx_ext_');

    // 인메모리 변수 캐시 (각 파일에서 사용)
    try { if(typeof _finCache !== 'undefined') _finCache = {}; } catch(_) {}
    try { if(typeof _memCandleCache !== 'undefined') _memCandleCache = {}; } catch(_) {}
    try { if(typeof SX !== 'undefined' && SX._DASH_CACHE) SX._DASH_CACHE = null; } catch(_) {}

    _refreshDiag();

    const msg = `캐시 ${removed}개 항목 (${formatSize(bytesFreed)}) 삭제됨`;
    // [S224] alert 폴백 제거 — toast 항상 존재, console 폴백
    if(typeof toast === 'function') toast(msg);
    else console.log(msg);
  }

  // ─── 6. 전체 초기화 (통합) ───
  // [S224] async 변환 — confirm/alert 모두 sx 모달 await 처리
  async function resetAll(){
    try { if(typeof _sxVib === 'function') _sxVib(20); } catch(_) {}
    const _conf = (typeof window !== 'undefined' && window.sxConfirm) ? window.sxConfirm : (m=>Promise.resolve(confirm(m)));
    const _alrt = (typeof window !== 'undefined' && window.sxAlert) ? window.sxAlert : (m=>Promise.resolve(alert(m)));
    if(!await _conf('Signal X의 모든 데이터를 초기화하시겠습니까?\n(관심종목·종목풀·분석·BT·옵티마이저·설정 전부 삭제)')) return;

    try {
      const toRemove = [];
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!k) continue;
        if(ALL_PREFIXES.some(p => k.startsWith(p))){
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
    } catch(e) {
      console.warn('[SXS.resetAll] err', e);
    }

    // 메모리 캐시 전체 초기화
    cacheClear();

    try { if(typeof SX !== 'undefined' && SX._DASH_CACHE) SX._DASH_CACHE = null; } catch(_) {}
    try { if(typeof SX !== 'undefined' && SX.ALERTS) SX.ALERTS.length = 0; } catch(_) {}

    await _alrt('전체 데이터가 초기화되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
  }

  // ─── 외부 노출 (window.SXS) ───
  global.SXS = {
    // 공개 API
    analyze: analyze,
    formatSize: formatSize,
    renderDiagHTML: renderDiagHTML,
    showDiag: showDiag,
    clearCache: clearCache,
    resetAll: resetAll,
    removeKey: removeKey,           // [v1.1] 개별 키 삭제

    // [v1.1] 메모리 캐시 헬퍼 (ORACLE_* 마이그레이션용)
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    cacheHas: cacheHas,
    cacheClear: cacheClear,
    cacheStats: cacheStats,

    // 키 정의 노출
    CACHE_PREFIXES: CACHE_PREFIXES,
    EXCLUDE_FROM_CACHE_CLEAR: EXCLUDE_FROM_CACHE_CLEAR,
    ALL_PREFIXES: ALL_PREFIXES,

    // 내부 (모달 다시 그리기용 — UI 콜백)
    _toggleCategory: _toggleCategory,
    _refreshDiag: _refreshDiag,
  };

})(window);
