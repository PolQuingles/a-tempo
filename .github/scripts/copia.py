"""Còpia de seguretat de totes les dades de cada agrupació.

Llegeix plantilla, produccions, llistes, avisos, confirmacions, anuncis i enquestes (no els enllaços
secrets) i ho desa al repositori privat de còpies: la primera agrupació a l'arrel, com sempre, i la
resta a agrupacions/<agrupació>/. Per a cadascuna desa `darrera.json` (compatible amb Ajustos ›
Restaura una còpia) i, si hi ha hagut canvis, una còpia datada a `AAAA/copia-AAAA-MM-DD.json`.
Els fitxers pujats des de l'app es guarden un cop cadascun a `fitxers/<id>/<nom>`.
"""
import base64, datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import dades

OUT = sys.argv[1]
r, groups = dades.connect("BACKUP_REFRESH_TOKEN")
today = datetime.date.today().isoformat()
stamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


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
                 "works", "trips", "tripSignups", "profiles", "students", "messages", "memberNotes", "memberDocs", "threads", "nudges"]:
        data[name] = list(r.list(f"{base}/{name}").values())
    # Els trossos de temporada arxivats (les mateixes llistes en un sol document cadascun: vegeu js/02-dades.js).
    data["attArchive"] = r.list(f"{base}/attArchive")

    out = dades.folder(OUT, gid)
    os.makedirs(out, exist_ok=True)
    latest = os.path.join(out, "darrera.json")
    previous = None
    if os.path.exists(latest):
        with open(latest) as f:
            previous = json.load(f)
        previous.pop("exportedAt", None)
        if gid == dades.FOUNDER:
            previous.setdefault("group", gid)   # les còpies d'abans no ho duien
    changed = previous != data
    if changed:
        data_out = {"exportedAt": stamp, **data}
        os.makedirs(os.path.join(out, today[:4]), exist_ok=True)
        with open(os.path.join(out, today[:4], f"copia-{today}.json"), "w") as f:
            json.dump(data_out, f, ensure_ascii=False, indent=1)
        with open(latest, "w") as f:
            json.dump(data_out, f, ensure_ascii=False, indent=1)

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
        if os.path.exists(target):
            continue
        parts = []
        for i in range(int(f.get("chunks") or 1)):
            where = f"{f['where']}/{f['id']}_{i}" if f.get("where") in ("classFiles", "memberFiles") else f"config/fitxer_{f['id']}_{i}"
            doc = dades.call(f"{dades.BASE}/{base}/{where}", token=r.token)
            r.reads += 1
            parts.append(base64.b64decode(doc["fields"]["d"]["bytesValue"]))
        os.makedirs(folder, exist_ok=True)
        with open(target, "wb") as fh:
            fh.write(b"".join(parts))
        saved += 1
    return (f"{config.get('name') or gid}: {len(data['members'])} a la plantilla · {len(data['productions'])} produccions · "
            f"{len(data['attendance'])} llistes · {len([x for x in files if x])} fitxers ({saved} de nous) · {'canvis' if changed else 'sense canvis'}")


for gid in groups:
    try:
        line = backup(gid)
        if line:
            print(line)
    except dades.Forbidden:
        print(f"{gid}: sense permís de lectura")
print(f"{len(groups)} agrupacions · {r.reads} lectures")
