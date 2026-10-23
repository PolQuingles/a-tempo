// A Tempo · 11c-absencia.js — Avisar d'una absència o d'un retard (cadascú, o l'equip per algú).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Sheet: absence notice ---------- */
function memberOptions(selected) {
  return SECTIONS.map(x => `<optgroup label="${x.name}">${membersOf(x.id).map(m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
}
function sheetWhoAmI(then) {
  openSheet({
    title: 'Qui ets?',
    body: `<p style="margin-top:0">Tria el teu nom. Aquest mòbil el recordarà per a la propera vegada.</p>
      <label class="field"><span>Nom</span><select class="inp" id="who-sel"><option value="">—</option>${memberOptions(myMemberId())}</select></label>`,
    foot: `<button class="btn btn-primary" id="who-ok">Desa</button>`,
    onMount: el => {
      el.querySelector('#who-ok').onclick = () => {
        const id = el.querySelector('#who-sel').value;
        if (!id) { toast('Tria el teu nom de la llista'); return; }
        lsSet(LS_ME, id);
        closeSheet(); render();
        if (then) then();
      };
    },
  });
}
function sheetAbsence(presetSid) {
  const singer = !canEdit() || (ui.tab === 'avisos' && !!myId());   // reporting on my own behalf
  let memberId = singer ? myMemberId() : null;
  if (singer && !memberId) { toast('El teu compte no està vinculat a cap fitxa de la plantilla'); return; }
  let kind = 'absent';
  const picked = new Set(presetSid ? [presetSid] : []);
  const sessionsFor = mid => {
    const m = S.members.get(mid);
    return m ? allSessions().filter(s => s.date >= TODAY && convoked(s, m.section)) : [];
  };
  openSheet({
    title: 'Avís d’absència',
    body: `<div class="kv">
      ${singer ? `<p style="margin:0">De part de <b>${esc(S.members.get(memberId).name)}</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Avisa’n amb temps: el teu ${V.leader} ho veurà i, si ho accepta, la falta quedarà justificada.</span></p>`
        : `<label class="field"><span>${V.Member}</span><select class="inp" id="ab-member"><option value="">—</option>${memberOptions('')}</select></label>`}
      <div class="field"><span>Què passa?</span><div class="pickers" id="ab-kind">
        <button type="button" class="pick" data-k="absent" aria-pressed="true">No hi podré anar</button>
        <button type="button" class="pick" data-k="late" aria-pressed="false">Arribaré tard</button></div></div>
      <label class="field" id="ab-min-f" hidden><span>Minuts de retard aproximats</span><input class="inp" id="ab-min" type="number" inputmode="numeric" min="1" max="240" style="width:120px"></label>
      <div class="field"><span>Quins dies?</span><div id="ab-sessions"></div></div>
      <label class="field"><span>Motiu</span><textarea class="inp" id="ab-reason" maxlength="200" style="min-height:80px" placeholder="p. ex. Examen a la universitat"></textarea></label>
    </div>`,
    foot: `<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="ab-send">${singer ? 'Envia l’avís' : 'Desa l’avís'}</button>`,
    onMount: el => {
      const drawSessions = () => {
        const box = el.querySelector('#ab-sessions');
        if (!memberId) { box.innerHTML = '<span class="muted" style="font-size:calc(13px*var(--ts))">Tria primer qui és.</span>'; return; }
        const list = sessionsFor(memberId);
        if (!list.length) { box.innerHTML = '<span class="muted" style="font-size:calc(13px*var(--ts))">No hi ha sessions properes.</span>'; return; }
        let month = '', html = '<ul class="checklist">';
        for (const s of list) {
          const mo = s.date.slice(0, 7);
          if (mo !== month) { month = mo; html += `<li class="mo">${monthYear(s.date)}</li>`; }
          html += `<li><label><input type="checkbox" value="${s.id}" ${picked.has(s.id) ? 'checked' : ''}><span><b>${wdShort(s.date)} ${ddmm(s.date)}</b> · ${esc(s.type)}${s.time ? ` · <span class="mono">${esc(timeRange(s))}</span>` : ''}<br><span class="m">${esc(prodNames(s))}</span></span></label></li>`;
        }
        box.innerHTML = html + '</ul>';
        box.querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? picked.add(i.value) : picked.delete(i.value); });
        const first = box.querySelector('input:checked');
        if (first) setTimeout(() => first.closest('li').scrollIntoView({ block: 'nearest' }), 30);
      };
      drawSessions();
      const sel = el.querySelector('#ab-member');
      if (sel) sel.onchange = () => { memberId = sel.value || null; drawSessions(); };
      el.querySelectorAll('#ab-kind .pick').forEach(b => b.onclick = () => {
        kind = b.dataset.k;
        el.querySelectorAll('#ab-kind .pick').forEach(x => x.setAttribute('aria-pressed', x === b));
        el.querySelector('#ab-min-f').hidden = kind !== 'late';
      });
      el.querySelector('#ab-send').onclick = () => {
        const m = S.members.get(memberId);
        const reason = el.querySelector('#ab-reason').value.trim();
        const ids = [...picked].filter(id => sessionById(id));
        if (!m) { toast('Tria qui no hi podrà anar'); return; }
        if (!ids.length) { toast('Marca almenys un dia'); return; }
        if (singer && !reason) { toast('Explica breument el motiu'); return; }
        const a = { id: uid('a'), uid: S.uid, memberId: m.id, memberName: m.name, section: m.section, sessionIds: ids, kind, reason,
          status: 'pending', createdAt: new Date().toISOString(), by: S.role };
        if (kind === 'late') { const v = parseInt(el.querySelector('#ab-min').value, 10); if (v > 0) a.min = Math.min(240, v); }
        closeSheet();
        if (singer) { saveAbsence(a); toast(`Avís enviat. El teu ${V.leader} el revisarà.`); }
        else { acceptAbsence(a); toast('Avís desat i acceptat'); }
        render();
      };
    },
  });
}
