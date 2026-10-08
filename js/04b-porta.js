// A Tempo · 04b-porta.js — Passar llista quan la plantilla canvia a cada producció i el cap de corda potser no hi és:
//   · Qui passa llista (per producció): per a cada corda, una persona que fa la producció. Se li fa de substitut a totes
//     les sessions (subs/<sessió>_<corda> amb auto: true), i en surt l'avís a «Per fer» si el cap de corda no la fa.
//   · La porta: una sola persona de l'equip, a l'entrada, marca qui arriba de totes les cordes. Amb un lector de targetes
//     (USB o Bluetooth, que escriu el número de la targeta) o amb l'NFC d'un mòbil Android, els cantaires només passen la
//     targeta: no han d'obrir el mòbil.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Qui passa llista, per producció ---------- */
/** Els caps de corda que fan la producció (els que no la fan no hi poden passar llista). */
const rollLeaders = (pid, sec) => membersOf(sec).filter(m => m.leader && !isExcluded(pid, m.id));
/** Qui fa la producció, d'una corda: d'entre aquests es tria qui passa llista. */
const prodPeople = (pid, sec) => membersOf(sec).filter(m => !isExcluded(pid, m.id));
/** Les sessions d'una producció que encara venen (o són d'avui o d'ahir: encara s'hi pot acabar la llista). */
const rollSessions = p => (p.sessions || []).filter(s => s.date >= addDays(TODAY, -1));
/** Posa (o treu) el substitut de cada sessió segons qui passa llista a la producció. Un substitut triat per a un dia
 *  concret (sense auto) mana: no es toca. */
function syncRollSubs(pid) {
  const p = S.productions.get(pid);
  if (!p || !canEdit() || PREVIEW) return 0;
  const roll = p.roll || {};
  let n = 0;
  for (const s of rollSessions(p)) {
    for (const x of SECTIONS) {
      const key = subKey(s.id, x.id), cur = S.subs.get(key);
      const m = roll[x.id] ? S.members.get(roll[x.id]) : null;
      if (m && convoked(s, x.id)) {
        if (cur && !cur.auto) continue;
        const until = parseISO(s.date).getTime() + 36 * 3600 * 1000;   // fins l’endemà al migdia, com els substituts d'un dia
        if (cur && cur.memberId === m.id && cur.until === until) continue;
        const rec = { sessionId: s.id, section: x.id, memberId: m.id, memberName: m.name, date: s.date, until, by: myEmail() || '', at: new Date().toISOString(), auto: true, prodId: p.id };
        S.subs.set(key, rec); persist('subs', key, rec, 30); n++;
      } else if (cur && cur.auto && cur.prodId === p.id) { S.subs.delete(key); persist('subs', key, null, 30); n++; }
    }
  }
  return n;
}
function sheetProdRoll(pid) {
  const p = S.productions.get(pid);
  if (!p || !canEdit()) return;
  ensureStaff();
  const roll = { ...(p.roll || {}) };
  const secs = SECTIONS.filter(x => (p.sessions || []).some(s => convoked(s, x.id)));
  const row = x => {
    const leads = rollLeaders(pid, x.id), ms = prodPeople(pid, x.id).sort(byName);
    const hasLead = membersOf(x.id).some(m => m.leader), noLead = !leads.length;
    const def = noLead ? `— ${hasLead ? `El ${V.leader} no la fa` : `No hi ha ${V.leader}: la passa l’equip`}` : `${capz(V.leader)}: ${leads.map(m => m.name).join(' i ')}`;
    return `<label class="field pr-row${hasLead && noLead && !roll[x.id] ? ' warn' : ''}" data-sec="${esc(x.id)}"><span>${esc(x.name)} <small class="muted">· ${ms.length} la fan</small></span>
      <select class="inp" data-sec="${esc(x.id)}"><option value="">${esc(def)}</option>${ms.filter(m => !leads.includes(m)).map(m => `<option value="${esc(m.id)}" ${roll[x.id] === m.id ? 'selected' : ''}>${esc(m.name)}${accountFor(m.id) || !S.staffReady ? '' : ' (encara sense accés)'}</option>`).join('')}</select></label>`;
  };
  openSheet({
    title: `Qui passa llista · ${p.name}`,
    body: `<p style="margin-top:0">Per a cada ${esc(V.section)}, qui passarà llista a <b>tots els assajos i ${esc(V.sh.els.replace(/^(els|les) /, ''))}</b> d’aquesta producció. Si el ${esc(V.leader)} la fa, ja la passa ell: tria algú només quan no la fa o quan ho ha de fer una altra persona. Ho farà des de l’app, entrant amb el seu correu, i només de la seva ${esc(V.section)}.</p>
      <div class="kv">${secs.map(row).join('')}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Per a un dia concret, a la llista de la ${esc(V.section)} també pots triar un substitut només per a aquell dia. I a la porta, una sola persona pot passar llista de tothom.</p>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pr-save">Desa</button>`,
    onMount: el => {
      el.querySelector('#pr-save').onclick = () => {
        const next = {};
        el.querySelectorAll('select[data-sec]').forEach(s => { if (s.value) next[s.dataset.sec] = s.value; });
        const rec = { ...S.productions.get(pid) };
        if (Object.keys(next).length) rec.roll = next; else delete rec.roll;
        saveProduction(rec);
        syncRollSubs(pid);
        closeSheet(); render();
        const who = Object.entries(next).map(([sec, mid]) => `${SEC[sec]?.short || sec}: ${firstName(S.members.get(mid)?.name || '')}`);
        toast(who.length ? `Passaran llista ${who.join(' · ')}` : 'Passen llista els caps de corda');
      };
    },
  });
}
/** A «Per fer»: les produccions que comencen aviat i tenen alguna corda sense ningú per passar llista. */
function rollTodos() {
  if (!canEdit()) return [];
  const all = isAdmin() || ['director', 'gerencia', 'secretaria'].some(iHave);
  const mine = all ? null : new Set(mySections());
  const out = [];
  for (const p of productionsSorted()) {
    const ss = rollSessions(p);
    if (!ss.length || ss[0].date > addDays(TODAY, 21)) continue;
    const secs = SECTIONS.filter(x => (!mine || mine.has(x.id)) && ss.some(s => convoked(s, x.id))
      && membersOf(x.id).some(m => m.leader) && !rollLeaders(p.id, x.id).length && !(p.roll || {})[x.id]);
    if (secs.length) out.push({ icon: 'roll', t: `${esc(p.name)}: tria qui passa llista`, s: `${esc(capz(V.leader))} de ${esc(secs.map(x => x.name.toLowerCase()).join(', '))} no la fa`, btn: 'Tria', act: `data-act="prod-roll" data-pid="${esc(p.id)}"`, n: 1 });
  }
  return out;
}

/* ---------- La porta ---------- */
// Fins a uns minuts després de l'hora, qui arriba a la porta compta com a puntual (hi pot haver cua per entrar).
const DOOR_GRACE = 5;
const DOOR = { nfc: null, last: '', lastAt: 0 };
const cardCode = v => String(v || '').replace(/[\s:-]/g, '').toUpperCase();
/** Sembla el número d'una targeta (el que escriu un lector) i no pas un nom. */
const looksLikeCard = v => /^[0-9A-F]{6,}$/.test(cardCode(v)) && !/\s/.test(String(v).trim());
const doorSession = () => { const list = allSessions(); return (ui.sessionId && list.find(s => s.id === ui.sessionId)) || defaultSession(list); };
/** Qui ha de venir: de totes les cordes convocades, qui fa la producció i no és de baixa. */
const doorPeople = s => SECTIONS.filter(x => convoked(s, x.id)).flatMap(x => membersOf(x.id)).filter(m => !isOut(s, m));
const doorHere = (s, m) => ['P', 'R'].includes(effMark(s, m)?.s || '');
/** Ha avisat que no vindrà (o ja té una falta posada). */
const doorAway = (s, m) => ['FJ', 'FNJ'].includes(effMark(s, m)?.s || '') || absencesFor(s.id, m.id).some(a => a.kind !== 'late');
function viewDoor() {
  const list = allSessions();
  const cur = doorSession();
  if (!cur) { ui.door = false; return viewRollBody(); }
  ui.sessionId = cur.id;
  const people = doorPeople(cur).sort(byName);
  const here = people.filter(m => doorHere(cur, m));
  const away = people.filter(m => !doorHere(cur, m) && doorAway(cur, m));
  const waiting = people.filter(m => !here.includes(m) && !away.includes(m));
  const late = lateNow(cur);
  const sec = m => `${esc(SEC[m.section]?.name || '')}${m.part ? ` · ${esc(partTag(m))}` : ''}`;
  const lateTag = m => absencesFor(cur.id, m.id).some(a => a.kind === 'late') ? ' · <b>arribarà tard</b>' : '';
  const row = (m, act, right) => `<li data-find="${esc(normText(m.name))}"><button class="door-row" data-act="${act}" data-mid="${esc(m.id)}">${avatar(m)}<span class="dr-n"><b>${esc(m.name)}</b><small>${sec(m)}${act === 'door-in' ? lateTag(m) : ''}</small></span>${right(m)}</button></li>`;
  const markTxt = m => { const mk = effMark(cur, m); return mk?.s === 'R' ? `Retard${mk.min ? ` ${mk.min}′` : ''}` : mk?.t ? esc(mk.t) : 'Hi és'; };
  const awayTxt = m => { const mk = effMark(cur, m); return mk ? STATUS[mk.s]?.short || '' : 'Ha avisat'; };
  const nfc = 'NDEFReader' in window;
  return `<div class="ctx" id="ctx">${sessionNav(cur, list, true)}</div>
    <div class="door-head">
      <button class="btn btn-sm btn-ghost" data-act="door-close">${ICON.left.replace('<svg', '<svg class="ic-sm" aria-hidden="true"')} Surt de la porta</button>
      <span class="door-count" aria-live="polite"><b>${here.length}</b> de ${here.length + waiting.length} ja hi són${away.length ? ` · ${away.length} han avisat` : ''}</span>
    </div>
    <p class="door-hint">${cur.date !== TODAY ? 'Aquesta sessió no és d’avui: marcar-hi algú no compta l’hora d’arribada.'
      : late > DOOR_GRACE ? `Ja han passat ${late} minuts de l’hora: qui arribi ara comptarà com a retard.`
      : `Toca el nom de qui arriba o passa la seva targeta. Fins a ${DOOR_GRACE} minuts després de l’hora compta com a puntual.`}</p>
    <div class="door-tools">
      <label class="find door-find">${SEARCH_ICON}<input class="inp" id="door-q" type="search" inputmode="search" autocomplete="off" enterkeyhint="go" placeholder="Cerca un nom o passa la targeta" data-bind="door-q" data-target="#door-wait"></label>
      ${nfc ? `<button class="btn btn-sm${DOOR.nfc ? ' btn-primary' : ''}" data-act="door-nfc" aria-pressed="${!!DOOR.nfc}">${DOOR.nfc ? 'NFC actiu' : 'Llegeix targetes NFC'}</button>` : ''}
    </div>
    <div id="door-wait"><div class="section-title"><h2 class="h2">Falten</h2><span class="mono muted">${waiting.length}</span></div>
      ${waiting.length ? `<ul class="list door-list">${waiting.map(m => row(m, 'door-in', () => '<span class="door-go">Ha arribat</span>')).join('')}</ul>` : '<div class="panel" style="padding:14px">Ja hi són tots.</div>'}
      <div class="panel find-empty" hidden>Ningú amb aquest nom entre els que falten.</div></div>
    ${away.length ? `<details class="np-group door-grp"><summary><span>Han avisat que no vindran (${away.length})</span>${ICON.chev}</summary>
      <ul class="list door-list">${away.map(m => row(m, 'door-in', m2 => `<span class="door-st">${awayTxt(m2)}</span>`)).join('')}</ul></details>` : ''}
    ${here.length ? `<details class="np-group door-grp"><summary><span>Ja hi són (${here.length})</span>${ICON.chev}</summary>
      <ul class="list door-list">${here.slice().reverse().map(m => row(m, 'door-undo', m2 => `<span class="door-st ok">${markTxt(m2)}</span>`)).join('')}</ul></details>` : ''}
    ${waiting.length && cur.date <= TODAY ? `<button class="btn" data-act="door-rest" style="display:flex;margin:18px auto 0">Els que falten: falta</button>` : ''}`;
}
/** Ha arribat: present, o retard si ja fa més de DOOR_GRACE minuts de l'hora (amb els minuts). */
function doorArrive(mid) {
  const cur = doorSession(), m = S.members.get(mid);
  if (!cur || !m || !canEdit()) return;
  const prev = attDoc(cur.id, m.section)?.marks?.[m.id] || null;
  const late = cur.date === TODAY ? lateNow(cur) : 0;
  const t = cur.date === TODAY ? nowHHMM() : '';
  setMark(cur, m, late > DOOR_GRACE ? { s: 'R', min: late, ...(t ? { t } : {}) } : { s: 'P', ...(t ? { t } : {}) });
  buzz(14);
  doorAfter();
  toast(`${firstName(m.name)}: ${late > DOOR_GRACE ? `retard de ${late}′` : 'ha arribat'}`, { label: 'Desfés', run: () => { setMark(cur, m, null); if (prev) setMark(cur, m, prev); doorAfter(); } });
}
function doorUndo(mid) {
  const cur = doorSession(), m = S.members.get(mid);
  if (!cur || !m || !canEdit()) return;
  const prev = attDoc(cur.id, m.section)?.marks?.[m.id] || null;
  setMark(cur, m, null);
  doorAfter();
  toast(`${firstName(m.name)}: ja no hi és`, { label: 'Desfés', run: () => { if (prev) setMark(cur, m, prev); doorAfter(); } });
}
/** Després de marcar: es torna a pintar i el cercador queda buit i a punt per a la targeta següent. */
function doorAfter() {
  render();
  const q = $('#door-q');
  if (q) { q.value = ''; q.focus({ preventScroll: true }); }
}
/** El que ha arribat al cercador en prémer Retorn: una targeta (el lector escriu el número i Retorn) o un nom. */
function doorEnter(value) {
  const v = String(value || '').trim();
  if (!v) return;
  const cur = doorSession();
  if (!cur) return;
  const code = cardCode(v);
  const owner = membersOf(null).find(m => m.card && cardCode(m.card) === code);
  if (owner) return doorCardOwner(cur, owner);
  if (looksLikeCard(v)) return sheetDoorCard(code);
  const q = normText(v);
  const hits = doorPeople(cur).filter(m => !doorHere(cur, m) && normText(m.name).includes(q));
  if (hits.length === 1) doorArrive(hits[0].id);
  else toast(hits.length ? `Hi ha ${hits.length} persones amb aquest nom: toca la bona` : 'Ningú amb aquest nom entre els que falten');
}
function doorCardOwner(cur, m) {
  if (!doorPeople(cur).some(x => x.id === m.id)) { toast(`${firstName(m.name)} no està convocat avui`); doorAfter(); return; }
  if (doorHere(cur, m)) { toast(`${firstName(m.name)} ja hi és`); doorAfter(); return; }
  doorArrive(m.id);
}
/** Una targeta que encara no és de ningú: es diu de qui és (un sol cop) i ja compta. */
function sheetDoorCard(code) {
  const cur = doorSession();
  const people = cur ? doorPeople(cur).filter(m => !doorHere(cur, m)).sort(byName) : [];
  const rest = membersOf(null).filter(m => !people.includes(m)).sort(byName);
  openSheet({
    title: 'Targeta nova',
    body: `<p style="margin-top:0">Aquesta targeta (<span class="mono">${esc(code)}</span>) encara no és de ningú. De qui és? A partir d’ara, quan la passi, ja comptarà que ha arribat.</p>
      <label class="field"><span>És de</span><select class="inp" id="dc-who"><option value="">—</option>
        ${people.length ? `<optgroup label="Falten avui">${people.map(m => `<option value="${esc(m.id)}">${esc(m.name)}${m.card ? ' (ja en té una)' : ''}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="${esc(capz(V.tot))}">${rest.map(m => `<option value="${esc(m.id)}">${esc(m.name)}${m.card ? ' (ja en té una)' : ''}</option>`).join('')}</optgroup></select></label>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="dc-ok">Desa la targeta</button>`,
    onMount: el => {
      el.querySelector('#dc-ok').onclick = () => {
        const m = S.members.get(el.querySelector('#dc-who').value);
        if (!m) { toast('Tria de qui és'); return; }
        // Una targeta només és d'una persona: si era d'una altra (la seva targeta d'abans), se li treu.
        for (const o of membersOf(null, true)) if (o.id !== m.id && o.card && cardCode(o.card) === code) saveMember({ ...o, card: '' });
        saveMember({ ...m, card: code });
        closeSheet();
        // (es compara per id: en desar la targeta, la fitxa ja és una altra)
        if (cur && doorPeople(cur).some(x => x.id === m.id) && !doorHere(cur, m)) doorArrive(m.id);
        else { toast(`Targeta desada: és de ${firstName(m.name)}`); doorAfter(); }
      };
    },
  });
}
/** L'NFC del mòbil (Chrome per a Android): cada targeta que s'hi acosta és com si el lector n'hagués escrit el número. */
async function doorNfc() {
  if (DOOR.nfc) { DOOR.nfc.abort(); DOOR.nfc = null; render(); toast('NFC aturat'); return; }
  const Reader = /** @type {any} */ (window).NDEFReader;
  if (!Reader) { toast('Aquest mòbil no pot llegir targetes NFC'); return; }
  try {
    const ctl = new AbortController(), r = new Reader();
    await r.scan({ signal: ctl.signal });
    r.onreading = e => {
      const code = cardCode(e.serialNumber || '');
      // La mateixa targeta dues vegades seguides (en un segon) és un sol toc.
      if (!code || (DOOR.last === code && Date.now() - (DOOR.lastAt || 0) < 1500)) return;
      DOOR.last = code; DOOR.lastAt = Date.now();
      doorEnter(code);
    };
    r.onreadingerror = () => toast('No s’ha pogut llegir la targeta: torna-hi');
    DOOR.nfc = ctl; render(); toast('Acosta les targetes al mòbil');
  } catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Cal deixar que l’app faci servir l’NFC' : 'No s’ha pogut engegar l’NFC'); }
}
/** En acabar: qui encara falta (i no ha avisat que arribarà tard) queda amb falta no justificada. */
async function doorRest() {
  const cur = doorSession();
  if (!cur || !canEdit()) return;
  const left = doorPeople(cur).filter(m => !doorHere(cur, m) && !doorAway(cur, m) && !absencesFor(cur.id, m.id).some(a => a.kind === 'late'));
  if (!left.length) { toast('No falta ningú per marcar'); return; }
  if (!await confirmSheet('Els que falten: falta?', `${left.length === 1 ? `${esc(left[0].name)} quedarà` : `Els ${left.length} que falten quedaran`} amb falta no justificada. Els que han avisat no es toquen, i tot es pot canviar després a la llista de cada ${esc(V.section)}.`, 'Marca-ho', false)) { render(); return; }
  const prev = left.map(m => [m, attDoc(cur.id, m.section)?.marks?.[m.id] || null]);
  for (const m of left) setMark(cur, m, { s: 'FNJ' });
  render();
  toast(`${left.length} amb falta`, { label: 'Desfés', run: () => { for (const [m, p] of prev) { setMark(cur, m, null); if (p) setMark(cur, m, p); } render(); } });
}
