// QA M2 재검수 2차(8.9/10) 결함별 재발 방지 테스트. ID는 /workspace/qa-gagyebu-m2-재검수/보고서.md 기준
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { byCategory, envelope, totals } from './stats.js';
import { donutSegments } from '../ui/charts.js';
import { pruneLimits, MAX_LIMITS } from './budget.js';
import { findDuplicates } from './import/dedupe.js';
import { emptyReason } from '../ui/importer.js';
import { readTable } from './import/read.js';
import { parseAmount } from './import/normalize.js';

const tx = (categoryId, amount) => ({ kind: 'expense', categoryId, amount, date: '2026-10-05' });

describe('N1 환불이 있을 때 카테고리 비율', () => {
  // QA 재현: 식비 5만·카페 1만·생활 2만 + 원거래 없는 환불(쇼핑) −4만
  const txs = [tx('food', 50000), tx('cafe', 10000), tx('living', 20000), tx('fashion', -40000)];
  test('비율은 순지출이 남은 카테고리 합(8만) 기준 0~100%, 합 100%', () => {
    const c = byCategory(txs);
    const pos = c.filter((x) => x.amount > 0);
    expect(pos.map((x) => [x.categoryId, x.share])).toEqual([['food', 0.625], ['living', 0.25], ['cafe', 0.125]]);
    expect(pos.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 10);
    for (const x of c) { expect(x.share).toBeGreaterThanOrEqual(0); expect(x.share).toBeLessThanOrEqual(1); }
    expect(totals(txs).expense).toBe(40000); // 총지출(순) 자체는 그대로
  });
  test('순지출 0 이하 카테고리는 over 표시·비율 0(도넛에서 빠짐)', () => {
    const c = byCategory(txs);
    expect(c.find((x) => x.categoryId === 'fashion')).toEqual({ categoryId: 'fashion', amount: -40000, share: 0, over: true });
    expect(c[c.length - 1].categoryId).toBe('fashion');
    // 같은 카테고리 안 환불은 차감(순지출)
    expect(byCategory([tx('food', 50000), tx('food', -12000)])).toEqual([{ categoryId: 'food', amount: 38000, share: 1 }]);
    // 상쇄(0원)도 도넛에서 빠짐
    expect(byCategory([tx('food', 5000), tx('food', -5000), tx('cafe', 3000)]).find((x) => x.categoryId === 'food')).toMatchObject({ amount: 0, share: 0, over: true });
  });
  test('환불만 있는 달: 비율 모두 0, NaN 없음', () => {
    const c = byCategory([tx('fashion', -40000)]);
    expect(c).toEqual([{ categoryId: 'fashion', amount: -40000, share: 0, over: true }]);
  });
  test('도넛 조각은 겹치지 않고 한 바퀴를 넘지 않음(잘못된 share가 와도)', () => {
    const C = 100;
    const segs = donutSegments([{ share: 1.25 }, { share: 0.5 }, { share: -1 }, { share: 0.25 }], C);
    let end = 0;
    for (const s of segs) { expect(s.offset).toBeGreaterThanOrEqual(end - 1e-9); expect(s.len).toBeGreaterThanOrEqual(0); end = s.offset + s.len; }
    expect(end).toBeLessThanOrEqual(C);
    const ok = donutSegments(byCategory(txs).filter((x) => x.amount > 0), C);
    expect(ok.map((s) => Math.round(s.offset))).toEqual([0, 63, 88]);
    expect(Math.round(ok[2].offset + ok[2].len + 2)).toBe(100);
  });
});

describe('N2 예산 봉투 막대', () => {
  test('환불만 있어 사용액이 음수면 막대 0%·환불 표시', () => {
    expect(envelope(-30000, 30000)).toEqual({ width: 0, pct: 0, over: false, near: false, refund: 30000, used: 0 });
  });
  test('보통·90% 이상·넘침·한도 없음', () => {
    expect(envelope(15000, 30000)).toMatchObject({ width: 50, pct: 50, over: false, near: false });
    expect(envelope(27000, 30000)).toMatchObject({ width: 90, near: true, over: false });
    expect(envelope(45000, 30000)).toMatchObject({ width: 100, over: true, near: false });
    expect(envelope(5000, 0)).toMatchObject({ width: 0, over: false });
    for (const sp of [-1e9, -1, 0, 1, 1e9]) { const e = envelope(sp, 30000); expect(e.width).toBeGreaterThanOrEqual(0); expect(e.width).toBeLessThanOrEqual(100); }
  });
});

describe('N4 카테고리 한도 30개 세기', () => {
  const cats = Array.from({ length: 32 }, (_, i) => ({ id: `c${i}`, kind: 'expense' }));
  const limits = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, 1000]));
  test('지운 카테고리 키는 빼고 셈', () => {
    const live = cats.filter((c) => c.id !== 'c0'); // c0 지움
    const r = pruneLimits({ ...limits(30), c30: 5000 }, live);
    expect(r).toMatchObject({ ok: true, active: 30 });
    expect(r.by).not.toHaveProperty('c0');
  });
  test('숨긴 카테고리는 30개를 넘을 때만 버림, 쓰는 카테고리가 31개면 거부', () => {
    const arch = cats.map((c) => (c.id === 'c1' ? { ...c, archived: true } : c));
    expect(pruneLimits(limits(30), arch).by).toHaveProperty('c1');
    const r = pruneLimits({ ...limits(30), c30: 1 }, arch);
    expect(r).toMatchObject({ ok: true, active: 30 }); expect(r.by).not.toHaveProperty('c1');
    expect(pruneLimits(limits(31), cats)).toMatchObject({ ok: false, active: 31 });
    expect(MAX_LIMITS).toBe(30);
  });
  test('0·소수·문자 값은 버림', () => {
    expect(pruneLimits({ c0: 0, c1: 1.5, c2: '많이', c3: 100 }, cats).by).toEqual({ c3: 100 });
  });
});

describe('N5 중복 의심 강도', () => {
  test('메모 있는 직접 기록(가게 다름)은 같은 금액·카테고리여도 새 거래', () => {
    const existing = [{ date: '2026-10-02', amount: 8000, kind: 'expense', memo: '김밥', categoryId: 'food' }];
    const r = findDuplicates([{ date: '2026-10-03', amount: 8000, kind: 'expense', desc: '맥도날드 역삼점', categoryId: 'food' }], existing);
    expect(r.fresh).toHaveLength(1); expect(r.suspect).toHaveLength(0);
  });
  test('메모 없는 직접 기록: 같은 날·같은 카테고리면 강한 의심, 아니면 약한 의심', () => {
    const ex = (date, categoryId) => [{ date, amount: 5600, kind: 'expense', memo: '', categoryId }];
    const it = [{ date: '2026-10-03', amount: 5600, kind: 'expense', desc: '스타벅스', categoryId: 'cafe' }];
    expect(findDuplicates(it, ex('2026-10-03', 'cafe')).suspect[0].strength).toBe('strong');
    expect(findDuplicates(it, ex('2026-10-04', 'cafe')).suspect[0].strength).toBe('weak');
    expect(findDuplicates(it, ex('2026-10-03', 'food')).suspect[0].strength).toBe('weak');
  });
  test('가맹점 이름이 같으면(별칭 포함) 강한 의심, 파일 안 같은 줄도 강한 의심', () => {
    const r = findDuplicates([{ date: '2026-10-05', amount: 13500, kind: 'expense', desc: 'NETFLIX.COM' }], [{ date: '2026-10-05', amount: 13500, kind: 'expense', memo: '넷플릭스' }]);
    expect(r.suspect[0].strength).toBe('strong');
    const f = findDuplicates([{ date: '2026-10-02', amount: 6500, kind: 'expense', desc: '동네빵집' }, { date: '2026-10-02', amount: 6500, kind: 'expense', desc: '동네빵집' }], []);
    expect(f.suspect[0]).toMatchObject({ reason: 'file', strength: 'strong' });
  });
});

describe('N6 새로 가져올 거래 0건 이유', () => {
  test('이미 있음·건너뛴 중복·취소·상계·못 읽은 줄', () => {
    expect(emptyReason({ sure: [1, 2, 3], suspect: [], cancelled: 1, offset: 0, invalid: 0 })).toBe('이미 가져온 거래 3건, 취소된 결제 1건이 있어서 새로 넣을 거래가 없어요.');
    expect(emptyReason({ sure: [], suspect: [1], cancelled: 0, offset: 2, invalid: 1 })).toBe('중복이라 건너뛰기로 고른 1건, 환불로 상쇄된 2건, 날짜·금액을 읽을 수 없는 1줄이 있어서 새로 넣을 거래가 없어요.');
    expect(emptyReason({ sure: [], suspect: [], cancelled: 0, offset: 0, invalid: 0 })).toBe('이 파일에는 가져올 거래가 없어요.');
  });
});

describe('N7 예시 파일 합계 줄', () => {
  test('합계 줄 = 위 모든 줄의 승인금액·이용금액 합', async () => {
    const t = await readTable(new Uint8Array(readFileSync('samples/현대카드_실제형식_예시.xlsx')), 'x.xlsx', { XLSX });
    const rows = t.sheets[0].rows;
    const h = rows.findIndex((r) => r.includes('이용금액'));
    const body = rows.slice(h + 1).filter((r) => r[0]);
    const sum = rows.find((r) => r.includes('합계'));
    for (const col of ['승인금액', '이용금액']) {
      const i = rows[h].indexOf(col);
      expect(parseAmount(sum[i])).toBe(body.reduce((a, r) => a + parseAmount(r[i]), 0));
    }
  });
});
