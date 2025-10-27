// @version v1.1.1 (2025-10-25): bump cache to refresh updated assets
const CACHE_NAME = "webllm-shell-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    ))
  );
});

self.addEventListener("fetch", (e)=>{
  const url = new URL(e.request.url);

  // Để WebLLM tự xử lý cache model sharding qua HTTP/IndexedDB.
  if (/(\bmlc-ai\b|\bhuggingface\b|\bmodel\b|\bweb-llm\b)/i.test(url.hostname + url.pathname)) {
    return;
  }

  // App shell: cache-first
  if (e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then(resp => resp || fetch(e.request).then(r=>{
        if (url.origin === location.origin) {
          const rClone = r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request, rClone));
        }
        return r;
      }).catch(()=>caches.match("./index.html")))
    );
  }
});
