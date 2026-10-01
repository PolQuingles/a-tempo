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
const canDocs = () => DOCS_READ.some(iHave);
const canDocsWrite = () => DOCS_WRITE.some(iHave);
const DOC_ITEMS = [['imatge', 'Drets d’imatge', 'Fotos i vídeos dels concerts i les activitats'], ['dades', 'Protecció de dades', 'Consentiment per tractar les dades personals'], ['autoritzacio', 'Autoritzacions', 'Menors d’edat, sortides i altres permisos']];
const FEE_METHODS = ['Transferència', 'Bizum', 'Efectiu', 'Rebut domiciliat'];
const feeKey = () => { const s = seasonCfg().season; return `${s.from.slice(0, 4)}-${s.to.slice(2, 4)}`; };
const feeAmount = () => +S.config.feeAmount || 0;
/** La quota es pot desactivar a Ajustos (el Cor Jove no en té): llavors no en surt res enlloc. Per defecte, activada. */
const feesOn = () => S.config.feesOn !== false;
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

/* ---------- Documents per persona ---------- */
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

/* ---------- La plantilla: cada persona, amb tota la seva informació ---------- */
// Abans eren quatre llistes (Plantilla, Altes i baixes, Documents i Quotes). Ara n'és una: el resum de la temporada a dalt,
// uns filtres i, en tocar una persona, se'n desplega tot (dades, la seva fitxa, l'historial, els documents i la quota).
const PM_OPEN = new Set();
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d instanceof HTMLDetailsElement && d.classList.contains('pm')) { if (d.open) PM_OPEN.add(d.dataset.mid); else PM_OPEN.delete(d.dataset.mid); }
}, true);
const PM_FILTERS = () => [['all', 'Tothom'], ['moves', 'Altes i baixes'], ...(canDocs() ? [['docs', 'Documents pendents'], ...(feesOn() ? [['fees', 'Quota pendent']] : [])] : []), ...(isAdmin() ? [['access', 'Sense accés']] : [])];
const seasonMoves = m => { const { season } = seasonCfg(); return (m.history || []).filter(h => h.date >= season.from && h.date <= season.to); };
const feeOf = m => docsOf(m.id).fees?.[feeKey()] || {};
const docsPending = m => DOC_ITEMS.some(([k]) => !docState(m.id, k).v);
function pmMatch(m, f) {
  const on = m.active !== false;
  if (f === 'moves') return seasonMoves(m).length > 0;
  if (f === 'docs') return on && !!S.memberDocs && docsPending(m);
  if (f === 'fees') return on && !!S.memberDocs && !feeOf(m).paid;
  if (f === 'access') return on && !accountFor(m.id);
  return true;
}
function plantillaSummary(all) {
  const { season } = seasonCfg();
  const active = all.filter(m => m.active !== false);
  const ev = all.flatMap(seasonMoves);
  const ups = ev.filter(e => e.kind !== 'baixa').length, downs = ev.length - ups;
  const lines = [`<b>${active.length}</b> en actiu · ${ups} ${ups === 1 ? 'alta' : 'altes'} i ${downs} ${downs === 1 ? 'baixa' : 'baixes'} (${esc(season.name.toLowerCase())})`];
  if (canDocs()) {
    if (!S.memberDocs) lines.push('<span class="muted">Carregant els documents i les quotes…</span>');
    else {
      const paid = active.filter(m => feeOf(m).paid), total = paid.reduce((n, m) => n + (+feeOf(m).amount || 0), 0);
      if (feesOn()) lines.push(`Quota ${esc(feeKey())}: <b>${paid.length} de ${active.length}</b> han pagat · ${euros(total)}${feeAmount() ? ` de ${euros(feeAmount() * active.length)}` : ''}`);
      const noImg = active.filter(m => docState(m.id, 'imatge').v === 'no');
      lines.push(noImg.length ? `No poden sortir a fotos: <b>${esc(noImg.map(m => fullName(m.name)).join(', '))}</b> <button class="linkish" data-act="docs-copy-noimg">Copia la llista</button>` : 'Ningú no ha dit que no pugui sortir a fotos ni vídeos.');
    }
  }
  return `<div class="panel pm-sum">${lines.map(l => `<p>${l}</p>`).join('')}
    <div class="pm-tools">${canDocsWrite() && feesOn() ? `<label class="pm-fee"><span>Quota</span><input class="inp" id="fee-amount" type="number" min="0" step="1" inputmode="decimal" value="${feeAmount() || ''}" data-bind="fee-amount"> €</label>` : ''}
      <button class="btn btn-sm" data-act="roster-export">Exporta a Excel</button></div></div>`;
}
/** Tot el que se sap d'una persona, per desplegar-ho a la plantilla. */
function memberCard(m) {
  const p = profileOf(m.id), off = m.active === false;
  const acc = isAdmin() ? accountFor(m.id) : null;
  const phone = phoneOf(m);
  const rows = [
    [capz(V.section), `${esc(SEC[m.section].name)}${m.part ? ` · ${esc(V.part)} ${esc(m.part)}` : ''}${m.leader ? ` · ${esc(V.leader)}` : ''}`],
    ['Estat', off ? 'Inactiu' : leaveText(m) || 'Actiu'],
    ['Alta', m.joined ? `${esc(ddmm(m.joined))}/${m.joined.slice(0, 4)} · ${esc(seniority(m))}` : 'Sense data d’alta'],
    ['Telèfon', phone ? `<a href="tel:${esc(phone.replace(/\s/g, ''))}">${esc(phone)}</a>` : ''],
    isAdmin() && !off ? ['Accés a l’app', acc ? `${esc(acc.email)}${acc.lastSeen ? '' : ' · encara no ha entrat'}` : 'Sense accés'] : null,
    ['Talla', esc(p.size || '')], ['Emergència', esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '))], ['Al·lèrgies', esc(p.diet || '')],
    ['Notes', esc(m.notes || '')],
  ].filter(r => r && r[1]);
  const hist = (m.history || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const docs = canDocs() && S.memberDocs;
  const fee = docs && feesOn() ? feeOf(m) : null;
  const w = canDocsWrite();
  const acts = [
    canEdit() ? `<button class="btn btn-sm" data-act="member-edit" data-mid="${m.id}">Edita la fitxa</button>` : '',
    w ? `<button class="btn btn-sm" data-act="member-docs" data-mid="${m.id}">Documents</button>${feesOn() ? `<button class="btn btn-sm" data-act="fee-edit" data-mid="${m.id}">Quota</button>` : ''}` : '',
    w && fee && !fee.paid && !off ? `<button class="btn btn-sm btn-soft" data-act="fee-paid" data-mid="${m.id}">Marca la quota pagada</button>` : '',
    !off ? `<button class="btn btn-sm" data-act="member-stats" data-mid="${m.id}">Assistència</button>` : '',
    !off && canWriteTo() && writableMembers().some(x => x.id === m.id) ? `<button class="btn btn-sm" data-act="thread-to" data-mid="${m.id}">Escriu-li</button>` : '',
  ].filter(Boolean).join('');
  return `<dl class="fitxa">${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${docs ? `<div class="pm-box"><b>${fee ? 'Documents i quota' : 'Documents'}</b><div class="pm-docs">${DOC_ITEMS.map(([k, l]) => `<span class="dp-i"><small>${esc(l)}</small>${docPill(docState(m.id, k))}</span>`).join('')}
      ${fee ? `<span class="dp-i"><small>Quota ${esc(feeKey())}</small><span class="dp ${fee.paid ? 'ok' : ''}">${fee.paid ? 'Pagada' : 'Pendent'}</span></span>` : ''}</div>
      ${!fee ? '' : fee.paid && (fee.date || fee.method) ? `<p class="pm-note">Quota pagada${fee.date ? ` el ${esc(ddmm(fee.date))}` : ''}${fee.amount ? ` · ${euros(fee.amount)}` : ''}${fee.method ? ` · ${esc(fee.method)}` : ''}</p>` : fee.note ? `<p class="pm-note">${esc(fee.note)}</p>` : ''}</div>` : ''}
    ${hist.length ? `<div class="pm-box"><b>Altes i baixes</b><ul class="pm-hist">${hist.map(h => `<li><span class="hist-k ${h.kind}">${HIST_WORD[h.kind] || esc(h.kind)}</span> ${esc(ddmm(h.date))}/${h.date.slice(2, 4)}${h.note ? ` · ${esc(h.note)}` : ''}</li>`).join('')}</ul></div>` : ''}
    ${acts ? `<div class="pm-acts">${acts}</div>` : ''}`;
}
function pmRow(m, f) {
  const off = m.active === false;
  const acc = isAdmin() && !off ? accountFor(m.id) : null;
  const docs = canDocs() && S.memberDocs && !off;
  // A la fila, només el que diu el filtre triat (a «Tothom», l'accés): la resta és dins, en desplegar-la.
  const short = { imatge: 'Imatge', dades: 'Dades', autoritzacio: 'Autorització' };
  const tags = [
    isAdmin() && !off && (f === 'all' || f === 'access') ? (!acc ? '<span class="acc-tag">Sense accés</span>' : !acc.lastSeen ? '<span class="acc-tag">No ha entrat</span>' : '') : '',
    docs && f === 'docs' ? DOC_ITEMS.filter(([k]) => !docState(m.id, k).v).map(([k]) => `<span class="dp">${short[k]}</span>`).join('') : '',
    docs && f === 'fees' && feesOn() ? `<span class="dp">${feeAmount() ? euros(feeAmount()) : 'Pendent'}</span>` : '',
  ].filter(Boolean).join('');
  const sub = off ? 'Inactiu' : f === 'moves' ? seasonMoves(m).map(h => `${HIST_WORD[h.kind] || esc(h.kind)} ${esc(ddmm(h.date))}${h.note ? ` · ${esc(h.note)}` : ''}`).join(' · ') : leaveText(m) || esc(phoneOf(m));
  return `<details class="pm" data-mid="${m.id}" data-find="${esc(normText(m.name))}"${PM_OPEN.has(m.id) ? ' open' : ''}>
    <summary>${avatar(m)}<span class="pm-n${off ? ' dim' : ''}"><span class="t">${esc(m.name)}</span>${m.part ? ` <span class="part">${esc(partTag(m))}</span>` : ''}${m.leader ? ` <span class="tag">${V.Leader}</span>` : ''}${sub ? `<span class="s">${sub}</span>` : ''}</span>
      ${tags ? `<span class="pm-tags">${tags}</span>` : ''}${ICON.chev}</summary>
    <div class="pm-b">${memberCard(m)}</div></details>`;
}
function managePlantilla() {
  // Les fitxes (talla, emergència…), els documents i les quotes es llegeixen un sol cop, en obrir la plantilla.
  if (canEdit() && (!S.profiles || (canDocs() && !S.memberDocs))) ensureSecData();
  if (!PM_FILTERS().some(([k]) => k === ui.pmFilter)) ui.pmFilter = 'all';
  const f = ui.pmFilter;
  const all = membersOf(null, true);
  const chips = `<div class="chips pm-chips" role="group" aria-label="Filtra la plantilla">${PM_FILTERS().map(([k, l]) => {
    const n = k === 'all' ? all.filter(m => m.active !== false).length : all.filter(m => pmMatch(m, k)).length;
    return `<button class="chip" aria-pressed="${f === k}" data-act="pm-filter" data-k="${k}">${l} <span class="m">${n}</span></button>`;
  }).join('')}</div>`;
  const secs = SECTIONS.map(x => {
    const ms = membersOf(x.id, true).filter(m => pmMatch(m, f));
    if (f !== 'all' && !ms.length) return '';
    const active = ms.filter(m => m.active !== false).length;
    return `<section data-group="${x.id}"><div class="sec-h"><h2 class="h2"><em>${esc(x.short)}</em>${esc(x.name)} <span class="mono muted" style="font-size:calc(13px*var(--ts));font-weight:400">${active}</span></h2>
      ${f === 'all' ? `<button class="btn btn-sm btn-ghost" data-act="member-new" data-sec="${x.id}">Afegeix</button>` : ''}</div>
      ${ms.length ? `<div class="list pm-list">${ms.map(m => pmRow(m, f)).join('')}</div>`
        : `<div class="panel" style="padding:14px;color:var(--muted);font-size:calc(13.5px*var(--ts))">Encara no hi ha ningú en aquesta ${V.section}.</div>`}</section>`;
  }).join('');
  return `${onboardingPanel()}${plantillaSummary(all)}${chips}
    <div id="mlist">${findBox('#mlist', `Cerca un ${V.member}`)}${secs || '<div class="panel" style="padding:14px;color:var(--muted)">Ningú no hi correspon.</div>'}<div class="panel find-empty" hidden>Ningú amb aquest nom.</div></div>`;
}

/* ---------- La plantilla a Excel ---------- */
async function exportRoster() {
  await Promise.all([loadProfiles(), canDocs() ? loadMemberDocs() : null]);
  const key = feeKey(), docs = canDocs(), fees = docs && feesOn();
  const head = ['Nom i cognoms', capz(V.section), capz(V.part), capz(V.leader), 'Estat', 'Data d’alta', 'Antiguitat', 'Correu', 'Telèfon', 'Talla', 'Contacte d’emergència',
    ...(docs ? ['Drets d’imatge', 'Protecció de dades', 'Autoritzacions'] : []), ...(fees ? [`Quota ${key}`] : [])];
  const word = v => v === 'yes' ? 'Sí' : v === 'no' ? 'No' : 'Pendent';
  const rows = membersOf(null, true).sort((a, b) => secIdx(a.section) - secIdx(b.section) || byName(a, b)).map(m => {
    const p = profileOf(m.id), f = docsOf(m.id).fees?.[key];
    return [fullName(m.name), SEC[m.section].name, m.part || '', m.leader ? 'Sí' : '', m.active === false ? 'Inactiu' : leaveText(m) || 'Actiu', m.joined || '', seniority(m), accountFor(m.id)?.email || '', phoneOf(m), p.size || '',
      [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '),
      ...(docs ? DOC_ITEMS.map(([k]) => word(docState(m.id, k).v)) : []), ...(fees ? [f?.paid ? `Pagada${f.date ? ` ${f.date}` : ''}${f.amount ? ` (${f.amount} €)` : ''}` : 'Pendent'] : [])];
  });
  offerCSV(`plantilla-${S.config.shortName || S.config.name || ''}-${TODAY}`, [head, ...rows]);
}
