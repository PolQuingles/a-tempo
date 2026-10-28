"""Calendaris subscrits i identitat de cada agrupació.

Per a cada agrupació activa:
  · la marca (CAL_FER=marca, la tasca «Calendari», que la desa al repositori): el nom, el logotip, les icones i el manifest,
    a marca/<agrupació>/;
  · els calendaris (CAL_FER=calendaris, la tasca «Publica», que els posa a l'app publicada, a ICS_DIR, i mai al repositori,
    que és públic: així ningú no pot fer la llista dels personals ni trobar-ne les claus):
      - el general, si l'agrupació el té activat: el títol, l'hora, el lloc i qui hi és convocat, i prou (la primera agrupació
        a calendari.ics, com sempre; la resta a calendaris/<agrupació>.ics). L'horari del dia, el punt de trobada, què cal
        portar i les notes no hi van: el pot llegir qualsevol que en sàpiga l'adreça;
      - el personal de qui se n'ha fet la clau a l'app (calKeys): calendaris/p/<clau>.ics, amb les sessions on és convocat
        (i no les de les produccions que no fa), amb tots els detalls, i les seves classes;
      - el de classes d'abans (classIcs): calendaris/classes/<clau>.ics, només amb les classes d'aquella persona.
Sense CAL_FER, totes dues coses al directori d'on es crida (per provar-ho a mà).
Els registres de la tasca només diuen quants n'hi ha: cap nom ni cap clau.
"""
import datetime, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import dades, norma

PARTS = {x.strip() for x in (os.environ.get("CAL_FER") or "marca,calendaris").split(",") if x.strip()}
OUT = os.environ.get("ICS_DIR") or "."
TOKEN = re.compile(r"[A-Za-z0-9_-]{24,64}")
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


def calendar(name, events):
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//A Tempo//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
         f"X-WR-CALNAME:{esc(name)}", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT3H",
         "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
         "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
         "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
         "END:VTIMEZONE"]
    for ev in events:
        L += ev
    L.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in L) + "\r\n"


def has_details(s):
    info = s.get("info") or {}
    return bool(s.get("note") or any(info.get(k) for k in ("call", "dress", "meet", "bring", "extra")) or info.get("steps"))


def session_event(s, pnames, names, details):
    """Una sessió. Amb details, tot el que en diu la fitxa (només als calendaris personals)."""
    d = s["date"].replace("-", "")
    L = ["BEGIN:VEVENT", f"UID:{s['id']}@a-tempo", "DTSTAMP:20260101T000000Z"]
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
    desc = []
    if details:
        info = s.get("info") or {}
        desc += [f"{label}: {info[k]}" for k, label in [("call", "Convocatòria"), ("dress", "Vestuari"), ("meet", "Punt de trobada"),
                                                        ("bring", "Cal portar"), ("extra", "Indicacions")] if info.get(k)]
        steps = [x for x in info.get("steps") or [] if x.get("time") or x.get("what")]
        if steps:
            desc.append("Horari del dia:\n" + "\n".join(f"{x.get('time') or ''} {x.get('what') or ''}{' (' + x['where'] + ')' if x.get('where') else ''}".strip() for x in steps))
        desc.append(s.get("note") or "")
    if s.get("sections"):
        desc.append("Convocats: " + ", ".join(names.get(x, x) for x in s["sections"]))
    if not details and has_details(s):
        desc.append("L'horari del dia i tots els detalls, a l'app.")
    desc = "\n".join(x for x in desc if x)
    if desc:
        L.append(f"DESCRIPTION:{esc(desc)}")
    L.append("END:VEVENT")
    return L


def class_events(days, mid):
    """Les hores de classe d'una sola persona, sense ningú més."""
    out = []
    for c in sorted(days.values(), key=lambda x: x.get("date") or ""):
        if c.get("cancelled") or c.get("deleted"):
            continue
        for x in c.get("slots") or []:
            if x.get("memberId") != mid or not c.get("date") or not x.get("time"):
                continue
            try:
                begin = datetime.datetime.fromisoformat(f"{c['date']}T{x['time']}")
            except ValueError:
                continue
            end = begin + datetime.timedelta(minutes=int(x.get("mins") or 30))
            ev = ["BEGIN:VEVENT", f"UID:{c['id']}-{x.get('id', '')}@a-tempo", "DTSTAMP:20260101T000000Z",
                  f"DTSTART;TZID=Europe/Madrid:{begin:%Y%m%dT%H%M%S}", f"DTEND;TZID=Europe/Madrid:{end:%Y%m%dT%H%M%S}",
                  f"SUMMARY:{esc('Classe de cant')}"]
            if c.get("place"):
                ev.append(f"LOCATION:{esc(c['place'])}")
            if c.get("note"):
                ev.append(f"DESCRIPTION:{esc(c['note'])}")
            ev.append("END:VEVENT")
            out.append(ev)
    return out


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    old = open(path, newline="").read() if os.path.exists(path) else None
    if old != text:
        with open(path, "w", newline="") as f:
            f.write(text)


def read(path):
    """Una col·lecció; si el lector no hi té permís (el lector antic del calendari), res."""
    try:
        return r.list(path)
    except dades.Forbidden:
        return {}


published, branded, personal = set(), set(), 0
marca = None
if "marca" in PARTS:
    import marca   # (cal Pillow)
for gid, entry in groups.items():
    try:
        cfg = r.get(f"cors/{gid}/config/main") or {}
    except dades.Forbidden:
        print(f"{gid}: sense permís de lectura")
        continue
    if cfg.get("deleted"):
        continue
    label = cfg.get("name") or gid
    if "calendaris" in PARTS:
        names = dades.sections(cfg)
        prods = None
        if cfg.get("icsOn", gid == dades.FOUNDER):
            prods = r.list(f"cors/{gid}/productions")
            sessions = sorted(norma.sessions_of(prods).values(), key=lambda s: s["date"] + (s.get("time") or ""))
            pn = lambda s: [prods[p]["name"] for p in s.get("prods") or [] if p in prods and prods[p].get("name")]
            target = os.path.join(OUT, "calendari.ics" if gid == dades.FOUNDER else f"calendaris/{gid}.ics")
            write(target, calendar(cfg.get("name") or "Agrupació", [session_event(s, pn(s), names, False) for s in sessions]))
            published.add(target)
            print(f"{label}: {len(sessions)} sessions al calendari")
        # Els calendaris personals: les sessions de cadascú, amb tots els detalls, i les seves classes.
        keys = read(f"cors/{gid}/calKeys")
        old_keys = read(f"cors/{gid}/classIcs") if cfg.get("classesOn") else {}
        if keys or old_keys:
            days = r.list(f"cors/{gid}/classes") if cfg.get("classesOn") else {}
            if keys:
                prods = prods if prods is not None else r.list(f"cors/{gid}/productions")
                ps = norma.apply_guests(norma.apply_choices(prods, read(f"cors/{gid}/prodChoice")))
                sessions = sorted(norma.sessions_of(ps).values(), key=lambda s: s["date"] + (s.get("time") or ""))
                members = read(f"cors/{gid}/members")
                for mid, k in keys.items():
                    token, m = str(k.get("token") or ""), members.get(mid)
                    if not TOKEN.fullmatch(token) or not m or m.get("active") is False:
                        continue
                    mine = [s for s in sessions if norma.convoked(s, m.get("section")) and not norma.excluded(ps, mid, s.get("prods") or [])]
                    events = [session_event(s, [ps[p]["name"] for p in s.get("prods") or [] if p in ps and ps[p].get("name")], names, True) for s in mine]
                    target = os.path.join(OUT, f"calendaris/p/{token}.ics")
                    write(target, calendar(f"{cfg.get('name') or 'Agrupació'} · el meu calendari", events + class_events(days, mid)))
                    published.add(target)
                    personal += 1
            for mid, k in old_keys.items():
                token = str(k.get("token") or "")
                if TOKEN.fullmatch(token):
                    target = os.path.join(OUT, f"calendaris/classes/{token}.ics")
                    write(target, calendar(f"Classes · {cfg.get('name') or 'Agrupació'}", class_events(days, k.get("memberId") or mid)))
                    published.add(target)
                    personal += 1
    if marca:
        marca.build(cfg, ".", gid)
        branded.add(gid)
        if gid == dades.FOUNDER:
            marca.build(cfg, ".")   # on apunten les instal·lacions antigues

# Calendaris i marques d'agrupacions que ja no en tenen (esborrades, suspeses o amb el calendari desactivat).
if r.full and "calendaris" in PARTS:
    for sub, pat in [("calendaris", r"[A-Za-z0-9_-]{20,40}\.ics"), ("calendaris/classes", r".+\.ics"), ("calendaris/p", r".+\.ics")]:
        folder = os.path.join(OUT, sub)
        if os.path.isdir(folder):
            for f in os.listdir(folder):
                if re.fullmatch(pat, f) and os.path.join(folder, f) not in published:
                    os.remove(os.path.join(folder, f))
if r.full and marca:
    marca.prune(".", branded)
print(f"{len(branded)} marques · {len(published) - personal} calendaris generals · {personal} calendaris personals · {r.reads} lectures")
