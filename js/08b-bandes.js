// A Tempo · 08b-bandes.js — Les bandes: premis que vota tota l'agrupació (Tauler › Enquestes), amb la papereta, el recompte,
// les estadístiques, el desempat, el palmarès i la gala per anunciar-les.
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
const bandesVotes = p => [...S.pollVotes.values()].filter(v => v.pollId === p.id);
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

/* ---------- L'editor (qui porta el tauler) ---------- */
function sheetBandes(id) {
  const ex = id ? S.polls.get(id) : null;
  const p = ex ? clone(ex) : { id: uid('q'), kind: 'bandes', title: `Bandes ${S.config.shortName || S.config.name || ''} ${TODAY.slice(0, 4)}`.replace(/\s+/g, ' '), description: '', cats: [], picks: 2, win: 2, sections: [], out: [], selfOk: false, closesAt: '', closed: false, draft: true };
  const choose = (k, v, opts) => `<div class="pickers" id="${k}">${opts.map(o => `<button type="button" class="pick" data-v="${o}" aria-pressed="${o === v}">${o}</button>`).join('')}</div>`;
  const all = bdSorted(membersOf(null));
  const outList = () => SECTIONS.map(x => [x, all.filter(m => m.section === x.id)]).filter(([, l]) => l.length).map(([x, l]) => `<div class="eyebrow" style="margin:10px 0 4px">${esc(x.name)}</div>
    <ul class="mini-list bd-out" style="max-height:none">${l.map(m => `<li><label class="bd-out-r"><input type="checkbox" data-mid="${esc(m.id)}" ${(p.out || []).includes(m.id) ? '' : 'checked'}><span>${esc(bdName(m.id))}</span></label></li>`).join('')}</ul>`).join('');
  openSheet({
    title: ex ? 'Edita les bandes' : 'Noves bandes',
    wide: true,
    body: `<div class="kv">
      <p class="m" style="margin:0">Una votació on tothom tria qui s’emporta cada categoria. El vot és secret: l’equip només en veu els recomptes, les estadístiques i qui ha votat.</p>
      <label class="field"><span>Títol</span><input class="inp" id="bd-title" maxlength="90" value="${esc(p.title)}"></label>
      <label class="field"><span>Presentació</span><textarea class="inp" id="bd-desc" maxlength="4000" style="min-height:120px" placeholder="Arriben les bandes! Com cada any…">${esc(p.description || '')}</textarea>
        <small>Surt a la papereta i a l’anunci. Amb el mateix format que els anuncis: **negreta**, llistes amb «-»…</small></label>
      <label class="field"><span>Categories, una per línia</span><textarea class="inp" id="bd-cats" style="min-height:220px" placeholder="Nom de la categoria: qui s’ho mereix&#10;Soprano: la millor soprano&#10;&#10;De parella&#10;Parella de l’any: …">${esc(bandesText(p))}</textarea>
        <small>«Nom: descripció». Les de parella, sota una línia que digui «De parella» o amb [parella] després del nom. Una categoria que es diu com una ${esc(V.section)} («Soprano», «Tenor»…) només és d’aquella ${esc(V.section)}; també s’hi pot posar [S]. Les de ${esc(V.section)} i les de parella donen una banda; les altres, les que triïs a sota (o [1], [3]… després del nom).</small></label>
      <div class="bd-prev" id="bd-prev"></div>
      <div class="field"><span>Persones per categoria (a cada papereta)</span>${choose('bd-picks', +p.picks || 2, [1, 2, 3])}</div>
      <div class="field"><span>Bandes per categoria (les més votades)</span>${choose('bd-win', +p.win || 2, [1, 2, 3])}<small>A les de parella i a les d’una ${esc(V.section)}, una sola banda.</small></div>
      <div class="field"><span>Qui hi participa (si no en tries cap, tothom)</span>${sectionPickers('bd-secs', p.sections)}</div>
      <details class="np-group"><summary><span id="bd-out-h"></span>${ICON.chev}</summary><p class="m" style="margin:8px 0 0">Qui no hi surt ni vota ni pot ser votat (p. ex. qui és de baixa tota la temporada).</p>${outList()}</details>
      <div class="toggle-row"><span><b>Es pot votar a un mateix</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Si no, cadascú no surt a les seves llistes</span></span><label class="switch"><input type="checkbox" id="bd-self" ${p.selfOk ? 'checked' : ''}><span></span></label></div>
      <label class="field"><span>Es pot votar fins al (inclòs)</span><input class="inp" id="bd-close" type="date" value="${esc(p.closesAt || '')}"><small>La vespra, l’app ho recorda a qui encara no ha votat.</small></label>
      <div class="eyebrow" style="margin-top:6px">La Nit: l’entrega de les bandes</div>
      <label class="field"><span>Com es diu</span><input class="inp" id="bd-gname" maxlength="60" value="${esc(galaName(p))}"></label>
      <label class="field"><span>Quin dia és</span><input class="inp" id="bd-gala" type="date" value="${esc(p.galaAt || '')}"><small>Surt a Inici amb el compte enrere. Els finalistes es revelen un dia rere l’altre, de l’endemà de tancar la votació fins a la Nit.</small></label>
      <label class="field"><span>On (opcional)</span><input class="inp" id="bd-gplace" maxlength="80" value="${esc(p.galaPlace || '')}" placeholder="p. ex. el sopar de Sant Esteve"></label>
      <div class="field"><span>Finalistes per categoria</span>${choose('bd-fin', +p.finalists || BANDES_FINAL, [3, 5])}</div>
      ${ex && !ex.draft ? `<div class="toggle-row"><span><b>Tancada</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Ja no s’hi pot votar</span></span><label class="switch"><input type="checkbox" id="bd-closed" ${p.closed ? 'checked' : ''}><span></span></label></div>` : ''}
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="bd-del">Esborra</button>' : ''}<span class="spacer"></span>${p.draft ? '<button class="btn" id="bd-save">Desa l’esborrany</button><button class="btn btn-primary" id="bd-pub">Publica…</button>' : '<button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="bd-save">Desa</button>'}`,
    onMount: el => {
      bindToggles(el, '#bd-secs');
      for (const k of ['#bd-picks', '#bd-win', '#bd-fin']) el.querySelectorAll(`${k} .pick`).forEach(b => b.onclick = () => el.querySelectorAll(`${k} .pick`).forEach(x => x.setAttribute('aria-pressed', x === b)));
      const val = k => +el.querySelector(`${k} .pick[aria-pressed="true"]`)?.dataset.v || 2;
      const read = () => {
        const win = val('#bd-win');
        return { ...p, title: el.querySelector('#bd-title').value.trim(), description: el.querySelector('#bd-desc').value.trim(),
          cats: parseBandes(el.querySelector('#bd-cats').value, { win, old: p.cats }), picks: val('#bd-picks'), win,
          sections: readSections(el, '#bd-secs'), out: $$('.bd-out input:not(:checked)', el).map(i => i.dataset.mid),
          selfOk: el.querySelector('#bd-self').checked, closesAt: el.querySelector('#bd-close').value,
          galaName: el.querySelector('#bd-gname').value.trim() || 'La Nit de les Bandes', galaAt: el.querySelector('#bd-gala').value, galaPlace: el.querySelector('#bd-gplace').value.trim(), finalists: val('#bd-fin'),
          closed: el.querySelector('#bd-closed')?.checked ?? !!p.closed, author: ex?.author || authorName(), createdAt: ex?.createdAt || new Date().toISOString() };
      };
      const preview = () => {
        const r = read(), cs = r.cats, nPair = cs.filter(c => c.pair).length;
        el.querySelector('#bd-prev').innerHTML = cs.length ? `<p class="eyebrow" style="margin:0 0 6px">${cs.length} ${cs.length === 1 ? 'categoria' : 'categories'}${nPair ? ` · ${cs.length - nPair} individuals · ${nPair} de parella` : ''}</p>
          <ol class="bd-prev-l">${cs.map(c => `<li><span><b>${esc(c.name)}</b>${c.desc ? `<small>${esc(cutText(c.desc, 90))}</small>` : ''}</span><span class="bd-tags">${c.pair ? '<span class="tag">Parella</span>' : ''}${c.sec ? `<span class="tag">${esc(SEC[c.sec]?.name || c.sec)}</span>` : ''}<span class="m mono">${c.win} ${c.win === 1 ? 'banda' : 'bandes'}</span></span></li>`).join('')}</ol>`
          : '<p class="m" style="margin:0">Encara no hi ha cap categoria.</p>';
        const n = bandesPeople(r).length, outN = r.out.filter(x => pollExpected(r).some(m => m.id === x)).length;
        el.querySelector('#bd-out-h').textContent = `Hi participen ${n} ${n === 1 ? 'persona' : 'persones'}${outN ? ` (${outN} fora)` : ''}`;
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
    p.galaAt ? `**${galaName(p)}:** ${longDate(p.galaAt).toLowerCase()}${p.galaPlace ? `, ${p.galaPlace}` : ''}. Abans, a la pàgina de les bandes (menú del compte i Inici) es revelaran els ${+p.finalists || BANDES_FINAL} finalistes de cada categoria, un dia rere l’altre.` : '',
  ].filter(Boolean).join('\n\n').slice(0, 12000);
}
/** Publicar-la: deixa de ser un esborrany, li arriba a tothom i, si es vol, surt un anunci al tauler que la presenta. */
function bandesPublish(pid) {
  const p = S.polls.get(pid);
  if (!p || !p.draft) return;
  const n = bandesPeople(p).length;
  openSheet({
    title: 'Publicar la votació?',
    body: `<p style="margin-top:0">La podran votar <b>${n} persones</b>${p.closesAt ? ` fins al ${ddmm(p.closesAt)}` : ''}. A qui té les notificacions activades li arribarà un avís al mòbil.</p>
      <div class="toggle-row"><span><b>Publica també un anunci al tauler</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Amb la presentació, totes les categories i el botó per votar. L’avís al mòbil serà el de l’anunci.</span></span><label class="switch"><input type="checkbox" id="bp-ann" checked><span></span></label></div>
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

/* ---------- Els resultats (qui porta el tauler) ---------- */
const BD_PEEK = new Set();   // votacions obertes de les quals ja s'ha volgut veure el recompte en aquesta sessió
const rankPos = (rows, i) => rows.findIndex(r => r.n === rows[i].n) + 1;
function bandesHighlights(t) {
  const out = [], ppl = t.people;
  const top = (k, min) => { const best = Math.max(0, ...ppl.map(x => k(x))); return best >= min ? [best, ppl.filter(x => k(x) === best)] : [0, []]; };
  const names = l => l.slice(0, 3).map(x => bdName(x.id)).join(', ') + (l.length > 3 ? ` i ${l.length - 3} més` : '');
  const [w, wl] = top(x => x.wins.length, 2);
  if (wl.length) out.push(['Més bandes', names(wl), `${w} bandes${wl.length === 1 ? `: ${t.cats.filter(c => wl[0].wins.includes(c.cat.id)).map(c => c.cat.name).join(', ')}` : ' cadascú'}`]);
  const [nm, nl] = top(x => x.nominations, 2);
  if (nl.length) out.push(['Més nominacions', names(nl), `ha${nl.length === 1 ? '' : 'n'} rebut vots a ${nm} categories`]);
  const decided = t.cats.filter(c => c.rows.length > (c.cat.win || 1) && !c.open);
  const tight = decided.map(c => ({ c, gap: c.rows[(c.cat.win || 1) - 1].n - c.rows[c.cat.win || 1].n })).sort((a, b) => a.gap - b.gap)[0];
  if (tight) out.push(['La més ajustada', tight.c.cat.name, tight.gap ? `${tight.gap === 1 ? 'un vot' : `${tight.gap} vots`} de diferència (${tight.c.rows[(tight.c.cat.win || 1) - 1].n} a ${tight.c.rows[tight.c.cat.win || 1].n})` : 'empat desfet per l’equip']);
  const cons = t.cats.filter(c => c.ballots >= 3 && c.rows.length).map(c => ({ c, share: c.rows[0].n / c.ballots })).sort((a, b) => b.share - a.share)[0];
  if (cons) out.push(['Més consens', cons.c.cat.name, `${keyName(cons.c.rows[0].key)} surt a ${cons.c.rows[0].n} de ${cons.c.ballots} paperetes (${pct(cons.share)})`]);
  const blank = [...t.cats].sort((a, b) => b.blank - a.blank)[0];
  if (blank && blank.blank && t.voters >= 3) out.push(['La més en blanc', blank.cat.name, `${blank.blank} de ${t.voters} paperetes`]);
  return out;
}
/** Les paperetes de cada dia: unes barres petites, del primer vot a l'últim (o a avui). */
function bandesDays(days) {
  const keys = Object.keys(days).sort();
  if (keys.length < 2) return '';
  const all = [];
  for (let d = keys[0]; d <= keys[keys.length - 1] && all.length < 60; d = addDays(d, 1)) all.push(d);
  const max = Math.max(...all.map(d => days[d] || 0)), W = 300, H = 64, bw = W / all.length;
  return `<figure class="bd-days"><svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Paperetes per dia: ${all.map(d => `${ddmm(d)}, ${days[d] || 0}`).join('; ')}">
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" class="ax"/>
      ${all.map((d, i) => { const h = (days[d] || 0) / max * (H - 14); return `<rect x="${(i * bw + bw * .15).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"${days[d] === max ? ' class="hi"' : ''}/>`; }).join('')}
      <text x="0" y="${H + 13}">${ddmm(all[0])}</text><text x="${W}" y="${H + 13}" text-anchor="end">${ddmm(all[all.length - 1])}</text>
      <text x="${W}" y="9" text-anchor="end">màx. ${max}</text>
    </svg><figcaption>Paperetes enviades cada dia</figcaption></figure>`;
}
/** Com es reparteixen els vots d'una categoria: un anell amb els cinc més votats i «la resta». Qui s'emporta la banda va amb
 *  el color de l'agrupació i els altres, en grisos (el que compta és qui guanya i per quant); la llegenda en diu els vots i el
 *  percentatge. Els vots són els noms que hi ha posat cada papereta (fins a dos per categoria). */
function bandesDonut(x) {
  const total = x.rows.reduce((n, r) => n + r.n, 0);
  if (!total) return '';
  const wins = new Set(x.winners), tied = new Set(x.open ? x.tied : []);
  let g = 0;
  const segs = x.rows.slice(0, 5).map(r => ({ label: keyName(r.key), n: r.n, cls: wins.has(r.key) ? 'w' : tied.has(r.key) ? 't' : `g${Math.min(3, ++g)}` }));
  const rest = x.rows.slice(5);
  if (rest.length) segs.push({ label: rest.length === 1 ? keyName(rest[0].key) : `La resta (${rest.length})`, n: rest.reduce((n, r) => n + r.n, 0), cls: 'r' });
  const R = 42, C = 2 * Math.PI * R, gap = segs.length > 1 ? 1.6 : 0;
  let at = 0;
  const arcs = segs.map((s, i) => {
    const len = Math.max(0, s.n / total * C - gap);
    const arc = `<circle data-i="${i}" class="${s.cls}" r="${R}" cx="60" cy="60" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"><title>${esc(s.label)}: ${s.n} ${s.n === 1 ? 'vot' : 'vots'} (${pct(s.n / total)})</title></circle>`;
    at += s.n / total * C;
    return arc;
  }).join('');
  return `<div class="bd-pie"><svg viewBox="0 0 120 120" role="img" aria-label="Repartiment dels ${total} vots: ${esc(segs.map(s => `${s.label}, ${pct(s.n / total)}`).join('; '))}">
      <g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="60" class="c1">${total}</text><text x="60" y="75" class="c2">${total === 1 ? 'vot' : 'vots'}</text></svg>
    <ul class="bd-leg">${segs.map((s, i) => `<li data-i="${i}"><i class="${s.cls}" aria-hidden="true"></i><span class="bd-who">${esc(s.label)}${s.cls === 'w' ? '<span class="bd-band">Banda</span>' : s.cls === 't' ? '<span class="bd-band tie">Empat</span>' : ''}</span><span class="mono">${s.n}</span><span class="mono bd-pc">${pct(s.n / total)}</span></li>`).join('')}</ul></div>`;
}
function bandesCatHtml(x, p) {
  const c = x.cat, w = c.win || 1, rows = x.rows, max = rows[0]?.n || 1;
  const wins = new Set(x.winners), tied = new Set(x.tied);
  const fin = [...(p.nominees?.[c.id] || bandesFinalists(rows, +p.finalists || BANDES_FINAL))].sort(byKeyName);
  const row = (r, j) => `<li class="${wins.has(r.key) ? 'win' : tied.has(r.key) && x.open ? 'tie' : ''}"><span class="bd-pos mono">${rankPos(rows, j)}</span><span class="bd-who">${esc(keyName(r.key))}${wins.has(r.key) ? '<span class="bd-band">Banda</span>' : ''}</span><span class="mono bd-n">${r.n}</span><span class="bd-bar"><span style="width:${r.n / max * 100}%"></span></span></li>`;
  const tie = x.tied.length && (x.open || x.decided) ? `<div class="bd-tie"><p><b>Empat a ${x.cut} ${x.cut === 1 ? 'vot' : 'vots'}.</b> ${x.open ? `Tria ${x.open === 1 ? 'qui s’emporta la banda' : `les ${x.open} que s’emporten la banda`}:` : 'Ho ha decidit l’equip:'}</p>
      <div class="pickers">${x.tied.map(k => `<button type="button" class="pick" data-tie="${esc(c.id)}" data-k="${esc(k)}" aria-pressed="${x.decided && wins.has(k)}">${esc(keyName(k))}</button>`).join('')}</div></div>` : '';
  return `<section class="bd-cr" id="bd-c-${esc(c.id)}"><div class="bd-cr-h"><h3>${esc(c.name)}</h3><span class="m">${esc(catKind(c))} · ${w === 1 ? '1 banda' : `${w} bandes`} · ${x.ballots} ${x.ballots === 1 ? 'papereta' : 'paperetes'}${x.blank ? ` · ${x.blank} en blanc` : ''}</span></div>
    ${tie}
    ${rows.length ? `${bandesDonut(x)}<p class="bd-fin"><b>${p.nominees ? 'Finalistes' : 'Finalistes, si es publiquessin ara'}:</b> ${esc(fin.map(keyName).join(', '))}</p>
      ${rows.length > 5 ? `<details class="np-group"><summary><span>Tots els vots (${rows.length})</span>${ICON.chev}</summary><ol class="bd-rank">${rows.map(row).join('')}</ol></details>` : ''}` : '<p class="m" style="margin:0">Encara no hi ha cap vot.</p>'}</section>`;
}
/** Qui ha rebut més vots, sumant totes les categories. */
function bandesTopPeople(t) {
  const top = [...t.people].sort((a, b) => b.votes - a.votes || bdName(a.id).localeCompare(bdName(b.id), 'ca')).slice(0, 8);
  if (!top.length) return '';
  const max = top[0].votes || 1;
  return `<div class="eyebrow" style="margin:16px 0 6px">Qui ha rebut més vots</div>
    <div class="bd-top">${top.map(x => `<div class="bar-row"><span class="lbl"><span>${esc(bdName(x.id))}</span></span><span class="bd-bar"><span style="width:${x.votes / max * 100}%"></span></span><span class="val">${x.votes}</span></div>`).join('')}</div>
    <p class="m bd-note">Sumant totes les categories; les de parella compten per a totes dues persones.</p>`;
}
function sheetBandesResults(pid) {
  const p = S.polls.get(pid);
  if (!p) return;
  if (!pollClosed(p) && !BD_PEEK.has(pid)) {
    openSheet({
      title: 'Resultats',
      body: `<p style="margin-top:0"><b>La votació encara és oberta.</b> El recompte pot canviar fins al final${p.closesAt ? ` (${ddmm(p.closesAt)})` : ''}. Si vols que sigui una sorpresa també per a tu, espera’t a tancar-la.</p>`,
      foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">M’espero</button><button class="btn btn-primary" id="br-peek">Mira’ls igualment</button>',
      onMount: el => { el.querySelector('#br-peek').onclick = () => { BD_PEEK.add(pid); sheetBandesResults(pid); }; },
    });
    return;
  }
  const t = bandesTally(p, bandesVotes(p), bandesPeople(p));
  const open = t.cats.filter(x => x.open);
  const hl = bandesHighlights(t);
  const ph = bandesPhase(p);
  const status = p.results ? `<p class="bd-ok">Palmarès publicat el ${ddmm(isoDate(new Date(p.resultsAt)))}: tothom el veu a ${esc(galaName(p))}.</p>`
    : open.length ? `<p class="bd-warn">${open.length === 1 ? 'Hi ha un empat' : `Hi ha ${open.length} empats`} per decidir: ${esc(open.map(x => x.cat.name).join(', '))}.</p>`
    : p.nominees ? `<p class="bd-ok">Finalistes publicats: es revelen ${esc(nomRange(p))}.</p>` : '';
  openSheet({
    title: `Resultats · ${p.title}`,
    wide: true,
    body: `<div class="bd-res">
      <div class="bd-sum">
        <div><b class="mono">${t.voters}</b><span>de ${t.expected} han votat</span></div>
        <div><b class="mono">${pct(t.expected ? t.voters / t.expected : null)}</b><span>de participació</span></div>
        <div><b class="mono">${t.filled.toFixed(1).replace('.', ',')}</b><span>categories per papereta</span></div>
      </div>
      ${status}
      <div class="eyebrow" style="margin:16px 0 6px">Participació per ${esc(V.section)}</div>
      <div class="bd-secs-l">${t.bySec.map(x => `<div class="bar-row"><span class="lbl"><em>${esc(SEC[x.sec]?.short || x.sec)}</em><span>${esc(SEC[x.sec]?.name || x.sec)}</span></span><span class="bd-bar"><span style="width:${x.n / x.total * 100}%"></span></span><span class="val">${x.n}/${x.total}</span></div>`).join('')}</div>
      ${bandesDays(t.days)}
      ${hl.length ? `<div class="eyebrow" style="margin:16px 0 6px">El que diuen els números</div><ul class="bd-hl">${hl.map(([k, v, s]) => `<li><span class="k">${esc(k)}</span><b>${esc(v)}</b><small>${esc(s)}</small></li>`).join('')}</ul>` : ''}
      ${bandesTopPeople(t)}
      <div class="eyebrow" style="margin:18px 0 6px">Categoria per categoria</div>
      <div class="chips bd-idx">${t.cats.map(x => `<button type="button" class="chip" data-go="bd-c-${esc(x.cat.id)}">${esc(x.cat.name)}</button>`).join('')}</div>
      ${t.cats.map(x => bandesCatHtml(x, p)).join('')}
    </div>`,
    foot: `<button class="btn btn-sm" id="br-xls">Excel</button><button class="btn btn-sm" id="br-print">Palmarès</button><button class="btn btn-sm" id="br-dip">Diplomes</button><button class="btn btn-sm" id="br-gala">Gala</button><span class="spacer"></span>
      ${!p.nominees && !p.results && ph !== 'draft' ? `<button class="btn${pollClosed(p) ? ' btn-primary' : ''}" id="br-nom">Publica els finalistes</button>` : ''}
      ${p.results ? '<button class="btn" id="br-unpub">Amaga el palmarès</button>' : `<button class="btn${p.nominees || !pollClosed(p) ? ' btn-primary' : ''}" id="br-pub">Publica el palmarès</button>`}`,
    onMount: el => {
      el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => el.querySelector(`#${b.dataset.go}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      el.querySelectorAll('[data-tie]').forEach(b => b.onclick = () => {
        const x = t.cats.find(c => c.cat.id === b.dataset.tie), need = x.open || (x.decided ? x.winners.filter(k => x.tied.includes(k)).length : 0);
        const cur = (p.ties?.[x.cat.id] || []).filter(k => x.tied.includes(k));
        const next = cur.includes(b.dataset.k) ? cur.filter(k => k !== b.dataset.k) : [...cur, b.dataset.k].slice(-need);
        const rec = { ...clone(S.polls.get(pid)), ties: { ...(p.ties || {}), [x.cat.id]: next } };
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        const top = el.querySelector('.sheet-b').scrollTop;
        sheetBandesResults(pid);
        const b2 = $('#sheet-root .sheet-b'); if (b2) b2.scrollTop = top;
      });
      el.querySelector('#br-xls').onclick = () => offerCSV(`resultats ${p.title}`, [['Categoria', 'Tipus', 'Posició', 'Qui', 'Vots', 'Finalista', 'Banda'],
        ...t.cats.flatMap(x => { const fin = p.nominees?.[x.cat.id] || bandesFinalists(x.rows, +p.finalists || BANDES_FINAL); return x.rows.map((r, j) => [x.cat.name, catKind(x.cat), rankPos(x.rows, j), keyName(r.key), r.n, fin.includes(r.key) ? 'Sí' : '', x.winners.includes(r.key) ? 'Sí' : x.open && x.tied.includes(r.key) ? 'Empat' : '']); }),
        [], ['Participació', '', '', `${t.voters} de ${t.expected}`, pct(t.expected ? t.voters / t.expected : null), '', '']]);
      el.querySelector('#br-print').onclick = () => printDoc(`Palmarès · ${p.title}`, `<p class="pr-sub">${esc(galaName(p))}${p.galaAt ? `, ${esc(longDate(p.galaAt).toLowerCase())}` : ''}. Hi han votat ${t.voters} de ${t.expected} persones.</p>
        <table class="pr-table"><thead><tr><th>Banda</th><th>Qui se l’emporta</th><th>Finalistes</th></tr></thead><tbody>${t.cats.map(x => { const fin = [...(p.nominees?.[x.cat.id] || bandesFinalists(x.rows, +p.finalists || BANDES_FINAL))].sort(byKeyName).filter(k => !x.winners.includes(k)); return `<tr><td><b>${esc(x.cat.name)}</b>${x.cat.desc ? `<br><small>${esc(x.cat.desc)}</small>` : ''}</td><td>${x.winners.map(k => esc(keyName(k))).join('<br>')}${x.open ? `${x.winners.length ? '<br>' : ''}<i>Empat: ${esc(x.tied.map(keyName).join(', '))}</i>` : ''}</td><td><small>${esc(fin.map(keyName).join(', '))}</small></td></tr>`; }).join('')}</tbody></table>`);
      el.querySelector('#br-gala').onclick = () => { closeSheet(); bandesGala(pid); };
      // Per imprimir-los abans de la Nit (i donar-los a qui guanya), amb el recompte d'ara; els empats, primer desfets.
      el.querySelector('#br-dip').onclick = () => {
        if (open.length) { toast(`Primer cal desfer ${open.length === 1 ? 'l’empat' : 'els empats'}: ${open.map(x => x.cat.name).join(', ')}`); return; }
        printDiplomas(p, p.results || Object.fromEntries(t.cats.map(x => [x.cat.id, x.winners])));
      };
      el.querySelector('#br-nom')?.addEventListener('click', () => bandesNominate(pid));
      el.querySelector('#br-pub')?.addEventListener('click', async () => {
        if (open.length) { toast(`Primer cal desfer ${open.length === 1 ? 'l’empat' : 'els empats'}: ${open.map(x => x.cat.name).join(', ')}`); return; }
        const ok = await confirmSheet('Publicar el palmarès?', `Tothom veurà a ${esc(galaName(p))} qui s’ha endut cada banda (sense els vots).${pollClosed(p) ? '' : ' La votació es tanca: ja no s’hi podrà votar.'}${p.galaAt && TODAY < p.galaAt ? ` <b>Encara no és la Nit</b> (${ddmm(p.galaAt)}).` : ''}`, 'Publica’l', false);
        if (!ok) { sheetBandesResults(pid); return; }
        const now = new Date().toISOString();
        const rec = { ...clone(S.polls.get(pid)), closed: true, results: Object.fromEntries(t.cats.filter(x => x.winners.length).map(x => [x.cat.id, x.winners])), resultsAt: now };
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        toast('Palmarès publicat'); render(); sheetBandesResults(pid);
      });
      el.querySelector('#br-unpub')?.addEventListener('click', () => {
        const rec = clone(S.polls.get(pid)); delete rec.results; delete rec.resultsAt;
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        toast('Palmarès amagat'); render(); sheetBandesResults(pid);
      });
    },
  });
}
/** Qui ha votat (sense què): per saber a qui cal recordar-ho. */
function bandesWhoVoted(p) {
  const people = bandesPeople(p);
  const block = x => {
    const ms = bdSorted(people.filter(m => m.section === x.id));
    if (!ms.length) return '';
    const done = ms.filter(m => S.pollVotes.get(`${p.id}_${m.id}`)).length;
    return `<div class="eyebrow" style="margin:14px 0 4px">${esc(x.name)} · ${done}/${ms.length}</div><ul class="mini-list" style="max-height:none">${ms.map(m => { const v = S.pollVotes.get(`${p.id}_${m.id}`); return `<li><span>${esc(m.name)}</span><span class="rsvp ${v ? 'yes' : 'none'}">${v ? 'Ha votat' : '—'}</span></li>`; }).join('')}</ul>`;
  };
  openSheet({ title: p.title, body: `<p class="m" style="margin-top:0">Només surt qui ha votat, no què ha votat.</p>${SECTIONS.map(block).join('')}` });
}

/* ---------- La gala: per anunciar-les una a una, en una pantalla gran ---------- */
// Cada banda en tres passos, com als Òscars: la categoria, els finalistes i qui se l'emporta.
function bandesGala(pid) {
  const p = S.polls.get(pid);
  if (!p) return;
  const t = bandesTally(p, bandesVotes(p), bandesPeople(p));
  const cards = t.cats.filter(x => x.rows.length), ties = cards.filter(x => x.open);
  let i = -1, stage = 0;
  const root = document.createElement('div');
  root.className = 'gala';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', `Gala · ${p.title}`);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const fsOn = !!root.requestFullscreen;
  try { root.requestFullscreen?.().catch(() => {}); } catch {}
  const winners = x => x.open ? [...x.winners, ...x.tied] : x.winners;
  const finals = x => [...(p.nominees?.[x.cat.id] || bandesFinalists(x.rows, +p.finalists || BANDES_FINAL))].sort(byKeyName);
  const paint = () => {
    let inner;
    if (i < 0) inner = `<p class="gala-k">${esc(S.config.name || '')}</p><h1 class="gala-t">${esc(galaName(p))}</h1><p class="gala-s">${esc(p.title)} · ${cards.length} ${cards.length === 1 ? 'banda' : 'bandes'} per repartir · hi han votat ${t.voters} persones</p>
      ${ties.length ? `<p class="gala-warn">Abans de començar: ${ties.length === 1 ? 'hi ha un empat' : `hi ha ${ties.length} empats`} sense desfer (${esc(ties.map(x => x.cat.name).join(', '))}). Es desfan a Resultats.</p>` : ''}`;
    else if (i >= cards.length) inner = `<h1 class="gala-t">Enhorabona a tothom!</h1><p class="gala-s">${esc(galaName(p))}</p>`;
    else {
      const x = cards[i];
      inner = `<p class="gala-k">Banda ${i + 1} de ${cards.length}${x.cat.pair ? ' · de parella' : x.cat.sec ? ` · ${esc((SEC[x.cat.sec]?.name || '').toLowerCase())}` : ''}</p><h1 class="gala-t">${esc(x.cat.name)}</h1>
        ${stage === 0 && x.cat.desc ? `<p class="gala-d">${esc(x.cat.desc)}</p>` : ''}
        ${stage === 1 ? `<div class="gala-fin"><p class="gala-k">Els finalistes són</p><ul>${finals(x).map((k, j) => `<li style="--d:${j * 140}ms">${esc(keyName(k))}</li>`).join('')}</ul></div>` : ''}
        ${stage === 2 ? `<div class="gala-w"><p class="gala-k">${x.open ? 'Empat! La banda és per a' : 'I la banda és per a'}</p>${winners(x).map((k, j) => `<p class="gala-n" style="--d:${j * 180}ms">${esc(keyName(k))}</p>`).join('')}</div>` : ''}`;
    }
    const label = i < 0 ? 'Comença' : i >= cards.length ? 'Tanca' : stage === 0 ? 'Els finalistes' : stage === 1 ? 'Revela' : i === cards.length - 1 ? 'Al final' : 'La següent';
    root.innerHTML = `<button class="gala-x" data-g="close" aria-label="Tanca la gala">${ICON.close}</button>
      <div class="gala-c" aria-live="polite">${inner}</div>
      <div class="gala-f"><button class="gala-b" data-g="back" ${i < 0 ? 'disabled' : ''}>Enrere</button><button class="gala-b main" data-g="next">${label}</button></div>`;
    root.querySelector('[data-g="next"]').focus({ preventScroll: true });
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    if (fsOn && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    root.remove(); document.body.style.overflow = '';
  };
  const next = () => {
    if (i >= cards.length) return close();
    if (i >= 0 && stage < 2) stage++;
    else { i++; stage = 0; }
    paint();
  };
  const back = () => {
    if (i < 0) return;
    if (i < cards.length && stage > 0) stage--;
    else { i--; stage = i >= 0 ? 2 : 0; }
    paint();
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (['ArrowRight', ' ', 'Enter', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); back(); }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', e => { const g = e.target.closest('[data-g]')?.dataset.g; if (g === 'next') next(); else if (g === 'back') back(); else if (g === 'close') close(); });
  paint();
}
