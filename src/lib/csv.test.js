import { test, expect } from 'vitest';
import { toCSV, csvCell } from './csv.js';
const cats = [{ id: 'food', name: '식비' }, { id: 'salary', name: '월급' }];
const accs = [{ id: 'card', name: '카드' }];
test('BOM·헤더·정렬·한국어 구분', () => {
  const out = toCSV([
    { date: '2026-10-02', amount: 3100000, kind: 'income', categoryId: 'salary' },
    { date: '2026-10-01', amount: 12000, kind: 'expense', categoryId: 'food', accountId: 'card', memo: '점심' },
  ], { categories: cats, accounts: accs });
  expect(out.startsWith('\uFEFF날짜,구분,카테고리,금액,결제수단,메모\r\n')).toBe(true);
  const lines = out.slice(1).trim().split('\r\n');
  expect(lines[1]).toBe('2026-10-01,지출,식비,12000,카드,점심');
  expect(lines[2]).toBe('2026-10-02,수입,월급,3100000,,');
});
test('쉼표·따옴표·줄바꿈 이스케이프', () => {
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('그가 "와"')).toBe('"그가 ""와"""');
  expect(csvCell('1\n2')).toBe('"1\n2"');
});
test('엑셀 수식 주입 방지', () => {
  expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  expect(csvCell('+1')).toBe("'+1");
  expect(csvCell('@sum')).toBe("'@sum");
});
test('삭제된 카테고리는 기타', () => expect(toCSV([{ date: '2026-10-01', amount: 1, kind: 'expense', categoryId: 'gone' }])).toContain(',지출,기타,1,,'));
