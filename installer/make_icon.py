#!/usr/bin/env python
"""Generate installer/app.ico (multi-size) from the brand palette.

The icon mirrors client/public/icon.svg: an indigo->fuchsia rounded
square with a white pet/paw mark, rendered in pure Pillow (no SVG rsvg
dependency) so it works cross-platform in CI.
"""
import os
from PIL import Image, ImageDraw

SIZES = [256, 128, 64, 48, 32, 16]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ss = size / 512.0  # scale factor from the 512 viewBox

    def p(v):
        return int(v * ss)

    # Rounded background with vertical gradient indigo(#6366f1)->fuchsia(#d946ef)
    # approximated by drawing horizontal slices through a rounded mask.
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=p(112), fill=255)
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    top = (0x63, 0x66, 0xF1)
    bot = (0xD9, 0x46, 0xEF)
    for y in range(size):
        t = y / max(1, size - 1)
        col = lerp(top, bot, t)
        gd.line([(0, y), (size, y)], fill=col + (255,))
    img.paste(grad, (0, 0), mask)

    # Pet mark: main circle + two ears + face, in white over dark details.
    white = (255, 255, 255, 255)
    dark = (0x0B, 0x10, 0x26, 255)
    cx, cy = p(256), p(210)
    r = p(86)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=white)
    # ears
    d.ellipse([p(104), p(98), p(196), p(202)], fill=white)
    d.ellipse([p(316), p(98), p(408), p(202)], fill=white)
    # eyes
    er = p(12)
    for ex in (p(222), p(290)):
        d.ellipse([ex - er, p(196) - er, ex + er, p(196) + er], fill=dark)
    # smile
    d.arc([p(232), p(230), p(280), p(248)], start=30, end=150, fill=dark, width=min(2, max(1, p(10))))

    return img


def main():
    imgs = [make(s) for s in SIZES]
    out = os.path.join(os.path.dirname(__file__), "app.ico")
    imgs[0].save(out, format="ICO", sizes=[(s, s) for s in SIZES])
    print("wrote", out)


if __name__ == "__main__":
    main()
