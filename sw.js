// SW cache tối giản cho app shell. (Không thay thế coi-serviceworker)
const CACHE_VERSION = "v3";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./manifest.webmanifest",
  "./coi-serviceworker.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(APP_ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
