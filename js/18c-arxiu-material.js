// A Tempo · 18c-arxiu-material.js — Per als arxivers: el codi de cada cantaire (S1, C4, T6…, i R1, R2… per als reforços
// d'una producció), que fa més ràpid repartir i recollir les partitures, i qui té la carpeta i l'etiqueta del cor.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Dades ---------- */
// kit/<corda> = { section, codes: { <membre>: 'S1' }, prod: { <producció>: { <membre>: 'R1' } },
//   folder: { <membre>: { s: 'yes' | 'no', at, by } }, label: { …igual… }, updatedAt, by }
// Un document per corda (quatre lectures en total). El canvien l'equip i qualsevol arxiver (vegeu les regles).
// codes són els de sempre; prod, els que valen només durant una producció: els reforços (R1, R2…) o un canvi puntual.
S.kit = new Map();
const KIT_ITEMS = [['folder', 'Carpeta'], ['label', 'Etiqueta']];
const KIT_WORD = { folder: 'la carpeta', label: 'l’etiqueta' };
const kitDoc = sec => S.kit.get(sec) || { section: sec };
/** Ho porta l'equip o un arxiver. */
const canKit = () => canEdit() || isArchivist();
/** El codi d'arxiu d'una persona: el d'aquella producció, si en té, o el de sempre. */
function codeOf(m, pid) {
  if (!m) return '';
  const d = kitDoc(m.section);
  return (pid && d.prod?.[pid]?.[m.id]) || d.codes?.[m.id] || '';
}
const codeNum = c => { const x = String(c || '').match(/(\d+)/); return x ? +x[1] : 9999; };
/** Per codi: primer els de sempre (S1, S2…), després els reforços (R1, R2…) i, al final, qui no en té, per nom. */
const codeCmp = pid => (a, b) => {
  const ca = codeOf(a, pid), cb = codeOf(b, pid);
  return (Number(!ca) - Number(!cb)) || (Number(/^R/i.test(ca)) - Number(/^R/i.test(cb))) || (codeNum(ca) - codeNum(cb)) || byName(a, b);
};
const codeTag = (m, pid) => { const c = codeOf(m, pid); return c ? `<span class="arx-code${/^R/i.test(c) ? ' r' : ''}">${esc(c)}</span>` : ''; };
/** «T6 Pol Quingles», per a les llistes que es copien. */
const codeName = (m, pid) => [codeOf(m, pid), fullName(m.name)].filter(Boolean).join(' ');
/** El següent codi de reforç d'una producció (R1, R2…), comptant els de totes les cordes. */
function nextGuestCode(pid) {
  const used = SECTIONS.flatMap(x => Object.values(kitDoc(x.id).prod?.[pid] || {})).filter(c => /^R\d+$/i.test(c)).map(codeNum);
  return `R${(used.length ? Math.max(...used) : 0) + 1}`;
}
/** Canvia el document d'una corda. */
function saveKit(sec, fn) {
  const d = clone(kitDoc(sec));
  for (const k of ['codes', 'prod', 'folder', 'label']) d[k] = d[k] || {};
  fn(d);
  Object.assign(d, { section: sec, updatedAt: new Date().toISOString(), by: myEmail() || '' });
  S.kit.set(sec, d);
  persist('kit', sec, d, 500);
}
function setCode(m, code, pid) {
  code = String(code || '').trim().toUpperCase().slice(0, 8);
  saveKit(m.section, d => {
    if (pid) { const p = d.prod[pid] = { ...(d.prod[pid] || {}) }; if (code) p[m.id] = code; else delete p[m.id]; if (!Object.keys(p).length) delete d.prod[pid]; }
    else if (code) d.codes[m.id] = code; else delete d.codes[m.id];
  });
}
/** On és la carpeta (o l'etiqueta) d'algú: 'yes' (la té), 'no' (no en té) o '' (encara no s'ha mirat). */
const kitOf = (m, item) => kitDoc(m.section)[item]?.[m.id]?.s || '';
const kitAt = (m, item) => kitDoc(m.section)[item]?.[m.id]?.at || '';
function setKit(m, item, s) {
  saveKit(m.section, d => {
    if (s) d[item][m.id] = { s, at: new Date().toISOString(), by: myEmail() || '' };
    else delete d[item][m.id];
  });
}
/** Qui ha de tenir carpeta i etiqueta: tothom qui és al cor; dels reforços, només qui en fa una producció que encara dura. */
function kitPeople(sec) {
  return membersOf(sec || null).filter(m => !isGuest(m.id) || guestProds(m.id).some(p => allSessions(p.id).some(s => s.date >= TODAY)))
    .sort((a, b) => SECTIONS.findIndex(x => x.id === a.section) - SECTIONS.findIndex(x => x.id === b.section) || codeCmp(curGuestProd(a))(a, b));
}
/** La producció que fa ara un reforç (per al seu codi R): la primera que encara dura. */
const curGuestProd = m => isGuest(m.id) ? (guestProds(m.id).find(p => allSessions(p.id).some(s => s.date >= TODAY)) || guestProds(m.id).at(-1))?.id || '' : '';
/** El recompte d'una corda (o de tot el cor): quanta gent té cada cosa, quanta no i quanta encara no s'ha mirat. */
function kitSummary(sec) {
  const ms = kitPeople(sec);
  const out = { n: ms.length };
  for (const [k] of KIT_ITEMS) out[k] = { yes: ms.filter(m => kitOf(m, k) === 'yes').length, no: ms.filter(m => kitOf(m, k) === 'no').length };
  out.unk = ms.filter(m => KIT_ITEMS.some(([k]) => !kitOf(m, k))).length;
  return out;
}
/** Ja s'ha començat a portar en aquesta corda: llavors, qui no s'ha mirat és nou (o se l'han saltat) i surt a «Per fer». */
const kitStarted = sec => KIT_ITEMS.some(([k]) => Object.keys(kitDoc(sec)[k] || {}).length);

/* ---------- Carpetes i etiquetes ---------- */
function sheetKit(sec0) {
  if (!seesArchive()) return;
  let sec = sec0 || archiveSec() || SECTIONS[0]?.id || '';
  const paint = el => {
    const ms = kitPeople(sec), can = canKit(), x = kitSummary(sec);
    el.querySelectorAll('#kt-sec .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec)));
    el.querySelector('#kt-sum').innerHTML = KIT_ITEMS.map(([k, l]) => `<div><b>${x[k].no}</b><span>sense ${esc(l.toLowerCase())}</span></div>`).join('')
      + `<div><b>${x.unk}</b><span>per mirar</span></div>`;
    el.querySelector('#kt-bulk').hidden = !can || !ms.length;
    el.querySelector('#kt-list').innerHTML = ms.length ? ms.map(m => `<li class="sw-row kit-row" data-mid="${esc(m.id)}">
        <span class="sw-n">${codeTag(m, curGuestProd(m))}${esc(m.name)}${isGuest(m.id) ? ' <span class="tag">Reforç</span>' : ''}</span>
        <span class="kit-gs">${KIT_ITEMS.map(([k, l]) => { const s = kitOf(m, k); return `<span class="kit-g"><small>${l}</small><span class="seg3 kit-seg" role="radiogroup" aria-label="${esc(l)} de ${esc(m.name)}">
          <button type="button" role="radio" data-item="${k}" data-k="yes" aria-checked="${s === 'yes'}" ${can ? '' : 'disabled'}>La té</button><button type="button" role="radio" data-item="${k}" data-k="no" aria-checked="${s === 'no'}" ${can ? '' : 'disabled'}>No</button></span></span>`; }).join('')}</span></li>`).join('')
      : `<li class="muted" style="padding:12px 2px">No hi ha ningú en aquesta ${esc(V.section)}.</li>`;
    el.querySelectorAll('.kit-row').forEach(r => r.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
      const m = S.members.get(r.dataset.mid);
      if (!m || !canKit()) return;
      // Tornar a tocar el que ja hi ha el desmarca (com a les llistes): així es pot tornar a «per mirar».
      setKit(m, b.dataset.item, kitOf(m, b.dataset.item) === b.dataset.k ? '' : b.dataset.k); paint(el);
    }));
    // Qui no en té: la llista per encarregar-ne o fer-ne de noves.
    const lack = KIT_ITEMS.map(([k, l]) => ({ k, l, list: ms.filter(m => kitOf(m, k) === 'no') })).filter(x => x.list.length);
    el.querySelector('#kt-lack').innerHTML = lack.map(({ k, l, list }) => `<div class="section-title"><h2 class="h2">Sense ${esc(l.toLowerCase())} (${list.length})</h2><button class="btn btn-sm btn-ghost" data-copy="${k}">Copia la llista</button></div>
      <ul class="mini-list" style="max-height:none">${list.map(m => `<li><span>${codeTag(m, curGuestProd(m))}<b>${esc(m.name)}</b>${kitAt(m, k) ? ` <span class="m">· des del ${esc(ddmm(isoDate(new Date(kitAt(m, k)))))}</span>` : ''}</span></li>`).join('')}</ul>`).join('');
    el.querySelectorAll('#kt-lack [data-copy]').forEach(b => b.onclick = () => {
      const { l, list } = lack.find(x => x.k === b.dataset.copy);
      copyText(`Sense ${l.toLowerCase()} · ${SEC[sec].name}\n${list.map(m => `- ${codeName(m, curGuestProd(m))}`).join('\n')}`, 'Llista copiada');
    });
    el.querySelector('#kt-note').textContent = can ? 'Toca «La té» o «No» per a cadascú; si hi tornes a tocar, queda per mirar.' : '';
  };
  openSheet({
    title: 'Carpetes i etiquetes',
    wide: true,
    body: `<p class="muted" style="margin:0 0 10px;font-size:calc(13.5px*var(--ts))">Tothom ha de tenir la carpeta i l’etiqueta ${V.del}. Quan algú la perd, se li trenca o és nou, marca-ho aquí i sabràs quantes en cal fer.</p>
      <div class="chips" id="kt-sec" role="group" aria-label="${esc(V.Section)}">${SECTIONS.map(x => `<button class="chip" data-sec="${esc(x.id)}" aria-pressed="${x.id === sec}">${esc(x.name)}</button>`).join('')}</div>
      <div class="ax-kpis" id="kt-sum"></div>
      <div class="sw-bulk" id="kt-bulk"><button type="button" class="btn btn-sm" data-bulk="folder">Tothom té carpeta</button><button type="button" class="btn btn-sm" data-bulk="label">Tothom té etiqueta</button></div>
      <ul class="sw-list" id="kt-list"></ul>
      <p class="muted" id="kt-note" style="margin:8px 2px 0;font-size:calc(13px*var(--ts))"></p>
      <div id="kt-lack"></div>`,
    foot: `<button class="btn" data-act="arx-codes" data-sec="${esc(sec)}">Codis</button><span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Fet</button>`,
    onMount: el => {
      el.querySelectorAll('#kt-sec .chip').forEach(b => b.onclick = () => { sec = b.dataset.sec; paint(el); });
      el.querySelectorAll('#kt-bulk [data-bulk]').forEach(b => b.onclick = () => {
        if (!canKit()) return;
        const item = b.dataset.bulk;
        // Només qui encara no s'ha mirat: qui ja és «No» no es toca.
        const touch = kitPeople(sec).filter(m => !kitOf(m, item));
        if (!touch.length) { toast('Ja estan tots mirats'); return; }
        saveKit(sec, d => { for (const m of touch) d[item][m.id] = { s: 'yes', at: new Date().toISOString(), by: myEmail() || '' }; });
        paint(el);
        toast(`${touch.length} amb ${KIT_WORD[item]}`, { label: 'Desfés', run: () => { saveKit(sec, d => { for (const m of touch) delete d[item][m.id]; }); if (el.isConnected) paint(el); render(); } });
      });
      paint(el);
    },
  });
}

/* ---------- Codis ---------- */
/** Els codis d'una corda: els de sempre o, triant una producció, els que hi valen només a ella (els reforços, R1, R2…). */
function sheetCodes(sec0, pid0) {
  if (!seesArchive()) return;
  let sec = sec0 || archiveSec() || SECTIONS[0]?.id || '';
  const prods = productionsSorted().filter(p => allSessions(p.id).some(s => s.date >= TODAY) || (p.guests || []).length);
  let pid = pid0 && S.productions.has(pid0) ? pid0 : '';
  const paint = el => {
    const can = canKit();
    el.querySelectorAll('#cd-sec .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec)));
    // Amb una producció: qui la fa (i els seus reforços); sense: tota la corda, sense els reforços (que porten el codi per producció).
    const ms = membersOf(sec).filter(m => pid ? !isExcluded(pid, m.id) : !isGuest(m.id)).sort(codeCmp(pid));
    const d = kitDoc(sec);
    const dup = new Map();
    for (const m of ms) { const c = codeOf(m, pid); if (c) dup.set(c, (dup.get(c) || 0) + 1); }
    const guests = pid ? ms.filter(m => guestOf(pid, m.id)) : [];
    el.querySelector('#cd-guests').hidden = !can || !guests.some(m => !d.prod?.[pid]?.[m.id]);
    el.querySelector('#cd-list').innerHTML = ms.length ? ms.map(m => {
      const own = pid ? d.prod?.[pid]?.[m.id] || '' : d.codes?.[m.id] || '';
      const base = d.codes?.[m.id] || '';
      return `<li class="sw-row" data-mid="${esc(m.id)}"><span class="sw-n">${esc(m.name)}${guestOf(pid, m.id) ? ' <span class="tag">Reforç</span>' : ''}
          ${pid && !own && base ? `<small class="m" style="display:block;font-weight:500">Fa servir el de sempre: ${esc(base)}</small>` : ''}
          ${own && dup.get(own) > 1 ? `<small class="sc-out">Hi ha algú més amb el ${esc(own)}</small>` : ''}</span>
        <input class="inp cd-inp" type="text" maxlength="8" autocapitalize="characters" value="${esc(own)}" placeholder="${esc(pid ? base || 'R1' : `${sec}1`)}" aria-label="Codi de ${esc(m.name)}" ${can ? '' : 'disabled'}></li>`;
    }).join('') : `<li class="muted" style="padding:12px 2px">No hi ha ningú.</li>`;
    el.querySelectorAll('#cd-list .sw-row').forEach(r => { const inp = r.querySelector('.cd-inp'); inp.onchange = () => { const m = S.members.get(r.dataset.mid); if (m && canKit()) { setCode(m, inp.value, pid); paint(el); } }; });
  };
  openSheet({
    title: 'Codis d’arxiu',
    wide: true,
    body: `<p class="muted" style="margin:0 0 10px;font-size:calc(13.5px*var(--ts))">Cada ${esc(V.member)} té un codi (S1, C4, T6…) que surt al costat del nom a les llistes de partitures. Un reforç, o algú que només durant una producció en porta un altre, el té en aquella producció: tria-la a sota.</p>
      <label class="field"><span>Codis</span><select class="inp" id="cd-prod"><option value="">De sempre (tota la temporada)</option>${prods.map(p => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>Només per a ${esc(p.name)}</option>`).join('')}</select></label>
      <div class="chips" id="cd-sec" role="group" aria-label="${esc(V.Section)}" style="margin-top:10px">${SECTIONS.map(x => `<button class="chip" data-sec="${esc(x.id)}" aria-pressed="${x.id === sec}">${esc(x.name)}</button>`).join('')}</div>
      <div class="sw-bulk" id="cd-guests" style="margin-top:10px" hidden><button type="button" class="btn btn-sm" id="cd-r">Dona codis R als reforços</button></div>
      <ul class="sw-list" id="cd-list" style="margin-top:10px"></ul>`,
    foot: `<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Fet</button>`,
    onMount: el => {
      el.querySelector('#cd-prod').onchange = e => { pid = e.target.value; paint(el); };
      el.querySelectorAll('#cd-sec .chip').forEach(b => b.onclick = () => { sec = b.dataset.sec; paint(el); });
      el.querySelector('#cd-r').onclick = () => {
        if (!pid || !canKit()) return;
        const todo = membersOf(sec).filter(m => guestOf(pid, m.id) && !kitDoc(sec).prod?.[pid]?.[m.id]).sort(byName);
        for (const m of todo) setCode(m, nextGuestCode(pid), pid);
        paint(el);
        toast(todo.length === 1 ? `${codeOf(todo[0], pid)}: ${firstName(fullName(todo[0].name))}` : `${todo.length} reforços amb codi`);
      };
      paint(el);
    },
  });
}

/* ---------- A la pestanya Partitures ---------- */
/** El resum de carpetes i etiquetes (de la corda de l'arxiver, o de tot el cor) i els botons per portar-les i per als codis. */
function kitPanel() {
  if (!seesArchive()) return '';
  const sec = archiveSec() && !canEdit() ? archiveSec() : '';
  const x = kitSummary(sec);
  const bits = [...KIT_ITEMS.map(([k, l]) => x[k].no ? `${x[k].no} sense ${l.toLowerCase()}` : ''), x.unk ? `${x.unk} per mirar` : ''].filter(Boolean);
  return `<div class="panel arx-panel"><span><b>Carpeta i etiqueta</b>${sec ? ` · ${esc(SEC[sec].name)}` : ''}<br><span class="muted">${bits.join(' · ') || 'Tothom en té'}</span></span>
    <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-act="arx-codes" data-sec="${esc(sec)}">Codis</button><button class="btn btn-sm btn-primary" data-act="arx-kit" data-sec="${esc(sec)}">Carpetes i etiquetes</button></span></div>`;
}
/** A «Per fer» de l'arxiver: qui no té carpeta o etiqueta, i qui és nou i encara no s'ha mirat (quan ja es porta). */
function kitTodos() {
  const sec = archiveSec();
  if (!sec) return [];
  const ms = kitPeople(sec);
  const lack = ms.filter(m => KIT_ITEMS.some(([k]) => kitOf(m, k) === 'no'));
  const unk = kitStarted(sec) ? ms.filter(m => KIT_ITEMS.some(([k]) => !kitOf(m, k))) : [];
  const n = new Set([...lack, ...unk].map(m => m.id)).size;
  if (!n) return [];
  const t = lack.length ? `${lack.length === 1 ? `${esc(firstName(fullName(lack[0].name)))} no té` : `${lack.length} persones no tenen`} carpeta o etiqueta` : `${unk.length === 1 ? `Mira si ${esc(firstName(fullName(unk[0].name)))} té` : `Mira si ${unk.length} persones tenen`} carpeta i etiqueta`;
  return [{ icon: 'score', t, s: `${esc(SEC[sec].name)}${lack.length && unk.length ? ` · i ${unk.length} per mirar` : ''}`, btn: 'Obre', act: `data-act="arx-kit" data-sec="${esc(sec)}"`, n: 1 }];
}
