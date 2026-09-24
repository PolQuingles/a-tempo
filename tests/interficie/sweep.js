// Recorre totes les pantalles que el perfil té a l'abast i apunta on alguna cosa surt de la pantalla
// (un element massa ample fa que el mòbil allunyi tota l'app). Es fa servir des de run.py.
async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const d = document.documentElement, bad = [], seen = [];
  const chk = n => {
    seen.push(n);
    if (innerWidth > d.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1) {
      const wide = [];
      document.querySelectorAll('#view *, .sheet *').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width && r.right > d.clientWidth + 1 && e.children.length < 4) wide.push(e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 24));
      });
      bad.push(`${n} (${innerWidth}px): ${wide.slice(0, 3).join(', ')}`);
    }
  };
  const cl = async q => { const e = document.querySelector(q); if (e) { e.click(); await s(300); } return !!e; };
  const tabs = [...document.querySelectorAll('.tabs .tab[data-tab]')].map(b => b.dataset.tab);
  for (const t of tabs) { await cl(`[data-act="tab"][data-tab="${t}"]`); chk(t); }
  if (tabs.includes('llista')) {
    await cl('[data-act="tab"][data-tab="llista"]');
    for (const k of ['stats', 'risk', 'llista']) { await cl(`[data-act="att"][data-k="${k}"]`); chk('assistencia/' + k); }
    if (await cl('[data-act="open-sec"]')) { chk('assistencia/seccio'); await cl('[data-act="close-sec"]'); }
    await cl('[data-act="att"][data-k="stats"]');
    for (const k of ['term', 'season', 'prod']) { await cl(`[data-act="stats-scope"][data-k="${k}"]`); chk('estadistiques/' + k); }
    await cl('[data-act="att"][data-k="llista"]');
  }
  if (tabs.includes('tauler')) {
    await cl('[data-act="tab"][data-tab="tauler"]');
    for (const k of ['anuncis', 'materials', 'documents', 'enquestes', 'sortides']) { await cl(`[data-act="board"][data-k="${k}"]`); chk('tauler/' + k); }
    await cl('[data-act="board"][data-k="materials"]');
    if (await cl('[data-act="work-open"]')) { chk('repertori/obra'); await cl('[data-act="sheet-close"]'); }
  }
  if (tabs.includes('calendari')) {
    await cl('[data-act="tab"][data-tab="calendari"]');
    await cl('[data-act="cal-view"][data-k="month"]'); chk('calendari/mes');
    await cl('[data-act="cal-view"][data-k="list"]');
    // La fitxa d'un concert (pla, equilibri de veus i col·locació) i la d'un assaig amb pla.
    for (const b of [...document.querySelectorAll('.cal-row .icon-btn.info')].slice(-3)) { b.click(); await s(300); chk('calendari/fitxa'); await cl('[data-act="sheet-close"]'); }
  }
  if (tabs.includes('classes')) {
    await cl('[data-act="tab"][data-tab="classes"]');
    if (await cl('.quad')) { chk('classes/professor'); if (await cl('[data-act="cl-view"][data-k="week"]')) { chk('classes/setmana'); await cl('[data-act="cl-view"][data-k="month"]'); } await cl('[data-act="cl-back"]'); }
  }
  await cl('[data-act="tab"][data-tab="avisos"]');
  // El menú del compte: cada fila obre la seva finestra; la fletxa hi torna.
  if (await cl('#acct-btn')) {
    chk('compte');
    for (const k of [...document.querySelectorAll('.acct-item[data-act="acct-open"]')].map(b => b.dataset.k)) {
      if (k === 'classIcs') continue;   // demana una adreça a Firestore abans d'obrir-se
      await cl(`.acct-item[data-k="${k}"]`); chk('compte/' + k);
      if (!(await cl('.sheet-up'))) bad.push(`compte/${k}: sense fletxa per tornar al menú`);
    }
    if (!(await cl('.acct-item[data-act="manage"]'))) await cl('[data-act="sheet-close"]');
  }
  if (ui.tab === 'gestio') {
    for (const k of ['avisos', 'personal', 'produccions', 'config']) { await cl(`[data-act="manage"][data-k="${k}"]`); chk('gestio/' + k); }
    await cl('[data-act="manage"][data-k="personal"]');
    for (const b of [...document.querySelectorAll('#people-menu .chip')]) { b.click(); await s(250); chk('personal/' + b.dataset.k); }
    await cl('[data-act="manage"][data-k="config"]');
    for (const b of [...document.querySelectorAll('.cfg-h')]) { b.click(); await s(120); }
    chk('ajustos/tot-obert');
    await cl('.ph-back .nav-arrow');
  }
  return { vistes: seen.length, desbordaments: bad };
}
