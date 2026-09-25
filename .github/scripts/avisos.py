"""Avisos al mòbil (Web Push) de totes les agrupacions.

Llegeix les dades amb el compte de servei (només lectura) i envia avisos als aparells que s'han donat
d'alta des de l'app. Cada avís s'envia un sol cop per aparell:

  · anuncis nous al tauler, missatges i respostes a les converses privades
  · canvis al calendari: una sessió que canvia de dia, d'hora o de lloc, una de nova i una d'anul·lada
  · convocatòries que encara no han contestat, quan s'acosta la data límit
  · enquestes i sortides noves, i les que es tanquen demà (a qui encara no ha respost)
  · els recordatoris que l'equip envia des de l'app a qui encara no ha respost («Recorda-ho»)
  · recordatori de l'assaig de demà, al vespre (amb la fitxa del concert si n'hi ha)
  · material o document nou per a la secció i la part de cadascú
  · resposta a un avís d'absència (acceptat o no)
  · als caps de corda o de secció: llista a mitges en acabar l'assaig, i qui baixa de la norma

Per no gastar lectures de la base de dades (el pla gratuït en té un límit diari per a totes les
agrupacions juntes), només es llegeix el que cal a cada moment: les agrupacions sense cap aparell
donat d'alta es miren en dues lectures, i la plantilla i les llistes només quan hi ha alguna cosa a avisar.

L'estat («què ja s'ha enviat») es desa al repositori privat de còpies, perquè el compte de servei no pot
escriure a la base de dades: la primera agrupació a l'arrel i la resta a agrupacions/<agrupació>/.
"""
import datetime, hashlib, json, math, os, sys
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

sys.path.insert(0, os.path.dirname(__file__))
import dades
import norma

VAPID = os.environ["PUSH_PRIVATE_KEY"]
APP_URL = os.environ.get("APP_URL", "https://polquingles.github.io/a-tempo/")
# Adreça de contacte que demana l'estàndard, per si el servei de push ha d'avisar de res.
# Es pot canviar amb el secret PUSH_CONTACT; no cal que sigui personal.
CLAIMS = {"sub": os.environ.get("PUSH_CONTACT") or "mailto:a-tempo@polquingles.github.io"}
ROOT = sys.argv[1]
SITE = os.environ.get("SITE_DIR", ".")      # còpia del web publicat, per saber si ja hi ha icones

TZ = ZoneInfo("Europe/Madrid")
NOW = datetime.datetime.fromisoformat(os.environ["AVISOS_NOW"]).replace(tzinfo=TZ) if os.environ.get("AVISOS_NOW") else datetime.datetime.now(TZ)
UTC_NOW = NOW.astimezone(datetime.timezone.utc)
# Un anunci només s'avisa si fa poc que s'ha publicat: així, qui s'hi doni d'alta demà no rep els
# anuncis de la setmana passada.
FRESH = (UTC_NOW - datetime.timedelta(hours=36)).isoformat().replace("+00:00", "Z")
TODAY = NOW.date()
QUIET = NOW.hour < 8 or NOW.hour >= 22          # de nit no s'envia res
EVENING = 18 <= NOW.hour < 21                   # finestra dels recordatoris del vespre
# La norma d'assistència només canvia quan es passa llista: es revisa dos cops al dia.
RISK_TIME = os.environ.get("AVISOS_RISK") == "1" or (NOW.hour in (10, 19) and NOW.minute < 30)

DEFAULT_PREFS = {"missatges": True, "calendari": True, "anuncis": True, "convocatories": True, "enquestes": True, "sortides": True,
                 "assajos": False, "materials": True, "absencies": True, "llistes": True, "risc": True, "classes": True}
EDIT_ROLES = {"admin", "director", "gerencia", "secretaria", "leader"}


def roles_of(person):
    """Els rols d'una fitxa: la llista roles o, a les fitxes d'abans, el rol únic."""
    roles = person.get("roles")
    return set(roles) if isinstance(roles, list) and roles else {person.get("role")}
WEEKDAYS = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"]

r, groups = dades.connect("BACKUP_REFRESH_TOKEN")


def wants(d, kind):
    prefs = d.get("prefs") or {}
    return bool(prefs.get(kind, DEFAULT_PREFS.get(kind, False)))


def day_label(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{WEEKDAYS[d.weekday()]} {d.strftime('%d/%m')}"


convoked = norma.convoked
on_leave = norma.on_leave


def part_matches(item_part, member):
    if not item_part:
        return True
    mp = member.get("part") or ""
    return not mp or item_part in mp or mp in item_part


class Group:
    """Tot el que cal per enviar els avisos d'una agrupació. Les lectures grans es fan només si calen."""

    def __init__(self, gid, config, devices, people):
        self.gid, self.config, self.people = gid, config, people
        self.base = f"cors/{gid}"
        self.devices = devices
        self.name = config.get("name") or "A Tempo"
        self.url = APP_URL if gid == dades.FOUNDER else f"{APP_URL}?a={gid}"
        has_icon = os.path.exists(os.path.join(SITE, "marca", gid, "icon-192.png"))
        self.icon = f"marca/{gid}/icon-192.png" if has_icon else None
        k = dades.KINDS[dades.kind(config)]
        self.words = k
        self.sec_names = dades.sections(config)
        self.rule_skip = set(k["shows"]) | {"Altres", "Reunió"}
        self._members = None
        self._attendance = None

        self.state_path = os.path.join(dades.folder(ROOT, gid), "avisos-estat.json")
        self.state = {"announcements": [], "sent": {}, "dead": [], "fails": {}}
        self.first_run = not os.path.exists(self.state_path)
        if not self.first_run:
            try:
                self.state.update(json.load(open(self.state_path, encoding="utf-8")))
            except Exception:
                self.first_run = True
        self.sent = self.state["sent"]
        self.dead = set(self.state.get("dead", []))
        self.fails = self.state.setdefault("fails", {})
        self.count = 0

        self.productions = r.list(f"{self.base}/productions")
        self.all = self._sessions()

    # ---------- lectures ----------
    def members(self):
        if self._members is None:
            self._members = r.list(f"{self.base}/members")
        return self._members

    def active(self):
        return {mid: m for mid, m in self.members().items() if m.get("active") is not False}

    def attendance(self):
        """Totes les llistes. Els trossos de temporada ja arxivats (vegeu js/02-dades.js) es llegeixen d'un sol document."""
        if self._attendance is None:
            cut = (self.config.get("attArchive") or {}).get("cut")
            if cut:
                docs = {}
                for a in sorted(r.list(f"{self.base}/attArchive").values(), key=lambda a: a.get("from") or ""):
                    docs.update(a.get("docs") or {})
                docs.update(r.query(self.base, "attendance", [("date", ">", cut)]))
                self._attendance = docs
            else:
                self._attendance = r.list(f"{self.base}/attendance")
        return self._attendance

    def _sessions(self):
        """Totes les sessions, amb les produccions a què pertanyen (les compartides surten un cop)."""
        return norma.sessions_of(self.productions)

    def excluded(self, mid, prods):
        """Només queda fora si no fa cap de les produccions de la sessió."""
        return norma.excluded(self.productions, mid, prods)

    # ---------- enviament ----------
    def targets(self, kind, member_ids=None):
        for did, d in self.devices.items():
            if d.get("endpoint") in self.dead or not wants(d, kind):
                continue
            if member_ids is not None and d.get("memberId") not in member_ids:
                continue
            yield did, d

    def send(self, d, body, tag, extra=None):
        """'ok' enviat · 'gone' l'aparell ja no hi és · 'retry' error passatger.
        extra: botons de la notificació ({"actions": [...], "sid": sessió}) per respondre sense obrir l'app."""
        payload = {"title": self.name, "body": body, "url": self.url, "tag": tag, **(extra or {})}
        if self.icon:
            payload["icon"] = self.icon
        try:
            webpush(
                subscription_info={"endpoint": d["endpoint"], "keys": {"p256dh": d["p256dh"], "auth": d["auth"]}},
                data=json.dumps(payload),
                vapid_private_key=VAPID, vapid_claims=dict(CLAIMS), ttl=60 * 60 * 20,
            )
            return "ok"
        except WebPushException as e:
            code = getattr(e.response, "status_code", 0)
            if code in (400, 401, 403, 404, 410):
                self.dead.add(d["endpoint"])
                print(f"  aparell descartat ({code})")
                return "gone"
            print(f"  error {code}: {e}")
            ep = d["endpoint"]
            self.fails[ep] = self.fails.get(ep, 0) + 1
            if self.fails[ep] >= 6:           # sis intents seguits fallats: es deixa córrer
                self.dead.add(ep)
                print("  aparell descartat després de sis intents")
                return "gone"
            return "retry"

    def send_once(self, key, d, body, tag):
        """Com deliver, però diu si ha quedat enviat (per donar per enviats també els avisos que agrupa)."""
        self.deliver(key, d, body, tag)
        return key in self.sent

    def deliver(self, key, d, body, tag, extra=None):
        """Envia si encara no s'havia enviat. Si l'error és passatger, es tornarà a provar."""
        if key in self.sent:
            return
        res = self.send(d, body, tag, extra)
        if res != "retry":
            self.sent[key] = NOW.isoformat(timespec="seconds")
        if res == "ok":
            self.fails.pop(d["endpoint"], None)
            self.count += 1

    # ---------- 1. Anuncis nous ----------
    def announcements(self):
        fresh = r.query(self.base, "announcements", [("createdAt", ">=", FRESH)])
        if self.first_run:
            # La primera vegada només es pren nota del que ja hi ha: ningú no ha de rebre avisos vells.
            self.state["announcements"] = list(fresh.keys())
            return
        if QUIET:
            return
        for aid, a in sorted(fresh.items(), key=lambda kv: kv[1].get("createdAt") or ""):
            if aid in self.state["announcements"]:
                continue
            if a.get("until") and a["until"] < TODAY.isoformat():
                continue
            secs = a.get("sections") or []
            for did, d in self.targets("anuncis"):
                if secs and d.get("section") and d["section"] not in secs:
                    continue
                self.deliver(f"ann:{aid}:{did}", d, a.get("title", "Nou anunci al tauler"), f"ann-{aid}")

    # ---------- 1b. Missatges (dins l'app) i enquestes noves ----------
    def messages(self):
        """Un missatge arriba als aparells de la seva corda (o a tots si és per a tothom), menys al de qui l'ha escrit."""
        fresh = r.query(self.base, "messages", [("createdAt", ">=", FRESH)])
        if "messages" not in self.state:
            # Primer cop amb missatges: el que ja hi ha no s'avisa.
            self.state["messages"] = list(fresh.keys())
            return
        if QUIET:
            return
        for mid_, m in sorted(fresh.items(), key=lambda kv: kv[1].get("createdAt") or ""):
            if mid_ in self.state["messages"]:
                continue
            to = m.get("to") or ["*"]
            head = m.get("byName") or "Missatge"
            text = m.get("title") or m.get("body") or ""
            for did, d in self.targets("missatges"):
                if d.get("email") and d.get("email") == m.get("by"):
                    continue
                if "*" not in to and d.get("section") not in to:
                    continue
                self.deliver(f"msg:{mid_}:{did}", d, f"{head}: {text[:140]}", f"msg-{mid_}")
            self.state["messages"].append(mid_)

    def new_polls(self):
        fresh = r.query(self.base, "polls", [("createdAt", ">=", FRESH)])
        if "polls_new" not in self.state:
            self.state["polls_new"] = list(fresh.keys())
            return
        if QUIET:
            return
        for pid, p in fresh.items():
            if pid in self.state["polls_new"] or p.get("closed"):
                continue
            secs = p.get("sections") or []
            for did, d in self.targets("enquestes"):
                if secs and d.get("section") and d["section"] not in secs:
                    continue
                self.deliver(f"pollnew:{pid}:{did}", d, f"Nova enquesta: {p.get('title', '')}", f"poll-{pid}")
            self.state["polls_new"].append(pid)

    # ---------- 1c. Converses privades ----------
    def thread_staff(self, t, d):
        """Si aquest aparell és de qui ha de rebre la conversa per part de l'equip (el seu correu o el seu rol)."""
        person = self.people.get(d.get("email") or "")
        if not person:
            return False
        if t.get("toEmail") and d.get("email") == t["toEmail"]:
            return True
        role, roles = t.get("toRole") or "", roles_of(person)
        if role == "leader":
            return "leader" in roles and person.get("section") == t.get("section")
        return bool(role) and role in roles

    def threads(self):
        """Un missatge nou en una conversa arriba a l'altra banda: a la persona, o a qui té el rol a qui ha escrit."""
        fresh = r.query(self.base, "threads", [("lastAt", ">=", FRESH)])
        seen = self.state.get("threads")
        if seen is None:
            self.state["threads"] = {tid: t.get("lastAt") or "" for tid, t in fresh.items()}
            return
        if QUIET:
            return
        for tid, t in sorted(fresh.items(), key=lambda kv: kv[1].get("lastAt") or ""):
            last = t.get("lastAt") or ""
            if seen.get(tid, "") >= last:
                continue
            msg = (t.get("msgs") or [{}])[-1]
            body = f"{msg.get('name') or 'Missatge'}: {(msg.get('text') or '')[:140]}"
            if t.get("lastSide") == "m":
                for did, d in self.targets("missatges"):
                    if self.thread_staff(t, d):
                        self.deliver(f"th:{tid}:{last}:{did}", d, body, f"th-{tid}")
            else:
                for did, d in self.targets("missatges", member_ids={t.get("memberId")}):
                    self.deliver(f"th:{tid}:{last}:{did}", d, body, f"th-{tid}")
            seen[tid] = last
        self.state["threads"] = {k: v for k, v in seen.items() if k in fresh}

    # ---------- 1d. Recordatoris que envia l'equip («Recorda-ho») ----------
    def nudges(self):
        """Només a qui encara no havia respost quan l'equip ho va enviar (la llista ve feta de l'app)."""
        fresh = r.query(self.base, "nudges", [("createdAt", ">=", FRESH)])
        seen = self.state.setdefault("nudges", [])
        if QUIET or not fresh:
            return
        pref = {"poll": "enquestes", "rsvp": "convocatories", "trip": "sortides"}
        for nid, n in sorted(fresh.items(), key=lambda kv: kv[1].get("createdAt") or ""):
            if nid in seen:
                continue
            extra = {"sid": n.get("ref"), "actions": [{"action": "rsvp-yes", "title": "Hi seré"}, {"action": "rsvp-no", "title": "No hi podré anar"}]} if n.get("kind") == "rsvp" else None
            for did, d in self.targets(pref.get(n.get("kind"), "enquestes"), member_ids=set(n.get("memberIds") or [])):
                self.deliver(f"nudge:{nid}:{did}", d, n.get("title") or "Tens una cosa pendent de respondre a l'app.", f"nudge-{n.get('ref') or nid}", extra)
            seen.append(nid)

    # ---------- 1e. Canvis al calendari ----------
    def calendar(self):
        """Una sessió que ve i canvia de dia, d'hora o de lloc; una de nova; una que desapareix. Només a qui hi és convocat."""
        today = TODAY.isoformat()
        cur = {sid: [s.get("date") or "", s.get("time") or "", s.get("end") or "", s.get("place") or "", s.get("type") or "Assaig"]
               for sid, s in self.all.items() if (s.get("date") or "") >= today}
        prev = self.state.get("cal")
        if prev is None:
            self.state["cal"] = cur
            return
        if QUIET:
            return   # l'estat no canvia: s'avisarà al matí
        changes = []
        for sid, now in cur.items():
            was = prev.get(sid)
            s = self.all[sid]
            what = now[4]
            if was is None:
                if (datetime.date.fromisoformat(now[0]) - TODAY).days <= 90:
                    changes.append((sid, s, f"Nova sessió al calendari: {what.lower()} el {day_label(now[0])}{f' a les {now[1]}' if now[1] else ''}{f' · {now[3]}' if now[3] else ''}."))
            elif was[0] != now[0]:
                changes.append((sid, s, f"Canvi al calendari: {what.lower()} del {day_label(was[0])} passa al {day_label(now[0])}{f' a les {now[1]}' if now[1] else ''}{f' · {now[3]}' if now[3] and now[3] != was[3] else ''}."))
            elif was[1] != now[1] or was[2] != now[2]:
                changes.append((sid, s, f"Canvi d'hora: {what.lower()} del {day_label(now[0])} serà {f'a les {now[1]}' if now[1] else 'sense hora fixada'}{f'–{now[2]}' if now[1] and now[2] else ''}."))
            elif was[3] != now[3] and now[3]:
                changes.append((sid, s, f"Canvi de lloc: {what.lower()} del {day_label(now[0])} serà a {now[3]}."))
        for sid, was in prev.items():
            if sid not in cur and was[0] >= today:
                changes.append((sid, {"id": sid, "date": was[0], "sections": [], "prods": []}, f"S'ha anul·lat: {was[4].lower()} del {day_label(was[0])}."))
        self.state["cal"] = cur
        if not changes:
            return
        if len(changes) > 8:
            # Molts canvis alhora (una producció nova, una temporada importada…): un sol avís.
            for did, d in self.targets("calendari"):
                self.deliver(f"cal:many:{NOW.strftime('%Y%m%d%H%M')}:{did}", d, f"Hi ha {len(changes)} canvis al calendari. Mira'ls a l'app.", "cal-many")
            return
        for sid, s, body in changes:
            for did, d in self.targets("calendari"):
                sec, mid = d.get("section"), d.get("memberId")
                if sec and not convoked(s, sec):
                    continue
                if mid and self.excluded(mid, s.get("prods") or []):
                    continue
                self.deliver(f"cal:{sid}:{hashlib.sha1(body.encode()).hexdigest()[:8]}:{did}", d, body, f"cal-{sid}")

    # ---------- 2. Convocatòries per confirmar ----------
    def convocations(self):
        due = []
        for sid, s in self.all.items():
            if not s.get("rsvp") or s.get("date", "") < TODAY.isoformat():
                continue
            limit = s.get("rsvpBy") or s.get("date")
            days = (datetime.date.fromisoformat(limit) - TODAY).days
            stage = "3" if days == 3 else "1" if days == 1 else None
            if stage:
                due.append((sid, s, stage))
        if not due or not any(True for _ in self.targets("convocatories")):
            return
        answered = {}
        sids = [sid for sid, _, _ in due]
        for i in range(0, len(sids), 30):
            answered.update(r.query(self.base, "rsvp", [("sessionId", "in", sids[i:i + 30])]))
        for sid, s, stage in due:
            pending = {
                mid for mid, m in self.active().items()
                if convoked(s, m.get("section")) and not on_leave(m, s["date"])
                and not self.excluded(mid, s.get("prods") or []) and f"{sid}_{mid}" not in answered
            }
            when = datetime.date.fromisoformat(s["date"]).strftime("%d/%m")
            for did, d in self.targets("convocatories", member_ids=pending):
                self.deliver(f"rsvp:{sid}:{stage}:{did}", d, f"{s.get('type', 'Assaig')} del {when}: encara no has dit si hi seràs.", f"rsvp-{sid}",
                             {"sid": sid, "actions": [{"action": "rsvp-yes", "title": "Hi seré"}, {"action": "rsvp-no", "title": "No hi podré anar"}]})

    # ---------- 3. Enquestes que es tanquen demà ----------
    def polls(self):
        tomorrow = (TODAY + datetime.timedelta(days=1)).isoformat()
        closing = {pid: p for pid, p in r.query(self.base, "polls", [("closesAt", "==", tomorrow)]).items() if not p.get("closed")}
        if not closing:
            return
        votes = {}
        pids = list(closing)
        for i in range(0, len(pids), 30):
            votes.update(r.query(self.base, "pollVotes", [("pollId", "in", pids[i:i + 30])]))
        for pid, p in closing.items():
            secs = p.get("sections") or []
            for did, d in self.targets("enquestes"):
                mid = d.get("memberId")
                if not mid or f"{pid}_{mid}" in votes:
                    continue
                if secs and d.get("section") and d["section"] not in secs:
                    continue
                self.deliver(f"poll:{pid}:{did}", d, f"Demà es tanca l'enquesta «{p.get('title', '')}».", f"poll-{pid}")

    # ---------- 3b. Sortides: noves, i la vespra del termini a qui encara no ha dit res ----------
    def trips(self):
        fresh = r.query(self.base, "trips", [("createdAt", ">=", FRESH)])
        if "trips_new" not in self.state:
            self.state["trips_new"] = list(fresh.keys())
            return
        if QUIET:
            return
        for tid, t in sorted(fresh.items(), key=lambda kv: kv[1].get("createdAt") or ""):
            if tid in self.state["trips_new"]:
                continue
            self.state["trips_new"].append(tid)
            if t.get("closed"):
                continue
            secs = t.get("sections") or []
            limit = f" Respon abans del {datetime.date.fromisoformat(t['deadline']).strftime('%d/%m')}." if t.get("deadline") else ""
            for did, d in self.targets("sortides"):
                if secs and d.get("section") and d["section"] not in secs:
                    continue
                self.deliver(f"trip:{tid}:{did}", d, f"Nova sortida: {t.get('title', '')}. Digues si hi vas, encara que no hi puguis anar.{limit}", f"trip-{tid}")

    def trip_deadlines(self):
        tomorrow = (TODAY + datetime.timedelta(days=1)).isoformat()
        closing = {tid: t for tid, t in r.query(self.base, "trips", [("deadline", "==", tomorrow)]).items() if not t.get("closed")}
        if not closing:
            return
        answered = {}
        tids = list(closing)
        for i in range(0, len(tids), 30):
            answered.update(r.query(self.base, "tripSignups", [("tripId", "in", tids[i:i + 30])]))
        for tid, t in closing.items():
            secs = t.get("sections") or []
            for did, d in self.targets("sortides"):
                mid = d.get("memberId")
                if not mid or f"{tid}_{mid}" in answered:
                    continue
                if secs and d.get("section") and d["section"] not in secs:
                    continue
                self.deliver(f"tripdl:{tid}:{did}", d, f"Demà s'acaba el termini de «{t.get('title', '')}» i encara no has dit si hi vas.", f"trip-{tid}")

    # ---------- 4. Recordatori de l'assaig de demà ----------
    def rehearsals(self):
        tomorrow = (TODAY + datetime.timedelta(days=1)).isoformat()
        coming = [(sid, s) for sid, s in self.all.items() if s.get("date") == tomorrow]
        if not coming or not any(True for _ in self.targets("assajos")):
            return
        for sid, s in coming:
            who = {
                mid for mid, m in self.active().items()
                if convoked(s, m.get("section")) and not on_leave(m, s["date"]) and not self.excluded(mid, s.get("prods") or [])
            }
            info = s.get("info") or {}
            hour = f" a les {s['time']}" if s.get("time") else ""
            call_at = f" · convocatòria {info['call']}" if info.get("call") else ""
            place = f" · {s['place']}" if s.get("place") else ""
            extra = "".join(f" {label}: {info[k]}." for k, label in [("dress", "Vestuari"), ("meet", "Punt de trobada")] if info.get(k))
            for did, d in self.targets("assajos", member_ids=who):
                self.deliver(f"ses:{sid}:{did}", d, f"Demà {s.get('type', 'assaig').lower()}{hour}{call_at}{place}.{extra}", f"ses-{sid}",
                             {"sid": sid, "actions": [{"action": "absence", "title": "No hi podré anar"}]})

    # ---------- 5. Material o document nou ----------
    def materials(self):
        items = [(f"mat:{p.get('id')}:{x.get('id')}", p, x) for p in self.productions.values() for x in (p.get("materials") or [])]
        items += [(f"doc:{x.get('id')}", None, x) for x in (self.config.get("documents") or [])]
        now = NOW.isoformat(timespec="seconds")
        seen = self.state.get("materials")
        if seen is None:
            # Primer cop: el que ja hi ha no és nou per a ningú.
            self.state["materials"] = {k: now for k, _, _ in items}
            return
        for key, _, _ in items:
            seen.setdefault(key, now)
        recent = (NOW - datetime.timedelta(hours=36)).isoformat(timespec="seconds")
        # Només els que encara no s'han enviat a algun aparell (així no cal llegir la plantilla cada vegada).
        new = [(key, p, x) for key, p, x in items
               if seen[key] >= recent and any(f"{key}:{did}" not in self.sent for did, _ in self.targets("materials"))]
        if new and not QUIET:
            # Si se'n pugen uns quants de cop (els àudios de cada número, per exemple), cada aparell en rep un sol avís.
            for did, d in self.targets("materials"):
                mid = d.get("memberId")
                m = self.members().get(mid) if mid else None
                mine = []
                for key, p, x in new:
                    if f"{key}:{did}" in self.sent or (x.get("by") and d.get("email") == x["by"]):
                        continue
                    if x.get("section") and (not m or m.get("section") != x["section"]):
                        continue
                    if m and not part_matches(x.get("part"), m):
                        continue
                    if p and m and mid in (p.get("excluded") or []):
                        continue
                    mine.append((key, p, x))
                if not mine:
                    continue
                if len(mine) == 1:
                    key, p, x = mine[0]
                    body = f"Material nou de {p.get('name', '')}: {x.get('title', '')}" if p else f"Document nou: {x.get('title', '')}"
                    self.deliver(f"{key}:{did}", d, body, f"mat-{x.get('id')}")
                    continue
                prods = {(p or {}).get("name", "") for _, p, _ in mine}
                where = f" de {next(iter(prods))}" if len(prods) == 1 and next(iter(prods)) else ""
                titles = ", ".join(x.get("title", "") for _, _, x in mine[:3]) + ("…" if len(mine) > 3 else "")
                body = f"{len(mine)} materials nous{where}: {titles}"
                group = "+".join(sorted(k for k, _, _ in mine))
                if self.send_once(f"matgroup:{hashlib.sha1(group.encode()).hexdigest()[:10]}:{did}", d, body, "mat-group"):
                    for key, _, _ in mine:
                        self.sent[f"{key}:{did}"] = NOW.isoformat(timespec="seconds")
        self.state["materials"] = {k: v for k, v in seen.items() if k in {i[0] for i in items}}

    # ---------- 6. Resposta a un avís d'absència ----------
    def absences(self):
        since = self.state.setdefault("abs_since", UTC_NOW.isoformat().replace("+00:00", "Z"))
        if QUIET or not any(True for _ in self.targets("absencies")):
            return
        reviewed = r.query(self.base, "absences", [("reviewedAt", ">=", max(since, FRESH))])
        for aid, a in reviewed.items():
            status = a.get("status")
            if status not in ("accepted", "rejected"):
                continue
            days = sorted(self.all[x]["date"] for x in (a.get("sessionIds") or []) if x in self.all)
            when = ", ".join(day_label(x) for x in days[:3]) + ("…" if len(days) > 3 else "") or "la sessió"
            if status == "accepted":
                body = f"T'han acceptat l'avís per al {when}." + (" Queda com a falta justificada." if a.get("kind") == "absent" else "")
            else:
                body = f"No t'han acceptat l'avís per al {when}. Parla-ho amb el teu {self.words['leader']}."
            for did, d in self.targets("absencies", member_ids={a.get("memberId")}):
                self.deliver(f"abs:{aid}:{status}:{did}", d, body, f"abs-{aid}")

    # ---------- Classes de cant ----------
    def teachers(self):
        """Els correus que porten les classes: professorat de cant i administració."""
        return {e for e, p in self.people.items() if roles_of(p) & {"voice", "admin"}}

    def to_emails(self, emails):
        for did, d in self.targets("classes"):
            if d.get("email") in emails:
                yield did, d

    def classes(self):
        """Avisos de retard o absència a una classe i peticions de canvi d'hora."""
        if QUIET or not self.config.get("classesOn"):
            return
        since = self.state.setdefault("class_since", UTC_NOW.isoformat().replace("+00:00", "Z"))
        fresh = max(since, FRESH)
        reqs = dict(r.query(self.base, "classReq", [("createdAt", ">=", fresh)]))
        reqs.update(r.query(self.base, "classReq", [("reviewedAt", ">=", fresh)]))
        off = r.query(self.base, "classes", [("cancelledAt", ">=", fresh)])
        if not reqs and not off:
            return
        days = r.list(f"{self.base}/classes")
        members = self.members()
        teachers = self.teachers()
        name = lambda mid: (members.get(mid or "") or {}).get("name") or "Algú"

        def when(req):
            day = days.get(req.get("classId") or "")
            if not day:
                return "la classe"
            slot = next((x for x in day.get("slots") or [] if x.get("id") == req.get("slotId")), None)
            return f"la classe de {day_label(day['date'])}" + (f" ({slot['time']})" if slot and slot.get("time") else "")

        def other_time(req):
            day = days.get(req.get("classId") or "")
            slot = next((x for x in (day or {}).get("slots") or [] if x.get("id") == req.get("withSlotId")), None)
            return (slot or {}).get("time") or ""

        # Dies anul·lats: s'avisa qui hi tenia hora.
        for cid, day in sorted(off.items()):
            if not day.get("cancelled"):
                continue
            who = {x.get("memberId") for x in day.get("slots") or [] if x.get("memberId")}
            body = f"S'ha anul·lat {when({'classId': cid})}."
            for did, d in self.targets("classes", member_ids=who):
                self.deliver(f"cls:off:{cid}:{day.get('cancelledAt')}:{did}", d, body, f"cls-{cid}")

        for rid, req in sorted(reqs.items()):
            kind, status = req.get("kind"), req.get("status")
            who, mate = name(req.get("memberId")), name(req.get("withMemberId"))
            if status == "pending":
                if kind == "take":
                    body = f"{who} demana l'hora lliure de {when(req)}."
                elif kind == "late":
                    body = f"{who} arribarà {req.get('mins') or ''}{'′ ' if req.get('mins') else ''}tard a {when(req)}."
                elif kind == "absent":
                    body = f"{who} no podrà venir a {when(req)}."
                elif req.get("withMemberId"):
                    body = f"{who} demana canviar l'hora de {when(req)} amb {mate} ({other_time(req)})."
                else:
                    body = f"{who} busca algú per canviar l'hora de {when(req)}."
                for did, d in self.to_emails(teachers):
                    self.deliver(f"cls:{rid}:{status}:{did}", d, body, f"cls-{rid}")
                if kind == "swap" and req.get("withMemberId"):
                    msg = f"{who} et demana canviar l'hora de {when(req)}: tens les {other_time(req)}. Respon-hi des de l'app."
                    for did, d in self.targets("classes", member_ids={req.get("withMemberId")}):
                        self.deliver(f"cls:{rid}:ask:{did}", d, msg, f"cls-{rid}")
                elif kind == "swap":
                    # Canvi obert: ho saben tots els qui tenen classe aquell dia, tret de qui el demana.
                    day = days.get(req.get("classId") or "") or {}
                    others = {x.get("memberId") for x in day.get("slots") or [] if x.get("memberId")} - {req.get("memberId")}
                    msg = f"{who} busca algú per canviar l'hora de {when(req)}. Si et va bé, queda-te'l des de l'app."
                    for did, d in self.targets("classes", member_ids=others):
                        self.deliver(f"cls:{rid}:ask:{did}", d, msg, f"cls-{rid}")
                continue
            if status == "cancelled":
                body = f"{who} ha retirat l'avís de {when(req)}."
                for did, d in self.to_emails(teachers):
                    self.deliver(f"cls:{rid}:{status}:{did}", d, body, f"cls-{rid}")
                continue
            done = status == "accepted"
            if kind == "swap":
                body = f"{mate} {'accepta' if done else 'no pot fer'} el canvi d'hora de {when(req)}."
                teach_body = f"{who} i {mate} {'es canvien' if done else 'no es canvien'} l'hora de {when(req)}."
            elif kind == "take":
                body = f"{'Ja tens' if done else 'No et podem donar'} l'hora lliure de {when(req)}."
                teach_body = None
            else:
                body = f"El professorat {'ha vist' if done else 'no pot acceptar'} el teu avís de {when(req)}."
                teach_body = None
            for did, d in self.targets("classes", member_ids={req.get("memberId")}):
                self.deliver(f"cls:{rid}:{status}:{did}", d, body, f"cls-{rid}")
            if teach_body:
                for did, d in self.to_emails(teachers):
                    self.deliver(f"cls:{rid}:{status}:t:{did}", d, teach_body, f"cls-{rid}")

    # ---------- Caps de corda o de secció ----------
    def leader_sections(self, d):
        """Seccions de les quals aquest aparell vol els avisos de cap."""
        person = self.people.get(d.get("email") or "")
        if not person or not roles_of(person) & EDIT_ROLES:
            return set()
        if isinstance(d.get("cordes"), list):
            return set(d["cordes"])
        if "leader" in roles_of(person) and person.get("section"):
            return {person["section"]}
        m = self.members().get(person.get("memberId") or "")
        return {m["section"]} if m and m.get("leader") and m.get("section") else set()

    def eff_mark(self, s, m, mid, attendance, ctx=None):
        return norma.eff_mark(self.productions, s, m, mid, attendance, ctx)

    # ---------- 7. Llista a mitges en acabar l'assaig ----------
    def rolls(self):
        yesterday = (TODAY - datetime.timedelta(days=1)).isoformat()
        due = []
        for sid, s in self.all.items():
            if not s.get("time") or s["date"] not in (TODAY.isoformat(), yesterday):
                continue
            hh, mm = (s["end"].split(":") if s.get("end") else (str(min(23, int(s["time"][:2]) + 2)), s["time"][3:5]))
            end = datetime.datetime.fromisoformat(f"{s['date']}T{int(hh):02d}:{mm}").replace(tzinfo=TZ)
            after = (NOW - end).total_seconds() / 60
            # Mitja hora després d'acabar (que hi hagi temps d'acabar de marcar), i si no, l'endemà al matí.
            tonight = s["date"] == TODAY.isoformat() and after >= 25 and (NOW.hour, NOW.minute) <= (23, 45)
            morning = s["date"] == yesterday and 9 <= NOW.hour < 13
            if tonight or morning:
                due.append((sid, s))
        if not due or not any(True for _ in self.targets("llistes")):
            return
        keys = [f"{sid}_{sec}" for sid, s in due for sec in self.sec_names if convoked(s, sec)]
        docs = r.batch_get([f"{self.base}/attendance/{k}" for k in keys] + [f"{self.base}/subs/{k}" for k in keys])
        attendance = {k: docs.get(f"{self.base}/attendance/{k}") for k in keys}
        subs = {k: docs.get(f"{self.base}/subs/{k}") or {} for k in keys}
        for sid, s in due:
            for sec, sec_name in self.sec_names.items():
                if not convoked(s, sec):
                    continue
                roster = [(mid, m) for mid, m in self.active().items() if m.get("section") == sec]
                done = sum(1 for mid, m in roster if self.eff_mark(s, m, mid, attendance))
                if not roster or done >= len(roster):
                    continue
                sub = subs[f"{sid}_{sec}"]
                body = (f"La llista de {sec_name.lower()} del {day_label(s['date'])} ha quedat a mitges: {done} de {len(roster)}."
                        if done else f"Encara no s'ha passat la llista de {sec_name.lower()} del {day_label(s['date'])}.")
                for did, d in self.targets("llistes"):
                    is_sub = sub.get("memberId") and d.get("memberId") == sub["memberId"]
                    if not is_sub and sec not in self.leader_sections(d):
                        continue
                    self.deliver(f"roll:{sid}:{sec}:{did}", d, body, f"roll-{sid}-{sec}")

    # ---------- 8. Qui baixa de la norma ----------
    def risk(self):
        risk_state = self.state.setdefault("risk", {})
        if QUIET or not RISK_TIME or not any(True for _ in self.targets("risc")):
            return
        if not any(self.leader_sections(d) for _, d in self.targets("risc")):
            return
        minimum = norma.minimum(self.config)
        attendance = self.attendance()
        today = TODAY.isoformat()

        def rule_status(pid, mid, m):
            return norma.rule_status(self.productions, self.all, attendance, pid, mid, m, today, minimum, self.rule_skip)

        live = [pid for pid in self.productions if any(pid in (s.get("prods") or []) and s["date"] >= today for s in self.all.values())]
        for pid in live:
            prod = self.productions[pid]
            previous = risk_state.get(pid)
            now_status = {}
            for mid, m in self.active().items():
                rs = rule_status(pid, mid, m)
                if not rs:
                    continue
                now_status[mid] = rs["status"]
                before = (previous or {}).get(mid, "ok")
                if previous is None or rs["status"] == "ok" or rs["status"] == before or before == "out":
                    continue
                pct = round(rs["cur"] * 100)
                name = m.get("name", "")
                sec_name = self.sec_names.get(m.get("section"), m.get("section") or "")
                if rs["status"] == "risk":
                    n = max(0, math.ceil(minimum * (rs["att"] + rs["ab"] + rs["remaining"]) - rs["att"] - 1e-9))
                    which = f"tots els {n}" if n == rs["remaining"] else f"{n} dels {rs['remaining']}"
                    body = f"{name} ({sec_name}) ha baixat del {round(minimum * 100)}% a {prod.get('name', '')}: {pct}%. Ha de venir a {which} assajos que queden."
                else:
                    body = f"{name} ({sec_name}) ja no arriba al {round(minimum * 100)}% a {prod.get('name', '')}: com a màxim, {round(rs['best'] * 100)}%."
                for did, d in self.targets("risc"):
                    if m.get("section") not in self.leader_sections(d):
                        continue
                    self.deliver(f"risk:{pid}:{mid}:{rs['status']}:{did}", d, body, f"risk-{pid}-{mid}")
            risk_state[pid] = now_status

    def run(self):
        self.announcements()
        self.messages()
        self.threads()
        self.nudges()
        self.calendar()
        self.new_polls()
        self.trips()
        if not self.first_run and EVENING and not QUIET:
            self.convocations()
            self.polls()
            self.trip_deadlines()
            self.rehearsals()
        self.materials()
        self.absences()
        self.classes()
        if not self.first_run:
            self.rolls()
        self.risk()
        self.save()

    def save(self):
        cut = (NOW - datetime.timedelta(days=35)).isoformat(timespec="seconds")
        self.state["sent"] = {k: v for k, v in self.sent.items() if v >= cut}
        self.state["announcements"] = self.state["announcements"][-400:]
        for k in ("messages", "polls_new", "trips_new", "nudges"):
            if k in self.state:
                self.state[k] = self.state[k][-400:]
        self.state["dead"] = sorted(self.dead)
        self.state["fails"] = {k: v for k, v in self.fails.items() if k not in self.dead}
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=1, sort_keys=True)


total = subscribed = 0
for gid in groups:
    before = r.reads
    try:
        config = r.get(f"cors/{gid}/config/main") or {}
        if config.get("deleted"):
            continue
        devices = r.list(f"cors/{gid}/push")
        if not devices:
            continue
        # Qui ja no té accés a l'agrupació tampoc no ha de rebre avisos.
        emails = sorted({d["email"] for d in devices.values() if d.get("email")})
        found = r.batch_get([f"cors/{gid}/staff/{e}" for e in emails]) if emails else {}
        people = {e: found.get(f"cors/{gid}/staff/{e}") for e in emails if found.get(f"cors/{gid}/staff/{e}")}
        devices = {k: v for k, v in devices.items() if not v.get("email") or v["email"] in people}
        if not devices:
            continue
        g = Group(gid, config, devices, people)
        g.run()
    except dades.Forbidden:
        print(f"{gid}: sense permís de lectura")
        continue
    total += g.count
    subscribed += len(devices)
    print(f"{g.name}: {g.count} avisos · {len(devices)} aparells · {r.reads - before} lectures{' · primera execució' if g.first_run else ''}")
print(f"{total} avisos enviats · {subscribed} aparells · {len(groups)} agrupacions · {r.reads} lectures")
