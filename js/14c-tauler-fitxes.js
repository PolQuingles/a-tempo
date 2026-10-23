// A Tempo · 14c-tauler-fitxes.js — Les fitxes del tauler (anuncis, materials, enquestes, documents) i els recordatoris a qui no ha respost.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Board sheets ---------- */
const sectionPickers = (id, chosen) => `<div class="pickers" id="${id}">${SECTIONS.map(x => secPick(x, (chosen || []).includes(x.id))).join('')}</div>`;
const bindToggles = (el, sel) => el.querySelectorAll(`${sel} .pick`).forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
const readSections = (el, sel) => { const v = $$(`${sel} .pick[aria-pressed="true"]`, el).map(b => b.dataset.sec); return v.length && v.length < SECTIONS.length ? v : []; };
const authorName = () => S.me?.name || S.me?.email || 'Equip';

function sheetAnnouncement(id) {
  const ex = id ? S.announcements.get(id) : null;
  const a = ex ? clone(ex) : { id: uid('n'), title: '', body: '', pinned: false, sections: [], until: '', files: [] };
  a.files = a.files || [];
  const picked = [];   // fitxers triats que encara no s'han pujat: { tmp, file }
  const paintFiles = el => {
    el.querySelector('#an-files').innerHTML = [...a.files.map(f => `<li><span>${f.file ? ICON.clip : ICON.link}${esc(f.title || f.file?.name || f.url)}<small>${f.file ? `${esc(fileKind(f.file))} · ${fmtSize(f.file.size)}` : esc(f.url)}</small></span><button type="button" class="icon-btn" data-rm-f="${esc(f.id)}" aria-label="Treu-lo">${ICON.close}</button></li>`),
      ...picked.map(p => `<li><span>${ICON.clip}${esc(p.file.name)}<small>${esc(fileKind(p.file))} · ${fmtSize(p.file.size)} · es pujarà en desar</small></span><button type="button" class="icon-btn" data-rm-p="${esc(p.tmp)}" aria-label="Treu-lo">${ICON.close}</button></li>`)].join('');
    el.querySelectorAll('[data-rm-f]').forEach(b => b.onclick = () => { a.files = a.files.filter(f => f.id !== b.dataset.rmF); paintFiles(el); });
    el.querySelectorAll('[data-rm-p]').forEach(b => b.onclick = () => { picked.splice(picked.findIndex(p => p.tmp === b.dataset.rmP), 1); paintFiles(el); });
  };
  openSheet({
    title: ex ? 'Edita l’anunci' : 'Nou anunci',
    wide: true,
    body: `<div class="kv">
      <label class="field"><span>Títol</span><input class="inp" id="an-title" maxlength="90" value="${esc(a.title)}" placeholder="p. ex. Informacions de la setmana"></label>
      <label class="field"><span>Text</span><textarea class="inp" id="an-body" maxlength="12000" style="min-height:220px" placeholder="Pots escriure-hi tant com vulguis, com un correu.">${esc(a.body)}</textarea>
        <small>Format: una línia en blanc separa paràgrafs · les línies que comencen amb «-» fan una llista · una línia en MAJÚSCULES és un títol · **així** surt en negreta · els enllaços es poden clicar.</small></label>
      <div class="field"><span>Adjunts</span><ul class="att-edit" id="an-files"></ul>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn btn-sm" for="an-file">Adjunta fitxers</label><input id="an-file" type="file" multiple class="sr"><button type="button" class="btn btn-sm" id="an-link">Afegeix un enllaç</button></div>
        <div id="an-link-f" hidden style="display:grid;gap:6px;margin-top:8px"><input class="inp" id="an-link-url" type="url" placeholder="https://…"><input class="inp" id="an-link-t" maxlength="80" placeholder="Com es diu (p. ex. Formulari del cap de setmana)"><button type="button" class="btn btn-sm" id="an-link-ok" style="justify-self:start">Afegeix-lo</button></div>
        <small>PDF, àudios, imatges… fins a 20 MB cadascun. Els veuen tots els qui veuen l’anunci.</small></div>
      <div class="field"><span>Per a (si no en tries cap, per a tothom)</span>${sectionPickers('an-secs', a.sections)}</div>
      <label class="field"><span>Visible fins al (opcional)</span><input class="inp" id="an-until" type="date" value="${esc(a.until || '')}"></label>
      <div class="toggle-row"><span><b>Fixat a dalt</b></span><label class="switch"><input type="checkbox" id="an-pin" ${a.pinned ? 'checked' : ''}><span></span></label></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="an-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="an-save">${ex ? 'Desa' : 'Publica'}</button>`,
    onMount: el => {
      bindToggles(el, '#an-secs');
      paintFiles(el);
      el.querySelector('#an-file').onchange = e => {
        let room = fileQuotaMB() * 1048576 - groupFileBytes() - picked.reduce((n, p) => n + p.file.size, 0);
        for (const f of e.target.files || []) {
          if (f.size > FILE_MAX) { toast(`${f.name} passa de 20 MB`); continue; }
          if (f.size > room) { toast(`No hi cap ${f.name}: l’espai per a fitxers és ple`); continue; }
          room -= f.size; picked.push({ tmp: uid('t'), file: f });
        }
        e.target.value = ''; paintFiles(el);
      };
      el.querySelector('#an-link').onclick = () => { el.querySelector('#an-link-f').hidden = false; el.querySelector('#an-link-url').focus(); };
      el.querySelector('#an-link-ok').onclick = () => {
        const url = el.querySelector('#an-link-url').value.trim();
        if (!/^https?:\/\//i.test(url)) { toast('L’enllaç ha de començar per https://'); return; }
        a.files.push({ id: uid('fl'), url, title: el.querySelector('#an-link-t').value.trim() });
        el.querySelector('#an-link-url').value = ''; el.querySelector('#an-link-t').value = ''; el.querySelector('#an-link-f').hidden = true;
        paintFiles(el);
      };
      el.querySelector('#an-save').onclick = async e => {
        const title = el.querySelector('#an-title').value.trim();
        if (!title) { toast('Posa un títol a l’anunci'); return; }
        const btn = e.currentTarget;
        if (picked.length && !navigator.onLine) { toast('Cal connexió per pujar els fitxers'); return; }
        btn.disabled = true;
        try {
          for (const [i, p] of picked.entries()) {
            btn.textContent = `Pujant ${i + 1} de ${picked.length}…`;
            a.files.push({ id: uid('fl'), title: titleFromFile(p.file.name), file: await uploadFile(p.file) });
          }
        } catch { btn.disabled = false; btn.textContent = ex ? 'Desa' : 'Publica'; toast('No s’ha pogut pujar un fitxer. Torna-ho a provar.'); return; }
        const kept = new Set(a.files.map(f => f.id));
        for (const f of ex?.files || []) if (f.file && !kept.has(f.id)) deleteFile(f.file);
        const rec = { ...a, title, body: el.querySelector('#an-body').value.trim(), sections: readSections(el, '#an-secs'), until: el.querySelector('#an-until').value, pinned: el.querySelector('#an-pin').checked,
          author: ex?.author || authorName(), by: ex?.by || S.email || '', createdAt: ex?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (!rec.files.length) delete rec.files;
        S.announcements.set(rec.id, rec); persist('announcements', rec.id, rec, 10);
        closeSheet(); toast(ex ? 'Anunci desat' : 'Anunci publicat'); render();
      };
      el.querySelector('#an-del')?.addEventListener('click', async () => {
        const before = clone(ex);
        S.announcements.delete(a.id); persist('announcements', a.id, null, 10); closeSheet(); render();
        undoable('Anunci esborrat', () => { S.announcements.set(before.id, before); persist('announcements', before.id, before, 10); },
          () => { for (const f of before.files || []) if (f.file) deleteFile(f.file); });
      });
    },
  });
}

function sheetMaterial(pid, id) {
  const prods = productionsSorted();
  const prodId = pid || ui.matProd || currentProductionId();
  const ex = id ? (S.productions.get(prodId)?.materials || []).find(x => x.id === id) : null;
  const m = ex ? { ...ex } : { id: uid('mt'), title: '', url: '', kind: 'partitura', section: '', part: '' };
  openSheet({
    title: ex ? 'Edita el material' : 'Nou material',
    body: `<div class="kv">
      <label class="field"><span>Producció</span><select class="inp" id="mt-prod" ${ex ? 'disabled' : ''}>${prods.map(p => `<option value="${p.id}" ${p.id === prodId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      ${sourceFields('mt', m, !ex)}
      <label class="field" id="mt-title-f"><span>Títol</span><input class="inp" id="mt-title" maxlength="90" value="${esc(m.title)}" placeholder="p. ex. O Fortuna – partitura"></label>
      <div class="field"><span>Tipus</span><div class="pickers" id="mt-kind">${Object.entries(MAT_KINDS).map(([k, l]) => `<button type="button" class="pick" data-k="${k}" aria-pressed="${m.kind === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Per a</span><div class="pickers" id="mt-sec"><button type="button" class="pick" data-sec="" aria-pressed="${!m.section}">${capz(V.tot)}</button>${SECTIONS.map(x => `<button type="button" class="pick" data-sec="${esc(x.id)}" aria-pressed="${m.section === x.id}" title="${esc(x.name)}"><span class="vl">${esc(x.short)}</span></button>`).join('')}</div></div>
      <div class="field"><span>${V.Part} (opcional)</span><div class="pickers" id="mt-part"><button type="button" class="pick" data-part="" aria-pressed="${!m.part}">Totes</button>${['1', '2'].map(v => `<button type="button" class="pick" data-part="${v}" aria-pressed="${m.part === v}">${v}</button>`).join('')}</div></div>
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="mt-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="mt-save">Desa</button>`,
    onMount: el => {
      const single = sel => el.querySelectorAll(`${sel} .pick`).forEach(b => b.onclick = () => el.querySelectorAll(`${sel} .pick`).forEach(x => x.setAttribute('aria-pressed', x === b)));
      single('#mt-kind'); single('#mt-sec'); single('#mt-part');
      const title = el.querySelector('#mt-title');
      const src = bindSource(el, 'mt', (f, all) => {
        // Diversos fitxers de cop (p. ex. els àudios de cada número): un material per fitxer, amb el títol i el tipus de cadascun.
        el.querySelector('#mt-title-f').hidden = all && all.length > 1;
        if (all && all.length > 1) return;
        if (!title.value.trim()) title.value = titleFromFile(f.name);
        const guess = matKindOf(f);
        if (guess !== 'altres') el.querySelectorAll('#mt-kind .pick').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.k === guess)));
      });
      const saveTo = (p, list) => { const next = { ...p, materials: list }; saveProduction(next); };
      el.querySelector('#mt-save').onclick = async e => {
        const all = src.mode() === 'file' ? src.pickedAll() : [];
        if (all.length > 1) {
          const btn = e.currentTarget, p0 = S.productions.get(el.querySelector('#mt-prod').value);
          if (!navigator.onLine) { toast('Cal connexió per pujar els fitxers'); return; }
          btn.disabled = true;
          const add = [];
          try {
            for (const [i, f] of all.entries()) {
              btn.textContent = `Pujant ${i + 1} de ${all.length}…`;
              add.push({ id: uid('mt'), title: titleFromFile(f.name), url: '', kind: matKindOf(f), file: await uploadFile(f),
                section: el.querySelector('#mt-sec .pick[aria-pressed="true"]').dataset.sec, part: el.querySelector('#mt-part .pick[aria-pressed="true"]').dataset.part,
                at: new Date().toISOString(), by: S.me?.email || '' });
            }
          } catch { btn.disabled = false; btn.textContent = 'Desa'; toast('No s’ha pogut pujar un fitxer. Torna-ho a provar.'); return; }
          const p = S.productions.get(p0.id);
          saveTo(p, [...(p.materials || []), ...add]);
          ui.matProd = p.id; closeSheet(); toast(`${add.length} materials pujats`); render();
          return;
        }
        if (!title.value.trim() && !src.picked()) { toast('Posa un títol'); return; }
        const got = await resolveSource(src, m, e.currentTarget);
        if (!got) return;
        const rec = { id: m.id, title: title.value.trim() || titleFromFile(got.file?.name || ''), url: got.url, kind: el.querySelector('#mt-kind .pick[aria-pressed="true"]').dataset.k,
          section: el.querySelector('#mt-sec .pick[aria-pressed="true"]').dataset.sec, part: el.querySelector('#mt-part .pick[aria-pressed="true"]').dataset.part,
          at: m.at || new Date().toISOString(), by: m.by || S.me?.email || '' };
        if (got.file) rec.file = got.file;
        if (m.file && m.file.id !== got.file?.id) deleteFile(m.file);
        const p = S.productions.get(el.querySelector('#mt-prod').value);
        saveTo(p, [...(p.materials || []).filter(x => x.id !== rec.id), rec]);
        ui.matProd = p.id; closeSheet(); toast(got.file && got.file !== m.file ? 'Fitxer pujat i desat' : 'Material desat'); render();
      };
      el.querySelector('#mt-del')?.addEventListener('click', async () => {
        const p = S.productions.get(prodId), before = p.materials || [];
        saveTo(p, before.filter(x => x.id !== m.id)); closeSheet(); render();
        undoable('Material esborrat', () => saveTo(S.productions.get(prodId), before), () => deleteFile(m.file));
      });
    },
  });
}

function sheetPoll(id) {
  const ex = id ? S.polls.get(id) : null;
  const p = ex ? { ...ex } : { id: uid('q'), title: '', description: '', options: [], multi: true, sections: [], closesAt: '', closed: false };
  openSheet({
    title: ex ? 'Edita l’enquesta' : 'Nova enquesta',
    body: `<div class="kv">
      <label class="field"><span>Pregunta</span><input class="inp" id="pl-title" maxlength="120" value="${esc(p.title)}" placeholder="p. ex. Quin dissabte podeu fer assaig extra?"></label>
      <label class="field"><span>Explicació (opcional)</span><textarea class="inp" id="pl-desc" maxlength="600" style="min-height:70px">${esc(p.description || '')}</textarea></label>
      <label class="field"><span>Opcions, una per línia</span><textarea class="inp" id="pl-opts" placeholder="Dissabte 7 de novembre, 10–14 h&#10;Dissabte 14 de novembre, 10–14 h&#10;Diumenge 15 de novembre, 17–20 h">${esc((p.options || []).map(o => o.label).join('\n'))}</textarea>
        ${ex ? '<small>Si canvies el text d’una opció, es mantenen els vots de les que no hagis tocat.</small>' : ''}</label>
      <div class="toggle-row"><span><b>Es poden triar diverses opcions</b></span><label class="switch"><input type="checkbox" id="pl-multi" ${p.multi ? 'checked' : ''}><span></span></label></div>
      <div class="toggle-row"><span><b>Deixa escriure un comentari</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Per a dubtes, casos especials o què es prepara (p. ex. per a una audició)</span></span><label class="switch"><input type="checkbox" id="pl-note" ${p.allowNote ? 'checked' : ''}><span></span></label></div>
      <div class="field"><span>Per a (si no en tries cap, per a tothom)</span>${sectionPickers('pl-secs', p.sections)}</div>
      <label class="field"><span>Respondre fins al (opcional)</span><input class="inp" id="pl-close" type="date" value="${esc(p.closesAt || '')}"></label>
      ${ex ? `<div class="toggle-row"><span><b>Tancada</b><br><span class="muted" style="font-size:calc(13px*var(--ts))">Ja no s’hi pot respondre</span></span><label class="switch"><input type="checkbox" id="pl-closed" ${p.closed ? 'checked' : ''}><span></span></label></div>` : ''}
    </div>`,
    foot: `${ex ? '<button class="btn btn-danger-ghost" id="pl-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pl-save">${ex ? 'Desa' : 'Publica'}</button>`,
    onMount: el => {
      bindToggles(el, '#pl-secs');
      el.querySelector('#pl-save').onclick = () => {
        const title = el.querySelector('#pl-title').value.trim();
        const labels = el.querySelector('#pl-opts').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        if (!title) { toast('Escriu la pregunta'); return; }
        if (labels.length < 2) { toast('Hi ha d’haver almenys dues opcions'); return; }
        const old = new Map((p.options || []).map(o => [o.label, o.id]));
        const options = labels.map(l => ({ id: old.get(l) || uid('o'), label: l }));
        const rec = { ...p, title, description: el.querySelector('#pl-desc').value.trim(), options, multi: el.querySelector('#pl-multi').checked, allowNote: el.querySelector('#pl-note').checked,
          sections: readSections(el, '#pl-secs'), closesAt: el.querySelector('#pl-close').value, closed: ex ? el.querySelector('#pl-closed').checked : false,
          author: ex?.author || authorName(), createdAt: ex?.createdAt || new Date().toISOString() };
        S.polls.set(rec.id, rec); persist('polls', rec.id, rec, 10);
        closeSheet(); toast(ex ? 'Enquesta desada' : 'Enquesta publicada'); render();
      };
      el.querySelector('#pl-del')?.addEventListener('click', async () => {
        const before = clone(p), votes = [...S.pollVotes].filter(([, v]) => v.pollId === p.id).map(([k, v]) => [k, clone(v)]);
        S.polls.delete(p.id); persist('polls', p.id, null, 10);
        for (const [k] of votes) { S.pollVotes.delete(k); persist('pollVotes', k, null, 30); }
        closeSheet(); render();
        undoable('Enquesta esborrada', () => { S.polls.set(before.id, before); persist('polls', before.id, before, 10); for (const [k, v] of votes) { S.pollVotes.set(k, v); persist('pollVotes', k, v, 30); } });
      });
    },
  });
}
function votePoll(id) {
  const p = S.polls.get(id), box = $(`[data-poll="${id}"]`);
  if (!p || !box) return;
  const choices = $$('input:checked', box).map(i => i.value);
  if (!choices.length) { toast('Tria almenys una opció'); return; }
  const m = S.members.get(myMemberId());
  const key = `${id}_${m.id}`;
  const note = box.querySelector('[data-poll-note]')?.value.trim().slice(0, 300) || '';
  const rec = { pollId: id, memberId: m.id, section: m.section, choices, ...(note ? { note } : {}), at: new Date().toISOString(), uid: S.uid };
  S.pollVotes.set(key, rec); persist('pollVotes', key, rec, 10);
  toast('Resposta desada'); render();
}
function sheetPollResults(id) {
  const p = S.polls.get(id);
  if (!p) return;
  const label = Object.fromEntries((p.options || []).map(o => [o.id, o.label]));
  const block = x => {
    const ms = membersOf(x.id);
    const rows = ms.map(m => { const v = S.pollVotes.get(`${id}_${m.id}`); return `<li><span>${esc(m.name)}${v ? `<br><span class="m">${v.choices.map(c => esc(label[c] || '—')).join(' · ')}</span>${v.note ? `<br><span class="m">«${esc(v.note)}»</span>` : ''}` : ''}</span><span class="rsvp ${v ? 'yes' : 'none'}">${v ? 'Ha respost' : '—'}</span></li>`; }).join('');
    return `<div class="eyebrow" style="margin:14px 0 4px">${x.name}</div><ul class="mini-list" style="max-height:none">${rows}</ul>`;
  };
  openSheet({ title: p.title, body: SECTIONS.filter(x => !p.sections?.length || p.sections.includes(x.id)).map(block).join('') });
}

/* ---------- Recordatoris a qui encara no ha respost ---------- */
// «Recorda-ho» envia un avís al mòbil només a qui falta (nudges/<id>, que avisos.py reparteix en pocs minuts) i, a més, a
// l'app ja els surt a «Per fer». Per a qui encara no té l'app hi ha, plegat a sota, el missatge per enviar a mà.
// nudges/<id> = { id, kind: poll | rsvp | trip, ref, title, memberIds, by, byName, createdAt }.
async function sendNudge(kind, ref, title, members) {
  const rec = { id: uid('nd'), kind, ref, title, memberIds: members.map(m => m.id), by: S.email || '', byName: fullName(S.me?.name || S.email || ''), createdAt: new Date().toISOString() };
  await db.doc(`nudges/${rec.id}`).set(rec);
  return rec;
}
function sheetReminder(title, pending, messageFor, nudge) {
  ensureStaff();
  const bySec = SECTIONS.map(x => [x, pending.filter(m => m.section === x.id)]).filter(([, l]) => l.length);
  const first = m => firstName(m.name);
  const phone = m => (m.phone || '').replace(/[^0-9]/g, '').replace(/^(\d{9})$/, '34$1');
  const group = `${title}\n\nFalten per respondre:\n${bySec.map(([x, l]) => `${x.name}: ${l.map(first).join(', ')}`).join('\n')}\n\nPodeu respondre a l’app: ${appUrl()}`;
  openSheet({
    title: 'Recordatori',
    body: pending.length ? `<p style="margin-top:0"><b>${pending.length} ${pending.length === 1 ? 'persona encara no ha' : 'persones encara no han'} respost.</b> Envia’ls una notificació: els arriba en pocs minuts (a qui té les notificacions activades) i a l’app ja ho tenen a «Per fer».</p>
      <div class="remind-who">${bySec.map(([x, l]) => `<p><b>${esc(x.name)}:</b> ${esc(l.map(first).join(', '))}</p>`).join('')}</div>
      <details class="np-group" style="margin-top:12px"><summary><span>Altres maneres (per a qui encara no té l’app)</span>${ICON.chev}</summary>
      ${bySec.map(([x, l]) => `<div class="eyebrow" style="margin:14px 0 4px">${x.name}</div><ul class="mini-list remind-list" style="max-height:none">${l.map(m => {
        const msg = messageFor(m);
        return `<li><span>${esc(m.name)}${S.staffReady && !accountFor(m.id) ? '<br><span class="m">Encara no té accés a l’app</span>' : ''}</span>
          <span style="display:flex;gap:4px">${phone(m) ? `<a class="btn btn-sm" href="https://wa.me/${phone(m)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="btn btn-sm" data-copy="${esc(msg)}">Copia</button></span></li>`;
      }).join('')}</ul>`).join('')}
      <button class="btn btn-sm" id="rm-group" style="margin-top:10px">Copia el missatge per al grup</button></details>`
      : '<p style="margin:0">Tothom ha respost.</p>',
    foot: pending.length && nudge ? `<span class="spacer"></span><button class="btn" data-act="sheet-close">Tanca</button><button class="btn btn-primary" id="rm-push">Envia’ls un avís</button>` : '',
    onMount: el => {
      el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyText(b.dataset.copy, 'Missatge copiat'));
      el.querySelector('#rm-group')?.addEventListener('click', () => copyText(group, 'Missatge per al grup copiat'));
      el.querySelector('#rm-push')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { await sendNudge(nudge.kind, nudge.ref, nudge.title, pending); closeSheet(); toast(`Avís enviat a ${pending.length} ${pending.length === 1 ? 'persona' : 'persones'}`); }
        catch { btn.disabled = false; toast('No s’ha pogut enviar. Comprova la connexió.'); }
      });
    },
  });
}
function remindRsvp(sid) {
  const s = sessionById(sid);
  if (!s) return;
  const pending = SECTIONS.filter(x => convoked(s, x.id)).flatMap(x => membersOf(x.id)).filter(m => !isOut(s, m) && !S.rsvp.get(`${sid}_${m.id}`));
  const what = `${s.type} del ${longDate(s.date).toLowerCase()}${s.place ? ` (${s.place})` : ''}`;
  sheetReminder(`Recordatori: confirmeu si veniu al ${what}${s.rsvpBy ? `, abans del ${ddmm(s.rsvpBy)}` : ''}.`, pending,
    m => `Hola ${firstName(m.name)}! Recorda confirmar si vens al ${what}${s.rsvpBy ? ` abans del ${ddmm(s.rsvpBy)}` : ''}. Respon aquí: ${appUrl()}`,
    { kind: 'rsvp', ref: sid, title: `Encara no has dit si vens al ${what}${s.rsvpBy ? ` (fins al ${ddmm(s.rsvpBy)})` : ''}.` });
}
function remindPoll(id) {
  const p = S.polls.get(id);
  if (!p) return;
  const pending = pollExpected(p).filter(m => !S.pollVotes.get(`${id}_${m.id}`));
  sheetReminder(`Recordatori: responeu l’enquesta «${p.title}»${p.closesAt ? ` abans del ${ddmm(p.closesAt)}` : ''}.`, pending,
    m => `Hola ${firstName(m.name)}! Tens pendent l’enquesta «${p.title}»${p.closesAt ? ` (fins al ${ddmm(p.closesAt)})` : ''}. Respon-la aquí, a Tauler › Enquestes: ${appUrl()}`,
    { kind: 'poll', ref: id, title: `Tens pendent l’enquesta «${p.title}»${p.closesAt ? ` (fins al ${ddmm(p.closesAt)})` : ''}.` });
}
function remindTrip(id) {
  const t = S.trips.get(id);
  if (!t) return;
  const pending = tripPeople(t).filter(m => !signupOf(t, m.id));
  sheetReminder(`Recordatori: digueu si veniu a «${t.title}»${t.deadline ? ` abans del ${ddmm(t.deadline)}` : ''}, encara que no hi pugueu anar.`, pending,
    m => `Hola ${firstName(m.name)}! Encara no has dit si vens a «${t.title}»${t.deadline ? ` (fins al ${ddmm(t.deadline)})` : ''}. Respon aquí, a Tauler › Sortides: ${appUrl()}`,
    { kind: 'trip', ref: id, title: `Encara no has dit si vens a «${t.title}»${t.deadline ? ` (fins al ${ddmm(t.deadline)})` : ''}. Cal respondre encara que no hi vagis.` });
}
