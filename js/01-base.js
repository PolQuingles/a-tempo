// A Tempo · 01-base.js — Constants, tipus d'agrupació i paraules, utilitats, estat, memòria del mòbil, rols i classes (dades derivades).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Constants ================= */
const STATUS = {
  P:   { label: 'Assisteix',               short: 'Present' },
  R:   { label: 'Retard',                  short: 'Retard' },
  FNJ: { label: 'Falta no justificada',    short: 'No just.' },
  FJ:  { label: 'Falta justificada',       short: 'Justif.' },
  NP:  { label: 'No fa aquesta producció', short: 'No fa' },
};
const ORDER = ['P', 'R', 'FNJ', 'FJ', 'NP'];
const PARTS = ['1', '2', '1 o 2'];
const WEEKDAYS = [ ['1','dl'], ['2','dt'], ['3','dc'], ['4','dj'], ['5','dv'], ['6','ds'], ['0','dg'] ];
const LS_UI = 'atempo:ui:v1';
const COLS = ['members', 'productions', 'attendance'];
const CLASS_COLS = ['classes', 'classReq', 'classPlan', 'classNotes'];
const CLASS_MARKS = ['P', 'R', 'FJ', 'FNJ'];
// Fins on enrere es llegeixen els dies de classe.
const CLASS_FROM = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

/* ================= Agrupacions: tipus, seccions i paraules ================= */
// L'app serveix per a cors, orquestres, bandes i altres agrupacions. El tipus decideix les paraules
// («cantaires i cordes», «músics i seccions»…), les seccions per defecte i els tipus de sessió.
// Les seccions de cada agrupació es desen a config/main.sections i es poden canviar a Ajustos.
const FOUNDER = 'nSN9kYDkzPik239jnsMsCSYW';   // la primera agrupació: conserva les adreces d'abans
const CONCERT = { show: 'concert', Show: 'Concert', el: 'el concert', del: 'del concert', els: 'els concerts', next: 'Proper concert', list: 'Llista de concert' };
const ACTUACIO = { show: 'actuació', Show: 'Actuació', el: 'l’actuació', del: 'de l’actuació', els: 'les actuacions', next: 'Propera actuació', list: 'Llista d’actuació' };
const MUSICS = { member: 'músic', members: 'músics', section: 'secció', sections: 'seccions', leader: 'cap de secció', leaders: 'caps de secció',
  part: 'part', parts: 'parts', play: 'tocar', plays: 'toca', balance: 'Plantilla per seccions' };
const KINDS = {
  cor: {
    label: 'Cor', hint: 'Cor, coral o grup vocal',
    words: { member: 'cantaire', members: 'cantaires', section: 'corda', sections: 'cordes', leader: 'cap de corda', leaders: 'caps de corda',
      part: 'veu', parts: 'veus', play: 'cantar', plays: 'canta', balance: 'Equilibri de veus',
      group: 'cor', el: 'el cor', del: 'del cor', al: 'al cor', tot: 'tot el cor', aquest: 'aquest cor', sh: CONCERT },
    sections: [['S', 'Sopranos'], ['C', 'Contralts'], ['T', 'Tenors'], ['B', 'Baixos']],
    types: ['Assaig', 'Assaig parcial', 'Assaig pregeneral', 'Assaig general', 'Assaig amb orquestra', 'Concert', 'Cap de setmana de treball', 'Viatge / intercanvi', 'Altres'],
    shows: ['Concert'],
  },
  orquestra: {
    label: 'Orquestra', hint: 'Simfònica, de cambra, de joves…',
    words: { ...MUSICS, group: 'orquestra', el: 'l’orquestra', del: 'de l’orquestra', al: 'a l’orquestra', tot: 'tota l’orquestra', aquest: 'aquesta orquestra', sh: CONCERT },
    sections: [['V1', 'Violins primers'], ['V2', 'Violins segons'], ['Va', 'Violes'], ['Vc', 'Violoncels'], ['Cb', 'Contrabaixos'], ['Fu', 'Vent fusta'], ['Me', 'Vent metall'], ['Pc', 'Percussió i arpa']],
    types: ['Assaig', 'Assaig parcial', 'Assaig de corda', 'Assaig de vent', 'Assaig general', 'Assaig amb solistes', 'Assaig amb cor', 'Concert', 'Enregistrament', 'Gira', 'Altres'],
    shows: ['Concert', 'Enregistrament'],
  },
  banda: {
    label: 'Banda', hint: 'Banda de música, de cornetes i tambors…',
    words: { ...MUSICS, group: 'banda', el: 'la banda', del: 'de la banda', al: 'a la banda', tot: 'tota la banda', aquest: 'aquesta banda', sh: ACTUACIO },
    sections: [['Fl', 'Flautes i oboès'], ['Cl', 'Clarinets'], ['Sx', 'Saxòfons'], ['Tp', 'Trompetes'], ['Tr', 'Trompes'], ['Tb', 'Trombons'], ['Bt', 'Bombardins i tubes'], ['Pc', 'Percussió']],
    types: ['Assaig', 'Assaig parcial', 'Assaig general', 'Concert', 'Cercavila', 'Processó', 'Altres'],
    shows: ['Concert', 'Cercavila', 'Processó'],
  },
  cobla: {
    label: 'Cobla', hint: 'Cobla de sardanes',
    words: { ...MUSICS, group: 'cobla', el: 'la cobla', del: 'de la cobla', al: 'a la cobla', tot: 'tota la cobla', aquest: 'aquesta cobla', sh: ACTUACIO },
    sections: [['Fb', 'Flabiol i tibles'], ['Te', 'Tenores'], ['Tp', 'Trompetes'], ['Tb', 'Trombó i fiscorns'], ['Cb', 'Contrabaix']],
    types: ['Assaig', 'Audició', 'Concert', 'Ballada', 'Enregistrament', 'Altres'],
    shows: ['Audició', 'Concert', 'Ballada', 'Enregistrament'],
  },
  cambra: {
    label: 'Grup de cambra', hint: 'Quartet, ensemble, música antiga…',
    words: { ...MUSICS, group: 'grup', el: 'el grup', del: 'del grup', al: 'al grup', tot: 'tot el grup', aquest: 'aquest grup', sh: CONCERT },
    sections: [['V', 'Veus'], ['I', 'Instruments']],
    types: ['Assaig', 'Assaig general', 'Concert', 'Enregistrament', 'Altres'],
    shows: ['Concert', 'Enregistrament'],
  },
  altres: {
    label: 'Una altra agrupació', hint: 'Colla, esbart, grup de teatre…',
    words: { member: 'membre', members: 'membres', section: 'secció', sections: 'seccions', leader: 'responsable de secció', leaders: 'responsables de secció',
      part: 'part', parts: 'parts', play: 'participar', plays: 'participa', balance: 'Plantilla per seccions',
      group: 'grup', el: 'el grup', del: 'del grup', al: 'al grup', tot: 'tot el grup', aquest: 'aquest grup', sh: ACTUACIO },
    sections: [['A', 'Secció A'], ['B', 'Secció B']],
    types: ['Assaig', 'Assaig general', 'Actuació', 'Reunió', 'Altres'],
    shows: ['Actuació'],
  },
};
const kindOf = () => KINDS[S.config.kind] ? S.config.kind : 'cor';
const defaultSections = kind => (KINDS[kind] || KINDS.cor).sections.map(([id, name]) => ({ id, name, short: id }));
let SECTIONS = [], SEC_MAP = {}, TYPES = [], SHOWS = new Set(), RULE_SKIP = new Set(), V = {};
// Una secció que ja no existeix (fitxes antigues) es mostra amb el seu codi en lloc de trencar-se.
const SEC = new Proxy({}, { get: (_, id) => SEC_MAP[id] || { id: String(id), name: String(id), short: String(id) } });
const secShort = id => SEC[id].short;
const secPick = (x, pressed) => `<button type="button" class="pick" aria-pressed="${!!pressed}" data-sec="${esc(x.id)}"><span class="vl">${esc(x.short)}</span> ${esc(x.name)}</button>`;
const isShow = s => !!s && SHOWS.has(s.type);
/** Recompute sections, session types and words from the group's config. */
function applyGroupConfig() {
  const kind = kindOf(), k = KINDS[kind];
  const list = Array.isArray(S.config.sections) && S.config.sections.length ? S.config.sections : defaultSections(kind);
  SECTIONS = list.filter(x => x && x.id).map(x => ({ id: String(x.id), name: x.name || String(x.id), short: x.short || String(x.id) }));
  SEC_MAP = Object.fromEntries(SECTIONS.map(x => [x.id, x]));
  TYPES = Array.isArray(S.config.types) && S.config.types.length ? S.config.types : k.types;
  SHOWS = new Set(k.shows);
  RULE_SKIP = new Set([...k.shows, 'Altres', 'Reunió']);
  const w = k.words;
  V = { ...w, kind, Member: capz(w.member), Members: capz(w.members), Section: capz(w.section), Sections: capz(w.sections),
    Leader: capz(w.leader), Part: capz(w.part), Group: capz(w.group), Tot: capz(w.tot), Kind: k.label,
    Teacher: kind === 'cor' ? 'Professor de cant' : 'Professor', classes: kind === 'cor' ? 'Classes de cant' : 'Classes' };
  if (SECTIONS.length && !SEC_MAP[ui.section]) ui.section = SECTIONS[0].id;
  if (ui.rollSec && !SEC_MAP[ui.rollSec]) ui.rollSec = null;
  if (ui.statsSec && !SEC_MAP[ui.statsSec]) ui.statsSec = '';
}

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ================= Utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Un toc de vibració (Android), només després que la persona hagi tocat la pantalla: si no, el navegador ho bloqueja. */
const buzz = pattern => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pattern); } catch {} };
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normText = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Filter an already-rendered list without re-rendering, so the search box keeps the focus. */
function filterList(input) {
  const q = normText(input.value).trim();
  const root = $(input.dataset.target) || document;
  let shown = 0;
  for (const li of $$('[data-find]', root)) { const hit = !q || li.dataset.find.includes(q); li.hidden = !hit; if (hit) shown++; }
  for (const g of $$('[data-group]', root)) g.hidden = !!q && !$$('[data-find]:not([hidden])', g).length;
  const empty = $('.find-empty', root);
  if (empty) empty.hidden = shown > 0;
}
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = isoDate(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = (s, o) => { try { return new Intl.DateTimeFormat('ca-ES', o).format(parseISO(s)); } catch { return s; } };
const capz = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const longDate = s => capz(fmtD(s, { weekday: 'long', day: 'numeric', month: 'long' }));
const shortDate = s => fmtD(s, { day: 'numeric', month: 'short' });
const ddmm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
const timeRange = s => s.time ? (s.end ? `${s.time}–${s.end}` : s.time) : '';
const partTag = m => m.part ? `${secShort(m.section)}${m.part.replace(' o ', '/')}` : '';
const wdShort = s => fmtD(s, { weekday: 'short' });
const monthYear = s => capz(fmtD(s, { month: 'long', year: 'numeric' }));
const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
const kpiPct = v => v == null ? '—' : `${Math.round(v * 100)}<small>%</small>`;
const byName = (a, b) => a.name.localeCompare(b.name, 'ca');

/* ================= State ================= */
const S = {
  mode: 'loading',          // loading | setup | nokey | nostaff | pick | create | suspended | badlink | shared
  ready: false,
  error: null,
  role: null,               // edit | view | singer
  uid: null,
  config: { name: '', alertFNJ: 3, minAttendance: 80, demo: false },
  members: new Map(),
  productions: new Map(),
  attendance: new Map(),
  absences: new Map(),
  staff: new Map(),       // email -> { email, name, roles: [admin|director|leader|palau|singer], role (the first one), section?, memberId? }
  subs: new Map(),        // <sessionId>_<corda> -> substitute for that roll call
  rsvp: new Map(),        // <sessionId>_<memberId> -> { answer: yes|no, note }
  announcements: new Map(),
  polls: new Map(),
  pollVotes: new Map(),   // <pollId>_<memberId> -> { choices, note }
  classes: new Map(),     // <id> -> one day of singing lessons, with its slots
  classReq: new Map(),    // <id> -> a lateness/absence notice or a swap request
  classPlan: new Map(),   // <teacher email> -> their fixed weekly timetable
  classNotes: new Map(),  // <classId>_<slotId> -> what was worked on (teacher and that singer only)
  works: new Map(),       // <id> -> una obra del repertori: partitures, àudios, durada, solistes i petits grups
  messages: new Map(),    // <id> -> un missatge dins l'app, a tothom o a unes cordes (21-missatges)
  memberDocs: null,       // secretaria: documents i quotes de cada persona (es llegeixen quan cal)
  trips: new Map(),       // <id> -> una sortida o gira: dates, transport i habitacions
  tripSignups: new Map(), // <tripId>_<memberId> -> qui hi va, amb quin transport i a quina habitació
  myMarks: null,          // singer: my own marks
  secrets: null,
  secretsMembers: null,   // memberId -> personal link key
  me: null,               // staff record when signed in with Google
  memberId: null,         // singer's own member id (personal link)
  profiles: null,         // equip: les fitxes que omple cadascú (es llegeixen quan cal: llistes i sortides)
  push: new Map(),        // staff: one doc per device that has notifications on (read when «Qui ha entrat» opens)
  pushOn: false,          // this device
  pushPrefs: null,
  pushCordes: null,
  email: '',              // signed-in Google account
  userName: '',
  groups: [],             // [{ id, name, kind, status }] the groups this account belongs to
  group: null,            // directory record of the active group: { id, name, kind, status, fileQuotaMB, stats }
  platform: null,         // true when this account runs the platform (plataforma/equip)
  pro: false,             // Usuari Pro (plataforma/pro, or the platform team): may create groups and change or delete the ones they run
};
const ui = {
  tab: 'avisos', section: '', sessionId: null, rollSec: null,
  calProd: 'all', calPast: false,
  statsScope: 'prod', statsProd: null, statsTerm: null, statsSec: '', statsSort: 'pct',
  manage: 'personal', people: 'singer', absFilter: 'pending',
  clWho: null, clMonth: null, clDay: null,
};
/* ---------- Memòria del mòbil, per agrupació ---------- */
// Cada agrupació guarda a part la pestanya oberta, els avisos vistos, etc. La primera agrupació
// encara llegeix les claus d'abans, que no duien l'agrupació al nom.
let GID = null;
const lsKey = base => GID ? `${base}:${GID}` : base;
function lsGet(base) {
  try {
    const v = localStorage.getItem(lsKey(base));
    return v != null || GID !== FOUNDER ? v : localStorage.getItem(base);
  } catch { return null; }
}
function lsSet(base, v) { try { v == null ? localStorage.removeItem(lsKey(base)) : localStorage.setItem(lsKey(base), v); } catch {} }
function loadUI() {
  try { Object.assign(ui, JSON.parse(lsGet(LS_UI) || '{}')); } catch {}
  ui.sessionId = null;
  ui.clWho = null;   // les classes comencen sempre pel quadre del professorat
}
function saveUI() {
  lsSet(LS_UI, JSON.stringify({ tab: ui.tab, section: ui.section, calProd: ui.calProd, calView: ui.calView, statsScope: ui.statsScope, statsSec: ui.statsSec, statsSort: ui.statsSort, manage: ui.manage, people: ui.people, board: ui.board, att: ui.att }));
}
// Rols de les persones de l'agrupació. Una persona pot tenir-ne més d'un (p. ex. cap de corda i cantaire).
// Administració ho pot fer tot; direcció, caps i equip passen llista i editen; cantaires i músics només llegeixen.
const ROLE_KEYS = ['admin', 'director', 'gerencia', 'secretaria', 'leader', 'voice', 'singer'];
const roleLabel = r => ({ admin: 'Administració', director: 'Director', gerencia: 'Gerència', secretaria: 'Secretaria', leader: V.Leader, singer: V.Member, voice: V.Teacher }[r] || r);
const EDIT_ROLES = new Set(['admin', 'director', 'gerencia', 'secretaria', 'leader']);
/** The roles of a person record, in ROLE_KEYS order: the list, or the single role of older records.
 *  «palau» (l'antic rol únic de l'equip tècnic) es llegeix com a gerència fins que se'n desa un de nou. */
const rolesOf = p => {
  const list = !p ? [] : Array.isArray(p.roles) && p.roles.length ? p.roles : p.role ? [p.role] : [];
  return ROLE_KEYS.filter(k => list.includes(k) || (k === 'gerencia' && list.includes('palau')));
};
const hasRole = (p, r) => rolesOf(p).includes(r);
const rolesText = p => rolesOf(p).map(roleLabel).join(' · ') || 'Sense rol';
const roleLevel = p => rolesOf(p).some(r => EDIT_ROLES.has(r)) ? 'edit' : 'read';
/** What a set of roles lets that person do, in one or two sentences. */
const rolesHint = roles => !roles.length ? 'Tria almenys un rol.' : [
  roles.includes('admin') ? 'Ho pot fer tot: persones, identitat i dades de l’agrupació.'
    : roles.some(r => EDIT_ROLES.has(r)) ? 'Passa llista, publica anuncis, convocatòries i enquestes, i puja materials i documents.'
    : 'Veu tota l’app en mode lectura, sense poder-hi canviar res.',
  roles.includes('singer') ? `Té el seu espai: avisa de les seves absències i veu la seva assistència.` : '',
  roles.includes('leader') ? `Porta una ${V.section}.` : '',
  roles.includes('gerencia') || roles.includes('secretaria') ? 'Forma part de l’equip de l’agrupació.' : '',
  roles.includes('voice') ? `Porta les ${V.classes.toLowerCase()}: en fa el calendari i rep els avisos dels ${V.members}.` : '',
].filter(Boolean).join(' ');
// «Mira-ho com un cantaire»: només canvia el que es veu en aquest mòbil, no els permisos.
let PREVIEW = null;
const canEdit = () => S.role === 'edit' && !PREVIEW;
const isAdmin = () => S.role === 'edit' && !PREVIEW && hasRole(S.me, 'admin');
/** Name, type, sections and look of the group, and deleting it: only a Pro user who runs it. */
const canManageGroup = () => isAdmin() && S.pro;
/* ---------- Classes de cant ---------- */
const classesOn = () => !!S.config.classesOn;
/** Fa el calendari de classes i respon els avisos: el professorat i l'administració. */
const teachesClasses = () => !PREVIEW && (hasRole(S.me, 'voice') || hasRole(S.me, 'admin'));
const classDays = who => [...S.classes.values()].filter(c => !who || (c.teacher || '') === who)
  .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || ''));
/** Els llocs del dia, amb els canvis d'hora acceptats ja aplicats. */
function classSlots(c) {
  const slots = (c.slots || []).map(x => ({ ...x }));
  const by = new Map(slots.map(x => [x.id, x]));
  for (const r of S.classReq.values()) {
    if (r.classId !== c.id || r.kind !== 'swap' || r.status !== 'accepted') continue;
    const a = by.get(r.slotId), b = by.get(r.withSlotId);
    if (a && b) { const t = a.memberId; a.memberId = b.memberId; b.memberId = t; a.swapped = b.swapped = true; }
  }
  return slots;
}
const mySlot = c => { const id = myId(); return id ? classSlots(c).find(x => x.memberId === id) : null; };
const classNoteFor = (classId, slotId) => S.classNotes.get(`${classId}_${slotId}`);
const classLive = c => c && !c.cancelled;
/** Canvis d'hora oberts que puc agafar: d'un altre, pendents, i aquell dia hi tinc hora. */
const openSwaps = () => {
  const id = myId();
  if (!id) return [];
  return [...S.classReq.values()].filter(r => r.kind === 'swap' && r.open && r.status === 'pending' && r.memberId !== id
    && classLive(S.classes.get(r.classId)) && S.classes.get(r.classId)?.date >= TODAY
    && !!mySlot(S.classes.get(r.classId)));
};
/** Assajos o concerts que es trepitgen amb una hora de classe. */
function classClash(c, x) {
  const m = S.members.get(x.memberId || '');
  if (!m || !x.time) return null;
  const from = parseTime(x.time), to = from + (+x.mins || 30);
  return allSessions().find(s => s.date === c.date && s.time && convoked(s, m.section)
    && parseTime(s.time) < to && (parseTime(s.end) || parseTime(s.time) + 120) > from) || null;
}
/** La meva propera classe: el primer dia que ve on tinc hora. */
function nextClass() {
  if (!classesOn() || !myId()) return null;
  for (const c of classDays()) {
    if (c.date < TODAY || !classLive(c)) continue;
    const x = mySlot(c);
    if (x) return { c, slot: x };
  }
  return null;
}
/** De qui és una hora de classe un cop aplicats els canvis d'hora. */
const slotMember = x => x.markFor || x.memberId || '';
const inClasses = () => !!myId() && classDays().some(c => (c.slots || []).some(x => x.memberId === myId()));
const seeClasses = () => classesOn() && (teachesClasses() || inClasses());
/** Els avisos que toquen una hora concreta: els de retard o absència segueixen la persona
 *  (si s'ha fet un canvi, van amb ella a l'hora nova); els canvis d'hora, les dues hores. */
const slotReqs = (c, slot) => [...S.classReq.values()]
  .filter(r => r.classId === c.id && !['cancelled', 'rejected'].includes(r.status)
    && (r.kind === 'swap' ? (r.slotId === slot.id || r.withSlotId === slot.id) : r.memberId === slot.memberId))
  .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
const reqsToAnswer = () => { const id = myId(); return id ? [...S.classReq.values()].filter(r => r.kind === 'swap' && r.status === 'pending' && r.withMemberId === id) : []; };
const reqsForTeacher = () => [...S.classReq.values()].filter(r => r.status === 'pending' && r.kind !== 'swap');
const classBadge = () => reqsToAnswer().length + (teachesClasses() ? reqsForTeacher().length : 0);
/** The member this account really is (from the account record or a personal link), if any. */
const myId = () => { const id = PREVIEW ? PREVIEW.memberId : S.memberId; return id && S.members.has(id) ? id : null; };
/** Narrow personal link: only «El meu espai», no access to the rest of the app. */
const isLinkOnly = () => S.role === 'singer';
const subKey = (sid, sec) => `${sid}_${sec}`;
const subFor = (sid, sec) => S.subs.get(subKey(sid, sec));
/** Member allowed to take today's roll for this session and section. */
const isMySub = (sid, sec) => { const x = subFor(sid, sec); return !canEdit() && !!x && !!myId() && x.memberId === myId() && x.until > Date.now(); };
const canMark = (s, sec) => canEdit() || (!!s && isMySub(s.id, sec));
const mySubs = () => { const id = myId(); return id ? [...S.subs.values()].filter(x => x.memberId === id && x.until > Date.now()) : []; };
