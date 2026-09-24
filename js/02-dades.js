// A Tempo · 02-dades.js — Connexió amb Firebase i sincronització, dades derivades, temporada, norma i canvis a les dades.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Persistence (Firebase) ================= */
// Everyone signs in with Google; the account's groups are listed in staffIndex/<email>/agrupacions.
// Nobody gets in without an account: old links (#k=…) only show a message asking to sign in.
const LS_KEY = 'atempo:clau';       // l'enllaç antic desat al mòbil (només per esborrar-lo)
const LS_LINK = 'atempo:enllac';    // la fitxa d'accés de cada agrupació, per obrir l'app sense connexió
const LS_ME = 'atempo:jo';
const ROLE_NAME = { edit: 'Edició', read: 'Només lectura' };
let db = null, fs = null, auth = null, LINK = null;   // LINK = { choirId, role, email, memberId }: l'accés a l'agrupació oberta
const queue = new Map();   // path -> { data | null, timer }  (debounce window)
let inflight = 0;

const SECRET_RE = /^[A-Za-z0-9_-]{24,64}$/;
/** An old access link (in the address or saved on this device): forget it and say whether there was one. */
function dropOldLink() {
  let saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch {}
  const inUrl = /k=[A-Za-z0-9_-]{24,64}/.test(location.hash);
  forgetLink();
  if (inUrl) history.replaceState(null, '', location.pathname + location.search);
  return inUrl || !!(saved && SECRET_RE.test(saved));
}
function forgetLink() { try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_LINK); } catch {} }
function newKey() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isDirty = path => queue.has(path);

/** Write one document (data) or delete it (null). Local state must already be updated. */
function persist(col, id, data, delay = 350) {
  if (PREVIEW) { previewBlocked(); return; }
  const path = `${col}/${id}`;
  if (data === null && EPOCH_ON_DELETE.includes(col)) bumpSoon(col);
  const q = queue.get(path) || {};
  clearTimeout(q.timer);
  q.data = data === null ? null : clone(data);
  q.timer = setTimeout(() => flush(path), delay);
  queue.set(path, q);
  updateSync();
}
function flush(path) {
  const q = queue.get(path);
  if (!q || !db) return;
  queue.delete(path);
  inflight++;
  updateSync();
  // Firestore applies the write to its local cache at once (works offline) and syncs when there is signal.
  const p = q.data === null ? db.doc(path).delete() : db.doc(path).set(stamped(path, q.data));
  p.then(() => { S.syncErr = false; })
   .catch(writeFailed)
   .finally(() => { inflight--; updateSync(); });
}
function flushAll() { for (const path of [...queue.keys()]) { clearTimeout(queue.get(path).timer); flush(path); } }
function writeFailed(e) {
  const code = e && e.code;
  if (code === 'permission-denied') { S.error = 'No tens permís per desar aquest canvi. Potser l’enllaç s’ha renovat: demana’n el nou.'; renderBanner(); }
  else if (code === 'resource-exhausted') toast('S’ha arribat al límit diari de la base de dades. Torna-ho a provar demà.');
  else toast('Un canvi no s’ha pogut desar. Torna-ho a provar.');
  S.syncErr = true; updateSync();
}
const pendingWrites = () => queue.size + inflight;

function updateSync() {
  const el = $('#sync');
  let state = 'ok', text = 'Sincronitzat';
  if (S.mode === 'loading') { state = 'loading'; text = 'Connectant…'; }
  else if (S.mode !== 'shared') { state = 'local'; text = 'Sense agrupació'; }
  else if (!navigator.onLine) { state = 'local'; text = pendingWrites() ? 'Sense connexió · pendent' : 'Sense connexió'; }
  else if (pendingWrites()) { state = 'saving'; text = 'Desant…'; }
  else if (S.syncErr) { state = 'error'; text = 'Error en desar'; }
  else if (S.role && S.role !== 'edit') { state = 'ok'; text = ROLE_NAME[S.role]; }
  el.dataset.state = state;
  el.lastElementChild.textContent = text;
}
window.addEventListener('online', updateSync);
window.addEventListener('offline', updateSync);
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

/* ---------- Lectures: només el que ha canviat ---------- */
// El pla gratuït de Firebase dona 50.000 lectures al dia per a totes les agrupacions juntes, i cada document que
// arriba del servidor en compta una. La plantilla, les produccions, les llistes i les classes creixen tota la temporada
// i les llegeix tothom cada cop que obre l'app: a final de curs serien unes 500 lectures per obertura. Per això:
//  · cada canvi hi deixa `syncAt`, l'hora del servidor (stamped);
//  · el mòbil guarda el que ja té (la memòria de Firestore) i, en obrir l'app, només demana el que ha canviat des del
//    darrer canvi que ja coneix;
//  · qui esborra una fitxa o una producció canvia `config/main.syncEpoch`, i aleshores tothom torna a baixar aquella
//    col·lecció sencera. Un dia de classe esborrat queda com a `deleted: true` (el professorat no toca la configuració);
//    una llista d'una sessió esborrada no cal treure-la, perquè ja no es mostra enlloc;
//  · la primera vegada, un cop per setmana i si el mòbil no té res desat, es baixa tot sencer.
const DELTA = ['members', 'productions', 'attendance', 'classes', 'works', 'announcements', 'polls', 'trips', 'rsvp', 'pollVotes'];
// En aquestes, esborrar un document fa que els altres mòbils les tornin a baixar senceres (vegeu bumpEpoch). Només
// n'esborra l'equip, que pot canviar la configuració. Les llistes (attendance) no cal: una d'esborrada ja no es mostra.
const EPOCH_ON_DELETE = ['announcements', 'polls', 'trips', 'rsvp', 'pollVotes'];
// Fins aquest dia tothom ho baixa tot, perquè els mòbils que encara tenen oberta l'app d'abans (sense syncAt) s'actualitzin.
const DELTA_FROM = '2026-09-28';
const FULL_EVERY = 7 * 864e5;
const LS_SYNC = 'atempo:sync';
const BIG = new Map();   // col -> { query, err, done }
const SYNC = { st: {}, unsub: {}, mode: {}, got: {}, mine: new Map(), started: false };
const deltaOn = () => { const f = lsGet('atempo:delta'); return f === '1' || (f !== '0' && TODAY >= (window.COR_DELTA_FROM || DELTA_FROM)); };
function syncLoad() { try { SYNC.st = JSON.parse(localStorage.getItem(`${LS_SYNC}:${GID}`) || '{}') || {}; } catch { SYNC.st = {}; } }
function syncSave() { try { localStorage.setItem(`${LS_SYNC}:${GID}`, JSON.stringify(SYNC.st)); } catch {} }
const epochOf = col => { const e = S.config.syncEpoch || {}; return `${e.all || ''}|${e[col] || ''}${col === 'attendance' ? `|${archCut()}` : ''}`; };
/** Les dades que es desen: a les col·leccions grans, amb l'hora del servidor. */
const stamped = (path, data) => {
  if (!DELTA.includes(path.split('/')[0])) return data;
  SYNC.mine.set(path, Date.now());
  return { ...data, syncAt: firebase.firestore.FieldValue.serverTimestamp() };
};
/** Algú ha esborrat fitxes o produccions: la resta de mòbils ho tornaran a baixar tot (aquest ja ho té al dia). */
function bumpEpoch(...cols) {
  const e = { ...(S.config.syncEpoch || {}) };
  for (const c of cols) e[c] = newKey().slice(0, 10);
  saveConfig({ syncEpoch: e });
  for (const c of cols) if (c !== 'all' && SYNC.st[c]) SYNC.st[c].epoch = epochOf(c);
  if (cols.includes('all')) for (const c of DELTA) if (SYNC.st[c]) SYNC.st[c].epoch = epochOf(c);
  syncSave();
}
/** Diverses supressions seguides (una enquesta i els seus vots): un sol canvi de configuració. */
const bumpWait = new Set();
function bumpSoon(col) {
  if (!canEdit() || bumpWait.has(col)) return;
  bumpWait.add(col);
  setTimeout(() => { const cols = [...bumpWait]; bumpWait.clear(); bumpEpoch(...cols); }, 400);
}
const syncMillis = d => { const t = d.get('syncAt'); return t && typeof t.toMillis === 'function' ? t.toMillis() : 0; };
/** Un document que arriba: es desa sense syncAt; els dies de classe esborrats o ja passats no hi entren. */
function take(col, map, d) {
  const path = `${col}/${d.id}`;
  if (isDirty(path)) { if (S[col].has(d.id)) map.set(d.id, S[col].get(d.id)); return; }
  const { syncAt, ...data } = d.data();
  if (col === 'classes' && (data.deleted || (data.date || '') < CLASS_FROM)) { map.delete(d.id); return; }
  map.set(d.id, data);
}
/** Una col·lecció gran: sencera o només el que ha canviat (vegeu a dalt). */
function syncCol(col) {
  const def = BIG.get(col);
  if (SYNC.unsub[col]) SYNC.unsub[col]();
  const st = SYNC.st[col] = SYNC.st[col] || {};
  let un = null, stop = false;
  SYNC.unsub[col] = () => { stop = true; if (un) un(); };
  if (col === 'attendance') SYNC.cut = archCut();
  const full = !deltaOn() || !st.full || !st.max || Date.now() - st.full > FULL_EVERY || (st.epoch || '') !== epochOf(col);
  SYNC.mode[col] = full ? 'full' : 'delta';
  if (full) {
    const startedAt = Date.now(), epoch = epochOf(col);
    // includeMetadataChanges: si el que hi ha desat ja és igual que el servidor, només així se sap que la resposta ha arribat.
    un = def.query().onSnapshot({ includeMetadataChanges: true }, snap => {
      const next = new Map();
      for (const d of snap.docs) take(col, next, d);
      for (const [id, v] of S[col]) if (!next.has(id) && isDirty(`${col}/${id}`) && queue.get(`${col}/${id}`)?.data !== null) next.set(id, v);
      S[col] = next;
      if (!snap.metadata.fromCache) {
        if (SYNC.got[col] == null) SYNC.got[col] = snap.size;
        st.full = startedAt; st.epoch = epoch;
        // Com a mínim 1: si encara cap document no porta syncAt, la pròxima vegada es demanen tots els que en portin.
        st.max = Math.max(st.max || 0, 1, ...snap.docs.map(syncMillis));
        syncSave();
      }
      def.done();
    }, def.err);
    return;
  }
  (async () => {
    let cached = null;
    try { cached = await def.query().get({ source: 'cache' }); } catch {}
    if (stop) return;
    // Res desat en aquest mòbil (o el navegador ho ha buidat): tot sencer.
    if (!cached || cached.empty) { st.full = 0; return syncCol(col); }
    const next = new Map();
    for (const d of cached.docs) take(col, next, d);
    S[col] = next;
    const since = firebase.firestore.Timestamp.fromMillis(st.max);
    un = db.collection(col).where('syncAt', '>', since).onSnapshot({ includeMetadataChanges: true }, snap => {
      for (const ch of snap.docChanges()) {
        // Ja no hi surt: o s'ha esborrat o l'ha desat una app antiga sense syncAt. Es mira quin dels dos. Si l'acabem de desar
        // nosaltres, és només l'instant en què l'hora del servidor encara no hi és: torna a sortir quan el servidor respon.
        if (ch.type === 'removed' && Date.now() - (SYNC.mine.get(`${col}/${ch.doc.id}`) || 0) < 120000) continue;
        if (ch.type === 'removed') { ch.doc.ref.get().then(d => { if (d.exists) take(col, S[col], d); else if (!isDirty(`${col}/${d.id}`)) S[col].delete(d.id); scheduleRender(); }).catch(() => {}); continue; }
        take(col, S[col], ch.doc);
      }
      if (!snap.metadata.fromCache) {
        if (SYNC.got[col] == null) SYNC.got[col] = snap.size;
        st.max = Math.max(st.max || 0, ...snap.docs.map(syncMillis));
        syncSave();
      }
      def.done();
    }, () => { st.full = 0; syncCol(col); });
  })();
}
/** La configuració ha canviat: si algú ha esborrat res d'una col·lecció que es llegeix a trossos, es torna a baixar sencera. */
function checkEpochs() {
  let save = false;
  for (const col of BIG.keys()) {
    const st = SYNC.st[col];
    if (!st || (st.epoch || '') === epochOf(col)) continue;
    // Amb un trimestre nou arxivat, la consulta de les llistes canvia (només les posteriors): cal refer-la.
    if (SYNC.mode[col] === 'delta' || (col === 'attendance' && SYNC.cut !== archCut())) syncCol(col);
    else if (st.full) { st.epoch = epochOf(col); save = true; }
  }
  if (save) syncSave();
}

/** Un document que arriba d'una consulta normal (no de les grans): el que s'està desant en aquest mòbil té preferència. */
function takeSnap(col, snap) {
  const next = new Map();
  for (const d of snap.docs) {
    const path = `${col}/${d.id}`;
    if (isDirty(path)) { if (S[col].has(d.id)) next.set(d.id, S[col].get(d.id)); }
    else next.set(d.id, d.data());
  }
  for (const [id, v] of S[col]) if (!next.has(id) && isDirty(`${col}/${id}`) && queue.get(`${col}/${id}`)?.data !== null) next.set(id, v);
  S[col] = next;
}
function subscribe() {
  const staff = S.role === 'edit';
  // Les notes de classe són privades: només el professorat i l'administració les veuen totes.
  const teachCl = hasRole(S.me, 'voice') || hasRole(S.me, 'admin');
  const teach = staff || hasRole(S.me, 'voice');           // veu tots els avisos de les classes
  // El personal (qui té accés i amb quins rols) només es llegeix quan s'obre Gestió: vegeu ensureStaff.
  const wanted = ['members', 'productions', 'attendance', 'config', 'absences', 'subs', 'rsvp', 'announcements', 'polls', 'pollVotes', 'classes', 'classReq', 'classNotes', 'works', 'trips', 'tripSignups'];
  if (teachCl) wanted.push('classPlan');
  const loaded = new Set();
  const markLoaded = k => { loaded.add(k); if (loaded.size >= wanted.length && !S.ready) { S.ready = true; render(); afterReady(); } };
  const onCol = col => snap => {
    takeSnap(col, snap);
    markLoaded(col);
    if (S.ready) scheduleRender();
  };
  const mine = col => staff ? db.collection(col) : db.collection(col).where('memberId', '==', S.memberId || '-');
  // Les col·leccions grans (vegeu syncCol): la plantilla, les produccions, les llistes, les classes de cant, el repertori,
  // el tauler (anuncis, enquestes i sortides) i, per a l'equip, les respostes a convocatòries i enquestes de tothom.
  // De les classes, només les dues últimes setmanes i el que ve: un curs sencer serien massa lectures. De les llistes,
  // només les dels trimestres que encara no s'han arxivat (vegeu l'arxiu de l'assistència).
  const big = (col, query, err) => BIG.set(col, { query, err: err || (() => markLoaded(col)), done: () => { markLoaded(col); if (S.ready) scheduleRender(); } });
  big('members', () => db.collection('members'), e => { markLoaded('members'); onDbError(e); });
  big('productions', () => db.collection('productions'), e => { markLoaded('productions'); onDbError(e); });
  big('classes', () => db.collection('classes').where('date', '>=', CLASS_FROM));
  big('works', () => db.collection('works'));
  big('attendance', () => archCut() ? db.collection('attendance').where('date', '>', archCut()) : db.collection('attendance'), e => { markLoaded('attendance'); onDbError(e); });
  for (const col of ['announcements', 'polls', 'trips']) big(col, () => db.collection(col));
  if (staff) for (const col of ['rsvp', 'pollVotes']) big(col, () => db.collection(col));
  else for (const col of ['rsvp', 'pollVotes']) mine(col).onSnapshot(onCol(col), () => markLoaded(col));
  // L'horari fix de cada professor/a només el fan servir el professorat i l'administració.
  if (teachCl) db.collection('classPlan').onSnapshot(onCol('classPlan'), () => markLoaded('classPlan'));
  // Les notes de classe són privades: el professorat les veu totes; cada persona, només les seves.
  if (teachCl) db.collection('classNotes').where('date', '>=', CLASS_FROM).onSnapshot(onCol('classNotes'), () => markLoaded('classNotes'));
  else db.collection('classNotes').where('memberId', '==', S.memberId || '-').onSnapshot(onCol('classNotes'), () => markLoaded('classNotes'));
  if (teach) db.collection('classReq').onSnapshot(onCol('classReq'), () => markLoaded('classReq'));
  else {
    const mid = S.memberId || '-';
    let fromMe = new Map(), toMe = new Map(), openOnes = new Map();
    const mergeReq = () => { S.classReq = new Map([...openOnes, ...fromMe, ...toMe]); markLoaded('classReq'); if (S.ready) scheduleRender(); };
    const grab = (q, set) => q.onSnapshot(snap => { set(new Map(snap.docs.map(d => [d.id, d.data()]))); mergeReq(); }, () => markLoaded('classReq'));
    grab(db.collection('classReq').where('memberId', '==', mid), m => { fromMe = m; });
    grab(db.collection('classReq').where('withMemberId', '==', mid), m => { toMe = m; });
    // Els canvis d'hora oberts són una crida a qui pugui: els veu tothom de l'agrupació.
    grab(db.collection('classReq').where('open', '==', true), m => { openOnes = m; });
  }
  mine('tripSignups').onSnapshot(onCol('tripSignups'), () => markLoaded('tripSignups'));
  for (const col of ['absences', 'subs']) mine(col).onSnapshot(onCol(col), e => { markLoaded(col); if (staff) onDbError(e); });
  db.doc('config/main').onSnapshot(snap => {
    if (!isDirty('config/main')) S.config = { name: '', alertFNJ: 3, minAttendance: 80, demo: false, ...(snap.exists ? snap.data() : {}) };
    applyGroupConfig();
    watchArchive();
    // Les col·leccions grans comencen quan ja se sap si algú n'ha esborrat res (syncEpoch).
    if (!SYNC.started) { SYNC.started = true; syncLoad(); for (const col of BIG.keys()) syncCol(col); }
    else checkEpochs();
    markLoaded('config');
    if (S.ready) scheduleRender();
  }, onDbError);
}
/** El personal de l'agrupació (qui té accés i amb quins rols): només quan cal, perquè cada fitxa és una lectura.
 *  Ho demanen Gestió, les classes (professorat amb compte) i les eines que miren qui ja té l'app. */
let staffWatch = null;
function ensureStaff() {
  if (staffWatch || !db || S.role !== 'edit') return;
  staffWatch = db.collection('staff').onSnapshot(snap => {
    takeSnap('staff', snap);
    S.staffReady = true;
    noteTeamRoles();
    if (S.ready) scheduleRender();
  }, () => { S.staffReady = true; });
}
function onDbError(e) {
  const code = e && e.code;
  S.error = code === 'permission-denied'
    ? (S.me ? 'Ja no tens accés a aquesta agrupació. Torna a entrar o parla amb l’administració.' : 'Aquest enllaç ja no dona accés a l’agrupació. Demana l’enllaç nou.')
    : 'S’ha perdut la connexió amb les dades. Recarrega la pàgina.';
  if (!S.ready) { S.ready = true; }
  render();
}

/* ================= Derived data ================= */
function membersOf(sec, includeInactive = false) {
  return [...S.members.values()]
    .filter(m => (!sec || m.section === sec) && (includeInactive || m.active !== false))
    .sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || byName(a, b));
}
/** Pastel hue per production: chosen in its sheet, or assigned by season order. */
const PROD_HUES = [265, 200, 150, 30, 330, 55, 180, 10, 95, 230];
function prodHue(p) {
  if (!p) return PROD_HUES[0];
  if (p.hue != null && p.hue !== '') return +p.hue;
  const i = productionsSorted().findIndex(x => x.id === p.id);
  return PROD_HUES[(i < 0 ? 0 : i) % PROD_HUES.length];
}
function productionsSorted() {
  return [...S.productions.values()].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}
/** A session lives in one production and can also count for others (alsoIn). */
function withProd(s, p) { return { ...s, prodId: p.id, alsoIn: (s.alsoIn || []).filter(id => id !== p.id && S.productions.has(id)) }; }
function allSessions(prodId) {
  const out = [];
  for (const p of S.productions.values()) {
    for (const raw of (p.sessions || [])) {
      const s = withProd(raw, p);
      if (!prodId || prodId === 'all' || p.id === prodId || s.alsoIn.includes(prodId)) out.push(s);
    }
  }
  return out.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
function sessionById(id) {
  for (const p of S.productions.values()) {
    const s = (p.sessions || []).find(x => x.id === id);
    if (s) return withProd(s, p);
  }
  return null;
}
const sessionProds = s => [s.prodId, ...(s.alsoIn || [])];
const prodNames = s => sessionProds(s).map(id => S.productions.get(id)?.name).filter(Boolean).join(' + ');
const attKey = (sid, sec) => `${sid}_${sec}`;
/** La llista d'una sessió i secció: la viva o, si és d'un trimestre arxivat, la de l'arxiu. */
const attDoc = (sid, sec) => S.attendance.get(attKey(sid, sec)) || ARCH.docs.get(attKey(sid, sec));
/** Totes les llistes, les arxivades i les vives (per a les còpies i per mirar tota la història d'algú). */
const allAttendance = () => new Map([...ARCH.docs, ...S.attendance]);
const isExcluded = (prodId, mid) => !!(S.productions.get(prodId)?.excluded || []).includes(mid);
const convoked = (s, sec) => !s.sections || !s.sections.length || s.sections.includes(sec);
const onLeave = (m, date) => (m.leaves || []).find(l => l.from && l.from <= date && (!l.to || l.to >= date));
/** Out of the roll for this session: on leave, or not doing any of its productions. */
const isOut = (s, m) => !!onLeave(m, s.date) || sessionProds(s).every(p => isExcluded(p, m.id));
/** Effective mark. ctxProd: when computing one production's stats, members outside it count as «No fa». */
function effMark(session, member, ctxProd) {
  if (ctxProd && isExcluded(ctxProd, member.id)) return { s: 'NP', auto: true, why: 'prod' };
  const m = attDoc(session.id, member.section)?.marks?.[member.id];
  if (m && m.s) return m;
  const lv = onLeave(member, session.date);
  if (lv) return { s: 'NP', auto: true, why: 'leave', leave: lv };
  if (sessionProds(session).every(p => isExcluded(p, member.id))) return { s: 'NP', auto: true, why: 'prod' };
  return null;
}
const hasData = (s, sec) => { const d = attDoc(s.id, sec); return !!(d && d.marks && Object.keys(d.marks).length); };
function progress(session, sec) {
  const ms = membersOf(sec);
  let done = 0;
  for (const m of ms) if (effMark(session, m)) done++;
  return { done, total: ms.length };
}
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function defaultSession(list) {
  if (!list.length) return null;
  const todays = list.filter(s => s.date === TODAY);
  if (todays.length) {
    const d = new Date(), soon = `${pad(d.getHours() + 1)}:${pad(d.getMinutes())}`;
    return todays.filter(s => (s.time || '00:00') <= soon).pop() || todays[0];
  }
  const past = list.filter(s => s.date < TODAY);
  return past.length ? past[past.length - 1] : list[0];
}
/** Past sessions (or today's, once finished) where this section still has people without a mark. */
function pendingSessions(sec) {
  const hhmm = nowHHMM();
  return allSessions().filter(s => convoked(s, sec)
    && (s.date < TODAY || (s.date === TODAY && (s.end || s.time || '23:59') <= hhmm))
    && (() => { const pr = progress(s, sec); return pr.done < pr.total; })());
}
/** Minutes late if someone arrives right now (only for today's session, once started). */
function lateNow(session) {
  if (!session || session.date !== TODAY || !session.time) return 0;
  const [h, m] = session.time.split(':').map(Number);
  const start = new Date(); start.setHours(h, m, 0, 0);
  const mins = Math.floor((Date.now() - start.getTime()) / 60000);
  return mins > 0 && mins <= 240 ? mins : 0;
}
function currentProductionId() {
  const ps = productionsSorted();
  const now = ps.find(p => p.start <= TODAY && (p.end || '9999') >= TODAY);
  if (now) return now.id;
  const withData = ps.filter(p => allSessions(p.id).some(s => SECTIONS.some(x => hasData(s, x.id))));
  return (withData.pop() || ps[0])?.id || null;
}
const emptyCounts = () => ({ P: 0, R: 0, FJ: 0, FNJ: 0, NP: 0, min: 0 });
const rate = c => { const d = c.P + c.R + c.FJ + c.FNJ; return d ? (c.P + c.R) / d : null; };
const punctuality = c => { const d = c.P + c.R; return d ? c.P / d : null; };

/* ---------- Season and terms ---------- */
function seasonCfg() {
  const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  const season = { name: `Temporada ${y}-${String(y + 1).slice(2)}`, from: `${y}-09-01`, to: `${y + 1}-07-31`, ...(S.config.season || {}) };
  const defTerms = [
    { name: '1r trimestre', from: `${y}-09-01`, to: `${y}-12-31` },
    { name: '2n trimestre', from: `${y + 1}-01-01`, to: `${y + 1}-03-31` },
    { name: '3r trimestre', from: `${y + 1}-04-01`, to: `${y + 1}-07-31` },
  ];
  const terms = defTerms.map((t, i) => ({ ...t, ...((S.config.terms || [])[i] || {}) }));
  return { season, terms };
}
function currentTermIdx() {
  const { terms } = seasonCfg();
  const i = terms.findIndex(t => t.from <= TODAY && t.to >= TODAY);
  return i < 0 ? 0 : i;
}
function currentScope() {
  const { season, terms } = seasonCfg();
  if (ui.statsScope === 'season') return { kind: 'range', from: season.from, to: season.to, name: season.name };
  if (ui.statsScope === 'term') {
    if (ui.statsTerm == null || !terms[ui.statsTerm]) ui.statsTerm = currentTermIdx();
    const t = terms[ui.statsTerm];
    return { kind: 'range', from: t.from, to: t.to, name: t.name };
  }
  if (!ui.statsProd || !S.productions.has(ui.statsProd)) ui.statsProd = currentProductionId();
  const p = S.productions.get(ui.statsProd);
  return p ? { kind: 'prod', id: p.id, name: p.name } : null;
}

function computeStats(scope, secFilter) {
  const base = scope.kind === 'prod' ? allSessions(scope.id) : allSessions().filter(s => s.date >= scope.from && s.date <= scope.to);
  const sessions = base.filter(s => s.date <= TODAY);
  const ctx = scope.kind === 'prod' ? scope.id : null;
  const members = [...S.members.values()].filter(m => !secFilter || m.section === secFilter);
  const per = new Map(members.map(m => [m.id, { m, ...emptyCounts(), hist: [], notes: [] }]));
  const tot = emptyCounts();
  const bySec = Object.fromEntries(SECTIONS.map(s => [s.id, emptyCounts()]));
  const bySession = [];
  for (const s of sessions) {
    const c = emptyCounts();
    let any = false;
    for (const m of members) {
      if (!convoked(s, m.section)) continue;
      const mk = hasData(s, m.section) ? effMark(s, m, ctx) : null;
      const rec = per.get(m.id);
      rec.hist.push({ s, mk });
      if (!mk) continue;
      any = true;
      c[mk.s]++; tot[mk.s]++; rec[mk.s]++; bySec[m.section][mk.s]++;
      if (mk.s === 'R') { const mn = +mk.min || 0; c.min += mn; tot.min += mn; rec.min += mn; bySec[m.section].min += mn; }
      if (mk.note) rec.notes.push({ s, mk });
    }
    if (any) bySession.push({ s, c });
  }
  const rows = [...per.values()].filter(r => r.m.active !== false || (r.P + r.R + r.FJ + r.FNJ + r.NP) > 0);
  return { sessions, all: base, counted: bySession, tot, bySec, rows };
}

/* ---------- Norma: assistència mínima per fer el concert ---------- */
// RULE_SKIP (concerts, actuacions i «Altres») depèn del tipus d'agrupació: vegeu applyGroupConfig.
const minAttendance = () => Math.min(100, Math.max(1, +S.config.minAttendance || 80));
/** status: ok | risk (below now, can still reach it) | out (cannot reach it any more) | null (no data / not in it) */
function ruleStatus(prodId, member) {
  if (!prodId || isExcluded(prodId, member.id)) return null;
  const min = minAttendance() / 100;
  let att = 0, abs = 0, remaining = 0;
  for (const s of allSessions(prodId)) {
    if (RULE_SKIP.has(s.type) || !convoked(s, member.section)) continue;
    const marked = s.date <= TODAY && hasData(s, member.section) ? effMark(s, member, prodId) : null;
    if (!marked) { if (s.date >= TODAY && !onLeave(member, s.date)) remaining++; continue; }
    if (marked.s === 'NP') continue;
    if (marked.s === 'P' || marked.s === 'R') att++; else abs++;
  }
  const done = att + abs;
  if (!done) return null;
  const cur = att / done, best = (att + remaining) / (done + remaining);
  return { cur, best, att, abs, remaining, status: best < min ? 'out' : cur < min ? 'risk' : 'ok' };
}

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
  if (!canEdit() || PREVIEW || ARCH.busy) return;
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

/* ---------- Absence notices ---------- */
const absencesFor = (sid, mid) => [...S.absences.values()].filter(a => a.memberId === mid && (a.sessionIds || []).includes(sid) && a.status !== 'rejected');
const pendingAbsences = () => [...S.absences.values()].filter(a => a.status === 'pending');

/* ================= Mutations ================= */
function setMark(session, member, patch) {
  const key = attKey(session.id, member.section);
  const doc = clone(attDoc(session.id, member.section) || { sessionId: session.id, section: member.section, marks: {} });
  doc.date = session.date;   // per poder llegir només les llistes dels trimestres que no s'han arxivat
  doc.marks = doc.marks || {};
  if (patch === null) delete doc.marks[member.id];
  else doc.marks[member.id] = { ...(doc.marks[member.id] || {}), ...patch };
  const m = doc.marks[member.id];
  if (m) {
    if (m.s !== 'R') delete m.min;
    if (m.s !== 'FJ' && m.s !== 'FNJ') delete m.note;
    for (const k of Object.keys(m)) if (m[k] === undefined || m[k] === '') delete m[k];
  }
  doc.updatedAt = new Date().toISOString();
  saveAttendance(key, doc);
}
/** Desa una llista. Si és d'un trimestre arxivat, també la corregeix a l'arxiu (que és d'on la llegeix tothom). */
function saveAttendance(key, doc) {
  S.attendance.set(key, doc);
  persist('attendance', key, doc);
  const arch = !PREVIEW && doc.date && doc.date <= archCut() ? archiveOf(doc.date) : null;
  if (!arch) return;
  ARCH.docs.set(key, doc);
  const path = new firebase.firestore.FieldPath('docs', key);
  db.doc(`attArchive/${arch.id}`).update(path, doc).catch(writeFailed);
}
function saveMember(m) { S.members.set(m.id, m); persist('members', m.id, m, 50); }
function saveProduction(p) { S.productions.set(p.id, p); persist('productions', p.id, p, 50); }
function saveConfig(patch) { S.config = { ...S.config, ...patch }; persist('config', 'main', S.config, 200); }

async function removeMany(paths, label) {
  for (const [col, id] of paths) { S[col].delete(id); persist(col, id, null, 20); }
  if (S.mode === 'shared') {
    toast(label || 'Esborrant…');
    await sleep(50);
  }
}

function saveAbsence(a) { S.absences.set(a.id, a); persist('absences', a.id, a, 30); }
/** Accepting a «no vindré» notice marks those sessions as justified (unless already marked by hand). */
function acceptAbsence(a) {
  const m = S.members.get(a.memberId);
  if (m && a.kind === 'absent') {
    for (const sid of a.sessionIds || []) {
      const s = sessionById(sid);
      const cur = s && attDoc(sid, m.section)?.marks?.[m.id];
      if (s && !cur) setMark(s, m, { s: 'FJ', note: `Avisat: ${a.reason || 'sense motiu'}`.slice(0, 120) });
    }
  }
  saveAbsence({ ...a, status: 'accepted', reviewedAt: new Date().toISOString() });
}
