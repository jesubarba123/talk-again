/* Talk Again — service worker: deja la app disponible sin conexión.
   - Archivos propios: responde desde la caché y actualiza en segundo plano (stale-while-revalidate).
   - Detector de cámara (MediaPipe en jsDelivr y el modelo en Google Storage): caché primero, para que
     no haga falta internet después de la primera vez (el modelo caduca en 1 h en la caché normal).
   El workflow de publicación sustituye VERSION por el hash del commit en cada despliegue. */
const VERSION = 'talkagain-v0.2.0';
const MP_CACHE = 'talkagain-mp-0.10.21';
const MP_PREFIX = ['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@', 'https://storage.googleapis.com/mediapipe-models/'];
const PRECACHE = [
  './', './index.html', './styles.css', './app.js', './data.js', './nod-detector.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/AtkinsonHyperlegible-Regular.woff2', './fonts/AtkinsonHyperlegible-Bold.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(new Request(url, { cache: 'no-cache' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MP_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (MP_PREFIX.some(p => req.url.startsWith(p))) {
    event.respondWith(caches.open(MP_CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req.url, { cache: 'no-cache' }).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') {
        const home = await cache.match('./index.html');
        if (home) return home;
      }
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
