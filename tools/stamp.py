"""Empremtes dels fitxers de l'app.

Cada fitxer de codi i d'estils s'enllaça a index.html amb ?v=<empremta del contingut>. Si el fitxer canvia,
canvia l'adreça, i ni el navegador ni el treballador de servei (sw.js) no fan servir mai una versió antiga.
Aquesta eina recalcula les empremtes i escriu a sw.js la llista de fitxers que es desen per obrir l'app sense
cobertura (SHELL) i la versió (VERSION). També posa a firestore.rules l'empremta de les regles (reglesVersio), que la
vigilància fa servir per comprovar que les regles publicades són les del repositori.

    python3 tools/stamp.py          # actualitza index.html i sw.js
    python3 tools/stamp.py --check  # només comprova (per a les proves automàtiques); surt amb error si cal refer-ho
"""
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
SW = os.path.join(ROOT, "sw.js")
RULES = os.path.join(ROOT, "firestore.rules")
RULES_MARK = re.compile(r"(match /reglesVersio/\{v\} \{\s*allow get: if v == ')([^']*)(';)")
FIXED = ["./", "index.html", "app.webmanifest", "app/icon-192.png", "app/icon-180.png", "app/favicon-48.png"]
ASSET = re.compile(r'(<(?:script|link)\b[^>]*?(?:src|href)=")((?:js/[\w.-]+\.js|css/[\w.-]+\.css|config\.js))(?:\?v=[\w-]*)?(")')


def digest(path):
    with open(os.path.join(ROOT, path), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def stamped():
    html = open(INDEX, encoding="utf-8").read()
    assets = []

    def put(m):
        v = digest(m.group(2))
        assets.append(f"{m.group(2)}?v={v}")
        return f"{m.group(1)}{m.group(2)}?v={v}{m.group(3)}"

    new_html = ASSET.sub(put, html)
    META = re.compile(r'(<meta name="app-version" content=")[^"]*(">)')
    for a in assets:
        if not os.path.exists(os.path.join(ROOT, a.split("?")[0])):
            sys.exit(f"index.html enllaça {a}, però el fitxer no existeix")
    # La versió depèn de tot el que es desa, index.html inclòs (sense les empremtes, que ja hi són comptades).
    base = META.sub(r"\1\2", ASSET.sub(lambda m: m.group(1) + m.group(2) + m.group(3), html))
    version = hashlib.sha256((base + "\n".join(assets)).encode()).hexdigest()[:10]
    new_html = META.sub(lambda m: m.group(1) + version + m.group(2), new_html)
    sw = open(SW, encoding="utf-8").read()
    shell = FIXED + assets
    new_sw = re.sub(r"^const VERSION = '[^']*';", f"const VERSION = '{version}';", sw, count=1, flags=re.M)
    new_sw = re.sub(r"^const SHELL = \[.*?\];", "const SHELL = " + json.dumps(shell, ensure_ascii=False).replace('", "', "', '").replace('["', "['").replace('"]', "']") + ";",
                    new_sw, count=1, flags=re.M | re.S)
    return html, new_html, sw, new_sw, version


def rules_digest(text):
    """L'empremta de les regles, sense comptar-hi la mateixa empremta."""
    return hashlib.sha256(RULES_MARK.sub(r"\1\3", text).encode()).hexdigest()[:12]


def stamped_rules():
    text = open(RULES, encoding="utf-8").read()
    if not RULES_MARK.search(text):
        sys.exit("firestore.rules no té la regla reglesVersio")
    d = rules_digest(text)
    return text, RULES_MARK.sub(lambda m: m.group(1) + d + m.group(3), text), d


def main():
    html, new_html, sw, new_sw, version = stamped()
    rules, new_rules, rules_v = stamped_rules()
    if "--check" in sys.argv:
        if html != new_html or sw != new_sw or rules != new_rules:
            sys.exit("Les empremtes no estan al dia: executa «python3 tools/stamp.py» i torna-ho a desar.")
        print(f"Empremtes al dia (versió {version}, regles {rules_v}).")
        return
    if html != new_html:
        open(INDEX, "w", encoding="utf-8").write(new_html)
    if sw != new_sw:
        open(SW, "w", encoding="utf-8").write(new_sw)
    if rules != new_rules:
        open(RULES, "w", encoding="utf-8").write(new_rules)
    print(f"Versió {version} · regles {rules_v}.")


if __name__ == "__main__":
    main()
