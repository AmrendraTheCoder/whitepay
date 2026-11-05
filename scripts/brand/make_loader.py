#!/usr/bin/env python3
"""
WhitePay loader: one timeline -> Lottie JSON (main + reduced-motion), 2x PNG sequence, MP4 previews.

Spec (docs/LOADER_PROMPT.md):
  512x512 canvas, transparent. Rounded tile #2448FF (radius 120/512 of the tile) with a soft blue glow
  (0 18px 40px, #2448FF @35%). White monoline W, path M110 168 L160 344 L216 216 L256 308 L296 216
  L352 344 L402 168, stroke 40, round caps/joins. Lime dot #DDF05A r=34 at (410,110).
  Ease cubic-bezier(.65,0,.35,1). 1.8 s loop:
    0.00-1.00 W draws on (trim end 0->100)
    1.00-1.10 dot jumps up 46px (scale 1.15), lands with squash (0.9), settles
    1.10-1.55 hold; tile breathes 1.00 -> 1.04 -> 1.00
    1.55-1.80 W un-draws (trim start 0->100)
  Reduced motion: static mark, lime dot opacity pulse over 2 s.

The tile is drawn at 78% of the canvas (400 px) so the glow has room inside the 512 canvas; all mark
coordinates stay in the original 512 design space (the tile layer is scaled, children are parented).

Usage: python3 -I scripts/brand/make_loader.py <out_dir>
"""
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/loader"
FPS = 60
LOOP = 1.8
FRAMES = round(LOOP * FPS)            # 108
BLUE = (0x24, 0x48, 0xFF)
LIME = (0xDD, 0xF0, 0x5A)
W_PATH = [(110, 168), (160, 344), (216, 216), (256, 308), (296, 216), (352, 344), (402, 168)]
TILE_SCALE = 0.78                     # tile occupies 400/512 of the canvas
STROKE = 40
DOT = (410, 110, 34)
EASE = (0.65, 0.0, 0.35, 1.0)

# ------------------------------------------------------------------ easing (same as Lottie/CSS)
def bezier(p1x, p1y, p2x, p2y):
    def sample(t, a, b):  # 1D cubic bezier with P0=0, P3=1
        return 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
    def ease(x):
        if x <= 0: return 0.0
        if x >= 1: return 1.0
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if sample(mid, p1x, p2x) < x: lo = mid
            else: hi = mid
        return sample((lo + hi) / 2, p1y, p2y)
    return ease
ease = bezier(*EASE)

def track(keys, t):
    """keys: [(time_s, value)], eased between keys with EASE."""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            k = ease((t - t0) / (t1 - t0))
            return v0 + (v1 - v0) * k
    return keys[-1][1]

# ------------------------------------------------------------------ the single timeline
TL = {
    "trim_end":   [(0.00, 0.0), (1.00, 100.0)],
    "trim_start": [(0.00, 0.0), (1.55, 0.0), (1.80, 100.0)],
    "dot_y":      [(0.00, 0.0), (1.00, 0.0), (1.04, -46.0), (1.10, 0.0)],
    "dot_sx":     [(0.00, 100.0), (1.00, 100.0), (1.04, 115.0), (1.10, 110.0), (1.17, 100.0)],
    "dot_sy":     [(0.00, 100.0), (1.00, 100.0), (1.04, 115.0), (1.10, 90.0), (1.17, 100.0)],
    "tile_s":     [(0.00, 100.0), (1.10, 100.0), (1.325, 104.0), (1.55, 100.0)],
}
REDUCED_DOT_OPACITY = [(0.0, 100.0), (1.0, 45.0), (2.0, 100.0)]

# ------------------------------------------------------------------ Lottie writer
def kf(keys, dims=1, fn=lambda v: v):
    """Animated property from TL keys (seconds -> frames), with EASE on every segment."""
    out = []
    for i, (t, v) in enumerate(keys):
        val = fn(v)
        val = val if isinstance(val, list) else [val]
        k = {"t": round(t * FPS, 3), "s": val}
        if i < len(keys) - 1:
            k["o"] = {"x": [EASE[0]] * dims, "y": [EASE[1]] * dims}
            k["i"] = {"x": [EASE[2]] * dims, "y": [EASE[3]] * dims}
        out.append(k)
    return {"a": 1, "k": out}

def static(v):
    return {"a": 0, "k": v}

def transform(p=(0, 0), a=(0, 0), s=(100, 100), o=100, r=0, anim=None):
    t = {"p": static(list(p)), "a": static(list(a)), "s": static(list(s)), "o": static(o), "r": static(r)}
    if anim: t.update(anim)
    return t

def group(name, items):
    return {"ty": "gr", "nm": name, "it": items + [{"ty": "tr", "p": static([0, 0]), "a": static([0, 0]),
            "s": static([100, 100]), "r": static(0), "o": static(100), "sk": static(0), "sa": static(0)}]}

def rgba(c, a=1.0):
    return [c[0] / 255, c[1] / 255, c[2] / 255, a]

def lottie(reduced=False):
    op = 2 * FPS if reduced else FRAMES
    tile_layer = {
        "ddd": 0, "ind": 3, "ty": 4, "nm": "Tile", "sr": 1, "ip": 0, "op": op, "st": 0, "bm": 0,
        "ks": transform(p=(256, 256), a=(256, 256), s=(TILE_SCALE * 100, TILE_SCALE * 100),
                        anim=None if reduced else {"s": kf(TL["tile_s"], 2, lambda v: [v * TILE_SCALE, v * TILE_SCALE])}),
        "shapes": [group("tile", [
            {"ty": "rc", "nm": "rect", "d": 1, "p": static([256, 256]), "s": static([512, 512]), "r": static(120)},
            {"ty": "fl", "nm": "blue", "c": static(rgba(BLUE)), "o": static(100), "r": 1},
        ])],
        # soft glow beneath: Drop Shadow (lottie-web supports ty 25); 35% of 255 = 89
        "ef": [{"ty": 25, "nm": "Drop Shadow", "np": 8, "mn": "ADBE Drop Shadow", "ix": 1, "en": 1, "ef": [
            {"ty": 2, "nm": "Shadow Color", "mn": "ADBE Drop Shadow-0001", "ix": 1, "v": static(rgba(BLUE))},
            {"ty": 0, "nm": "Opacity", "mn": "ADBE Drop Shadow-0002", "ix": 2, "v": static(89)},
            {"ty": 0, "nm": "Direction", "mn": "ADBE Drop Shadow-0003", "ix": 3, "v": static(180)},
            {"ty": 0, "nm": "Distance", "mn": "ADBE Drop Shadow-0004", "ix": 4, "v": static(18 / TILE_SCALE)},
            {"ty": 0, "nm": "Softness", "mn": "ADBE Drop Shadow-0005", "ix": 5, "v": static(80 / TILE_SCALE)},
            {"ty": 7, "nm": "Shadow Only", "mn": "ADBE Drop Shadow-0006", "ix": 6, "v": static(0)},
        ]}],
    }
    w_items = [
        {"ty": "sh", "nm": "W", "ks": static({"c": False, "v": [list(p) for p in W_PATH],
                                               "i": [[0, 0]] * len(W_PATH), "o": [[0, 0]] * len(W_PATH)})},
        {"ty": "st", "nm": "white stroke", "c": static(rgba((255, 255, 255))), "o": static(100), "w": static(STROKE),
         "lc": 2, "lj": 2, "ml": 4},
    ]
    if not reduced:
        w_items.append({"ty": "tm", "nm": "trim", "s": kf(TL["trim_start"]), "e": kf(TL["trim_end"]), "o": static(0), "m": 1})
    w_layer = {"ddd": 0, "ind": 2, "ty": 4, "nm": "W", "sr": 1, "ip": 0, "op": op, "st": 0, "bm": 0, "parent": 3,
               "ks": transform(), "shapes": [group("W", w_items)]}
    dx, dy, dr = DOT
    if reduced:
        dot_anim = {"o": kf(REDUCED_DOT_OPACITY)}
    else:
        # position keyframes need 2D values; scale keyframes animate x/y separately (squash)
        pos = [(t, [dx, dy + v]) for t, v in TL["dot_y"]]
        sx = dict(TL["dot_sx"]); sy = dict(TL["dot_sy"])
        times = sorted(set(sx) | set(sy))
        scl = [(t, [track(TL["dot_sx"], t), track(TL["dot_sy"], t)]) for t in times]
        dot_anim = {"p": kf(pos, 2), "s": kf(scl, 2)}
    dot_layer = {"ddd": 0, "ind": 1, "ty": 4, "nm": "Lime dot", "sr": 1, "ip": 0, "op": op, "st": 0, "bm": 0, "parent": 3,
                 "ks": transform(p=(dx, dy), a=(dx, dy), anim=dot_anim),
                 "shapes": [group("dot", [
                     {"ty": "el", "nm": "circle", "d": 1, "p": static([dx, dy]), "s": static([dr * 2, dr * 2])},
                     {"ty": "fl", "nm": "lime", "c": static(rgba(LIME)), "o": static(100), "r": 1},
                 ])]}
    return {"v": "5.12.1", "fr": FPS, "ip": 0, "op": op, "w": 512, "h": 512, "nm": "WhitePay loader" + (" (reduced)" if reduced else ""),
            "ddd": 0, "assets": [], "layers": [dot_layer, w_layer, tile_layer], "markers": [],
            "meta": {"g": "WhitePay make_loader.py", "d": "Brand loader. Ease cubic-bezier(.65,0,.35,1)."}}

# ------------------------------------------------------------------ renderer (same timeline)
SEG = list(zip(W_PATH, W_PATH[1:]))
SEG_LEN = [math.dist(a, b) for a, b in SEG]
TOTAL = sum(SEG_LEN)

def sub_path(s_pct, e_pct):
    s, e = TOTAL * s_pct / 100, TOTAL * e_pct / 100
    if e - s <= 0.01: return []
    pts, acc = [], 0.0
    for (a, b), L in zip(SEG, SEG_LEN):
        lo, hi = max(s, acc), min(e, acc + L)
        if hi > lo:
            fa, fb = (lo - acc) / L, (hi - acc) / L
            p0 = (a[0] + (b[0] - a[0]) * fa, a[1] + (b[1] - a[1]) * fa)
            p1 = (a[0] + (b[0] - a[0]) * fb, a[1] + (b[1] - a[1]) * fb)
            if not pts: pts.append(p0)
            pts.append(p1)
        acc += L
    return pts

def render(t, size=1024, reduced=False, ss=2):
    """Transparent RGBA frame at time t (seconds)."""
    S = size * ss
    k = S / 512                                   # design px -> canvas px
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    tile_s = (100.0 if reduced else track(TL["tile_s"], t)) / 100 * TILE_SCALE
    def M(x, y):                                   # mark space (512) -> canvas, tile scaled about center
        return ((256 + (x - 256) * tile_s) * k, (256 + (y - 256) * tile_s) * k)
    # glow (drawn first, beneath)
    glow = Image.new("L", (S, S), 0)
    gx0, gy0 = M(0, 0); gx1, gy1 = M(512, 512)
    off = 18 * k
    ImageDraw.Draw(glow).rounded_rectangle([gx0, gy0 + off, gx1, gy1 + off], radius=120 * tile_s * k, fill=int(255 * 0.35))
    glow = glow.filter(ImageFilter.GaussianBlur(20 * k))   # CSS blur 40px ~ sigma 20
    img.paste(Image.new("RGBA", (S, S), BLUE + (255,)), (0, 0), glow)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([gx0, gy0, gx1, gy1], radius=120 * tile_s * k, fill=BLUE + (255,))
    # W with trim
    s_pct = 0.0 if reduced else track(TL["trim_start"], t)
    e_pct = 100.0 if reduced else track(TL["trim_end"], t)
    pts = [M(*p) for p in sub_path(s_pct, e_pct)]
    w = STROKE * tile_s * k
    if len(pts) >= 2:
        d.line(pts, fill=(255, 255, 255, 255), width=round(w), joint="curve")
        for (x, y) in (pts[0], pts[-1]):            # round caps
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=(255, 255, 255, 255))
    # lime dot
    dx, dy, dr = DOT
    if reduced:
        alpha = int(255 * track(REDUCED_DOT_OPACITY, t % 2.0) / 100)
        sx = sy = 1.0; oy = 0.0
    else:
        alpha = 255
        sx, sy, oy = track(TL["dot_sx"], t) / 100, track(TL["dot_sy"], t) / 100, track(TL["dot_y"], t)
    cx, cy = M(dx, dy + oy)
    rx, ry = dr * sx * tile_s * k, dr * sy * tile_s * k
    dot = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(dot).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=LIME + (alpha,))
    img = Image.alpha_composite(img, dot)
    return img.resize((size, size), Image.LANCZOS)

def main():
    os.makedirs(OUT, exist_ok=True)
    for reduced, name in ((False, "whitepay-loader.json"), (True, "whitepay-loader-reduced.json")):
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(lottie(reduced), f, separators=(",", ":"))
    # 2x PNG sequence (1024x1024, 60 fps, one loop)
    png_dir = os.path.join(OUT, "png@2x")
    os.makedirs(png_dir, exist_ok=True)
    for i in range(FRAMES):
        render(i / FPS).save(os.path.join(png_dir, f"whitepay-loader_{i:03d}.png"), optimize=True)
    # 3 s MP4 previews (loop continues past 1.8 s) on dark and light
    for bg, tag in (("#0A0C19", "dark"), ("#F4F6FD", "light")):
        tmp = os.path.join(OUT, f".frames-{tag}")
        os.makedirs(tmp, exist_ok=True)
        for i in range(3 * FPS):
            frame = render((i / FPS) % LOOP, size=720)
            canvas = Image.new("RGBA", frame.size, bg)
            Image.alpha_composite(canvas, frame).convert("RGB").save(os.path.join(tmp, f"{i:03d}.png"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "%03d.png"),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart",
                        os.path.join(OUT, f"whitepay-loader-preview-{tag}.mp4")], check=True)
        for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
        os.rmdir(tmp)
    print("done:", sorted(os.listdir(OUT)))

if __name__ == "__main__":
    main()
