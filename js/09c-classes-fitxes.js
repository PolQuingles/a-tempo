// A Tempo · 09c-classes-fitxes.js — Classes de cant: les finestres de cada dia (hores, notes, avisos, canvis d'hora), el professorat sense compte, l'assistència del curs i la fitxa de cada alumne.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Classes: fitxes ---------- */
/** Professorat que encara no entra a l'app: només un nom, per poder-ne fer el calendari. */
function sheetTeacherSeats() {
  const seats = teacherSeats().map(t => ({ ...t }));
  ensureStaff();
  const withAccount = [...S.staff.values()].filter(p => hasRole(p, 'voice'));
  const rows = () => seats.length ? seats.map((t, i) => `<div class="sec-row u-d-flex u-gap-6 u-ai-center" data-i="${i}">
      <input class="inp u-flex-1" type="text" maxlength="40" value="${esc(t.name)}" data-f="name" placeholder="Nom i cognom">
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu-lo">${ICON.close}</button>
    </div>`).join('') : '<p class="muted u-m-0 u-fs-t-13">Encara no n’hi ha cap.</p>';
  const read = el => el.querySelectorAll('.sec-row').forEach(r => { const t = seats[+r.dataset.i]; if (t) t.name = r.querySelector('[data-f="name"]').value.trim(); });
  const paint = el => { el.querySelector('#ts-rows').innerHTML = rows(); el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(el); seats.splice(+b.dataset.rm, 1); paint(el); }); };
  openSheet({
    title: `${V.Teacher}s sense compte`,
    body: `<p class="u-mt-0">Posa-hi qui fa classes però encara no entra a l’app: així ja en pots fer el calendari i els ${esc(V.members)} hi veuen la seva hora. Quan tingui compte, dona-li accés a <b>Gestió › Personal</b> amb el rol de ${esc(V.Teacher.toLowerCase())}: l’app hi reconeixerà el nom i les classes d’aquí passaran al seu compte.</p>
      <div id="ts-rows" class="u-d-grid u-gap-8"></div>
      <button type="button" class="btn btn-sm u-mt-10" id="ts-add">+ Afegeix</button>
      ${withAccount.length ? `<p class="muted u-fs-t-13 u-m-14-0-0">Amb compte: ${esc(withAccount.map(p => p.name || p.email).join(', '))}.</p>` : ''}`,
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
/* ---------- Gravar des de l'app ---------- */
// Primer l'MP4, que s'escolta a tots els mòbils; el WebM només on no n'hi ha. Sense els filtres del micròfon, pensats per a la
// parla: la cancel·lació d'eco i el control de volum destrossen una veu cantada.
const REC_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
/** Com a molt, 30 minuts per gravació (les del professorat i les del quadern): uns 11 MB, perquè l'espai no creixi massa. */
const REC_MAX = 30 * 60e3;
/** Els minuts que queden, mentre es grava. */
const recLeft = ms => `queden ${recClock(Math.max(0, REC_MAX - ms))}`;
async function startRecording({ name, onTick, onDone, maxMs = REC_MAX }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const type = REC_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48000 });
  const parts = [], t0 = Date.now();
  let size = 0, dropped = false, full = false, wake = null;
  // Que la pantalla no s'apagui: amb el mòbil bloquejat, el navegador talla el micròfon.
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  // Com a molt maxMs (vegeu REC_MAX): s'atura sola i es desa com si s'hagués omplert.
  const tick = setInterval(() => { const ms = Date.now() - t0; onTick(ms, size); if (maxMs && ms >= maxMs && mr.state === 'recording') { full = true; mr.stop(); } }, 1000);
  const release = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); try { wake?.release(); } catch {} };
  mr.ondataavailable = e => {
    if (!e.data || !e.data.size) return;
    parts.push(e.data); size += e.data.size;
    if (size >= FILE_MAX * 0.95 && mr.state === 'recording') { full = true; mr.stop(); }
  };
  mr.onstop = () => {
    release();
    if (dropped) return;
    const mime = (mr.mimeType || type || 'audio/webm').split(';')[0];
    onDone(new File(parts, `${name}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), full);
  };
  // Si el sistema talla el micròfon (una trucada, per exemple), es desa el que s'ha gravat fins aquí.
  stream.getTracks().forEach(t => { t.onended = () => { if (mr.state !== 'inactive') mr.stop(); }; });
  mr.start(5000);
  return { stop: () => { if (mr.state !== 'inactive') mr.stop(); }, discard: () => { dropped = true; if (mr.state !== 'inactive') mr.stop(); else release(); } };
}
const recClock = ms => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** Què s'ha treballat i què cal preparar (ho veuen el professorat i aquell alumne), i una nota privada que l'alumne no veu. */
/** La nota d'una classe (pública i privada) i el seu enregistrament. rec: s'obre per gravar (el botó «Grava» de la llista):
 *  l'enregistrament va primer i comença a gravar de seguida. */
function sheetClassNote(classId, slotId, rec) {
  const c = S.classes.get(classId);
  const slot = c && classSlots(c).find(x => x.id === slotId);
  if (!slot) return;
  const id = `${classId}_${slotId}`;
  const ex = S.classNotes.get(id), exPriv = S.classPriv.get(id);
  const m = S.members.get(slot.memberId || '');
  const recField = `      <div class="field"><span>Enregistrament de la classe (opcional)</span>
        ${ex?.file ? `<div class="rec-cur" id="cn-cur"><span>${esc(ex.file.name)} · ${fmtSize(ex.file.size)}</span><button type="button" class="btn btn-sm btn-ghost" id="cn-rec-rm">Treu-lo</button></div>` : ''}
        ${canRecord() ? `<div class="rec-box"><button type="button" class="btn" id="cn-rec-go"><i class="rec-dot"></i>Grava ara</button>
          <div class="rec-live" id="cn-rec-live" hidden><i class="rec-dot on"></i><b class="mono" id="cn-rec-t">0:00</b><span class="muted" id="cn-rec-s">Gravant…</span><span class="spacer"></span><button type="button" class="btn btn-primary" id="cn-rec-stop">Atura</button></div>
          <audio id="cn-rec-prev" controls playsinline preload="metadata" hidden></audio></div>` : ''}
        <label class="dropzone" for="cn-file" id="cn-drop"><input id="cn-file" type="file" accept="audio/*,video/*,.m4a,.mp3" class="sr">
          <span class="dz-t">${ex?.file ? 'Canvia’l per un fitxer' : 'O tria un fitxer'}</span><span class="dz-s">Gravacions de fins a ${REC_MAX / 60e3} minuts; fitxers de fins a 20 MB. L’alumne el podrà escoltar més lent i repetir fragments.</span></label></div>`;
  openSheet({
    title: `${rec ? 'Grava la classe' : 'Nota de la classe'}${m ? ` de ${firstName(m.name)}` : ''}`,
    body: `<div class="kv">
      <p class="u-m-0">${esc(longDate(c.date))}, a les <b>${esc(slot.time || '')}</b>.</p>
      ${rec ? recField : ''}
      <label class="field"><span>Què s’ha treballat i què cal preparar</span><textarea class="inp u-minh-130" id="cn-text" maxlength="600" placeholder="p. ex. Vocalitzacions fins al la. Per la setmana vinent, els compassos 1-40 de memòria.">${esc(ex?.text || '')}</textarea>
        <small>Ho veieu tu i ${m ? esc(firstName(m.name)) : 'qui tingui aquesta hora'}. La resta de l’agrupació, no.</small></label>
      <label class="field"><span>Nota privada</span><textarea class="inp u-minh-70" id="cn-priv" maxlength="600" placeholder="p. ex. Li costa concentrar-se quan ve cansat.">${esc(exPriv?.text || '')}</textarea>
        <small>${m ? esc(firstName(m.name)) : 'L’alumne'} no la veu. Només la veus tu i, si cal, l’administració de l’app.</small></label>
      ${rec ? '' : recField}
    </div>`,
    foot: `${ex || exPriv ? '<button class="btn btn-danger-ghost" id="cn-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cn-save">Desa</button>`,
    onMount: el => {
      let picked = null, drop = false, rec = null, prevUrl = '';
      const input = el.querySelector('#cn-file'), save = el.querySelector('#cn-save');
      const pick = f => {
        picked = f;
        el.querySelector('#cn-drop .dz-t').textContent = f.name;
        el.querySelector('#cn-drop .dz-s').textContent = `${fileKind(f)} · ${fmtSize(f.size)} · es pujarà en desar`;
        el.querySelector('#cn-drop').classList.add('ready');
      };
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        if (f.size > FILE_MAX) { toast(`${f.name} passa de 20 MB. Retalla’l o grava’l en qualitat més baixa.`); input.value = ''; return; }
        pick(f);
      };
      el.querySelector('#cn-rec-rm')?.addEventListener('click', () => { drop = true; el.querySelector('#cn-cur').remove(); });
      // La gravació: mentre dura, la finestra no es pot tancar sense voler ni es pot desar.
      const close0 = sheetClose;
      sheetClose = () => { rec?.discard(); if (prevUrl) URL.revokeObjectURL(prevUrl); close0(); };
      const go = el.querySelector('#cn-rec-go'), live = el.querySelector('#cn-rec-live');
      if (go) go.onclick = async () => {
        go.disabled = true;
        try {
          rec = await startRecording({
            name: `Classe del ${c.date}`,
            onTick: (ms, size) => { el.querySelector('#cn-rec-t').textContent = recClock(ms); el.querySelector('#cn-rec-s').textContent = `${fmtSize(size)} · ${recLeft(ms)}`; },
            onDone: (f, full) => {
              rec = null; sheetLock = null; save.disabled = false; live.hidden = true; go.hidden = false; go.disabled = false;
              go.lastChild.textContent = 'Torna a gravar';
              if (!f.size) { toast('No s’ha gravat res. Torna-ho a provar.'); return; }
              pick(f);
              const a = el.querySelector('#cn-rec-prev');
              if (prevUrl) URL.revokeObjectURL(prevUrl);
              prevUrl = URL.createObjectURL(f); a.src = prevUrl; a.hidden = false;
              toast(full ? (f.size < FILE_MAX * 0.9 ? `S’ha aturat als ${REC_MAX / 60e3} minuts` : 'S’ha aturat en arribar al límit de 20 MB') : 'Gravació a punt: desa-la per enviar-la');
            },
          });
        } catch (err) { go.disabled = false; toast(err && err.name === 'NotAllowedError' ? 'Dona permís al micròfon per poder gravar' : 'No s’ha pogut engegar el micròfon'); return; }
        sheetLock = () => toast('Atura la gravació abans de tancar');
        save.disabled = true; go.hidden = true; live.hidden = false; el.querySelector('#cn-rec-prev').hidden = true;
      };
      el.querySelector('#cn-rec-stop')?.addEventListener('click', () => rec?.stop());
      el.querySelector('#cn-save').onclick = async e => {
        const text = el.querySelector('#cn-text').value.trim(), priv = el.querySelector('#cn-priv').value.trim();
        let file = drop ? null : ex?.file || null;
        if (picked) {
          if (!navigator.onLine) { toast('Cal connexió per pujar l’enregistrament'); return; }
          const btn = e.currentTarget, label = btn.textContent;
          btn.disabled = true;
          try { file = await uploadFile(picked, (i, n) => { btn.textContent = n > 1 ? `Pujant ${i} de ${n}…` : 'Pujant…'; }, { where: 'classFiles', memberId: slot.memberId || '', teacher: noteTeacher(c) }); }
          catch { toast('No s’ha pogut pujar l’enregistrament. Torna-ho a provar.'); btn.disabled = false; btn.textContent = label; return; }
        }
        if (ex?.file && (!file || file.id !== ex.file.id)) deleteFile(ex.file);
        const base = { id, classId, slotId, memberId: slot.memberId || '', teacher: noteTeacher(c), date: c.date, at: new Date().toISOString(), by: S.email || '' };
        if (priv) { const r = { ...base, text: priv }; S.classPriv.set(id, r); persist('classPriv', id, r, 10); }
        else if (exPriv) { S.classPriv.delete(id); persist('classPriv', id, null, 10); }
        if (!text && !file) { if (ex) { S.classNotes.delete(id); persist('classNotes', id, null, 10); } STU_CTX.at = 0; closeSheet(); if (priv) toast('Nota desada'); render(); return; }
        const rec2 = { ...base, text, ...(file ? { file } : {}) };
        S.classNotes.set(id, rec2); persist('classNotes', id, rec2, 10);
        STU_CTX.at = 0;   // la fitxa de l'alumne, si s'obre, ja ha de dur la nota nova
        closeSheet(); toast(picked ? 'Nota i enregistrament desats' : 'Nota desada'); render();
      };
      el.querySelector('#cn-del')?.addEventListener('click', () => {
        if (ex?.file) deleteFile(ex.file);
        if (ex) { S.classNotes.delete(id); persist('classNotes', id, null, 10); }
        if (exPriv) { S.classPriv.delete(id); persist('classPriv', id, null, 10); }
        STU_CTX.at = 0;
        closeSheet(); toast('Nota esborrada'); render();
      });
    },
  });
}
/* ---------- Moure una classe ---------- */
/** On aniria la classe i si es pot: { target, fill, error, warn }. */
function moveCheck(c, x, date, time, mins) {
  if (!date || !time) return { error: 'Posa-hi el dia i l’hora.' };
  if (date < TODAY) return { error: 'Tria un dia que encara hagi de venir.' };
  const target = date === c.date ? c : classDays(c.teacher || '-').find(k => k.date === date);
  if (target?.cancelled) return { error: 'Aquell dia està anul·lat.' };
  const others = target ? classSlots(target).filter(s => s.id !== x.id) : [];
  if (others.some(s => s.memberId === x.memberId)) return { error: 'Aquell dia ja hi té classe.' };
  const from = parseTime(time), to = from + mins;
  const over = others.filter(s => s.time && parseTime(s.time) < to && parseTime(s.time) + (+s.mins || 30) > from);
  const busy = over.find(s => s.memberId || s.name);
  if (busy) return { error: `A aquesta hora ja hi ha ${S.members.get(busy.memberId)?.name || busy.name}.` };
  const clash = classClash({ id: '', date }, { time, mins, memberId: x.memberId });
  return { target, fill: over[0], warn: clash ? `Coincideix amb ${clash.type || 'un assaig'}${clash.time ? ` de les ${clash.time}` : ''}.` : '' };
}
/** Afegeix un avís a un dia sense perdre els que encara no s'hagin enviat. */
function withChange(day, ch) {
  const recent = day?.changedAt && Date.now() - Date.parse(day.changedAt) < 45 * 60e3 ? (day.changes || []).filter(o => o.m !== ch.m) : [];
  return { changes: [...recent, ch], changedAt: new Date().toISOString() };
}
function moveClass(c, x, date, time, mins, check) {
  const at = new Date().toISOString(), by = S.email || '';
  const when = (d, t) => `${longDate(d).toLowerCase()} a les ${t}`;
  const byTime = (a, b) => (a.time || '').localeCompare(b.time || '');
  const dropFill = s => !check.fill || s.id !== check.fill.id;
  const body = `La teva classe de ${when(c.date, x.time)} passa a ${when(date, time)}.`;
  if (date === c.date) {
    saveClassDay({ ...c, edited: true, at, by, slots: c.slots.filter(dropFill).map(s => s.id === x.id ? { ...s, time, mins } : s).sort(byTime), ...withChange(c, { m: x.memberId, b: body }) });
    return;
  }
  const newSlot = { id: uid('sl'), time, mins, memberId: x.memberId };
  // L'hora d'on marxa queda lliure, per si algú la vol.
  saveClassDay({ ...c, edited: true, at, by, slots: c.slots.map(s => s.id === x.id ? { id: s.id, time: s.time, mins: s.mins, memberId: '' } : s) });
  const dow = new Date(date + 'T12:00:00').getDay();
  const day = check.target || { id: uid('cl'), date, place: planPlaces(c.teacher)[dow] || c.place || '', note: '', teacher: c.teacher || '', teacherName: c.teacherName || teacherName(c.teacher) || '', slots: [] };
  saveClassDay({ ...day, edited: true, at, by, slots: [...day.slots.filter(dropFill), newSlot].sort(byTime), ...withChange(day, { m: x.memberId, b: body }) });
  // La nota, si n'hi ha, va amb la classe.
  const oldId = `${c.id}_${x.id}`, newId = `${day.id}_${newSlot.id}`;
  for (const col of ['classNotes', 'classPriv']) {
    const n = S[col].get(oldId);
    if (!n) continue;
    const r = { ...n, id: newId, classId: day.id, slotId: newSlot.id, date };
    S[col].set(newId, r); persist(col, newId, r, 10);
    S[col].delete(oldId); persist(col, oldId, null, 10);
  }
  // Els avisos d'aquella hora ja estan resolts.
  const reviewed = { reviewedAt: at, reviewedBy: by };
  for (const r of S.classReq.values()) {
    if (r.status !== 'pending') continue;
    if (['late', 'absent'].includes(r.kind) && r.classId === c.id && r.memberId === x.memberId) saveClassReq({ ...r, status: 'accepted', ...reviewed });
    else if (r.kind === 'swap' && ((r.classId === c.id && r.slotId === x.id) || (swapWithClass(r) === c.id && r.withSlotId === x.id))) saveClassReq({ ...r, status: 'rejected', ...reviewed });
  }
}
/** Mou només aquesta classe a una altra hora o a un altre dia (una recuperació, per exemple). */
function sheetClassMove(classId, slotId, after) {
  const c = S.classes.get(classId), x = c && classSlots(c).find(s => s.id === slotId), m = x && S.members.get(x.memberId);
  if (!x || !m || !canMoveSlot(c, x)) { toast('Aquesta classe ja no es pot moure'); return; }
  openSheet({
    title: `Mou la classe de ${firstName(m.name)}`,
    body: `<div class="kv">
      <p class="u-m-0">Ara és ${esc(longDate(c.date).toLowerCase())}, a les <b>${esc(x.time || '')}</b>. Només canvia aquesta classe: l’horari fix queda igual.</p>
      <div class="row3">
        <label class="field"><span>Dia</span><input class="inp" id="mv-date" type="date" min="${TODAY}" value="${esc(c.date)}"></label>
        <label class="field"><span>Hora</span><input class="inp" id="mv-time" type="time" value="${esc(x.time || '')}"></label>
      </div>
      <label class="field"><span>Minuts</span><input class="inp u-w-96" id="mv-mins" type="number" min="5" max="120" step="5" value="${+x.mins || 30}"></label>
      <p id="mv-hint" class="muted u-m-0 u-fs-t-13"></p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="mv-go">Mou-la</button>`,
    onMount: el => {
      const read = () => ({ date: el.querySelector('#mv-date').value, time: el.querySelector('#mv-time').value, mins: Math.max(5, +el.querySelector('#mv-mins').value || 30) });
      const hint = () => {
        const v = read(), ch = moveCheck(c, x, v.date, v.time, v.mins);
        el.querySelector('#mv-hint').textContent = ch.error || [v.date !== c.date ? 'L’hora d’ara quedarà lliure.' : '', !ch.target ? 'Aquell dia encara no hi ha classes: se’n crearà un.' : '', ch.warn, `S’avisarà ${firstName(m.name)}.`].filter(Boolean).join(' ');
        return ch;
      };
      ['#mv-date', '#mv-time', '#mv-mins'].forEach(id => el.querySelector(id).addEventListener('input', hint));
      hint();
      el.querySelector('#mv-go').onclick = () => {
        const v = read(), ch = hint();
        if (ch.error) { toast(ch.error); return; }
        if (v.date === c.date && v.time === x.time && v.mins === (+x.mins || 30)) { closeSheet(); return; }
        moveClass(c, x, v.date, v.time, v.mins, ch);
        closeSheet(); toast(`Classe moguda · s’avisarà ${firstName(m.name)}`); render();
        if (after) after();
      };
    },
  });
}
/* ---------- Coincidències amb assajos i concerts ---------- */
function sheetClassClashes() {
  const list = classClashList();
  if (!list.length) { closeSheet(); toast('Cap coincidència per resoldre'); render(); return; }
  const days = [...new Set(list.map(i => i.c.date))];
  openSheet({
    title: 'Coincidències per resoldre',
    wide: true,
    body: `<p class="u-mt-0">Classes que vénen i que coincideixen amb un assaig o un concert d’aquell alumne.</p>
      ${days.map(d => `<div class="clash-day"><h3 class="clash-d">${esc(capz(longDate(d)))}</h3>${list.filter(i => i.c.date === d).map(({ c, x, s }) => `<div class="clash-row">
        <span class="mono clash-t">${esc(x.time || '')}</span>
        <span class="clash-w"><b>${esc(S.members.get(x.memberId)?.name || '')}</b><small>${esc([`${s.type || 'Assaig'} · ${timeRange(s)}`, isAdmin() ? teacherOf(c) : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="clash-a"><button class="btn btn-sm" data-act="cl-move" data-k="clash" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Mou</button><button class="btn btn-sm" data-act="cl-clash-ok" data-c="${esc(c.id)}" data-s="${esc(x.id)}" data-k="${esc(s.id)}">Deixa-la</button></span>
      </div>`).join('')}</div>`).join('')}`,
  });
}
/** Aquesta coincidència ja està vista: la classe es queda on és. Si l'assaig canvia, tornarà a sortir. */
function acceptClash(classId, slotId, sessionId) {
  const c = S.classes.get(classId);
  if (!c) return;
  saveClassDay({ ...c, slots: c.slots.map(x => x.id === slotId ? { ...x, clashOk: sessionId } : x) });
  render(); sheetClassClashes();
}
/* ---------- Vincular un nom a una fitxa ---------- */
/** Posa aquesta persona a totes les classes on sortia només el nom, i a l'horari fix. Torna quantes classes ha canviat. */
async function linkClassName(who, name, mid) {
  const key = normTxt(name), match = x => !x.memberId && normTxt(x.name) === key;
  const days = [...(await classDaysByDate(who)).values()].filter(c => (c.slots || []).some(match) && !c.slots.some(x => x.memberId === mid));
  for (let i = 0; i < days.length; i += 400) {
    const b = fs.batch();
    for (const c of days.slice(i, i + 400)) {
      const next = { ...c, slots: c.slots.map(x => { if (!match(x)) return x; const { name: _, ...rest } = x; return { ...rest, memberId: mid }; }) };
      delete next.syncAt;
      b.set(db.doc(`classes/${c.id}`), stamped(`classes/${c.id}`, next));
      if (S.classes.has(c.id)) S.classes.set(c.id, next);
    }
    await b.commit();
  }
  const rows = planRows(who);
  if (rows.some(match)) savePlan(who, rows.map(x => { if (!match(x)) return x; const { name: _, ...rest } = x; return { ...rest, memberId: mid }; }));
  return days.length;
}
function sheetLinkName(who, name) {
  const hit = matchMember(name), t = classUnlinked(who).find(u => normTxt(u.name) === normTxt(name));
  openSheet({
    title: 'Vincula a una fitxa',
    body: `<p class="u-mt-0"><b>${esc(name)}</b> surt a l’horari${t?.n ? ` en ${t.n} ${t.n === 1 ? 'classe' : 'classes'}` : ''} sense fitxa. En vincular-ho, canviarà a totes les classes i a l’horari fix.</p>
      <label class="field"><span>Qui és?</span><select class="inp" id="ln-m"><option value="">Tria la persona</option>${memberOptions(hit.sure ? hit.hits[0].id : '')}</select></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ln-go">Vincula</button>`,
    onMount: el => {
      el.querySelector('#ln-go').onclick = async e => {
        const mid = el.querySelector('#ln-m').value;
        if (!mid) { toast('Tria la persona'); return; }
        e.currentTarget.disabled = true;
        try { const n = await linkClassName(who, name, mid); closeSheet(); toast(`${n} ${n === 1 ? 'classe vinculada' : 'classes vinculades'}`); render(); }
        catch { e.target.disabled = false; toast('No s’ha pogut desar. Comprova la connexió.'); }
      };
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
    body: `<p class="u-mt-0">Aquesta adreça porta <b>només les teves classes</b>. Si te la subscrius, se t’aniran actualitzant soles cada poques hores.</p>
      <div class="linkbox">${esc(url)}</div>
      <p class="muted u-fs-t-13 u-m-10-0-0">És una adreça personal: no la comparteixis. Si algú l’hagués de deixar de tenir, digues-ho a l’administració.</p>
      <h3 class="u-m-14-0-4 u-fs-t-15">Com subscriure-s’hi</h3>
      <ul class="mini-list u-maxh-none"><li><span><b>iPhone</b><br><span class="m">Calendari › Calendaris › Afegeix calendari › Afegeix calendari subscrit, i hi enganxes l’adreça.</span></span></li>
        <li><span><b>Android o ordinador</b><br><span class="m">Google Calendar › Altres calendaris › + › Des d’un URL, i hi enganxes l’adreça.</span></span></li></ul>
      <p class="muted u-fs-t-13 u-m-10-0-0">Les classes noves hi surten al cap d’unes hores, no immediatament.</p>`,
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
    body: '<p class="muted u-m-0">Carregant les classes del curs…</p>',
    onMount: async el => {
      let days = [];
      // Cada professor/a només veu els seus alumnes; l'administració, tots.
      const q = !onlyMine && !isAdmin() ? db.collection('classes').where('teacher', '==', myEmail()) : db.collection('classes');
      try { const snap = await q.get(); days = snap.docs.map(d => d.data()).filter(c => !c.deleted); }
      catch { el.querySelector('.sheet-b').innerHTML = '<p class="u-m-0">No s’han pogut llegir les classes. Comprova la connexió.</p>'; return; }
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
        ? `<p class="u-m-0">Encara no hi ha cap classe amb l’assistència marcada. ${teachesClasses() ? 'Marca-la des del calendari, al dia que toqui.' : ''}</p>`
        : `<p class="u-mt-0">${nPl(days.length, 'dia de classe', 'dies de classe')} al curs · ${nPl(marked, 'assistència marcada', 'assistències marcades')}.</p>
          <ul class="mini-list u-maxh-none">${rows.map(({ m, r }) => `<li><span>${esc(m.name)}<br><span class="m">${r.P + r.R} de ${nPl(r.total, 'classe', 'classes')}${r.FJ ? ` · ${r.FJ} just.` : ''}${r.FNJ ? ` · ${r.FNJ} no just.` : ''}</span></span>
            <span class="mono"><b>${pct(r)}%</b></span></li>`).join('')}</ul>
          <p class="muted u-fs-t-13 u-m-10-0-0">Compta les classes marcades: hi ha assistit (present o amb retard) sobre el total.</p>`;
    },
  });
}
function sheetClassDay(id, preset) {
  const ex = id ? S.classes.get(id) : null;
  const rec = ex ? { ...ex, slots: (ex.slots || []).map(x => ({ ...x })) }
    : { id: uid('cl'), date: (preset && preset.date) || TODAY, place: '', note: '', teacher: (preset && preset.teacher) || planWho(), slots: [] };
  // Les hores noves duren el mateix que les altres del dia o, si no n'hi ha, que l'horari fix.
  const usualMins = () => +rec.slots[rec.slots.length - 1]?.mins || +planRows(rec.teacher)[0]?.mins || 30;
  const taken = () => new Set(rec.slots.map(x => x.memberId).filter(Boolean));
  const rows = () => rec.slots.map((x, i) => `<div class="sec-row u-d-flex u-gap-6 u-ai-center u-fw-wrap" data-i="${i}">
      <input class="inp u-w-110" type="time" value="${esc(x.time || '')}" data-f="time" aria-label="Hora">
      <input class="inp u-w-72" type="number" min="5" max="120" step="5" value="${+x.mins || usualMins()}" data-f="mins" aria-label="Minuts">
      <select class="inp u-flex-1 u-minw-130" data-f="member" aria-label="${esc(V.Member)}"><option value="">— lliure —</option>${memberOptions(x.memberId || '')}</select>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Treu aquesta hora">${ICON.close}</button>
    </div>`).join('');
  const read = el => {
    el.querySelectorAll('.sec-row').forEach(row => {
      const i = +row.dataset.i;
      if (!rec.slots[i]) return;
      rec.slots[i].time = row.querySelector('[data-f="time"]').value;
      rec.slots[i].mins = Math.max(5, +row.querySelector('[data-f="mins"]').value || usualMins());
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
        <div class="u-d-flex u-gap-6 u-fw-wrap u-ai-center">
          <input class="inp u-w-110" id="cd-from" type="time" value="17:00" aria-label="Hora de la primera classe">
          <input class="inp u-w-80" id="cd-mins" type="number" min="5" max="120" step="5" value="${usualMins()}" aria-label="Minuts per classe">
          <span class="muted u-fs-t-13">min ·</span>
          <input class="inp u-w-70" id="cd-n" type="number" min="1" max="20" value="6" aria-label="Quantes classes">
          <button type="button" class="btn btn-sm" id="cd-gen">Genera</button>
        </div><small>Omple les hores seguides; després hi tries qui ve a cadascuna.</small></div>
      <div class="field"><span>Hores</span><div id="cd-rows" class="u-d-grid u-gap-8">${rows()}</div>
        <button type="button" class="btn btn-sm u-js-start u-mt-8" id="cd-add">+ Afegeix una hora</button></div>
    </div>`,
    foot: `${ex ? `<button class="btn btn-danger-ghost" id="cd-del">Esborra</button><button class="btn" data-act="cl-cancel-day" data-c="${esc(rec.id)}">${ex.cancelled ? 'Restableix el dia' : 'Anul·la el dia'}</button>` : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cd-save">Desa</button>`,
    onMount: el => {
      wire(el);
      el.querySelector('#cd-add').onclick = () => { read(el); rec.slots.push({ id: uid('sl'), time: '', mins: usualMins(), memberId: '' }); paint(el); };
      el.querySelector('#cd-gen').onclick = () => {
        read(el);
        const [h, m] = (el.querySelector('#cd-from').value || '17:00').split(':').map(Number);
        const mins = Math.max(5, +el.querySelector('#cd-mins').value || usualMins()), n = Math.min(20, Math.max(1, +el.querySelector('#cd-n').value || 1));
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
        const next = { ...rec, date, place: el.querySelector('#cd-place').value.trim(), note: el.querySelector('#cd-note').value.trim(),
          teacher: el.querySelector('#cd-who')?.value || rec.teacher || '',
          teacherName: teacherName(el.querySelector('#cd-who')?.value || rec.teacher || '') || rec.teacherName || '',
          slots: rec.slots.filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time)), edited: true, at: new Date().toISOString(), by: S.email || '' };
        const told = classChanges(ex, next).length;
        saveClassDay({ ...next, ...changeFields(ex, next) });
        closeSheet(); toast(told ? `Dia de classe desat · s’avisarà ${told === 1 ? '1 persona' : `${told} persones`}` : 'Dia de classe desat'); render();
      };
      const del = el.querySelector('#cd-del');
      if (del) del.onclick = async () => {
        // Queda com a esborrat (i no s'esborra del tot) perquè els altres mòbils, que només demanen el que canvia, ho sàpiguen.
        const before = clone(S.classes.get(rec.id) || rec);
        S.classes.delete(rec.id); persist('classes', rec.id, { id: rec.id, date: rec.date, teacher: rec.teacher || '', deleted: true, ...changeFields(before, null), at: new Date().toISOString(), by: S.email || '' }, 10);
        closeSheet(); render();
        undoable('Dia de classe esborrat', () => saveClassDay(before));
      };
    },
  });
}
/** «Avisa…» de la classe a Inici: arribar tard, no venir o canviar l'hora, en una sola finestra. */
function sheetClassAct(classId, slotId) {
  const c = S.classes.get(classId);
  if (!c) return;
  const swap = classSlots(c).length > 1 || weekClasses(c).length > 1;
  const opt = (act, k, t, s) => `<button class="write-o" data-act="${act}" data-c="${esc(classId)}" data-s="${esc(slotId)}"${k ? ` data-k="${k}"` : ''}><b>${t}</b><small>${s}</small></button>`;
  openSheet({
    title: 'La teva classe',
    body: `<p class="u-m-0-0-12">${esc(longDate(c.date))}, a les <b>${esc(slotTime(c, slotId))}</b>${teacherOf(c) ? `, amb ${esc(teacherOf(c))}` : ''}.</p>
      <div class="write-opts">
      ${opt('cl-notice', 'late', 'Arribaré tard', 'Digues quants minuts, més o menys.')}
      ${opt('cl-notice', 'absent', 'No hi podré anar', `Ho rebrà el ${esc(V.Teacher.toLowerCase())} al mòbil.`)}
      ${swap ? opt('cl-swap', '', 'Canvia l’hora', 'Demana-ho a algú que tingui classe aquella setmana.') : ''}
    </div>`,
  });
}
function sheetClassNotice(classId, slotId, kind) {
  const c = S.classes.get(classId);
  if (!c) return;
  const late = kind === 'late';
  openSheet({
    title: late ? 'Arribaré tard' : 'No hi podré anar',
    body: `<div class="kv">
      <p class="u-m-0">Classe ${esc(longDate(c.date))}, a les <b>${esc(slotTime(c, slotId))}</b>.</p>
      ${late ? '<label class="field"><span>Minuts de retard aproximats</span><input class="inp u-w-120" id="cn-min" type="number" inputmode="numeric" min="1" max="120" value="10"></label>' : ''}
      <label class="field"><span>Motiu</span><textarea class="inp u-minh-80" id="cn-why" maxlength="200" placeholder="p. ex. Tinc classe fins a les 17:15"></textarea></label>
      <p class="muted u-fs-t-13 u-m-0">Ho rebrà el ${esc(V.Teacher.toLowerCase())} al mòbil.</p>
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
/** Demanar un canvi d'hora: a una persona, a unes quantes o a tothom, del mateix dia o de l'altre dia d'aquella setmana
 *  amb el mateix professor. A una sola persona, li ho demana a ella; a més d'una, el primer que diu que sí se'l queda. */
function sheetClassSwap(classId, slotId) {
  const c = S.classes.get(classId);
  if (!c) return;
  const days = [c, ...weekClasses(c).filter(x => x.id !== c.id)].sort((a, b) => a.date.localeCompare(b.date));
  const cands = days.flatMap(k => classSlots(k).filter(x => !(k.id === classId && x.id === slotId) && x.memberId && x.memberId !== myId() && S.members.get(x.memberId)).map(x => ({ k, x })));
  if (!cands.length) { toast('Aquella setmana no hi ha ningú més amb hora'); return; }
  const key = o => `${o.k.id}|${o.x.id}`;
  openSheet({
    title: 'Canvia l’hora amb algú',
    body: `<div class="kv">
      <p class="u-m-0">Classe ${esc(longDate(c.date))}. Ara tens les <b>${esc(slotTime(c, slotId))}</b>. El canvi val <b>només per aquesta setmana</b>, i l’ha d’acceptar qui triïs.</p>
      <div class="field"><span>A qui ho demanes</span><div class="pickers" id="cs-mode"><button type="button" class="pick" data-k="pick" aria-pressed="true">Tria a qui</button><button type="button" class="pick" data-k="all" aria-pressed="false">A tothom</button></div>
        <small id="cs-hint"></small></div>
      <div id="cs-list" class="cs-list">${days.map(k => { const os = cands.filter(o => o.k.id === k.id); return os.length ? `<div class="cs-day"><b>${esc(capz(fmtD(k.date, { weekday: 'long', day: 'numeric', month: 'short' })))}</b>${os.map(o => `<label class="cs-row"><input type="checkbox" value="${esc(key(o))}"><span>${esc(S.members.get(o.x.memberId).name)}</span><span class="mono m">${esc(o.x.time || '')}</span></label>`).join('')}</div>` : ''; }).join('')}</div>
      <label class="field"><span>Missatge</span><textarea class="inp u-minh-70" id="cs-why" maxlength="200" placeholder="p. ex. Aquell dia treballo fins a les 18h"></textarea></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="cs-go">Demana el canvi</button>`,
    onMount: el => {
      let mode = 'pick';
      const picked = () => [...el.querySelectorAll('#cs-list input:checked')].map(i => cands.find(o => key(o) === i.value)).filter(Boolean);
      const paint = () => {
        el.querySelectorAll('#cs-mode .pick').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === mode)));
        el.querySelector('#cs-list').hidden = mode === 'all';
        const n = picked().length;
        el.querySelector('#cs-hint').textContent = mode === 'all' ? `Ho veuran tots els qui tenen classe aquella setmana amb ${teacherOf(c)}, i s’ho queda el primer que digui que sí.`
          : n > 1 ? `Ho demanes a ${n} persones: s’ho queda la primera que digui que sí.` : n === 1 ? 'Li ho demanes només a aquesta persona.' : 'Marca una o més persones.';
      };
      el.querySelectorAll('#cs-mode .pick').forEach(b => b.onclick = () => { mode = b.dataset.k; paint(); });
      el.querySelectorAll('#cs-list input').forEach(i => i.onchange = paint);
      paint();
      el.querySelector('#cs-go').onclick = () => {
        const sel = mode === 'all' ? [] : picked();
        if (mode === 'pick' && !sel.length) { toast('Marca a qui ho demanes'); return; }
        const m = S.members.get(myId());
        const one = sel.length === 1 ? sel[0] : null;
        saveClassReq({ id: uid('cr'), classId, slotId, memberId: myId(), memberName: m ? m.name : '', kind: 'swap',
          ...(one ? { withSlotId: one.x.id, withClassId: one.k.id, withMemberId: one.x.memberId, withName: S.members.get(one.x.memberId)?.name || '' }
            : { open: true, ...(sel.length ? { to: sel.map(o => o.x.memberId), offers: Object.fromEntries(sel.map(o => [o.x.memberId, key(o)])) } : {}) }),
          reason: el.querySelector('#cs-why').value.trim(), status: 'pending', createdAt: new Date().toISOString(), uid: S.uid });
        closeSheet(); toast(one ? 'Petició enviada' : sel.length ? `Demanat a ${nPl(sel.length, 'persona', 'persones')}` : 'Demanat a tothom qui té classe aquella setmana'); render();
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
  const mine = r && mySwapSlot(r);
  const x = mine && mine.x, oc = mine && mine.c;
  if (!r || !x || r.status !== 'pending') { toast('Aquest canvi ja no hi és'); return; }
  saveClassReq({ ...r, status: 'accepted', open: false, withMemberId: myId(), withSlotId: x.id, withClassId: oc.id,
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
  if (c.cancelled) {
    const back = c.date >= TODAY ? classSlots(c).filter(x => x.memberId && x.time).map(x => ({ m: x.memberId, b: `S’ha recuperat la teva classe de ${longDate(c.date).toLowerCase()} a les ${x.time}.` })) : [];
    saveClassDay({ ...c, cancelled: false, cancelledAt: '', ...(back.length ? { changes: back, changedAt: new Date().toISOString() } : {}) });
    toast('Dia restablert'); render(); return;
  }
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
    const c = S.classes.get(r.classId), sl = c && (c.slots || []).find(x => x.id === r.slotId);
    const reviewed = { reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' };
    if (!sl || ((sl.memberId || sl.name) && sl.memberId !== r.memberId)) {
      saveClassReq({ ...r, status: 'rejected', ...reviewed });
      toast('Aquesta hora ja no està lliure'); render(); return;
    }
    saveClassDay({ ...c, edited: true, slots: c.slots.map(x => x.id === r.slotId ? { ...x, memberId: r.memberId, name: '' } : x) });
    // Els altres que la demanaven ja saben que no.
    for (const o of S.classReq.values()) if (o.id !== r.id && o.kind === 'take' && o.classId === r.classId && o.slotId === r.slotId && o.status === 'pending') saveClassReq({ ...o, status: 'rejected', ...reviewed });
  }
  saveClassReq({ ...r, status, reviewedAt: new Date().toISOString(), reviewedBy: S.email || '' });
  toast(status === 'accepted' ? (['late', 'absent'].includes(r.kind) ? 'Anotat' : 'Acceptat') : status === 'cancelled' ? 'Avís retirat' : 'Rebutjat');
  render();
}

/* ---------- Fitxa de cada alumne: qui la porta (la fitxa i el quadern són a 09d-classes-quadern.js) ---------- */
/** De quin professor són les notes i els enregistraments d'una classe (teacher): cada professor només veu els dels seus alumnes.
 *  Els del professorat que encara no entra a l'app (una clau que no és un correu) només els veu l'administració. */
const noteTeacher = c => c.teacher || (isAdmin() ? '' : myEmail());
/** Qui porta un alumne (students.teachers): qui ja hi era i qui en desa la fitxa; si la desa l'administració, el professorat
 *  amb compte de les seves classes. */
function studentTeachers(mid, had) {
  const keys = new Set(had || []);
  if (!isAdmin()) keys.add(myEmail());
  else for (const c of S.classes.values()) if ((c.slots || []).some(x => x.memberId === mid) && (c.teacher || '').includes('@')) keys.add(c.teacher);
  return [...keys].filter(Boolean);
}
const NOTE_CACHE = new Map();   // les notes carregades a la fitxa, per obrir-ne l'enregistrament
/** Un alumne que té classe amb mi però la fitxa encara és d'un altre professor: m'hi afegeixo. Les regles comproven que el dia de classe sigui meu i que hi surti. */
async function joinStudent(mid) {
  const me = myEmail();
  const c = classDays(me).reverse().find(k => (k.slots || []).some(x => x.memberId === mid));
  if (!c) return false;
  try {
    await db.doc(`classes/${c.id}`).set({ memberIds: [...new Set(c.slots.map(x => x.memberId).filter(Boolean))] }, { merge: true });
    await db.doc(`students/${mid}`).update({ teachers: firebase.firestore.FieldValue.arrayUnion(me), viaClass: c.id, at: new Date().toISOString(), by: S.email || '' });
    return true;
  } catch { return false; }
}
