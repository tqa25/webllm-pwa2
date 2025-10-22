const CACHE = "webllm-pwa-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./script.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (e)=>{
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    await c.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=> (k!==CACHE ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

// Cache-first for app shell; pass-through for cross-origin model shards
self.addEventListener("fetch", (event)=>{
  const url = new URL(event.request.url);
  // Only handle same-origin GET
  if (event.request.method === "GET" && url.origin === location.origin){
    event.respondWith((async()=>{
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const resp = await fetch(event.request);
      if (resp && resp.ok){
        cache.put(event.request, resp.clone());
      }
      return resp;
    })());
  }
});
