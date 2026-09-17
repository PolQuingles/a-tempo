"""Identitat de cada agrupació fora de l'app: pantalla d'entrada, icona del mòbil i manifest.

A partir del nom, el logotip i el color desats a Ajustos (config/main), escriu a marca/<agrupació>/:
  marca.json                    nom, nom curt i colors, per a la pantalla d'entrada (abans d'entrar)
  logo.png                      el logotip
  icon-180.png                  icona de l'iPhone
  icon-192.png, icon-512.png, icon-512-maskable.png   icones d'Android
  favicon-48.png                icona de la pestanya del navegador
  manifest.webmanifest          nom i colors de l'app instal·lada, que s'obre directament a l'agrupació
Si l'agrupació no té logotip, la icona porta les inicials del nom sobre el seu color.

La primera agrupació també es desa a l'arrel (marca/, marca.json i manifest.webmanifest), que és on
apunten les instal·lacions fetes abans que hi hagués més d'una agrupació.
"""
import base64, io, json, os, re, shutil

from PIL import Image, ImageDraw, ImageFont

DEFAULT_ACCENT = "#5A3577"
FILES = ["logo.png", "icon-180.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png", "favicon-48.png", "marca.json", "manifest.webmanifest"]
SKIP_WORDS = {"de", "del", "dels", "la", "les", "el", "els", "l", "i", "d"}


def short_name(cfg):
    s = (cfg.get("shortName") or "").strip()
    if s:
        return s
    name = (cfg.get("name") or "").strip()
    if not name:
        return "A Tempo"
    if len(name) <= 14:
        return name
    # «Cor Jove», «Banda Mataró» o, si no hi cap, les inicials («OSV»), sense articles ni preposicions.
    words = [re.sub(r"^(l|d)[’']", "", w, flags=re.I) for w in re.split(r"\s+", name)]
    words = [w for w in words if w and w.lower() not in SKIP_WORDS]
    for pair in ([words[0], words[1]] if len(words) > 1 else [], [words[0], words[-1]] if len(words) > 2 else []):
        if pair and len(" ".join(pair)) <= 14:
            return " ".join(pair)
    return "".join(w[0].upper() for w in words[:4]) if len(words) > 1 else name[:14]


def initials(name):
    words = [w for w in re.split(r"[\s’'().,·-]+", name or "") if w and w.lower() not in SKIP_WORDS]
    return "".join(w[0].upper() for w in words[:2]) or "?"


def _hex(rgb):
    return "#%02X%02X%02X" % tuple(rgb[:3])


def _rgb(hexcolor):
    m = re.match(r"#?([0-9a-fA-F]{6})$", hexcolor or "")
    n = int(m.group(1), 16) if m else int(DEFAULT_ACCENT[1:], 16)
    return (n >> 16, (n >> 8) & 255, n & 255)


def _square(img, size, scale, bg):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = size * scale
    ratio = inner / max(img.width, img.height)
    logo = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas.convert("RGB")


def _font(size):
    for path in ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "/Library/Fonts/Georgia Bold.ttf",
                 "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def _monogram(text, size, scale, bg):
    """Icona sense logotip: les inicials, grans i centrades, sobre el color de l'agrupació."""
    canvas = Image.new("RGB", (size, size), bg)
    r, g, b = _rgb(bg)
    ink = (29, 24, 34) if (r * 299 + g * 587 + b * 114) / 1000 > 160 else (255, 255, 255)
    draw = ImageDraw.Draw(canvas)
    target = size * scale
    font_size = int(size * (0.46 if len(text) < 2 else 0.38) * scale / 0.8)
    font = _font(font_size)
    box = draw.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    if w > target:
        font = _font(max(8, int(font_size * target / w)))
        box = draw.textbbox((0, 0), text, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
    draw.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), text, font=font, fill=ink)
    return canvas


def _write(path, data):
    """Només reescriu si canvia, perquè git no vegi canvis falsos."""
    old = open(path, "rb").read() if os.path.exists(path) else None
    if old != data:
        with open(path, "wb") as f:
            f.write(data)


def _png(path, img):
    """Desa la imatge només si els píxels canvien: una altra versió de Pillow pot comprimir diferent."""
    if os.path.exists(path):
        try:
            old = Image.open(path)
            if old.size == img.size and old.convert(img.mode).tobytes() == img.tobytes():
                return
        except Exception:
            pass
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    _write(path, buf.getvalue())


def build(cfg, root=".", gid=None):
    """Genera la marca d'una agrupació. Sense gid, la de l'arrel (instal·lacions antigues)."""
    brand = cfg.get("brand") or {}
    accent = brand.get("accent") or DEFAULT_ACCENT
    out = os.path.join(root, "marca", gid) if gid else os.path.join(root, "marca")
    web = f"marca/{gid}/" if gid else "marca/"
    os.makedirs(out, exist_ok=True)
    bg, logo_url = accent, None
    name = (cfg.get("name") or "").strip() or "A Tempo"

    m = re.match(r"data:image/(png|jpe?g|webp);base64,(.+)$", brand.get("logo") or "", re.S)
    if m:
        img = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert("RGBA")
        corners = [img.getpixel(p) for p in [(0, 0), (img.width - 1, 0), (0, img.height - 1), (img.width - 1, img.height - 1)]]
        solid = [c for c in corners if c[3] > 250]
        own_bg = len(solid) >= 3            # el logotip ja porta el seu fons de color
        if own_bg:
            bg = _hex(solid[0])
        full = 1.0 if own_bg else 0.8
        _png(os.path.join(out, "logo.png"), img)
        _png(os.path.join(out, "icon-180.png"), _square(img, 180, full, bg))
        _png(os.path.join(out, "icon-192.png"), _square(img, 192, full, bg))
        _png(os.path.join(out, "icon-512.png"), _square(img, 512, full, bg))
        # Android retalla les icones «maskable» en cercle: el dibuix ha de quedar dins del 80 % central.
        _png(os.path.join(out, "icon-512-maskable.png"), _square(img, 512, 0.7 if own_bg else 0.6, bg))
        _png(os.path.join(out, "favicon-48.png"), _square(img, 48, full, bg))
        logo_url = f"{web}logo.png"
    elif gid:
        text = initials(cfg.get("shortName") or name)
        _png(os.path.join(out, "icon-180.png"), _monogram(text, 180, 0.8, bg))
        _png(os.path.join(out, "icon-192.png"), _monogram(text, 192, 0.8, bg))
        _png(os.path.join(out, "icon-512.png"), _monogram(text, 512, 0.8, bg))
        _png(os.path.join(out, "icon-512-maskable.png"), _monogram(text, 512, 0.6, bg))
        _png(os.path.join(out, "favicon-48.png"), _monogram(text, 48, 0.9, bg))
        if os.path.exists(os.path.join(out, "logo.png")):
            os.remove(os.path.join(out, "logo.png"))
    else:
        for src, dst in [("icon-180.png", "icon-180.png"), ("icon-512.png", "icon-192.png"), ("icon-512.png", "icon-512.png"),
                         ("icon-512.png", "icon-512-maskable.png"), ("icon-180.png", "favicon-48.png")]:
            shutil.copyfile(os.path.join(root, src), os.path.join(out, dst))
        if os.path.exists(os.path.join(out, "logo.png")):
            os.remove(os.path.join(out, "logo.png"))

    marca = {"name": name, "short": short_name(cfg), "accent": accent, "bg": bg, "logo": logo_url}
    manifest = {
        "name": name, "short_name": short_name(cfg), "description": "Assistència, calendari i avisos",
        "lang": "ca", "display": "standalone", "background_color": bg, "theme_color": bg,
    }
    if gid:
        # El manifest és dins de marca/<agrupació>/: l'app instal·lada obre directament aquesta agrupació.
        manifest.update({"start_url": f"../../?a={gid}", "scope": "../../"})
        icons = ""
        marca_path = os.path.join(out, "marca.json")
        manifest_path = os.path.join(out, "manifest.webmanifest")
    else:
        manifest.update({"start_url": "./", "scope": "./"})
        icons = "marca/"
        marca_path = os.path.join(root, "marca.json")
        manifest_path = os.path.join(root, "manifest.webmanifest")
    manifest["icons"] = [
        {"src": f"{icons}icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": f"{icons}icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": f"{icons}icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ]
    _write(marca_path, (json.dumps(marca, ensure_ascii=False, indent=1) + "\n").encode())
    _write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode())
    return marca


def prune(root, keep):
    """Treu la marca de les agrupacions que ja no hi són."""
    base = os.path.join(root, "marca")
    if not os.path.isdir(base):
        return
    for entry in os.listdir(base):
        path = os.path.join(base, entry)
        if os.path.isdir(path) and entry not in keep and re.fullmatch(r"[A-Za-z0-9_-]{20,40}", entry):
            shutil.rmtree(path)
