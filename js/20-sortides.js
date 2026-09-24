// A Tempo · 20-sortides.js — Sortides i gires (inscripcions, places de transport i habitacions) i la fitxa que omple
// cada persona (telèfon, talla de vestuari i contacte d'emergència).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Sortides i gires ---------- */
// trips/<id> = { id, title, from, to, place, deadline, notes, sections (buit = tothom), transports: [{ id, name, seats }],
//   rooms: [{ id, name, beds }], closed, createdAt, by }
// tripSignups/<sortida>_<membre> = { tripId, memberId, answer: yes|no, note, transport, room, at, uid }. Cadascú s'hi
// apunta ell mateix; el transport i l'habitació els posa l'equip (les regles no deixen que cadascú se'ls canviï).
const tripsSorted = () => [...S.trips.values()].sort((a, b) => (a.from || '').localeCompare(b.from || ''));
const tripOpen = t => !t.closed && (!t.deadline || t.deadline >= TODAY) && (t.to || t.from || '') >= TODAY;
const tripForMe = (t, me) => !me || !(t.sections || []).length || t.sections.includes(me.section);
const signupOf = (t, mid) => S.tripSignups.get(`${t.id}_${mid}`);
const tripPeople = t => membersOf(null).filter(m => !(t.sections || []).length || t.sections.includes(m.section));
const tripDates = t => t.to && t.to !== t.from ? `del ${shortDate(t.from)} al ${shortDate(t.to)}` : longDate(t.from);
/** Les sortides obertes on encara no he dit res (per a «Per fer»). */
function tripsToAnswer() {
  const me = S.members.get(myMemberId());
  return me ? tripsSorted().filter(t => tripOpen(t) && tripForMe(t, me) && !signupOf(t, me.id)) : [];
}
function tripCounts(t) {
  const people = tripPeople(t);
  const yes = people.filter(m => signupOf(t, m.id)?.answer === 'yes');
  const no = people.filter(m => signupOf(t, m.id)?.answer === 'no');
  const used = (list, key) => Object.fromEntries((list || []).map(x => [x.id, yes.filter(m => signupOf(t, m.id)?.[key] === x.id).length]));
  return { people, yes, no, wait: people.length - yes.length - no.length, seats: used(t.transports, 'transport'), beds: used(t.rooms, 'room') };
}
function boardTrips() {
  const me = S.members.get(myMemberId());
  const list = tripsSorted().filter(t => canEdit() || tripForMe(t, me));
  const next = list.filter(t => (t.to || t.from || '') >= TODAY), past = list.filter(t => (t.to || t.from || '') < TODAY).reverse();
  const card = t => {
    const c = canEdit() ? tripCounts(t) : null;
    const mine = me && signupOf(t, me.id);
    const tr = mine?.transport && (t.transports || []).find(x => x.id === mine.transport);
    const rm = mine?.room && (t.rooms || []).find(x => x.id === mine.room);
    return `<article class="trip">
      <div class="ann-h"><h2 class="ann-t">${esc(t.title)}</h2>${canEdit() ? `<button class="icon-btn" data-act="trip-edit" data-id="${esc(t.id)}" aria-label="Edita la sortida">${ICON.more}</button>` : ''}</div>
      <p class="trip-f"><b>${esc(capz(tripDates(t)))}</b>${t.place ? ` · ${esc(t.place)}` : ''}${t.deadline && tripOpen(t) ? ` · <span class="m">apunta’t abans del ${ddmm(t.deadline)}</span>` : t.closed ? ' · <span class="m">inscripcions tancades</span>' : ''}</p>
      ${t.notes ? `<div class="ann-b">${linkify(t.notes)}</div>` : ''}
      ${c ? `<p class="trip-c"><b>${c.yes.length}</b> hi van · ${c.no.length} no · ${c.wait} sense resposta${(t.transports || []).length ? ` · transport ${Object.values(c.seats).reduce((a, b) => a + b, 0)}/${t.transports.reduce((a, x) => a + (+x.seats || 0), 0)}` : ''}${(t.rooms || []).length ? ` · llits ${Object.values(c.beds).reduce((a, b) => a + b, 0)}/${t.rooms.reduce((a, x) => a + (+x.beds || 0), 0)}` : ''}</p>` : ''}
      ${me && tripForMe(t, me) ? `<div class="trip-me">${mine ? `<span class="rsvp ${mine.answer}">${mine.answer === 'yes' ? 'Hi vas' : 'No hi vas'}</span>${tr ? ` <span class="m">· ${esc(tr.name)}</span>` : ''}${rm ? ` <span class="m">· habitació ${esc(rm.name)}</span>` : ''}${mine.note ? `<br><span class="m">${esc(mine.note)}</span>` : ''}` : '<span class="rsvp none">Encara no has respost</span>'}
        ${tripOpen(t) ? `<span class="trip-acts"><button class="btn btn-sm ${mine?.answer === 'yes' ? 'btn-primary' : ''}" data-act="trip-yes" data-id="${esc(t.id)}">${mine?.answer === 'yes' ? 'Canvia la nota' : 'M’hi apunto'}</button><button class="btn btn-sm ${mine?.answer === 'no' ? 'btn-danger' : ''}" data-act="trip-no" data-id="${esc(t.id)}">No hi aniré</button></span>` : ''}</div>` : ''}
      ${canEdit() ? `<div class="trip-acts"><button class="btn btn-sm" data-act="trip-admin" data-id="${esc(t.id)}">Inscrits, transport i habitacions</button></div>` : ''}
    </article>`;
  };
  return `${canEdit() ? `<div class="sec-h" style="margin-top:6px"><span class="muted" style="font-size:13px">Sortides, gires i caps de setmana: cadascú s’hi apunta, i l’equip reparteix el transport i les habitacions.</span><button class="btn btn-sm btn-primary" data-act="trip-new">+ Sortida</button></div>` : ''}
    ${next.length ? `<div class="panel">${next.map(card).join('')}</div>` : `<div class="empty"><p>No hi ha cap sortida prevista.</p></div>`}
    ${past.length ? `<details class="np-group"><summary><span>Fetes (${past.length})</span>${ICON.chev}</summary><div class="panel">${past.map(card).join('')}</div></details>` : ''}`;
}
function saveTrip(t) { S.trips.set(t.id, t); persist('trips', t.id, t, 50); }
function saveSignup(rec) { const id = `${rec.tripId}_${rec.memberId}`; S.tripSignups.set(id, rec); persist('tripSignups', id, rec, 20); }
function tripAnswer(tripId, answer, note) {
  const me = S.members.get(myMemberId());
  const t = S.trips.get(tripId);
  if (!me || !t) return;
  const prev = signupOf(t, me.id) || {};
  const rec = { tripId, memberId: me.id, answer, note: note != null ? note : (prev.note || ''), at: new Date().toISOString(), uid: S.uid || '' };
  // El transport i l'habitació els posa l'equip: es conserven tal com eren.
  if (prev.transport) rec.transport = prev.transport;
  if (prev.room) rec.room = prev.room;
  saveSignup(rec);
  toast(answer === 'yes' ? 'T’hi has apuntat' : 'Has dit que no hi aniràs'); render();
}
function sheetTripSignup(tripId) {
  const t = S.trips.get(tripId);
  const me = S.members.get(myMemberId());
  if (!t || !me) return;
  const prev = signupOf(t, me.id);
  openSheet({
    title: t.title,
    body: `<p style="margin-top:0"><b>${esc(capz(tripDates(t)))}</b>${t.place ? ` · ${esc(t.place)}` : ''}</p>
      <label class="field"><span>Nota per a l’organització (opcional)</span><textarea class="inp" id="ts-note" maxlength="200" style="min-height:70px" placeholder="p. ex. Hi aniré pel meu compte · Arribo el dissabte al matí">${esc(prev?.note || '')}</textarea></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ts-ok">M’hi apunto</button>`,
    onMount: el => { el.querySelector('#ts-ok').onclick = () => { const note = el.querySelector('#ts-note').value.trim(); closeSheet(); tripAnswer(tripId, 'yes', note); }; },
  });
}
function sheetTrip(id) {
  const ex = id ? S.trips.get(id) : null;
  const t = ex ? clone(ex) : { id: uid('tr'), title: '', from: '', to: '', place: '', deadline: '', notes: '', sections: [], transports: [], rooms: [], createdAt: new Date().toISOString(), by: S.me?.name || S.email || '' };
  t.transports = t.transports || []; t.rooms = t.rooms || [];
  const listRows = (key, label, unit) => t[key].map(x => `<div class="sec-row" data-k="${key}" data-id="${esc(x.id)}" style="display:flex;gap:6px;align-items:center">
      <input class="inp" data-f="name" type="text" maxlength="40" value="${esc(x.name)}" placeholder="${label}" style="flex:1;min-width:0">
      <input class="inp" data-f="n" type="number" min="1" max="200" inputmode="numeric" value="${esc(String(x[unit] || ''))}" style="width:84px" aria-label="${unit === 'seats' ? 'Places' : 'Llits'}">
      <button type="button" class="icon-btn" data-rm="${esc(x.id)}" aria-label="Treu-lo">${ICON.close}</button></div>`).join('');
  const read = el => {
    for (const k of ['title', 'from', 'to', 'place', 'deadline', 'notes']) t[k] = el.querySelector(`#tr-${k}`).value.trim();
    const secs = $$('#tr-secs .pick[aria-pressed="true"]', el).map(b => b.dataset.sec);
    t.sections = secs.length === SECTIONS.length ? [] : secs;
    for (const [key, unit] of [['transports', 'seats'], ['rooms', 'beds']]) el.querySelectorAll(`[data-k="${key}"]`).forEach(row => { const x = t[key].find(z => z.id === row.dataset.id); if (x) { x.name = row.querySelector('[data-f="name"]').value.trim(); x[unit] = +row.querySelector('[data-f="n"]').value || 0; } });
    t.closed = el.querySelector('#tr-closed').checked;
  };
  const paint = el => {
    el.querySelector('#tr-tr').innerHTML = listRows('transports', 'p. ex. Autocar 1', 'seats') || '<p class="muted" style="margin:0;font-size:13px">Cap. Si hi aneu en autocar o en tren, posa-hi cada vehicle i quantes places té.</p>';
    el.querySelector('#tr-rm').innerHTML = listRows('rooms', 'p. ex. 204', 'beds') || '<p class="muted" style="margin:0;font-size:13px">Cap. Si hi ha allotjament, posa-hi cada habitació i quants llits té.</p>';
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); t.transports = t.transports.filter(x => x.id !== b.dataset.rm); t.rooms = t.rooms.filter(x => x.id !== b.dataset.rm); paint(el); });
  };
  const secs = new Set((t.sections || []).length ? t.sections : SECTIONS.map(x => x.id));
  openSheet({
    title: ex ? 'Edita la sortida' : 'Nova sortida',
    wide: true,
    body: `<div class="kv">
      <label class="field"><span>Títol</span><input class="inp" id="tr-title" maxlength="80" value="${esc(t.title)}" placeholder="p. ex. Gira a Viena · Cap de setmana a Montserrat"></label>
      <div class="row2"><label class="field"><span>Del</span><input class="inp" id="tr-from" type="date" value="${esc(t.from)}"></label><label class="field"><span>Al</span><input class="inp" id="tr-to" type="date" value="${esc(t.to)}"></label></div>
      <div class="row2"><label class="field"><span>On</span><input class="inp" id="tr-place" maxlength="80" value="${esc(t.place)}"></label><label class="field"><span>Apuntar-s’hi fins al</span><input class="inp" id="tr-deadline" type="date" value="${esc(t.deadline)}"></label></div>
      <label class="field"><span>Informació</span><textarea class="inp" id="tr-notes" maxlength="1500" style="min-height:90px" placeholder="Horaris, preu, què cal portar, enllaços…">${esc(t.notes)}</textarea></label>
      <div class="field"><span>Per a</span><div class="pickers" id="tr-secs">${SECTIONS.map(x => secPick(x, secs.has(x.id))).join('')}</div></div>
      <div class="field"><span>Transport</span><div id="tr-tr" style="display:grid;gap:6px"></div><button type="button" class="btn btn-sm" id="tr-tr-add" style="width:max-content;margin-top:6px">+ Vehicle</button></div>
      <div class="field"><span>Habitacions</span><div id="tr-rm" style="display:grid;gap:6px"></div><button type="button" class="btn btn-sm" id="tr-rm-add" style="width:max-content;margin-top:6px">+ Habitació</button></div>
      <div class="toggle-row"><span><b>Inscripcions tancades</b><br><span class="muted" style="font-size:12.5px">Ningú més s’hi pot apuntar ni desapuntar</span></span><label class="switch"><input type="checkbox" id="tr-closed" ${t.closed ? 'checked' : ''}><span></span></label></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="tr-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="tr-save">Desa</button>`,
    onMount: el => {
      paint(el);
      el.querySelectorAll('#tr-secs .pick').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; if (!on && el.querySelectorAll('#tr-secs .pick[aria-pressed="true"]').length === 1) return; b.setAttribute('aria-pressed', on); });
      el.querySelector('#tr-tr-add').onclick = () => { read(el); t.transports.push({ id: uid('tv'), name: `Autocar ${t.transports.length + 1}`, seats: 55 }); paint(el); };
      el.querySelector('#tr-rm-add').onclick = () => { read(el); t.rooms.push({ id: uid('th'), name: '', beds: 2 }); paint(el); };
      el.querySelector('#tr-save').onclick = () => {
        read(el);
        if (!t.title || !t.from) { toast('Posa el títol i la data'); return; }
        if (t.to && t.to < t.from) { toast('La data de tornada ha de ser posterior'); return; }
        t.transports = t.transports.filter(x => x.name); t.rooms = t.rooms.filter(x => x.name);
        saveTrip(t); closeSheet(); toast(ex ? 'Sortida desada' : 'Sortida creada'); render();
      };
      el.querySelector('#tr-del')?.addEventListener('click', async () => {
        if (!await confirmSheet('Esborrar la sortida?', `S’esborrarà <b>${esc(ex.title)}</b> amb totes les inscripcions.`, 'Esborra')) return;
        S.trips.delete(ex.id); persist('trips', ex.id, null, 20);
        for (const [k, v] of [...S.tripSignups]) if (v.tripId === ex.id) { S.tripSignups.delete(k); persist('tripSignups', k, null, 20); }
        toast('Sortida esborrada'); render();
      });
    },
  });
}
/** L'equip: qui hi va, i a quin vehicle i habitació. */
function sheetTripAdmin(id) {
  const t = S.trips.get(id);
  if (!t) return;
  const opt = (list, key, unit, cur, used) => `<option value="">${key === 'transport' ? 'Sense transport' : 'Sense habitació'}</option>${list.map(x => `<option value="${esc(x.id)}" ${cur === x.id ? 'selected' : ''}>${esc(key === 'room' ? `Hab. ${x.name}` : x.name)} · ${used[x.id] || 0}/${x[unit] || 0}</option>`).join('')}`;
  const draw = el => {
    const c = tripCounts(t);
    el.querySelector('#ta-sum').innerHTML = `<b>${c.yes.length}</b> hi van · ${c.no.length} no · ${c.wait} sense resposta`;
    el.querySelector('#ta-list').innerHTML = SECTIONS.map(x => {
      const ms = c.people.filter(m => m.section === x.id);
      if (!ms.length) return '';
      return `<div class="section-title" style="margin-top:12px"><h2 class="h2">${esc(x.name)}</h2><span class="eyebrow">${ms.filter(m => signupOf(t, m.id)?.answer === 'yes').length} de ${ms.length}</span></div>
        <ul class="mini-list" style="max-height:none">${ms.map(m => {
          const s = signupOf(t, m.id);
          return `<li class="ta-row" data-mid="${m.id}"><span><b>${esc(m.name)}</b>${s?.note ? `<br><span class="m">${esc(s.note)}</span>` : ''}</span>
            <span class="ta-sel"><select class="inp" data-f="answer" aria-label="Hi va?"><option value="" ${!s ? 'selected' : ''}>—</option><option value="yes" ${s?.answer === 'yes' ? 'selected' : ''}>Hi va</option><option value="no" ${s?.answer === 'no' ? 'selected' : ''}>No hi va</option></select>
            ${s?.answer === 'yes' && (t.transports || []).length ? `<select class="inp" data-f="transport" aria-label="Transport">${opt(t.transports, 'transport', 'seats', s.transport, c.seats)}</select>` : ''}
            ${s?.answer === 'yes' && (t.rooms || []).length ? `<select class="inp" data-f="room" aria-label="Habitació">${opt(t.rooms, 'room', 'beds', s.room, c.beds)}</select>` : ''}</span></li>`;
        }).join('')}</ul>`;
    }).join('');
    el.querySelectorAll('.ta-row select').forEach(sel => sel.onchange = () => {
      const mid = sel.closest('.ta-row').dataset.mid;
      const prev = signupOf(t, mid) || { tripId: t.id, memberId: mid, answer: '', note: '' };
      const rec = { ...prev, [sel.dataset.f]: sel.value, at: new Date().toISOString(), uid: prev.uid || S.uid || '' };
      if (!rec.answer) { S.tripSignups.delete(`${t.id}_${mid}`); persist('tripSignups', `${t.id}_${mid}`, null, 20); draw(el); return; }
      for (const k of ['transport', 'room']) if (!rec[k] || rec.answer !== 'yes') delete rec[k];
      saveSignup(rec); draw(el);
    });
  };
  openSheet({
    title: t.title,
    wide: true,
    body: `<p style="margin-top:0"><b>${esc(capz(tripDates(t)))}</b>${t.place ? ` · ${esc(t.place)}` : ''}<br><span class="muted" id="ta-sum" style="font-size:13.5px"></span></p><div id="ta-list"></div>`,
    foot: `<span class="spacer"></span><button class="btn" id="ta-xls">Excel</button><button class="btn btn-primary" id="ta-pdf">PDF</button>`,
    onMount: el => {
      draw(el);
      el.querySelector('#ta-xls').onclick = async () => { await loadProfiles(); offerCSV(`sortida-${t.title}`, tripRows(t)); };
      el.querySelector('#ta-pdf').onclick = async () => { await loadProfiles(); printDoc(t.title, tripHtml(t)); };
    },
  });
}
function tripRows(t) {
  const name = (list, id) => (list || []).find(x => x.id === id)?.name || '';
  const rows = [['Nom i cognoms', V.Section, 'Hi va', 'Transport', 'Habitació', 'Telèfon', 'Contacte d’emergència', 'Nota']];
  for (const m of tripPeople(t)) {
    const s = signupOf(t, m.id), p = profileOf(m.id);
    rows.push([fullName(m.name), SEC[m.section].name, s ? (s.answer === 'yes' ? 'Sí' : 'No') : '', name(t.transports, s?.transport), name(t.rooms, s?.room), phoneOf(m), [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '), s?.note || '']);
  }
  return rows;
}
function tripHtml(t) {
  const c = tripCounts(t);
  const by = (list, key) => (list || []).map(x => ({ x, ms: c.yes.filter(m => signupOf(t, m.id)?.[key] === x.id) }));
  return `<p class="pr-sub">${esc(capz(tripDates(t)))}${t.place ? ` · ${esc(t.place)}` : ''} · ${c.yes.length} persones</p>
    ${(t.transports || []).length ? `<h2>Transport</h2>${by(t.transports, 'transport').map(({ x, ms }) => `<h3>${esc(x.name)} · ${ms.length}/${x.seats || 0}</h3><ol class="pr-list">${ms.map(m => `<li>${esc(fullName(m.name))} <small>${esc(phoneOf(m))}</small></li>`).join('')}</ol>`).join('')}` : ''}
    ${(t.rooms || []).length ? `<h2>Habitacions</h2><table class="pr-table"><tbody>${by(t.rooms, 'room').map(({ x, ms }) => `<tr><td><b>${esc(x.name)}</b></td><td>${ms.map(m => esc(fullName(m.name))).join(', ')}</td><td>${ms.length}/${x.beds || 0}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Qui hi va</h2><table class="pr-table"><thead><tr><th>Nom i cognoms</th><th>${esc(V.Section)}</th><th>Telèfon</th><th>Contacte d’emergència</th></tr></thead>
    <tbody>${c.yes.map(m => { const p = profileOf(m.id); return `<tr><td>${esc(fullName(m.name))}</td><td>${esc(SEC[m.section].name)}</td><td>${esc(phoneOf(m))}</td><td>${esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</tbody></table>`;
}

/* ---------- La meva fitxa ---------- */
// profiles/<membre> = { memberId, phone, size, emergencyName, emergencyPhone, at }: l'omple cadascú, i només la veuen
// ell mateix i l'equip (per a les llistes dels concerts i de les sortides).
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
async function sheetMyProfile() {
  const mid = myMemberId();
  if (!mid) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let p = {};
  try { const d = await db.doc(`profiles/${mid}`).get(); if (d.exists) p = d.data(); } catch {}
  openSheet({
    title: 'La meva fitxa',
    body: `<div class="kv">
      <label class="field"><span>Telèfon</span><input class="inp" id="pf-phone" type="tel" maxlength="20" autocomplete="tel" value="${esc(p.phone || S.members.get(mid)?.phone || '')}"></label>
      <div class="field"><span>Talla de vestuari</span><div class="pickers" id="pf-size">${SIZES.map(z => `<button type="button" class="pick" data-k="${z}" aria-pressed="${p.size === z}">${z}</button>`).join('')}</div></div>
      <div class="row2"><label class="field"><span>Contacte d’emergència</span><input class="inp" id="pf-en" maxlength="60" value="${esc(p.emergencyName || '')}" placeholder="Nom (i qui és: mare, parella…)"></label>
        <label class="field"><span>El seu telèfon</span><input class="inp" id="pf-ep" type="tel" maxlength="20" value="${esc(p.emergencyPhone || '')}"></label></div>
      <p class="muted" style="font-size:12.5px;margin:0">Només ho veu l’equip ${esc(V.del)} (administració, direcció, gerència, secretaria i ${esc(V.leaders)}), per a les llistes dels concerts i de les sortides. La resta, no.</p>
      <fieldset class="fieldset"><legend>Consentiments</legend>
        <div class="field"><span>Drets d’imatge: puc sortir a les fotos i els vídeos ${esc(V.del)}</span><div class="pickers" id="pf-img">${[['yes', 'Sí'], ['no', 'No']].map(([v, t]) => `<button type="button" class="pick" data-k="${v}" aria-pressed="${p.imageOk === v}">${t}</button>`).join('')}</div></div>
        <div class="toggle-row"><span><b>Protecció de dades</b><br><span class="muted" style="font-size:12.5px">Accepto que ${esc(ofName())} tracti les meves dades per organitzar l’activitat.</span></span><label class="switch"><input type="checkbox" id="pf-data" ${p.dataOk === 'yes' ? 'checked' : ''}><span></span></label></div>
        ${p.consentAt ? `<small class="muted">Respost el ${esc(ddmm(p.consentAt.slice(0, 10)))}.</small>` : ''}
      </fieldset>
      <div id="pf-mine"></div>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pf-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#pf-size .pick').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; el.querySelectorAll('#pf-size .pick').forEach(x => x.setAttribute('aria-pressed', on && x === b)); });
      el.querySelectorAll('#pf-img .pick').forEach(b => b.onclick = () => el.querySelectorAll('#pf-img .pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      // La quota i els documents que té posats la secretaria (només es poden mirar).
      db.doc(`memberDocs/${mid}`).get().then(d => {
        const box = el.querySelector('#pf-mine');
        if (!box || !d.exists) return;
        const x = d.data(), f = (x.fees || {})[feeKey()];
        box.innerHTML = `<dl class="fitxa"><div><dt>Quota ${esc(feeKey())}</dt><dd>${f?.paid ? `Pagada${f.date ? ` el ${esc(ddmm(f.date))}` : ''}` : 'Pendent'}</dd></div>
          ${DOC_ITEMS.filter(([k]) => x.docs?.[k]?.v).map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${x.docs[k].v === 'yes' ? 'Sí' : 'No'}${x.docs[k].file ? ' · document signat' : ''}</dd></div>`).join('')}</dl>`;
      }).catch(() => {});
      el.querySelector('#pf-save').onclick = async () => {
        const rec = { memberId: mid, phone: el.querySelector('#pf-phone').value.trim(), size: el.querySelector('#pf-size .pick[aria-pressed="true"]')?.dataset.k || '',
          emergencyName: el.querySelector('#pf-en').value.trim(), emergencyPhone: el.querySelector('#pf-ep').value.trim(), at: new Date().toISOString(),
          imageOk: el.querySelector('#pf-img .pick[aria-pressed="true"]')?.dataset.k || '', dataOk: el.querySelector('#pf-data').checked ? 'yes' : '' };
        rec.consentAt = rec.imageOk !== (p.imageOk || '') || rec.dataOk !== (p.dataOk || '') ? rec.at : (p.consentAt || '');
        try { await db.doc(`profiles/${mid}`).set(rec); if (S.profiles) S.profiles.set(mid, rec); closeSheet(); toast('Fitxa desada'); }
        catch { toast('No s’ha pogut desar. Comprova la connexió.'); }
      };
    },
  });
}
/** Per a l'equip, a la fitxa d'una persona: el que ha omplert ella mateixa. */
async function profileBox(el, mid) {
  const box = el.querySelector('#me-profile');
  if (!box || !canEdit()) return;
  let p = null;
  try { const d = await db.doc(`profiles/${mid}`).get(); p = d.exists ? d.data() : null; } catch {}
  if (!box.isConnected) return;
  box.innerHTML = p && (p.phone || p.size || p.emergencyName || p.emergencyPhone)
    ? `<dl class="fitxa">${[['Telèfon', p.phone], ['Talla', p.size], ['Emergència', [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · ')]].filter(([, v]) => v).map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    : '<span class="muted" style="font-size:13px">Encara no ha omplert la seva fitxa (telèfon, talla i contacte d’emergència).</span>';
}
