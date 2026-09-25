// A Tempo · 07-gestio.js — Gestió: pestanyes, Personal, primers passos, seccions, Ajustos i esborrar una agrupació.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Manage ---------- */
function viewManage() {
  const pend = pendingAbsences().length;
  if (ui.manage === 'cantaires') ui.manage = 'personal';   // es deia així abans
  const tabs = [['avisos', `Avisos${pend ? ` (${pend})` : ''}`], ['personal', 'Personal'], ['produccions', 'Produccions'], ['config', 'Ajustos']];
  // S'obre des del menú del compte: la fletxa torna a la pantalla d'on s'ha vingut.
  const from = tabsForRole().includes(ui.gestioFrom) ? ui.gestioFrom : 'avisos';
  const head = `<div class="page-head"><div class="ph-back"><button class="nav-arrow" data-act="tab" data-tab="${from}" aria-label="Torna a ${esc(TAB_LABEL[from])}">${ICON.left}</button><div><div class="eyebrow">El teu compte</div><h1 class="h1">Gestió</h1></div></div></div>
    <div class="subtabs" role="tablist" style="grid-template-columns:repeat(4,1fr)">${tabs.map(([k, l]) => `<button class="subtab" role="tab" aria-selected="${ui.manage === k}" data-act="manage" data-k="${k}" style="font-size:12.5px">${l}</button>`).join('')}</div>`;
  if (ui.manage === 'produccions') return head + manageProductions();
  if (ui.manage === 'config') return head + manageConfig();
  if (ui.manage === 'avisos') return head + manageAbsences();
  return head + managePeople();
}
/* ---------- Personal: la gent de l'agrupació, rol per rol ---------- */
// Al menú, la plantilla va primer (és la llista que més es mira) i els noms van en plural.
const PEOPLE_MENU = ['singer', 'admin', 'director', 'gerencia', 'secretaria', 'leader', 'voice'];
const rolePlural = r => ({ admin: 'Administració', director: 'Direcció', gerencia: 'Gerència', secretaria: 'Secretaria',
  leader: capz(V.leaders), singer: V.Members, voice: V.kind === 'cor' ? 'Professors de cant' : 'Professors' }[r] || roleLabel(r));
/** Qui té aquest rol. Els de la plantilla són tota la plantilla, tinguin compte o no. */
const peopleWithRole = r => peopleSorted().filter(p => hasRole(p, r));
const roleCount = r => r === 'singer' ? membersOf(null, true).filter(m => m.active !== false).length : peopleWithRole(r).length;
/** Una persona de l'equip, amb els seus rols i si ja ha entrat a l'app. */
function personRow(p) {
  const inside = isAdmin() ? `data-act="staff-edit" data-email="${esc(p.email)}"` : '';
  const state = p.lastSeen ? '' : p.invitedAt ? 'Convidat · encara no ha entrat' : 'Encara no ha entrat · sense convidar';
  return `<li class="li" data-find="${esc(normText(p.name || p.email))}"><button ${inside}>
    <span><span class="t">${esc(p.name || p.email)}</span> <span class="role-tag">${esc(roleSummary(p))}</span><br><span class="s mono">${esc(p.email)}</span>${state ? `<br><span class="s">${state}</span>` : ''}</span>
    ${isAdmin() ? `<span class="icon-btn" aria-hidden="true">${ICON.go}</span>` : ''}</button></li>`;
}
/** L'accés a l'app, a dalt de Personal: qui en té, qui ha entrat i les eines per donar-ne (administració). */
function accessPanel() {
  if (!isAdmin()) return '';
  const members = membersOf(null, true);
  const withAccount = members.filter(m => accountFor(m.id)).length;
  const r = accessReport();
  return `<div class="panel access-panel">
    <div class="setting"><div><div class="t">${withAccount} de ${members.length} ${esc(V.members)} tenen accés · ${r.inApp.length} han entrat${r.never.length ? `, ${r.never.length} encara no` : ''}</div>
      <div class="s">Afegeix cada persona un sol cop: el nom, el correu per entrar a l’app i què fa (si canta, també la ${esc(V.section)}). Si algú marxa, treu-li l’accés: el perd a l’instant, però no se n’esborra la fitxa ni les llistes.</div></div></div>
    <div class="access-acts"><button class="btn btn-sm btn-primary" data-act="staff-new" ${ROLE_KEYS.includes(ui.people) ? `data-role="${esc(ui.people)}"` : ''}>+ Persona</button><button class="btn btn-sm" data-act="staff-bulk">Enganxa una llista</button><button class="btn btn-sm" data-act="share-app">Enllaç de l’app</button>
      <button class="btn btn-sm" data-act="who-in">Qui ha entrat</button><button class="btn btn-sm ${mailProblems().length ? 'btn-primary' : ''}" data-act="mail-check">Comprova els correus${mailProblems().length ? ` (${mailProblems().length})` : ''}</button><button class="btn btn-sm" data-act="preview-on">Mira l’app com…</button></div>
  </div>`;
}
/** El menú de Personal: un desplegable amb cada rol (i quants n'hi ha) i, dins de la plantilla, les seves quatre llistes. */
const CANT_TABS = () => [['plantilla', 'Plantilla'], ['altes', 'Altes i baixes'], ...(canDocs() ? [['docs', 'Documents'], ['quotes', 'Quotes']] : [])];
function peopleMenu(role) {
  const opts = [['singer', rolePlural('singer'), roleCount('singer')], ...(isAdmin() ? [['access', 'Amb accés a l’app', S.staff.size]] : []),
    ...PEOPLE_MENU.filter(k => k !== 'singer').map(k => [k, rolePlural(k), roleCount(k)])];
  const sel = `<div class="filters people-filters"><label class="sel sel-big"><span class="sr">Mostra</span><select id="people-menu" data-pick="people-role">${opts.map(([k, l, n]) =>
    `<option value="${k}" ${role === k ? 'selected' : ''}>${esc(l)}${S.staffReady || k === 'singer' ? ` · ${n}` : ''}</option>`).join('')}</select></label></div>`;
  if (role !== 'singer') return sel;
  const tabs = CANT_TABS();
  return sel + `<div class="subtabs cant-tabs" role="tablist" aria-label="${esc(V.Members)}" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map(([k, l]) =>
    `<button class="subtab" role="tab" aria-selected="${ui.cantTab === k}" data-act="cant-tab" data-k="${k}">${l}</button>`).join('')}</div>`;
}
function managePeople() {
  ensureStaff();
  // Abans, altes, documents i quotes eren al mateix menú que els rols.
  if (['altes', 'docs', 'quotes'].includes(ui.people)) { ui.cantTab = ui.people; ui.people = 'singer'; }
  if (!ROLE_KEYS.includes(ui.people) && ui.people !== 'access') ui.people = 'singer';
  if (!CANT_TABS().some(([k]) => k === ui.cantTab)) ui.cantTab = 'plantilla';
  const role = ui.people;
  const menu = peopleMenu(role);
  if (role === 'singer') {
    if (ui.cantTab === 'altes') return accessPanel() + menu + manageHistory();
    if (ui.cantTab === 'docs') return accessPanel() + menu + manageDocs();
    if (ui.cantTab === 'quotes') return accessPanel() + menu + manageFees();
    return accessPanel() + menu + `<div class="sec-h" style="margin:4px 0 0"><span class="muted" style="font-size:calc(13px*var(--ts))">Tota la plantilla, amb l’antiguitat i la fitxa de cadascú.</span><button class="btn btn-sm" data-act="roster-export">Exporta a Excel</button></div>` + manageMembers();
  }
  if (role === 'access') {
    const people = peopleSorted();
    return `${accessPanel()}${menu}<p class="muted" style="margin:4px 2px 10px;font-size:calc(13px*var(--ts))">Tothom qui pot entrar a l’app, amb els seus rols. Toca una persona per canviar-li els rols o el correu, convidar-la o treure-li l’accés.</p>
      ${people.length ? `<ul class="list">${people.map(personRow).join('')}</ul>` : '<div class="empty"><p>Encara no hi ha ningú. Afegeix les persones una per una o enganxa’n una llista.</p></div>'}`;
  }
  const list = peopleWithRole(role);
  const add = isAdmin() ? `<button class="btn btn-sm btn-primary" data-act="staff-new" data-role="${role}">+ Persona</button>` : '';
  const what = {
    admin: 'Ho poden fer tot: donar accés, canviar dades i esborrar.',
    director: `Passa llista, publica anuncis i convocatòries i puja materials.`,
    gerencia: 'Passa llista, publica anuncis i convocatòries i puja materials i documents.',
    secretaria: 'Passa llista, publica anuncis i convocatòries i puja materials i documents.',
    leader: `Cada ${V.leader} porta una ${V.section}: hi passa llista i en rep els avisos.`,
    voice: `Porta les ${V.classes.toLowerCase()}: en fa el calendari i rep els avisos dels ${V.members}.`,
  }[role] || '';
  return `${accessPanel()}${menu}<div class="sec-h" style="margin-top:4px"><span class="muted" style="font-size:calc(13px*var(--ts))">${esc(what)}</span>${add}</div>
    ${list.length ? `<ul class="list">${list.map(personRow).join('')}</ul>`
      : `<div class="empty"><p>Encara no hi ha ningú amb el rol de ${esc(roleLabel(role).toLowerCase())}.${isAdmin() ? ' Afegeix-la amb «+ Persona»: el nom, el correu i el rol, tot d’una.' : ''}</p></div>`}
    <p class="muted" style="margin:10px 2px 0;font-size:calc(13px*var(--ts))">Una persona pot tenir més d’un rol i, per tant, sortir a més d’una llista.</p>`;
}
function leaveText(m) {
  const now = onLeave(m, TODAY);
  if (now) return `De baixa${now.to ? ` fins al ${ddmm(now.to)}` : ''}`;
  const next = (m.leaves || []).filter(l => l.from > TODAY).sort((a, b) => a.from.localeCompare(b.from))[0];
  return next ? `Baixa prevista des del ${ddmm(next.from)}` : '';
}
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
const findBox = (target, ph) => `<label class="find">${SEARCH_ICON}<input class="inp" type="search" inputmode="search" autocomplete="off" placeholder="${ph}" data-bind="find" data-target="${target}" aria-label="${ph}"></label>`;
function manageMembers() {
  const secs = SECTIONS.map(x => {
    const ms = membersOf(x.id, true);
    const active = ms.filter(m => m.active !== false).length;
    return `<section data-group="${x.id}"><div class="sec-h"><h2 class="h2"><em>${esc(x.short)}</em>${esc(x.name)} <span class="mono muted" style="font-size:calc(13px*var(--ts));font-weight:400">${active}</span></h2>
      <span style="display:flex;gap:4px"><button class="btn btn-sm btn-ghost" data-act="member-new" data-sec="${x.id}">Afegeix</button></span></div>
      ${ms.length ? `<ul class="list">${ms.map(m => {
        const lv = leaveText(m);
        const acc = isAdmin() && m.active !== false ? accountFor(m.id) : null;
        const accTag = !isAdmin() || m.active === false ? '' : !acc ? ' <span class="acc-tag">Sense accés</span>' : !acc.lastSeen ? ' <span class="acc-tag">No ha entrat</span>' : '';
        return `<li class="li" data-find="${esc(normText(m.name))}"><button data-act="member-edit" data-mid="${m.id}">
        <span class="${m.active === false ? 'dim' : ''}"><span class="t">${esc(m.name)}</span>${m.part ? ` <span class="part">${esc(partTag(m))}</span>` : ''}${m.leader ? ` <span class="tag">${V.Leader}</span>` : ''}${accTag}
        ${m.active === false ? '<br><span class="s">Inactiu</span>' : lv ? `<br><span class="s">${lv}</span>` : m.phone ? `<br><span class="s mono">${esc(m.phone)}</span>` : ''}</span>
        <span class="icon-btn" aria-hidden="true">${ICON.go}</span></button></li>`;
      }).join('')}</ul>`
        : `<div class="panel" style="padding:14px;color:var(--muted);font-size:calc(13.5px*var(--ts))">Encara no hi ha ningú en aquesta ${V.section}.</div>`}</section>`;
  }).join('');
  // A l'ordinador, la mateixa plantilla en una taula: nom, veu o part, estat, accés i telèfon.
  const admin = isAdmin();
  const table = `<div class="only-wide table-wrap"><table class="dtable"><thead><tr><th>Nom</th><th>${esc(V.Part)}</th><th>Estat</th>${admin ? '<th>Accés a l’app</th>' : ''}<th>Telèfon</th></tr></thead>
    ${SECTIONS.map(x => {
      const ms = membersOf(x.id, true);
      return `<tbody data-group="${x.id}"><tr class="grp"><td colspan="${admin ? 5 : 4}"><em>${esc(x.short)}</em>${esc(x.name)} <span class="m" style="font-weight:500">· ${ms.filter(m => m.active !== false).length}</span><button class="btn btn-sm btn-ghost" data-act="member-new" data-sec="${x.id}">Afegeix</button></td></tr>
        ${ms.map(m => {
          const acc = admin ? accountFor(m.id) : null;
          const state = m.active === false ? 'Inactiu' : leaveText(m) || 'Actiu';
          const access = !admin ? '' : m.active === false ? '' : !acc ? '<span class="acc-tag">Sense accés</span>' : !acc.lastSeen ? '<span class="acc-tag">No ha entrat</span>' : `<span class="m">${esc(acc.email)}</span>`;
          return `<tr data-act="member-edit" data-mid="${m.id}" data-find="${esc(normText(m.name))}" ${m.active === false ? 'style="opacity:.55"' : ''}>
            <td><b>${esc(m.name)}</b>${m.leader ? ` <span class="tag">${V.Leader}</span>` : ''}</td><td>${m.part ? `<span class="part">${esc(partTag(m))}</span>` : ''}</td>
            <td class="m">${esc(state)}</td>${admin ? `<td>${access}</td>` : ''}<td class="m mono">${esc(m.phone || '')}</td></tr>`;
        }).join('') || `<tr><td colspan="${admin ? 5 : 4}" class="m">Encara no hi ha ningú en aquesta ${V.section}.</td></tr>`}</tbody>`;
    }).join('')}</table></div>`;
  return `${onboardingPanel()}<div id="mlist">${findBox('#mlist', `Cerca un ${V.member}`)}<div class="only-narrow">${secs}</div>${table}<div class="panel find-empty" hidden>Ningú amb aquest nom.</div></div>`;
}
function manageProductions() {
  const ps = productionsSorted();
  return `<div class="sec-h"><span class="muted" style="font-size:calc(13.5px*var(--ts))">${ps.length} produccions</span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="season-report">Memòria de la temporada</button><button class="btn btn-sm btn-primary" data-act="prod-new">+ Producció</button></span></div>
    ${ps.length ? `<div class="only-narrow" style="display:grid;gap:10px">${ps.map(p => {
      const ss = allSessions(p.id);
      const shared = ss.filter(s => s.prodId !== p.id).length;
      const past = ss.filter(s => s.date <= TODAY).length;
      const status = p.end && p.end < TODAY ? 'Acabada' : p.start > TODAY ? 'Propera' : 'En curs';
      return `<div class="panel prod-card prod-tone tinted" style="--ph:${prodHue(p)}"><button data-act="prod-edit" data-pid="${p.id}" style="width:100%;text-align:left">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h2 class="h2"><i class="pdot"></i>${esc(p.name)}</h2><span class="badge ${status === 'En curs' ? '' : 'soft'}">${status}</span></div>
        <div class="prod-meta"><span>${p.start ? shortDate(p.start) : '?'} – ${p.end ? shortDate(p.end) : '?'}</span><span><b>${ss.length}</b> sessions${shared ? ` (${shared} compartides)` : ''} · <b>${past}</b> fetes</span><span><b>${(p.excluded || []).length}</b> no la fan</span></div>
      </button></div>`;
    }).join('')}</div>
    <div class="only-wide table-wrap"><table class="dtable"><thead><tr><th>Producció</th><th>Dates</th><th class="n">Sessions</th><th class="n">Fetes</th><th class="n">No la fan</th><th>Estat</th></tr></thead><tbody>
      ${ps.map(p => {
        const ss = allSessions(p.id);
        const shared = ss.filter(s => s.prodId !== p.id).length;
        const status = p.end && p.end < TODAY ? 'Acabada' : p.start > TODAY ? 'Propera' : 'En curs';
        return `<tr data-act="prod-edit" data-pid="${p.id}"><td class="prod-tone" style="--ph:${prodHue(p)}"><i class="pdot"></i> <b>${esc(p.name)}</b></td>
          <td class="m">${p.start ? shortDate(p.start) : '?'} – ${p.end ? shortDate(p.end) : '?'}</td><td class="n">${ss.length}${shared ? ` <span class="m">(${shared} compartides)</span>` : ''}</td>
          <td class="n">${ss.filter(s => s.date <= TODAY).length}</td><td class="n">${(p.excluded || []).length}</td><td><span class="badge ${status === 'En curs' ? '' : 'soft'}">${status}</span></td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty"><p>Crea la primera producció (p. ex. «Concert de Nadal») i genera’n les sessions d’assaig.</p></div>`}`;
}
function absenceCard(a, opts = {}) {
  const m = S.members.get(a.memberId);
  const dates = (a.sessionIds || []).map(sessionById).filter(Boolean).sort((x, y) => x.date.localeCompare(y.date));
  const label = { pending: 'Pendent', accepted: 'Acceptat', rejected: 'Rebutjat' }[a.status];
  const what = a.kind === 'late' ? `Arribarà tard${a.min ? ` (~${a.min}′)` : ''}` : 'No vindrà';
  let btns = '';
  if (opts.staff && canEdit()) {
    btns = a.status === 'pending'
      ? `<button class="btn btn-sm btn-primary" data-act="abs-accept" data-aid="${a.id}">Accepta</button><button class="btn btn-sm" data-act="abs-reject" data-aid="${a.id}">Rebutja</button>`
      : `<button class="btn btn-sm btn-danger-ghost" data-act="abs-delete" data-aid="${a.id}">Esborra</button>`;
  } else if (opts.mine && a.status === 'pending') {
    btns = `<button class="btn btn-sm btn-danger-ghost" data-act="abs-cancel" data-aid="${a.id}">Retira l’avís</button>`;
  }
  return `<div class="abs-card">
    <div class="a-h"><span><b>${esc(m?.name || a.memberName || '—')}</b> <span class="muted">· ${esc(SEC[a.section]?.name || '')} · ${what}</span></span><span class="st-pill st-${a.status}">${label}</span></div>
    <div class="a-d">${dates.map(s => `<span>${wdShort(s.date)} ${ddmm(s.date)}</span>`).join('') || '<span>Sessió esborrada</span>'}</div>
    ${a.reason ? `<div class="a-r">${esc(a.reason)}</div>` : ''}
    <div class="muted mono" style="font-size:calc(12px*var(--ts))">Enviat el ${a.createdAt ? (d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)} a les ${pad(d.getHours())}:${pad(d.getMinutes())}`)(new Date(a.createdAt)) : '—'}</div>
    ${btns ? `<div class="a-b">${btns}</div>` : ''}
  </div>`;
}
function manageAbsences() {
  const all = [...S.absences.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const list = all.filter(a => ui.absFilter === 'all' || a.status === 'pending');
  return `<div class="sec-h"><div class="pickers">
      <button class="pick" aria-pressed="${ui.absFilter !== 'all'}" data-act="abs-filter" data-k="pending">Pendents</button>
      <button class="pick" aria-pressed="${ui.absFilter === 'all'}" data-act="abs-filter" data-k="all">Tots</button></div>
    <button class="btn btn-sm btn-primary" data-act="absence-new">+ Nou avís</button></div>
    ${list.length ? `<div class="panel">${list.map(a => absenceCard(a, { staff: true })).join('')}</div>`
      : `<div class="panel" style="padding:16px;font-size:calc(13.5px*var(--ts));color:var(--muted)">${ui.absFilter === 'all' ? 'Encara no hi ha cap avís.' : 'No hi ha avisos pendents.'} Cada ${V.member} amb accés pot avisar des d’Inici.</div>`}`;
}
const BRAND_COLORS = ['#5A3577', '#8E1B3A', '#B0413E', '#1F4E79', '#1B6E6A', '#2E6B34', '#7A5A12', '#333A45'];
/* ---------- Primers passos d'una agrupació nova ---------- */
function onboardingSteps() {
  return [
    { done: S.members.size > 0, t: `Afegeix els ${V.members}`, s: `A Gestió › Personal, per ${V.sections}. Pots enganxar-ne els noms d’un full de càlcul.`, act: 'manage', k: 'personal', b: `Ves-hi` },
    { done: S.productions.size > 0, t: 'Crea la primera producció', s: 'Un concert o un projecte, amb totes les seves sessions d’assaig.', act: 'prod-new', b: 'Nova producció' },
    { done: S.staff.size > 1, t: 'Dona accés a l’equip', s: `Cada persona entra amb el seu correu. Pots enganxar una llista de noms i correus de cop.`, act: 'staff-new', b: '+ Persona' },
    { skip: !canManageGroup(), done: !!(S.config.brand && (S.config.brand.logo || S.config.brand.accent)), t: 'Posa-hi el logotip i el color', s: 'Surten a l’entrada de l’app i a la icona del mòbil.', act: 'manage', k: 'config', b: 'Identitat' },
    { done: !!S.config.shared, t: 'Comparteix l’enllaç de l’app', s: 'Un sol enllaç per a tothom: cadascú hi entra amb el seu correu.', act: 'share-app', b: 'Enllaç' },
  ].filter(x => !x.skip);
}
function onboardingPanel() {
  // Només per a les agrupacions creades des de l'app (les d'abans ja estaven en marxa).
  if (!isAdmin() || !S.me || !S.config.createdAt || S.config.onboarded || S.config.demo) return '';
  const steps = onboardingSteps();
  const left = steps.filter(x => !x.done).length;
  if (!left) return '';
  return `<div class="panel onboard">
    <div class="ob-h"><div><span class="eyebrow">Primers passos</span><h2 class="h2">Posa en marxa ${esc(S.config.name || V.el)}</h2></div><span class="mono muted">${steps.length - left}/${steps.length}</span></div>
    <ol class="ob-list">${steps.map(x => `<li class="${x.done ? 'done' : ''}"><i>${x.done ? ICON.check : ''}</i><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span>
      ${x.done ? '' : `<button class="btn btn-sm" data-act="${x.act}" ${x.k ? `data-k="${x.k}"` : ''}>${esc(x.b)}</button>`}</li>`).join('')}</ol>
    <div class="ob-f">${S.members.size || S.productions.size ? '' : '<button class="btn btn-sm btn-ghost" data-act="load-demo">Prova-ho abans amb dades d’exemple</button>'}<span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="onboard-hide">Amaga-ho</button></div>
  </div>`;
}

/* ---------- Seccions i tipus d'agrupació (Ajustos) ---------- */
let CFG_SECTIONS = null, CFG_DIRTY = false;
const secList = p => p === 'cr' ? CREATE && CREATE.sections : p === 'cfg' ? CFG_SECTIONS : null;
const lockedSections = () => new Set([...S.members.values()].map(m => m.section));
function redrawSections(p, focusLast) {
  if (p === 'cr') { render(); }
  else {
    const box = $('#cfg-secs');
    if (!box) return;
    box.outerHTML = sectionsEditor('cfg', CFG_SECTIONS, lockedSections());
    markSectionsDirty();
  }
  if (focusLast) { const rows = $$(`#${p}-secs .sec-row`); rows[rows.length - 1]?.querySelector('.sec-short')?.focus(); }
}
function markSectionsDirty() { CFG_DIRTY = true; const bar = $('#cfg-secs-save'); if (bar) bar.hidden = false; }
function saveSections() {
  const r = cleanSections(CFG_SECTIONS || []);
  if (r.error) { toast(r.error); return; }
  const kept = new Set(r.list.map(x => x.id));
  const orphan = [...lockedSections()].filter(id => !kept.has(id));
  if (orphan.length) { toast(`No es pot treure una ${V.section} que té gent: ${orphan.map(secShort).join(', ')}`); return; }
  CFG_SECTIONS = null; CFG_DIRTY = false;
  saveConfig({ sections: r.list });
  applyGroupConfig();
  toast(`${V.Sections} desades`); render();
}
async function setKind(k) {
  if (!KINDS[k] || k === kindOf()) return;
  const w = KINDS[k].words;
  if (!await confirmSheet(`Canviar a ${KINDS[k].label.toLowerCase()}?`, `L’app parlarà de <b>${esc(w.members)}</b> i <b>${esc(w.sections)}</b>, i proposarà els tipus de sessió habituals. Les ${esc(V.sections)} que ja teniu i totes les dades es mantenen.`, 'Canvia', false)) { render(); return; }
  saveConfig({ kind: k, sections: SECTIONS.map(x => ({ id: x.id, name: x.name, short: x.short })) });
  applyGroupConfig();
  syncDirectory(true);
  toast(`Ara és ${KINDS[k].label.toLowerCase()}`); render();
}

/* ---------- Esborrar una agrupació ---------- */
function sheetDeleteGroup() {
  if (!isAdmin() || !S.me || GID === FOUNDER) return;
  const name = S.config.name || '';
  openSheet({
    title: 'Esborrar l’agrupació',
    body: `<p style="margin-top:0">S’esborraran per sempre la plantilla, les produccions, les llistes, els avisos, el tauler i els fitxers de <b>${esc(name)}</b>, i ningú no hi podrà tornar a entrar. No es pot desfer.</p>
      <p>Si en vols conservar alguna cosa, abans descarrega’n una còpia a Ajustos › Dades.</p>
      <label class="field"><span>Per confirmar-ho, escriu el nom de l’agrupació</span><input class="inp" id="dg-name" autocomplete="off" placeholder="${esc(name)}"></label>
      <p class="muted" id="dg-status" style="font-size:calc(13px*var(--ts));margin:10px 0 0" aria-live="polite"></p>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-danger" id="dg-go" disabled>Esborra-ho tot</button>`,
    onMount: el => {
      const input = el.querySelector('#dg-name'), go = el.querySelector('#dg-go');
      const norm = t => normText(t).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
      input.oninput = () => { go.disabled = !name || norm(input.value) !== norm(name); };
      go.onclick = () => deleteGroup(el);
    },
  });
}
async function deleteGroup(el) {
  const say = t => { const p = el.querySelector('#dg-status'); if (p) p.textContent = t; };
  el.querySelector('#dg-go').disabled = true;
  el.querySelector('#dg-name').disabled = true;
  flushAll();
  const at = new Date().toISOString();
  try {
    const refs = [];
    for (const col of ['members', 'productions', 'attendance', 'attArchive', 'absences', 'subs', 'rsvp', 'announcements', 'polls', 'pollVotes', 'push', 'classes', 'classReq', 'classPlan', 'classNotes', 'classFiles', 'classIcs', 'students', 'works', 'trips', 'tripSignups', 'profiles', 'messages', 'threads', 'nudges', 'memberNotes', 'memberDocs', 'memberFiles', 'config']) {
      say('Preparant…');
      const snap = await db.collection(col).get();
      for (const d of snap.docs) if (!(col === 'config' && d.id === 'main')) refs.push(d.ref);
    }
    const staffSnap = await db.collection('staff').get();
    for (const d of staffSnap.docs) if (d.id !== S.me.email) refs.push(fs.doc(`staffIndex/${d.id}/agrupacions/${GID}`), d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const b = fs.batch();
      refs.slice(i, i + 400).forEach(r => b.delete(r));
      say(`Esborrant… ${Math.min(refs.length, i + 400)} de ${refs.length + 4}`);
      await b.commit();
    }
    // Al final, i en un sol lot: la fitxa del directori, la configuració i el propi accés.
    const b = fs.batch();
    b.set(db.doc('config/main'), { name: '', deleted: true, deletedAt: at });
    if (S.group && S.group.status) b.update(fs.doc(`agrupacions/${GID}`), { status: 'deleted', deletedAt: at });
    b.delete(fs.doc(`staffIndex/${S.me.email}/agrupacions/${GID}`));
    b.delete(db.doc(`staff/${S.me.email}`));
    await b.commit();
  } catch (e) {
    say('No s’ha pogut acabar d’esborrar. Comprova la connexió i torna-ho a provar.');
    el.querySelector('#dg-go').disabled = false; el.querySelector('#dg-name').disabled = false;
    return;
  }
  try { localStorage.removeItem(LS_GROUP); localStorage.removeItem(`${LS_LINK}:${GID}`); } catch {}
  S.groups = S.groups.filter(g => g.id !== GID); saveGroupsCache();
  location.replace(location.pathname);
}

const icsOn = () => S.config.icsOn != null ? !!S.config.icsOn : GID === FOUNDER;
/** Ajustos en blocs plegables: la capçalera diu què hi ha i com està; el contingut s'obre en tocar-la. */
const cfgOpen = k => !!(ui.cfgOpen && ui.cfgOpen[k]) || (k === 'seccions' && CFG_DIRTY);
const cfgHead = (k, title, summary) => `<button class="cfg-h" data-act="cfg-block" data-k="${k}" aria-expanded="${cfgOpen(k)}"><span><b>${title}</b><small>${summary}</small></span>${ICON.chev}</button>`;
function manageConfig() {
  const { season, terms } = seasonCfg();
  const brand = S.config.brand || {};
  if (!CFG_DIRTY || !CFG_SECTIONS) CFG_SECTIONS = SECTIONS.map(x => ({ ...x }));
  const used = groupFileBytes(), quota = fileQuotaMB();
  const adminBlocks = isAdmin() ? `
  ${canManageGroup() ? `${cfgHead('agrupacio', `Agrupació`, `${esc(S.config.name || '')} · ${esc(KINDS[kindOf()].label)}`)}
  <div class="panel cfg-p"${cfgOpen('agrupacio') ? '' : ' hidden'}>
    <div class="setting" style="display:grid;grid-template-columns:1fr;gap:12px">
      <label class="field"><span>Nom de l’agrupació</span><input class="inp" id="cfg-name" type="text" maxlength="60" value="${esc(S.config.name || '')}" data-bind="cfg-name" placeholder="p. ex. ${esc(NAME_EXAMPLES[kindOf()])}"></label>
      <div class="field"><span>Tipus</span><div class="pickers" id="cfg-kind">${Object.entries(KINDS).map(([k, x]) => `<button type="button" class="pick" data-act="kind-set" data-k="${k}" aria-pressed="${kindOf() === k}">${esc(x.label)}</button>`).join('')}</div>
        <small>Decideix les paraules de l’app (${esc(V.members)}, ${esc(V.sections)}, ${esc(V.leaders)}…) i els tipus de sessió que es proposen.</small></div>
    </div>
  </div>
  ${cfgHead('seccions', `${esc(V.Sections)}`, `${SECTIONS.map(x => esc(x.short)).join(' · ')}`)}
  <div class="panel cfg-p"${cfgOpen('seccions') ? '' : ' hidden'} style="padding:14px;display:grid;gap:10px">
    <p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Es passa llista per ${esc(V.sections)}. L’abreviatura surt als quadres de la llista i al calendari. No en pots treure cap que tingui gent assignada.</p>
    ${sectionsEditor('cfg', CFG_SECTIONS, lockedSections())}
    <div id="cfg-secs-save" class="sec-save" ${CFG_DIRTY ? '' : 'hidden'}><span class="muted" style="font-size:calc(13px*var(--ts))">Canvis sense desar</span><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-act="sections-undo">Desfés</button><button class="btn btn-sm btn-primary" data-act="sections-save">Desa</button></div>
  </div>
  ${cfgHead('identitat', `Identitat visual`, `${brand.logo ? 'Logotip, color i nom curt' : 'Sense logotip · color i nom curt'}`)}
  <div class="panel cfg-p"${cfgOpen('identitat') ? '' : ' hidden'} style="padding:14px;display:grid;gap:14px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      ${brand.logo ? `<img class="logo-prev" src="${brand.logo}" alt="Logotip">` : '<span class="logo-prev" style="display:grid;place-items:center;color:var(--muted);font-size:calc(13px*var(--ts))">Sense logo</span>'}
      <span style="display:flex;gap:6px;flex-wrap:wrap"><label class="btn btn-sm" for="logo-file">${brand.logo ? 'Canvia el logotip' : 'Puja el logotip'}</label>
      <input id="logo-file" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="sr" data-bind="logo">
      ${brand.logo ? '<button class="btn btn-sm btn-danger-ghost" data-act="logo-remove">Treu-lo</button>' : ''}</span>
    </div>
    <div class="field"><span>Color principal</span><div class="pickers">${BRAND_COLORS.map(c => `<button type="button" class="swatch" style="background:${c}" data-act="brand-color" data-color="${c}" aria-pressed="${(brand.accent || '#5A3577').toLowerCase() === c.toLowerCase()}" aria-label="Color ${c}"></button>`).join('')}
      <label class="swatch" style="display:grid;place-items:center;background:var(--surface-2);cursor:pointer" title="Un altre color">+<input type="color" class="sr" data-bind="brand-color" value="${brand.accent || '#5A3577'}"></label></div></div>
    <label class="field"><span>Nom curt</span><input class="inp" id="cfg-short" type="text" maxlength="16" value="${esc(S.config.shortName || '')}" data-bind="cfg-short" placeholder="${esc(MARCA?.short || `p. ex. ${initials(S.config.name || NAME_EXAMPLES[kindOf()])}`)}">
      <small>És el nom que surt sota la icona quan algú afegeix l’app a la pantalla d’inici.</small></label>
    <p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">El logotip, el nom i el color es fan servir a la pantalla d’entrada i a la icona del mòbil. Si els canvies, s’hi actualitzen sols en unes hores.</p>
  </div>` : `${cfgHead('agrupacio', `Agrupació`, `${esc(S.config.name || '')} · ${esc(KINDS[kindOf()].label)}`)}
  <div class="panel cfg-p"${cfgOpen('agrupacio') ? '' : ' hidden'}><div class="setting"><div><div class="t">${esc(S.config.name || '')}</div>
    <div class="s">${esc(KINDS[kindOf()].label)} · ${SECTIONS.map(x => esc(x.name)).join(', ')}. El nom, el tipus, les ${esc(V.sections)} i la imatge de l’agrupació només els pot canviar un <b>Usuari Pro</b> que l’administri.</div></div></div></div>`}` : '';
  return `${onboardingPanel()}
  <div class="cfg-list">
  ${adminBlocks}
  ${isAdmin() ? `${cfgHead('classes', `${esc(V.classes)}`, `${classesOn() ? `Activades${teacherSeats().length ? ` · ${teacherSeats().length} ${teacherSeats().length === 1 ? 'professor' : 'professors'} sense compte` : ''}` : 'Desactivades'}`)}
  <div class="panel cfg-p"${cfgOpen('classes') ? '' : ' hidden'}><div class="toggle-row setting"><span><b>${classesOn() ? 'Activades' : 'Desactivades'}</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">${classesOn()
      ? `Hi ha una pestanya amb el calendari de les classes. El porta qui tingui el rol de ${esc(V.Teacher.toLowerCase())}; cada ${esc(V.member)} hi veu la seva hora, hi pot avisar d’un retard o d’una absència i demanar un canvi d’hora a un company.`
      : `Activa-les si l’agrupació fa classes individuals. Hi haurà una pestanya amb el calendari, que portarà qui tingui el rol de ${esc(V.Teacher.toLowerCase())}.`}</span></span>
      <label class="switch"><input type="checkbox" id="cfg-classes" ${classesOn() ? 'checked' : ''} data-bind="cfg-classes"><span></span></label></div>
    ${classesOn() ? `<div class="setting"><div><div class="t">Professorat sense compte</div><div class="s">Per posar el calendari d’un ${esc(V.Teacher.toLowerCase())} que encara no entra a l’app. Quan en tingui, dona-li accés amb el rol i passa-li els dies.</div></div>
      <button class="btn btn-sm" data-act="cl-seats">${teacherSeats().length ? `Són ${teacherSeats().length}` : 'Afegeix-ne'}</button></div>` : ''}</div>` : ''}
  ${cfgHead('ics', `Calendari subscrit`, `${icsOn() ? 'Activat' : 'Desactivat'}`)}
  <div class="panel cfg-p"${cfgOpen('ics') ? '' : ' hidden'}>${isAdmin()
    ? `<div class="toggle-row setting"><span><b>${icsOn() ? 'Activat' : 'Desactivat'}</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">${icsOn() ? 'Qui s’hi subscrigui tindrà les sessions a Google Calendar, Apple o Outlook, sempre al dia. L’adreça és pública però difícil d’endevinar, i no porta noms de persones.' : 'Activa’l perquè tothom pugui tenir les sessions a l’app de calendari del mòbil. Funciona al cap d’unes hores.'}</span></span>
        <label class="switch"><input type="checkbox" id="cfg-ics" ${icsOn() ? 'checked' : ''} data-bind="cfg-ics"><span></span></label></div>`
    : `<div class="setting"><div><div class="t">${icsOn() ? 'Calendari al mòbil' : 'Desactivat'}</div><div class="s">${icsOn() ? 'S’actualitza sol cada poques hores. Funciona amb Google Calendar, Apple i Outlook.' : 'L’administració l’ha de fer públic a Ajustos.'}</div></div>${icsOn() ? '<button class="btn btn-sm" data-act="cal-subscribe">Com afegir-lo</button>' : ''}</div>`}
    ${isAdmin() && icsOn() ? '<div class="setting"><div><div class="t">Com s’hi subscriu cadascú</div><div class="s">Des del Calendari o des del seu compte (les inicials, a dalt a la dreta).</div></div><button class="btn btn-sm" data-act="cal-subscribe">Instruccions</button></div>' : ''}
  </div>
  ${cfgHead('norma', `Norma i seguiment`, `${minAttendance()}% d’assistència · avís a les ${+S.config.alertFNJ || 3} faltes`)}
  <div class="panel cfg-p"${cfgOpen('norma') ? '' : ' hidden'}>
    <div class="setting">
      <div><div class="t">Norma per fer ${esc(V.sh.el)}</div><div class="s">Assistència mínima als assajos d’una producció per poder-hi ${esc(V.play)}.</div></div>
      <span style="display:flex;align-items:center;gap:6px"><input class="inp" id="cfg-min" type="number" inputmode="numeric" min="1" max="100" style="width:80px;text-align:center" value="${minAttendance()}" data-bind="cfg-min"><b>%</b></span>
    </div>
    <div class="setting">
      <div><div class="t">Avís de seguiment</div><div class="s">Assenyala qui acumula aquest nombre de faltes no justificades.</div></div>
      <input class="inp" id="cfg-alert" type="number" inputmode="numeric" min="1" max="20" style="width:80px;text-align:center" value="${+S.config.alertFNJ || 3}" data-bind="cfg-alert">
    </div>
    <div class="setting">
      <div><div class="t">Mínim per ${esc(V.section)} als ${esc(V.sh.els)}</div><div class="s">Quantes persones de cada ${esc(V.section)} calen com a mínim. Si en confirmen menys, l’app ho avisa a l’equip. En blanc, sense mínim.</div></div>
      <span class="vmin">${SECTIONS.map(x => `<label><span>${esc(x.short)}</span><input class="inp" id="cfg-vmin-${esc(x.id)}" type="number" inputmode="numeric" min="0" max="200" value="${+voiceMin()[x.id] || ''}" data-bind="cfg-vmin" data-sec="${esc(x.id)}" aria-label="${esc(x.name)}"></label>`).join('')}</span>
    </div>
  </div>
  ${cfgHead('temporada', `Temporada i trimestres`, `${esc(season.name)} · ${terms.length} trimestres`)}
  <div class="panel cfg-p"${cfgOpen('temporada') ? '' : ' hidden'} style="padding:14px;display:grid;gap:12px">
    <label class="field"><span>Nom de la temporada</span><input class="inp" id="cfg-sname" type="text" maxlength="40" value="${esc(season.name)}" data-bind="cfg-period"></label>
    <div class="row3"><label class="field"><span>Inici</span><input class="inp" id="cfg-sfrom" type="date" value="${season.from}" data-bind="cfg-period"></label>
      <label class="field"><span>Final</span><input class="inp" id="cfg-sto" type="date" value="${season.to}" data-bind="cfg-period"></label></div>
    ${terms.map((t, i) => `<div class="row3"><label class="field"><span>${esc(t.name)} · inici</span><input class="inp" id="cfg-t${i}from" type="date" value="${t.from}" data-bind="cfg-period"></label>
      <label class="field"><span>final</span><input class="inp" id="cfg-t${i}to" type="date" value="${t.to}" data-bind="cfg-period"></label></div>`).join('')}
  </div>
  ${cfgHead('dades', `Dades`, `${fmtSize(used)} de ${quota} MB · còpia cada nit`)}
  <div class="panel cfg-p"${cfgOpen('dades') ? '' : ' hidden'}>
    ${S.members.size ? '' : `<div class="setting"><div><div class="t">Dades d’exemple</div><div class="s">Carrega ${esc(V.members)}, produccions i llistes fictícies per provar l’app.</div></div><button class="btn btn-sm" data-act="load-demo">Carrega</button></div>`}
    <div class="setting"><div><div class="t">Espai per a fitxers</div><div class="s">${fmtSize(used)} de ${quota} MB ocupats per partitures, àudios i documents pujats.</div></div>
      <span class="space-bar" role="img" aria-label="${Math.round(used / (quota * 10485.76))}% ocupat"><span style="width:${Math.min(100, used / (quota * 10485.76))}%"></span></span></div>
    <div class="setting"><div><div class="t">Còpia de seguretat</div><div class="s">Descarrega ${esc(V.members)}, produccions, llistes i avisos en un fitxer JSON. A més, cada nit se’n guarda una còpia automàtica.</div></div><button class="btn btn-sm" data-act="export-json">Exporta</button></div>
    ${isAdmin() ? `<div class="setting"><div><div class="t">Restaura una còpia</div><div class="s">Substitueix totes les dades actuals per les del fitxer.</div></div>
      <label class="btn btn-sm" for="import-file">Importa…</label><input id="import-file" type="file" accept="application/json,.json" class="sr" data-bind="import"></div>
    <div class="setting"><div><div class="t">Restes de versions antigues</div><div class="s">Les dades dels enllaços personals d’abans (ja no serveixen) i el rol antic «Treballador del Palau».</div></div><button class="btn btn-sm" data-act="legacy-clean">Revisa-ho</button></div>
    <div class="setting"><div><div class="t">Esborra les dades</div><div class="s">Elimina ${esc(V.members)}, produccions, llistes i avisos, però manté l’agrupació i les persones amb accés. No es pot desfer.</div></div><button class="btn btn-sm btn-danger-ghost" data-act="wipe-all">Esborra</button></div>
    ${GID !== FOUNDER && canManageGroup() ? `<div class="setting"><div><div class="t">Esborra l’agrupació</div><div class="s">Ho elimina tot, persones incloses, i l’agrupació desapareix. No es pot desfer.</div></div><button class="btn btn-sm btn-danger-ghost" data-act="group-delete">Esborra-la</button></div>` : ''}` : ''}
  </div>
  </div>`;
}
/* ---------- Restes de versions antigues ---------- */
// Fins al setembre del 2026 cada cantaire podia tenir un enllaç personal: la clau era a secrets/members (i a claus/<clau>)
// i les seves marques es copiaven a memberMarks/<membre>. L'equip tècnic tenia un sol rol, «palau». Res d'això no es fa
// servir: aquí es veu què en queda i es pot esborrar (hi ha la còpia de cada nit, per si de cas).
async function legacyScan() {
  const out = { marks: [], keys: [], secrets: [], palau: [], label: !!(S.config.labels && 'palau' in S.config.labels) };
  const get = async f => { try { return await f(); } catch { return null; } };
  const marks = await get(() => db.collection('memberMarks').get());
  if (marks) out.marks = marks.docs.map(d => d.ref);
  for (const id of ['main', 'members']) {
    const d = await get(() => db.doc(`secrets/${id}`).get());
    if (!d || !d.exists) continue;
    out.secrets.push(d.ref);
    for (const v of Object.values(d.data() || {})) if (typeof v === 'string' && SECRET_RE.test(v)) out.keys.push(v);
  }
  const staff = await get(() => db.collection('staff').get());
  if (staff) out.palau = staff.docs.filter(d => { const x = d.data(); return (x.roles || [x.role]).includes('palau'); }).map(d => ({ ...d.data(), email: d.id }));
  return out;
}
function sheetLegacyClean() {
  openSheet({
    title: 'Restes de versions antigues',
    body: '<p id="lg-st" style="margin-top:0">Mirant què en queda…</p><ul class="mini-list" id="lg-list" style="max-height:none"></ul>',
    foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="lg-go" disabled>Neteja-ho</button>',
    onMount: async el => {
      const r = await legacyScan();
      const rows = [
        [r.marks.length, `Còpies de marques dels enllaços personals (${r.marks.length})`],
        [r.keys.length, `Claus d’enllaços antics (${r.keys.length})`],
        [r.secrets.length, 'Llista de les claus dels enllaços'],
        [r.palau.length, `Persones amb el rol antic «palau», que passarà a ser Gerència (${r.palau.length})`],
        [r.label && canManageGroup(), 'El nom antic del rol («Treballador del Palau») a la configuració'],
      ].filter(([n]) => n);
      el.querySelector('#lg-list').innerHTML = rows.map(([, t]) => `<li><span>${esc(t)}</span></li>`).join('');
      el.querySelector('#lg-st').textContent = rows.length ? 'Queda això, que ja no fa servir ningú:' : 'No en queda res: ja està tot net.';
      const go = el.querySelector('#lg-go');
      go.disabled = !rows.length;
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Netejant…';
        try {
          for (const p of r.palau) {
            const roles = [...new Set((p.roles || [p.role]).map(x => x === 'palau' ? 'gerencia' : x))];
            await db.doc(`staff/${p.email}`).set({ ...p, roles, role: roles[0] });
          }
          const refs = [...r.marks, ...r.keys.map(k => fs.doc(`claus/${k}`)), ...r.secrets];
          for (let i = 0; i < refs.length; i += 400) { const b = fs.batch(); refs.slice(i, i + 400).forEach(x => b.delete(x)); await b.commit(); }
          if (r.label && canManageGroup()) { const labels = { ...S.config.labels }; delete labels.palau; saveConfig({ labels }); }
          closeSheet(); toast('Restes antigues netejades');
        } catch { go.disabled = false; go.textContent = 'Neteja-ho'; toast('No s’ha pogut acabar. Torna-ho a provar.'); }
      };
    },
  });
}
/** Les inicials de la persona («Quingles, Pol» → PQ). */
function personInitials(name) {
  const n = String(name || '').includes(',') ? String(name).split(',').reverse().join(' ') : String(name || '');
  const w = n.split(/\s+/).filter(x => x && !['de', 'del', 'la', 'i'].includes(x.toLowerCase()));
  return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
const accountName = () => S.me?.name || S.members.get(myMemberId())?.name || S.userName || S.email || '';
function paintAccount() {
  const b = $('#acct-btn'), h = $('#help-btn'), sr = $('#search-btn');
  if (!b || !h) return;
  const on = S.mode === 'shared' && !!S.email;
  b.hidden = !on; h.hidden = on;
  if (sr) sr.hidden = !on || !S.ready;
  if (on) b.textContent = personInitials(accountName());
}
/** El menú del compte: una fila curta per opció. Cada fila obre la seva finestra (o la pantalla de Gestió). */
const ACCT_ICONS = {
  gestio: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  classIcs: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M11 18v-5.5l4-1v4.5"/><circle cx="10" cy="18" r="1.2"/><circle cx="14" cy="16" r="1.2"/>',
  push: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  groups: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><path d="M15 5.8a3 3 0 010 5.4M17 14a5.5 5.5 0 013.5 5"/>',
  theme: '<path d="M19.5 14.2A7.5 7.5 0 019.8 4.5a7.5 7.5 0 109.7 9.7z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.4a2.4 2.4 0 014.6.9c0 1.6-2.3 2.1-2.3 3.7"/><path d="M12 17v.2"/>',
  install: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7.5v7M9 11.5l3 3 3-3"/>',
  profile: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2a3.4 3.4 0 016.4 0M14 10h4M14 13.5h3"/>',
  threads: '<path d="M4 5.5h11v8H8l-4 3.5z"/><path d="M15 9.5h5v8l-3-2.5h-6.5v-2"/>',
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
};
/** Les finestres del menú. S'obren amb una fletxa per tornar-hi (vegeu openSheet). */
const ACCT_SHEETS = {
  calendar: () => sheetCalendar(), classIcs: () => sheetClassIcs(), push: () => sheetPush(),
  groups: () => sheetGroups(), theme: () => sheetTheme(), help: () => sheetHelp(), profile: () => sheetMyProfile(), install: () => sheetInstall(),
  threads: () => sheetThreads(), week: () => sheetWeek(),
};
function sheetAccount() {
  const name = accountName();
  const clOn = classesOn() && myId() && inClasses();
  const pend = canEdit() ? pendingAbsences().length : 0;
  const item = (k, t, act, n = 0) => `<button class="acct-item${k === 'gestio' ? ' is-main' : ''}" ${act}>
      <span class="acct-i"><svg viewBox="0 0 24 24" aria-hidden="true">${ACCT_ICONS[k]}</svg></span>
      <span class="acct-t">${t}</span>${n ? `<span class="acct-n" aria-label="${n} per veure">${n > 99 ? '99+' : n}</span>` : ''}${ICON.right}</button>`;
  const open = (k, t) => item(k, t, `data-act="acct-open" data-k="${k}"`);
  const groups = [
    canEdit() ? [item('gestio', 'Gestió', `data-act="manage" data-k="${pend ? 'avisos' : ROUTE_MANAGE[ui.manage] ? ui.manage : 'personal'}"`, pend)] : [],
    [(myId() || S.threads.size) && item('threads', 'Converses', 'data-act="acct-open" data-k="threads"', unreadThreads().length), open('week', 'La setmana'),
      myId() && !PREVIEW && open('profile', 'La meva fitxa'), icsOn() && open('calendar', 'Calendari al mòbil'), clOn && open('classIcs', 'Les teves classes al calendari'), pushSupported() && open('push', 'Avisos al mòbil')],
    [groupsVisible() && open('groups', 'Agrupacions'), open('theme', 'Aparença'), canInstall() && open('install', 'Instal·la l’app'), open('help', 'Com funciona')],
  ].map(g => g.filter(Boolean)).filter(g => g.length);
  openSheet({
    title: 'El teu compte',
    body: `<div class="acct-head"><span class="acct-btn" aria-hidden="true">${esc(personInitials(name))}</span>
        <span><b>${esc(name.includes(',') ? name.split(',').reverse().join(' ').trim() : name)}</b><small>${esc(S.email || '')}${S.me ? ` · ${esc(rolesText(S.me))}` : ''}</small></span></div>
      <nav class="acct-menu" aria-label="El teu compte">${groups.map(g => `<div class="acct-grp">${g.join('')}</div>`).join('')}</nav>`,
    foot: `<span class="spacer"></span><button class="btn btn-danger-ghost" data-act="sign-out">Tanca la sessió</button>`,
  });
}
const groupsVisible = () => !!S.me && !PREVIEW && (S.groups.length > 1 || S.pro || S.platform || S.platformFree);
