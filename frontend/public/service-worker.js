/* Control Room — Minimal PWA Service Worker
 *
 * Strategie:
 *  - Navigazione (HTML): network-first con fallback cache, poi /offline.html
 *  - Asset statici (JS/CSS/IMG/FONT): cache-first con revalidate in background
 *  - API (/api/*): SEMPRE network — non cachiamo dati sensibili/auth
 *  - Cache versionato: aggiorna CACHE_NAME a ogni rilascio per forzare refresh
 */
const CACHE_NAME = "control-room-v2";
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET viene cachato
  if (request.method !== "GET") return;

  // Skippa cross-origin (Cloudflare, Emergent, font CDN gestiscono in autonomia)
  if (url.origin !== self.location.origin) return;

  // API: passa sempre dalla rete (no-cache per evitare dati stale o leak di auth)
  if (url.pathname.startsWith("/api/")) return;

  // Hot reload webpack: skippa
  if (url.pathname.includes("hot-update") || url.pathname.includes("__webpack")) return;

  // Navigazione HTML → network-first
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // Aggiorna cache della root
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/", copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

  // Statici → cache-first + revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Permetti aggiornamento manuale via messaggio dalla webapp
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ─── Web Push notifications ───────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Control Room", body: event.data ? event.data.text() : "Nuovo aggiornamento" };
  }
  const title = data.title || "Control Room";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "control-room",
    data: { url: data.url || "/", tag: data.tag },
    requireInteraction: false,
    silent: false,
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Riusa una finestra esistente se aperta
    for (const w of wins) {
      try {
        const u = new URL(w.url);
        if (u.origin === self.location.origin) {
          await w.focus();
          await w.navigate(targetUrl).catch(() => {});
          return;
        }
      } catch (_) { /* ignore */ }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
