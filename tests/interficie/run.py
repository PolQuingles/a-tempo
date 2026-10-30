"""Proves de la interfície: l'app sencera en un Chromium sense pantalla, amb Firebase fals i dades inventades.

Per a cada perfil (administració, cap de corda, cantaire, direcció sense fitxa, professor de cant, gerència) i mida
(mòbil petit, mòbil, ordinador) recorre totes les pantalles i comprova que no hi ha errors ni res que surti de la
pantalla. També comprova el botó «enrere», els enllaços directes a una pantalla, la versió d'ordinador, la vista prèvia
de cada rol, les converses i els recordatoris, l'arxiu de l'assistència, el registre d'errors, que passada la mitjanit
l'app continua al dia de les dades i que l'app s'obre sense xarxa.

    pip install playwright && python -m playwright install chromium
    python3 tests/interficie/run.py
"""
import datetime, functools, http.server, json, os, sys, tempfile, threading, time

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


# Cap pàgina no ha d'estar oberta just quan arriba la mitjanit: per continuar al dia de les dades, el seu rellotge hauria
# de tornar un dia enrere (vegeu fake-firebase.js). Si falta poc, abans d'obrir-ne una de nova s'espera que passi.
MIDNIGHT_WAIT = 120


def wait_past_midnight():
    now = datetime.datetime.now()
    left = (datetime.datetime.combine(now.date() + datetime.timedelta(days=1), datetime.time()) - now).total_seconds()
    if left < MIDNIGHT_WAIT:
        print(f"  (falten {left:.0f} s per a la mitjanit: s'espera que passi)")
        time.sleep(left + 1)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=directory))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def open_app(browser, base, user, opts, route=""):
    ctx = browser.new_context(**opts)
    wait_past_midnight()
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
        check(page.locator(".pm-list").first.is_visible(), "Personal: la plantilla es desplega persona a persona també a l'ordinador")
        page.goto(f"{base}/index.html?u=pol#/inici"); page.wait_for_function(READY, timeout=20000); page.wait_for_timeout(600)
        a, b = page.locator(".home-a").bounding_box(), page.locator(".home-b").bounding_box()
        check(a and b and b["x"] > a["x"] + a["width"] - 1 and abs(a["y"] - b["y"]) < 4, "a l'ordinador, Inici té dues columnes", f"{a} {b}")
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
        # Amb cinc pestanyes a la barra (l'administració que també canta i fa classes), Gestió s'obre des del menú del compte.
        page.click("#acct-btn"); page.wait_for_timeout(300)
        page.click('.acct-item[data-act="manage"]'); page.wait_for_timeout(500)
        check(screen(page) == "#/gestio/personal gestio" and page.locator(".ph-back").count() == 1, "Gestió s'obre des del menú del compte (comença per Personal, amb la fletxa per tornar)", screen(page))
        page.click('[data-act="manage"][data-k="config"]'); page.wait_for_timeout(300)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/gestio/personal gestio", "dins de Gestió, enrere torna a l'apartat d'abans", screen(page))
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/calendari calendari", "de Gestió, enrere torna a la pantalla d'abans", screen(page))
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
          out.seat = !!mySeat(sessionById('s6'), S.memberId);
          await loadProfiles();
          const t = participantRows(sessionById('s6'), true, new Set(['sec', 'phone', 'emerg', 'size']));
          out.participants = t.rows.length === 4 && t.rows.some(x => x.includes('600000001') && x.includes('L'));
          out.cert = certificateHtml({ m: S.members.get(S.memberId), from: seasonCfg().season.from, to: seasonCfg().season.to, label: 'la temporada', signer: 'X', role: 'Secretaria', place: 'Barcelona' }).includes('CERTIFICA');
          const f = await seasonFigures();
          out.season = f.active === 16 && seasonRows(f).length > 20;
          out.norm = /Encara pots perdre .+ d’assaig|ni un minut més|assegurat/.test(normHint(S.members.get(S.memberId), 'p1'));
          out.week = timetableHtml([{ label: 'Dilluns', sub: 'Aula 2', cells: { '17:00': 'Anna' } }]).includes('Aula 2');
          return out;
        }""")
        for k, label in [("works", "el Repertori mostra les obres de la producció"), ("planKept", "editar una sessió no n'esborra el pla d'assaig"),
                         ("planText", "el pla d'assaig es mostra amb les obres"), ("tenorsShort", "l'equilibri de veus avisa si una corda no arriba al mínim"),
                         ("seat", "la col·locació diu a cadascú el seu lloc"), ("participants", "la llista de participants porta el telèfon, la talla i l'emergència"),
                         ("cert", "el certificat d'assistència es genera"), ("season", "la memòria de la temporada té les xifres"),
                         ("norm", "el cantaire veu quant temps d'assaig es pot perdre encara"), ("week", "l'horari per imprimir porta l'aula")]:
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
          document.querySelector('#view [data-act="write"]')?.click(); await s(200);
          out.button = !!document.querySelector('.sheet [data-act="msg-new"]') && !!document.querySelector('.sheet [data-act="thread-to"]') && !document.querySelector('.sheet [data-act="ann-new"]');
          closeSheet(); await s(100);
          sheetMessage(); await s(200);
          document.querySelector('#mg-body').value = 'Tenors, assaig parcial dijous a les 19 h.';
          document.querySelector('#mg-send').click(); await s(200); flushAll(); await s(300);
          out.sent = [...S.messages.values()].some(m => m.body.startsWith('Tenors, assaig') && m.to.length === 1 && m.to[0] === 'T');
          const tenor = membersOf('T').find(m => m.id !== S.memberId);
          sheetMemberStats(tenor.id); await s(600);
          out.track = !!document.querySelector('#ms-track #tn-text');
          document.querySelector('#tn-text').value = 'Bona evolució als aguts'; document.querySelector('#tn-save').click(); await s(400);
          out.note = (await firebase.firestore().collection(`cors/${GID}/memberNotes`).where('memberId', '==', tenor.id).get()).docs.some(d => d.data().section === 'T');
          return out;
        }""")
        check(r["button"], "el cap de corda, a «Escriu», té un missatge a la corda o a una persona", str(r))
        check(r["sent"], "el missatge del cap de corda va només a la seva corda", str(r))
        check(r["track"] and r["note"], "el cap de corda escriu notes de seguiment dels de la seva corda", str(r))
        check(not errors, "sense errors als missatges del cap de corda", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        r = page.evaluate("""() => ({ mine: messagesForMe().map(m => m.id).sort().join(','), todo: todoItems().some(x => x.icon === 'msg'), write: canMessage(),
          track: canTrack(S.members.get(myMemberId())), block: !!document.querySelector('#view .msgs'),
          badge: +(document.querySelector('.tab-badge')?.textContent || 0), rows: document.querySelectorAll('#view .todo-row, #view .todo-conv').length })""")
        check(r["mine"] == "g1", "una soprano rep el missatge a tothom i no el dels tenors", str(r))
        check(not r["todo"] and r["block"], "els missatges nous surten una sola vegada, a «Missatges» (no a «Per fer»)", str(r))
        check(r["badge"] == r["rows"], "la bombolla d'Inici diu el mateix que «Per fer»", str(r))
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
          out.altes = document.querySelector('.pm-chips [data-k="moves"]')?.getAttribute('aria-pressed') === 'true' && [...document.querySelectorAll('details.pm')].some(d => d.dataset.mid === m.id);
          return out;
        }""")
        for k, label in [("docs", "la plantilla mostra qui no pot sortir a fotos"), ("noImg", "hi surt qui ha dit que no a les fotos"),
                         ("fee", "es marca una quota com a pagada"), ("moveShown", "en desactivar algú, es demana la data i el motiu de la baixa"),
                         ("history", "la baixa queda a l'historial"), ("csv", "la plantilla s'exporta a Excel amb l'antiguitat i els documents"),
                         ("altes", "el filtre «Altes i baixes» de la plantilla mostra qui ha marxat aquesta temporada")]:
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
        g = page.locator('.tabs .tab-extra[data-act="manage"]')
        check(g.is_visible() and "Gestió" in g.inner_text(), "a l'ordinador, Gestió és al menú lateral")
        g.click(); page.wait_for_timeout(400)
        check(page.evaluate("location.hash").startswith("#/gestio/"), "i l'obre", page.evaluate("location.hash"))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        check(page.locator('.tabs .tab:not(.tab-extra)').count() == 5 and not page.locator('.tabs .tab-extra[data-act="manage"]').is_visible(), "al mòbil, cinc pestanyes com a molt: la Gestió de l'administració va al menú del compte")
        ctx.close()
        ctx, page, errors = open_app(browser, base, "ger", MOBILE)
        check(page.locator('.tabs .tab[data-tab="gestio"]').is_visible(), "si hi cap, Gestió és una pestanya més (gerència)")
        ctx.close()

        print("Gestió › Personal: el desplegable dels rols i les llistes de la plantilla")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        check(page.evaluate("S.staff.size === 0 && !S.staffReady"), "a Inici encara no es llegeix el personal (només quan s'obre Gestió)")
        page.evaluate("ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'singer'; render()")
        page.wait_for_function("S.staffReady && S.staff.size === 6", timeout=5000)
        page.wait_for_timeout(300)
        opts = page.evaluate("[...document.querySelectorAll('#people-menu option')].map(o => o.value)")
        check(page.locator("select#people-menu").count() == 1 and opts[:2] == ["singer", "access"] and {"director", "gerencia", "secretaria", "leader", "voice"} <= set(opts), "els rols són en un desplegable", str(opts))
        chips = page.evaluate("[...document.querySelectorAll('.pm-chips .chip')].map(b => b.dataset.k)")
        check(chips == ["all", "moves", "docs", "fees", "access"] and page.locator('[data-act="cant-tab"]').count() == 0, "la plantilla és una sola llista, amb filtres en lloc de pestanyes", str(chips))
        page.select_option("#people-menu", "director"); page.wait_for_timeout(300)
        check("Dídac Director" in page.inner_text("#view") and page.locator('.pm-chips').count() == 0, "triar Direcció mostra qui en fa")
        page.select_option("#people-menu", "singer"); page.wait_for_timeout(600)
        page.click('.pm-chips [data-k="fees"]'); page.wait_for_timeout(400)
        check("han pagat" in page.inner_text("#view") and page.locator("details.pm").count() > 0, "el filtre de la quota mostra qui la té pendent")
        check(not errors, "sense errors al menú de Personal", "; ".join(errors[:3]))
        ctx.close()

        print("Afegir persones: cada persona un sol cop")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        r = page.evaluate("""async () => {
          const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const type = (q, v) => { const e = document.querySelector(q); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
          const fake = () => JSON.parse(localStorage.getItem('fake:db')), st = e => fake()[`cors/${GID}/staff/${e}`];
          ui.people = 'singer'; render(); await s(200);
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
          ui.people = 'singer'; render(); await s(200);
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
                         ("unlinked", "«Revisa els accessos» troba els comptes sense vincular a la seva fitxa"),
                         ("linked", "«Vincula» els uneix, amb la marca de cap de corda"),
                         ("rosterButton", "«Afegeix» d'una corda obre la mateixa finestra, amb la corda triada")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors en afegir persones", "; ".join(errors[:3]))
        ctx.close()
        ctx, page, errors = open_app(browser, base, "ger", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          ui.tab = 'gestio'; ui.manage = 'personal'; ui.people = 'singer'; render(); await s(300);
          document.querySelector('#view [data-act="member-new"]').click(); await s(300);
          const t = document.querySelector('#pb-text'); t.value = 'Nou Cantaire nou@exemple.cat'; t.dispatchEvent(new Event('input')); await s(400);
          return { title: document.querySelector('.sheet-h .h2')?.textContent, roles: !!document.querySelector('#pb-role'), note: document.querySelector('#pb-prev').innerText.includes('administració') }; }""")
        check(r["title"] == "Afegeix persones" and not r["roles"] and r["note"], "la gerència afegeix noms a la plantilla, però no dona accessos", str(r))
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

        print("Inici: la propera sessió a dalt, Per fer, Properament i La meva assistència")
        ctx, page, errors = open_app(browser, base, "leader", MOBILE, "#/inici")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          const p = clone(S.productions.get('p1')); p.sessions.push({ id: 'sAvui', date: TODAY, time: '20:30', end: '22:30', type: 'Assaig' }); saveProduction(p); render(); await s(300);
          const order = [...document.querySelectorAll('.home section')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(x => x.querySelector('.section-title .h2')?.textContent || x.className);
          const next = document.querySelector('.h-next .next-card.is-now');
          const later = [...document.querySelectorAll('.soon-row')].filter(r => r.querySelector('[data-act="home-roll"]')).length;
          return { order, hero: !!document.querySelector('.hero-cta'), roll: !!next?.querySelector('[data-act="home-roll"]'), later, notices: !document.querySelector('.h-notices'), overflow: document.documentElement.scrollWidth <= innerWidth }; }""")
        check(r["order"][0] == "h-next" and r["order"][1:3] == ["Per fer", "Properament"] and (len(r["order"]) < 4 or r["order"][3] in ("La meva assistència", "Missatges")), "Inici: la propera sessió a dalt i després Per fer, Properament, La meva assistència", str(r))
        check(not r["hero"] and r["roll"] and r["later"] == 1, "la sessió d'avui és la targeta de dalt, amb «Passa llista»; l'altra d'avui, a Properament", str(r))
        check(r["notices"], "sense cap absència avisada, no hi ha l'apartat «Les meves absències»", str(r))
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
          applyRoute('assistencia'); render(); await s(300);
          out.noTab = /Assistència/.test(document.querySelector('#view h1')?.textContent || '') && !document.querySelector('#view .quads, #view .roster');
          applyRoute('inici'); render(); await s(200);
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
                         ("noTab", "amb les llistes privades, l'Assistència d'un cantaire és només la seva"),
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

        print("Arxiu de partitures: l'arxiver reparteix i recull les de totes les cordes")
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
          out.otherRW = [...document.querySelectorAll('.sw-row button')].every(b => !b.disabled) && !document.querySelector('#sw-bulk').hidden;
          document.querySelector('.sw-row button[data-k="given"]').click(); await s(1200);
          const fake2 = JSON.parse(localStorage.getItem('fake:db'));
          const docT = fake2[Object.keys(fake2).find(k => k.endsWith('/scores/p1_w1_T'))];
          out.otherSaved = !!docT && docT.section === 'T' && Object.values(docT.marks).some(x => x.s === 'given');
          document.querySelector('#sw-sec .chip[data-sec="S"]').click(); await s(200);
          const laia = document.querySelector('.sw-row[data-mid="mS1"] button[data-k="returned"]'); laia.click(); await s(900);
          out.returned = scoreOf('p1', 'w1', S.members.get('mS1')) === 'returned';
          closeSheet(); await s(300); render(); await s(200);
          out.cardGiven = /Recollint · 1\/4/.test(document.querySelector('.work .sc-pill.sc-part')?.textContent || '');
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
                         ("otherRW", "també pot marcar les d'una altra corda"),
                         ("otherSaved", "i queden desades a aquella corda"),
                         ("returned", "es pot marcar qui l'ha retornada"),
                         ("cardGiven", "l'obra passa a «Recollint · 1/4» quan algú la torna"),
                         ("noTodo", "i ja no li queda res per repartir"),
                         ("archive", "les estadístiques de l'arxiu mostren qui té què"),
                         ("overflow", "sense eixamplar la pantalla del mòbil"),
                         ("mine", "cada cantaire veu l'estat de la seva partitura"),
                         ("noPanel", "i no les estadístiques de l'arxiu")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a l'arxiu de partitures", "; ".join(errors[:3]))
        ctx.close()

        print("Arxivers: porten el repertori, i a l'arxiu només hi surt qui fa la producció (o qui ha de tornar la partitura)")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/tauler/repertori")
        page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          ensureStaff(); for (let i = 0; i < 20 && !S.staffReady; i++) await s(200);
          await writeAccount({ email: 'arx@exemple.cat', name: 'Laia Ferrer', roles: ['archive', 'singer'], role: 'archive', section: 'S', memberId: 'mS1', addedAt: new Date().toISOString() });
          // La Clara està de baixa tota la producció (mai no n'ha tingut la partitura); la Marta la tenia i ha deixat de fer-la.
          saveMember({ ...S.members.get('mS3'), leaves: [{ from: addDays(TODAY, -30), to: addDays(TODAY, 40), note: '' }] });
          setScore('p1', 'w1', S.members.get('mS2'), 'given');
          const p = S.productions.get('p1'); saveProduction({ ...clone(p), excluded: [...(p.excluded || []), 'mS2'] });
          await s(900); }""")
        switch_user(page, base, "arx")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const fake = () => JSON.parse(localStorage.getItem('fake:db')), find = (db, end) => db[Object.keys(db).find(k => k.endsWith(end))];
          ui.tab = 'tauler'; ui.board = 'materials'; ui.matProd = 'p1'; render(); await s(300);
          out.tools = !!document.querySelector('[data-act="work-new"]') && !!document.querySelector('[data-act="work-link"]') && !!document.querySelector('[data-act="mat-new"]');
          document.querySelector('[data-act="work-new"]').click(); await s(300);
          document.querySelector('#wk-title').value = 'Magnificat'; document.querySelector('#wk-composer').value = 'J. S. Bach';
          document.querySelector('#wk-save').click(); await s(900);
          const w = [...S.works.values()].find(x => x.title === 'Magnificat');
          out.added = !!w && (w.prods || []).includes('p1') && !!find(fake(), `/works/${w.id}`) && !S.error;
          sheetWork('w1'); await s(300);
          out.editBtn = !!document.querySelector('.sheet [data-act="work-edit"]');
          closeSheet(); await s(200);
          sheetWorkEdit(w.id); await s(300);
          document.querySelector('#wk-del').click(); await s(900);
          out.deleted = !S.works.has(w.id) && !find(fake(), `/works/${w.id}`) && !!find(fake(), '/config/main').syncEpoch?.works && !S.error;
          sheetScoreWork('p1', 'w1', 'S'); await s(300);
          const ids = [...document.querySelectorAll('.sw-row')].map(x => x.dataset.mid);
          out.noLeave = !ids.includes('mS3');
          out.leaver = ids.includes('mS2') && /però té la partitura: l’ha de retornar/.test(document.querySelector('.sw-row[data-mid="mS2"] .sc-out')?.textContent || '');
          out.others = ids.includes('mS0') && ids.includes('mS1') && !document.querySelector('.sw-row[data-mid="mS0"] .sc-out');
          closeSheet(); await s(200);
          sheetArchive('p1'); await s(300);
          const ax = document.querySelector('.sheet')?.textContent || '';   // textContent: els títols es pinten en majúscules
          out.axBack = /Ja no fan la producció/.test(ax) && /Marta Soler/.test(ax) && !/Clara Vila/.test(ax);
          closeSheet(); await s(200);
          out.todo = archiveTodos().some(x => /Marta ha de tornar 1 partitura/.test(x.t));
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        for k, label in [("tools", "l'arxiver pot afegir obres, enllaçar-ne i afegir materials"),
                         ("added", "afegeix una obra al repertori i queda desada"),
                         ("editBtn", "pot editar les obres que hi ha"),
                         ("deleted", "i esborrar-les (i els mòbils ho saben)"),
                         ("noLeave", "qui està de baixa tota la producció i no l'ha rebuda no surt a la llista"),
                         ("leaver", "qui ha deixat la producció i té la partitura hi surt amb el recordatori"),
                         ("others", "la resta de la corda hi surt com sempre"),
                         ("axBack", "les estadístiques de l'arxiu diuen qui ja no la fa i l'ha de tornar"),
                         ("todo", "i a «Per fer» li surt que l'ha de recollir"),
                         ("overflow", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb el repertori dels arxivers", "; ".join(errors[:3]))
        ctx.close()

        print("Rols sumats: ningú no tria cap rol, i cadascú té les pestanyes de tots els seus rols")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const tabs = () => [...document.querySelectorAll('.tabs-in .tab:not(.tab-extra)')].map(b => b.dataset.tab).join(',');
          const subs = q => [...document.querySelectorAll(q)].map(b => b.dataset.k).join(',');
          out.noPicker = !document.querySelector('.lp-opt, .lens-bar') && !document.querySelector('.tabs').hidden;
          out.polTabs = tabs() === 'avisos,llista,calendari,tauler,classes' && moreTabs().join() === 'gestio';
          out.homeLine = /Administració/.test(document.querySelector('.me-line')?.textContent || '') && /Cap de corda/.test(document.querySelector('.me-line')?.textContent || '');
          out.homeBoth = !!document.querySelector('.h-next [data-act="home-roll"]') && !!document.querySelector('.h-next [data-act="absence-new"]');
          document.querySelector('#acct-btn').click(); await s(300);
          const g = document.querySelector('.acct-item[data-act="manage"]');
          out.menuGestio = !!g && !document.querySelector('.acct-item[data-act="lens-pick"]');
          g.click(); await s(300);
          out.gestioAll = subs('#view .subtab[data-act="manage"]') === 'personal,produccions,config' && !!document.querySelector('.ph-back');
          document.querySelector('.tab[data-tab="llista"]').click(); await s(300);
          out.areas = subs('[data-act="att-area"]') === 'me,sec,all' && attArea() === 'sec';
          out.leaderRoll = ui.rollSec === 'T' && !document.querySelector('[data-act="close-sec"]') && /Tenors/.test(document.querySelector('.secbar-t')?.textContent || '');
          out.secTabs = subs('.att-tabs .subtab') === 'llista,stats,abs';
          document.querySelector('.att-tabs .subtab[data-k="stats"]').click(); await s(300);
          out.leaderStats = ui.statsSec === 'T' && !document.querySelector('select[data-pick="stats-sec"]');
          document.querySelector('.att-tabs .subtab[data-k="abs"]').click(); await s(300);
          document.querySelector('[data-act="abs-filter"][data-k="all"]').click(); await s(200);
          out.secAbs = !document.querySelector('#view .panel [data-act="abs-accept"]');
          document.querySelector('[data-act="att-area"][data-k="all"]').click(); await s(300);
          out.allTabs = subs('.att-tabs .subtab') === 'llista,stats,risk,abs' && !!document.querySelector('.quads');
          document.querySelector('.att-tabs .subtab[data-k="abs"]').click(); await s(300);
          document.querySelector('[data-act="abs-filter"][data-k="pending"]').click(); await s(200);
          out.allAbs = !!document.querySelector('#view .panel [data-act="abs-accept"]');
          document.querySelector('[data-act="att-area"][data-k="me"]').click(); await s(300);
          out.mine = /Assistència/.test(document.querySelector('#view h1')?.textContent || '') && !!document.querySelector('#view [data-act="absence-new"]') && !document.querySelector('#view .quads, #view .roster, #view .att-tabs');
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        switch_user(page, base, "leader")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const tabs = () => [...document.querySelectorAll('.tabs-in .tab:not(.tab-extra)')].map(b => b.dataset.tab).join(',');
          out.leaderTabs = /^avisos,llista,calendari,tauler/.test(tabs()) && !roleTabs().includes('gestio');
          out.leaderAreas = attAreas().join() === 'me,sec';
          ui.tab = 'tauler'; ui.board = 'anuncis'; render(); await s(300);
          out.noBoardEdit = !document.querySelector('[data-act="ann-new"], [data-act="ann-edit"]');
          ui.tab = 'calendari'; render(); await s(300);
          out.noSessionEdit = !document.querySelector('[data-act="session-new"], [data-act="session-edit"]');
          ui.tab = 'avisos'; render(); await s(200);
          return out; }"""))
        switch_user(page, base, "dir")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const tabs = () => [...document.querySelectorAll('.tabs-in .tab:not(.tab-extra)')].map(b => b.dataset.tab).join(',');
          out.dirTabs = tabs() === 'avisos,llista,calendari,tauler,gestio' && !document.querySelector('.lens-bar');
          document.querySelector('.tab[data-tab="llista"]').click(); await s(300);
          out.dirAtt = !document.querySelector('[data-act="att-area"]') && [...document.querySelectorAll('.att-tabs .subtab')].map(b => b.dataset.k).join(',') === 'stats,risk,abs' && ui.att === 'stats';
          out.dirAbs = myPendingAbsences().length === 1;
          document.querySelector('.tab[data-tab="gestio"]').click(); await s(300);
          out.dirGestio = [...document.querySelectorAll('#view .subtab[data-act="manage"]')].map(b => b.dataset.k).join(',') === 'personal,produccions,config';
          document.querySelector('.tab[data-tab="calendari"]').click(); await s(300);
          out.dirSessions = !!document.querySelector('[data-act="session-new"]') && canBoard() && canProd();
          return out; }"""))
        switch_user(page, base, "ger")
        r.update(page.evaluate("""async () => ({ gerGestio: gestioTabs().join(',') === 'personal,produccions,config' && tabsForRole().includes('gestio') })"""))
        switch_user(page, base, "prof")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const tabs = () => [...document.querySelectorAll('.tabs-in .tab:not(.tab-extra)')].map(b => b.dataset.tab).join(',');
          out.profTabs = tabs() === 'avisos,calendari,classes';
          ui.tab = 'avisos'; render(); await s(200);
          out.profHome = !!document.querySelector('.h-soon .cl-next, .h-soon .todo-done') && /Properes classes/.test(document.querySelector('.h-soon')?.textContent || '');
          document.querySelector('.tab[data-tab="classes"]').click(); await s(300);
          out.profClTabs = [...document.querySelectorAll('[data-act="cl-tab"]')].map(b => b.dataset.k).join(',') === 'llista,alumnes';
          out.profAtt = /Assistència/.test(document.querySelector('#view h1')?.textContent || '') && !!document.querySelector('[data-act="cl-stats"]');
          document.querySelector('[data-act="cl-tab"][data-k="alumnes"]').click(); await s(300);
          out.students = document.querySelectorAll('.stu-row').length === myStudents(myTeacherKey()).length && document.querySelectorAll('.stu-row').length > 0;
          document.querySelector('.tab[data-tab="calendari"]').click(); await s(300);
          out.profCal = !!document.querySelector('.cl-hero') && !document.querySelector('[data-act="cl-back"]');
          out.overflow2 = document.documentElement.scrollWidth <= innerWidth;
          return out; }"""))
        for k, label in [("noPicker", "en obrir l'app no es tria cap rol"),
                         ("polTabs", "l'administració que porta una corda i fa classes: cinc pestanyes, i Gestió al menú del compte"),
                         ("homeLine", "a Inici, sota el nom, la corda i els rols de feina"),
                         ("homeBoth", "la sessió d'avui porta «Passa llista» i «No hi puc anar» alhora"),
                         ("menuGestio", "el menú del compte té Gestió (i ja no hi ha «Canvia de rol»)"),
                         ("gestioAll", "Gestió de l'administració: Personal, Produccions i Ajustos, amb la fletxa per tornar"),
                         ("areas", "a Assistència, el selector Jo · la corda · tot el cor, i comença per la corda"),
                         ("leaderRoll", "des de la corda, passa llista només de la seva corda"),
                         ("secTabs", "amb llista, estadístiques i absències"),
                         ("leaderStats", "les estadístiques són de la seva corda"),
                         ("secAbs", "i les absències, només les de la seva corda"),
                         ("allTabs", "des de tot el cor, llista, estadístiques, risc i absències de totes les cordes"),
                         ("allAbs", "i les absències de tothom"),
                         ("mine", "«Jo» és la seva assistència, amb el botó d'avisar"),
                         ("overflow", "sense eixamplar la pantalla del mòbil"),
                         ("leaderTabs", "el cap de corda que canta té Inici, Assistència, Calendari i Tauler"),
                         ("leaderAreas", "i a Assistència, la seva i la de la corda"),
                         ("noBoardEdit", "no hi veu els botons per editar el tauler"),
                         ("noSessionEdit", "ni per editar les sessions"),
                         ("dirTabs", "la direcció té Inici, Assistència, Calendari, Tauler i Gestió"),
                         ("dirAtt", "a Assistència, les estadístiques, el risc i les absències de tot el cor"),
                         ("dirAbs", "i respon les absències de tothom"),
                         ("dirGestio", "a Gestió, Personal, Produccions i Ajustos"),
                         ("dirSessions", "i porta les sessions i el tauler"),
                         ("gerGestio", "la gerència també té tota la Gestió"),
                         ("profTabs", "el professor de cant té Inici, Calendari i Classes"),
                         ("profHome", "a Inici, les seves properes classes"),
                         ("profClTabs", "a Classes, l'assistència i els alumnes"),
                         ("profAtt", "hi passa llista a les classes"),
                         ("students", "i hi té els seus alumnes"),
                         ("profCal", "el Calendari és el de les seves classes"),
                         ("overflow2", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb els rols sumats", "; ".join(errors[:3]))
        ctx.close()

        print("Canvis d'hora de classe entre els dos dies i a unes quantes persones")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/classes")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          // Un dilluns més enllà de les classes de la llavor (fins a avui + 9), també si avui és diumenge.
          let mon = addDays(TODAY, 10); while (new Date(mon + 'T12:00:00').getDay() !== 1) mon = addDays(mon, 1);
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
          // Prou coses per fer perquè se'n pleguin: les del cantaire i tres més.
          const extra = [1, 2, 3].map(i => ({ icon: Object.keys(TODO_ICONS)[0], t: `Prova ${i}`, act: '', btn: 'Fes-ho' }));
          todoItems = () => [...ti(), ...extra]; render(); await s(200);
          const n = +(document.querySelector('.h-todo .todo-n')?.textContent || 0);
          const shown = document.querySelectorAll('.h-todo .todo > .todo-row, .h-todo .todo > .todo-conv').length, folded = document.querySelectorAll('.h-todo .todo-more > .todo-row, .h-todo .todo-more > .todo-conv').length;
          out.fold = n > 3 && shown === 3 && folded === n - 3 && !document.querySelector('.h-todo .todo-more')?.open;
          todoItems = ti; render(); await s(200);
          out.noticesQuiet = !document.querySelector('.h-notices') && !document.querySelector('.home .my-att') && !!document.querySelector('.next-card [data-act="absence-new"]');
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
                         ("noticesQuiet", "Inici no repeteix l'assistència ni les absències (són a la pestanya Assistència): «No hi puc anar» és a la targeta de dalt"),
                         ("fold", "«Per fer» ensenya les tres primeres coses i plega la resta"),
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

        print("Missatges a una persona, i els arxivers a la seva corda")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const anna = [...S.members.values()].find(m => /Puig/.test(m.name) && /Anna/.test(m.name));
          sheetThreadTo(); await s(200);
          const sel = document.querySelector('#tt-who'); sel.value = anna.id;
          document.querySelector('#tt-text').value = 'Anna, em passes la partitura del Gloria?';
          document.querySelector('#tt-send').click(); await s(800);
          const t = [...S.threads.values()].find(x => x.memberId === anna.id && x.toEmail === S.email);
          out.sent = !!t && t.lastSide === 's' && t.msgs.length === 1;
          sheetThreadTo(anna.id); await s(200);
          out.reopens = !!document.querySelector('.sheet .bubbles');
          closeSheet();
          ensureStaff(); for (let i = 0; i < 20 && !S.staffReady; i++) await s(200);
          await writeAccount({ email: 'arx@exemple.cat', name: 'Laia Ferrer', roles: ['archive', 'singer'], role: 'archive', section: 'S', memberId: 'mS1', addedAt: new Date().toISOString() });
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          for (let i = 0; i < 20 && !S.threads.size; i++) await s(200);
          out.inbox = unreadThreads().some(t => /Gloria/.test(t.msgs[0].text)) && todoItems().some(x => x.icon === 'thread');
          return out; }"""))
        switch_user(page, base, "arx")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.canMsg = canMessage() && mySecWrite() === 'S' && writableMembers().every(m => m.section === 'S');
          ui.tab = 'tauler'; ui.board = 'materials'; ui.matProd = 'p1'; render(); await s(300);
          document.querySelector('.arx-panel [data-act="msg-new"]').click(); await s(300);
          out.preset = /Partitures de/.test(document.querySelector('#mg-title').value);
          document.querySelector('#mg-send').click(); await s(200); flushAll(); await s(500);
          out.arxSent = [...S.messages.values()].some(m => /tornar-me les partitures/.test(m.body) && m.to.join() === 'S' && /^Arxiu/.test(m.byRole));
          return out; }"""))
        for k, label in [("sent", "l'equip escriu a una persona: una conversa privada a nom seu"),
                         ("reopens", "si ja hi parla, s'obre la mateixa conversa"),
                         ("inbox", "a la persona li surt a «Per fer» i a les converses"),
                         ("canMsg", "l'arxiver pot escriure a la seva corda i a la gent de la seva corda"),
                         ("preset", "«Avisa la corda» proposa el recordatori de les partitures"),
                         ("arxSent", "i el missatge va només a la seva corda, signat com a «Arxiu de …»")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors als missatges a una persona", "; ".join(errors[:3]))
        ctx.close()

        print("Distribució: llista compacta, Més…, plantilla desplegable i avisar des de Properament")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia/T")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          lsSet(LS_COMPACT, null); render(); await s(200);
          const h0 = document.querySelector('#roster .row').getBoundingClientRect().height;
          document.querySelector('[data-act="roll-compact"]').click(); await s(300);
          const rows = [...document.querySelectorAll('#roster.compact .row')];
          out.compact = rows.length > 0 && rows.every(r => r.getBoundingClientRect().height < h0) && rows.every(r => r.querySelectorAll('.opt').length === 5);
          rows[0].querySelector('.opt[data-s="P"]').click(); await s(300);
          out.marks = effMark(sessionById(ui.sessionId), S.members.get(rows[0].dataset.mid))?.s === 'P';
          out.remembered = rollCompact() && document.documentElement.scrollWidth <= innerWidth;
          document.querySelector('[data-act="roll-compact"]').click(); await s(200);
          out.back = !document.querySelector('#roster.compact');
          applyRoute('gestio/personal'); render(); for (let i = 0; i < 20 && !S.staffReady; i++) await s(200); await s(300);
          const acts = [...document.querySelectorAll('.access-acts .btn')].map(b => b.dataset.act);
          out.more = acts[0] === 'staff-new' && acts.includes('people-tools') && !acts.includes('who-in');
          document.querySelector('[data-act="people-tools"]').click(); await s(300);
          out.tools = ['staff-bulk', 'share-app', 'who-in', 'mail-check', 'preview-on'].every(a => document.querySelector(`.sheet [data-act="${a}"]`));
          closeSheet(); await s(200);
          const d = document.querySelector('details.pm');
          d.querySelector('summary').click(); await s(200);
          const txt = d.querySelector('.pm-b').innerText;
          out.card = d.open && /Alta/.test(txt) && /Documents i quota/.test(txt) && !!d.querySelector('[data-act="member-edit"]') && !!d.querySelector('[data-act="member-stats"]');
          render(); await s(200);
          out.keepsOpen = !!document.querySelector(`details.pm[data-mid="${d.dataset.mid}"]`)?.open;
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const row = [...document.querySelectorAll('.soon-row .soon-open')].find(b => sessionById(b.dataset.sid)?.date > TODAY && !sessionById(b.dataset.sid)?.rsvp);
          out.ahead = !!row && !document.querySelector('.soon-row [data-act="absence-new"]');
          row?.click(); await s(300);
          const btn = row && document.querySelector(`.sheet [data-act="absence-new"][data-sid="${row.dataset.sid}"]`);
          out.sheetBtn = !!btn;
          btn?.click(); await s(300);
          out.preset = !!row && !!document.querySelector(`.sheet #ab-sessions input[value="${row.dataset.sid}"]:checked`);
          closeSheet(); return out; }"""))
        for k, label in [("compact", "passar llista té una vista compacta: una fila per persona i cinc cercles"),
                         ("marks", "els cercles marquen igual que els botons"),
                         ("remembered", "el mòbil se'n recorda, i no s'eixampla la pantalla"),
                         ("back", "es pot tornar a la vista detallada"),
                         ("more", "a Personal, «+ Persona» destacat i la resta a «Més…»"),
                         ("tools", "«Més…» té enganxar una llista, l'enllaç, qui ha entrat, els correus i mirar l'app com…"),
                         ("card", "en tocar un cantaire, se'n desplega tota la informació i les accions"),
                         ("keepsOpen", "i queda obert encara que la pantalla es torni a pintar"),
                         ("ahead", "a Properament, cada sessió obre la seva fitxa, sense repetir «No hi puc anar» a cada fila"),
                         ("sheetBtn", "i la fitxa té «No hi puc anar o arribaré tard»"),
                         ("preset", "que obre l'avís d'aquella sessió")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a la distribució nova", "; ".join(errors[:3]))
        ctx.close()

        print("Estètica: inicials de color, dia de concert, mapa, compte enrere, mode fosc i pestanyes del Tauler")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia/S")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const av = [...document.querySelectorAll('#roster .row .pav')];
          out.rollAv = av.length > 0 && av[0].textContent.trim().length === 2;
          out.hues = secHue('S') !== secHue('T');
          applyRoute('gestio/personal'); render(); await s(400);
          out.pmAv = !!document.querySelector('details.pm summary .pav');
          const p = clone(S.productions.get('p1'));
          let t = p.sessions.find(x => x.date === TODAY);
          if (!t) { t = { id: 'sAvuiC', date: TODAY, time: '20:30', end: '22:30' }; p.sessions.push(t); }
          Object.assign(t, { type: 'Concert', place: 'Palau de la Música Catalana', info: { call: '19:30', dress: 'Negre', meet: 'Porta lateral' } });
          if (!p.sessions.some(x => x.date > addDays(TODAY, 3) && x.type === 'Concert')) p.sessions.push({ id: 'sLater', date: addDays(TODAY, 9), time: '20:00', end: '22:00', type: 'Concert' });
          saveProduction(p); applyRoute('inici'); render(); await s(300);
          const cd = document.querySelector('.concert-day');
          out.concertDay = !!cd && /19:30/.test(cd.innerText) && /Negre/.test(cd.innerText) && !!cd.querySelector('.map-link[href*="google.com/maps"]');
          out.usual = placeLink(usualPlace()) .indexOf('<a') === -1 && placeLink('La Conreria (Tiana)').includes('map-link');
          out.count = [...document.querySelectorAll('.soon-count')].some(x => /d’aquí a \d+ dies/.test(x.textContent));
          const fill = () => getComputedStyle(document.querySelector('.acct-btn')).backgroundColor;
          const accent = () => { const e = document.createElement('i'); e.style.color = 'var(--accent)'; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c; };
          document.documentElement.dataset.theme = 'light'; await s(50); const light = fill() === accent();
          document.documentElement.dataset.theme = 'dark'; await s(50); out.dark = light && fill() !== accent();
          document.documentElement.dataset.theme = 'light';
          applyRoute('tauler/anuncis'); render(); await s(300);
          const tabs = [...document.querySelectorAll('.board-tabs .subtab')];
          out.tabs = tabs.length === 5 && tabs.every(b => b.querySelector('svg') && b.querySelector('span').scrollWidth <= b.querySelector('span').clientWidth + 1);
          return out; }""")
        for k, label in [("rollAv", "a passar llista, cada persona té les seves inicials en un cercle"),
                         ("hues", "cada corda té el seu color"),
                         ("pmAv", "la plantilla també porta les inicials"),
                         ("concertDay", "el dia del concert, Properament té una fila amb la convocatòria, el vestuari i el lloc amb el mapa"),
                         ("usual", "el lloc habitual no s'obre al mapa; els altres, sí"),
                         ("count", "el proper concert porta el compte enrere"),
                         ("dark", "en mode fosc, el cercle del compte i els botons destacats són més apagats"),
                         ("tabs", "les pestanyes del Tauler tenen icona i el nom sencer")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a l'estètica nova", "; ".join(errors[:3]))
        ctx.close()

        print("Quota opcional (Ajustos)")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/ajustos")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.on = feesOn() && !!document.querySelector('.cfg-h[data-k="quota"]');
          document.querySelector('.cfg-h[data-k="quota"]').click(); await s(200);
          const sw = document.querySelector('#cfg-fees'); sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true })); await s(400);
          out.off = !feesOn() && S.config.feesOn === false;
          ui.people = 'singer'; ui.pmFilter = 'all';
          applyRoute('gestio/personal'); render(); await ensureSecData(); render(); await s(400);
          const d = document.querySelector('details.pm'); if (d) d.open = true; await s(100);
          const v = document.querySelector('#view').innerText;
          out.gone = !/Quota/.test(v) && !document.querySelector('.pm-chips [data-k="fees"]') && !document.querySelector('[data-act="fee-edit"], [data-act="fee-paid"], #fee-amount');
          let csv = ''; window.offerFile = (name, text) => { csv = text; }; await exportRoster(); await s(100);
          out.csv = !!csv && !csv.includes('Quota');
          applyRoute('gestio/ajustos'); render(); await s(200);
          const sw2 = document.querySelector('#cfg-fees'); sw2.checked = true; sw2.dispatchEvent(new Event('change', { bubbles: true })); await s(400);
          applyRoute('gestio/personal'); render(); await s(300);
          out.back = feesOn() && !!document.querySelector('.pm-chips [data-k="fees"]');
          return out; }""")
        for k, label in [("on", "Ajustos té el calaix de la quota, activada per defecte"), ("off", "es pot desactivar"),
                         ("gone", "desactivada, la quota desapareix de la plantilla"), ("csv", "i de l'Excel"), ("back", "i torna en activar-la")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb la quota opcional", "; ".join(errors[:3]))
        ctx.close()

        print("Auditoria: baixes, percentatges, llegendes i detalls")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia/estadistiques")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const txt = q => document.querySelector(q)?.innerText || '';
          // L'administració (que també porta els tenors) mira tot el cor.
          ui.attArea = 'all'; ui.statsSec = ''; render(); await s(300);
          // 1. Una baixa (Jan Pons, que té una falta) ja no surt a la norma de les estadístiques, i qui hi és sí.
          out.beforeNorm = /Jan Pons/.test(txt('.alerts'));
          saveMember({ ...S.members.get('mT3'), active: false }); render(); await s(300);
          out.norm = !/Jan Pons/.test(txt('.alerts')) && /Clara Vila/.test(txt('.alerts'));
          // 3. Els comptadors de Personal només compten la plantilla en actiu i els seus comptes.
          ensureStaff(); for (let i = 0; i < 25 && !accountFor('mT1'); i++) await s(200);
          applyRoute('gestio/personal'); render(); await s(300);
          out.access = /3 de 15 cantaires tenen accés · 3 hi han entrat/.test(txt('.access-panel'));
          // 2. La sessió d'avui no té percentatge abans de començar.
          const p = clone(S.productions.get('p1')), s3 = p.sessions.find(x => x.id === 's3');
          s3.time = '23:59'; S.productions.set('p1', p);
          S.attendance.set('s3_S', { sessionId: 's3', section: 'S', marks: { mS1: { s: 'FJ' } } });
          out.notBegun = !hasBegun(s3);
          applyRoute('calendari'); ui.calProd = 'p1'; ui.calView = 'list'; render(); await s(300);
          const row = () => document.querySelector('.cal-row [data-sid="s3"]');
          out.noPct = !!row() && !row().querySelector('.cal-pct');
          s3.time = '00:00'; S.productions.set('p1', p); render(); await s(200);
          out.pctLater = hasBegun(s3) && !!row()?.querySelector('.cal-pct');
          // 4. La llegenda de la llista només surt si hi ha algun punt a explicar.
          S.attendance.delete('s3_S');
          applyRoute('assistencia'); ui.sessionId = 's3'; render(); await s(300);
          out.noLegend = !/Llista completa/.test(txt('#view'));
          S.attendance.set('s3_S', { sessionId: 's3', section: 'S', marks: Object.fromEntries(membersOf('S').map(m => [m.id, { s: 'P' }])) }); render(); await s(200);
          out.legend = /Llista completa/.test(txt('.q-legend'));
          // 5. Les files de Risc, alineades a l'esquerra.
          applyRoute('assistencia/risc'); render(); await s(300);
          const rr = document.querySelector('.risk-row');
          out.riskLeft = !!rr && getComputedStyle(rr).textAlign === 'left';
          // 6. Classes: «La teva hora: avui · …» i sense la llegenda «Avui hi ha classe».
          saveClassDay({ id: 'cdavui', date: TODAY, place: 'Aula 2', note: '', teacher: 'prof@exemple.cat', teacherName: 'Prat, Berta', slots: [{ id: 'qa', time: '17:00', mins: 40, memberId: 'mT1' }] }); await s(300);
          applyRoute('classes'); render(); await s(300);
          out.classToday = /La teva hora: avui · 17:00/.test(txt('#view')) && !/Avui hi ha classe/.test(txt('.q-legend') + (document.querySelector('.q-legend') ? '' : ''));
          // 7. Una obra a mig repartir diu «Repartint» amb el recompte.
          setScore('p1', 'w1', S.members.get('mS0'), 'given');
          applyRoute('tauler/repertori'); ui.matProd = 'p1'; render(); await s(300);
          out.pill = /Repartint · 1\/15/.test(txt('.work .sc-pill.sc-part'));
          // 8. «No hi puc anar o arribaré tard»: a la fitxa de cada sessió que ve (les files d'Inici l'obren).
          applyRoute('inici'); render(); await s(300);
          const op = [...document.querySelectorAll('.soon-row .soon-open')].find(b => !sessionById(b.dataset.sid)?.rsvp);
          op?.click(); await s(300);
          out.ghost = !!op && !!document.querySelector(`.sheet .sheet-foot [data-act="absence-new"][data-sid="${op.dataset.sid}"], .sheet [data-act="absence-new"][data-sid="${op.dataset.sid}"]`);
          closeSheet(); await s(200);
          // 9. La meva assistència (Assistència › Jo): en buit, els assajos que queden.
          applyRoute('assistencia/meva'); render(); await s(300);
          out.ahead = document.querySelectorAll('.my-att .dots i.fut').length === 2;
          applyRoute('inici'); render(); await s(200);
          // 10. El Tauler no s'obre a uns anuncis buits, i després recorda on eres.
          S.announcements.clear(); ui.board = 'anuncis';
          document.querySelector('[data-act="tab"][data-tab="tauler"]').click(); await s(300);
          out.boardRep = ui.board === 'materials';
          document.querySelector('[data-act="board"][data-k="documents"]').click(); await s(200);
          document.querySelector('[data-act="tab"][data-tab="avisos"]').click(); await s(200);
          document.querySelector('[data-act="tab"][data-tab="tauler"]').click(); await s(300);
          out.boardKept = ui.board === 'documents';
          // 11. Un sol «Calendari al mòbil» al compte, amb el calendari personal (que porta les classes) a dins.
          sheetAccount(); await s(300);
          out.oneCal = !document.querySelector('.acct-item[data-k="classIcs"]') && !!document.querySelector('.acct-item[data-k="calendar"]');
          sheetCalendar(); await s(300);
          out.calClasses = !!document.querySelector('.sheet [data-act="my-cal"]');
          closeSheet(); await s(200);
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        for k, label in [("beforeNorm", "a la norma hi surt qui no hi arriba"), ("norm", "però no les baixes"),
                         ("access", "els comptadors d'accés compten només la plantilla en actiu"),
                         ("notBegun", "una sessió d'avui encara no ha començat abans de l'hora"), ("noPct", "i el calendari no en mostra el percentatge"),
                         ("pctLater", "un cop començada, sí"), ("noLegend", "sense cap llista completa, no hi ha la llegenda «Llista completa»"),
                         ("legend", "i surt quan n'hi ha alguna"), ("riskLeft", "les files de Risc van alineades a l'esquerra"),
                         ("classToday", "a Classes diu «La teva hora: avui · 17:00» i no hi ha la llegenda d'avui"),
                         ("pill", "una obra a mig repartir diu «Repartint · 1/15»"), ("ghost", "la fitxa de les sessions que vénen té «No hi puc anar o arribaré tard»"),
                         ("ahead", "la meva assistència mostra en buit els assajos que queden"),
                         ("boardRep", "el Tauler no s'obre a uns anuncis buits"), ("boardKept", "i recorda la darrera pestanya"),
                         ("oneCal", "el compte té un sol «Calendari al mòbil»"), ("calClasses", "i a dins, el calendari personal (amb les classes)"),
                         ("overflow", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors als canvis de l'auditoria", "; ".join(errors[:3]))
        ctx.close()

        print("Documents a triar, absències i notificacions, i escriure als que no arriben")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/ajustos")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const txt = q => document.querySelector(q)?.innerText || '';
          const sw = k => { const x = document.querySelector(`[data-bind="cfg-doc"][data-k="${k}"]`); x.click(); };
          // 12. Ajustos › Documents: es tria quins es demanen; sense cap, desapareixen de la plantilla.
          out.allOn = docItems().length === 3 && !!document.querySelector('.cfg-h[data-k="docs"]');
          document.querySelector('.cfg-h[data-k="docs"]').click(); await s(200);
          sw('imatge'); await s(400);
          out.two = JSON.stringify(S.config.askDocs) === '["dades","autoritzacio"]' && /Es demanen 2/.test(txt('.cfg-h[data-k="docs"]'));
          ui.people = 'singer'; ui.pmFilter = 'all';
          applyRoute('gestio/personal'); render(); await ensureSecData(); render(); await s(400);
          const d = document.querySelector('details.pm'); if (d) d.open = true; await s(100);
          out.noImg = !/Drets d’imatge/.test(txt('.pm-docs')) && /Protecció de dades/.test(txt('.pm-docs')) && !/sortir a fotos/.test(txt('.pm-sum'));
          applyRoute('gestio/ajustos'); render(); await s(200);
          sw('dades'); await s(300); sw('autoritzacio'); await s(400);
          out.off = !docsOn() && /Desactivats/.test(txt('.cfg-h[data-k="docs"]'));
          applyRoute('gestio/personal'); render(); await s(300);
          const d2 = document.querySelector('details.pm'); if (d2) d2.open = true; await s(100);
          out.gone = !document.querySelector('.pm-chips [data-k="docs"]') && !document.querySelector('[data-act="member-docs"]') && !!document.querySelector('details.pm[open]')
            && !/Drets d’imatge|Protecció de dades|Autoritzacions/.test(txt('.pm-docs')) && /Quota/.test(txt('.pm-box b'));
          applyRoute('gestio/ajustos'); render(); await s(200);
          for (const k of ['imatge', 'dades', 'autoritzacio']) { sw(k); await s(300); }
          out.back = docItems().length === 3;
          // 13. Els noms: Absències i Notificacions.
          applyRoute('assistencia/absencies'); render(); await s(300);
          out.absTab = [...document.querySelectorAll('.att-tabs .subtab')].some(b => /^Absències/.test(b.textContent.trim())) && ui.att === 'abs';
          applyRoute('assistencia/meva'); render(); await s(300);
          out.mine = /Avisa d’una absència/.test(txt('#view'));
          sheetHelp(); await s(300);
          out.help = /Què és cada cosa/.test(txt('.sheet')) && /Notificacions/.test(txt('.sheet')); closeSheet(); await s(200);
          // 15. Risc › Escriu-los: un missatge privat a cadascú, amb les seves xifres.
          applyRoute('assistencia/risc'); render(); await s(300);
          const before = S.threads.size;
          const b = document.querySelector('[data-act="risk-write"][data-pid="p1"]'); out.btn = !!b; b.click(); await s(400);
          const boxes = [...document.querySelectorAll('.rw-list input')];
          out.list = boxes.length === 4 && /Hola, Clara!/.test(txt('#rw-prev'));
          boxes.find(x => x.value === 'mB3').click(); boxes.find(x => x.value === 'mB3').dispatchEvent(new Event('change')); await s(100);
          out.count = /Envia a 3 persones/.test(txt('#rw-send'));
          document.querySelector('#rw-send').click(); await s(1500);
          const mine = [...S.threads.values()].filter(t => t.toEmail === S.email && t.subject === 'Assistència · Concert de tardor');
          out.sent = S.threads.size === before + 3 && mine.length === 3 && !mine.some(t => t.memberId === 'mB3')
            && mine.every(t => /^Hola, \S+! A Concert de tardor portes un \d+% d’assistència/.test(t.msgs[0].text) && !/\{/.test(t.msgs[0].text));
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        for k, label in [("allOn", "Ajustos té el calaix dels documents, amb tots tres demanats"), ("two", "es pot deixar de demanar un document"),
                         ("noImg", "i desapareix de la fitxa i del resum de la plantilla"), ("off", "sense cap document, queden desactivats"),
                         ("gone", "i desapareixen el filtre, el botó i les pastilles"), ("back", "i es tornen a activar"),
                         ("absTab", "Assistència té la pestanya «Absències»"), ("mine", "l'Assistència del cantaire diu «Avisa d’una absència»"),
                         ("help", "l'ajuda explica què és cada cosa"), ("btn", "Risc té «Escriu-los»"),
                         ("list", "hi surten els que no arriben, amb una mostra del missatge"), ("count", "es pot treure algú de la llista"),
                         ("sent", "cadascú rep una conversa privada amb les seves xifres"), ("overflow", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb els documents, els noms i «Escriu-los»", "; ".join(errors[:3]))
        ctx.close()

        print("Vestidor: demanar el vestuari i portar-lo des de la secretaria")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/inici")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const txt = q => document.querySelector(q)?.innerText || '';
          out.offMenu = (sheetAccount(), await s(300), !document.querySelector('.acct-item[data-act="ward-open"]')); closeSheet(); await s(200);
          saveConfig({ wardrobe: { on: true } }); watchWardrobe(); await s(300);
          sheetAccount(); await s(300);
          const it = document.querySelector('.acct-item[data-act="ward-open"]'); out.menu = !!it; it.click(); await s(400);
          out.route = location.hash === '#/vestidor' && /Vestidor/.test(txt('.page-head'));
          out.empty = /Encara no has demanat res/.test(txt('.ward-empty'));
          document.querySelector('[data-act="ward-ask"]').click(); await s(300);
          document.querySelector('#wa-item .pick[data-k="americana"]').click(); await s(100);
          out.sizes = document.querySelectorAll('#wa-size .pick').length === 10;
          document.querySelector('#wa-size .pick[data-k="50"]').click(); document.querySelector('#wa-go').click(); await s(800);
          const fake = () => JSON.parse(localStorage.getItem('fake:db'));
          const mine = Object.entries(fake()).filter(([k, v]) => k.includes('/wardrobe/') && v.memberId === 'mT1').map(([, v]) => v);
          out.saved = mine.length === 1 && mine[0].item === 'americana' && mine[0].size === '50' && mine[0].status === 'demanat';
          out.card = /Americana 50/.test(txt('.ward-card')) && /Demanat/.test(txt('.ward-card .ward-pill'));
          out.oneOnly = !document.querySelector('.section-title [data-act="ward-ask"]');
          // La resta la porta l'equip (aquí, l'administració, que també hi té la seva peça).
          applyRoute('vestidor'); render(); await s(300);
          out.order = /Americana · 50 ×1/.test(txt('.ward-order'));
          out.todoStaff = todoItems().some(x => x.icon === 'ward' && /per encarregar/.test(x.t));
          document.querySelector('[data-act="ward-ordered"]').click(); await s(400);
          const id = mine[0].id;
          out.ordered = S.wardrobe.get(id).status === 'encarregat' && S.wardrobe.get(id).history.length === 2;
          document.querySelector(`.ward-row[data-id="${id}"]`).click(); await s(300);
          document.querySelector('#wi-st button[data-k="emprovar"]').click(); document.querySelector('#wi-note').value = 'Escurçar les mànigues';
          document.querySelector('#wi-save').click(); await s(500);
          out.fitting = S.wardrobe.get(id).status === 'emprovar' && S.wardrobe.get(id).note === 'Escurçar les mànigues';
          applyRoute('vestidor'); render(); await s(300);
          out.todoMine = todoItems().some(x => x.icon === 'ward' && /per emprovar/.test(x.t));
          out.steps = document.querySelectorAll('.ward-card .ward-steps li.done').length === 2 && /Pendent d’emprovar/.test(txt('.ward-card .ward-steps li.cur'));
          document.querySelector('[data-act="ward-filter"][data-k="none"]').click(); await s(300);
          out.none = document.querySelectorAll('.ward-list .ward-row').length === membersOf(null).length - 1;
          document.querySelector('.ward-list [data-act="ward-new"][data-mid="mS0"]').click(); await s(300);
          document.querySelector('#wn-item .pick[data-k="estola"]').click(); await s(100);
          document.querySelector('#wn-size .pick[data-k="M"]').click(); document.querySelector('#wn-go').click(); await s(500);
          out.added = [...S.wardrobe.values()].some(x => x.memberId === 'mS0' && x.item === 'estola' && x.size === 'M');
          let csv = ''; window.offerFile = (n, t) => { csv = t; }; wardExport();
          out.csv = /Peça;"Talla";"Estat"/.test(csv.replace(/"Peça"/, 'Peça')) && /Pendent d’emprovar/.test(csv) && /Estola/.test(csv);
          applyRoute('gestio/ajustos'); render(); await s(300);
          out.cfg = /Vestidor/.test(txt('.cfg-h[data-k="vestidor"]')) && /Americana, Estola/.test(txt('.cfg-h[data-k="vestidor"]'));
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          document.querySelector('#acct-btn').click(); await s(300);
          document.querySelector('.acct-item[data-act="ward-open"]').click(); await s(400);
          out.singerMine = /Estola M/.test(document.querySelector('.ward-card')?.innerText || '') && !document.querySelector('.ward-list');
          out.singerOnlyHers = [...S.wardrobe.values()].every(x => x.memberId === 'mS0');
          return out; }"""))
        for k, label in [("offMenu", "sense activar-lo, el vestidor no surt"), ("menu", "activat, surt al menú del compte"), ("route", "i obre la pantalla del vestidor"),
                         ("empty", "qui no ha demanat res ho veu explicat"), ("sizes", "cada peça té les seves talles"), ("saved", "la petició queda desada amb la peça i la talla"),
                         ("card", "i surt a «El meu vestuari» com a demanat"), ("oneOnly", "només se'n demana una (americana o estola)"),
                         ("order", "la secretaria veu què cal encarregar, per talles"), ("todoStaff", "i li surt a «Per fer»"),
                         ("ordered", "les pot marcar totes com a encarregades"), ("fitting", "i passar-ne una a «Pendent d'emprovar» amb una nota"),
                         ("todoMine", "a qui l'ha d'emprovar li surt a «Per fer»"), ("steps", "i veu per quins passos ha passat"),
                         ("none", "es veu qui encara no ha demanat res"), ("added", "la secretaria pot afegir una peça a algú"),
                         ("csv", "tot el vestuari s'exporta a Excel"), ("cfg", "a Ajustos hi ha el calaix del vestidor"),
                         ("overflow", "sense eixamplar la pantalla del mòbil"), ("singerMine", "cada cantaire veu només el seu vestuari"),
                         ("singerOnlyHers", "i no en llegeix el dels altres")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors al vestidor", "; ".join(errors[:3]))
        ctx.close()

        print("Cap de corda en funcions quan el cap de corda no fa la producció")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const txt = q => document.querySelector(q)?.innerText || '';
          const today = allSessions().find(x => x.date === TODAY);
          // Les eines de la llista són al quadre de totes les cordes (tot el cor, sense cap corda oberta).
          ui.attArea = 'all'; ui.rollSec = null; ui.sessionId = today.id; render(); await s(300);
          out.noDoor = !document.querySelector('[data-act="door-open"]') && typeof viewDoor === 'undefined';
          out.tools = /Caps de corda en funcions/.test(txt('.roll-tools'));
          // El cap de corda de tenors (Lluc) no fa la producció.
          const p = clone(S.productions.get(today.prodId)); p.excluded = ['mT0']; saveProduction(p); await s(300);
          out.todo = todoItems().some(x => /tria el cap de corda en funcions/.test(x.t) && /tenors/.test(x.s) && !/sopranos/.test(x.s));
          return out; }""")
        switch_user(page, base, "leader")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const txt = q => document.querySelector(q)?.innerText || '';
          const today = allSessions().find(x => x.date === TODAY);
          out.leaderTodo = todoItems().some(x => /tria el cap de corda en funcions/.test(x.t) && /No fas aquesta producció/.test(x.s));
          sheetProdRoll(today.prodId); await s(400);
          out.ownOnly = document.querySelectorAll('.pr-row').length === 1 && !!document.querySelector('.pr-row.warn[data-sec="T"]');
          out.onlyDoers = ![...document.querySelectorAll('select[data-sec="T"] option')].some(o => o.value === 'mT0');
          document.querySelector('select[data-sec="T"]').value = 'mT2'; document.querySelector('#pr-save').click(); await s(800);
          const p = S.productions.get(today.prodId);
          const subs = [...S.subs.values()].filter(x => x.auto && x.section === 'T' && x.memberId === 'mT2');
          out.subs = p.roll?.T === 'mT2' && subs.length === p.sessions.filter(x => x.date >= addDays(TODAY, -1)).length && !todoItems().some(x => /en funcions/.test(x.t));
          const p2 = clone(p); p2.sessions.push({ id: 'snova', date: addDays(TODAY, 4), time: '20:30', end: '22:30', type: 'Assaig', place: '', note: '' }); saveProduction(p2); await s(600);
          out.newSession = S.subs.get('snova_T')?.memberId === 'mT2';
          ui.tab = 'llista'; ui.att = 'llista'; ui.sessionId = today.id; ui.rollSec = 'T'; render(); await s(300);
          out.subLine = /Cap de corda en funcions: Oriol Camps/.test(txt('.sub-line'));
          return out; }"""))
        for k, label in [("noDoor", "ja no hi ha el mode porta"), ("tools", "a la llista hi ha «Caps de corda en funcions»"),
                         ("todo", "si el cap de corda no fa la producció, «Per fer» ho avisa (només de la seva corda)"),
                         ("leaderTodo", "al cap de corda li demana que triï qui passarà llista"),
                         ("ownOnly", "i només pot triar el de la seva corda"), ("onlyDoers", "d'entre els que fan la producció"),
                         ("subs", "el cap de corda en funcions passa llista a totes les sessions"),
                         ("newSession", "també a les que s'afegeixen després"), ("subLine", "i la llista ho diu: «Cap de corda en funcions»")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb el cap de corda en funcions", "; ".join(errors[:3]))
        ctx.close()

        print("Fitxes privades amb les llistes privades")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/ajustos")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const fake = () => JSON.parse(localStorage.getItem('fake:db'));
          const doc = path => { const f = fake(); return f[Object.keys(f).find(k => k.endsWith(path))]; };
          saveMember({ ...S.members.get('mT2'), phone: '600111222', notes: 'Treballa de nit', leaves: [{ from: addDays(TODAY, 2), to: addDays(TODAY, 20), note: 'Operació de genoll' }] }); await s(800);
          const p = setAttPrivate(true); await s(400); document.querySelector('#cf-yes').click(); await p; await s(1500);
          const pub = doc('/members/mT2'), priv = doc('/memberPriv/mT2');
          out.split = !('phone' in pub) && !('leaves' in pub) && !('notes' in pub) && !('history' in pub) && priv?.leaves?.[0]?.note === 'Operació de genoll' && priv.phone === '600111222';
          out.merged = S.members.get('mT2').leaves?.length === 1 && S.members.get('mT2').notes === 'Treballa de nit';
          saveMember({ ...S.members.get('mT2'), notes: 'Ara de dia' }); await s(800);
          out.edit = !('notes' in doc('/members/mT2')) && doc('/memberPriv/mT2').notes === 'Ara de dia';
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => {
          const t = S.members.get('mT2');
          return { hidden: !t.phone && !t.notes && !t.leaves && !t.history, own: (S.members.get('mS0').history || []).length > 0 }; }"""))
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          await s(600);
          out.reload = S.members.get('mT2').notes === 'Ara de dia' && S.members.get('mT2').leaves?.length === 1;
          const p = setAttPrivate(false); await s(400); document.querySelector('#cf-yes').click(); await p; await s(1500);
          const f = JSON.parse(localStorage.getItem('fake:db'));
          const pub = f[Object.keys(f).find(k => k.endsWith('/members/mT2'))];
          out.back = pub.notes === 'Ara de dia' && pub.leaves?.length === 1 && !Object.keys(f).some(k => k.endsWith('/memberPriv/mT2'));
          return out; }"""))
        for k, label in [("split", "amb les llistes privades, el telèfon, les notes i les baixes van a part"), ("merged", "l'equip ho continua veient tot junt"),
                         ("edit", "i en desar una fitxa, la part privada continua a part"), ("hidden", "una cantaire no veu les dades privades de ningú més"),
                         ("own", "però sí les seves"), ("reload", "en tornar a entrar, l'equip ho torna a tenir tot"), ("back", "i en desfer-les, tot torna a la fitxa")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb les fitxes privades", "; ".join(errors[:3]))
        ctx.close()

        print("Missatges a qui fa una producció")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/calendari")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const p = clone(S.productions.get('p1')); p.excluded = ['mS1']; saveProduction(p); await s(300);
          ui.calProd = 'all'; ui.calView = 'list'; render(); await s(300);
          const b = document.querySelector('[data-act="msg-new"][data-prod="p1"]'); out.btn = !!b; b.click(); await s(400);
          out.preset = document.querySelector('#mg-prod')?.value === 'p1';
          // (l'administrador també és cap de corda: la seva corda ja surt triada; primer «Tothom», després només sopranos)
          document.querySelector('#mg-to .pick[data-sec="*"]').click(); document.querySelector('#mg-to .pick[data-sec="S"]').click(); await s(100);
          out.reach = /Arribarà als 3 cantaires que fan Concert de tardor d’aquestes cordes/.test(document.querySelector('#mg-reach').textContent);
          document.querySelector('#mg-body').value = 'Sopranos del concert: dijous, assaig parcial.';
          document.querySelector('#mg-send').click(); await s(800);
          const m = [...S.messages.values()].find(x => x.prod === 'p1');
          out.saved = !!m && m.to.join() === 'p:p1' && m.secs.join() === 'S' && m.members.length === 3 && !m.members.includes('mS1') && m.members.includes('mS0');
          out.label = /A qui fa Concert de tardor \(sopranos\)/.test(msgTo(m));
          return out; }""")
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => ({ singerSees: messagesForMe().some(x => x.prod === 'p1' && /assaig parcial/.test(x.body)) })"""))
        switch_user(page, base, "leader")
        r.update(page.evaluate("""async () => ({ otherNot: !messagesForMe().some(x => x.prod === 'p1') })"""))
        for k, label in [("btn", "al calendari, cada producció té «Escriu a qui la fa»"), ("preset", "i obre el missatge amb la producció triada"),
                         ("reach", "diu a quanta gent arribarà (només qui la fa, i de les cordes triades)"),
                         ("saved", "el missatge porta la llista de qui la fa, sense qui no la fa"), ("label", "i diu a qui va"),
                         ("singerSees", "qui la fa el rep"), ("otherNot", "i a qui no, no li surt")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb els missatges a qui fa una producció", "; ".join(errors[:3]))
        ctx.close()

        print("Qui no fa la producció, llistes privades i noms")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/assistencia")
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
          const p = clone(S.productions.get('p1')); p.excluded = ['mS0', 'mS1']; saveProduction(p);
          saveProduction({ id: 'p2', name: 'Concert de Nadal', start: d(30), end: d(40), excluded: [],
            sessions: [{ id: 'n1', date: d(35), time: '19:00', end: '21:00', type: 'Concert', place: 'Palau', note: '' }] });
          await s(300);
          ui.tab = 'llista'; ui.attArea = 'all'; ui.att = 'llista'; ui.rollSec = null; ui.sessionId = 's3'; render(); await s(300);
          // Dues de les quatre sopranos no fan la producció: abans de passar llista, «0/2», no «2/4».
          out.quad = document.querySelector('.quad[data-sec="S"] .q-c')?.textContent.trim() === '0/2'
            && document.querySelector('.quad[data-sec="S"] .q-bar span')?.style.width === '0%';
          ui.rollSec = 'S'; render(); await s(300);
          out.head = document.querySelector('.leader .mono')?.textContent.trim() === '0/2 marcats';
          ui.tab = 'calendari'; ui.calProd = 'all'; ui.calView = 'list'; render(); await s(300);
          const h = document.querySelector('.cal-prod-h .cph-b'), t = h?.querySelector('.h2'), m = h?.querySelector('.cph-m');
          out.title = !!(t && m) && m.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1
            && t.getBoundingClientRect().width >= h.getBoundingClientRect().width - 2;
          // Noms: «Cognoms, Nom» es desa i es mostra «Nom Cognoms», i s'ordena igualment per cognom.
          saveMember({ ...S.members.get('mS2'), name: 'Soler Vila, Marta' }); await s(400);
          const mm = S.members.get('mS2');
          out.saved = mm.name === 'Marta Soler Vila' && mm.sortName === 'Soler Vila, Marta';
          const f = JSON.parse(localStorage.getItem('fake:db'));
          const doc = f[Object.keys(f).find(k => k.endsWith('/members/mS2'))];
          out.stored = doc.name === 'Marta Soler Vila' && doc.sortName === 'Soler Vila, Marta';
          out.order = [{ name: 'Pol Quingles', sortName: 'Quingles, Pol' }, { name: 'Anna Vidal' }, { name: 'Marc Bosch' }].sort(byName).map(x => x.name).join() === 'Marc Bosch,Pol Quingles,Anna Vidal';
          saveMember({ ...S.members.get('mS2'), name: 'Marta Soler' }); await s(300);
          out.renamed = S.members.get('mS2').name === 'Marta Soler' && !S.members.get('mS2').sortName;
          // Llistes privades: una marca i, tot seguit, l'app es tanca. La còpia de la cantaire es desa igualment.
          const pr = setAttPrivate(true); await s(400); document.querySelector('#cf-yes')?.click(); await pr; await s(1500);
          setMark(allSessions().find(x => x.id === 's3'), S.members.get('mT2'), { s: 'P' });
          out.pending = pendingWrites() > 0;
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
          document.dispatchEvent(new Event('visibilitychange')); await s(400);
          delete document.visibilityState;
          const f2 = JSON.parse(localStorage.getItem('fake:db'));
          out.mirror = f2[Object.keys(f2).find(k => k.endsWith('/attMine/mT2'))]?.marks?.s3?.s === 'P';
          const p2 = setAttPrivate(false); await s(400); document.querySelector('#cf-yes')?.click(); await p2; await s(1500);
          const f3 = JSON.parse(localStorage.getItem('fake:db'));
          f3[Object.keys(f3).find(k => k.endsWith('/members/mC1'))].name = 'Roca, Neus';
          localStorage.setItem('fake:db', JSON.stringify(f3));
          return out; }""")
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const n = S.members.get('mC1');
          return { old: n.name === 'Neus Roca' && n.sortName === 'Roca, Neus' }; }"""))
        switch_user(page, base, "singer")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          ui.tab = 'avisos'; render(); await s(400);
          const rows = [...document.querySelectorAll('#view .soon-row.is-now, #view .concert-day, #view .next-card.is-now')];
          out.noToday = !rows.some(li => /Concert de tardor/.test(li.textContent));
          applyRoute('assistencia'); render(); await s(300);
          const att = [...document.querySelectorAll('#view .section-title')].find(x => /La meva assistència/.test(x.textContent));
          out.myProd = !!att && /Concert de Nadal/.test(att.textContent);
          return out; }"""))
        for k, label in [("quad", "a la llista, qui no fa la producció no compta: la corda surt «0/2», sense barra"),
                         ("head", "i dins la corda, «0/2 marcats»"),
                         ("title", "al calendari, el títol de la producció té tota l'amplada i les sessions van a sota"),
                         ("saved", "un nom «Cognoms, Nom» passa a «Nom Cognoms» i guarda l'original per ordenar"),
                         ("stored", "i es desa així"), ("order", "els noms s'ordenen per cognom"),
                         ("renamed", "si se li canvia el nom, l'ordre antic ja no hi compta"),
                         ("old", "les fitxes antigues amb coma també es mostren «Nom Cognoms»"),
                         ("pending", "amb les llistes privades, la còpia que espera compta com a pendent de desar"),
                         ("mirror", "i si es tanca l'app just després de marcar, es desa igualment"),
                         ("noToday", "qui no fa la producció no veu el concert d'avui a Inici"),
                         ("myProd", "«La meva assistència» ensenya la producció que sí que fa")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb els noms i les produccions que no es fan", "; ".join(errors[:3]))
        ctx.close()

        print("Llistes pendents de tot el cor, Personal lleuger i error de Safari")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
          // Una sessió d'ahir sense cap llista: la del tenor (la seva corda) i les de les altres tres cordes.
          const p = clone(S.productions.get('p1'));
          p.sessions.push({ id: 'sahir', date: d(-1), time: '20:30', end: '22:30', type: 'Assaig', place: 'Sala', note: '' });
          saveProduction(p); await s(300);
          // Quantes en surten depèn de l'hora: passades les 22:30, la d'avui també és per acabar.
          const month = isoDate(new Date(Date.now() - 30 * 864e5)), n = sec => pendingSessions(sec).filter(x => x.date >= month).length;
          // L'administració que també porta els tenors: les de la seva corda, i a part les de les altres tres.
          out.own = todoItems().some(x => /^(1 llista|\d+ llistes) per acabar/.test(x.t) && /Tenors/.test(x.s) && x.s.includes(ddmm(d(-1))));
          const all = todoItems().find(x => /llist(a|es) sense acabar a les altres cordes/.test(x.t));
          out.others = !!all && ['S', 'C', 'B'].every(k => n(k) > 0 && all.s.includes(`${SEC[k].name} ${n(k)}`)) && !all.s.includes(SEC.T.name) && all.t.startsWith(`${n('S') + n('C') + n('B')} llist`);
          ui.people = 'singer'; applyRoute('gestio/personal'); render(); await s(400);
          const rows = [...document.querySelectorAll('details.pm')];
          out.lazy = rows.length > 10 && rows.every(x => !x.open && !x.querySelector('.pm-b').childElementCount);
          rows[0].open = true; await s(200);
          out.opens = rows[0].querySelector('.pm-b').childElementCount > 0 && /Alta/.test(rows[0].querySelector('.pm-b').innerText);
          document.querySelector('[data-act="people-tools"]').click(); await s(300);
          out.label = /Revisa els accessos/.test(document.querySelector('.sheet [data-act="mail-check"]')?.textContent || '');
          closeSheet(); await s(200);
          return out; }""")
        # L'error de Safari amb la còpia del mòbil: l'app es torna a obrir sola, i només un cop cada deu minuts.
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          const reason = new Error('Attempt to get records from database without an in-progress transaction');
          window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }));
          await s(200);
          return { noted: FAILURES.queue.concat([]).some(x => x.where.startsWith('safari-idb')) || FAILURES.sent > 0,
                   marked: !!sessionStorage.getItem('atempo:idb-recarrega') }; }"""))
        page.wait_for_timeout(1500)
        page.wait_for_function(READY, timeout=20000)
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms));
          window.__encara = 1;
          const reason = new Error('Attempt to get records from database without an in-progress transaction');
          window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }));
          await s(1500);
          return { once: window.__encara === 1 }; }"""))
        for k, label in [("own", "el cap de corda veu les llistes per acabar de la seva corda"),
                         ("others", "i l'administració, les de totes les cordes, amb quantes n'hi ha a cadascuna"),
                         ("lazy", "a Personal, la fitxa de cada persona no es pinta fins que s'obre"),
                         ("opens", "i en obrir-la hi és tota"),
                         ("label", "el botó diu «Revisa els accessos»"),
                         ("noted", "l'error de Safari amb la còpia del mòbil queda apuntat i marcat"),
                         ("marked", "i l'app es torna a obrir sola"),
                         ("once", "però no més d'un cop cada deu minuts")]:
            check(r.get(k), label, str(r))
        check(not [e for e in errors if "in-progress transaction" not in e], "sense errors amb les llistes pendents i Personal", "; ".join(errors[:3]))
        ctx.close()

        print("La setmana sencera a Inici, inicials, material, anuncis vistos i assistència en minuts")
        ctx, page, errors = open_app(browser, base, "singer", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          applyRoute('inici'); render(); await s(300);
          const kinds = [...document.querySelectorAll('.soon-row .soon-k')].map(x => x.textContent);
          out.week = kinds.some(t => /Proper assaig/.test(t)) && kinds.some(t => /Assaig general/.test(t)) && kinds.some(t => /Proper concert/.test(t));
          out.ini = personInitials({ name: 'Laia Dalmau Tomàs', sortName: 'Dalmau Tomàs, Laia' }) === 'LD' && personInitials('Laia Dalmau Tomàs') === 'LD'
            && personInitials('Pau Diport i Feliu') === 'PD' && personInitials('Quingles, Pol') === 'PQ' && personInitials('') === '?';
          applyRoute('assistencia'); render(); await s(300);
          const card = document.querySelector('.my-att')?.innerText || '';
          out.mins = /6 h de 6 h d’assaig/.test(card) && !/de \\d+ assajos/.test(card);
          out.hint = /Encara pots perdre 2 h 24 min d’assaig/.test(card);
          applyRoute('tauler/repertori'); ui.board = 'materials'; render(); await s(300);
          const chips = [...document.querySelectorAll('.work-k .mat-k')];
          out.icons = chips.length > 0 && chips.every(x => x.querySelector('svg') && !/PART|ÀUDI|ALTR/i.test(x.textContent)) && chips.some(x => x.getAttribute('aria-label') === 'Partitura');
          out.site = linkSite('https://open.spotify.com/album/x') === 'Spotify' && linkSite('https://youtu.be/x') === 'YouTube' && linkSite('https://example.com/a.pdf') === 'enllaç';
          ui.board = 'anuncis'; applyRoute('tauler/anuncis'); render(); await s(400);
          render(); await s(400);
          const doc = await firebase.firestore().doc(`cors/${GID}/annSeen/n1`).get();
          out.seen = doc.exists && doc.data().S === 1 && Object.keys(doc.data()).length === 1;
          out.mark = (await firebase.firestore().doc(`cors/${GID}/annSeen/n1/by/uid-singer`).get()).exists;
          out.noLine = !document.querySelector('.ann-seen');
          return out; }""")
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          ui.board = 'anuncis'; applyRoute('tauler/anuncis'); render(); await s(500);
          const line = document.querySelector('.ann[data-ann="n1"] .ann-seen')?.innerText || '';
          out.line = /L’han obert a l’app 1 de 16/.test(line) && /S 1\/4/.test(line) && /T 0\/4/.test(line);
          const doc = await firebase.firestore().doc(`cors/${GID}/annSeen/n1`).get();
          out.author = !('T' in doc.data());
          const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
          saveProduction({ id: 'p9', name: 'Un sol concert', sessions: [{ id: 's9', date: d(40), time: '19:00', end: '', type: 'Concert', place: '', note: '' }], excluded: [] });
          applyRoute('calendari'); render(); await s(400);
          out.one = [...document.querySelectorAll('.cph-m .mono')].some(x => x.textContent.trim() === '1 sessió') && ![...document.querySelectorAll('.cph-m .mono')].some(x => /^1 sessions/.test(x.textContent.trim()));
          // «Ha marxat abans», a la llista d'avui dels tenors (la corda que porta).
          applyRoute('inici'); render(); await s(300);
          document.querySelector('[data-act="home-roll"]').click(); await s(500);
          const row = () => document.querySelector('#roster .row[data-mid="mT2"]');
          row().querySelector('[data-act="mark"][data-s="P"]').click(); await s(200);
          out.addBtn = !!row().querySelector('.early-add');
          row().querySelector('.early-add').click(); await s(200);
          const inp = row().querySelector('[data-bind="early"]');
          inp.value = '30'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); await s(300);
          const mk = () => attDoc('s3', 'T')?.marks?.mT2 || {};
          out.early = mk().s === 'P' && mk().early === 30 && /ha marxat 30′ abans/.test(row().querySelector('.state').textContent);
          out.earlyMins = markMins(sessionById('s3'), mk()).done === 90;
          row().querySelector('[data-act="mark"][data-s="FJ"]').click(); await s(200);
          out.earlyGone = mk().s === 'FJ' && !('early' in mk());
          // «No fa» en una llista: deixa de fer tota la producció (i es pot desfer desmarcant-ho).
          const row3 = () => document.querySelector('#roster .row[data-mid="mT3"], .np-group .row[data-mid="mT3"]');
          row3().querySelector('[data-act="mark"][data-s="NP"]').click(); await s(400);
          out.npProd = (S.productions.get('p1').excluded || []).includes('mT3') && !!document.querySelector('.np-group .row[data-mid="mT3"]') && !document.querySelector('#roster .row[data-mid="mT3"]');
          out.npNext = isOut(sessionById('s4'), S.members.get('mT3'));
          row3().querySelector('[data-act="mark"][data-s="NP"]').click(); await s(400);
          out.npBack = !(S.productions.get('p1').excluded || []).includes('mT3') && !!document.querySelector('#roster .row[data-mid="mT3"]');
          return out; }"""))
        for k, label in [("week", "Inici ensenya tots els assajos dels set dies que vénen (també el general), i el proper concert"),
                         ("ini", "les inicials són la del nom i la del primer cognom"),
                         ("mins", "«La meva assistència» diu les hores d'assaig fetes, no quants assajos"),
                         ("hint", "i quants minuts d'assaig es poden perdre encara"),
                         ("icons", "el material porta una icona per tipus, no quatre lletres"),
                         ("site", "els enllaços diuen d'on són (Spotify, YouTube…)"),
                         ("seen", "en obrir els anuncis, la cantaire suma 1 a la seva corda, un sol cop"),
                         ("mark", "i en deixa constància a nom seu"),
                         ("noLine", "la cantaire no veu quanta gent l'ha obert"),
                         ("line", "l'equip veu quanta gent l'ha obert, per cordes"),
                         ("author", "qui l'ha escrit no compta"),
                         ("one", "«1 sessió», no «1 sessions»"),
                         ("addBtn", "a la llista, qui hi és té el botó «Ha marxat abans»"),
                         ("early", "i s'hi posen els minuts que s'ha perdut del final"),
                         ("earlyMins", "que es resten del temps d'assaig"),
                         ("earlyGone", "si passa a ser una falta, ja no compta que ha marxat abans"),
                         ("npProd", "marcar «No fa» el treu de tota la producció i passa a «De baixa o no fan la producció»"),
                         ("npNext", "i a les sessions que vénen ja no hi és"),
                         ("npBack", "desmarcant-ho, torna a fer la producció")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb la setmana, el material i els anuncis vistos", "; ".join(errors[:3]))
        ctx.close()

        print("Entrar amb l'enllaç del cor: l'enllaç, la petició i l'aprovació")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.btn = !!document.querySelector('.access-acts [data-act="join-link"]');
          document.querySelector('.access-acts [data-act="join-link"]').click(); await s(800);
          const code = S.config.joinCode;
          const doc = code ? (await firebase.firestore().doc(`cors/${GID}/join/${code}`).get()).data() : null;
          out.code = !!code && /^[a-z0-9]{10,40}$/.test(code);
          out.list = !!doc && doc.active === true && doc.people.length === [...S.members.values()].filter(m => m.active !== false && !accountFor(m.id)).length
            && doc.people.some(p => p.id === 'mT2' && p.n === 'Oriol Camps') && !doc.people.some(p => p.id === 'mS0');
          out.url = (document.querySelector('#jn-url')?.textContent || '').includes(`a=${GID}&uneix=${code}`);
          out.qr = !!document.querySelector('#jn-qr svg') || /QR/.test(document.querySelector('#jn-qr')?.textContent || '');
          closeSheet(); return { ...out, codeValue: code, gidValue: GID }; }""")
        code, gid = r.pop("codeValue"), r.pop("gidValue")
        # La pàgina d'abans encara pot estar desant (i el navegador talla la càrrega): si passa, s'hi torna.
        for i in range(3):
            try:
                page.goto(f"{base}/index.html?u=nou&a={gid}&uneix={code}")
                break
            except Exception:
                page.wait_for_timeout(800)
        page.wait_for_function("typeof S !== 'undefined' && S.mode === 'join' && JOIN && JOIN.step === 'pick'", timeout=20000)
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.screen = !!document.querySelector('.join-card') && /Entra a l’app/.test(document.querySelector('.join-card').innerText);
          const q = document.querySelector('#jn-q'); q.value = 'oriol'; q.dispatchEvent(new Event('input')); await s(100);
          out.search = document.querySelectorAll('#jn-list [data-jn-pick]').length === 1;
          document.querySelector('#jn-list [data-jn-pick="mT2"]').click(); await s(150);
          document.querySelector('[data-act="jn-send"]').click(); await s(500);
          const req = (await firebase.firestore().doc(`cors/${JOIN.gid}/joinReq/nou@exemple.cat`).get()).data();
          out.sent = JOIN.step === 'sent' && !!req && req.memberId === 'mT2' && req.section === 'T' && req.email === 'nou@exemple.cat';
          return out; }"""))
        switch_user(page, base, "pol")
        r.update(page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          out.todo = todoItems().some(x => x.icon === 'join' && /1 persona vol entrar/.test(x.t));
          ensureStaff(); await s(400);
          sheetJoinReqs(); await s(300);
          out.row = !!document.querySelector('.sheet .jr [data-jr-mem]') && document.querySelector('.sheet .jr [data-jr-mem]').value === 'mT2';
          document.querySelector('.sheet [data-act="join-approve"]').click(); await s(900);
          const acc = (await firebase.firestore().doc(`cors/${GID}/staff/nou@exemple.cat`).get()).data();
          out.approved = !!acc && acc.memberId === 'mT2' && acc.roles.includes('singer');
          out.gone = !(await firebase.firestore().doc(`cors/${GID}/joinReq/nou@exemple.cat`).get()).exists;
          const doc = (await firebase.firestore().doc(`cors/${GID}/join/${S.config.joinCode}`).get()).data();
          out.listed = !doc.people.some(p => p.id === 'mT2');
          return out; }"""))
        switch_user(page, base, "nou")
        r.update(page.evaluate("""() => ({ inside: S.mode === 'shared' && myMemberId() === 'mT2', noIntent: !localStorage.getItem('atempo:uneix') })"""))
        for k, label in [("btn", "a Personal hi ha «Enllaç i QR per entrar»"),
                         ("code", "en obrir-lo es fa un codi"),
                         ("list", "amb la llista de qui encara no té accés (nom i primer cognom)"),
                         ("url", "i l'enllaç porta l'agrupació i el codi"),
                         ("qr", "i el QR"),
                         ("screen", "qui obre l'enllaç sense accés veu «Entra a l'app…»"),
                         ("search", "busca el seu nom"),
                         ("sent", "i en demana l'accés"),
                         ("todo", "a l'administració li surt a «Per fer»"),
                         ("row", "la petició ve amb la fitxa que ha triat"),
                         ("approved", "i en donar-li accés té el compte amb la seva fitxa"),
                         ("gone", "la petició s'esborra"),
                         ("listed", "i ja no surt a la llista de l'enllaç"),
                         ("inside", "la persona entra a l'app amb la seva fitxa"),
                         ("noIntent", "i l'enllaç ja no es torna a obrir")]:
            check(r.get(k), label, str(r))
        check(not [e for e in errors if "qrcode" not in e], "sense errors amb l'enllaç del cor", "; ".join(errors[:3]))
        ctx.close()

        print("Mira l'app com…")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE, "#/gestio/personal")
        page.wait_for_function("S.staffReady", timeout=5000)
        page.click('.access-acts [data-act="people-tools"]'); page.wait_for_timeout(400)
        page.click('.sheet [data-act="preview-on"]'); page.wait_for_timeout(400)
        r = page.evaluate("({ roles: !!document.querySelector('#pv-role'), who: [...document.querySelectorAll('#pv-who option')].map(o => o.textContent) })")
        check(r["roles"] and any(x.startswith("Anna Puig") for x in r["who"]), "es tria el rol i la persona concreta (de primeres, els cantaires)", str(r))
        page.select_option("#pv-who", page.evaluate("previewPeople('singer').find(x => x.label.startsWith('Anna')).key"))
        page.click("#pv-ok"); page.wait_for_timeout(500)
        r = page.evaluate("({ edit: canEdit(), admin: isAdmin(), banner: document.querySelector('.preview-banner')?.innerText || '', tabs: tabsForRole().join() })")
        check(not r["edit"] and not r["admin"] and "Anna" in r["banner"] and r["tabs"].startswith("avisos,llista,calendari,tauler"), "com una cantaire: les seves pestanyes, i no edita ni administra", str(r))
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
          const out = { teach: teachesClasses(), edit: canEdit(), tabs: tabsForRole(), cl: clTabKeys() }; stopPreview();
          const anna = previewPeople('singer').find(x => x.label.startsWith('Anna'));
          startPreview({ ...anna.person, label: 'Cantaire' }); out.singerEdit = canEdit(); out.me = myId(); out.gestio = roleTabs().includes('gestio');
          stopPreview();
          // Una persona amb dos rols: el cap de corda dels tenors, que també hi canta (la llavor en té un).
          const lead = previewPeople('leader').find(x => x.key === 'T');
          startPreview({ ...lead.person, label: 'Cap de corda' }); out.leadTabs = tabsForRole().join(); out.leadAreas = attAreas().join();
          stopPreview(); out.back = ui.tab === 'gestio' && isAdmin(); return out; }""")
        check(r["teach"] and not r["edit"] and "classes" in r["tabs"] and "alumnes" in r["cl"], "com el professor de cant: porta les classes (amb els seus alumnes) i no edita res més", str(r))
        check(not r["singerEdit"] and r["me"] and not r["gestio"], "com un cantaire: veu el seu espai i no Gestió", str(r))
        check(r["leadTabs"].startswith("avisos,llista,calendari,tauler") and r["leadAreas"] == "me,sec", "com el cap de corda que també canta: les pestanyes dels dos rols", str(r))
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
          // Sense el consentiment no es desen; amb ell, van a part (health), no a la fitxa.
          out.dietAsk = !!document.querySelector('#pf-diet');
          document.querySelector('#pf-diet-ok').checked = true; document.querySelector('#pf-save').click(); await s(400);
          const prof = (await firebase.firestore().doc(`cors/${GID}/profiles/${myMemberId()}`).get()).data() || {};
          out.diet = out.dietAsk && (await firebase.firestore().doc(`cors/${GID}/health/${myMemberId()}`).get()).data()?.diet === 'Celíaca' && !('diet' in prof);
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
        for k, label in [("trip", "el cantaire respon les preguntes de la sortida"), ("diet", "el cantaire posa les seves al·lèrgies (amb el consentiment, i a part de la fitxa)"),
                         ("busAsked", "en confirmar un concert amb autocar, es pregunta com hi va"), ("bus", "i queda desat que va amb l'autocar"),
                         ("task", "el cantaire s'apunta de voluntari a carregar el material"), ("plan", "el cantaire veu el seu parcial (i pot veure tot el pla)"),
                         ("week", "«La setmana» es pot obrir"), ("weekPlan", "«La setmana» porta el pla dels pròxims assajos")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors al cantaire", "; ".join(errors[:3]))
        switch_user(page, base, "pol")
        r = page.evaluate("""async () => { const out = {};
          await loadProfiles();
          const rows = tripRows(S.trips.get('t1'));
          // L'administració hi té les respostes, però no les al·lèrgies: només les veuen la secretaria i la gerència.
          out.tripXls = rows[0].includes('Dinaràs dissabte?') && !rows[0].includes('Al·lèrgies i intoleràncies') && rows.some(x => x.includes('Sí')) && !rows.some(x => x.includes('Celíaca'));
          out.tasks = taskPeople(sessionById('s6'), 'k1').length === 1 && rsvpPanel(sessionById('s6')).includes('Autocar: <b>1</b>');
          return out; }""")
        check(r["tripXls"], "l'Excel de la sortida porta les respostes, i les al·lèrgies no hi surten per a l'administració", str(r))
        check(r["tasks"], "l'equip veu qui va amb autocar i qui s'ha apuntat de voluntari", str(r))
        switch_user(page, base, "ger")
        r = page.evaluate("""async () => { await loadProfiles(); const rows = tripRows(S.trips.get('t1'));
          return rows[0].includes('Al·lèrgies i intoleràncies') && rows.some(x => x.includes('Celíaca') && x.includes('Sí')); }""")
        check(r, "per a la gerència, l'Excel de la sortida porta les al·lèrgies", str(r))
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

        print("Bandes: l'esborrany, l'anunci, la papereta, el recompte, el desempat, el palmarès i la gala")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          ui.tab = 'tauler'; ui.board = 'enquestes'; render(); await s(200);
          document.querySelector('[data-act="bandes-new"]').click(); await s(400);
          const el = document.querySelector('.sheet');
          el.querySelector('#bd-cats').value = 'Cor: qui més hi és\\nSoprano: la millor\\n\\nDe parella\\nParella: la del cor';
          el.querySelector('#bd-cats').dispatchEvent(new Event('input', { bubbles: true })); await s(300);
          const prev = el.querySelector('#bd-prev').innerText;
          out.prev = /3 categories/i.test(prev) && prev.includes('Sopranos') && prev.includes('Parella');
          el.querySelector('#bd-close').value = addDays(TODAY, 5);
          el.querySelector('#bd-save').click(); await s(400); flushAll(); await s(300);
          const p = [...S.polls.values()].find(isBandes);
          out.draft = !!p && p.draft === true && p.cats.length === 3 && p.cats[1].sec === 'S' && p.cats[2].pair && !openPolls().some(x => x.id === p.id);
          document.querySelector(`[data-act="bandes-publish"][data-id="${p.id}"]`).click(); await s(300);
          document.querySelector('#bp-ok').click(); await s(400); flushAll(); await s(400);
          const q = S.polls.get(p.id), a = S.announcements.get(q.annId);
          out.pub = !q.draft && !!a && a.pollId === q.id && a.pinned && a.body.includes('**Soprano**') && a.body.includes('BANDES DE PARELLA');
          return out; }""")
        for k, label in [("prev", "l'editor de bandes llegeix les categories (les d'una corda i les de parella) i les ensenya"),
                         ("draft", "les bandes es desen com a esborrany, que encara no es pot votar"),
                         ("pub", "en publicar-les surt un anunci fixat amb totes les categories i el botó per votar")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          const p = [...S.polls.values()].find(isBandes);
          out.todo = !!document.querySelector('.h-todo [data-act="bandes-vote"]');
          sheetBallot(p.id); await s(300);
          out.intro = /vot és secret/.test(document.querySelector('.sheet-b').innerText);
          const next = async () => { document.querySelector('.sheet [data-bb="next"]').click(); await s(150); };
          const names = () => [...document.querySelectorAll('.bb-p .bb-n')].map(x => x.textContent);
          await next();
          out.noSelf = names().length === 15 && !names().includes('Anna Puig');
          document.querySelector('.bb-p').click(); await s(100);
          await next();
          out.secOnly = names().length === 3 && names().every(n => ['Laia Ferrer', 'Marta Soler', 'Clara Vila'].includes(n));
          document.querySelector('.bb-p').click(); await s(100);
          await next();
          document.querySelectorAll('.bb-p')[0].click(); await s(100);
          await next(); out.pairNeedsTwo = document.querySelector('.bb-name')?.textContent === 'Parella';
          document.querySelectorAll('.bb-p')[1].click(); await s(100);
          await next();
          out.review = /Has votat 3 de 3/.test(document.querySelector('.sheet-b').innerText);
          document.querySelector('.sheet [data-bb="send"]').click(); await s(300); flushAll(); await s(400);
          const v = (await firebase.firestore().doc(`cors/${GID}/pollVotes/${p.id}_${myId()}`).get()).data();
          out.sent = !!v && v.n === 3 && v.picks[p.cats[2].id].length === 2;
          out.todoGone = !document.querySelector('.h-todo [data-act="bandes-vote"]');
          return out; }""")
        for k, label in [("todo", "a Inici, el cantaire hi té «Vota»"), ("intro", "la papereta explica que el vot és secret"),
                         ("noSelf", "a la papereta hi surt tothom menys un mateix"), ("secOnly", "a la banda d'una corda només hi surt aquella corda"),
                         ("pairNeedsTwo", "una parella necessita dues persones"), ("review", "abans d'enviar-lo es revisa el vot"),
                         ("sent", "el vot s'envia amb el que s'ha triat a cada categoria"), ("todoGone", "i ja no surt a «Per fer»")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "pol")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          const F = firebase.firestore(), TS = firebase.firestore.FieldValue.serverTimestamp, p = [...S.polls.values()].find(isBandes), [k1, k2, k3] = p.cats.map(c => c.id);
          const id = n => [...S.members.values()].find(m => m.name === n).id;
          const put = async (n, picks) => { const m = S.members.get(id(n)); await F.doc(`cors/${GID}/pollVotes/${p.id}_${m.id}`).set({ pollId: p.id, memberId: m.id, section: m.section, picks, n: Object.keys(picks).length, choices: [], at: new Date().toISOString(), syncAt: TS() }); };
          await put('Júlia Mas', { [k1]: [id('Clara Vila'), id('Marta Soler')], [k2]: [id('Laia Ferrer')] });
          await put('Pere Font', { [k1]: [id('Clara Vila')], [k3]: [id('Marta Soler'), id('Laia Ferrer')] });
          await s(900); ui.tab = 'tauler'; ui.board = 'enquestes'; render(); await s(200);
          out.part = /Han votat 3 de 16/.test(document.querySelector(`[data-poll="${p.id}"]`)?.innerText || '');
          remindPoll(p.id); await s(300);
          out.remind = /13 persones encara no han respost/.test(document.querySelector('.sheet-b').innerText);
          sheetBandesResults(p.id); await s(300);
          out.gate = !!document.querySelector('#br-peek');
          document.querySelector('#br-peek').click(); await s(300);
          out.tie = /Hi ha un empat per decidir: Cor/.test(document.querySelector('.sheet-b').innerText);
          document.querySelector('#br-pub').click(); await s(200);
          out.blocked = /Primer cal desfer/.test(document.querySelector('.toast')?.innerText || '');
          document.querySelector(`[data-tie][data-k="${id('Marta Soler')}"]`).click(); await s(400);
          out.decided = (S.polls.get(p.id).ties?.[k1] || [])[0] === id('Marta Soler') && !document.querySelector('.bd-warn');
          document.querySelector('#br-pub').click(); await s(300); document.querySelector('#cf-yes').click(); await s(500); flushAll(); await s(300);
          const q = S.polls.get(p.id), sorted = l => JSON.stringify([...l].sort());
          out.results = q.closed && sorted(q.results[k1]) === sorted([id('Clara Vila'), id('Marta Soler')]) && q.results[k2][0] === id('Laia Ferrer')
            && q.results[k3][0] === [id('Laia Ferrer'), id('Marta Soler')].sort().join('+');
          closeSheet(); sheetPollResults(p.id); await s(300);
          const who = document.querySelector('.sheet-b').innerText;
          out.whoNoPicks = /Ha votat/.test(who) && !who.includes('Parella') && !who.includes('Soprano ·');
          closeSheet(); bandesGala(p.id); await s(200);
          const g = document.querySelector('.gala');
          for (let k = 0; k < 3; k++) { g.querySelector('[data-g="next"]').click(); await s(120); }
          out.gala = /la banda és per a/i.test(g.innerText) && g.innerText.includes('Clara Vila') && g.innerText.includes('Marta Soler');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await s(200);
          out.galaClosed = !document.querySelector('.gala') && document.body.style.overflow === '';
          return out; }""")
        for k, label in [("part", "l'equip veu quanta gent ha votat"), ("remind", "«Recorda-ho» va a qui encara no ha votat"),
                         ("gate", "amb la votació oberta, els resultats s'ensenyen només si es vol"), ("tie", "els resultats diuen on hi ha un empat"),
                         ("blocked", "no es pot publicar el palmarès amb un empat sense desfer"), ("decided", "l'equip desfà l'empat"),
                         ("results", "el palmarès publicat té qui guanya cada banda (també la parella) i tanca la votació"),
                         ("whoNoPicks", "«Qui ha votat» no diu què ha votat ningú"), ("gala", "la gala revela qui guanya cada banda"),
                         ("galaClosed", "i es tanca amb Esc")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms));
          ui.tab = 'tauler'; ui.board = 'enquestes'; render(); await s(200);
          const c = document.querySelector('.poll.bandes');
          return !!c && c.innerText.includes('Palmarès') && c.innerText.includes('Clara Vila') && !c.querySelector('[data-act="bandes-vote"]'); }""")
        check(r, "el cantaire veu el palmarès, i ja no pot votar", str(r))
        check(not errors, "sense errors a les bandes", "; ".join(errors[:3]))
        ctx.close()

        print("La Nit de les Bandes: la pàgina, els finalistes de cada dia, l'anell dels resultats i la gala")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          const now = new Date().toISOString(), id = n => [...S.members.values()].find(m => m.name === n).id;
          const p = { id: 'bn1', kind: 'bandes', title: 'Bandes de proves', description: 'Hola', picks: 2, win: 2, sections: [], out: [], selfOk: false,
            cats: [{ id: 'k1', name: 'Cor', desc: 'qui més hi és', pair: false, sec: '', win: 2 }, { id: 'k2', name: '"Soprano"', desc: '', pair: false, sec: 'S', win: 1 }, { id: 'k3', name: 'Parella', desc: '', pair: true, sec: '', win: 1 }],
            closesAt: addDays(TODAY, -1), galaAt: addDays(TODAY, 2), galaPlace: 'el sopar', closed: false, draft: false, createdAt: now, author: 'Pol' };
          S.polls.set(p.id, p); persist('polls', p.id, p, 10);
          const F = firebase.firestore(), TS = firebase.firestore.FieldValue.serverTimestamp;
          const put = async (n, picks) => { const m = S.members.get(id(n)); await F.doc(`cors/${GID}/pollVotes/bn1_${m.id}`).set({ pollId: 'bn1', memberId: m.id, section: m.section, picks, n: Object.keys(picks).length, choices: [], at: now, syncAt: TS() }); };
          await put('Anna Puig', { k1: [id('Laia Ferrer'), id('Marc Bosch')], k2: [id('Laia Ferrer')], k3: [id('Laia Ferrer'), id('Marc Bosch')] });
          await put('Júlia Mas', { k1: [id('Laia Ferrer')], k2: [id('Clara Vila')] });
          await put('Pere Font', { k1: [id('Marc Bosch'), id('Pau Riera')], k3: [id('Marc Bosch'), id('Laia Ferrer')] });
          flushAll(); await s(900);
          ui.tab = 'avisos'; render(); await s(300);
          out.home = /Falten 2 dies/.test(document.querySelector('.bn-home')?.innerText || '');
          const todo = document.querySelector('.h-todo [data-act="bandes-nominate"][data-id="bn1"]');
          out.todo = !!todo; todo?.click(); await s(300);
          document.querySelector('#bn-every .pick[data-v="day"]').click(); await s(100);
          out.plan = /Una cada dia/.test(document.querySelector('#bn-plan').textContent);
          document.querySelector('#bn-ok').click(); await s(400); flushAll(); await s(300);
          const q = S.polls.get('bn1'), abc = l => [...l].sort((a, b) => keyName(a).localeCompare(keyName(b), 'ca'));
          out.noms = q.closed && JSON.stringify(q.nominees.k1) === JSON.stringify(abc([id('Laia Ferrer'), id('Marc Bosch'), id('Pau Riera')]))
            && JSON.stringify(nomSchedule(q)) === JSON.stringify([TODAY, addDays(TODAY, 1), addDays(TODAY, 2)]);
          document.querySelector('[data-act="bandes-open"]').click(); await s(400);
          out.route = location.hash === '#/bandes' && ui.tab === 'bandes';
          const pg0 = document.querySelector('.bn-page')?.innerText || '';
          out.sealed = !!document.querySelector('.bn-nom.sealed .bn-seal') && !pg0.includes('Pau Riera');
          document.querySelector('.bn-seal').click(); await s(700);
          const pg = document.querySelector('.bn-page')?.innerText || '';
          out.page = /finalistes/i.test(pg) && /avui/i.test(pg) && pg.includes('Pau Riera') && pg.includes('Encara per revelar (2)') && !!document.querySelector('.bn-team');
          render(); await s(200);
          out.stays = !document.querySelector('.bn-nom.sealed') && (document.querySelector('.bn-page')?.innerText || '').includes('Pau Riera');
          // La invitació sencera: l'hora (compte enrere per hores), l'etiqueta, el programa, la inscripció al sopar i el calendari.
          const t = { id: 'tn1', title: 'Sopar de la Nit', from: q.galaAt, to: q.galaAt, deadline: addDays(TODAY, 1), sections: [], questions: [] };
          S.trips.set(t.id, t); persist('trips', t.id, t, 10);
          const q2 = { ...clone(S.polls.get('bn1')), galaTime: '21:30', galaDress: 'Vestit de gala', program: parseProgram('21:30 Sopar\\n23h Entrega de les bandes\\nFesta'), galaInfo: 'Són **35 €**', tripId: 'tn1' };
          S.polls.set('bn1', q2); persist('polls', 'bn1', q2, 10); flushAll(); render(); await s(300);
          out.invite = document.querySelectorAll('.bn-count[data-at] .bn-u').length === 3 && /Vestit de gala/.test(document.querySelector('.bn-hero').innerText)
            && document.querySelector('.bn-t i')?.textContent === 'de les' && !!document.querySelector('.bn-hero [data-act="bandes-ics"]');
          out.prog = [...document.querySelectorAll('.bn-prog li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim()).join('|') === '21:30 Sopar|23:00 Entrega de les bandes|· Festa'
            && /35 €/.test(document.querySelector('.bn-prac')?.innerText || '') && !!document.querySelector('.bn-sign [data-act="trip-yes"][data-id="tn1"]');
          const ics = galaIcs(q2);
          out.ics = /SUMMARY:La Nit de les Bandes/.test(ics) && ics.includes(`DTSTART;TZID=Europe/Madrid:${q2.galaAt.replace(/-/g, '')}T213000`) && /Etiqueta: Vestit de gala/.test(ics);
          sheetAccount(); await s(200);
          out.menu = !!document.querySelector('.acct-item[data-act="bandes-open"]'); closeSheet(); await s(100);
          sheetBandesResults('bn1'); await s(400);
          out.pies = document.querySelectorAll('.bd-pie').length === 3 && document.querySelectorAll('.bd-idx .chip').length === 3 && !!document.querySelector('.bd-top');
          closeSheet(); bandesGala('bn1'); await s(200);
          const g = document.querySelector('.gala'), nx = async () => { g.querySelector('[data-g="next"]').click(); await s(150); };
          await nx(); await nx(); out.galaFin = /els finalistes són/i.test(g.innerText) && g.innerText.includes('Pau Riera');
          await nx(); out.galaWin = /la banda és per a/i.test(g.innerText) && g.innerText.includes('Laia Ferrer') && g.innerText.includes('Marc Bosch') && !g.innerText.includes('Pau Riera');
          out.suspense = !!g.querySelector('.gala-w:not(.now) .gala-roll');
          g.querySelector('.gala-c').click(); await s(100);
          out.reveal = !!g.querySelector('.gala-w.now');
          for (let k = 0; k < 7; k++) await nx();
          out.galaEnd = /Enhorabona a tothom/.test(g.innerText) && g.querySelectorAll('.gala-palm li').length === 3;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await s(200);
          return out; }""")
        for k, label in [("home", "a Inici surt el compte enrere de la Nit"), ("todo", "quan es tanca la votació, l'equip té a «Per fer» publicar els finalistes"),
                         ("plan", "en publicar-los, diu com es revelaran"), ("noms", "els finalistes es desen per ordre alfabètic, i es revelen un cada dia fins a la Nit"),
                         ("route", "la Nit té la seva pàgina (#/bandes)"), ("sealed", "els finalistes d'avui arriben dins d'un sobre tancat"),
                         ("page", "en obrir el sobre, la pàgina ensenya els finalistes d'avui i diu quants en falten"), ("stays", "i el sobre queda obert"),
                         ("invite", "la invitació té el compte enrere per hores, l'etiqueta i «afegeix-la al calendari»"),
                         ("prog", "el programa, la informació pràctica i la inscripció al sopar"), ("ics", "el calendari porta l'hora, el nom i l'etiqueta"),
                         ("menu", "la Nit surt al menú del compte"), ("pies", "els resultats tenen l'anell de cada categoria, l'índex i qui ha rebut més vots"),
                         ("galaFin", "a la gala, primer els finalistes"), ("galaWin", "i després qui s'emporta la banda"),
                         ("suspense", "amb un moment de suspens"), ("reveal", "que es pot saltar tocant la pantalla"), ("galaEnd", "i al final, el palmarès sencer")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms));
          ui.tab = 'bandes'; render(); await s(300);
          const pg = document.querySelector('.bn-page')?.innerText || '';
          return { shown: pg.includes('Pau Riera'), hidden: !pg.includes('Clara Vila'), team: !document.querySelector('.bn-team'), voted: /Has votat 3 de 3/.test(pg) }; }""")
        for k, label in [("shown", "el cantaire veu els finalistes ja revelats"), ("hidden", "però no els dels dies que vénen"),
                         ("team", "i no hi té les eines de l'equip"), ("voted", "i hi veu el seu vot")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors a la Nit de les Bandes", "; ".join(errors[:3]))
        ctx.close()

        print("Bandes: les propostes de categories, quanta gent ha votat i els diplomes")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          const p = { id: 'bp1', kind: 'bandes', title: 'Bandes de proves', description: '', picks: 2, win: 2, sections: [], out: [], selfOk: false, draft: true,
            cats: [{ id: 'k1', name: 'Cor', desc: '', pair: false, sec: '', win: 2 }, { id: 'k2', name: 'Parella', desc: '', pair: true, sec: '', win: 1 }],
            closesAt: addDays(TODAY, 10), galaAt: addDays(TODAY, 20), createdAt: new Date().toISOString(), author: 'Pol' };
          S.polls.set(p.id, p); persist('polls', p.id, p, 10); flushAll(); await s(300);
          ui.tab = 'bandes'; render(); await s(300);
          document.querySelector('.bn-team [data-act="bandes-props-open"]').click(); await s(300);
          document.querySelector('#pp-ok').click(); await s(400); flushAll(); await s(300);
          const q = S.polls.get('bp1');
          out.open = q.propOpen && bandesPhase(q) === 'prop' && !!S.announcements.get(q.propAnnId);
          return out; }""")
        check(r.get("open"), "l'equip obre les propostes de categories (amb un anunci)", str(r))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          ui.tab = 'bandes'; render(); await s(400);
          out.form = !!document.querySelector('#pr-name') && !document.querySelector('[data-act="bandes-vote"]');
          document.querySelector('#pr-name').value = 'Rei del karaoke'; document.querySelector('#pr-desc').value = 'Qui no deixa el micro';
          document.querySelector('[data-act="bandes-propose"]').click(); await s(500);
          document.querySelector('#pr-name').value = 'Cor'; document.querySelector('[data-act="bandes-propose"]').click(); await s(300);
          out.dup = /ja hi és/.test(document.querySelector('.toast')?.innerText || '');
          document.querySelector('[data-act="bandes-like"]').click(); await s(500);
          const docs = (await firebase.firestore().collection(`cors/${GID}/catProps`).get()).docs.map(d => d.data());
          out.saved = docs.length === 1 && docs[0].name === 'Rei del karaoke' && docs[0].by === myId() && docs[0].likes.length === 1;
          out.anon = !document.querySelector('.bn-prop')?.innerText.includes('Anna');
          return out; }""")
        for k, label in [("form", "el cantaire hi pot proposar categories (encara no hi ha votació)"), ("dup", "una categoria que ja hi és no es torna a proposar"),
                         ("saved", "la proposta es desa, i s'hi pot dir «m'agrada»"), ("anon", "sense dir de qui és")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "pol")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          ui.tab = 'bandes'; render(); await s(500);
          document.querySelector('[data-act="bandes-prop-take"]').click(); await s(400); flushAll(); await s(300);
          out.taken = S.polls.get('bp1').cats.map(c => c.name).join('|') === 'Cor|Parella|Rei del karaoke';
          document.querySelector('.bn-team [data-act="bandes-publish"]').click(); await s(300);
          document.querySelector('#bp-ok').click(); await s(400); flushAll(); await s(300);
          const q = S.polls.get('bp1');
          out.vote = !q.draft && !q.propOpen && bandesPhase(q) === 'vote';
          return out; }""")
        check(r.get("taken"), "l'equip afegeix la proposta a les categories", str(r))
        check(r.get("vote"), "i en obrir la votació, les propostes es tanquen", str(r))
        switch_user(page, base, "singer")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          ui.tab = 'bandes'; render(); await s(400);
          out.zero = /0 de 16 ja han votat/.test(document.querySelector('.bn-turn')?.innerText || '');
          sheetBallot('bp1'); await s(300);
          document.querySelector('.sheet [data-bb="next"]').click(); await s(150);
          document.querySelector('.bb-p').click(); await s(100);
          document.querySelector('.sheet [data-bb="go"]').click(); await s(200);
          document.querySelector('.sheet [data-bb="send"]').click(); await s(800); flushAll(); await s(600);
          const tn = (await firebase.firestore().doc(`cors/${GID}/turnout/bp1`).get()).data() || {};
          render(); await s(300);
          out.one = tn.S === 1 && /1 de 16 ja han votat/.test(document.querySelector('.bn-turn')?.innerText || '');
          sheetBallot('bp1'); await s(300); document.querySelector('.sheet [data-bb="send"]').click(); await s(800); flushAll(); await s(400);
          out.once = ((await firebase.firestore().doc(`cors/${GID}/turnout/bp1`).get()).data() || {}).S === 1;
          return out; }""")
        for k, label in [("zero", "tothom veu quanta gent ha votat"), ("one", "en votar, hi suma (a la seva corda)"), ("once", "i canviar el vot no hi torna a sumar")]:
            check(r.get(k), label, str(r))
        switch_user(page, base, "pol")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms));
          let printed = 0; window.print = () => { printed++; };
          BD_PEEK.add('bp1'); sheetBandesResults('bp1'); await s(400);
          document.querySelector('#br-dip').click(); await s(300);
          const d = document.querySelectorAll('#print-root .pr-dip');
          return printed === 1 && d.length === 1 && /Banda atorgada a/i.test(d[0].innerText); }""")
        check(r, "l'equip imprimeix els diplomes de qui guanya", str(r))
        check(not errors, "sense errors amb les propostes, el recompte i els diplomes", "; ".join(errors[:3]))
        ctx.close()

        print("La comissió de festes: porta el tauler (menys el repertori), en veu els resultats i escriu a tothom")
        ctx, page, errors = open_app(browser, base, "pol", MOBILE)
        page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms));
          ensureStaff(); for (let i = 0; i < 20 && !S.staffReady; i++) await s(200);
          await writeAccount({ email: 'fest@exemple.cat', name: 'Júlia Mas', roles: ['festes', 'singer'], role: 'festes', memberId: 'mC0', addedAt: new Date().toISOString() });
          const q = { id: 'fq1', title: 'Sopar de Nadal', options: [{ id: 'a', label: 'Hi vinc' }, { id: 'b', label: 'No puc' }], sections: [], closesAt: addDays(TODAY, 5), createdAt: new Date().toISOString() };
          S.polls.set(q.id, q); persist('polls', q.id, q, 10);
          const b = { id: 'fb1', kind: 'bandes', title: 'Bandes de la comissió', description: '', picks: 1, win: 1, sections: [], out: [], selfOk: false, closed: true,
            cats: [{ id: 'k1', name: 'Cor', desc: '', pair: false, sec: '', win: 1 }], closesAt: addDays(TODAY, -1), createdAt: new Date().toISOString() };
          S.polls.set(b.id, b); persist('polls', b.id, b, 10);
          const v = { pollId: 'fb1', memberId: 'mS0', section: 'S', picks: { k1: ['mT1'] }, n: 1, choices: [], at: new Date().toISOString() };
          S.pollVotes.set('fb1_mS0', v); persist('pollVotes', 'fb1_mS0', v, 10);
          flushAll(); await s(900); }""")
        switch_user(page, base, "fest")
        r = page.evaluate("""async () => { const s = ms => new Promise(r => setTimeout(r, ms)), out = {};
          const fake = () => JSON.parse(localStorage.getItem('fake:db')), find = (db, end) => db[Object.keys(db).find(k => k.endsWith(end))];
          const tabs = () => [...document.querySelectorAll('.tabs-in .tab:not(.tab-extra)')].map(b => b.dataset.tab).join(',');
          out.tabs = tabs().split(',').includes('tauler') && !tabs().includes('gestio') && !canEdit() && canBoard();
          ui.tab = 'tauler'; ui.board = 'anuncis'; render(); await s(300);
          document.querySelector('[data-act="ann-new"]').click(); await s(300);
          document.querySelector('#an-title').value = 'Calçotada de primavera'; document.querySelector('#an-body').value = 'Ens apuntem?';
          document.querySelector('#an-save').click(); await s(600); flushAll(); await s(400);
          const a = [...S.announcements.values()].find(x => x.title === 'Calçotada de primavera');
          out.ann = !!a && !!find(fake(), `/announcements/${a.id}`) && !S.error;
          ui.board = 'enquestes'; render(); await s(300);
          const card = [...document.querySelectorAll('.poll')].find(x => /Sopar de Nadal/.test(x.innerText));
          out.results = !!card?.querySelector('[data-act="poll-results"]') && !!card?.querySelector('[data-act="poll-edit"]');
          card.querySelector('details.poll-mine summary').click(); await s(150);
          card.querySelector('details.poll-mine input[value="a"]').click();
          card.querySelector('details.poll-mine [data-act="poll-vote"]').click(); await s(500); flushAll(); await s(300);
          out.voted = (S.pollVotes.get('fq1_mC0')?.choices || []).join() === 'a' && !!find(fake(), '/pollVotes/fq1_mC0');
          document.querySelector('[data-act="poll-results"][data-id="fq1"]').click(); await s(300);
          out.who = !!document.querySelector('.sheet') && !/no pots fer/.test(document.querySelector('.toast')?.innerText || '');
          closeSheet(); await s(200);
          document.querySelector('[data-act="bandes-results"][data-id="fb1"]').click(); await s(400);
          out.bandes = /Cor/.test(document.querySelector('.sheet')?.innerText || '') && !!document.querySelector('.sheet .bd-pie, .sheet svg');
          closeSheet(); await s(200);
          document.querySelector('[data-act="bandes-edit"][data-id="fb1"]').click(); await s(300);
          out.bandesEdit = !!document.querySelector('.sheet #bd-gname');
          closeSheet(); await s(200);
          ui.board = 'materials'; render(); await s(300);
          out.noRep = !document.querySelector('[data-act="work-new"], [data-act="mat-new"], [data-act="work-edit"]');
          ui.tab = 'avisos'; render(); await s(300);
          sheetWrite(); await s(300);
          out.write = !!document.querySelector('.sheet [data-act="msg-new"]') && !!document.querySelector('.sheet [data-act="ann-new"]') && !!document.querySelector('.sheet [data-act="bandes-new"]')
            && !document.querySelector('.sheet [data-act="thread-to"]');
          document.querySelector('.sheet [data-act="msg-new"]').click(); await s(300);
          document.querySelector('#mg-to .pick[data-sec="T"]').click();
          document.querySelector('#mg-body').value = 'Assaig de la gala dijous!';
          document.querySelector('#mg-send').click(); await s(600); flushAll(); await s(400);
          const m = [...S.messages.values()].find(x => /Assaig de la gala/.test(x.body));
          out.msg = !!m && m.to.join() === 'T' && m.byRole === 'Comissió de festes' && !!find(fake(), `/messages/${m.id}`);
          out.overflow = document.documentElement.scrollWidth <= innerWidth;
          return out; }""")
        for k, label in [("tabs", "la comissió té les pestanyes d'un cantaire i porta el tauler sense editar res més"),
                         ("ann", "publica un anunci al tauler"),
                         ("results", "a les enquestes, en veu les respostes i les pot editar"),
                         ("voted", "i hi respon ella mateixa (també canta)"),
                         ("who", "mira qui ha respost"),
                         ("bandes", "veu els resultats de les bandes"),
                         ("bandesEdit", "i les pot editar (la Nit, els finalistes…)"),
                         ("noRep", "el repertori no el toca"),
                         ("write", "escriu missatges i anuncis, però no converses privades"),
                         ("msg", "envia un missatge a una altra corda, signat com a comissió de festes"),
                         ("overflow", "sense eixamplar la pantalla del mòbil")]:
            check(r.get(k), label, str(r))
        check(not errors, "sense errors amb la comissió de festes", "; ".join(errors[:3]))
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

        print("Passada la mitjanit: l'app continua al dia de les dades")
        # Com quan les proves comencen abans de les 12 de la nit i acaben després: dades d'ahir, i el rellotge d'avui.
        srv2 = serve(build(os.path.join(tempfile.mkdtemp(), "site"), (datetime.date.today() - datetime.timedelta(days=1)).isoformat()))
        ctx, page, errors = open_app(browser, f"http://127.0.0.1:{srv2.server_address[1]}", "pol", MOBILE)
        r = page.evaluate("""async () => { const s = ms => new Promise(res => setTimeout(res, ms)), out = {};
          const real = new Date(performance.timeOrigin + performance.now()), t = new Date(), mins = x => x.getHours() * 60 + x.getMinutes();
          out.day = TODAY === SEED_DAY && isoDate(t) === SEED_DAY && isoDate(real) > SEED_DAY && allSessions().some(x => x.date === TODAY);
          out.hour = Math.abs(mins(t) - mins(real)) <= 1;
          const a = Date.now(); await s(200);
          out.api = Math.abs(a - t.getTime()) < 1000 && Date.now() - a >= 150 && new Date(2026, 0, 2, 3, 4).getHours() === 3 && new Date(0).getTime() === 0
            && new Date('2026-01-02T03:04:05Z').getTime() === Date.UTC(2026, 0, 2, 3, 4, 5) && Date.parse('2026-01-02T03:04:05Z') === Date.UTC(2026, 0, 2, 3, 4, 5)
            && t instanceof Date && t.constructor === Date && typeof Date() === 'string';
          const ara = new Date().toISOString();
          out.past = (S.me.lastSeen || '') <= ara && [...S.announcements.values()].every(x => (x.createdAt || '') <= ara) && unreadAnnouncements().some(x => x.id === 'n1');
          ui.board = 'anuncis'; applyRoute('tauler/anuncis'); render(); await s(400);
          out.read = !unreadAnnouncements().length;
          return out; }""")
        check(r["day"], "amb dades d'ahir, «avui» és el dia de les dades (i hi ha la sessió d'aquell dia)", str(r))
        check(r["hour"], "a la mateixa hora del rellotge", str(r))
        check(r["api"], "Date.now() avança, i new Date(…) amb arguments, Date.UTC i Date.parse fan el de sempre", str(r))
        check(r["past"], "el que porten les dades (anuncis, última entrada) és d'abans d'ara", str(r))
        check(r["read"], "i en obrir els anuncis queden llegits", str(r))
        res = page.evaluate(SWEEP)
        check(res["vistes"] >= 8 and not errors, f"totes les pantalles s'obren sense errors ({res['vistes']})", "; ".join(errors[:3]))
        ctx.close()
        srv2.shutdown()

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
