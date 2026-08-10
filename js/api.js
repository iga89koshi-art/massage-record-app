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
        data: data
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

    if (!apiKey || !dbId) {
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

            return {
                id: item.id,
                name: name,
                reading: reading
            };
        });

        // 読み仮名で「あいうえお順」にソート
        const sortedPatients = sortJapanese(patients, 'reading');
        savePatients(sortedPatients);
        return sortedPatients;
    }

    throw new Error('患者データの取得に失敗しました');
}

// === 接続テスト ===

async function testGasConnection() {
    try {
        const result = await callGasApi('ping');
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
