// A Tempo · 00-errors.js — Si l'app falla al mòbil d'algú, se'n desa una nota breu a Firestore (col·lecció «errors»):
// què ha passat, on, a quina pantalla i amb quina versió. No hi va cap nom ni cap correu. La vigilància automàtica
// (.github/workflows/vigilancia.yml) les llegeix cada hora i avisa l'administració. Va el primer de tots els
// fitxers per poder captar també els errors en carregar els altres.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

const FAILURES = { queue: [], sent: 0, seen: new Set(), max: 5 };
const appVersion = () => document.querySelector('meta[name="app-version"]')?.content || 'dev';
/** Apunta un error (com a molt cinc per sessió, i cada missatge un sol cop). */
function noteFailure(kind, message, where) {
  try {
    const msg = String(message || '').slice(0, 300);
    if (!msg || FAILURES.seen.has(kind + msg) || FAILURES.sent + FAILURES.queue.length >= FAILURES.max) return;
    FAILURES.seen.add(kind + msg);
    FAILURES.queue.push({ kind, msg, where: String(where || '').slice(0, 300), at: new Date().toISOString() });
    setTimeout(flushFailures, 1000);
  } catch {}
}
/** Envia el que hi hagi pendent, si ja hi ha connexió amb Firestore i una sessió oberta. */
function flushFailures() {
  try {
    if (!FAILURES.queue.length || typeof fs === 'undefined' || !fs || !window.firebase?.auth?.().currentUser) return;
    const route = typeof routeFromUi === 'function' ? (() => { try { return routeFromUi(); } catch { return ''; } })() : '';
    for (const x of FAILURES.queue.splice(0)) {
      FAILURES.sent++;
      fs.collection('errors').add({
        ...x, app: appVersion().slice(0, 40), gid: (typeof GID === 'string' && GID) || '', route: route.slice(0, 60),
        ua: navigator.userAgent.slice(0, 200), online: navigator.onLine,
      }).catch(() => {});
    }
  } catch {}
}
window.addEventListener('error', e => {
  if (!e || !e.message) return;   // un recurs que no carrega (una imatge…) no és un error de l'app
  noteFailure('error', e.message, `${String(e.filename || '').split('/').pop().split('?')[0]}:${e.lineno || 0}:${e.colno || 0}`);
});
/* Un error conegut de Safari (WebKit): si l'iPhone posa l'app en segon pla mentre Firestore llegeix la còpia desada al
 * mòbil (IndexedDB), en tornar-hi aquesta còpia ja no respon («Attempt to get records from database without an in-progress
 * transaction») i les dades poden quedar aturades. No ho arregla cap versió de Firebase: el que funciona és tornar a obrir
 * l'app. Es fa sol, un cop cada deu minuts com a molt, i només si no hi ha res a mitges (una finestra oberta o canvis per
 * desar). La nota d'error es desa igualment, marcada, i la vigilància no n'avisa. */
const IDB_LOST = /without an in-progress transaction|database connection is closing/i;
const LS_IDB = 'atempo:idb-recarrega';
function recoverStorage() {
  try {
    const last = +(sessionStorage.getItem(LS_IDB) || 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    const busy = () => { try { return !!sheetClose || pendingWrites() > 0; } catch { return false; } };
    const go = () => { try { sessionStorage.setItem(LS_IDB, String(Date.now())); } catch {} flushFailures(); setTimeout(() => location.reload(), 800); };
    if (!busy()) { go(); return; }
    let tries = 0;
    const t = setInterval(() => { if (!busy()) { clearInterval(t); go(); } else if (++tries >= 30) clearInterval(t); }, 2000);
  } catch {}
}
window.addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  if (r && (r.code === 'permission-denied' || r.code === 'unavailable' || r.name === 'AbortError')) return;   // sense permís o sense xarxa: no és una fallada de l'app
  if (IDB_LOST.test(String((r && r.message) || r || ''))) { noteFailure('promesa', r.message || String(r), 'safari-idb · l’app es torna a obrir'); recoverStorage(); return; }
  noteFailure('promesa', (r && (r.message || r.code)) || String(r), r && r.stack ? String(r.stack).split('\n').slice(0, 3).join(' ← ') : '');
});
window.addEventListener('online', () => setTimeout(flushFailures, 2000));
