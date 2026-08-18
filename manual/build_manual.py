#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""マニュアルを組み立てる。画面写真はdata URIとして埋め込む（外部参照を作らないため）。
スタイルはスタッフ用の1か所で持ち、オーナー用にも同じものを差し込む。"""
import base64, re, os, sys, subprocess

DIR = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(DIR, 'build')
SHOTS = os.path.join(BUILD, 'shots')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def embed(src_name, out_name, style=None):
    src = open(os.path.join(DIR, src_name), encoding='utf-8').read()
    if style:
        src = src.replace('<!--STYLE-->', style)

    def sub(m):
        path = os.path.join(SHOTS, m.group(1) + '.png')
        data = base64.b64encode(open(path, 'rb').read()).decode()
        return 'data:image/png;base64,' + data

    out = re.sub(r'\{\{IMG:([a-z0-9_]+)\}\}', sub, src)
    assert '{{IMG' not in out, '埋め込めていない画像がある'
    assert '<!--STYLE-->' not in out, 'スタイルが入っていない'

    path = os.path.join(BUILD, out_name)
    open(path, 'w', encoding='utf-8').write(out)
    print(f'{out_name}  {round(os.path.getsize(path)/1024)}KB  画像{out.count("data:image/png")}枚')
    return path


def to_pdf(html_path, pdf_name):
    pdf = os.path.join(BUILD, pdf_name)
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
        '--virtual-time-budget=8000', '--print-to-pdf=' + pdf,
        'file://' + html_path
    ], capture_output=True)
    pages = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    page_line = [l for l in pages.splitlines() if l.startswith('Pages')]
    print(f'{pdf_name}  {round(os.path.getsize(pdf)/1024)}KB  {page_line[0] if page_line else ""}')
    return pdf


# スタッフ用のstyleブロックをそのまま使い回す
staff_src = open(os.path.join(DIR, 'manual_src.html'), encoding='utf-8').read()
style = re.search(r'<style>.*?</style>', staff_src, re.S).group(0)

if 'staff' in sys.argv or not sys.argv[1:]:
    p = embed('manual_src.html', 'staff-manual.html')
    to_pdf(p, '施術記録アプリ_使い方_スタッフ用.pdf')

if 'owner' in sys.argv or not sys.argv[1:]:
    p = embed('owner_src.html', 'owner-manual.html', style=style)
    to_pdf(p, '施術記録アプリ_運用マニュアル_オーナー用.pdf')
