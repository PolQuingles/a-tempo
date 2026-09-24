"""Vigilància: saber que l'app falla abans que ho digui ningú.

Cada hora comprova:
  · que l'app s'obre a cada adreça publicada (APP_URLS) i que hi carrega el codi que enllaça;
  · que la versió publicada de l'app és la del repositori (després de 40 minuts de marge per publicar);
  · que les regles de seguretat publicades a Firebase són les del repositori (firestore.rules): ho mira demanant
    reglesVersio/<empremta>, que només les regles d'aquesta mateixa versió deixen llegir (vegeu tools/stamp.py);
  · que GitHub Pages continua activat (s'ha apagat sol dues vegades);
  · si algú ha tingut errors a l'app (col·lecció «errors» de Firestore, l'última hora).
Si hi ha res, avisa al mòbil l'administració de la primera agrupació (els seus aparells amb avisos activats) i
acaba amb error, de manera que GitHub també n'envia un correu. Un mateix problema es torna a avisar com a molt
cada sis hores (l'estat es desa al repositori privat de còpies, com els altres avisos).

    python3 .github/scripts/vigilancia.py <carpeta del repositori de còpies>
"""
import datetime, hashlib, json, os, re, subprocess, sys, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dades

URLS = [u.strip().rstrip("/") + "/" for u in (os.environ.get("APP_URLS") or "https://polquingles.github.io/a-tempo/").split(",") if u.strip()]
STATE_DIR = sys.argv[1] if len(sys.argv) > 1 else None
NOW = datetime.datetime.now(datetime.timezone.utc)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GRACE = datetime.timedelta(minutes=40)   # el que triga a publicar-se un canvi (GitHub Pages i les regles)
REPEAT = datetime.timedelta(hours=6)
problems = []   # (clau estable, text)


def changed_at(*paths):
    """Quan va canviar per última vegada al repositori (o None si no se sap)."""
    try:
        out = subprocess.run(["git", "-C", REPO, "log", "-1", "--format=%ct", "--", *paths], capture_output=True, text=True, timeout=20).stdout.strip()
        return datetime.datetime.fromtimestamp(int(out), datetime.timezone.utc) if out else None
    except Exception:
        return None


def repo_file(path):
    try:
        return open(os.path.join(REPO, path), encoding="utf-8").read()
    except OSError:
        return ""


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "A-Tempo-vigilancia/1.0", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:   # sense resposta
        return 0, str(e)


# ---------- 1. L'app s'obre ----------
for base in URLS:
    code, html = get(base + "?vigilancia=" + NOW.strftime("%H%M"))
    if code != 200:
        problems.append((f"web:{base}:{code}", f"L'app no s'obre a {base} (resposta {code or 'cap'})."))
        continue
    if 'name="app-version"' not in html:
        problems.append((f"web:{base}:contingut", f"A {base} hi ha una pàgina que no és l'app."))
        continue
    assets = re.findall(r'<script src="(js/[\w.-]+\.js\?v=[\w-]+)"', html)
    missing = []
    for a in assets:
        c, _ = get(base + a)
        if c != 200:
            missing.append(f"{a.split('?')[0]} ({c or 'cap'})")
    if not assets:
        problems.append((f"web:{base}:sense-codi", f"A {base} la pàgina no enllaça cap fitxer de codi."))
    elif missing:
        problems.append((f"web:{base}:fitxers", f"A {base} falten fitxers de l'app: {', '.join(missing[:4])}."))
    m = re.search(r'name="app-version" content="([^"]*)"', html)
    live = m.group(1) if m else "?"
    print(f"{base}: {code} · {len(assets)} fitxers de codi · versió {live}")
    # La versió publicada ha de ser la del repositori (un cop passat el temps de publicar-la).
    want = re.search(r'name="app-version" content="([^"]*)"', repo_file("index.html"))
    when = changed_at("index.html")
    if want and live != want.group(1) and when and NOW - when > GRACE:
        problems.append((f"web:{base}:versio:{want.group(1)}", f"A {base} hi ha la versió {live} de l'app, però la del repositori és la {want.group(1)} (desada fa {int((NOW - when).total_seconds() // 60)} minuts)."))

# ---------- 1b. Les regles de seguretat publicades són les del repositori ----------
rules_v = re.search(r"match /reglesVersio/\{v\} \{\s*allow get: if v == '([^']*)'", repo_file("firestore.rules"))
if rules_v:
    code, _ = get(f"{dades.BASE}/reglesVersio/{rules_v.group(1)}")
    when = changed_at("firestore.rules")
    if code == 404:
        print(f"Regles publicades: les del repositori ({rules_v.group(1)})")
    elif code == 403 and (not when or NOW - when > GRACE):
        problems.append((f"regles:{rules_v.group(1)}", "Les regles de seguretat publicades a Firebase no són les del repositori: cal publicar firestore.rules (vegeu README › Regles)."))
    else:
        print(f"Regles: resposta {code or 'cap'}{' (acabades de canviar: encara es poden estar publicant)' if code == 403 else ''}")

# ---------- 2. GitHub Pages activat ----------
repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
if repo and token and any("github.io" in u for u in URLS):
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/pages",
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            info = json.loads(r.read())
            print(f"GitHub Pages: {info.get('status') or 'actiu'}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            problems.append(("pages:off", "GitHub Pages s'ha desactivat al repositori: l'adreça de github.io no funciona."))
        else:
            print(f"No s'ha pogut consultar GitHub Pages ({e.code})")

# ---------- 3. Errors a l'app ----------
reader = None
try:
    if os.environ.get("SERVICE_REFRESH_TOKEN") or os.environ.get("BACKUP_REFRESH_TOKEN") or os.environ.get("FS_TOKEN"):
        reader, _ = dades.connect("BACKUP_REFRESH_TOKEN")
except Exception as e:
    print(f"No s'ha pogut entrar a Firestore: {e}")
errors = []
if reader:
    since = (NOW - datetime.timedelta(minutes=65)).isoformat().replace("+00:00", "Z")
    q = {"structuredQuery": {"from": [{"collectionId": "errors"}],
                             "where": {"fieldFilter": {"field": {"fieldPath": "at"}, "op": "GREATER_THAN_OR_EQUAL", "value": {"stringValue": since}}},
                             "limit": 50}}
    try:
        rows = dades.call(f"{dades.BASE}:runQuery", q, token=reader.token) or []
        errors = [dades.dec({"mapValue": r["document"]}) for r in rows if r.get("document")]
    except Exception as e:   # regles encara sense publicar, o sense xarxa
        print(f"No s'han pogut llegir els errors: {e}")
    print(f"Errors a l'app l'última hora: {len(errors)}")
    if errors:
        kinds = {}
        for e in errors:
            k = f"{e.get('msg', '')[:90]} · {e.get('where', '')[:40]}"
            kinds[k] = kinds.get(k, 0) + 1
        top = sorted(kinds.items(), key=lambda x: -x[1])[:3]
        sig = hashlib.sha1("|".join(k for k, _ in top).encode()).hexdigest()[:10]
        people = len({(e.get("ua"), e.get("gid")) for e in errors})
        text = (f"{len(errors)} {'error' if len(errors) == 1 else 'errors'} a l'app l'última hora "
                f"({people} {'aparell' if people == 1 else 'aparells'}): " + "; ".join(f"{k} ×{n}" for k, n in top))
        problems.append((f"errors:{sig}", text))

# ---------- 4. Avisar ----------
if not problems:
    print("Tot bé.")
    sys.exit(0)

print("PROBLEMES:")
for _, t in problems:
    print(" ·", t)

state_path = os.path.join(STATE_DIR, "vigilancia.json") if STATE_DIR else None
state = {}
if state_path and os.path.exists(state_path):
    try:
        state = json.load(open(state_path))
    except Exception:
        state = {}
fresh = [(k, t) for k, t in problems
         if not state.get(k) or NOW - datetime.datetime.fromisoformat(state[k]) >= REPEAT]
if fresh and reader and os.environ.get("PUSH_PRIVATE_KEY"):
    from pywebpush import WebPushException, webpush
    staff = reader.list(f"cors/{dades.FOUNDER}/staff")
    admins = {e for e, p in staff.items() if "admin" in (p.get("roles") or [p.get("role", "")])}
    devices = [d for d in reader.list(f"cors/{dades.FOUNDER}/push").values() if (d.get("email") or "").lower() in admins]
    body = " ".join(t for _, t in fresh)[:400]
    payload = json.dumps({"title": "A Tempo · vigilància", "body": body, "url": "./", "tag": "vigilancia"})
    sent = 0
    for d in devices:
        try:
            webpush(subscription_info={"endpoint": d["endpoint"], "keys": {"p256dh": d["p256dh"], "auth": d["auth"]}},
                    data=payload, vapid_private_key=os.environ["PUSH_PRIVATE_KEY"],
                    vapid_claims={"sub": os.environ.get("PUSH_CONTACT") or "mailto:a-tempo@polquingles.github.io"}, ttl=60 * 60 * 6)
            sent += 1
        except WebPushException as e:
            print(f"  no s'ha pogut avisar un aparell ({getattr(e.response, 'status_code', '?')})")
    print(f"Avís enviat a {sent} de {len(devices)} aparells de l'administració.")
if state_path:
    for k, _ in fresh:
        state[k] = NOW.isoformat()
    # Oblida el que ja no passa, perquè si torna a passar s'avisi de seguida.
    state = {k: v for k, v in state.items() if any(k == p for p, _ in problems)}
    json.dump(state, open(state_path, "w"), indent=1)
sys.exit(1)
