// Matte service worker — makes the app run fully offline after the first load.
// Strategy:
//   • shell (html/js/css/mjs)  → network-first, cache fallback  (deploys show
//     immediately online; the last good copy serves offline)
//   • static assets (images,
//     thumbs, defaults)        → cache-first, network fallback  (rarely change)
//   • cross-origin (the SAM /
//     transformers CDN model)  → not intercepted → network only, fails offline
//     by design (too large to bundle; SAM is an optional online enhancement)
//
// Bump VERSION whenever the precache list changes to evict the old cache.
const VERSION = 'matte-v2';

const PRECACHE = [
  './', './index.html', './manifest.json', './favicon.svg', './icon-192.png', './icon-512.png',
  './style.css', './ui.css',
  './main.js', './ui.js', './shader.js', './core.js', './state.js',
  './idb.js', './util.js', './recorder.js', './output.js', './particles.js',
  './vendor/tweakpane-4.0.5.js', './vendor/tweakpane-plugin-essentials-0.2.1.js', './vendor/mp4-muxer-5.1.5.mjs',
  './defaults/lofoten_A.jpg', './defaults/lofoten_B.jpg',
  // mode thumbnails (m00–m47, no m29)
  ...Array.from({ length: 48 }, (_, i) => i)
    .map(i => `./thumbs/m${String(i).padStart(2, '0')}.png`),
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // CDN (SAM model) → network only

  const isCode = req.mode === 'navigate' || /\.(?:js|mjs|css)$/.test(url.pathname);

  if (isCode) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
  } else {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached;  // offline + never-cached asset
      }
    })());
  }
});
