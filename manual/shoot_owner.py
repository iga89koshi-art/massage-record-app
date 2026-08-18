#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""オーナー用マニュアルに載せる画面を撮る。role=owner で全機能が出た状態にする。"""
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
    raw = os.path.join(OUT, '_raw_o.png')
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        f'--window-size={WIN_W},{height}', '--virtual-time-budget=5000',
        f'--screenshot={raw}', f'{SRC}#{fragment}'
    ], capture_output=True)

    img = Image.open(raw)
    top, bottom = crop if crop else (0, img.height)
    bottom = min(bottom, img.height)
    img.crop((LEFT, top, LEFT + APP_W, bottom)).save(os.path.join(OUT, name + '.png'))
    print(f'{name}.png  {APP_W}x{bottom - top}  '
          f'{round(os.path.getsize(os.path.join(OUT, name + ".png"))/1024)}KB')


BASE = 'role=owner&bare=1'
shoot('o_home',      f'{BASE}&screen=home',           1000)
shoot('o_inst_new',  f'{BASE}&screen=instructions',    980, crop=(0, 640))
shoot('o_inst_list', f'{BASE}&screen=instructions',   1400, crop=(600, 1240))
shoot('o_settings',  f'{BASE}&screen=settings',       1500, crop=(0, 760))
# 設定画面は縦に長い。「設定の共有」は下のほうにあるので全体を描いてから切り出す
shoot('o_share',     f'{BASE}&screen=settings',       2600, crop=(2030, 2400))
shoot('o_schedule',  f'{BASE}&screen=schedule-view',   830)
# 複数人に送った指示が1枚にまとまり「1/2 完了」が出る位置
shoot('o_inst_done', f'{BASE}&screen=instructions',   1900, crop=(1150, 1640))

os.remove(os.path.join(OUT, '_raw_o.png'))
