// A Tempo · 18-repertori.js — Repertori (una fitxa per obra, d'una temporada a l'altra), qui canta cada solo i cada petit
// grup, el pla d'assaig de cada sessió, el reproductor d'estudi i les partitures desades al mòbil.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Repertori ---------- */
// works/<id> = { id, title, composer, arranger, duration ('4:30'), voicing ('SATB'), notes, prods: [producció…],
//   roles: [{ id, name ('Solo de soprano, núm. 3'), memberIds }], materials: [{ id, kind, title, section, part, url | file }] }
// Una obra no és de cap producció: s'hi enllaça (prods), i així serveix per a la temporada següent.
const worksSorted = () => [...S.works.values()].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ca'));
const worksOf = pid => worksSorted().filter(w => (w.prods || []).includes(pid));
function saveWork(w) { S.works.set(w.id, w); persist('works', w.id, w, 50); }
const durSecs = d => { const m = String(d || '').match(/^(\d{1,3})(?:[:'.](\d{1,2}))?$/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };
const fmtDur = secs => secs ? `${Math.floor(secs / 60)}:${pad(secs % 60)}` : '';
/** El material que és per a aquesta persona: de la seva corda (o de tots) i de la seva veu (o de totes). */
const forMyVoice = (x, me) => !me || ((!x.section || x.section === me.section) && (!x.part || !me.part || me.part.includes(x.part) || x.part.includes(me.part)));
/** Els solos i petits grups on surt aquesta persona: [{ w, r }]. */
const rolesOfMember = mid => mid ? worksSorted().flatMap(w => (w.roles || []).filter(r => (r.memberIds || []).includes(mid)).map(r => ({ w, r }))) : [];
const roleNames = r => (r.memberIds || []).map(id => S.members.get(id)?.name).filter(Boolean);

function boardRepertoire() {
  const prods = productionsSorted();
  if (ui.matProd !== 'all' && (!ui.matProd || !S.productions.has(ui.matProd))) ui.matProd = currentProductionId() || 'all';
  const all = ui.matProd === 'all';
  const prod = all ? null : S.productions.get(ui.matProd);
  const me = S.members.get(myMemberId());
  const onlyMine = !!me && !canEdit() && ui.matMine !== false;
  const works = all ? worksSorted() : worksOf(prod.id);
  const chips = `<div class="filters"><label class="sel"><span class="sr">Producció</span><select data-pick="mat-prod">
      <option value="all" ${all ? 'selected' : ''}>Tot el repertori · ${S.works.size}</option>
      ${prods.map(p => `<option value="${p.id}" ${prod && p.id === prod.id ? 'selected' : ''}>${esc(p.name)}${worksOf(p.id).length ? ` · ${worksOf(p.id).length}` : ''}</option>`).join('')}</select></label></div>`;
  const tools = canEdit()
    ? `<div class="sec-h" style="margin-top:4px"><span class="muted" style="font-size:calc(13px*var(--ts))">Cada obra té la seva fitxa, i serveix d’una temporada a l’altra.</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap">${prod ? '<button class="btn btn-sm" data-act="work-link">Afegeix-ne una que ja hi és</button>' : ''}<button class="btn btn-sm btn-primary" data-act="work-new">+ Obra</button></span></div>`
    : me ? `<div class="sec-h" style="margin-top:4px"><span class="muted" style="font-size:calc(13px*var(--ts))">${onlyMine ? `Mostrant el material per a ${esc(SEC[me.section].name.toLowerCase())}${me.part ? ` ${esc(me.part)}` : ''}` : 'Mostrant tot el material'}</span><button class="btn btn-sm btn-ghost" data-act="mat-mine">${onlyMine ? 'Mostra-ho tot' : `Només la meva ${V.part}`}</button></div>` : '';
  const mine = me ? rolesOfMember(me.id).filter(({ w }) => all || (w.prods || []).includes(prod.id)) : [];
  const files = offlineCandidates(works, prod, onlyMine ? me : null);
  const saved = offlineSaved();
  const toSave = files.filter(f => !saved.has(f.id));
  const card = w => {
    const mats = (w.materials || []).filter(x => !onlyMine || forMyVoice(x, me));
    const kinds = Object.keys(MAT_KINDS).map(k => [k, mats.filter(x => x.kind === k).length]).filter(([, n]) => n);
    const facts = [w.composer, w.arranger ? `arr. ${w.arranger}` : '', fmtDur(durSecs(w.duration)), w.voicing].filter(Boolean).map(esc).join(' · ');
    return `<button class="work" data-act="work-open" data-id="${esc(w.id)}">
      <span class="work-t">${esc(w.title)}</span>
      ${facts ? `<span class="work-f">${facts}</span>` : ''}
      <span class="work-k">${kinds.map(([k, n]) => `<span class="mat-k ${k}">${MAT_KINDS[k].slice(0, 4)}${n > 1 ? ` ${n}` : ''}</span>`).join('')}${(w.roles || []).length ? `<span class="work-r">${(w.roles || []).length} ${(w.roles || []).length === 1 ? 'solo o grup' : 'solos i grups'}</span>` : ''}</span>
    </button>`;
  };
  const total = works.reduce((n, w) => n + durSecs(w.duration), 0);
  return chips + tools
    + (mine.length ? `<div class="section-title"><h2 class="h2">Els teus solos i petits grups</h2></div>
      <ul class="mini-list" style="max-height:none">${mine.map(({ w, r }) => `<li><span><b>${esc(r.name)}</b><br><span class="m">${esc(w.title)}${roleNames(r).length > 1 ? ` · amb ${esc(roleNames(r).filter(n => n !== me.name).join(', '))}` : ''}</span></span>
        <button class="btn btn-sm" data-act="work-open" data-id="${esc(w.id)}">Obra</button></li>`).join('')}</ul>` : '')
    + `<div class="section-title"><h2 class="h2">${all ? 'Tot el repertori' : 'Obres'}</h2><span class="eyebrow">${works.length}${total ? ` · ${fmtDur(total)}` : ''}</span></div>`
    + (works.length ? `<div class="works">${works.map(card).join('')}</div>` : `<div class="empty"><p>${all ? 'Encara no hi ha cap obra al repertori.' : `Encara no hi ha obres a ${esc(prod.name)}.`}</p></div>`)
    + (files.length ? `<div class="panel" style="padding:12px 14px;margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:calc(13.5px*var(--ts))">${toSave.length ? `${files.length - toSave.length} de ${files.length} fitxers desats al mòbil.` : `Tens els ${files.length} fitxers desats al mòbil: els pots obrir sense cobertura.`}</span>
        ${toSave.length ? `<button class="btn btn-sm" data-act="offline-save-all">Desa’ls al mòbil</button>` : `<button class="btn btn-sm btn-ghost" data-act="offline-clear">Treu-los</button>`}</div>` : '')
    + (prod ? boardMaterialsOf(prod, onlyMine, me) : '');
}
/** El material de la producció que no és de cap obra (el d'abans del repertori, o documents de la producció). */
function boardMaterialsOf(prod, onlyMine, me) {
  const items = (prod.materials || []).filter(x => !onlyMine || forMyVoice(x, me));
  const order = Object.keys(MAT_KINDS);
  const sorted = [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title, 'ca'));
  const row = x => `<div class="mat"><span class="mat-k ${x.kind}">${MAT_KINDS[x.kind]?.slice(0, 4) || ''}</span>
      <span class="mat-i">${itemLink(x, `data-act="file-open" data-src="mat" data-pid="${prod.id}" data-id="${x.id}"`)}<small>${[MAT_KINDS[x.kind], x.section ? esc(SEC[x.section].name) : capz(V.tot), x.part ? `${V.part} ${esc(x.part)}` : '', fileNote(x), x.file && offlineSaved().has(x.file.id) ? 'desat al mòbil' : ''].filter(Boolean).join(' · ')}</small></span>
      ${canEdit() ? `<button class="icon-btn" data-act="mat-edit" data-pid="${prod.id}" data-id="${x.id}" aria-label="Edita">${ICON.more}</button>` : ''}</div>`;
  if (!sorted.length && !canEdit()) return '';
  return `<div class="section-title"><h2 class="h2">Altres materials</h2>${canEdit() ? '<button class="btn btn-sm" data-act="mat-new">+ Material</button>' : ''}</div>
    ${sorted.length ? `<div class="panel prod-tone tinted" style="--ph:${prodHue(prod)}">${sorted.map(row).join('')}</div>` : '<p class="muted" style="font-size:calc(13px*var(--ts));margin:0 2px">Material de la producció que no és de cap obra: el programa, horaris, enllaços…</p>'}`;
}
function sheetWork(id) {
  const w = S.works.get(id);
  if (!w) return;
  const me = S.members.get(myMemberId());
  let onlyMine = !!me && !canEdit();
  const facts = [['Compositor', w.composer], ['Arranjament', w.arranger], ['Durada', fmtDur(durSecs(w.duration))], ['Formació', w.voicing],
    ['Produccions', (w.prods || []).map(p => S.productions.get(p)?.name).filter(Boolean).join(', ')]].filter(([, v]) => v);
  const draw = el => {
    const mats = (w.materials || []).filter(x => !onlyMine || forMyVoice(x, me));
    const saved = offlineSaved();
    el.querySelector('#wk-mats').innerHTML = mats.length ? mats.map(x => `<div class="mat"><span class="mat-k ${x.kind}">${MAT_KINDS[x.kind]?.slice(0, 4) || ''}</span>
        <span class="mat-i">${itemLink(x, `data-act="file-open" data-src="work" data-pid="${esc(w.id)}" data-id="${esc(x.id)}"`)}<small>${[MAT_KINDS[x.kind], x.section ? esc(SEC[x.section].name) : capz(V.tot), x.part ? `${V.part} ${esc(x.part)}` : '', fileNote(x), x.file && saved.has(x.file.id) ? 'desat al mòbil' : ''].filter(Boolean).join(' · ')}</small></span></div>`).join('')
      : `<p class="muted" style="margin:0;padding:12px 14px;font-size:calc(13px*var(--ts))">${onlyMine ? `No hi ha material per a la teva ${V.part}.` : 'Encara no hi ha partitures ni àudios.'}</p>`;
    const tog = el.querySelector('#wk-mine');
    if (tog) tog.textContent = onlyMine ? 'Mostra-ho tot' : `Només la meva ${V.part}`;
  };
  openSheet({
    title: w.title,
    wide: true,
    body: `${facts.length ? `<dl class="fitxa">${facts.map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${w.notes ? `<p class="fitxa-note" style="white-space:pre-wrap">${esc(w.notes)}</p>` : ''}
      <div class="section-title" style="margin-top:14px"><h2 class="h2">Qui canta què</h2></div>
      ${(w.roles || []).length ? `<ul class="mini-list" style="max-height:none">${w.roles.map(r => `<li class="${me && (r.memberIds || []).includes(me.id) ? 'is-me' : ''}"><span><b>${esc(r.name)}</b><br><span class="m">${esc(roleNames(r).join(', ') || 'Encara per decidir')}</span></span></li>`).join('')}</ul>`
        : '<p class="muted" style="font-size:calc(13px*var(--ts));margin:0">No hi ha solos ni petits grups.</p>'}
      <div class="section-title" style="margin-top:14px"><h2 class="h2">Partitures i àudios</h2>${me && !canEdit() ? '<button class="btn btn-sm btn-ghost" id="wk-mine"></button>' : ''}</div>
      <div class="panel" id="wk-mats"></div>`,
    foot: `${canEdit() ? `<button class="btn" data-act="work-edit" data-id="${esc(w.id)}">Edita</button>` : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button>`,
    onMount: el => {
      draw(el);
      el.querySelector('#wk-mine')?.addEventListener('click', () => { onlyMine = !onlyMine; draw(el); });
    },
  });
}
/** Tria de persones: una llista de noms marcats i un desplegable per afegir-ne. */
function peoplePicker(ids, onChange) {
  const opts = SECTIONS.map(x => `<optgroup label="${esc(x.name)}">${membersOf(x.id).filter(m => !ids.includes(m.id)).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
  return `<span class="pp">${ids.map(id => `<button type="button" class="chip pp-x" data-rm="${esc(id)}" aria-label="Treu ${esc(S.members.get(id)?.name || '')}">${esc(S.members.get(id)?.name || '?')} ×</button>`).join('')}
    <select class="inp pp-add" aria-label="Afegeix-hi algú"><option value="">+ Afegeix-hi algú</option>${opts}</select></span>`;
}
function sheetWorkEdit(id, presetProd) {
  const ex = id ? S.works.get(id) : null;
  const w = ex ? clone(ex) : { id: uid('w'), title: '', composer: '', arranger: '', duration: '', voicing: '', notes: '', prods: presetProd && presetProd !== 'all' ? [presetProd] : [], roles: [], materials: [], createdAt: new Date().toISOString() };
  w.roles = w.roles || []; w.materials = w.materials || [];
  const read = el => {
    for (const k of ['title', 'composer', 'arranger', 'duration', 'voicing', 'notes']) w[k] = el.querySelector(`#wk-${k}`).value.trim();
    w.prods = $$('#wk-prods .pick[aria-pressed="true"]', el).map(b => b.dataset.p);
    el.querySelectorAll('#wk-roles [data-role]').forEach(row => { const r = w.roles.find(x => x.id === row.dataset.role); if (r) r.name = row.querySelector('.wk-rname').value.trim(); });
  };
  const paintRoles = el => {
    el.querySelector('#wk-roles').innerHTML = w.roles.length ? w.roles.map(r => `<div class="wk-role" data-role="${esc(r.id)}">
        <div style="display:flex;gap:6px;align-items:center"><input class="inp wk-rname" type="text" maxlength="60" value="${esc(r.name)}" placeholder="p. ex. Solo de soprano, núm. 3" style="flex:1;min-width:0">
        <button type="button" class="icon-btn" data-rrm="${esc(r.id)}" aria-label="Treu aquest solo">${ICON.close}</button></div>
        ${peoplePicker(r.memberIds || [])}</div>`).join('')
      : '<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Cap. Afegeix-ne un per cada solo o petit grup (duets, quartets, semicor…).</p>';
    el.querySelectorAll('#wk-roles [data-rrm]').forEach(b => b.onclick = () => { read(el); w.roles = w.roles.filter(r => r.id !== b.dataset.rrm); paintRoles(el); });
    el.querySelectorAll('#wk-roles .wk-role').forEach(row => {
      const r = w.roles.find(x => x.id === row.dataset.role);
      row.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); r.memberIds = (r.memberIds || []).filter(x => x !== b.dataset.rm); paintRoles(el); });
      row.querySelector('.pp-add').onchange = e => { if (!e.target.value) return; read(el); r.memberIds = [...(r.memberIds || []), e.target.value]; paintRoles(el); };
    });
  };
  const paintMats = el => {
    el.querySelector('#wk-matlist').innerHTML = w.materials.length ? w.materials.map(x => `<div class="mat"><span class="mat-k ${x.kind}">${MAT_KINDS[x.kind]?.slice(0, 4) || ''}</span>
        <span class="mat-i"><b style="font-weight:600">${esc(x.title)}</b><small>${[MAT_KINDS[x.kind], x.section ? esc(SEC[x.section].name) : capz(V.tot), x.part ? `${V.part} ${esc(x.part)}` : '', fileNote(x) || 'enllaç'].filter(Boolean).join(' · ')}</small></span>
        <button type="button" class="icon-btn" data-mrm="${esc(x.id)}" aria-label="Treu aquest material">${ICON.close}</button></div>`).join('')
      : '<p class="muted" style="margin:0;padding:12px 14px;font-size:calc(13px*var(--ts))">Encara no n’hi ha.</p>';
    el.querySelectorAll('[data-mrm]').forEach(b => b.onclick = () => { const x = w.materials.find(m => m.id === b.dataset.mrm); w.materials = w.materials.filter(m => m.id !== b.dataset.mrm); if (x?.file) w._drop = [...(w._drop || []), x.file]; paintMats(el); });
  };
  openSheet({
    title: ex ? 'Edita l’obra' : 'Nova obra',
    wide: true,
    body: `<div class="kv">
      <label class="field"><span>Títol</span><input class="inp" id="wk-title" maxlength="90" value="${esc(w.title)}" placeholder="p. ex. Dido and Aeneas"></label>
      <div class="row2"><label class="field"><span>Compositor</span><input class="inp" id="wk-composer" maxlength="60" value="${esc(w.composer)}" placeholder="p. ex. H. Purcell"></label>
        <label class="field"><span>Arranjament (opcional)</span><input class="inp" id="wk-arranger" maxlength="60" value="${esc(w.arranger || '')}"></label></div>
      <div class="row2"><label class="field"><span>Durada</span><input class="inp" id="wk-duration" maxlength="8" inputmode="numeric" value="${esc(w.duration || '')}" placeholder="4:30"></label>
        <label class="field"><span>Formació</span><input class="inp" id="wk-voicing" maxlength="30" value="${esc(w.voicing || '')}" placeholder="p. ex. SATB, SSA, cor i orquestra"></label></div>
      <div class="field"><span>Produccions on es fa</span><div class="pickers" id="wk-prods">${productionsSorted().map(p => `<button type="button" class="pick" data-p="${p.id}" aria-pressed="${w.prods.includes(p.id)}">${esc(p.name)}</button>`).join('')}</div>
        <small>La mateixa obra pot anar a diverses produccions i temporades.</small></div>
      <label class="field"><span>Notes</span><textarea class="inp" id="wk-notes" maxlength="800" style="min-height:70px" placeholder="p. ex. Tempo, divisis, pronunciació…">${esc(w.notes || '')}</textarea></label>
      <div class="field"><span>Solos i petits grups</span><div id="wk-roles" style="display:grid;gap:10px"></div>
        <button type="button" class="btn btn-sm" id="wk-role-add" style="width:max-content;margin-top:8px">+ Solo o petit grup</button></div>
      <div class="field"><span>Partitures i àudios</span><div class="panel" id="wk-matlist"></div>
        <button type="button" class="btn btn-sm" id="wk-mat-add" style="width:max-content;margin-top:8px">+ Partitura o àudio</button>
        <small>Cada fitxer pot ser per a tothom o per a una ${V.section} i ${V.part}: cadascú veurà primer el seu.</small></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="wk-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="wk-save">Desa</button>`,
    onMount: el => {
      paintRoles(el); paintMats(el);
      el.querySelectorAll('#wk-prods .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelector('#wk-role-add').onclick = () => { read(el); w.roles.push({ id: uid('r'), name: '', memberIds: [] }); paintRoles(el); };
      el.querySelector('#wk-mat-add').onclick = () => sheetWorkMaterial(mat => { w.materials.push(mat); paintMats(el); });
      el.querySelector('#wk-save').onclick = () => {
        read(el);
        if (!w.title) { toast('Posa el títol de l’obra'); return; }
        w.roles = w.roles.filter(r => r.name || (r.memberIds || []).length).map(r => ({ ...r, name: r.name || 'Solo' }));
        (w._drop || []).forEach(deleteFile); delete w._drop;
        w.updatedAt = new Date().toISOString();
        saveWork(w);
        closeSheet(); toast(ex ? 'Obra desada' : 'Obra afegida al repertori'); render();
      };
      el.querySelector('#wk-del')?.addEventListener('click', async () => {
        const before = clone(ex);
        S.works.delete(ex.id); persist('works', ex.id, null, 20); bumpEpoch('works');
        closeSheet(); render();
        undoable('Obra esborrada del repertori', () => saveWork(before), () => (before.materials || []).forEach(x => deleteFile(x.file)));
      });
    },
  });
}
/** Una partitura o un àudio per a una obra (el fitxer es puja en desar-la). Es fa en una finestra a sobre. */
function sheetWorkMaterial(onDone) {
  const back = $('#sheet-root').firstElementChild;
  if (back) back.hidden = true;
  const box = document.createElement('div');
  box.className = 'sheet-back';
  box.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Partitura o àudio">
    <div class="sheet-h"><h2 class="h2">Partitura o àudio</h2><button class="icon-btn" id="wm-x" aria-label="Tanca">${ICON.close}</button></div>
    <div class="sheet-b"><div class="kv">
      ${sourceFields('wm', {})}
      <label class="field"><span>Títol</span><input class="inp" id="wm-title" maxlength="90" placeholder="p. ex. Partitura, àudio de tenors"></label>
      <div class="field"><span>Tipus</span><div class="pickers" id="wm-kind">${Object.entries(MAT_KINDS).map(([k, l]) => `<button type="button" class="pick" data-k="${k}" aria-pressed="${k === 'partitura'}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Per a</span><div class="pickers" id="wm-sec"><button type="button" class="pick" data-sec="" aria-pressed="true">${capz(V.tot)}</button>${SECTIONS.map(x => `<button type="button" class="pick" data-sec="${esc(x.id)}" aria-pressed="false" title="${esc(x.name)}"><span class="vl">${esc(x.short)}</span></button>`).join('')}</div></div>
      <div class="field"><span>${V.Part} (opcional)</span><div class="pickers" id="wm-part"><button type="button" class="pick" data-part="" aria-pressed="true">Totes</button>${['1', '2'].map(v => `<button type="button" class="pick" data-part="${v}" aria-pressed="false">${v}</button>`).join('')}</div></div>
    </div></div>
    <div class="sheet-f"><span class="spacer"></span><button class="btn" id="wm-no">Cancel·la</button><button class="btn btn-primary" id="wm-ok">Afegeix</button></div></div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); if (back) back.hidden = false; };
  const single = sel => box.querySelectorAll(`${sel} .pick`).forEach(b => b.onclick = () => box.querySelectorAll(`${sel} .pick`).forEach(x => x.setAttribute('aria-pressed', String(x === b))));
  single('#wm-kind'); single('#wm-sec'); single('#wm-part');
  const title = box.querySelector('#wm-title');
  const src = bindSource(box, 'wm', f => {
    if (!title.value.trim()) title.value = titleFromFile(f.name);
    const k = fileKind(f);
    const guess = k === 'PDF' ? 'partitura' : k === 'Àudio' ? 'audio' : k === 'Vídeo' ? 'video' : null;
    if (guess) box.querySelectorAll('#wm-kind .pick').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.k === guess)));
  });
  box.querySelector('#wm-x').onclick = close;
  box.querySelector('#wm-no').onclick = close;
  box.querySelector('#wm-ok').onclick = async e => {
    if (!title.value.trim() && !src.picked()) { toast('Posa un títol'); return; }
    const got = await resolveSource(src, null, e.currentTarget);
    if (!got) return;
    const rec = { id: uid('mt'), title: title.value.trim() || titleFromFile(got.file?.name || ''), url: got.url, kind: box.querySelector('#wm-kind .pick[aria-pressed="true"]').dataset.k,
      section: box.querySelector('#wm-sec .pick[aria-pressed="true"]').dataset.sec, part: box.querySelector('#wm-part .pick[aria-pressed="true"]').dataset.part, at: new Date().toISOString(), by: S.me?.email || '' };
    if (got.file) rec.file = got.file;
    close(); onDone(rec);
  };
}
/** Una obra que ja és al repertori, a aquesta producció. */
function sheetLinkWork(pid) {
  const prod = S.productions.get(pid);
  const rest = worksSorted().filter(w => !(w.prods || []).includes(pid));
  if (!rest.length) { toast('Totes les obres del repertori ja hi són'); return; }
  openSheet({
    title: `Obres a ${prod.name}`,
    body: `<p style="margin-top:0">Tria les obres del repertori que es fan a <b>${esc(prod.name)}</b>. Conserven les partitures, els àudios i la fitxa.</p>
      <div class="pickers" id="lw-list" style="flex-direction:column;align-items:stretch">${rest.map(w => `<button type="button" class="pick" data-w="${esc(w.id)}" aria-pressed="false" style="justify-content:flex-start;text-align:left">${esc(w.title)}${w.composer ? ` · ${esc(w.composer)}` : ''}</button>`).join('')}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="lw-ok">Afegeix-les</button>`,
    onMount: el => {
      el.querySelectorAll('#lw-list .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelector('#lw-ok').onclick = () => {
        const ids = $$('#lw-list .pick[aria-pressed="true"]', el).map(b => b.dataset.w);
        for (const id of ids) { const w = S.works.get(id); saveWork({ ...w, prods: [...new Set([...(w.prods || []), pid])] }); }
        closeSheet(); toast(ids.length ? `${ids.length} ${ids.length === 1 ? 'obra afegida' : 'obres afegides'}` : 'Cap canvi'); render();
      };
    },
  });
}

/* ---------- Reproductor d'estudi ---------- */
// Per als àudios d'estudi: més lent (sense canviar el to), tornar enrere cinc segons i repetir un fragment (A–B).
function studyPlayer(url) {
  return `<div class="player">
    <audio preload="metadata" src="${url}" controls style="width:100%"></audio>
    <div class="pl-row" role="group" aria-label="Velocitat">${[0.5, 0.75, 0.9, 1].map(r => `<button type="button" class="chip" data-rate="${r}" aria-pressed="${r === 1}">${String(r).replace('.', ',')}×</button>`).join('')}</div>
    <div class="pl-row"><button type="button" class="btn btn-sm" data-pl="back">−5 s</button><button type="button" class="btn btn-sm" data-pl="a">Inici del fragment</button><button type="button" class="btn btn-sm" data-pl="b">Final</button><button type="button" class="btn btn-sm" data-pl="loop" aria-pressed="false">Repeteix</button></div>
    <p class="pl-ab muted"></p></div>`;
}
function bindStudyPlayer(box) {
  const a = box.querySelector('audio');
  if (!a) return;
  a.preservesPitch = true;
  let A = null, B = null, loop = false;
  const t = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const paint = () => {
    box.querySelector('.pl-ab').textContent = A == null ? 'Marca l’inici i el final d’un fragment per repetir-lo.' : `Fragment: ${t(A)} – ${B == null ? '…' : t(B)}${loop ? ' · es repeteix' : ''}`;
    box.querySelector('[data-pl="loop"]').setAttribute('aria-pressed', String(loop));
  };
  box.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { a.playbackRate = +b.dataset.rate; box.querySelectorAll('[data-rate]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  box.querySelector('[data-pl="back"]').onclick = () => { a.currentTime = Math.max(0, a.currentTime - 5); };
  box.querySelector('[data-pl="a"]').onclick = () => { A = a.currentTime; if (B != null && B <= A) B = null; paint(); };
  box.querySelector('[data-pl="b"]').onclick = () => { if (A == null) A = 0; B = Math.max(A + 0.5, a.currentTime); loop = true; a.currentTime = A; a.play().catch(() => {}); paint(); };
  box.querySelector('[data-pl="loop"]').onclick = () => { loop = !loop && A != null; if (loop && B == null) B = a.duration || A + 10; paint(); };
  a.addEventListener('timeupdate', () => { if (loop && A != null && B != null && a.currentTime >= B) a.currentTime = A; });
  paint();
}

/* ---------- Partitures i àudios desats al mòbil ---------- */
// «Desa al mòbil» guarda el fitxer sencer a la memòria del navegador (Cache Storage, «atempo-fitxers»), i loadFile el
// busca primer allà: així s'obre sense cobertura. El treballador de servei no esborra mai aquesta memòria.
const OFFLINE = 'atempo-fitxers';
const LS_OFFLINE = 'atempo:fitxers-desats';
const offlineReq = id => new Request(`${location.origin}${location.pathname.replace(/[^/]*$/, '')}__fitxer/${encodeURIComponent(id)}`);
function offlineSaved() { try { return new Set(JSON.parse(localStorage.getItem(LS_OFFLINE) || '[]')); } catch { return new Set(); } }
function offlineMark(id, on) { const s = offlineSaved(); on ? s.add(id) : s.delete(id); try { localStorage.setItem(LS_OFFLINE, JSON.stringify([...s])); } catch {} }
async function offlineGet(f) {
  if (!('caches' in window) || !offlineSaved().has(f.id)) return null;
  try { const r = await (await caches.open(OFFLINE)).match(offlineReq(f.id)); return r ? await r.blob() : null; } catch { return null; }
}
async function offlinePut(f, blob) {
  if (!('caches' in window)) throw new Error('sense-cache');
  await (await caches.open(OFFLINE)).put(offlineReq(f.id), new Response(blob, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
  offlineMark(f.id, true);
}
async function offlineSave(f) {
  const url = await loadFile(f);
  const blob = await (await fetch(url)).blob();
  await offlinePut(f, blob);
}
/** Els fitxers pujats d'aquestes obres (i de la producció) que toquen a aquesta persona. */
function offlineCandidates(works, prod, me) {
  const mats = [...works.flatMap(w => w.materials || []), ...(prod ? prod.materials || [] : [])];
  return mats.filter(x => x.file && ['partitura', 'audio'].includes(x.kind) && (!me || forMyVoice(x, me))).map(x => x.file);
}
async function offlineSaveAll() {
  const all = ui.matProd === 'all';
  const prod = all ? null : S.productions.get(ui.matProd);
  const me = S.members.get(myMemberId());
  const onlyMine = !!me && !canEdit() && ui.matMine !== false;
  const files = offlineCandidates(all ? worksSorted() : worksOf(prod?.id), prod, onlyMine ? me : null).filter(f => !offlineSaved().has(f.id));
  if (!navigator.onLine) { toast('Cal connexió per desar-los'); return; }
  let done = 0;
  for (const f of files) {
    toast(`Desant ${done + 1} de ${files.length}…`);
    try { await offlineSave(f); done++; } catch {}
  }
  toast(done === files.length ? `${done} ${done === 1 ? 'fitxer desat' : 'fitxers desats'}: els pots obrir sense cobertura` : `S’han desat ${done} de ${files.length}. Torna-ho a provar amb més cobertura.`);
  render();
}
async function offlineClear() {
  try { await caches.delete(OFFLINE); } catch {}
  try { localStorage.removeItem(LS_OFFLINE); } catch {}
  toast('Fitxers trets del mòbil'); render();
}

/* ---------- Pla d'assaig ---------- */
// session.plan = { items: [...], text (indicacions), after (després: què s'hi ha fet) }. Cada element és:
//   · una obra (kind ''): { work (id del repertori) o title, bars ('1-40'), who ('' = tots, una corda, 'S,C', 'Solistes'), mins, note };
//   · un bloc (kind 'head'): { time, title ('Assaig parcial', 'Tutti'…), who (les cordes, 'S,C'; buit = tothom), where (l'aula), lead (qui el porta) };
//   · una pausa (kind 'break'): { time, mins }.
// Així hi cap el pla d'una setmana normal: parcials de cordes a aules diferents i amb qui les porta, la pausa i el tutti. El fa
// la direcció i el veu tothom; cadascú hi veu el que li toca, i qui falta sap què s'ha perdut.
const planOf = s => s && s.plan && ((s.plan.items || []).length || s.plan.text || s.plan.after) ? s.plan : null;
const planTitle = it => (it.work && S.works.get(it.work)?.title) || it.title || 'Obra';
const planWhoList = w => String(w || '').split(',').map(x => x.trim()).filter(Boolean);
const planItemWho = it => planWhoList(it.who).map(x => SEC_MAP[x] ? SEC[x].name : x).join(' i ');
/** El que em toca: els blocs d'altres cordes (i les seves obres) no hi surten; les obres d'una altra corda, tampoc. */
function planForMe(items, sec) {
  if (!sec) return items;
  const mine = it => !it.who || planWhoList(it.who).includes(sec) || !planWhoList(it.who).some(x => SEC_MAP[x]);
  let skip = false;
  return items.filter(it => {
    if (it.kind === 'head') { skip = !mine(it); return !skip; }
    if (it.kind === 'break') { skip = false; return true; }
    return !skip && mine(it);
  });
}
const planWorks = items => (items || []).filter(it => !it.kind);
/** El pla, per llegir. compact = només els títols (per a les targetes). sec = només el que toca a aquella corda. */
function planHtml(s, compact, sec) {
  const p = planOf(s);
  if (!p) return '';
  const items = planForMe(p.items || [], sec);
  if (compact) { const w = planWorks(items); return w.length ? `<span class="plan-line">${esc(w.map(it => `${planTitle(it)}${it.bars ? ` (${it.bars})` : ''}`).join(' · '))}</span>` : ''; }
  const past = s.date < TODAY;
  const out = [];
  let list = [];
  const flush = () => { if (list.length) out.push(`<ol class="plan-items">${list.join('')}</ol>`); list = []; };
  for (const it of items) {
    if (it.kind === 'head') {
      flush();
      out.push(`<div class="plan-bh">${it.time ? `<span class="mono">${esc(it.time)}</span>` : ''}<b>${esc(it.title || 'Bloc')}</b>${[planItemWho(it), it.where, it.lead ? `amb ${it.lead}` : ''].filter(Boolean).length ? `<small>${esc([planItemWho(it), it.where, it.lead ? `amb ${it.lead}` : ''].filter(Boolean).join(' · '))}</small>` : ''}</div>`);
    } else if (it.kind === 'break') {
      flush();
      out.push(`<div class="plan-break">${it.time ? `<span class="mono">${esc(it.time)}</span>` : ''}Pausa${it.mins ? ` · ${esc(String(it.mins))}′` : ''}</div>`);
    } else {
      list.push(`<li><b>${esc(planTitle(it))}</b>${it.bars ? ` <span class="mono">c. ${esc(it.bars)}</span>` : ''}${planItemWho(it) ? ` <span class="m">· ${esc(planItemWho(it))}</span>` : ''}${it.mins ? ` <span class="m mono">· ${esc(String(it.mins))}′</span>` : ''}${it.note ? `<br><span class="m">${esc(it.note)}</span>` : ''}</li>`);
    }
  }
  flush();
  const hidden = sec && items.length < (p.items || []).length;
  return `<div class="plan">${out.join('')}
    ${hidden ? `<button class="btn btn-sm btn-ghost" data-act="plan-all" data-sid="${esc(s.id)}">Mostra tot el pla (també les altres ${esc(V.sections)})</button>` : ''}
    ${p.text ? `<p class="plan-text">${esc(p.text)}</p>` : ''}
    ${p.after ? `<p class="plan-after"><b>${past ? 'Què s’hi va fer' : 'Després de l’assaig'}:</b> ${esc(p.after)}</p>` : ''}
  </div>`;
}
/** El pla en text, per copiar-lo. */
function planText(s) {
  const p = planOf(s);
  if (!p) return '';
  return (p.items || []).map(it => it.kind === 'head' ? `\n${[it.time, it.title || 'Bloc'].filter(Boolean).join(' · ')}${[planItemWho(it), it.where, it.lead ? `amb ${it.lead}` : ''].filter(Boolean).length ? ` (${[planItemWho(it), it.where, it.lead ? `amb ${it.lead}` : ''].filter(Boolean).join(' · ')})` : ''}`
    : it.kind === 'break' ? `${it.time ? `${it.time} · ` : ''}Pausa${it.mins ? ` ${it.mins}′` : ''}`
    : `· ${planTitle(it)}${it.bars ? ` (c. ${it.bars})` : ''}${planItemWho(it) ? ` · ${planItemWho(it)}` : ''}${it.mins ? ` · ${it.mins}′` : ''}${it.note ? ` — ${it.note}` : ''}`).join('\n').trim();
}
/** Canvia una sessió dins de la seva producció (les sessions van dins del document de la producció). */
function updateSession(sid, patch) {
  const s = sessionById(sid);
  const p = s && clone(S.productions.get(s.prodId));
  if (!p) return false;
  p.sessions = (p.sessions || []).map(x => x.id === sid ? { ...x, ...patch } : x);
  for (const [k, v] of Object.entries(patch)) if (v == null) for (const x of p.sessions) if (x.id === sid) delete x[k];
  saveProduction(p);
  return true;
}
const PLAN_KINDS = [['', 'Obra o fragment'], ['head', 'Bloc (parcial, tutti…)'], ['break', 'Pausa']];
function sheetPlan(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const plan = clone(s.plan || { items: [], text: '', after: '' });
  plan.items = plan.items || [];
  const works = [...new Map([...sessionProds(s).flatMap(worksOf), ...worksSorted()].map(w => [w.id, w])).values()];
  const inProd = new Set(sessionProds(s).flatMap(worksOf).map(w => w.id));
  const val = (row, f) => row.querySelector(`[data-f="${f}"]`)?.value.trim() ?? '';
  const read = el => el.querySelectorAll('#pl-items .plan-row').forEach(row => {
    const it = plan.items.find(x => x.id === row.dataset.id);
    if (!it) return;
    it.kind = val(row, 'kind');
    for (const k of ['work', 'title', 'bars', 'who', 'mins', 'time', 'where', 'lead', 'note']) delete it[k];
    if (it.kind === 'head') {
      Object.assign(it, { time: val(row, 'time'), title: val(row, 'title'), where: val(row, 'where'), lead: val(row, 'lead') });
      const secs = $$('.pick[aria-pressed="true"]', row).map(b => b.dataset.sec);
      it.who = secs.length && secs.length < SECTIONS.length ? secs.join(',') : '';
    } else if (it.kind === 'break') {
      Object.assign(it, { time: val(row, 'time'), mins: +val(row, 'mins') || '' });
    } else {
      const v = val(row, 'work');
      Object.assign(it, { work: v === '__' ? '' : v, title: v === '__' ? val(row, 'title') : '', bars: val(row, 'bars'), who: val(row, 'who'), mins: +val(row, 'mins') || '', note: val(row, 'note') });
    }
    for (const k of Object.keys(it)) if (it[k] === '' && k !== 'kind' && k !== 'who') delete it[k];
  });
  const workSelect = it => `<select class="inp" data-f="work" style="flex:1;min-width:0">${works.length ? `<optgroup label="${inProd.size ? 'D’aquesta producció' : 'Repertori'}">${works.filter(w => !inProd.size || inProd.has(w.id)).map(w => `<option value="${esc(w.id)}" ${it.work === w.id ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}</optgroup>` : ''}
      ${inProd.size && works.length > inProd.size ? `<optgroup label="Resta del repertori">${works.filter(w => !inProd.has(w.id)).map(w => `<option value="${esc(w.id)}" ${it.work === w.id ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}</optgroup>` : ''}
      <option value="__" ${!it.work ? 'selected' : ''}>Una altra cosa…</option></select>`;
  const rowHtml = (it, n) => {
    const kind = it.kind || '';
    const head = `<div style="display:flex;gap:6px;align-items:center"><span class="plan-n">${kind ? (kind === 'head' ? '▸' : '‖') : n}</span>
      <select class="inp" data-f="kind" aria-label="Què és" style="flex:1;min-width:0">${PLAN_KINDS.map(([k, l]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button type="button" class="icon-btn" data-up="${esc(it.id)}" aria-label="Puja-la" ${n === 1 && !kind ? '' : ''}>${ICON.up}</button>
      <button type="button" class="icon-btn" data-rm="${esc(it.id)}" aria-label="Treu-la">${ICON.close}</button></div>`;
    if (kind === 'head') return `<div class="plan-row is-head" data-id="${esc(it.id)}">${head}
      <div class="row2"><input class="inp" data-f="time" type="time" value="${esc(it.time || '')}" aria-label="Hora"><input class="inp" data-f="title" maxlength="50" value="${esc(it.title || '')}" placeholder="p. ex. Assaig parcial · Tutti"></div>
      <div class="pickers" aria-label="Qui">${SECTIONS.map(x => secPick(x, planWhoList(it.who).includes(x.id))).join('')}</div>
      <div class="row2"><input class="inp" data-f="where" maxlength="60" value="${esc(it.where || '')}" placeholder="Aula (p. ex. Aula 1 PP)"><input class="inp" data-f="lead" maxlength="60" value="${esc(it.lead || '')}" placeholder="Qui el porta"></div></div>`;
    if (kind === 'break') return `<div class="plan-row is-break" data-id="${esc(it.id)}">${head}
      <div class="row2"><input class="inp" data-f="time" type="time" value="${esc(it.time || '')}" aria-label="Hora"><input class="inp" data-f="mins" type="number" min="1" max="120" inputmode="numeric" value="${esc(String(it.mins || ''))}" placeholder="Minuts"></div></div>`;
    return `<div class="plan-row" data-id="${esc(it.id)}">${head}
      ${workSelect(it)}
      <input class="inp" data-f="title" type="text" maxlength="60" value="${esc(it.title || '')}" placeholder="p. ex. Escalfament, lectura nova…" ${it.work ? 'hidden' : ''}>
      <div class="row3"><input class="inp" data-f="bars" type="text" maxlength="30" value="${esc(it.bars || '')}" placeholder="Compassos" aria-label="Compassos">
        <select class="inp" data-f="who" aria-label="Qui"><option value="">Tothom</option>${SECTIONS.map(x => `<option value="${esc(x.id)}" ${it.who === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="Solistes" ${it.who === 'Solistes' ? 'selected' : ''}>Solistes</option></select>
        <input class="inp" data-f="mins" type="number" min="1" max="180" inputmode="numeric" value="${esc(String(it.mins || ''))}" placeholder="Minuts" aria-label="Minuts"></div>
      <input class="inp" data-f="note" type="text" maxlength="120" value="${esc(it.note || '')}" placeholder="Nota (opcional): p. ex. lectura, de memòria, amb el text"></div>`;
  };
  const paint = el => {
    let n = 0;
    el.querySelector('#pl-items').innerHTML = plan.items.length ? plan.items.map(it => rowHtml(it, it.kind ? 0 : ++n)).join('') : '<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Encara no hi ha res. Afegeix les obres que s’assajaran, per ordre. Si hi ha parcials, afegeix un bloc per a cada grup de cordes, amb l’aula i qui el porta.</p>';
    el.querySelectorAll('#pl-items [data-rm]').forEach(b => b.onclick = () => { read(el); plan.items = plan.items.filter(x => x.id !== b.dataset.rm); paint(el); });
    el.querySelectorAll('#pl-items [data-up]').forEach(b => b.onclick = () => { read(el); const i = plan.items.findIndex(x => x.id === b.dataset.up); if (i > 0) { const [x] = plan.items.splice(i, 1); plan.items.splice(i - 1, 0, x); } paint(el); });
    el.querySelectorAll('#pl-items [data-f="work"], #pl-items [data-f="kind"]').forEach(x => x.onchange = () => { read(el); paint(el); });
    el.querySelectorAll('#pl-items .pickers .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
  };
  const add = (el, kind) => { read(el); plan.items.push(kind === 'head' ? { id: uid('pi'), kind, time: '', title: '', who: '' } : kind === 'break' ? { id: uid('pi'), kind, time: '', mins: 15 } : { id: uid('pi'), kind: '', work: works.find(w => inProd.has(w.id))?.id || works[0]?.id || '', title: '', bars: '', who: '', note: '' }); paint(el); };
  openSheet({
    title: 'Pla d’assaig',
    wide: true,
    body: `<p style="margin-top:0"><b>${esc(longDate(s.date))}</b>${s.time ? ` · ${esc(timeRange(s))}` : ''} · ${esc(s.type || 'Assaig')}<br><span class="muted" style="font-size:calc(13px*var(--ts))">El veuen tots els ${V.members} convocats, per preparar-ho; cadascú hi veu primer el que li toca. Qui falti sabrà què s’ha fet.</span></p>
      <div id="pl-items" style="display:grid;gap:12px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn btn-sm" id="pl-add">+ Obra</button><button type="button" class="btn btn-sm" id="pl-add-head">+ Bloc (parcial o tutti)</button><button type="button" class="btn btn-sm" id="pl-add-break">+ Pausa</button></div>
      <label class="field" style="margin-top:14px"><span>Indicacions (opcional)</span><textarea class="inp" id="pl-text" maxlength="800" style="min-height:60px" placeholder="p. ex. Porteu el llapis. Mirarem sobretot la pronunciació.">${esc(plan.text || '')}</textarea></label>
      <label class="field" style="margin-top:10px"><span>Després de l’assaig: què s’hi ha fet (opcional)</span><textarea class="inp" id="pl-after" maxlength="1200" style="min-height:60px" placeholder="p. ex. Hem llegit el núm. 2 i el 4; del 8, del c. 30 al 45. Per a la setmana vinent, de memòria fins al 40.">${esc(plan.after || '')}</textarea></label>`,
    foot: `${planOf(s) ? '<button class="btn btn-danger-ghost" id="pl-del">Esborra el pla</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pl-save">Desa</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#pl-add').onclick = () => add(el, '');
      el.querySelector('#pl-add-head').onclick = () => add(el, 'head');
      el.querySelector('#pl-add-break').onclick = () => add(el, 'break');
      el.querySelector('#pl-save').onclick = () => {
        read(el);
        plan.items = plan.items.filter(it => it.kind || it.work || it.title);
        plan.text = el.querySelector('#pl-text').value.trim();
        plan.after = el.querySelector('#pl-after').value.trim();
        plan.at = new Date().toISOString(); plan.by = S.me?.name || S.email || '';
        updateSession(sid, { plan: plan.items.length || plan.text || plan.after ? plan : null });
        closeSheet(); toast('Pla d’assaig desat'); render();
      };
      el.querySelector('#pl-del')?.addEventListener('click', () => { updateSession(sid, { plan: null }); closeSheet(); toast('Pla esborrat'); render(); });
    },
  });
}
/** L'últim assaig on no vas anar, si té pla: què s'hi va fer. */
function missedPlan(me) {
  if (!me) return null;
  const from = isoDate(new Date(Date.now() - 15 * 864e5));
  return allSessions().filter(s => s.date < TODAY && s.date >= from && convoked(s, me.section) && planOf(s))
    .reverse().find(s => { const mk = effMark(s, me); return mk && (mk.s === 'FJ' || mk.s === 'FNJ'); }) || null;
}
const PLAN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6.5l10-2.5v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></svg>';
/** A les targetes (Inici, avui): el pla d'assaig en una línia, o un botó per fer-lo. */
function planChip(s) {
  const p = planOf(s);
  if (p) {
    const me = S.members.get(myMemberId());
    const titles = planWorks(planForMe(p.items || [], me && !canEdit() ? me.section : '')).map(it => `${planTitle(it)}${it.bars ? ` (${it.bars})` : ''}`).join(' · ') || p.text || p.after;
    return `<button class="fitxa-chip plan-chip" data-act="session-info" data-sid="${s.id}">${PLAN_ICON}<span><b>${s.date < TODAY ? 'Què s’hi va treballar' : 'Pla d’assaig'}</b><small>${esc(titles)}</small></span></button>`;
  }
  if (canEdit() && !isShow(s) && s.date >= TODAY) return `<button class="fitxa-chip empty" data-act="plan-edit" data-sid="${s.id}">${PLAN_ICON}<span><b>Afegeix el pla d’assaig</b><small>Quines obres i quins compassos, perquè ho puguin preparar</small></span></button>`;
  return '';
}
