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
/** El nom de la Nit com als cartells: els mots petits del mig en cursiva («La Nit <i>de les</i> Bandes»). */
function galaTitle(p) {
  const w = galaName(p).split(/\s+/);
  return w.map((x, i) => i > 0 && i < w.length - 1 && /^[a-zà-ú’']{1,4}$/.test(x) ? `<i>${esc(x)}</i>` : esc(x)).join(' ').replace(/<\/i> <i>/g, ' ');
}
/** Quan comença: el dia i l'hora (si no en té, la mitjanit d'aquell dia). */
const galaStart = p => p.galaAt ? new Date(`${p.galaAt}T${p.galaTime || '00:00'}:00`) : null;
/** El programa de la Nit, una línia per moment: «21:00 Arribada i photocall» (l'hora és opcional). */
function parseProgram(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 20).map(l => {
    const m = l.match(/^(\d{1,2})(?:[:.’'](\d{2})\s*h?|\s*h)\s*[-–·:]?\s+(.+)$/);
    return m && +m[1] < 24 ? { t: `${pad(+m[1])}:${m[2] || '00'}`, what: m[3].slice(0, 120) } : { t: '', what: l.slice(0, 120) };
  });
}
const programText = p => (p.program || []).map(x => `${x.t ? `${x.t} ` : ''}${x.what}`).join('\n');
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
  if (p.draft) return p.propOpen ? 'prop' : 'draft';
  if (p.results) return 'done';
  if (!(p.closed || (p.closesAt && p.closesAt < today))) return 'vote';
  if (p.galaAt && today > p.galaAt) return 'after';
  if (p.galaAt && today === p.galaAt) return 'gala';
  return p.nominees ? 'nom' : 'closed';
}
/** Les bandes d'aquest any: les darreres (l'esborrany, només per a l'equip, llevat que s'hi recullin propostes). */
function currentBandes() {
  return [...S.polls.values()].filter(p => isBandes(p) && (!p.draft || p.propOpen || canBoard()) && forMe(p))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
}
/** Si surten al menú i a Inici: des que es publiquen fins a un mes després de la Nit (o del palmarès). */
function bandesSeason(p) {
  if (!p) return false;
  if (p.draft) return !!p.propOpen || canBoard();
  const end = [p.galaAt, p.resultsAt && isoDate(new Date(p.resultsAt)), p.closesAt].filter(Boolean).sort().pop() || TODAY;
  return TODAY <= addDays(end, 30);
}
const bandesVoter = p => !!p && !!myId() && bandesPeople(p).some(m => m.id === myId());
const bandesPending = p => !!p && bandesPhase(p) === 'vote' && bandesVoter(p) && !S.pollVotes.get(`${p.id}_${myId()}`);
const bandesMenuOn = () => bandesSeason(currentBandes());

/* ---------- La pàgina ---------- */
// En quin pas de la capçalera és cada fase (les propostes, només si n'hi ha hagut).
const BN_AT = { prop: 'prop', draft: 'vote', vote: 'vote', closed: 'nom', nom: 'nom', gala: 'gala', after: 'end', done: 'end' };
function nomRange(p) {
  const when = nomSchedule(p);
  if (!when.length) return '';
  const a = when[0], b = when[when.length - 1];
  return a === b ? `el ${ddmm(a)}` : `del ${ddmm(a)} al ${ddmm(b)}`;
}
/** El compte enrere: dies, hores i minuts si la Nit té hora (es va actualitzant sol, vegeu bandesTick); si no, els dies. */
function bandesCount(p) {
  const days = p.galaAt ? dayDiff(TODAY, p.galaAt) : null;
  if (days == null || days < 0 || p.results) return '';
  const at = galaStart(p), ms = at.getTime() - Date.now();
  if (days === 0 || ms <= 0) return `<div class="bn-count today"><b>Avui</b>${p.galaTime && ms > 0 ? `<span>a les ${esc(p.galaTime)}</span>` : ''}</div>`;
  if (!p.galaTime) return `<div class="bn-count" aria-label="Falten ${days} dies"><span class="bn-u"><b class="mono">${days}</b><small>${days === 1 ? 'dia' : 'dies'}</small></span></div>`;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  const u = (k, n, one, many) => `<span class="bn-u"><b class="mono" data-u="${k}">${k === 'd' ? n : pad(n)}</b><small data-l="${k}" data-one="${one}" data-many="${many}">${n === 1 ? one : many}</small></span>`;
  return `<div class="bn-count" data-at="${at.getTime()}" role="timer" aria-label="Falten ${d} dies i ${h} hores">${u('d', d, 'dia', 'dies')}${u('h', h, 'hora', 'hores')}${u('m', m, 'minut', 'minuts')}</div>`;
}
let BN_TICK = null;
/** Mentre la pàgina és oberta, el compte enrere va baixant (cada 20 s); quan arriba a zero, es torna a pintar la pàgina. */
function bandesTick() {
  if (BN_TICK) return;
  BN_TICK = setInterval(() => {
    const el = document.querySelector('.bn-count[data-at]');
    if (!el) { clearInterval(BN_TICK); BN_TICK = null; return; }
    const ms = +(el.getAttribute('data-at') || 0) - Date.now();
    if (ms <= 0) { clearInterval(BN_TICK); BN_TICK = null; scheduleRender(); return; }
    const v = { d: Math.floor(ms / 864e5), h: Math.floor(ms % 864e5 / 36e5), m: Math.floor(ms % 36e5 / 6e4) };
    for (const [k, n] of Object.entries(v)) {
      const b = el.querySelector(`[data-u="${k}"]`), l = el.querySelector(`[data-l="${k}"]`);
      if (b) b.textContent = k === 'd' ? String(n) : pad(n);
      if (l) l.textContent = (n === 1 ? l.getAttribute('data-one') : l.getAttribute('data-many')) || '';
    }
    el.setAttribute('aria-label', `Falten ${v.d} dies i ${v.h} hores`);
  }, 20e3);
}
/** La invitació: qui la presenta, el nom, quan i on, l'etiqueta, el compte enrere, «afegeix-la al calendari» i el camí fins a
 *  la Nit (propostes, votació, finalistes i la Nit). */
function bandesHero(p) {
  const ph = bandesPhase(p);
  const year = (p.galaAt || p.closesAt || TODAY).slice(0, 4);
  const steps = [...(p.propUntil ? [['prop', 'Propostes', `fins al ${ddmm(p.propUntil)}`]] : []), ['vote', 'Votació', p.closesAt ? `fins al ${ddmm(p.closesAt)}` : ''], ['nom', 'Finalistes', nomRange(p)], ['gala', 'La Nit', p.galaAt ? ddmm(p.galaAt) : '']];
  const at = BN_AT[ph] === 'end' ? steps.length : Math.max(0, steps.findIndex(([k]) => k === BN_AT[ph]));
  const when = p.galaAt ? [capz(longDate(p.galaAt)), p.galaTime ? `${p.galaTime} h` : ''].filter(Boolean) : [];
  const count = bandesCount(p);
  if (count.includes('data-at')) bandesTick();
  return `<section class="bn-hero">
    <p class="bn-k">${esc(S.config.shortName || S.config.name || '')} presenta · ${year}</p>
    <h1 class="bn-t">${galaTitle(p)}</h1>
    ${when.length ? `<p class="bn-when">${when.map(esc).join('<span class="bn-dot" aria-hidden="true">·</span>')}${p.galaPlace ? `<span class="bn-where">${esc(p.galaPlace)}</span>` : ''}</p>` : ''}
    ${p.galaDress ? `<p class="bn-dress"><span>Etiqueta</span> ${esc(p.galaDress)}</p>` : ''}
    ${count}
    ${p.galaAt && !p.results && ph !== 'after' ? `<div class="bn-hero-acts"><button class="bn-hb" data-act="bandes-ics" data-id="${esc(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>Afegeix-la al calendari</button>${p.galaPlace ? `<a class="bn-hb" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.galaPlace)}" target="_blank" rel="noopener">Com s’hi arriba</a>` : ''}</div>` : ''}
    <ol class="bn-steps" style="grid-template-columns:repeat(${steps.length},minmax(0,1fr))">${steps.map(([, t, s], i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</li>`).join('')}</ol>
  </section>`;
}
/** «Afegeix-la al calendari»: un .ics amb la Nit (amb l'hora i el lloc, l'etiqueta i el programa). */
function galaIcs(p) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const loc = dt => `${isoDate(dt).replace(/-/g, '')}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  const start = galaStart(p), end = new Date(start.getTime() + 4 * 36e5);
  const desc = [p.galaDress ? `Etiqueta: ${p.galaDress}` : '', ...(p.program || []).map(x => `${x.t ? `${x.t} ` : ''}${x.what}`)].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//A Tempo//CA', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:gala-${p.id}@a-tempo`, `DTSTAMP:${stamp}`,
    ...(p.galaTime ? [`DTSTART;TZID=Europe/Madrid:${loc(start)}`, `DTEND;TZID=Europe/Madrid:${loc(end)}`]
      : [`DTSTART;VALUE=DATE:${p.galaAt.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(p.galaAt, 1).replace(/-/g, '')}`]),
    `SUMMARY:${icsEscape(galaName(p))}`, ...(p.galaPlace ? [`LOCATION:${icsEscape(p.galaPlace)}`] : []), ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function bandesIcs(pid) {
  const p = S.polls.get(pid);
  if (!p?.galaAt) return;
  offerFile(`${galaName(p).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.ics`, galaIcs(p), 'text/calendar');
}
/** Tot el que cal saber de la Nit: el programa, on és, l'etiqueta, la informació pràctica i, si n'hi ha, la inscripció al sopar
 *  (una sortida del tauler, amb les seves preguntes i el seu preu). */
function bandesInfo(p) {
  const trip = p.tripId ? S.trips.get(p.tripId) : null, prog = p.program || [];
  if (!prog.length && !p.galaInfo && !trip) return '';
  let sign = '';
  if (trip) {
    const me = myId(), mine = me ? signupOf(trip, me) : null, n = tripCounts(trip).yes.length, open = tripOpen(trip);
    const state = mine?.answer === 'yes' ? '<span class="rsvp yes">T’hi has apuntat</span>' : mine?.answer === 'no' ? '<span class="rsvp no">Has dit que no hi vas</span>' : '';
    sign = `<div class="bn-sign"><div><b>${esc(trip.title)}</b><small>${!n ? 'Encara no s’hi ha apuntat ningú' : n === 1 ? 'Hi va 1 persona' : `Hi van ${n} persones`}${trip.deadline && open ? ` · inscripcions fins al ${ddmm(trip.deadline)}` : ''}${open ? '' : ' · inscripcions tancades'}</small></div>
      <div class="bd-acts">${state}${open && me ? `<button class="btn btn-sm${mine?.answer === 'yes' ? '' : ' btn-primary'}" data-act="trip-yes" data-id="${esc(trip.id)}">${mine?.answer === 'yes' ? 'Canvia-ho' : 'M’hi apunto'}</button>${mine?.answer !== 'no' ? `<button class="btn btn-sm btn-ghost" data-act="trip-no" data-id="${esc(trip.id)}">No hi vaig</button>` : ''}` : ''}</div></div>`;
  }
  return `<section class="bn-info">
    ${prog.length ? `<div class="bn-prog"><h2 class="bn-h">El programa</h2><ol>${prog.map(x => `<li><span class="bn-pt">${esc(x.t || '·')}</span><span>${esc(x.what)}</span></li>`).join('')}</ol></div>` : ''}
    ${p.galaInfo || trip ? `<div class="bn-prac"><h2 class="bn-h">Bon a saber</h2>${p.galaInfo ? `<div class="rich">${richText(p.galaInfo)}</div>` : ''}${sign}</div>` : ''}
  </section>`;
}
function bandesVoteBlock(p) {
  if (!bandesVoter(p)) return bandesPhase(p) === 'vote' && turnoutFor(p) ? `<section class="bn-card">${turnoutHtml(p)}</section>` : '';
  const mine = S.pollVotes.get(`${p.id}_${myId()}`), n = (p.cats || []).length, open = bandesPhase(p) === 'vote';
  if (!open && !mine) return '';
  const draft = !mine && open ? ballotDraft(p) : null;
  const text = mine ? `Has votat ${mine.n || Object.keys(mine.picks || {}).length} de ${n} categories.${open && p.closesAt ? ` Pots canviar el vot fins al ${ddmm(p.closesAt)}.` : ''}`
    : `${draft ? 'Ja l’has començada: el mòbil se’n recorda.' : 'Encara no has votat.'}${p.closesAt ? ` Tens temps fins al ${ddmm(p.closesAt)}.` : ''} El vot és secret.`;
  return `<section class="bn-card bn-vote"><div><h2 class="h2">La teva papereta</h2><p>${esc(text)}</p></div>
    ${open ? `<button class="btn ${mine ? '' : 'btn-primary'}" data-act="bandes-vote" data-id="${esc(p.id)}">${mine ? 'Canvia el vot' : draft ? 'Continua votant' : 'Vota'}</button>` : ''}
    ${turnoutHtml(p)}</section>`;
}
const bnWho = k => `<span class="bn-av">${keyIds(k).map(id => avatar(S.members.get(id))).join('')}</span><span class="bn-nm">${esc(keyName(k))}</span>`;
/* Els finalistes del dia arriben dins d'un sobre tancat: cadascú l'obre quan vol (una vegada; el mòbil se'n recorda). */
const LS_SOBRES = 'atempo:sobres';
const sobresOberts = () => { try { return new Set(JSON.parse(lsGet(LS_SOBRES) || '[]')); } catch { return new Set(); } };
function bandesEnvelope(el) {
  const card = el.closest('.bn-nom');
  const key = `${el.dataset.id}:${el.dataset.cat}`, open = sobresOberts();
  open.add(key); lsSet(LS_SOBRES, JSON.stringify([...open].slice(-300)));
  if (card) { card.classList.remove('sealed'); card.classList.add('opening'); }
}
function bandesNomBlock(p) {
  if (!p.nominees) return '';
  const { shown, next } = nomReveal(p), today = shown.filter(x => x.date === TODAY), past = shown.filter(x => x.date !== TODAY).reverse();
  const open = sobresOberts(), me = myId();
  const mine = me ? shown.filter(x => x.keys.some(k => keyIds(k).includes(me))) : [];
  const card = x => {
    const sealed = x.date === TODAY && x.keys.length && !open.has(`${p.id}:${x.cat.id}`);
    return `<li class="bn-nom${x.date === TODAY ? ' today' : ''}${sealed ? ' sealed' : ''}"><div class="bn-nom-h"><span class="bn-date">${x.date === TODAY ? 'Avui es revelen' : esc(shortDate(x.date))}</span><h3>${esc(x.cat.name)}</h3>${x.cat.pair ? '<span class="tag">Parella</span>' : x.cat.sec ? `<span class="tag">${esc(SEC[x.cat.sec]?.name || x.cat.sec)}</span>` : ''}</div>
    ${x.cat.desc ? `<p class="bn-desc">${esc(x.cat.desc)}</p>` : ''}
    ${sealed ? `<button class="bn-seal" data-act="bandes-envelope" data-id="${esc(p.id)}" data-cat="${esc(x.cat.id)}"><svg class="bn-seal-i" viewBox="0 0 48 36" aria-hidden="true"><rect x="1.5" y="1.5" width="45" height="33" rx="4"/><path d="M2.5 4l21.5 17L45.5 4"/><circle cx="24" cy="21" r="5.5"/></svg><span><b>Obre el sobre</b><small>${x.keys.length} finalistes</small></span></button>` : ''}
    ${x.keys.length ? `<ul class="bn-fin">${x.keys.map((k, j) => `<li style="--d:${j * 110}ms">${bnWho(k)}</li>`).join('')}</ul>` : '<p class="m" style="margin:0">Ningú no hi va rebre vots.</p>'}</li>`;
  };
  return `<div class="section-title"><h2 class="h2">Finalistes</h2><span class="bn-n mono">${shown.length}/${shown.length + next.length}</span></div>
    ${mine.length ? `<p class="bn-me"><b>Ets finalista</b> a ${esc(mine.map(x => catQ(x.cat)).join(', '))}. Ens veiem a la Nit!</p>` : ''}
    ${shown.length ? `<ol class="bn-noms">${[...today, ...past].map(card).join('')}</ol>` : `<p class="m">Els primers finalistes es revelen ${esc(longDate(next[0]?.date || TODAY).toLowerCase())}.</p>`}
    ${next.length ? `<details class="np-group bn-next"><summary><span>Encara per revelar (${next.length})</span>${ICON.chev}</summary>
      <ul class="bn-next-l">${next.map(x => `<li><span>${esc(x.cat.name)}</span><span class="mono">${dayDiff(TODAY, x.date) === 1 ? 'demà' : esc(ddmm(x.date))}</span></li>`).join('')}</ul></details>` : ''}`;
}
/** Qui s'ha endut més bandes aquesta Nit (si algú en té més d'una). */
function bandesRecord(p) {
  const n = new Map();
  for (const ks of Object.values(p.results || {})) for (const k of ks) for (const id of keyIds(k)) n.set(id, (n.get(id) || 0) + 1);
  const max = Math.max(0, ...n.values());
  return max < 2 ? null : { n: max, ids: [...n].filter(([, v]) => v === max).map(([id]) => id) };
}
function bandesPalmPage(p) {
  const res = p.results || {}, me = myId(), list = (p.cats || []).filter(c => res[c.id]?.length);
  if (!list.length) return '';
  const mine = me ? list.filter(c => res[c.id].some(k => keyIds(k).includes(me))) : [];
  const rec = bandesRecord(p);
  return `<div class="section-title"><h2 class="h2">Palmarès</h2><span class="bn-n mono">${list.length} ${list.length === 1 ? 'banda' : 'bandes'}</span></div>
    ${mine.length ? `<div class="bd-mine bn-mine"><p style="margin:0"><b>${mine.length === 1 ? 'T’has endut una banda' : `T’has endut ${mine.length} bandes`}:</b> ${esc(mine.map(c => c.name).join(', '))}. Enhorabona!</p>
      <button class="btn btn-sm" data-act="bandes-my-diploma" data-id="${esc(p.id)}">${mine.length === 1 ? 'El teu diploma' : 'Els teus diplomes'}</button></div>` : ''}
    ${rec ? `<p class="bn-rec"><span>Rècord de la Nit</span> ${esc(rec.ids.map(id => fullName(S.members.get(id)?.name || '')).filter(Boolean).join(' i '))}, amb ${rec.n} bandes</p>` : ''}
    <ol class="bn-palm">${list.map(c => {
      const fin = (p.nominees?.[c.id] || []).filter(k => !res[c.id].includes(k));
      return `<li><span class="bn-cat">${esc(c.name)}</span>${res[c.id].map(k => `<span class="bn-win-r">${bnWho(k).replace('class="bn-nm"', 'class="bn-nm bn-winner"')}</span>`).join('')}${fin.length ? `<small>Finalistes: ${esc(fin.map(keyName).join(', '))}</small>` : ''}</li>`;
    }).join('')}</ol>`;
}
function bandesCatsBlock(p, open, already) {
  const cats = p.cats || [];
  if (!cats.length) return '';
  return `<details class="np-group bn-cats"${open ? ' open' : ''}><summary><span>${already ? `Les ${cats.length} categories que ja hi ha` : `Les ${cats.length} categories`}</span>${ICON.chev}</summary>
    <ul class="bn-cat-l">${cats.map(c => `<li><div><b>${esc(c.name)}</b>${c.pair ? '<span class="tag">Parella</span>' : c.sec ? `<span class="tag">${esc(SEC[c.sec]?.name || c.sec)}</span>` : ''}</div>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</li>`).join('')}</ul></details>`;
}
function bandesTeamBlock(p) {
  if (!canBoard()) return '';
  const ph = bandesPhase(p), people = bandesPeople(p), voted = people.filter(m => S.pollVotes.get(`${p.id}_${m.id}`)).length;
  const b = (act, t, primary) => `<button class="btn btn-sm${primary ? ' btn-primary' : ''}" data-act="${act}" data-id="${esc(p.id)}">${t}</button>`;
  const status = ph === 'draft' ? 'És un esborrany: només el veu l’equip.'
    : ph === 'prop' ? `S’hi recullen propostes de categories${p.propUntil ? ` fins al ${ddmm(p.propUntil)}` : ''} (${propsFor(p).length}). La votació encara no és oberta.`
    : ph === 'vote' ? `Han votat ${voted} de ${people.length}.`
    : ph === 'closed' ? `La votació s’ha tancat (han votat ${voted} de ${people.length}). Ara toca publicar els finalistes.`
    : ph === 'done' ? `Palmarès publicat el ${ddmm(isoDate(new Date(p.resultsAt)))}.`
    : `Finalistes publicats: es revelen ${nomRange(p)}.`;
  const acts = [
    ph === 'draft' && !p.propAt && b('bandes-props-open', 'Obre les propostes'),
    ph === 'prop' && b('bandes-props-close', 'Tanca les propostes'),
    ['draft', 'prop'].includes(ph) && b('bandes-publish', 'Obre la votació', true),
    ph === 'closed' && b('bandes-nominate', 'Publica els finalistes', true),
    !['draft', 'prop'].includes(ph) && b('bandes-results', 'Resultats'),
    !['draft', 'prop'].includes(ph) && b('bandes-gala', 'Gala'),
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
    ${['draft', 'prop', 'done'].includes(ph) ? '' : bandesInfo(p)}
    ${['draft', 'prop'].includes(ph) && (p.propOpen || propsFor(p).length) ? bandesPropsBlock(p) : ''}
    ${ph === 'vote' ? bandesVoteBlock(p) : ''}
    ${ph === 'done' ? bandesPalmPage(p) : ''}
    ${['nom', 'gala', 'after'].includes(ph) || (ph === 'done' && !p.results) ? bandesNomBlock(p) : ''}
    ${ph === 'closed' ? `<section class="bn-card"><p style="margin:0">La votació s’ha tancat. Aviat es revelaran els finalistes de cada categoria${p.galaAt ? `, un dia rere l’altre fins a la Nit` : ''}.</p></section>` : ''}
    ${['closed', 'nom', 'gala', 'after'].includes(ph) ? bandesVoteBlock(p) : ''}
    ${bandesCatsBlock(p, ['draft', 'vote'].includes(ph), ph === 'prop')}
    ${bandesTeamBlock(p)}
    ${older.length ? `<div class="section-title"><h2 class="h2">Edicions anteriors</h2></div>${older.map(q => `<details class="np-group"><summary><span>${esc(q.title)}</span>${ICON.chev}</summary><ul class="bd-palm-l">${(q.cats || []).filter(c => q.results[c.id]?.length).map(c => `<li><span class="bd-cat">${esc(c.name)}</span><span class="bd-win">${q.results[c.id].map(k => esc(keyName(k))).join('<br>')}</span></li>`).join('')}</ul></details>`).join('')}` : ''}
  </div>`;
}
/** A Inici: la Nit que s'acosta, i què toca ara (votar, els finalistes d'avui, el palmarès). */
function bandesHomeCard() {
  const p = currentBandes();
  if (!p || (p.draft && !p.propOpen) || !bandesSeason(p)) return '';
  const ph = bandesPhase(p), days = p.galaAt ? dayDiff(TODAY, p.galaAt) : null, mine = myId() && S.pollVotes.get(`${p.id}_${myId()}`);
  const today = ph === 'nom' && p.nominees ? nomReveal(p).shown.filter(x => x.date === TODAY) : [];
  const big = p.results ? 'Ja hi ha el palmarès' : days == null || days < 0 ? galaName(p) : days === 0 ? 'És avui!' : days === 1 ? 'És demà!' : `Falten ${days} dies`;
  const tn = ph === 'vote' ? turnoutSum(p, turnoutFor(p)) : null, voted = tn && tn.n ? ` · ja han votat ${tn.n} de ${tn.total}` : '';
  const line = ph === 'prop' ? (propOpenNow(p) ? `Proposa categories fins al ${ddmm(p.propUntil)}` : 'Aviat, la votació')
    : ph === 'vote' ? (bandesVoter(p) ? (mine ? `Ja has votat${voted}` : `Vota fins al ${ddmm(p.closesAt)}${voted}`) : `Votació oberta fins al ${ddmm(p.closesAt)}${voted}`)
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

/* ---------- Quanta gent ha votat, per a tothom ---------- */
// turnout/<votació> = { S: 12, C: 9… }: cada persona hi suma 1 a la seva corda el primer cop que vota, en el mateix lot que el vot
// i amb turnout/<votació>/by/<persona> (que només llegeix ella), perquè no compti dos cops (vegeu les regles). No diu qui ha
// votat: només quants de cada corda. L'equip, que llegeix els vots, en té el recompte exacte.
const BN_TURN = { pid: null, data: null, off: null };
function turnoutFor(p) {
  if (!p || p.draft || PREVIEW || typeof db === 'undefined' || !db) return null;
  if (BN_TURN.pid !== p.id) {
    BN_TURN.off?.();
    Object.assign(BN_TURN, { pid: p.id, data: null });
    BN_TURN.off = db.doc(`turnout/${p.id}`).onSnapshot(d => { BN_TURN.data = d.exists ? d.data() : {}; fixTurnout(p); scheduleRender(); }, () => { BN_TURN.data = null; });
  }
  return BN_TURN.data;
}
/** Qui porta el tauler (que té tots els vots) hi posa el recompte de veritat si no hi coincideix: els vots fets abans que hi
 *  hagués recompte, o els de qui ja no hi participa. Com a molt un cop per minut. */
function fixTurnout(p) {
  if (!canBoard() || !readsBoard() || !BN_TURN.data || Date.now() - (BN_TURN.fixAt || 0) < 60e3) return;
  const secOf = new Map(bandesPeople(p).map(m => [m.id, m.section])), real = {};
  for (const v of bandesVotes(p)) { const sec = secOf.get(v.memberId); if (sec) real[sec] = (real[sec] || 0) + 1; }
  const keys = new Set([...Object.keys(real), ...Object.keys(BN_TURN.data)]);
  if ([...keys].every(k => (+BN_TURN.data[k] || 0) === (real[k] || 0))) return;
  BN_TURN.fixAt = Date.now();
  db.doc(`turnout/${p.id}`).set(real).catch(() => {});
}
/** Quants han votat de quants hi participen, en total i per cordes (mai més dels que hi ha a la corda). */
function turnoutSum(p, d) {
  if (!d) return null;
  const people = bandesPeople(p);
  const per = SECTIONS.map(x => { const total = people.filter(m => m.section === x.id).length; return { sec: x.id, n: Math.min(+d[x.id] || 0, total), total }; }).filter(x => x.total);
  return { n: per.reduce((a, x) => a + x.n, 0), total: people.length, per };
}
function turnoutHtml(p) {
  const s = turnoutSum(p, turnoutFor(p));
  if (!s) return '';
  return `<div class="bn-turn"><p><b class="mono">${s.n}</b> de ${s.total} ja han votat</p><span class="bd-bar"><span style="width:${s.total ? s.n / s.total * 100 : 0}%"></span></span>
    <p class="bn-turn-s">${s.per.map(x => `<span><b>${esc(SEC[x.sec]?.short || x.sec)}</b> <span class="mono">${x.n}/${x.total}</span></span>`).join('')}</p></div>`;
}
/** El primer vot, amb la suma al recompte (en un sol lot). Si el recompte no s'hi val (ja s'havia comptat), el vot es desa igual. */
function sendFirstVote(key, rec) {
  if (PREVIEW) { persist('pollVotes', key, rec, 10); return; }
  const b = fs.batch(), path = `pollVotes/${key}`;
  b.set(db.doc(path), stamped(path, rec));
  b.set(db.doc(`turnout/${rec.pollId}/by/${rec.memberId}`), { at: rec.at });
  b.set(db.doc(`turnout/${rec.pollId}`), { [rec.section]: firebase.firestore.FieldValue.increment(1) }, { merge: true });
  b.commit().catch(() => persist('pollVotes', key, rec, 10));
}

/* ---------- Les propostes de categories, abans de votar ---------- */
// catProps/<id> = { id, pollId, name, desc, pair, by, at, likes: [persones], taken }. Mentre la votació és un esborrany amb les
// propostes obertes (propOpen, fins a propUntil), tothom de la plantilla en pot fer (cinc com a molt) i hi pot dir «m'agrada»;
// l'app no diu de qui és cada una. L'equip tria quines entren a les categories.
const BN_PROPS = { pid: null, map: new Map(), off: null };
const PROPS_MAX = 5;
const propOpenNow = p => !!p && p.draft && !!p.propOpen && (!p.propUntil || p.propUntil >= TODAY);
function propsFor(p) {
  if (!p || PREVIEW || typeof db === 'undefined' || !db) return [];
  if (BN_PROPS.pid !== p.id) {
    BN_PROPS.off?.();
    Object.assign(BN_PROPS, { pid: p.id, map: new Map() });
    BN_PROPS.off = db.collection('catProps').where('pollId', '==', p.id).onSnapshot(s => { BN_PROPS.map = new Map(s.docs.map(d => [d.id, d.data()])); scheduleRender(); }, () => {});
  }
  return [...BN_PROPS.map.values()];
}
function bandesPropsBlock(p) {
  const me = myId(), open = propOpenNow(p), list = propsFor(p).sort((a, b) => (b.likes || []).length - (a.likes || []).length || (a.at || '').localeCompare(b.at || ''));
  const mine = list.filter(x => x.by === me).length;
  const form = open && me ? (mine >= PROPS_MAX ? `<p class="m" style="margin:0">Ja n’has proposat ${PROPS_MAX}: és el màxim.</p>` : `<div class="bn-prop-f">
      <label class="field"><span>Nom de la categoria</span><input class="inp" id="pr-name" maxlength="60" placeholder="p. ex. Rei o reina del karaoke"></label>
      <label class="field"><span>Qui s’ho mereix</span><textarea class="inp" id="pr-desc" maxlength="300" style="min-height:64px" placeholder="Aquelles persones que…"></textarea></label>
      <div class="toggle-row"><span><b>És de parella</b></span><label class="switch"><input type="checkbox" id="pr-pair"><span></span></label></div>
      <button class="btn btn-primary" data-act="bandes-propose" data-id="${esc(p.id)}" style="justify-self:start">Proposa-la</button></div>`) : '';
  const card = x => {
    const liked = (x.likes || []).includes(me), n = (x.likes || []).length;
    return `<li class="bn-prop"><div><b>${esc(x.name)}</b>${x.pair ? ' <span class="tag">Parella</span>' : ''}${x.taken ? ' <span class="st-pill st-accepted">Hi entra</span>' : ''}${x.by === me ? ' <span class="st-pill st-pending">La teva</span>' : ''}</div>
      ${x.desc ? `<p>${esc(x.desc)}</p>` : ''}
      <div class="bd-acts">${open && me ? `<button class="btn btn-sm bn-like" data-act="bandes-like" data-id="${esc(x.id)}" aria-pressed="${liked}">${liked ? 'T’agrada' : 'M’agrada'} · <span class="mono">${n}</span></button>` : `<span class="m mono">${n} ${n === 1 ? 'm’agrada' : 'm’agraden'}</span>`}
        ${x.by === me && open && !x.taken ? `<button class="btn btn-sm btn-ghost" data-act="bandes-prop-del" data-id="${esc(x.id)}">Treu-la</button>` : ''}
        ${canBoard() && !x.taken ? `<button class="btn btn-sm" data-act="bandes-prop-take" data-id="${esc(x.id)}">Afegeix-la</button><button class="btn btn-sm btn-ghost" data-act="bandes-prop-drop" data-id="${esc(x.id)}">Descarta-la</button>` : ''}</div></li>`;
  };
  return `<section class="bn-card bn-props"><h2 class="h2">Proposa una categoria</h2>
    <p class="m" style="margin:0">${open ? `Fins al ${ddmm(p.propUntil)}. Pots proposar-ne fins a ${PROPS_MAX} i dir quines t’agraden de les dels altres; l’equip triarà quines entren a la votació. Ningú no veu de qui és cada proposta.` : 'Les propostes ja s’han tancat: l’equip està triant quines entren a la votació.'}</p>
    ${form}</section>
    ${list.length ? `<div class="section-title"><h2 class="h2">Les propostes</h2><span class="bn-n mono">${list.length}</span></div><ul class="bn-prop-l">${list.map(card).join('')}</ul>` : ''}`;
}
function bandesPropose(pid) {
  const p = S.polls.get(pid), me = myId();
  if (!p || !propOpenNow(p) || !me) { toast('Les propostes ja s’han tancat'); return; }
  const name = ($('#pr-name')?.value || '').trim().slice(0, 60), desc = ($('#pr-desc')?.value || '').trim().slice(0, 300);
  if (!name) { toast('Posa el nom de la categoria'); return; }
  if (propsFor(p).filter(x => x.by === me).length >= PROPS_MAX) { toast(`Ja n’has proposat ${PROPS_MAX}`); return; }
  if ([...propsFor(p), ...(p.cats || [])].some(x => normText(x.name) === normText(name))) { toast('Aquesta categoria ja hi és'); return; }
  const rec = { id: uid('cp'), pollId: pid, name, desc, pair: !!$('#pr-pair')?.checked, by: me, at: new Date().toISOString(), likes: [] };
  BN_PROPS.map.set(rec.id, rec);
  db.doc(`catProps/${rec.id}`).set(rec).catch(() => { BN_PROPS.map.delete(rec.id); toast('No s’ha pogut enviar. Torna-ho a provar.'); render(); });
  toast('Proposta enviada'); render();
}
function bandesLike(id) {
  const x = BN_PROPS.map.get(id), me = myId();
  if (!x || !me) return;
  const on = (x.likes || []).includes(me), FV = firebase.firestore.FieldValue;
  x.likes = on ? x.likes.filter(m => m !== me) : [...(x.likes || []), me];
  db.doc(`catProps/${id}`).update({ likes: on ? FV.arrayRemove(me) : FV.arrayUnion(me) }).catch(() => toast('No s’ha pogut desar. Torna-ho a provar.'));
  render();
}
function bandesPropDel(id) {
  const x = BN_PROPS.map.get(id);
  if (!x) return;
  BN_PROPS.map.delete(id);
  db.doc(`catProps/${id}`).delete().catch(() => {});
  render();
  undoable('Proposta treta', () => { BN_PROPS.map.set(id, x); db.doc(`catProps/${id}`).set(x).catch(() => {}); });
}
/** L'equip: la proposta passa a ser una categoria més (al final de la llista). */
function bandesPropTake(id) {
  const x = BN_PROPS.map.get(id), p = x && S.polls.get(x.pollId);
  if (!p) return;
  const sec = x.pair ? '' : bandesSection(x.name, true);
  const rec = { ...clone(p), cats: [...(p.cats || []), { id: uid('c'), name: x.name, desc: x.desc || '', pair: !!x.pair, sec, win: x.pair || sec ? 1 : (+p.win || 2) }] };
  S.polls.set(p.id, rec); persist('polls', p.id, rec, 10);
  x.taken = true;
  db.doc(`catProps/${id}`).update({ taken: true }).catch(() => {});
  toast(`«${x.name}» és a les categories`); render();
}
function bandesPropsOpen(pid) {
  const p = S.polls.get(pid);
  if (!p || !p.draft) return;
  const until0 = p.propUntil || addDays(TODAY, 7);
  openSheet({
    title: 'Obrir les propostes?',
    body: `<p style="margin-top:0">Abans de votar, tothom podrà proposar categories noves (fins a ${PROPS_MAX} cadascú) i dir quines li agraden. Tu tries quines hi entren; la votació s’obre després, quan la publiquis.</p>
      <label class="field"><span>Es pot proposar fins al (inclòs)</span><input class="inp" type="date" id="pp-until" value="${esc(until0)}"></label>
      <div class="toggle-row"><span><b>Publica un anunci al tauler</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Amb el botó per proposar-ne. A qui té les notificacions activades li arriba un avís.</span></span><label class="switch"><input type="checkbox" id="pp-ann" checked><span></span></label></div>`,
    foot: '<span class="spacer"></span><button class="btn" data-act="sheet-close">Encara no</button><button class="btn btn-primary" id="pp-ok">Obre-les</button>',
    onMount: el => {
      el.querySelector('#pp-ok').onclick = () => {
        const until = el.querySelector('#pp-until').value || until0;
        if (until < TODAY) { toast('Posa un dia d’avui endavant'); return; }
        if (p.closesAt && until >= p.closesAt) { toast('Les propostes s’han de tancar abans que la votació'); return; }
        const now = new Date().toISOString(), rec = { ...clone(S.polls.get(pid)), propOpen: true, propUntil: until, propAt: now };
        if (el.querySelector('#pp-ann').checked) {
          const a = { id: uid('n'), title: `Proposa categories per a les ${rec.title}`, pinned: true, sections: rec.sections || [], until, pollId: rec.id, author: authorName(), by: S.email || '', createdAt: now, updatedAt: now,
            body: `${rec.description ? `${rec.description}\n\n` : ''}Abans de votar, **fins al ${longDate(until).toLowerCase()}**, podeu proposar categories noves (fins a ${PROPS_MAX} cadascú) i dir quines us agraden de les dels altres. L’equip triarà quines entren a la votació. Ningú no veu de qui és cada proposta.` };
          rec.propAnnId = a.id;
          S.announcements.set(a.id, a); persist('announcements', a.id, a, 10);
        }
        S.polls.set(pid, rec); persist('polls', pid, rec, 10);
        closeSheet(); toast('Propostes obertes'); render();
      };
    },
  });
}
function bandesPropsClose(pid) {
  const p = S.polls.get(pid);
  if (!p) return;
  const rec = { ...clone(p), propOpen: false };
  S.polls.set(pid, rec); persist('polls', pid, rec, 10);
  toast('Propostes tancades'); render();
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
