// 쨈 가계부 확정 색 토큰 — B「사파이어 밤」 Tailwind 설정용 (2026-11-10 확정)
// 실제 색 값은 CSS 변수에 있습니다. 불러오는 순서: design/tokens-a.css → src/tokens-jjaem-final.css
// 여기서는 그 변수를 이름으로 연결만 하므로 다크 모드는 <html class="dark"> 하나로 자동 전환됩니다 (darkMode: 'class').
// tailwind-tokens-a.js 와 이름이 같아서 import 경로만 바꾸면 됩니다. 새로 생긴 이름: hero.btn-ink, fab.3, nav-accent, switch-off, switch-thumb-on, seg-on-ring
//
// 사용 예 (tailwind.config.js):
//   import { colors, backgroundImage, boxShadow } from './src/tailwind-tokens-jjaem.js'
//   export default { darkMode: 'class', theme: { extend: { colors, backgroundImage, boxShadow } } }

export const colors = {
  bg: 'var(--bg)',                       // 앱 배경 (tokens-a.css 그대로)
  surface: {
    DEFAULT: 'var(--surface)',           // 유리 카드
    solid: 'var(--surface-solid)',       // 시트·키패드·목록
  },
  'glass-border': 'var(--glass-border)', // 유리 카드 테두리
  line: 'var(--line)',                   // 구분선 (장식용)
  ink: {
    DEFAULT: 'var(--ink)',               // 본문 글자
    sub: 'var(--ink-sub)',               // 보조 글자
  },
  primary: 'var(--primary)',             // 강조·버튼 — 라이트 #2B44C4 사파이어 / 다크 #93A4FF
  'on-primary': 'var(--on-primary)',     // 버튼 위 글자 — 라이트 #FFFFFF / 다크 #0E1440
  'nav-accent': 'var(--nav-accent)',     // 도크 고른 칸 이름
  'toast-action': 'var(--toast-action)', // 토스트 '되돌리기' — 라이트 #93A4FF / 다크 #2B44C4
  expense: 'var(--expense)',             // 지출 금액 (−부호 함께, 빨강 그대로)
  income: 'var(--income)',               // 수입 금액 (+부호 함께, 초록 그대로)
  hero: {
    1: 'var(--hero-1)',                  // 홈 카드 시작 — 밤 남색
    2: 'var(--hero-2)',                  // 가운데 — 사파이어
    3: 'var(--hero-3)',                  // 끝 — 깊은 청록
    ink: 'var(--hero-ink)',              // 카드 위 글자(흰색)
    'btn-ink': 'var(--hero-btn-ink)',    // 카드 안 흰 단추 글자('예산 정하기')
    track: 'var(--hero-track)',          // 예산 막대 바탕
    chip: 'var(--hero-chip)',            // '항목별 남은 예산' 접기 단추 바탕
  },
  fab: { 1: 'var(--fab-1)', 2: 'var(--fab-2)', 3: 'var(--fab-3)' }, // 기록 버튼(쨈 컵) 테두리·도크 고른 키
  aurora: { 1: 'var(--aurora-1)', 2: 'var(--aurora-2)', 3: 'var(--aurora-3)' }, // 배경 오로라
  heat: { 1: 'var(--heat-1)', 2: 'var(--heat-2)', 3: 'var(--heat-3)', 4: 'var(--heat-4)' }, // 달력 열지도(사파이어)
  // 차트: 큰 조각부터 1→6, 그 밖의 = 7. 사파이어·청록·호박·보라·하늘·코코아·회보라
  chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)', 6: 'var(--chart-6)', 7: 'var(--chart-7)' },
  weather: { sunny: 'var(--weather-sunny)', cloudy: 'var(--weather-cloudy)', rainy: 'var(--weather-rainy)' }, // 돈 날씨 칩
  'switch-off': 'var(--switch-off)',     // 꺼진 스위치 바탕 (흰 면 3.47:1)
  'switch-thumb-on': 'var(--switch-thumb-on)', // 켜진 스위치 손잡이
  'seg-on-ring': 'var(--seg-on-ring)',   // 고른 세그 칸 테두리
}

// 그라데이션 배경: bg-hero (홈 카드 = 은박 결 + 사파이어 그라데이션), bg-fab, bg-aurora
export const backgroundImage = {
  hero: 'var(--hero-texture), var(--hero-gradient)',
  'hero-fill': 'var(--hero-fill)',       // 예산 막대 채움(은박)
  fab: 'linear-gradient(135deg, var(--fab-1), var(--fab-2))',
  aurora:
    'radial-gradient(40% 30% at 15% 10%, var(--aurora-1), transparent 70%),' +
    'radial-gradient(40% 30% at 95% 20%, var(--aurora-2), transparent 70%),' +
    'radial-gradient(45% 35% at 50% 95%, var(--aurora-3), transparent 70%)',
}

// 그림자: shadow-glass (유리 카드), shadow-glow (홈 카드), shadow-hero-edge (카드 은박 테두리)
export const boxShadow = {
  glass: '0 8px 24px rgba(20, 30, 90, 0.10)',
  glow: '0 12px 30px var(--glow)',
  'hero-edge': 'var(--hero-edge)',
}
