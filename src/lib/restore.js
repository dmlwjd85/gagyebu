// 되돌리기(삭제·수정 취소)를 서버가 거부할 때 기록을 잃지 않기 위한 순서와 이 기기 보관함.
import { isRuleId, isTxDocId, fixedId, fixedRecId } from './ids.js';
import { recTxId } from './recurring.js';
import { FALLBACK_CATEGORY } from './defaults.js';

const TX_KEYS = ['date', 'amount', 'kind', 'categoryId', 'accountId', 'memo', 'tags', 'importHash', 'importBatch', 'recurringId', 'card4', 'owner'];
const pick = (tx) => Object.fromEntries(TX_KEYS.filter((k) => tx[k] !== undefined && tx[k] !== '').map((k) => [k, tx[k]]));

/**
 * 되돌리기 시도 순서(앞이 실패하면 다음):
 *  1) 같은 id·같은 내용  2) 새 id·같은 내용(보관함에서 다시 저장할 땐 보관 때 정한 고정 id → 몇 번·몇 탭에서 해도 1건)
 *  3) 새 자동 id·규칙에 걸릴 수 있는 연결 칸을 뺀 내용(반복·묶음 id 제거, 형식 밖 카테고리 → 기타, 형식 밖 결제수단·카드 끝자리 제거)
 * 3)은 1)·2)와 내용이 같으면 넣지 않음.
 * @returns {{ newId: boolean, data: object }[]}
 */
export function restorePlans(tx) {
  const full = pick(tx);
  // 2)는 형식 밖 반복 id를 옮긴 반복 id(fixedRecId)로 바꿔 연결을 지킴
  const linked = full.recurringId && !isRuleId(full.recurringId) ? { ...full, recurringId: fixedRecId(full.recurringId) } : full;
  const plans = [{ newId: false, data: full }, { newId: true, data: linked }];
  const min = { ...full };
  delete min.recurringId; delete min.importBatch;
  if (!isRuleId(min.categoryId)) min.categoryId = FALLBACK_CATEGORY[min.kind] ?? 'etc';
  if (min.accountId !== undefined && !isRuleId(min.accountId)) delete min.accountId;
  if (min.card4 !== undefined && !/^[0-9]{4}$/.test(min.card4)) delete min.card4;
  if (min.importHash !== undefined && !/^[0-9a-f]{16}$/.test(min.importHash)) delete min.importHash;
  if (JSON.stringify(min) !== JSON.stringify(linked)) plans.push({ newId: true, data: min });
  return plans;
}

/**
 * 고치기 저장 위치(QA N6). 예전 형식 id라 규칙이 고치기를 늘 거부하는 문서는, 늘 같은 새 id로 옮겨 저장하고 예전 문서는 같은 묶음에서 지움.
 *  - rec-{예전 반복id}-{YYYY-MM} → rec-{fixedRecId(예전 반복id)}-{YYYY-MM}: 이미 옮긴 반복의 자동 기록 id와 같아서,
 *    그 달이 다시 자동 기록돼도 같은 문서에 겹칠 뿐 2건이 되지 않음
 *  - 그 밖의 형식 밖 id → 'tx' + 영문 18자(같은 id면 늘 같은 값 → 두 기기에서 고쳐도 1건)
 *  - 반복 id 칸이 형식 밖이면 옮긴 반복 id로 바꿈
 * @returns {{ id: string, recurringId?: string, moved: boolean }}
 */
export function editTarget(tx) {
  const recurringId = tx.recurringId && !isRuleId(tx.recurringId) ? fixedRecId(tx.recurringId) : tx.recurringId;
  if (isTxDocId(tx.id)) return { id: tx.id, recurringId, moved: false };
  const m = /^rec-(.+)-([0-9]{4}-(0[1-9]|1[0-2]))$/.exec(tx.id);
  const id = m && !isRuleId(m[1]) ? recTxId(fixedRecId(m[1]), m[2]) : fixedId('tx', tx.id);
  return { id, recurringId, moved: true };
}

// 이 기기 보관함(계정별). 서버가 끝내 받지 않은 기록만 담고, 다시 저장되면 지움.
const key = (uid) => `keptTx:${uid}`;
export function keptList(uid, ls = globalThis.localStorage) {
  try { const v = JSON.parse(ls?.getItem(key(uid)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** 보관 항목이 새 id로 저장될 때 쓸 고정 id('kp' + 영문 18자). 보관 때 정해 두고, 예전 항목은 보관 번호로 같은 값을 만듦 */
export const keepIdOf = (uid, item) => item.keepId || fixedId('kp', `${uid}:${item.keepKey}`);
/** 보관하고 보관 번호를 돌려줌. createdAt은 밀리초 숫자로 바꿔 둠(JSON 저장, 없으면 보관 시각 → 다시 저장할 때마다 같은 값) */
export function keepTx(uid, tx, ls = globalThis.localStorage, now = Date.now(), rand = Math.random) {
  const list = keptList(uid, ls);
  const ms = typeof tx.createdAt?.toMillis === 'function' ? tx.createdAt.toMillis() : tx.createdAtMs;
  const keepKey = tx.keepKey || `${now.toString(36)}${Math.floor(rand() * 36 ** 4).toString(36)}${list.length}`;
  const item = { ...pick(tx), ...(tx.id ? { id: tx.id } : {}), createdAtMs: ms || now, keepKey };
  item.keepId = keepIdOf(uid, { ...item, keepId: tx.keepId });
  if (!list.some((x) => x.keepKey === item.keepKey)) list.push(item);
  try { ls?.setItem(key(uid), JSON.stringify(list)); } catch { /* 저장 공간이 꽉 찬 경우: 화면에 안내만 */ }
  return item.keepKey;
}
export function unkeep(uid, keepKey, ls = globalThis.localStorage) {
  const list = keptList(uid, ls).filter((x) => x.keepKey !== keepKey);
  if (list.length) ls?.setItem(key(uid), JSON.stringify(list)); else ls?.removeItem(key(uid));
  return list;
}
