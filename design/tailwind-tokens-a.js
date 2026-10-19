// 가계부 확정 색 토큰 — 시안 A「오로라 파스텔」 Tailwind 설정용 (2026-10-19)
// 실제 색 값은 tokens-a.css 의 CSS 변수에 있고, 여기서는 그 변수를 이름으로 연결만 합니다.
// 그래서 다크 모드는 <html class="dark"> 하나로 자동 전환됩니다 (tailwind.config.js 에 darkMode: 'class').
//
// 사용 예 (tailwind.config.js):
//   import { colors, backgroundImage, boxShadow } from './design/tailwind-tokens-a.js'
//   export default { darkMode: 'class', theme: { extend: { colors, backgroundImage, boxShadow } } }
// 클래스 예: bg-bg, bg-surface, text-ink, text-ink-sub, bg-primary text-on-primary,
//           text-expense, text-income, bg-hero, bg-heat-3, border-line

export const colors = {
  bg: 'var(--bg)',                       // 앱 배경
  surface: {
    DEFAULT: 'var(--surface)',           // 유리 카드
    solid: 'var(--surface-solid)',       // 시트·키패드·목록
  },
  'glass-border': 'var(--glass-border)', // 유리 카드 테두리
  line: 'var(--line)',                   // 구분선
  ink: {
    DEFAULT: 'var(--ink)',               // 본문 글자
    sub: 'var(--ink-sub)',               // 보조 글자
  },
  primary: 'var(--primary)',             // 버튼·강조
  'on-primary': 'var(--on-primary)',     // 버튼 위 글자
  'toast-action': 'var(--toast-action)', // 토스트 '되돌리기'
  expense: 'var(--expense)',             // 지출 금액 (−부호 함께)
  income: 'var(--income)',               // 수입 금액 (+부호 함께)
  hero: {
    1: 'var(--hero-1)',                  // 홈 상단 카드 그라데이션 시작(보라)
    2: 'var(--hero-2)',                  // 가운데(핑크)
    3: 'var(--hero-3)',                  // 끝(살구)
    ink: 'var(--hero-ink)',              // 카드 위 글자(흰색)
  },
  fab: { 1: 'var(--fab-1)', 2: 'var(--fab-2)' }, // ＋버튼 그라데이션
  aurora: { 1: 'var(--aurora-1)', 2: 'var(--aurora-2)', 3: 'var(--aurora-3)' }, // 배경 오로라
  heat: { 1: 'var(--heat-1)', 2: 'var(--heat-2)', 3: 'var(--heat-3)', 4: 'var(--heat-4)' }, // 달력 히트맵
  chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)', 6: 'var(--chart-6)', 7: 'var(--chart-7)' }, // 차트 색
  weather: { sunny: 'var(--weather-sunny)', cloudy: 'var(--weather-cloudy)', rainy: 'var(--weather-rainy)' }, // 돈 날씨 칩
}

// 그라데이션 배경: bg-hero (홈 상단 카드), bg-fab (＋버튼), bg-aurora (앱 배경)
export const backgroundImage = {
  hero: 'var(--hero-gradient)',
  fab: 'linear-gradient(135deg, var(--fab-1), var(--fab-2))',
  aurora:
    'radial-gradient(40% 30% at 15% 10%, var(--aurora-1), transparent 70%),' +
    'radial-gradient(40% 30% at 95% 20%, var(--aurora-2), transparent 70%),' +
    'radial-gradient(45% 35% at 50% 95%, var(--aurora-3), transparent 70%)',
}

// 그림자: shadow-glass (유리 카드), shadow-glow (홈 상단 카드·＋버튼)
export const boxShadow = {
  glass: '0 8px 24px rgba(60, 40, 140, 0.10)',
  glow: '0 12px 30px var(--glow)',
}
