// A Tempo · 14-eines.js — Eines: primera vegada, qui ha entrat, correus, substituts, confirmacions, calendari subscrit, marca i cerca.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Primera vegada ---------- */
function maybeWelcome() {
  if (S.mode !== 'shared' || !S.ready || sheetClose) return;
  let seen = null;
  seen = lsGet(LS_WELCOME);
  if (seen) return;
  lsSet(LS_WELCOME, new Date().toISOString());
  if (onboardingPanel()) return;
  const me = S.members.get(myMemberId());
  const first = me ? firstName(me.name) : '';
  const body = canEdit()
    ? `<p style="margin-top:0">Hola${first ? `, ${esc(first)}` : ''}. Des d’aquí passaràs llista i gestionaràs ${esc(S.config.name || V.el)}.</p>
       <ul class="welcome"><li><b>Inici</b> · el que tens per fer (absències per acceptar, llistes per acabar…) i la sessió d’avui.</li>
       <li><b>Assistència</b> · toca el quadre de la teva ${V.section} i marca cadascú; també hi ha les estadístiques i la norma.</li>
       <li><b>Calendari</b> · totes les sessions, per produccions.</li>
       <li><b>Tauler</b> · anuncis, partitures, documents i enquestes.</li>
       <li><b>El teu compte</b> · les teves inicials, a dalt a la dreta: la <b>Gestió</b> (personal, produccions i ajustos), notificacions, calendari, aparença i agrupacions.</li></ul>`
    : `<p style="margin-top:0">Hola${first ? `, ${esc(first)}` : ''}. Benvingut/da a l’app ${esc(ofName())}.</p>
       <ul class="welcome"><li><b>Inici</b> · el que tens per fer (convocatòries, enquestes), la sessió d’avui, la teva assistència i les teves absències.</li>
       <li><b>Assistència</b> i <b>Calendari</b> · ho pots consultar tot, però no canviar-hi res.</li>
       <li><b>Tauler</b> · anuncis, partitures i àudios de la teva ${V.part}, i enquestes.</li></ul>`;
  openSheet({
    title: 'Com funciona',
    body: body + `<p class="muted" style="font-size:calc(13px*var(--ts))">Consell: al navegador del mòbil, tria <b>Afegeix a la pantalla d’inici</b> i la tindràs com una app.</p>`,
    foot: `${pushSupported() ? '<button class="btn" id="wc-push">Notificacions</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Entesos</button>`,
    onMount: el => { el.querySelector('#wc-push')?.addEventListener('click', () => { closeSheet(); sheetPush(); }); },
  });
}

/* ---------- Qui ha entrat i qui no ---------- */
function agoText(iso) {
  if (!iso) return 'Mai';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return 'Avui';
  if (d === 1) return 'Ahir';
  if (d < 31) return `Fa ${d} dies`;
  return shortDate(iso.slice(0, 10));
}
/** Keep my own «last seen» fresh, without pestering Firestore on every open. */
async function touchLastSeen() {
  if (!S.me || !db) return;
  const last = S.me.lastSeen ? new Date(S.me.lastSeen).getTime() : 0;
  if (Date.now() - last < 6 * 3600 * 1000) return;
  const at = new Date().toISOString();
  try { await db.doc(`staff/${S.me.email}`).update({ lastSeen: at }); S.me.lastSeen = at; } catch {}
}
/** Els aparells amb avisos només surten a «Qui ha entrat»: es llegeixen en obrir-ho, no cada cop que s'obre l'app. */
async function loadPushDevices() {
  try { const snap = await db.collection('push').get(); S.push = new Map(snap.docs.map(d => [d.id, d.data()])); } catch {}
}
function accessReport() {
  const people = peopleSorted();
  const inApp = people.filter(p => p.lastSeen);
  const never = people.filter(p => !p.lastSeen);
  const roster = membersOf(null, true).filter(m => m.active !== false);
  const noAccount = roster.filter(m => !accountFor(m.id));
  const pushBy = new Map();
  for (const d of S.push.values()) if (d.email) pushBy.set(d.email, (pushBy.get(d.email) || 0) + 1);
  return { people, inApp, never, roster, noAccount, pushBy };
}
function sheetWhoIn() {
  const { people, inApp, never, roster, noAccount, pushBy } = accessReport();
  const first = n => firstName(n);
  const memberOfEmail = p => p.memberId && S.members.get(p.memberId);
  const row = p => `<li><span>${esc(p.name || p.email)}<br><span class="m mono">${esc(p.email)}</span>${p.invitedAt ? `<br><span class="m">Convidat ${esc(agoText(p.invitedAt).toLowerCase())}</span>` : ''}</span>
      <button class="btn btn-sm" data-invite="${esc(p.email)}">${p.invitedAt ? 'Torna a convidar' : 'Convida'}</button></li>`;
  openSheet({
    title: 'Qui ha entrat i qui no',
    wide: true,
    body: `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="kpi-v">${inApp.length}</div><div class="kpi-l">Han entrat</div></div>
        <div class="kpi ${never.length ? 'alert' : ''}"><div class="kpi-v">${never.length}</div><div class="kpi-l">Encara no</div></div>
        <div class="kpi"><div class="kpi-v">${noAccount.length}</div><div class="kpi-l">Sense accés</div></div>
      </div>
      ${never.length ? `<div class="section-title" style="margin-top:16px"><h2 class="h2">Tenen accés però no han entrat</h2></div>
        <ul class="mini-list remind-list" style="max-height:none">${never.map(row).join('')}</ul>` : ''}
      ${noAccount.length ? `<div class="section-title" style="margin-top:16px"><h2 class="h2">${V.Members} sense accés</h2><span class="eyebrow">falta el correu</span></div>
        <ul class="mini-list" style="max-height:220px">${noAccount.map(m => `<li><span>${esc(m.name)}<br><span class="m">${SEC[m.section].name}</span></span><button class="btn btn-sm" data-act="staff-new" data-mid="${esc(m.id)}">Dona-li accés</button></li>`).join('')}</ul>` : ''}
      ${inApp.length ? `<div class="section-title" style="margin-top:16px"><h2 class="h2">Ja hi entren</h2></div>
        <ul class="mini-list" style="max-height:260px">${inApp.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')).map(p => `<li><span>${esc(p.name || p.email)}<br><span class="m">${esc(rolesText(p))}${pushBy.get(p.email) ? ' · notificacions actives' : ''}</span></span><span class="m">${agoText(p.lastSeen)}</span></li>`).join('')}</ul>` : ''}
      <p class="muted" style="font-size:calc(13px*var(--ts))">De ${roster.length} ${V.members} de la plantilla, ${roster.length - noAccount.length} tenen el correu donat d’alta. «Han entrat» vol dir que han obert l’app almenys un cop.</p>`,
    foot: never.length ? '<button class="btn" id="wi-all">Copia el missatge per al grup</button><button class="btn btn-primary" id="wi-mail">Convida’ls per correu</button>' : '',
    onMount: el => {
      el.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => sheetInvite(S.staff.get(b.dataset.invite)));
      el.querySelector('#wi-mail')?.addEventListener('click', () => sheetInviteMany(never));
      el.querySelector('#wi-all')?.addEventListener('click', () => copyText(
        `Encara no heu entrat a l’app ${ofName()}: ${never.map(p => first(p.name || p.email)).join(', ')}.\nEntreu-hi amb el vostre correu: ${appUrl()}\nSi el vostre correu no és de Google, toqueu «Entra amb un altre correu» i creeu la vostra contrasenya.`,
        'Missatge per al grup copiat'));
    },
  });
}

/* ---------- Comprovador de correus ---------- */
const MAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'outlook.es', 'icloud.com', 'yahoo.com', 'yahoo.es', 'live.com', 'me.com', 'orfeocatala.cat', 'palaumusica.cat'];
function mailWarning(mail) {
  const at = String(mail || '').split('@');
  if (at.length !== 2) return 'No sembla un correu';
  const dom = at[1].toLowerCase();
  if (!dom.includes('.')) return 'Al domini li falta el punt';
  if (/\s/.test(mail)) return 'Té un espai';
  if (MAIL_DOMAINS.includes(dom)) return null;
  const near = MAIL_DOMAINS.find(d => Math.abs(d.length - dom.length) <= 2 && levenshtein(d, dom) <= 2);
  return near ? `Volies dir ${near}?` : null;
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function mailProblems() {
  const out = [];
  const seenMember = new Map();
  for (const p of S.staff.values()) {
    const w = mailWarning(p.email);
    if (w) out.push({ kind: 'mail', email: p.email, name: p.name, text: w });
    // Algú que és a la plantilla però el seu compte no hi està vinculat (no té el seu espai ni surt com a cap de corda).
    const same = !p.memberId && rosterMatch(p.name, { email: p.email });
    if (same) out.push({ kind: 'unlinked', email: p.email, name: p.name, mid: same.id, text: `És a la plantilla (${SEC[same.section].name}), però el compte no està vinculat a la seva fitxa` });
    else if (hasRole(p, 'singer') && !p.memberId) out.push({ kind: 'link', email: p.email, name: p.name, text: `${V.Member} sense fitxa de la plantilla` });
    if (p.memberId) {
      const m = S.members.get(p.memberId);
      if (!m) out.push({ kind: 'link', email: p.email, name: p.name, text: 'Vinculat a una fitxa que ja no hi és' });
      else if (m.active === false) out.push({ kind: 'inactive', email: p.email, name: p.name, text: `${m.name} ja no hi és (fitxa inactiva)` });
      if (seenMember.has(p.memberId)) out.push({ kind: 'dup', email: p.email, name: p.name, text: `Aquesta fitxa també és de ${seenMember.get(p.memberId)}` });
      else seenMember.set(p.memberId, p.email);
    }
  }
  // La fitxa diu «cap de corda», però no pot passar llista (no té accés o el seu compte no en té el permís).
  for (const m of membersOf(null)) {
    const acc = m.leader ? accountFor(m.id) : null;
    if (!m.leader || (acc && leadsOwn(m, acc))) continue;
    out.push({ kind: 'leader', email: acc?.email || '', name: m.name, mid: m.id, text: acc ? `La fitxa diu ${V.leader}, però el compte no té permís per passar llista` : `${V.Leader} sense accés a l’app: no pot passar llista` });
  }
  return out;
}
function sheetMailCheck() {
  const probs = mailProblems();
  const { noAccount, roster } = accessReport();
  openSheet({
    title: 'Revisió dels accessos',
    wide: true,
    body: probs.length || noAccount.length
      ? `${probs.length ? `<div class="section-title" style="margin-top:0"><h2 class="h2">Per revisar</h2><span class="eyebrow">${probs.length}</span></div>
          <ul class="mini-list" style="max-height:none">${probs.map(x => `<li><span>${esc(x.name || x.email)}${x.email ? `<br><span class="m mono">${esc(x.email)}</span>` : ''}</span>
            <span style="display:flex;gap:6px;align-items:center"><span class="m" style="text-align:right">${esc(x.text)}</span>${x.kind === 'unlinked'
              ? `<button class="btn btn-sm btn-primary" data-act="staff-link" data-email="${esc(x.email)}" data-mid="${esc(x.mid)}">Vincula</button>`
              : x.kind === 'leader' ? `<button class="btn btn-sm" data-act="member-edit" data-mid="${esc(x.mid)}">Obre</button>`
              : `<button class="btn btn-sm" data-act="staff-edit" data-email="${esc(x.email)}">Obre</button>`}</span></li>`).join('')}</ul>` : ''}
         ${noAccount.length ? `<div class="section-title"><h2 class="h2">${V.Members} sense correu</h2><span class="eyebrow">${noAccount.length} de ${roster.length}</span></div>
          <ul class="mini-list" style="max-height:260px">${noAccount.map(m => `<li><span>${esc(m.name)}</span><span class="m">${SEC[m.section].name}</span></li>`).join('')}</ul>` : ''}`
      : `<p style="margin:0">Tot correcte: no hi ha cap correu estrany i tots els ${V.members} tenen accés.</p>`,
    foot: noAccount.length ? `<span class="spacer"></span><button class="btn" id="mc-copy">Copia els que falten</button><button class="btn btn-primary" data-act="staff-bulk">Enganxa una llista</button>` : '',
    onMount: el => {
      el.querySelector('#mc-copy')?.addEventListener('click', () => copyText(noAccount.map(m => m.name).join('\n'), 'Noms copiats'));
    },
  });
}

/* ---------- Clipboard ---------- */
function copyText(text, okMsg) {
  return navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => {
    openSheet({ title: 'Copia el text', body: `<textarea class="summary-pre" readonly>${esc(text)}</textarea>` });
  });
}

/* ---------- Substitutes ---------- */
function sheetSub(sid, sec) {
  const s = sessionById(sid);
  if (!s) return;
  const cur = subFor(sid, sec);
  const ms = membersOf(sec).filter(m => !isOut(s, m) && !m.leader);
  openSheet({
    title: `Qui passa llista · ${SEC[sec].name}`,
    body: `<p style="margin-top:0">${longDate(s.date)} · ${esc(s.type)}. La persona triada podrà passar llista d’aquesta ${V.section} <b>només aquest dia</b>, entrant a l’app amb el seu correu.</p>
      <label class="field"><span>Substitut</span><select class="inp" id="sub-m"><option value="">—</option>${ms.map(m => `<option value="${m.id}" ${cur?.memberId === m.id ? 'selected' : ''}>${esc(m.name)}${!S.staffReady || accountFor(m.id) ? '' : ' (encara sense accés)'}</option>`).join('')}</select></label>`,
    foot: `${cur ? '<button class="btn btn-danger-ghost" id="sub-del">Treu el substitut</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="sub-save">Desa</button>`,
    onMount: el => {
      el.querySelector('#sub-save').onclick = async () => {
        const m = S.members.get(el.querySelector('#sub-m').value);
        if (!m) { toast('Tria qui passarà llista'); return; }
        // Qui té accés només ho sap qui porta les persones (els caps de corda no llegeixen les fitxes de l'equip).
        const hasAccount = !S.staffReady || !!accountFor(m.id);
        const until = parseISO(s.date).getTime() + 36 * 3600 * 1000;   // fins l’endemà al migdia
        const rec = { sessionId: s.id, section: sec, memberId: m.id, memberName: m.name, date: s.date, until, by: S.me?.email || 'enllaç', at: new Date().toISOString() };
        S.subs.set(subKey(s.id, sec), rec); persist('subs', subKey(s.id, sec), rec, 10);
        closeSheet(); render();
        toast(hasAccount ? `${m.name} ja pot passar llista avui des del seu compte.` : `Desat. ${m.name} encara no té accés: dona-l’hi a Persones perquè pugui passar llista.`);
      };
      el.querySelector('#sub-del')?.addEventListener('click', () => { S.subs.delete(subKey(sid, sec)); persist('subs', subKey(sid, sec), null, 10); closeSheet(); render(); });
    },
  });
}

/* ---------- Confirmations ---------- */
function rsvpAnswer(sid, answer, note = '', patch = {}) {
  const mid = myMemberId(), m = S.members.get(mid), s = sessionById(sid);
  if (!m || !s) return;
  const id = `${sid}_${mid}`, prev = S.rsvp.get(id) || {};
  const rec = { sessionId: sid, memberId: mid, section: m.section, answer, note: note || (answer === prev.answer ? prev.note || '' : ''), at: new Date().toISOString(), uid: S.uid };
  // L'autocar i les feines de voluntari només valen si hi va.
  if (answer === 'yes') for (const k of ['transport', 'tasks']) { const v = k in patch ? patch[k] : prev[k]; if (v && (!Array.isArray(v) || v.length)) rec[k] = v; }
  S.rsvp.set(id, rec); persist('rsvp', id, rec, 10);
  if (!Object.keys(patch).length) toast(answer === 'yes' ? (s.bus && !rec.transport ? 'Confirmat. Digues també si vens amb l’autocar.' : 'Confirmat: hi seràs') : 'Resposta enviada');
  render();
}
/** Autocar o pel seu compte; i les feines de voluntari (carregar material…). */
function rsvpTransport(sid, v) { const a = S.rsvp.get(`${sid}_${myMemberId()}`); rsvpAnswer(sid, 'yes', a?.note || '', { transport: v }); toast(v === 'bus' ? 'Vas amb l’autocar' : 'Hi vas pel teu compte'); }
function rsvpTask(sid, tid) {
  const a = S.rsvp.get(`${sid}_${myMemberId()}`);
  const cur = new Set(a?.tasks || []);
  const on = !cur.has(tid);
  on ? cur.add(tid) : cur.delete(tid);
  rsvpAnswer(sid, 'yes', a?.note || '', { tasks: [...cur] });
  toast(on ? 'T’hi has apuntat. Gràcies!' : 'Ja no hi ets apuntat');
}
/** Qui s'ha apuntat a cada feina (l'equip ho veu tot; cadascú, només les seves). */
const taskPeople = (s, tid) => [...S.rsvp.values()].filter(r => r.sessionId === s.id && r.answer === 'yes' && (r.tasks || []).includes(tid)).map(r => S.members.get(r.memberId)).filter(Boolean);
/** Les feines de voluntari d'una convocatòria: a la fitxa i a la targeta de convocatòria. */
function tasksBlock(s, compact) {
  const tasks = s && s.rsvp ? s.tasks || [] : [];
  if (!tasks.length) return '';
  const me = S.members.get(myMemberId());
  const mine = me ? S.rsvp.get(`${s.id}_${me.id}`) : null;
  const can = mine?.answer === 'yes' && s.date >= TODAY && !PREVIEW;
  const rows = tasks.map(t => {
    const who = canEdit() ? taskPeople(s, t.id) : [];
    const on = (mine?.tasks || []).includes(t.id);
    return `<li><span><b>${esc(t.label)}</b>${canEdit() ? `<small>${who.length} de ${t.need || '?'}${who.length ? ` · ${esc(who.map(m => firstName(fullName(m.name))).join(', '))}` : ''}</small>` : t.need ? `<small>Calen ${t.need} persones</small>` : ''}</span>
      ${can ? `<button class="btn btn-sm ${on ? 'btn-primary' : ''}" data-act="rsvp-task" data-sid="${esc(s.id)}" data-k="${esc(t.id)}">${on ? 'Hi ets' : 'M’hi apunto'}</button>` : on ? '<span class="rsvp yes">Hi ets</span>' : ''}</li>`;
  }).join('');
  return `${compact ? '<span class="todo-k" style="margin-top:6px">Voluntaris</span>' : '<div class="section-title" style="margin-top:14px"><h2 class="h2">Voluntaris</h2></div>'}<ul class="tasks">${rows}</ul>${me && !mine && !compact ? '<p class="muted" style="margin:6px 0 0;font-size:calc(13px*var(--ts))">Confirma que hi seràs per apuntar-t’hi.</p>' : ''}`;
}
function sheetRsvpNo(sid) {
  openSheet({
    title: 'No hi podràs anar',
    body: `<label class="field"><span>Motiu (opcional)</span><textarea class="inp" id="rn-note" maxlength="160" style="min-height:80px"></textarea></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-danger" id="rn-ok">Envia</button>`,
    onMount: el => { el.querySelector('#rn-ok').onclick = () => { const n = el.querySelector('#rn-note').value.trim(); closeSheet(); rsvpAnswer(sid, 'no', n); }; },
  });
}
function sheetRsvpList(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const block = x => {
    const ms = membersOf(x.id).filter(m => !isOut(s, m));
    const extra = a => [s.bus && a?.answer === 'yes' ? (a.transport === 'bus' ? 'Autocar' : a.transport === 'own' ? 'Pel seu compte' : 'Autocar?') : '', ...(a?.tasks || []).map(t => (s.tasks || []).find(x => x.id === t)?.label).filter(Boolean)].filter(Boolean).join(' · ');
    const row = m => { const a = S.rsvp.get(`${sid}_${m.id}`); return `<li><span>${esc(m.name)}${extra(a) ? `<br><span class="m">${esc(extra(a))}</span>` : ''}${a?.note ? `<br><span class="m">${esc(a.note)}</span>` : ''}</span><span class="rsvp ${a ? a.answer : 'none'}">${a ? (a.answer === 'yes' ? 'Sí' : 'No') : '—'}</span></li>`; };
    return `<div class="eyebrow" style="margin:14px 0 4px">${x.name}</div><ul class="mini-list" style="max-height:none">${ms.map(row).join('')}</ul>`;
  };
  openSheet({ title: `Confirmacions · ${shortDate(s.date)}`, body: SECTIONS.filter(x => convoked(s, x.id)).map(block).join('') });
}

/* ---------- Calendar subscription ---------- */
// La primera agrupació conserva l'adreça d'abans; la resta tenen la seva a calendaris/<agrupació>.ics.
const icsUrl = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}${GID === FOUNDER ? 'calendari.ics' : `calendaris/${GID}.ics`}`;
function icsEscape(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
function buildIcs(sessions, name) {
  const dt = (d, t) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//A Tempo//CA', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(name)}`, 'X-WR-TIMEZONE:Europe/Madrid'];
  for (const s of sessions) {
    lines.push('BEGIN:VEVENT', `UID:${s.id}@a-tempo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (s.time) {
      lines.push(`DTSTART;TZID=Europe/Madrid:${dt(s.date, s.time)}`);
      const end = s.end || `${pad(Math.min(23, +s.time.slice(0, 2) + 2))}:${s.time.slice(3, 5)}`;
      lines.push(`DTEND;TZID=Europe/Madrid:${dt(s.date, end)}`);
    } else {
      const next = new Date(parseISO(s.date).getTime() + 86400000);
      lines.push(`DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${isoDate(next).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsEscape(`${s.type || 'Assaig'} · ${prodNames(s)}`)}`);
    if (s.place) lines.push(`LOCATION:${icsEscape(s.place)}`);
    const desc = [s.note, s.sections?.length ? `Convocats: ${s.sections.map(x => SEC[x].name).join(', ')}` : ''].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function sheetCalendar() {
  const https = icsUrl();
  const webcal = https.replace(/^https?:/, 'webcal:');
  const me = S.members.get(myMemberId());
  const on = icsOn();
  openSheet({
    title: 'Calendari al mòbil',
    body: `<div class="manual">${on ? `
      <p style="margin-top:0">Subscriu-te al calendari ${esc(ofName())} i tindràs tots els assajos i ${V.sh.els} a la teva app de calendari, amb l’hora i el lloc. Si canvia alguna cosa, s’actualitza sol (pot trigar unes hores). L’horari del dia, el punt de trobada i el que cal portar són a l’app o al teu calendari personal (a sota).</p>
      <h3>iPhone, iPad o Mac</h3><p><a class="btn btn-sm btn-primary" href="${webcal}">Subscriu-t’hi</a></p>
      <h3>Android o Google Calendar</h3><p><a class="btn btn-sm btn-primary" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Obre Google Calendar</a></p>
      <p>Si no funciona, a Google Calendar (web) ves a <b>Altres calendaris › + › Des d’un URL</b> i enganxa aquesta adreça:</p>
      <div class="linkbox">${esc(https)}</div>
      <h3>Només un cop</h3>` : `<p style="margin-top:0">Aquesta agrupació no té el calendari subscrit activat${isAdmin() ? ': el pots activar a Gestió › Ajustos' : ''}.</p>`}
      <p>${on ? 'També' : 'Mentrestant'} pots descarregar el calendari ${me ? 'amb les sessions on estàs convocat/da' : 'actual'} i importar-lo (no s’actualitzarà sol).</p>
      ${myId() ? `<h3>El teu calendari, amb tots els detalls</h3><p>Només les sessions on et toca anar, amb l’horari del dia, el punt de trobada i el que cal portar${classesOn() && inClasses() ? ', i les teves classes' : ''}. És una adreça només per a tu.</p>
      <p><button class="btn btn-sm btn-primary" data-act="my-cal">Fes-te el teu calendari</button></p>` : ''}
    </div>`,
    foot: `${on ? '<button class="btn" id="ics-copy">Copia l’adreça</button>' : ''}<button class="btn btn-primary" id="ics-dl">Descarrega .ics</button>`,
    onMount: el => {
      el.querySelector('#ics-copy')?.addEventListener('click', () => copyText(https, 'Adreça copiada'));
      el.querySelector('#ics-dl').onclick = () => {
        const list = allSessions().filter(s => !me || convoked(s, me.section));
        offerFile(`calendari-${(S.config.name || 'agrupacio').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}.ics`, buildIcs(list, S.config.name || PLATFORM.name), 'text/calendar');
      };
    },
  });
}

/** El calendari personal: les sessions on és convocat (i no les de les produccions que no fa), amb tots els detalls, i les
 *  seves classes. L'adreça porta una clau (calKeys/<membre>); el fitxer el fa la tasca «Publica» cada poques hores. */
async function sheetMyCalendar() {
  const mid = myId();
  if (!mid) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let token = '';
  try {
    const snap = await db.doc(`calKeys/${mid}`).get();
    token = snap.exists ? snap.data().token : '';
    if (!token) { token = newKey() + newKey(); await db.doc(`calKeys/${mid}`).set({ memberId: mid, token, at: new Date().toISOString() }); }
  } catch { toast('No s’ha pogut preparar el calendari. Comprova la connexió.'); return; }
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}calendaris/p/${token}.ics`;
  const webcal = url.replace(/^https?:/, 'webcal:');
  const classes = classesOn() && inClasses();
  openSheet({
    title: 'El teu calendari',
    body: `<div class="manual"><p style="margin-top:0">Aquesta adreça porta <b>només les teves sessions</b>, amb l’horari del dia, el punt de trobada i el que cal portar${classes ? ', i les teves classes' : ''}. Si t’hi subscrius, s’actualitza sol cada poques hores.</p>
      <h3>iPhone, iPad o Mac</h3><p><a class="btn btn-sm btn-primary" href="${esc(webcal)}">Subscriu-t’hi</a></p>
      <h3>Android o Google Calendar</h3><p><a class="btn btn-sm btn-primary" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Obre Google Calendar</a></p>
      <p>Si no funciona, a Google Calendar (web) ves a <b>Altres calendaris › + › Des d’un URL</b> i enganxa aquesta adreça:</p>
      <div class="linkbox">${esc(url)}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts))">És una adreça personal: no la comparteixis. ${classes ? 'Si ja tenies el calendari de les classes, el pots treure: aquest ja les porta. ' : ''}La primera vegada, i després de cada canvi, les sessions hi surten al cap d’unes hores.</p></div>`,
    foot: `${navigator.share ? '<button class="btn" id="mc-share">Comparteix…</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" id="mc-copy">Copia l’adreça</button>`,
    onMount: el => {
      el.querySelector('#mc-copy').onclick = () => copyText(url, 'Adreça copiada');
      el.querySelector('#mc-share')?.addEventListener('click', () => navigator.share({ title: 'El meu calendari', url }).catch(() => {}));
    },
  });
}

/* ---------- Brand ---------- */
function uploadLogo(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 256, r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r) || max; c.height = Math.round(img.height * r) || max;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL('image/png');
      if (data.length > 180000) data = c.toDataURL('image/webp', 0.85);
      if (data.length > 240000) { toast('La imatge és massa gran. Prova amb un PNG més senzill.'); return; }
      saveConfig({ brand: { ...(S.config.brand || {}), logo: data } });
      toast('Logotip desat'); render();
    };
    img.onerror = () => toast('No s’ha pogut llegir la imatge');
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}
function setBrandColor(c) { saveConfig({ brand: { ...(S.config.brand || {}), accent: c } }); render(); }

/* ---------- Cerca ---------- */
// Una sola cerca per a tot: persones, sessions, obres del repertori, materials i documents, anuncis, sortides i
// produccions. Sense accents ni majúscules; «12/10» troba les sessions d'aquell dia. S'obre amb la lupa de dalt, amb
// «/» o amb Cmd/Ctrl+K a l'ordinador.
const SR_MAX = 6;
function searchAll(q) {
  const n = normText(q);
  if (n.length < 2) return [];
  const has = (...xs) => xs.some(x => x && normText(x).includes(n));
  const out = [];
  const add = (group, items) => { if (items.length) out.push({ group, items: items.slice(0, SR_MAX), more: Math.max(0, items.length - SR_MAX) }); };
  add('Persones', membersOf(null, true).filter(m => has(m.name, fullName(m.name))).sort((a, b) => Number(a.active === false) - Number(b.active === false) || byName(a, b))
    .map(m => ({ t: m.name, s: `${SEC[m.section].name}${m.part ? ` ${m.part}` : ''}${m.active === false ? ' · inactiu' : ''}`, act: `data-act="member-stats" data-mid="${esc(m.id)}"` })));
  const ss = allSessions().filter(s => has(s.type, s.place, s.note, prodNames(s), longDate(s.date), ddmm(s.date), `${ddmm(s.date)}/${s.date.slice(0, 4)}`));
  add('Sessions', [...ss.filter(s => s.date >= TODAY), ...ss.filter(s => s.date < TODAY).reverse()]
    .map(s => ({ t: `${capz(longDate(s.date))}${s.time ? ` · ${s.time}` : ''}`, s: `${s.type || 'Assaig'} · ${prodNames(s)}${s.place ? ` · ${s.place}` : ''}`, act: `data-act="session-info" data-sid="${esc(s.id)}"` })));
  add('Repertori', worksSorted().filter(w => has(w.title, w.composer, w.arranger, ...(w.roles || []).map(r => r.name)))
    .map(w => ({ t: w.title, s: [w.composer, fmtDur(durSecs(w.duration)), w.voicing].filter(Boolean).join(' · '), act: `data-act="work-open" data-id="${esc(w.id)}"` })));
  const mats = [
    ...worksSorted().flatMap(w => (w.materials || []).map(x => ({ x, where: w.title, act: `data-act="file-open" data-src="work" data-pid="${esc(w.id)}" data-id="${esc(x.id)}"` }))),
    ...productionsSorted().flatMap(p => (p.materials || []).map(x => ({ x, where: p.name, act: `data-act="file-open" data-src="mat" data-pid="${esc(p.id)}" data-id="${esc(x.id)}"` }))),
    ...(S.config.documents || []).map(x => ({ x, where: 'Documents', act: `data-act="file-open" data-src="doc" data-id="${esc(x.id)}"` })),
  ].filter(({ x, where }) => has(x.title, where));
  add('Materials i documents', mats.map(({ x, where, act }) => ({ t: x.title, s: `${MAT_KINDS[x.kind] || DOC_KINDS[x.kind]?.[0] || 'Document'} · ${where}`,
    act: x.file ? act : `data-act="search-link" data-url="${esc(x.url || '')}"` })));
  add('Anuncis', visibleAnnouncements().filter(a => has(a.title, a.body)).map(a => ({ t: a.title, s: `${fullName(a.author)}${a.createdAt ? ` · ${ddmm(a.createdAt.slice(0, 10))}` : ''}`, act: 'data-act="search-go" data-tab="tauler" data-board="anuncis"' })));
  add('Sortides', tripsSorted().filter(t => has(t.title, t.place)).map(t => ({ t: t.title, s: `${capz(tripDates(t))}${t.place ? ` · ${t.place}` : ''}`, act: 'data-act="search-go" data-tab="tauler" data-board="sortides"' })));
  add('Produccions', productionsSorted().filter(p => has(p.name)).map(p => ({ t: p.name, s: `${allSessions(p.id).length} ${allSessions(p.id).length === 1 ? 'sessió' : 'sessions'}`, act: `data-act="search-go" data-tab="calendari" data-prod="${esc(p.id)}"` })));
  return out;
}
/** Marca el tros que coincideix (sense tenir en compte els accents). */
function searchMark(text, q) {
  const n = normText(q), src = String(text || '');
  const norm = [...src].map(ch => normText(ch) || ' ');
  const flat = norm.join('');
  const i = flat.indexOf(n);
  if (!n || i < 0 || norm.some(c => c.length !== 1)) return esc(src);
  return `${esc(src.slice(0, i))}<mark>${esc(src.slice(i, i + n.length))}</mark>${esc(src.slice(i + n.length))}`;
}
function sheetSearch() {
  openSheet({
    title: 'Cerca',
    wide: true,
    body: `<label class="sr-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input class="inp" id="sr-q" type="search" inputmode="search" autocomplete="off" placeholder="Persones, sessions, obres, materials…" aria-label="Cerca"></label>
      <div id="sr-res"><p class="sr-hint">Escriu com a mínim dues lletres. També pots buscar una data, com ara «12/10».</p></div>`,
    onMount: el => {
      const inp = el.querySelector('#sr-q'), box = el.querySelector('#sr-res');
      let timer = null;
      const draw = () => {
        const q = inp.value.trim();
        const res = searchAll(q);
        box.innerHTML = q.length < 2 ? '<p class="sr-hint">Escriu com a mínim dues lletres. També pots buscar una data, com ara «12/10».</p>'
          : res.length ? res.map(g => `<div class="sr-g"><h3>${esc(g.group)}</h3><div class="sr-list">${g.items.map(x => `<button class="sr-i" ${x.act}><b>${searchMark(x.t, q)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</button>`).join('')}</div>${g.more ? `<p class="sr-hint" style="margin-top:4px">I ${g.more} més: afina la cerca.</p>` : ''}</div>`).join('')
          : `<p class="sr-hint">No s’ha trobat res amb «${esc(q)}».</p>`;
      };
      inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.sr-i')?.click(); } });
      setTimeout(() => inp.focus(), 50);
    },
  });
}
