import { describe, test, expect } from 'vitest';
import { createFeel, renderVoice, VOICES, MAX_VOICES } from './feel.js';

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
const fakeAudio = ({ state = 'running', resume = 'now' } = {}) => {
  const made = { ctx: 0, osc: 0, resume: 0, silent: [], list: [] };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class AC extends EventTarget {
    constructor() { super(); made.ctx++; made.list.push(this); this.currentTime = 0; this.state = state; this.sampleRate = 48000; this.destination = {}; }
    resume() { made.resume++; if (resume === 'now') { this.state = 'running'; return Promise.resolve(); } return new Promise(() => {}); }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { made.osc++; return { frequency: param(), connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createBuffer(ch, len, sr) { return { ch, len, sr }; }
    createBufferSource() { const b = { connect() {}, disconnect() {}, start(at) { made.silent.push([b.buffer, at]); } }; return b; }
  }
  return { AC, made };
};
// 사용자 동작이 들어오는 문서·창 흉내(EventTarget)
const fakeDom = () => { const doc = new EventTarget(), win = new EventTarget(); return { doc, win }; };
const fire = (t, type, target = {}) => { const e = new Event(type); Object.defineProperty(e, 'target', { value: target }); t.dispatchEvent(e); };

describe('쨈 버튼 소리·진동', () => {
  test('버튼 소리를 끄면 소리를 내지 않고 AudioContext 도 만들지 않는다(잠금 풀기도 안 함)', () => {
    const { AC, made } = fakeAudio();
    const feel = createFeel({ store: mem({ btnSound: 'off' }), win: { AudioContext: AC, navigator: {} }, now: () => 0 });
    expect(feel.unlock()).toBe(false);
    expect(feel.play('bbok')).toBe(false);
    expect(made.ctx).toBe(0);
  });
  test('진동을 끄면 vibrate 를 부르지 않는다', () => {
    let calls = 0;
    const feel = createFeel({ store: mem({ haptic: 'off' }), win: { navigator: { vibrate: () => { calls++; return true; } } } });
    expect(feel.buzz()).toBe(false);
    expect(calls).toBe(0);
  });
  test('Web Audio·진동을 지원하지 않는 브라우저(iOS 사파리 진동 등)에서도 오류 없이 넘어간다', () => {
    const feel = createFeel({ store: mem(), win: { navigator: {} }, now: () => 0 });
    expect(() => feel.play('tok')).not.toThrow();
    expect(feel.play('tok')).toBe(false);
    expect(feel.buzz()).toBe(false);
    const broken = createFeel({ store: mem(), win: { AudioContext: function () { throw new Error('막힘'); }, navigator: { vibrate: () => { throw new Error('막힘'); } } } });
    expect(broken.play('bbok')).toBe(false);
    expect(broken.buzz()).toBe(false);
  });
  test('QA 7차: play() 는 AudioContext 를 만들지 않음(사용자 동작 밖 rAF·setTimeout 에서 만들면 iOS 가 풀어 주지 않음) → unlock() 뒤에만 소리', () => {
    const { AC, made } = fakeAudio(); let t = 0; const got = [];
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: { vibrate: (ms) => got.push(ms) } }, now: () => t });
    expect(feel.play('bbok')).toBe(false); expect(made.ctx).toBe(0); expect(feel.ready()).toBe(false);
    expect(feel.unlock()).toBe(true); expect(feel.unlock()).toBe(true); expect(made.ctx).toBe(1);
    expect(feel.ready()).toBe(true);
    t = 200; expect(feel.play('bbok')).toBe(true); t = 400; feel.play('tok');
    expect(made.ctx).toBe(1);
    expect(feel.buzz()).toBe(true);
    expect(got).toEqual([12]);
  });
  test('QA 7차: unlock() 은 동기로 만들기 + resume() + 1샘플 무음 재생(iOS 잠금 풀기), running 이면 다시 하지 않음', () => {
    const { AC, made } = fakeAudio({ state: 'suspended' });
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: {} }, now: () => 0 });
    expect(feel.unlock()).toBe(true); // 흉내 resume 은 바로 running
    expect(made.resume).toBe(1);
    expect(made.silent).toEqual([[{ ch: 1, len: 1, sr: 48000 }, 0]]);
    feel.unlock(); expect(made.resume).toBe(1); expect(made.silent).toHaveLength(1);
    expect(createFeel({ store: mem(), win: { navigator: {} } }).unlock()).toBe(false); // Web Audio 없음
    const broken = createFeel({ store: mem(), win: { AudioContext: function () { throw new Error('막힘'); }, navigator: {} } });
    expect(broken.unlock()).toBe(false);
  });
  test('QA 7차: iOS 처럼 resume 이 비동기면 그 사이(사용자 동작 안) 예약한 소리는 냄(풀리자마자 남)', () => {
    const { AC, made } = fakeAudio({ state: 'suspended', resume: 'later' });
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: {} }, now: () => 0 });
    expect(feel.unlock()).toBe(false); // 아직 running 아님
    expect(feel.ready()).toBe(true); // resume 중 → 바로 예약(풀리면 남)
    expect(feel.play('bbok')).toBe(true);
    expect(made.resume).toBe(1); expect(made.ctx).toBe(1);
  });
  test('QA 7차: installUnlock — pointerdown 에서는 안 풀고, 컵 위 touchend·pointerup·keydown 은 건너뛰고 click(창 거품 단계, 시트 열기 뒤)에서 풂, running 이면 듣개를 뗌', () => {
    const { AC, made } = fakeAudio();
    const { doc, win } = fakeDom(); win.AudioContext = AC; win.navigator = {};
    const feel = createFeel({ store: mem(), win, now: () => 0 });
    const cup = { cup: true }, other = {};
    const seen = [];
    feel.installUnlock({ doc, skip: (t) => !!t.cup, onUnlock: () => seen.push(made.ctx) });
    fire(doc, 'pointerdown', cup); fire(doc, 'touchstart', cup);
    expect(made.ctx).toBe(0);
    fire(doc, 'touchend', cup); fire(doc, 'pointerup', cup); fire(doc, 'keydown', cup);
    expect(made.ctx).toBe(0); expect(seen).toEqual([]);
    // 앱 click 처리기(시트 열기)가 먼저 돌고 나서 창 거품 단계에서 풂
    const order = [];
    doc.addEventListener('click', () => order.push('open'));
    doc.addEventListener('click', (e) => win.dispatchEvent(new e.constructor('click'))); // 문서 → 창으로 거품
    win.addEventListener('click', () => order.push(made.ctx ? 'unlocked' : 'not-yet'));
    fire(doc, 'click', cup);
    expect(made.ctx).toBe(1); expect(seen).toEqual([1]); // onUnlock 은 만든 직후 처리기 안에서
    expect(order[0]).toBe('open');
    // running → 듣개를 뗌: 더 이상 onUnlock 안 부름
    fire(doc, 'touchend', other); fire(win, 'click', other); fire(doc, 'keydown', other);
    expect(seen).toEqual([1]); expect(made.ctx).toBe(1);
  });
  test('QA 7차: installUnlock — 컵이 아닌 곳의 첫 touchend·keydown 에서 풀고, 전화 등으로 다시 멈추면(statechange) 다음 동작에서 다시 resume', () => {
    const { AC, made } = fakeAudio();
    const { doc, win } = fakeDom(); win.AudioContext = AC; win.navigator = {};
    const feel = createFeel({ store: mem(), win, now: () => 0 });
    feel.installUnlock({ doc, skip: () => false });
    fire(doc, 'keydown', {}); expect(made.ctx).toBe(1); expect(made.resume).toBe(0); // 동작 안에서 만들면 이미 running
    const c = made.list[0];
    c.state = 'interrupted'; c.dispatchEvent(new Event('statechange'));
    expect(feel.ready()).toBe(false); expect(feel.play('bbok')).toBe(false);
    fire(doc, 'touchend', {}); expect(made.resume).toBe(1); expect(c.state).toBe('running'); expect(made.ctx).toBe(1);
    expect(feel.play('bbok')).toBe(true);
  });
  test('QA 7차: 버튼 소리가 꺼져 있으면 동작마다 AudioContext 를 만들지 않음(듣개만 남고 가벼움)', () => {
    const { AC, made } = fakeAudio(); const { doc, win } = fakeDom(); win.AudioContext = AC; win.navigator = {};
    const feel = createFeel({ store: mem({ btnSound: 'off' }), win, now: () => 0 });
    let n = 0; feel.installUnlock({ doc, onUnlock: () => n++ });
    fire(doc, 'touchend', {}); fire(win, 'click', {});
    expect(made.ctx).toBe(0); expect(n).toBe(2);
  });
  test('연타: 같은 소리는 45ms 안에 다시 안 내고, 동시에 최대 3개까지만', () => {
    const { AC } = fakeAudio(); let t = 0;
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: {} }, now: () => t });
    feel.unlock();
    expect(feel.play('bbok')).toBe(true);
    t = 20; expect(feel.play('bbok')).toBe(false);
    let ok = 0;
    for (let i = 0; i < 20; i++) { t = 50 + i * 3; if (feel.play(i % 2 ? 'bbok' : 'tok')) ok++; }
    expect(ok).toBeLessThanOrEqual(MAX_VOICES);
    t = 1000; expect(feel.play('tok')).toBe(true);
  });
  test('소리 봉투: 최고점 −14~−12 dBFS(들리되 과하지 않게), 3개가 겹쳐도 찢어지지 않음, 끝은 0 근처(뚝 끊기는 소리 없음)', () => {
    for (const v of Object.values(VOICES)) {
      const s = renderVoice(v);
      const peak = Math.max(...s.map(Math.abs));
      const db = 20 * Math.log10(peak);
      expect(db).toBeGreaterThan(-14); expect(db).toBeLessThan(-12);
      expect(peak * MAX_VOICES).toBeLessThan(0.8);
      // 지직거림 방지: 샘플 사이 급격한 점프 없음(켜짐 3ms 안팎 부드럽게)
      let jump = 0; for (let i = 1; i < s.length; i++) jump = Math.max(jump, Math.abs(s[i] - s[i - 1]));
      expect(jump).toBeLessThan(0.12);
      expect(Math.abs(s[0])).toBeLessThan(0.01);
      expect(Math.max(...s.slice(-50).map(Math.abs))).toBeLessThan(0.002);
    }
  });
});
