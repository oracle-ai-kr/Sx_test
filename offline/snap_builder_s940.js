// [S940] SX 자동매매 스냅 자동갱신 — 헤드리스 fetch → 최신 스냅 리빌드(런타임·커밋 안 함).
// [S1192] coin(업비트) 지원 추가 — KRW 마켓 일봉, 공개 API·무인증. us(야후)는 계속 exit 2 폴백.
// [S1633] us: 야후 직접 → 막히면 워커 /proxy 경유(nocache) — 윗줄·아래 '(us)는 exit 2'는 S1228 이전 문구(S1228부터 us 지원).
//   워커 sxFetchCandles(KR)와 동일 소스: fchart.stock.naver.com/sise.nhn (XML <item data="YYYYMMDD|o|h|l|c|v"/>).
//   풀(종목 코드+이름)은 커밋된 snap에서 승계 = "풀 매니페스트" 역할. 캔들만 최신으로 교체.
//   사용: node snap_builder_s940.js kr --pool snap_kr.json --out /tmp/fresh_snap_kr.json [--count 450]
//   kr(네이버)·coin(업비트) 지원. us(야후)는 exit 2 → 호출측(at_signals_push.sh)이 커밋 스냅으로 폴백.
//   실패 정책: 커버리지/신선도 게이트 미달 시 exit 2 → 폴백(신호 파이프라인은 안 끊김).

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

(async () => {
  const t0 = Date.now();
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
