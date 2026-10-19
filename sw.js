importScripts("./assets/precache.js");
const CACHE_PREFIX = `eazyread-${self.registration.scope}::`;
const CACHE_NAME = CACHE_PREFIX + self.EAZYREAD_CACHE;
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(["./", ...self.EAZYREAD_ASSETS])),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
                key === "eazyread-v1",
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  // Serve the HTML and code from the same release, including while a new worker installs.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate")
        return (await cache.match("./index.html")) || fetch(event.request);
      return fetch(event.request);
    }),
  );
});
