/**
 * Google Apps Script - 訪問マッサージ記録アプリ バックエンド
 * 
 * デプロイ手順:
 * 1. スプレッドシートを開く
 * 2. 拡張機能 > Apps Script
 * 3. このコードを貼り付け
 * 4. デプロイ > 新しいデプロイ
 * 5. 種類: ウェブアプリ
 * 6. アクセス権限: 全員
 * 7. デプロイURLをアプリに設定
 */

// スプレッドシート取得
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// シート名定数
const SHEET_NAMES = {
  TREATMENT: '施術記録',
  SALES: '営業記録',
  STAFF: '担当者マスタ',
  SCHEDULE: '基本スケジュール',
  OPERATION: '施術録',
  INSTRUCTION: '指示'
};

/**
 * 指示チェックリストの列。
 * ID / 作成日 / 宛先 / 内容 / 期限 / 状態 が本体で、
 * 完了者・完了日は「誰がいつ消したか」をオーナーが後から見るための控え。
 * 位置は必ずこの配列から引くこと（数字を直接書かない）。
 */
const INSTRUCTION_HEADERS = ['ID', '作成日', '宛先', '内容', '期限', '状態', '完了者', '完了日'];
const INSTRUCTION_ID_COLUMN = INSTRUCTION_HEADERS.indexOf('ID') + 1;
const INSTRUCTION_STATUS_COLUMN = INSTRUCTION_HEADERS.indexOf('状態') + 1;
const INSTRUCTION_DONE_BY_COLUMN = INSTRUCTION_HEADERS.indexOf('完了者') + 1;
const INSTRUCTION_DONE_AT_COLUMN = INSTRUCTION_HEADERS.indexOf('完了日') + 1;
// 「@全員」はアプリ側で1人ずつに展開してから送ってくるので、シートに「全員」の行は入らない
const INSTRUCTION_DONE = '完了';

/**
 * 他サービス利用予定データベース（Notion）。
 * 院で固定なのでアプリの設定画面には出さない（宛名ラベルのDBと同じ扱い）。
 */
const SERVICE_PLAN_DB_ID = 'a18e5630-a2bf-4d5d-a22c-8a1cdfdf227b';

// 選択肢は決め打ちにして、知らない値でセレクトが増えないようにする
const SERVICE_PLAN_TYPES = ['訪問介護', '訪問看護', 'デイサービス', 'デイケア', '訪問リハビリ',
  '訪問入浴', '訪問診療', '福祉用具', 'ショートステイ', 'その他'];
const SERVICE_PLAN_DAYS = ['月', '火', '水', '木', '金', '土', '日'];
const SERVICE_PLAN_BANDS = ['午前', '午後', '終日', '時刻指定'];
const SERVICE_PLAN_FREQUENCIES = ['毎週', '隔週', '月1回', '不定期'];

/**
 * 施術録（療養費の裏付けとなる保険記録）で使うチェック項目。
 * 並び順がそのままシートの列順・記録文の語順になる。
 */
const OPERATION_PARTS = ['頸部', '肩部', '背部', '腰部', '上肢', '下肢'];
const OPERATION_TREATMENTS = ['刺鍼', 'てい鍼', '電子温灸器'];
// あんま・マッサージ同意の患者にだけ使う。
// 既存シートの列位置を動かさないよう、個別列は末尾に足す（ensureOperationColumns_）
const MASSAGE_TREATMENT = 'マッサージ';
const ALL_TREATMENTS = OPERATION_TREATMENTS.concat([MASSAGE_TREATMENT]);
// 「部位」「内容」はレセコン取り込み用のカンマ区切り列。
// 頸部〜電子温灸器の個別列は人が見るためのもので、両方を残す。
// 列を後から足せるよう、位置は必ずこの配列から引くこと（数字を直接書かない）。
const OPERATION_HEADERS = ['日付', '患者ID', '患者名', '施術者', '部位', '内容']
  .concat(OPERATION_PARTS)
  .concat(OPERATION_TREATMENTS)
  .concat(['記録文', 'タイムスタンプ']);

const OPERATION_DATE_COLUMN = OPERATION_HEADERS.indexOf('日付') + 1;

/**
 * このWebアプリは「全員アクセス可」でデプロイする必要があるため、
 * 合言葉（スクリプトプロパティ APP_TOKEN）が一致しないリクエストは拒否する。
 * これが無いと URL を知っているだけで誰でも施術記録・営業記録を読み書きできてしまう。
 */
function isAuthorized(params) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) {
    // APP_TOKEN未設定の間は今まで通り誰でも通す（設定直後に全員締め出さないため）
    return true;
  }
  return params.token === expected;
}

/**
 * POSTリクエスト処理
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    const data = params.data || {};

    if (action !== 'ping' && !isAuthorized(params)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let result;

    switch (action) {
      case 'saveTreatment':
        result = saveTreatmentRecord(data);
        break;
      case 'saveSales':
        result = saveSalesRecord(data);
        break;
      case 'getTreatments':
        result = getTreatmentRecords(data);
        break;
      case 'getSales':
        result = getSalesRecords(data);
        break;
      case 'getStaff':
        result = getStaffData();
        break;
      case 'getLastWeekTreatments':
        result = getLastWeekRecords(data, 'treatment');
        break;
      case 'getLastWeekSales':
        result = getLastWeekRecords(data, 'sales');
        break;
      case 'getLatestRecords':
        result = getLatestRecords(data);
        break;
      case 'proxyNotionPatients':
        result = proxyNotionPatients(data);
        break;
      case 'getSchedules':
        result = getBasicSchedulesData();
        break;
      case 'saveOperation':
        result = saveOperationRecord(data);
        break;
      case 'updatePatientBase':
        result = updatePatientBaseTreatment(data);
        break;
      case 'updatePatientNotes':
        result = updatePatientNotes(data);
        break;
      case 'createServicePlan':
        result = createServicePlan(data);
        break;
      case 'deleteServicePlan':
        result = deleteServicePlan(data);
        break;
      case 'getInstructions':
        result = getInstructions(data);
        break;
      case 'saveInstruction':
        result = saveInstruction(data);
        break;
      case 'completeInstruction':
        result = completeInstruction(data);
        break;
      case 'ping':
        result = { success: true, message: 'pong' };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GETリクエスト処理（テスト用）
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Massage Record API is running'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 施術記録シートの区分。8列目に入る。
// 「施術」以外の行は、報告書の施術日にも療養費の申請にも入れないこと。
const TREATMENT_STATUS_DONE = '施術';
const TREATMENT_STATUS_ABSENT = 'お休み・振替';

/**
 * 既存の施術記録シートに「区分」「休みの理由」列が無ければ足す。
 * 何度呼んでも安全。列は末尾に足すので、既存の読み取り位置はずれない。
 */
function ensureTreatmentColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 1)).getValues()[0];

  if (headers.indexOf('区分') === -1) {
    sheet.getRange(1, 8).setValue('区分');
  }
  if (headers.indexOf('休みの理由') === -1) {
    sheet.getRange(1, 9).setValue('休みの理由');
  }
}

/**
 * 施術記録を保存
 */
function saveTreatmentRecord(data) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.TREATMENT);
    
    if (!sheet) {
      throw new Error('施術記録シートが見つかりません');
    }

    ensureTreatmentColumns_(sheet);

    // 区分が送られてこない古いアプリからの保存は「施術」として扱う
    const status = String(data.status || '').trim() === TREATMENT_STATUS_ABSENT
      ? TREATMENT_STATUS_ABSENT
      : TREATMENT_STATUS_DONE;

    const row = [
      data.date || '',
      data.patientId || '',
      data.patientName || '',
      data.staff || '',
      data.memo || '',
      data.timestamp || new Date().toISOString(),
      data.notionSynced || '',
      status,
      status === TREATMENT_STATUS_ABSENT ? (data.absenceReason || '') : ''
    ];
    
    sheet.appendRow(row);
    
    return { success: true, message: '施術記録を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 営業記録を保存
 */
function saveSalesRecord(data) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.SALES);
    
    if (!sheet) {
      throw new Error('営業記録シートが見つかりません');
    }
    
    const row = [
      data.date || '',
      data.careManagerId || '',
      data.officeName || '',
      data.careManagerName || '',
      data.staff || '',
      data.content || '',
      data.timestamp || new Date().toISOString(),
      data.notionSynced || ''
    ];
    
    sheet.appendRow(row);
    
    return { success: true, message: '営業記録を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 施術記録を取得
 */
function getTreatmentRecords(filters) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.TREATMENT);
    
    if (!sheet) {
      throw new Error('施術記録シートが見つかりません');
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const records = [];
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const record = {
        date: row[0] || '',
        patientId: row[1] || '',
        patientName: row[2] || '',
        staff: row[3] || '',
        memo: row[4] || '',
        timestamp: row[5] || '',
        notionSynced: row[6] || '',
        // 古い行は区分が空。その場合は「施術」とみなす
        status: row[7] || TREATMENT_STATUS_DONE,
        absenceReason: row[8] || ''
      };

      // 日付をフォーマット
      if (record.date instanceof Date) {
        record.date = Utilities.formatDate(record.date, 'JST', 'yyyy-MM-dd');
      }

      // フィルター適用
      if (filters.patient && record.patientName !== filters.patient) {
        continue;
      }
      
      if (filters.startDate && record.date < filters.startDate) {
        continue;
      }
      
      if (filters.endDate && record.date > filters.endDate) {
        continue;
      }
      
      records.push(record);
    }
    
    return { success: true, data: records };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 営業記録を取得
 */
function getSalesRecords(filters) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.SALES);
    
    if (!sheet) {
      throw new Error('営業記録シートが見つかりません');
    }
    
    const data = sheet.getDataRange().getValues();
    const records = [];
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      const record = {
        date: row[0] || '',
        careManagerId: row[1] || '',
        officeName: row[2] || '',
        careManagerName: row[3] || '',
        staff: row[4] || '',
        content: row[5] || '',
        timestamp: row[6] || '',
        notionSynced: row[7] || ''
      };

      // 日付をフォーマット
      if (record.date instanceof Date) {
        record.date = Utilities.formatDate(record.date, 'JST', 'yyyy-MM-dd');
      }

      // フィルター適用
      if (filters.startDate && record.date < filters.startDate) {
        continue;
      }
      
      if (filters.endDate && record.date > filters.endDate) {
        continue;
      }
      
      records.push(record);
    }
    
    return { success: true, data: records };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 施術録シートを取得（無ければヘッダー付きで作る）
 * オーナーが手作業でシートを用意しなくても保存できるようにするため。
 */
function getOrCreateOperationSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.OPERATION);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.OPERATION);
    sheet.appendRow(OPERATION_HEADERS);
    sheet.getRange(1, 1, 1, OPERATION_HEADERS.length)
      .setFontWeight('bold').setBackground('#9C27B0').setFontColor('#FFFFFF');

    // 日付列は最初から文字列扱いにして、YYYY-MM-DD のまま残るようにする
    sheet.getRange(1, OPERATION_DATE_COLUMN, sheet.getMaxRows(), 1).setNumberFormat('@');
  }

  return sheet;
}

/**
 * 日付を YYYY-MM-DD の文字列にする。
 * 施術記録シートには日付がDate型で入って表示形式が揺れている行があるため、
 * 施術録では必ずISO形式の文字列で持たせる。
 */
function toIsoDateString(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'JST', 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}

/**
 * チェック内容から記録文を組み立てる
 * 例：腰部、下肢に刺鍼、電子温灸器を施術
 */
function buildOperationNote(parts, treatments) {
  if (!parts.length) {
    return '';
  }
  // 施術内容が未選択のときは手技を書かない（事実と違う記録にしないため）
  if (!treatments.length) {
    return parts.join('、') + 'に施術';
  }
  return parts.join('、') + 'に' + treatments.join('、') + 'を施術';
}

/**
 * 施術録を保存（療養費の裏付けとなる保険記録。患者の様子は書かない）
 */
/**
 * 施術録シートに「マッサージ」列が無ければ末尾に足す。何度呼んでも安全。
 * 途中に差し込むと記録文・タイムスタンプの位置がずれ、過去の行が壊れるので末尾にする。
 */
function ensureOperationColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 1)).getValues()[0];

  if (headers.indexOf(MASSAGE_TREATMENT) === -1) {
    sheet.getRange(1, OPERATION_HEADERS.length + 1).setValue(MASSAGE_TREATMENT);
  }
}

function saveOperationRecord(data) {
  try {
    const sheet = getOrCreateOperationSheet();

    const parts = OPERATION_PARTS.filter(function (name) {
      return (data.parts || []).indexOf(name) !== -1;
    });
    const treatments = ALL_TREATMENTS.filter(function (name) {
      return (data.treatments || []).indexOf(name) !== -1;
    });

    // 部位は必須。施術内容は必須にしない。
    // 選択肢が鍼の手技しかないため、マッサージ同意の患者に選ばせると
    // やっていない施術を記録することになる（2026-08-19 オーナー指摘）
    if (!parts.length) {
      throw new Error('部位を1つ以上選んでください');
    }

    const isoDate = toIsoDateString(data.date);

    const row = [
      isoDate,
      data.patientId || '',
      data.patientName || '',
      data.staff || '',
      // レセコン取り込み用のカンマ区切り
      parts.join(','),
      treatments.join(',')
    ];

    // 人が見るための個別チェック列
    OPERATION_PARTS.forEach(function (name) {
      row.push(parts.indexOf(name) !== -1 ? 'TRUE' : '');
    });
    OPERATION_TREATMENTS.forEach(function (name) {
      row.push(treatments.indexOf(name) !== -1 ? 'TRUE' : '');
    });

    row.push(data.note || buildOperationNote(parts, treatments));
    row.push(data.timestamp || new Date().toISOString());

    // マッサージは後から足した項目。既存の列をずらさないよう最後に置く
    ensureOperationColumns_(sheet);
    row.push(treatments.indexOf(MASSAGE_TREATMENT) !== -1 ? 'TRUE' : '');

    sheet.appendRow(row);

    // 日付がDate型に変換されて表示形式で揺れないよう、書式を文字列にして入れ直す
    const dateCell = sheet.getRange(sheet.getLastRow(), OPERATION_DATE_COLUMN);
    dateCell.setNumberFormat('@');
    dateCell.setValue(isoDate);

    return { success: true, message: '施術録を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
/**
 * 患者ごとの「直近1回分」をまとめて返す（アプリのカードに出す参考表示用）。
 *
 * 担当者は絞らない。誰が入った回でも、その患者の最後の記録を返す。
 *
 * リクエスト:
 *   { action: 'getLatestRecords', token: '合言葉',
 *     data: { patients: [ { name: '山田 太郎', id: '' }, ... ] } }
 *   ※ patients は文字列の配列（名前だけ）でも受け付ける。
 *
 * レスポンス:
 *   { success: true,
 *     data: {
 *       '山田 太郎': {
 *         patientName: '山田 太郎',
 *         date: '2026-08-20',        // 施術記録シートの最新日
 *         staff: '五十嵐',
 *         status: '施術',            // または 'お休み・振替'
 *         absenceReason: '',
 *         memo: '肩の張りが強い',
 *         parts: ['肩部', '腰部'],       // 施術録シートの最新日（無ければ空配列）
 *         treatments: ['てい鍼'],
 *         operationDate: '2026-08-20'    // 部位・施術内容を取った日
 *       },
 *       '該当なしの患者名': null
 *     } }
 *
 * 効率のため、各シートは getDataRange().getValues() で1回だけ読み、
 * 患者名をキーにしたマップを作ってから引く（患者ごとにシートを走査しない）。
 */
function getLatestRecords(data) {
  try {
    var requested = normalizeLatestRecordTargets_(data);

    if (!requested.length) {
      return { success: true, data: {} };
    }

    var treatmentMap = buildLatestTreatmentMap_();
    var operationMap = buildLatestOperationMap_();

    var out = {};
    for (var i = 0; i < requested.length; i++) {
      var target = requested[i];
      var key = normalizeLatestRecordName_(target.name);
      var latest = key ? treatmentMap[key] : null;

      if (!latest) {
        out[target.name] = null;
        continue;
      }

      var operation = key ? operationMap[key] : null;

      out[target.name] = {
        patientName: latest.patientName,
        date: latest.date,
        staff: latest.staff,
        status: latest.status,
        absenceReason: latest.absenceReason,
        memo: latest.memo,
        parts: operation ? operation.parts : [],
        treatments: operation ? operation.treatments : [],
        operationDate: operation ? operation.date : ''
      };
    }

    return { success: true, data: out };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 患者の指定を { name, id } の配列に揃える。
 * 名前だけの配列で送られてきても動くようにしておく。
 */
function normalizeLatestRecordTargets_(data) {
  var list = (data && data.patients) || [];
  var out = [];
  var seen = {};

  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var name = (item && typeof item === 'object') ? item.name : item;
    name = String(name || '').trim();
    if (!name || seen[name]) continue;
    seen[name] = true;
    out.push({ name: name, id: (item && typeof item === 'object' && item.id) || '' });
  }
  return out;
}

/**
 * 患者名の表記ゆれを吸収したキー。
 * アプリ側の normalizePatientName と同じ規則にする
 *（かっこ書きを落として空白を全部取る）。ここを変えるなら両方直すこと。
 */
function normalizeLatestRecordName_(name) {
  return String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\u3000]/g, '')
    .trim();
}

/**
 * 施術記録シートを1回だけ読み、患者名 → 最新の1行 のマップを作る
 */
function buildLatestTreatmentMap_() {
  var map = {};
  var sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.TREATMENT);
  if (!sheet) return map;

  var rows = sheet.getDataRange().getValues();

  // [日付, 患者ID, 患者名, 担当者, メモ, タイムスタンプ, Notion同期, 区分, 休みの理由]
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var name = String(row[2] || '').trim();
    if (!name) continue;

    var key = normalizeLatestRecordName_(name);
    var date = toIsoDateString(row[0]);
    var timestamp = String(row[5] || '');

    var current = map[key];
    // 同じ日付の行が複数あれば、タイムスタンプの新しい方を採用する
    if (current && (current.date > date ||
        (current.date === date && current.timestamp >= timestamp))) {
      continue;
    }

    map[key] = {
      patientName: name,
      date: date,
      staff: String(row[3] || ''),
      memo: String(row[4] || ''),
      timestamp: timestamp,
      // 古い行は区分が空。その場合は「施術」とみなす
      status: String(row[7] || '') || TREATMENT_STATUS_DONE,
      absenceReason: String(row[8] || '')
    };
  }

  return map;
}

/**
 * 施術録シートを1回だけ読み、患者名 → 最新の部位・施術内容 のマップを作る。
 * 部位・施術内容はこのシートにしか無いので、患者名で施術記録と突き合わせる。
 * 列の位置は OPERATION_HEADERS から引く（数字を直接書かない）。
 */
function buildLatestOperationMap_() {
  var map = {};
  var sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.OPERATION);
  if (!sheet) return map;

  var rows = sheet.getDataRange().getValues();
  if (!rows.length) return map;

  var dateCol = OPERATION_HEADERS.indexOf('日付');
  var nameCol = OPERATION_HEADERS.indexOf('患者名');
  var partsCol = OPERATION_HEADERS.indexOf('部位');
  var treatmentsCol = OPERATION_HEADERS.indexOf('内容');
  var timestampCol = OPERATION_HEADERS.indexOf('タイムスタンプ');

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;

    var key = normalizeLatestRecordName_(name);
    var date = toIsoDateString(row[dateCol]);
    var timestamp = String(row[timestampCol] || '');

    var current = map[key];
    if (current && (current.date > date ||
        (current.date === date && current.timestamp >= timestamp))) {
      continue;
    }

    map[key] = {
      date: date,
      timestamp: timestamp,
      parts: splitOperationList_(row[partsCol]),
      treatments: splitOperationList_(row[treatmentsCol])
    };
  }

  return map;
}

/**
 * 「肩部,腰部」のカンマ区切り列を配列に戻す
 */
function splitOperationList_(value) {
  return String(value || '')
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(function (item) { return item !== ''; });
}

/**
 * 先週の記録コピー用データ取得
 * @param {Object} data - { staff: 担当者名, baseDate: 基準日(yyyy-MM-dd) }
 * @param {string} type - 'treatment' or 'sales'
 */
function getLastWeekRecords(data, type) {
  try {
    var sheetName = type === 'treatment' ? SHEET_NAMES.TREATMENT : SHEET_NAMES.SALES;
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    
    if (!sheet) {
      throw new Error(sheetName + 'シートが見つかりません');
    }
    
    var staffName = data.staff;
    var baseDate = data.baseDate ? new Date(data.baseDate + 'T00:00:00+09:00') : new Date();
    
    // 7日前と14日前の日付を計算
    var oneWeekAgo = new Date(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    var twoWeeksAgo = new Date(baseDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    var oneWeekStr = Utilities.formatDate(oneWeekAgo, 'JST', 'yyyy-MM-dd');
    var twoWeeksStr = Utilities.formatDate(twoWeeksAgo, 'JST', 'yyyy-MM-dd');
    
    var allData = sheet.getDataRange().getValues();
    
    // 施術記録: [日付, 患者ID, 患者名, 担当者, メモ, ...]
    // 営業記録: [日付, ケアマネID, 事業所名, ケアマネ名, 営業担当, 内容, ...]
    var nameCol = type === 'treatment' ? 2 : 3;  // 患者名 or ケアマネ名
    var staffCol = type === 'treatment' ? 3 : 4;  // 担当者 or 営業担当
    var memoCol = type === 'treatment' ? 4 : 5;   // メモ or 内容
    
    // Step1: 7日前に担当者が訪問した対象者を抽出
    var targetNames = [];
    for (var i = 1; i < allData.length; i++) {
      var rowDate = allData[i][0];
      if (rowDate instanceof Date) {
        rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy-MM-dd');
      }
      var rowName = allData[i][nameCol] || '';
      var rowStaff = allData[i][staffCol] || '';
      
      if (rowDate === oneWeekStr && rowStaff === staffName && rowName !== '') {
        if (targetNames.indexOf(rowName) === -1) {
          targetNames.push(rowName);
        }
      }
    }
    
    // 7日前に該当なし → 14日前で再検索
    var searchedDate = oneWeekStr;
    if (targetNames.length === 0) {
      searchedDate = twoWeeksStr;
      for (var i = 1; i < allData.length; i++) {
        var rowDate = allData[i][0];
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy-MM-dd');
        }
        var rowName = allData[i][nameCol] || '';
        var rowStaff = allData[i][staffCol] || '';
        
        if (rowDate === twoWeeksStr && rowStaff === staffName && rowName !== '') {
          if (targetNames.indexOf(rowName) === -1) {
            targetNames.push(rowName);
          }
        }
      }
    }
    
    if (targetNames.length === 0) {
      return { success: true, data: [], searchedDate: searchedDate, message: 'no_records' };
    }
    
    // Step2: 各対象者の最新訪問のメモを取得
    var results = [];
    for (var t = 0; t < targetNames.length; t++) {
      var name = targetNames[t];
      var latestDate = '';
      var latestMemo = '';
      
      for (var i = 1; i < allData.length; i++) {
        var rowName = allData[i][nameCol] || '';
        if (rowName !== name) continue;
        
        var rowDate = allData[i][0];
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy-MM-dd');
        }
        
        if (rowDate > latestDate) {
          latestDate = rowDate;
          latestMemo = allData[i][memoCol] || '';
        }
      }
      
      results.push({
        name: name,
        memo: latestMemo,
        latestDate: latestDate
      });
    }
    
    return { success: true, data: results, searchedDate: searchedDate };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}





/**
 * 担当者マスタを取得
 */
function getStaffData() {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.STAFF);
    
    if (!sheet) {
      throw new Error('担当者マスタシートが見つかりません');
    }
    
    const data = sheet.getDataRange().getValues();
    const staff = [];
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // ステータスが「稼働中」のみ
      if (row[1] === '稼働中') {
        staff.push({
          name: row[0] || '',
          status: row[1] || '',
          type: row[2] || ''
        });
      }
    }
    
    return { success: true, data: staff };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Notion APIプロキシ（患者データ取得）
 */
function proxyNotionPatients(data) {
  try {
    // サーバー側（スクリプトプロパティ）のキーを優先する。
    // クライアントから送られてきたキーは、サーバー側が未設定のときの後方互換用。
    const serverApiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
    const apiKey = serverApiKey || data.apiKey;
    const dbId = data.dbId;

    if (!apiKey || !dbId) {
      throw new Error('APIキーまたはデータベースIDが指定されていません');
    }
    
    const url = `https://api.notion.com/v1/databases/${dbId}/query`;
    
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;
    
    while (hasMore) {
      const payload = { page_size: 100 };
      if (nextCursor) {
        payload.start_cursor = nextCursor;
      }
      
      const options = {
        method: 'post',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode !== 200) {
        throw new Error(`Notion API error: ${statusCode} - ${response.getContentText()}`);
      }
      
      const result = JSON.parse(response.getContentText());
      allResults = allResults.concat(result.results || []);
      
      hasMore = result.has_more;
      nextCursor = result.next_cursor;
    }
    
    return { 
      success: true, 
      data: allResults
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 患者データベース（Notion）の基本施術を更新する。
 * 施術録で「1度入力したら次回から既定値になる」を実現するための書き込み。
 *
 * 患者DBにはレセコン同期・営業管理アプリ・手作業という別の書き込み経路があるため、
 * ここでは「基本施術部位」「基本施術内容」の2つ以外には絶対に触れない。
 * 値も定数の一覧に無いものは弾き、マルチセレクトに知らない選択肢が増えないようにする。
 */
function updatePatientBaseTreatment(data) {
  try {
    // proxyNotionPatientsと同じく、サーバー側（スクリプトプロパティ）のキーを優先する
    const serverApiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
    const apiKey = serverApiKey || data.apiKey;
    const pageId = data.patientId;

    if (!apiKey || !pageId) {
      throw new Error('APIキーまたは患者IDが指定されていません');
    }

    const parts = OPERATION_PARTS.filter(function (name) {
      return (data.parts || []).indexOf(name) !== -1;
    });
    const treatments = ALL_TREATMENTS.filter(function (name) {
      return (data.treatments || []).indexOf(name) !== -1;
    });

    const toOptions = function (names) {
      return names.map(function (name) {
        return { name: name };
      });
    };

    // 送るのはこの2つのプロパティだけ
    const properties = {
      '基本施術部位': { multi_select: toOptions(parts) },
      '基本施術内容': { multi_select: toOptions(treatments) }
    };

    const options = {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ properties: properties }),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, options);
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      throw new Error(`Notion API error: ${statusCode} - ${response.getContentText()}`);
    }

    return { success: true, message: '基本施術を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// =============================================
// Notionへの書き込み（患者メモ・他サービス利用予定）
//
// 患者DBにはレセコン同期・営業管理アプリ・手作業という別の書き込み経路がある。
// 「送るプロパティは指定のものだけ」を徹底し、他の列を巻き込まないこと。
// =============================================

/**
 * Notion APIキーを取り出す。
 * proxyNotionPatients と同じく、サーバー側（スクリプトプロパティ）を優先し、
 * 無ければクライアントから送られてきたキーを使う。
 */
function getNotionApiKey_(data) {
  const serverApiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
  const apiKey = serverApiKey || (data && data.apiKey);

  if (!apiKey) {
    throw new Error('Notion APIキーが設定されていません');
  }

  return apiKey;
}

/**
 * Notion APIを1回叩く。失敗時は本文付きで例外にする。
 */
function callNotionApi_(url, method, body, apiKey) {
  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error(`Notion API error: ${statusCode} - ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

/**
 * テキストをNotionのrich_textにする。空文字は空配列＝欄を消す。
 */
function toNotionRichText_(value) {
  const text = String(value == null ? '' : value);

  if (!text) {
    return { rich_text: [] };
  }

  // Notionの1ブロック上限（2000文字）を超えると弾かれるので切る
  return { rich_text: [{ text: { content: text.slice(0, 2000) } }] };
}

/**
 * 一覧に無い値は捨てる（セレクトに知らない選択肢が増えないようにする）
 */
function pickAllowedValue_(value, allowed) {
  const text = String(value == null ? '' : value).trim();
  return allowed.indexOf(text) !== -1 ? text : '';
}

function todayIsoDate_() {
  return Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
}

/**
 * 患者ページのメモ欄を更新する。
 * 触るのは 既往歴 / 現在の症状 / 同居家族 / 患者メモ最終更新 の4つだけ。
 */
function updatePatientNotes(data) {
  try {
    const apiKey = getNotionApiKey_(data);
    const pageId = data.patientId;

    if (!pageId) {
      throw new Error('患者IDが指定されていません');
    }

    const properties = {
      '既往歴': toNotionRichText_(data.history),
      '現在の症状': toNotionRichText_(data.symptoms),
      '同居家族': toNotionRichText_(data.family),
      '患者メモ最終更新': { date: { start: todayIsoDate_() } }
    };

    callNotionApi_(`https://api.notion.com/v1/pages/${pageId}`, 'patch',
      { properties: properties }, apiKey);

    return { success: true, message: '患者情報を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 他サービス利用予定を1件作る。
 * 表示用のタイトル「訪問介護 火 10:00」はここで組み立てる。
 */
function createServicePlan(data) {
  try {
    const apiKey = getNotionApiKey_(data);
    const patientId = data.patientId;

    if (!patientId) {
      throw new Error('患者が指定されていません');
    }

    const service = pickAllowedValue_(data.service, SERVICE_PLAN_TYPES);
    if (!service) {
      throw new Error('サービス種別を選んでください');
    }

    const days = SERVICE_PLAN_DAYS.filter(function (name) {
      return (data.days || []).indexOf(name) !== -1;
    });
    const band = pickAllowedValue_(data.band, SERVICE_PLAN_BANDS);
    const frequency = pickAllowedValue_(data.frequency, SERVICE_PLAN_FREQUENCIES);

    // 時刻は「時刻指定」のときだけ持たせる
    const startTime = band === '時刻指定' ? String(data.startTime || '').trim() : '';
    const endTime = band === '時刻指定' ? String(data.endTime || '').trim() : '';

    const titleParts = [service];
    if (days.length) titleParts.push(days.join('・'));
    if (startTime) {
      titleParts.push(startTime);
    } else if (band) {
      titleParts.push(band);
    }

    const properties = {
      '予定': { title: [{ text: { content: titleParts.join(' ') } }] },
      '患者': { relation: [{ id: patientId }] },
      'サービス種別': { select: { name: service } },
      '事業所名': toNotionRichText_(data.office),
      '曜日': {
        multi_select: days.map(function (name) {
          return { name: name };
        })
      },
      '開始時刻': toNotionRichText_(startTime),
      '終了時刻': toNotionRichText_(endTime),
      '備考': toNotionRichText_(data.note),
      '登録者': toNotionRichText_(data.staff),
      '登録日': { date: { start: todayIsoDate_() } }
    };

    // セレクトは空の名前を送れないので、選ばれた時だけ入れる
    if (band) properties['時間帯'] = { select: { name: band } };
    if (frequency) properties['頻度'] = { select: { name: frequency } };

    const result = callNotionApi_('https://api.notion.com/v1/pages', 'post', {
      parent: { database_id: SERVICE_PLAN_DB_ID },
      properties: properties
    }, apiKey);

    return { success: true, id: result.id, message: '他サービスの予定を登録しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 他サービス利用予定を消す（Notionの流儀に合わせてアーカイブする）
 */
function deleteServicePlan(data) {
  try {
    const apiKey = getNotionApiKey_(data);
    const pageId = data.planId;

    if (!pageId) {
      throw new Error('削除する予定が指定されていません');
    }

    callNotionApi_(`https://api.notion.com/v1/pages/${pageId}`, 'patch',
      { archived: true }, apiKey);

    return { success: true, message: '他サービスの予定を削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// =============================================
// 指示チェックリスト（オーナー → スタッフ）
// =============================================

/**
 * 指示シートを取得（無ければヘッダー付きで作る）。施術録シートと同じ要領。
 */
function getOrCreateInstructionSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.INSTRUCTION);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.INSTRUCTION);
    sheet.appendRow(INSTRUCTION_HEADERS);
    sheet.getRange(1, 1, 1, INSTRUCTION_HEADERS.length)
      .setFontWeight('bold').setBackground('#FF9800').setFontColor('#FFFFFF');

    // 日付列は文字列扱いにして YYYY-MM-DD のまま残るようにする
    [INSTRUCTION_HEADERS.indexOf('作成日') + 1,
    INSTRUCTION_HEADERS.indexOf('期限') + 1,
    INSTRUCTION_DONE_AT_COLUMN].forEach(function (column) {
      sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
  }

  return sheet;
}

/**
 * 指示シートの1行をアプリ側の形にする
 */
function toInstructionRecord_(row) {
  return {
    id: String(row[INSTRUCTION_HEADERS.indexOf('ID')] || ''),
    createdAt: toIsoDateString(row[INSTRUCTION_HEADERS.indexOf('作成日')]),
    target: String(row[INSTRUCTION_HEADERS.indexOf('宛先')] || ''),
    content: String(row[INSTRUCTION_HEADERS.indexOf('内容')] || ''),
    due: toIsoDateString(row[INSTRUCTION_HEADERS.indexOf('期限')]),
    status: String(row[INSTRUCTION_HEADERS.indexOf('状態')] || ''),
    doneBy: String(row[INSTRUCTION_DONE_BY_COLUMN - 1] || ''),
    doneAt: toIsoDateString(row[INSTRUCTION_DONE_AT_COLUMN - 1])
  };
}

/**
 * 指示を取得する。
 * data.target を渡すと、その人宛て＋全員宛てだけを返す（スタッフ端末用）。
 * data.onlyPending が true なら未完了だけを返す。
 */
function getInstructions(data) {
  try {
    const sheet = getOrCreateInstructionSheet();
    const values = sheet.getDataRange().getValues();
    const target = String((data && data.target) || '').trim();
    const onlyPending = !!(data && data.onlyPending);
    const records = [];

    for (let i = 1; i < values.length; i++) {
      const record = toInstructionRecord_(values[i]);

      // IDも内容も無い空行は飛ばす
      if (!record.id && !record.content) continue;

      // 1人1行なので、自分宛て以外は返さない
      if (target && record.target !== target) continue;
      if (onlyPending && record.status === INSTRUCTION_DONE) continue;

      records.push(record);
    }

    return { success: true, data: records };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 指示を1件登録する（オーナーのみが使う想定）
 */
function saveInstruction(data) {
  try {
    const sheet = getOrCreateInstructionSheet();

    const content = String(data.content || '').trim();

    // 宛先は複数。@で複数の人に送っても、シートには1人1行で入れる。
    // 1行を共有すると、誰か1人がチェックしたときに他の人の画面からも消えてしまうため
    const targets = (data.targets || [String(data.target || '')])
      .map(function (name) { return String(name || '').trim(); })
      .filter(Boolean)
      .filter(function (name, index, all) { return all.indexOf(name) === index; });

    if (targets.length === 0) throw new Error('宛先を指定してください');
    if (!content) throw new Error('指示の内容を入力してください');

    // 同じ指示から作った行は同じIDを持つ。オーナー画面でまとめて表示するため
    const id = data.id || ('INS-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000));
    const createdAt = toIsoDateString(data.createdAt) || todayIsoDate_();
    const due = toIsoDateString(data.due);

    const rows = targets.map(function (target) {
      const row = [];
      row[INSTRUCTION_HEADERS.indexOf('ID')] = id;
      row[INSTRUCTION_HEADERS.indexOf('作成日')] = createdAt;
      row[INSTRUCTION_HEADERS.indexOf('宛先')] = target;
      row[INSTRUCTION_HEADERS.indexOf('内容')] = content;
      row[INSTRUCTION_HEADERS.indexOf('期限')] = due;
      row[INSTRUCTION_HEADERS.indexOf('状態')] = '';
      row[INSTRUCTION_DONE_BY_COLUMN - 1] = '';
      row[INSTRUCTION_DONE_AT_COLUMN - 1] = '';
      return row;
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, INSTRUCTION_HEADERS.length)
      .setValues(rows);

    return { success: true, id: id, count: rows.length, message: '指示を登録しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 指示にチェックを付ける（状態＝完了）。誰がいつ消したかも残す。
 */
function completeInstruction(data) {
  try {
    const sheet = getOrCreateInstructionSheet();
    const id = String(data.id || '').trim();
    const staff = String(data.staff || '').trim();

    if (!id) throw new Error('指示IDが指定されていません');

    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][INSTRUCTION_ID_COLUMN - 1] || '') !== id) continue;

      // 同じIDの行が宛先の人数ぶんある。自分の行だけを完了にする
      const rowTarget = String(values[i][INSTRUCTION_HEADERS.indexOf('宛先')] || '').trim();
      if (staff && rowTarget !== staff) continue;

      const rowNumber = i + 1;
      sheet.getRange(rowNumber, INSTRUCTION_STATUS_COLUMN).setValue(INSTRUCTION_DONE);
      sheet.getRange(rowNumber, INSTRUCTION_DONE_BY_COLUMN).setValue(staff || rowTarget);

      const doneAt = sheet.getRange(rowNumber, INSTRUCTION_DONE_AT_COLUMN);
      doneAt.setNumberFormat('@');
      doneAt.setValue(todayIsoDate_());

      return { success: true, message: '指示を完了にしました' };
    }

    throw new Error('指示が見つかりません');
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * スプレッドシート初期化（初回セットアップ用）
 * スクリプトエディタから手動実行
 */
function initializeSpreadsheet() {
  const ss = getSpreadsheet();
  
  // 施術記録シート
  let treatmentSheet = ss.getSheetByName(SHEET_NAMES.TREATMENT);
  if (!treatmentSheet) {
    treatmentSheet = ss.insertSheet(SHEET_NAMES.TREATMENT);
    treatmentSheet.appendRow(['日付', '患者ID', '患者名', '担当者', 'メモ', 'タイムスタンプ', 'Notion送信済み', '区分', '休みの理由']);
    treatmentSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#2196F3').setFontColor('#FFFFFF');
  }
  
  // 営業記録シート
  let salesSheet = ss.getSheetByName(SHEET_NAMES.SALES);
  if (!salesSheet) {
    salesSheet = ss.insertSheet(SHEET_NAMES.SALES);
    salesSheet.appendRow(['日付', 'ケアマネID', '事業所名', 'ケアマネ名', '営業担当', '内容', 'タイムスタンプ', 'Notion送信済み']);
    salesSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
  }
  
  // 施術録シート（療養費の保険記録）
  getOrCreateOperationSheet();

  // 指示シート（オーナーからスタッフへの指示チェックリスト）
  getOrCreateInstructionSheet();

  // 担当者マスタシート
  let staffSheet = ss.getSheetByName(SHEET_NAMES.STAFF);
  if (!staffSheet) {
    staffSheet = ss.insertSheet(SHEET_NAMES.STAFF);
    staffSheet.appendRow(['担当者名', 'ステータス', '種別']);
    staffSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#607D8B').setFontColor('#FFFFFF');
    
    // 初期データ
    const initialStaff = [
      ['五十嵐', '稼働中', '施術・営業'],
      ['ゆう', '稼働中', '営業'],
      ['ショル', '稼働中', '施術'],
      ['小幡', '稼働中', '施術'],
      ['山崎', '稼働中', '施術'],
      ['(自動記述)', '稼働中', '営業']
    ];
    
    initialStaff.forEach(staff => {
      staffSheet.appendRow(staff);
    });
  }
  
  Logger.log('スプレッドシートの初期化が完了しました');
}

/**
 * 時間割形式（マトリクス型・シート分割方式）の基本スケジュールを取得
 * シート名のルール： 「名前_種別」 （例：「五十嵐_施術」「五十嵐_営業」）
 */
function getBasicSchedulesData() {
  try {
    const sheets = getSpreadsheet().getSheets();
    const schedules = [];
    
    for (const sheet of sheets) {
        const sheetName = sheet.getName();
        
        // シート名に "_" が含まれているものだけを対象とする
        if (!sheetName.includes('_')) continue;
        
        const [staff, typeRaw] = sheetName.split('_');
        if (!staff || !typeRaw) continue;
        
        // 種類を判定
        let type;
        if (typeRaw.includes('施術')) {
            type = 'treatment';
        } else if (typeRaw.includes('営業')) {
            type = 'sales';
        } else {
            continue; // 施術シートでも営業シートでもない場合はスキップ
        }
        
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue; // データがない場合はスキップ
        
        // [時間(0), 月(1), 火(2), 水(3), 木(4), 金(5), 土(6), 日(7)] 
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            
            let timeStr = '';
            if (row[0] instanceof Date) {
               timeStr = Utilities.formatDate(row[0], 'JST', 'HH:mm');
            } else {
               timeStr = (row[0] || '').toString().trim();
               // '9:00' などの表記を '09:00' に揃える
               if (timeStr.length === 4 && timeStr.indexOf(':') === 1) {
                  timeStr = '0' + timeStr;
               }
            }
            
            if (!timeStr) continue;
            
            const days = ['月', '火', '水', '木', '金', '土', '日'];
            
            for (let d = 0; d < 7; d++) {
                const index = 1 + d;
                const patientName = (row[index] || '').toString().trim();
                if (patientName) {
                    schedules.push({
                       staff: staff,
                       type: type,
                       time: timeStr,
                       day: days[d],
                       name: patientName
                    });
                }
            }
        }
    }
    
    return { success: true, data: schedules };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
