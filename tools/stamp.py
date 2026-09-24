"""Empremtes dels fitxers de l'app.

Cada fitxer de codi i d'estils s'enllaça a index.html amb ?v=<empremta del contingut>. Si el fitxer canvia,
canvia l'adreça, i ni el navegador ni el treballador de servei (sw.js) no fan servir mai una versió antiga.
Aquesta eina recalcula les empremtes i escriu a sw.js la llista de fitxers que es desen per obrir l'app sense
cobertura (SHELL) i la versió (VERSION).

    python3 tools/stamp.py          # actualitza index.html i sw.js
    python3 tools/stamp.py --check  # només comprova (per a les proves automàtiques); surt amb error si cal refer-ho
"""
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
SW = os.path.join(ROOT, "sw.js")
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


def main():
    html, new_html, sw, new_sw, version = stamped()
    if "--check" in sys.argv:
        if html != new_html or sw != new_sw:
            sys.exit("Les empremtes no estan al dia: executa «python3 tools/stamp.py» i torna-ho a desar.")
        print(f"Empremtes al dia (versió {version}).")
        return
    if html != new_html:
        open(INDEX, "w", encoding="utf-8").write(new_html)
    if sw != new_sw:
        open(SW, "w", encoding="utf-8").write(new_sw)
    print(f"Versió {version}.")


if __name__ == "__main__":
    main()
