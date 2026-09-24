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
/** Escriu un dia de classe per data, amb les hores que toquen aquell dia de la setmana. */
async function writeClassDays(dates, rows, teacher, places = {}) {
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
      // L'aula és la d'aquell dia de la setmana a l'horari; si no n'hi ha, i el dia ja hi era, se'n manté el lloc, la nota i les marques d'assistència que ja s'hi hagin posat.
      const keep = new Map((prev?.slots || []).filter(x => x.mark).map(x => [`${x.time}_${x.memberId}`, x]));
      for (const x of slots) { const old = keep.get(`${x.time}_${x.memberId}`); if (old) { x.mark = old.mark; if (old.markFor) x.markFor = old.markFor; } }
      const rec = { id: prev?.id || uid('cl'), date, place: places[day] || prev?.place || '', note: prev?.note || '', teacher, teacherName: teacherName(teacher) || '', slots, at, by: S.email || '' };
      b.set(db.doc(`classes/${rec.id}`), stamped(`classes/${rec.id}`, rec));
      S.classes.set(rec.id, rec);
      done++;
    }
    await b.commit();
  }
  return done;
}
/** Un camp «Aula» per a cada dia de la setmana que té classes. */
const placeFields = (days, value) => days.length ? `<div class="field" style="margin-top:12px"><span>Aula de cada dia</span>
    <div style="display:grid;gap:6px">${days.map(d => `<label style="display:flex;gap:8px;align-items:center"><span style="width:84px;flex:none;font-size:calc(13.5px*var(--ts))">${esc(capz(DAYS_CA[d]))}</span>
      <input class="inp" type="text" maxlength="40" data-place="${d}" value="${esc(value(d))}" placeholder="p. ex. Aula 2 · Petit Palau" style="flex:1;min-width:0"></label>`).join('')}</div>
    <small>Es posa a cada dia de classe i queda desada amb l’horari.</small></div>` : '';
const planRows = who => ((S.classPlan.get(who) || {}).rows || []);
/** L'horari fix, en el format que fan servir la generació i la vista prèvia. */
const planToRows = who => planRows(who).map(r => ({ name: S.members.get(r.memberId)?.name || r.name || '', day: +r.day,
  from: parseTime(r.time) ?? 0, to: (parseTime(r.time) ?? 0) + (+r.mins || 30), mins: +r.mins || 30, memberId: r.memberId || '' }));

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
    if (!parsed.rows.length) { box.innerHTML = '<span class="muted" style="font-size:calc(13px*var(--ts))">Enganxa la graella i prem «Comprova».</span>'; return; }
    const dates = plannedDates(el);
    const perDay = parsed.days.map(d => `${DAYS_CA[d]}: ${parsed.rows.filter(r => r.day === d).length} classes`).join(' · ');
    box.innerHTML = `<p style="margin:0 0 8px;font-size:calc(13.5px*var(--ts))"><b>${parsed.rows.length}</b> hores per setmana (${esc(perDay)}) · es crearan <b>${dates.length}</b> dies de classe</p>
      <ul class="mini-list" style="max-height:280px">${parsed.rows.map((r, i) => `<li><span>${esc(DAY_SHORT[r.day])} ${esc(hhmm(r.from))}–${esc(hhmm(r.to))}<br><span class="m">${esc(r.name)}</span></span>
        <select class="inp" data-row="${i}" style="max-width:52%"><option value="">— sense fitxa —</option>${memberOptions(r.memberId || (r.sure ? r.hits[0].id : ''))}</select></li>`).join('')}</ul>
      ${parsed.rows.some(r => !r.sure) ? '<p class="muted" style="font-size:calc(13px*var(--ts));margin:8px 0 0">Comprova els noms que l’app no ha sabut lligar: tria’ls a la llista.</p>' : ''}
      ${placeFields(parsed.days, d => placeOf(el, d))}`;
    box.querySelectorAll('[data-row]').forEach(sel => sel.onchange = () => { parsed.rows[+sel.dataset.row].memberId = sel.value; });
    box.querySelectorAll('[data-place]').forEach(inp => inp.oninput = () => { places[inp.dataset.place] = inp.value; });
  };
  const plannedDates = el => classDates(el.querySelector('#cp-from').value, el.querySelector('#cp-to').value, parsed.days, el.querySelector('#cp-skip').value);
  openSheet({
    title: 'Enganxa un horari',
    wide: true,
    body: `<p style="margin-top:0">Copia la graella del full de càlcul (dies de la setmana a dalt i, a sota, cada alumne amb l’hora d’inici i la de final) i enganxa-la aquí. També serveix la llista del WhatsApp: «Dilluns — Tarda Aula 2» i, a sota, «15:00 – 15:40 Nom Cognom». L’app crearà un dia de classe per cada setmana.</p>
      <label class="field"><span>Graella</span><textarea class="inp" id="cp-text" style="min-height:130px" placeholder="Dilluns&#9;&#9;&#9;Dimecres&#10;Anna García&#9;15'00h&#9;15'40h&#9;Martina Mata&#9;16'20h&#9;17'00h"></textarea></label>
      <div class="row3" style="margin-top:10px">
        <label class="field"><span>Des del</span><input class="inp" id="cp-from" type="date" value="${TODAY}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="cp-to" type="date" value="${esc(season.to || TODAY)}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Dies sense classe</span><input class="inp" id="cp-skip" type="text" placeholder="12/10, 8/12, 26/12">
        <small>Festius i vacances, separats per comes.</small></label>
      <label class="toggle-row setting" style="margin-top:10px;padding:10px 0"><span><b>Desa-ho com a horari fix</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Així, el trimestre següent no caldrà tornar a enganxar la graella: només dir les dates.</span></span>
        <span class="switch"><input type="checkbox" id="cp-plan" checked><span></span></span></label>
      ${teachers.length ? `<label class="field" style="margin-top:10px"><span>${esc(V.Teacher)}</span><select class="inp" id="cp-who">${teachers.map(t => `<option value="${esc(t.key)}" ${t.key === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      <div id="cp-prev" style="margin-top:12px"></div>`,
    foot: `<button class="btn" id="cp-check">Comprova</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cp-go">Crea el calendari</button>`,
    onMount: el => {
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
        if (!await confirmSheet('Crear el calendari?', `Es crearan <b>${dates.length} dies de classe</b>, del ${ddmm(dates[0])} al ${ddmm(dates[dates.length - 1])}, amb ${rows.length} hores cada setmana. Els dies que ja hi hagi d’aquest ${esc(V.Teacher.toLowerCase())} es reescriuran.${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert. Les marcarà al calendari perquè les puguis moure.` : ''}`, 'Crea-les')) return;
        try {
          const pl = Object.fromEntries(parsed.days.map(d => [d, String(placeOf(el, d)).trim()]).filter(([, v]) => v));
          const done = await writeClassDays(dates, rows, who, pl);
          if (el.querySelector('#cp-plan').checked) savePlan(who, rows.map(r => ({ id: uid('pl'), day: r.day, time: hhmm(r.from), mins: r.mins, memberId: r.memberId || '', ...(r.memberId ? {} : { name: r.name || '' }) })), pl);
          closeSheet(); toast(`${done} dies de classe creats`); render();
        } catch { toast('No s’han pogut desar. Comprova la connexió.'); render(); }
      };
    },
  });
}
/** L'horari fix d'un professor/a: l'hora setmanal de cada alumne, per generar els trimestres. */
function sheetClassPlan(who) {
  const rec = { rows: planRows(who).map(r => ({ ...r })), places: planPlaces(who) };
  const season = seasonCfg().season;
  const planDays = () => [...new Set(rec.rows.map(r => +r.day))].sort();
  const rows = () => rec.rows.length ? rec.rows.map((r, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select class="inp" data-f="day" style="width:110px">${DAYS_CA.map((d, k) => `<option value="${k}" ${+r.day === k ? 'selected' : ''}>${capz(d)}</option>`).join('')}</select>
      <input class="inp" type="time" value="${esc(r.time || '')}" data-f="time" style="width:105px">
      <input class="inp" type="number" min="5" max="120" step="5" value="${+r.mins || 30}" data-f="mins" style="width:72px" aria-label="Minuts">
      <select class="inp" data-f="member" style="flex:1;min-width:130px"><option value="">— lliure —</option>${memberOptions(r.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button>
    </div>`).join('') : '<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Encara no hi ha cap hora fixa. Afegeix-ne o enganxa la graella del full de càlcul.</p>';
  const read = el => {
    el.querySelectorAll('#pl-rows .sec-row').forEach(row => {
      const r = rec.rows[+row.dataset.i];
      if (!r) return;
      r.day = +row.querySelector('[data-f="day"]').value;
      r.time = row.querySelector('[data-f="time"]').value;
      r.mins = +row.querySelector('[data-f="mins"]').value || 30;
      r.memberId = row.querySelector('[data-f="member"]').value;
      if (r.memberId) delete r.name;
    });
    el.querySelectorAll('#pl-places [data-place]').forEach(inp => { rec.places[inp.dataset.place] = inp.value; });
  };
  const paint = el => {
    el.querySelector('#pl-rows').innerHTML = rows();
    el.querySelector('#pl-places').innerHTML = placeFields(planDays(), d => rec.places[d] || '');
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.rows.splice(+b.dataset.rm, 1); paint(el); });
    el.querySelectorAll('#pl-rows [data-f="day"]').forEach(x => x.addEventListener('change', () => { read(el); paint(el); }));
  };
  const opts = teacherOptions();
  openSheet({
    title: `Horari fix${teacherName(who) ? ` · ${teacherName(who)}` : ''}`,
    wide: true,
    body: `<p style="margin-top:0">L’hora de cada setmana de cada ${esc(V.member)}. Serveix per generar els dies de tot un trimestre sense haver de posar-los un per un. Els canvis d’un dia concret es fan al calendari i no toquen aquest horari.</p>
      ${opts.length > 1 ? `<label class="field" style="margin-bottom:12px"><span>${esc(V.Teacher)}</span><select class="inp" id="pl-who">${opts.map(t => `<option value="${esc(t.key)}" ${t.key === who ? 'selected' : ''}>${esc(t.name)}${planRows(t.key).length ? ` · ${planRows(t.key).length} hores` : ''}</option>`).join('')}</select></label>` : ''}
      <div id="pl-rows" style="display:grid;gap:8px">${rows()}</div>
      <button type="button" class="btn btn-sm" id="pl-add" style="margin-top:10px">+ Afegeix una hora</button>
      <div id="pl-places"></div>
      <div class="sec-h" style="margin-top:18px"><h2 class="h2">Genera els dies</h2></div>
      <div class="row3">
        <label class="field"><span>Des del</span><input class="inp" id="pl-from" type="date" value="${TODAY}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="pl-to" type="date" value="${esc(season.to || TODAY)}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Dies sense classe</span><input class="inp" id="pl-skip" type="text" placeholder="12/10, 8/12"></label>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Els dies que ja hi hagi es reescriuran, però s’hi manté l’assistència ja marcada.</p>`,
    foot: `<button class="btn" id="pl-gen">Genera els dies</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="pl-save">Desa l’horari</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#pl-who')?.addEventListener('change', e => sheetClassPlan(e.target.value));
      el.querySelector('#pl-add').onclick = () => { read(el); rec.rows.push({ id: uid('pl'), day: 1, time: '17:00', mins: 30, memberId: '' }); paint(el); };
      el.querySelector('#pl-save').onclick = () => { read(el); savePlan(who, rec.rows.filter(r => r.time), rec.places); closeSheet(); toast('Horari fix desat'); render(); };
      el.querySelector('#pl-gen').onclick = async () => {
        read(el);
        const keep = rec.rows.filter(r => r.time);
        savePlan(who, keep, rec.places);
        const list = keep.map(r => ({ name: S.members.get(r.memberId)?.name || r.name || '', day: +r.day, from: parseTime(r.time) ?? 0, mins: +r.mins || 30, memberId: r.memberId || '' }));
        const dates = classDates(el.querySelector('#pl-from').value, el.querySelector('#pl-to').value, [...new Set(list.map(r => r.day))], el.querySelector('#pl-skip').value);
        if (!dates.length) { toast('Tria un període que tingui aquests dies de la setmana'); return; }
        const clashes = countClashes(dates, list);
        if (!await confirmSheet('Generar els dies?', `Es crearan <b>${dates.length} dies de classe</b>, del ${ddmm(dates[0])} al ${ddmm(dates[dates.length - 1])}, amb ${list.length} hores cada setmana.${clashes ? `<br><br><b>Atenció:</b> ${clashes} ${clashes === 1 ? 'hora coincideix' : 'hores coincideixen'} amb un assaig o un concert.` : ''}`, 'Genera-los')) return;
        try { const done = await writeClassDays(dates, list, who, rec.places); closeSheet(); toast(`${done} dies de classe creats`); render(); }
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
  const title = `Del ${shortDate(dates[0])} al ${shortDate(dates[6])}`;
  return `<div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cl-week" data-dir="-1" aria-label="Setmana anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cl-week" data-dir="1" aria-label="Setmana següent">${ICON.right}</button></div>
      ${days.length ? days.map(c => `<div class="wk-day${c.cancelled ? ' off' : ''}"><div class="wk-h"><b>${esc(capz(fmtD(c.date, { weekday: 'long', day: 'numeric' })))}</b>${c.place ? ` <span class="m">· ${esc(c.place)}</span>` : ''}${c.cancelled ? ' <span class="st-pill st-rejected">Anul·lada</span>' : ''}</div>
        ${classSlots(c).map(x => { const m = S.members.get(x.memberId); return `<div class="wk-slot${mid && x.memberId === mid ? ' me' : ''}"><span class="mono">${esc(x.time || '')}</span><span>${m ? esc(m.name) : x.name ? esc(x.name) : '<span class="cl-free">lliure</span>'}</span>${x.mark ? `<span class="cl-mk ${x.mark}">${esc(STATUS[x.mark].short)}</span>` : ''}</div>`; }).join('')}</div>`).join('')
        : '<p class="muted" style="margin:10px 4px 0;font-size:calc(13px*var(--ts))">Aquesta setmana no hi ha classes.</p>'}
    </div>
    <div class="sec-h" style="margin-top:10px"><span class="muted" style="font-size:calc(13px*var(--ts))">Per penjar a la porta de l’aula o per enviar.</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="cl-print-week" data-k="${esc(who)}">Imprimeix la setmana</button>${planRows(who).length ? `<button class="btn btn-sm" data-act="cl-print-plan" data-k="${esc(who)}">Imprimeix l’horari fix</button>` : ''}</span></div>`;
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
