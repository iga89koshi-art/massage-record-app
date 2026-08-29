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

    // 未送信データの件数を表示に反映
    updateSyncBadge();

    // 未送信データの自動同期を開始（起動時・定期・復帰時に再試行）
    startAutoSync();

    // 初回起動時のデータ取得
    await loadInitialData();

    // ホーム画面を表示
    showScreen('home');

    // 共有リンクから開かれた場合は設定の読み込み画面へ
    handleSharedConfigLink();

    // アプリを開いたまま共有リンクを踏んだ場合は再読み込みが起きないので拾う
    window.addEventListener('hashchange', handleSharedConfigLink);

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
        } else {
            // キャッシュがあっても種別追加などマスタの更新は反映したいので、
            // 表示は既存キャッシュのまま裏で取り直す（起動を待たせない）
            fetchStaffFromGas().catch(e => console.warn('Staff background refresh failed:', e));
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
        trySyncIfOnline();
    }
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', initApp);
