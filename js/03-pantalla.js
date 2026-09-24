// A Tempo · 03-pantalla.js — Pintar la pantalla: pestanyes, marca de l'agrupació, aparença i pantalles d'entrada.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ================= Rendering ================= */
let renderQueued = false;
let deferred = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const a = document.activeElement;
    if (a && $('#view').contains(a) && a.matches('input, textarea, select')) { deferred = true; return; }
    render();
  });
}
document.addEventListener('focusout', () => { if (deferred) { deferred = false; setTimeout(scheduleRender, 60); } });

const TAB_ICONS = {
  llista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8"/>',
  calendari: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  stats: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>',
  gestio: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.2a3 3 0 010 5.6M18 14.8c1.5.7 2.4 2.2 2.6 4.7"/>',
  avisos: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 014 19z"/>',
  tauler: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M7.5 9h9M7.5 13h9M7.5 17h5"/>',
  classes: '<path d="M12 6.6c-2-1.5-4-2-6.5-2v12c2.5 0 4.5.5 6.5 2 2-1.5 4-2 6.5-2v-12c-2.5 0-4.5.5-6.5 2Z"/><path d="M12 6.6v12"/>',
};
const TAB_LABEL = { llista: 'Assistència', calendari: 'Calendari', stats: 'Estadístiques', gestio: 'Gestió', avisos: 'Inici', tauler: 'Tauler', classes: 'Classes de cant' };
// Amb sis pestanyes (qui edita i també és a la plantilla) els noms llargs no hi caben.
const TAB_SHORT = { stats: 'Estad.', classes: 'Classes', calendari: 'Calend.', llista: 'Assistència' };
// Una pestanya per feina: Inici (el que tens per fer i el que ve), Assistència (passar llista i
// estadístiques), Calendari, Tauler (comunicació) i, si n'hi ha, Classes. La gestió s'obre des d'Inici.
const tabsForRole = () => {
  const cl = seeClasses() ? ['classes'] : [];
  if (isLinkOnly()) return ['avisos', 'tauler', ...(mySubs().length ? ['llista'] : []), 'calendari'];
  return ['avisos', 'llista', 'calendari', 'tauler', ...cl];
};
/** La pestanya de baix que s'il·lumina: Gestió s'obre des d'Inici. */
const navTab = () => ui.tab === 'gestio' ? 'avisos' : ui.tab;
function renderTabs() {
  const tabs = tabsForRole();
  if (ui.tab === 'stats' || (ui.tab === 'tauler' && ui.board === 'estadistiques')) { ui.tab = 'llista'; ui.att = 'stats'; ui.board = 'anuncis'; }   // on eren abans
  if (ui.tab === 'gestio' && !canEdit()) ui.tab = tabs[0];
  if (ui.tab !== 'gestio' && !tabs.includes(ui.tab)) ui.tab = tabs[0];
  // Un sol número vermell, a Inici: tot el que espera resposta.
  const badge = todoCount();
  const short = tabs.length > 5;
  $('.tabs-in').classList.toggle('n6', short);
  $('.tabs-in').classList.toggle('n7', tabs.length > 6);
  // Amb cinc pestanyes, els noms llargs (Classes de cant) van escurçats.
  const shortName = t => (short || (tabs.length === 5 && t !== 'calendari')) && TAB_SHORT[t];
  const logo = S.config.brand?.logo || MARCA?.logo;
  const gname = S.config.shortName || S.config.name || MARCA?.short || '';
  const side = `<div class="side-brand" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="">` : `<span class="sb-ini">${esc(personInitials(gname))}</span>`}<span><b>${esc(gname)}</b><small>A Tempo</small></span></div>`;
  $('.tabs-in').innerHTML = side + tabs.map(t => `<button class="tab" data-act="tab" data-tab="${t}" aria-current="${t === navTab() ? 'page' : 'false'}"${shortName(t) ? ` aria-label="${TAB_LABEL[t]}"` : ''}>
    <span class="tab-ico"><svg viewBox="0 0 24 24">${TAB_ICONS[t]}</svg>${t === 'avisos' && badge ? `<span class="tab-badge">${badge > 99 ? '99+' : badge}</span>` : ''}</span>${shortName(t) || TAB_LABEL[t]}</button>`).join('');
}
/* ---------- Brand: logo and accent colour ---------- */
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s2 = 0;
  if (max !== min) {
    const d = max - min; s2 = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [Math.round(h), Math.round(s2 * 100), Math.round(l * 100)];
}
let brandApplied = '';
function applyBrand() {
  const brand = S.config.brand || {};
  const logo = $('#choir-logo');
  if (brand.logo) { if (logo.getAttribute('src') !== brand.logo) logo.src = brand.logo; logo.hidden = false; } else logo.hidden = true;
  updateThemeColor();
  const short = S.config.shortName || MARCA?.short;
  if (short) $('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', short);
  const sig = brand.accent || '';
  if (sig === brandApplied) return;
  brandApplied = sig;
  let st = $('#brand-style');
  if (!st) { st = document.createElement('style'); st.id = 'brand-style'; document.head.appendChild(st); }
  const hsl = hexToHsl(brand.accent);
  if (!hsl) { st.textContent = ''; return; }
  const [h, sa, l] = hsl;
  const light = `--accent:${brand.accent};--accent-ink:${l > 62 ? '#1D1822' : '#FFFFFF'};--accent-soft:hsl(${h} ${Math.min(sa, 55)}% 94%);--accent-line:hsl(${h} ${Math.min(sa, 40)}% 82%);`;
  const dark = `--accent:hsl(${h} ${Math.min(sa, 60)}% 78%);--accent-ink:hsl(${h} 40% 12%);--accent-soft:hsl(${h} 22% 20%);--accent-line:hsl(${h} 22% 32%);`;
  st.textContent = `:root{${light}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
  updateThemeColor();
}

/* ---------- Aparença: clara, fosca o automàtica ---------- */
const LS_THEME = 'atempo:tema';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function currentTheme() { try { return localStorage.getItem(LS_THEME) || ''; } catch { return ''; } }
const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : darkQuery.matches; };
function updateThemeColor() {
  const bar = isDark() ? '#131016' : (MARCA?.bg || S.config.brand?.accent || '#4C2582');
  $('meta[name="theme-color"]')?.setAttribute('content', bar);
}
function setTheme(t) {
  try { t ? localStorage.setItem(LS_THEME, t) : localStorage.removeItem(LS_THEME); } catch {}
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  $$('[data-act="theme"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === t)));
  updateThemeColor();
}
darkQuery.addEventListener?.('change', updateThemeColor);
function themeRow() {
  const t = currentTheme();
  return `<div class="setting"><div><div class="t">Aparença</div><div class="s">L’automàtica segueix el mode clar o fosc del mòbil.</div></div>
    <div class="seg3" role="radiogroup" aria-label="Aparença">${[['', 'Automàtica'], ['light', 'Clara'], ['dark', 'Fosca']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${t === k}" data-act="theme" data-k="${k}">${l}</button>`).join('')}</div></div>`;
}

/* ---------- Identitat abans d'entrar ---------- */
// Cada agrupació té la seva marca pública a marca/<agrupació>/ (nom, logotip, icones i manifest), que
// genera l'acció «Calendari» cada poques hores. Mentre no se sap de quina agrupació és qui entra,
// es mostra la de la plataforma.
const LS_BRAND = 'atempo:marca';
const LS_GROUP = 'atempo:agrupacio';
const GID_RE = /^[A-Za-z0-9_-]{20,40}$/;
const PLATFORM = { name: 'A Tempo', sub: 'Assistència, calendari i avisos per a cors, orquestres i altres agrupacions' };
const urlGroup = () => { const m = location.search.match(/[?&]a=([A-Za-z0-9_-]{20,40})/); return m ? m[1] : null; };
function rememberedGroup() { try { const g = localStorage.getItem(LS_GROUP); return g && GID_RE.test(g) ? g : null; } catch { return null; } }
let MARCA = null;
function loadMarca(gid = urlGroup() || rememberedGroup()) {
  MARCA = null;
  if (!gid) return;
  try { MARCA = JSON.parse(localStorage.getItem(`${LS_BRAND}:${gid}`) || (gid === FOUNDER && localStorage.getItem(LS_BRAND)) || 'null'); } catch {}
  fetch(`marca/${gid}/marca.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(m => {
    try { m ? localStorage.setItem(`atempo:marca-ok:${gid}`, '1') : localStorage.removeItem(`atempo:marca-ok:${gid}`); } catch {}
    if (!m || (GID && GID !== gid)) return;
    MARCA = { ...m, name: (S.ready && S.config.name) || m.name };
    try { localStorage.setItem(`${LS_BRAND}:${gid}`, JSON.stringify(MARCA)); } catch {}
    if (!S.ready) render();
  }).catch(() => {});
}
/** Name and logo to show when the group's own data is not loaded yet. */
const shownName = () => (S.ready && S.config.name) || MARCA?.name || S.config.name || '';
const shownLogo = () => (S.ready && S.config.brand?.logo) || MARCA?.logo || null;
const initials = n => String(n || '').replace(/[’'().,·-]/g, ' ').split(/\s+/)
  .filter(w => w && !/^(de|del|dels|la|les|el|els|l|i|d)$/i.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const groupAvatar = g => `<span class="g-av" aria-hidden="true"><i>${esc(initials(g.name))}</i><img src="marca/${esc(g.id)}/icon-192.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
/** The group name in the top bar: a button to switch when there is somewhere to switch to. */
function paintBrandName() {
  const name = shownName();
  const canSwitch = S.mode === 'shared' && !PREVIEW && (S.groups.length > 1 || S.platform);
  $('#choir-name').innerHTML = canSwitch
    ? `<button class="brand-btn" data-act="groups" aria-label="${esc(name)}. Les teves agrupacions">${esc(name)}${ICON.chev}</button>`
    : esc(name);
}
function render() {
  if (!S.ready && MARCA) S.config = { ...S.config, name: S.config.name || MARCA.name, brand: { ...(S.config.brand || {}), logo: S.config.brand?.logo || MARCA.logo } };
  applyBrand();
  paintBrandName();
  document.title = shownName() || PLATFORM.name;
  document.body.classList.toggle('is-login', ['badlink', 'nokey', 'nostaff', 'loading', 'pick', 'create', 'suspended'].includes(S.mode));
  updateSync();
  paintAccount();
  renderBanner();
  const v = $('#view');
  $('.tabs').hidden = S.mode !== 'shared';
  if (S.mode === 'shared') renderTabs();
  const GBTN = `<button class="gbtn" data-act="google-in"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Entra amb Google</button>`;
  const own = !['pick', 'create', 'nostaff'].includes(S.mode) && !!(MARCA || S.ready);
  const hero = () => `<div class="entry-id">
      ${own && shownLogo() ? `<img class="entry-logo" src="${esc(shownLogo())}" alt="">` : staffSvg()}
      <h1 class="entry-name">${esc((own && shownName()) || PLATFORM.name)}</h1>
      <p class="entry-sub">${own ? 'Assistència, calendari i avisos' : PLATFORM.sub}</p>
    </div>`;
  const newGroup = text => `<div class="entry-new"><span>${text}</span><button class="btn btn-sm" data-act="group-create">Crea una agrupació</button></div>`;
  const MBTN = `<button class="gbtn mbtn" data-act="mail-in"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/></svg>Entra amb un altre correu</button>`;
  if (S.mode === 'loading') {
    v.innerHTML = `<section class="entry">${hero()}<p class="entry-wait">Connectant…</p></section>`;
    return;
  }
  if ((S.mode === 'badlink' || S.mode === 'nokey') && MAIL) {
    v.innerHTML = `<section class="entry">${hero()}<div class="login-card">${mailCard()}</div></section>`;
    mailMount(v);
    return;
  }
  if (S.mode === 'badlink' || S.mode === 'nokey') {
    const intro = S.mode === 'badlink'
      ? `<h2 class="h2">Aquest enllaç ja no funciona</h2><p>Ara tothom entra amb el seu correu, el mateix que has donat a l’agrupació.</p>`
      : `<h2 class="h2">Entra-hi</h2><p>Fes servir el correu que has donat a la teva agrupació.</p>`;
    v.innerHTML = `<section class="entry">${hero()}
      <div class="login-card">${intro}
        ${GBTN}
        <div class="or">o bé</div>
        ${MBTN}
        <p class="muted" style="font-size:13px;margin:0">Músics, cantaires, direcció i equip entreu pel mateix lloc.</p>
      </div>
      <p class="entry-foot">Si l’has obert des del WhatsApp i no et deixa entrar, obre l’enllaç amb el <b>Safari</b> o el <b>Chrome</b> (menú «···» › Obre al navegador).</p>
    </section>`;
    return;
  }
  if (S.mode === 'nostaff') {
    v.innerHTML = `<section class="entry">${hero()}
      <div class="login-card"><h2 class="h2">Aquest correu encara no és a cap agrupació</h2>
        <p><b>${esc(S.email || '')}</b> no és a la llista de cap agrupació. Si en formes part, demana a l’administració que t’hi afegeixi amb aquest correu, o entra amb un altre compte.</p>
        <button class="btn btn-ghost" data-act="sign-out" style="justify-self:center">Prova amb un altre compte</button>
      </div>
      ${S.pro ? newGroup('Com a Usuari Pro, pots crear una agrupació nova.') : ''}
    </section>`;
    return;
  }
  if (S.mode === 'pick') { v.innerHTML = viewPick(hero()); return; }
  if (S.mode === 'create') { v.innerHTML = viewCreate(); afterCreateRender(); return; }
  if (S.mode === 'suspended') { v.innerHTML = viewSuspended(hero()); return; }
  if (S.mode === 'setup') {
    v.innerHTML = `<div class="empty">${staffSvg()}<h2 class="h2">Falta connectar la base de dades</h2><p>Omple el fitxer <span class="mono">config.js</span> amb la configuració del teu projecte de Firebase.</p></div>`;
    return;
  }
  if (S.mode === 'loading' || (S.mode === 'shared' && !S.ready)) {
    // La silueta de la pàgina, en lloc d'un text: l'app sembla a punt des del primer moment.
    v.innerHTML = `<div class="skel" aria-label="Carregant les dades de l’agrupació" role="status">
      <span class="sk sk-eyebrow"></span><span class="sk sk-title"></span><span class="sk sk-hero"></span>
      <span class="sk sk-row"></span><span class="sk sk-row"></span>
      <div class="sk-grid"><span class="sk sk-tile"></span><span class="sk sk-tile"></span></div></div>`;
    return;
  }
  const html = { llista: viewRoll, calendari: viewCalendar, stats: () => viewStats(false), gestio: viewManage, avisos: viewHome, tauler: viewBoard, classes: viewClasses }[ui.tab]();
  v.innerHTML = html;
  const key = [ui.tab, ui.att, ui.board, ui.manage, ui.people, ui.rollSec, ui.clWho, ui.sessionId].join('|');
  if (key !== lastViewKey) { lastViewKey = key; v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in'); }
  afterRender();
  if (typeof syncRoute === 'function') syncRoute();
}
let lastViewKey = '';
function renderBanner() {
  const b = $('#banner');
  let h = '';
  if (S.error) h += `<div class="banner warn"><span>${esc(S.error)}</span><button class="btn btn-sm" data-act="reload">Recarrega</button></div>`;
  if (PREVIEW) h += `<div class="banner"><span>Estàs veient l’app com <b>${esc(S.members.get(PREVIEW.memberId)?.name || '')}</b>. No pots canviar res.</span><button class="btn btn-sm" data-act="preview-off">Torna a l’edició</button></div>`;
  if (S.config.demo && canEdit() && S.mode === 'shared') h += `<div class="banner"><span><b>Dades d’exemple.</b> Quan vulguis començar amb les dades reals, esborra-les.</span><button class="btn btn-sm" data-act="wipe-demo">Esborra l’exemple</button></div>`;
  b.innerHTML = h;
}
const staffSvg = () => `<svg class="staff" viewBox="0 0 120 30" aria-hidden="true"><g stroke="currentColor" stroke-width="1">${[3, 9, 15, 21, 27].map(y => `<line x1="0" x2="120" y1="${y}" y2="${y}"/>`).join('')}</g><g fill="currentColor"><ellipse cx="34" cy="18" rx="4.2" ry="3" transform="rotate(-20 34 18)"/><ellipse cx="60" cy="12" rx="4.2" ry="3" transform="rotate(-20 60 12)"/><ellipse cx="86" cy="6" rx="4.2" ry="3" transform="rotate(-20 86 6)"/></g></svg>`;

function stackBar(c, cls = '') {
  const total = c.P + c.R + c.FJ + c.FNJ + (c.NP || 0) + (c.none || 0);
  if (!total) return `<div class="stack ${cls}"></div>`;
  return `<div class="stack ${cls}" role="img" aria-label="${ORDER.map(k => `${STATUS[k].label}: ${c[k] || 0}`).join(', ')}">${['P', 'R', 'FJ', 'FNJ', 'NP'].map(k => c[k] ? `<span class="s-${k}" style="width:${(c[k] / total) * 100}%"></span>` : '').join('')}</div>`;
}
