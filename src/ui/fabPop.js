// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms) → 기록 시트.
// 입력이 기다리지 않게 시트는 연출 도중(250ms)에 열기 시작. 연달아 눌러도 시트는 한 번만 열림.
// prefers-reduced-motion: 터지는 동작 없이 짧은 색 변화(.is-flash)만, 시트는 바로 열림.
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const OPEN_AT_MS = 250;
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, onBurst = () => {} }) {
  let busy = false;
  return (btn) => {
    if (busy || isOpen()) return false;
    busy = true;
    if (reduced() || !btn) {
      btn?.classList.add('is-flash');
      onBurst();
      later(() => { btn?.classList.remove('is-flash'); busy = false; }, 160);
      open();
      return true;
    }
    btn.classList.remove('is-popping'); void btn.offsetWidth; btn.classList.add('is-popping');
    later(() => onBurst(), BURST_AT_MS);
    later(() => open(), OPEN_AT_MS);
    later(() => { btn.classList.remove('is-popping'); busy = false; }, POP_MS);
    return true;
  };
}
