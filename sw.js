/* Rishe 1.6.2 service worker: versioned app shell, safe offline fallback, and owned-cache cleanup. */
const VERSION = 'rishe-app-v1.6.2';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'learning.js', 'app.js', 'data.json', 'manifest.webmanifest',
  'fonts/fraunces.woff2', 'fonts/fraunces-italic.woff2', 'fonts/inter.woff2', 'fonts/vazirmatn.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const OWNED_PREFIXES = ['rishe-app-', 'rishe-v'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // A failed precache should fail installation rather than activate a half-cached release.
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => OWNED_PREFIXES.some(prefix => key.startsWith(prefix)) && key !== VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Handle navigation network-first; fall back to the cached app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(VERSION);
          await cache.put('index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  const isData = /(?:^|\/)data\.json$/.test(url.pathname);
  if (isData) {
    // Online sessions receive current data; offline sessions keep the last cached data.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match('data.json')) || Response.error();
      }
    })());
    return;
  }

  // Versioned shell assets are precached during install. Cache first for stability;
  // cache misses fall back to the network and are stored for later offline access.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});


// Daily reminders are scheduled locally by the open application. Clicking a notification
// returns the user to the Learn screen in an existing window or opens the app if needed.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || new URL('#/learn', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
