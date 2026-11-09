// 아래 독(쨈 교무수첩과 같은 키캡 독) 칸 배치. 가운데 '기록'(쨈 컵)은 고정이고, 왼쪽 3칸·오른쪽 3칸만 바꿉니다.
// 이 기기에만 저장: localStorage 'dockTabs' = { order: [아이디 6개], at: 고친 시각(ms) }. 계정 데이터(Firestore)는 건드리지 않습니다.
// 모르는 아이디·겹친 아이디·꺼진 기능 칸은 빼고, 모자란 칸은 기본 배치에서 채웁니다.

export const DOCK_KEY = 'dockTabs';
export const SIDE_COUNT = 6;

/** 칸 후보. view 가 있으면 그 화면으로, action 이면 동작(계산기·더 보기 메뉴) */
export const DOCK_POOL = [
  { id: 'home', label: '홈', view: 'home', name: '홈' },
  { id: 'calendar', label: '달력', view: 'calendar', name: '달력' },
  { id: 'chart', label: '차트', view: 'chart', name: '차트' },
  { id: 'budget', label: '예산', view: 'budget', name: '예산' },
  { id: 'calc', label: '계산기', action: 'calc', name: '계산기' },
  { id: 'more', label: '더', action: 'more', name: '더 보기(모든 메뉴)' },
  { id: 'assets', label: '연금', view: 'assets', name: '주식·연금' },
  { id: 'tax', label: '공제', view: 'tax', name: '세액공제' },
  { id: 'search', label: '검색', view: 'search', name: '검색' },
  { id: 'recurring', label: '반복', view: 'recurring', name: '반복 거래', feature: 'recurring' },
  { id: 'import', label: '가져오기', view: 'import', name: '파일 가져오기' },
  { id: 'settings', label: '설정', view: 'settings', name: '설정' },
];

export const DEFAULT_DOCK = ['home', 'calendar', 'chart', 'budget', 'calc', 'more'];

const byId = new Map(DOCK_POOL.map((t) => [t.id, t]));
export const dockItem = (id) => byId.get(id) || null;

/** 꺼진 기능(예: 반복 거래 끔)의 칸은 고를 수 없음 */
export function dockPool(features = {}) {
  return DOCK_POOL.filter((t) => !t.feature || features?.[t.feature] !== false);
}

export function normalizeDock(order, features = {}) {
  const ok = new Set(dockPool(features).map((t) => t.id));
  const out = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (ok.has(id) && !out.includes(id) && out.length < SIDE_COUNT) out.push(id);
  }
  for (const id of DEFAULT_DOCK) if (out.length < SIDE_COUNT && ok.has(id) && !out.includes(id)) out.push(id);
  for (const t of DOCK_POOL) if (out.length < SIDE_COUNT && ok.has(t.id) && !out.includes(t.id)) out.push(t.id);
  return out;
}

const live = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function loadDock(storage = live(), features = {}) {
  try {
    const raw = storage?.getItem?.(DOCK_KEY);
    return normalizeDock(raw ? JSON.parse(raw)?.order : null, features);
  } catch {
    return normalizeDock(null, features);
  }
}

export function saveDock(order, storage = live(), now = Date.now(), features = {}) {
  const clean = normalizeDock(order, features);
  try { storage?.setItem?.(DOCK_KEY, JSON.stringify({ order: clean, at: Math.round(now) })); } catch { /* 저장이 막힌 브라우저: 이번 화면에서만 */ }
  return clean;
}

/** 기본 배치로: 저장 키를 지움(다른 키는 그대로) */
export function resetDock(storage = live()) {
  try { storage?.removeItem?.(DOCK_KEY); } catch { /* 무시 */ }
  return [...DEFAULT_DOCK];
}

/** 칸 하나를 다른 항목으로. 이미 다른 칸에 있던 항목이면 두 칸을 맞바꿈 */
export function pickDock(order, slot, id, features = {}) {
  const next = normalizeDock(order, features);
  if (!dockPool(features).some((t) => t.id === id) || slot < 0 || slot >= SIDE_COUNT) return next;
  const from = next.indexOf(id);
  if (from >= 0) next[from] = next[slot];
  next[slot] = id;
  return normalizeDock(next, features);
}

/** 칸을 옆으로(dir −1 왼쪽, 1 오른쪽) */
export function moveDock(order, slot, dir, features = {}) {
  const next = normalizeDock(order, features);
  const to = slot + dir;
  if (slot < 0 || slot >= SIDE_COUNT || to < 0 || to >= SIDE_COUNT) return next;
  [next[slot], next[to]] = [next[to], next[slot]];
  return next;
}

/** 지금 화면에서 켜질 칸: 같은 화면, 없으면 부모 화면 칸(세액공제 → 연금) */
const ON_PARENT = { tax: 'assets' };
export function activeDockId(order, view) {
  const hit = order.find((id) => dockItem(id)?.view === view);
  if (hit) return hit;
  const parent = ON_PARENT[view];
  return parent && order.includes(parent) ? parent : null;
}
