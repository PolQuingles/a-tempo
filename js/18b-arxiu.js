// A Tempo · 18b-arxiu.js — L'arxiu de partitures en paper: qui en té, qui no i qui ja l'ha tornada, obra per obra.
// Cada partitura està personalitzada (porta el nom de qui la canta). Per a cada producció i obra, l'arxiver de cada corda la
// reparteix i, en acabar la producció, la recull: A repartir → Repartida → Retornada.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Dades ---------- */
// scores/<producció>_<obra>_<corda> = { prodId, workId, section, marks: { <membre>: { s: 'given' | 'returned', at, by } } }
// Un document per corda, com les llistes: així l'arxiver d'una corda només en pot tocar el de la seva (vegeu les regles).
S.scores = new Map();
const SCORE_STATES = [['', 'A repartir'], ['given', 'Repartida'], ['returned', 'Retornada']];
const SCORE_CLS = { '': 'pend', given: 'given', returned: 'returned' };
const scoreKey = (pid, wid, sec) => `${pid}_${wid}_${sec}`;
/** On és la partitura d'aquesta persona: '' (encara no l'hi han donat), 'given' (la té) o 'returned' (l'ha tornada). */
const scoreOf = (pid, wid, m) => S.scores.get(scoreKey(pid, wid, m.section))?.marks?.[m.id]?.s || '';
/** És l'arxiver d'alguna corda (el de la seva, que porta a section). */
const isArchivist = () => iHave('archive');
const archiveSec = () => isArchivist() ? (ME()?.section || '') : '';
/** Pot repartir i recollir les d'aquesta corda: l'equip, totes; l'arxiver, les de la seva. */
const canScores = sec => canEdit() || (isArchivist() && archiveSec() === sec);
/** Veu l'arxiu sencer (l'estat de tothom): l'equip i els arxivers. */
const seesArchive = () => canEdit() || isArchivist();
/** Qui ha de tenir les partitures d'una producció: qui la fa (actiu i que no n'és fora). */
const scorePeople = (pid, sec) => membersOf(sec || null).filter(m => !isExcluded(pid, m.id));
/** El recompte d'una obra (d'una corda o de totes) i en quin punt és: 'todo' | 'given' | 'returned' ('' si no hi ha ningú). */
function scoreSummary(pid, wid, sec) {
  const ms = scorePeople(pid, sec);
  let given = 0, returned = 0;
  for (const m of ms) { const s = scoreOf(pid, wid, m); if (s) given++; if (s === 'returned') returned++; }
  const n = ms.length;
  return { n, given, returned, state: !n ? '' : returned === n ? 'returned' : given === n ? 'given' : 'todo' };
}
/** Canvia l'estat de la partitura d'una persona. */
function setScore(pid, wid, m, s) {
  const key = scoreKey(pid, wid, m.section);
  const doc = clone(S.scores.get(key) || { prodId: pid, workId: wid, section: m.section, marks: {} });
  doc.marks = doc.marks || {};
  if (s) doc.marks[m.id] = { s, at: new Date().toISOString(), by: myEmail() || '' };
  else delete doc.marks[m.id];
  doc.updatedAt = new Date().toISOString();
  S.scores.set(key, doc);
  persist('scores', key, doc, 600);
}

/* ---------- Al repertori ---------- */
/** L'indicador de cada obra. L'equip i els arxivers hi veuen com va tota la corda (o tot el cor); cada cantaire, la seva. */
function scorePill(pid, w) {
  if (!pid || !(w.prods || []).includes(pid)) return '';
  if (seesArchive()) {
    const x = scoreSummary(pid, w.id, archiveSec() && !canEdit() ? archiveSec() : '');
    if (!x.state) return '';
    const count = x.state === 'todo' ? ` · ${x.given}/${x.n}` : x.state === 'given' && x.returned ? ` · ${x.returned}/${x.n} retornades` : '';
    return `<span class="sc-pill ${SCORE_CLS[x.state === 'todo' ? '' : x.state]}">${scoreLabel(x.state)}${count}</span>`;
  }
  const me = S.members.get(myMemberId());
  if (!me || isExcluded(pid, me.id)) return '';
  const s = scoreOf(pid, w.id, me);
  return `<span class="sc-pill ${SCORE_CLS[s]}" title="La teva partitura">${scoreLabel(s)}</span>`;
}
const scoreLabel = s => ({ todo: 'A repartir', '': 'A repartir', given: 'Repartida', returned: 'Retornada' }[s] || '');
/** Sota de les obres: el resum de l'arxiu i el botó per obrir-lo (equip i arxivers). */
function archivePanel(prod, works) {
  if (!prod || !works.length || !seesArchive()) return '';
  const sec = archiveSec() && !canEdit() ? archiveSec() : '';
  const st = works.map(w => scoreSummary(prod.id, w.id, sec).state).filter(Boolean);
  const n = k => st.filter(x => x === k).length;
  const bits = [[n('todo'), 'a repartir'], [n('given'), n('given') === 1 ? 'repartida' : 'repartides'], [n('returned'), n('returned') === 1 ? 'retornada' : 'retornades']].filter(([k]) => k).map(([k, l]) => `${k} ${l}`);
  return `<div class="panel arx-panel"><span><b>Arxiu de partitures</b>${sec ? ` · ${esc(SEC[sec].name)}` : ''}<br><span class="muted">${bits.join(' · ') || 'Cap obra'}</span></span>
    <span style="display:flex;gap:6px;flex-wrap:wrap">${myArchSection() ? `<button class="btn btn-sm" data-act="msg-new" data-pid="${esc(prod.id)}">Avisa la ${esc(V.section)}</button>` : ''}<button class="btn btn-sm" data-act="archive" data-pid="${esc(prod.id)}">Estadístiques de l’arxiu</button></span></div>`;
}
/** El missatge que proposa «Avisa la corda» a l'arxiver: recordar que cal tornar les partitures de la producció. */
function scoreReminder(pid) {
  const prod = S.productions.get(pid);
  const name = prod?.name || 'la producció';
  return { title: `Partitures de ${name}`, body: `Recordeu tornar-me les partitures de ${name} al pròxim assaig. Gràcies!` };
}
/** A la fitxa d'una obra: la partitura en paper d'aquesta producció. */
function scoreBox(pid, w) {
  if (!pid || !(w.prods || []).includes(pid)) return '';
  const prod = S.productions.get(pid);
  if (seesArchive()) {
    const sec = archiveSec() && !canEdit() ? archiveSec() : '';
    const x = scoreSummary(pid, w.id, sec);
    return `<div class="section-title" style="margin-top:14px"><h2 class="h2">Partitures en paper</h2>${scorePill(pid, w)}</div>
      <div class="panel arx-panel"><span class="muted">${esc(prod?.name || '')}${sec ? ` · ${esc(SEC[sec].name)}` : ''}: ${x.given} de ${x.n} repartides · ${x.returned} ${x.returned === 1 ? 'retornada' : 'retornades'}</span>
        <button class="btn btn-sm btn-primary" data-act="score-work" data-pid="${esc(pid)}" data-id="${esc(w.id)}">Reparteix o recull</button></div>`;
  }
  const me = S.members.get(myMemberId());
  if (!me || isExcluded(pid, me.id)) return '';
  const s = scoreOf(pid, w.id, me);
  return `<div class="section-title" style="margin-top:14px"><h2 class="h2">La teva partitura</h2>${scorePill(pid, w)}</div>
    <p class="muted" style="margin:0 2px;font-size:calc(13px*var(--ts))">${s === 'given' ? `La tens tu. En acabar ${esc(prod?.name || 'la producció')}, torna-la a l’arxiver de la teva ${esc(V.section)}.` : s === 'returned' ? 'Ja l’has tornada a l’arxiu. Gràcies!' : `Encara no te l’han donada: te la donarà l’arxiver de la teva ${esc(V.section)}.`}</p>`;
}

/* ---------- Repartir i recollir una obra ---------- */
function sheetScoreWork(pid, wid, sec0) {
  const prod = S.productions.get(pid), w = S.works.get(wid);
  if (!prod || !w || !seesArchive()) return;
  let sec = sec0 || archiveSec() || SECTIONS[0]?.id || '';
  const paint = el => {
    const ms = scorePeople(pid, sec), can = canScores(sec), x = scoreSummary(pid, wid, sec);
    el.querySelectorAll('#sw-sec .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec)));
    el.querySelector('#sw-sum').innerHTML = `<span class="sc-pill ${SCORE_CLS[x.state === 'todo' ? '' : x.state]}">${scoreLabel(x.state)}</span>
      <span class="muted">${x.given} de ${x.n} repartides · ${x.returned} ${x.returned === 1 ? 'retornada' : 'retornades'}</span>`;
    el.querySelector('#sw-bulk').hidden = !can || !ms.length;
    el.querySelector('#sw-list').innerHTML = ms.length ? ms.map(m => {
      const s = scoreOf(pid, wid, m);
      return `<li class="sw-row" data-mid="${esc(m.id)}"><span class="sw-n">${esc(m.name)}${m.part ? ` <span class="part">${esc(partTag(m))}</span>` : ''}</span>
        <span class="seg3 sw-seg" role="radiogroup" aria-label="${esc(m.name)}">${SCORE_STATES.map(([k, l]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${s === k}" ${can ? '' : 'disabled'}>${l}</button>`).join('')}</span></li>`;
    }).join('') : `<li class="muted" style="padding:12px 2px">Ningú d’aquesta ${esc(V.section)} fa la producció.</li>`;
    el.querySelectorAll('.sw-row').forEach(r => r.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
      const m = S.members.get(r.dataset.mid);
      if (!m || !canScores(m.section)) return;
      setScore(pid, wid, m, b.dataset.k); paint(el);
    }));
    el.querySelector('#sw-note').textContent = can ? '' : `Les d’aquesta ${V.section} les porta el seu arxiver.`;
  };
  openSheet({
    title: w.title,
    wide: true,
    body: `<p class="muted" style="margin:0 0 10px;font-size:calc(13.5px*var(--ts))">${esc(prod.name)} · cada partitura porta el nom de qui la canta. Marca-la quan la donis i quan te la tornin.</p>
      <div class="chips" id="sw-sec" role="group" aria-label="${esc(V.Section)}">${SECTIONS.map(x => `<button class="chip" data-sec="${esc(x.id)}" aria-pressed="${x.id === sec}">${esc(x.name)}</button>`).join('')}</div>
      <div class="sw-sum" id="sw-sum"></div>
      <div class="sw-bulk" id="sw-bulk"><button type="button" class="btn btn-sm" data-bulk="given">Totes repartides</button><button type="button" class="btn btn-sm" data-bulk="returned">Totes retornades</button></div>
      <ul class="sw-list" id="sw-list"></ul>
      <p class="muted" id="sw-note" style="margin:8px 2px 0;font-size:calc(13px*var(--ts))"></p>`,
    foot: `<button class="btn" data-act="archive" data-pid="${esc(pid)}">Tot l’arxiu</button><span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Fet</button>`,
    onMount: el => {
      el.querySelectorAll('#sw-sec .chip').forEach(b => b.onclick = () => { sec = b.dataset.sec; paint(el); });
      el.querySelectorAll('#sw-bulk [data-bulk]').forEach(b => b.onclick = () => {
        if (!canScores(sec)) return;
        const to = b.dataset.bulk, ms = scorePeople(pid, sec);
        // «Totes repartides» no toca les que ja han tornat; «Totes retornades», només les que algú té.
        const touch = ms.filter(m => { const s = scoreOf(pid, wid, m); return to === 'given' ? s === '' : s === 'given'; });
        if (!touch.length) { toast(to === 'given' ? 'Ja estan totes repartides' : 'Ningú no en té cap per tornar'); return; }
        const before = touch.map(m => [m, scoreOf(pid, wid, m)]);
        for (const m of touch) setScore(pid, wid, m, to);
        paint(el);
        toast(`${touch.length} ${to === 'given' ? 'repartides' : 'retornades'}`, { label: 'Desfés', run: () => { for (const [m, s] of before) setScore(pid, wid, m, s); if (el.isConnected) paint(el); render(); } });
      });
      paint(el);
    },
  });
}

/* ---------- Estadístiques de l'arxiu ---------- */
function sheetArchive(pid) {
  const prod = S.productions.get(pid);
  if (!prod || !seesArchive()) return;
  const works = worksOf(pid);
  let sec = archiveSec() && !canEdit() ? archiveSec() : '';
  const draw = el => {
    el.querySelectorAll('#ax-sec .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec)));
    const ms = scorePeople(pid, sec).sort((a, b) => SECTIONS.findIndex(x => x.id === a.section) - SECTIONS.findIndex(x => x.id === b.section) || byName(a, b));
    let given = 0, returned = 0;
    const cells = new Map(ms.map(m => [m.id, works.map(w => { const s = scoreOf(pid, w.id, m); if (s) given++; if (s === 'returned') returned++; return s; })]));
    const total = ms.length * works.length;
    const pctOf = n => total ? Math.round(n / total * 100) : 0;
    const toGive = ms.map(m => ({ m, ws: works.filter((w, i) => cells.get(m.id)[i] === '') })).filter(x => x.ws.length);
    const toReturn = ms.map(m => ({ m, ws: works.filter((w, i) => cells.get(m.id)[i] === 'given') })).filter(x => x.ws.length);
    const ended = allSessions(pid).every(s => s.date < TODAY);
    const who = list => list.map(({ m, ws }) => `<li><span><b>${esc(m.name)}</b><br><span class="m">${esc(SEC[m.section].name)} · ${esc(ws.map(w => w.title).join(', '))}</span></span></li>`).join('');
    const text = (title, list) => `${title} · ${prod.name}\n` + list.map(({ m, ws }) => `- ${fullName(m.name)} (${SEC[m.section].name}): ${ws.map(w => w.title).join(', ')}`).join('\n');
    el.querySelector('#ax-body').innerHTML = !works.length ? `<p class="muted">Aquesta producció encara no té obres al repertori.</p>` : `
      <div class="ax-kpis">
        <div><b>${given - returned}</b><span>a les mans</span></div>
        <div><b>${total - given}</b><span>per repartir</span></div>
        <div><b>${returned}</b><span>${returned === 1 ? 'retornada' : 'retornades'}</span></div>
      </div>
      <span class="ax-bar" role="img" aria-label="${pctOf(returned)}% retornades, ${pctOf(given - returned)}% repartides, ${pctOf(total - given)}% per repartir"><i class="returned" style="width:${pctOf(returned)}%"></i><i class="given" style="width:${pctOf(given - returned)}%"></i></span>
      <div class="section-title"><h2 class="h2">Obra per obra</h2></div>
      <ul class="ax-works">${works.map(w => { const x = scoreSummary(pid, w.id, sec); return `<li><button data-act="score-work" data-pid="${esc(pid)}" data-id="${esc(w.id)}" data-sec="${esc(sec || archiveSec() || '')}">
        <span class="ax-w"><b>${esc(w.title)}</b><small>${x.given} de ${x.n} repartides · ${x.returned} ${x.returned === 1 ? 'retornada' : 'retornades'}</small></span><span class="sc-pill ${SCORE_CLS[x.state === 'todo' ? '' : x.state]}">${scoreLabel(x.state)}</span></button></li>`; }).join('')}</ul>
      ${toGive.length ? `<div class="section-title"><h2 class="h2">Falten per repartir</h2><button class="btn btn-sm btn-ghost" id="ax-cp-give">Copia la llista</button></div><ul class="mini-list" style="max-height:none">${who(toGive)}</ul>` : ''}
      ${toReturn.length ? `<div class="section-title"><h2 class="h2">${ended ? 'Falten per retornar' : 'Les tenen ara'}</h2><button class="btn btn-sm btn-ghost" id="ax-cp-ret">Copia la llista</button></div><ul class="mini-list" style="max-height:none">${who(toReturn)}</ul>` : ''}
      <div class="section-title"><h2 class="h2">Qui té què</h2><span class="ax-legend"><i class="pend"></i>A repartir <i class="given"></i>Repartida <i class="returned"></i>Retornada</span></div>
      <div class="table-wrap"><table class="dtable ax-table"><thead><tr><th>${esc(V.Member)}</th>${works.map(w => `<th title="${esc(w.title)}">${esc(w.title)}</th>`).join('')}</tr></thead>
        <tbody>${ms.map(m => `<tr><td><b>${esc(m.name)}</b> <span class="m">${esc(SEC[m.section].short)}</span></td>${cells.get(m.id).map((s, i) => `<td class="ax-c ${SCORE_CLS[s]}" title="${esc(works[i].title)}: ${scoreLabel(s)}">${s === 'returned' ? '↩' : s === 'given' ? '✓' : '·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    el.querySelector('#ax-cp-give')?.addEventListener('click', () => copyText(text('Partitures per repartir', toGive), 'Llista copiada'));
    el.querySelector('#ax-cp-ret')?.addEventListener('click', () => copyText(text(ended ? 'Partitures per retornar' : 'Partitures repartides', toReturn), 'Llista copiada'));
  };
  openSheet({
    title: 'Arxiu de partitures',
    wide: true,
    body: `<p class="muted" style="margin:0 0 10px;font-size:calc(13.5px*var(--ts))">${esc(prod.name)} · ${works.length} ${works.length === 1 ? 'obra' : 'obres'}</p>
      <div class="chips" id="ax-sec" role="group" aria-label="${esc(V.Section)}"><button class="chip" data-sec="" aria-pressed="${!sec}">${esc(capz(V.tot))}</button>${SECTIONS.map(x => `<button class="chip" data-sec="${esc(x.id)}" aria-pressed="${x.id === sec}">${esc(x.name)}</button>`).join('')}</div>
      <div id="ax-body"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button>`,
    onMount: el => {
      el.querySelectorAll('#ax-sec .chip').forEach(b => b.onclick = () => { sec = b.dataset.sec; draw(el); });
      draw(el);
    },
  });
}

/* ---------- Per fer de l'arxiver ---------- */
/** A Inici: si li toca repartir (la producció comença d'aquí a tres setmanes o ja ha començat) o recollir (ja s'ha acabat). */
function archiveTodos() {
  const sec = archiveSec();
  if (!sec) return [];
  const out = [];
  for (const p of productionsSorted()) {
    const ss = allSessions(p.id), works = worksOf(p.id);
    if (!ss.length || !works.length) continue;
    const first = ss[0].date, last = ss[ss.length - 1].date;
    const ms = scorePeople(p.id, sec);
    const give = ms.reduce((n, m) => n + works.filter(w => scoreOf(p.id, w.id, m) === '').length, 0);
    const back = ms.reduce((n, m) => n + works.filter(w => scoreOf(p.id, w.id, m) === 'given').length, 0);
    if (last >= TODAY && first <= addDays(TODAY, 21) && give) out.push({ icon: 'score', t: `${give === 1 ? '1 partitura' : `${give} partitures`} per repartir`, s: `${esc(p.name)} · ${esc(SEC[sec].name)}`, btn: 'Arxiu', act: `data-act="archive" data-pid="${esc(p.id)}"`, n: 1 });
    if (last < TODAY && last >= addDays(TODAY, -60) && back) out.push({ icon: 'score', t: `${back === 1 ? '1 partitura' : `${back} partitures`} per recollir`, s: `${esc(p.name)} ja s’ha acabat · ${esc(SEC[sec].name)}`, btn: 'Arxiu', act: `data-act="archive" data-pid="${esc(p.id)}"`, n: 1 });
  }
  return out;
}
