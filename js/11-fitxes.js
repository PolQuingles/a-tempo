// A Tempo · 11-fitxes.js — Fitxes (finestres): sessions, resum, fitxa del concert, persones, produccions i avisos d'absència.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Sheets ================= */
let sheetClose = null;
function openSheet({ title, body, foot = '', onMount, wide }) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-back" data-sheet-back>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="max-width:680px"' : ''}>
      <div class="sheet-h"><h2 class="h2">${esc(title)}</h2><button class="icon-btn" data-act="sheet-close" aria-label="Tanca">${ICON.close}</button></div>
      <div class="sheet-b">${body}</div>
      ${foot ? `<div class="sheet-f">${foot}</div>` : ''}
    </div></div>`;
  const back = root.firstElementChild;
  const prevFocus = document.activeElement;
  back.addEventListener('click', e => { if (e.target === back) closeSheet(); });
  const onKey = e => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  sheetClose = () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; root.innerHTML = ''; prevFocus?.focus?.({ preventScroll: true }); };
  const first = back.querySelector('.sheet-b input:not([type=checkbox]):not([type=file]), .sheet-b textarea');
  if (onMount) onMount(back.querySelector('.sheet'));
  if (first && window.matchMedia('(hover:hover)').matches) first.focus();
  else back.querySelector('[data-act="sheet-close"]').focus({ preventScroll: true });
  if (typeof routeSheetOpened === 'function') routeSheetOpened();
}
function closeSheet() { if (sheetClose) { const f = sheetClose; sheetClose = null; f(); if (typeof routeSheetClosed === 'function') routeSheetClosed(); } }

function confirmSheet(title, text, ok = 'Confirma', danger = true) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; closeSheet(); resolve(v); };
    openSheet({
      title, body: `<p style="margin:0">${text}</p>`,
      foot: `<button class="btn" id="cf-no">Cancel·la</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-yes">${esc(ok)}</button>`,
      onMount: el => {
        el.querySelector('#cf-no').onclick = () => finish(false);
        el.querySelector('#cf-yes').onclick = () => finish(true);
        const prev = sheetClose;
        sheetClose = () => { prev(); if (!done) { done = true; resolve(false); } };
      },
    });
  });
}

let toastTimer = null;
function toast(msg, action) {
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button id="toast-act">${esc(action.label)}</button>` : ''}</div>`;
  if (action) $('#toast-act').onclick = () => { root.innerHTML = ''; action.run(); };
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, action ? 6000 : 2600);
}

/* ---------- Sheet: session picker ---------- */
function sheetSessionPicker() {
  const list = allSessions();
  let body = '';
  for (const p of productionsSorted()) {
    const ss = list.filter(s => s.prodId === p.id);
    if (!ss.length) continue;
    body += `<div class="eyebrow prod-tone" style="margin:14px 0 4px;--ph:${prodHue(p)}"><i class="pdot"></i>${esc(p.name)}</div><ul class="picklist">${ss.map(s => {
      const prs = SECTIONS.filter(x => convoked(s, x.id)).map(x => progress(s, x.id));
      const done = prs.reduce((a, b) => a + b.done, 0), tot = prs.reduce((a, b) => a + b.total, 0);
      return `<li><button data-act="pick-session" data-sid="${s.id}" aria-current="${s.id === ui.sessionId}" id="pick-${s.id}">
        <span><span class="d">${longDate(s.date)}</span>${s.date === TODAY ? ' <span class="badge">Avui</span>' : ''}<br><span class="m">${esc(s.type || 'Assaig')}${s.time ? ' · ' + esc(timeRange(s)) : ''}${s.place ? ' · ' + esc(s.place) : ''}</span></span>
        <span class="mono m">${done ? `${done}/${tot}` : ''}</span></button></li>`;
    }).join('')}</ul>`;
  }
  openSheet({
    title: 'Tria la sessió', body,
    foot: `<button class="btn btn-ghost" data-act="pick-today">Ves a avui</button><span class="spacer"></span><button class="btn btn-primary" data-act="session-new">+ Nova sessió</button>`,
    onMount: el => { const c = el.querySelector('[aria-current="true"]'); if (c) setTimeout(() => c.scrollIntoView({ block: 'center' }), 30); },
  });
}

/* ---------- Sheet: summary ---------- */
function summaryText(session, secs) {
  const prod = S.productions.get(session.prodId);
  const lines = [`${prodNames(session)} — ${session.type || 'Assaig'} ${ddmm(session.date)}${session.time ? ' ' + timeRange(session) : ''}`];
  for (const sec of secs) {
    if (!convoked(session, sec)) continue;
    const ms = membersOf(sec);
    const groups = { P: [], R: [], FNJ: [], FJ: [], NP: [], none: [] };
    for (const m of ms) { const mk = effMark(session, m); groups[mk ? mk.s : 'none'].push({ m, mk }); }
    lines.push('', `${SEC[sec].name.toUpperCase()} · ${groups.P.length + groups.R.length}/${ms.length - groups.NP.length} hi són`);
    if (groups.R.length) lines.push(`Retards: ${groups.R.map(({ m, mk }) => `${m.name}${mk.min ? ` (${mk.min}′)` : ''}`).join(', ')}`);
    if (groups.FNJ.length) lines.push(`Faltes no justificades: ${groups.FNJ.map(({ m, mk }) => m.name + (mk.note ? ` (${mk.note})` : '')).join(', ')}`);
    if (groups.FJ.length) lines.push(`Faltes justificades: ${groups.FJ.map(({ m, mk }) => m.name + (mk.note ? ` (${mk.note})` : '')).join(', ')}`);
    if (groups.none.length) lines.push(`Sense marcar: ${groups.none.map(({ m }) => m.name).join(', ')}`);
    if (!groups.R.length && !groups.FNJ.length && !groups.FJ.length && !groups.none.length) lines.push('Tothom present i puntual.');
  }
  return lines.join('\n');
}
function sheetSummary(initial) {
  const cur = sessionById(ui.sessionId);
  if (!cur) return;
  let scope = initial === 'all' ? 'all' : 'sec';
  const text = () => summaryText(cur, scope === 'sec' ? [ui.section] : SECTIONS.map(x => x.id));
  openSheet({
    title: 'Resum de la llista',
    body: `<div class="pickers" style="margin-bottom:10px">
        <button class="pick" aria-pressed="${scope === 'sec'}" data-scope="sec">${SEC[ui.section].name}</button>
        <button class="pick" aria-pressed="${scope === 'all'}" data-scope="all">${capz(V.tot)}</button></div>
      <textarea class="summary-pre" id="summary-text" readonly>${esc(text())}</textarea>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">Copia’l i envia’l al grup de WhatsApp o a la direcció.</p>`,
    foot: `<button class="btn btn-primary" id="copy-summary">Copia el resum</button>`,
    onMount: el => {
      el.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => {
        scope = b.dataset.scope;
        el.querySelectorAll('[data-scope]').forEach(x => x.setAttribute('aria-pressed', x === b));
        el.querySelector('#summary-text').value = text();
      });
      el.querySelector('#copy-summary').onclick = async () => {
        const ta = el.querySelector('#summary-text');
        try { await navigator.clipboard.writeText(ta.value); toast('Resum copiat'); }
        catch { ta.focus(); ta.select(); try { document.execCommand('copy') ? toast('Resum copiat') : toast('Selecciona el text i copia’l'); } catch { toast('Selecciona el text i copia’l'); } }
      };
    },
  });
}

/* ---------- Sheet: session edit ---------- */
/* ---------- Fitxa del concert (o de l'actuació) ---------- */
const INFO_FIELDS = [['call', 'Convocatòria'], ['dress', 'Vestuari'], ['meet', 'Punt de trobada'], ['bring', 'Cal portar'], ['extra', 'Altres indicacions']];
const hasInfo = s => !!(s && s.info && INFO_FIELDS.some(([k]) => s.info[k]));
function infoSummary(s) {
  const i = s.info || {};
  return [i.call && `Convocatòria ${i.call}`, i.dress && 'vestuari', i.meet && 'punt de trobada', i.bring && 'què cal portar'].filter(Boolean).join(' · ');
}
function fitxaHtml(s) {
  const rows = [['Quan', `${longDate(s.date)}${s.time ? ` · ${timeRange(s)}` : ''}`], ...(s.place ? [['On', s.place]] : []),
    ...INFO_FIELDS.filter(([k]) => s.info?.[k]).map(([k, l]) => [l, s.info[k]])];
  return `<dl class="fitxa">${rows.map(([l, v]) => `<div class="${l === 'Convocatòria' ? 'key' : ''}"><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
function sheetSessionInfo(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const prod = S.productions.get(s.prodId);
  const text = [`${s.type || 'Assaig'} · ${prodNames(s)}`, `${longDate(s.date)}${s.time ? ` · ${timeRange(s)}` : ''}`, s.place ? `Lloc: ${s.place}` : '',
    ...INFO_FIELDS.filter(([k]) => s.info?.[k]).map(([k, l]) => `${l}: ${s.info[k]}`), s.note || ''].filter(Boolean).join('\n');
  openSheet({
    title: isShow(s) ? `Fitxa ${V.sh.del}` : `Fitxa · ${s.type || 'Sessió'}`,
    body: `<div class="prod-band prod-tone" style="--ph:${prodHue(prod)}"><h2 class="h2"><i class="pdot"></i>${esc(prodNames(s))}</h2><span class="eyebrow">${esc(s.type || 'Assaig')}</span></div>
      ${fitxaHtml(s)}
      ${s.note ? `<p class="fitxa-note">${esc(s.note)}</p>` : ''}
      ${hasInfo(s) ? '' : `<p class="muted" style="font-size:13px">Encara no hi ha indicacions de convocatòria, vestuari ni punt de trobada.</p>`}`,
    foot: `${canEdit() ? `<button class="btn" data-act="session-edit" data-sid="${s.id}">Edita</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" id="fx-copy">Copia per al grup</button>`,
    onMount: el => { el.querySelector('#fx-copy').onclick = () => copyText(text, 'Fitxa copiada'); },
  });
}
function fitxaChip(s) {
  if (hasInfo(s)) return `<button class="fitxa-chip" data-act="session-info" data-sid="${s.id}">${ICON.info}<span><b>${isShow(s) ? `Fitxa ${V.sh.del}` : 'Fitxa de la sessió'}</b><small>${esc(infoSummary(s))}</small></span></button>`;
  if (canEdit() && isShow(s)) return `<button class="fitxa-chip empty" data-act="session-edit" data-sid="${s.id}">${ICON.info}<span><b>Afegeix la fitxa ${V.sh.del}</b><small>Convocatòria, vestuari, punt de trobada…</small></span></button>`;
  return '';
}
function sheetSession(sid, presetProd, presetDate) {
  const existing = sid ? sessionById(sid) : null;
  const prods = productionsSorted();
  if (!prods.length) { toast('Primer crea una producció'); ui.tab = 'gestio'; ui.manage = 'produccions'; closeSheet(); render(); return; }
  const cur = existing || { id: uid('s'), date: presetDate || TODAY, time: '20:30', end: '22:30', type: 'Assaig', place: '', note: '', sections: [], prodId: presetProd || (ui.calProd !== 'all' ? ui.calProd : currentProductionId()) };
  const secs = new Set(cur.sections && cur.sections.length ? cur.sections : SECTIONS.map(x => x.id));
  openSheet({
    title: existing ? 'Edita la sessió' : 'Nova sessió',
    body: `<div class="kv">
      <label class="field"><span>Producció</span><select class="inp" id="se-prod">${prods.map(p => `<option value="${p.id}" ${p.id === cur.prodId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="row2"><label class="field"><span>Data</span><input class="inp" id="se-date" type="date" value="${cur.date}"></label>
      <label class="field"><span>Tipus</span><select class="inp" id="se-type">${[...new Set([...TYPES, cur.type].filter(Boolean))].map(t => `<option ${t === cur.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      <div class="row2"><label class="field"><span>Hora d’inici</span><input class="inp" id="se-time" type="time" value="${esc(cur.time || '')}"></label>
      <label class="field"><span>Hora de final</span><input class="inp" id="se-end" type="time" value="${esc(cur.end || '')}"></label></div>
      <label class="field"><span>Lloc</span><input class="inp" id="se-place" type="text" maxlength="60" value="${esc(cur.place || '')}" placeholder="Sala d’assaig"></label>
      <div class="field"><span>${V.Sections} convocades</span><div class="pickers" id="se-secs">${SECTIONS.map(x => secPick(x, secs.has(x.id))).join('')}</div></div>
      <div class="toggle-row"><span><b>Demana confirmació</b><br><span class="muted" style="font-size:12.5px">Els ${V.members} convocats responen si hi seran</span></span><label class="switch"><input type="checkbox" id="se-rsvp" ${cur.rsvp ? 'checked' : ''}><span></span></label></div>
      <label class="field" id="se-rsvpby-f" ${cur.rsvp ? '' : 'hidden'}><span>Respondre abans del (opcional)</span><input class="inp" id="se-rsvpby" type="date" value="${esc(cur.rsvpBy || '')}"></label>
      <div class="field"><span>També compta per a</span><div class="pickers" id="se-also">${prods.map(p => `<button type="button" class="pick" data-also="${p.id}" aria-pressed="${(cur.alsoIn || []).includes(p.id)}">${esc(p.name)}</button>`).join('')}</div>
        <small>Per a assajos compartits entre produccions: comptaran a les estadístiques i a la norma de totes les marcades.</small></div>
      <label class="field"><span>Nota</span><input class="inp" id="se-note" type="text" maxlength="80" value="${esc(cur.note || '')}" placeholder="p. ex. Portar partitures del Gloria"></label>
      <details class="fitxa-edit" id="se-fitxa" ${isShow(cur) || hasInfo(cur) ? 'open' : ''}>
        <summary><span><b>Fitxa ${V.sh.del}</b><br><span class="muted" style="font-size:12.5px">Convocatòria, vestuari, punt de trobada… La veuen tots els convocats.</span></span>${ICON.chev}</summary>
        <div class="kv" style="margin-top:12px">
          <label class="field"><span>Hora de convocatòria</span><input class="inp" id="se-call" type="time" style="max-width:170px" value="${esc(cur.info?.call || '')}"><small>A quina hora han de ser-hi els ${V.members}.</small></label>
          <label class="field"><span>Vestuari</span><input class="inp" id="se-dress" type="text" maxlength="100" value="${esc(cur.info?.dress || '')}" placeholder="p. ex. Uniforme negre i fulard lila"></label>
          <label class="field"><span>Punt de trobada</span><input class="inp" id="se-meet" type="text" maxlength="100" value="${esc(cur.info?.meet || '')}" placeholder="p. ex. Entrada d’artistes, c. Sant Pere Més Alt"></label>
          <label class="field"><span>Cal portar</span><input class="inp" id="se-bring" type="text" maxlength="120" value="${esc(cur.info?.bring || '')}" placeholder="p. ex. Carpeta negra, partitures i aigua"></label>
          <label class="field"><span>Altres indicacions</span><textarea class="inp" id="se-extra" maxlength="500" style="min-height:70px" placeholder="p. ex. Prova acústica a les 19:00 a l’escenari">${esc(cur.info?.extra || '')}</textarea></label>
        </div>
      </details>
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="se-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="se-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#se-secs .pick').forEach(b => b.onclick = () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        if (!on && el.querySelectorAll('#se-secs .pick[aria-pressed="true"]').length === 1) return;
        b.setAttribute('aria-pressed', on);
      });
      el.querySelectorAll('#se-also .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelector('#se-rsvp').onchange = e => { el.querySelector('#se-rsvpby-f').hidden = !e.target.checked; };
      el.querySelector('#se-type').onchange = e => { if (SHOWS.has(e.target.value)) el.querySelector('#se-fitxa').open = true; };
      el.querySelector('#se-save').onclick = () => {
        const date = el.querySelector('#se-date').value;
        if (!date) { toast('Indica la data de la sessió'); return; }
        const chosen = $$('#se-secs .pick[aria-pressed="true"]', el).map(b => b.dataset.sec);
        const next = {
          id: cur.id, date, time: el.querySelector('#se-time').value, end: el.querySelector('#se-end').value, type: el.querySelector('#se-type').value,
          place: el.querySelector('#se-place').value.trim(), note: el.querySelector('#se-note').value.trim(),
        };
        if (chosen.length && chosen.length < SECTIONS.length) next.sections = chosen;
        const prodId = el.querySelector('#se-prod').value;
        const also = $$('#se-also .pick[aria-pressed="true"]', el).map(b => b.dataset.also).filter(id => id !== prodId);
        if (also.length) next.alsoIn = also;
        if (el.querySelector('#se-rsvp').checked) { next.rsvp = true; const by = el.querySelector('#se-rsvpby').value; if (by) next.rsvpBy = by; }
        const info = Object.fromEntries(INFO_FIELDS.map(([k]) => [k, el.querySelector(`#se-${k}`).value.trim()]).filter(([, v]) => v));
        if (Object.keys(info).length) next.info = info;
        if (existing && existing.prodId !== prodId) {
          const old = clone(S.productions.get(existing.prodId));
          old.sessions = (old.sessions || []).filter(s => s.id !== cur.id);
          saveProduction(old);
        }
        const p = clone(S.productions.get(prodId));
        p.sessions = (p.sessions || []).filter(s => s.id !== cur.id).concat(next).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        saveProduction(p);
        closeSheet();
        toast(existing ? 'Sessió desada' : 'Sessió creada');
        render();
      };
      const del = el.querySelector('#se-del');
      if (del) del.onclick = async () => {
        const marked = SECTIONS.some(x => hasData(existing, x.id));
        const ok = await confirmSheet('Esborrar la sessió?', `${longDate(existing.date)}${marked ? ' ja té llista passada; també se n’esborrarà l’assistència.' : ''}`, 'Esborra la sessió');
        if (!ok) return;
        const p = clone(S.productions.get(existing.prodId));
        p.sessions = (p.sessions || []).filter(s => s.id !== existing.id);
        saveProduction(p);
        removeMany(SECTIONS.map(x => ['attendance', attKey(existing.id, x.id)]).filter(([, k]) => S.attendance.has(k)));
        if (ui.sessionId === existing.id) ui.sessionId = null;
        toast('Sessió esborrada');
        render();
      };
    },
  });
}

/* ---------- Sheet: member ---------- */
function sheetMember(mid) {
  const existing = mid ? S.members.get(mid) : null;
  const m = existing ? clone(existing) : { id: uid('m'), name: '', section: ui.section, leader: false, active: true, phone: '', notes: '' };
  openSheet({
    title: existing ? V.Member : `Nou ${V.member}`,
    body: `<div class="kv">
      <label class="field"><span>Nom i cognoms</span><input class="inp" id="me-name" type="text" maxlength="60" value="${esc(m.name)}" autocomplete="off"></label>
      <div class="field"><span>${V.Section}</span><div class="pickers" id="me-sec">${SECTIONS.map(x => secPick(x, m.section === x.id)).join('')}</div></div>
      <div class="field"><span>${V.Part} dins la ${V.section}</span><div class="pickers" id="me-part"><button type="button" class="pick" data-part="" aria-pressed="${!m.part}">Sense</button>${PARTS.map(v => `<button type="button" class="pick" data-part="${v}" aria-pressed="${m.part === v}">${v}</button>`).join('')}</div></div>
      <div class="toggle-row"><span><b>${V.Leader}</b><br><span class="muted" style="font-size:12.5px">Passa llista de la seva ${V.section}</span></span><label class="switch"><input type="checkbox" id="me-leader" ${m.leader ? 'checked' : ''}><span></span></label></div>
      <fieldset class="fieldset"><legend>Baixes temporals</legend>
        <div id="me-leaves" style="display:grid;gap:6px"></div>
        <div class="row3"><label class="field"><span>Des del</span><input class="inp" id="lv-from" type="date"></label><label class="field"><span>Fins al</span><input class="inp" id="lv-to" type="date"></label></div>
        <label class="field"><span>Motiu</span><input class="inp" id="lv-note" type="text" maxlength="60" placeholder="p. ex. Erasmus, lesió…"></label>
        <button type="button" class="btn btn-sm" id="lv-add" style="width:max-content">Afegeix la baixa</button>
        <small class="muted">Durant la baixa surt en gris («No fa») i no compta a les estadístiques ni a la norma.</small>
      </fieldset>
      <div class="toggle-row"><span><b>Actiu</b><br><span class="muted" style="font-size:12.5px">Desactiva’l si deixa ${V.el}; conserva l’historial</span></span><label class="switch"><input type="checkbox" id="me-active" ${m.active !== false ? 'checked' : ''}><span></span></label></div>
      ${existing ? (x => `<div class="toggle-row"><span><b>Accés a l’app</b><br><span class="muted" style="font-size:12.5px">${x ? esc(x.email) : 'Encara no en té'}</span></span><button type="button" class="btn btn-sm" data-act="${x ? 'staff-edit' : 'staff-new'}" ${x ? `data-email="${esc(x.email)}"` : ''}>${x ? 'Canvia' : 'Dona-li accés'}</button></div>`)(accountFor(m.id)) : ''}
      <label class="field"><span>Telèfon</span><input class="inp" id="me-phone" type="tel" maxlength="20" value="${esc(m.phone || '')}"></label>
      <label class="field"><span>Notes</span><input class="inp" id="me-notes" type="text" maxlength="120" value="${esc(m.notes || '')}"></label>
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="me-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="me-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#me-sec .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#me-sec .pick').forEach(x => x.setAttribute('aria-pressed', x === b)); });
      el.querySelectorAll('#me-part .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#me-part .pick').forEach(x => x.setAttribute('aria-pressed', x === b)); });
      m.leaves = [...(m.leaves || [])];
      const drawLeaves = () => {
        el.querySelector('#me-leaves').innerHTML = m.leaves.length ? m.leaves.map((l, i) => `<div class="leave-row"><span><span class="mono">${ddmm(l.from)}/${l.from.slice(2, 4)} – ${l.to ? `${ddmm(l.to)}/${l.to.slice(2, 4)}` : 'sense data'}</span>${l.note ? ` · ${esc(l.note)}` : ''}</span><button type="button" class="icon-btn" data-lv="${i}" aria-label="Treu la baixa">${ICON.close}</button></div>`).join('') : '<span class="muted" style="font-size:13px">Cap baixa.</span>';
        el.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { m.leaves.splice(+b.dataset.lv, 1); drawLeaves(); });
      };
      drawLeaves();
      el.querySelector('#lv-add').onclick = () => {
        const from = el.querySelector('#lv-from').value, to = el.querySelector('#lv-to').value;
        if (!from || (to && to < from)) { toast('Indica una data d’inici (i un final posterior)'); return; }
        m.leaves.push({ from, to, note: el.querySelector('#lv-note').value.trim() });
        m.leaves.sort((a, b) => a.from.localeCompare(b.from));
        ['#lv-from', '#lv-to', '#lv-note'].forEach(q => { el.querySelector(q).value = ''; });
        drawLeaves();
      };
      el.querySelector('#me-save').onclick = () => {
        const name = el.querySelector('#me-name').value.trim();
        if (!name) { toast('Escriu el nom i els cognoms'); return; }
        const section = el.querySelector('#me-sec .pick[aria-pressed="true"]').dataset.sec;
        if (existing && existing.section !== section && [...S.attendance.values()].some(d => d.section === existing.section && d.marks?.[m.id])) {
          toast(`Canvi de ${V.section} desat. Les llistes antigues queden a la ${V.section} anterior.`);
        }
        const next = { ...m, name, section, leader: el.querySelector('#me-leader').checked, active: el.querySelector('#me-active').checked, phone: el.querySelector('#me-phone').value.trim(), notes: el.querySelector('#me-notes').value.trim(), part: el.querySelector('#me-part .pick[aria-pressed="true"]').dataset.part };
        if (next.leader) for (const o of membersOf(section, true)) if (o.id !== next.id && o.leader) saveMember({ ...o, leader: false });
        saveMember(next);
        closeSheet();
        render();
      };
      const del = el.querySelector('#me-del');
      if (del) del.onclick = async () => {
        const ok = await confirmSheet(`Esborrar la fitxa?`, `S’esborrarà <b>${esc(existing.name)}</b> i deixarà de sortir a les estadístiques. Si només és una baixa, desactiva’l.`, 'Esborra');
        if (!ok) return;
        S.members.delete(existing.id); persist('members', existing.id, null, 20);
        toast('Fitxa esborrada');
        render();
      };
    },
  });
}
function sheetBulk(sec) {
  openSheet({
    title: `Afegeix ${SEC[sec].name.toLowerCase()}`,
    body: `<div class="kv">
      <div class="field"><span>${V.Section}</span><div class="pickers" id="bk-sec">${SECTIONS.map(x => secPick(x, sec === x.id)).join('')}</div></div>
      <label class="field"><span>Noms, un per línia</span><textarea class="inp" id="bk-names" placeholder="Anna Puig&#10;Laia Ferrer&#10;Marta Soler"></textarea><small>Pots enganxar-los directament des d’un full de càlcul.</small></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="bk-save">Afegeix</button>`,
    onMount: el => {
      el.querySelectorAll('#bk-sec .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#bk-sec .pick').forEach(x => x.setAttribute('aria-pressed', x === b)); });
      el.querySelector('#bk-save').onclick = async () => {
        const section = el.querySelector('#bk-sec .pick[aria-pressed="true"]').dataset.sec;
        const existingNames = new Set([...S.members.values()].map(m => m.name.toLowerCase()));
        const names = [...new Set(el.querySelector('#bk-names').value.split(/\r?\n/).map(s => s.replace(/\t.*/, '').trim()).filter(Boolean))].filter(n => !existingNames.has(n.toLowerCase()));
        if (!names.length) { toast('No hi ha noms nous per afegir'); return; }
        closeSheet();
        for (const name of names) { saveMember({ id: uid('m'), name, section, leader: false, active: true }); await sleep(8); }
        toast(`${names.length} ${names.length === 1 ? V.member : V.members} afegits a ${SEC[section].name}`);
        render();
      };
    },
  });
}

/* ---------- Sheet: member stats ---------- */
function sheetMemberStats(mid) {
  const m = S.members.get(mid);
  if (!m) return;
  const scope = currentScope();
  const st = computeStats(scope, m.section);
  const rs = scope.kind === 'prod' ? ruleStatus(scope.id, m) : null;
  const r = st.rows.find(x => x.m.id === mid) || { ...emptyCounts(), hist: [], notes: [] };
  const hist = r.hist.map(({ s, mk }) => `<button class="hcell" data-act="open-session" data-sid="${s.id}" title="${longDate(s.date)} · ${mk ? STATUS[mk.s].label + (mk.min ? ` ${mk.min}′` : '') : 'Sense llista'}"><i class="${mk ? 's-' + mk.s : ''}"></i>${ddmm(s.date)}</button>`).join('');
  openSheet({
    title: m.name,
    body: `<div class="eyebrow" style="margin-bottom:10px">${SEC[m.section].name} · ${esc(scope.name)}</div>
      ${rs ? `<div class="notice" style="margin:0 0 12px;background:${rs.status === 'ok' ? 'var(--p-soft)' : rs.status === 'risk' ? 'var(--fj-soft)' : 'var(--fnj-soft)'};border:0">
        <b>${rs.status === 'ok' ? `Compleix la norma del ${minAttendance()}%` : rs.status === 'risk' ? 'En risc de no poder fer el concert' : 'No pot fer el concert'}</b>
        <span>Assistència als assajos: ${pct(rs.cur)} (${rs.att} de ${rs.att + rs.abs})${rs.remaining ? ` · queden ${rs.remaining} assajos, màxim possible ${pct(rs.best)}` : ''}.</span></div>` : ''}
      ${leaveText(m) ? `<p class="muted" style="margin:0 0 10px;font-size:13px">${leaveText(m)}</p>` : ''}
      <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><div class="kpi-v">${pct(rate(r))}</div><div class="kpi-l">Assistència</div></div>
        <div class="kpi"><div class="kpi-v">${r.min}<small>min</small></div><div class="kpi-l">${r.R} retards</div></div>
        <div class="kpi ${r.FNJ ? 'alert' : ''}"><div class="kpi-v">${r.FNJ}</div><div class="kpi-l">Faltes no justificades</div></div>
        <div class="kpi"><div class="kpi-v">${r.FJ}</div><div class="kpi-l">Faltes justificades</div></div>
      </div>
      <div class="section-title" style="margin-top:20px"><h3 class="eyebrow">Sessió a sessió</h3></div>
      ${hist ? `<div class="hist">${hist}</div>` : '<p class="muted">Encara no hi ha sessions passades.</p>'}
      <div class="legend">${ORDER.map(k => `<span><i class="i-${k}"></i>${STATUS[k].short}</span>`).join('')}<span><i class="i-none"></i>Sense llista</span></div>
      ${r.notes.length ? `<div class="section-title" style="margin-top:20px"><h3 class="eyebrow">Motius registrats</h3></div>
      <ul class="notes-list">${r.notes.map(({ s, mk }) => `<li><span class="mono muted">${ddmm(s.date)}</span><span><span class="pill ${mk.s === 'FNJ' ? 'fnj' : ''}" style="${mk.s === 'FJ' ? 'background:var(--fj-soft);color:var(--ink)' : ''}">${mk.s}</span> ${esc(mk.note)}</span></li>`).join('')}</ul>` : ''}
      ${m.phone ? `<p style="margin-top:18px"><a class="btn btn-sm" href="tel:${esc(m.phone.replace(/\s/g, ''))}">Truca ${esc(m.phone)}</a></p>` : ''}`,
  });
}

/* ---------- Sheet: production ---------- */
function sheetProduction(pid) {
  const existing = pid ? S.productions.get(pid) : null;
  const d = existing ? clone(existing) : { id: uid('p'), name: '', start: TODAY, end: '', sessions: [], excluded: [] };
  d.sessions = d.sessions || []; d.excluded = d.excluded || [];
  const excluded = new Set(d.excluded);
  const gen = { from: d.start || TODAY, to: d.end || '', days: new Set(['1', '3']), time: '20:30', end: '22:30', type: 'Assaig', place: '' };

  const sessionsList = () => d.sessions.length
    ? `<ul class="mini-list" id="pe-sessions">${[...d.sessions].sort((a, b) => a.date.localeCompare(b.date)).map(s => `<li><span><span class="mono">${ddmm(s.date)} ${wdShort(s.date)}</span> · ${esc(s.type)} <span class="mono">${esc(timeRange(s))}</span></span><button class="icon-btn" data-rm="${s.id}" aria-label="Treu la sessió">${ICON.close}</button></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0;font-size:13.5px">Encara no hi ha sessions.</p>';

  openSheet({
    title: existing ? 'Edita la producció' : 'Nova producció', wide: true,
    body: `<div class="kv">
      <label class="field"><span>Nom</span><input class="inp" id="pe-name" type="text" maxlength="60" value="${esc(d.name)}" placeholder="p. ex. Concert de Nadal 2026"></label>
      <div class="field"><span>Color al calendari</span><div class="pickers" id="pe-hue">${PROD_HUES.map(h => `<button type="button" class="hue-pick prod-tone" style="--ph:${h}" data-hue="${h}" aria-pressed="${prodHue(d) === h}" aria-label="Color ${h}"></button>`).join('')}</div></div>
      <div class="row2"><label class="field"><span>Inici</span><input class="inp" id="pe-start" type="date" value="${d.start || ''}"></label>
      <label class="field"><span>Final</span><input class="inp" id="pe-end" type="date" value="${d.end || ''}"></label></div>

      <fieldset class="fieldset"><legend>Sessions</legend>
        <div id="pe-slist">${sessionsList()}</div>
        <details id="pe-gen" ${d.sessions.length ? '' : 'open'}><summary class="btn btn-sm" style="list-style:none;width:max-content">Genera sessions recurrents</summary>
          <div class="kv" style="margin-top:12px">
            <div class="row2"><label class="field"><span>Des de</span><input class="inp" id="g-from" type="date" value="${gen.from}"></label>
            <label class="field"><span>Fins a</span><input class="inp" id="g-to" type="date" value="${gen.to}"></label></div>
            <div class="field"><span>Dies</span><div class="pickers" id="g-days">${WEEKDAYS.map(([v, l]) => `<button type="button" class="pick" aria-pressed="${gen.days.has(v)}" data-d="${v}">${l}</button>`).join('')}</div></div>
            <div class="row2"><label class="field"><span>Hora d’inici</span><input class="inp" id="g-time" type="time" value="${gen.time}"></label>
            <label class="field"><span>Hora de final</span><input class="inp" id="g-end" type="time" value="${gen.end}"></label></div>
            <label class="field"><span>Tipus</span><select class="inp" id="g-type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
            <label class="field"><span>Lloc</span><input class="inp" id="g-place" type="text" maxlength="60" placeholder="Sala d’assaig"></label>
            <button type="button" class="btn btn-sm btn-primary" id="g-run" style="width:max-content">Afegeix les sessions</button>
          </div></details>
      </fieldset>

      <fieldset class="fieldset"><legend>Qui no fa aquesta producció</legend>
        <p class="muted" style="margin:0;font-size:12.5px">Els marcats sortiran en gris («No fa») a totes les sessions i no comptaran a les estadístiques.</p>
        ${SECTIONS.map(x => { const ms = membersOf(x.id); return ms.length ? `<div class="field"><span>${x.name}</span><div class="pickers">${ms.map(mm => `<button type="button" class="pick" data-ex="${mm.id}" aria-pressed="${excluded.has(mm.id)}">${esc(mm.name)}</button>`).join('')}</div></div>` : ''; }).join('')}
      </fieldset>
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="pe-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pe-save">Desa</button>`,
    onMount: el => {
      const bindRm = () => el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.sessions = d.sessions.filter(s => s.id !== b.dataset.rm); el.querySelector('#pe-slist').innerHTML = sessionsList(); bindRm(); });
      bindRm();
      el.querySelectorAll('#g-days .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelectorAll('#pe-hue .hue-pick').forEach(b => b.onclick = () => el.querySelectorAll('#pe-hue .hue-pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      el.querySelector('#pe-start').onchange = e => { if (!el.querySelector('#g-from').value || !d.sessions.length) el.querySelector('#g-from').value = e.target.value; };
      el.querySelector('#pe-end').onchange = e => { if (!el.querySelector('#g-to').value) el.querySelector('#g-to').value = e.target.value; };
      el.querySelector('#g-run').onclick = () => {
        const from = el.querySelector('#g-from').value, to = el.querySelector('#g-to').value;
        const days = new Set($$('#g-days .pick[aria-pressed="true"]', el).map(b => +b.dataset.d));
        if (!from || !to || to < from) { toast('Indica unes dates d’inici i final vàlides'); return; }
        if (!days.size) { toast('Tria almenys un dia de la setmana'); return; }
        const time = el.querySelector('#g-time').value, end = el.querySelector('#g-end').value, type = el.querySelector('#g-type').value, place = el.querySelector('#g-place').value.trim();
        const have = new Set(d.sessions.map(s => s.date + s.time));
        let n = 0;
        for (let dt = parseISO(from); isoDate(dt) <= to && n < 200; dt.setDate(dt.getDate() + 1)) {
          if (!days.has(dt.getDay())) continue;
          const iso = isoDate(dt);
          if (have.has(iso + time)) continue;
          d.sessions.push({ id: uid('s'), date: iso, time, end, type, place, note: '' }); n++;
        }
        el.querySelector('#pe-slist').innerHTML = sessionsList(); bindRm();
        toast(n ? `${n} sessions afegides. Recorda desar.` : 'No s’ha afegit cap sessió nova');
      };
      el.querySelector('#pe-save').onclick = () => {
        const name = el.querySelector('#pe-name').value.trim();
        if (!name) { toast('Posa un nom a la producció'); return; }
        d.name = name;
        d.start = el.querySelector('#pe-start').value || (d.sessions[0]?.date ?? TODAY);
        d.end = el.querySelector('#pe-end').value;
        d.excluded = $$('[data-ex][aria-pressed="true"]', el).map(b => b.dataset.ex);
        const hueBtn = el.querySelector('#pe-hue .hue-pick[aria-pressed="true"]');
        if (hueBtn) d.hue = +hueBtn.dataset.hue;
        d.sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const removed = (existing?.sessions || []).filter(s => !d.sessions.some(x => x.id === s.id));
        saveProduction(d);
        if (removed.length) removeMany(removed.flatMap(s => SECTIONS.map(x => ['attendance', attKey(s.id, x.id)])).filter(([, k]) => S.attendance.has(k)));
        closeSheet();
        toast(existing ? 'Producció desada' : 'Producció creada');
        render();
      };
      const del = el.querySelector('#pe-del');
      if (del) del.onclick = async () => {
        const ok = await confirmSheet('Esborrar la producció?', `S’esborraran <b>${esc(existing.name)}</b>, les seves ${(existing.sessions || []).length} sessions i tota l’assistència registrada.`, 'Esborra la producció');
        if (!ok) return;
        const att = (existing.sessions || []).flatMap(s => SECTIONS.map(x => ['attendance', attKey(s.id, x.id)])).filter(([, k]) => S.attendance.has(k));
        S.productions.delete(existing.id); persist('productions', existing.id, null, 20);
        (existing.materials || []).forEach(x => deleteFile(x.file));
        await removeMany(att);
        toast('Producció esborrada');
        render();
      };
    },
  });
}

/* ---------- Sheet: absence notice ---------- */
function memberOptions(selected) {
  return SECTIONS.map(x => `<optgroup label="${x.name}">${membersOf(x.id).map(m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
}
function sheetWhoAmI(then) {
  openSheet({
    title: 'Qui ets?',
    body: `<p style="margin-top:0">Tria el teu nom. Aquest mòbil el recordarà per als propers avisos.</p>
      <label class="field"><span>Nom</span><select class="inp" id="who-sel"><option value="">—</option>${memberOptions(myMemberId())}</select></label>`,
    foot: `<button class="btn btn-primary" id="who-ok">Desa</button>`,
    onMount: el => {
      el.querySelector('#who-ok').onclick = () => {
        const id = el.querySelector('#who-sel').value;
        if (!id) { toast('Tria el teu nom de la llista'); return; }
        lsSet(LS_ME, id);
        closeSheet(); render();
        if (then) then();
      };
    },
  });
}
function sheetAbsence(presetSid) {
  const singer = !canEdit() || (ui.tab === 'avisos' && !!myId());   // reporting on my own behalf
  let memberId = singer ? myMemberId() : null;
  if (singer && !memberId) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let kind = 'absent';
  const picked = new Set(presetSid ? [presetSid] : []);
  const sessionsFor = mid => {
    const m = S.members.get(mid);
    return m ? allSessions().filter(s => s.date >= TODAY && convoked(s, m.section)) : [];
  };
  openSheet({
    title: 'Avís d’absència',
    body: `<div class="kv">
      ${singer ? `<p style="margin:0">De part de <b>${esc(S.members.get(memberId).name)}</b></p>`
        : `<label class="field"><span>${V.Member}</span><select class="inp" id="ab-member"><option value="">—</option>${memberOptions('')}</select></label>`}
      <div class="field"><span>Què passa?</span><div class="pickers" id="ab-kind">
        <button type="button" class="pick" data-k="absent" aria-pressed="true">No hi podré anar</button>
        <button type="button" class="pick" data-k="late" aria-pressed="false">Arribaré tard</button></div></div>
      <label class="field" id="ab-min-f" hidden><span>Minuts de retard aproximats</span><input class="inp" id="ab-min" type="number" inputmode="numeric" min="1" max="240" style="width:120px"></label>
      <div class="field"><span>Quins dies?</span><div id="ab-sessions"></div></div>
      <label class="field"><span>Motiu</span><textarea class="inp" id="ab-reason" maxlength="200" style="min-height:80px" placeholder="p. ex. Examen a la universitat"></textarea></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ab-send">${singer ? 'Envia l’avís' : 'Desa l’avís'}</button>`,
    onMount: el => {
      const drawSessions = () => {
        const box = el.querySelector('#ab-sessions');
        if (!memberId) { box.innerHTML = '<span class="muted" style="font-size:13px">Tria primer qui és.</span>'; return; }
        const list = sessionsFor(memberId);
        if (!list.length) { box.innerHTML = '<span class="muted" style="font-size:13px">No hi ha sessions properes.</span>'; return; }
        let month = '', html = '<ul class="checklist">';
        for (const s of list) {
          const mo = s.date.slice(0, 7);
          if (mo !== month) { month = mo; html += `<li class="mo">${monthYear(s.date)}</li>`; }
          html += `<li><label><input type="checkbox" value="${s.id}" ${picked.has(s.id) ? 'checked' : ''}><span><b>${wdShort(s.date)} ${ddmm(s.date)}</b> · ${esc(s.type)}${s.time ? ` · <span class="mono">${esc(timeRange(s))}</span>` : ''}<br><span class="m">${esc(prodNames(s))}</span></span></label></li>`;
        }
        box.innerHTML = html + '</ul>';
        box.querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? picked.add(i.value) : picked.delete(i.value); });
        const first = box.querySelector('input:checked');
        if (first) setTimeout(() => first.closest('li').scrollIntoView({ block: 'nearest' }), 30);
      };
      drawSessions();
      const sel = el.querySelector('#ab-member');
      if (sel) sel.onchange = () => { memberId = sel.value || null; drawSessions(); };
      el.querySelectorAll('#ab-kind .pick').forEach(b => b.onclick = () => {
        kind = b.dataset.k;
        el.querySelectorAll('#ab-kind .pick').forEach(x => x.setAttribute('aria-pressed', x === b));
        el.querySelector('#ab-min-f').hidden = kind !== 'late';
      });
      el.querySelector('#ab-send').onclick = () => {
        const m = S.members.get(memberId);
        const reason = el.querySelector('#ab-reason').value.trim();
        const ids = [...picked].filter(id => sessionById(id));
        if (!m) { toast('Tria qui no hi podrà anar'); return; }
        if (!ids.length) { toast('Marca almenys un dia'); return; }
        if (singer && !reason) { toast('Explica breument el motiu'); return; }
        const a = { id: uid('a'), uid: S.uid, memberId: m.id, memberName: m.name, section: m.section, sessionIds: ids, kind, reason,
          status: 'pending', createdAt: new Date().toISOString(), by: S.role };
        if (kind === 'late') { const v = parseInt(el.querySelector('#ab-min').value, 10); if (v > 0) a.min = Math.min(240, v); }
        closeSheet();
        if (singer) { saveAbsence(a); toast(`Avís enviat. El teu ${V.leader} el revisarà.`); }
        else { acceptAbsence(a); toast('Avís desat i acceptat'); }
        render();
      };
    },
  });
}
