// '쓱 가계부' 로고(design-spec 16-3, design/brand/final 원본에서 옮김).
// 색은 CSS 변수(--lg1~3, --logo-ink)라 라이트·다크가 자동으로 바뀜. 비율·모양은 바꾸지 말 것.
let n = 0;
const grad = (id, [x1, y1, x2, y2]) => `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="var(--lg1)"/><stop offset=".55" stop-color="var(--lg2)"/><stop offset="1" stop-color="var(--lg3)"/></linearGradient></defs>`;
const stroke = (paint, w) => `fill="none" stroke="${paint}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
// 광학 크기별 '쓱' 심볼. 글꼴이 아니라 직접 그린 획. S는 public/favicon.svg 와 같은 패스.
// S = 25~32px, M = 33~95px
const SYM = {
  S: { vb: '-18.75 -14.50 139.50 139.50', g: [0.5, -1, 101.5, 111.5], eye: ['M15 28 Q22.5 10 28 7 Q33.5 10 41 28 M61 28 Q68.5 10 74 7 Q79.5 10 87 28', 16], mouth: ['M9 49 Q51 63.0 93 49', 17], k: ['M21 78 H70 Q81 78 81 89 V103', 17] },
  M: { vb: '-13.22 -10.92 128.34 128.34', g: [0.9, 1.5, 101, 105], eye: ['M14 32 Q22.1 12 28 9 Q33.9 12 42 32 M60 32 Q68.1 12 74 9 Q79.9 12 88 32', 15], mouth: ['M9 51 Q51 62.0 93 51', 16], k: ['M21 77 H70 Q81 77 81 88 V97', 16] },
  L: { g: [1.5, 3, 100.5, 104.5], eye: ['M14 34 Q22.1 13 28 10 Q33.9 13 42 34 M60 34 Q68.1 13 74 10 Q79.9 13 88 34', 14], mouth: ['M9 53 Q51 61.0 93 53', 15], k: ['M21 76 H70 Q81 76 81 87 V97', 15] },
};
const strokes = (s, paint) => [s.eye, s.mouth, s.k].map(([d, w]) => `<path d="${d}" ${stroke(paint, w)}/>`).join('');

/** '쓱' 심볼. size: 'S' | 'M'. label이 있으면 이미지로, 없으면 장식으로 숨김.
 *  ink: 그라데이션 대신 currentColor. 아이콘과 같은 S 획을 버튼 글자색으로 칠할 때. */
export function symbol(size = 'S', { cls = '', label = '', ink = false } = {}) {
  const s = SYM[size];
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  if (ink) return `<svg class="${cls}" ${a11y} xmlns="http://www.w3.org/2000/svg" viewBox="${s.vb}">${strokes(s, 'currentColor')}</svg>`;
  const id = `lg${size}${++n}`;
  return `<svg class="${cls}" ${a11y} xmlns="http://www.w3.org/2000/svg" viewBox="${s.vb}">${grad(id, s.g)}${strokes(s, `url(#${id})`)}</svg>`;
}

// '가계부' 손그림 획(글자 높이 100 기준)
const p = (d, w = 19) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const GAGYEBU = `<g style="color:var(--logo-ink)" transform="translate(112.68 56.80)">`
  + `<g transform="translate(0.21 2.74) scale(0.4222)">${p('M9 24 H39 Q48 24 47 33 Q45 62 16 88')}${p('M77 8 V96')}${p('M77 51 H94', 17.7)}</g>`
  + `<g transform="translate(48.93 2.74) scale(0.4222)">${p('M6 24 H24 Q32 24 31 33 Q29 60 8 86')}${p('M68 12 V90')}${p('M95 6 V96')}${p('M54 38 H68', 17.7)}${p('M54 62 H68', 17.7)}</g>`
  + `<g transform="translate(99.34 2.74) scale(0.4222)">${p('M22 3 V47 M76 3 V47')}${p('M22 23 H76 M22 47 H76', 17.7)}${p('M6 69 H92', 17.7)}${p('M49 69 V97')}</g></g>`;

/** 가로 로고(L). 높이 40px 이상인 자리에서만 사용 */
export function logo({ cls = '' } = {}) {
  const id = `lgL${++n}`;
  return `<svg class="${cls}" role="img" aria-label="쓱 가계부" xmlns="http://www.w3.org/2000/svg" viewBox="-23.88 -22.38 303.86 152.25">${grad(id, SYM.L.g)}${strokes(SYM.L, `url(#${id})`)}${GAGYEBU}</svg>`;
}
