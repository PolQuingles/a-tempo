// A Tempo · 19-concerts.js — Concerts i gerència: l'equilibri de veus segons qui ha confirmat, la col·locació a
// l'escenari, la llista de participants (PDF o Excel), els certificats d'assistència i la memòria de la temporada.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Imprimir o desar en PDF, i Excel ---------- */
// Sense cap biblioteca: es pinta el document a #print-root i s'obre el diàleg d'imprimir del navegador, que també
// el desa en PDF. L'«Excel» és un CSV amb punt i coma i BOM, que l'Excel obre directament amb els accents bé.
const slugify = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
function printDoc(title, html) {
  let root = $('#print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  const logo = S.config.brand?.logo;
  root.innerHTML = `<article class="pr-doc">
    <header class="pr-h">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><b>${esc(S.config.name || '')}</b><span>${esc(title)}</span></div></header>
    ${html}
    <footer class="pr-f">${esc(S.config.name || '')} · ${esc(longDate(TODAY))}</footer></article>`;
  const was = document.title;
  document.title = `${title} · ${S.config.shortName || S.config.name || ''}`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; document.title = was; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch { done(); } }, 60);
}
function offerCSV(name, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  offerFile(`${slugify(name)}.csv`, '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv');
}
/** La fitxa que omple cada persona (telèfon, talla, contacte d'emergència): només l'equip la pot llegir, i es llegeix quan cal. */
async function loadProfiles() {
  if (!canEdit()) return new Map();
  try { const snap = await db.collection('profiles').get(); S.profiles = new Map(snap.docs.map(d => [d.id, d.data()])); }
  catch { S.profiles = S.profiles || new Map(); }
  return S.profiles;
}
const profileOf = mid => (S.profiles && S.profiles.get(mid)) || {};
const phoneOf = m => profileOf(m.id).phone || m.phone || '';

/* ---------- Equilibri de veus d'un concert ---------- */
// Per a cada corda: quants han dit que hi seran, quants no i quants encara no han respost, comparat amb el mínim de
// cada corda (Ajustos › Norma). Sense demanar confirmació, compten tots els convocats menys els que han avisat que no hi van.
const voiceMin = () => S.config.voiceMin || {};
function concertBalance(s) {
  return SECTIONS.filter(x => convoked(s, x.id)).map(x => {
    let yes = 0, no = 0, wait = 0;
    const ms = membersOf(x.id).filter(m => !isOut(s, m));
    for (const m of ms) {
      const a = S.rsvp.get(`${s.id}_${m.id}`)?.answer;
      const away = absencesFor(s.id, m.id).some(z => z.kind === 'absent');
      if (a === 'no' || away) no++;
      else if (a === 'yes' || !s.rsvp) yes++;
      else wait++;
    }
    const min = +voiceMin()[x.id] || 0;
    return { x, yes, no, wait, total: ms.length, min, short: !!min && yes < min, lost: !!min && yes + wait < min };
  });
}
function balanceBlock(s) {
  if (!canEdit()) return '';
  const bal = concertBalance(s);
  if (!bal.length) return '';
  const warn = bal.filter(b => b.short);
  return `<div class="section-title" style="margin-top:16px"><h2 class="h2">${esc(V.balance)}</h2><span class="eyebrow">${s.rsvp ? 'segons les confirmacions' : 'convocats'}</span></div>
    <div class="vbal">${bal.map(b => `<div class="vb ${b.lost ? 'lost' : b.short ? 'short' : ''}">
      <em>${esc(b.x.short)}</em><b>${b.yes}</b><small>${b.min ? `mínim ${b.min}` : `de ${b.total}`}</small>
      <span>${[b.wait ? `${b.wait} sense resposta` : '', b.no ? `${b.no} no` : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></div>`).join('')}</div>
    ${warn.length ? `<p class="vb-warn">${warn.map(b => `A ${esc(b.x.name.toLowerCase())} ${b.min - b.yes === 1 ? 'hi falta 1 persona' : `hi falten ${b.min - b.yes} persones`}${b.lost ? ', i ja no hi arriben ni que responguin tots' : ''}`).join('. ')}.</p>`
      : bal.some(b => b.min) ? '<p class="muted" style="font-size:12.5px;margin:6px 2px 0">Totes les cordes arriben al mínim.</p>'
      : `<p class="muted" style="font-size:12.5px;margin:6px 2px 0">Pots posar el mínim de cada ${V.section} a Ajustos › Norma, i l’app avisarà si en falta.</p>`}`;
}
/** Els concerts dels propers 45 dies on alguna corda queda curta (per a «Per fer»). */
function shortConcerts() {
  if (!canEdit() || !Object.values(voiceMin()).some(v => +v)) return [];
  const until = isoDate(new Date(Date.now() + 45 * 864e5));
  return allSessions().filter(s => isShow(s) && s.date >= TODAY && s.date <= until).map(s => ({ s, short: concertBalance(s).filter(b => b.short) })).filter(x => x.short.length);
}

/* ---------- Col·locació a l'escenari ---------- */
// session.seating = { rows: [[memberId | '' …] …] }. La fila 1 és la de davant, i es mira des de la direcció.
const seatRows = s => (s.seating && s.seating.rows) || [];
function mySeat(s, mid) {
  const rows = seatRows(s);
  for (let r = 0; r < rows.length; r++) { const c = rows[r].indexOf(mid); if (c >= 0) return { row: r + 1, pos: c + 1 }; }
  return null;
}
/** Qui hi pot sortir: convocats, que no estan de baixa ni fora de la producció i que no han dit que no hi aniran. */
function stageMembers(s) {
  return SECTIONS.filter(x => convoked(s, x.id)).flatMap(x => membersOf(x.id)).filter(m => !isOut(s, m)
    && S.rsvp.get(`${s.id}_${m.id}`)?.answer !== 'no' && !absencesFor(s.id, m.id).some(z => z.kind === 'absent'));
}
/** Per cordes: cada corda ocupa unes columnes seguides, de davant a darrere. */
function autoSeating(s, nRows) {
  const people = stageMembers(s);
  const cols = [];
  for (const x of SECTIONS) {
    const ms = people.filter(m => m.section === x.id).sort((a, b) => (a.part || '').localeCompare(b.part || '') || byName(a, b));
    for (let i = 0; i < ms.length; i += nRows) cols.push(ms.slice(i, i + nRows));
  }
  return Array.from({ length: nRows }, (_, r) => cols.map(col => col[r] ? col[r].id : ''));
}
const secIdx = id => Math.max(0, SECTIONS.findIndex(x => x.id === id)) % 8;
function seatCell(mid, extra = '') {
  const m = S.members.get(mid);
  return m ? `<span class="seat sx${secIdx(m.section)} ${extra}" title="${esc(m.name)}"><b>${esc(firstName(m.name))}</b><small>${esc(partTag(m) || SEC[m.section].short)}</small></span>`
    : `<span class="seat empty ${extra}"></span>`;
}
function seatingHtml(s, me) {
  const rows = seatRows(s);
  if (!rows.length) return '';
  return `<div class="stage-wrap"><div class="stage">${rows.slice().reverse().map((row, i) => `<div class="stage-row"><span class="stage-n">${rows.length - i}</span>${row.map(mid => seatCell(mid, me && mid === me.id ? 'me' : '')).join('')}</div>`).join('')}
    <div class="stage-front">Davant · direcció i públic</div></div></div>`;
}
function seatingBlock(s) {
  if (!isShow(s)) return '';
  const me = S.members.get(myMemberId());
  const seat = me && mySeat(s, me.id);
  if (!seatRows(s).length) return canEdit() ? `<div class="section-title" style="margin-top:16px"><h2 class="h2">Col·locació</h2><button class="btn btn-sm" data-act="seating-edit" data-sid="${s.id}">Fes-la</button></div>` : '';
  return `<div class="section-title" style="margin-top:16px"><h2 class="h2">Col·locació</h2>${canEdit() ? `<button class="btn btn-sm" data-act="seating-edit" data-sid="${s.id}">Edita-la</button>` : ''}</div>
    ${seat ? `<p class="seat-me">El teu lloc: <b>fila ${seat.row}</b>${seat.row === 1 ? ' (la de davant)' : ''}, <b>${seat.pos}${seat.pos === 1 ? 'r' : seat.pos === 2 ? 'n' : seat.pos === 3 ? 'r' : seat.pos === 4 ? 't' : 'è'}</b> des de l’esquerra de la direcció.</p>` : ''}
    ${seatingHtml(s, me)}
    <p class="muted" style="font-size:12px;margin:6px 2px 0">Vist des de la direcció: la fila 1 és la de davant.</p>`;
}
function sheetSeating(sid) {
  const s = sessionById(sid);
  if (!s) return;
  let rows = clone(seatRows(s));
  let sel = null;   // { r, c } o { pool: memberId }
  const people = stageMembers(s);
  const placed = () => new Set(rows.flat().filter(Boolean));
  const size = () => ({ n: rows.length, w: Math.max(0, ...rows.map(r => r.length)) });
  const resize = (n, w) => {
    const all = rows.flat().filter(Boolean);
    const next = Array.from({ length: n }, (_, r) => Array.from({ length: w }, (_, c) => (rows[r] && rows[r][c]) || ''));
    // Qui es queda fora del requadre torna a la llista de pendents.
    rows = next;
    return all.filter(id => !rows.flat().includes(id)).length;
  };
  const paint = el => {
    const pl = placed();
    const pool = people.filter(m => !pl.has(m.id));
    const { n, w } = size();
    el.querySelector('#st-grid').innerHTML = n ? `<div class="stage edit">${rows.slice().reverse().map((row, i) => {
      const r = rows.length - 1 - i;
      return `<div class="stage-row"><span class="stage-n">${r + 1}</span>${row.map((mid, c) => `<button type="button" class="seat-b${sel && sel.r === r && sel.c === c ? ' sel' : ''}" data-r="${r}" data-c="${c}" aria-label="Fila ${r + 1}, lloc ${c + 1}${mid ? `: ${esc(S.members.get(mid)?.name || '')}` : ', buit'}">${seatCell(mid)}</button>`).join('')}</div>`;
    }).join('')}<div class="stage-front">Davant · direcció i públic</div></div>` : '<p class="muted" style="margin:0;font-size:13px">Tria quantes files i llocs vols, o col·loca’ls per cordes.</p>';
    el.querySelector('#st-pool').innerHTML = pool.length ? pool.map(m => `<button type="button" class="chip sx${secIdx(m.section)}${sel && sel.pool === m.id ? ' sel' : ''}" data-pool="${m.id}">${esc(m.name)}</button>`).join('')
      : `<span class="muted" style="font-size:13px">Tothom té lloc.</span>`;
    el.querySelector('#st-count').textContent = `${pl.size} de ${people.length} amb lloc`;
    el.querySelector('#st-rows').value = n || ''; el.querySelector('#st-w').value = w || '';
    el.querySelector('#st-clear-one').hidden = !(sel && sel.r != null && rows[sel.r][sel.c]);
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const r = +b.dataset.r, c = +b.dataset.c;
      if (sel && sel.pool) { rows[r][c] = sel.pool; sel = null; }
      else if (sel && sel.r != null) { if (sel.r !== r || sel.c !== c) [rows[r][c], rows[sel.r][sel.c]] = [rows[sel.r][sel.c], rows[r][c]]; sel = null; }
      else sel = { r, c };
      paint(el);
    });
    el.querySelectorAll('[data-pool]').forEach(b => b.onclick = () => {
      if (sel && sel.r != null) { rows[sel.r][sel.c] = b.dataset.pool; sel = null; }
      else sel = sel && sel.pool === b.dataset.pool ? null : { pool: b.dataset.pool };
      paint(el);
    });
  };
  openSheet({
    title: `Col·locació · ${s.type || V.sh.Show}`,
    wide: true,
    body: `<p style="margin-top:0"><b>${esc(longDate(s.date))}</b> · ${esc(prodNames(s))}<br><span class="muted" style="font-size:13px">Toca un lloc i després un altre per canviar-los, o un nom de sota i després un lloc. Vist des de la direcció.</span></p>
      <div class="st-tools">
        <label class="field"><span>Files</span><input class="inp" id="st-rows" type="number" min="1" max="10" inputmode="numeric"></label>
        <label class="field"><span>Llocs per fila</span><input class="inp" id="st-w" type="number" min="1" max="40" inputmode="numeric"></label>
        <button type="button" class="btn btn-sm" id="st-auto">Col·loca per ${esc(V.sections)}</button>
        <button type="button" class="btn btn-sm btn-ghost" id="st-clear-one" hidden>Buida aquest lloc</button>
      </div>
      <div id="st-grid" class="stage-wrap"></div>
      <div class="section-title" style="margin-top:14px"><h2 class="h2">Sense lloc</h2><span class="eyebrow" id="st-count"></span></div>
      <div class="pickers" id="st-pool"></div>`,
    foot: `${seatRows(s).length ? '<button class="btn btn-danger-ghost" id="st-del">Esborra-la</button>' : ''}<button class="btn" id="st-print">PDF</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="st-save">Desa</button>`,
    onMount: el => {
      paint(el);
      const apply = () => {
        const n = Math.min(10, Math.max(1, +el.querySelector('#st-rows').value || 1)), w = Math.min(40, Math.max(1, +el.querySelector('#st-w').value || 1));
        const lost = resize(n, w); sel = null; paint(el);
        if (lost) toast(`${lost} ${lost === 1 ? 'persona ha tornat' : 'persones han tornat'} a «Sense lloc»`);
      };
      el.querySelector('#st-rows').onchange = apply; el.querySelector('#st-w').onchange = apply;
      el.querySelector('#st-auto').onclick = () => { rows = autoSeating(s, Math.min(10, Math.max(1, +el.querySelector('#st-rows').value || 3))); sel = null; paint(el); };
      el.querySelector('#st-clear-one').onclick = () => { if (sel && sel.r != null) rows[sel.r][sel.c] = ''; sel = null; paint(el); };
      el.querySelector('#st-print').onclick = () => printDoc(`Col·locació · ${prodNames(s)}`, `<p class="pr-sub">${esc(longDate(s.date))}${s.place ? ` · ${esc(s.place)}` : ''}</p>${seatingPrint(rows)}`);
      el.querySelector('#st-save').onclick = () => {
        const clean = rows.filter(r => r.some(Boolean));
        updateSession(sid, { seating: clean.length ? { rows: clean, at: new Date().toISOString() } : null });
        closeSheet(); toast('Col·locació desada'); render();
      };
      el.querySelector('#st-del')?.addEventListener('click', () => { updateSession(sid, { seating: null }); closeSheet(); toast('Col·locació esborrada'); render(); });
    },
  });
}
function seatingPrint(rows) {
  return `<table class="pr-stage">${rows.slice().reverse().map((row, i) => `<tr><th>${rows.length - i}</th>${row.map(mid => { const m = S.members.get(mid); return `<td class="${m ? `sx${secIdx(m.section)}` : ''}">${m ? `${esc(m.name.includes(',') ? m.name.split(',').reverse().join(' ').trim() : m.name)}<small>${esc(partTag(m) || SEC[m.section].short)}</small>` : ''}</td>`; }).join('')}</tr>`).join('')}</table>
    <p class="pr-note">Davant: direcció i públic. La fila 1 és la de davant.</p>`;
}

/* ---------- Llista de participants d'un concert ---------- */
const fullName = n => String(n || '').includes(',') ? String(n).split(',').reverse().join(' ').trim() : String(n || '');
function concertPeople(s, onlyYes) {
  return stageMembers(s).filter(m => !onlyYes || !s.rsvp || S.rsvp.get(`${s.id}_${m.id}`)?.answer === 'yes')
    .sort((a, b) => secIdx(a.section) - secIdx(b.section) || (a.part || '').localeCompare(b.part || '') || byName(a, b));
}
const PART_COLS = [['sec', 'Corda i veu', true], ['phone', 'Telèfon', false], ['emerg', 'Contacte d’emergència', false], ['size', 'Talla', false], ['sign', 'Signatura', false]];
function participantRows(s, onlyYes, cols) {
  const head = ['Núm.', 'Nom i cognoms', ...PART_COLS.filter(([k]) => cols.has(k)).map(([, l]) => l)];
  const rows = concertPeople(s, onlyYes).map((m, i) => {
    const p = profileOf(m.id);
    const cell = { sec: `${SEC[m.section].name}${m.part ? ` ${m.part}` : ''}`, phone: phoneOf(m), emerg: [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '), size: p.size || '', sign: '' };
    return [i + 1, fullName(m.name), ...PART_COLS.filter(([k]) => cols.has(k)).map(([k]) => cell[k])];
  });
  return { head, rows };
}
async function sheetParticipants(sid) {
  const s = sessionById(sid);
  if (!s) return;
  await loadProfiles();
  let onlyYes = !!s.rsvp;
  const cols = new Set(PART_COLS.filter(([, , on]) => on).map(([k]) => k));
  const title = `${s.type || V.sh.Show} · ${prodNames(s)}`;
  const count = el => { el.querySelector('#pt-n').textContent = `${concertPeople(s, onlyYes).length} persones a la llista`; };
  openSheet({
    title: 'Llista de participants',
    body: `<p style="margin-top:0"><b>${esc(title)}</b><br><span class="muted" style="font-size:13.5px">${esc(longDate(s.date))}${s.place ? ` · ${esc(s.place)}` : ''}</span></p>
      ${s.rsvp ? `<div class="field"><span>Qui hi surt</span><div class="pickers" id="pt-who">
        <button type="button" class="pick" data-k="yes" aria-pressed="true">Els que han confirmat</button>
        <button type="button" class="pick" data-k="all" aria-pressed="false">Tots menys els que no hi van</button></div></div>` : ''}
      <div class="field" style="margin-top:10px"><span>Columnes</span><div class="pickers" id="pt-cols">${PART_COLS.map(([k, l]) => `<button type="button" class="pick" data-k="${k}" aria-pressed="${cols.has(k)}">${l}</button>`).join('')}</div>
        <small>El telèfon, la talla i el contacte d’emergència els omple cadascú a «La meva fitxa». Per al teatre o l’assegurança.</small></div>
      <p class="muted" id="pt-n" style="margin:12px 0 0;font-size:13.5px"></p>`,
    foot: `<span class="spacer"></span><button class="btn" id="pt-xls">Excel</button><button class="btn btn-primary" id="pt-pdf">PDF</button>`,
    onMount: el => {
      count(el);
      el.querySelectorAll('#pt-who .pick').forEach(b => b.onclick = () => { onlyYes = b.dataset.k === 'yes'; el.querySelectorAll('#pt-who .pick').forEach(x => x.setAttribute('aria-pressed', x === b)); count(el); });
      el.querySelectorAll('#pt-cols .pick').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); on ? cols.add(b.dataset.k) : cols.delete(b.dataset.k); });
      el.querySelector('#pt-xls').onclick = () => { const t = participantRows(s, onlyYes, cols); offerCSV(`participants-${s.date}-${prodNames(s)}`, [t.head, ...t.rows]); };
      el.querySelector('#pt-pdf').onclick = () => printDoc(`Llista de participants · ${title}`, participantsHtml(s, onlyYes, cols));
    },
  });
}
function participantsHtml(s, onlyYes, cols) {
  const t = participantRows(s, onlyYes, cols);
  return `<p class="pr-sub">${esc(longDate(s.date))}${s.time ? ` · ${esc(timeRange(s))}` : ''}${s.place ? ` · ${esc(s.place)}` : ''} · ${t.rows.length} persones</p>
    <table class="pr-table${cols.has('sign') ? ' sign' : ''}"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ---------- Certificat d'assistència ---------- */
function certificateData(m, from, to) {
  const st = computeStats({ kind: 'range', from, to, name: '' }, m.section);
  const r = st.rows.find(x => x.m.id === m.id) || { P: 0, R: 0, FJ: 0, FNJ: 0 };
  const shows = allSessions().filter(s => isShow(s) && s.date >= from && s.date <= to && s.date <= TODAY && convoked(s, m.section) && !isOut(s, m))
    .filter(s => { const mk = effMark(s, m); return mk ? ['P', 'R'].includes(mk.s) : S.rsvp.get(`${s.id}_${m.id}`)?.answer !== 'no' && !absencesFor(s.id, m.id).some(z => z.kind === 'absent'); });
  return { att: r.P + r.R, total: r.P + r.R + r.FJ + r.FNJ, rate: rate(r), shows };
}
function certificateHtml({ m, from, to, label, signer, role, place }) {
  const d = certificateData(m, from, to);
  const group = S.config.name || '';
  return `<div class="pr-cert">
    <h1>Certificat d’assistència</h1>
    <p><b>${esc(signer || '…')}</b>${role ? `, ${esc(role)}` : ''} ${esc(ofName(group))},</p>
    <p class="pr-big">CERTIFICA</p>
    <p>Que <b>${esc(fullName(m.name))}</b> ${m.active === false ? 'ha format' : 'forma'} part ${esc(ofName(group))} com a ${esc(V.member)} de la ${esc(V.section)} de ${esc(SEC[m.section].name.toLowerCase())}${label ? `, i que durant ${esc(label)}` : ', i que'} (del ${esc(fmtD(from, { day: 'numeric', month: 'long', year: 'numeric' }))} al ${esc(fmtD(to < TODAY ? to : TODAY, { day: 'numeric', month: 'long', year: 'numeric' }))})
      ha assistit a <b>${d.att}</b> de les <b>${d.total}</b> sessions de treball convocades${d.rate != null ? ` (${pct(d.rate)})` : ''}${d.shows.length ? ` i ha participat ${d.shows.length === 1 ? 'en 1 concert' : `en ${d.shows.length} concerts`}` : ''}.</p>
    ${d.shows.length ? `<ul class="pr-list">${d.shows.map(s => `<li>${esc(fmtD(s.date, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(prodNames(s))}${s.place ? ` · ${esc(s.place)}` : ''}</li>`).join('')}</ul>` : ''}
    <p>I, perquè així consti, signo aquest certificat${place ? ` a ${esc(place)}` : ''}, ${esc(fmtD(TODAY, { day: 'numeric', month: 'long', year: 'numeric' }))}.</p>
    <div class="pr-sign"><span></span><small>${esc(signer || '')}${role ? ` · ${esc(role)}` : ''}</small></div></div>`;
}
function sheetCertificate(mid) {
  const m = S.members.get(mid);
  if (!m) return;
  const { season, terms } = seasonCfg();
  const periods = [['season', season.name || 'Temporada', season.from, season.to], ...terms.map((t, i) => [`t${i}`, t.name, t.from, t.to]),
    ...productionsSorted().filter(p => allSessions(p.id).length).map(p => { const ss = allSessions(p.id); return [`p${p.id}`, p.name, ss[0].date, ss[ss.length - 1].date]; })];
  const roleName = S.me ? rolesText(S.me).split(' · ')[0] : '';
  openSheet({
    title: 'Certificat d’assistència',
    body: `<p style="margin-top:0"><b>${esc(fullName(m.name))}</b> · ${esc(SEC[m.section].name)}</p>
      <div class="kv">
        <label class="field"><span>Període</span><select class="inp" id="ce-per">${periods.map(([k, l, f, t]) => `<option value="${esc(k)}">${esc(l)} (${ddmm(f)}–${ddmm(t)})</option>`).join('')}</select></label>
        <div class="row2"><label class="field"><span>Qui el signa</span><input class="inp" id="ce-who" maxlength="60" value="${esc(fullName(S.me?.name || S.userName || ''))}"></label>
          <label class="field"><span>Càrrec</span><input class="inp" id="ce-role" maxlength="40" value="${esc(roleName)}" placeholder="p. ex. Secretaria"></label></div>
        <label class="field"><span>Lloc</span><input class="inp" id="ce-place" maxlength="40" value="${esc(S.config.city || '')}" placeholder="p. ex. Barcelona"></label>
      </div>
      <div class="cert-prev" id="ce-prev"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="ce-pdf">PDF</button>`,
    onMount: el => {
      const opts = () => { const [k, label, from, to] = periods.find(p => p[0] === el.querySelector('#ce-per').value); return { m, from, to, label: k === 'season' ? `la ${label.toLowerCase().startsWith('temporada') ? label.toLowerCase() : `temporada ${label}`}` : k.startsWith('t') ? `el ${label}` : `la producció «${label}»`, signer: el.querySelector('#ce-who').value.trim(), role: el.querySelector('#ce-role').value.trim(), place: el.querySelector('#ce-place').value.trim() }; };
      const prev = () => { el.querySelector('#ce-prev').innerHTML = certificateHtml(opts()); };
      prev();
      el.querySelectorAll('#ce-per, #ce-who, #ce-role, #ce-place').forEach(x => x.addEventListener('input', prev));
      el.querySelector('#ce-pdf').onclick = () => {
        const place = el.querySelector('#ce-place').value.trim();
        if (place && place !== S.config.city && canEdit()) saveConfig({ city: place });
        printDoc(`Certificat · ${fullName(m.name)}`, certificateHtml(opts()));
      };
    },
  });
}

/* ---------- Memòria de la temporada ---------- */
async function seasonFigures() {
  const { season } = seasonCfg();
  const from = season.from, to = season.to;
  const inSeason = d => d && d >= from && d <= to;
  const sessions = allSessions().filter(s => inSeason(s.date));
  const done = sessions.filter(s => s.date <= TODAY);
  const shows = done.filter(isShow);
  const prods = productionsSorted().filter(p => allSessions(p.id).some(s => inSeason(s.date)));
  const active = membersOf(null).length, inactive = membersOf(null, true).filter(m => m.active === false).length;
  const leaves = membersOf(null, true).filter(m => (m.leaves || []).some(l => l.from <= to && (!l.to || l.to >= from))).length;
  const st = computeStats({ kind: 'range', from, to: TODAY < to ? TODAY : to, name: season.name }, '');
  const sum = st.rows.reduce((c, r) => { for (const k of ['P', 'R', 'FJ', 'FNJ', 'min']) c[k] += r[k] || 0; return c; }, { P: 0, R: 0, FJ: 0, FNJ: 0, min: 0 });
  const bySec = SECTIONS.map(x => { const rs = st.rows.filter(r => r.m.section === x.id); const c = rs.reduce((a, r) => { for (const k of ['P', 'R', 'FJ', 'FNJ']) a[k] += r[k] || 0; return a; }, { P: 0, R: 0, FJ: 0, FNJ: 0 }); return { x, n: membersOf(x.id).length, rate: rate(c) }; });
  const types = {};
  for (const s of done) types[s.type || 'Assaig'] = (types[s.type || 'Assaig'] || 0) + 1;
  let classes = null;
  if (classesOn()) {
    try {
      const snap = await db.collection('classes').where('date', '>=', from).get();
      const days = snap.docs.map(d => d.data()).filter(c => !c.deleted && !c.cancelled && c.date <= to && c.date <= TODAY);
      const slots = days.flatMap(c => (c.slots || []).filter(x => x.memberId));
      const marked = slots.filter(x => x.mark);
      classes = { days: days.length, hours: Math.round(slots.reduce((n, x) => n + (+x.mins || 0), 0) / 60), students: new Set(slots.map(x => x.memberId)).size,
        teachers: new Set(days.map(c => c.teacher)).size, rate: marked.length ? marked.filter(x => ['P', 'R'].includes(x.mark)).length / marked.length : null };
    } catch {}
  }
  const works = worksSorted().filter(w => (w.prods || []).some(p => prods.some(x => x.id === p)));
  return {
    season, from, to, active, inactive, leaves, bySec, types, prods, shows, sessions: sessions.length, done: done.length, rate: rate(sum), lates: sum.R, lateMin: sum.min,
    classes, works: works.length, anns: [...S.announcements.values()].filter(a => inSeason((a.createdAt || '').slice(0, 10))).length,
    polls: [...S.polls.values()].filter(p => inSeason((p.createdAt || '').slice(0, 10))).length, trips: [...S.trips.values()].filter(t => inSeason(t.from)).length,
  };
}
function seasonRows(f) {
  const rows = [['Temporada', f.season.name], ['Període', `${f.from} – ${f.to}`], ['', ''],
    [`${capz(V.members)} en actiu`, f.active], ...f.bySec.map(b => [`  ${b.x.name}`, b.n]), ['Baixes (fitxes desactivades)', f.inactive], ['Amb baixa temporal durant la temporada', f.leaves], ['', ''],
    ['Produccions', f.prods.length], ...f.prods.map(p => [`  ${p.name}`, '']), ['Sessions fetes', `${f.done} de ${f.sessions} previstes`], ...Object.entries(f.types).map(([k, v]) => [`  ${k}`, v]),
    [capz(V.sh.els), f.shows.length], ...f.shows.map(s => [`  ${s.date} · ${prodNames(s)}`, s.place || '']), ['', ''],
    ['Assistència mitjana', f.rate == null ? '' : pct(f.rate)], ...f.bySec.map(b => [`  ${b.x.name}`, b.rate == null ? '' : pct(b.rate)]), ['Retards', `${f.lates} (${f.lateMin} min)`], ['', ''],
    ['Obres al repertori de la temporada', f.works], ['Anuncis publicats', f.anns], ['Enquestes', f.polls], ['Sortides', f.trips]];
  if (f.classes) rows.push(['', ''], [V.classes, ''], ['  Professorat', f.classes.teachers], [`  ${capz(V.members)} amb classe`, f.classes.students], ['  Dies de classe', f.classes.days], ['  Hores de classe', f.classes.hours], ['  Assistència a classe', f.classes.rate == null ? '' : pct(f.classes.rate)]);
  return rows;
}
function seasonHtml(f) {
  const k = (v, l) => `<div class="pr-kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  return `<p class="pr-sub">${esc(f.season.name)} · del ${esc(fmtD(f.from, { day: 'numeric', month: 'long', year: 'numeric' }))} al ${esc(fmtD(f.to, { day: 'numeric', month: 'long', year: 'numeric' }))}${f.to > TODAY ? ` · dades fins avui` : ''}</p>
    <div class="pr-kpis">${k(f.active, `${V.members} en actiu`)}${k(f.done, 'sessions fetes')}${k(f.shows.length, V.sh.els)}${k(f.rate == null ? '—' : pct(f.rate), 'assistència mitjana')}</div>
    <h2>${esc(capz(V.members))}</h2>
    <table class="pr-table"><tbody>${f.bySec.map(b => `<tr><td>${esc(b.x.name)}</td><td>${b.n}</td><td>${b.rate == null ? '—' : pct(b.rate)} d’assistència</td></tr>`).join('')}
      <tr><td>Baixes</td><td colspan="2">${f.inactive} fitxes desactivades · ${f.leaves} amb baixa temporal</td></tr></tbody></table>
    <h2>Activitat</h2>
    <table class="pr-table"><tbody>${f.prods.map(p => `<tr><td>${esc(p.name)}</td><td>${allSessions(p.id).filter(s => s.date <= TODAY).length} sessions</td></tr>`).join('')}
      ${Object.entries(f.types).map(([t, n]) => `<tr><td class="muted">${esc(t)}</td><td>${n}</td></tr>`).join('')}</tbody></table>
    ${f.shows.length ? `<h2>${esc(capz(V.sh.els))}</h2><ul class="pr-list">${f.shows.map(s => `<li>${esc(fmtD(s.date, { day: 'numeric', month: 'long' }))} · ${esc(prodNames(s))}${s.place ? ` · ${esc(s.place)}` : ''}</li>`).join('')}</ul>` : ''}
    ${f.classes ? `<h2>${esc(V.classes)}</h2><p>${f.classes.teachers} professors, ${f.classes.students} ${esc(V.members)} amb classe, ${f.classes.days} dies i ${f.classes.hours} hores de classe${f.classes.rate != null ? `, amb un ${pct(f.classes.rate)} d’assistència` : ''}.</p>` : ''}
    <h2>Comunicació i repertori</h2><p>${f.works} obres al repertori · ${f.anns} anuncis · ${f.polls} enquestes · ${f.trips} sortides · ${f.lates} retards (${f.lateMin} minuts en total).</p>`;
}
async function sheetSeasonReport() {
  openSheet({ title: 'Memòria de la temporada', wide: true, body: '<p class="muted" style="margin:0">Calculant les xifres…</p>' });
  const f = await seasonFigures();
  if (!sheetClose) return;
  openSheet({
    title: 'Memòria de la temporada',
    wide: true,
    body: `<div class="report">${seasonHtml(f)}</div>`,
    foot: `<button class="btn" id="sr-copy">Copia</button><span class="spacer"></span><button class="btn" id="sr-xls">Excel</button><button class="btn btn-primary" id="sr-pdf">PDF</button>`,
    onMount: el => {
      el.querySelector('#sr-copy').onclick = () => copyText(seasonRows(f).map(([a, b]) => a ? `${a}${b !== '' ? `: ${b}` : ''}` : '').join('\n'), 'Xifres copiades');
      el.querySelector('#sr-xls').onclick = () => offerCSV(`memoria-${f.season.name}`, seasonRows(f));
      el.querySelector('#sr-pdf').onclick = () => printDoc(`Memòria de la temporada · ${f.season.name}`, seasonHtml(f));
    },
  });
}
