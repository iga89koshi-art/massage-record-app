#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""スタッフ端末の画面を1枚のHTMLにまとめる。
実際のアプリのHTML・CSS・JSをそのまま埋め込み、通信部分だけ架空データに差し替える。
患者名はすべて架空。院の実データもURLも合言葉も入れない。"""
import re, os

# このファイルはアプリのリポジトリの manual/ に置いてある。
# リポジトリの実体（1つ上）を見て、成果物は manual/build/ に出す。
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BUILD = os.path.join(HERE, 'build')
os.makedirs(BUILD, exist_ok=True)
OUT = os.path.join(BUILD, 'staff-demo.html')

EXTRA_CSS = """
/* デモ用の切り替えバー。本物のアプリには無い */
.demo-bar {
    position: sticky; top: 0; z-index: 999;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 12px;
    background: #1f2937; color: #fff;
    font-size: 13px; line-height: 1.5;
}
.demo-bar strong { font-size: 13px; }
.demo-bar button {
    padding: 6px 14px; min-height: 34px;
    border: 1px solid rgba(255,255,255,.4); border-radius: 16px;
    background: transparent; color: #fff; font-size: 13px;
}
.demo-bar button.is-on { background: #fff; color: #1f2937; font-weight: 700; }
.demo-note { width: 100%; opacity: .75; font-size: 12px; }
"""

DEMO_BANNER = """
<div class="demo-bar">
    <strong>デモ</strong>
    <button type="button" id="demo-staff">スタッフ（長谷川）</button>
    <button type="button" id="demo-owner">オーナー</button>
    <span class="demo-note">患者名はすべて架空です。実際のデータには繋がっていません。</span>
</div>
"""

# ui.js の後、app.js の前に差し込む。通信する関数だけを架空データに差し替える
DEMO_SHIM = """<script>
(function () {
    // ---- 架空データ（実在の患者・事業所ではない） ----
    var DAYS = ['日', '月', '火', '水', '木', '金', '土'];
    var today = new Date();
    var iso = function (d) { return d.toISOString().slice(0, 10); };

    var patients = [
        { id: 'p1', name: '見本 太郎', reading: 'ミホン タロウ', history: '脳梗塞（2020年）、高血圧',
          symptoms: '右半身に麻痺。歩行時にふらつきあり', family: '長女夫婦と同居。平日の日中は独居',
          notesUpdated: iso(today), consentTypes: ['はり・きゅう'] },
        { id: 'p2', name: '見本 花子', reading: 'ミホン ハナコ', history: '', symptoms: '', family: '',
          consentTypes: ['あんま・マッサージ'] },
        { id: 'p3', name: '例示 次郎', reading: 'レイジ ジロウ', history: '', symptoms: '', family: '' },
        { id: 'p4', name: '例示 三郎', reading: 'レイジ サブロウ', history: '', symptoms: '', family: '' }
    ];

    // 長谷川は月〜金、小幡は同じ日に別の患者。曜日が変わっても何か出るようにする
    var visitPlans = [];
    ['月', '火', '水', '木', '金', '土', '日'].forEach(function (day) {
        visitPlans.push({ staff: '長谷川', type: 'treatment', day: day, time: '09:00', name: '見本 太郎', duration: 30 });
        visitPlans.push({ staff: '長谷川', type: 'treatment', day: day, time: '10:00', name: '見本 花子', duration: 30 });
        visitPlans.push({ staff: '長谷川', type: 'treatment', day: day, time: '11:00', name: '例示 次郎', duration: 30 });
        visitPlans.push({ staff: '小幡', type: 'treatment', day: day, time: '14:00', name: '例示 三郎', duration: 30 });
    });

    var servicePlans = [
        { id: 's1', patientIds: ['p1'], patientNames: ['見本 太郎'], service: 'デイサービス',
          office: '見本デイサービスセンター', days: DAYS.slice(), band: '午前',
          startTime: '', endTime: '', frequency: '毎週', note: '' },
        { id: 's2', patientIds: ['p2'], patientNames: ['見本 花子'], service: '訪問介護',
          office: '見本ヘルパーステーション', days: DAYS.slice(), band: '時刻指定',
          startTime: '10:30', endTime: '11:00', frequency: '毎週', note: '' }
    ];

    var instructions = [
        { id: 'i1', createdAt: iso(today), target: '長谷川',
          content: '見本太郎様の同意書を今週中にもらってきてください',
          due: iso(today), status: '', doneBy: '', doneAt: '' },
        { id: 'i2', createdAt: iso(today), target: '長谷川',
          content: '訪問前に他サービスの予定を一度確認しておいてください',
          due: '', status: '', doneBy: '', doneAt: '' },
        { id: 'i3', createdAt: iso(today), target: '小幡',
          content: '（これは小幡さん宛て。長谷川の画面には出ません）',
          due: '', status: '', doneBy: '', doneAt: '' },
        // 同じIDが2行＝2人に送った1つの指示。オーナー画面では1枚にまとまる
        { id: 'i4', createdAt: iso(today), target: '長谷川',
          content: '月末までに担当患者の同居家族を入れておいてください',
          due: '', status: '完了', doneBy: '長谷川', doneAt: iso(today) },
        { id: 'i4', createdAt: iso(today), target: '小幡',
          content: '月末までに担当患者の同居家族を入れておいてください',
          due: '', status: '', doneBy: '', doneAt: '' }
    ];

    var staff = [
        { name: '五十嵐', status: '稼働中', type: '施術・営業' },
        { name: '長谷川', status: '稼働中', type: '施術' },
        { name: '小幡', status: '稼働中', type: '施術' }
    ];

    // ---- 役割。バーで切り替える。#role=owner でも指定できる（撮影用） ----
    var hash0 = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var role = hash0.get('role') || localStorage.getItem('demo_role') || 'staff';
    var set = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); };

    set('patients', patients);
    set('visit_plans', visitPlans);
    set('service_plans', servicePlans);
    set('instructions', instructions);
    set('staff', staff);
    set('device_role', role);
    set('device_staff_name', role === 'staff' ? '長谷川' : '');
    set('device_role_locked', true);
    set('gas_api_url', '');
    set('app_token', '');

    // ---- 通信する関数を架空データに差し替える ----
    var wait = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 200); }); };

    window.fetchStaffFromGas = function () { return wait(staff); };
    window.fetchPatientsFromNotion = function () { return wait(patients); };
    window.fetchVisitPlansFromNotion = function () { return wait(visitPlans); };
    window.fetchServicePlansFromNotion = function () {
        saveServicePlans(servicePlans);
        return wait(servicePlans);
    };
    window.fetchInstructionsFromGas = function (target, onlyPending) {
        var list = instructions.filter(function (x) {
            if (target && x.target !== target) return false;
            if (onlyPending && x.status === '完了') return false;
            return true;
        });
        saveInstructions(list);
        return wait(list);
    };
    window.completeInstructionInGas = function (id, who) {
        instructions.forEach(function (x) {
            if (x.id === id && x.target === who) { x.status = '完了'; x.doneBy = who; x.doneAt = iso(today); }
        });
        return wait({ success: true });
    };
    window.saveInstructionToGas = function (data) {
        (data.targets || []).forEach(function (t, i) {
            instructions.push({ id: 'new' + Date.now() + i, createdAt: iso(today), target: t,
                content: data.content, due: data.due || '', status: '', doneBy: '', doneAt: '' });
        });
        return wait({ success: true });
    };
    window.updatePatientNotesInNotion = function (id, notes) {
        patients.forEach(function (p) { if (p.id === id) Object.assign(p, notes); });
        return wait({ success: true });
    };
    window.createServicePlanInNotion = function (plan) {
        servicePlans.push(Object.assign({ id: 'new' + Date.now() }, plan));
        return wait({ success: true });
    };
    window.deleteServicePlanInNotion = function (planId) {
        servicePlans = servicePlans.filter(function (p) { return p.id !== planId; });
        return wait({ success: true });
    };
    window.callGasApi = function () { return wait({ success: true, data: [] }); };
    window.syncOfflineQueue = function () { return wait({ synced: 0, failed: 0 }); };
    window.startAutoSync = function () { };

    // ---- 切り替えバー ----
    document.addEventListener('DOMContentLoaded', function () {
        var s = document.getElementById('demo-staff');
        var o = document.getElementById('demo-owner');
        if (!s || !o) return;
        (role === 'staff' ? s : o).classList.add('is-on');
        s.addEventListener('click', function () { localStorage.setItem('demo_role', 'staff'); location.reload(); });
        o.addEventListener('click', function () { localStorage.setItem('demo_role', 'owner'); location.reload(); });
    });

    // ---- 説明書のスクリーンショット用。#screen=... で特定の画面を直接開く ----
    // bare=1 でデモバーを隠す。patient=1 で患者を1人選んだ状態にする
    var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (hash.get('screen')) {
        window.addEventListener('load', function () {
            setTimeout(function () {
                if (hash.get('bare')) {
                    var bar = document.querySelector('.demo-bar');
                    if (bar) bar.style.display = 'none';
                    // 撮影用。-apple-system は撮影環境で日本語のフォントに落ちないことがある。
                    // iPhone で実際に使われるヒラギノを直接指定して、実機と同じ見え方にする
                    var st = document.createElement('style');
                    st.textContent =
                        'body, button, input, textarea, select {' +
                        ' font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif !important; }' +
                        // 撮影に使うブラウザは幅を500px未満にできないので、
                        // 本体だけスマホ幅に固定して中央に置き、あとで切り抜く
                        ' html { background: var(--bg-color); }' +
                        ' body { width: 390px !important; margin: 0 auto !important; }';
                    document.head.appendChild(st);
                }
                showScreen(hash.get('screen'));
                if (hash.get('patient')) {
                    var sel = document.getElementById('patient-info-select');
                    if (sel && sel.options[1]) {
                        sel.value = sel.options[1].value;
                        sel.dispatchEvent(new Event('change'));
                    }
                }
                // 撮影用。施術記録の1件目を「お休み・振替」にした状態にする
                if (hash.get('absent')) {
                    var first = document.querySelector('#treatment-batch-list .batch-entry');
                    if (first) {
                        onTreatmentStatusChange(first.id, 'absent');
                        var reason = first.querySelector('.entry-absence-reason');
                        if (reason) reason.value = '発熱のため';
                        var sel = first.querySelector('.entry-patient');
                        if (sel && sel.options[1]) sel.value = sel.options[1].value;
                    }
                }
                if (hash.get('scroll')) window.scrollTo(0, parseInt(hash.get('scroll'), 10));
                document.documentElement.setAttribute('data-demo-ready', '1');
            }, 700);
        });
    }
})();
</script>"""


def read(p):
    with open(os.path.join(REPO, p), encoding='utf-8') as f:
        return f.read()


html = read('index.html')
css = read('styles/main.css')

# body の中身だけ取り出す（artifact 側が <html><head><body> を付けるため）
body = html.split('<body>', 1)[1].rsplit('</body>', 1)[0]

for path in ['js/utils.js', 'js/storage.js', 'js/config-share.js',
             'js/api.js', 'js/ui.js', 'js/app.js']:
    src = read(path)
    if path == 'js/app.js':
        # Service Worker はデモでは登録しない
        src = src.replace("'serviceWorker' in navigator", 'false')

    block = '<script>\n' + src + '\n</script>'
    if path == 'js/app.js':
        block = DEMO_SHIM + '\n' + block

    pattern = re.compile(r'<script src="\./' + re.escape(path) + r'\?v=\d+"></script>')
    body, n = pattern.subn(lambda m: block, body, count=1)
    assert n == 1, 'script タグが見つからない: ' + path

page = ('<meta charset="utf-8">\n'   # ファイルを直接開いたときに文字化けしないよう先頭に置く
        '<title>スタッフ端末の画面（デモ）</title>\n'
        '<style>\n' + css + '\n' + EXTRA_CSS + '</style>\n'
        + DEMO_BANNER + body)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(page)

print('作成:', OUT)
print('サイズ:', round(os.path.getsize(OUT) / 1024), 'KB')
print('残っている外部参照:', re.findall(r'(?:src|href)="\.\/[^"]+"', page)[:10])
