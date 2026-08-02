// ════════════════════════════════════════════════════════════
//  SIGNAL X — Q&A 게시판 UI (sx_qa_board_ui.js)
//  버전: v6 · [S1174] 깊이 배지 이름표 제거(점만) · [S1173] 분석탭 인라인 입력란(폼·초안 공유) · [S1171] 예상 찍기 제거 · [S1169] 헤더 치수 정렬 · [S1168] 축 편집 · v1 [S1167] 신설
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
    //  [S1173] 폼이 어디에 열렸나 — null | 'panel'(조건검색탭) | 'inline'(분석탭).
    //    불리언이 아니라 **어디**를 들고 있는 이유: 두 폼이 동시에 그려지면 id가 중복된다.
    formWhere: null,
    inlineStock: null,      // 분석탭이 보고 있는 종목 {code,name,mkt}
    draft: { text: '', tag: 'etc', topics: '', src: '', quote: '', mkt: '', code: '', name: '' },
    detail: {},         // id → 펼침 여부
    edit: {}            // [S1168] id → 메타 편집 열림 여부
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
      // [S1169] 껍데기·헤더 치수는 바로 위 예측 원장 패널과 맞춘다(radius 9 · padding 9/11 · 제목 11px · 화살표 10px ▼▶).
      //   나란히 놓인 두 패널이 서로 다른 치수를 쓰면 그것만으로 시선이 걸린다.
      return '<div style="margin:8px 0;border:1px solid ' + BD + ';border-radius:9px;background:var(--surface);overflow:hidden">' + inner + '</div>';
    };
    if (!QA) return wrap('<div style="padding:9px 11px;font-size:10px;color:' + T3 + '">📋 Q&amp;A 게시판 — sx_qa_board.js 미로드</div>');

    var L = S.last, n = L ? L.rows.length : 0;
    var open0 = L ? L.stats.bySt[0] : 0, ansN = L ? (L.stats.bySt[2] + L.stats.bySt[3] + L.stats.bySt[4]) : 0;

    var head = '<div onclick="_qaPanelToggle()" style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:9px 11px">'
      + '<span style="font-size:11px;font-weight:800;color:var(--text)">📋 Q&amp;A 게시판</span>'
      + (n ? '<span style="font-size:9.5px;color:' + T3 + '">🔵 ' + open0 + ' · 답 ' + ansN + '</span>' : '')
      + '<span style="margin-left:auto;font-size:10px;color:' + T3 + '">' + (S.open ? '▼' : '▶') + '</span>'
      + '</div>';
    if (!S.open) return wrap(head);

    var B = ['<div style="padding:0 12px 12px">'];

    B.push('<div style="font-size:10px;color:' + T3 + ';line-height:1.55;margin-bottom:8px">'
      + '궁금한 걸 <b>그대로</b> 적어둔다. 답이 없어도 된다 — 적어두지 않으면 다음에 또 궁금해진다.'
      + '</div>');

    //  ── 질문 적기
    if (S.formWhere !== 'panel') {
      B.push('<button onclick="_qaFormToggle(\'panel\')" style="width:100%;padding:9px;border-radius:8px;border:none;'
        + 'background:var(--accent);color:#fff;font-size:12px;font-weight:800;cursor:pointer">✍️ 질문 적기</button>');
      if (S.formWhere === 'inline') B.push('<div style="margin-top:5px;font-size:9.5px;color:' + T3 + '">'
        + '분석탭에서 적는 중이다 — 거기서 마치거나 취소할 것.</div>');
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

    //  [S1171] 예상 찍기 없음 — 질문한다는 건 모른다는 뜻이다. 찍기를 요구하면
    //    모르는 걸 안 적게 되고, 그게 게시판이 막으려던 누수다.

    P.push('<div style="display:flex;gap:5px;margin-top:9px">'
      + '<button onclick="_qaFormToggle()" style="flex:1;padding:8px;border-radius:7px;border:1px solid ' + BD + ';background:var(--surface);color:' + T2 + ';font-size:11px;font-weight:700;cursor:pointer">취소</button>'
      + '<button onclick="_qaAddSubmit()" style="flex:2;padding:8px;border-radius:7px;border:none;background:var(--accent);color:#fff;font-size:11.5px;font-weight:800;cursor:pointer">적어두기</button>'
      + '</div>');
    P.push('<div id="qaSimilar" style="margin-top:7px"></div>');
    P.push('</div>');
    return P.join('');
  }

  //  [S1173] 분석탭 인라인 — **입력란만.** 목록·필터·지도·도구는 조건검색탭에만 둔다.
  //    단일종목 화면에서 목록까지 보여주면 같은 걸 두 군데서 보는 중복이 되고,
  //    무엇보다 이 자리에 필요한 건 '보는 것'이 아니라 '적는 것'이다.
  window._qaInlineHtml = function (code, name, mkt) {
    var QA = window.SXQA;
    if (!QA) return '';
    //  보던 종목이 바뀌면 초안을 버린다 — 다른 종목의 질문이 딸려가면 안 된다.
    var cur = S.inlineStock;
    if (!cur || cur.code !== code) {
      if (S.formWhere === 'inline') { S.formWhere = null; _resetDraft(); }
      S.inlineStock = { code: code, name: name,
                        mkt: mkt || (typeof currentMarket !== 'undefined' ? currentMarket : '') };
    } else if (mkt && cur.mkt !== mkt) {
      cur.mkt = mkt;                     // 같은 코드인데 시장만 갱신된 경우
    }
    var box = function (inner) {
      return '<div style="margin:0 0 10px;padding:9px 11px;border-radius:9px;background:var(--surface);'
        + 'border:1px dashed ' + BD + '">' + inner + '</div>';
    };
    if (S.formWhere === 'inline') {
      return box('<div style="font-size:10px;color:' + T3 + ';margin-bottom:7px">'
        + '📋 Q&amp;A 게시판에 적는다 — 목록과 답은 <b>조건검색탭</b>에서 본다.</div>' + _formHtml());
    }
    var msg = (S.msg && S.lastAddedInline)
      ? '<div style="margin-top:5px;font-size:9.5px;color:var(--accent);font-weight:700">' + _esc(S.msg) + '</div>' : '';
    return box('<div style="display:flex;align-items:center;gap:7px">'
      + '<span style="font-size:10.5px;color:' + T3 + ';flex:1;line-height:1.5">'
      +   '이 종목을 보다 궁금한 게 생겼다면 — 적어두지 않으면 다음에 또 궁금해진다.</span>'
      + '<button onclick="_qaFormToggle(\'inline\')" style="flex-shrink:0;padding:6px 10px;border-radius:7px;'
      +   'border:1px solid ' + BD + ';background:' + SF + ';color:' + T2 + ';font-size:10.5px;font-weight:700;'
      +   'cursor:pointer">📋 질문 적기</button></div>' + msg);
  };

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
      + (dep ? ' <span style="color:var(--accent);font-weight:800" title="답의 깊이 — ' + _esc(dep.desc) + '">' + dep.dots + '</span>' : '')
      + '</div>');
    H.push('</div>');

    if (open) {
      var D = ['<div style="padding:0 10px 10px;font-size:10.5px;line-height:1.6;color:' + T2 + '">'];
      if (r.src)   D.push('<div style="margin-top:2px"><b>출처</b> ' + _esc(r.src) + '</div>');
      if (r.quote) D.push('<div style="margin-top:2px;padding:6px 8px;border-left:2px solid ' + BD + ';color:' + T3 + '">' + _esc(r.quote) + '</div>');
      //  [S1171] 옛 레코드에 남은 guess는 표시하지 않는다(지우지도 않는다 — 사용자가 남긴 기록이다).
      if (r.gate)  D.push('<div style="margin-top:4px"><b>게이트</b>(재기 전 선언) ' + _esc(r.gate) + '</div>');

      if (r.ans) {
        var vTxt = { yes: '🟢 그렇다', no: '⚫ 아니다', cant: '⚪ 못 잰다' }[r.ans.verdict] || r.ans.verdict;
        D.push('<div style="margin-top:7px;padding:8px 9px;border-radius:7px;background:var(--surface);border:1px solid ' + BD + '">');
        D.push('<div style="font-weight:800;color:var(--text)">A. ' + vTxt
          + (dep ? ' <span style="font-size:9.5px;color:var(--accent)" title="' + _esc(dep.desc) + '">' + dep.dots + '</span>' : '') + '</div>');
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
      }

      //  [S1168] 축·주제·출처 고치기 — **답이 달리기 전까지만.**
      //    질문의 뜻(text)이 아니라 분류라서 열어둔다. 처음 적을 때 축을 잘못 고르는 건 흔하고
      //    ('평소와 다르게 급등' → 기타로 넣었지만 실은 크기), 축이 틀리면 지도가 거짓말을 한다.
      //    ★text는 여기서 못 건드린다 — 그건 코어가 막는다(editText 불변식).
      if (!r.ans) {
        var ed = !!S.edit[r.id];
        if (!ed) {
          D.push('<div style="margin-top:6px"><span onclick="_qaEdit(\'' + r.id + '\')" '
            + 'style="font-size:9.5px;color:' + T3 + ';cursor:pointer">✏️ 축·주제·출처 고치기</span></div>');
        } else {
          D.push('<div style="margin-top:7px;padding:8px 9px;border-radius:7px;background:var(--surface);border:1px dashed ' + BD + '">');
          D.push('<div style="font-size:9.5px;color:' + T3 + '">무엇을 묻나 — 축이 틀리면 지도가 거짓말을 한다</div>');
          D.push('<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">');
          Object.keys(QA.TAGS).forEach(function (k) {
            var on = r.tag === k;
            D.push('<button onclick="_qaSetTag(\'' + r.id + '\',\'' + k + '\')" title="' + _esc(QA.TAGS[k].desc) + '" '
              + 'style="padding:5px 9px;border-radius:6px;font-size:10.5px;font-weight:700;cursor:pointer;border:1px solid '
              + (on ? 'var(--accent)' : BD) + ';background:' + (on ? 'var(--accent)' : SF) + ';color:' + (on ? '#fff' : T2) + '">'
              + QA.TAGS[k].name + '</button>');
          });
          D.push('</div>');
          var ei = function (id, ph, val) {
            return '<input id="' + id + '" placeholder="' + ph + '" value="' + _esc(val || '') + '" '
              + 'style="width:100%;box-sizing:border-box;margin-top:5px;padding:7px 8px;border-radius:6px;border:1px solid '
              + BD + ';background:' + SF + ';color:var(--text);font-size:11px">';
          };
          D.push(ei('qaEdTopics_' + r.id, '주제 (쉼표로 여러 개)', (r.topics || []).join(', ')));
          D.push(ei('qaEdSrc_' + r.id, '출처 — 어디서 봤나', r.src));
          D.push(ei('qaEdQuote_' + r.id, '원문 인용 — 다듬지 말 것', r.quote));
          D.push('<div style="display:flex;gap:5px;margin-top:7px">'
            + '<button onclick="_qaEdit(\'' + r.id + '\')" style="flex:1;padding:7px;border-radius:6px;border:1px solid ' + BD
            + ';background:' + SF + ';color:' + T2 + ';font-size:10.5px;font-weight:700;cursor:pointer">닫기</button>'
            + '<button onclick="_qaSaveMeta(\'' + r.id + '\')" style="flex:2;padding:7px;border-radius:6px;border:none;'
            + 'background:var(--accent);color:#fff;font-size:10.5px;font-weight:800;cursor:pointer">저장</button>'
            + '</div>');
          D.push('<div style="margin-top:5px;font-size:9px;color:' + T3 + '">질문 원문은 여기서 못 고친다 — 그건 잠긴다.</div>');
          D.push('</div>');
        }
      }

      if (r.supersedes) D.push('<div style="margin-top:5px;font-size:9.5px;color:' + T3 + '">↺ 이 질문이 뒤집는 대상: ' + _esc(r.supersedes) + '</div>');

      //  [S1168] 축 변경 — 답이 달리기 **전**까지만. 축은 질문의 뜻이 아니라 분류라서,
      //    적을 때 잘못 고른 걸 나중에 바로잡을 수 있어야 한다. 안 그러면 지도가 틀린 채로 굳는다.
      //    (질문 원문·예상·게이트·답은 여전히 못 고친다 — 그건 분류가 아니라 내용이다.)
      if (!r.ans) {
        D.push('<div style="margin-top:8px;padding-top:7px;border-top:1px dotted ' + BD + '">');
        D.push('<div style="font-size:9px;color:' + T3 + '">축 바꾸기 — 지도 좌표라 맞게 두는 게 낫다</div>');
        D.push('<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">');
        Object.keys(QA.TAGS).forEach(function (k) {
          var on = r.tag === k;
          D.push('<button onclick="_qaSetTag(\'' + r.id + '\',\'' + k + '\')" title="' + _esc(QA.TAGS[k].desc) + '" '
            + 'style="padding:4px 8px;border-radius:6px;font-size:9.5px;font-weight:700;cursor:pointer;'
            + 'border:1px solid ' + (on ? 'var(--accent)' : BD) + ';background:' + (on ? 'var(--accent)' : 'var(--surface)')
            + ';color:' + (on ? '#fff' : T2) + '">' + QA.TAGS[k].name + '</button>');
        });
        D.push('</div></div>');
      }
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
  //  [S1173] 마운트가 둘이다 — #sxQaPanel(조건검색탭) · #sxQaInline(분석탭).
  //    둘 중 하나만 DOM에 있을 수도 있으므로 각각 존재할 때만 그린다.
  function _paint() {
    var p = document.getElementById('sxQaPanel');
    if (p) p.innerHTML = _qaPanelHtml();
    var i = document.getElementById('sxQaInline');
    if (i && S.inlineStock) i.innerHTML = window._qaInlineHtml(
      S.inlineStock.code, S.inlineStock.name, S.inlineStock.mkt);
  }

  function _refresh() {
    _paint();
    if (!window.SXQA || !S.open) return;
    Promise.all([window.SXQA.list({}), window.SXQA.stats()]).then(function (a) {
      S.last = { rows: a[0], stats: a[1] };
      _paint();
    }).catch(function (e) { S.msg = '불러오기 실패: ' + ((e && e.message) || e); });
  }

  function _resetDraft() {
    S.draft = { text: '', tag: 'etc', topics: '', src: '', quote: '', mkt: '', code: '', name: '' };
  }

  function _readForm() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    S.draft.text = g('qaText'); S.draft.topics = g('qaTopics');
    S.draft.src = g('qaSrc');   S.draft.quote = g('qaQuote');
  }

  window._qaPanelToggle = function () { _vib(8); S.open = !S.open; _refresh(); };
  window._qaPanelRefresh = _refresh;

  window._qaFormToggle = function (where) {
    _vib(6);
    where = where || 'panel';
    if (S.formWhere) _readForm();
    if (S.formWhere === where) {            // 같은 자리 다시 누름 = 닫기
      S.formWhere = null; _resetDraft();
    } else {
      S.formWhere = where;
      S.lastAddedInline = false;
      if (where === 'inline' && S.inlineStock) {
        S.draft.code = S.inlineStock.code;
        S.draft.name = S.inlineStock.name;
        S.draft.mkt = S.inlineStock.mkt
          || (typeof currentMarket !== 'undefined' ? currentMarket : '');
      }
    }
    S.msg = '';
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
      src: d.src, quote: d.quote,
      mkt: d.mkt, code: d.code, name: d.name
    }).then(function () {
      S.lastAddedInline = (S.formWhere === 'inline');
      S.formWhere = null;
      _resetDraft();
      S.msg = S.lastAddedInline ? '적어뒀다 — 목록은 조건검색탭 게시판에서.' : '적어뒀다.';
      _refresh();
    }).catch(function (e) { S.msg = '실패: ' + ((e && e.message) || e); _refresh(); });
  };

  window._qaDetail = function (id) { _vib(5); S.detail[id] = !S.detail[id]; if (!S.detail[id]) delete S.edit[id]; _refresh(); };

  //  [S1168] 메타 편집 — 축은 즉시 저장(버튼 누른 게 곧 선택), 텍스트 3종은 저장 버튼으로.
  window._qaEdit = function (id) { _vib(5); S.edit[id] = !S.edit[id]; _refresh(); };

  window._qaSetTag = function (id, tag) {
    _vib(8);
    window.SXQA.setMeta(id, { tag: tag })
      .then(function () { S.msg = '축을 ' + ((window.SXQA.TAGS[tag] || {}).name || tag) + '(으)로 옮겼다.'; _refresh(); })
      .catch(function (e) { S.msg = ((e && e.message) || e); _refresh(); });
  };

  window._qaSaveMeta = function (id) {
    var g = function (p) { var e = document.getElementById(p + id); return e ? e.value : undefined; };
    var tp = g('qaEdTopics_'), sc = g('qaEdSrc_'), qt = g('qaEdQuote_');
    _vib(10);
    window.SXQA.setMeta(id, {
      topics: tp === undefined ? undefined : tp.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      src: sc, quote: qt
    }).then(function () { delete S.edit[id]; S.msg = '고쳤다.'; _refresh(); })
      .catch(function (e) { S.msg = ((e && e.message) || e); _refresh(); });
  };
  window._qaFilter = function (k, v) { _vib(5); S.filter[k] = v; _refresh(); };

  window._qaSetTag = function (id, tag) {
    _vib(8);
    window.SXQA.setMeta(id, { tag: tag })
      .then(function () { S.msg = '축을 ' + (window.SXQA.TAGS[tag] || {}).name + '(으)로 바꿨다.'; _refresh(); })
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
  //  [S1173] 분석탭에서 부르면 **그 자리에서** 연다. 이전엔 다른 탭의 패널로 스크롤하려 해서
  //    아무 일도 일어나지 않는 것처럼 보였다(탭 전환을 안 했으므로).
  window._qaAskAbout = function (code, name, mkt) {
    _vib(10);
    S.inlineStock = { code: code || '', name: name || '',
                      mkt: mkt || (typeof currentMarket !== 'undefined' ? currentMarket : '') };
    S.formWhere = null;
    window._qaFormToggle('inline');
    setTimeout(function () { var t = document.getElementById('qaText'); if (t) t.focus(); }, 60);
  };

  //  [S1173] ★S.inlineStock을 여기서 먼저 덮어쓰면 안 된다 —
  //    _qaInlineHtml 안의 '종목이 바뀌었나' 비교가 영원히 참이 되어 초안 폐기가 안 걸린다.
  //    (실제로 그렇게 짰다가 종목을 넘겨도 이전 종목 초안이 남는 버그가 났다.)
  //    판정은 _qaInlineHtml 한 곳에서만 한다.
  window._qaInlineMount = function (code, name, mkt) {
    return window._qaInlineHtml(code || '', name || '',
      mkt || (typeof currentMarket !== 'undefined' ? currentMarket : ''));
  };

  window._qaBoardButtonHtml = function (code, name) {
    return '<button onclick="_qaAskAbout(\'' + code + '\',\'' + String(name || '').replace(/'/g, "\\'") + '\')" '
      + 'style="padding:5px 9px;border-radius:6px;border:1px solid ' + BD + ';background:' + SF + ';color:' + T2
      + ';font-size:10px;font-weight:700;cursor:pointer">📋 질문 적기</button>';
  };

})();
