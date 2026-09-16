"""Identitat del cor fora de l'app: pantalla d'entrada, icona del mòbil i manifest.

A partir del nom i del logotip desats a Ajustos (config/main), escriu:
  marca.json                    nom, nom curt i colors, per a la pantalla d'entrada (abans d'entrar)
  marca/logo.png                el logotip
  marca/icon-180.png            icona de l'iPhone
  marca/icon-192.png, icon-512.png, icon-512-maskable.png   icones d'Android
  marca/favicon-48.png          icona de la pestanya del navegador
  manifest.webmanifest          nom i colors de l'app instal·lada
Si no hi ha logotip, fa servir les icones per defecte de l'app.
"""
import base64, io, json, os, re, shutil

from PIL import Image

DEFAULT_ACCENT = "#5A3577"


def short_name(cfg):
    s = (cfg.get("shortName") or "").strip()
    if s:
        return s
    name = (cfg.get("name") or "").strip()
    if not name:
        return "Cor Present"
    if len(name) <= 14:
        return name
    return " ".join(name.split()[:2])


def _hex(rgb):
    return "#%02X%02X%02X" % tuple(rgb[:3])


def _square(img, size, scale, bg):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = size * scale
    ratio = inner / max(img.width, img.height)
    logo = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas.convert("RGB")


def _write(path, data):
    """Només reescriu si canvia, perquè git no vegi canvis falsos."""
    old = open(path, "rb").read() if os.path.exists(path) else None
    if old != data:
        with open(path, "wb") as f:
            f.write(data)


def _png(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build(cfg, root="."):
    brand = cfg.get("brand") or {}
    accent = brand.get("accent") or DEFAULT_ACCENT
    out = os.path.join(root, "marca")
    os.makedirs(out, exist_ok=True)
    bg, logo_url = accent, None

    m = re.match(r"data:image/(png|jpe?g|webp);base64,(.+)$", brand.get("logo") or "", re.S)
    if m:
        img = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert("RGBA")
        corners = [img.getpixel(p) for p in [(0, 0), (img.width - 1, 0), (0, img.height - 1), (img.width - 1, img.height - 1)]]
        solid = [c for c in corners if c[3] > 250]
        own_bg = len(solid) >= 3            # el logotip ja porta el seu fons de color
        if own_bg:
            bg = _hex(solid[0])
        full = 1.0 if own_bg else 0.8
        _write(os.path.join(out, "logo.png"), _png(img))
        _write(os.path.join(out, "icon-180.png"), _png(_square(img, 180, full, bg)))
        _write(os.path.join(out, "icon-192.png"), _png(_square(img, 192, full, bg)))
        _write(os.path.join(out, "icon-512.png"), _png(_square(img, 512, full, bg)))
        # Android retalla les icones «maskable» en cercle: el dibuix ha de quedar dins del 80 % central.
        _write(os.path.join(out, "icon-512-maskable.png"), _png(_square(img, 512, 0.7 if own_bg else 0.6, bg)))
        _write(os.path.join(out, "favicon-48.png"), _png(_square(img, 48, full, bg)))
        logo_url = "marca/logo.png"
    else:
        for src, dst in [("icon-180.png", "icon-180.png"), ("icon-512.png", "icon-192.png"), ("icon-512.png", "icon-512.png"),
                         ("icon-512.png", "icon-512-maskable.png"), ("icon-180.png", "favicon-48.png")]:
            shutil.copyfile(os.path.join(root, src), os.path.join(out, dst))
        if os.path.exists(os.path.join(out, "logo.png")):
            os.remove(os.path.join(out, "logo.png"))

    name = (cfg.get("name") or "").strip() or "Cor Present"
    marca = {"name": name, "short": short_name(cfg), "accent": accent, "bg": bg, "logo": logo_url}
    _write(os.path.join(root, "marca.json"), (json.dumps(marca, ensure_ascii=False, indent=1) + "\n").encode())
    manifest = {
        "name": name, "short_name": short_name(cfg), "description": "Assistència, calendari i avisos del cor",
        "lang": "ca", "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": bg, "theme_color": bg,
        "icons": [
            {"src": "marca/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "marca/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "marca/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    _write(os.path.join(root, "manifest.webmanifest"), (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode())
    return marca
