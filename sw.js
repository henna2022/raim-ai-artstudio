// AI 그림 연구소 PWA 서비스 워커
// 전략: same-origin GET은 network-first (온라인이면 항상 최신, 오프라인이면 캐시 폴백)
const CACHE = "raim-cache-v38";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/i18n.js",
  "./js/xlsx-mini.js",
  "./js/qr-mini.js",
  "./js/report.js",
  "./js/dashboard-data.js",
  "./manifest.json",
  "./assets/seoulraim_logo.png",
  "./assets/raimi.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  // 페이퍼로지 폰트(자체 호스팅) — 오프라인에서도 글꼴 유지
  "./assets/fonts/Paperlogy-4Regular.woff2",
  "./assets/fonts/Paperlogy-5Medium.woff2",
  "./assets/fonts/Paperlogy-7Bold.woff2",
  "./assets/fonts/Paperlogy-8ExtraBold.woff2",
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
  if (url.origin !== location.origin) return; // 외부 요청(R2 생성물 이미지 등)은 캐시하지 않음
  if (url.pathname.startsWith("/api/")) return; // API는 항상 네트워크로(오래된 통계 캐시 방지)

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) =>
        // 페이지 이동만 index.html로 폴백. JS/CSS 등 자산 요청엔 HTML을 돌려주지 않는다
        // (모듈 요청에 HTML이 오면 정적 import가 깨져 앱 부팅이 실패할 수 있음)
        r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
