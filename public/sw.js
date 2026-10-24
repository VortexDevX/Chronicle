// Chronicle X – Service Worker
// Network-first for pages and code, cache-first for images and fonts

const CACHE_NAME = "chronicle-v3";

// App shell assets to pre-cache on install
const APP_SHELL = [
  "/icon.png",
  "/favicon.png",
];

// ── Install: pre-cache app shell ──────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate immediately, don't wait for old SW to die
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, API calls, and Next.js internals
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  // App code: network-first so a new page never runs with an old stylesheet.
  if (url.pathname.match(/\.(css|js)$/)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static images and fonts: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Pages (navigation): network-first with cache fallback
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (url.pathname === "/login") {
            const cachedLogin = await caches.match("/login");
            if (cachedLogin) return cachedLogin;
          }
          return new Response(
            "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'><title>Chronicle - Offline</title><style>body{background:#0e1117;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;}button{margin-top:16px;padding:10px 20px;background:#e50914;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;}</style></head><body><h2>You appear to be offline</h2><p>Please check your internet connection.</p><button onclick='location.reload()'>Retry</button></body></html>",
            {
              status: 503,
              statusText: "Offline",
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        })
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
