"""Mouth shapes and blink overlay for the radio portraits (lip sync in game).

The variants (assets-src/faces/var/<id>_{half,open,round,blink}.png) were made by
image edits of the originals (assets-src/faces/<id>.png). An edit may shift the
picture a little or change details elsewhere, so only the mouth (resp. the eyes) is
taken over: aligned to the original, colour-matched, blended in with a soft mask.

Writes public/assets/faces/<id>.webp (the face, mouth closed) and transparent
overlays <id>_{half,open,round}.webp (mouth) and <id>_eyes.webp (closed eyes) that the
game draws over it. Overlays, not whole frames: the rest of the face stays exactly the
same pixels, nothing shimmers when the mouth changes.
Run: python3 tools/lipsync-faces.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

SRC = 'assets-src/faces'
OUT = 'public/assets/faces'
W, H = 512, 384


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def gray(a):
    return a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def shift(a, dx, dy):
    """translate an image by whole pixels (edges repeat)"""
    h, w = a.shape[:2]
    ys = np.clip(np.arange(h) - dy, 0, h - 1)
    xs = np.clip(np.arange(w) - dx, 0, w - 1)
    return a[ys][:, xs]


def align(base, var):
    """the integer shift that lays var over base (coarse search on 1/4 size, then fine)"""
    gb, gv = gray(base), gray(var)
    h, w = gb.shape
    roi = (slice(int(h * 0.1), int(h * 0.9)), slice(int(w * 0.2), int(w * 0.8)))
    small = lambda g: g[::4, ::4]
    sb, sv = small(gb), small(gv)
    best, bd = (0, 0), 1e18
    r = (slice(roi[0].start // 4, roi[0].stop // 4), slice(roi[1].start // 4, roi[1].stop // 4))
    for dy in range(-8, 9):
        for dx in range(-8, 9):
            d = np.mean(np.abs(shift(sv, dx, dy)[r] - sb[r]))
            if d < bd:
                bd, best = d, (dx, dy)
    cx, cy = best[0] * 4, best[1] * 4
    best2, bd = (cx, cy), 1e18
    for dy in range(cy - 4, cy + 5):
        for dx in range(cx - 4, cx + 5):
            d = np.mean(np.abs(shift(gv, dx, dy)[roi] - gb[roi]))
            if d < bd:
                bd, best2 = d, (dx, dy)
    return best2


def blur(m, r):
    return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def region(diffs, y0, y1):
    """bounding box of where the variants differ from the original (inside a band)"""
    d = sum(diffs)
    h, w = d.shape
    band = np.zeros_like(d)
    band[int(h * y0) : int(h * y1), int(w * 0.3) : int(w * 0.7)] = 1
    d = blur(d / (d.max() + 1e-6), 6) * band
    ys, xs = np.nonzero(d > d.max() * 0.25)
    return xs.min(), xs.max(), ys.min(), ys.max()


def ellipse(shape, box, grow, feather):
    h, w = shape
    x0, x1, y0, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 * grow + 12, (y1 - y0) / 2 * grow + 12
    yy, xx = np.mgrid[0:h, 0:w]
    m = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1).astype(np.float32)
    return blur(m, feather)


def match(base, var, mask):
    """shift the variant's colours to the original's around the patch"""
    ring = (blur(mask, 20) > 0.02) & (mask < 0.5)
    out = var.copy()
    for c in range(3):
        out[..., c] += base[..., c][ring].mean() - var[..., c][ring].mean()
    return out


def save(a, name, alpha=None):
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # cover-fit to the display (4:3), like the other face stills
    s = max(W / img.width, H / img.height)
    size = (round(img.width * s), round(img.height * s))
    img = img.resize(size, Image.LANCZOS)
    l, t = (size[0] - W) // 2, (size[1] - H) // 2
    img = img.crop((l, t, l + W, t + H))
    if alpha is not None:
        al = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8)).resize(size, Image.LANCZOS).crop((l, t, l + W, t + H))
        rgb = np.asarray(img, dtype=np.uint8).copy()
        rgb[np.asarray(al) == 0] = 0  # nothing to store where it is transparent
        img = Image.fromarray(rgb)
        img.putalpha(al)
        img.save(os.path.join(OUT, name + '.webp'), quality=88, alpha_quality=90, method=6)
    else:
        img.save(os.path.join(OUT, name + '.webp'), quality=82)


def main():
    os.makedirs(OUT, exist_ok=True)
    for fid in ['instructor', 'h2', 'h3']:
        base = load(f'{SRC}/{fid}.png')
        var = {}
        for k in ['half', 'open', 'round', 'blink']:
            v = load(f'{SRC}/var/{fid}_{k}.png')
            dx, dy = align(base, v)
            var[k] = shift(v, dx, dy)
            print(fid, k, 'shift', dx, dy)
        gb = gray(base)
        mouth_box = region([np.abs(gray(var[k]) - gb) for k in ['half', 'open', 'round']], 0.5, 0.85)
        eye_box = region([np.abs(gray(var['blink']) - gb)], 0.22, 0.5)
        print(fid, 'mouth', mouth_box, 'eyes', eye_box)
        mm = ellipse(gb.shape, mouth_box, 1.15, 14)
        em = ellipse(gb.shape, eye_box, 1.1, 10)
        save(base, fid)
        for k in ['half', 'open', 'round']:
            save(match(base, var[k], mm), f'{fid}_{k}', alpha=mm)
        save(match(base, var['blink'], em), f'{fid}_eyes', alpha=em)


if __name__ == '__main__':
    main()
