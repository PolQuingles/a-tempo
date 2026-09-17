"""Lectura de Firestore per a les tasques automàtiques (calendari, còpies i avisos).

Entra amb el compte de servei (secret SERVICE_REFRESH_TOKEN), que pot llegir totes les agrupacions
però no escriure-hi res. Si les regles encara no el coneixen, fa servir el lector antic de la primera
agrupació i només treballa amb aquella.

Per provar-ho contra l'emulador: FS_BASE (adreça dels documents) i FS_TOKEN (token ja fet).
"""
import json, os, urllib.error, urllib.parse, urllib.request

API = "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY"
DOCS = "projects/cor-present/databases/(default)/documents"
BASE = os.environ.get("FS_BASE") or f"https://firestore.googleapis.com/v1/{DOCS}"
ROOT = BASE.split("/v1/", 1)[1] if "/v1/" in BASE else DOCS
FOUNDER = "nSN9kYDkzPik239jnsMsCSYW"   # la primera agrupació: conserva les adreces d'abans

# Paraules i seccions per defecte de cada tipus d'agrupació (les mateixes que a l'app).
KINDS = {
    "cor": {"sections": [("S", "Sopranos"), ("C", "Contralts"), ("T", "Tenors"), ("B", "Baixos")],
            "shows": ["Concert"], "leader": "cap de corda", "section": "corda"},
    "orquestra": {"sections": [("V1", "Violins primers"), ("V2", "Violins segons"), ("Va", "Violes"), ("Vc", "Violoncels"),
                               ("Cb", "Contrabaixos"), ("Fu", "Vent fusta"), ("Me", "Vent metall"), ("Pc", "Percussió i arpa")],
                  "shows": ["Concert", "Enregistrament"], "leader": "cap de secció", "section": "secció"},
    "banda": {"sections": [("Fl", "Flautes i oboès"), ("Cl", "Clarinets"), ("Sx", "Saxòfons"), ("Tp", "Trompetes"),
                           ("Tr", "Trompes"), ("Tb", "Trombons"), ("Bt", "Bombardins i tubes"), ("Pc", "Percussió")],
              "shows": ["Concert", "Cercavila", "Processó"], "leader": "cap de secció", "section": "secció"},
    "cobla": {"sections": [("Fb", "Flabiol i tibles"), ("Te", "Tenores"), ("Tp", "Trompetes"), ("Tb", "Trombó i fiscorns"), ("Cb", "Contrabaix")],
              "shows": ["Audició", "Concert", "Ballada", "Enregistrament"], "leader": "cap de secció", "section": "secció"},
    "cambra": {"sections": [("V", "Veus"), ("I", "Instruments")],
               "shows": ["Concert", "Enregistrament"], "leader": "cap de secció", "section": "secció"},
    "altres": {"sections": [("A", "Secció A"), ("B", "Secció B")],
               "shows": ["Actuació"], "leader": "responsable de secció", "section": "secció"},
}


def kind(cfg):
    return cfg.get("kind") if cfg.get("kind") in KINDS else "cor"


def sections(cfg):
    """{id: name} de les seccions de l'agrupació, en ordre."""
    own = [x for x in (cfg.get("sections") or []) if isinstance(x, dict) and x.get("id")]
    if own:
        return {x["id"]: x.get("name") or x["id"] for x in own}
    return dict(KINDS[kind(cfg)]["sections"])


class Forbidden(Exception):
    pass


def call(url, body=None, token=None, form=False, method=None):
    headers, data = {}, None
    if form:
        data = urllib.parse.urlencode(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 403:
            raise Forbidden(url) from None
        if e.code == 404:
            return None
        raise


def dec(v):
    k, x = next(iter(v.items()))
    if k == "mapValue":
        return {a: dec(b) for a, b in x.get("fields", {}).items()}
    if k == "arrayValue":
        return [dec(b) for b in x.get("values", [])]
    if k == "integerValue":
        return int(x)
    if k == "nullValue":
        return None
    return x


def enc(v):
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, list):
        return {"arrayValue": {"values": [enc(x) for x in v]}}
    return {"stringValue": str(v)}


class Reader:
    """Lectures de documents, comptant-les (el pla gratuït en té un límit diari)."""

    def __init__(self, token):
        self.token = token
        self.reads = 0
        self.full = False

    def get(self, path):
        d = call(f"{BASE}/{path}", token=self.token)
        self.reads += 1
        return dec({"mapValue": d}) if d else None

    def list(self, path):
        out, page = {}, None
        while True:
            q = {"pageSize": 300}
            if page:
                q["pageToken"] = page
            d = call(f"{BASE}/{path}?" + urllib.parse.urlencode(q), token=self.token) or {}
            docs = d.get("documents", [])
            self.reads += max(1, len(docs))
            for doc in docs:
                out[doc["name"].rsplit("/", 1)[1]] = dec({"mapValue": doc})
            page = d.get("nextPageToken")
            if not page:
                return out

    def query(self, parent, collection, where):
        """Documents d'una col·lecció que compleixen totes les condicions [(camp, op, valor)]."""
        ops = {"==": "EQUAL", ">=": "GREATER_THAN_OR_EQUAL", ">": "GREATER_THAN", "in": "IN", "<=": "LESS_THAN_OR_EQUAL"}
        filters = [{"fieldFilter": {"field": {"fieldPath": f}, "op": ops[op], "value": enc(v)}} for f, op, v in where]
        sq = {"from": [{"collectionId": collection}]}
        if filters:
            sq["where"] = filters[0] if len(filters) == 1 else {"compositeFilter": {"op": "AND", "filters": filters}}
        rows = call(f"{BASE}/{parent}:runQuery", {"structuredQuery": sq}, token=self.token) or []
        out = {}
        for row in rows:
            doc = row.get("document")
            if doc:
                out[doc["name"].rsplit("/", 1)[1]] = dec({"mapValue": doc})
        self.reads += max(1, len(out))
        return out

    def batch_get(self, paths):
        """{path: document o None} d'uns quants documents d'un sol cop."""
        paths = list(dict.fromkeys(paths))
        out = {}
        for i in range(0, len(paths), 100):
            chunk = paths[i:i + 100]
            rows = call(f"{BASE}:batchGet", {"documents": [f"{ROOT}/{p}" for p in chunk]}, token=self.token) or []
            for row in rows:
                if "found" in row:
                    out[row["found"]["name"].split("/documents/", 1)[1]] = dec({"mapValue": row["found"]})
                elif "missing" in row:
                    out[row["missing"].split("/documents/", 1)[1]] = None
            self.reads += len(chunk)
        return out


def _token(refresh):
    return call(f"https://securetoken.googleapis.com/v1/token?key={API}",
                {"grant_type": "refresh_token", "refresh_token": refresh}, form=True)["id_token"]


def connect(legacy_secret):
    """Reader i directori d'agrupacions actives {id: fitxa}. Amb el lector antic, només la primera."""
    if os.environ.get("FS_TOKEN"):
        r = Reader(os.environ["FS_TOKEN"])
        if os.environ.get("FS_GROUPS"):   # proves: agrupacions triades, sense llegir el directori
            return r, {g: {"status": "active"} for g in os.environ["FS_GROUPS"].split(",")}
        r.full = True
        return r, _active(r.list("agrupacions"))
    if os.environ.get("SERVICE_REFRESH_TOKEN"):
        r = Reader(_token(os.environ["SERVICE_REFRESH_TOKEN"]))
        try:
            groups = _active(r.list("agrupacions"))
            r.full = True
            return r, groups
        except Forbidden:
            print("El compte de servei encara no té permís: es fa servir el lector de la primera agrupació.")
    r = Reader(_token(os.environ[legacy_secret]))
    r.full = False   # no veu el directori: no s'ha de fer neteja de les altres agrupacions
    return r, {FOUNDER: {"name": "", "kind": "cor", "status": "active"}}


def _active(directory):
    groups = {gid: g for gid, g in directory.items() if (g.get("status") or "active") == "active"}
    if FOUNDER not in directory:   # encara no registrada al directori
        groups[FOUNDER] = {"name": "", "kind": "cor", "status": "active"}
    return groups


def folder(root, gid):
    """Carpeta de cada agrupació al repositori privat (la primera, a l'arrel com sempre)."""
    return root if gid == FOUNDER else os.path.join(root, "agrupacions", gid)
