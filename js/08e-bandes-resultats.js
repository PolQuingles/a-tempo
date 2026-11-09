// A Tempo · 08e-bandes-resultats.js — Els resultats de les bandes, per a l'equip (el recompte, els anells, el desempat, qui
// ha votat i el palmarès), i la gala per anunciar-les una a una en una pantalla gran.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

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
  if (p.ballotsGone) {
    openSheet({
      title: `Resultats · ${p.title}`,
      body: `<p style="margin-top:0">Les paperetes (qui va votar qui) es van esborrar el ${esc(shortDate(p.ballotsGone))}, un mes després de la Nit, perquè el vot és secret.</p>
        <p class="m" style="margin-bottom:0">En queden el palmarès, quanta gent va votar i com es van repartir els vots de cada categoria, sense noms (a ${esc(galaName(p))}).</p>`,
      foot: '<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">D’acord</button>',
    });
    return;
  }
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
  const status = p.results ? `<p class="bd-ok">Palmarès publicat el ${shortDate(isoDate(new Date(p.resultsAt)))}: tothom el veu a ${esc(galaName(p))}.</p>`
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
// La gala és la pantalla que es projecta a la Nit: el títol, i per a cada banda, la categoria, els finalistes i, després d'un
// moment de suspens, qui se l'emporta (amb confeti daurat). Al final, el palmarès sencer. Es passa amb el botó, les fletxes o
// l'espai, com unes diapositives; tocant la pantalla durant el suspens, el nom surt de seguida.
const GALA_SUSPENSE = 1800;
function galaConfetti(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelector('.gala-fx')?.remove();
  const cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.className = 'gala-fx'; cv.setAttribute('aria-hidden', 'true');
  root.appendChild(cv);
  const W = cv.width = root.clientWidth * dpr, H = cv.height = root.clientHeight * dpr, g = cv.getContext('2d');
  if (!g) return;
  const cols = ['#F2D58A', '#E7C77B', '#FFF1C9', '#C9A7E6', '#F6EEFB'];
  const bits = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .42, vx: (Math.random() - .5) * 18 * dpr, vy: (-6 - Math.random() * 14) * dpr,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 10) * dpr, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const tick = t => {
    if (!cv.isConnected) return;
    const k = (t - t0) / 2600;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, 1 - k * k);
    for (const b of bits) {
      b.vy += .32 * dpr; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
    }
    if (k < 1) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
function bandesGala(pid) {
  const p = S.polls.get(pid);
  if (!p) return;
  const t = bandesTally(p, bandesVotes(p), bandesPeople(p));
  const cards = t.cats.filter(x => x.rows.length), ties = cards.filter(x => x.open);
  let i = -1, stage = 0, timer = 0;
  const root = document.createElement('div');
  root.className = 'gala';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', `Gala · ${p.title}`);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const fsOn = !!root.requestFullscreen;
  try { root.requestFullscreen?.().catch(() => {}); } catch {}
  const winners = x => x.open ? [...x.winners, ...x.tied] : x.winners;
  const finals = x => [...(p.nominees?.[x.cat.id] || bandesFinalists(x.rows, +p.finalists || BANDES_FINAL))].sort(byKeyName);
  const when = [p.galaAt ? capz(longDate(p.galaAt)) : '', p.galaTime ? `${p.galaTime} h` : '', p.galaPlace || ''].filter(Boolean).join(' · ');
  // El suspens: «I la banda és per a…», uns punts que bateguen i, al cap d'una estona, el nom (o, si es toca la pantalla, ara).
  const reveal = () => {
    clearTimeout(timer);
    const w = root.querySelector('.gala-w');
    if (!w || w.classList.contains('now')) return;
    w.classList.add('now');
    galaConfetti(root);
  };
  const paint = () => {
    clearTimeout(timer);
    root.querySelector('.gala-fx')?.remove();
    let inner;
    if (i < 0) inner = `<p class="gala-k">${esc(S.config.shortName || S.config.name || '')} presenta</p><h1 class="gala-t">${galaTitle(p)}</h1>${when ? `<p class="gala-s">${esc(when)}</p>` : ''}
      <p class="gala-s2">${cards.length} ${cards.length === 1 ? 'banda' : 'bandes'} per repartir · hi han votat ${t.voters} persones</p>
      ${ties.length ? `<p class="gala-warn">Abans de començar: ${ties.length === 1 ? 'hi ha un empat' : `hi ha ${ties.length} empats`} sense desfer (${esc(ties.map(x => x.cat.name).join(', '))}). Es desfan a Resultats.</p>` : ''}`;
    else if (i >= cards.length) inner = `<p class="gala-k">${esc(galaName(p))}</p><h1 class="gala-t">Enhorabona a tothom!</h1>
      <ol class="gala-palm">${cards.map(x => `<li><span>${esc(x.cat.name)}</span><b>${winners(x).map(k => esc(keyName(k))).join(' · ')}</b></li>`).join('')}</ol>`;
    else {
      const x = cards[i];
      inner = `<p class="gala-k">Banda ${i + 1} de ${cards.length}${x.cat.pair ? ' · de parella' : x.cat.sec ? ` · ${esc((SEC[x.cat.sec]?.name || '').toLowerCase())}` : ''}</p><h1 class="gala-t${stage ? ' small' : ''}">${esc(x.cat.name)}</h1>
        ${stage === 0 && x.cat.desc ? `<p class="gala-d">${esc(x.cat.desc)}</p>` : ''}
        ${stage === 1 ? `<div class="gala-fin"><p class="gala-k">Els finalistes són</p><ul>${finals(x).map((k, j) => `<li style="--d:${j * 160}ms">${esc(keyName(k))}</li>`).join('')}</ul></div>` : ''}
        ${stage === 2 ? `<div class="gala-w" style="--wait:${GALA_SUSPENSE}ms"><p class="gala-k">${x.open ? 'Empat! La banda és per a' : 'I la banda és per a…'}</p><div class="gala-roll" aria-hidden="true"><i></i><i></i><i></i></div>${winners(x).map((k, j) => `<p class="gala-n" style="--d:${j * 200}ms">${esc(keyName(k))}</p>`).join('')}</div>` : ''}`;
    }
    const label = i < 0 ? 'Comença' : i >= cards.length ? 'Tanca' : stage === 0 ? 'Els finalistes' : stage === 1 ? 'Obre el sobre' : i === cards.length - 1 ? 'Al final' : 'La següent';
    const dots = i >= 0 && i < cards.length ? `<div class="gala-dots" aria-hidden="true">${cards.map((_, j) => `<span class="${j < i ? 'done' : j === i ? 'cur' : ''}"></span>`).join('')}</div>` : '';
    root.innerHTML = `<button class="gala-x" data-g="close" aria-label="Tanca la gala">${ICON.close}</button>
      <div class="gala-c" aria-live="polite">${inner}</div>
      <div class="gala-f">${dots}<div class="gala-fb"><button class="gala-b" data-g="back" ${i < 0 ? 'disabled' : ''}>Enrere</button><button class="gala-b main" data-g="next">${label}</button></div></div>`;
    root.querySelector('[data-g="next"]').focus({ preventScroll: true });
    if (stage === 2 && i >= 0 && i < cards.length) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) root.querySelector('.gala-w')?.classList.add('now');
      else timer = setTimeout(reveal, GALA_SUSPENSE);
    }
  };
  const close = () => {
    clearTimeout(timer);
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
    if (stage === 2) reveal();   // tornant enrere, el nom ja se sap
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (['ArrowRight', ' ', 'Enter', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); back(); }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', e => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (g === 'next') next(); else if (g === 'back') back(); else if (g === 'close') close();
    else if (e.target.closest('.gala-c')) reveal();
  });
  paint();
}
