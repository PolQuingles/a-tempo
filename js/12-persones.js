// A Tempo · 12-persones.js — Persones i accés a l'app, i invitacions.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- People and access (Google accounts) ---------- */
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
function sheetStaff(email, preset) {
  const existing = email ? S.staff.get(email) : null;
  const p = existing ? { ...existing } : { email: '', name: '', section: SECTIONS[0]?.id || '', memberId: '' };
  const roles = existing ? rolesOf(existing) : (preset || []).filter(r => ROLE_KEYS.includes(r)).length ? preset : ['singer'];
  openSheet({
    title: existing ? (p.name || p.email) : 'Dona accés a una persona',
    body: `<div class="kv">
      <label class="field"><span>Correu (compte de Google)</span><input class="inp" id="st-email" type="email" autocomplete="off" value="${esc(p.email)}" ${existing ? 'disabled' : ''} placeholder="nom@gmail.com"></label>
      <label class="field"><span>Nom</span><input class="inp" id="st-name" type="text" maxlength="60" value="${esc(p.name || '')}" placeholder="p. ex. Quingles, Pol"></label>
      <div class="field"><span>Rols <span class="muted" style="font-weight:500">· pots triar-ne més d’un</span></span><div class="pickers" id="st-role">${ROLE_KEYS.map(k => `<button type="button" class="pick" data-role="${k}" aria-pressed="${roles.includes(k)}">${esc(roleLabel(k))}</button>`).join('')}</div>
        <small id="st-hint">${esc(rolesHint(roles))}</small></div>
      <div class="field" id="st-sec-f" ${roles.includes('leader') ? '' : 'hidden'}><span>${V.Section} que porta</span><div class="pickers" id="st-sec">${SECTIONS.map(x => secPick(x, p.section === x.id)).join('')}</div></div>
      <label class="field" id="st-mem-f" ${roles.includes('singer') ? '' : 'hidden'}><span>Fitxa de la plantilla</span>
        <select class="inp" id="st-mem"><option value="">— tria qui és —</option>${memberOptions(p.memberId || '')}</select>
        <small>Vincula el compte amb la seva fitxa: així, a Inici, pot avisar d’absències, confirmar convocatòries i veure la seva assistència.</small></label>
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="st-del">Treu l’accés</button>' : ''}<span class="spacer"></span>${existing && !existing.lastSeen ? '<button class="btn" id="st-inv">Convida</button>' : ''}<button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="st-save">Desa</button>`,
    onMount: el => {
      el.querySelector('#st-inv')?.addEventListener('click', () => sheetInvite(S.staff.get(existing.email) || existing));
      const picked = () => [...el.querySelectorAll('#st-role .pick[aria-pressed="true"]')].map(x => x.dataset.role);
      el.querySelectorAll('#st-role .pick').forEach(b => b.onclick = () => {
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
        const now = picked();
        el.querySelector('#st-sec-f').hidden = !now.includes('leader');
        el.querySelector('#st-mem-f').hidden = !now.includes('singer');
        el.querySelector('#st-hint').textContent = rolesHint(now);
      });
      el.querySelectorAll('#st-sec .pick').forEach(b => b.onclick = () => el.querySelectorAll('#st-sec .pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      el.querySelector('#st-save').onclick = async () => {
        const mail = (existing ? p.email : el.querySelector('#st-email').value).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { toast('Escriu un correu vàlid'); return; }
        const roles = picked();
        if (!roles.length) { toast('Tria almenys un rol'); return; }
        const memberId = roles.includes('singer') ? el.querySelector('#st-mem').value : '';
        if (roles.includes('singer') && !memberId) { toast(`Tria de qui de la plantilla és aquest correu, o treu-li el rol de ${V.member}`); return; }
        const sec = el.querySelector('#st-sec .pick[aria-pressed="true"]')?.dataset.sec;
        if (roles.includes('leader') && !sec) { toast(`Tria quina ${V.section} porta`); return; }
        const clash = memberId && [...S.staff.values()].find(x => x.memberId === memberId && x.email !== mail);
        if (clash) { toast(`Aquesta fitxa ja està vinculada a ${clash.email}`); return; }
        const rec = { email: mail, name: el.querySelector('#st-name').value.trim() || S.members.get(memberId)?.name || '', role: roles[0], roles, addedAt: existing?.addedAt || new Date().toISOString() };
        if (existing?.lastSeen) rec.lastSeen = existing.lastSeen;
        if (existing?.invitedAt) rec.invitedAt = existing.invitedAt;
        if (roles.includes('leader')) rec.section = sec;
        if (memberId) rec.memberId = memberId;
        if (existing && hasRole(existing, 'admin') && !roles.includes('admin') && [...S.staff.values()].filter(x => hasRole(x, 'admin')).length === 1) { toast('Ha de quedar almenys una persona d’administració'); return; }
        try {
          const b = fs.batch();
          b.set(db.doc(`staff/${mail}`), rec);
          if (GID === FOUNDER) b.set(fs.doc(`staffIndex/${mail}`), { choirId: GID });
          await b.commit();
          indexPerson(mail);
          S.staff.set(mail, rec);
          if (roles.includes('voice') && !classesOn() && isAdmin()) saveConfig({ classesOn: true });
          if (existing) { closeSheet(); toast('Canvis desats'); render(); }
          else { render(); sheetInvite(rec, true); }
        } catch { toast('No s’ha pogut desar. Només l’administració pot donar accessos.'); }
      };
      const del = el.querySelector('#st-del');
      if (del) del.onclick = async () => {
        if (S.me && S.me.email === p.email) { toast('No et pots treure a tu mateix'); return; }
        if (!await confirmSheet('Treure l’accés?', `<b>${esc(p.name || p.email)}</b> deixarà d’entrar a l’app a l’instant. La seva fitxa de la plantilla i les llistes no es toquen.`, 'Treu')) return;
        try {
          await db.doc(`staff/${p.email}`).delete();
          fs.doc(`staffIndex/${p.email}/agrupacions/${GID}`).delete().catch(() => {});
          if (GID === FOUNDER) fs.doc(`staffIndex/${p.email}`).delete().catch(() => {});
          S.staff.delete(p.email); closeSheet(); toast('Accés retirat'); render();
        } catch { toast('No s’ha pogut treure. Comprova la connexió.'); }
      };
    },
  });
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
function sheetInviteMany(people, added) {
  const list = people.filter(p => p && EMAIL_RE.test(p.email));
  if (!list.length) { closeSheet(); if (added) toast(`${added} persones ja poden entrar`); render(); return; }
  const text = inviteGroupText(), size = 40, chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  openSheet({
    title: added ? `${added} persones ja poden entrar` : 'Convida qui encara no ha entrat',
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
/** Paste a list of «name — email» lines and match them to the roster. */
function sheetStaffBulk() {
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const roster = membersOf(null, true).map(m => ({ m, key: norm(m.name), parts: norm(m.name).split(' ').filter(w => w.length > 2) }));
  const findMember = (name, mail) => {
    const cands = [name, mail.split('@')[0].replace(/[._-]+/g, ' ')].filter(Boolean).map(norm);
    for (const c of cands) {
      if (!c) continue;
      const exact = roster.find(r => r.key === c);
      if (exact) return exact.m;
      const words = c.split(' ').filter(w => w.length > 2);
      if (words.length < 2) continue;
      const hits = roster.filter(r => words.every(w => r.parts.includes(w)));
      if (hits.length === 1) return hits[0].m;
    }
    return null;
  };
  const parse = text => text.split(/\r?\n/).map(line => {
    const mail = (line.match(/[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]+/) || [])[0];
    if (!mail) return null;
    const name = line.replace(mail, '').replace(/[<>();]/g, '').replace(/[,;\t]+/g, ' ').trim().replace(/\s+/g, ' ');
    return { mail: mail.toLowerCase(), name, member: findMember(name, mail.toLowerCase()) };
  }).filter(Boolean);
  let rows = [];
  const draw = el => {
    const box = el.querySelector('#bk-prev');
    if (!rows.length) { box.innerHTML = '<span class="muted" style="font-size:calc(13px*var(--ts))">Enganxa les línies i prem «Comprova».</span>'; return; }
    const ok = rows.filter(r => r.member).length;
    box.innerHTML = `<p style="margin:0 0 8px;font-size:calc(13.5px*var(--ts))"><b>${rows.length}</b> correus · <b>${ok}</b> vinculats a la plantilla${ok < rows.length ? ` · <b>${rows.length - ok}</b> sense vincular` : ''}</p>
      <ul class="mini-list" style="max-height:260px">${rows.map((r, i) => `<li><span>${esc(r.mail)}<br><span class="m">${r.member ? esc(r.member.name) + ' · ' + esc(SEC[r.member.section].name) : 'sense fitxa — es desarà com a ' + (r.name ? esc(r.name) : 'només correu')}</span></span>
        <span class="rsvp ${r.member ? 'yes' : 'none'}">${r.member ? 'Vinculat' : 'Sense vincle'}</span></li>`).join('')}</ul>`;
  };
  openSheet({
    title: 'Afegeix correus en bloc',
    wide: true,
    body: `<p style="margin-top:0">Enganxa una línia per persona, amb el nom i el correu en qualsevol ordre. Per exemple:</p>
      <div class="linkbox">Quingles, Pol — pol@exemple.com<br>Mata, Martina &lt;martina@exemple.com&gt;<br>anna@exemple.com</div>
      <label class="field" style="margin-top:12px"><span>Llista</span><textarea class="inp" id="bk-text" style="min-height:150px" placeholder="Cognom, Nom  correu@exemple.com"></textarea></label>
      <div class="field"><span>Rol per a tothom</span><div class="pickers" id="bk-role">${ROLE_KEYS.map(k => `<button type="button" class="pick" data-role="${k}" aria-pressed="${k === 'singer'}">${esc(roleLabel(k))}</button>`).join('')}</div>
        <small>Qui ja hi era conserva els rols que tenia i hi suma aquest. Els altres rols es donen d’un en un.</small></div>
      <div id="bk-prev" style="margin-top:10px"></div>`,
    foot: `<button class="btn" id="bk-check">Comprova</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="bk-save">Desa’ls</button>`,
    onMount: el => {
      draw(el);
      el.querySelectorAll('#bk-role .pick').forEach(b => b.onclick = () => el.querySelectorAll('#bk-role .pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      el.querySelector('#bk-check').onclick = () => { rows = parse(el.querySelector('#bk-text').value); draw(el); };
      el.querySelector('#bk-save').onclick = async () => {
        if (!rows.length) rows = parse(el.querySelector('#bk-text').value);
        if (!rows.length) { toast('No hi ha cap correu a la llista'); return; }
        const role = el.querySelector('#bk-role .pick[aria-pressed="true"]').dataset.role;
        if (role === 'singer' && rows.some(r => !r.member)) { toast('Hi ha correus sense fitxa a la plantilla. Corregeix el nom o afegeix-los d’un en un.'); return; }
        const at = new Date().toISOString();
        const taken = new Set([...S.staff.values()].map(x => x.memberId).filter(Boolean));
        let n = 0;
        try {
          for (let i = 0; i < rows.length; i += 200) {
            const b = fs.batch();
            for (const r of rows.slice(i, i + 200)) {
              const prev = S.staff.get(r.mail);
              const roles = ROLE_KEYS.filter(k => k === role || hasRole(prev, k));
              const rec = { ...(prev || {}), email: r.mail, name: r.member?.name || r.name || prev?.name || '', role: roles[0], roles, addedAt: prev?.addedAt || at };
              const mid = roles.includes('singer') ? (prev?.memberId || r.member?.id || '') : '';
              delete rec.memberId;
              if (mid && (!taken.has(mid) || prev?.memberId === mid)) { rec.memberId = mid; taken.add(mid); }
              if (roles.includes('leader') && (prev?.section || r.member?.section)) rec.section = prev?.section || r.member.section;
              b.set(db.doc(`staff/${r.mail}`), rec);
              if (GID === FOUNDER) b.set(fs.doc(`staffIndex/${r.mail}`), { choirId: GID });
              S.staff.set(r.mail, rec); n++;
            }
            await b.commit();
          }
          for (const r of rows) indexPerson(r.mail);
          render(); sheetInviteMany(rows.map(r => S.staff.get(r.mail)).filter(p => p && !p.lastSeen), n);
        } catch { toast('No s’han pogut desar. Només l’administració pot donar accessos.'); render(); }
      };
    },
  });
}
/** Add this group to the person's list of groups, so they find it when they sign in. */
function indexPerson(mail) {
  fs.doc(`staffIndex/${mail}/agrupacions/${GID}`).set({ at: new Date().toISOString(), name: (S.config.name || '').slice(0, 80) }).catch(() => {});
}
/** See the app the way a member sees it: read-only, with their own space. */
function sheetPreview() {
  openSheet({
    title: `Mira-ho com un ${V.member}`,
    body: `<p style="margin-top:0">Tria qui vulguis de la plantilla i veuràs l’app exactament com la veu: pot consultar-ho tot, però no pot canviar res. Només afecta aquest mòbil i se’n surt amb un botó.</p>
      <label class="field"><span>${V.Member}</span><select class="inp" id="pv-m">${memberOptions(myId() || '')}</select></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pv-ok">Mira-ho</button>`,
    onMount: el => {
      el.querySelector('#pv-ok').onclick = () => {
        const id = el.querySelector('#pv-m').value;
        if (!id) { toast(`Tria un ${V.member}`); return; }
        PREVIEW = { memberId: id };
        ui.tab = 'avisos'; ui.rollSec = null;
        closeSheet(); render(); window.scrollTo({ top: 0 });
      };
    },
  });
}
