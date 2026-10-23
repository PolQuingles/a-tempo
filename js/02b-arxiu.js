// A Tempo · 02b-arxiu.js — L'arxiu de l'assistència: els trossos de temporada acabats, en un sol document cadascun (menys lectures).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Arxiu de l'assistència per trimestres ---------- */
// Cada llista és un document (una sessió × una corda): a final de temporada en són uns 400, i cada mòbil que obre l'app
// després d'una setmana els tornaria a llegir tots. Per això, quan un tros de temporada fa dues setmanes que s'ha acabat,
// algú de l'equip en desa totes les llistes en un sol document, attArchive/<del>_<al>, i config/main.attArchive.cut passa
// a ser l'últim dia arxivat. A partir d'aquí, els mòbils llegeixen cada tros arxivat d'una sola lectura i, de les llistes,
// només les posteriors (camp `date`). Les llistes arxivades no s'esborren: la còpia diària i els avisos les segueixen tenint.
// Els trossos són fixos i seguits (gener–març, abril–juliol, agost–desembre), perquè no en quedi cap dia fora.
const ARCH = { docs: new Map(), by: new Map(), watch: null, ids: '', busy: false };
const ARCH_GRACE = 14 * 864e5;
const ARCH_MAX = 850 * 1024;   // un document de Firestore no pot passar d'1 MB
const archCut = () => (S.config.attArchive && S.config.attArchive.cut) || '';
/** El tros de l'any on cau una data: { id, from, to }. */
function archSegment(date) {
  const y = date.slice(0, 4), m = +date.slice(5, 7);
  const [from, to] = m <= 3 ? [`${y}-01-01`, `${y}-03-31`] : m <= 7 ? [`${y}-04-01`, `${y}-07-31`] : [`${y}-08-01`, `${y}-12-31`];
  return { id: `${from}_${to}`, from, to };
}
const nextSegment = g => archSegment(isoDate(new Date(parseISO(g.to).getTime() + 864e5)));
/** L'arxiu que guarda una data (si ja s'ha arxivat). */
const archiveOf = date => { const g = archSegment(date); return ARCH.by.has(g.id) ? g : null; };
/** Els trossos que ja es poden arxivar, per ordre: des del primer que no ho està fins al que fa dues setmanes que ha acabat. */
function archivable(dates, cut, today = TODAY) {
  const first = dates.filter(Boolean).sort()[0];
  if (!first) return [];
  const limit = isoDate(new Date(parseISO(today).getTime() - ARCH_GRACE));
  const out = [];
  let g = cut ? nextSegment(archSegment(cut)) : archSegment(first);
  while (g.to <= limit) { out.push(g); g = nextSegment(g); }
  return out;
}
/** Les llistes d'un tros, tal com es desen a l'arxiu. */
function archiveDocs(g, docs, dateOf) {
  const out = {};
  for (const [key, d] of docs) {
    const date = dateOf(d) || d.date;
    if (date && date >= g.from && date <= g.to) out[key] = { ...d, date };
  }
  return out;
}
/** Es llegeixen els arxius (un document per tros) només si n'hi ha. */
function watchArchive() {
  const ids = ((S.config.attArchive && S.config.attArchive.ids) || []).join(',');
  if (ids === ARCH.ids || !db) return;
  ARCH.ids = ids;
  if (ARCH.watch) { ARCH.watch(); ARCH.watch = null; }
  if (!ids) { ARCH.docs = new Map(); ARCH.by = new Map(); return; }
  ARCH.watch = db.collection('attArchive').onSnapshot(snap => {
    ARCH.by = new Map(snap.docs.map(d => [d.id, d.data()]));
    ARCH.docs = new Map([...ARCH.by.values()].sort((a, b) => (a.from || '').localeCompare(b.from || '')).flatMap(a => Object.entries(a.docs || {})));
    if (S.ready) scheduleRender();
  }, () => {});
}
/** Qui edita i té totes les llistes (acabades de llegir senceres del servidor) arxiva els trossos que toquen. Abans, a
 *  qualsevol llista que encara no porti la data (desada per una versió antiga de l'app) se li posa, perquè es pugui llegir. */
async function archiveTerms() {
  // Arxiva qui llegeix les llistes de tot el cor (un cap de corda només té les de la seva corda).
  if (S.role !== 'edit' || attScopeSec() || PREVIEW || ARCH.busy) return;
  const dateOf = d => sessionById(d.sessionId)?.date;
  for (const [key, d] of S.attendance) { const date = dateOf(d); if (!d.date && date && date > archCut() && archCut() && !isDirty(`attendance/${key}`)) persist('attendance', key, { ...d, date }, 30); }
  if (SYNC.mode.attendance !== 'full' || SYNC.got.attendance == null || pendingWrites()) return;
  const all = allSessions();
  const todo = archivable(all.map(s => s.date), archCut());
  if (!todo.length) return;
  ARCH.busy = true;
  try {
    const cfg = { ...(S.config.attArchive || {}), ids: [...((S.config.attArchive || {}).ids || [])] };
    for (const g of todo) {
      const docs = archiveDocs(g, S.attendance, dateOf);
      if (JSON.stringify(docs).length > ARCH_MAX) break;   // massa gran per a un sol document: es queda com està
      await db.doc(`attArchive/${g.id}`).set({ from: g.from, to: g.to, docs, n: Object.keys(docs).length, builtAt: new Date().toISOString(), by: S.email || '' });
      cfg.ids = [...new Set([...cfg.ids, g.id])]; cfg.cut = g.to;
    }
    if (cfg.cut && cfg.cut !== archCut()) {
      // Les llistes de després que encara no porten la data (desades per una versió antiga de l'app) la necessiten per sortir.
      for (const [key, d] of S.attendance) { const date = dateOf(d); if (!d.date && date && date > cfg.cut) persist('attendance', key, { ...d, date }, 30); }
      saveConfig({ attArchive: cfg });
    }
  } catch { /* es tornarà a provar el pròxim cop */ }
  ARCH.busy = false;
}
