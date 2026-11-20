// Chronicle X – Service Worker
// Network-first for pages and code, cache-first for images and fonts

const CACHE_NAME = "chronicle-v7-paper-dusk";

// App shell assets to pre-cache on install
const APP_SHELL = [
  "/icon.png",
  "/favicon.png",
  "/favicon.svg",
  "/brand/chronicle-mark.png",
  "/icon-maskable.png",
  "/apple-touch-icon.png",
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
            `<!DOCTYPE html>
            <html lang="en">
              <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Chronicle · Offline</title>
                <script>try{document.documentElement.dataset.theme=localStorage.getItem("chronicle_theme")}catch{}</script>
                <style>
                  :root { color-scheme: light; --paper: #f7f5f0; --ink: #302b3a; --action: #c5b0ea; }
                  [data-theme="dark"] { color-scheme: dark; --paper: #19151f; --ink: #f1eaf5; --action: #bda0e1; }
                  body { background: var(--paper); color: var(--ink); font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100dvh; margin: 0; text-align: center; }
                  main { padding: 24px; }
                  button { margin-top: 16px; min-height: 44px; padding: 10px 20px; background: var(--action); color: #302b3a; border: 0; border-radius: 4px; font: inherit; cursor: pointer; }
                </style>
              </head>
              <body><main><h1>You’re offline</h1><p>Reconnect to open your library.</p><button onclick="location.reload()">Retry</button></main></body>
            </html>`,
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
