// A Tempo · 15-copies.js — Importar i exportar dades (còpies).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Import / export ================= */
function offerFile(filename, text, mime) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { toast('No s’ha pogut preparar el fitxer'); }
}
function exportJSON() {
  const data = { app: 'a-tempo', version: 1, exportedAt: new Date().toISOString(), config: S.config,
    members: [...S.members.values()], productions: [...S.productions.values()], attendance: Object.fromEntries(S.attendance), absences: [...S.absences.values()],
    rsvp: [...S.rsvp.values()], announcements: [...S.announcements.values()], polls: [...S.polls.values()], pollVotes: [...S.pollVotes.values()],
    classes: [...S.classes.values()], classReq: [...S.classReq.values()], works: [...S.works.values()], trips: [...S.trips.values()], tripSignups: [...S.tripSignups.values()] };
  const slug = (S.config.name || 'agrupacio').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  offerFile(`${slug}-${TODAY}.json`, JSON.stringify(data, null, 2), 'application/json');
}
function exportCSV() {
  const scope = currentScope();
  if (!scope) return;
  const prod = { name: scope.name };
  const st = computeStats(scope, '');
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Nom', V.Section, 'Assistència %', 'Assisteix', 'Retard', 'Minuts retard', 'Falta no justificada', 'Falta justificada', 'No fa', ...st.sessions.map(s => `${s.date} ${s.type || ''}`)];
  const lines = [head.map(q).join(';')];
  for (const r of st.rows.sort((a, b) => a.m.section.localeCompare(b.m.section) || byName(a.m, b.m))) {
    const byS = new Map(r.hist.map(h => [h.s.id, h.mk]));
    const rt = rate(r);
    lines.push([r.m.name, SEC[r.m.section].name, rt == null ? '' : Math.round(rt * 100), r.P, r.R, r.min, r.FNJ, r.FJ, r.NP,
      ...st.sessions.map(s => { const mk = byS.get(s.id); return mk ? (mk.s === 'R' && mk.min ? `R${mk.min}` : mk.s) : ''; })].map(q).join(';'));
  }
  const slug = prod.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  offerFile(`assistencia-${slug}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}
async function importJSON(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('El fitxer no és una còpia vàlida d’A Tempo'); return; }
  if (!data || !['a-tempo', 'cor-present'].includes(data.app) || !Array.isArray(data.members) || !Array.isArray(data.productions)) { toast('El fitxer no és una còpia vàlida d’A Tempo'); return; }
  const ok = await confirmSheet('Restaurar la còpia?', `Se substituiran les dades actuals per ${data.members.length} ${V.members} i ${data.productions.length} produccions del fitxer.`, 'Restaura');
  if (!ok) return;
  applyData(data, false);
  toast('Còpia restaurada');
}
function applyData(data, demo) {
  const incoming = { members: new Map(data.members.map(m => [m.id, m])), productions: new Map(data.productions.map(p => [p.id, p])), attendance: new Map(Object.entries(data.attendance || {})) };
  // La identitat de l'agrupació (nom, tipus, seccions, imatge) no la canvia ni una còpia ni l'exemple.
  const keep = ['name', 'shortName', 'kind', 'sections', 'types', 'labels', 'brand', 'createdAt', 'icsOn', 'classesOn', 'teachers', 'shared', 'onboarded', 'documents'];
  const cfg = Object.fromEntries(Object.entries(data.config || {}).filter(([k]) => !keep.includes(k) || (!demo && k === 'documents')));
  for (const col of COLS) {
    for (const id of [...S[col].keys()]) if (!incoming[col].has(id)) { S[col].delete(id); persist(col, id, null, 10); }
  }
  let i = 0;
  for (const col of COLS) for (const [id, v] of incoming[col]) { S[col].set(id, v); persist(col, id, v, 10 + (i++ % 40) * 15); }
  saveConfig({ ...cfg, demo });
  bumpEpoch('all');
  ui.sessionId = null; ui.statsProd = null;
  render();
}
async function loadDemo() {
  try {
    const res = await fetch('demo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    // L'exemple és d'un cor de quatre cordes: si aquesta agrupació en té d'altres, s'hi reparteix la gent.
    if (data.members.some(m => !SEC_MAP[m.section])) {
      const secOf = Object.fromEntries(data.members.map((m, i) => [m.id, SECTIONS[i % SECTIONS.length].id]));
      data.members = data.members.map(m => ({ ...m, section: secOf[m.id], leader: false }));
      const att = {};
      for (const [key, d] of Object.entries(data.attendance || {})) {
        const sid = d.sessionId || key.slice(0, key.lastIndexOf('_'));
        for (const [mid, mk] of Object.entries(d.marks || {})) {
          const sec = secOf[mid];
          if (!sec) continue;
          const k = `${sid}_${sec}`;
          att[k] = att[k] || { sessionId: sid, section: sec, marks: {} };
          att[k].marks[mid] = mk;
        }
      }
      data.attendance = att;
      for (const p of data.productions) for (const s of p.sessions || []) delete s.sections;
    }
    applyData(data, true);
    ui.tab = 'llista'; render();
    toast('Dades d’exemple carregades');
  } catch { toast('No s’han pogut carregar les dades d’exemple'); }
}
/** The one link everybody uses: no secret, everyone signs in with their own email. It opens this group. */
const appUrl = () => `${location.origin}${location.pathname}${GID && GID !== FOUNDER ? `?a=${encodeURIComponent(GID)}` : ''}`;
function sheetShareApp() {
  const url = appUrl();
  if (canEdit() && !S.config.shared) saveConfig({ shared: true });
  const msg = `Aquesta és A Tempo, l’app ${ofName()}. Entra-hi amb el correu que has donat a l’agrupació i hi trobaràs el calendari, les llistes, el tauler i el teu espai personal:\n${url}\n\nSi el teu correu no és de Google, toca «Entra amb un altre correu» i crea la teva contrasenya.\nSi no et deixa entrar, obre l’enllaç amb el Safari o el Chrome (no des del WhatsApp) i afegeix-lo a la pantalla d’inici.`;
  openSheet({
    title: 'Enllaç de l’app',
    body: `<p style="margin-top:0">El mateix enllaç serveix per a tothom. Qui hi entri haurà d’identificar-se amb el seu correu, i només hi podrà accedir si el tens donat d’alta a <b>Persones i accessos</b>.</p>
      <div class="linkbox">${esc(url)}</div>
      <p class="muted" style="font-size:calc(13px*var(--ts));margin:10px 0 0">Consell: digues a tothom que l’obri al <b>navegador del mòbil</b> (Safari o Chrome, no dins del WhatsApp) i, des del menú, triï «Afegeix a la pantalla d’inici» per tenir-lo com una app.</p>`,
    foot: `${navigator.share ? '<button class="btn" id="sa-native">Comparteix…</button>' : ''}<button class="btn" id="sa-msg">Copia el missatge</button><button class="btn btn-primary" id="sa-copy">Copia l’enllaç</button>`,
    onMount: el => {
      el.querySelector('#sa-copy').onclick = () => copyText(url, 'Enllaç copiat');
      el.querySelector('#sa-msg').onclick = () => copyText(msg, 'Missatge copiat');
      el.querySelector('#sa-native')?.addEventListener('click', () => navigator.share({ title: S.config.name || PLATFORM.name, text: `L’app ${ofName()}`, url }).catch(() => {}));
    },
  });
}
async function wipeAll(demo) {
  const ok = await confirmSheet(demo ? 'Esborrar les dades d’exemple?' : 'Esborrar-ho tot?', demo
    ? `S’eliminaran els ${V.members}, les produccions i les llistes d’exemple perquè puguis començar amb les dades reals.`
    : `S’eliminaran tots els ${V.members}, les produccions i les llistes. Fes abans una còpia de seguretat si en vols conservar res.`, 'Esborra-ho');
  if (!ok) return;
  const paths = [...COLS, 'absences', ...CLASS_COLS].flatMap(col => [...S[col].keys()].map(id => [col, id]));
  let i = 0;
  for (const [col, id] of paths) { S[col].delete(id); persist(col, id, null, 10 + (i++ % 40) * 15); }
  saveConfig({ demo: false });
  bumpEpoch('all');
  ui.sessionId = null; ui.statsProd = null;
  ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'singer';
  toast(`Dades esborrades. Comença afegint ${V.members}.`);
  render();
}
