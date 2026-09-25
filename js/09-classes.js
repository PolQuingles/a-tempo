// A Tempo · 09-classes.js — Classes de cant: la pantalla (el quadre del professorat, l'espai de cada professor/a i el dia a dia) i les dades que s'hi fan servir.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Classes: dades ---------- */
function saveClassDay(rec) { S.classes.set(rec.id, rec); persist('classes', rec.id, rec, 10); }
function saveClassReq(rec) { S.classReq.set(rec.id, rec); persist('classReq', rec.id, rec, 10); }
/** El professorat de l'agrupació: els comptes amb el rol, i els que encara no en tenen (config/main.teachers).
 *  Cada dia de classe i cada horari fix es guarda amb la clau del seu professor/a: el correu, o l'id de la fitxa. */
const teacherSeats = () => (S.config.teachers || []).filter(t => t && t.id && t.name);
const teacherOptions = () => {
  // Qui no edita no es baixa les fitxes de l'equip: la seva hi és igualment.
  ensureStaff();
  const accounts = [...S.staff.values()].filter(p => hasRole(p, 'voice'));
  const me = ME();
  if (me && hasRole(me, 'voice') && !accounts.some(p => p.email === me.email)) accounts.push(me);
  return [
    ...accounts.map(p => ({ key: p.email, name: p.name || p.email, account: true })).sort((a, b) => a.name.localeCompare(b.name, 'ca')),
    ...teacherSeats().map(t => ({ key: t.id, name: t.name, account: false })),
  ];
};
const teacherName = key => (ME() && ME().email === key && ME().name) || S.staff.get(key || '')?.name || teacherSeats().find(t => t.id === key)?.name || '';
/** Com es diu qui fa aquest dia de classe: el nom desat al dia serveix a qui no veu les fitxes de l'equip. */
const teacherOf = c => teacherName(c && c.teacher) || (c && c.teacherName) || (String(c && c.teacher || '').includes('@') ? V.Teacher : (c && c.teacher) || '');
/** De qui és l'horari fix que es toca: el meu si en soc, si no el primer professor/a de l'agrupació. */
function planWho() {
  const me = ME();
  if (me && hasRole(me, 'voice')) return me.email;
  return teacherOptions()[0]?.key || myEmail();
}
/** L'aula de cada dia de la setmana a l'horari fix: { 1: 'Aula 2 · Petit Palau', 3: … }. */
const planPlaces = who => ({ ...((S.classPlan.get(who) || {}).places || {}) });
function savePlan(who, rows, places = planPlaces(who)) {
  const clean = Object.fromEntries(Object.entries(places).map(([d, v]) => [d, String(v || '').trim().slice(0, 40)]).filter(([, v]) => v));
  const rec = { id: who, teacher: who, rows, places: clean, at: new Date().toISOString(), by: S.email || '' };
  S.classPlan.set(who, rec); persist('classPlan', who, rec, 10);
}

/* ---------- View: Classes de cant ---------- */
// El calendari de les classes, hora per hora. El professorat el fa i el manté; cada persona pot
// avisar que arribarà tard o que no hi anirà, i demanar el canvi d'hora d'un dia a un company.
const REQ_WORD = { late: 'Arribarà tard', absent: 'No hi anirà', swap: 'Canvi d’hora' };
const reqMemberName = r => S.members.get(r.memberId)?.name || r.memberName || '';
const slotAt = (c, id) => (c.slots || []).find(x => x.id === id);
const slotTime = (c, id) => slotAt(c, id)?.time || '';

function classReqLine(r) {
  const c = S.classes.get(r.classId);
  const when = c ? `${longDate(c.date)}${slotTime(c, r.slotId) ? `, a les ${slotTime(c, r.slotId)}` : ''}` : '';
  if (r.kind === 'late') return `${esc(reqMemberName(r))} arribarà ${r.mins ? `${r.mins} min ` : ''}tard · ${esc(when)}`;
  if (r.kind === 'absent') return `${esc(reqMemberName(r))} no hi podrà anar · ${esc(when)}`;
  if (r.kind === 'take') return `${esc(reqMemberName(r))} demana l’hora lliure · ${esc(when)}`;
  const otherTime = c ? slotTime(c, r.withSlotId) : '';
  if (!r.withMemberId) return `${esc(reqMemberName(r))} (${esc(slotTime(c, r.slotId) || '')}) busca algú per canviar l’hora · ${esc(when)}`;
  return `${esc(reqMemberName(r))} (${esc(slotTime(c, r.slotId) || '')}) vol canviar l’hora amb ${esc(S.members.get(r.withMemberId)?.name || r.withName || '')} (${esc(otherTime)}) · ${esc(when)}`;
}
function classSlotRow(c, x, past) {
  const m = S.members.get(x.memberId);
  const meNow = myId() && x.memberId === myId();
  const rq = slotReqs(c, x);
  const late = rq.find(r => r.kind === 'late');
  const absent = rq.find(r => r.kind === 'absent');
  const swap = rq.find(r => r.kind === 'swap');
  const clash = classClash(c, x);
  const takeReq = [...S.classReq.values()].find(r => r.kind === 'take' && r.classId === c.id && r.slotId === x.id && r.status === 'pending');
  const free = !x.memberId && !x.name && !past && classLive(c) && !!myId();
  const pills = [
    absent ? `<span class="st-pill ${absent.status === 'pending' ? 'st-pending' : 'st-rejected'}">No hi va</span>` : '',
    clash ? `<span class="st-pill st-pending">Xoca amb ${esc(clash.type || 'l’assaig')}${clash.time ? ` de les ${esc(clash.time)}` : ''}</span>` : '',
    takeReq ? `<span class="st-pill st-pending">Demanada${teachesClasses() || takeReq.memberId === myId() ? ` per ${esc(reqMemberName(takeReq))}` : ''}</span>` : '',
    late ? `<span class="st-pill ${late.status === 'pending' ? 'st-pending' : 'st-accepted'}">Tard${late.mins ? ` ${late.mins}′` : ''}</span>` : '',
    swap && swap.status === 'accepted' ? '<span class="st-pill st-accepted">Canvi</span>' : swap && swap.status === 'pending' ? '<span class="st-pill st-pending">Canvi demanat</span>' : '',
  ].filter(Boolean).join(' ');
  const acts = meNow && !past && classLive(c)
    ? `<span class="cl-acts">
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-k="late">Tard</button>
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-k="absent">No hi vaig</button>
        ${classSlots(c).length > 1 ? `<button class="btn btn-sm" data-act="cl-swap" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Canvia l’hora</button>` : ''}
      </span>`
    : '';
  const teach = teachesClasses();
  const note = (teach || meNow) ? classNoteFor(c.id, x.id) : null;
  const mark = x.mark ? `<span class="cl-mk ${x.mark}">${esc(STATUS[x.mark].short)}</span>` : '';
  const marks = teach && x.memberId && c.date <= TODAY
    ? `<span class="cl-marks" role="radiogroup" aria-label="Assistència de ${esc(m ? m.name : x.name || '')}">${CLASS_MARKS.map(k => `<button class="opt o-${k}" role="radio" aria-checked="${x.mark === k}" data-act="cl-mark" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-v="${k}"><i></i>${esc(STATUS[k].short)}</button>`).join('')}</span>`
    : '';
  const noteBtn = teach && x.memberId ? `<span class="cl-acts"><button class="btn btn-sm" data-act="cl-note" data-c="${esc(c.id)}" data-s="${esc(x.id)}">${note ? 'Canvia la nota' : '+ Nota'}</button></span>` : '';
  return `<div class="cl-slot ${meNow ? 'me' : ''}">
    <span class="t">${esc(x.time || '')}</span>
    <span class="who">${m && teach ? `<button class="who-b" data-act="cl-student" data-m="${esc(m.id)}">${esc(m.name)}</button>` : m ? esc(m.name) : x.name ? `${esc(x.name)} <span class="m">· sense fitxa</span>` : '<span class="cl-free">lliure</span>'}${m && m.section ? ` <span class="m">· ${esc(SEC[m.section].short)}</span>` : ''}${x.swapped ? ' <span class="m">(canviat)</span>' : ''}${pills || mark ? `<br>${[mark, pills].filter(Boolean).join(' ')}` : ''}${note && note.text ? `<span class="cl-note">${esc(note.text)}</span>` : ''}${note && note.file ? `<button class="cl-rec" data-act="cl-rec" data-id="${esc(note.id)}">▶ Enregistrament</button>` : ''}</span>
    ${acts}${free ? `<button class="btn btn-sm" data-act="cl-free" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Demana-la</button>` : ''}${marks}${noteBtn}</div>`;
}
/** Un dia de classe. Dins de l'espai d'un professor/a (inside) el dia i el nom ja són a dalt. */
function classDayCard(c, past, inside) {
  const teach = teachesClasses();
  const facts = [c.place, inside ? '' : teacherOf(c), c.note].filter(Boolean).join(' · ');
  const slots = classSlots(c);
  const edit = teach ? `<button class="icon-btn" data-act="cl-edit" data-c="${esc(c.id)}" aria-label="Edita el dia de classe">${ICON.more}</button>` : '';
  const head = inside
    ? (facts || c.cancelled || edit ? `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;min-height:26px">
        <span>${c.cancelled ? '<span class="st-pill st-rejected">Anul·lada</span> ' : ''}${facts ? `<span class="m">${esc(facts)}</span>` : ''}</span>${edit}</div>` : '')
    : `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <span><b>${esc(longDate(c.date))}</b>${c.cancelled ? ' <span class="st-pill st-rejected">Anul·lada</span>' : ''}${facts ? `<br><span class="m">${esc(facts)}</span>` : ''}</span>${edit}</div>`;
  return `<div class="cl-day ${c.cancelled ? 'off' : ''}">
    ${head}
    ${slots.length ? slots.map(x => classSlotRow(c, x, past)).join('') : '<p class="muted" style="margin:6px 0 0;font-size:calc(13px*var(--ts))">Encara no hi ha hores posades.</p>'}
  </div>`;
}
function classTeachers() {
  const out = teacherOptions().map(t => ({ ...t }));
  const seen = new Set(out.map(t => t.key));
  for (const c of S.classes.values()) {
    const k = c.teacher || '';
    if (k && !seen.has(k)) { seen.add(k); out.push({ key: k, name: teacherOf(c) }); }
  }
  return out;
}
const teacherInitials = name => ((String(name || '').match(/[\p{L}][\p{L}'’-]*/gu) || [])
  .filter(w => !['de', 'del', 'la', 'i', 'von', 'van'].includes(w.toLowerCase())).slice(0, 2)
  .map(w => w[0].toUpperCase()).join('') || '?');
/** Avisos pendents (retards, absències, hores demanades) de les classes d'aquest professor/a. */
const classPending = who => [...S.classReq.values()].filter(r => r.status === 'pending' && r.kind !== 'swap'
  && (S.classes.get(r.classId)?.teacher || '') === who);
function classWeekdays(days) {
  const ds = [...new Set(days.map(c => new Date(c.date + 'T12:00:00').getDay()))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!ds.length) return '';
  if (ds.length > 3) return ds.map(d => DAY_SHORT[d]).join(' ');
  const noms = ds.map(d => DAYS_CA[d]);
  return noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(', ')} i ${noms[noms.length - 1]}`;
}
/** Quantes hores i de quan a quan, per resumir un dia. */
function classDaySpan(c) {
  const sl = classSlots(c).filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time));
  if (!sl.length) return '';
  const last = sl[sl.length - 1];
  const end = hhmm((parseTime(last.time) ?? 0) + (+last.mins || 30));
  return `${sl.length} ${sl.length === 1 ? 'hora' : 'hores'} · ${sl[0].time}–${end}`;
}
/** El quadre del professorat: una casella per a cadascú, com les cordes de la llista. */
function classQuads() {
  const list = classTeachers();
  const teach = teachesClasses();
  const mid = myId();
  if (!list.length) {
    return `<div class="empty"><p>Encara no hi ha cap ${esc(V.Teacher.toLowerCase())}.${isAdmin()
      ? ` Dona accés a qui en faci amb el rol de ${esc(V.Teacher.toLowerCase())} a <b>Gestió › Personal</b>, o posa’n el nom a <b>Ajustos › ${esc(V.classes)}</b> si encara no entra a l’app.` : ''}</p>
      ${isAdmin() ? '<button class="btn btn-primary" data-act="manage" data-k="config">Ves a Ajustos</button>' : ''}</div>`;
  }
  const quads = list.map(t => {
    const days = classDays(t.key);
    const next = days.filter(c => c.date >= TODAY && classLive(c));
    const students = new Set();
    for (const c of days) for (const x of (c.slots || [])) if (x.memberId) students.add(x.memberId);
    const today = days.find(c => c.date === TODAY && classLive(c));
    const mineDay = mid ? next.find(c => classSlots(c).some(x => x.memberId === mid)) : null;
    const pend = teach ? classPending(t.key).length : 0;
    const sub = mineDay ? `La teva hora: ${shortDate(mineDay.date)} · ${classSlots(mineDay).find(x => x.memberId === mid).time}`
      : today ? 'Avui hi ha classe' : classWeekdays(next.slice(0, 10));
    const count = students.size ? `${students.size} ${students.size === 1 ? V.member : V.members}`
      : planRows(t.key).length ? `${planRows(t.key).length} hores fixes` : 'Sense classes';
    return `<button class="quad ${next.length ? '' : 'off'}" data-act="cl-who" data-k="${esc(t.key)}" aria-label="${esc(`${t.name}: ${count}`)}">
      ${pend ? '<i class="q-dot pend"></i>' : ''}${today ? '<i class="q-dot done"></i>' : ''}
      <span class="q-l q-ini">${esc(teacherInitials(t.name))}</span>
      <span class="q-n">${esc(t.name)}</span>
      <span class="q-c">${esc(count)}</span>
      ${sub ? `<span class="q-sub">${esc(sub)}</span>` : ''}
    </button>`;
  }).join('');
  const anyToday = list.some(t => classDays(t.key).some(c => c.date === TODAY && classLive(c)));
  const anyPend = teach && list.some(t => classPending(t.key).length);
  return `<div class="quads ${list.length === 4 ? '' : `n-other${list.length > 6 ? ' n-many' : ''}`}" data-n="${list.length}">${quads}</div>
    ${anyToday || anyPend ? `<div class="q-legend">${anyToday ? '<span><i style="background:var(--p)"></i>Avui hi ha classe</span>' : ''}${anyPend ? '<span><i style="background:var(--fnj)"></i>Té avisos per veure</span>' : ''}</div>` : ''}`;
}
/** L'espai d'un professor/a: el mes, el dia triat hora per hora i els dies que vénen. */
function classTeacherSpace(who) {
  const teach = teachesClasses();
  const mid = myId();
  const t = classTeachers().find(x => x.key === who) || { key: who, name: teacherName(who) || V.Teacher };
  const days = classDays(who);
  const next = days.filter(c => c.date >= TODAY && classLive(c));
  if (!/^\d{4}-\d{2}$/.test(ui.clMonth || '')) ui.clMonth = ((next[0] || days[days.length - 1] || {}).date || TODAY).slice(0, 7);
  const inMonth = days.filter(c => (c.date || '').slice(0, 7) === ui.clMonth);
  if (!ui.clDay || ui.clDay.slice(0, 7) !== ui.clMonth) ui.clDay = (inMonth.find(c => c.date >= TODAY) || inMonth[0] || {}).date || `${ui.clMonth}-01`;
  const byDay = new Map();
  for (const c of inMonth) { if (!byDay.has(c.date)) byDay.set(c.date, []); byDay.get(c.date).push(c); }
  const [y, mo] = ui.clMonth.split('-').map(Number);
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const nDays = new Date(y, mo, 0).getDate();
  const cells = Array.from({ length: lead }, () => '<span class="mday out" aria-hidden="true"></span>');
  for (let d = 1; d <= nDays; d++) {
    const iso = `${ui.clMonth}-${pad(d)}`;
    const cs = byDay.get(iso) || [];
    const mineHere = mid && cs.some(c => classLive(c) && classSlots(c).some(x => x.memberId === mid));
    const marks = cs.length ? `<i class="mk cl${mineHere ? ' mine' : ''}"></i>` : '';
    const hores = cs.reduce((n, c) => n + classSlots(c).length, 0);
    const label = `${longDate(iso)}${cs.length ? `: ${hores} ${hores === 1 ? 'hora' : 'hores'}${cs.some(c => c.cancelled) ? ', anul·lada' : ''}` : ', cap classe'}`;
    cells.push(`<button class="mday${iso === TODAY ? ' today' : ''}${iso === ui.clDay ? ' sel' : ''}${iso < TODAY ? ' past' : ''}" data-act="cl-day" data-date="${iso}" aria-pressed="${iso === ui.clDay}" aria-label="${esc(label)}"><span class="mnum">${d}</span><span class="mmarks">${marks}</span></button>`);
  }
  while (cells.length % 7) cells.push('<span class="mday out" aria-hidden="true"></span>');
  const title = capz(fmtD(`${ui.clMonth}-01`, { month: 'long', year: 'numeric' }));
  const dayClasses = byDay.get(ui.clDay) || [];
  const soon = next.filter(c => c.date !== ui.clDay).slice(0, 8);
  const students = new Set();
  for (const c of days) for (const x of (c.slots || [])) if (x.memberId) students.add(x.memberId);
  const facts = [students.size ? `${students.size} ${students.size === 1 ? V.member : V.members}` : '',
    classWeekdays(next.slice(0, 10)), next.length ? `${next.length} ${next.length === 1 ? 'dia' : 'dies'} per venir` : 'sense dies per venir'].filter(Boolean).join(' · ');
  return `<div class="cl-hero">
      <button class="nav-arrow" data-act="cl-back" aria-label="Tot el ${esc(V.Teacher.toLowerCase())}">${ICON.left}</button>
      <span class="cl-ini">${esc(teacherInitials(t.name))}</span>
      <span class="cl-h-t"><b>${esc(t.name)}</b><small>${esc(facts)}</small></span>
    </div>
    ${teach ? `<div class="sec-h" style="margin-top:0"><span class="muted" style="font-size:calc(13px*var(--ts))">Les classes d’aquest ${esc(V.Teacher.toLowerCase())}.</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="cl-paste" data-k="${esc(who)}">Enganxa un horari</button><button class="btn btn-sm btn-primary" data-act="cl-new" data-k="${esc(who)}" data-date="${esc(ui.clDay)}">+ Dia</button></span></div>` : ''}
    <div class="seg3 cl-view" role="radiogroup" aria-label="Vista">${[['month', 'Mes'], ['week', 'Setmana']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${(ui.clView || 'month') === k}" data-act="cl-view" data-k="${k}">${l}</button>`).join('')}</div>
    ${ui.clView === 'week' ? classWeekHtml(who) : `<div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cl-month" data-dir="-1" aria-label="Mes anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cl-month" data-dir="1" aria-label="Mes següent">${ICON.right}</button></div>
      <div class="mweek" aria-hidden="true">${['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="mgrid">${cells.join('')}</div>
      ${inMonth.length ? `<div class="mlegend"><span><i class="mk cl"></i>Dia de classe</span>${mid ? '<span><i class="mk cl mine"></i>Hi tens hora</span>' : ''}</div>`
        : '<p class="muted" style="margin:10px 4px 0;font-size:calc(13px*var(--ts))">Aquest mes no hi ha classes.</p>'}
    </div>
    <div class="section-title" style="margin-top:18px"><h2 class="h2">${esc(longDate(ui.clDay))}</h2>${dayClasses.length ? `<span class="eyebrow">${esc(classDaySpan(dayClasses[0]))}</span>` : ''}</div>
    ${dayClasses.length ? `<div class="panel">${dayClasses.map(c => classDayCard(c, c.date < TODAY, true)).join('')}</div>`
      : `<div class="panel" style="padding:14px;font-size:calc(13.5px*var(--ts));color:var(--muted)">Cap classe aquest dia.${teach ? ' Amb <b>+ Dia</b> en pots posar una.' : ''}</div>`}`}
    ${soon.length ? `<div class="section-title" style="margin-top:18px"><h2 class="h2">Properes classes</h2><span class="eyebrow">${soon.length}</span></div>
      <div class="cl-next">${soon.map(c => {
        const mineSlot = mid ? classSlots(c).find(x => x.memberId === mid) : null;
        const d = new Date(c.date + 'T12:00:00');
        return `<button data-act="cl-day" data-date="${esc(c.date)}">
          <span class="d"><b>${d.getDate()}</b><small>${esc(fmtD(c.date, { month: 'short' }).replace('.', ''))}</small></span>
          <span class="i"><b>${esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${c.cancelled ? 'Anul·lada' : esc(classDaySpan(c))}${c.place ? ` · ${esc(c.place)}` : ''}</small></span>
          <span class="${mineSlot && !c.cancelled ? 'mine mono' : 'muted mono'}" style="font-size:calc(13px*var(--ts))">${mineSlot && !c.cancelled ? esc(mineSlot.time) : ''}</span>
        </button>`;
      }).join('')}</div>` : ''}
    ${teach ? `<div class="panel" style="margin-top:14px">
      <div class="setting"><div><div class="t">Horari fix</div><div class="s">L’hora de cada setmana de cada ${esc(V.member)}: serveix per generar els dies d’un trimestre sencer de cop.</div></div>
        <button class="btn btn-sm" data-act="cl-plan" data-k="${esc(who)}">${planRows(who).length ? `Obre’l (${planRows(who).length} hores)` : 'Fes-lo'}</button></div>
      <div class="setting"><div><div class="t">Assistència del curs</div><div class="s">Qui ha vingut a classe i qui no, de tot el curs.</div></div>
        <button class="btn btn-sm" data-act="cl-stats">Mira-la</button></div>
    </div>` : ''}`;
}
function viewClasses() {
  const teach = teachesClasses();
  const answer = reqsToAnswer();
  const pending = teach ? reqsForTeacher() : [];
  const mineReq = myId() ? [...S.classReq.values()].filter(r => r.memberId === myId() && r.status === 'pending').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
  const myNotes = !teach && myId() ? [...S.classNotes.values()].filter(n => n.memberId === myId() && (n.text || n.file))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6) : [];
  const open = openSwaps();
  const openCard = r => {
    const c = S.classes.get(r.classId), mySl = mySlot(c);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> busca algú per canviar l’hora</div>
      <span class="muted" style="font-size:calc(13.5px*var(--ts))">${esc(longDate(c.date))} · té les <b>${esc(slotTime(c, r.slotId))}</b> i tu les <b>${esc(mySl ? mySl.time : '')}</b>. Només per aquell dia.</span>
      ${r.reason ? `<span style="font-size:calc(13px*var(--ts))">${esc(r.reason)}</span>` : ''}
      <span style="margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cl-open-take" data-r="${esc(r.id)}">Me’l quedo</button></span>
    </div>`;
  };
  const swapCard = r => {
    const c = S.classes.get(r.classId);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> et demana canviar l’hora</div>
      <span class="muted" style="font-size:calc(13.5px*var(--ts))">${c ? esc(longDate(c.date)) : ''} · ell/a té les <b>${esc(slotTime(c, r.slotId))}</b> i tu les <b>${esc(slotTime(c, r.withSlotId))}</b>. Només per aquest dia.</span>
      ${r.reason ? `<span style="font-size:calc(13px*var(--ts))">${esc(r.reason)}</span>` : ''}
      <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cl-answer" data-r="${esc(r.id)}" data-v="accepted">Accepto el canvi</button><button class="btn btn-sm" data-act="cl-answer" data-r="${esc(r.id)}" data-v="rejected">Ara no puc</button></span>
    </div>`;
  };
  const pendCard = r => `<div class="conv-card">
      <div class="a-h">${classReqLine(r)}</div>
      ${r.reason ? `<span style="font-size:calc(13px*var(--ts))">${esc(r.reason)}</span>` : ''}
      <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cl-review" data-r="${esc(r.id)}" data-v="accepted">Vist</button><button class="btn btn-sm" data-act="cl-review" data-r="${esc(r.id)}" data-v="rejected">No pot ser</button></span>
    </div>`;
  const mineCard = r => `<li><span>${classReqLine(r)}<br><span class="m">${r.kind === 'swap' ? 'Esperant que respongui' : 'Esperant que ho vegi el professorat'}</span></span>
      <button class="btn btn-sm" data-act="cl-cancel" data-r="${esc(r.id)}">Retira</button></li>`;
  const avisos = `${open.length ? `<div class="section-title"><h2 class="h2">Canvis d’hora oberts</h2><span class="eyebrow">qui vulgui</span></div>
      <div class="panel" style="display:grid;gap:10px;padding:12px">${open.map(openCard).join('')}</div>` : ''}
    ${answer.length ? `<div class="section-title"><h2 class="h2">Et demanen un canvi</h2><span class="eyebrow">respon</span></div><div class="panel" style="display:grid;gap:10px;padding:12px">${answer.map(swapCard).join('')}</div>` : ''}
    ${pending.length ? `<div class="section-title"><h2 class="h2">Avisos per veure</h2><span class="eyebrow">${pending.length}</span></div><div class="panel" style="display:grid;gap:10px;padding:12px">${pending.map(pendCard).join('')}</div>` : ''}
    ${mineReq.length ? `<div class="section-title"><h2 class="h2">Els teus avisos</h2></div><ul class="mini-list" style="max-height:none">${mineReq.map(mineCard).join('')}</ul>` : ''}`;
  const who = ui.clWho && classTeachers().some(t => t.key === ui.clWho) ? ui.clWho : null;
  if (!who && ui.clWho) ui.clWho = null;
  if (who) return `<div class="page-head" style="margin-bottom:0"><h1 class="h1">${esc(V.classes)}</h1></div>${avisos}${classTeacherSpace(who)}`;
  return `<div class="page-head"><h1 class="h1">${esc(V.classes)}</h1></div>
    <p class="muted" style="margin:-4px 2px 0;font-size:calc(13.5px*var(--ts))">Tria un ${esc(V.Teacher.toLowerCase())} per veure’n el calendari i les hores de cada ${esc(V.member)}.</p>
    ${avisos}
    ${classQuads()}
    ${myId() ? `<div class="panel" style="margin-top:18px">${teach ? '' : `<div class="setting"><div><div class="t">La teva assistència</div><div class="s">Les classes on has vingut durant el curs.</div></div>
      <button class="btn btn-sm" data-act="cl-mystats">Mira-la</button></div>`}
      <div class="setting"><div><div class="t">Les teves classes al calendari del mòbil</div><div class="s">Subscriu-t’hi i les tindràs al Google Calendar, a l’Apple o a l’Outlook, sempre al dia.</div></div>
        <button class="btn btn-sm" data-act="cl-ics">Com fer-ho</button></div></div>` : ''}
    ${myId() && !teach && inClasses() ? `<div class="panel" style="margin-top:12px"><div class="setting"><div><div class="t">La teva fitxa de cant</div><div class="s">Els objectius, el repertori que treballes i totes les notes i enregistraments de les classes.</div></div>
      <button class="btn btn-sm btn-primary" data-act="cl-student" data-m="${esc(myId())}">Obre-la</button></div></div>` : ''}
    ${myNotes.length ? `<div class="section-title"><h2 class="h2">Notes de les teves classes</h2></div>
      <ul class="mini-list" style="max-height:none">${myNotes.map(n => `<li style="display:grid;gap:4px"><span class="m mono">${esc(shortDate(n.date))}</span>${n.text ? `<span style="white-space:pre-wrap">${esc(n.text)}</span>` : ''}${n.file ? `<button class="btn btn-sm" style="justify-self:start" data-act="cl-rec" data-id="${esc(n.id)}">Escolta l’enregistrament</button>` : ''}</li>`).join('')}</ul>` : ''}
    <p class="muted" style="font-size:calc(13px*var(--ts));margin-top:14px">Els canvis d’hora valen només per al dia que es demanen. Qui rep la petició ha de dir que sí perquè es faci.</p>`;
}
