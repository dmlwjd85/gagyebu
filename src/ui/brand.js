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

import { CUP_SVG } from './cupD.js';
export const JJAEM_VB = '0 0 1650 1800';
export const JJAEM_D = 'M1288 30H1054V836C895 713 856 507 854 326H986V122H558V326H634C632 459 616 618 534 748C453 616 438 454 438 326H514V122H58V326H216C213 510 174 724 0 850L132 1014C228 949 288 850 326 736C363 860 427 972 536 1044C644 971 708 859 744 736C782 851 844 949 942 1014L1054 872V1062H1288V636H1414V1066H1650V0H1414V428H1288ZM1650 1140H352V1800H1650ZM604 1340H1400V1596H604Z';
// 앱 아이콘(public/pwa-*.png·favicon·tools/icon/A.svg)의 '쨈' 글자 윤곽. 쨈 제목 평면(JJAEM Title Flat)에서 뽑아 자모 간격을 벌린 것.
// 앱 화면은 쓰지 않아 빌드에서 빠지고(tree-shaking), 아이콘 SVG가 이 윤곽을 그리는지 테스트가 확인한다.
export const JJAEM_ICON_D = 'M-12 382L-12 371L-9 361L-4 353L2 337L14 296L28 229L38 154L44 77L44 76L25 76L15 75L7 71L0 65L-6 56L-9 45L-8 35L-5 26L0 19L6 14L13 10L22 8L150 8L158 9L166 12L172 16L176 20L182 30L184 41L183 52L179 60L175 65L170 70L164 73L153 76L128 76L123 144L127 152L129 160L136 220L142 253L150 284L163 324L171 341L177 348L179 356L183 364L186 371L187 377L186 385L182 396L175 407L168 411L158 414L147 415L132 411L123 411L119 410L116 408L110 402L92 366L85 349L74 379L67 392L57 405L49 412L39 416L29 418L19 417L9 413L0 407L-5 401L-10 392ZM224 382L224 371L227 361L232 353L238 337L250 296L264 229L274 154L281 77L280 76L261 76L251 75L243 71L236 65L231 58L228 48L228 36L231 26L236 19L243 13L250 10L258 8L386 8L394 9L402 12L408 16L413 20L418 30L420 41L419 52L415 60L411 65L406 70L401 73L390 76L364 76L359 144L363 152L365 160L372 220L378 253L386 284L399 324L407 341L413 348L415 356L420 364L422 371L423 377L422 385L418 396L411 407L404 411L394 414L383 415L368 411L359 411L355 410L352 408L346 402L328 366L321 349L310 379L303 392L293 405L285 412L275 416L265 418L255 417L245 413L238 409L231 401L226 392ZM536 453L536 63L537 57L540 48L544 42L550 33L555 28L563 23L573 19L580 17L589 17L596 17L602 19L612 23L620 28L625 33L632 42L636 50L639 61L640 69L640 203L657 203L666 205L674 207L683 213L690 221L696 231L698 239L698 250L696 261L692 268L687 275L678 282L671 286L663 288L640 289L640 447L637 463L633 473L630 479L623 486L618 490L612 493L602 498L593 499L582 499L573 498L567 495L557 490L552 486L548 481L542 473L538 463ZM754 470L754 47L755 40L758 31L761 25L768 16L773 12L781 7L791 2L798 1L807 0L814 1L820 2L830 7L838 12L843 16L850 25L854 33L857 44L858 53L857 470L855 479L851 489L846 497L838 505L830 510L820 514L811 516L800 516L791 514L785 512L775 506L770 502L764 495L758 485L756 479ZM24 887L24 593L28 585L30 583L33 580L40 577L72 576L782 577L790 578L794 580L799 585L802 593L802 597L802 887L801 895L799 899L794 904L786 907L782 907L44 907L36 906L30 902L28 899L24 891ZM123 831L704 831L704 653L123 653Z';
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

// 조식 쨈 버튼(2026-10-26 선생님 지시, 시안 D): 호텔 조식의 작은 쨈 컵(은박 호일 뚜껑 + 들린 탭 + 비치는 쨈) + 아래 '기록' 글자.
// 그림은 cupD.js(호일 위 '쨈'은 쨈 제목 윤곽 패스, 방울·윤기). 색은 style.css --cup-*(테마별 쨈 맛, 라이트·다크)
// 접근 이름 '기록 추가 (지출·수입)'이 보이는 글자 '기록'으로 시작(WCAG 2.5.3). 누르면 fabPop.js 의 '탁' 연출
export { CUP_SVG };
export const FAB_INNER = `<span class="fab-disc" aria-hidden="true"><span class="cup-squish">${CUP_SVG}</span></span><span class="fab-txt" aria-hidden="true">기록</span>`;
