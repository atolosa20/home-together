// Service worker: shows push notifications and keeps the app shell available offline.
const CACHE = "home-together-v12";
const SHELL = ["./", "index.html", "styles.css", "app.js", "i18n.js", "config.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png"];

self.addEventListener("install", e => {
  // "reload": straight from the server, never an older copy from the browser cache.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first, so updates arrive straight away; fall back to the cache when offline.
// Everything, the page included, is revalidated with the server: GitHub Pages lets browsers keep files
// for 10 minutes, and an old page with a new app.js stops the app.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const req = e.request.mode === "navigate" ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" }).then(r => r.redirected ? fetch(e.request) : r)
    : fetch(new Request(e.request, { cache: "no-cache" }));
  e.respondWith(
    req.then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || caches.match("index.html")))
  );
});

self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || "Home Together";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
    tag: data.tag || undefined,
    data: { url: data.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
