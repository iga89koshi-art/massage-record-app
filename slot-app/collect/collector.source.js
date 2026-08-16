/*
 * スロットデータ収集ブックマークレット(読みやすい版)
 * 店舗WiFi接続中に athink.jp のデータサイト上で実行すると、
 * 対象機種(既定:ジャグラー系)の全台を自動巡回して
 * BB/RB/確率/大当り履歴を取得し、GASへ送信する。
 * 実際に登録するのは collector.bookmarklet.txt の1行。
 *
 * 仕組み(サイト解析結果):
 *  - 機種一覧:   ./php/back/show/kishu_list.php?tenpo_id=angyou&p=l&tkn=
 *      → tr.tr_kishu_list_class (data-kishu-no / data-kashitama_id / data-kishu_name)
 *  - 台一覧:     ./php/back/show/dai_list.self.php?page=N&tab=dai_list&...
 *      → .list_dedama 要素の data-daiban、ページャは .pagerclz4dailist / .pagerclz4slump
 *  - 台詳細:     ./php/back/show/dedama.php?tenpo_id=..&daiban=..&_date=..&kishu_no=..
 *      → #data_counter_s のLCD風表示(実数値は .overrideText 内の
 *        .shadowOpacity1/.shadowOpacity2 以外のspan)、#oatari_rireki の履歴表
 */
(async function () {
  if (window.__slotCollectorRunning) { alert('収集は既に実行中です'); return; }
  window.__slotCollectorRunning = true;

  var TENPO = 'angyou';
  var THROTTLE_MS = 200;
  // 設定別ボーナス確率 [BB分母, RB分母] × 設定1〜6(公表値)
  var SPECS = {
    'SマイジャグラーVKD': [[273.1, 409.6], [270.8, 385.5], [266.4, 336.1], [254.0, 290.0], [240.1, 268.6], [229.1, 229.1]],
    'Sゴーゴージャグラー3KA': [[259.0, 354.2], [256.0, 332.7], [249.2, 306.2], [246.5, 278.7], [242.7, 247.3], [234.9, 234.9]],
    'SネオアイムジャグラーEX-KK': [[273.1, 439.8], [271.2, 399.6], [269.7, 331.0], [266.4, 315.1], [263.2, 292.6], [268.6, 268.6]]
  };
  var MIN_GAMES_RANK = 800;
  var filterStr = localStorage.getItem('slot_kishu_filter') || '';
  var KISHU_FILTER = new RegExp(filterStr);

  var gasUrl = localStorage.getItem('slot_gas_url') || '';
  if (!gasUrl) {
    gasUrl = prompt('GAS WebアプリのURL(未デプロイなら空欄のままOK→コピー画面になります)', '') || '';
    if (gasUrl) localStorage.setItem('slot_gas_url', gasUrl);
  }

  var aborted = false;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.92);color:#0f0;font:12px/1.5 monospace;padding:10px;overflow:auto;';
  var logDiv = document.createElement('div');
  var stopBtn = document.createElement('button');
  stopBtn.textContent = '中止/閉じる';
  stopBtn.style.cssText = 'position:sticky;top:0;float:right;padding:10px 14px;font-size:14px;background:#c33;color:#fff;border:0;border-radius:6px;';
  stopBtn.onclick = function () { aborted = true; box.remove(); window.__slotCollectorRunning = false; };
  box.appendChild(stopBtn);
  box.appendChild(logDiv);
  document.body.appendChild(box);
  function log(msg) {
    var p = document.createElement('div');
    p.textContent = msg;
    logDiv.appendChild(p);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function parseHtml(s) { return new DOMParser().parseFromString(s, 'text/html'); }
  async function fetchDoc(url) {
    var res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return parseHtml(await res.text());
  }
  function toInt(s) {
    var m = String(s || '').replace(/[^0-9\-]/g, '');
    return m === '' ? null : parseInt(m, 10);
  }
  function toDen(s) {
    var m = String(s || '').match(/1\s*\/\s*(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function today() {
    var el = document.getElementById('kishu_list_target_date');
    if (el && el.value) return el.value;
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function parseCounters(doc) {
    var out = {};
    doc.querySelectorAll('#data_counter_s li, #data_counter_p li').forEach(function (li) {
      var labelEl = li.querySelector('.normalWhiteText');
      var ov = li.querySelector('.overrideText');
      if (!labelEl || !ov) return;
      var label = labelEl.textContent.trim();
      var val = '';
      ov.querySelectorAll('span').forEach(function (sp) {
        if (sp.classList.contains('shadowOpacity1') || sp.classList.contains('shadowOpacity2')) return;
        val += sp.textContent;
      });
      if (label) out[label] = val.trim();
    });
    return out;
  }

  function parseHistory(doc) {
    var rows = [];
    doc.querySelectorAll('#oatari_rireki tbody tr').forEach(function (tr) {
      var td = tr.querySelectorAll('td');
      if (td.length < 5) return;
      rows.push({
        no: toInt(td[0].textContent),
        start: toInt(td[1].textContent),
        dedama: toInt(td[2].textContent),
        type: td[3].textContent.trim(),
        time: td[4].textContent.trim()
      });
    });
    return rows;
  }

  function showJsonCopy(payload) {
    var ta = document.createElement('textarea');
    ta.value = payload;
    ta.readOnly = true;
    ta.style.cssText = 'width:100%;height:40vh;font-size:11px;background:#111;color:#0f0;border:1px solid #0f0;';
    var btn = document.createElement('button');
    btn.textContent = '収集結果JSONをコピー(約' + Math.round(payload.length / 1024) + 'KB)';
    btn.style.cssText = 'display:block;width:100%;padding:14px;font-size:15px;background:#2b6;color:#fff;border:0;border-radius:6px;margin:8px 0;';
    btn.onclick = function () {
      ta.select();
      ta.setSelectionRange(0, payload.length);
      var done = function () { btn.textContent = 'コピーしました!メモやGoogleドキュメントに貼ってください'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(done, function () { document.execCommand('copy'); done(); });
      } else { document.execCommand('copy'); done(); }
    };
    logDiv.appendChild(btn);
    logDiv.appendChild(ta);
  }

  function posterior56(m, spec) {
    var n = m.totalStart;
    var lls = spec.map(function (st) {
      var pb = 1 / st[0], pr = 1 / st[1];
      return m.bb * Math.log(pb) + (n - m.bb) * Math.log(1 - pb) +
             m.rb * Math.log(pr) + (n - m.rb) * Math.log(1 - pr);
    });
    var mx = Math.max.apply(null, lls);
    var ws = lls.map(function (l) { return Math.exp(l - mx); });
    var sum = ws.reduce(function (a, b) { return a + b; }, 0);
    var p = ws.map(function (w) { return w / sum; });
    return { p56: p[4] + p[5], p456: p[3] + p[4] + p[5] };
  }

  function logStrong(msg, color) {
    var p = document.createElement('div');
    p.textContent = msg;
    p.style.cssText = 'color:' + (color || '#ff0') + ';font-weight:bold;';
    logDiv.appendChild(p);
  }

  function showAnalysis(machines) {
    // 1) スペック登録済み機種(ジャグラー)はベイズ推定で高設定確率を出す
    var jr = [];
    machines.forEach(function (m) {
      var spec = SPECS[m.kishuName];
      if (!spec || m.totalStart == null || m.totalStart < MIN_GAMES_RANK || m.bb == null || m.rb == null) return;
      var r = posterior56(m, spec);
      jr.push({ m: m, p56: r.p56, p456: r.p456 });
    });
    jr.sort(function (a, b) { return b.p56 - a.p56; });
    logStrong('== ジャグラー 高設定候補(設5・6確率順 / ' + MIN_GAMES_RANK + 'G以上) ==');
    jr.slice(0, 12).forEach(function (r, i) {
      var m = r.m;
      var mark = r.p56 >= 0.45 ? '★' : (r.p56 >= 0.3 ? '◯' : '　');
      logStrong(mark + ' 台' + m.daiban + ' ' + m.kishuName.replace(/^S/, '').slice(0, 10) +
        ' G' + m.totalStart + ' BB' + m.bb + ' RB' + m.rb +
        ' 合成1/' + (m.gousei || '?') +
        ' 高設定' + Math.round(r.p56 * 100) + '%(設4以上' + Math.round(r.p456 * 100) + '%)',
        r.p56 >= 0.45 ? '#f66' : '#ff0');
    });
    if (!jr.length) logStrong('(対象データなし)');

    // 2) スペック未登録機種(AT機など)は同機種内で初当りの引きを比較(ポアソンz値)
    //    連チャン(33G以内の当選)は一塊=1初当りとして数える
    var groups = {};
    machines.forEach(function (m) {
      if (SPECS[m.kishuName]) return;
      if (m.totalStart == null || m.totalStart < MIN_GAMES_RANK) return;
      var hits;
      if (m.history && m.history.length) {
        var hist = m.history.slice().sort(function (a, b) { return a.no - b.no; });
        hits = 0;
        hist.forEach(function (h, idx) {
          if (idx === 0 || h.start > 33) hits++;
        });
      } else {
        hits = (m.bb || 0) + (m.rb || 0);
      }
      if (!hits) return;
      (groups[m.kishuNo] = groups[m.kishuNo] || []).push({ m: m, hits: hits });
    });
    var at = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 4) return;
      var sumH = 0, sumG = 0;
      g.forEach(function (x) { sumH += x.hits; sumG += x.m.totalStart; });
      var pbar = sumH / sumG;
      g.forEach(function (x) {
        var exp = x.m.totalStart * pbar;
        at.push({ m: x.m, hits: x.hits, z: (x.hits - exp) / Math.sqrt(exp), avgDen: Math.round(1 / pbar) });
      });
    });
    at.sort(function (a, b) { return b.z - a.z; });
    logStrong('== AT機など 同機種内で当たりが強い台(参考・スペック未登録) ==', '#0cf');
    at.filter(function (x) { return x.z >= 1; }).slice(0, 10).forEach(function (x) {
      var m = x.m;
      logStrong('　台' + m.daiban + ' ' + m.kishuName.replace(/^(LB|L|S)/, '').slice(0, 12) +
        ' G' + m.totalStart + ' 当り' + x.hits + '(1/' + Math.round(m.totalStart / x.hits) + ')' +
        ' 機種平均1/' + x.avgDen + ' 優秀度+' + x.z.toFixed(1), '#0cf');
    });
  }

  try {
    var date = today();
    log('== スロットデータ収集開始 ' + date + ' 対象:' + (filterStr ? '/' + filterStr + '/' : '全機種') + (gasUrl ? '' : ' [ローカルモード:GAS送信なし]') + ' ==');

    log('機種一覧を取得中...');
    var kishuDoc = await fetchDoc('./php/back/show/kishu_list.php?tenpo_id=' + TENPO + '&p=l&tkn=');
    var kishus = [];
    var seenKishu = {};
    kishuDoc.querySelectorAll('tr.tr_kishu_list_class').forEach(function (tr) {
      var no = tr.getAttribute('data-kishu-no');
      var kashitama = tr.getAttribute('data-kashitama_id');
      var name = decodeURIComponent(tr.getAttribute('data-kishu_name') || '');
      var key = no + '_' + kashitama;
      if (seenKishu[key]) return;
      seenKishu[key] = 1;
      var isSlot = /s$/.test(kashitama || '');
      if (!isSlot && localStorage.getItem('slot_include_pachi') !== '1') return;
      if (KISHU_FILTER.test(name)) {
        kishus.push({ no: no, kashitama: kashitama, name: name, nameEnc: tr.getAttribute('data-kishu_name') || '' });
      }
    });
    log('対象機種: ' + kishus.length + '件');
    if (!kishus.length) { log('対象機種が見つかりません。フィルタ: ' + filterStr); return; }

    var machines = [];
    for (var i = 0; i < kishus.length; i++) {
      if (aborted) return;
      var k = kishus[i];
      log('[' + (i + 1) + '/' + kishus.length + '] ' + k.name + ' の台一覧を取得中...');

      var daibans = [];
      var seenDai = {};
      var page = 1;
      var maxPage = 1;
      while (page <= maxPage && page <= 30) {
        if (aborted) return;
        var listUrl = './php/back/show/dai_list.self.php?page=' + page +
          '&tab=dai_list&tenpo_id=' + TENPO + '&kishu_no=' + k.no +
          '&target_date=' + date + '&kashitama_id=' + k.kashitama.replace(/_/g, '.') +
          '&kishu_name=' + k.nameEnc + '&p=l&tkn=';
        var listDoc = await fetchDoc(listUrl);
        listDoc.querySelectorAll('.list_dedama').forEach(function (el) {
          var d = el.getAttribute('data-daiban');
          if (d && !seenDai[d]) { seenDai[d] = 1; daibans.push(d); }
        });
        listDoc.querySelectorAll('.pagerclz4dailist,.pagerclz4slump').forEach(function (a) {
          var p = parseInt(a.getAttribute('data-page'), 10);
          if (p && p > maxPage) maxPage = p;
        });
        page++;
        await sleep(THROTTLE_MS);
      }
      log('  台番: ' + daibans.join(','));

      for (var j = 0; j < daibans.length; j++) {
        if (aborted) return;
        var daiban = daibans[j];
        try {
          var dedamaUrl = './php/back/show/dedama.self.php?tenpo_id=' + TENPO +
            '&base_tenpo_id=' + TENPO + '&_date=' + date + '&daiban=' + daiban +
            '&max_y_minus=null&max_y_plus=null&kishu_no=' + k.no +
            '&kashitama_id=' + k.kashitama + '&from_search=0&p=l&tkn=&dai_ext_tkn=';
          var dDoc = await fetchDoc(dedamaUrl);
          var c = parseCounters(dDoc);
          var updM = dDoc.body.textContent.match(/(\d+\/\d+\s+\d+:\d+)\s*更新/);
          machines.push({
            daiban: toInt(daiban),
            kishuNo: toInt(k.no),
            kishuName: k.name,
            kashitama: k.kashitama,
            bb: toInt(c['BB']),
            rb: toInt(c['RB']),
            games: toInt(c['ゲーム数']),
            bbProb: toDen(c['BB確率']),
            rbProb: toDen(c['RB確率']),
            gousei: toDen(c['合成確率']),
            maxDedama: toInt(c['最大持玉']),
            totalStart: toInt(c['累計ｽﾀｰﾄ']),
            updatedAt: updM ? updM[1] : '',
            history: parseHistory(dDoc)
          });
          var last = machines[machines.length - 1];
          if (last.totalStart === null && last.bb === null && !last.history.length) {
            log('  台' + daiban + ' ⚠データが取れていません(構造不一致の可能性)');
          } else {
            log('  台' + daiban + ' BB:' + last.bb + ' RB:' + last.rb + ' 累計:' + last.totalStart + ' 合成:1/' + last.gousei);
          }
        } catch (err) {
          log('  台' + daiban + ' 取得失敗: ' + err.message);
        }
        await sleep(THROTTLE_MS);
      }
    }

    showAnalysis(machines);
    var payload = JSON.stringify({
      ver: 1,
      action: 'collect',
      tenpoId: TENPO,
      targetDate: date,
      collectedAt: new Date().toISOString(),
      machines: machines
    });
    if (gasUrl) {
      log('== 取得完了: ' + machines.length + '台。GASへ送信中... ==');
      try {
        var res = await fetch(gasUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: payload
        });
        var body = await res.text();
        log('送信結果: ' + body.slice(0, 300));
      } catch (e2) {
        log('cors送信失敗、no-corsで再送します: ' + e2.message);
        try {
          await fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: payload });
          log('no-corsで送信しました(応答は確認できません)');
        } catch (e3) {
          log('送信できませんでした。下のコピー画面から手動で保存してください');
          showJsonCopy(payload);
        }
      }
    } else {
      log('== 取得完了: ' + machines.length + '台。GAS未設定のためコピー画面を表示します ==');
      showJsonCopy(payload);
    }
    log('== 完了。「中止/閉じる」で閉じてください ==');
  } catch (e) {
    log('エラー: ' + e.message);
  } finally {
    window.__slotCollectorRunning = false;
  }
})();
