// sx_tvread.js — [S1872] 풀차트 지표 '읽기 한 줄'(사용자 2026-11-02 22:12) — 앱 자체(라이선스 없음) · PREREG_S1872_tvread.md §1
//   읽기 도움 · 판정 아님 · 실험 도구 · 성적 주장 없음 — 지표 계산은 손대지 않는다(틀 SXTV.result 의 같은 결과에서 마지막 봉 상태만 글로)
//   🧩 표시 = 🧩 보조 재료 칩의 '매수 쪽' 규칙과 같은 꼴(sx_render.js _sxAxOk · 칩은 입력 TV 기본값 · 여기는 그 지표의 지금 설정)
//   틀 sx_tvchart.js 가 SXTV.READ[id](R, p, rows) 를 부른다 → { t: 글, ok: 🧩 매수 쪽(true/false · 규칙 없으면 null) } 또는 null(읽을 것 없음)
(function(){
'use strict';
const TV = (typeof window !== 'undefined') ? window.SXTV : null; if (!TV) return;
const fin = Number.isFinite;
const lastI = (a, to) => { for (let i = to; i >= 0; i--) if (a[i]) return i; return -1; };
const ago = (li, i) => li - i === 0 ? '이 봉' : (li - i) + '봉 전';
const px = v => !fin(v) ? '—' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 1 ? (+v.toFixed(2)).toString() : (+v.toPrecision(4)).toString());
const pct = (a, b) => { const x = (a / b - 1) * 100; return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '%'; };
const closeOf = rows => { const r = rows[rows.length - 1] || {}; const c = +r.close; return fin(c) ? c : NaN; };
const R1 = {
  // ── 아래 칸 ──
  sqz(R, p, rows) { const li = rows.length - 1, b = R.bc[li], s = R.sc[li]; if (!(b >= 0)) return null;
    return { t: '모멘텀 ' + ['+ 커짐(라임)', '+ 줄어듦(초록)', '− 커짐(빨강 · 하락 힘 세짐)', '− 줄어듦(밤색 · 하락 힘 약해짐)'][b] + ' · ' + ['스퀴즈 없음', '스퀴즈 켜짐(압축)', '스퀴즈 풀림'][s], ok: b === 0 }; },
  wtk(R, p, rows) { const li = rows.length - 1, s = R.sig[li], m = R.ma[li]; if (!fin(s) || !fin(m)) return null; const ib = lastI(R.buy, li), is = lastI(R.sell, li), k = Math.max(ib, is);
    return { t: (s > m ? '시그널 > MA(히스토그램 +)' : '시그널 ≤ MA(히스토그램 −)') + (k >= 0 ? ' · 마지막 ' + (k === ib ? 'WT▲' : 'WT▼') + ' ' + ago(li, k) : ''), ok: s > m }; },
  wvf(R, p, rows) { const li = rows.length - 1, k = lastI(R.g, li); if (!fin(R.wvf[li])) return null; const in5 = k >= 0 && li - k < 5;
    return { t: in5 ? '직전 5봉 안 라임(공포 극단) · ' + ago(li, k) : '직전 5봉 안 라임 없음', ok: in5 }; },
  srsi(R, p, rows) { const li = rows.length - 1, k = R.k[li], d = R.d[li]; if (!fin(k) || !fin(d)) return null;
    return { t: 'K ' + k.toFixed(1) + ' · D ' + d.toFixed(1) + ' · ' + (k > d ? 'K > D' : 'K ≤ D') + (k >= 80 ? ' · 80 위(과열 구간)' : k <= 20 ? ' · 20 아래(바닥 구간)' : ''), ok: k > d }; },
  chop(R, p, rows) { const li = rows.length - 1, v = R.ci[li]; if (!fin(v)) return null;
    return { t: v.toFixed(1) + ' · ' + (v > 61.8 ? '61.8 위 = 횡보 장' : v < 38.2 ? '38.2 아래 = 추세 장' : '38.2 ~ 61.8 사이'), ok: v < 61.8 }; },
  sta(R, p, rows) { const li = rows.length - 1, d = R.dir[li], k = Math.max(lastI(R.up, li), lastI(R.dn, li)); if (!fin(R.st[li])) return null;
    return { t: '슈퍼트렌드 ' + (d === -1 ? '위(상승 쪽)' : '아래(하락 쪽)') + (k >= 0 ? (li === k ? ' · 이 봉에 바뀜' : ' · 바뀐 지 ' + (li - k) + '봉') : ''), ok: d === -1 }; },
  // ── 차트 위 ──
  ut(R, p, rows) { const li = rows.length - 1, s = R.side[li], ib = lastI(R.buy, li), is = lastI(R.sell, li), k = Math.max(ib, is); if (!s) return null;
    return { t: '종가가 트레일링 스탑 ' + (s === 1 ? '위' : '아래') + (k >= 0 ? ' · 마지막 ' + (k === ib ? 'UT▲' : 'UT▼') + ' ' + ago(li, k) : ''), ok: null }; },
  srb(R, p, rows) { const li = rows.length - 1, u = lastI(R.bUp, li), d = lastI(R.bDn, li), uIn = u >= 0 && li - u < 5, dIn = d >= 0 && li - d < 5;
    return { t: (uIn || dIn) ? '직전 5봉 안 ' + [uIn ? 'SR▲ ' + ago(li, u) : '', dIn ? 'SR▼ ' + ago(li, d) : ''].filter(Boolean).join(' · ') : '직전 5봉 안 거래량 돌파 없음', ok: uIn }; },
  vp(R, p, rows) { const P = R.last, c = closeOf(rows); if (!P || !(P.last >= 0) || !fin(P.max) || !(P.max > 0) || !fin(c)) return null; const poc = (P.levels[P.last] + P.levels[P.last + 1]) / 2;
    return { t: 'POC ' + px(poc) + '(거래가 가장 많은 가격) · 종가 ' + (c > poc ? '위 ' : c < poc ? '아래 ' : '같음 ') + pct(c, poc), ok: null }; },
  smc(R, p, rows) { const li = rows.length - 1, one = (U, D) => { let k = -1; for (let i = li; i >= 0; i--) if (U[i] || D[i]) { k = i; break; } if (k < 0) return '아직 없음'; const up = !!U[k]; return ((up ? U[k] : D[k]) === 2 ? 'CHoCH' : 'BOS') + (up ? '↑' : '↓') + ' ' + ago(li, k); };
    return { t: '마지막 구조 깨짐 — 내부 ' + one(R.iUp, R.iDn) + ' · 스윙 ' + one(R.sUp, R.sDn) + ' · 🧩 SMC 내부 ' + (R.iB[li] === 1 ? '✓' : '✗') + ' · 스윙 ' + (R.sB[li] === 1 ? '✓' : '✗'), ok: null }; },
  ictob(R, p, rows) { const c = closeOf(rows); if (!fin(c)) return null; const al = R.obs.filter(o => o.end < 0 && fin(o.top) && fin(o.bot)); if (!al.length) return { t: '살아 있는 상자 없음', ok: null };
    const inn = al.filter(o => c <= o.top && c >= o.bot), dn = al.filter(o => o.top < c).sort((a, b) => b.top - a.top)[0];
    return { t: '살아 있는 상자 ' + al.length + ' · ' + (inn.length ? '종가가 상자 안(위끝 ' + px(inn[inn.length - 1].top) + ' · 아래끝 ' + px(inn[inn.length - 1].bot) + ')' : dn ? '가장 가까운 아래 상자 위끝까지 ' + pct(dn.top, c) : '아래 상자 없음'), ok: null }; },
  msb(R, p, rows) { const li = rows.length - 1; let k = -1; for (let i = li; i >= 1; i--) if (R.market[i] !== R.market[i - 1]) { k = i; break; }
    return { t: '시장 구조 ' + (R.market[li] === 1 ? '상승' : '하락') + (k >= 0 ? ' · 마지막 MSB ' + ago(li, k) : '') + ' · 남은 상자 ' + R.boxes.filter(b => !b.del && fin(b.t) && fin(b.b)).length, ok: null }; },
  pob(R, p, rows) { const c = closeOf(rows); if (!fin(c)) return null; const al = R.blocks.filter(b => b.gone < 0 && fin(b.top) && fin(b.btm)), bu = al.filter(b => b.d === 1), be = al.filter(b => b.d === -1);
    const dn = bu.filter(b => b.top < c).sort((a, b) => b.top - a.top)[0], up = be.filter(b => b.btm > c).sort((a, b) => a.btm - b.btm)[0];
    return { t: '남은 블록 상승 ' + bu.length + ' · 하락 ' + be.length + (dn ? ' · 아래 상승 블록 위끝까지 ' + pct(dn.top, c) : '') + (up ? ' · 위 하락 블록 아래끝까지 ' + pct(up.btm, c) : ''), ok: null }; },
  kzp(R, p, rows) { const c = closeOf(rows); if (!fin(c)) return null; const z = (tf, nm) => { const h = R.lines.find(l => l.tf === tf && l.k === 'H' && fin(l.y)), l = R.lines.find(l => l.tf === tf && l.k === 'L' && fin(l.y)); if (!h || !l) return ''; return nm + ' ' + (c > h.y ? '고가 위' : c < l.y ? '저가 아래' : '범위 안'); };
    const s = [z('W', '지난 주'), z('M', '지난 달')].filter(Boolean); return s.length ? { t: '종가가 ' + s.join(' · '), ok: null } : null; }
};
// 앱 기본 RSI · MACD — sx_chart.js 의 calcRSI · calcMACD 결과(그림과 같은 값)를 넘겨받아 글만
const RB = {
  rsi(a) { const v = a && a.length ? a[a.length - 1] : NaN; if (!fin(v)) return null; return { t: v.toFixed(1) + ' · ' + (v >= 70 ? '70 위(과매수 구간)' : v <= 30 ? '30 아래(과매도 구간)' : (v >= 50 ? '50 위' : '50 아래')), ok: null }; },
  macd(o) { if (!o || !o.macd || !o.macd.length) return null; const n = o.macd.length, m = o.macd[n - 1], s = o.signal[n - 1], h = o.hist[n - 1], h1 = n > 1 ? o.hist[n - 2] : null; if (m == null || s == null || !fin(m) || !fin(s)) return null;
    return { t: (m > s ? 'MACD > 시그널' : 'MACD ≤ 시그널') + (h != null && h1 != null ? ' · 히스토그램 ' + (Math.abs(h) > Math.abs(h1) ? '커짐' : '줄어듦') : '') + ' · 0선 ' + (m >= 0 ? '위' : '아래'), ok: m > s }; }
};
TV.READ = R1; TV.READB = RB;
if (typeof module !== 'undefined' && module.exports) module.exports = { R1, RB };
})();
