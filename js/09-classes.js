// A Tempo · 09-classes.js — La meva assistència i Classes de cant: horaris, calendari, avisos i fitxes.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Singer: my attendance ---------- */
function myProdSummary(me, pid) {
  const prod = S.productions.get(pid);
  if (!prod) return null;
  const st = computeStats({ kind: 'prod', id: pid, name: prod.name }, me.section);
  const r = st.rows.find(x => x.m.id === me.id);
  return { prod, r, rs: ruleStatus(pid, me), counted: r ? r.P + r.R + r.FJ + r.FNJ : 0 };
}
function ruleSentence(rs) {
  if (!rs) return '';
  const min = minAttendance();
  if (rs.status === 'ok') return `<span class="rsvp yes">Compleixes la norma del ${min}%</span>`;
  if (rs.status === 'risk') return `<span class="rsvp none" style="background:var(--fj-soft);color:var(--fj-ink)">Per sota del ${min}%</span> <span class="muted" style="font-size:13px">Encara hi pots arribar: si vens als ${rs.remaining} assajos que queden, arribaràs al ${pct(rs.best)}.</span>`;
  return `<span class="rsvp no">No arribes al ${min}%</span> <span class="muted" style="font-size:13px">Parla amb el teu ${V.leader}.</span>`;
}
function myAttendanceCard(me) {
  const x = myProdSummary(me, currentProductionId());
  if (!x) return '';
  const { prod, r, rs, counted } = x;
  const dots = (r?.hist || []).map(({ s, mk }) => `<i class="${mk ? 's-' + mk.s : ''}" title="${ddmm(s.date)} · ${mk ? STATUS[mk.s].label : 'Sense llista'}"></i>`).join('');
  return `<div class="section-title prod-tone" style="--ph:${prodHue(prod)}"><h2 class="h2">La meva assistència</h2><span class="eyebrow"><i class="pdot"></i>${esc(prod.name)}</span></div>
    <div class="panel my-att prod-tone tinted" style="--ph:${prodHue(prod)}">
      ${counted ? `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big">${Math.round(rate(r) * 100)}<small>%</small></span>
        <span class="muted" style="font-size:13px">${r.P + r.R} de ${counted} assajos${r.R ? ` · ${r.R} retards` : ''}${r.FJ ? ` · ${r.FJ} just.` : ''}${r.FNJ ? ` · ${r.FNJ} no just.` : ''}</span></div>
        <div>${ruleSentence(rs)}</div>
        <div class="dots" aria-label="Sessió a sessió">${dots}</div>`
      : `<span class="muted" style="font-size:13.5px">Encara no hi ha cap llista passada en aquesta producció.</span>`}
      <button class="btn btn-sm" data-act="my-att" style="justify-self:start">Totes les produccions</button>
    </div>`;
}
function sheetMyAttendance() {
  const me = S.members.get(myMemberId());
  if (!me) return;
  const { season } = seasonCfg();
  const sr = computeStats({ kind: 'range', from: season.from, to: season.to, name: season.name }, me.section).rows.find(x => x.m.id === me.id);
  const sc = sr ? sr.P + sr.R + sr.FJ + sr.FNJ : 0;
  const rows = productionsSorted().map(p => myProdSummary(me, p.id)).filter(x => x && x.counted);
  openSheet({
    title: 'La meva assistència',
    body: `<div class="kpis" style="grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><div class="kpi-v">${sc ? kpiPct(rate(sr)) : '—'}</div><div class="kpi-l">${esc(season.name)}</div></div>
        <div class="kpi"><div class="kpi-v">${sr ? sr.min : 0}<small>min</small></div><div class="kpi-l">Retard acumulat</div></div>
      </div>
      ${rows.length ? `<ul class="mini-list" style="max-height:none;margin-top:14px">${rows.map(({ prod, r, rs, counted }) => `<li style="display:grid;gap:4px;padding:10px 12px">
        <span style="display:flex;justify-content:space-between;gap:8px"><b>${esc(prod.name)}</b><span class="mono">${pct(rate(r))}</span></span>
        <span class="m">${r.P + r.R} de ${counted} · ${r.FJ} just. · ${r.FNJ} no just.</span><span>${ruleSentence(rs)}</span></li>`).join('')}</ul>`
        : '<p class="muted">Encara no hi ha llistes passades.</p>'}
      <p class="muted" style="font-size:12px">Només tu i l’equip ${V.del} veieu aquestes dades. Si hi ha algun error, parla amb el teu ${V.leader}.</p>`,
  });
}
/* ---------- Classes: enganxar l'horari setmanal ---------- */
// Del full de càlcul de cada professor/a: una graella amb els dies de la setmana i, a sota,
// el nom de cada alumne i l'hora d'inici i de final. Genera un dia de classe per setmana.
const DAYS_CA = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const DAY_SHORT = ['dg.', 'dl.', 'dt.', 'dc.', 'dj.', 'dv.', 'ds.'];
const SKIP_WORDS = new Set(['alumne', 'alumna', 'horari', 'hora', 'professor', 'professora', 'professor/a', 'curs', 'nom', 'inici', 'final', 'de', 'a']);
const normTxt = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** «15'00h», «15:00», «15.00», «1500», «15h» → minuts des de mitjanit. */
function parseTime(cell) {
  const t = String(cell || '').trim().replace(/\s/g, '');
  let m = t.match(/^(\d{1,2})[^\d]?(\d{2})?h?$/i);
  if (!m) return null;
  const h = +m[1], min = m[2] ? +m[2] : 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}
const hhmm = v => `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
/** Busca de qui és cada nom de la graella dins la plantilla. */
function matchMember(name) {
  const words = normTxt(name).split(' ').filter(w => w.length > 1);
  if (!words.length) return { hits: [] };
  const list = membersOf(null, true).filter(m => m.active !== false);
  const score = m => {
    const mw = normTxt(m.name).split(' ');
    let n = 0;
    for (const w of words) {
      if (mw.includes(w)) n += 1;
      else if (mw.some(x => x.length > 3 && w.length > 3 && (x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4))))) n += 0.8;
    }
    return n;
  };
  const scored = list.map(m => ({ m, s: score(m) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return { hits: [] };
  const top = scored.filter(x => x.s === scored[0].s);
  return { hits: top.map(x => x.m), sure: top.length === 1 && scored[0].s >= words.length * 0.8 };
}
/** Llegeix la graella enganxada: retorna { rows, days } amb el dia de la setmana de cada fila. */
function parseSchedule(text, fallbackDay) {
  const lines = String(text || '').split(/\r?\n/);
  let cols = [];   // [{ day: 0-6, at: índex de columna }]
  const rows = [];
  for (const line of lines) {
    const cells = line.split('\t').map(c => c.trim());
    const found = [];
    cells.forEach((c, i) => { const d = DAYS_CA.indexOf(normTxt(c)); if (d >= 0) found.push({ day: d, at: i }); });
    if (found.length) { cols = found; continue; }
    // Cada nom seguit de dues hores és una classe; la columna diu de quin dia és.
    for (let i = 0; i < cells.length; i++) {
      const name = cells[i];
      if (!name || parseTime(name) != null || SKIP_WORDS.has(normTxt(name)) || normTxt(name).length < 2) continue;
      const from = parseTime(cells[i + 1]), to = parseTime(cells[i + 2]);
      if (from == null || to == null || to <= from) continue;
      const col = cols.filter(c => c.at <= i).pop() || cols[0];
      const day = col ? col.day : fallbackDay;
      rows.push({ name, day, from, to, mins: to - from, ...matchMember(name) });
      i += 2;
    }
  }
  return { rows, days: [...new Set(rows.map(r => r.day))].sort() };
}
/** Les dates d'un període que cauen en aquests dies de la setmana, tret dels dies de festa. */
function classDates(from, to, days, skipText) {
  if (!from || !to || to < from || !days.length) return [];
  const skip = new Set(String(skipText || '').split(/[,;\s]+/).filter(Boolean).map(x => {
    const m = x.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!m) return x;
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : from.slice(0, 4);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }));
  const out = [];
  for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (days.includes(d.getDay()) && !skip.has(iso)) out.push(iso);
  }
  return out;
}
/** Quantes hores generades es trepitgen amb un assaig o un concert. */
function countClashes(dates, rows) {
  let n = 0;
  for (const date of dates) {
    const day = new Date(date + 'T12:00:00').getDay();
    for (const r of rows.filter(x => x.day === day && x.memberId)) {
      if (classClash({ id: '', date }, { time: hhmm(r.from), mins: r.mins, memberId: r.memberId })) n++;
    }
  }
  return n;
}
/** Escriu un dia de classe per data, amb les hores que toquen aquell dia de la setmana. */
async function writeClassDays(dates, rows, teacher) {
  const at = new Date().toISOString();
  const older = new Map([...S.classes.values()].filter(c => (c.teacher || '') === teacher).map(c => [c.date, c]));
  let done = 0;
  for (let i = 0; i < dates.length; i += 100) {
    const b = fs.batch();
    for (const date of dates.slice(i, i + 100)) {
      const day = new Date(date + 'T12:00:00').getDay();
      const slots = rows.filter(r => r.day === day).sort((a, b2) => a.from - b2.from)
        .map(r => ({ id: uid('sl'), time: hhmm(r.from), mins: r.mins, memberId: r.memberId || '', ...(r.memberId ? {} : { name: r.name || '' }) }));
      if (!slots.length) continue;
      const prev = older.get(date);
      // Si el dia ja hi era, se'n manté el lloc, la nota i les marques d'assistència que ja s'hi hagin posat.
      const keep = new Map((prev?.slots || []).filter(x => x.mark).map(x => [`${x.time}_${x.memberId}`, x]));
      for (const x of slots) { const old = keep.get(`${x.time}_${x.memberId}`); if (old) { x.mark = old.mark; if (old.markFor) x.markFor = old.markFor; } }
      const rec = { id: prev?.id || uid('cl'), date, place: prev?.place || '', note: prev?.note || '', teacher, teacherName: teacherName(teacher) || '', slots, at, by: S.email || '' };
      b.set(db.doc(`classes/${rec.id}`), rec);
      S.classes.set(rec.id, rec);
      done++;
    }
    await b.commit();
  }
  return done;
}
const planRows = who => ((S.classPlan.get(who) || {}).rows || []);
/** L'horari fix, en el format que fan servir la generació i la vista prèvia. */
const planToRows = who => planRows(who).map(r => ({ name: S.members.get(r.memberId)?.name || r.name || '', day: +r.day,
  from: parseTime(r.time) ?? 0, to: (parseTime(r.time) ?? 0) + (+r.mins || 30), mins: +r.mins || 30, memberId: r.memberId || '' }));

function sheetClassPaste(preset) {
  const teachers = teacherOptions();
  const me = S.staff.get(S.email || '');
  const mine = preset && teachers.some(t => t.key === preset) ? preset
    : me && hasRole(me, 'voice') ? me.email : (teachers[0]?.key || S.email || '');
  const season = seasonCfg().season;
  let parsed = { rows: [], days: [] };
  const draw = el => {
    const box = el.querySelector('#cp-prev');
    if (!parsed.rows.length) { box.innerHTML = '<span class="muted" style="font-size:13px">Enganxa la graella i prem «Comprova».</span>'; return; }
    const dates = plannedDates(el);
    const perDay = parsed.days.map(d => `${DAYS_CA[d]}: ${parsed.rows.filter(r => r.day === d).length} classes`).join(' · ');
    box.innerHTML = `<p style="margin:0 0 8px;font-size:13.5px"><b>${parsed.rows.length}</b> hores per setmana (${esc(perDay)}) · es crearan <b>${dates.length}</b> dies de classe</p>
      <ul class="mini-list" style="max-height:280px">${parsed.rows.map((r, i) => `<li><span>${esc(DAY_SHORT[r.day])} ${esc(hhmm(r.from))}–${esc(hhmm(r.to))}<br><span class="m">${esc(r.name)}</span></span>
        <select class="inp" data-row="${i}" style="max-width:52%"><option value="">— sense fitxa —</option>${memberOptions(r.memberId || (r.sure ? r.hits[0].id : ''))}</select></li>`).join('')}</ul>
      ${parsed.rows.some(r => !r.sure) ? '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Comprova els noms que l’app no ha sabut lligar: tria’ls a la llista.</p>' : ''}`;
    box.querySelectorAll('[data-row]').forEach(sel => sel.onchange = () => { parsed.rows[+sel.dataset.row].memberId = sel.value; });
  };
  const plannedDates = el => classDates(el.querySelector('#cp-from').value, el.querySelector('#cp-to').value, parsed.days, el.querySelector('#cp-skip').value);
  openSheet({
    title: 'Enganxa un horari',
    wide: true,
    body: `<p style="margin-top:0">Copia la graella del full de càlcul (dies de la setmana a dalt i, a sota, cada alumne amb l’hora d’inici i la de final) i enganxa-la aquí. L’app crearà un dia de classe per cada setmana.</p>
      <label class="field"><span>Graella</span><textarea class="inp" id="cp-text" style="min-height:130px" placeholder="Dilluns&#9;&#9;&#9;Dimecres&#10;Anna García&#9;15'00h&#9;15'40h&#9;Martina Mata&#9;16'20h&#9;17'00h"></textarea></label>
      <div class="row3" style="margin-top:10px">
        <label class="field"><span>Des del</span><input class="inp" id="cp-from" type="date" value="${TODAY}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="cp-to" type="date" value="${esc(season.to || TODAY)}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Dies sense classe</span><input class="inp" id="cp-skip" type="text" placeholder="12/10, 8/12, 26/12">
        <small>Festius i vacances, separats per comes.</small></label>
      <label class="toggle-row setting" style="margin-top:10px;padding:10px 0"><span><b>Desa-ho com a horari fix</b><br><span class="muted" style="font-size:12.5px">Així, el trimestre següent no caldrà tornar a enganxar la graella: només dir les dates.</span></span>
        <span class="switch"><input type="checkbox" id="cp-plan" checked><span></span></span></label>
      ${teachers.length ? `<label class="field" style="margin-top:10px"><span>${esc(V.Teacher)}</span><select class="inp" id="cp-who">${teachers.map(t => `<option value="${esc(t.key)}" ${t.key === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      <div id="cp-prev" style="margin-top:12px"></div>`,
    foot: `<button class="btn" id="cp-check">Comprova</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cp-go">Crea el calendari</button>`,
    onMount: el => {
      el.querySelector('#cp-check').onclick = () => { parsed = parseSchedule(el.querySelector('#cp-text').value, new Date(el.querySelector('#cp-from').value + 'T12:00:00').getDay()); draw(el); };
      ['#cp-from', '#cp-to', '#cp-skip'].forEach(id => el.querySelector(id).onchange = () => draw(el));
      el.querySelector('#cp-go').onclick = async () => {
        if (!parsed.rows.length) { parsed = parseSchedule(el.querySelector('#cp-text').value, new Date(el.querySelector('#cp-from').value + 'T12:00:00').getDay()); draw(el); }
        const rows = parsed.rows.map(r => ({ ...r, memberId: r.memberId != null ? r.memberId : (r.sure ? r.hits[0].id : '') }));
        if (!rows.length) { toast('No s’hi ha trobat cap classe'); return; }
        const dates = plannedDates(el);
        if (!dates.length) { toast('Tria un període que tingui aquests dies de la setmana'); return; }
        const who = el.querySelector('#cp-who')?.value || mine;
        const clashes = countClashes(dates, rows);
        if (!await confirmSheet('Crear el calendari?', `Es crearan <b>${dates.length} dies de classe</b>, del ${ddmm(dates[0])} al ${ddmm(dates[dates.length - 1])}, amb ${rows.length} hores cada setmana. Els dies que ja hi hagi d’aquest ${esc(V.Teacher.toLowerCase())} es reescriuran.${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert. Les marcarà al calendari perquè les puguis moure.` : ''}`, 'Crea-les')) return;
        try {
          const done = await writeClassDays(dates, rows, who);
          if (el.querySelector('#cp-plan').checked) savePlan(who, rows.map(r => ({ id: uid('pl'), day: r.day, time: hhmm(r.from), mins: r.mins, memberId: r.memberId || '', ...(r.memberId ? {} : { name: r.name || '' }) })));
          closeSheet(); toast(`${done} dies de classe creats`); render();
        } catch { toast('No s’han pogut desar. Comprova la connexió.'); render(); }
      };
    },
  });
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
    <span class="who">${m ? esc(m.name) : x.name ? `${esc(x.name)} <span class="m">· sense fitxa</span>` : '<span class="cl-free">lliure</span>'}${m && m.section ? ` <span class="m">· ${esc(SEC[m.section].short)}</span>` : ''}${x.swapped ? ' <span class="m">(canviat)</span>' : ''}${pills || mark ? `<br>${[mark, pills].filter(Boolean).join(' ')}` : ''}${note ? `<span class="cl-note">${esc(note.text)}</span>` : ''}</span>
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
    ${slots.length ? slots.map(x => classSlotRow(c, x, past)).join('') : '<p class="muted" style="margin:6px 0 0;font-size:13px">Encara no hi ha hores posades.</p>'}
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
    ${teach ? `<div class="sec-h" style="margin-top:0"><span class="muted" style="font-size:13px">Les classes d’aquest ${esc(V.Teacher.toLowerCase())}.</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="cl-paste" data-k="${esc(who)}">Enganxa un horari</button><button class="btn btn-sm btn-primary" data-act="cl-new" data-k="${esc(who)}" data-date="${esc(ui.clDay)}">+ Dia</button></span></div>` : ''}
    <div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cl-month" data-dir="-1" aria-label="Mes anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cl-month" data-dir="1" aria-label="Mes següent">${ICON.right}</button></div>
      <div class="mweek" aria-hidden="true">${['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="mgrid">${cells.join('')}</div>
      ${inMonth.length ? `<div class="mlegend"><span><i class="mk cl"></i>Dia de classe</span>${mid ? '<span><i class="mk cl mine"></i>Hi tens hora</span>' : ''}</div>`
        : '<p class="muted" style="margin:10px 4px 0;font-size:13px">Aquest mes no hi ha classes.</p>'}
    </div>
    <div class="section-title" style="margin-top:18px"><h2 class="h2">${esc(longDate(ui.clDay))}</h2>${dayClasses.length ? `<span class="eyebrow">${esc(classDaySpan(dayClasses[0]))}</span>` : ''}</div>
    ${dayClasses.length ? `<div class="panel">${dayClasses.map(c => classDayCard(c, c.date < TODAY, true)).join('')}</div>`
      : `<div class="panel" style="padding:14px;font-size:13.5px;color:var(--muted)">Cap classe aquest dia.${teach ? ' Amb <b>+ Dia</b> en pots posar una.' : ''}</div>`}
    ${soon.length ? `<div class="section-title" style="margin-top:18px"><h2 class="h2">Properes classes</h2><span class="eyebrow">${soon.length}</span></div>
      <div class="cl-next">${soon.map(c => {
        const mineSlot = mid ? classSlots(c).find(x => x.memberId === mid) : null;
        const d = new Date(c.date + 'T12:00:00');
        return `<button data-act="cl-day" data-date="${esc(c.date)}">
          <span class="d"><b>${d.getDate()}</b><small>${esc(fmtD(c.date, { month: 'short' }).replace('.', ''))}</small></span>
          <span class="i"><b>${esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${c.cancelled ? 'Anul·lada' : esc(classDaySpan(c))}${c.place ? ` · ${esc(c.place)}` : ''}</small></span>
          <span class="${mineSlot && !c.cancelled ? 'mine mono' : 'muted mono'}" style="font-size:12.5px">${mineSlot && !c.cancelled ? esc(mineSlot.time) : ''}</span>
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
  const myNotes = !teach && myId() ? [...S.classNotes.values()].filter(n => n.memberId === myId() && n.text)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6) : [];
  const open = openSwaps();
  const openCard = r => {
    const c = S.classes.get(r.classId), mySl = mySlot(c);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> busca algú per canviar l’hora</div>
      <span class="muted" style="font-size:13.5px">${esc(longDate(c.date))} · té les <b>${esc(slotTime(c, r.slotId))}</b> i tu les <b>${esc(mySl ? mySl.time : '')}</b>. Només per aquell dia.</span>
      ${r.reason ? `<span style="font-size:13px">${esc(r.reason)}</span>` : ''}
      <span style="margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cl-open-take" data-r="${esc(r.id)}">Me’l quedo</button></span>
    </div>`;
  };
  const swapCard = r => {
    const c = S.classes.get(r.classId);
    return `<div class="conv-card">
      <div class="a-h"><b>${esc(reqMemberName(r))}</b> et demana canviar l’hora</div>
      <span class="muted" style="font-size:13.5px">${c ? esc(longDate(c.date)) : ''} · ell/a té les <b>${esc(slotTime(c, r.slotId))}</b> i tu les <b>${esc(slotTime(c, r.withSlotId))}</b>. Només per aquest dia.</span>
      ${r.reason ? `<span style="font-size:13px">${esc(r.reason)}</span>` : ''}
      <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cl-answer" data-r="${esc(r.id)}" data-v="accepted">Accepto el canvi</button><button class="btn btn-sm" data-act="cl-answer" data-r="${esc(r.id)}" data-v="rejected">Ara no puc</button></span>
    </div>`;
  };
  const pendCard = r => `<div class="conv-card">
      <div class="a-h">${classReqLine(r)}</div>
      ${r.reason ? `<span style="font-size:13px">${esc(r.reason)}</span>` : ''}
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
    <p class="muted" style="margin:-4px 2px 0;font-size:13.5px">Tria un ${esc(V.Teacher.toLowerCase())} per veure’n el calendari i les hores de cada ${esc(V.member)}.</p>
    ${avisos}
    ${classQuads()}
    ${myId() ? `<div class="panel" style="margin-top:18px">${teach ? '' : `<div class="setting"><div><div class="t">La teva assistència</div><div class="s">Les classes on has vingut durant el curs.</div></div>
      <button class="btn btn-sm" data-act="cl-mystats">Mira-la</button></div>`}
      <div class="setting"><div><div class="t">Les teves classes al calendari del mòbil</div><div class="s">Subscriu-t’hi i les tindràs al Google Calendar, a l’Apple o a l’Outlook, sempre al dia.</div></div>
        <button class="btn btn-sm" data-act="cl-ics">Com fer-ho</button></div></div>` : ''}
    ${myNotes.length ? `<div class="section-title"><h2 class="h2">Notes de les teves classes</h2></div>
      <ul class="mini-list" style="max-height:none">${myNotes.map(n => `<li style="display:grid;gap:2px"><span class="m mono">${esc(shortDate(n.date))}</span><span style="white-space:pre-wrap">${esc(n.text)}</span></li>`).join('')}</ul>` : ''}
    <p class="muted" style="font-size:12.5px;margin-top:14px">Els canvis d’hora valen només per al dia que es demanen. Qui rep la petició ha de dir que sí perquè es faci.</p>`;
}
/* ---------- Classes: fitxes ---------- */
/** Professorat que encara no entra a l'app: només un nom, per poder-ne fer el calendari. */
function sheetTeacherSeats() {
  const seats = teacherSeats().map(t => ({ ...t }));
  const withAccount = [...S.staff.values()].filter(p => hasRole(p, 'voice'));
  const rows = () => seats.length ? seats.map((t, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center">
      <input class="inp" type="text" maxlength="40" value="${esc(t.name)}" data-f="name" style="flex:1" placeholder="Nom i cognom">
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu-lo">${ICON.close}</button>
    </div>`).join('') : '<p class="muted" style="margin:0;font-size:13px">Encara no n’hi ha cap.</p>';
  const read = el => el.querySelectorAll('.sec-row').forEach(r => { const t = seats[+r.dataset.i]; if (t) t.name = r.querySelector('[data-f="name"]').value.trim(); });
  const paint = el => { el.querySelector('#ts-rows').innerHTML = rows(); el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); seats.splice(+b.dataset.rm, 1); paint(el); }); };
  openSheet({
    title: `${V.Teacher}s sense compte`,
    body: `<p style="margin-top:0">Posa-hi qui fa classes però encara no entra a l’app: així ja en pots fer el calendari i els ${esc(V.members)} hi veuen la seva hora. Quan tingui compte, dona-li accés a <b>Gestió › Personal</b> amb el rol de ${esc(V.Teacher.toLowerCase())}.</p>
      <div id="ts-rows" style="display:grid;gap:8px"></div>
      <button type="button" class="btn btn-sm" id="ts-add" style="margin-top:10px">+ Afegeix</button>
      ${withAccount.length ? `<p class="muted" style="font-size:12.5px;margin:14px 0 0">Amb compte: ${esc(withAccount.map(p => p.name || p.email).join(', '))}.</p>` : ''}`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ts-save">Desa</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#ts-add').onclick = () => { read(el); seats.push({ id: uid('pf'), name: '' }); paint(el); };
      el.querySelector('#ts-save').onclick = () => {
        read(el);
        const keep = seats.filter(t => t.name);
        const gone = teacherSeats().filter(t => !keep.some(k => k.id === t.id) && [...S.classes.values()].some(c => c.teacher === t.id));
        if (gone.length) { toast(`${gone[0].name} té dies de classe: esborra’ls abans de treure’l`); return; }
        saveConfig({ teachers: keep });
        closeSheet(); toast('Desat'); render();
      };
    },
  });
}
function saveClassDay(rec) { S.classes.set(rec.id, rec); persist('classes', rec.id, rec, 10); }
function saveClassReq(rec) { S.classReq.set(rec.id, rec); persist('classReq', rec.id, rec, 10); }
/** El professorat de l'agrupació: els comptes amb el rol, i els que encara no en tenen (config/main.teachers).
 *  Cada dia de classe i cada horari fix es guarda amb la clau del seu professor/a: el correu, o l'id de la fitxa. */
const teacherSeats = () => (S.config.teachers || []).filter(t => t && t.id && t.name);
const teacherOptions = () => {
  // Qui no edita no es baixa les fitxes de l'equip: la seva hi és igualment.
  const accounts = [...S.staff.values()].filter(p => hasRole(p, 'voice'));
  if (S.me && hasRole(S.me, 'voice') && !accounts.some(p => p.email === S.me.email)) accounts.push(S.me);
  return [
    ...accounts.map(p => ({ key: p.email, name: p.name || p.email, account: true })).sort((a, b) => a.name.localeCompare(b.name, 'ca')),
    ...teacherSeats().map(t => ({ key: t.id, name: t.name, account: false })),
  ];
};
const teacherName = key => (S.me && S.me.email === key && S.me.name) || S.staff.get(key || '')?.name || teacherSeats().find(t => t.id === key)?.name || '';
/** Com es diu qui fa aquest dia de classe: el nom desat al dia serveix a qui no veu les fitxes de l'equip. */
const teacherOf = c => teacherName(c && c.teacher) || (c && c.teacherName) || (String(c && c.teacher || '').includes('@') ? V.Teacher : (c && c.teacher) || '');
/** De qui és l'horari fix que es toca: el meu si en soc, si no el primer professor/a de l'agrupació. */
function planWho() {
  const me = S.staff.get(S.email || '');
  if (me && hasRole(me, 'voice')) return me.email;
  return teacherOptions()[0]?.key || S.email || '';
}
function savePlan(who, rows) {
  const rec = { id: who, teacher: who, rows, at: new Date().toISOString(), by: S.email || '' };
  S.classPlan.set(who, rec); persist('classPlan', who, rec, 10);
}
/** L'horari fix d'un professor/a: l'hora setmanal de cada alumne, per generar els trimestres. */
function sheetClassPlan(who) {
  const rec = { rows: planRows(who).map(r => ({ ...r })) };
  const season = seasonCfg().season;
  const rows = () => rec.rows.length ? rec.rows.map((r, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select class="inp" data-f="day" style="width:110px">${DAYS_CA.map((d, k) => `<option value="${k}" ${+r.day === k ? 'selected' : ''}>${capz(d)}</option>`).join('')}</select>
      <input class="inp" type="time" value="${esc(r.time || '')}" data-f="time" style="width:105px">
      <input class="inp" type="number" min="5" max="120" step="5" value="${+r.mins || 30}" data-f="mins" style="width:72px" aria-label="Minuts">
      <select class="inp" data-f="member" style="flex:1;min-width:130px"><option value="">— lliure —</option>${memberOptions(r.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button>
    </div>`).join('') : '<p class="muted" style="margin:0;font-size:13px">Encara no hi ha cap hora fixa. Afegeix-ne o enganxa la graella del full de càlcul.</p>';
  const read = el => el.querySelectorAll('.sec-row').forEach(row => {
    const r = rec.rows[+row.dataset.i];
    if (!r) return;
    r.day = +row.querySelector('[data-f="day"]').value;
    r.time = row.querySelector('[data-f="time"]').value;
    r.mins = +row.querySelector('[data-f="mins"]').value || 30;
    r.memberId = row.querySelector('[data-f="member"]').value;
    if (r.memberId) delete r.name;
  });
  const paint = el => { el.querySelector('#pl-rows').innerHTML = rows(); el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.rows.splice(+b.dataset.rm, 1); paint(el); }); };
  const opts = teacherOptions();
  openSheet({
    title: `Horari fix${teacherName(who) ? ` · ${teacherName(who)}` : ''}`,
    wide: true,
    body: `<p style="margin-top:0">L’hora de cada setmana de cada ${esc(V.member)}. Serveix per generar els dies de tot un trimestre sense haver de posar-los un per un. Els canvis d’un dia concret es fan al calendari i no toquen aquest horari.</p>
      ${opts.length > 1 ? `<label class="field" style="margin-bottom:12px"><span>${esc(V.Teacher)}</span><select class="inp" id="pl-who">${opts.map(t => `<option value="${esc(t.key)}" ${t.key === who ? 'selected' : ''}>${esc(t.name)}${planRows(t.key).length ? ` · ${planRows(t.key).length} hores` : ''}</option>`).join('')}</select></label>` : ''}
      <div id="pl-rows" style="display:grid;gap:8px">${rows()}</div>
      <button type="button" class="btn btn-sm" id="pl-add" style="margin-top:10px">+ Afegeix una hora</button>
      <div class="sec-h" style="margin-top:18px"><h2 class="h2">Genera els dies</h2></div>
      <div class="row3">
        <label class="field"><span>Des del</span><input class="inp" id="pl-from" type="date" value="${TODAY}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="pl-to" type="date" value="${esc(season.to || TODAY)}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Dies sense classe</span><input class="inp" id="pl-skip" type="text" placeholder="12/10, 8/12"></label>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Els dies que ja hi hagi es reescriuran, però s’hi manté l’assistència ja marcada.</p>`,
    foot: `<button class="btn" id="pl-gen">Genera els dies</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="pl-save">Desa l’horari</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#pl-who')?.addEventListener('change', e => sheetClassPlan(e.target.value));
      el.querySelector('#pl-add').onclick = () => { read(el); rec.rows.push({ id: uid('pl'), day: 1, time: '17:00', mins: 30, memberId: '' }); paint(el); };
      el.querySelector('#pl-save').onclick = () => { read(el); savePlan(who, rec.rows.filter(r => r.time)); closeSheet(); toast('Horari fix desat'); render(); };
      el.querySelector('#pl-gen').onclick = async () => {
        read(el);
        const keep = rec.rows.filter(r => r.time);
        savePlan(who, keep);
        const list = keep.map(r => ({ name: S.members.get(r.memberId)?.name || r.name || '', day: +r.day, from: parseTime(r.time) ?? 0, mins: +r.mins || 30, memberId: r.memberId || '' }));
        const dates = classDates(el.querySelector('#pl-from').value, el.querySelector('#pl-to').value, [...new Set(list.map(r => r.day))], el.querySelector('#pl-skip').value);
        if (!dates.length) { toast('Tria un període que tingui aquests dies de la setmana'); return; }
        const clashes = countClashes(dates, list);
        if (!await confirmSheet('Generar els dies?', `Es crearan <b>${dates.length} dies de classe</b>, del ${ddmm(dates[0])} al ${ddmm(dates[dates.length - 1])}, amb ${list.length} hores cada setmana.${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert.` : ''}`, 'Genera-los')) return;
        try { const done = await writeClassDays(dates, list, who); closeSheet(); toast(`${done} dies de classe creats`); render(); }
        catch { toast('No s’han pogut desar. Comprova la connexió.'); }
      };
    },
  });
}
/** Què s'ha treballat i què cal preparar: ho veuen el professorat i aquell alumne. */
function sheetClassNote(classId, slotId) {
  const c = S.classes.get(classId);
  const slot = c && classSlots(c).find(x => x.id === slotId);
  if (!slot) return;
  const id = `${classId}_${slotId}`;
  const ex = S.classNotes.get(id);
  const m = S.members.get(slot.memberId || '');
  openSheet({
    title: `Nota de la classe${m ? ` de ${firstName(m.name)}` : ''}`,
    body: `<div class="kv">
      <p style="margin:0">${esc(longDate(c.date))}, a les <b>${esc(slot.time || '')}</b>.</p>
      <label class="field"><span>Què s’ha treballat i què cal preparar</span><textarea class="inp" id="cn-text" maxlength="600" style="min-height:150px" placeholder="p. ex. Vocalitzacions fins al la. Per la setmana vinent, els compassos 1-40 de memòria.">${esc(ex?.text || '')}</textarea></label>
      <p class="muted" style="font-size:12.5px;margin:0">Només ho veieu tu i ${m ? esc(firstName(m.name)) : `qui tingui aquesta hora`}. La resta de l’agrupació, no.</p>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="cn-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cn-save">Desa</button>`,
    onMount: el => {
      el.querySelector('#cn-save').onclick = () => {
        const text = el.querySelector('#cn-text').value.trim();
        if (!text) { if (ex) { S.classNotes.delete(id); persist('classNotes', id, null, 10); } closeSheet(); render(); return; }
        const rec = { id, classId, slotId, memberId: slot.memberId || '', date: c.date, text, at: new Date().toISOString(), by: S.email || '' };
        S.classNotes.set(id, rec); persist('classNotes', id, rec, 10);
        closeSheet(); toast('Nota desada'); render();
      };
      el.querySelector('#cn-del')?.addEventListener('click', () => { S.classNotes.delete(id); persist('classNotes', id, null, 10); closeSheet(); toast('Nota esborrada'); render(); });
    },
  });
}
/** El calendari de les meves classes, per subscriure-s'hi des del mòbil. */
async function sheetClassIcs() {
  const mid = myId();
  if (!mid) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let token = '';
  try {
    const snap = await db.doc(`classIcs/${mid}`).get();
    token = snap.exists ? snap.data().token : '';
    if (!token) { token = newKey() + newKey(); await db.doc(`classIcs/${mid}`).set({ memberId: mid, token, at: new Date().toISOString() }); }
  } catch { toast('No s’ha pogut preparar el calendari'); return; }
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}calendaris/classes/${token}.ics`;
  openSheet({
    title: 'Les teves classes al calendari',
    body: `<p style="margin-top:0">Aquesta adreça porta <b>només les teves classes</b>. Si te la subscrius, se t’aniran actualitzant soles cada poques hores.</p>
      <div class="linkbox">${esc(url)}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">És una adreça personal: no la comparteixis. Si algú l’hagués de deixar de tenir, digues-ho a l’administració.</p>
      <h3 style="margin:14px 0 4px;font-size:14px">Com subscriure-s’hi</h3>
      <ul class="mini-list" style="max-height:none"><li><span><b>iPhone</b><br><span class="m">Calendari › Calendaris › Afegeix calendari › Afegeix calendari subscrit, i hi enganxes l’adreça.</span></span></li>
        <li><span><b>Android o ordinador</b><br><span class="m">Google Calendar › Altres calendaris › + › Des d’un URL, i hi enganxes l’adreça.</span></span></li></ul>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Les classes noves hi surten al cap d’unes hores, no immediatament.</p>`,
    foot: `${navigator.share ? '<button class="btn" id="ci-share">Comparteix…</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" id="ci-copy">Copia l’adreça</button>`,
    onMount: el => {
      el.querySelector('#ci-copy').onclick = () => copyText(url, 'Adreça copiada');
      el.querySelector('#ci-share')?.addEventListener('click', () => navigator.share({ title: 'Les meves classes', url }).catch(() => {}));
    },
  });
}
/** Assistència a les classes de tot el curs: es llegeix només quan algú la demana. */
function sheetClassStats(onlyMine) {
  openSheet({
    title: onlyMine ? 'La meva assistència a classe' : 'Assistència a les classes',
    wide: !onlyMine,
    body: '<p class="muted" style="margin:0">Carregant les classes del curs…</p>',
    onMount: async el => {
      let days = [];
      try { const snap = await db.collection('classes').get(); days = snap.docs.map(d => d.data()); }
      catch { el.querySelector('.sheet-b').innerHTML = '<p style="margin:0">No s’han pogut llegir les classes. Comprova la connexió.</p>'; return; }
      const per = new Map();
      let marked = 0;
      for (const c of days) for (const x of c.slots || []) {
        const mid = slotMember(x);
        if (!mid || !x.mark) continue;
        if (onlyMine && mid !== myId()) continue;
        const r = per.get(mid) || { P: 0, R: 0, FJ: 0, FNJ: 0, total: 0, last: '' };
        r[x.mark]++; r.total++; r.last = c.date > r.last ? c.date : r.last;
        per.set(mid, r); marked++;
      }
      const rows = [...per.entries()].map(([mid, r]) => ({ m: S.members.get(mid), r }))
        .filter(x => x.m).sort((a, b) => a.m.name.localeCompare(b.m.name, 'ca'));
      const pct = r => r.total ? Math.round(((r.P + r.R) / r.total) * 100) : null;
      el.querySelector('.sheet-b').innerHTML = !marked
        ? `<p style="margin:0">Encara no hi ha cap classe amb l’assistència marcada. ${teachesClasses() ? 'Marca-la des del calendari, al dia que toqui.' : ''}</p>`
        : `<p style="margin-top:0">${days.length} dies de classe al curs · ${marked} assistències marcades.</p>
          <ul class="mini-list" style="max-height:none">${rows.map(({ m, r }) => `<li><span>${esc(m.name)}<br><span class="m">${r.P + r.R} de ${r.total} classes${r.FJ ? ` · ${r.FJ} just.` : ''}${r.FNJ ? ` · ${r.FNJ} no just.` : ''}</span></span>
            <span class="mono"><b>${pct(r)}%</b></span></li>`).join('')}</ul>
          <p class="muted" style="font-size:12.5px;margin:10px 0 0">Compta les classes marcades: hi ha assistit (present o amb retard) sobre el total.</p>`;
    },
  });
}
function sheetClassDay(id, preset) {
  const ex = id ? S.classes.get(id) : null;
  const rec = ex ? { ...ex, slots: (ex.slots || []).map(x => ({ ...x })) }
    : { id: uid('cl'), date: (preset && preset.date) || TODAY, place: '', note: '', teacher: (preset && preset.teacher) || planWho(), slots: [] };
  const taken = () => new Set(rec.slots.map(x => x.memberId).filter(Boolean));
  const rows = () => rec.slots.map((x, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center">
      <input class="inp" type="time" value="${esc(x.time || '')}" data-f="time" style="width:110px">
      <select class="inp" data-f="member" style="flex:1"><option value="">— lliure —</option>${memberOptions(x.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button>
    </div>`).join('');
  const read = el => {
    el.querySelectorAll('.sec-row').forEach(row => {
      const i = +row.dataset.i;
      if (!rec.slots[i]) return;
      rec.slots[i].time = row.querySelector('[data-f="time"]').value;
      rec.slots[i].memberId = row.querySelector('[data-f="member"]').value;
      if (rec.slots[i].memberId) delete rec.slots[i].name;
    });
  };
  const paint = el => { el.querySelector('#cd-rows').innerHTML = rows(); wire(el); };
  const wire = el => {
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.slots.splice(+b.dataset.rm, 1); paint(el); });
  };
  openSheet({
    title: ex ? 'Dia de classe' : 'Nou dia de classe',
    wide: true,
    body: `<div class="kv">
      <div class="row3">
        <label class="field"><span>Dia</span><input class="inp" id="cd-date" type="date" value="${esc(rec.date)}"></label>
        <label class="field"><span>Lloc</span><input class="inp" id="cd-place" type="text" maxlength="40" value="${esc(rec.place || '')}" placeholder="p. ex. Aula 2"></label>
      </div>
      <label class="field"><span>Nota</span><input class="inp" id="cd-note" type="text" maxlength="80" value="${esc(rec.note || '')}" placeholder="p. ex. Preparació del concert"></label>
      ${teacherOptions().length > 1 ? `<label class="field"><span>${esc(V.Teacher)}</span><select class="inp" id="cd-who">${teacherOptions().map(t => `<option value="${esc(t.key)}" ${t.key === (rec.teacher || '') ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      <div class="field"><span>Genera les hores</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input class="inp" id="cd-from" type="time" value="17:00" style="width:110px">
          <input class="inp" id="cd-mins" type="number" min="5" max="120" step="5" value="30" style="width:80px" aria-label="Minuts per classe">
          <span class="muted" style="font-size:13px">min ·</span>
          <input class="inp" id="cd-n" type="number" min="1" max="20" value="6" style="width:70px" aria-label="Quantes classes">
          <button type="button" class="btn btn-sm" id="cd-gen">Genera</button>
        </div><small>Omple les hores seguides; després hi tries qui ve a cadascuna.</small></div>
      <div class="field"><span>Hores</span><div id="cd-rows" style="display:grid;gap:8px">${rows()}</div>
        <button type="button" class="btn btn-sm" id="cd-add" style="justify-self:start;margin-top:8px">+ Afegeix una hora</button></div>
    </div>`,
    foot: `${ex ? `<button class="btn btn-danger-ghost" id="cd-del">Esborra</button><button class="btn" data-act="cl-cancel-day" data-c="${esc(rec.id)}">${ex.cancelled ? 'Restableix el dia' : 'Anul·la el dia'}</button>` : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cd-save">Desa</button>`,
    onMount: el => {
      wire(el);
      el.querySelector('#cd-add').onclick = () => { read(el); rec.slots.push({ id: uid('sl'), time: '', mins: 30, memberId: '' }); paint(el); };
      el.querySelector('#cd-gen').onclick = () => {
        read(el);
        const [h, m] = (el.querySelector('#cd-from').value || '17:00').split(':').map(Number);
        const mins = Math.max(5, +el.querySelector('#cd-mins').value || 30), n = Math.min(20, Math.max(1, +el.querySelector('#cd-n').value || 1));
        const old = rec.slots.slice();
        rec.slots = [];
        for (let i = 0; i < n; i++) {
          const t = h * 60 + m + i * mins;
          rec.slots.push({ id: old[i]?.id || uid('sl'), time: `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, mins, memberId: old[i]?.memberId || '' });
        }
        paint(el);
      };
      el.querySelector('#cd-save').onclick = () => {
        read(el);
        const date = el.querySelector('#cd-date').value;
        if (!date) { toast('Posa-hi el dia'); return; }
        const dup = rec.slots.filter(x => x.memberId).map(x => x.memberId);
        if (new Set(dup).size !== dup.length) { toast(`Hi ha algun ${V.member} en dues hores del mateix dia`); return; }
        saveClassDay({ ...rec, date, place: el.querySelector('#cd-place').value.trim(), note: el.querySelector('#cd-note').value.trim(),
          teacher: el.querySelector('#cd-who')?.value || rec.teacher || '',
          teacherName: teacherName(el.querySelector('#cd-who')?.value || rec.teacher || '') || rec.teacherName || '',
          slots: rec.slots.filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time)), at: new Date().toISOString(), by: S.email || '' });
        closeSheet(); toast('Dia de classe desat'); render();
      };
      const del = el.querySelector('#cd-del');
      if (del) del.onclick = async () => {
        if (!await confirmSheet('Esborrar el dia de classe?', 'S’esborraran les hores d’aquell dia. Els avisos que hi hagi deixaran de sortir.', 'Esborra')) return;
        S.classes.delete(rec.id); persist('classes', rec.id, null, 10);
        closeSheet(); toast('Dia esborrat'); render();
      };
    },
  });
}
function sheetClassNotice(classId, slotId, kind) {
  const c = S.classes.get(classId);
  if (!c) return;
  const late = kind === 'late';
  openSheet({
    title: late ? 'Arribaré tard' : 'No hi podré anar',
    body: `<div class="kv">
      <p style="margin:0">Classe ${esc(longDate(c.date))}, a les <b>${esc(slotTime(c, slotId))}</b>.</p>
      ${late ? '<label class="field"><span>Minuts de retard aproximats</span><input class="inp" id="cn-min" type="number" inputmode="numeric" min="1" max="120" value="10" style="width:120px"></label>' : ''}
      <label class="field"><span>Motiu</span><textarea class="inp" id="cn-why" maxlength="200" style="min-height:80px" placeholder="p. ex. Tinc classe fins a les 17:15"></textarea></label>
      <p class="muted" style="font-size:12.5px;margin:0">Ho rebrà el ${esc(V.Teacher.toLowerCase())} al mòbil.</p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cn-go">Envia l’avís</button>`,
    onMount: el => {
      el.querySelector('#cn-go').onclick = () => {
        const m = S.members.get(myId());
        const rec = { id: uid('cr'), classId, slotId, memberId: myId(), memberName: m ? m.name : '', kind, status: 'pending',
          reason: el.querySelector('#cn-why').value.trim(), createdAt: new Date().toISOString(), uid: S.uid };
        if (late) { const v = parseInt(el.querySelector('#cn-min').value, 10); if (v > 0) rec.mins = Math.min(120, v); }
        saveClassReq(rec);
        closeSheet(); toast('Avís enviat'); render();
      };
    },
  });
}
function sheetClassSwap(classId, slotId) {
  const c = S.classes.get(classId);
  if (!c) return;
  const others = classSlots(c).filter(x => x.id !== slotId && x.memberId && S.members.get(x.memberId));
  if (!others.length) { toast('Aquell dia no hi ha ningú més amb hora'); return; }
  openSheet({
    title: 'Canvia l’hora amb algú',
    body: `<div class="kv">
      <p style="margin:0">Classe ${esc(longDate(c.date))}. Ara tens les <b>${esc(slotTime(c, slotId))}</b>. El canvi val <b>només per aquest dia</b>, i l’ha d’acceptar qui triïs.</p>
      <label class="field"><span>Amb qui</span><select class="inp" id="cs-who"><option value="">Qualsevol que pugui aquell dia</option>${others.map(x => `<option value="${esc(x.id)}">${esc(S.members.get(x.memberId).name)} · ${esc(x.time)}</option>`).join('')}</select>
        <small>Si tries «qualsevol», ho veuran tots els qui tenen classe aquell dia i s’ho queda el primer que digui que sí.</small></label>
      <label class="field"><span>Missatge</span><textarea class="inp" id="cs-why" maxlength="200" style="min-height:70px" placeholder="p. ex. Aquell dia treballo fins a les 18h"></textarea></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cs-go">Demana el canvi</button>`,
    onMount: el => {
      el.querySelector('#cs-go').onclick = () => {
        const withSlotId = el.querySelector('#cs-who').value;
        const other = withSlotId ? classSlots(c).find(x => x.id === withSlotId) : null;
        const m = S.members.get(myId());
        saveClassReq({ id: uid('cr'), classId, slotId, memberId: myId(), memberName: m ? m.name : '', kind: 'swap',
          ...(other ? { withSlotId, withMemberId: other.memberId, withName: S.members.get(other.memberId)?.name || '' } : { open: true }),
          reason: el.querySelector('#cs-why').value.trim(), status: 'pending', createdAt: new Date().toISOString(), uid: S.uid });
        closeSheet(); toast(other ? 'Petició enviada' : 'Demanat a tothom qui té classe aquell dia'); render();
      };
    },
  });
}
/** Marca (o desmarca) qui ha vingut a una hora de classe. */
function markClass(classId, slotId, value) {
  const c = S.classes.get(classId);
  if (!c) return;
  const eff = classSlots(c).find(x => x.id === slotId);
  const slots = (c.slots || []).map(x => {
    if (x.id !== slotId) return x;
    const next = { ...x };
    if (next.mark === value) { delete next.mark; delete next.markFor; }
    else { next.mark = value; next.markFor = (eff && eff.memberId) || x.memberId || ''; }
    return next;
  });
  saveClassDay({ ...c, slots });
  render();
}
/** Em quedo un canvi d'hora obert: hi poso la meva hora i queda fet. */
function takeOpenSwap(id) {
  const r = S.classReq.get(id);
  const c = r && S.classes.get(r.classId);
  const x = c && mySlot(c);
  if (!r || !x || r.status !== 'pending') { toast('Aquest canvi ja no hi és'); return; }
  saveClassReq({ ...r, status: 'accepted', open: false, withMemberId: myId(), withSlotId: x.id,
    reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' });
  toast('Fet: heu canviat l’hora'); render();
}
/** Demano una hora que ha quedat lliure (per recuperar una classe). */
function askFreeSlot(classId, slotId) {
  const c = S.classes.get(classId), m = S.members.get(myId() || '');
  if (!c || !m) return;
  if ([...S.classReq.values()].some(r => r.kind === 'take' && r.classId === classId && r.slotId === slotId && r.memberId === m.id && r.status === 'pending')) {
    toast('Ja l’has demanada'); return;
  }
  saveClassReq({ id: uid('cr'), classId, slotId, memberId: m.id, memberName: m.name, kind: 'take', status: 'pending',
    reason: '', createdAt: new Date().toISOString(), uid: S.uid });
  toast(`Demanada. El ${V.Teacher.toLowerCase()} t’ho dirà`); render();
}
/** Anul·la (o torna a activar) un dia sencer de classe. */
async function cancelClassDay(id) {
  const c = S.classes.get(id);
  if (!c) return;
  if (c.cancelled) { saveClassDay({ ...c, cancelled: false, cancelledAt: '' }); toast('Dia restablert'); render(); return; }
  const who = classSlots(c).filter(x => x.memberId).length;
  if (!await confirmSheet('Anul·lar el dia?', `S’avisarà ${who === 1 ? 'la persona' : `les ${who} persones`} que hi tenen hora. El dia queda marcat com a anul·lat, i el pots tornar a activar quan vulguis.`, 'Anul·la’l')) return;
  saveClassDay({ ...c, cancelled: true, cancelledAt: new Date().toISOString() });
  toast('Dia anul·lat'); render();
}
function answerClassReq(id, status) {
  const r = S.classReq.get(id);
  if (!r || r.status !== 'pending') return;
  // Acceptar una hora lliure vol dir donar-la: es posa aquella persona al calendari.
  if (r.kind === 'take' && status === 'accepted') {
    const c = S.classes.get(r.classId);
    if (c) saveClassDay({ ...c, slots: (c.slots || []).map(x => x.id === r.slotId ? { ...x, memberId: r.memberId, name: '' } : x) });
  }
  saveClassReq({ ...r, status, reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' });
  toast(status === 'accepted' ? 'Acceptat' : status === 'cancelled' ? 'Avís retirat' : 'Rebutjat');
  render();
}
