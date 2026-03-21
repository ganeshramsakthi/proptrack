// PropTrack Service Worker v1.0
// Caches app shell for offline use. Data is stored in localStorage/IndexedDB.

const CACHE_NAME = 'proptrack-v1';

// Files to cache for offline use
// Update this list when you add new files to your build
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// External resources to cache (fonts, CDN libraries)
const EXTERNAL_CACHE = [
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap',
];

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      // Cache local files (fail silently if any are missing)
      const localPromise = Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => console.warn('[SW] Failed to cache:', url)))
      );
      // Cache external resources (fail silently — these are optional)
      const externalPromise = Promise.allSettled(
        EXTERNAL_CACHE.map(url => 
          fetch(url, { mode: 'cors' })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => console.warn('[SW] External cache miss:', url))
        )
      );
      return Promise.all([localPromise, externalPromise]);
    }).then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Take control of all pages immediately
  );
});

// ── Fetch: network-first with cache fallback ─────────────────────────────────
// Strategy: Try network first (so users always get latest version).
// If network fails (offline), serve from cache.
// For Google Fonts/CDN: cache-first (these rarely change).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST to Google Drive, etc.)
  if (event.request.method !== 'GET') return;

  // Skip Google OAuth / Drive API requests — never cache these
  if (url.hostname.includes('googleapis.com') && !url.pathname.includes('css')) return;
  if (url.hostname.includes('accounts.google.com')) return;
  if (url.hostname.includes('gstatic.com')) return;

  // CDN/font resources: cache-first
  if (url.hostname !== location.hostname) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // If both fail, return whatever we have
      })
    );
    return;
  }

  // App shell: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // For navigation requests, return the cached index.html (SPA fallback)
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// ── Background sync placeholder ──────────────────────────────────────────────
// When you're ready for background sync (e.g. push to Google Drive when back online):
// self.addEventListener('sync', (event) => {
//   if (event.tag === 'gdrive-sync') {
//     event.waitUntil(doBackgroundSync());
//   }
// });
