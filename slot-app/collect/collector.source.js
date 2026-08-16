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
  var filterStr = localStorage.getItem('slot_kishu_filter') || 'ジャグラー';
  var KISHU_FILTER = new RegExp(filterStr);

  var gasUrl = localStorage.getItem('slot_gas_url') || '';
  if (!gasUrl) {
    gasUrl = prompt('GAS WebアプリのURLを入力してください(初回のみ)', '') || '';
    if (!gasUrl) { window.__slotCollectorRunning = false; return; }
    localStorage.setItem('slot_gas_url', gasUrl);
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
    doc.querySelectorAll('#data_counter_s li').forEach(function (li) {
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

  try {
    var date = today();
    log('== スロットデータ収集開始 ' + date + ' 対象:/' + filterStr + '/ ==');

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
          var dedamaUrl = './php/back/show/dedama.php?tenpo_id=' + TENPO +
            '&daiban=' + daiban + '&_date=' + date + '&kishu_no=' + k.no +
            '&from_search=0&p=l&tkn=&dai_ext_tkn=';
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
          log('  台' + daiban + ' BB:' + last.bb + ' RB:' + last.rb + ' 累計:' + last.totalStart + ' 合成:1/' + last.gousei);
        } catch (err) {
          log('  台' + daiban + ' 取得失敗: ' + err.message);
        }
        await sleep(THROTTLE_MS);
      }
    }

    log('== 取得完了: ' + machines.length + '台。GASへ送信中... ==');
    var payload = JSON.stringify({
      ver: 1,
      action: 'collect',
      tenpoId: TENPO,
      targetDate: date,
      collectedAt: new Date().toISOString(),
      machines: machines
    });
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
      await fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: payload });
      log('no-corsで送信しました(応答は確認できません)');
    }
    log('== 完了。「中止/閉じる」で閉じてください ==');
  } catch (e) {
    log('エラー: ' + e.message);
  } finally {
    window.__slotCollectorRunning = false;
  }
})();
