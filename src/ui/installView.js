// 설정의 '앱 설치' 칸과 홈의 작은 설치 안내(처음 몇 번만). 상태는 lib/install.js 의 installState.
const APP_URL = 'https://dmlwjd85.github.io/gagyebu/';

const fixGuide = `<details class="inst-more">
  <summary>'이미 설치됨'이나 '앱을 열 수 없음'이 나오면</summary>
  <div class="flex flex-col gap-2 pt-2">
    <p>이름이 바뀌기 전에 만든 바로가기가 남아 있으면 그렇게 나와요. 옛 항목을 지우고 이 화면을 새로 고치면 설치 버튼이 생겨요.</p>
    <ul class="flex flex-col gap-1.5 pl-4 list-disc">
      <li><b>컴퓨터(크롬)</b>: 주소창에 <code>chrome://apps</code> 를 입력하고, 가계부 아이콘을 오른쪽 클릭해 'Chrome에서 삭제'를 눌러 주세요.</li>
      <li><b>안드로이드</b>: 홈 화면의 옛 아이콘을 길게 눌러 지운 뒤, 크롬 ⋮ → 설정 → 사이트 설정 → 모든 사이트 → dmlwjd85.github.io 에서 데이터를 삭제해 주세요.</li>
    </ul>
    <p>가계부 기록은 내 계정(서버)에 저장돼 있어서 지워도 그대로예요. 다시 로그인만 하면 돼요. 다만 위쪽에 '오프라인' 표시가 있을 때는 아직 못 올린 기록이 있을 수 있으니, 인터넷에 연결된 뒤에 지워 주세요.</p>
  </div>
</details>`;

const BODY = {
  prompt: `<p class="text-caption text-ink-sub break-words">홈 화면이나 바탕화면에서 한 번에 열려요. 주소창 없이 넓게 보이고, 인터넷이 끊겨도 기록할 수 있어요.</p>
    <button type="button" class="btn-primary self-start" data-action="install-app">앱으로 설치</button>`,
  'ios-safari': `<p class="text-caption text-ink-sub break-words">아래쪽 <b>공유</b> 버튼(네모에 위 화살표)을 누르고 <b>'홈 화면에 추가'</b>를 골라 주세요. 홈 화면 아이콘으로 앱처럼 열려요.</p>`,
  'ios-other': `<p class="text-caption text-ink-sub break-words">아이폰에서는 사파리에서 열어야 홈 화면에 앱으로 둘 수 있어요. 사파리에서 <span class="break-all">${APP_URL}</span> 을 열고 공유 → '홈 화면에 추가'를 눌러 주세요.</p>`,
  manual: `<p class="text-caption text-ink-sub break-words">설치 버튼이 안 보이면 브라우저 메뉴(⋮)에서 '앱 설치'나 '홈 화면에 추가'를 눌러 주세요. 크롬·엣지·삼성 인터넷에서 설치할 수 있어요.</p>
    ${fixGuide}`,
  thanks: `<p class="text-body break-words" role="status">설치해 주셔서 고마워요! 이제 홈 화면에서 바로 열어 보세요.</p>`,
};

export function installCard(state) {
  if (state === 'standalone' || !BODY[state]) return '';
  return `<section class="card-solid p-4 flex flex-col gap-3 inst-card" aria-labelledby="s-inst" data-install-card="${state}">
    <h2 id="s-inst" class="text-head flex items-center gap-2"><span aria-hidden="true">📲</span>앱으로 설치</h2>
    ${BODY[state]}</section>`;
}

const HINT = {
  prompt: ['앱으로 설치하면 홈 화면에서 한 번에 열려요.', '<button type="button" class="inst-go" data-action="install-app">설치</button>'],
  'ios-safari': ['공유 → \'홈 화면에 추가\'로 앱처럼 쓸 수 있어요.', '<button type="button" class="inst-go" data-nav="settings">방법</button>'],
  'ios-other': ['사파리에서 열면 홈 화면에 앱으로 둘 수 있어요.', '<button type="button" class="inst-go" data-nav="settings">방법</button>'],
};

export function installHint(state) {
  const h = HINT[state];
  if (!h) return '';
  return `<div class="tip inst-hint" role="note" aria-label="앱 설치 안내"><span class="py-1.5" aria-hidden="true">📲</span><p>${h[0]}</p>${h[1]}<button class="tip-x" data-install-hint-close aria-label="설치 안내 닫기 (다시 보지 않기)">✕</button></div>`;
}
