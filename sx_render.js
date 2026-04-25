// ════════════════════════════════════════════════════════════
//  SIGNAL X — Render Engine v7.10
// ════════════════════════════════════════════════════════════
const BT_SUPPORTED_TF = {
  kr:   ['30m','60m','day','week','month'],   // 30분은 KIS 한정
  us:   ['day','week','month'],
  coin: ['60m','240m','day','week','month'],
};
const BT_MIN_TRADES = 10; // 최소 거래 횟수

// ══════════════════════════════════════════════════════════════
//  S103-fix7 Phase3-B-7: C 로직 분리 완료 → sx_project_c.js (SXC 네임스페이스)
//    - supervisorJudge       → SXC.supervisorJudge
//    - unifiedVerdict        → SXC.unifiedVerdict
//    - _mapVerdictToBtAction → SXC.mapVerdictToBtAction
//    - _verdictMap 상수       → SXC.VERDICT_GROUP_MAP / SXC.getVerdictGroup
//    - _verdictBadgeTop 로직  → SXC.getVerdictBadge
//    screener.html에서 sx_project_c.js가 render.js보다 먼저 로드됨
// ══════════════════════════════════════════════════════════════

function _isBtSupportedTF(market, tf){
  const m = market || 'kr';
  const supported = BT_SUPPORTED_TF[m] || [];
  // 국내 30m은 KIS 연결 시에만 지원
  if(m==='kr' && tf==='30m' && !window._kisEnabled) return false;
  return supported.includes(tf);
}

// S79: 현재 BT trades + 누적 히스토리 합산 거래 횟수
function _getBtTotalTrades(stock){
  const mkt = stock._mkt || stock.market || currentMarket;
  // 1) 현재 세션 BT 거래수
  const btR = stock._btResult;
  const sessionTrades = btR ? (btR.totalTrades ?? 0) : 0;
  // 2) 누적 히스토리 거래수
  let histTrades = 0;
  if(typeof _btHistLoad === 'function'){
    const hist = _btHistLoad(mkt);
    const arr = hist[stock.code] || [];
    histTrades = arr.length;
  }
  return Math.max(sessionTrades, histTrades);
}

// S83: 5단 배지 필터 상태 — 복수 선택 가능
let _stageBadgeFilter = new Set(); // empty = 전체, Set of 'ready'|'entry'|'trend'|'caution'|'wait'

function _setStageBadgeFilter(stage) {
  if (stage === null) { _stageBadgeFilter.clear(); }
  else if (_stageBadgeFilter.has(stage)) { _stageBadgeFilter.delete(stage); }
  else { _stageBadgeFilter.add(stage); }
  renderResults();
}

// S83: 5단 배지 판정 — 종목의 현재 단계 판별 (과열주의/관망 추가)
function _getStockStage(s) {
  const sr = s._scanResult;
  if (!sr) return null;
  const r = sr.readyScore ?? 0, e = sr.entryScore ?? 0, t = sr.trendScore ?? s._score ?? 0;
  if (t >= 60 && e >= 50) return 'trend';
  if (e >= 60 && r >= 50) return 'entry';
  if (r >= 60) return 'ready';
  if (t >= 70 && r < 30) return 'caution';
  return 'wait';
}

// S83: 5단 배지 카운트 계산, S84: 배지별 평균 점수 통계, S85: 전이확률평균+상위종목
function _countStageBadges(stocks) {
  var cnt = { ready: 0, entry: 0, trend: 0, caution: 0, wait: 0 };
  var sum = { ready:{r:0,e:0,t:0}, entry:{r:0,e:0,t:0}, trend:{r:0,e:0,t:0}, caution:{r:0,e:0,t:0}, wait:{r:0,e:0,t:0} };
  // S85: 전이확률 합산 + 상위 종목 수집
  var transSum = { ready:0, entry:0, trend:0, caution:0, wait:0 };
  var topStocks = { ready:[], entry:[], trend:[], caution:[], wait:[] };
  for (var i = 0; i < stocks.length; i++) {
    var st = _getStockStage(stocks[i]);
    if (st && cnt.hasOwnProperty(st)) {
      cnt[st]++;
      var sr = stocks[i]._scanResult;
      if (sr) {
        sum[st].r += sr.readyScore ?? 0;
        sum[st].e += sr.entryScore ?? 0;
        sum[st].t += sr.trendScore ?? stocks[i]._score ?? 0;
      }
      // S85: 전이확률
      var tp = _getTransitionProb(stocks[i], st);
      transSum[st] += tp;
      // S85: 상위 종목 (점수 기준)
      var sortScore = st === 'ready' ? (sr ? sr.readyScore : 0) : st === 'entry' ? (sr ? sr.entryScore : 0) : (sr ? (sr.trendScore ?? 0) : 0);
      topStocks[st].push({name: stocks[i]._name || stocks[i].t || '?', score: sortScore, transProb: tp});
    }
  }
  // 평균 계산
  var avg = {};
  var transAvg = {};
  var tops = {};
  var keys = ['ready','entry','trend','caution','wait'];
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki];
    avg[k] = cnt[k] > 0 ? {
      r: Math.round(sum[k].r / cnt[k]),
      e: Math.round(sum[k].e / cnt[k]),
      t: Math.round(sum[k].t / cnt[k])
    } : null;
    transAvg[k] = cnt[k] > 0 ? Math.round(transSum[k] / cnt[k]) : 0;
    // 상위 3개 (점수 높은 순)
    topStocks[k].sort(function(a,b){ return b.score - a.score; });
    tops[k] = topStocks[k].slice(0, 3);
  }
  return { count: cnt, avg: avg, transAvg: transAvg, tops: tops };
}

// S82: 배지 정렬용 전이확률 추출
function _getTransitionProb(s, badgeStage) {
  var stats = s._btTransitionStats;
  if (!stats) return 0;
  if (badgeStage === 'ready') return stats.r2e ? stats.r2e.rate : 0;
  if (badgeStage === 'entry') return stats.e2t ? stats.e2t.rate : 0;
  if (badgeStage === 'trend') return stats.e2t ? stats.e2t.rate : 0; // 추세는 진입→추세 전이율 기준
  return 0;
}

// S85: 전이 추이 bar 클릭 → 상세 표시
function _showTlDetail(el, detailId) {
  var box = document.getElementById(detailId);
  if (!box) return;
  var bar = el.getAttribute('data-bar');
  var r = el.getAttribute('data-r');
  var e = el.getAttribute('data-e');
  var t = el.getAttribute('data-t');
  var from = el.getAttribute('data-from');
  var to = el.getAttribute('data-to');
  var cnt = el.getAttribute('data-cnt');
  // S86: 라벨 매핑
  // [v1.7] 용어 통일: 진입검토→바닥신호 / 강세→반등신호 / 추세→추세강도
  var _zLabel = function(z){ return z==='ready'?'바닥 신호':z==='entry'?'반등 신호':z==='trend'?'추세 강도':z; };
  var txt = '<b>봉 #' + bar + '</b> — ';
  txt += '<span style="color:var(--accent)">바닥 ' + r + '%</span> · ';
  txt += '<span style="color:var(--buy);opacity:.7">반등 ' + e + '%</span> · ';
  txt += '<span style="color:var(--buy)">추세 ' + t + '%</span>';
  if (from && to) {
    var dirTxt = _zLabel(from) + ' → ' + _zLabel(to);
    var dirClr = to === 'trend' ? 'var(--buy)' : to === 'entry' ? 'var(--accent)' : 'var(--text3)';
    txt += '<br><span style="color:' + dirClr + ';font-weight:700">전이: ' + dirTxt + (cnt > 1 ? ' ×' + cnt : '') + '</span>';
  }
  // 토글: 같은 bar 클릭 시 닫기
  if (box.style.display !== 'none' && box.getAttribute('data-active-bar') === bar) {
    box.style.display = 'none';
    box.removeAttribute('data-active-bar');
    return;
  }
  box.innerHTML = txt;
  box.style.display = 'block';
  box.setAttribute('data-active-bar', bar);
}

function renderResults(){
  const area = document.getElementById('resultArea');
  if(!searchResults.length){
    area.innerHTML = `<div class="result-empty">조건에 맞는 종목이 없습니다</div>`;
    updateResultBadge();
    // [FIX-1A] early-return 시에도 저장 (빈 결과 상태도 보존 의도라면 주석 처리)
    try{ saveSearchResults(); }catch(e){}
    return;
  }

  // S48: 시장별 필터링
  const mf = _resultMarketFilter;
  const filtered = searchResults.filter(s => (s._mkt || 'kr') === mf);

  if(!filtered.length){
    area.innerHTML = `<div class="result-empty">해당 시장에 검색 결과가 없습니다</div>`;
    updateResultBadge();
    // [FIX-1A] 필터 탭 전환 등으로 filtered=0이어도 원본 searchResults는 저장해야 함
    try{ saveSearchResults(); }catch(e){}
    return;
  }

  const arrow = (k)=> sortKey===k ? (sortDir==='desc'?'▼':'▲') : '';
  const sorted = (k)=> sortKey===k ? ' sorted' : '';
  const hasScore = filtered.some(s=>s._score!=null);
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // S99-3: Phase B — 5단 배지 → 통합판정 아이콘 필터
  // S103-fix7 Phase3-A-2: "대기" 값 폐지 (→ "회피"로 통합, 이미 avoid 매핑됨)
  // S103-fix7 Phase3-B-7: _verdictMap 상수 → SXC.getVerdictGroup() 헬퍼로 교체 (sx_project_c.js로 이전)
  const _verdictCounts = {buy:0, interest:0, hold:0, watch:0, avoid:0, sell:0, none:0};
  filtered.forEach(s => {
    const v = s._svVerdict;
    if(!v){ _verdictCounts.none++; return; }
    const k = SXC.getVerdictGroup(v.action);
    _verdictCounts[k]++;
  });
  const _hasVerdicts = filtered.some(s => s._svVerdict);
  const _hasFilter = _stageBadgeFilter.size > 0;
  let displayed = _hasFilter ? filtered.filter(s => {
    const v = s._svVerdict;
    if(!v) return _stageBadgeFilter.has('none');
    const k = SXC.getVerdictGroup(v.action);
    return _stageBadgeFilter.has(k);
  }) : filtered;

  area.innerHTML = `
    <div class="result-summary">
      검색 결과 <span class="cnt">${filtered.length}</span>종목${scanTimeStr?`<span style="font-size:8px;color:var(--text3);margin-left:4px">${scanTimeStr}</span>`:''}
      ${_scanLoadingActive?'<span class="scan-loading-text">검색중<span class="dots"></span></span>':''}
      <button class="btn-watchlist" onclick="_sxVib(12);toggleWatchlistView()">관심목록</button>
      <button class="btn-reset" onclick="_sxVib(15);clearSearchResults()">초기화</button>
    </div>
    ${_hasVerdicts ? `<div style="display:flex;gap:5px;padding:4px 12px 6px;flex-wrap:wrap">
      ${_verdictCounts.buy?`<span onclick="_setStageBadgeFilter('buy')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('buy')?'var(--buy)':'var(--border)'};background:${_stageBadgeFilter.has('buy')?'var(--buy)':'var(--surface)'};color:${_stageBadgeFilter.has('buy')?'#fff':'var(--text2)'}">🟢${_verdictCounts.buy}</span>`:''}
      ${_verdictCounts.interest?`<span onclick="_setStageBadgeFilter('interest')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('interest')?'var(--accent)':'var(--border)'};background:${_stageBadgeFilter.has('interest')?'var(--accent)':'var(--surface)'};color:${_stageBadgeFilter.has('interest')?'#fff':'var(--text2)'}">🔵${_verdictCounts.interest}</span>`:''}
      ${_verdictCounts.hold?`<span onclick="_setStageBadgeFilter('hold')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('hold')?'var(--buy)':'var(--border)'};background:${_stageBadgeFilter.has('hold')?'var(--buy)':'var(--surface)'};color:${_stageBadgeFilter.has('hold')?'#fff':'var(--text2)'}">🟢${_verdictCounts.hold}</span>`:''}
      ${_verdictCounts.watch?`<span onclick="_setStageBadgeFilter('watch')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('watch')?'#f59e0b':'var(--border)'};background:${_stageBadgeFilter.has('watch')?'#f59e0b':'var(--surface)'};color:${_stageBadgeFilter.has('watch')?'#fff':'var(--text2)'}">🟡${_verdictCounts.watch}</span>`:''}
      ${_verdictCounts.avoid?`<span onclick="_setStageBadgeFilter('avoid')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('avoid')?'var(--sell)':'var(--border)'};background:${_stageBadgeFilter.has('avoid')?'var(--sell)':'var(--surface)'};color:${_stageBadgeFilter.has('avoid')?'#fff':'var(--text2)'}">🟠${_verdictCounts.avoid}</span>`:''}
      ${_verdictCounts.sell?`<span onclick="_setStageBadgeFilter('sell')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('sell')?'var(--sell)':'var(--border)'};background:${_stageBadgeFilter.has('sell')?'var(--sell)':'var(--surface)'};color:${_stageBadgeFilter.has('sell')?'#fff':'var(--text2)'}">🔴${_verdictCounts.sell}</span>`:''}
      ${_hasFilter ? '<span onclick="_setStageBadgeFilter(null)" style="cursor:pointer;padding:3px 8px;border-radius:12px;font-size:9px;border:1px solid var(--border);color:var(--text3)">전체</span>' : ''}
    </div>` : ''}
    <div class="result-header">
      <span class="rh-name">종목명</span>
      <span class="rh-col${sorted('price')}" onclick="toggleSort('price')">현재가<span class="rh-arrow">${arrow('price')}</span></span>
      <span class="rh-col${sorted('changeRate')}" onclick="toggleSort('changeRate')">전일대비<span class="rh-arrow">${arrow('changeRate')}</span></span>
      <span class="rh-col${sorted('tradeAmount')}" onclick="toggleSort('tradeAmount')">거래대금<span class="rh-arrow">${arrow('tradeAmount')}</span></span>
    </div>
    ${displayed.map((s,i)=>{
      const realIdx = searchResults.indexOf(s);
      const chgClass = s.changeRate>0?'up':s.changeRate<0?'down':'flat';
      const chgSign = s.changeRate>0?'+':'';
      const priceStr = s.price>0 ? s.price.toLocaleString() : '—';
      const chgStr = s.price>0 ? `${chgSign}${(s.changeRate||0).toFixed(2)}%` : '—';
      const volStr = fmtVol(s.tradeAmount);

      // 스마트 필터 태그 (제한 없이 전체 표시)
      const tags = s._smartTags || [];
      const tagsHtml = tags.length ? `<div class="sf-tags">${tags.map(t=>`<span class="sf-tag ${t.dir>0?'pos':t.dir<0?'neg':'neutral'}">${t.label}</span>`).join('')}</div>` : '';

      // 안전필터 차단 이유
      const reasonsHtml = s._reasons&&s._reasons.length ? `<div class="sr-reasons">${s._reasons.join(' ')}</div>` : '';

      return `
        <div class="stock-row" onclick="openAnalysis(${realIdx})">
          <div class="sr-body">
            <div class="sr-row1">
              <div class="sr-name">${s.name}</div>
              <div class="sr-col"><div class="sr-price">${priceStr}</div></div>
              <div class="sr-col"><div class="sr-change ${s.price>0?chgClass:'flat'}">${chgStr}</div></div>
              <div class="sr-col"><div class="sr-vol">${volStr}</div></div>
            </div>
            <div class="sr-row2">
              <span class="sr-code">${s.code} · ${s.market||''}</span>
              ${(()=>{
                const _sr = s._scanResult;
                if(!_sr) return s._score!=null?'<span class="sr-score-chip" style="color:'+(s._score>=60?'var(--buy)':'var(--text3)')+'">'+s._score+'</span>':'';
                const r=_sr.readyScore??0, e=_sr.entryScore??0, t=_sr.trendScore??s._score??0;
                // S99-3: Phase B — 5단 배지 제거 → 통합판정 아이콘 1개
                const _svV = s._svVerdict;
                if(_svV) return '<span class="sr-score-chip" style="font-size:11px" title="'+_svV.action+'">'+_svV.icon+'</span>';
                // 감독관 미실행 시 점수만 표시
                if(s._score!=null) return '<span class="sr-score-chip" style="color:'+(s._score>=60?'var(--buy)':'var(--text3)')+'">'+s._score+'</span>';
                return '';
              })()}
              ${(()=>{
                const _cMkt = s._mkt || currentMarket;
                const _cTfOk = _isBtSupportedTF(_cMkt, currentTF);
                if(!_cTfOk) return '';
                const _cTrades = _getBtTotalTrades(s);
                if(s._btScore==null) return '';
                const _cReliColor = _cTrades<BT_MIN_TRADES?'var(--sell)':_cTrades<30?'var(--accent)':'var(--buy)';
                return `<span class="sr-score-chip" style="color:${_cReliColor}">BT${s._btScore}</span>`;
              })()}
              ${(()=>{ if(typeof _btHistLoad!=='function')return ''; const _m=s._mkt||currentMarket; const _h=_btHistLoad(_m); const _a=_h[s.code]||[]; if(!_a.length)return ''; const _cTfOk2=_isBtSupportedTF(_m,currentTF); const _cTr2=_getBtTotalTrades(s); if(!_cTfOk2||_cTr2<BT_MIN_TRADES)return ''; const _r=_btHistReliabilityLabel(_a.length); const _c=_r.cls==='full'?'var(--buy)':_r.cls==='mid'?'var(--accent)':_r.cls==='low'?'var(--sell)':'var(--text3)'; return `<span class="sr-rel-chip" style="color:${_c};font-size:8px">${_r.text}</span>`; })()}
              ${(()=>{ if(!s._btAction)return ''; const _m3=s._mkt||currentMarket; if(!_isBtSupportedTF(_m3,currentTF))return ''; const _cTr3=_getBtTotalTrades(s); if(_cTr3<BT_MIN_TRADES)return ''; return `<span class="sr-action-chip ${s._btAction==='진입 적기'?'good':s._btAction==='회피'?'bad':'mid'}">${s._btAction}</span>`; })()}
              ${tagsHtml}
            </div>
            ${reasonsHtml}
          </div>
          <span class="sr-arrow">›</span>
        </div>
      `;
    }).join('')}
  `;
  saveSearchResults();
  updateResultBadge();
}

function clearSearchResults(){
  _showWatchlistMode = false;
  searchResults = [];
  // S109 bugfix: 현재 시장 키만 제거 (다른 시장 결과는 보존)
  try{ localStorage.removeItem(typeof searchResultsKey === 'function' ? searchResultsKey(currentMarket) : KEYS.SEARCH_RESULTS); }catch(e){}
  const area = document.getElementById('resultArea');
  area.innerHTML = `<div class="result-empty"><div class="big-ico" style="font-size:28px;opacity:.3;margin-bottom:8px">—</div>내 필터 탭에서 조건을 설정하고<br>검색을 실행하세요</div>`;
  updateResultBadge();
}

function saveSearchResults(){
  try{
    const slim = searchResults.map(s=>({code:s.code,name:s.name,market:s.market,sector:s.sector||'',price:s.price,changeRate:s.changeRate,volume:s.volume,tradeAmount:s.tradeAmount,marketCap:s.marketCap,foreignRatio:s.foreignRatio,volumeRatio:s.volumeRatio,_score:s._score,_action:s._action,_reasons:s._reasons,_smartTags:s._smartTags,_filterScore:s._filterScore,_btScore:s._btScore,_btAction:s._btAction,_mkt:s._mkt||'kr',_regime:s._regime?{label:s._regime.label,icon:s._regime.icon}:null}));
    // S109 bugfix: 현재 시장 키로 저장 (시장 전환 시 각자 보존)
    const key = (typeof searchResultsKey === 'function') ? searchResultsKey(currentMarket) : KEYS.SEARCH_RESULTS;
    const payload = JSON.stringify({results:slim, sortKey, sortDir, ts:Date.now()});
    // [FIX-LEAK] quota 에러 시 자동 청소 + 재시도 (검색 결과는 사용자 핵심 데이터)
    if(typeof _sxSafeSetItem === 'function'){
      _sxSafeSetItem(key, payload);
    } else {
      localStorage.setItem(key, payload);
    }
  }catch(e){ console.warn('saveSearchResults err',e); }
}
// [BUG-2 FIX] sx_screener.html:7499에서 재할당(override)하기 때문에
//   기존 function 선언(non-writable)은 strict 모드에서 실패 위험.
//   var + 함수 표현식으로 선언하여 재할당을 공식 허용.
var openAnalysis = function(idx){
  const stock = searchResults[idx];
  if(!stock) return;
  currentAnalStock = stock;
  // S115 hotfix3: 종목 전환 시 펼침 카드 플래그 초기화 (이전 종목 상태 잔존 방지)
  stock._engineVerifyOpen = false;
  stock._3stageOpen = false;
  // ═══════════════════════════════════════════════════════════════════
  // S118 hotfix: 종목 전환 시 단일검증 탭 결과 완전 초기화
  //   [버그] 이전 종목(예: 알테오젠)에서 엔진판단 검증 실행 → btRenderBasicResult로
  //          #btBasicResult DOM에 결과 렌더됨 → 새 종목(예: LG화학) 선택해도
  //          #btBasicResult는 이전 종목 결과 그대로 유지 → 단일검증 탭 클릭 시
  //          헤더만 LG화학인데 내부엔 알테오젠 결과 보이는 현상
  //   [근본 원인] S115 hotfix3에서 "단일검증 탭 동기화" 기능 추가 시 저장 경로만
  //          만들고 종목 전환 시 리셋 경로를 누락. openAnalysis에서 analBody는
  //          초기화하지만 #btBasicResult는 방치.
  //   [해결] stock._btResult 리셋 + #btBasicResult DOM 비우기 (display:none 복귀)
  //   [영향] 단일검증 탭 진입 시 "백테스트 실행 버튼만 있는 초기 상태"로 돌아감
  //          → 사용자가 다시 [▶ 백테스트 실행] 클릭하거나 엔진판단 검증 클릭으로 갱신
  //   [프로젝트 C 원칙] ⑤(정합 우선): 탭 간 종목 데이터 일관성 보장
  // ═══════════════════════════════════════════════════════════════════
  // (1) stock 객체의 BT 결과 필드 리셋 — 새 종목은 이전 BT 결과 보유하면 안 됨
  stock._btResult = null;
  stock._btScore = null;
  stock._btState = null;
  // S120-2: 강건성 배지 필드도 리셋 (이전 종목 잔존 방지)
  stock._btResult_200 = null;
  stock._robustness = null;
  // (2) 단일검증 탭 결과 영역 DOM 초기화
  const _btBasicResultEl = document.getElementById('btBasicResult');
  if(_btBasicResultEl){
    _btBasicResultEl.innerHTML = '';
    _btBasicResultEl.style.display = 'none';
  }
  // S56: 이전 종목 공시 가중치 리셋
  if(typeof SXE!=='undefined' && SXE.setDisclosureWeight) SXE.setDisclosureWeight(0);

  document.getElementById('analTitle').textContent = stock.name;
  // S75: 탑바 섹터 표시
  const _sectorEl = document.getElementById('analSector');
  if(_sectorEl) _sectorEl.textContent = stock.sector ? stock.sector : '';
  document.getElementById('analBody').innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>${stock.name} 분석 중...</div>`;
  document.getElementById('analOverlay').classList.add('show');

  // S99-3: Phase C-1 — TF칩 바 표시 + 멀티TF 병렬 fetch 시작
  _renderAnalTfChips();
  const tfBar = document.getElementById('analTfBar');
  if(tfBar) tfBar.style.display = '';

  // S99-4: Phase C-2 — 모드칩 바 표시
  _renderAnalModeChips();
  const modeBar = document.getElementById('analModeBar');
  if(modeBar) modeBar.style.display = '';

  // S200: 수동 매매 시뮬 — 종목분석 탭 진입 시 매수/매도 버튼 & 포지션 박스 갱신
  try{ if(typeof mtRefreshAnalBar === 'function') mtRefreshAnalBar(); }catch(_){}

  (window._sxTrackedTimeout || setTimeout)(()=>runAnalysis(stock), 500);
  // 멀티TF 백그라운드 fetch (기본 TF 외)
  _fetchMultiTfBackground(stock);
}; // [BUG-2 FIX] 함수 표현식이므로 세미콜론 필요

function closeAnalysis(){
  // S128: 인덱스 관심탭에서 진입한 경우 인덱스로 바로 복귀
  //   - _sxFromIdxActive 플래그가 true면 스크리너 중간 단계 생략
  //   - history.back() = 브라우저의 이전 페이지 = 인덱스
  if(window._sxFromIdxActive){
    window._sxFromIdxActive = false;
    try{ history.back(); }catch(_){
      // fallback: history.back 실패 시 URL 직접 이동
      window.location.href = 'index.html';
    }
    return;
  }
  document.getElementById('analOverlay').classList.remove('show');
  currentAnalStock = null;
  // [WEAK-2 FIX] 분석 오버레이 닫힐 때 대기 중 타이머 모두 취소 (고스트 렌더 방지)
  try{ if(typeof window._sxClearAllTimers === 'function') window._sxClearAllTimers(); }catch(_){}
  // S99-3: TF칩 바 숨기고 캐시 클리어
  const tfBar = document.getElementById('analTfBar');
  if(tfBar) tfBar.style.display = 'none';
  Object.keys(_analTFCache).forEach(k => delete _analTFCache[k]);
  // S99-4: 모드칩 바 숨김
  const modeBar = document.getElementById('analModeBar');
  if(modeBar) modeBar.style.display = 'none';
  // S200: 포지션 박스도 숨김
  const posBox = document.getElementById('analPositionBox');
  if(posBox) posBox.classList.remove('show');
}

async function runAnalysis(stock){
 try{ // S63: 전체 try-catch — 에러 시 무한로딩 방지
  const _analCount = (currentMarket==='kr' && window._kisEnabled) ? 500 : 200; // S67: KIS 500봉
  let indicators = stock._indicators || null;
  let _analCandles = null; // S67: BT 연동용 캔들 보존
  if(!indicators){
    try{
      // S108 Phase 3-B-9a-ext: 이미 확장된 캔들(stock._lastAnalCandles)이 있으면 재사용
      //   _loadMoreCandles에서 runAnalysis 재호출 시 200봉 재fetch되어 확장 데이터가 날아가는
      //   문제 방지. _analCount보다 많은 봉을 이미 보유한 경우만 재사용.
      //   (_analCount = 200 기본, KIS 모드 시 500 — 그보다 많은 400/600봉은 수동/자동 확장 결과)
      let candles;
      if(stock._lastAnalCandles && stock._lastAnalCandles.length > _analCount){
        candles = stock._lastAnalCandles;
        console.log(`[runAnalysis] 확장 캔들 재사용: ${candles.length}봉 (fetch skip)`);
      } else {
        candles = await fetchCandles(stock.code, _analCount, _analTF);
        // 초기 로드 시만 _lastAnalCandles 설정 (확장 데이터 덮어쓰기 방지)
        if(candles && candles.length > 0 && !stock._lastAnalCandles){
          stock._lastAnalCandles = candles;
        }
      }
      _analCandles = candles;
      // S200: 캔들 확보 직후 포지션 박스 현재가 갱신 (매수 중이라면)
      try{ if(typeof mtRefreshAnalBar === 'function') mtRefreshAnalBar(); }catch(_){}
      if(candles && candles.length >= 20){
        indicators = calcIndicators(candles, _analTF);
        // S49: 직접검색 시 price 보강
        if(stock.price===0 && indicators._advanced){
          const adv = indicators._advanced;
          if(adv.price) stock.price = adv.price;
          if(adv.rows && adv.rows.length>=2){
            const last = adv.rows[adv.rows.length-1];
            const prev = adv.rows[adv.rows.length-2];
            if(!stock.price && last.close) stock.price = last.close;
            if(stock.changeRate===0 && prev.close>0) stock.changeRate = ((last.close-prev.close)/prev.close)*100;
            if(stock.volume===0 && last.volume) stock.volume = last.volume;
            if(stock.tradeAmount===0 && last.close && last.volume) stock.tradeAmount = (last.close * last.volume) / 1000000;
          }
        }
      }
    }catch(e){ console.warn('analysis candle err', e); }
  }
  // 고급 분석 (quickScore 이미 있으면 재사용)
  let qs = stock._scanResult || null;
  if(!qs && indicators && indicators._advanced){
    qs = scrQuickScore(indicators._advanced.rows, _analTF);
  }
  const scores = calcEnhancedScores(stock, indicators);

  // S56: 단일종목 분석 시 DART 공시 키워드 fetch (비동기, non-blocking 렌더)
  if(currentMarket === 'kr' && stock.code){
    fetchDisclosureKeywords(stock.code).then(kws => {
      if(!kws || !kws.length) kws = [];
      stock._disclosureKw = kws;
      // 해석 생성
      if(typeof SXI!=='undefined' && SXI.advDisclosure){
        stock._disclosureItp = SXI.advDisclosure(kws);
      }
      // 엔진 가중치 반영
      if(typeof SXE!=='undefined' && SXE.calcDisclosureWeight){
        const dw = SXE.calcDisclosureWeight(kws);
        SXE.setDisclosureWeight(dw);
      }
      // 배지 + 부문별 + 종합평을 동적으로 업데이트
      _renderDisclosureUI(stock, scores, indicators, qs);
    }).catch(()=>{});
  }

  // S43: 부문별 점수 해석, MA 배열 상세, 기본 정보 의미 해석
  const sectorItp = (typeof SXI!=='undefined') ? SXI.sectorScores(scores, stock, indicators) : null;
  const maAlignItp = (typeof SXI!=='undefined' && indicators) ? SXI.maAlignment(indicators) : null;
  const basicItp = (typeof SXI!=='undefined') ? SXI.basicInfo(stock) : null;

  // S67: 분석탭↔BT 연동 — 동일 캔들로 BT 실행 → 매매전략 점수 표시
  let _analBtScore = null, _analBtResult = null;
  let _analBtState = null; // S95: BT 현재 상태
  try{
    const btCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || null;
    if(btCandles && btCandles.length >= 60 && typeof SXE!=='undefined' && SXE.runBtEngine){
      const rawRows = btCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
      const _btParams = typeof btGetParams === 'function' ? btGetParams() : {};
      const btR = SXE.runBtEngine(rawRows, _analTF, _btParams);
      if(btR && !btR.error){
        _analBtResult = btR;
        _analBtScore = calcBtScore(btR);
        stock._btResult = btR;
        stock._btScore = _analBtScore;
        // S95: 현재 상태 판정
        const _curPrice = btCandles[btCandles.length-1]?.close || stock.price || 0;
        _analBtState = typeof btGetCurrentState === 'function' ? btGetCurrentState(btR, _curPrice) : null;
        stock._btState = _analBtState;
        // S103-fix7 Phase3-B-2: 점수 기반 es×bs 4분류 _btAction 계산 제거
        //   (진단 결과 14종목 14/14 정합 실패 → 점수 기반 폐기)
        //   _btAction은 _svVerdict 생성 후(971줄 근처)에 C 매핑으로 설정

        // S107 Phase 3-B-9a: 데이터 부족 자동 확장 (Reactive Loading)
        //   S108 Phase 3-B-9a-ext: 확장 단계 플래그로 전환 (bool → 0/1/2 stage)
        //     stage 0: 스캐너 기본 200봉
        //     stage 1: 자동 확장 완료 400봉 (이 블록에서 설정)
        //     stage 2: 수동 확장 완료 600봉 (? 버튼 클릭, _loadMoreCandles에서 설정)
        //   감지 조건: 현재 세션 BT 거래수가 BT_MIN_TRADES(10회) 미만
        //   확장 대상: 분석탭 진입한 해당 종목만 (스캐너는 기존 200봉 유지)
        //   확장 크기: +200봉 (총 400봉, Upbit 하드 제한 고려)
        //   시장 지원: coin (Upbit to) / kr (Naver 날짜 조정) / us (S114: Yahoo range=2y로 이미 400봉+ 확보)
        const _btTradesNow = btR.totalTrades ?? 0;
        const _extMkt = stock._mkt || stock.market || currentMarket;
        // S114: 미국 시장 포함. 미국은 sx_screener.html fetchCandles에서 range=2y(일봉)/10y(주봉)/max(월봉)로 이미 충분한 봉수 확보
        const _extSupported = (_extMkt === 'coin' || _extMkt === 'kr' || _extMkt === 'us');
        // S108: stage 플래그 하위 호환 — 기존 bool true면 stage 1로 간주
        const _curStage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
        console.log(`[S114 DBG] 확장 감지 — trades=${_btTradesNow}, stage=${_curStage}, market=${_extMkt}, supported=${_extSupported}, fetchFn=${typeof fetchCandlesExtended}, rowsLen=${rawRows.length}`);
        // S114: 조건 변경 — 기존 "거래수 < 10" 조건 제거, 무조건 400봉 기본화
        //   원칙: 분석탭 진입 시 항상 400봉 기준 BT 실행 → 거래수 충분히 확보
        if(_curStage < 1 && _extSupported && rawRows.length > 0){

          // S114: 미국 시장 분기 — 이미 range=2y로 400봉+ 확보된 경우 추가 fetch 불필요
          if(_extMkt === 'us'){
            if(rawRows.length >= 400){
              stock._analCandlesExtendedStage = 1;
              stock._analCandlesExtended = true;
              console.log(`[S114] 미국 시장 — 이미 ${rawRows.length}봉 확보됨, stage=1 즉시 세팅 (추가 fetch 불필요)`);
              // 재귀 skip, 기존 계산 그대로 사용
            } else {
              console.log(`[S114] ⚠ 미국 시장 — ${rawRows.length}봉만 확보됨 (400봉 미달) — range 확장 검토 필요`);
              // 400봉 미달이라도 stage=1로 마킹하여 중복 호출 방지
              stock._analCandlesExtendedStage = 1;
              stock._analCandlesExtended = true;
            }
          }
          // 한국/코인: 200봉 → 2초 대기 → +200봉 확장 (기존 방식 유지 + 실제 2초 대기 추가)
          else if(typeof fetchCandlesExtended === 'function'){
            console.log(`[S114] ★ 자동 확장 시작 (stage 0 → 1): 시장=${_extMkt}, 현재 ${rawRows.length}봉`);
            stock._analCandlesExtendedStage = 1;  // 먼저 설정해서 중복 호출 방지
            stock._analCandlesExtended = true;    // 하위 호환

            try{
              const _oldestDate = rawRows[0].date;
              console.log(`[S114] oldestDate=${_oldestDate}, 2초 대기 시작...`);
              // S114: 실제 2초 대기 추가 (기존엔 주석만 있고 실제 대기 없음 — 봇 감지 회피)
              await new Promise(r => setTimeout(r, 2000));
              console.log(`[S114] 2초 대기 완료, 확장 API 호출...`);
              const _extraCandles = await fetchCandlesExtended(stock.code, _analTF, _oldestDate, 200);
              console.log(`[S114] 확장 API 응답: ${_extraCandles ? _extraCandles.length + '봉' : 'null'}`);
              if(_extraCandles && _extraCandles.length > 0){
                console.log(`[S114] 추가 데이터 첫 봉: ${_extraCandles[0].date}, 마지막 봉: ${_extraCandles[_extraCandles.length-1].date}`);
                // 병합: [과거 200봉, 기존 200봉] = 오래된 순 정렬 유지
                const _mergedRows = [..._extraCandles, ...rawRows];
                console.log(`[S114] 병합 완료: ${_extraCandles.length}봉 + ${rawRows.length}봉 = 총 ${_mergedRows.length}봉`);

                // ═══════════════════════════════════════════════════════
                // S112 방향 3: 확장 후 "분석 + BT 재계산" (정합성 보장)
                //
                // 문제: 기존엔 BT만 400봉 재실행, 분석 점수는 200봉 그대로 → 불일치
                //       (LG에너지솔루션: 분석 12회 vs BT 23회 같은 현상)
                //
                // 해결: 확장된 캔들을 stock._lastAnalCandles에 저장 후 runAnalysis 재귀 호출
                //       재귀 진입 시 _lastAnalCandles 재사용(fetch skip)하여
                //       calcIndicators → calcEnhancedScores → BT → 모두 새 봉수 기준으로 재계산
                //       → 분석 점수와 BT 거래 수가 "같은 시간의 같은 캔들" 사용
                //
                // 무한 루프 방지: stock._analCandlesExtendedStage = 1 이미 설정됨
                //                 → 재귀 진입 시 _curStage >= 1 조건으로 확장 재시도 안 함
                // ═══════════════════════════════════════════════════════
                stock._lastAnalCandles = _mergedRows.map(c => ({...c})); // 깊은 복사
                console.log(`[S114/S112] ★ 확장 완료 — runAnalysis 재귀 호출로 분석+BT 재계산 (${_mergedRows.length}봉)`);
                return runAnalysis(stock); // ← 재귀 호출: 전체 재계산 후 렌더
              } else {
                console.log(`[S114] ⚠ 확장 실패 (null 또는 빈 배열) — 기존 데이터 유지`);
              }
            }catch(extErr){
              console.error('[S114] 자동 확장 예외:', extErr);
              // 에러 시 기존 결과 유지 (그대로 진행)
            }
          }
        } else {
          console.log(`[S114 DBG] 자동 확장 건너뜀 — stage=${_curStage}, supported=${_extSupported}, rowsLen=${rawRows.length}`);
        }
      }
    }
  }catch(btErr){ console.warn('[runAnalysis] BT err', btErr); }

  // S79: 점수 모멘텀 계산 (과거 5봉 추이)
  // [2026-04 FIX] 스캔워커가 이미 계산해서 넘긴 _scoreMomentum이 있으면 재사용.
  //   이전: 무조건 덮어쓰기 → 스캔 시점과 분석탭 시점 모멘텀이 달라 C 판정 불일치.
  //   TF가 달라졌다면 새로 계산해야 하지만, 그 경우 _scoreMomentum은 이미 상단에서 캐시 로드 로직이 관리함.
  try{
    if(!stock._scoreMomentum){
      const momCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || null;
      if(momCandles && momCandles.length >= 80 && typeof SXE!=='undefined' && SXE.scoreMomentum){
        const rawRows = momCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
        stock._scoreMomentum = SXE.scoreMomentum(rawRows, _analTF, 5);
      }
    }
  }catch(momErr){ console.warn('[runAnalysis] momentum err', momErr); }

  const analTime = new Date();

  // S99-3: 현재 TF 결과를 캐시에 저장
  if(typeof _saveCurrentTfCache === 'function'){
    const _svV = stock._svVerdict || null;
    // S-BUGFIX: typeof supervisorJudge → typeof SXC?.supervisorJudge (SXC 네임스페이스 이전 후 구버전 가드 잔존 버그 수정)
    const _svJ = (typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function' && qs && stock._scoreMomentum) ?
      SXC.supervisorJudge(qs.readyScore||0, stock._scoreMomentum, _svV?._rr||0) : null;
    _saveCurrentTfCache(stock, indicators, qs, stock._scoreMomentum,
      stock._btResult, stock._btScore, stock._btState, _svJ, _svV);
  }

  renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp);

  // ═══════════════════════════════════════════════════════════════════
  // S119: 엔진판단 검증 자동 실행 (백그라운드)
  //
  // [목적] 모든 종목 600봉 기준 통일 — 공평성 원칙
  //        사용자가 엔진판단 검증 버튼을 수동 클릭한 것과 동일한 효과를
  //        분석탭 진입 시 자동으로 제공.
  //
  // [플로우]
  //   1. 분석탭 진입 → 200봉 fetch → 자동 400봉 확장 (기존)
  //   2. renderAnalysisResult 완료 (화면 먼저 표시)
  //   3. ★ S119: 500ms 후 _runEngineVerify 자동 호출 (백그라운드)
  //   4. _runEngineVerify 내부: 400→600봉 확장 + BT 재실행 + runAnalysis 재귀
  //   5. 재귀 진입 시 stock._btResult가 있고 봉수 >= 600이면 자동 실행 SKIP
  //      (무한 루프 방지)
  //
  // [자동 실행 조건]
  //   - stock._btResult 없음 (처음 진입 또는 종목 전환 후)
  //     또는
  //   - stock._lastAnalCandles 봉수가 목표봉수 미만 (일봉 600, 주/월봉 400)
  //   - 동시에 _engineVerifyRunning 플래그 false (중복 호출 방지)
  //
  // [이슈 B 자연 해소]
  //   S118 미해결 이슈: "분석탭 400봉 vs 단일검증 600봉 거래수 불일치"
  //   → 이제 분석탭 진입 시 자동으로 600봉까지 확장되므로 두 탭 항상 동일.
  //
  // [UX 순서]
  //   방법 B (백그라운드): 400봉 분석 완료 → 화면 먼저 표시 → 백그라운드 BT
  //   → 완료 시 runAnalysis 재귀로 화면 자동 갱신 (결과 카드 펼침 포함)
  //
  // [주/월봉 처리]
  //   _runEngineVerify 내부에서 _targetCount 를 400으로 자동 설정함
  //   → 주/월봉도 400봉이 최대이므로 현재 봉수가 400 미만일 때만 실행
  //
  // ═══════════════════════════════════════════════════════════════════
  try {
    const _tfLocal = (typeof _analTF !== 'undefined' && _analTF) ? _analTF : 'day';
    const _mktLocal = stock._mkt || stock.market || (typeof currentMarket !== 'undefined' ? currentMarket : 'kr');
    // S119 fix1: 시장별 목표 봉수 분기 — 미국(us)은 경로 D(단일 fetch 300봉)로 확장 불가
    //   → range=2y로 이미 받은 400~500봉이 사실상 최대. 600봉 요구 시 영원히 목표 미달 → 무한 루프.
    //   해결: 한국/코인 = 600봉 (일봉) / 400봉 (주월봉), 미국 = 0봉 (자동 실행 자체 skip).
    //   미국 종목은 S114 로직으로 이미 400봉+ 확보 상태이므로 자동 재실행 불필요.
    //   (미국 수동 엔진판단 검증 버튼 클릭은 기존대로 동작 — _runEngineVerify 경로 D)
    let _targetBars;
    if(_mktLocal === 'us'){
      _targetBars = 0; // 미국: 자동 실행 skip (한도가 원천 다름)
    } else {
      _targetBars = (_tfLocal === 'week' || _tfLocal === 'month') ? 400 : 600;
    }
    const _curBars = (stock._lastAnalCandles && stock._lastAnalCandles.length) ? stock._lastAnalCandles.length : 0;
    // 자동 실행 조건: BT 결과 없음 OR 현재 봉수 < 목표 봉수 (미국은 _targetBars=0이므로 항상 false)
    const _needsAuto = (!stock._btResult) || (_targetBars > 0 && _curBars < _targetBars);

    if(_needsAuto && !stock._engineVerifyRunning && typeof _runEngineVerify === 'function'){
      console.log(`[S119] ★ 엔진판단 검증 자동 실행 예정 — 시장=${_mktLocal}, 현재 ${_curBars}봉 / 목표 ${_targetBars}봉, BT결과=${!!stock._btResult}`);
      // 500ms 지연: 렌더 직후 DOM 안정화 + 사용자가 화면 먼저 볼 수 있도록
      (window._sxTrackedTimeout || setTimeout)(() => {
        // 지연 후 다시 체크 (사용자가 이미 버튼 클릭했거나 다른 종목으로 이동한 경우 skip)
        if(typeof currentAnalStock !== 'undefined' && currentAnalStock === stock && !stock._engineVerifyRunning && !stock._btResult){
          // 엔진판단 검증 카드를 펼침 상태로 세팅 (수동 클릭과 동일 효과)
          stock._engineVerifyOpen = true;
          _runEngineVerify(stock);
        } else if(_targetBars > 0 && _curBars < _targetBars && currentAnalStock === stock && !stock._engineVerifyRunning){
          // BT는 있지만 봉수 부족 → 갱신 실행 (한국/코인만 해당)
          stock._engineVerifyOpen = true;
          _runEngineVerify(stock);
        }
      }, 500);
    } else {
      console.log(`[S119] 엔진판단 검증 자동 실행 SKIP — 시장=${_mktLocal}, 봉수=${_curBars}/${_targetBars}, BT결과=${!!stock._btResult}, 실행중=${!!stock._engineVerifyRunning}`);
    }
  } catch(autoErr) { console.warn('[S119] 자동 실행 로직 예외:', autoErr); }
 }catch(e){ // S63: 분석 실패 시 에러 표시
  console.error('[runAnalysis] err', e);
  const body = document.getElementById('analBody');
  if(body) body.innerHTML = `<div class="result-empty" style="padding:40px 16px;text-align:center"><div style="font-size:24px;opacity:.3;margin-bottom:8px">⚠</div><div style="font-size:13px;color:var(--text2)">분석 중 오류가 발생했습니다</div><div style="font-size:10px;color:var(--text3);margin-top:6px">${e.message||e}</div><div style="font-size:8px;color:var(--text3);margin-top:6px;text-align:left;max-height:120px;overflow:auto;word-break:break-all;padding:6px;background:var(--surface2);border-radius:4px">${(e.stack||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div><button onclick="if(currentAnalStock)runAnalysis(currentAnalStock)" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;cursor:pointer">다시 시도</button></div>`;
 }
}

// S31: 미니 캔들차트 그리기
// S34: 미니 캔들차트 → SXChart 모듈로 위임
// S95: trades 전달 시 drawMiniWithTrades 사용
// S99: svVerdict 전달 → 통합판정 기준 마커
function _drawMiniCandleChart(rows, trades, svVerdict){
  if(typeof SXChart==='undefined') return;
  if(trades && trades.length && SXChart.drawMiniWithTrades){
    SXChart.drawMiniWithTrades('miniCandleChart', rows, trades, svVerdict);
  } else {
    SXChart.drawMini('miniCandleChart', rows);
  }
}

function calcEnhancedScores(stock, ind){
  let momentum=50, value=50, volume=50, trend=50;

  if(ind){
    // 모멘텀: RSI + MACD + 등락률
    const rsi = ind.rsi;
    if(rsi>60) momentum+=10; else if(rsi<40) momentum-=10;
    if(ind.macd.macd>ind.macd.signal) momentum+=8; else momentum-=5;
    const cr = stock.changeRate||0;
    if(cr>3) momentum+=10; else if(cr>0) momentum+=5; else if(cr>-3) momentum-=5; else momentum-=10;
    momentum = Math.max(10, Math.min(95, momentum));

    // 거래량: MFI + VR + OBV
    if(ind.mfi>60) volume+=10; else if(ind.mfi<40) volume-=8;
    if(ind.vr>150) volume+=8; else if(ind.vr<70) volume-=8;
    if(ind.obv.trend==='up') volume+=5; else if(ind.obv.trend==='down') volume-=5;
    volume = Math.max(10, Math.min(95, volume));

    // 추세: ADX + MA배열 + BB
    if(ind.adx.adx>25) trend+=10;
    if(ind.ma5&&ind.ma20&&ind.ma60&&ind.ma5>ind.ma20&&ind.ma20>ind.ma60) trend+=12;
    else if(ind.ma5&&ind.ma20&&ind.ma5<ind.ma20) trend-=8;
    if(ind.psar.trend==='up') trend+=5; else trend-=5;
    trend = Math.max(10, Math.min(95, trend));

    // 밸류: 외국인+시총 기반 (재무 데이터는 Phase 3)
    const fr = stock.foreignRatio||0;
    if(fr>30) value=65; else if(fr>15) value=55; else if(fr>5) value=48; else value=40;
  } else {
    // 캔들 없으면 기존 로직
    return calcBasicScores(stock);
  }

  const total = Math.round(momentum*0.3 + value*0.2 + volume*0.25 + trend*0.25);
  const grade = total>=70?'A':total>=55?'B':total>=40?'C':total>=25?'D':'F';
  return {total, grade, momentum, value, volume, trend};
}

function calcBasicScores(stock){
  let momentum = 50, value = 50, volume = 50, trend = 50;

  const cr = stock.changeRate || 0;
  if(cr > 5) momentum = 75;
  else if(cr > 2) momentum = 65;
  else if(cr > 0) momentum = 55;
  else if(cr > -2) momentum = 45;
  else if(cr > -5) momentum = 35;
  else momentum = 25;

  const vr = stock.volumeRatio || 100;
  if(vr > 500) volume = 80;
  else if(vr > 200) volume = 65;
  else if(vr > 100) volume = 50;
  else volume = 35;

  const fr = stock.foreignRatio || 0;
  if(fr > 40) value = 70;
  else if(fr > 20) value = 60;
  else if(fr > 5) value = 50;
  else value = 40;

  const mc = stock.marketCap || 0;
  if(mc > 10000) trend = 60;
  else trend = 45;

  const total = Math.round((momentum*0.3 + value*0.25 + volume*0.25 + trend*0.2));
  const grade = total>=70?'A':total>=55?'B':total>=40?'C':total>=25?'D':'F';

  return {total, grade, momentum, value, volume, trend};
}

let _currentAnalRows = null;
let _currentAnalName = '';
let _currentAnalTrades = null;

// S62: BT 전략점수 산출 (0~100) — 수익률+승률+거래수+MDD+PF 종합
function calcBtScore(btData){
  if(!btData) return null;
  const pnl = btData.totalPnl ?? 0;
  const wr = btData.winRate ?? 0;
  const trades = btData.totalTrades ?? 0;
  const mdd = btData.mdd ?? 0;
  const pf = btData.profitFactor ?? 0;
  if(trades === 0) return null;

  // 1) 수익률 점수 (0~30) — 손실이면 0에 수렴, +20% 이상이면 30점
  let pnlScore;
  if(pnl >= 20) pnlScore = 30;
  else if(pnl >= 10) pnlScore = 22 + (pnl-10)/10*8;
  else if(pnl >= 5) pnlScore = 16 + (pnl-5)/5*6;
  else if(pnl >= 0) pnlScore = 8 + pnl/5*8;
  else if(pnl >= -10) pnlScore = Math.max(0, 8 + pnl/10*8);
  else pnlScore = 0;

  // 2) 승률 점수 (0~25) — 50%가 15점, 70% 이상이면 25점
  let wrScore;
  if(wr >= 70) wrScore = 25;
  else if(wr >= 60) wrScore = 20 + (wr-60)/10*5;
  else if(wr >= 50) wrScore = 15 + (wr-50)/10*5;
  else if(wr >= 40) wrScore = 8 + (wr-40)/10*7;
  else wrScore = Math.max(0, wr/40*8);

  // 3) 거래 신뢰도 (0~15) — 최소 3건 이상이어야 의미, 10건 이상이면 만점
  let tradeScore;
  if(trades >= 10) tradeScore = 15;
  else if(trades >= 5) tradeScore = 10 + (trades-5)/5*5;
  else if(trades >= 3) tradeScore = 5 + (trades-3)/2*5;
  else tradeScore = trades/3*5; // 1~2건은 낮은 신뢰

  // 4) MDD 리스크 감점 (0~15) — MDD 작을수록 고득점
  let mddScore;
  const absMdd = Math.abs(mdd);
  if(absMdd <= 5) mddScore = 15;
  else if(absMdd <= 10) mddScore = 12 + (10-absMdd)/5*3;
  else if(absMdd <= 20) mddScore = 6 + (20-absMdd)/10*6;
  else if(absMdd <= 40) mddScore = (40-absMdd)/20*6;
  else mddScore = 0;

  // 5) PF 점수 (0~15) — 1.5 이상이면 만점, 1.0 미만이면 저조
  let pfScore;
  if(pf >= 2.0) pfScore = 15;
  else if(pf >= 1.5) pfScore = 12 + (pf-1.5)/0.5*3;
  else if(pf >= 1.0) pfScore = 6 + (pf-1.0)/0.5*6;
  else if(pf >= 0.5) pfScore = (pf-0.5)/0.5*6;
  else pfScore = 0;

  return Math.round(Math.min(100, Math.max(0, pnlScore + wrScore + tradeScore + mddScore + pfScore)));
}

// S62: BT 데이터 조회 공통 함수
function _getBtData(stock){
  const ticker = stock.code;
  if(!ticker) return null;
  // S67: runAnalysis에서 인메모리 BT 결과 우선
  if(stock._btResult && !stock._btResult.error) return stock._btResult;
  let btData = null;
  try{
    const raw = localStorage.getItem(SX_BT_RESULT_KEY);
    if(raw){ const d = JSON.parse(raw); if(d && d.ticker === ticker) btData = d; }
  }catch(e){}
  if(!btData){
    try{
      const raw = localStorage.getItem(SX_BT_CROSS_KEY);
      if(raw){
        const d = JSON.parse(raw);
        if(d && d.items){
          const found = d.items.find(it => it.code === ticker || it.name === stock.name);
          if(found){ btData = found; if(!btData.saved_at && d.saved_at) btData.saved_at = d.saved_at; }
        }
      }
    }catch(e){}
  }
  return btData;
}

// ══════════════════════════════════════════════════════════════
// S103-fix7 Phase3-B-4f: 상단 배너 내부 "엔진시뮬 포지션 라인" 생성 (프로젝트 C v2.0)
//   🎯 v2.0 철학: 시스템(엔진시뮬) = 가상 트레이더, 사용자 = 미러링
//   이 함수는 "엔진시뮬 트레이더의 현재 상태"를 내러티브로 표출
//
//   v5.4 _buildBtSimLine(롤백됨)과의 차이점:
//     · v5.4: BT 데이터 리포트 어조 ("BT 매수 4/6 @ 317,317")
//     · v2.0: 엔진시뮬 내러티브 어조 ("▲ 4/6 진입 @ 317,317" = 엔진시뮬의 발자취)
//     · v5.4: empty 상태에서 점수/부족분 표시 (기계적)
//     · v2.0: empty 상태에서 관찰자 모드 안내 ("엔진시뮬 포지션 없음, 타이밍 대기")
//     · v5.4: 회피 상태 미표시 (공백)
//     · v2.0: 회피 상태에서 "엔진시뮬 진입 안 함" 명시 (투명성)
//     · v5.4: C 판정과 독립 (혼란 유발)
//     · v2.0: C 판정(svVerdict)에 맞춰 어조/포커스 적응 (정합)
//
//   상태별 분기 (5종):
//     · holding + _isBuySignal=true  → 🟢 신호포착 방금 (엔진시뮬 진입 중)
//     · holding + _isBuySignal=false → 🟢 엔진시뮬 보유중 (날짜/가격/pnl/보유일)
//     · sell_signal                  → 🔴 엔진시뮬 완결 (익절/손절 + pnl + 매도일)
//     · waiting + C='관심'/'관망'     → 🔵 엔진시뮬 관찰/보류 (매수 타이밍 대기)
//     · waiting + C='회피' or no_data→ ⚪ 엔진시뮬 포지션 없음 (진입 부적합 or BT 미실행)
//
//   용어 체계 (Phase 3-B-4f.1):
//     · "엔진시뮬" = 분석 엔진 + BT 엔진이 돌리는 가상 트레이딩 시뮬레이션
//     · "보유중" = 이미 포지션이 있는 상태 (기존 금융 용어 "포지션" 대체, 초보자 친화)
//     · "신호포착" = 매수/매도 트리거가 발생한 순간 (기존 "신호" 대체, 명확성)
//
//   차트 마커(▲/▼)와 시각적 일관성: svVerdict.chartMarker와 동일 기호 사용
//   → 차트의 ▲와 배너의 ▲가 같은 "엔진시뮬의 매수 행적"을 나타냄
// ══════════════════════════════════════════════════════════════
function _buildSimPositionLine(stock, btSt, svVerdict){
  // 스타일 공통 (배너 본문과 동일 디자인 언어)
  const BOX_STYLE = 'margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:8px;border-left:3px solid ' + (svVerdict?.color || 'var(--text3)');
  const TITLE_STYLE = 'font-size:11px;color:var(--text2);font-weight:700;margin-bottom:4px;letter-spacing:-.3px';
  const MAIN_STYLE = 'font-size:12px;color:var(--text);font-weight:700;line-height:1.5';
  const SUB_STYLE = 'font-size:10.5px;color:var(--text2);line-height:1.5;margin-top:2px';
  const ACCENT_STYLE_BUY = 'color:var(--buy);font-weight:800';
  const ACCENT_STYLE_SELL = 'color:var(--sell);font-weight:800';

  // ── no_data: BT 미실행 (엔진시뮬 트레이더 자체가 없음) ──
  if(!btSt || btSt.state === 'no_data'){
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
      <div style="${MAIN_STYLE}">엔진시뮬 미실행</div>
      <div style="${SUB_STYLE}">BT 백테스트 실행 시 엔진시뮬 포지션 활성화</div>
    </div>`;
  }

  // ── holding + _isBuySignal=true: 방금 매수 신호 (엔진시뮬 진입 순간) ──
  if(btSt.state === 'holding' && btSt._isBuySignal){
    // [FIX-2] 외부 C 판정이 '회피'인데 BT 시뮬은 매수 트리거를 잡은 상황
    //   → 다른 waiting 분기들(관찰/보류)과 동일한 3줄 구조로 통일
    //   타이틀 "엔진시뮬 회피" / 메인 "현재 엔진시뮬 포지션 취소" / 서브 "BT 검증 확인 · 함정 주의 · 진입 신중"
    const _vAct = svVerdict?.action || '';
    if(_vAct === '회피'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 회피</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 취소</div>
        <div style="${SUB_STYLE}">BT 검증 확인 · 함정 주의 · 진입 신중</div>
      </div>`;
    }
    // [v1.9] 강등 분기 — C가 '[강등]' 마커를 단 '관망' 판정
    //   BT는 매수 트리거를 잡았지만 BT 자체 신뢰도가 낮음(점수<40 or 승률<45%)
    //   → 회피처럼 ▲ 매수 배너/마크는 막되, 어조는 '관찰' 톤 유지 (회피보다는 한 단계 위)
    //   타이틀 "엔진시뮬 관찰" + 메인 "포지션 취소" + 서브 "BT 검증 확인 · 함정 주의 · 진입 신중" 혼합형
    if(svVerdict?.label && svVerdict.label.startsWith('[강등]')){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 관찰</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 취소</div>
        <div style="${SUB_STYLE}">BT 검증 확인 · 함정 주의 · 진입 신중</div>
      </div>`;
    }
    const entry = btSt.entry || 0;
    const entryStr = entry > 0 ? Math.round(entry).toLocaleString() + '원' : '—';
    const tpStr = btSt.tp ? Math.round(btSt.tp).toLocaleString() : '';
    const slStr = btSt.sl ? Math.round(btSt.sl).toLocaleString() : '';
    let tpslLine = '';
    if(tpStr && slStr){
      tpslLine = `<div style="${SUB_STYLE}">목표 ${tpStr} / 손절 ${slStr} <span style="color:var(--text3)">(예정)</span></div>`;
    }
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 신호포착</div>
      <div style="${MAIN_STYLE}"><span style="${ACCENT_STYLE_BUY}">▲ 매수 신호 방금 발생</span></div>
      <div style="${SUB_STYLE}">제안 진입가: ${entryStr}</div>
      ${tpslLine}
    </div>`;
  }

  // ── holding + _isBuySignal=false: 엔진시뮬 보유중 (▲ 있고 ▼ 없음, 2봉 초과) ──
  if(btSt.state === 'holding'){
    // [FIX-2] 외부 C 판정이 '회피'인데 BT 시뮬은 보유중인 엇갈림 상황
    //   → 다른 waiting 분기들과 동일한 3줄 구조로 간결 통일
    const _vActHold = svVerdict?.action || '';
    if(_vActHold === '회피'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 회피</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 취소</div>
        <div style="${SUB_STYLE}">BT 검증 확인 · 함정 주의 · 진입 신중</div>
      </div>`;
    }
    const entry = btSt.entry || 0;
    const pnl = typeof btSt.pnl === 'number' ? btSt.pnl : 0;
    const isPlus = pnl >= 0;
    const pnlColor = isPlus ? 'var(--buy)' : 'var(--sell)';
    const pnlStr = (isPlus ? '+' : '') + pnl.toFixed(1) + '%';
    const entryStr = entry > 0 ? Math.round(entry).toLocaleString() + '원' : '—';

    // 진입 날짜 포맷 (예: "2026-04-06" → "4/6")
    let dateStr = '';
    if(btSt.entryDate){
      const raw = String(btSt.entryDate);
      const m = raw.match(/(\d{4})-?(\d{2})-?(\d{2})/);
      if(m){
        dateStr = parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
      }
    }

    // 보유 일수 계산 (entryDate 우선, entryIdx fallback)
    let holdText = '';
    if(btSt.entryDate){
      try{
        const entryDt = new Date(btSt.entryDate);
        const diffMs = Date.now() - entryDt.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        if(diffDays >= 0 && diffDays < 3650){
          holdText = diffDays + '일차';
        }
      }catch(e){}
    }
    if(!holdText && btSt.entryIdx != null && btSt.totalBars){
      const bars = btSt.totalBars - btSt.entryIdx;
      if(bars > 0) holdText = bars + '봉';
    }

    // TP/SL 라인 (BT 기준 = 엔진시뮬 포지션의 실제 목표/손절)
    let tpslLine = '';
    if(btSt.tp && btSt.sl){
      tpslLine = `<div style="${SUB_STYLE}">목표 ${Math.round(btSt.tp).toLocaleString()} / 손절 ${Math.round(btSt.sl).toLocaleString()}</div>`;
    }

    // [FIX-2] 회피 케이스는 분기 상단에서 이미 early return 처리됨
    //   → 여기 도달 시점은 회피가 아닌 정상 보유중 상태

    // [v1.6] partialHint 배지 — A긍정(strict) + TP/SL 70% 도달 시 활성
    //   '부분 익절 고려' (TP 근접) / '부분 청산 고려' (SL 근접)
    let partialBadge = '';
    if(svVerdict?.partialHint){
      const isProfit = svVerdict.partialHint.indexOf('익절') >= 0;
      const badgeColor = isProfit ? 'var(--buy)' : 'var(--sell)';
      const badgeBg = isProfit ? 'rgba(34,197,94,0.15)' : 'rgba(232,54,90,0.15)';
      partialBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 7px;font-size:10px;font-weight:700;color:${badgeColor};background:${badgeBg};border:1px solid ${badgeColor};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">${svVerdict.partialHint}</span>`;
    }

    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 보유중${partialBadge}</div>
      <div style="${MAIN_STYLE}"><span style="${ACCENT_STYLE_BUY}">▲${dateStr ? ' ' + dateStr : ''} 진입</span> @ ${entryStr}</div>
      <div style="${SUB_STYLE}">현재 <span style="color:${pnlColor};font-weight:800">${pnlStr}</span>${holdText ? ' · 보유 ' + holdText : ''}</div>
      ${tpslLine}
    </div>`;
  }

  // ── sell_signal: 엔진시뮬 매도 완료 (▼ 발생, 2봉 이내) ──
  if(btSt.state === 'sell_signal'){
    const pnl = typeof btSt.pnl === 'number' ? btSt.pnl : 0;
    const isWin = !!btSt.isWin;
    const pnlColor = isWin ? 'var(--buy)' : 'var(--sell)';
    const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(1) + '%';
    const label = isWin ? '익절' : '손절';
    const exitStr = btSt.exitPrice ? Math.round(btSt.exitPrice).toLocaleString() + '원' : '';
    let dateStr = '';
    if(btSt.exitDate){
      const m = String(btSt.exitDate).match(/(\d{4})-?(\d{2})-?(\d{2})/);
      if(m) dateStr = parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
    }
    const mainText = `<span style="${isWin ? ACCENT_STYLE_BUY : ACCENT_STYLE_SELL}">▼${dateStr ? ' ' + dateStr : ''} 매도</span>${exitStr ? ' @ ' + exitStr : ''}`;
    const subText = `<span style="color:${pnlColor};font-weight:800">${label} ${pnlStr}</span> · 다음 신호 대기 중`;

    // [v1.6] partialHint 배지 — 매도 완료 회고 (A긍정 → "다음엔 일부 남기는 전략")
    let partialBadge = '';
    if(svVerdict?.partialHint){
      const isProfit = svVerdict.partialHint.indexOf('익절') >= 0;
      const badgeColor = isProfit ? 'var(--buy)' : 'var(--sell)';
      const badgeBg = isProfit ? 'rgba(34,197,94,0.15)' : 'rgba(232,54,90,0.15)';
      partialBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 7px;font-size:10px;font-weight:700;color:${badgeColor};background:${badgeBg};border:1px solid ${badgeColor};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">${svVerdict.partialHint}</span>`;
    }

    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 완결${partialBadge}</div>
      <div style="${MAIN_STYLE}">${mainText}</div>
      <div style="${SUB_STYLE}">${subText}</div>
    </div>`;
  }

  // ── waiting: 비보유 상태 (C 판정에 따라 관찰 모드 or 회피 모드) ──
  if(btSt.state === 'waiting'){
    const verdictAction = svVerdict?.action || '';

    // 회피 계열: 엔진시뮬이 "진입 안 함" 명시
    if(verdictAction === '회피'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
        <div style="${MAIN_STYLE}">엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">이 종목은 현재 진입 부적합 · 다른 종목 탐색 권장</div>
      </div>`;
    }

    // 관심 계열: BT 검증 성공, 매수 타이밍 대기
    if(verdictAction === '관심'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 관찰</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">BT 검증 성공 · 매수 타이밍 대기 중</div>
      </div>`;
    }

    // 관망 계열: 분석만 좋고 BT 미검증
    if(verdictAction === '관망'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 보류</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">BT 미검증 · 함정 주의 · 진입 신중</div>
      </div>`;
    }

    // 그 외 (기본 waiting)
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
      <div style="${MAIN_STYLE}">엔진시뮬 포지션 없음</div>
      <div style="${SUB_STYLE}">매수 신호 대기 중</div>
    </div>`;
  }

  // fallback (이론상 도달 불가)
  return '';
}

// ═══════════════════════════════════════════════════════════════
// S114: 엔진판단 검증 실행 함수 (_runEngineVerify)
//   역할: 분석탭의 "엔진판단 검증" 버튼 클릭 시 단일검증 [▶ 백테스트 실행]과 동일한 동작 수행
//   흐름:
//     1. 사용자가 분석탭에서 "엔진판단 검증 ▶" 클릭
//     2. 내부적으로 단일검증 탭 활성화 (btRunBasic이 단일검증 탭 DOM 요소 참조)
//     3. btRunBasic() 호출 → sx_bt.js 경로 B로 400→600봉 확장 + BT 재실행
//     4. btRunBasic 완료 시 stock._needsAnalRerender = true (S112-fix2 기존 로직)
//     5. switchAnalTab(원래 탭) 복귀 → 분석탭 자동 재렌더 (결과 카드 갱신)
//
//   주의:
//     - 미국 시장은 이미 range=2y로 500봉+ 확보 → btRunBasic 경로 B에서 확장 없이 BT만 재실행
//     - 한국/코인은 400봉 → +200봉 확장 후 BT 재실행 (경로 B 자동 처리)
//     - 단일검증 탭 [▶ 백테스트 실행] 버튼은 그대로 유지 (옵션 조정 후 재실행 가능)
//
//   프로젝트 C v3.0 원칙:
//     - 원칙 ⑤ "정합 우선": 분석탭과 단일검증이 같은 BT 결과 공유 (양방향 동기화)
//     - 원칙 ⑧ "검증가능성": 엔진판단 근거가 실제 BT 결과로 검증됨
// ═══════════════════════════════════════════════════════════════
async function _runEngineVerify(stock){
  if(!stock){
    console.warn('[S115/_runEngineVerify] stock 없음');
    return;
  }
  if(stock._engineVerifyRunning){
    console.log('[S115/_runEngineVerify] 이미 실행 중 — 중복 호출 무시');
    return;
  }
  console.log(`[S115/_runEngineVerify] 엔진판단 검증 시작 (백그라운드): ${stock.name||stock.code}`);
  stock._engineVerifyRunning = true;

  // 진행 토스트 (탭 전환 없음 — 현재 분석탭 유지)
  if(typeof toast === 'function') toast('⏳ 엔진판단 검증 실행 중...');

  try {
    // ─── 의존성 체크 ───
    if(typeof sxRunBtEngine !== 'function'){
      console.error('[S115] sxRunBtEngine 함수 없음');
      if(typeof toast === 'function') toast('❌ BT 엔진 미로드');
      return;
    }
    if(typeof btFetchCandles !== 'function'){
      console.error('[S115] btFetchCandles 함수 없음');
      if(typeof toast === 'function') toast('❌ 캔들 fetch 함수 미로드');
      return;
    }

    // ─── TF / 시장 판별 (sx_bt.js _btTF/_btIsCoin와 동일 로직) ───
    const _tf = (typeof _analTF !== 'undefined' && _analTF) ? _analTF : (typeof currentTF !== 'undefined' ? currentTF : 'day');
    const _isCoin = (typeof currentMarket !== 'undefined') && currentMarket === 'coin';
    const _isExtSupported = (typeof currentMarket !== 'undefined') && (currentMarket === 'coin' || currentMarket === 'kr');
    const _targetCount = (_tf === 'week' || _tf === 'month') ? 400 : 600;

    let rows = null;

    // ─── 경로 A: _lastAnalCandles가 이미 목표 봉수 충족 (재사용) ───
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      rows = stock._lastAnalCandles.slice(-_targetCount);
      console.log(`[S115] 경로 A — 캐시 재사용: ${rows.length}봉`);
    }
    // ─── 경로 B: 부분 캐시(400봉) + 확장 가능 → +200봉 확장 ───
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      const _existing = stock._lastAnalCandles.slice();
      const _needed = _targetCount - _existing.length;
      if(_needed > 0){
        try{
          console.log(`[S115] 경로 B — ${_existing.length}봉 → ${_targetCount}봉 확장 (2초 대기)`);
          await new Promise(r => setTimeout(r, 2000));
          const _oldestDate = _existing[0].date;
          const _extra = await fetchCandlesExtended(stock.code, _tf, _oldestDate, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            console.log(`[S115] 경로 B 완료: ${_extra.length} + ${_existing.length} = ${rows.length}봉`);
          } else {
            console.warn('[S115] 경로 B 확장 실패 — 기존 봉수로 실행');
            rows = _existing;
          }
        }catch(e){
          console.warn('[S115] 경로 B 확장 예외:', e);
          rows = _existing;
        }
      } else {
        rows = _existing;
      }
      // 확장 결과 _lastAnalCandles 동기화 (S112-fix1 양방향 공유 원칙)
      if(rows && rows.length > _existing.length){
        stock._lastAnalCandles = rows.slice();
        if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
        else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
      }
    }
    // ─── 경로 C: 캐시 없음 + 시장 지원 → 200봉부터 3단계 확장 ───
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      console.log(`[S115] 경로 C — 새 3단계 확장 시작 (목표 ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _isCoin, _tf, 200);
      if(!_first || _first.length === 0){
        throw new Error('초기 200봉 로드 실패');
      }
      rows = _first;
      // 2단계: 400봉
      if(_targetCount > 200){
        await new Promise(r => setTimeout(r, 2000));
        try{
          const _extra1 = await fetchCandlesExtended(stock.code, _tf, rows[0].date, 200);
          if(_extra1 && _extra1.length > 0) rows = [..._extra1, ...rows];
        }catch(e){ console.warn('[S115] 경로 C 2단계 예외:', e); }
      }
      // 3단계: 600봉
      if(_targetCount > 400 && rows.length >= 400){
        await new Promise(r => setTimeout(r, 2000));
        try{
          const _extra2 = await fetchCandlesExtended(stock.code, _tf, rows[0].date, 200);
          if(_extra2 && _extra2.length > 0) rows = [..._extra2, ...rows];
        }catch(e){ console.warn('[S115] 경로 C 3단계 예외:', e); }
      }
      stock._lastAnalCandles = rows.slice();
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
    }
    // ─── 경로 D: 시장 미지원 (미국 등) — range 확장 결과 그대로 사용 ───
    else {
      const _count = (_tf === 'week' || _tf === 'month') ? 400 : 300;
      rows = await btFetchCandles(stock.code, _isCoin, _tf, _count);
      console.log(`[S115] 경로 D — 시장 미지원, 단일 fetch: ${rows?.length||0}봉`);
    }

    if(!rows || rows.length === 0){
      throw new Error('캔들 데이터 수집 실패');
    }

    // ─── BT 실행 (단일검증과 동일 파라미터) ───
    const params = (typeof btGetParams === 'function') ? btGetParams() : { buyTh:62, sellTh:38, tpMult:2.5, slMult:1.5 };
    // btGetOpts는 단일검증 탭 DOM(#btOptSlip/#btOptNextBar) 참조하나 없으면 기본값 사용
    const opts = (typeof btGetOpts === 'function') ? btGetOpts() : { slippage:0.001, nextBarEntry:false };

    // S163-diag: 분석탭 _runEngineVerify의 rows 진단 로그 (교차검증과 비교용)
    try{
      const _first = rows[0], _last = rows[rows.length-1];
      const _fDate = _first.date || _first.t || '?';
      const _lDate = _last.date || _last.t || '?';
      const _fClose = _first.close ?? _first.c ?? '?';
      const _lClose = _last.close ?? _last.c ?? '?';
      console.log(`[S163-diag] [분석탭] ${stock.name||stock.code} rows: ${rows.length}봉 · 첫=${_fDate}(C${_fClose}) · 끝=${_lDate}(C${_lClose})`);
    }catch(_){}

    const r = sxRunBtEngine(rows, _tf, params, opts);
    r.rowsLength = rows.length;

    if(r.error){
      console.error('[S115] BT 엔진 오류:', r.error);
      if(typeof toast === 'function') toast('❌ ' + r.error);
      return;
    }

    // ─── 결과 저장 ───
    stock._btResult = r;
    if(typeof calcBtScore === 'function') stock._btScore = calcBtScore(r);
    const _curPrice = rows[rows.length-1]?.close || stock.price || 0;
    if(typeof btGetCurrentState === 'function') stock._btState = btGetCurrentState(r, _curPrice);
    console.log(`[S115] ✅ BT 완료: 거래 ${r.totalTrades}회, 승률 ${r.winRate}%, ${rows.length}봉 기준`);

    // ═══════════════════════════════════════════════════════════════
    // S120-2: 강건성 배지 — 200봉 BT 추가 계산 + 편차 판정
    // ═══════════════════════════════════════════════════════════════
    //   → 200봉 vs 600봉 수익률 편차 비교로 구간 의존성(과적합) 탐지
    //
    // [판정 로직]
    //   rows.length >= 400 일 때만 실행 (200봉 slice + 200봉 이상 차이 보장)
    //   200봉 BT를 rows.slice(-200)로 재실행 (네트워크 추가 없음, CPU만 사용)
    //   편차 = |pnl200 - pnl600| / max(|pnl600|, 1)
    //     편차 < 20% → 🌱 신뢰 (robust)
    //     편차 ≥ 20% → ⚠️ 불안 (fragile, 과적합 의심)
    //   거래수 둘 다 >= 3 아니면 null (표본 부족 → 배지 숨김)
    //
    // [저장]
    //   stock._btResult_200 = 200봉 BT 결과
    //   stock._robustness = { label, deviation, pnl200, pnl600, show }
    //
    //   🌱 신뢰: 살아있고 건강하게 자라는 느낌 ("과적합" 전문용어 회피)
    //   ⚠️ 불안: 감정적 직관 ("구간 의존성" 대신 "불안"으로 즉각 이해)
    // ═══════════════════════════════════════════════════════════════
    try {
      if(rows.length >= 400 && typeof sxRunBtEngine === 'function'){
        const _rows200 = rows.slice(-200); // 최근 200봉
        const _r200 = sxRunBtEngine(_rows200, _tf, params, opts);
        if(!_r200.error && typeof _r200.totalPnl === 'number'){
          stock._btResult_200 = _r200;

          const _pnl600 = r.totalPnl || 0;
          const _pnl200 = _r200.totalPnl || 0;
          const _trades600 = r.totalTrades || 0;
          const _trades200 = _r200.totalTrades || 0;

          // 거래수 표본 체크 (둘 다 3건 이상이어야 의미있음)
          if(_trades600 >= 3 && _trades200 >= 3){
            // 편차 계산: |pnl200 - pnl600| / max(|pnl600|, 1)  (1% 이하 분모는 1로 고정해 과민 반응 방지)
            const _base = Math.max(Math.abs(_pnl600), 1);
            const _deviation = Math.abs(_pnl200 - _pnl600) / _base;

            stock._robustness = {
              label: _deviation < 0.2 ? 'trust' : 'fragile',
              deviation: _deviation,
              pnl200: _pnl200,
              pnl600: _pnl600,
              trades200: _trades200,
              trades600: _trades600,
              show: true
            };
            console.log(`[S120] 🌱 강건성: ${stock._robustness.label === 'trust' ? '신뢰' : '불안'} — 편차 ${(_deviation*100).toFixed(1)}% (200봉 ${_pnl200.toFixed(1)}% vs 600봉 ${_pnl600.toFixed(1)}%)`);
          } else {
            stock._robustness = { show: false, reason: 'insufficient_trades' };
            console.log(`[S120] 강건성 배지 숨김 — 거래수 부족 (200봉 ${_trades200}, 600봉 ${_trades600})`);
          }
        } else {
          stock._robustness = { show: false, reason: 'bt200_error' };
        }
      } else {
        stock._robustness = { show: false, reason: 'insufficient_bars' };
        console.log(`[S120] 강건성 배지 스킵 — 봉수 부족 (${rows.length}봉 < 400봉)`);
      }
    } catch(robErr){
      console.warn('[S120] 강건성 계산 예외:', robErr);
      stock._robustness = { show: false, reason: 'exception' };
    }

    // btRenderBasicResult가 단일검증 탭의 #btBasicResult DOM에 결과 렌더
    // 탭이 현재 안 보여도 DOM은 존재 (display:none) → 렌더만 해두면 나중에 단일검증 탭 들어갈 때 바로 보임
    try {
      if(typeof btRenderBasicResult === 'function'){
        btRenderBasicResult(stock, r);
        // btBasicResult 영역 표시 (display:none으로 숨겨져 있을 수 있음)
        const _btResultEl = document.getElementById('btBasicResult');
        if(_btResultEl) _btResultEl.style.display = 'block';
        console.log('[S115] ✅ 단일검증 탭 결과 동기화 완료');
      }
    } catch(e) { console.warn('[S115] 단일검증 탭 렌더 예외:', e); }

    // localStorage 저장
    if(typeof _btSaveBtResult === 'function'){
      try{ _btSaveBtResult(stock, r); }catch(e){ console.warn('[S115] _btSaveBtResult 예외:', e); }
    }

    // 관심종목 캐시 갱신 (기존 S110 로직)
    try{
      if(_tf === 'day' && typeof _isInWatchlist === 'function' && typeof _watchBtSet === 'function' && _isInWatchlist(stock.code)){
        _watchBtSet(stock, r, 'day');
      }
    }catch(e){ console.warn('[S115] watch cache update err', e); }

    if(typeof toast === 'function') toast(`✅ 엔진판단 검증 완료 (거래 ${r.totalTrades}, 승률 ${r.winRate}%)`);

    // ─── 분석탭 재렌더 (결과 카드 갱신) ───
    // stock._engineVerifyOpen 플래그는 버튼 onclick에서 이미 true로 세팅됨
    // → 재렌더 시 카드가 처음부터 display:block으로 그려짐 (열림 유지)
    if(typeof _analTabIdx !== 'undefined' && _analTabIdx === 0 && typeof currentAnalStock !== 'undefined' && currentAnalStock === stock){
      if(typeof runAnalysis === 'function'){
        await runAnalysis(stock);
        console.log('[S115] 분석탭 즉시 재렌더 완료 (엔진판단 검증 카드 열림 유지)');
      }
    } else {
      // 다른 탭에 있으면 플래그로 이관 (S112-fix2)
      stock._needsAnalRerender = true;
    }
  } catch(e) {
    console.error('[S115/_runEngineVerify] 실행 오류:', e);
    if(typeof toast === 'function') toast('❌ 엔진판단 검증 실패: ' + e.message);
  } finally {
    stock._engineVerifyRunning = false;
  }
}
// 전역 노출 (onclick 핸들러에서 호출)
window._runEngineVerify = _runEngineVerify;


// S108 Phase 3-B-9a-ext: 수동 데이터 확장 (? 버튼 클릭 트리거)
//   현재 stage 기준 +200봉 로드 → 기존 데이터와 병합 → BT 재실행 → UI 재렌더
//   stage 전이:
//     0 (200봉) → 클릭 불가 (자동으로 stage 1로 전환되었어야 함)
//     1 (400봉) → 2 (600봉) — 대부분의 케이스
//     2 (600봉) → 호출되지 않음 (버튼 자체가 표시 안 됨)
//
//   흐름:
//     1. stage 플래그 선점 (중복 호출 방지) + 로딩 UX 표시
//     2. 현재 _analCandles의 가장 오래된 봉 날짜로 fetchCandlesExtended 호출
//     3. 새 200봉을 기존 데이터 앞에 병합 ([새 200 + 기존 400] = 600)
//     4. BT 재실행 → 결과 교체
//     5. runAnalysis 재호출 (UI 완전 재렌더)
//
//   실패 시: stage 플래그 원복, 기존 결과 유지, 경고 토스트
async function _loadMoreCandles(stock){
  if(!stock){
    console.warn('[S108-9aExt] stock 없음');
    return;
  }
  const _curStage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
  if(_curStage >= 2){
    console.log('[S108-9aExt] 이미 최대 확장 (600봉) — 건너뜀');
    return;
  }
  const _mkt = stock._mkt || stock.market || currentMarket;
  if(_mkt !== 'coin' && _mkt !== 'kr'){
    console.warn(`[S108-9aExt] 시장 미지원: ${_mkt}`);
    return;
  }
  if(typeof fetchCandlesExtended !== 'function'){
    console.warn('[S108-9aExt] fetchCandlesExtended 미로드');
    return;
  }

  // 현재 _analCandles 확보 — runAnalysis에서 확장된 상태면 400봉, 아니면 200봉
  //   _analCandles는 runAnalysis 안의 지역 변수라 stock._btResult.trades나 indicators로 접근
  //   간단히 stock._lastAnalCandles에 저장되어 있다면 사용, 없으면 재분석 트리거
  const _existingCandles = stock._lastAnalCandles || null;
  if(!_existingCandles || _existingCandles.length === 0){
    console.warn('[S108-9aExt] 기존 캔들 없음 — runAnalysis 재실행으로 대체');
    stock._analCandlesExtendedStage = 2; // 재실행 시 자동 2단계 로드되도록
    if(typeof runAnalysis === 'function') runAnalysis(stock);
    return;
  }

  console.log(`[S108-9aExt] ★ 수동 확장 시작 (stage ${_curStage} → ${_curStage+1}): 현재 ${_existingCandles.length}봉`);

  // 로딩 UX — "?" 버튼이 있던 배너 자리에 로딩 표시
  const _btBanner = document.querySelector('.bt-banner');
  if(_btBanner){
    const _loading = document.createElement('div');
    _loading.id = 'sxLoadMoreOverlay';
    _loading.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;border-radius:inherit;z-index:10;color:#fff;font-size:12px;font-weight:700';
    _loading.innerHTML = '📈 +200봉 로드 중... (2초 대기)';
    _btBanner.style.position = 'relative';
    _btBanner.appendChild(_loading);
  }

  // stage 플래그 선점 (중복 클릭 방지)
  stock._analCandlesExtendedStage = _curStage + 1;

  try{
    const _oldestDate = _existingCandles[0].date;
    console.log(`[S108-9aExt] oldestDate=${_oldestDate}, 확장 API 호출 중...`);
    const _extra = await fetchCandlesExtended(stock.code, _analTF, _oldestDate, 200);
    console.log(`[S108-9aExt] 확장 응답: ${_extra ? _extra.length + '봉' : 'null'}`);

    if(!_extra || _extra.length === 0){
      // 실패 — stage 원복
      console.warn('[S108-9aExt] ⚠ 확장 실패 (null/빈배열) — stage 원복');
      stock._analCandlesExtendedStage = _curStage;
      if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
      alert('⚠ 데이터 확장 실패\n\n서버에서 추가 데이터를 가져오지 못했습니다.\n잠시 후 다시 시도해주세요.');
      return;
    }

    // 병합 [새 200봉, 기존 400봉 또는 200봉] = 오래된 순 정렬 유지
    const _merged = [..._extra, ..._existingCandles];
    console.log(`[S108-9aExt] 병합 완료: ${_extra.length} + ${_existingCandles.length} = ${_merged.length}봉`);

    // BT 재실행 (확장 데이터로)
    const _btParams = typeof btGetParams === 'function' ? btGetParams() : {};
    const _rawMerged = _merged.map(c => ({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
    const _btR = SXE.runBtEngine(_rawMerged, _analTF, _btParams);
    if(_btR && !_btR.error){
      const _tr = _btR.totalTrades ?? 0;
      console.log(`[S108-9aExt] ✅ BT 재실행 성공: 거래 ${_tr}회 (점수: ${calcBtScore(_btR)}) — ${_merged.length}봉 기준`);
      stock._btResult = _btR;
      stock._btScore = calcBtScore(_btR);
      const _curPrice = _merged[_merged.length-1]?.close || stock.price || 0;
      stock._btState = typeof btGetCurrentState === 'function' ? btGetCurrentState(_btR, _curPrice) : null;
      // 다음 재분석에서 확장된 캔들 사용하도록 보존
      stock._lastAnalCandles = _merged;
    } else {
      console.warn(`[S108-9aExt] BT 재실행 실패:`, _btR?.error);
      stock._analCandlesExtendedStage = _curStage;
      if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
      alert('⚠ BT 재실행 실패\n\n' + (_btR?.error || '알 수 없는 오류'));
      return;
    }

    // S108 Phase 3-B-9a-ext fix2: 재렌더 전 펼침 상태 캡처 (매수 근거 상세, 매매 근거 상세 등)
    //   문제: runAnalysis 재호출 → DOM 재생성 → 펼쳐진 아코디언이 전부 닫힘
    //   해결: 현재 펼쳐진 토글의 라벨 텍스트를 캡처 → 재렌더 후 같은 라벨 찾아서 다시 펼침
    //   ID는 매번 랜덤 생성되므로(btGuide_xxx), 안정적인 라벨 텍스트 매칭 사용
    //
    //   3차 fix3: "엔진판단 근거" / "진입 검토" 버튼은 itp-toggle-inline 아님 (style.display 토글)
    //     → onclick 속성에서 getElementById('xxx') 참조 타겟을 찾아서 style.display === 'block' 확인
    //     → 버튼 라벨(예: "엔진판단 근거 ▶ 매수 근거 65점") 기반으로 라벨 키 생성
    //
    //   4차 fix4: 스크롤 위치 보존 — 재렌더 후 페이지 맨 위로 튀는 문제 해결
    //     analBody는 스크롤 컨테이너 (overlay 내부), 따라서 scrollTop 캡처
    //     window.scrollY도 함께 캡처 (폴백)
    const _openLabels = [];      // .itp-toggle-inline (.show 클래스 토글)
    const _foldOpenLabels = [];  // .anal-fold (.fold-open 클래스 토글)
    const _displayOpenKeys = []; // style.display 인라인 토글 (엔진판단 근거, 진입 검토 등)
    let _scrollTop = 0;
    let _windowScrollY = 0;
    try{
      // ① 인라인 토글 (.itp-toggle-inline .show)
      document.querySelectorAll('#analBody .itp-toggle-inline').forEach(toggle => {
        const target = toggle.nextElementSibling;
        if(target && target.classList.contains('show')){
          const label = toggle.textContent.trim().replace(/^[▶▼]\s*/, '');
          if(label) _openLabels.push(label);
        }
      });      // ② anal-fold 섹션 (.fold-open)
      document.querySelectorAll('#analBody .anal-fold.fold-open').forEach(fold => {
        const hdr = fold.querySelector('.anal-fold-hdr');
        if(hdr){
          const label = hdr.textContent.trim().replace(/^[▶▼]\s*/, '');
          if(label) _foldOpenLabels.push(label);
        }
      });
      // ③ style.display 토글 (엔진판단 근거, 진입 검토 등)
      //    onclick 속성에 getElementById('xxx')가 있는 클릭 가능한 요소 순회
      //    → 해당 타겟이 display:block 상태면 캡처
      document.querySelectorAll('#analBody [onclick]').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        const m = oc.match(/getElementById\(['"]([^'"]+)['"]\)/);
        if(!m) return;
        const target = document.getElementById(m[1]);
        if(!target) return;
        // style.display === 'block' 이거나 style.display 없고 실제 visible
        const disp = target.style.display;
        if(disp === 'block'){
          // 버튼 라벨 추출 — "엔진판단 근거 ▶ 매수 근거 65점" 같은 텍스트에서
          //   "엔진판단 근거" 같은 앞부분만 추출 (변동하는 점수 부분 제외)
          const fullLabel = btn.textContent.trim();
          // 변동 값 포함 라벨은 첫 단어 2~3개만 키로 사용 (안정성)
          const shortKey = fullLabel.split(/[▶▼\s]+/).slice(0, 2).join(' ').trim();
          if(shortKey) _displayOpenKeys.push(shortKey);
        }
      });
      // ④ 스크롤 위치 캡처 (analBody 내부 + window 양쪽)
      //    analBody는 overlay 내부의 스크롤 컨테이너 — 실제 스크롤이 여기서 발생
      const _analBody = document.getElementById('analBody');
      if(_analBody) _scrollTop = _analBody.scrollTop || 0;
      _windowScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      console.log(`[S108-9aExt] 펼침 상태 캡처: inline=${_openLabels.length}, fold=${_foldOpenLabels.length}, display=${_displayOpenKeys.length} [${_displayOpenKeys.join(', ')}], scroll=${_scrollTop}/${_windowScrollY}`);
    }catch(capErr){ console.warn('[S108-9aExt] 상태 캡처 에러:', capErr); }

    // runAnalysis 재호출 — UI 완전 재렌더 (stock._lastAnalCandles 재사용으로 600봉 유지)
    if(typeof runAnalysis === 'function'){
      await runAnalysis(stock);

      // S108 Phase 3-B-9a-ext fix2: 재렌더 후 펼침 상태 복원
      //   DOM 업데이트가 완료되도록 약간의 지연 후 실행
      (window._sxTrackedTimeout || setTimeout)(() => {
        try{
          let restoredInline = 0, restoredFold = 0, restoredDisp = 0;
          // ① 인라인 토글 복원
          document.querySelectorAll('#analBody .itp-toggle-inline').forEach(toggle => {
            const label = toggle.textContent.trim().replace(/^[▶▼]\s*/, '');
            if(_openLabels.includes(label)){
              const target = toggle.nextElementSibling;
              if(target && !target.classList.contains('show')){
                target.classList.add('show');
                const arrow = toggle.querySelector('.sb-arrow');
                if(arrow) arrow.textContent = '▼';
                restoredInline++;
              }
            }
          });
          // ② fold-open 복원
          document.querySelectorAll('#analBody .anal-fold').forEach(fold => {
            const hdr = fold.querySelector('.anal-fold-hdr');
            if(!hdr) return;
            const label = hdr.textContent.trim().replace(/^[▶▼]\s*/, '');
            if(_foldOpenLabels.includes(label) && !fold.classList.contains('fold-open')){
              fold.classList.add('fold-open');
              restoredFold++;
            }
          });
          // ③ style.display 토글 복원
          document.querySelectorAll('#analBody [onclick]').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            const m = oc.match(/getElementById\(['"]([^'"]+)['"]\)/);
            if(!m) return;
            const target = document.getElementById(m[1]);
            if(!target) return;
            const fullLabel = btn.textContent.trim();
            const shortKey = fullLabel.split(/[▶▼\s]+/).slice(0, 2).join(' ').trim();
            if(_displayOpenKeys.includes(shortKey) && target.style.display !== 'block'){
              target.style.display = 'block';
              restoredDisp++;
            }
          });
          console.log(`[S108-9aExt] 펼침 상태 복원: inline=${restoredInline}/${_openLabels.length}, fold=${restoredFold}/${_foldOpenLabels.length}, display=${restoredDisp}/${_displayOpenKeys.length}`);
          // S108 fix4: 스크롤 위치 복원 (펼침 상태 복원 후 레이아웃 확정된 상태에서 실행)
          //   analBody는 overlay 내부 스크롤 컨테이너 — scrollTop 복원
          //   window.scrollY도 폴백으로 복원
          const _analBody2 = document.getElementById('analBody');
          if(_analBody2 && _scrollTop > 0) _analBody2.scrollTop = _scrollTop;
          if(_windowScrollY > 0) window.scrollTo(0, _windowScrollY);
          console.log(`[S108-9aExt] 스크롤 복원: analBody=${_scrollTop}, window=${_windowScrollY}`);
        }catch(restErr){ console.warn('[S108-9aExt] 상태 복원 에러:', restErr); }
      }, 100);
    }
  }catch(e){
    console.error('[S108-9aExt] 예외:', e);
    stock._analCandlesExtendedStage = _curStage; // 원복
    if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
    alert('⚠ 예외 발생\n\n' + (e.message || e));
  }
}

// S62: BT 배너 생성 (종합행동지침 — 진입 검토×매매전략 교차 판정)
function _buildBtBanner(stock, qs){
  const btData = _getBtData(stock);

  // S79: BT 비지원 TF 체크
  const _btMkt = stock._mkt || stock.market || currentMarket;
  if(!_isBtSupportedTF(_btMkt, _analTF)){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">매매전략 — 데이터 부족</div></div>
      <div class="bt-action-line neutral">현재 타임프레임은 백테스트 미지원</div>
      <div class="bt-banner-body">이 타임프레임에서는 충분한 매매 데이터를 확보할 수 없습니다. 관심종목에 등록하고 지원 TF에서 거래 10회 이상 누적 후 확인하세요.</div>
    </div>`;
  }

  // 검증 시점 포맷
  let btDateStr = '';
  if(btData && btData.saved_at){
    try{
      const dt = new Date(btData.saved_at);
      btDateStr = (dt.getMonth()+1)+'/'+dt.getDate()+' '+(dt.getHours()<10?'0':'')+dt.getHours()+':'+(dt.getMinutes()<10?'0':'')+dt.getMinutes()+' 검증';
    }catch(e){}
  }

  // S108 Phase 3-B-9a-ext: "?" 버튼을 도움말 → 수동 확장(+200봉) 버튼으로 교체
  //   기존 도움말은 구버전(진입 검토/매매전략 의미가 이미 바뀜, C 9종 판정 체계와 불일치)
  //   새 역할: 데이터 부족 상태에서 "?" 클릭 시 추가 200봉 로드 → BT 재실행 → UI 재렌더
  //   표시 조건: trades < BT_MIN_TRADES AND stage < 2 (최대 2단계 = 600봉)
  //   아이콘 "?"는 유지 (이미 익숙한 위치, 학습 비용 0)
  //
  //   stage 플래그:
  //     0 → 200봉 (스캐너 기본)
  //     1 → 400봉 (분석탭 진입 시 자동 확장 완료)
  //     2 → 600봉 (? 버튼 클릭 시 수동 확장 완료, 최대)
  const _extStageNow = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
  const _extMktBanner = stock._mkt || stock.market || currentMarket;
  const _extSupportedBanner = (_extMktBanner === 'coin' || _extMktBanner === 'kr');
  // helpBtn은 이제 loadMoreBtn — 조건 충족 시 버튼, 아니면 빈 문자열
  //   조건: (1) 시장 지원 (2) stage < 2 (3) 현재 부족 상태 — 버튼 생성부에서는 (1)+(2)만 체크
  //   실제 표시는 각 분기에서 isInsufficient 조건과 함께 결정 (아래 _loadMoreBtn 사용)
  const _canExpand = _extSupportedBanner && _extStageNow < 2 && typeof fetchCandlesExtended === 'function';
  // S114: ? 버튼 UI만 숨김 — _loadMoreCandles 함수와 _canExpand 로직은 보존 (혹시 모를 다른 조건 대비)
  //   엔진판단 검증 버튼이 역할 대체 (400→600봉 확장 + BT 재실행)
  //   원본: const _loadMoreBtn = _canExpand ? `<span class="bt-help-btn" onclick="_loadMoreCandles(currentAnalStock)" title="+200봉 추가 로드 (현재 ${200+_extStageNow*200}봉 → ${200+(_extStageNow+1)*200}봉)">?</span>` : '';
  const _loadMoreBtn = '';  // S114: UI 숨김 (복원 시 위 원본 주석 참고)
  // 하위 호환: 기존 helpBtn/helpHTML 이름 유지 (다른 분기에서 참조)
  const helpBtn = _loadMoreBtn;
  const helpHTML = ''; // 도움말 HTML 완전 제거 (구버전 내용 — C 9종 판정 체계와 불일치)

  // S109 Phase 3-B-9a-ext-fix5: analScore/analGood은 이제 배너에서 사용 안 함 (원칙 ① 독자 판정 제거)
  //   이전엔 analGood × btGood 2×2 판정에 사용 → 이제 5카드 요약만 표시
  //   변수는 하위 호환 위해 유지 (제거 시 아래 분기에서 참조 리스크)
  const analScore = qs ? qs.score : 0;
  const analGood = analScore >= 60;

  // BT 미실행
  if(!btData){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">전략 미검증</div>${helpBtn}</div>
      <div class="bt-action-line neutral">단일검증 탭에서 백테스트 후 교차 판단 가능</div>
      <div class="bt-banner-body">진입 검토 ${analScore}점 — 매매전략 미실행. 진입 검토만으로는 전략의 과거 성과를 알 수 없습니다. 단일검증 탭에서 백테스트를 실행하면 두 점수를 교차 비교할 수 있습니다.</div>
      ${helpHTML}
    </div>`;
  }

  const pnl = btData.totalPnl ?? 0;
  const wr = btData.winRate ?? 0;
  const trades = btData.totalTrades ?? 0;
  const mdd = btData.mdd ?? 0;
  const pf = btData.profitFactor ?? 0;

  // 거래 0건
  if(trades === 0){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">거래 신호 없음</div>${helpBtn}</div>
      <div class="bt-action-line neutral">검증 기간 내 매매 신호 미발생</div>
      <div class="bt-banner-body">설정한 조건에서 매매 신호가 발생하지 않았습니다. 타임프레임이나 임계값을 조정하여 재검증을 권장합니다.</div>
      ${btDateStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px;text-align:right">${btDateStr}</div>`:''}
      ${helpHTML}
    </div>`;
  }

  // S93: 거래수 기반 신뢰도 3색 (점수는 항상 표시)
  let _bReliLabel='', _bReliColor='';
  if(trades < BT_MIN_TRADES){ _bReliLabel='데이터 부족'; _bReliColor='var(--sell)'; }
  else if(trades < 30){ _bReliLabel='데이터 충족'; _bReliColor='var(--accent)'; }
  else { _bReliLabel='데이터 충분'; _bReliColor='var(--buy)'; }

  // S109 Phase 3-B-9a-ext-fix5: 배너 정합성 수정 (원칙 ① 독자 판정 금지 + ⑦ 시간적 일관성)
  //   문제:
  //     (1) trades<10일 때는 "매매전략 — 데이터 부족" 타이틀
  //     (2) trades≥10일 때는 "종합행동지침 — 데이터 충족" 타이틀 (역할 변경!)
  //     (3) analScore×btScore 2×2 독자 판정 ("진입 적기/단기급등/관심/회피")
  //     → 원칙 ⑦ 시간적 일관성 위배 + 원칙 ① 독자 판정 금지 위배
  //
  //   해결: 배너 역할을 "BT 데이터 품질 + 성과 숫자"로 고정
  //     - 타이틀: 항상 "매매전략 — 데이터 XX"
  //     - 내용: 5개 카드 [승률][수익][거래][MDD][손익비]
  //     - 데이터 부족 시: 거래 수와 손익비는 표시, 나머지는 "?"
  //     - actionText("진입 적기" 등) 완전 제거 — C 판정은 이미 상단 배지/매수 근거 평가 카드에 있음
  //
  //   거래 0건 특수 케이스만 예외적으로 유지 (표시할 숫자가 없으므로)
  if(trades === 0){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">매매전략 — <span style="color:var(--text3);font-weight:700">거래 없음</span></div>${helpBtn}</div>
      <div class="bt-banner-body" style="padding:8px 10px;font-size:11px;color:var(--text3)">검증 기간 내 매매 신호가 발생하지 않았습니다. 타임프레임이나 임계값을 조정하거나 관심종목 등록 후 재검증하세요.</div>
      ${helpHTML}
    </div>`;
  }

  const btScore = calcBtScore(btData);

  // 5카드 생성 함수 — 데이터 부족 시 승률/수익/MDD만 "?"로, 거래/손익비는 항상 표시
  const _insufficient = trades < BT_MIN_TRADES;
  const _fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  // 손익비: BT 결과의 평균이익/평균손실 비율 (없으면 fallback)
  const avgWin = btData.avgWin ?? (btData.avgProfit > 0 ? btData.avgProfit : 0);
  const avgLoss = btData.avgLoss ?? (btData.avgProfit < 0 ? Math.abs(btData.avgProfit) : 0);
  let _rrLabel = '—';
  if(avgWin > 0 && avgLoss > 0){
    const ratio = avgWin / avgLoss;
    _rrLabel = ratio >= 1 ? `${ratio.toFixed(1)} : 1` : `1 : ${(1/ratio).toFixed(1)}`;
  } else if(pf > 0){
    // avgWin/avgLoss 없으면 PF로 추정 표시
    _rrLabel = `PF ${pf.toFixed(2)}`;
  }

  const _cardStyle = 'flex:1;min-width:0;background:var(--surface2);border-radius:6px;padding:6px 3px;text-align:center';
  const _labelStyle = 'font-size:9px;color:var(--text3);font-weight:600;letter-spacing:-.2px';
  const _valueStyle = 'font-size:11px;font-weight:800;margin-top:2px;line-height:1.2;letter-spacing:-.3px';

  const _wrColor = _insufficient ? 'var(--text3)' : (wr >= 50 ? 'var(--buy)' : wr >= 35 ? 'var(--accent)' : 'var(--sell)');
  const _pnlColor = _insufficient ? 'var(--text3)' : (pnl > 0 ? 'var(--buy)' : pnl < 0 ? 'var(--sell)' : 'var(--text)');
  const _mddColor = _insufficient ? 'var(--text3)' : (mdd < 10 ? 'var(--buy)' : mdd < 20 ? 'var(--accent)' : 'var(--sell)');
  const _trColor = _insufficient ? 'var(--sell)' : (trades < 30 ? 'var(--accent)' : 'var(--buy)');

  const _statsGrid = `<div style="display:flex;gap:4px;margin-top:8px">
    <div style="${_cardStyle}"><div style="${_labelStyle}">승률</div><div style="${_valueStyle};color:${_wrColor}">${_insufficient?'?':wr.toFixed(1)+'%'}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">수익</div><div style="${_valueStyle};color:${_pnlColor}">${_insufficient?'?':_fmtPct(pnl)}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">거래</div><div style="${_valueStyle};color:${_trColor}">${trades}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">MDD</div><div style="${_valueStyle};color:${_mddColor}">${_insufficient?'?':mdd.toFixed(2)+'%'}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">손익비</div><div style="${_valueStyle};color:var(--text)">${_rrLabel}</div></div>
  </div>`;

  // S109 Phase 3-B-9a-ext-fix6: 데이터 부족 시 안내 분기
  //   stage 0~1 (아직 확장 가능): "거래 N회 / 최소 10회 필요 — 신뢰도 주의"
  //   stage 2 (최대 확장 도달, 600봉): "최대 확장 완료 — [권장 TF] 전환 권장"
  //
  //   TF 전환 권장 맵 (600봉 커버리지 기준):
  //     국내: 60분(50일) → 일봉 / 일봉(2.4년) → 주봉 / 주봉·월봉 → 조건 검토
  //     해외: 일봉 → 주봉 / 주봉 → 월봉 / 월봉 → 조건 검토
  //     코인: 60분(25일) → 4시간 / 240m(100일) → 일봉 / 일봉 → 주봉 / 주봉·월봉 → 조건 검토
  let _insufficientNote = '';
  if(_insufficient){
    const _stage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
    const _tf = _analTF || 'day';
    const _mkt = stock._mkt || stock.market || currentMarket;

    if(_stage >= 2){
      // 최대 확장 도달 — TF 전환 권장
      let _recommendTf = null;
      if(_mkt === 'kr'){
        if(_tf === '60m') _recommendTf = '일봉';
        else if(_tf === 'day') _recommendTf = '주봉';
      } else if(_mkt === 'us'){
        if(_tf === 'day') _recommendTf = '주봉';
        else if(_tf === 'week') _recommendTf = '월봉';
      } else if(_mkt === 'coin'){
        if(_tf === '60m') _recommendTf = '4시간';
        else if(_tf === '240m') _recommendTf = '일봉';
        else if(_tf === 'day') _recommendTf = '주봉';
        else if(_tf === 'week') _recommendTf = '월봉';
      }

      if(_recommendTf){
        _insufficientNote = `<div style="margin-top:6px;padding:6px 8px;background:rgba(100,149,237,.08);border-radius:6px;font-size:10px;text-align:center;line-height:1.4">
          <div style="color:var(--sell);font-weight:600">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요</div>
          <div style="color:var(--accent);margin-top:3px">💡 최대 확장 완료 (600봉) — <b>${_recommendTf}</b> 전환 권장</div>
        </div>`;
      } else {
        // 전환 불가 (주봉/월봉 등)
        _insufficientNote = `<div style="margin-top:6px;padding:6px 8px;background:rgba(100,149,237,.08);border-radius:6px;font-size:10px;text-align:center;line-height:1.4">
          <div style="color:var(--sell);font-weight:600">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요</div>
          <div style="color:var(--accent);margin-top:3px">💡 최대 확장 완료 — 매매 조건 검토 권장</div>
        </div>`;
      }
    } else {
      // 아직 확장 가능 (기존 안내)
      _insufficientNote = `<div style="margin-top:6px;font-size:10px;color:var(--sell);text-align:center">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요 — 신뢰도 주의</div>`;
    }
  }

  // S67: 누적 신뢰도 표시
  const _histMkt = stock._mkt || stock.market || currentMarket;
  const _histData = _btHistLoad(_histMkt);
  const _histArr = _histData[stock.code] || [];
  const _histRel = _btHistReliabilityLabel(_histArr.length);
  const _histStats = _btHistCalcStats(_histArr);
  let _histLine = '';
  if(_histArr.length > 0){
    const _hc = _histRel.cls==='full'?'var(--buy)':_histRel.cls==='mid'?'var(--accent)':_histRel.cls==='low'?'var(--sell)':'var(--text3)';
    _histLine = `<div style="margin-top:6px;padding:6px 8px;background:var(--surface2);border-radius:6px;font-size:10px">
      <span style="font-weight:700;color:${_hc}">신뢰도 ${_histRel.text}</span> <span style="color:var(--text3)">${_histRel.desc}</span>`;
    if(_histStats){
      _histLine += ` · 누적 승률 ${_histStats.wr}% · PF ${_histStats.pf} · 총수익 ${_histStats.totalPnl>=0?'+':''}${_histStats.totalPnl}%`;
    }
    _histLine += `</div>`;
  }

  // S109 Phase 3-B-9a-ext-fix5 후속: 신뢰도별 배너 색상 분기
  //   데이터 부족(trades<10)  → info (하늘색) — 신중 분위기
  //   데이터 충족/충분(trades≥10) → pass (녹색) — 검증 완료 분위기
  const _bannerCls = _insufficient ? 'info' : 'pass';

  return `<div class="bt-banner ${_bannerCls}">
    <div class="bt-banner-header"><div class="bt-banner-title ${_bannerCls}">매매전략 — <span style="color:${_bReliColor};font-weight:700">${_bReliLabel}</span></div>${helpBtn}</div>
    ${_statsGrid}
    ${_insufficientNote}
    ${_histLine}
    ${helpHTML}
  </div>`;
}

function renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp){
  // S34: 풀차트용 데이터 저장
  _currentAnalRows = indicators?._advanced?.rows || null;
  _currentAnalName = stock.name || '';
  // S99: 차트 마커는 통합판정 기준으로 전달 (trades + svVerdict)
  _currentAnalTrades = stock._btResult?.trades || null;
  const body = document.getElementById('analBody');
  const gradeColor = {A:'grade-A',B:'grade-B',C:'grade-C',D:'grade-D',F:'grade-F'};
  const analTimeStr = analTime ? fmtTime(analTime) : '';
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // quickScore 종합 판정 — S48: qsHTML 제거, body.innerHTML에서 직접 렌더링
  // (레짐카드를 종목명카드 아래로 이동)

  // S103 bugfix: _stratDetailId 함수 본체 스코프로 호이스팅 (IIFE 안/밖 공용 참조)
  const _stratDetailId = 'strat_' + Math.random().toString(36).slice(2,8);

  // S99: 감독관 통합 판정 — supervisorJudge + unifiedVerdict
  let _svVerdict = null;
  let btStateBannerHTML = '';
  const _btSt = stock._btState || null;
  {
    // 1) 감독관 판정 inputs
    const _svAnalScore = qs ? (qs.readyScore ?? qs.score ?? 0) : (scores?.total ?? 0);
    const _svMom = stock._scoreMomentum || null;
    const _svRr = (typeof SXE !== 'undefined' && SXE.calcTpSlRr && indicators) ?
      (SXE.calcTpSlRr(stock.price, indicators, qs, _analTF)?.rr ?? 0) : 0;
    const svJudge = SXC.supervisorJudge(_svAnalScore, _svMom, _svRr);

    // 2) BT 상태 분류
    let _btStateKey = 'waiting';
    if (_btSt) {
      if (_btSt.state === 'holding' && _btSt._isBuySignal) _btStateKey = 'buy_signal';
      else if (_btSt.state === 'holding') _btStateKey = 'holding';
      else if (_btSt.state === 'sell_signal') _btStateKey = 'sell_signal';
      else _btStateKey = 'waiting';
    }

    // 3) 통합 판정
    // S103-fix7 Phase3-A-2: btScore 인자 추가 (empty Stage 2×2 판정용)
    // S103-fix7 Phase3-A-3: btStateObj 4번째 인자 추가 (매도 완료 익절/손절 맥락용)
    // [v1.6] partialHint 계산용 — _btSt에 현재가(stock.price) 주입
    //   _btSt 자체는 BT 결과 캐시라 가격 미포함 → 얕은 복사로 currentPrice만 추가
    // [v1.7] buy_signal 강등 게이트용 — winRate/totalTrades 주입
    //   stock._btResult에서 BT 성적 메타를 가져와 주입 (없으면 게이트 자동 비활성)
    const _btResForVerdict = stock._btResult || null;
    const _btStForVerdict = _btSt ? Object.assign({}, _btSt, {
      currentPrice: stock.price,
      winRate: _btResForVerdict ? _btResForVerdict.winRate : null,
      totalTrades: _btResForVerdict ? _btResForVerdict.totalTrades : null
    }) : null;
    _svVerdict = SXC.unifiedVerdict(_btStateKey, svJudge, stock._btScore != null ? stock._btScore : null, _btStForVerdict);
    stock._svVerdict = _svVerdict; // 차트 마커용 저장

    // S103-fix7 Phase3-B-2: _btAction을 C 매핑으로 설정 (점수 기반 es×bs 4분류 폐기)
    //   메인 경로: svVerdict.action 9종 → _btAction 4종 매핑
    if(_svVerdict && _svVerdict.action){
      stock._btAction = SXC.mapVerdictToBtAction(_svVerdict.action);
    } else {
      stock._btAction = null;
    }

    // 4) 감독관 방향 텍스트 (배너 타이틀 옆 "— 상승 전이중" 표시용)
    // [v1.8] 강등 가드 — C가 강등 판정한 경우 _dirText 비움
    //   "🔵 관심 — 상승 전이중" 같은 모순 표시 방지 (C는 신중인데 A는 상승 외치는 혼합 시그널)
    // [v1.9] 강등 케이스는 '하락 전이중'으로 강제 표시 (action='관망'으로 강등됐으므로 의미 일치)
    //   사용자 표 기준: 관망(강등) — 하락 전이중
    const _isDowngraded = _svVerdict?.label?.startsWith('[강등]');
    const _dirText = _isDowngraded ? '하락 전이중'
                   : (_svMom ? (_svMom.direction === 'up' ? '상승 전이중' : _svMom.direction === 'down' ? '하락 전이중' : '횡보') : '');

    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // [배경] 분석탭 배너의 "▶ 판정 근거" 펼침 영역에 3개 엔진 데이터 혼재
    //   - C 판정(SXC): 손익비 _svRr
    //   - 분석엔진(SXE): TP/SL, ATR, 피봇, 전이
    //   - BT 엔진: 거래 통계, BT 기준 TP/SL
    //   → 사용자 혼란(같은 라벨 다른 의미, 같은 목적 다른 시점)
    //
    // [삭제 6건]
    //   ① 분석엔진 TP/SL     → 배너 상단(_buildSimPositionLine)과 중복
    //   ② BT 기준 TP/SL      → 배너 상단과 중복
    //   ③ ATR/피봇 reasons   → "지표 분석" 섹션에 이미 있음
    //   ④ BT 요약 (21거래...) → 엔진판단 검증 6칸 카드에 이미 있음
    //   ⑤ 전이 정보 (62→66)   → "진입 검토" 카드에 더 상세히 있음
    //   ⑥ 손익비 _svRr       → 미러 트레이딩 철학(엔진시뮬 기준만 노출)
    //
    // [UI 변화]
    //   - "▶ 판정 근거" 버튼 완전 제거
    //   - 펼침 영역 완전 제거
    //   - 배너는 C 판정 배지 + _dirText + _buildSimPositionLine만 표시
    //
    // [유지 변수]
    //   - _svMom: supervisorJudge(1708) + _dirText(1753) 입력
    //   - _svRr: supervisorJudge(1708) + calcVerdictTransition(2095) 입력
    //   - _svTpsl/_svTp/_svSl/_rrWarn/_btSummary: 완전 제거 (판정 근거 전용)
    //
    //   "C는 현시점 매수/매도, BT는 시뮬레이션, 기본(분석엔진)은 C가 대처"
    //   → 프로젝트 C v3.0 원칙 ⑦ "UI 역할 분리" 강화
    //     측정값=지표 분석 / 판정=C 배너 / 검증=BT 6칸 카드 / 조건=진입 검토
    // ═══════════════════════════════════════════════════════════════

    // 5) 통합 배너 렌더 (심플: C 판정 + 엔진시뮬 포지션만)
    btStateBannerHTML = `<div style="padding:12px 14px;margin:0 0 8px;border-radius:12px;background:${_svVerdict.color}0D;border:1.5px solid ${_svVerdict.color}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:16px">${_svVerdict.icon}</span>
        <span style="font-size:15px;font-weight:800;color:${_svVerdict.color}">${_svVerdict.action.replace('청산', '매도')}</span>
        <span style="font-size:10px;color:var(--text3)">${_dirText ? '— ' + _dirText : ''}</span>
      </div>
      ${_buildSimPositionLine(stock, _btSt, _svVerdict)}
    </div>`;
  }

  // S31: 미니 캔들차트
  let chartHTML = '';
  if(indicators?._advanced?.rows){
    chartHTML = `<div class="mini-chart-wrap" onclick="_sxVib(12);if(typeof SXChart!=='undefined'&&_currentAnalRows)SXChart.openFull(_currentAnalRows,_currentAnalName,_currentAnalTrades,currentAnalStock&&currentAnalStock._svVerdict)" style="cursor:pointer"><div class="mini-chart-title">최근 ${Math.min(indicators._advanced.rows.length, 60)}봉 <span style="font-size:8px;color:var(--accent);font-weight:400">(탭하면 상세)</span></div><canvas id="miniCandleChart" width="400" height="180"></canvas></div>`;
  }

  // S99: 매매이력은 분석탭에서 제거 → BT탭(단일검증)에서만 표시
  // 통합 배너에 BT 성적 요약 1줄만 포함됨
  let tradeHistHTML = '';

  // S46: 고급 분석 해석카드 — SXI.adv* 모듈 경유
  let advHTML = '';
  const adv = indicators?._advanced;
  if(adv && typeof SXI!=='undefined'){
    const ctx = adv.context;
    const swing = adv.swingStruct;
    const maConv = adv.maConv;
    const _id = () => 'adv_' + Math.random().toString(36).slice(2,8);
    const _toneKr = {'bullish':'강세','bearish':'약세','neutral':'중립','warning':'경고','danger':'위험','없음':'없음','up':'상승','down':'하락'};
    const advItpRow = (label, val, valCls, itpObj) => {
      const id = _id();
      const dispVal = _toneKr[val] || val;
      let row = `<div class="anal-row itp-row"><span class="al">${label}</span><span class="ar ${valCls||''}">${dispVal}</span>`;
      if(itpObj){
        row += `<span class="itp-toggle" id="${id}t" onclick="_sxVib(8);toggleItp('${id}')">▶</span>`;
        row += `</div><div class="itp-card" id="${id}"><span class="itp-label ${itpObj.tone||'neutral'}">${itpObj.label||''}</span><div>${itpObj.text||''}</div></div>`;
      } else { row += `</div>`; }
      return row;
    };
    // 시장환경
    let envHTML = '';
    const envSummary = MarketEnv.getSummary(currentMarket);
    if(envSummary.state !== 'unknown'){
      const envCls = envSummary.state.includes('bull')?'bullish':envSummary.state.includes('bear')?'bearish':'neutral';
      const envItp = SXI.advMarketEnv(envSummary.state, envSummary.stateLabel, envSummary.indices);
      envHTML = advItpRow('시장 환경', envSummary.stateLabel, envCls, envItp);
    }
    // 눌림목
    const pbScore = adv.pullback?.score || 0;
    const maArr = indicators.maAlign?.bullish?'bullish':indicators.maAlign?.bearish?'bearish':null;
    const rsiV = typeof indicators.rsi==='number'?indicators.rsi:null;
    const volR = indicators.volPattern?.volRatio??null;
    const bbB = indicators.bb?.pctB??null;
    const pbItp = SXI.advPullback(pbScore, maArr, rsiV, volR, bbB);
    // RSI 다이버전스
    const rsiDivVal = adv.rsi.div||'없음';
    const rsiDivItp = SXI.advRsiDiv(rsiDivVal, rsiV, adv.trend?.pct);
    // OBV 다이버전스
    const obvDivVal = adv.obv.div||'없음';
    const obvDivItp = SXI.advObvDiv(obvDivVal, indicators.obv?.trend, volR);
    // 스윙 구조
    const swingVal = swing.higherHighs&&!swing.lowerLows ? 'HH+HL 상승구조' : swing.lowerLows&&!swing.higherHighs ? 'LL+LH 하락구조' : swing.higherHighs&&swing.lowerLows ? '혼조' : '횡보';
    const swingCls = swing.higherHighs&&!swing.lowerLows ? 'bullish' : swing.lowerLows ? 'bearish' : 'neutral';
    const swingItp = SXI.advSwing(swing.higherHighs, swing.lowerLows);
    // MA 수렴도
    const maConvVal = maConv.converging ? `수렴중 ${maConv.spread.toFixed(1)}%` : `분산 ${maConv.spread.toFixed(1)}%`;
    const maConvCls = maConv.converging ? 'neutral' : maConv.spread>5 ? 'bullish' : 'neutral';
    const maConvItp = SXI.advMaConv(maConv.converging, maConv.spread, maArr, indicators.bb?.isSqueeze||indicators.squeeze?.squeeze);
    // 추세
    const trendPct = adv.trend.pct;
    const trendCls = trendPct>0?'bullish':trendPct<0?'bearish':'neutral';
    const trendItp = SXI.advTrend(trendPct, indicators.adx?.adx, maArr, indicators.obv?.trend);
    // 구조 위치
    const structPos = (adv.trend.struct.pos*100).toFixed(0);
    const nearSup = adv.trend.struct.nearSupport;
    const nearRes = adv.trend.struct.nearResistance;
    const structVal = `${structPos}%${nearSup?' (지지근접)':''}${nearRes?' (저항근접)':''}`;
    const structCls = nearSup ? 'bullish' : nearRes ? 'bearish' : 'neutral';
    const structItp = SXI.advStructPos(adv.trend.struct.pos, nearSup, nearRes, adv.trend.struct.support, adv.trend.struct.resist);
    // Stoch 다이버전스
    let stochDivHTML = '';
    if(adv.stochDiv){
      const sdVal = adv.stochDiv;
      const sdCls = sdVal==='bullish'?'bullish':'bearish';
      const sdItp = SXI.advStochDiv(sdVal, rsiDivVal);
      stochDivHTML = advItpRow('Stoch 다이버전스', sdVal, sdCls, sdItp);
    }
    // 심리가격대
    let psychHTML = '';
    if(adv.psychLevel){
      const psych = adv.psychLevel;
      const psychVal = psych.near ? '근접' : '이격';
      const psychCls = psych.near ? 'bullish' : 'neutral';
      const psychItp = SXI.advPsychLevel(psych.near, psych.level, psych.price||indicators.last);
      psychHTML = advItpRow('심리적 가격대', psychVal, psychCls, psychItp);
    }
    // 맥락 분석
    let ctxHTML = '';
    if(ctx.notes.length){
      const ctxBonus = ctx.bonus || 0;
      const ctxCls = ctxBonus>5?'bullish':ctxBonus<-5?'bearish':'neutral';
      const ctxItp = SXI.advContext(ctxBonus, ctx.notes);
      ctxHTML = advItpRow('맥락 분석', `${ctxBonus>0?'+':''}${ctxBonus}점`, ctxCls, ctxItp);
    }

    advHTML = `
    <div class="anal-section">
      <div class="anal-section-title">고급 분석</div>
      ${envHTML}
      ${advItpRow('눌림목', pbScore+'점', pbScore>=50?'bullish':'neutral', pbItp)}
      ${advItpRow('RSI 다이버전스', rsiDivVal, rsiDivVal==='bullish'?'bullish':rsiDivVal==='bearish'?'bearish':'neutral', rsiDivItp)}
      ${advItpRow('OBV 다이버전스', obvDivVal, obvDivVal==='bullish'?'bullish':obvDivVal==='bearish'?'bearish':'neutral', obvDivItp)}
      ${advItpRow('스윙 구조', swingVal, swingCls, swingItp)}
      ${advItpRow('MA 수렴도', maConvVal, maConvCls, maConvItp)}
      ${advItpRow('추세', trendPct.toFixed(1)+'%', trendCls, trendItp)}
      ${advItpRow('구조 위치', structVal, structCls, structItp)}
      ${stochDivHTML}
      ${psychHTML}
      ${ctxHTML}
    </div>`;
  }

  let techHTML = '';
  if(indicators){
    const ind = indicators;
    const cls = (v,bull,bear)=>v>=bull?'bullish':v<=bear?'bearish':'neutral';
    // S39: 해석 엔진 연동
    const itp = (typeof SXI!=='undefined') ? SXI.interpretAll(ind) : {};
    // S66: KIS 비활성 시 국내 민감지표 비활성 배지
    const _krNoKis = currentMarket==='kr' && !window._kisEnabled && /^\d+m$/.test(_analTF)===false;
    const _kisOffBadge = '<span class="kis-off-badge">비활성</span>';
    const itpRow = (label, val, valCls, itpData, kisOff) => {
      const id = 'itp_' + Math.random().toString(36).slice(2,8);
      const dimCls = kisOff ? ' kis-dimmed' : '';
      let row = `<div class="anal-row itp-row${dimCls}"><span class="al">${label}${kisOff?_kisOffBadge:''}</span><span class="ar ${valCls||''}">${val}</span>`;
      if(itpData){
        row += `<span class="itp-toggle" id="${id}t" onclick="_sxVib(8);toggleItp('${id}')">▶</span>`;
        row += `</div><div class="itp-card" id="${id}"><span class="itp-label ${itpData.tone}">${itpData.label}</span><div>${itpData.text}</div></div>`;
      } else {
        row += `</div>`;
      }
      return row;
    };
    // S66: 국내+KIS미연결 시 장중 민감지표 비활성 배지 (둔감지표=ADX,OBV,MA,ATR,SAR 제외)
    const _ko = currentMarket==='kr' && !window._kisEnabled;
    techHTML = `
    <div class="anal-section">
      <div class="anal-section-title">기술적 지표${_ko?'<span class="kis-off-badge" style="margin-left:6px">KIS 미연결 — 장중 민감지표 참고용</span>':''}</div>
      ${itpRow('RSI (14)', ind.rsi.toFixed(1), cls(ind.rsi,55,45), itp.rsi, _ko)}
      ${itpRow('MACD', (+ind.macd.macd.toFixed(2)).toLocaleString(), ind.macd.macd>ind.macd.signal?'bullish':'bearish', itp.macd, _ko)}
      ${itpRow('MACD Signal', (+ind.macd.signal.toFixed(2)).toLocaleString(), '', null, _ko)}
      ${itpRow('Stoch %K/%D', ind.stoch.k.toFixed(1)+' / '+ind.stoch.d.toFixed(1), cls(ind.stoch.k,60,40), itp.stoch, _ko)}
      ${itpRow('ADX', ind.adx.adx.toFixed(1), ind.adx.adx>25?'bullish':'neutral', itp.adx)}
      ${itpRow('+DI / -DI', ind.adx.plusDI.toFixed(1)+' / '+ind.adx.minusDI.toFixed(1), '')}
      ${itpRow('CCI (20)', ind.cci.toFixed(1), cls(ind.cci,100,-100), itp.cci)}
      ${itpRow('MFI (14)', ind.mfi.toFixed(1), cls(ind.mfi,60,40), itp.mfi)}
      ${itpRow('BB %B', (ind.bb.pctB*100).toFixed(1)+'%', '', itp.bb, _ko)}
      ${itpRow('BB 폭', ind.bb.width.toFixed(1)+'% '+(ind.bb.isSqueeze?'(수축)':''), '', itp.bbWidth, _ko)}
      ${itpRow('ATR (14)', (+ind.atr.atr.toFixed(0)).toLocaleString()+' ('+ind.atr.ratio.toFixed(1)+'%)', '', itp.atr)}
      ${itpRow('OBV 추세', ind.obv.trend==='up'?'상승':ind.obv.trend==='down'?'하락':'횡보', ind.obv.trend==='up'?'bullish':ind.obv.trend==='down'?'bearish':'neutral', itp.obv)}
      ${itpRow('SAR', ind.psar.trend==='up'?'상승추세':'하락추세', ind.psar.trend==='up'?'bullish':'bearish', itp.sar)}
    </div>
    <div class="anal-section">
      <div class="anal-section-title">이동평균선</div>
      ${ind.ma5?itpRow('MA5', (+ind.ma5.toFixed(0)).toLocaleString(), ind.last>ind.ma5?'bullish':'bearish'):''}
      ${ind.ma20?itpRow('MA20', (+ind.ma20.toFixed(0)).toLocaleString(), ind.last>ind.ma20?'bullish':'bearish'):''}
      ${ind.ma60?itpRow('MA60', (+ind.ma60.toFixed(0)).toLocaleString(), ind.last>ind.ma60?'bullish':'bearish'):''}
      ${ind.ma120?itpRow('MA120', (+ind.ma120.toFixed(0)).toLocaleString(), ind.last>ind.ma120?'bullish':'bearish'):''}
      ${maAlignItp?`<div class="itp-card show" style="margin-top:4px;white-space:pre-line"><span class="itp-label ${maAlignItp.tone}">${maAlignItp.label}</span><div>${maAlignItp.text}</div></div>`:(itp.ma?`<div class="itp-card show" style="margin-top:4px"><span class="itp-label ${itp.ma.tone}">${itp.ma.label}</span><div>${itp.ma.text}</div></div>`:'')}
    </div>
    ${ind.patterns.basic.length||ind.patterns.reversal.length||ind.patterns.continuation.length?`
    <div class="anal-section">
      <div class="anal-section-title">캔들 패턴${_ko?'<span class="kis-off-badge" style="margin-left:6px">비활성</span>':''}</div>
      ${ind.patterns.basic.map(p=>`<div class="anal-row"><span class="al">기본</span><span class="ar">${p}</span></div>`).join('')}
      ${ind.patterns.reversal.map(p=>`<div class="anal-row"><span class="al">반전</span><span class="ar" style="color:var(--buy)">${p}</span></div>`).join('')}
      ${ind.patterns.continuation.map(p=>`<div class="anal-row"><span class="al">지속</span><span class="ar">${p}</span></div>`).join('')}
      ${itp.candle?`<div class="itp-card show" style="margin-top:4px"><span class="itp-label ${itp.candle.tone}">${itp.candle.label}</span><div>${itp.candle.text}</div></div>`:''}
    </div>`:''}
    <div class="anal-section">
      <div class="anal-section-title">고급 해석</div>
      ${itp.vwap?itpRow('VWAP', ind.vwap?.position==='above'||ind.vwap?.position==='above_far'?'위':ind.vwap?.position==='below'||ind.vwap?.position==='below_far'?'아래':'근처', itp.vwap.tone, itp.vwap):''}
      ${itp.swingStruct?itpRow('스윙 구조', itp.swingStruct.label, itp.swingStruct.tone, itp.swingStruct):''}
      ${itp.ichimoku?itpRow('일목균형표', itp.ichimoku.label, itp.ichimoku.tone, itp.ichimoku):''}
      ${itp.priceChannel?itpRow('가격채널', (()=>{const pc=ind.priceChannel||ind._advanced?.priceChannel||{}; return pc.position==='breakout_up'?'상단돌파':pc.position==='breakout_down'?'하단이탈':pc.position==='upper_half'?'상단권':'하단권';})(), itp.priceChannel.tone, itp.priceChannel):''}
      ${itp.pivot?itpRow('피벗', (()=>{const pv=ind.pivot||ind._advanced?.pivot||{}; return pv.level||'';})(), itp.pivot.tone, itp.pivot):''}
      ${itp.maDisparity?itpRow('MA 이격도', (()=>{const md=ind.maDisparity||ind._advanced?.maDisparity||{}; const parts=[]; if(md.disparity20!=null) parts.push('20: '+(md.disparity20>=0?'+':'')+md.disparity20.toFixed(1)+'%'); if(md.disparity60!=null) parts.push('60: '+(md.disparity60>=0?'+':'')+md.disparity60.toFixed(1)+'%'); return parts.join(' / ')||itp.maDisparity.label;})(), itp.maDisparity.tone, itp.maDisparity):''}
      ${itp.maConvergence?itpRow('MA 수렴도', itp.maConvergence.label, itp.maConvergence.tone, itp.maConvergence):''}
      ${itp.pullback?itpRow('눌림목', (ind.pullback?.score??ind._advanced?.pullback?.score??'')+'점', itp.pullback.tone, itp.pullback):''}
      ${itp.volumeMA?itpRow('거래량 MA', (ind.volPattern?.volRatio??1).toFixed(1)+'x', itp.volumeMA.tone, itp.volumeMA):''}
      ${itp.adLine?itpRow('A/D', (()=>{const ad=ind.ad||ind._advanced?.ad||{}; return ad.trend==='up'?'상승':ad.trend==='down'?'하락':'횡보';})(), itp.adLine.tone, itp.adLine):''}
      ${itp.eom?itpRow('EOM', (()=>{const e=ind.eom||ind._advanced?.eom||{}; return e.trend==='up'?'매수세':e.trend==='down'?'매도세':'중립';})(), itp.eom.tone, itp.eom):''}
      ${itp.vhf?itpRow('VHF', (()=>{const v=ind.vhf||ind._advanced?.vhf||{}; return v.trending==='trending'?'추세장':v.trending==='ranging'?'횡보장':'보통';})(), itp.vhf.tone, itp.vhf):''}
      ${itp.psycho?itpRow('심리도', (()=>{const p=ind.psycho||ind._advanced?.psycho||{}; const val=p.psycho; return val!=null?val.toFixed(0)+'%':'—';})(), itp.psycho.tone, itp.psycho, _ko):''}
      ${itp.chaikinOsc?itpRow('Chaikin Osc', (()=>{const c=ind.chaikinOsc||ind._advanced?.chaikinOsc||{}; return c.val>0?'양수 (매집)':c.val<0?'음수 (분산)':'0';})(), itp.chaikinOsc.tone, itp.chaikinOsc):''}
      ${itp.abRatio?itpRow('AB Ratio', (()=>{const a=ind.abRatio||ind._advanced?.abRatio||{}; return a.trend==='bullish'?'매수우위':a.trend==='bearish'?'매도우위':'균형';})(), itp.abRatio.tone, itp.abRatio):''}
    </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // S39 (Phase3-C-1): 참고사항 카드 — 5단계 다이나믹 레이어 시스템
  //   [배경] 구 "종합평" 제목은 "최종 결론" 뉘앙스를 만들어 C 배너와 충돌
  //          → 평시엔 "참고사항"(L3)으로 위계 명확화 / 공시 발동 시 제목+색 자동 승격
  //
  //   [레이어 매핑 — 공시 tone 기반]
  //     L0 danger   : ⛔ 긴급경고  (빨강, C 판정 무시, 투자 부적격)
  //     L1 bearish  : ⚠️ 위험안내   (주황, 관리종목·자본잠식 등)
  //     L2 warning  : 💡 주의사항    (노랑, 주의 공시 감지)
  //     L3 neutral  : ℹ️ 참고사항    (하늘, 평시 99% 케이스 — 분석엔진 보조)
  //     L4 bullish  : ✨ 긍정요인  (초록, 호재 공시 보강)
  //
  //   [동작 원칙]
  //     - 공시 없음 또는 tone=neutral  → L3 (기본)
  //     - SXI.overrideSummaryWithDisclosure 후 stateLine이 '⛔'로 시작 → L0
  //     - SXI.overrideSummaryWithDisclosure 후 stateLine이 '[주의]' 포함 → L1
  //     - risks 중 '주의 공시 감지'가 있으면 → L2
  //     - keyReasons 중 '호재 공시 감지'가 있으면 → L4
  // ════════════════════════════════════════════════════════════
  function _getSummaryLayerConfig(summary, discTone){
    // 1) 공시 tone 직접 전달된 경우 우선 사용 (가장 신뢰 가능)
    if(discTone === 'danger')  return {level:'l0', icon:'⛔', label:'긴급경고'};
    if(discTone === 'bearish') return {level:'l1', icon:'⚠️', label:'위험안내'};
    if(discTone === 'warning') return {level:'l2', icon:'💡', label:'주의사항'};
    if(discTone === 'bullish') return {level:'l4', icon:'✨', label:'긍정요인'};
    // 2) discTone 미전달 시 summary 내용물로 추론 (오버라이드가 이미 적용된 상태)
    if(summary){
      const sl = summary.stateLine || '';
      if(sl.indexOf('⛔') === 0 || sl.indexOf('치명적 공시') >= 0)
        return {level:'l0', icon:'⛔', label:'긴급경고'};
      if(sl.indexOf('[주의]') >= 0 || sl.indexOf('위험 공시') >= 0)
        return {level:'l1', icon:'⚠️', label:'위험안내'};
      const risks = summary.risks || [];
      if(risks.some(r => r && r.title && r.title.indexOf('주의 공시') >= 0))
        return {level:'l2', icon:'💡', label:'주의사항'};
      const krs = summary.keyReasons || [];
      if(krs.some(r => r && r.title && r.title.indexOf('호재 공시') >= 0))
        return {level:'l4', icon:'✨', label:'긍정요인'};
    }
    // 3) 기본값: 평시 (L3)
    return {level:'l3', icon:'ℹ️', label:'참고사항'};
  }

  // S103-fix7 Phase3-B-3: verdictAction 5번째 파라미터 전달 — 보유중 5종일 때 보유자 맥락 종합평 생성
  let summaryHTML = '';
  if(typeof SXI!=='undefined' && qs && indicators){
    const _verdictActForSummary = stock._svVerdict?.action || null;
    let summary = SXI.summary(qs.action, qs.score, qs.reasons, indicators, _verdictActForSummary);
    // S58: 공매도 잔고 → 참고사항 보정 (동기 적용)
    if(summary && stock.shortBalanceRatio && SXI.advShortSelling && SXI.overrideSummaryWithShortSelling){
      const shortItp = SXI.advShortSelling(stock.shortBalanceRatio, {
        price: stock.price, changeRate: stock.changeRate,
        volume: stock.volume, foreignRatio: stock.foreignRatio, marketCap: stock.marketCap
      });
      if(shortItp) summary = SXI.overrideSummaryWithShortSelling(summary, shortItp, stock.shortBalanceRatio);
    }
    if(summary){
      // Phase3-C-1: 레이어 자동 판정 (초기 렌더는 공시 로드 전이므로 summary 내용 기반 추론)
      const _layer = _getSummaryLayerConfig(summary, null);
      summaryHTML = `<div class="itp-summary layer-${_layer.level}">
        <div class="itp-summary-title"><span>${_layer.icon}</span><span>${_layer.label}</span></div>
        ${summary.stateLine?`<div style="font-size:11px;font-weight:800;color:var(--${summary.tone==='bullish'?'buy':summary.tone==='bearish'?'sell':'hold'});margin-bottom:4px">${summary.stateLine}</div>`:''}
        <div class="itp-summary-text">${summary.mainText}</div>
        ${summary.actionGuide?`<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin:6px 0 4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">행동 가이드</span><br><span style="color:var(--text2)">${summary.actionGuide}</span></div>`:''}
        ${summary.invalidation?`<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">무효화 조건</span><br><span style="color:var(--text2)">${summary.invalidation}</span></div>`:''}
        ${summary.buyTrigger?`<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin-bottom:6px;line-height:1.55"><span style="font-weight:700;color:var(--buy)">강화 조건</span><br><span style="color:var(--text2)">${summary.buyTrigger}</span></div>`:''}
        ${summary.keyReasons.length?'<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">핵심 이유</div>':''}
        ${summary.keyReasons.map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
        ${summary.risks.length?'<div style="font-size:10px;font-weight:700;color:var(--sell);margin:6px 0 4px">위험 요소</div>':''}
        ${summary.risks.map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
      </div>`;
    }
  }

  // S77: 현재 적용 파라미터 표시 (실제 적용값 전부 표시)
  const _ap = _loadAnalParams();
  const _raOn = typeof SXE!=='undefined' && SXE.regimeAdaptEnabled();
  const _curTf = typeof _analTF!=='undefined' ? _analTF : 'day';
  const _tfTh = (typeof _scrTfTh!=='undefined') ? _scrTfTh(_curTf) : {buy:62,sell:38};
  const _tfMa = (typeof _scrTfMa!=='undefined') ? _scrTfMa(_curTf) : {short:5,mid:20,long:60};
  const _effBuy = _ap.buyTh > 0 ? _ap.buyTh : _tfTh.buy;
  const _effSell = _ap.sellTh > 0 ? _ap.sellTh : _tfTh.sell;
  const _effMaS = _ap.maShort > 0 ? _ap.maShort : _tfMa.short;
  const _effMaM = _ap.maMid > 0 ? _ap.maMid : _tfMa.mid;
  const _effMaL = _ap.maLong > 0 ? _ap.maLong : _tfMa.long;
  const _effTp = _ap.tpMult > 0 ? _ap.tpMult : 2.5;
  const _effSl = _ap.slMult > 0 ? _ap.slMult : 1.5;
  const _apStr = `[P] RSI${_ap.rsiLen} BB${_ap.bbLen}×${_ap.bbMult} ATR${_ap.atrLen} MA${_effMaS}/${_effMaM}/${_effMaL} B${_effBuy} S${_effSell} TP${_effTp} SL${_effSl} · 레짐${_raOn?'ON':'OFF'}`;
  // S100: 현재 적용 프리셋 출처 라벨
  const _presetLabel = (typeof _getPresetSourceLabel === 'function') ? _getPresetSourceLabel() : '';

  body.innerHTML = `
    ${chartHTML}
    ${btStateBannerHTML}
    ${tradeHistHTML}
    <div style="padding:4px 10px;margin:0 0 4px;text-align:center">${_presetLabel?`<div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:2px">${_presetLabel}</div>`:''}<span style="display:inline-block;font-size:9px;padding:3px 8px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">${_apStr}</span></div>

    <div class="anal-header-card">
      <div class="anal-stock-code">${stock.code} · ${stock.market||''}${stock.sector?' · '+stock.sector:''}</div>
      <div class="anal-stock-name">${stock.name}</div>
      ${(()=>{
        // S103-fix7 Phase3-B-4f.1: 종목 헤더에 현재가 + 전일대비 추가
        //   v2.0 배너의 pnl% 비교 기준점 제공 (배너에는 현재가 미표기)
        //   "종목명 밑에 현재가" 배치로 시각적 안정성 + 중복 제거
        if(!stock.price || stock.price <= 0) return '';
        const _cr = typeof stock.changeRate === 'number' ? stock.changeRate : 0;
        const _crColor = _cr > 0 ? 'var(--buy)' : _cr < 0 ? 'var(--sell)' : 'var(--text3)';
        const _crSign = _cr > 0 ? '+' : '';
        const _crStr = _cr !== 0 ? `<span style="font-size:12px;font-weight:700;color:${_crColor};margin-left:6px">${_crSign}${_cr.toFixed(2)}%</span>` : '';
        return `<div class="anal-stock-price" style="margin-top:4px;font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.3px">${stock.price.toLocaleString()}원${_crStr}</div>`;
      })()}
      <div id="discBadgeArea" style="margin-top:4px;min-height:0"></div>
      ${scanTimeStr||analTimeStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px">${scanTimeStr?'검색 '+scanTimeStr:''}${scanTimeStr&&analTimeStr?' · ':''}${analTimeStr?'분석 '+analTimeStr:''}</div>`:''}
      ${(()=>{
        const _analSc = qs ? (qs.readyScore ?? qs.score) : scores.total; // S95: 소형 배지
        const _btData = _getBtData(stock);
        const _btScRaw = calcBtScore(_btData);
        const _btTrades2 = _getBtTotalTrades(stock);
        const _btMkt = stock._mkt || stock.market || currentMarket;
        const _btTfOk = _isBtSupportedTF(_btMkt, _analTF);
        const _btNoData = !_btTfOk || _btScRaw == null;
        const _btSc = _btNoData ? null : _btScRaw;
        let _btReliLabel = '', _btReliColor = '';
        if(!_btNoData){
          if(_btTrades2 < BT_MIN_TRADES){ _btReliLabel='부족'; _btReliColor='var(--sell)'; }
          else if(_btTrades2 < 30){ _btReliLabel='충족'; _btReliColor='var(--accent)'; }
          else { _btReliLabel='충분'; _btReliColor='var(--buy)'; }
        }

        const _mom = stock._scoreMomentum;
        // S103-fix7 Phase3-B-4f.4: _momArrow 제거 — 버튼 내부에서 "xx 전이 N%"로 교체되어 더 이상 참조되지 않음.
        //   3단리포트 ready/entry 섹션의 델타 표시는 _deltaTag(_readyDelta/_entryDelta/_trendDelta) 헬퍼가 담당 (중복 제거)

        const _3stageId = 'stage3_' + Math.random().toString(36).slice(2,8);
        // S103-fix7 Phase3-B-4f.4: _analCls 제거 — 버튼 색상이 _timingBtnClr(polarity 기반)로 대체됨
        const _btCls = _btSc!=null?(_btSc>=60?'buy':_btSc>=40?'hold':'sell'):'text3';

        // S103-fix7 Phase3-B-4f.4: 타이밍 라벨을 C 판정 기반으로 산출 (v3.0 3.4 표, 9종 전체 커버)
        //   이전: _mom.delta <= 0 → 매도 검토 / 아니면 진입 검토 (모멘텀만 기반, C와 괴리 가능)
        //   신규: SXC.getTimingButtonLabel(svVerdict.action) — 보유 5종 중 매도완료 제외 → 매도 검토, 나머지 → 진입 검토
        const _svAction4f = stock._svVerdict ? stock._svVerdict.action : null;
        const _timingLabel = SXC.getTimingButtonLabel(_svAction4f);

        // S127: C 전이 확률(_transition) 계산 제거 — 버튼 문구를 "추세 N · 레벨"로 교체하며 불필요해짐
        //   [제거된 계산] const _svRr4f = SXE.calcTpSlRr(...).rr
        //                 const _transition = SXC.calcVerdictTransition(_svAction4f, _analSc, _mom, _svRr4f, stock._btState)
        //   [보존] SXC.calcVerdictTransition 함수 자체는 sx_project_c.js에 유지 (다른 호출부 없음, 향후 복원 시 사용 가능)
        //   [효과] 매 분석탭 렌더 시 calcTpSlRr + calcVerdictTransition 2회 호출 절약

        // S117: 엔진판단 검증 버튼 색상 — 평균소득(totalPnl/trades) 기반 5단계
        //   [이전] SXC.calcEntryEvaluation 점수 기반 (S114에서 카드는 삭제했으나 버튼 색만 잔존) — 역행 이슈 잔재
        //   [신규] 실제 BT 평균소득 = 거래당 순 평균 → 사용자가 "이 전략 돈 되냐?" 직관적 판단 가능
        //   [기준] (소수점 무시, 정수 기준)
        //     BT 미실행     → 회색 #94a3b8
        //     평균소득 >= +5% → 녹색 #22c55e (우수)
        //     평균소득 0 ~ +4% → 하늘색 #3b82f6 (양호)
        //     평균소득 -4 ~ -1% → 주황 #f97316 (주의)
        //     평균소득 <= -5% → 빨강 #e8365a (손실)
        //   [원칙] BT 결과 기반이라 사용자 혼란 제거. 버튼 하단 문구 ("거래 N 승률 N%")와 같은 출처.
        let _entryEvalClr;
        if(!stock._btResult || !stock._btResult.totalTrades){
          _entryEvalClr = '#94a3b8'; // BT 미실행 — 회색
        } else {
          const _btAvgIncome = stock._btResult.totalTrades > 0 ? (stock._btResult.totalPnl / stock._btResult.totalTrades) : 0;
          const _btAvgIncomeInt = Math.trunc(_btAvgIncome); // 소수점 무시
          if(_btAvgIncomeInt >= 5) _entryEvalClr = '#22c55e';       // 녹색
          else if(_btAvgIncomeInt >= 0) _entryEvalClr = '#3b82f6';  // 하늘색
          else if(_btAvgIncomeInt >= -4) _entryEvalClr = '#f97316'; // 주황
          else _entryEvalClr = '#e8365a';                           // 빨강
        }

        // S127 fix3: 진입/매도 검토 버튼 색상 — 배너 C 판정 색을 그대로 상속
        //   [이전 v7.9] switch(action) 수동 매핑 — 9종 중 5종만 case 분기, 나머지(보유 유지/관망/회피)는 default 회색
        //     → 한화 케이스(보유 유지=배너 녹색)에서 버튼만 회색 → 시각 분리 모순 발견
        //   [신규 v7.10] _svVerdict.color 직접 참조 — SXC.unifiedVerdict 반환 색을 single source of truth로 사용
        //     → 배너와 버튼이 모든 9종 상태에서 100% 색상 동기화
        //     → SXC 쪽 색상 변경 시 자동 반영(수동 매핑 누락 가능성 원천 제거)
        //   현재 SXC 매핑(sx_project_c.js L142~183): 매수 #22c55e / 관심 #3b82f6 / 보유 유지 #22c55e /
        //     청산 준비 #f59e0b / 청산 검토 #ff8c00 / 즉시 청산 #e8365a / 매도 완료 #e8365a /
        //     관망 #f59e0b / 회피 #9e9e9e
        //   폴백: _svVerdict 없거나 color 누락 시 중립 회색 #94a3b8
        const _timingBtnClr = (stock._svVerdict && stock._svVerdict.color) ? stock._svVerdict.color : '#94a3b8';

        // S127: 버튼 미리보기용 추세 점수 — 펼침 영역 Layer 4(추세, C) 요약을 버튼에 선노출
        //   펼치기 전에도 "추세가 양호한지/약한지" 즉시 파악 가능 → 버튼=펼침 요약 관계 성립
        //   qs.trendScore 우선, 없으면 qs.score 폴백 (scrQuickScore 출력 구조 보호)
        //   S127-fix1: level 경계를 sx_interpret.js _report.trend.level(3324줄)과 1:1 동기화
        //     [이전] 70/50/30 임의 경계 → 펼침 내부 "하락"인데 버튼은 "약세" 불일치 발생
        //     [신규] 70/60/50/40 경계 (강세/양호/중립/약세/하락) — A 엔진 출력과 완전 동일
        //   [v1.7] 용어 리네이밍 — "강세/약세" 혼동 제거 (추세 등급 vs entryScore 점수명)
        //     · 이전: 강세/양호/중립/약세/하락 ← "강세"가 entryScore 점수명과 이름 충돌
        //     · 신규: 강추세/중추세+/중추세/약추세/하락추세 ← 접미 "추세"로 trend 등급임을 명시
        const _btnTrendScore = qs ? (qs.trendScore ?? qs.score ?? 0) : 0;
        const _btnTrendLevel = _btnTrendScore >= 70 ? '강추세'
                             : _btnTrendScore >= 60 ? '중추세+'
                             : _btnTrendScore >= 50 ? '중추세'
                             : _btnTrendScore >= 40 ? '약추세'
                             : '하락추세';

        // S103-fix6c Phase1: 양방향 3단 구조 — 모멘텀 기반 매도 모드 감지 (3단리포트 내부 라벨용)
        //   _entryLabel은 entry 섹션 헤더 + 강세/약세 추이 차트 제목에서 사용
        // S127: _r2eLabel / _e2tLabel 제거 — 전이 박스 삭제로 더 이상 불필요
        // [v1.7] 강세/약세 동적 표기 폐지 → "반등 신호"로 통일
        //   이유: entryScore는 "반등이 실제로 시작됐나"를 보는 지표인데 "강세/약세"는
        //         상승/하락 어느 쪽이든 발생하는 신호라 방향성을 붙이면 오해 소지.
        //         특히 헤더 "약추세" 라벨과 entry 섹션 헤더 "약세"가 공존하면 같은 단어로
        //         다른 것을 가리키는 문제 발생 → 용어 "반등 신호" 단일화
        const _isSellMode = (_mom && _mom.delta != null && _mom.delta <= 0);
        const _entryLabel = '반등 신호';
        const _stratBtnClr = '#ff9900';

        // S103-fix6c Phase2: 감독관 통합판정 기반 행동 배지 — 진입 검토 버튼 위 왼쪽 정렬
        //   유력(실선진한색): 매수→반등유력 / 즉시청산·매도완료→하락유력 (차트마커 ▲▼과 동기화)
        //   조짐(실선연한색): 관심→반등조짐 / 청산준비·검토→하락조짐 (예고 단계)
        //   그 외(보유유지·관망·회피): 배지 없음 (회피=비보유 진입안함이라 경고 표시 불필요)
        // S103-fix7 Phase3-A-2: '매도 완료'에 하락유력 배지 추가 (▼ 차트마커와 쌍), '회피'는 배지 제거 (비보유 상태)
        // S103-fix7 Phase3-B-7: 인라인 switch 로직 → SXC.getVerdictBadge() 호출로 교체 (sx_project_c.js로 이전)
        const _verdictBadgeTop = SXC.getVerdictBadge(stock._svVerdict?.action);

        // S95: 소형 인라인 배지 — 근거용 (탭→전이상세) — S100: 교차 토글
        // S127: 버튼 내부 문구 교체 — 전이 확률 → 추세 점수/레벨 미리보기
        //   [이전] ${_transition.label} ${_transition.value}% (예: "관망 강등 70%")
        //     → 종합평에 중복 노출되고 의미 전달이 어려움("강등"이라는 표현 모호)
        //   [신규] 추세 ${score} · ${level} (예: "추세 47 · 약세")
        //     → 펼침 Layer 4(추세, C) 요약 = 버튼=미리보기 관계 성립
        //     → 펼치기 전에도 추세 방향성 즉시 파악 가능
        return `${_verdictBadgeTop ? `<div style="display:flex;justify-content:flex-start;margin-top:8px;margin-bottom:-2px">${_verdictBadgeTop}</div>` : ''}<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_timingBtnClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_3stageId}'),s=document.getElementById('${_stratDetailId}');if(s&&s.style.display!=='none'){s.style.display='none';if(currentAnalStock)currentAnalStock._engineVerifyOpen=false;}var willOpen=el.style.display==='none';el.style.display=willOpen?'block':'none';if(currentAnalStock){currentAnalStock._3stageOpen=willOpen;}">
            <span style="font-size:9px;color:${_timingBtnClr};font-weight:700">분석신호 검토 <span style="font-size:7px">▶</span></span>
            <span style="font-size:11px;font-weight:800;color:${_timingBtnClr};line-height:1.2">추세 ${_btnTrendScore} · ${_btnTrendLevel}</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_entryEvalClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_stratDetailId}'),t=document.getElementById('${_3stageId}');if(t&&t.style.display!=='none'){t.style.display='none';if(currentAnalStock)currentAnalStock._3stageOpen=false;}var willOpen=el.style.display==='none';el.style.display=willOpen?'block':'none';if(currentAnalStock){currentAnalStock._engineVerifyOpen=willOpen;}/* S119 fix2: 자동 실행 완료 후 재클릭 시 재실행 방지 — 이미 BT 결과 있으면 토글만 */if(willOpen&&currentAnalStock&&!currentAnalStock._btResult)_runEngineVerify(currentAnalStock);">
            <span style="font-size:9px;color:${_entryEvalClr};font-weight:700">엔진판단 검증 <span style="font-size:7px">▶</span></span>
            <span style="font-size:11px;font-weight:800;color:${_entryEvalClr};line-height:1.2">${stock._btResult && stock._btResult.totalTrades ? `거래 ${stock._btResult.totalTrades} 승률 ${(stock._btResult.winRate||0).toFixed(0)}%` : '거래 ?? 승률 ??'}</span>
          </div>
        </div>

        <div id="${_3stageId}" style="display:${stock._3stageOpen ? 'block' : 'none'};margin-top:8px;padding:10px 12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
        ${(()=>{
          // S81→S82→S99-2: 3단 리포트 렌더링 (verdictAction 전달)
          if(typeof SXI==='undefined' || !SXI.threeStageReport) return '<div style="font-size:10px;color:var(--text3)">해석 엔진 미연결</div>';

          const _lastDate = (indicators && indicators._advanced && indicators._advanced.rows) ? indicators._advanced.rows[indicators._advanced.rows.length-1]?.date : null;
          const _verdictAction = _svVerdict ? _svVerdict.action : null;
          // S103-fix7 Phase3-A-3: btStateObj 전달 — _buildVerdict에서 매도 pnl/isWin/진입가 맥락 활용
          const _report = SXI.threeStageReport(qs, _mom, stock._btResult, _btSc, _lastDate, stock._btTransitionStats, _verdictAction, stock._btState);
          if(!_report) return '<div style="font-size:10px;color:var(--text3)">데이터 부족</div>';

          let html = '';
          // S86: 변화량 표시 헬퍼
          const _deltaTag = function(d){ if(d==null||isNaN(d)) return ''; var s=d>0?'+'+d:d===0?'0':''+d; var c=d>0?'var(--buy)':d<0?'var(--sell)':'var(--text3)'; return ' <span style="font-size:9px;color:'+c+';font-weight:700">'+s+'</span>'; };
          const _readyDelta = _mom ? _mom.delta : null;
          const _entryDelta = _mom ? _mom.entryDelta : null;
          const _trendDelta = _mom ? _mom.trendDelta : null;

          // 준비 섹션 — S82: 체크박스 시각화
          // [v1.7] 헤더 라벨 "신호" → "바닥 신호" (readyScore = 바닥 조건 축적도)
          const rCls = _report.ready.score>=60?'buy':_report.ready.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">바닥 신호</span><span style="font-size:14px;font-weight:800;color:var(--'+rCls+')">'+_report.ready.score+_deltaTag(_readyDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.ready.level+' · '+_report.ready.progress+'</span></div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_report.ready.summary+'</div>';
          // S82→S87: 조건 체크박스 — met만 표시, unmet은 토글로 숨김
          if(_report.ready.met.length || _report.ready.unmet.length) {
            var _mw = _report.ready.metW || [];
            var _uw = _report.ready.unmetW || [];
            var _rUnmetId = 'ru_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            if(_mw.length) {
              _mw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c.name+' <span style="font-size:7px;opacity:.6">+'+c.weight+'</span></span>'; });
            } else {
              _report.ready.met.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c+'</span>'; });
            }
            html += '</div>';
            var _hasRU = _uw.length ? _uw.length : _report.ready.unmet.length;
            if(_hasRU) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_rUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_hasRU+'개</div>';
              html += '<div id="'+_rUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              if(_uw.length) {
                _uw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c.name+' <span style="font-size:7px">+'+c.weight+'</span></span>'; });
              } else {
                _report.ready.unmet.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c+'</span>'; });
              }
              html += '</div>';
            }
          }
          // S127: ready 섹션 내부 전이 박스(_r2eLabel) 제거
          //   [이유] 버튼("관망 강등 70%")에 이미 동일 정보 표시 + 종합평에서 C가 재언급
          //         → 3중 노출 방지, 정보 계층 명확화
          html += '</div>';

          // S127: 진입 검토 추이 차트 — Layer 2(ready, A) 섹션 바로 뒤로 이동
          //   [이전 위치] 구간분포 추이 다음 (맨 아래쪽) → 문맥 단절
          //   [신규 위치] ready 섹션 직후 → "검토 13점"의 최근 5봉 변화를 바로 확인 가능
          //   차트 ID는 _3stageId + '_dbc' 그대로 유지 (다른 호출부 없음, 충돌 無)
          if(_mom && _mom.history.length >= 3){
            const _dbCanvasId = _3stageId + '_dbc';
            const rev = _mom.history.slice().reverse();
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">바닥 신호 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_dbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_dbCanvasId, rev, _mom.lookback); }, 60);
          }

          // 진입 섹션
          const eCls = _report.entry.score>=60?'buy':_report.entry.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">'+_entryLabel+'</span><span style="font-size:14px;font-weight:800;color:var(--'+eCls+')">'+_report.entry.score+_deltaTag(_entryDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.entry.level+'</span></div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_report.entry.summary+'</div>';
          // S84→S87: 진입(강세) 조건별 가중치 — met만 표시, unmet 토글 숨김
          if((_report.entry.met && _report.entry.met.length) || (_report.entry.unmet && _report.entry.unmet.length)) {
            var _emw = _report.entry.metW || [];
            var _euw = _report.entry.unmetW || [];
            var _eUnmetId = 'eu_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            if(_emw.length) {
              _emw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c.name+' <span style="font-size:7px;opacity:.6">+'+c.weight+'</span></span>'; });
            } else {
              (_report.entry.met||[]).forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c+'</span>'; });
            }
            html += '</div>';
            var _hasEU = _euw.length ? _euw.length : (_report.entry.unmet||[]).length;
            if(_hasEU) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_eUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_hasEU+'개</div>';
              html += '<div id="'+_eUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              if(_euw.length) {
                _euw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c.name+' <span style="font-size:7px">+'+c.weight+'</span></span>'; });
              } else {
                (_report.entry.unmet||[]).forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c+'</span>'; });
              }
              html += '</div>';
            }
          }
          if(_report.entry.signals.length) html += '<div style="font-size:9px;color:var(--buy);line-height:1.5;margin-bottom:2px">'+_report.entry.signals.map(function(n){return '[+] '+n}).join('<br>')+'</div>';
          if(_report.entry.warnings.length) html += '<div style="font-size:9px;color:var(--sell);line-height:1.5">'+_report.entry.warnings.map(function(n){return '[-] '+n}).join('<br>')+'</div>';
          // S127: entry 섹션 내부 전이 박스(_e2tLabel) 제거
          //   [이유] ready 박스 제거와 동일 논리 — 정보 중복 배제, Layer 3은 A 엔진 점수 + 조건에 집중
          html += '</div>';

          // S88: 반등 신호 추이 → SXChart.drawDeltaBar 캔버스
          if(_mom && _mom.history.length >= 3){
            const _ebCanvasId = _3stageId + '_ebc';
            const _eRev = _mom.history.slice().reverse().map(function(h){ return {score: h.entryScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">'+_entryLabel+' 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_ebCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_ebCanvasId, _eRev, _mom.lookback); }, 70);
          }

          // 추세 섹션 — S127: Layer 4(C) 시각 테마 적용
          //   [이유] A(검토/강세)와 C(추세) 섹션을 시각적으로 구분 — "추세는 판단의 본론"
          //   [스타일] 좌측 4px accent border + 약한 accent-glow 배경 + "추세" 라벨 accent 색상
          //     --accent(파랑 #2563eb) + --accent-glow(rgba blue, 라이트/다크 자동 대응) 사용
          //     하드코딩 색상 금지 — 테마 변수만으로 일관성 유지
          // [v1.7] 헤더 라벨 "추세" → "추세 강도" (헤더 버튼 "강/중/약추세" 등급과 호응)
          const tCls = _report.trend.score>=60?'buy':_report.trend.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px;padding:8px 10px 4px;border-left:4px solid var(--accent);background:var(--accent-glow);border-radius:0 6px 6px 0">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--accent)">추세 강도</span><span style="font-size:14px;font-weight:800;color:var(--'+tCls+')">'+_report.trend.score+_deltaTag(_trendDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.trend.level+'</span></div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_report.trend.position+'</div>';
          // S85→S87: 추세 조건별 가중치 — met만 표시, unmet 토글 숨김
          if((_report.trend.metW && _report.trend.metW.length) || (_report.trend.unmetW && _report.trend.unmetW.length)) {
            var _tmw = _report.trend.metW || [];
            var _tuw = _report.trend.unmetW || [];
            var _tUnmetId = 'tu_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            _tmw.forEach(function(c){
              var gTag = c.group==='ref'?' [참고]':'';
              html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap" title="최대 '+c.maxW+' / '+c.group+'">[+] '+c.name+' <span style="font-size:7px;opacity:.6">'+c.weight+gTag+'</span></span>';
            });
            html += '</div>';
            if(_tuw.length) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_tUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_tuw.length+'개</div>';
              html += '<div id="'+_tUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              _tuw.forEach(function(c){
                var gTag = c.group==='ref'?' [참고]':'';
                html += '<span style="font-size:8px;color:var(--sell);white-space:nowrap;opacity:.7" title="최대 '+c.maxW+' / '+c.group+'">[-] '+c.name+' <span style="font-size:7px">'+c.weight+gTag+'</span></span>';
              });
              html += '</div>';
            }
          }
          // S85: _breakdown 요약 (signal/sub/ctx/aux 그룹별 합계)
          if(_report.trend.breakdown) {
            var bd = _report.trend.breakdown;
            html += '<div style="font-size:8px;color:var(--text3);line-height:1.5;margin-bottom:4px">';
            html += '기술신호 '+bd.signal+' · 보조 '+bd.subW+' · 맥락 '+bd.ctxW+' · 추가 '+bd.aux+' → 종합 '+bd.combined;
            html += '</div>';
          }
          html += '</div>';

          // S88: 추세 강도 추이 → SXChart.drawDeltaBar 캔버스
          if(_mom && _mom.history.length >= 3){
            const _tbCanvasId = _3stageId + '_tbc';
            const _tRev = _mom.history.slice().reverse().map(function(h){ return {score: h.trendScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">추세 강도 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_tbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_tbCanvasId, _tRev, _mom.lookback); }, 80);
          }

          // S87: 구간 분포 추이 → SXChart.drawScoreSpark 캔버스
          if(stock._btTransitionStats && stock._btTransitionStats.timeline && stock._btTransitionStats.timeline.length >= 3) {
            const tl = stock._btTransitionStats.timeline;
            const _tlDetailId = _3stageId + '_tld';
            const _tlCanvasId = _3stageId + '_tlc';
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">구간 분포 추이 ('+tl.length+'포인트) <span style="font-size:7px;color:var(--text3);font-weight:400">bar 클릭=상세</span></div>';
            html += '<canvas id="'+_tlCanvasId+'" style="width:100%;height:50px;display:block;cursor:pointer"></canvas>';
            html += '<div id="'+_tlDetailId+'" style="display:none;margin-top:4px;padding:4px 8px;background:var(--surface);border-radius:6px;font-size:8px;color:var(--text2);line-height:1.5"></div>';
            html += '</div>';
            // 렌더 후 그리기 (setTimeout으로 DOM 삽입 대기)
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawScoreSpark) SXChart.drawScoreSpark(_tlCanvasId, tl, _tlDetailId); }, 50);
          }

          // S127: 진입 검토 추이 차트는 Layer 2(ready) 섹션 바로 뒤로 이동 — 여기서는 제거
          //   이전 위치(구간분포 추이 다음)는 이미 A→A→C 레이어가 끝난 뒤라 문맥 부정합

          // 데이터 지연 판정
          if(_report.staleness.warning){
            html += '<div style="padding:6px 8px;background:rgba(255,140,0,.08);border-radius:6px;font-size:9px;line-height:1.5;color:var(--text2)">';
            html += '<span style="font-weight:700;color:#ff8c00">데이터 시점: '+_report.staleness.label+'</span><br>'+_report.staleness.warning;
            html += '</div>';
          }

          // 최종 판정
          html += '<div style="margin-top:8px;padding:8px 10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">';
          html += '<div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:4px">'+_report.verdict.label+'</div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;white-space:pre-line">'+_report.verdict.text+'</div>';
          html += '</div>';

          return html;
        })()}
        </div>`;
      })()}
      <div id="${_stratDetailId}" style="display:${stock._engineVerifyOpen ? 'block' : 'none'};margin-top:8px">
      ${(()=>{
        // S114: "매수 근거 평가" 카드 → "엔진판단 검증 결과" 6칸 카드로 교체
        //   [이전 문제] calcEntryEvaluation이 C 판정과 독립 계산 → 청산/즉시청산 상태에서도 "양호한 매수 60점" 표시 (역행 이슈)
        //     · S112에서 발견된 미래에셋증권 사례: 반등조짐 ⬇ / 전이 20% ⬇ / 매수근거 60점 ⬆ (모순)
        //     · 수학적 재현: 즉시청산 상태 + analScore=45/RR=1.2/BT=75 → "보통 매수 45점" (완전 모순)
        //   [S114 해결] 계산된 점수 대신 "실제 BT 결과"를 표시 → 검증된 데이터이므로 C와 독립이어도 사실
        //     · 프로젝트 C v3.0 원칙 ⑧ "검증가능성" 준수
        //   [레이아웃] 6칸 (승률/손익비/수익률/거래수/MDD/평균이익) — 단일검증 탭과 연동
        //   [데이터 없음 시] "▶ 엔진판단 검증 버튼을 눌러 백테스트를 실행하세요" 안내
        //   [복원 필요 시] 이전 매수 근거 평가 카드 코드는 git 히스토리 또는 s113 백업 참조
        const _btR = stock._btResult;
        if(!_btR || _btR.error || !_btR.totalTrades){
          return `
      <div style="margin-top:10px;padding:14px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid var(--text3);text-align:center">
        <div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:6px">📊 엔진판단 검증 결과</div>
        <div style="font-size:10.5px;color:var(--text3);line-height:1.5">백테스트 결과 없음<br>위 <b>엔진판단 검증 ▶</b> 버튼 클릭 시 실행됩니다</div>
      </div>`;
        }
        // BT 결과 6칸: 승률/손익비/수익률 / 거래수/MDD/평균소득
        const _wr = _btR.winRate ?? 0;
        const _pnl = _btR.totalPnl ?? 0;
        const _tr = _btR.totalTrades ?? 0;
        const _mdd = Math.abs(_btR.mdd ?? 0);
        const _avgP = _btR.avgWin ?? (_btR.avgProfit > 0 ? _btR.avgProfit : 0);
        const _avgL = _btR.avgLoss ?? (_btR.avgProfit < 0 ? Math.abs(_btR.avgProfit) : 0);
        // 손익비 (profit factor 우선, 없으면 avgWin/avgLoss)
        let _rr = _btR.profitFactor ?? 0;
        if(!_rr && _avgP > 0 && _avgL > 0) _rr = _avgP / _avgL;
        const _rrStr = _rr > 0 ? _rr.toFixed(2) : '—';
        // S117: 평균소득 = totalPnl / trades (거래당 순 평균)
        //   단일검증의 "평균이득"(이긴 거래 평균)과는 다른 지표 — 라벨 분리로 혼동 방지
        const _avgIncome = _tr > 0 ? (_pnl / _tr) : 0;
        const _avgIncomeStr = _tr > 0 ? (_avgIncome.toFixed(1) + '%') : '—';
        // S116: 데이터 충족/부족/충분 라벨 (기존 하단 "매매전략" 배너에서 이관)
        //   거래수 기준: < BT_MIN_TRADES(10) = 부족 / < 30 = 충족 / >= 30 = 충분
        let _dataLabel, _dataClr;
        if(_tr < BT_MIN_TRADES){ _dataLabel = '데이터 부족'; _dataClr = '#e8365a'; }
        else if(_tr < 30){ _dataLabel = '데이터 충족'; _dataClr = '#3b82f6'; }
        else { _dataLabel = '데이터 충분'; _dataClr = '#22c55e'; }
        //   승률, 수익률, 평균소득 — 음수 빨강 / 양수 녹색 (간단 2단계)
        //   손익비, MDD — 기본 검정 (var(--text))
        //   거래수 — 데이터 충족 라벨과 동일 색 (부족=빨강/충족=파랑/충분=녹색)
        const _posColor = '#22c55e';  // 녹색 (양수)
        const _negColor = '#e8365a';  // 빨강 (음수)
        const _wrClr = _wr > 0 ? _posColor : _negColor;  // 승률은 항상 양수라 사실상 녹색
        const _pnlClr = _pnl >= 0 ? _posColor : _negColor;
        const _avgIncomeClr = _avgIncome >= 0 ? _posColor : _negColor;
        const _rrClr = '#f472b6';  // 손익비 핑크 (보조 긍정)
        const _mddClr = '#8b5cf6'; // MDD 보라 (보조 부정)
        const _trClr = _dataClr;       // 거래수는 데이터 충족 라벨과 동일색
        // 봉수 표시 (투명성)
        const _rowsLen = _btR.rowsLength || 0;
        const _rowsBadge = _rowsLen >= 600 ? '🟢' : _rowsLen >= 400 ? '🔵' : _rowsLen > 0 ? '🔴' : '';
        // S120-2: 강건성 배지 (🌱 신뢰 / ⚠️ 불안)
        //   200봉 vs 600봉 수익률 편차 기반 — 구간 의존성(과적합) 탐지
        //   stock._robustness.show=true일 때만 렌더 (봉수/거래수 조건 충족 시)
        let _robBadge = '';
        if(stock._robustness && stock._robustness.show){
          const _rob = stock._robustness;
          const _robIcon = _rob.label === 'trust' ? '🌱' : '⚠️';
          const _robText = _rob.label === 'trust' ? '신뢰' : '불안';
          const _robColor = _rob.label === 'trust' ? '#22c55e' : '#f59e0b';
          const _robBg = _rob.label === 'trust' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)';
          const _robTitle = `200봉 ${_rob.pnl200.toFixed(1)}% vs 600봉 ${_rob.pnl600.toFixed(1)}% · 편차 ${(_rob.deviation*100).toFixed(0)}%`;
          _robBadge = `<span title="${_robTitle}" style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;background:${_robBg};border-radius:10px;font-size:10px;font-weight:800;color:${_robColor};margin-left:6px">${_robIcon} ${_robText}</span>`;
        }
        return `
      <div style="margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid #3b82f6">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <div style="font-size:11px;color:var(--text2);font-weight:700;letter-spacing:-.3px">📊 엔진판단 검증 결과 <span style="color:${_dataClr};font-weight:800;margin-left:4px">· ${_dataLabel}</span>${_robBadge}</div>
          <div style="font-size:10px;color:var(--text3);white-space:nowrap">${_rowsBadge} ${_rowsLen}봉</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_wrClr};line-height:1.2">${_wr.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">승률</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_rrClr};line-height:1.2">${_rrStr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">손익비</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_pnlClr};line-height:1.2">${_pnl>=0?'+':''}${_pnl.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">수익률</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_trClr};line-height:1.2">${_tr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">거래수</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_mddClr};line-height:1.2">${_mdd.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">MDD</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_avgIncomeClr};line-height:1.2">${_avgIncomeStr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">평균소득</div>
          </div>
        </div>
      </div>`;
      })()}
      ${(()=>{
        // ═══════════════════════════════════════════════════════════════
        // S116: "매매 근거 상세" 카드 + "_buildBtBanner" 하단 배너 완전 제거
        //   [삭제 대상 1] 매매 근거 상세 카드 (SXE.calcEntryPrice + SXE.calcTpSlRr + SXI.advTpSl)
        //     · ATR/피봇 수치 → 이미 "지표 분석" 섹션에 존재 (기술적 지표: ATR, 피벗 라인)
        //     · "보수적 접근 필요", "파라미터 조정 검토" 등 판단 문구 → SXI/SXE Layer 1 독자 판단
        //     · "목표가/손절가 산출 근거", "진입가 산출 근거" → SXE 독자 추천
        //     → 모든 텍스트가 프로젝트 C v3.0 원칙 ①(독자판정금지), ②(C의 단일성) 위반
        //   [삭제 대상 2] _buildBtBanner(stock, qs) — 하단 "매매전략 — 데이터 충족" 배너
        //     · 상단 "엔진판단 검증 결과" 6칸 카드와 내용 중복 (승률/수익/거래/MDD/손익비)
        //     · "데이터 충족" 라벨만 엔진판단 검증 결과 카드 타이틀 옆으로 이관 (S116 수정 1)
        //   [유지] 지표 분석 섹션 (ATR, 피벗, ADX 등 원시 측정값) — 판단이 아닌 측정값
        //   [복원 필요 시] S115 이전 sx_render.js 또는 s115_continuity.html 참조
        //
        //   프로젝트 C v3.0 원칙:
        //     · 원칙 ① "독자판정금지": SXE/SXI Layer 1 독자 판단 텍스트 전부 제거
        //     · 원칙 ② "C의 단일성": 판단은 SXC.supervisorJudge(C)만 담당
        //     · 원칙 ⑤ "정합 우선": 상단 6칸 카드(BT 결과)와 중복 제거
        //     · 원칙 ⑦ "UI 역할 분리": 측정값=지표 분석, 판정=C 배너, 검증=BT 6칸 카드
        // ═══════════════════════════════════════════════════════════════
        return '';
      })()}
      <div class="anal-fold" style="margin-top:12px">
        <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 실패 분석 · 전략 라이프사이클</div>
        <div class="anal-fold-body">
      ${(()=>{
        // S70: 실패 분석 (Failure Analysis)
        if(typeof SXI==='undefined' || !SXI.failureAnalysis) return '';
        const _btD = _getBtData(stock);
        if(!_btD || !_btD.trades || !_btD.trades.length) return '';
        const fa = SXI.failureAnalysis(_btD, indicators, qs, _analTF);
        if(!fa) return '';
        const faId = 'fa_' + Math.random().toString(36).slice(2,8);
        const riskColor = fa.riskProfile.level==='danger'?'var(--sell)':fa.riskProfile.level==='warning'?'#ff8c00':fa.riskProfile.level==='bullish'?'var(--buy)':'var(--text2)';
        let faHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${faId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 실패 분석 <span style="font-size:9px;font-weight:600;color:${riskColor};margin-left:4px">${fa.riskProfile.label}</span></div>
          <div class="itp-card" id="${faId}" style="white-space:normal;margin-top:4px">`;

        // 요약
        faHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${fa.summary}</div>`;

        // 승패 통계 비교
        if(fa.stats){
          const st = fa.stats;
          faHTML += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
            <div style="padding:6px 8px;background:var(--buy-bg);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">이익 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--buy)">${st.winCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 +${st.avgWin}% / ${st.avgWinBars}봉</div>
            </div>
            <div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">손실 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--sell)">${st.lossCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 -${st.avgLoss}% / ${st.avgLossBars}봉</div>
            </div>
          </div>`;
        }

        // 손실 패턴
        if(fa.lossPatterns.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">손실 패턴</div>`;
          fa.lossPatterns.forEach(p => {
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px;border-left:3px solid var(--sell)">
              <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">${p.title} (${p.count}건, ${p.ratio}%)</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${p.detail}</div>
              <div style="font-size:10px;color:var(--accent);line-height:1.5">-> ${p.suggestion}</div>
            </div>`;
          });
        }

        // 최악의 거래
        if(fa.worstTrade){
          faHTML += `<div style="padding:8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">최대 손실 거래</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${fa.worstTrade.detail}</div>
          </div>`;
        }

        // 연속 손실
        if(fa.streakAnalysis){
          const sa = fa.streakAnalysis;
          faHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#ff8c00;margin-bottom:3px">연속 손실 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${sa.detail}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${sa.interpretation}</div>
          </div>`;
        }

        // MDD 맥락
        if(fa.mddContext){
          const mc = fa.mddContext;
          const mddColor = mc.severity==='위험'?'var(--sell)':mc.severity==='주의'?'#ff8c00':mc.severity==='보통'?'var(--text2)':'var(--buy)';
          faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:${mddColor};margin-bottom:3px">MDD ${mc.mdd.toFixed(1)}% — ${mc.severity}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${mc.advice}</div>
          </div>`;
        }

        // 개선 제안
        if(fa.improvements.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">개선 제안</div>`;
          fa.improvements.forEach(imp => {
            const prioColor = imp.priority==='high'?'var(--sell)':imp.priority==='mid'?'#ff8c00':'var(--text3)';
            const prioLabel = imp.priority==='high'?'중요':imp.priority==='mid'?'권장':'참고';
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px">
              <div style="font-size:9px;font-weight:700;color:${prioColor};margin-bottom:2px">${prioLabel} — ${imp.area}</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${imp.text}</div>
            </div>`;
          });
        }

        faHTML += `</div></div>`;
        return faHTML;
      })()}
      ${(()=>{
        // S72: 전략 라이프사이클 (Strategy Lifecycle)
        if(typeof SXE==='undefined' || !SXE.strategyLifecycle) return '';
        if(typeof SXI==='undefined' || !SXI.lifecycleGuide) return '';
        const _btD = _getBtData(stock);
        if(!_btD || !_btD.trades || _btD.trades.filter(t=>t.type==='WIN'||t.type==='LOSS').length < 6) return '';
        const regime = qs?.regime || null;
        const lc = SXE.strategyLifecycle(_btD, regime);
        if(!lc) return '';
        const guide = SXI.lifecycleGuide(lc);
        if(!guide) return '';
        const lcId = 'lc_' + Math.random().toString(36).slice(2,8);
        const phaseColor = {'growth':'var(--buy)','mature':'var(--accent)','decline':'#ff8c00','decay':'var(--sell)','early':'var(--text3)','unstable':'#ff8c00'}[lc.phase]||'var(--text2)';
        const gradeColor = {'A':'var(--buy)','B':'var(--accent)','C':'var(--text2)','D':'#ff8c00','F':'var(--sell)'}[lc.health.grade]||'var(--text2)';
        let lcHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${lcId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 전략 라이프사이클 <span style="font-size:9px;font-weight:600;color:${phaseColor};margin-left:4px">${guide.title.replace('전략 상태: ','')}</span> <span style="font-size:9px;font-weight:600;color:${gradeColor};margin-left:4px">${lc.health.grade}</span></div>
          <div class="itp-card" id="${lcId}" style="white-space:normal;margin-top:4px">`;

        // 건강도 + 단계 배지
        lcHTML += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <div style="padding:4px 10px;border-radius:12px;background:${phaseColor};color:#fff;font-size:10px;font-weight:700">${lc.phaseLabel}</div>
          <div style="font-size:12px;font-weight:700;color:${gradeColor}">${guide.healthText}</div>
        </div>`;

        // 요약
        lcHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${guide.summary}</div>`;

        // 구간별 추이 차트 (텍스트 기반 바)
        if(lc.quarters && lc.quarters.length >= 2){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">구간별 성과 추이</div>`;
          lcHTML += `<div style="display:grid;grid-template-columns:repeat(${lc.quarters.length},1fr);gap:4px;margin-bottom:8px">`;
          lc.quarters.forEach(q => {
            const barH = Math.max(4, Math.min(40, q.winRate * 0.6));
            const qColor = q.winRate >= 55 ? 'var(--buy)' : q.winRate >= 45 ? 'var(--accent)' : q.winRate >= 35 ? '#ff8c00' : 'var(--sell)';
            lcHTML += `<div style="text-align:center">
              <div style="font-size:9px;color:var(--text3);margin-bottom:2px">${q.label}</div>
              <div style="margin:0 auto;width:24px;height:${barH}px;background:${qColor};border-radius:3px"></div>
              <div style="font-size:9px;color:var(--text2);margin-top:2px">${q.winRate}%</div>
              <div style="font-size:8px;color:var(--text3)">PF${q.pf}</div>
            </div>`;
          });
          lcHTML += `</div>`;
          // 추이 텍스트
          guide.quarterTexts.forEach(qt => {
            lcHTML += `<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:3px;padding-left:8px;border-left:2px solid var(--accent)">· ${qt}</div>`;
          });
        }

        // 퇴화 신호
        if(guide.decayTexts.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--sell);margin:10px 0 6px">퇴화 신호</div>`;
          guide.decayTexts.forEach(dt => {
            const isHigh = dt.startsWith('[심각]');
            lcHTML += `<div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:4px;border-left:3px solid ${isHigh?'var(--sell)':'#ff8c00'}">
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${dt}</div>
            </div>`;
          });
        }

        // 유효기간 추정
        if(lc.validityEstimate){
          const ve = lc.validityEstimate;
          const urgColor = ve.urgency==='immediate'?'var(--sell)':ve.urgency==='soon'?'#ff8c00':'var(--text2)';
          lcHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin:8px 0;border-left:3px solid ${urgColor}">
            <div style="font-size:10px;font-weight:700;color:${urgColor};margin-bottom:2px">전략 유효기간 추정</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${ve.text}</div>
          </div>`;
        }

        // 레짐 연동
        if(guide.regimeText){
          lcHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin:8px 0">
            <div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:2px">레짐 연동 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${guide.regimeText}</div>
          </div>`;
        }

        // 행동 제안
        if(guide.actions.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">단계별 행동 제안</div>`;
          guide.actions.forEach((a, i) => {
            lcHTML += `<div style="display:flex;gap:6px;margin-bottom:4px;font-size:10px;line-height:1.6;color:var(--text2)"><span style="flex-shrink:0;width:16px;height:16px;border-radius:50%;background:${phaseColor};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</span><span>${a}</span></div>`;
          });
        }

        lcHTML += `</div></div>`;
        return lcHTML;
      })()}
        </div>
      </div>
      </div>
      ${(()=>{
        // S69: 초보자 실전 가이드
        // S103-fix7 Phase3-B-1: practicalGuide 입력 _btAction → _svVerdict.action로 교체 (C 직접 소비)
        //   프로젝트 C 원칙 ② "C의 단일성" 준수 — 감독관 판정(_svVerdict) 9종 직접 전달
        if(typeof SXI==='undefined' || !SXI.practicalGuide) return '';
        const _pgMkt = stock._mkt || stock.market || currentMarket;
        const _pgTfOk = _isBtSupportedTF(_pgMkt, _analTF);
        const _pgTrades = _getBtTotalTrades(stock);
        const _pgInsuf = !_pgTfOk || _pgTrades < BT_MIN_TRADES;
        const _verdictAct = _pgInsuf ? '' : (stock._svVerdict?.action || '');
        const _as = qs?.score ?? scores?.total ?? 0;
        const _bs = _pgInsuf ? 0 : (stock._btScore ?? 0);
        const _sum = (typeof SXI!=='undefined' && SXI.summary) ? SXI.summary(qs?.action, _as, stock._safetyReasons, indicators, _verdictAct || null) : null;
        const pg = SXI.practicalGuide(_verdictAct, _as, _bs, _sum, indicators);
        if(!pg || !pg.title) return '';
        const pgId = 'pg_' + Math.random().toString(36).slice(2,8);
        let pgHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${pgId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 이 결과를 어떻게 활용할까요?</div>
          <div class="itp-card" id="${pgId}" style="white-space:normal;margin-top:4px">
            <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px">${pg.title}</div>`;
        pg.steps.forEach((st,i)=>{
          pgHTML += `<div style="display:flex;gap:6px;margin-bottom:6px;font-size:10px;line-height:1.6;color:var(--text2)"><span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</span><span>${st}</span></div>`;
        });
        if(pg.nextAction) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin:6px 0;line-height:1.55"><span style="font-weight:700;color:var(--buy)">다음 행동</span><br><span style="color:var(--text2)">${pg.nextAction}</span></div>`;
        if(pg.caution) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">주의</span><br><span style="color:var(--text2)">${pg.caution}</span></div>`;
        if(pg.crossCheck) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">함께 확인하세요</span><br><span style="color:var(--text2)">${pg.crossCheck}</span></div>`;
        if(pg.extras && pg.extras.length){
          pgHTML += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">현재 지표 상태 요약</div>`;
          pg.extras.forEach(e=>{ pgHTML += `<div style="font-size:10px;color:var(--text2);margin-bottom:3px;line-height:1.5;padding-left:8px;border-left:2px solid var(--accent)">· ${e}</div>`; });
          pgHTML += `</div>`;
        }
        pgHTML += `</div></div>`;
        return pgHTML;
      })()}
    </div>

    ${(()=>{
      if(!qs) return '';
      const regime = qs.regime;
      const tags = stock._smartTags || scrSmartFilterCheck(qs);
      // [v1.6 추가] SXI 모듈 미로드 / advRegime 누락 시 폴백 — 최소한의 레짐 정보는 보장
      //   기존: typeof SXI === 'undefined' 또는 SXI.advRegime 누락 시 regimeItp = null
      //         → 라인 2903 "▶ 레짐 상세 해석" 토글이 통째로 사라짐
      //         → 사용자에게는 "🔒 변동성극단" 배지만 보이고 본문 비어있는 증상
      //   개선: SXI 정상 로드 시 정상 해석, 미로드 시 regime 객체 자체로 최소 텍스트 생성
      const regimeItp = (regime ? (
        (typeof SXI!=='undefined' && SXI.advRegime)
          ? SXI.advRegime(regime)
          : { tone:'neutral',
              label: regime.label || '레짐 정보',
              text: `추세강도(ADX) ${regime.adx!=null?regime.adx.toFixed(0):'?'} · 변동폭(BB) ${regime.bbWidth!=null?regime.bbWidth.toFixed(1):'?'}% · 방향 ${regime.direction||'?'}\n해석 모듈(SXI) 로딩 대기 중 — 새로고침 후 재진입 시 상세 해석이 표시됩니다.` }
      ) : null);
      const regimeItpId = 'regime_' + Math.random().toString(36).slice(2,8);
      // S71: 레짐 적응형 파라미터 현황
      const _ra = qs._regimeAdapt || null;
      const _aTh = qs._adaptedTh || null;
      const _baseTh = (typeof _getEffectiveTh!=='undefined') ? _getEffectiveTh(_analTF) : null;
      const _raGuide = (typeof SXI!=='undefined' && SXI.regimeAdaptGuide && _ra && _aTh && _baseTh) ? SXI.regimeAdaptGuide(regime, _ra, _aTh, _baseTh) : null;
      const _raEnabled = (typeof SXE!=='undefined' && SXE.regimeAdaptEnabled) ? SXE.regimeAdaptEnabled() : false;
      const _raToggleId = 'raToggle_' + Math.random().toString(36).slice(2,8);
      const _raGuideId = 'raGuide_' + Math.random().toString(36).slice(2,8);
      let _raHTML = '';
      if(_raEnabled && _ra && _ra.buyThAdj !== 0){
        // S125: 레짐 보정은 임계값에 적용되지 않음(슬롯 저장값이 이미 레짐 반영됨).
        //   대신 "현재 시장이 어떤 레짐으로 감지됐는지"만 참고용으로 표시.
        //   BUY 62→57 같은 화살표 표시는 삭제(이중 보정 오해 소지).
        const _raColor = _ra.label==='공격'||_ra.label==='공격+경계'?'var(--buy)':_ra.label==='보수'||_ra.label==='방어'||_ra.label==='방어+경계'?'var(--sell)':'var(--accent)';
        _raHTML = `<div style="margin-top:6px;padding:6px 8px;background:rgba(${_raColor==='var(--buy)'?'0,200,150':_raColor==='var(--sell)'?'255,59,48':'100,140,255'},.08);border-radius:6px;border-left:3px solid ${_raColor}">
          <div style="font-size:10px;font-weight:700;color:${_raColor};margin-bottom:2px">감지 레짐: ${_ra.label}</div>
          <div style="font-size:9px;color:var(--text2);line-height:1.5">현재 슬롯 BUY ${_baseTh?_baseTh.buyTh:'?'} · SELL ${_baseTh?_baseTh.sellTh:'?'} (레짐에 맞춰 저장된 값 그대로 사용)</div>
        </div>`;
        if(_raGuide){
          _raHTML += `<div style="margin-top:4px">
            <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${_raGuideId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 레짐 특성 설명</div>
            <div class="itp-card" id="${_raGuideId}" style="white-space:normal;margin-top:4px">
              <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:6px">${_raGuide.title}</div>
              ${_raGuide.items.map(it=>`<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px;padding-left:8px;border-left:2px solid var(--accent)">· ${it}</div>`).join('')}
              ${_raGuide.note?`<div style="font-size:10px;color:var(--text3);margin-top:6px;font-style:italic">${_raGuide.note}</div>`:''}
            </div>
          </div>`;
        }
      } else if(!_raEnabled){
        _raHTML = `<div style="margin-top:4px;font-size:9px;color:var(--text3)">레짐 적응: OFF (고정 파라미터 슬롯 사용)</div>`;
      }
      return `<div class="anal-section" style="background:var(--surface2)">
        <div class="anal-section-title" style="margin-bottom:6px">시장 레짐</div>
        ${regime?`<div style="font-size:10px;color:var(--text2);margin-bottom:4px">${regime.icon} ${regime.label} · 추세강도 ${(regime.adx||0).toFixed(0)} · 변동폭 ${(regime.bbWidth||0).toFixed(1)}%</div>`:''}
        ${qs.reasons&&qs.reasons.length?`<div style="font-size:10px;color:var(--hold);margin-bottom:4px">${qs.reasons.join(' ')}</div>`:''}
        ${tags.length?`<div class="sf-tags" style="margin-top:4px">${tags.map(t=>`<span class="sf-tag ${t.dir>0?'pos':t.dir<0?'neg':'neutral'}">${t.label}</span>`).join('')}</div>`:''}
        ${regimeItp?`<div style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${regimeItpId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 레짐 상세 해석</div>
          <div class="itp-card" id="${regimeItpId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${regimeItp.tone}">${regimeItp.label}</span><div>${regimeItp.text}</div></div>
        </div>`:''}
        ${_raHTML}
      </div>`;
    })()}

    ${summaryHTML}

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 부문별 점수</div>
      <div class="anal-fold-body">
    <div class="anal-section">
      <div class="anal-row"><span class="al">모멘텀</span><span class="ar ${scores.momentum>=55?'bullish':scores.momentum<=45?'bearish':'neutral'}">${scores.momentum}</span></div>
      ${sectorItp&&sectorItp.momentum?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.momentum.tone}">${sectorItp.momentum.grade}</span><div>${sectorItp.momentum.text}</div></div>`:''}
      <div class="anal-row"><span class="al">밸류</span><span class="ar ${scores.value>=55?'bullish':scores.value<=45?'bearish':'neutral'}">${scores.value}</span></div>
      ${sectorItp&&sectorItp.value?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.value.tone}">${sectorItp.value.grade}</span><div>${sectorItp.value.text}</div></div>`:''}
      <div class="anal-row"><span class="al">거래량</span><span class="ar ${scores.volume>=55?'bullish':scores.volume<=45?'bearish':'neutral'}">${scores.volume}</span></div>
      ${sectorItp&&sectorItp.volume?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.volume.tone}">${sectorItp.volume.grade}</span><div>${sectorItp.volume.text}</div></div>`:''}
      <div class="anal-row"><span class="al">추세</span><span class="ar ${scores.trend>=55?'bullish':scores.trend<=45?'bearish':'neutral'}">${scores.trend}</span></div>
      ${sectorItp&&sectorItp.trend?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.trend.tone}">${sectorItp.trend.grade}</span><div>${sectorItp.trend.text}</div></div>`:''}
      <div id="discSectorArea"></div>
    </div>
      </div>
    </div>

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 지표 분석</div>
      <div class="anal-fold-body">
    ${advHTML}

    ${techHTML}
      </div>
    </div>

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 재무·매크로·기본정보</div>
      <div class="anal-fold-body">
    ${(()=>{
      // S55→S57: 재무분석 카드 (DART 원본 + 네이버 폴백)
      const fin = stock._financial || null;
      if(!fin || typeof SXI==='undefined' || !SXI.advFundamental) return '';
      const fi = SXI.advFundamental(fin, stock.price);
      if(!fi) return '';
      const fiId = 'fund_' + Math.random().toString(36).slice(2,8);
      const fmtAmt = (v) => { if(v==null) return '—'; const a=Math.abs(v); if(a>=1e12) return (v/1e12).toFixed(1)+'조'; if(a>=1e8) return (v/1e8).toFixed(0)+'억'; if(a>=1e4) return (v/1e4).toFixed(0)+'만'; return v.toLocaleString(); };
      const fmtGr = (v) => { if(v==null) return ''; const s=v>0?'+':''; return `<span class="${v>0?'bullish':v<0?'bearish':'neutral'}" style="font-size:9px;margin-left:4px">(${s}${v.toFixed(1)}%)</span>`; };
      const srcBadge = fin._source ? `<span style="font-size:8px;color:var(--text3);float:right">${fin._source.toUpperCase()}${fin._reportLabel ? ' · ' + fin._reportLabel : ''}</span>` : '';
      return `<div class="anal-section">
        <div class="anal-section-title">재무 분석 ${srcBadge}</div>
        ${fin.revenue!=null?`<div class="anal-row"><span class="al">매출액</span><span class="ar">${fmtAmt(fin.revenue)}${fmtGr(fin.revenueGrowth)}</span></div>`:''}
        ${fin.operatingIncome!=null?`<div class="anal-row"><span class="al">영업이익</span><span class="ar ${fin.operatingIncome>0?'bullish':'bearish'}">${fmtAmt(fin.operatingIncome)}${fmtGr(fin.opIncomeGrowth)}</span></div>`:''}
        ${fin.netIncome!=null?`<div class="anal-row"><span class="al">당기순이익</span><span class="ar ${fin.netIncome>0?'bullish':'bearish'}">${fmtAmt(fin.netIncome)}${fmtGr(fin.netIncomeGrowth)}</span></div>`:''}
        ${fin.per!=null?`<div class="anal-row"><span class="al">PER</span><span class="ar ${fin.per>0&&fin.per<=15?'bullish':fin.per>50||fin.per<0?'bearish':'neutral'}">${fin.per.toFixed(1)}배</span></div>`:''}
        ${fin.pbr!=null?`<div class="anal-row"><span class="al">PBR</span><span class="ar ${fin.pbr>0&&fin.pbr<=1.5?'bullish':fin.pbr>5?'bearish':'neutral'}">${fin.pbr.toFixed(2)}배</span></div>`:''}
        ${fin.roe!=null?`<div class="anal-row"><span class="al">ROE</span><span class="ar ${fin.roe>=15?'bullish':fin.roe<0?'bearish':'neutral'}">${fin.roe.toFixed(1)}%</span></div>`:''}
        ${fin.eps!=null?`<div class="anal-row"><span class="al">EPS</span><span class="ar">${fin.eps.toLocaleString()}원</span></div>`:''}
        ${fin.dividendYield!=null&&fin.dividendYield>0?`<div class="anal-row"><span class="al">배당수익률</span><span class="ar ${fin.dividendYield>=3?'bullish':'neutral'}">${fin.dividendYield.toFixed(1)}%</span></div>`:''}
        ${fin.debtRatio!=null?`<div class="anal-row"><span class="al">부채비율</span><span class="ar ${fin.debtRatio>200?'bearish':fin.debtRatio<50?'bullish':'neutral'}">${fin.debtRatio.toFixed(0)}%</span></div>`:''}
        ${fin.revenue!=null&&fin._source==='dart'?`<canvas id="finBarChart" width="280" height="120" style="width:100%;max-width:320px;height:120px;margin:8px auto 4px;display:block"></canvas><div style="font-size:8px;color:var(--text3);text-align:center">매출(파랑) / 영업이익(초록) / 순이익(주황) — ${fin._reportLabel||'연간'} 3기</div>`:''}
        ${fin._source==='dart'?`<div id="finTrendWrap" style="margin-top:8px;display:none"><canvas id="finTrendChart" width="340" height="160" style="width:100%;max-width:360px;height:160px;margin:0 auto;display:block"></canvas><div style="font-size:8px;color:var(--text3);text-align:center" id="finTrendLabel">분기별 추이 로딩중...</div></div>`:''}
        <div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${fiId}');el.classList.toggle('show');this.querySelector('.sb-arrow').textContent=el.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> ${fi.label}</div>
        <div class="itp-card" id="${fiId}" style="white-space:pre-line">
          <span class="itp-label ${fi.tone}">${fi.label}</span>
          <div>${fi.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${fi.summary}</div>
        </div>
      </div>`;
    })()}

    ${(()=>{
      // S55: 매크로 환경 카드
      const mac = _macroCtx || null;
      if(!mac || typeof SXI==='undefined' || !SXI.advMacro) return '';
      const mi = SXI.advMacro(mac);
      if(!mi) return '';
      const miId = 'macro_' + Math.random().toString(36).slice(2,8);
      const fmt = (v,dec) => v!=null ? v.toFixed(dec||1) : '—';
      return `<div class="anal-section">
        <div class="anal-section-title">매크로 환경</div>
        ${mac.dxy?`<div class="anal-row"><span class="al">달러인덱스</span><span class="ar ${mac.dxy.trend==='down'?'bullish':mac.dxy.trend==='up'?'bearish':'neutral'}">${fmt(mac.dxy.price,2)} (${mac.dxy.change5d>0?'+':''}${fmt(mac.dxy.change5d)}%)</span></div>`:''}
        ${mac.tnx?`<div class="anal-row"><span class="al">미국10년금리</span><span class="ar ${mac.tnx.trend==='down'?'bullish':mac.tnx.trend==='up'?'bearish':'neutral'}">${fmt(mac.tnx.price,2)}%</span></div>`:''}
        ${mac.usdkrw?`<div class="anal-row"><span class="al">달러/원 환율</span><span class="ar ${mac.usdkrw.trend==='down'?'bullish':mac.usdkrw.trend==='up'?'bearish':'neutral'}">${fmt(mac.usdkrw.price,0)}원</span></div>`:''}
        ${mac.vix?`<div class="anal-row"><span class="al">VIX</span><span class="ar ${mac.vix.price>=25?'bearish':mac.vix.price<=15?'bullish':'neutral'}">${fmt(mac.vix.price,1)}</span></div>`:''}
        ${mac.gold?`<div class="anal-row"><span class="al">금(XAU)</span><span class="ar ${mac.gold.trend==='up'?'neutral':mac.gold.trend==='down'?'bullish':'neutral'}">$${fmt(mac.gold.price,1)}</span></div>`:''}
        <div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${miId}');el.classList.toggle('show');this.querySelector('.sb-arrow').textContent=el.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600;margin-top:6px"><span class="sb-arrow">▶</span> ${mi.label} (점수: ${mi.score})</div>
        <div class="itp-card" id="${miId}" style="white-space:pre-line">
          <span class="itp-label ${mi.tone}">${mi.label}</span>
          <div>${mi.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${mi.summary}</div>
        </div>
      </div>`;
    })()}

    <div class="anal-section">
      <div class="anal-section-title">기본 정보</div>
      <div class="anal-row"><span class="al">시가총액</span><span class="ar">${formatMCap(stock.marketCap)}</span></div>
      ${basicItp&&basicItp.marketCap?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.marketCap.text}</div></div>`:''}
      <div class="anal-row"><span class="al">현재가</span><span class="ar">${formatKRW(stock.price||0)}</span></div>
      <div class="anal-row"><span class="al">등락률</span><span class="ar ${stock.changeRate>0?'bullish':stock.changeRate<0?'bearish':'neutral'}">${stock.changeRate>0?'+':''}${(stock.changeRate||0).toFixed(2)}%</span></div>
      ${basicItp&&basicItp.changeRate?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.changeRate.text}</div></div>`:''}
      <div class="anal-row"><span class="al">거래량</span><span class="ar">${(stock.volume||0).toLocaleString()}</span></div>
      <div class="anal-row"><span class="al">거래대금</span><span class="ar">${formatTradeAmt(stock.tradeAmount)}</span></div>
      ${basicItp&&basicItp.tradeAmount?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.tradeAmount.text}</div></div>`:''}
      <div class="anal-row"><span class="al">외국인 지분</span><span class="ar">${(stock.foreignRatio||0).toFixed(1)}%</span></div>
      ${basicItp&&basicItp.foreignRatio?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.foreignRatio.text}</div></div>`:''}
      ${stock.faceValue?`<div class="anal-row"><span class="al">액면가</span><span class="ar">${stock.faceValue.toLocaleString()}원</span></div>`:''}
      ${stock.capital?`<div class="anal-row"><span class="al">자본금</span><span class="ar">${stock.capital.toFixed(0)}억</span></div>`:''}
      ${(()=>{
        if(typeof SXI==='undefined' || !SXI.advCapitalStructure) return '';
        if(!stock.faceValue && !stock.capital) return '';
        const ci = SXI.advCapitalStructure(stock.faceValue, stock.capital, stock.marketCap, stock.price);
        if(!ci) return '';
        const ciId = 'capstr_' + Math.random().toString(36).slice(2,8);
        return `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${ciId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${ci.label}</div>
        <div class="itp-card" id="${ciId}" style="white-space:pre-line">
          <span class="itp-label ${ci.tone}">${ci.label}</span>
          <div>${ci.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${ci.summary}</div>
        </div>`;
      })()}
      ${stock.shortBalanceRatio?`<div class="anal-row"><span class="al">공매도 잔고</span><span class="ar ${stock.shortBalanceRatio>5?'bearish':stock.shortBalanceRatio>2?'neutral':'bullish'}">${stock.shortBalanceRatio.toFixed(2)}%</span></div>`:''}
      ${(()=>{
        if(typeof SXI==='undefined' || !SXI.advShortSelling) return '';
        if(!stock.shortBalanceRatio) return '';
        const si = SXI.advShortSelling(stock.shortBalanceRatio, {
          price: stock.price, changeRate: stock.changeRate,
          volume: stock.volume, foreignRatio: stock.foreignRatio, marketCap: stock.marketCap
        });
        if(!si) return '';
        const siId = 'short_' + Math.random().toString(36).slice(2,8);
        return `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${siId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${si.label}</div>
        <div class="itp-card" id="${siId}" style="white-space:pre-line">
          <span class="itp-label ${si.tone}">${si.label}</span>
          <div>${si.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${si.summary}</div>
        </div>`;
      })()}
      <div class="anal-row"><span class="al">결산월</span><span class="ar" id="analSettleMonth">—</span></div>
      <div id="settleMonthItpArea"></div>
    </div>

    ${(()=>{
      // S58: 공시 해석 카드 (advDisclosure 결과가 있을 때)
      if(typeof SXI==='undefined' || !SXI.renderDisclosureCard) return '';
      const di = stock._disclosureItp;
      if(!di) return '';
      return SXI.renderDisclosureCard(di);
    })()}
      </div>
    </div>

    ${(()=>{
      if(typeof SXI==='undefined' || !SXI.relatedKeywords) return '';
      const kws = SXI.relatedKeywords(stock, indicators, qs);
      if(!kws || !kws.length) return '';
      return `<div class="anal-section">
        <div class="anal-section-title">연관 키워드</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;padding:4px 0">
          ${kws.map(k=>`<span class="kw-chip" onclick="_sxVib(8);navigator.clipboard.writeText('${k.replace(/'/g,"\\'")}');this.classList.add('copied');(window._sxTrackedTimeout || setTimeout)(()=>this.classList.remove('copied'),800)">${k}</span>`).join('')}
        </div>
        <div style="font-size:8px;color:var(--text3);margin-top:4px">키워드를 탭하면 클립보드에 복사됩니다</div>
      </div>`;
    })()}
  `;
  // S31: 미니 캔들차트 그리기
  if(indicators?._advanced?.rows){
    (window._sxTrackedTimeout || setTimeout)(()=>_drawMiniCandleChart(indicators._advanced.rows, stock._btResult?.trades, stock._svVerdict), 50);
  }
  // S57: 재무 바차트 그리기
  if(stock._financial && stock._financial._source === 'dart' && typeof SXChart !== 'undefined' && SXChart.drawFinBar){
    (window._sxTrackedTimeout || setTimeout)(() => SXChart.drawFinBar('finBarChart', stock._financial), 80);
  }
  // S58: 분기별 재무 추이 차트 (비동기 복수 fetch)
  if(currentMarket==='kr' && stock.code && stock._financial && stock._financial._source === 'dart' && typeof SXChart !== 'undefined' && SXChart.drawFinTrend){
    _fetchQuarterlyTrend(stock.code).then(periods => {
      const wrap = document.getElementById('finTrendWrap');
      const label = document.getElementById('finTrendLabel');
      if(!wrap) return;
      if(!periods || periods.length < 2){
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = 'block';
      if(label) label.textContent = `매출(파랑) / 영업이익(초록) / 순이익(주황) — ${periods.length}기 추이`;
      (window._sxTrackedTimeout || setTimeout)(() => SXChart.drawFinTrend('finTrendChart', periods), 100);
    }).catch(() => {
      const wrap = document.getElementById('finTrendWrap');
      if(wrap) wrap.style.display = 'none';
    });
  }
  // S57→S58: 결산월 비동기 fetch + 해석 (DART company, 1건)
  if(currentMarket==='kr' && stock.code){
    fetch(`${WORKER_BASE}/dart/company?stock_code=${stock.code}`, {signal:AbortSignal.timeout(8000)})
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        const el = document.getElementById('analSettleMonth');
        if(el && d && d.acc_month){
          el.textContent = d.acc_month + '월';
          // S58: 결산월 해석 삽입
          const itpArea = document.getElementById('settleMonthItpArea');
          if(itpArea && typeof SXI!=='undefined' && SXI.advSettleMonth){
            const smi = SXI.advSettleMonth(d.acc_month);
            if(smi){
              const smId = 'sm_' + Math.random().toString(36).slice(2,8);
              itpArea.innerHTML = `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${smId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${smi.label}</div>
              <div class="itp-card" id="${smId}" style="white-space:pre-line">
                <span class="itp-label ${smi.tone}">${smi.label}</span>
                <div>${smi.text}</div>
                <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${smi.summary}</div>
              </div>`;
            }
          }
        }
      })
      .catch(()=>{});
  }
}

// ══ S56: 공시 UI 동적 렌더 (비동기 fetch 완료 후 호출) ══
function _renderDisclosureUI(stock, scores, indicators, qs){
  const di = stock._disclosureItp;
  // 1) 배지 영역 (종목명 카드)
  const badgeArea = document.getElementById('discBadgeArea');
  if(badgeArea && di && di.badges && di.badges.length){
    // S57: 카테고리별 그룹화 배지
    const grouped = {};
    for(const b of di.badges){
      const cat = b.category || '기타';
      if(!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(b);
    }
    // S103-fix6: 카테고리별 2열 그리드 배치 (홀수 마지막은 전체 폭 중앙정렬)
    // S103-fix6b: 좌우 쌍 가운데 수렴 — 좌측 셀 우측정렬 + 우측 셀 좌측정렬
    const catEntries = Object.entries(grouped);
    const isOdd = catEntries.length % 2 === 1;
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;align-items:start">';
    catEntries.forEach(([cat, badges], idx) => {
      const isLast = idx === catEntries.length - 1;
      const fullWidth = isOdd && isLast;
      let cellStyle;
      if(fullWidth) cellStyle = 'grid-column:1 / -1;text-align:center';
      else if(idx % 2 === 0) cellStyle = 'text-align:right';  // 좌측 셀: 우측정렬
      else cellStyle = 'text-align:left';                      // 우측 셀: 좌측정렬
      html += `<div style="${cellStyle}"><span style="font-size:8px;color:var(--text3);font-weight:600;margin-right:4px">${cat}</span>`;
      html += badges.map(b => `<span class="disc-badge ${b.cls}" title="${b.date||''}" ${b.url?`data-dart-url="${b.url}"`:''}>${b.text}</span>`).join('');
      html += `</div>`;
    });
    html += '</div>';
    html += di.badges.some(b=>b.url) ? `<div style="font-size:7px;color:var(--text3);margin-top:3px;text-align:center">탭하여 DART 원문 확인 →</div>` : '';
    badgeArea.innerHTML = html;
    badgeArea.querySelectorAll('.disc-badge[data-dart-url]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => window.open(el.dataset.dartUrl, '_blank');
    });
  }
  // 2) 부문별 점수 공시 행
  const sectorArea = document.getElementById('discSectorArea');
  if(sectorArea && di){
    const ds = di.sectorScore;
    const dCls = ds>=55?'bullish':ds<=45?'bearish':'neutral';
    const itpId = 'disc_sec_' + Math.random().toString(36).slice(2,8);
    sectorArea.innerHTML = `
      <div class="anal-row"><span class="al">공시</span><span class="ar ${dCls}">${ds}</span></div>
      <div class="itp-card show" style="margin-top:2px;margin-bottom:6px">
        <span class="itp-label ${di.tone==='danger'?'danger':di.tone}">${di.sectorGrade}</span>
        <div>${di.sectorText}</div>
      </div>
      ${di.text ? `<div style="margin-top:2px">
        <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${itpId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 공시 상세 해석</div>
        <div class="itp-card" id="${itpId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${di.tone}">${di.label}</span><div>${di.text}</div>
        <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${di.summary}</div></div>
      </div>` : ''}`;
  }
  // 3) 참고사항 오버라이드 (공시 감지 후 재렌더 — Phase3-C-1 다이나믹 레이어 적용)
  if(di && di.tone !== 'neutral' && typeof SXI!=='undefined' && SXI.overrideSummaryWithDisclosure){
    const summaryEl = document.querySelector('.itp-summary');
    if(summaryEl && qs && indicators){
      // S103-fix7 Phase3-B-3: verdictAction 5번째 파라미터 전달 (공시 갱신 재렌더 시에도 보유 맥락 유지)
      const _verdictActForDisc = stock._svVerdict?.action || null;
      const baseSummary = SXI.summary(qs.action, qs.score, qs.reasons, indicators, _verdictActForDisc);
      if(baseSummary){
        const overridden = SXI.overrideSummaryWithDisclosure(baseSummary, di);
        // Phase3-C-1: 공시 tone 직접 전달 → 레이어 정확히 판정
        const _layer = _getSummaryLayerConfig(overridden, di.tone);
        // 기존 layer-l* 클래스 제거 후 새 레벨 클래스 부착 (border/background 자동 반영)
        summaryEl.classList.remove('layer-l0','layer-l1','layer-l2','layer-l3','layer-l4');
        summaryEl.classList.add('layer-' + _layer.level);
        // 참고사항 HTML 재렌더 (제목도 레이어에 맞춰 동적으로)
        summaryEl.innerHTML = `
          <div class="itp-summary-title"><span>${_layer.icon}</span><span>${_layer.label}</span></div>
          ${overridden.stateLine?`<div style="font-size:11px;font-weight:800;color:var(--${overridden.tone==='bullish'?'buy':overridden.tone==='bearish'?'sell':'hold'});margin-bottom:4px">${overridden.stateLine}</div>`:''}
          <div class="itp-summary-text">${overridden.mainText}</div>
          ${overridden.actionGuide?`<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin:6px 0 4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">행동 가이드</span><br><span style="color:var(--text2)">${overridden.actionGuide}</span></div>`:''}
          ${overridden.invalidation?`<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">무효화 조건</span><br><span style="color:var(--text2)">${overridden.invalidation}</span></div>`:''}
          ${overridden.buyTrigger?`<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin-bottom:6px;line-height:1.55"><span style="font-weight:700;color:var(--buy)">강화 조건</span><br><span style="color:var(--text2)">${overridden.buyTrigger}</span></div>`:''}
          ${overridden.keyReasons&&overridden.keyReasons.length?'<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">핵심 이유</div>':''}
          ${(overridden.keyReasons||[]).map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
          ${overridden.risks&&overridden.risks.length?'<div style="font-size:10px;font-weight:700;color:var(--sell);margin:6px 0 4px">위험 요소</div>':''}
          ${(overridden.risks||[]).map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
        `;
      }
    }
  }
  // 4) 레짐 카드에 공시 배지 추가
  if(di && di.badges && di.badges.length){
    const regimeSection = document.querySelector('.anal-section [style*="surface2"]');
    if(regimeSection){
      const existing = regimeSection.querySelector('.disc-regime-badges');
      if(!existing){
        const badgeDiv = document.createElement('div');
        badgeDiv.className = 'disc-regime-badges';
        badgeDiv.style.cssText = 'margin-top:4px;display:flex;flex-wrap:wrap;gap:2px';
        badgeDiv.innerHTML = di.badges.map(b => `<span class="disc-badge ${b.cls}">${b.text}</span>`).join('');
        const tagsEl = regimeSection.querySelector('.sf-tags');
        if(tagsEl) tagsEl.after(badgeDiv);
        else regimeSection.appendChild(badgeDiv);
      }
    }
  }
}

function formatMCap(v){
  if(!v) return '0';
  // v는 억원 단위가 정상, 원단위가 들어올 수 있음 → 자동 정규화
  if(v>100000000) v = v / 100000000;
  if(v>=10000) return (v/10000).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'조';
  if(v>=1) return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억';
  const man = v * 10000;
  if(man>=10000) return (man/10000).toFixed(0)+'억';
  if(man>=1) return man.toFixed(0).toLocaleString()+'만';
  return '0';
}
function formatTradeAmt(v){
  if(!v) return '0';
  // v는 백만원 단위가 정상, 원단위가 들어올 수 있음 → 자동 정규화
  if(v>10000000) v = v / 1000000;
  if(v>=1000000) return (v/1000000).toFixed(1)+'조';
  if(v>=100) return (v/100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억';
  if(v>=1) return v.toFixed(0)+'백만';
  return '0';
}
function formatKRW(v){
  if(!v) return '0원';
  if(v>=1000000000000) return (v/1000000000000).toFixed(1)+'조원';
  if(v>=100000000) return (v/100000000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억원';
  if(v>=10000) return (v/10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'만원';
  if(v>=1000) return (v/1000).toFixed(0)+'천원';
  return v.toFixed(0)+'원';
}

// ══════════════════════════════════════════════════════════════
//  S73: 섹터 레이더 카드 렌더링
// ══════════════════════════════════════════════════════════════

function renderSectorRadarCard(radarGuide) {
  if (!radarGuide || radarGuide.momentumLabel === '-') return '';
  const g = radarGuide;
  const momBg = g.momentum === 'strong_bull' ? '#f443361a' : g.momentum === 'bull' ? '#ff57221a' : g.momentum === 'bear' ? '#2196f31a' : g.momentum === 'strong_bear' ? '#1565c01a' : 'var(--surface2)';

  let html = `<div class="sx-card sx-sector-radar" style="margin-top:10px">
    <div class="sx-card-hdr" onclick="this.parentElement.classList.toggle('fold')" style="cursor:pointer">
      <span class="sx-card-title">📡 ${g.title}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${g.momentumColor}22;color:${g.momentumColor};font-weight:700">${g.momentumLabel}</span>
      <span class="sx-fold-icon" style="margin-left:auto;font-size:10px;color:var(--text3)">▼</span>
    </div>
    <div class="sx-card-body">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">${g.summary}</div>`;

  // 강세 TOP5
  if (g.bullTexts.length > 0) {
    html += `<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#f44336;margin-bottom:4px">🔺 강세 TOP5</div>`;
    html += g.bullTexts.map(t => {
      const m = t.match(/^(\d+)\.\s+(.+?)\s+([+-]?[\d.]+%)\s+\((.+)\)$/);
      if (m) {
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)">
          <span style="color:var(--text3);width:14px">${m[1]}.</span>
          <span style="flex:1;font-weight:600;color:var(--text)">${m[2]}</span>
          <span style="color:#f44336;font-weight:700">${m[3]}</span>
          <span style="color:var(--text3);font-size:9px">${m[4]}</span>
        </div>`;
      }
      return `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`;
    }).join('');
    html += '</div>';
  }

  // 약세 TOP5
  if (g.bearTexts.length > 0) {
    html += `<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#2196f3;margin-bottom:4px">🔻 약세 TOP5</div>`;
    html += g.bearTexts.map(t => {
      const m = t.match(/^(\d+)\.\s+(.+?)\s+([+-]?[\d.]+%)\s+\((.+)\)$/);
      if (m) {
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)">
          <span style="color:var(--text3);width:14px">${m[1]}.</span>
          <span style="flex:1;font-weight:600;color:var(--text)">${m[2]}</span>
          <span style="color:#2196f3;font-weight:700">${m[3]}</span>
          <span style="color:var(--text3);font-size:9px">${m[4]}</span>
        </div>`;
      }
      return `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`;
    }).join('');
    html += '</div>';
  }

  // 자금 쏠림
  if (g.capitalFlowText) {
    html += `<div style="font-size:10px;padding:6px 8px;border-radius:6px;background:${momBg};color:var(--text2);margin-bottom:6px">${g.capitalFlowText}</div>`;
  }

  // 관심종목 매칭
  if (g.watchlistTexts.length > 0) {
    html += `<div style="margin-top:4px"><div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:4px">[참고] 내 관심종목 섹터 현황</div>`;
    html += g.watchlistTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`).join('');
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

// ══════════════════════════════════════════════════════════════
//  S73: 상관/분산 카드 렌더링
// ══════════════════════════════════════════════════════════════

function renderCorrelationCard(corrGuide, corrData) {
  if (!corrGuide || corrGuide.riskLabel === '-') return '';
  const g = corrGuide;

  // 분산 점수 게이지 바
  const score = g.diversityScore || 0;
  const gaugeColor = score >= 75 ? '#4caf50' : score >= 60 ? '#8bc34a' : score >= 45 ? '#ff9800' : score >= 30 ? '#ff5722' : '#f44336';

  let html = `<div class="sx-card sx-correlation" style="margin-top:10px">
    <div class="sx-card-hdr" onclick="this.parentElement.classList.toggle('fold')" style="cursor:pointer">
      <span class="sx-card-title">🔗 ${g.title}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${g.riskColor}22;color:${g.riskColor};font-weight:700">${g.riskLabel}</span>
      <span class="sx-fold-icon" style="margin-left:auto;font-size:10px;color:var(--text3)">▼</span>
    </div>
    <div class="sx-card-body">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">${g.summary}</div>`;

  // 분산 점수 게이지
  html += `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:10px;font-weight:700;color:var(--text)">분산 점수</span>
      <span style="font-size:12px;font-weight:800;color:${gaugeColor}">${score}점 (${g.diversityGrade})</span>
    </div>
    <div style="height:8px;border-radius:4px;background:var(--surface2);overflow:hidden">
      <div style="height:100%;width:${score}%;border-radius:4px;background:${gaugeColor};transition:width .3s"></div>
    </div>
    <div style="font-size:9px;color:var(--text3);margin-top:3px">${g.diversityText}</div>
  </div>`;

  // 미니 히트맵 (corrData가 있으면)
  if (corrData && corrData.matrix && corrData.matrix.length >= 2 && corrData.matrix.length <= 15) {
    const n = corrData.matrix.length;
    const stocks = corrData.pairs.length > 0 ? null : []; // pairs에서 이름 추출
    const names = [];
    // stocksData가 없으므로 pairs에서 유니크한 이름 추출
    const nameSet = new Set();
    if (corrData.pairs) {
      for (const p of corrData.pairs) {
        if (!nameSet.has(p.a.idx)) { nameSet.add(p.a.idx); names[p.a.idx] = p.a.name; }
        if (!nameSet.has(p.b.idx)) { nameSet.add(p.b.idx); names[p.b.idx] = p.b.name; }
      }
    }

    const cellSize = Math.min(24, Math.floor(260 / n));
    html += `<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">상관 히트맵</div>`;
    html += `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:8px">`;
    // 헤더
    html += '<tr><td></td>';
    for (let j = 0; j < n; j++) {
      const nm = (names[j] || '').slice(0, 3);
      html += `<td style="width:${cellSize}px;text-align:center;color:var(--text3);padding:1px;font-size:7px;writing-mode:vertical-rl">${nm}</td>`;
    }
    html += '</tr>';
    for (let i = 0; i < n; i++) {
      html += `<tr><td style="text-align:right;padding-right:3px;color:var(--text3);font-size:7px;white-space:nowrap">${(names[i] || '').slice(0, 4)}</td>`;
      for (let j = 0; j < n; j++) {
        const v = corrData.matrix[i][j];
        let bg = '#9e9e9e33';
        if (v === 1) bg = '#4caf5066';
        else if (v !== null) {
          const abs = Math.abs(v);
          if (v > 0) bg = abs > 0.7 ? '#f4433666' : abs > 0.4 ? '#ff980044' : '#4caf5022';
          else bg = abs > 0.4 ? '#2196f366' : '#2196f322';
        }
        const txt = v === 1 ? '1' : v !== null ? v.toFixed(1) : '-';
        html += `<td style="width:${cellSize}px;height:${cellSize}px;text-align:center;background:${bg};border:1px solid var(--border);font-size:7px;color:var(--text)">${txt}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div></div>';
  }

  // 클러스터 경고
  if (g.clusterTexts.length > 0) {
    html += `<div style="margin-bottom:6px">`;
    html += g.clusterTexts.map(t => `<div style="font-size:10px;padding:4px 8px;border-radius:6px;background:#f443361a;margin-bottom:3px;color:var(--text2)">${t}</div>`).join('');
    html += '</div>';
  }

  // 경고
  if (g.warningTexts.length > 0) {
    html += g.warningTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`).join('');
  }

  // 섹터 분포
  if (g.sectorText) {
    html += `<div style="font-size:10px;padding:6px 8px;border-radius:6px;background:var(--surface2);margin-top:6px;color:var(--text2)">[참고] ${g.sectorText}</div>`;
  }

  // 제안
  if (g.suggestionTexts.length > 0) {
    html += `<div style="margin-top:6px">`;
    html += g.suggestionTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--accent)">${t}</div>`).join('');
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

// S73: 포트폴리오 진단 전체 렌더 (섹터 레이더 + 상관/분산)
function renderPortfolioDiagnosis(containerId, radarGuide, corrGuide, corrData) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let html = '';
  if (radarGuide) html += renderSectorRadarCard(radarGuide);
  if (corrGuide) html += renderCorrelationCard(corrGuide, corrData);
  if (!html) html = '<div style="padding:20px;text-align:center;font-size:11px;color:var(--text3)">진단 데이터를 로딩 중...</div>';
  el.innerHTML = html;
}

async function saveAnalResult(){
  if(!currentAnalStock) return;
  let indicators = currentAnalStock._indicators || null;
  if(!indicators){
    try{
      const candles = await fetchCandles(currentAnalStock.code, (currentMarket==='kr' && window._kisEnabled) ? 500 : 200, _analTF);
      if(candles && candles.length>=20) indicators = calcIndicators(candles, _analTF);
    }catch(e){}
  }
  const scores = indicators ? calcEnhancedScores(currentAnalStock, indicators) : calcBasicScores(currentAnalStock);
  const result = {
    code: currentAnalStock.code,
    name: currentAnalStock.name,
    scores,
    timestamp: Date.now(),
  };
  try{
    const saved = JSON.parse(localStorage.getItem(KEYS.ANAL_RESULTS)||'[]');
    const idx = saved.findIndex(r=>r.code===result.code);
    if(idx>=0) saved[idx] = result;
    else saved.unshift(result);
    if(saved.length>50) saved.length = 50;
    localStorage.setItem(KEYS.ANAL_RESULTS, JSON.stringify(saved));
    
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════
//  S99-3: Phase C-1 — 분석탭 멀티TF 시스템
// ══════════════════════════════════════════════════════════════

// TF칩 렌더링
function _renderAnalTfChips(){
  const wrap = document.getElementById('analTfChips');
  if(!wrap) return;
  const mkt = currentMarket || 'kr';
  const tfs = (typeof ANAL_TF_MAP !== 'undefined' ? ANAL_TF_MAP[mkt] : null) || [{k:'day',l:'일봉'}];
  // _analTF가 현재 시장에서 유효한지 확인
  if(!tfs.find(t=>t.k===_analTF)) _analTF = 'day';
  let h = '';
  tfs.forEach(t => {
    // KIS 미연결 시 60분 비활성
    const disabled = (mkt==='kr' && t.k==='60m' && !window._kisEnabled);
    const active = (t.k === _analTF);
    const cacheHit = _analTFCache[t.k];
    // 캐시된 TF의 통합판정 아이콘 표시
    let icon = '';
    if(cacheHit && cacheHit.svVerdict) icon = `<span class="atf-icon">${cacheHit.svVerdict.icon}</span>`;
    h += `<div class="anal-tf-chip${active?' active':''}${disabled?' disabled':''}" onclick="${disabled?'':`_setAnalTF('${t.k}')`}">${t.l}${icon}</div>`;
  });
  wrap.innerHTML = h;
  // 현재 TF의 통합판정 아이콘
  const vEl = document.getElementById('analTfVerdict');
  if(vEl){
    const cur = _analTFCache[_analTF];
    vEl.textContent = (cur && cur.svVerdict) ? cur.svVerdict.icon : '';
  }
}

// TF 전환 핸들러
function _setAnalTF(tf){
  if(!tf || tf === _analTF) return;
  _sxVib(10); // S103-fix5: 분석탭 TF 칩 전환
  _analTF = tf;
  try { localStorage.setItem('SX_ANAL_TF', tf); } catch(_){}
  _renderAnalTfChips();

  const stock = currentAnalStock;
  if(!stock) return;

  // 캐시에 있으면 즉시 렌더 (네트워크 0)
  const cached = _analTFCache[tf];
  if(cached && cached.indicators && Date.now() - cached.timestamp < 14400000){ // 4시간 TTL
    _restoreFromTfCache(stock, cached);
    return;
  }

  // 캐시 없으면 새로 fetch + 분석
  // [2026-04 FIX] 이전 TF(또는 스캔 시점 TF)의 모멘텀/판정 잔류 방지 —
  //   runAnalysis의 "모멘텀 있으면 재사용" 로직이 stale 값을 쓰지 않도록 null 리셋.
  stock._scoreMomentum = null;
  stock._svVerdict = null;
  document.getElementById('analBody').innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>TF 전환 중...</div>`;
  runAnalysis(stock);
}

// 멀티TF 백그라운드 fetch (기본 TF 외)
async function _fetchMultiTfBackground(stock){
  if(!stock) return;
  const mkt = currentMarket || 'kr';
  const tfs = (typeof ANAL_TF_MAP !== 'undefined' ? ANAL_TF_MAP[mkt] : null) || [{k:'day',l:'일봉'}];
  const count = (mkt==='kr' && window._kisEnabled) ? 500 : 200;

  // 기본 TF는 runAnalysis에서 처리하므로 제외
  const otherTfs = tfs.filter(t => t.k !== _analTF && !(mkt==='kr' && t.k==='60m' && !window._kisEnabled));

  const promises = otherTfs.map(async (t) => {
    try {
      // 캐시 유효하면 스킵
      const existing = _analTFCache[t.k];
      if(existing && Date.now() - existing.timestamp < 14400000) return;

      const candles = await fetchCandles(stock.code, count, t.k);
      if(!candles || candles.length < 20) return;

      const indicators = calcIndicators(candles, t.k);
      if(!indicators || !indicators._advanced) return;

      const qs = scrQuickScore(indicators._advanced.rows, t.k);
      const rawRows = candles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));

      // BT
      let btResult = null, btScore = null, btState = null;
      if(typeof SXE!=='undefined' && SXE.runBtEngine && rawRows.length >= 60){
        const _btP = typeof btGetParams === 'function' ? btGetParams() : {};
        const btR = SXE.runBtEngine(rawRows, t.k, _btP);
        if(btR && !btR.error){
          btResult = btR;
          btScore = (typeof calcBtScore === 'function') ? calcBtScore(btR) : null;
          const _cp = candles[candles.length-1]?.close || stock.price || 0;
          btState = (typeof btGetCurrentState === 'function') ? btGetCurrentState(btR, _cp) : null;
        }
      }

      // 감독관
      let scoreMom = null, svJudge = null, svVerdict = null;
      if(typeof SXE!=='undefined' && SXE.scoreMomentum && rawRows.length >= 80){
        scoreMom = SXE.scoreMomentum(rawRows, t.k, 5);
      }
      const analScore = qs ? qs.readyScore : 0;
      const momentum = scoreMom || {};
      const rr = (typeof SXE!=='undefined' && SXE.calcTpSlRr) ?
        (SXE.calcTpSlRr(stock.price, indicators, qs, t.k)?.rr ?? 0) : 0;
      // S-BUGFIX: SXC 네임스페이스 이전 후 구버전 가드 잔존 버그 수정
      if(typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function'){
        svJudge = SXC.supervisorJudge(analScore, momentum, rr);
      }
      // S103-fix7 Phase3-A-2: _isBuySignal 체크 누락 버그 보강 (다른 경로들과 일관성)
      const _btStateKey = btState ? (btState.state==='holding' && btState._isBuySignal ? 'buy_signal' : btState.state==='holding' ? 'holding' : btState.state==='sell_signal' ? 'sell_signal' : 'waiting') : 'waiting';
      if(typeof SXC !== 'undefined' && typeof SXC.unifiedVerdict === 'function'){
        // S103-fix7 Phase3-A-3: btStateObj 4번째 인자 추가 (매도 완료 익절/손절 맥락용)
        // [v1.6] partialHint 계산용 — currentPrice 주입
        // [v1.7] buy_signal 강등 게이트용 — winRate/totalTrades 주입
        const _btStForVerdict = btState ? Object.assign({}, btState, {
          currentPrice: stock.price,
          winRate: btResult ? btResult.winRate : null,
          totalTrades: btResult ? btResult.totalTrades : null
        }) : null;
        svVerdict = SXC.unifiedVerdict(_btStateKey, svJudge, btScore != null ? btScore : null, _btStForVerdict);
      }

      // 캐시 저장
      _analTFCache[t.k] = {
        rows: candles, indicators, qs, scoreMom, 
        btResult, btScore, btState,
        svJudge, svVerdict,
        timestamp: Date.now()
      };

      // TF칩 아이콘 즉시 업데이트
      _renderAnalTfChips();
    } catch(e){ console.warn('[multiTF bg]', t.k, e); }
  });

  await Promise.allSettled(promises);
}

// runAnalysis 완료 후 현재 TF 결과를 캐시에 저장
function _saveCurrentTfCache(stock, indicators, qs, scoreMom, btResult, btScore, btState, svJudge, svVerdict){
  _analTFCache[_analTF] = {
    rows: (indicators && indicators._advanced) ? indicators._advanced.rows : null,
    indicators, qs, scoreMom,
    btResult, btScore, btState,
    svJudge, svVerdict,
    timestamp: Date.now()
  };
  _renderAnalTfChips(); // 아이콘 업데이트
}

// 캐시에서 복원하여 렌더
function _restoreFromTfCache(stock, cached){
  // stock 객체에 캐시 데이터 반영
  stock._btResult = cached.btResult;
  stock._btScore = cached.btScore;
  stock._btState = cached.btState;
  stock._scoreMomentum = cached.scoreMom;
  stock._svVerdict = cached.svVerdict;

  // BT action 계산
  // S103-fix7 Phase3-B-2: 점수 기반 es×bs 4분류 폐기 → C(_svVerdict.action) 매핑
  //   진단 결과 14종목 14/14 정합 실패 확정으로 C 기반 매핑만 사용
  if(cached.svVerdict && cached.svVerdict.action){
    stock._btAction = SXC.mapVerdictToBtAction(cached.svVerdict.action);
  } else {
    stock._btAction = null; // C 없으면 null (레거시 fallback 하지 않음 — 정합 우선)
  }

  const scores = (typeof calcEnhancedScores === 'function') ? calcEnhancedScores(stock, cached.indicators) : null;
  const sectorItp = (typeof SXI!=='undefined') ? SXI.sectorScores(scores, stock, cached.indicators) : null;
  const maAlignItp = (typeof SXI!=='undefined' && cached.indicators) ? SXI.maAlignment(cached.indicators) : null;
  const basicItp = (typeof SXI!=='undefined') ? SXI.basicInfo(stock) : null;

  renderAnalysisResult(stock, scores, cached.indicators, cached.qs, new Date(), sectorItp, maAlignItp, basicItp);
}

// ════════════════════════════════════════════════════════════
//  S99-4: Phase C-2 — 모드칩 렌더 + 전환 + BT 재실행
// ════════════════════════════════════════════════════════════

const _MODE_DEFS = [
  {k:'profit',  l:'🔥수익',  name:'수익형'},
  {k:'balanced',l:'⚖️안정', name:'안정형'},
  {k:'safe',    l:'🛡️보수', name:'보수형'}
];

// S99-5: 모드별 대표 프리셋 조회 (OPT_BEST V3: mode→{ranks, representId})
function _getRepresentPreset(mode){
  let all;
  try { all = JSON.parse(localStorage.getItem('SX_OPT_BEST3')) || {}; } catch(_){ all = {}; }
  const bucket = all[mode];
  if(!bucket || !bucket.ranks || bucket.ranks.length === 0) return null;
  // ★대표가 지정되어 있으면 해당 entry 반환
  if(bucket.representId){
    const rep = bucket.ranks.find(r => r.id === bucket.representId);
    if(rep && rep.params) return rep;
  }
  // 대표 미지정 시 1위(score 최고) 반환
  return (bucket.ranks[0] && bucket.ranks[0].params) ? bucket.ranks[0] : null;
}

// 모드칩 렌더
function _renderAnalModeChips(){
  const wrap = document.getElementById('analModeChips');
  if(!wrap) return;
  let h = '';
  _MODE_DEFS.forEach(m => {
    const active = (m.k === _analMode);
    const preset = _getRepresentPreset(m.k);
    const dim = !preset; // 대표 프리셋 없으면 dim
    const scoreLabel = preset ? `${(preset.score||0).toFixed(0)}pt` : '';
    h += `<div class="anal-mode-chip${active?' active':''}${dim&&!active?' dim':''}" onclick="_setAnalMode('${m.k}')">${m.l}${scoreLabel ? `<span style='font-size:8px;margin-left:2px;opacity:.7'>${scoreLabel}</span>` : ''}</div>`;
  });
  wrap.innerHTML = h;
  // 상태 표시
  const statusEl = document.getElementById('analModeStatus');
  if(statusEl){
    const cur = _getRepresentPreset(_analMode);
    statusEl.textContent = cur ? `✅ ${(cur.score||0).toFixed(1)}pt` : '';
    statusEl.style.color = cur ? 'var(--accent)' : 'var(--text3)';
  }
}

// 모드 전환 핸들러
function _setAnalMode(mode){
  if(!mode || !['profit','balanced','safe'].includes(mode)) return;
  if(mode === _analMode) return; // 동일 모드 무시
  _sxVib(10); // S103-fix5: 분석탭 모드 칩 전환

  _analMode = mode;
  try { localStorage.setItem('SX_PRESET_MODE', mode); } catch(_){}
  _renderAnalModeChips();

  const stock = currentAnalStock;
  if(!stock) return;

  // 대표 프리셋 확인
  const preset = _getRepresentPreset(mode);
  if(!preset){
    const mName = _MODE_DEFS.find(m=>m.k===mode)?.name || mode;
    toast(`${mName} 프리셋 없음 — 옵티마이저에서 먼저 탐색하세요`);
    // 프리셋 없어도 BT 재실행 (기본 파라미터로)
  } else {
    // 대표 프리셋 파라미터를 analParams에 저장
    if(typeof _saveAnalParams === 'function') _saveAnalParams(preset.params);
    if(typeof loadAnalParamsUI === 'function') loadAnalParamsUI();
  }

  // BT 재실행 → 감독관 재판정 → 배너/차트 갱신
  // 캐시된 캔들 데이터 재사용 (TF는 변경 없으므로)
  _rerunBtForModeChange(stock);
}

// 모드 변경 시 BT 재실행 + 감독관 재판정 + UI 갱신
async function _rerunBtForModeChange(stock){
  if(!stock) return;

  // 로딩 표시
  const body = document.getElementById('analBody');
  if(body) body.innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>모드 전환 중...</div>`;

  try {
    // 캐시에서 캔들 복원 또는 새로 fetch
    let candles = null;
    const cached = _analTFCache[_analTF];
    if(cached && cached.rows && cached.rows.length >= 20){
      candles = cached.rows;
    } else {
      const _analCount = (currentMarket==='kr' && window._kisEnabled) ? 500 : 200;
      candles = await fetchCandles(stock.code, _analCount, _analTF);
    }

    if(!candles || candles.length < 20){
      toast('캔들 데이터 부족');
      runAnalysis(stock); // fallback: 전체 재분석
      return;
    }

    // indicators 재계산 (모드 변경은 buyTh/sellTh 변경 → quickScore 영향)
    const indicators = calcIndicators(candles, _analTF);
    if(!indicators || !indicators._advanced){
      runAnalysis(stock);
      return;
    }

    // quickScore 재계산
    const qs = scrQuickScore(indicators._advanced.rows, _analTF);

    // BT 재실행 (새 모드의 파라미터로)
    let btResult = null, btScore = null, btState = null;
    const rawRows = candles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
    if(typeof SXE!=='undefined' && SXE.runBtEngine && rawRows.length >= 60){
      const _btP = typeof btGetParams === 'function' ? btGetParams() : {};
      const btR = SXE.runBtEngine(rawRows, _analTF, _btP);
      if(btR && !btR.error){
        btResult = btR;
        btScore = (typeof calcBtScore === 'function') ? calcBtScore(btR) : null;
        const _cp = candles[candles.length-1]?.close || stock.price || 0;
        btState = (typeof btGetCurrentState === 'function') ? btGetCurrentState(btR, _cp) : null;
      }
    }

    // 감독관 재판정
    let scoreMom = null;
    if(typeof SXE!=='undefined' && SXE.scoreMomentum && rawRows.length >= 80){
      scoreMom = SXE.scoreMomentum(rawRows, _analTF, 5);
    }

    // stock 객체 업데이트
    stock._btResult = btResult;
    stock._btScore = btScore;
    stock._btState = btState;
    stock._scoreMomentum = scoreMom;
    stock._indicators = null; // 재계산 강제

    // S103-fix7 Phase3-B-2: _btAction 계산 순서 재배치 — svVerdict 생성 후 C 매핑으로
    // (기존: 점수 기반 es×bs 4분류 → 폐기)

    // 캐시 갱신
    const analScore = qs ? (qs.readyScore ?? qs.score ?? 0) : 0;
    const momentum = scoreMom || {};
    const rr = (typeof SXE !== 'undefined' && SXE.calcTpSlRr) ?
      (SXE.calcTpSlRr(stock.price, indicators, qs, _analTF)?.rr ?? 0) : 0;
    let svJudge = null, svVerdict = null;
    // S-BUGFIX: SXC 네임스페이스 이전 후 구버전 가드 잔존 버그 수정
    if(typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function'){
      svJudge = SXC.supervisorJudge(analScore, momentum, rr);
    }
    const _btStateKey = btState ? (btState.state==='holding' && btState._isBuySignal ? 'buy_signal' : btState.state==='holding' ? 'holding' : btState.state==='sell_signal' ? 'sell_signal' : 'waiting') : 'waiting';
    if(typeof SXC !== 'undefined' && typeof SXC.unifiedVerdict === 'function'){
      // S103-fix7 Phase3-A-2: btScore 인자 추가 (empty Stage 2×2 판정용)
      // S103-fix7 Phase3-A-3: btStateObj 4번째 인자 추가 (매도 완료 익절/손절 맥락용)
      // [v1.6] partialHint 계산용 — currentPrice 주입
      // [v1.7] buy_signal 강등 게이트용 — winRate/totalTrades 주입
      const _btResHere = btResult || stock._btResult || null;
      const _btStForVerdict = btState ? Object.assign({}, btState, {
        currentPrice: stock.price,
        winRate: _btResHere ? _btResHere.winRate : null,
        totalTrades: _btResHere ? _btResHere.totalTrades : null
      }) : null;
      svVerdict = SXC.unifiedVerdict(_btStateKey, svJudge, btScore != null ? btScore : null, _btStForVerdict);
    }
    stock._svVerdict = svVerdict;

    // S103-fix7 Phase3-B-2: _btAction 계산을 C 매핑으로 (svVerdict 생성 후)
    if(svVerdict && svVerdict.action){
      stock._btAction = SXC.mapVerdictToBtAction(svVerdict.action);
    } else {
      stock._btAction = null;
    }

    // 캐시 저장
    _analTFCache[_analTF] = {
      rows: candles, indicators, qs, scoreMom,
      btResult, btScore, btState,
      svJudge, svVerdict,
      timestamp: Date.now()
    };
    _renderAnalTfChips();

    // 전체 렌더
    const scores = (typeof calcEnhancedScores === 'function') ? calcEnhancedScores(stock, indicators) : null;
    const sectorItp = (typeof SXI!=='undefined') ? SXI.sectorScores(scores, stock, indicators) : null;
    const maAlignItp = (typeof SXI!=='undefined') ? SXI.maAlignment(indicators) : null;
    const basicItp = (typeof SXI!=='undefined') ? SXI.basicInfo(stock) : null;

    renderAnalysisResult(stock, scores, indicators, qs, new Date(), sectorItp, maAlignItp, basicItp);

  } catch(e){
    console.error('[_rerunBtForModeChange] err', e);
    // fallback: 전체 재분석
    runAnalysis(stock);
  }
}
