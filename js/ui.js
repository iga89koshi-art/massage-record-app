// UI制御・画面遷移

let currentScreen = 'home';
let passwordAttempts = 0;
let passwordLockUntil = null;

// 一括入力用のエントリーカウンター
let treatmentEntryCounter = 0;
let salesEntryCounter = 0;

/**
 * 画面遷移
 */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        currentScreen = screenId;
        initScreen(screenId);
    }
}

/**
 * 画面初期化
 */
function initScreen(screenId) {
    switch (screenId) {
        case 'home':
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

// =============================================
// 施術記録入力画面（一括入力）
// =============================================

function initTreatmentScreen() {
    // 日付をデフォルト設定
    document.getElementById('treatment-date').value = getToday();

    // 担当者プルダウンを設定
    populateTreatmentStaffSelect();

    // 一時保存データの復元を試みる
    const draft = getTreatmentDraft();
    if (draft) {
        if (draft.date) document.getElementById('treatment-date').value = draft.date;
        if (draft.staff) document.getElementById('treatment-staff').value = draft.staff;
        if (draft.entries && draft.entries.length > 0) {
            draft.entries.forEach(entry => {
                addTreatmentEntry(entry.patient, entry.memo);
            });
        }
    }

    // エントリーがなければ1つ追加
    if (document.querySelectorAll('#treatment-batch-list .batch-entry').length === 0) {
        addTreatmentEntry();
    }
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

/**
 * 患者選択プルダウンのHTMLを生成
 */
function createPatientSelectHtml(selectedValue) {
    const patients = getPatients();
    let html = '<option value="">選択してください</option>';
    patients.forEach(patient => {
        const selected = patient.name === selectedValue ? ' selected' : '';
        html += `<option value="${patient.name}"${selected}>${patient.name}</option>`;
    });
    return html;
}

/**
 * 施術記録エントリーを追加
 */
function addTreatmentEntry(patient, memo) {
    treatmentEntryCounter++;
    const list = document.getElementById('treatment-batch-list');
    const entryId = `treatment-entry-${treatmentEntryCounter}`;

    const entry = document.createElement('div');
    entry.className = 'batch-entry';
    entry.id = entryId;
    entry.innerHTML = `
        <div class="batch-entry-header">
            <span class="batch-entry-number">${list.children.length + 1}</span>
            <button type="button" class="btn-remove-entry" onclick="removeTreatmentEntry('${entryId}')">✕</button>
        </div>
        <div class="form-group">
            <label>患者 <span class="required">*</span></label>
            <select class="form-control entry-patient" onchange="autoSaveTreatmentDraft()">
                ${createPatientSelectHtml(patient || '')}
            </select>
        </div>
        <div class="form-group">
            <label>メモ</label>
            <textarea class="form-control entry-memo" rows="2" placeholder="メモを入力..." oninput="autoSaveTreatmentDraft()">${memo || ''}</textarea>
        </div>
    `;

    list.appendChild(entry);
    autoSaveTreatmentDraft();
}

/**
 * 施術記録エントリーを削除
 */
function removeTreatmentEntry(entryId) {
    const entry = document.getElementById(entryId);
    if (entry) {
        entry.remove();
        renumberEntries('treatment-batch-list');
        autoSaveTreatmentDraft();
    }
}

/**
 * 施術記録を一括保存
 */
async function saveBatchTreatment() {
    const date = document.getElementById('treatment-date').value;
    const staff = document.getElementById('treatment-staff').value;

    if (!date || !staff) {
        showError('日付と担当者を選択してください');
        return;
    }

    const entries = document.querySelectorAll('#treatment-batch-list .batch-entry');
    if (entries.length === 0) {
        showError('記録を追加してください');
        return;
    }

    // バリデーション
    const records = [];
    let hasError = false;
    entries.forEach((entry, index) => {
        const patient = entry.querySelector('.entry-patient').value;
        const memo = entry.querySelector('.entry-memo').value;

        if (!patient) {
            showError(`記録${index + 1}: 患者を選択してください`);
            hasError = true;
            return;
        }

        records.push({
            date,
            patientId: '',
            patientName: patient,
            staff,
            memo,
            timestamp: getTimestamp(),
            notionSynced: ''
        });
    });

    if (hasError) return;

    try {
        showLoading(`${records.length}件を保存中...`);

        // 全件を並列送信（高速化）
        const results = await Promise.all(
            records.map(record => saveTreatmentRecord(record))
        );

        let offlineCount = 0;
        let successCount = 0;
        results.forEach(result => {
            if (result.offline) {
                offlineCount++;
            } else {
                successCount++;
            }
        });

        hideLoading();

        if (offlineCount > 0) {
            showToast(`${offlineCount}件を一時保存しました（後で自動送信）`, 3000);
        } else {
            showToast(`${successCount}件を保存しました`, 2000);
        }

        // リストをクリア（日付・担当者は維持）
        document.getElementById('treatment-batch-list').innerHTML = '';
        treatmentEntryCounter = 0;
        addTreatmentEntry();

        // 一時保存をクリア
        clearTreatmentDraft();

    } catch (error) {
        hideLoading();
        console.error('Batch save failed:', error);
        showError('保存に失敗しました');
    }
}

/**
 * 施術記録をクリア
 */
function clearTreatmentBatch() {
    if (window.confirm('入力中のデータを削除しますか？')) {
        document.getElementById('treatment-batch-list').innerHTML = '';
        treatmentEntryCounter = 0;
        addTreatmentEntry();
        clearTreatmentDraft();
    }
}

/**
 * 施術記録の一時保存（自動）
 */
function autoSaveTreatmentDraft() {
    const date = document.getElementById('treatment-date').value;
    const staff = document.getElementById('treatment-staff').value;

    const entries = [];
    document.querySelectorAll('#treatment-batch-list .batch-entry').forEach(entry => {
        entries.push({
            patient: entry.querySelector('.entry-patient').value,
            memo: entry.querySelector('.entry-memo').value
        });
    });

    saveTreatmentDraft({ date, staff, entries });
}

/**
 * 先週の施術記録をコピー
 */
async function copyLastWeekTreatment() {
    const staff = document.getElementById('treatment-staff').value;
    const baseDate = document.getElementById('treatment-date').value;

    if (!staff) {
        showError('担当者を選択してください');
        return;
    }

    try {
        showLoading('先週の記録を取得中...');
        const result = await getLastWeekTreatmentPatients(staff, baseDate);
        hideLoading();

        if (!result.success) {
            showError('取得に失敗しました');
            return;
        }

        if (!result.data || result.data.length === 0) {
            showToast('該当する記録がありません', 3000);
            return;
        }

        // 既存エントリーが空の1件だけなら削除
        const existingEntries = document.querySelectorAll('#treatment-batch-list .batch-entry');
        if (existingEntries.length === 1) {
            const firstPatient = existingEntries[0].querySelector('.entry-patient').value;
            if (!firstPatient) {
                existingEntries[0].remove();
            }
        }

        result.data.forEach(item => {
            addTreatmentEntry(item.name, item.memo);
        });

        showToast(`${result.data.length}件の記録を追加しました`, 2000);
    } catch (error) {
        hideLoading();
        console.error('Copy last week failed:', error);
        showError('取得に失敗しました');
    }
}

function setupTreatmentScreen() {
    document.getElementById('btn-add-treatment-entry').addEventListener('click', () => addTreatmentEntry());
    document.getElementById('btn-save-batch-treatment').addEventListener('click', saveBatchTreatment);
    document.getElementById('btn-clear-treatment').addEventListener('click', clearTreatmentBatch);
    document.getElementById('btn-copy-last-week-treatment').addEventListener('click', copyLastWeekTreatment);
    document.getElementById('btn-back-treatment').addEventListener('click', () => {
        showScreen('home');
    });

    // 共通項目変更時に自動保存
    document.getElementById('treatment-date').addEventListener('change', autoSaveTreatmentDraft);
    document.getElementById('treatment-staff').addEventListener('change', autoSaveTreatmentDraft);
}

// =============================================
// 営業記録入力画面（一括入力）
// =============================================

function checkPasswordAndShowSales() {
    if (passwordLockUntil && new Date() < passwordLockUntil) {
        const remainingSeconds = Math.ceil((passwordLockUntil - new Date()) / 1000);
        showError(`${remainingSeconds}秒後に再試行してください`);
        return;
    }

    const input = prompt('パスワードを入力してください:');

    if (input === null) {
        return;
    }

    if (verifyPassword(input)) {
        passwordAttempts = 0;
        showScreen('sales');
    } else {
        passwordAttempts++;

        if (passwordAttempts >= 3) {
            passwordLockUntil = new Date(Date.now() + 30000);
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

    // 一時保存データの復元
    const draft = getSalesDraft();
    if (draft) {
        if (draft.date) document.getElementById('sales-date').value = draft.date;
        if (draft.staff) document.getElementById('sales-staff').value = draft.staff;
        if (draft.entries && draft.entries.length > 0) {
            draft.entries.forEach(entry => {
                addSalesEntry(entry.careManager, entry.content);
            });
        }
    }

    // エントリーがなければ1つ追加
    if (document.querySelectorAll('#sales-batch-list .batch-entry').length === 0) {
        addSalesEntry();
    }
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

/**
 * 営業記録エントリーを追加
 */
function addSalesEntry(careManager, content) {
    salesEntryCounter++;
    const list = document.getElementById('sales-batch-list');
    const entryId = `sales-entry-${salesEntryCounter}`;

    const entry = document.createElement('div');
    entry.className = 'batch-entry';
    entry.id = entryId;
    entry.innerHTML = `
        <div class="batch-entry-header">
            <span class="batch-entry-number">${list.children.length + 1}</span>
            <button type="button" class="btn-remove-entry" onclick="removeSalesEntry('${entryId}')">✕</button>
        </div>
        <div class="form-group">
            <label>ケアマネ名 <span class="required">*</span></label>
            <input type="text" class="form-control entry-care-manager" placeholder="ケアマネ名を入力" value="${careManager || ''}" oninput="autoSaveSalesDraft()">
        </div>
        <div class="form-group">
            <label>内容</label>
            <textarea class="form-control entry-content" rows="3" placeholder="営業内容を入力..." oninput="autoSaveSalesDraft()">${content || ''}</textarea>
        </div>
    `;

    list.appendChild(entry);
    autoSaveSalesDraft();
}

/**
 * 営業記録エントリーを削除
 */
function removeSalesEntry(entryId) {
    const entry = document.getElementById(entryId);
    if (entry) {
        entry.remove();
        renumberEntries('sales-batch-list');
        autoSaveSalesDraft();
    }
}

/**
 * 営業記録を一括保存
 */
async function saveBatchSales() {
    const date = document.getElementById('sales-date').value;
    const staff = document.getElementById('sales-staff').value;

    if (!date || !staff) {
        showError('日付と営業担当を選択してください');
        return;
    }

    const entries = document.querySelectorAll('#sales-batch-list .batch-entry');
    if (entries.length === 0) {
        showError('記録を追加してください');
        return;
    }

    const records = [];
    let hasError = false;
    entries.forEach((entry, index) => {
        const careManager = entry.querySelector('.entry-care-manager').value.trim();
        const content = entry.querySelector('.entry-content').value;

        if (!careManager) {
            showError(`記録${index + 1}: ケアマネ名を入力してください`);
            hasError = true;
            return;
        }

        records.push({
            date,
            careManagerId: '',
            officeName: '',
            careManagerName: careManager,
            staff,
            content,
            timestamp: getTimestamp(),
            notionSynced: ''
        });
    });

    if (hasError) return;

    try {
        showLoading(`${records.length}件を保存中...`);

        // 全件を並列送信（高速化）
        const results = await Promise.all(
            records.map(record => saveSalesRecord(record))
        );

        let offlineCount = 0;
        let successCount = 0;
        results.forEach(result => {
            if (result.offline) {
                offlineCount++;
            } else {
                successCount++;
            }
        });

        hideLoading();

        if (offlineCount > 0) {
            showToast(`${offlineCount}件を一時保存しました（後で自動送信）`, 3000);
        } else {
            showToast(`${successCount}件を保存しました`, 2000);
        }

        // リストをクリア（日付・担当者は維持）
        document.getElementById('sales-batch-list').innerHTML = '';
        salesEntryCounter = 0;
        addSalesEntry();

        clearSalesDraft();

    } catch (error) {
        hideLoading();
        console.error('Batch save failed:', error);
        showError('保存に失敗しました');
    }
}

/**
 * 営業記録をクリア
 */
function clearSalesBatch() {
    if (window.confirm('入力中のデータを削除しますか？')) {
        document.getElementById('sales-batch-list').innerHTML = '';
        salesEntryCounter = 0;
        addSalesEntry();
        clearSalesDraft();
    }
}

/**
 * 営業記録の一時保存（自動）
 */
function autoSaveSalesDraft() {
    const date = document.getElementById('sales-date').value;
    const staff = document.getElementById('sales-staff').value;

    const entries = [];
    document.querySelectorAll('#sales-batch-list .batch-entry').forEach(entry => {
        entries.push({
            careManager: entry.querySelector('.entry-care-manager').value,
            content: entry.querySelector('.entry-content').value
        });
    });

    saveSalesDraft({ date, staff, entries });
}

/**
 * 先週の営業記録をコピー
 */
async function copyLastWeekSales() {
    const staff = document.getElementById('sales-staff').value;
    const baseDate = document.getElementById('sales-date').value;

    if (!staff) {
        showError('営業担当を選択してください');
        return;
    }

    try {
        showLoading('先週の記録を取得中...');
        const result = await getLastWeekSalesContacts(staff, baseDate);
        hideLoading();

        if (!result.success) {
            showError('取得に失敗しました');
            return;
        }

        if (!result.data || result.data.length === 0) {
            showToast('該当する記録がありません', 3000);
            return;
        }

        const existingEntries = document.querySelectorAll('#sales-batch-list .batch-entry');
        if (existingEntries.length === 1) {
            const firstCM = existingEntries[0].querySelector('.entry-care-manager').value;
            if (!firstCM) {
                existingEntries[0].remove();
            }
        }

        result.data.forEach(item => {
            addSalesEntry(item.name, item.memo);
        });

        showToast(`${result.data.length}件の記録を追加しました`, 2000);
    } catch (error) {
        hideLoading();
        console.error('Copy last week failed:', error);
        showError('取得に失敗しました');
    }
}

function setupSalesScreen() {
    document.getElementById('btn-add-sales-entry').addEventListener('click', () => addSalesEntry());
    document.getElementById('btn-save-batch-sales').addEventListener('click', saveBatchSales);
    document.getElementById('btn-clear-sales').addEventListener('click', clearSalesBatch);
    document.getElementById('btn-copy-last-week-sales').addEventListener('click', copyLastWeekSales);
    document.getElementById('btn-back-sales').addEventListener('click', () => {
        showScreen('home');
    });

    document.getElementById('sales-date').addEventListener('change', autoSaveSalesDraft);
    document.getElementById('sales-staff').addEventListener('change', autoSaveSalesDraft);
}

// =============================================
// 共通ユーティリティ
// =============================================

/**
 * エントリーの番号を振り直す
 */
function renumberEntries(listId) {
    const entries = document.querySelectorAll(`#${listId} .batch-entry`);
    entries.forEach((entry, index) => {
        const numEl = entry.querySelector('.batch-entry-number');
        if (numEl) numEl.textContent = index + 1;
    });
}

// =============================================
// 記録閲覧画面
// =============================================

let currentViewTab = 'treatment';

function initViewScreen() {
    showViewTab('treatment');
}

function showViewTab(tab) {
    currentViewTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${tab}`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

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

// =============================================
// 設定画面
// =============================================

function initSettingsScreen() {
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
    if (window.confirm('キャッシュをクリアしますか?')) {
        clearCache();
    }
}

function resetAllData() {
    if (window.confirm('全データをリセットしますか?\nこの操作は取り消せません。')) {
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
