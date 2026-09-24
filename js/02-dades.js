// A Tempo · 02-dades.js — Connexió amb Firebase i sincronització, dades derivades, temporada, norma i canvis a les dades.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Persistence (Firebase) ================= */
// Everyone signs in with Google; the account's groups are listed in staffIndex/<email>/agrupacions.
// Nobody gets in without an account: old links (#k=…) only show a message asking to sign in.
const LS_KEY = 'atempo:clau';
const LS_LINK = 'atempo:enllac';
const LS_ME = 'atempo:jo';
const ROLE_NAME = { edit: 'Edició', read: 'Només lectura', view: 'Només lectura', singer: 'Enllaç personal' };
let db = null, fs = null, auth = null, LINK = null;   // LINK = { secret, choirId, role }
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
  const path = `${col}/${id}`;
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
  const p = q.data === null ? db.doc(path).delete() : db.doc(path).set(q.data);
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

function subscribe() {
  const staff = S.role === 'edit';
  const reader = S.role === 'read' || S.role === 'view';   // account with read-only access to the whole app
  const teach = staff || hasRole(S.me, 'voice');           // veu tots els avisos de les classes
  // Les notes de classe són privades: només el professorat i l'administració les veuen totes.
  const teachCl = hasRole(S.me, 'voice') || hasRole(S.me, 'admin');
  const wanted = ['members', 'productions', 'config', 'absences', 'subs', 'rsvp', 'announcements', 'polls', 'pollVotes', 'classes', 'classReq', 'classPlan', 'classNotes'];
  if (staff) wanted.push('attendance', 'secrets', 'secretsMembers', 'staff', 'memberMarks', 'push');
  else if (reader) wanted.push('attendance');
  else wanted.push('myMarks');
  const loaded = new Set();
  const markLoaded = k => { loaded.add(k); if (loaded.size >= wanted.length && !S.ready) { S.ready = true; render(); if (staff) scheduleMirror(); afterReady(); } };
  const onCol = col => snap => {
    const next = new Map();
    for (const d of snap.docs) {
      const path = `${col}/${d.id}`;
      if (isDirty(path)) { if (S[col].has(d.id)) next.set(d.id, S[col].get(d.id)); }
      else next.set(d.id, d.data());
    }
    for (const [id, v] of S[col]) if (!next.has(id) && isDirty(`${col}/${id}`) && queue.get(`${col}/${id}`)?.data !== null) next.set(id, v);
    S[col] = next;
    if (col === 'subs' && !staff && !reader) watchSubAttendance();
    if (staff && (col === 'attendance' || col === 'memberMarks' || col === 'members' || col === 'productions')) scheduleMirror();
    markLoaded(col);
    if (S.ready) scheduleRender();
  };
  const mine = col => staff ? db.collection(col) : db.collection(col).where('memberId', '==', S.memberId || '-');
  // Classes de cant: el calendari el veu tothom; els avisos, el professorat tots i cadascú els seus.
  // Només es llegeixen les dues últimes setmanes i el que ve: un curs sencer serien massa lectures.
  db.collection('classes').where('date', '>=', CLASS_FROM).onSnapshot(onCol('classes'), () => markLoaded('classes'));
  db.collection('classPlan').onSnapshot(onCol('classPlan'), () => markLoaded('classPlan'));
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
  for (const col of ['members', 'productions', 'announcements', 'polls']) db.collection(col).onSnapshot(onCol(col), e => { markLoaded(col); if (col === 'members' || col === 'productions') onDbError(e); });
  for (const col of ['absences', 'subs', 'rsvp', 'pollVotes']) mine(col).onSnapshot(onCol(col), e => { markLoaded(col); if (staff && col !== 'pollVotes') onDbError(e); });
  if (reader) db.collection('attendance').onSnapshot(onCol('attendance'), e => { markLoaded('attendance'); onDbError(e); });
  else if (!staff) db.doc(`memberMarks/${S.memberId || '-'}`).onSnapshot(snap => { S.myMarks = snap.exists ? snap.data() : null; markLoaded('myMarks'); if (S.ready) scheduleRender(); }, () => markLoaded('myMarks'));
  if (staff) {
    db.collection('attendance').onSnapshot(onCol('attendance'), onDbError);
    db.collection('staff').onSnapshot(onCol('staff'), () => markLoaded('staff'));
    db.collection('memberMarks').onSnapshot(onCol('memberMarks'), () => markLoaded('memberMarks'));
    db.collection('push').onSnapshot(onCol('push'), () => markLoaded('push'));
    db.doc('secrets/main').onSnapshot(snap => { S.secrets = snap.exists ? snap.data() : null; markLoaded('secrets'); if (S.ready) scheduleRender(); }, () => markLoaded('secrets'));
    db.doc('secrets/members').onSnapshot(snap => { S.secretsMembers = snap.exists ? snap.data() : {}; markLoaded('secretsMembers'); if (S.ready) scheduleRender(); }, () => markLoaded('secretsMembers'));
  }
  db.doc('config/main').onSnapshot(snap => {
    if (!isDirty('config/main')) S.config = { name: '', alertFNJ: 3, minAttendance: 80, demo: false, ...(snap.exists ? snap.data() : {}) };
    applyGroupConfig();
    markLoaded('config');
    if (S.ready) scheduleRender();
  }, onDbError);
}
/** A singer who is today's substitute listens to the attendance sheets they may fill in. */
const subWatchers = new Map();
function watchSubAttendance() {
  for (const sub of S.subs.values()) {
    if (sub.until < Date.now() || subWatchers.has(`${sub.sessionId}_${sub.section}`)) continue;
    const id = `${sub.sessionId}_${sub.section}`;
    subWatchers.set(id, db.doc(`attendance/${id}`).onSnapshot(snap => {
      if (!isDirty(`attendance/${id}`)) { if (snap.exists) S.attendance.set(id, snap.data()); else S.attendance.delete(id); }
      if (S.ready) scheduleRender();
    }, () => {}));
  }
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
const attDoc = (sid, sec) => S.attendance.get(attKey(sid, sec)) || myMarkDoc(sid, sec);
function myMarkDoc(sid, sec) {
  if (S.role !== 'singer' || !S.myMarks) return undefined;
  const me = S.members.get(S.memberId);
  const mk = me && me.section === sec && S.myMarks.marks?.[sid];
  return mk ? { marks: { [me.id]: mk } } : undefined;
}
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
  const mins = Math.floor((Date.now() - start) / 60000);
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

/* ---------- Absence notices ---------- */
const absencesFor = (sid, mid) => [...S.absences.values()].filter(a => a.memberId === mid && (a.sessionIds || []).includes(sid) && a.status !== 'rejected');
const pendingAbsences = () => [...S.absences.values()].filter(a => a.status === 'pending');

/* ================= Mutations ================= */
function setMark(session, member, patch) {
  const key = attKey(session.id, member.section);
  const doc = clone(S.attendance.get(key) || { sessionId: session.id, section: member.section, marks: {} });
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
  S.attendance.set(key, doc);
  persist('attendance', key, doc);
  scheduleMirror();
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

/* ---------- Per-singer copy of marks (so each singer can see only their own) ---------- */
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);
let mirrorTimer = null;
// Només cal mentre quedi algun enllaç personal: amb compte propi, el cantaire ja llegeix les llistes.
const mirrorsNeeded = () => !!S.secretsMembers && Object.keys(S.secretsMembers).length > 0;
function scheduleMirror() { if (!canEdit() || !S.ready || !mirrorsNeeded()) return; clearTimeout(mirrorTimer); mirrorTimer = setTimeout(reconcileMirrors, 4000); }
function reconcileMirrors() {
  if (!canEdit() || !mirrorsNeeded()) return;
  const byMember = new Map();
  for (const [key, d] of S.attendance) {
    const sid = d.sessionId || key.slice(0, key.lastIndexOf('_'));
    for (const [mid, mk] of Object.entries(d.marks || {})) {
      if (!mk || !mk.s) continue;
      const rec = { s: mk.s };
      if (mk.min) rec.min = mk.min;
      if (mk.note) rec.note = mk.note;
      if (!byMember.has(mid)) byMember.set(mid, {});
      byMember.get(mid)[sid] = rec;
    }
  }
  let i = 0;
  for (const m of S.members.values()) {
    const next = { memberId: m.id, section: m.section, marks: byMember.get(m.id) || {} };
    const prev = S.memberMarks.get(m.id);
    if (prev && canon(prev.marks || {}) === canon(next.marks) && prev.section === next.section) continue;
    if (!prev && !Object.keys(next.marks).length) continue;
    S.memberMarks.set(m.id, next);
    persist('memberMarks', m.id, next, 20 + (i++) * 25);
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
