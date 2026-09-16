"""Còpia de seguretat de totes les dades del cor.

Entra amb un compte de només lectura (rol «backup»): llegeix cantaires, produccions, llistes,
avisos, confirmacions, anuncis i enquestes. No llegeix els enllaços secrets.
Desa `darrera.json` (compatible amb Ajustos › Restaura una còpia) i, si hi ha hagut canvis,
una còpia datada a `AAAA/copia-AAAA-MM-DD.json`.
"""
import datetime, json, os, sys, urllib.parse, urllib.request

API = "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY"
BASE = "https://firestore.googleapis.com/v1/projects/cor-present/databases/(default)/documents"
CHOIR = os.environ["CHOIR_ID"]
OUT = sys.argv[1]


def call(url, body=None, token=None, form=False):
    headers, data = {}, None
    if form:
        data = urllib.parse.urlencode(body).encode(); headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers)) as r:
        return json.loads(r.read())


def dec(v):
    k, x = next(iter(v.items()))
    if k == "mapValue":
        return {a: dec(b) for a, b in x.get("fields", {}).items()}
    if k == "arrayValue":
        return [dec(b) for b in x.get("values", [])]
    if k == "integerValue":
        return int(x)
    if k == "nullValue":
        return None
    return x


token = call(f"https://securetoken.googleapis.com/v1/token?key={API}",
             {"grant_type": "refresh_token", "refresh_token": os.environ["BACKUP_REFRESH_TOKEN"]}, form=True)["id_token"]


def collection(name):
    out, page = {}, None
    while True:
        q = {"pageSize": 300}
        if page:
            q["pageToken"] = page
        d = call(f"{BASE}/cors/{CHOIR}/{name}?" + urllib.parse.urlencode(q), token=token)
        for doc in d.get("documents", []):
            out[doc["name"].rsplit("/", 1)[1]] = dec({"mapValue": doc})
        page = d.get("nextPageToken")
        if not page:
            return out


data = {
    "app": "cor-present", "version": 1,
    "config": dec({"mapValue": call(f"{BASE}/cors/{CHOIR}/config/main", token=token)}),
    "members": list(collection("members").values()),
    "productions": list(collection("productions").values()),
    "attendance": collection("attendance"),
}
for name in ["absences", "rsvp", "subs", "staff", "announcements", "polls", "pollVotes"]:
    data[name] = list(collection(name).values())

latest = os.path.join(OUT, "darrera.json")
previous = None
if os.path.exists(latest):
    with open(latest) as f:
        previous = json.load(f)
    previous.pop("exportedAt", None)
changed = previous != data
today = datetime.date.today().isoformat()
data_out = {"exportedAt": datetime.datetime.utcnow().isoformat() + "Z", **data}
if changed:
    os.makedirs(os.path.join(OUT, today[:4]), exist_ok=True)
    with open(os.path.join(OUT, today[:4], f"copia-{today}.json"), "w") as f:
        json.dump(data_out, f, ensure_ascii=False, indent=1)
    with open(latest, "w") as f:
        json.dump(data_out, f, ensure_ascii=False, indent=1)
print(f"{len(data['members'])} cantaires · {len(data['productions'])} produccions · {len(data['attendance'])} llistes · {'canvis' if changed else 'sense canvis'}")

# Fitxers pujats des de l'app (materials i documents): es desen a trossos a config/fitxer_<id>_<n>.
# Aquí se'n guarda una còpia sencera, un cop per fitxer, a fitxers/<id>/<nom>.
import base64, re
files = [x.get("file") for p in data["productions"] for x in (p.get("materials") or [])]
files += [x.get("file") for x in (data["config"].get("documents") or [])]
saved = 0
for f in filter(None, files):
    folder = os.path.join(OUT, "fitxers", f["id"])
    safe = re.sub(r"[^\w.\- ]+", "_", f.get("name") or "fitxer").strip() or "fitxer"
    target = os.path.join(folder, safe)
    if os.path.exists(target):
        continue
    parts = []
    for i in range(int(f.get("chunks") or 1)):
        doc = call(f"{BASE}/cors/{CHOIR}/config/fitxer_{f['id']}_{i}", token=token)
        parts.append(base64.b64decode(doc["fields"]["d"]["bytesValue"]))
    os.makedirs(folder, exist_ok=True)
    with open(target, "wb") as out:
        out.write(b"".join(parts))
    saved += 1
print(f"{len([f for f in files if f])} fitxers pujats · {saved} de nous a la còpia")
