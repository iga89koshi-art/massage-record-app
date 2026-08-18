# マニュアルの作り方

スタッフ用「使い方」とオーナー用「運用マニュアル」を、**このアプリのコードそのものから**組み立てる。
画面写真は実際のアプリを動かして撮るので、**アプリを直したら必ず撮り直す**。

## 手順

```bash
cd manual
python3 build_demo.py     # アプリを1枚のHTMLにまとめる（架空データ入り）
python3 shoot.py          # スタッフ用の画面を撮る
python3 shoot_owner.py    # オーナー用の画面を撮る
python3 build_manual.py   # 本文に写真を埋め込み、HTMLとPDFを出す
```

成果物は `manual/build/` に出る。PDFは `~/Desktop/` へコピーして渡す。
`build/` は git に入れない（`.gitignore` 済み）。

## ファイル

| ファイル | 役割 |
|---|---|
| `build_demo.py` | `index.html` + CSS + JS を1枚にまとめ、通信部分を架空データに差し替える |
| `shoot.py` | スタッフ用の画面写真（home / schedule / patient / service / treatment / absence / settings） |
| `shoot_owner.py` | オーナー用の画面写真（o_ で始まるもの） |
| `build_manual.py` | 写真を data URI で埋め込み、HTMLとPDFを出す |
| `manual_src.html` | スタッフ用の本文。`{{IMG:名前}}` が写真の差し込み位置 |
| `owner_src.html` | オーナー用の本文。`<!--STYLE-->` にスタッフ用のスタイルが入る |

## 触るときの注意

- **患者名はすべて架空**（見本太郎など）。実データも合言葉もURLも入れない
- デモは `#screen=...&bare=1` のような指定で特定の画面を直接開ける。
  `role=owner` でオーナー表示、`absent=1` でお休み・振替を選んだ状態、`patient=1` で患者を1人選んだ状態
- 撮影に使うヘッドレスChromeは**ウィンドウ幅を500px未満にできない**ので、
  ページ側で本体を390pxに固定して中央寄せし、撮影後に中央を切り出している
- **`<meta charset="utf-8">` を先頭に置くこと。** 無いとファイルを直接開いたとき日本語が化ける
- 写真の位置がずれたら `shoot*.py` の高さと `crop` を調整する

## デモページ（社内用）

`build/staff-demo.html` は、スタッフ用とオーナー用を切り替えて触れるデモ。
artifact として公開してある（URLは `igarashi-yoro` の `references/ops-map.md`）。
