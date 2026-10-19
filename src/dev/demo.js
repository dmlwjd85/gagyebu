// 에뮬레이터 전용 예시 데이터 (배포본 번들에는 포함되지 않음)
import { addDays } from '../lib/dates.js';
export function demoTransactions(today) {
  const out = [];
  const add = (offset, amount, categoryId, memo = '', kind = 'expense', accountId = 'card') => out.push({ date: addDays(today, -offset), amount, categoryId, memo, kind, accountId });
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 170; i++) {
    if (rnd() < 0.25) continue;
    add(i, Math.round((7000 + rnd() * 9000) / 100) * 100, 'food', ['점심', '저녁', '김밥천국', '회사 앞 국밥'][i % 4]);
    if (rnd() < 0.6) add(i, Math.round((3000 + rnd() * 3500) / 100) * 100, 'cafe', ['아메리카노', '라떼', '빵'][i % 3]);
    if (rnd() < 0.5) add(i, 1450 * (1 + (i % 2)), 'transit', '지하철', 'expense', 'card');
    if (rnd() < 0.12) add(i, Math.round((20000 + rnd() * 60000) / 1000) * 1000, 'living', '마트 장보기');
    if (rnd() < 0.05) add(i, Math.round((30000 + rnd() * 90000) / 1000) * 1000, 'fashion', '#가을 옷');
    if (rnd() < 0.06) add(i, Math.round((12000 + rnd() * 30000) / 1000) * 1000, 'culture', '영화');
  }
  for (let mo = 0; mo < 6; mo++) {
    add(mo * 30 + 2, 3100000, 'salary', '월급', 'income', 'bank');
    add(mo * 30 + 4, 550000, 'housing', '월세', 'expense', 'bank');
    add(mo * 30 + 6, 69000, 'telecom', '휴대폰·OTT');
  }
  add(0, 4500, 'cafe', '아침 라떼');
  add(3, 120000, 'side', '중고 판매', 'income', 'bank');
  return out;
}
