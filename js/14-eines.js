// A Tempo · 14-eines.js — Eines: primera vegada, qui ha entrat, correus, substituts, confirmacions, calendari subscrit, manual i recordatoris.
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
  const first = me ? me.name.split(',').pop().trim() : '';
  const body = canEdit()
    ? `<p style="margin-top:0">Hola${first ? `, ${esc(first)}` : ''}. Des d’aquí passaràs llista i gestionaràs ${esc(S.config.name || V.el)}.</p>
       <ul class="welcome"><li><b>Inici</b> · el que tens per fer (avisos per acceptar, llistes per acabar…) i la sessió d’avui.</li>
       <li><b>Assistència</b> · toca el quadre de la teva ${V.section} i marca cadascú; també hi ha les estadístiques i la norma.</li>
       <li><b>Calendari</b> · totes les sessions, per produccions.</li>
       <li><b>Tauler</b> · anuncis, partitures, documents i enquestes.</li>
       <li><b>El teu compte</b> · les teves inicials, a dalt a la dreta: la <b>Gestió</b> (personal, produccions i ajustos), avisos al mòbil, calendari, aparença i agrupacions.</li></ul>`
    : `<p style="margin-top:0">Hola${first ? `, ${esc(first)}` : ''}. Benvingut/da a l’app ${esc(ofName())}.</p>
       <ul class="welcome"><li><b>Inici</b> · el que tens per fer (convocatòries, enquestes), la sessió d’avui, la teva assistència i els teus avisos d’absència.</li>
       <li><b>Assistència</b> i <b>Calendari</b> · ho pots consultar tot, però no canviar-hi res.</li>
       <li><b>Tauler</b> · anuncis, partitures i àudios de la teva ${V.part}, i enquestes.</li></ul>`;
  openSheet({
    title: 'Com funciona',
    body: body + `<p class="muted" style="font-size:calc(13px*var(--ts))">Consell: al navegador del mòbil, tria <b>Afegeix a la pantalla d’inici</b> i la tindràs com una app.</p>`,
    foot: `${pushSupported() ? '<button class="btn" id="wc-push">Avisos al mòbil</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Entesos</button>`,
    onMount: el => { el.querySelector('#wc-push')?.addEventListener('click', () => { closeSheet(); sheetPush(); }); },
  });
}

/* ---------- Qui ha entrat i qui no ---------- */
const lastSeenOf = p => p && p.lastSeen ? p.lastSeen : null;
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
  const first = n => String(n || '').split(',').pop().trim();
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
        <ul class="mini-list" style="max-height:220px">${noAccount.map(m => `<li><span>${esc(m.name)}<br><span class="m">${SEC[m.section].name}</span></span><button class="btn btn-sm" data-act="staff-new">Dona-li accés</button></li>`).join('')}</ul>` : ''}
      ${inApp.length ? `<div class="section-title" style="margin-top:16px"><h2 class="h2">Ja hi entren</h2></div>
        <ul class="mini-list" style="max-height:260px">${inApp.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')).map(p => `<li><span>${esc(p.name || p.email)}<br><span class="m">${esc(rolesText(p))}${pushBy.get(p.email) ? ' · avisos actius' : ''}</span></span><span class="m">${agoText(p.lastSeen)}</span></li>`).join('')}</ul>` : ''}
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
    if (hasRole(p, 'singer') && !p.memberId) out.push({ kind: 'link', email: p.email, name: p.name, text: `${V.Member} sense fitxa de la plantilla` });
    if (p.memberId) {
      const m = S.members.get(p.memberId);
      if (!m) out.push({ kind: 'link', email: p.email, name: p.name, text: 'Vinculat a una fitxa que ja no hi és' });
      else if (m.active === false) out.push({ kind: 'inactive', email: p.email, name: p.name, text: `${m.name} ja no hi és (fitxa inactiva)` });
      if (seenMember.has(p.memberId)) out.push({ kind: 'dup', email: p.email, name: p.name, text: `Aquesta fitxa també és de ${seenMember.get(p.memberId)}` });
      else seenMember.set(p.memberId, p.email);
    }
  }
  return out;
}
function sheetMailCheck() {
  const probs = mailProblems();
  const { noAccount, roster } = accessReport();
  openSheet({
    title: 'Comprovació dels correus',
    wide: true,
    body: probs.length || noAccount.length
      ? `${probs.length ? `<div class="section-title" style="margin-top:0"><h2 class="h2">Per revisar</h2><span class="eyebrow">${probs.length}</span></div>
          <ul class="mini-list" style="max-height:none">${probs.map(x => `<li><span>${esc(x.name || x.email)}<br><span class="m mono">${esc(x.email)}</span></span>
            <span style="display:flex;gap:6px;align-items:center"><span class="m" style="text-align:right">${esc(x.text)}</span><button class="btn btn-sm" data-act="staff-edit" data-email="${esc(x.email)}">Obre</button></span></li>`).join('')}</ul>` : ''}
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
      <label class="field"><span>Substitut</span><select class="inp" id="sub-m"><option value="">—</option>${ms.map(m => `<option value="${m.id}" ${cur?.memberId === m.id ? 'selected' : ''}>${esc(m.name)}${accountFor(m.id) ? '' : ' (encara sense accés)'}</option>`).join('')}</select></label>`,
    foot: `${cur ? '<button class="btn btn-danger-ghost" id="sub-del">Treu el substitut</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="sub-save">Desa</button>`,
    onMount: el => {
      el.querySelector('#sub-save').onclick = async () => {
        const m = S.members.get(el.querySelector('#sub-m').value);
        if (!m) { toast('Tria qui passarà llista'); return; }
        const hasAccount = !!accountFor(m.id);
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
function rsvpAnswer(sid, answer, note = '') {
  const mid = myMemberId(), m = S.members.get(mid), s = sessionById(sid);
  if (!m || !s) return;
  const id = `${sid}_${mid}`;
  const rec = { sessionId: sid, memberId: mid, section: m.section, answer, note, at: new Date().toISOString(), uid: S.uid };
  S.rsvp.set(id, rec); persist('rsvp', id, rec, 10);
  toast(answer === 'yes' ? 'Confirmat: hi seràs' : 'Resposta enviada');
  render();
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
    const row = m => { const a = S.rsvp.get(`${sid}_${m.id}`); return `<li><span>${esc(m.name)}${a?.note ? `<br><span class="m">${esc(a.note)}</span>` : ''}</span><span class="rsvp ${a ? a.answer : 'none'}">${a ? (a.answer === 'yes' ? 'Sí' : 'No') : '—'}</span></li>`; };
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
      <p style="margin-top:0">Subscriu-te al calendari ${esc(ofName())} i tindràs tots els assajos i ${V.sh.els} a la teva app de calendari. Si canvia alguna cosa, s’actualitza sol (pot trigar unes hores).</p>
      <h3>iPhone, iPad o Mac</h3><p><a class="btn btn-sm btn-primary" href="${webcal}">Subscriu-t’hi</a></p>
      <h3>Android o Google Calendar</h3><p><a class="btn btn-sm btn-primary" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Obre Google Calendar</a></p>
      <p>Si no funciona, a Google Calendar (web) ves a <b>Altres calendaris › + › Des d’un URL</b> i enganxa aquesta adreça:</p>
      <div class="linkbox">${esc(https)}</div>
      <h3>Només un cop</h3>` : `<p style="margin-top:0">Aquesta agrupació no té el calendari subscrit activat${isAdmin() ? ': el pots activar a Gestió › Ajustos' : ''}.</p>`}
      <p>${on ? 'També' : 'Mentrestant'} pots descarregar el calendari ${me ? 'amb les sessions on estàs convocat/da' : 'actual'} i importar-lo (no s’actualitzarà sol).</p>
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
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function setBrandColor(c) { saveConfig({ brand: { ...(S.config.brand || {}), accent: c } }); render(); }

/* ---------- One-page manual ---------- */
function sheetHelp() {
  const staff = canEdit();
  const w = V;
  const body = staff ? `<div class="manual">
    <h3>Entrar</h3>
    <p>Tothom entra pel mateix enllaç amb <b>el seu correu</b>: amb Google o, si el correu no és de Google, creant una contrasenya («Entra amb un altre correu»). L’administració dona d’alta cada persona a <b>Gestió › Personal</b>, li envia la <b>invitació</b> per correu o WhatsApp i li dona un o més rols: administració, director, ${w.leader}, gerència, secretaria, ${esc(V.Teacher.toLowerCase())} o ${w.member}.</p>
    <p>L’administració ho pot fer tot. Direcció, ${w.leaders}, gerència i secretaria passen llista, publiquen anuncis i convocatòries i pugen materials i documents. ${w.Members} ho veuen tot en <b>mode lectura</b>. A <b>Inici</b> hi ha tot el que tens <b>per fer</b> i la sessió d’avui. El teu compte és a les teves inicials, a dalt a la dreta: un menú amb la <b>Gestió</b> per a qui edita (avisos d’absència, personal, produccions i ajustos; els camins «Gestió › …» d’aquesta ajuda comencen allà), els avisos al mòbil, el calendari, l’aparença, les agrupacions i el botó per sortir.</p>
    <h3>Passar llista</h3>
    <ul><li>A <b>Assistència</b> (o amb el botó <b>Passa llista</b> d’Inici) surt la sessió d’avui. Toca el quadre de la teva ${w.section}.</li>
    <li>Toca l’estat de cadascú: <b>Present</b>, <b>Retard</b>, <b>No justificada</b>, <b>Justificada</b> o <b>No fa</b>. Toca’l un altre cop per desmarcar.</li>
    <li>En un retard durant l’assaig, els minuts es calculen sols («Arriba ara»).</li>
    <li><b>Resta com a presents</b> marca de cop tothom qui falta per marcar.</li>
    <li>Sense cobertura pots continuar: es desa quan torni la connexió.</li>
    <li>Un punt vermell al quadre vol dir que hi ha llistes d’altres dies pendents.</li></ul>
    <h3>Si no hi ets: substitut</h3>
    <p>Dins la ${w.section}, <b>Substitut per avui</b>: tria qui passarà llista. Rebrà permís per fer-ho des del seu compte fins l’endemà.</p>
    <h3>Avisos d’absència</h3>
    <p>Els ${w.members} avisen des d’Inici. Surten a <b>Gestió › Avisos</b> i a la llista del dia. En acceptar-los, els dies queden com a falta justificada.</p>
    <h3>Convocatòries</h3>
    <p>A la fitxa d’una sessió (${w.sh.show}, viatge…) activa <b>Demana confirmació</b>. Els ${w.members} responen Sí/No i a la Llista veus el recompte.</p>
    <h3>Tauler</h3>
    <p><b>Anuncis</b> per a tothom o per ${w.sections}, <b>materials</b> de cada producció (partitures, àudios, vídeos), <b>documents</b> de tota la temporada i <b>enquestes</b> de disponibilitat. A les convocatòries i enquestes, <b>Recorda-ho</b> prepara missatges de WhatsApp per als que no han respost.</p>
    <p>Els fitxers (PDF, àudio, imatges, fins a 20 MB) es poden pujar directament des de l’ordinador o el mòbil, o bé posar-hi un enllaç.</p>
    <h3>Cerca, text gran i desfer</h3>
    <p>La <b>lupa</b> de dalt (o «/» i Cmd+K a l’ordinador) busca persones, sessions (també per data, com ara «12/10»), obres, materials, documents, anuncis, sortides i produccions. A <b>Aparença</b> hi ha la <b>mida del text</b> (normal, gran o molt gran). Esborrar un anunci, una enquesta, un material, una obra, una sortida, un missatge o un avís ja no demana confirmació: surt <b>Desfés</b> uns segons. Els cartells de cada producció es pugen a la seva fitxa (Gestió › Produccions) i surten a Inici, al calendari i a la fitxa ${w.sh.del}.</p>
    <h3>Missatges</h3>
    <p>A Inici, <b>Escriu</b> (administració, direcció, gerència i secretaria) envia un missatge a tothom o a les ${w.sections} que triïs, un anunci al tauler o una enquesta. Cada ${w.leader} hi té <b>Missatge a la ${w.section}</b>, que només arriba a la seva. Arriben a l’app i, a qui té els avisos activats, al mòbil: sense correus ni WhatsApp.</p>
    <h3>Notes de seguiment</h3>
    <p>A les estadístiques de cada ${w.member} (toca-li el nom) la direcció i el seu ${w.leader} hi poden deixar notes de seguiment: afinació, actitud, progressos. No les veu ningú més, ni la persona.</p>
    <h3>Secretaria</h3>
    <p>A <b>Gestió › Personal</b>: <b>Altes i baixes</b> (moviments de la temporada i antiguitat de cadascú; la data d’alta i la de baixa es posen a la fitxa), <b>Documents</b> (drets d’imatge, protecció de dades i autoritzacions, amb el document signat, i la llista de qui no pot sortir a fotos ni vídeos) i <b>Quotes</b> (qui ha pagat, quan i com). La plantilla sencera s’exporta a Excel.</p>
    <h3>Repertori i pla d’assaig</h3>
    <p>A <b>Tauler › Repertori</b> cada obra té una fitxa (compositor, durada, formació, partitures i àudios per ${w.section} i ${w.part}) i s’enllaça a les produccions on es fa, de manera que serveix d’una temporada a l’altra. A la fitxa hi poses <b>qui canta cada solo i cada petit grup</b>, i cadascú veu els seus.</p>
    <p>A la fitxa de cada sessió hi ha el <b>pla d’assaig</b>: quines obres i compassos, per a qui i una nota. El veuen tots els convocats a Inici i al Calendari, i després de l’assaig hi pots escriure què s’ha fet: qui no hi era ho veu a Inici.</p>
    <h3>Concerts</h3>
    <p>A la fitxa de cada ${w.sh.show}: l’<b>${w.balance.toLowerCase()}</b> segons qui ha confirmat (amb el mínim de cada ${w.section} d’Ajustos › Norma, i un avís a «Per fer» si en falta), la <b>col·locació</b> a l’escenari (per ${w.sections}, i després toques dos llocs per canviar-los) i la <b>llista de participants</b> en PDF o Excel, amb el telèfon, la talla i el contacte d’emergència, per al teatre o l’assegurança.</p>
    <h3>Sortides, certificats i memòria</h3>
    <p>A <b>Tauler › Sortides</b> hi ha les sortides i gires: cadascú s’hi apunta, i l’equip reparteix el transport i les habitacions i en treu les llistes. El <b>certificat d’assistència</b> és a les estadístiques de cada ${w.member} (en PDF), i la <b>memòria de la temporada</b>, a Gestió › Produccions.</p>
    <h3>Estadístiques i norma</h3>
    <p>Per producció, trimestre o temporada. La <b>norma del ${minAttendance()}%</b> avisa de qui no pot fer ${w.sh.el} o està en risc. A <b>Assistència › Risc</b> tens totes les produccions en curs i, des d’allà, la <b>${w.sh.list.toLowerCase()}</b>: qui hi pot ${w.play}, la ${w.balance.toLowerCase()} i els canvis fets a mà, amb el motiu.</p>
    <h3>Fitxa ${w.sh.del} i calendari</h3>
    <p>A la fitxa d’una sessió pots posar l’<b>hora de convocatòria</b>, el <b>vestuari</b>, el <b>punt de trobada</b> i què cal portar. La veuen tots els convocats i es pot copiar per al grup. Al <b>Calendari</b>, el botó <b>Mes</b> mostra la graella mensual.</p>
    <h3>${w.Members} i persones</h3>
    <p>A <b>Gestió › Personal</b> hi ha tothom, rol per rol: administració, direcció, gerència, secretaria, ${w.leaders}, ${esc(V.kind === 'cor' ? 'professors de cant' : 'professors')} i ${w.members}. De cada ${w.member}: ${w.section}, ${w.part}, baixes temporals amb dates i telèfon. L’accés a l’app es dona amb el correu, a dalt de tot de <b>Personal</b> (<b>+ Persona</b> o <b>Enganxa una llista</b>); la llista <b>Amb accés</b> diu qui pot entrar i qui encara no ho ha fet. Amb <b>Mira-ho com un ${w.member}</b> comproves què veu cadascú; <b>Qui ha entrat</b> i <b>Comprova els correus</b> t’ajuden a fer que tothom hi entri.</p>
    <h3>Tipus d’agrupació i ${w.sections}</h3>
    <p>A <b>Ajustos › Agrupació</b> tries si és un cor, una orquestra, una banda, una cobla, un grup de cambra o una altra agrupació: canvien les paraules de l’app i els tipus de sessió. A <b>Ajustos › ${w.Sections}</b> en canvies els noms i les abreviatures, n’afegeixes o en treus. El nom, el tipus, les ${w.sections} i la imatge només els pot canviar un <b>Usuari Pro</b> que administri l’agrupació.</p>
    <h3>${esc(V.classes)}</h3>
    <p>Si l’agrupació fa classes individuals, s’activen a <b>Ajustos › ${esc(V.classes)}</b>. Qui tingui el rol de <b>${esc(V.Teacher.toLowerCase())}</b> fa el calendari: crea un dia, genera les hores seguides i hi posa qui ve a cadascuna. Cada ${w.member} hi veu la seva hora i pot <b>avisar que arribarà tard</b>, que <b>no hi anirà</b> o <b>demanar el canvi d’hora d’un dia</b> a un company, que l’ha d’acceptar. El ${esc(V.Teacher.toLowerCase())} rep tots aquests avisos al mòbil.</p>
    <p>Un canvi d’hora es pot demanar a algú concret o deixar-lo <b>obert</b>: llavors el veuen tots els qui tenen classe aquell dia i se’l queda el primer que digui que sí. Si una hora ha quedat <b>lliure</b>, qualsevol la pot demanar per recuperar una classe, i el ${esc(V.Teacher.toLowerCase())} l’hi dona amb un toc. Un dia sencer es pot <b>anul·lar</b>, i s’avisa tothom qui hi tenia hora. Cadascú pot <b>subscriure’s a les seves classes</b> des del calendari del mòbil, i si una classe cau dins d’un assaig l’app ho avisa.</p>
    <p>A cada hora, el ${esc(V.Teacher.toLowerCase())} hi <b>marca l’assistència</b> (present, retard, justificada o no justificada) i hi pot deixar una <b>nota</b> del que s’ha treballat i del que cal preparar: la nota només la veuen ell i aquell ${w.member}. A <b>Horari fix</b> hi ha l’hora setmanal de cadascú, i des d’allà es generen els dies de tot un trimestre de cop, saltant els festius.</p>
    <h3>Més d’una agrupació</h3>
    <p>Amb el mateix compte pots ser a diverses agrupacions: toca el nom a dalt de tot, o <b>Ajustos › Agrupacions</b>, per canviar-ne. Els <b>Usuaris Pro</b> també hi poden <b>crear una agrupació nova</b>, de la qual en són l’administrador/a. Cada agrupació té les seves dades, i ningú d’una altra no les pot veure.</p>
    <h3>Avisos al mòbil</h3>
    <p>Cadascú se’ls activa al seu aparell. L’app avisa dels anuncis nous, del material nou, de les convocatòries sense resposta, de les enquestes que es tanquen i, si es vol, de l’assaig de l’endemà. Als ${w.leaders}, també de les llistes a mitges i de qui baixa de la norma. Mai de nit. Al iPhone cal afegir abans l’app a la pantalla d’inici.</p>
    <h3>Còpies de seguretat</h3>
    <p>Cada nit es guarda automàticament una còpia de totes les dades en un lloc privat. També pots descarregar-ne una a Ajustos › Dades.</p>
    <h3>Pantalla d’inici</h3>
    <p>Al navegador del mòbil, tria <b>Afegeix a la pantalla d’inici</b> per tenir-la com una app, amb la icona de l’agrupació.</p>
  </div>` : `<div class="manual">
    <h3>Entrar</h3>
    <p>Entres amb <b>el teu correu</b>, sempre pel mateix enllaç: amb Google o, si el teu correu no és de Google, amb «Entra amb un altre correu» i la teva contrasenya. Si l’oblides, la pots recuperar des d’allà mateix. Afegeix l’enllaç a la pantalla d’inici del mòbil i el tindràs com una app.</p>
    <h3>Què hi pots fer</h3>
    <p>Pots consultar <b>tota l’app</b>: l’assistència de totes les ${w.sections} (llistes i estadístiques), el calendari i el tauler. No pots canviar-hi res. Al <b>teu espai</b> sí que pots avisar d’absències, confirmar convocatòries i respondre enquestes.</p>
    <h3>Avisar d’una absència</h3>
    <p><b>Avisa d’una absència</b>, tria els dies i explica el motiu. El teu ${w.leader} l’acceptarà o no; ho veuràs a Inici, a «Els meus avisos».</p>
    <h3>Convocatòries</h3>
    <p>Quan hi hagi ${w.sh.show === 'concert' ? 'un concert' : 'una actuació'} o un viatge, respon <b>Hi seré</b> o <b>No hi podré anar</b> abans de la data límit.</p>
    <h3>La meva assistència</h3>
    <p>A Inici veus el teu percentatge d’assistència i quantes faltes et pots permetre abans ${w.sh.del}, per complir la norma del ${minAttendance()}%.</p>
    <h3>Tauler</h3>
    <p>Anuncis, el <b>repertori</b> (cada obra amb les partitures i els àudios de la teva ${w.part}, i els solos i petits grups on surts), documents de la temporada, enquestes i <b>sortides</b>, on t’hi pots apuntar.</p>
    <p>Els àudios d’estudi es poden escoltar <b>més lents</b> i <b>repetir un fragment</b>. I amb «Desa’ls al mòbil» tens les partitures i els àudios sense cobertura.</p>
    <h3>Cerca i text gran</h3>
    <p>La <b>lupa</b> de dalt busca persones, sessions (també per data, com ara «12/10»), obres i materials. A les teves inicials › <b>Aparença</b> pots fer el text més gran.</p>
    <h3>Missatges</h3>
    <p>Els missatges del teu ${w.leader} i de l’equip surten a Inici i t’arriben al mòbil si tens els avisos activats.</p>
    <h3>Pla d’assaig i la meva fitxa</h3>
    <p>A cada assaig veus què s’hi farà (obres i compassos) per preparar-ho, i si hi has faltat, què s’hi va fer. A les teves inicials, <b>La meva fitxa</b>: el telèfon, la talla de vestuari, un contacte d’emergència i els consentiments (drets d’imatge i protecció de dades), que només veu l’equip. Hi veus també si tens la quota pagada.</p>
    <h3>Fitxa ${w.sh.del}</h3>
    <p>Toca <b>Fitxa ${w.sh.del}</b> per veure l’hora de convocatòria, el vestuari i el punt de trobada. També la tens al Calendari, que pots veure per llista o per <b>mes</b>.</p>
    <h3>Avisos al mòbil</h3>
    <p>Activa’ls des del teu compte (les teves inicials, a dalt a la dreta) i t’assabentaràs dels anuncis i de les convocatòries sense haver d’obrir l’app. Tries de què vols que t’avisi i mai no t’escriu de nit. Si tens iPhone, abans has d’afegir l’app a la pantalla d’inici.</p>
    <h3>Calendari</h3>
    <p>A <b>Calendari</b> tens totes les sessions.${icsOn() ? ' Amb <b>Subscriu-t’hi</b> les tindràs a l’app de calendari del mòbil.' : ''}</p>
    <h3>Si fas de substitut</h3>
    <p>A Inici et sortirà «Avui passes llista de…». Toca <b>Passa llista</b> i marca els teus companys de ${w.section}.</p>
    ${S.groups.length > 1 ? '<h3>Diverses agrupacions</h3><p>Toca el nom a dalt de tot per canviar d’agrupació.</p>' : ''}
  </div>`;
  openSheet({ title: 'Com funciona', body: body + `<div class="panel" style="margin-top:18px">${themeRow()}</div>`, foot: pushSupported() ? '<span class="spacer"></span><button class="btn" data-act="push-setup">Avisos al mòbil</button>' : '' });
}

/* ---------- Board sheets ---------- */
const sectionPickers = (id, chosen) => `<div class="pickers" id="${id}">${SECTIONS.map(x => secPick(x, (chosen || []).includes(x.id))).join('')}</div>`;
const bindToggles = (el, sel) => el.querySelectorAll(`${sel} .pick`).forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
const readSections = (el, sel) => { const v = $$(`${sel} .pick[aria-pressed="true"]`, el).map(b => b.dataset.sec); return v.length && v.length < SECTIONS.length ? v : []; };
const authorName = () => S.me?.name || S.me?.email || 'Equip';

function sheetAnnouncement(id) {
  const ex = id ? S.announcements.get(id) : null;
  const a = ex ? { ...ex } : { id: uid('n'), title: '', body: '', pinned: false, sections: [], until: '' };
  openSheet({
    title: ex ? 'Edita l’anunci' : 'Nou anunci',
    body: `<div class="kv">
      <label class="field"><span>Títol</span><input class="inp" id="an-title" maxlength="90" value="${esc(a.title)}" placeholder="p. ex. Dimecres, assaig a la Sala d’Orquestra"></label>
      <label class="field"><span>Text</span><textarea class="inp" id="an-body" maxlength="1500" placeholder="Els enllaços es poden clicar.">${esc(a.body)}</textarea></label>
      <div class="field"><span>Per a (si no en tries cap, per a tothom)</span>${sectionPickers('an-secs', a.sections)}</div>
      <label class="field"><span>Visible fins al (opcional)</span><input class="inp" id="an-until" type="date" value="${esc(a.until || '')}"></label>
      <div class="toggle-row"><span><b>Fixat a dalt</b></span><label class="switch"><input type="checkbox" id="an-pin" ${a.pinned ? 'checked' : ''}><span></span></label></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="an-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="an-save">${ex ? 'Desa' : 'Publica'}</button>`,
    onMount: el => {
      bindToggles(el, '#an-secs');
      el.querySelector('#an-save').onclick = () => {
        const title = el.querySelector('#an-title').value.trim();
        if (!title) { toast('Posa un títol a l’anunci'); return; }
        const rec = { ...a, title, body: el.querySelector('#an-body').value.trim(), sections: readSections(el, '#an-secs'), until: el.querySelector('#an-until').value, pinned: el.querySelector('#an-pin').checked,
          author: ex?.author || authorName(), createdAt: ex?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        S.announcements.set(rec.id, rec); persist('announcements', rec.id, rec, 10);
        closeSheet(); toast(ex ? 'Anunci desat' : 'Anunci publicat'); render();
      };
      el.querySelector('#an-del')?.addEventListener('click', async () => {
        const before = clone(a);
        S.announcements.delete(a.id); persist('announcements', a.id, null, 10); closeSheet(); render();
        undoable('Anunci esborrat', () => { S.announcements.set(before.id, before); persist('announcements', before.id, before, 10); });
      });
    },
  });
}

function sheetMaterial(pid, id) {
  const prods = productionsSorted();
  const prodId = pid || ui.matProd || currentProductionId();
  const ex = id ? (S.productions.get(prodId)?.materials || []).find(x => x.id === id) : null;
  const m = ex ? { ...ex } : { id: uid('mt'), title: '', url: '', kind: 'partitura', section: '', part: '' };
  openSheet({
    title: ex ? 'Edita el material' : 'Nou material',
    body: `<div class="kv">
      <label class="field"><span>Producció</span><select class="inp" id="mt-prod" ${ex ? 'disabled' : ''}>${prods.map(p => `<option value="${p.id}" ${p.id === prodId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      ${sourceFields('mt', m)}
      <label class="field"><span>Títol</span><input class="inp" id="mt-title" maxlength="90" value="${esc(m.title)}" placeholder="p. ex. O Fortuna – partitura"></label>
      <div class="field"><span>Tipus</span><div class="pickers" id="mt-kind">${Object.entries(MAT_KINDS).map(([k, l]) => `<button type="button" class="pick" data-k="${k}" aria-pressed="${m.kind === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Per a</span><div class="pickers" id="mt-sec"><button type="button" class="pick" data-sec="" aria-pressed="${!m.section}">${capz(V.tot)}</button>${SECTIONS.map(x => `<button type="button" class="pick" data-sec="${esc(x.id)}" aria-pressed="${m.section === x.id}" title="${esc(x.name)}"><span class="vl">${esc(x.short)}</span></button>`).join('')}</div></div>
      <div class="field"><span>${V.Part} (opcional)</span><div class="pickers" id="mt-part"><button type="button" class="pick" data-part="" aria-pressed="${!m.part}">Totes</button>${['1', '2'].map(v => `<button type="button" class="pick" data-part="${v}" aria-pressed="${m.part === v}">${v}</button>`).join('')}</div></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="mt-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="mt-save">Desa</button>`,
    onMount: el => {
      const single = sel => el.querySelectorAll(`${sel} .pick`).forEach(b => b.onclick = () => el.querySelectorAll(`${sel} .pick`).forEach(x => x.setAttribute('aria-pressed', x === b)));
      single('#mt-kind'); single('#mt-sec'); single('#mt-part');
      const title = el.querySelector('#mt-title');
      const src = bindSource(el, 'mt', f => {
        if (!title.value.trim()) title.value = titleFromFile(f.name);
        const k = fileKind(f);
        const guess = k === 'PDF' ? 'partitura' : k === 'Àudio' ? 'audio' : k === 'Vídeo' ? 'video' : null;
        if (guess) el.querySelectorAll('#mt-kind .pick').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === guess));
      });
      const saveTo = (p, list) => { const next = { ...p, materials: list }; saveProduction(next); };
      el.querySelector('#mt-save').onclick = async e => {
        if (!title.value.trim() && !src.picked()) { toast('Posa un títol'); return; }
        const got = await resolveSource(src, m, e.currentTarget);
        if (!got) return;
        const rec = { id: m.id, title: title.value.trim() || titleFromFile(got.file?.name || ''), url: got.url, kind: el.querySelector('#mt-kind .pick[aria-pressed="true"]').dataset.k,
          section: el.querySelector('#mt-sec .pick[aria-pressed="true"]').dataset.sec, part: el.querySelector('#mt-part .pick[aria-pressed="true"]').dataset.part,
          at: m.at || new Date().toISOString(), by: m.by || S.me?.email || '' };
        if (got.file) rec.file = got.file;
        if (m.file && m.file.id !== got.file?.id) deleteFile(m.file);
        const p = S.productions.get(el.querySelector('#mt-prod').value);
        saveTo(p, [...(p.materials || []).filter(x => x.id !== rec.id), rec]);
        ui.matProd = p.id; closeSheet(); toast(got.file && got.file !== m.file ? 'Fitxer pujat i desat' : 'Material desat'); render();
      };
      el.querySelector('#mt-del')?.addEventListener('click', async () => {
        const p = S.productions.get(prodId), before = p.materials || [];
        saveTo(p, before.filter(x => x.id !== m.id)); closeSheet(); render();
        undoable('Material esborrat', () => saveTo(S.productions.get(prodId), before), () => deleteFile(m.file));
      });
    },
  });
}

function sheetPoll(id) {
  const ex = id ? S.polls.get(id) : null;
  const p = ex ? { ...ex } : { id: uid('q'), title: '', description: '', options: [], multi: true, sections: [], closesAt: '', closed: false };
  openSheet({
    title: ex ? 'Edita l’enquesta' : 'Nova enquesta',
    body: `<div class="kv">
      <label class="field"><span>Pregunta</span><input class="inp" id="pl-title" maxlength="120" value="${esc(p.title)}" placeholder="p. ex. Quin dissabte podeu fer assaig extra?"></label>
      <label class="field"><span>Explicació (opcional)</span><textarea class="inp" id="pl-desc" maxlength="600" style="min-height:70px">${esc(p.description || '')}</textarea></label>
      <label class="field"><span>Opcions, una per línia</span><textarea class="inp" id="pl-opts" placeholder="Dissabte 7 de novembre, 10–14 h&#10;Dissabte 14 de novembre, 10–14 h&#10;Diumenge 15 de novembre, 17–20 h">${esc((p.options || []).map(o => o.label).join('\n'))}</textarea>
        ${ex ? '<small>Si canvies el text d’una opció, es mantenen els vots de les que no hagis tocat.</small>' : ''}</label>
      <div class="toggle-row"><span><b>Es poden triar diverses opcions</b></span><label class="switch"><input type="checkbox" id="pl-multi" ${p.multi ? 'checked' : ''}><span></span></label></div>
      <div class="field"><span>Per a (si no en tries cap, per a tothom)</span>${sectionPickers('pl-secs', p.sections)}</div>
      <label class="field"><span>Respondre fins al (opcional)</span><input class="inp" id="pl-close" type="date" value="${esc(p.closesAt || '')}"></label>
      ${ex ? `<div class="toggle-row"><span><b>Tancada</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Ja no s’hi pot respondre</span></span><label class="switch"><input type="checkbox" id="pl-closed" ${p.closed ? 'checked' : ''}><span></span></label></div>` : ''}
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="pl-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pl-save">${ex ? 'Desa' : 'Publica'}</button>`,
    onMount: el => {
      bindToggles(el, '#pl-secs');
      el.querySelector('#pl-save').onclick = () => {
        const title = el.querySelector('#pl-title').value.trim();
        const labels = el.querySelector('#pl-opts').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        if (!title) { toast('Escriu la pregunta'); return; }
        if (labels.length < 2) { toast('Hi ha d’haver almenys dues opcions'); return; }
        const old = new Map((p.options || []).map(o => [o.label, o.id]));
        const options = labels.map(l => ({ id: old.get(l) || uid('o'), label: l }));
        const rec = { ...p, title, description: el.querySelector('#pl-desc').value.trim(), options, multi: el.querySelector('#pl-multi').checked,
          sections: readSections(el, '#pl-secs'), closesAt: el.querySelector('#pl-close').value, closed: ex ? el.querySelector('#pl-closed').checked : false,
          author: ex?.author || authorName(), createdAt: ex?.createdAt || new Date().toISOString() };
        S.polls.set(rec.id, rec); persist('polls', rec.id, rec, 10);
        closeSheet(); toast(ex ? 'Enquesta desada' : 'Enquesta publicada'); render();
      };
      el.querySelector('#pl-del')?.addEventListener('click', async () => {
        const before = clone(p), votes = [...S.pollVotes].filter(([, v]) => v.pollId === p.id).map(([k, v]) => [k, clone(v)]);
        S.polls.delete(p.id); persist('polls', p.id, null, 10);
        for (const [k] of votes) { S.pollVotes.delete(k); persist('pollVotes', k, null, 30); }
        closeSheet(); render();
        undoable('Enquesta esborrada', () => { S.polls.set(before.id, before); persist('polls', before.id, before, 10); for (const [k, v] of votes) { S.pollVotes.set(k, v); persist('pollVotes', k, v, 30); } });
      });
    },
  });
}
function votePoll(id) {
  const p = S.polls.get(id), box = $(`[data-poll="${id}"]`);
  if (!p || !box) return;
  const choices = $$('input:checked', box).map(i => i.value);
  if (!choices.length) { toast('Tria almenys una opció'); return; }
  const m = S.members.get(myMemberId());
  const key = `${id}_${m.id}`;
  const rec = { pollId: id, memberId: m.id, section: m.section, choices, at: new Date().toISOString(), uid: S.uid };
  S.pollVotes.set(key, rec); persist('pollVotes', key, rec, 10);
  toast('Resposta desada'); render();
}
function sheetPollResults(id) {
  const p = S.polls.get(id);
  if (!p) return;
  const label = Object.fromEntries((p.options || []).map(o => [o.id, o.label]));
  const block = x => {
    const ms = membersOf(x.id);
    const rows = ms.map(m => { const v = S.pollVotes.get(`${id}_${m.id}`); return `<li><span>${esc(m.name)}${v ? `<br><span class="m">${v.choices.map(c => esc(label[c] || '—')).join(' · ')}</span>` : ''}</span><span class="rsvp ${v ? 'yes' : 'none'}">${v ? 'Ha respost' : '—'}</span></li>`; }).join('');
    return `<div class="eyebrow" style="margin:14px 0 4px">${x.name}</div><ul class="mini-list" style="max-height:none">${rows}</ul>`;
  };
  openSheet({ title: p.title, body: SECTIONS.filter(x => !p.sections?.length || p.sections.includes(x.id)).map(block).join('') });
}

/* ---------- WhatsApp reminders ---------- */
function sheetReminder(title, pending, messageFor) {
  const bySec = SECTIONS.map(x => [x, pending.filter(m => m.section === x.id)]).filter(([, l]) => l.length);
  const first = m => m.name.split(',').pop().trim();
  const phone = m => (m.phone || '').replace(/[^0-9]/g, '').replace(/^(\d{9})$/, '34$1');
  const group = `${title}\n\nFalten per respondre:\n${bySec.map(([x, l]) => `${x.name}: ${l.map(first).join(', ')}`).join('\n')}\n\nPodeu respondre a l’app: ${appUrl()}`;
  openSheet({
    title: 'Recordatori',
    body: pending.length ? `<p style="margin-top:0">${pending.length} persones encara no han respost. Envia’ls un missatge individual o copia’n un per al grup.</p>
      ${bySec.map(([x, l]) => `<div class="eyebrow" style="margin:14px 0 4px">${x.name}</div><ul class="mini-list remind-list" style="max-height:none">${l.map(m => {
        const msg = messageFor(m);
        return `<li><span>${esc(m.name)}${accountFor(m.id) ? '' : '<br><span class="m">Encara no té accés a l’app</span>'}</span>
          <span style="display:flex;gap:4px">${phone(m) ? `<a class="btn btn-sm" href="https://wa.me/${phone(m)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="btn btn-sm" data-copy="${esc(msg)}">Copia</button></span></li>`;
      }).join('')}</ul>`).join('')}
      <p class="muted" style="font-size:calc(13px*var(--ts))">Per enviar WhatsApp directament, cal tenir el telèfon a la fitxa de cadascú.</p>`
      : '<p style="margin:0">Tothom ha respost.</p>',
    foot: pending.length ? '<button class="btn btn-primary" id="rm-group">Copia el missatge per al grup</button>' : '',
    onMount: el => {
      el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyText(b.dataset.copy, 'Missatge copiat'));
      el.querySelector('#rm-group')?.addEventListener('click', () => copyText(group, 'Missatge per al grup copiat'));
    },
  });
}
function remindRsvp(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const pending = SECTIONS.filter(x => convoked(s, x.id)).flatMap(x => membersOf(x.id)).filter(m => !isOut(s, m) && !S.rsvp.get(`${sid}_${m.id}`));
  const what = `${s.type} del ${longDate(s.date).toLowerCase()}${s.place ? ` (${s.place})` : ''}`;
  sheetReminder(`Recordatori: confirmeu si veniu al ${what}${s.rsvpBy ? `, abans del ${ddmm(s.rsvpBy)}` : ''}.`, pending,
    m => `Hola ${m.name.split(',').pop().trim()}! Recorda confirmar si vens al ${what}${s.rsvpBy ? ` abans del ${ddmm(s.rsvpBy)}` : ''}. Respon aquí: ${appUrl()}`);
}
function remindPoll(id) {
  const p = S.polls.get(id);
  if (!p) return;
  const pending = pollExpected(p).filter(m => !S.pollVotes.get(`${id}_${m.id}`));
  sheetReminder(`Recordatori: responeu l’enquesta «${p.title}»${p.closesAt ? ` abans del ${ddmm(p.closesAt)}` : ''}.`, pending,
    m => `Hola ${m.name.split(',').pop().trim()}! Tens pendent l’enquesta «${p.title}»${p.closesAt ? ` (fins al ${ddmm(p.closesAt)})` : ''}. Respon-la aquí, a Tauler › Enquestes: ${appUrl()}`);
}

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
  add('Persones', membersOf(null, true).filter(m => has(m.name, fullName(m.name))).sort((a, b) => (a.active === false) - (b.active === false) || byName(a, b))
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
  add('Anuncis', visibleAnnouncements().filter(a => has(a.title, a.body)).map(a => ({ t: a.title, s: `${a.author || ''}${a.createdAt ? ` · ${ddmm(a.createdAt.slice(0, 10))}` : ''}`, act: 'data-act="search-go" data-tab="tauler" data-board="anuncis"' })));
  add('Sortides', tripsSorted().filter(t => has(t.title, t.place)).map(t => ({ t: t.title, s: `${capz(tripDates(t))}${t.place ? ` · ${t.place}` : ''}`, act: 'data-act="search-go" data-tab="tauler" data-board="sortides"' })));
  add('Produccions', productionsSorted().filter(p => has(p.name)).map(p => ({ t: p.name, s: `${allSessions(p.id).length} sessions`, act: `data-act="search-go" data-tab="calendari" data-prod="${esc(p.id)}"` })));
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
