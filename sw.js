// Derive cache name from centralized version config (js/version.js)
// so deploys automatically invalidate stale caches including wasm assets.
try { importScripts('./js/version.js'); } catch (e) { /* version.js unavailable */ }
const CACHE_NAME = (typeof APP_VERSION !== 'undefined' && APP_VERSION.cacheKey)
  ? APP_VERSION.cacheKey
  : 'resourcery-v2.2.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './coi-serviceworker.js',
  './js/version.js',
  './js/app.js',
  './js/audio-processor.js',
  './js/fft.js',
  './js/tempo-detector.js',
  './js/key-detector.js',
  './js/analysis-worker.js',
  './manifest.json',
  './icons/reSOURCERY_optimized.svg',
  './VM-Logo-White.svg',
  './VA-Logo-White.svg'
];

// External CDN resources
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@700;800;900&family=Reddit+Sans:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js',
  'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Cache install failed:', err))
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except for CDN assets
  const isCDNAsset = CDN_ASSETS.some(cdn => request.url.includes(cdn));
  if (url.origin !== location.origin && !isCDNAsset) {
    return;
  }

  // For API/media requests, network only
  if (url.pathname.startsWith('/api/') || request.url.includes('blob:')) {
    return;
  }

  // CDN assets: cache-first to avoid 503 errors on flaky mobile connections
  if (isCDNAsset) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          // Serve from cache immediately, refresh in background
          fetch(request).then(response => {
            if (response.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(request, response));
            }
          }).catch(() => { /* background refresh failed, cache is still valid */ });
          return cachedResponse;
        }

        // Not cached yet — fetch from network (let errors propagate naturally
        // so audio-processor.js retry logic can handle them)
        return fetch(request).then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // Clone response for caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Background sync for failed uploads
self.addEventListener('sync', event => {
  if (event.tag === 'media-upload') {
    event.waitUntil(syncMediaUpload());
  }
});

async function syncMediaUpload() {
  // Handle background sync for media uploads
  console.log('[SW] Background sync: media-upload');
}
