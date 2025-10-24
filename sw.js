const CACHE = 'webllm-pwa-v1';
const APP_SHELL = [
  '/webllm-pwa2/',
  '/webllm-pwa2/index.html',
  '/webllm-pwa2/style.css',
  '/webllm-pwa2/script.js',
  '/webllm-pwa2/manifest.webmanifest',
  '/webllm-pwa2/icon-192.png',
  '/webllm-pwa2/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Cache-first cho app shell
  if (APP_SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // Network-first cho phần khác (để HTTP cache xử lý file model lớn)
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
