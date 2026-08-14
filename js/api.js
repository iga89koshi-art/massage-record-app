// API通信

/**
 * GAS APIにリクエスト送信
 */
async function callGasApi(action, data = {}, apiUrl) {
    const gasUrl = apiUrl || getGasApiUrl();

    if (!gasUrl) {
        throw new Error('GAS APIのURLが設定されていません');
    }

    const payload = {
        action: action,
        data: data,
        token: getAppToken()
    };

    try {
        const response = await fetch(gasUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        console.error('GAS API Error:', error);
        throw error;
    }
}

/**
 * リトライ付きAPI呼び出し
 */
async function callApiWithRetry(apiFunc, maxRetries = 3) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiFunc();
        } catch (error) {
            lastError = error;
            console.warn(`API call failed (attempt ${i + 1}/${maxRetries}):`, error);

            if (i < maxRetries - 1) {
                // 指数バックオフ
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }

    throw lastError;
}

// === 施術記録 ===

async function saveTreatmentRecord(record) {
    if (!navigator.onLine) {
        // オフライン時はキューに追加
        addToOfflineQueue({
            type: 'treatment',
            data: record
        });
        refreshSyncBadgeSafe();
        requestBackgroundSync();
        return { success: true, offline: true };
    }

    return await callApiWithRetry(() =>
        callGasApi('saveTreatment', record)
    );
}

async function getTreatmentRecords(filters = {}) {
    return await callApiWithRetry(() =>
        callGasApi('getTreatments', filters)
    );
}

// === 営業記録 ===

async function saveSalesRecord(record) {
    if (!navigator.onLine) {
        addToOfflineQueue({
            type: 'sales',
            data: record
        });
        refreshSyncBadgeSafe();
        requestBackgroundSync();
        return { success: true, offline: true };
    }

    return await callApiWithRetry(() =>
        callGasApi('saveSales', record)
    );
}

async function getSalesRecords(filters = {}) {
    return await callApiWithRetry(() =>
        callGasApi('getSales', filters)
    );
}

// === 施術録（療養費の保険記録） ===

async function saveOperationRecord(record) {
    if (!navigator.onLine) {
        // オフライン時はキューに追加
        addToOfflineQueue({
            type: 'operation',
            data: record
        });
        refreshSyncBadgeSafe();
        requestBackgroundSync();
        return { success: true, offline: true };
    }

    return await callApiWithRetry(() =>
        callGasApi('saveOperation', record)
    );
}

/**
 * 患者DBの基本施術（次回の既定値）を更新する。
 * 施術録の保存とは切り離した「おまけ」の更新なので、
 * 失敗しても記録の保存は成功扱いにする（呼び出し側で握りつぶす前提）。
 */
async function updatePatientBaseTreatment(patientId, parts, treatments) {
    return await callApiWithRetry(() =>
        callGasApi('updatePatientBase', { patientId, parts, treatments }), 2
    );
}

// === 基本スケジュール ===

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * スケジュール表から読み取った行を整える。
 * シート先頭に表題行などがあると見出し行（時間・月・火…）が
 * そのまま患者として混ざってくるため、時刻の形をしていない行は捨てる。
 */
function sanitizeSchedules(rows) {
    if (!Array.isArray(rows)) return [];

    return rows.reduce((acc, row) => {
        if (!row) return acc;

        const time = String(row.time || '').trim();
        const name = String(row.name || '').trim();
        const match = time.match(TIME_PATTERN);

        // 時刻列が「時間」などの見出しになっている行は除外
        if (!match) return acc;
        // 患者名が曜日名になっている行（見出しの取り込み）は除外
        if (!name || WEEKDAY_LABELS.includes(name)) return acc;

        acc.push({
            staff: String(row.staff || '').trim(),
            type: row.type,
            day: String(row.day || '').trim(),
            // 並べ替えのため 9:00 → 09:00 に揃える
            time: `${match[1].padStart(2, '0')}:${match[2]}`,
            name: name
        });
        return acc;
    }, []);
}

async function fetchSchedulesFromGas() {
    // スケジュール表が別スプレッドシートにある場合は専用URLを使う
    const scheduleUrl = getGasScheduleUrl();

    const result = await callApiWithRetry(() =>
        callGasApi('getSchedules', {}, scheduleUrl)
    );

    if (result.success && result.data) {
        const schedules = sanitizeSchedules(result.data);
        saveSchedules(schedules);
        return schedules;
    }

    throw new Error('スケジュールデータの取得に失敗しました');
}

// === 訪問予定（Notion 訪問予定データベース） ===

function plainText(richText) {
    return (richText || []).map(t => t.plain_text).join('').trim();
}

/**
 * Notionのマルチセレクトを名前の配列にする
 */
function multiSelectNames(prop) {
    return ((prop && prop.multi_select) || []).map(o => o.name);
}

/**
 * NotionのページIDはハイフン有無が混在しうるので揃える
 */
function normalizeNotionId(id) {
    return String(id || '').replace(/-/g, '').toLowerCase();
}

/**
 * 訪問予定データベースの1件を、スケジュール1件に変換する。
 * 患者はリレーションなので、取得済みの患者リストからIDで名前を引く。
 */
function toVisitPlan(item, patientNameById) {
    const props = item.properties || {};

    // 「非継続」にチェックが付いた予定は表示しない
    if (props['非継続'] && props['非継続'].checkbox) return null;

    const staff = props['施術担当者'] && props['施術担当者'].select
        ? props['施術担当者'].select.name : '';
    const day = props['曜日'] && props['曜日'].select
        ? props['曜日'].select.name : '';
    const time = plainText(props['開始時刻'] && props['開始時刻'].rich_text);

    const relations = (props['患者'] && props['患者'].relation) || [];
    let name = relations
        .map(r => patientNameById[normalizeNotionId(r.id)])
        .filter(Boolean)
        .join(' / ');

    // リレーションが解決できない場合はタイトル「火 08:30 髙橋 伊三郎」から拾う
    if (!name) {
        const title = plainText(props['訪問'] && props['訪問'].title);
        name = title.replace(/^\S+\s*\d{1,2}:\d{2}\s*/, '').trim();
    }

    if (!staff || !day || !name) return null;

    const match = time.match(TIME_PATTERN);
    const duration = props['所要時間(分)'] ? props['所要時間(分)'].number : null;

    return {
        staff: staff,
        type: 'treatment',
        day: day,
        time: match ? `${match[1].padStart(2, '0')}:${match[2]}` : '',
        name: name,
        duration: duration || null,
        note: plainText(props['備考'] && props['備考'].rich_text)
    };
}

async function fetchVisitPlansFromNotion() {
    const apiKey = getNotionApiKey();
    const dbId = getNotionVisitPlanDb();

    // APIキーはサーバー側（スクリプトプロパティ NOTION_API_KEY）にあれば空でよい。
    // 空のまま送り、サーバー側にも無ければサーバーがエラーを返す。
    if (!dbId) {
        throw new Error('訪問予定データベースの設定が不完全です');
    }

    const result = await callApiWithRetry(() =>
        callGasApi('proxyNotionPatients', { apiKey, dbId })
    );

    if (!result.success || !result.data) {
        throw new Error('訪問予定の取得に失敗しました');
    }

    // 患者リレーションを名前に置き換えるための対応表
    const patientNameById = {};
    getPatients().forEach(p => {
        if (p.id) patientNameById[normalizeNotionId(p.id)] = p.name;
    });

    const plans = result.data
        .map(item => toVisitPlan(item, patientNameById))
        .filter(Boolean)
        .sort((a, b) => a.time.localeCompare(b.time));

    saveVisitPlans(plans);
    return plans;
}

// === 担当者マスタ ===

async function fetchStaffFromGas() {
    const result = await callApiWithRetry(() =>
        callGasApi('getStaff')
    );

    if (result.success && result.data) {
        saveStaff(result.data);
        return result.data;
    }

    throw new Error('担当者データの取得に失敗しました');
}

// === Notion API（GAS経由） ===

async function fetchPatientsFromNotion() {
    const apiKey = getNotionApiKey();
    const dbId = getNotionPatientDb();

    // APIキーはサーバー側（スクリプトプロパティ NOTION_API_KEY）にあれば空でよい。
    if (!dbId) {
        throw new Error('Notion APIの設定が不完全です');
    }

    const result = await callApiWithRetry(() =>
        callGasApi('proxyNotionPatients', { apiKey, dbId })
    );

    if (result.success && result.data) {
        const patients = result.data.map(item => {
            // 1. 名前の取得（文字色変更などで複数のテキストブロックに分かれている場合を考慮して結合）
            const titleArr = item.properties?.患者名?.title || [];
            let name = titleArr.map(t => t.plain_text).join('') || '名前なし';

            // "患者名" プロパティがない場合のフォールバック
            if (name === '名前なし') {
                for (const key in item.properties) {
                    if (item.properties[key].type === 'title') {
                        const tArr = item.properties[key].title || [];
                        if (tArr.length > 0) {
                            name = tArr.map(t => t.plain_text).join('');
                            break;
                        }
                    }
                }
            }

            // 2. 読み仮名（フリガナ等）の取得（Notionにフリガナ列があればそちらを優先してソートする）
            let reading = name; // デフォルトは名前をそのまま使う
            const readingKeys = ['フリガナ', 'ふりがな', 'カナ', 'かな', '読み', 'よみ', 'furigana', 'kana'];

            for (const key of readingKeys) {
                if (item.properties?.[key]?.rich_text) {
                    const rubyArr = item.properties[key].rich_text;
                    if (rubyArr.length > 0) {
                        reading = rubyArr.map(t => t.plain_text).join('');
                        break;
                    }
                }
            }

            // 3. 施術録のチェック既定値（マルチセレクト）
            //    ここに持たせておくことで、施術録画面は通信なしで初期表示できる
            const baseParts = multiSelectNames(item.properties?.['基本施術部位']);
            const baseTreatments = multiSelectNames(item.properties?.['基本施術内容']);

            return {
                id: item.id,
                name: name,
                reading: reading,
                baseParts: baseParts,
                baseTreatments: baseTreatments
            };
        });

        // 読み仮名で「あいうえお順」にソート
        const sortedPatients = sortJapanese(patients, 'reading');
        savePatients(sortedPatients);
        return sortedPatients;
    }

    throw new Error('患者データの取得に失敗しました');
}

// === 宛名ラベル（医師一覧DB / 担当者DB / 営業先事業所DB / 患者DB） ===

// 院で固定のデータベース。設定画面には出さない。
// 患者DBだけは設定画面で入れたものを優先する（既存の患者取得と同じDBのため）。
const LABEL_DOCTOR_DB_ID = 'f02e086e-831e-4fdf-9772-2fa7a8c77ed1';
const LABEL_CARE_MANAGER_DB_ID = '2f30b49b-5f34-802a-880f-000b21f593a5';
const LABEL_OFFICE_DB_ID = 'c3d24b81-0c47-4772-b698-59b6564bded5';
const LABEL_PATIENT_DB_ID = '2f30b49b-5f34-80c5-9d1c-000b583ba076';

/**
 * Notionのプロパティ1つを文字列にする（title / rich_text / select / 電話番号）
 */
function propText(prop) {
    if (!prop) return '';
    if (prop.title) return plainText(prop.title);
    if (prop.rich_text) return plainText(prop.rich_text);
    if (prop.select) return prop.select.name || '';
    if (prop.phone_number) return String(prop.phone_number);
    return '';
}

/**
 * データベースの中身をそのまま取ってくる（既存の proxyNotionPatients を使い回す）
 */
async function fetchNotionRows(dbId) {
    const apiKey = getNotionApiKey();

    // APIキーはサーバー側（スクリプトプロパティ NOTION_API_KEY）にあれば空でよい。
    if (!dbId) {
        throw new Error('データベースIDが指定されていません');
    }

    const result = await callApiWithRetry(() =>
        callGasApi('proxyNotionPatients', { apiKey, dbId })
    );

    if (!result.success || !result.data) {
        throw new Error('Notionからの取得に失敗しました');
    }

    return result.data;
}

/**
 * 医師1件を宛名1件に変換する。宛名の敬称は院の慣習で「先生 御侍史」。
 */
function toDoctorLabel(item) {
    const props = item.properties || {};
    const name = propText(props['医師名']);
    if (!name) return null;

    const reading = propText(props['フリガナ']) || name;

    return {
        id: item.id,
        kind: 'doctor',
        name: name,
        reading: reading,
        org: propText(props['医療機関名']),
        address: propText(props['住所']),
        suffix: ' 先生 御侍史',
        checked: false
    };
}

/**
 * 営業先事業所DBから「ページID → 事業所名・住所」の対応表を作る。
 * ケアマネの住所は担当者DBに無く、この事業所側にあるため突き合わせに使う。
 */
function toOfficeMap(items) {
    const map = {};
    items.forEach(item => {
        const props = item.properties || {};
        map[normalizeNotionId(item.id)] = {
            name: propText(props['事業所名']),
            address: propText(props['住所'])
        };
    });
    return map;
}

/**
 * ケアマネ1件を宛名1件に変換する。
 * 「在籍」以外（退職など）は宛先にしないので null を返す。
 */
function toCareManagerLabel(item, officeMap) {
    const props = item.properties || {};
    const name = propText(props['名前']);
    if (!name) return null;

    // 在籍状況が空の行もあるため、はっきり「在籍」以外と分かる場合だけ落とす
    const status = propText(props['在籍状況']);
    if (status && status !== '在籍') return null;

    const relations = (props['所属事業所'] && props['所属事業所'].relation) || [];
    const office = relations
        .map(r => officeMap[normalizeNotionId(r.id)])
        .filter(Boolean)[0] || { name: '', address: '' };

    const isDistribution = !!(props['報告書の配布先'] && props['報告書の配布先'].checkbox);

    return {
        id: item.id,
        kind: 'careManager',
        name: name,
        reading: name,
        org: office.name,
        address: office.address,
        suffix: ' 様',
        // 報告書の配布先だけを既定で選択状態にする（住所が無い人は画面側で外す）
        checked: isDistribution
    };
}

/**
 * 患者1件を宛名1件に変換する
 */
function toPatientLabel(item) {
    const props = item.properties || {};
    const name = propText(props['患者名']);
    if (!name) return null;

    return {
        id: item.id,
        kind: 'patient',
        name: name,
        reading: propText(props['フリガナ']) || name,
        org: '',
        address: propText(props['住所']),
        suffix: ' 様',
        checked: false
    };
}

/**
 * 宛名ラベルの宛先を3種類まとめて取得する。
 * 医師・患者は住所のある人だけ、ケアマネは住所が無い人も
 * 「住所未登録」として出す（誰が抜けているか気付けるようにするため）。
 */
async function fetchLabelTargetsFromNotion() {
    const patientDbId = getNotionPatientDb() || LABEL_PATIENT_DB_ID;

    const [doctorRows, careRows, officeRows, patientRows] = await Promise.all([
        fetchNotionRows(LABEL_DOCTOR_DB_ID),
        fetchNotionRows(LABEL_CARE_MANAGER_DB_ID),
        fetchNotionRows(LABEL_OFFICE_DB_ID),
        fetchNotionRows(patientDbId)
    ]);

    const officeMap = toOfficeMap(officeRows);

    const doctors = doctorRows
        .map(toDoctorLabel)
        .filter(target => target && target.address);

    const careManagers = careRows
        .map(item => toCareManagerLabel(item, officeMap))
        .filter(Boolean);

    const patients = patientRows
        .map(toPatientLabel)
        .filter(target => target && target.address);

    const targets = {
        doctor: sortJapanese(doctors, 'reading'),
        careManager: sortJapanese(careManagers, 'reading'),
        patient: sortJapanese(patients, 'reading')
    };

    saveLabelTargets(targets);
    return targets;
}

// === 接続テスト ===

async function testGasConnection(apiUrl) {
    try {
        const result = await callGasApi('ping', {}, apiUrl);
        return result;
    } catch (error) {
        console.error('GAS connection test failed:', error);
        return { success: false, error: error.message };
    }
}

async function testNotionConnection() {
    try {
        await fetchPatientsFromNotion();
        return true;
    } catch (error) {
        console.error('Notion connection test failed:', error);
        return false;
    }
}

// === オフライン同期 ===

let isSyncingQueue = false;
const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2分ごとに未送信データを再試行

/**
 * UIのバッジ更新（ui.js側にあれば呼ぶ。無くてもエラーにしない）
 */
function refreshSyncBadgeSafe() {
    if (typeof updateSyncBadge === 'function') {
        updateSyncBadge();
    }
}

/**
 * Background Sync APIへの登録（対応ブラウザのみ。アプリを閉じていても
 * OSが機会を見て同期してくれる可能性がある保険。iOS Safariは非対応のため
 * 主な同期経路にはしない）
 */
function requestBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(reg => reg.sync.register('sync-records'))
            .catch(err => console.warn('Background sync registration failed:', err));
    }
}

/**
 * オフラインキューの同期を実行
 * 同時実行防止のため、既に実行中なら何もしない
 */
async function syncOfflineQueue() {
    if (isSyncingQueue) {
        return { success: true, synced: 0, skipped: true };
    }

    const queue = getOfflineQueue();

    if (queue.length === 0) {
        refreshSyncBadgeSafe();
        return { success: true, synced: 0 };
    }

    isSyncingQueue = true;
    let syncedCount = 0;
    const failedItems = [];

    for (const item of queue) {
        try {
            if (item.type === 'treatment') {
                await callApiWithRetry(() => callGasApi('saveTreatment', item.data), 2);
            } else if (item.type === 'sales') {
                await callApiWithRetry(() => callGasApi('saveSales', item.data), 2);
            } else if (item.type === 'operation') {
                await callApiWithRetry(() => callGasApi('saveOperation', item.data), 2);
            }

            removeFromOfflineQueue(item.id);
            syncedCount++;
        } catch (error) {
            console.error('Failed to sync item:', item, error);
            failedItems.push(item);
        }
    }

    isSyncingQueue = false;
    refreshSyncBadgeSafe();

    return {
        success: failedItems.length === 0,
        synced: syncedCount,
        failed: failedItems.length
    };
}

/**
 * オンラインなら未送信データの再送を試みる。
 * 以下のタイミングで呼ばれる（どれか1つに依存しないための多重化）:
 *  - アプリ起動時
 *  - 定期的（AUTO_SYNC_INTERVAL_MSごと）
 *  - オフライン→オンライン復帰時
 *  - アプリがバックグラウンドから復帰した時（visibilitychange）
 */
async function trySyncIfOnline() {
    if (!navigator.onLine) return;
    if (getOfflineQueueCount() === 0) return;

    try {
        const result = await syncOfflineQueue();
        if (result.synced > 0) {
            showToast(`${result.synced}件の未送信データを同期しました`);
        }
    } catch (error) {
        console.error('Auto sync failed:', error);
    }
}

/**
 * 自動同期の仕組みを起動する（app.js の初期化から1回だけ呼ぶ）
 */
function startAutoSync() {
    trySyncIfOnline();

    setInterval(trySyncIfOnline, AUTO_SYNC_INTERVAL_MS);

    window.addEventListener('online', trySyncIfOnline);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            trySyncIfOnline();
        }
    });

    if (getOfflineQueueCount() > 0) {
        requestBackgroundSync();
    }
}
