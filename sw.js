// A Tempo — treballador de servei: els avisos al mòbil i l'app disponible sense cobertura.
// La pàgina es demana sempre primer a la xarxa, així ningú no es queda amb una versió antiga; si no n'hi ha
// (o tarda massa, com a moltes sales d'assaig), s'obre la darrera que es va desar. El codi i els estils porten
// ?v=<empremta> a l'adreça: no canvien mai, i es desen i es reaprofiten. Les dades no passen per aquí: Firestore
// ja en guarda una còpia al mòbil. VERSION i SHELL els escriu tools/stamp.py.
const VERSION = '2f773bd72d';
const SHELL = ['./', 'index.html', 'app.webmanifest', 'app/icon-192.png', 'app/icon-180.png', 'app/favicon-48.png', 'css/app.css?v=fe318f5386', 'config.js?v=666ce52d45', 'js/00-errors.js?v=739f456eee', 'js/01-base.js?v=4b14c8423e', 'js/02-dades.js?v=241762059a', 'js/03-pantalla.js?v=a933f15a1e', 'js/04-llista.js?v=d06277e3aa', 'js/05-calendari.js?v=d4b5efa1ad', 'js/06-estadistiques.js?v=08d752533f', 'js/07-gestio.js?v=7564d627aa', 'js/08-tauler.js?v=20506a99d4', 'js/09-classes.js?v=dff63a7ada', 'js/10-inici.js?v=46bcb2f85f', 'js/11-fitxes.js?v=28837cae61', 'js/12-persones.js?v=a13509ed3d', 'js/13-avisos-mobil.js?v=33f86d0f8f', 'js/14-eines.js?v=7160f49b9a', 'js/15-copies.js?v=64cfe35f8c', 'js/16-agrupacions.js?v=b12e8afe46', 'js/17-rutes.js?v=8af2b87fcd', 'js/18-repertori.js?v=a4d9b8bda0', 'js/19-concerts.js?v=139ba69554', 'js/20-sortides.js?v=50beb08c89', 'js/21-missatges.js?v=b5f8123972', 'js/22-secretaria.js?v=9ab9f12f84', 'js/23-accions.js?v=3da775d313', 'js/24-arrencada.js?v=ff3b9d6c6f'];
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
  // «atempo-fitxers» són les partitures i els àudios que cadascú ha desat al mòbil: no s'esborren mai aquí.
  for (const k of await caches.keys()) if (k.startsWith('atempo-') && k !== CACHE && k !== RUNTIME && k !== 'atempo-fitxers') await caches.delete(k);
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
    // Botons per respondre des de la mateixa notificació (on el mòbil els mostra: l'Android sí, l'iPhone no).
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    data: { url: d.url || './', sid: d.sid || '' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = new URL(data.url || './', self.registration.scope);
  // Un botó de la notificació: l'app ho fa en obrir-se (vegeu runNotificationAction).
  if (e.action && data.sid) { url.searchParams.set('accio', e.action); url.searchParams.set('s', data.sid); }
  const target = url.href;
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
