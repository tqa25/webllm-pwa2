// Very small PWA shell cache (do NOT cache model shards)
const CACHE_NAME = "webllm-shell-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))
  );
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

  // Bỏ qua các request model shard/huggingface/mlc-ai… để WebLLM + HTTP cache tự xử lý
  if (/(\bmlc-ai\b|\bhuggingface\b|\bmodel\b|\bweb-llm\b)/i.test(url.hostname + url.pathname)) {
    return; // network as-is
  }

  // Cache-first cho app shell
  if (e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then(resp => resp || fetch(e.request).then(r=>{
        // optional: only cache same-origin
        if (url.origin === location.origin) {
          const rClone = r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request, rClone));
        }
        return r;
      }).catch(()=>caches.match("./index.html")))
    );
  }
});
