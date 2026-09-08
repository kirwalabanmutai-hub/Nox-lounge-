'use strict';

/**
 * App-shell service worker. Makes the page itself loadable with no
 * connection, once it has been opened at least one time while online
 * (unavoidable - a browser has to fetch a page from somewhere the first
 * time). After that first visit, this cache is what lets the login/Sell
 * screen open with the WiFi off.
 *
 * Actual data (products, sales, etc.) offline-handling is separate - see
 * public/js/offline.js, which queues sales locally when a request fails
 * for network reasons and syncs them once the connection is back.
 */
const CACHE = 'nox-pos-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/tailwind.css',
  '/css/styles.css',
  '/js/api.js',
  '/js/offline.js',
  '/js/app.js',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes - api.js/offline.js handle those

  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) {
    // API reads: try the network first (freshest data), fall back to the
    // last successful response if there's no connection.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell (HTML/CSS/JS): cache-first, so the UI opens instantly and
  // works offline. Refresh the cache in the background when online.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
