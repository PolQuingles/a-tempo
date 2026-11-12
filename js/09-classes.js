// A Tempo · 09-classes.js — Classes de cant: la pantalla (el quadre del professorat, l'espai de cada professor/a i el dia a dia) i les dades que s'hi fan servir.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Classes: dades ---------- */
function saveClassDay(rec) { S.classes.set(rec.id, rec); persist('classes', rec.id, rec, 10); }
function saveClassReq(rec) { S.classReq.set(rec.id, rec); persist('classReq', rec.id, rec, 10); }
/** Baixa un mes antic quan algú l'obre. Torna '' si ja hi és, o 'loading' / 'error'. */
function needClassMonth(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '') || `${ym}-01` >= CLASS_FROM) return '';
  const st = CLASS_MONTHS.get(ym);
  if (st) return st === 'done' ? '' : st;
  CLASS_MONTHS.set(ym, 'loading');
  const range = q => q.where('date', '>=', `${ym}-01`).where('date', '<=', `${ym}-31`).get();
  (async () => {
    try {
      for (const d of (await range(db.collection('classes'))).docs) {
        const { syncAt, ...data } = d.data();
        if (!data.deleted && !S.classes.has(d.id)) { noteBase(`classes/${d.id}`, data); S.classes.set(d.id, data); }
      }
      if (isAdmin()) for (const d of (await range(db.collection('classNotes'))).docs) S.classNotes.set(d.id, d.data());
      CLASS_MONTHS.set(ym, 'done');
      if (ui.clDay === `${ym}-01`) ui.clDay = null;
    } catch { CLASS_MONTHS.set(ym, 'error'); }
    scheduleRender();
  })();
  return 'loading';
}
/** Què ha canviat per a cada alumne en tocar un dia de classe: [{ m: alumne, b: el text de l'avís }]. Ho envia avisos.py. */
function classChanges(prev, next) {
  if (prev?.cancelled || next?.cancelled) return [];
  if (!((prev && prev.date >= TODAY) || (next && next.date >= TODAY))) return [];
  const when = (c, x) => `${longDate(c.date).toLowerCase()} a les ${x.time}`;
  const hours = c => new Map(c ? classSlots(c).filter(x => x.memberId && x.time).map(x => [x.memberId, x]) : []);
  const was = hours(prev), now = hours(next), out = [];
  for (const [m, x] of was) {
    const y = now.get(m);
    if (!y) out.push({ m, b: `Ja no tens la classe de ${when(prev, x)}.` });
    else if (prev.date !== next.date || x.time !== y.time) out.push({ m, b: `La teva classe de ${when(prev, x)} passa a ${when(next, y)}.` });
    else if ((prev.place || '') !== (next.place || '') && next.place) out.push({ m, b: `La teva classe de ${when(next, y)} serà a ${next.place}.` });
  }
  for (const [m, y] of now) if (!was.has(m)) out.push({ m, b: `Tens una classe nova: ${when(next, y)}.` });
  return out;
}
/** Els camps que avisen d'aquests canvis. Si dos canvis seguits arriben abans de l'enviament, es guarden tots dos. */
function changeFields(prev, next) {
  const fresh = classChanges(prev, next);
  if (!fresh.length) return {};
  const recent = prev?.changedAt && Date.now() - Date.parse(prev.changedAt) < 45 * 60e3 ? (prev.changes || []).filter(o => !fresh.some(n => n.m === o.m)) : [];
  return { changes: [...recent, ...fresh], changedAt: new Date().toISOString() };
}
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
const teacherOf = c => fullName(teacherName(c && c.teacher) || (c && c.teacherName)) || (String(c && c.teacher || '').includes('@') ? V.Teacher : (c && c.teacher) || '');
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
const reqMemberName = r => S.members.get(r.memberId)?.name || fullName(r.memberName);
const slotAt = (c, id) => (c.slots || []).find(x => x.id === id);
const slotTime = (c, id) => c ? slotAt(c, id)?.time || '' : '';
/** L'hora de l'altra persona d'un canvi: «18:30» o, si és un altre dia, «dimecres 18:30». */
function swapOther(r, cid = swapWithClass(r), sid = r.withSlotId) {
  const oc = S.classes.get(cid), t = slotTime(oc, sid);
  return oc && cid !== r.classId ? `${fmtD(oc.date, { weekday: 'long' })} ${t}` : t;
}

function classReqLine(r) {
  const c = S.classes.get(r.classId);
  const when = c ? `${longDate(c.date)}${slotTime(c, r.slotId) ? `, a les ${slotTime(c, r.slotId)}` : ''}` : '';
  if (r.kind === 'late') return `${esc(reqMemberName(r))} arribarà ${r.mins ? `${r.mins} min ` : ''}tard · ${esc(when)}`;
  if (r.kind === 'absent') return `${esc(reqMemberName(r))} no hi podrà anar · ${esc(when)}`;
  if (r.kind === 'take') return `${esc(reqMemberName(r))} demana l’hora lliure · ${esc(when)}`;
  const otherTime = swapOther(r);
  if (!r.withMemberId && r.to) return `${esc(reqMemberName(r))} (${esc(slotTime(c, r.slotId) || '')}) demana canviar l’hora a ${esc(r.to.map(id => S.members.get(id)?.name || '').filter(Boolean).join(', '))} · ${esc(when)}`;
  if (!r.withMemberId) return `${esc(reqMemberName(r))} (${esc(slotTime(c, r.slotId) || '')}) busca algú per canviar l’hora · ${esc(when)}`;
  return `${esc(reqMemberName(r))} (${esc(slotTime(c, r.slotId) || '')}) vol canviar l’hora amb ${esc(S.members.get(r.withMemberId)?.name || fullName(r.withName))} (${esc(otherTime)}) · ${esc(when)}`;
}
/** Un avís per revisar. Una absència o un retard només cal saber-los; una hora lliure es dona o no. */
function classPendCard(r) {
  const c = S.classes.get(r.classId), sl = c && classSlots(c).find(x => x.memberId === r.memberId);
  const btn = (v, t, main) => `<button class="btn btn-sm${main ? ' btn-primary' : ''}" data-act="cl-review" data-r="${esc(r.id)}" data-v="${v}">${t}</button>`;
  const move = r.kind === 'absent' && sl && canMoveSlot(c, sl) ? `<button class="btn btn-sm" data-act="cl-move" data-c="${esc(c.id)}" data-s="${esc(sl.id)}">Mou la classe</button>` : '';
  return `<div class="conv-card">
      <div class="a-h">${classReqLine(r)}</div>
      ${r.reason ? `<span class="u-fs-t-13">${esc(r.reason)}</span>` : ''}
      <span class="u-d-flex u-gap-6 u-fw-wrap u-mt-6">${r.kind === 'take' ? btn('accepted', 'Dona-li l’hora', true) + btn('rejected', 'Ara no') : btn('accepted', 'Entesos', true) + move}</span>
    </div>`;
}
/** Una classe es pot moure si encara no s'ha fet, no té marca i no té un canvi d'hora acceptat. */
const canMoveSlot = (c, x) => !!x.memberId && classLive(c) && c.date >= TODAY && !x.mark && !x.swapped;
/** Una hora d'un dia de classe. plan: al calendari, que és per planificar (qui ve, a quina hora, moure-la): sense passar llista
 *  ni les notes, que són a Classes. */
function classSlotRow(c, x, past, plan) {
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
    clash && x.clashOk !== clash.id ? `<span class="st-pill st-pending">Xoca amb ${esc(clash.type || 'l’assaig')}${clash.time ? ` de les ${esc(clash.time)}` : ''}</span>` : '',
    takeReq ? `<span class="st-pill st-pending">Demanada${ownsClass(c) || takeReq.memberId === myId() ? ` per ${esc(reqMemberName(takeReq))}` : ''}</span>` : '',
    late ? `<span class="st-pill ${late.status === 'pending' ? 'st-pending' : 'st-accepted'}">Tard${late.mins ? ` ${late.mins}′` : ''}</span>` : '',
    swap && swap.status === 'accepted' ? '<span class="st-pill st-accepted">Canvi</span>' : swap && swap.status === 'pending' ? '<span class="st-pill st-pending">Canvi demanat</span>' : '',
  ].filter(Boolean).join(' ');
  const acts = meNow && !past && classLive(c)
    ? `<span class="cl-acts">
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-k="late">Tard</button>
        <button class="btn btn-sm" data-act="cl-notice" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-k="absent">No hi vaig</button>
        ${classSlots(c).length > 1 || weekClasses(c).length > 1 ? `<button class="btn btn-sm" data-act="cl-swap" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Canvia l’hora</button>` : ''}
      </span>`
    : '';
  const owner = ownsClass(c);
  const note = (owner || meNow) ? classNoteFor(c.id, x.id) : null;
  const priv = owner ? S.classPriv.get(`${c.id}_${x.id}`) : null;
  // Les marques d'assistència només les veuen qui fa la classe i la persona de qui són.
  const mark = x.mark && (owner || meNow) ? `<span class="cl-mk ${x.mark}">${esc(STATUS[x.mark].short)}</span>` : '';
  const marks = owner && !plan && x.memberId && c.date <= TODAY
    ? `<span class="cl-marks" role="radiogroup" aria-label="Assistència de ${esc(m ? m.name : x.name || '')}">${CLASS_MARKS.map(k => `<button class="opt o-${k}" role="radio" aria-checked="${x.mark === k}" data-act="cl-mark" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-v="${k}"><i></i>${esc(STATUS[k].short)}</button>`).join('')}</span>`
    : '';
  const canMove = owner && canMoveSlot(c, x);
  const noteBtn = plan ? (canMove ? `<span class="cl-acts cl-tools"><button class="btn btn-sm btn-ghost" data-act="cl-move" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Mou</button></span>` : '')
    : owner && x.memberId ? `<span class="cl-acts cl-tools"><button class="btn btn-sm btn-ghost" data-act="cl-note" data-c="${esc(c.id)}" data-s="${esc(x.id)}">${qlIcon('note')}${note || priv ? 'Edita la nota' : 'Nota de classe'}</button><button class="btn btn-sm btn-ghost" data-act="cl-rec-new" data-c="${esc(c.id)}" data-s="${esc(x.id)}">${qlIcon('rec')}Grava</button><button class="btn btn-sm btn-ghost" data-act="cl-student" data-m="${esc(x.memberId)}">${qlIcon('cls')}Fitxa</button>${canMove ? `<button class="btn btn-sm btn-ghost" data-act="cl-move" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Mou</button>` : ''}</span>` : '';
  // A qui fa la classe, abans de fer-la: el que va quedar de l'última i el que l'alumne ha afegit al quadern.
  const news = owner && !plan && m ? stuNews(m.id) : null;
  const prev = owner && !plan && m && !past && !note ? lastClassNote(m.id, c.date) : null;
  const work = owner && !plan && m ? repOf(m.id).find(w => w.status === 'treballant') : null;
  const shown = plan && owner ? null : note;
  return `<div class="cl-slot ${meNow ? 'me' : ''}${m || x.name ? '' : ' is-free'}">
    <span class="t"><b>${esc(x.time || '')}</b>${x.mins && (m || x.name) ? `<small>${+x.mins}′</small>` : ''}</span>
    <span class="who"><span class="who-l">${m && owner ? `<button class="who-b" data-act="cl-student" data-m="${esc(m.id)}">${esc(fullName(m.name))}</button>` : m ? esc(fullName(m.name)) : x.name ? `${esc(x.name)} <span class="m">· sense fitxa</span>` : '<span class="cl-free">Hora lliure</span>'}${m && m.section ? `<span class="m">${esc(SEC[m.section].short)}${m.part ? esc(m.part) : ''}</span>` : ''}${x.swapped ? '<span class="m">canviat</span>' : ''}</span>${pills || mark ? `<span class="cl-pills">${[mark, pills].filter(Boolean).join(' ')}</span>` : ''}${work ? `<span class="cl-work">${esc(work.title)}</span>` : ''}${news ? `<button class="cl-news" data-act="cl-student" data-m="${esc(m.id)}" data-k="quadern">${qlIcon(news.kind)}<span>${esc(freshText(news))}${news.kind === 'q' && news.text ? `: «${esc(news.text)}»` : ''}</span></button>` : ''}${prev ? `<span class="cl-prev"><b>Última classe · ${esc(shortDate(prev.date))}</b>${esc(prev.text)}</span>` : ''}${shown && shown.text ? `<span class="cl-note">${esc(shown.text)}</span>` : ''}${!plan && priv && priv.text ? `<span class="cl-note cl-priv"><b>Privada</b> ${esc(priv.text)}</span>` : ''}${shown && shown.file ? `<button class="cl-rec" data-act="cl-rec" data-id="${esc(note.id)}">${qlIcon('play')}Enregistrament</button>` : ''}</span>
    ${acts}${free ? `<button class="btn btn-sm" data-act="cl-free" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Demana-la</button>` : ''}${marks}${noteBtn}</div>`;
}
/** La nota de l'última classe d'un alumne abans d'una data (de les que hi ha al mòbil). */
function lastClassNote(mid, before) {
  let best = null;
  for (const n of S.classNotes.values()) if (n.memberId === mid && n.text && (n.date || '') < before && (!best || n.date > best.date)) best = n;
  return best;
}
/** Un dia de classe. Dins de l'espai d'un professor/a (inside) el dia i el nom ja són a dalt; plan: al calendari (vegeu classSlotRow). */
function classDayCard(c, past, inside, plan) {
  const teach = teachesClasses();
  const facts = [c.place, inside ? '' : teacherOf(c), c.note].filter(Boolean).join(' · ');
  const slots = classSlots(c);
  const edit = teach ? `<button class="icon-btn" data-act="cl-edit" data-c="${esc(c.id)}" aria-label="Edita el dia de classe">${ICON.more}</button>` : '';
  const head = inside
    ? (facts || c.cancelled || edit ? `<div class="u-d-flex u-jc-space-between u-gap-10 u-ai-center u-minh-26">
        <span>${c.cancelled ? '<span class="st-pill st-rejected">Anul·lada</span> ' : ''}${facts ? `<span class="m">${esc(facts)}</span>` : ''}</span>${edit}</div>` : '')
    : `<div class="u-d-flex u-jc-space-between u-gap-10 u-ai-center">
        <span><b>${esc(longDate(c.date))}</b>${c.cancelled ? ' <span class="st-pill st-rejected">Anul·lada</span>' : ''}${facts ? `<br><span class="m">${esc(facts)}</span>` : ''}</span>${edit}</div>`;
  return `<div class="cl-day ${c.cancelled ? 'off' : ''}">
    ${head}
    ${slots.length ? slots.map(x => classSlotRow(c, x, past, plan)).join('') : '<p class="muted u-m-6-0-0 u-fs-t-13">Encara no hi ha hores posades.</p>'}
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
const classPending = who => reqsForTeacher().filter(r => (S.classes.get(r.classId)?.teacher || '') === who);
function classWeekdays(days) {
  const ds = [...new Set(days.map(c => new Date(c.date + 'T12:00:00').getDay()))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!ds.length) return '';
  if (ds.length > 3) return ds.map(d => DAY_SHORT[d]).join(' ');
  const noms = ds.map(d => DAYS_CA[d]);
  return noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(', ')} i ${noms[noms.length - 1]}`;
}
/** Quantes classes (i hores lliures) i de quan a quan, per resumir un dia: «3 classes i 1 hora lliure · 17:00–19:00». (Abans
 *  deia «4 hores · 17:00–19:00», que semblava que durés quatre hores.) */
function classDaySpan(c) {
  const sl = classSlots(c).filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time));
  if (!sl.length) return '';
  const last = sl[sl.length - 1];
  const end = hhmm((parseTime(last.time) ?? 0) + (+last.mins || 30));
  const n = sl.filter(x => x.memberId || x.name).length, free = sl.length - n;
  const what = [n ? `${n} ${n === 1 ? 'classe' : 'classes'}` : '', free ? `${free} ${free === 1 ? 'hora lliure' : 'hores lliures'}` : ''].filter(Boolean).join(' i ');
  return `${what} · ${sl[0].time}–${end}`;
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
    const sub = mineDay ? `La teva hora: ${dayLabel(mineDay.date).toLowerCase() || shortDate(mineDay.date)} · ${classSlots(mineDay).find(x => x.memberId === mid).time}`
      : today ? 'Avui hi ha classe' : classWeekdays(next.slice(0, 10));
    const count = students.size ? `${students.size} ${students.size === 1 ? V.member : V.members}`
      : planRows(t.key).length ? nPl(planRows(t.key).length, 'hora fixa', 'hores fixes') : 'Sense classes';
    return `<button class="quad ${next.length ? '' : 'off'}" data-act="cl-who" data-k="${esc(t.key)}" aria-label="${esc(`${t.name}: ${count}`)}">
      ${pend ? '<i class="q-dot pend"></i>' : ''}${today ? '<i class="q-dot done"></i>' : ''}
      <span class="q-l q-ini">${esc(teacherInitials(t.name))}</span>
      <span class="q-n">${esc(t.name)}</span>
      <span class="q-c">${esc(count)}</span>
      ${sub ? `<span class="q-sub">${esc(sub)}</span>` : ''}
    </button>`;
  }).join('');
  const anyPend = teach && list.some(t => classPending(t.key).length);
  return `<div class="quads cl-quads ${list.length === 4 ? '' : `n-other${list.length > 6 ? ' n-many' : ''}`}" data-n="${list.length}">${quads}</div>
    ${anyPend ? '<div class="q-legend"><span><i class="u-bg-fnj"></i>Té canvis per veure</span></div>' : ''}`;
}
/** El calendari d'un professor/a: les eines (si en dona), el mes o la setmana, i el dia triat hora per hora. */
function classTeacherSpace(who) {
  const teach = teachesClasses();
  const mid = myId();
  const days = classDays(who);
  const next = days.filter(c => c.date >= TODAY && classLive(c));
  if (!/^\d{4}-\d{2}$/.test(ui.clMonth || '')) ui.clMonth = ((next[0] || days[days.length - 1] || {}).date || TODAY).slice(0, 7);
  const monthState = needClassMonth(ui.clMonth);
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
    const off = cs.length && cs.every(c => c.cancelled);
    cells.push(`<button class="mday${iso === TODAY ? ' today' : ''}${iso === ui.clDay ? ' sel' : ''}${iso < TODAY ? ' past' : ''}${cs.length ? ' has-cl' : ''}${mineHere ? ' has-mine' : ''}${off ? ' is-off' : ''}" data-act="cl-day" data-date="${iso}" aria-pressed="${iso === ui.clDay}" aria-label="${esc(label)}"><span class="mnum">${d}</span><span class="mmarks">${marks}</span>${cs.length && teach ? `<span class="mcount">${hores}</span>` : ''}</button>`);
  }
  while (cells.length % 7) cells.push('<span class="mday out" aria-hidden="true"></span>');
  const title = capz(fmtD(`${ui.clMonth}-01`, { month: 'long', year: 'numeric' }));
  const dayClasses = byDay.get(ui.clDay) || [];
  return `${teach ? `<div class="cl-toolbar" role="toolbar" aria-label="Eines del calendari">
      <button class="btn btn-sm btn-primary" data-act="cl-new" data-k="${esc(who)}" data-date="${esc(ui.clDay)}">${ICON.plus}Dia de classe</button>
      <button class="btn btn-sm" data-act="cl-plan" data-k="${esc(who)}">Horari fix${planRows(who).length ? `<span class="tb-n">${planRows(who).length}</span>` : ''}</button>
      <button class="btn btn-sm" data-act="cl-paste" data-k="${esc(who)}">Enganxa un horari</button>
    </div>` : ''}
    ${ownsClass({ teacher: who }) ? unlinkedPanel(who) : ''}
    ${ui.clView === 'week' ? classWeekHtml(who) : `<div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cl-month" data-dir="-1" aria-label="Mes anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cl-month" data-dir="1" aria-label="Mes següent">${ICON.right}</button></div>
      <div class="mweek" aria-hidden="true">${['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="mgrid">${cells.join('')}</div>
      ${inMonth.length ? `<div class="mlegend"><span><i class="lg-cl"></i>Dia de classe${teach ? ' (amb les hores)' : ''}</span>${mid ? '<span><i class="lg-cl mine"></i>Hi tens hora</span>' : ''}<span><i class="lg-today"></i>Avui</span></div>`
        : `<p class="muted u-m-10-4-0 u-fs-t-13">${monthState === 'loading' ? 'Carregant aquest mes…' : monthState === 'error' ? 'No s’ha pogut carregar aquest mes. Comprova la connexió.' : 'Aquest mes no hi ha classes.'}</p>`}
    </div>
    <div class="section-title u-mt-18 cl-dayhead"><h2 class="h2">${esc(longDate(ui.clDay))}</h2>${dayClasses.length ? `<span class="eyebrow">${esc(classDaySpan(dayClasses[0]))}</span>` : ''}</div>
    ${dayClasses.length ? `<div class="panel">${dayClasses.map(c => classDayCard(c, c.date < TODAY, true, true)).join('')}</div>
      ${ui.clDay <= TODAY && dayClasses.some(c => ownsClass(c) && classLive(c)) ? `<button class="btn btn-sm btn-primary u-mt-10" data-act="cl-roll-open" data-date="${esc(ui.clDay)}">${dayClasses.some(c => ownsClass(c) && unmarkedSlots(c).length) ? 'Passa llista' : 'Assistència i notes'} d’aquest dia${ICON.right}</button>` : ''}`
      : `<div class="panel u-p-14 u-fs-t-13 u-c-muted">Cap classe aquest dia.${teach ? ' Amb <b>+ Dia de classe</b> en pots posar una.' : ''}</div>`}`}`;

}
const clViewSeg = () => `<div class="seg3 cl-view" role="radiogroup" aria-label="Vista">${[['month', 'Mes'], ['week', 'Setmana']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${(ui.clView || 'month') === k}" data-act="cl-view" data-k="${k}">${l}</button>`).join('')}</div>`;
/** De qui es mostra el calendari de les classes: el triat, si no el meu si en dono, si no el de la meva propera classe (o
 *  l'última), si no el primer. */
function classCalWho(list = classTeachers()) {
  if (ui.clWho && list.some(t => t.key === ui.clWho)) return ui.clWho;
  if (iHave('voice') && list.some(t => t.key === myEmail())) return myEmail();
  const mid = myId();
  if (mid) {
    const { next, last } = studentClassFacts(mid);
    const k = (next || last)?.c.teacher;
    if (k && list.some(t => t.key === k)) return k;
  }
  if (list.some(t => t.key === myEmail())) return myEmail();
  return list[0]?.key || '';
}
/** El calendari de les classes a la pantalla de Classes: el selector de professor/a (si n'hi ha més d'un) i el seu mes. */
function classCalBlock(list) {
  const who = classCalWho(list);
  if (!who) return '';
  const pick = list.length > 1 ? `<div class="chips cl-pick" role="group" aria-label="De quin ${esc(V.Teacher.toLowerCase())}">${list.map(t => `<button class="chip" data-act="cl-who" data-k="${esc(t.key)}" aria-pressed="${t.key === who}">${esc(t.name)}</button>`).join('')}</div>` : '';
  const name = list.find(t => t.key === who)?.name || '';
  return `<section id="cl-cal" class="cl-cal" aria-label="Calendari de les classes">
    <div class="section-title cl-cal-h"><h2 class="h2">Calendari${list.length === 1 && name ? `<small>${esc(name)}</small>` : ''}</h2>${clViewSeg()}</div>
    ${pick}${classTeacherSpace(who)}</section>`;
}
/** El professorat, plegat: les caselles de cadascú (amb quants alumnes i quan fa classe). Tocar-ne una en mostra el calendari. */
function classProfBlock(list) {
  if (!list.length) return classQuads();
  const names = list.map(t => t.name).join(' · ');
  return `<details class="np-group cl-prof"${ui.clProfOpen ? ' open' : ''}><summary><span class="cl-prof-s"><b>El professorat</b><small>${esc(names)}</small></span>${ICON.chev}</summary>
    ${classQuads()}</details>`;
}
/** L'horari fix en resum, al peu del calendari: un bloc per dia de la setmana, amb l'aula i les hores. */
function planSummaryHtml(who) {
  const rows = planRows(who), places = planPlaces(who);
  const days = [...new Set(rows.map(r => +r.day))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return `<div class="section-title"><h2 class="h2">Horari fix</h2><button class="btn btn-sm" data-act="cl-plan" data-k="${esc(who)}">${rows.length ? 'Edita’l' : 'Fes-lo'}</button></div>
    ${rows.length ? `<div class="plan-sum">${days.map(d => { const rs = rows.filter(r => +r.day === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')); return `<div class="ps-day">
        <div class="ps-h"><b>${esc(capz(DAYS_CA[d]))}</b><small>${esc([`${rs.length} ${rs.length === 1 ? 'hora' : 'hores'}`, places[d] || ''].filter(Boolean).join(' · '))}</small></div>
        <ul>${rs.map(r => `<li><span class="mono">${esc(r.time || '')}</span><span>${esc(fullName(S.members.get(r.memberId)?.name || r.name || '')) || '<span class="cl-free">Hora lliure</span>'}</span></li>`).join('')}</ul></div>`; }).join('')}</div>
      <p class="ql-hint">Des de l’horari fix es generen tots els dies d’un període de cop. Els canvis d’un dia concret es fan al calendari.</p>`
      : `<p class="ql-hint">L’hora de cada setmana de cada ${esc(V.member)}. Amb l’horari fix generes tots els dies d’un trimestre de cop.</p>`}`;
}
/** La pestanya Classes. Qui fa o dona classes hi té una barra pròpia (vegeu clTabKeys): Classes, Calendari, Alumnes i Espai
 *  personal. Qui només les mira (l'administració), totes les classes en una pantalla. */
function viewClasses() {
  if (!clTabKeys().length) return viewAllClasses();
  ui.clTab = clTabNow();
  if (ui.clTab === 'alumnes') return viewStudents();
  if (ui.clTab === 'calendari') return viewClassCal();
  if (ui.clTab === 'espai') return viewStudentSpace();
  return viewClassHome();
}
/** Les peticions de canvi d'hora i els avisos: les que em demanen, les obertes, les que he fet i (pending) les que ha de veure
 *  el professorat. */
function classAvisosHtml(pending) {
  const answer = reqsToAnswer();
  const mineReq = myId() ? [...S.classReq.values()].filter(r => r.memberId === myId() && r.status === 'pending' && reqOpen(r)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [];
  const open = openSwaps();
  const openCard = r => {
    const c = S.classes.get(r.classId), mySl = mySwapSlot(r);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> busca algú per canviar l’hora</div>
      <span class="muted u-fs-t-13">${esc(longDate(c.date))} · té les <b>${esc(slotTime(c, r.slotId))}</b> i tu ${mySl && mySl.c.id !== c.id ? `el ${esc(longDate(mySl.c.date))} ` : ''}les <b>${esc(mySl ? mySl.x.time : '')}</b>. Només per aquella setmana.</span>
      ${r.reason ? `<span class="u-fs-t-13">${esc(r.reason)}</span>` : ''}
      <span class="u-mt-6"><button class="btn btn-sm btn-primary" data-act="cl-open-take" data-r="${esc(r.id)}">Me’l quedo</button></span>
    </div>`;
  };
  const swapCard = r => {
    const c = S.classes.get(r.classId);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> et demana canviar l’hora</div>
      <span class="muted u-fs-t-13">${c ? esc(longDate(c.date)) : ''} · ell/a té les <b>${esc(slotTime(c, r.slotId))}</b> i tu ${swapWithClass(r) !== r.classId ? 'el ' : 'les '}<b>${esc(swapOther(r))}</b>. Només per aquella setmana.</span>
      ${r.reason ? `<span class="u-fs-t-13">${esc(r.reason)}</span>` : ''}
      <span class="u-d-flex u-gap-6 u-fw-wrap u-mt-6"><button class="btn btn-sm btn-primary" data-act="cl-answer" data-r="${esc(r.id)}" data-v="accepted">Accepto el canvi</button><button class="btn btn-sm" data-act="cl-answer" data-r="${esc(r.id)}" data-v="rejected">Ara no puc</button></span>
    </div>`;
  };
  const mineCard = r => `<li><span>${classReqLine(r)}<br><span class="m">${r.kind === 'swap' ? 'Esperant que respongui' : 'Esperant que ho vegi el professorat'}</span></span>
      <button class="btn btn-sm" data-act="cl-cancel" data-r="${esc(r.id)}">Retira</button></li>`;
  return `${open.length ? `<div class="section-title"><h2 class="h2">Canvis d’hora oberts</h2><span class="eyebrow">qui vulgui</span></div>
      <div class="panel u-d-grid u-gap-10 u-p-12">${open.map(openCard).join('')}</div>` : ''}
    ${answer.length ? `<div class="section-title"><h2 class="h2">Et demanen un canvi</h2><span class="eyebrow">respon</span></div><div class="panel u-d-grid u-gap-10 u-p-12">${answer.map(swapCard).join('')}</div>` : ''}
    ${pending.length ? `<div class="section-title"><h2 class="h2">Absències i canvis per veure</h2><span class="eyebrow">${pending.length}</span></div><div class="panel u-d-grid u-gap-10 u-p-12">${pending.map(classPendCard).join('')}</div>` : ''}
    ${mineReq.length ? `<div class="section-title"><h2 class="h2">Les teves absències i canvis</h2></div><ul class="mini-list u-maxh-none">${mineReq.map(mineCard).join('')}</ul>` : ''}`;
}
/** Classes, el dia a dia. El professorat: la llista d'avui (marcar, la nota de classe, la fitxa i moure l'hora) i els dies per
 *  acabar de marcar. Qui en fa: la seva propera classe, les properes i, plegat, el professorat. */
function viewClassHome() {
  const teach = iHave('voice'), student = inClasses();
  const mid = myId();
  const list = classTeachers();
  // Les meves properes classes, després de la de la targeta.
  const mine = student ? classDays().filter(c => c.date >= TODAY && classLive(c) && classSlots(c).some(x => x.memberId === mid)).slice(1, 5) : [];
  return `<div class="page-head"><h1 class="h1">${esc(V.classes)} ${helpBtn('classes')}</h1>${teachesClasses() ? '<button class="btn btn-sm" data-act="cl-stats">Assistència del curs</button>' : ''}</div>
    ${helpText('classes', teach
      ? `Aquí hi ha les classes d’avui: marca qui ha vingut, escriu la nota de classe, obre la fitxa de l’alumne o mou-li l’hora. Al <b>Calendari</b> hi ha tots els dies i l’horari fix, i a <b>Alumnes</b>, la fitxa de cadascú.`
      : `Aquí hi ha la teva propera classe i les peticions de canvi d’hora. Els canvis valen només per a la setmana que es demanen, i qui rep la petició ha de dir que sí perquè es faci. Al <b>Calendari</b> hi ha tots els dies, i a l’<b>Espai personal</b>, el teu quadern i l’assistència.`)}
    ${student ? studentNextCard() : ''}
    ${classAvisosHtml(teach || !teachesClasses() ? [] : reqsForTeacher())}
    ${teach ? classRollBody() : teachesClasses() ? clashBanner() : ''}
    ${mine.length ? `<div class="section-title"><h2 class="h2">${teach ? 'Les teves properes classes' : 'Properes classes'}</h2></div>
      <div class="cl-next">${mine.map(c => { const x = classSlots(c).find(s => s.memberId === mid), d = new Date(c.date + 'T12:00:00'); return `<button data-act="cl-go-day" data-k="${esc(c.teacher)}" data-date="${esc(c.date)}">
        <span class="d"><b>${d.getDate()}</b><small>${esc(fmtD(c.date, { month: 'short' }).replace('.', ''))}</small></span>
        <span class="i"><b>${esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${esc(teacherOf(c) || V.Teacher)}${c.place ? ` · ${esc(c.place)}` : ''}</small></span>
        <span class="mine mono u-fs-t-13">${esc(x?.time || '')}</span></button>`; }).join('')}</div>` : ''}
    ${student ? `<div class="u-mt-18">${classProfBlock(list)}</div>` : ''}`;
}
/** El calendari de les classes: el mes (o la setmana) de cada professor/a, amb el selector a dalt. Qui només dona classes hi
 *  veu el seu; qui en fa (o l'administració), el de tothom. */
function viewClassCal() {
  const me = myEmail(), teach = iHave('voice');
  const list = classTeachers().filter(t => !teach || inClasses() || isAdmin() || t.key === me);
  const who = classCalWho(list);
  if (!who) return `<div class="page-head"><h1 class="h1">Calendari</h1></div><div class="empty">${staffSvg()}<p>Encara no hi ha cap dia de classe.</p></div>`;
  const own = who === me && teach;
  const name = list.find(t => t.key === who)?.name || '';
  const pick = list.length > 1 ? `<div class="chips cl-pick" role="group" aria-label="De quin ${esc(V.Teacher.toLowerCase())}">${list.map(t => `<button class="chip" data-act="cl-who" data-k="${esc(t.key)}" aria-pressed="${t.key === who}">${esc(t.key === me && teach ? 'El meu' : t.name)}</button>`).join('')}</div>` : '';
  return `<div class="page-head cl-cal-head"><div><div class="eyebrow">${esc(own || pick ? V.classes : name || V.classes)}</div><h1 class="h1">Calendari</h1></div>${clViewSeg()}</div>
    <section id="cl-cal" class="cl-cal" aria-label="Calendari de les classes">${pick}${classTeacherSpace(who)}</section>
    ${own ? `<div class="u-mt-18">${planSummaryHtml(who)}</div>` : ''}
    ${myId() || teach ? `<div class="panel link-list u-mt-18">
      <button class="link-row" data-act="cl-ics"><span><b>Les classes al calendari del mòbil</b><small>Google Calendar, Apple o Outlook, sempre al dia</small></span>${ICON.right}</button>
    </div>` : ''}`;
}
/** Totes les classes, per a qui només les mira (l'administració): el que cal veure, el calendari de cada professor/a i el
 *  professorat. */
function viewAllClasses() {
  const list = classTeachers();
  if (ui.clWho && !list.some(t => t.key === ui.clWho)) ui.clWho = null;
  return `<div class="page-head"><h1 class="h1">${esc(V.classes)} ${helpBtn('classes')}</h1>${teachesClasses() ? '<button class="btn btn-sm" data-act="cl-stats">Assistència del curs</button>' : ''}</div>
    ${helpText('classes', `Al calendari hi ha els dies de classe i les hores de cada ${esc(V.member)}${list.length > 1 ? `; a dalt tries de quin ${esc(V.Teacher.toLowerCase())}` : ''}. Els canvis d’hora valen només per a la setmana que es demanen.`)}
    ${classAvisosHtml(teachesClasses() ? reqsForTeacher() : [])}
    ${teachesClasses() ? clashBanner() : ''}
    ${list.length ? classCalBlock(list) : ''}
    ${classProfBlock(list)}`;
}

/* ---------- El professorat de cant ---------- */
// A Classes, la seva feina (vegeu 03b-rols): la Llista (passar llista a les classes de cada dia) i els Alumnes (la fitxa de cant
// de cadascú: objectius, repertori, notes i enregistraments). Al Calendari, els dies i l'hora de cada alumne.
const myTeacherKey = () => myEmail();
/** Les hores d'aquest professor/a que tenen alumne i encara no s'han marcat. */
const unmarkedSlots = c => classSlots(c).filter(x => x.memberId && !x.mark);
/** La feina del dia del professorat: el que cal veure, la llista d'avui (o de l'última classe, o del dia d'abans triat), les
 *  properes i els dies per acabar de marcar. Aquí, i no al calendari, és on es passa llista i s'escriuen les notes. */
function classRollBody() {
  const who = myTeacherKey();
  const days = classDays(who).filter(classLive);
  const past = days.filter(c => c.date <= TODAY);
  const now = past.filter(c => c.date === TODAY);
  // Un dia d'abans triat (des de «Dies sense acabar de marcar» o del calendari); si no, avui o l'última classe.
  const picked = ui.rollDay && ui.rollDay !== TODAY ? past.filter(c => c.date === ui.rollDay) : [];
  const shown = picked.length ? picked : now.length ? now : past.slice(-1);
  const todo = past.filter(c => !shown.includes(c) && c.date >= addDays(TODAY, -45) && unmarkedSlots(c).length).reverse();
  const pend = reqsForTeacher().filter(r => (S.classes.get(r.classId)?.teacher || '') === who);
  const back = picked.length ? `<button class="btn btn-sm btn-ghost cl-roll-back" data-act="cl-roll-open" data-date="">${ICON.left}${now.length ? 'Torna a avui' : 'Torna a l’última classe'}</button>` : '';
  const day = c => `<div class="section-title"><h2 class="h2">${c.date === TODAY ? 'Avui' : esc(capz(longDate(c.date)))}</h2><span class="eyebrow">${esc(classDaySpan(c))}</span></div>
    <div class="panel">${classDayCard(c, c.date < TODAY, true)}</div>`;
  return `    ${pend.length ? `<div class="section-title"><h2 class="h2">Absències i canvis per veure</h2><span class="eyebrow">${pend.length}</span></div><div class="panel u-d-grid u-gap-10 u-p-12">${pend.map(classPendCard).join('')}</div>` : ''}
    ${clashBanner()}
    ${back}${shown.length ? shown.map(day).join('') : `<div class="empty">${staffSvg()}<p>Encara no has fet cap classe. El dia que en facis, aquí marcaràs qui hi ha vingut.</p></div>`}
    ${!now.length && !picked.length && days.some(c => c.date > TODAY) ? `<div class="section-title"><h2 class="h2">Properes classes</h2></div>${classNextList(days.filter(c => c.date > TODAY).slice(0, 3))}` : ''}
    ${todo.length ? `<div class="section-title"><h2 class="h2">Dies sense acabar de marcar</h2><span class="eyebrow">${todo.length}</span></div>
      <div class="cl-next">${todo.map(c => { const d = new Date(c.date + 'T12:00:00'), n = unmarkedSlots(c).length; return `<button data-act="cl-roll-open" data-date="${esc(c.date)}">
        <span class="d"><b>${d.getDate()}</b><small>${esc(fmtD(c.date, { month: 'short' }).replace('.', ''))}</small></span>
        <span class="i"><b>${esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${n === 1 ? '1 hora sense marcar' : `${n} hores sense marcar`}</small></span></button>`; }).join('')}</div>` : ''}`;
}
/** Els dies de classe que vénen, com a la llista de l'espai del professor/a: cadascun obre aquell dia al calendari. */
function classNextList(list) {
  return `<div class="cl-next">${list.map(c => { const d = new Date(c.date + 'T12:00:00'), n = classSlots(c).filter(x => x.memberId).length; return `<button data-act="cl-roll-day" data-date="${esc(c.date)}">
    <span class="d"><b>${d.getDate()}</b><small>${esc(fmtD(c.date, { month: 'short' }).replace('.', ''))}</small></span>
    <span class="i"><b>${c.date === TODAY ? 'Avui' : esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${esc(classDaySpan(c))}${c.place ? ` · ${esc(c.place)}` : ''}</small></span>
    <span class="muted mono u-fs-t-13">${n === 1 ? '1 alumne' : `${n} alumnes`}</span></button>`; }).join('')}</div>`;
}
/** Els noms de l'horari que encara no estan lligats a cap fitxa: [{ name, n }]. */
function classUnlinked(who) {
  const by = new Map();
  const add = name => { const k = normTxt(name); if (k && !by.has(k)) by.set(k, { name, n: 0 }); return by.get(k); };
  for (const c of classDays(who)) for (const x of c.slots || []) if (!x.memberId && x.name) add(x.name).n++;
  for (const r of planRows(who)) if (!r.memberId && r.name) add(r.name);
  return [...by.values()];
}
function unlinkedPanel(who) {
  const list = classUnlinked(who);
  if (!list.length) return '';
  return `<div class="panel u-mb-14">${list.map(t => `<div class="setting"><div><div class="t">${esc(t.name)}</div><div class="s">Sense fitxa${t.n ? ` · ${t.n} ${t.n === 1 ? 'classe' : 'classes'}` : ''}: no s’hi pot passar llista ni posar-hi notes.</div></div>
    <button class="btn btn-sm" data-act="cl-link" data-k="${esc(who)}" data-n="${esc(t.name)}">Vincula</button></div>`).join('')}</div>`;
}
/** Les classes que vénen i coincideixen amb un assaig o un concert, i que encara ningú ha dit que es deixin així. */
function classClashList() {
  const out = [];
  for (const c of classDays()) {
    if (c.date < TODAY || !classLive(c) || !ownsClass(c)) continue;
    for (const x of classSlots(c)) { const s = x.memberId ? classClash(c, x) : null; if (s && x.clashOk !== s.id) out.push({ c, x, s }); }
  }
  return out.sort((a, b) => (a.c.date + a.x.time).localeCompare(b.c.date + b.x.time));
}
function clashBanner() {
  const n = classClashList().length;
  if (!n) return '';
  return `<div class="panel u-mb-14"><div class="setting"><div><div class="t">${n === 1 ? '1 classe coincideix' : `${n} classes coincideixen`} amb un assaig o concert</div><div class="s">Mou-les o deixa-les tal com estan.</div></div>
    <button class="btn btn-sm" data-act="cl-clashes">Revisa-les</button></div></div>`;
}
/** A Inici, amb el rol de professor de cant: les properes classes en lloc dels assajos. */
function teacherSoonBlock() {
  const next = classDays(myTeacherKey()).filter(c => c.date >= TODAY && classLive(c)).slice(0, 5);
  return `<div class="section-title"><h2 class="h2">Properes classes</h2><button class="btn btn-sm" data-act="cl-tab" data-k="calendari">Calendari</button></div>
    ${next.length ? classNextList(next) : '<div class="todo-done"><span><b>Res a la vista</b><small>No tens cap classe programada.</small></span></div>'}`;
}
/** Els alumnes d'aquest professor/a: tothom qui té (o ha tingut) hora amb ell/a, amb la seva hora de cada setmana. */
function myStudents(who) {
  const by = new Map();
  for (const r of planRows(who)) if (r.memberId) by.set(r.memberId, { hours: [`${capz(DAYS_CA[r.day])} ${r.time}`], next: '' });
  for (const c of classDays(who)) {
    if (!classLive(c)) continue;
    for (const x of classSlots(c)) {
      if (!x.memberId || !S.members.has(x.memberId)) continue;
      const e = by.get(x.memberId) || { hours: [], next: '' };
      if (!e.hours.length) e.hours.push(`${capz(fmtD(c.date, { weekday: 'long' }))} ${x.time || ''}`.trim());
      if (c.date >= TODAY && (!e.next || c.date < e.next)) e.next = c.date;
      by.set(x.memberId, e);
    }
  }
  return [...by].filter(([mid]) => S.members.has(mid)).map(([mid, e]) => ({ m: S.members.get(mid), ...e })).sort((a, b) => byName(a.m, b.m));
}
function viewStudents() {
  const list = myStudents(myTeacherKey());
  const notes = new Map(), lastNote = new Map(), lastClass = new Map();
  const seen = n => { if (n.date > (lastNote.get(n.memberId) || '')) lastNote.set(n.memberId, n.date); };
  for (const n of S.classNotes.values()) if (n.text || n.file) { notes.set(n.memberId, (notes.get(n.memberId) || 0) + 1); seen(n); }
  for (const n of S.classPriv.values()) if (n.text) seen(n);
  // classDays va per dates: l'última que queda és la més recent.
  for (const c of classDays(myTeacherKey())) if (classLive(c) && c.date <= TODAY) for (const x of classSlots(c)) if (x.memberId) lastClass.set(x.memberId, c.date);
  const recent = id => [lastClass.has(id) ? `Última classe ${shortDate(lastClass.get(id))}` : 'Encara sense classes fetes', lastNote.has(id) ? `última nota ${shortDate(lastNote.get(id))}` : 'sense notes'].join(' · ');
  // Primer qui ha afegit alguna cosa al quadern que encara no he vist.
  const withNews = list.filter(({ m }) => stuNews(m.id));
  const sorted = [...withNews, ...list.filter(x => !withNews.includes(x))];
  return `<div class="page-head"><div><div class="eyebrow">${esc(V.classes)}</div><h1 class="h1">Alumnes</h1></div><span class="eyebrow">${list.length}${withNews.length ? ` · <b class="u-c-accent">${withNews.length} amb novetats</b>` : ''}</span></div>
    ${unlinkedPanel(myTeacherKey())}
    ${list.length ? `<div id="stu-list">${list.length > 5 ? findBox('#stu-list', 'Cerca un alumne') : ''}<div class="panel students">${sorted.map(({ m, hours, next }) => {
      const news = stuNews(m.id);
      return `<button class="stu-row${news ? ' has-news' : ''}" data-find="${esc(normText(m.name))}" data-act="cl-student" data-m="${esc(m.id)}">
        ${avatar(m)}<span class="stu-t"><b>${esc(fullName(m.name))}</b><small>${esc([SEC[m.section]?.name + (m.part ? ` ${m.part}` : ''), hours.join(', '), next ? `propera, ${shortDate(next)}` : ''].filter(Boolean).join(' · '))}</small><small>${esc(recent(m.id))}</small>${news ? `<span class="stu-news">${qlIcon(news.kind)}${esc(freshText(news))} · ${esc(agoText(news.at).toLowerCase())}</span>` : ''}</span>
        ${notes.get(m.id) ? `<span class="stu-n">${notes.get(m.id)} ${notes.get(m.id) === 1 ? 'nota' : 'notes'}</span>` : ''}${ICON.right}</button>`;
    }).join('')}</div><div class="panel find-empty u-p-14 u-c-muted" hidden>Cap alumne amb aquest nom.</div></div>`
      : `<div class="empty">${staffSvg()}<p>Encara no tens cap alumne. Quan facis l’horari a <b>Calendari</b>, hi sortiran tots.</p></div>`}
    <p class="muted u-fs-t-13 u-m-10-2-0">A la fitxa de cadascú hi ha el seu quadern (les notes de classe i el que hi afegeix l’alumne: notes d’estudi i gravacions), el repertori i els objectius.</p>`;
}
