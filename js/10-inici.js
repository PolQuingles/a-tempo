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
// no la tingui instal·lada, Inici explica com fer-ho; després, proposa activar els avisos. «Ara no» l'amaga 30 dies.
const LS_INSTALL = 'atempo:installa';
function installCard() {
  if (PREVIEW || !(isiOS() || isAndroid())) return '';
  const hidden = +lsGet(LS_INSTALL) || 0;
  if (Date.now() - hidden < 30 * 864e5) return '';
  const hide = '<button class="btn btn-sm btn-ghost" data-act="install-hide">Ara no</button>';
  const icon = '<span class="todo-i"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg></span>';
  if (installed()) {
    if (!pushSupported() || S.pushOn) return '';
    return `<div class="install-card">${icon}<div><b>Activa els avisos al mòbil</b>
      <p>T’assabentaràs dels anuncis, de les convocatòries i dels canvis sense haver d’obrir l’app. Mai de nit.</p>
      <div class="install-acts"><button class="btn btn-sm btn-primary" data-act="push-setup">Activa’ls</button>${hide}</div></div></div>`;
  }
  const steps = installSteps();
  return `<div class="install-card">${icon}<div><b>Posa l’app a la pantalla d’inici</b>
    <p>${isiOS() ? 'Al iPhone és l’única manera de rebre els avisos al mòbil.' : 'La tindràs com una app més, i s’obre més de pressa.'}</p>
    ${steps.length ? `<ol>${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
    <div class="install-acts">${installPrompt ? '<button class="btn btn-sm btn-primary" data-act="install-go">Instal·la-la</button>' : ''}${hide}</div></div></div>`;
}
/** Els passos per posar l'app a la pantalla d'inici en aquest mòbil (buit si el Chrome ho fa amb un botó). */
function installSteps() {
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(navigator.userAgent);
  return isiOS()
    ? [inApp ? 'Obre aquest enllaç amb el <b>Safari</b> (menú «···» › Obre al navegador).' : '', 'Toca <b>Comparteix</b> <span class="ios-share" aria-hidden="true"></span> a la barra del navegador.', 'Tria <b>Afegeix a la pantalla d’inici</b> i toca <b>Afegeix</b>.', 'Obre l’app des de la icona nova i activa els avisos des de les teves inicials.'].filter(Boolean)
    : installPrompt ? [] : ['Obre el menú <b>⋮</b> del Chrome.', 'Tria <b>Instal·la l’aplicació</b> (o <b>Afegeix a la pantalla d’inici</b>).', 'Obre l’app des de la icona nova.'];
}
const canInstall = () => (isiOS() || isAndroid()) && !installed() && !PREVIEW;
/** La mateixa guia, des del menú del compte (encara que s'hagi tancat la targeta d'Inici). */
function sheetInstall() {
  const steps = installSteps();
  openSheet({
    title: 'Instal·la l’app',
    body: `<p style="margin-top:0">${isiOS() ? 'Al iPhone, posar l’app a la pantalla d’inici és l’única manera de rebre els avisos al mòbil.' : 'La tindràs com una app més, i s’obre més de pressa.'}</p>
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
    const prodP = S.productions.get(s.prodId);
    return `<div class="hero-cta today-hero${prodP?.poster ? ' has-poster' : ''}">${posterThumb(prodP)}
      <span class="eyebrow">Avui${s.time ? ` · ${esc(timeRange(s))}` : ''}</span>
      <h2 class="h2">${esc(s.type || 'Assaig')}</h2>
      <span style="font-size:calc(14px*var(--ts))">${[esc(s.place || ''), esc(prodNames(s)), s.info?.call ? `Convocatòria a les ${esc(s.info.call)}` : ''].filter(Boolean).join(' · ')}${out ? ` · ${esc(onLeave(me, TODAY) ? 'Estàs de baixa' : 'No fas aquesta producció')}` : ''}</span>
      ${s.note ? `<span style="font-size:calc(13px*var(--ts))">${esc(s.note)}</span>` : ''}
      ${hasInfo(s) ? fitxaChip(s) : ''}
      ${planChip(s)}
      ${action}
    </div>`;
  }).join('');
}
function viewHome() {
  const me = S.members.get(myMemberId());
  const name = me ? me.name : (ME()?.name || S.userName || '');
  const first = name.includes(',') ? name.split(',').pop().trim() : name.split(' ')[0];
  const lv = me ? leaveText(me) : '';
  const who = me ? `<b>${esc(me.name)}</b> · ${esc(SEC[me.section].name)}${me.part ? ` ${esc(me.part)}` : ''}${lv ? ` · ${lv}` : ''}`
    : `<b>${esc(name || myEmail())}</b>${ME() ? ` · ${esc(rolesText(ME()))}` : ''}`;
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
  const sessCard = (s, label) => `<div class="panel${S.productions.get(s.prodId)?.poster ? ' soon-card' : ''}" style="padding:14px">${S.productions.get(s.prodId)?.poster ? `${posterThumb(S.productions.get(s.prodId))}<div class="soon-t">` : '<div>'}<span class="eyebrow">${label}</span><br><b>${longDate(s.date)}</b><div class="muted" style="font-size:calc(13.5px*var(--ts))">${esc(s.type)}${s.time ? ` · ${esc(timeRange(s))}` : ''}${s.place ? ` · ${esc(s.place)}` : ''} · ${esc(prodNames(s))}</div>${s.note ? `<div style="font-size:calc(13px*var(--ts));color:var(--accent);margin-top:4px">${esc(s.note)}</div>` : ''}${hasInfo(s) ? fitxaChip(s) : ''}${planChip(s)}</div></div>`;
  const answered = me ? openConvocations(me).filter(s => S.rsvp.get(`${s.id}_${me.id}`)) : [];
  const ann = visibleAnnouncements().filter(a => !a.until || a.until >= TODAY).slice(0, 2);
  const missed = missedPlan(me);
  const soon = [
    missed ? `<div class="panel" style="padding:14px"><span class="eyebrow">No hi vas ser · ${esc(missed.type || 'Assaig')} del ${esc(shortDate(missed.date))}</span><br><b style="font-size:calc(14px*var(--ts))">Què s’hi va treballar</b>${planHtml(missed, false, me?.section)}</div>` : '',
    classCard,
    next ? sessCard(next, isShow(next) ? V.sh.next : 'Proper assaig') : '',
    show && show.id !== next?.id ? sessCard(show, V.sh.next) : '',
    answered.length ? `<div class="panel"><div class="todo-k" style="padding:12px 14px 0">Convocatòries que ja has respost</div>${answered.map(s => convCard(s, me)).join('')}</div>` : '',
    ann.length ? `<div class="panel">${ann.map(a => `<article class="ann ${a.pinned ? 'pinned' : ''}"><span class="eyebrow">Tauler</span><h3 class="ann-t" style="font-size:calc(17px*var(--ts))">${esc(a.title)}</h3>${a.body ? `<div class="ann-b rich">${richText(cutText(a.body, 220))}</div>` : ''}${(a.body || '').length > 220 || (a.files || []).length ? `<button class="btn btn-sm btn-ghost ann-more" data-act="ann-read" data-id="${esc(a.id)}">Llegeix-lo sencer${(a.files || []).length ? ` · ${a.files.length} ${a.files.length === 1 ? 'adjunt' : 'adjunts'}` : ''}</button>` : ''}<div class="ann-m"><span>${esc(a.author || '')}</span><span class="mono">${a.createdAt ? ddmm(a.createdAt.slice(0, 10)) : ''}</span></div></article>`).join('')}
        <div style="padding:0 14px 12px"><button class="btn btn-sm btn-ghost" data-act="board-news">Tot el tauler</button></div></div>` : '',
  ].filter(Boolean);
  const mine = me ? [...S.absences.values()].filter(a => a.memberId === me.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
  return `${head}
    ${installCard()}
    <div class="home-grid"><div class="home-a">
    ${todayBlock(me)}
    ${todoBlock(me)}
    ${messagesBlock()}
    </div><div class="home-b">
    ${soon.length ? `<div class="section-title"><h2 class="h2">Properament</h2><button class="btn btn-sm" data-act="week">La setmana</button></div><div class="soon">${soon.join('')}</div>` : ''}
    ${me ? `${myAttendanceCard(me)}
    <div class="section-title"><h2 class="h2">Els meus avisos</h2><button class="btn btn-sm btn-primary" data-act="absence-new">Avisa d’una absència</button></div>
    <p class="muted" style="margin:-2px 2px 10px;font-size:calc(13px*var(--ts))">Si no pots venir a un assaig, avisa amb temps: el teu ${V.leader} ho veurà i, si l’accepta, la falta quedarà justificada.</p>
    ${mine.length ? `<div class="panel">${mine.map(a => absenceCard(a, { mine: true })).join('')}</div>`
      : '<div class="panel" style="padding:14px;font-size:calc(13.5px*var(--ts));color:var(--muted)">Encara no has enviat cap avís.</div>'}` : ''}
    </div></div>`;
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
    ${block('Nou al tauler', d.news.length || d.mats.length ? `<ul class="tasks">${d.news.map(a => `<li><span><b>${esc(a.title)}</b><small>Anunci${a.author ? ` · ${esc(a.author)}` : ''}</small></span></li>`).join('')}${d.mats.map(({ p, x }) => `<li><span><b>${esc(x.title)}</b><small>${esc(MAT_KINDS[x.kind] || 'Material')} · ${esc(p.name)}</small></span></li>`).join('')}</ul>` : '')}
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
