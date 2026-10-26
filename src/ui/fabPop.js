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

// 연타 보호: 쨈 컵 버튼을 연달아 누르는 손가락이 막 열린 시트에 떨어져도 '저장'·바탕(닫기)에 닿지 않게(QA 2차 D1).
// 무시하는 것은 '컵 자리(버튼 사각형 + 사방 24px) 안의 누름'뿐이고, 창(마지막 누름 뒤 400ms)도 그 누름만 늘림(QA 3차 N1).
// 컵 자리 밖(자판·입력칸·카테고리·닫기…)은 시트가 열린 직후라도 바로 받음 → 컵 한 번 누르고 곧장 숫자를 쳐도 그대로 입력.
// 연타하는 손가락은 같은 자리에 떨어지므로 폰에서 컵 자리에 겹친 '저장'·바탕 연타는 계속 막힘.
// 키보드(Enter·Space) 연타는 자리 대신 키로 묶음: createTapBurst() 를 자리 없이 쓰고, 다른 키를 누르면 reset(QA 3차 N2).
export const BURST_QUIET_MS = 400;
export const BURST_PAD_PX = 24;
export function createTapBurst(quiet = BURST_QUIET_MS, pad = BURST_PAD_PX) {
  let until = -Infinity, zone = null;
  const inZone = (x, y) => !zone || (x >= zone.left - pad && x <= zone.right + pad && y >= zone.top - pad && y <= zone.bottom + pad);
  return {
    // 버튼에서 누름 시작. rect(버튼 사각형)를 주면 그 자리 안의 누름만 연타로 봄
    fromButton(t, rect = null) { until = t + quiet; zone = rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; },
    // 버튼 밖 누름: 연타 창 안이고 컵 자리 안이면 무시하고 창을 늘림. 자리 밖이면 받음(창은 그대로)
    swallow(t, x, y) { if (t < until && inZone(x, y)) { until = t + quiet; return true; } return false; },
    reset() { until = -Infinity; zone = null; },
  };
}
