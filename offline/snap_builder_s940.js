// [S940] SX 자동매매 스냅 자동갱신 — 헤드리스 fetch → 최신 스냅 리빌드(런타임·커밋 안 함).
// [S1192] coin(업비트) 지원 추가 — KRW 마켓 일봉, 공개 API·무인증. us(야후)는 계속 exit 2 폴백.
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

if (mkt !== 'kr' && mkt !== 'coin') { console.error('[snap_builder] ' + mkt + ' 미지원(kr·coin만) → 폴백'); process.exit(2); }

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
      const rows = (mkt === 'coin') ? await fetchDailyCoin(c) : await fetchDaily(c);   // [S1192] 시장별 소스
      if (rows.length < 60) { excluded.push(c); fail++; }        // 봉수 미달 = 제외
      else {
        stocks[c] = (mkt === 'coin') ? { name: nameOf(c), src: 'upbit', rows } : { name: nameOf(c), rows };   // [S1192]
        const ld = rows[rows.length - 1][0];
        if (ld > maxDate) maxDate = ld;
        ok++;
      }
    } catch (e) { excluded.push(c); fail++; }
    await sleep(120);                                            // rate limit 완화
    if ((i + 1) % 40 === 0) console.error('  ...' + (i + 1) + '/' + codes.length + ' (ok ' + ok + ' fail ' + fail + ')');
  }

  // ── 검증 게이트 (미달 시 폴백) ──
  const covered = ok / codes.length;
  const minOk = (mkt === 'coin') ? 80 : 100;   // [S1192] 풀 크기 차이(coin 113 vs kr 188)
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
