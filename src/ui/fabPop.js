// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms) → 기록 시트.
// 입력이 기다리지 않게 시트는 연출 도중(250ms)에 열기 시작. 연달아 눌러도 시트는 한 번만 열림.
// 시트가 닫혀 있으면 누를 때마다 반드시 열림: 연출이 끝나기 전(520ms 안)에 닫고 다시 눌러도 바로 열림(QA: 소리·진동만 나던 문제).
// prefers-reduced-motion: 터지는 동작 없이 짧은 색 변화(.is-flash, 160ms)만. 모바일에서는 시트가 버튼을 덮으므로
// 색 변화가 눈에 보이도록 시트는 120ms 뒤에 열림(움직임 없이 바로 나타남).
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const OPEN_AT_MS = 250;
export const REDUCED_OPEN_MS = 120; // 움직임 줄이기: 버튼 색 변화를 본 뒤 시트
export const FLASH_MS = 160;
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, onBurst = () => {} }) {
  let pending = false; // 시트 열기가 예약돼 있음(누른 뒤 250ms 안) → 연타는 무시
  let popping = false; // '탁' 연출이 아직 도는 중(520ms)
  return (btn) => {
    if (pending || isOpen()) return false;
    if (popping) { onBurst(); open(); return true; } // 연출 도중 시트를 닫고 다시 누름 → 기다리게 하지 않고 바로 열기(소리만 내고 연출은 이어서)
    if (!btn) { onBurst(); open(); return true; }
    if (reduced()) {
      pending = true;
      btn.classList.add('is-flash');
      onBurst();
      later(() => { pending = false; open(); }, REDUCED_OPEN_MS);
      later(() => btn.classList.remove('is-flash'), FLASH_MS);
      return true;
    }
    pending = popping = true;
    btn.classList.remove('is-popping'); void btn.offsetWidth; btn.classList.add('is-popping');
    later(() => onBurst(), BURST_AT_MS);
    later(() => { pending = false; open(); }, OPEN_AT_MS);
    later(() => { btn.classList.remove('is-popping'); popping = false; }, POP_MS);
    return true;
  };
}

// 연타 보호: 쨈 컵 버튼에서 시작된 누름이 이어지는 동안(누름과 누름 사이가 400ms 안) 시트에 떨어지는 손가락은 모두 같은 연타로 보고 무시.
// 시트가 열린 시각이 아니라 '마지막 누름'부터 세므로, 120·200·300ms 간격으로 계속 눌러도 바탕(닫기)·'저장'·자판에 닿지 않음(QA 2차 D1).
// 400ms 동안 손을 떼고 있으면 끝 → 그 뒤 시트 안에서 새로 누른 것만 받음. 키보드 click(detail 0)은 포인터가 아니라 그대로 받음.
export const BURST_QUIET_MS = 400;
export function createTapBurst(quiet = BURST_QUIET_MS) {
  let until = -Infinity;
  return {
    fromButton(t) { until = t + quiet; }, // 버튼에서 누름 시작
    swallow(t) { if (t < until) { until = t + quiet; return true; } return false; }, // 버튼 밖 누름: 연타 중이면 무시하고 창을 늘림
    reset() { until = -Infinity; },
  };
}
