import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// 첫 화면 글자(쓱 가계부, 로그인 안내)가 많이 든 Pretendard 조각만 미리 받기.
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
      // 새 버전 적용(QA 3차 N3): 새 서비스 워커가 기다리지 않고 바로 자리를 잡게(skipWaiting·clientsClaim).
      // injectRegister를 쓰면 플러그인이 이 두 값을 넣지 않아서(예전 설정의 원인) 직접 적고, 등록·화면 다시 불러오기는
      // src/lib/pwa.js가 맡아요(입력 중이면 '새 버전이 있어요 [지금 적용]' 안내).
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: '쓱 가계부',
        short_name: '쓱 가계부',
        description: '10초 기록, 하루 한 번 보는 내 돈 날씨. 광고·연동 없는 프라이버시 가계부, 쓱 가계부.',
        lang: 'ko',
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
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 폰트 조각(92개)은 설치 때 다 받지 않고, 쓰는 것만 처음 볼 때 저장
        runtimeCaching: [{ urlPattern: ({ request }) => request.destination === 'font', handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 120, maxAgeSeconds: 31536000 } } }],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/gagyebu/index.html',
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
