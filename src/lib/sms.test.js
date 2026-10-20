import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults.js';
import { validateTx } from './validate.js';
import { SMS_FIXTURES, MULTI_SMS, NOW } from './sms.fixtures.js';
import {
  parseSms, draftFromItem, txFromDraft, isLikelyDuplicate, readClipboard, clipboardHint,
  failMessage, SMS_UNPARSED, SMS_DECLINED, pickAccount, composeMemo,
} from './sms.js';
import { smsPasteRow, smsHtml, blankSms, applySmsText } from '../ui/smsSheet.js';

const opt = { now: NOW };
const ALLOWED = new Set(['date', 'amount', 'kind', 'categoryId', 'accountId', 'memo', 'card4', 'importHash']);

describe('문자 파서', () => {
  test('파서 모듈은 네트워크를 쓰지 않는다', () => {
    const src = readFileSync(new URL('./sms.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(|XMLHttpRequest|https?:\/\//);
    expect(src).not.toMatch(/firebase|firestore/i);
  });

  test.each(SMS_FIXTURES)('$id', ({ text, expect: exp }) => {
    const r = parseSms(text, opt);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject(exp);
  });

  test('여러 문자는 오래된 시각부터', () => {
    const r = parseSms(MULTI_SMS, opt);
    expect(r.ok).toBe(true);
    expect(r.items.map((x) => `${x.date} ${x.time} ${x.status} ${x.amount}`)).toEqual([
      '2026-10-18 12:00 approval 35000',
      '2026-10-20 08:10 approval 4500',
      '2026-10-20 09:05 cancel 4500',
    ]);
  });

  test('빈 문자·읽을 수 없는 문자·거절은 저장하지 않는다', () => {
    expect(parseSms('   ', opt)).toEqual({ ok: false, reason: 'empty' });
    expect(parseSms('안녕하세요. 오늘 회의 있습니다.', opt).ok).toBe(false);
    expect(failMessage('unparsed')).toBe(SMS_UNPARSED);
    const due = parseSms('[신한카드] 10월 결제예정금액은 120,000원입니다.', opt);
    expect(due).toMatchObject({ ok: false, reason: 'unparsed' });
    const rej = parseSms('삼성카드 승인거절 한도초과 50,000원 10/20 스타벅스', opt);
    expect(rej).toMatchObject({ ok: false, reason: 'declined' });
    expect(failMessage('declined')).toBe(SMS_DECLINED);
    const spam = parseSms('[국외발신] [신한카드] 10/28 10:03 정*희님 1,680,000원 결제완료 P**** 문의전화:1599-8000', opt);
    expect(spam.ok).toBe(false);
  });

  test('거절 안내가 섞여 있으면 그 건만 빼 둔다', () => {
    const text = '신한카드(1101)승인 김*별 4,500원(일시불)10/20 08:10 스타벅스\n\n삼성카드 승인거절 한도초과 50,000원 10/19 스타벅스';
    const r = parseSms(text, opt);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.items[0].amount).toBe(4500);
  });

  test('1월에 받은 12월 문자는 작년', () => {
    const r = parseSms('신한카드(1101)승인 김*별 3,000원(일시불)12/28 09:00 이디야', { now: new Date(2026, 0, 5, 12) });
    expect(r.items[0].date).toBe('2025-12-28');
  });

  test('누적·잔액·카드 끝자리는 금액이 아니다', () => {
    const r = parseSms('[KB]10/20 16:40 498125****8895 박*서 50,000 입금 잔액 9,999,999 1644-9999', opt);
    expect(r.items[0].amount).toBe(50000);
    expect(r.items[0].card4).toBeNull();
  });
});

describe('거래로 바꾸기', () => {
  const cats = DEFAULT_CATEGORIES;
  const accounts = [
    ...DEFAULT_ACCOUNTS,
    { id: 'sh', emoji: '💳', name: '신한카드', type: 'card' },
  ];

  test('가맹점에 자동 분류 규칙을 적용하고, 취소는 음수 지출이다', () => {
    const rules = [{ match: '동네슈퍼', categoryId: 'living' }];
    const star = parseSms('신한카드(1101)승인 김*별 4,500원(일시불)10/20 08:10 스타벅스 강남R점', opt).items[0];
    const d1 = draftFromItem(star, { rules, categories: cats, accounts, txs: [] });
    expect(d1.categoryId).toBe('cafe');
    expect(d1.categoryBy).toBe('keyword');
    expect(d1.accountId).toBe('sh');
    const tx1 = txFromDraft(d1);
    expect(tx1.amount).toBe(4500);
    expect(tx1.kind).toBe('expense');
    expect(tx1.importHash).toBeUndefined();
    expect(validateTx(tx1)).toBeNull();
    expect([...Object.keys(tx1)].every((k) => ALLOWED.has(k))).toBe(true);

    const cancel = parseSms('신한카드(1101)취소 김*별 4,500원(일시불)10/20 09:05 스타벅스 강남R점', opt).items[0];
    const d2 = draftFromItem(cancel, { rules, categories: cats, accounts });
    expect(d2.categoryId).toBe('cafe');
    expect(d2.kind).toBe('expense');
    const tx2 = txFromDraft(d2);
    expect(tx2.amount).toBe(-4500);
    expect(tx2.kind).toBe('expense');
    expect(tx2.importHash).toMatch(/^[0-9a-f]{16}$/);
    expect(validateTx(tx2)).toBeNull();

    const custom = parseSms('카드 승인 8,000원 10/20 12:00 동네슈퍼', opt).items[0];
    expect(draftFromItem(custom, { rules, categories: cats, accounts }).categoryId).toBe('living');
    expect(draftFromItem(custom, { rules, categories: cats, accounts }).categoryBy).toBe('rule');
  });

  test('입금은 수입, 출금은 지출, 부분취소 메모', () => {
    const inn = parseSms('[하나은행] 10/03 09:40 입금 1,200,000원 급여 잔액 2,000,000원', opt).items[0];
    const din = draftFromItem(inn, { categories: cats, accounts });
    expect(din.kind).toBe('income');
    expect(din.categoryId).toBe('salary');
    expect(din.accountId).toBe('bank');
    expect(txFromDraft(din).amount).toBe(1200000);
    expect(txFromDraft(din).importHash).toBeUndefined();

    const out = parseSms('[NH농협] 10/14 08:22\n출금 55,000원\n잔액 800,000원\n월세', opt).items[0];
    expect(draftFromItem(out, { categories: cats, accounts }).categoryId).toBe('housing');

    const part = parseSms('삼성카드 부분취소 이*라 5,000원 10/21 19:02 쿠팡', opt).items[0];
    expect(composeMemo(part)).toContain('부분취소');
    expect(composeMemo(part)).toContain('쿠팡');
    const tx = txFromDraft(draftFromItem(part, { categories: cats, accounts }));
    expect(tx.amount).toBe(-5000);
    expect(tx.memo).toContain('부분취소');
    expect(tx.card4).toBeUndefined();
  });

  test('할부 개월과 같은 날 같은 금액이면 중복', () => {
    const item = parseSms('현대카드 승인\n박*민\n360,000원 3개월\n10/19 15:48\n무신사', opt).items[0];
    expect(composeMemo(item)).toContain('3개월');
    const draft = draftFromItem(item, {
      categories: cats, accounts,
      txs: [{ date: '2026-10-19', amount: 360000, kind: 'expense' }],
    });
    expect(draft.duplicate).toBe(true);
    expect(isLikelyDuplicate([{ date: '2026-10-19', amount: -360000 }], { date: '2026-10-19', amount: 360000 })).toBe(false);
    const named = pickAccount([{ id: 'kb', name: '국민체크', type: 'card' }], { issuer: 'KB국민카드', channel: 'card' });
    expect(named).toBe('kb');
  });
});

describe('미리보기', () => {
  const st = { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, rules: [], txs: [{ date: '2026-10-18', amount: -72490, kind: 'expense' }] };
  test('빠른 입력 버튼 문구', () => {
    expect(smsPasteRow()).toContain('문자 붙여넣기');
    expect(smsPasteRow()).toContain('data-sms');
  });
  test('읽지 못한 문자는 안내만 있고 저장 버튼이 없다', () => {
    const sms = applySmsText(blankSms(), '오늘 날씨가 좋아요', st);
    expect(sms.phase).toBe('paste');
    const html = smsHtml(sms, st);
    expect(html).toContain(SMS_UNPARSED);
    expect(html).not.toContain('data-sms-save');
  });
  test('취소 미리보기는 지출 차감과 중복을 보여 준다', () => {
    const sms = applySmsText(blankSms(), '신한카드(1101)취소 김*별 72,490원(일시불)10/18 11:40 (주)이마트', st);
    expect(sms.draft.categoryId).toBe('living');
    const html = smsHtml({ ...sms, draft: sms.draft, queue: sms.queue, index: 0 }, { ...st, now: NOW });
    expect(html).toContain('이 달 지출에서 빼요');
    expect(html).toContain('같은 날 같은 금액');
    expect(html).toContain('이 내용으로 저장');
    expect(html).toContain('이마트');
  });
  test('여러 문자는 첫 화면이 가장 오래된 건', () => {
    const sms = applySmsText(blankSms(), MULTI_SMS, st);
    expect(sms.queue[0].date).toBe('2026-10-18');
    expect(sms.queue[0].status).toBe('approval');
    const html = smsHtml(sms, st);
    expect(html).toContain('1/3');
    expect(html).toContain('오래된 것부터');
  });
});

describe('클립보드', () => {
  test('없거나 거절되거나 비어 있으면 붙여넣기 칸으로 넘긴다', async () => {
    expect(await readClipboard({})).toEqual({ ok: false, reason: 'unavailable' });
    expect(await readClipboard({ clipboard: { readText: async () => '' } })).toEqual({ ok: false, reason: 'empty' });
    expect(await readClipboard({ clipboard: { readText: async () => { throw new Error('denied'); } } })).toEqual({ ok: false, reason: 'denied' });
    expect(await readClipboard({ clipboard: { readText: async () => '신한카드 승인' } })).toEqual({ ok: true, text: '신한카드 승인' });
    expect(clipboardHint('denied')).toContain('붙여 넣');
    expect(clipboardHint('empty')).toContain('비어');
  });
});
