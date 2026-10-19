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
      fontSize: {
        display: ['40px', { lineHeight: '44px', fontWeight: '800', letterSpacing: '-0.02em' }],
        title: ['22px', { lineHeight: '30px', fontWeight: '700' }],
        head: ['17px', { lineHeight: '24px', fontWeight: '700' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '500' }],
        caption: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        micro: ['11px', { lineHeight: '14px', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
