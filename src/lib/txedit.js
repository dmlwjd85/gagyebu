// 기록 고치기: 시트에서 고칠 수 없는 칸(가져오기 지문·묶음 id·카드 끝 4자리·반복 id)은 원래 값을 그대로 둠
// → 고친 뒤에도 다시 가져오면 '이미 있음', 되돌리기는 묶음 전체를 지움
export const KEEP_ON_EDIT = ['importHash', 'importBatch', 'card4', 'recurringId'];
export function withKeptFields(edited, original) {
  if (!original) return edited;
  const out = { ...edited };
  for (const k of KEEP_ON_EDIT) if (original[k] != null && out[k] == null) out[k] = original[k];
  return out;
}
