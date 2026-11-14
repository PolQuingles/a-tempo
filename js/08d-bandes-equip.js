// A Tempo · 08d-bandes-equip.js — Les eines de l'equip per a les bandes: l'editor (categories, dates i la Nit), publicar els
// finalistes i els diplomes. El model i la papereta són a 08b-bandes.js; la pàgina de la Nit, a 08c-nit-bandes.js.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- L'editor (qui porta el tauler) ---------- */
function sheetBandes(id) {
  const ex = id ? S.polls.get(id) : null;
  const p = ex ? clone(ex) : { id: uid('q'), kind: 'bandes', title: `Bandes ${S.config.shortName || S.config.name || ''} ${TODAY.slice(0, 4)}`.replace(/\s+/g, ' '), description: '', cats: [], picks: 2, win: 2, sections: [], out: [], selfOk: false, closesAt: '', closed: false, draft: true };
  const choose = (k, v, opts) => `<div class="pickers" id="${k}">${opts.map(o => `<button type="button" class="pick" data-v="${o}" aria-pressed="${o === v}">${o}</button>`).join('')}</div>`;
  const all = bdSorted(membersOf(null));
  const outList = () => SECTIONS.map(x => [x, all.filter(m => m.section === x.id)]).filter(([, l]) => l.length).map(([x, l]) => `<div class="eyebrow u-m-10-0-4">${esc(x.name)}</div>
    <ul class="mini-list bd-out u-maxh-none">${l.map(m => `<li><label class="bd-out-r"><input type="checkbox" data-mid="${esc(m.id)}" ${(p.out || []).includes(m.id) ? '' : 'checked'}><span>${esc(bdName(m.id))}</span></label></li>`).join('')}</ul>`).join('');
  openSheet({
    title: ex ? 'Edita les bandes' : 'Noves bandes',
    wide: true,
    body: `<div class="kv">
      <p class="m u-m-0">Una votació on tothom tria qui s’emporta cada categoria. El vot és secret: l’equip només en veu els recomptes, les estadístiques i qui ha votat.</p>
      <label class="field"><span>Títol</span><input class="inp" id="bd-title" maxlength="90" value="${esc(p.title)}"></label>
      <label class="field"><span>Presentació</span><textarea class="inp u-minh-120" id="bd-desc" maxlength="4000" placeholder="Arriben les bandes! Com cada any…">${esc(p.description || '')}</textarea>
        <small>Surt a la papereta i a l’anunci. Amb el mateix format que els anuncis: **negreta**, llistes amb «-»…</small></label>
      <label class="field"><span>Categories, una per línia</span><textarea class="inp u-minh-220" id="bd-cats" placeholder="Nom de la categoria: qui s’ho mereix&#10;Soprano: la millor soprano&#10;&#10;De parella&#10;Parella de l’any: …">${esc(bandesText(p))}</textarea>
        <small>«Nom: descripció». Les de parella, sota una línia que digui «De parella» o amb [parella] després del nom. Una categoria que es diu com una ${esc(V.section)} («Soprano», «Tenor»…) només és d’aquella ${esc(V.section)}; també s’hi pot posar [S]. Les de ${esc(V.section)} i les de parella donen una banda; les altres, les que triïs a sota (o [1], [3]… després del nom).</small></label>
      <div class="bd-prev" id="bd-prev"></div>
      <div class="field"><span>Persones per categoria (a cada papereta)</span>${choose('bd-picks', +p.picks || 2, [1, 2, 3])}</div>
      <div class="field"><span>Bandes per categoria (les més votades)</span>${choose('bd-win', +p.win || 2, [1, 2, 3])}<small>A les de parella i a les d’una ${esc(V.section)}, una sola banda.</small></div>
      <div class="field"><span>Qui hi participa (si no en tries cap, tothom)</span>${sectionPickers('bd-secs', p.sections)}</div>
      <details class="np-group"><summary><span id="bd-out-h"></span>${ICON.chev}</summary><p class="m u-m-8-0-0">Qui no hi surt ni vota ni pot ser votat (p. ex. qui és de baixa tota la temporada).</p>${outList()}</details>
      <div class="toggle-row"><span><b>Es pot votar a un mateix</b><br><span class="muted u-fs-t-13">Si no, cadascú no surt a les seves llistes</span></span><label class="switch"><input type="checkbox" id="bd-self" ${p.selfOk ? 'checked' : ''}><span></span></label></div>
      <label class="field"><span>Es pot votar fins al (inclòs)</span><input class="inp" id="bd-close" type="date" value="${esc(p.closesAt || '')}"><small>La vespra, l’app ho recorda a qui encara no ha votat.</small></label>
      <div class="eyebrow u-mt-6">La Nit: l’entrega de les bandes</div>
      <label class="field"><span>Com es diu</span><input class="inp" id="bd-gname" maxlength="60" value="${esc(galaName(p))}"></label>
      <label class="field"><span>Quin dia és</span><input class="inp" id="bd-gala" type="date" value="${esc(p.galaAt || '')}"><small>Surt a Inici amb el compte enrere.</small></label>
      <label class="field"><span>A quina hora (opcional)</span><input class="inp" id="bd-gtime" type="time" value="${esc(p.galaTime || '')}"><small>Amb l’hora, el compte enrere va per hores i minuts.</small></label>
      <label class="field"><span>On (opcional)</span><input class="inp" id="bd-gplace" maxlength="80" value="${esc(p.galaPlace || '')}" placeholder="p. ex. Restaurant Can Culleretes, Barcelona"><small>Surt amb el botó «Com s’hi arriba» (obre el mapa).</small></label>
      <label class="field"><span>Etiqueta (opcional)</span><input class="inp" id="bd-gdress" maxlength="80" value="${esc(p.galaDress || '')}" placeholder="p. ex. Vestit de gala: és la nit de l’any"></label>
      <label class="field"><span>El programa (opcional), un moment per línia</span><textarea class="inp u-minh-110" id="bd-gprog" placeholder="21:00 Arribada i photocall&#10;21:30 Sopar&#10;23:00 Entrega de les bandes&#10;00:30 Festa">${esc(programText(p))}</textarea></label>
      <div class="field"><span>Finalistes per categoria</span>${choose('bd-fin', +p.finalists || BANDES_FINAL, [3, 5])}</div>
      <div class="field"><span>Com es revelen els finalistes</span><div class="pickers" id="bd-every"><button type="button" class="pick" data-v="day" aria-pressed="${p.nomEvery !== 'all'}">Una categoria cada dia fins a la Nit</button><button type="button" class="pick" data-v="all" aria-pressed="${p.nomEvery === 'all'}">Totes alhora</button></div></div>
      <label class="field"><span>Es revelen a partir del (opcional)</span><input class="inp" id="bd-nom" type="date" value="${esc(p.nomFrom || '')}"><small id="bd-nom-s"></small></label>
      ${ex && !ex.draft ? `<div class="toggle-row"><span><b>Tancada</b><br><span class="muted u-fs-t-13">Ja no s’hi pot votar</span></span><label class="switch"><input type="checkbox" id="bd-closed" ${p.closed ? 'checked' : ''}><span></span></label></div>` : ''}
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="bd-del">Esborra</button>' : ''}<span class="spacer"></span>${p.draft ? '<button class="btn" id="bd-save">Desa l’esborrany</button><button class="btn btn-primary" id="bd-pub">Publica…</button>' : '<button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="bd-save">Desa</button>'}`,
    onMount: el => {
      bindToggles(el, '#bd-secs');
      for (const k of ['#bd-picks', '#bd-win', '#bd-fin', '#bd-every']) el.querySelectorAll(`${k} .pick`).forEach(b => b.onclick = () => el.querySelectorAll(`${k} .pick`).forEach(x => x.setAttribute('aria-pressed', x === b)));
      const val = k => +el.querySelector(`${k} .pick[aria-pressed="true"]`)?.dataset.v || 2;
      const read = () => {
        const win = val('#bd-win');
        return { ...p, title: el.querySelector('#bd-title').value.trim(), description: el.querySelector('#bd-desc').value.trim(),
          cats: parseBandes(el.querySelector('#bd-cats').value, { win, old: p.cats }), picks: val('#bd-picks'), win,
          sections: readSections(el, '#bd-secs'), out: $$('.bd-out input:not(:checked)', el).map(i => i.dataset.mid),
          selfOk: el.querySelector('#bd-self').checked, closesAt: el.querySelector('#bd-close').value,
          galaName: el.querySelector('#bd-gname').value.trim() || 'La Nit de les Bandes', galaAt: el.querySelector('#bd-gala').value, galaPlace: el.querySelector('#bd-gplace').value.trim(), finalists: val('#bd-fin'),
          nomFrom: el.querySelector('#bd-nom').value, nomEvery: el.querySelector('#bd-every .pick[aria-pressed="true"]')?.dataset.v === 'all' ? 'all' : 'day',
          galaTime: el.querySelector('#bd-gtime').value, galaDress: el.querySelector('#bd-gdress').value.trim(), program: parseProgram(el.querySelector('#bd-gprog').value),
          closed: el.querySelector('#bd-closed')?.checked ?? !!p.closed, author: ex?.author || authorName(), createdAt: ex?.createdAt || new Date().toISOString() };
      };
      const preview = () => {
        const r = read(), cs = r.cats, nPair = cs.filter(c => c.pair).length;
        el.querySelector('#bd-prev').innerHTML = cs.length ? `<p class="eyebrow u-m-0-0-6">${cs.length} ${cs.length === 1 ? 'categoria' : 'categories'}${nPair ? ` · ${cs.length - nPair} individuals · ${nPair} de parella` : ''}</p>
          <ol class="bd-prev-l">${cs.map(c => `<li><span><b>${esc(c.name)}</b>${c.desc ? `<small>${esc(cutText(c.desc, 90))}</small>` : ''}</span><span class="bd-tags">${c.pair ? '<span class="tag">Parella</span>' : ''}${c.sec ? `<span class="tag">${esc(SEC[c.sec]?.name || c.sec)}</span>` : ''}<span class="m mono">${c.win} ${c.win === 1 ? 'banda' : 'bandes'}</span></span></li>`).join('')}</ol>`
          : '<p class="m u-m-0">Encara no hi ha cap categoria.</p>';
        const n = bandesPeople(r).length, outN = r.out.filter(x => pollExpected(r).some(m => m.id === x)).length;
        el.querySelector('#bd-out-h').textContent = `Hi participen ${n} ${n === 1 ? 'persona' : 'persones'}${outN ? ` (${outN} fora)` : ''}`;
        // Quan sortiran els finalistes: el dia triat o, si no n'hi ha, l'endemà de tancar la votació.
        const range = cs.length ? nomRange(r) : '';
        el.querySelector('#bd-nom-s').textContent = `${r.nomFrom ? '' : 'Si no hi poses res, l’endemà de tancar la votació. '}${range ? `Es revelaran ${range}${r.nomEvery === 'all' || !r.galaAt ? ', totes alhora' : ', una categoria cada dia'}.` : ''}${r.nominees ? ' Ja s’han publicat: si ho canvies, canvia quan es veu cada categoria.' : ''}`;
      };
      let t = null;
      el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 200); });
      el.addEventListener('click', e => { if (e.target.closest('.pick')) setTimeout(preview, 0); });
      preview();
      const check = r => {
        if (!r.title) { toast('Posa un títol'); return false; }
        if (!r.cats.length) { toast('Escriu almenys una categoria'); return false; }
        if (bandesPeople(r).length < 2) { toast('Hi ha de participar almenys dues persones'); return false; }
        if (r.galaAt && r.closesAt && r.galaAt <= r.closesAt) { toast('La Nit ha de ser després de tancar la votació'); return false; }
        if (r.nominees && !r.nomFrom) { toast('Els finalistes ja s’han publicat: posa el dia que es comencen a revelar'); return false; }
        if (r.nomFrom && r.closesAt && !r.closed && r.nomFrom <= r.closesAt) { toast('Els finalistes s’han de revelar després de tancar la votació'); return false; }
        if (r.nomFrom && r.galaAt && r.nomFrom > r.galaAt) { toast('Els finalistes s’han de revelar abans de la Nit (o el mateix dia)'); return false; }
        return true;
      };
      el.querySelector('#bd-save').onclick = () => {
        const r = read();
        if (!check(r)) return;
        S.polls.set(r.id, r); persist('polls', r.id, r, 10);
        closeSheet(); toast(r.draft ? 'Esborrany desat: només el veu l’equip' : 'Votació desada'); render();
      };
      el.querySelector('#bd-pub')?.addEventListener('click', () => {
        const r = read();
        if (!check(r)) return;
        S.polls.set(r.id, r); persist('polls', r.id, r, 10);
        bandesPublish(r.id);
      });
      el.querySelector('#bd-del')?.addEventListener('click', () => {
        const before = clone(ex), votes = [...S.pollVotes].filter(([, v]) => v.pollId === ex.id).map(([k, v]) => [k, clone(v)]);
        S.polls.delete(ex.id); persist('polls', ex.id, null, 10);
        for (const [k] of votes) { S.pollVotes.delete(k); persist('pollVotes', k, null, 30); }
        closeSheet(); render();
        undoable('Votació esborrada', () => { S.polls.set(before.id, before); persist('polls', before.id, before, 10); for (const [k, v] of votes) { S.pollVotes.set(k, v); persist('pollVotes', k, v, 30); } });
      });
    },
  });
}
/** L'anunci que presenta la votació: la presentació, les categories i com es vota. */
function bandesAnnBody(p) {
  const cats = p.cats || [], ind = cats.filter(c => !c.pair), par = cats.filter(c => c.pair);
  const line = c => `- **${c.name}**${c.desc ? `: ${c.desc}` : ''}`;
  return [p.description,
    ind.length ? `${par.length ? 'BANDES INDIVIDUALS\n' : ''}${ind.map(line).join('\n')}` : '',
    par.length ? `BANDES DE PARELLA\n${par.map(line).join('\n')}` : '',
    `**Com es vota:** a l’app, amb el botó d’aquí sota${p.closesAt ? `, fins al ${longDate(p.closesAt).toLowerCase()}` : ''}. El vot és secret: ningú no veu qui has votat.`,
    p.galaAt ? `**${galaName(p)}:** ${longDate(p.galaAt).toLowerCase()}${p.galaTime ? ` a les ${p.galaTime}` : ''}${p.galaPlace ? `, ${p.galaPlace}` : ''}${p.galaDress ? ` (etiqueta: ${p.galaDress.replace(/^./, c => c.toLowerCase())})` : ''}. Abans, a la pàgina de les bandes (menú del compte i Inici) es revelaran els ${+p.finalists || BANDES_FINAL} finalistes de cada categoria, un dia rere l’altre.` : '',
  ].filter(Boolean).join('\n\n').slice(0, 12000);
}
/** Publicar-la: deixa de ser un esborrany, li arriba a tothom i, si es vol, surt un anunci al tauler que la presenta. */
function bandesPublish(pid) {
  const p = S.polls.get(pid);
  if (!p || !p.draft) return;
  const n = bandesPeople(p).length;
  openSheet({
    title: 'Publicar la votació?',
    body: `<p class="u-mt-0">La podran votar <b>${nPl(n, 'persona', 'persones')}</b>${p.closesAt ? ` fins al ${shortDate(p.closesAt)}` : ''}. A qui té les notificacions activades li arribarà un avís al mòbil.</p>
      <div class="toggle-row"><span><b>Publica també un anunci al tauler</b><br><span class="muted u-fs-t-13">Amb la presentació, totes les categories i el botó per votar. L’avís al mòbil serà el de l’anunci.</span></span><label class="switch"><input type="checkbox" id="bp-ann" checked><span></span></label></div>
      <label class="field" id="bp-t-f"><span>Títol de l’anunci</span><input class="inp" id="bp-title" maxlength="90" value="${esc(p.title)}"></label>`,
    foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">Encara no</button><button class="btn btn-primary" id="bp-ok">Publica-la</button>',
    onMount: el => {
      el.querySelector('#bp-ann').onchange = e => { el.querySelector('#bp-t-f').hidden = !e.target.checked; };
      el.querySelector('#bp-ok').onclick = () => {
        const now = new Date().toISOString(), rec = { ...clone(S.polls.get(pid)), draft: false, propOpen: false, createdAt: now, publishedAt: now };
        if (el.querySelector('#bp-ann').checked) {
          const a = { id: uid('n'), title: el.querySelector('#bp-title').value.trim() || rec.title, body: bandesAnnBody(rec), pinned: true, sections: rec.sections || [], until: rec.closesAt || '',
            pollId: rec.id, author: authorName(), by: S.email || '', createdAt: now, updatedAt: now };
          rec.annId = a.id;
          S.announcements.set(a.id, a); persist('announcements', a.id, a, 10);
        }
        S.polls.set(rec.id, rec); persist('polls', rec.id, rec, 10);
        closeSheet(); toast('Votació publicada'); render();
      };
    },
  });
}

/* ---------- Publicar els finalistes (qui porta el tauler) ---------- */
// Primer es tria com es revelen; després es mira com quedarà (la pàgina de les bandes, dia per dia) i només llavors es publica.
// st: el que s'ha triat ({ every, from }), per tornar-hi des de la vista prèvia.
function bandesNominate(pid, st = {}) {
  const p = S.polls.get(pid);
  if (!p || p.draft) return;
  const k = +p.finalists || BANDES_FINAL;
  const t = bandesTally(p, bandesVotes(p), bandesPeople(p));
  const fin = Object.fromEntries(t.cats.map(x => [x.cat.id, bandesFinalists(x.rows, k).sort(byKeyName)]));
  const nomN = nomVotes({ ...p, nominees: fin }, t);
  const after = p.closesAt ? addDays(p.closesAt, 1) : TODAY;
  const from0 = st.from || p.nomFrom || (after > TODAY ? after : TODAY);
  const every0 = st.every || (p.nomEvery === 'all' || !p.galaAt ? 'all' : 'day');
  const stillOpen = !pollClosed(p);
  openSheet({
    title: 'Publicar els finalistes',
    body: `<p class="u-mt-0">Es publiquen els ${k} més votats de cada categoria, per ordre alfabètic i sense els vots${stillOpen ? '. <b>La votació es tanca:</b> ja no s’hi podrà votar' : ''}. Qui guanya no es veu fins que publiquis el palmarès.</p>
      <div class="field"><span>Com es revelen</span><div class="pickers" id="bn-every"><button type="button" class="pick" data-v="day" aria-pressed="${every0 === 'day'}">Una categoria cada dia fins a la Nit</button><button type="button" class="pick" data-v="all" aria-pressed="${every0 === 'all'}">Totes alhora</button></div></div>
      <label class="field"><span>A partir del</span><input class="inp" type="date" id="bn-from" value="${esc(from0)}"></label>
      <p class="m u-m-0" id="bn-plan"></p>
      <details class="np-group"><summary><span>Quants finalistes hi ha a cada categoria</span>${ICON.chev}</summary>
        <ul class="mini-list u-maxh-none">${t.cats.map(x => `<li><span>${esc(x.cat.name)}</span><span class="mono">${fin[x.cat.id].length}${fin[x.cat.id].length > k ? ' · empat' : ''}</span></li>`).join('')}</ul></details>`,
    foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">Encara no</button><button class="btn btn-primary" id="bn-ok">Mira com quedarà</button>',
    onMount: el => {
      const every = () => el.querySelector('#bn-every .pick[aria-pressed="true"]')?.dataset.v || 'all';
      const plan = () => {
        const q = { ...p, nomFrom: el.querySelector('#bn-from').value || from0, nomEvery: every() };
        const when = nomSchedule(q);
        el.querySelector('#bn-plan').textContent = !p.galaAt && every() === 'day' ? 'Per repartir-les fins a la Nit, posa’n el dia a «Edita». Si no, surten totes alhora.'
          : every() === 'all' ? `Surten totes el ${ddmm(when[0])}.` : `Una cada dia, ${nomRange(q)}: la primera, ${catQ((p.cats || [])[0])}; l’última, ${catQ((p.cats || []).slice(-1)[0])}, ${when[when.length - 1] === p.galaAt ? 'el dia de la Nit' : ddmm(when[when.length - 1])}. Cada matí arriba un avís al mòbil.`;
      };
      el.querySelectorAll('#bn-every .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#bn-every .pick').forEach(x => x.setAttribute('aria-pressed', x === b)); plan(); });
      el.querySelector('#bn-from').oninput = plan;
      plan();
      el.querySelector('#bn-ok').onclick = () => bandesNomPreview(pid, { from: el.querySelector('#bn-from').value || from0, every: p.galaAt ? every() : 'all' }, fin, nomN);
    },
  });
}
/** La vista prèvia: la pàgina de les bandes tal com la veurà tothom cada dia que es revelen finalistes (sense sobres). Encara no
 *  s'ha publicat res: «Torna» hi canvia coses i «Publica’ls» ho publica. */
function bandesNomPreview(pid, st, fin, nomN) {
  const p = S.polls.get(pid);
  if (!p) return;
  const q = { ...p, closed: true, nominees: fin, nomN, nomFrom: st.from, nomEvery: st.every };
  const days = [...new Set(nomSchedule(q))].sort();
  let day = days[0];
  const label = d => d === p.galaAt ? `${ddmm(d)} · la Nit` : ddmm(d);
  openSheet({
    title: 'Com quedarà',
    wide: true,
    body: `<p class="u-mt-0 m">Així ho veurà tothom a la pàgina de les bandes${days.length > 1 ? '. Tria un dia per veure què s’hi veu aquell dia' : ''}. <b>Encara no s’ha publicat res.</b>${st.every === 'day' && days.length > 1 ? ' Cada dia, els finalistes nous arriben dins d’un sobre que cadascú obre.' : ''}</p>
      ${days.length > 1 ? `<div class="chips bnp-days" role="group" aria-label="Quin dia">${days.map(d => `<button type="button" class="chip" data-d="${esc(d)}" aria-pressed="${d === day}">${esc(label(d))}</button>`).join('')}</div>` : ''}
      <button class="link-row bnp-ig" id="bnp-ig"><span><b>Imatges per a Instagram</b><small>Una per categoria, amb el pastís dels vots i els finalistes</small></span>${ICON.right}</button>
      <div class="bnp-page" id="bnp-body"></div>`,
    foot: '<button class="btn" id="bnp-back">Torna</button><span class="spacer"></span><button class="btn btn-primary" id="bnp-ok">Publica’ls</button>',
    onMount: el => {
      const draw = () => { const b = el.querySelector('#bnp-body'); b.innerHTML = bandesNomBlock(q, day, true); bnIgDraw(b); };
      el.querySelectorAll('.bnp-days [data-d]').forEach(b => b.onclick = () => {
        day = b.dataset.d;
        el.querySelectorAll('.bnp-days [data-d]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        draw();
      });
      draw();
      el.querySelector('#bnp-back').onclick = () => bandesNominate(pid, st);
      el.querySelector('#bnp-ig').onclick = () => bandesInsta(q, () => bandesNomPreview(pid, st, fin, nomN));
      el.querySelector('#bnp-ok').onclick = () => {
        const now = new Date().toISOString();
        const rec = { ...clone(S.polls.get(pid)), closed: true, nominees: fin, nomN, nomFrom: st.from, nomEvery: st.every, nomAt: now };
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        closeSheet(); toast('Finalistes publicats'); render();
      };
    },
  });
}

/* ---------- Les imatges per a Instagram ---------- */
// Una targeta per categoria, per penjar-la quan se'n revelen els finalistes: el pastís de com s'han repartit tots els vots de la
// categoria (sense dir de qui és cada tros) i els noms dels finalistes per ordre alfabètic. 1080 × 1350 (el format vertical d'Instagram), amb l'estètica de
// la gala: la nit, el lila i el daurat. Es dibuixa en un canvas, amb les lletres de l'app.
const INSTA_W = 1080, INSTA_H = 1350;
// Els colors dels trossos sobre el fons de la nit: els mateixos que el mode fosc (vegeu pieColors i --pie1…--pie7, --pie-g0/1).
const PIE_NIGHT = ['#6A2C9C', '#B38AD9', '#741A3D', '#C42B3A', '#F2801F', '#F9B26A', '#FDE58A'], PIE_NIGHT_G = ['#8DC35E', '#E2EED6'];
/** Barreja dos colors (#rrggbb): t = 0, el primer; t = 1, el segon. */
const mixHex = (a, b, t) => `#${[1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;
const nightColors = n => Array.from({ length: n }, (_, i) => i < PIE_NIGHT.length ? PIE_NIGHT[i]
  : mixHex(PIE_NIGHT_G[0], PIE_NIGHT_G[1], n - PIE_NIGHT.length > 1 ? (i - PIE_NIGHT.length) / (n - PIE_NIGHT.length - 1) : 0));
/** Els vots de cada categoria, de tothom qui n'ha rebut, de més a menys i sense noms: { categoria: [n] }. Els desats en
 *  publicar els finalistes o, per a l'equip (que pot llegir les paperetes), el recompte d'ara. */
function nomVotes(p, t = null) {
  if (p.nomN) return p.nomN;
  t = t || bandesTally(p, bandesVotes(p), bandesPeople(p));
  return Object.fromEntries(t.cats.map(x => [x.cat.id, x.rows.map(r => r.n).filter(n => n > 0).sort((a, b) => b - a)]));
}
/** Les línies d'un text que caben en max píxels (amb la lletra que ja té el context). */
function canvasLines(ctx, words, max, sep = ' ') {
  const out = [];
  let line = [];
  for (const w of words) {
    const next = [...line, w];
    if (line.length && ctx.measureText(next.join(sep)).width > max) { out.push(line); line = [w]; } else line = next;
  }
  if (line.length) out.push(line);
  return out;
}
/** Un text centrat amb les lletres espaiades (els rètols en majúscules). */
function canvasSpaced(ctx, text, cx, y, track) {
  const chars = [...text], w = chars.reduce((n, ch) => n + ctx.measureText(ch).width, 0) + track * (chars.length - 1);
  let x = cx - w / 2;
  ctx.textAlign = 'left';
  for (const ch of chars) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + track; }
  ctx.textAlign = 'center';
}
/** La targeta d'una categoria, com a PNG (Blob). */
async function instaCard(p, c, keys, votes) {
  const F = { k: '700 24px "Hanken Grotesk"', fin: 'italic 500 46px "Bodoni Moda"', d: '400 30px "Hanken Grotesk"', n: '600 40px "Hanken Grotesk"', q: 'italic 500 36px "Bodoni Moda"', s: '500 26px "Hanken Grotesk"' };
  if (document.fonts) await Promise.all([...Object.values(F), '600 100px "Bodoni Moda"'].map(f => document.fonts.load(f).catch(() => {})));
  const cv = document.createElement('canvas');
  cv.width = INSTA_W; cv.height = INSTA_H;
  const x = cv.getContext('2d'), W = INSTA_W, H = INSTA_H, cx = W / 2;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // El fons: la nit, un focus daurat a dalt, dues llums liles a baix i la banda daurada en diagonal.
  x.fillStyle = '#110814'; x.fillRect(0, 0, W, H);
  const glow = (gx, gy, r, col) => { const g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(17,8,20,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  glow(cx, -80, 820, 'rgba(242,213,138,.22)'); glow(90, H + 60, 640, 'rgba(201,167,230,.17)'); glow(W - 90, H + 60, 640, 'rgba(201,167,230,.17)');
  x.save(); x.beginPath(); x.rect(0, 0, W, 520); x.clip(); x.translate(W * .7, -60); x.rotate(-.62); x.fillStyle = 'rgba(242,213,138,.08)'; x.fillRect(0, 0, 70, 700); x.restore();
  // El marc.
  const m = 40, r = 34;
  x.beginPath(); x.roundRect ? x.roundRect(m, m, W - 2 * m, H - 2 * m, r) : x.rect(m, m, W - 2 * m, H - 2 * m);
  x.lineWidth = 2; x.strokeStyle = 'rgba(242,213,138,.38)'; x.stroke();
  // A dalt: de quina Nit és, «Finalistes» i la categoria.
  const year = (p.galaAt || p.closesAt || TODAY).slice(0, 4);
  x.font = F.k; x.fillStyle = '#C9A7E6';
  canvasSpaced(x, `${galaName(p)} ${year}`.toUpperCase(), cx, 132, 4.3);
  x.font = F.fin; x.fillStyle = '#F2D58A'; x.fillText('Finalistes', cx, 204);
  const name = String(c.name || '').replace(/^["“”«»']+|["“”«»']+$/g, '');
  let size = 100, tl;
  for (; size >= 64; size -= 6) { x.font = `600 ${size}px "Bodoni Moda"`; tl = canvasLines(x, name.split(/\s+/), 880); if (tl.length <= 2) break; }
  x.fillStyle = '#F6EEFB';
  let y = 204 + 26 + size * .92;
  for (const l of tl.slice(0, 3)) { x.fillText(l.join(' '), cx, y); y += size * 1.04; }
  y -= size * 1.04;
  // La línia daurada sota el títol.
  const hy = y + 40, hl = x.createLinearGradient(cx - 90, 0, cx + 90, 0);
  hl.addColorStop(0, 'rgba(242,213,138,0)'); hl.addColorStop(.5, '#F2D58A'); hl.addColorStop(1, 'rgba(242,213,138,0)');
  x.fillStyle = hl; x.fillRect(cx - 90, hy, 180, 2);
  y = hy + 22;
  if (c.desc) {
    x.font = F.d; x.fillStyle = '#D9CCE4';
    const dl = canvasLines(x, String(c.desc).split(/\s+/), 820);
    for (const l of dl.slice(0, 3)) { y += 42; x.fillText(l.join(' ') + (l === dl[2] && dl.length > 3 ? '…' : ''), cx, y); }
  }
  // A baix: qui s'endurà la banda i quan es sabrà.
  const foot1 = H - 132, foot2 = H - 88;
  // Els noms, per ordre alfabètic, separats per punts daurats.
  x.font = F.n;
  const names = keys.map(keyName), greedy = canvasLines(x, names, 900, '   ·   ');
  // Les mateixes línies, però repartint els noms a parts iguals (2 i 2, no 3 i 1), si hi caben.
  const per = Math.ceil(names.length / greedy.length), even = Array.from({ length: greedy.length }, (_, i) => names.slice(i * per, (i + 1) * per)).filter(l => l.length);
  const nl = even.length === greedy.length && even.every(l => x.measureText(l.join('   ·   ')).width <= 900) ? even : greedy;
  const nlh = 58, namesTop = foot1 - 96 - nl.length * nlh;
  nl.forEach((l, i) => {
    const yy = namesTop + nlh * (i + .8), full = l.join('   ·   '), w = x.measureText(full).width;
    let xx = cx - w / 2;
    x.textAlign = 'left';
    l.forEach((nm, j) => {
      x.fillStyle = '#F6EEFB'; x.fillText(nm, xx, yy); xx += x.measureText(nm).width;
      if (j < l.length - 1) { x.fillStyle = '#F2D58A'; x.fillText('   ·   ', xx, yy); xx += x.measureText('   ·   ').width; }
    });
    x.textAlign = 'center';
  });
  // El pastís, a l'espai que queda entre la descripció i els noms.
  const top = y + 56, bottom = namesTop - 44, R = Math.max(130, Math.min(250, (bottom - top) / 2 - 18)), py = (top + bottom) / 2;
  const total = votes.reduce((a, b) => a + b, 0), fills = nightColors(votes.length);
  x.beginPath(); x.arc(cx, py, R + 18, 0, 2 * Math.PI); x.lineWidth = 2; x.strokeStyle = 'rgba(242,213,138,.32)'; x.stroke();
  if (total) {
    let a = -Math.PI / 2;
    const marks = [];
    votes.forEach((v, i) => {
      if (!v) return;
      const b = a + v / total * 2 * Math.PI;
      x.beginPath(); x.moveTo(cx, py); x.arc(cx, py, R, a, b); x.closePath();
      x.fillStyle = fills[i]; x.fill();
      x.lineWidth = votes.length > 14 ? 3 : 5; x.lineJoin = 'round'; x.strokeStyle = '#110814'; x.stroke();
      // El percentatge, petit, dins dels trossos on hi cap.
      if (v / total >= .045) marks.push({ m: (a + b) / 2, t: `${Math.round(v / total * 100)}%`, dk: pieLight(i) });
      a = b;
    });
    x.font = `600 ${Math.round(R * .12)}px "Hanken Grotesk"`; x.textBaseline = 'middle';
    for (const k of marks) { x.fillStyle = k.dk ? 'rgba(28,16,36,.72)' : 'rgba(255,255,255,.9)'; x.fillText(k.t, cx + R * .68 * Math.cos(k.m), py + R * .68 * Math.sin(k.m)); }
    x.textBaseline = 'alphabetic';
  }
  x.font = F.q; x.fillStyle = '#F2D58A'; x.fillText('Qui s’endurà la banda?', cx, foot1);
  x.font = F.s; x.fillStyle = '#A898B8';
  x.fillText(p.galaAt ? `Ho sabrem el ${fmtD(p.galaAt, { day: 'numeric', month: 'long' })}${p.galaPlace ? `, ${p.galaPlace}` : ''}` : 'Ho sabrem a la Nit', cx, foot2);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([''], 'a.png', { type: 'image/png' })] }); } catch { return false; } };
/** Comparteix les imatges (al mòbil, cap a Instagram o on sigui) o, si el navegador no pot, les desa. */
async function shareOrSave(files) {
  if (canShareFiles()) {
    try { await navigator.share({ files }); } catch (e) { if (e?.name !== 'AbortError') toast('No s’han pogut compartir. Torna-ho a provar.'); }
    return;
  }
  for (const f of files) {
    const a = document.createElement('a'), url = URL.createObjectURL(f);
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
/** Les imatges per a Instagram de totes les categories. p: la votació amb els finalistes (també la de la vista prèvia, encara
 *  sense publicar). back: on es torna. */
function bandesInsta(p, back = null) {
  const cats = (p.cats || []).filter(c => (p.nominees?.[c.id] || []).length);
  if (!cats.length) { toast('Encara no hi ha finalistes'); return; }
  const votes = nomVotes(p), share = canShareFiles(), urls = [];
  const slug = s => normText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'categoria';
  openSheet({
    title: 'Imatges per a Instagram',
    wide: true,
    body: `<p class="u-mt-0 m">Una per categoria, en el format vertical d’Instagram (1080 × 1350). El pastís diu com s’han repartit tots els vots de la categoria, però no de qui és cada tros: els noms dels finalistes van per ordre alfabètic.</p>
      <div class="ig-grid">${cats.map(c => `<figure class="ig-it" data-c="${esc(c.id)}"><div class="ig-ph"><span class="sk"></span></div>
        <figcaption><span>${esc(c.name)}</span><button type="button" class="btn btn-sm" data-ig="${esc(c.id)}" disabled>${share ? 'Comparteix' : 'Desa'}</button></figcaption></figure>`).join('')}</div>`,
    foot: `${back ? '<button class="btn" id="ig-back">Torna</button>' : ''}<span class="spacer"></span>${cats.length > 1 ? `<button class="btn btn-primary" id="ig-all" disabled>${share ? 'Comparteix-les totes' : 'Desa-les totes'}</button>` : ''}`,
    onMount: async el => {
      const files = new Map();
      const close0 = sheetClose;
      sheetClose = () => { urls.forEach(u => URL.revokeObjectURL(u)); close0(); };
      el.querySelector('#ig-back')?.addEventListener('click', () => back());
      el.querySelectorAll('[data-ig]').forEach(b => b.onclick = () => { const f = files.get(b.dataset.ig); if (f) shareOrSave([f]); });
      el.querySelector('#ig-all')?.addEventListener('click', () => shareOrSave(cats.map(c => files.get(c.id)).filter(Boolean)));
      for (const c of cats) {
        const blob = await instaCard(p, c, p.nominees[c.id], votes[c.id] || []);
        if (!el.isConnected || !blob) return;
        const f = new File([blob], `finalistes-${slug(c.name)}.png`, { type: 'image/png' }), url = URL.createObjectURL(blob);
        files.set(c.id, f); urls.push(url);
        const it = el.querySelector(`.ig-it[data-c="${CSS.escape(c.id)}"]`);
        it.querySelector('.ig-ph').innerHTML = `<img src="${url}" alt="${esc(`Finalistes de ${c.name}: ${p.nominees[c.id].map(keyName).join(', ')}`)}">`;
        it.querySelector('[data-ig]').disabled = false;
      }
      const all = el.querySelector('#ig-all'); if (all) all.disabled = false;
    },
  });
}

/* ---------- Els diplomes ---------- */
/** Un diploma per persona i banda (a les de parella, un per a cadascú, amb el nom de l'altra). winners: { categoria: [claus] }. */
function diplomaList(p, winners, only) {
  const out = [];
  for (const c of p.cats || []) for (const k of winners[c.id] || []) {
    const ids = keyIds(k);
    for (const id of ids) if (!only || id === only) out.push({ cat: c, id, with: ids.filter(x => x !== id) });
  }
  return out;
}
function printDiplomas(p, winners, only) {
  const list = diplomaList(p, winners, only);
  if (!list.length) { toast('Encara no hi ha cap banda per imprimir'); return; }
  const accent = /^#[0-9a-f]{6}$/i.test(S.config.brand?.accent || '') ? S.config.brand.accent : '#5A3577';
  const logo = S.config.brand?.logo || '', year = (p.galaAt || p.closesAt || TODAY).slice(0, 4);
  const when = fmtD(p.galaAt || TODAY, { day: 'numeric', month: 'long', year: 'numeric' });
  printDoc(`Diplomes · ${p.title}`, list.map(x => `<section class="pr-dip">
      <svg class="pr-dip-sash" viewBox="0 0 100 100" aria-hidden="true"><path d="M0 58 58 0h18L0 76z" fill="${accent}"/></svg>
      ${logo ? `<img class="pr-dip-logo" src="${esc(logo)}" alt="">` : ''}
      <p class="pr-dip-k">${esc(S.config.name || '')}</p>
      <p class="pr-dip-e">${esc(galaName(p))} · ${year}</p>
      <h1 class="pr-dip-t">${esc(x.cat.name)}</h1>
      ${x.cat.desc ? `<p class="pr-dip-d">${esc(x.cat.desc)}</p>` : ''}
      <p class="pr-dip-a">Banda atorgada a</p>
      <p class="pr-dip-n">${esc(bdName(x.id))}</p>
      ${x.with.length ? `<p class="pr-dip-w">amb ${esc(x.with.map(bdName).join(' i '))}</p>` : ''}
      <p class="pr-dip-f">Per votació de ${esc(V.tot)} · ${esc(p.galaPlace ? `${p.galaPlace}, ` : '')}${esc(when)}</p>
    </section>`).join(''));
}
