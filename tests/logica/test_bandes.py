"""Els resultats muts de les bandes (.github/scripts/bandes.py): compten com l'app (bandesTally) i no diuen cap nom.

    python3 tests/logica/test_bandes.py
"""
import datetime, json, os, sys
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, ".github", "scripts"))
import bandes

FAILS = []


def igual(got, want, label):
    if got != want:
        FAILS.append(f"{label}: {got!r} en lloc de {want!r}")
    print(("✓ " if got == want else "✗ ") + label)


active = {"a": {"section": "S"}, "b": {"section": "S"}, "c": {"section": "C"}, "d": {"section": "T"}, "e": {"section": "T", "active": False}}
p = {"cats": [{"id": "k1", "name": "Riure"}, {"id": "k2", "name": "Parella", "pair": True}, {"id": "k3", "name": "Ningú"}, {"id": "k4", "name": "Sopranos", "sec": "S"}],
     "sections": [], "picks": 2, "out": ["d"]}
sec_of = bandes.people(p, {k: v for k, v in active.items() if v.get("active") is not False})
igual(sorted(sec_of), ["a", "b", "c"], "hi participen les fitxes actives, menys les tretes")
votes = {
    "q_a": {"pollId": "q", "memberId": "a", "picks": {"k1": ["b", "c", "c"], "k2": ["b", "c"], "k4": ["c", "b"]}},
    "q_b": {"pollId": "q", "memberId": "b", "picks": {"k1": ["b", "c", "a"], "k2": ["c"]}},
    "q_c": {"pollId": "q", "memberId": "c", "picks": {"k1": ["a", "x"], "k2": ["c", "b"]}},
    "q_d": {"pollId": "q", "memberId": "d", "picks": {"k1": ["a"]}},
    "z_a": {"pollId": "z", "memberId": "a", "picks": {"k1": ["b"]}},
}
x = bandes.tally("q", p, votes, sec_of)
igual(x["cats"], {"k1": {"n": [2, 2, 1], "b": 3}, "k2": {"n": [1], "b": 1}, "k4": {"n": [1], "b": 1}},
      "com bandesClean: sense repetits, ni un mateix, ni qui no hi és, ni d'una altra corda, i les parelles senceres")
igual(json.dumps(x["cats"]).count('"a"') + json.dumps(x["cats"]).count('"b+c"'), 0, "cap nom al que veu tothom")
igual(x["me"], {"b": 3, "c": 2, "a": 1}, "en quantes categories ha rebut vots cadascú (la parella compta per a totes dues)")
igual(x["win"], {}, "sense palmarès, cap vot de ningú")
x2 = bandes.tally("q", {**p, "results": {"k1": ["a"], "k2": ["b+c"]}}, votes, sec_of)
igual(x2["win"], {"k1": [2], "k2": [1]}, "amb el palmarès, els vots de cada guanyador")
igual(bandes.sig(x) == bandes.sig(json.loads(json.dumps(x))) and bandes.sig(x) != bandes.sig(x2), True, "la signatura només canvia si canvien els números")

today = datetime.date(2027, 2, 1)
base = {"kind": "bandes", "results": {"k1": ["a"]}}
igual(bandes.gone_due({**base, "galaAt": "2026-12-26"}, today), True, "un mes i un dia després de la Nit, amb el palmarès, toca esborrar")
igual(bandes.gone_due({**base, "galaAt": "2027-01-05"}, today), False, "abans no")
igual(bandes.gone_due({"kind": "bandes", "galaAt": "2026-12-26"}, today), False, "ni sense palmarès")
igual(bandes.gone_due({**base, "galaAt": "2026-12-26", "ballotsGone": "2027-01-27"}, today), False, "ni si ja s'han esborrat")
igual(bandes.gone_due({**base, "galaAt": ""}, today), False, "ni sense data de la Nit")
igual([bandes.phase_closed({"closesAt": "2027-01-31"}, today), bandes.phase_closed({"closesAt": "2027-02-01"}, today), bandes.phase_closed({"closed": True, "draft": True}, today)],
      [True, False, False], "tancada: passat el darrer dia (o marcada), i mai un esborrany")

print(f"{'CORRECTE' if not FAILS else 'INCORRECTE'}")
sys.exit(1 if FAILS else 0)
