"""Avisos al mòbil del cor (Web Push).

Llegeix les dades amb un compte de només lectura (rol «backup») i envia avisos als aparells
que s'han donat d'alta des de l'app. Envia quatre coses, cadascuna només un cop per persona:

  · anuncis nous al tauler
  · convocatòries que encara no han contestat, quan s'acosta la data límit
  · enquestes que es tanquen demà
  · recordatori de l'assaig de demà, al vespre

L'estat («què ja s'ha enviat») es desa al repositori privat de còpies, perquè el compte que
llegeix les dades no hi pot escriure.
"""
import datetime, json, os, sys, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

API = "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY"
BASE = "https://firestore.googleapis.com/v1/projects/cor-present/databases/(default)/documents"
CHOIR = os.environ["CHOIR_ID"]
VAPID = os.environ["PUSH_PRIVATE_KEY"]
APP_URL = os.environ.get("APP_URL", "https://polquingles.github.io/cor-present/")
CLAIMS = {"sub": APP_URL}
STATE = os.path.join(sys.argv[1], "avisos-estat.json")

TZ = ZoneInfo("Europe/Madrid")
NOW = datetime.datetime.now(TZ)
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
devices = collection("push")
CHOIR_NAME = config.get("name") or "Cor"

state = {"announcements": [], "sent": {}, "dead": []}
first_run = not os.path.exists(STATE)
if not first_run:
    try:
        state.update(json.load(open(STATE, encoding="utf-8")))
    except Exception:
        first_run = True
sent = state["sent"]
dead = set(state.get("dead", []))


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


def targets(kind, section=None, member_ids=None):
    """Aparells que volen aquest tipus d'avís."""
    for did, d in devices.items():
        if d.get("endpoint") in dead:
            continue
        prefs = d.get("prefs") or {}
        if not prefs.get(kind):
            continue
        if member_ids is not None and d.get("memberId") not in member_ids:
            continue
        if section and d.get("section") and d["section"] != section:
            continue
        yield did, d


def send(d, title, body, url, tag):
    try:
        webpush(
            subscription_info={"endpoint": d["endpoint"], "keys": {"p256dh": d["p256dh"], "auth": d["auth"]}},
            data=json.dumps({"title": title, "body": body, "url": url, "tag": tag}),
            vapid_private_key=VAPID, vapid_claims=dict(CLAIMS), ttl=60 * 60 * 20,
        )
        return True
    except WebPushException as e:
        code = getattr(e.response, "status_code", 0)
        if code in (404, 410):
            dead.add(d["endpoint"])
            print(f"  aparell caducat ({code})")
        else:
            print(f"  error {code}: {e}")
        return False


def once(key):
    """True el primer cop que es demana aquesta clau."""
    if key in sent:
        return False
    sent[key] = NOW.isoformat(timespec="seconds")
    return True


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
        if aid in state["announcements"]:
            continue
        state["announcements"].append(aid)
        if a.get("until") and a["until"] < TODAY.isoformat():
            continue
        secs = a.get("sections") or []
        for did, d in devices.items():
            if d.get("endpoint") in dead or not (d.get("prefs") or {}).get("anuncis"):
                continue
            if secs and d.get("section") and d["section"] not in secs:
                continue
            if not once(f"ann:{aid}:{did}"):
                continue
            if send(d, CHOIR_NAME, a.get("title", "Nou anunci al tauler"), APP_URL, f"ann-{aid}"):
                count += 1

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
            if not once(f"rsvp:{sid}:{stage}:{did}"):
                continue
            body = f"{s.get('type', 'Assaig')} del {when}: encara no has dit si hi seràs."
            if send(d, CHOIR_NAME, body, APP_URL, f"rsvp-{sid}"):
                count += 1

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
            if not once(f"poll:{pid}:{did}"):
                continue
            if send(d, CHOIR_NAME, f"Demà es tanca l'enquesta «{p.get('title', '')}».", APP_URL, f"poll-{pid}"):
                count += 1

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
            hour = f" a les {s['time']}" if s.get("time") else ""
            place = f" · {s['place']}" if s.get("place") else ""
            for did, d in targets("assajos", member_ids=who):
                if not once(f"ses:{sid}:{did}"):
                    continue
                if send(d, CHOIR_NAME, f"Demà {s.get('type', 'assaig').lower()}{hour}{place}.", APP_URL, f"ses-{sid}"):
                    count += 1

# Neteja: no cal recordar avisos de fa més d'un mes
cut = (NOW - datetime.timedelta(days=35)).isoformat(timespec="seconds")
state["sent"] = {k: v for k, v in sent.items() if v >= cut}
state["announcements"] = state["announcements"][-400:]
state["dead"] = sorted(dead)
os.makedirs(os.path.dirname(STATE) or ".", exist_ok=True)
with open(STATE, "w", encoding="utf-8") as f:
    json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)
print(f"{count} avisos enviats · {len(devices)} aparells donats d'alta")
