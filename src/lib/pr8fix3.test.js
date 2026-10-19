// PR #8 QA 3차(8.3점) 지적 재발 방지. ID는 /workspace/qa-gagyebu-pr8-3차/보고서.md 기준
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { emulatorTarget } from '../config.js';

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
