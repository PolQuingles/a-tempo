"""La norma d'assistència (el mínim per poder fer el concert), la mateixa que calcula l'app.

L'app la calcula a js/02-dades.js (ruleStatus) i els avisos al mòbil (avisos.py) aquí. Totes dues han de dir sempre el
mateix: tests/logica/test_norma.py genera molts casos a l'atzar i els passa per totes dues.

Les dades tenen la forma de Firestore:
  · productions: {id: producció}, cadascuna amb sessions i excluded (qui no la fa);
  · sessions: {id: sessió}, amb prods = les produccions per a les quals compta (vegeu sessions_of);
  · attendance: {<sessió>_<corda>: {marks: {membre: {s: P | R | FJ | FNJ | NP, min?: minuts de retard}}}};
  · el membre, amb section i leaves (baixes temporals {from, to}).

Es compta en minuts, com a l'app: cada sessió hi pesa pel que dura, i un retard, pels minuts que s'hi ha estat.
"""
import re


def clock_mins(t):
    return int(t[:-3]) * 60 + int(t[-2:]) if isinstance(t, str) and re.fullmatch(r"\d{1,2}:\d{2}", t) else None


def session_mins(s):
    """Minuts que dura una sessió: de l'hora d'inici a la de final; si no en té, dues hores."""
    a, b = clock_mins(s.get("time")), clock_mins(s.get("end"))
    return b - a if a is not None and b is not None and b > a else 120


def late_mins(mk):
    try:
        return float(mk.get("min") or 0)
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
        marked = eff_mark(productions, s, m, mid, attendance, pid) if s["date"] <= today and doc.get("marks") else None
        if not marked:
            if s["date"] >= today and not on_leave(m, s["date"]):
                remaining += 1
                rem_m += session_mins(s)
            continue
        if marked["s"] == "NP":
            continue
        d = session_mins(s)
        done_m = d if marked["s"] == "P" else d - min(d, late_mins(marked)) if marked["s"] == "R" else 0
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
