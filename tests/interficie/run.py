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
        check(page.inner_text(".sheet-h .h2") == "Aparença" and page.locator(".sheet .seg3").count() == 1, "una fila obre la seva finestra sencera")
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
