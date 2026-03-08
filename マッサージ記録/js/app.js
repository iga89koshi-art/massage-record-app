// メインアプリケーション

/**
 * アプリ初期化
 */
async function initApp() {
    console.log('Initializing app...');

    // Service Worker登録
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./service-worker.js');
            console.log('Service Worker registered');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    // UI初期化
    initUI();

    // 初回起動時のデータ取得
    await loadInitialData();

    // ホーム画面を表示
    showScreen('home');

    // Service Workerからのメッセージを受信
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    console.log('App initialized');
}

/**
 * 初回データ取得
 */
async function loadInitialData() {
    try {
        // 担当者マスタを取得
        const staff = getStaff();
        if (staff.length === 0) {
            console.log('Fetching staff data from GAS...');
            await fetchStaffFromGas();
        }

        // 患者データを取得（キャッシュがない場合）
        const patients = getPatients();
        if (patients.length === 0) {
            console.log('No patient cache found');
            // Notion APIの設定があれば取得を試みる
            if (getNotionApiKey() && getNotionPatientDb()) {
                console.log('Fetching patients from Notion...');
                await fetchPatientsFromNotion();
            }
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
        // エラーがあっても続行（設定画面で再取得可能）
    }
}

/**
 * Service Workerからのメッセージ処理
 */
function handleServiceWorkerMessage(event) {
    if (event.data && event.data.type === 'SYNC_QUEUE') {
        syncOfflineQueue().catch(error => {
            console.error('Sync queue failed:', error);
        });
    }
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', initApp);
