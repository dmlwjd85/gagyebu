export const TIPS = [
  '금액 키패드의 000 버튼, 은근히 편해요.',
  '아침엔 ☕, 점심엔 🍚가 먼저 떠요. 시간 맞춰 추천해 줘요.',
  '달력에서 날짜를 누르면 그날 쓴 돈만 모아 볼 수 있어요.',
  '하루 동안 한 푼도 안 쓰면 🌱 스티커가 붙어요.',
  '매일 기록하면 🔥 숫자가 올라가요. 오늘도 도전?',
  '돈 날씨가 🌧️여도 괜찮아요. 내일 조금 아끼면 다시 맑아져요.',
  '거래를 왼쪽으로 밀면 바로 지울 수 있어요. 실수해도 되돌리기가 있어요.',
  '카테고리 이름과 이모지는 설정에서 내 마음대로 바꿀 수 있어요.',
  'PC에선 숫자 입력 후 Enter만 누르면 저장돼요.',
  '내 데이터는 언제든 CSV로 내보낼 수 있어요. 광고도, 연동도 없어요.',
  '홈 화면에 추가하면 앱처럼 바로 열려요.',
  '월급날이 25일이라면, 설정에서 한 달 시작일을 25일로 바꿔 보세요.',
  '메모에 #여행 처럼 태그를 달면 나중에 모아 보기 쉬워요.',
  '밤에는 다크 모드가 눈에 편해요. 오른쪽 위 🌙를 눌러 보세요.',
  '예산을 정하면 오늘 쓸 수 있는 돈이 자동으로 계산돼요.',
];

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const emptyTipState = () => ({ queue: [], hiddenOn: null, dismiss: {}, excluded: [] });

// 다음 팁 고르기. 섞은 순서대로 돌고, 다 돌면 다시 섞음. 반환: { tip, index, state } 또는 null
export function nextTip(state, today, rand = Math.random, count = TIPS.length) {
  const s = { ...emptyTipState(), ...state };
  if (s.hiddenOn === today) return { tip: null, state: s };
  const allowed = [...Array(count).keys()].filter((i) => !s.excluded.includes(i));
  if (!allowed.length) return { tip: null, state: s };
  let queue = s.queue.filter((i) => allowed.includes(i));
  if (!queue.length) queue = shuffle(allowed, rand);
  const [index, ...rest] = queue;
  return { tip: TIPS[index], index, state: { ...s, queue: rest } };
}
// ✕: 오늘 하루 숨김, 같은 팁을 2번 닫으면 영구 제외
export function dismissTip(state, index, today) {
  const s = { ...emptyTipState(), ...state };
  const n = (s.dismiss[index] || 0) + 1;
  return { ...s, hiddenOn: today, dismiss: { ...s.dismiss, [index]: n },
    excluded: n >= 2 && !s.excluded.includes(index) ? [...s.excluded, index] : s.excluded };
}
