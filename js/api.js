// API通信

/**
 * GAS APIにリクエスト送信
 */
async function callGasApi(action, data = {}) {
    const gasUrl = getGasApiUrl();

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

// === 先週の記録コピー ===

async function getLastWeekTreatmentPatients(staff, baseDate) {
    return await callApiWithRetry(() =>
        callGasApi('getLastWeekTreatments', { staff, baseDate })
    );
}

async function getLastWeekSalesContacts(staff, baseDate) {
    return await callApiWithRetry(() =>
        callGasApi('getLastWeekSales', { staff, baseDate })
    );
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
        // 患者名のみ抽出してソート
        const patients = result.data.map(item => ({
            id: item.id,
            name: item.properties?.患者名?.title?.[0]?.plain_text || '名前なし'
        }));

        const sortedPatients = sortJapanese(patients, 'name');
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

async function syncOfflineQueue() {
    const queue = getOfflineQueue();

    if (queue.length === 0) {
        return { success: true, synced: 0 };
    }

    let syncedCount = 0;
    const failedItems = [];

    for (const item of queue) {
        try {
            if (item.type === 'treatment') {
                await callGasApi('saveTreatment', item.data);
            } else if (item.type === 'sales') {
                await callGasApi('saveSales', item.data);
            }

            removeFromOfflineQueue(item.id);
            syncedCount++;
        } catch (error) {
            console.error('Failed to sync item:', item, error);
            failedItems.push(item);
        }
    }

    return {
        success: failedItems.length === 0,
        synced: syncedCount,
        failed: failedItems.length
    };
}

// オンライン復帰時の自動同期
window.addEventListener('online', async () => {
    console.log('Online - syncing queue...');
    try {
        const result = await syncOfflineQueue();
        if (result.synced > 0) {
            showToast(`${result.synced}件のデータを同期しました`);
        }
    } catch (error) {
        console.error('Auto sync failed:', error);
    }
});
