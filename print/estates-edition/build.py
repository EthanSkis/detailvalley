#!/usr/bin/env python3
"""Builds the Detail Valley half-page ad for Estates Edition (C2 Media Group).

Spec (estatesedition.com/resources): half page is 4.75in x 3.7in, no bleed,
300 dpi, CMYK, all text outlined, no crop marks.

What this writes, next to this file:
  detail-valley-half-page.pdf   the print-ready ad: CMYK, text as outlines
  detail-valley-half-page.png   an RGB preview for looking at on a screen

Every colour is given as CMYK ink values, text is drawn as vector outlines
(no fonts are embedded), and the photo is converted to CMYK through an ICC
profile, so nothing is left for the printer's software to guess at.

Needs:  pip install reportlab pillow fonttools brotli uharfbuzz segno
        apt install ghostscript poppler-utils   (CMYK profile, preview)
Run:    python3 print/estates-edition/build.py
"""
import io
import os
import re
import subprocess
from pathlib import Path

import segno
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from PIL import Image, ImageCms, ImageFilter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfdoc import PDFDictionary
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'detail-valley-half-page.pdf'
CMYK_ICC = os.environ.get('CMYK_ICC', '/usr/share/color/icc/ghostscript/default_cmyk.icc')

IN = 72.0
W, H = 4.75 * IN, 3.7 * IN          # 342 x 266.4 pt, the half-page trim

# ---- Copy. Edit here, re-run, done. --------------------------------------
EYEBROW = 'MOBILE DETAILING · WE COME TO YOU'
HEADLINE = ['A spotless car,', 'without leaving', 'your driveway.']
# Broken by hand so no community's name is split across two lines.
BODY = ['Hand detailing at your home in Tamarack,',
        'Whitetail Club, Jug Mountain Ranch,',
        'McCall Golf Club and Meadow Creek.']
# The owner's own words, beside his photo.
OWNER_SAYS = '“One vehicle a day, done by hand. Not happy? I fix it.”'
OWNER_NAME = 'ETHAN GARDNER, OWNER'
OWNER_NOTE = 'Local student, saving for college'
OWNER_PHOTO = HERE / 'ethan.jpg'
QUOTE = ['“The ease of scheduling and immaculate', 'work are second to none!”']
QUOTE_BY = 'Google review'
SITE = 'detailvalley.com'
PHONE = 'Call or text (208) 315-1420'
# ?src=ee lets the booking flow pre-pick "Estates Edition magazine" under
# "How'd you hear about us?", so the job board can count what this ad brings in.
QR_URL = 'https://detailvalley.com/?src=ee'
PHOTO = HERE / 'range-rover.jpg'       # AI-retouched light and colour; plate blanked

# ---- Brand colours as CMYK ink (0..1) ------------------------------------
NAVY = (1.00, 0.78, 0.40, 0.55)      # #0b2a45
COPPER = (0.18, 0.76, 1.00, 0.08)    # #bc5823, the logo's copper
PEACH = (0.03, 0.42, 0.62, 0.00)     # copper, lightened to read on navy
NAVY_LINE = (0.82, 0.58, 0.30, 0.28) # a hairline that shows on navy
MIST = (0.05, 0.02, 0.01, 0.00)      # #f0f3f6
WHITE = (0, 0, 0, 0)
INK = (0, 0, 0, 1)                   # QR only: one ink keeps small modules crisp


class Face:
    """A font we can shape with HarfBuzz and draw as outlines."""

    def __init__(self, name):
        tt = TTFont(HERE / 'fonts' / name)
        tt.flavor = None                      # woff2 -> plain sfnt for HarfBuzz
        buf = io.BytesIO()
        tt.save(buf)
        data = buf.getvalue()
        self.tt = TTFont(io.BytesIO(data))
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upm = self.tt['head'].unitsPerEm
        self.hb = hb.Font(hb.Face(data))

    def shape(self, s, size, track=0.0):
        b = hb.Buffer()
        b.add_str(s)
        b.guess_segment_properties()
        hb.shape(self.hb, b, {'kern': True, 'liga': True})
        k, x, out = size / self.upm, 0.0, []
        for info, pos in zip(b.glyph_infos, b.glyph_positions):
            out.append((self.order[info.codepoint], x + pos.x_offset * k, pos.y_offset * k))
            x += pos.x_advance * k + track
        return out, (x - track if out else 0.0)

    def width(self, s, size, track=0.0):
        return self.shape(s, size, track)[1]


class _PathPen(BasePen):
    """Feeds a glyph outline into a reportlab path, scaled and moved."""

    def __init__(self, glyphs, path, k, dx, dy):
        super().__init__(glyphs)
        self.p, self.k, self.dx, self.dy = path, k, dx, dy

    def _pt(self, p):
        return self.dx + p[0] * self.k, self.dy + p[1] * self.k

    def _moveTo(self, p):
        self.p.moveTo(*self._pt(p))

    def _lineTo(self, p):
        self.p.lineTo(*self._pt(p))

    def _curveToOne(self, a, b, c):
        self.p.curveTo(*self._pt(a), *self._pt(b), *self._pt(c))

    def _closePath(self):
        self.p.close()


def text(c, face, s, size, x, y, color, track=0.0, align='l'):
    """Draws a line of text as filled outlines. Returns its width."""
    glyphs, w = face.shape(s, size, track)
    if align == 'r':
        x -= w
    elif align == 'c':
        x -= w / 2
    c.setFillColorCMYK(*color)
    p = c.beginPath()
    for name, gx, gy in glyphs:
        face.glyphs[name].draw(_PathPen(face.glyphs, p, size / face.upm, x + gx, y + gy))
    c.drawPath(p, stroke=0, fill=1, fillMode=1)      # non-zero winding, like fonts
    return w


def wrap(face, s, size, width):
    lines, cur = [], ''
    for word in s.split():
        trial = (cur + ' ' + word).strip()
        if cur and face.width(trial, size) > width:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    return lines + [cur]


def rect(c, x, y, w, h, color):
    c.setFillColorCMYK(*color)
    c.rect(x, y, w, h, stroke=0, fill=1)


def logo(c, x, y, size):
    """Draws logo.svg (straight-line paths only) with its lower-left at x, y."""
    svg = (ROOT / 'logo.svg').read_text()
    inks = {'#0B2A45': NAVY, '#F0F3F6': MIST, '#BC5823': COPPER}
    k = size / 1254.0
    for tx, ty, d, fill in re.findall(
            r'<path transform="translate\(([\d.]+)(?:,([\d.]+))?\)" d="([^"]+)" fill="(#\w+)"', svg):
        ox, oy = float(tx), float(ty or 0)
        cx = cy = sx = sy = 0.0
        p = c.beginPath()
        for cmd, args in re.findall(r'([mlhvz])([^mlhvz]*)', d):
            n = [float(v) for v in re.findall(r'-?\d*\.?\d+', args)]
            if cmd == 'z':
                p.close()
                cx, cy = sx, sy
                continue
            if cmd == 'h':
                steps = [(v, 0.0) for v in n]
            elif cmd == 'v':
                steps = [(0.0, v) for v in n]
            else:
                steps = list(zip(n[0::2], n[1::2]))
            for i, (dx, dy) in enumerate(steps):
                cx, cy = cx + dx, cy + dy
                px, py = x + (ox + cx) * k, y + size - (oy + cy) * k
                if cmd == 'm' and i == 0:
                    p.moveTo(px, py)
                    sx, sy = cx, cy
                else:
                    p.lineTo(px, py)
        c.setFillColorCMYK(*inks[fill.upper()])
        c.drawPath(p, stroke=0, fill=1, fillMode=1)


def star(c, cx, cy, r, color):
    import math
    p = c.beginPath()
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        (p.moveTo if i == 0 else p.lineTo)(cx + rr * math.cos(a), cy + rr * math.sin(a))
    p.close()
    c.setFillColorCMYK(*color)
    c.drawPath(p, stroke=0, fill=1)


def to_cmyk(im):
    return ImageCms.profileToProfile(
        im.convert('RGB'), ImageCms.createProfile('sRGB'), ImageCms.getOpenProfile(CMYK_ICC),
        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, outputMode='CMYK',
        flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)


def portrait(c, path, x, y, d, ring):
    """A round photo, d across, lower-left at x, y, with a thin ring."""
    im = Image.open(path)
    im = im.resize((360, 360), Image.LANCZOS)          # 600+ dpi at this size
    c.saveState()
    p = c.beginPath()
    p.circle(x + d / 2, y + d / 2, d / 2)
    c.clipPath(p, stroke=0, fill=0)
    c.drawImage(ImageReader(to_cmyk(im)), x, y, d, d)
    c.restoreState()
    c.setStrokeColorCMYK(*ring)
    c.setLineWidth(0.9)
    c.circle(x + d / 2, y + d / 2, d / 2, stroke=1, fill=0)


def photo_cmyk(path, aspect, anchor_y=0.5):
    """Crops the photo to `aspect` (w/h) and converts sRGB -> CMYK."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    if w / h > aspect:
        nw = round(h * aspect)
        left = w - nw                 # keep the right edge; trims the plate
        im = im.crop((left, 0, left + nw, h))
    else:
        nh = round(w / aspect)
        top = round((h - nh) * anchor_y)
        im = im.crop((0, top, w, top + nh))
    return to_cmyk(im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2)))


def qr(c, x, y, size, data):
    """QR code as vector squares in a white tile; x, y is the tile's lower-left."""
    code = segno.make(data, error='m', micro=False)
    rows = [list(r) for r in code.matrix]
    n, quiet = len(rows), 2
    m = size / (n + 2 * quiet)
    c.setFillColorCMYK(*WHITE)
    c.roundRect(x, y, size, size, 2.5, stroke=0, fill=1)
    c.setFillColorCMYK(*INK)
    p = c.beginPath()
    for r, row in enumerate(rows):
        run = None
        for col, on in enumerate(row + [0]):          # merge runs into one rect
            if on and run is None:
                run = col
            elif not on and run is not None:
                p.rect(x + (quiet + run) * m, y + size - (quiet + r + 1) * m, (col - run) * m, m)
                run = None
    c.drawPath(p, stroke=0, fill=1)
    return m


def build():
    sora7, sora6 = Face('sora-latin-700-normal.woff2'), Face('sora-latin-600-normal.woff2')
    int4, int5 = Face('inter-latin-400-normal.woff2'), Face('inter-latin-500-normal.woff2')
    int6, int7 = Face('inter-latin-600-normal.woff2'), Face('inter-latin-700-normal.woff2')

    c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
    c.setTitle('Detail Valley · Estates Edition half page')
    c.setAuthor('Detail Valley')
    # reportlab puts a default Helvetica on every page even when no text uses
    # it. Take it back out so the file really has no fonts in it.
    c._preamble = '1 0 0 1 0 0 cm'
    doc = c._doc
    for name in list(doc.idToObject['BasicFonts'].dict):
        del doc.idToObject['BasicFonts'].dict[name]
        doc.idToObject[name] = PDFDictionary({})     # object numbers must stay in step
    doc.fontMapping.clear()

    BAND = 58.0                    # bottom call-to-action band
    SPLIT = 188.0                  # navy copy panel | photo
    top_h = H - BAND

    # --- Photo, upper right ------------------------------------------------
    pw = W - SPLIT
    im = photo_cmyk(PHOTO, pw / top_h, anchor_y=0.5)
    c.drawImage(ImageReader(im), SPLIT, BAND, pw, top_h)
    dpi = im.size[0] / (pw / IN)

    # --- Navy copy panel, upper left --------------------------------------
    rect(c, 0, BAND, SPLIT, top_h, NAVY)
    mx = 16.0
    tw = SPLIT - mx - 14.0
    y = H - 23.5
    text(c, int7, EYEBROW, 5.6, mx, y, PEACH, track=0.75)

    hs = 30.0                      # headline: as big as the panel allows
    while max(sora7.width(l, hs) for l in HEADLINE) > tw:
        hs -= 0.1
    lead = hs * 1.14
    y -= 10.0 + hs * 0.74
    for line in HEADLINE:
        text(c, sora7, line, hs, mx, y, WHITE)
        y -= lead
    y += lead

    rect(c, mx, y - 11.5, 22, 1.6, COPPER)
    y -= 24.5
    assert max(int4.width(l, 7.6) for l in BODY) <= tw, 'body line too wide'
    for line in BODY:
        text(c, int4, line, 7.6, mx, y, MIST)
        y -= 10.9
    body_foot = y + 10.9 - 2.2             # bottom of the last line of body copy

    # The owner, in his own words, sitting on the foot of the panel.
    pd = 40.0
    py = BAND + 12.5
    rule_y = py + pd + 8.0
    assert body_foot - rule_y > 6, 'copy panel overflows'
    rect(c, mx, rule_y, tw, 0.5, NAVY_LINE)
    portrait(c, OWNER_PHOTO, mx, py, pd, PEACH)
    ox = mx + pd + 9.5
    says = wrap(int5, OWNER_SAYS, 7.4, SPLIT - 14.0 - ox)
    oy = py + pd - 6.6 if len(says) > 1 else py + pd - 11.5
    for line in says:
        text(c, int5, line, 7.4, ox, oy, WHITE)
        oy -= 10.0
    oy -= 1.2
    text(c, int7, OWNER_NAME, 5.2, ox, oy, PEACH, track=0.6)
    text(c, int4, OWNER_NOTE, 6.3, ox, oy - 8.6, MIST)

    # --- Review chip over the trees at the head of the photo ---------------
    ch, cm = 40.0, 7.0
    cx0, cy0, cw = SPLIT + cm, H - cm - ch, pw - 2 * cm
    c.setFillColorCMYK(*WHITE)
    c.roundRect(cx0, cy0, cw, ch, 3, stroke=0, fill=1)
    for i in range(5):
        star(c, cx0 + 11.2 + i * 8.6, cy0 + ch - 9.4, 3.9, COPPER)
    text(c, int6, QUOTE_BY, 4.9, cx0 + cw - 7.5, cy0 + ch - 11.2, NAVY, align='r')
    qs = 6.3
    while max(int5.width(l, qs) for l in QUOTE) > cw - 15:
        qs -= 0.05
    for i, line in enumerate(QUOTE):
        text(c, int5, line, qs, cx0 + 7.5, cy0 + 16.8 - i * 8.6, NAVY)

    # --- Call-to-action band ----------------------------------------------
    rect(c, 0, 0, W, BAND, COPPER)
    ls = 40.0
    logo(c, 13, (BAND - ls) / 2, ls)
    text(c, sora7, 'Detail Valley', 14.2, 61, 30.6, WHITE)
    text(c, int6, 'McCALL · DONNELLY · CASCADE', 4.9, 61.5, 20.2, WHITE, track=0.55)

    qsz = 48.0
    qx = W - 12 - qsz
    mod = qr(c, qx, (BAND - qsz) / 2, qsz, QR_URL)
    rx = qx - 9
    text(c, int7, 'BOOK IN UNDER A MINUTE', 5.2, rx, 41.6, WHITE, track=0.6, align='r')
    text(c, sora7, SITE, 12.2, rx, 27.4, WHITE, align='r')
    text(c, int6, PHONE, 7.0, rx, 15.4, WHITE, align='r')

    c.showPage()
    c.save()

    print(f'{OUT.name}: {W / IN:.2f} x {H / IN:.2f} in')
    print(f'photo {im.size[0]} x {im.size[1]} px, {dpi:.0f} dpi at print size')
    print(f'headline {hs:.1f} pt, quote {qs:.2f} pt, QR module {mod / IN * 25.4:.2f} mm')
    subprocess.run(['pdftoppm', '-png', '-r', '300', '-singlefile', str(OUT), str(OUT.with_suffix(''))],
                   check=True)


if __name__ == '__main__':
    build()
