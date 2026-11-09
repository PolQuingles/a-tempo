// A Tempo · 06-estadistiques.js — Assistència › Estadístiques i Risc, la llista de concert i la meva assistència.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Stats ---------- */
function viewStats(inBoard) {
  const prods = productionsByNow();
  // Dins d'Assistència, el títol de cada vista és un subtítol de la pestanya.
  const title = t => inBoard ? `<h2 class="h1 stats-t">${t}</h2>` : `<h1 class="h1">${t}</h1>`;
  if (inBoard && ui.statsScope === 'risk') ui.statsScope = 'prod';
  if (!prods.length) return `${inBoard ? '' : `<div class="page-head">${title('Estadístiques')}</div>`}<div class="empty">${staffSvg()}<p>Quan hi hagi produccions amb llistes passades, veuràs aquí l’assistència.</p></div>`;
  // Dins d'Assistència l'abast és un selector petit, perquè no s'apilin dues files de pestanyes.
  const scopeTabs = inBoard
    ? `<div class="scope-row"><span class="seg3 scope-seg" role="radiogroup" aria-label="Període">${[['prod', 'Producció'], ['season', 'Temporada']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}">${l}</button>`).join('')}</span></div>`
    : `<div class="subtabs u-mb-10 u-gtc-repeat-3-1fr" role="tablist">${[['prod', 'Producció'], ['season', 'Temporada'], ['risk', 'Risc']].map(([k, l]) => `<button class="subtab u-fs-12_5" role="tab" aria-selected="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (ui.statsScope === 'risk') return `<div class="page-head${inBoard ? ' in-board' : ''}"><div><div class="eyebrow">Estadístiques</div>${title(`Norma del ${minAttendance()}%`)}</div></div>` + scopeTabs + riskView();
  const scope = currentScope();
  const st = computeStats(scope, ui.statsSec);
  const choice = ui.statsScope === 'prod'
    ? `<div class="chips" role="group" aria-label="Producció">${prods.map(p => `<button class="chip" aria-pressed="${p.id === scope.id}" data-act="stats-prod" data-id="${p.id}"><i class="pdot prod-tone" style="--ph:${prodHue(p)}"></i>${esc(p.name)}</button>`).join('')}</div>`
    : '';
  const secChips = `<div class="chips u-pb-4" role="group" aria-label="${V.Section}">
    <button class="chip" aria-pressed="${!ui.statsSec}" data-act="stats-sec" data-sec="">${capz(V.tot)}</button>
    ${SECTIONS.map(x => `<button class="chip" aria-pressed="${ui.statsSec === x.id}" data-act="stats-sec" data-sec="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const sub = scope.kind === 'range' ? `<p class="muted mono u-m-4-0-0 u-fs-t-13">${ddmm(scope.from)}/${scope.from.slice(0, 4)} – ${ddmm(scope.to)}/${scope.to.slice(0, 4)}</p>` : '';
  const tone = scope.kind === 'prod' ? ` prod-tone tinted" style="--ph:${prodHue(S.productions.get(scope.id))}` : '';
  const head = `<div class="page-head${inBoard ? ' in-board' : ''}${tone}"><div><div class="eyebrow">${scope.kind === 'prod' ? '<i class="pdot"></i>Producció' : 'Estadístiques'}</div>${title(esc(scope.name))}${sub}</div>
    ${S.role === 'edit' ? '<span class="stats-exp"><button class="btn btn-sm" data-act="stats-report">Informe PDF</button><button class="btn btn-sm" data-act="export-csv">Exporta CSV</button></span>' : ''}</div>`;
  // Dins d'Assistència: una sola fila de filtres (període, producció i secció) sobre el títol.
  const selProd = `<label class="sel"><span class="sr">Producció</span><select data-pick="stats-prod">${prods.map(p => `<option value="${p.id}" ${p.id === scope.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
  const selSec = `<label class="sel"><span class="sr">${esc(V.Section)}</span><select data-pick="stats-sec"><option value="">${esc(capz(V.tot))}</option>${SECTIONS.map(x => `<option value="${x.id}" ${ui.statsSec === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
  const filters = `<div class="filters"><span class="seg3" role="radiogroup" aria-label="Període">${[['prod', 'Producció'], ['season', 'Temporada']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${ui.statsScope === k}" data-act="stats-scope" data-k="${k}">${l}</button>`).join('')}</span>
    ${ui.statsScope === 'prod' ? selProd : ''}${areaSec() ? '' : selSec}</div>`;
  const top = inBoard ? filters + head : head + scopeTabs + choice + secChips;

  if (!st.counted.length) {
    const first = st.all[0];
    return top + `<div class="empty"><p>Encara no s’ha passat llista en cap sessió d’aquest període${st.all.length ? ` (${st.all.length === 1 ? '1 sessió programada' : `${st.all.length} sessions programades`}, la primera el ${shortDate(first.date)})` : ''}.</p></div>`;
  }
  const t = st.tot;
  const kpis = `<div class="kpis">
    <div class="kpi"><div class="kpi-v">${kpiPct(rate(t))}</div><div class="kpi-l">Assistència</div></div>
    <div class="kpi"><div class="kpi-v">${kpiPct(punctuality(t))}</div><div class="kpi-l">Puntualitat</div></div>
    <div class="kpi"><div class="kpi-v">${minsKpi(t.min)}</div><div class="kpi-l">Retard acumulat · ${t.R} retards</div></div>
    <div class="kpi ${t.FNJ ? 'alert' : ''}"><div class="kpi-v">${t.FNJ}</div><div class="kpi-l">Faltes no justificades · ${t.FJ} just.</div></div>
  </div>
  <p class="muted u-fs-t-13 u-m-10-2-0">${st.counted.length} de ${st.all.length} ${st.all.length === 1 ? 'sessió' : 'sessions'} amb llista ${helpBtn('assist')}</p>
  ${helpText('assist', 'L’assistència es compta en minuts: els minuts que cadascú ha estat a l’assaig dividits pels minuts que ha durat (si una sessió no té hora de final, compta dues hores). Un retard hi resta els minuts que s’ha fet tard; marxar abans d’hora, els minuts que s’ha perdut del final; i una falta, justificada o no, hi resta tota la sessió. No compten «no fa» ni les baixes.')}`;

  const dist = `<div class="panel u-p-14 u-mt-14">${stackBar(t)}<div class="legend">${ORDER.map(k => `<span><i class="i-${k}"></i>${STATUS[k].label} <b>${t[k]}</b></span>`).join('')}</div></div>`;

  // Norma del concert (only per production)
  let rule = '';
  const ruleMap = new Map();
  if (scope.kind === 'prod') {
    // La norma és per a qui encara hi és: les baixes compten a les estadístiques, però no han de fer el concert.
    for (const r of st.rows) { if (r.m.active === false) continue; const rs = ruleStatus(scope.id, r.m); if (rs) ruleMap.set(r.m.id, rs); }
    const outL = st.rows.filter(r => ruleMap.get(r.m.id)?.status === 'out');
    const riskL = st.rows.filter(r => ruleMap.get(r.m.id)?.status === 'risk');
    const hasConcert = st.all.some(isShow);
    // Una línia per persona: la barra plena és on és ara; la clara, fins on pot arribar amb els assajos que queden.
    const item = (r, rs) => `<li class="ru ${rs.status}"><button data-act="member-stats" data-mid="${r.m.id}" aria-label="${esc(`${r.m.name}: ${pct(rs.cur)}, ${rs.status === 'out' ? `no pot fer ${V.sh.el}` : `en risc, pot arribar al ${pct(rs.best)}`}`)}"><span class="ru-n"><b>${esc(r.m.name)}</b><small>${esc(SEC[r.m.section].name)}</small></span><span class="ru-b"><i class="best" style="width:${Math.round(rs.best * 100)}%"></i><i style="width:${Math.round(rs.cur * 100)}%"></i><u style="left:${minAttendance()}%"></u></span><span class="ru-p num">${pct(rs.cur)}</span></button></li>`;
    rule = `<div class="section-title"><h2 class="h2">Norma del ${minAttendance()}% ${helpBtn('norma')}</h2>${hasConcert ? `<button class="btn btn-sm" data-act="concert-list" data-pid="${scope.id}">${V.sh.list}</button>` : '<span class="eyebrow">assistència mínima</span>'}</div>
      <div class="panel">
        ${outL.length || riskL.length ? `<ul class="ru-list">${outL.length ? `<li class="ru-h">No poden fer ${V.sh.el} · ${outL.length}</li>` : ''}${outL.map(r => item(r, ruleMap.get(r.m.id))).join('')}${riskL.length ? `<li class="ru-h">En risc · ${riskL.length}</li>` : ''}${riskL.map(r => item(r, ruleMap.get(r.m.id))).join('')}</ul>`
          : `<p class="u-m-0 u-p-14 u-fs-t-13">Ara mateix tothom compleix la norma.</p>`}
      </div>
      ${helpText('norma', `Es compta en minuts: el temps que s’ha estat a tots els assajos de la producció (no ${V.sh.els} ni les sessions «Altres») dividit pel temps que han durat. «En risc» vol dir que ara està per sota però encara hi pot arribar amb els assajos que queden.`)}`;
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
      <span class="tbar u-h-100pc">${['P', 'R', 'FJ', 'FNJ'].map(seg).join('')}</span></button>`;
  }).join('');
  const every = Math.max(1, Math.ceil(st.counted.length / 8));
  const labels = st.counted.map(({ s }, i) => `<span>${i % every === 0 ? ddmm(s.date) : ''}</span>`).join('');
  const minW = st.counted.length * 22 + 34;
  const trend = `<div class="section-title"><h2 class="h2">Sessió a sessió</h2><span class="eyebrow">toca per obrir</span></div>
    <div class="panel"><div class="trend-wrap"><div style="min-width:${minW}px">
      <div class="trend">${[100, 75, 50, 25].map(v => `<div class="grid" style="bottom:${v}%"><span>${v}%</span></div>`).join('')}${cols}</div>
      <div class="tlabels">${labels}</div></div></div>
      <div class="trend-note legend u-m-0 u-p-0-14-12">${['P', 'R', 'FJ', 'FNJ'].map(k => `<span><i class="i-${k}"></i>${STATUS[k].short}</span>`).join('')}</div></div>`;

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
          <span><i class="i-R"></i><b>${r.R}</b>${r.min ? ` · ${r.min}′` : ''}${r.left ? ` · marxa ${r.leftMin}′` : ''}</span>
          <span><i class="i-FNJ"></i><b>${r.FNJ}</b></span>
          <span><i class="i-FJ"></i><b>${r.FJ}</b></span>
          ${r.NP ? `<span><i class="i-NP"></i><b>${r.NP}</b></span>` : ''}
        </span></button></li>`;
    }).join('')}</ul></div>
    <div class="only-wide table-wrap"><table class="dtable"><thead><tr><th>${esc(V.Section)}</th><th>Nom</th><th class="n">Assistència</th><th class="n">Presents</th><th class="n">Retards</th><th class="n">Minuts</th><th class="n">Marxa abans</th><th class="n">Justif.</th><th class="n">No just.</th><th class="n">No fa</th><th>Norma</th></tr></thead><tbody>
      ${rows.map(r => {
        const counted = r.P + r.R + r.FJ + r.FNJ;
        const rs = ruleMap.get(r.m.id);
        return `<tr data-act="member-stats" data-mid="${r.m.id}" data-find="${esc(normText(r.m.name))}">
          <td class="m">${esc(SEC[r.m.section].name)}</td><td><b>${esc(r.m.name)}</b></td>
          <td class="n"><b>${counted ? pct(rate(r)) : (r.NP ? 'No fa' : '—')}</b></td><td class="n">${r.P}</td><td class="n">${r.R}</td><td class="n">${r.min ? `${r.min}′` : ''}</td><td class="n">${r.leftMin ? `${r.leftMin}′` : ''}</td>
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
/** How many of the remaining rehearsals they must attend to reach the minimum (en minuts, amb la durada mitjana dels que queden). */
/** Els minuts d'assaig que encara li calen per arribar a la norma (com a molt, tots els que queden). */
function needed(rs) {
  if (!rs.remaining) return 0;
  const min = minAttendance() / 100;
  return Math.min(rs.remM, Math.max(0, Math.ceil(min * (rs.attM + rs.absM + rs.remM) - rs.attM - 1e-9)));
}
function riskLine(rs) {
  if (rs.status === 'out') return `No hi arriba: encara que vingui a tot, es queda al ${pct(rs.best)}.`;
  const n = needed(rs);
  return n >= rs.remM ? `Ha de venir a tot el que queda (${minsText(rs.remM)} d’assaig).` : `Li calen ${minsText(n)} d’assaig més: en queden ${minsText(rs.remM)}.`;
}
/** De les persones que no arriben a la norma, a qui pot escriure qui mira (l'equip, a tothom; un cap de corda, a la seva). */
const riskWritable = rows => canWriteTo() ? rows.filter(r => writableMembers().some(m => m.id === r.m.id)) : [];
function riskRows(pid) {
  const rows = [];
  for (const x of SECTIONS) for (const m of membersOf(x.id)) { const rs = ruleStatus(pid, m); if (rs && rs.status !== 'ok') rows.push({ m, rs }); }
  return rows;
}
/** «Escriu-los» de Risc: a cadascú, un missatge privat amb el seu percentatge i els assajos que li queden. */
const RISK_TEXT = {
  risk: 'Hola, {nom}! A {produccio} portes un {percentatge} d’assistència i cal un {minim} per fer el concert. Si vens als {queden} assajos que queden, hi arribes (fins al {maxim}). Comptem amb tu!',
  out: 'Hola, {nom}! A {produccio} portes un {percentatge} d’assistència i, encara que vinguis a tots els assajos que queden, no arribaràs al {minim} que cal per fer el concert. En parlem?',
};
function riskFill(tpl, prod, { m, rs }) {
  const v = { nom: firstName(m.name), produccio: prod.name, percentatge: pct(rs.cur), minim: `${minAttendance()}%`, queden: String(rs.remaining), maxim: pct(rs.best) };
  return tpl.replace(/\{(\w+)\}/g, (all, k) => v[k] ?? all);
}
function sheetRiskWrite(pid) {
  const prod = S.productions.get(pid);
  const rows = prod ? riskWritable(riskRows(pid)) : [];
  if (!rows.length) return;
  const groups = ['out', 'risk'].map(k => [k, rows.filter(r => r.rs.status === k)]).filter(([, l]) => l.length);
  const title = { out: 'No hi arriben', risk: 'En risc' };
  openSheet({
    title: 'Escriu als que no arriben',
    body: `<div class="kv">
      <p class="muted u-m-0 u-fs-t-13">${esc(prod.name)} · cadascú rep un missatge privat amb les seves xifres. Pots canviar el text: {nom}, {percentatge}, {queden}, {maxim} i {minim} s’omplen per a cada persona.</p>
      ${groups.map(([k, l]) => `<div class="field"><span>${title[k]} · ${l.length}</span>
        <ul class="mini-list rw-list u-maxh-none">${l.map(r => `<li><label class="cs-row"><input type="checkbox" value="${esc(r.m.id)}" checked><span><b>${esc(r.m.name)}</b> <span class="m">${esc(SEC[r.m.section].short)} · ${pct(r.rs.cur)}</span></span></label></li>`).join('')}</ul>
        <textarea class="inp u-minh-110" id="rw-${k}" maxlength="${THREAD_MAX}">${esc(RISK_TEXT[k])}</textarea></div>`).join('')}
      <p class="muted u-m-0 u-fs-t-13" id="rw-prev"></p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="rw-send">Envia</button>`,
    onMount: el => {
      const picked = () => rows.filter(r => el.querySelector(`.rw-list input[value="${r.m.id}"]`)?.checked);
      const paint = () => {
        const p = picked(), first = p[0];
        el.querySelector('#rw-send').textContent = p.length ? `Envia a ${p.length === 1 ? '1 persona' : `${p.length} persones`}` : 'Envia';
        el.querySelector('#rw-prev').innerHTML = first ? `Per exemple, a ${esc(firstName(first.m.name))}: «${esc(riskFill(el.querySelector(`#rw-${first.rs.status}`).value, prod, first))}»` : '';
      };
      el.querySelectorAll('.rw-list input, textarea').forEach(x => x.addEventListener('input', paint));
      el.querySelectorAll('.rw-list input').forEach(x => x.addEventListener('change', paint));
      paint();
      el.querySelector('#rw-send').onclick = async e => {
        const btn = e.currentTarget, p = picked();
        if (!p.length) { toast('Tria a qui escrius'); return; }
        if (p.some(r => !el.querySelector(`#rw-${r.rs.status}`).value.trim())) { toast('Escriu el missatge'); return; }
        btn.disabled = true;
        let sent = 0;
        for (const r of p) {
          try { await sendThreadTo(r.m, riskFill(el.querySelector(`#rw-${r.rs.status}`).value.trim(), prod, r), `Assistència · ${prod.name}`); sent++; } catch {}
        }
        closeSheet(); render();
        toast(sent === p.length ? `Enviat a ${sent === 1 ? '1 persona' : `${sent} persones`}` : `Enviat a ${sent} de ${p.length}: comprova la connexió`);
      };
    },
  });
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
        <span class="u-d-flex u-gap-6 u-fw-wrap">${riskWritable(rows).length ? `<button class="btn btn-sm" data-act="risk-write" data-pid="${pr.id}">Escriu-los</button>` : ''}${hasConcert ? `<button class="btn btn-sm" data-act="concert-list" data-pid="${pr.id}">${V.sh.list}</button>` : ''}</span></div>
      <div class="panel prod-tone tinted" style="--ph:${prodHue(pr)}">${rows.length ? rows.map(({ m, rs }) => `<button class="risk-row" data-act="member-stats" data-mid="${m.id}">
          <span class="rn">${esc(m.name)}</span><span class="rule ${rs.status}">${rs.status === 'out' ? `${pct(rs.cur)} · no hi arriba` : `${pct(rs.cur)} · en risc`}</span>
          <span class="rm">${esc(SEC[m.section].name)} · ${minsText(rs.attM)} de ${minsText(rs.attM + rs.absM)} d’assaig · ${riskLine(rs)}</span></button>`).join('')
        : '<p class="u-m-0 u-p-14 u-fs-t-13">Tothom compleix la norma.</p>'}</div>`;
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
  return `<div class="kpis u-gtc-repeat-2-1fr">
      <div class="kpi ${nOut ? 'alert' : ''}"><div class="kpi-v">${nOut}</div><div class="kpi-l">No poden fer ${V.sh.el}</div></div>
      <div class="kpi"><div class="kpi-v">${nRisk}</div><div class="kpi-l">Hi són a temps</div></div>
    </div>
    <p class="muted u-fs-t-13 u-m-10-2-0">Produccions en curs i properes ${helpBtn('risc')}</p>
    ${helpText('risc', `Compten els assajos (no ${V.sh.els} ni les sessions «Altres») i no compten les baixes.`)}
    ${blocks}
    ${S.role === 'edit' ? `<div class="panel u-p-14 u-mt-14 u-d-flex u-jc-space-between u-ai-center u-gap-10 u-fw-wrap">
      <span class="u-fs-t-13">Passa-ho a direcció o guarda-ho.</span>
      <button class="btn btn-sm" data-act="risk-copy">Copia el resum</button></div>` : ''}`;
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
    body: `<p class="u-mt-0"><b>${stateLabel(r.state)}</b><br><span class="muted u-fs-t-13">${esc(r.note)}</span></p>
      ${r.forced ? `<p class="muted u-fs-t-13">Ara està decidit a mà${r.why ? `: ${esc(r.why)}` : ''}.</p>` : ''}
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
  return `<div class="section-title u-mt-18"><h2 class="h2">${V.balance}</h2><span class="eyebrow">qui hi pot ${V.play}</span></div>
    <div class="balance">${bal.map(b => `<div class="bal" aria-label="${esc(b.x.name)}: ${b.total}">
      <div class="bal-h"><em>${esc(b.x.short)}</em><b>${b.total}</b>${b.wait ? `<span class="bal-w" title="Encara hi són a temps">+${b.wait}</span>` : ''}</div>
      <div class="bal-bar">${b.parts.filter(pt => pt.n).map(pt => `<span class="${pt.cls}" style="flex:${pt.n}"></span>`).join('')}</div>
      <ul class="bal-parts">${b.parts.map(pt => `<li><span>${pt.label}</span><b>${pt.n}${pt.w ? `<i>+${pt.w}</i>` : ''}</b></li>`).join('')}</ul>
      ${b.gap ? `<span class="bal-note" title="Diferència entre primeres i segones">${b.gap}</span>` : ''}
    </div>`).join('')}</div>
    <p class="muted u-fs-t-13 u-m-8-2-0">«+» són els que encara hi són a temps. «1/2» ${V.plays} tant de primera com de segona. Si entre primeres i segones hi ha 3 o més de diferència, s’indica a sota.</p>`;
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
    return `<div class="section-title u-mt-14"><h2 class="h2">${x.name}</h2><span class="eyebrow">${n} de ${ms.length}</span></div>
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
      <div class="kpis u-gtc-repeat-3-1fr">
        <div class="kpi"><div class="kpi-v">${inList.length}</div><div class="kpi-l">Hi poden ${V.play}</div></div>
        <div class="kpi"><div class="kpi-v">${waiting.length}</div><div class="kpi-l">Hi són a temps</div></div>
        <div class="kpi ${outList.length ? 'alert' : ''}"><div class="kpi-v">${outList.length}</div><div class="kpi-l">Fora</div></div>
      </div>
      <p class="muted u-fs-t-13 u-m-10-0-0">Feta amb la norma del ${minAttendance()}% sobre els assajos de la producció.${canEdit() ? ' Toca una persona per afegir-la o treure-la a mà, amb el motiu.' : ''}</p>
      ${balanceHtml(voiceBalance(rows))}
      ${stamp ? `<p class="muted u-fs-t-13 u-m-6-0-0">Desada com a definitiva el ${(d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)} a les ${pad(d.getHours())}:${pad(d.getMinutes())}`)(new Date(stamp))}${prod.concert.by ? ` per ${esc(prod.concert.by)}` : ''}.</p>` : ''}
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
  if (rs.status === 'risk') return `<span class="rsvp none u-bg-fj-soft u-c-fj-ink">Per sota del ${min}%</span> <span class="muted u-fs-t-13">Encara hi pots arribar: si vens a tot el que queda (${minsText(rs.remM)} d’assaig), arribaràs al ${pct(rs.best)}.</span>`;
  return `<span class="rsvp no">No arribes al ${min}%</span> <span class="muted u-fs-t-13">Parla amb el teu ${V.leader}.</span>`;
}
/** «Encara pots perdre 1 h 50 min d’assaig abans del concert del 17 d’oct.»: els minuts que pot faltar (o arribar tard)
 *  i continuar arribant a la norma, que es compta en minuts. */
function normHint(me, pid) {
  const rs = ruleStatus(pid, me);
  if (!rs || !rs.remaining) return '';
  const min = minAttendance() / 100;
  const spare = Math.floor(rs.attM + rs.remM - min * (rs.attM + rs.absM + rs.remM) + 1e-9);
  const show = allSessions(pid).find(s => isShow(s) && s.date >= TODAY);
  const when = show ? `${V.sh.el} del ${shortDate(show.date)}` : 'el final de la producció';
  const left = `en queden ${minsText(rs.remM)}, en ${rs.remaining === 1 ? '1 assaig' : `${rs.remaining} assajos`}`;
  if (spare < 0 || rs.status === 'out') return `<p class="norm-hint out">Ja no arribes al ${minAttendance()}% del temps d’assaig per fer ${esc(when)}. Parla amb el teu ${V.leader}.</p>`;
  if (spare >= rs.remM) return `<p class="norm-hint ok">Ja tens assegurat el ${minAttendance()}% del temps d’assaig per fer ${esc(when)}.</p>`;
  if (spare < 1) return `<p class="norm-hint zero">No pots perdre <b>ni un minut més</b> d’assaig si vols fer ${esc(when)} (${left}).</p>`;
  return `<p class="norm-hint">Encara pots perdre <b>${minsText(spare)}</b> d’assaig ${show ? `abans ${V.sh.del} del ${esc(shortDate(show.date))}` : 'fins al final de la producció'} (${left}).</p>`;
}
function myAttendanceCard(me, inTab) {
  const x = myProdSummary(me, myProductionId(me));
  if (!x) return '';
  const { prod, r, rs, counted } = x;
  const seen = new Set((r?.hist || []).map(h => h.s.id));
  // Després dels fets, en buit, els assajos que encara queden (els mateixos que compta la norma), per veure quant falta.
  const ahead = allSessions(prod.id).filter(s => s.date > TODAY && !seen.has(s.id) && !RULE_SKIP.has(s.type) && convoked(s, me.section) && !onLeave(me, s.date));
  const dots = (r?.hist || []).map(({ s, mk }) => `<i class="${mk ? 's-' + mk.s : ''}" title="${ddmm(s.date)} · ${mk ? STATUS[mk.s].label : 'Sense llista'}"></i>`).join('')
    + ahead.map(s => `<i class="fut" title="${ddmm(s.date)} · Encara ha d’arribar"></i>`).join('');
  // El percentatge, les hores i, a sota, com va sessió a sessió; després, si arriba a la norma. Avisar d'una absència també és aquí.
  const facts = [`${minsText(r?.mDone)} de ${minsText(r?.mAll)} d’assaig`, r?.R ? (r.R === 1 ? '1 retard' : `${r.R} retards`) : '', r?.left ? (r.left === 1 ? 'ha marxat abans 1 cop' : `ha marxat abans ${r.left} cops`) : '',
    r?.FJ ? `${r.FJ} just.` : '', r?.FNJ ? `${r.FNJ} no just.` : ''].filter(Boolean);
  return `<div class="section-title prod-tone" style="--ph:${prodHue(prod)}"><h2 class="h2">La meva assistència</h2><span class="eyebrow"><i class="pdot"></i>${esc(prod.name)}</span></div>
    <div class="panel my-att prod-tone" style="--ph:${prodHue(prod)}">
      ${counted ? `<div class="att-top"><span class="big">${Math.round(rate(r) * 100)}<small>%</small></span>
        <span class="att-facts"><b>${esc(facts[0])}</b>${facts.length > 1 ? `<small>${esc(facts.slice(1).join(' · '))}</small>` : ''}</span></div>
        <div class="dots" aria-label="Sessió a sessió">${dots}</div>
        ${normHint(me, prod.id) || `<div>${ruleSentence(rs)}</div>`}`
      : `<span class="muted u-fs-t-13">Encara no hi ha cap llista passada en aquesta producció.</span>`}
      ${inTab ? '' : '<div class="att-acts"><button class="btn btn-sm btn-ghost" data-act="my-att">Totes les produccions</button><button class="btn btn-sm btn-ghost" data-act="absence-new">Avisa d’una absència</button></div>'}
    </div>`;
}
function sheetMyAttendance() {
  const me = S.members.get(myMemberId());
  if (!me) return;
  openSheet({ title: 'La meva assistència', body: myAttSeason(me) });
}
/** Les produccions d'una persona i, plegada a sota, la temporada sencera (el percentatge i el retard). Les que encara s'assagen,
 *  a la vista (menys `skip`, la que ja surt a dalt, a la targeta grossa); les acabades, plegades, perquè no ocupin la pantalla.
 *  Cada una diu les hores d'assaig fetes de les que s'han comptat (la norma va per temps, no per assajos). */
function myAttSeason(me, skip, head = '') {
  const { season } = seasonCfg();
  const sr = computeStats({ kind: 'range', from: season.from, to: season.to, name: season.name }, me.section).rows.find(x => x.m.id === me.id);
  const sc = sr ? sr.P + sr.R + sr.FJ + sr.FNJ : 0;
  const rows = productionsSorted().map(p => myProdSummary(me, p.id)).filter(x => x && x.counted);
  const done = x => !allSessions(x.prod.id).some(s => s.date >= TODAY);
  const now = rows.filter(x => !done(x) && x.prod.id !== skip), past = rows.filter(done).reverse();
  const list = xs => `<ul class="mini-list u-maxh-none">${xs.map(({ prod, r, rs }) => `<li class="u-d-grid u-gap-4 u-p-10-12">
        <span class="u-d-flex u-jc-space-between u-gap-8"><b>${esc(prod.name)}</b><span class="mono">${pct(rate(r))}</span></span>
        <span class="m">${[`${minsText(r.mDone)} de ${minsText(r.mAll)} d’assaig`, r.FJ ? `${r.FJ} just.` : '', r.FNJ ? `${r.FNJ} no just.` : ''].filter(Boolean).join(' · ')}</span><span>${ruleSentence(rs)}</span></li>`).join('')}</ul>`;
  return `${now.length || past.length ? head : ''}${now.length ? list(now) : ''}
      ${past.length ? `<details class="np-group my-past"><summary><span>Produccions acabades (${past.length})</span>${ICON.chev}</summary>${list(past)}</details>` : ''}
      ${rows.length ? '' : '<p class="muted">Encara no hi ha llistes passades.</p>'}
      <details class="np-group my-season"><summary><span>Tota la temporada${sc ? ` · ${pct(rate(sr))}` : ''}</span>${ICON.chev}</summary>
        <div class="kpis u-gtc-repeat-2-1fr">
          <div class="kpi"><div class="kpi-v">${sc ? kpiPct(rate(sr)) : '—'}</div><div class="kpi-l">${esc(season.name)}${sc ? ` · ${esc(minsText(sr.mDone))} de ${esc(minsText(sr.mAll))}` : ''}</div></div>
          <div class="kpi"><div class="kpi-v">${minsKpi(sr ? sr.min : 0)}</div><div class="kpi-l">Retard acumulat</div></div>
        </div></details>
      <p class="muted u-fs-t-13">${attPrivate() ? `Només tu i l’equip ${V.del} veieu aquestes dades.` : `Tothom ${V.del} pot veure l’assistència de tothom; els teus avisos d’absència, només l’equip.`} Si hi ha algun error, parla amb el teu ${V.leader}.</p>`;
}
/** Assistència, amb el rol de cantaire: només la teva. Avisar d'una absència o d'un retard, els avisos que has fet, com vas a
 *  la producció d'ara i a tota la temporada; i, si avui passes llista d'una corda (en funcions), el botó per fer-ho. */
function viewMyAtt() {
  const me = S.members.get(myMemberId());
  const head = `<div class="page-head"><div>${me ? `<div class="eyebrow">${esc(SEC[me.section].name)}${me.part ? ` ${esc(me.part)}` : ''}</div>` : ''}<h1 class="h1">Assistència</h1></div>
    ${me ? '<button class="btn btn-sm btn-primary" data-act="absence-new">Avisa d’una absència o retard</button>' : ''}</div>`;
  if (!me) return head + `<div class="empty">${staffSvg()}<p>El teu compte encara no està vinculat a cap fitxa de la plantilla. Demana-ho a l’administració ${V.del}.</p></div>`;
  const subs = mySubs().map(x => ({ x, s: sessionById(x.sessionId) })).filter(o => o.s);
  const subCard = subs.length ? `<div class="panel my-subs">${subs.map(({ x, s }) => `<div class="setting"><div><div class="t">${x.auto ? `Ets ${esc(V.leader)} en funcions de ${esc(SEC[x.section].name.toLowerCase())}` : `Avui passes llista de ${esc(SEC[x.section].name.toLowerCase())}`}</div>
      <div class="s">${esc(s.type || 'Assaig')} · ${esc(shortDate(s.date))}${s.time ? ` · ${esc(timeRange(s))}` : ''}</div></div>
      <button class="btn btn-sm btn-primary" data-act="home-roll" data-sid="${esc(s.id)}" data-sec="${esc(x.section)}">Passa llista</button></div>`).join('')}</div>` : '';
  const att = myAttendanceCard(me, true);
  return `${head}${subCard}
    ${myNoticesBlock(me, false)}
    ${att}
    ${myAttSeason(me, myProductionId(me), '<div class="section-title"><h2 class="h2">Les altres produccions</h2></div>')}`;
}
