# 쓱 가계부 (gagyebu)
10초 기록, 하루 한 번 보는 내 돈 날씨 — 광고·연동 없는 프라이버시 웹 가계부.

- 스택: Vite + Vanilla JS + Tailwind, Firebase(Auth·Firestore, 오프라인 캐시), PWA, GitHub Pages
- 화면: 위 메뉴·아래 메뉴는 늘 화면에 고정, 가운데 본문만 스크롤. 설정의 '본문 글자 크기'(85~160%, 슬라이더·가−/가+ 버튼)로 메뉴는 그대로 두고 본문만 키우거나 줄일 수 있어요. Ctrl(⌘)+/−/0·Ctrl+휠은 앱이 가로채지 않고 브라우저 확대로 동작해요. 핀치 줌·브라우저 확대는 막지 않아요. 높이가 낮은 화면(가로 모드·크게 확대·키보드)에서는 위 메뉴가 본문과 함께 스크롤되고 아래 메뉴는 낮은 막대로 바뀌어요. Ctrl 단축키를 다시 본문 글자 크기로 쓰려면 `src/lib/scaleShortcuts.js`의 `INTERCEPT_BROWSER_ZOOM`을 `true`로 바꾸면 돼요.
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
QA 도구(`tools/qa/*.py`)는 에뮬레이터 호스트를 꼭 직접 정해야 돌아가요(`QA_EMU_HOST=127.0.0.x` 또는 `--emu-host=`). 기본값으로 남의 에뮬레이터에 규칙을 거는 일을 막으려는 거예요. 실행마다 따로 쓰는 에뮬레이터 프로젝트(`demo-qa-<프로세스번호>`)의 데이터만 지워서, 여러 검사가 동시에 돌아도 서로 지우지 않아요. 호스트·포트·프로젝트는 `QA_EMU_HOST`·`QA_AUTH_PORT`·`QA_FS_PORT`·`QA_PROJECT` 환경변수나 `--emu-host=`·`--auth-port=`·`--fs-port=`·`--project=` 인자로 바꿀 수 있어요(`tools/qa/emu.py`). 다른 규칙 파일로 검사하려면 `QA_RULES`(또는 `--rules=`)를 써요.

실제 Firebase에 연결하려면 `.env.example`을 `.env`로 복사해 값을 넣으세요(.env는 커밋 금지).
