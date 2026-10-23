"""Avisos al mòbil (.github/scripts/avisos.py) amb dades inventades: cap connexió ni cap enviament real.

Comprova les passades curtes entre passades senceres: un missatge que arriba mentre la feina és oberta s'envia
en pocs segons, un sol cop, només a qui toca i no a qui l'ha escrit.

    python3 tests/logica/test_avisos.py
"""
import datetime, json, os, runpy, sys, tempfile, threading, types
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(REPO, ".github", "scripts")
sys.path.insert(0, SCRIPTS)
import dades
G = dades.FOUNDER
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
DB = {
    f"cors/{G}/config/main": {"name": "Cor de proves", "kind": "cor"},
    f"cors/{G}/push/dev1": {"endpoint": "https://push.example/e1", "p256dh": "x", "auth": "y", "email": "a@x.cat", "memberId": "m1", "section": "S"},
    f"cors/{G}/push/dev2": {"endpoint": "https://push.example/e2", "p256dh": "x", "auth": "y", "email": "b@x.cat", "memberId": "m2", "section": "T"},
    f"cors/{G}/staff/a@x.cat": {"email": "a@x.cat", "roles": ["singer"], "memberId": "m1", "section": "S"},
    f"cors/{G}/staff/b@x.cat": {"email": "b@x.cat", "roles": ["singer"], "memberId": "m2", "section": "T"},
    f"cors/{G}/members/m1": {"id": "m1", "name": "Puig, Anna", "section": "S"},
    f"cors/{G}/members/m2": {"id": "m2", "name": "Bosch, Marc", "section": "T"},
    # La cap de corda de les sopranos: rep les absències noves de la seva corda (i no les de les altres).
    f"cors/{G}/push/dev3": {"endpoint": "https://push.example/e3", "p256dh": "x", "auth": "y", "email": "c@x.cat", "memberId": "m3", "section": "S"},
    f"cors/{G}/staff/c@x.cat": {"email": "c@x.cat", "roles": ["leader", "singer"], "memberId": "m3", "section": "S"},
    f"cors/{G}/members/m3": {"id": "m3", "name": "Vila, Clara", "section": "S", "leader": True},
    f"cors/{G}/messages/old": {"id": "old", "to": ["*"], "body": "Vell", "byName": "Equip", "by": "z@x.cat", "createdAt": now()},
}
class Reader:
    reads = 0
    full = True
    def get(self, path):
        self.reads += 1
        return DB.get(path)
    def list(self, path):
        pre = path + "/"
        out = {k[len(pre):]: v for k, v in DB.items() if k.startswith(pre) and "/" not in k[len(pre):]}
        self.reads += max(1, len(out))
        return out
    def query(self, parent, collection, where):
        out = self.list(f"{parent}/{collection}")
        self.reads -= max(1, len(out))
        for f, op, v in where:
            assert op == ">="
            out = {k: d for k, d in out.items() if (d.get(f) or "") >= v}
        self.reads += max(1, len(out))
        return out
    def batch_get(self, paths):
        self.reads += len(paths)
        return {p: DB.get(p) for p in paths}
dades.connect = lambda *_: (Reader(), {G: {"status": "active"}})
SENT = []
pw = types.ModuleType("pywebpush")
class WebPushException(Exception):
    response = None
pw.WebPushException = WebPushException
pw.webpush = lambda subscription_info, data, **k: SENT.append((subscription_info["endpoint"], json.loads(data)["body"]))
sys.modules["pywebpush"] = pw
root = tempfile.mkdtemp()
json.dump({"announcements": [], "sent": {}, "messages": ["old"], "threads": {}, "nudges": [], "polls_new": [], "trips_new": []},
          open(os.path.join(root, "avisos-estat.json"), "w"))
os.environ.update({"PUSH_PRIVATE_KEY": "k", "AVISOS_LOOP_MIN": "0.17", "AVISOS_EVERY": "2"})
# Mentre la feina és oberta, algú escriu un missatge als tenors (al cap de 4 s) i un a tothom (al cap de 7 s).
def later():
    import time
    time.sleep(3); DB[f"cors/{G}/messages/n1"] = {"id": "n1", "to": ["T"], "body": "Tenors: assaig parcial", "byName": "Lluc", "by": "z@x.cat", "createdAt": now()}
    time.sleep(2.5); DB[f"cors/{G}/messages/n2"] = {"id": "n2", "to": ["*"], "body": "Demà no hi ha assaig", "byName": "Equip", "by": "a@x.cat", "createdAt": now()}
    time.sleep(1); DB[f"cors/{G}/absences/ab1"] = {"id": "ab1", "memberId": "m1", "memberName": "Puig, Anna", "section": "S", "kind": "absent", "status": "pending", "sessionIds": [], "createdAt": now()}
    DB[f"cors/{G}/absences/ab2"] = {"id": "ab2", "memberId": "m2", "memberName": "Bosch, Marc", "section": "T", "kind": "late", "status": "pending", "sessionIds": [], "createdAt": now()}
threading.Thread(target=later, daemon=True).start()
sys.argv = ["avisos.py", root]
runpy.run_path(os.path.join(SCRIPTS, "avisos.py"), run_name="__main__")
print("ENVIATS:", SENT)
st = json.load(open(os.path.join(root, "avisos-estat.json")))
print("ESTAT missatges:", st["messages"])
ok = sorted(SENT) == sorted([("https://push.example/e2", "Lluc: Tenors: assaig parcial"), ("https://push.example/e2", "Equip: Demà no hi ha assaig"),
                             ("https://push.example/e3", "Equip: Demà no hi ha assaig"),
                             ("https://push.example/e3", "Anna Puig no podrà venir a una sessió. Respon-ho a Assistència › Absències.")])
# De nit no s'envia res (i les passades curtes s'acaben): aleshores la prova només comprova que no s'ha enviat res.
import zoneinfo
night = not (8 <= datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Madrid")).hour < 22)
ok = (not SENT) if night else ok
print(("CORRECTE" if ok else "INCORRECTE") + (" (de nit: res a enviar)" if night else ""))
sys.exit(0 if ok else 1)
