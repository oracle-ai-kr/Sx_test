// [S940] SX 자동매매 스냅 자동갱신 — 헤드리스 fetch → 최신 스냅 리빌드(런타임·커밋 안 함).
// [S1192] coin(업비트) 지원 추가 — KRW 마켓 일봉, 공개 API·무인증. us(야후)는 계속 exit 2 폴백.
// [S1633] us: 야후 직접 → 막히면 워커 /proxy 경유(nocache) — 윗줄·아래 '(us)는 exit 2'는 S1228 이전 문구(S1228부터 us 지원).
//   워커 sxFetchCandles(KR)와 동일 소스: fchart.stock.naver.com/sise.nhn (XML <item data="YYYYMMDD|o|h|l|c|v"/>).
//   풀(종목 코드+이름)은 커밋된 snap에서 승계 = "풀 매니페스트" 역할. 캔들만 최신으로 교체.
//   사용: node snap_builder_s940.js kr --pool snap_kr.json --out /tmp/fresh_snap_kr.json [--count 450]
//   kr(네이버)·coin(업비트) 지원. us(야후)는 exit 2 → 호출측(at_signals_push.sh)이 커밋 스냅으로 폴백.
//   실패 정책: 커버리지/신선도 게이트 미달 시 exit 2 → 폴백(신호 파이프라인은 안 끊김).
// [S1651] coin = 업비트 KRW 동적 유니버스(사용자 결정 2026-09-20 "가상 원장이니 표시만 달고 바로 섞어보자" · 자동 편입):
//   커밋 스냅(snap_coin.json 114종)은 이제 '측정 풀'(univ:'pool') 명단으로만 쓰고, 업비트 market/all의 KRW 마켓 중 그 밖의 코인은
//   페그 제외·200봉 이상이면 자동으로 'ext'(확장)로 편입한다. 상폐(목록 부재)는 조회 전에 빠지고, 신규 상장은 200봉이 차는 날 들어온다.
//   종목마다 30 완성봉 중위 거래대금(tv30 · candle_acc_trade_price)을 실어 워커가 후보 우선순위 동점을 거래대금으로 가른다(S1651).
//   끄기: env COIN_DYNAMIC=0 → 종전 동작 그대로(커밋 스냅 명단 · univ/tv30 없음 · 게이트 80종·70%).

const fs = require('fs');

function arg(name, def) { const i = process.argv.indexOf(name); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : def; }

const mkt = (process.argv[2] || 'kr').toLowerCase();
const poolPath = arg('--pool', 'snap_kr.json');
const outPath = arg('--out', '/tmp/fresh_snap_' + mkt + '.json');
const COUNT = parseInt(arg('--count', '450'), 10);

if (mkt !== 'kr' && mkt !== 'coin' && mkt !== 'us') { console.error('[snap_builder] ' + mkt + ' 미지원(kr·coin·us) → 폴백'); process.exit(2); }   // [S1228] us(야후) 지원

// 풀 로드 (코드+이름 승계). 커밋된 snap의 캔들은 무시하고 코드 목록만 사용.
let pool;
try { pool = JSON.parse(fs.readFileSync(poolPath, 'utf8')); }
catch (e) { console.error('[snap_builder] 풀 로드 실패: ' + poolPath + ' — ' + (e && e.message)); process.exit(2); }
const codes = Object.keys((pool && pool.stocks) || {});
if (codes.length < 10) { console.error('[snap_builder] 풀 종목 부족: ' + codes.length); process.exit(2); }
const nameOf = c => (pool.stocks[c] && pool.stocks[c].name) || c;

// ── [S1651] 코인 동적 유니버스 SSOT ──
const COIN_DYNAMIC = (mkt === 'coin') && (process.env.COIN_DYNAMIC !== '0');
//   페그(가격이 법정화폐·금에 묶인 토큰) — 추세가 없어 칸 신호가 환율 흔들림에 반응한다. 확장분에서 항상 뺀다.
//   ★실측(2026-09-20 업비트 KRW 289종): 페그 11종이 상장돼 있고 최근 한 달에만 JPYC·PYUSD·EURC 3종이 새로 들어왔다.
//   미상장 예비(PAXG·DAI·TUSD·FDUSD·USDP)는 상장되는 날 바로 막히도록 미리 둔다(코드 충돌 없음 · 상장 전엔 무동작).
const COIN_PEG = ['USDT', 'USDC', 'USDS', 'USDE', 'USD1', 'USDG', 'PYUSD', 'RLUSD', 'EURC', 'JPYC', 'XAUT', 'PAXG', 'DAI', 'TUSD', 'FDUSD', 'USDP'];
//   확장분 최소 봉수 — 칸(3×3) 판정의 장기축이 MA 60/120/200(sx_analysis_engine _maAlignLTTrip)이라 200봉 미만이면
//   칸real·레거시 둘 다 발동이 불가능하다(_ltStr733 'off' → _cellKeyOf null). 새 문턱이 아니라 엔진이 이미 요구하는 봉수다.
const COIN_EXT_MIN_BARS = 200;
//   목록에 없는 새 달러 페그 자동 판별 — USDT 대비 가격비의 30일 중위절대이탈(%)이 이 값 미만이면 페그로 본다(확장분만).
//   ★실측(2026-09-20): 달러 페그 6종 0.07~0.33% ↔ 비페그 최저 TRX 0.88% · BTC 1.17%. 사이 값 0.5로 둔다(측정 풀 114종에는 안 건다).
const COIN_PEG_MAD = 0.5;
const _coinAux = {};   // code → { tv30, cl:[[YYYY-MM-DD, close]...] } — fetchDailyCoin이 채운다(rows 반환 계약은 그대로)
async function fetchCoinMarkets() {   // 업비트 KRW 마켓 목록(상장 전 종목·상폐 종목은 여기 없다)
  const res = await fetch('https://api.upbit.com/v1/market/all?is_details=true', { headers: { 'Accept': 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error('market/all HTTP ' + res.status);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length <= 10) throw new Error('market/all 무효 응답');
  const out = [];
  for (const m of arr) { if (!m || typeof m.market !== 'string' || m.market.indexOf('KRW-') !== 0) continue; out.push({ code: m.market.slice(4), name: m.korean_name || m.market.slice(4), warning: !!(m.market_event && m.market_event.warning === true) }); }
  if (out.length <= 10) throw new Error('KRW 마켓 ' + out.length + '개 — 무효');
  return out;
}
function _coinMed(a) { const v = a.filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); const n = v.length; if (!n) return null; return (n % 2) ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; }
function _coinPegMad(aux, ref) {   // USDT 대비 가격비의 중위절대이탈(%) — 같은 날짜 20개 이상 겹칠 때만 · 못 구하면 null(판별 안 함)
  if (!aux || !ref || !Array.isArray(aux.cl) || !Array.isArray(ref.cl)) return null;
  const rm = {}; for (const [d, c] of ref.cl) { if (c > 0) rm[d] = c; }
  const r = []; for (const [d, c] of aux.cl) { if (c > 0 && rm[d] > 0) r.push(c / rm[d]); }
  if (r.length < 20) return null;
  const md = _coinMed(r); if (!(md > 0)) return null;
  return _coinMed(r.map(x => Math.abs(x / md - 1))) * 100;
}

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchDaily(code) {
  const url = 'https://fchart.stock.naver.com/sise.nhn?symbol=' + encodeURIComponent(code) + '&timeframe=day&count=' + COUNT + '&requestType=0';
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://finance.naver.com/' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const xml = await res.text();
  const rows = [];
  for (const m of xml.matchAll(/<item\s+data="([^"]+)"/g)) {
    const p = m[1].split('|');
    const date = (p[0] || '').replace(/[^0-9]/g, '');
    if (date.length < 8) continue;
    rows.push([date, +p[1] || 0, +p[2] || 0, +p[3] || 0, +p[4] || 0, +p[5] || 0]);
  }
  return rows;
}

// [S1192] 업비트 일봉 — KRW 마켓 고정('KRW-'+code). 최신→과거 페이지네이션(200/req, to=가장 오래된 캔들 utc).
//   candle_date_time_kst('YYYY-MM-DDT09:00:00')를 date 필드로 사용 — 기존 커밋 스냅과 동일 형식. 중복은 dedup.
async function fetchDailyCoin(code) {
  const market = 'KRW-' + code;
  let all = [], to = '';
  while (all.length < COUNT + 20) {
    const url = 'https://api.upbit.com/v1/candles/days?market=' + encodeURIComponent(market) + '&count=200' + (to ? ('&to=' + encodeURIComponent(to)) : '');
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) break;
    all = all.concat(arr);
    if (arr.length < 200) break;
    to = arr[arr.length - 1].candle_date_time_utc;
    await sleep(120);
  }
  const seen = {}, rows = [];
  for (const k of all) {
    const d = k && k.candle_date_time_kst; if (!d || seen[d]) continue; seen[d] = 1;
    rows.push([d, +k.opening_price || 0, +k.high_price || 0, +k.low_price || 0, +k.trade_price || 0, +k.candle_acc_trade_volume || 0]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  // [S1651] 곁값 — 형성 중 봉(업비트 일봉 경계 00:00 UTC = 09:00 KST · 러너 S1497과 같은 규약)은 빼고 최근 30 완성봉.
  //   tv30 = 그 30봉 거래대금(candle_acc_trade_price · 원) 중위 — 하루 거래대금이 아니라 중위인 이유: 실측(2026-09-20) 어제 거래대금 상위 20 중
  //   12종이 30일 중위의 3배 이상 급증 종목이었다(순위가 급등 추격이 된다) · 30일 중위 상위 20은 급증 2종 · 하루 뒤 상위 20 겹침 20/20.
  try {
    const _today = new Date().toISOString().slice(0, 10), byD = {};
    for (const k of all) { const d = k && k.candle_date_time_utc; if (!d || String(d).slice(0, 10) >= _today) continue; byD[String(d).slice(0, 10)] = k; }
    const ds = Object.keys(byD).sort().slice(-30);
    _coinAux[code] = { tv30: (ds.length >= 10) ? _coinMed(ds.map(d => +byD[d].candle_acc_trade_price)) : null, cl: ds.map(d => [d, +byD[d].trade_price]) };
  } catch (_) { _coinAux[code] = { tv30: null, cl: [] }; }
  return rows.slice(-COUNT);
}

// [S1633] US 경로 — GitHub Actions 러너에서 야후 직접 호출이 막혀(2026-09-19 활동 로그 '신호 수신 US 2026-07-01' = 커밋 스냅 폴백 · 같은 요청이 다른 망에선 200)
//   직접 → 실패하면 그 종목은 워커 /proxy 경유(앱·카드가 US 봉을 받는 바로 그 경로 · 같은 야후 응답 본문). 워커 경유는 nocache=1(KV 읽기·쓰기 0).
//   '막힘'류 실패(HTTP 404·데이터 없음 제외)가 3연속이면 이후 종목은 직접을 건너뛴다(끈적 전환 · 야후를 계속 두드리지 않는다).
//   종전엔 종목별 실패 사유를 삼켜 원인을 못 봤다 → 앞 3건 사유와 경로별 건수를 로그에 남긴다. WORKER_BASE 없으면 종전과 같다(직접만).
const WORKER_BASE = String(process.env.WORKER_BASE || '').replace(/\/+$/, '');
const _usPath = { direct: 0, proxy: 0, run: 0, sticky: false, why: [], fill: 0 };   // [S1634] fill=마지막 봉 종가 보정 건수
async function _yfJson(url, viaProxy) {
  const u = viaProxy ? (WORKER_BASE + '/proxy?nocache=1&url=' + encodeURIComponent(url)) : url;
  const res = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!(j && j.chart && j.chart.result && j.chart.result[0])) throw new Error('no chart data');
  return j;
}
// [S1634] 야후 마지막 봉 종가 결측 보정 — 2026-09-19 실측: 96종 중 21종의 9/18 봉이 시가·고가·저가·거래량은 있는데 종가만 null이었다(meta.regularMarketPrice가 그 종가 ·
//   고가·저가·거래량도 meta 값과 일치). 종전엔 이 봉을 버려 그 종목이 9/17 봉으로 판정됐다(신호 기준일 9/18과 불일치 → SHOP BB회귀 편입·ALAB 탈락).
//   조건: 마지막 봉 하나 · meta 시각이 그 봉과 같은 UTC 날짜 · 개장 뒤 3시간 이상(반일장 13:00 ET 포함 · 러너는 장 마감 뒤에만 돈다) · 그 봉 시가·고가·저가가 있을 때.
function _usLastCloseFill(r, i) {
  const m = r.meta || {}, q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const px = +m.regularMarketPrice, mt = +m.regularMarketTime, bt = +r.timestamp[i];
  if (!(px > 0) || !(mt > 0) || !(bt > 0)) return null;
  if (new Date(mt * 1000).toISOString().slice(0, 10) !== new Date(bt * 1000).toISOString().slice(0, 10)) return null;
  if (!(mt - bt >= 3 * 3600)) return null;
  if (!(+((q.open || [])[i]) > 0) || !(+((q.high || [])[i]) > 0) || !(+((q.low || [])[i]) > 0)) return null;
  return px;
}
// [S1228] 야후 v8 chart — US 일봉. 커밋 스냅과 동일 규격 확인: 날짜=개장시각 ISO(13:30/14:30Z) · 가격=분할조정
//   (커밋 snap_us의 NVDA 24-02 시가 70.07 = 10:1 분할 반영 = 야후 quote 배열 기본값과 일치).
//   심볼 점표기(BRK.B) → 야후 대시(BRK-B) 변환. null 봉(휴장 결측)은 스킵.
async function fetchDailyUS(code) {
  const sym = String(code).replace(/\./g, '-');
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=3y&interval=1d';
  let j = null;   // [S1633] 직접 → (실패 시) 워커 경유
  if (!_usPath.sticky) {
    try { j = await _yfJson(url, false); _usPath.direct++; _usPath.run = 0; }
    catch (e) {
      const m = String((e && e.message) || e);
      if (_usPath.why.length < 3) _usPath.why.push(sym + ' ' + m);
      const blocked = !(/HTTP 404/.test(m) || /no chart data/.test(m));   // 상장폐지·데이터 없음은 '막힘'이 아니다
      _usPath.run = blocked ? (_usPath.run + 1) : 0;
      if (_usPath.run >= 3 && WORKER_BASE) _usPath.sticky = true;
    }
  }
  if (!j && WORKER_BASE) { j = await _yfJson(url, true); _usPath.proxy++; }
  if (!j) throw new Error('no chart data');
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) throw new Error('no chart data');
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const rows = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    let c = q.close && q.close[i];
    if ((c == null || !(c > 0)) && i === r.timestamp.length - 1) { c = _usLastCloseFill(r, i); if (c > 0) _usPath.fill++; }   // [S1634] 마지막 봉 종가 결측 보정
    if (c == null || !(c > 0)) continue;   // 결측 봉 스킵
    rows.push([new Date(r.timestamp[i] * 1000).toISOString(),
      +((q.open || [])[i]) || 0, +((q.high || [])[i]) || 0, +((q.low || [])[i]) || 0, +c || 0, +((q.volume || [])[i]) || 0]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return rows.slice(-COUNT);
}

function dayDiff(a, b) {
  const d1 = new Date(a.slice(0, 4) + '-' + a.slice(4, 6) + '-' + a.slice(6, 8));
  const d2 = new Date(b.slice(0, 4) + '-' + b.slice(4, 6) + '-' + b.slice(6, 8));
  return Math.abs((d2 - d1) / 86400000);
}

// [S1651] 코인 동적 경로 — 목록 조회 → 페그·상폐 제외 → 캔들 → 확장분 200봉·페그 자동 판별 → 게이트 → 저장.
//   게이트: 종전 '커버리지 70%'는 확장분의 200봉 미만(정상 제외)까지 실패로 세므로 쓰지 않는다 —
//   ① 통과 80종 이상(종전 하한 그대로) ② 네트워크·서버 오류(404 제외)가 시도의 30% 이하. 404='Code not found'=상폐는 오류가 아니다.
async function _coinDynamicMain(t0) {
  let mk = null, mkErr = null;
  try { mk = await fetchCoinMarkets(); } catch (e) { mkErr = String((e && e.message) || e); }
  const poolCodes = codes.slice(), poolSet = new Set(poolCodes), PEG = new Set(COIN_PEG);
  const krwSet = mk ? new Set(mk.map(m => m.code)) : null, nameMap = {};
  if (mk) for (const m of mk) nameMap[m.code] = m.name;
  const pegListed = mk ? mk.filter(m => PEG.has(m.code)).map(m => m.code) : [];
  const poolDelisted = krwSet ? poolCodes.filter(c => !krwSet.has(c)) : [];
  const extCodes = mk ? mk.map(m => m.code).filter(c => !poolSet.has(c) && !PEG.has(c)) : [];
  const run = poolCodes.filter(c => !krwSet || krwSet.has(c)).concat(extCodes);
  let ref = null;   // USDT 기준열 — 페그 자동 판별용(실패하면 판별만 건너뛴다)
  if (krwSet && krwSet.has('USDT')) { try { await fetchDailyCoin('USDT'); ref = _coinAux.USDT || null; } catch (_) { ref = null; } await sleep(120); }
  const stocks = {}, excluded = poolDelisted.slice(), young = [], pegAuto = [];
  let maxDate = '', ok = 0, attempted = 0, err404 = 0, errOther = 0, nPool = 0, nExt = 0;
  for (let i = 0; i < run.length; i++) {
    const c = run[i], isPool = poolSet.has(c);
    attempted++;
    try {
      const rows = await fetchDailyCoin(c), aux = _coinAux[c] || {};
      const tv30 = (typeof aux.tv30 === 'number' && isFinite(aux.tv30)) ? Math.round(aux.tv30) : null;
      let keep = false;
      if (isPool) { if (rows.length < 60) excluded.push(c); else keep = true; }          // 측정 풀은 종전 규칙 그대로(60봉)
      else if (rows.length < COIN_EXT_MIN_BARS) young.push(c);                              // 확장분 — 칸 판정 불가 구간
      else { const mad = _coinPegMad(aux, ref); if (mad != null && mad < COIN_PEG_MAD) pegAuto.push(c); else keep = true; }
      if (keep) {
        stocks[c] = { name: isPool ? nameOf(c) : (nameMap[c] || c), src: 'upbit', rows, univ: isPool ? 'pool' : 'ext', tv30 };
        const ld = rows[rows.length - 1][0]; if (ld > maxDate) maxDate = ld;
        ok++; if (isPool) nPool++; else nExt++;
      }
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/HTTP 404/.test(m)) err404++; else errOther++;
      if (isPool) excluded.push(c);
    }
    await sleep(120);
    if ((i + 1) % 40 === 0) console.error('  ...' + (i + 1) + '/' + run.length + ' (ok ' + ok + ' · 확장 ' + nExt + ' · 200봉 미만 ' + young.length + ')');
  }
  if (ok < 80 || (attempted > 0 && errOther > attempted * 0.3)) {
    console.error('[snap_builder] 동적 게이트 미달(S1651): 통과 ' + ok + ' · 오류 ' + errOther + '/' + attempted + (mkErr ? (' · 목록 ' + mkErr) : '') + ' → 폴백');
    process.exit(2);
  }
  const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const mdYmd = String(maxDate).replace(/[^0-9]/g, '').slice(0, 8);
  if (!maxDate || dayDiff(mdYmd, todayYmd) > 2) {
    console.error('[snap_builder] baseDate 신선도 실패: ' + (maxDate || '없음') + ' (오늘 ' + todayYmd + ') → 폴백');
    process.exit(2);
  }
  const snap = {
    kind: 'sx_candle_snapshot', ver: 1, mkt: 'coin', tf: 'day',
    baseDate: maxDate, created: new Date().toISOString(), build: 'S1651-auto',
    poolName: krwSet ? '업비트 KRW 동적(S1651)' : '측정 풀 단독(S1651 · 목록 조회 실패)', n: ok, excluded,
    univ: { mode: krwSet ? 'upbit' : 'pool', krw: krwSet ? krwSet.size : null, pool: poolCodes.length, poolIn: nPool, ext: nExt,
      poolDelisted, peg: pegListed, pegAuto, young, extMinBars: COIN_EXT_MIN_BARS, pegMad: COIN_PEG_MAD, pegRef: ref ? 'USDT' : null,
      err404, errOther, mkErr },
    fields: ['date', 'open', 'high', 'low', 'close', 'volume'], stocks
  };
  fs.writeFileSync(outPath, JSON.stringify(snap));
  console.error('[snap_builder] \u2713 coin 동적(S1651) ' + ok + '종(풀 ' + nPool + ' · 확장 ' + nExt + ') · baseDate ' + maxDate + ' · 페그 제외 ' + pegListed.length + (pegAuto.length ? ('+자동 ' + pegAuto.join('·')) : '') + ' · 200봉 미만 ' + young.length + ' · 상폐 ' + poolDelisted.length + ' · 404 ' + err404 + ' · 오류 ' + errOther + ' · ' + (((Date.now() - t0) / 1000) | 0) + 's \u2192 ' + outPath);
  process.exit(0);
}

(async () => {
  const t0 = Date.now();
  if (COIN_DYNAMIC) return _coinDynamicMain(t0);   // [S1651] 코인 동적 경로(끄기 COIN_DYNAMIC=0) — 아래 종전 루프는 kr·us·코인 폴백 전용
  const stocks = {};
  const excluded = [];
  let maxDate = '', ok = 0, fail = 0;

  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    try {
      const rows = (mkt === 'coin') ? await fetchDailyCoin(c) : (mkt === 'us' ? await fetchDailyUS(c) : await fetchDaily(c));   // [S1192] 시장별 소스 [S1228] +us
      if (rows.length < 60) { excluded.push(c); fail++; }        // 봉수 미달 = 제외
      else {
        stocks[c] = (mkt === 'coin') ? { name: nameOf(c), src: 'upbit', rows } : (mkt === 'us' ? { name: nameOf(c), src: 'yahoo', rows } : { name: nameOf(c), rows });   // [S1192] [S1228]
        const ld = rows[rows.length - 1][0];
        if (ld > maxDate) maxDate = ld;
        ok++;
      }
    } catch (e) { excluded.push(c); fail++; }
    await sleep(120);                                            // rate limit 완화
    if ((i + 1) % 40 === 0) console.error('  ...' + (i + 1) + '/' + codes.length + ' (ok ' + ok + ' fail ' + fail + ')');
  }

  if (mkt === 'us') console.error('[snap_builder] us 경로(S1633): 직접 ' + _usPath.direct + ' · 워커 경유 ' + _usPath.proxy + (_usPath.sticky ? ' (직접 3연속 실패 → 이후 워커 경유)' : '') + (WORKER_BASE ? '' : ' · WORKER_BASE 없음(직접만)') + (_usPath.why.length ? (' · 직접 실패 예: ' + _usPath.why.join(' | ')) : '') + (_usPath.fill ? (' · 마지막 봉 종가 보정 ' + _usPath.fill + '종(S1634)') : ''));
  // ── 검증 게이트 (미달 시 폴백) ──
  const covered = ok / codes.length;
  const minOk = (mkt === 'coin') ? 80 : (mkt === 'us' ? 70 : 100);   // [S1192] 풀 크기 차이 [S1228] us 풀 97
  if (ok < minOk || covered < 0.7) {
    console.error('[snap_builder] 커버리지 부족: ' + ok + '/' + codes.length + ' (' + ((covered * 100) | 0) + '%) → 폴백');
    process.exit(2);
  }
  const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const mdYmd = String(maxDate).replace(/[^0-9]/g, '').slice(0, 8);   // [S1192] coin ISO 날짜 정규화
  const freshLim = (mkt === 'coin') ? 2 : 7;   // [S1192] 코인은 24/7 거래 — 이틀 넘게 낡으면 실패
  if (!maxDate || dayDiff(mdYmd, todayYmd) > freshLim) {
    console.error('[snap_builder] baseDate 신선도 실패: ' + (maxDate || '없음') + ' (오늘 ' + todayYmd + ') → 폴백');
    process.exit(2);
  }

  const snap = {
    kind: 'sx_candle_snapshot', ver: 1, mkt: mkt, tf: 'day',
    baseDate: maxDate, created: new Date().toISOString(), build: 'S1192-auto',
    poolName: (pool && pool.poolName) || '발굴풀(대형)', n: ok, excluded,
    fields: ['date', 'open', 'high', 'low', 'close', 'volume'], stocks
  };
  fs.writeFileSync(outPath, JSON.stringify(snap));
  console.error('[snap_builder] \u2713 ' + mkt + ' ' + ok + '\uc885 \u00b7 baseDate ' + maxDate + ' \u00b7 \uc81c\uc678 ' + excluded.length + ' \u00b7 ' + (((Date.now() - t0) / 1000) | 0) + 's \u2192 ' + outPath);
  process.exit(0);
})().catch(e => { console.error('[snap_builder] \uc608\uc678: ' + ((e && e.message) || e) + ' \u2192 \ud3f4\ubc31'); process.exit(2); });
