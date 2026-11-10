// A Tempo — treballador de servei: els avisos al mòbil i l'app disponible sense cobertura.
// La pàgina es demana sempre primer a la xarxa, així ningú no es queda amb una versió antiga; si no n'hi ha
// (o tarda massa, com a moltes sales d'assaig), s'obre la darrera que es va desar. El codi i els estils porten
// ?v=<empremta> a l'adreça: no canvien mai, i es desen i es reaprofiten. Les dades no passen per aquí: Firestore
// ja en guarda una còpia al mòbil. VERSION i SHELL els escriu tools/stamp.py.
const VERSION = 'eb20ef18c9';
const SHELL = ['./', 'index.html', 'app.webmanifest', 'app/icon-192.png', 'app/icon-180.png', 'app/favicon-48.png', 'fonts/hanken-grotesk-latin.woff2', 'fonts/bodoni-moda-latin.woff2', 'fonts/bodoni-moda-italic-latin.woff2', 'css/app.css?v=ff3bbeaeee', 'config.js?v=666ce52d45', 'js/00-errors.js?v=466e708bfe', 'js/01-base.js?v=9ada71a832', 'js/02-dades.js?v=9a67627935', 'js/02b-arxiu.js?v=349bb1b73e', 'js/02c-fitxes-privades.js?v=1b82d1d8f8', 'js/03b-rols.js?v=fe21de0738', 'js/03-pantalla.js?v=0bb29ffd7e', 'js/04-llista.js?v=0020b78d9e', 'js/04b-en-funcions.js?v=5b9dbe4956', 'js/05-calendari.js?v=37fa0871f1', 'js/06-estadistiques.js?v=589541314b', 'js/07-gestio.js?v=2677fb9d61', 'js/08-tauler.js?v=151aa03529', 'js/08b-bandes.js?v=29d9b2d0b3', 'js/08c-nit-bandes.js?v=85abed9a44', 'js/08d-bandes-equip.js?v=3246df950d', 'js/08e-bandes-resultats.js?v=5a3cc869af', 'js/09-classes.js?v=c1d90e865d', 'js/09b-classes-horari.js?v=72ae7c8647', 'js/09c-classes-fitxes.js?v=8a0d6936be', 'js/09d-classes-quadern.js?v=92822632f8', 'js/10-inici.js?v=1578d04e31', 'js/11-fitxes.js?v=54d24f5cc1', 'js/11b-produccio.js?v=f81e9d613f', 'js/11c-absencia.js?v=6ae908dcf3', 'js/12-persones.js?v=246f6631bb', 'js/12c-entrar.js?v=cc4d1219e1', 'js/13-avisos-mobil.js?v=89ab1340d6', 'js/14-eines.js?v=69df76bfbb', 'js/14b-manual.js?v=d31711ba91', 'js/14c-tauler-fitxes.js?v=5e3eb8c916', 'js/15-copies.js?v=c462226ef7', 'js/16-agrupacions.js?v=4205b2a540', 'js/17-rutes.js?v=cc8860cce4', 'js/18-repertori.js?v=241e6a2eee', 'js/18b-arxiu.js?v=41c5f7c686', 'js/18c-arxiu-material.js?v=5a396a2603', 'js/19-concerts.js?v=580a60d193', 'js/20-sortides.js?v=70a9c5bc89', 'js/20b-vestidor.js?v=0ca5c56007', 'js/21-missatges.js?v=6679941ecf', 'js/21b-converses.js?v=897d5f8054', 'js/22-secretaria.js?v=f40516c0a1', 'js/22b-tries.js?v=206a4b8ad6', 'js/22c-privacitat.js?v=eb25d9e8c3', 'js/23-accions.js?v=61f1daf790', 'js/24-arrencada.js?v=e4c4c782f5'];
const CDN = [
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-compat.js',
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
  if (url.href.startsWith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/')) return e.respondWith(fromCacheFirst(req, CACHE));   // el visor de PDF, també sense cobertura
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
    data: { url: d.url || './', sid: d.sid || '', rol: d.rol || '' },
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
