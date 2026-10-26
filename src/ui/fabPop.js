// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms) → 기록 시트.
// 입력이 기다리지 않게 시트는 연출 도중(250ms)에 열기 시작. 연달아 눌러도 시트는 한 번만 열림.
// 시트가 닫혀 있으면 누를 때마다 반드시 열림: 연출이 끝나기 전(520ms 안)에 닫고 다시 눌러도 바로 열림(QA: 소리·진동만 나던 문제).
// prefers-reduced-motion: 터지는 동작 없이 짧은 색 변화(.is-flash)만, 시트는 바로 열림.
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const OPEN_AT_MS = 250;
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, onBurst = () => {} }) {
  let pending = false; // 시트 열기가 예약돼 있음(누른 뒤 250ms 안) → 연타는 무시
  let popping = false; // '탁' 연출이 아직 도는 중(520ms)
  return (btn) => {
    if (pending || isOpen()) return false;
    if (popping) { onBurst(); open(); return true; } // 연출 도중 시트를 닫고 다시 누름 → 기다리게 하지 않고 바로 열기(소리만 내고 연출은 이어서)
    if (reduced() || !btn) {
      btn?.classList.add('is-flash');
      onBurst();
      later(() => btn?.classList.remove('is-flash'), 160);
      open();
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

// 시트가 올라오는 동안(0.28s 전환 + 여유) 들어온 손가락 누름은 무시: 연타한 두 번째 손가락이 올라오는 시트의 바탕(닫기)이나 '저장'에 떨어져
// 시트가 닫혔다 다시 열리거나 "금액을 먼저 입력해 주세요"가 뜨던 문제(QA). 키보드로 누른 click(detail 0)은 그대로 받음.
export const SHEET_GUARD_MS = 300;
export const isEarlyTap = (msSinceOpen, detail = 1) => detail > 0 && msSinceOpen >= 0 && msSinceOpen < SHEET_GUARD_MS;
