// QA 6차 3: 배포 워크플로 순서 test → rules → build → deploy, 규칙 배포는 main·github-pages 환경, 키 파일은 always로 지움
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const wf = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const job = (name) => { const m = wf.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z]+:\\n|$)`)); return m ? m[1] : ''; };

describe('6-3 배포 워크플로 순서', () => {
  it('test 단계가 단위·규칙 테스트를 돌림', () => {
    expect(job('test')).toMatch(/run: npm test/);
    expect(job('test')).toMatch(/run: npm run test:rules/);
  });
  it('rules는 test 뒤, main에서만, github-pages 환경', () => {
    const r = job('rules');
    expect(r).toMatch(/needs: test/);
    expect(r).toMatch(/if: github\.ref == 'refs\/heads\/main'/);
    expect(r).toMatch(/environment: \{ name: github-pages \}/);
    expect(r).toMatch(/if: always\(\)\n\s+run: rm -f "\$RUNNER_TEMP\/sa\.json"/);
  });
  it('build는 rules 뒤, deploy는 build 뒤', () => {
    expect(job('build')).toMatch(/needs: rules/);
    expect(job('deploy')).toMatch(/needs: build/);
  });
});
