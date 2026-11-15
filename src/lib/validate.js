import { isYmd } from './dates.js';
import { OWNERS } from './couple.js';
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_MEMO = 200;
// 저장 전 클라이언트 검증 (firestore.rules 와 같은 기준)
export function validateTx(t) {
  // 음수는 카드 환불(지출 차감)만 허용
  if (!Number.isInteger(t.amount) || t.amount === 0 || (t.amount < 0 && t.kind !== 'expense')) return '금액을 먼저 입력해 주세요.';
  if (Math.abs(t.amount) > MAX_AMOUNT) return '한 번에 10억 원까지 입력할 수 있어요.';
  if (t.kind !== 'expense' && t.kind !== 'income') return '지출인지 수입인지 골라 주세요.';
  if (!t.categoryId) return '카테고리를 골라 주세요.';
  if (!isYmd(t.date)) return '날짜가 올바르지 않아요.';
  if ((t.memo ?? '').length > MAX_MEMO) return `메모는 ${MAX_MEMO}자까지 쓸 수 있어요.`;
  if (t.owner != null && t.owner !== '' && !OWNERS.includes(t.owner)) return '누구 돈은 나, 배우자, 공동 중에서 골라 주세요.';
  return null;
}
export function validateCategory(c) {
  const name = (c.name ?? '').trim();
  if (!name) return '이름을 입력해 주세요.';
  if (name.length > 20) return '이름은 20자까지예요.';
  if (!c.emoji || [...c.emoji].length > 8) return '이모지를 하나 골라 주세요.';
  return null;
}
