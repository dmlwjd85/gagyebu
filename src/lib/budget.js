// 카테고리별 한도(byCategory) 정리: 보안 규칙과 같은 한도(키 30개, 0원 초과 정수만)
export const MAX_LIMITS = 30;
/**
 * 지운 카테고리 키는 늘 버리고, 숨긴(archived) 카테고리 키는 30개를 넘을 때만 버림
 * @returns {{ by: object, active: number, ok: boolean }} active = 쓰는(숨기지 않은) 카테고리 한도 개수
 */
/**
 * 카테고리 한도 경고. 90% 이상은 near, 한도를 넘으면 over.
 * 비율은 부동소수 대신 used * 10 >= limit * 9 로 비교한다.
 * @returns {{ categoryId, limit, used, level: 'over'|'near', name, emoji }[]}
 */
export function limitWarnings(limits = {}, spentByCat = {}, categories = []) {
  const names = new Map(categories.map((c) => [c.id, c]));
  const out = [];
  for (const [id, limit] of Object.entries(limits)) {
    if (!Number.isInteger(limit) || limit <= 0) continue;
    const usedRaw = spentByCat[id] ?? 0;
    if (!Number.isInteger(usedRaw)) throw new TypeError('사용액은 정수 원이어야 해요');
    const used = Math.max(0, usedRaw);
    let level = null;
    if (used > limit) level = 'over';
    else if (used * 10 >= limit * 9) level = 'near';
    if (!level) continue;
    const c = names.get(id);
    out.push({ categoryId: id, limit, used, level, name: c?.name ?? '기타', emoji: c?.emoji ?? '🧾' });
  }
  return out.sort((a, b) => (a.level === b.level ? b.used - a.used : a.level === 'over' ? -1 : 1));
}

export function pruneLimits(by = {}, categories = []) {
  const live = new Map(categories.map((c) => [c.id, c]));
  const keep = Object.entries(by).filter(([k, v]) => live.has(k) && Number.isInteger(v) && v > 0);
  const active = keep.filter(([k]) => !live.get(k).archived);
  const out = keep.length > MAX_LIMITS ? active : keep;
  return { by: Object.fromEntries(out), active: active.length, ok: out.length <= MAX_LIMITS };
}
