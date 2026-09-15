"""Genera calendari.ics a partir de les produccions del cor (Firestore).

Entra amb un compte de només lectura del calendari (rol «calendar»): només pot llegir
produccions i configuració, no dades de cantaires ni assistència.
"""
import json, os, urllib.parse, urllib.request

API = "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY"
BASE = "https://firestore.googleapis.com/v1/projects/cor-present/databases/(default)/documents"
CHOIR = os.environ["CHOIR_ID"]


def call(url, body=None, token=None, form=False):
    headers = {}
    data = None
    if form:
        data = urllib.parse.urlencode(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
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
    return x


token = call(f"https://securetoken.googleapis.com/v1/token?key={API}",
             {"grant_type": "refresh_token", "refresh_token": os.environ["CAL_REFRESH_TOKEN"]}, form=True)["id_token"]
docs = call(f"{BASE}/cors/{CHOIR}/productions?pageSize=300", token=token).get("documents", [])
prods = {d["name"].rsplit("/", 1)[1]: dec({"mapValue": d}) for d in docs}
cfg = dec({"mapValue": call(f"{BASE}/cors/{CHOIR}/config/main", token=token)})

SECTIONS = {"S": "Sopranos", "C": "Contralts", "T": "Tenors", "B": "Baixos"}


def esc(t):
    return str(t or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\;")


def fold(line):
    raw = line.encode()
    out, cur = [], b""
    for ch in line:
        b = ch.encode()
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur); cur = b""
        cur += b
    out.append(cur)
    return "\r\n ".join(p.decode() for p in out)


sessions = []
for pid, p in prods.items():
    for s in p.get("sessions", []):
        also = [a for a in s.get("alsoIn", []) if a != pid and a in prods]
        sessions.append((s, [p["name"]] + [prods[a]["name"] for a in also]))
sessions.sort(key=lambda x: x[0]["date"] + (x[0].get("time") or ""))

L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cor Present//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
     f"X-WR-CALNAME:{esc(cfg.get('name') or 'Cor')}", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
     "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
     "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
     "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
     "END:VTIMEZONE"]
for s, names in sessions:
    d = s["date"].replace("-", "")
    L += ["BEGIN:VEVENT", f"UID:{s['id']}@cor-present", "DTSTAMP:20260101T000000Z"]
    if s.get("time"):
        start = s["time"]
        end = s.get("end") or f"{min(23, int(start[:2]) + 2):02d}:{start[3:5]}"
        L += [f"DTSTART;TZID=Europe/Madrid:{d}T{start.replace(':', '')}00", f"DTEND;TZID=Europe/Madrid:{d}T{end.replace(':', '')}00"]
    else:
        import datetime
        nxt = (datetime.date.fromisoformat(s["date"]) + datetime.timedelta(days=1)).strftime("%Y%m%d")
        L += [f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{nxt}"]
    L.append(f"SUMMARY:{esc((s.get('type') or 'Assaig') + ' · ' + ' + '.join(names))}")
    if s.get("place"):
        L.append(f"LOCATION:{esc(s['place'])}")
    desc = [s.get("note") or ""]
    if s.get("sections"):
        desc.append("Convocats: " + ", ".join(SECTIONS.get(x, x) for x in s["sections"]))
    desc = "\n".join(x for x in desc if x)
    if desc:
        L.append(f"DESCRIPTION:{esc(desc)}")
    L.append("END:VEVENT")
L.append("END:VCALENDAR")

with open("calendari.ics", "w", newline="") as f:
    f.write("\r\n".join(fold(x) for x in L) + "\r\n")
print(f"{len(sessions)} sessions")
