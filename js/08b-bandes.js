// A Tempo · 08b-bandes.js — Les bandes: premis que vota tota l'agrupació (Tauler › Enquestes): el model, les categories, el
// recompte, la targeta del tauler i la papereta. L'editor i els finalistes són a 08d; els resultats i la gala, a 08e.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* Una votació de bandes és una enquesta (polls/<id>) amb kind 'bandes':
 *   { kind, title, description, cats: [{ id, name, desc, pair, sec, win }], picks (persones per categoria), win (bandes per
 *     categoria), sections, out (qui no hi participa), selfOk, closesAt, closed, draft, annId (l'anunci que la presenta),
 *     ties: { categoria: [claus] } (el desempat), results: { categoria: [claus] } (el palmarès publicat), resultsAt }
 * Cada vot és pollVotes/<votació>_<persona> = { pollId, memberId, section, picks: { categoria: [persones] }, n, at, uid }. Les
 * regles ja hi deixen escriure només el propi vot i llegir-los tots només a qui porta el tauler; l'app no ensenya enlloc qui ha
 * votat qui: l'equip en veu els recomptes. Una clau és una persona o, a les de parella, les dues ordenades i unides amb «+».
 * Mentre es vota, la papereta es desa al mòbil (atempo:bandes:<votació>) i només s'envia en acabar. */
const BANDES_MAX = 40;
const isBandes = p => p?.kind === 'bandes';
const pollClosed = p => !!(p.closed || (p.closesAt && p.closesAt < TODAY));
const pairKey = ids => [...ids].sort().join('+');
const keyIds = k => String(k).split('+');
const bdName = id => fullName(S.members.get(id)?.name || '') || 'Algú que ja no hi és';
const keyName = k => keyIds(k).map(bdName).join(' i ');
const catMax = (p, c) => c.pair ? 2 : Math.max(1, Math.min(3, +p.picks || 2));
const catKind = c => c.pair ? 'De parella' : c.sec ? `Només ${(SEC[c.sec]?.name || c.sec).toLowerCase()}` : 'Individual';
/** Qui hi participa (vota i pot ser votat): la plantilla de les cordes de la votació, menys qui se n'ha tret. */
const bandesPeople = p => pollExpected(p).filter(m => !(p.out || []).includes(m.id));
// Un mes després de la Nit, el servei n'esborra les paperetes (ballotsGone): les que el mòbil encara tingui desades ja no compten.
const bandesVotes = p => p.ballotsGone ? [] : [...S.pollVotes.values()].filter(v => v.pollId === p.id);
const secOrder = m => Math.max(0, SECTIONS.findIndex(x => x.id === m.section));
const bdSorted = list => [...list].sort((a, b) => secOrder(a) - secOrder(b) || byName(a, b));

/* ---------- Les categories, a partir d'un text ---------- */
/** La corda que vol dir un text: «S», «Sopranos» o, si single, també el singular («Soprano», «Contralt», «Baix»…). */
function bandesSection(t, single) {
  const f = normText(t).replace(/["“”«»'’]/g, '').trim();
  if (!f) return '';
  for (const x of SECTIONS) {
    const forms = (single ? [x.name] : [x.id, x.short, x.name]).map(normText);
    if (forms.includes(f) || (single && [f + 's', f + 'os', f + 'es'].some(v => forms.includes(v)))) return x.id;
  }
  return '';
}
/** Les categories d'un text, una per línia: «Nom: descripció». Si cal, entre claudàtors després del nom: [parella], una corda
 *  ([S], [Sopranos]) i quantes bandes es donen ([1]). Una línia que només digui «De parella» (o «Bandes de parella»)
 *  fa que les de sota siguin de parella, i «Individuals», que tornin a ser d'una persona. Una categoria que es diu com una
 *  corda («Soprano», «Tenor»…) només és d'aquella corda. Les de corda i les de parella donen una banda; les altres, win.
 *  Com quan s'enganxa el text d'un PDF, una línia continua la descripció de l'anterior si comença en minúscula o si no té
 *  «:» i no sembla un nom (és llarga, o la descripció anterior encara no s'havia acabat, o acaba com una frase). */
function parseBandes(text, { win = 2, old = [] } = {}) {
  const ids = new Map(old.map(c => [normText(c.name), c.id])), used = new Set(), out = [];
  let pair = false, cur = null, prev = '';
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim().replace(/^[-–—*•·]\s+/, '');
    if (!line) { cur = null; prev = ''; continue; }
    const last = prev;
    prev = line;
    const bare = normText(line).replace(/[’]/g, "'").replace(/[:.]+$/, '').trim();
    if (/^(les )?(bandes |categories )?(de parella|de parelles|parelles)$/.test(bare)) { pair = true; cur = null; continue; }
    if (/^(les )?(bandes |categories )?(individuals?|d'una persona)$/.test(bare)) { pair = false; cur = null; continue; }
    const named = /^[^:]{1,60}:/.test(line) || /\[[^\]]*\]/.test(line);
    const bareName = line.length <= 40 && (!cur?.desc || (/[.!?…»”"]$/.test(last) && !/[.!?…]$/.test(line)));
    if (cur && (/^[a-zà-ÿ]/.test(line) || !(named || bareName))) { cur.desc = `${cur.desc} ${line}`.trim().slice(0, 400); continue; }
    const at = line.indexOf(':');
    let head = at >= 0 ? line.slice(0, at) : line, opts = '';
    const desc = at >= 0 ? line.slice(at + 1).trim() : '';
    head = head.replace(/\[([^\]]*)\]/g, (_, o) => { opts += `,${o}`; return ''; }).replace(/\s+/g, ' ').trim();
    if (!head) continue;
    let cpair = pair, csec = '', cwin = 0;
    for (const t of opts.split(/[,;]/).map(x => normText(x).trim()).filter(Boolean)) {
      if (/^parell/.test(t)) cpair = true;
      else if (/^individual/.test(t)) cpair = false;
      else if (/^\d+/.test(t)) cwin = Math.max(1, Math.min(5, parseInt(t, 10)));
      else csec = bandesSection(t, false) || csec;
    }
    if (cpair) csec = '';
    else if (!csec) csec = bandesSection(head, true);
    let id = ids.get(normText(head));
    if (!id || used.has(id)) id = uid('c');
    used.add(id);
    cur = { id, name: head.slice(0, 60), desc: desc.slice(0, 400), pair: cpair, sec: csec, win: cwin || (cpair || csec ? 1 : win) };
    out.push(cur);
    if (out.length >= BANDES_MAX) break;
  }
  return out;
}
/** El text de les categories (per tornar-les a editar): el que parseBandes torna a llegir igual. */
function bandesText(p) {
  return (p.cats || []).map(c => {
    const auto = c.pair || c.sec ? 1 : (p.win || 2);
    const opts = [c.pair ? 'parella' : '', c.sec && c.sec !== bandesSection(c.name, true) ? SEC[c.sec]?.name || c.sec : '', c.win !== auto ? `${c.win} ${c.win === 1 ? 'banda' : 'bandes'}` : ''].filter(Boolean);
    return `${c.name}${opts.length ? ` [${opts.join(', ')}]` : ''}${c.desc ? `: ${c.desc}` : ''}`;
  }).join('\n');
}

/* ---------- El recompte ---------- */
/** El que val d'una papereta en una categoria: gent que hi participa, de la corda de la categoria, sense repetir, sense
 *  votar-se (si no es pot) i, a les de parella, dues persones diferents. */
function bandesClean(p, c, list, voter, secOf) {
  const max = catMax(p, c), out = [];
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id !== 'string' || out.includes(id) || !secOf.has(id)) continue;
    if (!p.selfOk && id === voter) continue;
    if (c.sec && secOf.get(id) !== c.sec) continue;
    out.push(id);
    if (out.length === max) break;
  }
  return c.pair && out.length !== 2 ? [] : out;
}
/** Qui s'emporta la banda: les w més votades. Si n'hi ha d'empatades a la frontera, tied (les empatades) i open (quantes en
 *  falten); el desempat de l'equip (chosen) val si tria just les que falten d'entre les empatades. */
function bandesWinners(c, rows, chosen) {
  const w = c.win || 1;
  if (rows.length <= w) return { winners: rows.map(r => r.key), tied: [], open: 0, cut: 0 };
  const cut = rows[w - 1].n;
  if (rows[w].n < cut) return { winners: rows.slice(0, w).map(r => r.key), tied: [], open: 0, cut };
  const sure = rows.filter(r => r.n > cut).map(r => r.key), tied = rows.filter(r => r.n === cut).map(r => r.key);
  const need = w - sure.length, pick = (chosen || []).filter(k => tied.includes(k));
  if (pick.length === need) return { winners: [...sure, ...pick], tied, open: 0, cut, decided: true };
  return { winners: sure, tied, open: need, cut };
}
/** El recompte sencer: la participació, cada categoria (vots, en blanc, classificació i qui guanya) i cada persona. */
function bandesTally(p, votes, people) {
  const secOf = new Map(people.map(m => [m.id, m.section]));
  const valid = votes.filter(v => v.pollId === p.id && secOf.has(v.memberId));
  const filled = new Map(valid.map(v => [v.memberId, 0]));
  const cats = (p.cats || []).map(c => {
    const counts = new Map();
    let ballots = 0;
    for (const v of valid) {
      const got = bandesClean(p, c, v.picks?.[c.id], v.memberId, secOf);
      if (!got.length) continue;
      ballots++; filled.set(v.memberId, filled.get(v.memberId) + 1);
      for (const k of c.pair ? [pairKey(got)] : got) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const rows = [...counts].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || keyName(a.key).localeCompare(keyName(b.key), 'ca'));
    return { cat: c, ballots, blank: valid.length - ballots, rows, ...bandesWinners(c, rows, p.ties?.[c.id]) };
  });
  const per = new Map();
  const entry = id => { if (!per.has(id)) per.set(id, { id, cats: new Set(), votes: 0, wins: [] }); return per.get(id); };
  for (const t of cats) {
    for (const r of t.rows) for (const id of keyIds(r.key)) { const e = entry(id); e.cats.add(t.cat.id); e.votes += r.n; }
    for (const k of t.winners) for (const id of keyIds(k)) entry(id).wins.push(t.cat.id);
  }
  const days = {};
  for (const v of valid) { const at = new Date(v.at || ''); if (!isNaN(at.getTime())) { const d = isoDate(at); days[d] = (days[d] || 0) + 1; } }
  return {
    voters: valid.length, expected: people.length, days,
    filled: valid.length ? [...filled.values()].reduce((a, b) => a + b, 0) / valid.length : 0,
    bySec: SECTIONS.map(x => ({ sec: x.id, n: valid.filter(v => secOf.get(v.memberId) === x.id).length, total: people.filter(m => m.section === x.id).length })).filter(x => x.total),
    cats,
    people: [...per.values()].map(e => ({ id: e.id, nominations: e.cats.size, votes: e.votes, wins: e.wins })),
  };
}
/** El que val de tota una papereta (el que s'envia). */
function bandesBallot(p, picks, voter) {
  const secOf = new Map(bandesPeople(p).map(m => [m.id, m.section])), out = {};
  for (const c of p.cats || []) { const l = bandesClean(p, c, picks?.[c.id], voter, secOf); if (l.length) out[c.id] = l; }
  return out;
}

/* ---------- La targeta del tauler ---------- */
function bandesCard(p) {
  const closed = pollClosed(p), people = bandesPeople(p), me = myId(), mine = me ? S.pollVotes.get(`${p.id}_${me}`) : null;
  const voter = !!me && !p.draft && people.some(m => m.id === me), cats = p.cats || [];
  const state = p.draft ? (p.propOpen ? '<span class="st-pill st-accepted">Propostes</span>' : '<span class="st-pill st-pending">Esborrany</span>') : closed ? '<span class="st-pill st-rejected">Tancada</span>' : '<span class="st-pill st-accepted">Oberta</span>';
  const meta = `<div class="ann-m">${state}<span>${cats.length} ${cats.length === 1 ? 'categoria' : 'categories'}</span>${p.closesAt ? `<span>Fins al ${ddmm(p.closesAt)}</span>` : ''}${p.sections?.length ? `<span>Per a: ${esc(p.sections.map(x => SEC[x]?.name || x).join(', '))}</span>` : ''}<span>Vot secret</span></div>`;
  const draft = voter && !mine ? ballotDraft(p) : null;
  const acts = [];
  if (voter && !closed) acts.push(`<button class="btn btn-sm ${mine ? '' : 'btn-primary'}" data-act="bandes-vote" data-id="${esc(p.id)}">${mine ? 'Canvia el vot' : draft ? 'Continua votant' : 'Vota'}</button>`);
  if (voter && mine) acts.push(`<span class="rsvp yes">Has votat ${mine.n || Object.keys(mine.picks || {}).length} de ${cats.length}</span>`);
  else if (voter && !closed) acts.push('<span class="muted bd-note">Encara no has votat</span>');
  let board = '';
  if (canBoard()) {
    const voted = people.filter(m => S.pollVotes.get(`${p.id}_${m.id}`)).length;
    board = `${p.draft ? `<p class="m" style="margin:0">${p.propOpen ? 'S’hi recullen propostes de categories: la votació encara no és oberta.' : 'Només la veu l’equip. Quan la publiquis, rebran la notificació i la podran votar.'}</p>` : `<div class="bd-part"><div class="bd-part-h"><span>Han votat <b class="mono">${voted}</b> de ${people.length}</span><span class="mono">${pct(people.length ? voted / people.length : null)}</span></div><span class="bd-bar"><span style="width:${people.length ? voted / people.length * 100 : 0}%"></span></span></div>`}
      <div class="c-a bd-acts">${p.draft ? `<button class="btn btn-sm btn-primary" data-act="bandes-publish" data-id="${esc(p.id)}">Publica-la</button><button class="btn btn-sm" data-act="bandes-edit" data-id="${esc(p.id)}">Edita-la</button>` : `<button class="btn btn-sm" data-act="bandes-results" data-id="${esc(p.id)}">Resultats</button><button class="btn btn-sm" data-act="poll-results" data-id="${esc(p.id)}">Qui ha votat</button>${closed ? '' : `<button class="btn btn-sm" data-act="poll-remind" data-id="${esc(p.id)}">Recorda-ho</button>`}`}</div>`;
  }
  return `<div class="poll bandes" data-poll="${esc(p.id)}">
    <div class="ann-h"><h2 class="ann-t">${esc(p.title)}</h2>${canBoard() ? `<button class="icon-btn" data-act="bandes-edit" data-id="${esc(p.id)}" aria-label="Edita la votació">${ICON.more}</button>` : ''}</div>
    ${p.description ? `<div class="ann-b rich">${richText(cutText(p.description, 320))}</div>` : ''}${meta}
    ${p.results ? bandesPalmares(p) : ''}
    <div class="c-a bd-acts">${acts.join('')}${p.draft && !canBoard() && !p.propOpen ? '' : `<button class="btn btn-sm${p.propOpen && !canBoard() ? ' btn-primary' : ''}" data-act="bandes-open">${p.propOpen && p.draft ? 'Proposa una categoria' : `Obre ${esc(galaName(p).replace(/^L/, 'l'))}`}</button>`}</div>${board}</div>`;
}
/** El palmarès publicat: qui s'ha endut cada banda (sense els vots). Si n'hi ha cap per a mi, a dalt. */
function bandesPalmares(p) {
  const res = p.results || {}, me = myId();
  const list = (p.cats || []).filter(c => res[c.id]?.length);
  if (!list.length) return '';
  const mine = me ? list.filter(c => res[c.id].some(k => keyIds(k).includes(me))) : [];
  return `${mine.length ? `<p class="bd-mine"><b>${mine.length === 1 ? 'T’has endut una banda' : `T’has endut ${mine.length} bandes`}:</b> ${esc(mine.map(c => c.name).join(', '))}.</p>` : ''}
    <details class="np-group bd-palm"${p.resultsAt && isoDate(new Date(p.resultsAt)) >= addDays(TODAY, -14) ? ' open' : ''}><summary><span>Palmarès</span>${ICON.chev}</summary>
    <ul class="bd-palm-l">${list.map(c => `<li><span class="bd-cat">${esc(c.name)}</span><span class="bd-win">${res[c.id].map(k => esc(keyName(k))).join('<br>')}</span></li>`).join('')}</ul></details>`;
}
/** Als anuncis que presenten una votació: el botó per votar-hi (o per veure com va). */
function bandesAnnActs(a) {
  const p = a.pollId ? S.polls.get(a.pollId) : null;
  if (p && bandesPhase(p) === 'prop') return `<button class="btn btn-sm btn-primary" data-act="bandes-open">${propOpenNow(p) ? 'Proposa una categoria' : 'Mira les propostes'}</button>`;
  if (!p || p.draft) return '';
  const me = myId(), voter = !!me && bandesPeople(p).some(m => m.id === me), mine = me && S.pollVotes.get(`${p.id}_${me}`);
  if (voter && !pollClosed(p)) return `<button class="btn btn-sm btn-primary" data-act="bandes-vote" data-id="${esc(p.id)}">${mine ? 'Canvia el vot' : 'Vota'}</button>`;
  return `<button class="btn btn-sm" data-act="bandes-open">${p.results ? 'Mira el palmarès' : `Obre ${esc(galaName(p).replace(/^L/, 'l'))}`}</button>`;
}

/* ---------- La papereta ---------- */
const LS_BALLOT = 'atempo:bandes';
const ballotKey = p => `${LS_BALLOT}:${p.id}:${myId()}`;
function ballotDraft(p) {
  try { const d = JSON.parse(lsGet(ballotKey(p)) || 'null'); return d && d.picks && Object.values(d.picks).some(l => l?.length) ? d : null; } catch { return null; }
}
function sheetBallot(pid) {
  const p0 = S.polls.get(pid), me = S.members.get(myId());
  if (!p0 || !me || p0.draft) return;
  if (!bandesPeople(p0).some(m => m.id === me.id)) { toast('No surts a la llista d’aquesta votació'); return; }
  if (pollClosed(p0)) { toast('La votació ja s’ha tancat'); return; }
  const sent = S.pollVotes.get(`${pid}_${me.id}`), draft = ballotDraft(p0);
  const fromDraft = draft && (!sent || (draft.at || '') > (sent.at || ''));
  const cats = p0.cats || [], n = cats.length;
  const st = { step: sent && !fromDraft ? n : fromDraft ? Math.min(draft.step ?? -1, n) : -1, picks: clone(fromDraft ? draft.picks : sent?.picks || {}), q: '', sec: '' };
  const people = bdSorted(bandesPeople(p0));
  const save = () => lsSet(ballotKey(p0), JSON.stringify({ picks: st.picks, step: st.step, at: new Date().toISOString() }));
  const got = c => st.picks[c.id] || [];
  const filledCount = () => cats.filter(c => c.pair ? got(c).length === 2 : got(c).length).length;
  let el;
  const intro = () => {
    const nPair = cats.filter(c => c.pair).length, max = catMax(p0, {}), secs = cats.some(c => c.sec);
    return `<div class="bb-intro">
      ${p0.description ? `<div class="rich">${richText(p0.description)}</div>` : ''}
      <ul class="bb-rules">
        <li><b class="mono">${n}</b> ${n === 1 ? 'categoria' : 'categories'}${nPair ? `: ${n - nPair} individuals i ${nPair} de parella` : ''}.</li>
        <li>A cada una pots triar fins a <b>${max}</b> ${max === 1 ? 'persona' : 'persones'}${nPair ? '; a les de parella, una parella' : ''}.${secs ? ` Les d’una ${esc(V.section)} només són d’aquella ${esc(V.section)}.` : ''}</li>
        <li>Pots deixar-ne en blanc i anar endavant i enrere tant com vulguis: el mòbil se’n recorda fins que l’enviïs.</li>
        <li><b>El vot és secret:</b> ningú no veu a l’app qui has votat. L’equip només en veu els recomptes.</li>
        <li>${p0.closesAt ? `Fins al ${ddmm(p0.closesAt)}` : 'Fins que es tanqui'} pots canviar el vot.${p0.selfOk ? '' : ' No et pots votar: no surts a les llistes.'}</li>
      </ul></div>`;
  };
  const slots = c => {
    const max = catMax(p0, c), l = got(c);
    return Array.from({ length: max }, (_, k) => l[k]
      ? `<button type="button" class="bb-slot on" data-bb="rm" data-id="${esc(l[k])}" aria-label="Treu ${esc(bdName(l[k]))}"><span>${esc(bdName(l[k]))}</span>${ICON.close}</button>`
      : `<span class="bb-slot">${c.pair ? `Persona ${k + 1}` : k === 0 ? 'Tria algú' : 'I algú més, si vols'}</span>`).join(c.pair ? '<span class="bb-and" aria-hidden="true">i</span>' : '');
  };
  const listHtml = c => {
    const l = got(c), full = l.length >= catMax(p0, c), q = normText(st.q).trim();
    const cand = people.filter(m => (!c.sec || m.section === c.sec) && (p0.selfOk || m.id !== me.id) && (c.sec || !st.sec || m.section === st.sec)
      && (!q || normText(bdName(m.id)).includes(q) || normText(m.name).includes(q)));
    if (!cand.length) return `<li class="bb-none">${q ? 'Ningú no es diu així.' : 'No hi ha ningú per triar.'}</li>`;
    let last = null;
    return cand.map(m => {
      const on = l.includes(m.id), head = !q && !c.sec && !st.sec && m.section !== last ? `<li class="bb-h">${esc(SEC[m.section]?.name || m.section)}</li>` : '';
      last = m.section;
      return `${head}<li><button type="button" class="bb-p${full && !on ? ' full' : ''}" data-bb="pick" data-id="${esc(m.id)}" aria-pressed="${on}">${avatar(m)}<span class="bb-n">${esc(bdName(m.id))}</span><span class="bb-ck">${on ? ICON.check : ''}</span></button></li>`;
    }).join('');
  };
  const catHtml = i => {
    const c = cats[i], max = catMax(p0, c);
    return `<div class="bb-top"><div class="bb-prog" role="progressbar" aria-label="Categoria ${i + 1} de ${n}" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}"><span style="width:${(i + 1) / n * 100}%"></span></div>
        <p class="bb-step"><span><b class="mono">${i + 1}</b> de ${n} · ${esc(catKind(c))}</span><button type="button" class="bb-jump" data-bb="go" data-i="${n}">Revisa’l</button></p></div>
      <h3 class="bb-name">${esc(c.name)}</h3>
      ${c.desc ? `<p class="bb-desc">${esc(c.desc)}</p>` : ''}
      <p class="bb-how">${c.pair ? 'Tria les dues persones de la parella.' : `Tria’n fins a ${max === 1 ? 'una' : max}.`} Si no en tens cap al cap, deixa-la en blanc.</p>
      <div class="bb-stick"><div class="bb-slots" id="bb-slots">${slots(c)}</div>
        <div class="bb-tools"><input class="inp" type="search" id="bb-q" placeholder="Cerca un nom" autocomplete="off" value="${esc(st.q)}" aria-label="Cerca un nom">
          ${c.sec ? '' : `<div class="seg3 bb-secs" role="radiogroup" aria-label="${esc(V.Section)}"><button type="button" role="radio" data-bb="sec" data-k="" aria-checked="${!st.sec}">Tots</button>${SECTIONS.filter(x => people.some(m => m.section === x.id)).map(x => `<button type="button" role="radio" data-bb="sec" data-k="${esc(x.id)}" aria-checked="${st.sec === x.id}">${esc(x.short)}</button>`).join('')}</div>`}</div></div>
      <ul class="bb-list" id="bb-list">${listHtml(c)}</ul>`;
  };
  const reviewHtml = () => {
    const f = filledCount();
    return `<p class="eyebrow" style="margin:0">Revisa el teu vot</p>
      <p style="margin:6px 0 12px">Has votat <b class="mono">${f}</b> de ${n} ${n === 1 ? 'categoria' : 'categories'}${f < n ? `; ${n - f === 1 ? 'una queda' : `${n - f} queden`} en blanc` : ''}. Toca’n una per canviar-la.</p>
      <ul class="bb-rev">${cats.map((c, i) => { const l = c.pair && got(c).length !== 2 ? [] : got(c); return `<li><button type="button" data-bb="go" data-i="${i}"><span><b>${esc(c.name)}</b><small class="${l.length ? '' : 'blank'}">${l.length ? esc(c.pair ? l.map(bdName).join(' i ') : l.map(bdName).join(' · ')) : 'En blanc'}</small></span>${ICON.go}</button></li>`; }).join('')}</ul>`;
  };
  const footHtml = () => {
    if (st.step < 0) return `<button class="btn" data-act="sheet-close">Tanca</button><span class="spacer"></span><button class="btn btn-primary" data-bb="next">${filledCount() ? 'Continua' : 'Comença'}</button>`;
    if (st.step >= n) return `<button class="btn" data-bb="back">Enrere</button><span class="spacer"></span><button class="btn btn-primary" data-bb="send" ${filledCount() ? '' : 'disabled'}>${sent ? 'Desa els canvis' : 'Envia el vot'}</button>`;
    const c = cats[st.step], has = got(c).length;
    return `<button class="btn" data-bb="back">Enrere</button><span class="spacer"></span><button class="btn ${has ? 'btn-primary' : ''}" data-bb="next">${has ? (st.step === n - 1 ? 'Revisa el vot' : 'Següent') : 'Deixa-la en blanc'}</button>`;
  };
  const paint = () => {
    const body = el.querySelector('.sheet-b');
    body.innerHTML = st.step < 0 ? intro() : st.step >= n ? reviewHtml() : catHtml(st.step);
    el.querySelector('.sheet-f').innerHTML = footHtml();
    body.scrollTop = 0;
  };
  const repaintPicks = () => {
    const c = cats[st.step];
    el.querySelector('#bb-slots').innerHTML = slots(c);
    el.querySelector('#bb-list').innerHTML = listHtml(c);
    el.querySelector('.sheet-f').innerHTML = footHtml();
  };
  const go = i => { st.step = Math.max(-1, Math.min(n, i)); st.q = ''; st.sec = ''; save(); paint(); };
  const send = () => {
    const p = S.polls.get(pid);
    if (!p || pollClosed(p)) { closeSheet(); toast('La votació ja s’ha tancat'); render(); return; }
    const picks = bandesBallot(p, st.picks, me.id), key = `${pid}_${me.id}`;
    if (!Object.keys(picks).length) { toast('Vota almenys una categoria'); return; }
    const rec = { pollId: pid, memberId: me.id, section: me.section, picks, n: Object.keys(picks).length, choices: [], at: new Date().toISOString(), uid: S.uid };
    S.pollVotes.set(key, rec);
    // El primer cop, el vot suma 1 al recompte que veu tothom (vegeu sendFirstVote, a 08c).
    if (sent) persist('pollVotes', key, rec, 10); else sendFirstVote(key, rec);
    lsSet(ballotKey(p), null);
    closeSheet(); toast(sent ? 'Vot canviat' : 'Vot enviat. Gràcies!'); render();
  };
  openSheet({
    title: p0.title, wide: true, body: '', foot: '<span></span>',
    onMount: x => {
      el = x;
      el.classList.add('bb-sheet');
      paint();
      el.addEventListener('input', e => { if (e.target.id === 'bb-q') { st.q = e.target.value; el.querySelector('#bb-list').innerHTML = listHtml(cats[st.step]); } });
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-bb]');
        if (!b || b.disabled) return;
        const k = b.dataset.bb, c = cats[st.step];
        if (k === 'pick') {
          const l = got(c), id = b.dataset.id;
          if (l.includes(id)) st.picks[c.id] = l.filter(x => x !== id);
          else if (l.length >= catMax(p0, c)) { toast(c.pair ? 'Ja hi ha la parella: treu-ne una per canviar-la' : `Ja n’has triat ${l.length === 1 ? 'una' : l.length}: treu-ne una per canviar-la`); return; }
          else { st.picks[c.id] = [...l, id]; buzz(8); }
          save(); repaintPicks();
        } else if (k === 'rm') { st.picks[c.id] = got(c).filter(x => x !== b.dataset.id); save(); repaintPicks(); }
        else if (k === 'sec') { st.sec = b.dataset.k; el.querySelectorAll('.bb-secs [data-bb="sec"]').forEach(x => x.setAttribute('aria-checked', x === b)); el.querySelector('#bb-list').innerHTML = listHtml(c); }
        else if (k === 'go') go(+b.dataset.i);
        else if (k === 'back') go(st.step - 1);
        else if (k === 'next') {
          if (c && c.pair && got(c).length === 1) { toast('Una parella són dues persones: tria’n una altra o treu-la per deixar-la en blanc'); return; }
          go(st.step + 1);
        } else if (k === 'send') send();
      });
    },
  });
}
