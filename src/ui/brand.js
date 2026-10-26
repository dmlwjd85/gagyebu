// '쨈 가계부' 로고. 왼쪽 글자는 아래 윤곽이고, '가계부'는 손그림 획이다.
// 색은 CSS 변수(--lg1~3, --logo-ink)라 라이트·다크가 자동으로 바뀐다.
//
// 글자 윤곽 출처. 폰트 파일은 넣지 않고, '쨈' 윤곽만 SVG 패스로 옮겼다.
// - 폰트: Pretendard Bold, SIL Open Font License 1.1
//   https://github.com/orioncactus/pretendard
// - 저작권: Copyright © 2023 Kil Hyung-jin (길형진)
// - 파일: pretendard@1.3.9 dist/public/static/Pretendard-Bold.otf
// - name: family Pretendard, subfamily Bold, unique 1.309;CTUS;Pretendard-Bold
//   version "Version 1.309;Glyphs 3.2 (3225)", PostScript Pretendard-Bold
// - OS/2 usWeightClass 700, unitsPerEm 2048, cmap U+CA08
// - 원본 경계 (x0, y0, x1, y1) = (12, -164, 1662, 1636). 폰트 y는 위가 큼.
// - SVG: x' = x − 12, y' = 1636 − y. viewBox "0 0 1650 1800".
// - 예약된 글꼴 이름 Pretendard 는 이 패스의 이름으로 쓰지 않는다.
// 다른 앱도 JJAEM_D 를 그대로 쓰면 같은 글자가 된다.
let n = 0;

export const JJAEM_VB = '0 0 1650 1800';
export const JJAEM_D = 'M1288 30H1054V836C895 713 856 507 854 326H986V122H558V326H634C632 459 616 618 534 748C453 616 438 454 438 326H514V122H58V326H216C213 510 174 724 0 850L132 1014C228 949 288 850 326 736C363 860 427 972 536 1044C644 971 708 859 744 736C782 851 844 949 942 1014L1054 872V1062H1288V636H1414V1066H1650V0H1414V428H1288ZM1650 1140H352V1800H1650ZM604 1340H1400V1596H604Z';
// 로고 왼쪽 칸. 손그림 '가계부'는 x=112.68 에서 시작한다.
const MARK = 'translate(8 6) scale(0.054)';

const grad = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lg1)"/><stop offset=".55" stop-color="var(--lg2)"/><stop offset="1" stop-color="var(--lg3)"/></linearGradient></defs>`;

/** '쨈' 심볼. size: 'S' | 'M' (같은 윤곽, 크기는 CSS). ink 이면 currentColor 채움. label이 있으면 이미지로, 없으면 장식으로 숨김 */
export function symbol(size = 'S', { cls = '', label = '', ink = false } = {}) {
  const id = `lg${size}${++n}`;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  const paint = ink ? '' : grad(id);
  const fill = ink ? 'currentColor' : `url(#${id})`;
  return `<svg class="${cls}" ${a11y} xmlns="http://www.w3.org/2000/svg" viewBox="${JJAEM_VB}">${paint}<path d="${JJAEM_D}" fill="${fill}"/></svg>`;
}

// '가계부' 손그림 획(글자 높이 100 기준)
const p = (d, w = 19) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const GAGYEBU = `<g style="color:var(--logo-ink)" transform="translate(112.68 56.80)">`
  + `<g transform="translate(0.21 2.74) scale(0.4222)">${p('M9 24 H39 Q48 24 47 33 Q45 62 16 88')}${p('M77 8 V96')}${p('M77 51 H94', 17.7)}</g>`
  + `<g transform="translate(48.93 2.74) scale(0.4222)">${p('M6 24 H24 Q32 24 31 33 Q29 60 8 86')}${p('M68 12 V90')}${p('M95 6 V96')}${p('M54 38 H68', 17.7)}${p('M54 62 H68', 17.7)}</g>`
  + `<g transform="translate(99.34 2.74) scale(0.4222)">${p('M22 3 V47 M76 3 V47')}${p('M22 23 H76 M22 47 H76', 17.7)}${p('M6 69 H92', 17.7)}${p('M49 69 V97')}</g></g>`;

/** 가로 로고. 높이 40px 이상인 자리에서만 사용 */
export function logo({ cls = '' } = {}) {
  const id = `lgL${++n}`;
  return `<svg class="${cls}" role="img" aria-label="쨈 가계부" xmlns="http://www.w3.org/2000/svg" viewBox="-23.88 -22.38 303.86 152.25">${grad(id)}<g transform="${MARK}"><path d="${JJAEM_D}" fill="url(#${id})"/></g>${GAGYEBU}</svg>`;
}

// 조식 쨈 버튼(2026-10-26 선생님 지시): 호텔 조식의 작은 쨈 컵(뚜껑 필름 + 들린 탭 + 비치는 블루베리 쨈) + 아래 '기록' 글자.
// 필름 위 '쨈'은 둥근 획 끝·굵은 획 패스(웹폰트 없음) + 흘러내리는 방울 둘 + 윗부분 윤기. 색은 style.css --cup-* (라이트·다크)
// 접근 이름 '기록 추가 (지출·수입)'이 보이는 글자 '기록'으로 시작(WCAG 2.5.3). 누르면 fabPop.js 의 '탁' 연출
export const CUP_SVG = '<svg class="cup-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g class="cup-body"><path class="cup-jar" d="M8.5 27H55.5L50.8 53Q50 57.5 45.5 57.5H18.5Q14 57.5 13.2 53Z"/><path class="cup-deep" d="M13.2 47H50.8L50.8 53Q50 57.5 45.5 57.5H18.5Q14 57.5 13.2 53Z"/><path class="cup-gloss" d="M14.5 33Q15.6 45 17.6 52" fill="none" stroke-width="2.6" stroke-linecap="round"/><ellipse class="cup-rim" cx="32" cy="23.5" rx="29" ry="16"/></g><g class="cup-film"><ellipse class="cup-foil" cx="32" cy="21.5" rx="26.5" ry="14.2"/><path class="cup-tab" d="M49.5 14.2Q54 7.6 60.2 8.4Q62.6 9.4 60.6 12.2Q57.2 15.6 52.6 16.6Z"/><g class="cup-label" transform="translate(23.5 11.6) scale(.46)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="cup-ink" stroke-width="5.2" d="M4 6.5H12M8 7.5L4 15M8 7.5L12 15M15 6.5H23M19 7.5L15 15M19 7.5L23 15M27 3V19M27 11H30.5M33 2V21M10 24.5H30V36H10Z"/><path class="cup-ink" stroke-width="3.4" d="M14 36V40M33 21V24.5"/><circle class="cup-ink-fill" cx="14" cy="41" r="2.6"/><circle class="cup-ink-fill" cx="33" cy="25.4" r="2.1"/><path class="cup-shine" stroke-width="1.3" d="M5.4 5.4H9M16.4 5.4H20M26 4.5V8M11.4 23.4H17"/></g></g><g class="cup-drops"><circle cx="20" cy="20" r="3"/><circle cx="32" cy="16" r="3.4"/><circle cx="45" cy="20" r="2.6"/></g></svg>';
export const FAB_INNER = `<span class="fab-disc" aria-hidden="true">${CUP_SVG}</span><span class="fab-txt" aria-hidden="true">기록</span>`;
