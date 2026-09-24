"""Proves de les regles de Firestore a l'emulador (dades fictícies)."""
import base64, json, sys, time, urllib.request, urllib.error

HOST = "http://127.0.0.1:8085"
PROJECT = "demo-cor"
ROOT = f"projects/{PROJECT}/databases/(default)/documents"
BASE = f"{HOST}/v1/{ROOT}"
RULES = sys.argv[1] if len(sys.argv) > 1 else None

F = "nSN9kYDkzPik239jnsMsCSYW"          # agrupació fundadora (dades antigues)
G2 = "G2orquestraAAAAAAAAAAAAA"          # agrupació nova creada a les proves
SERVICE_UID = "sZy09w2YOfdv2jky8zy5m7Vzfna2"
FAILS = []
PASSES = 0


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")


def token(uid, email=None, verified=True, provider="google.com"):
    now = int(time.time())
    p = {"sub": uid, "user_id": uid, "iat": now, "exp": now + 3600, "auth_time": now,
         "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}",
         "firebase": {"sign_in_provider": provider, "identities": {}}}
    if email:
        p["email"] = email
        p["email_verified"] = verified
    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(p)}."


def req(method, url, body=None, tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def enc(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [enc(x) for x in v]} if v else {}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: enc(x) for k, x in v.items()}}}
    raise TypeError(v)


def upd(path, data, mask=None):
    w = {"update": {"name": f"{ROOT}/{path}", "fields": enc(data)["mapValue"]["fields"]}}
    if mask:
        w["updateMask"] = {"fieldPaths": mask}
    return w


def dele(path):
    return {"delete": f"{ROOT}/{path}"}


def commit(writes, tok):
    return req("POST", f"{BASE}:commit", {"writes": writes}, tok)[0]


def get(path, tok):
    return req("GET", f"{BASE}/{path}", tok=tok)[0]


def lst(path, tok):
    return req("GET", f"{BASE}/{path}?pageSize=50", tok=tok)[0]


OWNER = "owner"


def seed(path, data):
    code = commit([upd(path, data)], OWNER)
    assert code == 200, (path, code)


def expect(name, code, allow):
    global PASSES
    ok = code == 200 if allow is True else code == 404 if allow == "404" else code == 403
    if ok:
        PASSES += 1
    else:
        FAILS.append(f"{name}: esperava {allow}, ha tornat {code}")
        print("  ✗", FAILS[-1])


def reset():
    req("DELETE", f"{HOST}/emulator/v1/projects/{PROJECT}/databases/(default)/documents")
    if RULES:
        code, body = req("PUT", f"{HOST}/emulator/v1/projects/{PROJECT}:securityRules",
                         {"rules": {"files": [{"name": "firestore.rules", "content": open(RULES).read()}]}})
        assert code == 200, body


reset()
T = {
    "pol": token("uid-pol", "pol@exemple.cat"),
    "leader": token("uid-leader", "leader@exemple.cat"),
    "singer": token("uid-singer", "singer@exemple.cat"),
    "palau": token("uid-palau", "palau@exemple.cat"),
    "ger": token("uid-ger", "ger@exemple.cat"),
    "sec": token("uid-sec", "sec@exemple.cat"),
    "pau": token("uid-pau", "pau@exemple.cat"),
    "trampa": token("uid-trampa", "trampa@exemple.cat"),
    "dir": token("uid-dir", "dir@exemple.cat"),
    "adm2": token("uid-adm2", "adm2@exemple.cat"),
    "prof": token("uid-prof", "prof@exemple.cat"),
    "orq": token("uid-orq", "orq@exemple.cat"),
    "new": token("uid-new", "nou@exemple.cat"),
    "unverified": token("uid-unv", "unv@exemple.cat", verified=False),
    "anon": token("uid-anon", None, provider="anonymous"),
    "anonEdit": token("uid-anon-edit", None, provider="anonymous"),
    "anonBackup": token("uid-anon-backup", None, provider="anonymous"),
    "service": token(SERVICE_UID, None, provider="anonymous"),
}

# ---------- Dades inicials: l'agrupació fundadora tal com és avui ----------
now = "2026-09-17T00:00:00Z"
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80})
seed(f"cors/{F}/members/m1", {"id": "m1", "name": "Cantaire U", "section": "S"})
seed(f"cors/{F}/members/m2", {"id": "m2", "name": "Cantaire Dos", "section": "T"})
seed(f"cors/{F}/members/m3", {"id": "m3", "name": "Pau Baix", "section": "B"})
seed(f"cors/{F}/members/m4", {"id": "m4", "name": "Pol Tenor", "section": "T"})
seed(f"cors/{F}/productions/p1", {"id": "p1", "name": "Producció", "sessions": [{"id": "s1", "date": "2026-09-20"}]})
seed(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {}})
seed(f"cors/{F}/staff/pol@exemple.cat", {"email": "pol@exemple.cat", "role": "admin", "roles": ["admin", "leader", "singer"], "section": "T", "memberId": "m4"})
seed(f"cors/{F}/staff/pau@exemple.cat", {"email": "pau@exemple.cat", "role": "leader", "roles": ["leader", "singer"], "section": "B", "memberId": "m3"})
seed(f"cors/{F}/staff/trampa@exemple.cat", {"email": "trampa@exemple.cat", "role": "admin", "roles": ["singer"]})
seed(f"cors/{F}/staff/dir@exemple.cat", {"email": "dir@exemple.cat", "role": "director"})
seed(f"cors/{F}/staff/leader@exemple.cat", {"email": "leader@exemple.cat", "role": "leader", "section": "T"})
seed(f"cors/{F}/staff/singer@exemple.cat", {"email": "singer@exemple.cat", "role": "singer", "memberId": "m1"})
seed(f"cors/{F}/staff/palau@exemple.cat", {"email": "palau@exemple.cat", "role": "palau"})
seed(f"cors/{F}/staff/ger@exemple.cat", {"email": "ger@exemple.cat", "role": "gerencia", "roles": ["gerencia"]})
seed(f"cors/{F}/staff/sec@exemple.cat", {"email": "sec@exemple.cat", "role": "secretaria", "roles": ["secretaria"]})
seed(f"staffIndex/pol@exemple.cat", {"choirId": F})
seed(f"staffIndex/singer@exemple.cat", {"choirId": F})
seed(f"staffIndex/singer@exemple.cat/agrupacions/{F}", {"at": now, "name": "Cor Jove"})
seed("claus/EDITKEY_aaaaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "edit", "at": now})
seed(f"cors/{F}/access/uid-anon-edit", {"role": "edit", "key": "EDITKEY_aaaaaaaaaaaaaaaaaaaa", "at": now})
seed("claus/BACKUPKEY_aaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "backup", "at": now})
seed(f"cors/{F}/access/uid-anon-backup", {"role": "backup", "key": "BACKUPKEY_aaaaaaaaaaaaaaaaaa", "at": now})
seed(f"cors/{F}/staff/prof@exemple.cat", {"email": "prof@exemple.cat", "roles": ["voice"], "role": "voice"})
seed("plataforma/pro", {"emails": ["orq@exemple.cat", "nou@exemple.cat"], "at": now})
seed(f"cors/{F}/push/dev1", {"uid": "uid-singer", "email": "singer@exemple.cat", "endpoint": "https://x"})


def creation(gid, email, *, role="admin", roles=None, staff_email=None, created_by=None, dir_doc=True, index=True, name="Orquestra"):
    staff_email = staff_email or email
    w = []
    if dir_doc:
        w.append(upd(f"agrupacions/{gid}", {"name": name, "kind": "orquestra", "status": "active", "createdAt": now, "createdBy": created_by or email}))
    w.append(upd(f"cors/{gid}/config/main", {"name": name, "kind": "orquestra", "sections": [{"id": "V1", "name": "Violins I"}]}))
    w.append(upd(f"cors/{gid}/staff/{staff_email}", {"email": staff_email, "name": "Nom", "role": role, "addedAt": now, **({"roles": roles} if roles is not None else {})}))
    if index:
        w.append(upd(f"staffIndex/{staff_email}/agrupacions/{gid}", {"at": now, "name": name}))
    return w


print("A. Crear agrupacions")
expect("A0 qui no és Pro crea una agrupació", commit(creation("G0xxxxxxxxxxxxxxxxxxxxxx", "leader@exemple.cat"), T["leader"]), False)
expect("A0b qui no és Pro, amb correu no verificat", commit(creation("G0bxxxxxxxxxxxxxxxxxxxxx", "unv@exemple.cat"), T["unverified"]), False)
expect("A1 crear G2", commit(creation(G2, "orq@exemple.cat"), T["orq"]), True)
expect("A2 un altre torna a crear G2", commit(creation(G2, "nou@exemple.cat"), T["new"]), False)
expect("A2b l'admin reescriu les mateixes dades de G2", commit(creation(G2, "orq@exemple.cat"), T["orq"]), True)
expect("A3 sense fitxa al directori", commit(creation("G3xxxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", dir_doc=False), T["new"]), False)
expect("A4 creador no admin", commit(creation("G4xxxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", role="singer"), T["new"]), False)
expect("A5 afegir-hi un altre correu", commit(creation("G5xxxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", staff_email="pol@exemple.cat"), T["new"]), False)
expect("A6 createdBy d'un altre", commit(creation("G6xxxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", created_by="pol@exemple.cat"), T["new"]), False)
expect("A7 correu no verificat", commit(creation("G7xxxxxxxxxxxxxxxxxxxxxx", "unv@exemple.cat"), T["unverified"]), False)
expect("A8 anònim", commit([upd("agrupacions/G8xxxxxxxxxxxxxxxxxxxxxx", {"name": "X", "kind": "cor", "status": "active", "createdAt": now, "createdBy": ""}),
                            upd("cors/G8xxxxxxxxxxxxxxxxxxxxxx/config/main", {"name": "X"})], T["anon"]), False)
expect("A9 apropiar-se de la fundadora", commit(creation(F, "nou@exemple.cat"), T["new"]), False)
expect("A10 id massa curt", commit(creation("curt123", "nou@exemple.cat"), T["new"]), False)
expect("A11 només config sense res més", commit([upd("cors/G11xxxxxxxxxxxxxxxxxxxxx/config/main", {"name": "X"})], T["new"]), False)
expect("A1b crear amb llista de rols", commit(creation("G13xxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", roles=["admin"]), T["new"]), True)
expect("A4b llista de rols sense admin (encara que role digui admin)", commit(creation("G14xxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", roles=["singer"]), T["new"]), False)
expect("A12 estat suspès en crear", commit([upd(f"agrupacions/G12xxxxxxxxxxxxxxxxxxxxx", {"name": "X", "kind": "cor", "status": "suspended", "createdAt": now, "createdBy": "nou@exemple.cat"})] + creation("G12xxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat", dir_doc=False), T["new"]), False)

print("B. Aïllament entre agrupacions")
expect("B1 orq llegeix membres de F", lst(f"cors/{F}/members", T["orq"]), False)
expect("B1b orq llegeix config de F", get(f"cors/{F}/config/main", T["orq"]), False)
expect("B1c orq llegeix persones de F", lst(f"cors/{F}/staff", T["orq"]), False)
expect("B2 orq escriu persones a F", commit([upd(f"cors/{F}/staff/orq@exemple.cat", {"email": "orq@exemple.cat", "role": "admin"})], T["orq"]), False)
expect("B3 orq apunta pol a F", commit([upd(f"staffIndex/pol@exemple.cat/agrupacions/{F}", {"at": now})], T["orq"]), False)
expect("B3b orq afegeix pol a G2", commit([upd(f"cors/{G2}/staff/pol@exemple.cat", {"email": "pol@exemple.cat", "role": "singer"}),
                                          upd(f"staffIndex/pol@exemple.cat/agrupacions/{G2}", {"at": now, "name": "Orquestra"})], T["orq"]), True)
expect("B4 pol llegeix membres de G2 (és cantaire allà)", lst(f"cors/{G2}/members", T["pol"]), True)
expect("B4b leader de F llegeix membres de G2", lst(f"cors/{G2}/members", T["leader"]), False)
expect("B5 orq canvia l'índex antic de pol", commit([upd("staffIndex/pol@exemple.cat", {"choirId": G2})], T["orq"]), False)
expect("B6 orq crea índex antic nou cap a G2", commit([upd("staffIndex/altre@exemple.cat", {"choirId": G2})], T["orq"]), False)
expect("B7 orq llegeix l'índex de pol", lst("staffIndex/pol@exemple.cat/agrupacions", T["orq"]), False)
expect("B7b pol llegeix el seu índex", lst("staffIndex/pol@exemple.cat/agrupacions", T["pol"]), True)
expect("B7c pol llegeix el seu índex antic", get("staffIndex/pol@exemple.cat", T["pol"]), True)
expect("B8 orq llegeix el directori de G2", get(f"agrupacions/{G2}", T["orq"]), True)
expect("B8b leader de F llegeix el directori de G2", get(f"agrupacions/{G2}", T["leader"]), False)

print("C. Rols dins de la fundadora (com fins ara)")
for col in ["members", "productions", "attendance", "config", "subs", "announcements", "polls"]:
    expect(f"C1 cantaire llegeix {col}", lst(f"cors/{F}/{col}", T["singer"]), True)
expect("C1b cantaire llegeix persones", lst(f"cors/{F}/staff", T["singer"]), False)
expect("C1c cantaire llegeix tots els avisos", lst(f"cors/{F}/absences", T["singer"]), False)
expect("C2 cantaire escriu llista", commit([upd(f"cors/{F}/attendance/s1_S", {"marks": {"m1": {"s": "P"}}})], T["singer"]), False)
expect("C3 cap de corda escriu llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["leader"]), True)
expect("C3b cap de corda llegeix persones", lst(f"cors/{F}/staff", T["leader"]), True)
expect("C4 cantaire avisa d'absència", commit([upd(f"cors/{F}/absences/a1", {"memberId": "m1", "uid": "uid-singer", "status": "pending", "sessionIds": ["s1"]})], T["singer"]), True)
expect("C4b cantaire avisa per un altre", commit([upd(f"cors/{F}/absences/a2", {"memberId": "m2", "uid": "uid-singer", "status": "pending"})], T["singer"]), False)
expect("C5 cantaire desa lastSeen", commit([upd(f"cors/{F}/staff/singer@exemple.cat", {"lastSeen": now}, ["lastSeen"])], T["singer"]), True)
expect("C5b cantaire es fa admin", commit([upd(f"cors/{F}/staff/singer@exemple.cat", {"role": "admin"}, ["role"])], T["singer"]), False)
expect("C6 admin afegeix persona", commit([upd(f"cors/{F}/staff/nou@exemple.cat", {"email": "nou@exemple.cat", "role": "singer"}),
                                           upd(f"staffIndex/nou@exemple.cat/agrupacions/{F}", {"at": now, "name": "Cor Jove"})], T["pol"]), True)
expect("C7 cap de corda afegeix persona", commit([upd(f"cors/{F}/staff/x@exemple.cat", {"email": "x@exemple.cat", "role": "admin"})], T["leader"]), False)
expect("C8 cap de corda esborra config/main", commit([dele(f"cors/{F}/config/main")], T["leader"]), False)
expect("C8b cap de corda edita config/main", commit([upd(f"cors/{F}/config/main", {"minAttendance": 75}, ["minAttendance"])], T["leader"]), True)
expect("C9 admin esborra config/main", commit([dele(f"cors/{F}/config/main")], T["pol"]), False)
expect("C9b admin esborra un tros de fitxer", commit([dele(f"cors/{F}/config/fitxer_x_0")], T["pol"]), True)
expect("C10 Palau llegeix membres", lst(f"cors/{F}/members", T["palau"]), True)
expect("C10b Palau escriu membres", commit([upd(f"cors/{F}/members/m9", {"name": "X"})], T["palau"]), True)
expect("C10c Palau passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "R"}}})], T["palau"]), True)
expect("C10d Palau dona accés a algú", commit([upd(f"cors/{F}/staff/y@exemple.cat", {"email": "y@exemple.cat", "role": "singer"})], T["palau"]), False)
expect("C10e gerencia llegeix membres", lst(f"cors/{F}/members", T["ger"]), True)
expect("C10f gerencia passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["ger"]), True)
expect("C10g gerencia publica un anunci", commit([upd(f"cors/{F}/announcements/a9", {"id": "a9", "title": "Hola"})], T["ger"]), True)
expect("C10h gerencia dona accés a algú", commit([upd(f"cors/{F}/staff/y2@exemple.cat", {"email": "y2@exemple.cat", "role": "singer"})], T["ger"]), False)
expect("C10i gerencia canvia el nom de l'agrupació", commit([upd(f"cors/{F}/config/main", {"name": "Altre"}, ["name"])], T["ger"]), False)
expect("C10j secretaria passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m2": {"s": "P"}}})], T["sec"]), True)
expect("C10k secretaria edita config/main", commit([upd(f"cors/{F}/config/main", {"minAttendance": 70}, ["minAttendance"])], T["sec"]), True)
expect("C10l secretaria dona accés a algú", commit([upd(f"cors/{F}/staff/y3@exemple.cat", {"email": "y3@exemple.cat", "role": "singer"})], T["sec"]), False)
expect("C10m secretaria no toca les classes", commit([upd(f"cors/{F}/classes/c9", {"date": "2026-09-20", "slots": []})], T["sec"]), False)
expect("C11 cantaire activa avisos", commit([upd(f"cors/{F}/push/dev2", {"uid": "uid-singer", "endpoint": "https://y"})], T["singer"]), True)
expect("C12 enllaç d'edició llegeix membres", lst(f"cors/{F}/members", T["anonEdit"]), False)
expect("C12b enllaç d'edició edita config", commit([upd(f"cors/{F}/config/main", {"alertFNJ": 4}, ["alertFNJ"])], T["anonEdit"]), False)
expect("C12c enllaç d'edició llegeix el directori", get(f"agrupacions/{F}", T["anonEdit"]), False)
expect("C12d enllaç d'edició llegeix secrets", get(f"cors/{F}/secrets/main", T["anonEdit"]), False)
expect("C13 lector de còpies llegeix persones", lst(f"cors/{F}/staff", T["anonBackup"]), True)
expect("C13b lector de còpies escriu", commit([upd(f"cors/{F}/members/m9", {"name": "X"})], T["anonBackup"]), False)
expect("C14 anònim sense clau llegeix membres", lst(f"cors/{F}/members", T["anon"]), False)
expect("C15 cantaire llegeix la seva fitxa", get(f"cors/{F}/staff/singer@exemple.cat", T["singer"]), True)
expect("C16 claus: admin crea enllaç d'edició", commit([upd("claus/NEWEDIT_aaaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "edit", "at": now})], T["pol"]), False)
expect("C16d claus: admin crea lector del calendari", commit([upd("claus/NEWCAL_aaaaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "calendar", "at": now})], T["pol"]), True)
expect("C16e claus: admin esborra l'enllaç d'edició antic", commit([dele("claus/EDITKEY_aaaaaaaaaaaaaaaaaaaa")], T["pol"]), True)
expect("C16b claus: cap de corda crea enllaç personal", commit([upd("claus/NEWSING_aaaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "singer", "memberId": "m1", "at": now})], T["leader"]), False)
expect("C16c claus: admin de G2 crea enllaç per a F", commit([upd("claus/HIJACK_aaaaaaaaaaaaaaaaaaaa", {"choirId": F, "role": "edit", "at": now})], T["orq"]), False)

print("K. Més d'un rol")
expect("K1 cap de corda i cantaire passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["pau"]), True)
expect("K2 cap de corda avisa de la seva absència", commit([upd(f"cors/{F}/absences/k2", {"memberId": "m3", "uid": "uid-pau", "status": "pending", "sessionIds": ["s1"]})], T["pau"]), True)
expect("K2b cap de corda confirma la convocatòria", commit([upd(f"cors/{F}/rsvp/s1_m3", {"sessionId": "s1", "memberId": "m3", "answer": "no"})], T["pau"]), True)
expect("K2c cap de corda vota una enquesta", commit([upd(f"cors/{F}/polls/q1", {"title": "Q"})], T["pol"]) == 200 and commit([upd(f"cors/{F}/pollVotes/q1_m3", {"pollId": "q1", "memberId": "m3", "choices": ["a"]})], T["pau"]), True)
expect("K2d cap de corda edita el vot d’un altre (pot editar dades)", commit([upd(f"cors/{F}/pollVotes/q1_m1", {"pollId": "q1", "memberId": "m1", "choices": ["a"]})], T["pau"]), True)
expect("K3 cap de corda dona accés a algú", commit([upd(f"cors/{F}/staff/z@exemple.cat", {"email": "z@exemple.cat", "roles": ["singer"]})], T["pau"]), False)
expect("K4 cap de corda es posa admin", commit([upd(f"cors/{F}/staff/pau@exemple.cat", {"roles": ["admin", "leader", "singer"]}, ["roles"])], T["pau"]), False)
expect("K5 llista de rols mana sobre el rol antic", commit([upd(f"cors/{F}/members/m9", {"name": "X"})], T["trampa"]), False)
expect("K5b llista de rols (cantaire) llegeix membres", lst(f"cors/{F}/members", T["trampa"]), True)
expect("K5c llista de rols (cantaire) llegeix persones", lst(f"cors/{F}/staff", T["trampa"]), False)
expect("K5d rol antic admin no pot activar la plataforma", commit([upd("plataforma/equip", {"emails": ["trampa@exemple.cat"], "at": now})], T["trampa"]), False)
expect("K6 director (rol antic) passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["dir"]), True)
expect("K6b director dona accés a algú", commit([upd(f"cors/{F}/staff/z@exemple.cat", {"email": "z@exemple.cat", "roles": ["singer"]})], T["dir"]), False)
expect("K7 admin amb llista de rols dona accés", commit([upd(f"cors/{F}/staff/z@exemple.cat", {"email": "z@exemple.cat", "role": "leader", "roles": ["leader", "singer"], "section": "S", "memberId": "m1"})], T["pol"]), True)
expect("K8 admin amb llista de rols avisa de la seva absència", commit([upd(f"cors/{F}/absences/k8", {"memberId": "m4", "uid": "uid-pol", "status": "pending", "sessionIds": ["s1"]})], T["pol"]), True)

print("M. Classes de cant")
seed(f"cors/{F}/classes/c1", {"id": "c1", "date": "2026-09-22", "teacher": "prof@exemple.cat",
                              "slots": [{"id": "s1", "time": "17:00", "mins": 30, "memberId": "m1"},
                                        {"id": "s2", "time": "17:30", "mins": 30, "memberId": "m3"}]})
expect("M1 professor crea un dia de classe", commit([upd(f"cors/{F}/classes/c2", {"id": "c2", "date": "2026-09-29", "teacher": "prof@exemple.cat", "slots": []})], T["prof"]), True)
expect("M1b professor esborra un dia", commit([dele(f"cors/{F}/classes/c2")], T["prof"]), True)
expect("M2 cap de corda crea un dia de classe", commit([upd(f"cors/{F}/classes/c3", {"id": "c3", "date": "2026-09-29", "slots": []})], T["pau"]), False)
expect("M2b cantaire canvia les classes", commit([upd(f"cors/{F}/classes/c1", {"date": "2026-10-01"}, ["date"])], T["singer"]), False)
expect("M2c admin crea un dia de classe", commit([upd(f"cors/{F}/classes/c4", {"id": "c4", "date": "2026-09-29", "slots": []})], T["pol"]), True)
expect("M3 cantaire llegeix el calendari de classes", lst(f"cors/{F}/classes", T["singer"]), True)
expect("M3b professor llegeix els membres", lst(f"cors/{F}/members", T["prof"]), True)
expect("M3c professor passa llista d'assaig", commit([upd(f"cors/{F}/attendance/s1_S", {"marks": {}}, ["marks"])], T["prof"]), False)
expect("M3d professor dona accés a algú", commit([upd(f"cors/{F}/staff/nou2@exemple.cat", {"email": "nou2@exemple.cat", "roles": ["singer"]})], T["prof"]), False)
expect("M4 cantaire avisa que arribarà tard", commit([upd(f"cors/{F}/classReq/r1", {"id": "r1", "classId": "c1", "slotId": "s1", "memberId": "m1", "uid": "uid-singer", "kind": "late", "mins": 10, "status": "pending", "createdAt": now})], T["singer"]), True)
expect("M4b cantaire avisa per un altre", commit([upd(f"cors/{F}/classReq/r2", {"id": "r2", "classId": "c1", "slotId": "s2", "memberId": "m3", "uid": "uid-singer", "kind": "absent", "status": "pending", "createdAt": now})], T["singer"]), False)
expect("M4c cantaire es dona la petició per acceptada", commit([upd(f"cors/{F}/classReq/r3", {"id": "r3", "classId": "c1", "slotId": "s1", "memberId": "m1", "uid": "uid-singer", "kind": "absent", "status": "accepted", "createdAt": now})], T["singer"]), False)
expect("M5 cantaire demana canvi d'hora a un company", commit([upd(f"cors/{F}/classReq/r4", {"id": "r4", "classId": "c1", "slotId": "s1", "memberId": "m1", "withMemberId": "m3", "withSlotId": "s2", "uid": "uid-singer", "kind": "swap", "status": "pending", "createdAt": now})], T["singer"]), True)
expect("M5b el company accepta el canvi", commit([upd(f"cors/{F}/classReq/r4", {"status": "accepted", "reviewedAt": now, "reviewedBy": "pau@exemple.cat"}, ["status", "reviewedAt", "reviewedBy"])], T["pau"]), True)
expect("M5c un tercer respon per ell", commit([upd(f"cors/{F}/classReq/r1", {"status": "accepted", "reviewedAt": now, "reviewedBy": "x"}, ["status", "reviewedAt", "reviewedBy"])], T["leader"]), False)
expect("M5d qui la demana se l'accepta ella mateixa", commit([upd(f"cors/{F}/classReq/r1", {"status": "accepted", "reviewedAt": now, "reviewedBy": "x"}, ["status", "reviewedAt", "reviewedBy"])], T["singer"]), False)
expect("M5e qui la demana la retira", commit([upd(f"cors/{F}/classReq/r1", {"status": "cancelled", "reviewedAt": now, "reviewedBy": "singer@exemple.cat"}, ["status", "reviewedAt", "reviewedBy"])], T["singer"]), True)
expect("M5f el company canvia també el dia", commit([upd(f"cors/{F}/classReq/r4", {"status": "accepted", "classId": "c4"}, ["status", "classId"])], T["pau"]), False)
expect("M6 professor respon un avís", commit([upd(f"cors/{F}/classReq/r4", {"status": "cancelled", "reviewedAt": now, "reviewedBy": "prof@exemple.cat"}, ["status", "reviewedAt", "reviewedBy"])], T["prof"]), True)
expect("M6b professor llegeix totes les peticions", lst(f"cors/{F}/classReq", T["prof"]), True)
expect("M6c un cantaire llegeix totes les peticions", lst(f"cors/{F}/classReq", T["singer"]), False)
expect("M6d el servei llegeix les peticions", lst(f"cors/{F}/classReq", T["service"]), True)
seed(f"cors/{F}/classNotes/c1_s1", {"classId": "c1", "slotId": "s1", "memberId": "m1", "date": "2026-09-22", "text": "Vocalitzacions"})
seed(f"cors/{F}/classNotes/c1_s2", {"classId": "c1", "slotId": "s2", "memberId": "m3", "date": "2026-09-22", "text": "Respiració"})
expect("M8 professor escriu l'horari fix", commit([upd(f"cors/{F}/classPlan/prof@exemple.cat", {"teacher": "prof@exemple.cat", "rows": [{"id": "p1", "day": 1, "time": "17:00", "mins": 30, "memberId": "m1"}]})], T["prof"]), True)
expect("M8b cantaire escriu l'horari fix", commit([upd(f"cors/{F}/classPlan/prof@exemple.cat", {"rows": []}, ["rows"])], T["singer"]), False)
expect("M8c cantaire llegeix l'horari fix", lst(f"cors/{F}/classPlan", T["singer"]), True)
expect("M9 professor escriu una nota de classe", commit([upd(f"cors/{F}/classNotes/c1_s1", {"text": "Molt bé"}, ["text"])], T["prof"]), True)
expect("M9b cantaire escriu una nota de classe", commit([upd(f"cors/{F}/classNotes/c1_s1", {"text": "Jo"}, ["text"])], T["singer"]), False)
expect("M9c cantaire llegeix la seva nota", get(f"cors/{F}/classNotes/c1_s1", T["singer"]), True)
expect("M9d cantaire llegeix la nota d'un altre", get(f"cors/{F}/classNotes/c1_s2", T["singer"]), False)
expect("M9e cap de corda llegeix una nota de classe", get(f"cors/{F}/classNotes/c1_s1", T["leader"]), False)
expect("M9f el servei llegeix les notes", lst(f"cors/{F}/classNotes", T["service"]), True)
expect("M10 cantaire demana un canvi obert", commit([upd(f"cors/{F}/classReq/r10", {"id": "r10", "classId": "c1", "slotId": "s1", "memberId": "m1", "uid": "uid-singer", "kind": "swap", "open": True, "status": "pending", "createdAt": now})], T["singer"]), True)
expect("M10b un company se'l queda", commit([upd(f"cors/{F}/classReq/r10", {"status": "accepted", "withMemberId": "m3", "withSlotId": "s2", "open": False, "reviewedAt": now, "reviewedBy": "pau@exemple.cat"}, ["status", "withMemberId", "withSlotId", "open", "reviewedAt", "reviewedBy"])], T["pau"]), True)
expect("M10c algú se'l queda posant-hi un altre", commit([upd(f"cors/{F}/classReq/r11", {"id": "r11", "classId": "c1", "slotId": "s1", "memberId": "m1", "uid": "uid-singer", "kind": "swap", "open": True, "status": "pending", "createdAt": now})], T["singer"]) == 200 and commit([upd(f"cors/{F}/classReq/r11", {"status": "accepted", "withMemberId": "m9", "withSlotId": "s2", "reviewedAt": now, "reviewedBy": "pau@exemple.cat"}, ["status", "withMemberId", "withSlotId", "reviewedAt", "reviewedBy"])], T["pau"]), False)
expect("M10d qui el demana se'l queda ell mateix", commit([upd(f"cors/{F}/classReq/r11", {"status": "accepted", "withMemberId": "m1", "withSlotId": "s2", "reviewedAt": now, "reviewedBy": "singer@exemple.cat"}, ["status", "withMemberId", "withSlotId", "reviewedAt", "reviewedBy"])], T["singer"]), False)
expect("M10e un canvi obert el llegeix qualsevol de l'agrupació", get(f"cors/{F}/classReq/r11", T["pau"]), True)
expect("M10f un cantaire sense res a veure no pot llistar-los tots", lst(f"cors/{F}/classReq", T["trampa"]), False)
expect("M11 cantaire demana una hora lliure", commit([upd(f"cors/{F}/classReq/r12", {"id": "r12", "classId": "c1", "slotId": "s2", "memberId": "m1", "uid": "uid-singer", "kind": "take", "status": "pending", "createdAt": now})], T["singer"]), True)
expect("M11b el professorat l'accepta", commit([upd(f"cors/{F}/classReq/r12", {"status": "accepted", "reviewedAt": now, "reviewedBy": "prof@exemple.cat"}, ["status", "reviewedAt", "reviewedBy"])], T["prof"]), True)
expect("M12 cantaire es fa la clau del calendari de classes", commit([upd(f"cors/{F}/classIcs/m1", {"memberId": "m1", "token": "T" * 30, "at": now})], T["singer"]), True)
expect("M12b cantaire fa la clau d'un altre", commit([upd(f"cors/{F}/classIcs/m3", {"memberId": "m3", "token": "T" * 30, "at": now})], T["singer"]), False)
expect("M12c cantaire llegeix la clau d'un altre", get(f"cors/{F}/classIcs/m3", T["singer"]), False)
expect("M12d clau massa curta", commit([upd(f"cors/{F}/classIcs/m1", {"memberId": "m1", "token": "curta", "at": now})], T["singer"]), False)
expect("M12e el servei llegeix les claus", lst(f"cors/{F}/classIcs", T["service"]), True)
expect("M7 cantaire d'una altra agrupació llegeix les classes", lst(f"cors/{F}/classes", T["orq"]), False)

print("D. Directori")
expect("D1 enllaç d'edició registra F", commit([upd(f"agrupacions/{F}", {"name": "Cor Jove", "kind": "cor", "status": "active", "createdAt": now, "createdBy": "pol@exemple.cat"})], T["anonEdit"]), False)
expect("D1b admin (amb llista de rols) registra F", commit([upd(f"agrupacions/{F}", {"name": "Cor Jove", "kind": "cor", "status": "active", "createdAt": now, "createdBy": "pol@exemple.cat"})], T["pol"]), True)
expect("D2 orq sobreescriu F", commit([upd(f"agrupacions/{F}", {"name": "Meu", "kind": "cor", "status": "active", "createdAt": now, "createdBy": "orq@exemple.cat"})], T["orq"]), False)
expect("D3 cap de corda desa estadístiques", commit([upd(f"agrupacions/{F}", {"stats": {"members": 69}}, ["stats"])], T["leader"]), True)
expect("D3b cap de corda canvia el nom", commit([upd(f"agrupacions/{F}", {"name": "X"}, ["name"])], T["leader"]), False)
expect("D4 admin que no és Pro canvia nom i tipus", commit([upd(f"agrupacions/{F}", {"name": "Cor Jove de l’Orfeó", "kind": "cor"}, ["name", "kind"])], T["pol"]), False)
expect("D4c admin que no és Pro canvia el nom a config", commit([upd(f"cors/{F}/config/main", {"name": "Un altre nom"}, ["name"])], T["pol"]), False)
expect("D4b admin es reactiva/suspèn", commit([upd(f"agrupacions/{F}", {"status": "suspended"}, ["status"])], T["pol"]), False)
expect("D5 cantaire llegeix el directori de F", get(f"agrupacions/{F}", T["singer"]), True)
expect("D6 les regles encara deixen llegir després de registrar F", lst(f"cors/{F}/members", T["singer"]), True)

print("E. Plataforma")
expect("E1 plataforma/equip encara no existeix", get("plataforma/equip", T["orq"]), "404")
expect("E2 orq es fa plataforma", commit([upd("plataforma/equip", {"emails": ["orq@exemple.cat"], "at": now})], T["orq"]), False)
expect("E3 cap de corda de F es fa plataforma", commit([upd("plataforma/equip", {"emails": ["leader@exemple.cat"], "at": now})], T["leader"]), False)
expect("E3b admin de F hi posa un altre correu", commit([upd("plataforma/equip", {"emails": ["orq@exemple.cat"], "at": now})], T["pol"]), False)
expect("E4 admin de F activa la plataforma", commit([upd("plataforma/equip", {"emails": ["pol@exemple.cat"], "at": now})], T["pol"]), True)
expect("E4b orq llegeix plataforma/equip", get("plataforma/equip", T["orq"]), False)
expect("E4c pol llegeix plataforma/equip", get("plataforma/equip", T["pol"]), True)
expect("E5 orq (Pro) llegeix si és Pro", get("plataforma/pro", T["orq"]), True)
expect("E5b cap de corda (no Pro) llegeix la llista Pro", get("plataforma/pro", T["leader"]), False)
expect("E5c orq (Pro) s'afegeix algú a la llista Pro", commit([upd("plataforma/pro", {"emails": ["orq@exemple.cat", "nou@exemple.cat", "leader@exemple.cat"], "at": now})], T["orq"]), False)
expect("E5d pol (plataforma) llegeix la llista Pro", get("plataforma/pro", T["pol"]), True)
expect("E6 pol treu nou de la llista Pro", commit([upd("plataforma/pro", {"emails": ["orq@exemple.cat"], "at": now})], T["pol"]), True)
expect("E6a nou ja no pot crear", commit(creation("G9xxxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat"), T["new"]), False)
expect("E6a2 nou llegeix la llista Pro (ja no hi és)", get("plataforma/pro", T["new"]), False)
expect("E6b pol (plataforma, sempre Pro) sí que pot crear", commit(creation("G10xxxxxxxxxxxxxxxxxxxxx", "pol@exemple.cat"), T["pol"]), True)
expect("E6c pol torna a posar nou a la llista Pro", commit([upd("plataforma/pro", {"emails": ["orq@exemple.cat", "nou@exemple.cat"], "at": now})], T["pol"]), True)
expect("E6d ara nou sí que pot crear", commit(creation("G11xxxxxxxxxxxxxxxxxxxxx", "nou@exemple.cat"), T["new"]), True)
expect("E6e pol (Pro i admin) canvia el nom de F", commit([upd(f"agrupacions/{F}", {"name": "Cor Jove de l’Orfeó", "kind": "cor"}, ["name", "kind"])], T["pol"]), True)
expect("E7 pol llista el directori", lst("agrupacions", T["pol"]), True)
expect("E7b orq llista el directori", lst("agrupacions", T["orq"]), False)
expect("E8 plataforma no llegeix membres de G11", lst("cors/G11xxxxxxxxxxxxxxxxxxxxx/members", T["pol"]), False)
expect("E9 pol suspèn G2", commit([upd(f"agrupacions/{G2}", {"status": "suspended"}, ["status"])], T["pol"]), True)
expect("E10 orq amb G2 suspesa llegeix membres", lst(f"cors/{G2}/members", T["orq"]), False)
expect("E10b orq amb G2 suspesa llegeix el directori", get(f"agrupacions/{G2}", T["orq"]), True)
expect("E10c orq amb G2 suspesa llegeix la seva fitxa", get(f"cors/{G2}/staff/orq@exemple.cat", T["orq"]), True)
expect("E10d orq amb G2 suspesa escriu", commit([upd(f"cors/{G2}/members/x", {"name": "X"})], T["orq"]), False)
expect("E10e orq reactiva G2", commit([upd(f"agrupacions/{G2}", {"status": "active"}, ["status"])], T["orq"]), False)
expect("E11 pol reactiva G2", commit([upd(f"agrupacions/{G2}", {"status": "active"}, ["status"])], T["pol"]), True)
expect("E11b orq torna a llegir membres", lst(f"cors/{G2}/members", T["orq"]), True)

print("F. Compte de servei")
expect("F1 servei llista el directori", lst("agrupacions", T["service"]), True)
for col in ["members", "staff", "push", "attendance", "config", "absences"]:
    expect(f"F2 servei llegeix {col} de F", lst(f"cors/{F}/{col}", T["service"]), True)
expect("F2b servei llegeix membres de G2", lst(f"cors/{G2}/members", T["service"]), True)
expect("F3 servei escriu", commit([upd(f"cors/{F}/members/m9", {"name": "X"})], T["service"]), False)
expect("F4 servei llegeix plataforma/equip", get("plataforma/equip", T["service"]), False)
expect("F5 servei llegeix secrets", get(f"cors/{F}/secrets/main", T["service"]), False)

print("L. Identitat de l'agrupació")
seed(f"cors/{G2}/staff/adm2@exemple.cat", {"email": "adm2@exemple.cat", "roles": ["admin"], "role": "admin"})
expect("L1 cap de corda canvia el nom de F", commit([upd(f"cors/{F}/config/main", {"name": "X"}, ["name"])], T["pau"]), False)
expect("L1b cap de corda canvia les seccions de F", commit([upd(f"cors/{F}/config/main", {"sections": []}, ["sections"])], T["pau"]), False)
expect("L1c cap de corda canvia la norma de F", commit([upd(f"cors/{F}/config/main", {"minAttendance": 70}, ["minAttendance"])], T["pau"]), True)
expect("L2 pol (Pro i admin) canvia nom, tipus, seccions i logotip de F", commit([upd(f"cors/{F}/config/main", {"name": "Cor Jove", "kind": "cor", "sections": [{"id": "S", "name": "Sopranos"}], "brand": {"accent": "#123456"}}, ["name", "kind", "sections", "brand"])], T["pol"]), True)
expect("L3 admin no Pro de G2 canvia el nom", commit([upd(f"cors/{G2}/config/main", {"name": "Meva"}, ["name"])], T["adm2"]), False)
expect("L3b admin no Pro de G2 canvia el tipus", commit([upd(f"cors/{G2}/config/main", {"kind": "banda"}, ["kind"])], T["adm2"]), False)
expect("L3c admin no Pro de G2 canvia el logotip", commit([upd(f"cors/{G2}/config/main", {"brand": {"logo": "x"}}, ["brand"])], T["adm2"]), False)
expect("L3d admin no Pro de G2 canvia el nom del rol", commit([upd(f"cors/{G2}/config/main", {"labels": {"palau": "X"}}, ["labels"])], T["adm2"]), False)
expect("L3e admin no Pro de G2 reescriu la config sencera amb un altre nom", commit([upd(f"cors/{G2}/config/main", {"name": "Meva", "kind": "orquestra", "sections": [{"id": "V1", "name": "Violins I"}]})], T["adm2"]), False)
expect("L3f admin no Pro de G2 canvia la norma", commit([upd(f"cors/{G2}/config/main", {"minAttendance": 60}, ["minAttendance"])], T["adm2"]), True)
expect("L3g admin no Pro de G2 puja un fitxer", commit([upd(f"cors/{G2}/config/fitxer_a_0", {"n": 0})], T["adm2"]), True)
expect("L3h admin no Pro de G2 canvia el nom al directori", commit([upd(f"agrupacions/{G2}", {"name": "Meva"}, ["name"])], T["adm2"]), False)
expect("L3i admin no Pro de G2 la marca com a esborrada", commit([upd(f"agrupacions/{G2}", {"status": "deleted", "deletedAt": now}, ["status", "deletedAt"])], T["adm2"]), False)
expect("L3j admin no Pro de G2 deixa la config com a esborrada", commit([upd(f"cors/{G2}/config/main", {"name": "", "deleted": True, "deletedAt": now})], T["adm2"]), False)
expect("L3k admin no Pro de G2 desa estadístiques", commit([upd(f"agrupacions/{G2}", {"stats": {"members": 3}}, ["stats"])], T["adm2"]), True)
expect("L3l admin no Pro de G2 reescriu la config amb el mateix nom (sense canvis d'identitat)", commit([upd(f"cors/{G2}/config/main", {"name": "Orquestra", "kind": "orquestra", "sections": [{"id": "V1", "name": "Violins I"}], "minAttendance": 60})], T["adm2"]), True)
expect("L4 orq (Pro i admin) canvia el nom de G2", commit([upd(f"cors/{G2}/config/main", {"name": "Orquestra Nova"}, ["name"])], T["orq"]), True)

print("G. Esborrar una agrupació")
expect("G1 orq marca G2 com a esborrada", commit([upd(f"agrupacions/{G2}", {"status": "deleted", "deletedAt": now}, ["status", "deletedAt"])], T["orq"]), True)
expect("G2 després, orq llegeix membres", lst(f"cors/{G2}/members", T["orq"]), False)
expect("G3 orq esborra la fitxa del directori", commit([dele(f"agrupacions/{G2}")], T["orq"]), False)
expect("G3b pol esborra la fitxa del directori", commit([dele(f"agrupacions/{G2}")], T["pol"]), True)
expect("G4 ningú no pot tornar a crear G2 (config encara hi és)", commit(creation(G2, "nou@exemple.cat"), T["new"]), False)

print("H. Índex")
expect("H1 cantaire treu la seva agrupació de l'índex", commit([dele(f"staffIndex/singer@exemple.cat/agrupacions/{F}")], T["singer"]), True)
expect("H2 cantaire llegeix l'índex d'un altre", lst("staffIndex/pol@exemple.cat/agrupacions", T["singer"]), False)

print("I. Substitut i confirmacions")
seed(f"cors/{F}/subs/s1_S", {"sessionId": "s1", "section": "S", "memberId": "m1", "until": int(time.time() * 1000) + 3600_000})
expect("I1 substitut passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["singer"]), True)
expect("J1 cantaire confirma", commit([upd(f"cors/{F}/rsvp/s1_m1", {"sessionId": "s1", "memberId": "m1", "answer": "yes"})], T["singer"]), True)
expect("J2 cantaire confirma per un altre", commit([upd(f"cors/{F}/rsvp/s1_m2", {"sessionId": "s1", "memberId": "m2", "answer": "yes"})], T["singer"]), False)

print("M. Registre d'errors")
ERR = {"kind": "error", "msg": "TypeError: x is undefined", "where": "04-llista.js:10:5", "at": now, "app": "abc123", "gid": F, "route": "inici", "ua": "Mozilla/5.0", "online": True}
expect("M1 cantaire deixa una nota d'error", commit([upd("errors/e1", ERR)], T["singer"]), True)
expect("M2 sense sessió no en pot deixar", commit([upd("errors/e2", ERR)], None), False)
expect("M3 nota amb un camp de més", commit([upd("errors/e3", {**ERR, "email": "pol@exemple.cat"})], T["singer"]), False)
expect("M4 nota massa llarga", commit([upd("errors/e4", {**ERR, "msg": "x" * 401})], T["singer"]), False)
expect("M5 tipus desconegut", commit([upd("errors/e5", {**ERR, "kind": "altre"})], T["singer"]), False)
expect("M6 cantaire llegeix les notes", lst("errors", T["singer"]), False)
expect("M7 cantaire canvia una nota", commit([upd("errors/e1", {**ERR, "msg": "res"})], T["singer"]), False)
expect("M8 cantaire esborra una nota", commit([dele("errors/e1")], T["singer"]), False)
expect("M9 el compte de servei les llegeix", lst("errors", T["service"]), True)
expect("M10 admin d'agrupació (no plataforma) les llegeix", lst("errors", T["orq"]), False)

print()
print(f"{PASSES} correctes · {len(FAILS)} errors")
sys.exit(1 if FAILS else 0)
