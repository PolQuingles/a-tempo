// A Tempo · 21b-converses.js — Converses privades entre cada persona de la plantilla i l'equip (direcció, gerència,
// secretaria, el seu cap de corda, el seu professor de cant…), i les respostes als missatges i als anuncis.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Converses ---------- */
// threads/<id> = { id, memberId, memberName, section, toRole ('director' | 'gerencia' | 'secretaria' | 'admin' | 'leader' | ''),
//   toEmail (una persona concreta de l'equip, p. ex. qui ha escrit l'anunci), toName, subject, ref ('ann:<id>' | 'msg:<id>' | ''),
//   msgs: [{ by (correu), name, side: 'm' (la persona de la plantilla) | 's' (l'equip), text, at }], lastAt, lastSide, readM, readS, createdAt }.
// Les regles només la deixen llegir a qui hi participa: la persona i qui tingui aquell rol (els caps de corda, només els de la
// seva corda) o aquell correu. Així un dubte, una al·lèrgia o «no puc venir al cap de setmana» no passen per cap correu ni grup.
// Arriba al mòbil com un avís (avisos.py, «missatges»).
const THREAD_ROLES = { director: 'Direcció', gerencia: 'Gerència', secretaria: 'Secretaria', admin: 'Administració' };
const THREAD_MAX = 2000;
/** L'administració apunta a la configuració quins rols hi ha a l'equip, perquè la plantilla sàpiga a qui pot escriure. */
function noteTeamRoles() {
  if (!isAdmin() || !S.staffReady) return;
  const roles = new Set();
  for (const p of S.staff.values()) for (const r of rolesOf(p)) {
    if (THREAD_ROLES[r]) roles.add(r);
    if (r === 'leader' && p.section) roles.add(`leader:${p.section}`);
  }
  const list = [...roles].sort();
  if (list.join() !== (S.config.teamRoles || []).join()) saveConfig({ teamRoles: list });
}
const threadSide = t => t.memberId && t.memberId === myId() ? 'm' : 's';
const threadUnread = t => { const side = threadSide(t); return t.lastSide && t.lastSide !== side && (side === 'm' ? t.readM || '' : t.readS || '') < (t.lastAt || ''); };
const threadsSorted = () => [...S.threads.values()].sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
const unreadThreads = () => threadsSorted().filter(threadUnread);
/** Amb qui parlo: per a la persona, l'equip a qui ha escrit; per a l'equip, la persona. */
function threadWho(t) {
  if (threadSide(t) === 'm') return t.toName || THREAD_ROLES[t.toRole] || (t.toRole === 'leader' ? `${capz(V.leader)} de ${SEC[t.section].name.toLowerCase()}` : 'Equip');
  return `${fullName(t.memberName || S.members.get(t.memberId)?.name || '')} · ${SEC[t.section].name}`;
}
/** Es llegeixen les converses on participo: les meves (com a persona de la plantilla) i les adreçades als meus rols o al meu correu. */
let threadWatch = null;
function watchThreads() {
  if (threadWatch || !db) return;
  const parts = [];
  const take = () => { S.threads = new Map(parts.flatMap(p => [...p])); if (S.ready) scheduleRender(); };
  const on = q => { const i = parts.push(new Map()) - 1; return q.onSnapshot(snap => { parts[i] = new Map(snap.docs.map(d => [d.id, d.data()])); take(); }, () => {}); };
  const qs = [];
  if (S.memberId) qs.push(db.collection('threads').where('memberId', '==', S.memberId));
  for (const r of Object.keys(THREAD_ROLES)) if (hasRole(S.me, r)) qs.push(db.collection('threads').where('toRole', '==', r));
  if (hasRole(S.me, 'leader') && S.me.section) qs.push(db.collection('threads').where('toRole', '==', 'leader').where('section', '==', S.me.section));
  if (S.email) qs.push(db.collection('threads').where('toEmail', '==', S.email));
  threadWatch = qs.map(on);
}
/** A qui pot escriure la persona: els rols que hi ha a l'equip, el seu cap de corda i el seu professor de cant. */
function threadTargets() {
  const me = S.members.get(myId() || '');
  const have = new Set(S.config.teamRoles || []);
  const out = [];
  if (me && have.has(`leader:${me.section}`)) out.push({ k: 'leader', label: `El teu ${V.leader}`, toRole: 'leader', toEmail: '', toName: '' });
  for (const [r, l] of Object.entries(THREAD_ROLES)) if (r !== 'admin' && have.has(r)) out.push({ k: r, label: l, toRole: r, toEmail: '', toName: '' });
  const teachers = new Map();
  if (me) for (const c of classDays()) if ((c.teacher || '').includes('@') && (c.slots || []).some(x => x.memberId === me.id)) teachers.set(c.teacher, teacherOf(c));
  for (const [mail, name] of teachers) out.push({ k: `t:${mail}`, label: `${name} (${V.Teacher.toLowerCase()})`, toRole: '', toEmail: mail, toName: name });
  if (have.has('admin') || !out.length) out.push({ k: 'admin', label: 'Administració', toRole: 'admin', toEmail: '', toName: '' });
  return out;
}
/** Es pot respondre a qui ha escrit un anunci o un missatge: si en sabem el correu i qui respon és de la plantilla. */
const canReply = by => !!by && by !== myEmail() && !!myId() && !PREVIEW;
/** Respondre un anunci o un missatge: continua la conversa que ja hi ha sobre aquell escrit, o en comença una. */
function replyTo(ref) {
  const [kind, id] = ref.split(':');
  const src = kind === 'ann' ? S.announcements.get(id) : S.messages.get(id);
  if (!src || !src.by) return;
  const open = threadsSorted().find(t => t.ref === ref && t.memberId === myId());
  if (open) return sheetThread(open.id);
  sheetThreadNew({ toEmail: src.by, toName: fullName(src.byName || src.author || ''), subject: src.title || (kind === 'ann' ? 'Anunci' : 'Missatge'), ref });
}
function threadRow(t) {
  const last = (t.msgs || [])[(t.msgs || []).length - 1] || {};
  return `<li class="li"><button data-act="thread" data-id="${esc(t.id)}"><span>${threadUnread(t) ? '<i class="dot-new" aria-label="Nou"></i>' : ''}<span class="t">${esc(threadWho(t))}</span>${t.subject ? ` <span class="m">· ${esc(t.subject)}</span>` : ''}
    <br><span class="s">${esc(last.side === threadSide(t) ? 'Tu: ' : '')}${esc(cutText(last.text || '', 90))}</span></span><span class="mono m">${esc(t.lastAt ? ddmm(t.lastAt.slice(0, 10)) : '')}</span></button></li>`;
}
function sheetThreads() {
  const list = threadsSorted();
  openSheet({
    title: 'Converses',
    wide: true,
    body: `<p class="muted" style="margin:0 0 10px;font-size:calc(13px*var(--ts))">${myId() ? `Escriu a l’equip ${esc(V.del)} sense correus ni WhatsApp: només ho veuen tu i a qui escrius.` : 'Les converses privades amb la plantilla: només les veuen la persona i qui té el rol a qui ha escrit.'}</p>
      ${list.length ? `<ul class="list">${list.map(threadRow).join('')}</ul>` : '<div class="panel" style="padding:14px;color:var(--muted);font-size:calc(13.5px*var(--ts))">Encara no hi ha cap conversa.</div>'}`,
    foot: myId() && !PREVIEW ? '<span class="spacer"></span><button class="btn btn-primary" data-act="thread-new">Escriu a l’equip</button>' : '',
  });
}
function sheetThreadNew(preset = {}) {
  const me = S.members.get(myId() || '');
  if (!me) return;
  const targets = preset.toEmail ? [{ k: 'x', label: preset.toName || preset.toEmail, toRole: '', toEmail: preset.toEmail, toName: preset.toName }] : threadTargets();
  let pick = targets[0];
  openSheet({
    title: preset.ref ? 'Respon' : 'Escriu a l’equip',
    body: `<div class="kv">
      ${targets.length > 1 ? `<div class="field"><span>A qui</span><div class="pickers" id="th-to">${targets.map((x, i) => `<button type="button" class="pick" data-i="${i}" aria-pressed="${i === 0}">${esc(x.label)}</button>`).join('')}</div></div>`
        : `<p style="margin:0">Per a <b>${esc(pick.label)}</b>${preset.subject ? ` · sobre «${esc(preset.subject)}»` : ''}</p>`}
      ${preset.ref ? '' : '<label class="field"><span>Sobre què (opcional)</span><input class="inp" id="th-subject" maxlength="80" placeholder="p. ex. Al·lèrgies · Uniforme · Audició"></label>'}
      <label class="field"><span>Missatge</span><textarea class="inp" id="th-text" maxlength="${THREAD_MAX}" style="min-height:130px" placeholder="Escriu aquí…"></textarea></label>
      <p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Només ho veuen tu i a qui escrius. Et respondran aquí mateix i t’arribarà un avís al mòbil.</p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="th-send">Envia</button>`,
    onMount: el => {
      el.querySelectorAll('#th-to .pick').forEach(b => b.onclick = () => { pick = targets[+b.dataset.i]; el.querySelectorAll('#th-to .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      el.querySelector('#th-send').onclick = async e => {
        const btn = e.currentTarget;
        const text = el.querySelector('#th-text').value.trim();
        if (!text) { toast('Escriu el missatge'); return; }
        const at = new Date().toISOString();
        const rec = { id: uid('th'), memberId: me.id, memberName: me.name, section: me.section, toRole: pick.toRole || '', toEmail: pick.toEmail || '', toName: pick.toName || pick.label || '',
          subject: preset.subject || el.querySelector('#th-subject')?.value.trim() || '', ref: preset.ref || '',
          msgs: [{ by: S.email || '', name: fullName(me.name), side: 'm', text, at }], lastAt: at, lastSide: 'm', readM: at, readS: '', createdAt: at };
        btn.disabled = true;
        try { await db.doc(`threads/${rec.id}`).set(rec); S.threads.set(rec.id, rec); closeSheet(); toast('Missatge enviat'); render(); }
        catch { btn.disabled = false; toast('No s’ha pogut enviar. Comprova la connexió.'); }
      };
    },
  });
}
function sheetThread(id) {
  const t = S.threads.get(id);
  if (!t) return;
  const side = threadSide(t);
  const bubbles = () => (S.threads.get(id)?.msgs || []).map(m => `<div class="bubble ${m.side === side ? 'mine' : ''}"><div class="rich">${richText(m.text)}</div><small>${esc(m.side === side ? 'Tu' : m.name || '')} · ${esc(ddmm(m.at.slice(0, 10)))} ${esc(m.at.slice(11, 16))}</small></div>`).join('');
  openSheet({
    title: threadWho(t),
    wide: true,
    body: `${t.subject ? `<p class="muted" style="margin:0 0 8px;font-size:calc(13px*var(--ts))">${esc(t.subject)}</p>` : ''}<div class="bubbles" id="th-list">${bubbles()}</div>
      ${PREVIEW ? '' : `<label class="field" style="margin-top:12px"><span class="sr">Resposta</span><textarea class="inp" id="th-text" maxlength="${THREAD_MAX}" style="min-height:90px" placeholder="Respon…"></textarea></label>`}`,
    foot: PREVIEW ? '' : '<span class="spacer"></span><button class="btn btn-primary" id="th-send">Envia</button>',
    onMount: el => {
      const list = el.querySelector('#th-list');
      list.lastElementChild?.scrollIntoView({ block: 'nearest' });
      // Llegida: es desa quan l'altra banda ha escrit alguna cosa nova.
      if (threadUnread(t) && !PREVIEW) {
        const at = new Date().toISOString(), k = side === 'm' ? 'readM' : 'readS';
        db.doc(`threads/${id}`).update({ [k]: at }).then(() => { t[k] = at; renderTabs(); }).catch(() => {});
      }
      el.querySelector('#th-send')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        const text = el.querySelector('#th-text').value.trim();
        if (!text) return;
        const cur = S.threads.get(id) || t, at = new Date().toISOString();
        const msg = { by: S.email || '', name: side === 'm' ? fullName(cur.memberName || '') : fullName(S.me?.name || S.email || ''), side, text, at };
        const patch = { msgs: [...(cur.msgs || []), msg].slice(-300), lastAt: at, lastSide: side, [side === 'm' ? 'readM' : 'readS']: at };
        btn.disabled = true;
        try {
          await db.doc(`threads/${id}`).update(patch);
          S.threads.set(id, { ...cur, ...patch });
          el.querySelector('#th-text').value = '';
          list.innerHTML = bubbles(); list.lastElementChild?.scrollIntoView({ block: 'nearest' });
        } catch { toast('No s’ha pogut enviar. Comprova la connexió.'); }
        btn.disabled = false;
      });
    },
  });
}
