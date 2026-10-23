"""Còpia de seguretat de totes les dades de cada agrupació.

Llegeix plantilla, produccions, llistes, avisos, confirmacions, anuncis i enquestes (no els enllaços
secrets) i ho desa al repositori privat de còpies: la primera agrupació a l'arrel, com sempre, i la
resta a agrupacions/<agrupació>/. Per a cadascuna desa `darrera.json` (compatible amb Ajustos ›
Restaura una còpia) i, si hi ha hagut canvis, una còpia datada a `AAAA/copia-AAAA-MM-DD.json`.
Els fitxers pujats des de l'app es guarden un cop cadascun a `fitxers/<id>/<nom>`.

Xifratge: si hi ha el secret BACKUP_KEY (una contrasenya que només guarda l'administració), tot es desa xifrat amb
AES-256 (openssl, clau derivada amb PBKDF2): `darrera.json.enc`, `AAAA/copia-AAAA-MM-DD.json.enc` i
`fitxers/<id>/<nom>.enc`, i les còpies que encara hi eren sense xifrar es xifren i es treuen. Per llegir-ne una:
`python3 tools/desxifra.py fitxer.enc` (demana la contrasenya). Sense el secret, com abans, sense xifrar.
"""
import base64, datetime, glob, hashlib, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
import dades

OUT = sys.argv[1]
r, groups = dades.connect("BACKUP_REFRESH_TOKEN")
today = datetime.date.today().isoformat()
stamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
KEY = os.environ.get("BACKUP_KEY", "")


def encrypt(raw):
    """AES-256-CBC amb sal i PBKDF2 (200.000 voltes), el format d'`openssl enc`: es pot desxifrar amb openssl a qualsevol lloc."""
    return subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", "env:BACKUP_KEY"],
                          input=raw, capture_output=True, check=True).stdout


def write(path, raw):
    """Desa un fitxer de la còpia: xifrat (amb .enc) si hi ha contrasenya. Torna el camí on ha quedat."""
    if KEY:
        path += ".enc"
        raw = encrypt(raw)
    with open(path, "wb") as fh:
        fh.write(raw)
    return path


def seal_old(out):
    """Amb contrasenya: les còpies i els fitxers que encara hi eren sense xifrar es xifren i es treu la versió en clar
    (l'historial del repositori, que és privat, encara les té)."""
    if not KEY:
        return 0
    n = 0
    plain = glob.glob(os.path.join(out, "darrera.json")) + glob.glob(os.path.join(out, "[0-9][0-9][0-9][0-9]", "copia-*.json"))
    plain += [p for p in glob.glob(os.path.join(out, "fitxers", "*", "*")) if not p.endswith(".enc")]
    for p in plain:
        if os.path.exists(p + ".enc"):
            os.remove(p)
            continue
        with open(p, "rb") as fh:
            write(p, fh.read())
        os.remove(p)
        n += 1
    return n


def backup(gid):
    base = f"cors/{gid}"
    config = r.get(f"{base}/config/main") or {}
    if config.get("deleted"):
        return None
    data = {
        "app": "a-tempo", "version": 1, "group": gid,
        "config": config,
        "members": list(r.list(f"{base}/members").values()),
        "productions": list(r.list(f"{base}/productions").values()),
        "attendance": r.list(f"{base}/attendance"),
    }
    for name in ["absences", "rsvp", "subs", "staff", "announcements", "polls", "pollVotes", "classes", "classReq", "classPlan", "classNotes",
                 "works", "trips", "tripSignups", "profiles", "students", "messages", "memberNotes", "memberDocs", "threads", "nudges", "prodChoice", "scores", "memberPriv", "wardrobe"]:
        data[name] = list(r.list(f"{base}/{name}").values())
    # Els trossos de temporada arxivats (les mateixes llistes en un sol document cadascun: vegeu js/02-dades.js).
    data["attArchive"] = r.list(f"{base}/attArchive")

    out = dades.folder(OUT, gid)
    os.makedirs(out, exist_ok=True)
    sealed = seal_old(out)
    # Si hi ha hagut canvis es mira amb l'empremta de les dades (darrera.sha256): així no cal desxifrar la còpia d'abans.
    body = json.dumps(data, ensure_ascii=False, sort_keys=True).encode()
    digest = hashlib.sha256(body).hexdigest()
    mark = os.path.join(out, "darrera.sha256")
    previous = open(mark).read().strip() if os.path.exists(mark) else ""
    if not previous and os.path.exists(os.path.join(out, "darrera.json")):
        with open(os.path.join(out, "darrera.json")) as f:
            old = json.load(f)
        old.pop("exportedAt", None)
        if gid == dades.FOUNDER:
            old.setdefault("group", gid)   # les còpies d'abans no ho duien
        previous = hashlib.sha256(json.dumps(old, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    changed = previous != digest
    if changed:
        raw = json.dumps({"exportedAt": stamp, **data}, ensure_ascii=False, indent=1).encode()
        os.makedirs(os.path.join(out, today[:4]), exist_ok=True)
        write(os.path.join(out, today[:4], f"copia-{today}.json"), raw)
        write(os.path.join(out, "darrera.json"), raw)
        with open(mark, "w") as f:
            f.write(digest + "\n")

    files = [x.get("file") for p in data["productions"] for x in (p.get("materials") or [])]
    files += [x.get("file") for x in (config.get("documents") or [])]
    files += [x.get("file") for w in data["works"] for x in (w.get("materials") or [])]
    files += [n.get("file") for n in data["classNotes"]]   # enregistraments de classe (classFiles)
    files += [x.get("file") for d in data["memberDocs"] for x in (d.get("docs") or {}).values() if isinstance(x, dict)]   # documents signats (memberFiles)
    files += [x.get("file") for a in data["announcements"] for x in (a.get("files") or [])]   # adjunts dels anuncis
    saved = 0
    for f in filter(None, files):
        folder = os.path.join(out, "fitxers", f["id"])
        safe = re.sub(r"[^\w.\- ]+", "_", f.get("name") or "fitxer").strip() or "fitxer"
        target = os.path.join(folder, safe)
        if os.path.exists(target) or os.path.exists(target + ".enc"):
            continue
        parts = []
        for i in range(int(f.get("chunks") or 1)):
            where = f"{f['where']}/{f['id']}_{i}" if f.get("where") in ("classFiles", "memberFiles") else f"config/fitxer_{f['id']}_{i}"
            doc = dades.call(f"{dades.BASE}/{base}/{where}", token=r.token)
            r.reads += 1
            parts.append(base64.b64decode(doc["fields"]["d"]["bytesValue"]))
        os.makedirs(folder, exist_ok=True)
        write(target, b"".join(parts))
        saved += 1
    return (f"{config.get('name') or gid}: {len(data['members'])} a la plantilla · {len(data['productions'])} produccions · "
            f"{len(data['attendance'])} llistes · {len([x for x in files if x])} fitxers ({saved} de nous) · {'canvis' if changed else 'sense canvis'}"
            f"{f' · {sealed} xifrats ara' if sealed else ''}")


for gid in groups:
    try:
        line = backup(gid)
        if line:
            print(line)
    except dades.Forbidden:
        print(f"{gid}: sense permís de lectura")
print(f"{len(groups)} agrupacions · {r.reads} lectures · {'xifrat' if KEY else 'SENSE XIFRAR (falta el secret BACKUP_KEY)'}")
