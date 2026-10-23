// '콕 가계부' 로고. 왼쪽 글자는 아래 윤곽이고, '가계부'는 손그림 획이다.
// 색은 CSS 변수(--lg1~3, --logo-ink)라 라이트·다크가 자동으로 바뀐다.
//
// 글자 윤곽 출처. 폰트 파일은 넣지 않고, '콕' 윤곽만 SVG 패스로 옮겼다.
// - 폰트: Pretendard Bold, SIL Open Font License 1.1
//   https://github.com/orioncactus/pretendard
// - 저작권: Copyright © 2023 Kil Hyung-jin (길형진)
// - 파일: pretendard@1.3.9 dist/public/static/Pretendard-Bold.otf
// - name: family Pretendard, subfamily Bold, unique 1.309;CTUS;Pretendard-Bold
//   version "Version 1.309;Glyphs 3.2 (3225)", PostScript Pretendard-Bold
// - OS/2 usWeightClass 700, unitsPerEm 2048, cmap U+CF55 → cid10581
// - 원본 경계 (x0, y0, x1, y1) = (58, -178, 1710, 1596). 폰트 y는 위가 큼.
// - SVG: x' = x − 58, y' = 1596 − y. viewBox "0 0 1652 1774".
// - 예약된 글꼴 이름 Pretendard 는 이 패스의 이름으로 쓰지 않는다.
// 교무수첩은 KOK_D 를 그대로 쓰면 같은 글자가 된다.
let n = 0;

export const KOK_VB = '0 0 1652 1774';
export const KOK_D = 'M1466 0H186V206H1214L1212 326L136 350L168 558L1198 514C1191 581 1179 654 1162 734L1414 750C1466 518 1466 340 1466 170ZM1652 826H874V622H618V826H0V1028H1652ZM1454 1166H168V1366H1200V1774H1454Z';
// 로고 왼쪽 칸. 손그림 '가계부'는 x=112.68 에서 시작한다.
const MARK = 'translate(8 6) scale(0.054)';

const grad = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lg1)"/><stop offset=".55" stop-color="var(--lg2)"/><stop offset="1" stop-color="var(--lg3)"/></linearGradient></defs>`;

/** '콕' 심볼. size: 'S' | 'M' (같은 윤곽, 크기는 CSS). ink 이면 currentColor 채움. label이 있으면 이미지로, 없으면 장식으로 숨김 */
export function symbol(size = 'S', { cls = '', label = '', ink = false } = {}) {
  const id = `lg${size}${++n}`;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  const paint = ink ? '' : grad(id);
  const fill = ink ? 'currentColor' : `url(#${id})`;
  return `<svg class="${cls}" ${a11y} xmlns="http://www.w3.org/2000/svg" viewBox="${KOK_VB}">${paint}<path d="${KOK_D}" fill="${fill}"/></svg>`;
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
  return `<svg class="${cls}" role="img" aria-label="콕 가계부" xmlns="http://www.w3.org/2000/svg" viewBox="-23.88 -22.38 303.86 152.25">${grad(id)}<g transform="${MARK}"><path d="${KOK_D}" fill="url(#${id})"/></g>${GAGYEBU}</svg>`;
}
