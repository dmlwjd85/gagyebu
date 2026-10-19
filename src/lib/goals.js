// 저축 목표: 목표 금액·모은 금액·목표일 → 진행률, 한 달에 얼마씩 모으면 되는지.
import { parseYmd } from './dates.js';
export function goalProgress(g, today) {
  const target = Math.max(1, g.target || 0);
  const saved = Math.max(0, g.saved || 0);
  // 다 모으기 전에는 내림(999/1,000원이 100%로 보이지 않게)
  const pct = saved >= target ? 100 : Math.min(99, Math.floor((saved / target) * 100));
  const left = Math.max(0, target - saved);
  let months = null, perMonth = null, overdue = false;
  if (g.due && left > 0) {
    const a = parseYmd(today), b = parseYmd(g.due);
    months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1) + 1;
    overdue = g.due < today;
    perMonth = overdue ? left : Math.ceil(left / Math.max(1, months));
  }
  return { pct, left, done: left === 0, months, perMonth, overdue };
}
export function validateGoal(g) {
  const name = (g.name ?? '').trim();
  if (!name) return '목표 이름을 입력해 주세요.';
  if (name.length > 30) return '이름은 30자까지예요.';
  if (!Number.isInteger(g.target) || g.target <= 0) return '목표 금액을 입력해 주세요.';
  if (g.target > 10_000_000_000) return '목표는 100억 원까지예요.';
  if (!Number.isInteger(g.saved ?? 0) || (g.saved ?? 0) < 0) return '모은 금액이 올바르지 않아요.';
  return null;
}
