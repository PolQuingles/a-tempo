// A Tempo — treballador de servei: els avisos al mòbil i l'app disponible sense cobertura.
// La pàgina es demana sempre primer a la xarxa, així ningú no es queda amb una versió antiga; si no n'hi ha
// (o tarda massa, com a moltes sales d'assaig), s'obre la darrera que es va desar. El codi i els estils porten
// ?v=<empremta> a l'adreça: no canvien mai, i es desen i es reaprofiten. Les dades no passen per aquí: Firestore
// ja en guarda una còpia al mòbil. VERSION i SHELL els escriu tools/stamp.py.
const VERSION = '62e10fc90d';
const SHELL = ['./', 'index.html', 'app.webmanifest', 'app/icon-192.png', 'app/icon-180.png', 'app/favicon-48.png', 'css/app.css?v=349af515be', 'config.js?v=666ce52d45', 'js/00-errors.js?v=739f456eee', 'js/01-base.js?v=e545232d3a', 'js/02-dades.js?v=daa5157a7b', 'js/03-pantalla.js?v=585f7a2e75', 'js/04-llista.js?v=9664f0b595', 'js/05-calendari.js?v=af35f417a0', 'js/06-estadistiques.js?v=8a73816a7e', 'js/07-gestio.js?v=9f8f2aae4c', 'js/08-tauler.js?v=1f0c450f21', 'js/09-classes.js?v=5b23b3562f', 'js/10-inici.js?v=e629e5ec74', 'js/11-fitxes.js?v=1f37053a93', 'js/12-persones.js?v=686bb3c9c3', 'js/13-avisos-mobil.js?v=b0501001f0', 'js/14-eines.js?v=aabdb2072f', 'js/15-copies.js?v=fd380e9298', 'js/16-agrupacions.js?v=a502c98040', 'js/17-rutes.js?v=52a1e3bf1d', 'js/18-accions.js?v=6617c45681', 'js/19-arrencada.js?v=4c65a93576'];
const CDN = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
];
const CACHE = `atempo-${VERSION}`;
const RUNTIME = 'atempo-runtime';
const NET_WAIT = 4000;   // mil·lisegons que s'espera la xarxa abans d'obrir la versió desada

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  await Promise.all(CDN.map(u => fetch(u, { mode: 'cors', credentials: 'omit' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('atempo-') && k !== CACHE && k !== RUNTIME) await caches.delete(k);
  await self.clients.claim();
})()));

const indexKey = () => new URL('index.html', self.registration.scope).href;
async function fromNetworkFirst(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req).then(r => { if (r.ok) c.put(indexKey(), r.clone()); return r; });
  const slow = new Promise(res => setTimeout(res, NET_WAIT));
  try {
    const r = await Promise.race([net, slow.then(() => null)]);
    if (r) return r;
  } catch {}
  const saved = await c.match(indexKey()) || await c.match(new URL('./', self.registration.scope).href);
  if (saved) return saved;
  return net;   // sense res desat: que falli com sempre
}
async function fromCacheFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') return e.respondWith(fromNetworkFirst(req));
    if (url.pathname.endsWith('.ics') || url.pathname.endsWith('sw.js')) return;   // calendaris i el treballador: sempre de la xarxa
    if (url.searchParams.has('v')) return e.respondWith(fromCacheFirst(req, CACHE));
    return e.respondWith(staleWhileRevalidate(req));
  }
  if (url.href.startsWith('https://www.gstatic.com/firebasejs/')) return e.respondWith(fromCacheFirst(req, CACHE));
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(staleWhileRevalidate(req));
  // La resta (Firestore, l'entrada amb Google…) no es toca.
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'A Tempo';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: d.icon ? `./${d.icon}` : './app/icon-192.png',
    badge: './app/icon-192.png',
    lang: 'ca',
    tag: d.tag || 'a-tempo',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        if ('navigate' in c) c.navigate(target).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
