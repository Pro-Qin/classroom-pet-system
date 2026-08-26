/* 简易 Service Worker：缓存应用壳与静态资源（PWA，离线可用）
   修复：导航请求网络优先，失败时按 请求URL → '/' 依次回退缓存，绝不返回 undefined。 */
const CACHE = 'pet-campus-v2';
const CORE = ['/', '/login'];

const RESPONSE_OK = new Response('<h1>离线</h1>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 接口与上传不缓存
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  // 页面导航：网络优先，失败回退缓存（按请求URL，再退 '/'）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then((hit) => hit || caches.match('/'))
            .then((hit) => hit || RESPONSE_OK)
        )
    );
    return;
  }
  // 静态资源：缓存优先，缺省网络并回填；网络失败回退缓存
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((ret) => ret || RESPONSE_OK));
    })
  );
});
