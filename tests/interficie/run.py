"""Proves de la interfície: l'app sencera en un Chromium sense pantalla, amb Firebase fals i dades inventades.

Per a cada perfil (administració, cap de corda, cantaire, direcció sense fitxa, professor de cant, gerència) i mida
(mòbil petit, mòbil, ordinador) recorre totes les pantalles i comprova que no hi ha errors ni res que surti de la
pantalla. També comprova el botó «enrere», els enllaços directes a una pantalla, la versió d'ordinador, la vista prèvia
de cada rol, les converses i els recordatoris, l'arxiu de l'assistència, el registre d'errors i que l'app s'obre sense xarxa.

    pip install playwright && python -m playwright install chromium
    python3 tests/interficie/run.py
"""
import functools, http.server, os, sys, tempfile, threading

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build import build  # noqa: E402

SWEEP = open(os.path.join(HERE, "sweep.js"), encoding="utf-8").read()
SMALL = dict(viewport={"width": 320, "height": 700}, is_mobile=True, has_touch=True, device_scale_factor=2)
MOBILE = dict(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True, device_scale_factor=2)
DESKTOP = dict(viewport={"width": 1366, "height": 860})
READY = 'typeof S !== "undefined" && S.ready === true && !!document.querySelector("#view > *")'
# Canvis fets des d'«un altre mòbil» (directament a la base de dades), mentre aquest llegeix per canvis.
DELTA_JS = """async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const F = firebase.firestore(), base = `cors/${GID}`, TS = firebase.firestore.FieldValue.serverTimestamp;
  const out = {};
  const [mid, m] = [...S.members.entries()][0];
  await F.doc(`${base}/members/${mid}`).set({ ...m, name: m.name + ' (canviat)', syncAt: TS() }); await s(300);
  out.canvi = S.members.get(mid).name.endsWith('(canviat)') && !('syncAt' in S.members.get(mid));
  const gone = [...S.members.keys()].pop();
  await F.doc(`${base}/members/${gone}`).delete();
  const cfg = (await F.doc(`${base}/config/main`).get()).data();
  await F.doc(`${base}/config/main`).set({ ...cfg, syncEpoch: { ...(cfg.syncEpoch || {}), members: 'prova' } }); await s(500);
  out.esborrada = !S.members.has(gone);
  const [cid, c] = [...S.classes.entries()][0];
  await F.doc(`${base}/classes/${cid}`).set({ id: cid, date: c.date, teacher: c.teacher, deleted: true, syncAt: TS() }); await s(300);
  out.classeFora = !S.classes.has(cid);
  const [aid, a] = [...S.attendance.entries()][0];
  await F.doc(`${base}/attendance/${aid}`).set({ ...a, syncAt: TS() }); await s(300);
  await F.doc(`${base}/attendance/${aid}`).set({ ...a, marks: { ...a.marks, antiga: { s: 'P' } } }); await s(600);
  out.appAntiga = !!(S.attendance.get(aid).marks || {}).antiga;
  const sess = allSessions().find(x => x.date <= TODAY), mem = membersOf('T')[0];
  setMark(sess, mem, { s: 'R', min: 5 }); flushAll(); await s(500);
  out.marca = !!(await F.doc(`${base}/attendance/${attKey(sess.id, 'T')}`).get()).data().syncAt;
  return out;
}"""
FAILS, PASSES = [], [0]


def check(cond, name, detail=""):
    if cond:
        PASSES[0] += 1
        print(f"  ✓ {name}")
    else:
        FAILS.append(f"{name}{': ' + detail if detail else ''}")
        print(f"  ✗ {name}{': ' + detail if detail else ''}")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=directory))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def open_app(browser, base, user, opts, route=""):
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"error: {e}"))
    page.on("console", lambda m: errors.append(f"consola: {m.text}")
            if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.goto(f"{base}/index.html?u={user}&reset=1{route}")
    page.wait_for_function(READY, timeout=20000)
    # La primera vegada s'obre sola la benvinguda: es tanca amb el seu botó, com faria la persona.
    page.wait_for_timeout(900)
    if page.locator(".sheet").count():
        page.click('.sheet [data-act="sheet-close"]')
        page.wait_for_timeout(400)
    return ctx, page, errors


def switch_user(page, base, user):
    """Una altra persona al mateix navegador: les dades (la base de dades falsa) es conserven."""
    page.goto(f"{base}/index.html?u={user}")
    page.wait_for_function(READY, timeout=20000)
    page.wait_for_timeout(900)
    if page.locator(".sheet").count():
        page.click('.sheet [data-act="sheet-close"]')
        page.wait_for_timeout(400)


def screen(page):
    return page.evaluate("location.hash + ' ' + ui.tab + (document.querySelector('.sheet') ? ' +finestra' : '')")


def main():
    site = build(os.path.join(tempfile.mkdtemp(), "site"))
    srv = serve(site)
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    with sync_playwright() as p:
        browser = p.chromium.launch()

        print("Totes les pantalles, per perfil i mida")
        for user, opts, label in [("pol", SMALL, "320 px"), ("pol", MOBILE, "375 px"), ("pol", DESKTOP, "ordinador"),
                                  ("leader", SMALL, "320 px"), ("singer", SMALL, "320 px"), ("dir", SMALL, "320 px"),
                                  ("prof", SMALL, "320 px"), ("ger", MOBILE, "375 px"), ("dir", DESKTOP, "ordinador")]:
            ctx, page, errors = open_app(browser, base, user, opts)
            res = page.evaluate(SWEEP)
            check(res["vistes"] >= 8, f"{user} a {label}: {res['vistes']} pantalles recorregudes")
            check(not res["desbordaments"], f"{user} a {label}: res no surt de la pantalla", "; ".join(res["desbordaments"][:3]))
            check(not errors, f"{user} a {label}: sense errors", "; ".join(errors[:3]))
            ctx.close()

        print("Ordinador: menú lateral i taules")
        ctx, page, errors = open_app(browser, base, "pol", DESKTOP, "#/gestio/personal")
        box = page.locator(".tabs").bounding_box()
        check(box and box["x"] == 0 and 200 <= box["width"] <= 280 and box["height"] > 600, "el menú de pestanyes és una columna a l'esquerra")
        check(page.locator(".only-wide .dtable").first.is_visible(), "Personal es mostra com a taula")
        check(page.locator(".only-narrow").first.is_hidden(), "la llista del mòbil queda amagada")
        ctx.close()

        print("Botó «enrere»")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/inici")
        page.click('[data-act="tab"][data-tab="calendari"]'); page.wait_for_timeout(300)
        page.click('[data-act="tab"][data-tab="tauler"]'); page.wait_for_timeout(300)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page).startswith("#/calendari calendari"), "enrere torna a la pantalla d'abans", screen(page))
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/calendari calendari", "enrere tanca la finestra oberta i no canvia de pantalla", screen(page))
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.click('.sheet [data-act="sheet-close"]'); page.wait_for_timeout(500)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/inici avisos", "tancar amb la creu no deixa passos de més", screen(page))
        page.click('[data-act="tab"][data-tab="calendari"]'); page.wait_for_timeout(300)
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.click('.acct-item[data-act="manage"]'); page.wait_for_timeout(400)
        check(screen(page) == "#/gestio/avisos gestio", "Gestió s'obre des del menú del compte (a Avisos, si n'hi ha de pendents)", screen(page))
        page.click('[data-act="manage"][data-k="config"]'); page.wait_for_timeout(300)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/gestio/avisos gestio", "dins de Gestió, enrere torna a l'apartat d'abans", screen(page))
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/calendari calendari", "de Gestió, enrere torna a la pantalla d'on s'ha obert", screen(page))
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.click('.acct-item[data-act="manage"]'); page.wait_for_timeout(400)
        page.click(".ph-back .nav-arrow"); page.wait_for_timeout(400)
        check(screen(page) == "#/calendari calendari", "la fletxa de Gestió també hi torna", screen(page))
        check(not errors, "sense errors en navegar", "; ".join(errors[:3]))
        ctx.close()

        print("Menú del compte")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.click("#acct-btn"); page.wait_for_timeout(300)
        check(page.locator(".acct-item .s, .acct-item small, .acct-menu .setting").count() == 0 and page.locator(".acct-item").count() >= 4,
              "cada opció del menú és una fila amb només el títol")
        page.click('.acct-item[data-k="theme"]'); page.wait_for_timeout(300)
        check(page.inner_text(".sheet-h .h2") == "Aparença" and page.locator('.sheet [data-act="theme"]').count() == 3 and page.locator('.sheet [data-act="text-size"]').count() == 3,
              "una fila obre la seva finestra sencera (Aparença: tema i mida del text)")
        page.click(".sheet-up"); page.wait_for_timeout(300)
        check(page.inner_text(".sheet-h .h2") == "El teu compte", "la fletxa torna al menú")
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/inici avisos", "enrere tanca el menú sense passos de més", screen(page))
        check(page.locator("#view .mg, #view [data-act='manage'].mg").count() == 0, "Inici ja no porta el bloc de Gestió")
        ctx.close()
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        page.click("#acct-btn"); page.wait_for_timeout(300)
        check(page.locator('.acct-item[data-act="manage"]').count() == 0, "un cantaire no hi veu Gestió")
        ctx.close()

        print("Enllaços directes")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/ajustos")
        check(page.evaluate("ui.tab + '/' + ui.manage") == "gestio/config", "un enllaç obre Gestió › Ajustos")
        ctx.close()
        ctx, page, errors = open_app(browser, base, "singer", MOBILE, "#/gestio/ajustos")
        check(page.evaluate("ui.tab") == "avisos" and page.evaluate("location.hash") == "#/inici",
              "un cantaire no pot obrir Gestió amb un enllaç")
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia/estadistiques")
        check(page.evaluate("ui.tab + '/' + ui.att") == "llista/stats", "un enllaç obre Assistència › Estadístiques")
        ctx.close()

        print("Lectures: només el que ha canviat")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        first = page.evaluate("({ mode: { ...SYNC.mode }, sizes: DELTA.map(c => S[c].size) })")
        check(set(first["mode"].values()) == {"full"}, "el primer cop es baixa tot", str(first["mode"]))
        page.goto(f"{base}/index.html?u=pol")
        page.wait_for_function(READY, timeout=20000)
        page.wait_for_timeout(800)
        again = page.evaluate("({ mode: { ...SYNC.mode }, sizes: DELTA.map(c => S[c].size) })")
        check(set(again["mode"].values()) == {"delta"} and again["sizes"] == first["sizes"],
              "després només es demana el que ha canviat, i hi continua havent tot", str(again))
        res = page.evaluate(DELTA_JS)
        check(res["canvi"], "un canvi fet en un altre mòbil arriba", str(res))
        check(res["esborrada"], "una fitxa esborrada en un altre mòbil desapareix", str(res))
        check(res["classeFora"], "un dia de classe esborrat en un altre mòbil desapareix", str(res))
        check(res["appAntiga"], "el que desa una app antiga (sense hora del servidor) també arriba", str(res))
        check(res["marca"], "cada marca de la llista porta l'hora del servidor", str(res))
        check(page.evaluate("S.memberMarks === undefined && S.push.size === 0"), "no es llegeixen les còpies antigues ni els aparells amb avisos")
        check(not errors, "sense errors en llegir per canvis", "; ".join(errors[:3]))
        ctx.close()

        print("Un dia nou")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.evaluate("""() => { window.__marca = 1; const R = Date, t = R.now() + 864e5;
          window.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; }""")
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.evaluate("checkNewDay()")
        check(page.evaluate("window.__marca === 1"), "amb una finestra oberta, no es recarrega")
        page.click('.sheet [data-act="sheet-close"]'); page.wait_for_timeout(400)
        with page.expect_navigation(timeout=10000):
            page.evaluate("setTimeout(checkNewDay, 0)")
        page.wait_for_function(READY, timeout=20000)
        check(page.evaluate("window.__marca === undefined"), "si en tornar-hi ja és un altre dia, l'app es recarrega sola")
        ctx.close()

        print("Instal·lar l'app")
        IPHONE = dict(MOBILE, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
        ctx, page, errors = open_app(browser, base, "singer", IPHONE)
        check(page.locator(".install-card").count() == 1 and "Comparteix" in page.inner_text(".install-card"), "a l'iPhone, Inici explica com posar l'app a la pantalla d'inici")
        page.click('[data-act="install-hide"]'); page.wait_for_timeout(300)
        check(page.locator(".install-card").count() == 0, "«Ara no» l'amaga")
        check(not errors, "sense errors a la guia d'instal·lació", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", DESKTOP)
        check(page.locator(".install-card").count() == 0, "a l'ordinador no surt")
        ctx.close()

        print("Importador d'horaris i aula")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""() => { const p = parseSchedule(['Dilluns — Matí Aula 2 Petit Palau', '', '10:40 –11:20 Anna Puig',
            'Dimecres  — Tarda  Aula 11 Espai Palau', '17:40–18:20 Laia Ferrer'].join('\\n'), 1);
          return { rows: p.rows.map(x => `${x.day} ${hhmm(x.from)} ${x.sure ? 'ok' : 'no'}`), places: p.places }; }""")
        check(r["rows"] == ["1 10:40 ok", "3 17:40 ok"], "l'importador entén la llista del WhatsApp", str(r))
        check(r["places"] == {"1": "Aula 2 Petit Palau", "3": "Aula 11 Espai Palau"}, "i en treu l'aula de cada dia", str(r))
        got = page.evaluate("""async () => { const who = teacherOptions()[0].key, rows = [{ day: 1, from: 600, mins: 40, memberId: membersOf('S')[0].id }];
          const dates = classDates('2026-10-05', '2026-10-12', [1], ''); await writeClassDays(dates, rows, who, { 1: 'Aula 2' });
          return dates.map(d => [...S.classes.values()].find(c => c.date === d && c.teacher === who)?.place); }""")
        check(got == ["Aula 2", "Aula 2"], "cada dia de classe generat porta l'aula", str(got))
        check(not errors, "sense errors a l'importador", "; ".join(errors[:3]))
        ctx.close()

        print("Repertori, pla d'assaig i concerts")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          ui.tab = 'tauler'; ui.board = 'materials'; ui.matProd = 'p1'; render(); await s(200);
          out.works = document.querySelectorAll('#view .work').length;
          sheetSession('s4'); await s(200); document.querySelector('#se-save').click(); await s(200);
          out.planKept = !!sessionById('s4').plan && sessionById('s4').plan.items.length === 2;
          out.planText = planHtml(sessionById('s4')).includes('Gloria');
          const bal = concertBalance(sessionById('s6'));
          out.tenorsShort = bal.find(b => b.x.id === 'T').short && todoItems().some(x => x.icon === 'voices');
          updateSession('s6', { seating: { rows: autoSeating(sessionById('s6'), 2) } }); await s(100);
          out.seat = !!mySeat(sessionById('s6'), myMemberId());
          await loadProfiles();
          const t = participantRows(sessionById('s6'), true, new Set(['sec', 'phone', 'emerg', 'size']));
          out.participants = t.rows.length === 4 && t.rows.some(x => x.includes('600000001') && x.includes('L'));
          out.cert = certificateHtml({ m: S.members.get(myMemberId()), from: seasonCfg().season.from, to: seasonCfg().season.to, label: 'la temporada', signer: 'X', role: 'Secretaria', place: 'Barcelona' }).includes('CERTIFICA');
          const f = await seasonFigures();
          out.season = f.active === 16 && seasonRows(f).length > 20;
          out.norm = /Et pots permetre|No et pots permetre|assegurat/.test(normHint(S.members.get(myMemberId()), 'p1'));
          out.week = timetableHtml([{ label: 'Dilluns', sub: 'Aula 2', cells: { '17:00': 'Anna' } }]).includes('Aula 2');
          return out;
        }""")
        for k, label in [("works", "el Repertori mostra les obres de la producció"), ("planKept", "editar una sessió no n'esborra el pla d'assaig"),
                         ("planText", "el pla d'assaig es mostra amb les obres"), ("tenorsShort", "l'equilibri de veus avisa si una corda no arriba al mínim"),
                         ("seat", "la col·locació diu a cadascú el seu lloc"), ("participants", "la llista de participants porta el telèfon, la talla i l'emergència"),
                         ("cert", "el certificat d'assistència es genera"), ("season", "la memòria de la temporada té les xifres"),
                         ("norm", "el cantaire veu quantes faltes es pot permetre"), ("week", "l'horari per imprimir porta l'aula")]:
            check(r.get(k) if k != "works" else r.get(k, 0) >= 1, label, str(r))
        check(not errors, "sense errors al repertori i als concerts", "; ".join(errors[:3]))
        ctx.close()

        print("Sortides, fitxa pròpia i notificacions")
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.todoTrip = todoItems().some(x => x.icon === 'trip');
          tripAnswer('t1', 'yes', 'Vaig pel meu compte'); flushAll(); await s(300);
          out.signed = S.tripSignups.get(`t1_${myMemberId()}`)?.answer === 'yes' && !todoItems().some(x => x.icon === 'trip');
          sheetMyProfile(); await s(300);
          document.querySelector('#pf-phone').value = '611222333'; document.querySelector('#pf-size .pick[data-k="M"]').click();
          document.querySelector('#pf-save').click(); await s(300);
          out.profile = (await firebase.firestore().doc(`cors/${GID}/profiles/${myMemberId()}`).get()).data()?.size === 'M';
          await firebase.firestore().doc(`cors/${GID}/rsvp/s6_${myMemberId()}`).delete();
          return out;
        }""")
        check(r["todoTrip"], "«Per fer» demana si t'apuntes a la sortida", str(r))
        check(r["signed"], "el cantaire s'apunta a la sortida", str(r))
        check(r["profile"], "el cantaire omple la seva fitxa", str(r))
        page.goto(f"{base}/index.html?u=singer&accio=rsvp-yes&s=s6")
        page.wait_for_function(READY, timeout=20000)
        page.wait_for_timeout(1500)
        check(page.evaluate("S.rsvp.get(`s6_${myMemberId()}`)?.answer === 'yes' && !location.search.includes('accio')"), "el botó «Hi seré» de la notificació confirma sense passos de més")
        page.goto(f"{base}/index.html?u=singer&accio=absence&s=s4")
        page.wait_for_function(READY, timeout=20000)
        page.wait_for_timeout(1500)
        check(page.evaluate("document.querySelector('.sheet-h .h2')?.textContent") == "Avís d’absència", "el botó «No hi podré anar» obre l'avís d'absència")
        check(not errors, "sense errors a les sortides i a la fitxa", "; ".join(errors[:3]))
        ctx.close()

        print("Missatges, notes de seguiment i secretaria")
        ctx, page, errors = open_app(browser, base, "leader", MOBILE)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.button = !!document.querySelector('#view [data-act="msg-new"]');
          sheetMessage(); await s(200);
          document.querySelector('#mg-body').value = 'Tenors, assaig parcial dijous a les 19 h.';
          document.querySelector('#mg-send').click(); await s(200); flushAll(); await s(300);
          out.sent = [...S.messages.values()].some(m => m.body.startsWith('Tenors, assaig') && m.to.length === 1 && m.to[0] === 'T');
          const tenor = membersOf('T').find(m => m.id !== myMemberId());
          sheetMemberStats(tenor.id); await s(600);
          out.track = !!document.querySelector('#ms-track #tn-text');
          document.querySelector('#tn-text').value = 'Bona evolució als aguts'; document.querySelector('#tn-save').click(); await s(400);
          out.note = (await firebase.firestore().collection(`cors/${GID}/memberNotes`).where('memberId', '==', tenor.id).get()).docs.some(d => d.data().section === 'T');
          return out;
        }""")
        check(r["button"], "el cap de corda té «Missatge a la corda» a Inici", str(r))
        check(r["sent"], "el missatge del cap de corda va només a la seva corda", str(r))
        check(r["track"] and r["note"], "el cap de corda escriu notes de seguiment dels de la seva corda", str(r))
        check(not errors, "sense errors als missatges del cap de corda", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        r = page.evaluate("""() => ({ mine: messagesForMe().map(m => m.id).sort().join(','), todo: todoItems().some(x => x.icon === 'msg'), write: canMessage(),
          track: canTrack(S.members.get(myMemberId())), block: !!document.querySelector('#view .msgs') })""")
        check(r["mine"] == "g1", "una soprano rep el missatge a tothom i no el dels tenors", str(r))
        check(r["todo"] and r["block"], "els missatges nous surten a Inici i a «Per fer»", str(r))
        check(not r["write"] and not r["track"], "un cantaire no escriu missatges ni veu notes de seguiment", str(r))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "ger", MOBILE)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          let csv = ''; window.offerFile = (name, text) => { csv = text; };
          ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'docs'; render(); await s(700);
          out.docs = document.querySelector('#view').innerText.includes('No poden sortir a fotos');
          out.noImg = document.querySelector('#view').innerText.includes('Anna Puig');
          const m = membersOf('B')[0];
          await markFeePaid(m.id); await s(200);
          out.fee = docsOf(m.id).fees[feeKey()].paid === true && docsOf(m.id).fees[feeKey()].amount === 120;
          sheetMember(m.id); await s(300);
          const act = document.querySelector('#me-active'); act.checked = false; act.dispatchEvent(new Event('change'));
          out.moveShown = !document.querySelector('#me-move').hidden;
          document.querySelector('#me-move-note').value = 'Estudis a fora';
          document.querySelector('#me-save').click(); await s(300);
          const h = S.members.get(m.id).history || [];
          out.history = h.some(x => x.kind === 'baixa' && x.note === 'Estudis a fora');
          await exportRoster(); await s(200);
          out.csv = csv.includes('Data d’alta') && csv.includes('Antiguitat') && csv.includes('Drets d’imatge');
          ui.people = 'altes'; render(); await s(200);
          out.altes = document.querySelector('#view').innerText.includes('Baixes aquesta temporada');
          return out;
        }""")
        for k, label in [("docs", "Personal › Documents mostra qui no pot sortir a fotos"), ("noImg", "hi surt qui ha dit que no a les fotos"),
                         ("fee", "es marca una quota com a pagada"), ("moveShown", "en desactivar algú, es demana la data i el motiu de la baixa"),
                         ("history", "la baixa queda a l'historial"), ("csv", "la plantilla s'exporta a Excel amb l'antiguitat i els documents"),
                         ("altes", "Personal › Altes i baixes té les xifres de la temporada")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a secretaria", "; ".join(errors[:3]))
        ctx.close()

        print("Cerca, text gran, desfer, cartells i llista completa")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.click("#search-btn"); page.wait_for_timeout(300)
        page.fill("#sr-q", "anna"); page.wait_for_timeout(400)
        check(page.locator(".sr-g h3").first.inner_text().upper().startswith("PERSONES") and "Anna Puig" in page.inner_text(".sr-list"), "la cerca troba persones")
        page.fill("#sr-q", "gloria"); page.wait_for_timeout(400)
        check("REPERTORI" in page.inner_text("#sr-res").upper(), "la cerca troba obres del repertori")
        page.fill("#sr-q", "montserrat"); page.wait_for_timeout(400)
        check("SORTIDES" in page.inner_text("#sr-res").upper(), "la cerca troba sortides")
        page.fill("#sr-q", "anna"); page.wait_for_timeout(400)
        page.click(".sr-i"); page.wait_for_timeout(500)
        check(page.inner_text(".sheet-h .h2") == "Anna Puig", "un resultat obre la fitxa")
        page.click('.sheet [data-act="sheet-close"]'); page.wait_for_timeout(300)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          sheetAnnouncement('n1'); await s(300); document.querySelector('#an-del').click(); await s(200);
          out.undoShown = !S.announcements.has('n1') && /Desf/i.test(document.querySelector('.toast')?.innerText || '');
          document.querySelector('#toast-act').click(); await s(300);
          out.undone = S.announcements.has('n1');
          out.poster = !!document.querySelector('#view .poster-th img');
          ui.tab = 'calendari'; render(); await s(200); out.posterCal = !!document.querySelector('.cal-prod-h .poster-th');
          sheetSessionInfo('s6'); await s(300); out.posterConcert = !!document.querySelector('.sheet .poster-banner img'); closeSheet(); await s(200);
          setTextSize('molt'); await s(100);
          out.text = getComputedStyle(document.documentElement).getPropertyValue('--ts').trim() === '1.3' && localStorage.getItem('atempo:text') === 'molt';
          const probe = document.createElement('p'); probe.className = 'muted'; probe.style.fontSize = 'calc(13px*var(--ts))'; document.body.appendChild(probe);
          out.bigger = Math.round(parseFloat(getComputedStyle(probe).fontSize)) === 17; probe.remove();
          setTextSize(''); await s(100);
          return out;
        }""")
        for k, label in [("undoShown", "esborrar un anunci ofereix «Desfés» en lloc de preguntar"), ("undone", "«Desfés» el recupera"),
                         ("poster", "el cartell surt a Inici"), ("posterCal", "el cartell surt al calendari"), ("posterConcert", "el cartell surt a la fitxa del concert"),
                         ("text", "Aparença › Mida del text es desa i s'aplica"), ("bigger", "amb «Molt gran» el text creix un 30 %")]:
            check(r.get(k), label, str(r))
        page.evaluate("ui.tab = 'llista'; ui.sessionId = allSessions().find(x => x.date === TODAY).id; ui.section = 'T'; ui.rollSec = 'T'; render()")
        page.wait_for_timeout(300)
        for i in range(page.locator('#roster .row').count()):
            page.locator('#roster .row').nth(i).locator('[data-act="mark"][data-s="P"]').click(); page.wait_for_timeout(150)
        check("is-done" in (page.get_attribute("#secbar-count", "class") or "") and "completa" in page.inner_text("#toast-root"), "en acabar la llista surt la confirmació")
        check(not errors, "sense errors a la cerca, el text gran i el desfer", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", SMALL)
        page.evaluate("setTextSize('molt')")
        res = page.evaluate(SWEEP)
        check(not res["desbordaments"], f"amb el text «Molt gran», a 320 px res no surt de la pantalla ({res['vistes']} pantalles)", "; ".join(res["desbordaments"][:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", DESKTOP)
        g = page.locator(".tabs .tab-extra")
        check(g.is_visible() and "Gestió" in g.inner_text(), "a l'ordinador, Gestió és al menú lateral")
        g.click(); page.wait_for_timeout(400)
        check(page.evaluate("location.hash").startswith("#/gestio/"), "i l'obre", page.evaluate("location.hash"))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        check(page.locator(".tabs .tab-extra").is_hidden(), "al mòbil, Gestió continua al menú del compte")
        ctx.close()

        print("Gestió › Personal: el desplegable dels rols i les llistes de la plantilla")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        check(page.evaluate("S.staff.size === 0 && !S.staffReady"), "a Inici encara no es llegeix el personal (només quan s'obre Gestió)")
        page.evaluate("ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'singer'; render()")
        page.wait_for_function("S.staffReady && S.staff.size === 6", timeout=5000)
        page.wait_for_timeout(300)
        opts = page.evaluate("[...document.querySelectorAll('#people-menu option')].map(o => o.value)")
        check(page.locator("select#people-menu").count() == 1 and opts[:2] == ["singer", "access"] and {"director", "gerencia", "secretaria", "leader", "voice"} <= set(opts), "els rols són en un desplegable", str(opts))
        tabs = page.evaluate("[...document.querySelectorAll('[data-act=\"cant-tab\"]')].map(b => b.textContent)")
        check(tabs == ["Plantilla", "Altes i baixes", "Documents", "Quotes"], "dins dels cantaires: Plantilla, Altes i baixes, Documents i Quotes", str(tabs))
        page.select_option("#people-menu", "director"); page.wait_for_timeout(300)
        check("Dídac Director" in page.inner_text("#view") and page.locator('[data-act="cant-tab"]').count() == 0, "triar Direcció mostra qui en fa")
        page.select_option("#people-menu", "singer"); page.wait_for_timeout(300)
        page.click('[data-act="cant-tab"][data-k="quotes"]'); page.wait_for_timeout(600)
        check("han pagat" in page.inner_text("#view"), "Quotes s'obre dins dels cantaires")
        check(not errors, "sense errors al menú de Personal", "; ".join(errors[:3]))
        ctx.close()

        print("Mira l'app com…")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        page.click('[data-act="preview-on"]'); page.wait_for_timeout(400)
        roles = page.evaluate("[...document.querySelectorAll('#pv-role .pick')].map(b => b.dataset.k)")
        check(roles == ["singer", "leader", "director", "gerencia", "secretaria", "voice"], "es pot mirar com cada rol", str(roles))
        page.click('#pv-role .pick[data-k="director"]'); page.wait_for_timeout(200)
        page.click("#pv-ok"); page.wait_for_timeout(500)
        r = page.evaluate("({ edit: canEdit(), admin: isAdmin(), banner: document.querySelector('.preview-banner')?.innerText || '', ro: document.body.classList.contains('ro') })")
        check(r["edit"] and not r["admin"] and "Direcció" in r["banner"] and "Dídac" in r["banner"], "com la direcció: pot editar, però no administrar", str(r))
        before = page.evaluate("firebase.firestore().doc(`cors/${GID}/announcements/n1`).get().then(d => JSON.stringify(d.data()))")
        page.evaluate("persist('announcements', 'n1', { ...S.announcements.get('n1'), title: 'Canviat a la vista prèvia' })")
        page.evaluate("db.doc('announcements/n1').set({ title: 'x' }).catch(() => {})")
        page.wait_for_timeout(700)
        after = page.evaluate("firebase.firestore().doc(`cors/${GID}/announcements/n1`).get().then(d => JSON.stringify(d.data()))")
        check(before == after and "Vista prèvia" in page.inner_text("#toast-root"), "a la vista prèvia no es desa res", after[:80])
        with page.expect_navigation(timeout=10000):
            page.click('[data-act="preview-off"]')
        page.wait_for_function(READY, timeout=20000)
        page.wait_for_timeout(400)
        check(page.evaluate("PREVIEW === null && isAdmin()"), "en sortir-ne, tot torna a ser com abans")
        r = page.evaluate("""() => { startPreview({ roles: ['voice'], email: 'prof@exemple.cat', name: 'Prat, Berta', label: 'Professor de cant' });
          const out = { teach: teachesClasses(), edit: canEdit(), tabs: tabsForRole() }; stopPreview();
          const anna = previewPeople('singer').find(x => x.label.startsWith('Anna'));
          startPreview({ ...anna.person, label: 'Cantaire' }); out.singerEdit = canEdit(); out.me = myId(); out.gestio = !!document.querySelector('.tabs .tab-extra');
          stopPreview(); out.back = ui.tab === 'gestio' && isAdmin(); return out; }""")
        check(r["teach"] and not r["edit"] and "classes" in r["tabs"], "com el professor de cant: porta les classes i no edita res més", str(r))
        check(not r["singerEdit"] and r["me"] and not r["gestio"], "com un cantaire: veu el seu espai i no Gestió", str(r))
        check(r["back"], "i se'n torna a Gestió", str(r))
        check(not errors, "sense errors a la vista prèvia", "; ".join(errors[:3]))
        ctx.close()

        print("Converses privades i recordatoris per l'app")
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.targets = threadTargets().map(t => t.k);
          sheetThreadNew(); await s(300);
          document.querySelector('#th-to .pick[data-i="1"]').click();
          document.querySelector('#th-subject').value = 'Al·lèrgies';
          document.querySelector('#th-text').value = 'Soc celíaca.';
          document.querySelector('#th-send').click(); await s(500);
          out.sent = [...S.threads.values()].some(t => t.toRole === 'gerencia' && t.msgs[0].text === 'Soc celíaca.');
          ui.tab = 'tauler'; ui.board = 'anuncis'; render(); await s(200);
          out.replyBtn = !!document.querySelector('#view [data-act="reply"][data-ref="ann:n1"]');
          return out; }""")
        check(r["targets"] == ["director", "gerencia", "t:prof@exemple.cat", "admin"], "un cantaire pot escriure a la direcció, la gerència, el seu professor de cant o l'administració", str(r))
        check(r["sent"], "el missatge queda desat", str(r))
        check(r["replyBtn"], "es pot respondre a qui ha escrit un anunci", str(r))
        switch_user(page, base, "ger")
        page.wait_for_timeout(300)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.todo = todoItems().some(x => x.icon === 'thread');
          const t = [...S.threads.values()][0]; sheetThread(t.id); await s(500);
          out.read = !!(await firebase.firestore().doc(`cors/${GID}/threads/${t.id}`).get()).data().readS;
          document.querySelector('#th-text').value = 'Apuntat, gràcies!'; document.querySelector('#th-send').click(); await s(500);
          out.reply = (await firebase.firestore().doc(`cors/${GID}/threads/${t.id}`).get()).data().msgs.length === 2;
          return out; }""")
        check(r["todo"], "a la gerència li surt a «Per fer»", str(r))
        check(r["read"] and r["reply"], "la gerència la llegeix i hi respon", str(r))
        check(not errors, "sense errors a les converses de l'equip", "; ".join(errors[:3]))
        switch_user(page, base, "singer")
        page.wait_for_timeout(300)
        check(page.evaluate("unreadThreads().length === 1 && todoItems().some(x => x.icon === 'thread')"), "el cantaire veu que li han respost")
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          remindPoll('q1'); await s(400); document.querySelector('#rm-push').click(); await s(500);
          const n = (await firebase.firestore().collection(`cors/${GID}/nudges`).get()).docs.map(d => d.data());
          return { n: n.length, ids: n[0]?.memberIds.length, kind: n[0]?.kind }; }""")
        check(r["n"] == 1 and r["kind"] == "poll" and r["ids"] == 15, "«Recorda-ho» envia un avís al mòbil de qui encara no ha respost l'enquesta", str(r))
        check(not errors, "sense errors als recordatoris", "; ".join(errors[:3]))
        ctx.close()

        print("Anuncis llargs, sortides amb preguntes, convocatòries amb autocar i voluntaris, pla per blocs i la setmana")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const body = 'RESUM ASSAJOS\\nDilluns vam treballar:\\n* Nº 2 Banish sorrow\\n* Nº 4 When monarchs unite\\n\\n' + 'Text llarg. '.repeat(80);
          S.announcements.set('n2', { id: 'n2', title: 'Informacions de la setmana', body, author: 'Pablo', by: 'dir@exemple.cat', createdAt: new Date().toISOString(),
            files: [{ id: 'f1', title: 'Formulari del cap de setmana', url: 'https://example.com/form' }] });
          persist('announcements', 'n2', S.announcements.get('n2'), 10);
          ui.tab = 'tauler'; ui.board = 'anuncis'; render(); await s(300);
          const card = document.querySelector('[data-ann="n2"]');
          out.rich = !!card.querySelector('.rich h4') && card.querySelectorAll('.rich li').length === 2 && !!card.querySelector('[data-act="ann-read"]') && !!card.querySelector('.attach a');
          const t = clone(S.trips.get('t1')); t.questions = [{ id: 'q', label: 'Dinaràs dissabte?', options: ['Sí', 'No'] }]; saveTrip(t);
          updateSession('s6', { bus: true, tasks: [{ id: 'k1', label: 'Carregar el material', need: 4 }], info: { steps: [{ time: '17:30', what: 'Recollida de material', where: 'Espai Palau' }, { time: '18:00', what: 'Sortida de l’autocar', where: 'Trafalgar amb Ortigosa' }] } });
          updateSession('s5', { plan: { items: [{ id: 'h1', kind: 'head', time: '20:30', title: 'Parcial', who: 'S,C', where: 'Auditori', lead: 'Mateo i Paul' }, { id: 'i1', kind: '', title: 'Nº 16', mins: 20 },
            { id: 'h2', kind: 'head', time: '20:30', title: 'Parcial', who: 'T,B', where: 'Aula 1 PP', lead: 'Pablo' }, { id: 'i2', kind: '', title: 'Nº 20', mins: 20 },
            { id: 'b1', kind: 'break', time: '21:30', mins: 15 }, { id: 'h3', kind: 'head', time: '21:45', title: 'Tutti' }, { id: 'i3', kind: '', title: 'Nº 14' }] } });
          flushAll(); await s(500);
          out.steps = fitxaHtml(sessionById('s6')).includes('Horari del dia') && fitxaHtml(sessionById('s6')).includes('Recollida de material');
          return out; }""")
        check(r["rich"], "un anunci llarg té format, adjunts i «Llegeix-lo sencer»", str(r))
        check(r["steps"], "la fitxa del concert porta l'horari del dia", str(r))
        check(not errors, "sense errors en preparar-ho", "; ".join(errors[:3]))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          sheetTripSignup('t1'); await s(300);
          document.querySelector('.pickers[data-q="q"] .pick[data-v="Sí"]').click(); document.querySelector('#ts-ok').click(); await s(300); flushAll(); await s(300);
          out.trip = S.tripSignups.get(`t1_${myMemberId()}`)?.answers?.q === 'Sí';
          sheetMyProfile(); await s(400); document.querySelector('#pf-diet').value = 'Celíaca'; document.querySelector('#pf-save').click(); await s(400);
          out.diet = (await firebase.firestore().doc(`cors/${GID}/profiles/${myMemberId()}`).get()).data()?.diet === 'Celíaca';
          rsvpAnswer('s6', 'yes'); await s(200);
          ui.tab = 'avisos'; render(); await s(200);
          const bus = document.querySelector('[data-act="rsvp-bus"][data-k="bus"]');
          out.busAsked = !!bus; bus?.click(); await s(200);
          document.querySelector('[data-act="rsvp-task"][data-k="k1"]')?.click(); await s(200); flushAll(); await s(300);
          const a = S.rsvp.get(`s6_${myMemberId()}`);
          out.bus = a?.transport === 'bus'; out.task = (a?.tasks || []).includes('k1');
          const plan = planHtml(sessionById('s5'), false, 'S');
          out.plan = plan.includes('Auditori') && !plan.includes('Aula 1 PP') && plan.includes('Tutti') && plan.includes('Mostra tot el pla');
          sheetWeek(); await s(300);
          const wk = document.querySelector('.sheet .week')?.innerText || '';
          out.week = wk.includes('QUÈ FAREM') || wk.includes('Què farem');
          out.weekPlan = wk.includes('Gloria');
          return out; }""")
        for k, label in [("trip", "el cantaire respon les preguntes de la sortida"), ("diet", "el cantaire posa les seves al·lèrgies a la fitxa"),
                         ("busAsked", "en confirmar un concert amb autocar, es pregunta com hi va"), ("bus", "i queda desat que va amb l'autocar"),
                         ("task", "el cantaire s'apunta de voluntari a carregar el material"), ("plan", "el cantaire veu el seu parcial (i pot veure tot el pla)"),
                         ("week", "«La setmana» es pot obrir"), ("weekPlan", "«La setmana» porta el pla dels pròxims assajos")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors al cantaire", "; ".join(errors[:3]))
        switch_user(page, base, "pol")
        r = page.evaluate("""async () => { const out = {};
          await loadProfiles();
          const rows = tripRows(S.trips.get('t1'));
          out.tripXls = rows[0].includes('Dinaràs dissabte?') && rows[0].includes('Al·lèrgies i intoleràncies') && rows.some(x => x.includes('Celíaca') && x.includes('Sí'));
          out.tasks = taskPeople(sessionById('s6'), 'k1').length === 1 && rsvpPanel(sessionById('s6')).includes('Autocar: <b>1</b>');
          return out; }""")
        check(r["tripXls"], "l'Excel de la sortida porta les respostes i les al·lèrgies", str(r))
        check(r["tasks"], "l'equip veu qui va amb autocar i qui s'ha apuntat de voluntari", str(r))
        check(not errors, "sense errors a l'equip", "; ".join(errors[:3]))
        ctx.close()

        print("Arxiu de l'assistència per trimestres")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.wait_for_function("SYNC.mode.attendance === 'full' && SYNC.got.attendance != null", timeout=10000)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const cur = [...S.attendance.keys()].find(k => k.startsWith('s0_'));
          out.before = S.attendance.has('v0_T');
          await archiveTerms(); await s(1200);
          out.cut = archCut(); out.ids = (S.config.attArchive || {}).ids || [];
          out.old = !S.attendance.has('v0_T') && Object.keys(attDoc('v0', 'T')?.marks || {}).length === 4;
          out.cur = S.attendance.has(cur) && !!S.attendance.get(cur).date;
          const first = (await firebase.firestore().doc(`cors/${GID}/attArchive/${out.ids[0]}`).get()).data();
          out.inArchive = !!first.docs.v0_T && first.docs.v0_T.date === sessionById('v0').date;
          const m = membersOf('T')[0]; setMark(sessionById('v0'), m, { s: 'FJ', note: 'Correcció' }); flushAll(); await s(600);
          const again = (await firebase.firestore().doc(`cors/${GID}/attArchive/${out.ids[0]}`).get()).data();
          out.fixed = again.docs.v0_T.marks[m.id].s === 'FJ' && effMark(sessionById('v0'), m).s === 'FJ';
          out.stats = computeStats({ kind: 'prod', id: 'p0', name: 'Temporada passada' }).counted.length === 3;
          return out; }""")
        check(r["before"] and r["cut"] and r["cut"] >= page.evaluate("sessionById('v2').date"), "els trimestres acabats s'arxiven", str(r))
        check(r["old"], "les llistes arxivades es llegeixen de l'arxiu", str(r))
        check(r["cur"], "les d'ara continuen sent llistes normals (amb la data)", str(r))
        check(r["inArchive"], "l'arxiu té cada llista amb la data de la sessió", str(r))
        check(r["fixed"], "corregir una llista arxivada també corregeix l'arxiu", str(r))
        check(r["stats"], "les estadístiques d'una temporada arxivada surten igual", str(r))
        check(not errors, "sense errors a l'arxiu", "; ".join(errors[:3]))
        ctx.close()

        print("Registre d'errors")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.evaluate("setTimeout(() => { funcioQueNoExisteix(); }, 0)")
        page.wait_for_timeout(2500)
        notes = page.evaluate("firebase.firestore().collection('errors').get().then(s => s.docs.map(d => d.data()))")
        print("Obre a Inici en un mòbil nou")
        ctx2, page2, _ = open_app(browser, base, "leader", MOBILE)
        check(page2.evaluate("ui.tab") == "avisos" and page2.evaluate("location.hash") == "#/inici", "en un mòbil nou, l'app s'obre a Inici")
        ctx2.close()
        check(len(notes) == 1 and "funcioQueNoExisteix" in notes[0]["msg"], "un error de l'app deixa una nota", str(notes)[:200])
        check(all(set(n) <= {"kind", "msg", "where", "at", "app", "gid", "route", "ua", "online"} for n in notes), "la nota no porta res més del que permeten les regles")
        ctx.close()

        print("Sense cobertura")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.wait_for_function("!!navigator.serviceWorker.controller", timeout=20000)
        page.wait_for_function("caches.keys().then(k => k.some(x => x.startsWith('atempo-') && x !== 'atempo-runtime'))", timeout=20000)
        # Una càrrega amb el treballador ja actiu, perquè tot el que fa servir la pàgina quedi desat.
        page.reload()
        page.wait_for_function(READY, timeout=20000)
        page.wait_for_timeout(1500)
        srv.shutdown()
        ctx.set_offline(True)
        page.reload()
        try:
            page.wait_for_function(READY, timeout=20000)
            ok = "Hola" in page.inner_text("#view")
        except Exception as e:
            ok = False
            print("   ", e)
        check(ok, "l'app s'obre sense xarxa amb la darrera versió desada", page.evaluate("location.hash + ' ' + (document.querySelector('#view')?.innerText || '').slice(0, 80)") if not ok else "")
        ctx.close()
        browser.close()
    print()
    print(f"{PASSES[0]} correctes · {len(FAILS)} errors")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
