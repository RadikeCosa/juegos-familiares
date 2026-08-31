const CACHE_VERSION = "v1";
const STATIC_CACHE_NAME = `juegos-familia-static-${CACHE_VERSION}`;

const CACHEABLE_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const CACHEABLE_EXACT_PATHS = [
  "/apple-icon.png",
  "/favicon.ico",
  "/icon.svg",
  "/manifest.webmanifest",
];

const NEVER_CACHE_PATH_PREFIXES = [
  "/auth/",
  "/rest/",
  "/realtime/",
  "/storage/",
  "/functions/",
];

const NEVER_CACHE_TEXT_PATTERNS = [
  "supabase",
  "/rpc/",
  "get_my_active_room",
  "get_my_game_state",
];

function isNeverCacheRequest(requestUrl) {
  const url = new URL(requestUrl);
  const serializedUrl = url.href.toLowerCase();

  return (
    NEVER_CACHE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    NEVER_CACHE_TEXT_PATTERNS.some((pattern) => serializedUrl.includes(pattern))
  );
}

function isCacheableStaticRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return false;
  }

  if (isNeverCacheRequest(request.url)) {
    return false;
  }

  return (
    CACHEABLE_EXACT_PATHS.includes(url.pathname) ||
    CACHEABLE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("juegos-familia-static-") &&
                cacheName !== STATIC_CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "JUEGOS_FAMILIA_APPLY_UPDATE") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (!isCacheableStaticRequest(event.request)) {
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
