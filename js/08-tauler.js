// A Tempo · 08-tauler.js — Tauler: anuncis, materials, documents, enquestes i fitxers pujats.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Board (announcements, materials, polls) ---------- */
const LS_SEEN = 'atempo:tauler-vist';
const MAT_KINDS = { partitura: 'Partitura', audio: 'Àudio', video: 'Vídeo', altres: 'Altres' };
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const mySection = () => S.members.get(myMemberId())?.section || null;
const forMe = x => canEdit() || !myId() || !x.sections?.length || x.sections.includes(mySection());
function visibleAnnouncements() {
  return [...S.announcements.values()]
    .filter(a => forMe(a) && (canEdit() || !a.until || a.until >= TODAY))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
const openPolls = () => [...S.polls.values()].filter(p => forMe(p) && !p.closed && (!p.closesAt || p.closesAt >= TODAY));
function boardBadge() {
  let seen = '';
  seen = lsGet(LS_SEEN) || '';
  const news = visibleAnnouncements().filter(a => (a.createdAt || '') > seen).length;
  const polls = myId() && !canEdit() ? openPolls().filter(p => !S.pollVotes.get(`${p.id}_${myId()}`)).length : 0;
  return news + polls;
}
function viewBoard() {
  const tabs = [['anuncis', 'Anuncis'], ['materials', 'Materials'], ['documents', 'Documents'], ['enquestes', 'Enquestes']];
  if (!tabs.some(([k]) => k === ui.board)) ui.board = 'anuncis';
  if (ui.board === 'anuncis') { lsSet(LS_SEEN, new Date().toISOString()); setTimeout(renderTabs, 0); }
  const head = `<div class="page-head"><h1 class="h1">Tauler</h1></div>
    <div class="subtabs board-tabs" role="tablist" style="margin-bottom:10px;grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map(([k, l]) => `<button class="subtab" role="tab" aria-selected="${ui.board === k}" data-act="board" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (ui.board === 'materials') return head + boardMaterials();
  if (ui.board === 'documents') return head + boardDocuments();
  if (ui.board === 'enquestes') return head + boardPolls();
  return head + boardAnnouncements();
}
function boardAnnouncements() {
  const list = visibleAnnouncements();
  const active = list.filter(a => !a.until || a.until >= TODAY);
  const expired = list.filter(a => a.until && a.until < TODAY);
  const card = a => `<article class="ann ${a.pinned ? 'pinned' : ''}">
      <div class="ann-h"><h2 class="ann-t">${esc(a.title)}</h2>${canEdit() ? `<button class="icon-btn" data-act="ann-edit" data-id="${a.id}" aria-label="Edita l’anunci">${ICON.more}</button>` : ''}</div>
      ${a.body ? `<div class="ann-b">${linkify(a.body)}</div>` : ''}
      <div class="ann-m">${a.pinned ? '<span class="pin">Fixat</span>' : ''}<span>${esc(a.author || '')}</span><span class="mono">${a.createdAt ? ddmm(a.createdAt.slice(0, 10)) : ''}</span>
        ${a.sections?.length ? `<span>Per a: ${esc(a.sections.map(x => SEC[x].name).join(', '))}</span>` : ''}${a.until ? `<span>Fins al ${ddmm(a.until)}</span>` : ''}</div>
    </article>`;
  return `${canEdit() ? `<div class="sec-h" style="margin-top:6px"><span class="muted" style="font-size:13px">Els veuen tots els ${V.members} (o només les ${V.sections} triades).</span><button class="btn btn-sm btn-primary" data-act="ann-new">+ Anunci</button></div>` : ''}
    ${active.length ? `<div class="panel">${active.map(card).join('')}</div>` : `<div class="empty"><p>No hi ha anuncis.</p></div>`}
    ${canEdit() && expired.length ? `<details class="np-group"><summary><span>Caducats (${expired.length})</span>${ICON.chev}</summary><div class="panel">${expired.map(card).join('')}</div></details>` : ''}`;
}
function boardMaterials() {
  const prods = productionsSorted();
  if (!ui.matProd || !S.productions.has(ui.matProd)) ui.matProd = currentProductionId();
  const prod = S.productions.get(ui.matProd);
  if (!prod) return '<div class="empty"><p>Encara no hi ha produccions.</p></div>';
  const me = S.members.get(myMemberId());
  const onlyMine = !!me && !canEdit() && ui.matMine !== false;
  const items = (prod.materials || []).filter(x => !onlyMine || !me || ((!x.section || x.section === me.section) && (!x.part || !me.part || me.part.includes(x.part) || x.part.includes(me.part))));
  const chips = `<div class="filters"><label class="sel"><span class="sr">Producció</span><select data-pick="mat-prod">${prods.map(p => `<option value="${p.id}" ${p.id === prod.id ? 'selected' : ''}>${esc(p.name)}${(p.materials || []).length ? ` · ${(p.materials || []).length}` : ''}</option>`).join('')}</select></label></div>`;
  const tools = canEdit()
    ? `<div class="sec-h" style="margin-top:4px"><span class="muted" style="font-size:13px">Enllaços a Drive, Dropbox, YouTube…</span><button class="btn btn-sm btn-primary" data-act="mat-new">+ Material</button></div>`
    : me
      ? `<div class="sec-h" style="margin-top:4px"><span class="muted" style="font-size:13px">${onlyMine ? `Mostrant el material per a ${esc(SEC[me.section].name.toLowerCase())}${me.part ? ` ${esc(me.part)}` : ''}` : 'Mostrant tot el material'}</span><button class="btn btn-sm btn-ghost" data-act="mat-mine">${onlyMine ? 'Mostra-ho tot' : `Només la meva ${V.part}`}</button></div>`
      : '';
  const order = Object.keys(MAT_KINDS);
  const sorted = [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title, 'ca'));
  const row = x => `<div class="mat"><span class="mat-k ${x.kind}">${MAT_KINDS[x.kind]?.slice(0, 4) || ''}</span>
      <span class="mat-i">${itemLink(x, `data-act="file-open" data-src="mat" data-pid="${prod.id}" data-id="${x.id}"`)}<small>${[MAT_KINDS[x.kind], x.section ? esc(SEC[x.section].name) : capz(V.tot), x.part ? `${V.part} ${esc(x.part)}` : '', fileNote(x)].filter(Boolean).join(' · ')}</small></span>
      ${canEdit() ? `<button class="icon-btn" data-act="mat-edit" data-pid="${prod.id}" data-id="${x.id}" aria-label="Edita">${ICON.more}</button>` : ''}</div>`;
  return chips + tools + (sorted.length ? `<div class="panel prod-tone tinted" style="--ph:${prodHue(prod)}">${sorted.map(row).join('')}</div>` : `<div class="empty"><p>Encara no hi ha material per a ${esc(prod.name)}.</p></div>`);
}
/* ---------- Fitxers pujats des de l'ordinador (PDF, àudio, imatges…) ---------- */
// Cada fitxer es desa a trossos de 700 KB dins de cors/<agrupació>/config (config/fitxer_<id>_<n>).
// Aquesta col·lecció ja té els permisos que cal: tothom de l'agrupació la pot llegir i només l'equip
// hi escriu. L'app només s'hi subscriu al document «main», de manera que els trossos només es
// descarreguen quan algú obre el fitxer. Materials i documents en guarden la fitxa a «file».
const FILE_CHUNK = 700 * 1024;
const FILE_MAX = 20 * 1024 * 1024;
const chunkPath = (fid, i) => `config/fitxer_${fid}_${i}`;
const fmtSize = n => !n ? '0 MB' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
function fileKind(f) {
  const t = f.type || '', ext = (f.name.split('.').pop() || '').toLowerCase();
  if (t === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (t.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) return 'Àudio';
  if (t.startsWith('image/')) return 'Imatge';
  if (t.startsWith('video/')) return 'Vídeo';
  return ext ? ext.toUpperCase() : 'Fitxer';
}
const titleFromFile = name => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
async function uploadFile(file, onProgress) {
  const id = uid('f');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const n = Math.max(1, Math.ceil(bytes.length / FILE_CHUNK));
  for (let i = 0; i < n; i++) {
    const part = bytes.subarray(i * FILE_CHUNK, (i + 1) * FILE_CHUNK);
    await db.doc(chunkPath(id, i)).set({ d: firebase.firestore.Blob.fromUint8Array(part), i, of: n });
    onProgress?.(i + 1, n);
  }
  return { id, name: file.name, type: file.type || '', size: file.size, chunks: n, at: new Date().toISOString() };
}
function deleteFile(f) {
  if (!f || !f.id) return;
  const b = fs.batch();
  for (let i = 0; i < (f.chunks || 1); i++) b.delete(db.doc(chunkPath(f.id, i)));
  b.commit().catch(() => {});
  fileUrls.delete(f.id);
}
const fileUrls = new Map();
async function loadFile(f) {
  if (fileUrls.has(f.id)) return fileUrls.get(f.id);
  const snaps = await Promise.all(Array.from({ length: f.chunks || 1 }, (_, i) => db.doc(chunkPath(f.id, i)).get()));
  if (snaps.some(x => !x.exists)) throw new Error('incomplet');
  const blob = new Blob(snaps.map(x => x.data().d.toUint8Array()), { type: f.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  fileUrls.set(f.id, url);
  return url;
}
function sheetOpenFile(f, title) {
  const kind = fileKind(f);
  openSheet({
    title: title || f.name,
    body: `<div id="fo-body"><p class="muted" style="margin:0">Carregant el fitxer (${esc(kind)} · ${fmtSize(f.size)})…</p></div>`,
    onMount: async el => {
      const box = el.querySelector('#fo-body');
      try {
        const url = await loadFile(f);
        if (!box.isConnected) return;
        const media = kind === 'Àudio' ? `<audio controls preload="metadata" src="${url}" style="width:100%"></audio>`
          : kind === 'Imatge' ? `<img src="${url}" alt="" style="display:block;width:100%;border-radius:12px">` : '';
        box.innerHTML = `${media}
          <p class="muted" style="margin:${media ? '12px' : '0'} 0 14px;font-size:13px;overflow-wrap:anywhere">${esc(f.name)} · ${esc(kind)} · ${fmtSize(f.size)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">Obre</a><a class="btn" href="${url}" download="${esc(f.name)}">Desa al dispositiu</a></div>`;
      } catch {
        if (box.isConnected) box.innerHTML = '<p style="margin:0">No s’ha pogut carregar el fitxer. Comprova la connexió i torna-ho a provar.</p>';
      }
    },
  });
}
/** Source chooser for materials and documents: a file from the computer or a link. */
function sourceFields(prefix, item) {
  const mode = item.url && !item.file ? 'link' : 'file';
  const f = item.file;
  return `<div class="field"><span>Què hi vols posar?</span><div class="pickers" id="${prefix}-src">
      <button type="button" class="pick" data-src="file" aria-pressed="${mode === 'file'}">Un fitxer</button>
      <button type="button" class="pick" data-src="link" aria-pressed="${mode === 'link'}">Un enllaç</button></div></div>
    <div class="field" id="${prefix}-file-f" ${mode === 'file' ? '' : 'hidden'}><span>Fitxer</span>
      <label class="dropzone" for="${prefix}-file" id="${prefix}-drop">
        <input id="${prefix}-file" type="file" class="sr">
        <span class="dz-t">${f ? esc(f.name) : 'Tria un fitxer o arrossega’l aquí'}</span>
        <span class="dz-s">${f ? `${esc(fileKind(f))} · ${fmtSize(f.size)} · toca per canviar-lo` : 'PDF, àudio, imatges… fins a 20 MB'}</span>
      </label></div>
    <label class="field" id="${prefix}-url-f" ${mode === 'link' ? '' : 'hidden'}><span>Enllaç</span><input class="inp" id="${prefix}-url" type="url" value="${esc(item.url || '')}" placeholder="https://drive.google.com/…"><small>Si és de Google Drive, comparteix-lo com a «Qualsevol persona amb l’enllaç».</small></label>`;
}
function bindSource(el, prefix, onPick) {
  let picked = null;
  const drop = el.querySelector(`#${prefix}-drop`), input = el.querySelector(`#${prefix}-file`);
  el.querySelectorAll(`#${prefix}-src .pick`).forEach(b => b.onclick = () => {
    el.querySelectorAll(`#${prefix}-src .pick`).forEach(x => x.setAttribute('aria-pressed', x === b));
    el.querySelector(`#${prefix}-file-f`).hidden = b.dataset.src !== 'file';
    el.querySelector(`#${prefix}-url-f`).hidden = b.dataset.src !== 'link';
  });
  const choose = file => {
    if (!file) return;
    if (file.size > FILE_MAX) { toast(`${file.name} passa de 20 MB. Redueix-lo o penja’n un enllaç.`); return; }
    if (groupFileBytes() + file.size > fileQuotaMB() * 1048576) { toast(`No hi cap: l’agrupació ja fa servir ${fmtSize(groupFileBytes())} dels ${fileQuotaMB()} MB. Esborra’n algun de vell o penja’n un enllaç.`); return; }
    picked = file;
    drop.querySelector('.dz-t').textContent = file.name;
    drop.querySelector('.dz-s').textContent = `${fileKind(file)} · ${fmtSize(file.size)} · a punt per pujar`;
    drop.classList.add('ready');
    onPick?.(file);
  };
  input.onchange = () => choose(input.files && input.files[0]);
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer?.files?.[0]); });
  return {
    mode: () => el.querySelector(`#${prefix}-src .pick[aria-pressed="true"]`).dataset.src,
    picked: () => picked,
    url: () => el.querySelector(`#${prefix}-url`).value.trim(),
  };
}
/** Resolve the source on save: uploads when needed. Returns { url, file } or null if it could not. */
async function resolveSource(src, previous, btn) {
  if (src.mode() === 'link') {
    const url = src.url();
    if (!/^https?:\/\//i.test(url)) { toast('L’enllaç ha de començar per https://'); return null; }
    return { url, file: null };
  }
  const f = src.picked();
  if (!f) {
    if (previous?.file) return { url: '', file: previous.file };
    toast('Tria un fitxer'); return null;
  }
  if (!navigator.onLine) { toast('Cal connexió per pujar el fitxer'); return null; }
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const file = await uploadFile(f, (i, n) => { btn.textContent = n > 1 ? `Pujant ${i} de ${n}…` : 'Pujant…'; });
    return { url: '', file };
  } catch {
    toast('No s’ha pogut pujar el fitxer. Torna-ho a provar.');
    return null;
  } finally { btn.disabled = false; btn.textContent = label; }
}
const itemLink = (x, act) => x.file
  ? `<button class="mat-link" ${act}>${esc(x.title)}</button>`
  : `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`;
const fileNote = x => x.file ? `${fileKind(x.file)} · ${fmtSize(x.file.size)}` : '';

/* ---------- Documents de l'agrupació (per a tota la temporada, fora de les produccions) ---------- */
const DOC_KINDS = { normativa: ['Normativa', 'Norm'], calendari: ['Calendari', 'Cal'], formulari: ['Formulari', 'Form'], altres: ['Altres', 'Doc'] };
const choirDocs = () => [...(S.config.documents || [])]
  .sort((a, b) => Object.keys(DOC_KINDS).indexOf(a.kind) - Object.keys(DOC_KINDS).indexOf(b.kind) || a.title.localeCompare(b.title, 'ca'));
function boardDocuments() {
  const docs = choirDocs();
  const tools = canEdit()
    ? `<div class="sec-h" style="margin-top:6px"><span class="muted" style="font-size:13px">Normativa, calendari de la temporada, formularis…</span><button class="btn btn-sm btn-primary" data-act="doc-new">+ Document</button></div>`
    : '';
  const row = d => `<div class="mat"><span class="mat-k doc-${esc(d.kind)}">${DOC_KINDS[d.kind]?.[1] || 'Doc'}</span>
      <span class="mat-i">${itemLink(d, `data-act="file-open" data-src="doc" data-id="${esc(d.id)}"`)}<small>${[DOC_KINDS[d.kind]?.[0], d.note, fileNote(d)].filter(Boolean).map(esc).join(' · ')}</small></span>
      ${canEdit() ? `<button class="icon-btn" data-act="doc-edit" data-id="${esc(d.id)}" aria-label="Edita el document">${ICON.more}</button>` : ''}</div>`;
  return tools + (docs.length
    ? `<div class="panel">${docs.map(row).join('')}</div>`
    : `<div class="empty"><p>Encara no hi ha cap document.${canEdit() ? ' Afegeix-hi la normativa o el calendari de la temporada.' : ''}</p></div>`);
}
function sheetDocument(id) {
  const ex = id ? (S.config.documents || []).find(d => d.id === id) : null;
  const d = ex ? { ...ex } : { id: uid('d'), title: '', url: '', kind: 'normativa', note: '' };
  openSheet({
    title: ex ? 'Edita el document' : 'Nou document',
    body: `<div class="kv">
      ${sourceFields('dc', d)}
      <label class="field"><span>Títol</span><input class="inp" id="dc-title" maxlength="90" value="${esc(d.title)}" placeholder="p. ex. Normativa ${esc(S.config.shortName || S.config.name || '')} ${esc(seasonCfg().season.name.replace(/^Temporada /, ''))}"></label>
      <div class="field"><span>Tipus</span><div class="pickers" id="dc-kind">${Object.entries(DOC_KINDS).map(([k, [l]]) => `<button type="button" class="pick" data-k="${k}" aria-pressed="${d.kind === k}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Nota (opcional)</span><input class="inp" id="dc-note" maxlength="80" value="${esc(d.note || '')}" placeholder="p. ex. Actualitzada al setembre"></label>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="dc-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="dc-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#dc-kind .pick').forEach(b => b.onclick = () => el.querySelectorAll('#dc-kind .pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      const title = el.querySelector('#dc-title');
      const src = bindSource(el, 'dc', f => { if (!title.value.trim()) title.value = titleFromFile(f.name); });
      el.querySelector('#dc-save').onclick = async e => {
        if (!title.value.trim() && !src.picked()) { toast('Posa un títol'); return; }
        const got = await resolveSource(src, d, e.currentTarget);
        if (!got) return;
        const rec = { id: d.id, title: title.value.trim() || titleFromFile(got.file?.name || ''), url: got.url, kind: el.querySelector('#dc-kind .pick[aria-pressed="true"]').dataset.k, note: el.querySelector('#dc-note').value.trim(),
          at: d.at || new Date().toISOString(), by: d.by || S.me?.email || '' };
        if (got.file) rec.file = got.file;
        if (d.file && d.file.id !== got.file?.id) deleteFile(d.file);
        saveConfig({ documents: [...(S.config.documents || []).filter(x => x.id !== rec.id), rec] });
        closeSheet(); toast(got.file && got.file !== d.file ? 'Fitxer pujat i desat' : ex ? 'Document desat' : 'Document afegit'); render();
      };
      el.querySelector('#dc-del')?.addEventListener('click', async () => {
        if (!await confirmSheet('Esborrar el document?', esc(d.title), 'Esborra')) return;
        saveConfig({ documents: (S.config.documents || []).filter(x => x.id !== d.id) });
        deleteFile(d.file); render();
      });
    },
  });
}

function pollExpected(p) {
  return membersOf(null).filter(m => !p.sections?.length || p.sections.includes(m.section));
}
function pollResults(p) {
  const counts = Object.fromEntries((p.options || []).map(o => [o.id, 0]));
  let voters = 0;
  for (const v of S.pollVotes.values()) {
    if (v.pollId !== p.id) continue;
    voters++;
    for (const c of v.choices || []) if (c in counts) counts[c]++;
  }
  return { counts, voters, expected: pollExpected(p).length };
}
function boardPolls() {
  const all = [...S.polls.values()].filter(forMe).sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const card = p => {
    const closed = p.closed || (p.closesAt && p.closesAt < TODAY);
    const meta = `<div class="ann-m">${closed ? '<span class="st-pill st-rejected">Tancada</span>' : '<span class="st-pill st-accepted">Oberta</span>'}${p.closesAt ? `<span>Fins al ${ddmm(p.closesAt)}</span>` : ''}${p.sections?.length ? `<span>Per a: ${esc(p.sections.map(x => SEC[x].name).join(', '))}</span>` : ''}<span>${p.multi ? 'Pots triar-ne diverses' : 'Una opció'}</span></div>`;
    if (canEdit()) {
      const r = pollResults(p);
      const max = Math.max(1, ...Object.values(r.counts));
      return `<div class="poll"><div class="ann-h"><h2 class="ann-t">${esc(p.title)}</h2><button class="icon-btn" data-act="poll-edit" data-id="${p.id}" aria-label="Edita">${ICON.more}</button></div>
        ${p.description ? `<div class="ann-b">${linkify(p.description)}</div>` : ''}${meta}
        ${(p.options || []).map(o => `<div class="opt-row ${r.counts[o.id] === max && max > 0 ? 'best' : ''}"><span></span><span>${esc(o.label)}</span><span class="n">${r.counts[o.id]}</span><span class="opt-bar"><span style="width:${(r.counts[o.id] / Math.max(1, r.voters)) * 100}%"></span></span></div>`).join('')}
        <div class="c-a" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="muted" style="font-size:13px">${r.voters} de ${r.expected} han respost</span>
          <button class="btn btn-sm" data-act="poll-results" data-id="${p.id}">Qui ha votat</button>${closed ? '' : `<button class="btn btn-sm" data-act="poll-remind" data-id="${p.id}">Recorda-ho</button>`}</div></div>`;
    }
    const canVote = !!myId() && !closed;
    const mine = S.pollVotes.get(`${p.id}_${myId()}`);
    const chosen = new Set(mine?.choices || []);
    return `<div class="poll" data-poll="${p.id}"><h2 class="ann-t">${esc(p.title)}</h2>
      ${p.description ? `<div class="ann-b">${linkify(p.description)}</div>` : ''}${meta}
      ${(p.options || []).map(o => `<label class="opt-row"><input type="${p.multi ? 'checkbox' : 'radio'}" name="poll-${p.id}" value="${o.id}" ${chosen.has(o.id) ? 'checked' : ''} ${canVote ? '' : 'disabled'}><span>${esc(o.label)}</span><span></span></label>`).join('')}
      ${canVote ? `<div class="c-a" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-sm btn-primary" data-act="poll-vote" data-id="${p.id}">${mine ? 'Actualitza la resposta' : 'Envia la resposta'}</button>${mine ? '<span class="rsvp yes">Resposta desada</span>' : ''}</div>` : ''}</div>`;
  };
  return `${canEdit() ? '<div class="sec-h" style="margin-top:6px"><span class="muted" style="font-size:13px">Per saber quan pot venir la gent.</span><button class="btn btn-sm btn-primary" data-act="poll-new">+ Enquesta</button></div>' : ''}
    ${all.length ? `<div class="panel">${all.map(card).join('')}</div>` : '<div class="empty"><p>No hi ha enquestes.</p></div>'}`;
}
