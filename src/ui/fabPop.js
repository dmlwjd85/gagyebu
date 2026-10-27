// 조식 쨈 버튼: 누르면 컵이 살짝 눌렸다가 뚜껑 필름이 '탁' 터지고 방울이 튐(style.css .is-popping, 520ms).
// 기록 시트는 누르는 즉시 열림(main 과 같음 → 누른 직후 0.25초 안의 숫자·Enter 도 그대로 입력, QA 4차 D1).
// 터지는 연출은 시트 위에 겹친 컵 복사본(.fab-ghost, pointer-events:none)에서 보임 → 눈에는 보이고 누름은 아래 시트로 그대로 감.
// 휴대폰처럼 컵 자리가 열린 시트 판과 겹치면(320 '8'·339 '0'·360·390 '저장' 자리) '피어남'(6차 보완): 복사본은 제자리에서 0.16초 만에 '탁' 터지고 사라지며
// (.is-burst), 쨈 방울·호일 조각(.jam-burst, pointer-events:none)이 위로 튀어 퍼지고, 시트는 그 컵 자리에서 원으로 펼쳐지듯 보임(.is-bloom, mask — clip-path 는 잘린 곳이 누름을 막아 쓰지 않음).
// 시트 자체는 누르는 즉시 제자리에 열려 있음 → 펼쳐지는 동안에도 입력은 그대로 받음(QA 4차 D1). 복사본이 자판 위에 머무는 건 0.18초뿐이고 누름은 통과.
// 진짜 버튼도 같은 연출을 돌림(PC 처럼 시트가 버튼을 덮지 않는 화면에서는 두 컵이 정확히 겹침).
// 클릭 안에서는 맨 먼저 시트를 엶. 복사본 재기·붙이기·연출 클래스·소리는 시트가 그려진 다음 프레임 뒤로 미룸(QA 5차·6차 D2: 클릭 직후 다음 누름이 열린 시트에 닿게).
// prefers-reduced-motion: 터지는 동작·펼침·조각 없이 시트는 바로, 컵 자리에 짧은 쨈 색 변화(.is-flash, 160ms)만.
// 키보드(Enter/Space)는 <button> 의 기본 click 으로 같은 길을 탐. 소리('톡')는 onBurst(feel.js, 설정을 따름).
export const POP_MS = 520;
export const BURST_AT_MS = 90; // 호일이 벗겨지는 순간 '톡'
export const BURST_FAST_AT_MS = 50; // 휴대폰 '피어남'(0.16초 터짐)에서 호일이 벗겨지는 순간
export const FLASH_MS = 160;
// 다음 프레임이 그려진 뒤에 fn(시트가 먼저 화면에 나오게)
export const afterFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(fn, 0)) : setTimeout(fn, 0));
// 컵 접시 자리를 지금 재 두고, 나중에 그 자리에 복사본을 붙이는 함수를 돌려줌. cover(열린 시트 판, 기본은 앱의 #sheet-root .sheet)와 겹치면 g.burst = true.
// 시트 판은 미끄러져 올라오는 중이라 transform 을 뺀 제자리(offset 상자)로 겹침을 봄
export function ghostOver(btn) {
  const disc = btn.querySelector('.fab-disc'), svg = disc?.querySelector('.cup-svg');
  if (!disc) return null;
  const r = disc.getBoundingClientRect(), cs = getComputedStyle(disc), sc = svg && getComputedStyle(svg);
  const look = ['width', 'height', 'background', 'border', 'border-radius', 'box-shadow'].map((k) => [k, cs.getPropertyValue(k)]);
  const svgSize = sc && [sc.width, sc.height];
  return (cover) => {
    const burst = !!cover && overlaps(r, homeBox(cover)); // 시트 판과 겹침 → 제자리에서 빨리 터지고 사라짐(createAddPop)
    const g = document.createElement('span');
    g.className = 'fab fab-ghost'; g.setAttribute('aria-hidden', 'true');
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    const d = disc.cloneNode(true);
    for (const [k, v] of look) d.style.setProperty(k, v);
    if (svgSize) { const v = d.querySelector('.cup-svg'); v.style.width = svgSize[0]; v.style.height = svgSize[1]; }
    g.append(d); document.body.append(g); g.burst = burst;
    return g;
  };
}
const homeBox = (el) => { const p = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }; const left = p.left + el.offsetLeft, top = p.top + el.offsetTop; return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight }; };
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// 시트가 컵 자리(x, y: 화면 좌표)에서 원으로 펼쳐지듯 보이게(style.css #sheet-root.is-bloom, 휴대폰 폭·움직임 허용일 때만 적용).
// 클릭 안에서 open() 전에 클래스 하나·변수 둘만 붙임(배치 계산 없음). 시트는 아래·가운데 기준이라 화면 좌표를 시트 기준으로 바꿔 둠. 끄는 함수를 돌려줌
export function bloomSheet(x, y, root = document.getElementById('sheet-root')) {
  if (!root) return () => {};
  root.style.setProperty('--bloom-x', `calc(50% + ${Math.round(x - innerWidth / 2)}px)`);
  root.style.setProperty('--bloom-y', `calc(100% - ${Math.round(innerHeight - y)}px)`);
  root.classList.add('is-bloom');
  return () => root.classList.remove('is-bloom');
}
// 쨈 방울·호일 조각: 복사본 가운데에서 위로 높이 튀어 퍼지며 사라짐(style.css .jam-bit, 0.3초). 누름은 통과
const BITS = [[-120, -330, 14, 0], [-55, -400, 10, 10], [10, -370, 13, 0], [75, -410, 9, 20], [130, -320, 12, 10], [-160, -270, 9, 20], [160, -280, 10, 10], [-25, -300, 8, 20]];
const FOIL = [[-95, -300, 200], [45, -420, -160], [115, -350, 260], [-140, -360, -220]];
export function sprayBits(g) {
  const r = g.getBoundingClientRect(), box = document.createElement('div');
  const cy = r.top + r.height / 2, k = Math.max(1, (cy - 330) / 300); // 컵이 낮을수록(긴 화면) 높이 튀겨 조각이 자판(시트 위에서 약 430px) 위에 내려앉게
  box.className = 'jam-burst'; box.setAttribute('aria-hidden', 'true');
  box.style.cssText = `left:${r.left + r.width / 2}px;top:${cy}px`;
  box.innerHTML = BITS.map(([x, y, s, d]) => `<i class="jam-bit" style="--dx:${x}px;--dy:${Math.round(y * k)}px;--s:${s}px;--d:${d}ms"></i>`).join('')
    + FOIL.map(([x, y, a], i) => `<i class="jam-bit jam-foil" style="--dx:${x}px;--dy:${Math.round(y * k)}px;--a:${a}deg;--d:${i * 5}ms"></i>`).join('');
  document.body.append(box);
  return box;
}
export function createAddPop({ open, isOpen = () => false, reduced = () => false, later = setTimeout, frame = afterFrame, onBurst = () => {}, overlay = ghostOver, cover = () => document.querySelector('#sheet-root .sheet'), bloom = bloomSheet, spray = sprayBits }) {
  let end = null; // 지금 도는 연출을 끝내는 함수(다시 누르면 새로 시작)
  return (btn) => {
    if (isOpen()) return false;
    if (!btn) { onBurst(); open(); return true; }
    end?.();
    const cls = reduced() ? 'is-flash' : 'is-popping';
    open(); // 무엇보다 먼저 시트를 엶(QA 6차 D2: 열기 전 배치 계산이 시트가 누름을 받는 첫 프레임을 늦춤)
    // 펼침만 첫 화면에 필요해 열고 나서 같은 클릭 안에서 컵 자리 하나만 측정(그 배치는 첫 프레임이 그대로 씀). 움직임 줄이기는 펼침이 없어 클릭 안에서 재지 않음
    const at = cls === 'is-popping' ? btn.querySelector?.('.fab-disc')?.getBoundingClientRect() : null;
    const unbloom = at ? bloom(at.left + at.width / 2, at.top + at.height / 2) : null;
    let g = null, gcls = cls, bits = null;
    const done = () => { btn.classList.remove(cls); g?.classList.remove(gcls); g?.remove(); bits?.remove(); unbloom?.(); if (end === done) end = null; };
    end = done;
    frame(() => {
      if (end !== done) return; // 그새 다시 눌려 새 연출이 시작됨
      g = overlay(btn)?.(cover()) ?? null; // 복사본 자리·모양 재기도 프레임 뒤(QA 6차 D2)
      if (g?.burst && cls === 'is-popping') { gcls = 'is-burst'; bits = spray(g); }
      btn.classList.remove(cls); void btn.offsetWidth; btn.classList.add(cls);
      if (g) { g.classList.remove(gcls); void g.offsetWidth; g.classList.add(gcls); }
      if (cls === 'is-flash') { onBurst(); later(done, FLASH_MS); } else { later(() => onBurst(), gcls === 'is-burst' ? BURST_FAST_AT_MS : BURST_AT_MS); later(done, POP_MS); }
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
