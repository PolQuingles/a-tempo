"""Avisos de les classes de cant (.github/scripts/avisos.py) amb dades inventades: cap connexió ni cap enviament real.

Cada avís arriba només a qui toca: al professor d'aquella classe (o a l'administració si encara no té compte), i els canvis
d'un dia, a qui hi té hora. També comprova que el calendari del mòbil tingui en compte els canvis d'hora.

    python3 tests/logica/test_avisos_classes.py
"""
import datetime, json, os, runpy, sys, tempfile, types, zoneinfo
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(REPO, ".github", "scripts")
sys.path.insert(0, SCRIPTS)
import dades

# El calendari: un canvi d'hora acceptat el mateix dia, entre dos dies, i un de pendent que no compta.
day = {"id": "d1", "slots": [{"id": "a", "memberId": "m1"}, {"id": "b", "memberId": "m2"}]}
swap = {"kind": "swap", "status": "accepted", "classId": "d1", "slotId": "a", "withSlotId": "b", "memberId": "m1", "withMemberId": "m2"}
assert [x["memberId"] for x in dades.class_slots(day, {"r": swap})] == ["m2", "m1"], "canvi el mateix dia"
assert [x["memberId"] for x in dades.class_slots(day, {"r": {**swap, "status": "pending"}})] == ["m1", "m2"], "un canvi pendent no compta"
assert [x["memberId"] for x in dades.class_slots(day, {"r": {**swap, "withClassId": "d2"}})] == ["m2", "m2"], "canvi entre dos dies"
assert day["slots"][0]["memberId"] == "m1", "no toca el dia original"

G = dades.FOUNDER
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
tomorrow = (datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Madrid")).date() + datetime.timedelta(days=1)).isoformat()
def device(n, email, mid=""):
    return {"endpoint": f"https://push.example/{n}", "p256dh": "x", "auth": "y", "email": email, "memberId": mid, "section": "S", "prefs": {"classes": True}}
DB = {
    f"cors/{G}/config/main": {"name": "Cor de proves", "kind": "cor", "classesOn": True},
    f"cors/{G}/staff/prof@x.cat": {"email": "prof@x.cat", "roles": ["voice"], "name": "Prat, Berta"},
    f"cors/{G}/staff/altre@x.cat": {"email": "altre@x.cat", "roles": ["voice"]},
    f"cors/{G}/staff/admin@x.cat": {"email": "admin@x.cat", "roles": ["admin"]},
    f"cors/{G}/staff/a@x.cat": {"email": "a@x.cat", "roles": ["singer"], "memberId": "m1"},
    f"cors/{G}/staff/b@x.cat": {"email": "b@x.cat", "roles": ["singer"], "memberId": "m2"},
    f"cors/{G}/members/m1": {"id": "m1", "name": "Puig, Anna", "section": "S"},
    f"cors/{G}/members/m2": {"id": "m2", "name": "Bosch, Marc", "section": "T"},
    f"cors/{G}/push/d1": device("prof", "prof@x.cat"), f"cors/{G}/push/d2": device("altre", "altre@x.cat"), f"cors/{G}/push/d3": device("admin", "admin@x.cat"),
    f"cors/{G}/push/d4": device("anna", "a@x.cat", "m1"), f"cors/{G}/push/d5": device("marc", "b@x.cat", "m2"),
    f"cors/{G}/classes/c1": {"id": "c1", "date": tomorrow, "teacher": "prof@x.cat", "slots": [{"id": "s1", "time": "17:00", "memberId": "m1"}]},
    f"cors/{G}/classes/c2": {"id": "c2", "date": tomorrow, "teacher": "pf1", "slots": [{"id": "s2", "time": "18:00", "memberId": "m2"}]},
    f"cors/{G}/classReq/r1": {"id": "r1", "classId": "c1", "slotId": "s1", "memberId": "m1", "kind": "absent", "status": "pending", "createdAt": now()},
    f"cors/{G}/classReq/r2": {"id": "r2", "classId": "c2", "slotId": "s2", "memberId": "m2", "kind": "absent", "status": "pending", "createdAt": now()},
    # Una hora que canvia per a l'Anna, i dues classes d'un horari nou per al Marc.
    f"cors/{G}/classes/c3": {"id": "c3", "date": tomorrow, "teacher": "prof@x.cat", "slots": [], "changedAt": now(), "changes": [{"m": "m1", "b": "Hora nova"}]},
    f"cors/{G}/classes/c4": {"id": "c4", "date": tomorrow, "teacher": "pf1", "slots": [], "changedAt": now(), "changes": [{"m": "m2", "b": "Canvi 1"}]},
    f"cors/{G}/classes/c5": {"id": "c5", "date": tomorrow, "teacher": "pf1", "deleted": True, "changedAt": now(), "changes": [{"m": "m2", "b": "Canvi 2"}]},
    # El quadern: la Berta deixa a l'Anna la nota d'una classe amb gravació i li respon; el Marc s'hi grava (ho veu l'altre
    # professor, que encara no ho ha vist); l'Anna hi havia escrit abans i la Berta ja ho ha vist (no s'avisa).
    f"cors/{G}/classNotes/c1_s1": {"id": "c1_s1", "classId": "c1", "slotId": "s1", "memberId": "m1", "teacher": "prof@x.cat", "date": "2026-11-10", "text": "Bé", "file": {"id": "f1"}, "at": now()},
    f"cors/{G}/classNotes/c1_buida": {"id": "c1_buida", "memberId": "m1", "teacher": "prof@x.cat", "date": "2026-11-10", "text": "", "at": now()},
    f"cors/{G}/students/m1": {"memberId": "m1", "teachers": ["prof@x.cat"], "tfresh": {"at": now(), "kind": "reply", "by": "prof@x.cat"},
                              "fresh": {"at": now(), "kind": "note"}, "seen": {"prof_x_cat": "2999-01-01T00:00:00Z"}},
    f"cors/{G}/students/m2": {"memberId": "m2", "teachers": ["altre@x.cat"], "fresh": {"at": now(), "kind": "rec"}},
}
class Reader:
    full = True
    reads = 0
    def commit(self, ops):
        pass
    def get(self, path):
        return DB.get(path)
    def list(self, path):
        pre = path + "/"
        return {k[len(pre):]: v for k, v in DB.items() if k.startswith(pre) and "/" not in k[len(pre):]}
    def query(self, parent, collection, where):
        out = self.list(f"{parent}/{collection}")
        ops = {">=": lambda a, b: (a or "") >= b, ">": lambda a, b: (a or "") > b, "==": lambda a, b: a == b, "in": lambda a, b: a in b}
        for f, op, v in where:
            out = {k: d for k, d in out.items() if ops[op](d.get(f), v)}
        return out
    def batch_get(self, paths):
        return {p: DB.get(p) for p in paths}
dades.connect = lambda *_: (Reader(), {G: {"status": "active"}})
SENT = []
pw = types.ModuleType("pywebpush")
class WebPushException(Exception):
    response = None
pw.WebPushException = WebPushException
pw.webpush = lambda subscription_info, data, **k: SENT.append((subscription_info["endpoint"].rsplit("/", 1)[1], json.loads(data)["body"]))
sys.modules["pywebpush"] = pw
root = tempfile.mkdtemp()
json.dump({"announcements": [], "sent": {}, "messages": [], "threads": {}, "nudges": [], "polls_new": [], "trips_new": [], "class_since": "2026-01-01T00:00:00Z"}, open(os.path.join(root, "avisos-estat.json"), "w"))
os.environ.update({"PUSH_PRIVATE_KEY": "k"})
sys.argv = ["avisos.py", root]
runpy.run_path(os.path.join(SCRIPTS, "avisos.py"), run_name="__main__")
print("ENVIATS:", SENT)
who = lambda n: [b for d, b in SENT if d == n]
night = not (8 <= datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Madrid")).hour < 22)
ok = not SENT if night else (
    len(who("prof")) == 1 and "Anna Puig" in who("prof")[0]
    and who("altre") == ["Marc Bosch ha afegit una gravació al seu quadern."]
    and len(who("admin")) == 1 and "Marc Bosch" in who("admin")[0]
    and who("anna") == ["Hora nova", "Berta Prat t'ha deixat una nota i una gravació de la classe de dt 10/11. La tens al teu quadern.",
                        "Berta Prat t'ha respost al quadern."]
    and who("marc") == ["Han canviat 2 de les teves classes. Mira-ho a l'app."])
print(("CORRECTE" if ok else "INCORRECTE") + (" (de nit: res a enviar)" if night else ""))
sys.exit(0 if ok else 1)
