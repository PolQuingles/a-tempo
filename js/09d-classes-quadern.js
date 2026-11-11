// A Tempo · 09d-classes-quadern.js — Classes de cant: el quadern de cada alumne (els objectius, el repertori i el diari de les
// classes, on escriuen tant l'alumne com el seu professorat), la fitxa que ho ensenya tot i, per a cada cantaire, la targeta de la
// seva propera classe.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Dades ---------- */
// students/<membre> = { memberId, goals (els objectius que hi posa el professorat), myGoals (els que hi posa l'alumne),
//   repertoire: [{ id, title, composer, status, by, at }], teachers (qui el porta), fresh: { at, kind, by, text } (l'última cosa
//   que l'alumne ha afegit al quadern, perquè el professorat ho vegi sense haver de llegir el quadern), seen: { <professor>: hora },
//   at, by }
// students/<membre>/log/<id> = { id, memberId, kind: note|rec|q, text, file?, work? (una obra del repertori), date, by, byName, at,
//   edited?, reply?: { text, by, name, at } }. L'alumne hi escriu notes d'estudi i s'hi grava (les preguntes «q» d'abans es
//   continuen veient, però ja no se'n fan de noves); el
//   professorat, material (un acompanyament, uns deures) i respostes. Cadascú canvia i esborra el que ha escrit (vegeu les regles).
const STUDENT_STATUS = { nova: 'Per començar', treballant: 'Treballant-la', apunt: 'A punt' };
const LOG_KINDS = {
  note: { t: 'Nota', title: 'Nota d’estudi', label: 'Què has treballat?', ph: 'p. ex. He repassat els compassos 1-40. L’entrada del c. 12 encara se’m queda curta d’aire.' },
  rec: { t: 'Gravació', title: 'Gravació', label: 'Què hi ha a la gravació? (opcional)', ph: 'p. ex. El «Laudamus te» sencer, a casa. Escolta sobretot el final.' },
  q: { t: 'Pregunta', title: 'Pregunta per a la classe', label: 'Què vols preguntar?', ph: 'p. ex. Com puc respirar abans del c. 12 sense trencar la frase?' },
};
// Una gravació del quadern dura com a molt quaranta minuts: una classe o un assaig sencer a casa. A 48 kbps són uns 15 MB, dins
// del límit de 20 MB dels fitxers (si el mòbil grava amb més qualitat, s'atura en arribar-hi, vegeu startRecording).
const LOG_REC_MAX = 40 * 60e3;
/** El que l'alumne pot afegir al seu quadern. */
const OWN_KINDS = ['note', 'rec'];
const QL_ICON = {
  note: '<path d="M5 19h4L19.5 8.5a2.1 2.1 0 00-3-3L6 16v3z"/><path d="M14.5 7.5l2 2"/>',
  rec: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5"/>',
  q: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 014.8 1c0 1.7-2.4 2.1-2.4 3.6M12 16.9v.2"/>',
  cls: '<path d="M4 5.5h6a2 2 0 012 2V19a2 2 0 00-2-2H4zM20 5.5h-6a2 2 0 00-2 2V19a2 2 0 012-2h6z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
};
const qlIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${QL_ICON[k] || QL_ICON.note}</svg>`;
/** La clau d'un professor dins de «seen» (un correu no pot ser el nom d'un camp tal qual). */
const seenKey = e => String(e || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
const stuOf = mid => S.students.get(mid) || null;
const repOf = mid => (stuOf(mid)?.repertoire || []).filter(x => x && x.title);
const logOf = mid => [...S.classLog.values()].filter(x => x.memberId === mid);
/** L'alumne ha afegit alguna cosa al quadern que jo (professor) encara no he vist. */
function stuNews(mid) {
  const s = stuOf(mid), f = s && s.fresh;
  // Només per a qui porta l'alumne: l'administració ho pot llegir tot, però les novetats són del seu professorat.
  if (!f || !f.at || f.by === myEmail() || !(s.teachers || []).includes(myEmail())) return null;
  return f.at > ((s.seen || {})[seenKey(myEmail())] || '') ? f : null;
}
/** Quan l'ha vist el professorat per última vegada (per dir-li a l'alumne «Vist»). */
const stuSeenAt = mid => Object.values(stuOf(mid)?.seen || {}).sort().pop() || '';
const freshText = f => !f ? '' : f.kind === 'rec' ? 'Ha afegit una gravació' : f.kind === 'q' ? 'Té una pregunta per a la classe' : 'Ha escrit al quadern';
/** El nom d'un professor/a a partir de la seva clau, també per a qui no veu les fitxes de l'equip: el que porta algun dia de classe. */
function teacherLabel(key) {
  if (!key) return '';
  const n = teacherName(key);
  if (n) return fullName(n);
  for (const c of S.classes.values()) if (c.teacher === key && c.teacherName) return fullName(c.teacherName);
  return '';
}
/** El professorat amb compte de les meves classes: qui ha de poder llegir el meu quadern. */
function myClassTeachers(mid) {
  const out = new Set(stuOf(mid)?.teachers || []);
  for (const c of S.classes.values()) if ((c.teacher || '').includes('@') && (c.slots || []).some(x => x.memberId === mid)) out.add(c.teacher);
  return [...out].slice(0, 8);
}
/** Les regles del quadern miren qui porta la fitxa: si encara no n'hi ha, la fa qui hi escriu primer. */
async function ensureStudentDoc(mid) {
  if (S.students.has(mid)) return S.students.get(mid);
  const ref = db.doc(`students/${mid}`);
  const d = await ref.get();
  if (d.exists) { S.students.set(mid, d.data()); return d.data(); }
  const own = mid === myId();
  const rec = { memberId: mid, goals: '', repertoire: [], teachers: own ? myClassTeachers(mid) : studentTeachers(mid, []), at: new Date().toISOString(), by: S.email || '' };
  S.students.set(mid, rec);
  ref.set(rec).catch(writeFailed);
  return rec;
}
/** Desa uns camps de la fitxa de cant, sense tocar la resta (l'alumne i el professorat hi escriuen alhora). */
function saveStudent(mid, patch) {
  const at = new Date().toISOString(), by = S.email || '';
  const cur = stuOf(mid) || { memberId: mid };
  S.students.set(mid, { ...cur, ...patch, ...(patch.seen ? { seen: { ...(cur.seen || {}), ...patch.seen } } : {}), at, by });
  db.doc(`students/${mid}`).set({ ...patch, at, by }, { merge: true }).catch(writeFailed);
}
async function withStudentDoc(mid, fn) {
  if (PREVIEW) { previewBlocked(); return false; }
  try { await ensureStudentDoc(mid); } catch { toast('Cal connexió per començar la fitxa de cant'); return false; }
  fn(); return true;
}
/** Desa una entrada del quadern. Si ja hi era (prev), només els camps que canvia qui l'ha escrita: així no es perd la resposta
 *  que el professorat hi hagi pogut deixar mentrestant. */
function saveLog(rec, prev) {
  S.classLog.set(rec.id, rec);
  const ref = db.doc(`students/${rec.memberId}/log/${rec.id}`);
  if (!prev) { ref.set(rec).catch(writeFailed); return; }
  const del = firebase.firestore.FieldValue.delete();
  ref.update({ kind: rec.kind, text: rec.text, edited: rec.edited, file: rec.file || del, work: rec.work || del }).catch(writeFailed);
}

/* ---------- El diari: les notes de classe i el quadern, en un sol fil ---------- */
/** Tot el que hi ha d'un alumne, del més nou al més vell. notes: les notes de classe que es poden llegir (les meves, o les
 *  carregades a la fitxa); privs: les notes privades del professorat, si en porto la fitxa. */
function quadernEntries(mid, notes, privs) {
  const out = [];
  const seen = new Set();
  for (const n of notes || [...S.classNotes.values()].filter(n => n.memberId === mid)) {
    seen.add(n.id);
    const p = privs?.get(n.id)?.text || '';
    if (!n.text && !n.file && !p) continue;
    const c = S.classes.get(n.classId);
    out.push({ src: 'class', id: n.id, classId: n.classId, slotId: n.slotId, date: n.date || '', at: n.at || '', text: n.text || '', file: n.file || null, priv: p, mineNote: !!n.teacher && n.teacher === myEmail(), who: (c && teacherOf(c)) || teacherLabel(n.teacher) || V.Teacher });
  }
  for (const [k, p] of privs || []) if (!seen.has(k) && p.text) out.push({ src: 'class', id: k, classId: p.classId, slotId: p.slotId, date: p.date || '', at: p.at || '', text: '', file: null, priv: p.text, who: teacherLabel(p.teacher) || V.Teacher });
  for (const x of logOf(mid)) out.push({ src: 'log', ...x });
  return out.sort((a, b) => `${b.date}${b.at}`.localeCompare(`${a.date}${a.at}`));
}
/** Una entrada del diari. ctx = { mid, own (és el meu quadern), teach (en porto la fitxa), seenAt } */
function qlItem(e, ctx) {
  const mine = e.src === 'log' && e.by === S.email;
  // El que hi deixa el professorat (les notes de classe i el material) porta «t».
  const fromTeacher = e.src === 'class' || !!e.t;
  const who = e.src === 'class' ? (e.mineNote ? 'Tu' : fullName(e.who)) : mine ? 'Tu' : fullName(e.byName) || (fromTeacher ? V.Teacher : fullName(S.members.get(ctx.mid)?.name));
  const what = e.src === 'class' ? 'Nota de classe' : fromTeacher && e.kind === 'rec' ? 'Material' : LOG_KINDS[e.kind]?.title || '';
  const work = e.work ? repOf(ctx.mid).find(w => w.id === e.work) : null;
  const kind = e.src === 'class' ? 'cls' : e.kind;
  const seen = ctx.own && mine && ctx.seenAt && (e.at || '') <= ctx.seenAt;
  const acts = [
    e.src === 'log' && ctx.teach && !mine ? `<button class="ql-a" data-act="ql-reply" data-m="${esc(ctx.mid)}" data-id="${esc(e.id)}">${e.reply ? 'Canvia la resposta' : 'Respon'}</button>` : '',
    mine ? `<button class="ql-a" data-act="ql-edit" data-m="${esc(ctx.mid)}" data-id="${esc(e.id)}">Edita</button>` : '',
    e.src === 'class' && ctx.teach && S.classes.has(e.classId) ? `<button class="ql-a" data-act="cl-note" data-c="${esc(e.classId)}" data-s="${esc(e.slotId)}">Edita la nota</button>` : '',
  ].filter(Boolean).join('');
  return `<li class="ql-item k-${kind}${fromTeacher ? ' by-t' : ''}">
    <span class="ql-ic">${qlIcon(kind)}</span>
    <div class="ql-b">
      <div class="ql-h"><b>${esc(who)}</b><span class="ql-k">${esc(what)}</span><time datetime="${esc(e.date)}">${esc(e.date === TODAY ? 'Avui' : shortDate(e.date))}</time></div>
      ${e.text ? `<p class="ql-tx">${esc(e.text)}</p>` : ''}
      ${e.priv ? `<p class="ql-tx cl-priv"><b>Privada</b> ${esc(e.priv)}</p>` : ''}
      ${work || e.file ? `<div class="ql-x">${work ? `<span class="ql-work">${esc(work.title)}</span>` : ''}${e.file ? `<button class="ql-play" data-act="ql-play" data-src="${e.src}" data-m="${esc(ctx.mid)}" data-id="${esc(e.id)}">${qlIcon('play')}<span>Escolta</span><small>${esc(fmtSize(e.file.size))}</small></button>` : ''}</div>` : ''}
      ${e.reply ? `<div class="ql-reply"><b>${esc(fullName(e.reply.name) || V.Teacher)}</b><p>${esc(e.reply.text)}</p></div>` : ''}
      ${acts || seen ? `<div class="ql-acts">${acts}${seen && !e.reply ? `<span class="ql-seen">${ICON.check}Vist</span>` : ''}</div>` : ''}
    </div></li>`;
}
function qlList(entries, ctx, max = 0) {
  const shown = max ? entries.slice(0, max) : entries;
  return shown.length ? `<ol class="ql-list">${shown.map(e => qlItem(e, ctx)).join('')}</ol>` : '';
}
/** Escolta una gravació sense sortir de la fitxa: el reproductor d'estudi (més lent, fragments) al seu lloc. */
async function playInline(btn) {
  const { src, id } = btn.dataset;
  const e = src === 'log' ? S.classLog.get(id) : NOTE_CACHE.get(id) || S.classNotes.get(id);
  const f = e && e.file;
  if (!f) return;
  if (fileKind(f) !== 'Àudio' || !btn.closest('.ql-x')) { sheetOpenFile(f, src === 'log' ? LOG_KINDS[e.kind]?.title || 'Gravació' : `Classe del ${shortDate(e.date)}`); return; }
  const label = btn.querySelector('span');
  btn.disabled = true; label.textContent = 'Carregant…';
  try {
    const url = await loadFile(f);
    const box = document.createElement('div');
    box.className = 'ql-player';
    box.innerHTML = studyPlayer(url);
    btn.closest('.ql-x').after(box);
    btn.remove();
    bindStudyPlayer(box);
    box.querySelector('audio').play().catch(() => {});
  } catch { btn.disabled = false; label.textContent = 'Escolta'; toast('No s’ha pogut carregar la gravació. Comprova la connexió.'); }
}

/* ---------- El repertori ---------- */
function repHtml(mid, edit) {
  const rep = repOf(mid);
  if (!rep.length) return '';
  const order = { treballant: 0, nova: 1, apunt: 2 };
  return `<ul class="rep-list">${rep.slice().sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1)).map(x => {
    const inner = `<span class="rep-t"><b>${esc(x.title)}</b>${x.composer ? `<small>${esc(x.composer)}</small>` : ''}</span>
      <span class="rep-st st-${esc(x.status || 'nova')}"><span class="rep-m" aria-hidden="true"><i></i><i></i><i></i></span><em>${esc(STUDENT_STATUS[x.status] || STUDENT_STATUS.nova)}</em></span>`;
    return `<li>${edit ? `<button class="rep-row" data-act="rep-edit" data-m="${esc(mid)}" data-id="${esc(x.id)}">${inner}</button>` : `<div class="rep-row">${inner}</div>`}</li>`;
  }).join('')}</ul>`;
}
/** Afegeix o canvia una obra. back: on es torna en acabar (la fitxa). */
function sheetRepItem(mid, id, back) {
  const ex = id ? repOf(mid).find(x => x.id === id) : null;
  let status = ex?.status || 'treballant';
  const by = ex?.by ? (ex.by === S.email ? 'tu' : ex.byName ? fullName(ex.byName) : '') : '';
  openSheet({
    title: ex ? 'Obra del repertori' : 'Afegeix una obra',
    body: `<div class="kv">
      <label class="field"><span>Obra</span><input class="inp" id="rp-title" maxlength="80" value="${esc(ex?.title || '')}" placeholder="p. ex. Caro mio ben"></label>
      <label class="field"><span>Compositor</span><input class="inp" id="rp-comp" maxlength="50" value="${esc(ex?.composer || '')}" placeholder="p. ex. G. Giordani"></label>
      <div class="field"><span>Com va</span><div class="rep-pick" role="radiogroup" aria-label="Com va">${Object.entries(STUDENT_STATUS).map(([k, l]) => `<button type="button" role="radio" class="st-${k}" data-k="${k}" aria-checked="${status === k}"><span class="rep-m" aria-hidden="true"><i></i><i></i><i></i></span>${l}</button>`).join('')}</div></div>
      ${by ? `<p class="muted u-m-0 u-fs-t-13">L’hi ha afegit ${esc(by)}${ex.at ? `, el ${esc(shortDate(ex.at.slice(0, 10)))}` : ''}.</p>` : ''}
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="rp-del">Treu-la</button>' : ''}<span class="spacer"></span><button class="btn" id="rp-no">Cancel·la</button><button class="btn btn-primary" id="rp-go">${ex ? 'Desa' : 'Afegeix-la'}</button>`,
    onMount: el => {
      const done = () => { if (back) back(); else { closeSheet(); render(); } };
      el.querySelectorAll('.rep-pick button').forEach(b => b.onclick = () => { status = b.dataset.k; el.querySelectorAll('.rep-pick button').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
      el.querySelector('#rp-no').onclick = done;
      el.querySelector('#rp-go').onclick = async () => {
        const title = el.querySelector('#rp-title').value.trim(), composer = el.querySelector('#rp-comp').value.trim();
        if (!title) { toast('Posa-hi el nom de l’obra'); return; }
        const ok = await withStudentDoc(mid, () => {
          const rep = (stuOf(mid)?.repertoire || []).map(x => ({ ...x }));
          const at = new Date().toISOString();
          if (ex) { const x = rep.find(z => z.id === id); if (x) Object.assign(x, { title, composer, status }); }
          else rep.push({ id: uid('sr'), title, composer, status, by: S.email || '', byName: ME()?.name || '', at });
          saveStudent(mid, { repertoire: rep });
        });
        if (!ok) return;
        toast(ex ? 'Obra desada' : 'Obra afegida'); done();
      };
      el.querySelector('#rp-del')?.addEventListener('click', () => {
        const before = (stuOf(mid)?.repertoire || []).map(x => ({ ...x }));
        saveStudent(mid, { repertoire: before.filter(x => x.id !== id) });
        done();
        undoable('Obra treta del repertori', () => saveStudent(mid, { repertoire: before }));
      });
    },
  });
}
/** Els objectius: els del professorat (goals) o els de l'alumne (myGoals). */
function sheetGoals(mid, field, back) {
  const own = field === 'myGoals';
  openSheet({
    title: own ? 'Els teus objectius' : 'Objectius',
    body: `<label class="field"><span>${own ? 'Què vols aconseguir aquest curs?' : `Què ha de treballar ${esc(firstName(S.members.get(mid)?.name || ''))}?`}</span>
      <textarea class="inp u-minh-130" id="gl-t" maxlength="1000" placeholder="${own ? 'p. ex. Cantar el solo del Gloria sense por. Guanyar confiança a la zona aguda.' : 'p. ex. Guanyar agilitat a la zona aguda. Treballar el suport a les frases llargues.'}">${esc(stuOf(mid)?.[field] || '')}</textarea>
      <small>${own ? 'Ho veieu tu i el teu professorat.' : 'Ho veu l’alumne a la seva fitxa.'}</small></label>`,
    foot: `<span class="spacer"></span><button class="btn" id="gl-no">Cancel·la</button><button class="btn btn-primary" id="gl-go">Desa</button>`,
    onMount: el => {
      const done = () => { if (back) back(); else { closeSheet(); render(); } };
      el.querySelector('#gl-no').onclick = done;
      el.querySelector('#gl-go').onclick = async () => {
        const v = el.querySelector('#gl-t').value.trim();
        if (await withStudentDoc(mid, () => saveStudent(mid, { [field]: v }))) { toast('Desat'); done(); }
      };
    },
  });
}

/* ---------- Afegir al quadern ---------- */
/** La gravació d'una finestra: gravar des de l'app o triar un fitxer. Torna { file() } amb el que hi ha a punt. */
function bindRecField(el, { name, maxMs = 0, save }) {
  let picked = null, rec = null, prevUrl = '';
  const drop = el.querySelector('#ql-drop'), input = el.querySelector('#ql-file');
  const pick = f => { picked = f; drop.querySelector('.dz-t').textContent = f.name; drop.querySelector('.dz-s').textContent = `${fileKind(f)} · ${fmtSize(f.size)} · es pujarà en desar`; drop.classList.add('ready'); };
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > FILE_MAX) { toast(`${f.name} passa de 20 MB. Retalla’l o grava’l en qualitat més baixa.`); input.value = ''; return; }
    pick(f);
  };
  const close0 = sheetClose;
  sheetClose = () => { rec?.discard(); if (prevUrl) URL.revokeObjectURL(prevUrl); close0(); };
  const go = el.querySelector('#ql-rec-go'), live = el.querySelector('#ql-rec-live');
  if (go) go.onclick = async () => {
    go.disabled = true;
    try {
      rec = await startRecording({
        name, maxMs,
        onTick: (ms, size) => { el.querySelector('#ql-rec-t').textContent = recClock(ms); el.querySelector('#ql-rec-s').textContent = maxMs ? `queden ${recClock(Math.max(0, maxMs - ms))}` : fmtSize(size); },
        onDone: (f, full) => {
          rec = null; sheetLock = null; save.disabled = false; live.hidden = true; go.hidden = false; go.disabled = false;
          go.lastChild.textContent = 'Torna a gravar';
          if (!f.size) { toast('No s’ha gravat res. Torna-ho a provar.'); return; }
          pick(f);
          const a = el.querySelector('#ql-rec-prev');
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          prevUrl = URL.createObjectURL(f); a.src = prevUrl; a.hidden = false;
          toast(full ? (maxMs && f.size < FILE_MAX * 0.9 ? `S’ha aturat als ${Math.round(maxMs / 60e3)} minuts` : 'S’ha aturat en arribar al límit de 20 MB') : 'Gravació a punt: desa-la per enviar-la');
        },
      });
    } catch (err) { go.disabled = false; toast(err && err.name === 'NotAllowedError' ? 'Dona permís al micròfon per poder gravar' : 'No s’ha pogut engegar el micròfon'); return; }
    sheetLock = () => toast('Atura la gravació abans de tancar');
    save.disabled = true; go.hidden = true; live.hidden = false; el.querySelector('#ql-rec-prev').hidden = true;
  };
  el.querySelector('#ql-rec-stop')?.addEventListener('click', () => rec?.stop());
  return { file: () => picked };
}
const recFieldHtml = (cur, student) => `${cur ? `<div class="rec-cur"><span>${esc(cur.name)} · ${fmtSize(cur.size)}</span></div>` : ''}
  ${canRecord() ? `<div class="rec-box"><button type="button" class="btn" id="ql-rec-go"><i class="rec-dot"></i>Grava ara</button>
    <div class="rec-live" id="ql-rec-live" hidden><i class="rec-dot on"></i><b class="mono" id="ql-rec-t">0:00</b><span class="muted" id="ql-rec-s">Gravant…</span><span class="spacer"></span><button type="button" class="btn btn-primary" id="ql-rec-stop">Atura</button></div>
    <audio id="ql-rec-prev" controls playsinline preload="metadata" hidden></audio></div>` : ''}
  <label class="dropzone" for="ql-file" id="ql-drop"><input id="ql-file" type="file" accept="audio/*,video/*,.m4a,.mp3" class="sr">
    <span class="dz-t">${cur ? 'Canvia-la per un fitxer' : 'O tria un fitxer'}</span><span class="dz-s">${student ? `Fins a ${Math.round(LOG_REC_MAX / 60e3)} minuts o 20 MB.` : 'Fins a 20 MB: un acompanyament, una versió de referència…'}</span></label>`;
/** Afegeix (o canvia) una entrada del quadern. kind: note | rec. back: on es torna en acabar (la fitxa). Una pregunta d'abans
 *  (q) que es torna a editar queda com a nota. */
function sheetLogNew(mid, kind = 'note', id = '', back = null) {
  const ex = id ? S.classLog.get(id) : null;
  if (id && !ex) return;
  const own = mid === myId();
  const kinds = OWN_KINDS;
  if (ex) kind = ex.kind;
  if (!kinds.includes(kind)) kind = 'note';
  const rep = repOf(mid);
  const m = S.members.get(mid);
  const kindName = k => own ? LOG_KINDS[k].t : k === 'rec' ? 'Material' : 'Nota';
  openSheet({
    title: ex ? 'Edita' : own ? 'Afegeix al quadern' : `Al quadern de ${firstName(m?.name || '')}`,
    body: `<div class="kv">
      ${ex ? '' : `<div class="seg3 ql-kinds" role="radiogroup" aria-label="Què hi afegeixes">${kinds.map(k => `<button type="button" role="radio" data-k="${k}" aria-checked="${k === kind}">${qlIcon(k)}${kindName(k)}</button>`).join('')}</div>`}
      <label class="field"><span id="ql-lab"></span><textarea class="inp u-minh-110" id="ql-text" maxlength="2000">${esc(ex?.text || '')}</textarea></label>
      <div class="field" id="ql-recf"><span>${own ? 'La gravació' : 'El fitxer'}</span>${recFieldHtml(ex?.file, own)}</div>
      ${rep.length ? `<label class="field"><span>De quina obra? <em class="muted">(opcional)</em></span><select class="inp" id="ql-work"><option value="">Cap en concret</option>${rep.map(w => `<option value="${esc(w.id)}" ${ex?.work === w.id ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}</select></label>` : ''}
      <p class="muted u-m-0 u-fs-t-13">${own ? `Ho veieu tu i el teu ${esc(V.Teacher.toLowerCase())}. La resta ${esc(V.del)}, no.` : `Ho veu ${esc(firstName(m?.name || 'l’alumne'))} al seu quadern.`}</p>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="ql-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" id="ql-no">Cancel·la</button><button class="btn btn-primary" id="ql-go">Desa</button>`,
    onMount: el => {
      const save = el.querySelector('#ql-go');
      const done = () => { if (back) back(); else { closeSheet(true); render(); } };
      const paint = () => {
        el.querySelectorAll('.ql-kinds button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === kind)));
        el.querySelector('#ql-lab').textContent = own ? LOG_KINDS[kind].label : kind === 'rec' ? 'Què és? (opcional)' : 'Què li vols dir?';
        el.querySelector('#ql-text').placeholder = own ? LOG_KINDS[kind].ph : kind === 'rec' ? 'p. ex. L’acompanyament del «Caro mio ben», una mica més lent.' : 'p. ex. Per a la setmana vinent: els compassos 1-24 de memòria.';
        el.querySelector('#ql-recf').hidden = kind !== 'rec';
      };
      el.querySelectorAll('.ql-kinds button').forEach(b => b.onclick = () => { kind = b.dataset.k; paint(); });
      paint();
      const recf = bindRecField(el, { name: `${own ? 'Quadern' : 'Material'} ${TODAY}`, maxMs: own ? LOG_REC_MAX : 0, save });
      el.querySelector('#ql-no').onclick = () => { if (sheetLock) { sheetLock(); return; } done(); };
      save.onclick = async () => {
        const text = el.querySelector('#ql-text').value.trim(), work = el.querySelector('#ql-work')?.value || '';
        const picked = kind === 'rec' ? recf.file() : null;
        let file = kind === 'rec' ? ex?.file || null : null;
        if (kind === 'rec' && !picked && !file) { toast(own ? 'Grava’t o tria un fitxer' : 'Tria el fitxer o grava’l'); return; }
        if (kind !== 'rec' && !text) { toast('Escriu-hi alguna cosa'); return; }
        if (PREVIEW) { previewBlocked(); return; }
        save.disabled = true;
        try { await ensureStudentDoc(mid); } catch { toast('Cal connexió per començar el quadern'); save.disabled = false; return; }
        if (picked) {
          if (!navigator.onLine) { toast('Cal connexió per pujar la gravació'); save.disabled = false; return; }
          try { file = await uploadFile(picked, (i, n) => { save.textContent = n > 1 ? `Pujant ${i} de ${n}…` : 'Pujant…'; }, own ? { where: 'classFiles', memberId: mid, own: true } : { where: 'classFiles', memberId: mid, teacher: myEmail() }); }
          catch { toast('No s’ha pogut pujar la gravació. Torna-ho a provar.'); save.disabled = false; save.textContent = 'Desa'; return; }
        }
        if (ex?.file && (!file || file.id !== ex.file.id)) deleteFile(ex.file);
        const at = new Date().toISOString();
        const rec = ex ? { ...ex, kind, text, edited: at } : { id: uid('ql'), memberId: mid, kind, text, date: TODAY, by: S.email || '', byName: (ME()?.name || '').slice(0, 80), at, ...(own ? {} : { t: true }) };
        if (file) rec.file = file; else delete rec.file;
        if (work) rec.work = work; else delete rec.work;
        saveLog(rec, ex);
        if (own && !ex) saveStudent(mid, { fresh: { at, kind, by: S.email || '', text: text.slice(0, 140) } });
        toast(ex ? 'Desat' : own ? `Afegit al teu quadern: el veurà el teu ${V.Teacher.toLowerCase()}` : `Afegit al quadern de ${firstName(m?.name || '')}`);
        done();
      };
      el.querySelector('#ql-del')?.addEventListener('click', async () => {
        if (!await confirmSheet('Esborrar-ho?', ex.file ? 'S’esborrarà també la gravació. No es pot desfer.' : 'No es pot desfer.', 'Esborra')) { sheetLogNew(mid, kind, id, back); return; }
        if (ex.file) deleteFile(ex.file);
        S.classLog.delete(id);
        db.doc(`students/${mid}/log/${id}`).delete().catch(writeFailed);
        toast('Esborrat'); done();
      });
    },
  });
}
/** El professorat respon una entrada de l'alumne (una nota, una gravació). */
function sheetLogReply(mid, id, back) {
  const e = S.classLog.get(id);
  if (!e) return;
  const m = S.members.get(mid);
  openSheet({
    title: `Respon ${firstName(m?.name || '')}`,
    body: `<div class="kv">
      <blockquote class="ql-quote"><span class="eyebrow">${esc(LOG_KINDS[e.kind]?.title || '')} · ${esc(shortDate(e.date))}</span>${e.text ? `<p>${esc(e.text)}</p>` : ''}</blockquote>
      <label class="field"><span>La teva resposta</span><textarea class="inp u-minh-110" id="qr-t" maxlength="1000" placeholder="p. ex. Molt bé! Respira al c. 11, abans de la síncope.">${esc(e.reply?.text || '')}</textarea>
        <small>${esc(firstName(m?.name || 'L’alumne'))} la veurà al seu quadern.</small></label>
    </div>`,
    foot: `${e.reply ? '<button class="btn btn-danger-ghost" id="qr-del">Treu la resposta</button>' : ''}<span class="spacer"></span><button class="btn" id="qr-no">Cancel·la</button><button class="btn btn-primary" id="qr-go">Respon</button>`,
    onMount: el => {
      const done = () => { if (back) back(); else { closeSheet(); render(); } };
      const put = reply => {
        const next = { ...e };
        if (reply) next.reply = reply; else delete next.reply;
        S.classLog.set(id, next);
        db.doc(`students/${mid}/log/${id}`).update({ reply: reply || firebase.firestore.FieldValue.delete() }).catch(writeFailed);
      };
      el.querySelector('#qr-no').onclick = done;
      el.querySelector('#qr-go').onclick = () => {
        const text = el.querySelector('#qr-t').value.trim();
        if (!text) { toast('Escriu la resposta'); return; }
        if (PREVIEW) { previewBlocked(); return; }
        put({ text, by: S.email || '', name: (ME()?.name || '').slice(0, 80), at: new Date().toISOString() });
        toast('Resposta desada'); done();
      };
      el.querySelector('#qr-del')?.addEventListener('click', () => { put(null); toast('Resposta treta'); done(); });
    },
  });
}

/* ---------- La fitxa de cant ---------- */
// Una sola fitxa per a l'alumne i per al seu professorat: a dalt, qui és i quan té classe; a sota, el quadern (el diari de
// les classes), el repertori i els objectius. Cada canvi es desa tot sol: no hi ha cap «Desa» que oblidar.
const STU_CTX = { mid: '', at: 0, notes: null, privs: null, tab: 'quadern', loaded: 'ok' };
/** Les dades que no es tenen sempre (les notes de classe d'un altre, les privades i el quadern d'un altre): un cop per fitxa. */
async function loadStudentCtx(mid) {
  const fresh = STU_CTX.mid === mid && Date.now() - STU_CTX.at < 5 * 60e3;
  if (fresh) return STU_CTX.loaded;
  Object.assign(STU_CTX, { mid, at: Date.now(), notes: null, privs: null, loaded: 'ok' });
  const own = mid === myId();
  if (!own || !S.students.has(mid)) {
    const loadRec = async () => { const d = await db.doc(`students/${mid}`).get(); if (d.exists) S.students.set(mid, d.data()); };
    try { await loadRec(); }
    catch (e) {
      STU_CTX.loaded = e && e.code === 'permission-denied' ? 'denied' : 'failed';
      if (STU_CTX.loaded === 'denied' && await joinStudent(mid)) { try { await loadRec(); STU_CTX.loaded = 'ok'; } catch { STU_CTX.loaded = 'failed'; } }
    }
  }
  if (STU_CTX.loaded !== 'ok') { STU_CTX.at = 0; return STU_CTX.loaded; }
  if (own) return 'ok';   // les meves notes i el meu quadern ja arriben sols
  const edit = teachesClasses();
  // Un professor només llegeix les notes de les seves classes (vegeu les regles); l'administració, totes.
  const q = db.collection('classNotes').where('memberId', '==', mid);
  try { STU_CTX.notes = (await (isAdmin() ? q : q.where('teacher', '==', myEmail())).get()).docs.map(d => d.data()); }
  catch { STU_CTX.notes = [...S.classNotes.values()].filter(n => n.memberId === mid); }
  for (const n of STU_CTX.notes) NOTE_CACHE.set(n.id, n);
  STU_CTX.privs = new Map();
  if (edit) {
    const qp = db.collection('classPriv').where('memberId', '==', mid);
    try { for (const d of (await (isAdmin() ? qp : qp.where('teacher', '==', myEmail())).get()).docs) STU_CTX.privs.set(d.id, d.data()); }
    catch { for (const n of S.classPriv.values()) if (n.memberId === mid) STU_CTX.privs.set(n.id, n); }
  }
  try {
    const snap = await db.collection(`students/${mid}/log`).get();
    for (const [id, x] of S.classLog) if (x.memberId === mid) S.classLog.delete(id);
    for (const d of snap.docs) S.classLog.set(d.id, d.data());
  } catch { /* sense el quadern de l'alumne: la resta de la fitxa es veu igual */ }
  return 'ok';
}
/** La propera classe i l'última d'un alumne, entre les que hi ha al mòbil. */
function studentClassFacts(mid) {
  let next = null, last = null;
  for (const c of classDays()) {
    if (!classLive(c)) continue;
    const x = classSlots(c).find(s => s.memberId === mid);
    if (!x) continue;
    if (c.date >= TODAY && !next) next = { c, x };
    if (c.date < TODAY) last = { c, x };
  }
  return { next, last };
}
function stuPane(mid, tab) {
  const own = mid === myId();
  const teach = teachesClasses() && !own;
  const ctx = { mid, own, teach, seenAt: own ? stuSeenAt(mid) : '' };
  if (tab === 'repertori') {
    const rep = repOf(mid);
    return `${rep.length ? repHtml(mid, true) : `<div class="ql-empty"><p>${own ? 'Encara no hi ha cap obra. Afegeix les que treballes: així el teu professorat sap per on vas.' : 'Encara no hi ha cap obra.'}</p></div>`}
      <button class="btn btn-sm u-mt-12" data-act="rep-new" data-m="${esc(mid)}">${ICON.plus}Afegeix una obra</button>`;
  }
  if (tab === 'objectius') {
    const s = stuOf(mid) || {};
    const block = (field, title, mineToEdit, empty) => `<section class="stu-goal">
      <div class="stu-goal-h"><span class="eyebrow">${title}</span>${mineToEdit ? `<button class="ql-a" data-act="goals-edit" data-m="${esc(mid)}" data-k="${field}">${s[field] ? 'Edita' : 'Escriu-los'}</button>` : ''}</div>
      ${s[field] ? `<p class="u-ws-pre-wrap u-m-0">${esc(s[field])}</p>` : `<p class="muted u-m-0">${empty}</p>`}</section>`;
    return block('goals', `Del ${esc(V.Teacher.toLowerCase())}`, teach, own ? 'Encara no te n’ha posat cap.' : 'Encara no n’hi ha. Escriu què ha de treballar aquest curs.')
      + block('myGoals', own ? 'Els teus' : `De ${esc(firstName(S.members.get(mid)?.name || ''))}`, own, own ? 'Escriu què vols aconseguir aquest curs.' : 'Encara no n’hi ha escrit cap.');
  }
  const entries = quadernEntries(mid, own ? null : STU_CTX.notes, own ? null : STU_CTX.privs);
  return entries.length ? qlList(entries, ctx)
    : `<div class="ql-empty"><p>${own ? 'Aquí hi haurà les notes de cada classe i el que hi afegeixis tu: el que has treballat a casa i gravacions per escoltar-te.' : 'Encara no hi ha res. Les notes de classe i el que hi afegeixi l’alumne sortiran aquí.'}</p></div>`;
}
async function sheetStudent(mid, tab) {
  const m = S.members.get(mid);
  const own = mid === myId();
  if (!m || (!teachesClasses() && !own)) return;
  if (tab) STU_CTX.tab = tab;
  else if (STU_CTX.mid !== mid) STU_CTX.tab = 'quadern';
  const keep = STU_CTX.mid === mid && Date.now() - STU_CTX.at < 5 * 60e3;
  if (!keep) openSheet({ title: fullName(m.name), wide: true, body: '<div class="stu-load"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div>' });
  const st = await loadStudentCtx(mid);
  if (!keep && !sheetClose) return;
  if (st !== 'ok') {
    openSheet({ title: fullName(m.name), body: `<p class="u-m-0">${st === 'denied' ? `Aquesta fitxa la porta un altre ${esc(V.Teacher.toLowerCase())}. Quan ${esc(firstName(m.name))} tingui classe amb tu, la podràs obrir.` : 'No s’ha pogut carregar la fitxa. Comprova la connexió i torna-ho a provar.'}</p>` });
    return;
  }
  // El professorat que l'obre ja ha vist el que l'alumne hi ha afegit.
  if (!own && stuNews(mid) && !PREVIEW) saveStudent(mid, { seen: { [seenKey(myEmail())]: new Date().toISOString() } });
  const { next, last } = studentClassFacts(mid);
  const hours = [...S.classPlan.values()].flatMap(p => (p.rows || []).filter(r => r.memberId === mid).map(r => `${capz(DAYS_CA[r.day])} ${r.time} · ${teacherName(p.teacher || p.id) || V.Teacher}`));
  const sec = SEC[m.section];
  const rep = repOf(mid), log = quadernEntries(mid, own ? null : STU_CTX.notes, own ? null : STU_CTX.privs);
  const fact = (k, v, s = '') => `<div><dt>${k}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd></div>`;
  const tabs = [['quadern', 'Quadern', log.length], ['repertori', 'Repertori', rep.length], ['objectius', 'Objectius', 0]];
  const canWrite = own || teachesClasses();
  openSheet({
    title: own ? 'La teva fitxa de cant' : 'Fitxa de cant',
    wide: true,
    body: `<header class="stu-hero">${avatar(m).replace('class="pav"', 'class="pav pav-lg"')}
        <div><b>${esc(fullName(m.name))}</b><small>${esc([sec?.name ? `${sec.name}${m.part ? ` ${m.part}` : ''}` : '', ...hours].filter(Boolean).join(' · '))}</small></div></header>
      <dl class="stu-facts">
        ${fact('Propera', next ? esc(next.c.date === TODAY ? 'Avui' : capz(fmtD(next.c.date, { weekday: 'short', day: 'numeric', month: 'short' })).replace('.', '')) : '—', next ? esc(next.x.time || '') : '')}
        <div id="stu-att-f">${fact('Assistència', '<span class="sk sk-inl"></span>', last ? `última, ${esc(shortDate(last.c.date))}` : '')}</div>
        ${fact('Obres', String(rep.length), rep.filter(x => x.status === 'apunt').length ? `${rep.filter(x => x.status === 'apunt').length} a punt` : '')}
      </dl>
      <section class="stu-att" aria-label="L’assistència del curs"><div class="stu-att-h"><span class="eyebrow">Les classes del curs</span></div><div id="stu-att-b"><span class="sk stu-att-sk"></span></div></section>
      <div class="seg3 stu-tabs" role="tablist" aria-label="Fitxa">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${STU_CTX.tab === k}">${l}${n ? `<span class="stu-n">${n}</span>` : ''}</button>`).join('')}</div>
      <div id="stu-pane" class="stu-pane">${stuPane(mid, STU_CTX.tab)}</div>
      ${own ? '' : `<p class="muted u-fs-t-13 u-mt-14 u-mb-0">Les notes privades només les veus tu${isAdmin() ? '' : ' i l’administració'}. La resta ho veu ${esc(firstName(m.name))}.</p>`}`,
    foot: canWrite ? `<button class="btn" data-act="stu-report" data-m="${esc(mid)}">Informe</button><span class="spacer"></span><button class="btn btn-primary" data-act="ql-new" data-m="${esc(mid)}" data-k="note">${ICON.plus}${own ? 'Afegeix al quadern' : 'Afegeix-hi material'}</button>` : '',
    onMount: el => {
      // L'assistència del curs arriba després: es llegeixen els dies de classe de tot el curs.
      const { season } = seasonCfg();
      studentCourse(mid).then(days => {
        if (!el.isConnected) return;
        const st = courseStats(days, mid, season.from, TODAY);
        el.querySelector('#stu-att-f').outerHTML = fact('Assistència', st.pct == null ? '—' : `${st.pct}%`, st.marked ? `${st.P + st.R} de ${nPl(st.marked, 'classe', 'classes')}` : 'cap classe marcada');
        el.querySelector('#stu-att-b').innerHTML = attStripHtml(st);
      }).catch(() => {
        if (!el.isConnected) return;
        el.querySelector('#stu-att-f').outerHTML = fact('Assistència', '—', '');
        el.querySelector('#stu-att-b').innerHTML = '<p class="muted u-m-0 u-fs-t-13">No s’ha pogut carregar l’assistència del curs. Comprova la connexió.</p>';
      });
      el.querySelectorAll('.stu-tabs [data-k]').forEach(b => b.onclick = () => {
        STU_CTX.tab = b.dataset.k;
        el.querySelectorAll('.stu-tabs [data-k]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
        el.querySelector('#stu-pane').innerHTML = stuPane(mid, STU_CTX.tab);
      });
    },
  });
}
/** Torna a la fitxa després de fer-hi un canvi (amb el que ja s'ha carregat). */
const backToStudent = mid => () => sheetStudent(mid, STU_CTX.tab);
function openRecording(id) {
  const n = NOTE_CACHE.get(id) || S.classNotes.get(id);
  if (n?.file) sheetOpenFile(n.file, `Classe del ${shortDate(n.date)}`);
}

/* ---------- Per a cada cantaire: la propera classe i el quadern ---------- */
/** La meva propera classe, en gran (com la propera sessió a Inici): quan, amb qui, on, què cal preparar i els avisos. */
function studentNextCard() {
  const mid = myId();
  if (!mid) return '';
  const { next } = studentClassFacts(mid);
  if (!next) return '';
  const { c, x } = next;
  const n = Math.round((parseISO(c.date).getTime() - parseISO(TODAY).getTime()) / 864e5);
  const lbl = dayLabel(c.date);
  const end = x.time ? hhmm((parseTime(x.time) ?? 0) + (+x.mins || 30)) : '';
  const rq = slotReqs(c, x);
  const notice = rq.find(r => ['late', 'absent'].includes(r.kind) && r.memberId === mid && r.status !== 'cancelled');
  const swap = rq.find(r => r.kind === 'swap' && r.status === 'pending');
  // Què cal preparar: la nota de l'última classe que en té (la del dia abans pot no tenir-ne).
  const prevNote = lastClassNote(mid, c.date);
  const prep = prevNote?.text || '';
  const last = prevNote ? { c: { date: prevNote.date } } : null;
  return `<article class="next-card cl-next-card">
    <div class="next-top">
      <span class="next-d"><small>${lbl ? `<em>${esc(lbl)}</em>` : esc(monthShort(c.date))}</small><b>${+c.date.slice(8, 10)}</b><small>${esc(wdShort(c.date))}</small></span>
      <div class="next-b">
        <span class="next-k">La teva classe${n > 1 ? `<span class="soon-count">d’aquí a ${n} dies</span>` : ''}</span>
        <h2 class="next-t">amb ${esc(teacherOf(c) || V.Teacher.toLowerCase())}</h2>
        <span class="next-when"><span class="next-time num">${esc(x.time || '')}${end ? `–${esc(end)}` : ''}</span>${c.place ? `<span>${esc(c.place)}</span>` : ''}</span>
        ${notice ? `<span><span class="st-pill st-${notice.status}">${notice.kind === 'late' ? 'Has avisat que arribaràs tard' : 'Has avisat que no hi vas'}</span></span>` : swap ? '<span><span class="st-pill st-pending">Canvi d’hora demanat</span></span>' : ''}
      </div>
    </div>
    ${prep ? `<p class="next-note cl-prep"><span class="eyebrow">De l’última classe · ${esc(shortDate(last.c.date))}</span>${esc(prep)}</p>` : ''}
    ${!notice ? `<div class="next-a"><button class="btn btn-sm" data-act="cl-avisa" data-c="${esc(c.id)}" data-s="${esc(x.id)}">Avisa o canvia l’hora…</button></div>` : ''}
  </article>`;
}
/** El quadern, a l'Espai personal: afegir-hi una nota o una gravació d'un toc, què hi has posat des de l'última classe i, en
 *  pestanyes, el diari (sencer, amb un filtre), el repertori i els objectius. */
function studentQuadernBlock() {
  const mid = myId();
  if (!mid) return '';
  const all = quadernEntries(mid);
  // A l'Espai personal, el diari sencer, amb un filtre: el de classe, les meves notes o les gravacions.
  const QF = { tot: ['Tot', () => true], classe: ['De classe', e => e.src === 'class' || !!e.t], notes: ['Les teves notes', e => e.src === 'log' && !e.t && e.kind !== 'rec'], grav: ['Gravacions', e => !!e.file] };
  const qf = QF[ui.qlFilter] ? ui.qlFilter : 'tot';
  const entries = all.filter(QF[qf][1]);
  const rep = repOf(mid);
  const ctx = { mid, own: true, teach: false, seenAt: stuSeenAt(mid) };
  const tab = ['diari', 'repertori', 'objectius'].includes(ui.qlTab) ? ui.qlTab : 'diari';
  // Des de l'última classe: el que el professorat trobarà quan obri el quadern abans de la propera.
  const { last } = studentClassFacts(mid);
  const since = last ? logOf(mid).filter(x => x.by === S.email && !x.t && (x.date || '') > last.c.date) : null;
  const n = k => since.filter(x => k === 'rec' ? x.kind === 'rec' : x.kind !== 'rec').length;
  const plural = (k, sg, pl) => `${k} ${k === 1 ? sg : pl}`;
  const sinceTxt = !since ? '' : since.length
    ? `Des de l’última classe (${esc(shortDate(last.c.date))}) hi has afegit ${[n('note') ? plural(n('note'), 'nota', 'notes') : '', n('rec') ? plural(n('rec'), 'gravació', 'gravacions') : ''].filter(Boolean).join(' i ')}.`
    : `Des de l’última classe (${esc(shortDate(last.c.date))}) encara no hi has afegit res.`;
  const compose = [['note', 'Nota', 'El que has treballat a casa'], ['rec', 'Grava’t', `Fins a ${Math.round(LOG_REC_MAX / 60e3)} minuts`]]
    .map(([k, t, sub]) => `<button data-act="ql-new" data-m="${esc(mid)}" data-k="${k}"><span class="ql-q-ic">${qlIcon(k)}</span><span class="ql-q-t"><b>${t}</b><small>${sub}</small></span></button>`).join('');
  const tabs = [['diari', 'Diari', all.length], ['repertori', 'Repertori', rep.length], ['objectius', 'Objectius', 0]];
  let pane;
  if (tab === 'repertori') {
    pane = `${rep.length ? repHtml(mid, true) : '<p class="ql-hint u-m-0">Encara no hi ha cap obra. Afegeix les que treballes i marca com van: així el teu professorat sap per on vas.</p>'}
      <button class="ql-more ql-add" data-act="rep-new" data-m="${esc(mid)}"><span>${ICON.plus}Afegeix una obra</span></button>`;
  } else if (tab === 'objectius') {
    pane = stuPane(mid, 'objectius');
  } else {
    const chips = all.length > 3 ? `<div class="chips ql-filter" role="group" aria-label="Què es mostra">${Object.entries(QF).map(([k, [l]]) => `<button class="chip" data-act="ql-filter" data-k="${k}" aria-pressed="${qf === k}">${l}</button>`).join('')}</div>` : '';
    pane = !all.length ? '<p class="ql-hint u-m-0">Aquí hi haurà les notes de cada classe i el que hi afegeixis tu. Només ho veieu tu i el teu professorat.</p>'
      : `${chips}${entries.length ? qlList(entries, ctx) : '<p class="ql-hint u-m-0">No n’hi ha cap.</p>'}`;
  }
  return `<section class="ql-block" aria-label="El teu quadern">
    <div class="section-title"><h2 class="h2">El teu quadern</h2></div>
    <div class="ql-quick" role="group" aria-label="Afegeix al quadern">${compose}</div>
    ${sinceTxt ? `<p class="ql-since${since.length ? ' is-done' : ''}">${since.length ? ICON.check : ''}<span>${sinceTxt}</span></p>` : ''}
    <div class="panel ql-panel">
      <div class="seg3 ql-tabs" role="tablist" aria-label="El quadern">${tabs.map(([k, l, c]) => `<button type="button" role="tab" data-act="ql-tab" data-k="${k}" aria-selected="${tab === k}">${l}${c ? `<span class="stu-n">${c}</span>` : ''}</button>`).join('')}</div>
      <div class="ql-pane ql-pane-${tab}">${pane}</div>
    </div>
  </section>`;
}

/* ---------- L'Espai personal ---------- */
// De qui fa classes (a la barra de Classes): l'assistència del curs, el quadern sencer (les notes de classe, les seves i les
// gravacions), el repertori i els objectius, i l'informe del trimestre.
const SPACE_ATT = { mid: '', busy: false, err: false };
/** L'assistència del curs: arriba després (es llegeixen els dies de classe de tot el curs); mentrestant, la silueta. */
function spaceAttHtml(mid) {
  const fresh = COURSE.mid === mid && COURSE.days && Date.now() - COURSE.at < 10 * 60e3;
  if (!fresh && !SPACE_ATT.busy && !(SPACE_ATT.err && SPACE_ATT.mid === mid)) {
    Object.assign(SPACE_ATT, { mid, busy: true, err: false });
    studentCourse(mid).then(() => { SPACE_ATT.busy = false; scheduleRender(); }, () => { Object.assign(SPACE_ATT, { busy: false, err: true }); scheduleRender(); });
  }
  if (!fresh) return SPACE_ATT.err && SPACE_ATT.mid === mid ? '<p class="muted u-m-0 u-fs-t-13">No s’ha pogut carregar l’assistència del curs. Comprova la connexió.</p>' : '<span class="sk stu-att-sk"></span>';
  const { season } = seasonCfg();
  const st = courseStats(COURSE.days, mid, season.from, TODAY);
  if (!st.list.length) return '<p class="muted u-m-0 u-fs-t-13">Encara no has fet cap classe aquest curs.</p>';
  return `<div class="sp-att-n"><b class="num">${st.pct == null ? '—' : `${st.pct}%`}</b><small>${st.marked ? `${st.P + st.R} de ${st.marked} ${st.marked === 1 ? 'classe' : 'classes'} aquest curs` : 'Encara cap classe marcada aquest curs'}</small></div>${attStripHtml(st)}`;
}
function viewStudentSpace() {
  const mid = myId();
  return `<div class="page-head"><div><div class="eyebrow">${esc(V.classes)}</div><h1 class="h1">Espai personal</h1></div><button class="btn btn-sm" data-act="stu-report" data-m="${esc(mid)}" data-k="espai">Informe</button></div>
    <section class="panel sp-att" aria-label="La teva assistència a classe"><span class="eyebrow">Assistència a classe</span>${spaceAttHtml(mid)}</section>
    ${studentQuadernBlock()}`;
}

/* ---------- L'assistència del curs d'un alumne ---------- */
// Al mòbil només hi ha les classes dels dos últims mesos: per al curs sencer es llegeixen els dies de cada professor de
// l'alumne (una consulta per professor) i es guarden uns minuts, per no tornar-los a llegir cada cop que s'obre la fitxa.
const COURSE = { mid: '', at: 0, days: null };
async function studentCourse(mid) {
  if (COURSE.mid === mid && COURSE.days && Date.now() - COURSE.at < 10 * 60e3) return COURSE.days;
  const keys = new Set((stuOf(mid)?.teachers) || []);
  for (const c of S.classes.values()) if (c.teacher && (c.slots || []).some(x => slotMember(x) === mid || x.memberId === mid)) keys.add(c.teacher);
  const all = new Map();
  for (const k of keys) for (const d of (await db.collection('classes').where('teacher', '==', k).get()).docs) { const c = d.data(); if (!c.deleted) all.set(d.id, c); }
  for (const c of S.classes.values()) all.set(c.id, c);   // el que hi ha al mòbil és el més recent
  const days = [...all.values()].filter(c => classLive(c) && (c.slots || []).some(x => slotMember(x) === mid)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  Object.assign(COURSE, { mid, at: Date.now(), days });
  return days;
}
/** Les classes ja fetes d'un període, amb la marca de cadascuna: { list: [{ c, x }], P, R, FJ, FNJ, marked, pct }. */
function courseStats(days, mid, from, to) {
  const out = { list: [], P: 0, R: 0, FJ: 0, FNJ: 0, marked: 0, pct: null };
  for (const c of days) {
    if (c.date < from || c.date > to || c.date > TODAY) continue;
    const x = (c.slots || []).find(s => slotMember(s) === mid);
    // La d'avui només compta un cop marcada: potser encara no s'ha fet.
    if (!x || (c.date === TODAY && !x.mark)) continue;
    out.list.push({ c, x });
    if (x.mark && x.mark in out) { out[x.mark]++; out.marked++; }
  }
  out.pct = out.marked ? Math.round(((out.P + out.R) / out.marked) * 100) : null;
  return out;
}
/** La tira de l'assistència a la fitxa: un punt per classe feta, del color de la marca. */
function attStripHtml(st) {
  if (!st.list.length) return '<p class="muted u-m-0 u-fs-t-13">Encara no hi ha cap classe feta aquest curs.</p>';
  const shown = st.list.slice(-30);
  return `<div class="stu-att-dots" role="list">${shown.map(({ c, x }) => `<span role="listitem" class="ad ${x.mark ? `ad-${x.mark}` : 'ad-none'}" title="${esc(`${shortDate(c.date)} · ${x.mark ? STATUS[x.mark].label || STATUS[x.mark].short : 'sense marcar'}`)}" aria-label="${esc(`${longDate(c.date)}: ${x.mark ? STATUS[x.mark].short : 'sense marcar'}`)}"></span>`).join('')}</div>
    <p class="stu-att-leg">${[['P', st.P], ['R', st.R], ['FJ', st.FJ], ['FNJ', st.FNJ]].filter(([, n]) => n).map(([k, n]) => `<span><i class="ad ad-${k}"></i>${n} ${esc(STATUS[k].short.toLowerCase())}</span>`).join('')}${st.list.length > st.marked ? `<span><i class="ad ad-none"></i>${st.list.length - st.marked} sense marcar</span>` : ''}</p>`;
}

/* ---------- L'informe del trimestre ---------- */
/** Els trimestres de la temporada (setembre-desembre, gener-març, abril-juliol) i el curs sencer. */
function coursePeriods() {
  const { season } = seasonCfg();
  const y = +String(season.from).slice(0, 4);
  const clip = (f, t) => ({ from: f < season.from ? season.from : f, to: t > season.to ? season.to : t });
  return [
    { k: 't1', name: '1r trimestre', ...clip(`${y}-09-01`, `${y}-12-31`) },
    { k: 't2', name: '2n trimestre', ...clip(`${y + 1}-01-01`, `${y + 1}-03-31`) },
    { k: 't3', name: '3r trimestre', ...clip(`${y + 1}-04-01`, `${y + 1}-07-31`) },
    { k: 'curs', name: 'Tot el curs', from: season.from, to: season.to },
  ].filter(p => p.from <= p.to);
}
function sheetStudentReport(mid, back) {
  const m = S.members.get(mid);
  if (!m) return;
  const ps = coursePeriods();
  const cur = ps.find(p => p.k !== 'curs' && p.from <= TODAY && TODAY <= p.to) || ps[ps.length - 1];
  let pick = cur.k;
  openSheet({
    title: 'Informe de classes',
    body: `<div class="kv">
      <p class="u-m-0">Un resum de ${mid === myId() ? 'les teves classes' : `les classes de ${esc(firstName(m.name))}`} per guardar o enviar en PDF: l’assistència, el repertori, els objectius i les notes de classe. Les notes privades no hi surten.</p>
      <div class="field"><span>De quin període?</span><div class="pickers" id="rr-p">${ps.map(p => `<button type="button" class="pick" data-k="${p.k}" aria-pressed="${p.k === pick}">${esc(p.name)}</button>`).join('')}<button type="button" class="pick" data-k="alt" aria-pressed="false">Unes altres dates</button></div></div>
      <div class="row3" id="rr-dates" hidden>
        <label class="field"><span>Des del</span><input class="inp" id="rr-from" type="date" value="${esc(cur.from)}"></label>
        <label class="field"><span>Fins al</span><input class="inp" id="rr-to" type="date" value="${esc(cur.to)}"></label>
      </div>
      <p class="muted u-m-0 u-fs-t-13">Al mòbil, tria «Desa com a PDF» a la finestra d’imprimir.</p>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" id="rr-no">Cancel·la</button><button class="btn btn-primary" id="rr-go">Fes l’informe</button>`,
    onMount: el => {
      el.querySelectorAll('#rr-p .pick').forEach(b => b.onclick = () => {
        pick = b.dataset.k;
        el.querySelectorAll('#rr-p .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        el.querySelector('#rr-dates').hidden = pick !== 'alt';
      });
      el.querySelector('#rr-no').onclick = () => { if (back) back(); else closeSheet(); };
      el.querySelector('#rr-go').onclick = async e => {
        const p = ps.find(x => x.k === pick) || { name: '', from: el.querySelector('#rr-from').value, to: el.querySelector('#rr-to').value };
        if (!p.from || !p.to || p.from > p.to) { toast('Tria unes dates correctes'); return; }
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'Preparant…';
        try { await printStudentReport(mid, p.from, p.to, p.name); if (back) back(); else closeSheet(); }
        catch { toast('No s’ha pogut preparar l’informe. Comprova la connexió.'); e.currentTarget.disabled = false; e.currentTarget.textContent = 'Fes l’informe'; }
      };
    },
  });
}
async function printStudentReport(mid, from, to, name) {
  const m = S.members.get(mid);
  const own = mid === myId();
  if ((await loadStudentCtx(mid)) !== 'ok') throw new Error('fitxa');
  const days = await studentCourse(mid);
  const st = courseStats(days, mid, from, to);
  const inRange = d => d >= from && d <= to;
  const notes = (own ? [...S.classNotes.values()].filter(n => n.memberId === mid) : STU_CTX.notes || []).filter(n => n.text && inRange(n.date || '')).sort((a, b) => a.date.localeCompare(b.date));
  const log = logOf(mid).filter(x => inRange(x.date || ''));
  const rep = repOf(mid), s = stuOf(mid) || {};
  const teachers = [...new Set(st.list.map(({ c }) => teacherOf(c)).filter(Boolean))];
  const period = `${name ? `${name} · ` : ''}del ${longDate(from).toLowerCase()} al ${longDate(to).toLowerCase()}`;
  const kpi = (v, l) => `<div class="pr-kpi"><b>${v}</b><span>${l}</span></div>`;
  const count = k => log.filter(x => x.kind === k && !x.t).length;
  printDoc(`Classes de cant · ${fullName(m.name)}`, `
    <p><b>${esc(fullName(m.name))}</b>${SEC[m.section] ? ` · ${esc(SEC[m.section].name)}` : ''}${teachers.length ? ` · amb ${esc(teachers.join(', '))}` : ''}<br>${esc(capz(period))}.</p>
    <div class="pr-kpis">${kpi(st.list.length, st.list.length === 1 ? 'Classe feta' : 'Classes fetes')}${kpi(st.pct == null ? '—' : `${st.pct}%`, 'Assistència')}${kpi(st.R, 'Retards')}${kpi(st.FJ + st.FNJ, 'Faltes')}${kpi(`${rep.filter(x => x.status === 'apunt').length}/${rep.length}`, 'Obres a punt')}</div>
    ${s.goals || s.myGoals ? `<h2>Objectius</h2>${s.goals ? `<h3>Del ${esc(V.Teacher.toLowerCase())}</h3><p class="u-ws-pre-wrap">${esc(s.goals)}</p>` : ''}${s.myGoals ? `<h3>De l’alumne</h3><p class="u-ws-pre-wrap">${esc(s.myGoals)}</p>` : ''}` : ''}
    ${rep.length ? `<h2>Repertori</h2><table class="pr-table"><thead><tr><th>Obra</th><th>Compositor</th><th>Com va</th></tr></thead><tbody>${rep.map(x => `<tr><td>${esc(x.title)}</td><td>${esc(x.composer || '')}</td><td>${esc(STUDENT_STATUS[x.status] || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${st.list.length ? `<h2>Assistència</h2><table class="pr-table"><thead><tr><th>Dia</th><th>Hora</th><th>${esc(V.Teacher)}</th><th>Assistència</th></tr></thead><tbody>${st.list.map(({ c, x }) => `<tr><td>${esc(capz(fmtD(c.date, { weekday: 'short', day: 'numeric', month: 'short' })))}</td><td>${esc(x.time || '')}</td><td>${esc(teacherOf(c))}</td><td>${x.mark ? esc(STATUS[x.mark].short) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
    ${notes.length ? `<h2>Notes de classe</h2><table class="pr-table"><tbody>${notes.map(n => `<tr><td class="u-ws-nowrap">${esc(shortDate(n.date))}</td><td class="u-ws-pre-wrap">${esc(n.text)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${log.length ? `<h2>Quadern</h2><p>${[[count('note'), 'notes d’estudi', 'nota d’estudi'], [count('rec'), 'gravacions', 'gravació'], [count('q'), 'preguntes', 'pregunta']].filter(([n]) => n).map(([n, pl, sg]) => `${n} ${n === 1 ? sg : pl}`).join(' · ') || 'Material del professorat'}.</p>
      <table class="pr-table"><tbody>${log.filter(x => x.text).sort((a, b) => a.date.localeCompare(b.date)).map(x => `<tr><td class="u-ws-nowrap">${esc(shortDate(x.date))}</td><td>${esc(x.t ? 'Material' : LOG_KINDS[x.kind]?.title || '')}</td><td class="u-ws-pre-wrap">${esc(x.text)}${x.reply ? `<br><i>${esc(fullName(x.reply.name) || V.Teacher)}: ${esc(x.reply.text)}</i>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}`);
}
