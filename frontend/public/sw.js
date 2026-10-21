const CACHE = "arasaka-app-v1";
const STATIC_FILES = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/arasaka-logo.webp",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE);
  const page = await fetch("/");
  const html = await page.clone().text();
  const assets = [...html.matchAll(/"(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  await cache.put("/", page);
  await cache.addAll([...assets, ...STATIC_FILES]);
}

async function deleteOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isAppFile = request.method === "GET" && url.origin === self.location.origin && !url.pathname.startsWith("/api/");
  if (!isAppFile) return;
  event.respondWith(request.mode === "navigate" ? networkFirst(request) : cacheFirst(request));
});
