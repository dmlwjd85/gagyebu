import { afterEach, describe, expect, test, vi } from 'vitest';
import { reportStrings, reportBodyText, loadReportFonts, drawReport, REPORT_FONT_WAIT } from '../ui/report.js';
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
