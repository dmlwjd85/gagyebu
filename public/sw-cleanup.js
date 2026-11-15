// 예전 캐시. 테마 그림(theme-art), 이전 폰트 캐시(fonts), 이전 프리캐시(workbox-)는 업데이트 때 지운다.
// 지금 프리캐시 접두사는 gagyebu-v2 이다.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await caches.delete('theme-art');
    await caches.delete('fonts');
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('workbox-')).map((key) => caches.delete(key)));
  })());
});
