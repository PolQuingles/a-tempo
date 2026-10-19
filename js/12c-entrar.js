// A Tempo · 12c-entrar.js — Entrar amb l'enllaç del cor: l'enllaç (i el QR) que l'administració comparteix, la petició de qui
// hi entra triant el seu nom de la plantilla, i l'aprovació amb un toc.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- L'enllaç del cor ---------- */
// Abans calia recollir el correu de cada persona i donar-li accés una a una. Ara l'administració comparteix un enllaç (al
// grup del WhatsApp) o n'ensenya el QR a l'assaig: <app>?a=<agrupació>&uneix=<codi>. Qui l'obre entra amb el seu compte
// (Google o un altre correu), tria el seu nom de la llista i en demana l'accés; l'administració ho aprova i ja hi és.
//   join/<codi> = { active, name, secs, people: [{ id, n, sec }] }: la llista de qui encara no té accés, amb el nom i el primer
//     cognom. Només s'hi arriba sabent el codi: les regles no deixen fer la llista de codis.
//   joinReq/<correu> = { email, name, account, memberId, section, code, at }: la petició. Només la veuen la persona i
//     l'administració, que hi dona accés (staff/<correu>, com si l'hagués afegit a mà) o la rebutja (s'esborra).
// config/main.joinCode és el codi de l'enllaç d'ara: si se'n fa un de nou, el vell deixa de funcionar.
const LS_JOIN = 'atempo:uneix';   // { gid, code, at }: l'enllaç amb què s'ha obert l'app (sobreviu a l'entrada amb Google)
const JOIN_DAYS = 14;
const JOIN_CODE_RE = /^[a-z0-9]{10,40}$/;
const joinLinkUrl = code => `${location.origin}${location.pathname}?a=${encodeURIComponent(GID)}&uneix=${encodeURIComponent(code)}`;

/** L'enllaç amb què s'ha obert l'app o, si s'ha hagut d'entrar abans amb Google, el que s'havia obert (si encara val). */
function joinIntent() {
  const code = new URLSearchParams(location.search).get('uneix'), gid = urlGroup();
  if (code && gid && JOIN_CODE_RE.test(code)) {
    const v = { gid, code, at: Date.now() };
    try { localStorage.setItem(LS_JOIN, JSON.stringify(v)); } catch {}
    return v;
  }
  try {
    const v = JSON.parse(localStorage.getItem(LS_JOIN) || 'null');
    if (v && GID_RE.test(v.gid || '') && JOIN_CODE_RE.test(v.code || '') && Date.now() - (v.at || 0) < JOIN_DAYS * 864e5) return v;
  } catch {}
  return null;
}
const dropJoinIntent = () => { try { localStorage.removeItem(LS_JOIN); } catch {} };

/** El nom que surt a la llista per triar-s'hi: el nom i el primer cognom («Laia Dalmau»), amb les partícules («de la Fuente»). */
function joinName(m) {
  const key = nameSortKey(m);
  if (!key.includes(',')) return fullName(m.name);
  const [sur, given] = key.split(',').map(x => x.trim());
  const out = [];
  for (const w of sur.split(/\s+/)) { out.push(w); if (!/^(de|del|dels|la|les|el|els|d[’']|i|y|van|von|da|di)$/i.test(w)) break; }
  return `${given} ${out.join(' ')}`.trim();
}
/** Qui encara no té accés (i, per tant, pot entrar amb l'enllaç). */
const joinPeople = () => [...S.members.values()].filter(m => m.active !== false && !accountFor(m.id)).sort(byName)
  .map(m => ({ id: m.id, n: joinName(m).slice(0, 80), sec: m.section || '' }));

/* ---------- Qui obre l'enllaç ---------- */
let JOIN = null;   // { gid, code, step: loading | pick | sent | refused | bad, doc, req, q, pick, other, name, sec, busy }
let joinWatchers = [];
async function startJoin(join) {
  loadMarca(join.gid);
  JOIN = { ...join, step: 'loading', q: '', pick: '', other: false, name: S.userName || '', sec: '', busy: false };
  S.mode = 'join'; render();
  try {
    // Si l'administració ja hi ha donat accés (potser des d'un altre mòbil), s'hi entra directament.
    const mine = await fs.doc(`cors/${join.gid}/staff/${S.email}`).get();
    if (mine.exists) { enterJoined(join.gid); return; }
    const [d, r] = await Promise.all([
      fs.doc(`cors/${join.gid}/join/${join.code}`).get(),
      fs.doc(`cors/${join.gid}/joinReq/${S.email}`).get().catch(() => null),
    ]);
    JOIN.doc = d.exists ? d.data() : null;
    JOIN.req = r && r.exists ? r.data() : null;
    JOIN.step = !JOIN.doc || !JOIN.doc.active ? 'bad' : JOIN.req ? 'sent' : 'pick';
  } catch { JOIN.step = 'bad'; }
  render();
  if (JOIN.step === 'sent') watchJoin();
}
/** Ja té accés: l'agrupació passa a ser de les seves i s'hi entra. */
function enterJoined(gid) {
  joinWatchers.forEach(f => f()); joinWatchers = [];
  dropJoinIntent();
  if (!S.groups.some(g => g.id === gid)) { S.groups.push({ id: gid, name: JOIN?.doc?.name || '' }); saveGroupsCache(); }
  JOIN = null;
  history.replaceState(null, '', `${location.pathname}?a=${encodeURIComponent(gid)}`);
  enterGroup(gid);
  setTimeout(() => toast('Ja tens accés a l’app. Benvingut!'), 1200);
}
/** Mentre espera: quan l'administració hi dona accés, s'hi entra sol; si la rebutja, s'avisa. */
function watchJoin() {
  if (joinWatchers.length || !JOIN) return;
  const { gid } = JOIN;
  joinWatchers.push(fs.doc(`cors/${gid}/staff/${S.email}`).onSnapshot(d => { if (d.exists) enterJoined(gid); }, () => {}));
  joinWatchers.push(fs.doc(`cors/${gid}/joinReq/${S.email}`).onSnapshot(d => {
    if (!JOIN || JOIN.step !== 'sent' || d.exists || d.metadata?.hasPendingWrites) return;
    // L'administració hi ha donat accés (la petició s'esborra en crear el compte) o l'ha rebutjada.
    setTimeout(async () => {
      if (!JOIN) return;
      const mine = await fs.doc(`cors/${gid}/staff/${S.email}`).get().catch(() => null);
      if (mine && mine.exists) enterJoined(gid);
      else if (JOIN) { JOIN.step = 'refused'; JOIN.req = null; render(); }
    }, 1500);
  }, () => {}));
}
const joinSecName = id => (JOIN?.doc?.secs || []).find(x => x.id === id)?.name || id || '';
function joinListHtml() {
  const q = normText(JOIN.q || '');
  const people = (JOIN.doc?.people || []).filter(p => !q || normText(p.n).includes(q));
  if (!people.length) return `<p class="muted jn-none">${q ? 'Ningú amb aquest nom a la llista.' : 'A la llista no hi queda ningú sense accés.'} Toca «No em trobo a la llista».</p>`;
  // Per cordes, en l'ordre de l'agrupació (Sopranos, Contralts, Tenors, Baixos…).
  const order = (JOIN.doc?.secs || []).map(x => x.id);
  const secs = [...new Set(people.map(p => p.sec))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return secs.map(sec => `<div class="jn-sec"><span class="jn-sh">${esc(joinSecName(sec))}</span>
    ${people.filter(p => p.sec === sec).map(p => `<button type="button" class="jn-p" data-jn-pick="${esc(p.id)}" aria-pressed="${JOIN.pick === p.id}">${esc(p.n)}</button>`).join('')}</div>`).join('');
}
function viewJoin(hero) {
  const j = JOIN;
  const gname = j.doc?.name || shownName() || 'l’agrupació';
  const other = `<button class="btn btn-ghost" data-act="sign-out" style="justify-self:center">Entra amb un altre compte</button>`;
  if (j.step === 'loading') return `<section class="entry">${hero}<p class="entry-wait">Obrint l’enllaç…</p></section>`;
  if (j.step === 'bad') return `<section class="entry">${hero}<div class="login-card"><h2 class="h2">Aquest enllaç ja no funciona</h2>
      <p>L’administració ${esc(ofName(gname))} n’ha fet un de nou. Demana-li l’enllaç d’ara (o el QR) i torna-hi.</p>${other}</div></section>`;
  if (j.step === 'refused') return `<section class="entry">${hero}<div class="login-card"><h2 class="h2">No s’ha acceptat la petició</h2>
      <p>L’administració ${esc(ofName(gname))} no t’hi ha donat accés amb <b>${esc(S.email)}</b>. Si creus que és un error, parla-hi.</p>
      <button class="btn" data-act="jn-again" style="justify-self:center">Torna-ho a demanar</button>${other}</div></section>`;
  if (j.step === 'sent') {
    const who = j.req?.memberId ? (j.doc?.people || []).find(p => p.id === j.req.memberId)?.n || j.req.name : j.req?.name;
    return `<section class="entry">${hero}<div class="login-card"><h2 class="h2">Petició enviada</h2>
      <p>Has demanat entrar a l’app ${esc(ofName(gname))} com a <b>${esc(who || '')}</b>${j.req?.section ? ` (${esc(joinSecName(j.req.section))})` : ''}, amb <b>${esc(S.email)}</b>.</p>
      <p>Quan l’administració ho aprovi, entraràs sol a l’app. Pots tancar-la: t’hi esperarà.</p>
      <button class="btn" data-act="jn-again" style="justify-self:center">Canvia la petició</button>${other}</div></section>`;
  }
  const ready = j.other ? (j.name || '').trim().length > 2 && !!j.sec : !!j.pick;
  return `<section class="entry">${hero}<div class="login-card join-card">
      <h2 class="h2">Entra a l’app ${esc(ofName(gname))}</h2>
      <p>${S.userName ? `Hola, <b>${esc(firstName(S.userName))}</b>! ` : ''}Tria el teu nom de la llista. L’administració ho comprovarà i et donarà accés.</p>
      ${j.other ? `<label class="field"><span>El teu nom i cognoms</span><input class="inp" id="jn-name" type="text" maxlength="80" autocomplete="name" value="${esc(j.name || '')}"></label>
        <label class="field"><span>${esc(capz(j.doc?.secLabel || 'La teva corda'))}</span><select class="inp" id="jn-sec"><option value="">Tria-la</option>${(j.doc?.secs || []).map(x => `<option value="${esc(x.id)}" ${j.sec === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <button class="btn btn-ghost" data-act="jn-list" style="justify-self:start;padding-inline:0">Torna a la llista</button>`
      : `<input class="inp" id="jn-q" type="search" placeholder="Busca el teu nom" autocomplete="off" value="${esc(j.q || '')}" aria-label="Busca el teu nom">
        <div class="jn-list" id="jn-list" role="group" aria-label="Noms">${joinListHtml()}</div>
        <button class="btn btn-ghost" data-act="jn-other" style="justify-self:start;padding-inline:0">No em trobo a la llista</button>`}
      <button class="btn btn-primary" data-act="jn-send" ${ready && !j.busy ? '' : 'disabled'}>${j.busy ? 'Enviant…' : 'Demana l’accés'}</button>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:0">Entraràs amb <b>${esc(S.email)}</b>.</p>${other}
    </div></section>`;
}
function mountJoin(v) {
  const q = v.querySelector('#jn-q');
  if (q) q.oninput = () => { JOIN.q = q.value; v.querySelector('#jn-list').innerHTML = joinListHtml(); };
  const list = v.querySelector('#jn-list');
  if (list) list.onclick = e => { const b = e.target.closest('[data-jn-pick]'); if (!b) return; JOIN.pick = b.dataset.jnPick; render(); };
  const n = v.querySelector('#jn-name');
  if (n) n.oninput = () => { JOIN.name = n.value; v.querySelector('[data-act="jn-send"]').disabled = !(n.value.trim().length > 2 && JOIN.sec); };
  const sec = v.querySelector('#jn-sec');
  if (sec) sec.onchange = () => { JOIN.sec = sec.value; render(); };
}
async function sendJoin() {
  const j = JOIN;
  if (!j || j.busy) return;
  const person = !j.other ? (j.doc?.people || []).find(p => p.id === j.pick) : null;
  if (!j.other && !person) return;
  const req = { email: S.email, name: (j.other ? j.name : person.n).trim().slice(0, 120), account: (S.userName || '').slice(0, 120),
    memberId: person ? person.id : '', section: person ? person.sec : j.sec, code: j.code, at: new Date().toISOString() };
  j.busy = true; render();
  try {
    await fs.doc(`cors/${j.gid}/joinReq/${S.email}`).set(req);
    j.req = req; j.step = 'sent';
  } catch { toast('No s’ha pogut enviar. Comprova la connexió i torna-ho a provar.'); }
  j.busy = false; render();
  if (j.step === 'sent') watchJoin();
}
function joinAgain() {
  if (!JOIN) return;
  joinWatchers.forEach(f => f()); joinWatchers = [];
  JOIN.step = JOIN.doc && JOIN.doc.active !== false ? 'pick' : 'bad';
  JOIN.pick = JOIN.req?.memberId || ''; render();
}

/* ---------- L'administració: l'enllaç i el QR ---------- */
function randomJoinCode() {
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
}
/** Desa la llista de l'enllaç d'ara amb qui encara no té accés (es fa en obrir-lo i cada cop que algú hi entra). */
function joinDoc() {
  return { active: true, name: (S.config.name || '').slice(0, 120), secs: SECTIONS.map(x => ({ id: x.id, name: x.name })), secLabel: `La teva ${V.section || 'corda'}`,
    people: joinPeople(), at: new Date().toISOString(), by: S.email };
}
const refreshJoinDoc = () => S.config.joinCode ? db.doc(`join/${S.config.joinCode}`).set(joinDoc()).catch(() => {}) : Promise.resolve();
async function sheetJoinLink(fresh) {
  if (staffLoading()) return;
  let code = S.config.joinCode;
  if (fresh && code) await db.doc(`join/${code}`).set({ active: false }, { merge: true }).catch(() => {});
  if (!code || fresh) code = randomJoinCode();
  try { await db.doc(`join/${code}`).set(joinDoc()); }
  catch { toast('No s’ha pogut preparar l’enllaç. Torna-ho a provar.'); return; }
  if (S.config.joinCode !== code) saveConfig({ joinCode: code });
  const url = joinLinkUrl(code);
  const msg = `Ja podeu entrar a A Tempo, l’app ${ofName()}: obriu aquest enllaç, entreu amb el vostre compte de Google i trieu el vostre nom. ${url}`;
  const left = joinPeople().length;
  openSheet({
    title: 'Enllaç per entrar',
    body: `<p style="margin-top:0">Qui l’obri entra amb el seu compte de Google (o amb un altre correu), tria el seu nom de la llista i et demana l’accés. Tu l’aproves amb un toc, des d’Inici (a «Per fer»). Així no cal recollir els correus.</p>
      <div class="jn-qr" id="jn-qr" aria-label="Codi QR de l’enllaç"><span class="muted">Fent el QR…</span></div>
      <div class="linkbox" id="jn-url">${esc(url)}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts))">${left ? `A la llista per triar-s’hi hi ha les ${left} persones de la plantilla que encara no tenen accés.` : 'Tota la plantilla ja té accés: qui l’obri haurà de dir el seu nom.'} Si l’enllaç arriba a qui no toca, fes-ne un de nou: el d’ara deixarà de funcionar.</p>`,
    foot: `<button class="btn btn-danger-ghost" id="jn-off">Desactiva’l</button><button class="btn" id="jn-new">Fes-ne un de nou</button><span class="spacer"></span><button class="btn" id="jn-print">Imprimeix el QR</button><button class="btn btn-primary" id="jn-share">${navigator.share ? 'Comparteix' : 'Copia l’enllaç'}</button>`,
    onMount: el => {
      drawJoinQr(el.querySelector('#jn-qr'), url);
      el.querySelector('#jn-share').onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: `A Tempo · ${S.config.shortName || S.config.name || ''}`, text: msg }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        copyText(msg, 'Enllaç copiat: enganxa’l al grup');
      };
      el.querySelector('#jn-print').onclick = () => joinPoster(url);
      el.querySelector('#jn-new').onclick = async () => {
        if (await confirmSheet('Fer-ne un de nou?', 'L’enllaç i el QR d’ara deixaran de funcionar. Les peticions que ja t’han arribat es mantenen.', 'Fes-ne un de nou', false)) sheetJoinLink(true);
      };
      el.querySelector('#jn-off').onclick = async () => {
        if (!await confirmSheet('Desactivar l’enllaç?', 'Ningú més no podrà demanar l’accés amb aquest enllaç ni amb el QR. Quan vulguis, en pots fer un de nou.', 'Desactiva’l')) return;
        await db.doc(`join/${code}`).set({ active: false }, { merge: true }).catch(() => {});
        saveConfig({ joinCode: '' }); closeSheet(); toast('Enllaç desactivat');
      };
    },
  });
}
/** El QR, en SVG (la llibreria es carrega només quan cal, com el visor de PDF). */
const QRLIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
let qrReady = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrReady) qrReady = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = QRLIB; s.onload = () => window.qrcode ? ok(window.qrcode) : ko(new Error('qr')); s.onerror = () => { qrReady = null; ko(new Error('qr')); }; document.head.appendChild(s); });
  return qrReady;
}
async function joinQrSvg(url) {
  const lib = await loadQr();
  const qr = lib(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), m = 4, size = n + m * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Codi QR" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
async function drawJoinQr(box, url) {
  try { box.innerHTML = await joinQrSvg(url); }
  catch { box.innerHTML = '<span class="muted">No s’ha pogut fer el QR (cal connexió). L’enllaç de sota funciona igual.</span>'; }
}
/** El cartell per imprimir (o ensenyar a la pantalla de l'assaig): el QR gran i tres passos. */
async function joinPoster(url) {
  let svg = '';
  try { svg = await joinQrSvg(url); } catch { toast('Cal connexió per fer el QR'); return; }
  printDoc('Entra a l’app', `<div class="jn-poster"><h1>Entra a l’app ${esc(ofName())}</h1><div class="jn-qr big">${svg}</div>
    <ol><li>Enfoca el codi amb la càmera del mòbil i obre l’enllaç.</li><li>Entra amb el teu compte de Google (o amb un altre correu).</li><li>Tria el teu nom i demana l’accés: t’hi donarem en un moment.</li></ol>
    <p class="m">${esc(url)}</p></div>`);
}

/* ---------- L'administració: les peticions ---------- */
let joinReqWatch = null;
function watchJoinReqs() {
  if (joinReqWatch || !db || !isAdmin() || PREVIEW) return;
  joinReqWatch = db.collection('joinReq').onSnapshot(snap => {
    S.joinReq = new Map(snap.docs.map(d => [d.id, d.data()]));
    if (S.ready) scheduleRender();
  }, () => {});
}
const joinRequests = () => isAdmin() && !PREVIEW && S.joinReq ? [...S.joinReq.values()].sort((a, b) => (a.at || '').localeCompare(b.at || '')) : [];
function joinReqRow(r) {
  const mem = S.members.get(r.memberId || '');
  const has = S.staff.get(r.email);
  const free = [...S.members.values()].filter(m => m.active !== false && (!accountFor(m.id) || m.id === r.memberId)).sort(byName);
  return `<div class="jr" data-email="${esc(r.email)}">
    <div class="jr-h"><b>${esc(mem ? fullName(mem.name) : r.name)}</b><small>${esc([r.account && r.account !== r.name ? r.account : '', r.email].filter(Boolean).join(' · '))}${r.at ? ` · ${esc(shortDate(r.at.slice(0, 10)))}` : ''}</small></div>
    ${has ? '<p class="jr-w">Aquest correu ja té accés: pots esborrar la petició.</p>' : `<label class="field"><span>És…</span><select class="inp" data-jr-mem>
      ${free.map(m => `<option value="${esc(m.id)}" ${m.id === r.memberId ? 'selected' : ''}>${esc(fullName(m.name))} · ${esc(SEC[m.section].name)}</option>`).join('')}
      <option value="" ${r.memberId ? '' : 'selected'}>Una fitxa nova: ${esc(r.name)}${r.section ? ` · ${esc(SEC[r.section].name)}` : ''}</option></select></label>`}
    <div class="jr-a"><button class="btn btn-sm btn-danger-ghost" data-act="join-reject" data-email="${esc(r.email)}">${has ? 'Esborra-la' : 'Rebutja'}</button>${has ? '' : `<button class="btn btn-sm btn-primary" data-act="join-approve" data-email="${esc(r.email)}">Dona-li accés</button>`}</div>
  </div>`;
}
function sheetJoinReqs() {
  if (staffLoading()) return;
  const list = joinRequests();
  openSheet({
    title: 'Peticions per entrar',
    body: list.length ? `<p style="margin-top:0">Han obert l’enllaç del cor i han triat el seu nom. Comprova que sigui qui diu i dona-li accés: entrarà a l’app com a ${esc(V.member)}.</p><div class="jr-list">${list.map(joinReqRow).join('')}</div>`
      : '<p class="muted" style="margin:0">No hi ha cap petició per revisar.</p>',
    foot: `<button class="btn" data-act="join-link">L’enllaç i el QR</button><span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Fet</button>`,
  });
}
async function approveJoin(email, btn) {
  const r = S.joinReq?.get(email);
  if (!r || staffLoading()) return;
  const sel = btn?.closest('.jr')?.querySelector('[data-jr-mem]');
  const mid = sel ? sel.value : r.memberId || '';
  let mem = mid ? S.members.get(mid) : null;
  if (mem && accountFor(mem.id)) { toast(`${fullName(mem.name)} ja té accés amb un altre correu`); return; }
  const fresh = !mem;
  if (fresh) mem = { id: uid('m'), name: fullName(r.name), section: SEC_MAP[r.section] ? r.section : SECTIONS[0]?.id || '', leader: false, active: true, joined: TODAY, history: [{ date: TODAY, kind: 'alta', note: 'Ha entrat amb l’enllaç del cor' }] };
  if (btn) btn.disabled = true;
  try {
    await writeAccount({ email, name: fullName(mem.name), role: 'singer', roles: ['singer'], memberId: mem.id, addedAt: new Date().toISOString(), via: 'enllaç' });
    if (fresh) saveMember(mem);
    await db.doc(`joinReq/${email}`).delete().catch(() => {});
    S.joinReq?.delete(email);
    refreshJoinDoc();
    toast(`${firstName(fullName(mem.name))} ja té accés`);
  } catch { toast('No s’ha pogut donar l’accés. Torna-ho a provar.'); if (btn) btn.disabled = false; return; }
  joinRequests().length ? sheetJoinReqs() : closeSheet();
}
async function rejectJoin(email) {
  const r = S.joinReq?.get(email);
  if (!r) return;
  if (!S.staff.has(email) && !await confirmSheet('Rebutjar la petició?', `${esc(r.name)} (${esc(email)}) no tindrà accés. Si torna a obrir l’enllaç, ho podrà tornar a demanar.`, 'Rebutja-la')) { sheetJoinReqs(); return; }
  await db.doc(`joinReq/${email}`).delete().catch(() => {});
  S.joinReq?.delete(email);
  joinRequests().length ? sheetJoinReqs() : closeSheet();
}
