// UI制御・画面遷移

let currentScreen = 'home';
let passwordAttempts = 0;
let passwordLockUntil = null;

/**
 * 画面遷移
 */
function showScreen(screenId) {
    // 全画面を非表示
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // 指定画面を表示
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        currentScreen = screenId;

        // 画面ごとの初期化処理
        initScreen(screenId);
    }
}

/**
 * 画面初期化
 */
function initScreen(screenId) {
    switch (screenId) {
        case 'home':
            // ホーム画面は特に初期化不要
            break;
        case 'treatment':
            initTreatmentScreen();
            break;
        case 'sales':
            initSalesScreen();
            break;
        case 'view':
            initViewScreen();
            break;
        case 'settings':
            initSettingsScreen();
            break;
    }
}

// === ホーム画面 ===

function setupHomeScreen() {
    document.getElementById('btn-treatment').addEventListener('click', () => {
        showScreen('treatment');
    });

    document.getElementById('btn-sales').addEventListener('click', () => {
        checkPasswordAndShowSales();
    });

    document.getElementById('btn-view').addEventListener('click', () => {
        showScreen('view');
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        showScreen('settings');
    });
}

// === 施術記録入力画面 ===

function initTreatmentScreen() {
    // 日付をデフォルト設定
    document.getElementById('treatment-date').value = getToday();

    // 患者プルダウンを設定
    populatePatientSelect();

    // 担当者プルダウンを設定
    populateTreatmentStaffSelect();
}

function populatePatientSelect() {
    const select = document.getElementById('treatment-patient');
    const patients = getPatients();

    select.innerHTML = '<option value="">選択してください</option>';

    patients.forEach(patient => {
        const option = document.createElement('option');
        option.value = patient.name;
        option.textContent = patient.name;
        select.appendChild(option);
    });
}

function populateTreatmentStaffSelect() {
    const select = document.getElementById('treatment-staff');
    const staff = getTreatmentStaff();

    select.innerHTML = '<option value="">選択してください</option>';

    staff.forEach(s => {
        const option = document.createElement('option');
        option.value = s.name;
        option.textContent = s.name;
        select.appendChild(option);
    });
}

async function saveTreatment() {
    const date = document.getElementById('treatment-date').value;
    const patient = document.getElementById('treatment-patient').value;
    const staff = document.getElementById('treatment-staff').value;
    const memo = document.getElementById('treatment-memo').value;

    if (!date || !patient || !staff) {
        showError('日付、患者、担当者は必須です');
        return;
    }

    const record = {
        date,
        patientId: '',
        patientName: patient,
        staff,
        memo,
        timestamp: getTimestamp(),
        notionSynced: ''
    };

    try {
        // 保存処理実行
        const result = await saveTreatmentRecord(record);

        if (result.offline) {
            showToast('電波がありません。一時保存しました（後で自動送信されます）', 3000);
        } else {
            showToast('保存しました', 2000);
        }

        // フォームクリア
        document.getElementById('treatment-patient').value = '';
        document.getElementById('treatment-staff').value = '';
        document.getElementById('treatment-memo').value = '';
        document.getElementById('treatment-date').value = getToday();
    } catch (error) {
        console.error('Save failed:', error);
        showError('保存に失敗しました');
    }
}

function setupTreatmentScreen() {
    document.getElementById('btn-save-treatment').addEventListener('click', saveTreatment);
    document.getElementById('btn-back-treatment').addEventListener('click', () => {
        showScreen('home');
    });
}

// === 営業記録入力画面 ===

function checkPasswordAndShowSales() {
    // パスワードロックチェック
    if (passwordLockUntil && new Date() < passwordLockUntil) {
        const remainingSeconds = Math.ceil((passwordLockUntil - new Date()) / 1000);
        showError(`${remainingSeconds}秒後に再試行してください`);
        return;
    }

    const input = prompt('パスワードを入力してください:');

    if (input === null) {
        return; // キャンセル
    }

    if (verifyPassword(input)) {
        passwordAttempts = 0;
        showScreen('sales');
    } else {
        passwordAttempts++;

        if (passwordAttempts >= 3) {
            passwordLockUntil = new Date(Date.now() + 30000); // 30秒ロック
            showError('3回失敗しました。30秒後に再試行してください');
            passwordAttempts = 0;
        } else {
            showError('パスワードが違います');
        }
    }
}

function initSalesScreen() {
    document.getElementById('sales-date').value = getToday();
    populateSalesStaffSelect();
}

function populateSalesStaffSelect() {
    const select = document.getElementById('sales-staff');
    const staff = getSalesStaff();

    select.innerHTML = '<option value="">選択してください</option>';

    staff.forEach(s => {
        const option = document.createElement('option');
        option.value = s.name;
        option.textContent = s.name;
        select.appendChild(option);
    });
}

async function saveSales() {
    const date = document.getElementById('sales-date').value;
    const careManager = document.getElementById('sales-care-manager').value;
    const staff = document.getElementById('sales-staff').value;
    const content = document.getElementById('sales-content').value;

    if (!date || !careManager || !staff) {
        showError('日付、ケアマネ名、営業担当は必須です');
        return;
    }

    const record = {
        date,
        careManagerId: '',
        officeName: '',
        careManagerName: careManager,
        staff,
        content,
        timestamp: getTimestamp(),
        notionSynced: ''
    };

    try {
        const result = await saveSalesRecord(record);

        if (result.offline) {
            showToast('電波がありません。一時保存しました（後で自動送信されます）', 3000);
        } else {
            showToast('保存しました', 2000);
        }

        // フォームクリア
        document.getElementById('sales-care-manager').value = '';
        document.getElementById('sales-staff').value = '';
        document.getElementById('sales-content').value = '';
        document.getElementById('sales-date').value = getToday();
    } catch (error) {
        console.error('Save failed:', error);
        showError('保存に失敗しました');
    }
}

function setupSalesScreen() {
    document.getElementById('btn-save-sales').addEventListener('click', saveSales);
    document.getElementById('btn-back-sales').addEventListener('click', () => {
        showScreen('home');
    });
}

// === 記録閲覧画面 ===

let currentViewTab = 'treatment';

function initViewScreen() {
    showViewTab('treatment');
}

function showViewTab(tab) {
    currentViewTab = tab;

    // タブボタンの切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${tab}`).classList.add('active');

    // タブコンテンツの切り替え
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    // 営業記録タブはパスワード確認
    if (tab === 'sales') {
        checkPasswordForSalesView();
    }
}

function checkPasswordForSalesView() {
    const input = prompt('パスワードを入力してください:');

    if (input === null || !verifyPassword(input)) {
        showError('パスワードが違います');
        showViewTab('treatment');
        return;
    }
}

async function loadTreatmentRecords() {
    const patient = document.getElementById('filter-treatment-patient').value;
    const period = document.getElementById('filter-treatment-period').value;

    const dateRange = getDateRange(period);

    const filters = {
        patient: patient === 'all' ? '' : patient,
        startDate: dateRange.start,
        endDate: dateRange.end
    };

    try {
        showLoading('読み込み中...');
        const result = await getTreatmentRecords(filters);
        hideLoading();

        if (result.success && result.data) {
            displayTreatmentRecords(result.data);
        } else {
            showError('データの取得に失敗しました');
        }
    } catch (error) {
        hideLoading();
        showError('データの取得に失敗しました');
    }
}

function displayTreatmentRecords(records) {
    const tbody = document.getElementById('treatment-records-body');
    tbody.innerHTML = '';

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">データがありません</td></tr>';
        return;
    }

    // 日付降順でソート
    records.sort((a, b) => b.date.localeCompare(a.date));

    records.forEach(record => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = record.date;
        row.insertCell(1).textContent = record.patientName;
        row.insertCell(2).textContent = record.staff;
        row.insertCell(3).textContent = record.memo || '';
    });
}

async function loadSalesRecords() {
    const period = document.getElementById('filter-sales-period').value;
    const dateRange = getDateRange(period);

    const filters = {
        startDate: dateRange.start,
        endDate: dateRange.end
    };

    try {
        showLoading('読み込み中...');
        const result = await getSalesRecords(filters);
        hideLoading();

        if (result.success && result.data) {
            displaySalesRecords(result.data);
        } else {
            showError('データの取得に失敗しました');
        }
    } catch (error) {
        hideLoading();
        showError('データの取得に失敗しました');
    }
}

function displaySalesRecords(records) {
    const tbody = document.getElementById('sales-records-body');
    tbody.innerHTML = '';

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">データがありません</td></tr>';
        return;
    }

    records.sort((a, b) => b.date.localeCompare(a.date));

    records.forEach(record => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = record.date;
        row.insertCell(1).textContent = record.careManagerName;
        row.insertCell(2).textContent = record.staff;
        row.insertCell(3).textContent = record.content || '';
    });
}

function setupViewScreen() {
    document.getElementById('tab-treatment').addEventListener('click', () => showViewTab('treatment'));
    document.getElementById('tab-sales').addEventListener('click', () => showViewTab('sales'));

    document.getElementById('btn-load-treatment').addEventListener('click', loadTreatmentRecords);
    document.getElementById('btn-load-sales').addEventListener('click', loadSalesRecords);

    document.getElementById('btn-back-view').addEventListener('click', () => {
        showScreen('home');
    });

    // 患者フィルター設定
    const filterSelect = document.getElementById('filter-treatment-patient');
    const patients = getPatients();
    filterSelect.innerHTML = '<option value="all">全て</option>';
    patients.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        filterSelect.appendChild(option);
    });
}

// === 設定画面 ===

function initSettingsScreen() {
    // 現在の設定値を読み込み
    document.getElementById('setting-notion-api-key').value = getNotionApiKey();
    document.getElementById('setting-notion-patient-db').value = getNotionPatientDb();
    document.getElementById('setting-notion-care-manager-db').value = getNotionCareManagerDb();
    document.getElementById('setting-gas-spreadsheet-url').value = getGasSpreadsheetUrl();
    document.getElementById('setting-gas-api-url').value = getGasApiUrl();
}

function saveSettings() {
    const notionApiKey = document.getElementById('setting-notion-api-key').value;
    const notionPatientDb = document.getElementById('setting-notion-patient-db').value;
    const notionCareManagerDb = document.getElementById('setting-notion-care-manager-db').value;
    const gasSpreadsheetUrl = document.getElementById('setting-gas-spreadsheet-url').value;
    const gasApiUrl = document.getElementById('setting-gas-api-url').value;

    saveNotionApiKey(notionApiKey);
    saveNotionPatientDb(notionPatientDb);
    saveNotionCareManagerDb(notionCareManagerDb);
    saveGasSpreadsheetUrl(gasSpreadsheetUrl);
    saveGasApiUrl(gasApiUrl);

    showToast('設定を保存しました');
}

function changePassword() {
    const newPassword = prompt('新しいパスワードを入力してください:');

    if (newPassword === null || newPassword === '') {
        return;
    }

    savePassword(newPassword);
    showToast('パスワードを変更しました');
}

async function testGas() {
    try {
        showLoading('接続テスト中...');
        const result = await testGasConnection();
        hideLoading();

        if (result && result.success) {
            showToast('接続成功しました');
        } else {
            const msg = result && result.error ? result.error : '不明なエラー';
            const time = new Date().toLocaleTimeString();
            showError(`[${time}] 失敗: ${msg}`);
        }
    } catch (error) {
        hideLoading();
        const time = new Date().toLocaleTimeString();
        showError(`[${time}] エラー: ${error.message}`);
    }
}

async function testNotion() {
    try {
        showLoading('接続テスト中...');
        const success = await testNotionConnection();
        hideLoading();

        if (success) {
            showToast('接続成功しました');
        } else {
            showError('接続に失敗しました');
        }
    } catch (error) {
        hideLoading();
        showError('接続に失敗しました');
    }
}

async function reloadPatients() {
    try {
        showLoading('患者リスト取得中...');
        await fetchPatientsFromNotion();
        hideLoading();
        showToast('患者リストを更新しました');
    } catch (error) {
        hideLoading();
        showError('患者リストの取得に失敗しました');
    }
}

function clearCacheData() {
    if (confirm('キャッシュをクリアしますか?')) {
        clearCache();
    }
}

function resetAllData() {
    if (confirm('全データをリセットしますか?\nこの操作は取り消せません。')) {
        clearAllStorage();
        showToast('全データをリセットしました');
        setTimeout(() => {
            location.reload();
        }, 1000);
    }
}

function setupSettingsScreen() {
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-change-password').addEventListener('click', changePassword);
    document.getElementById('btn-test-gas').addEventListener('click', testGas);
    document.getElementById('btn-test-notion').addEventListener('click', testNotion);
    document.getElementById('btn-reload-patients').addEventListener('click', reloadPatients);
    document.getElementById('btn-clear-cache').addEventListener('click', clearCacheData);
    document.getElementById('btn-reset-all').addEventListener('click', resetAllData);
    document.getElementById('btn-back-settings').addEventListener('click', () => {
        showScreen('home');
    });
}

// === 初期化 ===

function initUI() {
    setupHomeScreen();
    setupTreatmentScreen();
    setupSalesScreen();
    setupViewScreen();
    setupSettingsScreen();
}
