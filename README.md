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
QA 도구(`tools/qa/*.py`)는 실행마다 따로 쓰는 에뮬레이터 프로젝트(`demo-qa-<프로세스번호>`)의 데이터만 지워서, 여러 검사가 동시에 돌아도 서로 지우지 않아요. 호스트·포트·프로젝트는 `QA_EMU_HOST`·`QA_AUTH_PORT`·`QA_FS_PORT`·`QA_PROJECT` 환경변수나 `--emu-host=`·`--auth-port=`·`--fs-port=`·`--project=` 인자로 바꿀 수 있어요(`tools/qa/emu.py`).

실제 Firebase에 연결하려면 `.env.example`을 `.env`로 복사해 값을 넣으세요(.env는 커밋 금지).

## 주식·연금

홈과 설정의 '주식·연금'에서 일반 주식, 연금저축, IRP, ISA, DC, 공무원연금(예상 월액은 직접 입력, 총자산에 더하지 않음)을 관리해요. 결제수단(`accounts`)과는 다른 컬렉션이라 가계부 기록 형식은 그대로예요.

- `users/{uid}/assetAccounts` 계좌, `holdings` 보유(수량 `qtyE4` = 수량×10000), `contributions` 납입, `assetPrefs/tax` 세액공제 한도·세율
- 기본 한도: 연금저축 600만 원, 연금저축+IRP+DC 900만 원. 세율 16.5% / 13.2%. 설정 화면이 아니라 세액공제 화면의 '한도·세율 고치기'에서 바꿉니다.
- JSON 백업 version 3에 위 컬렉션이 포함돼요. 기존 키는 그대로입니다.
- **규칙을 배포해야 저장됩니다.** `main`에 푸시되면 `npm test`와 `npm run test:rules`가 통과한 뒤 `.github/workflows/deploy-pages.yml`이 Firestore 보안 규칙만 올립니다. 문서 데이터는 바꾸지 않아요. 저장소 시크릿 `FIREBASE_SERVICE_ACCOUNT`가 없으면 경고만 남기고 GitHub Pages 배포는 계속됩니다. 시크릿을 넣기 전에는 새 경로 쓰기가 거절될 수 있어요.

### 시세 자동 갱신

출처는 금융위원회 주식시세정보·증권상품시세정보(ETF, 한국거래소)이고 공공누리 4유형입니다. 제3자에게 다시 배포할 수 없어서 GitHub Pages에 시세 JSON을 만들지 않습니다. 펀드 기준가는 자동으로 바꾸지 않고 직접 입력합니다.

평일 14:30 KST 이후 `.github/workflows/sync-prices.yml` 이 보유 종목 코드만 조회해, 그 문서의 `lastPrice`·`priceDate`·`priceSource` 만 `update` 합니다. 문서를 지우거나 다른 필드를 덮지 않고, 저장된 기준일보다 오래된 종가는 건너뜁니다. 같은 종가·날짜면 다시 쓰지 않습니다.

클라이언트 코드에는 API 키가 없습니다. 워크플로에 아래 시크릿이 없으면 쓰기를 하지 않고 성공으로 끝납니다. 넣는 순간 다음 실행부터 동작합니다.

| Secret | 넣는 값 |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털에서 발급한 서비스 키. 주식시세정보와 증권상품시세정보(ETF) 두 활용신청이 필요합니다. 디코딩 키를 넣으면 워크플로가 인코딩합니다. 이미 `%` 가 들어 있는 인코딩 키도 그대로 넣으면 됩니다. |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 JSON 전체. base64 한 줄도 됩니다. 시세 동기화와 Firestore 규칙 배포가 같은 시크릿을 씁니다. 규칙 배포에는 Firebase Rules Admin 또는 Firebase Admin 역할이 필요합니다. |

`VITE_FIREBASE_*` 는 웹 설정이라 규칙 배포나 Admin SDK로 쓸 수 없어요. 시크릿이 없으면 시세 동기화와 규칙 배포 모두 쓰기를 하지 않고 성공으로 끝납니다.
