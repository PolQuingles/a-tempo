"""Dades inventades per a la base de dades falsa de les proves (seed.js)."""
import datetime, json, os, sys
F = "nSN9kYDkzPik239jnsMsCSYW"
today = datetime.date.today()
d = lambda n: (today + datetime.timedelta(days=n)).isoformat()
now = datetime.datetime.utcnow().isoformat() + "Z"
DB = {}
def put(p, v): DB[p] = v
put(f"agrupacions/{F}", {"name": "Cor Jove de proves", "kind": "cor", "status": "active"})
put(f"cors/{F}/config/main", {"name": "Cor Jove de proves", "shortName": "Cor Jove", "alertFNJ": 3, "minAttendance": 80,
    "brand": {"accent": "#5A3577"}, "classesOn": True, "teachers": [{"id": "pfanais", "name": "Anaïs Oliveras"}],
    "season": {"from": d(-20), "to": d(260), "name": "Temporada"}, "voiceMin": {"T": 5}, "terms": [{"name": "1r trimestre", "from": d(-20), "to": d(90)}]})
names = {"S": ["Anna Puig", "Laia Ferrer", "Marta Soler", "Clara Vila"], "C": ["Júlia Mas", "Neus Roca", "Ona Serra", "Pau Riera"],
         "T": ["Lluc Tenor", "Marc Bosch", "Oriol Camps", "Jan Pons"], "B": ["Pere Font", "Joan Sala", "Biel Costa", "Arnau Prat"]}
mid = {}
for sec, ns in names.items():
    for i, n in enumerate(ns):
        m = f"m{sec}{i}"; mid[n] = m
        put(f"cors/{F}/members/{m}", {"id": m, "name": n, "section": sec, "active": True, "leader": n == "Lluc Tenor", "part": "1" if i % 2 == 0 else "2"})
sessions = [{"id": f"s{i}", "date": d(k), "time": "20:30", "end": "22:30", "type": t, "place": "Sala d'assaig", "note": ""}
            for i, (k, t) in enumerate([(-9, "Assaig"), (-6, "Assaig"), (-2, "Assaig"), (0, "Assaig"), (3, "Assaig"), (7, "Assaig general"), (10, "Concert")])]
sessions[4]["plan"] = {"items": [{"id": "pi1", "work": "w1", "title": "", "bars": "1-40", "who": "", "note": "De memòria"}, {"id": "pi2", "work": "", "title": "Escalfament", "bars": "", "who": "T", "note": ""}], "text": "Porteu llapis."}
sessions[6]["rsvp"] = True
put(f"cors/{F}/productions/p1", {"id": "p1", "name": "Concert de tardor", "start": d(-12), "end": d(12), "excluded": [], "sessions": sessions})
for s in sessions[:3]:
    for sec, ns in names.items():
        put(f"cors/{F}/attendance/{s['id']}_{sec}", {"sessionId": s["id"], "section": sec, "marks": {mid[n]: {"s": "P" if j != 3 or s['id'] != 's1' else "FNJ"} for j, n in enumerate(ns)}})
staff = {
    "pol@exemple.cat": {"name": "Pol Proves", "roles": ["admin", "leader", "singer"], "section": "T", "memberId": mid["Marc Bosch"]},
    "leader@exemple.cat": {"name": "Lluc Tenor", "roles": ["leader", "singer"], "section": "T", "memberId": mid["Lluc Tenor"]},
    "singer@exemple.cat": {"name": "Anna Puig", "roles": ["singer"], "memberId": mid["Anna Puig"]},
    "prof@exemple.cat": {"name": "Prat, Berta", "roles": ["voice"]},
    "dir@exemple.cat": {"name": "Dídac Director", "roles": ["director"]},
    "ger@exemple.cat": {"name": "Gemma Gerent", "roles": ["gerencia"]},
}
for e, p in staff.items():
    put(f"cors/{F}/staff/{e}", {"email": e, "role": p["roles"][0], "lastSeen": now, **p})
    put(f"staffIndex/{e}/agrupacions/{F}", {"at": now, "name": "Cor Jove de proves"})
put("plataforma/pro", {"emails": ["pol@exemple.cat"]})
put(f"cors/{F}/absences/a1", {"id": "a1", "memberId": mid["Laia Ferrer"], "memberName": "Laia Ferrer", "section": "S", "sessionIds": ["s4"], "kind": "absent", "status": "pending", "reason": "Viatge", "createdAt": now})
put(f"cors/{F}/works/w1", {"id": "w1", "title": "Gloria", "composer": "A. Vivaldi", "duration": "4:30", "voicing": "SATB", "prods": ["p1"],
    "roles": [{"id": "r1", "name": "Solo de soprano, núm. 3", "memberIds": [mid["Anna Puig"]]}, {"id": "r2", "name": "Quartet", "memberIds": [mid["Marc Bosch"], mid["Anna Puig"]]}],
    "materials": [{"id": "mt1", "kind": "partitura", "title": "Partitura completa", "url": "https://example.com/gloria.pdf", "section": "", "part": ""},
                  {"id": "mt2", "kind": "audio", "title": "Àudio de tenors", "url": "https://example.com/t.mp3", "section": "T", "part": ""}]})
put(f"cors/{F}/works/w2", {"id": "w2", "title": "Ave verum corpus", "composer": "W. A. Mozart", "duration": "3:10", "voicing": "SATB", "prods": [], "roles": [], "materials": []})
put(f"cors/{F}/trips/t1", {"id": "t1", "title": "Cap de setmana a Montserrat", "from": d(20), "to": d(21), "place": "Montserrat", "deadline": d(15), "notes": "Sortida de la plaça a les 9.",
    "transports": [{"id": "v1", "name": "Autocar 1", "seats": 55}], "rooms": [{"id": "h1", "name": "101", "beds": 4}], "sections": []})
put(f"cors/{F}/tripSignups/t1_{mid['Marc Bosch']}", {"tripId": "t1", "memberId": mid["Marc Bosch"], "answer": "yes", "note": "", "transport": "v1", "room": "h1"})
for n in ["Anna Puig", "Laia Ferrer", "Marc Bosch", "Lluc Tenor"]:
    put(f"cors/{F}/rsvp/s6_{mid[n]}", {"sessionId": "s6", "memberId": mid[n], "answer": "yes"})
put(f"cors/{F}/profiles/{mid['Marc Bosch']}", {"memberId": mid["Marc Bosch"], "phone": "600000001", "size": "L", "emergencyName": "Mare", "emergencyPhone": "600000002"})
put(f"cors/{F}/announcements/n1", {"id": "n1", "title": "Benvinguts al curs", "body": "Recordeu portar les partitures.", "author": "Pol Proves", "createdAt": now})
for k, wd in [(1, 0), (3, 0), (8, 0)]:
    cid = f"c{k}"
    put(f"cors/{F}/classes/{cid}", {"id": cid, "date": d(k), "place": "Aula 2", "note": "", "teacher": "prof@exemple.cat", "teacherName": "Prat, Berta",
        "slots": [{"id": f"{cid}a", "time": "17:00", "mins": 40, "memberId": mid["Anna Puig"]}, {"id": f"{cid}b", "time": "17:40", "mins": 40, "memberId": mid["Marc Bosch"]}, {"id": f"{cid}c", "time": "18:20", "mins": 40, "memberId": ""}]})
    put(f"cors/{F}/classes/x{k}", {"id": f"x{k}", "date": d(k + 1), "place": "", "note": "", "teacher": "pfanais", "teacherName": "Anaïs Oliveras",
        "slots": [{"id": f"x{k}a", "time": "16:20", "mins": 40, "memberId": mid["Laia Ferrer"]}, {"id": f"x{k}b", "time": "17:00", "mins": 40, "memberId": mid["Júlia Mas"]}]})
open(os.path.join(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(__file__), "seed.js"), "w").write("window.FAKE_SEED = " + json.dumps(DB, ensure_ascii=False) + ";\n")
print(len(DB), "documents")
