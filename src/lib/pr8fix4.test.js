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

describe('4-3 규칙 배포 지문: firestore.rules + firebase.json의 firestore 설정', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { rulesFingerprint } = await import('../../scripts/rules-mark.mjs');
  const FB = { firestore: { rules: 'firestore.rules' }, emulators: { firestore: { port: 8080 } } };
  const dir = (fb = FB, rules = 'rules_version = "2";', extra = {}) => {
    const d = mkdtempSync(join(tmpdir(), 'rm-'));
    writeFileSync(join(d, 'firebase.json'), JSON.stringify(fb)); writeFileSync(join(d, 'firestore.rules'), rules);
    for (const [k, v] of Object.entries(extra)) writeFileSync(join(d, k), v);
    return pathToFileURL(d + '/');
  };
  it('규칙 내용이 바뀌면 지문이 바뀜', () => {
    expect(rulesFingerprint(dir())).not.toBe(rulesFingerprint(dir(FB, 'rules_version = "2"; // x')));
  });
  it('firebase.json의 firestore 설정(규칙 경로·색인 파일)이 바뀌면 지문이 바뀜(수정 전에는 firestore.rules만 봤음)', () => {
    const a = rulesFingerprint(dir());
    const withIdx = { ...FB, firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' } };
    const b = rulesFingerprint(dir(withIdx, undefined, { 'firestore.indexes.json': '{"indexes":[]}' }));
    const c = rulesFingerprint(dir(withIdx, undefined, { 'firestore.indexes.json': '{"indexes":[{"x":1}]}' }));
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it('에뮬레이터 설정·키 순서는 지문에 영향 없음', () => {
    expect(rulesFingerprint(dir({ emulators: { firestore: { port: 9999 } }, firestore: { rules: 'firestore.rules' } }))).toBe(rulesFingerprint(dir()));
  });
  it('저장소의 표시 파일은 지문 형식이고, 워크플로는 비밀값이 있으면 규칙을 먼저 배포한 뒤 앱을 빌드', () => {
    expect(readFileSync(join(root, '.github/firestore-rules-deployed.sha256'), 'utf8')).toMatch(/^[0-9a-f]{64}\n/);
    const y = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
    expect(y).toMatch(/secrets\.FIREBASE_SERVICE_ACCOUNT/);
    expect(y).toMatch(/firebase deploy --only firestore:rules --project gagyebu-b44fc2/);
    expect(y).toMatch(/build:\n\s+needs: rules/);
    expect(y).toContain('node scripts/rules-mark.mjs --check');
  });
});
