// A Tempo · 12-persones.js — Persones: la plantilla i l'accés a l'app en una sola finestra, llistes enganxades i invitacions.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Persones: la plantilla i l'accés a l'app, en una sola finestra ---------- */
// Cada persona pot tenir una fitxa a la plantilla (members/<id>: qui canta, amb la corda i la veu) i un compte per entrar
// a l'app (staff/<correu>: els rols, i memberId si canta). Abans calia fer-les per separat i després vincular-les; ara
// «Afegeix una persona» ho fa tot d'una: si ja és a la plantilla s'hi vincula, i si no, se li fa la fitxa.
// «Cap de corda» també és una sola cosa: la marca de la fitxa i el permís del compte per passar llista van junts.
const accountFor = mid => mid ? [...S.staff.values()].find(p => p.memberId === mid) : null;
const roleRank = p => { const r = rolesOf(p)[0]; return r ? ROLE_KEYS.indexOf(r) : ROLE_KEYS.length; };
const peopleSorted = () => [...S.staff.values()].sort((a, b) =>
  roleRank(a) - roleRank(b)
  || (a.name || a.email).localeCompare(b.name || b.email, 'ca'));
function roleSummary(p) {
  const bits = rolesOf(p).map(roleLabel);
  if (!bits.length) bits.push('Sense rol');
  const sec = hasRole(p, 'leader') && p.section ? p.section : S.members.get(p.memberId || '')?.section;
  if (sec) bits.push(SEC[sec].name);
  return bits.join(' · ');
}
/** Els rols en l'ordre que es pensen: primer si canta, després què més fa. */
const PERSON_ROLES = ['singer', 'leader', 'voice', 'director', 'gerencia', 'secretaria', 'admin'];
/** Qui no canta només existeix com a compte: sense correu no hi ha res a desar. */
const needsMail = roles => roles.some(r => r !== 'singer' && r !== 'leader');
const NAME_SKIP = new Set(['de', 'del', 'dels', 'la', 'les', 'el', 'els', 'i', 'y', 'da', 'van']);
const nameWords = t => normText(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 1 && !NAME_SKIP.has(w));
/** La fitxa de la plantilla que és d'aquest nom («Puig, Anna» és «Anna Puig»), si n'hi ha una i prou.
 *  free: només les que encara no tenen compte (o el té aquest correu). */
function rosterMatch(name, { free = true, email = '' } = {}) {
  const words = nameWords(name);
  if (words.length < 2) return null;
  const hits = [...S.members.values()].filter(m => {
    const acc = free ? accountFor(m.id) : null;
    if (acc && acc.email !== email) return false;
    const mine = new Set(nameWords(m.name));
    return words.every(w => mine.has(w));
  });
  const active = hits.filter(m => m.active !== false);
  return hits.length === 1 ? hits[0] : active.length === 1 ? active[0] : null;
}
/** Abans de desar cal saber qui ja té accés: si no, un correu repetit perdria els rols que tenia. */
function staffLoading() {
  if (S.staffReady) return false;
  ensureStaff();
  toast('Un moment: s’està carregant qui té accés a l’app. Torna-ho a provar.');
  return true;
}
/** Desa el compte d'una persona. Si li han canviat el correu, treu el vell (i les classes passen al nou). */
async function writeAccount(rec, oldEmail = '') {
  const moved = !!oldEmail && oldEmail !== rec.email;
  const b = fs.batch();
  b.set(db.doc(`staff/${rec.email}`), rec);
  if (GID === FOUNDER) b.set(fs.doc(`staffIndex/${rec.email}`), { choirId: GID });
  if (moved) b.delete(db.doc(`staff/${oldEmail}`));
  await b.commit();
  S.staff.set(rec.email, rec);
  indexPerson(rec.email);
  if (moved) { S.staff.delete(oldEmail); unindexPerson(oldEmail); moveTeacher(oldEmail, rec.email); }
  if (hasRole(rec, 'voice') && !classesOn() && isAdmin()) saveConfig({ classesOn: true });
}
/** Treu l'agrupació de la llista de qui ja no hi entra (o hi entra amb un altre correu). */
function unindexPerson(mail) {
  fs.doc(`staffIndex/${mail}/agrupacions/${GID}`).delete().catch(() => {});
  if (GID === FOUNDER) fs.doc(`staffIndex/${mail}`).delete().catch(() => {});
}
/** Un professor que canvia de correu s'emporta els dies de classe i l'horari fix. */
function moveTeacher(from, to) {
  for (const c of [...S.classes.values()]) if (c.teacher === from) { const next = { ...c, teacher: to }; S.classes.set(c.id, next); persist('classes', c.id, next, 20); }
  const plan = S.classPlan.get(from);
  if (plan) { const next = { ...plan, id: to, teacher: to }; S.classPlan.set(to, next); persist('classPlan', to, next, 10); S.classPlan.delete(from); persist('classPlan', from, null, 10); }
}
/** Cap de corda de la seva corda, segons el compte (el permís) o, si no en té, la fitxa. */
const leadsOwn = (m, acc = accountFor(m.id)) => acc ? hasRole(acc, 'leader') && acc.section === m.section : !!m.leader;
/** Quan la fitxa canvia (cap de corda, corda o nom), el compte vinculat la segueix. Torna el compte nou, o null si no canvia. */
function accountForMember(acc, m, prev) {
  if (!acc) return null;
  const rec = { ...acc };
  let roles = rolesOf(acc);
  const ledOld = roles.includes('leader') && (acc.section || '') === (prev || m).section;
  if (m.leader && !(roles.includes('leader') && acc.section === m.section)) { roles = ROLE_KEYS.filter(k => k === 'leader' || roles.includes(k)); rec.section = m.section; }
  else if (!m.leader && ledOld) { roles = roles.filter(r => r !== 'leader'); delete rec.section; }
  if (!roles.length) roles = ['singer'];
  rec.roles = roles; rec.role = roles[0];
  if (prev && acc.name === prev.name && m.name !== prev.name) rec.name = m.name;
  return JSON.stringify(rec) === JSON.stringify(acc) ? null : rec;
}
/** La finestra d'una persona: el nom, el correu per entrar a l'app, què fa i, si canta, la seva fitxa de la plantilla.
 *  email: el compte que s'edita. preset: { roles, memberId (dona accés a qui ja és a la plantilla), section }.
 *  @param {string | null} email
 *  @param {{ roles?: string[], memberId?: string, section?: string }} [preset] */
function sheetPerson(email, preset = {}) {
  ensureStaff();
  const existing = email ? S.staff.get(email) || null : null;
  if (email && !existing) { toast('Aquesta persona ja no té accés'); return; }
  // Si qui ja és a la plantilla té compte, s'obre el seu compte.
  if (!email && preset.memberId && accountFor(preset.memberId)) { sheetPerson(accountFor(preset.memberId).email); return; }
  const from = S.members.get(existing?.memberId || preset.memberId || '') || null;
  // Un compte que encara no està vinculat a la seva fitxa: la de la plantilla que té el seu nom.
  const guess = from ? from.id : existing ? rosterMatch(existing.name, { email: existing.email })?.id || '' : '';
  let roles = existing ? rolesOf(existing) : (preset.roles || []).filter(r => ROLE_KEYS.includes(r));
  if (!existing && from) roles = PERSON_ROLES.filter(k => k === 'singer' || (k === 'leader' && from.leader) || roles.includes(k));
  // Un cap de corda gairebé sempre canta: surt marcat (es pot treure).
  if (!existing && roles.includes('leader') && !roles.includes('singer')) roles = ['singer', ...roles];
  if (!roles.length) roles = ['singer'];
  const sec0 = from?.section || (SEC_MAP[preset.section] ? preset.section : '') || SECTIONS[0]?.id || '';
  const free = () => membersOf(null, true).filter(m => !accountFor(m.id) || m.id === from?.id);
  const memOptions = sel => SECTIONS.map(x => {
    const ms = free().filter(m => m.section === x.id).sort(byName);
    return ms.length ? `<optgroup label="${esc(x.name)}">${ms.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.active === false ? ' (inactiu)' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const small = 'style="font-size:calc(13px*var(--ts))"';
  openSheet({
    title: existing ? (existing.name || existing.email) : from ? `Accés per a ${fullName(from.name)}` : 'Afegeix una persona',
    body: `<div class="kv">
      <label class="field"><span>Nom i cognoms</span><input class="inp" id="ps-name" type="text" maxlength="60" autocomplete="off" value="${esc(existing?.name || from?.name || '')}" placeholder="p. ex. Puig Ferrer, Anna"></label>
      <label class="field"><span>Correu per entrar a l’app</span><input class="inp" id="ps-email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(existing?.email || '')}" placeholder="nom@exemple.com"><small id="ps-mail-hint"></small></label>
      <div class="field"><span>Què fa a l’agrupació <span class="muted" style="font-weight:500">· pots triar-ne més d’un</span></span>
        <div class="pickers" id="ps-roles">${PERSON_ROLES.map(k => `<button type="button" class="pick" data-role="${k}" aria-pressed="${roles.includes(k)}">${esc(roleLabel(k))}</button>`).join('')}</div>
        <small id="ps-hint"></small></div>
      <label class="field" id="ps-mem-f"><span>Fitxa de la plantilla</span>
        <select class="inp" id="ps-mem"><option value="">Fitxa nova</option>${memOptions(guess)}</select>
        <small id="ps-mem-hint"></small></label>
      <div id="ps-new" style="display:grid;gap:12px">
        <div class="field"><span>${V.Section}</span><div class="pickers" id="ps-sec">${SECTIONS.map(x => secPick(x, x.id === sec0)).join('')}</div></div>
        <div class="field"><span>${V.Part} dins la ${V.section} (opcional)</span><div class="pickers" id="ps-part"><button type="button" class="pick" data-part="" aria-pressed="true">Sense</button>${PARTS.map(v => `<button type="button" class="pick" data-part="${esc(v)}" aria-pressed="false">${esc(v)}</button>`).join('')}</div></div>
      </div>
      <div class="field" id="ps-lead-f"><span>${V.Section} que porta</span><div class="pickers" id="ps-lead">${SECTIONS.map(x => secPick(x, x.id === (existing?.section || sec0))).join('')}</div></div>
      ${existing ? '' : `<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Són unes quantes persones? <button type="button" class="linkish" data-act="staff-bulk">Enganxa’n una llista</button>.</p>`}
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="ps-del">Treu l’accés</button>' : ''}<span class="spacer"></span>${existing && !existing.lastSeen ? '<button class="btn" id="ps-inv">Convida</button>' : ''}<button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ps-save">${existing ? 'Desa' : 'Afegeix'}</button>`,
    onMount: el => {
      const q = s => el.querySelector(s);
      const picked = () => [...el.querySelectorAll('#ps-roles .pick[aria-pressed="true"]')].map(x => x.dataset.role);
      const chosen = s => el.querySelector(`${s} .pick[aria-pressed="true"]`)?.dataset || {};
      // Mentre no la triïn a mà, la fitxa es busca pel nom: així qui ja és a la plantilla no hi surt dos cops.
      let auto = !existing && !from;
      const paint = () => {
        const rs = picked(), singer = rs.includes('singer');
        const mem = S.members.get(q('#ps-mem').value) || null;
        q('#ps-mem-f').hidden = !singer;
        q('#ps-new').hidden = !singer || !!mem;
        q('#ps-lead-f').hidden = !rs.includes('leader') || singer;
        q('#ps-hint').textContent = rolesHint(rs) + (rs.includes('leader') && singer ? ` Porta la seva ${V.section}.` : '');
        q('#ps-mem-hint').textContent = !mem ? `Entrarà a la plantilla amb una fitxa nova.`
          : mem.id === existing?.memberId || mem.id === from?.id ? `És la seva fitxa (${SEC[mem.section].name}).`
          : auto ? `Ja és a la plantilla (${SEC[mem.section].name}): es farà servir la seva fitxa. Si no és aquesta persona, tria «Fitxa nova».`
          : `Es vincularà a aquesta fitxa (${SEC[mem.section].name}).`;
        const mail = q('#ps-email').value.trim().toLowerCase(), other = mail ? S.staff.get(mail) : null;
        q('#ps-mail-hint').textContent = !mail ? (needsMail(rs) ? 'Cal el correu: és amb el que entrarà a l’app.' : `Opcional. Sense correu només serà a la plantilla; el pots posar més endavant.`)
          : !EMAIL_RE.test(mail) ? 'Aquest correu no està complet.'
          : mailWarning(mail) || (existing && other && mail !== existing.email ? `Aquest correu ja és de ${other.name || other.email}.`
          : existing && mail !== existing.email ? 'Li canviaràs el correu: a partir d’ara haurà d’entrar amb aquest.'
          : !existing && other ? `Ja té accés (${rolesText(other)}): s’hi sumaran els rols que triïs.`
          : isGoogleMail(mail) ? 'Entrarà amb «Entra amb Google».' : 'Si no és de Google, el primer cop crearà una contrasenya.');
      };
      q('#ps-name').addEventListener('input', () => {
        if (!auto) return;
        const m = rosterMatch(q('#ps-name').value);
        q('#ps-mem').value = m ? m.id : '';
        paint();
      });
      q('#ps-mem').onchange = () => { auto = false; paint(); };
      q('#ps-email').addEventListener('input', paint);
      el.querySelectorAll('#ps-roles .pick').forEach(b => b.onclick = () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); paint(); });
      for (const s of ['#ps-sec', '#ps-part', '#ps-lead']) el.querySelectorAll(`${s} .pick`).forEach(b => b.onclick = () => el.querySelectorAll(`${s} .pick`).forEach(x => x.setAttribute('aria-pressed', String(x === b))));
      paint();
      q('#ps-inv')?.addEventListener('click', () => sheetInvite(S.staff.get(existing.email) || existing));
      q('#ps-save').onclick = async e => {
        const btn = e.currentTarget;
        if (staffLoading()) return;
        const rs = picked(), singer = rs.includes('singer');
        const name = q('#ps-name').value.trim().replace(/\s+/g, ' ');
        const mail = q('#ps-email').value.trim().toLowerCase();
        if (!rs.length) { toast('Tria què fa a l’agrupació'); return; }
        if (!name) { toast('Escriu el nom i els cognoms'); return; }
        if (mail && !EMAIL_RE.test(mail)) { toast('Revisa el correu: no està complet'); return; }
        if (!mail && existing) { toast('Per treure-li l’accés, fes servir «Treu l’accés»'); return; }
        if (!mail && needsMail(rs)) { toast(`Posa-hi el correu: amb el rol de ${roleLabel(rs.find(r => r !== 'singer' && r !== 'leader')).toLowerCase()} ha d’entrar a l’app`); return; }
        const other = mail ? S.staff.get(mail) || null : null;
        if (existing && other && mail !== existing.email) { toast(`Aquest correu ja és de ${other.name || other.email}`); return; }
        if (existing && mail !== existing.email && S.me && existing.email === S.me.email) { toast('El teu correu no el pots canviar: et quedaries sense accés'); return; }
        const base = existing || other;   // si el correu ja tenia accés, s'hi sumen els rols
        const all = ROLE_KEYS.filter(k => rs.includes(k) || (!existing && !!other && hasRole(other, k)));
        let mem = all.includes('singer') ? S.members.get(q('#ps-mem').value) || null : null;
        if (!existing && other?.memberId && all.includes('singer')) mem = S.members.get(other.memberId) || mem;
        const holder = mem ? accountFor(mem.id) : null;
        if (holder && holder.email !== (existing?.email || mail)) { toast(`Aquesta fitxa ja és del compte ${holder.email}`); return; }
        if (existing && hasRole(existing, 'admin') && !all.includes('admin') && peopleWithRole('admin').length === 1) { toast('Ha de quedar almenys una persona d’administració'); return; }
        const lsec = !all.includes('leader') ? '' : all.includes('singer') ? (mem?.section || chosen('#ps-sec').sec) : chosen('#ps-lead').sec;
        if (all.includes('leader') && !lsec) { toast(`Tria quina ${V.section} porta`); return; }
        btn.disabled = true;
        try {
          // 1) La fitxa de la plantilla, si canta: la que ja hi era o una de nova.
          const fresh = all.includes('singer') && !mem;
          if (fresh) {
            mem = { id: uid('m'), name, section: chosen('#ps-sec').sec, leader: false, active: true, joined: TODAY, history: [{ date: TODAY, kind: 'alta', note: '' }] };
            if (chosen('#ps-part').part) mem.part = chosen('#ps-part').part;
          } else if (mem && name !== mem.name && (mem.id === existing?.memberId || mem.id === from?.id)) mem = { ...mem, name };
          // 2) El compte, si té correu.
          let rec = /** @type {any} */ (null);
          if (mail) {
            const moved = !!existing && mail !== existing.email;
            const own = !!mem && (mem.id === existing?.memberId || mem.id === from?.id);
            rec = { email: mail, name: mem && !own && !fresh ? mem.name : name, role: all[0], roles: all, addedAt: base?.addedAt || new Date().toISOString() };
            if (base?.lastSeen && !moved) rec.lastSeen = base.lastSeen;
            if (base?.invitedAt && !moved) rec.invitedAt = base.invitedAt;
            if (lsec) rec.section = lsec;
            if (mem) rec.memberId = mem.id;
            await writeAccount(rec, moved ? existing.email : '');
          }
          if (mem) {
            const next = { ...mem, leader: all.includes('leader') && lsec === mem.section };
            if (fresh || JSON.stringify(next) !== JSON.stringify(S.members.get(mem.id))) saveMember(next);
          }
          render();
          if (rec && !rec.lastSeen && (!existing || rec.email !== existing.email)) { sheetInvite(rec, true); return; }
          closeSheet();
          toast(existing ? 'Canvis desats' : rec ? (other ? 'Ja tenia accés: s’hi han sumat els rols' : 'Persona afegida') : `Afegida a la plantilla (${SEC[mem.section].name}). El correu el pots posar a la seva fitxa quan el tinguis.`);
        } catch { btn.disabled = false; toast('No s’ha pogut desar. Comprova la connexió i torna-ho a provar.'); }
      };
      const del = q('#ps-del');
      if (del) del.onclick = async () => {
        if (S.me && S.me.email === existing.email) { toast('No et pots treure a tu mateix'); return; }
        if (!await confirmSheet('Treure l’accés?', `<b>${esc(existing.name || existing.email)}</b> deixarà d’entrar a l’app a l’instant. La seva fitxa de la plantilla i les llistes no es toquen.`, 'Treu')) return;
        try {
          await db.doc(`staff/${existing.email}`).delete();
          unindexPerson(existing.email);
          S.staff.delete(existing.email); closeSheet(); toast('Accés retirat'); render();
        } catch { toast('No s’ha pogut treure. Comprova la connexió.'); }
      };
    },
  });
}
/** A la fitxa de la plantilla (administració): el seu accés, o on posar-li el correu perquè en tingui. */
const MEMBER_MAIL_HINT = 'Amb el correu podrà entrar a l’app: avisar de les absències, confirmar les convocatòries i veure la seva assistència.';
function memberAccessHtml(acc) {
  if (acc) return `<div class="toggle-row"><span><b>Accés a l’app</b><br><span class="muted" style="font-size:calc(13px*var(--ts));overflow-wrap:anywhere">${esc(acc.email)} · ${esc(rolesText(acc))}${acc.lastSeen ? '' : acc.invitedAt ? ' · convidat, encara no ha entrat' : ' · encara no ha entrat'}</span></span>
    <button type="button" class="btn btn-sm" data-act="staff-edit" data-email="${esc(acc.email)}">Canvia</button></div>`;
  return `<label class="field"><span>Correu per entrar a l’app <span class="muted" style="font-weight:500">· opcional</span></span>
    <input class="inp" id="me-email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="nom@exemple.com"><small id="me-email-hint">${MEMBER_MAIL_HINT}</small></label>`;
}
/** «Comprova els correus»: el compte d'algú que ja és a la plantilla, però que no hi estava vinculat. */
async function linkAccount(email, mid) {
  const p = S.staff.get(email), m = S.members.get(mid);
  if (!p || !m) return;
  const acc = accountFor(mid);
  if (acc && acc.email !== email) { toast(`Aquesta fitxa ja és del compte ${acc.email}`); return; }
  const roles = ROLE_KEYS.filter(k => k === 'singer' || hasRole(p, k));
  const rec = { ...p, roles, role: roles[0], memberId: mid };
  try {
    await writeAccount(rec);
    if (hasRole(rec, 'leader') && rec.section === m.section && !m.leader) saveMember({ ...m, leader: true });
    toast(`${fullName(p.name || m.name)}: vinculat a la seva fitxa`);
    sheetMailCheck();
  } catch { toast('No s’ha pogut desar. Comprova la connexió.'); }
}
/* ---------- Invitacions ---------- */
// S'envien des del correu o el WhatsApp de qui administra: surten del seu nom i no gasten cap quota.
const firstName = n => { const t = String(n || '').trim(); return (t.includes(',') ? t.split(',').pop() : t.split(/\s+/)[0]).trim(); };
const isGoogleMail = e => /@(gmail|googlemail)\.com$/i.test(e || '');
const waPhone = p => { const m = p.memberId && S.members.get(p.memberId); return (m && m.phone || '').replace(/[^0-9]/g, '').replace(/^(\d{9})$/, '34$1'); };
const inviteSubject = () => `Accés a l’app ${ofName()}`;
function inviteText(p) {
  const hi = firstName(p.name);
  return [`Hola${hi ? `, ${hi}` : ''}!`, '',
    `T’he donat accés a A Tempo, l’app ${ofName()}: hi trobaràs el calendari, les llistes, el tauler${p.memberId ? ' i el teu espai personal' : ''}.`, '',
    `1. Obre aquest enllaç: ${appUrl()}`,
    `2. Entra amb el correu ${p.email}`,
    isGoogleMail(p.email) ? '   Toca «Entra amb Google».'
      : '   · Si és d’un compte de Google, toca «Entra amb Google».\n   · Si no, toca «Entra amb un altre correu» i, el primer cop, «Crea la teva contrasenya». T’arribarà un correu per confirmar-lo.', '',
    'Consell: obre-ho amb el Safari o el Chrome (no des del WhatsApp) i afegeix-ho a la pantalla d’inici per tenir-ho com una app.'].join('\n')
    + (S.me && S.me.name ? `\n\n${firstName(S.me.name)}` : '');
}
function inviteGroupText() {
  return ['Hola!', '',
    `Us he donat accés a A Tempo, l’app ${ofName()}: hi trobareu el calendari, les llistes, el tauler i el vostre espai personal.`, '',
    `1. Obriu aquest enllaç: ${appUrl()}`,
    '2. Entreu amb el correu on heu rebut aquest missatge.',
    '   · Si és de Gmail o d’un compte de Google, toqueu «Entra amb Google».',
    '   · Si no, toqueu «Entra amb un altre correu» i, el primer cop, «Crea la teva contrasenya». Us arribarà un correu per confirmar-lo.', '',
    'Consell: obriu-ho amb el Safari o el Chrome (no des del WhatsApp) i afegiu-ho a la pantalla d’inici per tenir-ho com una app.'].join('\n')
    + (S.me && S.me.name ? `\n\n${firstName(S.me.name)}` : '');
}
const mailAddr = e => String(e).replace(/\+/g, '%2B');
const mailtoUrl = ({ to = '', bcc = [], subject, body }) =>
  `mailto:${mailAddr(to)}?${[bcc.length ? `bcc=${bcc.map(mailAddr).join(',')}` : '', `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`].filter(Boolean).join('&')}`;
/** Remember who has been invited, so the list says who is still pending. */
async function markInvited(emails) {
  const at = new Date().toISOString();
  const list = emails.filter(e => S.staff.has(e));
  try {
    for (let i = 0; i < list.length; i += 400) {
      const b = fs.batch();
      for (const e of list.slice(i, i + 400)) { b.update(db.doc(`staff/${e}`), { invitedAt: at }); S.staff.set(e, { ...S.staff.get(e), invitedAt: at }); }
      await b.commit();
    }
  } catch {}
}
function sheetInvite(p, fresh) {
  const text = inviteText(p), tel = waPhone(p);
  openSheet({
    title: fresh ? `${firstName(p.name) || p.email} ja pot entrar` : `Convida ${p.name || p.email}`,
    body: `<p style="margin-top:0">${fresh ? 'Envia-li ara la invitació' : 'Envia-li la invitació'} des del teu correu${tel ? ' o pel WhatsApp' : ''}. Li explica com entrar${isGoogleMail(p.email) ? ' amb el seu compte de Google' : ', també si el seu correu no és de Google'}. Abans d’enviar-lo, el pots retocar al teu programa de correu.</p>
      <textarea class="summary-pre" readonly style="min-height:230px">${esc(text)}</textarea>
      ${p.invitedAt ? `<p class="muted" style="font-size:calc(13px*var(--ts));margin:8px 0 0">Última invitació: ${esc(agoText(p.invitedAt).toLowerCase())}.${p.lastSeen ? '' : ' Encara no ha entrat.'}</p>` : ''}`,
    foot: `<button class="btn" id="inv-copy">Copia</button>${tel ? `<a class="btn" id="inv-wa" href="https://wa.me/${tel}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<span class="spacer"></span><a class="btn btn-primary" id="inv-mail" href="${esc(mailtoUrl({ to: p.email, subject: inviteSubject(), body: text }))}">Envia per correu</a>`,
    onMount: el => {
      const sent = () => { markInvited([p.email]).then(() => { if (S.mode === 'shared') scheduleRender(); }); };
      el.querySelector('#inv-copy').onclick = () => { copyText(text, 'Invitació copiada'); sent(); };
      el.querySelector('#inv-wa')?.addEventListener('click', sent);
      el.querySelector('#inv-mail').addEventListener('click', sent);
    },
  });
}
/** Invite many people at once: one e-mail with everybody in Bcc (in groups, so the mail app can open it). */
const canEnterText = n => n === 1 ? '1 persona ja pot entrar' : `${n} persones ja poden entrar`;
function sheetInviteMany(people, added) {
  const list = people.filter(p => p && EMAIL_RE.test(p.email));
  if (!list.length) { closeSheet(); if (added) toast(canEnterText(added)); render(); return; }
  const text = inviteGroupText(), size = 40, chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  openSheet({
    title: added ? canEnterText(added) : 'Convida qui encara no ha entrat',
    wide: true,
    body: `<p style="margin-top:0">Envia’ls la invitació en un sol correu, amb tothom en <b>còpia oculta</b>: ningú no veurà els correus dels altres. ${chunks.length > 1 ? `Són ${list.length} persones: s’envia en ${chunks.length} correus de ${size} en ${size}.` : `${list.length === 1 ? 'És 1 persona.' : `Són ${list.length} persones.`}`}</p>
      <textarea class="summary-pre" readonly style="min-height:210px">${esc(text)}</textarea>
      <div class="pickers" style="margin-top:12px">${chunks.map((c, i) => `<a class="btn ${i === 0 ? 'btn-primary' : ''}" data-chunk="${i}" href="${esc(mailtoUrl({ bcc: c.map(p => p.email), subject: inviteSubject(), body: text }))}">${chunks.length > 1 ? `Correu ${i + 1} (${i * size + 1}–${i * size + c.length})` : 'Obre el correu'}</a>`).join('')}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Si el correu no s’obre, copia els correus i el missatge i enganxa’ls al teu programa de correu (els correus, a «Cco»).</p>`,
    foot: `<button class="btn" id="im-mails">Copia els correus</button><button class="btn" id="im-text">Copia el missatge</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Fet</button>`,
    onMount: el => {
      el.querySelectorAll('[data-chunk]').forEach(a => a.addEventListener('click', () => markInvited(chunks[+a.dataset.chunk].map(p => p.email))));
      el.querySelector('#im-mails').onclick = () => { copyText(list.map(p => p.email).join(', '), 'Correus copiats'); markInvited(list.map(p => p.email)); };
      el.querySelector('#im-text').onclick = () => copyText(text, 'Missatge copiat');
    },
  });
}
/* ---------- Moltes persones de cop ---------- */
// Una línia per persona, amb el nom i, si ha d'entrar a l'app, el correu (també les columnes d'un full de càlcul, i la
// corda si n'hi ha una columna). Qui ja és a la plantilla s'hi vincula; qui no, hi entra amb una fitxa nova; qui ja
// tenia accés conserva els seus rols i hi suma el nou. Els correus només els dona d'alta l'administració.
const MAIL_IN = /[^\s,;<>()"'«»]+@[^\s,;<>()"'«»]+\.[^\s,;<>()"'«».]+/;
/** La corda que diu una columna («S», «Soprano», «Sopranos»…), o ''. */
function sectionOf(t) {
  const n = normText(t).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return '';
  return SECTIONS.find(x => [x.id, x.short, x.name].some(v => normText(v) === n) || (n.length > 3 && normText(x.name).startsWith(n)))?.id || '';
}
/** Una línia enganxada: { name, mail, sec }, o null si és buida. */
function peopleLine(raw) {
  const cells = String(raw || '').split('\t').map(c => c.trim()).filter(Boolean);
  let mail = '', sec = '';
  const rest = [];
  for (const c of cells) {
    const hit = !mail && c.match(MAIL_IN);
    if (hit) { mail = hit[0].toLowerCase(); if (c.replace(hit[0], '').trim()) rest.push(c.replace(hit[0], ' ')); continue; }
    const s = cells.length > 1 && !sec ? sectionOf(c) : '';
    if (s) { sec = s; continue; }
    rest.push(c);
  }
  // Del full de càlcul: els cognoms i el nom poden anar en dues columnes; els telèfons i altres números, fora.
  const words = rest.map(c => c.replace(/\+?\d[\d\s.]{6,}\d/g, ' ').trim()).filter(c => /\p{L}/u.test(c) && !/\d/.test(c));
  const raw2 = words.length > 1 && !words[0].includes(',') ? `${words[0]}, ${words[1]}` : words[0] || '';
  const name = raw2.replace(/[<>()"«»]/g, ' ').replace(/(^|\s)[—–-]+(?=\s|$)/g, ' ').replace(/^[\s,;:·]+|[\s,;:·]+$/g, '').replace(/\s+/g, ' ').trim();
  return name || mail ? { name, mail, sec } : null;
}
/** Què es farà amb cada línia, amb el rol triat i la corda de les fitxes noves. */
function peoplePlan(text, role, section, admin) {
  const seen = new Set();
  return String(text || '').split(/\r?\n/).map(peopleLine).filter(Boolean).map(l => {
    const r = /** @type {any} */ ({ ...l, mailIgnored: !admin && !!l.mail });
    if (!admin) r.mail = '';
    const key = r.mail || normText(r.name);
    if (seen.has(key)) return { ...r, skip: 'Repetida a la llista' };
    seen.add(key);
    r.holder = r.mail ? S.staff.get(r.mail) || null : null;
    r.member = (r.name && rosterMatch(r.name, { free: false })) || S.members.get(r.holder?.memberId || '') || null;
    r.acc = r.member ? accountFor(r.member.id) : null;
    const singing = role === 'singer' || role === 'leader';
    r.sec = r.member?.section || r.sec || section;
    if (!r.name) r.name = r.member?.name || r.holder?.name || '';
    if (!r.name && (singing || !r.mail)) return { ...r, skip: 'Falta el nom' };
    if (!r.mail && !singing) return { ...r, skip: 'Falta el correu' };
    if (r.acc && r.mail && r.acc.email !== r.mail) return { ...r, skip: `Ja entra amb ${r.acc.email}` };
    if (r.holder?.memberId && r.member && r.holder.memberId !== r.member.id) return { ...r, skip: `Aquest correu ja és de ${r.holder.name || r.holder.email}` };
    r.singer = singing || !!r.member;
    r.newMember = singing && !r.member;
    const prev = r.holder || r.acc;
    // Qui la fitxa diu que és cap de corda, en tenir compte en té el permís.
    r.roles = r.mail ? ROLE_KEYS.filter(k => k === role || (k === 'singer' && r.singer) || (k === 'leader' && !prev && !!r.member?.leader) || hasRole(prev, k)) : [];
    r.adds = !!r.mail && (!prev || r.roles.some(k => !hasRole(prev, k)));
    r.status = r.newMember ? `Fitxa nova a ${SEC[r.sec].name}${r.mail ? ' · amb accés' : ' · sense correu'}`
      : !r.mail ? (r.acc ? 'Ja hi és, amb accés' : 'Ja és a la plantilla')
      : !prev ? (r.member ? `Ja és a la plantilla (${SEC[r.member.section].name}) · se li dona accés` : `Accés nou · ${roleLabel(role)}`)
      : r.adds ? `Ja té accés · s’hi suma ${roleLabel(role).toLowerCase()}` : 'Ja hi és, amb accés';
    return r;
  });
}
function sheetPeopleBulk(sec) {
  const admin = isAdmin();
  let role = 'singer';
  openSheet({
    title: 'Afegeix persones',
    wide: true,
    body: `<p style="margin-top:0">Una persona per línia: el nom${admin ? ' i, si ha d’entrar a l’app, el correu' : ''}. També hi pots enganxar les columnes d’un full de càlcul. Qui ja és a la plantilla no s’hi torna a afegir${admin ? ': se li dona accés' : ''}.</p>
      <div class="linkbox">Puig Ferrer, Anna${admin ? ' — anna@exemple.com' : ''}<br>Mata, Martina${admin ? ' &lt;martina@exemple.com&gt;' : ''}<br>Soler, Marta</div>
      <label class="field" style="margin-top:12px"><span>Llista</span><textarea class="inp" id="pb-text" style="min-height:150px" placeholder="Cognoms, Nom${admin ? '   correu@exemple.com' : ''}"></textarea></label>
      ${admin ? `<div class="field"><span>Què fan</span><div class="pickers" id="pb-role">${PERSON_ROLES.map(k => `<button type="button" class="pick" data-role="${k}" aria-pressed="${k === role}">${esc(roleLabel(k))}</button>`).join('')}</div>
        <small>Qui ja tenia accés conserva els rols que tenia i hi suma aquest.</small></div>` : ''}
      <div class="field" id="pb-sec-f"><span>${V.Section} de les fitxes noves</span><div class="pickers" id="pb-sec">${SECTIONS.map(x => secPick(x, x.id === (SEC_MAP[sec] ? sec : SECTIONS[0]?.id))).join('')}</div>
        <small>Si la llista porta una columna amb la ${V.section}, es fa servir la de cada línia.</small></div>
      <div id="pb-prev"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pb-save">Afegeix</button>`,
    onMount: el => {
      const q = s => el.querySelector(s);
      const section = () => q('#pb-sec .pick[aria-pressed="true"]')?.dataset.sec || SECTIONS[0]?.id;
      const plan = () => peoplePlan(q('#pb-text').value, role, section(), admin);
      const draw = () => {
        q('#pb-sec-f').hidden = role !== 'singer' && role !== 'leader';
        const rows = plan(), ok = rows.filter(r => !r.skip);
        if (!rows.length) { q('#pb-prev').innerHTML = ''; return; }
        const nNew = ok.filter(r => r.newMember).length, nMail = ok.filter(r => r.adds).length, bad = rows.length - ok.length;
        q('#pb-prev').innerHTML = `<p style="margin:0 0 8px;font-size:calc(13.5px*var(--ts))"><b>${rows.length}</b> ${rows.length === 1 ? 'persona' : 'persones'}${nNew ? ` · <b>${nNew}</b> ${nNew === 1 ? 'fitxa nova' : 'fitxes noves'}` : ''}${nMail ? ` · <b>${nMail}</b> amb accés` : ''}${bad ? ` · <b>${bad}</b> per revisar` : ''}</p>
          <ul class="mini-list" style="max-height:260px">${rows.map(r => `<li><span>${esc(r.name || r.mail)}${r.name && r.mail ? `<br><span class="m mono">${esc(r.mail)}</span>` : ''}<br><span class="m">${esc(r.skip || r.status)}</span></span>
            <span class="rsvp ${r.skip ? 'no' : r.newMember || r.adds ? 'yes' : 'none'}">${r.skip ? 'Revisa-la' : r.newMember ? 'Nova' : r.adds ? 'Accés' : 'Ja hi és'}</span></li>`).join('')}</ul>
          ${rows.some(r => r.mailIgnored) ? '<p class="muted" style="margin:8px 0 0;font-size:calc(13px*var(--ts))">Els correus només els pot donar d’alta l’administració: ara només s’afegiran els noms a la plantilla.</p>' : ''}`;
      };
      let t = 0;
      q('#pb-text').addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
      el.querySelectorAll('#pb-role .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#pb-role .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); role = b.dataset.role; draw(); });
      el.querySelectorAll('#pb-sec .pick').forEach(b => b.onclick = () => { el.querySelectorAll('#pb-sec .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
      draw();
      q('#pb-save').onclick = async e => {
        if (admin && staffLoading()) return;
        const rows = plan().filter(r => !r.skip && (r.newMember || r.adds || (role === 'leader' && r.member && !r.mail && !r.member.leader)));
        if (!rows.length) { toast(plan().length ? 'No hi ha ningú de nou per afegir' : 'Enganxa-hi la llista'); return; }
        const btn = e.currentTarget;
        btn.disabled = true;
        const at = new Date().toISOString(), accounts = [];
        let created = 0;
        try {
          for (const r of rows) {
            let m = r.member;
            if (r.newMember) {
              m = { id: uid('m'), name: r.name, section: r.sec, leader: false, active: true, joined: TODAY, history: [{ date: TODAY, kind: 'alta', note: '' }] };
              created++;
            }
            if (r.adds) {
              const prev = r.holder || r.acc || {};
              const rec = { ...prev, email: r.mail, name: prev.name || m?.name || r.name, role: r.roles[0], roles: r.roles, addedAt: prev.addedAt || at };
              delete rec.memberId; delete rec.section;
              if (r.roles.includes('singer') && m) rec.memberId = m.id;
              if (r.roles.includes('leader')) rec.section = prev.section || m?.section || r.sec;
              accounts.push(rec);
              if (m && rec.memberId === m.id) m = { ...m, leader: leadsOwn(m, rec) };
            } else if (m && role === 'leader' && !r.acc) m = { ...m, leader: true };
            if (m && (r.newMember || JSON.stringify(m) !== JSON.stringify(r.member))) { saveMember(m); await sleep(8); }
          }
          for (let i = 0; i < accounts.length; i += 200) {
            const b = fs.batch();
            for (const rec of accounts.slice(i, i + 200)) {
              b.set(db.doc(`staff/${rec.email}`), rec);
              if (GID === FOUNDER) b.set(fs.doc(`staffIndex/${rec.email}`), { choirId: GID });
            }
            await b.commit();
          }
          for (const rec of accounts) { S.staff.set(rec.email, rec); indexPerson(rec.email); }
          if (accounts.some(r => hasRole(r, 'voice')) && !classesOn()) saveConfig({ classesOn: true });
        } catch { btn.disabled = false; toast('No s’han pogut desar. Comprova la connexió i torna-ho a provar.'); render(); return; }
        render();
        const invite = accounts.filter(r => !r.lastSeen);
        if (invite.length) { sheetInviteMany(invite, accounts.length); return; }
        closeSheet();
        toast([created && `${created} ${created === 1 ? 'fitxa nova' : 'fitxes noves'} a la plantilla`, accounts.length && `${accounts.length} amb accés`].filter(Boolean).join(' · ') || 'Fet');
      };
    },
  });
}
/** Add this group to the person's list of groups, so they find it when they sign in. */
function indexPerson(mail) {
  fs.doc(`staffIndex/${mail}/agrupacions/${GID}`).set({ at: new Date().toISOString(), name: (S.config.name || '').slice(0, 80) }).catch(() => {});
}
/* ---------- «Mira l'app com…»: la vista prèvia de cada rol ---------- */
// L'administració pot veure l'app tal com la veu un cantaire, un cap de corda, la direcció, la gerència, la secretaria o un
// professor de cant. Es fa servir la fitxa real d'algú que tingui aquell rol (o una de genèrica si encara no n'hi ha cap).
// Només canvia el que es veu en aquest mòbil i no es desa res: ni els canvis de les llistes ni res que s'escrigui.
const PREVIEW_ROLES = ['singer', 'leader', 'director', 'gerencia', 'secretaria', 'voice'];
const previewLabel = r => ({ singer: V.Member, leader: capz(V.leader), director: 'Direcció', gerencia: 'Gerència', secretaria: 'Secretaria', voice: V.Teacher }[r] || r);
/** Les persones que es poden triar per a un rol: [{ key, label, person }]. */
function previewPeople(role) {
  if (role === 'singer') return membersOf(null).sort(byName).map(m => ({ key: m.id, label: `${m.name} · ${SEC[m.section].name}`, person: { roles: ['singer'], memberId: m.id, section: m.section, name: m.name, email: accountFor(m.id)?.email || '' } }));
  if (role === 'leader') return SECTIONS.map(x => {
    const p = peopleWithRole('leader').find(q => q.section === x.id);
    const m = p?.memberId ? S.members.get(p.memberId) : membersOf(x.id).find(q => q.leader);
    return { key: x.id, label: `${capz(V.leader)} de ${x.name.toLowerCase()}${p || m ? ` · ${fullName((p || m).name)}` : ''}`,
      person: { roles: p ? rolesOf(p).filter(r => r !== 'admin') : ['leader', ...(m ? ['singer'] : [])], section: x.id, memberId: p?.memberId || m?.id || '', name: p?.name || m?.name || '', email: p?.email || '' } };
  });
  if (role === 'voice') return teacherOptions().map(t => {
    const p = S.staff.get(t.key);
    return { key: t.key, label: t.name, person: { roles: p ? rolesOf(p).filter(r => r !== 'admin') : ['voice'], email: t.key, name: t.name, memberId: p?.memberId || '', section: p?.section || '' } };
  });
  const people = peopleWithRole(role).map(p => ({ key: p.email, label: fullName(p.name || p.email), person: { roles: rolesOf(p).filter(r => r !== 'admin'), email: p.email, name: p.name || '', memberId: p.memberId || '', section: p.section || '' } }));
  return people.length ? people : [{ key: '', label: `${previewLabel(role)} (encara no hi ha ningú amb aquest rol)`, person: { roles: [role], email: '', name: '', memberId: '', section: '' } }];
}
function sheetPreview() {
  ensureStaff();
  let role = 'singer';
  const paint = el => {
    const list = previewPeople(role);
    el.querySelector('#pv-who-l').textContent = role === 'singer' ? V.Member : role === 'leader' ? capz(V.section) : role === 'voice' ? V.Teacher : 'Qui';
    el.querySelector('#pv-who').innerHTML = list.map(x => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join('');
    el.querySelectorAll('#pv-role .pick').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === role)));
  };
  openSheet({
    title: 'Mira l’app com…',
    body: `<p style="margin-top:0">Tria un rol i una persona, i veuràs l’app tal com la veu. Només canvia en aquest mòbil i no es desa res del que facis. Se’n surt amb el botó de dalt.</p>
      <div class="field"><span>Rol</span><div class="pickers" id="pv-role">${PREVIEW_ROLES.filter(k => k !== 'voice' || classesOn()).map(k => `<button type="button" class="pick" data-k="${k}" aria-pressed="${k === role}">${esc(previewLabel(k))}</button>`).join('')}</div></div>
      <label class="field"><span id="pv-who-l">${esc(V.Member)}</span><select class="inp" id="pv-who"></select></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pv-ok">Mira-ho</button>`,
    onMount: el => {
      paint(el);
      el.querySelectorAll('#pv-role .pick').forEach(b => b.onclick = () => { role = b.dataset.k; paint(el); });
      // El personal pot arribar després d'obrir la finestra.
      const t = setInterval(() => { if (!document.body.contains(el)) { clearInterval(t); return; } if (S.staffReady) { clearInterval(t); const v = el.querySelector('#pv-who').value; paint(el); el.querySelector('#pv-who').value = v; } }, 300);
      el.querySelector('#pv-ok').onclick = () => {
        const pick = previewPeople(role).find(x => x.key === el.querySelector('#pv-who').value);
        if (!pick) { toast('Tria qui vols veure'); return; }
        const label = previewLabel(role);
        closeSheet();
        startPreview({ ...pick.person, label, role });
      };
    },
  });
}
let REAL_FS = null;
function startPreview(p) {
  PREVIEW = { ...p, roles: p.roles.length ? p.roles : ['singer'], blocked: false, blockedAt: 0 };
  // Cap escriptura arriba a la base de dades: ni les de les finestres ni les de qualsevol altre lloc.
  if (!REAL_FS) { REAL_FS = fs; fs = previewFs(REAL_FS); }
  ui.tab = 'avisos'; ui.rollSec = null; ui.clWho = null; ui.sessionId = null;
  document.body.classList.toggle('ro', !canEdit());
  render(); window.scrollTo({ top: 0 });
}
function stopPreview() {
  const blocked = PREVIEW && PREVIEW.blocked;
  PREVIEW = null;
  if (REAL_FS) { fs = REAL_FS; REAL_FS = null; }
  // Si s'hi ha tocat res, aquest mòbil ho té canviat a la pantalla (però no desat): es torna a carregar tal com és.
  if (blocked) { location.reload(); return; }
  ui.tab = 'gestio'; ui.manage = 'personal'; ui.rollSec = null; ui.clWho = null;
  document.body.classList.toggle('ro', !canEdit());
  render(); window.scrollTo({ top: 0 });
}
/** A la vista prèvia no es desa res: s'avisa (un cop cada pocs segons) i es recorda per refer la pantalla en sortir. */
function previewBlocked() {
  if (!PREVIEW) return;
  const first = Date.now() - PREVIEW.blockedAt > 2500;
  PREVIEW.blocked = true; PREVIEW.blockedAt = Date.now();
  if (first) toast('Vista prèvia: no s’ha desat res');
}
/** La base de dades vista des de la vista prèvia: es pot llegir, però cap escriptura no surt del mòbil. */
function previewFs(real) {
  const no = () => { previewBlocked(); return Promise.reject(Object.assign(new Error('Vista prèvia'), { code: 'preview' })); };
  const pass = (o, k) => { const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; };
  const wrap = t => new Proxy(t, { get: (o, k) => typeof k === 'string' && ['set', 'update', 'delete', 'add'].includes(k) ? no : k === 'doc' || k === 'collection' ? (...a) => wrap(o[k](...a)) : pass(o, k) });
  return new Proxy(real, { get: (o, k) => k === 'doc' || k === 'collection' ? (...a) => wrap(o[k](...a))
    : k === 'batch' ? () => ({ set() {}, update() {}, delete() {}, commit: no }) : k === 'runTransaction' ? no : pass(o, k) });
}
