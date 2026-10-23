"""Desxifra una còpia de seguretat (vegeu .github/scripts/copia.py).

    python3 tools/desxifra.py darrera.json.enc            → darrera.json (al costat)
    python3 tools/desxifra.py fitxer.enc sortida.json

Demana la contrasenya (la del secret BACKUP_KEY) sense mostrar-la. Fa servir openssl, com qui l'ha xifrada.
La còpia desxifrada (darrera.json) es pot restaurar a l'app des d'Ajustos › Restaura una còpia.
"""
import getpass, os, subprocess, sys

if len(sys.argv) < 2 or not sys.argv[1].endswith(".enc"):
    sys.exit(__doc__)
src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else src[:-4]
env = {**os.environ, "BACKUP_KEY": getpass.getpass("Contrasenya de les còpies: ")}
res = subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", "env:BACKUP_KEY", "-in", src, "-out", dst], env=env)
if res.returncode:
    if os.path.exists(dst):
        os.remove(dst)
    sys.exit("No s'ha pogut desxifrar: la contrasenya no és aquesta o el fitxer no és una còpia xifrada.")
print(f"Desxifrat a {dst}")
