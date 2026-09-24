"""Còpia de l'app per a proves, amb Firebase fals (fake-firebase.js) i dades inventades (seed.js).

    python3 tests/interficie/build.py <carpeta de destí>

Després, per mirar-la amb el navegador: python3 -m http.server 8777 --directory <carpeta>
i obrir http://127.0.0.1:8777/index.html?u=pol (u = pol · leader · singer · prof · dir · ger; &reset=1 torna a les dades inicials).
"""
import os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def build(dst):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns(".git", ".github", "tests", "tools", "node_modules", "__pycache__"))
    subprocess.run([sys.executable, os.path.join(HERE, "seed.py"), dst], check=True, stdout=subprocess.DEVNULL)
    shutil.copy(os.path.join(HERE, "fake-firebase.js"), dst)
    path = os.path.join(dst, "index.html")
    html = open(path, encoding="utf-8").read()
    html = re.sub(r'<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>\n', "", html)
    stamp = int(time.time())
    html, n = re.subn(r'<script src="config\.js\?v=[\w-]+"></script>',
                      f'<script src="seed.js?v={stamp}"></script><script src="fake-firebase.js?v={stamp}"></script>', html)
    if n != 1:
        sys.exit("No s'ha trobat config.js a index.html")
    open(path, "w", encoding="utf-8").write(html)
    return dst


if __name__ == "__main__":
    print(build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "site")))
