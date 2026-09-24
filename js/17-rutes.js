// A Tempo · 17-rutes.js — Cada pantalla té la seva adreça (#/inici, #/assistencia/estadistiques, #/gestio/personal…).
// Així el botó «enrere» del mòbil torna a la pantalla d'abans (i tanca la finestra que hi hagi oberta) en lloc de
// sortir de l'app, i es poden obrir pantalles concretes des d'un enllaç o d'un avís.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

const ROUTE_MANAGE = { avisos: 'avisos', personal: 'personal', produccions: 'produccions', config: 'ajustos' };
const ROUTE_BOARD = ['anuncis', 'materials', 'documents', 'enquestes'];
const HIST = { sheet: false, closePending: false, ignorePop: 0, pending: null, started: false };

/** Una clau curta i estable per a cada professor/a: la de la fitxa, o una suma del correu (el correu no va a l'adreça). */
function teacherSlug(key) {
  if (!String(key || '').includes('@')) return String(key || '');
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'c' + h.toString(36);
}
/** La ruta de la pantalla que es veu ara. */
function routeFromUi() {
  switch (ui.tab) {
    case 'avisos': return 'inici';
    case 'gestio': return `gestio/${ROUTE_MANAGE[ui.manage] || 'personal'}`;
    case 'stats': return 'assistencia/estadistiques';
    case 'llista':
      if (ui.att === 'stats') return 'assistencia/estadistiques';
      if (ui.att === 'risk') return 'assistencia/risc';
      return ui.rollSec ? `assistencia/${encodeURIComponent(ui.rollSec)}` : 'assistencia';
    case 'calendari': return 'calendari';
    case 'tauler': return `tauler/${ROUTE_BOARD.includes(ui.board) ? ui.board : 'anuncis'}`;
    case 'classes': return ui.clWho ? `classes/${encodeURIComponent(teacherSlug(ui.clWho))}` : 'classes';
    default: return 'inici';
  }
}
const hashRoute = () => decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).replace(/\/+$/, '');
/** Posa la interfície a la pantalla de la ruta. Torna false si la ruta no es reconeix (llavors no es toca res). */
function applyRoute(route) {
  const [a, b] = String(route || '').split('/');
  const sub = b ? decodeURIComponent(b) : '';
  if (a === 'inici') { ui.tab = 'avisos'; return true; }
  if (a === 'gestio') {
    if (!canEdit()) return false;
    const k = Object.keys(ROUTE_MANAGE).find(x => ROUTE_MANAGE[x] === sub) || 'personal';
    ui.tab = 'gestio'; ui.manage = k; return true;
  }
  if (a === 'assistencia') {
    ui.tab = 'llista';
    if (sub === 'estadistiques') { ui.att = 'stats'; ui.rollSec = null; }
    else if (sub === 'risc') { ui.att = 'risk'; ui.rollSec = null; }
    else { ui.att = 'llista'; ui.rollSec = sub && SEC_MAP[sub] ? (ui.section = sub) : null; }
    return true;
  }
  if (a === 'calendari') { ui.tab = 'calendari'; return true; }
  if (a === 'tauler') { ui.tab = 'tauler'; ui.board = ROUTE_BOARD.includes(sub) ? sub : 'anuncis'; return true; }
  if (a === 'classes') {
    ui.tab = 'classes';
    const t = sub && typeof classTeachers === 'function' ? classTeachers().find(x => teacherSlug(x.key) === sub) : null;
    if (!t || t.key !== ui.clWho) { ui.clMonth = null; ui.clDay = null; }
    ui.clWho = t ? t.key : null;
    return true;
  }
  return false;
}
const routeUrl = r => `${location.pathname}${location.search}#/${r}`;
/** Després de pintar: si la pantalla ha canviat, s'afegeix una entrada a l'historial del navegador. */
function syncRoute() {
  if (S.mode !== 'shared' || !S.ready) return;
  if (!HIST.started) {
    // La primera pantalla: la de l'enllaç (si n'hi ha) o la d'ara, sense afegir cap entrada.
    HIST.started = true;
    const want = HIST.pending;
    HIST.pending = null;
    const moved = !!want && want !== routeFromUi() && applyRoute(want);
    history.replaceState({ r: routeFromUi() }, '', routeUrl(routeFromUi()));
    if (moved) render();
    return;
  }
  if (HIST.sheet || HIST.closePending) return;
  const r = routeFromUi();
  if (r !== hashRoute()) history.pushState({ r }, '', routeUrl(r));
}
/** S'ha obert una finestra: una entrada a l'historial perquè «enrere» la tanqui. Només si l'ha obert la persona:
 *  una finestra que s'obre sola (la benvinguda) no afegeix passos, com demanen els navegadors. */
function routeSheetOpened() {
  if (S.mode !== 'shared' || !HIST.started) return;
  if (HIST.closePending) { HIST.closePending = false; return; }   // una finestra en substitueix una altra
  if (navigator.userActivation && !navigator.userActivation.isActive) return;
  if (!HIST.sheet) { history.pushState({ r: routeFromUi(), sheet: 1 }, '', routeUrl(routeFromUi())); HIST.sheet = true; }
}
/** S'ha tancat una finestra des de l'app: es treu la seva entrada (o es fa servir per a la pantalla nova). */
function routeSheetClosed() {
  if (!HIST.sheet) return;
  HIST.closePending = true;
  setTimeout(() => {
    if (!HIST.closePending) return;
    HIST.closePending = false; HIST.sheet = false;
    const r = routeFromUi();
    if (r !== hashRoute()) history.replaceState({ r }, '', routeUrl(r));
    else { HIST.ignorePop++; history.back(); }
  }, 0);
}
HIST.pending = hashRoute() || null;   // la pantalla que demana l'enllaç amb què s'obre l'app
window.addEventListener('popstate', () => {
  if (HIST.ignorePop) { HIST.ignorePop--; return; }
  if (S.mode !== 'shared' || !S.ready) return;
  // «enrere» tanca la finestra; si la finestra no tenia pas propi (s'havia obert sola), també es torna enrere.
  const own = HIST.sheet;
  if (sheetClose) { HIST.sheet = false; HIST.closePending = false; closeSheet(); if (own) return; }
  if (applyRoute(hashRoute())) { saveUI(); render(); window.scrollTo({ top: 0 }); }
});
