"""Proves de la interfície: l'app sencera en un Chromium sense pantalla, amb Firebase fals i dades inventades.

Per a cada perfil (administració, cap de corda, cantaire, direcció sense fitxa, professor de cant, gerència) i mida
(mòbil petit, mòbil, ordinador) recorre totes les pantalles i comprova que no hi ha errors ni res que surti de la
pantalla. També comprova el botó «enrere», els enllaços directes a una pantalla, la versió d'ordinador, la vista prèvia
de cada rol, les converses i els recordatoris, l'arxiu de l'assistència, el registre d'errors i que l'app s'obre sense xarxa.

    pip install playwright && python -m playwright install chromium
    python3 tests/interficie/run.py
"""
import functools, http.server, json, os, sys, tempfile, threading

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


def _test_pdf(n=2):
    """Un PDF petit de n pàgines, fet a mà, per provar el visor."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(f"{3 + 2 * i} 0 R" for i in range(n)), n)]
    for i in range(n):
        c = f"BT /F1 48 Tf 72 700 Td (Pagina {i + 1}) Tj ET"
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {4 + 2 * i} 0 R /Resources << /Font << /F1 {3 + 2 * n} 0 R >> >> >>")
        objs.append(f"<< /Length {len(c)} >>\nstream\n{c}\nendstream")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs):
        offs.append(len(out))
        out += f"{i + 1} 0 obj\n{o}\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    return out + f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n"


TEST_PDF = _test_pdf()


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
        check(page.locator(".install-card").count() == 1 and page.locator(".install-card").bounding_box()["height"] < 70, "a l'iPhone, Inici té una sola línia per posar l'app a la pantalla d'inici")
        page.click('.install-card .install-go'); page.wait_for_timeout(400)
        check("Comparteix" in page.inner_text(".sheet"), "en tocar-la, explica com fer-ho")
        page.click('.sheet [data-act="sheet-close"]'); page.wait_for_timeout(400)
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

        print("Afegir persones: cada persona un sol cop")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const type = (q, v) => { const e = document.querySelector(q); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
          const fake = () => JSON.parse(localStorage.getItem('fake:db')), st = e => fake()[`cors/${GID}/staff/${e}`];
          ui.people = 'singer'; ui.cantTab = 'plantilla'; render(); await s(200);
          document.querySelector('.access-acts [data-act="staff-new"]').click(); await s(300);
          out.title = document.querySelector('.sheet-h .h2').textContent === 'Afegeix una persona' && !!document.querySelector('#ps-email');
          type('#ps-name', 'Soler, Marta'); await s(50);
          out.auto = document.querySelector('#ps-mem').value === 'mS2' && document.querySelector('#ps-new').hidden;
          type('#ps-email', 'marta@exemple.cat');
          const n = S.members.size;
          document.querySelector('#ps-save').click(); await s(700);
          out.noDup = S.members.size === n && st('marta@exemple.cat')?.memberId === 'mS2';
          out.invite = /ja pot entrar/.test(document.querySelector('.sheet-h .h2')?.textContent || '');
          closeSheet(); await s(300);
          sheetPerson(null, { roles: ['singer'], section: 'C' }); await s(300);
          type('#ps-name', 'Riba, Queralt'); type('#ps-email', 'queralt@exemple.cat');
          document.querySelector('#ps-save').click(); await s(700);
          const q = st('queralt@exemple.cat');
          out.fresh = !!q && S.members.get(q.memberId)?.section === 'C' && S.members.size === n + 1;
          closeSheet(); await s(300);
          sheetPerson(null, { roles: ['admin'] }); await s(300);
          type('#ps-name', 'Gemma Gerent'); type('#ps-email', 'ger@exemple.cat');
          document.querySelector('#ps-save').click(); await s(700);
          out.merge = st('ger@exemple.cat').roles.join() === 'admin,gerencia';
          const clara = [...S.members.values()].find(m => m.name === 'Clara Vila');
          sheetMember(clara.id); await s(300);
          type('#me-email', 'clara@exemple.cat'); document.querySelector('#me-leader').checked = true;
          document.querySelector('#me-save').click(); await s(700);
          const c = st('clara@exemple.cat');
          out.fromCard = c?.memberId === clara.id && c.roles.join() === 'leader,singer' && c.section === 'S' && S.members.get(clara.id).leader === true;
          closeSheet(); await s(300);
          sheetMember(clara.id); await s(300);
          document.querySelector('#me-leader').checked = false; document.querySelector('#me-save').click(); await s(700);
          out.leaderOff = st('clara@exemple.cat').roles.join() === 'singer' && !S.members.get(clara.id).leader;
          sheetPeopleBulk('B'); await s(300);
          type('#pb-text', 'Pere Font — pere@exemple.cat\\nVidal, Roc\\troc@exemple.cat\\nSerra, Nil'); await s(400);
          out.preview = document.querySelectorAll('#pb-prev li').length === 3;
          const m0 = S.members.size;
          document.querySelector('#pb-save').click(); await s(900);
          out.bulk = S.members.size === m0 + 2 && accountFor([...S.members.values()].find(m => m.name === 'Pere Font').id)?.email === 'pere@exemple.cat' && !!st('roc@exemple.cat')?.memberId;
          closeSheet(); await s(300);
          sheetPerson('roc@exemple.cat'); await s(300);
          type('#ps-email', 'roc.vidal@exemple.cat'); document.querySelector('#ps-save').click(); await s(800);
          out.moved = !st('roc@exemple.cat') && !!st('roc.vidal@exemple.cat')?.memberId;
          closeSheet(); await s(300);
          await writeAccount({ email: 'joan@exemple.cat', name: 'Sala, Joan', roles: ['leader'], role: 'leader', section: 'B', addedAt: new Date().toISOString() });
          out.unlinked = mailProblems().some(p => p.kind === 'unlinked' && p.email === 'joan@exemple.cat');
          sheetMailCheck(); await s(300);
          document.querySelector('.sheet [data-act="staff-link"][data-email="joan@exemple.cat"]').click(); await s(800);
          const j = st('joan@exemple.cat');
          out.linked = j.roles.join() === 'leader,singer' && S.members.get(j.memberId)?.name === 'Joan Sala' && S.members.get(j.memberId).leader === true;
          closeSheet(); await s(300);
          ui.people = 'singer'; ui.cantTab = 'plantilla'; render(); await s(200);
          document.querySelector('#view [data-act="member-new"][data-sec="T"]').click(); await s(300);
          out.rosterButton = document.querySelector('.sheet-h .h2')?.textContent === 'Afegeix una persona' && document.querySelector('#ps-sec .pick[aria-pressed="true"]')?.dataset.sec === 'T';
          return out;
        }""")
        for k, label in [("title", "«+ Persona» obre una sola finestra amb el nom, el correu i el rol"),
                         ("auto", "si el nom ja és a la plantilla, es fa servir la seva fitxa"), ("noDup", "i no se'n fa cap de repetida"),
                         ("invite", "després es pot enviar la invitació"), ("fresh", "qui no hi era entra a la plantilla i a l'app d'un sol cop"),
                         ("merge", "un correu que ja tenia accés hi suma els rols (no els perd)"),
                         ("fromCard", "a la fitxa de la plantilla n'hi ha prou de posar-hi el correu"),
                         ("leaderOff", "treure «cap de corda» a la fitxa també treu el permís del compte"),
                         ("preview", "la llista enganxada mostra què farà amb cada línia"),
                         ("bulk", "la llista fa les fitxes noves, vincula les que ja hi eren i dona els accessos"),
                         ("moved", "es pot canviar el correu d'una persona"),
                         ("unlinked", "«Comprova els correus» troba els comptes sense vincular a la seva fitxa"),
                         ("linked", "«Vincula» els uneix, amb la marca de cap de corda"),
                         ("rosterButton", "«Afegeix» d'una corda obre la mateixa finestra, amb la corda triada")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors en afegir persones", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "dir", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'singer'; ui.cantTab = 'plantilla'; render(); await s(300);
          document.querySelector('#view [data-act="member-new"]').click(); await s(300);
          const t = document.querySelector('#pb-text'); t.value = 'Nou Cantaire nou@exemple.cat'; t.dispatchEvent(new Event('input')); await s(400);
          return { title: document.querySelector('.sheet-h .h2')?.textContent, roles: !!document.querySelector('#pb-role'), note: document.querySelector('#pb-prev').innerText.includes('administració') }; }""")
        check(r["title"] == "Afegeix persones" and not r["roles"] and r["note"], "la direcció afegeix noms a la plantilla, però no dona accessos", str(r))
        ctx.close()

        print("Estadístiques en minuts, sense trimestres, i PDF dins l'app")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia/estadistiques")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.seg = [...document.querySelectorAll('.filters .seg3 button')].map(b => b.textContent).join() === 'Producció,Temporada';
          // Una sessió de 3 h amb un retard de 45′: compta 2 h 15′ de 3 h.
          const p = [...S.productions.values()].find(p => allSessions(p.id).some(x => x.date <= TODAY));
          const x = allSessions(p.id).find(x => x.date <= TODAY), m = membersOf('S').find(m => convoked(x, 'S'));
          p.sessions.find(y => y.id === x.id).time = '18:00'; p.sessions.find(y => y.id === x.id).end = '21:00';
          const one = computeStats({ kind: 'range', from: x.date, to: x.date, name: '' }, 'S').rows.find(r => r.m.id === m.id);
          setMark(x, m, { s: 'R', min: 45 });
          const two = computeStats({ kind: 'range', from: x.date, to: x.date, name: '' }, 'S').rows.find(r => r.m.id === m.id);
          out.minutes = one && two && Math.abs(rate(two) - 135 / 180) < 1e-9;
          // Un PDF de dues pàgines s'obre a la mateixa fitxa, sense sortir de l'app.
          const pdf = %s;
          const f = { id: 'fpdf', name: 'Partitura.pdf', type: 'application/pdf', size: pdf.length, chunks: 1 };
          fileUrls.set(f.id, URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })));
          sheetOpenFile(f, 'Partitura');
          for (let i = 0; i < 80 && !document.querySelector('.pdfv canvas'); i++) await s(250);
          out.pdf = !!document.querySelector('.pdfv canvas') && document.querySelector('.pdfv-n')?.textContent === '2 pàgines';
          document.querySelector('.pdfv-b[data-z="1"]').click(); await s(300);
          const w = document.querySelector('.pdfv-pages');
          out.zoom = w.scrollWidth > w.clientWidth && document.documentElement.scrollWidth <= innerWidth;
          return out; }""" % json.dumps(TEST_PDF))
        for k, label in [("seg", "estadístiques per producció o per temporada (sense trimestres)"),
                         ("minutes", "un retard compta pels minuts que s'hi ha estat"),
                         ("pdf", "un PDF es veu dins de l'app, pàgina a pàgina"),
                         ("zoom", "ampliat, el PDF es desplaça de costat sense eixamplar la pantalla")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a les estadístiques i al visor de PDF", "; ".join(errors[:3]))
        ctx.close()

        print("Inici: Per fer, Els meus avisos, Properament i La meva assistència")
        ctx, page, errors = open_app(browser, base, "leader", MOBILE, "#/inici")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          const p = clone(S.productions.get('p1')); p.sessions.push({ id: 'sAvui', date: TODAY, time: '20:30', end: '22:30', type: 'Assaig' }); saveProduction(p); render(); await s(300);
          const order = [...document.querySelectorAll('.home > section .section-title .h2')].map(h => h.textContent);
          const now = [...document.querySelectorAll('.soon-row.is-now')].find(r => r.querySelector('[data-act="home-roll"]'));
          return { order, hero: !!document.querySelector('.hero-cta'), roll: !!now, overflow: document.documentElement.scrollWidth <= innerWidth }; }""")
        check(r["order"][:3] == ["Per fer", "Els meus avisos", "Properament"] and (len(r["order"]) < 4 or r["order"][3] in ("La meva assistència", "Missatges")), "Inici: Per fer, Els meus avisos, Properament, La meva assistència", str(r))
        check(not r["hero"] and r["roll"], "sense el requadre «Avui»: la sessió d'avui és a Properament, amb «Passa llista»", str(r))
        check(r["overflow"], "Inici sense eixamplar la pantalla del mòbil", str(r))
        check(not errors, "sense errors a Inici", "; ".join(errors[:3]))
        ctx.close()

        print("Llistes privades i tria de produccions (com a l'Orfeó)")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/ajustos")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const d = n => { const x = new Date(TODAY + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
          for (const [i, off] of [[2, 30], [3, 90], [4, 150]]) saveProduction({ id: 'pt' + i, name: 'Prova ' + i, start: d(off), end: d(off + 14), excluded: [],
            sessions: [0, 7, 14].map(k => ({ id: `pt${i}s${k}`, date: d(off + k), time: '19:00', end: '21:00', type: k === 14 ? 'Concert' : 'Assaig' })) });
          ui.cfgOpen = { ...(ui.cfgOpen || {}), cantaires: true }; render(); await s(200);
          document.querySelector('#cfg-private').click(); await s(400);
          [...document.querySelectorAll('.sheet-f .btn')].find(b => /privades/.test(b.textContent)).click(); await s(1500);
          const fake = () => JSON.parse(localStorage.getItem('fake:db'));
          out.private = S.config.attPrivate === true && Object.keys(fake()).filter(k => k.includes('/attMine/')).length === S.members.size;
          document.querySelector('#cfg-choice').click(); await s(400);
          out.choice = choicesOn() && !!document.querySelector('#cfg-choice-min');
          // Una marca nova arriba a la còpia de la persona.
          const m = S.members.get('mS1'), x = allSessions().filter(y => y.date <= TODAY && convoked(y, 'S')).at(-1);
          setMark(x, m, { s: 'R', min: 25 }); await s(2500);
          out.mirror = fake()[Object.keys(fake()).find(k => k.endsWith('/attMine/mS1'))]?.marks?.[x.id]?.min === 25;
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.noTab = ![...document.querySelectorAll('.tabs .tab[data-tab]')].some(t => t.dataset.tab === 'llista');
          out.onlyMine = [...S.attendance.values()].every(d => Object.keys(d.marks).every(k => k === myMemberId())) && S.attendance.size > 0;
          out.noPct = !document.querySelector('.cal-pct');
          const t = todoItems().find(x => /produccions/.test(x.t));
          out.todo = !!t;
          sheetProdChoice(myMemberId()); await s(300);
          const rows = [...document.querySelectorAll('.ch-row')];
          const pick = (pid, k) => rows.find(r => r.dataset.pid === pid).querySelector(`button[data-k=${k}]`).click();
          pick('pt2', 'no'); pick('pt3', 'no'); pick('pt4', 'no'); await s(100);
          document.querySelector('#ch-save').click(); await s(400);
          out.blocked = !!document.querySelector('#ch-save');
          pick('pt2', 'yes'); pick('pt3', 'yes'); await s(100);
          document.querySelector('#ch-save').click(); await s(700);
          out.saved = !document.querySelector('#ch-save') && isExcluded('pt4', myMemberId()) && !isExcluded('pt2', myMemberId());
          out.fitxa = (sheetMyProfile(), await s(400), /Fas 3 de 4/.test(document.querySelector('.ch-box')?.innerText || ''));
          closeSheet(); await s(200);
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }"""))
        for k, label in [("private", "en fer privades les llistes, cadascú té la còpia de les seves marques"),
                         ("choice", "es pot activar que cadascú triï les produccions, amb el mínim"),
                         ("mirror", "una marca nova arriba a la còpia de la persona"),
                         ("noTab", "amb les llistes privades, un cantaire no té la pestanya d'Assistència"),
                         ("onlyMine", "i només té les seves marques"),
                         ("noPct", "ni el percentatge de cada sessió al calendari"),
                         ("todo", "a Inici li demana quines produccions farà"),
                         ("blocked", "no pot desar per sota del mínim"),
                         ("saved", "la tria es desa i on diu que no, no hi està convocat"),
                         ("fitxa", "«La meva fitxa» mostra quantes en fa"),
                         ("overflow", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb les llistes privades i la tria de produccions", "; ".join(errors[:3]))
        ctx.close()

        print("Un professor sense compte que passa a tenir-ne")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const type = (q, v) => { const e = document.querySelector(q); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
          const fake = () => JSON.parse(localStorage.getItem('fake:db'));
          const seat = teacherSeats()[0], had = Object.values(fake()).filter(d => d && d.teacher === seat.id).length;
          sheetPerson(null, { roles: ['voice'] }); await s(300);
          type('#ps-name', seat.name + ' Puig'); type('#ps-email', 'profnova@exemple.cat'); await s(100);
          out.suggested = document.querySelector('#ps-seat').value === seat.id && !document.querySelector('#ps-seat-f').hidden;
          document.querySelector('#ps-save').click(); await s(1500);
          const db = fake();
          out.moved = had > 0 && Object.values(db).filter(d => d && d.teacher === 'profnova@exemple.cat').length === had && !Object.values(db).some(d => d && d.teacher === seat.id);
          out.seatGone = !teacherSeats().some(t => t.id === seat.id);
          out.once = teacherOptions().filter(o => o.name.includes(seat.name.split(' ')[0])).length === 1;
          return out; }""")
        for k, label in [("suggested", "en donar el rol de professor, l'app proposa el professor sense compte amb el seu nom"),
                         ("moved", "totes les seves classes passen al compte"),
                         ("seatGone", "i ja no surt com a professor sense compte"),
                         ("once", "el professor surt un sol cop")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors en donar compte a un professor", "; ".join(errors[:3]))
        ctx.close()

        print("Arxiu de partitures: l'arxiver reparteix i recull les de la seva corda")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/tauler/repertori")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          ui.matProd = 'p1'; render(); await s(300);
          out.pill = /A repartir/.test(document.querySelector('.work .sc-pill.pend')?.textContent || '');
          out.panel = !!document.querySelector('.arx-panel [data-act="archive"]');
          ensureStaff(); for (let i = 0; i < 20 && !S.staffReady; i++) await s(200);
          await writeAccount({ email: 'arx@exemple.cat', name: 'Laia Ferrer', roles: ['archive', 'singer'], role: 'archive', section: 'S', memberId: 'mS1', addedAt: new Date().toISOString() });
          return out; }""")
        switch_user(page, base, "arx")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.todo = archiveTodos().some(x => /per repartir/.test(x.t));
          ui.tab = 'tauler'; ui.board = 'materials'; ui.matProd = 'p1'; render(); await s(300);
          out.mySec = /0\/4/.test(document.querySelector('.work .sc-pill')?.textContent || '');
          sheetScoreWork('p1', 'w1'); await s(300);
          out.rows = document.querySelectorAll('.sw-row').length === 4 && !document.querySelector('.sw-row button').disabled;
          document.querySelector('#sw-bulk [data-bulk="given"]').click(); await s(1200);
          const fake = JSON.parse(localStorage.getItem('fake:db'));
          const doc = fake[Object.keys(fake).find(k => k.endsWith('/scores/p1_w1_S'))];
          out.saved = !!doc && Object.values(doc.marks).filter(x => x.s === 'given').length === 4 && doc.section === 'S';
          document.querySelector('#sw-sec .chip[data-sec="T"]').click(); await s(200);
          out.otherRO = [...document.querySelectorAll('.sw-row button')].every(b => b.disabled) && document.querySelector('#sw-bulk').hidden;
          document.querySelector('#sw-sec .chip[data-sec="S"]').click(); await s(200);
          const laia = document.querySelector('.sw-row[data-mid="mS1"] button[data-k="returned"]'); laia.click(); await s(900);
          out.returned = scoreOf('p1', 'w1', S.members.get('mS1')) === 'returned';
          closeSheet(); await s(300); render(); await s(200);
          out.cardGiven = /Repartida/.test(document.querySelector('.work .sc-pill')?.textContent || '');
          out.noTodo = !archiveTodos().some(x => /per repartir/.test(x.t));
          sheetArchive('p1'); await s(300);
          out.archive = /a les mans/.test(document.querySelector('.ax-kpis')?.innerText || '') && document.querySelectorAll('.ax-table tbody tr').length === 4;
          closeSheet(); await s(200);
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }"""))
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          ui.tab = 'tauler'; ui.board = 'materials'; ui.matProd = 'p1'; render(); await s(300);
          return { mine: (document.querySelector('.work .sc-pill')?.textContent || '') === 'Repartida', noPanel: !document.querySelector('.arx-panel') }; }"""))
        for k, label in [("pill", "cada obra de la producció diu si està a repartir, repartida o retornada"),
                         ("panel", "sota les obres hi ha l'arxiu de partitures"),
                         ("todo", "a l'arxiver li surt a «Per fer» que té partitures per repartir"),
                         ("mySec", "l'arxiver veu com va la seva corda"),
                         ("rows", "l'arxiver té la llista de la seva corda per marcar"),
                         ("saved", "«Totes repartides» les marca i queda desat a la seva corda"),
                         ("otherRO", "les d'una altra corda només les pot mirar"),
                         ("returned", "es pot marcar qui l'ha retornada"),
                         ("cardGiven", "l'obra passa a «Repartida»"),
                         ("noTodo", "i ja no li queda res per repartir"),
                         ("archive", "les estadístiques de l'arxiu mostren qui té què"),
                         ("overflow", "sense eixamplar la pantalla del mòbil"),
                         ("mine", "cada cantaire veu l'estat de la seva partitura"),
                         ("noPanel", "i no les estadístiques de l'arxiu")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a l'arxiu de partitures", "; ".join(errors[:3]))
        ctx.close()

        print("Canvis d'hora de classe entre els dos dies i a unes quantes persones")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/classes")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          let mon = addDays(TODAY, 7); while (new Date(mon + 'T12:00:00').getDay() !== 1) mon = addDays(mon, 1);
          const day = (id, date, slots) => saveClassDay({ id, date, place: 'Aula 2', note: '', teacher: 'prof@exemple.cat', teacherName: 'Prat, Berta', slots });
          day('cdl', mon, [{ id: 'q1', time: '17:00', mins: 40, memberId: 'mS0' }, { id: 'q2', time: '17:40', mins: 40, memberId: 'mS2' }]);
          day('cdc', addDays(mon, 2), [{ id: 'q3', time: '18:00', mins: 40, memberId: 'mT1' }, { id: 'q4', time: '18:40', mins: 40, memberId: 'mS3' }]);
          await s(1200); return { ok: true }; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          sheetClassSwap('cdl', 'q1'); await s(300);
          const rows = [...document.querySelectorAll('#cs-list .cs-row')].map(l => l.innerText.replace(/\\s+/g, ' '));
          out.bothDays = document.querySelectorAll('#cs-list .cs-day').length === 2 && rows.length === 3;
          for (const v of ['cdc|q3', 'cdc|q4']) { const i = document.querySelector(`#cs-list input[value="${v}"]`); i.checked = true; i.dispatchEvent(new Event('change')); }
          await s(100);
          out.hint = /2 persones/.test(document.querySelector('#cs-hint').textContent);
          document.querySelector('#cs-go').click(); await s(800);
          const req = [...S.classReq.values()].find(x => x.classId === 'cdl' && x.kind === 'swap');
          out.req = !!req && req.open && req.to.join() === 'mT1,mS3' && req.offers.mT1 === 'cdc|q3';
          return out; }"""))
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const req = openSwaps().find(x => x.classId === 'cdl');
          out.offered = !!req;
          takeOpenSwap(req.id); await s(800);
          const dl = classSlots(S.classes.get('cdl')), dc = classSlots(S.classes.get('cdc'));
          out.swapped = dl.find(x => x.id === 'q1').memberId === 'mT1' && dc.find(x => x.id === 'q3').memberId === 'mS0';
          return out; }"""))
        for k, label in [("bothDays", "es pot demanar el canvi a les persones dels dos dies de la setmana"),
                         ("hint", "es poden triar unes quantes persones"),
                         ("req", "la petició va només a les triades"),
                         ("offered", "a una de les triades li surt"),
                         ("swapped", "en acceptar-lo, cadascú passa a l'hora de l'altre, cada dia")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors als canvis d'hora", "; ".join(errors[:3]))
        ctx.close()

        print("Temps d'assaig d'un cap de setmana, i el percentatge només de sessions fetes")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/calendari")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const fut = allSessions().find(x => x.date > TODAY && membersOf('S').length);
          setMark(fut, membersOf('S')[0], { s: 'FJ', note: 'Avisat' }); render(); await s(300);
          out.noPct = !document.querySelector(`.cal-row [data-sid="${fut.id}"] .cal-pct`);
          sheetSession(fut.id); await s(300);
          const f = document.querySelector('#se-mins'); f.value = '5:35';
          document.querySelector('#se-save').click(); await s(600);
          out.mins = sessionById(fut.id).mins === 335 && sessionMins(sessionById(fut.id)) === 335;
          sheetSessionInfo(fut.id); await s(300);
          out.shown = /5 h 35 min/.test(document.querySelector('.fitxa')?.innerText || '');
          closeSheet(); return out; }""")
        for k, label in [("noPct", "el calendari no posa percentatge a una sessió que encara no s'ha fet"),
                         ("mins", "una sessió pot tenir el seu temps d'assaig, i és el que compta"),
                         ("shown", "la fitxa diu quantes hores s'hi assaja")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb el temps d'assaig", "; ".join(errors[:3]))
        ctx.close()

        print("Canvis ràpids: Inici més net, calendari d'una fila i ajudes plegades")
        ctx, page, errors = open_app(browser, base, "singer", MOBILE, "#/inici")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const ti = todoItems; todoItems = () => []; render(); await s(200);
          out.allDone = !!document.querySelector('.home .pf-ok') && !document.querySelector('.home .todo-done');
          todoItems = ti; render(); await s(200);
          const mine = [...document.querySelectorAll('.home section')].find(x => /Els meus avisos/.test(x.querySelector('.h2')?.textContent || ''));
          out.noticesQuiet = !!mine && !mine.querySelector('p') && !!mine.querySelector('[data-act="absence-new"]');
          const row = [...document.querySelectorAll('.soon-row')].find(x => x.querySelector('[data-act="cl-avisa"]'));
          out.oneBtn = !!row && row.querySelectorAll('.soon-a .btn').length === 1;
          row?.querySelector('[data-act="cl-avisa"]').click(); await s(300);
          out.chooser = ['late', 'absent'].every(k => document.querySelector(`.sheet .write-o[data-act="cl-notice"][data-k="${k}"]`));
          document.querySelector('.sheet .write-o[data-k="late"]').click(); await s(300);
          out.late = !!document.querySelector('.sheet #cn-min');
          closeSheet(); await s(200);
          out.short = getComputedStyle(document.querySelector('#choir-name .bn-short') || document.body).display !== 'none' && document.querySelector('#choir-name').innerText.trim() === S.config.shortName;
          applyRoute('calendari'); render(); await s(300);
          const head = document.querySelector('.page-head');
          out.calHead = !head.querySelector('[data-act="cal-subscribe"], [data-act="cal-past"]') && !!document.querySelector('.cal-past-link');
          out.noMarks = !document.querySelector('.cal-row .vmarks');
          return out; }""")
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          applyRoute('calendari'); render(); await s(300);
          const head = document.querySelector('.page-head');
          out.oneRow = head.getBoundingClientRect().height < 70 && !!head.querySelector('[data-act="session-new"]');
          out.marks = !!document.querySelector('.cal-row .vmarks');
          applyRoute('inici'); render(); await s(300);
          out.noPlanChip = !document.querySelector('.soon-row .fitxa-chip.empty');
          const nx = allSessions().find(x => x.date >= TODAY && !isShow(x));
          out.planTodo = !planOf(nx) && nx.date <= addDays(TODAY, 7) ? todoItems().some(x => x.icon === 'plan' && /pla d’assaig/.test(x.t)) : true;
          applyRoute('gestio/personal'); render(); await s(300);
          const q = document.querySelector('.access-panel .q-help'), p = document.getElementById('help-acces');
          out.helpFolded = !!q && !!p && p.hidden;
          q.click(); await s(100);
          out.helpOpens = !p.hidden && q.getAttribute('aria-expanded') === 'true';
          sheetAccount(); await s(200);
          out.acctCal = !!document.querySelector('.acct-item[data-k="calendar"]');
          closeSheet(); return out; }"""))
        for k, label in [("allDone", "sense res pendent, «Per fer» és només el títol amb «Tot al dia»"),
                         ("noticesQuiet", "«Els meus avisos» buit és només el botó, sense paràgraf"),
                         ("oneBtn", "la classe de cant d'Inici té un sol botó «Avisa…»"),
                         ("chooser", "«Avisa…» obre arribar tard, no venir i canviar l'hora"),
                         ("late", "i cada opció obre la seva finestra"),
                         ("short", "al mòbil, la capçalera fa servir el nom curt"),
                         ("calHead", "el calendari no té «Subscriu-t'hi» ni «Mostra passades» a dalt: hi ha un enllaç sobre la llista"),
                         ("noMarks", "un cantaire no veu les boletes de les llistes de cada corda"),
                         ("oneRow", "la capçalera del calendari és d'una sola fila"),
                         ("marks", "qui passa llista sí que les veu"),
                         ("noPlanChip", "Properament no té el requadre «Afegeix el pla d'assaig»"),
                         ("planTodo", "el pla del proper assaig és a «Per fer» de la direcció"),
                         ("helpFolded", "les explicacions de Personal queden plegades sota un «?»"),
                         ("helpOpens", "el «?» les obre"),
                         ("acctCal", "el calendari al mòbil és al menú del compte")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors als canvis ràpids", "; ".join(errors[:3]))
        ctx.close()

        print("Mira l'app com…")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        page.click('[data-act="preview-on"]'); page.wait_for_timeout(400)
        roles = page.evaluate("[...document.querySelectorAll('#pv-role .pick')].map(b => b.dataset.k)")
        check(roles == ["singer", "leader", "archive", "director", "gerencia", "secretaria", "voice"], "es pot mirar com cada rol (també l'arxiver)", str(roles))
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
