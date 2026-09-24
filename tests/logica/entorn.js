// Proves de la lògica · entorn: un navegador de mentida perquè els fitxers de js/ es puguin carregar fora del navegador
// (amb Node a les proves automàtiques, o amb el JavaScriptCore del Mac). No pinta res: només cal que res no peti en carregar.
'use strict';
(function (g) {
  // Un objecte que accepta qualsevol cosa: propietats, crides i «new». Fa de document, d'element, de navigator…
  const any = () => {
    const f = function () { return any(); };
    return new Proxy(f, {
      get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'length' ? 0 : k === 'then' ? undefined : k in t ? t[k] : any(),
      set: () => true, apply: () => any(), construct: () => any(), has: () => true,
    });
  };
  const store = new Map();
  g.window = g;
  g.self = g;
  g.document = any();
  g.navigator = { userAgent: 'proves', platform: 'proves', onLine: true, maxTouchPoints: 0, language: 'ca' };
  g.location = { hash: '', search: '', pathname: '/a-tempo/', origin: 'https://proves.local', href: 'https://proves.local/a-tempo/', hostname: 'proves.local', replace() {}, reload() {} };
  g.history = { state: null, length: 1, pushState() {}, replaceState() {}, back() {} };
  g.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); },
    key: i => [...store.keys()][i] ?? null, get length() { return store.size; }, clear: () => store.clear(),
  };
  g.sessionStorage = g.localStorage;
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
  g.requestAnimationFrame = f => 0;
  g.getComputedStyle = () => any();
  g.CSS = { escape: s => String(s) };
  g.Notification = any();
  g.caches = any();
  if (typeof g.setTimeout !== 'function') { g.setTimeout = () => 0; g.clearTimeout = () => {}; g.setInterval = () => 0; g.clearInterval = () => {}; }
  if (typeof g.console === 'undefined') g.console = { log: (...a) => g.print(...a), warn: () => {}, error: (...a) => g.print(...a) };
  if (typeof g.structuredClone !== 'function') g.structuredClone = v => JSON.parse(JSON.stringify(v));
  class Ts { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } }
  function FieldPath(...parts) { this.parts = parts; }
  const firestore = () => any();
  Object.assign(firestore, { FieldValue: { serverTimestamp: () => ({ __serverTs: 1 }), delete: () => undefined }, Timestamp: { fromMillis: ms => new Ts(ms) }, FieldPath, Blob: { fromUint8Array: a => a } });
  g.firebase = { firestore, auth: any(), initializeApp: () => ({}) };
  g.COR_FIREBASE = { apiKey: 'proves' };
  g.COR_PUSH_KEY = '';
})(globalThis);
