# 쓱 가계부 (gagyebu)
10초 기록, 하루 한 번 보는 내 돈 날씨 — 광고·연동 없는 프라이버시 웹 가계부.

- 스택: Vite + Vanilla JS + Tailwind, Firebase(Auth·Firestore, 오프라인 캐시), PWA, GitHub Pages
- 화면: 위 메뉴·아래 메뉴는 늘 화면에 고정, 가운데 본문만 스크롤. 설정의 '본문 글자 크기'(85~160%, PC는 Ctrl+휠·Ctrl+/−/0)로 메뉴는 그대로 두고 본문만 키우거나 줄일 수 있어요. 핀치 줌·브라우저 확대는 막지 않아요.
- 기능(M1): Google 로그인, 3탭 빠른 입력, 월별 목록·달력, 카테고리 도넛·6개월 추이, 월 예산과 돈 날씨, 카테고리 편집, CSV 내보내기, 다크 모드, 구석 팁

## 개발
```bash
npm install
npm test            # 단위 테스트(금액·집계·CSV·팁)
npm run test:rules  # Firestore 보안 규칙 테스트(에뮬레이터, Java 필요)
npm run build
```
설정값 없이 로컬에서 써 보기(에뮬레이터):
```bash
npm run emulators   # 터미널 1: Auth+Firestore 에뮬레이터
npm run dev:emu     # 터미널 2: http://127.0.0.1:5173/gagyebu/ → '테스트 계정으로 로그인'
```
실제 Firebase에 연결하려면 `.env.example`을 `.env`로 복사해 값을 넣으세요(.env는 커밋 금지).
