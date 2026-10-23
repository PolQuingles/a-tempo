// A Tempo · 11b-produccio.js — La fitxa d'una producció: nom, dates, sessions, qui no la fa i color.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Sheet: production ---------- */
function sheetProduction(pid) {
  const existing = pid ? S.productions.get(pid) : null;
  const d = existing ? clone(existing) : { id: uid('p'), name: '', start: TODAY, end: '', sessions: [], excluded: [] };
  d.sessions = d.sessions || []; d.excluded = d.excluded || [];
  const excluded = new Set(d.excluded);
  const gen = { from: d.start || TODAY, to: d.end || '', days: new Set(['1', '3']), time: '20:30', end: '22:30', type: 'Assaig', place: '' };

  const sessionsList = () => d.sessions.length
    ? `<ul class="mini-list" id="pe-sessions">${[...d.sessions].sort((a, b) => a.date.localeCompare(b.date)).map(s => `<li><span><span class="mono">${ddmm(s.date)} ${wdShort(s.date)}</span> · ${esc(s.type)} <span class="mono">${esc(timeRange(s))}</span></span><button class="icon-btn" data-rm="${s.id}" aria-label="Treu la sessió">${ICON.close}</button></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0;font-size:calc(13.5px*var(--ts))">Encara no hi ha sessions.</p>';

  openSheet({
    title: existing ? 'Edita la producció' : 'Nova producció', wide: true,
    body: `<div class="kv">
      <label class="field"><span>Nom</span><input class="inp" id="pe-name" type="text" maxlength="60" value="${esc(d.name)}" placeholder="p. ex. Concert de Nadal 2026"></label>
      <div class="field"><span>Color al calendari</span><div class="pickers" id="pe-hue">${PROD_HUES.map(h => `<button type="button" class="hue-pick prod-tone" style="--ph:${h}" data-hue="${h}" aria-pressed="${prodHue(d) === h}" aria-label="Color ${h}"></button>`).join('')}</div></div>
      <div class="field"><span>Cartell</span><div class="poster-edit"><span id="pe-poster">${d.poster ? `<span class="poster-th"><img src="${esc(d.poster)}" alt=""></span>` : '<span class="poster-th empty">Cap</span>'}</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap"><label class="btn btn-sm" for="pe-poster-f">${d.poster ? 'Canvia’l' : 'Tria una imatge'}</label><input id="pe-poster-f" type="file" accept="image/*" class="sr">
        <button type="button" class="btn btn-sm btn-ghost" id="pe-poster-rm" ${d.poster ? '' : 'hidden'}>Treu-lo</button></span></div>
        <small>Surt a Inici, al calendari i a la fitxa ${V.sh.del}. Una foto o el PDF del cartell convertit en imatge.</small></div>
      <div class="row2"><label class="field"><span>Inici</span><input class="inp" id="pe-start" type="date" value="${d.start || ''}"></label>
      <label class="field"><span>Final</span><input class="inp" id="pe-end" type="date" value="${d.end || ''}"></label></div>

      <fieldset class="fieldset"><legend>Sessions</legend>
        <div id="pe-slist">${sessionsList()}</div>
        <details id="pe-gen" ${d.sessions.length ? '' : 'open'}><summary class="btn btn-sm" style="list-style:none;width:max-content">Genera sessions recurrents</summary>
          <div class="kv" style="margin-top:12px">
            <div class="row2"><label class="field"><span>Des de</span><input class="inp" id="g-from" type="date" value="${gen.from}"></label>
            <label class="field"><span>Fins a</span><input class="inp" id="g-to" type="date" value="${gen.to}"></label></div>
            <div class="field"><span>Dies</span><div class="pickers" id="g-days">${WEEKDAYS.map(([v, l]) => `<button type="button" class="pick" aria-pressed="${gen.days.has(v)}" data-d="${v}">${l}</button>`).join('')}</div></div>
            <div class="row2"><label class="field"><span>Hora d’inici</span><input class="inp" id="g-time" type="time" value="${gen.time}"></label>
            <label class="field"><span>Hora de final</span><input class="inp" id="g-end" type="time" value="${gen.end}"></label></div>
            <label class="field"><span>Tipus</span><select class="inp" id="g-type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
            <label class="field"><span>Lloc</span><input class="inp" id="g-place" type="text" maxlength="60" placeholder="Sala d’assaig"></label>
            <button type="button" class="btn btn-sm btn-primary" id="g-run" style="width:max-content">Afegeix les sessions</button>
          </div></details>
      </fieldset>

      <fieldset class="fieldset"><legend>Qui no fa aquesta producció</legend>
        <p class="muted" style="margin:0;font-size:calc(13px*var(--ts))">Els marcats sortiran en gris («No fa») a totes les sessions i no comptaran a les estadístiques.</p>
        ${SECTIONS.map(x => { const ms = membersOf(x.id); return ms.length ? `<div class="field"><span>${x.name}</span><div class="pickers">${ms.map(mm => `<button type="button" class="pick" data-ex="${mm.id}" aria-pressed="${excluded.has(mm.id)}">${esc(mm.name)}</button>`).join('')}</div></div>` : ''; }).join('')}
      </fieldset>
    </div>`,
    foot: `${existing ? '<button class="btn btn-danger-ghost" id="pe-del">Esborra</button>' : ''}<span class="spacer"></span><button class="btn" data-act="sheet-close">Cancel·la</button><button class="btn btn-primary" id="pe-save">Desa</button>`,
    onMount: el => {
      const pf = el.querySelector('#pe-poster-f');
      pf.onchange = async () => {
        const f = pf.files && pf.files[0];
        if (!f) return;
        try {
          d.poster = await compressImage(f);
          el.querySelector('#pe-poster').innerHTML = `<span class="poster-th"><img src="${d.poster}" alt=""></span>`;
          el.querySelector('#pe-poster-rm').hidden = false;
        } catch { toast('No s’ha pogut llegir la imatge. Prova amb una foto (JPG o PNG).'); }
        pf.value = '';
      };
      el.querySelector('#pe-poster-rm').onclick = () => { delete d.poster; el.querySelector('#pe-poster').innerHTML = '<span class="poster-th empty">Cap</span>'; el.querySelector('#pe-poster-rm').hidden = true; };
      const bindRm = () => el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { d.sessions = d.sessions.filter(s => s.id !== b.dataset.rm); el.querySelector('#pe-slist').innerHTML = sessionsList(); bindRm(); });
      bindRm();
      el.querySelectorAll('#g-days .pick').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
      el.querySelectorAll('#pe-hue .hue-pick').forEach(b => b.onclick = () => el.querySelectorAll('#pe-hue .hue-pick').forEach(x => x.setAttribute('aria-pressed', x === b)));
      el.querySelector('#pe-start').onchange = e => { if (!el.querySelector('#g-from').value || !d.sessions.length) el.querySelector('#g-from').value = e.target.value; };
      el.querySelector('#pe-end').onchange = e => { if (!el.querySelector('#g-to').value) el.querySelector('#g-to').value = e.target.value; };
      el.querySelector('#g-run').onclick = () => {
        const from = el.querySelector('#g-from').value, to = el.querySelector('#g-to').value;
        const days = new Set($$('#g-days .pick[aria-pressed="true"]', el).map(b => +b.dataset.d));
        if (!from || !to || to < from) { toast('Indica unes dates d’inici i final vàlides'); return; }
        if (!days.size) { toast('Tria almenys un dia de la setmana'); return; }
        const time = el.querySelector('#g-time').value, end = el.querySelector('#g-end').value, type = el.querySelector('#g-type').value, place = el.querySelector('#g-place').value.trim();
        const have = new Set(d.sessions.map(s => s.date + s.time));
        let n = 0;
        for (let dt = parseISO(from); isoDate(dt) <= to && n < 200; dt.setDate(dt.getDate() + 1)) {
          if (!days.has(dt.getDay())) continue;
          const iso = isoDate(dt);
          if (have.has(iso + time)) continue;
          d.sessions.push({ id: uid('s'), date: iso, time, end, type, place, note: '' }); n++;
        }
        el.querySelector('#pe-slist').innerHTML = sessionsList(); bindRm();
        toast(n ? `${n === 1 ? '1 sessió afegida' : `${n} sessions afegides`}. Recorda desar.` : 'No s’ha afegit cap sessió nova');
      };
      el.querySelector('#pe-save').onclick = () => {
        const name = el.querySelector('#pe-name').value.trim();
        if (!name) { toast('Posa un nom a la producció'); return; }
        d.name = name;
        d.start = el.querySelector('#pe-start').value || (d.sessions[0]?.date ?? TODAY);
        d.end = el.querySelector('#pe-end').value;
        d.excluded = $$('[data-ex][aria-pressed="true"]', el).map(b => b.dataset.ex);
        const hueBtn = el.querySelector('#pe-hue .hue-pick[aria-pressed="true"]');
        if (hueBtn) d.hue = +hueBtn.dataset.hue;
        d.sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const removed = (existing?.sessions || []).filter(s => !d.sessions.some(x => x.id === s.id));
        saveProduction(d);
        if (removed.length) removeMany(removed.flatMap(s => SECTIONS.map(x => ['attendance', attKey(s.id, x.id)])).filter(([, k]) => S.attendance.has(k)));
        closeSheet();
        toast(existing ? 'Producció desada' : 'Producció creada');
        render();
      };
      const del = el.querySelector('#pe-del');
      if (del) del.onclick = async () => {
        const ok = await confirmSheet('Esborrar la producció?', `S’esborraran <b>${esc(existing.name)}</b>, ${(existing.sessions || []).length === 1 ? 'la seva sessió' : `les seves ${(existing.sessions || []).length} sessions`} i tota l’assistència registrada.`, 'Esborra la producció');
        if (!ok) return;
        const att = (existing.sessions || []).flatMap(s => SECTIONS.map(x => ['attendance', attKey(s.id, x.id)])).filter(([, k]) => S.attendance.has(k));
        S.productions.delete(existing.id); persist('productions', existing.id, null, 20);
        bumpEpoch('productions');
        (existing.materials || []).forEach(x => deleteFile(x.file));
        await removeMany(att);
        toast('Producció esborrada');
        render();
      };
    },
  });
}
