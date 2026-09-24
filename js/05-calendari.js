// A Tempo · 05-calendari.js — Calendari: llista i mes, amb les sessions i les classes de cadascú.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Calendar ---------- */
function viewCalendar() {
  const prods = productionsSorted();
  if (ui.calProd !== 'all' && !S.productions.has(ui.calProd)) ui.calProd = 'all';
  const chips = `<div class="chips" role="group" aria-label="Filtra per producció">
    <button class="chip" aria-pressed="${ui.calProd === 'all'}" data-act="cal-prod" data-id="all">Totes</button>
    ${prods.map(p => `<button class="chip" aria-pressed="${ui.calProd === p.id}" data-act="cal-prod" data-id="${p.id}"><i class="pdot prod-tone" style="--ph:${prodHue(p)}"></i>${esc(p.name)}</button>`).join('')}
  </div>`;
  const month = ui.calView === 'month';
  const head = `<div class="page-head"><h1 class="h1">Calendari</h1>
    <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="seg3" role="radiogroup" aria-label="Vista del calendari"><button type="button" role="radio" aria-checked="${!month}" data-act="cal-view" data-k="list">Llista</button><button type="button" role="radio" aria-checked="${month}" data-act="cal-view" data-k="month">Mes</button></span>
    <button class="btn btn-sm" data-act="cal-subscribe">${icsOn() ? 'Subscriu-t’hi' : 'Exporta'}</button>${month ? '' : `<button class="btn btn-sm" data-act="cal-past">${ui.calPast ? 'Amaga passades' : 'Mostra passades'}</button>`}
    ${canEdit() ? `<button class="btn btn-sm btn-primary" data-act="session-new" ${month && ui.calDay ? `data-date="${ui.calDay}"` : ''}>+ Sessió</button>` : ''}</span></div>
`;
  if (!prods.length) return head + `<div class="empty">${staffSvg()}<h2 class="h2">Cap producció</h2><p>Les sessions s’organitzen per produccions.</p>${canEdit() ? '<button class="btn btn-primary" data-act="prod-new">Nova producció</button>' : ''}</div>`;

  if (month) return head + chips + calMonthView();
  const shown = ui.calProd === 'all' ? prods : prods.filter(p => p.id === ui.calProd);
  let body = '';
  let hiddenPast = 0;
  for (const p of shown) {
    // In «Totes», a shared session appears once, under its own production.
    let sessions = allSessions(p.id).filter(s => ui.calProd !== 'all' || s.prodId === p.id);
    const total = sessions.length;
    if (!ui.calPast) { const before = sessions.length; sessions = sessions.filter(s => s.date >= TODAY); hiddenPast += before - sessions.length; }
    if (ui.calProd === 'all' && !sessions.length) continue;
    let rows = '', month = '';
    for (const s of sessions) {
      const m = s.date.slice(0, 7);
      if (m !== month) { if (rows) rows += '</ul>'; month = m; rows += `<div class="cal-month">${monthYear(s.date)}</div><ul class="cal-list">`; }
      rows += calRow(s, p.id);
    }
    if (rows) rows += '</ul>';
    body += `<section class="cal-prod prod-tone" style="--ph:${prodHue(p)}">
      <div class="cal-prod-h">${posterThumb(p)}<h2 class="h2" style="flex:1;min-width:0"><i class="pdot"></i>${esc(p.name)}</h2><span class="mono muted" style="font-size:calc(13px*var(--ts));white-space:nowrap">${total} sessions</span></div>
      ${rows || `<p class="muted">No queden sessions pendents. ${ui.calPast ? '' : 'Mostra les passades per veure-les.'}</p>`}
    </section>`;
  }
  if (!body) body = `<div class="empty"><p>No hi ha sessions properes${hiddenPast ? ` (${hiddenPast} ja passades)` : ''}.</p><button class="btn" data-act="cal-past">Mostra passades</button></div>`;
  // Les classes de cadascú, en un bloc a part (no són de cap producció).
  const cls = ui.calProd === 'all' ? calClasses().filter(x => ui.calPast || x.c.date >= TODAY) : [];
  if (cls.length) {
    let rows = '', mo = '';
    for (const x of cls) {
      const m = x.c.date.slice(0, 7);
      if (m !== mo) { if (rows) rows += '</ul>'; mo = m; rows += `<div class="cal-month">${monthYear(x.c.date)}</div><ul class="cal-list">`; }
      rows += calClassRow(x);
    }
    body += `<section class="cal-prod cal-classes"><div class="cal-prod-h"><h2 class="h2"><i class="pdot" style="background:var(--accent)"></i>${esc(V.classes)}</h2><span class="mono muted" style="font-size:calc(13px*var(--ts));white-space:nowrap">${cls.length} ${cls.length === 1 ? 'dia' : 'dies'}</span></div>${rows}</ul></section>`;
  }
  return head + chips + body;
}
/** Les classes que surten al calendari de cadascú: les hores que hi tinc i, si en faig, els dies que dono. */
function calClasses() {
  if (!classesOn()) return [];
  const mid = myId(), mail = myEmail();
  const out = [];
  for (const c of classDays()) {
    const slot = mid ? classSlots(c).find(x => x.memberId === mid) : null;
    const teach = !!mail && (c.teacher || '') === mail;
    if (slot || teach) out.push({ c, slot, teach });
  }
  return out;
}
function calClassRow({ c, slot, teach }) {
  const end = slot ? hhmm((parseTime(slot.time) ?? 0) + (+slot.mins || 30)) : '';
  const what = teach && !slot ? `<span class="mono">${esc(classDaySpan(c))}</span>` : `<span class="mono">${esc(slot.time)}–${esc(end)}</span>`;
  const cls = [c.date === TODAY ? 'is-today' : '', c.date < TODAY ? 'is-past' : ''].join(' ');
  return `<li class="cal-row cl-row ${cls}"><button class="cal-main" data-act="cal-class" data-k="${esc(c.teacher || '')}" data-date="${esc(c.date)}">
      <span class="cal-date"><b>${+c.date.slice(8, 10)}</b><small>${wdShort(c.date)}</small></span>
      <span class="cal-info"><span class="cal-type">${teach && !slot ? `Fas classe` : 'Classe de cant'}</span><span class="cal-place">${[what, esc(teach && !slot ? '' : teacherOf(c)), esc(c.place || '')].filter(Boolean).join(' · ')}</span></span>
      <span class="cal-right">${c.cancelled ? '<span class="st-pill st-rejected">Anul·lada</span>' : slot?.swapped ? '<span class="st-pill st-accepted">Hora canviada</span>' : ''}</span>
    </button></li>`;
}
/** Month grid: one cell per day with a coloured mark per session; the chosen day is listed below. */
function calMonthView() {
  const list = ui.calProd === 'all' ? allSessions() : allSessions(ui.calProd);
  const thisMonth = TODAY.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ui.calMonth || '')) {
    const upcoming = list.find(x => x.date >= TODAY);
    ui.calMonth = list.some(x => x.date.slice(0, 7) === thisMonth) || !upcoming ? thisMonth : upcoming.date.slice(0, 7);
  }
  const [y, mo] = ui.calMonth.split('-').map(Number);
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, mo, 0).getDate();
  const inMonth = list.filter(x => x.date.slice(0, 7) === ui.calMonth);
  const byDay = new Map();
  for (const x of inMonth) { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); }
  const clByDay = new Map();
  if (ui.calProd === 'all') for (const x of calClasses()) if (x.c.date.slice(0, 7) === ui.calMonth) { if (!clByDay.has(x.c.date)) clByDay.set(x.c.date, []); clByDay.get(x.c.date).push(x); }
  if (!ui.calDay || ui.calDay.slice(0, 7) !== ui.calMonth) ui.calDay = ui.calMonth === thisMonth ? TODAY : (inMonth[0]?.date || `${ui.calMonth}-01`);
  const cells = Array.from({ length: lead }, () => '<span class="mday out" aria-hidden="true"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = `${ui.calMonth}-${pad(d)}`;
    const ss = byDay.get(iso) || [];
    const cl = clByDay.get(iso) || [];
    const marks = ss.slice(0, 3).map(x => `<i class="mk prod-tone${isShow(x) ? ' concert' : ''}" style="--ph:${prodHue(S.productions.get(x.prodId))}"></i>`).join('') + (ss.length > 3 ? '<i class="mk more">+</i>' : '')
      + (cl.length ? '<i class="mk cl mine"></i>' : '');
    const label = `${longDate(iso)}${ss.length ? `: ${ss.map(x => x.type || 'Assaig').join(', ')}` : ', cap sessió'}${cl.length ? `, ${V.classes.toLowerCase()}` : ''}`;
    cells.push(`<button class="mday${iso === TODAY ? ' today' : ''}${iso === ui.calDay ? ' sel' : ''}${iso < TODAY ? ' past' : ''}" data-act="cal-day" data-date="${iso}" aria-pressed="${iso === ui.calDay}" aria-label="${esc(label)}"><span class="mnum">${d}</span><span class="mmarks">${marks}</span></button>`);
  }
  while (cells.length % 7) cells.push('<span class="mday out" aria-hidden="true"></span>');
  const title = capz(fmtD(`${ui.calMonth}-01`, { month: 'long', year: 'numeric' }));
  const legendProds = [...new Set(inMonth.map(x => x.prodId))].map(id => S.productions.get(id)).filter(Boolean);
  const hasConcert = inMonth.some(isShow);
  const daySessions = byDay.get(ui.calDay) || [];
  return `<div class="panel month">
      <div class="mnav"><button class="nav-arrow" data-act="cal-month" data-dir="-1" aria-label="Mes anterior">${ICON.left}</button><h2 class="h2">${esc(title)}</h2><button class="nav-arrow" data-act="cal-month" data-dir="1" aria-label="Mes següent">${ICON.right}</button></div>
      <div class="mweek" aria-hidden="true">${['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="mgrid">${cells.join('')}</div>
      ${legendProds.length || clByDay.size ? `<div class="mlegend">${legendProds.map(p => `<span class="prod-tone" style="--ph:${prodHue(p)}"><i class="pdot"></i>${esc(p.name)}</span>`).join('')}${hasConcert ? `<span><i class="mk concert key"></i>${V.sh.Show}</span>` : ''}${clByDay.size ? `<span><i class="mk cl mine"></i>${esc(V.classes)}</span>` : ''}</div>` : '<p class="muted" style="margin:10px 4px 0;font-size:calc(13px*var(--ts))">Aquest mes no hi ha cap sessió.</p>'}
    </div>
    <div class="section-title" style="margin-top:18px"><h2 class="h2">${esc(longDate(ui.calDay))}</h2>${ui.calDay !== TODAY ? '<button class="btn btn-sm btn-ghost" data-act="cal-today">Avui</button>' : ''}</div>
    ${daySessions.length || (clByDay.get(ui.calDay) || []).length ? `<ul class="cal-list cal-day-list">${daySessions.map(x => calRow(x, x.prodId, true)).join('')}${(clByDay.get(ui.calDay) || []).map(calClassRow).join('')}</ul>`
      : `<div class="panel" style="padding:14px;font-size:calc(13.5px*var(--ts));color:var(--muted)">Cap sessió aquest dia.</div>`}`;
}
function calRow(s, underProd, tone) {
  let marks;
  if (SECTIONS.length <= 5) {
    marks = SECTIONS.map(x => {
      if (!convoked(s, x.id)) return `<span class="vm off${x.short.length > 1 ? ' long' : ''}" title="${esc(x.name)}: no convocats">${esc(x.short)}</span>`;
      const pr = progress(s, x.id);
      const cls = !hasData(s, x.id) ? '' : pr.total && pr.done === pr.total ? 'full' : 'part';
      return `<span class="vm ${cls}${x.short.length > 1 ? ' long' : ''}" title="${esc(x.name)}: ${pr.done}/${pr.total}">${esc(x.short)}</span>`;
    }).join('');
  } else {
    // Moltes seccions: un sol comptador de llistes completes.
    const on = SECTIONS.filter(x => convoked(s, x.id));
    const full = on.filter(x => { const pr = progress(s, x.id); return pr.total && pr.done === pr.total; }).length;
    const any = on.some(x => hasData(s, x.id));
    marks = `<span class="vm-sum ${!any ? '' : full === on.length ? 'full' : 'part'}" title="Llistes completes">${full}/${on.length}</span>`;
  }
  const c = emptyCounts();
  for (const x of SECTIONS) if (convoked(s, x.id) && hasData(s, x.id)) for (const m of membersOf(x.id)) { const mk = effMark(s, m); if (mk) c[mk.s]++; }
  const r = rate(c);
  const rv = s.rsvp && canEdit() ? rsvpCounts(s) : null;
  const right = `<span class="cal-right"><span class="vmarks" aria-label="Llista per ${V.sections}">${marks}</span>${r != null ? `<span class="cal-pct">${pct(r)}</span>` : rv ? `<span class="cal-badge" title="Confirmacions">${rv.yes}✓ ${rv.no}✗ ${rv.none}?</span>` : ''}</span>`;
  const other = sessionProds(s).filter(id => id !== underProd).map(id => S.productions.get(id)?.name).filter(Boolean);
  const cls = [s.date === TODAY ? 'is-today' : '', s.date < TODAY ? 'is-past' : '', isShow(s) ? 'type-concert' : ''].join(' ');
  return `<li class="cal-row ${cls}${tone ? ' prod-tone' : ''}" data-date="${s.date}"${tone ? ` style="--ph:${prodHue(S.productions.get(s.prodId))}"` : ''}>
    <button class="cal-main" data-act="open-session" data-sid="${s.id}">
      <span class="cal-date"><b>${+s.date.slice(8, 10)}</b><small>${wdShort(s.date)}</small></span>
      <span class="cal-info"><span class="cal-type">${esc(s.type || 'Assaig')}</span><span class="cal-place">${[s.info?.call ? `Convocatòria <span class="mono">${esc(s.info.call)}</span>` : '', s.time ? `<span class="mono">${esc(timeRange(s))}</span>` : '', esc(s.place || ''), esc(s.note || ''), other.length ? `També: ${esc(other.join(', '))}` : ''].filter(Boolean).join(' · ')}</span>${planOf(s) && planWorks(s.plan.items).length ? `<span class="cal-plan">${esc(planWorks(s.plan.items).map(planTitle).join(' · '))}</span>` : ''}</span>
      ${right}
    </button>
    ${hasInfo(s) || planOf(s) || seatRows(s).length || (canEdit() && isShow(s)) ? `<button class="icon-btn info" data-act="session-info" data-sid="${s.id}" aria-label="Fitxa de la sessió">${ICON.info}</button>` : ''}
    ${canEdit() ? `<button class="icon-btn" data-act="session-edit" data-sid="${s.id}" aria-label="Edita la sessió">${ICON.more}</button>` : ''}
  </li>`;
}
