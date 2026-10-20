import { colors, backgroundImage, boxShadow } from './design/tailwind-tokens-a.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      backgroundImage,
      boxShadow,
      fontFamily: {
        // 글꼴 자리(design-spec 1-4): 값은 src/style.css의 --font-title/--font-body/--font-num. 나중에 변수만 바꾸면 됨
        title: ['var(--font-title)'], // 쓱 제목체 자리: 화면·카드 제목, 홈 카드 큰 금액
        body: ['var(--font-body)'], // 쓱 본문체 자리: 본문·목록·버튼
        num: ['var(--font-num)'], // 금액·날짜·키패드(tabular-nums와 함께)
        sans: ['var(--font-body)'], // 기본 = 본문
      },
      // 글자 크기: --fs(본문 #main 안에서만 설정의 '본문 글자 크기'를 따름, 그 밖은 1) × 디자인 크기
      fontSize: Object.fromEntries(Object.entries({
        display: [40, 44, { fontWeight: '800', letterSpacing: '-0.02em' }],
        title: [22, 30, { fontWeight: '700' }],
        head: [17, 24, { fontWeight: '700' }],
        body: [15, 22, { fontWeight: '500' }],
        caption: [13, 18, { fontWeight: '500' }],
        micro: [11, 14, { fontWeight: '600' }],
        xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 36], '4xl': [36, 40],
      }).map(([k, [fs, lh, extra = {}]]) => [k, [`calc(${fs}px * var(--fs, 1))`, { lineHeight: `calc(${lh}px * var(--fs, 1))`, ...extra }]])),
    },
  },
  plugins: [],
};
