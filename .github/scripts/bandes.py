"""Els resultats muts de les bandes i l'esborrat de les paperetes, per a avisos.py.

Compta els vots igual que bandesTally (js/08b-bandes.js): les paperetes de qui hi participa, a cada categoria els noms vàlids
(com bandesClean) i, a les de parella, la parella sencera. En surt el que veu tothom, sense cap nom: els vots de cada persona
o parella, de més a menys, i les paperetes (tally/<votació>); amb el palmarès, els vots de cada guanyador; i en quantes
categories ha rebut vots cadascú (tallyMe/<votació>_<persona>, que només llegeix ella).

Un mes després de la Nit, si ja hi ha el palmarès, les paperetes (qui ha votat qui) s'esborren: en queden el palmarès, el
recompte de participació i els resultats muts. Les regles només ho deixen fer passat aquest mes (bandesGone).
"""
import datetime, hashlib, json

KEEP_DAYS = 30


def phase_closed(p, today):
    """Si la votació ja s'ha tancat (com pollClosed): marcada com a tancada o passat el darrer dia."""
    return not p.get("draft") and (bool(p.get("closed")) or (p.get("closesAt") or "9") < today.isoformat())


def gone_due(p, today):
    """Si ja toca esborrar-ne les paperetes: amb el palmarès i passat un mes de la Nit (un dia més que les regles, per l'hora)."""
    if p.get("kind") != "bandes" or not p.get("results") or p.get("ballotsGone"):
        return False
    try:
        gala = datetime.date.fromisoformat(p.get("galaAt") or "")
    except ValueError:
        return False
    return today >= gala + datetime.timedelta(days=KEEP_DAYS + 1)


def people(p, active):
    """{persona: corda} de qui hi participa (com bandesPeople): les fitxes actives de les cordes de la votació, menys les tretes."""
    secs, out = p.get("sections") or [], set(p.get("out") or [])
    return {mid: m.get("section") for mid, m in active.items() if (not secs or m.get("section") in secs) and mid not in out}


def cat_max(p, c):
    if c.get("pair"):
        return 2
    try:
        picks = int(p.get("picks") or 2)
    except (TypeError, ValueError):
        picks = 2
    return max(1, min(3, picks or 2))


def clean(p, c, picks, voter, sec_of):
    """Els noms vàlids d'una papereta en una categoria (com bandesClean)."""
    mx, out = cat_max(p, c), []
    for i in picks if isinstance(picks, list) else []:
        if not isinstance(i, str) or i in out or i not in sec_of:
            continue
        if not p.get("selfOk") and i == voter:
            continue
        if c.get("sec") and sec_of[i] != c["sec"]:
            continue
        out.append(i)
        if len(out) == mx:
            break
    return [] if c.get("pair") and len(out) != 2 else out


def tally(pid, p, votes, sec_of):
    """{cats, win, me}: el que veu tothom per categoria, els vots dels guanyadors i en quantes categories ha rebut vots cadascú."""
    valid = [v for v in votes.values() if v.get("pollId") == pid and v.get("memberId") in sec_of]
    cats, win, got = {}, {}, {}
    results = p.get("results") or {}
    for c in p.get("cats") or []:
        counts, ballots = {}, 0
        for v in valid:
            names = clean(p, c, (v.get("picks") or {}).get(c.get("id")), v["memberId"], sec_of)
            if not names:
                continue
            ballots += 1
            for k in ["+".join(sorted(names))] if c.get("pair") else names:
                counts[k] = counts.get(k, 0) + 1
        if counts:
            cats[c["id"]] = {"n": sorted(counts.values(), reverse=True), "b": ballots}
        for k in counts:
            for mid in k.split("+"):
                got.setdefault(mid, set()).add(c["id"])
        if results.get(c.get("id")):
            win[c["id"]] = [counts.get(k, 0) for k in results[c["id"]]]
    return {"cats": cats, "win": win, "me": {mid: len(s) for mid, s in got.items()}}


def sig(pay):
    return hashlib.sha1(json.dumps(pay, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]
