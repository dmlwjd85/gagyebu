// PR #8 QA 4차(8.9점) 지적 재발 방지. ID는 /workspace/qa-gagyebu-pr8-4차/보고서.md 기준(4-1은 busy.test.js)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hasPy = spawnSync('python3', ['--version']).status === 0;

describe('4-2 QA 도구: 에뮬레이터 호스트를 정하지 않으면 실행하지 않음', () => {
  const run = (env, args = []) => spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, "tools/qa"); import emu; print(emu.HOST, emu.PROJECT)', ...args],
    { cwd: root, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  it.skipIf(!hasPy)('호스트 없으면 종료 코드 1과 안내(수정 전에는 127.0.0.1로 그냥 돌았음)', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('에뮬레이터 호스트를 정해 주세요');
  });
  it.skipIf(!hasPy)('환경 변수나 인자로 정하면 그 호스트, 프로젝트는 demo-qa-<pid>', () => {
    expect(run({ QA_EMU_HOST: '127.0.0.9' }).stdout).toMatch(/^127\.0\.0\.9 demo-qa-\d+/);
    expect(run({}, ['--emu-host=127.0.0.7']).stdout).toMatch(/^127\.0\.0\.7 /);
  });
});
