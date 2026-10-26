// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms).
// 기록 시트는 누르는 즉시 열림(main 과 같음 → 누른 직후 0.25초 안의 숫자·Enter 도 그대로 입력, QA 4차 D1).
// 터지는 연출은 시트 위에 겹친 컵 복사본(.fab-ghost, pointer-events:none)에서 보임 → 눈에는 보이고 누름은 아래 시트로 그대로 감.
// 다만 컵 자리가 열린 시트 판과 겹치면(320 '8'·339 '0'·360·390 '저장' 자리) 복사본을 그리지 않음 → 자판·'저장' 위에 컵이 떠 있어 또 누르게 되는 일이 없음(QA 5차 D1).
// 진짜 버튼도 같은 연출을 돌림(PC 처럼 시트가 버튼을 덮지 않는 화면에서는 두 컵이 정확히 겹침).
// 클릭 안에서는 버튼 자리만 재고 바로 시트를 엶. 복사본 붙이기·연출 클래스·소리는 시트가 그려진 다음 프레임 뒤로 미룸(QA 5차 D2: 클릭 직후 다음 누름이 열린 시트에 닿게).
// prefers-reduced-motion: 터지는 동작 없이 짧은 색 변화(.is-flash, 160ms)만.
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const FLASH_MS = 160;
// 다음 프레임이 그려진 뒤에 fn(시트가 먼저 화면에 나오게)
export const afterFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(fn, 0)) : setTimeout(fn, 0));
// 컵 접시 자리를 지금 재 두고, 나중에 cover(열린 시트 판, 기본은 앱의 #sheet-root .sheet)와 겹치지 않을 때만 복사본을 붙이는 함수를 돌려줌.
// 시트 판은 미끄러져 올라오는 중이라 transform 을 뺀 제자리(offset 상자)로 겹침을 봄
export function ghostOver(btn) {
  const disc = btn.querySelector('.fab-disc'), svg = disc?.querySelector('.cup-svg');
  if (!disc) return null;
  const r = disc.getBoundingClientRect(), cs = getComputedStyle(disc), sc = svg && getComputedStyle(svg);
  const look = ['width', 'height', 'background', 'border', 'border-radius', 'box-shadow'].map((k) => [k, cs.getPropertyValue(k)]);
  const svgSize = sc && [sc.width, sc.height];
  return (cover) => {
    if (cover && overlaps(r, homeBox(cover))) return null;
    const g = document.createElement('span');
    g.className = 'fab fab-ghost'; g.setAttribute('aria-hidden', 'true');
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    const d = disc.cloneNode(true);
    for (const [k, v] of look) d.style.setProperty(k, v);
    if (svgSize) { const v = d.querySelector('.cup-svg'); v.style.width = svgSize[0]; v.style.height = svgSize[1]; }
    g.append(d); document.body.append(g);
    return g;
  };
}
const homeBox = (el) => { const p = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }; const left = p.left + el.offsetLeft, top = p.top + el.offsetTop; return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight }; };
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, frame = afterFrame, onBurst = () => {}, overlay = ghostOver, cover = () => document.querySelector('#sheet-root .sheet') }) {
  let end = null; // 지금 도는 연출을 끝내는 함수(다시 누르면 새로 시작)
  return (btn) => {
    if (isOpen()) return false;
    if (!btn) { onBurst(); open(); return true; }
    end?.();
    const cls = reduced() ? 'is-flash' : 'is-popping';
    const place = overlay(btn); // 시트가 열리기 전에 버튼 자리만 재 둠
    open();
    let g = null;
    const done = () => { btn.classList.remove(cls); g?.classList.remove(cls); g?.remove(); if (end === done) end = null; };
    end = done;
    frame(() => {
      if (end !== done) return; // 그새 다시 눌려 새 연출이 시작됨
      g = place?.(cover()) ?? null;
      for (const x of [btn, g]) if (x) { x.classList.remove(cls); void x.offsetWidth; x.classList.add(cls); }
      if (cls === 'is-flash') { onBurst(); later(done, FLASH_MS); } else { later(() => onBurst(), BURST_AT_MS); later(done, POP_MS); }
    });
    return true;
  };
}

// 연타 보호: 쨈 컵 버튼을 연달아 누르는 손가락이 막 열린 시트에 떨어져 빈 저장 검사·닫힘·숫자 입력이 일어나지 않게(QA 2차 D1, 5차 D1).
// 구글 'clickbuster'(고스트 클릭 막기)와 같은 방식: 바로 앞 누름과 같은 자리(반지름 25px)에 정해진 간격 안에 다시 떨어진 누름만 무시하고, 무시할 때마다 자리·시각을 이어 감.
// 간격(sheet.js): '저장'·바탕·✕ 는 400ms, 자판 등 나머지는 200ms(320 '8'·339 '0' 은 컵 바로 위 → 컵에서 이어지는 빠른 연타만 무시, 250ms 이상 뒤 일부러 누른 숫자는 받음).
// 키보드(Enter·Space) 연타는 자리 대신 키로 묶음: createTapBurst() 를 자리 없이 쓰고, 다른 키를 누르면 reset(QA 3차 N2).
export const BURST_QUIET_MS = 400;
export const BURST_KEY_MS = 200;
export const BURST_RADIUS_PX = 25;
export function createTapBurst(quiet = BURST_QUIET_MS, radius = BURST_RADIUS_PX) {
  let last = -Infinity, at = null;
  const reset = () => { last = -Infinity; at = null; };
  return {
    // 버튼에서 누름 시작. 좌표를 주면 그 자리 근처의 되풀이 누름만 연타로 봄
    fromButton(t, x, y) { last = t; at = x == null ? null : { x, y }; },
    // 버튼 밖 누름: 바로 앞 누름에서 gap 안이고 같은 자리면 무시(시각·자리 이어 감). 아니면 받고 묶음 끝
    swallow(t, x, y, gap = quiet) {
      if (t - last < gap && (!at || Math.hypot(x - at.x, y - at.y) <= radius)) { last = t; if (at) at = { x, y }; return true; }
      reset(); return false;
    },
    reset,
  };
}
