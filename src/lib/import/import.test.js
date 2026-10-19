import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { decodeBytes } from './decode.js';
import { parseCSV, detectDelimiter } from './csvparse.js';
import { parseDate, parseAmount, last4, excelSerialToYmd } from './normalize.js';
import { roleOf, detectHeaderRow, detectPreset, guessMapping, missingRoles, headerSignature } from './mapping.js';
import { toCandidates, summarize } from './transform.js';
import { importHash, similarity, findDuplicates, fnv1a64 } from './dedupe.js';
import { readTable } from './read.js';

const bytes = (p) => new Uint8Array(readFileSync(p));
async function pipeline(path) {
  const t = await readTable(bytes(path), path, { XLSX });
  const rows = t.sheets[0].rows;
  const h = detectHeaderRow(rows);
  const header = rows[h].map(String);
  const map = guessMapping(header);
  return { t, h, header, map, preset: detectPreset(header), ...toCandidates(rows.slice(h + 1), map) };
}

describe('글자 인코딩', () => {
  test('UTF-8 BOM', () => expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0xea, 0xb0, 0x80]))).toEqual({ text: '가', encoding: 'utf-8' }));
  test('EUC-KR 자동 판별', () => {
    const r = decodeBytes(new Uint8Array([0xb0, 0xa1, 0xb0, 0xe8, 0xba, 0xce])); // 가계부
    expect(r).toEqual({ text: '가계부', encoding: 'euc-kr' });
  });
  test('직접 지정', () => expect(decodeBytes(new Uint8Array([0xb0, 0xa1]), 'utf-8').encoding).toBe('utf-8'));
});

describe('CSV 읽기', () => {
  test('따옴표 안 쉼표·줄바꿈·""', () => {
    expect(parseCSV('a,"b,1","c ""q""\nd"\r\n1,2,3\n')).toEqual([['a', 'b,1', 'c "q"\nd'], ['1', '2', '3']]);
  });
  test('빈 줄 제거·탭 구분자', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(parseCSV('a\tb\n\n1\t2', '\t')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('날짜·금액', () => {
  test.each([
    ['2026.10.03', '2026-10-03'], ['2026-10-03', '2026-10-03'], ['2026/10/3', '2026-10-03'], ['20261003', '2026-10-03'],
    ['26.10.03', '2026-10-03'], ['2026년 10월 3일', '2026-10-03'], ['2026.10.01 09:00:12', '2026-10-01'], [46298, '2026-10-03'],
    ['2026.02.30', null], ['abc', null], ['', null],
  ])('%s → %s', (v, out) => expect(parseDate(v)).toBe(out));
  test('엑셀 일련번호', () => expect(excelSerialToYmd(45658)).toBe('2025-01-01'));
  test.each([
    ['5,600', 5600], ['12,300원', 12300], ['₩12,300', 12300], ['-5,000', -5000], ['(5,000)', -5000], ['5,000-', -5000],
    [12300, 12300], [12300.6, 12301], ['+3,100,000', 3100000], ['', null], ['없음', null], ['1.5.3', null],
  ])('%s → %s', (v, out) => expect(parseAmount(v)).toBe(out));
  test('카드번호는 끝 4자리만', () => {
    expect(last4('1234-****-****-5678')).toBe('5678');
    expect(last4('본인 9876')).toBe('9876');
    expect(last4('***')).toBeNull();
  });
});

describe('열 추정·프리셋', () => {
  test('열 이름 → 용도', () => {
    expect(roleOf('이용일')).toBe('date'); expect(roleOf('가맹점명')).toBe('desc'); expect(roleOf('이용금액')).toBe('amount');
    expect(roleOf('출금액')).toBe('out'); expect(roleOf('입금액')).toBe('in'); expect(roleOf('잔액')).toBeNull();
    expect(roleOf('사업자등록번호')).toBeNull(); expect(roleOf('카드번호')).toBe('card');
  });
  test('머리글 줄 찾기(안내문 3줄 아래)', () => {
    expect(detectHeaderRow([['현대카드 이용내역'], ['기간'], [''], ['이용일', '가맹점명', '이용금액'], ['2026.10.03', 'a', '1']])).toBe(3);
  });
  test('같은 용도는 첫 열만, 입·출금 있으면 금액 열 무시', () => {
    expect(guessMapping(['이용일', '승인금액', '이용금액']).cols).toEqual(['date', 'amount', 'ignore']);
    expect(guessMapping(['거래일시', '금액', '출금액', '입금액']).cols).toEqual(['date', 'ignore', 'out', 'in']);
  });
  test('필수 열 안내', () => {
    expect(missingRoles(['desc', 'ignore'])).toEqual(['날짜 열을 골라 주세요.', '금액 열을 골라 주세요.']);
    expect(missingRoles(['date', 'out'])).toEqual([]);
  });
  test('머리글 서명은 열 이름만', () => expect(headerSignature([' 이용일 ', '가맹점명'])).toBe('이용일|가맹점명'));
});

describe('예시 파일 끝까지', () => {
  test('현대카드 .xls(HTML) — 취소 제외, 음수는 환급(수입), 카드 끝 4자리', async () => {
    const r = await pipeline('samples/현대카드_예시.xls');
    expect(r.t.kind).toBe('html'); expect(r.h).toBe(2); // 빈 줄은 읽을 때 빠짐 expect(r.preset.id).toBe('hyundai');
    expect(r.items).toHaveLength(8); expect(r.cancelled).toBe(1);
    expect(r.items[0]).toMatchObject({ date: '2026-10-03', amount: 5600, kind: 'expense', desc: '스타벅스 강남R점', approval: '30012345', card4: '5678' });
    expect(r.items.find((x) => x.desc.startsWith('이마트'))).toMatchObject({ kind: 'income', amount: 12000 });
    expect(r.items.find((x) => x.desc === '쿠팡').memo).toBe('쿠팡 · 3개월');
    expect(JSON.stringify(r.items)).not.toContain('1234-');
  });
  test('신한카드 .xlsx — 엑셀 날짜 칸', async () => {
    const r = await pipeline('samples/신한카드_예시.xlsx');
    expect(r.t.kind).toBe('excel'); expect(r.preset.id).toBe('shinhan');
    expect(r.items.map((x) => x.date)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
    expect(r.items[4]).toMatchObject({ amount: 55000, card4: '9876', memo: 'SK텔레콤 · 자동납부' });
  });
  test('은행 EUC-KR CSV — 입금·출금 분리, 잔액 무시', async () => {
    const r = await pipeline('samples/은행_예시_EUC-KR.csv');
    expect(r.t.encoding).toBe('euc-kr'); expect(r.preset.id).toBe('bank');
    expect(r.items).toHaveLength(5);
    expect(r.items[1]).toMatchObject({ date: '2026-10-10', amount: 3100000, kind: 'income' });
    expect(r.items[0]).toMatchObject({ amount: 650000, kind: 'expense', desc: '10월 월세' });
    expect(summarize(r.items)).toMatchObject({ count: 5, from: '2026-10-01', to: '2026-10-18', expense: 738200, income: 3101204 });
  });
  test('일반 CSV — 여러 날짜 표기', async () => {
    const r = await pipeline('samples/일반_예시.csv');
    expect(r.preset.id).toBe('generic');
    expect(r.items.map((x) => x.date)).toEqual(['2026-10-02', '2026-10-02', '2026-10-16', '2026-10-19']);
  });
  test('부호: 양수=수입, 뒤집기', () => {
    const map = { cols: ['date', 'amount'] };
    expect(toCandidates([['2026-10-01', '100']], map, { sign: 'income' }).items[0].kind).toBe('income');
    expect(toCandidates([['2026-10-01', '-100']], map, { sign: 'flip' }).items[0].kind).toBe('expense');
  });
  test('읽을 수 없는 줄은 건너뜀(0원·날짜 없음·10억 초과)', () => {
    const r = toCandidates([['', '100'], ['2026-10-01', '0'], ['2026-10-01', '2,000,000,000'], ['2026-10-01', '5']], { cols: ['date', 'amount'] });
    expect(r.items).toHaveLength(1); expect(r.invalid).toBe(3);
  });
});

describe('중복 감지', () => {
  const a = { date: '2026-10-03', amount: 5600, kind: 'expense', desc: '스타벅스 강남R점' };
  test('지문은 같은 입력에 같고 다른 입력에 다름', () => {
    expect(importHash(a)).toBe(importHash({ ...a }));
    expect(importHash(a)).not.toBe(importHash({ ...a, amount: 5601 }));
    expect(importHash({ ...a, approval: '1' })).not.toBe(importHash(a));
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(importHash(a)).toMatch(/^[0-9a-f]{16}$/);
  });
  test('비슷한 정도', () => {
    expect(similarity('스타벅스 강남R점', '스타벅스강남R점')).toBe(1);
    expect(similarity('스타벅스', '스타벅스 강남R점')).toBeGreaterThanOrEqual(0.8);
    expect(similarity('스타벅스', '이디야커피')).toBeLessThan(0.3);
  });
  test('확실 중복·의심·새 거래·파일 안 중복', () => {
    const items = [a, { ...a, date: '2026-10-04' }, { ...a, date: '2026-10-05', desc: '쿠팡' }, { ...a, date: '2026-10-05', desc: '쿠팡' }];
    const existing = [
      { date: '2026-10-03', amount: 5600, kind: 'expense', memo: '스타벅스 강남R점', importHash: importHash(a) },
      { date: '2026-10-04', amount: 5600, kind: 'expense', memo: '스타벅스' },
    ];
    const r = findDuplicates(items, existing);
    expect(r.sure).toHaveLength(1);
    expect(r.suspect.map((x) => x.reason)).toEqual(['existing', 'file']);
    expect(r.fresh).toHaveLength(1);
    // 파일 안 두 번째 건은 다른 지문(그래도 추가하면 다음 가져오기에서 확실 중복으로 잡힘)
    expect(r.suspect[1].item.importHash).not.toBe(r.fresh[0].importHash);
    const again = findDuplicates(items.slice(2), [...existing, ...[r.fresh[0], r.suspect[1].item].map((x) => ({ ...x, memo: x.desc }))]);
    expect(again.sure).toHaveLength(2);
  });
  test('같은 날 같은 금액이어도 가맹점이 다르면 새 거래', () => {
    const r = findDuplicates([{ ...a, desc: '이디야' }], [{ date: a.date, amount: a.amount, kind: 'expense', memo: '스타벅스' }]);
    expect(r.fresh).toHaveLength(1);
  });
});
