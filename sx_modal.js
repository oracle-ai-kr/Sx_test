// ============================================================
//  [S224] 모바일 친화 모달 — sxConfirm / sxAlert
//  목적: 네이티브 alert/confirm 대체 (모바일 UX 개선)
//  특징:
//    · Promise 반환 (await 사용 가능)
//    · 백드롭/취소 버튼/뒤로가기 모두 false 반환 (sxConfirm)
//    · 진동 피드백 + ESC 키 지원
//    · 동적 DOM 생성 → 닫을 때 완전 제거 (메모리 누수 방지)
//    · 다중 호출 안전 (각 인스턴스 독립)
//    · index.html / sx_screener.html 양쪽에서 공용 사용
//  사용처: sx_storage.js / index.html / sx_screener.html / sx_render.js / 기타 sx_*.js
// ============================================================
(function(global){
  'use strict';

  function _sxModal(opts){
    // opts: {title, message, confirmText, cancelText, type:'confirm'|'alert', onClose}
    return new Promise(function(resolve){
      var existing = document.getElementById('sxModalOverlay');
      if(existing) existing.remove(); // 중복 방지

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

      var _hist = false;
      function _close(result){
        if(ov._closed) return;
        ov._closed = true;
        document.removeEventListener('keydown', _onKey);

        // [S224-fix3] ghost click 차단 — 모달 제거 후 같은 좌표의 뒤 요소(하단 탭 버튼 등)에
        //   합성 click이 전달되는 것을 방지. 버튼 클릭/백드롭 클릭/ESC/뒤로가기 모든 닫기 경로에 적용.
        //   원인: 모바일에서 touchend → mousedown → mouseup → click 시퀀스 도중 모달이 사라지면,
        //         후속 이벤트가 그 자리의 뒤 요소로 새서 의도치 않은 액션(탭 전환 등) 발생.
        //   대책: document capture 단계에서 350ms 동안 click/mousedown/mouseup/touchend 흡수.
        var _killGhost = function(ev){
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener('click', _killGhost, true);
        document.addEventListener('mousedown', _killGhost, true);
        document.addEventListener('mouseup', _killGhost, true);
        document.addEventListener('touchend', _killGhost, true);
        setTimeout(function(){
          document.removeEventListener('click', _killGhost, true);
          document.removeEventListener('mousedown', _killGhost, true);
          document.removeEventListener('mouseup', _killGhost, true);
          document.removeEventListener('touchend', _killGhost, true);
        }, 400);

        try{ ov.remove(); }catch(_){}
        // history 정리: pushState한 경우 popstate가 아닌 직접 닫기에서만 back
        if(_hist && !ov._fromPopstate){
          try{ history.back(); }catch(_){}
        }
        resolve(result);
      }
      function _onKey(e){
        if(e.key === 'Escape'){ e.preventDefault(); _close(false); }
        else if(e.key === 'Enter' && opts.type === 'alert'){ e.preventDefault(); _close(true); }
      }

      // 진동 헬퍼 — _sxVib(스크리너) / SX._vib(인덱스) 양쪽 호환
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
        cancelBtn.onclick = function(){ _vib(8); _close(false); };
        btnRow.appendChild(cancelBtn);
      }

      var okBtn = document.createElement('button');
      okBtn.textContent = opts.confirmText || (opts.type === 'confirm' ? '확인' : 'OK');
      okBtn.style.cssText = 'flex:1;padding:10px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;';
      okBtn.onclick = function(){ _vib(10); _close(true); };
      btnRow.appendChild(okBtn);

      box.appendChild(btnRow);
      ov.appendChild(box);

      // [S224-fix2] 백드롭 클릭 핸들러 제거 — 모바일 ghost click 문제 + 사용자 의도 모호
      //   닫기 방법: 취소/확인 버튼 · ESC · 뒤로가기 (모두 명확한 의도)
      //   백드롭은 단순히 시각적 분리 + 다른 UI 차단 역할만 수행
      //
      // [참고] 백드롭 위에서 발생한 일반 클릭이 뒤 요소로 새는 것도 방지하기 위해
      //   pointerdown/click 모두 stopPropagation으로 흡수만 한다 (close는 안 함)
      ov.addEventListener('pointerdown', function(e){
        if(e.target === ov) e.stopPropagation();
      });
      ov.addEventListener('click', function(e){
        if(e.target === ov){ e.stopPropagation(); e.preventDefault(); }
      });

      document.body.appendChild(ov);
      document.addEventListener('keydown', _onKey);

      // 뒤로가기 처리 — pushState 후 popstate에서 _close(false)
      try{
        history.pushState({view:'sxModal'}, '');
        _hist = true;
      }catch(_){}

      // popstate 발생 시 모달 닫기 (외부 popstate 핸들러보다 먼저 처리되도록)
      ov._popHandler = function(){ ov._fromPopstate = true; _close(false); };
      window.addEventListener('popstate', ov._popHandler, {once:true});

      // 진입 진동
      _vib(8);
      // 첫 버튼 포커스 (Enter 즉시 동작)
      setTimeout(function(){ try{ okBtn.focus(); }catch(_){} }, 50);
    });
  }

  // alert 대체 — Promise 반환 (await 가능, 무시해도 OK)
  function sxAlert(message, opts){
    opts = opts || {};
    return _sxModal({
      type:'alert',
      message:message,
      confirmText:opts.confirmText || '확인'
    });
  }

  // confirm 대체 — Promise<boolean> 반환 (await 필요)
  function sxConfirm(message, opts){
    opts = opts || {};
    return _sxModal({
      type:'confirm',
      message:message,
      confirmText:opts.confirmText || '확인',
      cancelText:opts.cancelText || '취소'
    });
  }

  // 글로벌 노출
  global.sxAlert = sxAlert;
  global.sxConfirm = sxConfirm;
  global._sxModal = _sxModal;

  // popstate 핸들러 — 다른 모달 핸들러보다 먼저 sxModal 처리해야 충돌 방지
  // 이미 _popHandler(once:true)가 직접 처리하므로, 여기서는 sxModal이 떠있으면 다른 모달 처리만 차단
  //   ※ 이 핸들러는 가장 먼저 등록되어야 한다 (sx_screener.html의 큰 popstate 핸들러보다 먼저)
  //   index.html은 자체 popstate 핸들러가 단순해서 충돌 영향 적음
  // 주의: 이 코드 자체는 중복 등록되지 않음 (IIFE 내부)
})(typeof window !== 'undefined' ? window : globalThis);
