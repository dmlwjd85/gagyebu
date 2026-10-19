// PR #9 QA(8.3점) 지적 재발 방지
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { installScaleShortcuts, INTERCEPT_BROWSER_ZOOM } from './scaleShortcuts.js';
import { emulatorTarget } from '../config.js';
import { topBar } from '../ui/views.js';
import { numSpan } from '../ui/util.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fakeTarget = () => { const h = {}; return { h, addEventListener: (t, f) => { h[t] = f; }, removeEventListener: (t) => { delete h[t]; } }; };
const ev = (o) => ({ preventDefault: vi.fn(), ...o });

describe('M3 Ctrl/휠 가로채기 분리', () => {
  it('기본값은 지금과 같은 동작(켜짐)', () => expect(INTERCEPT_BROWSER_ZOOM).toBe(true));
  it('끄면 아무 것도 가로채지 않음', () => {
    const t = fakeTarget();
    installScaleShortcuts({ getScale: () => 1, setScale: vi.fn(), enabled: false, target: t });
    expect(Object.keys(t.h)).toEqual([]);
  });
  it('켜면 Ctrl + = 은 배율을 키우고, 끝(160%)에서는 브라우저 줌에 맡김', () => {
    let cur = 1.5; const set = vi.fn((v) => { cur = v; });
    const t = fakeTarget();
    const off = installScaleShortcuts({ getScale: () => cur, setScale: set, target: t });
    const e1 = ev({ ctrlKey: true, key: '=' }); t.h.keydown(e1);
    expect(set).toHaveBeenCalledWith(1.6); expect(e1.preventDefault).toHaveBeenCalled();
    const e2 = ev({ ctrlKey: true, key: '=' }); t.h.keydown(e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    off(); expect(t.h.keydown).toBeUndefined();
  });
  it('시트·대화상자가 열려 있으면(blocked) 가로채지 않음, 휠은 50만큼 모여야 한 단계', () => {
    const set = vi.fn(); const t = fakeTarget(); let blocked = true;
    installScaleShortcuts({ getScale: () => 1, setScale: set, blocked: () => blocked, target: t });
    const e = ev({ ctrlKey: true, deltaY: -100 }); t.h.wheel(e); expect(e.preventDefault).not.toHaveBeenCalled();
    blocked = false;
    t.h.wheel(ev({ ctrlKey: true, deltaY: -30 })); expect(set).not.toHaveBeenCalled();
    t.h.wheel(ev({ ctrlKey: true, deltaY: -30 })); expect(set).toHaveBeenCalledWith(1.1);
  });
});

describe('QA 도구 동시 실행: 에뮬레이터 프로젝트·포트 지정', () => {
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
  it('QA 도구는 고정 프로젝트 데이터를 지우지 않음', () => {
    for (const f of ['overflow.py', 'touch.py', 'contrast_axe.py', 'smoke_writes.py']) {
      const t = readFileSync(new URL(`../../tools/qa/${f}`, import.meta.url), 'utf8');
      expect(t).not.toMatch(/projects\/demo-gagyebu/);
      expect(t).toContain('emu.reset()');
    }
    expect(readFileSync(new URL('../../tools/qa/emu.py', import.meta.url), 'utf8')).toContain("f'demo-qa-{os.getpid()}'");
  });
});

describe('줌·글자 배율 QA 지적', () => {
  const css = src('style.css');
  it('H2 금액 칸은 말줄임 없음, 실제 금액 폭 기준으로 줄바꿈', () => {
    expect(css).toMatch(/\.stat-v \{[^}]*whitespace-nowrap/);
    expect(css).not.toMatch(/\.stat-v \{[^}]*truncate/);
    expect(css).toMatch(/\.stat-grid > \* \{[^}]*min-width: min\(100%, max-content\)/);
  });
  it('H1 좁은 폭에서도 아래 메뉴 5칸이 모두 들어감(칸을 똑같이 나눔)', () => {
    expect(css).toMatch(/max-width: 339px\)[\s\S]{0,200}grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  });
  it('M4 날짜·금액 고정 폭 없음', () => {
    const ui = src('ui/views.js') + src('ui/m2views.js') + src('ui/importer.js');
    expect(ui).not.toMatch(/tabular-nums[^"]*\bw-(10|11|12|28)\b/);
    expect(ui).not.toMatch(/\bw-(10|11|12|28)\b[^"]*tabular-nums/);
  });
  it('M2 오프라인 표시는 자리를 차지하지 않는 작은 표시', () => {
    const h = topBar({ viewYm: '2026-10', curYm: '2026-10', sd: 1, offline: true, dark: false });
    expect(h).toContain('offline-badge'); expect(h).not.toContain('w-7 h-11');
  });
  it('M5 낮은 화면에서는 메뉴 고정을 풀고, 키보드가 올라오면 아래 메뉴 숨김', () => {
    expect(css).toMatch(/@media \(max-height: 500px\) \{[\s\S]{0,200}\.app-frame \{ display: block/);
    expect(css).toContain('html.kbd-open .tabbar { display: none; }');
  });
  it('M6 입력 시트는 노치(안전 영역) 아래까지만', () => expect(css).toMatch(/\.sheet \{[^}]*max-height: calc\(100dvh - env\(safe-area-inset-top\)/));
  it('M1 팁은 떠 있지 않고 홈 본문 흐름 안', () => {
    expect(css).not.toMatch(/\.tip \{ @apply fixed/);
    expect(src('ui/views.js')).toContain('<div id="tip-slot"></div>');
  });
  it('L6 문장 속 금액은 tabular-nums + 쪼개지지 않게', () => {
    expect(numSpan('1,000원')).toBe('<span data-fit class="num tabular-nums">1,000원</span>');
    expect(src('ui/views.js')).toMatch(/numSpan\(formatWon\(total - spent\)\)\} 남았어요/);
    expect(src('ui/m2views.js')).toMatch(/한 달에 \$\{numSpan\(formatWon\(p\.perMonth\)\)\}씩/);
  });
});
