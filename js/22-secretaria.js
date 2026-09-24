// A Tempo · 22-secretaria.js — Secretaria: altes i baixes (amb l'antiguitat de cadascú), documents per persona (drets
// d'imatge, protecció de dades i autoritzacions), registre de quotes i la plantilla exportada a Excel.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

// memberDocs/<membre> = { memberId, docs: { imatge|dades|autoritzacio: { v: 'yes'|'no'|'', at, file? } },
//   fees: { '2026-27': { paid, amount, date, method, note } }, updatedAt, by }. El llegeixen l'administració, la
// secretaria, la gerència, la direcció i la mateixa persona; l'escriuen l'administració, la secretaria i la gerència.
// Els documents signats es pugen a memberFiles (a trossos, amb memberId), igual de privats.
const DOCS_READ = ['admin', 'secretaria', 'gerencia', 'director'];
const DOCS_WRITE = ['admin', 'secretaria', 'gerencia'];
const canDocs = () => !PREVIEW && DOCS_READ.some(r => hasRole(S.me, r));
const canDocsWrite = () => !PREVIEW && DOCS_WRITE.some(r => hasRole(S.me, r));
const DOC_ITEMS = [['imatge', 'Drets d’imatge', 'Fotos i vídeos dels concerts i les activitats'], ['dades', 'Protecció de dades', 'Consentiment per tractar les dades personals'], ['autoritzacio', 'Autoritzacions', 'Menors d’edat, sortides i altres permisos']];
const FEE_METHODS = ['Transferència', 'Bizum', 'Efectiu', 'Rebut domiciliat'];
const feeKey = () => { const s = seasonCfg().season; return `${s.from.slice(0, 4)}-${s.to.slice(2, 4)}`; };
const feeAmount = () => +S.config.feeAmount || 0;
const euros = n => `${(+n || 0).toLocaleString('ca', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
async function loadMemberDocs() {
  if (!canDocs()) return new Map();
  try { const snap = await db.collection('memberDocs').get(); S.memberDocs = new Map(snap.docs.map(d => [d.id, d.data()])); }
  catch { S.memberDocs = S.memberDocs || new Map(); }
  return S.memberDocs;
}
let secLoad = null;
/** Documents, quotes i fitxes: es llegeixen un sol cop, quan s'obre algun d'aquests apartats. */
function ensureSecData() {
  if (!secLoad) secLoad = Promise.all([loadMemberDocs(), loadProfiles()]).then(() => { if (S.ready) render(); });
  return secLoad;
}
const docsOf = mid => (S.memberDocs && S.memberDocs.get(mid)) || { memberId: mid, docs: {}, fees: {} };
/** L'estat d'un document: el que hi ha posat la secretaria o, si no, el que la persona ha dit a «La meva fitxa». */
function docState(mid, k) {
  const d = docsOf(mid).docs?.[k];
  if (d && d.v) return { v: d.v, at: d.at, file: d.file, self: false };
  const p = profileOf(mid);
  const self = k === 'imatge' ? p.imageOk : k === 'dades' ? p.dataOk : '';
  return self ? { v: self, at: p.consentAt, self: true } : { v: '' };
}
const docPill = st => st.v === 'yes' ? '<span class="dp ok">Sí</span>' : st.v === 'no' ? '<span class="dp no">No</span>' : '<span class="dp">Pendent</span>';
async function saveMemberDocs(rec) {
  const out = { ...rec, updatedAt: new Date().toISOString(), by: S.email || '' };
  await db.doc(`memberDocs/${rec.memberId}`).set(out);
  (S.memberDocs = S.memberDocs || new Map()).set(rec.memberId, out);
}

/* ---------- Altes i baixes ---------- */
// members.joined = data d'alta; members.history = [{ date, kind: 'alta' | 'baixa' | 'retorn', note }].
function seniority(m, until = TODAY) {
  if (!m.joined) return '';
  const a = new Date(m.joined + 'T12:00:00'), b = new Date(until + 'T12:00:00');
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
  if (months < 1) return 'menys d’un mes';
  const y = Math.floor(months / 12), mo = months % 12;
  return [y ? `${y} ${y === 1 ? 'any' : 'anys'}` : '', mo ? `${mo} ${mo === 1 ? 'mes' : 'mesos'}` : ''].filter(Boolean).join(' i ');
}
const HIST_WORD = { alta: 'Alta', baixa: 'Baixa', retorn: 'Torna' };
function manageHistory() {
  const { season } = seasonCfg();
  const all = membersOf(null, true);
  const events = all.flatMap(m => (m.history || []).map(h => ({ ...h, m }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const inSeason = events.filter(e => e.date >= season.from && e.date <= season.to);
  const active = all.filter(m => m.active !== false).sort((a, b) => (a.joined || '9999').localeCompare(b.joined || '9999') || byName(a, b));
  const noDate = active.filter(m => !m.joined).length;
  return `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-top:4px">
      <div class="kpi"><div class="kpi-v">${active.length}</div><div class="kpi-l">En actiu</div></div>
      <div class="kpi"><div class="kpi-v">${inSeason.filter(e => e.kind !== 'baixa').length}</div><div class="kpi-l">Altes aquesta temporada</div></div>
      <div class="kpi"><div class="kpi-v">${inSeason.filter(e => e.kind === 'baixa').length}</div><div class="kpi-l">Baixes aquesta temporada</div></div></div>
    <div class="sec-h" style="margin-top:10px"><span class="muted" style="font-size:calc(13px*var(--ts))">L’alta i la baixa es posen a la fitxa de cada persona (en desactivar-la, se’n demana la data i el motiu).</span><button class="btn btn-sm" data-act="roster-export">Exporta la plantilla a Excel</button></div>
    <div class="section-title"><h2 class="h2">Moviments</h2><span class="eyebrow">${esc(season.name)}</span></div>
    ${inSeason.length ? `<ul class="list">${inSeason.map(e => `<li class="li"><button data-act="member-edit" data-mid="${e.m.id}"><span><span class="hist-k ${e.kind}">${HIST_WORD[e.kind] || e.kind}</span> <span class="t">${esc(e.m.name)}</span><br><span class="s">${esc(ddmm(e.date))}/${e.date.slice(2, 4)} · ${esc(SEC[e.m.section].name)}${e.note ? ` · ${esc(e.note)}` : ''}</span></span></button></li>`).join('')}</ul>`
      : '<p class="muted" style="margin:0 2px;font-size:calc(13px*var(--ts))">Aquesta temporada encara no hi ha hagut cap alta ni cap baixa.</p>'}
    <div class="section-title"><h2 class="h2">Antiguitat</h2><span class="eyebrow">${noDate ? `${noDate} sense data d’alta` : 'de més a menys'}</span></div>
    <ul class="list">${active.map(m => `<li class="li"><button data-act="member-edit" data-mid="${m.id}"><span><span class="t">${esc(m.name)}</span> <span class="part">${esc(partTag(m) || SEC[m.section].short)}</span><br><span class="s">${m.joined ? `Des del ${esc(ddmm(m.joined))}/${m.joined.slice(0, 4)} · ${esc(seniority(m))}` : 'Sense data d’alta'}</span></span></button></li>`).join('')}</ul>
    ${events.length > inSeason.length ? `<details class="np-group"><summary><span>Moviments d’altres temporades (${events.length - inSeason.length})</span>${ICON.chev}</summary>
      <ul class="list">${events.filter(e => !inSeason.includes(e)).map(e => `<li class="li"><button data-act="member-edit" data-mid="${e.m.id}"><span><span class="hist-k ${e.kind}">${HIST_WORD[e.kind] || e.kind}</span> <span class="t">${esc(e.m.name)}</span><br><span class="s">${esc(ddmm(e.date))}/${e.date.slice(2, 4)}${e.note ? ` · ${esc(e.note)}` : ''}</span></span></button></li>`).join('')}</ul></details>` : ''}`;
}

/* ---------- Documents per persona ---------- */
function manageDocs() {
  if (!S.memberDocs) { ensureSecData(); return '<p class="muted" style="margin:10px 2px">Carregant els documents…</p>'; }
  const ms = membersOf(null);
  const noImg = ms.filter(m => docState(m.id, 'imatge').v === 'no');
  const pend = k => ms.filter(m => !docState(m.id, k).v).length;
  return `<div class="panel" style="padding:12px 14px;margin-top:4px">
      <b>No poden sortir a fotos ni vídeos</b> <span class="m">(${noImg.length})</span>
      <p style="margin:6px 0 0;font-size:calc(13.5px*var(--ts))">${noImg.length ? esc(noImg.map(m => fullName(m.name)).join(', ')) : 'Ningú no ha dit que no.'}</p>
      ${noImg.length ? '<button class="btn btn-sm" data-act="docs-copy-noimg" style="margin-top:8px">Copia la llista (per a qui fa les fotos)</button>' : ''}</div>
    <div class="sec-h" style="margin-top:10px"><span class="muted" style="font-size:calc(13px*var(--ts))">Pendents: ${DOC_ITEMS.map(([k, l]) => `${esc(l.toLowerCase())} ${pend(k)}`).join(' · ')}. Cadascú pot respondre els dos primers a «La meva fitxa».</span><button class="btn btn-sm" data-act="docs-export">Excel</button></div>
    ${SECTIONS.map(x => {
      const rows = membersOf(x.id);
      if (!rows.length) return '';
      return `<div class="section-title"><h2 class="h2">${esc(x.name)}</h2></div><ul class="list">${rows.map(m => `<li class="li"><button ${canDocsWrite() ? `data-act="member-docs" data-mid="${m.id}"` : 'disabled'}>
        <span class="t">${esc(m.name)}</span><span class="dps">${DOC_ITEMS.map(([k, l]) => `<span class="dp-i" title="${esc(l)}"><small>${esc(l.split(' ')[0] === 'Drets' ? 'Imatge' : l.split(' ')[0] === 'Protecció' ? 'Dades' : 'Autor.')}</small>${docPill(docState(m.id, k))}</span>`).join('')}</span></button></li>`).join('')}</ul>`;
    }).join('')}`;
}
function sheetMemberDocs(mid) {
  const m = S.members.get(mid);
  if (!m) return;
  if (!S.memberDocs) { ensureSecData().then(() => sheetMemberDocs(mid)); return; }
  const rec = clone(docsOf(mid));
  rec.docs = rec.docs || {}; rec.fees = rec.fees || {};
  const picked = {}, drop = {};
  const row = ([k, l, hint]) => {
    const d = rec.docs[k] || {};
    const self = !d.v && docState(mid, k).self ? docState(mid, k) : null;
    return `<fieldset class="fieldset doc-f" data-k="${k}"><legend>${esc(l)}</legend>
      <small class="muted">${esc(hint)}${self ? ` · Ho ha dit ell/a mateix/a a l’app${self.at ? ` el ${ddmm(self.at.slice(0, 10))}` : ''}: <b>${self.v === 'yes' ? 'sí' : 'no'}</b>` : ''}</small>
      <div class="pickers">${[['yes', 'Sí'], ['no', 'No'], ['', 'Pendent']].map(([v, t]) => `<button type="button" class="pick" data-v="${v}" aria-pressed="${(d.v || '') === v}">${t}</button>`).join('')}</div>
      <label class="field"><span>Data</span><input class="inp" type="date" data-f="at" value="${esc((d.at || '').slice(0, 10))}" style="max-width:180px"></label>
      ${d.file ? `<div class="rec-cur" data-cur><span>${esc(d.file.name)} · ${fmtSize(d.file.size)}</span><span style="display:flex;gap:6px"><button type="button" class="btn btn-sm" data-open>Obre</button><button type="button" class="btn btn-sm btn-ghost" data-drop>Treu-lo</button></span></div>` : ''}
      <label class="dropzone" for="dc-file-${k}"><input id="dc-file-${k}" type="file" accept="application/pdf,image/*" class="sr" data-file>
        <span class="dz-t">${d.file ? 'Canvia el document signat' : 'Puja el document signat (opcional)'}</span><span class="dz-s">PDF o foto, fins a 20 MB. Només el veuen l’equip i ${esc(firstName(m.name))}.</span></label>
    </fieldset>`;
  };
  openSheet({
    title: `Documents · ${fullName(m.name)}`,
    wide: true,
    body: `<div class="kv">${DOC_ITEMS.map(row).join('')}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="dc-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('.doc-f').forEach(fs => {
        const k = fs.dataset.k;
        fs.querySelectorAll('.pick').forEach(b => b.onclick = () => fs.querySelectorAll('.pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
        const inp = fs.querySelector('[data-file]');
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; if (f.size > FILE_MAX) { toast('Passa de 20 MB'); inp.value = ''; return; } picked[k] = f; fs.querySelector('.dz-t').textContent = f.name; fs.querySelector('.dropzone').classList.add('ready'); };
        fs.querySelector('[data-drop]')?.addEventListener('click', () => { drop[k] = true; fs.querySelector('[data-cur]').remove(); });
        fs.querySelector('[data-open]')?.addEventListener('click', () => sheetOpenFile(rec.docs[k].file, `${DOC_ITEMS.find(x => x[0] === k)[1]} · ${fullName(m.name)}`));
      });
      el.querySelector('#dc-save').onclick = async e => {
        const btn = e.currentTarget, label = btn.textContent;
        btn.disabled = true;
        try {
          for (const fs of el.querySelectorAll('.doc-f')) {
            const k = fs.dataset.k, prev = rec.docs[k] || {};
            const next = { v: fs.querySelector('.pick[aria-pressed="true"]').dataset.v, at: fs.querySelector('[data-f="at"]').value || (fs.querySelector('.pick[aria-pressed="true"]').dataset.v ? TODAY : '') };
            let file = drop[k] ? null : prev.file || null;
            if (picked[k]) { btn.textContent = 'Pujant…'; file = await uploadFile(picked[k], null, { where: 'memberFiles', memberId: mid }); }
            if (prev.file && (!file || file.id !== prev.file.id)) deleteFile(prev.file);
            if (file) next.file = file;
            rec.docs[k] = next;
          }
          await saveMemberDocs(rec);
          closeSheet(); toast('Documents desats'); render();
        } catch { toast('No s’ha pogut desar. Comprova la connexió.'); btn.disabled = false; btn.textContent = label; }
      };
    },
  });
}

/* ---------- Quotes ---------- */
function manageFees() {
  if (!S.memberDocs) { ensureSecData(); return '<p class="muted" style="margin:10px 2px">Carregant les quotes…</p>'; }
  const key = feeKey(), ms = membersOf(null);
  const fee = m => docsOf(m.id).fees?.[key] || {};
  const paid = ms.filter(m => fee(m).paid);
  const total = paid.reduce((n, m) => n + (+fee(m).amount || 0), 0);
  return `<div class="panel" style="padding:12px 14px;margin-top:4px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between">
      <span><b>Temporada ${esc(key)}</b><br><span class="m">${paid.length} de ${ms.length} han pagat · ${euros(total)} recaptats${feeAmount() ? ` de ${euros(feeAmount() * ms.length)}` : ''}</span></span>
      ${canDocsWrite() ? `<label class="field" style="margin:0"><span>Quota</span><span style="display:flex;align-items:center;gap:6px"><input class="inp" id="fee-amount" type="number" min="0" step="1" inputmode="decimal" value="${feeAmount() || ''}" data-bind="fee-amount" style="width:90px;text-align:right"> €</span></label>` : ''}
      <button class="btn btn-sm" data-act="fees-export">Excel</button></div>
    ${SECTIONS.map(x => {
      const rows = membersOf(x.id);
      if (!rows.length) return '';
      return `<div class="section-title"><h2 class="h2">${esc(x.name)}</h2><span class="eyebrow">${rows.filter(m => fee(m).paid).length} de ${rows.length}</span></div>
        <ul class="list">${rows.map(m => { const f = fee(m); return `<li class="li fee-row"><button ${canDocsWrite() ? `data-act="fee-edit" data-mid="${m.id}"` : 'disabled'}>
          <span><span class="t">${esc(m.name)}</span><br><span class="s">${f.paid ? `Pagada${f.date ? ` el ${esc(ddmm(f.date))}` : ''}${f.amount ? ` · ${euros(f.amount)}` : ''}${f.method ? ` · ${esc(f.method)}` : ''}` : f.note ? esc(f.note) : `${euros(feeAmount())} per pagar`}</span></span>
          <span class="dp ${f.paid ? 'ok' : ''}">${f.paid ? 'Pagada' : 'Pendent'}</span></button>
          ${canDocsWrite() && !f.paid ? `<button class="btn btn-sm" data-act="fee-paid" data-mid="${m.id}">Marca-la pagada</button>` : ''}</li>`; }).join('')}</ul>`;
    }).join('')}`;
}
async function markFeePaid(mid) {
  const rec = clone(docsOf(mid)); rec.fees = rec.fees || {};
  rec.fees[feeKey()] = { paid: true, amount: feeAmount(), date: TODAY, method: '', note: '' };
  try { await saveMemberDocs(rec); toast('Quota marcada com a pagada'); render(); } catch { toast('No s’ha pogut desar'); }
}
function sheetFee(mid) {
  const m = S.members.get(mid);
  if (!m) return;
  const rec = clone(docsOf(mid)); rec.fees = rec.fees || {};
  const f = rec.fees[feeKey()] || { paid: false, amount: feeAmount(), date: '', method: '', note: '' };
  openSheet({
    title: `Quota ${feeKey()} · ${fullName(m.name)}`,
    body: `<div class="kv">
      <div class="toggle-row"><span><b>Pagada</b></span><label class="switch"><input type="checkbox" id="fe-paid" ${f.paid ? 'checked' : ''}><span></span></label></div>
      <div class="row2"><label class="field"><span>Import</span><input class="inp" id="fe-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(String(f.amount ?? ''))}"></label>
        <label class="field"><span>Data</span><input class="inp" id="fe-date" type="date" value="${esc(f.date || '')}"></label></div>
      <div class="field"><span>Com</span><div class="pickers" id="fe-method">${FEE_METHODS.map(x => `<button type="button" class="pick" data-k="${esc(x)}" aria-pressed="${f.method === x}">${esc(x)}</button>`).join('')}</div></div>
      <label class="field"><span>Nota</span><input class="inp" id="fe-note" maxlength="120" value="${esc(f.note || '')}" placeholder="p. ex. Beca · paga en dues vegades"></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="fe-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#fe-method .pick').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; el.querySelectorAll('#fe-method .pick').forEach(x => x.setAttribute('aria-pressed', on && x === b)); });
      el.querySelector('#fe-paid').onchange = e => { if (e.target.checked && !el.querySelector('#fe-date').value) el.querySelector('#fe-date').value = TODAY; };
      el.querySelector('#fe-save').onclick = async () => {
        rec.fees[feeKey()] = { paid: el.querySelector('#fe-paid').checked, amount: +el.querySelector('#fe-amount').value || 0, date: el.querySelector('#fe-date').value,
          method: el.querySelector('#fe-method .pick[aria-pressed="true"]')?.dataset.k || '', note: el.querySelector('#fe-note').value.trim() };
        try { await saveMemberDocs(rec); closeSheet(); toast('Quota desada'); render(); } catch { toast('No s’ha pogut desar'); }
      };
    },
  });
}

/* ---------- La plantilla a Excel ---------- */
async function exportRoster() {
  await Promise.all([loadProfiles(), canDocs() ? loadMemberDocs() : null]);
  const key = feeKey(), docs = canDocs();
  const head = ['Nom i cognoms', capz(V.section), capz(V.part), capz(V.leader), 'Estat', 'Data d’alta', 'Antiguitat', 'Correu', 'Telèfon', 'Talla', 'Contacte d’emergència',
    ...(docs ? ['Drets d’imatge', 'Protecció de dades', 'Autoritzacions', `Quota ${key}`] : [])];
  const word = v => v === 'yes' ? 'Sí' : v === 'no' ? 'No' : 'Pendent';
  const rows = membersOf(null, true).sort((a, b) => secIdx(a.section) - secIdx(b.section) || byName(a, b)).map(m => {
    const p = profileOf(m.id), f = docsOf(m.id).fees?.[key];
    return [fullName(m.name), SEC[m.section].name, m.part || '', m.leader ? 'Sí' : '', m.active === false ? 'Inactiu' : leaveText(m) || 'Actiu', m.joined || '', seniority(m), accountFor(m.id)?.email || '', phoneOf(m), p.size || '',
      [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '),
      ...(docs ? [...DOC_ITEMS.map(([k]) => word(docState(m.id, k).v)), f?.paid ? `Pagada${f.date ? ` ${f.date}` : ''}${f.amount ? ` (${f.amount} €)` : ''}` : 'Pendent'] : [])];
  });
  offerCSV(`plantilla-${S.config.shortName || S.config.name || ''}-${TODAY}`, [head, ...rows]);
}
