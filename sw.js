// A Tempo — treballador de servei: els avisos al mòbil i l'app disponible sense cobertura.
// La pàgina es demana sempre primer a la xarxa, així ningú no es queda amb una versió antiga; si no n'hi ha
// (o tarda massa, com a moltes sales d'assaig), s'obre la darrera que es va desar. El codi i els estils porten
// ?v=<empremta> a l'adreça: no canvien mai, i es desen i es reaprofiten. Les dades no passen per aquí: Firestore
// ja en guarda una còpia al mòbil. VERSION i SHELL els escriu tools/stamp.py.
const VERSION = '05bbe52e4b';
const SHELL = ['./', 'index.html', 'app.webmanifest', 'app/icon-192.png', 'app/icon-180.png', 'app/favicon-48.png', 'css/app.css?v=20aec47e95', 'config.js?v=666ce52d45', 'js/00-errors.js?v=466e708bfe', 'js/01-base.js?v=2219651dfa', 'js/02-dades.js?v=8f26f183a2', 'js/02b-arxiu.js?v=349bb1b73e', 'js/02c-fitxes-privades.js?v=1b82d1d8f8', 'js/03b-rols.js?v=fe21de0738', 'js/03-pantalla.js?v=4598f51ea5', 'js/04-llista.js?v=4971201d74', 'js/04b-en-funcions.js?v=d0e45d55ae', 'js/05-calendari.js?v=e2c40de0be', 'js/06-estadistiques.js?v=f3a6c4b23d', 'js/07-gestio.js?v=7053f8eb6f', 'js/08-tauler.js?v=daec3ccfc5', 'js/08b-bandes.js?v=f541c28bf6', 'js/08c-nit-bandes.js?v=87698d871b', 'js/08d-bandes-equip.js?v=51f3fcbfe9', 'js/08e-bandes-resultats.js?v=2f349015a9', 'js/09-classes.js?v=9f1c3edd01', 'js/09b-classes-horari.js?v=04dcfc9066', 'js/09c-classes-fitxes.js?v=2b82e9fb6c', 'js/10-inici.js?v=b8fbfa3cbd', 'js/11-fitxes.js?v=c68569a309', 'js/11b-produccio.js?v=ec12baedc7', 'js/11c-absencia.js?v=cce4eb5995', 'js/12-persones.js?v=bf6abf9043', 'js/12c-entrar.js?v=dae63f5462', 'js/13-avisos-mobil.js?v=06a5542776', 'js/14-eines.js?v=908413dd3f', 'js/14b-manual.js?v=885f1d3fdc', 'js/14c-tauler-fitxes.js?v=caf2820a81', 'js/15-copies.js?v=bd681f779e', 'js/16-agrupacions.js?v=e0dae5e2da', 'js/17-rutes.js?v=cc8860cce4', 'js/18-repertori.js?v=670b02a50e', 'js/18b-arxiu.js?v=74e1bf6e8f', 'js/18c-arxiu-material.js?v=b1e5ab60c6', 'js/19-concerts.js?v=27f146761e', 'js/20-sortides.js?v=0ffdc2475f', 'js/20b-vestidor.js?v=ac4eee1bb7', 'js/21-missatges.js?v=5083d39e84', 'js/21b-converses.js?v=fc14e37f99', 'js/22-secretaria.js?v=e0d396a0d1', 'js/22b-tries.js?v=63dce354e5', 'js/22c-privacitat.js?v=316a114380', 'js/23-accions.js?v=ea791c793d', 'js/24-arrencada.js?v=5c779eb5bc'];
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
