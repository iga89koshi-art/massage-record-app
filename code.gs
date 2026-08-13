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
  SCHEDULE: '基本スケジュール'
};

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
      case 'proxyNotionPatients':
        result = proxyNotionPatients(data);
        break;
      case 'getSchedules':
        result = getBasicSchedulesData();
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

/**
 * 施術記録を保存
 */
function saveTreatmentRecord(data) {
  try {
    const sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.TREATMENT);
    
    if (!sheet) {
      throw new Error('施術記録シートが見つかりません');
    }
    
    const row = [
      data.date || '',
      data.patientId || '',
      data.patientName || '',
      data.staff || '',
      data.memo || '',
      data.timestamp || new Date().toISOString(),
      data.notionSynced || ''
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
        notionSynced: row[6] || ''
      };
      
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
 * スプレッドシート初期化（初回セットアップ用）
 * スクリプトエディタから手動実行
 */
function initializeSpreadsheet() {
  const ss = getSpreadsheet();
  
  // 施術記録シート
  let treatmentSheet = ss.getSheetByName(SHEET_NAMES.TREATMENT);
  if (!treatmentSheet) {
    treatmentSheet = ss.insertSheet(SHEET_NAMES.TREATMENT);
    treatmentSheet.appendRow(['日付', '患者ID', '患者名', '担当者', 'メモ', 'タイムスタンプ', 'Notion送信済み']);
    treatmentSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#2196F3').setFontColor('#FFFFFF');
  }
  
  // 営業記録シート
  let salesSheet = ss.getSheetByName(SHEET_NAMES.SALES);
  if (!salesSheet) {
    salesSheet = ss.insertSheet(SHEET_NAMES.SALES);
    salesSheet.appendRow(['日付', 'ケアマネID', '事業所名', 'ケアマネ名', '営業担当', '内容', 'タイムスタンプ', 'Notion送信済み']);
    salesSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
  }
  
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
