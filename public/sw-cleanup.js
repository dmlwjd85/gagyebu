// 예전 테마 그림 런타임 캐시. 그림은 더 이상 쓰지 않으므로 업데이트 때 비운다.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('theme-art'));
});
