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
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', '"Noto Sans KR"', 'sans-serif'],
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
