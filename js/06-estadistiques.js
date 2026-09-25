// A Tempo · 06-estadistiques.js — Assistència › Estadístiques i Risc, la llista de concert i la meva assistència.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Stats ---------- */
function viewStats(inBoard) {
  const prods = productionsSorted();
  // Dins d'Assistència, el títol de cada vista és un subtítol de la pestanya.
  const title = t => inBoard ? `<h2 class="h1 stats-t">${t}</h2>` : `<h1 class="h1">${t}</h1>`;
  if (inBoard && ui.statsScope === 'risk') ui.statsScope = 'prod';
  if (!prods.length) return `${inBoard ? '' : `<div class="page-head">${title('Estadístiques')}</div>`}<div class="empty">${staffSvg()}<p>Quan hi hagi produccions amb llistes passades, veuràs aquí l’assistència.</p></div>`;
  // Dins d'Assistència l'abast és un selector petit, perquè no s'apilin dues files de pestanyes.
  const scopeTabs = inBoard
    ? `<div class="scope-row"><span class="seg3 scope-seg" role="radiogroup" aria-label="Període">${[['prod', 'Producció'], ['term', 'Trimestre'], ['season', 'Temporada']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}">${l}</button>`).join('')}</span></div>`
    : `<div class="subtabs" role="tablist" style="margin-bottom:10px;grid-template-columns:repeat(4,1fr)">${[['prod', 'Producció'], ['term', 'Trimestre'], ['season', 'Temporada'], ['risk', 'Risc']].map(([k, l]) => `<button class="subtab" role="tab" aria-selected="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}" style="font-size:12.5px">${l}</button>`).join('')}</div>`;
  if (ui.statsScope === 'risk') return `<div class="page-head${inBoard ? ' in-board' : ''}"><div><div class="eyebrow">Estadístiques</div>${title(`Norma del ${minAttendance()}%`)}</div></div>` + scopeTabs + riskView();
  const scope = currentScope();
  const { terms } = seasonCfg();
  const st = computeStats(scope, ui.statsSec);
  const choice = ui.statsScope === 'prod'
    ? `<div class="chips" role="group" aria-label="Producció">${prods.map(p => `<button class="chip" aria-pressed="${p.id === scope.id}" data-act="stats-prod" data-id="${p.id}"><i class="pdot prod-tone" style="--ph:${prodHue(p)}"></i>${esc(p.name)}</button>`).join('')}</div>`
    : ui.statsScope === 'term'
      ? `<div class="chips" role="group" aria-label="Trimestre">${terms.map((t, i) => `<button class="chip" aria-pressed="${i === ui.statsTerm}" data-act="stats-term" data-i="${i}">${esc(t.name)}</button>`).join('')}</div>`
      : '';
  const secChips = `<div class="chips" role="group" aria-label="${V.Section}" style="padding-bottom:4px">
    <button class="chip" aria-pressed="${!ui.statsSec}" data-act="stats-sec" data-sec="">${capz(V.tot)}</button>
    ${SECTIONS.map(x => `<button class="chip" aria-pressed="${ui.statsSec === x.id}" data-act="stats-sec" data-sec="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const sub = scope.kind === 'range' ? `<p class="muted mono" style="margin:4px 0 0;font-size:calc(13px*var(--ts))">${ddmm(scope.from)}/${scope.from.slice(0, 4)} – ${ddmm(scope.to)}/${scope.to.slice(0, 4)}</p>` : '';
  const tone = scope.kind === 'prod' ? ` prod-tone tinted" style="--ph:${prodHue(S.productions.get(scope.id))}` : '';
  const head = `<div class="page-head${inBoard ? ' in-board' : ''}${tone}"><div><div class="eyebrow">${scope.kind === 'prod' ? '<i class="pdot"></i>Producció' : 'Estadístiques'}</div>${title(esc(scope.name))}${sub}</div>
    <button class="btn btn-sm" data-act="export-csv">Exporta CSV</button></div>`;
  // Dins d'Assistència: una sola fila de filtres (període, producció o trimestre, i secció) sobre el títol.
  const selProd = `<label class="sel"><span class="sr">Producció</span><select data-pick="stats-prod">${prods.map(p => `<option value="${p.id}" ${p.id === scope.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
  const selTerm = `<label class="sel"><span class="sr">Trimestre</span><select data-pick="stats-term">${terms.map((t, i) => `<option value="${i}" ${i === ui.statsTerm ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`;
  const selSec = `<label class="sel"><span class="sr">${esc(V.Section)}</span><select data-pick="stats-sec"><option value="">${esc(capz(V.tot))}</option>${SECTIONS.map(x => `<option value="${x.id}" ${ui.statsSec === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
  const filters = `<div class="filters"><span class="seg3" role="radiogroup" aria-label="Període">${[['prod', 'Producció'], ['term', 'Trimestre'], ['season', 'Temporada']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}">${l}</button>`).join('')}</span>
    ${ui.statsScope === 'prod' ? selProd : ui.statsScope === 'term' ? selTerm : ''}${selSec}</div>`;
  const top = inBoard ? filters + head : head + scopeTabs + choice + secChips;

  if (!st.counted.length) {
    const first = st.all[0];
    return top + `<div class="empty"><p>Encara no s’ha passat llista en cap sessió d’aquest període${st.all.length ? ` (${st.all.length} sessions programades, la primera el ${shortDate(first.date)})` : ''}.</p></div>`;
  }
  const t = st.tot;
  const kpis = `<div class="kpis">
    <div class="kpi"><div class="kpi-v">${kpiPct(rate(t))}</div><div class="kpi-l">Assistència</div></div>
    <div class="kpi"><div class="kpi-v">${kpiPct(punctuality(t))}</div><div class="kpi-l">Puntualitat</div></div>
    <div class="kpi"><div class="kpi-v">${t.min}<small>min</small></div><div class="kpi-l">Retard acumulat · ${t.R} retards</div></div>
    <div class="kpi ${t.FNJ ? 'alert' : ''}"><div class="kpi-v">${t.FNJ}</div><div class="kpi-l">Faltes no justificades · ${t.FJ} just.</div></div>
  </div>
  <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 2px 0">${st.counted.length} de ${st.all.length} sessions amb llista · Assistència = presents i retards sobre convocats (sense comptar «no fa» ni baixes).</p>`;

  const dist = `<div class="panel" style="padding:14px;margin-top:14px">${stackBar(t)}<div class="legend">${ORDER.map(k => `<span><i class="i-${k}"></i>${STATUS[k].label} <b>${t[k]}</b></span>`).join('')}</div></div>`;

  // Norma del concert (only per production)
  let rule = '';
  const ruleMap = new Map();
  if (scope.kind === 'prod') {
    for (const r of st.rows) { const rs = ruleStatus(scope.id, r.m); if (rs) ruleMap.set(r.m.id, rs); }
    const outL = st.rows.filter(r => ruleMap.get(r.m.id)?.status === 'out');
    const riskL = st.rows.filter(r => ruleMap.get(r.m.id)?.status === 'risk');
    const hasConcert = st.all.some(isShow);
    const item = (r, rs) => `<li><span><b>${esc(r.m.name)}</b> <span class="muted">· ${esc(SEC[r.m.section].name)} · ${pct(rs.cur)}${rs.status === 'risk' ? ` (pot arribar al ${pct(rs.best)})` : ''}</span></span><button class="rule ${rs.status}" data-act="member-stats" data-mid="${r.m.id}">${rs.status === 'out' ? `No pot fer ${V.sh.el}` : 'En risc'}</button></li>`;
    rule = `<div class="section-title"><h2 class="h2">Norma del ${minAttendance()}%</h2>${hasConcert ? `<button class="btn btn-sm" data-act="concert-list" data-pid="${scope.id}">${V.sh.list}</button>` : '<span class="eyebrow">assistència mínima</span>'}</div>
      <div class="panel">
        ${outL.length || riskL.length ? `<ul class="alerts">${outL.map(r => item(r, ruleMap.get(r.m.id))).join('')}${riskL.map(r => item(r, ruleMap.get(r.m.id))).join('')}</ul>`
          : `<p style="margin:0;padding:14px;font-size:calc(13.5px*var(--ts))">Ara mateix tothom compleix la norma.</p>`}
        <p class="muted" style="margin:0;padding:10px 14px 12px;font-size:calc(13px*var(--ts));border-top:1px solid var(--line)">Compten tots els assajos de la producció (no ${V.sh.els} ni les sessions «Altres»). «En risc» vol dir que ara està per sota però encara hi pot arribar amb els assajos que queden.</p>
      </div>`;
  }

  const secBars = !ui.statsSec ? `<div class="section-title"><h2 class="h2">Per ${V.sections}</h2><span class="eyebrow">assistència</span></div>
    <div class="panel bars">${SECTIONS.map(x => {
      const c = st.bySec[x.id]; const r = rate(c);
      return `<div class="bar-row"><span class="lbl" title="${esc(x.name)}"><em>${esc(x.short)}</em><span>${esc(x.name)}</span></span>${stackBar(c)}<span class="val">${pct(r)}</span></div>`;
    }).join('')}</div>` : '';

  const cols = st.counted.map(({ s, c }) => {
    const d = c.P + c.R + c.FJ + c.FNJ;
    const seg = k => d ? `<span class="s-${k}" style="height:${(c[k] / d) * 100}%;background:var(--${k.toLowerCase()})"></span>` : '';
    return `<button class="tcol" data-act="open-session" data-sid="${s.id}" title="${shortDate(s.date)} · ${s.type || 'Assaig'} · ${pct(rate(c))}" aria-label="${longDate(s.date)}: ${pct(rate(c))}">
      <span class="tbar" style="height:100%">${['P', 'R', 'FJ', 'FNJ'].map(seg).join('')}</span></button>`;
  }).join('');
  const every = Math.max(1, Math.ceil(st.counted.length / 8));
  const labels = st.counted.map(({ s }, i) => `<span>${i % every === 0 ? ddmm(s.date) : ''}</span>`).join('');
  const minW = st.counted.length * 22 + 34;
  const trend = `<div class="section-title"><h2 class="h2">Sessió a sessió</h2><span class="eyebrow">toca per obrir</span></div>
    <div class="panel"><div class="trend-wrap"><div style="min-width:${minW}px">
      <div class="trend">${[100, 75, 50, 25].map(v => `<div class="grid" style="bottom:${v}%"><span>${v}%</span></div>`).join('')}${cols}</div>
      <div class="tlabels">${labels}</div></div></div>
      <div class="trend-note legend" style="margin:0;padding:0 14px 12px">${['P', 'R', 'FJ', 'FNJ'].map(k => `<span><i class="i-${k}"></i>${STATUS[k].short}</span>`).join('')}</div></div>`;

  const fnjAlert = st.rows.filter(r => r.FNJ >= (+S.config.alertFNJ || 3)).sort((a, b) => b.FNJ - a.FNJ);
  const alerts = fnjAlert.length ? `<div class="section-title"><h2 class="h2">Cal fer seguiment</h2><span class="eyebrow">≥ ${S.config.alertFNJ || 3} faltes no just.</span></div>
    <div class="panel"><ul class="alerts">${fnjAlert.map(r => `<li><span><b>${esc(r.m.name)}</b> <span class="muted">· ${esc(SEC[r.m.section].name)}</span></span><button class="pill fnj" data-act="member-stats" data-mid="${r.m.id}">${r.FNJ} FNJ</button></li>`).join('')}</ul></div>` : '';

  const sorters = { pct: 'Assistència', name: 'Nom', late: 'Retards' };
  const rows = [...st.rows].sort((a, b) => {
    if (ui.statsSort === 'name') return byName(a.m, b.m);
    if (ui.statsSort === 'late') return b.min - a.min || b.R - a.R;
    const ra = rate(a), rb = rate(b);
    return (ra ?? 2) - (rb ?? 2) || byName(a.m, b.m);
  });
  const table = `<div class="section-title"><h2 class="h2">${V.Members}</h2>
      <span class="seg3" role="radiogroup" aria-label="Ordena per">${Object.entries(sorters).map(([k, l]) => `<button type="button" role="radio" aria-checked="${ui.statsSort === k}" data-act="stats-sort" data-k="${k}">${l}</button>`).join('')}</span></div>
    <div id="stlist">${findBox('#stlist', `Cerca un ${V.member}`)}<div class="panel only-narrow"><ul class="mtable">${rows.map(r => {
      const counted = r.P + r.R + r.FJ + r.FNJ;
      const rs = ruleMap.get(r.m.id);
      return `<li class="mrow" data-find="${esc(normText(r.m.name))}"><button data-act="member-stats" data-mid="${r.m.id}">
        <span class="mname"><em>${esc(secShort(r.m.section))}</em><span>${esc(r.m.name)}</span>${rs && rs.status !== 'ok' ? `<span class="rule ${rs.status}">${rs.status === 'out' ? `&lt;${minAttendance()}%` : 'En risc'}</span>` : ''}</span>
        <span class="mpct">${counted ? pct(rate(r)) : (r.NP ? 'No fa' : '—')}</span>
        ${stackBar(r)}
        <span class="mcounts">
          <span><i class="i-P"></i><b>${r.P}</b></span>
          <span><i class="i-R"></i><b>${r.R}</b>${r.min ? ` · ${r.min}′` : ''}</span>
          <span><i class="i-FNJ"></i><b>${r.FNJ}</b></span>
          <span><i class="i-FJ"></i><b>${r.FJ}</b></span>
          ${r.NP ? `<span><i class="i-NP"></i><b>${r.NP}</b></span>` : ''}
        </span></button></li>`;
    }).join('')}</ul></div>
    <div class="only-wide table-wrap"><table class="dtable"><thead><tr><th>${esc(V.Section)}</th><th>Nom</th><th class="n">Assistència</th><th class="n">Presents</th><th class="n">Retards</th><th class="n">Minuts</th><th class="n">Justif.</th><th class="n">No just.</th><th class="n">No fa</th><th>Norma</th></tr></thead><tbody>
      ${rows.map(r => {
        const counted = r.P + r.R + r.FJ + r.FNJ;
        const rs = ruleMap.get(r.m.id);
        return `<tr data-act="member-stats" data-mid="${r.m.id}" data-find="${esc(normText(r.m.name))}">
          <td class="m">${esc(SEC[r.m.section].name)}</td><td><b>${esc(r.m.name)}</b></td>
          <td class="n"><b>${counted ? pct(rate(r)) : (r.NP ? 'No fa' : '—')}</b></td><td class="n">${r.P}</td><td class="n">${r.R}</td><td class="n">${r.min ? `${r.min}′` : ''}</td>
          <td class="n">${r.FJ}</td><td class="n" ${r.FNJ ? 'style="color:var(--fnj-text);font-weight:700"' : ''}>${r.FNJ}</td><td class="n">${r.NP || ''}</td>
          <td>${rs && rs.status !== 'ok' ? `<span class="rule ${rs.status}">${rs.status === 'out' ? `&lt;${minAttendance()}%` : 'En risc'}</span>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="panel find-empty" hidden>Ningú amb aquest nom.</div></div>`;

  return top + kpis + rule + dist + secBars + trend + alerts + table;
}

/* ---------- Risc: qui no arriba a la norma ---------- */
function riskProductions() {
  const cur = currentProductionId();
  return productionsSorted().filter(p => p.id === cur || allSessions(p.id).some(s => s.date >= TODAY));
}
/** How many of the remaining rehearsals they must attend to reach the minimum. */
function needed(rs) {
  const min = minAttendance() / 100;
  const total = rs.att + rs.abs + rs.remaining;
  return Math.max(0, Math.ceil(min * total - rs.att - 1e-9));
}
function riskLine(rs) {
  if (rs.status === 'out') return `No hi arriba: encara que vingui a tot, es queda al ${pct(rs.best)}.`;
  const n = needed(rs);
  return `Ha de venir a ${n === rs.remaining ? `tots els ${n}` : `${n} dels ${rs.remaining}`} assajos que queden.`;
}
function riskView() {
  const prods = riskProductions();
  if (!prods.length) return `<div class="empty">${staffSvg()}<p>No hi ha cap producció en curs ni cap de propera.</p></div>`;
  let nOut = 0, nRisk = 0;
  const blocks = prods.map(pr => {
    const rows = [];
    for (const x of SECTIONS) for (const m of membersOf(x.id)) {
      const rs = ruleStatus(pr.id, m);
      if (!rs || rs.status === 'ok') continue;
      rows.push({ m, rs });
    }
    rows.sort((a, b) => (a.rs.status === b.rs.status ? 0 : a.rs.status === 'out' ? -1 : 1) || a.rs.cur - b.rs.cur || byName(a.m, b.m));
    nOut += rows.filter(r => r.rs.status === 'out').length;
    nRisk += rows.filter(r => r.rs.status === 'risk').length;
    const hasConcert = allSessions(pr.id).some(isShow);
    return `<div class="section-title prod-tone" style="--ph:${prodHue(pr)}"><h2 class="h2"><i class="pdot"></i>${esc(pr.name)}</h2>
        ${hasConcert ? `<button class="btn btn-sm" data-act="concert-list" data-pid="${pr.id}">${V.sh.list}</button>` : ''}</div>
      <div class="panel prod-tone tinted" style="--ph:${prodHue(pr)}">${rows.length ? rows.map(({ m, rs }) => `<button class="risk-row" data-act="member-stats" data-mid="${m.id}">
          <span class="rn">${esc(m.name)}</span><span class="rule ${rs.status}">${rs.status === 'out' ? `${pct(rs.cur)} · no hi arriba` : `${pct(rs.cur)} · en risc`}</span>
          <span class="rm">${esc(SEC[m.section].name)} · ${rs.att} de ${rs.att + rs.abs} assajos · ${riskLine(rs)}</span></button>`).join('')
        : '<p style="margin:0;padding:14px;font-size:calc(13.5px*var(--ts))">Tothom compleix la norma.</p>'}</div>`;
  }).join('');
  const text = () => {
    const out = [`Seguiment de la norma del ${minAttendance()}%`];
    for (const pr of prods) {
      const rows = [];
      for (const x of SECTIONS) for (const m of membersOf(x.id)) {
        const rs = ruleStatus(pr.id, m);
        if (rs && rs.status !== 'ok') rows.push(`  ${m.name} (${SEC[m.section].name}): ${pct(rs.cur)} — ${riskLine(rs)}`);
      }
      out.push('', pr.name, rows.length ? rows.join('\n') : '  Tothom compleix la norma.');
    }
    return out.join('\n');
  };
  window.__riskText = text;
  return `<div class="kpis" style="grid-template-columns:repeat(2,1fr)">
      <div class="kpi ${nOut ? 'alert' : ''}"><div class="kpi-v">${nOut}</div><div class="kpi-l">No poden fer ${V.sh.el}</div></div>
      <div class="kpi"><div class="kpi-v">${nRisk}</div><div class="kpi-l">Hi són a temps</div></div>
    </div>
    <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 2px 0">Produccions en curs i properes. Compten els assajos (no ${V.sh.els} ni les sessions «Altres») i no compten les baixes.</p>
    ${blocks}
    <div class="panel" style="padding:14px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:calc(13.5px*var(--ts))">Passa-ho a direcció o guarda-ho.</span>
      <button class="btn btn-sm" data-act="risk-copy">Copia el resum</button></div>`;
}

/* ---------- Llista de concert ---------- */
const concertDates = pid => allSessions(pid).filter(isShow).map(s => s.date).sort();
function concertRows(pid) {
  const prod = S.productions.get(pid);
  const dec = prod.concert || {};
  const dates = concertDates(pid);
  const first = dates[0] || null;
  const min = minAttendance() / 100;
  const rows = [];
  for (const x of SECTIONS) for (const m of membersOf(x.id)) {
    if (isExcluded(pid, m.id)) continue;
    const lv = first && onLeave(m, first);
    const rs = ruleStatus(pid, m);
    let base, note;
    if (lv) { base = 'baixa'; note = leaveText(m) || 'De baixa'; }
    else if (!rs) { base = 'sense'; note = 'Encara no hi ha cap llista passada'; }
    else if (rs.cur >= min) { base = 'apte'; note = `${pct(rs.cur)} · ${rs.att} de ${rs.att + rs.abs} assajos`; }
    else if (rs.status === 'risk') { base = 'pendent'; note = `${pct(rs.cur)} · ${riskLine(rs)}`; }
    else { base = 'no'; note = `${pct(rs.cur)} · ${riskLine(rs)}`; }
    const forced = dec.exclude && dec.exclude[m.id] !== undefined ? 'exclude'
      : dec.include && dec.include[m.id] !== undefined ? 'include' : null;
    const why = forced === 'include' ? dec.include[m.id] : forced === 'exclude' ? dec.exclude[m.id] : '';
    // Apte · pendent (per sota però encara hi pot arribar) · fora.
    const state = forced ? (forced === 'include' ? 'apte' : 'fora')
      : base === 'apte' || base === 'sense' ? 'apte'
      : base === 'pendent' ? 'pendent' : 'fora';
    rows.push({ m, base, note, forced, why, state, inList: state === 'apte' });
  }
  return { prod, dates, rows };
}
const stateLabel = k => ({ apte: `Hi pot ${V.play}`, pendent: 'Encara hi és a temps', fora: 'Fora de la llista' }[k]);
function sheetConcertDecide(pid, mid) {
  const { prod, rows } = concertRows(pid);
  const r = rows.find(z => z.m.id === mid);
  if (!r) return;
  const save = (kind, why) => {
    const dec = { include: { ...(prod.concert?.include || {}) }, exclude: { ...(prod.concert?.exclude || {}) },
      ...(prod.concert?.at ? { at: prod.concert.at, by: prod.concert.by } : {}) };
    delete dec.include[mid]; delete dec.exclude[mid];
    if (kind === 'include') dec.include[mid] = why;
    if (kind === 'exclude') dec.exclude[mid] = why;
    saveProduction({ ...prod, concert: dec });
    closeSheet(); sheetConcertList(pid);
  };
  openSheet({
    title: r.m.name,
    body: `<p style="margin-top:0"><b>${stateLabel(r.state)}</b><br><span class="muted" style="font-size:calc(13.5px*var(--ts))">${esc(r.note)}</span></p>
      ${r.forced ? `<p class="muted" style="font-size:calc(13px*var(--ts))">Ara està decidit a mà${r.why ? `: ${esc(r.why)}` : ''}.</p>` : ''}
      <label class="field"><span>Motiu (surt a la llista)</span><input class="inp" id="cd-why" type="text" maxlength="90" value="${esc(r.forced ? r.why : '')}" placeholder="p. ex. es va incorporar tard"></label>`,
    foot: `${r.forced ? '<button class="btn" id="cd-auto">Torna a l’automàtic</button>' : ''}<span class="spacer"></span>
      <button class="btn btn-danger-ghost" id="cd-no">No hi ${V.plays}</button><button class="btn btn-primary" id="cd-yes">Hi ${V.plays}</button>`,
    onMount: el => {
      const why = () => el.querySelector('#cd-why').value.trim();
      el.querySelector('#cd-yes').onclick = () => save('include', why());
      el.querySelector('#cd-no').onclick = () => save('exclude', why());
      el.querySelector('#cd-auto')?.addEventListener('click', () => save(null, ''));
    },
  });
}
/** Per section: how many can perform each part (1, 2, either), plus those still in time. */
function voiceBalance(rows) {
  const PART_KEYS = [['1', '1', 'v1'], ['2', '2', 'v2'], ['1 o 2', '1/2', 'v12'], ['', '?', 'v0']];
  return SECTIONS.map(x => {
    const inSec = rows.filter(r => r.m.section === x.id);
    const apt = inSec.filter(r => r.state === 'apte'), wait = inSec.filter(r => r.state === 'pendent');
    const parts = PART_KEYS.map(([k, l, cls]) => ({
      k, label: k ? `${x.short}${l}` : `Sense ${V.part}`, cls,
      n: apt.filter(r => (r.m.part || '') === k).length,
      w: wait.filter(r => (r.m.part || '') === k).length,
    })).filter(pt => pt.k === '1' || pt.k === '2' || pt.n || pt.w);
    const n1 = parts.find(pt => pt.k === '1').n, n2 = parts.find(pt => pt.k === '2').n;
    const gap = Math.abs(n1 - n2) >= 3 ? `+${Math.abs(n1 - n2)} ${x.short}${n1 > n2 ? '1' : '2'}` : '';
    return { x, total: apt.length, wait: wait.length, parts, gap };
  });
}
function balanceHtml(bal) {
  return `<div class="section-title" style="margin-top:18px"><h2 class="h2">${V.balance}</h2><span class="eyebrow">qui hi pot ${V.play}</span></div>
    <div class="balance">${bal.map(b => `<div class="bal" aria-label="${esc(b.x.name)}: ${b.total}">
      <div class="bal-h"><em>${esc(b.x.short)}</em><b>${b.total}</b>${b.wait ? `<span class="bal-w" title="Encara hi són a temps">+${b.wait}</span>` : ''}</div>
      <div class="bal-bar">${b.parts.filter(pt => pt.n).map(pt => `<span class="${pt.cls}" style="flex:${pt.n}"></span>`).join('')}</div>
      <ul class="bal-parts">${b.parts.map(pt => `<li><span>${pt.label}</span><b>${pt.n}${pt.w ? `<i>+${pt.w}</i>` : ''}</b></li>`).join('')}</ul>
      ${b.gap ? `<span class="bal-note" title="Diferència entre primeres i segones">${b.gap}</span>` : ''}
    </div>`).join('')}</div>
    <p class="muted" style="font-size:calc(13px*var(--ts));margin:8px 2px 0">«+» són els que encara hi són a temps. «1/2» ${V.plays} tant de primera com de segona. Si entre primeres i segones hi ha 3 o més de diferència, s’indica a sota.</p>`;
}
function sheetConcertList(pid) {
  const { prod, dates, rows } = concertRows(pid);
  if (!prod) return;
  const inList = rows.filter(r => r.state === 'apte');
  const waiting = rows.filter(r => r.state === 'pendent');
  const outList = rows.filter(r => r.state === 'fora');
  const stamp = prod.concert?.at;
  const pill = r => r.forced
    ? `<span class="rule ${r.forced === 'include' ? 'ok' : 'out'}">${r.forced === 'include' ? 'Afegit a mà' : 'Tret a mà'}</span>`
    : r.base === 'apte' ? '<span class="rule ok">Apte</span>'
    : r.base === 'pendent' ? '<span class="rule risk">Hi és a temps</span>'
    : r.base === 'no' ? `<span class="rule out">Sota el ${minAttendance()}%</span>`
    : r.base === 'baixa' ? '<span class="rule out">De baixa</span>' : '<span class="rule risk">Sense dades</span>';
  const block = x => {
    const ms = rows.filter(r => r.m.section === x.id);
    if (!ms.length) return '';
    const n = ms.filter(r => r.state === 'apte').length;
    return `<div class="section-title" style="margin-top:14px"><h2 class="h2">${x.name}</h2><span class="eyebrow">${n} de ${ms.length}</span></div>
      <div class="panel">${ms.map(r => `<button class="elig ${r.state === 'fora' ? 'no' : ''}" ${canEdit() ? `data-act="concert-toggle" data-pid="${pid}" data-mid="${r.m.id}"` : 'disabled'}>
        <span><span class="en">${esc(r.m.name)}</span>${r.m.part ? ` <span class="part">${esc(partTag(r.m))}</span>` : ''}<span class="em">${esc(r.why || r.note)}</span></span>${pill(r)}</button>`).join('')}</div>`;
  };
  const text = [`${prod.name} — qui pot fer ${V.sh.el}${dates.length ? ` (${dates.map(d => shortDate(d)).join(', ')})` : ''}`,
    `Norma: ${minAttendance()}% dels assajos. ${inList.length} de ${rows.length} ${V.members}.`, '']
    .concat(SECTIONS.flatMap(x => {
      const ms = rows.filter(r => r.m.section === x.id && r.state === 'apte');
      return ms.length ? [`${x.name} (${ms.length})`, ms.map(r => `  ${r.m.name}`).join('\n'), ''] : [];
    }))
    .concat(waiting.length ? ['Encara hi són a temps:', waiting.map(r => `  ${r.m.name} (${SEC[r.m.section].name}) — ${r.note}`).join('\n'), ''] : [])
    .concat(outList.length ? ['Fora de la llista:', outList.map(r => `  ${r.m.name} (${SEC[r.m.section].name}) — ${r.why || r.note}`).join('\n'), ''] : [])
    .concat([`${V.balance}:`, voiceBalance(rows).map(b => `  ${b.x.name} ${b.total}: ${b.parts.filter(pt => pt.n).map(pt => `${pt.label} ${pt.n}`).join(' · ')}${b.wait ? ` (+${b.wait} a temps)` : ''}`).join('\n')])
    .join('\n');
  openSheet({
    title: V.sh.list,
    wide: true,
    body: `<div class="prod-band prod-tone" style="--ph:${prodHue(prod)}"><h2 class="h2"><i class="pdot"></i>${esc(prod.name)}</h2><span class="eyebrow">${dates.length ? dates.map(d => shortDate(d)).join(' · ') : `sense ${V.sh.show} al calendari`}</span></div>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="kpi-v">${inList.length}</div><div class="kpi-l">Hi poden ${V.play}</div></div>
        <div class="kpi"><div class="kpi-v">${waiting.length}</div><div class="kpi-l">Hi són a temps</div></div>
        <div class="kpi ${outList.length ? 'alert' : ''}"><div class="kpi-v">${outList.length}</div><div class="kpi-l">Fora</div></div>
      </div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Feta amb la norma del ${minAttendance()}% sobre els assajos de la producció.${canEdit() ? ' Toca una persona per afegir-la o treure-la a mà, amb el motiu.' : ''}</p>
      ${balanceHtml(voiceBalance(rows))}
      ${stamp ? `<p class="muted" style="font-size:calc(13px*var(--ts));margin:6px 0 0">Desada com a definitiva el ${(d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)} a les ${pad(d.getHours())}:${pad(d.getMinutes())}`)(new Date(stamp))}${prod.concert.by ? ` per ${esc(prod.concert.by)}` : ''}.</p>` : ''}
      ${SECTIONS.map(block).join('')}`,
    foot: `${canEdit() ? '<button class="btn" id="cl-final">Marca com a definitiva</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" id="cl-copy">Copia la llista</button>`,
    onMount: el => {
      el.querySelector('#cl-copy').onclick = () => copyText(text, 'Llista copiada');
      el.querySelector('#cl-final')?.addEventListener('click', () => {
        saveProduction({ ...prod, concert: { include: prod.concert?.include || {}, exclude: prod.concert?.exclude || {}, at: new Date().toISOString(), by: (S.me && (S.me.name || S.me.email)) || 'equip' } });
        toast('Llista desada com a definitiva'); sheetConcertList(pid);
      });
    },
  });
}

/* ---------- Singer: my attendance ---------- */
function myProdSummary(me, pid) {
  const prod = S.productions.get(pid);
  if (!prod) return null;
  const st = computeStats({ kind: 'prod', id: pid, name: prod.name }, me.section);
  const r = st.rows.find(x => x.m.id === me.id);
  return { prod, r, rs: ruleStatus(pid, me), counted: r ? r.P + r.R + r.FJ + r.FNJ : 0 };
}
function ruleSentence(rs) {
  if (!rs) return '';
  const min = minAttendance();
  if (rs.status === 'ok') return `<span class="rsvp yes">Compleixes la norma del ${min}%</span>`;
  if (rs.status === 'risk') return `<span class="rsvp none" style="background:var(--fj-soft);color:var(--fj-ink)">Per sota del ${min}%</span> <span class="muted" style="font-size:calc(13px*var(--ts))">Encara hi pots arribar: si vens als ${rs.remaining} assajos que queden, arribaràs al ${pct(rs.best)}.</span>`;
  return `<span class="rsvp no">No arribes al ${min}%</span> <span class="muted" style="font-size:calc(13px*var(--ts))">Parla amb el teu ${V.leader}.</span>`;
}
/** «Et pots permetre 2 faltes més abans del concert del 12 d’oct.»: quantes faltes queden fins a no arribar a la norma. */
function normHint(me, pid) {
  const rs = ruleStatus(pid, me);
  if (!rs || !rs.remaining) return '';
  const min = minAttendance() / 100;
  const k = Math.floor(rs.att + rs.remaining - min * (rs.att + rs.abs + rs.remaining) + 1e-9);
  const show = allSessions(pid).find(s => isShow(s) && s.date >= TODAY);
  const when = show ? `${V.sh.el} del ${shortDate(show.date)}` : 'el final de la producció';
  if (k < 0 || rs.status === 'out') return `<p class="norm-hint out">Ja no arribes al ${minAttendance()}% dels assajos per fer ${esc(when)}. Parla amb el teu ${V.leader}.</p>`;
  if (k >= rs.remaining) return `<p class="norm-hint ok">Ja tens assegurat el ${minAttendance()}% per fer ${esc(when)}.</p>`;
  if (k === 0) return `<p class="norm-hint zero">No et pots permetre <b>cap falta més</b> si vols fer ${esc(when)}: queden ${rs.remaining} assajos.</p>`;
  return `<p class="norm-hint">Et pots permetre <b>${k} ${k === 1 ? 'falta' : 'faltes'} més</b> ${show ? `abans ${V.sh.del} del ${esc(shortDate(show.date))}` : 'fins al final de la producció'} (queden ${rs.remaining} assajos).</p>`;
}
function myAttendanceCard(me) {
  const x = myProdSummary(me, currentProductionId());
  if (!x) return '';
  const { prod, r, rs, counted } = x;
  const dots = (r?.hist || []).map(({ s, mk }) => `<i class="${mk ? 's-' + mk.s : ''}" title="${ddmm(s.date)} · ${mk ? STATUS[mk.s].label : 'Sense llista'}"></i>`).join('');
  return `<div class="section-title prod-tone" style="--ph:${prodHue(prod)}"><h2 class="h2">La meva assistència</h2><span class="eyebrow"><i class="pdot"></i>${esc(prod.name)}</span></div>
    <div class="panel my-att prod-tone tinted" style="--ph:${prodHue(prod)}">
      ${counted ? `<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big">${Math.round(rate(r) * 100)}<small>%</small></span>
        <span class="muted" style="font-size:calc(13px*var(--ts))">${r.P + r.R} de ${counted} assajos${r.R ? ` · ${r.R} retards` : ''}${r.FJ ? ` · ${r.FJ} just.` : ''}${r.FNJ ? ` · ${r.FNJ} no just.` : ''}</span></div>
        ${normHint(me, prod.id) || `<div>${ruleSentence(rs)}</div>`}
        <div class="dots" aria-label="Sessió a sessió">${dots}</div>`
      : `<span class="muted" style="font-size:calc(13.5px*var(--ts))">Encara no hi ha cap llista passada en aquesta producció.</span>`}
      <button class="btn btn-sm" data-act="my-att" style="justify-self:start">Totes les produccions</button>
    </div>`;
}
function sheetMyAttendance() {
  const me = S.members.get(myMemberId());
  if (!me) return;
  const { season } = seasonCfg();
  const sr = computeStats({ kind: 'range', from: season.from, to: season.to, name: season.name }, me.section).rows.find(x => x.m.id === me.id);
  const sc = sr ? sr.P + sr.R + sr.FJ + sr.FNJ : 0;
  const rows = productionsSorted().map(p => myProdSummary(me, p.id)).filter(x => x && x.counted);
  openSheet({
    title: 'La meva assistència',
    body: `<div class="kpis" style="grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><div class="kpi-v">${sc ? kpiPct(rate(sr)) : '—'}</div><div class="kpi-l">${esc(season.name)}</div></div>
        <div class="kpi"><div class="kpi-v">${sr ? sr.min : 0}<small>min</small></div><div class="kpi-l">Retard acumulat</div></div>
      </div>
      ${rows.length ? `<ul class="mini-list" style="max-height:none;margin-top:14px">${rows.map(({ prod, r, rs, counted }) => `<li style="display:grid;gap:4px;padding:10px 12px">
        <span style="display:flex;justify-content:space-between;gap:8px"><b>${esc(prod.name)}</b><span class="mono">${pct(rate(r))}</span></span>
        <span class="m">${r.P + r.R} de ${counted} · ${r.FJ} just. · ${r.FNJ} no just.</span><span>${ruleSentence(rs)}</span></li>`).join('')}</ul>`
        : '<p class="muted">Encara no hi ha llistes passades.</p>'}
      <p class="muted" style="font-size:calc(13px*var(--ts))">Només tu i l’equip ${V.del} veieu aquestes dades. Si hi ha algun error, parla amb el teu ${V.leader}.</p>`,
  });
}
