// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms).
// 기록 시트는 누르는 즉시 열림(main 과 같음 → 누른 직후 0.25초 안의 숫자·Enter 도 그대로 입력, QA 4차 D1).
// 터지는 연출은 시트 위에 겹친 컵 복사본(.fab-ghost, pointer-events:none)에서 보임 → 눈에는 보이고 누름은 아래 시트로 그대로 감.
// 진짜 버튼도 같은 순간 같은 연출을 돌려(PC 처럼 시트가 버튼을 덮지 않는 화면에서 두 컵이 정확히 겹침) 복사본과 함께 끝남.
// prefers-reduced-motion: 터지는 동작 없이 짧은 색 변화(.is-flash, 160ms)만, 이것도 시트 위 복사본에서 보임.
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const FLASH_MS = 160;
// 시트 위에 겹쳐 연출만 보여 주는 컵 복사본(누름은 통과). 크기·접시 모양은 지금 화면의 진짜 버튼 그대로 옮김
export function ghostOver(btn) {
  const disc = btn.querySelector('.fab-disc'), svg = disc?.querySelector('.cup-svg');
  if (!disc) return null;
  const r = disc.getBoundingClientRect(), cs = getComputedStyle(disc);
  const g = document.createElement('span');
  g.className = 'fab fab-ghost'; g.setAttribute('aria-hidden', 'true');
  g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const d = disc.cloneNode(true);
  for (const k of ['width', 'height', 'background', 'border', 'border-radius', 'box-shadow']) d.style.setProperty(k, cs.getPropertyValue(k));
  if (svg) { const c = getComputedStyle(svg), v = d.querySelector('.cup-svg'); v.style.width = c.width; v.style.height = c.height; }
  g.append(d); document.body.append(g);
  return g;
}
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, onBurst = () => {}, overlay = ghostOver }) {
  let end = null; // 지금 도는 연출을 끝내는 함수(다시 누르면 새로 시작)
  return (btn) => {
    if (isOpen()) return false;
    if (!btn) { onBurst(); open(); return true; }
    end?.();
    const cls = reduced() ? 'is-flash' : 'is-popping';
    const g = overlay(btn); // 시트가 열리기 전에 버튼 자리를 재 둠
    const els = [btn, g].filter(Boolean);
    for (const x of els) { x.classList.remove(cls); void x.offsetWidth; x.classList.add(cls); }
    open();
    const done = () => { for (const x of els) x.classList.remove(cls); g?.remove(); if (end === done) end = null; };
    end = done;
    if (cls === 'is-flash') { onBurst(); later(done, FLASH_MS); } else { later(() => onBurst(), BURST_AT_MS); later(done, POP_MS); }
    return true;
  };
}

// 연타 보호: 쨈 컵 버튼을 연달아 누르는 손가락이 막 열린 시트의 '저장'·바탕(닫기)에 떨어져 빈 저장 검사·닫힘이 일어나지 않게(QA 2차 D1).
// 구글 'clickbuster'(고스트 클릭 막기)와 같은 방식: 바로 앞 누름과 같은 자리(반지름 25px)에 400ms 안에 다시 떨어진 누름만 무시하고, 무시할 때마다 자리·창을 이어 감.
// 지키는 곳은 '저장'·바탕·✕ 뿐(sheet.js). 자판·카테고리·입력칸은 열린 직후라도 늘 받고, 받는 순간 묶음도 끝남(QA 4차 D2: 320 '8'·339 '0' 은 컵 바로 위에 있음).
// 키보드(Enter·Space) 연타는 자리 대신 키로 묶음: createTapBurst() 를 자리 없이 쓰고, 다른 키를 누르면 reset(QA 3차 N2).
export const BURST_QUIET_MS = 400;
export const BURST_RADIUS_PX = 25;
export function createTapBurst(quiet = BURST_QUIET_MS, radius = BURST_RADIUS_PX) {
  let until = -Infinity, at = null;
  const reset = () => { until = -Infinity; at = null; };
  return {
    // 버튼에서 누름 시작. 좌표를 주면 그 자리 근처의 되풀이 누름만 연타로 봄
    fromButton(t, x, y) { until = t + quiet; at = x == null ? null : { x, y }; },
    // 버튼 밖 누름: 창 안이고 바로 앞 누름과 같은 자리면 무시(창·자리 이어 감). 다른 자리면 받고 묶음 끝
    swallow(t, x, y) {
      if (t < until && (!at || Math.hypot(x - at.x, y - at.y) <= radius)) { until = t + quiet; if (at) at = { x, y }; return true; }
      reset(); return false;
    },
    reset,
  };
}
