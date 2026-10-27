// 쨈 컵 버튼의 손맛: Web Audio 로 그 자리에서 만드는 짧은 '뽁'(누름)·'톡'(터짐) + 짧은 진동. 소리 파일·의존성 없음.
// - 설정: '버튼 소리'(localStorage btnSound), '진동'(localStorage haptic). 기기마다 따로 저장(계정 데이터 아님).
// - AudioContext 는 사용자 동작 처리기 안에서 동기로 만들고 resume()+1샘플 무음 재생으로 잠금을 품(unlock, installUnlock — iOS 사파리는 touchend·click·keydown
//   처리기 안에서만 소리를 풀어 줌, Howler.js 와 같은 방식). pointerdown 에서는 하지 않음(QA 6차 D2), 컵 누름에서는 click 처리기(시트 열기) 뒤에 함(QA 7차).
//   iOS 는 기본 'ambient' 세션이라 무음 스위치를 켜면 소리가 안 남
//   → 일부러 'ambient' 로 둠(수업 중 무음 모드를 존중, 다른 앱 음악도 끊지 않음). 웹은 무음 스위치를 읽을 수 없어 설정에서 끌 수 있게 함.
// - 지직거림 방지: 3ms 안팎으로 부드럽게 켜고 지수 곡선으로 끔, 동시에 최대 3개, 같은 소리는 45ms 안에 다시 안 냄, 음높이 ±5% 흔들기. 음량: 한 소리 최고점 약 −13 dBFS(휴대폰 스피커에서 들리게), 3개가 겹쳐도 약 −3.5 dBFS 로 찢어지지 않음.
// - 진동: navigator.vibrate 가 있는 기기만(안드로이드 크롬 등). iOS 사파리는 지원하지 않아 조용히 넘어감.
export const VOICES = {
  bbok: { f0: 560, f1: 210, dur: 0.075, gain: 0.2, attack: 0.003, h2: 0.3 }, // 말랑이를 누르는 '뽁': 음높이가 아래로 쑥
  tok: { f0: 880, f1: 1560, dur: 0.055, gain: 0.175, attack: 0.002, h2: 0.2, click: 2600 }, // 방울이 터지는 '톡': 위로 톡 + 아주 짧은 딸깍
};
export const MAX_VOICES = 3;
export const MIN_GAP_MS = 45;
export const VIBE_MS = 12;

export function createFeel({ store = globalThis.localStorage, win = globalThis, now = () => win.performance?.now?.() ?? Date.now(), rand = Math.random } = {}) {
  let ctx = null;
  let resuming = false; // unlock() 이 부른 resume() 이 아직 끝나지 않음(이 사이 예약한 소리는 풀리자마자 남)
  let ends = [];
  const last = {};
  const audio = () => {
    if (ctx) return ctx;
    const AC = win.AudioContext || win.webkitAudioContext;
    if (!AC) return null;
    try { if (win.navigator?.audioSession) win.navigator.audioSession.type = 'ambient'; } catch { /* 지원 안 함 */ }
    try { ctx = new AC(); } catch { ctx = null; }
    return ctx;
  };
  const tone = (c, type, f0, f1, s, dur, peak, attack, out) => {
    const g = c.createGain();
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, s + dur);
    g.connect(out);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, s);
    o.frequency.exponentialRampToValueAtTime(f1, s + dur * 0.7);
    o.connect(g);
    o.start(s);
    o.stop(s + dur + 0.02);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* 이미 끊김 */ } };
  };
  function play(name) {
    try {
      if (!store || store.getItem('btnSound') === 'off') return false;
      const v = VOICES[name];
      if (!v) return false;
      const t = now();
      ends = ends.filter((e) => e > t);
      if (t - (last[name] ?? -Infinity) < MIN_GAP_MS || ends.length >= MAX_VOICES) return false;
      const c = ctx; // 만들기·resume 은 사용자 동작 안의 unlock() 만 함(처리기 밖에서는 iOS 가 풀어 주지 않음)
      if (!c || (c.state !== 'running' && !resuming)) return false;
      last[name] = t;
      ends.push(t + v.dur * 1000 + 30);
      const k = 1 + (rand() - 0.5) * 0.1;
      const s = c.currentTime + 0.004;
      tone(c, 'sine', v.f0 * k, v.f1 * k, s, v.dur, v.gain, v.attack, c.destination);
      tone(c, 'triangle', v.f0 * 2 * k, v.f1 * 2 * k, s, v.dur * 0.6, v.gain * v.h2, v.attack, c.destination);
      if (v.click) tone(c, 'sine', v.click * k, v.click * 0.7 * k, s, 0.012, v.gain * 0.5, 0.001, c.destination);
      return true;
    } catch { return false; }
  }
  function buzz(ms = VIBE_MS) {
    try {
      if (!store || store.getItem('haptic') === 'off') return false;
      const n = win.navigator;
      if (typeof n?.vibrate !== 'function') return false;
      return n.vibrate(ms) !== false;
    } catch { return false; }
  }
  // 소리 잠금 풀기: 사용자 동작 처리기(touchend·pointerup·click·keydown) 안에서 동기로 부름. 만들기 + resume() + 1샘플 무음 재생만(가벼움).
  // 이미 running 이면 아무것도 안 함. 돌려주는 값: 지금 running 인지(iOS 는 resume 이 비동기라 처음엔 false → 다음 동작에서 다시 시도)
  function unlock() {
    try {
      if (!store || store.getItem('btnSound') === 'off') return false;
      const c = audio();
      if (!c) return false;
      if (c.state === 'running') return true;
      if (c.state === 'closed') return false;
      const p = c.resume?.();
      if (p?.then) { resuming = true; const end = () => { resuming = false; }; p.then(end, end); }
      const b = c.createBufferSource();
      b.buffer = c.createBuffer(1, 1, c.sampleRate || 22050);
      b.connect(c.destination);
      b.start(0);
      b.onended = () => { try { b.disconnect(); } catch { /* 이미 끊김 */ } };
      return c.state === 'running';
    } catch { return false; }
  }
  // 소리를 바로 낼 수 있는지(running 이거나 사용자 동작 안에서 resume 중)
  const ready = () => !!ctx && (ctx.state === 'running' || resuming);
  // 잠금 풀기 듣개 설치(main.js): 문서 캡처 단계 touchend·pointerup·keydown, window 거품 단계 click(앱 click 처리기·시트 열기 뒤).
  // 쨈 컵(skip(target) 이 true) 위 touchend·pointerup·keydown 은 건너뜀 → 컵은 뒤따르는 click 에서 시트를 연 다음에 만듦(QA 7차, 사파리는 touchend·click 을 사용자 동작으로 셈).
  // running 이 되면 듣개를 모두 뗌. 전화·다른 앱 등으로 다시 멈추면(statechange) 다시 붙임. onUnlock(): 풀기를 시도한 직후(처리기 안) 부름
  function installUnlock({ doc = win.document, skip = () => false, onUnlock = () => {} } = {}) {
    let on = false;
    const CAP = { capture: true, passive: true };
    const capture = [['touchend', doc], ['pointerup', doc], ['keydown', doc]];
    const handle = (e) => {
      if (e.type !== 'click' && skip(e.target)) return;
      const ok = unlock();
      try { onUnlock(); } catch { /* 소리는 덤 */ }
      if (ok) off();
      if (ctx && !ctx.__feelWatch) { ctx.__feelWatch = true; ctx.addEventListener?.('statechange', () => { if (ctx.state !== 'running' && ctx.state !== 'closed') add(); }); }
    };
    const add = () => { if (on) return; on = true; capture.forEach(([ev, t]) => t?.addEventListener(ev, handle, CAP)); win.addEventListener?.('click', handle); };
    const off = () => { if (!on) return; on = false; capture.forEach(([ev, t]) => t?.removeEventListener(ev, handle, CAP)); win.removeEventListener?.('click', handle); };
    add();
    return off;
  }
  return { play, buzz, unlock, ready, installUnlock };
}

// 참고용 오프라인 렌더(테스트·wav 확인용): play()와 같은 봉투·음높이 곡선을 샘플로 계산
export function renderVoice(v, sr = 44100, k = 1) {
  const parts = [['sine', v.f0 * k, v.f1 * k, v.dur, v.gain, v.attack], ['triangle', v.f0 * 2 * k, v.f1 * 2 * k, v.dur * 0.6, v.gain * v.h2, v.attack]];
  if (v.click) parts.push(['sine', v.click * k, v.click * 0.7 * k, 0.012, v.gain * 0.5, 0.001]);
  const n = Math.ceil((v.dur + 0.03) * sr);
  const out = new Float32Array(n);
  for (const [type, f0, f1, dur, peak, att] of parts) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t > dur + 0.02) break;
      const f = t < dur * 0.7 ? f0 * (f1 / f0) ** (t / (dur * 0.7)) : f1;
      ph += (2 * Math.PI * f) / sr;
      const env = t < att ? peak * (t / att) : t < dur ? peak * (0.0003 / peak) ** ((t - att) / (dur - att)) : 0;
      const w = type === 'sine' ? Math.sin(ph) : (2 / Math.PI) * Math.asin(Math.sin(ph));
      out[i] += env * w;
    }
  }
  return out;
}
