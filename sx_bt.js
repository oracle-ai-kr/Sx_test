// ════════════════════════════════════════════════════════════
//  SIGNAL X — BT Module v1.7 <!-- S103-fix5 -->
//  S103-fix5: btClearPaper wrapper+core 분리 (매매시뮬 전체삭제 진동 체감 개선, setTimeout 30)
//  S99-5: btHistAccumulate 일봉 고정 누적 (다른 TF에서도 일봉 BT 결과 사용)
//  S99-4: btGetParams _analTF+_analMode 연동, _btTF() 헬퍼, 전체 currentTF→_btTF()
//  S99: btGetCurrentState _isBuySignal 자동설정 + isHolding 판별 보강
//  S97: holding에 entryIdx/totalBars 추가 (매수신호 현재봉 판별)
//  S93: KIS연동+캐시공유하이브리드+누적버그FIX+btGetParams정합
//  S68: sx_screener.html에서 분리 — 스크리너 내장 백테스트
//  BT 누적저장(btHist*), BT fetch(Yahoo/Upbit), BT 실행(basic/cross/wf/dashboard),
//  페이퍼트레이딩, Bridge 연동(_btSaveBtResult/_btSaveBtCross)
//  의존: currentMarket, currentTF, _analTF, _analMode, currentAnalStock, WORKER_BASE,
//        _btCurrentStock, _isInWatchlist, searchResults (글로벌)
// ════════════════════════════════════════════════════════════

// S99-4: BT 실행 시 분석탭 TF 우선 사용
function _btTF(){ return (typeof _analTF !== 'undefined' && _analTF) ? _analTF : currentTF; }

// ============================================================
//  BT 유틸
// ============================================================
const BT_PROXY = WORKER_BASE;
const SX_BT_RESULT_KEY = 'SX_BT_RESULT';
const SX_BT_CROSS_KEY = 'SX_BT_CROSS';
const SX_PAPER_KEY = 'SX_PAPER_TRADES';

// S67: BT 누적 저장 키 (시장별 3개)
const SX_BT_HIST_KEYS = { kr:'SX_BT_HISTORY_kr', us:'SX_BT_HISTORY_us', coin:'SX_BT_HISTORY_coin' };
const BT_HIST_MAX = 30; // 종목당 최대 건수

// S67: BT 누적 저장 — 로드/저장
function _btHistLoad(market){
  try{ return JSON.parse(localStorage.getItem(SX_BT_HIST_KEYS[market]||SX_BT_HIST_KEYS.kr)||'{}'); }catch(e){ return {}; }
}
function _btHistSave(market, data){
  localStorage.setItem(SX_BT_HIST_KEYS[market]||SX_BT_HIST_KEYS.kr, JSON.stringify(data));
}

// S67: 누적 저장 실행 (현재 BT trades → entryDate 기준 중복제거 → 30건 상한)
function btHistAccumulate(){
  const stock = _btCurrentStock();
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }
  if(!_isInWatchlist(stock.code)){ toast('관심종목 등록 시 활성화됩니다'); return; }
  // S99-5: 항상 일봉 기준 누적 — 다른 TF에서 눌러도 일봉 BT 결과 사용
  let btR = null;
  // 1. _analTFCache에서 일봉 BT 결과 우선 조회
  if(typeof _analTFCache !== 'undefined' && _analTFCache && _analTFCache['day'] && _analTFCache['day'].btResult){
    btR = _analTFCache['day'].btResult;
  }
  // 2. 현재 TF가 일봉이면 stock._btResult 사용
  if(!btR && _btTF() === 'day'){
    btR = stock._btResult || null;
  }
  // 3. localStorage 저장된 BT 결과도 확인
  if(!btR){
    try{
      const raw = localStorage.getItem(SX_BT_RESULT_KEY);
      if(raw){ const d = JSON.parse(raw); if(d && d.ticker===stock.code && d.trades) btR = d; }
    }catch(e){}
  }
  if(!btR || !btR.trades || !btR.trades.length){ toast('일봉 백테스트 결과가 없습니다 — 일봉에서 BT 실행 후 누적하세요'); return; }
  const market = stock._mkt || stock.market || currentMarket;
  const hist = _btHistLoad(market);
  let arr = hist[stock.code] || [];
  const now = Date.now();
  // 현재 BT trades → 누적 형식으로 변환
  const newTrades = btR.trades.map(t=>({
    entryDate: t.entryDate || t.date || '',
    exitDate: t.exitDate || '',
    direction: t.type || 'long',
    entryPrice: t.entry || 0,
    exitPrice: t.exit || 0,
    pnl: t.pnl || 0,
    result: (t.pnl||0) >= 0 ? 'win' : 'loss',
    ts: now,
  })).filter(t=>t.entryDate);
  // 진입일 기준 중복 제거 (최신 덮어쓰기)
  const entryMap = new Map();
  arr.forEach(t=>entryMap.set(t.entryDate, t));
  newTrades.forEach(t=>entryMap.set(t.entryDate, t));
  arr = Array.from(entryMap.values());
  // ts 기준 정렬 → 30건 상한 (오래된 것부터 삭제)
  arr.sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(arr.length > BT_HIST_MAX) arr = arr.slice(arr.length - BT_HIST_MAX);
  hist[stock.code] = arr;
  _btHistSave(market, hist);
  const tfNote = (_btTF() !== 'day') ? ' (일봉 기준)' : '';
  toast(`✅ ${stock.name||stock.code} 검증결과 ${newTrades.length}건 누적${tfNote} (총 ${arr.length}/${BT_HIST_MAX})`);
  // UI 갱신
  _btHistUpdateUI(stock);
}

// S67: 누적 데이터 삭제
function btHistClear(){
  const stock = _btCurrentStock();
  if(!stock){ toast('종목을 먼저 선택하세요'); return; }
  const market = stock._mkt || stock.market || currentMarket;
  const hist = _btHistLoad(market);
  if(!hist[stock.code] || !hist[stock.code].length){ toast('누적 데이터가 없습니다'); return; }
  if(!confirm(`${stock.name||stock.code}의 검증 누적 데이터를 삭제하시겠습니까?`)) return;
  delete hist[stock.code];
  _btHistSave(market, hist);
  toast('검증 데이터 삭제됨');
  _btHistUpdateUI(stock);
}

// S67: 누적 기반 통계 계산
function _btHistCalcStats(arr){
  if(!arr || !arr.length) return null;
  const n = arr.length;
  const wins = arr.filter(t=>t.result==='win').length;
  const wr = n>0 ? Math.round(wins/n*100) : 0;
  const pnls = arr.map(t=>t.pnl||0);
  const totalPnl = Math.round(pnls.reduce((a,b)=>a+b,0)*100)/100;
  const avgPnl = Math.round(totalPnl/n*100)/100;
  // MDD
  let peak=0, dd=0, mdd=0;
  let cum=0;
  pnls.forEach(p=>{ cum+=p; if(cum>peak) peak=cum; dd=peak-cum; if(dd>mdd) mdd=dd; });
  mdd = Math.round(mdd*100)/100;
  // PF
  const grossWin = pnls.filter(p=>p>0).reduce((a,b)=>a+b,0);
  const grossLoss = Math.abs(pnls.filter(p=>p<0).reduce((a,b)=>a+b,0));
  const pf = grossLoss>0 ? Math.round(grossWin/grossLoss*100)/100 : grossWin>0?99:0;
  return { n, wr, totalPnl, avgPnl, mdd, pf };
}

// S67: 신뢰도 라벨
function _btHistReliabilityLabel(n){
  if(n<=0) return {text:'0/30', cls:'none', desc:'—'};
  if(n<10) return {text:n+'/30', cls:'low', desc:'데이터부족'};
  if(n<30) return {text:n+'/30', cls:'mid', desc:'충족'};
  return {text:'30/30', cls:'full', desc:'충분'};
}

// S67: 단일검증 탭 내 누적 저장 UI 갱신
function _btHistUpdateUI(stock){
  const el = document.getElementById('btHistArea');
  if(!el) return;
  if(!stock){ el.innerHTML=''; return; }
  const inWl = _isInWatchlist(stock.code);
  const market = stock._mkt || stock.market || currentMarket;
  const hist = _btHistLoad(market);
  const arr = hist[stock.code] || [];
  const stats = _btHistCalcStats(arr);
  const rel = _btHistReliabilityLabel(arr.length);

  let html = `<div class="bt-hist-ctrl" style="display:flex;gap:6px;margin:8px 0">`;
  if(inWl){
    html += `<button class="bt-btn bt-btn-primary" style="flex:1;font-size:10px;padding:6px" onclick="btHistAccumulate()">검증결과누적</button>`;
    html += `<button class="bt-btn" style="flex:1;font-size:10px;padding:6px;background:var(--surface2);color:var(--text2);border:1px solid var(--border)" onclick="btHistClear()">검증데이터삭제</button>`;
  } else {
    html += `<button class="bt-btn" style="flex:1;font-size:10px;padding:6px;opacity:.4;cursor:default" disabled>검증결과누적</button>`;
    html += `<button class="bt-btn" style="flex:1;font-size:10px;padding:6px;opacity:.4;cursor:default" disabled>검증데이터삭제</button>`;
    html += `</div><div style="font-size:9px;color:var(--text3);text-align:center;margin-bottom:6px">관심종목 등록 시 활성화됩니다</div>`;
    el.innerHTML = html; return;
  }
  html += `</div>`;

  // 신뢰도 + 누적 통계
  const relColor = rel.cls==='full'?'var(--buy)':rel.cls==='mid'?'var(--accent)':rel.cls==='low'?'var(--sell)':'var(--text3)';
  html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0 8px">`;
  html += `<span class="bt-hist-reliability" style="font-size:11px;font-weight:700;color:${relColor}">${rel.text}</span>`;
  html += `<span style="font-size:9px;color:var(--text3)">${rel.desc}</span>`;
  html += `</div>`;

  if(stats){
    const wrC = stats.wr>=50?'var(--buy)':'var(--sell)';
    const pnlC = stats.totalPnl>=0?'var(--buy)':'var(--sell)';
    const pfC = stats.pf>=1.5?'var(--buy)':stats.pf>=1.0?'var(--accent)':'var(--sell)';
    html += `<div class="bt-card" style="margin:0;padding:8px 10px">
      <div class="bt-card-title" style="font-size:10px;margin-bottom:6px">누적 검증 통계 (${stats.n}건)</div>
      <div class="bt-stat-grid" style="grid-template-columns:repeat(3,1fr);gap:4px">
        <div class="bt-stat-item"><div class="bt-stat-num" style="font-size:13px;color:${wrC}">${stats.wr}%</div><div class="bt-stat-label">승률</div></div>
        <div class="bt-stat-item"><div class="bt-stat-num" style="font-size:13px;color:${pnlC}">${stats.totalPnl>=0?'+':''}${stats.totalPnl}%</div><div class="bt-stat-label">총수익</div></div>
        <div class="bt-stat-item"><div class="bt-stat-num" style="font-size:13px;color:${pfC}">${stats.pf}</div><div class="bt-stat-label">PF</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--text3)">
        <span>MDD ${stats.mdd}%</span><span>평균 ${stats.avgPnl>=0?'+':''}${stats.avgPnl}%</span>
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

// S95: BT 현재 상태 판정 (분석탭 BT 시그널 통합)
function btGetCurrentState(btResult, currentPrice){
  if(!btResult || !btResult.trades || !btResult.trades.length)
    return { state:'no_data', text:'BT 데이터 없음', color:'var(--text3)' };
  const lastTrade = btResult.trades[btResult.trades.length - 1];
  // 미청산 포지션 (type==='OPEN')
  if(lastTrade.type === 'OPEN'){
    const pnl = currentPrice > 0 && lastTrade.entry > 0
      ? ((currentPrice - lastTrade.entry) / lastTrade.entry * 100).toFixed(1)
      : lastTrade.pnl.toFixed(1);
    const tp = lastTrade.tp || null;
    const sl = lastTrade.sl || null;
    // S99: 매수신호 현재봉 판별 자동 설정
    const _totalBars = btResult.scores ? btResult.scores.length : 0;
    const _isBuySignal = lastTrade.entryIdx != null && _totalBars > 0 && lastTrade.entryIdx >= _totalBars - 2;
    return {
      state:'holding',
      entry: lastTrade.entry,
      entryDate: lastTrade.entryDate || '',
      entryIdx: lastTrade.entryIdx,
      totalBars: _totalBars,
      _isBuySignal: _isBuySignal, // S99: 자동 설정
      pnl: +pnl,
      tp, sl,
      text: _isBuySignal ? 'BT 매수 신호 — 진입가 ' + Math.round(lastTrade.entry).toLocaleString() : '보유중 ' + (+pnl >= 0 ? '+' : '') + pnl + '%',
      color: _isBuySignal ? '#22c55e' : (+pnl >= 0 ? 'var(--buy)' : 'var(--sell)')
    };
  }
  // 마지막 거래가 최신봉(마지막 봉)에서 청산됨 → 매도 신호
  const totalBars = btResult.scores ? btResult.scores.length : 0;
  if(lastTrade.exitIdx != null && totalBars > 0 && lastTrade.exitIdx >= totalBars - 2){
    const isWin = lastTrade.type === 'WIN';
    return {
      state:'sell_signal',
      exitPrice: lastTrade.exit,
      exitDate: lastTrade.exitDate || '',
      pnl: lastTrade.pnl,
      isWin,
      text: 'BT 매도 신호 — ' + (isWin?'익절':'손절') + ' ' + (lastTrade.pnl>=0?'+':'') + lastTrade.pnl + '%',
      color: isWin ? 'var(--accent)' : 'var(--sell)'
    };
  }
  // 그 외 → 대기중
  const lastScore = btResult.scores ? btResult.scores[btResult.scores.length-1] : null;
  return {
    state:'waiting',
    currentScore: lastScore,
    buyTh: btResult.params?.buyTh || 62,
    text: '대기중' + (lastScore != null ? ' — 현재 점수 ' + lastScore : ''),
    color: 'var(--text3)'
  };
}

function _btSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── BT용 캔들 fetch (Yahoo Finance 경유) ──
let _btCandleCache = {};
async function btFetchCandlesYF(code, tf, count){
  tf = tf||'day';
  const yfTf = {day:'1d',week:'1wk',month:'1mo'}[tf]||'1d';
  const range = {day:'5y',week:'10y',month:'max'}[tf]||'5y';
  const cacheKey = `yf_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

  // 코드→티커 변환
  let ticker = code;
  if(/^\d{6}$/.test(code)){
    let items = [];
    try{ items = [...JSON.parse(localStorage.getItem('ORACLE_KOSPI')||'[]'),...JSON.parse(localStorage.getItem('ORACLE_KOSDAQ')||'[]'),...JSON.parse(localStorage.getItem('ORACLE_ETF')||'[]')]; }catch(e){}
    const found = items.find(s=>s.code===code);
    const mkt = found?.market||'';
    ticker = mkt.startsWith('KOSDAQ') ? code+'.KQ' : code+'.KS';
  }

  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yfTf}&range=${range}`;
  const proxyUrl = `${BT_PROXY}/proxy?url=${encodeURIComponent(yfUrl)}`;
  const res = await fetch(proxyUrl, {signal:AbortSignal.timeout(15000), cache:'no-store'});
  if(!res.ok) throw new Error('Yahoo Finance 응답 오류');
  const raw = await res.json();
  const result = raw?.chart?.result?.[0];
  if(!result?.timestamp) throw new Error('Yahoo Finance 데이터 없음');
  const ts = result.timestamp||[];
  const q = result.indicators?.quote?.[0]||{};
  const rows = ts.map((t,i)=>({
    t:new Date(t*1000).toISOString(),
    o:q.open?.[i]||0, h:q.high?.[i]||0, l:q.low?.[i]||0,
    c:q.close?.[i]||0, v:q.volume?.[i]||0,
  })).filter(r=>r.c>0);
  if(rows.length<30) throw new Error(`캔들 데이터 부족 (${rows.length}봉)`);
  _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
  return rows.slice(-count);
}

// ── BT용 캔들: 코인(업비트 Workers v9) ──
async function btFetchCandlesCoin(code, tf, count){
  tf = tf||'day';
  const cacheKey = `coin_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

  const tfMap = {day:'days','5m':'minutes/5','15m':'minutes/15','30m':'minutes/30','60m':'minutes/60','240m':'minutes/240',week:'weeks',month:'months'};
  const upbitTf = tfMap[tf]||'days';
  const market = 'KRW-'+code.replace('KRW-','');
  const PAGE = 200; // 업비트 단일 호출 최대
  const pages = Math.ceil(count / PAGE);
  let allArr = [];
  let cursor = ''; // to 파라미터 (빈값=최신부터)

  for(let p=0; p<pages; p++){
    const toParam = cursor ? `&to=${encodeURIComponent(cursor)}` : '';
    const batchCount = Math.min(PAGE, count - allArr.length);
    const url = `${BT_PROXY}/upbit/candles?market=${encodeURIComponent(market)}&type=${upbitTf}&count=${batchCount}${toParam}`;
    const res = await fetch(url, {signal:AbortSignal.timeout(12000)});
    if(!res.ok) throw new Error('Upbit 캔들 응답 오류');
    const json = await res.json();
    const arr = Array.isArray(json)?json:(json.data||[]);
    if(!arr.length) break;
    allArr = allArr.concat(arr);
    if(arr.length < batchCount) break; // 더 이상 데이터 없음
    // 다음 페이지 커서: 가장 오래된 캔들의 시간
    const oldest = arr[arr.length-1];
    cursor = oldest.candle_date_time_utc || oldest.candle_date_time_kst || '';
    if(!cursor) break;
    if(p < pages-1) await _btSleep(120); // rate limit 방지
  }

  if(allArr.length<30) throw new Error(`코인 캔들 부족 (${allArr.length}봉)`);
  const rows = allArr.map(k=>({
    t: k.candle_date_time_kst||k.candle_date_time_utc||'',
    o: k.opening_price||0, h: k.high_price||0,
    l: k.low_price||0, c: k.trade_price||0,
    v: k.candle_acc_trade_volume||0,
  })).filter(r=>r.c>0).reverse(); // 업비트는 최신순 → 오래된순 정렬
  _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
  return rows.slice(-count);
}

// ── BT용 캔들 통합 ──
// S93: 하이브리드 — ① 스크리너 캔들 캐시 공유 → ② 캐시 미스 시 독립 fetch
//   kr: KIS 우선 → 네이버 폴백 (분석탭과 동일 소스 정합)
//   us: Yahoo
//   coin: 업비트
async function btFetchCandles(code, isCoin, tf, count){
  count = count||300;
  if(isCoin) return btFetchCandlesCoin(code, tf, count);

  const mkt = currentMarket || (isCoin?'coin':/^\d{6}$/.test(code)?'kr':'us');

  // ① 스크리너 캔들 캐시 조회 (candleCache는 글로벌)
  if(typeof candleCache !== 'undefined'){
    // 스크리너 캐시키: market_code_count_tf — count가 다를 수 있으므로 넉넉한 키 탐색
    const exactKey = mkt + '_' + code + '_' + count + '_' + tf;
    if(candleCache[exactKey] && Date.now()-candleCache[exactKey].ts < 600000){
      const cached = candleCache[exactKey].data;
      if(cached && cached.length >= Math.min(count, 60)){
        return _btNormalizeRows(cached.slice(-count));
      }
    }
    // count가 다른 캐시도 탐색 (분석탭은 보통 150~300봉)
    for(const k in candleCache){
      if(k.startsWith(mkt+'_'+code+'_') && k.endsWith('_'+tf)){
        const entry = candleCache[k];
        if(entry && Date.now()-entry.ts < 600000 && entry.data && entry.data.length >= Math.min(count, 60)){
          return _btNormalizeRows(entry.data.slice(-count));
        }
      }
    }
  }

  // ② 캐시 미스 → 독립 fetch
  if(mkt === 'kr') return btFetchCandlesKR(code, tf, count);
  return btFetchCandlesYF(code, tf, count);
}

// S93: 스크리너 캔들 형태 → BT 형태 변환 ({date,open,...} → {t,o,...})
function _btNormalizeRows(rows){
  if(!rows || !rows.length) return rows;
  const f = rows[0];
  if(f.t !== undefined) return rows; // 이미 BT 형태
  return rows.map(r=>({
    t: r.date||'', o: r.open||0, h: r.high||0,
    l: r.low||0, c: r.close||0, v: r.volume||0,
  }));
}

// S93: 국내주식 KIS 우선 → 네이버 폴백 (스크리너 fetchCandles와 동일 소스)
async function btFetchCandlesKR(code, tf, count){
  tf = tf||'day';
  const cacheKey = `kr_kis_${code}_${tf}`;
  if(_btCandleCache[cacheKey] && Date.now()-_btCandleCache[cacheKey].ts<300000)
    return _btCandleCache[cacheKey].data.slice(-count);

  // KIS 시도
  if(window._kisEnabled && typeof _getKisConfig === 'function'){
    try{
      const rows = await _btFetchKIS(code, tf, count);
      if(rows && rows.length >= 30){
        _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
        return rows.slice(-count);
      }
    }catch(e){ console.warn('[BT] KIS fetch err, fallback to Naver', e); }
  }

  // 네이버 폴백
  try{
    const rows = await _btFetchNaver(code, tf, count);
    if(rows && rows.length >= 30){
      _btCandleCache[cacheKey] = {data:rows, ts:Date.now()};
      return rows.slice(-count);
    }
  }catch(e){ console.warn('[BT] Naver fetch err, fallback to Yahoo', e); }

  // 최종 폴백: Yahoo
  return btFetchCandlesYF(code, tf, count);
}

// S93: KIS 일봉/주봉/월봉 (500봉 페이지네이션)
async function _btFetchKIS(code, tf, count){
  const periodMap = {'day':'D','week':'W','month':'M'};
  const period = periodMap[tf];
  if(!period) return null; // 분봉은 BT에서 미지원
  const cfg = _getKisConfig();
  const token = cfg ? await _getKisToken() : null;
  if(!token) return null;
  const KIS_PAGE = 100;
  const maxPages = Math.min(Math.ceil(count / KIS_PAGE), 5);
  let allBars = [];
  let curEnd = new Date().toISOString().slice(0,10).replace(/-/g,'');
  for(let pg = 0; pg < maxPages; pg++){
    const endD = curEnd.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
    const sd = new Date(endD);
    const daySpan = {'day':Math.ceil(KIS_PAGE*1.8),'week':Math.ceil(KIS_PAGE*10),'month':Math.ceil(KIS_PAGE*35)}[tf]||Math.ceil(KIS_PAGE*1.8);
    sd.setDate(sd.getDate() - daySpan);
    const startStr = sd.toISOString().slice(0,10).replace(/-/g,'');
    const qs = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE:'J', FID_INPUT_ISCD:code,
      FID_INPUT_DATE_1:startStr, FID_INPUT_DATE_2:curEnd,
      FID_PERIOD_DIV_CODE:period, FID_ORG_ADJ_PRC:'0'
    }).toString();
    const res = await fetch(`${BT_PROXY}/kis/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`,{
      headers:{'authorization':`Bearer ${token}`,'appkey':cfg.appKey,'appsecret':cfg.appSecret,'tr_id':'FHKST03010100','Content-Type':'application/json; charset=utf-8'}
    });
    if(!res.ok) break;
    const data = await res.json();
    const bars = data?.output2;
    if(!bars || !bars.length) break;
    const mapped = bars.map(b=>({
      t:(b.stck_bsop_date||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),
      o:Number(b.stck_oprc||0), h:Number(b.stck_hgpr||0),
      l:Number(b.stck_lwpr||0), c:Number(b.stck_clpr||0),
      v:Number(b.acml_vol||0),
    })).filter(r=>r.c>0);
    allBars = mapped.concat(allBars);
    if(bars.length < KIS_PAGE) break;
    const oldest = bars[bars.length-1]?.stck_bsop_date;
    if(!oldest) break;
    const od = new Date(oldest.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'));
    od.setDate(od.getDate() - 1);
    curEnd = od.toISOString().slice(0,10).replace(/-/g,'');
  }
  const seen = new Set();
  return allBars.filter(b=>{ if(seen.has(b.t)) return false; seen.add(b.t); return true; });
}

// S93: 네이버 sise 캔들 (스크리너와 동일 로직)
async function _btFetchNaver(code, tf, count){
  const tfMap={'day':'day','week':'week','month':'month'};
  const timeframe = tfMap[tf]||'day';
  const end = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const startDate = new Date();
  const dayRange = {'day':Math.ceil(count*1.8),'week':Math.ceil(count*10),'month':Math.ceil(count*35)}[tf] || Math.ceil(count*1.8);
  startDate.setDate(startDate.getDate() - dayRange);
  const start = startDate.toISOString().slice(0,10).replace(/-/g,'');
  const url = `${BT_PROXY}/naver/sise?symbol=${code}&timeframe=${timeframe}&start=${start}&end=${end}`;
  const res = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if(!res.ok) return null;
  const json = await res.json();
  let dataArr = json.data;
  if((!dataArr || !dataArr.length) && json.raw){
    try{
      const cleaned = json.raw.trim().replace(/^\uFEFF/,'');
      let parsed = null;
      try{ parsed = JSON.parse(cleaned); }catch(_){}
      if(!parsed) try{ parsed = JSON.parse(cleaned.replace(/'/g,'"')); }catch(_){}
      if(parsed && Array.isArray(parsed) && parsed.length>=2){
        const hdr = parsed[0];
        dataArr = parsed.slice(1).map(row=>{
          const obj={}; hdr.forEach((h,i)=>{obj[h]=row[i];}); return obj;
        });
      }
    }catch(e){ console.warn('[BT] Naver raw parse err',e); }
  }
  return (dataArr||[]).map(r=>({
    t:r.localDate||r['날짜']||r.date||'',
    o:parseFloat(r.openPrice||r['시가']||r.open||0),
    h:parseFloat(r.highPrice||r['고가']||r.high||0),
    l:parseFloat(r.lowPrice||r['저가']||r.low||0),
    c:parseFloat(r.closePrice||r['종가']||r.close||0),
    v:parseInt(r.accumulatedTradingVolume||r['거래량']||r.volume||0),
  })).filter(r=>r.c>0);
}

// ── BT 파라미터 ──
// S99-4: _analTF 기준 + _analMode 대표 프리셋 연동
function btGetParams(){
  const th = _getEffectiveTh(_btTF());
  const ap = _loadAnalParams(); // _setAnalMode에서 이미 모드별 프리셋 저장됨
  return { buyTh:th.buyTh, sellTh:th.sellTh, tpMult:ap.tpMult||2.5, slMult:ap.slMult||1.5 };
}
function btGetOpts(){
  const slip = parseFloat(document.getElementById('btOptSlip')?.value||'1')/1000;
  const nextBar = document.getElementById('btOptNextBar')?.checked||false;
  return { slippage:slip, nextBarEntry:nextBar };
}

// ── 현재 분석 종목 가져오기 ──
function _btCurrentStock(){
  return currentAnalStock;
}
function _btIsCoin(){
  return currentMarket==='coin';
}

// ============================================================
//  탭1: 기본 백테스트
// ============================================================
async function btRunBasic(){
  const stock = _btCurrentStock();
  if(!stock){toast('종목을 먼저 선택하세요');return;}

  const btn = document.getElementById('btnBtBasic');
  const prog = document.getElementById('btBasicProg');
  const progFill = document.getElementById('btBasicProgFill');
  const progText = document.getElementById('btBasicProgText');
  const result = document.getElementById('btBasicResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  progFill.style.width='20%'; progText.textContent='캔들 데이터 수집 중...';
  result.style.display='none';

  try{
    const count = (_btTF()==='week'||_btTF()==='month') ? 400 : 300;
    const rows = await btFetchCandles(stock.code, _btIsCoin(), _btTF(), count);
    progFill.style.width='50%'; progText.textContent='백테스트 실행 중...';
    await _btSleep(50);

    const params = btGetParams();
    const opts = btGetOpts();
    const r = sxRunBtEngine(rows, _btTF(), params, opts);

    progFill.style.width='100%'; progText.textContent='완료';
    await _btSleep(200);

    if(r.error){
      result.style.display='block';
      const shortageInfo = r.shortage ? `<div style="font-size:10px;color:var(--text3);margin-top:6px">워밍업 ${r.barsNeeded-10}봉 + 매매 최소 10봉 = ${r.barsNeeded}봉 필요<br>현재 수집: ${r.barsHave}봉 · 부족: ${r.barsNeeded - r.barsHave}봉<br><span style="color:var(--accent)">💡 코인: 분봉→일봉 전환, 해외: 주봉 사용 권장</span></div>` : '';
      result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ ${r.error}</div>${shortageInfo}</div>`;
    } else {
      stock._btResult = r; // S93: 인메모리 저장 — btHistAccumulate에서 참조
      btRenderBasicResult(stock, r);
      _btSaveBtResult(stock, r);
    }
  }catch(e){
    result.style.display='block';
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${e.message}</div></div>`;
  }
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
}

function btRenderBasicResult(stock, r){
  const result = document.getElementById('btBasicResult');
  result.style.display='block';
  const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
  const tfLabel = tfLabels[_btTF()]||_btTF();
  const winColor = r.winRate>=50?'var(--buy)':'var(--sell)';
  const pnlColor = r.totalPnl>=0?'var(--buy)':'var(--sell)';
  const pfColor = r.profitFactor>=1.5?'var(--buy)':r.profitFactor>=1.0?'var(--hold)':'var(--sell)';

  let html = `<div class="bt-card">
    <div class="bt-card-title">${stock.name||stock.code} (${stock.code}) · ${tfLabel}</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${winColor}">${r.winRate}%</div><div class="bt-stat-label">승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pfColor}">${r.profitFactor}</div><div class="bt-stat-label">손익비(PF)</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pnlColor}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</div><div class="bt-stat-label">총수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num">${r.totalTrades}</div><div class="bt-stat-label">총매매수</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--buy)">+${r.avgWin}%</div><div class="bt-stat-label">평균이익</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--sell)">-${r.avgLoss}%</div><div class="bt-stat-label">평균손실</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--sell)">${r.mdd}%</div><div class="bt-stat-label">MDD</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--sell)">${r.maxConsecLoss||0}</div><div class="bt-stat-label">최대연속손실</div></div>
    </div>
  </div>`;

  // S44: 매매 0건 진단 카드
  if(r.totalTrades===0 && r.scores && r.scores.length){
    const params = btGetParams();
    const sorted = [...r.scores].sort((a,b)=>a-b);
    const maxS = Math.max(...r.scores), minS = Math.min(...r.scores), medS = sorted[Math.floor(sorted.length/2)];
    const aboveBuy = r.scores.filter(s=>s>=params.buyTh).length;
    const gap = params.buyTh - maxS;
    html += `<div class="bt-card" style="border-left:3px solid var(--accent)">
      <div class="bt-card-title" style="color:var(--accent)">🔍 매매 0건 진단</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.6">
        <b>BUY 임계값:</b> ${params.buyTh}점<br>
        <b>점수 범위:</b> ${minS} ~ ${maxS} (중앙값 ${medS})<br>
        <b>임계값 이상:</b> ${aboveBuy}봉 / ${r.scores.length}봉`;
    if(aboveBuy===0){
      html += `<br><br><span style="color:var(--sell)">점수 최고 ${maxS}이 BUY 임계값 ${params.buyTh}에 ${gap}점 부족</span>`;
      html += `<br><br><b>💡 해결 방법:</b><br>`;
      html += `· 설정 → 분석 파라미터 → BUY 임계 낮추기 (${Math.max(40,maxS-5)}~${maxS} 권장)<br>`;
      html += `· 타임프레임 변경 (일봉↔주봉)으로 다른 패턴 탐색<br>`;
      html += `· 해당 종목의 최근 변동성이 낮아 강한 시그널 미발생 가능`;
    } else {
      html += `<br><br><span style="color:var(--accent)">임계값 이상 ${aboveBuy}봉 존재하나 mom/osc 필터에서 차단됨</span>`;
      html += `<br><span style="font-size:10px;color:var(--text3)">모멘텀(mom>0)과 오실레이터(osc>0) 두 조건을 동시에 만족해야 BUY 진입</span>`;
    }
    html += `</div></div>`;
  }

  // 점수 분포 히스토그램
  if(r.scores && r.scores.length){
    const bins = Array(10).fill(0);
    r.scores.forEach(s=>{ const idx=Math.min(Math.floor(s/10),9); bins[idx]++; });
    const maxBin = Math.max(...bins,1);
    const params = btGetParams();
    const buyBin = Math.min(Math.floor(params.buyTh/10),9);
    const sellBin = Math.min(Math.floor(params.sellTh/10),9);
    const sorted = [...r.scores].sort((a,b)=>a-b);
    html += `<div class="bt-card"><div class="bt-card-title">점수 분포</div>`;
    html += `<div style="font-size:9px;color:var(--text3);margin-bottom:4px">봉 ${r.scores.length} · 중앙값 ${sorted[Math.floor(sorted.length/2)]} · 최고 ${Math.max(...r.scores)} · 최저 ${Math.min(...r.scores)}</div>`;
    for(let i=9;i>=0;i--){
      const pct = (bins[i]/maxBin*100).toFixed(0);
      const isBuy = i>=buyBin;
      const barColor = isBuy?'var(--buy)':'var(--text3)';
      const tag = i===buyBin?` <span style="color:var(--accent);font-weight:700;font-size:8px">← BUY(${params.buyTh})</span>`:'';
      const sellTag = i===sellBin?` <span style="color:var(--sell);font-weight:700;font-size:8px">← SELL(${params.sellTh})</span>`:'';
      html += `<div class="bt-hist-row">
        <span class="bt-hist-label">${i*10}-${i*10+9}</span>
        <div class="bt-hist-bar-wrap"><div class="bt-hist-bar" style="width:${pct}%;background:${barColor}"></div></div>
        <span class="bt-hist-cnt">${bins[i]}</span>${tag}${sellTag}
      </div>`;
    }
    html += `<div style="font-size:9px;color:var(--text3);margin-top:4px">buyTh(${params.buyTh}) 이상: ${r.scores.filter(s=>s>=params.buyTh).length}봉 → 최종 BUY ${r.totalTrades}</div>`;
    html += `</div>`;
  }

  // 매매 목록
  if(r.trades && r.trades.length){
    html += `<div class="bt-card"><div class="bt-card-title">매매 목록 (${r.trades.length}건)</div>`;
    const maxShow = Math.min(r.trades.length, 50);
    for(let i=0;i<maxShow;i++){
      const t = r.trades[i];
      const pnlC = t.pnl>=0?'var(--buy)':'var(--sell)';
      html += `<div class="bt-trade-item">
        <span class="bt-trade-type ${t.type}">${t.type}</span>
        <span style="flex:1;color:var(--text2)">${t.entry?.toFixed(0)||'-'} → ${t.exit?.toFixed(0)||'-'}</span>
        <span class="bt-trade-pnl" style="color:${pnlC}">${t.pnl>=0?'+':''}${t.pnl}%</span>
        <span class="bt-trade-bars">${t.bars}봉</span>
      </div>`;
    }
    if(r.trades.length>maxShow) html += `<div class="bt-trade-item" style="justify-content:center;color:var(--text3)">... +${r.trades.length-maxShow}건 더</div>`;
    html += `</div>`;
  }

  result.innerHTML = html;
  // S67: 누적 저장 UI 갱신
  _btHistUpdateUI(stock);
}

// ============================================================
//  탭2: 교차검증
// ============================================================
async function btRunCross(){
  if(!searchResults.length){toast('결과 탭에 종목이 없습니다');return;}
  const items = searchResults;

  const btn = document.getElementById('btnBtCross');
  const prog = document.getElementById('btCrossProg');
  const progFill = document.getElementById('btCrossProgFill');
  const progText = document.getElementById('btCrossProgText');
  const result = document.getElementById('btCrossResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  const params = btGetParams();
  const opts = btGetOpts();
  const results = [];
  const count = (_btTF()==='week'||_btTF()==='month') ? 400 : 300;
  const isCoin = _btIsCoin();

  for(let i=0;i<items.length;i++){
    const s = items[i];
    progFill.style.width = `${Math.round((i/items.length)*100)}%`;
    progText.textContent = `${i+1}/${items.length} — ${s.name||s.code}`;
    try{
      const rows = await btFetchCandles(s.code, isCoin, _btTF(), count);
      const r = sxRunBtEngine(rows, _btTF(), params, opts);
      results.push({name:s.name||s.code, code:s.code, ...r});
    }catch(e){
      results.push({name:s.name||s.code, code:s.code, error:e.message, shortage:true, winRate:0, profitFactor:0, totalPnl:0, mdd:0, totalTrades:0, avgWin:0, avgLoss:0});
    }
    await _btSleep(100);
  }

  progFill.style.width='100%'; progText.textContent='완료';
  await _btSleep(200);
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';

  btRenderCrossResult(results);
  _btSaveBtCross(results);
}

function btRenderCrossResult(results){
  const result = document.getElementById('btCrossResult');
  result.style.display='block';

  const valid = results.filter(r=>r.totalTrades>0);
  const skipped = results.filter(r=>r.shortage||r.error);
  const shown = results.filter(r=>!r.shortage&&!r.error); // 테이블에 표시할 종목 (매매 0건 포함)
  const avgWinRate = valid.length ? +(valid.reduce((s,r)=>s+r.winRate,0)/valid.length).toFixed(1) : 0;
  const avgPnl = valid.length ? +(valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length).toFixed(2) : 0;
  const stdPnl = valid.length>1 ? +Math.sqrt(valid.reduce((s,r)=>s+(r.totalPnl-avgPnl)**2,0)/(valid.length-1)).toFixed(2) : 0;
  const consistColor = stdPnl<10?'var(--buy)':'var(--sell)';

  let html = `<div class="bt-card">
    <div class="bt-card-title">교차검증 결과 (${valid.length}/${results.length}개)${skipped.length?` · <span style="color:var(--sell)">${skipped.length}개 스킵</span>`:''}</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num">${avgWinRate}%</div><div class="bt-stat-label">평균 승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgPnl>=0?'var(--buy)':'var(--sell)'}">${avgPnl>=0?'+':''}${avgPnl}%</div><div class="bt-stat-label">평균 수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${consistColor}">${stdPnl<10?'안정':'불안정'}</div><div class="bt-stat-label">일관성 (σ${stdPnl})</div></div>
    </div>
  </div>`;

  html += `<div class="bt-card"><div class="bt-card-title">종목별 상세</div>
    <div style="overflow-x:auto;"><table class="bt-cross-table">
    <thead><tr><th>종목</th><th>승률</th><th>PF</th><th>수익률</th><th>MDD</th><th>매매</th></tr></thead><tbody>`;
  for(const r of shown){
    const wc = r.winRate>=50?'var(--buy)':'var(--sell)';
    const pc = r.totalPnl>=0?'var(--buy)':'var(--sell)';
    html += `<tr>
      <td style="text-align:left;font-weight:600;">${r.name}</td>
      <td style="color:${wc}">${r.winRate}%</td>
      <td>${r.profitFactor}</td>
      <td style="color:${pc}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</td>
      <td style="color:var(--sell)">${r.mdd}%</td>
      <td>${r.totalTrades}</td>
    </tr>`;
  }
  html += `</tbody></table></div></div>`;

  // 데이터 부족 종목 별도 카드
  if(skipped.length){
    html += `<div class="bt-card" style="border-left:3px solid var(--sell);">
      <div class="bt-card-title" style="color:var(--sell)">⚠️ 데이터 부족으로 제외 (${skipped.length}개)</div>
      <div style="font-size:10px;color:var(--text3);display:flex;flex-wrap:wrap;gap:4px 8px;">`;
    for(const r of skipped){
      const reason = r.error||'데이터 부족';
      html += `<span style="padding:2px 6px;background:var(--surface2);border-radius:4px;" title="${reason}">${r.name}</span>`;
    }
    html += `</div></div>`;
  }

  result.innerHTML = html;
  _btLastCrossResults = results;
}
let _btLastCrossResults = null;

// ============================================================
//  탭3: 워크포워드
// ============================================================
async function btRunWf(){
  const stock = _btCurrentStock();
  if(!stock){toast('종목을 먼저 선택하세요');return;}
  const ratio = parseInt(document.getElementById('btWfRatio').value)/100;

  const btn = document.getElementById('btnBtWf');
  const prog = document.getElementById('btWfProg');
  const progFill = document.getElementById('btWfProgFill');
  const progText = document.getElementById('btWfProgText');
  const result = document.getElementById('btWfResult');
  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  try{
    const count = (_btTF()==='week'||_btTF()==='month') ? 400 : 300;
    const rows = await btFetchCandles(stock.code, _btIsCoin(), _btTF(), count);
    progFill.style.width='30%'; progText.textContent='학습 구간 백테스트...';
    await _btSleep(50);

    const splitIdx = Math.floor(rows.length*ratio);
    const trainRows = rows.slice(0, splitIdx);
    const testRows = rows.slice(splitIdx);

    if(trainRows.length<70 || testRows.length<30){
      result.style.display='block';
      result.innerHTML = `<div class="bt-card"><div class="bt-card-title">⚠️ 데이터 부족</div><div style="font-size:10px;color:var(--text3);padding:4px 0">학습 구간 ${trainRows.length}봉 (최소 70봉) / 검증 구간 ${testRows.length}봉 (최소 30봉)<br>전체 ${rows.length}봉 수집됨 · 최소 100봉 필요<br><span style="color:var(--accent)">💡 더 긴 타임프레임(주봉→월봉) 또는 학습 비율 조정 권장</span></div></div>`;
      btn.disabled=false; prog.style.display='none'; progText.style.display='none';
      return;
    }

    const params = btGetParams();
    const opts = btGetOpts();
    const trainR = sxRunBtEngine(trainRows, _btTF(), params, opts);

    progFill.style.width='70%'; progText.textContent='검증 구간 백테스트...';
    await _btSleep(50);
    const testR = sxRunBtEngine(testRows, _btTF(), params, opts);

    progFill.style.width='100%'; progText.textContent='완료';
    await _btSleep(200);

    btRenderWfResult(stock, trainR, testR, ratio);
    _btLastWfResult = {train:trainR, test:testR};
  }catch(e){
    result.style.display='block';
    result.innerHTML = `<div class="bt-card"><div class="bt-card-title">❌ 오류: ${e.message}</div></div>`;
  }
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
}
let _btLastWfResult = null;

function btRenderWfResult(stock, train, test, ratio){
  const result = document.getElementById('btWfResult');
  result.style.display='block';
  const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
  const tfLabel = tfLabels[_btTF()]||_btTF();

  const wrDiff = train.winRate - test.winRate;
  const pnlDiff = train.totalPnl - test.totalPnl;
  const overfit = wrDiff>15 || pnlDiff>20;
  const overfitColor = overfit?'var(--sell)':'var(--buy)';

  let html = `<div class="bt-card">
    <div class="bt-card-title">${stock.name||stock.code} · ${tfLabel} · 학습 ${Math.round(ratio*100)}%</div>
    <div style="text-align:center;font-size:12px;font-weight:700;color:${overfitColor};padding:6px;">${overfit?'⚠️ 과최적화 의심':'✅ 정상'}</div>
  </div>`;

  html += `<div class="bt-wf-compare">`;
  html += _btWfCol('학습 구간', train, 'var(--accent)');
  html += _btWfCol('검증 구간', test, 'var(--buy)');
  html += `</div>`;

  html += `<div class="bt-card" style="margin-top:8px;">
    <div class="bt-card-title">학습 vs 검증 차이</div>
    <div class="bt-stat-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${wrDiff>10?'var(--sell)':'var(--text2)'}">Δ${wrDiff>=0?'+':''}${wrDiff.toFixed(1)}%</div><div class="bt-stat-label">승률 차이</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${pnlDiff>15?'var(--sell)':'var(--text2)'}">Δ${pnlDiff>=0?'+':''}${pnlDiff.toFixed(1)}%</div><div class="bt-stat-label">수익률 차이</div></div>
    </div>
  </div>`;

  result.innerHTML = html;
}

function _btWfCol(title, r, color){
  const wc = r.winRate>=50?'var(--buy)':'var(--sell)';
  const pc = r.totalPnl>=0?'var(--buy)':'var(--sell)';
  return `<div class="bt-wf-col">
    <div class="bt-wf-col-title" style="background:${color};color:#fff;">${title}</div>
    <div style="font-size:10px;text-align:center;">
      <div style="margin:3px 0"><span style="color:var(--text3)">승률</span> <span style="font-weight:700;color:${wc}">${r.winRate}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">PF</span> <span style="font-weight:700;font-family:'Outfit'">${r.profitFactor}</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">수익</span> <span style="font-weight:700;color:${pc}">${r.totalPnl>=0?'+':''}${r.totalPnl}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">MDD</span> <span style="font-weight:700;color:var(--sell)">${r.mdd}%</span></div>
      <div style="margin:3px 0"><span style="color:var(--text3)">매매</span> <span style="font-weight:700">${r.totalTrades}건</span></div>
    </div>
  </div>`;
}

// ============================================================
//  탭4: 대시보드
// ============================================================
async function btRunDashboard(){
  if(!searchResults.length){toast('결과 탭에 종목이 없습니다');return;}
  const btn = document.getElementById('btnBtDash');
  const prog = document.getElementById('btDashProg');
  const progFill = document.getElementById('btDashProgFill');
  const progText = document.getElementById('btDashProgText');
  const result = document.getElementById('btDashResult');

  btn.disabled=true; prog.style.display='block'; progText.style.display='block';
  result.style.display='none';

  const items = searchResults;
  const params = btGetParams();
  const opts = btGetOpts();
  const crossResults = [];
  const count = (_btTF()==='week'||_btTF()==='month') ? 400 : 300;
  const isCoin = _btIsCoin();

  // 1) 교차검증
  for(let i=0;i<items.length;i++){
    const s = items[i];
    progFill.style.width = `${10+Math.round((i/items.length)*40)}%`;
    progText.textContent = `교차 ${i+1}/${items.length} — ${s.name||s.code}`;
    try{
      const rows = await btFetchCandles(s.code, isCoin, _btTF(), count);
      crossResults.push({name:s.name||s.code, ...sxRunBtEngine(rows, _btTF(), params, opts)});
    }catch(e){
      crossResults.push({name:s.name||s.code, error:e.message, shortage:true, winRate:0, profitFactor:0, totalPnl:0, mdd:0, totalTrades:0});
    }
    await _btSleep(100);
  }

  // 2) 워크포워드 (첫 번째 종목)
  progFill.style.width='60%'; progText.textContent='워크포워드 실행 중...';
  let wfTrain=null, wfTest=null;
  try{
    const stock = items[0];
    const rows = await btFetchCandles(stock.code, isCoin, _btTF(), count);
    const splitIdx = Math.floor(rows.length*0.7);
    const trainRows = rows.slice(0, splitIdx);
    const testRows = rows.slice(splitIdx);
    if(trainRows.length>=70 && testRows.length>=30){
      wfTrain = sxRunBtEngine(trainRows, _btTF(), params, opts);
      wfTest = sxRunBtEngine(testRows, _btTF(), params, opts);
    }
  }catch(e){}

  progFill.style.width='100%'; progText.textContent='등급 산출 중...';
  await _btSleep(200);

  // 등급 계산
  const valid = crossResults.filter(r=>r.totalTrades>0);
  const avgWR = valid.length ? valid.reduce((s,r)=>s+r.winRate,0)/valid.length : 0;
  const avgPnl = valid.length ? valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length : 0;
  const avgPF = valid.length ? valid.reduce((s,r)=>s+r.profitFactor,0)/valid.length : 0;
  const wfPenalty = (wfTrain&&wfTest) ? (wfTrain.winRate-wfTest.winRate>15||wfTrain.totalPnl-wfTest.totalPnl>20?-1:0) : 0;

  let gradeScore = 0;
  if(avgWR>=55) gradeScore+=2; else if(avgWR>=45) gradeScore+=1;
  if(avgPnl>0) gradeScore+=2; else if(avgPnl>-5) gradeScore+=1;
  if(avgPF>=1.5) gradeScore+=2; else if(avgPF>=1.0) gradeScore+=1;
  gradeScore += wfPenalty;

  const grade = gradeScore>=5?'A':gradeScore>=3?'B':gradeScore>=1?'C':'F';

  btRenderDashResult(grade, gradeScore, crossResults, wfTrain, wfTest, avgWR, avgPnl, avgPF);
  btn.disabled=false; prog.style.display='none'; progText.style.display='none';
}

function btRenderDashResult(grade, score, crossR, wfTrain, wfTest, avgWR, avgPnl, avgPF){
  const result = document.getElementById('btDashResult');
  result.style.display='block';
  const gradeDesc = {A:'전략 신뢰도 높음',B:'전략 유효',C:'추가 검증 필요',F:'전략 재검토 권장'};
  const skipped = crossR.filter(r=>r.shortage||r.error);
  const validCnt = crossR.filter(r=>r.totalTrades>0).length;

  let html = `<div class="bt-card">
    <div class="bt-grade-badge ${grade}">${grade}</div>
    <div style="text-align:center;font-size:11px;color:var(--text2);margin-bottom:6px">${gradeDesc[grade]} (점수: ${score}/6)${skipped.length?` · <span style="color:var(--sell)">${skipped.length}개 데이터 부족</span>`:''}</div>
    <div class="bt-stat-grid">
      <div class="bt-stat-item"><div class="bt-stat-num">${avgWR.toFixed(1)}%</div><div class="bt-stat-label">평균 승률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:${avgPnl>=0?'var(--buy)':'var(--sell)'}">${avgPnl>=0?'+':''}${avgPnl.toFixed(1)}%</div><div class="bt-stat-label">평균 수익률</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num">${avgPF.toFixed(2)}</div><div class="bt-stat-label">평균 PF</div></div>
    </div>
  </div>`;

  if(wfTrain && wfTest){
    const wrDiff = wfTrain.winRate - wfTest.winRate;
    const pnlDiff = wfTrain.totalPnl - wfTest.totalPnl;
    const overfit = wrDiff>15 || pnlDiff>20;
    html += `<div class="bt-card">
      <div class="bt-card-title">${overfit?'⚠️':'✅'} 워크포워드 검증</div>
      <div class="bt-stat-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="bt-stat-item"><div class="bt-stat-num">${wfTrain.winRate}% → ${wfTest.winRate}%</div><div class="bt-stat-label">학습 → 검증 승률</div></div>
        <div class="bt-stat-item"><div class="bt-stat-num">${wfTrain.totalPnl}% → ${wfTest.totalPnl}%</div><div class="bt-stat-label">학습 → 검증 수익</div></div>
      </div>
    </div>`;
  }

  // 데이터 부족 종목 별도 카드
  if(skipped.length){
    html += `<div class="bt-card" style="border-left:3px solid var(--sell);">
      <div class="bt-card-title" style="color:var(--sell)">⚠️ 데이터 부족으로 제외 (${skipped.length}개)</div>
      <div style="font-size:10px;color:var(--text3);display:flex;flex-wrap:wrap;gap:4px 8px;">`;
    for(const r of skipped){
      html += `<span style="padding:2px 6px;background:var(--surface2);border-radius:4px;" title="${r.error||'데이터 부족'}">${r.name}</span>`;
    }
    html += `</div></div>`;
  }

  result.innerHTML = html;
}

// ============================================================
//  탭5: 페이퍼 트레이딩
// ============================================================
function _btLoadPaper(){ try{return JSON.parse(localStorage.getItem(SX_PAPER_KEY)||'[]');}catch(e){return [];} }
function _btSavePaper(list){ localStorage.setItem(SX_PAPER_KEY, JSON.stringify(list)); }

async function btRecordPaper(signal){
  const stock = _btCurrentStock();
  if(!stock){toast('종목을 먼저 선택하세요');return;}

  try{
    const rows = await btFetchCandles(stock.code, _btIsCoin(), _btTF(), 5);
    const adapted = sxAdaptRows(rows);
    const price = adapted[adapted.length-1]?.close||0;
    const scan = scrQuickScore(adapted, _btTF());

    const entry = {
      code:stock.code, name:stock.name||stock.code,
      signal, score:scan.score, price,
      date:new Date().toISOString(), tf:_btTF(),
      result:null, exitPrice:null, exitDate:null,
    };
    const list = _btLoadPaper();
    list.unshift(entry);
    _btSavePaper(list);
    toast(`${stock.name} ${signal} 기록 (${price.toLocaleString()}원, 점수 ${scan.score})`);
    btRenderPaper();
  }catch(e){
    toast('오류: '+e.message);
  }
}

async function btUpdatePaper(){
  const list = _btLoadPaper();
  const pending = list.filter(t=>!t.result);
  if(!pending.length){toast('업데이트할 대기 건 없음');return;}

  let updated = 0;
  for(const t of pending){
    try{
      const isCoin = currentMarket==='coin';
      const rows = await btFetchCandles(t.code, isCoin, t.tf||'day', 5);
      const adapted = sxAdaptRows(rows);
      const currentPrice = adapted[adapted.length-1]?.close||0;
      if(currentPrice<=0) continue;

      const pnl = ((currentPrice-t.price)/t.price)*100;
      if(t.signal==='BUY'){
        if(pnl>=5){t.result='WIN';t.exitPrice=currentPrice;t.exitDate=new Date().toISOString();updated++;}
        else if(pnl<=-3){t.result='LOSS';t.exitPrice=currentPrice;t.exitDate=new Date().toISOString();updated++;}
      } else {
        if(pnl<=-5){t.result='WIN';t.exitPrice=currentPrice;t.exitDate=new Date().toISOString();updated++;}
        else if(pnl>=3){t.result='LOSS';t.exitPrice=currentPrice;t.exitDate=new Date().toISOString();updated++;}
      }
    }catch(e){}
    await _btSleep(300);
  }

  _btSavePaper(list);
  btRenderPaper();
  toast(`${updated}건 업데이트 (대기 ${pending.length-updated}건)`);
}

function btClearPaper(){
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(_){}
  // S103-fix5: 진동이 OS로 전달될 시간 확보 후 confirm 모달
  setTimeout(btClearPaperCore, 30);
}
function btClearPaperCore(){
  const list = _btLoadPaper();
  if(!list.length){toast('비어있음');return;}
  if(!confirm(`페이퍼 ${list.length}건을 모두 삭제할까요?`)) return;
  _btSavePaper([]);
  btRenderPaper();
  toast('전체 삭제 완료');
}

function btRenderPaper(){
  const list = _btLoadPaper();
  const statsEl = document.getElementById('btPaperStats');
  const listEl = document.getElementById('btPaperList');
  if(!statsEl||!listEl) return;

  if(!list.length){
    statsEl.innerHTML = '';
    listEl.innerHTML = '<div style="text-align:center;padding:30px 16px;font-size:11px;color:var(--text3)">BUY/SELL 신호를 기록하세요<br><br>현재 분석 종목의 실시간 가격과 점수가 기록됩니다</div>';
    return;
  }

  const wins = list.filter(t=>t.result==='WIN').length;
  const losses = list.filter(t=>t.result==='LOSS').length;
  const open = list.filter(t=>!t.result).length;
  const total = wins+losses;
  const hitRate = total ? +(wins/total*100).toFixed(1) : 0;

  statsEl.innerHTML = `<div class="bt-card">
    <div class="bt-stat-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--buy)">${wins}</div><div class="bt-stat-label">WIN</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--sell)">${losses}</div><div class="bt-stat-label">LOSS</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num" style="color:var(--hold)">${open}</div><div class="bt-stat-label">대기</div></div>
      <div class="bt-stat-item"><div class="bt-stat-num">${hitRate}%</div><div class="bt-stat-label">적중률</div></div>
    </div>
  </div>`;

  listEl.innerHTML = list.slice(0,30).map(t=>{
    const resultHtml = t.result
      ? `<span class="bt-paper-result" style="background:${t.result==='WIN'?'var(--buy-bg);color:var(--buy)':'var(--sell-bg);color:var(--sell)'}">${t.result}</span>`
      : `<span class="bt-paper-result" style="background:var(--hold-bg);color:var(--hold)">대기</span>`;
    return `<div class="bt-paper-card">
      <span class="bt-paper-signal ${t.signal}">${t.signal}</span>
      <div class="bt-paper-info">
        <div class="name">${t.name||t.code}</div>
        <div class="meta">${(t.date||'').slice(0,16)} · ${t.price?.toLocaleString()||'—'}원</div>
      </div>
      <span class="bt-paper-score">${t.score||'—'}</span>
      ${resultHtml}
    </div>`;
  }).join('');
}

// ── Bridge 연동: BT 결과 저장 ──
function _btSaveBtResult(stock, r){
  try{
    const tfLabels = {'5m':'5분','15m':'15분','30m':'30분','60m':'60분','240m':'4시간',day:'일봉',week:'주봉',month:'월봉'};
    const payload = {
      type:'bt_result', source:'sx_screener', version:'v2.1',
      saved_at:new Date().toISOString(),
      ticker:stock.code, name:stock.name||stock.code,
      market:stock.market||'', tf:_btTF(), tf_label:tfLabels[_btTF()]||_btTF(),
      winRate:r.winRate, profitFactor:r.profitFactor, totalPnl:r.totalPnl,
      mdd:r.mdd, totalTrades:r.totalTrades, avgWin:r.avgWin, avgLoss:r.avgLoss,
      maxConsecLoss:r.maxConsecLoss||0,
      trades:r.trades||[], // S93: btHistAccumulate에서 trades 참조 필요
    };
    localStorage.setItem(SX_BT_RESULT_KEY, JSON.stringify(payload));
  }catch(e){console.error('BT result save error',e);}
}

function _btSaveBtCross(results){
  try{
    const valid = results.filter(r=>r.totalTrades>0);
    const avgWR = valid.length ? +(valid.reduce((s,r)=>s+r.winRate,0)/valid.length).toFixed(1) : 0;
    const avgPnl = valid.length ? +(valid.reduce((s,r)=>s+r.totalPnl,0)/valid.length).toFixed(2) : 0;
    const stdPnl = valid.length>1 ? +Math.sqrt(valid.reduce((s,r)=>s+(r.totalPnl-avgPnl)**2,0)/(valid.length-1)).toFixed(2) : 0;
    const payload = {
      type:'bt_cross', source:'sx_screener', version:'v2.1',
      saved_at:new Date().toISOString(), tf:_btTF(),
      total:results.length, valid:valid.length,
      avgWinRate:avgWR, avgPnl:avgPnl, stdPnl:stdPnl,
      consistency:stdPnl<10?'안정':'불안정',
      items:results.map(r=>({name:r.name,code:r.code||'',winRate:r.winRate,profitFactor:r.profitFactor,totalPnl:r.totalPnl,mdd:r.mdd,totalTrades:r.totalTrades}))
    };
    localStorage.setItem(SX_BT_CROSS_KEY, JSON.stringify(payload));
  }catch(e){console.error('BT cross save error',e);}
}
