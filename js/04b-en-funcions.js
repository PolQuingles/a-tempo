// A Tempo · 04b-en-funcions.js — Passar llista quan el cap de corda no fa una producció: el cap de corda (o l'equip) tria
// una persona de la corda que SÍ la fa, que n'és «cap de corda en funcions» mentre dura la producció. Se li fa de substitut a
// totes les sessions (subs/<sessió>_<corda> amb auto: true), i si no hi ha ningú triat, surt a «Per fer».
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Cap de corda en funcions, per producció ---------- */
const actingWord = () => `${V.leader} en funcions`;
/** Qui el pot triar per a totes les cordes (l'administració, la direcció, la gerència i la secretaria); el cap de corda, només per a la seva. */
const rollAll = () => isAdmin() || ['director', 'gerencia', 'secretaria'].some(iHave);
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
  const mine = rollAll() ? null : new Set(mySections());
  const secs = SECTIONS.filter(x => (!mine || mine.has(x.id)) && (p.sessions || []).some(s => convoked(s, x.id)));
  if (!secs.length) { toast(`Només el ${V.leader} de cada ${V.section} o l’equip ho poden triar`); return; }
  const row = x => {
    const leads = rollLeaders(pid, x.id), ms = prodPeople(pid, x.id).sort(byName);
    const hasLead = membersOf(x.id).some(m => m.leader), noLead = !leads.length;
    const def = noLead ? `— ${hasLead ? `El ${V.leader} no la fa` : `No hi ha ${V.leader}: la passa l’equip`}` : `${capz(V.leader)}: ${leads.map(m => m.name).join(' i ')}`;
    return `<label class="field pr-row${hasLead && noLead && !roll[x.id] ? ' warn' : ''}" data-sec="${esc(x.id)}"><span>${esc(x.name)} <small class="muted">· ${ms.length} la fan</small></span>
      <select class="inp" data-sec="${esc(x.id)}"><option value="">${esc(def)}</option>${ms.filter(m => !leads.includes(m)).map(m => `<option value="${esc(m.id)}" ${roll[x.id] === m.id ? 'selected' : ''}>${esc(m.name)}${accountFor(m.id) || !S.staffReady ? '' : ' (encara sense accés)'}</option>`).join('')}</select></label>`;
  };
  openSheet({
    title: `${capz(actingWord())} · ${p.name}`,
    body: `<p style="margin-top:0">Passa llista el ${esc(V.leader)}. Si no fa aquesta producció, tria una persona de la ${esc(V.section)} que <b>sí</b> la fa: en serà <b>${esc(actingWord())}</b> mentre duri la producció i passarà llista a tots els assajos i ${esc(V.sh.els.replace(/^(els|les) /, ''))}, des de l’app i entrant amb el seu correu.</p>
      <div class="kv">${secs.map(row).join('')}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Si només falta un dia, a la llista de la ${esc(V.section)} es pot triar un substitut per a aquell dia.</p>`,
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
        toast(who.length ? `${capz(actingWord())}: ${who.join(' · ')}` : `Passen llista els ${V.leaders}`);
      };
    },
  });
}
/** A «Per fer»: les produccions que comencen aviat i tenen alguna corda sense ningú per passar llista. */
function rollTodos() {
  if (!canEdit()) return [];
  const mine = rollAll() ? null : new Set(mySections());
  const out = [];
  for (const p of productionsSorted()) {
    const ss = rollSessions(p);
    if (!ss.length || ss[0].date > addDays(TODAY, 21)) continue;
    const secs = SECTIONS.filter(x => (!mine || mine.has(x.id)) && ss.some(s => convoked(s, x.id))
      && membersOf(x.id).some(m => m.leader) && !rollLeaders(p.id, x.id).length && !(p.roll || {})[x.id]);
    if (secs.length) out.push({ icon: 'roll', t: `${esc(p.name)}: tria el ${esc(actingWord())}`, s: mine ? `No fas aquesta producció: tria qui passarà llista de la teva ${esc(V.section)}` : `${esc(capz(V.leader))} de ${esc(secs.map(x => x.name.toLowerCase()).join(', '))} no la fa`, btn: 'Tria', act: `data-act="prod-roll" data-pid="${esc(p.id)}"`, n: 1 });
  }
  return out;
}
/** On fa ara de cap de corda en funcions qui ha entrat: «Tenors · Mahler 2». */
const actingNow = () => [...new Set(mySubs().filter(x => x.auto).map(x => `${SEC[x.section]?.name || x.section} · ${S.productions.get(x.prodId)?.name || ''}`))];
