// 구석 팁 17개(design-spec 7절). 6번은 앱의 🔥가 '연속 기록 일수'라 뜻이 맞게 '매일 기록하면'으로 둠.
// 닫기·영구 제외·순서는 번호가 아니라 고정 키로 저장(팁을 끼워 넣거나 순서를 바꿔도 다른 팁이 숨지 않게, QA N2)
export const TIP_LIST = [
  ['k000', '000 버튼요, 은근히 편해요.'],
  ['longpress', '저장을 길게 누르면, 매달 같은 돈도 알아서 올라와요.'],
  ['timecat', '아침엔 ☕, 점심엔 🍚. 시간 맞춰 먼저 띄워 줄게요.'],
  ['calday', '달력에서 날짜만 누르면, 그날 쓴 돈만 보여요.'],
  ['sprout', '하루 한 푼도 안 쓰면 🌱 스티커가 붙어요.'],
  ['streak', '매일 기록하면 🔥 숫자가 올라가요. 오늘도 해볼까요?'],
  ['rain', '돈 날씨가 🌧️여도 괜찮아요. 내일 조금 아끼면 다시 맑아져요.'],
  ['swipe', '왼쪽으로 밀면 바로 지워져요. 실수해도 되돌리면 돼요.'],
  ['catedit', '카테고리 이름·이모지는 설정에서 마음대로 바꿔요.'],
  ['enter', 'PC에선 숫자 치고 Enter만 누르면 저장돼요.'],
  ['dropfile', '카드사 엑셀을 끌어다 놓으면 한 번에 들어와요.'],
  ['csv', '내 데이터는 언제든 CSV로 가져갈 수 있어요. 광고도, 연동도 없어요.'],
  ['homescreen', '홈 화면에 추가하면 앱처럼 바로 열려요.'],
  ['startday', '월급이 25일이면, 한 달 시작일도 25일로 맞춰 보세요.'],
  ['tag', '메모에 #여행을 달아 두면, 나중에 찾기 편해요.'],
  ['dark', '밤엔 다크 모드가 눈에 편해요. 오른쪽 위 🌙 한 번이면 돼요.'],
  ['budget', '예산만 정하면, 오늘 쓸 돈이 알아서 나와요.'],
].map(([key, text]) => ({ key, text }));
export const TIPS = TIP_LIST.map((t) => t.text);
const KEYS = TIP_LIST.map((t) => t.key);
// M2(640ff0f) 배열 순서: 예전 저장값의 번호 → 키. 이 순서는 바꾸지 말 것(이미 저장된 번호를 읽는 데 씀)
export const M2_ORDER = ['k000', 'timecat', 'calday', 'sprout', 'streak', 'rain', 'swipe', 'catedit', 'enter', 'csv', 'homescreen', 'startday', 'tag', 'dark', 'budget'];

/** 저장값 읽기: 번호로 된 예전 값(M2)은 M2 순서로 키에 옮기고, 모르는 키는 버림 */
export function migrateTipState(raw) {
  const s = { queue: [], hiddenOn: null, dismiss: {}, excluded: [], ...(raw && typeof raw === 'object' ? raw : {}) };
  const toKey = (x) => (s.v === 2 ? x : typeof x === 'number' || /^\d+$/.test(String(x)) ? M2_ORDER[Number(x)] : x);
  const ok = (k) => KEYS.includes(k);
  const dismiss = {};
  for (const [k, n] of Object.entries(s.dismiss || {})) { const key = toKey(k); if (ok(key)) dismiss[key] = Math.max(dismiss[key] || 0, Number(n) || 0); }
  return {
    v: 2,
    queue: (Array.isArray(s.queue) ? s.queue : []).map(toKey).filter(ok),
    hiddenOn: s.hiddenOn ?? null,
    dismiss,
    excluded: [...new Set((Array.isArray(s.excluded) ? s.excluded : []).map(toKey).filter(ok))],
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const emptyTipState = () => ({ v: 2, queue: [], hiddenOn: null, dismiss: {}, excluded: [] });

// 다음 팁 고르기. 섞은 순서대로 돌고, 다 돌면 다시 섞음. 반환: { tip, key, state } (tip이 null이면 오늘은 없음)
export function nextTip(state, today, rand = Math.random) {
  const s = migrateTipState(state);
  if (s.hiddenOn === today) return { tip: null, key: null, state: s };
  const allowed = KEYS.filter((k) => !s.excluded.includes(k));
  if (!allowed.length) return { tip: null, key: null, state: s };
  let queue = s.queue.filter((k) => allowed.includes(k));
  if (!queue.length) queue = shuffle(allowed, rand);
  const [key, ...rest] = queue;
  return { tip: TIP_LIST.find((t) => t.key === key).text, key, state: { ...s, queue: rest } };
}
// ✕: 오늘 하루 숨김, 같은 팁을 2번 닫으면 영구 제외
export function dismissTip(state, key, today) {
  const s = migrateTipState(state);
  const n = (s.dismiss[key] || 0) + 1;
  return { ...s, hiddenOn: today, dismiss: { ...s.dismiss, [key]: n },
    excluded: n >= 2 && !s.excluded.includes(key) ? [...s.excluded, key] : s.excluded };
}
