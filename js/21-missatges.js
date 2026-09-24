// A Tempo · 21-missatges.js — Missatges dins de l'app (sense correu ni WhatsApp) i notes de seguiment de cada persona.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Missatges ---------- */
// messages/<id> = { id, to: ['*'] (tothom) o [corda…], title, body, by (correu), byName, byRole, createdAt }.
// Els caps de corda escriuen només a la seva corda; administració, direcció, gerència i secretaria, a tothom o a les
// cordes que triïn. Les regles només deixen llegir cada missatge a qui és de la corda (i a l'equip), i arriba al mòbil
// com un avís (avisos.py, «missatges»).
const LS_MSG = 'atempo:missatges-vist';
const MSG_DAYS = 120;
const WRITE_ALL = ['admin', 'director', 'gerencia', 'secretaria'];
const canWriteAll = () => !PREVIEW && WRITE_ALL.some(r => hasRole(S.me, r));
const myLeadSection = () => !PREVIEW && hasRole(S.me, 'leader') && S.me.section && SEC_MAP[S.me.section] ? S.me.section : null;
const canMessage = () => canWriteAll() || !!myLeadSection();
const mySectionNow = () => S.members.get(myMemberId())?.section || null;
const msgTo = m => (m.to || []).includes('*') ? 'A tothom' : `A ${(m.to || []).map(x => SEC_MAP[x] ? SEC[x].name.toLowerCase() : x).join(', ')}`;
/** Els missatges que són per a mi: a tothom, a la meva corda (o la que porto) i els que he escrit. */
function messagesForMe(all) {
  const secs = [mySectionNow(), myLeadSection()].filter(Boolean);
  return [...S.messages.values()]
    .filter(m => all || m.by === S.email || (m.to || []).includes('*') || (m.to || []).some(x => secs.includes(x)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
const unreadMessages = () => { const seen = lsGet(LS_MSG) || ''; return messagesForMe().filter(m => (m.createdAt || '') > seen && m.by !== S.email); };
/** Es llegeixen quan ja se sap de quina corda és cadascú: l'equip, tots els recents; la resta, els seus (dues consultes). */
let msgWatch = null;
function watchMessages() {
  if (msgWatch || !db) return;
  const since = new Date(Date.now() - MSG_DAYS * 864e5).toISOString();
  const take = parts => { S.messages = new Map(parts.flatMap(p => [...p])); if (S.ready) scheduleRender(); };
  if (canEdit()) {
    msgWatch = db.collection('messages').where('createdAt', '>=', since).onSnapshot(snap => take([new Map(snap.docs.map(d => [d.id, d.data()]))]), () => {});
    return;
  }
  const sec = mySectionNow();
  const got = [new Map(), new Map()];
  const on = (i, q) => q.onSnapshot(snap => { got[i] = new Map(snap.docs.map(d => [d.id, d.data()]).filter(([, m]) => (m.createdAt || '') >= since)); take(got); }, () => {});
  msgWatch = [on(0, db.collection('messages').where('to', 'array-contains', '*')), sec ? on(1, db.collection('messages').where('to', 'array-contains', sec)) : null];
}
function msgCard(m, full) {
  const seen = lsGet(LS_MSG) || '';
  const fresh = (m.createdAt || '') > seen && m.by !== S.email;
  const body = full || (m.body || '').length <= 180 ? m.body || '' : `${m.body.slice(0, 180)}…`;
  return `<article class="msg${fresh ? ' new' : ''}">
    <div class="msg-h"><b>${esc(m.byName || 'Equip')}</b><span class="m">${esc(m.byRole || '')}${m.byRole ? ' · ' : ''}${esc(msgTo(m))}</span><span class="mono m">${esc(m.createdAt ? `${ddmm(m.createdAt.slice(0, 10))} ${m.createdAt.slice(11, 16)}` : '')}</span></div>
    ${m.title ? `<b class="msg-t">${esc(m.title)}</b>` : ''}
    <div class="msg-b">${linkify(body)}</div>
    ${full && (m.by === S.email || isAdmin()) ? `<button class="btn btn-sm btn-ghost" data-act="msg-del" data-id="${esc(m.id)}">Esborra’l</button>` : ''}
  </article>`;
}
/** A Inici: els últims missatges i el botó per escriure'n. */
function messagesBlock() {
  const list = messagesForMe();
  if (!list.length && !canMessage()) return '';
  const lead = myLeadSection();
  const write = canWriteAll() ? '<button class="btn btn-sm btn-primary" data-act="write">Escriu</button>'
    : lead ? `<button class="btn btn-sm btn-primary" data-act="msg-new">Missatge a la ${esc(V.section)}</button>` : '';
  return `<div class="section-title"><h2 class="h2">Missatges</h2>${write}</div>
    ${list.length ? `<div class="panel msgs">${list.slice(0, 3).map(m => msgCard(m)).join('')}
      ${list.length > 3 || list.some(m => (m.body || '').length > 180) ? `<div style="padding:4px 14px 12px"><button class="btn btn-sm btn-ghost" data-act="msg-list">Tots els missatges${list.length > 3 ? ` (${list.length})` : ''}</button></div>` : ''}</div>`
      : `<p class="muted" style="margin:0 2px;font-size:calc(13px*var(--ts))">${lead && !canWriteAll() ? `Escriu a tota la ${esc(SEC[lead].name.toLowerCase())} des d’aquí: els arriba a l’app i al mòbil, sense correus ni WhatsApp.` : 'Escriu a tothom o a una corda des d’aquí: els arriba a l’app i al mòbil, sense correus ni WhatsApp.'}</p>`}`;
}
function sheetMessages() {
  let all = false;
  const draw = el => {
    const list = messagesForMe(all);
    el.querySelector('#ms-list').innerHTML = list.length ? list.map(m => msgCard(m, true)).join('') : '<p class="muted" style="margin:0;padding:14px">No hi ha cap missatge.</p>';
  };
  openSheet({
    title: 'Missatges',
    wide: true,
    body: `${canWriteAll() ? '<div class="seg3" role="radiogroup" aria-label="Quins" style="margin-bottom:10px"><button type="button" role="radio" aria-checked="true" data-k="mine">Per a mi</button><button type="button" role="radio" aria-checked="false" data-k="all">Tots</button></div>' : ''}
      <div class="panel msgs" id="ms-list"></div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 2px 0">Es guarden els dels últims ${MSG_DAYS} dies.</p>`,
    foot: canMessage() ? `<span class="spacer"></span><button class="btn btn-primary" data-act="msg-new">Escriu un missatge</button>` : '',
    onMount: el => {
      draw(el);
      lsSet(LS_MSG, new Date().toISOString()); setTimeout(renderTabs, 0);
      el.querySelectorAll('.seg3 [data-k]').forEach(b => b.onclick = () => { all = b.dataset.k === 'all'; el.querySelectorAll('.seg3 [data-k]').forEach(x => x.setAttribute('aria-checked', x === b)); draw(el); });
    },
  });
}
/** Escriure: un missatge, un anunci al tauler o una enquesta (a tothom o a unes cordes). */
function sheetWrite() {
  openSheet({
    title: 'Què vols enviar?',
    body: `<div class="write-opts">
      <button class="write-o" data-act="msg-new"><b>Un missatge</b><small>Arriba a l’app i al mòbil de tothom o de les ${esc(V.sections)} que triïs. Per a avisos del dia a dia.</small></button>
      <button class="write-o" data-act="ann-new"><b>Un anunci al tauler</b><small>Queda fixat al Tauler (també es pot adreçar a unes ${esc(V.sections)}), amb data de caducitat.</small></button>
      <button class="write-o" data-act="poll-new"><b>Una enquesta</b><small>Una pregunta amb opcions: disponibilitat, vestuari, sopar…</small></button>
    </div>`,
  });
}
function sheetMessage() {
  const lead = myLeadSection();
  const all = canWriteAll();
  if (!all && !lead) return;
  const reach = to => to.includes('*') ? membersOf(null).length : membersOf(null).filter(m => to.includes(m.section)).length;
  openSheet({
    title: all ? 'Nou missatge' : `Missatge a la ${V.section}`,
    body: `<div class="kv">
      ${all ? `<div class="field"><span>Per a</span><div class="pickers" id="mg-to"><button type="button" class="pick" data-sec="*" aria-pressed="${!lead}">Tothom</button>${SECTIONS.map(x => secPick(x, x.id === lead)).join('')}</div></div>`
        : `<p style="margin:0">Per a tota la <b>${esc(SEC[lead].name.toLowerCase())}</b> (${membersOf(lead).length} persones). Els arribarà a l’app i, a qui tingui els avisos activats, al mòbil.</p>`}
      <label class="field"><span>Assumpte (opcional)</span><input class="inp" id="mg-title" maxlength="80" placeholder="p. ex. Assaig parcial de dijous"></label>
      <label class="field"><span>Missatge</span><textarea class="inp" id="mg-body" maxlength="1500" style="min-height:140px" placeholder="Escriu aquí…"></textarea></label>
      <p class="muted" id="mg-reach" style="margin:0;font-size:calc(13px*var(--ts))"></p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="mg-send">Envia</button>`,
    onMount: el => {
      const to = () => all ? (() => { const v = $$('#mg-to .pick[aria-pressed="true"]', el).map(b => b.dataset.sec); return v.includes('*') || !v.length ? ['*'] : v; })() : [lead];
      const paint = () => { const t = to(); el.querySelector('#mg-reach').textContent = `Arribarà a ${reach(t)} ${V.members}${t.includes('*') ? ' i a tot l’equip' : ''}.`; };
      el.querySelectorAll('#mg-to .pick').forEach(b => b.onclick = () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        if (b.dataset.sec === '*') el.querySelectorAll('#mg-to .pick').forEach(x => x.setAttribute('aria-pressed', x === b && on));
        else { b.setAttribute('aria-pressed', on); el.querySelector('#mg-to .pick[data-sec="*"]').setAttribute('aria-pressed', 'false'); }
        paint();
      });
      paint();
      el.querySelector('#mg-send').onclick = () => {
        const body = el.querySelector('#mg-body').value.trim();
        if (!body) { toast('Escriu el missatge'); return; }
        const rec = { id: uid('ms'), to: to(), title: el.querySelector('#mg-title').value.trim(), body, by: S.email || '', byName: fullName(S.me?.name || S.userName || S.email || ''),
          byRole: lead && !all ? `${capz(V.leader)} de ${SEC[lead].name.toLowerCase()}` : (rolesText(S.me).split(' · ')[0] || ''), createdAt: new Date().toISOString() };
        S.messages.set(rec.id, rec); persist('messages', rec.id, rec, 10);
        closeSheet(); toast(`Missatge enviat a ${reach(rec.to)} ${V.members}`); render();
      };
    },
  });
}
async function deleteMessage(id) {
  const m = S.messages.get(id);
  if (!m) return;
  // El propi es pot desfer; el d'una altra persona no es podria tornar a publicar amb el seu nom: es pregunta.
  if (m.by !== S.email && !await confirmSheet('Esborrar el missatge?', 'Deixarà de sortir a tothom.', 'Esborra')) return;
  const before = clone(m);
  S.messages.delete(id); persist('messages', id, null, 10);
  document.querySelector(`[data-act="msg-del"][data-id="${CSS.escape(id)}"]`)?.closest('.msg')?.remove();
  render();
  if (m.by === S.email) undoable('Missatge esborrat', () => { S.messages.set(before.id, before); persist('messages', before.id, before, 10); });
  else toast('Missatge esborrat');
}

/* ---------- Notes de seguiment ---------- */
// memberNotes/<id> = { id, memberId, section, text, by, byName, at }. Només les veuen la direcció, l'administració i els
// caps de corda (els de la seva corda): afinació, actitud, progressos… La persona no les veu.
const canTrackAll = () => !PREVIEW && (hasRole(S.me, 'admin') || hasRole(S.me, 'director'));
const canTrack = m => !!m && (canTrackAll() || (myLeadSection() && myLeadSection() === m.section));
async function trackBox(el, m) {
  const box = el.querySelector('#ms-track');
  if (!box || !canTrack(m)) return;
  let notes = [];
  const load = async () => {
    let q = db.collection('memberNotes').where('memberId', '==', m.id);
    if (!canTrackAll()) q = q.where('section', '==', myLeadSection());
    try { notes = (await q.get()).docs.map(d => d.data()).sort((a, b) => (b.at || '').localeCompare(a.at || '')); } catch { notes = null; }
  };
  const draw = () => {
    if (!box.isConnected) return;
    box.innerHTML = `<div class="section-title" style="margin-top:20px"><h3 class="eyebrow">Notes de seguiment</h3><span class="eyebrow">només direcció i ${esc(V.leaders)}</span></div>
      ${notes == null ? '<p class="muted" style="font-size:calc(13px*var(--ts))">No s’han pogut carregar.</p>' : notes.length ? `<ul class="notes-list">${notes.map(n => `<li><span class="mono muted">${esc(ddmm((n.at || '').slice(0, 10)))}</span><span><span style="white-space:pre-wrap">${esc(n.text)}</span><br><span class="m">${esc(n.byName || '')}</span>${n.by === S.email || canTrackAll() ? ` <button class="linkish" data-note-del="${esc(n.id)}">Esborra</button>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted" style="font-size:calc(13px*var(--ts));margin:0 0 8px">Encara no n’hi ha.</p>'}
      <label class="field"><span class="sr">Nova nota</span><textarea class="inp" id="tn-text" maxlength="800" style="min-height:70px" placeholder="p. ex. Afinació més segura als aguts. Parlar-li de la prova de solista."></textarea></label>
      <button class="btn btn-sm" id="tn-save" style="margin-top:6px">Desa la nota</button>`;
    box.querySelector('#tn-save').onclick = async () => {
      const text = box.querySelector('#tn-text').value.trim();
      if (!text) return;
      const rec = { id: uid('tn'), memberId: m.id, section: m.section, text, by: S.email || '', byName: fullName(S.me?.name || S.email || ''), at: new Date().toISOString() };
      try { await db.doc(`memberNotes/${rec.id}`).set(rec); notes.unshift(rec); toast('Nota desada'); draw(); }
      catch { toast('No s’ha pogut desar la nota'); }
    };
    box.querySelectorAll('[data-note-del]').forEach(b => b.onclick = async () => {
      try { await db.doc(`memberNotes/${b.dataset.noteDel}`).delete(); notes = notes.filter(n => n.id !== b.dataset.noteDel); draw(); } catch { toast('No s’ha pogut esborrar'); }
    });
  };
  box.innerHTML = '<p class="muted" style="font-size:calc(13px*var(--ts))">Carregant les notes de seguiment…</p>';
  await load(); draw();
}
