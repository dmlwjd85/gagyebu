// 구석 팁 17개(design-spec 7절). 6번은 앱의 🔥가 '연속 기록 일수'라 뜻이 맞게 '매일 기록하면'으로 둠
export const TIPS = [
  '000 버튼요, 은근히 편해요.',
  '저장을 길게 누르면, 매달 같은 돈도 알아서 올라와요.',
  '아침엔 ☕, 점심엔 🍚. 시간 맞춰 먼저 띄워 줄게요.',
  '달력에서 날짜만 누르면, 그날 쓴 돈만 보여요.',
  '하루 한 푼도 안 쓰면 🌱 스티커가 붙어요.',
  '매일 기록하면 🔥 숫자가 올라가요. 오늘도 해볼까요?',
  '돈 날씨가 🌧️여도 괜찮아요. 내일 조금 아끼면 다시 맑아져요.',
  '왼쪽으로 밀면 바로 지워져요. 실수해도 되돌리면 돼요.',
  '카테고리 이름·이모지는 설정에서 마음대로 바꿔요.',
  'PC에선 숫자 치고 Enter만 누르면 저장돼요.',
  '카드사 엑셀을 끌어다 놓으면 한 번에 들어와요.',
  '내 데이터는 언제든 CSV로 가져갈 수 있어요. 광고도, 연동도 없어요.',
  '홈 화면에 추가하면 앱처럼 바로 열려요.',
  '월급이 25일이면, 한 달 시작일도 25일로 맞춰 보세요.',
  '메모에 #여행을 달아 두면, 나중에 찾기 편해요.',
  '밤엔 다크 모드가 눈에 편해요. 오른쪽 위 🌙 한 번이면 돼요.',
  '예산만 정하면, 오늘 쓸 돈이 알아서 나와요.',
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
