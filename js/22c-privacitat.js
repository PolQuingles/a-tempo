// A Tempo · 22c-privacitat.js — Les dades personals: com es tracten (una pàgina per a tothom), «Descarrega les meves dades»
// (cadascú, les seves) i esborrar les dades de les temporades velles (l'administració, a Ajustos › Dades).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Com es tracten les teves dades ---------- */
// Diu el que fa l'app, tal com és; qui en respon és l'agrupació (no l'app), i és qui atén els drets de cadascú.
function privacyHtml() {
  const g = esc(S.config.name || MARCA?.name || V.aquest);
  const priv = attPrivate();
  return `<div class="manual priv-page">
    <p style="margin-top:0">Aquesta app la fa servir <b>${g}</b> per organitzar els assajos i els concerts. Qui en respon és ${g}: si tens cap pregunta sobre les teves dades, o en vols corregir o esborrar alguna, parla amb l’administració ${esc(V.del)}.</p>
    <h3>Quines dades hi ha</h3>
    <ul><li>El teu nom, el correu amb què entres, la ${esc(V.section)} i la ${esc(V.part)}.</li>
      <li>La teva assistència: cada llista, els retards i les faltes, i els avisos d’absència amb el motiu que hi escriguis.</li>
      <li>Si les omples: el telèfon, la fitxa personal (talla i contacte d’emergència), les al·lèrgies i intoleràncies (amb el teu consentiment), els documents signats i la quota.</li>
      <li>Si fas ${esc(V.classes.toLowerCase())}: l’horari, l’assistència, les notes i els enregistraments de les classes.</li>
      <li>El que hi escriguis tu: respostes a convocatòries i enquestes, inscripcions a sortides i missatges.</li></ul>
    <h3>Qui les veu</h3>
    <ul><li><b>Tu</b> veus totes les teves dades.</li>
      <li>${priv ? `<b>La resta de ${esc(V.members)}</b> no veuen la teva assistència ni els teus avisos; només el teu nom, la ${esc(V.section)} i si estàs de baixa (sense el motiu).` : `<b>La resta de ${esc(V.members)}</b> poden veure les llistes d’assistència de tothom (l’administració ho pot canviar a Ajustos › Llistes privades).`}</li>
      <li>El teu <b>${esc(V.leader)}</b> veu l’assistència i els avisos de la teva ${esc(V.section)}; la <b>direcció</b>, la <b>gerència</b> i l’<b>administració</b>, els de tothom.</li>
      <li>El telèfon, la talla i el contacte d’emergència els veuen qui porta les persones: la <b>secretaria</b>, la <b>gerència</b>, la <b>direcció</b> i l’<b>administració</b>. Els documents signats i la quota, també.</li>
      <li>Les <b>al·lèrgies i intoleràncies</b> només les veus tu, la <b>secretaria</b> i la <b>gerència</b>, per organitzar els àpats de les sortides i els concerts.</li>
      <li>Les notes i els enregistraments de classe només els veus tu, el teu ${esc(V.Teacher.toLowerCase())} i l’administració.</li></ul>
    <h3>On es guarden</h3>
    <p>A la base de dades de Google Firebase, en servidors de la Unió Europea, amb accés només per a qui entra amb el seu compte. Cada nit se’n fa una còpia de seguretat en un lloc privat, xifrada amb una contrasenya que només té l’administració.</p>
    <h3>Quant de temps</h3>
    <p>Mentre formis part ${esc(V.del)}. L’administració pot esborrar les dades de les temporades velles; si te’n vas, pots demanar que s’esborrin les teves.</p>
    <h3>Els teus drets</h3>
    <p>Pots veure les teves dades i descarregar-les quan vulguis (a sota). Per corregir-les, esborrar-les o oposar-te a algun ús, demana-ho a l’administració ${esc(V.del)}. També pots adreçar-te a l’Autoritat Catalana de Protecció de Dades.</p>
  </div>`;
}
function sheetPrivacy() {
  const mine = !!myId() || !!S.memberId;
  openSheet({
    title: 'Com es tracten les teves dades',
    wide: true,
    body: privacyHtml(),
    foot: `${mine && S.mode === 'shared' ? '<button class="btn" data-act="my-data">Descarrega les meves dades</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" data-act="sheet-close">Entesos</button>`,
  });
}

/* ---------- Descarrega les meves dades ---------- */
// Tot el que l'app té de mi, en un fitxer: la fitxa, l'assistència, els avisos, les respostes i, si en fa, les classes.
// Es llegeix del que ja hi ha al mòbil i, del que no es llegeix sempre (la fitxa personal, els documents, la fitxa de cant),
// d'una lectura a part. Només hi surten les dades d'aquesta persona.
async function exportMyData() {
  const mid = S.memberId && S.members.has(S.memberId) ? S.memberId : null;
  if (!mid) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  toast('Preparant les teves dades…');
  const one = async path => { try { const d = await db.doc(path).get(); return d.exists ? d.data() : null; } catch { return null; } };
  const sessions = new Map(allSessions().map(s => [s.id, s]));
  const marks = [];
  for (const d of allAttendance().values()) {
    const mk = d.marks?.[mid];
    if (!mk || !mk.s) continue;
    const s = sessions.get(d.sessionId);
    marks.push({ date: s?.date || d.date || '', session: s ? `${s.type || 'Assaig'} · ${prodNames(s)}` : d.sessionId, ...mk });
  }
  marks.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const own = (map, key = 'memberId') => [...(map?.values?.() || [])].filter(x => x && x[key] === mid);
  const [profile, docs, student, choice, priv, health] = await Promise.all([one(`profiles/${mid}`), one(`memberDocs/${mid}`), one(`students/${mid}`), one(`prodChoice/${mid}`), one(`memberPriv/${mid}`), one(`health/${mid}`)]);
  const m = { ...S.members.get(mid), ...(priv || {}) };
  delete m.syncAt;
  const data = {
    app: 'a-tempo', kind: 'les-meves-dades', group: S.config.name || '', exportedAt: new Date().toISOString(), email: S.email || '',
    fitxa: m, assistencia: marks, absencies: own(S.absences), convocatories: own(S.rsvp), enquestes: own(S.pollVotes), sortides: own(S.tripSignups),
    fitxaPersonal: profile, alergies: health, documents: docs, produccions: choice, fitxaDeCant: student,
    classes: classDays().flatMap(c => (c.slots || []).filter(x => slotMember(x) === mid).map(x => ({ date: c.date, time: x.time, mark: x.mark || '', teacher: teacherOf(c) }))),
    notesDeClasse: own(S.classNotes).map(n => ({ date: n.date, text: n.text || '', enregistrament: n.file ? n.file.name : '' })),
    missatges: [...S.threads.values()].filter(t => t.memberId === mid).map(t => ({ subject: t.subject || '', msgs: t.msgs || [] })),
  };
  offerFile(`les-meves-dades-${slugify(fullName(m.name || 'cantaire'))}-${TODAY}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/* ---------- Esborrar les temporades velles ---------- */
// L'administració tria fins a quina data i, després de veure què s'esborrarà, ho esborra per sempre: les llistes (també les
// còpies de cadascú i els trossos arxivats), els avisos d'absència, les respostes a convocatòries i les classes (amb les seves
// notes i peticions). Les produccions, la plantilla i el repertori no es toquen. La còpia de seguretat de cada nit encara les té.
function retentionPlan(cut) {
  const sessions = allSessions().filter(s => s.date < cut);
  const sids = new Set(sessions.map(s => s.id));
  const att = [...allAttendance().entries()].filter(([, d]) => sids.has(d.sessionId) || (d.date && d.date < cut)).map(([k]) => k);
  const abs = [...S.absences.values()].filter(a => (a.sessionIds || []).length && a.sessionIds.every(id => sids.has(id) || !sessionById(id))).map(a => a.id);
  const rsvp = [...S.rsvp.values()].filter(r => sids.has(r.sessionId)).map(r => `${r.sessionId}_${r.memberId}`);
  const classes = [...S.classes.values()].filter(c => c.date && c.date < cut).map(c => c.id);
  const arch = [...(ARCH.by || new Map()).entries()].filter(([, a]) => a.to && a.to < cut).map(([id]) => id);
  return { cut, sessions: sessions.length, sids, att, abs, rsvp, classes, arch };
}
function sheetRetention() {
  if (!isAdmin()) return;
  const { season } = seasonCfg();
  let cut = season.from;
  const paint = el => {
    const p = retentionPlan(cut);
    el.querySelector('#rt-sum').innerHTML = `<ul class="mini-list" style="max-height:none">
      <li><span><b>${p.att.length}</b> llistes d’assistència (de ${p.sessions} sessions)${p.arch.length ? ` i ${p.arch.length} ${p.arch.length === 1 ? 'tros arxivat' : 'trossos arxivats'}` : ''}</span></li>
      <li><span><b>${p.abs.length}</b> avisos d’absència</span></li>
      <li><span><b>${p.rsvp.length}</b> respostes a convocatòries</span></li>
      <li><span><b>${p.classes.length}</b> dies de ${esc(V.classes.toLowerCase())} (amb les notes i les peticions)</span></li></ul>`;
    el.querySelector('#rt-go').disabled = !(p.att.length || p.abs.length || p.rsvp.length || p.classes.length || p.arch.length);
  };
  openSheet({
    title: 'Esborra les temporades velles',
    body: `<p style="margin-top:0">Esborra per sempre l’assistència, els avisos d’absència, les respostes i les ${esc(V.classes.toLowerCase())} d’abans d’una data. Les produccions, la plantilla i el repertori es queden. Fes-ho quan ja no calguin (per exemple, un cop acabada i tancada la temporada).</p>
      <label class="field"><span>Esborra tot el que és d’abans del</span><input class="inp" type="date" id="rt-cut" value="${esc(cut)}" max="${esc(TODAY)}"></label>
      <div id="rt-sum"></div>
      <p class="muted" style="font-size:calc(13px*var(--ts))">Les estadístiques i la norma d’aquelles temporades ja no es podran mirar. La còpia de seguretat de cada nit encara les tindrà un temps.</p>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-danger" id="rt-go">Esborra-ho</button>`,
    onMount: el => {
      el.querySelector('#rt-cut').onchange = e => { cut = e.target.value || season.from; paint(el); };
      el.querySelector('#rt-go').onclick = async () => {
        const p = retentionPlan(cut);
        if (!await confirmSheet('Esborrar-ho per sempre?', `S’esborraran ${p.att.length} llistes, ${p.abs.length} avisos, ${p.rsvp.length} respostes i ${p.classes.length} dies de classe d’abans del ${esc(shortDate(cut))}. No es pot desfer.`, 'Esborra-ho', true)) return;
        try { await runRetention(p); toast('Fet: les dades velles s’han esborrat'); }
        catch { toast('No s’ha pogut acabar. Comprova la connexió i torna-ho a provar.'); }
        render();
      };
      paint(el);
    },
  });
}
async function runRetention(p) {
  if (!isAdmin() || PREVIEW) return;
  const del = [...p.att.map(k => `attendance/${k}`), ...p.abs.map(id => `absences/${id}`), ...p.rsvp.map(id => `rsvp/${id}`), ...p.classes.map(id => `classes/${id}`), ...p.arch.map(id => `attArchive/${id}`)];
  const cls = new Set(p.classes);
  for (const r of S.classReq.values()) if (cls.has(r.classId)) del.push(`classReq/${r.id}`);
  for (const n of S.classNotes.values()) if (cls.has(n.classId)) del.push(`classNotes/${n.id}`);
  for (let i = 0; i < del.length; i += 400) {
    const b = fs.batch();
    for (const path of del.slice(i, i + 400)) b.delete(db.doc(path));
    await b.commit();
  }
  // Les còpies de cadascú (llistes privades): se'n treuen aquelles sessions.
  if (attPrivate() && p.sids.size) {
    const FP = firebase.firestore.FieldPath, gone = firebase.firestore.FieldValue.delete();
    const ids = [...S.members.keys()];
    for (let i = 0; i < ids.length; i += 400) {
      const b = fs.batch();
      for (const mid of ids.slice(i, i + 400)) {
        const fields = [...p.sids].map(sid => new FP('marks', sid));
        b.set(db.doc(`attMine/${mid}`), { marks: Object.fromEntries([...p.sids].map(sid => [sid, gone])) }, { mergeFields: fields });
      }
      await b.commit();
    }
  }
  for (const k of p.att) S.attendance.delete(k);
  for (const id of p.abs) S.absences.delete(id);
  for (const id of p.classes) S.classes.delete(id);
  if (p.arch.length) {
    const ids = ((S.config.attArchive && S.config.attArchive.ids) || []).filter(id => !p.arch.includes(id));
    saveConfig({ attArchive: { ...(S.config.attArchive || {}), ids } });
  }
  bumpEpoch('attendance', 'classes');
}

/* ---------- Dades d'abans, al seu lloc (un cop per agrupació i mòbil) ---------- */
// Les al·lèrgies es desaven a la fitxa personal (profiles), que llegeix qui porta les persones; ara van a part (health), que
// només llegeixen la persona, la secretaria i la gerència. I les notes de classe, els enregistraments i les fitxes de cant ara
// diuen de quin professor són (teacher, teachers), perquè cadascun només vegi els seus alumnes. Qui pot fer-ho ho passa en obrir
// l'app; si no hi ha res per passar, només costa una lectura per col·lecció.
async function tidyOldData() {
  if (PREVIEW || !db) return;
  const key = k => `atempo:passat:${k}:${GID}`, done = k => lsGet(key(k)) === '1', mark = k => lsSet(key(k), '1');
  const del = firebase.firestore.FieldValue.delete();
  const commitAll = async ops => { for (let i = 0; i < ops.length; i += 200) { const b = fs.batch(); ops.slice(i, i + 200).forEach(f => f(b)); await b.commit(); } };
  if (acctHas('admin', 'secretaria', 'gerencia') && !done('dieta')) {
    try {
      const old = (await db.collection('profiles').get()).docs.filter(d => String(d.data().diet || '').trim());
      await commitAll(old.map(d => b => {
        const x = d.data();
        b.set(db.doc(`health/${d.id}`), { memberId: d.id, diet: String(x.diet).trim().slice(0, 200), at: x.at || new Date().toISOString(), by: S.email || '' });
        b.update(d.ref, { diet: del });
      }));
      mark('dieta');
    } catch { /* es tornarà a provar el pròxim cop */ }
  }
  if (isAdmin() && !done('professorat')) {
    try {
      const [notes, files, studs] = await Promise.all(['classNotes', 'classFiles', 'students'].map(c => db.collection(c).get()));
      const teacherOfClass = new Map([...S.classes.values()].map(c => [c.id, c.teacher || '']));
      for (const n of notes.docs) {
        const cid = n.data().classId;
        if (cid && !teacherOfClass.has(cid)) { const c = await db.doc(`classes/${cid}`).get().catch(() => null); teacherOfClass.set(cid, (c && c.exists && c.data().teacher) || ''); }
      }
      const ops = [], fileTeacher = new Map();
      for (const n of notes.docs) {
        const x = n.data(), t = x.teacher || teacherOfClass.get(x.classId) || '';
        if (x.file?.id && t) fileTeacher.set(x.file.id, t);
        if (!x.teacher && t) ops.push(b => b.update(n.ref, { teacher: t }));
      }
      for (const f of files.docs) {
        const t = fileTeacher.get(f.id.replace(/_\d+$/, ''));
        if (!f.data().teacher && t) ops.push(b => b.update(f.ref, { teacher: t }));
      }
      for (const st of studs.docs) if (!Array.isArray(st.data().teachers)) ops.push(b => b.update(st.ref, { teachers: studentTeachers(st.id, []) }));
      await commitAll(ops);
      mark('professorat');
    } catch { /* es tornarà a provar el pròxim cop */ }
  }
}
