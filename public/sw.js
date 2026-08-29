const CACHE_NAME = "daily-water-shell-v5";

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function fetchAndCache(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok) await cache.put(url, response.clone());
    return response;
  } catch {
    return null;
  }
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const homeUrl = self.registration.scope;
  const homeResponse = await fetchAndCache(cache, homeUrl);
  const fixedAssets = [
    scopedUrl("manifest.webmanifest"),
    scopedUrl("favicon.svg"),
    scopedUrl("icons/icon.svg"),
    scopedUrl("icons/icon-192.png"),
    scopedUrl("icons/icon-512.png"),
  ];

  await Promise.all(fixedAssets.map((url) => fetchAndCache(cache, url)));

  if (!homeResponse) return;
  const html = await homeResponse.clone().text();
  const discoveredAssets = Array.from(
    html.matchAll(/(?:src|href)=["']([^"']+)["']/g),
    (match) => new URL(match[1], homeUrl),
  )
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        url.href.startsWith(self.registration.scope),
    )
    .map((url) => url.href);

  await Promise.all(
    [...new Set(discoveredAssets)].map((url) => fetchAndCache(cache, url)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(self.registration.scope, response.clone());
          }
          return response;
        })
        .catch(() => caches.match(self.registration.scope)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
