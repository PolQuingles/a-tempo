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


def qry(parent, col, filters, tok):
    """Una consulta amb filtres (com les de l'app): [(camp, op, valor)], op de l'API REST (EQUAL, ARRAY_CONTAINS…)."""
    where = [{"fieldFilter": {"field": {"fieldPath": f}, "op": op, "value": enc(v)}} for f, op, v in filters]
    sq = {"from": [{"collectionId": col}]}
    if len(where) == 1:
        sq["where"] = where[0]
    elif where:
        sq["where"] = {"compositeFilter": {"op": "AND", "filters": where}}
    return req("POST", f"{BASE}/{parent}:runQuery", {"structuredQuery": sq}, tok)[0]


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
    "fresh": token("uid-fresh", "fresc@exemple.cat"),   # no és a cap agrupació: entra amb l'enllaç del cor (Z)
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
expect("C3 cap de corda escriu la llista de la seva corda", commit([upd(f"cors/{F}/attendance/s1_T", {"sessionId": "s1", "section": "T", "marks": {"m2": {"s": "P"}}})], T["leader"]), True)
expect("C3b però no la d'una altra corda", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["leader"]), False)
expect("C3c ni li canvia la corda", commit([upd(f"cors/{F}/attendance/s1_T", {"sessionId": "s1", "section": "S", "marks": {}})], T["leader"]), False)
expect("C3d la direcció escriu la de qualsevol corda", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["dir"]), True)
expect("C3b cap de corda ja no llegeix les fitxes de tothom (correus i rols)", lst(f"cors/{F}/staff", T["leader"]), False)
expect("C4 cantaire avisa d'absència", commit([upd(f"cors/{F}/absences/a1", {"memberId": "m1", "uid": "uid-singer", "status": "pending", "sessionIds": ["s1"]})], T["singer"]), True)
expect("C4b cantaire avisa per un altre", commit([upd(f"cors/{F}/absences/a2", {"memberId": "m2", "uid": "uid-singer", "status": "pending"})], T["singer"]), False)
expect("C5 cantaire desa lastSeen", commit([upd(f"cors/{F}/staff/singer@exemple.cat", {"lastSeen": now}, ["lastSeen"])], T["singer"]), True)
expect("C5b cantaire es fa admin", commit([upd(f"cors/{F}/staff/singer@exemple.cat", {"role": "admin"}, ["role"])], T["singer"]), False)
expect("C6 admin afegeix persona", commit([upd(f"cors/{F}/staff/nou@exemple.cat", {"email": "nou@exemple.cat", "role": "singer"}),
                                           upd(f"staffIndex/nou@exemple.cat/agrupacions/{F}", {"at": now, "name": "Cor Jove"})], T["pol"]), True)
expect("C7 cap de corda afegeix persona", commit([upd(f"cors/{F}/staff/x@exemple.cat", {"email": "x@exemple.cat", "role": "admin"})], T["leader"]), False)
expect("C8 cap de corda esborra config/main", commit([dele(f"cors/{F}/config/main")], T["leader"]), False)
expect("C8b cap de corda ja no edita els Ajustos", commit([upd(f"cors/{F}/config/main", {"minAttendance": 75}, ["minAttendance"])], T["leader"]), False)
expect("C9 admin esborra config/main", commit([dele(f"cors/{F}/config/main")], T["pol"]), False)
expect("C9b admin esborra un tros de fitxer", commit([dele(f"cors/{F}/config/fitxer_x_0")], T["pol"]), True)
# «palau» era l'antic rol únic de l'equip: ja no dona cap permís d'edició (Ajustos › Restes de versions antigues el passa a Gerència).
expect("C10 el rol antic «palau» llegeix membres (té fitxa)", lst(f"cors/{F}/members", T["palau"]), True)
expect("C10b el rol antic «palau» ja no escriu membres", commit([upd(f"cors/{F}/members/m9", {"name": "X"})], T["palau"]), False)
expect("C10c el rol antic «palau» ja no passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "R"}}})], T["palau"]), False)
expect("C10d Palau dona accés a algú", commit([upd(f"cors/{F}/staff/y@exemple.cat", {"email": "y@exemple.cat", "role": "singer"})], T["palau"]), False)
expect("C10e gerencia llegeix membres", lst(f"cors/{F}/members", T["ger"]), True)
expect("C10f gerencia no passa llista (només la llegeix)", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["ger"]), False)
expect("C10g gerencia publica un anunci", commit([upd(f"cors/{F}/announcements/a9", {"id": "a9", "title": "Hola"})], T["ger"]), True)
expect("C10h gerencia dona accés a algú", commit([upd(f"cors/{F}/staff/y2@exemple.cat", {"email": "y2@exemple.cat", "role": "singer"})], T["ger"]), False)
expect("C10i gerencia canvia el nom de l'agrupació", commit([upd(f"cors/{F}/config/main", {"name": "Altre"}, ["name"])], T["ger"]), False)
expect("C10j secretaria no passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m2": {"s": "P"}}})], T["sec"]), False)
expect("C10k secretaria no edita els Ajustos", commit([upd(f"cors/{F}/config/main", {"minAttendance": 70}, ["minAttendance"])], T["sec"]), False)
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
expect("K1 cap de corda i cantaire passa llista de la seva corda", commit([upd(f"cors/{F}/attendance/s1_B", {"sessionId": "s1", "section": "B", "marks": {"m3": {"s": "P"}}})], T["pau"]), True)
expect("K1b però no d'una altra", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["pau"]), False)
expect("K2 cap de corda avisa de la seva absència", commit([upd(f"cors/{F}/absences/k2", {"memberId": "m3", "uid": "uid-pau", "status": "pending", "sessionIds": ["s1"]})], T["pau"]), True)
expect("K2b cap de corda confirma la convocatòria", commit([upd(f"cors/{F}/rsvp/s1_m3", {"sessionId": "s1", "memberId": "m3", "answer": "no"})], T["pau"]), True)
expect("K2c cap de corda vota una enquesta", commit([upd(f"cors/{F}/polls/q1", {"title": "Q"})], T["pol"]) == 200 and commit([upd(f"cors/{F}/pollVotes/q1_m3", {"pollId": "q1", "memberId": "m3", "choices": ["a"]})], T["pau"]), True)
expect("K2d cap de corda no edita el vot d’un altre (el tauler no és seu)", commit([upd(f"cors/{F}/pollVotes/q1_m1", {"pollId": "q1", "memberId": "m1", "choices": ["a"]})], T["pau"]), False)
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
seed(f"cors/{F}/classNotes/c1_s1", {"classId": "c1", "slotId": "s1", "memberId": "m1", "teacher": "prof@exemple.cat", "date": "2026-09-22", "text": "Vocalitzacions"})
seed(f"cors/{F}/classNotes/c1_s2", {"classId": "c1", "slotId": "s2", "memberId": "m3", "teacher": "prof@exemple.cat", "date": "2026-09-22", "text": "Respiració"})
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
OPEN = {"classId": "c1", "slotId": "s1", "memberId": "m1", "uid": "uid-singer", "kind": "swap", "open": True, "status": "pending", "createdAt": now}
ACC = lambda w: upd(f"cors/{F}/classReq/{w}", {"status": "accepted", "withMemberId": "m3", "withSlotId": "s7", "withClassId": "c2", "open": False, "reviewedAt": now, "reviewedBy": "pau@exemple.cat"}, ["status", "withMemberId", "withSlotId", "withClassId", "open", "reviewedAt", "reviewedBy"])
expect("M10g canvi obert a unes quantes persones", commit([upd(f"cors/{F}/classReq/r20", {**OPEN, "id": "r20", "to": ["m3", "m4"], "offers": {"m3": "c2|s7", "m4": "c1|s2"}})], T["singer"]), True)
expect("M10h una de les triades se'l queda amb la seva hora d'un altre dia", commit([ACC("r20")], T["pau"]), True)
expect("M10i qui no és a la llista no se'l pot quedar", commit([upd(f"cors/{F}/classReq/r21", {**OPEN, "id": "r21", "to": ["m4"]})], T["singer"]) == 200 and commit([ACC("r21")], T["pau"]), False)
expect("M10j un canvi obert a tothom, amb una hora de l'altre dia", commit([upd(f"cors/{F}/classReq/r22", {**OPEN, "id": "r22"})], T["singer"]) == 200 and commit([ACC("r22")], T["pau"]), True)
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
expect("L1c cap de corda ja no canvia la norma de F", commit([upd(f"cors/{F}/config/main", {"minAttendance": 70}, ["minAttendance"])], T["pau"]), False)
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

print("N. Repertori, sortides, fitxes i classes")
expect("N1 cantaire llegeix el repertori", lst(f"cors/{F}/works", T["singer"]), True)
expect("N2 cantaire crea una obra", commit([upd(f"cors/{F}/works/w1", {"id": "w1", "title": "Gloria"})], T["singer"]), False)
expect("N3 direcció crea una obra", commit([upd(f"cors/{F}/works/w1", {"id": "w1", "title": "Gloria", "roles": [{"id": "r1", "name": "Solo", "memberIds": ["m1"]}]})], T["dir"]), True)
expect("N3b professor de cant crea una obra", commit([upd(f"cors/{F}/works/w2", {"id": "w2", "title": "X"})], T["prof"]), False)
expect("N4 cantaire llegeix les sortides", lst(f"cors/{F}/trips", T["singer"]), True)
expect("N5 cantaire crea una sortida", commit([upd(f"cors/{F}/trips/t1", {"id": "t1", "title": "Gira"})], T["singer"]), False)
expect("N5b gerència crea una sortida", commit([upd(f"cors/{F}/trips/t1", {"id": "t1", "title": "Gira", "from": "2026-10-10", "transports": [{"id": "v1", "name": "Autocar", "seats": 55}]})], T["ger"]), True)
expect("N6 cantaire s'apunta a una sortida", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "yes", "note": "", "uid": "uid-singer"})], T["singer"]), True)
expect("N7 cantaire s'hi apunta posant-se el transport", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "yes", "transport": "v1"})], T["singer"]), False)
expect("N7b cantaire s'hi apunta amb un transport des del principi", commit([upd(f"cors/{F}/tripSignups/t2_m1", {"tripId": "t2", "memberId": "m1", "answer": "yes", "transport": "v1"})], T["singer"]), False)
expect("N8 cantaire apunta un altre", commit([upd(f"cors/{F}/tripSignups/t1_m2", {"tripId": "t1", "memberId": "m2", "answer": "yes"})], T["singer"]), False)
expect("N9 gerència hi posa el transport i l'habitació", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "yes", "note": "", "uid": "uid-singer", "transport": "v1", "room": "h1"})], T["ger"]), True)
expect("N10 cantaire es canvia l'habitació", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "yes", "note": "", "uid": "uid-singer", "transport": "v1", "room": "h2"})], T["singer"]), False)
expect("N10b cantaire diu que no hi va (el transport es queda)", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "no", "note": "Malalt", "uid": "uid-singer", "transport": "v1", "room": "h1"})], T["singer"]), True)
expect("N11 cantaire llegeix la seva inscripció", get(f"cors/{F}/tripSignups/t1_m1", T["singer"]), True)
expect("N12 cantaire llista totes les inscripcions", lst(f"cors/{F}/tripSignups", T["singer"]), False)
expect("N13 gerència les llista totes", lst(f"cors/{F}/tripSignups", T["ger"]), True)
PROF = {"memberId": "m1", "phone": "600000000", "size": "M", "emergencyName": "Mare", "emergencyPhone": "611111111", "at": now}
expect("N14 cantaire desa la seva fitxa", commit([upd(f"cors/{F}/profiles/m1", PROF)], T["singer"]), True)
expect("N15 fitxa amb un camp de més", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "dni": "123"})], T["singer"]), False)
expect("N15b fitxa amb un telèfon massa llarg", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "phone": "6" * 30})], T["singer"]), False)
expect("N16 cantaire desa la fitxa d'un altre", commit([upd(f"cors/{F}/profiles/m2", {**PROF, "memberId": "m2"})], T["singer"]), False)
expect("N17 un cap de corda ja no la llegeix", get(f"cors/{F}/profiles/m1", T["pau"]), False)
expect("N17c la direcció la llegeix (Personal)", get(f"cors/{F}/profiles/m1", T["dir"]), True)
expect("N17b un cantaire sense rol d'equip la llegeix", get(f"cors/{F}/profiles/m1", T["trampa"]), False)
expect("N18 secretaria la llegeix", get(f"cors/{F}/profiles/m1", T["sec"]), True)
expect("N19 professor de cant la llegeix", get(f"cors/{F}/profiles/m1", T["prof"]), False)
expect("N20 professor fa la fitxa de cant d'un alumne", commit([upd(f"cors/{F}/students/m1", {"memberId": "m1", "goals": "Aguts", "repertoire": [], "teachers": ["prof@exemple.cat"]})], T["prof"]), True)
expect("N20b però no sense dir-hi que és seu", commit([upd(f"cors/{F}/students/m3", {"memberId": "m3", "goals": "Aguts", "repertoire": []})], T["prof"]), False)
expect("N21 l'alumne la llegeix", get(f"cors/{F}/students/m1", T["singer"]), True)
expect("N22 l'alumne la canvia", commit([upd(f"cors/{F}/students/m1", {"memberId": "m1", "goals": "Res"})], T["singer"]), False)
expect("N23 un cap de corda la llegeix", get(f"cors/{F}/students/m1", T["pau"]), False)
expect("N24 professor puja un enregistrament", commit([upd(f"cors/{F}/classFiles/f1_0", {"i": 0, "of": 1, "memberId": "m1", "teacher": "prof@exemple.cat"})], T["prof"]), True)
expect("N24b però no a nom d'un altre professor", commit([upd(f"cors/{F}/classFiles/f3_0", {"i": 0, "of": 1, "memberId": "m1", "teacher": "altre@exemple.cat"})], T["prof"]), False)
expect("N25 l'alumne l'escolta", get(f"cors/{F}/classFiles/f1_0", T["singer"]), True)
expect("N26 un altre cantaire l'escolta", get(f"cors/{F}/classFiles/f1_0", T["pau"]), False)
expect("N27 l'alumne en puja un", commit([upd(f"cors/{F}/classFiles/f2_0", {"i": 0, "of": 1, "memberId": "m1"})], T["singer"]), False)
for col in ["works", "trips", "tripSignups", "profiles", "students", "classFiles"]:
    expect(f"N28 el compte de servei llegeix {col}", lst(f"cors/{F}/{col}", T["service"]), True)

print("O. Missatges, notes de seguiment i secretaria")
MSG = {"id": "x", "title": "", "body": "Hola", "createdAt": now}
expect("O1 cap de corda escriu a la seva corda", commit([upd(f"cors/{F}/messages/o1", {**MSG, "id": "o1", "to": ["T"], "by": "leader@exemple.cat"})], T["leader"]), True)
expect("O2 cap de corda escriu a una altra corda", commit([upd(f"cors/{F}/messages/o2", {**MSG, "id": "o2", "to": ["S"], "by": "leader@exemple.cat"})], T["leader"]), False)
expect("O3 cap de corda escriu a tothom", commit([upd(f"cors/{F}/messages/o3", {**MSG, "id": "o3", "to": ["*"], "by": "leader@exemple.cat"})], T["leader"]), False)
expect("O4 secretaria escriu a tothom", commit([upd(f"cors/{F}/messages/o4", {**MSG, "id": "o4", "to": ["*"], "by": "sec@exemple.cat"})], T["sec"]), True)
expect("O4b secretaria escriu a les sopranos", commit([upd(f"cors/{F}/messages/o5", {**MSG, "id": "o5", "to": ["S"], "by": "sec@exemple.cat"})], T["sec"]), True)
expect("O5 secretaria signa amb un altre nom", commit([upd(f"cors/{F}/messages/o6", {**MSG, "id": "o6", "to": ["*"], "by": "pol@exemple.cat"})], T["sec"]), False)
expect("O6 cantaire escriu un missatge", commit([upd(f"cors/{F}/messages/o7", {**MSG, "id": "o7", "to": ["S"], "by": "singer@exemple.cat"})], T["singer"]), False)
expect("O7 una soprano llegeix el missatge a tothom", get(f"cors/{F}/messages/o4", T["singer"]), True)
expect("O7b una soprano llegeix el de les sopranos", get(f"cors/{F}/messages/o5", T["singer"]), True)
expect("O8 una soprano llegeix el dels tenors", get(f"cors/{F}/messages/o1", T["singer"]), False)
expect("O9 una soprano consulta els de tothom", qry(f"cors/{F}", "messages", [("to", "ARRAY_CONTAINS", "*")], T["singer"]), True)
expect("O9b una soprano consulta els de la seva corda", qry(f"cors/{F}", "messages", [("to", "ARRAY_CONTAINS", "S")], T["singer"]), True)
expect("O10 una soprano consulta els dels tenors", qry(f"cors/{F}", "messages", [("to", "ARRAY_CONTAINS", "T")], T["singer"]), False)
expect("O10b una soprano els llista tots", lst(f"cors/{F}/messages", T["singer"]), False)
expect("O11 l'equip els llista tots", lst(f"cors/{F}/messages", T["dir"]), True)
expect("O12 un altre esborra el missatge del cap de corda", commit([dele(f"cors/{F}/messages/o1")], T["pau"]), False)
NOTE = {"memberId": "m2", "section": "T", "text": "Afina millor", "by": "leader@exemple.cat", "at": now}
expect("O13 cap de corda escriu una nota de la seva corda", commit([upd(f"cors/{F}/memberNotes/n1", NOTE)], T["leader"]), True)
expect("O14 cap de corda escriu una nota d'una altra corda", commit([upd(f"cors/{F}/memberNotes/n2", {**NOTE, "memberId": "m1", "section": "S"})], T["leader"]), False)
expect("O15 direcció llegeix les notes", qry(f"cors/{F}", "memberNotes", [("memberId", "EQUAL", "m2")], T["dir"]), True)
expect("O16 cap de corda llegeix les de la seva corda", qry(f"cors/{F}", "memberNotes", [("memberId", "EQUAL", "m2"), ("section", "EQUAL", "T")], T["leader"]), True)
expect("O16b cap de corda les consulta sense dir la corda", qry(f"cors/{F}", "memberNotes", [("memberId", "EQUAL", "m2")], T["leader"]), False)
expect("O17 un altre cap de corda llegeix la nota", get(f"cors/{F}/memberNotes/n1", T["pau"]), False)
expect("O18 secretaria llegeix la nota", get(f"cors/{F}/memberNotes/n1", T["sec"]), False)
expect("O19 el cantaire llegeix la seva nota", get(f"cors/{F}/memberNotes/n1", T["singer"]), False)
DOCS = {"memberId": "m1", "docs": {"imatge": {"v": "no", "at": "2026-09-20"}}, "fees": {"2026-27": {"paid": True, "amount": 120}}}
expect("O20 secretaria desa documents i quota", commit([upd(f"cors/{F}/memberDocs/m1", DOCS)], T["sec"]), True)
expect("O20b gerència també", commit([upd(f"cors/{F}/memberDocs/m1", DOCS)], T["ger"]), True)
expect("O21 cap de corda els desa", commit([upd(f"cors/{F}/memberDocs/m1", DOCS)], T["pau"]), False)
expect("O22 cap de corda els llegeix", get(f"cors/{F}/memberDocs/m1", T["pau"]), False)
expect("O23 direcció els llegeix", get(f"cors/{F}/memberDocs/m1", T["dir"]), True)
expect("O24 el cantaire llegeix els seus", get(f"cors/{F}/memberDocs/m1", T["singer"]), True)
expect("O24b el cantaire se'ls canvia", commit([upd(f"cors/{F}/memberDocs/m1", {**DOCS, "fees": {"2026-27": {"paid": True}}})], T["singer"]), False)
expect("O25 un altre cantaire els llegeix", get(f"cors/{F}/memberDocs/m1", T["trampa"]), False)
expect("O26 secretaria puja un document signat", commit([upd(f"cors/{F}/memberFiles/d1_0", {"i": 0, "of": 1, "memberId": "m1"})], T["sec"]), True)
expect("O27 el cantaire el llegeix", get(f"cors/{F}/memberFiles/d1_0", T["singer"]), True)
expect("O28 un cap de corda el llegeix", get(f"cors/{F}/memberFiles/d1_0", T["pau"]), False)
expect("O29 el cantaire respon els consentiments", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "imageOk": "no", "dataOk": "yes", "consentAt": now})], T["singer"]), True)
expect("O30 un consentiment amb un valor estrany", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "imageOk": "potser"})], T["singer"]), False)
for col in ["messages", "memberNotes", "memberDocs", "memberFiles"]:
    expect(f"O31 el compte de servei llegeix {col}", lst(f"cors/{F}/{col}", T["service"]), True)

print("P. Arxiu de l'assistència, converses, recordatoris, al·lèrgies i restes antigues")
ARCH = {"from": "2026-08-01", "to": "2026-12-31", "docs": {"s1_S": {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}, "date": "2026-09-20"}}, "n": 1, "builtAt": now, "by": "leader@exemple.cat"}
expect("P1 l'administració arxiva un trimestre", commit([upd(f"cors/{F}/attArchive/2026-08-01_2026-12-31", ARCH)], T["pol"]), True)
expect("P1b un cap de corda no (no té les llistes de totes les cordes)", commit([upd(f"cors/{F}/attArchive/2026-08-01_2026-12-31", ARCH)], T["leader"]), False)
expect("P2 un cantaire no el pot arxivar", commit([upd(f"cors/{F}/attArchive/2026-08-01_2026-12-31", ARCH)], T["singer"]), False)
expect("P3 un cantaire el llegeix", lst(f"cors/{F}/attArchive", T["singer"]), True)
expect("P3b una altra agrupació no el llegeix", lst(f"cors/{F}/attArchive", T["orq"]), False)
expect("P3c el compte de servei el llegeix", lst(f"cors/{F}/attArchive", T["service"]), True)
expect("P4 un cap de corda no l'esborra", commit([dele(f"cors/{F}/attArchive/2026-08-01_2026-12-31")], T["leader"]), False)
TH = {"id": "t1", "memberId": "m1", "memberName": "Cantaire U", "section": "S", "toRole": "secretaria", "toEmail": "", "toName": "Secretaria", "subject": "Al·lèrgies", "ref": "",
      "msgs": [{"by": "singer@exemple.cat", "name": "Cantaire U", "side": "m", "text": "Soc celíaca", "at": now}], "lastAt": now, "lastSide": "m", "readM": now, "readS": "", "createdAt": now}
expect("P5 un cantaire escriu a secretaria", commit([upd(f"cors/{F}/threads/t1", TH)], T["singer"]), True)
expect("P5b en nom d'un altre cantaire", commit([upd(f"cors/{F}/threads/t2", {**TH, "id": "t2", "memberId": "m2", "section": "T"})], T["singer"]), False)
expect("P5c al cap d'una altra corda", commit([upd(f"cors/{F}/threads/t3", {**TH, "id": "t3", "toRole": "leader", "section": "T"})], T["singer"]), False)
expect("P5d amb un missatge que no és seu", commit([upd(f"cors/{F}/threads/t4", {**TH, "id": "t4", "msgs": [{**TH["msgs"][0], "by": "pol@exemple.cat"}]})], T["singer"]), False)
expect("P6 secretaria la llegeix", get(f"cors/{F}/threads/t1", T["sec"]), True)
expect("P6b gerència no la llegeix", get(f"cors/{F}/threads/t1", T["ger"]), False)
expect("P6c un cap de corda no la llegeix", get(f"cors/{F}/threads/t1", T["leader"]), False)
expect("P6d l'administració no llegeix les converses dels altres", get(f"cors/{F}/threads/t1", T["pol"]), False)
expect("P7 secretaria busca les seves converses", qry(f"cors/{F}", "threads", [("toRole", "EQUAL", "secretaria")], T["sec"]), True)
expect("P7b gerència busca les de secretaria", qry(f"cors/{F}", "threads", [("toRole", "EQUAL", "secretaria")], T["ger"]), False)
expect("P7c el cantaire busca les seves", qry(f"cors/{F}", "threads", [("memberId", "EQUAL", "m1")], T["singer"]), True)
expect("P7d el cantaire busca les d'un altre", qry(f"cors/{F}", "threads", [("memberId", "EQUAL", "m2")], T["singer"]), False)
expect("P7e un cap de corda busca les de la seva corda", qry(f"cors/{F}", "threads", [("toRole", "EQUAL", "leader"), ("section", "EQUAL", "T")], T["leader"]), True)
expect("P7f un cap de corda busca les d'una altra corda", qry(f"cors/{F}", "threads", [("toRole", "EQUAL", "leader"), ("section", "EQUAL", "S")], T["leader"]), False)
REPLY = {**TH, "msgs": TH["msgs"] + [{"by": "sec@exemple.cat", "name": "Secretaria", "side": "s", "text": "Apuntat!", "at": now}], "lastSide": "s", "readS": now}
expect("P8 secretaria hi respon", commit([upd(f"cors/{F}/threads/t1", REPLY)], T["sec"]), True)
expect("P8b secretaria canvia de qui és", commit([upd(f"cors/{F}/threads/t1", {**REPLY, "memberId": "m2"})], T["sec"]), False)
expect("P8c es treuen missatges", commit([upd(f"cors/{F}/threads/t1", {**REPLY, "msgs": []})], T["singer"]), False)
expect("P8d el cantaire la marca com a llegida", commit([upd(f"cors/{F}/threads/t1", {"readM": now}, ["readM"])], T["singer"]), True)
TD = {**TH, "id": "t5", "toRole": "", "toEmail": "dir@exemple.cat", "toName": "Director"}
expect("P9 un cantaire respon a qui ha escrit un anunci", commit([upd(f"cors/{F}/threads/t5", TD)], T["singer"]), True)
expect("P9b el director la llegeix", get(f"cors/{F}/threads/t5", T["dir"]), True)
expect("P9c el director busca les seves", qry(f"cors/{F}", "threads", [("toEmail", "EQUAL", "dir@exemple.cat")], T["dir"]), True)
expect("P9d gerència busca les del director", qry(f"cors/{F}", "threads", [("toEmail", "EQUAL", "dir@exemple.cat")], T["ger"]), False)
expect("P9e el compte de servei les llegeix (avisos)", qry(f"cors/{F}", "threads", [("lastAt", "GREATER_THAN_OR_EQUAL", now)], T["service"]), True)
TS = lambda tid, mid, sec, by: {**TH, "id": tid, "memberId": mid, "memberName": "X", "section": sec, "toRole": "", "toEmail": by, "toName": "Equip",
                                 "msgs": [{"by": by, "name": "Equip", "side": "s", "text": "Hola", "at": now}], "lastSide": "s", "readM": "", "readS": now}
expect("P10 secretaria escriu a una cantaire", commit([upd(f"cors/{F}/threads/u1", TS("u1", "m1", "S", "sec@exemple.cat"))], T["sec"]), True)
expect("P10b la cantaire la llegeix", get(f"cors/{F}/threads/u1", T["singer"]), True)
expect("P10c secretaria la troba a les seves", qry(f"cors/{F}", "threads", [("toEmail", "EQUAL", "sec@exemple.cat")], T["sec"]), True)
expect("P10d un cantaire escriu a un altre cantaire", commit([upd(f"cors/{F}/threads/u2", TS("u2", "m2", "T", "singer@exemple.cat"))], T["singer"]), False)
expect("P10e un cap de corda escriu a un de la seva corda", commit([upd(f"cors/{F}/threads/u3", TS("u3", "m2", "T", "leader@exemple.cat"))], T["leader"]), True)
expect("P10f a una d'una altra corda", commit([upd(f"cors/{F}/threads/u4", TS("u4", "m1", "S", "leader@exemple.cat"))], T["leader"]), False)
expect("P10g fent veure que és de la seva corda", commit([upd(f"cors/{F}/threads/u5", TS("u5", "m1", "T", "leader@exemple.cat"))], T["leader"]), False)
expect("P10h a nom d'un altre de l'equip", commit([upd(f"cors/{F}/threads/u6", {**TS("u6", "m1", "S", "dir@exemple.cat"), "msgs": [{"by": "sec@exemple.cat", "name": "Equip", "side": "s", "text": "Hola", "at": now}]})], T["sec"]), False)
ND = {"id": "n1", "kind": "poll", "ref": "q1", "title": "Tens pendent l'enquesta", "memberIds": ["m1", "m2"], "by": "leader@exemple.cat", "byName": "Lluc", "createdAt": now}
expect("P10 un cap de corda envia un recordatori", commit([upd(f"cors/{F}/nudges/n1", ND)], T["leader"]), True)
expect("P10b en nom d'un altre", commit([upd(f"cors/{F}/nudges/n2", {**ND, "by": "pol@exemple.cat"})], T["leader"]), False)
expect("P10c d'un tipus desconegut", commit([upd(f"cors/{F}/nudges/n3", {**ND, "kind": "altre"})], T["leader"]), False)
expect("P10d un cantaire n'envia", commit([upd(f"cors/{F}/nudges/n4", {**ND, "by": "singer@exemple.cat"})], T["singer"]), False)
expect("P10e un cantaire els llegeix", lst(f"cors/{F}/nudges", T["singer"]), False)
expect("P10f el compte de servei els llegeix", lst(f"cors/{F}/nudges", T["service"]), True)
expect("P11 les al·lèrgies ja no es desen a la fitxa", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "diet": "Celíaca"})], T["singer"]), False)
expect("P11a ni l'equip les hi posa", commit([upd(f"cors/{F}/profiles/m1", {**PROF, "diet": "Celíaca"})], T["sec"]), False)
HL = {"memberId": "m1", "diet": "Celíaca", "at": now, "consentAt": now}
expect("P11b el cantaire desa les seves al·lèrgies (amb el consentiment)", commit([upd(f"cors/{F}/health/m1", HL)], T["singer"]), True)
expect("P11c unes al·lèrgies massa llargues", commit([upd(f"cors/{F}/health/m1", {**HL, "diet": "x" * 201})], T["singer"]), False)
expect("P11d amb un camp de més", commit([upd(f"cors/{F}/health/m1", {**HL, "dni": "1"})], T["singer"]), False)
expect("P11e les d'un altre", commit([upd(f"cors/{F}/health/m2", {**HL, "memberId": "m2"})], T["singer"]), False)
expect("P11f la secretaria les llegeix", get(f"cors/{F}/health/m1", T["sec"]), True)
expect("P11g la gerència també", lst(f"cors/{F}/health", T["ger"]), True)
expect("P11h la direcció no", get(f"cors/{F}/health/m1", T["dir"]), False)
expect("P11i un cap de corda no", get(f"cors/{F}/health/m1", T["pau"]), False)
expect("P11j l'administració no les llegeix", get(f"cors/{F}/health/m1", T["pol"]), False)
expect("P11k però les passa de la fitxa d'abans", commit([upd(f"cors/{F}/health/m2", {"memberId": "m2", "diet": "Lactosa", "at": now, "by": "pol@exemple.cat"})], T["pol"]), True)
expect("P11l un altre cantaire no les llegeix", get(f"cors/{F}/health/m1", T["trampa"]), False)
expect("P11m la persona les llegeix", get(f"cors/{F}/health/m1", T["singer"]), True)
expect("P11n i les esborra", commit([dele(f"cors/{F}/health/m1")], T["singer"]), True)
expect("P11o el compte de servei les llegeix (còpies)", lst(f"cors/{F}/health", T["service"]), True)
seed(f"cors/{F}/memberMarks/m1", {"marks": {"s1": {"s": "P"}}})
seed(f"cors/{F}/secrets/members", {"m1": "SINGERKEY_aaaaaaaaaaaaaaaaaaa"})
expect("P12 el cantaire ja no llegeix la còpia antiga de les seves marques", get(f"cors/{F}/memberMarks/m1", T["singer"]), False)
expect("P12b un cap de corda no la llegeix", lst(f"cors/{F}/memberMarks", T["leader"]), False)
expect("P12c l'administració la llegeix per netejar-la", lst(f"cors/{F}/memberMarks", T["pol"]), True)
expect("P12d un cap de corda no llegeix les claus antigues", get(f"cors/{F}/secrets/members", T["leader"]), False)
expect("P12e l'administració no hi pot escriure", commit([upd(f"cors/{F}/secrets/members", {"m2": "x"})], T["pol"]), False)
expect("P12f l'administració esborra les restes", commit([dele(f"cors/{F}/memberMarks/m1"), dele(f"cors/{F}/secrets/members")], T["pol"]), True)
expect("P13 un cap de corda no esborra l'arxiu", commit([dele(f"cors/{F}/attArchive/2026-08-01_2026-12-31")], T["pau"]), False)
expect("P13b l'administració sí", commit([dele(f"cors/{F}/attArchive/2026-08-01_2026-12-31")], T["pol"]), True)
import re as _re
_v = _re.search(r"match /reglesVersio/\{v\} \{\s*allow get: if v == '([^']*)'", open(RULES).read()).group(1) if RULES else None
if _v:
    expect("P14 la versió de les regles respon sense sessió (no hi ha el document)", get(f"reglesVersio/{_v}", None), "404")
    expect("P14b una altra versió es denega", get("reglesVersio/000000000000", None), False)

print("Q. Llistes privades i tria de produccions")
CH = {"memberId": "m1", "prods": {"p1": "yes"}, "at": now, "by": "singer@exemple.cat"}
expect("Q1 amb les llistes obertes, el cantaire les llegeix", lst(f"cors/{F}/attendance", T["singer"]), True)
expect("Q1b i les tries de tothom", lst(f"cors/{F}/prodChoice", T["singer"]), True)
expect("Q2 el cantaire diu quines produccions farà", commit([upd(f"cors/{F}/prodChoice/m1", CH)], T["singer"]), True)
expect("Q2b per un altre", commit([upd(f"cors/{F}/prodChoice/m2", {**CH, "memberId": "m2"})], T["singer"]), False)
expect("Q2c amb un camp de més", commit([upd(f"cors/{F}/prodChoice/m1", {**CH, "ok": True})], T["singer"]), False)
expect("Q2d amb un altre memberId", commit([upd(f"cors/{F}/prodChoice/m1", {**CH, "memberId": "m2"})], T["singer"]), False)
expect("Q2e l'equip la canvia per ell", commit([upd(f"cors/{F}/prodChoice/m2", {**CH, "memberId": "m2", "by": "leader@exemple.cat"})], T["leader"]), True)
expect("Q2f el cantaire no l'esborra", commit([dele(f"cors/{F}/prodChoice/m1")], T["singer"]), False)
expect("Q3 el cantaire no escriu la còpia de les seves marques", commit([upd(f"cors/{F}/attMine/m1", {"memberId": "m1", "marks": {"s1": {"s": "P"}}})], T["singer"]), False)
expect("Q3b el cap de corda escriu les de la seva corda", commit([upd(f"cors/{F}/attMine/m2", {"memberId": "m2", "marks": {}})], T["leader"]), True)
expect("Q3c però no les d'una altra corda", commit([upd(f"cors/{F}/attMine/m1", {"memberId": "m1", "marks": {"s1": {"s": "P"}}})], T["leader"]), False)
expect("Q3d la direcció, les de tothom", commit([upd(f"cors/{F}/attMine/m1", {"memberId": "m1", "marks": {"s1": {"s": "P"}}}), upd(f"cors/{F}/attMine/m2", {"memberId": "m2", "marks": {}})], T["dir"]), True)
expect("Q3e la gerència no", commit([upd(f"cors/{F}/attMine/m2", {"memberId": "m2", "marks": {}})], T["ger"]), False)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80, "attPrivate": True})
expect("Q4 amb les llistes privades, el cantaire no les llegeix", lst(f"cors/{F}/attendance", T["singer"]), False)
seed(f"cors/{F}/attendance/s9_S", {"sessionId": "s9", "section": "S", "marks": {"m1": {"s": "P"}}})
expect("Q4b ni una de sola", get(f"cors/{F}/attendance/s9_S", T["singer"]), False)
expect("Q4e però sí la que passa com a substitut", get(f"cors/{F}/attendance/s1_S", T["singer"]), True)
expect("Q4c ni l'arxiu", lst(f"cors/{F}/attArchive", T["singer"]), False)
expect("Q4d el professor de cant tampoc", lst(f"cors/{F}/attendance", T["prof"]), False)
expect("Q5 llegeix la seva còpia", get(f"cors/{F}/attMine/m1", T["singer"]), True)
expect("Q5b no la d'un altre", get(f"cors/{F}/attMine/m2", T["singer"]), False)
expect("Q5c ni totes", lst(f"cors/{F}/attMine", T["singer"]), False)
expect("Q6 un cap de corda no les llegeix totes", lst(f"cors/{F}/attendance", T["leader"]), False)
expect("Q6a però sí les de la seva corda", qry(f"cors/{F}", "attendance", [("section", "EQUAL", "T")], T["leader"]), True)
expect("Q6a2 no les d'una altra", qry(f"cors/{F}", "attendance", [("section", "EQUAL", "S")], T["leader"]), False)
expect("Q6a3 ni una de sola", get(f"cors/{F}/attendance/s9_S", T["leader"]), False)
expect("Q6a4 la direcció les llegeix totes", lst(f"cors/{F}/attendance", T["dir"]), True)
expect("Q6b i l'arxiu", lst(f"cors/{F}/attArchive", T["dir"]), True)
expect("Q6c la direcció llegeix les còpies", lst(f"cors/{F}/attMine", T["dir"]), True)
expect("Q6c2 un cap de corda no", lst(f"cors/{F}/attMine", T["pau"]), False)
expect("Q6c3 ni l'arxiu", lst(f"cors/{F}/attArchive", T["leader"]), False)
expect("Q6d el compte de servei ho llegeix tot", lst(f"cors/{F}/attMine", T["service"]), True)
expect("Q7 el cantaire llegeix la seva tria", get(f"cors/{F}/prodChoice/m1", T["singer"]), True)
expect("Q7b no la d'un altre", get(f"cors/{F}/prodChoice/m2", T["singer"]), False)
expect("Q7c l'equip les llegeix totes", lst(f"cors/{F}/prodChoice", T["leader"]), True)
expect("Q7d el compte de servei també (avisos)", lst(f"cors/{F}/prodChoice", T["service"]), True)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80})

print("R. Arxiu de partitures")
seed(f"cors/{F}/members/m5", {"id": "m5", "name": "Arxivera Soprano", "section": "S"})
seed(f"cors/{F}/staff/arx@exemple.cat", {"email": "arx@exemple.cat", "role": "archive", "roles": ["archive", "singer"], "section": "S", "memberId": "m5"})
T["arx"] = token("uid-arx", "arx@exemple.cat")
SC = lambda sec, mid: {"prodId": "p1", "workId": "w1", "section": sec, "marks": {mid: {"s": "given", "at": now, "by": "arx@exemple.cat"}}}
expect("R1 l'arxiver reparteix a la seva corda", commit([upd(f"cors/{F}/scores/p1_w1_S", SC("S", "m1"))], T["arx"]), True)
expect("R1b i ho torna a canviar", commit([upd(f"cors/{F}/scores/p1_w1_S", {**SC("S", "m1"), "marks": {"m1": {"s": "returned", "at": now, "by": "arx@exemple.cat"}}})], T["arx"]), True)
expect("R2 també reparteix a una altra corda", commit([upd(f"cors/{F}/scores/p1_w1_T", SC("T", "m2"))], T["arx"]), True)
expect("R2a i ho torna a canviar", commit([upd(f"cors/{F}/scores/p1_w1_T", {**SC("T", "m2"), "marks": {"m2": {"s": "returned", "at": now, "by": "arx@exemple.cat"}}})], T["arx"]), True)
expect("R2b però no canvia de quina corda és un document", commit([upd(f"cors/{F}/scores/p1_w1_S", SC("T", "m2"))], T["arx"]), False)
expect("R2c no l'esborra", commit([dele(f"cors/{F}/scores/p1_w1_S")], T["arx"]), False)
expect("R3 un cantaire no hi escriu", commit([upd(f"cors/{F}/scores/p1_w1_S", SC("S", "m1"))], T["singer"]), False)
expect("R3b però ho llegeix (hi veu la seva)", lst(f"cors/{F}/scores", T["singer"]), True)
expect("R4 un cap de corda no reparteix partitures", commit([upd(f"cors/{F}/scores/p1_w1_T", SC("T", "m2"))], T["leader"]), False)
expect("R4b la direcció també", commit([upd(f"cors/{F}/scores/p1_w1_B", SC("B", "m3"))], T["dir"]), True)
expect("R5 l'arxiver no passa llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "S", "marks": {"m1": {"s": "P"}}})], T["arx"]), False)
expect("R5b l'arxiver d'una altra agrupació no hi entra", lst(f"cors/{F}/scores", T["orq"]), False)
expect("R6 el compte de servei ho llegeix (còpies)", lst(f"cors/{F}/scores", T["service"]), True)
KIT = lambda sec, **kw: {"section": sec, "codes": {"m1": "S1"}, "prod": {"p1": {"m9": "R1"}}, "folder": {"m1": {"s": "yes", "at": now, "by": "arx@exemple.cat"}}, "label": {}, "updatedAt": now, "by": "arx@exemple.cat", **kw}
expect("R8 l'arxiver porta els codis i les carpetes de la seva corda", commit([upd(f"cors/{F}/kit/S", KIT("S"))], T["arx"]), True)
expect("R8b i de les altres", commit([upd(f"cors/{F}/kit/T", KIT("T"))], T["arx"]), True)
expect("R8c però el document és de la corda que diu el seu nom", commit([upd(f"cors/{F}/kit/B", KIT("S"))], T["arx"]), False)
expect("R8d i no s'hi posa res més", commit([upd(f"cors/{F}/kit/S", KIT("S", extra=1))], T["arx"]), False)
expect("R8e l'arxiver no l'esborra", commit([dele(f"cors/{F}/kit/S")], T["arx"]), False)
expect("R8f un cap de corda no ho porta", commit([upd(f"cors/{F}/kit/C", KIT("C"))], T["leader"]), False)
expect("R8f2 qui porta les produccions sí (els codis dels reforços)", commit([upd(f"cors/{F}/kit/C", KIT("C"))], T["dir"]), True)
expect("R8g el cantaire no hi escriu", commit([upd(f"cors/{F}/kit/S", KIT("S"))], T["singer"]), False)
expect("R8h ni ho llegeix", lst(f"cors/{F}/kit", T["singer"]), False)
expect("R8i l'arxiver ho llegeix", lst(f"cors/{F}/kit", T["arx"]), True)
expect("R8j el compte de servei també (còpies)", lst(f"cors/{F}/kit", T["service"]), True)
expect("R8k el d'una altra agrupació, no", lst(f"cors/{F}/kit", T["orq"]), False)
expect("R7 l'arxiver escriu un missatge a la seva corda", commit([upd(f"cors/{F}/messages/r7", {**MSG, "id": "r7", "to": ["S"], "by": "arx@exemple.cat"})], T["arx"]), True)
expect("R7b no a una altra corda", commit([upd(f"cors/{F}/messages/r7b", {**MSG, "id": "r7b", "to": ["T"], "by": "arx@exemple.cat"})], T["arx"]), False)
expect("R7c ni a tothom", commit([upd(f"cors/{F}/messages/r7c", {**MSG, "id": "r7c", "to": ["*"], "by": "arx@exemple.cat"})], T["arx"]), False)
expect("R7d esborra el seu", commit([dele(f"cors/{F}/messages/r7")], T["arx"]), True)
expect("R8 l'arxiver escriu a una soprano", commit([upd(f"cors/{F}/threads/r8", TS("r8", "m1", "S", "arx@exemple.cat"))], T["arx"]), True)
expect("R8b no a un tenor", commit([upd(f"cors/{F}/threads/r8b", TS("r8b", "m2", "T", "arx@exemple.cat"))], T["arx"]), False)
# Els arxivers també porten el repertori: obres, fitxers i els altres materials de cada producció (només això).
expect("R9 l'arxiver afegeix una obra", commit([upd(f"cors/{F}/works/wa", {"id": "wa", "title": "Magnificat", "materials": []})], T["arx"]), True)
expect("R9b l'edita (solos, partitures i àudios)", commit([upd(f"cors/{F}/works/wa", {"roles": [{"id": "r1", "name": "Solo", "memberIds": ["m1"]}], "materials": [{"id": "mt1", "kind": "audio", "title": "Àudio"}]}, ["roles", "materials"])], T["arx"]), True)
expect("R9c puja un fitxer a trossos", commit([upd(f"cors/{F}/config/fitxer_fa1b2_0", {"i": 0, "of": 1})], T["arx"]), True)
expect("R9d i l'esborra", commit([dele(f"cors/{F}/config/fitxer_fa1b2_0")], T["arx"]), True)
expect("R9e esborra l'obra", commit([dele(f"cors/{F}/works/wa")], T["arx"]), True)
expect("R9f i avisa els mòbils que tornin a baixar el repertori", commit([upd(f"cors/{F}/config/main", {"syncEpoch": {"works": "abc"}}, ["syncEpoch"])], T["arx"]), True)
expect("R9g però no toca la resta de la configuració", commit([upd(f"cors/{F}/config/main", {"minAttendance": 50}, ["minAttendance"])], T["arx"]), False)
expect("R9h ni altres documents de config", commit([upd(f"cors/{F}/config/altre", {"x": 1})], T["arx"]), False)
expect("R9i canvia els altres materials d'una producció", commit([upd(f"cors/{F}/productions/p1", {"materials": [{"id": "mt2", "kind": "partitura", "title": "Programa"}]}, ["materials"])], T["arx"]), True)
expect("R9j però no les sessions", commit([upd(f"cors/{F}/productions/p1", {"sessions": []}, ["sessions"])], T["arx"]), False)
expect("R9k ni qui la fa", commit([upd(f"cors/{F}/productions/p1", {"excluded": ["m1"]}, ["excluded"])], T["arx"]), False)
expect("R9l ni crea produccions", commit([upd(f"cors/{F}/productions/pz", {"id": "pz", "name": "X", "materials": []})], T["arx"]), False)
expect("R9m un cantaire no toca els materials", commit([upd(f"cors/{F}/productions/p1", {"materials": []}, ["materials"])], T["singer"]), False)
expect("R9n ni puja fitxers", commit([upd(f"cors/{F}/config/fitxer_fz_0", {"i": 0})], T["singer"]), False)
expect("R9o ni avisa els mòbils", commit([upd(f"cors/{F}/config/main", {"syncEpoch": {"works": "x"}}, ["syncEpoch"])], T["singer"]), False)

print("T. Absències: el cap de corda, només les de la seva corda")
seed(f"cors/{F}/absences/ab1", {"id": "ab1", "memberId": "m1", "section": "S", "uid": "uid-singer", "status": "pending", "sessionIds": ["s1"]})
seed(f"cors/{F}/absences/ab2", {"id": "ab2", "memberId": "m2", "section": "T", "uid": "uid-x", "status": "pending", "sessionIds": ["s1"]})
expect("T1 el cap de corda llegeix les de la seva corda", qry(f"cors/{F}", "absences", [("section", "EQUAL", "T")], T["leader"]), True)
expect("T1b no les d'una altra", qry(f"cors/{F}", "absences", [("section", "EQUAL", "S")], T["leader"]), False)
expect("T1c ni totes", lst(f"cors/{F}/absences", T["leader"]), False)
expect("T2 en respon una de la seva corda", commit([upd(f"cors/{F}/absences/ab2", {"status": "accepted"}, ["status"])], T["leader"]), True)
expect("T2b però no d'una altra", commit([upd(f"cors/{F}/absences/ab1", {"status": "accepted"}, ["status"])], T["leader"]), False)
expect("T2c ni li canvia la corda", commit([upd(f"cors/{F}/absences/ab2", {"section": "S"}, ["section"])], T["leader"]), False)
expect("T3 la direcció les llegeix totes", lst(f"cors/{F}/absences", T["dir"]), True)
expect("T3b i en respon qualsevol", commit([upd(f"cors/{F}/absences/ab1", {"status": "accepted"}, ["status"])], T["dir"]), True)
expect("T4 el cantaire llegeix la seva", get(f"cors/{F}/absences/ab1", T["singer"]), True)

print("S. El tauler no és dels caps de corda")
expect("S1 un cap de corda no publica un anunci", commit([upd(f"cors/{F}/announcements/s1", {"id": "s1", "title": "Hola"})], T["pau"]), False)
expect("S1b ni una enquesta", commit([upd(f"cors/{F}/polls/s1", {"id": "s1", "title": "Q"})], T["pau"]), False)
expect("S1c ni una sortida", commit([upd(f"cors/{F}/trips/s1", {"id": "s1", "title": "Gira"})], T["pau"]), False)
expect("S1d ni una obra del repertori", commit([upd(f"cors/{F}/works/s1", {"id": "s1", "title": "Gloria"})], T["pau"]), False)
expect("S1e ni puja un fitxer", commit([upd(f"cors/{F}/config/fitxer_s1_0", {"i": 0})], T["pau"]), False)
expect("S1f ni canvia els documents", commit([upd(f"cors/{F}/config/main", {"documents": [{"id": "d1", "title": "Normativa"}]}, ["documents"])], T["pau"]), False)
expect("S1g ni els materials d'una producció", commit([upd(f"cors/{F}/productions/p1", {"materials": [{"id": "x", "title": "Programa"}]}, ["materials"])], T["pau"]), False)
expect("S1h ni posa el transport d'una sortida", commit([upd(f"cors/{F}/tripSignups/t1_m1", {"tripId": "t1", "memberId": "m1", "answer": "yes", "transport": "bus"})], T["pau"]), False)
expect("S1i ni esborra un anunci", commit([dele(f"cors/{F}/announcements/n1")], T["pau"]), False)
expect("S2 però continua marcant qui no fa una producció", commit([upd(f"cors/{F}/productions/p1", {"excluded": ["m2"]}, ["excluded"])], T["pau"]), True)
expect("S2b però ja no canvia la norma", commit([upd(f"cors/{F}/config/main", {"minAttendance": 81}, ["minAttendance"])], T["pau"]), False)
expect("S2c i vota la seva enquesta", commit([upd(f"cors/{F}/polls/s3", {"id": "s3", "title": "Q"})], T["dir"]) == 200 and commit([upd(f"cors/{F}/pollVotes/s3_m3", {"pollId": "s3", "memberId": "m3", "choices": ["a"]})], T["pau"]), True)
expect("S3 la direcció sí que hi publica", commit([upd(f"cors/{F}/announcements/s3", {"id": "s3", "title": "Hola"})], T["dir"]), True)
expect("S3b i hi canvia els documents", commit([upd(f"cors/{F}/config/main", {"documents": []}, ["documents"])], T["dir"]), True)
expect("S3c i els materials", commit([upd(f"cors/{F}/productions/p1", {"materials": []}, ["materials"])], T["dir"]), True)
expect("S3d la secretaria, també", commit([upd(f"cors/{F}/trips/s3", {"id": "s3", "title": "Gira"})], T["sec"]), True)

print("V. Vestidor")
WD = lambda mid, st="demanat", **k: {"id": k.pop("id", "wd1"), "memberId": mid, "memberName": "Cantaire U", "section": "S", "item": "americana", "size": "48", "status": st, "note": "",
                                     "history": [{"s": st, "at": now, "by": "singer@exemple.cat"}], "createdAt": now, "updatedAt": now, "by": "singer@exemple.cat", **k}
expect("V1 la cantaire demana la seva peça", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1"))], T["singer"]), True)
expect("V1b i la llegeix", get(f"cors/{F}/wardrobe/wd1", T["singer"]), True)
expect("V1c en canvia la talla mentre està demanada", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", size="50"))], T["singer"]), True)
expect("V1d però no la peça", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", item="estola"))], T["singer"]), False)
expect("V2 no la demana per a una altra persona", commit([upd(f"cors/{F}/wardrobe/wd2", WD("m2", id="wd2"))], T["singer"]), False)
expect("V2b ni ja entregada", commit([upd(f"cors/{F}/wardrobe/wd3", WD("m1", "entregat", id="wd3"))], T["singer"]), False)
expect("V2c ni amb camps de més", commit([upd(f"cors/{F}/wardrobe/wd4", WD("m1", id="wd4", paid=True))], T["singer"]), False)
expect("V2d ni amb una nota massa llarga", commit([upd(f"cors/{F}/wardrobe/wd4", WD("m1", id="wd4", note="x" * 301))], T["singer"]), False)
expect("V2e no se la marca com a entregada", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", "entregat"))], T["singer"]), False)
expect("V3 la secretaria ho veu tot", lst(f"cors/{F}/wardrobe", T["sec"]), True)
expect("V3b i l'encarrega", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", "encarregat"))], T["sec"]), True)
expect("V3c un cop encarregada, la cantaire ja no la toca", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", "encarregat", size="52"))], T["singer"]), False)
expect("V3d ni l'anul·la", commit([dele(f"cors/{F}/wardrobe/wd1")], T["singer"]), False)
expect("V3e la gerència també el porta", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", "emprovar"))], T["ger"]), True)
expect("V3f i l'administració hi afegeix una peça a algú", commit([upd(f"cors/{F}/wardrobe/wd6", WD("m2", "entregat", id="wd6"))], T["pol"]), True)
expect("V4 un cap de corda no veu el de tothom", lst(f"cors/{F}/wardrobe", T["pau"]), False)
expect("V4b ni la direcció", lst(f"cors/{F}/wardrobe", T["dir"]), False)
expect("V4c ni un altre cantaire la d'algú", get(f"cors/{F}/wardrobe/wd1", T["pau"]), False)
expect("V4d ni el cap de corda la canvia", commit([upd(f"cors/{F}/wardrobe/wd1", WD("m1", "entregat"))], T["leader"]), False)
expect("V5 la cantaire veu les seves amb una consulta", qry(f"cors/{F}", "wardrobe", [("memberId", "EQUAL", "m1")], T["singer"]), True)
expect("V5b però no les de tothom", lst(f"cors/{F}/wardrobe", T["singer"]), False)
expect("V6 una de nova, demanada", commit([upd(f"cors/{F}/wardrobe/wd5", WD("m1", id="wd5", item="estola", size="M"))], T["singer"]), True)
expect("V6b l'anul·la mentre està demanada", commit([dele(f"cors/{F}/wardrobe/wd5")], T["singer"]), True)
expect("V7 les còpies de seguretat el llegeixen", lst(f"cors/{F}/wardrobe", T["service"]), True)

print("W. Fitxes privades")
PRIV = {"memberId": "m2", "phone": "600000000", "leaves": [{"from": "2026-10-01", "to": "2026-10-20", "note": "Operació"}]}
expect("W1 qui porta les persones desa la part privada d'una fitxa", commit([upd(f"cors/{F}/memberPriv/m2", PRIV)], T["sec"]), True)
expect("W1a un cap de corda no", commit([upd(f"cors/{F}/memberPriv/m2", PRIV)], T["leader"]), False)
expect("W1b la cantaire no l'escriu", commit([upd(f"cors/{F}/memberPriv/m1", {"memberId": "m1", "phone": "1"})], T["singer"]), False)
seed(f"cors/{F}/memberPriv/m1", {"memberId": "m1", "phone": "611111111"})
expect("W2 sense llistes privades, la veu tothom (com la fitxa)", get(f"cors/{F}/memberPriv/m2", T["singer"]), True)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80, "attPrivate": True})
expect("W3 amb les llistes privades, la cantaire no veu la dels altres", get(f"cors/{F}/memberPriv/m2", T["singer"]), False)
expect("W3b ni totes", lst(f"cors/{F}/memberPriv", T["singer"]), False)
expect("W3c però sí la seva", get(f"cors/{F}/memberPriv/m1", T["singer"]), True)
expect("W3d un cap de corda no les veu totes", lst(f"cors/{F}/memberPriv", T["pau"]), False)
expect("W3d2 ni la d'una persona de la seva corda", get(f"cors/{F}/memberPriv/m2", T["leader"]), False)
expect("W3d3 qui porta les persones, sí", lst(f"cors/{F}/memberPriv", T["sec"]), True)
expect("W3e i els avisos (compte de servei)", lst(f"cors/{F}/memberPriv", T["service"]), True)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80})

print("X. Missatges a qui fa una producció")
PM = {**MSG, "id": "pm1", "to": ["p:p1"], "prod": "p1", "secs": [], "members": ["m1"], "by": "sec@exemple.cat"}
expect("X1 la secretaria escriu a qui fa una producció", commit([upd(f"cors/{F}/messages/pm1", PM)], T["sec"]), True)
expect("X1b qui la fa el llegeix", get(f"cors/{F}/messages/pm1", T["singer"]), True)
expect("X1c i el troba amb la seva consulta", qry(f"cors/{F}", "messages", [("members", "ARRAY_CONTAINS", "m1")], T["singer"]), True)
expect("X2 qui no la fa no el llegeix", get(f"cors/{F}/messages/pm1", T["arx"]), False)
expect("X2b ni el busca amb el nom d'un altre", qry(f"cors/{F}", "messages", [("members", "ARRAY_CONTAINS", "m1")], T["arx"]), False)
expect("X3 un cap de corda no hi escriu", commit([upd(f"cors/{F}/messages/pm2", {**PM, "id": "pm2", "by": "leader@exemple.cat", "to": ["T"]})], T["leader"]), False)
expect("X3b ni amb una llista massa llarga", commit([upd(f"cors/{F}/messages/pm3", {**PM, "id": "pm3", "members": [f"m{i}" for i in range(401)]})], T["sec"]), False)

print("Y. Quanta gent ha vist un anunci (per cordes, sense noms)")
seed(f"cors/{F}/announcements/a1", {"id": "a1", "title": "Assaig al Petit Palau", "by": "sec@exemple.cat", "createdAt": now})


def seen(aid, uid, sec, *, by=True, n=None):
    """El lot que envia l'app: annSeen/<anunci>/by/<uid> i +1 a la corda (amb increment, o amb un valor fix si n)."""
    w = [upd(f"cors/{F}/annSeen/{aid}/by/{uid}", {"at": now})] if by else []
    if n is None:
        w.append({"update": {"name": f"{ROOT}/cors/{F}/annSeen/{aid}", "fields": {}}, "updateMask": {"fieldPaths": []},
                  "updateTransforms": [{"fieldPath": sec, "increment": {"integerValue": "1"}}]})
    else:
        w.append(upd(f"cors/{F}/annSeen/{aid}", {sec: n}, [sec]))
    return w


expect("Y1 una cantaire compta que l'ha vist (a la seva corda)", commit(seen("a1", "uid-singer", "S"), T["singer"]), True)
expect("Y2 l'equip veu els comptes", get(f"cors/{F}/annSeen/a1", T["pau"]), True)
expect("Y3 la cantaire no els veu", get(f"cors/{F}/annSeen/a1", T["singer"]), False)
expect("Y4 la mateixa persona no compta dos cops", commit(seen("a1", "uid-singer", "S"), T["singer"]), False)
expect("Y5 ningú no suma a una altra corda", commit(seen("a1", "uid-pau", "S"), T["pau"]), False)
expect("Y6 un cap de corda compta a la seva", commit(seen("a1", "uid-pau", "B"), T["pau"]), True)
expect("Y7 sense deixar-ne constància no compta", commit(seen("a1", "uid-pol", "T", by=False), T["pol"]), False)
expect("Y8 no es pot sumar més d'un", commit(seen("a1", "uid-pol", "T", n=2), T["pol"]), False)
expect("Y8b ni deixar-ne constància a nom d'un altre", commit(seen("a1", "uid-singer", "T"), T["pol"]), False)
expect("Y9 qui no és a la plantilla no compta", commit(seen("a1", "uid-dir", "T"), T["dir"]), False)
expect("Y10 un anunci que no existeix", commit(seen("a404", "uid-pol", "T"), T["pol"]), False)
expect("Y11 l'admin compta a la seva corda", commit(seen("a1", "uid-pol", "T"), T["pol"]), True)
expect("Y12 cadascú veu la seva constància", get(f"cors/{F}/annSeen/a1/by/uid-singer", T["singer"]), True)
expect("Y12b però ningú més, ni l'equip", get(f"cors/{F}/annSeen/a1/by/uid-singer", T["pau"]), False)
expect("Y12c ni en pot fer la llista", lst(f"cors/{F}/annSeen/a1/by", T["pol"]), False)
code, body = req("GET", f"{BASE}/cors/{F}/annSeen/a1", tok=OWNER)
got = {k: int(v.get("integerValue", 0)) for k, v in (body.get("fields") or {}).items()} if code == 200 else {}
expect(f"Y13 els comptes són S 1 · B 1 · T 1 ({got})", 200 if got == {"S": 1, "B": 1, "T": 1} else 403, True)

print("Z. Entrar amb l'enllaç del cor")
JC = "enllacdelcor2026"
JOIN = {"active": True, "name": "Cor Jove", "secs": [{"id": "S", "name": "Sopranos"}], "people": [{"id": "m2", "n": "Cantaire Dos", "sec": "T"}], "at": now, "by": "pol@exemple.cat"}
REQ = {"email": "fresc@exemple.cat", "name": "Cantaire Dos", "account": "Nil Nou", "memberId": "m2", "section": "T", "code": JC, "at": now}
expect("Z1 l'administració fa l'enllaç", commit([upd(f"cors/{F}/join/{JC}", JOIN)], T["pol"]), True)
expect("Z1b un cap de corda no", commit([upd(f"cors/{F}/join/altrecodi12345", JOIN)], T["pau"]), False)
expect("Z2 qui té l'enllaç en llegeix la llista", get(f"cors/{F}/join/{JC}", T["fresh"]), True)
expect("Z3 però no pot fer la llista dels enllaços", lst(f"cors/{F}/join", T["fresh"]), False)
expect("Z4 i demana l'accés amb el seu correu", commit([upd(f"cors/{F}/joinReq/fresc@exemple.cat", REQ)], T["fresh"]), True)
expect("Z5 no a nom d'un altre correu", commit([upd(f"cors/{F}/joinReq/dir@exemple.cat", {**REQ, "email": "dir@exemple.cat"})], T["fresh"]), False)
expect("Z6 ni amb un codi que no existeix", commit([upd(f"cors/{F}/joinReq/fresc@exemple.cat", {**REQ, "code": "noexisteix123456"})], T["fresh"]), False)
expect("Z7 qui ja té accés no en demana", commit([upd(f"cors/{F}/joinReq/singer@exemple.cat", {**REQ, "email": "singer@exemple.cat"})], T["singer"]), False)
expect("Z8 ni amb camps de més", commit([upd(f"cors/{F}/joinReq/fresc@exemple.cat", {**REQ, "roles": ["admin"]})], T["fresh"]), False)
expect("Z9 l'administració veu les peticions", lst(f"cors/{F}/joinReq", T["pol"]), True)
expect("Z9b la persona veu la seva", get(f"cors/{F}/joinReq/fresc@exemple.cat", T["fresh"]), True)
expect("Z9c un cantaire no veu la dels altres", get(f"cors/{F}/joinReq/fresc@exemple.cat", T["singer"]), False)
expect("Z10 l'administració el desactiva", commit([upd(f"cors/{F}/join/{JC}", {"active": False}, ["active"])], T["pol"]), True)
expect("Z10b i ja no es pot llegir", get(f"cors/{F}/join/{JC}", T["fresh"]), False)
expect("Z10c ni demanar-hi accés", commit([upd(f"cors/{F}/joinReq/fresc@exemple.cat", REQ)], T["fresh"]), False)
expect("Z11 l'administració hi dona accés (crea el compte i esborra la petició)", commit([
    upd(f"cors/{F}/staff/fresc@exemple.cat", {"email": "fresc@exemple.cat", "name": "Cantaire Dos", "role": "singer", "roles": ["singer"], "memberId": "m2", "addedAt": now, "via": "enllaç"}),
    upd(f"staffIndex/fresc@exemple.cat/agrupacions/{F}", {"at": now, "name": "Cor Jove"}),
    dele(f"cors/{F}/joinReq/fresc@exemple.cat")], T["pol"]), True)
expect("Z12 i la persona veu que ja té compte", get(f"cors/{F}/staff/fresc@exemple.cat", T["fresh"]), True)
expect("Z13 un cantaire no pot fer-se un compte sol", commit([upd(f"cors/{F}/staff/trampa2@exemple.cat", {"email": "trampa2@exemple.cat", "role": "admin", "roles": ["admin"]})], T["singer"]), False)

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

print("AA. Cada rol, només el que li toca")
import datetime
seed(f"cors/{F}/staff/prof2@exemple.cat", {"email": "prof2@exemple.cat", "roles": ["voice"], "role": "voice"})
T["prof2"] = token("uid-prof2", "prof2@exemple.cat")
# Els Ajustos: l'administració, la direcció i la gerència. La secretaria, els documents i els rols de l'equip.
expect("AA1 un cap de corda no apaga les llistes privades", commit([upd(f"cors/{F}/config/main", {"attPrivate": False}, ["attPrivate"])], T["leader"]), False)
expect("AA1b ni publica el calendari", commit([upd(f"cors/{F}/config/main", {"icsOn": True}, ["icsOn"])], T["pau"]), False)
expect("AA1c però avisa els mòbils que tornin a baixar una col·lecció", commit([upd(f"cors/{F}/config/main", {"syncEpoch": {"announcements": "x1"}}, ["syncEpoch"])], T["leader"]), True)
expect("AA1d la secretaria hi desa els documents", commit([upd(f"cors/{F}/config/main", {"documents": []}, ["documents"])], T["sec"]), True)
expect("AA1e i els rols de l'equip", commit([upd(f"cors/{F}/config/main", {"teamRoles": ["secretaria"]}, ["teamRoles"])], T["sec"]), True)
expect("AA1f però no les llistes privades", commit([upd(f"cors/{F}/config/main", {"attPrivate": True}, ["attPrivate"])], T["sec"]), False)
expect("AA1g la gerència canvia la norma", commit([upd(f"cors/{F}/config/main", {"minAttendance": 80}, ["minAttendance"])], T["ger"]), True)
expect("AA1h la direcció també", commit([upd(f"cors/{F}/config/main", {"minAttendance": 80}, ["minAttendance"])], T["dir"]), True)
expect("AA1i el professorat no", commit([upd(f"cors/{F}/config/main", {"minAttendance": 70}, ["minAttendance"])], T["prof"]), False)
# La plantilla: qui porta les persones.
expect("AA2 un cap de corda no canvia una fitxa de la plantilla", commit([upd(f"cors/{F}/members/m2", {"name": "Cantaire Dos", "section": "S"}, ["name", "section"])], T["leader"]), False)
expect("AA2b ni l'esborra", commit([dele(f"cors/{F}/members/m1")], T["pau"]), False)
expect("AA2c la secretaria sí", commit([upd(f"cors/{F}/members/m9", {"id": "m9", "name": "Nova", "section": "S"})], T["sec"]), True)
expect("AA2d la direcció també", commit([dele(f"cors/{F}/members/m9")], T["dir"]), True)
# Les produccions i les sessions.
expect("AA3 un cap de corda no crea produccions", commit([upd(f"cors/{F}/productions/pq", {"id": "pq", "name": "X", "sessions": []})], T["leader"]), False)
expect("AA3b ni canvia les sessions", commit([upd(f"cors/{F}/productions/p1", {"sessions": []}, ["sessions"])], T["leader"]), False)
expect("AA3c ni n'esborra cap", commit([dele(f"cors/{F}/productions/p1")], T["pau"]), False)
expect("AA3d tria qui passa llista en funcions de la seva corda", commit([upd(f"cors/{F}/productions/p1", {"roll": {"T": "m2"}}, ["roll"])], T["leader"]), True)
expect("AA3e però no d'una altra corda", commit([upd(f"cors/{F}/productions/p1", {"roll": {"T": "m2", "S": "m1"}}, ["roll"])], T["leader"]), False)
expect("AA3f la gerència crea una producció", commit([upd(f"cors/{F}/productions/pq", {"id": "pq", "name": "X", "sessions": [{"id": "sq", "date": "2026-11-01"}]})], T["ger"]), True)
expect("AA3g i l'esborra", commit([dele(f"cors/{F}/productions/pq")], T["ger"]), True)
expect("AA3h la secretaria no en crea", commit([upd(f"cors/{F}/productions/pq2", {"id": "pq2", "name": "X"})], T["sec"]), False)
expect("AA3i però hi canvia els altres materials (és del tauler)", commit([upd(f"cors/{F}/productions/p1", {"materials": []}, ["materials"])], T["sec"]), True)
# Els substituts: de la seva corda, per a una sessió i que caduquin.
UNTIL = int(datetime.datetime(2026, 9, 21, 12, tzinfo=datetime.timezone.utc).timestamp() * 1000)
SUB = lambda sec, mid, **k: {"sessionId": "s1", "section": sec, "memberId": mid, "date": "2026-09-20", "until": UNTIL, "by": "x", **k}
expect("AA4 el cap de corda tria un substitut de la seva corda", commit([upd(f"cors/{F}/subs/s1_T", SUB("T", "m2"))], T["leader"]), True)
expect("AA4b no d'una altra corda (ni s'hi posa ell)", commit([upd(f"cors/{F}/subs/s1_B", SUB("B", "m4"))], T["leader"]), False)
expect("AA4c ni amb el nom d'una altra corda", commit([upd(f"cors/{F}/subs/s1_S", SUB("T", "m2"))], T["leader"]), False)
expect("AA4d ni per sempre", commit([upd(f"cors/{F}/subs/s1_T", SUB("T", "m2", until=UNTIL + 30 * 86400000))], T["leader"]), False)
expect("AA4e ni sense data", commit([upd(f"cors/{F}/subs/s2_T", {"sessionId": "s2", "section": "T", "memberId": "m2", "until": UNTIL})], T["leader"]), False)
expect("AA4f la direcció, de qualsevol corda", commit([upd(f"cors/{F}/subs/s1_B", SUB("B", "m3"))], T["dir"]), True)
expect("AA4g la secretaria no", commit([upd(f"cors/{F}/subs/s1_C", SUB("C", "m1"))], T["sec"]), False)
expect("AA4h el cap de corda no esborra el d'una altra corda", commit([dele(f"cors/{F}/subs/s1_B")], T["leader"]), False)
expect("AA4i sí el de la seva", commit([dele(f"cors/{F}/subs/s1_T")], T["leader"]), True)
# Les llistes: una per sessió i corda.
expect("AA5 una llista amb el nom d'una altra corda", commit([upd(f"cors/{F}/attendance/s5_S", {"sessionId": "s5", "section": "T", "marks": {}})], T["leader"]), False)
expect("AA5b el substitut no canvia la corda de la llista", commit([upd(f"cors/{F}/attendance/s1_S", {"sessionId": "s1", "section": "T", "marks": {}})], T["singer"]), False)
expect("AA5c la gerència les llegeix totes", lst(f"cors/{F}/attendance", T["ger"]), True)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80, "attPrivate": True})
expect("AA5d amb les llistes privades, la secretaria no les llegeix", lst(f"cors/{F}/attendance", T["sec"]), False)
expect("AA5e ni l'arxiu", lst(f"cors/{F}/attArchive", T["sec"]), False)
expect("AA5f la gerència sí", lst(f"cors/{F}/attArchive", T["ger"]), True)
AR2 = {**ARCH, "from": "2027-01-01", "to": "2027-03-31"}
expect("AA5g la gerència no arxiva", commit([upd(f"cors/{F}/attArchive/2027-01-01_2027-03-31", AR2)], T["ger"]), False)
expect("AA5h la direcció sí", commit([upd(f"cors/{F}/attArchive/2027-01-01_2027-03-31", AR2)], T["dir"]), True)
seed(f"cors/{F}/config/main", {"name": "Cor Jove", "alertFNJ": 3, "minAttendance": 80})
# Les absències.
expect("AA6 la gerència veu totes les absències", lst(f"cors/{F}/absences", T["ger"]), True)
expect("AA6b però no les respon", commit([upd(f"cors/{F}/absences/ab1", {"status": "rejected"}, ["status"])], T["ger"]), False)
expect("AA6c la secretaria no les veu", lst(f"cors/{F}/absences", T["sec"]), False)
# Les dades personals, només per a qui les necessita.
expect("AA7 un cap de corda no veu els aparells amb avisos", lst(f"cors/{F}/push", T["leader"]), False)
expect("AA7b ni un de sol", get(f"cors/{F}/push/dev1", T["pau"]), False)
expect("AA7c la secretaria sí (Qui ha entrat)", lst(f"cors/{F}/push", T["sec"]), True)
expect("AA7d cadascú el seu", get(f"cors/{F}/push/dev1", T["singer"]), True)
expect("AA7e un cap de corda no esborra el d'un altre", commit([dele(f"cors/{F}/push/dev1")], T["pau"]), False)
expect("AA7f la direcció veu les fitxes de l'equip (Personal)", lst(f"cors/{F}/staff", T["dir"]), True)
expect("AA7g la secretaria també", lst(f"cors/{F}/staff", T["sec"]), True)
expect("AA7h un cap de corda no veu les inscripcions de tothom", lst(f"cors/{F}/tripSignups", T["leader"]), False)
expect("AA7i ni els vots de tothom", lst(f"cors/{F}/pollVotes", T["leader"]), False)
expect("AA7j qui porta el tauler, sí", lst(f"cors/{F}/pollVotes", T["sec"]), True)
expect("AA7k el cap de corda veu el seu vot", get(f"cors/{F}/pollVotes/q1_m3", T["pau"]), True)
expect("AA7l un cap de corda no veu les peticions de classe", lst(f"cors/{F}/classReq", T["leader"]), False)
expect("AA7m ni la direcció", lst(f"cors/{F}/classReq", T["dir"]), False)
expect("AA7n un cap de corda no veu les fitxes personals", qry(f"cors/{F}", "profiles", [("memberId", "EQUAL", "m2")], T["leader"]), False)
# El professorat, només els seus alumnes.
expect("AA8 un altre professor no llegeix la nota d'un alumne que no és seu", get(f"cors/{F}/classNotes/c1_s1", T["prof2"]), False)
expect("AA8b el professor troba les seves notes", qry(f"cors/{F}", "classNotes", [("teacher", "EQUAL", "prof@exemple.cat")], T["prof"]), True)
expect("AA8c però no les pot llistar totes", lst(f"cors/{F}/classNotes", T["prof"]), False)
expect("AA8d ni les d'un altre professor", qry(f"cors/{F}", "classNotes", [("teacher", "EQUAL", "prof@exemple.cat")], T["prof2"]), False)
expect("AA8e l'administració les llista totes", lst(f"cors/{F}/classNotes", T["pol"]), True)
expect("AA8f un altre professor no llegeix la fitxa de l'alumne", get(f"cors/{F}/students/m1", T["prof2"]), False)
expect("AA8g ni l'enregistrament", get(f"cors/{F}/classFiles/f1_0", T["prof2"]), False)
expect("AA8h el seu professor sí", get(f"cors/{F}/classFiles/f1_0", T["prof"]), True)
expect("AA8i un altre professor no escriu la nota", commit([upd(f"cors/{F}/classNotes/c1_s1", {"text": "X"}, ["text"])], T["prof2"]), False)
expect("AA8j ni se la fa seva", commit([upd(f"cors/{F}/classNotes/c1_s1", {"teacher": "prof2@exemple.cat"}, ["teacher"])], T["prof2"]), False)
expect("AA8k ni es posa a la fitxa de l'alumne", commit([upd(f"cors/{F}/students/m1", {"teachers": ["prof@exemple.cat", "prof2@exemple.cat"]}, ["teachers"])], T["prof2"]), False)
# El calendari personal: la clau, només de cadascú.
expect("AA9 el cantaire es fa la clau del seu calendari", commit([upd(f"cors/{F}/calKeys/m1", {"memberId": "m1", "token": "K" * 32, "at": now})], T["singer"]), True)
expect("AA9b no la d'un altre", commit([upd(f"cors/{F}/calKeys/m2", {"memberId": "m2", "token": "K" * 32, "at": now})], T["singer"]), False)
expect("AA9c ni la llegeix", get(f"cors/{F}/calKeys/m2", T["singer"]), False)
expect("AA9d ni l'equip", get(f"cors/{F}/calKeys/m1", T["dir"]), False)
expect("AA9e massa curta", commit([upd(f"cors/{F}/calKeys/m1", {"memberId": "m1", "token": "curta", "at": now})], T["singer"]), False)
expect("AA9f el compte de servei les llegeix", lst(f"cors/{F}/calKeys", T["service"]), True)
# El registre d'errors, només des d'una agrupació.
expect("AA10 un compte anònim no deixa notes d'error", commit([upd("errors/aa1", ERR)], T["anon"]), False)
expect("AA10b ni un compte que no és de l'agrupació", commit([upd("errors/aa2", ERR)], T["orq"]), False)
expect("AA10c ni sense dir de quina agrupació", commit([upd("errors/aa3", {**ERR, "gid": ""})], T["singer"]), False)

print("AB. Bandes: quanta gent ha votat (per cordes, sense noms)")
seed(f"cors/{F}/polls/bt1", {"id": "bt1", "kind": "bandes", "title": "Bandes", "closed": False, "cats": [{"id": "k1", "name": "Cor"}]})


def voted(pid, mid, sec, *, vote=True, by=True, n=None, by_mid=None):
    """El lot del primer vot: el vot, turnout/<votació>/by/<persona> i +1 a la corda (amb increment, o amb un valor fix si n)."""
    w = [upd(f"cors/{F}/pollVotes/{pid}_{mid}", {"pollId": pid, "memberId": mid, "section": sec, "picks": {"k1": ["m3"]}, "n": 1, "choices": [], "at": now})] if vote else []
    if by:
        w.append(upd(f"cors/{F}/turnout/{pid}/by/{by_mid or mid}", {"at": now}))
    if n is None:
        w.append({"update": {"name": f"{ROOT}/cors/{F}/turnout/{pid}", "fields": {}}, "updateMask": {"fieldPaths": []},
                  "updateTransforms": [{"fieldPath": sec, "increment": {"integerValue": "1"}}]})
    else:
        w.append(upd(f"cors/{F}/turnout/{pid}", {sec: n}, [sec]))
    return w


expect("AB1 la cantaire vota i suma 1 a la seva corda", commit(voted("bt1", "m1", "S"), T["singer"]), True)
expect("AB2 tothom de l'agrupació veu el recompte", get(f"cors/{F}/turnout/bt1", T["arx"]), True)
expect("AB2b també qui no és a la plantilla", get(f"cors/{F}/turnout/bt1", T["dir"]), True)
expect("AB3 la mateixa persona no compta dos cops", commit(voted("bt1", "m1", "S"), T["singer"]), False)
expect("AB3b però pot canviar el vot", commit([upd(f"cors/{F}/pollVotes/bt1_m1", {"pollId": "bt1", "memberId": "m1", "section": "S", "picks": {"k1": ["m4"]}, "n": 1, "choices": [], "at": now})], T["singer"]), True)
expect("AB4 sense votar no compta", commit(voted("bt1", "m3", "B", vote=False), T["pau"]), False)
expect("AB5 ningú no compta per un altre", commit(voted("bt1", "m4", "T", by_mid="m1"), T["pol"]), False)
expect("AB6 ni suma a una altra corda", commit(voted("bt1", "m3", "S"), T["pau"]), False)
expect("AB7 ni més d'un", commit(voted("bt1", "m3", "B", n=2), T["pau"]), False)
expect("AB8 qui no és a la plantilla no compta", commit(voted("bt1", "m4", "T"), T["dir"]), False)
expect("AB9 un cap de corda compta a la seva", commit(voted("bt1", "m3", "B"), T["pau"]), True)
expect("AB10 cadascú veu la seva constància", get(f"cors/{F}/turnout/bt1/by/m1", T["singer"]), True)
expect("AB10b però ningú més, ni l'equip", get(f"cors/{F}/turnout/bt1/by/m1", T["pau"]), False)
expect("AB10c ni en pot fer la llista", lst(f"cors/{F}/turnout/bt1/by", T["pol"]), False)
code, body = req("GET", f"{BASE}/cors/{F}/turnout/bt1", tok=OWNER)
got = {k: int(v.get("integerValue", 0)) for k, v in (body.get("fields") or {}).items()} if code == 200 else {}
expect(f"AB11 el recompte és S 1 · B 1 ({got})", 200 if got == {"S": 1, "B": 1} else 403, True)

print("AC. Bandes: les propostes de categories, abans de votar")
seed(f"cors/{F}/polls/bt2", {"id": "bt2", "kind": "bandes", "title": "Bandes noves", "draft": True, "propOpen": True})
seed(f"cors/{F}/polls/bt3", {"id": "bt3", "kind": "bandes", "title": "Bandes tancades", "draft": True, "propOpen": False})
CP = {"id": "cp1", "pollId": "bt2", "name": "Rei del karaoke", "desc": "Qui no deixa el micro", "pair": False, "by": "m1", "at": now, "likes": []}
expect("AC1 la cantaire proposa una categoria", commit([upd(f"cors/{F}/catProps/cp1", CP)], T["singer"]), True)
expect("AC2 tothom les veu", get(f"cors/{F}/catProps/cp1", T["pau"]), True)
expect("AC3 no a nom d'un altre", commit([upd(f"cors/{F}/catProps/cp2", {**CP, "id": "cp2", "by": "m3"})], T["singer"]), False)
expect("AC4 ni si no se'n recullen", commit([upd(f"cors/{F}/catProps/cp3", {**CP, "id": "cp3", "pollId": "bt3"})], T["singer"]), False)
expect("AC5 ni amb «m'agrada» ja posats", commit([upd(f"cors/{F}/catProps/cp4", {**CP, "id": "cp4", "likes": ["m3"]})], T["singer"]), False)
expect("AC5b ni sense nom", commit([upd(f"cors/{F}/catProps/cp5", {**CP, "id": "cp5", "name": ""})], T["singer"]), False)
expect("AC6 un altre hi diu «m'agrada»", commit([upd(f"cors/{F}/catProps/cp1", {"likes": ["m3"]}, ["likes"])], T["pau"]), True)
expect("AC7 però no a nom d'un altre", commit([upd(f"cors/{F}/catProps/cp1", {"likes": ["m3", "m4"]}, ["likes"])], T["pau"]), False)
expect("AC7b ni treu el d'un altre", commit([upd(f"cors/{F}/catProps/cp1", {"likes": []}, ["likes"])], T["singer"]), False)
expect("AC8 la cantaire no la fa entrar a les categories", commit([upd(f"cors/{F}/catProps/cp1", {"taken": True}, ["taken"])], T["singer"]), False)
expect("AC9 qui no l'ha feta no la treu", commit([dele(f"cors/{F}/catProps/cp1")], T["pau"]), False)
expect("AC10 qui porta el tauler la fa entrar", commit([upd(f"cors/{F}/catProps/cp1", {"taken": True}, ["taken"])], T["sec"]), True)
expect("AC11 i llavors qui l'ha feta ja no la treu", commit([dele(f"cors/{F}/catProps/cp1")], T["singer"]), False)
expect("AC12 qui l'ha feta en treu una que no ha entrat", commit([upd(f"cors/{F}/catProps/cp6", {**CP, "id": "cp6", "name": "Una altra"})], T["singer"]) == 200 and commit([dele(f"cors/{F}/catProps/cp6")], T["singer"]), True)

print()
print(f"{PASSES} correctes · {len(FAILS)} errors")
sys.exit(1 if FAILS else 0)
