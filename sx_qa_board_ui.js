// ════════════════════════════════════════════════════════════
//  SIGNAL X — Q&A 게시판 UI (sx_qa_board_ui.js)
//  버전: v1 · [S1167]
//
//  코어(sx_qa_board.js / window.SXQA)의 화면. **판정은 여기서 하지 않는다.**
//  게시판은 답이 사는 곳이지 답을 만드는 곳이 아니다 — 화면에서 임계를 조절하다 보면
//  통과할 때까지 돌리게 된다. 게이트는 재기 전에 얼리고, 여기는 얼린 것과 결과만 보여준다.
//
//  ★파일을 따로 뺀 이유: 게시판은 답이 쌓이는 물건이라 화면도 같이 커진다.
//    (지도 뷰·축×상태 표·예상 적중률 전부 나중에 붙을 자리다.)
//    sx_render.js는 훅 2줄만 갖는다.
//
//  마운트: sx_screener.html #sxQaPanel (조건검색탭) · 분석탭은 _qaAskAbout(code,name)
// ════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var S = window._sxQaPanel = window._sxQaPanel || {
    open: false, msg: '', last: null,
    filter: { st: '', tag: '' },
    formOpen: false,
    draft: { text: '', tag: 'etc', topics: '', src: '', quote: '', guess: '', mkt: '', code: '', name: '' },
    detail: {}          // id → 펼침 여부
  };

  function _vib(n) { try { if (typeof _sxVib === 'function') _sxVib(n); } catch (_e) {} }
  function _toast(m) { try { if (typeof toast === 'function') toast(m); } catch (_e) {} }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  var T2 = 'var(--text2)', T3 = 'var(--text3)', BD = 'var(--border)', SF = 'var(--surface2)';

  // ─────────────────────────────────────────────────────────
  //  렌더
  // ─────────────────────────────────────────────────────────
  function _qaPanelHtml() {
    var QA = window.SXQA;
    var wrap = function (inner) {
      return '<div style="margin:8px 0;border:1px solid ' + BD + ';border-radius:10px;background:var(--surface);overflow:hidden">' + inner + '</div>';
    };
    if (!QA) return wrap('<div style="padding:10px;font-size:11px;color:' + T3 + '">📋 Q&amp;A 게시판 — sx_qa_board.js 미로드</div>');

    var L = S.last, n = L ? L.rows.length : 0;
    var open0 = L ? L.stats.bySt[0] : 0, ansN = L ? (L.stats.bySt[2] + L.stats.bySt[3] + L.stats.bySt[4]) : 0;

    var head = '<div onclick="_qaPanelToggle()" style="padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:6px">'
      + '<span style="font-size:12.5px;font-weight:800">📋 Q&amp;A 게시판</span>'
      + (n ? '<span style="font-size:10px;color:' + T3 + '">🔵 ' + open0 + ' · 답 ' + ansN + '</span>' : '')
      + '<span style="margin-left:auto;font-size:11px;color:' + T3 + '">' + (S.open ? '▾' : '▸') + '</span>'
      + '</div>';
    if (!S.open) return wrap(head);

    var B = ['<div style="padding:0 12px 12px">'];

    B.push('<div style="font-size:10px;color:' + T3 + ';line-height:1.55;margin-bottom:8px">'
      + '궁금한 걸 <b>그대로</b> 적어둔다. 답이 없어도 된다 — 적어두지 않으면 다음에 또 궁금해진다.'
      + '</div>');

    //  ── 질문 적기
    if (!S.formOpen) {
      B.push('<button onclick="_qaFormToggle()" style="width:100%;padding:9px;border-radius:8px;border:none;'
        + 'background:var(--accent);color:#fff;font-size:12px;font-weight:800;cursor:pointer">✍️ 질문 적기</button>');
    } else {
      B.push(_formHtml());
    }

    if (!L) { B.push('<div style="margin-top:10px;font-size:11px;color:' + T3 + '">불러오는 중…</div>'); B.push('</div>'); return wrap(head + B.join('')); }

    //  ── 필터
    var fbtn = function (kind, val, label, on) {
      return '<button onclick="_qaFilter(\'' + kind + '\',\'' + val + '\')" style="padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;'
        + 'border:1px solid ' + (on ? 'var(--accent)' : BD) + ';background:' + (on ? 'var(--accent)' : SF) + ';color:' + (on ? '#fff' : T2) + '">' + label + '</button>';
    };
    var fl = ['<div style="display:flex;flex-wrap:wrap;gap:4px;margin:10px 0 6px">'];
    fl.push(fbtn('st', '', '전체 ' + L.rows.length, S.filter.st === ''));
    Object.keys(QA.ST).forEach(function (k) {
      var c = L.stats.bySt[k] || 0; if (!c) return;
      fl.push(fbtn('st', k, QA.ST[k].icon + ' ' + c, S.filter.st === k));
    });
    fl.push('</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">');
    fl.push(fbtn('tag', '', '축 전체', S.filter.tag === ''));
    Object.keys(QA.TAGS).forEach(function (k) {
      var c = L.stats.byTag[k].n || 0; if (!c) return;
      fl.push(fbtn('tag', k, QA.TAGS[k].name + ' ' + c, S.filter.tag === k));
    });
    fl.push('</div>');
    B.push(fl.join(''));

    //  ── 목록
    var rows = L.rows.filter(function (r) {
      if (S.filter.st !== '' && r.st !== +S.filter.st) return false;
      if (S.filter.tag && r.tag !== S.filter.tag) return false;
      return true;
    });
    if (!rows.length) {
      B.push('<div style="padding:14px 4px;font-size:11px;color:' + T3 + ';text-align:center">'
        + (L.rows.length ? '이 조건엔 없다' : '아직 적은 질문이 없다') + '</div>');
    } else {
      rows.forEach(function (r) { B.push(_rowHtml(r)); });
    }

    //  ── 지도 (축 × 답)
    if (L.stats.bySt[2] + L.stats.bySt[3] > 0) B.push(_mapHtml(L.stats));

    //  ── 도구
    B.push('<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:5px">'
      + _tool('_qaCopyAsk()', '📋 질문 복사', '답 안 달린 질문을 붙여넣기용으로')
      + _tool('_qaExport(0)', '⬇ 백업', '전체 JSON')
      + _tool('_qaExport(1)', '📤 공개용', '답 달린 것만 · 예상 제외')
      + _tool('_qaImportPick()', '📥 가져오기', '답을 채운 파일을 되돌린다')
      + '</div>');
    B.push('<input type="file" id="qaImportFile" accept=".json,application/json" style="display:none" onchange="_qaImportFile(this)">');

    if (S.msg) B.push('<div id="sxQaMsg" style="margin-top:8px;font-size:10.5px;color:' + T2 + ';line-height:1.5">' + _esc(S.msg) + '</div>');

    B.push('<div style="margin-top:10px;padding-top:8px;border-top:1px dashed ' + BD + ';font-size:9.5px;color:' + T3 + ';line-height:1.55">'
      + '이 기기 브라우저에만 저장된다(서버·동기화 없음). 답은 <b>한 번 달리면 수정 불가</b> — '
      + '뒤집으려면 새 질문을 열고 앞의 것에 연결한다. 앞의 답은 지우지 않는다.'
      + '</div>');

    B.push('</div>');
    return wrap(head + B.join(''));
  }

  function _tool(fn, label, title) {
    return '<button onclick="' + fn + '" title="' + _esc(title) + '" style="flex:1 1 45%;padding:8px 4px;border-radius:7px;'
      + 'border:1px solid ' + BD + ';background:' + SF + ';color:' + T2 + ';font-size:10.5px;font-weight:700;cursor:pointer">' + label + '</button>';
  }

  function _formHtml() {
    var QA = window.SXQA, d = S.draft;
    var P = ['<div style="padding:10px;border-radius:9px;background:' + SF + ';border:1px dashed ' + BD + '">'];
    P.push('<textarea id="qaText" rows="3" placeholder="궁금한 걸 그대로. 다듬지 않아도 된다."'
      + ' style="width:100%;box-sizing:border-box;padding:8px;border-radius:7px;border:1px solid ' + BD + ';background:var(--surface);color:var(--text);font-size:12px;line-height:1.5;resize:vertical">' + _esc(d.text) + '</textarea>');

    P.push('<div style="margin-top:7px;font-size:9.5px;color:' + T3 + '">무엇을 묻나 — 이게 지도의 좌표가 된다</div>');
    P.push('<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">');
    Object.keys(QA.TAGS).forEach(function (k) {
      var on = d.tag === k;
      P.push('<button onclick="_qaDraft(\'tag\',\'' + k + '\')" title="' + _esc(QA.TAGS[k].desc) + '" style="padding:5px 9px;border-radius:6px;font-size:10.5px;font-weight:700;cursor:pointer;'
        + 'border:1px solid ' + (on ? 'var(--accent)' : BD) + ';background:' + (on ? 'var(--accent)' : 'var(--surface)') + ';color:' + (on ? '#fff' : T2) + '">' + QA.TAGS[k].name + '</button>');
    });
    P.push('</div>');

    var inp = function (id, ph, val) {
      return '<input id="' + id + '" placeholder="' + ph + '" value="' + _esc(val) + '" style="width:100%;box-sizing:border-box;margin-top:5px;padding:7px 8px;'
        + 'border-radius:6px;border:1px solid ' + BD + ';background:var(--surface);color:var(--text);font-size:11px">';
    };
    P.push(inp('qaTopics', '주제 (쉼표로 여러 개 · 선택)', d.topics));
    P.push(inp('qaSrc', '출처 — 어디서 봤나 (선택)', d.src));
    P.push(inp('qaQuote', '원문 인용 — 다듬지 말 것 (선택)', d.quote));

    if (d.code) {
      P.push('<div style="margin-top:6px;font-size:10px;color:' + T2 + '">📎 ' + _esc(d.name || d.code)
        + ' <span style="color:' + T3 + '">(' + _esc(d.code) + '/' + _esc(d.mkt || '?') + ')</span>'
        + ' <span onclick="_qaDraft(\'code\',\'\')" style="margin-left:6px;color:' + T3 + ';cursor:pointer">✕ 종목 떼기</span></div>');
    }

    //  예상 먼저 찍기 — 선택. 강제하면 적기가 귀찮아져서 게시판 자체를 안 쓰게 된다.
    P.push('<div style="margin-top:8px;font-size:9.5px;color:' + T3 + '">내 예상 (선택 · <b>한 번 찍으면 수정 불가</b>) — 답이 나왔을 때 "역시 알았다"를 봉인한다</div>');
    P.push('<div style="display:flex;gap:4px;margin-top:4px">');
    [['yes', '그렇다'], ['no', '아니다'], ['unsure', '모르겠다'], ['', '안 찍음']].forEach(function (g) {
      var on = d.guess === g[0];
      P.push('<button onclick="_qaDraft(\'guess\',\'' + g[0] + '\')" style="flex:1;padding:6px 2px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;'
        + 'border:1px solid ' + (on ? 'var(--accent)' : BD) + ';background:' + (on ? 'var(--accent)' : 'var(--surface)') + ';color:' + (on ? '#fff' : T2) + '">' + g[1] + '</button>');
    });
    P.push('</div>');

    P.push('<div style="display:flex;gap:5px;margin-top:9px">'
      + '<button onclick="_qaFormToggle()" style="flex:1;padding:8px;border-radius:7px;border:1px solid ' + BD + ';background:var(--surface);color:' + T2 + ';font-size:11px;font-weight:700;cursor:pointer">취소</button>'
      + '<button onclick="_qaAddSubmit()" style="flex:2;padding:8px;border-radius:7px;border:none;background:var(--accent);color:#fff;font-size:11.5px;font-weight:800;cursor:pointer">적어두기</button>'
      + '</div>');
    P.push('<div id="qaSimilar" style="margin-top:7px"></div>');
    P.push('</div>');
    return P.join('');
  }

  function _rowHtml(r) {
    var QA = window.SXQA, st = QA.ST[r.st] || {}, open = !!S.detail[r.id];
    var dep = (r.ans && QA.DEPTH[r.ans.depth]) ? QA.DEPTH[r.ans.depth] : null;

    var H = ['<div style="margin-bottom:6px;border:1px solid ' + BD + ';border-radius:8px;background:' + SF + ';overflow:hidden">'];
    H.push('<div onclick="_qaDetail(\'' + r.id + '\')" style="padding:8px 10px;cursor:pointer">');
    H.push('<div style="display:flex;align-items:flex-start;gap:5px">');
    H.push('<span style="font-size:11px;line-height:1.5">' + st.icon + '</span>');
    H.push('<span style="flex:1;font-size:11.5px;font-weight:700;line-height:1.5;color:var(--text)">' + _esc(r.text) + '</span>');
    H.push('</div>');
    var meta = [(QA.TAGS[r.tag] || {}).name || r.tag];
    if (r.code) meta.push(_esc(r.name || r.code));
    if (r.topics && r.topics.length) meta.push('#' + r.topics.map(_esc).join(' #'));
    meta.push(r.date);
    H.push('<div style="margin-top:3px;font-size:9.5px;color:' + T3 + '">' + meta.join(' · ')
      + (dep ? ' <span style="color:var(--accent);font-weight:800" title="답의 깊이 — ' + _esc(dep.desc) + '">' + dep.dots + ' ' + dep.name + '</span>' : '')
      + '</div>');
    H.push('</div>');

    if (open) {
      var D = ['<div style="padding:0 10px 10px;font-size:10.5px;line-height:1.6;color:' + T2 + '">'];
      if (r.src)   D.push('<div style="margin-top:2px"><b>출처</b> ' + _esc(r.src) + '</div>');
      if (r.quote) D.push('<div style="margin-top:2px;padding:6px 8px;border-left:2px solid ' + BD + ';color:' + T3 + '">' + _esc(r.quote) + '</div>');
      if (r.guess) D.push('<div style="margin-top:4px">내 예상 <b style="color:var(--accent)">'
        + ({ yes: '그렇다', no: '아니다', unsure: '모르겠다' })[r.guess] + '</b> · 잠김</div>');
      if (r.gate)  D.push('<div style="margin-top:4px"><b>게이트</b>(재기 전 선언) ' + _esc(r.gate) + '</div>');

      if (r.ans) {
        var vTxt = { yes: '🟢 그렇다', no: '⚫ 아니다', cant: '⚪ 못 잰다' }[r.ans.verdict] || r.ans.verdict;
        D.push('<div style="margin-top:7px;padding:8px 9px;border-radius:7px;background:var(--surface);border:1px solid ' + BD + '">');
        D.push('<div style="font-weight:800;color:var(--text)">A. ' + vTxt
          + (dep ? ' <span style="font-size:9.5px;color:var(--accent)">' + dep.dots + ' ' + dep.name + '</span>' : '') + '</div>');
        if (r.ans.nums) D.push('<div style="margin-top:3px">' + _esc(r.ans.nums) + '</div>');
        if (r.ans.note) D.push('<div style="margin-top:3px">' + _esc(r.ans.note) + '</div>');
        //  기각은 "화면에서 빼라"가 아니라 "모델 대신 나이브를 올려라" — 대체제가 그래서 있다.
        if (r.ans.alt) D.push('<div style="margin-top:4px;color:var(--accent);font-weight:700">→ 대신: ' + _esc(r.ans.alt) + '</div>');
        var f = [];
        if (r.ansDate) f.push(r.ansDate);
        if (r.ans.by) f.push(r.ans.by);
        if (r.gateMissing) f.push('⚠ 게이트 없이 답함');
        if (f.length) D.push('<div style="margin-top:4px;font-size:9px;color:' + T3 + '">' + _esc(f.join(' · ')) + '</div>');
        D.push('</div>');
      } else if (!r.guess) {
        D.push('<div style="margin-top:6px;display:flex;gap:4px">');
        [['yes', '그렇다'], ['no', '아니다'], ['unsure', '모르겠다']].forEach(function (g) {
          D.push('<button onclick="_qaGuess(\'' + r.id + '\',\'' + g[0] + '\')" style="flex:1;padding:6px 2px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;'
            + 'border:1px solid ' + BD + ';background:var(--surface);color:' + T2 + '">' + g[1] + '</button>');
        });
        D.push('</div><div style="margin-top:3px;font-size:9px;color:' + T3 + '">지금이라도 예상을 찍어둘 수 있다 — 한 번뿐이고 수정 불가</div>');
      }

      if (r.supersedes) D.push('<div style="margin-top:5px;font-size:9.5px;color:' + T3 + '">↺ 이 질문이 뒤집는 대상: ' + _esc(r.supersedes) + '</div>');
      D.push('<div style="margin-top:7px;font-size:9px;color:' + T3 + '">id ' + r.id
        + ' <span onclick="_qaRemove(\'' + r.id + '\')" style="margin-left:8px;cursor:pointer">🗑 지우기</span></div>');
      D.push('</div>');
      H.push(D.join(''));
    }
    H.push('</div>');
    return H.join('');
  }

  //  ★지도 — 축 × 답. 방향이 ⚫에 몰리고 크기가 🟢에 몰리면 그게 경계다.
  //    따로 그리는 게 아니라 게시판이 채워지면서 저절로 드러난다.
  function _mapHtml(g) {
    var QA = window.SXQA;
    var M = ['<div style="margin-top:12px;padding:9px 10px;border-radius:8px;border:1px solid ' + BD + ';background:' + SF + '">'];
    M.push('<div style="font-size:10.5px;font-weight:800;color:var(--text)">🗺 지도 — 무엇을 물으면 답이 나오나</div>');
    M.push('<div style="margin-top:6px;font-size:10px;color:' + T2 + '">');
    Object.keys(QA.TAGS).forEach(function (k) {
      var t = g.byTag[k]; if (!t.n) return;
      var yes = t[3] || 0, no = t[2] || 0, cant = t[4] || 0, open = (t[0] || 0) + (t[1] || 0);
      M.push('<div style="display:flex;gap:6px;padding:3px 0;border-top:1px dotted ' + BD + '">'
        + '<span style="width:34px;font-weight:700">' + QA.TAGS[k].name + '</span>'
        + '<span style="flex:1">' + (yes ? '🟢' + yes + ' ' : '') + (no ? '⚫' + no + ' ' : '')
        + (cant ? '⚪' + cant + ' ' : '') + (open ? '<span style="color:' + T3 + '">🔵' + open + '</span>' : '') + '</span></div>');
    });
    M.push('</div>');
    if (g.guessN >= 3) {
      M.push('<div style="margin-top:6px;padding-top:5px;border-top:1px dotted ' + BD + ';font-size:10px;color:' + T2 + '">'
        + '내 예상 적중 <b>' + g.guessHit + '/' + g.guessN + '</b> <span style="color:' + T3 + '">(모르겠다는 제외)</span></div>');
    }
    var dd = g.byDepth;
    if (dd[1] + dd[2] + dd[3] > 0) {
      M.push('<div style="margin-top:4px;font-size:10px;color:' + T2 + '">답의 깊이 '
        + '●○○ ' + dd[1] + ' · ●●○ ' + dd[2] + ' · ●●● ' + dd[3]
        + (dd.none ? ' <span style="color:' + T3 + '">(미표기 ' + dd.none + ')</span>' : '') + '</div>');
    }
    M.push('</div>');
    return M.join('');
  }

  // ─────────────────────────────────────────────────────────
  //  동작
  // ─────────────────────────────────────────────────────────
  function _refresh() {
    var el = document.getElementById('sxQaPanel'); if (!el) return;
    el.innerHTML = _qaPanelHtml();
    if (!window.SXQA || !S.open) return;
    Promise.all([window.SXQA.list({}), window.SXQA.stats()]).then(function (a) {
      S.last = { rows: a[0], stats: a[1] };
      var e2 = document.getElementById('sxQaPanel'); if (e2) e2.innerHTML = _qaPanelHtml();
    }).catch(function (e) { S.msg = '불러오기 실패: ' + ((e && e.message) || e); });
  }

  function _readForm() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    S.draft.text = g('qaText'); S.draft.topics = g('qaTopics');
    S.draft.src = g('qaSrc');   S.draft.quote = g('qaQuote');
  }

  window._qaPanelToggle = function () { _vib(8); S.open = !S.open; _refresh(); };
  window._qaPanelRefresh = _refresh;

  window._qaFormToggle = function () {
    _vib(6);
    if (S.formOpen) _readForm();
    S.formOpen = !S.formOpen;
    if (!S.formOpen) S.draft = { text: '', tag: 'etc', topics: '', src: '', quote: '', guess: '', mkt: '', code: '', name: '' };
    _refresh();
  };

  window._qaDraft = function (k, v) {
    _vib(5); _readForm();
    if (k === 'code' && v === '') { S.draft.code = ''; S.draft.name = ''; S.draft.mkt = ''; }
    else S.draft[k] = v;
    _refresh();
    if (k === 'tag') _showSimilar();
  };

  //  유사 질문 — 막지 않고 보여준다. 다시 물었다는 사실 자체가 신호다.
  function _showSimilar() {
    var el = document.getElementById('qaSimilar'); if (!el || !window.SXQA) return;
    if (!S.draft.text || S.draft.text.length < 4) { el.innerHTML = ''; return; }
    window.SXQA.similar(S.draft.text, S.draft.tag, 3).then(function (hits) {
      var e2 = document.getElementById('qaSimilar'); if (!e2) return;
      if (!hits.length) { e2.innerHTML = ''; return; }
      var H = ['<div style="padding:7px 8px;border-radius:6px;background:var(--surface);border:1px solid ' + BD + ';font-size:9.5px;color:' + T2 + '">'];
      H.push('<b>⚠ 비슷한 게 이미 있다</b> — 그래도 새로 물어도 된다(뒤집힐 수 있으니).');
      hits.forEach(function (h) {
        var st = window.SXQA.ST[h.rec.st] || {};
        H.push('<div style="margin-top:3px;color:' + T3 + '">' + st.icon + ' ' + _esc(h.rec.text)
          + (h.rec.ans ? ' → <b>' + ({ yes: '그렇다', no: '아니다', cant: '못 잼' })[h.rec.ans.verdict] + '</b>' : '') + '</div>');
      });
      H.push('</div>');
      e2.innerHTML = H.join('');
    }).catch(function () {});
  }

  window._qaAddSubmit = function () {
    _readForm();
    var d = S.draft;
    if (!d.text.trim()) { _toast('질문을 적어줘'); return; }
    _vib(12);
    window.SXQA.add({
      text: d.text, tag: d.tag,
      topics: d.topics ? d.topics.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [],
      src: d.src, quote: d.quote, guess: d.guess || null,
      mkt: d.mkt, code: d.code, name: d.name
    }).then(function () {
      S.formOpen = false;
      S.draft = { text: '', tag: 'etc', topics: '', src: '', quote: '', guess: '', mkt: '', code: '', name: '' };
      S.msg = '적어뒀다.'; _refresh();
    }).catch(function (e) { S.msg = '실패: ' + ((e && e.message) || e); _refresh(); });
  };

  window._qaDetail = function (id) { _vib(5); S.detail[id] = !S.detail[id]; _refresh(); };
  window._qaFilter = function (k, v) { _vib(5); S.filter[k] = v; _refresh(); };

  window._qaGuess = function (id, g) {
    _vib(12);
    window.SXQA.setGuess(id, g)
      .then(function () { S.msg = '예상 기록 · 잠김'; _refresh(); })
      .catch(function (e) { S.msg = ((e && e.message) || e); _refresh(); });
  };

  window._qaRemove = function (id) {
    if (!confirm('이 질문을 지운다. 되돌릴 수 없다.')) return;
    window.SXQA.remove(id).then(function () { delete S.detail[id]; S.msg = '지웠다.'; _refresh(); });
  };

  //  ── 붙여넣기용 복사 (모바일 주 경로)
  window._qaCopyAsk = function () {
    _vib(10);
    window.SXQA.askText({}).then(function (t) {
      var done = function () { S.msg = '복사됨 — 그대로 붙여넣으면 된다.'; _refresh(); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(done).catch(function () { _fallbackCopy(t, done); });
      } else _fallbackCopy(t, done);
    });
  };
  function _fallbackCopy(t, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); done();
    } catch (e) { S.msg = '복사 실패 — 백업 내보내기를 써줘'; _refresh(); }
  }

  window._qaExport = function (pub) {
    _vib(10);
    var p = pub ? window.SXQA.exportPublic() : window.SXQA.exportAll();
    p.then(function (o) {
      if (!o.n) { S.msg = pub ? '공개할 답이 아직 없다.' : '내보낼 게 없다.'; _refresh(); return; }
      var blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (pub ? 'sx_qa_public_' : 'sx_qa_backup_') + window.SXQA._d10() + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      S.msg = (pub ? '공개용' : '백업') + ' ' + o.n + '건 내보냄.'; _refresh();
    }).catch(function (e) { S.msg = '실패: ' + ((e && e.message) || e); _refresh(); });
  };

  window._qaImportPick = function () { var f = document.getElementById('qaImportFile'); if (f) f.click(); };
  window._qaImportFile = function (input) {
    var f = input && input.files && input.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var o; try { o = JSON.parse(rd.result); }
      catch (e) { S.msg = 'JSON 파싱 실패'; _refresh(); return; }
      window.SXQA.importAll(o).then(function (R) {
        S.msg = '새 질문 ' + R.added + ' · 답 착지 ' + R.answered + ' · 게이트 ' + R.gated
              + ' · 잠겨서 건너뜀 ' + R.locked + (R.bad ? ' · 형식오류 ' + R.bad : '');
        _refresh();
      }).catch(function (e) { S.msg = '가져오기 실패: ' + ((e && e.message) || e); _refresh(); });
    };
    rd.readAsText(f);
    input.value = '';
  };

  //  ── 분석탭 진입: 보던 종목을 붙여서 질문 폼을 연다.
  //    궁금증은 대부분 화면 앞에서 생긴다 — 그 자리에서 적을 수 있어야 샌 게 안 샌다.
  window._qaAskAbout = function (code, name, mkt) {
    _vib(10);
    S.open = true; S.formOpen = true;
    S.draft.code = code || ''; S.draft.name = name || '';
    S.draft.mkt = mkt || (typeof currentMarket !== 'undefined' ? currentMarket : '');
    _refresh();
    setTimeout(function () {
      var el = document.getElementById('sxQaPanel');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var t = document.getElementById('qaText'); if (t) t.focus();
    }, 60);
  };

  window._qaBoardButtonHtml = function (code, name) {
    return '<button onclick="_qaAskAbout(\'' + code + '\',\'' + String(name || '').replace(/'/g, "\\'") + '\')" '
      + 'style="padding:5px 9px;border-radius:6px;border:1px solid ' + BD + ';background:' + SF + ';color:' + T2
      + ';font-size:10px;font-weight:700;cursor:pointer">📋 질문 적기</button>';
  };

})();
