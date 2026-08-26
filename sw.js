/**
 * TRIARCH: Cyclic Edge - Service Worker
 * Robust offline caching, WebRTC P2P mesh support, NATS WebSocket adapter, and instant upgrade activation.
 */

const CACHE_NAME = 'triarch-cache-v1.13.1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './version.json',
  './manifest.json',
  './triarch.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './assets/qr-scanner.min.js',
  './src/crypto/commit.js',
  './src/crypto/index.js',
  './src/network/protocol.js',
  './src/network/signaling.js',
  './src/network/peer-mesh.js',
  './src/network/transports/base-transport.js',
  './src/network/transports/broadcast-transport.js',
  './src/network/transports/nats-transport.js',
  './src/network/transports/index.js',
  './src/network/nats-config.js',
  './src/network/kv-room-registry.js',
  './src/network/creds/ngs-creds.js',
  './src/network/creds/index.js',
  './src/network/index.js',
  './src/math/dice.js',
  './src/math/probability.js',
  './src/math/inspector-math.js',
  './src/math/index.js',
  './src/game/rules.js',
  './src/game/bots.js',
  './src/game/state.js',
  './src/game/network-state.js',
  './src/game/index.js',
  './src/audio/sfx.js',
  './src/audio/haptics.js',
  './src/ui/board-view.js',
  './src/ui/odds-inspector.js',
  './src/ui/audit-ledger.js',
  './src/ui/visualizer.js',
  './src/ui/nats-telemetry-panel.js',
  './src/ui/components.js',
  './src/ui/toast.js',
  './src/ui/tour.js',
  './src/ui/qr.js',
  './src/ui/lobby-view.js',
  './src/ui/app.js'
];

// Handle SKIP_WAITING message from client app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING, activating immediately...');
    self.skipWaiting();
  }
});

// Installation: Cache core shell and module assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`[Service Worker] Pre-caching assets for ${CACHE_NAME}`);
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Service Worker] Pre-caching partial failure, proceeding:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activation: Clean up stale legacy caches and claim clients
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

// Fetch Strategy: Network-First for version.json, Stale-While-Revalidate for app assets
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // version.json: Always Network-First (no-store fallback) to detect updates immediately
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
    );
    return;
  }

  // CDN resources (Tailwind / Fonts / esm.sh) with Cache-First then Network
  const isCdn = url.hostname.includes('cdn') || 
                url.hostname.includes('esm.sh') ||
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

  // App local resources: Stale-While-Revalidate with Navigation Fallback
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
        if (request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('/');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
