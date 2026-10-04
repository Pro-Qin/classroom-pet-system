#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
icon_check.py — 把 promo/assets/icon.svg 渲染出来，和 website/assets/icon.png 逐像素对照

用 magenta (#ff00ff) 当键控色：截图里 magenta = 透明，这样能精确取出两个图标的形状与颜色。
输出 promo/assets/icon-compare.png（左：原图 / 中：矢量重绘 / 右：差异）
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, 'promo', 'assets', 'icon.svg')
PNG = os.path.join(ROOT, 'website', 'assets', 'icon.png')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'


def main():
    tmp = os.path.join(tempfile.gettempdir(), 'iconcheck')
    os.makedirs(tmp, exist_ok=True)
    html = os.path.join(tmp, 'cmp.html')
    open(html, 'w', encoding='utf-8').write(
        '<!doctype html><meta charset="utf-8">'
        '<style>html,body{margin:0;background:#ff00ff}img,object{display:block;float:left;'
        'width:256px;height:256px;image-rendering:auto}</style>'
        '<img src="file:///%s" width="256" height="256">'
        '<img src="file:///%s" width="256" height="256">'
        % (PNG.replace('\\', '/'), SVG.replace('\\', '/')))
    shot = os.path.join(tmp, 'shot.png').replace('\\', '/')
    if os.path.exists(shot):
        os.remove(shot)
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--user-data-dir=' + tmp,
                    '--hide-scrollbars', '--virtual-time-budget=3000',
                    '--force-device-scale-factor=1', '--window-size=512,256',
                    '--screenshot=' + shot, 'file:///' + html.replace('\\', '/')],
                   capture_output=True)
    if not os.path.exists(shot):
        raise SystemExit('截图失败')
    im = np.array(Image.open(shot).convert('RGB')).astype(float)[:256, :512]
    key = (np.abs(im[:, :, 0] - 255) < 6) & (im[:, :, 1] < 6) & (np.abs(im[:, :, 2] - 255) < 6)
    im[key] = 0
    a, b = im[:, :256], im[:, 256:512]
    wa = a.min(axis=2) > 150
    wb = b.min(axis=2) > 150
    iou = (wa & wb).sum() / max((wa | wb).sum(), 1)
    diff = np.abs(a - b).mean()
    print('白形状 IoU %.4f   平均 RGB 差 %.2f   原 %d 新 %d 像素' % (iou, diff, wa.sum(), wb.sum()))
    sheet = np.concatenate([a, np.full((256, 8, 3), 255.0), b,
                            np.full((256, 8, 3), 255.0), np.abs(a - b) * 2], axis=1)
    out = os.path.join(ROOT, 'promo', 'assets', 'icon-compare.png')
    Image.fromarray(np.clip(sheet, 0, 255).astype('uint8')).save(out)
    print('对照图 -> ' + out)
    return 0 if iou > 0.96 else 1


if __name__ == '__main__':
    sys.exit(main())
