const CACHE = 'webllm-pwa-v1';
const APP_SHELL = [
'/',
'/index.html',
'/style.css',
'/main.js',
'/manifest.webmanifest',
'/icon-192.png',
'/icon-512.png'
];


self.addEventListener('install', (e) => {
e.waitUntil(
caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
);
});


self.addEventListener('activate', (e) => {
e.waitUntil(
caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
);
});


self.addEventListener('fetch', (e) => {
const req = e.request;
// Strategy: network-first for model (lớn), cache-first cho app shell
if (APP_SHELL.some(p => new URL(req.url).pathname.endsWith(p.replace('/', '')))) {
e.respondWith(
caches.match(req).then((cached) => cached || fetch(req))
);
} else {
// Model & các file khác: try network, fallback cache
e.respondWith(
fetch(req).then((res) => {
const resClone = res.clone();
caches.open(CACHE).then(cache => cache.put(req, resClone));
return res;
}).catch(() => caches.match(req))
);
}
});
