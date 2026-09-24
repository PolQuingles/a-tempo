"""La norma d'assistència és escrita dues vegades: a l'app (js/02-dades.js › ruleStatus) i als avisos al mòbil
(.github/scripts/norma.py). Aquesta prova genera molts casos a l'atzar (baixes, produccions que algú no fa, sessions
compartides, concerts, cordes no convocades, llistes buides, diferents mínims…) i comprova que totes dues diuen
exactament el mateix per a cada persona i producció.

    python3 tests/logica/test_norma.py            # amb Node (com a les proves automàtiques)
    NORMA_JS="<ordre>" python3 tests/logica/test_norma.py   # amb un altre intèrpret de JavaScript
"""
import datetime, json, os, random, shlex, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, ".github", "scripts"))
import dades, norma

SECS = ["S", "C", "T", "B"]
TYPES = ["Assaig", "Assaig", "Assaig", "Assaig general", "Concert", "Altres"]
MARKS = ["P", "P", "P", "R", "FJ", "FNJ", "FNJ", "NP"]


def cases(n, seed):
    rnd = random.Random(seed)
    today = datetime.date.today()
    day = lambda k: (today + datetime.timedelta(days=k)).isoformat()
    out = []
    for _ in range(n):
        members = []
        for i in range(rnd.randint(1, 7)):
            m = {"id": f"m{i}", "name": f"M{i}", "section": rnd.choice(SECS), "active": True}
            if rnd.random() < .3:
                a = rnd.randint(-25, 15)
                m["leaves"] = [{"from": day(a), "to": day(a + rnd.randint(0, 12)) if rnd.random() < .8 else ""}]
            members.append(m)
        prods = []
        for j in range(rnd.randint(1, 3)):
            sessions = []
            for k in range(rnd.randint(1, 9)):
                s = {"id": f"p{j}s{k}", "date": day(rnd.randint(-25, 20)), "type": rnd.choice(TYPES)}
                if rnd.random() < .25:
                    s["sections"] = rnd.sample(SECS, rnd.randint(1, 3))
                if rnd.random() < .2:
                    s["alsoIn"] = [f"p{rnd.randrange(4)}"]   # de vegades, una producció que no existeix
                sessions.append(s)
            prods.append({"id": f"p{j}", "name": f"P{j}", "sessions": sessions,
                          "excluded": [m["id"] for m in members if rnd.random() < .15]})
        attendance = {}
        for p in prods:
            for s in p["sessions"]:
                if s["date"] > today.isoformat() or rnd.random() < .2:
                    continue
                for sec in SECS:
                    ms = {m["id"]: {"s": rnd.choice(MARKS)} for m in members if m["section"] == sec and rnd.random() < .85}
                    if ms or rnd.random() < .1:   # també alguna llista buida
                        attendance[f"{s['id']}_{sec}"] = {"sessionId": s["id"], "section": sec, "marks": ms}
        config = {}
        mn = rnd.choice([80, 80, 75, 60, 90, 100, 1, 66.5, None])
        if mn is not None:
            config["minAttendance"] = mn
        out.append({"config": config, "members": members, "productions": prods, "attendance": attendance,
                    "checks": [[p["id"], m["id"]] for p in prods for m in members]})
    return out


def python_side(c):
    productions = {p["id"]: p for p in c["productions"]}
    sessions = norma.sessions_of(productions)
    k = dades.KINDS[dades.kind(c["config"])]
    skip = set(k["shows"]) | {"Altres", "Reunió"}
    members = {m["id"]: m for m in c["members"]}
    today = datetime.date.today().isoformat()
    res = []
    for pid, mid in c["checks"]:
        r = norma.rule_status(productions, sessions, c["attendance"], pid, mid, members[mid], today, norma.minimum(c["config"]), skip)
        res.append(r and {"status": r["status"], "att": r["att"], "abs": r["ab"], "remaining": r["remaining"], "cur": r["cur"], "best": r["best"]})
    return res


def main():
    all_cases = cases(400, 20260924)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(all_cases, f)
        path = f.name
    cmd = shlex.split(os.environ.get("NORMA_JS") or "node tests/logica/run.js --norma") + [path]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    os.unlink(path)
    if p.returncode:
        sys.exit(f"L'app no ha pogut calcular la norma:\n{p.stdout}\n{p.stderr}")
    js = json.loads(p.stdout.strip().splitlines()[-1])
    checked = diff = states = 0
    seen = set()
    for i, c in enumerate(all_cases):
        py = python_side(c)
        for (pid, mid), a, b in zip(c["checks"], js[i], py):
            checked += 1
            seen.add((a or {}).get("status"))
            same = (a is None) == (b is None) and (a is None or (
                a["status"] == b["status"] and a["att"] == b["att"] and a["abs"] == b["abs"] and a["remaining"] == b["remaining"]
                and abs(a["cur"] - b["cur"]) < 1e-12 and abs(a["best"] - b["best"]) < 1e-12))
            if not same:
                diff += 1
                if diff <= 5:
                    print(f"Cas {i}, producció {pid}, persona {mid}:\n  app:    {a}\n  avisos: {b}")
    states = sorted(x or "cap" for x in seen)
    print(f"{checked} comprovacions en {len(all_cases)} casos ({', '.join(states)}): {diff} diferències")
    sys.exit(1 if diff or len(seen) < 4 else 0)


if __name__ == "__main__":
    main()
