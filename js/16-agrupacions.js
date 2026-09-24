// A Tempo · 16-agrupacions.js — Agrupacions: triar-ne, crear-ne, plataforma i directori.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Agrupacions: triar-ne, crear-ne i plataforma ================= */
const LS_GROUPS = 'atempo:agrupacions';
const LS_INTENT = 'atempo:intencio';
const groupName = g => g.name || (g.id === GID ? S.config.name : '') || 'Agrupació';
/** «del Cor Jove», «de l’Orquestra de Cambra», «de la Banda Municipal»: the group's own name with the right article. */
function ofName(name = S.config.name) {
  const n = String(name || '').trim();
  if (!n) return V.del;
  const w = normText(n.split(/\s+/)[0]);
  const vowel = /^[aeiouh]/.test(w);
  if (/^(cor|cors|grup|quartet|trio|quintet|sextet|octet|conjunt|orfeo|esbart|ensemble|cant)$/.test(w)) return vowel ? `de l’${n}` : `del ${n}`;
  if (/^(orquestra|agrupacio|associacio|escola|entitat|coral|banda|cobla|colla|capella|schola|filharmonica|jove)$/.test(w)) return vowel ? `de l’${n}` : `de la ${n}`;
  return `de ${n}`;
}
function groupList() {
  return `<ul class="groups">${S.groups.map(g => `<li><button class="group-card" data-act="group-go" data-gid="${esc(g.id)}" ${g.id === GID && S.mode === 'shared' ? 'aria-current="true"' : ''}>
      ${groupAvatar({ ...g, name: groupName(g) })}
      <span class="g-t"><b>${esc(groupName(g))}</b><small>${esc([KINDS[g.kind]?.label, g.status === 'suspended' ? 'Suspesa' : '', g.id === GID && S.mode === 'shared' ? 'Ara hi ets' : ''].filter(Boolean).join(' · ') || ' ')}</small></span>
      ${ICON.go}</button></li>`).join('')}</ul>`;
}
function viewPick(hero) {
  const first = (S.userName || '').split(' ')[0];
  return `<section class="entry">${hero}
    <div class="login-card group-pick">
      <h2 class="h2">Tria l’agrupació</h2>
      <p>${first ? `Hola, ${esc(first)}. ` : ''}Formes part de més d’una agrupació. Després podràs canviar-ne tocant el nom a dalt de tot.</p>
      <div id="gr-list">${groupList()}</div>
      ${S.pro ? '<button class="btn btn-ghost" data-act="group-create" style="justify-self:center">+ Crea una agrupació nova</button>' : ''}
    </div>
    <button class="btn btn-sm btn-ghost" data-act="sign-out">Tanca la sessió</button>
  </section>`;
}
function viewSuspended(hero) {
  const others = S.groups.filter(g => g.id !== GID);
  return `<section class="entry">${hero}
    <div class="login-card"><h2 class="h2">Aquesta agrupació està suspesa</h2>
      <p>Ara mateix no s’hi pot entrar. Si creus que és un error, parla amb qui porta ${esc(PLATFORM.name)}.</p>
      ${others.length ? '<button class="btn btn-primary" data-act="groups">Canvia d’agrupació</button>' : ''}
      <button class="btn btn-ghost" data-act="sign-out" style="justify-self:center">Tanca la sessió</button></div>
  </section>`;
}
/** Groups of this account: the index, plus the old single pointer of the first group (from before groups). */
async function myGroups(email) {
  let list = [];
  const [idx, old] = await Promise.all([
    fs.collection(`staffIndex/${email}/agrupacions`).get().catch(e => { if (e && e.code === 'permission-denied') return null; throw e; }),
    fs.doc(`staffIndex/${email}`).get(),
  ]);
  if (idx) list = idx.docs.map(d => ({ id: d.id, name: d.data().name || '' }));
  const legacy = old.exists ? old.data().choirId : null;
  if (legacy && GID_RE.test(legacy) && !list.some(g => g.id === legacy)) list.unshift({ id: legacy, name: '' });
  const known = new Map(cachedGroups().map(g => [g.id, g]));
  return list.map(g => ({ ...(known.get(g.id) || {}), ...g, name: g.name || known.get(g.id)?.name || '' }));
}
function saveGroupsCache() { try { localStorage.setItem(LS_GROUPS, JSON.stringify({ email: S.email, groups: S.groups })); } catch {} }
function cachedGroups() {
  try { const c = JSON.parse(localStorage.getItem(LS_GROUPS) || 'null'); if (c && c.email === S.email) return c.groups || []; } catch {}
  const l = cachedLink(rememberedGroup() || FOUNDER);
  return l ? [{ id: l.choirId, name: '' }] : [];
}
function cachedLink(gid) {
  try {
    const c = JSON.parse(localStorage.getItem(`${LS_LINK}:${gid}`) || (gid === FOUNDER && localStorage.getItem(LS_LINK)) || 'null');
    return c && c.via === 'google' && c.email === S.email && c.choirId === gid ? c : null;
  } catch { return null; }
}
async function refreshGroupInfo() {
  await Promise.all(S.groups.map(async g => {
    try {
      const d = await fs.doc(`agrupacions/${g.id}`).get();
      if (d.exists) { Object.assign(g, { name: d.data().name || g.name, kind: d.data().kind, status: d.data().status }); return; }
    } catch {}
    // Agrupació d'abans del directori: el nom surt de la seva configuració.
    if (!g.name) try {
      const c = await fs.doc(`cors/${g.id}/config/main`).get();
      if (c.exists) Object.assign(g, { name: c.data().name || '', kind: c.data().kind || 'cor' });
    } catch {}
  }));
  saveGroupsCache();
}
/** Whether this account runs the platform, and whether it is a Pro user (the platform team always is). */
async function loadPlatformState() {
  try { const p = await fs.doc('plataforma/equip').get(); S.platform = p.exists; S.platformFree = !p.exists; }
  catch { S.platform = false; S.platformFree = false; }
  try { const q = await fs.doc('plataforma/pro').get(); S.pro = S.platform || (q.exists && (q.data().emails || []).includes(S.email)); }
  catch { S.pro = S.platform; }
  if (S.mode !== 'loading') scheduleRender();
}
function switchGroup(gid) {
  if (gid === GID && S.mode === 'shared') { closeSheet(); return; }
  flushAll();
  try { localStorage.setItem(LS_GROUP, gid); } catch {}
  location.href = `${location.pathname}?a=${encodeURIComponent(gid)}`;
}
function sheetGroups() {
  const canCreate = S.pro;
  const claim = S.platformFree && GID === FOUNDER && hasRole(S.me, 'admin') && !PREVIEW;
  openSheet({
    title: 'Les teves agrupacions',
    body: `<div id="gr-list">${groupList()}</div>
      ${canCreate ? `<div class="entry-new" style="margin-top:14px"><span>Com a Usuari Pro, pots crear una agrupació nova i en seràs l’administrador/a.</span><button class="btn btn-sm" data-act="group-create">+ Crea’n una</button></div>` : ''}
      ${S.platform ? `<div class="panel" style="margin-top:14px"><div class="setting"><div><div class="t">Plataforma</div><div class="s">Totes les agrupacions, qui les ha creades i qui és Usuari Pro.</div></div><button class="btn btn-sm" data-act="platform">Obre el panell</button></div></div>` : ''}
      ${claim ? `<div class="panel" style="margin-top:14px"><div class="setting"><div><div class="t">Panell de plataforma</div><div class="s">Encara no el porta ningú. Si l’actives, veuràs totes les agrupacions i decidiràs qui és Usuari Pro i en pot crear.</div></div><button class="btn btn-sm btn-primary" data-act="platform-claim">Activa’l</button></div></div>` : ''}`,
    onMount: () => refreshGroupInfo().then(() => { const box = $('#gr-list'); if (box) box.innerHTML = groupList(); }),
  });
}

/* ---------- Crear una agrupació ---------- */
let CREATE = null;
const NAME_EXAMPLES = { cor: 'Cor de Cambra de Sant Cugat', orquestra: 'Orquestra de Cambra de Girona', banda: 'Banda Municipal de Mataró', cobla: 'Cobla Ciutat de Vic', cambra: 'Quartet Brossa', altres: 'Esbart Dansaire de Reus' };
function startCreate() {
  if (!S.pro) { toast('Només els Usuaris Pro poden crear agrupacions'); return; }
  CREATE = { step: 1, kind: '', name: '', short: '', sections: [], busy: false, back: S.mode === 'loading' ? (S.groups.length ? 'pick' : 'nostaff') : S.mode,
    readyAt: Date.now() + 400 };   // que el mateix toc que obre l'assistent no hi triï res
  closeSheet();
  S.mode = 'create'; render(); window.scrollTo({ top: 0 });
}
function cancelCreate() {
  const back = CREATE ? CREATE.back : 'nostaff';
  CREATE = null;
  if (back === 'shared' && !db) { location.reload(); return; }
  if (back === 'pick' || back === 'nostaff') { S.mode = S.groups.length ? (GID ? 'shared' : 'pick') : 'nostaff'; if (S.mode === 'shared' && !db) { location.reload(); return; } }
  else S.mode = back;
  render(); window.scrollTo({ top: 0 });
}
/** Section list editor, used when creating a group and in Ajustos. */
function sectionsEditor(prefix, list, locked = new Set()) {
  return `<div class="sec-edit" id="${prefix}-secs">${list.map((x, i) => `<div class="sec-row">
      <input class="inp sec-short" maxlength="3" value="${esc(x.short || '')}" placeholder="—" aria-label="Abreviatura" autocomplete="off" data-bind="${prefix}-sec" data-f="short" data-i="${i}">
      <input class="inp" maxlength="40" value="${esc(x.name || '')}" placeholder="Nom" aria-label="Nom" autocomplete="off" data-bind="${prefix}-sec" data-f="name" data-i="${i}">
      <button type="button" class="icon-btn" data-act="sec-up" data-p="${prefix}" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Mou amunt">${ICON.up}</button>
      <button type="button" class="icon-btn" data-act="sec-del" data-p="${prefix}" data-i="${i}" ${locked.has(x.id) ? 'disabled title="Hi ha gent assignada"' : ''} aria-label="Treu">${ICON.close}</button>
    </div>`).join('')}
    <button type="button" class="btn btn-sm" data-act="sec-add" data-p="${prefix}">+ Afegeix-ne una</button></div>`;
}
/** Tidy a section list: names required, short codes unique, stable ids for new ones. */
function cleanSections(list) {
  const out = [], shorts = new Set(), ids = new Set();
  for (const x of list) {
    const name = String(x.name || '').trim();
    let short = String(x.short || '').trim();
    if (!name && !short) continue;
    if (!name) return { error: `Posa nom a la ${V.section || 'secció'} «${short}»` };
    if (!short) short = initials(name).slice(0, 2) || name.slice(0, 2);
    short = short.slice(0, 3);
    if (shorts.has(short.toLowerCase())) return { error: `L’abreviatura «${short}» es repeteix` };
    shorts.add(short.toLowerCase());
    let id = x.id;
    if (!id) {
      const base = short.normalize('NFD').replace(/[^A-Za-z0-9]/g, '') || 'X';
      id = base; for (let n = 2; ids.has(id) || list.some(y => y.id === id && y !== x); n++) id = `${base}${n}`;
    }
    ids.add(id);
    out.push({ id, name, short });
  }
  return out.length ? { list: out } : { error: 'Hi ha d’haver almenys una secció' };
}
function viewCreate() {
  const c = CREATE, k = KINDS[c.kind];
  const labels = ['Tipus', 'Nom', k ? capz(k.words.sections) : 'Seccions', 'Resum'];
  const head = `<div class="wiz-head"><span class="eyebrow">Nova agrupació · pas ${c.step} de 4</span>
    <ol class="wiz-steps">${labels.map((s, i) => `<li class="${i + 1 < c.step ? 'done' : i + 1 === c.step ? 'cur' : ''}">${esc(s)}</li>`).join('')}</ol></div>`;
  let body = '';
  if (c.step === 1) {
    body = `<h1 class="h1">Quin tipus d’agrupació és?</h1>
      <p class="wiz-lead">Així l’app parlarà de «cantaires i cordes» o de «músics i seccions», i et proposarà les seccions i els tipus de sessió habituals.</p>
      <div class="kind-grid" role="radiogroup" aria-label="Tipus d’agrupació">${Object.entries(KINDS).map(([id, x]) => `<button type="button" role="radio" class="kind-card" aria-checked="${c.kind === id}" data-act="cr-kind" data-k="${id}"><b>${esc(x.label)}</b><small>${esc(x.hint)}</small><span class="kind-secs" aria-hidden="true">${x.sections.slice(0, 4).map(([id]) => esc(id)).join(' ')}${x.sections.length > 4 ? ' …' : ''}</span></button>`).join('')}</div>`;
  } else if (c.step === 2) {
    body = `<h1 class="h1">Com es diu?</h1>
      <div class="kv" style="margin-top:16px">
        <label class="field"><span>Nom de l’agrupació</span><input class="inp" id="cr-name" maxlength="60" value="${esc(c.name)}" placeholder="p. ex. ${esc(NAME_EXAMPLES[c.kind] || '')}" autocomplete="off" data-bind="cr" data-f="name"></label>
        <label class="field"><span>Nom curt (opcional)</span><input class="inp" id="cr-short" maxlength="16" value="${esc(c.short)}" placeholder="p. ex. ${esc(initials(NAME_EXAMPLES[c.kind] || ''))}" autocomplete="off" data-bind="cr" data-f="short">
          <small>És el que surt sota la icona quan algú afegeix l’app a la pantalla d’inici.</small></label>
      </div>`;
  } else if (c.step === 3) {
    body = `<h1 class="h1">${esc(capz(k.words.sections))}</h1>
      <p class="wiz-lead">Es passa llista per ${esc(k.words.sections)}. Et proposem les habituals: canvia’n el nom, treu les que no tingueu o afegeix-ne. Ho podràs tornar a canviar a Ajustos.</p>
      ${sectionsEditor('cr', c.sections)}`;
  } else {
    const secs = cleanSections(c.sections).list || [];
    body = `<h1 class="h1">Tot a punt</h1>
      <div class="panel wiz-sum">
        <div class="setting"><div><div class="t">${esc(c.name.trim())}</div><div class="s">${esc([k.label, c.short.trim()].filter(Boolean).join(' · '))}</div></div></div>
        <div class="setting"><div><div class="t">${secs.length} ${esc(secs.length === 1 ? k.words.section : k.words.sections)}</div><div class="s">${secs.map(x => `<b>${esc(x.short)}</b> ${esc(x.name)}`).join(' · ')}</div></div></div>
        <div class="setting"><div><div class="t">Tu en seràs l’administrador/a</div><div class="s">${esc(S.email)}. Després hi afegiràs la resta de l’equip i els ${esc(k.words.members)}, cadascú amb el seu correu.</div></div></div>
      </div>
      <p class="wiz-lead" style="font-size:calc(13px*var(--ts))">Les dades de l’agrupació només les veuran les persones que hi afegiu. Si només la vols provar, després la pots esborrar des d’Ajustos.</p>`;
  }
  const next = c.step < 4
    ? `<button class="btn btn-primary" data-act="cr-next" ${c.step === 1 && !c.kind ? 'disabled' : ''}>Continua</button>`
    : `<button class="btn btn-primary" data-act="cr-go" ${c.busy ? 'disabled' : ''}>${c.busy ? 'Creant…' : 'Crea l’agrupació'}</button>`;
  return `<section class="wizard">${head}${body}
    <div class="wiz-nav"><button class="btn btn-ghost" data-act="cr-cancel">Cancel·la</button><span class="spacer"></span>${c.step > 1 ? '<button class="btn" data-act="cr-back">Enrere</button>' : ''}${next}</div>
  </section>`;
}
function afterCreateRender() {
  const first = $('.wizard input.inp');
  if (first && CREATE && CREATE.step === 2 && !CREATE.name && window.matchMedia('(hover:hover)').matches) first.focus();
}
function createStep(dir) {
  const c = CREATE;
  if (dir > 0) {
    if (c.step === 1 && !c.kind) return;
    if (c.step === 2 && !c.name.trim()) { toast('Escriu el nom de l’agrupació'); return; }
    if (c.step === 3) { const r = cleanSections(c.sections); if (r.error) { toast(r.error); return; } c.sections = r.list; }
  }
  c.step = Math.min(4, Math.max(1, c.step + dir));
  render(); window.scrollTo({ top: 0 });
}
async function createGroup() {
  const c = CREATE;
  if (!c || c.busy) return;
  const email = S.email;
  if (!email) { toast('Entra amb Google per crear l’agrupació'); return; }
  if (!navigator.onLine) { toast('Cal connexió per crear l’agrupació'); return; }
  const r = cleanSections(c.sections);
  if (r.error) { toast(r.error); c.step = 3; render(); return; }
  c.busy = true; render();
  const gid = newKey(), at = new Date().toISOString(), name = c.name.trim(), short = c.short.trim();
  try {
    const b = fs.batch();
    b.set(fs.doc(`agrupacions/${gid}`), { name, kind: c.kind, status: 'active', createdAt: at, createdBy: email });
    b.set(fs.doc(`cors/${gid}/config/main`), { name, ...(short ? { shortName: short } : {}), kind: c.kind, sections: r.list, alertFNJ: 3, minAttendance: 80, demo: false, createdAt: at });
    b.set(fs.doc(`cors/${gid}/staff/${email}`), { email, name: S.userName || '', role: 'admin', roles: ['admin'], addedAt: at });
    b.set(fs.doc(`staffIndex/${email}/agrupacions/${gid}`), { at, name });
    await b.commit();
  } catch (e) {
    c.busy = false; render();
    toast(e && e.code === 'permission-denied' ? 'Ara mateix no es poden crear agrupacions noves.' : 'No s’ha pogut crear. Comprova la connexió i torna-ho a provar.');
    return;
  }
  try { localStorage.setItem(LS_GROUP, gid); } catch {}
  location.replace(`${location.pathname}?a=${encodeURIComponent(gid)}`);
}

/* ---------- Plataforma: el directori de totes les agrupacions ---------- */
const STATUS_LABEL = { active: 'Activa', suspended: 'Suspesa', deleted: 'Esborrada' };
const QUOTAS = [50, 100, 300, 500, 1000];
async function sheetPlatform() {
  const P = { groups: [], team: { emails: [] }, pro: { emails: [] } };
  const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const chip = (e, rm) => `<span class="chip-mail">${esc(e)}${rm ? `<button type="button" data-rm-${rm}="${esc(e)}" aria-label="Treu ${esc(e)}">${ICON.close}</button>` : ''}</span>`;
  const adder = id => `<div style="display:flex;gap:6px"><input class="inp" id="pl-${id}-mail" type="email" placeholder="correu@exemple.com" style="min-height:38px"><button class="btn btn-sm" id="pl-${id}-add">Afegeix</button></div>`;
  const draw = el => {
    const body = el.querySelector('.sheet-b');
    const act = P.groups.filter(g => (g.status || 'active') === 'active');
    const sum = k => act.reduce((n, g) => n + (+(g.stats && g.stats[k]) || 0), 0);
    const order = { active: 0, suspended: 1, deleted: 2 };
    const list = [...P.groups].sort((a, b) => (order[a.status || 'active'] - order[b.status || 'active']) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    body.innerHTML = `<div class="kpis">
        <div class="kpi"><div class="kpi-v">${act.length}</div><div class="kpi-l">Agrupacions actives</div></div>
        <div class="kpi"><div class="kpi-v">${sum('members')}</div><div class="kpi-l">Membres a les plantilles</div></div>
        <div class="kpi"><div class="kpi-v">${sum('people')}</div><div class="kpi-l">Persones amb accés</div></div>
        <div class="kpi"><div class="kpi-v">${fmtSize(sum('files'))}</div><div class="kpi-l">Fitxers pujats</div></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="setting" style="display:grid;gap:8px"><div><div class="t">Usuaris Pro</div><div class="s">Són els únics que poden <b>crear agrupacions</b> i, de les que administren, <b>canviar-ne</b> el nom, el tipus, les seccions i la imatge o <b>esborrar-les</b>. La resta de persones fan servir les agrupacions on les han donat d’alta, però no en poden crear ni canviar-les. L’equip de la plataforma és Pro sempre.</div></div>
          <div class="pickers">${(P.team.emails || []).map(e => chip(`${e} · plataforma`)).join('')}${(P.pro.emails || []).filter(e => !(P.team.emails || []).includes(e)).map(e => chip(e, 'pro')).join('')}</div>
          ${adder('pro')}</div>
        <div class="setting" style="display:grid;gap:8px"><div><div class="t">Equip de la plataforma</div><div class="s">Veuen aquest panell, decideixen qui és Usuari Pro i poden suspendre agrupacions. No veuen les dades de dins de les agrupacions.</div></div>
          <div class="pickers">${(P.team.emails || []).map(e => chip(e, e === S.email ? '' : 'team')).join('')}</div>
          ${adder('team')}</div>
      </div>
      <div class="section-title"><h2 class="h2">Agrupacions</h2><span class="eyebrow">${P.groups.length}</span></div>
      <div class="panel">${list.map(g => {
        const st = g.status || 'active', s = g.stats || {};
        const facts = [s.members != null ? `${s.members} a la plantilla` : '', s.people != null ? `${s.people} amb accés` : '', s.productions != null ? `${s.productions} produccions` : '',
          `${fmtSize(+s.files || 0)} de ${+g.fileQuotaMB || (g.id === FOUNDER ? 300 : 100)} MB`, s.at ? `actualitzat ${agoText(s.at).toLowerCase()}` : 'encara sense dades'].filter(Boolean);
        return `<div class="plat-row">
          <div class="pr-h"><b>${esc(g.name || g.id)}</b><span class="st-pill ${st === 'active' ? 'st-accepted' : st === 'suspended' ? 'st-pending' : 'st-rejected'}">${STATUS_LABEL[st] || st}</span></div>
          <div class="pr-m">${esc([KINDS[g.kind]?.label || '', g.createdAt ? `creada el ${ddmm(g.createdAt.slice(0, 10))}/${g.createdAt.slice(0, 4)}` : '', g.createdBy ? `per ${g.createdBy}` : ''].filter(Boolean).join(' · '))}</div>
          <div class="pr-m">${esc(facts.join(' · '))}</div>
          <div class="pr-a">
            ${st === 'active' ? `<button class="btn btn-sm" data-pl="suspend" data-id="${esc(g.id)}">Suspèn</button>` : st === 'suspended' ? `<button class="btn btn-sm btn-primary" data-pl="activate" data-id="${esc(g.id)}">Reactiva</button>` : `<button class="btn btn-sm btn-danger-ghost" data-pl="forget" data-id="${esc(g.id)}">Treu-la del directori</button>`}
            ${st !== 'deleted' ? `<label class="quota">Fitxers <select class="inp" data-quota="${esc(g.id)}">${QUOTAS.map(q => `<option value="${q}" ${(+g.fileQuotaMB || (g.id === FOUNDER ? 300 : 100)) === q ? 'selected' : ''}>${q < 1000 ? `${q} MB` : '1 GB'}</option>`).join('')}</select></label>` : ''}
          </div></div>`;
      }).join('') || '<p style="margin:0;padding:14px">Encara no hi ha cap agrupació al directori.</p>'}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts))">Una agrupació suspesa no hi pot entrar ningú fins que la reactivis, però no se n’esborra res. La base de dades gratuïta té un límit diari de lectures i 1 GB d’espai per a totes les agrupacions juntes: vigila els fitxers pujats.</p>`;
    const saveList = async (key, doc, emails, ok) => {
      try { await fs.doc(doc).set({ emails, at: new Date().toISOString() }); P[key].emails = emails; toast(ok); draw(el); }
      catch { toast('No s’ha pogut desar'); }
    };
    const readMail = id => {
      const m = body.querySelector(`#pl-${id}-mail`).value.trim().toLowerCase();
      if (!MAIL_RE.test(m)) { toast('Escriu un correu vàlid'); return null; }
      return m;
    };
    body.querySelector('#pl-pro-add').onclick = () => {
      const m = readMail('pro'); if (!m) return;
      if ((P.pro.emails || []).includes(m) || (P.team.emails || []).includes(m)) { toast('Aquest correu ja és Pro'); return; }
      saveList('pro', 'plataforma/pro', [...(P.pro.emails || []), m], `${m} ja és Usuari Pro`);
    };
    body.querySelectorAll('[data-rm-pro]').forEach(b => b.onclick = async () => {
      if (!await confirmSheet('Treure’l dels Usuaris Pro?', `<b>${esc(b.dataset.rmPro)}</b> ja no podrà crear agrupacions ni canviar o esborrar les que administra. Les agrupacions i les seves dades no es toquen.`, 'Treu-lo', false)) return sheetPlatform();
      saveList('pro', 'plataforma/pro', (P.pro.emails || []).filter(x => x !== b.dataset.rmPro), 'Ja no és Usuari Pro');
    });
    body.querySelector('#pl-team-add').onclick = () => {
      const m = readMail('team'); if (!m) return;
      if ((P.team.emails || []).includes(m)) return;
      saveList('team', 'plataforma/equip', [...(P.team.emails || []), m], `${m} ja és de l’equip de la plataforma`);
    };
    body.querySelectorAll('[data-rm-team]').forEach(b => b.onclick = () => saveList('team', 'plataforma/equip', (P.team.emails || []).filter(x => x !== b.dataset.rmTeam), 'Tret de l’equip'));
    body.querySelectorAll('[data-pl]').forEach(b => b.onclick = async () => {
      const g = P.groups.find(x => x.id === b.dataset.id);
      if (!g) return;
      const ref = fs.doc(`agrupacions/${g.id}`);
      try {
        if (b.dataset.pl === 'suspend') {
          if (!await confirmSheet(`Suspendre «${esc(g.name)}»?`, 'Ningú no hi podrà entrar fins que la reactivis. No se n’esborra res.', 'Suspèn')) return sheetPlatform();
          await ref.update({ status: 'suspended' }); g.status = 'suspended';
          return sheetPlatform();
        }
        if (b.dataset.pl === 'activate') { await ref.update({ status: 'active' }); g.status = 'active'; toast('Agrupació reactivada'); }
        if (b.dataset.pl === 'forget') {
          if (!await confirmSheet('Treure-la del directori?', 'Ja no hi ha dades: només se n’esborra la fitxa del directori.', 'Treu-la')) return sheetPlatform();
          await ref.delete(); return sheetPlatform();
        }
      } catch { toast('No s’ha pogut canviar'); }
      draw(el);
    });
    body.querySelectorAll('[data-quota]').forEach(s => s.onchange = async () => {
      const g = P.groups.find(x => x.id === s.dataset.quota);
      try { await fs.doc(`agrupacions/${g.id}`).update({ fileQuotaMB: +s.value }); g.fileQuotaMB = +s.value; toast('Espai desat'); }
      catch { toast('No s’ha pogut desar'); }
      draw(el);
    });
  };
  openSheet({
    title: 'Plataforma', wide: true,
    body: '<p class="muted" style="margin:0">Carregant les agrupacions…</p>',
    onMount: async el => {
      try {
        const [snap, t, pro] = await Promise.all([fs.collection('agrupacions').get(), fs.doc('plataforma/equip').get(), fs.doc('plataforma/pro').get()]);
        P.groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        P.team = t.exists ? t.data() : { emails: [] };
        P.pro = pro.exists ? pro.data() : { emails: [] };
      } catch { el.querySelector('.sheet-b').innerHTML = '<p style="margin:0">No s’han pogut carregar les agrupacions. Comprova la connexió.</p>'; return; }
      if (el.isConnected) draw(el);
    },
  });
}
async function claimPlatform() {
  try {
    await fs.doc('plataforma/equip').set({ emails: [S.email], at: new Date().toISOString() });
    S.platform = true; S.platformFree = false; S.pro = true;
    toast('Panell de plataforma activat'); render(); sheetPlatform();
  } catch { toast('No s’ha pogut activar'); }
}

/* ---------- Directori: registre i xifres de l'agrupació ---------- */
const fileQuotaMB = () => +(S.group && S.group.fileQuotaMB) || (GID === FOUNDER ? 300 : 100);
function groupFileBytes() {
  let n = 0;
  for (const p of S.productions.values()) for (const x of p.materials || []) if (x.file) n += +x.file.size || 0;
  for (const d of S.config.documents || []) if (d.file) n += +d.file.size || 0;
  return n;
}
/** Keep the group's directory record up to date (name, type, a few numbers for the platform). */
async function syncDirectory(force) {
  if (!db || !S.me || PREVIEW || !canEdit() || !S.ready) return;
  const ref = fs.doc(`agrupacions/${GID}`);
  const stats = { members: membersOf(null).length, people: S.staff.size, productions: S.productions.size, files: groupFileBytes(), at: new Date().toISOString() };
  try {
    if (!S.group || !S.group.status) {
      // Agrupació d'abans del directori: se n'hi fa la fitxa el primer cop que entra l'administració.
      if (!hasRole(S.me, 'admin')) return;
      const rec = { name: (S.config.name || 'Agrupació').slice(0, 80), kind: kindOf(), status: 'active', createdAt: S.config.createdAt || new Date().toISOString(), createdBy: S.me.email };
      await ref.set(rec);
      S.group = { id: GID, ...rec };
      await ref.update({ stats });
      S.group.stats = stats;
      return;
    }
    const renamed = canManageGroup() && ((S.config.name && S.config.name !== S.group.name) || kindOf() !== (S.group.kind || 'cor'));
    const last = S.group.stats && S.group.stats.at ? Date.parse(S.group.stats.at) : 0;
    if (!force && !renamed && Date.now() - last < 20 * 3600 * 1000) return;
    const patch = { stats };
    if (renamed) Object.assign(patch, { name: (S.config.name || S.group.name).slice(0, 80), kind: kindOf() });
    await ref.update(patch);
    Object.assign(S.group, patch);
  } catch {}
}
