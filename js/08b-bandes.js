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
 * Fins que s'envia el primer cop, la papereta es desa al mòbil (atempo:bandes:<votació>); després, cada canvi es desa sol. */
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
  const meta = `<div class="ann-m">${state}<span>${cats.length} ${cats.length === 1 ? 'categoria' : 'categories'}</span>${p.closesAt ? `<span>Fins al ${shortDate(p.closesAt)}</span>` : ''}${p.sections?.length ? `<span>Per a: ${esc(p.sections.map(x => SEC[x]?.name || x).join(', '))}</span>` : ''}<span>Vot secret</span></div>`;
  const draft = voter && !mine ? ballotDraft(p) : null;
  const acts = [];
  if (voter && !closed) acts.push(`<button class="btn btn-sm ${mine ? '' : 'btn-primary'}" data-act="bandes-vote" data-id="${esc(p.id)}">${mine ? 'Canvia el vot' : draft ? 'Continua votant' : 'Vota'}</button>`);
  if (voter && mine) acts.push(`<span class="rsvp yes">Has votat ${mine.n || Object.keys(mine.picks || {}).length} de ${cats.length}</span>`);
  if (voter && mine && closed) acts.push(`<button class="btn btn-sm" data-act="bandes-mine" data-id="${esc(p.id)}">El teu vot</button>`);
  else if (voter && !closed && !mine) acts.push('<span class="muted bd-note">Encara no has votat</span>');
  let board = '';
  if (canBoard()) {
    const voted = people.filter(m => S.pollVotes.get(`${p.id}_${m.id}`)).length;
    board = `${p.draft ? `<p class="m u-m-0">${p.propOpen ? 'S’hi recullen propostes de categories: la votació encara no és oberta.' : 'Només la veu l’equip. Quan la publiquis, rebran la notificació i la podran votar.'}</p>` : `<div class="bd-part"><div class="bd-part-h"><span>Han votat <b class="mono">${voted}</b> de ${people.length}</span><span class="mono">${pct(people.length ? voted / people.length : null)}</span></div><span class="bd-bar"><span style="width:${people.length ? voted / people.length * 100 : 0}%"></span></span></div>`}
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
/** La papereta. El primer cop va categoria a categoria (o lliscant) i s'envia en acabar o abans («Envia el que tinc»): fins
 *  llavors, es desa al mòbil. Un cop enviada, s'obre a «El teu vot» (les categories en blanc, primer) i cada canvi es desa sol.
 *  Des de «El teu vot» (o la barra de dalt, que és l'índex), «Fet» hi torna en lloc d'anar a la categoria següent. */
function sheetBallot(pid) {
  const p0 = S.polls.get(pid), me = S.members.get(myId());
  if (!p0 || !me || p0.draft) return;
  if (!bandesPeople(p0).some(m => m.id === me.id)) { toast('No surts a la llista d’aquesta votació'); return; }
  if (pollClosed(p0)) { toast('La votació ja s’ha tancat'); return; }
  const key = `${pid}_${me.id}`, draft = ballotDraft(p0);
  let sent = S.pollVotes.get(key), changed = false, el;
  const fromDraft = draft && (!sent || (draft.at || '') > (sent.at || ''));
  const cats = p0.cats || [], n = cats.length;
  // hub: s'hi ha arribat des de «El teu vot», i «Fet» hi torna (amb el vot enviat, sempre).
  const st = { step: sent ? n : fromDraft ? Math.min(draft.step ?? -1, n) : -1, hub: !!sent, picks: clone(fromDraft ? draft.picks : sent?.picks || {}), q: '', sec: '', saved: false };
  const people = bdSorted(bandesPeople(p0));
  const until = p0.closesAt ? `fins al ${shortDate(p0.closesAt)}` : 'fins que es tanqui';
  const got = c => st.picks[c.id] || [];
  const filled = c => c.pair ? got(c).length === 2 : got(c).length > 0;
  const filledCount = () => cats.filter(filled).length;
  /** Abans d'enviar-lo, el vot (i on s'és) es desa al mòbil; després, cada canvi va directe al vot. */
  const commit = () => {
    if (!sent) { lsSet(ballotKey(p0), JSON.stringify({ picks: st.picks, step: st.step, at: new Date().toISOString() })); return; }
    const p = S.polls.get(pid);
    if (!p || pollClosed(p)) { changed = false; closeSheet(); toast('La votació ja s’ha tancat: l’últim canvi no s’ha desat'); render(); return; }
    const picks = bandesBallot(p, st.picks, me.id);
    sent = { pollId: pid, memberId: me.id, section: me.section, picks, n: Object.keys(picks).length, choices: [], at: new Date().toISOString(), uid: S.uid };
    S.pollVotes.set(key, sent); persist('pollVotes', key, sent, 600);
    lsSet(ballotKey(p0), null);
    changed = st.saved = true;
  };
  // Un vot enviat no es pot buidar del tot: hi ha de quedar almenys una categoria.
  const wouldEmpty = (c, l) => !!sent && !Object.keys(bandesBallot(p0, { ...st.picks, [c.id]: l }, me.id)).length;
  const pairOk = c => {
    if (!c || !c.pair || got(c).length !== 1) return true;
    toast('Una parella són dues persones: tria’n una altra o treu-la per deixar-la en blanc');
    return false;
  };
  const intro = () => {
    const nPair = cats.filter(c => c.pair).length, max = catMax(p0, {}), secs = cats.some(c => c.sec);
    return `<div class="bb-intro">
      ${p0.description ? `<div class="rich">${richText(p0.description)}</div>` : ''}
      <ul class="bb-rules">
        <li><b class="mono">${n}</b> ${n === 1 ? 'categoria' : 'categories'}${nPair ? `: ${n - nPair} individuals i ${nPair} de parella` : ''}.</li>
        <li>A cada una pots triar fins a <b>${max}</b> ${max === 1 ? 'persona' : 'persones'}${nPair ? '; a les de parella, una parella' : ''}.${secs ? ` Les d’una ${esc(V.section)} només són d’aquella ${esc(V.section)}.` : ''}</li>
        <li>Pots deixar-ne en blanc i anar endavant i enrere (o lliscar) tant com vulguis. Pots enviar el que tinguis quan vulguis i completar-ho després.</li>
        <li><b>El vot és secret:</b> ningú no veu a l’app qui has votat. L’equip només en veu els recomptes.</li>
        <li>${capz(until)} pots canviar el vot: un cop enviat, cada canvi es desa sol.${p0.selfOk ? '' : ' No et pots votar: no surts a les llistes.'}</li>
      </ul></div>`;
  };
  const slots = c => {
    const max = catMax(p0, c), l = got(c);
    return Array.from({ length: max }, (_, k) => l[k]
      ? `<button type="button" class="bb-slot on" data-bb="rm" data-id="${esc(l[k])}" aria-label="Treu ${esc(bdName(l[k]))}"><span>${esc(bdName(l[k]))}</span>${ICON.close}</button>`
      : `<span class="bb-slot">${c.pair ? `Persona ${k + 1}` : k === 0 ? 'Tria algú' : 'I algú més, si vols'}</span>`).join(c.pair ? '<span class="bb-and" aria-hidden="true">i</span>' : '');
  };
  const listHtml = c => {
    const l = got(c), q = normText(st.q).trim();
    const cand = people.filter(m => (!c.sec || m.section === c.sec) && (p0.selfOk || m.id !== me.id) && (c.sec || !st.sec || m.section === st.sec)
      && (!q || normText(bdName(m.id)).includes(q) || normText(m.name).includes(q)));
    if (!cand.length) return `<li class="bb-none">${q ? 'Ningú no es diu així.' : 'No hi ha ningú per triar.'}</li>`;
    let last = null;
    return cand.map(m => {
      const on = l.includes(m.id), head = !q && !c.sec && !st.sec && m.section !== last ? `<li class="bb-h">${esc(SEC[m.section]?.name || m.section)}</li>` : '';
      last = m.section;
      return `${head}<li><button type="button" class="bb-p" data-bb="pick" data-id="${esc(m.id)}" aria-pressed="${on}">${avatar(m)}<span class="bb-n">${esc(bdName(m.id))}</span><span class="bb-ck">${on ? ICON.check : ''}</span></button></li>`;
    }).join('');
  };
  // A dalt: la barra (un tros per categoria, plens els votats), que obre «El teu vot», i a la dreta «Envia el que tinc» o «Desat».
  const topHtml = i => {
    const c = cats[i], f = filledCount();
    const right = sent ? `<span class="bb-saved" aria-live="polite">${st.saved ? `${ICON.check}Desat` : 'Es desa sol'}</span>`
      : f ? '<button type="button" class="bb-jump" data-bb="send">Envia el que tinc</button>' : '';
    return `<div class="bb-top"><button type="button" class="bb-prog" data-bb="index" aria-label="Totes les categories: ${f} de ${n} votades">${cats.map((x, j) => `<span class="${filled(x) ? 'on' : ''}${j === i ? ' cur' : ''}"></span>`).join('')}</button>
      <p class="bb-step"><button type="button" class="bb-idx" data-bb="index"><span><b class="mono">${i + 1}</b> de ${n} · ${esc(catKind(c))}</span>${ICON.chev}</button>${right}</p></div>`;
  };
  const catHtml = i => {
    const c = cats[i], max = catMax(p0, c);
    const swap = max === 1 ? 'Si en toques una altra, la substitueix.' : `Si ja n’hi ha ${c.pair ? 'dues' : max}, la que toquis substitueix l’última.`;
    return `${topHtml(i)}
      <h3 class="bb-name">${esc(c.name)}</h3>
      ${c.desc ? `<p class="bb-desc">${esc(c.desc)}</p>` : ''}
      <p class="bb-how">${c.pair ? 'Tria les dues persones de la parella.' : `Tria’n fins a ${max === 1 ? 'una' : max}.`} ${swap} Si no en tens cap al cap, deixa-la en blanc.</p>
      <div class="bb-stick"><div class="bb-slots" id="bb-slots">${slots(c)}</div>
        <div class="bb-tools"><input class="inp" type="search" id="bb-q" placeholder="Cerca un nom" autocomplete="off" value="${esc(st.q)}" aria-label="Cerca un nom">
          ${c.sec ? '' : `<div class="seg3 bb-secs" role="radiogroup" aria-label="${esc(V.Section)}"><button type="button" role="radio" data-bb="sec" data-k="" aria-checked="${!st.sec}">Tots</button>${SECTIONS.filter(x => people.some(m => m.section === x.id)).map(x => `<button type="button" role="radio" data-bb="sec" data-k="${esc(x.id)}" aria-checked="${st.sec === x.id}">${esc(x.short)}</button>`).join('')}</div>`}</div></div>
      <ul class="bb-list" id="bb-list">${listHtml(c)}</ul>`;
  };
  const pickText = c => { const l = got(c); return c.pair && l.length === 1 ? `${bdName(l[0])} i… (hi falta la segona persona)` : l.map(bdName).join(c.pair ? ' i ' : ' · '); };
  // «El teu vot»: totes les categories, les en blanc primer, i cada una s'obre per canviar-la.
  const reviewHtml = () => {
    const f = filledCount(), all = cats.map((c, i) => [c, i]), blank = all.filter(([c]) => !filled(c)), done = all.filter(([c]) => filled(c));
    const row = ([c, i]) => `<li><button type="button" data-bb="go" data-i="${i}"><span><b>${esc(c.name)}</b><small class="${filled(c) ? '' : 'blank'}">${got(c).length ? esc(pickText(c)) : 'En blanc'}</small></span><span class="bb-ch">${filled(c) ? 'Canvia' : 'Vota'}${ICON.go}</span></button></li>`;
    const group = (t, l) => l.length ? `${blank.length && done.length ? `<p class="bb-g">${t} <span class="mono">(${l.length})</span></p>` : ''}<ul class="bb-rev">${l.map(row).join('')}</ul>` : '';
    return `<p class="eyebrow u-m-0">${sent ? 'El teu vot' : 'Revisa el teu vot'}</p>
      <p class="u-m-6-0-12">Has votat <b class="mono">${f}</b> de ${n} ${n === 1 ? 'categoria' : 'categories'}. ${sent
        ? `Toca’n una per canviar-la: els canvis es desen sols, ${until}.`
        : `${blank.length ? `${blank.length === 1 ? 'Una queda' : `${blank.length} queden`} en blanc. ` : ''}Toca’n una per canviar-la. Un cop enviat, el podràs canviar ${until}.`}</p>
      ${group('En blanc', blank)}${group('Votades', done)}`;
  };
  const footHtml = () => {
    if (st.step < 0) return `<button class="btn" data-act="sheet-close">Tanca</button><span class="spacer"></span><button class="btn btn-primary" data-bb="next">${filledCount() ? 'Continua' : 'Comença'}</button>`;
    if (st.step >= n) return sent ? '<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Fet</button>'
      : `<button class="btn" data-bb="back">Enrere</button><span class="spacer"></span><button class="btn btn-primary" data-bb="send" ${filledCount() ? '' : 'disabled'}>Envia el vot</button>`;
    if (st.hub) return `<button type="button" class="icon-btn bb-nav" data-bb="prev" aria-label="Categoria anterior" ${st.step ? '' : 'disabled'}>${ICON.left}</button><button type="button" class="icon-btn bb-nav" data-bb="next" aria-label="${st.step === n - 1 ? 'Totes les categories' : 'Categoria següent'}">${ICON.right}</button>
      <span class="spacer"></span><button class="btn btn-primary" data-bb="done">Fet</button>`;
    const has = got(cats[st.step]).length;
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
    el.querySelector('.bb-top').outerHTML = topHtml(st.step);
    el.querySelector('#bb-slots').innerHTML = slots(c);
    el.querySelector('#bb-list').innerHTML = listHtml(c);
    el.querySelector('.sheet-f').innerHTML = footHtml();
  };
  const go = (i, hub = st.hub) => {
    st.step = Math.max(-1, Math.min(n, i)); st.hub = !!sent || hub; st.q = ''; st.sec = '';
    if (!sent) commit();
    paint();
  };
  const drop = (c, id) => {
    const l = got(c).filter(x => x !== id);
    if (wouldEmpty(c, l)) { toast('El vot ha de tenir almenys una categoria votada'); return; }
    st.picks[c.id] = l; commit(); repaintPicks();
  };
  const pick = (c, id) => {
    const l = got(c);
    if (l.includes(id)) { drop(c, id); return; }
    buzz(8);
    if (l.length < catMax(p0, c)) { st.picks[c.id] = [...l, id]; commit(); repaintPicks(); return; }
    // Ja n'hi ha prou: la nova substitueix l'última, i es pot desfer.
    st.picks[c.id] = [...l.slice(0, -1), id]; commit(); repaintPicks();
    toast(`${bdName(id)} en lloc de ${bdName(l[l.length - 1])}`, { label: 'Desfés', run: () => {
      st.picks[c.id] = l; commit();
      if (!el.isConnected) render(); else if (cats[st.step] === c) repaintPicks();
    } });
  };
  const send = () => {
    const p = S.polls.get(pid);
    if (!p || pollClosed(p)) { closeSheet(); toast('La votació ja s’ha tancat'); render(); return; }
    const picks = bandesBallot(p, st.picks, me.id);
    if (!Object.keys(picks).length) { toast('Vota almenys una categoria'); return; }
    const again = S.pollVotes.has(key);
    const rec = { pollId: pid, memberId: me.id, section: me.section, picks, n: Object.keys(picks).length, choices: [], at: new Date().toISOString(), uid: S.uid };
    S.pollVotes.set(key, rec);
    // El primer cop, el vot suma 1 al recompte que veu tothom (vegeu sendFirstVote, a 08c).
    if (again) persist('pollVotes', key, rec, 10); else sendFirstVote(key, rec);
    lsSet(ballotKey(p), null);
    changed = false; closeSheet();
    toast(rec.n < n ? `Vot enviat (${rec.n} de ${n}). El pots completar ${until}.` : 'Vot enviat. Gràcies!'); render();
  };
  openSheet({
    title: p0.title, wide: true, body: '', foot: '<span></span>',
    onMount: x => {
      el = x;
      el.classList.add('bb-sheet');
      const close0 = sheetClose;
      sheetClose = () => { close0(); if (changed) { toast('Vot desat'); render(); } };
      // Canvis d'abans que no s'havien desat (quan calia tocar «Desa els canvis»): ara es desen.
      if (sent && fromDraft) {
        if (Object.keys(bandesBallot(p0, st.picks, me.id)).length) commit();
        else { st.picks = clone(sent.picks || {}); lsSet(ballotKey(p0), null); }
      }
      paint();
      el.addEventListener('input', e => { if (e.target.id === 'bb-q') { st.q = e.target.value; el.querySelector('#bb-list').innerHTML = listHtml(cats[st.step]); } });
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-bb]');
        if (!b || b.disabled) return;
        const k = b.dataset.bb, c = cats[st.step];
        if (k === 'pick') pick(c, b.dataset.id);
        else if (k === 'rm') drop(c, b.dataset.id);
        else if (k === 'sec') { st.sec = b.dataset.k; el.querySelectorAll('.bb-secs [data-bb="sec"]').forEach(x => x.setAttribute('aria-checked', x === b)); el.querySelector('#bb-list').innerHTML = listHtml(c); }
        else if (k === 'go') go(+b.dataset.i, true);
        else if (k === 'index') go(n);
        else if (k === 'done') { if (pairOk(c)) go(n); }
        else if (k === 'prev') go(st.step - 1, true);
        else if (k === 'back') go(st.step - 1, false);
        else if (k === 'next') { if (pairOk(c)) go(st.step + 1); }
        else if (k === 'send') { if (pairOk(c)) send(); }
      });
      // Lliscant el dit cap a l'esquerra, la categoria següent; cap a la dreta, l'anterior.
      let tx = null;
      el.addEventListener('touchstart', e => {
        tx = st.step >= 0 && st.step < n && e.touches.length === 1 && !e.target.closest('input, .bb-tools, .sheet-f')
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
      }, { passive: true });
      el.addEventListener('touchend', e => {
        if (!tx) return;
        const t = e.changedTouches[0], dx = t.clientX - tx.x, dy = t.clientY - tx.y, quick = Date.now() - tx.t < 800;
        tx = null;
        if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) { if (pairOk(cats[st.step])) go(st.step + 1); }
        else if (st.step > 0 || !st.hub) go(st.step - 1);
      }, { passive: true });
    },
  });
}
/** Quan ja s'ha tancat la votació, el vot de cadascú (només el veu ella), fins que s'esborren les paperetes. */
function sheetMyBallot(pid) {
  const p = S.polls.get(pid), v = p && myId() ? S.pollVotes.get(`${pid}_${myId()}`) : null;
  if (!p || !v) { toast(p?.ballotsGone ? 'Les paperetes ja s’han esborrat' : 'No hi has votat'); return; }
  const cats = p.cats || [], l = c => v.picks?.[c.id] || [], f = cats.filter(c => l(c).length).length;
  openSheet({
    title: 'El teu vot',
    body: `<p class="u-m-0-0-12">${esc(p.title)}: has votat <b class="mono">${f}</b> de ${cats.length} ${cats.length === 1 ? 'categoria' : 'categories'}. <span class="muted">Només ho veus tu. Un mes després de la Nit, les paperetes s’esborren.</span></p>
      <ul class="bb-rev bb-ro">${cats.map(c => `<li><b>${esc(c.name)}</b><small class="${l(c).length ? '' : 'blank'}">${l(c).length ? esc(l(c).map(bdName).join(c.pair ? ' i ' : ' · ')) : 'En blanc'}</small></li>`).join('')}</ul>`,
    foot: '<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Tanca</button>',
  });
}
