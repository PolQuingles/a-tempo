// A Tempo · 13-avisos-mobil.js — Avisos al mòbil (Web Push).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Avisos al mòbil (Web Push) ---------- */
const LS_PUSH = 'atempo:avis-id';
const LS_PUSH_AT = 'atempo:avis-refresc';
const LS_WELCOME = 'atempo:benvinguda';
const pushKinds = () => ({
  missatges: ['Missatges', `Els que t’envien el teu ${V.leader} o l’equip ${V.del}.`],
  anuncis: ['Anuncis nous', 'Quan l’equip publica alguna cosa al tauler.'],
  materials: ['Material nou', `Partitures, àudios i documents nous per a la teva ${V.section} i ${V.part}.`],
  convocatories: ['Convocatòries per confirmar', 'Si queda per respondre i s’acosta la data límit.'],
  enquestes: ['Enquestes', 'Quan n’hi ha una de nova i quan és a punt de tancar-se.'],
  absencies: ['Resposta als teus avisos', 'Quan t’accepten o no un avís d’absència.'],
  assajos: ['Recordatori d’assaig', `La vespra, amb la fitxa ${V.sh.del} si n’hi ha.`],
  ...(classesOn() ? { classes: [V.classes, `Avisos i canvis d’hora de les ${V.classes.toLowerCase()}.`] } : {}),
});
// Només per a qui edita: avisos sobre les seccions que porta.
const leaderKinds = () => ({
  llistes: ['Llista a mitges', 'Mitja hora després d’acabar l’assaig, si la llista no és completa.'],
  risc: [`${V.Members} en risc`, 'Quan algú baixa de la norma d’assistència.'],
});
const DEFAULT_PREFS = { missatges: true, anuncis: true, materials: true, convocatories: true, enquestes: true, absencies: true, assajos: false, llistes: true, risc: true, classes: true };
const LS_PUSH_PREFS = 'atempo:avis-prefs';
/** The sections a leader looks after: their own, from the account or from their roster record. */
function defaultCordes() {
  if (!canEdit()) return [];
  if (hasRole(S.me, 'leader') && S.me.section) return [S.me.section];
  const m = S.members.get(myId() || '');
  return m && m.leader ? [m.section] : [];
}
function savedPush() {
  try { return JSON.parse(lsGet(LS_PUSH_PREFS) || 'null'); } catch { return null; }
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!window.COR_PUSH_KEY;
const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/Android|Windows|Linux|CrOS/.test(navigator.userAgent));
const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isAndroid = () => /Android/.test(navigator.userAgent);
/** Chrome a l'Android ofereix instal·lar l'app: es guarda l'oferta per fer-la servir des del botó d'Inici. */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (typeof scheduleRender === 'function' && S.ready) scheduleRender(); });
window.addEventListener('appinstalled', () => { installPrompt = null; if (typeof scheduleRender === 'function' && S.ready) scheduleRender(); });
const deviceName = () => isiOS() ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : /Android/.test(navigator.userAgent) ? 'Android' : 'Ordinador';
const b64ToU8 = str => {
  const pad = '='.repeat((4 - str.length % 4) % 4);
  const raw = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const subKeyB64 = (sub, name) => {
  const b = sub.getKey(name);
  return b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
};
function pushId() {
  let id = null;
  try { id = localStorage.getItem(LS_PUSH); } catch {}
  if (!id) { id = newKey(); try { localStorage.setItem(LS_PUSH, id); } catch {} }
  return id;
}
let swReg = null;
async function ensureSW() {
  if (swReg) return swReg;
  swReg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  return swReg;
}
function pushRecord(sub, prefs, cordes) {
  const mid = myId();
  const m = mid && S.members.get(mid);
  return {
    uid: S.uid, email: (S.me && S.me.email) || '', memberId: mid || '', section: m ? m.section : '',
    name: m ? m.name : ((S.me && (S.me.name || S.me.email)) || ''),
    endpoint: sub.endpoint, p256dh: subKeyB64(sub, 'p256dh'), auth: subKeyB64(sub, 'auth'),
    prefs: { ...DEFAULT_PREFS, ...(prefs || {}) }, cordes: canEdit() ? (cordes || defaultCordes()) : [],
    device: deviceName(), at: new Date().toISOString(),
  };
}
/** Turn notifications on for this device. Returns a reason when it can't. */
async function enablePush(prefs, cordes) {
  if (!pushSupported()) return 'no-suport';
  if (isiOS() && !installed()) return 'ios';
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denegat' : 'cancel·lat';
    const reg = await ensureSW();
    const sub = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(window.COR_PUSH_KEY) });
    const rec = pushRecord(sub, prefs || S.pushPrefs, cordes || S.pushCordes);
    await db.doc(`push/${pushId()}`).set(rec);
    S.pushOn = true; S.pushPrefs = rec.prefs; S.pushCordes = rec.cordes;
    lsSet(LS_PUSH_PREFS, JSON.stringify({ prefs: rec.prefs, cordes: rec.cordes }));
    lsSet(LS_PUSH_AT, String(Date.now()));
    return null;
  } catch (e) { return 'error'; }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    // El navegador té una sola subscripció per a totes les agrupacions: només es treu la fitxa d'aquesta.
    await db.doc(`push/${pushId()}`).delete();
  } catch {}
  lsSet(LS_PUSH_PREFS, null);
  S.pushOn = false;
}
/** At boot: know whether this device is subscribed, and keep the record fresh (once a day). */
async function checkPush() {
  if (!pushSupported() || !db) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') { S.pushOn = false; scheduleRender(); return; }
    swReg = reg;
    let saved = savedPush();
    // Activats en aquesta agrupació si n'hi ha la preferència desada aquí o la fitxa de l'aparell.
    const snap = saved ? null : await db.doc(`push/${pushId()}`).get().catch(() => null);
    if (snap && snap.exists) saved = { prefs: snap.data().prefs, cordes: snap.data().cordes };
    if (!saved) { S.pushOn = false; scheduleRender(); return; }
    S.pushOn = true;
    S.pushPrefs = saved.prefs || S.pushPrefs; S.pushCordes = Array.isArray(saved.cordes) ? saved.cordes : S.pushCordes;
    const last = +lsGet(LS_PUSH_AT) || 0;
    if (Date.now() - last > 20 * 3600 * 1000) {
      await db.doc(`push/${pushId()}`).set(pushRecord(sub, S.pushPrefs, S.pushCordes));
      lsSet(LS_PUSH_AT, String(Date.now()));
    }
    scheduleRender();
  } catch {}
}
function sheetPush() {
  const blocked = Notification.permission === 'denied';
  const needsInstall = isiOS() && !installed();
  const prefs = { ...DEFAULT_PREFS, ...(S.pushPrefs || {}) };
  const kinds = Object.entries(pushKinds()).filter(([k]) => k !== 'absencies' || myId());
  const cordes = new Set(S.pushCordes || defaultCordes());
  const row = ([k, [l, d]]) => `<div class="toggle-row"><span><b>${l}</b><br><span class="muted" style="font-size:12.5px">${d}</span></span>
        <label class="switch"><input type="checkbox" id="pf-${k}" ${prefs[k] ? 'checked' : ''}><span></span></label></div>`;
  openSheet({
    title: 'Avisos al mòbil',
    body: `${needsInstall ? `<div class="sub-line sub-hint" style="margin:0 0 12px"><span>Al iPhone i al iPad, els avisos només funcionen si abans afegeixes l’app a la <b>pantalla d’inici</b>: al Safari, toca <b>Comparteix</b> i tria <b>Afegeix a la pantalla d’inici</b>. Després obre-la des d’allà.</span></div>` : ''}
      ${blocked ? `<div class="sub-line sub-hint" style="margin:0 0 12px"><span>Aquest navegador té els avisos <b>bloquejats</b>. Actíva’ls als ajustos del lloc web i torna-ho a provar.</span></div>` : ''}
      <p style="margin-top:0">Tria de què vols que t’avisi. Pots canviar-ho quan vulguis.</p>
      <div class="kv">${kinds.map(row).join('')}</div>
      ${canEdit() ? `<div class="section-title" style="margin:18px 0 6px"><h2 class="h2">Com a ${V.leader}</h2></div>
        <div class="kv">${Object.entries(leaderKinds()).map(row).join('')}
          <div class="field"><span>De quines ${V.sections}?</span><div class="pickers" id="pf-cordes">${SECTIONS.map(x => secPick(x, cordes.has(x.id))).join('')}</div>
            <small>Si no en tries cap, no rebràs aquests dos avisos.</small></div></div>` : ''}
      <p class="muted" style="font-size:12.5px">Els avisos surten d’aquest aparell. Si entres des d’un altre, actíva’ls també allà.</p>`,
    foot: `${S.pushOn ? '<button class="btn btn-danger-ghost" id="pu-off">Desactiva’ls</button>' : ''}<span class="spacer"></span>
      <button class="btn" data-act="sheet-close">Cancel·la</button>
      <button class="btn btn-primary" id="pu-on" ${blocked ? 'disabled' : ''}>${S.pushOn ? 'Desa' : 'Activa’ls'}</button>`,
    onMount: el => {
      el.querySelectorAll('#pf-cordes .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelector('#pu-on').onclick = async () => {
        const keys = [...kinds.map(([k]) => k), ...(canEdit() ? Object.keys(leaderKinds()) : [])];
        const chosen = Object.fromEntries(keys.map(k => [k, el.querySelector(`#pf-${k}`).checked]));
        if (!Object.values(chosen).some(Boolean)) { toast('Tria almenys una cosa'); return; }
        const pickedCordes = canEdit() ? $$('#pf-cordes .pick[aria-pressed="true"]', el).map(b => b.dataset.sec) : [];
        const err = await enablePush(chosen, pickedCordes);
        closeSheet();
        toast(err ? { ios: 'Abans afegeix l’app a la pantalla d’inici', denegat: 'El navegador té els avisos bloquejats', 'no-suport': 'Aquest navegador no els admet' }[err] || 'No s’han pogut activar' : 'Avisos activats');
        render();
      };
      el.querySelector('#pu-off')?.addEventListener('click', async () => {
        await disablePush(); closeSheet(); toast('Avisos desactivats'); render();
      });
    },
  });
}
