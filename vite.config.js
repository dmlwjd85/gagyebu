import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// 첫 화면 글자(쨈 가계부, 로그인 안내)가 많이 든 Pretendard 조각만 미리 받기.
// 91: 영문·숫자·가장 흔한 한글, 90: 그다음 흔한 한글. 나머지 조각은 필요할 때 받음.
const BASE = '/gagyebu/';
const PRELOAD_FONT_SUBSETS = [91, 90];
function preloadMainFonts() {
  return {
    name: 'preload-main-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const files = Object.keys(ctx.bundle).filter((f) => PRELOAD_FONT_SUBSETS.some((n) => new RegExp(`PretendardVariable\\.subset\\.${n}-[^/]+\\.woff2$`).test(f)));
        return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${BASE}${f}`, crossorigin: '' }, injectTo: 'head' }));
      },
    },
  };
}

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
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 512 설치 아이콘·마스커블·favicon.svg는 페이지가 쓰지 않으므로 프리캐시에서 뺌
        globIgnores: ['**/pwa-512.png', '**/pwa-maskable-512.png', '**/pwa-maskable.svg', '**/favicon.svg'],
        // 예전 테마 그림 캐시(theme-art)·폰트 캐시(fonts)·workbox 프리캐시는 sw-cleanup.js 의 activate 에서 지운다.
        importScripts: ['sw-cleanup.js'],
        cacheId: 'gagyebu-v2',
        // 폰트 조각(92개)은 설치 때 다 받지 않고, 쓰는 것만 처음 볼 때 저장
        runtimeCaching: [{ urlPattern: ({ request }) => request.destination === 'font', handler: 'CacheFirst', options: { cacheName: 'fonts-v2', expiration: { maxEntries: 120, maxAgeSeconds: 31536000 } } }],
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
