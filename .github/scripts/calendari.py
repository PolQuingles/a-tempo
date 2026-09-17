"""Calendaris subscrits i identitat de cada agrupació.

Per a cada agrupació activa:
  · si té el calendari subscrit activat, genera el seu fitxer .ics amb totes les sessions
    (la primera agrupació a calendari.ics, com sempre; la resta a calendaris/<agrupació>.ics)
  · genera la seva marca (nom, logotip, icones i manifest) a marca/<agrupació>/
  · si fa classes de cant, escriu el calendari personal de qui se n'ha fet la clau des de l'app,
    a calendaris/classes/<clau>.ics: només hi surten les classes d'aquella persona.
Els calendaris no porten noms de persones: només produccions, dates, llocs i indicacions.
"""
import datetime, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import dades, marca

r, groups = dades.connect("CAL_REFRESH_TOKEN")


def esc(t):
    return str(t or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def fold(line):
    out, cur = [], b""
    for ch in line:
        b = ch.encode()
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur); cur = b""
        cur += b
    out.append(cur)
    return "\r\n ".join(p.decode() for p in out)


def ics(cfg, prods):
    names = dades.sections(cfg)
    sessions = []
    for pid, p in prods.items():
        for s in p.get("sessions", []):
            also = [a for a in s.get("alsoIn", []) if a != pid and a in prods]
            sessions.append((s, [p["name"]] + [prods[a]["name"] for a in also]))
    sessions.sort(key=lambda x: x[0]["date"] + (x[0].get("time") or ""))
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//A Tempo//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
         f"X-WR-CALNAME:{esc(cfg.get('name') or 'Agrupació')}", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
         "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
         "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
         "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
         "END:VTIMEZONE"]
    for s, pnames in sessions:
        d = s["date"].replace("-", "")
        L += ["BEGIN:VEVENT", f"UID:{s['id']}@a-tempo", "DTSTAMP:20260101T000000Z"]
        if s.get("time"):
            start = s["time"]
            end = s.get("end") or f"{min(23, int(start[:2]) + 2):02d}:{start[3:5]}"
            L += [f"DTSTART;TZID=Europe/Madrid:{d}T{start.replace(':', '')}00", f"DTEND;TZID=Europe/Madrid:{d}T{end.replace(':', '')}00"]
        else:
            nxt = (datetime.date.fromisoformat(s["date"]) + datetime.timedelta(days=1)).strftime("%Y%m%d")
            L += [f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{nxt}"]
        L.append(f"SUMMARY:{esc((s.get('type') or 'Assaig') + ' · ' + ' + '.join(pnames))}")
        if s.get("place"):
            L.append(f"LOCATION:{esc(s['place'])}")
        info = s.get("info") or {}
        desc = [f"{label}: {info[k]}" for k, label in [("call", "Convocatòria"), ("dress", "Vestuari"), ("meet", "Punt de trobada"),
                                                       ("bring", "Cal portar"), ("extra", "Indicacions")] if info.get(k)]
        desc.append(s.get("note") or "")
        if s.get("sections"):
            desc.append("Convocats: " + ", ".join(names.get(x, x) for x in s["sections"]))
        desc = "\n".join(x for x in desc if x)
        if desc:
            L.append(f"DESCRIPTION:{esc(desc)}")
        L.append("END:VEVENT")
    L.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in L) + "\r\n", len(sessions)


def classes_ics(cfg, days, mid, name):
    """El calendari d'una sola persona: les seves hores de classe, sense ningú més."""
    rows = []
    for c in sorted(days.values(), key=lambda x: x.get("date") or ""):
        if c.get("cancelled"):
            continue
        for x in c.get("slots") or []:
            if x.get("memberId") == mid and c.get("date") and x.get("time"):
                rows.append((c, x))
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//A Tempo//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
         f"X-WR-CALNAME:{esc('Classes · ' + (cfg.get('name') or 'Agrupació'))}", "X-WR-TIMEZONE:Europe/Madrid",
         "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
         "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
         "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
         "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
         "END:VTIMEZONE"]
    for c, x in rows:
        start = x["time"]
        try:
            begin = datetime.datetime.fromisoformat(f"{c['date']}T{start}")
        except ValueError:
            continue
        end = begin + datetime.timedelta(minutes=int(x.get("mins") or 30))
        L += ["BEGIN:VEVENT", f"UID:{c['id']}-{x.get('id', '')}@a-tempo", "DTSTAMP:20260101T000000Z",
              f"DTSTART;TZID=Europe/Madrid:{begin:%Y%m%dT%H%M%S}",
              f"DTEND;TZID=Europe/Madrid:{end:%Y%m%dT%H%M%S}",
              f"SUMMARY:{esc('Classe de cant')}"]
        if c.get("place"):
            L.append(f"LOCATION:{esc(c['place'])}")
        if c.get("note"):
            L.append(f"DESCRIPTION:{esc(c['note'])}")
        L.append("END:VEVENT")
    L.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in L) + "\r\n", len(rows)


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    old = open(path, newline="").read() if os.path.exists(path) else None
    if old != text:
        with open(path, "w", newline="") as f:
            f.write(text)


published, branded, personal = set(), set(), 0
for gid, entry in groups.items():
    try:
        cfg = r.get(f"cors/{gid}/config/main") or {}
    except dades.Forbidden:
        print(f"{gid}: sense permís de lectura")
        continue
    if cfg.get("deleted"):
        continue
    label = cfg.get("name") or gid
    target = "calendari.ics" if gid == dades.FOUNDER else f"calendaris/{gid}.ics"
    if cfg.get("icsOn", gid == dades.FOUNDER):
        text, n = ics(cfg, r.list(f"cors/{gid}/productions"))
        write(target, text)
        published.add(target)
        print(f"{label}: {n} sessions al calendari")
    # Calendari personal de les classes de qui se n'ha fet la clau des de l'app.
    if cfg.get("classesOn"):
        keys = r.list(f"cors/{gid}/classIcs")
        if keys:
            days = r.list(f"cors/{gid}/classes")
            for mid, k in keys.items():
                token = str(k.get("token") or "")
                if not re.fullmatch(r"[A-Za-z0-9_-]{24,64}", token):
                    continue
                text, n = classes_ics(cfg, days, mid, k.get("memberId") or mid)
                write(f"calendaris/classes/{token}.ics", text)
                published.add(f"calendaris/classes/{token}.ics")
                personal += 1
    marca.build(cfg, ".", gid)
    branded.add(gid)
    if gid == dades.FOUNDER:
        marca.build(cfg, ".")   # on apunten les instal·lacions antigues

# Calendaris i marques d'agrupacions que ja no en tenen (esborrades, suspeses o amb el calendari desactivat).
if r.full and os.path.isdir("calendaris"):
    for f in os.listdir("calendaris"):
        if re.fullmatch(r"[A-Za-z0-9_-]{20,40}\.ics", f) and f"calendaris/{f}" not in published:
            os.remove(os.path.join("calendaris", f))
if r.full and os.path.isdir("calendaris/classes"):
    for f in os.listdir("calendaris/classes"):
        if f.endswith(".ics") and f"calendaris/classes/{f}" not in published:
            os.remove(os.path.join("calendaris/classes", f))
if r.full:
    marca.prune(".", branded)
print(f"{len(branded)} agrupacions · {len(published) - personal} calendaris · {personal} calendaris personals de classes · {r.reads} lectures")
