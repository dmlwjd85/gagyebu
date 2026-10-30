import { afterEach, describe, expect, test, vi } from 'vitest';
import { reportStrings, reportBodyText, loadReportFonts, drawReport, makeReport, reportFontsReady, REPORT_FONT_WAIT } from '../ui/report.js';
import { reportRunner, reportScreenKey, markReportBusy, prefetchAfterData } from '../ui/reportRun.js';
import { readFileSync } from 'node:fs';
import { singleRun } from '../ui/util.js';

// QA 2차 N1: 리포트 첫 그림에 첫 조각 밖 글자(떡·볶·쌀)가 대체 글꼴로 구워지던 것
const d = {
  ym: '2026-10', month: 10, income: 3100000, expense: 52000, saved: 3048000, spent: 52000, refund: 0,
  top: [{ emoji: '🍜', name: '떡볶이·쌀국수', amount: 37000 }, { emoji: '☕', name: '카페', amount: 15000 }],
  diff: 12, rate: 98, note: '', noSpend: 3, streak: 4, count: 2,
};

describe('리포트 이미지 글꼴 미리 받기', () => {
  test('그릴 글자 전부(카테고리 이름·금액·스티커 포함)로 400·700·제목 글꼴을 받은 뒤 그린다', async () => {
    const calls = [];
    const fonts = { load: (font, text) => { calls.push([font, text]); return Promise.resolve([]); } };
    const t = reportStrings(d);
    await loadReportFonts(t, fonts, 50);
    expect(calls.map((c) => c[0])).toEqual(['400 40px "JJAEM Body"', '700 40px "JJAEM Body"', '400 44px "JJAEM Title Flat"']);
    for (const [, text] of calls.slice(0, 2)) {
      for (const s of ['떡볶이·쌀국수', '카페', '37,000원', '3,048,000원', '2026년 10월 리포트', '10월에 남긴 돈', '저축률 98%', '지출 지난달보다 12% ↑', '많이 쓴 곳 TOP 3', '🔥 4일 연속 기록', '🧾 기록 2건', '광고 없는 가계부', '…']) expect(text).toContain(s);
    }
    expect(calls[2][1]).toBe('쨈 가계부');
    expect(reportBodyText(reportStrings({ ...d, top: [], refund: 5000 }))).toContain('이 달에는 환불만 있었어요(+5,000원).');
  });

  // 가짜 글꼴 목록: 굵기마다 언제 끝날지(ms) 또는 실패를 정함. 가짜 캔버스는 글자를 그린 시각을 적어 둠
  const later = (ms, fail) => new Promise((ok, no) => setTimeout(() => (fail ? no(new Error('offline')) : ok([])), ms));
  const fakeFonts = (plan) => ({ load: (font) => { const p = Object.entries(plan).find(([k]) => font.startsWith(k))?.[1]; return p === 'hang' ? new Promise(() => {}) : p === 'reject' ? Promise.reject(new Error('offline')) : later(p ?? 0); } });
  const fakeDocument = (fonts) => {
    const drawn = [];
    const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? (t) => ({ width: String(t).length * 20 }) : k === 'fillText' ? (t) => drawn.push([Date.now(), t]) : /^create.*Gradient$/.test(k) ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
    return { drawn, document: { fonts, createElement: () => ({ getContext: () => ctx, toBlob: (cb) => cb('png') }) } };
  };
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  test('한 조각이 실패해도 나머지 굵기가 다 올 때까지 기다린 뒤 그린다(QA 3차 M2)', async () => {
    vi.useFakeTimers({ now: 0 });
    const { drawn, document } = fakeDocument(fakeFonts({ '400 40px': 'reject', '700 40px': 1200, '400 44px': 800 }));
    vi.stubGlobal('document', document);
    let done = false;
    drawReport(d).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(drawn).toEqual([]); // 400 이 바로 실패해도 700(1.2초)은 아직 기다리는 중
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(true);
    expect(drawn[0]).toEqual([1200, '쨈 가계부']); // 700 이 끝난 바로 그때 그림
  });

  test('글꼴이 응답하지 않으면 3초 뒤 있는 글꼴로 그린다(QA 3차 M1)', async () => {
    expect(REPORT_FONT_WAIT).toBe(3000);
    vi.useFakeTimers({ now: 0 });
    const { drawn, document } = fakeDocument(fakeFonts({ '400 40px': 'hang', '700 40px': 'hang', '400 44px': 'hang' }));
    vi.stubGlobal('document', document);
    let blob;
    drawReport(d).then((b) => { blob = b; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(drawn).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(blob).toBe('png');
    expect(drawn[0][0]).toBe(3000);
    expect(drawn.map((x) => x[1])).toContain('떡볶이·쌀국수');
    expect(vi.getTimerCount()).toBe(0); // 남은 타이머 없음
  });

  test('글꼴이 빨리 오면 3초를 다 기다리지 않고, 끝난 뒤 기다림 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers({ now: 0 });
    const fonts = fakeFonts({ '400 40px': 100, '700 40px': 150, '400 44px': 50 });
    let ok = false;
    loadReportFonts(reportStrings(d), fonts).then(() => { ok = true; });
    await vi.advanceTimersByTimeAsync(150);
    expect(ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('리포트 버튼을 빠르게 여러 번 눌러도 이미지는 한 번만 만들고, 끝난 뒤에는 다시 만들 수 있다(QA 3차 M1)', async () => {
    vi.useFakeTimers({ now: 0 });
    const { drawn, document } = fakeDocument(fakeFonts({ '400 40px': 'hang', '700 40px': 'hang', '400 44px': 'hang' }));
    vi.stubGlobal('document', document);
    let made = 0;
    const run = singleRun(async () => { await drawReport(d); made += 1; return made; });
    const clicks = [run(), run(), run()];
    expect(run.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    clicks.push(run());
    await vi.advanceTimersByTimeAsync(2500);
    expect(await Promise.all(clicks)).toEqual([1, 1, 1, 1]);
    expect(made).toBe(1);
    expect(drawn.filter((x) => x[1] === '쨈 가계부')).toHaveLength(1); // 캔버스도 한 장만
    expect(run.busy()).toBe(false);
    const again = run();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await again).toBe(2);
  });
});

// QA 4차 P1: 느린 망에서 3초 제한에 걸린 첫 그림은 글꼴이 다 오면 다시 그리고, 저장·공유 직전에도 다시 그린 그림을 쓴다
describe('늦게 온 글꼴로 다시 그리기(QA 4차 P1)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  // arrive: 글꼴이 다 오는 시각(ms). check 는 그 뒤에만 true. 캔버스는 그릴 때마다 새 그림 번호를 돌려줌
  const setup = (arrive) => {
    let n = 0;
    const fonts = { load: () => new Promise((r) => setTimeout(r, Math.max(0, arrive - Date.now()))), check: () => Date.now() >= arrive };
    const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? (t) => ({ width: String(t).length * 20 }) : /^create.*Gradient$/.test(k) ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
    vi.stubGlobal('document', { fonts, createElement: () => ({ getContext: () => ctx, toBlob: (cb) => cb(`png${++n}`) }) });
    return fonts;
  };
  test('3초 안에 다 오면 한 번만 그리고 다시 그리지 않는다', async () => {
    vi.useFakeTimers({ now: 0 }); setup(1000);
    let img; makeReport(d).then((x) => { img = x; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(img.blob).toBe('png1'); expect(img.fresh).toBe(true); expect(img.late).toBe(null);
    expect(await img.current()).toBe('png1');
  });
  test('3초에 먼저 그리고, 글꼴이 다 오면(5초) 다시 그린다. 저장 직전 current()는 새 그림', async () => {
    vi.useFakeTimers({ now: 0 }); setup(5000);
    let img; makeReport(d).then((x) => { img = x; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(img.blob).toBe('png1'); expect(img.fresh).toBe(false);
    expect(await img.current()).toBe('png1'); // 아직 글꼴이 없으면 기다리지 않고 지금 그림
    let late; img.late.then((b) => { late = b; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(late).toBe('png2'); expect(img.fresh).toBe(true);
    expect(await img.current()).toBe('png2');
    expect(vi.getTimerCount()).toBe(0);
  });
  test('글꼴은 다 왔는데 아직 다시 그리기 전이면 current()가 다시 그린 그림을 기다린다', async () => {
    vi.useFakeTimers({ now: 0 }); const fonts = setup(5000);
    let img; makeReport(d).then((x) => { img = x; });
    await vi.advanceTimersByTimeAsync(3000);
    fonts.check = () => true; // 글꼴은 이미 있음(다른 화면에서 받음), load 약속만 아직
    let saved; img.current().then((b) => { saved = b; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toBe('png2');
    expect(reportFontsReady(reportStrings(d), fonts)).toBe(true);
    expect(reportFontsReady(reportStrings(d), { load() {} })).toBe(false);
  });
  test('창을 닫으면(stop) 늦게 와도 다시 그리지 않는다. 요약 공유(drawReport)는 다시 그리기를 걸지 않는다', async () => {
    vi.useFakeTimers({ now: 0 }); setup(5000);
    let img; makeReport(d).then((x) => { img = x; });
    await vi.advanceTimersByTimeAsync(3000);
    img.stop();
    let late = 'x'; img.late.then((b) => { late = b; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(late).toBe(null); expect(img.blob).toBe('png1');
    let blob; drawReport(d).then((b) => { blob = b; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(blob).toBe('png2');
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
  test('기다리는 중 취소(signal)하면 바로 끝나고 그리지 않는다(QA 4차 P2)', async () => {
    vi.useFakeTimers({ now: 0 }); setup(60000);
    const ctl = new AbortController();
    let img = 'x'; makeReport(d, { signal: ctl.signal }).then((x) => { img = x; });
    await vi.advanceTimersByTimeAsync(500);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(img).toBe(null);
    expect(await loadReportFonts(reportStrings(d), document.fonts, 3000, ctl.signal)).toBe(false); // 이미 취소된 신호면 바로 false
  });
});

// QA 4차 P2·P4·P5: main.js 와 잇는 부분(버튼 표시·화면 떠나면 취소·첫 데이터 뒤 미리 받기)
describe('리포트 버튼과 화면 그리기 잇기', () => {
  const button = () => {
    const attrs = {}, label = { textContent: '10월 리포트 카드 만들기', dataset: {} }, icon = { textContent: '📤', dataset: {} };
    return { attrs, label, icon, disabled: false, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, querySelector: (q) => ({ '[data-report-label]': label, '[data-report-icon]': icon })[q] ?? null };
  };
  const rootWith = (b) => ({ querySelectorAll: (q) => (q === '[data-action="report"]' ? [b] : []) });
  test('만드는 동안 버튼은 disabled·aria-busy·만드는 중 글자·⏳, 끝나면 원래대로(QA 4차 P4)', () => {
    const b = button(), root = rootWith(b);
    markReportBusy(root, true);
    expect(b.disabled).toBe(true); expect(b.attrs['aria-busy']).toBe('true');
    expect(b.label.textContent).toBe('리포트 카드 만드는 중…'); expect(b.icon.textContent).toBe('⏳');
    markReportBusy(root, true); // 다시 불러도 원래 글자를 잃지 않음
    markReportBusy(root, false);
    expect(b.disabled).toBe(false); expect(b.attrs['aria-busy']).toBeUndefined();
    expect(b.label.textContent).toBe('10월 리포트 카드 만들기'); expect(b.icon.textContent).toBe('📤');
    const views = readFileSync(new URL('../ui/views.js', import.meta.url), 'utf8');
    const btn = views.match(/<button class="report-btn" data-action="report">[\s\S]*?<\/button>/)[0];
    expect(btn).toMatch(/<span [^>]*data-report-icon>📤<\/span>/);
    expect(btn).toMatch(/<span [^>]*data-report-label>\$\{Number\(m\.viewYm\.slice\(5\)\)\}월 리포트 카드 만들기<\/span>/);
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.report-btn\[aria-busy="true"\] \{[^}]*border-style: dashed[^}]*\}/);
    expect(css).not.toMatch(/\.report-btn\[aria-busy="true"\] \{[^}]*opacity/);
  });
  test('만드는 동안 다른 화면·달로 가면 취소하고 창을 열지 않는다. 같은 화면을 다시 그리면 그대로(QA 4차 P2)', async () => {
    const b = button(); let opened = 0, sig;
    let finish; const open = (m, { signal }) => { sig = signal; return new Promise((r) => { finish = () => { if (!signal.aborted) opened += 1; r(); }; }); };
    const r = reportRunner({ root: rootWith(b), open });
    const home = reportScreenKey('chart', '2026-10', 'u1');
    const job = r.run({}, home); await Promise.resolve(); await Promise.resolve();
    expect(r.busy()).toBe(true); expect(b.disabled).toBe(true);
    r.afterRender(home); expect(sig.aborted).toBe(false); expect(b.disabled).toBe(true);
    r.afterRender(reportScreenKey('home', '2026-10', 'u1'));
    expect(sig.aborted).toBe(true);
    finish(); await job;
    expect(opened).toBe(0); expect(r.busy()).toBe(false); expect(b.disabled).toBe(false);
    // 달을 바꾸거나 로그아웃(null)해도 취소
    for (const k of [reportScreenKey('chart', '2026-09', 'u1'), null]) {
      const j = r.run({}, home); await Promise.resolve(); await Promise.resolve();
      r.afterRender(k); expect(sig.aborted).toBe(true); finish(); await j;
    }
    // 그대로 있으면 연다
    const j2 = r.run({}, home); await Promise.resolve(); await Promise.resolve(); r.afterRender(home); finish(); await j2;
    expect(opened).toBe(1);
  });
  test('실패는 알리고, 취소해서 끝난 것은 알리지 않는다', async () => {
    const errs = [];
    const r = reportRunner({ root: rootWith(button()), open: async () => { throw new Error('x'); }, onError: (e) => errs.push(e.message) });
    await r.run({}, 'a');
    expect(errs).toEqual(['x']);
    const r2 = reportRunner({ root: rootWith(button()), open: (m, { signal }) => new Promise((ok, no) => signal.addEventListener('abort', () => no(new Error('abort')))), onError: (e) => errs.push(e.message) });
    const j = r2.run({}, 'a'); await Promise.resolve(); await Promise.resolve(); r2.afterRender('b'); await j;
    expect(errs).toEqual(['x']);
  });
  test('첫 데이터(기록·설정)를 다 그린 뒤에만 .ks 미리 받기를 부른다(QA 3차 M5)', () => {
    const calls = []; const p = () => calls.push(1);
    for (const st of [{ user: null, txLoaded: true, settingsLoaded: true }, { user: {}, txLoaded: false, settingsLoaded: true }, { user: {}, txLoaded: true, settingsLoaded: false }]) prefetchAfterData(st, p);
    expect(calls).toEqual([]);
    prefetchAfterData({ user: {}, txLoaded: true, settingsLoaded: true }, p);
    expect(calls).toEqual([1]);
  });
  test('main.js 가 실제로 이 부분을 쓴다: render 끝·로그인 화면에서 afterRender, 첫 데이터 뒤 미리 받기, 리포트 열기에 signal 전달', () => {
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const render = main.slice(main.indexOf('function render() {'), main.indexOf('const tabBar ='));
    expect(render).toMatch(/if \(!state\.user\) \{ report\.afterRender\(null\); return gateView/);
    expect(render).toContain('prefetchAfterData(state, prefetchJjaemKs);');
    expect(render).toContain('report.afterRender(reportScreenKey(ui.view, m.viewYm, state.user?.uid));');
    expect(render).not.toMatch(/prefetchJjaemKs\(\)/);
    expect(main.match(/prefetchJjaemKs/g)).toHaveLength(2); // 가져오기 한 번 + render 끝 한 곳뿐(로그인 직후 홈이 늦어지지 않게)
    expect(main).toMatch(/const runReport = \(m\) => report\.run\(m, reportScreenKey\(ui\.view, m\.viewYm, state\.user\?\.uid\)\);/);
    expect(main).toMatch(/case 'report': return runReport\(m\);/);
    expect(main).toMatch(/open: async \(m, opts\) => \{ const \{ openReport \} = await import\('\.\/ui\/report\.js'\); if \(!opts\.signal\.aborted\) await openReport\(m, \{ toast, \.\.\.opts \}\); \}/);
    const rep = readFileSync(new URL('../ui/report.js', import.meta.url), 'utf8');
    expect(rep).toMatch(/const img = await makeReport\(d, \{ dark: m\.dark, signal \}\);\n  if \(!img \|\| signal\?\.aborted\)/);
    expect(rep).toMatch(/swap\(await img\.current\(\)\)/);
    expect(rep).toMatch(/img\.late\?\.then\(swap\)/);
  });
});
