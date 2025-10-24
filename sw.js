// sw.js
const CACHE = 'webllm-pwa-v2';

// Lấy base từ scope để khỏi sai đường dẫn khi chạy trên GitHub Pages
const BASE = self.registration.scope; // ví dụ: https://tqa25.github.io/webllm-pwa2/

// Liệt kê đúng các file THỰC SỰ có trong repo
const SHELL_PATHS = [
  '',                 // -> index.html
  'index.html',
  'style.css',
  'main.js',          // đổi đúng tên file JS của bạn
  'manifest.webmanifest',
  'sw.js',
  'icon-512.png'
];

// Chuyển thành URL đầy đủ
const APP_SHELL = SHELL_PATHS.map(p => new URL(p, BASE).toString());

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache từng file, nếu file nào 404 thì bỏ qua (để không fail cả addAll)
    for (const url of APP_SHELL) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res.clone());
        else console.warn('[SW] Skip caching (HTTP ' + res.status + '):', url);
      } catch (err) {
        console.warn('[SW] Skip caching (fetch error):', url, err);
      }
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const reqUrl = e.request.url;
  // App shell: cache-first
  if (APP_SHELL.includes(reqUrl)) {
    e.respondWith(
      caches.match(reqUrl).then(cached => cached || fetch(e.request))
    );
    return;
  }
  // Khác: network-first (model shard để HTTP cache lo)
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(reqUrl, copy));
      return res;
    }).catch(() => caches.match(reqUrl))
  );
});
