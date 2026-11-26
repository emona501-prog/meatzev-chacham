// מעצב חכם — עבודה גם בלי אינטרנט (חוץ מה-AI)
const CACHE = 'meatzev-v0.9.1';
const FILES = ['./', 'index.html', 'app.js', 'rules.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'plan.js', 'media/logo.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // רשת קודם (כדי לקבל עדכונים), ואם אין אינטרנט — מהמטמון
  if (u.pathname.endsWith('version.json')) return; // תמיד מהרשת
  e.respondWith(fetch(e.request).then(r => { if (r.status === 200 && !e.request.headers.get('range')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
