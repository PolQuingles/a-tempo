// A Tempo · 20b-vestidor.js — El vestidor: cada cantaire demana el seu vestuari (americana, estola…) amb la talla i en
// segueix l'estat (demanat, encarregat, pendent d'emprovar, entregat…); la secretaria ho porta tot des de la mateixa pantalla.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

// wardrobe/<id> = { id, memberId, memberName, section, item, size, status, note, history: [{ s, at, by }], createdAt, updatedAt, by }
// Una peça per document. La persona demana la seva (estat «demanat») i, mentre ningú no l'ha encarregada, en pot canviar
// la talla o anul·lar-la; la resta (encarregar, emprovar, entregar…) la fan la secretaria, la gerència i l'administració.
// config/main.wardrobe = { on, items: [{ id, name, sizes: [...] }] }: s'activa i es trien les peces a Ajustos › Vestidor.
S.wardrobe = new Map();
const WARD_ROLES = ['admin', 'secretaria', 'gerencia'];
const wardOn = () => !!S.config.wardrobe?.on;
/** Porta el vestidor de tothom (no només el seu). */
const wardStaff = () => S.role === 'edit' && WARD_ROLES.some(iHave);
const WARD_DEFAULT = [
  { id: 'americana', name: 'Americana', sizes: ['44', '46', '48', '50', '52', '54', '56', '58', '60', '62'] },
  { id: 'estola', name: 'Estola', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
];
const wardItems = () => { const l = S.config.wardrobe?.items; return Array.isArray(l) && l.length ? l : WARD_DEFAULT; };
const wardItem = id => wardItems().find(x => x.id === id) || { id, name: capz(id || 'Peça'), sizes: [] };
// Els estats, en l'ordre en què passen. «A arreglar» és un pas que només hi és si cal; «Retornat», quan la persona el torna.
const WARD_STATES = [
  ['demanat', 'Demanat', 'L’has demanat. La secretaria l’encarregarà.'],
  ['encarregat', 'Encarregat', 'Ja està encarregat. Quan arribi te’l faran emprovar.'],
  ['emprovar', 'Pendent d’emprovar', 'Ha arribat: passa pel vestidor a emprovar-te’l.'],
  ['arreglar', 'A arreglar', 'S’hi han de fer arranjaments. Ja t’avisaran quan estigui.'],
  ['entregat', 'Entregat', 'Ja el tens.'],
  ['retornat', 'Retornat', 'L’has tornat al vestidor.'],
];
const WARD_LABEL = Object.fromEntries(WARD_STATES.map(([k, l]) => [k, l]));
const WARD_HINT = Object.fromEntries(WARD_STATES.map(([k, , h]) => [k, h]));
const wardPill = s => `<span class="ward-pill w-${esc(s)}">${esc(WARD_LABEL[s] || s)}</span>`;
/** Les peces d'una persona, de la més nova a la més antiga. */
const wardOf = mid => [...S.wardrobe.values()].filter(x => x.memberId === mid).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
/** Encara la té o l'està esperant: tot menys «retornat». */
const wardActive = x => x.status !== 'retornat';
/** El dia (al calendari d'aquí, no en hora universal) d'una hora desada. */
const wardDay = iso => iso ? ddmm(isoDate(new Date(iso))) : '';

let wardWatch = null;
/** L'equip del vestidor ho llegeix tot; la resta, només les seves peces. Es comença quan la configuració diu que hi és. */
function watchWardrobe() {
  if (!wardOn() || !db || wardWatch) return;
  const mid = S.memberId;
  const q = wardStaff() ? db.collection('wardrobe') : mid ? db.collection('wardrobe').where('memberId', '==', mid) : null;
  if (!q) return;
  wardWatch = q.onSnapshot(snap => { takeSnap('wardrobe', snap); if (S.ready) scheduleRender(); }, () => {});
}
function saveWard(rec) { S.wardrobe.set(rec.id, rec); persist('wardrobe', rec.id, rec, 60); }
const wardStep = (rec, s) => ({ ...rec, status: s, updatedAt: new Date().toISOString(), by: myEmail() || '',
  history: [...(rec.history || []), { s, at: new Date().toISOString(), by: myEmail() || '' }].slice(-30) });

/* ---------- La pantalla ---------- */
function viewWardrobe() {
  const from = tabsForRole().includes(ui.wardFrom) ? ui.wardFrom : 'avisos';
  const head = `<div class="page-head"><div class="ph-back"><button class="nav-arrow" data-act="tab" data-tab="${from}" aria-label="Torna a ${esc(TAB_LABEL[from])}">${ICON.left}</button><div><div class="eyebrow">${wardStaff() ? 'Vestuari de l’agrupació' : 'El teu vestuari'}</div><h1 class="h1">Vestidor</h1></div></div></div>`;
  if (!wardOn()) return head + `<div class="empty"><p>El vestidor no està activat.${isAdmin() ? ' El pots activar a Gestió › Ajustos › Vestidor.' : ''}</p></div>`;
  const me = myId() ? S.members.get(myId()) : null;
  return head + (me ? wardMine(me) : '') + (wardStaff() ? wardManage() : '');
}
/** El que té cadascú: una targeta per peça, amb els passos que ha fet i els que li queden. */
function wardMine(me) {
  const mine = wardOf(me.id);
  const canAsk = !PREVIEW || PREVIEW.memberId === me.id;
  const cards = mine.map(x => {
    const it = wardItem(x.item);
    const path = ['demanat', 'encarregat', 'emprovar', ...((x.history || []).some(h => h.s === 'arreglar') || x.status === 'arreglar' ? ['arreglar'] : []), 'entregat', ...(x.status === 'retornat' ? ['retornat'] : [])];
    const at = path.indexOf(x.status);
    const when = s => { const h = [...(x.history || [])].reverse().find(y => y.s === s); return h ? wardDay(h.at) : ''; };
    return `<li class="ward-card">
      <div class="wc-h"><span><b>${esc(it.name)}</b>${x.size ? ` <span class="mono">${esc(x.size)}</span>` : ''}</span>${wardPill(x.status)}</div>
      <ol class="ward-steps" aria-label="Com va">${path.map((s, i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><i></i><span>${esc(WARD_LABEL[s])}</span>${i <= at && when(s) ? `<small>${when(s)}</small>` : ''}</li>`).join('')}</ol>
      <p class="wc-t">${esc(WARD_HINT[x.status] || '')}</p>
      ${x.note ? `<p class="wc-n">${esc(x.note)}</p>` : ''}
      ${x.status === 'demanat' && canAsk ? `<div class="wc-a"><button class="btn btn-sm" data-act="ward-ask" data-id="${esc(x.id)}">Canvia la talla</button><button class="btn btn-sm btn-ghost" data-act="ward-cancel" data-id="${esc(x.id)}">Anul·la</button></div>` : ''}
    </li>`;
  }).join('');
  // Les peces són alternatives (americana o estola): cadascú en demana una; si en necessita més, les hi afegeix l'equip.
  const canMore = mine.length && !mine.some(wardActive) && canAsk;
  return `<div class="section-title"><h2 class="h2">El meu vestuari</h2>${canMore ? '<button class="btn btn-sm" data-act="ward-ask">Demana’n un de nou</button>' : ''}</div>
    ${mine.length ? `<ul class="ward-cards">${cards}</ul>`
      : `<div class="panel ward-empty"><p>Encara no has demanat res. Tria la peça que et toca (${esc(wardItems().map(x => x.name.toLowerCase()).join(' o '))}) i la teva talla: la secretaria l’encarregarà i te l’anirà donant.</p>
        ${canAsk ? '<button class="btn btn-primary" data-act="ward-ask">Demana el teu vestuari</button>' : ''}</div>`}`;
}
/** Per a la secretaria: tot el vestuari, per estats, amb el que cal encarregar i qui encara no ha demanat res. */
function wardManage() {
  const all = [...S.wardrobe.values()].filter(x => S.members.has(x.memberId));
  const people = membersOf(null);
  const none = people.filter(m => !all.some(x => x.memberId === m.id && wardActive(x)));
  const f = ui.wardFilter || 'all';
  const n = k => k === 'all' ? all.length : k === 'none' ? none.length : all.filter(x => x.status === k).length;
  const chips = `<div class="chips ward-chips" role="group" aria-label="Filtra el vestuari">${[['all', 'Tot'], ...WARD_STATES.map(([k, l]) => [k, l]), ['none', 'Sense demanar']]
    .filter(([k]) => k === 'all' || k === 'none' || n(k)).map(([k, l]) => `<button class="chip" aria-pressed="${f === k}" data-act="ward-filter" data-k="${k}">${esc(l)} <span class="m">${n(k)}</span></button>`).join('')}</div>`;
  const asked = all.filter(x => x.status === 'demanat');
  const order = wardOrder(asked);
  const toOrder = asked.length ? `<div class="panel ward-order"><div class="wo-h"><b>Per encarregar · ${asked.length} ${asked.length === 1 ? 'peça' : 'peces'}</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="ward-copy">Copia la comanda</button><button class="btn btn-sm btn-primary" data-act="ward-ordered">Marca-les com a encarregades</button></span></div>
      ${order.map(o => `<p><b>${esc(o.it.name)}</b> · ${o.sizes.map(([z, c]) => `<span class="mono">${esc(z || 'sense talla')}</span> ×${c}`).join(' · ')}</p>`).join('')}</div>` : '';
  const sec = m => `${esc(SEC[m.section]?.name || '')}${m.part ? ` · ${esc(partTag(m))}` : ''}`;
  let rows;
  if (f === 'none') {
    rows = none.length ? none.sort((a, b) => secIdx(a.section) - secIdx(b.section) || byName(a, b)).map(m => `<li class="ward-row" data-find="${esc(normText(m.name))}">
        ${avatar(m)}<span class="wr-n"><b>${esc(m.name)}</b><small>${sec(m)}</small></span><button class="btn btn-sm" data-act="ward-new" data-mid="${esc(m.id)}">Afegeix</button></li>`).join('')
      : '<li class="muted" style="padding:14px">Tothom ha demanat el seu vestuari.</li>';
  } else {
    const list = all.filter(x => f === 'all' || x.status === f).map(x => ({ x, m: S.members.get(x.memberId) }))
      .sort((a, b) => secIdx(a.m.section) - secIdx(b.m.section) || byName(a.m, b.m) || (a.x.createdAt || '').localeCompare(b.x.createdAt || ''));
    rows = list.length ? list.map(({ x, m }) => `<li data-find="${esc(normText(m.name))}"><button class="ward-row" data-act="ward-item" data-id="${esc(x.id)}">
        ${avatar(m)}<span class="wr-n"><b>${esc(m.name)}</b><small>${sec(m)} · ${esc(wardItem(x.item).name)}${x.size ? ` <span class="mono">${esc(x.size)}</span>` : ''}${x.note ? ' · amb nota' : ''}</small></span>${wardPill(x.status)}</button></li>`).join('')
      : '<li class="muted" style="padding:14px">No n’hi ha cap en aquest estat.</li>';
  }
  return `<div class="section-title"><h2 class="h2">Tot el vestuari</h2><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="ward-export">Exporta a Excel</button><button class="btn btn-sm btn-primary" data-act="ward-new">+ Afegeix</button></span></div>
    ${toOrder}${chips}<div id="wlist">${findBox('#wlist', `Cerca un ${V.member}`)}<ul class="list ward-list">${rows}</ul><div class="panel find-empty" hidden>Ningú amb aquest nom.</div></div>`;
}
/** El que s'ha d'encarregar, per peça i per talla (de més petita a més gran, en l'ordre de les talles de la peça). */
function wardOrder(list) {
  return wardItems().map(it => {
    const c = new Map();
    for (const x of list) if (x.item === it.id) c.set(x.size || '', (c.get(x.size || '') || 0) + 1);
    const idx = z => { const i = it.sizes.indexOf(z); return i < 0 ? 999 : i; };
    return { it, sizes: [...c].sort((a, b) => idx(a[0]) - idx(b[0]) || a[0].localeCompare(b[0])) };
  }).filter(o => o.sizes.length);
}
const wardOrderText = () => `Comanda de vestuari · ${S.config.name || ''} · ${shortDate(TODAY)}\n` + wardOrder([...S.wardrobe.values()].filter(x => x.status === 'demanat'))
  .map(o => `${o.it.name}: ${o.sizes.map(([z, c]) => `${z || 'sense talla'} ×${c}`).join(', ')}`).join('\n');
/** Totes les demanades passen a encarregades (es pot desfer uns segons). */
function wardMarkOrdered() {
  const asked = [...S.wardrobe.values()].filter(x => x.status === 'demanat');
  if (!asked.length) return;
  for (const x of asked) saveWard(wardStep(x, 'encarregat'));
  render();
  toast(`${asked.length} ${asked.length === 1 ? 'peça encarregada' : 'peces encarregades'}`, { label: 'Desfés', run: () => { for (const x of asked) saveWard(x); render(); } });
}
function wardExport() {
  const head = ['Nom i cognoms', capz(V.section), capz(V.part), 'Peça', 'Talla', 'Estat', 'Nota', 'Demanat el', 'Últim canvi'];
  const rows = [...S.wardrobe.values()].map(x => ({ x, m: S.members.get(x.memberId) })).filter(r => r.m)
    .sort((a, b) => secIdx(a.m.section) - secIdx(b.m.section) || byName(a.m, b.m))
    .map(({ x, m }) => [fullName(m.name), SEC[m.section]?.name || '', m.part || '', wardItem(x.item).name, x.size || '', WARD_LABEL[x.status] || x.status, x.note || '', x.createdAt ? isoDate(new Date(x.createdAt)) : '', x.updatedAt ? isoDate(new Date(x.updatedAt)) : '']);
  offerCSV(`vestuari-${S.config.shortName || S.config.name || ''}-${TODAY}`, [head, ...rows]);
}

/* ---------- Demanar (la persona) ---------- */
/** Demanar una peça, o canviar-ne la talla mentre encara no l'han encarregada. */
function sheetWardAsk(editId) {
  const me = myId() ? S.members.get(myId()) : null;
  if (!me || !wardOn()) return;
  const ed = editId ? S.wardrobe.get(editId) : null;
  if (ed && (ed.memberId !== me.id || ed.status !== 'demanat')) return;
  if (!ed && wardOf(me.id).some(wardActive)) { toast('Ja tens el teu vestuari demanat: si cal canviar-lo, parla amb la secretaria'); return; }
  const items = ed ? [wardItem(ed.item)] : wardItems();
  let item = ed ? ed.item : items.length === 1 ? items[0].id : '';
  let mySize = S.profiles?.get(me.id)?.size || '';
  let size = ed ? ed.size : '';
  const sizes = () => wardItem(item).sizes || [];
  openSheet({
    title: ed ? `${wardItem(ed.item).name}: canvia la talla` : 'Demana el teu vestuari',
    body: `<div class="kv">
      ${ed ? '' : `<div class="field"><span>Quina peça et toca?</span><div class="pickers" id="wa-item">${items.map(it => `<button type="button" class="pick" data-k="${esc(it.id)}" aria-pressed="${item === it.id}">${esc(it.name)}</button>`).join('')}</div></div>`}
      <div class="field" id="wa-size-f"><span>La teva talla</span><div class="pickers" id="wa-size"></div><small id="wa-size-h"></small></div>
      <label class="field"><span>Nota (opcional)</span><input class="inp" id="wa-note" maxlength="300" value="${esc(ed?.note || '')}" placeholder="p. ex. Entre dues talles · Màniga llarga"></label>
      <p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Si no saps la talla, posa la que creguis i la secretaria te la farà emprovar abans d’entregar-te-la.</p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="wa-go">${ed ? 'Desa' : 'Demana-la'}</button>`,
    onMount: el => {
      const paintSizes = () => {
        const z = sizes();
        if (!size && mySize && z.includes(mySize)) size = mySize;
        el.querySelector('#wa-size-f').hidden = !item || !z.length;
        el.querySelector('#wa-size').innerHTML = z.map(s => `<button type="button" class="pick" data-k="${esc(s)}" aria-pressed="${size === s}">${esc(s)}</button>`).join('');
        el.querySelector('#wa-size-h').textContent = mySize && z.includes(mySize) && !ed ? `A la teva fitxa hi tens la ${mySize}.` : '';
        el.querySelectorAll('#wa-size .pick').forEach(b => b.onclick = () => { size = b.dataset.k; el.querySelectorAll('#wa-size .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      };
      el.querySelectorAll('#wa-item .pick').forEach(b => b.onclick = () => {
        item = b.dataset.k; size = '';
        el.querySelectorAll('#wa-item .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        paintSizes();
      });
      paintSizes();
      // La talla de «La meva fitxa», si la té posada i és una de les d'aquesta peça, ja surt triada.
      if (!mySize && !ed) db.doc(`profiles/${me.id}`).get().then(d => { mySize = (d.exists && d.data().size) || ''; if (mySize && el.isConnected) paintSizes(); }).catch(() => {});
      el.querySelector('#wa-go').onclick = () => {
        if (!item) { toast('Tria la peça'); return; }
        if (sizes().length && !size) { toast('Tria la talla'); return; }
        const note = el.querySelector('#wa-note').value.trim();
        const at = new Date().toISOString();
        const rec = ed ? { ...ed, size, note, updatedAt: at, by: myEmail() || '' }
          : { id: uid('wd'), memberId: me.id, memberName: me.name, section: me.section, item, size, status: 'demanat', note,
              history: [{ s: 'demanat', at, by: myEmail() || '' }], createdAt: at, updatedAt: at, by: myEmail() || '' };
        saveWard(rec);
        closeSheet(); render();
        toast(ed ? 'Talla canviada' : `${wardItem(item).name} demanada. Aquí en veuràs com va.`);
      };
    },
  });
}
function wardCancel(id) {
  const x = S.wardrobe.get(id);
  if (!x || x.memberId !== myId() || x.status !== 'demanat') return;
  S.wardrobe.delete(id); persist('wardrobe', id, null, 20);
  render();
  toast(`${wardItem(x.item).name}: petició anul·lada`, { label: 'Desfés', run: () => { saveWard(x); render(); } });
}

/* ---------- Portar-ho (la secretaria) ---------- */
/** Una peça: l'estat (amb un toc), la talla, la nota i per on ha passat. */
function sheetWardItem(id) {
  const x0 = S.wardrobe.get(id);
  if (!x0 || !wardStaff()) return;
  const m = S.members.get(x0.memberId);
  let x = clone(x0);
  const paint = el => {
    el.querySelectorAll('#wi-st button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === x.status)));
    el.querySelector('#wi-hint').textContent = WARD_HINT[x.status] ? `La persona hi veu: «${WARD_HINT[x.status]}»` : '';
  };
  const it = wardItem(x.item);
  openSheet({
    title: `${it.name} · ${m ? m.name : x.memberName || ''}`,
    body: `<div class="kv">
      <p class="muted" style="margin:0">${m ? `${esc(SEC[m.section]?.name || '')}${m.part ? ` · ${esc(partTag(m))}` : ''} · ` : ''}demanat el ${esc(wardDay(x.createdAt))}</p>
      <div class="field"><span>Estat</span><div class="ward-st" id="wi-st" role="radiogroup" aria-label="Estat">${WARD_STATES.map(([k, l]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${x.status === k}">${esc(l)}</button>`).join('')}</div><small id="wi-hint"></small></div>
      ${it.sizes.length ? `<div class="field"><span>Talla</span><div class="pickers" id="wi-size">${it.sizes.map(s => `<button type="button" class="pick" data-k="${esc(s)}" aria-pressed="${x.size === s}">${esc(s)}</button>`).join('')}</div></div>` : ''}
      <label class="field"><span>Nota</span><input class="inp" id="wi-note" maxlength="300" value="${esc(x.note || '')}" placeholder="p. ex. Cal escurçar les mànigues 2 cm"><small>La veu també la persona.</small></label>
      ${(x.history || []).length ? `<div class="field"><span>Per on ha passat</span><ul class="mini-list" style="max-height:none">${[...x.history].reverse().map(h => `<li><span>${esc(WARD_LABEL[h.s] || h.s)}</span><span class="m mono">${esc(wardDay(h.at))}${h.by ? ` · ${esc(h.by.split('@')[0])}` : ''}</span></li>`).join('')}</ul></div>` : ''}
    </div>`,
    foot: `<button class="btn btn-danger-ghost" id="wi-del">Esborra</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="wi-save">Desa</button>`,
    onMount: el => {
      el.querySelectorAll('#wi-st button').forEach(b => b.onclick = () => { x.status = b.dataset.k; paint(el); });
      el.querySelectorAll('#wi-size .pick').forEach(b => b.onclick = () => { x.size = b.dataset.k; el.querySelectorAll('#wi-size .pick').forEach(y => y.setAttribute('aria-pressed', String(y === b))); });
      paint(el);
      el.querySelector('#wi-save').onclick = () => {
        x.note = el.querySelector('#wi-note').value.trim();
        const rec = x.status !== x0.status ? wardStep(x, x.status) : { ...x, updatedAt: new Date().toISOString(), by: myEmail() || '' };
        saveWard(rec); closeSheet(); render();
        toast(x.status !== x0.status ? `${it.name} de ${m ? firstName(m.name) : ''}: ${WARD_LABEL[x.status].toLowerCase()}` : 'Desat');
      };
      el.querySelector('#wi-del').onclick = () => {
        S.wardrobe.delete(id); persist('wardrobe', id, null, 20); closeSheet(); render();
        toast('Peça esborrada', { label: 'Desfés', run: () => { saveWard(x0); render(); } });
      };
    },
  });
}
/** Afegir una peça a algú (que no la pot demanar ell mateix, o perquè ja l'han triada a l'assaig). */
function sheetWardNew(mid0) {
  if (!wardStaff()) return;
  const people = membersOf(null).sort((a, b) => secIdx(a.section) - secIdx(b.section) || byName(a, b));
  let item = wardItems()[0]?.id || '', size = '', status = 'demanat';
  const sizes = () => wardItem(item).sizes || [];
  openSheet({
    title: 'Afegeix una peça',
    body: `<div class="kv">
      <label class="field"><span>Per a</span><select class="inp" id="wn-who"><option value="">—</option>${SECTIONS.map(x => `<optgroup label="${esc(x.name)}">${people.filter(m => m.section === x.id).map(m => `<option value="${esc(m.id)}" ${m.id === mid0 ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="field"><span>Peça</span><div class="pickers" id="wn-item">${wardItems().map(it => `<button type="button" class="pick" data-k="${esc(it.id)}" aria-pressed="${item === it.id}">${esc(it.name)}</button>`).join('')}</div></div>
      <div class="field" id="wn-size-f"><span>Talla</span><div class="pickers" id="wn-size"></div></div>
      <div class="field"><span>Estat</span><div class="ward-st" id="wn-st" role="radiogroup" aria-label="Estat">${WARD_STATES.map(([k, l]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${status === k}">${esc(l)}</button>`).join('')}</div></div>
      <label class="field"><span>Nota (opcional)</span><input class="inp" id="wn-note" maxlength="300"></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="wn-go">Afegeix</button>`,
    onMount: el => {
      const paintSizes = () => {
        el.querySelector('#wn-size-f').hidden = !sizes().length;
        el.querySelector('#wn-size').innerHTML = sizes().map(s => `<button type="button" class="pick" data-k="${esc(s)}" aria-pressed="${size === s}">${esc(s)}</button>`).join('');
        el.querySelectorAll('#wn-size .pick').forEach(b => b.onclick = () => { size = b.dataset.k; el.querySelectorAll('#wn-size .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      };
      el.querySelectorAll('#wn-item .pick').forEach(b => b.onclick = () => { item = b.dataset.k; size = ''; el.querySelectorAll('#wn-item .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paintSizes(); });
      el.querySelectorAll('#wn-st button').forEach(b => b.onclick = () => { status = b.dataset.k; el.querySelectorAll('#wn-st button').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
      paintSizes();
      el.querySelector('#wn-go').onclick = () => {
        const m = S.members.get(el.querySelector('#wn-who').value);
        if (!m) { toast('Tria per a qui és'); return; }
        if (sizes().length && !size) { toast('Tria la talla'); return; }
        const at = new Date().toISOString(), by = myEmail() || '';
        // Si ja és més enllà de «demanat», l'historial ho diu tal com és: l'ha afegit l'equip en aquest estat.
        saveWard({ id: uid('wd'), memberId: m.id, memberName: m.name, section: m.section, item, size, status, note: el.querySelector('#wn-note').value.trim(),
          history: [{ s: status, at, by }], createdAt: at, updatedAt: at, by });
        closeSheet(); render(); toast(`${wardItem(item).name} afegida a ${firstName(m.name)}`);
      };
    },
  });
}

/* ---------- Inici ---------- */
/** A «Per fer»: a cadascú, el que ha d'anar a emprovar-se; a la secretaria, el que cal encarregar. */
function wardTodos() {
  if (!wardOn()) return [];
  const out = [];
  const mid = myId();
  if (mid) for (const x of wardOf(mid).filter(y => y.status === 'emprovar')) {
    out.push({ icon: 'ward', t: `${esc(wardItem(x.item).name)} per emprovar`, s: `${x.size ? `Talla ${esc(x.size)} · ` : ''}passa pel vestidor`, btn: 'Vestidor', act: 'data-act="ward-open"', n: 1 });
  }
  if (wardStaff()) {
    const asked = [...S.wardrobe.values()].filter(x => x.status === 'demanat' && S.members.has(x.memberId));
    if (asked.length) out.push({ icon: 'ward', t: `${asked.length === 1 ? '1 peça' : `${asked.length} peces`} de vestuari per encarregar`, s: esc(wardOrder(asked).map(o => `${o.it.name} ×${o.sizes.reduce((n, [, c]) => n + c, 0)}`).join(' · ')), btn: 'Vestidor', act: 'data-act="ward-open"', n: asked.length });
  }
  return out;
}

/* ---------- Ajustos ---------- */
/** El calaix d'Ajustos: activar-lo i triar les peces, cadascuna amb les seves talles. */
function wardConfigPanel() {
  const on = wardOn();
  const rows = wardItems().map((it, i) => `<div class="ward-cfg-row" data-i="${i}">
      <input class="inp" maxlength="30" value="${esc(it.name)}" placeholder="Peça" aria-label="Nom de la peça" data-f="name">
      <input class="inp" maxlength="200" value="${esc((it.sizes || []).join(', '))}" placeholder="Talles, separades per comes" aria-label="Talles" data-f="sizes">
      <button type="button" class="icon-btn" data-act="ward-cfg-del" data-i="${i}" aria-label="Treu la peça" ${wardItems().length < 2 ? 'disabled' : ''}>${ICON.close}</button></div>`).join('');
  return `<div class="toggle-row setting"><span><b>${on ? 'Activat' : 'Desactivat'}</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">${on
      ? `Cada ${esc(V.member)} hi demana el seu vestuari amb la talla i en segueix l’estat; la secretaria i la gerència ho porten tot des de la mateixa pantalla.`
      : 'Activa’l si l’agrupació dona vestuari (americana, estola…): cadascú el demanarà amb la seva talla i la secretaria en portarà el seguiment.'}</span></span>
      <label class="switch"><input type="checkbox" id="cfg-ward" ${on ? 'checked' : ''} data-bind="cfg-ward"><span></span></label></div>
    ${on ? `<div class="setting" style="display:block"><div class="t">Peces i talles</div><div class="s" style="margin-bottom:8px">Cada peça amb les seves talles, separades per comes, de la més petita a la més gran.</div>
      <div id="ward-cfg">${rows}</div>
      <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn btn-sm" data-act="ward-cfg-add">+ Afegeix una peça</button><button type="button" class="btn btn-sm btn-primary" data-act="ward-cfg-save">Desa les peces</button></span></div>` : ''}`;
}
/** Les files del calaix tal com estan ara (amb el que s'hi ha escrit i encara no s'ha desat). */
function wardCfgRead(skip = -1) {
  return $$('#ward-cfg .ward-cfg-row').filter(r => +r.dataset.i !== skip).map((r, i) => {
    const name = r.querySelector('[data-f="name"]').value.trim();
    const sizes = r.querySelector('[data-f="sizes"]').value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
    const old = wardItems()[+r.dataset.i];
    const id = old?.id || (normText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `peca${i + 1}`);
    return { id, name, sizes };
  }).filter(x => x.name);
}
function wardCfgSave(items) {
  const ids = new Set();
  for (const it of items) { let id = it.id, n = 2; while (ids.has(id)) id = `${it.id}-${n++}`; it.id = id; ids.add(id); }
  if (!items.length) { toast('Hi ha d’haver almenys una peça'); return; }
  saveConfig({ wardrobe: { ...(S.config.wardrobe || {}), on: wardOn(), items } });
  render(); toast('Peces desades');
}
