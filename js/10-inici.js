// A Tempo · 10-inici.js — Inici: la sessió d'avui, el «Per fer», la Gestió i el que ve.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Singer (avisos) ---------- */
function myMemberId() {
  if (myId()) return myId();
  // Self-declared identity only helps whoever could write anyway; the rest is decided by the account.
  if (!canEdit()) return null;
  const id = lsGet(LS_ME); return id && S.members.has(id) ? id : null;
}
function openConvocations(me) {
  if (!me) return [];
  return allSessions().filter(s => s.rsvp && s.date >= TODAY && convoked(s, me.section) && !isOut(s, me));
}
/** L'apartat de gestió d'Inici, per a qui edita: avisos, personal, produccions i ajustos. */
const MG_ICONS = {
  avisos: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  personal: TAB_ICONS.gestio,
  produccions: '<path d="M9 18V6.5l10-2.5v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
};
function manageBlock() {
  if (!canEdit()) return '';
  const pend = pendingAbsences().length;
  const people = S.staff.size;
  const active = membersOf(null).length;
  const prods = productionsSorted();
  const live = prods.filter(p => (!p.end || p.end >= TODAY) && p.start <= TODAY).length;
  const items = [
    ['avisos', 'Avisos', pend ? `${pend} per veure` : 'Absències i retards', pend],
    ['personal', 'Personal', `${active} ${V.members}${people ? ` · ${people} amb accés` : ''}`],
    ['produccions', 'Produccions', prods.length ? `${prods.length} ${prods.length === 1 ? 'producció' : 'produccions'}${live ? ` · ${live} en curs` : ''}` : 'Encara cap'],
    ['config', 'Ajustos', isAdmin() ? 'Persones, agrupació i dades' : 'Temporada i norma'],
  ];
  return `<div class="section-title"><h2 class="h2">Gestió</h2><span class="eyebrow">${esc(rolesText(S.me))}</span></div>
    <div class="mg-grid">${items.map(([k, t, sub, n]) => `<button class="mg ${n ? 'warn' : ''}" data-act="manage" data-k="${k}">
      <span class="mg-i"><svg viewBox="0 0 24 24" aria-hidden="true">${MG_ICONS[k]}</svg></span>
      <b>${t}</b><small>${esc(sub)}</small></button>`).join('')}</div>`;
}
/* ---------- Inici: el que tens per fer i el que ve ---------- */
// La primera pantalla de tothom. A dalt, la sessió d'avui; a sota, tot el que espera una resposta teva
// (abans repartit entre Gestió, Classes, el Tauler i l'espai personal), i després el que ve.
const TODO_ICONS = {
  roll: TAB_ICONS.llista,
  abs: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  conv: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  poll: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>',
  ann: '<path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M17 9.5a3.5 3.5 0 010 5"/>',
  cls: TAB_ICONS.classes,
};
const unreadAnnouncements = () => { const seen = lsGet(LS_SEEN) || ''; return visibleAnnouncements().filter(a => (a.createdAt || '') > seen && (!a.until || a.until >= TODAY)); };
/** Les seccions on em toca passar llista: la dels caps de corda o de secció. */
const mySections = () => hasRole(S.me, 'leader') && S.me.section && SEC_MAP[S.me.section] ? [S.me.section] : [];
/** Tot el que espera alguna cosa de mi, en una sola llista: [{ icon, t, s, btn, act, n, badge }]. */
function todoItems() {
  const me = S.members.get(myMemberId());
  const out = [];
  for (const x of mySubs()) {
    const s = sessionById(x.sessionId);
    if (s) out.push({ icon: 'roll', t: `Avui passes llista de ${esc(SEC[x.section].name.toLowerCase())}`, s: `${esc(s.type || 'Assaig')}${s.time ? ` · ${esc(timeRange(s))}` : ''}`, btn: 'Passa llista', act: `data-act="home-roll" data-sid="${esc(s.id)}" data-sec="${esc(x.section)}"`, n: 1 });
  }
  if (canEdit()) {
    const abs = pendingAbsences();
    if (abs.length) {
      const who = [...new Set(abs.map(a => S.members.get(a.memberId)?.name?.split(',').pop().trim()).filter(Boolean))];
      out.push({ icon: 'abs', t: `${abs.length === 1 ? '1 avís d’absència' : `${abs.length} avisos d’absència`} per veure`, s: esc(who.slice(0, 3).join(', ') + (who.length > 3 ? '…' : '')), btn: 'Revisa', act: 'data-act="manage" data-k="avisos"', n: abs.length });
    }
    const lists = mySections().flatMap(sec => pendingSessions(sec).map(x => ({ sec, x })));
    if (lists.length) out.push({ icon: 'roll', t: `${lists.length === 1 ? '1 llista' : `${lists.length} llistes`} per acabar`, s: `${esc(SEC[lists[0].sec].name)}: ${lists.slice(-3).map(l => ddmm(l.x.date)).join(', ')}`, btn: 'Acaba-les', act: `data-act="home-roll" data-sid="${esc(lists[lists.length - 1].x.id)}" data-sec="${esc(lists[0].sec)}"`, n: lists.length });
  }
  if (classesOn()) {
    const ask = reqsToAnswer();
    if (ask.length) out.push({ icon: 'swap', t: ask.length === 1 ? `${esc(reqMemberName(ask[0]))} et demana canviar l’hora` : `${ask.length} peticions de canvi d’hora`, s: esc(ask.map(r => { const c = S.classes.get(r.classId); return c ? shortDate(c.date) : ''; }).filter(Boolean).join(', ')), btn: 'Respon', act: 'data-act="tab" data-tab="classes"', n: ask.length });
    const teach = teachesClasses() ? reqsForTeacher() : [];
    if (teach.length) out.push({ icon: 'cls', t: `${teach.length === 1 ? '1 avís' : `${teach.length} avisos`} de les ${esc(V.classes.toLowerCase())}`, s: 'Retards, absències i hores demanades', btn: 'Revisa', act: 'data-act="tab" data-tab="classes"', n: teach.length });
    const open = openSwaps();
    if (open.length) out.push({ icon: 'swap', t: `${open.length === 1 ? '1 canvi d’hora obert' : `${open.length} canvis d’hora oberts`}`, s: 'Algú busca qui es quedi la seva hora', btn: 'Mira’ls', act: 'data-act="tab" data-tab="classes"', n: 0 });
  }
  if (me) {
    const conv = openConvocations(me).filter(s => !S.rsvp.get(`${s.id}_${me.id}`));
    for (const s of conv) out.push({ icon: 'conv', conv: s, n: 1 });
    const polls = openPolls().filter(p => !S.pollVotes.get(`${p.id}_${me.id}`));
    if (polls.length) out.push({ icon: 'poll', t: `${polls.length === 1 ? '1 enquesta' : `${polls.length} enquestes`} per respondre`, s: esc(polls[0].title || ''), btn: 'Respon', act: 'data-act="board-polls"', n: polls.length });
  }
  const news = unreadAnnouncements();
  if (news.length) out.push({ icon: 'ann', t: `${news.length === 1 ? '1 anunci nou' : `${news.length} anuncis nous`}`, s: esc(news[0].title || ''), btn: 'Llegeix', act: 'data-act="board-news"', n: news.length });
  return out;
}
/** El número vermell de la pestanya Inici: tot el que espera resposta. */
const todoCount = () => todoItems().reduce((n, x) => n + (x.n || 0), 0);
function convCard(s, me) {
  const a = S.rsvp.get(`${s.id}_${me.id}`);
  return `<div class="conv-card">
    <div class="a-h" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${longDate(s.date)}</b>${a ? `<span class="rsvp ${a.answer}">${a.answer === 'yes' ? 'Hi seràs' : 'No hi seràs'}</span>` : '<span class="rsvp none">Confirma-ho</span>'}</div>
    <span class="muted" style="font-size:13.5px">${esc(s.type)}${s.time ? ` · ${esc(timeRange(s))}` : ''}${s.place ? ` · ${esc(s.place)}` : ''} · ${esc(prodNames(s))}</span>
    ${s.note ? `<span style="font-size:13px;color:var(--accent)">${esc(s.note)}</span>` : ''}
    ${s.rsvpBy ? `<span class="muted mono" style="font-size:12px">Respon abans del ${ddmm(s.rsvpBy)}</span>` : ''}
    ${hasInfo(s) ? fitxaChip(s) : ''}
    <div class="c-a"><button class="btn btn-sm ${a?.answer === 'yes' ? 'btn-primary' : ''}" data-act="rsvp-yes" data-sid="${s.id}">Hi seré</button>
      <button class="btn btn-sm ${a?.answer === 'no' ? 'btn-danger' : ''}" data-act="rsvp-no" data-sid="${s.id}">No hi podré anar</button></div>
  </div>`;
}
function todoBlock(me) {
  const items = todoItems();
  const head = `<div class="section-title"><h2 class="h2">Per fer</h2>${items.length ? `<span class="eyebrow">${items.length}</span>` : ''}</div>`;
  if (!items.length) return head + `<div class="todo-done"><span class="todo-i ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span><b>Tot al dia</b><small>No tens res pendent de respondre.</small></span></div>`;
  return head + `<div class="todo">${items.map(x => x.conv ? `<div class="todo-conv"><span class="todo-k">Convocatòria · confirma si hi seràs</span>${convCard(x.conv, me)}</div>`
    : `<div class="todo-row"><span class="todo-i"><svg viewBox="0 0 24 24" aria-hidden="true">${TODO_ICONS[x.icon]}</svg></span>
      <span class="todo-t"><b>${x.t}</b>${x.s ? `<small>${x.s}</small>` : ''}</span>
      <button class="btn btn-sm ${x.n ? 'btn-primary' : ''}" ${x.act}>${x.btn}</button></div>`).join('')}</div>`;
}
/** La sessió d'avui, amb el botó gran per passar llista (qui edita) o per avisar (qui canta). */
function todayBlock(me) {
  const today = allSessions().filter(s => s.date === TODAY && (!me || canEdit() || convoked(s, me.section)));
  if (!today.length) return '';
  return today.map(s => {
    const secs = mySections().filter(x => convoked(s, x));
    const pr = secs.length ? progress(s, secs[0]) : null;
    const mine = me && [...S.absences.values()].find(a => a.memberId === me.id && (a.sessionIds || []).includes(s.id) && a.status !== 'rejected');
    const out = me && isOut(s, me);
    const action = canEdit()
      ? `<button class="btn" data-act="home-roll" data-sid="${esc(s.id)}" data-sec="${esc(secs[0] || '')}">${pr ? `Passa llista · ${pr.done}/${pr.total}` : 'Passa llista'}</button>`
      : me && !out ? (mine ? `<span class="st-pill st-${mine.status}">${mine.kind === 'late' ? 'Has avisat que arribaràs tard' : 'Has avisat que no hi vas'}</span>`
        : `<button class="btn" data-act="absence-new" data-sid="${esc(s.id)}">No hi puc anar o arribaré tard</button>`) : '';
    return `<div class="hero-cta today-hero">
      <span class="eyebrow">Avui${s.time ? ` · ${esc(timeRange(s))}` : ''}</span>
      <h2 class="h2">${esc(s.type || 'Assaig')}</h2>
      <span style="font-size:14px">${[esc(s.place || ''), esc(prodNames(s)), s.info?.call ? `Convocatòria a les ${esc(s.info.call)}` : ''].filter(Boolean).join(' · ')}${out ? ` · ${esc(onLeave(me, TODAY) ? 'Estàs de baixa' : 'No fas aquesta producció')}` : ''}</span>
      ${s.note ? `<span style="font-size:13px">${esc(s.note)}</span>` : ''}
      ${hasInfo(s) ? fitxaChip(s) : ''}
      ${action}
    </div>`;
  }).join('');
}
function viewHome() {
  const me = S.members.get(myMemberId());
  const name = me ? me.name : (S.me?.name || S.userName || '');
  const first = name.includes(',') ? name.split(',').pop().trim() : name.split(' ')[0];
  const lv = me ? leaveText(me) : '';
  const who = me ? `<b>${esc(me.name)}</b> · ${esc(SEC[me.section].name)}${me.part ? ` ${esc(me.part)}` : ''}${lv ? ` · ${lv}` : ''}`
    : `<b>${esc(name || S.email || '')}</b>${S.me ? ` · ${esc(rolesText(S.me))}` : ''}`;
  const head = `<div class="page-head"><div><div class="eyebrow">${esc(longDate(TODAY))}</div><h1 class="h1">Hola${first ? `, ${esc(first)}` : ''}</h1></div></div>
    <div class="me-line" style="margin-top:-6px"><span>${who}</span></div>`;
  if (!me && !canEdit() && myMemberId()) return head + `<div class="empty">${staffSvg()}<h2 class="h2">Compte sense fitxa</h2><p>El teu correu encara no està vinculat a cap fitxa de la plantilla. Demana-ho a l’administració ${V.del}.</p></div>`;
  // El que ve: la propera classe, el proper assaig i el concert amb fitxa, les convocatòries ja respostes i els anuncis.
  const nx = nextClass();
  const classCard = nx ? `<div class="panel"><div class="cl-day">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <span><span class="eyebrow">La teva propera classe</span><br><b>${esc(longDate(nx.c.date))}</b> · <b class="mono">${esc(nx.slot.time || '')}</b>${[nx.c.place, teacherOf(nx.c)].filter(Boolean).length ? `<br><span class="m">${esc([nx.c.place, teacherOf(nx.c)].filter(Boolean).join(' · '))}</span>` : ''}</span>
        <button class="btn btn-sm" data-act="cal-class" data-k="${esc(nx.c.teacher || '')}" data-date="${esc(nx.c.date)}">Les classes</button>
      </div>
      ${classClash(nx.c, nx.slot) ? `<span class="st-pill st-pending" style="align-self:start">Xoca amb ${esc(classClash(nx.c, nx.slot).type || 'l’assaig')}</span>` : ''}
      <span class="cl-acts" style="margin-left:0;margin-top:8px">
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(nx.c.id)}" data-s="${esc(nx.slot.id)}" data-k="late">Arribaré tard</button>
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(nx.c.id)}" data-s="${esc(nx.slot.id)}" data-k="absent">No hi podré anar</button>
        ${classSlots(nx.c).length > 1 ? `<button class="btn btn-sm" data-act="cl-swap" data-c="${esc(nx.c.id)}" data-s="${esc(nx.slot.id)}">Canvia l’hora</button>` : ''}
      </span>
    </div></div>` : '';
  const upcoming = allSessions().filter(s => s.date > TODAY && (!me || convoked(s, me.section)));
  const next = upcoming[0];
  const show = allSessions().find(x => isShow(x) && x.date > TODAY && (!me || (convoked(x, me.section) && !isOut(x, me))) && hasInfo(x));
  const sessCard = (s, label) => `<div class="panel" style="padding:14px"><span class="eyebrow">${label}</span><br><b>${longDate(s.date)}</b><div class="muted" style="font-size:13.5px">${esc(s.type)}${s.time ? ` · ${esc(timeRange(s))}` : ''}${s.place ? ` · ${esc(s.place)}` : ''} · ${esc(prodNames(s))}</div>${s.note ? `<div style="font-size:13px;color:var(--accent);margin-top:4px">${esc(s.note)}</div>` : ''}${hasInfo(s) ? fitxaChip(s) : ''}</div>`;
  const answered = me ? openConvocations(me).filter(s => S.rsvp.get(`${s.id}_${me.id}`)) : [];
  const ann = visibleAnnouncements().filter(a => !a.until || a.until >= TODAY).slice(0, 2);
  const soon = [
    classCard,
    next ? sessCard(next, isShow(next) ? V.sh.next : 'Proper assaig') : '',
    show && show.id !== next?.id ? sessCard(show, V.sh.next) : '',
    answered.length ? `<div class="panel"><div class="todo-k" style="padding:12px 14px 0">Convocatòries que ja has respost</div>${answered.map(s => convCard(s, me)).join('')}</div>` : '',
    ann.length ? `<div class="panel">${ann.map(a => `<article class="ann ${a.pinned ? 'pinned' : ''}"><span class="eyebrow">Tauler</span><h3 class="ann-t" style="font-size:17px">${esc(a.title)}</h3>${a.body ? `<div class="ann-b">${linkify(a.body.length > 220 ? a.body.slice(0, 220) + '…' : a.body)}</div>` : ''}<div class="ann-m"><span>${esc(a.author || '')}</span><span class="mono">${a.createdAt ? ddmm(a.createdAt.slice(0, 10)) : ''}</span></div></article>`).join('')}
        <div style="padding:0 14px 12px"><button class="btn btn-sm btn-ghost" data-act="board-news">Tot el tauler</button></div></div>` : '',
  ].filter(Boolean);
  const mine = me ? [...S.absences.values()].filter(a => a.memberId === me.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
  return `${head}
    <div class="home-grid"><div class="home-a">
    ${todayBlock(me)}
    ${todoBlock(me)}
    ${manageBlock()}
    </div><div class="home-b">
    ${soon.length ? `<div class="section-title"><h2 class="h2">Properament</h2></div><div class="soon">${soon.join('')}</div>` : ''}
    ${me ? `${myAttendanceCard(me)}
    <div class="section-title"><h2 class="h2">Els meus avisos</h2><button class="btn btn-sm btn-primary" data-act="absence-new">Avisa d’una absència</button></div>
    <p class="muted" style="margin:-2px 2px 10px;font-size:13px">Si no pots venir a un assaig, avisa amb temps: el teu ${V.leader} ho veurà i, si l’accepta, la falta quedarà justificada.</p>
    ${mine.length ? `<div class="panel">${mine.map(a => absenceCard(a, { mine: true })).join('')}</div>`
      : '<div class="panel" style="padding:14px;font-size:13.5px;color:var(--muted)">Encara no has enviat cap avís.</div>'}` : ''}
    </div></div>`;
}

function afterRender() {
  if (ui.tab === 'calendari' && !ui._calScrolled) {
    ui._calScrolled = true;
    const t = $('.cal-row.is-today') || $$('.cal-row').find(r => r.dataset.date >= TODAY);
    if (t && ui.calPast) t.scrollIntoView({ block: 'center' });
  }
  const chip = ui.tab === 'gestio' && $('#people-menu .chip[aria-pressed="true"]');
  if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
  const ctx = $('#ctx');
  if (ctx) onScroll();
}
function onScroll() {
  const ctx = $('#ctx');
  if (ctx) ctx.classList.toggle('stuck', ctx.getBoundingClientRect().top <= 0 && window.scrollY > 40);
}
window.addEventListener('scroll', onScroll, { passive: true });
