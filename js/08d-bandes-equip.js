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
function bandesNominate(pid) {
  const p = S.polls.get(pid);
  if (!p || p.draft) return;
  const k = +p.finalists || BANDES_FINAL;
  const t = bandesTally(p, bandesVotes(p), bandesPeople(p));
  const fin = Object.fromEntries(t.cats.map(x => [x.cat.id, bandesFinalists(x.rows, k).sort(byKeyName)]));
  const after = p.closesAt ? addDays(p.closesAt, 1) : TODAY;
  const from0 = p.nomFrom || (after > TODAY ? after : TODAY);
  const stillOpen = !pollClosed(p);
  openSheet({
    title: 'Publicar els finalistes?',
    body: `<p class="u-mt-0">Es publiquen els ${k} més votats de cada categoria, per ordre alfabètic i sense els vots${stillOpen ? '. <b>La votació es tanca:</b> ja no s’hi podrà votar' : ''}. Qui guanya no es veu fins que publiquis el palmarès.</p>
      <div class="field"><span>Com es revelen</span><div class="pickers" id="bn-every"><button type="button" class="pick" data-v="day" aria-pressed="${p.nomEvery !== 'all' && !!p.galaAt}">Una categoria cada dia fins a la Nit</button><button type="button" class="pick" data-v="all" aria-pressed="${p.nomEvery === 'all' || !p.galaAt}">Totes alhora</button></div></div>
      <label class="field"><span>A partir del</span><input class="inp" type="date" id="bn-from" value="${esc(from0)}"></label>
      <p class="m u-m-0" id="bn-plan"></p>
      <details class="np-group"><summary><span>Quants finalistes hi ha a cada categoria</span>${ICON.chev}</summary>
        <ul class="mini-list u-maxh-none">${t.cats.map(x => `<li><span>${esc(x.cat.name)}</span><span class="mono">${fin[x.cat.id].length}${fin[x.cat.id].length > k ? ' · empat' : ''}</span></li>`).join('')}</ul></details>`,
    foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">Encara no</button><button class="btn btn-primary" id="bn-ok">Publica’ls</button>',
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
      el.querySelector('#bn-ok').onclick = () => {
        const now = new Date().toISOString();
        const rec = { ...clone(S.polls.get(pid)), closed: true, nominees: fin, nomFrom: el.querySelector('#bn-from').value || from0, nomEvery: p.galaAt ? every() : 'all', nomAt: now };
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        closeSheet(); toast('Finalistes publicats'); render();
      };
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
