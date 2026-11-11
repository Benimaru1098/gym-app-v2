const BUILD = /* PWA_BUILD */ null;
const APP_URL = self.registration.scope;
const INDEX_URL = new URL("index.html", APP_URL).href;
const CACHE_PREFIX = `gym-cycle-pwa:${APP_URL}:`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD.revision}`;
const LEGACY_CACHE_NAME = "gym-cycle-vite-v4";
const PRECACHE_FILES = new Map(BUILD.files.map((file) => [new URL(file.url, APP_URL).href, file]));

self.addEventListener("install", (event) => {
  event.waitUntil(cacheBuild());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateBuild());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.destination === "iframe") {
    return;
  }

  const cacheUrl = getCacheUrl(request);
  if (cacheUrl) {
    event.respondWith(cachedOrNetwork(cacheUrl, request));
  }
});

async function cacheBuild() {
  const cacheExisted = await caches.has(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  const requests = [...PRECACHE_FILES].map(([url, { integrity, revalidate }]) =>
    new Request(url, { integrity, cache: revalidate ? "reload" : "default", redirect: "error" }),
  );

  try {
    await cache.addAll(requests);
  } catch (error) {
    if (!cacheExisted) {
      await caches.delete(CACHE_NAME);
    }
    throw error;
  }
}

async function activateBuild() {
  const cacheNames = await caches.keys();
  // A later build may already be installing, so only remove caches created before this one.
  const currentIndex = cacheNames.indexOf(CACHE_NAME);
  if (currentIndex > 0) {
    const previousNames = cacheNames.slice(0, currentIndex).filter((name) =>
      name.startsWith(CACHE_PREFIX) || name === LEGACY_CACHE_NAME,
    );
    await Promise.all(previousNames.map((name) => caches.delete(name)));
  }
  await self.clients.claim();
}

function getCacheUrl(request) {
  if (request.mode === "navigate") {
    const page = new URL(request.url);
    page.search = "";
    if (page.href === APP_URL || page.href === INDEX_URL) {
      return APP_URL;
    }
  }
  return PRECACHE_FILES.has(request.url) ? request.url : null;
}

async function cachedOrNetwork(cacheUrl, request) {
  const cachedResponse = await caches.match(cacheUrl, { cacheName: CACHE_NAME }).catch(() => undefined);
  return cachedResponse ?? fetch(request);
}
