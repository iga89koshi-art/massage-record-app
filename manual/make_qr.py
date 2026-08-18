#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""マニュアルに載せるアプリのQRコードを作る。
印刷しても読めるよう、余白を確保して大きめに出す。"""
import os
import qrcode

APP_URL = 'https://iga89koshi-art.github.io/massage-record-app/'
BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')
OUT = os.path.join(BUILD, 'shots', 'qr.png')

os.makedirs(os.path.dirname(OUT), exist_ok=True)

qr = qrcode.QRCode(
    version=None,
    # 印刷物は汚れや折れで読めなくなるので、誤り訂正は高めにする
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=10,
    border=3,
)
qr.add_data(APP_URL)
qr.make(fit=True)
qr.make_image(fill_color='black', back_color='white').save(OUT)

print('作成:', OUT, os.path.getsize(OUT) // 1024, 'KB')
