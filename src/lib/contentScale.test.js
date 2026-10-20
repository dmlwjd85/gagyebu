import { describe, it, expect } from 'vitest';
import { clampScale, stepScale, scalePct, readScale, saveScale, scaleKeyAction, SCALE_MIN, SCALE_MAX, SCALE_KEY } from './contentScale.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };

describe('본문 글자 배율', () => {
  it('범위 안으로 자르고 0.05 단위로 맞춤', () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(0.5)).toBe(SCALE_MIN);
    expect(clampScale(3)).toBe(SCALE_MAX);
    expect(clampScale('1.23')).toBe(1.25);
    expect(clampScale('abc')).toBe(1);
    expect(clampScale('')).toBe(1);
    expect(clampScale(null)).toBe(SCALE_MIN); // Number(null)=0 → 최소
    expect(clampScale(undefined)).toBe(1);
  });
  it('한 단계씩 키우고 줄이며 끝에서 멈춤', () => {
    expect(stepScale(1, 1)).toBe(1.1);
    expect(stepScale(1, -1)).toBe(0.9);
    expect(stepScale(0.9, -1)).toBe(SCALE_MIN);
    expect(stepScale(SCALE_MIN, -1)).toBe(SCALE_MIN);
    expect(stepScale(1.55, 1)).toBe(SCALE_MAX);
    expect(stepScale(SCALE_MAX, 1)).toBe(SCALE_MAX);
    // 부동소수 누적 오차 없음
    let v = 1; for (let i = 0; i < 3; i++) v = stepScale(v, 1); expect(v).toBe(1.3);
  });
  it('퍼센트 표기', () => { expect(scalePct(1.15)).toBe('115%'); expect(scalePct(0.85)).toBe('85%'); });
  it('저장·읽기: 기본값이면 지우고, 망가진 값은 기본값', () => {
    const s = mem();
    expect(readScale(s)).toBe(1);
    expect(saveScale(1.2, s)).toBe(1.2); expect(s.m.get(SCALE_KEY)).toBe('1.2'); expect(readScale(s)).toBe(1.2);
    saveScale(1, s); expect(s.m.has(SCALE_KEY)).toBe(false);
    expect(readScale(mem({ [SCALE_KEY]: 'x' }))).toBe(1);
    expect(readScale({ getItem: () => { throw new Error('막힘'); } })).toBe(1);
  });
  it('Ctrl/⌘ 단축키 해석', () => {
    expect(scaleKeyAction({ ctrlKey: true, key: '=' })).toBe('in');
    expect(scaleKeyAction({ metaKey: true, key: '+' })).toBe('in');
    expect(scaleKeyAction({ ctrlKey: true, key: '-' })).toBe('out');
    expect(scaleKeyAction({ ctrlKey: true, key: '0' })).toBe('reset');
    expect(scaleKeyAction({ ctrlKey: true, code: 'NumpadAdd', key: '+' })).toBe('in');
    expect(scaleKeyAction({ key: '=' })).toBe(null);
    expect(scaleKeyAction({ ctrlKey: true, altKey: true, key: '=' })).toBe(null);
    expect(scaleKeyAction({ ctrlKey: true, key: 'f' })).toBe(null);
  });
});

import { topBar } from '../ui/views.js';
describe('위 메뉴(줌 대응)', () => {
  const m = { viewYm: '2026-10', curYm: '2026-10', sd: 1, offline: true, dark: false };
  it('오프라인이면 is-offline 표시(좁은 폰에서 심볼을 숨겨 한 줄 유지), 넘치면 줄바꿈', () => {
    const h = topBar(m);
    expect(h).toContain('is-offline');
    expect(h).toContain('flex-wrap');
    expect(h).not.toContain('safe-area-inset-top'); // 안전 영역은 바깥 .app-top 이 한 번만 처리
  });
});
