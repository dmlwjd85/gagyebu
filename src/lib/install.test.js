import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { installState, shouldShowHint, isIOSSafari, isInApp, iosVersion, isMacSafariDock, hintDismissed, dismissHint, bumpVisits, createInstaller, HINT_KEY, VISIT_KEY, VISIT_DAY_KEY, HINT_UNTIL } from './install.js';
import { installCard, installHint } from '../ui/installView.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneKakao: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  iphoneChromeOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.5615.46 Mobile/15E148 Safari/604.1',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.2849.80 Mobile/15E148 Safari/605.1.15',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  iphoneNaver: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.5.3)',
  androidKakao: 'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410830',
  macSafari17: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
const win = (standalone = false) => ({ matchMedia: (q) => ({ matches: standalone && q === '(display-mode: standalone)' }) });
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

describe('installState', () => {
  it('앱으로 실행 중이면 standalone (display-mode, 아이폰 navigator.standalone)', () => {
    expect(installState({ win: win(true), nav: { userAgent: UA.android }, hasPrompt: true })).toBe('standalone');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneSafari, standalone: true } })).toBe('standalone');
  });
  it('방금 설치했으면 thanks', () => {
    expect(installState({ win: win(), nav: { userAgent: UA.android }, installed: true })).toBe('thanks');
  });
  it('아이폰 사파리·아이패드는 ios-safari, 앱 안 브라우저(카카오톡·네이버)는 ios-other', () => {
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneSafari } })).toBe('ios-safari');
    expect(installState({ win: win(), nav: { userAgent: UA.ipadOS, maxTouchPoints: 5 } })).toBe('ios-safari');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneKakao } })).toBe('ios-other');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneNaver } })).toBe('ios-other');
  });
  it('아이폰 크롬·엣지·파이어폭스는 iOS 16.4부터 공유 → 홈 화면에 추가(ios-browser), 그 전은 사파리 안내', () => {
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneChrome } })).toBe('ios-browser');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneEdge } })).toBe('ios-browser');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneFirefox } })).toBe('ios-browser');
    expect(installState({ win: win(), nav: { userAgent: UA.iphoneChromeOld } })).toBe('ios-other');
    expect(iosVersion({ userAgent: UA.iphoneChromeOld })).toEqual([16, 3]);
    expect(iosVersion({ userAgent: UA.ipadOS })).toBe(null); // 아이패드 데스크톱 UA 는 버전이 안 보임 → 16.4 이상으로 봄(아이패드OS 13+)
  });
  it('안드로이드 앱 안 브라우저(카카오톡)는 in-app, 설치 창이 오면 prompt 가 먼저', () => {
    expect(isInApp({ userAgent: UA.androidKakao })).toBe(true);
    expect(installState({ win: win(), nav: { userAgent: UA.androidKakao } })).toBe('in-app');
    expect(installState({ win: win(), nav: { userAgent: UA.androidKakao }, hasPrompt: true })).toBe('prompt');
    expect(isInApp({ userAgent: UA.android })).toBe(false);
  });
  it('설치 창을 닫았으면 prompt-used(이미 설치됨 안내 대신), 맥 사파리 17+ 는 mac-safari', () => {
    expect(installState({ win: win(), nav: { userAgent: UA.android }, promptUsed: true })).toBe('prompt-used');
    expect(installState({ win: win(), nav: { userAgent: UA.macSafari17 } })).toBe('mac-safari');
    expect(isMacSafariDock({ userAgent: UA.macSafari16 })).toBe(false);
    expect(isMacSafariDock({ userAgent: UA.macChrome })).toBe(false);
    expect(isMacSafariDock({ userAgent: UA.ipadOS, maxTouchPoints: 5 })).toBe(false);
    expect(installState({ win: win(), nav: { userAgent: UA.macChrome } })).toBe('manual');
  });
  it('설치 창이 있으면 prompt, 없으면 manual', () => {
    expect(installState({ win: win(), nav: { userAgent: UA.android }, hasPrompt: true })).toBe('prompt');
    expect(installState({ win: win(), nav: { userAgent: UA.android } })).toBe('manual');
    expect(installState()).toBe('manual');
  });
  it('isIOSSafari: 맥 사파리(터치 없음)는 아님', () => {
    expect(isIOSSafari({ userAgent: UA.ipadOS, maxTouchPoints: 0 })).toBe(false);
  });
});

describe('작은 안내(처음 몇 번만, 닫으면 끝)', () => {
  it('2~5번째 방문에서 설치할 수 있을 때만', () => {
    expect(shouldShowHint({ state: 'prompt', visits: 1 })).toBe(false);
    expect(shouldShowHint({ state: 'prompt', visits: 2 })).toBe(true);
    expect(shouldShowHint({ state: 'ios-safari', visits: 5 })).toBe(true);
    expect(shouldShowHint({ state: 'ios-other', visits: 3 })).toBe(true);
    expect(shouldShowHint({ state: 'ios-browser', visits: 3 })).toBe(true);
    expect(shouldShowHint({ state: 'prompt', visits: 6 })).toBe(false);
  });
  it('manual·standalone·thanks 이거나 닫았으면 안 보임', () => {
    for (const state of ['manual', 'standalone', 'thanks', 'prompt-used', 'in-app', 'mac-safari']) expect(shouldShowHint({ state, visits: 3 })).toBe(false);
    expect(shouldShowHint({ state: 'prompt', visits: 3, dismissed: true })).toBe(false);
  });
  it('닫기는 저장되고, 저장소가 없거나 막혀도 터지지 않음', () => {
    const s = store();
    expect(hintDismissed(s)).toBe(false);
    dismissHint(s);
    expect(s.m.get(HINT_KEY)).toBe('off');
    expect(hintDismissed(s)).toBe(true);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(hintDismissed(broken)).toBe(false);
    expect(() => dismissHint(broken)).not.toThrow();
    expect(bumpVisits(broken)).toBe(0);
  });
  it('방문 횟수는 HINT_UNTIL+1 에서 멈춤, 이상한 값은 0부터', () => {
    const s = store({ [VISIT_KEY]: 'abc' });
    expect(bumpVisits(s)).toBe(1);
    expect(bumpVisits(s)).toBe(2);
    for (let i = 0; i < 10; i++) bumpVisits(s);
    expect(s.m.get(VISIT_KEY)).toBe(String(HINT_UNTIL + 1));
  });
  it('같은 날 여러 번 열어도 1회, 다음 날 다시 1 늘어남', () => {
    const s = store();
    expect(bumpVisits(s, '2026-10-27')).toBe(1);
    for (let i = 0; i < 5; i++) expect(bumpVisits(s, '2026-10-27')).toBe(1); // 새로 고침
    expect(s.m.get(VISIT_DAY_KEY)).toBe('2026-10-27');
    expect(bumpVisits(s, '2026-10-28')).toBe(2);
    expect(bumpVisits(s, '2026-10-28')).toBe(2);
    expect(shouldShowHint({ state: 'prompt', visits: bumpVisits(s, '2026-10-28') })).toBe(true);
  });
});

function fakeWin() {
  const h = {};
  return { addEventListener: (t, f) => ((h[t] ||= []).push(f)), fire: (t, e = {}) => (h[t] || []).forEach((f) => f(e)) };
}
const bip = (outcome) => ({ preventDefault: vi.fn(), prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });

describe('createInstaller', () => {
  it('beforeinstallprompt 를 붙잡고(기본 띠 막음) 버튼에서 prompt()', async () => {
    const w = fakeWin(); const onChange = vi.fn();
    const ins = createInstaller({ win: w, onChange });
    expect(ins.hasPrompt()).toBe(false);
    expect(await ins.prompt()).toBe('unavailable');
    const e = bip('accepted');
    w.fire('beforeinstallprompt', e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('prompt');
    expect(ins.hasPrompt()).toBe(true);
    expect(await ins.prompt()).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(ins.hasPrompt()).toBe(false); // 한 번 쓴 이벤트는 다시 못 씀
  });
  it('취소하면 dismissed, prompt 가 실패하면 unavailable', async () => {
    const w = fakeWin(); const ins = createInstaller({ win: w });
    w.fire('beforeinstallprompt', bip('dismissed'));
    expect(await ins.prompt()).toBe('dismissed');
    w.fire('beforeinstallprompt', { preventDefault() {}, prompt: async () => { throw new Error('NotAllowed'); }, userChoice: Promise.resolve({}) });
    expect(await ins.prompt()).toBe('unavailable');
  });
  it('닫으면 promptUsed, 설치 창이 다시 오면 풀림', async () => {
    const w = fakeWin(); const ins = createInstaller({ win: w });
    w.fire('beforeinstallprompt', bip('dismissed'));
    expect(ins.promptUsed()).toBe(false);
    await ins.prompt();
    expect(ins.promptUsed()).toBe(true);
    w.fire('beforeinstallprompt', bip('accepted'));
    expect(ins.promptUsed()).toBe(false);
  });
  it('설치 창이 떠 있는 동안 또 누르면 busy(두 번째 창·오류 토스트 없음)', async () => {
    const w = fakeWin(); const ins = createInstaller({ win: w });
    let done; const e = { preventDefault() {}, prompt: vi.fn(() => new Promise((r) => { done = r; })), userChoice: Promise.resolve({ outcome: 'accepted' }) };
    w.fire('beforeinstallprompt', e);
    const first = ins.prompt();
    expect(ins.busy()).toBe(true);
    expect(await ins.prompt()).toBe('busy');
    done();
    expect(await first).toBe('accepted');
    expect(ins.busy()).toBe(false);
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });
  it('appinstalled 뒤에는 installed, 설치 창은 비움', () => {
    const w = fakeWin(); const onChange = vi.fn(); const ins = createInstaller({ win: w, onChange });
    w.fire('beforeinstallprompt', bip('accepted'));
    w.fire('appinstalled');
    expect(ins.installed()).toBe(true);
    expect(ins.hasPrompt()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith('installed');
  });
});

describe('installView', () => {
  it('standalone 이면 설정 칸 없음, 상태별 안내', () => {
    expect(installCard('standalone')).toBe('');
    expect(installCard('prompt')).toContain('data-action="install-app"');
    expect(installCard('ios-safari')).toContain('홈 화면에 추가');
    expect(installCard('ios-other')).toContain('사파리에서');
    expect(installCard('ios-browser')).toContain('주소창 오른쪽');
    expect(installCard('ios-browser')).toContain('홈 화면에 추가');
    expect(installCard('in-app')).toContain('다른 브라우저로 열기');
    expect(installCard('mac-safari')).toContain('Dock에 추가');
    expect(installCard('manual')).toContain('≡');
    expect(installCard('prompt-used')).toContain('브라우저 메뉴');
    expect(installCard('prompt-used')).not.toContain('<details'); // 이미 설치됨 도움말은 설치 창이 아예 안 왔을 때만
    expect(installCard('manual')).toContain('chrome://apps');
    expect(installCard('manual')).toContain('<details');
    expect(installCard('thanks')).toContain('고마워요');
    expect(installCard('thanks')).not.toContain('role="status"'); // 설치 알림은 토스트 한 번만
  });
  it('사파리 공유 버튼은 자리 말고 모양으로, 안 보이면 ⋯ 안(iOS 26 간결 탭 막대·아이패드)', () => {
    const t = installCard('ios-safari');
    expect(t).toMatch(/네모에서 화살표가 위로/);
    expect(t).toContain('⋯');
    expect(t).not.toMatch(/아래쪽|아래 가운데|화면 아래/);
  });
  it('작은 안내 글은 짧게(360px 에서 두 줄 안), 낱말 중간 줄바꿈 막기', () => {
    expect(installHint('prompt')).toContain('홈 화면에서 바로 열려요');
    expect(installHint('prompt')).not.toContain('한 번에');
    expect(readFileSync(new URL('../style.css', import.meta.url), 'utf8')).toMatch(/\.inst-hint > p[^{]*\{[^}]*word-break: keep-all/);
  });
  it('작은 안내는 설치할 수 있는 상태에서만, 닫기 버튼 있음', () => {
    expect(installHint('prompt')).toContain('data-install-hint-close');
    expect(installHint('prompt')).toContain('data-action="install-app"');
    expect(installHint('ios-safari')).toContain('data-nav="settings"');
    expect(installHint('manual')).toBe('');
    expect(installHint('ios-browser')).toContain('data-nav="settings"');
    for (const st of ['prompt-used', 'in-app', 'mac-safari']) expect(installHint(st)).toBe('');
    expect(installHint('standalone')).toBe('');
  });
});

describe('main.js 연결(설치 안내)', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  it('방문은 로그인 뒤 홈에서 하루 한 번만 셈(불러올 때 바로 세지 않음)', () => {
    expect(main).not.toMatch(/const visits = bumpVisits\(/);
    expect(main).toMatch(/visits \?\?= bumpVisits\(localStorage, today\(\)\)/);
    expect(main).toMatch(/function hintOn\(\) \{\s*if \(ui\.view !== 'home' \|\| !state\.user/);
  });
  it('안내가 뜨는 날은 팁보다 먼저(팁이 안내를 가리지 않음)', () => {
    expect(main).toMatch(/isSheetOpen\(\) \|\| hintOn\(\)\) \{ slot\.innerHTML = ''/);
    expect(main).not.toMatch(/!currentTip && !isSheetOpen\(\) && shouldShowHint/);
  });
  it('설치 창이 떠 있는 동안 버튼을 막고, 안내를 닫으면 초점을 옮김', () => {
    expect(main).toMatch(/if \(installer\.busy\(\)\) return;/);
    expect(main).toMatch(/\[data-action="install-app"\]'\)\.forEach\(\(b\) => \{ b\.disabled = true; \}\)/);
    expect(main).toMatch(/\(\$\('#tip-slot \.tip-x'\) \?\? \$\('#main'\)\)\?\.focus/);
  });
});
