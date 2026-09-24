// Només per a proves locals: substitueix Firebase per una base de dades a memòria (i a localStorage),
// sense regles ni xarxa. L'usuari es tria amb ?u=pol | leader | singer | prof | dir | ger.
(function () {
  const KEY = 'fake:db';
  const USERS = {
    pol: { uid: 'uid-pol', email: 'pol@exemple.cat', displayName: 'Pol Proves' },
    leader: { uid: 'uid-leader', email: 'leader@exemple.cat', displayName: 'Lluc Tenor' },
    singer: { uid: 'uid-singer', email: 'singer@exemple.cat', displayName: 'Anna Puig' },
    prof: { uid: 'uid-prof', email: 'prof@exemple.cat', displayName: 'Berta Prat' },
    dir: { uid: 'uid-dir', email: 'dir@exemple.cat', displayName: 'Dídac Director' },
    ger: { uid: 'uid-ger', email: 'ger@exemple.cat', displayName: 'Gemma Gerent' },
  };
  const m = location.search.match(/[?&]u=(\w+)/);
  if (m) localStorage.setItem('fake:user', m[1]);
  if (/[?&]reset=1/.test(location.search)) localStorage.removeItem(KEY);
  const who = USERS[localStorage.getItem('fake:user') || 'pol'];

  let DB = {};
  try { DB = JSON.parse(localStorage.getItem(KEY) || 'null') || window.FAKE_SEED || {}; } catch { DB = window.FAKE_SEED || {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch {} };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  // L'hora del servidor (syncAt): es desa com a { __t: ms } i es llegeix com a Timestamp.
  class Ts { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } }
  const stamp = d => { if (d && typeof d === 'object') for (const k of Object.keys(d)) if (d[k] && d[k].__serverTs) d[k] = { __t: Date.now() }; return d; };
  const revive = d => { if (d && typeof d === 'object') for (const k of Object.keys(d)) if (d[k] && typeof d[k] === 'object' && '__t' in d[k]) d[k] = new Ts(d[k].__t); return d; };
  const plain = v => v instanceof Ts ? v.ms : v && typeof v === 'object' && '__t' in v ? v.__t : v;
  const listeners = new Set();
  const notify = () => setTimeout(() => { for (const l of [...listeners]) { try { l(); } catch (e) { console.error(e); } } }, 0);

  const docSnap = (path) => {
    const data = DB[path];
    return { id: path.split('/').pop(), exists: data !== undefined, data: () => revive(clone(data)), get: f => revive(clone(data || {}))[f], ref: docRef(path) };
  };
  const inCol = (col, path) => path.startsWith(col + '/') && !path.slice(col.length + 1).includes('/');
  const test = (v0, op, x0) => { const v = plain(v0), x = plain(x0); return testRaw(v, op, x); };
  const testRaw = (v, op, x) => op === '==' ? v === x : op === '>=' ? v >= x : op === '<=' ? v <= x : op === '>' ? v > x : op === '<' ? v < x
    : op === 'in' ? x.includes(v) : op === 'array-contains' ? Array.isArray(v) && v.includes(x) : op === '!=' ? v !== x : false;
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k], v) : v; return out; };
  const write = (path, data, opts) => { DB[path] = stamp(clone(opts && opts.merge ? merge(DB[path], data) : data)); save(); notify(); };
  const del = path => { delete DB[path]; save(); notify(); };

  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => docSnap(path),
      set: async (d, o) => write(path, d, o),
      update: async (d, v) => {
        if (DB[path] === undefined) throw Object.assign(new Error('no doc'), { code: 'not-found' });
        // update(FieldPath, valor): només aquell camp, dins dels mapes que calgui.
        if (d instanceof FieldPath) { const cur = clone(DB[path]); let o = cur; for (const k of d.parts.slice(0, -1)) o = o[k] = o[k] || {}; o[d.parts[d.parts.length - 1]] = clone(v); write(path, cur); return; }
        write(path, d, { merge: true });
      },
      delete: async () => del(path),
      collection: sub => colRef(`${path}/${sub}`),
      onSnapshot(ok) { let last = {}; const l = () => { const s = JSON.stringify(DB[path]) || '∅'; if (s !== last) { last = s; ok(docSnap(path)); } }; listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
    };
  }
  function colRef(col, filters = []) {
    const run = () => Object.keys(DB).filter(p => inCol(col, p) && filters.every(([f, op, x]) => test(DB[p][f], op, x))).sort().map(docSnap);
    // Sense xarxa de veritat: la «memòria del mòbil» és la mateixa base de dades, i cada resposta ve del servidor.
    const snap = (changes) => { const docs = run(); return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn),
      metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => changes || docs.map(doc => ({ type: 'added', doc })) }; };
    return {
      id: col.split('/').pop(), path: col,
      doc: id => docRef(`${col}/${id || Math.random().toString(36).slice(2)}`),
      where: (f, op, x) => colRef(col, [...filters, [f, op, x]]),
      orderBy: () => colRef(col, filters), limit: () => colRef(col, filters),
      get: async () => snap(),
      add: async d => { const r = docRef(`${col}/${Math.random().toString(36).slice(2)}`); await r.set(d); return r; },
      onSnapshot(a, b, c) {
        const ok = typeof a === 'function' ? a : b;
        let last = null, prev = new Map();
        const l = () => {
          const docs = run(), now = new Map(docs.map(d => [d.id, JSON.stringify(DB[`${col}/${d.id}`])]));
          const s = JSON.stringify([...now]);
          if (s === last) return;
          const changes = [];
          for (const d of docs) if (!prev.has(d.id)) changes.push({ type: 'added', doc: d }); else if (prev.get(d.id) !== now.get(d.id)) changes.push({ type: 'modified', doc: d });
          for (const id of prev.keys()) if (!now.has(id)) changes.push({ type: 'removed', doc: docSnap(`${col}/${id}`) });
          last = s; prev = now; ok(snap(changes));
        };
        listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l);
      },
    };
  }
  const fsApi = {
    doc: docRef, collection: p => colRef(p),
    batch() { const ops = []; return { set: (r, d, o) => ops.push(() => write(r.path, d, o)), update: (r, d) => ops.push(() => write(r.path, d, { merge: true })), delete: r => ops.push(() => del(r.path)), commit: async () => ops.forEach(f => f()) }; },
    enablePersistence: async () => {},
  };
  const user = who && { ...who, emailVerified: true, isAnonymous: false, providerData: [{ providerId: 'google.com' }], getIdToken: async () => 'fake', reload: async () => {} };
  const authApi = {
    currentUser: user, languageCode: 'ca',
    onAuthStateChanged: cb => { setTimeout(() => cb(user), 0); return () => {}; },
    getRedirectResult: async () => null, signOut: async () => { localStorage.removeItem('fake:user'); },
    signInWithPopup: async () => ({ user }), signInWithRedirect: async () => {},
  };
  function FieldPath(...parts) { this.parts = parts; }
  const firestore = () => fsApi;
  firestore.FieldPath = FieldPath;
  firestore.Blob = { fromUint8Array: a => ({ toUint8Array: () => a }) };
  firestore.FieldValue = { delete: () => undefined, serverTimestamp: () => ({ __serverTs: 1 }) };
  firestore.Timestamp = { fromMillis: ms => new Ts(ms) };
  // A les proves, la lectura per canvis funciona des del primer dia (vegeu DELTA_FROM a js/02-dades.js).
  window.COR_DELTA_FROM = '2000-01-01';
  // L'arxiu de l'assistència no es fa sol a les proves: el prova run.py cridant archiveTerms() quan toca.
  window.COR_ARCHIVE_WAIT = 1e9;
  const auth = () => authApi;
  auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
  window.firebase = { initializeApp: () => ({}), firestore, auth };
  window.COR_FIREBASE = { apiKey: 'fake', projectId: 'fake' };
  window.COR_PUSH_KEY = '';
})();
