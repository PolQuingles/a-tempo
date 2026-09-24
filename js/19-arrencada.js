// A Tempo · 18-arrencada.js — Arrencada de l'app, entrada amb correu i contrasenya, i init().
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Boot ================= */
function connect() {
  GID = LINK.choirId;
  setTimeout(flushFailures, 3000);
  try { localStorage.setItem(LS_GROUP, GID); } catch {}
  loadUI();
  loadMarca(GID);
  applyGroupConfig();
  const base = `cors/${GID}`;
  db = { doc: p => fs.doc(`${base}/${p}`), collection: p => fs.collection(`${base}/${p}`) };
  S.role = LINK.role;
  S.memberId = LINK.memberId || null;
  S.mode = 'shared';
  document.body.classList.toggle('ro', !canEdit());
  render();
  subscribe();
}
/** Once the group's data is in: welcome, «last seen», directory record and this device's notifications. */
function afterReady() {
  if (S.config.name) {
    MARCA = { ...(MARCA || {}), name: S.config.name, short: S.config.shortName || MARCA?.short || '', bg: MARCA?.bg || S.config.brand?.accent || '' };
    try { localStorage.setItem(`${LS_BRAND}:${GID}`, JSON.stringify(MARCA)); } catch {}
  }
  const g = S.groups.find(x => x.id === GID);
  if (g && S.config.name && g.name !== S.config.name) { g.name = S.config.name; saveGroupsCache(); }
  touchLastSeen();
  checkPush();
  syncDirectory();
  setTimeout(maybeWelcome, 500);
}
const waitForUser = () => new Promise(res => { const un = auth.onAuthStateChanged(u => { un(); res(u); }); });
/** Signed in with Google: this person's record and role in one group, and the group's directory record. */
async function resolveStaff(gid) {
  const [me, dir] = await Promise.all([
    fs.doc(`cors/${gid}/staff/${S.email}`).get(),
    fs.doc(`agrupacions/${gid}`).get().catch(() => null),
  ]);
  if (!me.exists) { const e = new Error('no-staff'); e.code = 'no-staff'; throw e; }
  S.me = me.data();
  S.group = { id: gid, ...(dir && dir.exists ? dir.data() : {}) };
  const g = S.groups.find(x => x.id === gid);
  if (g && dir && dir.exists) { Object.assign(g, { name: S.group.name || g.name, kind: S.group.kind, status: S.group.status }); saveGroupsCache(); }
  if (S.group.status && S.group.status !== 'active') { const e = new Error('suspended'); e.code = 'suspended'; throw e; }
  return { choirId: gid, role: roleLevel(S.me), via: 'google', email: S.email, memberId: S.me.memberId || null };
}
async function enterGroup(gid) {
  S.mode = 'loading'; render();
  const cached = cachedLink(gid);
  try {
    LINK = await resolveStaff(gid);
    try { localStorage.setItem(`${LS_LINK}:${gid}`, JSON.stringify({ ...LINK, me: S.me, group: S.group })); } catch {}
  } catch (e) {
    if (e && e.code === 'suspended') { GID = gid; loadMarca(gid); S.mode = 'suspended'; render(); return; }
    if (e && e.code === 'no-staff') {
      S.groups = S.groups.filter(g => g.id !== gid); saveGroupsCache();
      fs.doc(`staffIndex/${S.email}/agrupacions/${gid}`).delete().catch(() => {});
      if (S.groups.length === 1) return enterGroup(S.groups[0].id);
      S.mode = S.groups.length ? 'pick' : 'nostaff'; render();
      toast('Ja no tens accés a aquella agrupació');
      return;
    }
    if (cached) { LINK = cached; S.me = cached.me || null; S.group = cached.group || { id: gid }; }
    else { S.mode = 'nokey'; render(); return; }
  }
  connect();
}
function takeIntent() {
  try { const v = localStorage.getItem(LS_INTENT); localStorage.removeItem(LS_INTENT); return v; } catch { return null; }
}
async function init() {
  loadMarca();
  applyGroupConfig();
  const cfg = window.COR_FIREBASE;
  if (!window.firebase || !cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('POSA')) {
    S.mode = 'setup'; render(); return;
  }
  // Treballador de servei: avisos al mòbil i l'app desada per obrir-la sense cobertura.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  firebase.initializeApp(cfg);
  fs = firebase.firestore();
  // Offline cache: roll call keeps working in rehearsal rooms with poor signal.
  fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  auth = firebase.auth();
  S.mode = 'loading'; render();
  try { await auth.getRedirectResult(); } catch {}
  let user = auth.currentUser || await waitForUser();
  const oldLink = dropOldLink();
  auth.languageCode = 'ca';
  if (user && !user.isAnonymous && !user.emailVerified) {
    // Compte amb contrasenya que encara no ha confirmat el correu (potser ja ho ha fet des d'un altre aparell).
    try { await user.reload(); user = auth.currentUser; if (user && user.emailVerified) await user.getIdToken(true); } catch {}
    if (user && !user.emailVerified) { MAIL = { step: 'verify', email: user.email || '' }; S.mode = 'nokey'; render(); return; }
  }

  if (user && !user.isAnonymous) {
    S.uid = user.uid;
    S.email = (user.email || '').toLowerCase();
    S.userName = user.displayName || '';
    const platform = loadPlatformState();
    try { S.groups = await myGroups(S.email); saveGroupsCache(); }
    catch { S.groups = cachedGroups(); }
    if (takeIntent() === 'create') { await platform; if (S.pro) { startCreate(); return; } }
    const want = urlGroup() || rememberedGroup();
    const pick = S.groups.find(g => g.id === want) || (S.groups.length === 1 ? S.groups[0] : null);
    if (!S.groups.length) { S.mode = 'nostaff'; render(); return; }
    if (!pick) { S.mode = 'pick'; render(); refreshGroupInfo().then(() => { if (S.mode === 'pick') render(); }); return; }
    if (urlGroup() && pick.id !== urlGroup()) setTimeout(() => toast('No tens accés a l’agrupació de l’enllaç'), 800);
    return enterGroup(pick.id);
  }
  // Sense compte no s'hi entra: els enllaços antics només diuen que cal entrar amb el correu.
  S.mode = oldLink ? 'badlink' : 'nokey'; render();
}
/* ---------- Entrar amb un altre correu (contrasenya) ---------- */
// Per a qui no té compte de Google. El primer cop crea la contrasenya i confirma el correu amb l'enllaç
// que li envia Firebase: les regles només deixen entrar comptes amb el correu confirmat.
let MAIL = null;   // { step: signin | create | reset | verify, email, msg, ok, busy }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LS_MAIL = 'atempo:correu';
const LS_VERIFY_AT = 'atempo:verificacio';
const backUrl = () => location.origin + location.pathname + location.search;
const AUTH_MSG = {
  'auth/invalid-email': 'Aquest correu no és vàlid.',
  'auth/invalid-credential': 'El correu o la contrasenya no són correctes. Si és el primer cop que entres, crea la teva contrasenya.',
  'auth/invalid-login-credentials': 'El correu o la contrasenya no són correctes. Si és el primer cop que entres, crea la teva contrasenya.',
  'auth/wrong-password': 'La contrasenya no és correcta. Si no te’n recordes, recupera-la.',
  'auth/user-not-found': 'No hi ha cap compte amb aquest correu. Si és el primer cop que entres, crea la teva contrasenya.',
  'auth/email-already-in-use': 'Aquest correu ja té un compte. Entra amb la teva contrasenya o recupera-la. Si és un compte de Google, toca «Entra amb Google».',
  'auth/weak-password': 'La contrasenya ha de tenir almenys 8 caràcters.',
  'auth/too-many-requests': 'Massa intents seguits. Espera uns minuts i torna-ho a provar.',
  'auth/network-request-failed': 'No hi ha connexió. Torna-ho a provar.',
  'auth/operation-not-allowed': 'Aquesta manera d’entrar encara no està activada. Entra amb Google.',
  'auth/quota-exceeded': 'Avui ja s’han enviat massa correus. Torna-ho a provar demà.',
};
const authMsg = e => AUTH_MSG[e && e.code] || 'No s’ha pogut fer. Torna-ho a provar.';
function mailStart(step = 'signin') {
  let email = MAIL?.email || '';
  try { email = email || localStorage.getItem(LS_MAIL) || ''; } catch {}
  MAIL = { step, email, msg: '', ok: '' };
  render();
  setTimeout(() => $(MAIL.email ? '#ml-pass' : '#ml-email')?.focus(), 50);
}
function mailCard() {
  const m = MAIL, e = esc(m.email || '');
  const note = `${m.msg ? `<p class="ml-err" role="alert">${esc(m.msg)}</p>` : ''}${m.ok ? `<p class="ml-ok" role="status">${m.ok}</p>` : ''}`;
  const emailField = `<label class="field"><span>Correu</span><input class="inp" id="ml-email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" value="${e}" required></label>`;
  const back = `<button type="button" class="btn btn-sm btn-ghost" data-act="mail-cancel">Torna a les opcions d’entrada</button>`;
  if (m.step === 'verify') return `<h2 class="h2">Confirma el teu correu</h2>
    <p>T’hem enviat un correu a <b>${e}</b>. Obre l’enllaç que hi ha per confirmar que és teu i torna aquí.</p>
    ${note}
    <div class="ml-form"><button class="btn btn-primary" data-act="mail-verified" ${m.busy ? 'disabled' : ''}>Ja l’he confirmat</button></div>
    <p class="muted" style="font-size:12.5px">No el trobes? Mira la carpeta de correu brossa o de promocions. Arriba des de noreply@cor-present.firebaseapp.com.</p>
    <div class="ml-links"><button class="btn btn-sm btn-ghost" data-act="mail-resend">Torna a enviar el correu</button><button class="btn btn-sm btn-ghost" data-act="mail-out">Entra amb un altre compte</button></div>`;
  if (m.step === 'reset') return `<h2 class="h2">Recupera la contrasenya</h2>
    <p>T’enviarem un correu amb un enllaç per posar-ne una de nova.</p>
    <form class="ml-form" id="ml-form" novalidate>${emailField}${note}
      <button class="btn btn-primary" type="submit" ${m.busy ? 'disabled' : ''}>Envia’m el correu</button></form>
    <div class="ml-links"><button class="btn btn-sm btn-ghost" data-act="mail-step" data-step="signin">Ja me’n recordo</button>${back}</div>`;
  if (m.step === 'create') return `<h2 class="h2">Crea la teva contrasenya</h2>
    <p>Fes servir el correu que has donat a la teva agrupació. Després t’enviarem un correu per confirmar-lo.</p>
    <form class="ml-form" id="ml-form" novalidate>${emailField}
      <label class="field"><span>Contrasenya nova</span><input class="inp" id="ml-pass" type="password" autocomplete="new-password" minlength="8" required><small>Almenys 8 caràcters.</small></label>
      <label class="field"><span>Repeteix-la</span><input class="inp" id="ml-pass2" type="password" autocomplete="new-password" minlength="8" required></label>
      ${note}<button class="btn btn-primary" type="submit" ${m.busy ? 'disabled' : ''}>Crea el compte</button></form>
    <div class="ml-links"><button class="btn btn-sm btn-ghost" data-act="mail-step" data-step="signin">Ja tinc contrasenya</button>${back}</div>`;
  return `<h2 class="h2">Entra amb el teu correu</h2>
    <p>Per a correus que no són de Google: Hotmail, Outlook, iCloud, Yahoo, de la feina o de l’escola…</p>
    <form class="ml-form" id="ml-form" novalidate>${emailField}
      <label class="field"><span>Contrasenya</span><input class="inp" id="ml-pass" type="password" autocomplete="current-password" required></label>
      ${note}<button class="btn btn-primary" type="submit" ${m.busy ? 'disabled' : ''}>Entra</button></form>
    <div class="ml-links"><button class="btn btn-sm btn-ghost" data-act="mail-step" data-step="create">És el primer cop? Crea la teva contrasenya</button>
      <button class="btn btn-sm btn-ghost" data-act="mail-step" data-step="reset">He oblidat la contrasenya</button>${back}</div>`;
}
function mailMount(root) {
  const form = root.querySelector('#ml-form');
  if (form) form.onsubmit = ev => { ev.preventDefault(); mailSubmit(form); };
}
/** Ready to use the app: the account's email is confirmed, so the rules will let it in. */
async function mailDone() {
  try { await auth.currentUser.getIdToken(true); } catch {}
  forgetLink();
  location.reload();
}
async function sendVerification(user) {
  await user.sendEmailVerification({ url: backUrl() });
  try { localStorage.setItem(LS_VERIFY_AT, String(Date.now())); } catch {}
}
async function mailSubmit(form) {
  if (MAIL.busy) return;
  const email = (form.querySelector('#ml-email')?.value || '').trim().toLowerCase();
  const pass = form.querySelector('#ml-pass')?.value || '';
  const fail = msg => { MAIL = { ...MAIL, email, msg, ok: '', busy: false }; render(); };
  if (!EMAIL_RE.test(email)) return fail('Escriu el teu correu sencer, p. ex. nom@hotmail.com.');
  try { localStorage.setItem(LS_MAIL, email); } catch {}
  auth.languageCode = 'ca';
  MAIL = { ...MAIL, email, msg: '', ok: '', busy: true }; render();
  try {
    if (MAIL.step === 'reset') {
      await auth.sendPasswordResetEmail(email, { url: backUrl() });
      MAIL = { step: 'signin', email, msg: '', ok: `Si hi ha un compte amb <b>${esc(email)}</b>, t’hi arribarà un correu per posar una contrasenya nova. Mira també el correu brossa.` };
      return render();
    }
    if (MAIL.step === 'create') {
      if (pass.length < 8) return fail('La contrasenya ha de tenir almenys 8 caràcters.');
      if (pass !== (form.querySelector('#ml-pass2')?.value || '')) return fail('Les dues contrasenyes no coincideixen.');
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await sendVerification(cred.user);
      MAIL = { step: 'verify', email };
      return render();
    }
    if (!pass) return fail('Escriu la contrasenya.');
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    if (cred.user.emailVerified) return mailDone();
    MAIL = { step: 'verify', email, ok: 'Encara has de confirmar el correu. Si no trobes el missatge, torna-te’l a enviar.' };
    render();
  } catch (e) { fail(authMsg(e)); }
}
async function mailVerified() {
  const u = auth.currentUser;
  if (!u) { mailStart('signin'); return; }
  MAIL = { ...MAIL, busy: true, msg: '', ok: '' }; render();
  try { await u.reload(); } catch {}
  if (auth.currentUser && auth.currentUser.emailVerified) return mailDone();
  MAIL = { ...MAIL, busy: false, msg: 'Encara no consta com a confirmat. Obre l’enllaç del correu i torna-ho a provar.' };
  render();
}
async function mailResend() {
  const u = auth.currentUser;
  if (!u) { mailStart('signin'); return; }
  let last = 0;
  try { last = +localStorage.getItem(LS_VERIFY_AT) || 0; } catch {}
  if (Date.now() - last < 60000) { MAIL = { ...MAIL, msg: '', ok: 'Ja te l’acabem d’enviar. Espera un minut abans de demanar-ne un altre.' }; render(); return; }
  auth.languageCode = 'ca';
  try { await sendVerification(u); MAIL = { ...MAIL, msg: '', ok: `T’hem tornat a enviar el correu a <b>${esc(u.email || '')}</b>.` }; }
  catch (e) { MAIL = { ...MAIL, ok: '', msg: authMsg(e) }; }
  render();
}
async function signInGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cur = auth.currentUser;
    if (cur && cur.isAnonymous) {
      try { await cur.linkWithPopup(provider); }
      catch (e) {
        if (e.code === 'auth/credential-already-in-use' && e.credential) await auth.signInWithCredential(e.credential);
        else throw e;
      }
    } else {
      await auth.signInWithPopup(provider);
    }
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      forgetLink(); history.replaceState(null, '', location.pathname + location.search);
      await auth.signInWithRedirect(provider); return;
    }
    if (e.code === 'auth/account-exists-with-different-credential') toast('Aquest correu ja té contrasenya: toca «Entra amb un altre correu».');
    else if (e.code !== 'auth/popup-closed-by-user') toast('No s’ha pogut entrar amb Google. Torna-ho a provar.');
    try { localStorage.removeItem(LS_INTENT); } catch {}
    return;
  }
  forgetLink();
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}
async function signOut() {
  if (!await confirmSheet('Tancar la sessió?', 'Aquest mòbil deixarà d’estar connectat fins que tornis a entrar.', 'Tanca la sessió', false)) return;
  flushAll();
  forgetLink();
  try { localStorage.removeItem(LS_GROUPS); } catch {}
  try { await auth.signOut(); } catch {}
  location.replace(location.pathname);
}
init();
