// El detector visual: a cada pantalla, què surt de la pantalla, què vessa, què queda tallat i quins textos se solapen.
// Es carrega des de run.py, sobre les dades de proves. A.scan(nom) apunta el que troba a la pantalla d'ara.
(() => {
  const A = window.AUD = window.AUD || { issues: [], seen: [], keys: new Set(), info: [] };
  // Sense animacions: amb el navegador de proves amagat, l'entrada de cada pantalla es queda a mitges.
  if (!document.getElementById('aud-style')) { const st = document.createElement('style'); st.id = 'aud-style'; st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(st); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Els errors de l'app mentre es recorre (amb la pantalla on s'era).
  if (!window.__audErr) {
    window.__audErr = true;
    const note = (msg, src) => { const A2 = window.AUD; if (A2) A2.issues.push({ label: A2.seen.at(-1) || '?', kind: 'ERROR DE JAVASCRIPT', el: String(msg).slice(0, 200), path: '', extra: src ? ` (${src})` : '' }); };
    window.addEventListener('error', e => note(e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}`));
    window.addEventListener('unhandledrejection', e => note(e.reason && (e.reason.stack || e.reason.message) || e.reason, 'promesa'));
  }
  A.sleep = sleep;
  const cls = e => typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
  const txt = e => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const desc = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls(e) ? '.' + cls(e) : ''}${txt(e) ? ` «${txt(e)}»` : ''}`;
  const path = e => { const out = []; for (let x = e; x && out.length < 4 && x.id !== 'view' && !x.classList?.contains('sheet'); x = x.parentElement) out.push(x.tagName.toLowerCase() + (cls(x) ? '.' + cls(x).split('.')[0] : '')); return out.reverse().join('>'); };
  const add = (label, kind, e, extra = '') => {
    const k = kind + '|' + path(e) + '|' + txt(e).slice(0, 30);
    if (A.keys.has(k)) return;
    A.keys.add(k);
    A.issues.push({ label, kind, el: desc(e), path: path(e), extra, w: document.documentElement.clientWidth, ts: document.documentElement.dataset.text || '' });
  };
  const hidden = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return true; } return false; };
  const scroller = e => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === 'auto' || o === 'scroll') return x; } return null; };
  const positioned = (e, stop) => { for (let x = e; x && x !== stop; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky' || p === 'absolute') return true; } return false; };
  // La part que es veu d'un element: retallada per cada avantpassat que no deixa sortir el contingut (les zones que es desplacen).
  const clipCache = new Map();
  const clipOf = e => {
    if (clipCache.has(e)) return clipCache.get(e);
    let c = { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 };
    const p = e.parentElement;
    if (p && p !== document.body) {
      c = { ...clipOf(p) };
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const r = p.getBoundingClientRect();
        c = { left: Math.max(c.left, r.left), right: Math.min(c.right, r.right), top: Math.max(c.top, r.top), bottom: Math.min(c.bottom, r.bottom) };
      }
    }
    clipCache.set(e, c);
    return c;
  };
  const common = (a, b) => { const s = new Set(); for (let x = a; x; x = x.parentElement) s.add(x); for (let y = b; y; y = y.parentElement) if (s.has(y)) return y; return null; };

  A.scan = label => {
    A.seen.push(label);
    // Es mira la pantalla quieta: els moviments que encara corren (la barra de Classes, l'entrada de la vista) s'acaben ara.
    for (const an of document.getAnimations()) { try { an.finish(); } catch { /* una animació sense fi */ } }
    clipCache.clear();
    const d = document.documentElement, W = d.clientWidth;
    const sheet = document.querySelector('#sheet-root .sheet');
    const roots = sheet ? [sheet] : ['.appbar', '#banner', '#view', '.tabs'].map(q => document.querySelector(q)).filter(Boolean);
    if (d.scrollWidth > W + 1) add(label, 'PÀGINA MÉS AMPLA QUE LA PANTALLA', d, ` ${d.scrollWidth}px > ${W}px`);
    const spill = [];
    const leaves = [];
    for (const root of roots) {
      for (const e of root.querySelectorAll('*')) {
        const tag = e.tagName.toLowerCase();
        if (e.closest('svg') || tag === 'svg' || tag === 'canvas' || tag === 'option' || tag === 'br' || e.closest('.sr')) continue;
        // El que hi ha dins d'un desplegable plegat no es veu (només el seu títol).
        const shut = e.closest('details:not([open])');
        if (shut && !e.closest('summary')) continue;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(e);
        // Surt de la pantalla (i no és dins d'una fila que es desplaça de costat).
        if ((r.right > W + 1 || r.left < -1) && !scroller(e) && cs.position !== 'fixed') {
          if (r.left < W && !hidden(e) && e.children.length < 6) add(label, 'SURT DE LA PANTALLA', e, ` (${Math.round(r.left)}–${Math.round(r.right)} de ${W})`);
        }
        // Contingut més ample que la caixa.
        // (Una zona tàctil feta amb ::after és invisible: no vessa res.)
        if (e.clientWidth && e.scrollWidth > e.clientWidth + 2 && !['input', 'textarea', 'select'].includes(tag) && getComputedStyle(e, '::after').position !== 'absolute') {
          const ox = cs.overflowX;
          if (ox === 'visible') spill.push([e, 'VESSA DE LA CAIXA', ` (${e.scrollWidth} > ${e.clientWidth})`]);
          else if ((ox === 'hidden' || ox === 'clip') && cs.textOverflow !== 'ellipsis') spill.push([e, 'TEXT TALLAT (ample)', ` (${e.scrollWidth} > ${e.clientWidth})`]);
          else if (cs.textOverflow === 'ellipsis' && (tag === 'button' || e.closest('button,.btn,h1,h2,h3,.chip'))) A.info.push(`${label} · escurçat amb …: ${desc(e)}`);
        }
        // Alçada fixa que talla text.
        const oy = cs.overflowY;
        if ((oy === 'hidden' || oy === 'clip') && e.clientHeight && e.scrollHeight > e.clientHeight + 3 && cs.height !== 'auto' && txt(e) && !e.closest('details:not([open])') && cs.webkitLineClamp === 'none')
          spill.push([e, 'TEXT TALLAT (alt)', ` (${e.scrollHeight} > ${e.clientHeight})`]);
        // Botons en tres línies o més.
        // (Només els botons d'una sola etiqueta: les targetes que són botons, amb títol i explicació, ja van en diverses línies.)
        const blocky = [...e.querySelectorAll('*')].some(x => !x.closest('svg') && x.textContent.trim() && ['block', 'flex', 'grid', 'list-item'].includes(getComputedStyle(x).display));
        if ((tag === 'button' || e.classList.contains('btn')) && txt(e) && !e.classList.contains('tab') && !blocky && !e.querySelector('small,br')) {
          // Les línies de text de debò: els trossos de text, agrupats per altura.
          const tops = new Set(), w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 1) tops.add(Math.round(q.top / 4)); }
          if (tops.size >= 3 && txt(e).length < 70) add(label, 'BOTÓ EN 3 LÍNIES O MÉS', e, ` (${tops.size} línies)`);
        }
        // Text: per comprovar si se solapen.
        for (const n of e.childNodes) {
          if (n.nodeType !== 3 || !n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const cl = clipOf(n.parentElement ? n : e);
          for (const q of rg.getClientRects()) {
            if (q.width <= 1 || q.height <= 1) continue;
            const r0 = { left: Math.max(q.left + 1, cl.left), right: Math.min(q.right - 1, cl.right), top: Math.max(q.top + q.height * .28, cl.top), bottom: Math.min(q.bottom - q.height * .22, cl.bottom) };
            if (r0.right - r0.left > 1 && r0.bottom - r0.top > 1) leaves.push({ e, n, r: r0 });
          }
        }
      }
    }
    // Només l'element més profund de cada vessament.
    for (const [e, kind, extra] of spill) if (!spill.some(([o]) => o !== e && e.contains(o))) { if (!hidden(e)) add(label, kind, e, extra); }
    // Textos que se solapen (dins del mateix flux: no compten les capes fixes o enganxades).
    leaves.sort((a, b) => a.r.top - b.r.top);
    for (let i = 0; i < leaves.length; i++) {
      const a = leaves[i];
      for (let j = i + 1; j < leaves.length && leaves[j].r.top < a.r.bottom; j++) {
        const b = leaves[j];
        if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w < 3 || h < 2) continue;
        const c = common(a.e, b.e);
        if (positioned(a.e, c) || positioned(b.e, c)) continue;
        if (hidden(a.e) || hidden(b.e)) continue;
        add(label, 'TEXTOS SOLAPATS', a.e, ` amb ${desc(b.e)}`);
      }
    }
  };
  // Camps on l'iPhone fa zoom en tocar-los (lletra de menys de 16 px).
  A.zoom = label => {
    for (const e of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not(.sr), select, textarea')) {
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 16) add(label, `CAMP AMB LLETRA DE ${fs}px (l'iPhone hi fa zoom)`, e);
    }
  };

})();
