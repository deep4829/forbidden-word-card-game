// Service Worker for Forbidden Word Game PWA
const CACHE_NAME = 'forbidden-word-game-v1';
const OFFLINE_URL = '/offline';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
  '/sounds/click.mp3',
  '/sounds/success.mp3',
  '/sounds/error.mp3',
  '/sounds/info.mp3'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to cache:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - network strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip socket.io requests
  if (url.pathname.includes('socket.io')) {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (images, sounds, icons) - Stale while revalidate
  if (
    request.destination === 'image' ||
    request.destination === 'audio' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/sounds/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.mp3')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // HTML pages - Network first with offline fallback
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // JS, CSS, and other assets - Stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Network first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Network first with offline fallback for HTML pages
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return offline page for navigation requests
    const offlineResponse = await caches.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
    // Fallback offline response if offline page not cached
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Forbidden Word Game</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1e1b4b 0%, #7c3aed 50%, #6366f1 100%);
            font-family: system-ui, -apple-system, sans-serif;
            padding: 1rem;
          }
          .card {
            background: rgba(255,255,255,0.95);
            padding: 2rem;
            border-radius: 1rem;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          }
          h1 { font-size: 3rem; margin-bottom: 1rem; }
          h2 { color: #1e1b4b; margin-bottom: 0.5rem; }
          p { color: #6b7280; margin-bottom: 1.5rem; }
          button {
            background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
          }
          button:hover { opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>📴</h1>
          <h2>You're Offline</h2>
          <p>Please check your internet connection and try again.</p>
          <button onclick="window.location.reload()">Try Again</button>
        </div>
      </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

// Stale while revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
