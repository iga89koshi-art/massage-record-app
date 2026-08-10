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

    const syncBtn = document.getElementById('btn-sync-now');
    if (syncBtn) {
        syncBtn.addEventListener('click', manualSyncNow);
    }
}

// =============================================
// 未送信データ（オフラインキュー）の表示・手動同期
// =============================================

/**
 * ホーム画面・設定画面の未送信件数表示を更新
 */
function updateSyncBadge() {
    const count = getOfflineQueueCount();

    const banner = document.getElementById('sync-banner');
    const countEl = document.getElementById('sync-pending-count');
    if (banner && countEl) {
        countEl.textContent = count;
        banner.classList.toggle('hidden', count === 0);
    }

    const settingsCountEl = document.getElementById('settings-sync-count');
    if (settingsCountEl) {
        settingsCountEl.textContent = count;
    }
}

/**
 * 未送信データを今すぐ同期する（手動トリガー）
 */
async function manualSyncNow() {
    if (!navigator.onLine) {
        showError('オフラインです。電波の良い場所で再度お試しください');
        return;
    }

    try {
        showLoading('未送信データを送信中...');
        const result = await syncOfflineQueue();
        hideLoading();

        if (result.synced > 0) {
            showToast(`${result.synced}件を送信しました`);
        }
        if (result.failed > 0) {
            showError(`${result.failed}件の送信に失敗しました。時間をおいて再度お試しください`);
        }
        if (!result.synced && !result.failed) {
            showToast('未送信のデータはありません');
        }

        updateSyncBadge();
    } catch (error) {
        hideLoading();
        console.error('Manual sync failed:', error);
        showError('同期に失敗しました');
    }
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
            // 一旦リストを空にする（重複追加防止）
            document.getElementById('treatment-batch-list').innerHTML = '';
            treatmentEntryCounter = 0;

            let addedCount = 0;
            draft.entries.forEach(entry => {
                // 患者名もメモも空のものは復元しない（無限増え防止）
                if (entry.patient || entry.memo) {
                    addTreatmentEntry(entry.patient, entry.memo);
                    addedCount++;
                }
            });

            // もし有効なエントリーが1つもなかったら空の枠を1つ追加
            if (addedCount === 0) {
                addTreatmentEntry();
            }
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
        const name = escapeHtml(patient.name);
        html += `<option value="${name}"${selected}>${name}</option>`;
    });
    return html;
}

/**
 * 患者名の表記ゆれを吸収するための正規化。
 * スケジュール表には「河野 淑子(9:40)」のように時刻メモが付いていたり、
 * 「中村知平」のようにスペースが省かれていることがあるため、
 * 括弧書きとスペースを落としてから突き合わせる。
 */
function normalizePatientName(name) {
    return String(name || '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/[\s　]/g, '')
        .trim();
}

/**
 * スケジュール表の1マスを患者名の配列に分解する。
 * 「佐藤精次 / 髙橋 伊三郎(8:30)」のように複数人が入っている場合に対応。
 */
function splitScheduleNames(cell) {
    return String(cell || '')
        .split(/[\/／、,]/)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * 患者リストから該当者を探す。見つからなければ空文字を返す。
 */
function findPatientByName(name) {
    const target = normalizePatientName(name);
    if (!target) return '';

    const hit = getPatients().find(p => normalizePatientName(p.name) === target);
    return hit ? hit.name : '';
}

/**
 * 施術記録エントリーを追加
 */
function addTreatmentEntry(patient, memo, time, unmatchedName) {
    treatmentEntryCounter++;
    const list = document.getElementById('treatment-batch-list');
    const entryId = `treatment-entry-${treatmentEntryCounter}`;

    const numLabel = list.children.length + 1;
    const headerText = time ? `${numLabel} (${time}〜)` : `${numLabel}`;

    // 患者リストと一致しなかった場合、元の表記を出して手動で選べるようにする
    const hintHtml = unmatchedName
        ? `<div class="entry-hint">表の記載：${escapeHtml(unmatchedName)}<br>患者リストに一致する名前がありません。選び直してください</div>`
        : '';

    const entry = document.createElement('div');
    entry.className = 'batch-entry';
    entry.id = entryId;
    entry.innerHTML = `
        <div class="batch-entry-header">
            <span class="batch-entry-number">${headerText}</span>
            <button type="button" class="btn-remove-entry" onclick="removeTreatmentEntry('${entryId}')">✕</button>
        </div>
        <div class="form-group">
            <label>患者 <span class="required">*</span></label>
            ${hintHtml}
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

    const entryEls = Array.from(document.querySelectorAll('#treatment-batch-list .batch-entry'));
    if (entryEls.length === 0) {
        showError('記録を追加してください');
        return;
    }

    // バリデーション
    const items = [];
    let hasError = false;
    entryEls.forEach((entry, index) => {
        const patient = entry.querySelector('.entry-patient').value;
        const memo = entry.querySelector('.entry-memo').value;

        if (!patient) {
            showError(`記録${index + 1}: 患者を選択してください`);
            hasError = true;
            return;
        }

        items.push({
            el: entry,
            record: {
                date,
                patientId: '',
                patientName: patient,
                staff,
                memo,
                timestamp: getTimestamp(),
                notionSynced: ''
            }
        });
    });

    if (hasError) return;

    try {
        showLoading(`${items.length}件を保存中...`);

        // 個別に送信し、失敗した記録だけを画面に残す
        // （Promise.allだと1件でも失敗すると全体が失敗扱いになり、
        //   再送信時に成功済みの記録まで二重送信されてしまうため）
        const outcomes = await Promise.allSettled(
            items.map(item => saveTreatmentRecord(item.record))
        );

        let offlineCount = 0;
        let successCount = 0;
        let failCount = 0;

        outcomes.forEach((outcome, i) => {
            if (outcome.status === 'fulfilled') {
                if (outcome.value.offline) {
                    offlineCount++;
                } else {
                    successCount++;
                }
                items[i].el.remove();
            } else {
                failCount++;
                console.error('Save failed for entry', items[i].record, outcome.reason);
            }
        });

        hideLoading();

        if (failCount > 0) {
            showError(`${failCount}件の保存に失敗しました。内容を確認して「まとめて保存」を再度押してください`);
        }

        if (offlineCount > 0) {
            showToast(`${offlineCount}件を一時保存しました（電波の良い場所で自動送信されます）`, 3500);
        } else if (successCount > 0 && failCount === 0) {
            showToast(`${successCount}件を保存しました`, 2000);
        }

        renumberEntries('treatment-batch-list');

        // 残っているのは失敗分のみ。空になったら入力枠を1つ用意
        if (document.querySelectorAll('#treatment-batch-list .batch-entry').length === 0) {
            addTreatmentEntry();
        }

        if (failCount === 0) {
            clearTreatmentDraft();
        } else {
            autoSaveTreatmentDraft();
        }

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
 * 曜日を取得するヘルパー関数
 */
function getDayOfWeek(dateString) {
    const d = new Date(dateString);
    const dayIndex = d.getDay(); // 0: 日, 1: 月...
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayIndex];
}

/**
 * 基本スケジュール（施術記録）を読み込む
 */
async function loadScheduleTreatment() {
    const staff = document.getElementById('treatment-staff').value;
    const baseDate = document.getElementById('treatment-date').value;

    if (!staff || !baseDate) {
        showError('日付と担当者を選択してください');
        return;
    }

    try {
        let schedules = getSchedules();

        // ローカルキャッシュに無い、または更新したての場合は念のため取得（通常は設定画面でキャッシュ済み）
        if (!schedules || schedules.length === 0) {
            showLoading('スケジュールを取得中...');
            schedules = await fetchSchedulesFromGas();
            hideLoading();
        }

        const dayName = getDayOfWeek(baseDate);

        // 該当のスケジュールを抽出（施術、担当者、曜日一致）
        const targetSchedules = schedules.filter(s =>
            s.type === 'treatment' &&
            s.staff === staff &&
            s.day === dayName
        );

        if (targetSchedules.length === 0) {
            showToast('この日のスケジュールはありません', 3000);
            return;
        }

        // 時間順（昇順）にソート
        targetSchedules.sort((a, b) => a.time.localeCompare(b.time));

        // 既存エントリーが空の1件だけなら削除
        const existingEntries = document.querySelectorAll('#treatment-batch-list .batch-entry');
        if (existingEntries.length === 1) {
            const firstPatient = existingEntries[0].querySelector('.entry-patient').value;
            if (!firstPatient) {
                existingEntries[0].remove();
            }
        }

        // 1マスに複数人が入っている場合は分けて追加する
        let addedCount = 0;
        let unmatchedCount = 0;

        targetSchedules.forEach(item => {
            splitScheduleNames(item.name).forEach(rawName => {
                const matched = findPatientByName(rawName);
                if (!matched) unmatchedCount++;
                addTreatmentEntry(matched, '', item.time, matched ? '' : rawName);
                addedCount++;
            });
        });

        if (unmatchedCount > 0) {
            showToast(`${addedCount}件追加（うち${unmatchedCount}件は患者を選び直してください）`, 4000);
        } else {
            showToast(`${addedCount}件のスケジュールを追加しました`, 2000);
        }
    } catch (error) {
        hideLoading();
        console.error('Load schedule failed:', error);
        showError('スケジュールの取得に失敗しました');
    }
}

function setupTreatmentScreen() {
    document.getElementById('btn-add-treatment-entry').addEventListener('click', () => addTreatmentEntry());
    document.getElementById('btn-save-batch-treatment').addEventListener('click', saveBatchTreatment);
    document.getElementById('btn-clear-treatment').addEventListener('click', clearTreatmentBatch);
    document.getElementById('btn-load-schedule-treatment').addEventListener('click', loadScheduleTreatment);
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
            // 一旦リストを空にする（重複追加防止）
            document.getElementById('sales-batch-list').innerHTML = '';
            salesEntryCounter = 0;

            let addedCount = 0;
            draft.entries.forEach(entry => {
                // ケアマネ名も内容も空のものは復元しない
                if (entry.careManager || entry.content) {
                    addSalesEntry(entry.careManager, entry.content);
                    addedCount++;
                }
            });

            // 有効なエントリーが1つもなかったら空の枠を1つ追加
            if (addedCount === 0) {
                addSalesEntry();
            }
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
function addSalesEntry(careManager, content, time) {
    salesEntryCounter++;
    const list = document.getElementById('sales-batch-list');
    const entryId = `sales-entry-${salesEntryCounter}`;

    const numLabel = list.children.length + 1;
    const headerText = time ? `${numLabel} (${time}〜)` : `${numLabel}`;

    const entry = document.createElement('div');
    entry.className = 'batch-entry';
    entry.id = entryId;
    entry.innerHTML = `
        <div class="batch-entry-header">
            <span class="batch-entry-number">${headerText}</span>
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

    const entryEls = Array.from(document.querySelectorAll('#sales-batch-list .batch-entry'));
    if (entryEls.length === 0) {
        showError('記録を追加してください');
        return;
    }

    const items = [];
    let hasError = false;
    entryEls.forEach((entry, index) => {
        const careManager = entry.querySelector('.entry-care-manager').value.trim();
        const content = entry.querySelector('.entry-content').value;

        if (!careManager) {
            showError(`記録${index + 1}: ケアマネ名を入力してください`);
            hasError = true;
            return;
        }

        items.push({
            el: entry,
            record: {
                date,
                careManagerId: '',
                officeName: '',
                careManagerName: careManager,
                staff,
                content,
                timestamp: getTimestamp(),
                notionSynced: ''
            }
        });
    });

    if (hasError) return;

    try {
        showLoading(`${items.length}件を保存中...`);

        // 個別に送信し、失敗した記録だけを画面に残す
        // （成功済みの記録が再送信で二重登録されるのを防ぐため）
        const outcomes = await Promise.allSettled(
            items.map(item => saveSalesRecord(item.record))
        );

        let offlineCount = 0;
        let successCount = 0;
        let failCount = 0;

        outcomes.forEach((outcome, i) => {
            if (outcome.status === 'fulfilled') {
                if (outcome.value.offline) {
                    offlineCount++;
                } else {
                    successCount++;
                }
                items[i].el.remove();
            } else {
                failCount++;
                console.error('Save failed for entry', items[i].record, outcome.reason);
            }
        });

        hideLoading();

        if (failCount > 0) {
            showError(`${failCount}件の保存に失敗しました。内容を確認して「まとめて保存」を再度押してください`);
        }

        if (offlineCount > 0) {
            showToast(`${offlineCount}件を一時保存しました（電波の良い場所で自動送信されます）`, 3500);
        } else if (successCount > 0 && failCount === 0) {
            showToast(`${successCount}件を保存しました`, 2000);
        }

        renumberEntries('sales-batch-list');

        if (document.querySelectorAll('#sales-batch-list .batch-entry').length === 0) {
            addSalesEntry();
        }

        if (failCount === 0) {
            clearSalesDraft();
        } else {
            autoSaveSalesDraft();
        }

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
 * 基本スケジュール（営業記録）を読み込む
 */
async function loadScheduleSales() {
    const staff = document.getElementById('sales-staff').value;
    const baseDate = document.getElementById('sales-date').value;

    if (!staff || !baseDate) {
        showError('日付と営業担当を選択してください');
        return;
    }

    try {
        let schedules = getSchedules();

        if (!schedules || schedules.length === 0) {
            showLoading('スケジュールを取得中...');
            schedules = await fetchSchedulesFromGas();
            hideLoading();
        }

        const dayName = getDayOfWeek(baseDate);

        const targetSchedules = schedules.filter(s =>
            s.type === 'sales' &&
            s.staff === staff &&
            s.day === dayName
        );

        if (targetSchedules.length === 0) {
            showToast('この日のスケジュールはありません', 3000);
            return;
        }

        targetSchedules.sort((a, b) => a.time.localeCompare(b.time));

        const existingEntries = document.querySelectorAll('#sales-batch-list .batch-entry');
        if (existingEntries.length === 1) {
            const firstCM = existingEntries[0].querySelector('.entry-care-manager').value;
            if (!firstCM) {
                existingEntries[0].remove();
            }
        }

        let addedCount = 0;
        targetSchedules.forEach(item => {
            splitScheduleNames(item.name).forEach(rawName => {
                addSalesEntry(rawName, '', item.time);
                addedCount++;
            });
        });

        showToast(`${addedCount}件のスケジュールを追加しました`, 2000);
    } catch (error) {
        hideLoading();
        console.error('Load schedule failed:', error);
        showError('スケジュールの取得に失敗しました');
    }
}

function setupSalesScreen() {
    document.getElementById('btn-add-sales-entry').addEventListener('click', () => addSalesEntry());
    document.getElementById('btn-save-batch-sales').addEventListener('click', saveBatchSales);
    document.getElementById('btn-clear-sales').addEventListener('click', clearSalesBatch);
    document.getElementById('btn-load-schedule-sales').addEventListener('click', loadScheduleSales);
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
    document.getElementById('setting-gas-schedule-url').value = getGasScheduleUrl();
    updateSyncBadge();
}

function saveSettings() {
    const notionApiKey = document.getElementById('setting-notion-api-key').value;
    const notionPatientDb = document.getElementById('setting-notion-patient-db').value;
    const notionCareManagerDb = document.getElementById('setting-notion-care-manager-db').value;
    const gasSpreadsheetUrl = document.getElementById('setting-gas-spreadsheet-url').value;
    const gasApiUrl = document.getElementById('setting-gas-api-url').value;
    const gasScheduleUrl = document.getElementById('setting-gas-schedule-url').value;

    saveNotionApiKey(notionApiKey);
    saveNotionPatientDb(notionPatientDb);
    saveNotionCareManagerDb(notionCareManagerDb);
    saveGasSpreadsheetUrl(gasSpreadsheetUrl);
    saveGasApiUrl(gasApiUrl);
    saveGasScheduleUrl(gasScheduleUrl);

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
    const failed = [];

    showLoading('データ再取得中...');

    // 担当者マスタ（スタッフを追加してもここで取り直さないと反映されない）
    try {
        await fetchStaffFromGas();
    } catch (e) {
        console.warn('Staff reload failed:', e);
        failed.push('担当者');
    }

    // 患者リスト（Notion）
    try {
        await fetchPatientsFromNotion();
    } catch (e) {
        console.warn('Patient reload failed:', e);
        failed.push('患者リスト');
    }

    // 基本スケジュール
    try {
        await fetchSchedulesFromGas();
    } catch (e) {
        console.warn('Schedule reload failed:', e);
        failed.push('スケジュール');
    }

    hideLoading();

    if (failed.length === 0) {
        showToast('各種データを更新しました');
    } else {
        showError(`${failed.join('・')}の取得に失敗しました`);
    }
}

function clearCacheData() {
    if (window.confirm('キャッシュをクリアしますか?')) {
        clearCache();
    }
}

function resetAllData() {
    const pendingCount = getOfflineQueueCount();
    let message = '全データをリセットしますか?\nこの操作は取り消せません。';

    if (pendingCount > 0) {
        message = `⚠️ 未送信の記録が${pendingCount}件あります。\n全データをリセットすると、これらの記録は完全に失われます。\n\n本当にリセットしますか?`;
    }

    if (window.confirm(message)) {
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
    document.getElementById('btn-settings-sync-now').addEventListener('click', manualSyncNow);
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
