// A Tempo · 03b-rols.js — Què veu cadascú: les pestanyes, les parts de Gestió, d'Assistència i de Classes, i les absències
// que respon. Ningú no tria cap rol: cadascú veu l'app amb tots els seus rols alhora, i les pestanyes i el que hi pot fer són
// la suma dels de cada rol. Les dades que es llegeixen i els permisos de la base de dades són els del compte.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Les pestanyes ---------- */
// Les de cada rol, que se sumen:
//  · cantaire (qui té fitxa a la plantilla): Inici · Assistència (la seva) · Calendari · Tauler · Classes (si en fa)
//  · cap de corda: Assistència (la seva corda) · arxiver: Tauler (l'arxiu de partitures és dins del Repertori)
//  · professor de cant: Classes (la llista de cada dia i els alumnes) · Calendari
//  · direcció i gerència: Assistència (tot el cor) · Calendari · Tauler · Gestió (Personal, Produccions i Ajustos)
//  · secretaria: Tauler · Gestió (Personal) · administració: totes
const TAB_ORDER = ['avisos', 'llista', 'calendari', 'tauler', 'classes', 'gestio'];
const BAR_MAX = 5;
/** Totes les pestanyes d'aquesta persona, en l'ordre de la barra. */
function roleTabs() {
  const t = new Set(['avisos']);
  const add = (...ks) => ks.forEach(k => t.add(k));
  if (myId()) { add('llista', 'calendari', 'tauler'); if (classesOn() && inClasses()) add('classes'); }
  if (leadSec()) add('llista');
  if (iHave('archive')) add('tauler');
  if (iHave('voice') && classesOn()) add('classes', 'calendari');
  if (S.role === 'edit') {
    if (['director', 'gerencia'].some(iHave)) add('llista', 'calendari', 'tauler', 'gestio');
    if (iHave('secretaria')) add('tauler', 'gestio');
    if (iHave('admin')) { add('llista', 'calendari', 'tauler', 'gestio'); if (classesOn()) add('classes'); }
  }
  // Sense fitxa a la plantilla ni cap feina (un compte que encara no en té): el calendari i el tauler.
  if (t.size === 1) add('calendari', 'tauler');
  return TAB_ORDER.filter(k => t.has(k));
}
/** Les classes que la persona fa o dona (no les que només mira l'administració). */
const classesMine = () => inClasses() || iHave('voice');
/** Les pestanyes de la barra de baix: com a molt cinc. Si n'hi ha més, Gestió (o les classes de qui només les mira) va al menú
 *  del compte i, a l'ordinador, al menú lateral. */
function tabsForRole() {
  const out = roleTabs();
  for (const k of classesMine() ? ['gestio', 'classes'] : ['classes', 'gestio']) if (out.length > BAR_MAX && out.includes(k)) out.splice(out.indexOf(k), 1);
  return out;
}
/** Les pestanyes que no caben a la barra (vegeu tabsForRole). */
const moreTabs = () => { const bar = tabsForRole(); return roleTabs().filter(k => !bar.includes(k)); };

/* ---------- Gestió ---------- */
/** Gestió: de l'administració, la direcció, la gerència i la secretaria. */
const gestioOn = () => S.role === 'edit' && ['admin', 'director', 'gerencia', 'secretaria'].some(iHave);
/** Les parts de Gestió: l'administració, la direcció i la gerència les tenen totes; la secretaria, el Personal. A Ajustos, cadascú
 *  hi veu el que pot canviar (la identitat, l'accés i la privacitat són de l'administració). Les absències són a Assistència. */
const gestioTabs = () => PROD_ROLES.some(iHave) ? ['personal', 'produccions', 'config'] : ['personal'];

/* ---------- Assistència: la meva, la de la corda i la de tot el cor ---------- */
/** La corda que porta com a cap de corda (si en porta cap). */
const leadSec = () => { const me = ME(); return canEdit() && hasRole(me, 'leader') && SEC_MAP[me?.section] ? me.section : null; };
// El que es mira de tot el cor, per rol: l'administració hi passa llista; la direcció hi respon les absències.
const ATT_ALL = { admin: ['llista', 'stats', 'risk', 'abs'], director: ['stats', 'risk', 'abs'], gerencia: ['stats', 'risk'] };
const attAllKeys = () => S.role !== 'edit' ? [] : ['llista', 'stats', 'risk', 'abs'].filter(k => Object.keys(ATT_ALL).some(r => iHave(r) && ATT_ALL[r].includes(k)));
/** Des d'on es pot mirar l'assistència: la pròpia («me»), la de la corda que porta («sec») i la de tot el cor («all»). */
function attAreas() {
  const out = [];
  if (myId()) out.push('me');
  if (leadSec()) out.push('sec');
  if (attAllKeys().length) out.push('all');
  return out;
}
/** L'àmbit que es mira ara: el triat o, de primeres, el de la feina (la corda, tot el cor) abans que el propi. */
function attArea() {
  const as = attAreas();
  if (as.includes(ui.attArea)) return ui.attArea;
  return as.includes('sec') ? 'sec' : as.includes('all') ? 'all' : as[0] || 'me';
}
/** Les parts d'Assistència de cada àmbit (passar llista, estadístiques, risc i absències): les de la corda, les de tot el cor
 *  que tenen els seus rols i, la pròpia, cap. */
const areaKeys = a => a === 'sec' ? ['llista', 'stats', 'abs'] : a === 'all' ? attAllKeys() : [];
const attTabKeys = () => areaKeys(attArea());
/** La corda de la qual es miren la llista, les estadístiques i les absències: només a l'àmbit de la corda. */
const areaSec = () => attArea() === 'sec' ? leadSec() : null;
/** El selector de dalt d'Assistència, per a qui en té més d'un: Jo · la corda · tot el cor. */
function attAreaPicker() {
  const as = attAreas();
  if (as.length < 2) return '';
  const cur = attArea();
  const name = k => k === 'me' ? 'Jo' : k === 'sec' ? SEC[leadSec()].name : capz(V.tot);
  return `<div class="seg3 att-area" role="radiogroup" aria-label="Quina assistència">${as.map(k => `<button type="button" role="radio" aria-checked="${cur === k}" data-act="att-area" data-k="${k}">${esc(name(k))}</button>`).join('')}</div>`;
}

/* ---------- Les absències que respon cadascú ---------- */
/** Qui respon els avisos d'absència: el cap de corda, els de la seva corda; la direcció i l'administració, tots. */
const absAll = () => S.role === 'edit' && ['director', 'admin'].some(iHave);
const absencesOn = () => absAll() || !!leadSec();
const absSec = a => S.members.get(a.memberId)?.section || a.section;
function absencesForMe(list) {
  if (absAll()) return list;
  const sec = leadSec();
  return sec ? list.filter(a => absSec(a) === sec) : [];
}
const myPendingAbsences = () => absencesForMe(pendingAbsences());
/** Les de Assistència › Absències: les de la corda (des de la corda) o totes les que respon (des de tot el cor). */
const areaAbsences = list => { const sec = areaSec(); return absencesForMe(list).filter(a => !sec || absSec(a) === sec); };
/** Des d'Inici, les absències per respondre s'obren a tot el cor si les respon totes; si no, a la seva corda. */
const absArea = () => absAll() && attAreas().includes('all') ? 'all' : 'sec';

/* ---------- Classes, per al professorat ---------- */
/** Qui només fa classes (sense fitxa a la plantilla ni cap altra feina): Inici i el Calendari són els de les seves classes. */
const teacherOnly = () => iHave('voice') && !myId() && !canEdit();
/** Les parts de Classes del professorat: la llista de cada dia i els alumnes (i totes les classes, si també en fa o les porta totes). */
const CL_TABS = [['llista', 'Assistència'], ['alumnes', 'Alumnes'], ['totes', 'Totes']];
const clTabKeys = () => iHave('voice') && classesOn() ? ['llista', 'alumnes', ...(inClasses() || isAdmin() ? ['totes'] : [])] : [];
const clTabs = () => { const keys = clTabKeys(); return `<div class="subtabs cl-tabs" role="tablist" style="grid-template-columns:repeat(${keys.length},1fr)">${CL_TABS.filter(([k]) => keys.includes(k)).map(([k, l]) => `<button class="subtab" role="tab" aria-selected="${ui.clTab === k}" data-act="cl-tab" data-k="${k}">${l}</button>`).join('')}</div>`; };

/* ---------- Enllaços d'abans ---------- */
// Fins a l'octubre del 2026 cadascú entrava amb un sol rol, i els avisos del mòbil obrien l'app amb ?rol=…: ja no cal, i es treu.
function dropRolParam() {
  const u = new URLSearchParams(location.search);
  if (!u.has('rol')) return;
  u.delete('rol');
  const qs = u.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}
