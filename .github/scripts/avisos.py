"""Avisos al mòbil del cor (Web Push).

Llegeix les dades amb un compte de només lectura (rol «backup») i envia avisos als aparells
que s'han donat d'alta des de l'app. Envia quatre coses, cadascuna només un cop per persona:

  · anuncis nous al tauler
  · convocatòries que encara no han contestat, quan s'acosta la data límit
  · enquestes que es tanquen demà
  · recordatori de l'assaig de demà, al vespre (amb la fitxa del concert si n'hi ha)
  · material o document nou per a la teva corda i veu
  · resposta a un avís d'absència (acceptat o no)
  · als caps de corda: llista a mitges en acabar l'assaig, i cantaires que baixen de la norma

L'estat («què ja s'ha enviat») es desa al repositori privat de còpies, perquè el compte que
llegeix les dades no hi pot escriure.
"""
import datetime, json, math, os, sys, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

API = "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY"
BASE = "https://firestore.googleapis.com/v1/projects/cor-present/databases/(default)/documents"
CHOIR = os.environ["CHOIR_ID"]
VAPID = os.environ["PUSH_PRIVATE_KEY"]
APP_URL = os.environ.get("APP_URL", "https://polquingles.github.io/cor-present/")
# Adreça de contacte que demana l'estàndard, per si el servei de push ha d'avisar de res.
# Es pot canviar amb el secret PUSH_CONTACT; no cal que sigui personal.
CLAIMS = {"sub": os.environ.get("PUSH_CONTACT") or "mailto:cor-present@polquingles.github.io"}
STATE = os.path.join(sys.argv[1], "avisos-estat.json")

TZ = ZoneInfo("Europe/Madrid")
NOW = datetime.datetime.now(TZ)
UTC_NOW = datetime.datetime.now(datetime.timezone.utc)
# Un anunci només s'avisa si fa poc que s'ha publicat: així, qui s'hi doni d'alta
# demà no rep els anuncis de la setmana passada.
FRESH = (UTC_NOW - datetime.timedelta(hours=36)).isoformat().replace("+00:00", "Z")
TODAY = NOW.date()
SECTIONS = {"S": "Sopranos", "C": "Contralts", "T": "Tenors", "B": "Baixos"}
QUIET = NOW.hour < 8 or NOW.hour >= 22          # de nit no s'envia res
EVENING = 18 <= NOW.hour < 21                   # finestra del recordatori d'assaig


def call(url, body=None, token=None, form=False):
    headers, data = {}, None
    if form:
        data = urllib.parse.urlencode(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
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
             {"grant_type": "refresh_token", "refresh_token": os.environ["BACKUP_REFRESH_TOKEN"]},
             form=True)["id_token"]


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


config = dec({"mapValue": call(f"{BASE}/cors/{CHOIR}/config/main", token=token)})
members = collection("members")
productions = collection("productions")
announcements = collection("announcements")
polls = collection("polls")
poll_votes = collection("pollVotes")
rsvp = collection("rsvp")
absences = collection("absences")
attendance = collection("attendance")
subs = collection("subs")
people = collection("staff")
# Qui ja no té accés al cor tampoc no ha de rebre avisos.
devices = {k: v for k, v in collection("push").items() if not v.get("email") or v["email"] in people}
CHOIR_NAME = config.get("name") or "Cor"

state = {"announcements": [], "sent": {}, "dead": [], "fails": {}}
first_run = not os.path.exists(STATE)
if not first_run:
    try:
        state.update(json.load(open(STATE, encoding="utf-8")))
    except Exception:
        first_run = True
sent = state["sent"]
dead = set(state.get("dead", []))
fails = state.setdefault("fails", {})


def sessions(prod=None):
    """Totes les sessions, amb la producció a què pertanyen (les compartides surten un cop)."""
    out = {}
    for p in productions.values():
        for s in p.get("sessions") or []:
            sid = s.get("id")
            if not sid:
                continue
            row = out.setdefault(sid, dict(s))
            row.setdefault("prodName", p.get("name", ""))
            row["prods"] = sorted(set(row.get("prods", []) + [p.get("id")] + (s.get("alsoIn") or [])))
    return out


ALL = sessions()


def convoked(s, section):
    secs = s.get("sections") or []
    return not secs or section in secs


def on_leave(m, date):
    for lv in m.get("leaves") or []:
        if lv.get("from") and lv["from"] <= date and (not lv.get("to") or lv["to"] >= date):
            return True
    return False


def excluded(mid, prods):
    """Només queda fora si no fa cap de les produccions de la sessió."""
    prods = [pid for pid in prods if pid in productions]
    return bool(prods) and all(mid in (productions[pid].get("excluded") or []) for pid in prods)


DEFAULT_PREFS = {"anuncis": True, "convocatories": True, "enquestes": True, "assajos": False,
                 "materials": True, "absencies": True, "llistes": True, "risc": True}
EDIT_ROLES = {"admin", "director", "leader"}
WEEKDAYS = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"]


def wants(d, kind):
    prefs = d.get("prefs") or {}
    return bool(prefs.get(kind, DEFAULT_PREFS.get(kind, False)))


def day_label(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{WEEKDAYS[d.weekday()]} {d.strftime('%d/%m')}"


def targets(kind, section=None, member_ids=None):
    """Aparells que volen aquest tipus d'avís."""
    for did, d in devices.items():
        if d.get("endpoint") in dead:
            continue
        if not wants(d, kind):
            continue
        if member_ids is not None and d.get("memberId") not in member_ids:
            continue
        if section and d.get("section") and d["section"] != section:
            continue
        yield did, d


def send(d, title, body, url, tag):
    """'ok' enviat · 'gone' l'aparell ja no hi és · 'retry' error passatger."""
    try:
        webpush(
            subscription_info={"endpoint": d["endpoint"], "keys": {"p256dh": d["p256dh"], "auth": d["auth"]}},
            data=json.dumps({"title": title, "body": body, "url": url, "tag": tag}),
            vapid_private_key=VAPID, vapid_claims=dict(CLAIMS), ttl=60 * 60 * 20,
        )
        return "ok"
    except WebPushException as e:
        code = getattr(e.response, "status_code", 0)
        if code in (400, 401, 403, 404, 410):
            dead.add(d["endpoint"])
            print(f"  aparell descartat ({code})")
            return "gone"
        print(f"  error {code}: {e}")
        ep = d["endpoint"]
        fails[ep] = fails.get(ep, 0) + 1
        if fails[ep] >= 6:           # sis intents seguits fallats: es deixa córrer
            dead.add(ep)
            print("  aparell descartat després de sis intents")
            return "gone"
        return "retry"


def deliver(key, d, title, body, url, tag):
    """Envia si encara no s'havia enviat. Si l'error és passatger, es tornarà a provar."""
    if key in sent:
        return 0
    r = send(d, title, body, url, tag)
    if r != "retry":
        sent[key] = NOW.isoformat(timespec="seconds")
    if r == "ok":
        fails.pop(d["endpoint"], None)
        return 1
    return 0


count = 0
if first_run:
    # La primera vegada només es pren nota del que ja hi ha: ningú no ha de rebre avisos vells.
    state["announcements"] = list(announcements.keys())
    print(f"Primera execució: {len(announcements)} anuncis marcats com a vistos, cap avís enviat.")
elif QUIET:
    print("Hores de silenci: no s'envia res.")
else:
    # 1. Anuncis nous
    for aid, a in sorted(announcements.items(), key=lambda kv: kv[1].get("createdAt") or ""):
        if aid in state["announcements"] or (a.get("createdAt") or "") < FRESH:
            continue
        if a.get("until") and a["until"] < TODAY.isoformat():
            continue
        secs = a.get("sections") or []
        for did, d in devices.items():
            if d.get("endpoint") in dead or not wants(d, "anuncis"):
                continue
            if secs and d.get("section") and d["section"] not in secs:
                continue
            count += deliver(f"ann:{aid}:{did}", d, CHOIR_NAME, a.get("title", "Nou anunci al tauler"), APP_URL, f"ann-{aid}")

    # 2. Convocatòries per confirmar
    for sid, s in ALL.items():
        if not s.get("rsvp") or s.get("date", "") < TODAY.isoformat():
            continue
        limit = s.get("rsvpBy") or s.get("date")
        days = (datetime.date.fromisoformat(limit) - TODAY).days
        stage = "3" if days == 3 else "1" if days == 1 else None
        if not stage or not EVENING:
            continue
        pending = [
            mid for mid, m in members.items()
            if m.get("active") is not False and convoked(s, m.get("section"))
            and not on_leave(m, s["date"]) and not excluded(mid, s.get("prods") or [])
            and f"{sid}_{mid}" not in rsvp
        ]
        when = datetime.date.fromisoformat(s["date"]).strftime("%d/%m")
        for did, d in targets("convocatories", member_ids=set(pending)):
            body = f"{s.get('type', 'Assaig')} del {when}: encara no has dit si hi seràs."
            count += deliver(f"rsvp:{sid}:{stage}:{did}", d, CHOIR_NAME, body, APP_URL, f"rsvp-{sid}")

    # 3. Enquestes que es tanquen demà
    tomorrow = (TODAY + datetime.timedelta(days=1)).isoformat()
    for pid, p in polls.items():
        if p.get("closed") or p.get("closesAt") != tomorrow or not EVENING:
            continue
        secs = p.get("sections") or []
        for did, d in targets("enquestes"):
            mid = d.get("memberId")
            if not mid or f"{pid}_{mid}" in poll_votes:
                continue
            if secs and d.get("section") and d["section"] not in secs:
                continue
            count += deliver(f"poll:{pid}:{did}", d, CHOIR_NAME, f"Demà es tanca l'enquesta «{p.get('title', '')}».", APP_URL, f"poll-{pid}")

    # 4. Recordatori de l'assaig de demà
    if EVENING:
        for sid, s in ALL.items():
            if s.get("date") != tomorrow:
                continue
            who = {
                mid for mid, m in members.items()
                if m.get("active") is not False and convoked(s, m.get("section"))
                and not on_leave(m, s["date"]) and not excluded(mid, s.get("prods") or [])
            }
            info = s.get("info") or {}
            hour = f" a les {s['time']}" if s.get("time") else ""
            call_at = f" · convocatòria {info['call']}" if info.get("call") else ""
            place = f" · {s['place']}" if s.get("place") else ""
            extra = "".join(f" {label}: {info[k]}." for k, label in [("dress", "Vestuari"), ("meet", "Punt de trobada")] if info.get(k))
            for did, d in targets("assajos", member_ids=who):
                count += deliver(f"ses:{sid}:{did}", d, CHOIR_NAME, f"Demà {s.get('type', 'assaig').lower()}{hour}{call_at}{place}.{extra}", APP_URL, f"ses-{sid}")

# ---------- 5. Material o document nou ----------
def part_matches(item_part, member):
    if not item_part:
        return True
    mp = member.get("part") or ""
    return not mp or item_part in mp or mp in item_part


items = [(f"mat:{p.get('id')}:{x.get('id')}", p, x) for p in productions.values() for x in (p.get("materials") or [])]
items += [(f"doc:{x.get('id')}", None, x) for x in (config.get("documents") or [])]
seen_items = state.get("materials")
if seen_items is None:
    # Primer cop: el que ja hi ha no és nou per a ningú.
    state["materials"] = {k: NOW.isoformat(timespec="seconds") for k, _, _ in items}
else:
    for key, _, _ in items:
        seen_items.setdefault(key, NOW.isoformat(timespec="seconds"))
    recent = (NOW - datetime.timedelta(hours=36)).isoformat(timespec="seconds")
    if not QUIET:
        for key, p, x in items:
            if seen_items[key] < recent:
                continue
            for did, d in targets("materials"):
                if x.get("by") and d.get("email") == x["by"]:
                    continue
                mid = d.get("memberId")
                m = members.get(mid) if mid else None
                if x.get("section") and (not m or m.get("section") != x["section"]):
                    continue
                if m and not part_matches(x.get("part"), m):
                    continue
                if p and m and mid in (p.get("excluded") or []):
                    continue
                body = f"Material nou de {p.get('name', '')}: {x.get('title', '')}" if p else f"Document nou: {x.get('title', '')}"
                count += deliver(f"{key}:{did}", d, CHOIR_NAME, body, APP_URL, f"mat-{x.get('id')}")
    state["materials"] = {k: v for k, v in seen_items.items() if k in {i[0] for i in items}}

# ---------- 6. Resposta a un avís d'absència ----------
abs_since = state.setdefault("abs_since", UTC_NOW.isoformat().replace("+00:00", "Z"))
if not QUIET:
    for aid, a in absences.items():
        status = a.get("status")
        reviewed = a.get("reviewedAt") or ""
        if status not in ("accepted", "rejected") or reviewed < abs_since or reviewed < FRESH:
            continue
        days = sorted(ALL[x]["date"] for x in (a.get("sessionIds") or []) if x in ALL)
        when = ", ".join(day_label(x) for x in days[:3]) + ("…" if len(days) > 3 else "") or "la sessió"
        if status == "accepted":
            body = f"T'han acceptat l'avís per al {when}." + (" Queda com a falta justificada." if a.get("kind") == "absent" else "")
        else:
            body = f"No t'han acceptat l'avís per al {when}. Parla-ho amb el teu cap de corda."
        for did, d in targets("absencies", member_ids={a.get("memberId")}):
            count += deliver(f"abs:{aid}:{status}:{did}", d, CHOIR_NAME, body, APP_URL, f"abs-{aid}")


# ---------- Caps de corda ----------
def leader_cordes(d):
    """Cordes de les quals aquest aparell vol els avisos de cap de corda."""
    person = people.get(d.get("email") or "")
    if not person or person.get("role") not in EDIT_ROLES:
        return set()
    if isinstance(d.get("cordes"), list):
        return set(d["cordes"])
    if person.get("role") == "leader" and person.get("section"):
        return {person["section"]}
    m = members.get(person.get("memberId") or "")
    return {m["section"]} if m and m.get("leader") and m.get("section") else set()


def eff_mark(s, m, mid, ctx=None):
    if ctx and mid in (productions.get(ctx, {}).get("excluded") or []):
        return {"s": "NP"}
    mk = ((attendance.get(f"{s['id']}_{m.get('section')}") or {}).get("marks") or {}).get(mid)
    if mk and mk.get("s"):
        return mk
    if on_leave(m, s["date"]) or excluded(mid, s.get("prods") or []):
        return {"s": "NP"}
    return None


active = {mid: m for mid, m in members.items() if m.get("active") is not False}

# ---------- 7. Llista a mitges en acabar l'assaig ----------
def ends_at(s):
    if not s.get("time"):
        return None
    hh, mm = (s.get("end") or "").split(":") if s.get("end") else (str(min(23, int(s["time"][:2]) + 2)), s["time"][3:5])
    return datetime.datetime.fromisoformat(f"{s['date']}T{int(hh):02d}:{mm}").replace(tzinfo=TZ)


yesterday = (TODAY - datetime.timedelta(days=1)).isoformat()
for sid, s in ALL.items():
    end = ends_at(s)
    if not end or s["date"] not in (TODAY.isoformat(), yesterday):
        continue
    after = (NOW - end).total_seconds() / 60
    # Mitja hora després d'acabar (que hi hagi temps d'acabar de marcar), i si no, l'endemà al matí.
    tonight = s["date"] == TODAY.isoformat() and after >= 25 and (NOW.hour, NOW.minute) <= (23, 45)
    morning = s["date"] == yesterday and 9 <= NOW.hour < 13
    if not (tonight or morning):
        continue
    for sec, sec_name in SECTIONS.items():
        if not convoked(s, sec):
            continue
        roster = [(mid, m) for mid, m in active.items() if m.get("section") == sec]
        done = sum(1 for mid, m in roster if eff_mark(s, m, mid))
        if not roster or done >= len(roster):
            continue
        sub = subs.get(f"{sid}_{sec}") or {}
        body = (f"La llista de {sec_name.lower()} del {day_label(s['date'])} ha quedat a mitges: {done} de {len(roster)}."
                if done else f"Encara no s'ha passat la llista de {sec_name.lower()} del {day_label(s['date'])}.")
        for did, d in devices.items():
            if d.get("endpoint") in dead or not wants(d, "llistes"):
                continue
            is_sub = sub.get("memberId") and d.get("memberId") == sub["memberId"]
            if not is_sub and sec not in leader_cordes(d):
                continue
            count += deliver(f"roll:{sid}:{sec}:{did}", d, CHOIR_NAME, body, APP_URL, f"roll-{sid}-{sec}")

# ---------- 8. Cantaires que baixen de la norma ----------
MIN = min(100, max(1, int(config.get("minAttendance") or 80))) / 100
RULE_SKIP = {"Concert", "Altres"}


def rule_status(pid, mid, m):
    if mid in (productions[pid].get("excluded") or []):
        return None
    att = ab = remaining = 0
    today = TODAY.isoformat()
    for s in ALL.values():
        if pid not in (s.get("prods") or []) or s.get("type") in RULE_SKIP or not convoked(s, m.get("section")):
            continue
        doc = attendance.get(f"{s['id']}_{m.get('section')}") or {}
        marked = eff_mark(s, m, mid, pid) if s["date"] <= today and doc.get("marks") else None
        if not marked:
            if s["date"] >= today and not on_leave(m, s["date"]):
                remaining += 1
            continue
        if marked["s"] == "NP":
            continue
        if marked["s"] in ("P", "R"):
            att += 1
        else:
            ab += 1
    done = att + ab
    if not done:
        return None
    cur, best = att / done, (att + remaining) / (done + remaining)
    return {"cur": cur, "best": best, "att": att, "ab": ab, "remaining": remaining,
            "status": "out" if best < MIN else "risk" if cur < MIN else "ok"}


def needed(rs):
    """Assajos que encara ha de venir per arribar a la norma (com a l'app)."""
    return max(0, math.ceil(MIN * (rs["att"] + rs["ab"] + rs["remaining"]) - rs["att"] - 1e-9))


risk_state = state.setdefault("risk", {})
if not QUIET:
    live = [pid for pid in productions if any(pid in (s.get("prods") or []) and s["date"] >= TODAY.isoformat() for s in ALL.values())]
    for pid in live:
        prod = productions[pid]
        previous = risk_state.get(pid)
        now_status = {}
        for mid, m in active.items():
            rs = rule_status(pid, mid, m)
            if not rs:
                continue
            now_status[mid] = rs["status"]
            before = (previous or {}).get(mid, "ok")
            if previous is None or rs["status"] == "ok" or rs["status"] == before or before == "out":
                continue
            pct = round(rs["cur"] * 100)
            name = m.get("name", "")
            sec_name = SECTIONS.get(m.get("section"), "")
            if rs["status"] == "risk":
                n = needed(rs)
                which = f"tots els {n}" if n == rs["remaining"] else f"{n} dels {rs['remaining']}"
                body = f"{name} ({sec_name}) ha baixat del {round(MIN * 100)}% a {prod.get('name', '')}: {pct}%. Ha de venir a {which} assajos que queden."
            else:
                body = f"{name} ({sec_name}) ja no arriba al {round(MIN * 100)}% a {prod.get('name', '')}: com a màxim, {round(rs['best'] * 100)}%."
            for did, d in devices.items():
                if d.get("endpoint") in dead or not wants(d, "risc") or m.get("section") not in leader_cordes(d):
                    continue
                count += deliver(f"risk:{pid}:{mid}:{rs['status']}:{did}", d, CHOIR_NAME, body, APP_URL, f"risk-{pid}-{mid}")
        risk_state[pid] = now_status

# Neteja: no cal recordar avisos de fa més d'un mes
cut = (NOW - datetime.timedelta(days=35)).isoformat(timespec="seconds")
state["sent"] = {k: v for k, v in sent.items() if v >= cut}
state["announcements"] = state["announcements"][-400:]
state["dead"] = sorted(dead)
state["fails"] = {k: v for k, v in fails.items() if k not in dead}
os.makedirs(os.path.dirname(STATE) or ".", exist_ok=True)
with open(STATE, "w", encoding="utf-8") as f:
    json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)
print(f"{count} avisos enviats · {len(devices)} aparells donats d'alta")
