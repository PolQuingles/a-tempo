// A Tempo · 09b-classes-horari.js — Classes de cant: l'horari fix de cada professor/a, l'importador «Enganxa un horari», les dates de cada trimestre i la setmana i l'horari per imprimir.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

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
const TIME_RE = /\d{1,2}[:'.h]\d{2}/;
// «Dilluns — Tarda Aula 2 Petit Palau»: el dia i, darrere, on es fa (sense «matí», «tarda»…).
const HEAD_RE = /^(diumenge|dilluns|dimarts|dimecres|dijous|divendres|dissabte)\b[\s—–\-:·,]*(.*)$/i;
// «10:40 – 11:20 Oriol Boada», com es passa l'horari per WhatsApp.
const LINE_RE = /^(\d{1,2}[:'.h]\d{2})h?\s*[–—-]\s*(\d{1,2}[:'.h]\d{2})h?\s+(.+)$/;
function parseSchedule(text, fallbackDay) {
  const lines = String(text || '').split(/\r?\n/);
  let cols = [];   // [{ day: 0-6, at: índex de columna }]
  const rows = [], places = {};
  const dayOf = i => { const col = cols.filter(c => c.at <= i).pop() || cols[0]; return col ? col.day : fallbackDay; };
  for (const line of lines) {
    const cells = line.split('\t').map(c => c.trim());
    const found = [];
    cells.forEach((c, i) => { const d = DAYS_CA.indexOf(normTxt(c)); if (d >= 0) found.push({ day: d, at: i }); });
    if (found.length) { cols = found; continue; }
    const one = cells.filter(Boolean);
    const head = one.length === 1 && !TIME_RE.test(one[0]) && one[0].match(HEAD_RE);
    if (head) {
      const day = DAYS_CA.indexOf(normTxt(head[1]));
      cols = [{ day, at: 0 }];
      const place = head[2].replace(/(^|[\s—–\-:·,])(matí|mati|tarda|vespre|nit|matins|tardes)(?=$|[\s—–\-:·,])/gi, '$1').replace(/^[\s—–\-:·,]+|[\s—–\-:·,]+$/g, '').replace(/\s{2,}/g, ' ').trim();
      if (place) places[day] = places[day] && !places[day].split(' / ').includes(place) ? `${places[day]} / ${place}` : place;
      continue;
    }
    const inLine = one.length === 1 && one[0].match(LINE_RE);
    if (inLine) {
      const from = parseTime(inLine[1]), to = parseTime(inLine[2]), name = inLine[3].trim();
      if (from != null && to != null && to > from && normTxt(name).length >= 2) rows.push({ name, day: dayOf(0), from, to, mins: to - from, ...matchMember(name) });
      continue;
    }
    // Cada nom seguit de dues hores és una classe; la columna diu de quin dia és.
    for (let i = 0; i < cells.length; i++) {
      const name = cells[i];
      if (!name || parseTime(name) != null || SKIP_WORDS.has(normTxt(name)) || normTxt(name).length < 2) continue;
      const from = parseTime(cells[i + 1]), to = parseTime(cells[i + 2]);
      if (from == null || to == null || to <= from) continue;
      rows.push({ name, day: dayOf(i), from, to, mins: to - from, ...matchMember(name) });
      i += 2;
    }
  }
  return { rows, days: [...new Set(rows.map(r => r.day))].sort(), places };
}
/** Les dates d'un període que cauen en aquests dies de la setmana, tret dels dies de festa. */
function classDates(from, to, days, skipText) {
  if (!from || !to || to < from || !days.length) return [];
  const skip = new Set(String(skipText || '').split(/[,;\s]+/).filter(Boolean).map(x => {
    const m = x.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!m) return x;
    const md = `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (m[3]) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${md}`;
    // Sense any: el del període (un 6/1 en un període que comença al desembre és del gener següent).
    const y = +from.slice(0, 4);
    return `${y}-${md}` < from ? `${y + 1}-${md}` : `${y}-${md}`;
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
/** Tots els dies que ja té aquest professor/a, per data (també els que no es tenen carregats). */
async function classDaysByDate(teacher) {
  const out = new Map();
  for (const d of (await db.collection('classes').where('teacher', '==', teacher).get()).docs) { const c = d.data(); if (!c.deleted) out.set(c.date, { ...c, id: c.id || d.id }); }
  for (const c of S.classes.values()) if ((c.teacher || '') === teacher) out.set(c.date, c);
  return out;
}
/** Un horari no toca els dies anul·lats, els canviats a mà ni els que ja han passat. */
const keptDay = c => !!c && (!!c.cancelled || !!c.edited || c.date < TODAY);
/** Les hores d'un dia que ja existia conserven el seu id, perquè les notes i els canvis d'hora hi segueixin lligats, i la marca d'assistència. */
function keepSlotIds(slots, prev) {
  const old = [...(prev?.slots || [])];
  const same = (o, x) => (o.memberId || '') === (x.memberId || '') && (o.name || '') === (x.name || '');
  const link = (x, test) => {
    const i = old.findIndex(test);
    if (i < 0) return;
    const [o] = old.splice(i, 1);
    x.id = o.id; x.linked = true;
    if (o.mark) { x.mark = o.mark; if (o.markFor) x.markFor = o.markFor; }
    if (o.clashOk) x.clashOk = o.clashOk;
  };
  for (const x of slots) link(x, o => same(o, x) && o.time === x.time);
  for (const x of slots) if (!x.linked && (x.memberId || x.name)) link(x, o => same(o, x));
  for (const x of slots) delete x.linked;
  return slots;
}
/** Escriu un dia de classe per data, amb les hores que toquen aquell dia de la setmana. */
async function writeClassDays(dates, rows, teacher, places = {}, known = null) {
  const at = new Date().toISOString();
  const older = known || await classDaysByDate(teacher);
  let done = 0;
  for (let i = 0; i < dates.length; i += 100) {
    const b = fs.batch();
    for (const date of dates.slice(i, i + 100)) {
      const day = new Date(date + 'T12:00:00').getDay();
      const slots = rows.filter(r => r.day === day).sort((a, b2) => a.from - b2.from)
        .map(r => ({ id: uid('sl'), time: hhmm(r.from), mins: r.mins, memberId: r.memberId || '', ...(r.memberId ? {} : { name: r.name || '' }) }));
      if (!slots.length) continue;
      const prev = older.get(date);
      if (keptDay(prev)) continue;
      // L'aula és la d'aquell dia de la setmana a l'horari; si no n'hi ha, i el dia ja hi era, se'n manté el lloc i la nota.
      keepSlotIds(slots, prev);
      const base = { id: prev?.id || uid('cl'), date, place: places[day] || prev?.place || '', note: prev?.note || '', teacher, teacherName: teacherName(teacher) || '', slots, at, by: S.email || '' };
      const rec = prev ? { ...base, ...changeFields(prev, base) } : base;
      b.set(db.doc(`classes/${rec.id}`), stamped(`classes/${rec.id}`, rec));
      S.classes.set(rec.id, rec);
      done++;
    }
    await b.commit();
  }
  return done;
}
const planRows = who => ((S.classPlan.get(who) || {}).rows || []);
const keptText = n => n ? `<br><br>${n === 1 ? '1 dia es deixa' : `${n} dies es deixen`} tal com ${n === 1 ? 'està' : 'estan'}: anul·lats, canviats a mà o ja passats.` : '';

function sheetClassPaste(preset) {
  const teachers = teacherOptions();
  const me = ME();
  const mine = preset && teachers.some(t => t.key === preset) ? preset
    : me && hasRole(me, 'voice') ? me.email : (teachers[0]?.key || myEmail());
  const season = seasonCfg().season;
  let parsed = { rows: [], days: [], places: {} };
  const places = {};   // el que s'ha escrit a mà a cada aula
  const whoNow = el => el.querySelector('#cp-who')?.value || mine;
  const placeOf = (el, d) => places[d] ?? parsed.places?.[d] ?? planPlaces(whoNow(el))[d] ?? '';
  const draw = el => {
    const box = el.querySelector('#cp-prev');
    if (!parsed.rows.length) { box.innerHTML = '<p class="ql-empty">Quan hi hagis enganxat la graella, prem «Comprova» i aquí veuràs la setmana tal com l’ha entesa l’app.</p>'; return; }
    const dates = plannedDates(el);
    const unsure = parsed.rows.filter(r => !r.sure && !r.memberId).length;
    const order = d => (d + 6) % 7;
    box.innerHTML = `<p class="pl-sum"><b>${parsed.rows.length}</b> hores per setmana · es crearan <b>${dates.length}</b> dies de classe${unsure ? ` · <span class="pc-warn">${unsure} ${unsure === 1 ? 'nom per revisar' : 'noms per revisar'}</span>` : ''}</p>
      <div class="pl-days">${[...parsed.days].sort((a, b) => order(a) - order(b)).map(d => { const list = parsed.rows.map((r, i) => [r, i]).filter(([r]) => r.day === d); return `<section class="pl-day">
        <header class="pl-dh"><span><b>${esc(capz(DAYS_CA[d]))}</b><small>${list.length} ${list.length === 1 ? 'hora' : 'hores'}</small></span>
          <input class="inp pl-place" type="text" maxlength="40" data-place="${d}" value="${esc(placeOf(el, d))}" placeholder="Aula" aria-label="Aula del ${esc(DAYS_CA[d])}"></header>
        <div class="pl-rows">${list.map(([r, i]) => `<div class="pc-row${r.sure || r.memberId ? '' : ' is-warn'}"><span class="mono">${esc(hhmm(r.from))}–${esc(hhmm(r.to))}</span><span class="pc-name">${esc(r.name)}</span>
          <select class="inp" data-row="${i}" aria-label="Fitxa de ${esc(r.name)}"><option value="">— sense fitxa —</option>${memberOptions(r.memberId || (r.sure ? r.hits[0].id : ''))}</select></div>`).join('')}</div></section>`; }).join('')}</div>
      ${unsure ? '<p class="ql-hint">Els noms marcats l’app no els ha sabut lligar a cap fitxa: tria’ls a la llista. Sense fitxa, no s’hi pot passar llista.</p>' : ''}`;
    box.querySelectorAll('[data-row]').forEach(sel => sel.onchange = () => { parsed.rows[+sel.dataset.row].memberId = sel.value; sel.closest('.pc-row').classList.toggle('is-warn', !sel.value); });
    box.querySelectorAll('[data-place]').forEach(inp => inp.oninput = () => { places[inp.dataset.place] = inp.value; });
  };
  const plannedDates = el => classDates(el.querySelector('#cp-from').value, el.querySelector('#cp-to').value, parsed.days, el.querySelector('#cp-skip').value);
  openSheet({
    title: 'Enganxa un horari',
    wide: true,
    body: `<ol class="cl-steps">
      <li><h3>Enganxa la graella</h3>
        <p>Copia-la del full de càlcul (els dies a dalt i, a sota, cada alumne amb l’hora d’inici i la de final). També serveix la llista del WhatsApp: «Dilluns — Tarda Aula 2» i, a sota, «15:00 – 15:40 Nom Cognom».</p>
        <label class="field"><span class="sr">Graella</span><textarea class="inp u-minh-130" id="cp-text" placeholder="Dilluns&#9;&#9;&#9;Dimecres&#10;Anna García&#9;15'00h&#9;15'40h&#9;Martina Mata&#9;16'20h&#9;17'00h"></textarea></label></li>
      <li><h3>Tria les dates</h3>
      <div class="row3">
        <label class="field"><span>Des del</span><input class="inp" id="cp-from" type="date" value="${TODAY}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="cp-to" type="date" value="${esc(season.to || TODAY)}"></label>
      </div>
      <label class="field u-mt-10"><span>Dies sense classe</span><input class="inp" id="cp-skip" type="text" placeholder="12/10, 8/12, 26/12">
        <small>Festius i vacances, separats per comes.</small></label></li>
      <li><h3>Revisa-ho</h3><div id="cp-prev"></div></li></ol>
      <label class="toggle-row setting u-mt-10 u-p-10-0"><span><b>Desa-ho com a horari fix</b><br><span class="muted u-fs-t-13">Així, la propera vegada no caldrà tornar a enganxar la graella: només dir les dates.</span></span>
        <span class="switch"><input type="checkbox" id="cp-plan" checked><span></span></span></label>
      ${teachers.length ? `<label class="field u-mt-10"><span>${esc(V.Teacher)}</span><select class="inp" id="cp-who">${teachers.map(t => `<option value="${esc(t.key)}" ${t.key === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}`,
    foot: `<button class="btn" id="cp-check">Comprova</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cp-go">Crea el calendari</button>`,
    onMount: el => {
      draw(el);
      el.querySelector('#cp-check').onclick = () => { parsed = parseSchedule(el.querySelector('#cp-text').value, new Date(el.querySelector('#cp-from').value + 'T12:00:00').getDay()); draw(el); };
      ['#cp-from', '#cp-to', '#cp-skip', '#cp-who'].forEach(id => { const x = el.querySelector(id); if (x) x.onchange = () => draw(el); });
      el.querySelector('#cp-go').onclick = async () => {
        if (!parsed.rows.length) { parsed = parseSchedule(el.querySelector('#cp-text').value, new Date(el.querySelector('#cp-from').value + 'T12:00:00').getDay()); draw(el); }
        const rows = parsed.rows.map(r => ({ ...r, memberId: r.memberId != null ? r.memberId : (r.sure ? r.hits[0].id : '') }));
        if (!rows.length) { toast('No s’hi ha trobat cap classe'); return; }
        const dates = plannedDates(el);
        if (!dates.length) { toast('Tria un període que tingui aquests dies de la setmana'); return; }
        const who = el.querySelector('#cp-who')?.value || mine;
        const clashes = countClashes(dates, rows);
        let known;
        try { known = await classDaysByDate(who); } catch { toast('No s’han pogut llegir els dies que ja hi ha. Comprova la connexió.'); return; }
        const kept = dates.filter(d => keptDay(known.get(d))).length;
        if (!await confirmSheet('Crear el calendari?', `Es crearan o actualitzaran <b>${nPl(dates.length - kept, 'dia de classe', 'dies de classe')}</b>, entre el ${ddmm(dates[0])} i el ${ddmm(dates[dates.length - 1])}, amb ${nPl(rows.length, 'hora', 'hores')} cada setmana. Es mantenen les notes, les assistències i els canvis d’hora.${keptText(kept)}${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert. Les marcarà al calendari perquè les puguis moure.` : ''}`, 'Crea-les')) return;
        try {
          const pl = Object.fromEntries(parsed.days.map(d => [d, String(placeOf(el, d)).trim()]).filter(([, v]) => v));
          const done = await writeClassDays(dates, rows, who, pl, known);
          if (el.querySelector('#cp-plan').checked) savePlan(who, rows.map(r => ({ id: uid('pl'), day: r.day, time: hhmm(r.from), mins: r.mins, memberId: r.memberId || '', ...(r.memberId ? {} : { name: r.name || '' }) })), pl);
          closeSheet(); toast(nPl(done, 'dia de classe creat', 'dies de classe creats')); render();
        } catch { toast('No s’han pogut desar. Comprova la connexió.'); render(); }
      };
    },
  });
}
/** L'horari fix d'un professor/a: l'hora setmanal de cada alumne, per generar els trimestres. Un bloc per dia de la setmana,
 *  amb l'aula a la capçalera i les hores a sota, com es pensa una setmana de classes. */
function sheetClassPlan(who) {
  const rec = { rows: planRows(who).map(r => ({ ...r })), places: planPlaces(who) };
  const season = seasonCfg().season;
  const order = d => (d + 6) % 7;
  const planDays = () => [...new Set(rec.rows.map(r => +r.day))].sort((a, b) => order(a) - order(b));
  const rowHtml = (r, i) => `<div class="sec-row pl-row" data-i="${i}">
      <input class="inp pl-time" type="time" value="${esc(r.time || '')}" data-f="time" aria-label="Hora">
      <input class="inp pl-mins" type="number" min="5" max="120" step="5" value="${+r.mins || 30}" data-f="mins" aria-label="Minuts">
      <select class="inp pl-who" data-f="member" aria-label="${esc(V.Member)}"><option value="">${r.name && !r.memberId ? `${esc(r.name)} (sense fitxa)` : '— lliure —'}</option>${memberOptions(r.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button></div>`;
  const daysHtml = () => {
    const ds = planDays();
    if (!ds.length) return '<p class="ql-empty">Encara no hi ha cap hora fixa. Tria un dia per començar, o enganxa la graella del full de càlcul amb «Enganxa un horari».</p>';
    return ds.map(d => {
      const list = rec.rows.map((r, i) => [r, i]).filter(([r]) => +r.day === d).sort((x, y) => (x[0].time || '').localeCompare(y[0].time || ''));
      return `<section class="pl-day" data-day="${d}">
        <header class="pl-dh"><span><b>${esc(capz(DAYS_CA[d]))}</b><small>${list.length} ${list.length === 1 ? 'hora' : 'hores'}</small></span>
          <input class="inp pl-place" type="text" maxlength="40" data-place="${d}" value="${esc(rec.places[d] || '')}" placeholder="Aula" aria-label="Aula del ${esc(DAYS_CA[d])}"></header>
        <div class="pl-rows">${list.map(([r, i]) => rowHtml(r, i)).join('')}</div>
        <button type="button" class="btn btn-sm btn-ghost pl-more" data-add="${d}">${ICON.plus}Una hora més</button>
      </section>`;
    }).join('');
  };
  const read = el => {
    el.querySelectorAll('.pl-row').forEach(row => {
      const r = rec.rows[+row.dataset.i];
      if (!r) return;
      r.time = row.querySelector('[data-f="time"]').value;
      r.mins = +row.querySelector('[data-f="mins"]').value || 30;
      r.memberId = row.querySelector('[data-f="member"]').value;
      if (r.memberId) delete r.name;
    });
    el.querySelectorAll('[data-place]').forEach(inp => { rec.places[inp.dataset.place] = inp.value; });
  };
  // Una hora nova va just després de l'última del dia, amb la mateixa durada.
  const nextSlot = d => {
    const last = rec.rows.filter(r => +r.day === d && r.time).sort((a, b) => a.time.localeCompare(b.time)).pop();
    const mins = +last?.mins || +rec.rows[rec.rows.length - 1]?.mins || 30;
    return { id: uid('pl'), day: d, time: last ? hhmm((parseTime(last.time) ?? 0) + (+last.mins || 30)) : '17:00', mins, memberId: '' };
  };
  const paint = el => {
    el.querySelector('#pl-days').innerHTML = daysHtml();
    const n = rec.rows.length, who2 = new Set(rec.rows.map(r => r.memberId).filter(Boolean)).size;
    el.querySelector('#pl-sum').textContent = n ? `${n} ${n === 1 ? 'hora' : 'hores'} cada setmana · ${who2} ${who2 === 1 ? V.member : V.members} · ${planDays().length} ${planDays().length === 1 ? 'dia' : 'dies'}` : '';
    const free = [1, 2, 3, 4, 5, 6, 0].filter(d => !planDays().includes(d));
    el.querySelector('#pl-newday').innerHTML = `<option value="">${planDays().length ? 'Afegeix un altre dia…' : 'Tria el primer dia…'}</option>${free.map(d => `<option value="${d}">${esc(capz(DAYS_CA[d]))}</option>`).join('')}`;
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.rows.splice(+b.dataset.rm, 1); paint(el); });
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { read(el); rec.rows.push(nextSlot(+b.dataset.add)); paint(el); });
  };
  const opts = teacherOptions();
  openSheet({
    title: `Horari fix${teacherName(who) ? ` · ${teacherName(who)}` : ''}`,
    wide: true,
    body: `<p class="u-mt-0">L’hora de cada setmana de cada ${esc(V.member)}. Amb aquest horari es generen tots els dies d’un període de cop. Els canvis d’un dia concret es fan al calendari i no el toquen.</p>
      ${opts.length > 1 ? `<label class="field u-mb-12"><span>${esc(V.Teacher)}</span><select class="inp" id="pl-who">${opts.map(t => `<option value="${esc(t.key)}" ${t.key === who ? 'selected' : ''}>${esc(t.name)}${planRows(t.key).length ? ` · ${planRows(t.key).length} hores` : ''}</option>`).join('')}</select></label>` : ''}
      <p class="pl-sum" id="pl-sum"></p>
      <div id="pl-days" class="pl-days"></div>
      <label class="pl-add"><span class="sr">Afegeix un dia</span><select class="inp" id="pl-newday"></select></label>
      <section class="pl-gen">
        <h3>Genera els dies</h3>
        <div class="row3">
          <label class="field"><span>Des del</span><input class="inp" id="pl-from" type="date" value="${TODAY}"></label>
          <label class="field"><span>Fins al</span><input class="inp" id="pl-to" type="date" value="${esc(season.to || TODAY)}"></label>
        </div>
        <label class="field u-mt-10"><span>Dies sense classe</span><input class="inp" id="pl-skip" type="text" placeholder="12/10, 8/12"><small>Festius i vacances, separats per comes.</small></label>
        <p class="muted u-fs-t-13 u-m-10-0-0">Els dies que ja hi hagi s’actualitzen i mantenen les notes, les assistències i els canvis d’hora. Els anul·lats, els canviats a mà i els que ja han passat no es toquen.</p>
      </section>`,
    foot: `<button class="btn" id="pl-gen">Genera els dies</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="pl-save">Desa l’horari</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#pl-who')?.addEventListener('change', e => sheetClassPlan(e.target.value));
      el.querySelector('#pl-newday').onchange = e => { if (e.target.value === '') return; read(el); rec.rows.push(nextSlot(+e.target.value)); paint(el); };
      el.querySelector('#pl-save').onclick = () => { read(el); savePlan(who, rec.rows.filter(r => r.time), rec.places); closeSheet(); toast('Horari fix desat'); render(); };
      el.querySelector('#pl-gen').onclick = async () => {
        read(el);
        const keep = rec.rows.filter(r => r.time);
        savePlan(who, keep, rec.places);
        const list = keep.map(r => ({ name: S.members.get(r.memberId)?.name || r.name || '', day: +r.day, from: parseTime(r.time) ?? 0, mins: +r.mins || 30, memberId: r.memberId || '' }));
        const dates = classDates(el.querySelector('#pl-from').value, el.querySelector('#pl-to').value, [...new Set(list.map(r => r.day))], el.querySelector('#pl-skip').value);
        if (!dates.length) { toast('Tria un període que tingui aquests dies de la setmana'); return; }
        const clashes = countClashes(dates, list);
        let known;
        try { known = await classDaysByDate(who); } catch { toast('No s’han pogut llegir els dies que ja hi ha. Comprova la connexió.'); return; }
        const kept = dates.filter(d => keptDay(known.get(d))).length;
        if (!await confirmSheet('Generar els dies?', `Es crearan o actualitzaran <b>${nPl(dates.length - kept, 'dia de classe', 'dies de classe')}</b>, entre el ${ddmm(dates[0])} i el ${ddmm(dates[dates.length - 1])}, amb ${nPl(list.length, 'hora', 'hores')} cada setmana.${keptText(kept)}${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert.` : ''}`, 'Genera-los')) return;
        try { const done = await writeClassDays(dates, list, who, rec.places, known); closeSheet(); toast(nPl(done, 'dia de classe creat', 'dies de classe creats')); render(); }
        catch { toast('No s’han pogut desar. Comprova la connexió.'); }
      };
    },
  });
}

/* ---------- La setmana i l'horari per imprimir ---------- */
const weekStart = iso => { const d = new Date((iso || TODAY) + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); };
const weekDates = start => Array.from({ length: 7 }, (_, i) => { const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + i); return isoDate(d); });
function classWeekHtml(who) {
  const start = weekStart(ui.clDay || TODAY);
  const dates = weekDates(start);
  const mid = myId();
  const days = classDays(who).filter(c => dates.includes(c.date)).sort((a, b) => a.date.localeCompare(b.date));
  const weekState = needClassMonth(dates[0].slice(0, 7)) || needClassMonth(dates[6].slice(0, 7));
  const title = `Del ${shortDate(dates[0])} al ${shortDate(dates[6])}`;
  return `<div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cl-week" data-dir="-1" aria-label="Setmana anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cl-week" data-dir="1" aria-label="Setmana següent">${ICON.right}</button></div>
      ${days.length ? days.map(c => `<div class="wk-day${c.cancelled ? ' off' : ''}${c.date === TODAY ? ' is-today' : ''}">
        <button class="wk-h" data-act="cl-day-open" data-date="${esc(c.date)}"><span class="wk-d"><b>${+c.date.slice(8, 10)}</b><small>${esc(wdShort(c.date))}</small></span><span class="wk-t"><b>${c.date === TODAY ? 'Avui' : esc(capz(fmtD(c.date, { weekday: 'long' })))}</b><small>${esc([classDaySpan(c), c.place].filter(Boolean).join(' · '))}</small></span>${c.cancelled ? '<span class="st-pill st-rejected">Anul·lada</span>' : ''}</button>
        <div class="wk-slots">${classSlots(c).map(x => { const m = S.members.get(x.memberId); return `<div class="wk-slot${mid && x.memberId === mid ? ' me' : ''}"><span class="mono">${esc(x.time || '')}</span><span>${m ? esc(fullName(m.name)) : x.name ? esc(x.name) : '<span class="cl-free">Hora lliure</span>'}</span>${x.mark && (ownsClass(c) || (mid && x.memberId === mid)) ? `<span class="cl-mk ${x.mark}">${esc(STATUS[x.mark].short)}</span>` : ''}</div>`; }).join('')}</div></div>`).join('')
        : `<p class="muted u-m-10-4-0 u-fs-t-13">${weekState === 'loading' ? 'Carregant aquesta setmana…' : weekState === 'error' ? 'No s’ha pogut carregar aquesta setmana. Comprova la connexió.' : 'Aquesta setmana no hi ha classes.'}</p>`}
    </div>
    <div class="cl-toolbar u-mt-10" role="toolbar" aria-label="Imprimir"><button class="btn btn-sm" data-act="cl-print-week" data-k="${esc(who)}">Imprimeix la setmana</button>${planRows(who).length ? `<button class="btn btn-sm" data-act="cl-print-plan" data-k="${esc(who)}">Imprimeix l’horari fix</button>` : ''}</div>
    <p class="ql-hint">Per penjar a la porta de l’aula o per enviar.</p>`;
}
/** Una graella: una columna per dia i una fila per hora. cols = [{ label, sub, cells: { hora: text } }]. */
function timetableHtml(cols) {
  const times = [...new Set(cols.flatMap(c => Object.keys(c.cells)))].sort();
  if (!cols.length) return '<p>No hi ha classes.</p>';
  return `<table class="pr-table pr-tt"><thead><tr><th></th>${cols.map(c => `<th>${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${times.map(t => `<tr><th class="mono">${esc(t)}</th>${cols.map(c => `<td>${esc(c.cells[t] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const slotName = x => S.members.get(x.memberId)?.name || x.name || '';
function printClassWeek(who) {
  const dates = weekDates(weekStart(ui.clDay || TODAY));
  const days = classDays(who).filter(c => dates.includes(c.date) && !c.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const cols = days.map(c => ({ label: capz(fmtD(c.date, { weekday: 'long', day: 'numeric', month: 'short' })), sub: c.place || '', cells: Object.fromEntries(classSlots(c).map(x => [x.time || '', slotName(x)])) }));
  printDoc(`Classes de ${teacherName(who) || V.Teacher} · del ${shortDate(dates[0])} al ${shortDate(dates[6])}`, timetableHtml(cols));
}
function printClassPlan(who) {
  const rows = planRows(who), places = planPlaces(who);
  const days = [...new Set(rows.map(r => +r.day))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const cols = days.map(d => ({ label: capz(DAYS_CA[d]), sub: places[d] || '', cells: Object.fromEntries(rows.filter(r => +r.day === d).map(r => [r.time, S.members.get(r.memberId)?.name || r.name || ''])) }));
  printDoc(`Horari de ${teacherName(who) || V.Teacher}`, timetableHtml(cols));
}
