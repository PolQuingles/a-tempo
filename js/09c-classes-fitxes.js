// A Tempo · 09c-classes-fitxes.js — Classes de cant: les finestres de cada dia (hores, notes, avisos, canvis d'hora), el professorat sense compte, l'assistència del curs i la fitxa de cada alumne.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Classes: fitxes ---------- */
/** Professorat que encara no entra a l'app: només un nom, per poder-ne fer el calendari. */
function sheetTeacherSeats() {
  const seats = teacherSeats().map(t => ({ ...t }));
  ensureStaff();
  const withAccount = [...S.staff.values()].filter(p => hasRole(p, 'voice'));
  const rows = () => seats.length ? seats.map((t, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center">
      <input class="inp" type="text" maxlength="40" value="${esc(t.name)}" data-f="name" style="flex:1" placeholder="Nom i cognom">
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu-lo">${ICON.close}</button>
    </div>`).join('') : '<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Encara no n’hi ha cap.</p>';
  const read = el => el.querySelectorAll('.sec-row').forEach(r => { const t = seats[+r.dataset.i]; if (t) t.name = r.querySelector('[data-f="name"]').value.trim(); });
  const paint = el => { el.querySelector('#ts-rows').innerHTML = rows(); el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); seats.splice(+b.dataset.rm, 1); paint(el); }); };
  openSheet({
    title: `${V.Teacher}s sense compte`,
    body: `<p style="margin-top:0">Posa-hi qui fa classes però encara no entra a l’app: així ja en pots fer el calendari i els ${esc(V.members)} hi veuen la seva hora. Quan tingui compte, dona-li accés a <b>Gestió › Personal</b> amb el rol de ${esc(V.Teacher.toLowerCase())}.</p>
      <div id="ts-rows" style="display:grid;gap:8px"></div>
      <button type="button" class="btn btn-sm" id="ts-add" style="margin-top:10px">+ Afegeix</button>
      ${withAccount.length ? `<p class="muted" style="font-size:calc(13px*var(--ts));margin:14px 0 0">Amb compte: ${esc(withAccount.map(p => p.name || p.email).join(', '))}.</p>` : ''}`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ts-save">Desa</button>`,
    onMount: el => {
      paint(el);
      el.querySelector('#ts-add').onclick = () => { read(el); seats.push({ id: uid('pf'), name: '' }); paint(el); };
      el.querySelector('#ts-save').onclick = () => {
        read(el);
        const keep = seats.filter(t => t.name);
        const gone = teacherSeats().filter(t => !keep.some(k => k.id === t.id) && [...S.classes.values()].some(c => c.teacher === t.id));
        if (gone.length) { toast(`${gone[0].name} té dies de classe: esborra’ls abans de treure’l`); return; }
        saveConfig({ teachers: keep });
        closeSheet(); toast('Desat'); render();
      };
    },
  });
}
/** Què s'ha treballat i què cal preparar: ho veuen el professorat i aquell alumne. */
function sheetClassNote(classId, slotId) {
  const c = S.classes.get(classId);
  const slot = c && classSlots(c).find(x => x.id === slotId);
  if (!slot) return;
  const id = `${classId}_${slotId}`;
  const ex = S.classNotes.get(id);
  const m = S.members.get(slot.memberId || '');
  openSheet({
    title: `Nota de la classe${m ? ` de ${firstName(m.name)}` : ''}`,
    body: `<div class="kv">
      <p style="margin:0">${esc(longDate(c.date))}, a les <b>${esc(slot.time || '')}</b>.</p>
      <label class="field"><span>Què s’ha treballat i què cal preparar</span><textarea class="inp" id="cn-text" maxlength="600" style="min-height:130px" placeholder="p. ex. Vocalitzacions fins al la. Per la setmana vinent, els compassos 1-40 de memòria.">${esc(ex?.text || '')}</textarea></label>
      <div class="field"><span>Enregistrament de la classe (opcional)</span>
        ${ex?.file ? `<div class="rec-cur" id="cn-cur"><span>${esc(ex.file.name)} · ${fmtSize(ex.file.size)}</span><button type="button" class="btn btn-sm btn-ghost" id="cn-rec-rm">Treu-lo</button></div>` : ''}
        <label class="dropzone" for="cn-file" id="cn-drop"><input id="cn-file" type="file" accept="audio/*,video/*,.m4a,.mp3" class="sr">
          <span class="dz-t">${ex?.file ? 'Canvia’l per un altre' : 'Tria l’àudio de la classe'}</span><span class="dz-s">Fins a 20 MB (uns 20 minuts en qualitat de veu). L’alumne el podrà escoltar més lent i repetir fragments.</span></label></div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:0">Només ho veieu tu i ${m ? esc(firstName(m.name)) : `qui tingui aquesta hora`}. La resta de l’agrupació, no.</p>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="cn-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cn-save">Desa</button>`,
    onMount: el => {
      let picked = null, drop = false;
      const input = el.querySelector('#cn-file');
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        if (f.size > FILE_MAX) { toast(`${f.name} passa de 20 MB. Retalla’l o grava’l en qualitat més baixa.`); input.value = ''; return; }
        picked = f;
        el.querySelector('#cn-drop .dz-t').textContent = f.name;
        el.querySelector('#cn-drop .dz-s').textContent = `${fileKind(f)} · ${fmtSize(f.size)} · es pujarà en desar`;
        el.querySelector('#cn-drop').classList.add('ready');
      };
      el.querySelector('#cn-rec-rm')?.addEventListener('click', () => { drop = true; el.querySelector('#cn-cur').remove(); });
      el.querySelector('#cn-save').onclick = async e => {
        const text = el.querySelector('#cn-text').value.trim();
        let file = drop ? null : ex?.file || null;
        if (picked) {
          if (!navigator.onLine) { toast('Cal connexió per pujar l’enregistrament'); return; }
          const btn = e.currentTarget, label = btn.textContent;
          btn.disabled = true;
          try { file = await uploadFile(picked, (i, n) => { btn.textContent = n > 1 ? `Pujant ${i} de ${n}…` : 'Pujant…'; }, { where: 'classFiles', memberId: slot.memberId || '' }); }
          catch { toast('No s’ha pogut pujar l’enregistrament. Torna-ho a provar.'); btn.disabled = false; btn.textContent = label; return; }
        }
        if (ex?.file && (!file || file.id !== ex.file.id)) deleteFile(ex.file);
        if (!text && !file) { if (ex) { S.classNotes.delete(id); persist('classNotes', id, null, 10); } closeSheet(); render(); return; }
        const rec = { id, classId, slotId, memberId: slot.memberId || '', date: c.date, text, at: new Date().toISOString(), by: S.email || '', ...(file ? { file } : {}) };
        S.classNotes.set(id, rec); persist('classNotes', id, rec, 10);
        closeSheet(); toast(picked ? 'Nota i enregistrament desats' : 'Nota desada'); render();
      };
      el.querySelector('#cn-del')?.addEventListener('click', () => { if (ex?.file) deleteFile(ex.file); S.classNotes.delete(id); persist('classNotes', id, null, 10); closeSheet(); toast('Nota esborrada'); render(); });
    },
  });
}
/** El calendari de les meves classes, per subscriure-s'hi des del mòbil. */
async function sheetClassIcs() {
  const mid = myId();
  if (!mid) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let token = '';
  try {
    const snap = await db.doc(`classIcs/${mid}`).get();
    token = snap.exists ? snap.data().token : '';
    if (!token) { token = newKey() + newKey(); await db.doc(`classIcs/${mid}`).set({ memberId: mid, token, at: new Date().toISOString() }); }
  } catch { toast('No s’ha pogut preparar el calendari'); return; }
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}calendaris/classes/${token}.ics`;
  openSheet({
    title: 'Les teves classes al calendari',
    body: `<p style="margin-top:0">Aquesta adreça porta <b>només les teves classes</b>. Si te la subscrius, se t’aniran actualitzant soles cada poques hores.</p>
      <div class="linkbox">${esc(url)}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">És una adreça personal: no la comparteixis. Si algú l’hagués de deixar de tenir, digues-ho a l’administració.</p>
      <h3 style="margin:14px 0 4px;font-size:calc(14px*var(--ts))">Com subscriure-s’hi</h3>
      <ul class="mini-list" style="max-height:none"><li><span><b>iPhone</b><br><span class="m">Calendari › Calendaris › Afegeix calendari › Afegeix calendari subscrit, i hi enganxes l’adreça.</span></span></li>
        <li><span><b>Android o ordinador</b><br><span class="m">Google Calendar › Altres calendaris › + › Des d’un URL, i hi enganxes l’adreça.</span></span></li></ul>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Les classes noves hi surten al cap d’unes hores, no immediatament.</p>`,
    foot: `${navigator.share ? '<button class="btn" id="ci-share">Comparteix…</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" id="ci-copy">Copia l’adreça</button>`,
    onMount: el => {
      el.querySelector('#ci-copy').onclick = () => copyText(url, 'Adreça copiada');
      el.querySelector('#ci-share')?.addEventListener('click', () => navigator.share({ title: 'Les meves classes', url }).catch(() => {}));
    },
  });
}
/** Assistència a les classes de tot el curs: es llegeix només quan algú la demana. */
function sheetClassStats(onlyMine) {
  openSheet({
    title: onlyMine ? 'La meva assistència a classe' : 'Assistència a les classes',
    wide: !onlyMine,
    body: '<p class="muted" style="margin:0">Carregant les classes del curs…</p>',
    onMount: async el => {
      let days = [];
      try { const snap = await db.collection('classes').get(); days = snap.docs.map(d => d.data()).filter(c => !c.deleted); }
      catch { el.querySelector('.sheet-b').innerHTML = '<p style="margin:0">No s’han pogut llegir les classes. Comprova la connexió.</p>'; return; }
      const per = new Map();
      let marked = 0;
      for (const c of days) for (const x of c.slots || []) {
        const mid = slotMember(x);
        if (!mid || !x.mark) continue;
        if (onlyMine && mid !== myId()) continue;
        const r = per.get(mid) || { P: 0, R: 0, FJ: 0, FNJ: 0, total: 0, last: '' };
        r[x.mark]++; r.total++; r.last = c.date > r.last ? c.date : r.last;
        per.set(mid, r); marked++;
      }
      const rows = [...per.entries()].map(([mid, r]) => ({ m: S.members.get(mid), r }))
        .filter(x => x.m).sort((a, b) => a.m.name.localeCompare(b.m.name, 'ca'));
      const pct = r => r.total ? Math.round(((r.P + r.R) / r.total) * 100) : null;
      el.querySelector('.sheet-b').innerHTML = !marked
        ? `<p style="margin:0">Encara no hi ha cap classe amb l’assistència marcada. ${teachesClasses() ? 'Marca-la des del calendari, al dia que toqui.' : ''}</p>`
        : `<p style="margin-top:0">${days.length} dies de classe al curs · ${marked} assistències marcades.</p>
          <ul class="mini-list" style="max-height:none">${rows.map(({ m, r }) => `<li><span>${esc(m.name)}<br><span class="m">${r.P + r.R} de ${r.total} classes${r.FJ ? ` · ${r.FJ} just.` : ''}${r.FNJ ? ` · ${r.FNJ} no just.` : ''}</span></span>
            <span class="mono"><b>${pct(r)}%</b></span></li>`).join('')}</ul>
          <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Compta les classes marcades: hi ha assistit (present o amb retard) sobre el total.</p>`;
    },
  });
}
function sheetClassDay(id, preset) {
  const ex = id ? S.classes.get(id) : null;
  const rec = ex ? { ...ex, slots: (ex.slots || []).map(x => ({ ...x })) }
    : { id: uid('cl'), date: (preset && preset.date) || TODAY, place: '', note: '', teacher: (preset && preset.teacher) || planWho(), slots: [] };
  const taken = () => new Set(rec.slots.map(x => x.memberId).filter(Boolean));
  const rows = () => rec.slots.map((x, i) => `<div class="sec-row" data-i="${i}" style="display:flex;gap:6px;align-items:center">
      <input class="inp" type="time" value="${esc(x.time || '')}" data-f="time" style="width:110px">
      <select class="inp" data-f="member" style="flex:1"><option value="">— lliure —</option>${memberOptions(x.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button>
    </div>`).join('');
  const read = el => {
    el.querySelectorAll('.sec-row').forEach(row => {
      const i = +row.dataset.i;
      if (!rec.slots[i]) return;
      rec.slots[i].time = row.querySelector('[data-f="time"]').value;
      rec.slots[i].memberId = row.querySelector('[data-f="member"]').value;
      if (rec.slots[i].memberId) delete rec.slots[i].name;
    });
  };
  const paint = el => { el.querySelector('#cd-rows').innerHTML = rows(); wire(el); };
  const wire = el => {
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.slots.splice(+b.dataset.rm, 1); paint(el); });
  };
  openSheet({
    title: ex ? 'Dia de classe' : 'Nou dia de classe',
    wide: true,
    body: `<div class="kv">
      <div class="row3">
        <label class="field"><span>Dia</span><input class="inp" id="cd-date" type="date" value="${esc(rec.date)}"></label>
        <label class="field"><span>Lloc</span><input class="inp" id="cd-place" type="text" maxlength="40" value="${esc(rec.place || '')}" placeholder="p. ex. Aula 2"></label>
      </div>
      <label class="field"><span>Nota</span><input class="inp" id="cd-note" type="text" maxlength="80" value="${esc(rec.note || '')}" placeholder="p. ex. Preparació del concert"></label>
      ${teacherOptions().length > 1 ? `<label class="field"><span>${esc(V.Teacher)}</span><select class="inp" id="cd-who">${teacherOptions().map(t => `<option value="${esc(t.key)}" ${t.key === (rec.teacher || '') ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      <div class="field"><span>Genera les hores</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input class="inp" id="cd-from" type="time" value="17:00" style="width:110px">
          <input class="inp" id="cd-mins" type="number" min="5" max="120" step="5" value="30" style="width:80px" aria-label="Minuts per classe">
          <span class="muted" style="font-size:calc(13px*var(--ts))">min ·</span>
          <input class="inp" id="cd-n" type="number" min="1" max="20" value="6" style="width:70px" aria-label="Quantes classes">
          <button type="button" class="btn btn-sm" id="cd-gen">Genera</button>
        </div><small>Omple les hores seguides; després hi tries qui ve a cadascuna.</small></div>
      <div class="field"><span>Hores</span><div id="cd-rows" style="display:grid;gap:8px">${rows()}</div>
        <button type="button" class="btn btn-sm" id="cd-add" style="justify-self:start;margin-top:8px">+ Afegeix una hora</button></div>
    </div>`,
    foot: `${ex ? `<button class="btn btn-danger-ghost" id="cd-del">Esborra</button><button class="btn" data-act="cl-cancel-day" data-c="${esc(rec.id)}">${ex.cancelled ? 'Restableix el dia' : 'Anul·la el dia'}</button>` : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cd-save">Desa</button>`,
    onMount: el => {
      wire(el);
      el.querySelector('#cd-add').onclick = () => { read(el); rec.slots.push({ id: uid('sl'), time: '', mins: 30, memberId: '' }); paint(el); };
      el.querySelector('#cd-gen').onclick = () => {
        read(el);
        const [h, m] = (el.querySelector('#cd-from').value || '17:00').split(':').map(Number);
        const mins = Math.max(5, +el.querySelector('#cd-mins').value || 30), n = Math.min(20, Math.max(1, +el.querySelector('#cd-n').value || 1));
        const old = rec.slots.slice();
        rec.slots = [];
        for (let i = 0; i < n; i++) {
          const t = h * 60 + m + i * mins;
          rec.slots.push({ id: old[i]?.id || uid('sl'), time: `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, mins, memberId: old[i]?.memberId || '' });
        }
        paint(el);
      };
      el.querySelector('#cd-save').onclick = () => {
        read(el);
        const date = el.querySelector('#cd-date').value;
        if (!date) { toast('Posa-hi el dia'); return; }
        const dup = rec.slots.filter(x => x.memberId).map(x => x.memberId);
        if (new Set(dup).size !== dup.length) { toast(`Hi ha algun ${V.member} en dues hores del mateix dia`); return; }
        saveClassDay({ ...rec, date, place: el.querySelector('#cd-place').value.trim(), note: el.querySelector('#cd-note').value.trim(),
          teacher: el.querySelector('#cd-who')?.value || rec.teacher || '',
          teacherName: teacherName(el.querySelector('#cd-who')?.value || rec.teacher || '') || rec.teacherName || '',
          slots: rec.slots.filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time)), at: new Date().toISOString(), by: S.email || '' });
        closeSheet(); toast('Dia de classe desat'); render();
      };
      const del = el.querySelector('#cd-del');
      if (del) del.onclick = async () => {
        // Queda com a esborrat (i no s'esborra del tot) perquè els altres mòbils, que només demanen el que canvia, ho sàpiguen.
        const before = clone(S.classes.get(rec.id) || rec);
        S.classes.delete(rec.id); persist('classes', rec.id, { id: rec.id, date: rec.date, teacher: rec.teacher || '', deleted: true, at: new Date().toISOString(), by: S.email || '' }, 10);
        closeSheet(); render();
        undoable('Dia de classe esborrat', () => saveClassDay(before));
      };
    },
  });
}
function sheetClassNotice(classId, slotId, kind) {
  const c = S.classes.get(classId);
  if (!c) return;
  const late = kind === 'late';
  openSheet({
    title: late ? 'Arribaré tard' : 'No hi podré anar',
    body: `<div class="kv">
      <p style="margin:0">Classe ${esc(longDate(c.date))}, a les <b>${esc(slotTime(c, slotId))}</b>.</p>
      ${late ? '<label class="field"><span>Minuts de retard aproximats</span><input class="inp" id="cn-min" type="number" inputmode="numeric" min="1" max="120" value="10" style="width:120px"></label>' : ''}
      <label class="field"><span>Motiu</span><textarea class="inp" id="cn-why" maxlength="200" style="min-height:80px" placeholder="p. ex. Tinc classe fins a les 17:15"></textarea></label>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:0">Ho rebrà el ${esc(V.Teacher.toLowerCase())} al mòbil.</p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cn-go">Envia l’avís</button>`,
    onMount: el => {
      el.querySelector('#cn-go').onclick = () => {
        const m = S.members.get(myId());
        const rec = { id: uid('cr'), classId, slotId, memberId: myId(), memberName: m ? m.name : '', kind, status: 'pending',
          reason: el.querySelector('#cn-why').value.trim(), createdAt: new Date().toISOString(), uid: S.uid };
        if (late) { const v = parseInt(el.querySelector('#cn-min').value, 10); if (v > 0) rec.mins = Math.min(120, v); }
        saveClassReq(rec);
        closeSheet(); toast('Avís enviat'); render();
      };
    },
  });
}
function sheetClassSwap(classId, slotId) {
  const c = S.classes.get(classId);
  if (!c) return;
  const others = classSlots(c).filter(x => x.id !== slotId && x.memberId && S.members.get(x.memberId));
  if (!others.length) { toast('Aquell dia no hi ha ningú més amb hora'); return; }
  openSheet({
    title: 'Canvia l’hora amb algú',
    body: `<div class="kv">
      <p style="margin:0">Classe ${esc(longDate(c.date))}. Ara tens les <b>${esc(slotTime(c, slotId))}</b>. El canvi val <b>només per aquest dia</b>, i l’ha d’acceptar qui triïs.</p>
      <label class="field"><span>Amb qui</span><select class="inp" id="cs-who"><option value="">Qualsevol que pugui aquell dia</option>${others.map(x => `<option value="${esc(x.id)}">${esc(S.members.get(x.memberId).name)} · ${esc(x.time)}</option>`).join('')}</select>
        <small>Si tries «qualsevol», ho veuran tots els qui tenen classe aquell dia i s’ho queda el primer que digui que sí.</small></label>
      <label class="field"><span>Missatge</span><textarea class="inp" id="cs-why" maxlength="200" style="min-height:70px" placeholder="p. ex. Aquell dia treballo fins a les 18h"></textarea></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cs-go">Demana el canvi</button>`,
    onMount: el => {
      el.querySelector('#cs-go').onclick = () => {
        const withSlotId = el.querySelector('#cs-who').value;
        const other = withSlotId ? classSlots(c).find(x => x.id === withSlotId) : null;
        const m = S.members.get(myId());
        saveClassReq({ id: uid('cr'), classId, slotId, memberId: myId(), memberName: m ? m.name : '', kind: 'swap',
          ...(other ? { withSlotId, withMemberId: other.memberId, withName: S.members.get(other.memberId)?.name || '' } : { open: true }),
          reason: el.querySelector('#cs-why').value.trim(), status: 'pending', createdAt: new Date().toISOString(), uid: S.uid });
        closeSheet(); toast(other ? 'Petició enviada' : 'Demanat a tothom qui té classe aquell dia'); render();
      };
    },
  });
}
/** Marca (o desmarca) qui ha vingut a una hora de classe. */
function markClass(classId, slotId, value) {
  const c = S.classes.get(classId);
  if (!c) return;
  const eff = classSlots(c).find(x => x.id === slotId);
  const slots = (c.slots || []).map(x => {
    if (x.id !== slotId) return x;
    const next = { ...x };
    if (next.mark === value) { delete next.mark; delete next.markFor; }
    else { next.mark = value; next.markFor = (eff && eff.memberId) || x.memberId || ''; }
    return next;
  });
  saveClassDay({ ...c, slots });
  render();
}
/** Em quedo un canvi d'hora obert: hi poso la meva hora i queda fet. */
function takeOpenSwap(id) {
  const r = S.classReq.get(id);
  const c = r && S.classes.get(r.classId);
  const x = c && mySlot(c);
  if (!r || !x || r.status !== 'pending') { toast('Aquest canvi ja no hi és'); return; }
  saveClassReq({ ...r, status: 'accepted', open: false, withMemberId: myId(), withSlotId: x.id,
    reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' });
  toast('Fet: heu canviat l’hora'); render();
}
/** Demano una hora que ha quedat lliure (per recuperar una classe). */
function askFreeSlot(classId, slotId) {
  const c = S.classes.get(classId), m = S.members.get(myId() || '');
  if (!c || !m) return;
  if ([...S.classReq.values()].some(r => r.kind === 'take' && r.classId === classId && r.slotId === slotId && r.memberId === m.id && r.status === 'pending')) {
    toast('Ja l’has demanada'); return;
  }
  saveClassReq({ id: uid('cr'), classId, slotId, memberId: m.id, memberName: m.name, kind: 'take', status: 'pending',
    reason: '', createdAt: new Date().toISOString(), uid: S.uid });
  toast(`Demanada. El ${V.Teacher.toLowerCase()} t’ho dirà`); render();
}
/** Anul·la (o torna a activar) un dia sencer de classe. */
async function cancelClassDay(id) {
  const c = S.classes.get(id);
  if (!c) return;
  if (c.cancelled) { saveClassDay({ ...c, cancelled: false, cancelledAt: '' }); toast('Dia restablert'); render(); return; }
  const who = classSlots(c).filter(x => x.memberId).length;
  if (!await confirmSheet('Anul·lar el dia?', `S’avisarà ${who === 1 ? 'la persona' : `les ${who} persones`} que hi tenen hora. El dia queda marcat com a anul·lat, i el pots tornar a activar quan vulguis.`, 'Anul·la’l')) return;
  saveClassDay({ ...c, cancelled: true, cancelledAt: new Date().toISOString() });
  toast('Dia anul·lat'); render();
}
function answerClassReq(id, status) {
  const r = S.classReq.get(id);
  if (!r || r.status !== 'pending') return;
  // Acceptar una hora lliure vol dir donar-la: es posa aquella persona al calendari.
  if (r.kind === 'take' && status === 'accepted') {
    const c = S.classes.get(r.classId);
    if (c) saveClassDay({ ...c, slots: (c.slots || []).map(x => x.id === r.slotId ? { ...x, memberId: r.memberId, name: '' } : x) });
  }
  saveClassReq({ ...r, status, reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' });
  toast(status === 'accepted' ? 'Acceptat' : status === 'cancelled' ? 'Avís retirat' : 'Rebutjat');
  render();
}

/* ---------- Fitxa de cada alumne ---------- */
// students/<membre> = { memberId, goals, repertoire: [{ id, title, composer, status }], at, by }. La fa el professorat i la
// veu l'alumne; hi surten també totes les notes de classe i els enregistraments (classNotes amb «file»).
const STUDENT_STATUS = { nova: 'Per començar', treballant: 'Treballant-la', apunt: 'A punt' };
const NOTE_CACHE = new Map();   // les notes carregades a la fitxa, per obrir-ne l'enregistrament
async function sheetStudent(mid) {
  const m = S.members.get(mid);
  const teach = teachesClasses();
  if (!m || (!teach && mid !== myId())) return;
  openSheet({ title: m.name, wide: true, body: '<p class="muted" style="margin:0">Carregant la fitxa…</p>' });
  let rec = { goals: '', repertoire: [] }, notes = [];
  try { const d = await db.doc(`students/${mid}`).get(); if (d.exists) rec = { ...rec, ...d.data() }; } catch {}
  try { notes = (await db.collection('classNotes').where('memberId', '==', mid).get()).docs.map(d => d.data()); }
  catch { notes = [...S.classNotes.values()].filter(n => n.memberId === mid); }
  if (!sheetClose) return;
  notes.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const n of notes) NOTE_CACHE.set(n.id, n);
  rec.repertoire = (rec.repertoire || []).map(x => ({ ...x }));
  const hours = [...S.classPlan.values()].flatMap(p => (p.rows || []).filter(r => r.memberId === mid).map(r => `${capz(DAYS_CA[r.day])} ${r.time} amb ${teacherName(p.teacher || p.id) || V.Teacher}`));
  const repRows = () => rec.repertoire.length ? rec.repertoire.map(x => teach
    ? `<div class="sec-row st-rep" data-id="${esc(x.id)}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input class="inp" data-f="title" maxlength="80" value="${esc(x.title)}" placeholder="Obra" style="flex:2 1 150px;min-width:0">
        <input class="inp" data-f="composer" maxlength="50" value="${esc(x.composer || '')}" placeholder="Compositor" style="flex:1 1 110px;min-width:0">
        <select class="inp" data-f="status" style="flex:1 1 120px">${Object.entries(STUDENT_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-rm="${esc(x.id)}" aria-label="Treu-la">${ICON.close}</button></div>`
    : `<li><span><b>${esc(x.title)}</b>${x.composer ? ` · ${esc(x.composer)}` : ''}</span><span class="st-pill ${x.status === 'apunt' ? 'st-accepted' : 'st-pending'}">${STUDENT_STATUS[x.status] || ''}</span></li>`).join('')
    : `<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">${teach ? 'Encara no n’hi ha. Afegeix les obres que treballa.' : 'Encara no hi ha repertori.'}</p>`;
  const read = el => {
    if (!teach) return;
    rec.goals = el.querySelector('#stu-goals').value.trim();
    el.querySelectorAll('.st-rep').forEach(row => { const x = rec.repertoire.find(z => z.id === row.dataset.id); if (x) for (const f of ['title', 'composer', 'status']) x[f] = row.querySelector(`[data-f="${f}"]`).value.trim(); });
  };
  const paint = el => {
    const box = el.querySelector('#stu-rep');
    box.innerHTML = teach ? repRows() : (rec.repertoire.length ? `<ul class="mini-list" style="max-height:none">${repRows()}</ul>` : repRows());
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); rec.repertoire = rec.repertoire.filter(x => x.id !== b.dataset.rm); paint(el); });
  };
  openSheet({
    title: m.name,
    wide: true,
    body: `<p style="margin-top:0"><span class="muted" style="font-size:calc(13.5px*var(--ts))">${esc(SEC[m.section].name)}${hours.length ? ` · ${esc(hours.join(' · '))}` : ''}</span></p>
      <div class="section-title"><h2 class="h2">Objectius</h2></div>
      ${teach ? `<textarea class="inp" id="stu-goals" maxlength="1000" style="min-height:80px" placeholder="p. ex. Guanyar agilitat a la zona aguda. Treballar el suport a les frases llargues.">${esc(rec.goals || '')}</textarea>`
        : `<p style="white-space:pre-wrap;margin:0">${esc(rec.goals || '') || '<span class="muted">Encara no n’hi ha.</span>'}</p>`}
      <div class="section-title" style="margin-top:14px"><h2 class="h2">Repertori</h2>${teach ? '<button type="button" class="btn btn-sm" id="stu-add">+ Obra</button>' : ''}</div>
      <div id="stu-rep" style="display:grid;gap:8px"></div>
      <div class="section-title" style="margin-top:14px"><h2 class="h2">Notes de classe</h2><span class="eyebrow">${notes.length}</span></div>
      ${notes.length ? `<ul class="mini-list" style="max-height:none">${notes.map(n => `<li style="display:grid;gap:4px"><span class="m mono">${esc(shortDate(n.date))}</span>${n.text ? `<span style="white-space:pre-wrap">${esc(n.text)}</span>` : ''}
          ${n.file ? `<button class="btn btn-sm" style="justify-self:start" data-act="cl-rec" data-id="${esc(n.id)}">Escolta l’enregistrament</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Encara no hi ha notes.</p>'}
      ${teach ? '' : `<p class="muted" style="font-size:calc(13px*var(--ts));margin-top:12px">Només ho veieu tu i el professorat de cant.</p>`}`,
    foot: teach ? `<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="stu-save">Desa</button>` : '',
    onMount: el => {
      paint(el);
      el.querySelector('#stu-add')?.addEventListener('click', () => { read(el); rec.repertoire.push({ id: uid('sr'), title: '', composer: '', status: 'treballant' }); paint(el); });
      el.querySelector('#stu-save')?.addEventListener('click', async () => {
        read(el);
        const out = { memberId: mid, goals: rec.goals || '', repertoire: rec.repertoire.filter(x => x.title), at: new Date().toISOString(), by: S.email || '' };
        try { await db.doc(`students/${mid}`).set(out); closeSheet(); toast('Fitxa desada'); }
        catch { toast('No s’ha pogut desar. Comprova la connexió.'); }
      });
    },
  });
}
function openRecording(id) {
  const n = NOTE_CACHE.get(id) || S.classNotes.get(id);
  if (n?.file) sheetOpenFile(n.file, `Classe del ${shortDate(n.date)}`);
}
