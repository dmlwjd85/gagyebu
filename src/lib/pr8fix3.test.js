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

describe('N1 배포 순서: 규칙을 먼저, 앱은 나중에', () => {
  it('앱 배포 워크플로는 rules 단계가 끝나야 빌드해요', () => {
    const y = read('.github/workflows/deploy-pages.yml');
    expect(y).toMatch(/\n  rules:\n/);
    expect(y).toMatch(/\n  build:\n    needs: rules\n/);
    expect(y).toContain('firebase deploy --only firestore:rules --project gagyebu-b44fc2');
    expect(y).toContain('node scripts/rules-mark.mjs --check');
  });
  it('npm run rules:deploy 는 규칙 배포에 성공한 뒤에만 표시 파일을 고쳐 써요', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['rules:deploy']).toBe('firebase deploy --only firestore:rules --project gagyebu-b44fc2 && node scripts/rules-mark.mjs');
    expect(read('.github/firestore-rules-deployed.sha256')).toMatch(/^[0-9a-f]{64}\n/);
    expect(read('docs/배포.md')).toContain('npm run rules:deploy');
  });
});

describe('N2 지운 달은 arrayUnion/arrayRemove로(통째로 다시 쓰지 않음)', () => {
  it('skipTrim: 24개를 넘길 때만 가장 오래된 달을 뺌', async () => {
    const { skipTrim } = await import('./recurring.js');
    const m = (n) => Array.from({ length: n }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    expect(skipTrim(m(23), '2026-10')).toEqual([]);
    expect(skipTrim(m(24), '2026-10')).toEqual(['2024-01']);
    expect(skipTrim(m(24), m(24)[5])).toEqual([]); // 이미 있는 달
    expect(skipTrim([], '2026-10')).toEqual([]);
  });
  it('store.js: skipped를 목록으로 쓰는 곳이 없음(새 반복·옮기기·되살리기만 목록 전체)', () => {
    const src = read('src/store.js');
    expect(src).not.toMatch(/skipped: (addSkipped|dropSkipped)\(/);
    expect(src).toMatch(/skipped: arrayUnion\(x\.ym\)/);
    expect(src).toMatch(/skipped: arrayRemove\(rx\.ym\)/);
    expect(src).toMatch(/\{ merge: true \}/);
  });
});

describe('N4 다른 기기에서 반복을 지운 사이 오프라인에서 지운 자동 기록', () => {
  it('지우기 묶음이 거부되면 반복이 정말 없는지 서버에서 보고, 없으면 기록만 지움', () => {
    const src = read('src/store.js');
    const body = src.slice(src.indexOf('export function deleteTx'), src.indexOf('export function saveCategory'));
    expect(body).toMatch(/getDocFromServer\(u\('recurring', x\.r\.id\)\)/);
    expect(body).toMatch(/if \(!r\.exists\(\)\) return deleteDoc\(u\('transactions', id\)\)/);
  });
});

describe('N3 새 버전 적용(서비스 워커)', async () => {
  const { createUpdater, AUTO_WINDOW_MS } = await import('./pwa.js');
  const fake = ({ controller = true, busy = false, anytime = false } = {}) => {
    const h = {}, dh = {};
    let t = 1000;
    const reg = { update: async () => {}, installing: null, waiting: null };
    const sw = { controller: controller ? {} : null, addEventListener: (k, f) => { (h[k] ||= []).push(f); }, register: async () => reg, getRegistration: async () => reg };
    const doc = { hidden: false, addEventListener: (k, f) => { (dh[k] ||= []).push(f); } };
    const out = { reloads: 0, ready: 0, busy, anytime };
    const up = createUpdater({ sw, base: '/gagyebu/', isBusy: () => out.busy, canApplyAnytime: () => out.anytime, onReady: () => out.ready++,
      reload: () => out.reloads++, now: () => t, doc, timers: { setInterval: () => 0, setTimeout: (f) => f() } });
    return { up, out, fire: (k) => (h[k] || []).forEach((f) => f()), vis: (hidden) => { doc.hidden = hidden; (dh.visibilitychange || []).forEach((f) => f()); }, tick: (ms) => { t += ms; }, reg };
  };
  it('새로 고친 직후 새 버전이 자리를 잡으면 바로 다시 불러옴(새로 고침 한 번으로 새 버전)', () => {
    const f = fake(); f.fire('controllerchange');
    expect(f.out.reloads).toBe(1); expect(f.out.ready).toBe(0);
  });
  it('첫 설치(전에 서비스 워커가 없던 화면)는 다시 불러오지 않음', () => {
    const f = fake({ controller: false }); f.fire('controllerchange');
    expect(f.out.reloads).toBe(0);
  });
  it('입력 중이면 바로 다시 불러오지 않고 안내만, 앱을 뒤로 보냈을 때 입력 중이 아니면 적용', () => {
    const f = fake({ busy: true }); f.fire('controllerchange');
    expect(f.out.reloads).toBe(0); expect(f.out.ready).toBe(1);
    f.vis(true); expect(f.out.reloads).toBe(0); // 아직 입력 중
    f.out.busy = false; f.vis(false); f.vis(true); expect(f.out.reloads).toBe(1);
  });
  it('켜 둔 지 오래된 화면은 안내([지금 적용])만, 버튼을 누르면 적용', () => {
    const f = fake(); f.tick(AUTO_WINDOW_MS + 1); f.fire('controllerchange');
    expect(f.out.reloads).toBe(0); expect(f.out.ready).toBe(1);
    f.up.apply(); expect(f.out.reloads).toBe(1);
  });
  it('로그인 전 화면은 언제든 바로 적용', () => {
    const f = fake({ anytime: true }); f.tick(AUTO_WINDOW_MS + 1); f.fire('controllerchange');
    expect(f.out.reloads).toBe(1);
  });
  it('[새로 고침](권한 토스트): 새 버전을 먼저 받아 자리 잡게 한 뒤 다시 불러옴', async () => {
    const f = fake(); let posted = null;
    f.reg.update = async () => { f.reg.waiting = { postMessage: (m) => { posted = m; } }; };
    await f.up.refresh();
    expect(posted).toEqual({ type: 'SKIP_WAITING' }); expect(f.out.reloads).toBe(1);
  });
  it('vite.config: 새 서비스 워커가 기다리지 않음(skipWaiting·clientsClaim), 플러그인 등록 스크립트 대신 직접 등록', () => {
    const v = read('vite.config.js');
    expect(v).toMatch(/skipWaiting: true/); expect(v).toMatch(/clientsClaim: true/); expect(v).toMatch(/injectRegister: false/);
    const m = read('src/main.js');
    expect(m).toMatch(/onAction: \(\) => updater\.refresh\(\)/);
    expect(m).not.toMatch(/onAction: \(\) => location\.reload\(\)/);
  });
});
