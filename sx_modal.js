// ============================================================
//  [S224] 모바일 친화 모달 — sxConfirm / sxAlert
//  목적: 네이티브 alert/confirm 대체 (모바일 UX 개선)
//  특징:
//    · Promise 반환 (await 사용 가능)
//    · 진동 피드백 + ESC 키 지원
//    · 동적 DOM 생성 → 닫을 때 완전 제거 (메모리 누수 방지)
//    · 다중 호출 안전 (각 인스턴스 독립)
//    · index.html / sx_screener.html 양쪽에서 공용 사용
//
//  [S224-fix4] 단일 닫기 경로 — 모든 닫기 동작이 history.back()으로 통일
//    버튼 클릭 / ESC / 뒤로가기 / popstate 모두 →
//    ① 결과 변수에 저장
//    ② history.back() 호출 (이미 popstate면 skip)
//    ③ popstate 핸들러가 모달 DOM 제거 + Promise resolve
//
//    이유: 클릭 이벤트로 모달을 즉시 제거하면 모바일에서 ghost click(합성 이벤트)이
//    동일 좌표의 뒤 요소(하단 탭 버튼 등)로 전파되어 의도치 않은 액션 발생.
//    뒤로가기 경로는 click 이벤트와 무관하므로 ghost click 자체가 발생하지 않음.
//
//  사용처: sx_storage.js / index.html / sx_screener.html / sx_render.js / 기타 sx_*.js
// ============================================================
(function(global){
  'use strict';

  function _sxModal(opts){
    return new Promise(function(resolve){
      var existing = document.getElementById('sxModalOverlay');
      if(existing) existing.remove();

      var ov = document.createElement('div');
      ov.id = 'sxModalOverlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(2px);';

      var box = document.createElement('div');
      box.style.cssText = 'background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:18px 16px 14px;max-width:340px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.5);font-family:-apple-system,sans-serif;';

      var msgEl = document.createElement('div');
      msgEl.style.cssText = 'font-size:13px;line-height:1.55;color:var(--text);white-space:pre-wrap;word-break:keep-all;margin-bottom:14px;';
      msgEl.textContent = opts.message || '';
      box.appendChild(msgEl);

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

      // [S224-fix4] 단일 닫기 경로
      //   _result: 사용자 의도(true/false)를 저장만
      //   _settled: 한 번만 resolve 되도록 가드
      //   _resolveBack(): 결과 저장 + history.back() 호출 → popstate가 닫음
      //   popstate 핸들러: 모달 제거 + Promise resolve
      var _result = false;
      var _settled = false;

      function _resolveBack(result){
        if(_settled) return;
        _result = !!result;
        try{ history.back(); }catch(e){
          // history.back 실패 폴백 — 직접 정리
          _doClose();
        }
      }

      function _doClose(){
        if(_settled) return;
        _settled = true;
        document.removeEventListener('keydown', _onKey);
        try{ ov.remove(); }catch(_){}
        resolve(_result);
      }

      function _onKey(e){
        if(e.key === 'Escape'){ e.preventDefault(); _resolveBack(false); }
        else if(e.key === 'Enter' && opts.type === 'alert'){ e.preventDefault(); _resolveBack(true); }
      }

      function _vib(ms){
        try{
          if(typeof _sxVib === 'function'){ _sxVib(ms); return; }
          if(typeof SX !== 'undefined' && SX._vib){ SX._vib(ms); return; }
          if(navigator.vibrate) navigator.vibrate(ms);
        }catch(_){}
      }

      if(opts.type === 'confirm'){
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = opts.cancelText || '취소';
        cancelBtn.style.cssText = 'flex:1;padding:10px 14px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;';
        // [S224-fix4] 클릭 시 결과만 저장하고 history.back() 호출
        //   모달 제거는 popstate에서 일어나므로 합성 ghost click이 뒤 요소로 새지 않음
        cancelBtn.onclick = function(e){
          e.stopPropagation();
          e.preventDefault();
          _vib(8);
          _resolveBack(false);
        };
        btnRow.appendChild(cancelBtn);
      }

      var okBtn = document.createElement('button');
      okBtn.textContent = opts.confirmText || (opts.type === 'confirm' ? '확인' : 'OK');
      okBtn.style.cssText = 'flex:1;padding:10px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;';
      okBtn.onclick = function(e){
        e.stopPropagation();
        e.preventDefault();
        _vib(10);
        _resolveBack(true);
      };
      btnRow.appendChild(okBtn);

      box.appendChild(btnRow);
      ov.appendChild(box);

      // [S224-fix2] 백드롭 클릭 비활성 — 흡수만
      ov.addEventListener('pointerdown', function(e){
        if(e.target === ov) e.stopPropagation();
      });
      ov.addEventListener('click', function(e){
        if(e.target === ov){ e.stopPropagation(); e.preventDefault(); }
      });

      document.body.appendChild(ov);
      document.addEventListener('keydown', _onKey);

      // pushState로 history 진입
      try{ history.pushState({view:'sxModal'}, ''); }catch(_){}

      // popstate = 단일 닫기 경로 (버튼/ESC/뒤로가기 모두 수렴)
      ov._popHandler = function(){
        _doClose(); // _result는 _resolveBack에서 미리 저장 (직접 뒤로가기인 경우 기본 false)
      };
      window.addEventListener('popstate', ov._popHandler, {once:true});

      _vib(8);
      setTimeout(function(){ try{ okBtn.focus(); }catch(_){} }, 50);
    });
  }

  function sxAlert(message, opts){
    opts = opts || {};
    return _sxModal({
      type:'alert',
      message:message,
      confirmText:opts.confirmText || '확인'
    });
  }

  function sxConfirm(message, opts){
    opts = opts || {};
    return _sxModal({
      type:'confirm',
      message:message,
      confirmText:opts.confirmText || '확인',
      cancelText:opts.cancelText || '취소'
    });
  }

  global.sxAlert = sxAlert;
  global.sxConfirm = sxConfirm;
  global._sxModal = _sxModal;

  // ============================================================
  //  [S225] HTML escape 헬퍼 — XSS 방지
  //  사용처: innerHTML에 외부 데이터(종목명·에러메시지·사용자 입력 등) 삽입 시
  //  특징:
  //    · 5종 핵심 문자(& < > " ')만 처리 — 짧고 빠름
  //    · null/undefined → 빈 문자열 (안전한 기본값)
  //    · index.html / sx_screener.html 양쪽에서 공용 사용
  //  대안 검토:
  //    · DOMPurify 같은 외부 라이브러리: overkill (종목명 정도 처리에 불필요)
  //    · textContent 직접 사용: 기존 innerHTML 코드 대량 재작성 필요
  //    · trusted-types: 브라우저 호환성 + 큰 변경 → 채택 안 함
  // ============================================================
  function _sxEsc(s){
    if(s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  global._sxEsc = _sxEsc;
  // 주의: 기존 sx_screener.html / sx_optimizer.js에 _esc()가 이미 정의됨 (작은따옴표 escape 누락)
  //   → window._esc 별칭 미생성 (기존 정의와 충돌 회피)
  //   → 새로 작성하는 코드는 _sxEsc 사용 권장 (5종 모두 escape)

})(typeof window !== 'undefined' ? window : globalThis);
