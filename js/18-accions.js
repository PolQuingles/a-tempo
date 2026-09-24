// A Tempo · 17-accions.js — Accions de la interfície i escolta d'esdeveniments (clics, formularis).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Events ================= */
const SUB_OK = new Set(['mark', 'min', 'mark-rest']);
const ADMIN_ONLY = new Set(['staff-new', 'staff-edit', 'staff-bulk', 'preview-on', 'who-in', 'mail-check', 'wipe-all', 'share-app', 'onboard-hide', 'cl-seats']);
// La identitat de l'agrupació i esborrar-la: només un Usuari Pro que l'administri.
const PRO_ONLY = new Set(['brand-color', 'logo-remove', 'kind-set', 'group-delete', 'sections-save', 'sections-undo']);
// El calendari de les classes: només el professorat de cant i l'administració.
const CLASS_ONLY = new Set(['cl-new', 'cl-edit', 'cl-review', 'cl-paste', 'cl-plan', 'cl-note', 'cl-mark', 'cl-stats', 'cl-cancel-day']);
const EDIT_ONLY = new Set(['mark', 'min', 'mark-rest', 'session-new', 'sub-set', 'ann-new', 'ann-edit', 'mat-new', 'mat-edit', 'poll-new', 'poll-edit', 'poll-results', 'poll-remind', 'rsvp-remind', 'doc-new', 'doc-edit', 'share-app', 'staff-bulk', 'preview-on', 'who-in', 'mail-check', 'concert-list', 'concert-toggle', 'session-edit', 'member-edit', 'member-bulk', 'prod-new', 'prod-edit',
  'wipe-demo', 'wipe-all', 'load-demo', 'export-json', 'abs-accept', 'abs-reject', 'abs-delete', 'manage']);
const actions = {
  'tab': el => { ui.tab = el.dataset.tab; ui.rollSec = null; ui._calScrolled = false; closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 }); },
  'reload': () => location.reload(),
  'google-in': () => signInGoogle(),
  'cl-new': el => sheetClassDay(null, { teacher: el.dataset.k || '', date: el.dataset.date || '' }),
  'cl-paste': el => sheetClassPaste(el.dataset.k || ''),
  'cl-plan': el => sheetClassPlan(el.dataset.k || planWho()),
  'cl-who': el => { ui.clWho = el.dataset.k; ui.clMonth = null; ui.clDay = null; saveUI(); render(); window.scrollTo({ top: 0 }); },
  'cl-back': () => { ui.clWho = null; saveUI(); render(); window.scrollTo({ top: 0 }); },
  'cl-month': el => { const [y, m] = ui.clMonth.split('-').map(Number); const d = new Date(y, m - 1 + (+el.dataset.dir), 1); ui.clMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(); },
  'cl-day': el => { ui.clDay = el.dataset.date; render(); },
  'cl-seats': () => sheetTeacherSeats(),
  'cl-note': el => sheetClassNote(el.dataset.c, el.dataset.s),
  'cl-mark': el => markClass(el.dataset.c, el.dataset.s, el.dataset.v),
  'cl-stats': () => sheetClassStats(false),
  'cl-open-take': el => takeOpenSwap(el.dataset.r),
  'cl-free': el => askFreeSlot(el.dataset.c, el.dataset.s),
  'cl-cancel-day': el => cancelClassDay(el.dataset.c),
  'cl-ics': () => sheetClassIcs(),
  'cl-mystats': () => sheetClassStats(true),
  'cl-edit': el => sheetClassDay(el.dataset.c),
  'cl-notice': el => sheetClassNotice(el.dataset.c, el.dataset.s, el.dataset.k),
  'cl-swap': el => sheetClassSwap(el.dataset.c, el.dataset.s),
  'cl-answer': el => answerClassReq(el.dataset.r, el.dataset.v),
  'cl-review': el => answerClassReq(el.dataset.r, el.dataset.v),
  'cl-cancel': el => answerClassReq(el.dataset.r, 'cancelled'),
  'mail-in': () => mailStart('signin'),
  'mail-step': el => { MAIL = { ...(MAIL || {}), step: el.dataset.step, email: $('#ml-email')?.value.trim() || MAIL?.email || '', msg: '', ok: '' }; render(); },
  'mail-cancel': () => { MAIL = null; render(); },
  'mail-verified': () => mailVerified(),
  'mail-resend': () => mailResend(),
  'mail-out': async () => { try { await auth.signOut(); } catch {} MAIL = null; location.replace(location.pathname + location.search); },
  'sign-out': () => signOut(),
  'help': () => sheetHelp(),
  'staff-new': el => sheetStaff(null, el && el.dataset.role ? [el.dataset.role] : null),
  'staff-bulk': () => sheetStaffBulk(),
  'preview-on': () => sheetPreview(),
  'push-setup': () => sheetPush(),
  'file-open': el => {
    const item = el.dataset.src === 'doc'
      ? (S.config.documents || []).find(x => x.id === el.dataset.id)
      : (S.productions.get(el.dataset.pid)?.materials || []).find(x => x.id === el.dataset.id);
    if (item?.file) sheetOpenFile(item.file, item.title);
  },
  'doc-new': () => sheetDocument(null),
  'doc-edit': el => sheetDocument(el.dataset.id),
  'theme': el => setTheme(el.dataset.k),
  'account': () => sheetAccount(),
  'concert-list': el => { closeSheet(); sheetConcertList(el.dataset.pid); },
  'concert-toggle': el => sheetConcertDecide(el.dataset.pid, el.dataset.mid),
  'risk-copy': () => copyText(window.__riskText ? window.__riskText() : '', 'Resum copiat'),
  'who-in': () => sheetWhoIn(),
  'mail-check': () => sheetMailCheck(),
  'preview-off': () => { PREVIEW = null; ui.tab = 'gestio'; ui.manage = 'config'; ui.rollSec = null; render(); window.scrollTo({ top: 0 }); },
  'share-app': () => sheetShareApp(),
  'staff-edit': el => sheetStaff(el.dataset.email),
  'sub-set': el => sheetSub(el.dataset.sid, el.dataset.sec),
  'rsvp-list': el => sheetRsvpList(el.dataset.sid),
  'rsvp-yes': el => rsvpAnswer(el.dataset.sid, 'yes'),
  'rsvp-no': el => sheetRsvpNo(el.dataset.sid),
  'cal-subscribe': () => sheetCalendar(),
  'board': el => { ui.board = el.dataset.k; saveUI(); render(); },
  'board-polls': () => { ui.tab = 'tauler'; ui.board = 'enquestes'; render(); window.scrollTo({ top: 0 }); },
  'board-news': () => { ui.tab = 'tauler'; ui.board = 'anuncis'; closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 }); },
  // Des d'Inici: directe a la llista d'aquella sessió i, si soc cap, a la meva secció.
  'home-roll': el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    ui.tab = 'llista'; ui.att = 'llista'; ui.sessionId = s.id;
    ui.rollSec = el.dataset.sec && convoked(s, el.dataset.sec) ? (ui.section = el.dataset.sec) : null;
    closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 });
  },
  'cal-class': el => { ui.tab = 'classes'; ui.clWho = el.dataset.k || null; ui.clMonth = (el.dataset.date || TODAY).slice(0, 7); ui.clDay = el.dataset.date || null; closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 }); },
  'ann-new': () => sheetAnnouncement(null),
  'ann-edit': el => sheetAnnouncement(el.dataset.id),
  'mat-new': () => sheetMaterial(ui.matProd, null),
  'mat-edit': el => sheetMaterial(el.dataset.pid, el.dataset.id),
  'mat-prod': el => { ui.matProd = el.dataset.id; render(); },
  'mat-mine': () => { ui.matMine = ui.matMine === false; render(); },
  'poll-new': () => sheetPoll(null),
  'poll-edit': el => sheetPoll(el.dataset.id),
  'poll-results': el => sheetPollResults(el.dataset.id),
  'poll-remind': el => remindPoll(el.dataset.id),
  'poll-vote': el => votePoll(el.dataset.id),
  'rsvp-remind': el => remindRsvp(el.dataset.sid),
  'my-att': () => sheetMyAttendance(),
  'brand-color': el => setBrandColor(el.dataset.color),
  'logo-remove': () => { const b = { ...(S.config.brand || {}) }; delete b.logo; saveConfig({ brand: b }); render(); },
  'absence-new': el => sheetAbsence(el.dataset.sid),
  'who-am-i': () => sheetWhoAmI(),
  'abs-filter': el => { ui.absFilter = el.dataset.k; render(); },
  'abs-accept': el => { const a = S.absences.get(el.dataset.aid); if (!a) return; acceptAbsence(a); toast(a.kind === 'absent' ? 'Avís acceptat: faltes justificades' : 'Avís acceptat'); render(); },
  'abs-reject': el => { const a = S.absences.get(el.dataset.aid); if (!a) return; saveAbsence({ ...a, status: 'rejected', reviewedAt: new Date().toISOString() }); toast('Avís rebutjat'); render(); },
  'abs-delete': async el => { const a = S.absences.get(el.dataset.aid); if (!a) return; if (!await confirmSheet('Esborrar l’avís?', 'Les faltes que ja s’hagin marcat es mantenen.', 'Esborra')) return; S.absences.delete(a.id); persist('absences', a.id, null, 10); render(); },
  'abs-cancel': async el => { const a = S.absences.get(el.dataset.aid); if (!a) return; if (!await confirmSheet('Retirar l’avís?', `El teu ${V.leader} deixarà de veure’l.`, 'Retira')) return; S.absences.delete(a.id); persist('absences', a.id, null, 10); render(); },
  'stats-scope': el => { ui.statsScope = el.dataset.k; saveUI(); render(); },
  'att': el => { ui.att = el.dataset.k; ui.rollSec = null; saveUI(); render(); window.scrollTo({ top: 0 }); },
  'stats-term': el => { ui.statsTerm = +el.dataset.i; render(); },
  'load-demo': () => loadDemo(),
  'groups': () => sheetGroups(),
  'group-go': el => switchGroup(el.dataset.gid),
  'group-create': () => {
    const u = auth && auth.currentUser;
    if (!u || u.isAnonymous) { try { localStorage.setItem(LS_INTENT, 'create'); } catch {} signInGoogle(); return; }
    startCreate();
  },
  'platform': () => sheetPlatform(),
  'platform-claim': () => claimPlatform(),
  'cr-kind': el => {
    if (!CREATE || Date.now() < CREATE.readyAt) return;
    if (CREATE.kind !== el.dataset.k) { CREATE.kind = el.dataset.k; CREATE.sections = defaultSections(el.dataset.k); }
    render();
  },
  'cr-next': () => createStep(1),
  'cr-back': () => createStep(-1),
  'cr-cancel': () => cancelCreate(),
  'cr-go': () => createGroup(),
  'sec-add': el => { const list = secList(el.dataset.p); if (!list) return; list.push({ id: '', name: '', short: '' }); redrawSections(el.dataset.p, true); },
  'sec-up': el => { const list = secList(el.dataset.p), i = +el.dataset.i; if (!list || i < 1) return; [list[i - 1], list[i]] = [list[i], list[i - 1]]; redrawSections(el.dataset.p); },
  'sec-del': el => { const list = secList(el.dataset.p); if (!list) return; list.splice(+el.dataset.i, 1); redrawSections(el.dataset.p); },
  'kind-set': el => setKind(el.dataset.k),
  'group-delete': () => sheetDeleteGroup(),
  'sections-save': () => saveSections(),
  'sections-undo': () => { CFG_SECTIONS = null; CFG_DIRTY = false; render(); },
  'onboard-hide': () => { saveConfig({ onboarded: true }); render(); },
  'sync-info': () => openSheet({
    title: 'Estat de les dades',
    body: S.mode === 'shared'
      ? `<p style="margin-top:0">${canEdit() ? 'Les llistes es desen automàticament i es comparteixen en temps real amb la resta de l’equip.' : isLinkOnly() ? 'Tens un enllaç personal: pots veure el calendari i avisar de les teves absències.' : 'Tens accés de <b>només lectura</b>: veus les llistes, el calendari i les estadístiques al moment, però no pots canviar res. Al teu espai sí que pots avisar d’absències i confirmar convocatòries.'}</p>
         <p style="margin-top:0">Si et quedes sense cobertura, pots continuar passant llista: els canvis s’envien sols quan torni la connexió.</p>
         <p class="muted" style="margin-bottom:0">${!navigator.onLine ? 'Ara mateix no hi ha connexió.' : pendingWrites() ? `Desant ${pendingWrites()} canvis…` : 'Tots els canvis estan desats.'}</p>`
      : `<p style="margin:0">Encara no hi ha cap cor connectat en aquest dispositiu.</p>`,
    foot: S.mode === 'shared' && canEdit() ? '<button class="btn btn-primary" data-act="manage" data-k="config">Ajustos</button>' : '',
  }),
  'open-sec': el => { ui.rollSec = ui.section = el.dataset.sec; saveUI(); render(); window.scrollTo({ top: 0 }); },
  'close-sec': () => { ui.rollSec = null; render(); window.scrollTo({ top: 0 }); },
  'sess-step': el => {
    const list = allSessions(); const i = list.findIndex(s => s.id === ui.sessionId);
    const n = list[i + +el.dataset.dir]; if (n) { ui.sessionId = n.id; render(); }
  },
  'sess-pick': () => sheetSessionPicker(),
  'pick-session': el => { ui.sessionId = el.dataset.sid; closeSheet(); render(); },
  'pick-today': () => { ui.sessionId = defaultSession(allSessions())?.id; closeSheet(); render(); },
  'open-session': el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    ui.sessionId = s.id; ui.tab = 'llista';
    if (!el.dataset.keep) ui.rollSec = null;
    else if (!convoked(s, ui.section)) ui.rollSec = ui.section = (s.sections && s.sections[0]) || ui.section;
    closeSheet(); saveUI(); render(); window.scrollTo({ top: 0 });
  },
  'mark': el => {
    const row = el.closest('.row'); const mid = row.dataset.mid;
    const cur = sessionById(ui.sessionId); const m = S.members.get(mid);
    const s = el.dataset.s;
    const current = attDoc(cur.id, m.section)?.marks?.[mid];
    if (current && current.s === s) setMark(cur, m, null);
    else if (s === 'R' && !current?.min && lateNow(cur)) setMark(cur, m, { s, min: lateNow(cur) });
    else setMark(cur, m, { s });
    if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
    refreshRow(mid);
  },
  'min': el => {
    const mid = el.closest('.row').dataset.mid;
    const cur = sessionById(ui.sessionId); const m = S.members.get(mid);
    setMark(cur, m, { s: 'R', min: +el.dataset.min });
    refreshRow(mid);
  },
  'mark-rest': () => {
    const cur = sessionById(ui.sessionId);
    const pending = membersOf(ui.section).filter(m => !isOut(cur, m) && !effMark(cur, m));
    if (!pending.length) return;
    const key = attKey(cur.id, ui.section);
    const before = S.attendance.has(key) ? clone(S.attendance.get(key)) : null;
    const doc = clone(before || { sessionId: cur.id, section: ui.section, marks: {} });
    for (const m of pending) doc.marks[m.id] = { s: 'P' };
    doc.updatedAt = new Date().toISOString();
    S.attendance.set(key, doc); persist('attendance', key, doc);
    render();
    toast(`${pending.length} marcats com a presents`, { label: 'Desfés', run: () => {
      if (before) { S.attendance.set(key, before); persist('attendance', key, before); }
      else { const d = clone(S.attendance.get(key)); for (const m of pending) delete d.marks[m.id]; S.attendance.set(key, d); persist('attendance', key, d); }
      render();
    } });
  },
  'summary': el => sheetSummary(el.dataset.scope),
  'cal-prod': el => { ui.calProd = el.dataset.id; saveUI(); render(); },
  'cal-past': () => { ui.calPast = !ui.calPast; ui._calScrolled = false; render(); },
  'cal-view': el => { ui.calView = el.dataset.k; saveUI(); render(); },
  'cal-month': el => {
    const [y, m] = (ui.calMonth || TODAY.slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + +el.dataset.dir, 1);
    ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; ui.calDay = null; render();
  },
  'cal-day': el => { ui.calDay = el.dataset.date; render(); },
  'cal-today': () => { ui.calMonth = TODAY.slice(0, 7); ui.calDay = TODAY; render(); },
  'session-new': el => sheetSession(null, null, el.dataset.date),
  'session-info': el => sheetSessionInfo(el.dataset.sid),
  'session-edit': el => sheetSession(el.dataset.sid),
  'stats-prod': el => { ui.statsProd = el.dataset.id; ui.statsScope = 'prod'; render(); },
  'stats-sec': el => { ui.statsSec = el.dataset.sec; saveUI(); render(); },
  'stats-sort': el => { ui.statsSort = el.dataset.k; saveUI(); render(); },
  'member-stats': el => sheetMemberStats(el.dataset.mid),
  'export-csv': () => exportCSV(),
  'export-json': () => exportJSON(),
  'manage': el => { ui.manage = el.dataset.k; ui.tab = 'gestio'; closeSheet(); saveUI(); render(); },
  'cfg-block': el => {
    ui.cfgOpen = ui.cfgOpen || {};
    const open = !cfgOpen(el.dataset.k);
    ui.cfgOpen[el.dataset.k] = open;
    el.setAttribute('aria-expanded', open);
    const panel = el.nextElementSibling;
    if (panel && panel.classList.contains('cfg-p')) panel.hidden = !open;
  },
  'people-role': el => { ui.people = el.dataset.k; saveUI(); render(); },
  'member-edit': el => sheetMember(el.dataset.mid),
  'member-bulk': el => sheetBulk(el.dataset.sec || ui.section),
  'prod-new': () => sheetProduction(null),
  'prod-edit': el => sheetProduction(el.dataset.pid),
  'wipe-demo': () => wipeAll(true),
  'wipe-all': () => wipeAll(false),
  'sheet-close': () => closeSheet(),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const fn = actions[act];
  if (!fn) return;
  e.preventDefault();
  const subAllowed = SUB_OK.has(act) && canMark(sessionById(ui.sessionId), ui.rollSec || ui.section);
  if (EDIT_ONLY.has(act) && !canEdit() && !subAllowed) { toast('Amb aquest enllaç no pots fer aquesta acció'); return; }
  if (ADMIN_ONLY.has(act) && !isAdmin()) { toast('Només l’administració de l’agrupació pot fer-ho'); return; }
  if (PRO_ONLY.has(act) && !canManageGroup()) { toast('Només un Usuari Pro que administri l’agrupació pot canviar-ho'); return; }
  if (CLASS_ONLY.has(act) && !teachesClasses()) { toast(`Només el ${V.Teacher.toLowerCase()} pot fer-ho`); return; }
  fn(el, e);
});

let bindTimer = null;
document.addEventListener('input', e => {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  const kind = el.dataset.bind;
  if (kind === 'find') { filterList(el); return; }
  if (kind === 'cr' && CREATE) { CREATE[el.dataset.f] = el.value; return; }
  if (kind === 'cr-sec' || kind === 'cfg-sec') { const list = secList(kind.slice(0, -4)); if (list && list[+el.dataset.i]) list[+el.dataset.i][el.dataset.f] = el.value; if (kind === 'cfg-sec') markSectionsDirty(); return; }
  if (kind === 'min' || kind === 'note') {
    const mid = el.closest('.row').dataset.mid;
    const cur = sessionById(ui.sessionId); const m = S.members.get(mid);
    if (kind === 'min') {
      const v = Math.max(0, Math.min(240, parseInt(el.value, 10) || 0));
      setMark(cur, m, { s: 'R', min: v || undefined });
      const row = el.closest('.row');
      row.querySelectorAll('.min-chip').forEach(c => c.setAttribute('aria-pressed', +c.dataset.min === v));
      const st = row.querySelector('.state'); st.textContent = v ? `Retard ${v}′` : 'Indica els minuts'; st.classList.toggle('warn', !v);
    } else {
      const s = attDoc(cur.id, m.section)?.marks?.[mid]?.s;
      setMark(cur, m, { s, note: el.value.trim() || undefined });
    }
  } else if (kind === 'cfg-period') {
    clearTimeout(bindTimer);
    bindTimer = setTimeout(() => {
      const v = id => $('#' + id)?.value;
      const { season, terms } = seasonCfg();
      const nextSeason = { name: v('cfg-sname') || season.name, from: v('cfg-sfrom') || season.from, to: v('cfg-sto') || season.to };
      const nextTerms = terms.map((t, i) => ({ name: t.name, from: v(`cfg-t${i}from`) || t.from, to: v(`cfg-t${i}to`) || t.to }));
      saveConfig({ season: nextSeason, terms: nextTerms });
    }, 600);
  } else if (kind === 'cfg-min') {
    clearTimeout(bindTimer);
    bindTimer = setTimeout(() => { const v = parseInt(el.value, 10); if (v > 0 && v <= 100) saveConfig({ minAttendance: v }); }, 500);
  } else if (kind === 'cfg-name' || kind === 'cfg-alert' || kind === 'cfg-short') {
    clearTimeout(bindTimer);
    bindTimer = setTimeout(() => {
      if (kind === 'cfg-name') { if (!canManageGroup() || !el.value.trim()) return; saveConfig({ name: el.value.trim() }); paintBrandName(); syncDirectory(true); }
      else if (kind === 'cfg-short') { if (canManageGroup()) saveConfig({ shortName: el.value.trim().slice(0, 16) }); }
      else { const v = parseInt(el.value, 10); if (v > 0) saveConfig({ alertFNJ: v }); }
    }, 500);
  }
});
document.addEventListener('change', e => {
  const pick = e.target.closest('select[data-pick]');
  if (pick && actions[pick.dataset.pick]) { const v = pick.value; actions[pick.dataset.pick]({ dataset: { id: v, i: v, sec: v, k: v } }); return; }
  const logo = e.target.closest('[data-bind="logo"]');
  if (logo && logo.files && logo.files[0]) { if (canManageGroup()) uploadLogo(logo.files[0]); logo.value = ''; }
  const color = e.target.closest('[data-bind="brand-color"]');
  if (color && canManageGroup()) setBrandColor(color.value);
  const el = e.target.closest('[data-bind="import"]');
  if (el && el.files && el.files[0]) { importJSON(el.files[0]); el.value = ''; }
  if (e.target.closest('[data-bind="cfg-classes"]') && isAdmin()) { saveConfig({ classesOn: e.target.checked }); toast(e.target.checked ? `${V.classes} activades` : `${V.classes} desactivades`); render(); }
  if (e.target.closest('[data-bind="cfg-ics"]') && isAdmin()) { saveConfig({ icsOn: e.target.checked }); toast(e.target.checked ? 'Calendari subscrit activat: funcionarà d’aquí a unes hores' : 'Calendari subscrit desactivat'); render(); }
  if (e.target.closest('[data-bind="min"]')) refreshRow(e.target.closest('.row').dataset.mid);
});
