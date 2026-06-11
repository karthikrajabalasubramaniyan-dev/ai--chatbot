const CACHE_NAME = "aether-chat-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/favicon.svg",
  "/icons.svg",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Event: cache core files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching offline pages, icons, and shell assets");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: clear old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing legacy cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: intercept requests
self.addEventListener("fetch", (event) => {
  // Only handle GET requests and local scope origins (excludes chrome extensions/external API requests)
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Bypass service worker for local or remote API endpoints to keep chatbot alive
  if (url.pathname.startsWith("/api/") || url.hostname.includes("render.com") || url.hostname.includes("vercel.app")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return from cache, but update it asynchronously in the background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Ignore network errors during stale updates
        });
        return cachedResponse;
      }

      // Fallback to network
      return fetch(event.request).then((networkResponse) => {
        // Dynamically cache other local static assets (Vite js, css, etc.)
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          url.origin === self.location.origin &&
          !url.pathname.includes("/api/")
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If navigation request fails, return offline.html fallback
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
      });
    })
  );
});
