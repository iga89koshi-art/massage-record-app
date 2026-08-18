#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""マニュアルに載せる画面を撮る。
撮影に使うヘッドレスChromeはウィンドウ幅を500px未満にできないので、
ページ側で本体を390pxに固定して中央寄せし、撮影後に中央を切り抜く。"""
import subprocess, os
from PIL import Image

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')
SRC = 'file://' + os.path.join(DIR, 'staff-demo.html')
OUT = os.path.join(DIR, 'shots')
WIN_W, APP_W = 500, 390
LEFT = (WIN_W - APP_W) // 2

os.makedirs(OUT, exist_ok=True)


def shoot(name, fragment, height, crop=None):
    """crop=(上, 下) を渡すとその範囲だけ切り出す"""
    raw = os.path.join(OUT, '_raw.png')
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        f'--window-size={WIN_W},{height}', '--virtual-time-budget=5000',
        f'--screenshot={raw}', f'{SRC}#{fragment}'
    ], capture_output=True)

    img = Image.open(raw)
    top, bottom = crop if crop else (0, img.height)
    img.crop((LEFT, top, LEFT + APP_W, min(bottom, img.height))) \
       .save(os.path.join(OUT, name + '.png'))
    size = os.path.getsize(os.path.join(OUT, name + '.png'))
    print(f'{name}.png  {APP_W}x{min(bottom, img.height) - top}  {round(size/1024)}KB')


shoot('home',      'screen=home&bare=1',                       830)
shoot('schedule',  'screen=schedule-view&bare=1',              830)
shoot('patient',   'screen=patient-info&bare=1&patient=1',    1320, crop=(0, 880))
shoot('service',   'screen=patient-info&bare=1&patient=1',    1320, crop=(820, 1320))
shoot('treatment', 'screen=treatment&bare=1',                  900)
shoot('absence',   'screen=treatment&bare=1&absent=1',         820)
shoot('settings',  'screen=settings&bare=1',                   830)

os.remove(os.path.join(OUT, '_raw.png'))
