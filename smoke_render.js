// [S1409] 렌더 스모크 — 파일을 통째로 태우고 _trendRenderInner()를 **실제로 호출**한다.
//   ⚠scopecheck는 고정 목록만 본다. 실기기에서 카드가 통째로 사라지는 사고(S1375 계열)는
//     '로드는 되는데 렌더가 던진다'라서 정적 검사로는 안 잡힌다. 이 스모크가 그 구멍을 막는다.
const fs = require('fs'); const vm = require('vm');
const path = process.argv[2] || '/home/claude/sx/sx_render.js';
const SRC = fs.readFileSync(path, 'utf8');

const store = {};
const el = () => ({ innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, getAttribute: () => null, setAttribute() {} });
const ctx = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Date, Promise, Map, Set, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout, setInterval, encodeURIComponent, decodeURIComponent,
  Intl, Uint8Array, Float64Array, TextEncoder, TextDecoder, performance: { now: () => 0 },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [], body: el(), addEventListener() {} },
  navigator: { userAgent: 'node', vibrate() {} },
  location: { href: 'https://example.invalid/', search: '' },
  fetch: () => Promise.reject(new Error('no net')),
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const T = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ✗ ' + n + (x ? '  ' + x : '')); } };

console.log('\n[1] 파일 로드');
let loadErr = null;
try { vm.runInContext(SRC, ctx, { filename: 'sx_render.js' }); } catch (e) { loadErr = e; }
T('로드 예외 0', !loadErr, loadErr ? (loadErr.message + ' @' + (String(loadErr.stack).split('\n')[1] || '').trim()) : '');
if (loadErr) { console.log('\n────────  통과 ' + pass + ' / 실패 ' + fail + '  ────────'); process.exit(1); }
T('SX_BUILD 노출', typeof ctx.SX_BUILD === 'string', ctx.SX_BUILD);

console.log('\n[2] _trendRenderInner() 실제 호출 — 실기기 카드 소실 사고 재현용');
// 합성 캔들 600봉(값은 렌더 경로를 태우기 위한 것 · 판정 아님)
const rows = []; let p = 10000;
for (let i = 0; i < 600; i++) { p *= (1 + (Math.sin(i / 7) + Math.sin(i / 31)) * 0.006);
  const o = p * 0.998, h = p * 1.012, l = p * 0.988;
  rows.push({ date: '2024' + String(1000 + i), open: +o.toFixed(0), high: +h.toFixed(0), low: +l.toFixed(0), close: +p.toFixed(0), volume: 100000 + i * 7 }); }

const CASES = [
  ['기본(전부 OFF)', {}],
  ['마찰 ON', { __fee: true }],
  ['게이트 전부 ON', { entrySlope: true, entryRsi: true, earlyMa5: true, earlySlope: true, disSl: true, reentry: true, nextOpen: true }],
  ['게이트 전부 ON + 마찰', { entrySlope: true, entryRsi: true, earlyMa5: true, earlySlope: true, disSl: true, reentry: true, nextOpen: true, __fee: true }],
  ['재진입 동일크로스(경고 경로)', { reentry: true, reEntryS: 5, reEntryL: 20 }],
];
['kr', 'us', 'coin'].forEach(mkt => {
  CASES.forEach(([lbl, over]) => {
    // 저장소에 설정을 직접 심는다(앱이 읽는 그 키로)
    // ⚠CASES는 시장 3개를 도는 **공유 픽스처**다 — delete로 변형하면 두 번째 시장부터 설정이 사라진다(실제로 그랬다).
    const fee = !!over.__fee;
    const base = ctx._trendDefaults ? ctx._trendDefaults(mkt) : {};
    const cfg = Object.assign({}, base, over, { _ver: base._ver }); delete cfg.__fee;
    store['SX_TREND_' + mkt] = JSON.stringify(cfg);
    { const sc0 = ctx._stratCfg ? ctx._stratCfg(mkt) : {}; sc0.fee = fee; sc0.feePct = 0.2;
      if (ctx._stratSave) ctx._stratSave(mkt, sc0); else store['SX_STRAT_' + mkt] = JSON.stringify(sc0); }   // 앱의 저장 함수를 그대로 쓴다(_ver 규약 추측 금지)
    ctx._sxTrendCtx = { market: mkt, rows: rows, code: '005930', name: '테스트', tf: 'day' };
    let out = null, err = null;
    try { out = ctx._trendRenderInner(); } catch (e) { err = e; }
    T(mkt + ' · ' + lbl, !err && typeof out === 'string' && out.length > 500,
      err ? ('★' + err.message + ' @' + (String(err.stack).split('\n')[1] || '').trim()) : (out ? out.length + '자' : 'null'));
  });
});

console.log('\n[3] 마찰 칩이 실제로 그려지는가');
{ const sc0 = ctx._stratCfg ? ctx._stratCfg('kr') : {}; sc0.fee = true; sc0.feePct = 0.2; if (ctx._stratSave) ctx._stratSave('kr', sc0); }
store['SX_TREND_kr'] = JSON.stringify(ctx._trendDefaults('kr'));
ctx._sxTrendCtx = { market: 'kr', rows: rows, code: '005930', name: '테스트', tf: 'day' };
let h = ''; try { h = ctx._trendRenderInner(); } catch (e) { h = 'ERR:' + e.message; }
T('💸 수수료 칩 출력', h.indexOf('💸 수수료') >= 0);
T('입력칸 출력(ON일 때)', h.indexOf('sxTrendFee') >= 0);
T('SSOT 안내문 출력', h.indexOf('전략 조합 탭과 <b>같은 값</b>') >= 0);

console.log('\n────────  통과 ' + pass + ' / 실패 ' + fail + '  ────────');
process.exit(fail ? 1 : 0);
