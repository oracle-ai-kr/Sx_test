// ════════════════════════════════════════════════════════════════
// SIGNAL X — 알림 소리 시스템 (Web Audio API 기반 6종 beep tone)
// ────────────────────────────────────────────────────────────────
//  분리: 2026-05-09 [A1-Layer1] sx_screener.html → sx_alert_sound.js
//        ~110줄, 외부 의존성 매우 낮음 (Web Audio API + localStorage만)
//
//  의존성:
//    - 전역 함수: _sxVib (진동, sx_screener.html)
//    - 전역 변수: STORAGE_KEYS (sx_screener.html에서 노출)
//    - DOM: #soundToggle, #soundSelect (sx_screener.html 설정탭)
//    - 브라우저 API: AudioContext, localStorage
//
//  로드 순서: sx_screener.html에서 다른 모듈보다 먼저 로드 가능
//            (외부 함수 의존이 _sxVib뿐 — 그건 sx_screener.html 인라인이라 항상 먼저 정의됨)
//
//  공개 함수 (모두 window 글로벌):
//    saveSoundSetting()    — 토글/소리 인덱스 저장
//    loadSoundSetting()    — 페이지 로드 시 UI 동기화
//    previewAlertSound()   — 미리듣기
//    playAlertSound()      — 스캔 중 신규 종목 발견 시 호출
//
//  내부 함수 (필요 시 외부에서도 호출 가능 — window에 노출됨):
//    _getAudioCtx()
//    _beepSimple/_beepDouble/_beepRise/_beepCoin/_beepSoftBell/_beepTriple
// ════════════════════════════════════════════════════════════════

// ============================================================
//  S34: 알림 소리 (Web Audio API — 6종 beep tone)
// ============================================================
let _sxAudioCtx = null;
function _getAudioCtx(){
  if(!_sxAudioCtx) _sxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(_sxAudioCtx.state === 'suspended') _sxAudioCtx.resume();
  return _sxAudioCtx;
}

const SX_ALERT_SOUNDS = [
  { name:'단순 비프', fn: _beepSimple },
  { name:'이중 비프', fn: _beepDouble },
  { name:'상승 톤',  fn: _beepRise },
  { name:'코인 효과', fn: _beepCoin },
  { name:'소프트 벨', fn: _beepSoftBell },
  { name:'경고 3연타', fn: _beepTriple }
];

/* 0: 단순 비프 — 880Hz 80ms */
function _beepSimple(){
  const c=_getAudioCtx(), o=c.createOscillator(), g=c.createGain();
  o.type='sine'; o.frequency.value=880;
  g.gain.setValueAtTime(0.3,c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.08);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime); o.stop(c.currentTime+0.08);
}
/* 1: 이중 비프 — 880Hz x2 */
function _beepDouble(){
  const c=_getAudioCtx();
  [0,0.12].forEach(d=>{
    const o=c.createOscillator(), g=c.createGain();
    o.type='sine'; o.frequency.value=880;
    g.gain.setValueAtTime(0.25,c.currentTime+d);
    g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d+0.07);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime+d); o.stop(c.currentTime+d+0.07);
  });
}
/* 2: 상승 톤 — 440→880 sweep 150ms */
function _beepRise(){
  const c=_getAudioCtx(), o=c.createOscillator(), g=c.createGain();
  o.type='sine'; o.frequency.setValueAtTime(440,c.currentTime);
  o.frequency.exponentialRampToValueAtTime(880,c.currentTime+0.15);
  g.gain.setValueAtTime(0.3,c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.18);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime); o.stop(c.currentTime+0.18);
}
/* 3: 코인 효과 — 1200→1800 빠른 sweep */
function _beepCoin(){
  const c=_getAudioCtx(), o=c.createOscillator(), g=c.createGain();
  o.type='square'; o.frequency.setValueAtTime(1200,c.currentTime);
  o.frequency.exponentialRampToValueAtTime(1800,c.currentTime+0.06);
  o.frequency.exponentialRampToValueAtTime(1400,c.currentTime+0.12);
  g.gain.setValueAtTime(0.15,c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.15);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime); o.stop(c.currentTime+0.15);
}
/* 4: 소프트 벨 — 삼각파 660Hz + 느린 페이드 */
function _beepSoftBell(){
  const c=_getAudioCtx(), o=c.createOscillator(), g=c.createGain();
  o.type='triangle'; o.frequency.value=660;
  g.gain.setValueAtTime(0.35,c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.35);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime); o.stop(c.currentTime+0.35);
}
/* 5: 경고 3연타 — 1000Hz x3 빠르게 */
function _beepTriple(){
  const c=_getAudioCtx();
  [0,0.09,0.18].forEach(d=>{
    const o=c.createOscillator(), g=c.createGain();
    o.type='sine'; o.frequency.value=1000;
    g.gain.setValueAtTime(0.25,c.currentTime+d);
    g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d+0.06);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime+d); o.stop(c.currentTime+d+0.06);
  });
}

/* 설정 저장/로드 */
function saveSoundSetting(){
  if(typeof _sxVib === 'function') _sxVib(8); // S103: 알림 소리 토글
  const on = document.getElementById('soundToggle').checked;
  const idx = document.getElementById('soundSelect').value;
  // S138 [FIX-#5]: 2건 묶음 보호
  try {
    localStorage.setItem('SX_ALERT_SOUND_ON', on?'1':'0');
    localStorage.setItem('SX_ALERT_SOUND_IDX', idx);
  } catch(_){}
}
function loadSoundSetting(){
  const on = localStorage.getItem('SX_ALERT_SOUND_ON') !== '0'; // 기본 ON
  const idx = parseInt(localStorage.getItem('SX_ALERT_SOUND_IDX'))||0;
  const tog = document.getElementById('soundToggle');
  const sel = document.getElementById('soundSelect');
  if(tog) tog.checked = on;
  if(sel) sel.value = idx;
}
function previewAlertSound(){
  if(typeof _sxVib === 'function') _sxVib(12); // S103: 미리듣기
  const idx = parseInt(document.getElementById('soundSelect').value)||0;
  if(SX_ALERT_SOUNDS[idx]) SX_ALERT_SOUNDS[idx].fn();
}
/* 스캔 중 신규 종목 발견 시 호출 */
function playAlertSound(){
  if(localStorage.getItem('SX_ALERT_SOUND_ON')==='0') return;
  const idx = parseInt(localStorage.getItem('SX_ALERT_SOUND_IDX'))||0;
  if(SX_ALERT_SOUNDS[idx]) SX_ALERT_SOUNDS[idx].fn();
}

// ── 글로벌 노출 (sx_screener.html과의 호환을 위해) ──
//   기존 코드는 onclick="saveSoundSetting()" 같이 글로벌 호출하므로 window에 부착 필요
if(typeof window !== 'undefined'){
  window._getAudioCtx = _getAudioCtx;
  window.SX_ALERT_SOUNDS = SX_ALERT_SOUNDS;
  window._beepSimple = _beepSimple;
  window._beepDouble = _beepDouble;
  window._beepRise = _beepRise;
  window._beepCoin = _beepCoin;
  window._beepSoftBell = _beepSoftBell;
  window._beepTriple = _beepTriple;
  window.saveSoundSetting = saveSoundSetting;
  window.loadSoundSetting = loadSoundSetting;
  window.previewAlertSound = previewAlertSound;
  window.playAlertSound = playAlertSound;
}
