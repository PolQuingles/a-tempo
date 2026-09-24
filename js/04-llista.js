// A Tempo · 04-llista.js — Assistència › Llista: el quadre de seccions i passar llista.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- View: Roll call ---------- */
function sessionNav(cur, list, compact) {
  const idx = list.indexOf(cur);
  const prod = S.productions.get(cur.prodId);
  return `<div class="session prod-tone ${compact ? 'compact' : ''}" style="--ph:${prodHue(prod)}">
      <button class="nav-arrow" data-act="sess-step" data-dir="-1" ${idx <= 0 || isLinkOnly() ? 'disabled' : ''} aria-label="Sessió anterior">${ICON.left}</button>
      <button class="session-main" ${isLinkOnly() ? '' : 'data-act="sess-pick"'} aria-label="Canvia de sessió">
        <span class="session-prod"><i class="pdot"></i>${esc(prodNames(cur))}</span>
        <span class="session-date">${compact ? capz(fmtD(cur.date, { weekday: 'long', day: 'numeric', month: 'short' })) : longDate(cur.date)}</span>
        <span class="session-meta">${esc(cur.type || 'Assaig')}${cur.time ? ` · <span class="mono">${esc(timeRange(cur))}</span>` : ''}${cur.place ? ` · ${esc(cur.place)}` : ''}
          ${cur.date === TODAY ? '<span class="badge">Avui</span>' : ''}</span>
        ${cur.note ? `<span class="session-note">${esc(cur.note)}</span>` : ''}
      </button>
      <button class="nav-arrow" data-act="sess-step" data-dir="1" ${idx >= list.length - 1 || isLinkOnly() ? 'disabled' : ''} aria-label="Sessió següent">${ICON.right}</button>
    </div>`;
}
/** Whole choir for one session: who is expected (not on leave / outside the production) and how they did. */
function dayStats(cur) {
  const c = { ...emptyCounts(), none: 0 };
  let expected = 0, out = 0;
  for (const x of SECTIONS) {
    if (!convoked(cur, x.id)) continue;
    for (const m of membersOf(x.id)) {
      const mk = effMark(cur, m);
      if (mk && mk.s === 'NP') { out++; continue; }
      expected++;
      if (!mk) { c.none++; continue; }
      c[mk.s]++;
      if (mk.s === 'R') c.min += +mk.min || 0;
    }
  }
  return { c, expected, out };
}
const ATT_TABS = [['llista', 'Llista'], ['stats', 'Estadístiques'], ['risk', 'Risc']];
const attTabs = () => `<div class="subtabs att-tabs" role="tablist" style="grid-template-columns:repeat(3,1fr)">${ATT_TABS.map(([k, l]) => `<button class="subtab" role="tab" aria-selected="${ui.att === k}" data-act="att" data-k="${k}">${l}</button>`).join('')}</div>`;
/** La norma d'assistència de totes les produccions en curs: qui no pot fer el concert i qui està en risc. */
function viewRisk() {
  if (!productionsSorted().length) return `<div class="empty">${staffSvg()}<p>Quan hi hagi produccions amb llistes passades, veuràs aquí qui compleix la norma.</p></div>`;
  return `<div class="page-head in-board"><div><div class="eyebrow">Norma d’assistència</div><h2 class="h1 stats-t">Norma del ${minAttendance()}%</h2></div></div>` + riskView();
}
function viewRoll() {
  if (!ATT_TABS.some(([k]) => k === ui.att)) ui.att = 'llista';
  if (!isLinkOnly() && ui.att === 'stats') return attTabs() + viewStats(true);
  if (!isLinkOnly() && ui.att === 'risk') return attTabs() + viewRisk();
  const list = allSessions();
  if (!S.members.size || !list.length) {
    const onboard = onboardingPanel();
    if (onboard) return `<div class="page-head"><h1 class="h1">Benvinguda</h1></div>${onboard}`;
    return `<div class="empty">${staffSvg()}<h2 class="h2">Encara no hi ha res per passar llista</h2>
      <p>${!S.members.size ? `Afegeix els ${V.members} de cada ${V.section}` : 'Crea una producció amb les seves sessions d’assaig'} per començar.</p>
      ${canEdit() ? `<span style="display:inline-flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary" data-act="tab" data-tab="gestio">Ves a Gestió</button>
        ${!S.members.size && !S.productions.size ? '<button class="btn" data-act="load-demo">Prova amb dades d’exemple</button>' : ''}
      </span>` : ''}</div>`;
  }
  if (isLinkOnly()) {
    const sub = mySubs().sort((a, b) => a.until - b.until)[0];
    const s = sub && list.find(x => x.id === sub.sessionId);
    if (!s) return `<div class="empty"><p>Ara no tens cap llista per passar.</p><button class="btn" data-act="tab" data-tab="avisos">Torna als avisos</button></div>`;
    ui.sessionId = s.id; ui.rollSec = ui.section = sub.section;
    return viewRollSection(s, list, sub.section, {});
  }
  let cur = ui.sessionId && list.find(s => s.id === ui.sessionId);
  if (!cur) { cur = defaultSession(list); ui.sessionId = cur.id; }
  const pendingBySec = canEdit() ? Object.fromEntries(SECTIONS.map(x => [x.id, pendingSessions(x.id)])) : {};
  return ui.rollSec ? viewRollSection(cur, list, ui.rollSec, pendingBySec) : viewRollOverview(cur, list, pendingBySec);
}
function viewRollOverview(cur, list, pendingBySec) {
  const quads = SECTIONS.map(x => {
    const on = convoked(cur, x.id);
    const pr = progress(cur, x.id);
    const complete = on && pr.total && pr.done === pr.total;
    const pend = (pendingBySec[x.id] || []).filter(s => s.id !== cur.id).length;
    const label = `${x.name}: ${on ? `${pr.done} de ${pr.total} marcats` : 'no convocats'}${pend ? `, ${pend} llistes pendents` : ''}`;
    return `<button class="quad ${on ? '' : 'off'} ${complete ? 'is-done' : ''}" data-act="open-sec" data-sec="${x.id}" aria-label="${esc(label)}">
      ${pend ? '<i class="q-dot pend"></i>' : ''}${complete ? '<i class="q-dot done"></i>' : ''}
      <span class="q-l${x.short.length > 1 ? ' long' : ''}">${esc(x.short)}</span><span class="q-n">${esc(x.name)}</span>
      <span class="q-c">${on ? `${pr.done}/${pr.total}` : 'No convocats'}</span>
      ${on && subFor(cur.id, x.id) ? `<span class="q-sub">Passa llista: ${esc(subFor(cur.id, x.id).memberName || '')}</span>` : ''}
      ${on ? `<span class="q-bar"><span style="width:${pr.total ? (pr.done / pr.total) * 100 : 0}%"></span></span>` : ''}
    </button>`;
  }).join('');
  const anyPend = SECTIONS.some(x => (pendingBySec[x.id] || []).some(s => s.id !== cur.id));
  const { c, expected, out } = dayStats(cur);
  const present = c.P + c.R;
  const marked = expected - c.none;
  const day = `<div class="section-title"><h2 class="h2">Resum del dia</h2><button class="btn btn-sm" data-act="summary" data-scope="all">Resum per enviar</button></div>
    <div class="panel day-panel">
      <div class="day-main"><span class="day-big">${present}<small>/${expected}</small></span><span class="lbl">${marked ? 'assisteixen' : 'encara no s’ha passat llista'}${c.R ? ` · ${c.R} amb retard` : ''}</span></div>
      ${stackBar({ ...c, NP: 0 })}
      <div class="day-grid">
        <div><i class="i-R"></i><b>${c.R}</b><span>Retards${c.min ? ` · ${c.min}′` : ''}</span></div>
        <div><i class="i-FJ"></i><b>${c.FJ}</b><span>Faltes justificades</span></div>
        <div><i class="i-FNJ"></i><b>${c.FNJ}</b><span>Faltes injustificades</span></div>
        <div><i class="i-none"></i><b>${c.none}</b><span>Sense marcar</span></div>
      </div>
      ${out ? `<p class="muted" style="margin:0;font-size:12.5px">${out === 1 ? `1 ${V.member} està` : `${out} ${V.members} estan`} de baixa o no fan aquesta producció.</p>` : ''}
    </div>`;
  return `${attTabs()}<div class="ctx" id="ctx">${sessionNav(cur, list, false)}</div>
    ${fitxaChip(cur)}
    <div class="roll-grid"><div class="roll-a">
    <div class="quads ${SECTIONS.length === 4 ? '' : `n-other${SECTIONS.length > 6 ? ' n-many' : ''}`}" data-n="${SECTIONS.length}">${quads}</div>
    <div class="q-legend"><span><i style="background:var(--p)"></i>Llista completa</span>${anyPend ? '<span><i style="background:var(--fnj)"></i>Té llistes pendents</span>' : ''}</div>
    </div><div class="roll-b">
    ${day}
    ${cur.rsvp && canEdit() ? rsvpPanel(cur) : ''}
    </div></div>`;
}
function rsvpCounts(session) {
  const out = { yes: 0, no: 0, none: 0, bySec: {} };
  for (const x of SECTIONS) {
    if (!convoked(session, x.id)) continue;
    const c = out.bySec[x.id] = { yes: 0, no: 0, none: 0 };
    for (const m of membersOf(x.id)) {
      if (isOut(session, m)) continue;
      const a = S.rsvp.get(`${session.id}_${m.id}`)?.answer;
      const k = a === 'yes' ? 'yes' : a === 'no' ? 'no' : 'none';
      c[k]++; out[k]++;
    }
  }
  return out;
}
function rsvpPanel(session) {
  const r = rsvpCounts(session);
  return `<div class="section-title"><h2 class="h2">Confirmacions</h2><span class="eyebrow">${session.rsvpBy ? `fins al ${ddmm(session.rsvpBy)}` : 'convocatòria'}</span></div>
    <div class="panel rsvp-panel">
      <div class="rsvp-nums"><span><b style="color:var(--p)">${r.yes}</b><span>hi seran</span></span><span><b style="color:var(--fnj)">${r.no}</b><span>no hi seran</span></span><span><b style="color:var(--muted)">${r.none}</b><span>sense resposta</span></span></div>
      <div class="legend" style="margin:0">${SECTIONS.filter(x => r.bySec[x.id]).map(x => `<span><b>${esc(x.short)}</b> ${r.bySec[x.id].yes}✓ ${r.bySec[x.id].no}✗ ${r.bySec[x.id].none}?</span>`).join('')}</div>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-act="rsvp-list" data-sid="${session.id}">Veure les respostes</button>${r.none && session.date >= TODAY ? `<button class="btn btn-sm btn-primary" data-act="rsvp-remind" data-sid="${session.id}">Recorda-ho als ${r.none} que falten</button>` : ''}</span>
    </div>`;
}
function viewRollSection(cur, list, sec, pendingBySec) {
  const on = convoked(cur, sec);
  const pr = progress(cur, sec);
  const head = `<div class="ctx" id="ctx">
    ${sessionNav(cur, list, true)}
    <div class="secbar">
      <button class="btn btn-sm btn-ghost back" ${isLinkOnly() ? 'data-act="tab" data-tab="avisos"' : 'data-act="close-sec"'} aria-label="Torna enrere">${ICON.left.replace('<svg', '<svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2"')} ${V.Sections}</button>
      <span class="secbar-t"><em>${esc(secShort(sec))}</em>${esc(SEC[sec].name)}</span>
      <span class="mono" id="secbar-count">${on ? `${pr.done}/${pr.total}` : ''}</span>
    </div>
  </div>`;
  const pend = (pendingBySec[sec] || []).filter(s => s.id !== cur.id);
  const pendHtml = pend.length ? `<div class="pending" role="status"><span><b>${pend.length === 1 ? '1 llista pendent' : `${pend.length} llistes pendents`}</b> de ${esc(SEC[sec].name.toLowerCase())}:</span>
    ${pend.slice(-4).reverse().map(s => `<button class="chip" data-act="open-session" data-keep="1" data-sid="${s.id}">${wdShort(s.date)} ${ddmm(s.date)}</button>`).join('')}
    ${pend.length > 4 ? `<span class="muted">i ${pend.length - 4} més</span>` : ''}</div>` : '';

  if (!on) {
    return head + pendHtml + `<div class="empty"><h2 class="h2">${esc(SEC[sec].name)}: no convocats</h2><p>Aquesta sessió només és per a ${esc(cur.sections.map(x => SEC[x].name.toLowerCase()).join(', '))}.</p>
      ${canEdit() ? `<button class="btn" data-act="session-edit" data-sid="${cur.id}">Edita la sessió</button>` : ''}</div>`;
  }
  const all = membersOf(sec);
  if (!all.length) {
    return head + `<div class="empty"><h2 class="h2">${esc(SEC[sec].name)}: encara no hi ha ningú</h2><p>Afegeix els ${V.members} d’aquesta ${V.section} per poder passar llista.</p>
      ${canEdit() ? `<button class="btn btn-primary" data-act="member-bulk" data-sec="${sec}">Afegeix ${V.members}</button>` : ''}</div>`;
  }
  const inRoll = all.filter(m => !isOut(cur, m));
  const out = all.filter(m => isOut(cur, m));
  const leader = all.find(m => m.leader);
  const c = countsFor(cur, all);
  return head + pendHtml + `
  <div class="leader">
    <span>${V.Leader}: <b>${leader ? esc(leader.name) : '—'}</b></span>
    <span class="mono">${all.length - c.none}/${all.length} marcats</span>
  </div>
  ${subLine(cur, sec, leader)}
  <div class="tally" id="tally">${tallyInner(c, inRoll.some(m => !effMark(cur, m)))}</div>
  <ul class="roster" id="roster">${inRoll.map(m => rowHtml(cur, m)).join('')}</ul>
  ${out.length ? `<details class="np-group" ${out.some(m => effMark(cur, m)?.s !== 'NP') ? 'open' : ''}>
      <summary><span>De baixa o no fan la producció (${out.length})</span>${ICON.chev}</summary>
      <ul class="roster" style="margin-top:0">${out.map(m => rowHtml(cur, m)).join('')}</ul>
    </details>` : ''}
  ${isLinkOnly() ? '' : `<button class="btn" data-act="close-sec" style="display:flex;margin:18px auto 0">Torna a totes les ${V.sections}</button>`}
  ${canMark(cur, sec) ? '<p class="muted" style="font-size:12.5px;text-align:center;margin-top:12px">Toca l’estat marcat una altra vegada per desmarcar-lo.</p>' : ''}`;
}
function subLine(cur, sec, leader) {
  const sub = subFor(cur.id, sec);
  if (sub) return `<div class="sub-line"><span>Avui passa llista: <b>${esc(sub.memberName || '')}</b></span>${canEdit() ? `<button class="btn btn-sm btn-ghost" data-act="sub-set" data-sid="${cur.id}" data-sec="${sec}">Canvia</button>` : ''}</div>`;
  if (!canEdit() || cur.date < TODAY) return '';
  const lm = leader && effMark(cur, leader);
  const away = lm && ['FJ', 'FNJ', 'NP'].includes(lm.s);
  return `<div class="sub-line ${away ? 'sub-hint' : ''}" style="${away ? '' : 'background:transparent;padding:0 2px'}"><span>${away ? `${capz(V.leader)} no hi és.` : ''}</span><button class="btn btn-sm ${away ? 'btn-primary' : 'btn-ghost'}" data-act="sub-set" data-sid="${cur.id}" data-sec="${sec}">${away ? 'Tria qui passa llista' : 'Substitut per avui'}</button></div>`;
}
function countsFor(session, members) {
  const c = { ...emptyCounts(), none: 0 };
  for (const m of members) { const mk = effMark(session, m); if (mk) { c[mk.s]++; if (mk.s === 'R') c.min += +mk.min || 0; } else c.none++; }
  return c;
}
function tallyInner(c, pendingInRoll) {
  const legend = ORDER.map(k => `<span><i class="i-${k}"></i>${STATUS[k].short} <b>${c[k]}</b></span>`).join('')
    + (c.none ? `<span><i class="i-none"></i>Pendents <b>${c.none}</b></span>` : '');
  return `${stackBar(c)}
    <div class="legend">${legend}</div>
    <div class="tally-foot">
      <span class="progress-txt">${c.min ? `Retard acumulat <b>${c.min}′</b>` : (c.R ? 'Retards sense minuts' : 'Sense retards')}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" data-act="summary">Resum</button>
        ${canMark(sessionById(ui.sessionId), ui.rollSec || ui.section) ? `<button class="btn btn-sm btn-primary" data-act="mark-rest" ${pendingInRoll ? '' : 'disabled'}>Resta com a presents</button>` : ''}
      </span>
    </div>`;
}
function rsvpPill(session, m) {
  const a = S.rsvp.get(`${session.id}_${m.id}`);
  return a ? `<span class="rsvp ${a.answer}" title="${esc(a.note || '')}">${a.answer === 'yes' ? 'Confirmat' : 'No hi serà'}</span>` : '<span class="rsvp none">Sense resposta</span>';
}
function ruleTag(session, m) {
  const r = ruleStatus(session.prodId, m);
  if (!r || r.status === 'ok') return '';
  const label = r.status === 'out' ? `No arriba al ${minAttendance()}%` : `En risc · ${pct(r.cur)}`;
  return `<span class="rule ${r.status}" title="Assistència a ${esc(S.productions.get(session.prodId)?.name || '')}: ${pct(r.cur)}">${label}</span>`;
}
function noticeHtml(session, m, mk) {
  const list = absencesFor(session.id, m.id);
  if (!list.length) return '';
  return list.map(a => {
    const what = a.kind === 'late' ? `arribarà tard${a.min ? ` (~${a.min}′)` : ''}` : 'no vindrà';
    const actions = !canEdit() ? '' : a.status === 'pending'
      ? `<div class="n-a"><button class="btn btn-sm btn-primary" data-act="abs-accept" data-aid="${a.id}">${a.kind === 'late' ? 'D’acord' : 'Accepta · Justificada'}</button><button class="btn btn-sm" data-act="abs-reject" data-aid="${a.id}">Rebutja</button></div>`
      : (a.kind === 'absent' && !mk ? `<div class="n-a"><button class="btn btn-sm" data-act="abs-accept" data-aid="${a.id}">Marca justificada</button></div>` : '');
    if (a.status === 'accepted' && mk && a.kind === 'absent') return '';
    return `<div class="notice"><div class="n-h"><span><b>Ha avisat:</b> ${what}</span><span class="st-pill st-${a.status}">${a.status === 'pending' ? 'Pendent' : 'Acceptat'}</span></div>
      ${a.reason ? `<span>${esc(a.reason)}</span>` : ''}${actions}</div>`;
  }).join('');
}
function rowHtml(session, m) {
  const mk = effMark(session, m);
  const s = mk?.s || 'none';
  let state = 'Pendent', warn = false;
  if (mk) {
    if (s === 'R') { if (mk.min) state = `Retard ${mk.min}′`; else { state = 'Indica els minuts'; warn = true; } }
    else if (mk.auto) state = mk.why === 'leave' ? `De baixa${mk.leave?.to ? ` fins al ${ddmm(mk.leave.to)}` : ''}` : 'No fa la producció';
    else state = STATUS[s].label;
  }
  let body = '';
  const editable = canMark(session, m.section);
  if (editable) {
    body = `<div class="seg" role="radiogroup" aria-label="Assistència de ${esc(m.name)}">${ORDER.map(k => `<button class="opt o-${k}" role="radio" aria-checked="${s === k}" aria-label="${STATUS[k].label}" data-act="mark" data-s="${k}"><i></i>${STATUS[k].short}</button>`).join('')}</div>`;
    if (s === 'R') {
      const now = lateNow(session);
      body += `<div class="extra x-R"><label for="min-${m.id}">Minuts</label>
        <div class="mins"><button class="min-chip now" data-act="min" data-min="${now}" aria-pressed="${!!now && +mk.min === now}" ${now ? '' : `disabled title="Calcula els minuts des de l’hora d’inici: només funciona mentre dura la sessió"`}>Arriba ara${now ? ` · ${now}′` : ''}</button></div>
        <input class="min-input" id="min-${m.id}" type="number" inputmode="numeric" min="1" max="240" placeholder="—" value="${mk.min || ''}" data-bind="min" aria-label="Minuts de retard"></div>`;
    } else if ((s === 'FJ' || s === 'FNJ') && !mk.auto) {
      body += `<div class="extra x-${s}"><label for="note-${m.id}">Motiu</label>
        <input class="note-input" id="note-${m.id}" type="text" maxlength="120" placeholder="Opcional" value="${esc(mk.note || '')}" data-bind="note"></div>`;
    }
  } else if (mk && mk.note) {
    body = `<div class="muted" style="font-size:12.5px">${esc(mk.note)}</div>`;
  }
  const dot = s === 'none' ? '' : `<i class="i-${s}" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px"></i>`;
  return `<li class="row ${mk ? 'has-mark' : ''}" data-mid="${m.id}" data-s="${s}">
    <div class="row-top" ${editable ? '' : 'style="margin-bottom:4px"'}><span class="who"><span class="name">${esc(m.name)}</span>${m.part ? `<span class="part" title="${V.Part}">${esc(partTag(m))}</span>` : ''}${m.leader ? `<span class="tag">${V.Leader}</span>` : ''}${mk?.auto || !canEdit() ? '' : ruleTag(session, m)}${session.rsvp && canEdit() && !mk?.auto ? rsvpPill(session, m) : ''}</span>
      <span class="state ${warn ? 'warn' : ''}">${editable ? '' : dot}${state}</span></div>
    ${body}${noticeHtml(session, m, mk && !mk.auto ? mk : null)}</li>`;
}
function refreshRow(mid) {
  const cur = sessionById(ui.sessionId);
  const m = S.members.get(mid);
  const li = $(`.row[data-mid="${mid}"]`);
  if (!cur || !m || !li) return render();
  const tmp = document.createElement('ul');
  tmp.innerHTML = rowHtml(cur, m);
  li.replaceWith(tmp.firstElementChild);
  const all = membersOf(ui.section);
  const c = countsFor(cur, all);
  const tally = $('#tally');
  if (tally) tally.innerHTML = tallyInner(c, all.some(x => !isOut(cur, x) && !effMark(cur, x)));
  const lead = $('.leader .mono');
  if (lead) lead.textContent = `${all.length - c.none}/${all.length} marcats`;
  const sb = $('#secbar-count');
  if (sb) { const pr = progress(cur, ui.section); sb.textContent = `${pr.done}/${pr.total}`; }
}
