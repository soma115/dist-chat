const CACHE = 'dist-chat-v2';
const FILES = ['.', './index.html', './app.js', './styles.css', './manifest.json'];

async function cacheFiles() {
  const c = await caches.open(CACHE);
  await c.addAll(FILES);
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheFiles());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

async function networkFirst(req) {
  try {
    const net = await fetch(req);
    if (net && net.status === 200) {
      const c = await caches.open(CACHE);
      c.put(req, net.clone());
    }
    return net;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  const net = fetch(req).then((res) => {
    if (res && res.status === 200) {
      caches.open(CACHE).then((c) => c.put(req, res.clone()));
    }
    return res;
  }).catch(() => cached);
  return cached || net;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const name = url.pathname.split('/').pop();
  if (['', 'index.html', 'app.js', 'styles.css'].includes(name)) {
    e.respondWith(networkFirst(e.request));
  } else {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});
