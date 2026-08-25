/**
 * TRIARCH: Cyclic Edge - Service Worker
 * Robust offline caching and lifecycle management for GitHub Pages PWA deployment.
 */

const CACHE_NAME = 'triarch-cache-v1.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './triarch.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './src/math/dice.js',
  './src/math/probability.js',
  './src/math/index.js',
  './src/game/rules.js',
  './src/game/bots.js',
  './src/game/state.js',
  './src/game/index.js',
  './src/audio/sfx.js',
  './src/ui/visualizer.js',
  './src/ui/components.js',
  './src/ui/app.js'
];

// Installation: Cache core shell and module assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Service Worker] Pre-caching partial failure, proceeding:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activation: Clean up stale legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing deprecated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Strategy: Stale-While-Revalidate for app assets with Network Fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignore non-GET requests or chrome extension schemes
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Handle CDN resources (Tailwind / Fonts) with Cache-First then Network
  const url = new URL(request.url);
  const isCdn = url.hostname.includes('cdn') || 
                url.hostname.includes('fonts.googleapis.com') || 
                url.hostname.includes('fonts.gstatic.com') ||
                url.hostname.includes('cdnjs.cloudflare.com');

  if (isCdn) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          return cachedResponse || new Response('Offline resource unavailable', { status: 503 });
        }
      })
    );
    return;
  }

  // For app local resources: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If offline and requesting navigation, fallback to root index.html
        if (request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('/');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
