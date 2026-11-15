import { describe, test, expect } from 'vitest';
import { createFeel, renderVoice, VOICES, MAX_VOICES } from './feel.js';

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
const fakeAudio = () => {
  const made = { ctx: 0, osc: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class AC {
    constructor() { made.ctx++; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { made.osc++; return { frequency: param(), connect() {}, disconnect() {}, start() {}, stop() {} }; }
  }
  return { AC, made };
};

describe('쨈 버튼 소리·진동', () => {
  test('버튼 소리를 끄면 소리를 내지 않고 AudioContext 도 만들지 않는다', () => {
    const { AC, made } = fakeAudio();
    const feel = createFeel({ store: mem({ btnSound: 'off' }), win: { AudioContext: AC, navigator: {} }, now: () => 0 });
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
  test('AudioContext 는 처음 누를 때 한 번만 만들고, 진동은 12ms', () => {
    const { AC, made } = fakeAudio(); let t = 0; const got = [];
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: { vibrate: (ms) => got.push(ms) } }, now: () => t });
    expect(made.ctx).toBe(0);
    feel.play('bbok'); t = 200; feel.play('tok'); t = 400; feel.play('bbok');
    expect(made.ctx).toBe(1);
    expect(feel.buzz()).toBe(true);
    expect(got).toEqual([12]);
  });
  test('prime(): 첫 누름 전에 AudioContext 를 한 번만 미리 만들고, 버튼 소리를 끄면 만들지 않음(QA 6차 D2)', () => {
    const { AC, made } = fakeAudio(); let t = 0;
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: {} }, now: () => t });
    expect(feel.prime()).toBe(true); expect(feel.prime()).toBe(true); expect(made.ctx).toBe(1);
    feel.play('bbok'); expect(made.ctx).toBe(1); // 첫 소리에서는 새로 만들지 않음
    const off = fakeAudio();
    expect(createFeel({ store: mem({ btnSound: 'off' }), win: { AudioContext: off.AC, navigator: {} } }).prime()).toBe(false); expect(off.made.ctx).toBe(0);
    expect(createFeel({ store: mem(), win: { navigator: {} } }).prime()).toBe(false); // Web Audio 없음
  });
  test('연타: 같은 소리는 45ms 안에 다시 안 내고, 동시에 최대 3개까지만', () => {
    const { AC } = fakeAudio(); let t = 0;
    const feel = createFeel({ store: mem(), win: { AudioContext: AC, navigator: {} }, now: () => t });
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
