"""La norma d'assistència (el mínim per poder fer el concert), la mateixa que calcula l'app.

L'app la calcula a js/02-dades.js (ruleStatus) i els avisos al mòbil (avisos.py) aquí. Totes dues han de dir sempre el
mateix: tests/logica/test_norma.py genera molts casos a l'atzar i els passa per totes dues.

Les dades tenen la forma de Firestore:
  · productions: {id: producció}, cadascuna amb sessions i excluded (qui no la fa);
  · sessions: {id: sessió}, amb prods = les produccions per a les quals compta (vegeu sessions_of);
  · attendance: {<sessió>_<corda>: {marks: {membre: {s: P | R | FJ | FNJ | NP, min?: minuts de retard}}}};
  · el membre, amb section i leaves (baixes temporals {from, to}).

Es compta en minuts, com a l'app: cada sessió hi pesa pel que dura, i un retard o marxar abans d'hora (early), pels minuts
que s'hi ha estat. Una sessió compartida per diverses produccions es reparteix a parts iguals entre elles (share) o, si
té l'ordre triat (parts), pel tros de cadascuna: el retard es resta de la primera estona i marxar abans, de l'última (slots).
"""
import re


def clock_mins(t):
    return int(t[:-3]) * 60 + int(t[-2:]) if isinstance(t, str) and re.fullmatch(r"\d{1,2}:\d{2}", t) else None


def session_mins(s):
    """Minuts que compta una sessió: el temps d'assaig (mins) si s'ha posat; si no, de l'hora d'inici a la de final; si no
    en té, dues hores."""
    try:
        if float(s.get("mins") or 0) > 0:
            return round(float(s["mins"]))
    except (TypeError, ValueError):
        pass
    a, b = clock_mins(s.get("time")), clock_mins(s.get("end"))
    return b - a if a is not None and b is not None and b > a else 120


def late_mins(mk):
    try:
        return float(mk.get("min") or 0)
    except (TypeError, ValueError):
        return 0


def early_mins(mk):
    """«Ha marxat abans»: els minuts del final que s'ha perdut."""
    try:
        return float(mk.get("early") or 0)
    except (TypeError, ValueError):
        return 0


def convoked(s, section):
    secs = s.get("sections") or []
    return not secs or section in secs


def on_leave(m, date):
    for lv in m.get("leaves") or []:
        if lv.get("from") and lv["from"] <= date and (not lv.get("to") or lv["to"] >= date):
            return True
    return False


def sessions_of(productions):
    """Totes les sessions, amb les produccions per a les quals compten (les compartides surten un sol cop)."""
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


def apply_choices(productions, choices):
    """Les produccions amb excluded ampliat amb qui ha dit que no les farà (prodChoice/<membre> = {prods: {pid: 'no'}})."""
    out = {}
    for pid, p in productions.items():
        no = [mid for mid, c in (choices or {}).items() if ((c or {}).get("prods") or {}).get(pid) == "no"]
        out[pid] = {**p, "excluded": sorted(set((p.get("excluded") or []) + no))} if no else p
    return out


def apply_guests(productions):
    """Els reforços (guests) només fan les seves produccions: a les altres hi compten com si els n'haguessin tret."""
    guests = {mid for p in productions.values() for mid in (p.get("guests") or [])}
    if not guests:
        return productions
    out = {}
    for pid, p in productions.items():
        other = guests - set(p.get("guests") or [])
        out[pid] = {**p, "excluded": sorted(set(p.get("excluded") or []) | other)} if other else p
    return out


def excluded(productions, mid, prods):
    """Només queda fora si no fa cap de les produccions de la sessió."""
    prods = [pid for pid in prods if pid in productions]
    return bool(prods) and all(mid in (productions[pid].get("excluded") or []) for pid in prods)


def eff_mark(productions, s, m, mid, attendance, ctx=None):
    """La marca que compta: la de la llista o, si no n'hi ha, «no fa» (de baixa o fora de la producció)."""
    if ctx and mid in (productions.get(ctx, {}).get("excluded") or []):
        return {"s": "NP"}
    mk = ((attendance.get(f"{s['id']}_{m.get('section')}") or {}).get("marks") or {}).get(mid)
    if mk and mk.get("s"):
        return mk
    if on_leave(m, s["date"]) or excluded(productions, mid, s.get("prods") or []):
        return {"s": "NP"}
    return None


def minimum(config):
    """El percentatge mínim de la configuració, com a fracció (per defecte, el 80%)."""
    try:
        v = float(config.get("minAttendance") or 0)
    except (TypeError, ValueError):
        v = 0
    return min(100, max(1, v or 80)) / 100


def share(productions, s, pid):
    """Entre quantes produccions es reparteix la sessió, mirant-la des de pid (com sessionShare): les que existeixen."""
    ps = {p for p in (s.get("prods") or []) if p in productions}
    return len(ps) if pid in ps else 1


def slots(productions, s):
    """El tros de cada producció d'un assaig compartit amb l'ordre triat (com sessionSlots): [{p, a, b}] en minuts que
    compten, o None si no en té (o les parts no lliguen amb les produccions de la sessió)."""
    parts = s.get("parts")
    if not isinstance(parts, list):
        return None
    ps = {p for p in (s.get("prods") or []) if p in productions}
    live = [x for x in parts if isinstance(x, dict) and x.get("p") in productions]
    if len(ps) < 2 or len(live) != len(ps) or len({x["p"] for x in live}) != len(ps) or not all(x["p"] in ps for x in live):
        return None
    full, n, a0, z = session_mins(s), len(live), clock_mins(s.get("time")), clock_mins(s.get("end"))
    f = [0]
    if a0 is not None and z is not None and z > a0:
        cut = [clock_mins(x.get("to")) for x in live[:-1]]
        ok, prev = [], a0
        for c in cut:
            v = c is not None and prev < c < z
            if v:
                prev = c
            ok.append(v)
        i = 0
        while i < n - 1:
            if ok[i]:
                f.append((cut[i] - a0) / (z - a0))
                i += 1
                continue
            j = i
            while j < n - 1 and not ok[j]:
                j += 1
            lo, hi = f[-1], (cut[j] - a0) / (z - a0) if j < n - 1 else 1
            for k in range(i, j):
                f.append(lo + (hi - lo) * (k - i + 1) / (j - i + 1))
            i = j
    else:
        f += [i / n for i in range(1, n)]
    f.append(1)
    return [{"p": x["p"], "a": full * f[i], "b": full * f[i + 1]} for i, x in enumerate(live)]


def rule_status(productions, sessions, attendance, pid, mid, m, today, min_frac, rule_skip):
    """ok | risk (ara és a sota però encara hi pot arribar) | out (ja no hi pot arribar) | None (sense dades o no la fa)."""
    if mid in (productions[pid].get("excluded") or []):
        return None
    att = ab = remaining = 0
    att_m = ab_m = rem_m = 0
    for s in sessions.values():
        if pid not in (s.get("prods") or []) or s.get("type") in rule_skip or not convoked(s, m.get("section")):
            continue
        doc = attendance.get(f"{s['id']}_{m.get('section')}") or {}
        sl = next((x for x in (slots(productions, s) or []) if x["p"] == pid), None)
        marked = eff_mark(productions, s, m, mid, attendance, pid) if s["date"] <= today and doc.get("marks") else None
        if not marked:
            if s["date"] >= today and not on_leave(m, s["date"]):
                remaining += 1
                rem_m += (sl["b"] - sl["a"]) if sl else session_mins(s) / share(productions, s, pid)
            continue
        if marked["s"] == "NP":
            continue
        full, on = session_mins(s), marked["s"] in ("P", "R")
        late, early = late_mins(marked) if marked["s"] == "R" else 0, early_mins(marked)
        if sl:
            d = sl["b"] - sl["a"]
            done_m = max(0, min(sl["b"], full - early) - max(sl["a"], late)) if on else 0
        else:
            n = share(productions, s, pid)
            d = full / n
            done_m = (full - min(full, late + early)) / n if on else 0
        if marked["s"] in ("P", "R"):
            att += 1
        else:
            ab += 1
        att_m += done_m
        ab_m += d - done_m
    if not att + ab:
        return None
    done = att_m + ab_m
    cur, best = att_m / done, (att_m + rem_m) / (done + rem_m)
    return {"cur": cur, "best": best, "att": att, "ab": ab, "remaining": remaining,
            "status": "out" if best < min_frac else "risk" if cur < min_frac else "ok"}
