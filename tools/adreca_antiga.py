"""L'adreça antiga de l'app (GitHub Pages, polquingles.github.io/a-tempo/), ara que l'app és a Firebase Hosting.

    python3 tools/adreca_antiga.py dist dist-pages

A partir de l'app publicada (dist/) fa el que GitHub Pages ha de servir:
  · una pàgina que porta a l'adreça nova amb el mateix camí, la mateixa agrupació (?a=…) i la mateixa pantalla (#/…):
    index.html i 404.html (que GitHub Pages serveix per a qualsevol adreça que no existeix);
  · un treballador de servei (sw.js) que substitueix el de l'app: esborra l'app desada al mòbil, perquè s'obri aquesta
    pàgina, i continua mostrant els avisos dels mòbils que els tenen activats aquí (en tocar-los, s'obre l'adreça nova);
  · les icones que fan servir aquests avisos (app/ i marca/);
  · els calendaris generals i els de classes d'abans, perquè les subscripcions fetes amb l'adreça antiga continuïn
    funcionant. Els calendaris personals no: només són a l'adreça nova.
"""
import html, json, os, shutil, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "dist"
OUT = sys.argv[2] if len(sys.argv) > 2 else "dist-pages"
NEW = (os.environ.get("APP_URL") or "https://cor-present.web.app/").rstrip("/") + "/"
HOST = NEW.split("//", 1)[1].rstrip("/")

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
for sub in ["app", "marca"]:
    if os.path.isdir(os.path.join(SRC, sub)):
        shutil.copytree(os.path.join(SRC, sub), os.path.join(OUT, sub))
if os.path.exists(os.path.join(SRC, "calendari.ics")):
    shutil.copy(os.path.join(SRC, "calendari.ics"), OUT)
for sub in ["calendaris", "calendaris/classes"]:
    folder = os.path.join(SRC, sub)
    if not os.path.isdir(folder):
        continue
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    for f in os.listdir(folder):
        if f.endswith(".ics"):
            shutil.copy(os.path.join(folder, f), os.path.join(OUT, sub, f))

PAGE = """<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="8; url=__NEW__">
<title>A Tempo té una adreça nova</title>
<link rel="icon" href="/a-tempo/app/favicon-48.png">
<script>
  // El mateix camí, la mateixa agrupació (?a=…) i la mateixa pantalla (#/…), a l'adreça nova. canvi=1: l'app hi diu que cal
  // tornar a entrar. Amb l'app a la pantalla d'inici, no s'hi salta: primer s'explica com tornar-la a afegir.
  var to = __NEWJS__ + location.pathname.replace(/^\\/a-tempo\\/?/, '') + (location.search ? location.search + '&' : '?') + 'canvi=1' + location.hash;
  var installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!installed) location.replace(to);
</script>
<style>
  :root { color-scheme: light dark; --bg: #f7f4fa; --ink: #241a2e; --muted: #6b5f75; --accent: #5a3577; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17121c; --ink: #f1ebf6; --muted: #b3a7bd; --accent: #c9a4e6; --card: #221a29; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 30rem; margin: 12vh auto 0; padding: 24px 16px; }
  .card { background: var(--card); border-radius: 18px; padding: 24px; }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 .6em; text-wrap: balance; }
  p { margin: 0 0 1em; color: var(--muted); }
  b { color: var(--ink); }
  a.btn { display: inline-block; background: var(--accent); color: var(--bg); text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 12px; }
  a.btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
</style>
</head>
<body>
<main><div class="card">
  <h1>A Tempo té una adreça nova</h1>
  <p>Ara és a <b>__HOST__</b>. Hi hauràs d'entrar un altre cop amb el teu correu i, si tenies les notificacions activades, tornar-les a activar.</p>
  <p>Si la tens a la pantalla d'inici, obre-la des de l'adreça nova i torna-la a afegir; després pots treure aquesta icona.</p>
  <a class="btn" id="go" href="__NEW__">Obre A Tempo</a>
</div></main>
<script>document.getElementById('go').href = to;</script>
</body>
</html>
"""
page = PAGE.replace("__NEWJS__", json.dumps(NEW)).replace("__NEW__", html.escape(NEW)).replace("__HOST__", html.escape(HOST))
for name in ["index.html", "404.html"]:
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(page)

SW = """// A Tempo · adreça antiga (GitHub Pages). L'app ara és a __NEW__: aquest treballador de servei substitueix el de l'app.
// Esborra el que hi havia desat al mòbil (perquè s'obri la pàgina que porta a l'adreça nova) i continua mostrant els avisos
// dels mòbils que encara els tenen activats aquí, fins que els tornin a activar a l'adreça nova. En tocar-los, s'obre la nova.
const NEW = __NEWJS__;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'A Tempo', {
    body: d.body || '', icon: d.icon ? `./${d.icon}` : './app/icon-192.png', badge: './app/icon-192.png', lang: 'ca',
    tag: d.tag || 'a-tempo', renotify: true, actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    data: { url: d.url || NEW, sid: d.sid || '' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = new URL(data.url || NEW, NEW);
  if (e.action && data.sid) { url.searchParams.set('accio', e.action); url.searchParams.set('s', data.sid); }
  e.waitUntil(self.clients.openWindow(url.href));
});
"""
with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as f:
    f.write(SW.replace("__NEWJS__", json.dumps(NEW)).replace("__NEW__", NEW))
open(os.path.join(OUT, ".nojekyll"), "w").close()
n = sum(len(fs) for _, _, fs in os.walk(OUT))
print(f"{OUT}/: la pàgina que porta a {NEW}, el treballador de servei dels avisos i {n} fitxers en total")
