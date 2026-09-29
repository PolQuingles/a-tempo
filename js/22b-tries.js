// A Tempo · 22b-tries.js — Dues maneres de funcionar que tria cada agrupació a Ajustos › Cantaires:
//   · Llistes privades (config/main.attPrivate): cada cantaire només veu la seva assistència, no la dels altres.
//   · Tria de produccions (config/main.prodChoice + prodChoiceMin): cada cantaire diu quines produccions de la temporada
//     farà, amb un mínim (per defecte, el 60%). Qui diu que no en fa una hi compta com «no fa», com si l'haguessin tret.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Llistes privades ---------- */
// Les llistes es desen per sessió i corda (attendance/<sessió>_<corda>), amb les marques de tothom: les regles no poden
// ensenyar només un tros d'un document. Per això, amb les llistes privades, qui passa llista també en desa una còpia per
// persona, attMine/<membre> = { memberId, marks: { <sessió>: { s, min?, note? } } }, i cada cantaire només llegeix la seva.
const attPrivate = () => !!S.config.attPrivate;
/** Qui no pot veure les llistes dels altres: tothom qui no les passa, amb les llistes privades. */
const attHidden = () => attPrivate() && !canEdit();

const MIRROR = { q: new Map(), timer: 0 };
/** Apunta el canvi d'una marca a la còpia de la persona; s'escriuen totes juntes al cap d'un moment. */
function queueMirror(mid, sid, mark) {
  const cur = MIRROR.q.get(mid) || new Map();
  cur.set(sid, mark && mark.s ? mirrorMark(mark) : null);
  MIRROR.q.set(mid, cur);
  clearTimeout(MIRROR.timer);
  MIRROR.timer = setTimeout(flushMirrors, 1500);
}
const mirrorMark = mk => Object.fromEntries(['s', 'min', 'note'].filter(k => mk[k] != null && mk[k] !== '').map(k => [k, mk[k]]));
function flushMirrors() {
  if (!MIRROR.q.size || !db || PREVIEW) { MIRROR.q.clear(); return; }
  const FP = firebase.firestore.FieldPath, del = firebase.firestore.FieldValue.delete();
  const b = fs.batch();
  for (const [mid, sids] of MIRROR.q) {
    const data = { memberId: mid, marks: {} }, fields = [new FP('memberId')];
    for (const [sid, v] of sids) { data.marks[sid] = v || del; fields.push(new FP('marks', sid)); }
    b.set(db.doc(`attMine/${mid}`), data, { mergeFields: fields });
  }
  MIRROR.q.clear();
  b.commit().catch(writeFailed);
}
/** Les marques que han canviat entre dues versions d'una llista, per a les còpies de cadascú. */
function mirrorDiff(prev, doc) {
  const a = (prev && prev.marks) || {}, b = (doc && doc.marks) || {}, out = [];
  for (const mid of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(mirrorMark(a[mid] || {})) !== JSON.stringify(mirrorMark(b[mid] || {}))) out.push([mid, b[mid] || null]);
  }
  return out;
}
/** Una llista desada: si les llistes són privades, també les còpies de les persones que hi han canviat. */
function mirrorSaved(prev, doc) {
  if (!attPrivate() || PREVIEW) return;
  for (const [mid, mk] of mirrorDiff(prev, doc)) queueMirror(mid, doc.sessionId, mk);
}
/** Totes les còpies de nou, a partir de totes les llistes (en activar les llistes privades). Torna quantes n'ha escrit. */
async function rebuildMirrors(say) {
  const per = new Map([...S.members.keys()].map(id => [id, {}]));
  for (const d of allAttendance().values()) {
    for (const [mid, mk] of Object.entries(d.marks || {})) {
      if (!mk || !mk.s || !d.sessionId) continue;
      if (!per.has(mid)) per.set(mid, {});
      per.get(mid)[d.sessionId] = mirrorMark(mk);
    }
  }
  const all = [...per];
  for (let i = 0; i < all.length; i += 400) {
    const b = fs.batch();
    for (const [mid, marks] of all.slice(i, i + 400)) b.set(db.doc(`attMine/${mid}`), { memberId: mid, marks });
    await b.commit();
    say?.(Math.min(all.length, i + 400), all.length);
  }
  return all.length;
}
/** L'interruptor d'Ajustos. En activar-lo, primer es fan les còpies de tothom, perquè ningú es quedi sense la seva. */
async function setAttPrivate(on) {
  if (!on) {
    if (!await confirmSheet('Llistes obertes a tothom?', `Tots els ${esc(V.members)} podran tornar a veure les llistes d’assistència i les estadístiques de tothom.`, 'Obre-les', false)) { render(); return; }
    saveConfig({ attPrivate: false }); toast('Les llistes tornen a ser visibles per a tothom'); render(); return;
  }
  if (!await confirmSheet('Llistes privades?', `Cada ${esc(V.member)} només veurà la seva assistència. Les llistes, les estadístiques i el risc de tothom només els veurà l’equip (administració, direcció, gerència, secretaria i ${esc(V.leaders)}).`, 'Fes-les privades', false)) { render(); return; }
  if (PREVIEW) { previewBlocked(); return; }
  try {
    toast('Preparant l’assistència de cadascú…');
    const n = await rebuildMirrors();
    saveConfig({ attPrivate: true });
    toast(`Llistes privades: cadascú veu només la seva (${n} ${V.members})`);
  } catch { toast('No s’ha pogut fer. Comprova la connexió i torna-ho a provar.'); }
  render();
}
/** Una llista que ha passat algú sense permís d'escriure les còpies (un substitut): la primera persona de l'equip que la veu
 *  en fa les còpies i hi treu la marca. */
function mirrorPending() {
  if (!attPrivate() || !canEdit() || PREVIEW) return;
  for (const [key, d] of S.attendance) {
    if (!d.unmirrored || isDirty(`attendance/${key}`)) continue;
    for (const [mid, mk] of Object.entries(d.marks || {})) queueMirror(mid, d.sessionId, mk);
    const next = { ...d }; delete next.unmirrored;
    S.attendance.set(key, next); persist('attendance', key, next, 2000);
  }
}
/** Amb les llistes privades, un cantaire llegeix només la seva còpia i en fa unes llistes d'una sola persona. Si fa de
 *  substitut, també la llista sencera de la sessió i corda que passa (les regles l'hi deixen llegir mentre dura). */
const PRIV = { mine: new Map(), subs: new Map(), watch: new Map(), loaded: new Set(), done: null };
const privApply = () => { S.attendance = new Map([...PRIV.mine, ...PRIV.subs]); };
function watchMyMarks(done) {
  const mid = S.memberId;
  PRIV.done = done;
  if (!mid || !db) { privApply(); done(); return; }
  db.doc(`attMine/${mid}`).onSnapshot(snap => {
    const m = S.members.get(mid), sec = m ? m.section : '';
    const marks = (snap.exists && snap.data().marks) || {};
    PRIV.mine = new Map(Object.entries(marks).filter(([, mk]) => mk && mk.s)
      .map(([sid, mk]) => [attKey(sid, sec), { sessionId: sid, section: sec, marks: { [mid]: mk } }]));
    privApply(); done();
  }, () => { privApply(); done(); });
  syncSubLists();
}
/** Encara no ha arribat la llista que ha de passar: si hi marqués ara, esborraria les marques dels altres. */
const subListWaiting = () => { if (!SYNC.priv) return false; syncSubLists(); return mySubs().some(x => !PRIV.loaded.has(attKey(x.sessionId, x.section))); };
/** Les llistes que passa com a substitut: n'escolta cadascuna mentre dura. */
function syncSubLists() {
  if (!SYNC.priv || !db) return;
  const want = new Set(mySubs().map(x => attKey(x.sessionId, x.section)));
  for (const [key, un] of PRIV.watch) if (!want.has(key)) { un(); PRIV.watch.delete(key); PRIV.subs.delete(key); PRIV.loaded.delete(key); }
  for (const key of want) {
    if (PRIV.watch.has(key)) continue;
    PRIV.watch.set(key, db.doc(`attendance/${key}`).onSnapshot(snap => {
      if (snap.exists && !isDirty(`attendance/${key}`)) PRIV.subs.set(key, snap.data());
      PRIV.loaded.add(key);
      privApply(); PRIV.done?.();
    }, () => {}));
  }
}

/* ---------- Tria de produccions ---------- */
// prodChoice/<membre> = { memberId, prods: { <producció>: 'yes' | 'no' }, at, by }. La fa el cantaire (o l'equip per ell).
// Una producció que ja ha començat ja no la pot canviar el cantaire, només l'equip.
S.prodChoice = new Map();
const choicesOn = () => !!S.config.prodChoice;
const choiceMin = () => Math.min(100, Math.max(0, S.config.prodChoiceMin == null ? 60 : +S.config.prodChoiceMin || 0));
/** La resposta d'una persona per a una producció: 'yes', 'no' o '' (encara no ho ha dit). */
const choiceOf = (mid, pid) => (choicesOn() && S.prodChoice.get(mid)?.prods?.[pid]) || '';
/** Per a les taules: la resposta, o «yes» si ja ha començat i no ha dit res. */
const choiceShown = (mid, p) => choiceOf(mid, p.id) || (prodStarted(p) ? 'yes' : '');
/** Ha dit que no la farà (i per tant no hi està convocat). */
const choseNo = (mid, pid) => choiceOf(mid, pid) === 'no';
/** Les produccions de la temporada que es poden triar: les que tenen sessions dins la temporada. Les que l'equip ja ha
 *  tret a algú (excluded) no li compten. */
function choiceProds(mid) {
  const { season } = seasonCfg();
  return productionsSorted().filter(p => {
    const ss = allSessions(p.id);
    return ss.length && ss.some(s => s.date >= season.from && s.date <= season.to) && !(p.excluded || []).includes(mid);
  });
}
/** Ja ha començat: el cantaire ja no la pot canviar. */
const prodStarted = p => { const ss = allSessions(p.id); return !!ss.length && ss[0].date <= TODAY; };
/** El recompte d'una persona: quantes en fa, quantes no, quantes falten per dir, i els percentatges. */
function choiceSummary(mid, answers) {
  const prods = choiceProds(mid), got = answers || S.prodChoice.get(mid)?.prods || {};
  const ans = p => answerOf(got, p);
  const yes = prods.filter(p => ans(p) === 'yes').length, no = prods.filter(p => ans(p) === 'no').length;
  const total = prods.length, none = total - yes - no, min = choiceMin();
  // Qui encara no ho ha dit, compta com que la farà: el mínim només es pot incomplir dient que no.
  const most = total ? (yes + none) / total : 1;
  return { prods, yes, no, none, total, pct: total ? yes / total : null, most, min, ok: most * 100 + 1e-9 >= min, need: Math.ceil(min / 100 * total - 1e-9) };
}
/** La resposta que compta: una producció que ja ha començat i de la qual no ha dit res, la fa (hi està convocat). */
const answerOf = (got, p) => got[p.id] || (prodStarted(p) ? 'yes' : '');
/** Hi ha produccions que encara pot triar i no ha dit res. */
const choicesPending = mid => choicesOn() && !!mid && choiceSummary(mid).prods.some(p => !prodStarted(p) && !choiceOf(mid, p.id));
function watchChoices() {
  if (!choicesOn() || !db || S.choiceWatch) return;
  const onSnap = snap => { S.prodChoice = new Map(snap.docs ? snap.docs.map(d => [d.id, d.data()]) : snap.exists ? [[snap.id, snap.data()]] : []); if (S.ready) scheduleRender(); };
  // Amb les llistes privades, un cantaire no veu qui fa què: només la seva tria.
  S.choiceWatch = attHidden() || (S.role !== 'edit' && attPrivate())
    ? (S.memberId ? db.doc(`prodChoice/${S.memberId}`).onSnapshot(onSnap, () => {}) : () => {})
    : db.collection('prodChoice').onSnapshot(onSnap, () => {});
}
const choiceLine = s => s.total
  ? `Fa ${s.yes} de ${s.total} ${s.total === 1 ? 'producció' : 'produccions'}${s.none ? ` · ${s.none} per dir` : ''} · mínim ${s.min}%`
  : 'Aquesta temporada encara no hi ha produccions per triar.';
/** El resum per a «La meva fitxa» i per a la fitxa de la persona que veu l'equip. */
function choiceBox(mid, mine) {
  if (!choicesOn() || !mid) return '';
  const s = choiceSummary(mid);
  const bar = s.total ? `<span class="ch-bar" role="img" aria-label="${Math.round((s.pct || 0) * 100)}%"><span style="width:${Math.round((s.pct || 0) * 100)}%"></span><i style="left:${s.min}%"></i></span>` : '';
  return `<div class="ch-box${s.ok ? '' : ' low'}">
    <div class="ch-h"><b>${mine ? 'Les produccions que faràs' : 'Produccions que fa'}</b><button type="button" class="btn btn-sm" data-act="choice-open" data-mid="${esc(mid)}">${mine && s.none ? 'Tria-les' : 'Canvia-ho'}</button></div>
    ${bar}<span class="ch-t">${esc(mine ? choiceLine(s).replace(/^Fa /, 'Fas ') : choiceLine(s))}</span>
    ${s.ok ? '' : `<span class="ch-warn">Per sota del mínim: ${mine ? 'has' : 'ha'} de fer com a mínim ${s.need} de ${s.total}.</span>`}</div>`;
}
/** La tria: una fila per producció, amb Sí i No, i el recompte a dalt. */
function sheetProdChoice(mid) {
  const m = S.members.get(mid);
  if (!m || !choicesOn()) return;
  const mine = mid === myMemberId(), team = canEdit();
  if (!mine && !team) return;
  const got = { ...(S.prodChoice.get(mid)?.prods || {}) };
  const prods = choiceSummary(mid).prods;
  const row = p => {
    const ss = allSessions(p.id), locked = prodStarted(p) && !team, a = answerOf(got, p);
    const when = ss.length ? `${ddmm(ss[0].date)}${ss.length > 1 ? ` – ${ddmm(ss[ss.length - 1].date)}` : ''}` : '';
    const shows = ss.filter(isShow).length;
    return `<li class="ch-row prod-tone" style="--ph:${prodHue(p)}" data-pid="${esc(p.id)}">
      <span class="ch-n"><i class="pdot"></i><b>${esc(p.name)}</b><small>${esc([when, `${ss.length} sessions`, shows ? `${shows} ${shows === 1 ? V.sh.show : V.sh.els.replace(/^(els|les) /, '')}` : '', locked ? 'ja ha començat' : ''].filter(Boolean).join(' · '))}</small></span>
      <span class="seg3 ch-seg" role="radiogroup" aria-label="${esc(p.name)}">${[['yes', 'La faré'], ['no', 'No']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${a === k}" data-k="${k}" ${locked ? 'disabled' : ''}>${l}</button>`).join('')}</span></li>`;
  };
  openSheet({
    title: mine ? 'Les produccions que faràs' : `Produccions · ${m.name}`,
    wide: true,
    body: prods.length ? `<p style="margin-top:0">${mine ? 'Digues quines produccions faràs aquesta temporada.' : `Les produccions que farà ${esc(fullName(m.name))} aquesta temporada.`} Cal fer-ne com a mínim el <b>${choiceMin()}%</b>. ${mine ? 'On diguis que no, no et comptarà l’assistència ni et sortiran les convocatòries.' : 'On digui que no, no hi està convocat.'}</p>
      <div class="ch-sum" id="ch-sum" aria-live="polite"></div>
      <ul class="ch-list">${prods.map(row).join('')}</ul>
      ${mine ? '<p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 2px 0">Quan una producció ja ha començat, per canviar-ho parla amb l’equip.</p>' : ''}`
      : '<p style="margin:0">Aquesta temporada encara no hi ha produccions per triar.</p>',
    foot: prods.length ? `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ch-save">Desa</button>` : '',
    onMount: el => {
      const paint = () => {
        const s = choiceSummary(mid, got);
        el.querySelector('#ch-sum').innerHTML = `<span><b>${s.yes} de ${s.total}</b> · ${s.total ? Math.round(s.yes / s.total * 100) : 0}%${s.none ? ` · ${s.none} per dir` : ''}</span>
          <span class="ch-bar"><span style="width:${s.total ? Math.round(s.yes / s.total * 100) : 0}%"></span><i style="left:${s.min}%"></i></span>
          ${s.ok ? '' : `<span class="ch-warn">Cal fer-ne com a mínim ${s.need} de ${s.total} (el ${s.min}%).</span>`}`;
      };
      el.querySelectorAll('.ch-row').forEach(r => r.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
        got[r.dataset.pid] = b.dataset.k;
        r.querySelectorAll('button[data-k]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        paint();
      }));
      paint();
      el.querySelector('#ch-save')?.addEventListener('click', async e => {
        const s = choiceSummary(mid, got), btn = /** @type {any} */ (e.currentTarget);
        if (!s.ok && !team) { toast(`Cal fer com a mínim ${s.need} de les ${s.total} produccions`); return; }
        if (!s.ok && !await confirmSheet('Per sota del mínim', `${esc(fullName(m.name))} només en faria ${s.yes + s.none} de ${s.total} i el mínim és el ${s.min}%. Ho deses igualment?`, 'Desa-ho', false)) { sheetProdChoice(mid); return; }
        // Només les produccions que encara hi són; les respostes d'altres temporades es mantenen.
        const rec = { memberId: mid, prods: { ...(S.prodChoice.get(mid)?.prods || {}), ...got }, at: new Date().toISOString(), by: myEmail() || '' };
        if (PREVIEW) { previewBlocked(); return; }
        btn.disabled = true;
        try { await db.doc(`prodChoice/${mid}`).set(rec); S.prodChoice.set(mid, rec); closeSheet(); toast('Produccions desades'); render(); }
        catch { btn.disabled = false; toast('No s’ha pogut desar. Comprova la connexió.'); }
      });
    },
  });
}
/** Per a l'equip: qui fa cada producció, qui encara no ho ha dit i qui queda per sota del mínim. */
function sheetChoicesOverview() {
  if (!canEdit()) return;
  const ms = membersOf(null).filter(m => m.active !== false);
  const prods = choiceProds('');
  const low = ms.map(m => ({ m, s: choiceSummary(m.id) })).filter(x => !x.s.ok);
  const silent = ms.filter(m => choiceSummary(m.id).none);
  const cell = (m, p) => (p.excluded || []).includes(m.id) ? '<td class="m">—</td>' : `<td class="ch-c ${choiceShown(m.id, p) || 'none'}">${{ yes: 'Sí', no: 'No' }[choiceShown(m.id, p)] || '·'}</td>`;
  openSheet({
    title: 'Qui fa cada producció',
    wide: true,
    body: `<p style="margin-top:0">Cada ${esc(V.member)} diu quines produccions farà des de «La meva fitxa». Mínim: <b>${choiceMin()}%</b> de les produccions de la temporada.</p>
      <div class="ch-kpis"><span><b>${ms.length - silent.length}</b> de ${ms.length} han respost</span><span class="${low.length ? 'bad' : ''}"><b>${low.length}</b> per sota del mínim</span></div>
      ${prods.map(p => { const yes = ms.filter(m => choiceShown(m.id, p) === 'yes').length, no = ms.filter(m => choiceShown(m.id, p) === 'no').length;
        return `<div class="ch-prod prod-tone" style="--ph:${prodHue(p)}"><i class="pdot"></i><b>${esc(p.name)}</b><span class="m"><b>${yes}</b> la fan · <b>${no}</b> no · ${ms.length - yes - no} sense dir-ho</span></div>`; }).join('')}
      ${low.length ? `<div class="section-title" style="margin-top:14px"><h2 class="h2">Per sota del mínim</h2></div><ul class="mini-list" style="max-height:none">${low.map(({ m, s }) => `<li><span><b>${esc(m.name)}</b><br><span class="m">${esc(SEC[m.section].name)} · en fa ${s.yes + s.none} de ${s.total}</span></span><button class="btn btn-sm" data-act="choice-open" data-mid="${esc(m.id)}">Mira-ho</button></li>`).join('')}</ul>` : ''}
      <div class="table-wrap" style="margin-top:14px"><table class="dtable ch-table"><thead><tr><th>${esc(V.Member)}</th>${prods.map(p => `<th title="${esc(p.name)}">${esc(p.name.split(' · ')[0])}</th>`).join('')}<th>%</th></tr></thead>
        <tbody>${ms.map(m => { const s = choiceSummary(m.id); return `<tr data-act="choice-open" data-mid="${esc(m.id)}"><td><b>${esc(m.name)}</b></td>${prods.map(p => cell(m, p)).join('')}<td class="n ${s.ok ? '' : 'bad'}">${s.pct == null ? '—' : pct(s.pct)}</td></tr>`; }).join('')}</tbody></table></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button>`,
  });
}
