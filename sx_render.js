// ════════════════════════════════════════════════════════════
//  SIGNAL X — Render Engine v1.0 <!-- S68 -->
//  S68: sx_screener.html에서 분리 — 결과 렌더링 + 분석 오버레이
//  renderResults, openAnalysis, closeAnalysis, runAnalysis,
//  calcBtScore, renderAnalysisResult, _renderDisclosureUI,
//  formatMCap, formatTradeAmt, formatKRW, saveAnalResult
//  의존: searchResults, currentMarket, currentTF, currentAnalStock,
//        KEYS, WORKER_BASE, SXE, SXI, SXChart (글로벌)
// ════════════════════════════════════════════════════════════

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

  area.innerHTML = `
    <div class="result-summary">
      검색 결과 <span class="cnt">${filtered.length}</span>종목${scanTimeStr?`<span style="font-size:8px;color:var(--text3);margin-left:4px">${scanTimeStr}</span>`:''}
      ${_scanLoadingActive?'<span class="scan-loading-text">검색중<span class="dots"></span></span>':''}
      <button class="btn-watchlist" onclick="toggleWatchlistView()">관심목록</button>
      <button class="btn-reset" onclick="clearSearchResults()">초기화</button>
    </div>
    <div class="result-header">
      <span class="rh-name">종목명</span>
      <span class="rh-col${sorted('price')}" onclick="toggleSort('price')">현재가<span class="rh-arrow">${arrow('price')}</span></span>
      <span class="rh-col${sorted('changeRate')}" onclick="toggleSort('changeRate')">전일대비<span class="rh-arrow">${arrow('changeRate')}</span></span>
      <span class="rh-col${sorted('tradeAmount')}" onclick="toggleSort('tradeAmount')">거래대금<span class="rh-arrow">${arrow('tradeAmount')}</span></span>
    </div>
    ${filtered.map((s,i)=>{
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
              ${s._score!=null?`<span class="sr-score-chip" style="color:${s._score>=60?'var(--buy)':'var(--text3)'}">⏱${s._score}</span>`:''}
              ${s._btScore!=null?`<span class="sr-score-chip" style="color:${s._btScore>=60?'var(--buy)':'var(--text3)'}">📊${s._btScore}</span>`:''}
              ${(()=>{ const _m=s._mkt||currentMarket; const _h=_btHistLoad(_m); const _a=_h[s.code]||[]; if(!_a.length)return ''; const _r=_btHistReliabilityLabel(_a.length); const _c=_r.cls==='full'?'var(--buy)':_r.cls==='mid'?'var(--accent)':_r.cls==='low'?'var(--sell)':'var(--text3)'; return `<span class="sr-rel-chip" style="color:${_c};font-size:8px">${_r.text}</span>`; })()}
              ${s._btAction?`<span class="sr-action-chip ${s._btAction==='진입 적기'?'good':s._btAction==='회피'?'bad':'mid'}">${s._btAction}</span>`:''}
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
    const slim = searchResults.map(s=>({code:s.code,name:s.name,market:s.market,price:s.price,changeRate:s.changeRate,volume:s.volume,tradeAmount:s.tradeAmount,marketCap:s.marketCap,foreignRatio:s.foreignRatio,volumeRatio:s.volumeRatio,_score:s._score,_action:s._action,_reasons:s._reasons,_smartTags:s._smartTags,_filterScore:s._filterScore,_mkt:s._mkt||'kr',_regime:s._regime?{label:s._regime.label,icon:s._regime.icon}:null}));
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
  document.getElementById('analBody').innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>${stock.name} 분석 중...</div>`;
  document.getElementById('analOverlay').classList.add('show');

  setTimeout(()=>runAnalysis(stock), 500);
}

function closeAnalysis(){
  document.getElementById('analOverlay').classList.remove('show');
  currentAnalStock = null;
}

async function runAnalysis(stock){
 try{ // S63: 전체 try-catch — 에러 시 무한로딩 방지
  const _analCount = (currentMarket==='kr' && window._kisEnabled) ? 500 : 200; // S67: KIS 500봉
  let indicators = stock._indicators || null;
  let _analCandles = null; // S67: BT 연동용 캔들 보존
  if(!indicators){
    try{
      const candles = await fetchCandles(stock.code, _analCount);
      _analCandles = candles;
      if(candles && candles.length >= 20){
        indicators = calcIndicators(candles, currentTF);
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
    qs = scrQuickScore(indicators._advanced.rows, currentTF);
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
  try{
    const btCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || null;
    if(btCandles && btCandles.length >= 60 && typeof SXE!=='undefined' && SXE.runBtEngine){
      const rawRows = btCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
      const btR = SXE.runBtEngine(rawRows, currentTF, {});
      if(btR && !btR.error){
        _analBtResult = btR;
        _analBtScore = calcBtScore(btR);
        stock._btResult = btR;
        stock._btScore = _analBtScore;
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

  const analTime = new Date();
  renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp);
 }catch(e){ // S63: 분석 실패 시 에러 표시
  console.error('[runAnalysis] err', e);
  const body = document.getElementById('analBody');
  if(body) body.innerHTML = `<div class="result-empty" style="padding:40px 16px;text-align:center"><div style="font-size:24px;opacity:.3;margin-bottom:8px">⚠</div><div style="font-size:13px;color:var(--text2)">분석 중 오류가 발생했습니다</div><div style="font-size:10px;color:var(--text3);margin-top:6px">${e.message||e}</div><div style="font-size:8px;color:var(--text3);margin-top:6px;text-align:left;max-height:120px;overflow:auto;word-break:break-all;padding:6px;background:var(--surface2);border-radius:4px">${(e.stack||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div><button onclick="if(currentAnalStock)runAnalysis(currentAnalStock)" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;cursor:pointer">다시 시도</button></div>`;
 }
}

// S31: 미니 캔들차트 그리기
// S34: 미니 캔들차트 → SXChart 모듈로 위임
function _drawMiniCandleChart(rows){
  if(typeof SXChart!=='undefined') SXChart.drawMini('miniCandleChart', rows);
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
    <div class="bt-banner-header"><div class="bt-banner-title ${bannerCls}">종합행동지침</div>${helpBtn}</div>
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
  const body = document.getElementById('analBody');
  const gradeColor = {A:'grade-A',B:'grade-B',C:'grade-C',D:'grade-D',F:'grade-F'};
  const analTimeStr = analTime ? fmtTime(analTime) : '';
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // quickScore 종합 판정 — S48: qsHTML 제거, body.innerHTML에서 직접 렌더링
  // (레짐카드를 종목명카드 아래로 이동)

  // S31: 미니 캔들차트
  let chartHTML = '';
  if(indicators?._advanced?.rows){
    chartHTML = `<div class="mini-chart-wrap" onclick="if(typeof SXChart!=='undefined'&&_currentAnalRows)SXChart.openFull(_currentAnalRows,_currentAnalName)" style="cursor:pointer"><div class="mini-chart-title">최근 ${Math.min(indicators._advanced.rows.length, 60)}봉 <span style="font-size:8px;color:var(--accent);font-weight:400">(탭하면 상세)</span></div><canvas id="miniCandleChart" width="400" height="160"></canvas></div>`;
  }

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
        row += `<span class="itp-toggle" id="${id}t" onclick="toggleItp('${id}')">▶</span>`;
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
    const _krNoKis = currentMarket==='kr' && !window._kisEnabled && /^\d+m$/.test(currentTF)===false;
    const _kisOffBadge = '<span class="kis-off-badge">비활성</span>';
    const itpRow = (label, val, valCls, itpData, kisOff) => {
      const id = 'itp_' + Math.random().toString(36).slice(2,8);
      const dimCls = kisOff ? ' kis-dimmed' : '';
      let row = `<div class="anal-row itp-row${dimCls}"><span class="al">${label}${kisOff?_kisOffBadge:''}</span><span class="ar ${valCls||''}">${val}</span>`;
      if(itpData){
        row += `<span class="itp-toggle" id="${id}t" onclick="toggleItp('${id}')">▶</span>`;
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

  body.innerHTML = `
    ${chartHTML}

    <div class="anal-header-card">
      <div class="anal-stock-code">${stock.code} · ${stock.market||''}</div>
      <div class="anal-stock-name">${stock.name}</div>
      <div id="discBadgeArea" style="margin-top:4px;min-height:0"></div>
      ${scanTimeStr||analTimeStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px">${scanTimeStr?'검색 '+scanTimeStr:''}${scanTimeStr&&analTimeStr?' · ':''}${analTimeStr?'분석 '+analTimeStr:''}</div>`:''}
      ${(()=>{
        const _analSc = qs?qs.score:scores.total;
        const _btData = _getBtData(stock);
        const _btSc = calcBtScore(_btData);
        const _analCls = _analSc>=60?'buy':_analSc>=40?'hold':'sell';
        const _btCls = _btSc!=null ? (_btSc>=60?'buy':_btSc>=40?'hold':'sell') : 'neutral';
        return `<div class="anal-score-wrap">
          <div class="anal-score-box">
            <div class="score-num" style="color:var(--${_analCls})">${_analSc}</div>
            <div class="score-label">진입타이밍</div>
          </div>
          <div style="display:flex;align-items:center;font-size:16px;color:var(--text3);font-weight:300">×</div>
          <div class="anal-score-box">
            <div class="score-num" style="color:var(--${_btCls})">${_btSc!=null?_btSc:'—'}</div>
            <div class="score-label">매매전략</div>
          </div>
        </div>`;
      })()}
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
        const entry = (typeof SXE!=='undefined' && SXE.calcEntryPrice) ? SXE.calcEntryPrice(price, indicators, qs, currentTF, _fin, _mac) : null;
        const entryPrice = entry ? entry.entryPrice : price;
        const entryPct = entry ? entry.pctFromPrice : 0;
        const entryTime = entry ? entry.timeStr : '즉시';
        const entryReasons = entry ? entry.reasons : [];

        // S54: 엔진 기반 목표가/손절가/손익비 계산
        const tpsl = (typeof SXE!=='undefined' && SXE.calcTpSlRr) ? SXE.calcTpSlRr(price, indicators, qs, currentTF, _fin, _mac) : null;

        // SXI 해석 텍스트 (fallback)
        const atrPct = indicators.atr.ratio / 100;
        const tpMult = 2.5, slMult = 1.5;
        const trendPct = indicators._advanced?.trend?.pct ?? 0;
        const rsiV = indicators.rsi ?? 50;
        const adxV = indicators.adx?.adx ?? 0;
        const tpslItp = (typeof SXI!=='undefined') ? SXI.advTpSl(price, atrPct, tpsl ? (tpsl.tp-price)/price/atrPct : tpMult, tpsl ? (price-tpsl.sl)/price/atrPct : slMult, currentTF, qs?.regime, trendPct, rsiV, adxV) : null;

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
          <div class="tp-sl-pct">${entryPct>=0?'+':''}${entryPct.toFixed(1)}%</div>
          <div class="tp-sl-time">${entryTime}</div>
        </div>
      </div>
      <div class="tp-sl-card">
          <div class="tp-sl-row">
            <div class="tp-sl-item tp">
              <div class="tp-sl-label">목표가</div>
              <div class="tp-sl-price">${tp.toLocaleString()}</div>
              <div class="tp-sl-pct">+${tpPct.toFixed(1)}%</div>
              <div class="tp-sl-time">${tpTime}</div>
            </div>
            <div class="tp-sl-item sl">
              <div class="tp-sl-label">손절가</div>
              <div class="tp-sl-price">${sl.toLocaleString()}</div>
              <div class="tp-sl-pct">-${slPct.toFixed(1)}%</div>
              <div class="tp-sl-time">${slTime}</div>
            </div>
            <div class="tp-sl-item rr">
              <div class="tp-sl-label">손익비</div>
              <div class="tp-sl-price">${rr}</div>
              <div class="tp-sl-pct">TP/SL</div>
            </div>
          </div>
          <div style="margin-top:6px">
            <div class="itp-toggle-inline" onclick="const c=document.getElementById('${tpslId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 매매 근거 상세</div>
            <div class="itp-card" id="${tpslId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${tone}">${label}</span><div>${detailText}</div></div>
          </div>
        </div>`;
      })()}
      ${_buildBtBanner(stock, qs)}
    </div>

    ${(()=>{
      if(!qs) return '';
      const regime = qs.regime;
      const tags = stock._smartTags || scrSmartFilterCheck(qs);
      const regimeItp = (typeof SXI!=='undefined' && regime) ? SXI.advRegime(regime) : null;
      const regimeItpId = 'regime_' + Math.random().toString(36).slice(2,8);
      return `<div class="anal-section" style="background:var(--surface2)">
        <div class="anal-section-title" style="margin-bottom:6px">시장 레짐</div>
        ${regime?`<div style="font-size:10px;color:var(--text2);margin-bottom:4px">${regime.icon} ${regime.label} · 추세강도 ${(regime.adx||0).toFixed(0)} · 변동폭 ${(regime.bbWidth||0).toFixed(1)}%</div>`:''}
        ${qs.reasons&&qs.reasons.length?`<div style="font-size:10px;color:var(--hold);margin-bottom:4px">${qs.reasons.join(' ')}</div>`:''}
        ${tags.length?`<div class="sf-tags" style="margin-top:4px">${tags.map(t=>`<span class="sf-tag ${t.dir>0?'pos':t.dir<0?'neg':'neutral'}">${t.label}</span>`).join('')}</div>`:''}
        ${regimeItp?`<div style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="const c=document.getElementById('${regimeItpId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 레짐 상세 해석</div>
          <div class="itp-card" id="${regimeItpId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${regimeItp.tone}">${regimeItp.label}</span><div>${regimeItp.text}</div></div>
        </div>`:''}
      </div>`;
    })()}

    ${summaryHTML}

    <div class="anal-section">
      <div class="anal-section-title">부문별 점수</div>
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

    ${advHTML}

    ${techHTML}

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
        <div class="itp-toggle" onclick="const el=document.getElementById('${fiId}');el.classList.toggle('show')">▶ ${fi.label}</div>
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
        <div class="anal-section-title">🌐 매크로 환경</div>
        ${mac.dxy?`<div class="anal-row"><span class="al">달러인덱스</span><span class="ar ${mac.dxy.trend==='down'?'bullish':mac.dxy.trend==='up'?'bearish':'neutral'}">${fmt(mac.dxy.price,2)} (${mac.dxy.change5d>0?'+':''}${fmt(mac.dxy.change5d)}%)</span></div>`:''}
        ${mac.tnx?`<div class="anal-row"><span class="al">미국10년금리</span><span class="ar ${mac.tnx.trend==='down'?'bullish':mac.tnx.trend==='up'?'bearish':'neutral'}">${fmt(mac.tnx.price,2)}%</span></div>`:''}
        ${mac.usdkrw?`<div class="anal-row"><span class="al">달러/원 환율</span><span class="ar ${mac.usdkrw.trend==='down'?'bullish':mac.usdkrw.trend==='up'?'bearish':'neutral'}">${fmt(mac.usdkrw.price,0)}원</span></div>`:''}
        ${mac.vix?`<div class="anal-row"><span class="al">VIX</span><span class="ar ${mac.vix.price>=25?'bearish':mac.vix.price<=15?'bullish':'neutral'}">${fmt(mac.vix.price,1)}</span></div>`:''}
        ${mac.gold?`<div class="anal-row"><span class="al">금(XAU)</span><span class="ar ${mac.gold.trend==='up'?'neutral':mac.gold.trend==='down'?'bullish':'neutral'}">$${fmt(mac.gold.price,1)}</span></div>`:''}
        <div class="itp-toggle-inline" onclick="const el=document.getElementById('${miId}');el.classList.toggle('show');this.querySelector('.sb-arrow').textContent=el.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600;margin-top:6px"><span class="sb-arrow">▶</span> ${mi.label} (점수: ${mi.score})</div>
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
        return `<div class="itp-toggle" onclick="const el=document.getElementById('${ciId}');el.classList.toggle('show')">▶ ${ci.label}</div>
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
        return `<div class="itp-toggle" onclick="const el=document.getElementById('${siId}');el.classList.toggle('show')">▶ ${si.label}</div>
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

    ${(()=>{
      if(typeof SXI==='undefined' || !SXI.relatedKeywords) return '';
      const kws = SXI.relatedKeywords(stock, indicators, qs);
      if(!kws || !kws.length) return '';
      return `<div class="anal-section">
        <div class="anal-section-title">연관 키워드</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;padding:4px 0">
          ${kws.map(k=>`<span class="kw-chip" onclick="navigator.clipboard.writeText('${k.replace(/'/g,"\\'")}');this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),800)">${k}</span>`).join('')}
        </div>
        <div style="font-size:8px;color:var(--text3);margin-top:4px">키워드를 탭하면 클립보드에 복사됩니다</div>
      </div>`;
    })()}
  `;
  // S31: 미니 캔들차트 그리기
  if(indicators?._advanced?.rows){
    setTimeout(()=>_drawMiniCandleChart(indicators._advanced.rows), 50);
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
              itpArea.innerHTML = `<div class="itp-toggle" onclick="const el=document.getElementById('${smId}');el.classList.toggle('show')">▶ ${smi.label}</div>
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
    let html = '';
    for(const [cat, badges] of Object.entries(grouped)){
      html += `<div style="margin-bottom:3px"><span style="font-size:8px;color:var(--text3);font-weight:600">${cat}</span> `;
      html += badges.map(b => `<span class="disc-badge ${b.cls}" title="${b.date||''}" ${b.url?`data-dart-url="${b.url}"`:''}>${b.text}</span>`).join('');
      html += `</div>`;
    }
    html += di.badges.some(b=>b.url) ? `<div style="font-size:7px;color:var(--text3);margin-top:2px">탭하여 DART 원문 확인 →</div>` : '';
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
        <div class="itp-toggle-inline" onclick="const c=document.getElementById('${itpId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 공시 상세 해석</div>
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

async function saveAnalResult(){
  if(!currentAnalStock) return;
  let indicators = currentAnalStock._indicators || null;
  if(!indicators){
    try{
      const candles = await fetchCandles(currentAnalStock.code, (currentMarket==='kr' && window._kisEnabled) ? 500 : 200);
      if(candles && candles.length>=20) indicators = calcIndicators(candles, currentTF);
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
