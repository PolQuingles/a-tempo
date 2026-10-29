// A Tempo · 08c-nit-bandes.js — La Nit de les Bandes: la pàgina de les bandes (al menú del compte, a Inici i al menú lateral),
// els finalistes de cada categoria, que es revelen un dia rere l'altre fins a la Nit, i el palmarès.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* Els finalistes (nominees) els publica l'equip quan es tanca la votació: { categoria: [claus] }, per ordre alfabètic, perquè
 * no diguin qui va primer. Es revelen a partir de nomFrom: una categoria cada dia, en l'ordre de les categories, fins al dia de
 * la Nit (galaAt), o totes alhora (nomEvery 'all'). El document el pot llegir tothom de l'agrupació; l'app només n'ensenya el
 * que ja s'ha revelat. Qui guanya no es desa enlloc fins que l'equip publica el palmarès. */
const BANDES_FINAL = 5;
const dayDiff = (a, b) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
const galaName = p => p.galaName || 'La Nit de les Bandes';
/** El nom d'una categoria per posar-lo entre «»: sense les cometes que ja porti («"Soprano"» → «Soprano»). */
const catQ = c => `«${String(c?.name || '').replace(/^["“”«»']+|["“”«»']+$/g, '')}»`;
/** Els finalistes d'una categoria (d'un recompte ordenat): els k més votats i, si n'hi ha d'empatats a l'últim lloc, també
 *  (fins a tres més); si l'empat és més gran, només els que tenen més vots que l'últim lloc. */
function bandesFinalists(rows, k = BANDES_FINAL) {
  if (rows.length <= k) return rows.map(r => r.key);
  const cut = rows[k - 1].n, withTies = rows.filter(r => r.n >= cut);
  return (withTies.length <= k + 3 ? withTies : rows.filter(r => r.n > cut)).map(r => r.key);
}
const byKeyName = (a, b) => keyName(a).localeCompare(keyName(b), 'ca');
/** El dia que es revelen els finalistes de cada categoria (en l'ordre de les categories). */
function nomSchedule(p) {
  const n = (p.cats || []).length;
  const from = p.nomFrom || (p.closesAt ? addDays(p.closesAt, 1) : TODAY);
  if (p.nomEvery === 'all' || !p.galaAt || p.galaAt < from) return Array(n).fill(from);
  const days = dayDiff(from, p.galaAt) + 1;
  return Array.from({ length: n }, (_, i) => addDays(from, Math.floor(i * days / n)));
}
/** Les categories amb els finalistes ja revelats (fins avui) i les que encara falten. */
function nomReveal(p, today = TODAY) {
  const when = nomSchedule(p), out = { shown: [], next: [] };
  (p.cats || []).forEach((c, i) => (when[i] <= today ? out.shown : out.next).push({ cat: c, date: when[i], keys: p.nominees?.[c.id] || [], i }));
  return out;
}
/** En quin moment és: esborrany, votació, tancada (sense finalistes), finalistes, la Nit (el mateix dia), després de la Nit
 *  (sense palmarès) o acabada (amb el palmarès). */
function bandesPhase(p, today = TODAY) {
  if (p.draft) return 'draft';
  if (p.results) return 'done';
  if (!(p.closed || (p.closesAt && p.closesAt < today))) return 'vote';
  if (p.galaAt && today > p.galaAt) return 'after';
  if (p.galaAt && today === p.galaAt) return 'gala';
  return p.nominees ? 'nom' : 'closed';
}
/** Les bandes d'aquest any: les darreres (l'esborrany, només per a l'equip). */
function currentBandes() {
  return [...S.polls.values()].filter(p => isBandes(p) && (!p.draft || canBoard()) && forMe(p))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
}
/** Si surten al menú i a Inici: des que es publiquen fins a un mes després de la Nit (o del palmarès). */
function bandesSeason(p) {
  if (!p) return false;
  if (p.draft) return canBoard();
  const end = [p.galaAt, p.resultsAt && isoDate(new Date(p.resultsAt)), p.closesAt].filter(Boolean).sort().pop() || TODAY;
  return TODAY <= addDays(end, 30);
}
const bandesVoter = p => !!p && !!myId() && bandesPeople(p).some(m => m.id === myId());
const bandesPending = p => !!p && bandesPhase(p) === 'vote' && bandesVoter(p) && !S.pollVotes.get(`${p.id}_${myId()}`);
const bandesMenuOn = () => bandesSeason(currentBandes());

/* ---------- La pàgina ---------- */
const BN_STEPS = ['vote', 'nom', 'gala'];
const BN_AT = { draft: 0, vote: 0, closed: 1, nom: 1, gala: 2, after: 3, done: 3 };
function nomRange(p) {
  const when = nomSchedule(p);
  if (!when.length) return '';
  const a = when[0], b = when[when.length - 1];
  return a === b ? `el ${ddmm(a)}` : `del ${ddmm(a)} al ${ddmm(b)}`;
}
function bandesHero(p) {
  const ph = bandesPhase(p), at = BN_AT[ph], days = p.galaAt ? dayDiff(TODAY, p.galaAt) : null;
  const year = (p.galaAt || p.closesAt || TODAY).slice(0, 4);
  const steps = [['Votació', p.closesAt ? `fins al ${ddmm(p.closesAt)}` : ''], ['Finalistes', nomRange(p)], [galaName(p).replace(/^La /, ''), p.galaAt ? ddmm(p.galaAt) : '']];
  const count = days == null || days < 0 || p.results ? '' : `<div class="bn-count" aria-label="${days === 0 ? 'És avui' : `Falten ${days} dies`}">${days === 0 ? '<b>Avui</b>' : days === 1 ? '<b>Demà</b>' : `<b class="mono">${days}</b><span>dies</span>`}</div>`;
  return `<section class="bn-hero">
    <div class="bn-hero-t"><p class="bn-k">${esc(S.config.shortName || S.config.name || '')} · ${year}</p>
      <h1 class="bn-t">${esc(galaName(p))}</h1>
      ${p.galaAt ? `<p class="bn-when">${esc(longDate(p.galaAt))}${p.galaPlace ? ` · ${esc(p.galaPlace)}` : ''}</p>` : ''}</div>
    ${count}
    <ol class="bn-steps">${steps.map(([t, s], i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</li>`).join('')}</ol>
  </section>`;
}
function bandesVoteBlock(p) {
  if (!bandesVoter(p)) return '';
  const mine = S.pollVotes.get(`${p.id}_${myId()}`), n = (p.cats || []).length, open = bandesPhase(p) === 'vote';
  if (!open && !mine) return '';
  const draft = !mine && open ? ballotDraft(p) : null;
  const text = mine ? `Has votat ${mine.n || Object.keys(mine.picks || {}).length} de ${n} categories.${open && p.closesAt ? ` Pots canviar el vot fins al ${ddmm(p.closesAt)}.` : ''}`
    : `${draft ? 'Ja l’has començada: el mòbil se’n recorda.' : 'Encara no has votat.'}${p.closesAt ? ` Tens temps fins al ${ddmm(p.closesAt)}.` : ''} El vot és secret.`;
  return `<section class="bn-card bn-vote"><div><h2 class="h2">La teva papereta</h2><p>${esc(text)}</p></div>
    ${open ? `<button class="btn ${mine ? '' : 'btn-primary'}" data-act="bandes-vote" data-id="${esc(p.id)}">${mine ? 'Canvia el vot' : draft ? 'Continua votant' : 'Vota'}</button>` : ''}</section>`;
}
const bnWho = k => `<span class="bn-av">${keyIds(k).map(id => avatar(S.members.get(id))).join('')}</span><span class="bn-nm">${esc(keyName(k))}</span>`;
function bandesNomBlock(p) {
  if (!p.nominees) return '';
  const { shown, next } = nomReveal(p), today = shown.filter(x => x.date === TODAY), past = shown.filter(x => x.date !== TODAY).reverse();
  const card = x => `<li class="bn-nom${x.date === TODAY ? ' today' : ''}"><div class="bn-nom-h"><span class="bn-date">${x.date === TODAY ? 'Avui' : esc(shortDate(x.date))}</span><h3>${esc(x.cat.name)}</h3>${x.cat.pair ? '<span class="tag">Parella</span>' : ''}</div>
    ${x.cat.desc ? `<p class="bn-desc">${esc(x.cat.desc)}</p>` : ''}
    ${x.keys.length ? `<ul class="bn-fin">${x.keys.map(k => `<li>${bnWho(k)}</li>`).join('')}</ul>` : '<p class="m" style="margin:0">Ningú no hi va rebre vots.</p>'}</li>`;
  return `<div class="section-title"><h2 class="h2">Finalistes</h2><span class="bn-n mono">${shown.length}/${shown.length + next.length}</span></div>
    ${shown.length ? `<ol class="bn-noms">${[...today, ...past].map(card).join('')}</ol>` : `<p class="m">Els primers finalistes es revelen ${esc(longDate(next[0]?.date || TODAY).toLowerCase())}.</p>`}
    ${next.length ? `<details class="np-group bn-next"><summary><span>Encara per revelar (${next.length})</span>${ICON.chev}</summary>
      <ul class="bn-next-l">${next.map(x => `<li><span>${esc(x.cat.name)}</span><span class="mono">${dayDiff(TODAY, x.date) === 1 ? 'demà' : esc(ddmm(x.date))}</span></li>`).join('')}</ul></details>` : ''}`;
}
function bandesPalmPage(p) {
  const res = p.results || {}, me = myId(), list = (p.cats || []).filter(c => res[c.id]?.length);
  if (!list.length) return '';
  const mine = me ? list.filter(c => res[c.id].some(k => keyIds(k).includes(me))) : [];
  return `<div class="section-title"><h2 class="h2">Palmarès</h2></div>
    ${mine.length ? `<p class="bd-mine"><b>${mine.length === 1 ? 'T’has endut una banda' : `T’has endut ${mine.length} bandes`}:</b> ${esc(mine.map(c => c.name).join(', '))}. Enhorabona!</p>` : ''}
    <ol class="bn-palm">${list.map(c => {
      const fin = (p.nominees?.[c.id] || []).filter(k => !res[c.id].includes(k));
      return `<li><span class="bn-cat">${esc(c.name)}</span><b class="bn-winner">${res[c.id].map(k => esc(keyName(k))).join('<br>')}</b>${fin.length ? `<small>Finalistes: ${esc(fin.map(keyName).join(', '))}</small>` : ''}</li>`;
    }).join('')}</ol>`;
}
function bandesCatsBlock(p, open) {
  const cats = p.cats || [];
  return `<details class="np-group bn-cats"${open ? ' open' : ''}><summary><span>Les ${cats.length} categories</span>${ICON.chev}</summary>
    <ul class="bn-cat-l">${cats.map(c => `<li><div><b>${esc(c.name)}</b>${c.pair ? '<span class="tag">Parella</span>' : c.sec ? `<span class="tag">${esc(SEC[c.sec]?.name || c.sec)}</span>` : ''}</div>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</li>`).join('')}</ul></details>`;
}
function bandesTeamBlock(p) {
  if (!canBoard()) return '';
  const ph = bandesPhase(p), people = bandesPeople(p), voted = people.filter(m => S.pollVotes.get(`${p.id}_${m.id}`)).length;
  const b = (act, t, primary) => `<button class="btn btn-sm${primary ? ' btn-primary' : ''}" data-act="${act}" data-id="${esc(p.id)}">${t}</button>`;
  const status = ph === 'draft' ? 'És un esborrany: només el veu l’equip.'
    : ph === 'vote' ? `Han votat ${voted} de ${people.length}.`
    : ph === 'closed' ? `La votació s’ha tancat (han votat ${voted} de ${people.length}). Ara toca publicar els finalistes.`
    : ph === 'done' ? `Palmarès publicat el ${ddmm(isoDate(new Date(p.resultsAt)))}.`
    : `Finalistes publicats: es revelen ${nomRange(p)}.`;
  const acts = [
    ph === 'draft' && b('bandes-publish', 'Publica-la', true),
    ph === 'closed' && b('bandes-nominate', 'Publica els finalistes', true),
    ph !== 'draft' && b('bandes-results', 'Resultats'),
    ph !== 'draft' && b('bandes-gala', 'Gala'),
    ph === 'vote' && b('poll-results', 'Qui ha votat'),
    ph === 'vote' && b('poll-remind', 'Recorda-ho'),
    b('bandes-edit', 'Edita'),
  ].filter(Boolean);
  return `<section class="bn-card bn-team"><h2 class="h3">Per a l’equip</h2><p class="m" style="margin:0">${esc(status)}</p>
    ${ph === 'vote' ? `<span class="bd-bar"><span style="width:${people.length ? voted / people.length * 100 : 0}%"></span></span>` : ''}
    <div class="bd-acts">${acts.join('')}</div></section>`;
}
function viewBandes() {
  const from = tabsForRole().includes(ui.bandesFrom) ? ui.bandesFrom : 'avisos';
  const p = currentBandes();
  const head = `<div class="page-head"><div class="ph-back"><button class="nav-arrow" data-act="tab" data-tab="${from}" aria-label="Torna a ${esc(TAB_LABEL[from])}">${ICON.left}</button><div><div class="eyebrow">${p ? 'Les bandes' : 'Premis de l’agrupació'}</div><h1 class="h1">${esc(p ? p.title : 'Bandes')}</h1></div></div></div>`;
  if (!p) return head + `<div class="empty"><p>Encara no hi ha cap votació de bandes.</p>${canBoard() ? '<button class="btn btn-primary" data-act="bandes-new">+ Bandes</button>' : ''}</div>`;
  const ph = bandesPhase(p);
  const older = [...S.polls.values()].filter(q => isBandes(q) && q.id !== p.id && q.results).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `${head}<div class="bn-page">
    ${bandesHero(p)}
    ${ph === 'gala' ? `<p class="bn-today">Avui és ${esc(galaName(p).replace(/^L/, 'l'))}! Els guanyadors es descobreixen a la festa.</p>` : ''}
    ${['draft', 'vote'].includes(ph) ? bandesVoteBlock(p) : ''}
    ${ph === 'done' ? bandesPalmPage(p) : ''}
    ${['nom', 'gala', 'after'].includes(ph) || (ph === 'done' && !p.results) ? bandesNomBlock(p) : ''}
    ${ph === 'closed' ? `<section class="bn-card"><p style="margin:0">La votació s’ha tancat. Aviat es revelaran els finalistes de cada categoria${p.galaAt ? `, un dia rere l’altre fins a la Nit` : ''}.</p></section>` : ''}
    ${['closed', 'nom', 'gala', 'after'].includes(ph) ? bandesVoteBlock(p) : ''}
    ${bandesCatsBlock(p, ['draft', 'vote'].includes(ph))}
    ${bandesTeamBlock(p)}
    ${older.length ? `<div class="section-title"><h2 class="h2">Edicions anteriors</h2></div>${older.map(q => `<details class="np-group"><summary><span>${esc(q.title)}</span>${ICON.chev}</summary><ul class="bd-palm-l">${(q.cats || []).filter(c => q.results[c.id]?.length).map(c => `<li><span class="bd-cat">${esc(c.name)}</span><span class="bd-win">${q.results[c.id].map(k => esc(keyName(k))).join('<br>')}</span></li>`).join('')}</ul></details>`).join('')}` : ''}
  </div>`;
}
/** A Inici: la Nit que s'acosta, i què toca ara (votar, els finalistes d'avui, el palmarès). */
function bandesHomeCard() {
  const p = currentBandes();
  if (!p || p.draft || !bandesSeason(p)) return '';
  const ph = bandesPhase(p), days = p.galaAt ? dayDiff(TODAY, p.galaAt) : null, mine = myId() && S.pollVotes.get(`${p.id}_${myId()}`);
  const today = ph === 'nom' && p.nominees ? nomReveal(p).shown.filter(x => x.date === TODAY) : [];
  const big = p.results ? 'Ja hi ha el palmarès' : days == null || days < 0 ? galaName(p) : days === 0 ? 'És avui!' : days === 1 ? 'És demà!' : `Falten ${days} dies`;
  const line = ph === 'vote' ? (bandesVoter(p) ? (mine ? 'Ja has votat. El pots canviar fins al ' + ddmm(p.closesAt) : `Vota fins al ${ddmm(p.closesAt)}`) : `Votació oberta fins al ${ddmm(p.closesAt)}`)
    : today.length ? `Avui: finalistes de ${today.map(x => catQ(x.cat)).join(', ')}`
    : ph === 'nom' ? `Finalistes ${nomRange(p)}` : ph === 'done' ? 'Mira qui s’ha endut cada banda' : ph === 'gala' ? 'Ens veiem a la festa' : 'Aviat, els finalistes';
  return `<button class="bn-home" data-act="bandes-open"><span class="bn-home-t"><small>${esc(galaName(p))}${p.galaAt ? ` · ${esc(ddmm(p.galaAt))}` : ''}</small><b>${esc(big)}</b><small>${esc(line)}</small></span>${ICON.go}</button>`;
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
    body: `<p style="margin-top:0">Es publiquen els ${k} més votats de cada categoria, per ordre alfabètic i sense els vots${stillOpen ? '. <b>La votació es tanca:</b> ja no s’hi podrà votar' : ''}. Qui guanya no es veu fins que publiquis el palmarès.</p>
      <div class="field"><span>Com es revelen</span><div class="pickers" id="bn-every"><button type="button" class="pick" data-v="day" aria-pressed="${p.nomEvery !== 'all' && !!p.galaAt}">Una categoria cada dia fins a la Nit</button><button type="button" class="pick" data-v="all" aria-pressed="${p.nomEvery === 'all' || !p.galaAt}">Totes alhora</button></div></div>
      <label class="field"><span>A partir del</span><input class="inp" type="date" id="bn-from" value="${esc(from0)}"></label>
      <p class="m" id="bn-plan" style="margin:0"></p>
      <details class="np-group"><summary><span>Quants finalistes hi ha a cada categoria</span>${ICON.chev}</summary>
        <ul class="mini-list" style="max-height:none">${t.cats.map(x => `<li><span>${esc(x.cat.name)}</span><span class="mono">${fin[x.cat.id].length}${fin[x.cat.id].length > k ? ' · empat' : ''}</span></li>`).join('')}</ul></details>`,
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
