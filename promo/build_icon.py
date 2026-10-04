#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_icon.py — 用测量 + 轮廓提取重建新版图标（爪印）的干净矢量版

不依赖第三方追踪器：从 PNG 里量出三个趾环的圆心/半径（圆是精确的），
掌垫用轮廓提取 + Douglas-Peucker 简化成闭合路径（外公差 1.3px）。

输出：client/public/icon.svg（替换旧版猫脸）、promo/assets/icon.svg
"""
import math
import os
import sys

import numpy as np
from PIL import Image

W = 256.0
STROKE = 16.8          # 实测：白色描边宽度
GRAD_TOP, GRAD_BOT = '#6366f1', '#d946ef'
RADIUS = 50            # 圆角半径（实测 y=0 行不透明段 x[49..206]）


def load_mask(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(float)
    lum = a[:, :, :3].min(axis=2)
    al = a[:, :, 3]
    soft = np.clip((lum - 140.0) / 60.0, 0, 1) * np.clip((al - 40.0) / 120.0, 0, 1)
    return soft > 0.5


def components(mask):
    H, Wd = mask.shape
    seen = np.zeros_like(mask, bool)
    comps = []
    for y0 in range(H):
        for x0 in range(Wd):
            if mask[y0, x0] and not seen[y0, x0]:
                st = [(y0, x0)]
                seen[y0, x0] = True
                pts = []
                while st:
                    y, x = st.pop()
                    pts.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < H and 0 <= nx < Wd and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                st.append((ny, nx))
                comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


def marching_contours(mask):
    """Marching squares：逐格查表出线段，再把线段接成闭环。半像素精度，绝对可靠。"""
    H, Wd = mask.shape
    segs = []
    for y in range(H - 1):
        for x in range(Wd - 1):
            a = mask[y, x]; b = mask[y, x + 1]; c = mask[y + 1, x + 1]; d = mask[y + 1, x]
            idx = (1 if a else 0) | (2 if b else 0) | (4 if c else 0) | (8 if d else 0)
            if idx in (0, 15):
                continue
            top = (x + 0.5, float(y)); right = (float(x + 1), y + 0.5)
            bottom = (x + 0.5, float(y + 1)); left = (float(x), y + 0.5)
            table = {
                1: [(left, top)], 2: [(top, right)], 4: [(right, bottom)], 8: [(bottom, left)],
                3: [(left, right)], 6: [(top, bottom)], 9: [(top, bottom)], 12: [(right, left)],
                5: [(left, top), (right, bottom)], 10: [(top, right), (bottom, left)],
                7: [(bottom, left)], 11: [(right, bottom)], 13: [(top, right)], 14: [(left, top)],
            }
            segs.extend(table.get(idx, []))
    # 接链：把线段连成闭环
    adj = {}
    for p, q in segs:
        adj.setdefault(p, []).append(q)
        adj.setdefault(q, []).append(p)
    loops, used = [], set()
    for start in list(adj.keys()):
        if start in used:
            continue
        loop = [start]
        used.add(start)
        cur, prev = start, None
        while True:
            nxt = None
            for cand in adj.get(cur, []):
                if cand not in used:
                    nxt = cand
                    break
            if nxt is None:
                break
            loop.append(nxt)
            used.add(nxt)
            prev, cur = cur, nxt
        if len(loop) >= 8:
            loops.append(loop)
    return loops


def fill_holes(mask):
    """从边界洪泛，填掉内部空洞，得到实心区域"""
    H, Wd = mask.shape
    out = mask.copy()
    seen = np.zeros_like(mask, bool)
    st = []
    for x in range(Wd):
        for y in (0, H - 1):
            if not mask[y, x] and not seen[y, x]:
                seen[y, x] = True
                st.append((y, x))
    for y in range(H):
        for x in (0, Wd - 1):
            if not mask[y, x] and not seen[y, x]:
                seen[y, x] = True
                st.append((y, x))
    while st:
        y, x = st.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < Wd and not mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    st.append((ny, nx))
    holes = (~mask) & (~seen)
    return out | holes, holes


def trace_contour(mask, start):
    """Moore 邻域边界跟踪，返回闭合轮廓点列（y,x）"""
    H, Wd = mask.shape
    dirs = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    contour = [start]
    prev_dir = 6
    cur = start
    for _ in range(200000):
        found = False
        for k in range(8):
            d = (prev_dir + 5 + k) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < H and 0 <= nx < Wd and mask[ny, nx]:
                contour.append((ny, nx))
                prev_dir = d
                cur = (ny, nx)
                found = True
                break
        if not found:
            break
        if cur == start and len(contour) > 8:
            break
    return contour


def rdp(points, eps):
    if len(points) < 3:
        return points
    pts = np.array(points, float)
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        ab = b - a
        L = np.hypot(*ab)
        if L < 1e-9:
            d = np.hypot(*(pts[i + 1:j] - a).T)
        else:
            d = np.abs(np.cross(ab, pts[i + 1:j] - a)) / L
        k = int(np.argmax(d))
        if d[k] > eps:
            keep[i + 1 + k] = True
            stack.append((i, i + 1 + k))
            stack.append((i + 1 + k, j))
    return pts[keep]


def catmull_to_bezier(pts, closed=True):
    """闭合 Catmull-Rom 转三次贝塞尔，输出紧凑 d 串"""
    n = len(pts)
    def f(v):
        return ('%.2f' % v).rstrip('0').rstrip('.')
    d = 'M%s %s' % (f(pts[0][0]), f(pts[0][1]))
    for i in range(n if closed else n - 1):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += 'C%s %s %s %s %s %s' % (f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1]))
    return d + 'Z'


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'website/assets/icon.png'
    outs = sys.argv[2:] or ['client/public/icon.svg']
    mask = load_mask(src)
    comps = components(mask)
    print('连通域: %s' % [len(c) for c in comps[:6]])

    circles, pads = [], []
    for pts in comps:
        p = np.array(pts)
        y, x = p[:, 0], p[:, 1]
        bw, bh = x.max() - x.min() + 1, y.max() - y.min() + 1
        cx, cy = (x.min() + x.max() + 1) / 2.0, (y.min() + y.max() + 1) / 2.0
        if len(pts) < 400:
            continue
        iso = (abs(bw - bh) <= 3) and (len(pts) < 3000)
        if iso:                                     # 趾环：正圆
            r_out = (bw + bh) / 4.0
            r_in = math.sqrt(max(r_out ** 2 - len(pts) / math.pi, 0))
            circles.append((cx, cy, (r_out + r_in) / 2.0, r_out - r_in))
        else:                                       # 掌垫：用 marching squares 拿外轮廓 + 内孔
            m = np.zeros_like(mask)
            m[y, x] = True
            pads.append(marching_contours(m))

    parts = []
    for cx, cy, r, sw in circles:
        parts.append('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#fff" stroke-width="%s"/>'
                     % (round(cx, 1), round(cy, 1), round(r, 2), round(sw, 1)))
    for contours in pads:
        ds = []
        for c in contours:
            c = np.array(c, float)                       # 已经是 (x,y)
            if len(c) < 12:
                continue
            # 闭合点重采样 + 圆周平滑，再简化
            L = np.concatenate([c, c[:1]])
            seg = np.hypot(*np.diff(L, axis=0).T)
            t = np.concatenate([[0], np.cumsum(seg)])[:-1]
            n = max(24, min(72, len(c) // 5))
            ts = np.linspace(0, t[-1], n, endpoint=False)
            rs = np.array([np.interp(ts, t, L[:-1, 0]), np.interp(ts, t, L[:-1, 1])]).T
            for _ in range(2):
                rs = (rs + np.roll(rs, 1, 0) + np.roll(rs, -1, 0)) / 3.0
            rs = rdp(rs, 1.1)
            if len(rs) < 6:
                continue
            ds.append(catmull_to_bezier(rs))
        if ds:
            parts.append('<path fill-rule="evenodd" d="%s"/>' % ' '.join(ds))

    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n'
           '  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs>\n'
           '  <rect width="256" height="256" rx="%d" fill="url(#g)"/>\n'
           '  <g fill="#fff" stroke="none">\n' % (GRAD_TOP, GRAD_BOT, RADIUS))
    for p in parts:
        svg += '    ' + p + '\n'
    svg += '  </g>\n</svg>\n'

    for out in outs:
        os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
        open(out, 'w', encoding='utf-8').write(svg)
        print('写出 %s  (%d 字节, %d 个图元)' % (out, len(svg), len(parts)))
    # 备一份给渲染核对
    os.makedirs('promo/assets', exist_ok=True)
    open('promo/assets/icon.svg', 'w', encoding='utf-8').write(svg)


if __name__ == '__main__':
    main()
