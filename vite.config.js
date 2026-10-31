import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// 쨈 본문 첫 조각 중 보통(400) .core 하나만 미리 받기(앱 화면 글자 + 영문·숫자·기호).
// 설정 글꼴이 기본(쨈 본문)일 때만 건다: index.html 첫 스크립트가 정한 data-font 를 보고 head 에 link 를 넣음.
// 시스템·나눔라운드를 고른 사람은 쨈 본문을 받지 않는다. 나머지 조각 중 .ks 는 첫 데이터를 그린 뒤 한가할 때 받고(src/lib/look.js prefetchJjaemKs), .ext 는 그 글자가 화면에 나올 때만 받음.
// 자리·우선순위(QA 3차 M3): head 끝(앱 CSS·모듈 스크립트 뒤)에 낮은 우선순위(fetchpriority=low)로 넣어 첫 화면 CSS·JS 가 먼저 오게 한다.
// 글꼴 CSS(@font-face 목록)는 미리 받지 않는다. 굵게(700) .core 도 미리 받지 않고 글꼴 CSS 가 온 뒤 화면에 쓰일 때 받는다
// (둘 다 미리 받으면 로그인 버튼에 필요한 로그인 조각과 대역을 나눠 버튼이 main 보다 0.4s(slow4g)·1.2s(3G) 늦었음).
const BASE = '/gagyebu/';
const PRELOAD_FONT_FILES = [/JJAEMBody-Regular\.core-[^/]+\.woff2$/];
function preloadMainFonts() {
  return {
    name: 'preload-main-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const files = Object.keys(ctx.bundle).filter((f) => PRELOAD_FONT_FILES.some((re) => re.test(f)));
        if (!files.length) return html;
        const hrefs = JSON.stringify(files.map((f) => `${BASE}${f}`));
        const js = `(function(){var f=document.documentElement.dataset.font;if(f&&f!=='pretendard')return;${hrefs}.forEach(function(h){var l=document.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='';l.fetchPriority='low';l.href=h;document.head.appendChild(l);});})();`;
        return { html, tags: [{ tag: 'script', children: js, injectTo: 'head' }] };
      },
    },
  };
}

// 리포트 제목 조각(JJAEM Title Flat, 약 2KB)은 오프라인 첫 리포트에서도 제목이 바뀌지 않게 프리캐시(QA 3차 M4). 본문 조각은 쓰는 것만 런타임 캐시
export const PRECACHE_GLOBS = ['**/*.{js,css,html,svg,png}', '**/JJAEM-TitleFlat-*.woff2'];
// 글꼴 요청(destination font)과, 쨈 본문 미리 받기가 워커를 거쳐 다시 받는 woff2(look.js, destination 없음)를 같은 캐시·만료 규칙으로(QA 3차 M7)
export const FONT_RUNTIME_CACHE = { urlPattern: ({ request, url }) => request.destination === 'font' || url.pathname.endsWith('.woff2'), handler: 'CacheFirst', options: { cacheName: 'fonts-v2', expiration: { maxEntries: 120, maxAgeSeconds: 31536000 } } };

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preloadMainFonts(),
    VitePWA({
      // prompt: 새 워커가 기다리면 앱이 '새 버전으로 업데이트해 주세요'를 한 번 띄운다.
      // skipWaiting: 이미 깔린 예전 앱(autoUpdate)이 activated 때 새로고침하도록 워커는 바로 활성화.
      registerType: 'prompt',
      injectRegister: false,

      includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      includeManifestIcons: false, // 설치 아이콘은 설치할 때 한 번만 받으면 됨(pwa-192는 globPatterns로 계속 프리캐시)
      manifest: {
        name: '쨈 가계부',
        short_name: '쨈 가계부',
        description: '10초 만에 쓰는 가계부. 하루 한 번 내 돈 날씨를 보고, 광고 없이 내 기록은 내 계정에만 저장해요.',
        lang: 'ko',
        dir: 'ltr',
        categories: ['finance'],
        // id 고정: 예전 설치본은 id가 없어 Chrome이 start_url(https://dmlwjd85.github.io/gagyebu/)을 id로 썼다. 같은 값으로 고정해 이름이 바뀌어도 같은 앱으로 본다.
        id: '/gagyebu/',
        start_url: '/gagyebu/',
        scope: '/gagyebu/',
        display: 'standalone',
        background_color: '#F6F4FF',
        theme_color: '#6D4AFF',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // 설치 창에 보이는 미리보기(데모 계정 화면). jpg 는 precache 대상(globPatterns)이 아니라 오프라인 캐시 크기는 그대로
        screenshots: [
          { src: 'screenshots/home-narrow.jpg', sizes: '720x1560', type: 'image/jpeg', form_factor: 'narrow', label: '홈: 이번 달 돈 날씨와 최근 기록' },
          { src: 'screenshots/record-narrow.jpg', sizes: '720x1560', type: 'image/jpeg', form_factor: 'narrow', label: '10초 기록: 금액과 카테고리만 고르면 끝' },
          { src: 'screenshots/home-wide.jpg', sizes: '1280x800', type: 'image/jpeg', form_factor: 'wide', label: '넓은 화면의 홈' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: PRECACHE_GLOBS,
        // 512 설치 아이콘·마스커블·favicon.svg는 페이지가 쓰지 않으므로 프리캐시에서 뺌
        globIgnores: ['**/pwa-512.png', '**/pwa-maskable-512.png', '**/pwa-maskable.svg', '**/favicon.svg'],
        // 예전 테마 그림 캐시(theme-art)·폰트 캐시(fonts)·workbox 프리캐시는 sw-cleanup.js 의 activate 에서 지운다.
        importScripts: ['sw-cleanup.js'],
        cacheId: 'gagyebu-v2',
        // 폰트 조각(woff2)은 설치 때 다 받지 않고, 쓰는 것만 처음 볼 때 저장
        runtimeCaching: [FONT_RUNTIME_CACHE],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/gagyebu/index.html',
        // start_url에 ?source= 같은 쿼리가 붙어도 오프라인에서 index.html을 내준다.
        ignoreURLParametersMatching: [/.*/],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // 경고 기준 500kB → 600kB: firebase-firestore 조각(압축 전 약 586kB, gzip 약 149kB)은
    // Firestore SDK 한 덩어리라 더 나눌 수 없음(내부 모듈이 서로 얽혀 있어 manualChunks로 쪼개도 다시 합쳐짐).
    // 실제 전송량은 gzip 149kB이고, 로그인한 뒤에만 불러오므로(store.js) 첫 화면 속도에는 영향이 없음.
    // 다른 조각이 500kB를 넘기면 여전히 경고가 뜨도록 해당 조각 크기에 딱 맞춰 600으로만 올림.
    chunkSizeWarningLimit: 600,
    // 글꼴(woff2)은 CSS 안에 base64로 넣지 않고 파일로 둠(리포트 제목 조각 약 2KB 포함): 브랜드 검사·캐시 규칙을 그대로 쓰기 위해.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) return 'firebase-firestore';
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) return 'firebase-core';
        },
      },
    },
  },
  test: { include: ['src/**/*.test.js'], environment: 'node' },
});
