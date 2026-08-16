// スロットデータ収集バックエンド(雛形)
// スプレッドシートに紐づくGASプロジェクトとして作成し、Webアプリとしてデプロイする。
// 収集ブックマークレットからのPOSTを受けてスナップショットを保存し、
// 分析PWAからのGETで履歴データを返す。
// ※ データサイトのHTML構造が判明したら、保存カラムを確定させる。

const SHEET_SNAPSHOTS = 'snapshots';

// ブックマークレットから: { collectedAt, machines: [{ dai, kishu, games, bb, rb, ... }] }
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const sheet = getSheet_(SHEET_SNAPSHOTS);
  const now = new Date();
  const rows = (body.machines || []).map(function (m) {
    return [now, body.collectedAt || '', m.dai || '', m.kishu || '',
            m.games || '', m.bb || '', m.rb || '', JSON.stringify(m)];
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, saved: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 分析PWAから: ?days=N で直近N日分のスナップショットを返す
function doGet(e) {
  const days = Number((e.parameter && e.parameter.days) || 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sheet = getSheet_(SHEET_SNAPSHOTS);
  const values = sheet.getDataRange().getValues();
  const rows = values.filter(function (r) { return r[0] instanceof Date && r[0] >= since; })
    .map(function (r) {
      return { savedAt: r[0], collectedAt: r[1], dai: r[2], kishu: r[3],
               games: r[4], bb: r[5], rb: r[6], raw: r[7] };
    });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['savedAt', 'collectedAt', 'dai', 'kishu', 'games', 'bb', 'rb', 'raw']);
  }
  return sheet;
}
