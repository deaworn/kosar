// App shell: stale-while-revalidate, so the app opens with no network and still
// picks up new versions next time. Other origins (translation, Open Food Facts)
// pass through untouched, except product photos, which are cached cache-first
// so they also show offline.
const SHELL = 'kosar-shell-v22';
const SHARE = 'kosar-share';
const IMG = 'kosar-img-v1';
const ASSETS = ['./', 'index.html', 'app.js', 'enrich.js', 'dictionary.js', 'photos.js', 'scanner.js', 'ai.js', 'offer-merge.js', 'name-check.js', 'brand.js', 'refresh.js', 'variants.js', 'units.js', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the HTTP cache, so a new version never mixes with stale files.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== IMG && k !== SHARE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Web Share Target: a photo shared into the app is parked here; the page picks it up.
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const c = await caches.open(SHARE);
        let i = 0;
        for (const f of form.getAll('photo')) if (f && f.type?.startsWith('image/')) await c.put('./shared-' + Date.now() + '-' + i++, new Response(f, { headers: { 'Content-Type': f.type } }));
      } catch { /* nothing shared */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(key, { ignoreSearch: true });
      const net = fetch(req).then((r) => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response('offline', { status: 503 });
    }));
    return;
  }
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); c.put(req, r.clone()); return r; } catch { return new Response('', { status: 504 }); }
    }));
  }
});
