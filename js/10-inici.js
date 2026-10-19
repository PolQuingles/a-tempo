// A Tempo · 10-inici.js — Inici: la sessió d'avui, el «Per fer» i el que ve.
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
/* ---------- Instal·lar l'app i activar els avisos ---------- */
// A l'iPhone, els avisos només funcionen si l'app està a la pantalla d'inici, i el Safari no ho diu enlloc. Mentre el mòbil
// no la tingui instal·lada, Inici hi té una línia que obre com fer-ho; després, una que activa els avisos. «Ara no» l'amaga 30 dies.
const LS_INSTALL = 'atempo:installa';
function installCard() {
  if (PREVIEW || !(isiOS() || isAndroid())) return '';
  const hidden = +lsGet(LS_INSTALL) || 0;
  if (Date.now() - hidden < 30 * 864e5) return '';
  let t, act;
  if (installed()) {
    if (!pushSupported() || S.pushOn) return '';
    t = 'Activa les notificacions'; act = 'data-act="push-setup"';
  } else {
    t = 'Posa l’app a la pantalla d’inici'; act = installPrompt ? 'data-act="install-go"' : 'data-act="install-how"';
  }
  return `<div class="install-card"><button class="install-go" ${act}><span class="todo-i"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg></span><span>${t}</span>${ICON.right}</button>
    <button class="icon-btn" data-act="install-hide" aria-label="Ara no">${ICON.close}</button></div>`;
}
/** Els passos per posar l'app a la pantalla d'inici en aquest mòbil (buit si el Chrome ho fa amb un botó). */
function installSteps() {
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(navigator.userAgent);
  return isiOS()
    ? [inApp ? 'Obre aquest enllaç amb el <b>Safari</b> (menú «···» › Obre al navegador).' : '', 'Toca <b>Comparteix</b> <span class="ios-share" aria-hidden="true"></span> a la barra del navegador.', 'Tria <b>Afegeix a la pantalla d’inici</b> i toca <b>Afegeix</b>.', 'Obre l’app des de la icona nova i activa les notificacions des de les teves inicials.'].filter(Boolean)
    : installPrompt ? [] : ['Obre el menú <b>⋮</b> del Chrome.', 'Tria <b>Instal·la l’aplicació</b> (o <b>Afegeix a la pantalla d’inici</b>).', 'Obre l’app des de la icona nova.'];
}
const canInstall = () => (isiOS() || isAndroid()) && !installed() && !PREVIEW;
/** La mateixa guia, des del menú del compte (encara que s'hagi tancat la targeta d'Inici). */
function sheetInstall() {
  const steps = installSteps();
  openSheet({
    title: 'Instal·la l’app',
    body: `<p style="margin-top:0">${isiOS() ? 'Al iPhone, posar l’app a la pantalla d’inici és l’única manera de rebre notificacions al mòbil.' : 'La tindràs com una app més, i s’obre més de pressa.'}</p>
      ${steps.length ? `<ol class="install-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}`,
    foot: installPrompt ? '<span class="spacer"></span><button class="btn btn-primary" data-act="install-go">Instal·la-la</button>' : '',
  });
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
  trip: '<path d="M4 16.5V8a2 2 0 012-2h12a2 2 0 012 2v8.5"/><path d="M3 16.5h18M7 19.5v-3M17 19.5v-3M4 11h16"/>',
  voices: '<path d="M4 20V11M9 20V6M14 20v-9M19 20V9"/><path d="M3 20h18"/>',
  msg: '<path d="M4 5.5h16v10.5H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  thread: '<path d="M4 5.5h11v8H8l-4 3.5z"/><path d="M15 9.5h5v8l-3-2.5h-6.5v-2"/>',
  plan: '<path d="M9 18V6.5l10-2.5v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  ward: WARD_ICON,
  score: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M15 3.5v3h3M9 11h6M9 14h6M9 17h4"/>',
};
const unreadAnnouncements = () => { const seen = lsGet(LS_SEEN) || ''; return visibleAnnouncements().filter(a => (a.createdAt || '') > seen && (!a.until || a.until >= TODAY)); };
/** Les seccions on em toca passar llista: la dels caps de corda o de secció. */
const mySections = () => { const me = ME(); return hasRole(me, 'leader') && me.section && SEC_MAP[me.section] ? [me.section] : []; };
/** Tot el que espera alguna cosa de mi, en una sola llista: [{ icon, t, s, btn, act, n, badge }]. */
function todoItems() {
  const me = S.members.get(myMemberId());
  const out = [];
  for (const x of mySubs()) {
    const s = sessionById(x.sessionId);
    if (s) out.push({ icon: 'roll', t: x.auto ? `Ets ${esc(V.leader)} en funcions de ${esc(SEC[x.section].name.toLowerCase())}: passa llista` : `Avui passes llista de ${esc(SEC[x.section].name.toLowerCase())}`, s: `${esc(s.type || 'Assaig')}${s.time ? ` · ${esc(timeRange(s))}` : ''}`, btn: 'Passa llista', act: `data-act="home-roll" data-sid="${esc(s.id)}" data-sec="${esc(x.section)}"`, n: 1 });
  }
  if (canEdit()) {
    const abs = pendingAbsences();
    if (abs.length) {
      const who = [...new Set(abs.map(a => firstName(S.members.get(a.memberId)?.name)).filter(Boolean))];
      out.push({ icon: 'abs', t: `${abs.length === 1 ? '1 absència' : `${abs.length} absències`} per veure`, s: esc(who.slice(0, 3).join(', ') + (who.length > 3 ? '…' : '')), btn: 'Revisa', act: 'data-act="manage" data-k="avisos"', n: abs.length });
    }
    const lists = mySections().flatMap(sec => pendingSessions(sec).map(x => ({ sec, x })));
    if (lists.length) out.push({ icon: 'roll', t: `${lists.length === 1 ? '1 llista' : `${lists.length} llistes`} per acabar`, s: `${esc(SEC[lists[0].sec].name)}: ${lists.slice(-3).map(l => ddmm(l.x.date)).join(', ')}`, btn: 'Acaba-les', act: `data-act="home-roll" data-sid="${esc(lists[lists.length - 1].x.id)}" data-sec="${esc(lists[0].sec)}"`, n: lists.length });
    // Qui porta tot el cor (administració, direcció, gerència, secretaria): les llistes sense acabar de les altres cordes,
    // de l'últim mes (les més velles ja són història, no feina per fer).
    if (rollAll()) {
      const mine = new Set(mySections()), month = isoDate(new Date(Date.now() - 30 * 864e5));
      const others = SECTIONS.filter(x => !mine.has(x.id)).map(x => ({ x, ss: pendingSessions(x.id).filter(s => s.date >= month) })).filter(o => o.ss.length);
      const n = others.reduce((a, o) => a + o.ss.length, 0);
      if (n) {
        const last = others.flatMap(o => o.ss).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).pop();
        out.push({ icon: 'roll', t: `${n === 1 ? '1 llista' : `${n} llistes`} sense acabar${mine.size ? ' a les altres cordes' : ''}`,
          s: esc(others.map(o => `${o.x.name} ${o.ss.length}`).join(' · ')), btn: 'Mira-les', act: `data-act="home-roll" data-sid="${esc(last.id)}" data-sec=""`, n });
      }
    }
  }
  if (classesOn()) {
    const ask = reqsToAnswer();
    if (ask.length) out.push({ icon: 'swap', t: ask.length === 1 ? `${esc(reqMemberName(ask[0]))} et demana canviar l’hora` : `${ask.length} peticions de canvi d’hora`, s: esc(ask.map(r => { const c = S.classes.get(r.classId); return c ? shortDate(c.date) : ''; }).filter(Boolean).join(', ')), btn: 'Respon', act: 'data-act="tab" data-tab="classes"', n: ask.length });
    const teach = teachesClasses() ? reqsForTeacher() : [];
    if (teach.length) out.push({ icon: 'cls', t: `${teach.length === 1 ? '1 canvi' : `${teach.length} canvis`} de les ${esc(V.classes.toLowerCase())} per revisar`, s: 'Retards, absències i hores demanades', btn: 'Revisa', act: 'data-act="tab" data-tab="classes"', n: teach.length });
    const open = openSwaps();
    if (open.length) out.push({ icon: 'swap', t: `${open.length === 1 ? '1 canvi d’hora obert' : `${open.length} canvis d’hora oberts`}`, s: 'Algú busca qui es quedi la seva hora', btn: 'Mira’ls', act: 'data-act="tab" data-tab="classes"', n: 0 });
  }
  if (me) {
    const conv = openConvocations(me).filter(s => !S.rsvp.get(`${s.id}_${me.id}`));
    for (const s of conv) out.push({ icon: 'conv', conv: s, n: 1 });
    if (choicesPending(me.id)) { const s = choiceSummary(me.id); out.push({ icon: 'conv', t: 'Digues quines produccions faràs', s: `${s.none} de ${s.total} per dir · cal fer-ne com a mínim el ${s.min}%`, btn: 'Tria-les', act: `data-act="choice-open" data-mid="${esc(me.id)}"`, n: 1 }); }
    const polls = openPolls().filter(p => !S.pollVotes.get(`${p.id}_${me.id}`));
    if (polls.length) out.push({ icon: 'poll', t: `${polls.length === 1 ? '1 enquesta' : `${polls.length} enquestes`} per respondre`, s: esc(polls[0].title || ''), btn: 'Respon', act: 'data-act="board-polls"', n: polls.length });
  }
  // No hi va ser: què s'hi va treballar (el pla de l'assaig on va faltar).
  const missed = missedPlan(me);
  if (missed) out.push({ icon: 'plan', t: `Què es va fer el ${esc(shortDate(missed.date))}`, s: `No hi vas ser: mira el pla ${esc(missed.type ? `de l’${missed.type.toLowerCase()}` : 'de l’assaig')}`, btn: 'Mira-ho', act: `data-act="session-info" data-sid="${esc(missed.id)}"`, n: 0 });
  const plan = planTodo();
  if (plan) out.push(plan);
  out.push(...archiveTodos());
  out.push(...wardTodos());
  out.push(...rollTodos());
  const th = unreadThreads();
  if (th.length) out.push({ icon: 'thread', t: `${th.length === 1 ? '1 conversa' : `${th.length} converses`} amb resposta nova`, s: esc(th.map(threadWho).slice(0, 2).join(', ')), btn: 'Llegeix', act: th.length === 1 ? `data-act="thread" data-id="${esc(th[0].id)}"` : 'data-act="threads"', n: th.length });
  const msgs = unreadMessages();
  if (msgs.length) out.push({ icon: 'msg', t: `${msgs.length === 1 ? '1 missatge nou' : `${msgs.length} missatges nous`}`, s: esc(`${msgs[0].byName || ''}: ${msgs[0].title || msgs[0].body || ''}`.slice(0, 90)), btn: 'Llegeix', act: 'data-act="msg-list"', n: msgs.length });
  for (const t of tripsToAnswer()) out.push({ icon: 'trip', t: `${esc(t.title)}: t’hi apuntes?`, s: `${esc(capz(tripDates(t)))}${t.deadline ? ` · fins al ${ddmm(t.deadline)}` : ''}`, btn: 'Respon', act: 'data-act="board-trips"', n: 1 });
  for (const { s, short } of shortConcerts()) out.push({ icon: 'voices', t: `${esc(capz(V.sh.show))} del ${esc(shortDate(s.date))}: ${short.map(b => `${b.min - b.yes === 1 ? 'falta' : 'falten'} ${b.min - b.yes} ${esc(b.x.name.toLowerCase())}`).join(' i ')}`, s: `${esc(short.map(b => `${b.x.name}: ${b.yes} de ${b.min}`).join(' · '))}`, btn: 'Mira-ho', act: `data-act="session-info" data-sid="${esc(s.id)}"`, n: 0 });
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
    <span class="muted" style="font-size:calc(13.5px*var(--ts))">${esc(s.type)}${s.time ? ` · ${esc(timeRange(s))}` : ''}${s.place ? ` · ${esc(s.place)}` : ''} · ${esc(prodNames(s))}</span>
    ${s.note ? `<span style="font-size:calc(13px*var(--ts));color:var(--accent)">${esc(s.note)}</span>` : ''}
    ${s.rsvpBy ? `<span class="muted mono" style="font-size:calc(13px*var(--ts))">Respon abans del ${ddmm(s.rsvpBy)}</span>` : ''}
    ${hasInfo(s) ? fitxaChip(s) : ''}
    <div class="c-a"><button class="btn btn-sm ${a?.answer === 'yes' ? 'btn-primary' : ''}" data-act="rsvp-yes" data-sid="${s.id}">Hi seré</button>
      <button class="btn btn-sm ${a?.answer === 'no' ? 'btn-danger' : ''}" data-act="rsvp-no" data-sid="${s.id}">No hi podré anar</button></div>
    ${s.bus && a?.answer === 'yes' ? `<div class="c-a bus-q"><span class="m">Com hi vas?</span><button class="btn btn-sm ${a.transport === 'bus' ? 'btn-primary' : ''}" data-act="rsvp-bus" data-sid="${s.id}" data-k="bus">Amb l’autocar</button><button class="btn btn-sm ${a.transport === 'own' ? 'btn-primary' : ''}" data-act="rsvp-bus" data-sid="${s.id}" data-k="own">Pel meu compte</button></div>` : ''}
    ${a?.answer === 'yes' ? tasksBlock(s, true) : ''}
  </div>`;
}
// «Per fer» ensenya les tres primeres coses; la resta, plegades sota «Mostra’n N més». Una convocatòria que ja surt a la
// targeta de la propera sessió (amb «Hi seré» i «No hi podré anar») no es repeteix a sota.
const TODO_SHOWN = 3;
function todoBlock(me, feat) {
  const items = todoItems().filter(x => !(x.conv && feat && x.conv.id === feat.id));
  // Res pendent: només una marca al costat del títol, sense requadre.
  if (!items.length) return `<div class="section-title"><h2 class="h2">Per fer</h2><span class="pf-ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Tot al dia</span></div>`;
  const row = x => x.conv ? `<div class="todo-conv"><span class="todo-k">Convocatòria · confirma si hi seràs</span>${convCard(x.conv, me)}</div>`
    : `<div class="todo-row"><span class="todo-i"><svg viewBox="0 0 24 24" aria-hidden="true">${TODO_ICONS[x.icon]}</svg></span>
      <span class="todo-t"><b>${x.t}</b>${x.s ? `<small>${x.s}</small>` : ''}</span>
      <button class="btn btn-sm ${x.n ? 'btn-soft' : ''}" ${x.act}>${x.btn}</button></div>`;
  const shown = items.slice(0, TODO_SHOWN), more = items.slice(TODO_SHOWN);
  return `<div class="section-title"><h2 class="h2">Per fer</h2><span class="todo-n">${items.length}</span></div>
    <div class="todo">${shown.map(row).join('')}${more.length ? `<details class="todo-more"><summary><span>Mostra’n ${more.length === 1 ? '1 més' : `${more.length} més`}</span>${ICON.chev}</summary>${more.map(row).join('')}</details>` : ''}</div>`;
}
/* ---------- La propera sessió, a dalt de tot ---------- */
// Una sola targeta: la sessió d'avui que encara no s'ha acabat (o l'última d'avui, si ja s'han fet totes) i, si avui no n'hi
// ha cap, la propera. Hi ha tot el que cal saber (quan, on, la convocatòria) i el que s'hi pot fer: passar llista, avisar que
// no hi vas o que arribaràs tard, confirmar-la i obrir-ne la fitxa. La resta de dies van a sota, a «Properament», en files curtes.
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function sessionOver(s) {
  if (s.date !== TODAY) return s.date < TODAY;
  const a = clockMins(s.time), b = clockMins(s.end);
  const end = b != null ? b : a != null ? a + 120 : null;
  return end != null && nowMins() > end;
}
/** On em toca anar (l'equip ho veu tot): l'equip també veu les sessions d'avui que no fa, perquè n'ha de passar llista. */
const mySoon = (s, me) => !me || canEdit() || convoked(s, me.section);
function featuredSession(me) {
  const today = allSessions().filter(s => s.date === TODAY && mySoon(s, me) && (canEdit() || !(me && isOut(s, me))));
  if (today.length) return today.find(s => !sessionOver(s)) || today[today.length - 1];
  return allSessions().find(s => s.date > TODAY && mySoon(s, me) && !(me && isOut(s, me))) || null;
}
/** El que es pot fer amb una sessió: passar llista (avui, l'equip), la convocatòria (respondre-la o canviar la resposta) i
 *  avisar que no hi vas o arribaràs tard. big = a la targeta de dalt; a les files de sota, només el que no es pot fer enlloc més. */
function sessionActs(s, me, big) {
  const out = me && isOut(s, me);
  const now = s.date === TODAY;
  let acts = '', conv = '';
  if (now && canEdit()) {
    const secs = mySections().filter(x => convoked(s, x));
    const pr = secs.length ? progress(s, secs[0]) : null;
    acts = `<button class="btn btn-sm btn-primary" data-act="home-roll" data-sid="${esc(s.id)}" data-sec="${esc(secs[0] || '')}">${pr ? `Passa llista · ${pr.done}/${pr.total}` : 'Passa llista'}</button>`;
  } else if (me && !out && s.date >= TODAY) {
    const mine = myAbsence(s, me);
    const a = s.rsvp ? S.rsvp.get(`${s.id}_${me.id}`) : null;
    // Convocatòria ja resposta: la resposta, per canviar-la, i (si hi va) com hi va i si fa de voluntari.
    if (a) conv = `${s.bus && a.answer === 'yes' ? `<div class="soon-a bus-q"><span class="m">Com hi vas?</span><button class="btn btn-sm ${a.transport === 'bus' ? 'btn-primary' : ''}" data-act="rsvp-bus" data-sid="${s.id}" data-k="bus">Amb l’autocar</button><button class="btn btn-sm ${a.transport === 'own' ? 'btn-primary' : ''}" data-act="rsvp-bus" data-sid="${s.id}" data-k="own">Pel meu compte</button></div>` : ''}${a.answer === 'yes' ? tasksBlock(s, true) : ''}`;
    // Convocatòria per respondre, a la targeta de dalt (a «Per fer» no es repeteix).
    const ask = big && s.rsvp && !a ? `<button class="btn btn-sm btn-primary" data-act="rsvp-yes" data-sid="${s.id}">Hi seré</button><button class="btn btn-sm" data-act="rsvp-no" data-sid="${s.id}">No hi podré anar</button>` : '';
    acts = [ask, a ? `<span class="rsvp ${a.answer}">${a.answer === 'yes' ? 'Hi seràs' : 'No hi seràs'}</span><button class="btn btn-sm btn-ghost" data-act="${a.answer === 'yes' ? 'rsvp-no' : 'rsvp-yes'}" data-sid="${s.id}">${a.answer === 'yes' ? 'Ja no hi puc anar' : 'Sí que hi seré'}</button>` : '',
      mine ? `<span class="st-pill st-${mine.status}">${mine.kind === 'late' ? 'Has avisat que arribaràs tard' : 'Has avisat que no hi vas'}</span>`
        // Avisar amb temps: a la targeta de dalt; a les altres sessions, des de la seva fitxa (en tocar-ne la fila).
        : big && !s.rsvp ? `<button class="btn btn-sm" data-act="absence-new" data-sid="${esc(s.id)}">No hi puc anar o arribaré tard</button>` : ''].filter(Boolean).join('');
  }
  return { acts, conv };
}
/** L'avís d'absència o de retard que la persona ja ha fet per a aquesta sessió (si n'hi ha). */
const myAbsence = (s, me) => [...S.absences.values()].find(a => a.memberId === me.id && (a.sessionIds || []).includes(s.id) && a.status !== 'rejected');
function nextCard(s, me) {
  const prod = S.productions.get(s.prodId);
  const now = s.date === TODAY;
  const { acts, conv } = sessionActs(s, me, true);
  if (now && isShow(s)) return concertDayRow(s, prod, acts, conv);
  const lbl = dayLabel(s.date), n = lbl ? 0 : daysTo(s.date);
  const kind = now ? s.type || 'Assaig' : isShow(s) ? V.sh.next : !s.type || s.type === 'Assaig' ? 'Proper assaig' : s.type;
  const out = me && isOut(s, me);
  const place = placeLink(s.place || '');
  const fitxa = hasInfo(s) ? `<button class="btn btn-sm btn-ghost next-fx" data-act="session-info" data-sid="${esc(s.id)}">${isShow(s) ? `Fitxa ${V.sh.del}` : 'Fitxa de la sessió'}${ICON.right}</button>`
    : canEdit() && isShow(s) ? `<button class="btn btn-sm btn-ghost next-fx" data-act="session-edit" data-sid="${esc(s.id)}">Afegeix la fitxa ${V.sh.del}${ICON.right}</button>` : '';
  return `<article class="next-card prod-tone${now ? ' is-now' : ''}" style="--ph:${prodHue(prod)}">
    <div class="next-top">
      <span class="next-d"><small>${lbl ? `<em>${lbl}</em>` : esc(monthShort(s.date))}</small><b>${+s.date.slice(8, 10)}</b><small>${esc(wdShort(s.date))}</small></span>
      <div class="next-b">
        <span class="next-k"><i class="pdot"></i>${esc(kind)}${n > 1 ? `<span class="soon-count">d’aquí a ${n} dies</span>` : ''}</span>
        <h2 class="next-t">${esc(prodNames(s))}</h2>
        ${s.time ? `<span class="next-time num">${esc(timeRange(s))}</span>` : ''}
        ${place ? `<span class="next-m">${place}</span>` : ''}
        ${s.info?.call ? `<span class="next-m">Convocatòria a les <b class="num">${esc(s.info.call)}</b></span>` : ''}
        ${s.rsvp && s.rsvpBy && me && !S.rsvp.get(`${s.id}_${me.id}`) ? `<span class="next-m">Respon abans del ${ddmm(s.rsvpBy)}</span>` : ''}
        ${out ? `<span class="next-m">${esc(onLeave(me, s.date) ? 'Estàs de baixa' : 'No fas aquesta producció')}</span>` : ''}
      </div>
      ${posterThumb(prod, 'next-poster')}
    </div>
    ${s.note ? `<p class="next-note">${esc(s.note)}</p>` : ''}
    ${planChip(s)}
    ${acts || fitxa ? `<div class="next-a">${acts}${fitxa}</div>` : ''}
    ${conv}
  </article>`;
}
/* ---------- Properament ---------- */
// Sota la targeta de dalt, en files curtes i per ordre: el que queda d'avui, la propera classe, les sessions dels set dies que
// vénen i, si són més enllà, el proper assaig i el proper concert. Cada fila és com les del calendari: la data a l'esquerra i, a
// la dreta, què és i on; en tocar-la s'obre la fitxa de la sessió (amb «No hi puc anar o arribaré tard»).
const dayLabel = d => d === TODAY ? 'Avui' : d === addDays(TODAY, 1) ? 'Demà' : '';
const daysTo = d => Math.round((parseISO(d).getTime() - parseISO(TODAY).getTime()) / 864e5);
const monthShort = d => fmtD(d, { month: 'short' }).replace(/^d[e’']\s*/, '');
function soonRow({ date, time, kind, title, meta, extra = '', acts = '', tone = null, now = false, count = false, sid = '' }) {
  const lbl = dayLabel(date);
  // El proper concert porta el compte enrere: «d'aquí a 16 dies».
  const n = count && !lbl ? daysTo(date) : 0;
  const head = `<span class="soon-k">${lbl ? `<em>${lbl}</em>` : ''}${esc(kind)}${time ? ` · <span class="num">${esc(time)}</span>` : ''}${n > 1 ? `<span class="soon-count">d’aquí a ${n} dies</span>` : ''}</span>
      <b class="soon-t">${title}</b>
      ${meta ? `<span class="soon-m">${meta}</span>` : ''}`;
  return `<li class="soon-row${now ? ' is-now' : ''}${tone ? ' prod-tone' : ''}${sid ? ' can-open' : ''}"${tone ? ` style="--ph:${prodHue(tone)}"` : ''}>
    <span class="soon-d"><b>${+date.slice(8, 10)}</b><small>${esc(wdShort(date))}</small></span>
    <div class="soon-b">
      ${sid ? `<button class="soon-open" data-act="session-info" data-sid="${esc(sid)}" aria-label="${esc(`${kind}: ${title.replace(/<[^>]+>/g, '')}, ${longDate(date)}`)}">${head}${ICON.right}</button>` : head}
      ${acts ? `<span class="soon-a">${acts}</span>` : ''}
      ${extra}
    </div></li>`;
}
function sessionSoon(s, me, kind) {
  const prod = S.productions.get(s.prodId);
  const out = me && isOut(s, me);
  const now = s.date === TODAY;
  const { acts, conv } = sessionActs(s, me, false);
  if (now && isShow(s)) return `<li class="soon-cd">${concertDayRow(s, prod, acts, conv)}</li>`;
  // A la fila, el lloc va sense enllaç (tota la fila obre la fitxa, que ja porta el mapa).
  const meta = [esc(s.place || ''), s.info?.call ? `Convocatòria a les <span class="num">${esc(s.info.call)}</span>` : '',
    out ? esc(onLeave(me, s.date) ? 'Estàs de baixa' : 'No fas aquesta producció') : ''].filter(Boolean).join(' · ');
  const extra = `${s.note ? `<span class="soon-note">${esc(s.note)}</span>` : ''}${conv}`;
  return soonRow({ date: s.date, time: timeRange(s), kind, title: esc(prodNames(s)), meta, extra, acts, tone: prod, now, count: isShow(s), sid: s.id });
}
/** El dia del concert: la targeta de dalt porta el cartell gran, la convocatòria, el vestuari i el lloc (amb el mapa). */
function concertDayRow(s, prod, acts, conv) {
  const i = s.info || {};
  const facts = [['Convocatòria', i.call ? `<span class="num">${esc(i.call)}</span>` : ''], ['Vestuari', esc(i.dress || '')], ['Lloc', placeLink(s.place || '')], ['Trobada', esc(i.meet || '')]].filter(([, v]) => v);
  return `<article class="concert-day next-card prod-tone" style="--ph:${prodHue(prod)}">
    ${prod?.poster ? `<button class="cd-poster" data-act="poster" data-pid="${esc(prod.id)}" aria-label="Cartell de ${esc(prod.name)}"><img src="${esc(prod.poster)}" alt=""></button>` : ''}
    <div class="cd-b">
      <span class="next-k"><em>Avui</em>${esc(s.type || V.sh.Show)}${s.time ? ` · <span class="num">${esc(timeRange(s))}</span>` : ''}</span>
      <h2 class="cd-t">${esc(prodNames(s))}</h2>
      ${facts.length ? `<dl class="cd-facts">${facts.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
      ${s.note ? `<p class="next-note">${esc(s.note)}</p>` : ''}
      <div class="next-a">${acts}${hasInfo(s) ? `<button class="btn btn-sm btn-ghost next-fx" data-act="session-info" data-sid="${s.id}">Tota la fitxa${ICON.right}</button>` : ''}</div>
      ${conv}
    </div></article>`;
}
function soonBlock(me, feat) {
  const rows = [];
  // Avui: totes les sessions del dia (menys la de la targeta de dalt).
  // Qui no fa la producció (o és de baixa) no la veu com si hi anés; l'equip sí, perquè n'ha de passar llista.
  for (const s of allSessions().filter(s => s.date === TODAY && s.id !== feat?.id && mySoon(s, me) && (canEdit() || !(me && isOut(s, me))))) rows.push({ key: `${s.date} ${s.time || ''}`, html: sessionSoon(s, me, s.type || 'Assaig') });
  const nx = nextClass();
  if (nx) {
    const clash = classClash(nx.c, nx.slot);
    rows.push({ key: `${nx.c.date} ${nx.slot.time || ''}`, html: soonRow({ date: nx.c.date, time: nx.slot.time || '', kind: 'La teva classe', title: esc(V.classes.replace(/^Classes/, 'Classe')), meta: esc([nx.c.place, teacherOf(nx.c)].filter(Boolean).join(' · ')),
      extra: clash ? `<span class="st-pill st-pending">Xoca amb ${esc(clash.type || 'l’assaig')}</span>` : '', now: nx.c.date === TODAY,
      acts: `<button class="btn btn-sm" data-act="cl-avisa" data-c="${esc(nx.c.id)}" data-s="${esc(nx.slot.id)}">Avisa…</button>` }) });
  }
  const later = allSessions().filter(s => s.date > TODAY && mySoon(s, me) && !(me && isOut(s, me)));
  const next = later.find(s => s.id !== feat?.id);
  const show = later.find(x => isShow(x) && x.id !== feat?.id);
  // Els set dies que vénen, sencers: la setmana del concert hi ha la pregeneral i el general, sovint en un altre lloc i a una
  // altra hora. Més enllà, només el proper assaig i el proper concert.
  const ahead = later.filter(s => s.date <= addDays(TODAY, 7) && s.id !== feat?.id);
  for (const s of [next, show]) if (s && !ahead.includes(s)) ahead.push(s);
  const nextLabel = feat && feat.date > TODAY && !isShow(feat) ? '' : 'Proper assaig';
  for (const s of ahead) rows.push({ key: `${s.date} ${s.time || ''}`, html: sessionSoon(s, me, s === next && nextLabel ? (isShow(s) ? V.sh.next : nextLabel) : s === show && !(feat && isShow(feat)) ? V.sh.next : s.type || 'Assaig') });
  // Les convocatòries que ja ha respost (les que falten són a «Per fer»): per canviar la resposta, l'autocar i els voluntaris.
  const shown = new Set([...ahead.map(s => s.id), feat?.id]);
  if (me) for (const s of openConvocations(me).filter(s => S.rsvp.get(`${s.id}_${me.id}`) && !shown.has(s.id) && s.date > TODAY)) rows.push({ key: `${s.date} ${s.time || ''}`, html: sessionSoon(s, me, 'Convocatòria') });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  if (!rows.length && feat) return `<div class="section-title"><h2 class="h2">Properament</h2><button class="btn btn-sm" data-act="week">La setmana</button></div>
    <p class="soon-none">No hi ha res més programat de moment.</p>`;
  return `<div class="section-title"><h2 class="h2">Properament</h2><button class="btn btn-sm" data-act="week">La setmana</button></div>
    ${rows.length ? `<ul class="soon-list">${rows.map(r => r.html).join('')}</ul>` : '<div class="todo-done"><span><b>Res a la vista</b><small>No tens cap assaig ni concert programat.</small></span></div>'}`;
}
/** Les absències i retards que ha avisat (del darrer mes o de sessions que encara han de venir). Si no n'hi ha cap, no surt
 *  res: «Avisa d'una absència» és a la targeta de la propera sessió i a «La meva assistència». withBtn = no hi ha cap
 *  d'aquests dos llocs, i llavors el botó va aquí. */
function myNoticesBlock(me, withBtn) {
  const mine = [...S.absences.values()].filter(a => a.memberId === me.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  // Els avisos de sessions que ja han passat de fa més d'un mes no hi fan res: queden a «La meva assistència».
  const recent = mine.filter(a => (a.createdAt || '').slice(0, 10) >= addDays(TODAY, -30) || (a.sessionIds || []).some(id => (sessionById(id)?.date || '') >= TODAY));
  if (!recent.length && !withBtn) return '';
  return `<div class="section-title"><h2 class="h2">Les meves absències</h2>${withBtn ? '<button class="btn btn-sm" data-act="absence-new">Avisa d’una absència</button>' : ''}</div>
    ${recent.length ? `<div class="panel">${recent.map(a => absenceCard(a, { mine: true })).join('')}</div>` : ''}`;
}
function viewHome() {
  const me = S.members.get(myMemberId());
  const name = me ? me.name : (ME()?.name || S.userName || '');
  const first = name.includes(',') ? name.split(',').pop().trim() : name.split(' ')[0];
  const lv = me ? leaveText(me) : '';
  const who = me ? `${esc(SEC[me.section].name)}${me.part ? ` ${esc(me.part)}` : ''}${lv ? ` · ${lv}` : ''}` : (ME() ? esc(rolesText(ME())) : '');
  const head = `<div class="page-head home-head"><div><div class="eyebrow">${esc(longDate(TODAY))}</div><h1 class="h1">Hola${first ? `, ${esc(first)}` : ''}</h1>${who ? `<div class="me-line">${who}</div>` : ''}</div></div>`;
  if (!me && !canEdit() && myMemberId()) return head + `<div class="empty">${staffSvg()}<h2 class="h2">Compte sense fitxa</h2><p>El teu correu encara no està vinculat a cap fitxa de la plantilla. Demana-ho a l’administració ${V.del}.</p></div>`;
  // Al mòbil, una columna: la propera sessió, Per fer, Properament, La meva assistència, les absències i els missatges.
  // A l'ordinador, dues: a l'esquerra la propera sessió, el que cal fer i el que ve; a la dreta la resta.
  const feat = featuredSession(me);
  const att = me ? myAttendanceCard(me) : '';
  const notices = me ? myNoticesBlock(me, !att && !(feat && feat.date >= TODAY && !isOut(feat, me))) : '';
  const msgs = messagesBlock();
  return `${head}
    ${installCard()}
    <div class="home">
      <div class="home-a">${feat ? `<section class="h-next">${nextCard(feat, me)}</section>` : ''}<section class="h-todo">${todoBlock(me, feat)}</section><section class="h-soon">${soonBlock(me, feat)}</section></div>
      <div class="home-b">${att ? `<section class="h-att">${att}</section>` : ''}${notices ? `<section class="h-notices">${notices}</section>` : ''}${msgs ? `<section class="h-msgs">${msgs}</section>` : ''}</div>
    </div>`;
}

/* ---------- La setmana ---------- */
// El que abans era el correu setmanal, fet sol amb el que ja hi ha a l'app: què es va fer els últims set dies (el pla de cada
// assaig i «què s'hi va fer»), què ve els pròxims deu (hores, aules, horari del dia i pla, només el que toca a cadascú), què cal
// respondre i què hi ha de nou al tauler. Si la direcció omple el pla de cada assaig, ningú no ha d'escriure res més.
const addDays = (iso, n) => isoDate(new Date(parseISO(iso).getTime() + n * 864e5));
function weekData() {
  const me = S.members.get(myMemberId());
  const staffView = canEdit() || !me;
  const mine = s => staffView || (convoked(s, me.section) && !isOut(s, me));
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  return {
    me, sec: staffView ? '' : me.section,
    past: allSessions().filter(s => s.date >= addDays(TODAY, -7) && s.date < TODAY && mine(s)),
    next: allSessions().filter(s => s.date >= TODAY && s.date <= addDays(TODAY, 10) && mine(s)),
    classes: classesOn() && me ? classDays().filter(c => c.date >= TODAY && c.date <= addDays(TODAY, 10) && classLive(c) && mySlot(c)).map(c => ({ c, x: mySlot(c) })) : [],
    polls: openPolls().filter(p => !me || staffView || !S.pollVotes.get(`${p.id}_${me.id}`)),
    trips: tripsSorted().filter(t => tripOpen(t) && (staffView || (tripForMe(t, me) && !signupOf(t, me.id)))),
    conv: me && !staffView ? openConvocations(me).filter(s => !S.rsvp.get(`${s.id}_${me.id}`)) : allSessions().filter(s => s.rsvp && s.date >= TODAY && s.date <= addDays(TODAY, 30)),
    news: visibleAnnouncements().filter(a => (a.createdAt || '') >= since),
    mats: productionsSorted().flatMap(p => (p.materials || []).filter(x => (x.at || '') >= since && (staffView || !x.section || x.section === me.section)).map(x => ({ p, x }))),
  };
}
function weekSession(s, d, past) {
  const sum = [s.time ? timeRange(s) : '', s.place || '', s.info?.call ? `convocatòria ${s.info.call}` : ''].filter(Boolean).join(' · ');
  const steps = infoSteps(s);
  return `<div class="wk-s${past ? ' past' : ''}"><div class="wk-sh"><b>${esc(longDate(s.date))}</b><span>${esc(s.type || 'Assaig')} · ${esc(prodNames(s))}</span></div>
    ${sum ? `<p class="m" style="margin:2px 0 0">${esc(sum)}</p>` : ''}${s.note ? `<p style="margin:4px 0 0;color:var(--accent)">${esc(s.note)}</p>` : ''}
    ${!past && steps.length ? `<ol class="steps">${steps.map(x => `<li><span class="mono">${esc(x.time || '')}</span><span><b>${esc(x.what || '')}</b>${x.where ? `<small>${esc(x.where)}</small>` : ''}</span></li>`).join('')}</ol>` : ''}
    ${planHtml(s, false, d.sec) || (past || isShow(s) ? '' : '<p class="m" style="margin:4px 0 0">Encara no hi ha pla d’assaig.</p>')}
    ${!past && hasInfo(s) && !steps.length ? fitxaChip(s) : ''}</div>`;
}
function weekHtml(d) {
  const block = (t, body) => body ? `<div class="section-title"><h2 class="h2">${t}</h2></div>${body}` : '';
  const ask = [
    ...d.conv.map(s => `<li><span><b>${esc(s.type)} del ${esc(shortDate(s.date))}</b><small>${d.me && !canEdit() ? 'Confirma si hi seràs' : `Convocatòria${s.rsvpBy ? ` · fins al ${ddmm(s.rsvpBy)}` : ''}`}</small></span></li>`),
    ...d.polls.map(p => `<li><span><b>${esc(p.title)}</b><small>Enquesta${p.closesAt ? ` · fins al ${ddmm(p.closesAt)}` : ''}</small></span></li>`),
    ...d.trips.map(t => `<li><span><b>${esc(t.title)}</b><small>Sortida · ${esc(tripDates(t))}${t.deadline ? ` · respon fins al ${ddmm(t.deadline)}` : ''}</small></span></li>`),
  ];
  return `<p class="muted" style="margin:0 0 6px;font-size:calc(13px*var(--ts))">${esc(capz(shortDate(addDays(TODAY, -7))))} – ${esc(shortDate(addDays(TODAY, 10)))}${d.sec ? ` · el que toca a ${esc(SEC[d.sec].name.toLowerCase())}` : ''}</p>
    ${block('Què farem', d.next.length ? d.next.map(s => weekSession(s, d, false)).join('') : '<p class="m">No hi ha cap sessió els pròxims deu dies.</p>')}
    ${d.classes.length ? block(esc(V.classes), `<ul class="tasks">${d.classes.map(({ c, x }) => `<li><span><b>${esc(longDate(c.date))} · ${esc(x.time || '')}</b><small>${esc([teacherOf(c), c.place].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>`) : ''}
    ${block('Per respondre', ask.length ? `<ul class="tasks">${ask.join('')}</ul>` : '')}
    ${block('Nou al tauler', d.news.length || d.mats.length ? `<ul class="tasks">${d.news.map(a => `<li><span><b>${esc(a.title)}</b><small>Anunci${a.author ? ` · ${esc(fullName(a.author))}` : ''}</small></span></li>`).join('')}${d.mats.map(({ p, x }) => `<li><span><b>${esc(x.title)}</b><small>${esc(MAT_KINDS[x.kind] || 'Material')} · ${esc(p.name)}</small></span></li>`).join('')}</ul>` : '')}
    ${block('Què vam fer', d.past.length ? d.past.slice().reverse().map(s => weekSession(s, d, true)).join('') : '')}`;
}
function weekText(d) {
  const line = s => `${longDate(s.date)} · ${s.type || 'Assaig'}${s.time ? ` · ${timeRange(s)}` : ''}${s.place ? ` · ${s.place}` : ''}`;
  return [`LA SETMANA · ${S.config.shortName || S.config.name || ''}`, '',
    'QUÈ FAREM', ...d.next.flatMap(s => [line(s), ...(stepsText(s) ? [stepsText(s)] : []), ...(planOf(s) ? [planText(s)] : []), '']),
    ...(d.past.length ? ['QUÈ VAM FER', ...d.past.flatMap(s => [line(s), ...(planOf(s) ? [s.plan.after || planText(s)] : []), ''])] : []),
    `Tot a l’app: ${appUrl()}`].join('\n');
}
function sheetWeek() {
  const d = weekData();
  openSheet({
    title: 'La setmana',
    wide: true,
    body: `<div class="week">${weekHtml(d)}</div>`,
    foot: `<button class="btn" id="wk-print">Imprimeix</button><span class="spacer"></span><button class="btn btn-primary" id="wk-copy">Copia-la</button>`,
    onMount: el => {
      el.querySelector('#wk-copy').onclick = () => copyText(weekText(d), 'Setmana copiada');
      el.querySelector('#wk-print').onclick = () => printDoc('La setmana', `<div class="week">${weekHtml(d)}</div>`);
    },
  });
}

function afterRender() {
  if (ui.tab === 'calendari' && !ui._calScrolled) {
    ui._calScrolled = true;
    const t = $('.cal-row.is-today') || $$('.cal-row').find(r => r.dataset.date >= TODAY);
    if (t && ui.calPast) t.scrollIntoView({ block: 'center' });
  }
  const ctx = $('#ctx');
  if (ctx) onScroll();
}
function onScroll() {
  const ctx = $('#ctx');
  if (ctx) ctx.classList.toggle('stuck', ctx.getBoundingClientRect().top <= 0 && window.scrollY > 40);
}
window.addEventListener('scroll', onScroll, { passive: true });
