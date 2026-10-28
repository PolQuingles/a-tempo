// A Tempo — treballador de servei: els avisos al mòbil i l'app disponible sense cobertura.
// La pàgina es demana sempre primer a la xarxa, així ningú no es queda amb una versió antiga; si no n'hi ha
// (o tarda massa, com a moltes sales d'assaig), s'obre la darrera que es va desar. El codi i els estils porten
// ?v=<empremta> a l'adreça: no canvien mai, i es desen i es reaprofiten. Les dades no passen per aquí: Firestore
// ja en guarda una còpia al mòbil. VERSION i SHELL els escriu tools/stamp.py.
const VERSION = 'a920575dbe';
const SHELL = ['./', 'index.html', 'app.webmanifest', 'app/icon-192.png', 'app/icon-180.png', 'app/favicon-48.png', 'css/app.css?v=bfe7a97652', 'config.js?v=666ce52d45', 'js/00-errors.js?v=466e708bfe', 'js/01-base.js?v=cc9bad5220', 'js/02-dades.js?v=d99f84898b', 'js/02b-arxiu.js?v=349bb1b73e', 'js/02c-fitxes-privades.js?v=b06afbd171', 'js/03b-rols.js?v=41770c231e', 'js/03-pantalla.js?v=e63b7bd72b', 'js/04-llista.js?v=24cbe659ab', 'js/04b-en-funcions.js?v=bc202aaea9', 'js/05-calendari.js?v=62fa73a014', 'js/06-estadistiques.js?v=43bcd4ea5f', 'js/07-gestio.js?v=5ceefa3cd3', 'js/08-tauler.js?v=bc4f513ee0', 'js/09-classes.js?v=da537ae881', 'js/09b-classes-horari.js?v=deff9c2d5d', 'js/09c-classes-fitxes.js?v=de0ba9c1e7', 'js/10-inici.js?v=a9c3a54ce3', 'js/11-fitxes.js?v=dea9f905a0', 'js/11b-produccio.js?v=e2ebb16a65', 'js/11c-absencia.js?v=62b868af92', 'js/12-persones.js?v=5525f5f0a7', 'js/12c-entrar.js?v=cfc96b32c2', 'js/13-avisos-mobil.js?v=f564f69ce0', 'js/14-eines.js?v=db666d87fa', 'js/14b-manual.js?v=90094b58cf', 'js/14c-tauler-fitxes.js?v=a2643b08f9', 'js/15-copies.js?v=75effd9ea5', 'js/16-agrupacions.js?v=738951cb03', 'js/17-rutes.js?v=38f55764df', 'js/18-repertori.js?v=801f6f9ab0', 'js/18b-arxiu.js?v=ae373c734c', 'js/18c-arxiu-material.js?v=11d3e01c2c', 'js/19-concerts.js?v=2224611c4e', 'js/20-sortides.js?v=988848a1d9', 'js/20b-vestidor.js?v=ed1af300d5', 'js/21-missatges.js?v=ca6e128bd3', 'js/21b-converses.js?v=93a7d0b8db', 'js/22-secretaria.js?v=fcca091c21', 'js/22b-tries.js?v=885c6e123b', 'js/22c-privacitat.js?v=489d3f627e', 'js/23-accions.js?v=dc6251ee51', 'js/24-arrencada.js?v=2ec4c1a0aa'];
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
  if (url.href.startsWith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/')) return e.respondWith(fromCacheFirst(req, CACHE));   // el visor de PDF, també sense cobertura
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
