import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { reportStrings, reportBodyText, loadReportFonts } from '../ui/report.js';

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

  test('글꼴 받기가 끝나지 않아도 정해진 시간 뒤에는 그린다', async () => {
    const t0 = Date.now();
    await loadReportFonts(reportStrings(d), { load: () => new Promise(() => {}) }, 30);
    expect(Date.now() - t0).toBeLessThan(1000);
    await loadReportFonts(reportStrings(d), { load: () => Promise.reject(new Error('offline')) }, 30);
  });

  test('drawReport 는 캔버스를 만들기 전에 글꼴을 기다리고, 미리 받은 글자와 같은 문자열로 그린다', () => {
    const src = readFileSync('src/ui/report.js', 'utf8');
    const body = src.slice(src.indexOf('export async function drawReport'), src.indexOf('export async function openReport'));
    expect(body.indexOf('await loadReportFonts(t)')).toBeGreaterThan(0);
    expect(body.indexOf('await loadReportFonts(t)')).toBeLessThan(body.indexOf("createElement('canvas')"));
    expect(body).not.toMatch(/fillText\(['`]/); // 글자를 그 자리에서 새로 만들지 않음
    expect(body).not.toMatch(/fit\(ctx, [`'f]/);
  });
});
