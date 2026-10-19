// 되돌리기(삭제·수정 취소)를 서버가 거부할 때 기록을 잃지 않기 위한 순서와 이 기기 보관함.
import { isRuleId } from './ids.js';
import { FALLBACK_CATEGORY } from './defaults.js';

const TX_KEYS = ['date', 'amount', 'kind', 'categoryId', 'accountId', 'memo', 'tags', 'importHash', 'importBatch', 'recurringId', 'card4'];
const pick = (tx) => Object.fromEntries(TX_KEYS.filter((k) => tx[k] !== undefined && tx[k] !== '').map((k) => [k, tx[k]]));

/**
 * 되돌리기 시도 순서(앞이 실패하면 다음):
 *  1) 같은 id·같은 내용  2) 새 자동 id·같은 내용
 *  3) 새 자동 id·규칙에 걸릴 수 있는 연결 칸을 뺀 내용(반복·묶음 id 제거, 형식 밖 카테고리 → 기타, 형식 밖 결제수단·카드 끝자리 제거)
 * 3)은 1)·2)와 내용이 같으면 넣지 않음.
 * @returns {{ newId: boolean, data: object }[]}
 */
export function restorePlans(tx) {
  const full = pick(tx);
  const plans = [{ newId: false, data: full }, { newId: true, data: full }];
  const min = { ...full };
  delete min.recurringId; delete min.importBatch;
  if (!isRuleId(min.categoryId)) min.categoryId = FALLBACK_CATEGORY[min.kind] ?? 'etc';
  if (min.accountId !== undefined && !isRuleId(min.accountId)) delete min.accountId;
  if (min.card4 !== undefined && !/^[0-9]{4}$/.test(min.card4)) delete min.card4;
  if (min.importHash !== undefined && !/^[0-9a-f]{16}$/.test(min.importHash)) delete min.importHash;
  if (JSON.stringify(min) !== JSON.stringify(full)) plans.push({ newId: true, data: min });
  return plans;
}

// 이 기기 보관함(계정별). 서버가 끝내 받지 않은 기록만 담고, 다시 저장되면 지움.
const key = (uid) => `keptTx:${uid}`;
export function keptList(uid, ls = globalThis.localStorage) {
  try { const v = JSON.parse(ls?.getItem(key(uid)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** 보관하고 보관 번호를 돌려줌. createdAt은 밀리초 숫자로 바꿔 둠(JSON 저장) */
export function keepTx(uid, tx, ls = globalThis.localStorage, now = Date.now()) {
  const list = keptList(uid, ls);
  const ms = typeof tx.createdAt?.toMillis === 'function' ? tx.createdAt.toMillis() : tx.createdAtMs;
  const item = { ...pick(tx), ...(tx.id ? { id: tx.id } : {}), ...(ms ? { createdAtMs: ms } : {}), keepKey: tx.keepKey || `${now.toString(36)}${list.length}` };
  if (!list.some((x) => x.keepKey === item.keepKey)) list.push(item);
  try { ls?.setItem(key(uid), JSON.stringify(list)); } catch { /* 저장 공간이 꽉 찬 경우: 화면에 안내만 */ }
  return item.keepKey;
}
export function unkeep(uid, keepKey, ls = globalThis.localStorage) {
  const list = keptList(uid, ls).filter((x) => x.keepKey !== keepKey);
  if (list.length) ls?.setItem(key(uid), JSON.stringify(list)); else ls?.removeItem(key(uid));
  return list;
}
