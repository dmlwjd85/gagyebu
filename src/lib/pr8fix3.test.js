// PR #8 QA 3차(8.3점) 지적 재발 방지. ID는 /workspace/qa-gagyebu-pr8-3차/보고서.md 기준
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { emulatorTarget } from '../config.js';
import { settledLastPosted, deniedOutcome, dueOccurrences } from './recurring.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('N5 QA 도구 동시 실행: 에뮬레이터 프로젝트·포트 지정', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('주소 값을 쓰고 이 탭 동안 기억', () => {
    const s = mem();
    const a = emulatorTarget('?emuProject=demo-qa-123&emuAuthPort=9199&emuFsPort=8180&emuHost=127.0.0.2', s, 'demo-gagyebu');
    expect(a).toMatchObject({ projectId: 'demo-qa-123', authPort: 9199, fsPort: 8180, host: '127.0.0.2' });
    expect(emulatorTarget('', s, 'demo-gagyebu')).toMatchObject({ projectId: 'demo-qa-123', fsPort: 8180 });
  });
  it('demo- 가 아닌 프로젝트·이상한 포트·외부 호스트는 무시', () => {
    const a = emulatorTarget('?emuProject=real-prod&emuFsPort=abc&emuHost=evil.example.com', mem(), 'demo-gagyebu');
    expect(a.projectId).toBe('demo-gagyebu'); expect(a.fsPort).toBe(8080); expect(a.authPort).toBe(9099);
    expect(a.host).not.toBe('evil.example.com');
  });
  it('QA 도구는 모두 emu.py를 거치고 고정 프로젝트 데이터를 지우지 않음', () => {
    for (const f of ['overflow', 'touch', 'contrast_axe', 'smoke_writes', 'keep_race', 'legacy_edit', 'restore_keep', 'num_check', 'rec_overwrite']) {
      const t = read(`tools/qa/${f}.py`);
      expect(t, f).not.toMatch(/projects\/demo-gagyebu|'demo-gagyebu'|127\.0\.0\.1:8080|127\.0\.0\.1:9099/);
      expect(t, f).toMatch(/emu\.reset\(\)/);
    }
    expect(read('tools/qa/emu.py')).toContain("f'demo-qa-{os.getpid()}'");
  });
});

describe('N1 자동 기록이 거부되면 정말 있는지 확인하고, 처리한 달까지만 lastPosted를 올림', () => {
  const r = { id: 'aRec1', active: true, startYm: '2026-01', dayOfMonth: 25, lastPosted: '2026-09' };
  it('예전 규칙에 막혀 10·11월이 모두 실패하면 lastPosted는 그대로(다음에 다시)', () => {
    const due = dueOccurrences(r, '2026-11-26');
    expect(due.map((o) => o.ym)).toEqual(['2026-10', '2026-11']);
    expect(settledLastPosted(r.lastPosted, due, ['failed', 'failed'])).toBe('2026-09');
  });
  it('앞 달이 실패하면 뒤 달이 됐어도 그 앞에서 멈춤(뒤 달은 다음에 있으면 건너뜀)', () => {
    const due = dueOccurrences(r, '2026-11-26');
    expect(settledLastPosted(r.lastPosted, due, ['failed', 'done'])).toBe('2026-09');
    expect(settledLastPosted(r.lastPosted, due, ['done', 'failed'])).toBe('2026-10');
    expect(settledLastPosted(r.lastPosted, due, ['done', 'done'])).toBe('2026-11');
  });
  it('lastPosted가 없던 반복도 첫 달이 실패하면 없는 그대로', () => {
    const due = dueOccurrences({ ...r, lastPosted: undefined, startYm: '2026-11' }, '2026-11-26');
    expect(settledLastPosted(undefined, due, ['failed'])).toBeUndefined();
  });
  it('거부 뒤 서버 확인: 정말 있음·지운 달만 처리한 것으로, 반복이 지워졌으면 gone, 나머지는 failed', () => {
    expect(deniedOutcome({ txExists: true, recExists: true, ym: '2026-10' })).toBe('done');
    expect(deniedOutcome({ txExists: false, recExists: true, skipped: ['2026-10'], ym: '2026-10' })).toBe('done');
    expect(deniedOutcome({ txExists: false, recExists: false, ym: '2026-10' })).toBe('gone');
    expect(deniedOutcome({ txExists: false, recExists: true, skipped: ['2026-09'], ym: '2026-10' })).toBe('failed');
    expect(deniedOutcome({ txExists: false, recExists: true, ym: '2026-10' })).toBe('failed');
  });
  it('store.js: 거부를 곧바로 이미 있음으로 보지 않고, lastPosted는 결과를 본 뒤에만 올림', () => {
    const src = read('src/store.js');
    expect(src).toMatch(/getDocFromServer\(ref\)/);
    expect(src).toMatch(/settledLastPosted\(r\.lastPosted, due, results\)/);
    expect(src).not.toMatch(/permission-denied'\) \{ console\.info\([^)]*\); return false; \}/);
  });
});
