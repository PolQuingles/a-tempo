"""Proves de la interfície: l'app sencera en un Chromium sense pantalla, amb Firebase fals i dades inventades.

Per a cada perfil (administració, cap de corda, cantaire, direcció sense fitxa, professor de cant, gerència) i mida
(mòbil petit, mòbil, ordinador) recorre totes les pantalles i comprova que no hi ha errors ni res que surti de la
pantalla. També comprova el botó «enrere», els enllaços directes a una pantalla, la versió d'ordinador, el registre
d'errors i que l'app s'obre sense xarxa.

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
        page.click('.mg[data-k="personal"]'); page.wait_for_timeout(300)
        page.click('[data-act="manage"][data-k="config"]'); page.wait_for_timeout(300)
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/gestio/personal gestio", "dins de Gestió, enrere torna a l'apartat d'abans", screen(page))
        page.go_back(); page.wait_for_timeout(400)
        check(screen(page) == "#/inici avisos", "de Gestió, enrere torna a Inici", screen(page))
        check(not errors, "sense errors en navegar", "; ".join(errors[:3]))
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
