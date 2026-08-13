#!/usr/bin/env python3
"""Build branded before/after social cards from the gallery photos.

Reads the paired *-before.jpg / *-after.jpg files out of gallery/<vehicle>/
and writes 1080x1200 Facebook-ready cards into social/<vehicle>/.

    python3 social/make-social-cards.py

Requires Pillow and the fonts listed in FONT_DIRS.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIRS = [
    "/mnt/skills/examples/canvas-design/canvas-fonts",
    os.path.join(REPO, "social", "fonts"),
]

# --- brand ------------------------------------------------------------------
NAVY_TOP = (18, 52, 78)
NAVY_BOT = (8, 26, 42)
COPPER = (184, 99, 44)
COPPER_LT = (201, 126, 58)
MIST = (238, 244, 249)
MUTE = (147, 167, 184)
WHITE = (255, 255, 255)

PHONE = "(208) 315-1420"
SITE = "detailvalley.com"
TAGLINE = "MOBILE CAR DETAILING  ·  VALLEY COUNTY, ID"
CTA = "BOOK AT DETAILVALLEY.COM"

# --- layout -----------------------------------------------------------------
W, H = 1080, 1200
PAD = 28
GAP = 12
PHOTO_W = (W - 2 * PAD - GAP) // 2          # 502
PHOTO_H = 738
PHOTO_Y = 152
RADIUS = 20

# --- the shots --------------------------------------------------------------
# slug, eyebrow area name, headline, subline
VEHICLES = {
    "4runner": {
        "model": "TOYOTA 4RUNNER TRD PRO",
        "shots": [
            ("drivers-side", "FULL INTERIOR DETAIL", "Your interior, brought back.",
             "Mobile detailing — we come to your driveway."),
            ("front-cabin", "FRONT CABIN", "Front to back, top to bottom.",
             "Mobile detailing — we come to your driveway."),
            ("driver-floor-mat", "FLOOR MATS", "Scrubbed down to the tread.",
             "Mats pulled, washed, and dried before they go back in."),
            ("center-console", "CENTER CONSOLE", "Every crevice, by hand.",
             "Detail brushes and compressed air, not just a wipe-down."),
            ("infotainment", "DASH & SCREEN", "Dust out of every vent.",
             "Screens and trim cleaned with automotive-safe product."),
            ("steering-wheel", "STEERING WHEEL", "Clean where you touch most.",
             "Wheel, shifter, and switches cleaned and conditioned."),
            ("rear-seats", "REAR SEATS", "Kids, dogs, trail dust — gone.",
             "Hot water extraction on the fabric and carpet."),
            ("rear-bench", "REAR BENCH", "The back row, reset.",
             "Mobile detailing — we come to your driveway."),
            ("rear-footwells", "REAR FOOTWELLS", "Where the dirt hides.",
             "The spots most washes skip get the most attention."),
            ("cargo-area", "CARGO AREA", "Room for the gear again.",
             "Everything out, vacuumed, extracted, and put back."),
        ],
    },
}


def font(name, size):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    raise SystemExit(f"missing font {name} — looked in {FONT_DIRS}")


F_WORD = font("Outfit-Bold.ttf", 34)
F_TAG = font("Outfit-Regular.ttf", 15)
F_URL = font("Outfit-Bold.ttf", 23)
F_BADGE = font("Outfit-Bold.ttf", 27)
F_EYEBROW = font("Outfit-Bold.ttf", 16)
F_SUB = font("Outfit-Regular.ttf", 23)
F_CTA = font("Outfit-Bold.ttf", 24)
F_PHONE = font("Outfit-Bold.ttf", 27)


def tracked(draw, xy, text, fnt, fill, tracking=0.0, align="left"):
    """Draw letter-spaced text. Returns total width."""
    widths = [draw.textlength(c, font=fnt) for c in text]
    total = sum(widths) + tracking * max(len(text) - 1, 0)
    x, y = xy
    if align == "center":
        x -= total / 2
    elif align == "right":
        x -= total
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=fnt, fill=fill, anchor="la")
        x += w + tracking
    return total


def fit_font(draw, text, name, size, max_w, min_size=34):
    """Step the size down until the text fits the column."""
    while size > min_size:
        f = font(name, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(name, min_size)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def cover(path, w, h):
    """Center-crop to the target aspect, then resize."""
    im = Image.open(path).convert("RGB")
    src_ar, dst_ar = im.width / im.height, w / h
    if src_ar > dst_ar:                      # too wide -> crop sides
        nw = int(round(im.height * dst_ar))
        left = (im.width - nw) // 2
        im = im.crop((left, 0, left + nw, im.height))
    else:                                    # too tall -> crop top/bottom
        nh = int(round(im.width / dst_ar))
        top = (im.height - nh) // 2
        im = im.crop((0, top, im.width, top + nh))
    return im.resize((w, h), Image.LANCZOS)


def build_card(before_path, after_path, eyebrow, headline, subline, out_path):
    # background gradient
    canvas = Image.new("RGB", (W, H), NAVY_BOT)
    grad = Image.new("RGB", (1, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / (H - 1)
        gd.point((0, y), fill=tuple(int(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOT)))
    canvas.paste(grad.resize((W, H)), (0, 0))

    # soft copper glow behind the "after" side
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [int(W * 0.50), PHOTO_Y - 80, int(W * 1.20), PHOTO_Y + PHOTO_H + 80],
        fill=COPPER + (52,))
    canvas = Image.alpha_composite(canvas.convert("RGBA"),
                                   glow.filter(ImageFilter.GaussianBlur(130))).convert("RGB")
    draw = ImageDraw.Draw(canvas, "RGBA")

    # header
    logo = Image.open(os.path.join(REPO, "logo.png")).convert("RGBA").resize((78, 78), Image.LANCZOS)
    lmask = Image.new("L", (78 * 4, 78 * 4), 0)
    ImageDraw.Draw(lmask).ellipse([0, 0, 78 * 4 - 1, 78 * 4 - 1], fill=255)
    logo.putalpha(Image.composite(logo.getchannel("A"), Image.new("L", (78, 78), 0),
                                  lmask.resize((78, 78), Image.LANCZOS)))
    canvas.paste(logo, (PAD, 32), logo)

    tx = PAD + 78 + 20
    tracked(draw, (tx, 42), "DETAIL VALLEY", F_WORD, MIST, tracking=3.2)
    tracked(draw, (tx + 2, 84), TAGLINE, F_TAG, MUTE, tracking=1.6)
    tracked(draw, (W - PAD, 56), SITE, F_URL, COPPER_LT, tracking=0.4, align="right")

    # drop shadow under the photo pair
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i in range(2):
        x = PAD + i * (PHOTO_W + GAP)
        sd.rounded_rectangle([x, PHOTO_Y + 10, x + PHOTO_W, PHOTO_Y + PHOTO_H + 14],
                             radius=RADIUS, fill=(0, 0, 0, 150))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"),
                                       shadow.filter(ImageFilter.GaussianBlur(18))).convert("RGB"), (0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    for i, (kind, path, label) in enumerate((("before", before_path, "BEFORE"),
                                             ("after", after_path, "AFTER"))):
        x = PAD + i * (PHOTO_W + GAP)
        photo = cover(path, PHOTO_W, PHOTO_H).convert("RGBA")

        # top scrim so the badge always reads
        scrim = Image.new("RGBA", (PHOTO_W, 150), (0, 0, 0, 0))
        sdr = ImageDraw.Draw(scrim)
        for y in range(150):
            sdr.line([(0, y), (PHOTO_W, y)], fill=(4, 16, 26, int(150 * (1 - y / 150) ** 1.5)))
        photo.alpha_composite(scrim, (0, 0))

        photo = rounded(photo.convert("RGB"), RADIUS)
        canvas.paste(photo, (x, PHOTO_Y), photo)
        draw.rounded_rectangle([x, PHOTO_Y, x + PHOTO_W - 1, PHOTO_Y + PHOTO_H - 1],
                               radius=RADIUS, outline=(255, 255, 255, 46), width=2)

        bx, by, bh = x + 18, PHOTO_Y + 18, 46
        tw = sum(draw.textlength(c, font=F_BADGE) for c in label) + 2.4 * (len(label) - 1)
        bw = int(tw) + 44
        if kind == "after":
            draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh // 2, fill=COPPER + (255,))
            tracked(draw, (bx + 22, by + 9), label, F_BADGE, WHITE, tracking=2.4)
        else:
            draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh // 2,
                                   fill=(8, 22, 36, 205), outline=(255, 255, 255, 120), width=2)
            tracked(draw, (bx + 22, by + 9), label, F_BADGE, MIST, tracking=2.4)

    # arrow chip on the seam
    cx, cy, r = W // 2, PHOTO_Y + PHOTO_H // 2, 33
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COPPER + (255,),
                 outline=(255, 255, 255, 90), width=3)
    draw.polygon([(cx - 9, cy - 14), (cx + 13, cy), (cx - 9, cy + 14)], fill=WHITE)

    # footer
    fy = PHOTO_Y + PHOTO_H
    tracked(draw, (PAD, fy + 34), eyebrow, F_EYEBROW, COPPER_LT, tracking=2.6)
    f_head = fit_font(draw, headline, "Outfit-Bold.ttf", 50, W - 2 * PAD)
    draw.text((PAD - 2, fy + 62), headline, font=f_head, fill=MIST, anchor="la")
    draw.text((PAD, fy + 126), subline, font=F_SUB, fill=MUTE, anchor="la")

    cw = sum(draw.textlength(c, font=F_CTA) for c in CTA) + 1.8 * (len(CTA) - 1)
    px0, py0, ph = PAD, fy + 178, 64
    draw.rounded_rectangle([px0, py0, px0 + int(cw) + 60, py0 + ph], radius=ph // 2,
                           fill=COPPER + (255,))
    tracked(draw, (px0 + 30, py0 + 19), CTA, F_CTA, WHITE, tracking=1.8)
    draw.text((W - PAD, py0 + 18), PHONE, font=F_PHONE, fill=MIST, anchor="ra")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.convert("RGB").save(out_path, "JPEG", quality=92, optimize=True, progressive=True)
    return out_path


def main():
    wanted = sys.argv[1:] or list(VEHICLES)
    for vehicle in wanted:
        spec = VEHICLES[vehicle]
        for slug, area, headline, subline in spec["shots"]:
            before = os.path.join(REPO, "gallery", vehicle, f"{slug}-before.jpg")
            after = os.path.join(REPO, "gallery", vehicle, f"{slug}-after.jpg")
            if not (os.path.exists(before) and os.path.exists(after)):
                print(f"skip {vehicle}/{slug} — missing source")
                continue
            out = os.path.join(REPO, "social", vehicle, f"{slug}.jpg")
            build_card(before, after, f"{area}  ·  {spec['model']}", headline, subline, out)
            print(f"wrote {os.path.relpath(out, REPO)}")


if __name__ == "__main__":
    main()
