// ════════════════════════════════════════════════════════════
//  SIGNAL X — Render Engine v4.6 <!-- S103-fix6c Phase2 양방향3단 전이확률라벨(강세전이↔약세전이) + 감독관통합판정기반 행동배지(통합배너 action옆, _svVerdict.action매핑: 매수→반등유력/관심→반등조짐/청산준비·검토→하락조짐/즉시청산·회피→하락유력, 차트마커와 완전동기화) + .tx-badge CSS 4종(screener.html) --> v4.5 <!-- S103-fix6c Phase1 양방향3단 entry섹션타이틀+강세추이차트 라벨동기화(강세↔약세) --> v4.4 <!-- S103-fix6 매도/진입타이밍 라벨 동기화(3단리포트 ready섹션+추이차트) + 가격UI 4줄→3줄 압축(pct+time 같은줄 · 구분자) + 공시배지 2열그리드(홀수마지막 중앙정렬) + fix6b 공시배지 좌우쌍 가운데수렴(좌=우측정렬+우=좌측정렬) --> v4.3 <!-- S103-fix5 분석탭 TF칩/모드칩/연관키워드 진동 3종 추가 --> v4.2 <!-- S103 분석탭 동적 삼각형 토글 24개 + 차트전체화면 진동 추가 --> v4.1 <!-- S103 결과탭 관심목록(12)/초기화(15) 진동 추가 --> v4.0 <!-- S103 _stratDetailId 스코프버그 수정 (IIFE 안 선언→함수 본체 호이스팅) --> v3.9 <!-- S100 -->
//  S99-5: _getRepresentPreset V3 전환(mode→ranks+representId, market/tf/regime 무관 공통적용)
//  S99-3: Phase B(결과탭 배지→통합판정아이콘) + Phase C-1(멀티TF병렬fetch+TF칩+TF전환)
//  S99-2: threeStageReport verdictAction 전달 + 접기시스템(anal-fold 5섹션)
//  S99-1: 감독관시스템(supervisorJudge+unifiedVerdict)+통합배너1개+매매이력제거+차트마커통합판정
//  S97: 색상통일(매수주황/익절녹/손절빨)+배너차트아래이동+펄스테두리+매매이력정렬+WARN1주석
//  S96: 매매이력 2행 한국식 날짜/가격 포맷 (2026.2.24 / 66,877원)
//  S93: BT신뢰도3색(부족빨강/충족파랑/충분녹색) + BT점수항상표시
//  S87: 모멘텀 삼각형이모지 제거(▲▼→숫자만) + 전이상세 미충족조건 토글숨김(3섹션) + 구간분포추이·모멘텀바차트 SXChart캔버스 위임
//  S86: 메인점수=진입타이밍(준비)+3봉변화량 + 라벨(진입타이밍/강세/추세) + 강세·추세delta표시 + 전이상세버튼 + _showTlDetail라벨매핑
//  S85: 추세조건별체크박스UI(_breakdown역분해)+breakdown요약행+배지전이확률평균+상위종목미리보기+전이마커인터랙티브
//  S84: 5단배지통계요약+진입가중치체크박스+전이추이마커렌더링
//  S83: 5단배지(과열주의/관망)+배지복수선택+전이추이그래프+조건별가중치+이모지전체정리
//  S82: 배지전이확률순정렬 + 체크박스시각화 + 이모지제거 + btTransitionStats전달
//  S81: 결과탭 3단배지필터 + 분석탭 2축(분석×BT)→분석점수클릭→3단리포트펼침
//  S79: 점수 모멘텀 A안(화살표+50점크로스) + B안(5봉 바차트+해석 토글)
//  S77: 분석탭 파라미터 배지 추가 (실제 적용값 전부 표시)
//  S72: lifecycleGuide 전략 라이프사이클 카드 렌더링
//  S70: failureAnalysis 렌더링 (실패 분석 카드)
//  S69: practicalGuide 렌더링 + 이모지 제거
//  S68: sx_screener.html에서 분리 — 결과 렌더링 + 분석 오버레이
//  renderResults, openAnalysis, closeAnalysis, runAnalysis,
//  calcBtScore, renderAnalysisResult, _renderDisclosureUI,
//  formatMCap, formatTradeAmt, formatKRW, saveAnalResult
//  의존: searchResults, currentMarket, currentTF, currentAnalStock,
//        KEYS, WORKER_BASE, SXE, SXI, SXChart (글로벌)
// ════════════════════════════════════════════════════════════

// S79: BT 지원 TF 맵 — 이 TF에서만 매매전략 점수 표시
// ⚠ SINGLE SOURCE: sx_scan_worker.js에도 동일 복사본 존재 — 변경 시 양쪽 동기화 필수
const BT_SUPPORTED_TF = {
  kr:   ['30m','60m','day','week','month'],   // 30분은 KIS 한정
  us:   ['day','week','month'],
  coin: ['60m','240m','day','week','month'],
};
const BT_MIN_TRADES = 10; // 최소 거래 횟수

// ══════════════════════════════════════════════════════════════
//  S99: 감독관 시스템 — 2차 감독관 판정
// ══════════════════════════════════════════════════════════════

// S99: 감독관 판정 (하드코딩 — 튜닝은 실종목 테스트 후)
function supervisorJudge(analScore, momentum, rr) {
  // analScore: 진입타이밍 점수 (readyScore)
  // momentum: {delta, direction:'up'|'down'|'flat'}
  // rr: 손익비 (calcTpSlRr.rr)
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

// S99: BT × 감독관 → 통합 판정
// btState: 'buy_signal'|'holding'|'sell_signal'|'waiting'
// svJudge: supervisorJudge 결과
// → {action, icon, color, chartMarker(null|'buy'|'sell'), label}
function unifiedVerdict(btState, svJudge) {
  // 미보유 상태
  if (btState === 'buy_signal') {
    if (svJudge === 'buy_ready')  return {action:'매수', icon:'🟢', color:'#22c55e', chartMarker:'buy', label:'BT 매수 + 상승 전이중'};
    if (svJudge === 'interest')   return {action:'관심', icon:'🔵', color:'#3b82f6', chartMarker:null, label:'손익비 부족'};
    return                               {action:'관망', icon:'🟡', color:'#f59e0b', chartMarker:null, label:'감독관 미확인'};
  }
  // 보유중 상태 (BT OPEN)
  if (btState === 'holding') {
    if (svJudge === 'buy_ready' || svJudge === 'hold')
      return {action:'보유 유지', icon:'🟢', color:'#22c55e', chartMarker:null, label:'보유 유지'};
    if (svJudge === 'watch')
      return {action:'청산 준비', icon:'🟡', color:'#f59e0b', chartMarker:null, label:'청산 준비'};
    if (svJudge === 'avoid')
      return {action:'청산 검토', icon:'🟠', color:'#ff8c00', chartMarker:null, label:'청산 검토'};
    if (svJudge === 'sell_ready')
      return {action:'즉시 청산', icon:'🔴', color:'#e8365a', chartMarker:'sell', label:'지지선 이탈 + 하락 가속'};
    return {action:'보유 유지', icon:'🟢', color:'#22c55e', chartMarker:null, label:'보유 유지'};
  }
  // 매도 완료 (BT 매도 신호 or 청산 후 대기)
  if (btState === 'sell_signal') {
    return {action:'매도 완료', icon:'🔴', color:'#e8365a', chartMarker:'sell', label:'매도 확인'};
  }
  // 매도 완료 후 대기
  if (btState === 'sold_waiting') {
    if (svJudge === 'buy_ready')  return {action:'관망', icon:'🟡', color:'#f59e0b', chartMarker:null, label:'재진입 시기 아님'};
    if (svJudge === 'watch' || svJudge === 'avoid') return {action:'회피', icon:'🔴', color:'#e8365a', chartMarker:null, label:'회피'};
    if (svJudge === 'sell_ready') return {action:'회피', icon:'🔴', color:'#e8365a', chartMarker:null, label:'매도 확인'};
    return {action:'대기', icon:'⚪', color:'#9e9e9e', chartMarker:null, label:'대기중'};
  }
  // 대기 상태 (매수 신호 없음)
  if (btState === 'waiting') {
    if (svJudge === 'buy_ready' || svJudge === 'interest')
      return {action:'관심', icon:'🔵', color:'#3b82f6', chartMarker:null, label:'신호 대기'};
    return {action:'대기', icon:'⚪', color:'#9e9e9e', chartMarker:null, label:'대기중'};
  }
  // fallback
  return {action:'대기', icon:'⚪', color:'#9e9e9e', chartMarker:null, label:'데이터 없음'};
}

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
  var _zLabel = function(z){ return z==='ready'?'진입타이밍':z==='entry'?'강세':z==='trend'?'추세':z; };
  var txt = '<b>봉 #' + bar + '</b> — ';
  txt += '<span style="color:var(--accent)">진입타이밍 ' + r + '%</span> · ';
  txt += '<span style="color:var(--buy);opacity:.7">강세 ' + e + '%</span> · ';
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
    return;
  }

  // S48: 시장별 필터링
  const mf = _resultMarketFilter;
  const filtered = searchResults.filter(s => (s._mkt || 'kr') === mf);

  if(!filtered.length){
    area.innerHTML = `<div class="result-empty">해당 시장에 검색 결과가 없습니다</div>`;
    updateResultBadge();
    return;
  }

  const arrow = (k)=> sortKey===k ? (sortDir==='desc'?'▼':'▲') : '';
  const sorted = (k)=> sortKey===k ? ' sorted' : '';
  const hasScore = filtered.some(s=>s._score!=null);
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // S99-3: Phase B — 5단 배지 → 통합판정 아이콘 필터
  const _verdictCounts = {buy:0, interest:0, hold:0, watch:0, avoid:0, sell:0, none:0};
  const _verdictMap = {'매수':'buy','관심':'interest','보유 유지':'hold','관망':'watch','대기':'watch','청산 준비':'watch','회피':'avoid','청산 검토':'avoid','즉시 청산':'sell','매도 완료':'sell'};
  filtered.forEach(s => {
    const v = s._svVerdict;
    if(!v){ _verdictCounts.none++; return; }
    const k = _verdictMap[v.action] || 'none';
    _verdictCounts[k]++;
  });
  const _hasVerdicts = filtered.some(s => s._svVerdict);
  const _hasFilter = _stageBadgeFilter.size > 0;
  let displayed = _hasFilter ? filtered.filter(s => {
    const v = s._svVerdict;
    if(!v) return _stageBadgeFilter.has('none');
    const k = _verdictMap[v.action] || 'none';
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
  localStorage.removeItem(KEYS.SEARCH_RESULTS);
  const area = document.getElementById('resultArea');
  area.innerHTML = `<div class="result-empty"><div class="big-ico" style="font-size:28px;opacity:.3;margin-bottom:8px">—</div>내 필터 탭에서 조건을 설정하고<br>검색을 실행하세요</div>`;
  updateResultBadge();
}

function saveSearchResults(){
  try{
    const slim = searchResults.map(s=>({code:s.code,name:s.name,market:s.market,sector:s.sector||'',price:s.price,changeRate:s.changeRate,volume:s.volume,tradeAmount:s.tradeAmount,marketCap:s.marketCap,foreignRatio:s.foreignRatio,volumeRatio:s.volumeRatio,_score:s._score,_action:s._action,_reasons:s._reasons,_smartTags:s._smartTags,_filterScore:s._filterScore,_btScore:s._btScore,_btAction:s._btAction,_mkt:s._mkt||'kr',_regime:s._regime?{label:s._regime.label,icon:s._regime.icon}:null}));
    localStorage.setItem(KEYS.SEARCH_RESULTS, JSON.stringify({results:slim, sortKey, sortDir, ts:Date.now()}));
  }catch(e){ console.warn('saveSearchResults err',e); }
}
function openAnalysis(idx){
  const stock = searchResults[idx];
  if(!stock) return;
  currentAnalStock = stock;
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

  setTimeout(()=>runAnalysis(stock), 500);
  // 멀티TF 백그라운드 fetch (기본 TF 외)
  _fetchMultiTfBackground(stock);
}

function closeAnalysis(){
  document.getElementById('analOverlay').classList.remove('show');
  currentAnalStock = null;
  // S99-3: TF칩 바 숨기고 캐시 클리어
  const tfBar = document.getElementById('analTfBar');
  if(tfBar) tfBar.style.display = 'none';
  Object.keys(_analTFCache).forEach(k => delete _analTFCache[k]);
  // S99-4: 모드칩 바 숨김
  const modeBar = document.getElementById('analModeBar');
  if(modeBar) modeBar.style.display = 'none';
}

async function runAnalysis(stock){
 try{ // S63: 전체 try-catch — 에러 시 무한로딩 방지
  const _analCount = (currentMarket==='kr' && window._kisEnabled) ? 500 : 200; // S67: KIS 500봉
  let indicators = stock._indicators || null;
  let _analCandles = null; // S67: BT 연동용 캔들 보존
  if(!indicators){
    try{
      const candles = await fetchCandles(stock.code, _analCount, _analTF);
      _analCandles = candles;
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
  let _analBtScore = null, _analBtResult = null, _analBtAction = null;
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
        // 종합행동지침 4분류 (스캔 루프와 동일)
        const es = qs ? qs.score : (scores ? scores.total : null);
        if(es != null && _analBtScore != null){
          if(es>=60 && _analBtScore>=60) _analBtAction = '진입 적기';
          else if(es>=60 && _analBtScore<60) _analBtAction = '단기급등 주의';
          else if(es<60 && _analBtScore>=60) _analBtAction = '관심 등록';
          else _analBtAction = '회피';
        }
        stock._btAction = _analBtAction;
      }
    }
  }catch(btErr){ console.warn('[runAnalysis] BT err', btErr); }

  // S79: 점수 모멘텀 계산 (과거 5봉 추이)
  try{
    const momCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || null;
    if(momCandles && momCandles.length >= 80 && typeof SXE!=='undefined' && SXE.scoreMomentum){
      const rawRows = momCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
      stock._scoreMomentum = SXE.scoreMomentum(rawRows, _analTF, 5);
    }
  }catch(momErr){ console.warn('[runAnalysis] momentum err', momErr); }

  const analTime = new Date();

  // S99-3: 현재 TF 결과를 캐시에 저장
  if(typeof _saveCurrentTfCache === 'function'){
    const _svV = stock._svVerdict || null;
    const _svJ = (typeof supervisorJudge === 'function' && qs && stock._scoreMomentum) ?
      supervisorJudge(qs.readyScore||0, stock._scoreMomentum, _svV?._rr||0) : null;
    _saveCurrentTfCache(stock, indicators, qs, stock._scoreMomentum,
      stock._btResult, stock._btScore, stock._btState, _svJ, _svV);
  }

  renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp);
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

// S62: BT 배너 생성 (종합행동지침 — 진입타이밍×매매전략 교차 판정)
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

  // 도움말
  const helpId = 'btGuide_' + Math.random().toString(36).slice(2,8);
  const helpHTML = `
    <div class="bt-banner-help" id="${helpId}">
      <div class="bt-help-section">
        <div class="bt-help-title">두 점수의 의미</div>
        <b>진입타이밍</b> — 최신 봉 기준 순수 기술적 상태 평가 (0~100)<br>
        <b>매매전략</b> — 과거 백테스트 성과 종합 (0~100)<br>
        시점이 다릅니다. 진입타이밍은 "지금 이 순간의 기술적 조건", 매매전략은 "이 전략의 과거 성적표"입니다.<br>
        재무·매크로·공시 등 비기술 요소는 별도 해석 카드에서 참고하세요.
      </div>
      <div class="bt-help-section">
        <div class="bt-help-title">왜 둘 다 필요한가</div>
        진입타이밍 80점 = "기술적으로 반등 조건이 갖춰졌다"<br>
        매매전략 30점 = "하지만 같은 전략으로 반복 매매하면 손실이 컸다"<br><br>
        비유하면 진입타이밍은 "오늘 날씨가 맑다", 매매전략은 "이 지역은 1년 중 비가 200일 온다" 입니다. 오늘 맑다고 해서 우산이 필요 없는 건 아닙니다.
      </div>
      <div class="bt-help-section">
        <div class="bt-help-title">교차 판단 기준</div>
        <table class="bt-guide-table">
          <tr><th>진입타이밍</th><th>매매전략</th><th>행동지침</th></tr>
          <tr><td class="good">≥60</td><td class="good">≥60</td><td><b>진입 적기</b> — 기술+전략 모두 양호</td></tr>
          <tr><td class="good">≥60</td><td class="bad">&lt;60</td><td><b>단기급등 주의</b> — 스캘핑 가능, 중장기 위험</td></tr>
          <tr><td class="bad">&lt;60</td><td class="good">≥60</td><td><b>관심 등록</b> — 전략 유효, 진입 시점 대기</td></tr>
          <tr><td class="bad">&lt;60</td><td class="bad">&lt;60</td><td><b>회피</b> — 기술+전략 모두 부정적</td></tr>
        </table>
      </div>
      <div class="bt-help-section" style="margin-top:10px">
        <b>매매전략</b>이 기준선이고, <b>진입타이밍</b>이 실행 신호입니다.<br>매매전략이 높은 종목에서 진입타이밍 점수가 올라올 때가 가장 좋은 진입 시점입니다.
      </div>
    </div>`;
  const helpBtn = `<span class="bt-help-btn" onclick="var h=document.getElementById('${helpId}');h.classList.toggle('show')">?</span>`;

  const analScore = qs ? qs.score : 0;
  const analGood = analScore >= 60;

  // BT 미실행
  if(!btData){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">전략 미검증</div>${helpBtn}</div>
      <div class="bt-action-line neutral">단일검증 탭에서 백테스트 후 교차 판단 가능</div>
      <div class="bt-banner-body">진입타이밍 ${analScore}점 — 매매전략 미실행. 진입타이밍만으로는 전략의 과거 성과를 알 수 없습니다. 단일검증 탭에서 백테스트를 실행하면 두 점수를 교차 비교할 수 있습니다.</div>
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

  // S79→S93: 거래 10회 미만 → 점수는 표시하되 신뢰도 경고
  if(trades < BT_MIN_TRADES){
    const _insufScore = calcBtScore(btData);
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">매매전략 — <span style="color:${_bReliColor};font-weight:700">${_bReliLabel}</span></div>${helpBtn}</div>
      <div class="bt-action-line neutral">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요${_insufScore!=null?' · BT점수 '+_insufScore:''}</div>
      <div class="bt-banner-body">현재 ${trades}건의 매매 기록으로는 전략 성과를 신뢰하기 어렵습니다. 관심종목에 등록하여 거래 데이터를 ${BT_MIN_TRADES}회 이상 누적한 후 확인하세요.</div>
      ${btDateStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px;text-align:right">${btDateStr}</div>`:''}
      ${helpHTML}
    </div>`;
  }

  const btScore = calcBtScore(btData);
  const btGood = btScore >= 60;

  // S62: 4분류 — 매매전략이 기준선, 진입타이밍이 트리거
  let actionText, actionCls, bannerCls, detailText;
  if(analGood && btGood){
    actionText = '진입 적기';
    actionCls = 'buy';
    bannerCls = 'pass';
    detailText = `진입타이밍 ${analScore}점, 매매전략 ${btScore}점 — 기술적 타이밍과 과거 전략 성과가 동시에 양호합니다. 수익률 ${pnl>=0?'+':''}${pnl.toFixed(1)}%, 승률 ${wr.toFixed(0)}%, ${trades}회 거래, PF ${pf.toFixed(2)}`;
  } else if(analGood && !btGood){
    actionText = '단기급등 주의';
    actionCls = 'warn';
    bannerCls = 'warn';
    detailText = `진입타이밍 ${analScore}점으로 기술적 조건은 양호하지만, 매매전략 ${btScore}점으로 과거 전략 성과가 부진합니다. 단기 스캘핑에는 기회일 수 있으나, 중장기 보유는 위험합니다. 수익률 ${pnl.toFixed(1)}%, 승률 ${wr.toFixed(0)}%, MDD ${mdd.toFixed(1)}%`;
  } else if(!analGood && btGood){
    actionText = '관심 등록';
    actionCls = 'hold';
    bannerCls = 'watch';
    detailText = `매매전략 ${btScore}점으로 과거 전략은 유효하지만, 진입타이밍 ${analScore}점으로 아직 진입 시점이 아닙니다. 진입타이밍 점수가 60 이상으로 올라올 때 진입을 검토하세요. 수익률 ${pnl>=0?'+':''}${pnl.toFixed(1)}%, 승률 ${wr.toFixed(0)}%, PF ${pf.toFixed(2)}`;
  } else {
    actionText = '회피';
    actionCls = 'sell';
    bannerCls = 'danger';
    detailText = `진입타이밍 ${analScore}점, 매매전략 ${btScore}점 — 현재 기술적 상태와 과거 전략 성과 모두 부진합니다. 다른 종목이나 조건을 검토하세요. 수익률 ${pnl.toFixed(1)}%, 승률 ${wr.toFixed(0)}%, MDD ${mdd.toFixed(1)}%`;
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

  return `<div class="bt-banner ${bannerCls}">
    <div class="bt-banner-header"><div class="bt-banner-title ${bannerCls}">종합행동지침 — <span style="color:${_bReliColor};font-weight:700">${_bReliLabel}</span></div>${helpBtn}</div>
    <div class="bt-action-line ${actionCls}">${actionText}</div>
    <div class="bt-banner-body">${detailText}</div>
    ${_histLine}
    ${btDateStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px;text-align:right">${btDateStr}</div>`:''}
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
    const svJudge = supervisorJudge(_svAnalScore, _svMom, _svRr);

    // 2) BT 상태 분류
    let _btStateKey = 'waiting';
    if (_btSt) {
      if (_btSt.state === 'holding' && _btSt._isBuySignal) _btStateKey = 'buy_signal';
      else if (_btSt.state === 'holding') _btStateKey = 'holding';
      else if (_btSt.state === 'sell_signal') _btStateKey = 'sell_signal';
      else _btStateKey = 'waiting';
    }

    // 3) 통합 판정
    _svVerdict = unifiedVerdict(_btStateKey, svJudge);
    stock._svVerdict = _svVerdict; // 차트 마커용 저장

    // 4) 분석엔진 TP/SL
    const _svTpsl = (typeof SXE !== 'undefined' && SXE.calcTpSlRr && indicators) ?
      SXE.calcTpSlRr(stock.price, indicators, qs, _analTF) : null;
    const _svTp = _svTpsl ? _svTpsl.tp : 0;
    const _svSl = _svTpsl ? _svTpsl.sl : 0;
    const _svTpPct = _svTp && stock.price ? ((_svTp - stock.price) / stock.price * 100).toFixed(1) : '0.0';
    const _svSlPct = _svSl && stock.price ? ((stock.price - _svSl) / stock.price * 100).toFixed(1) : '0.0';

    // 5) BT 성적 요약 1줄
    let _btSummary = '';
    const _btTrades4 = stock._btResult?.trades;
    if (_btTrades4 && _btTrades4.length) {
      const _cl4 = _btTrades4.filter(t => t.type !== 'OPEN');
      const _w4 = _cl4.filter(t => t.type === 'WIN').length;
      const _wr4 = _cl4.length > 0 ? Math.round(_w4 / _cl4.length * 100) : 0;
      const _pnl4 = stock._btResult.totalPnl || 0;
      _btSummary = `BT: ${_cl4.length}거래 승률${_wr4}% 수익${_pnl4 >= 0 ? '+' : ''}${_pnl4.toFixed(1)}%`;
    }

    // 6) 감독관 방향 텍스트
    const _dirText = _svMom ? (_svMom.direction === 'up' ? '상승 전이중' : _svMom.direction === 'down' ? '하락 전이중' : '횡보') : '';

    // 7) 손익비 경고
    const _rrWarn = _svRr < 1.0 ? `손익비 ${_svRr.toFixed(2)} · RR 불리 ⚠️` : `손익비 ${_svRr.toFixed(2)}`;

    // 8) 근거 상세 HTML
    const _detailId = '_svDetail_' + Math.random().toString(36).slice(2, 8);
    let _detailHTML = '';
    if (_btSummary) _detailHTML += `<div style="font-size:10px;color:var(--text2);line-height:1.5">${_btSummary}</div>`;
    if (_btSt && _btSt.state === 'holding' && !_btSt._isBuySignal && _btSt.tp && _btSt.sl) {
      _detailHTML += `<div style="font-size:10px;color:var(--text3);line-height:1.5">BT 기준: TP ${Math.round(_btSt.tp).toLocaleString()} / SL ${Math.round(_btSt.sl).toLocaleString()} (ATR)</div>`;
    }
    if (_svTpsl && _svTpsl.reasons && _svTpsl.reasons.length) {
      _detailHTML += `<div style="font-size:9px;color:var(--text3);margin-top:4px;line-height:1.5">${_svTpsl.reasons.slice(0, 3).join(' · ')}</div>`;
    }
    if (_svMom && _svMom.history && _svMom.history.length >= 2) {
      _detailHTML += `<div style="font-size:9px;color:var(--text3);margin-top:2px">전이: ${_svAnalScore - (_svMom.delta || 0)}→${_svAnalScore} ${_svMom.direction === 'up' ? '상승중' : _svMom.direction === 'down' ? '하락중' : '횡보'} (${_svMom.lookback || 5}봉)</div>`;
    }

    // 9) 통합 배너 렌더
    // S103-fix6c Phase2: 감독관 통합판정 기반 행동 배지 (_svVerdict.action 매핑)
    //   유력(실선): 차트마커와 동기화 — 매수 ▲ / 즉시청산·회피 ▼
    //   조짐(점선): 예고 단계 — 관심(반등조짐) / 청산준비·청산검토(하락조짐)
    //   보유유지·관망·대기: 배지 없음 (행동 유보 구간)
    let _verdictBadgeHTML = '';
    {
      const _vAct = _svVerdict.action;
      if(_vAct === '매수')
        _verdictBadgeHTML = '<span class="tx-badge up">반등유력</span>';
      else if(_vAct === '관심')
        _verdictBadgeHTML = '<span class="tx-badge up-soft">반등조짐</span>';
      else if(_vAct === '청산 준비' || _vAct === '청산 검토')
        _verdictBadgeHTML = '<span class="tx-badge down-soft">하락조짐</span>';
      else if(_vAct === '즉시 청산' || _vAct === '회피')
        _verdictBadgeHTML = '<span class="tx-badge down">하락유력</span>';
    }
    btStateBannerHTML = `<div style="padding:12px 14px;margin:0 0 8px;border-radius:12px;background:${_svVerdict.color}0D;border:1.5px solid ${_svVerdict.color}">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:16px">${_svVerdict.icon}</span>
        <span style="font-size:15px;font-weight:800;color:${_svVerdict.color}">${_svVerdict.action}</span>
        ${_verdictBadgeHTML}
        <span style="font-size:10px;color:var(--text3)">${_dirText ? '— ' + _dirText : ''}</span>
      </div>
      ${_svTp > 0 ? `<div style="display:flex;gap:16px;margin-top:8px;font-size:11px">
        <span style="color:var(--buy);font-weight:700">목표 ${_svTp.toLocaleString()} <span style="font-size:9px;font-weight:400">(+${_svTpPct}%)</span></span>
        <span style="color:var(--sell);font-weight:700">손절 ${_svSl.toLocaleString()} <span style="font-size:9px;font-weight:400">(-${_svSlPct}%)</span></span>
      </div>` : ''}
      <div style="font-size:10px;color:var(--text2);margin-top:4px">${_rrWarn}${_btSummary ? ' · ' + _btSummary : ''}</div>
      ${_detailHTML ? `<div style="margin-top:6px">
        <div onclick="_sxVib(8);var el=document.getElementById('${_detailId}');el.style.display=el.style.display==='none'?'block':'none';this.querySelector('span').textContent=el.style.display==='none'?'▶':'▼'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span>▶</span> 판정 근거</div>
        <div id="${_detailId}" style="display:none;margin-top:4px;padding:8px 10px;background:var(--surface2);border-radius:8px">${_detailHTML}</div>
      </div>` : ''}
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

  // S39: 종합평 (해석 엔진)
  let summaryHTML = '';
  if(typeof SXI!=='undefined' && qs && indicators){
    let summary = SXI.summary(qs.action, qs.score, qs.reasons, indicators);
    // S58: 공매도 잔고 → 종합평 보정 (동기 적용)
    if(summary && stock.shortBalanceRatio && SXI.advShortSelling && SXI.overrideSummaryWithShortSelling){
      const shortItp = SXI.advShortSelling(stock.shortBalanceRatio, {
        price: stock.price, changeRate: stock.changeRate,
        volume: stock.volume, foreignRatio: stock.foreignRatio, marketCap: stock.marketCap
      });
      if(shortItp) summary = SXI.overrideSummaryWithShortSelling(summary, shortItp, stock.shortBalanceRatio);
    }
    if(summary){
      summaryHTML = `<div class="itp-summary">
        <div class="itp-summary-title">종합평</div>
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
        let _momArrow = '';
        if(_mom && _mom.history.length >= 2){
          const sign = _mom.delta > 0 ? '+' : '';
          const color = _mom.direction==='up' ? 'var(--buy)' : _mom.direction==='down' ? 'var(--sell)' : 'var(--text3)';
          _momArrow = `<span style="font-size:9px;color:${color};font-weight:700;margin-left:2px">${sign}${_mom.delta}</span>`;
        }

        const _3stageId = 'stage3_' + Math.random().toString(36).slice(2,8);
        const _analCls = _analSc>=60?'buy':_analSc>=40?'hold':'sell';
        const _btCls = _btSc!=null?(_btSc>=60?'buy':_btSc>=40?'hold':'sell'):'text3';

        const _timingLabel = (_mom && _mom.delta != null && _mom.delta <= 0) ? '매도타이밍' : '진입타이밍';
        const _timingBtnClr = _timingLabel === '매도타이밍' ? '#e8365a' : '#22c55e';
        // S103-fix6c Phase1: 양방향 3단 구조 — 모멘텀 기반 매도 모드 감지
        const _isSellMode = (_mom && _mom.delta != null && _mom.delta <= 0);
        const _entryLabel = _isSellMode ? '약세' : '강세';
        // S103-fix6c Phase2: 전이 확률 라벨 양방향화만 유지 (배지는 통합배너로 이동)
        //   Layer 1(정적): 라벨 자체를 모드에 맞춰 "강세 전이" ↔ "약세 전이"로 치환
        //   Layer 2(배지): 감독관 통합판정 기반으로 통합배너 옆 표시 (_verdictBadge 헬퍼)
        const _r2eLabel = _isSellMode ? '약세 전이' : '강세 전이';
        const _e2tLabel = '추세 전이'; // 양방향 중립 유지
        const _stratBtnClr = '#ff9900';

        // S95: 소형 인라인 배지 — 근거용 (탭→전이상세) — S100: 교차 토글
        return `<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_timingBtnClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_3stageId}'),s=document.getElementById('${_stratDetailId}');if(s&&s.style.display!=='none'){s.style.display='none'}el.style.display=el.style.display==='none'?'block':'none'">
            <span style="font-size:9px;color:${_timingBtnClr}">${_timingLabel}</span>
            <span style="font-size:13px;font-weight:800;color:var(--${_analCls})">${_analSc}${_momArrow}</span>
            <span style="font-size:7px;color:${_timingBtnClr}">▶</span>
          </div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_stratBtnClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_stratDetailId}'),t=document.getElementById('${_3stageId}');if(t&&t.style.display!=='none'){t.style.display='none'}el.style.display=el.style.display==='none'?'block':'none'">
            <span style="font-size:9px;color:${_stratBtnClr}">매매전략</span>
            <span style="font-size:13px;font-weight:800;color:var(--${_btCls})">${_btSc!=null?_btSc:'—'}</span>
            ${_btReliLabel?`<span style="font-size:7px;color:${_btReliColor};font-weight:700">${_btReliLabel}</span>`:''}
            <span style="font-size:7px;color:${_stratBtnClr}">▶</span>
          </div>
        </div>

        <div id="${_3stageId}" style="display:none;margin-top:8px;padding:10px 12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
        ${(()=>{
          // S81→S82→S99-2: 3단 리포트 렌더링 (verdictAction 전달)
          if(typeof SXI==='undefined' || !SXI.threeStageReport) return '<div style="font-size:10px;color:var(--text3)">해석 엔진 미연결</div>';

          const _lastDate = (indicators && indicators._advanced && indicators._advanced.rows) ? indicators._advanced.rows[indicators._advanced.rows.length-1]?.date : null;
          const _verdictAction = _svVerdict ? _svVerdict.action : null;
          const _report = SXI.threeStageReport(qs, _mom, stock._btResult, _btSc, _lastDate, stock._btTransitionStats, _verdictAction);
          if(!_report) return '<div style="font-size:10px;color:var(--text3)">데이터 부족</div>';

          let html = '';
          // S86: 변화량 표시 헬퍼
          const _deltaTag = function(d){ if(d==null||isNaN(d)) return ''; var s=d>0?'+'+d:d===0?'0':''+d; var c=d>0?'var(--buy)':d<0?'var(--sell)':'var(--text3)'; return ' <span style="font-size:9px;color:'+c+';font-weight:700">'+s+'</span>'; };
          const _readyDelta = _mom ? _mom.delta : null;
          const _entryDelta = _mom ? _mom.entryDelta : null;
          const _trendDelta = _mom ? _mom.trendDelta : null;

          // 준비 섹션 — S82: 체크박스 시각화
          const rCls = _report.ready.score>=60?'buy':_report.ready.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">'+_timingLabel+'</span><span style="font-size:14px;font-weight:800;color:var(--'+rCls+')">'+_report.ready.score+_deltaTag(_readyDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.ready.level+' · '+_report.ready.progress+'</span></div>';
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
          // 전이 확률
          const r2e = _report.transition.readyToEntry;
          html += '<div style="margin-top:4px;padding:4px 8px;background:var(--surface);border-radius:6px;font-size:9px;line-height:1.5">';
          html += '<span style="font-weight:700;color:var(--accent)">'+_r2eLabel+' '+r2e.prob+'%</span> · '+r2e.days;
          if(r2e.source==='bt_history') html += ' <span style="font-size:7px;color:var(--buy)">[BT실적]</span>';
          if(r2e.basis.length) html += '<br><span style="color:var(--text3)">'+r2e.basis.join(' / ')+'</span>';
          html += '</div>';
          html += '</div>';

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
          // 전이 확률
          const e2t = _report.transition.entryToTrend;
          html += '<div style="margin-top:4px;padding:4px 8px;background:var(--surface);border-radius:6px;font-size:9px;line-height:1.5">';
          html += '<span style="font-weight:700;color:var(--accent)">'+_e2tLabel+' '+e2t.prob+'%</span> · '+e2t.days;
          if(e2t.source==='bt_history') html += ' <span style="font-size:7px;color:var(--buy)">[BT실적]</span>';
          if(e2t.basis.length) html += '<br><span style="color:var(--text3)">'+e2t.basis.join(' / ')+'</span>';
          html += '</div>';
          html += '</div>';

          // S88: 강세 추이 → SXChart.drawDeltaBar 캔버스
          if(_mom && _mom.history.length >= 3){
            const _ebCanvasId = _3stageId + '_ebc';
            const _eRev = _mom.history.slice().reverse().map(function(h){ return {score: h.entryScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">'+_entryLabel+' 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_ebCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            setTimeout(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_ebCanvasId, _eRev, _mom.lookback); }, 70);
          }

          // 추세 섹션
          const tCls = _report.trend.score>=60?'buy':_report.trend.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">추세</span><span style="font-size:14px;font-weight:800;color:var(--'+tCls+')">'+_report.trend.score+_deltaTag(_trendDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.trend.level+'</span></div>';
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

          // S88: 추세 추이 → SXChart.drawDeltaBar 캔버스
          if(_mom && _mom.history.length >= 3){
            const _tbCanvasId = _3stageId + '_tbc';
            const _tRev = _mom.history.slice().reverse().map(function(h){ return {score: h.trendScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">추세 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_tbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            setTimeout(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_tbCanvasId, _tRev, _mom.lookback); }, 80);
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
            setTimeout(function(){ if(typeof SXChart!=='undefined' && SXChart.drawScoreSpark) SXChart.drawScoreSpark(_tlCanvasId, tl, _tlDetailId); }, 50);
          }

          // S87: 진입타이밍 추이 → SXChart.drawDeltaBar 캔버스
          if(_mom && _mom.history.length >= 3){
            const _dbCanvasId = _3stageId + '_dbc';
            const rev = _mom.history.slice().reverse();
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">'+_timingLabel+' 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_dbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            setTimeout(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_dbCanvasId, rev, _mom.lookback); }, 60);
          }

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
      <div id="${_stratDetailId}" style="display:none;margin-top:8px">
      ${(()=>{
        if(!indicators || !indicators.atr || !stock.price) return `
      <div class="tp-sl-row" style="margin-top:10px">
        <div class="tp-sl-item" style="background:rgba(255,200,64,.12)">
          <div class="tp-sl-label">현재가</div>
          <div class="tp-sl-price" style="color:#e6a700">${(stock.price||0).toLocaleString()}</div>
          <div class="tp-sl-pct">${stock.changeRate>0?'+':''}${(stock.changeRate||0).toFixed(2)}%</div>
        </div>
      </div>`;
        const price = stock.price;

        // S54: 엔진 기반 진입가 계산 — S55: 재무+매크로 보정 추가
        const _fin = stock._financial || null;
        const _mac = _macroCtx || null;
        const entry = (typeof SXE!=='undefined' && SXE.calcEntryPrice) ? SXE.calcEntryPrice(price, indicators, qs, _analTF, _fin, _mac) : null;
        const entryPrice = entry ? entry.entryPrice : price;
        const entryPct = entry ? entry.pctFromPrice : 0;
        const entryTime = entry ? entry.timeStr : '즉시';
        const entryReasons = entry ? entry.reasons : [];

        // S54: 엔진 기반 목표가/손절가/손익비 계산
        const tpsl = (typeof SXE!=='undefined' && SXE.calcTpSlRr) ? SXE.calcTpSlRr(price, indicators, qs, _analTF, _fin, _mac) : null;

        // SXI 해석 텍스트 (fallback)
        const atrPct = indicators.atr.ratio / 100;
        const tpMult = 2.5, slMult = 1.5;
        const trendPct = indicators._advanced?.trend?.pct ?? 0;
        const rsiV = indicators.rsi ?? 50;
        const adxV = indicators.adx?.adx ?? 0;
        const tpslItp = (typeof SXI!=='undefined') ? SXI.advTpSl(price, atrPct, tpsl ? (tpsl.tp-price)/price/atrPct : tpMult, tpsl ? (price-tpsl.sl)/price/atrPct : slMult, _analTF, qs?.regime, trendPct, rsiV, adxV) : null;

        const tp = tpsl ? tpsl.tp : (tpslItp ? tpslItp.tp : Math.round(price*1.05));
        const sl = tpsl ? tpsl.sl : (tpslItp ? tpslItp.sl : Math.round(price*0.97));
        const rr = tpsl ? tpsl.rr : (tpslItp ? tpslItp.rr : 1.67);
        const tpPct = tpsl ? tpsl.tpPct : (atrPct*tpMult*100);
        const slPct = tpsl ? Math.abs(tpsl.slPct) : (atrPct*slMult*100);
        const tpTime = tpsl ? tpsl.tpTime : (tpslItp ? tpslItp.tpTime : '');
        const slTime = tpsl ? tpsl.slTime : (tpslItp ? tpslItp.slTime : '');
        const tone = tpsl ? tpsl.tone : (tpslItp ? tpslItp.tone : 'neutral');

        const tpslId = 'tpsl_' + Math.random().toString(36).slice(2,8);

        // 매매 근거 상세 텍스트 조합
        const itpText = tpslItp ? tpslItp.text : '';
        const tpslReasons = tpsl && tpsl.reasons.length ? '\n\n【목표가/손절가 산출 근거】\n' + tpsl.reasons.map(r=>'• '+r).join('\n') : '';
        const entryBasis = entryReasons.length ? '\n\n【진입가 산출 근거】\n' + entryReasons.map(r=>'• '+r).join('\n') : '';
        const detailText = itpText + tpslReasons + entryBasis;

        const label = rr >= 2.0 ? '유리한 손익비' : rr >= 1.5 ? '양호한 손익비' : '보수적 접근 필요';

        return `
      <div class="tp-sl-row" style="margin-top:10px">
        <div class="tp-sl-item" style="background:rgba(255,200,64,.12)">
          <div class="tp-sl-label">현재가</div>
          <div class="tp-sl-price" style="color:#e6a700">${price.toLocaleString()}</div>
          <div class="tp-sl-pct">${stock.changeRate>0?'+':''}${(stock.changeRate||0).toFixed(2)}%</div>
        </div>
        <div class="tp-sl-item entry">
          <div class="tp-sl-label">진입가</div>
          <div class="tp-sl-price">${entryPrice.toLocaleString()}</div>
          <div class="tp-sl-pct">${entryPct>=0?'+':''}${entryPct.toFixed(1)}%${entryTime?' · <span class="tp-sl-time-inline">'+entryTime+'</span>':''}</div>
        </div>
      </div>
      <div class="tp-sl-card">
          <div class="tp-sl-row">
            <div class="tp-sl-item tp">
              <div class="tp-sl-label">목표가</div>
              <div class="tp-sl-price">${tp.toLocaleString()}</div>
              <div class="tp-sl-pct">+${tpPct.toFixed(1)}%${tpTime?' · <span class="tp-sl-time-inline">'+tpTime+'</span>':''}</div>
            </div>
            <div class="tp-sl-item sl">
              <div class="tp-sl-label">손절가</div>
              <div class="tp-sl-price">${sl.toLocaleString()}</div>
              <div class="tp-sl-pct">-${slPct.toFixed(1)}%${slTime?' · <span class="tp-sl-time-inline">'+slTime+'</span>':''}</div>
            </div>
            <div class="tp-sl-item rr">
              <div class="tp-sl-label">손익비</div>
              <div class="tp-sl-price">${rr}</div>
              <div class="tp-sl-pct">TP/SL</div>
            </div>
          </div>
          <div style="margin-top:6px">
            <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${tpslId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 매매 근거 상세</div>
            <div class="itp-card" id="${tpslId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${tone}">${label}</span><div>${detailText}</div></div>
          </div>
        </div>`;
      })()}
      ${_buildBtBanner(stock, qs)}
      </div>
      ${(()=>{
        // S69: 초보자 실전 가이드
        if(typeof SXI==='undefined' || !SXI.practicalGuide) return '';
        const _pgMkt = stock._mkt || stock.market || currentMarket;
        const _pgTfOk = _isBtSupportedTF(_pgMkt, _analTF);
        const _pgTrades = _getBtTotalTrades(stock);
        const _pgInsuf = !_pgTfOk || _pgTrades < BT_MIN_TRADES;
        const _btAct = _pgInsuf ? '' : (stock._btAction || '');
        const _as = qs?.score ?? scores?.total ?? 0;
        const _bs = _pgInsuf ? 0 : (stock._btScore ?? 0);
        const _sum = (typeof SXI!=='undefined' && SXI.summary) ? SXI.summary(qs?.action, _as, stock._safetyReasons, indicators) : null;
        const pg = SXI.practicalGuide(_btAct, _as, _bs, _sum, indicators);
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
      <div class="anal-fold">
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
      if(!qs) return '';
      const regime = qs.regime;
      const tags = stock._smartTags || scrSmartFilterCheck(qs);
      const regimeItp = (typeof SXI!=='undefined' && regime) ? SXI.advRegime(regime) : null;
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
        const _raColor = _ra.label==='공격'||_ra.label==='공격+경계'?'var(--buy)':_ra.label==='보수'||_ra.label==='방어'||_ra.label==='방어+경계'?'var(--sell)':'var(--accent)';
        _raHTML = `<div style="margin-top:6px;padding:6px 8px;background:rgba(${_raColor==='var(--buy)'?'0,200,150':_raColor==='var(--sell)'?'255,59,48':'100,140,255'},.08);border-radius:6px;border-left:3px solid ${_raColor}">
          <div style="font-size:10px;font-weight:700;color:${_raColor};margin-bottom:2px">적응형: ${_ra.label} 모드</div>
          <div style="font-size:9px;color:var(--text2);line-height:1.5">BUY ${_baseTh?_baseTh.buyTh:'?'}→${_aTh?_aTh.buyTh:'?'} · TP x${_ra.tpMultFactor.toFixed(2)} · SL x${_ra.slMultFactor.toFixed(2)}</div>
        </div>`;
        if(_raGuide){
          _raHTML += `<div style="margin-top:4px">
            <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${_raGuideId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 적응형 파라미터 상세</div>
            <div class="itp-card" id="${_raGuideId}" style="white-space:normal;margin-top:4px">
              <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:6px">${_raGuide.title}</div>
              ${_raGuide.items.map(it=>`<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px;padding-left:8px;border-left:2px solid var(--accent)">· ${it}</div>`).join('')}
              ${_raGuide.note?`<div style="font-size:10px;color:var(--text3);margin-top:6px;font-style:italic">${_raGuide.note}</div>`:''}
            </div>
          </div>`;
        }
      } else if(!_raEnabled){
        _raHTML = `<div style="margin-top:4px;font-size:9px;color:var(--text3)">적응형 파라미터: OFF</div>`;
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
          ${kws.map(k=>`<span class="kw-chip" onclick="_sxVib(8);navigator.clipboard.writeText('${k.replace(/'/g,"\\'")}');this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),800)">${k}</span>`).join('')}
        </div>
        <div style="font-size:8px;color:var(--text3);margin-top:4px">키워드를 탭하면 클립보드에 복사됩니다</div>
      </div>`;
    })()}
  `;
  // S31: 미니 캔들차트 그리기
  if(indicators?._advanced?.rows){
    setTimeout(()=>_drawMiniCandleChart(indicators._advanced.rows, stock._btResult?.trades, stock._svVerdict), 50);
  }
  // S57: 재무 바차트 그리기
  if(stock._financial && stock._financial._source === 'dart' && typeof SXChart !== 'undefined' && SXChart.drawFinBar){
    setTimeout(() => SXChart.drawFinBar('finBarChart', stock._financial), 80);
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
      setTimeout(() => SXChart.drawFinTrend('finTrendChart', periods), 100);
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
  // 3) 종합평 오버라이드
  if(di && di.tone !== 'neutral' && typeof SXI!=='undefined' && SXI.overrideSummaryWithDisclosure){
    const summaryEl = document.querySelector('.itp-summary');
    if(summaryEl && qs && indicators){
      const baseSummary = SXI.summary(qs.action, qs.score, qs.reasons, indicators);
      if(baseSummary){
        const overridden = SXI.overrideSummaryWithDisclosure(baseSummary, di);
        // 종합평 HTML 재렌더
        summaryEl.innerHTML = `
          <div class="itp-summary-title">종합평</div>
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
  localStorage.setItem('SX_ANAL_TF', tf);
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
      if(typeof supervisorJudge === 'function'){
        svJudge = supervisorJudge(analScore, momentum, rr);
      }
      const _btStateKey = btState ? btState.state : 'WAIT';
      if(typeof unifiedVerdict === 'function'){
        svVerdict = unifiedVerdict(_btStateKey, svJudge);
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
  const es = cached.qs ? cached.qs.score : 0;
  const bs = cached.btScore;
  if(es != null && bs != null){
    if(es>=60 && bs>=60) stock._btAction = '진입 적기';
    else if(es>=60 && bs<60) stock._btAction = '단기급등 주의';
    else if(es<60 && bs>=60) stock._btAction = '관심 등록';
    else stock._btAction = '회피';
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
  localStorage.setItem('SX_PRESET_MODE', mode);
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

    // 행동지침
    const es = qs ? qs.score : 0;
    if(es != null && btScore != null){
      if(es>=60 && btScore>=60) stock._btAction = '진입 적기';
      else if(es>=60 && btScore<60) stock._btAction = '단기급등 주의';
      else if(es<60 && btScore>=60) stock._btAction = '관심 등록';
      else stock._btAction = '회피';
    }

    // 캐시 갱신
    const analScore = qs ? (qs.readyScore ?? qs.score ?? 0) : 0;
    const momentum = scoreMom || {};
    const rr = (typeof SXE !== 'undefined' && SXE.calcTpSlRr) ?
      (SXE.calcTpSlRr(stock.price, indicators, qs, _analTF)?.rr ?? 0) : 0;
    let svJudge = null, svVerdict = null;
    if(typeof supervisorJudge === 'function'){
      svJudge = supervisorJudge(analScore, momentum, rr);
    }
    const _btStateKey = btState ? (btState.state==='holding' && btState._isBuySignal ? 'buy_signal' : btState.state==='holding' ? 'holding' : btState.state==='sell_signal' ? 'sell_signal' : 'waiting') : 'waiting';
    if(typeof unifiedVerdict === 'function'){
      svVerdict = unifiedVerdict(_btStateKey, svJudge);
    }
    stock._svVerdict = svVerdict;

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
