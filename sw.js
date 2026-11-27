// מעצב חכם — עבודה גם בלי אינטרנט (חוץ מה-AI)
const CACHE = 'meatzev-v1.1.7';
const FILES = ['./', 'index.html', 'app.js', 'rules.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'plan.js', 'media/logo.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // 🔗 "שיתוף" מאתר/גלריה ישר לאפליקציה: שומרים את מה ששותף ועוברים לאפליקציה
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try { const f = await e.request.formData(), file = f.get('image'), c = await caches.open('share-inbox');
        await c.put('meta', new Response(JSON.stringify({ title: f.get('title') || '', text: f.get('text') || '', url: f.get('url') || '', t: Date.now() })));
        if (file && file.size) await c.put('image', new Response(file, { headers: { 'content-type': file.type || 'image/jpeg' } })); else await c.delete('image');
      } catch (er) {}
      return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // רשת קודם (כדי לקבל עדכונים), ואם אין אינטרנט — מהמטמון
  if (u.pathname.endsWith('version.json')) return; // תמיד מהרשת
  e.respondWith(fetch(e.request).then(r => { if (r.status === 200 && !e.request.headers.get('range')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
