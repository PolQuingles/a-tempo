// A Tempo · 03b-rols.js — L'app vista des de cada rol: el selector en obrir-la, les pestanyes de cada rol i el canvi de rol
// des d'Inici. El rol actiu (LENS i curLens, a 01-base) només canvia la pantalla: les dades que es llegeixen i els permisos
// de la base de dades són els del compte. Així cadascú veu només el que és de la seva feina, i qui té diversos rols en tria un.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Quins rols es poden triar ---------- */
// Es recorda mentre l'app és oberta (sessionStorage): cada cop que s'obre de nou, qui té diversos rols torna a triar.
// Es desa el rol i, si l'administració mira l'app com un rol que no té, la corda o el professor triats: «leader|S».
const SS_LENS = 'atempo:rol';
const lensKey = () => `${SS_LENS}:${GID || ''}:${S.email || ''}`;
function lensSaved() { try { return sessionStorage.getItem(lensKey()) || ''; } catch { return ''; } }
function lensSave(k) { try { k ? sessionStorage.setItem(lensKey(), k) : sessionStorage.removeItem(lensKey()); } catch {} }
const lensCode = (k, ctx = {}) => [k, ctx.sec || ctx.teacher || ''].filter(Boolean).join('|');
/** Els rols que té aquest compte, en l'ordre del selector. El de cantaire, només si té fitxa a la plantilla. */
function lensOptions() {
  const rs = rolesOf(S.me);
  return LENS_ORDER.filter(r => rs.includes(r) && (r !== 'singer' || (!!S.memberId && S.members.has(S.memberId))));
}
/** L'administració pot fer servir l'app com qualsevol rol (amb la corda o el professor que triï), no només els seus. */
const lensAll = () => S.role === 'edit' && hasRole(S.me, 'admin');
function lensAllOptions() {
  if (!lensAll()) return lensOptions();
  return LENS_ORDER.filter(r => (r !== 'singer' || (!!S.memberId && S.members.has(S.memberId))) && (r !== 'voice' || (classesOn() && classTeachers().length > 0)));
}
/** «Veure l'app com un cantaire»: per a tothom qui no ho és (o no té fitxa a la plantilla). */
const viewerOption = () => !lensOptions().includes('singer');
const validLens = k => k === 'viewer' ? viewerOption() : lensAllOptions().includes(k);
/** La corda o el professor amb què es fa servir un rol: el triat (si l'administració en tria un) o el del compte. */
function lensCtxFor(k, want = {}) {
  if (k === 'leader' || k === 'archive') {
    const own = hasRole(S.me, k) && SEC_MAP[S.me?.section] ? S.me.section : '';
    const sec = lensAll() && SEC_MAP[want.sec] ? want.sec : own || (lensAll() ? SECTIONS[0]?.id || '' : '');
    return sec && sec !== S.me?.section ? { sec } : {};
  }
  if (k === 'voice') {
    // Tots els professors: els que tenen compte, els que no, i els que ja tenen dies de classe (el personal es llegeix tard).
    const keys = classTeachers().map(t => t.key);
    const own = hasRole(S.me, 'voice') ? myEmail() : '';
    const teacher = lensAll() && keys.includes(want.teacher) ? want.teacher : own || (lensAll() ? keys[0] || '' : '');
    return teacher && teacher !== own ? { teacher } : {};
  }
  return {};
}
/** El nom i què fa cada rol, per al selector i per al canvi de rol. sec/teacher: la corda o el professor amb què es mira. */
function lensInfo(k, ctx = {}) {
  const secId = ctx.sec || S.me?.section;
  const sec = secId && SEC_MAP[secId] ? SEC[secId].name : '';
  const tName = ctx.teacher ? fullName(classTeachers().find(t => t.key === ctx.teacher)?.name || teacherName(ctx.teacher) || '') : '';
  switch (k) {
    case 'singer': return [V.Member, `La teva assistència, els avisos d’absència, el calendari i el tauler${classesOn() && inClassesReal() ? `, i les ${V.classes.toLowerCase()}` : ''}.`];
    case 'leader': return [`${capz(V.leader)}${sec ? ` · ${sec}` : ''}`, `Passa llista${sec ? ` de ${sec.toLowerCase()}` : ''} i respon-ne les absències.`];
    case 'archive': return [`Arxiver${sec ? ` · ${sec}` : ''}`, 'Reparteix i recull les partitures, i porta el repertori.'];
    case 'voice': return [`${V.Teacher}${tName ? ` · ${tName}` : ''}`, `${tName ? 'Les seves' : 'Les teves'} ${V.classes.toLowerCase()}: la llista, el calendari i els alumnes.`];
    case 'director': return ['Director', 'L’assistència de tothom, el calendari i el tauler.'];
    case 'gerencia': return ['Gerència', 'Les estadístiques, el calendari, el tauler i la gestió.'];
    case 'secretaria': return ['Secretaria', 'El personal, les altes i baixes, els documents i les quotes.'];
    case 'admin': return ['Administració', 'Tota l’app: llistes, estadístiques, gestió i ajustos.'];
    case 'viewer': return [`Veure l’app com un ${V.member}`, 'El calendari, el tauler, els anuncis i els documents.'];
    default: return ['Tots els rols', 'Tot el que pots fer, junt.'];
  }
}
// Al selector, la classe de cantaire es mira al compte (no al rol actiu, que encara no hi és).
const inClassesReal = () => !!S.memberId && classDays().some(c => (c.slots || []).some(x => x.memberId === S.memberId));
const LENS_ICONS = {
  singer: '<path d="M9 18V6.5l10-2.5v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  leader: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8"/>',
  archive: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M15 3.5v3h3M9 11h6M9 14h6M9 17h4"/>',
  voice: '<path d="M12 6.6c-2-1.5-4-2-6.5-2v12c2.5 0 4.5.5 6.5 2 2-1.5 4-2 6.5-2v-12c-2.5 0-4.5.5-6.5 2Z"/><path d="M12 6.6v12"/>',
  director: '<path d="M4 20 14.5 9.5M14.5 9.5l2-5 3 3-5 2z"/><path d="M4 20l1.5-4.5"/>',
  gerencia: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>',
  secretaria: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  admin: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  viewer: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
};

/* ---------- Triar-ne un ---------- */
/** Posa el rol (i la corda o el professor) d'un codi desat o de l'adreça: «leader», «leader|S», «voice|correu». */
function applyLensCode(code) {
  const [k, extra] = String(code || '').split('|');
  if (!validLens(k)) return false;
  LENS = k;
  LENS_CTX = lensCtxFor(k, k === 'voice' ? { teacher: extra } : { sec: extra });
  return true;
}
/** Abans de pintar: el rol de la sessió (el de l'avís que l'ha obert, el triat abans o l'únic que té). Amb diversos rols i
 *  cap de triat, LENS es queda a null i es pinta el selector. */
function ensureLens() {
  if (PREVIEW || S.mode !== 'shared' || !S.ready) return;
  if (LENS && (LENS === 'tot' ? !S.me : validLens(LENS))) return;
  LENS = null; LENS_CTX = {};
  // ?rol=… (l'obre un avís del mòbil): una sola vegada; després, el rol queda triat per a la sessió i es treu de l'adreça.
  const q = new URLSearchParams(location.search).get('rol');
  if (q) {
    dropLensParam();
    if (applyLensCode(q)) { lensSave(lensCode(LENS, LENS_CTX)); return; }
  }
  if (applyLensCode(lensSaved())) return;
  if (!S.me) { LENS = 'tot'; return; }
  const opts = lensOptions();
  if (opts.length === 1) applyLensCode(opts[0]);
  else if (!opts.length) LENS = 'viewer';
}
function dropLensParam() {
  const u = new URLSearchParams(location.search);
  if (!u.has('rol')) return;
  u.delete('rol');
  const qs = u.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}
// La benvinguda (maybeWelcome) espera que s'hagi triat el rol: si no, sortiria a sobre del selector.
const LENS_WELCOME = { pending: false };
const lensPicking = () => !PREVIEW && S.mode === 'shared' && S.ready && LENS === null;
/** Canvia de rol (amb la corda o el professor, si se'n tria): l'app torna a Inici, amb les pestanyes del rol nou. */
function setLens(k, want = {}) {
  if (!validLens(k)) return;
  LENS = k; LENS_CTX = lensCtxFor(k, want);
  lensSave(lensCode(k, LENS_CTX)); dropLensParam();
  ui.tab = 'avisos'; ui.rollSec = null; ui.att = attTabKeys()[0] || 'llista'; ui.clWho = null; ui.sessionId = null; ui.clMonth = null; ui.clDay = null;
  if (curLens() === 'leader' && ME()?.section) ui.section = ME().section;
  document.body.classList.toggle('ro', !canEdit());
  closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 });
  if (LENS_WELCOME.pending) { LENS_WELCOME.pending = false; setTimeout(maybeWelcome, 300); }
}
/** La pantalla d'entrada per a qui té més d'un rol: els seus (l'administració en pot triar d'altres des d'Inici). */
function viewLensPick() {
  const name = fullName(S.me?.name || S.userName || '');
  const first = firstName(name);
  const opts = [...lensOptions(), ...(viewerOption() ? ['viewer'] : [])];
  const logo = shownLogo();
  return `<section class="lens-pick">
    <div class="lp-head">${logo ? `<img class="lp-logo" src="${esc(logo)}" alt="">` : ''}
      <div class="eyebrow">${esc(shownName() || '')}</div>
      <h1 class="h1">Hola${first ? `, ${esc(first)}` : ''}</h1>
      <p class="lp-sub">Amb quin rol vols entrar? El pots canviar sempre des d’Inici.</p></div>
    <div class="lp-list">${opts.map(k => lensButton(k, false)).join('')}</div>
  </section>`;
}
const isCurLens = (k, ctx = {}) => curLens() === k && (LENS_CTX.sec || '') === (ctx.sec || '') && (LENS_CTX.teacher || '') === (ctx.teacher || '');
function lensButton(k, cur, ctx = {}) {
  const [t, sub] = lensInfo(k, ctx);
  const data = ctx.sec ? ` data-sec="${esc(ctx.sec)}"` : ctx.teacher ? ` data-teacher="${esc(ctx.teacher)}"` : '';
  return `<button class="lp-opt${k === 'viewer' ? ' lp-viewer' : ''}${cur ? ' is-cur' : ''}" data-act="lens" data-k="${k}"${data}${cur ? ' aria-current="true"' : ''}>
    <span class="lp-i"><svg viewBox="0 0 24 24" aria-hidden="true">${LENS_ICONS[k] || LENS_ICONS.viewer}</svg></span>
    <span class="lp-t"><b>${esc(t)}</b><small>${esc(sub)}</small></span>${cur ? '<span class="lp-now">Ara</span>' : ICON.right}</button>`;
}
/** A dalt d'Inici: amb quin rol s'és ara i, si n'hi ha més, el botó per canviar-lo. */
function lensBar() {
  if (PREVIEW || !lensOn()) return '';
  const opts = [...lensAllOptions(), ...(viewerOption() ? ['viewer'] : [])];
  if (opts.length < 2) return '';
  const [t] = lensInfo(curLens(), LENS_CTX);
  const other = lensAll() && !hasRole(S.me, curLens()) && curLens() !== 'viewer';
  return `<div class="lens-bar"><span class="lb-i"><svg viewBox="0 0 24 24" aria-hidden="true">${LENS_ICONS[curLens()] || ''}</svg></span>
    <span class="lb-t"><small>${other ? 'Fas servir l’app com a' : 'Ets aquí com a'}</small><b>${esc(t)}</b></span>
    <button class="btn btn-sm" data-act="lens-pick">Canvia de rol</button></div>`;
}
/** Canvia de rol. L'administració, a sota dels seus, té tots els altres: el cap de corda i l'arxiver de cada corda i cada
 *  professor de cant. Amb qualsevol d'ells pot fer tot el que faria aquella persona. */
function sheetLens() {
  const own = [...lensOptions(), ...(viewerOption() ? ['viewer'] : [])];
  const mine = own.map(k => lensButton(k, isCurLens(k)));
  let others = '';
  if (lensAll()) {
    const rows = [];
    for (const k of lensAllOptions()) {
      if (k === 'leader' || k === 'archive') {
        for (const x of SECTIONS) if (!(hasRole(S.me, k) && x.id === S.me.section)) rows.push(lensButton(k, isCurLens(k, { sec: x.id }), { sec: x.id }));
      } else if (k === 'voice') {
        for (const t of classTeachers()) if (!(hasRole(S.me, 'voice') && t.key === myEmail())) rows.push(lensButton(k, isCurLens(k, { teacher: t.key }), { teacher: t.key }));
      } else if (!own.includes(k)) rows.push(lensButton(k, isCurLens(k)));
    }
    if (rows.length) others = `<div class="section-title" style="margin-top:18px"><h2 class="h2">Tots els altres rols</h2></div>
      <p class="muted" style="margin:0 2px 8px;font-size:calc(13px*var(--ts))">Com a administració, pots fer servir l’app com qualsevol rol: hi veus el mateix i hi pots fer el mateix.</p>
      <div class="lp-list lp-compact">${rows.join('')}</div>`;
  }
  openSheet({
    title: 'Canvia de rol',
    body: `<p style="margin-top:0">Cada rol té les pestanyes de la seva feina.</p><div class="lp-list">${mine.join('')}</div>${others}`,
  });
}

/* ---------- Les pestanyes de cada rol ---------- */
/** Les pestanyes del rol actiu (null amb tots els rols: les d'abans, vegeu tabsForRole). */
function lensTabs() {
  switch (curLens()) {
    case 'singer': return ['avisos', 'llista', 'calendari', 'tauler', ...(classesOn() && inClasses() ? ['classes'] : [])];
    case 'viewer': return ['avisos', 'calendari', 'tauler'];
    case 'leader': return ['avisos', 'llista'];
    case 'archive': return ['avisos', 'partitures'];
    case 'voice': return ['avisos', 'llista', 'calendari', 'alumnes'];
    case 'director': return ['avisos', 'llista', 'calendari', 'tauler'];
    case 'gerencia': return ['avisos', 'llista', 'calendari', 'tauler', 'gestio'];
    case 'secretaria': return ['avisos', 'gestio', 'tauler'];
    case 'admin': return ['avisos', 'llista', 'calendari', 'tauler', ...(classesOn() ? ['classes'] : []), 'gestio'];
    default: return null;
  }
}
/** Gestió: una pestanya de l'administració, la gerència i la secretaria; amb tots els rols, de qui edita (com abans). */
const gestioOn = () => lensOn() ? ['admin', 'gerencia', 'secretaria'].includes(curLens()) : canEdit();
/** Les parts de Gestió de cada rol. Les absències les responen a Assistència els caps de corda, la direcció i l'administració. */
function gestioTabs() {
  switch (curLens()) {
    case 'admin': return ['personal', 'produccions', 'config'];
    case 'gerencia': return ['personal', 'produccions'];
    case 'secretaria': return ['personal'];
    default: return ['avisos', 'personal', 'produccions', 'config'];
  }
}
/** Les parts d'Assistència de cada rol: passar llista, estadístiques, risc i absències. */
const ATT_BY_LENS = { admin: ['llista', 'stats', 'risk', 'abs'], leader: ['llista', 'stats', 'abs'], director: ['stats', 'risk', 'abs'], gerencia: ['stats', 'risk'], tot: ['llista', 'stats', 'risk'] };
const attTabKeys = () => ATT_BY_LENS[curLens()] || ['llista'];
/** El cap de corda només porta la seva corda: la llista, les estadístiques i les absències són d'aquesta. */
const lensSection = () => curLens() === 'leader' && ME()?.section && SEC_MAP[ME().section] ? ME().section : null;

/* ---------- Les absències de cada rol ---------- */
/** Qui respon els avisos d'absència: el cap de corda, els de la seva corda; la direcció i l'administració, tots.
 *  Amb tots els rols, com abans: qui edita, tots. */
const absencesOn = () => lensOn() ? ['leader', 'director', 'admin'].includes(curLens()) : canEdit();
function absencesForMe(list) {
  if (!absencesOn()) return [];
  const sec = lensSection();
  return sec ? list.filter(a => (S.members.get(a.memberId)?.section || a.section) === sec) : list;
}
const myPendingAbsences = () => absencesForMe(pendingAbsences());
