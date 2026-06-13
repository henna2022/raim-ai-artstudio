// AI 그림 연구소 PWA 서비스 워커
// 전략: same-origin GET은 network-first (온라인이면 항상 최신, 오프라인이면 캐시 폴백)
const CACHE = "raim-cache-v1";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/i18n.js",
  "./manifest.json",
  "./assets/seoulraim_logo.png",
  "./assets/raimi.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // API(POST) 등은 그대로 통과
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 폰트·QR 등 외부 요청은 캐시하지 않음

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
