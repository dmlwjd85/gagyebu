// 카테고리별 한도(byCategory) 정리: 보안 규칙과 같은 한도(키 30개, 0원 초과 정수만)
export const MAX_LIMITS = 30;
/**
 * 지운 카테고리 키는 늘 버리고, 숨긴(archived) 카테고리 키는 30개를 넘을 때만 버림
 * @returns {{ by: object, active: number, ok: boolean }} active = 쓰는(숨기지 않은) 카테고리 한도 개수
 */
export function pruneLimits(by = {}, categories = []) {
  const live = new Map(categories.map((c) => [c.id, c]));
  const keep = Object.entries(by).filter(([k, v]) => live.has(k) && Number.isInteger(v) && v > 0);
  const active = keep.filter(([k]) => !live.get(k).archived);
  const out = keep.length > MAX_LIMITS ? active : keep;
  return { by: Object.fromEntries(out), active: active.length, ok: out.length <= MAX_LIMITS };
}
