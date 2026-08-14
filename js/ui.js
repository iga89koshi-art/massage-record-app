// UI制御・画面遷移

let currentScreen = 'home';
let passwordAttempts = 0;
let passwordLockUntil = null;

// 一括入力用のエントリーカウンター
let treatmentEntryCounter = 0;
let salesEntryCounter = 0;

// 施術録のチェック項目（並び順がそのまま記録文の語順になる）
const OPERATION_PARTS = ['頸部', '肩部', '背部', '腰部', '上肢', '下肢'];
const OPERATION_TREATMENTS = ['刺鍼', 'てい鍼', '電子温灸器'];

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
        case 'schedule-view':
            initScheduleScreen();
            break;
        case 'label-print':
            initLabelScreen();
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

    document.getElementById('btn-schedule').addEventListener('click', () => {
        showScreen('schedule-view');
    });

    document.getElementById('btn-labels').addEventListener('click', () => {
        showScreen('label-print');
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
                    addTreatmentEntry(entry.patient, entry.memo, '', {
                        parts: entry.parts,
                        treatments: entry.treatments
                    });
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
function addTreatmentEntry(patient, memo, time, options) {
    const opts = options || {};
    treatmentEntryCounter++;
    const list = document.getElementById('treatment-batch-list');
    const entryId = `treatment-entry-${treatmentEntryCounter}`;

    const numLabel = list.children.length + 1;
    let headerText = String(numLabel);
    if (time) {
        headerText += opts.duration ? ` (${time}〜 ${opts.duration}分)` : ` (${time}〜)`;
    }

    // 患者リストと一致しなかった場合、元の表記を出して手動で選べるようにする
    const notes = [];
    if (opts.unmatchedName) {
        notes.push(`予定の記載：${escapeHtml(opts.unmatchedName)}<br>患者リストに一致する名前がありません。選び直してください`);
    }
    if (opts.note) {
        notes.push(`備考：${escapeHtml(opts.note)}`);
    }
    const hintHtml = notes.length
        ? `<div class="entry-hint">${notes.join('<br>')}</div>`
        : '';

    // 部位・施術内容の初期チェック。
    // 一時保存からの復元ならその状態を、それ以外は患者DBの基本施術を使う。
    const base = getPatientBaseTreatment(patient || '');
    const parts = Array.isArray(opts.parts) ? opts.parts : base.parts;
    const treatments = Array.isArray(opts.treatments) ? opts.treatments : base.treatments;

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
            <select class="form-control entry-patient" onchange="onTreatmentPatientChange('${entryId}')">
                ${createPatientSelectHtml(patient || '')}
            </select>
        </div>
        <div class="form-group">
            <label>部位</label>
            <div class="check-grid">
                ${createCheckboxesHtml(OPERATION_PARTS, 'entry-part', parts)}
            </div>
        </div>
        <div class="form-group">
            <label>施術内容</label>
            <div class="check-grid">
                ${createCheckboxesHtml(OPERATION_TREATMENTS, 'entry-treatment', treatments)}
            </div>
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
 * 患者を選び直したら、その患者の基本施術にチェックを合わせ直す
 */
function onTreatmentPatientChange(entryId) {
    applyPatientBaseTreatmentById(entryId);
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

    // バリデーション。
    // 部位・施術内容は未選択でもエラーにしない（メモだけ残したい日があるため）。
    // その場合は施術記録シートにだけ保存し、施術録シートには書かない。
    const items = [];
    let hasError = false;
    entryEls.forEach((entry, index) => {
        const patient = entry.querySelector('.entry-patient').value;
        const memo = entry.querySelector('.entry-memo').value;
        const parts = getCheckedValues(entry, '.entry-part');
        const treatments = getCheckedValues(entry, '.entry-treatment');

        if (!patient) {
            showError(`記録${index + 1}: 患者を選択してください`);
            hasError = true;
            return;
        }

        const timestamp = getTimestamp();

        items.push({
            el: entry,
            record: {
                date,
                patientId: '',
                patientName: patient,
                staff,
                memo,
                timestamp,
                notionSynced: ''
            },
            // 部位と施術内容が両方選ばれているときだけ施術録に残す
            operationRecord: (parts.length && treatments.length) ? {
                date,
                patientId: '',
                patientName: patient,
                staff,
                parts,
                treatments,
                note: buildOperationNote(parts, treatments),
                timestamp
            } : null
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
        const savedItems = [];

        outcomes.forEach((outcome, i) => {
            if (outcome.status === 'fulfilled') {
                if (outcome.value.offline) {
                    offlineCount++;
                } else {
                    successCount++;
                }
                savedItems.push(items[i]);
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

        // 施術録シートと患者DBの更新。
        // 施術記録は既に保存できているので、ここが失敗しても
        // 保存結果には影響させず、待たずに裏で流す。
        saveOperationsInBackground(savedItems);

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
 * 施術記録の保存に成功した分について、施術録シートへの保存と
 * 患者DBの基本施術の更新をまとめて行う。
 *
 * 施術記録（毎日使う本番機能）を守るため、ここでの失敗は
 * 画面に出さずコンソールに残すだけにする。
 * 部位・施術内容が未選択の記録は operationRecord が null なので書き込まない。
 */
function saveOperationsInBackground(savedItems) {
    savedItems.forEach(item => {
        if (!item.operationRecord) return;

        saveOperationRecord(item.operationRecord)
            .then(() => syncPatientBaseTreatment(item.operationRecord))
            .catch(error => {
                console.warn('Save operation record failed:', item.operationRecord.patientName, error);
            });
    });
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
            memo: entry.querySelector('.entry-memo').value,
            parts: getCheckedValues(entry, '.entry-part'),
            treatments: getCheckedValues(entry, '.entry-treatment')
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
 * 施術スケジュールの取得元。
 * Notionの訪問予定データベースが設定されていればそちらを使い、
 * 未設定のときだけ従来のスプレッドシート側を見る。
 */
async function getTreatmentSchedules() {
    const useNotion = !!getNotionVisitPlanDb();

    let schedules = useNotion ? getVisitPlans() : getSchedules();

    if (!schedules || schedules.length === 0) {
        showLoading('訪問予定を取得中...');
        try {
            schedules = useNotion
                ? await fetchVisitPlansFromNotion()
                : await fetchSchedulesFromGas();
        } finally {
            hideLoading();
        }
    }

    return schedules;
}

async function loadScheduleTreatment() {
    const staff = document.getElementById('treatment-staff').value;
    const baseDate = document.getElementById('treatment-date').value;

    if (!staff || !baseDate) {
        showError('日付と担当者を選択してください');
        return;
    }

    try {
        const schedules = await getTreatmentSchedules();

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
                addTreatmentEntry(matched, '', item.time, {
                    unmatchedName: matched ? '' : rawName,
                    duration: item.duration,
                    note: item.note
                });
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

    // 部位・施術内容のチェックも一時保存に含める
    document.getElementById('treatment-batch-list').addEventListener('change', autoSaveTreatmentDraft);
}

// =============================================
// 施術録の部品（療養費の保険記録）
//
// 画面は施術記録入力に統合済み。ここにあるのはその部品。
// 施術録は部位と施術内容のチェックだけを機械的に残す帳票なので、
// 患者の主観や会話内容（メモ欄の内容）は一切入れない。
// =============================================

/**
 * チェックボックス群のHTMLを生成
 */
function createCheckboxesHtml(names, itemClass, checkedNames) {
    const checked = checkedNames || [];

    return names.map(name => {
        const label = escapeHtml(name);
        const isChecked = checked.indexOf(name) !== -1 ? ' checked' : '';
        return `<label class="check-item">
                    <input type="checkbox" class="${itemClass}" value="${label}"${isChecked}>
                    <span>${label}</span>
                </label>`;
    }).join('');
}

/**
 * 患者キャッシュに入っている基本施術（Notion患者DBの「基本施術部位」「基本施術内容」）を引く。
 * 起動時に取得済みのキャッシュを見るだけなので通信は発生しない。
 */
function getPatientBaseTreatment(patientName) {
    const patient = getPatients().find(p => p.name === patientName);

    if (!patient) {
        return { parts: [], treatments: [] };
    }

    // 患者DB側の並び順に関わらず、部位・施術内容の定義順に揃える
    return {
        parts: sortCheckList(patient.baseParts, OPERATION_PARTS),
        treatments: sortCheckList(patient.baseTreatments, OPERATION_TREATMENTS)
    };
}

/**
 * チェック項目を定義順に並べ直す（記録文の語順と比較のため）
 */
function sortCheckList(names, order) {
    return order.filter(name => (names || []).indexOf(name) !== -1);
}

/**
 * カード内のチェック状態を取り出す
 */
function getCheckedValues(entry, selector) {
    return Array.from(entry.querySelectorAll(selector))
        .filter(input => input.checked)
        .map(input => input.value);
}

/**
 * カードのチェックを指定の内容に合わせる
 */
function applyOperationChecks(entry, parts, treatments) {
    entry.querySelectorAll('.entry-part').forEach(input => {
        input.checked = (parts || []).indexOf(input.value) !== -1;
    });
    entry.querySelectorAll('.entry-treatment').forEach(input => {
        input.checked = (treatments || []).indexOf(input.value) !== -1;
    });
}

/**
 * 患者を選び直したとき、その患者の基本施術にチェックを合わせ直す
 */
function applyPatientBaseTreatmentById(entryId) {
    const entry = document.getElementById(entryId);

    if (!entry) return;

    const base = getPatientBaseTreatment(entry.querySelector('.entry-patient').value);
    applyOperationChecks(entry, base.parts, base.treatments);
}

/**
 * 保存した内容が患者DBの基本施術と違っていたら、患者DB側を書き換えて次回の既定値にする。
 * 「1度入力したら覚える」ための処理。
 *
 * 同じ内容なら書き込まない（無駄な更新を避けるため）。
 * また、施術録は既に保存できているので、ここが失敗しても
 * ユーザーにはエラーを見せずコンソールに出すだけにする。
 */
async function syncPatientBaseTreatment(record) {
    const patients = getPatients();
    const patient = patients.find(p => p.name === record.patientName);

    if (!patient || !patient.id) return;

    const sameParts = isSameCheckList(patient.baseParts, record.parts);
    const sameTreatments = isSameCheckList(patient.baseTreatments, record.treatments);

    if (sameParts && sameTreatments) return;

    try {
        await updatePatientBaseTreatment(patient.id, record.parts, record.treatments);

        // 次に開いたときすぐ新しい既定値になるよう、手元のキャッシュも合わせる
        patient.baseParts = record.parts;
        patient.baseTreatments = record.treatments;
        savePatients(patients);
    } catch (error) {
        console.warn('Update patient base treatment failed:', record.patientName, error);
    }
}

/**
 * チェック内容が同じかどうか（並び順の違いは無視する）
 */
function isSameCheckList(a, b) {
    return sortCheckList(a, OPERATION_PARTS.concat(OPERATION_TREATMENTS)).join(',') ===
        sortCheckList(b, OPERATION_PARTS.concat(OPERATION_TREATMENTS)).join(',');
}

/**
 * 記録文を組み立てる
 * 例：腰部、下肢に刺鍼、電子温灸器を施術
 */
function buildOperationNote(parts, treatments) {
    return `${parts.join('、')}に${treatments.join('、')}を施術`;
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
// 訪問スケジュール画面
//
// スマホの縦画面で「自分の今日の訪問」を操作なしで見るための画面。
// 表（縦=時刻・横=曜日）ではなく、1画面=1人の1日のリストで見せる。
// =============================================

// 訪問予定データベースの「曜日」に合わせた月曜始まりの並び
const SCHEDULE_DAYS = ['月', '火', '水', '木', '金', '土', '日'];

let scheduleDayIndex = 0;
let scheduleMode = 'day';
// 取得を試したかどうか（キャッシュが空でも取得は1回だけにする）
let scheduleFetchTried = false;
// いま画面に出ている予定。カードのタップからは並び順の番号で引く
let scheduleVisiblePlans = [];

/**
 * 今日の曜日を月曜始まりの 0〜6 に直す（getDay() は 日=0 なので +6 して回す）
 */
function getTodayScheduleDayIndex() {
    return (new Date().getDay() + 6) % 7;
}

/**
 * 訪問予定キャッシュのうち、施術の予定だけを返す（通信なし）
 */
function getTreatmentVisitPlans() {
    return getVisitPlans().filter(plan => plan && plan.type === 'treatment' && plan.day);
}

/**
 * 予定に実際に登場する施術者だけを重複なしで取り出す
 */
function getScheduleStaffList(plans) {
    const names = [];
    plans.forEach(plan => {
        if (plan.staff && names.indexOf(plan.staff) === -1) {
            names.push(plan.staff);
        }
    });
    return sortJapanese(names);
}

/**
 * 初期表示の施術者。前回選んだ人を優先し、無ければ予定件数が最多の人。
 */
function getDefaultScheduleStaff(plans, staffList) {
    const remembered = getScheduleStaff();
    if (remembered && staffList.indexOf(remembered) !== -1) {
        return remembered;
    }

    let best = '';
    let bestCount = -1;
    staffList.forEach(name => {
        const count = plans.filter(plan => plan.staff === name).length;
        if (count > bestCount) {
            best = name;
            bestCount = count;
        }
    });
    return best;
}

/**
 * 時刻順に並べる。同じ時刻に複数人いる場合は患者名順。
 */
function sortSchedulePlans(plans) {
    return plans.slice().sort((a, b) => {
        const byTime = String(a.time || '').localeCompare(String(b.time || ''));
        if (byTime !== 0) return byTime;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
    });
}

function initScheduleScreen() {
    scheduleDayIndex = getTodayScheduleDayIndex();
    scheduleMode = 'day';

    // まずキャッシュで描く（待たせない）
    renderScheduleScreen();

    // キャッシュが空のときだけ取りに行く
    if (getTreatmentVisitPlans().length === 0) {
        loadVisitPlansIfEmpty();
    }
}

/**
 * キャッシュが空の場合の初回取得。何度も叩かないよう1回だけ試す。
 */
async function loadVisitPlansIfEmpty() {
    if (scheduleFetchTried) return;
    scheduleFetchTried = true;

    if (!getNotionVisitPlanDb()) {
        showError('訪問予定データベースが設定されていません');
        return;
    }

    try {
        showLoading('訪問予定を取得中...');
        await fetchVisitPlansFromNotion();
        renderScheduleScreen();
    } catch (error) {
        console.error('Load visit plans failed:', error);
        showError('訪問予定の取得に失敗しました');
    } finally {
        hideLoading();
    }
}

/**
 * Notionから取り直して描き直す（「最新に更新」）
 */
async function refreshVisitPlans() {
    if (!getNotionVisitPlanDb()) {
        showError('訪問予定データベースが設定されていません');
        return;
    }

    try {
        showLoading('訪問予定を取得中...');
        const plans = await fetchVisitPlansFromNotion();
        hideLoading();
        renderScheduleScreen();
        showToast(`訪問予定を${plans.length}件読み込みました`);
    } catch (error) {
        hideLoading();
        console.error('Refresh visit plans failed:', error);
        showError('訪問予定の取得に失敗しました');
    }
}

/**
 * 画面全体を描き直す（曜日・施術者・表示切替のどれが変わってもここを通す）
 */
function renderScheduleScreen() {
    const plans = getTreatmentVisitPlans();
    const staffList = getScheduleStaffList(plans);
    const select = document.getElementById('schedule-staff');

    // 選択中の施術者が予定から消えた場合も含めて選び直す
    let staff = select.value;
    if (!staff || staffList.indexOf(staff) === -1) {
        staff = getDefaultScheduleStaff(plans, staffList);
    }

    select.innerHTML = staffList.length
        ? staffList.map(name => {
            const label = escapeHtml(name);
            return `<option value="${label}">${label}</option>`;
        }).join('')
        : '<option value="">予定がありません</option>';
    select.value = staff;

    document.getElementById('schedule-day-label').textContent = `${SCHEDULE_DAYS[scheduleDayIndex]}曜日`;

    // タブと表示パネルの出し分け
    document.querySelectorAll('#schedule-view .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-schedule-${scheduleMode}`).classList.add('active');
    document.getElementById('schedule-day-list').classList.toggle('hidden', scheduleMode !== 'day');
    document.getElementById('schedule-week-list').classList.toggle('hidden', scheduleMode !== 'week');
    // 週表示では7日まとめて出すので曜日送りは隠す
    document.getElementById('schedule-day-nav').classList.toggle('hidden', scheduleMode === 'week');

    if (scheduleMode === 'week') {
        renderScheduleWeek(plans, staff);
    } else {
        renderScheduleDay(plans, staff);
    }
}

/**
 * 日表示。予定のある時間だけを時刻順のカードで詰めて並べる（空き時間は出さない）。
 */
function renderScheduleDay(plans, staff) {
    const dayName = SCHEDULE_DAYS[scheduleDayIndex];
    const items = sortSchedulePlans(
        plans.filter(plan => plan.staff === staff && plan.day === dayName)
    );
    scheduleVisiblePlans = items;

    const totalMinutes = items.reduce((sum, plan) => sum + (Number(plan.duration) || 0), 0);
    const summary = document.getElementById('schedule-summary');
    summary.textContent = totalMinutes > 0
        ? `${items.length}件 / 合計${totalMinutes}分`
        : `${items.length}件`;

    const list = document.getElementById('schedule-day-list');

    if (items.length === 0) {
        list.innerHTML = '<div class="schedule-empty">この日の訪問予定はありません</div>';
        return;
    }

    list.innerHTML = items.map((plan, index) => {
        const meta = [];
        if (plan.duration) meta.push(`${escapeHtml(plan.duration)}分`);
        if (plan.note) meta.push(escapeHtml(plan.note));
        const metaHtml = meta.length
            ? `<span class="schedule-card-meta">${meta.join('　')}</span>`
            : '';

        return `<button type="button" class="schedule-card" onclick="openScheduleEntry(${index})">
                    <span class="schedule-card-time">${escapeHtml(plan.time || '--:--')}</span>
                    <span class="schedule-card-body">
                        <span class="schedule-card-name">${escapeHtml(plan.name)}</span>
                        ${metaHtml}
                    </span>
                </button>`;
    }).join('');
}

/**
 * 週表示。月〜日を縦に積む（横スクロールはさせない）。
 */
function renderScheduleWeek(plans, staff) {
    const weekPlans = plans.filter(plan => plan.staff === staff);
    const todayIndex = getTodayScheduleDayIndex();
    const flat = [];

    const html = SCHEDULE_DAYS.map((day, dayIndex) => {
        const items = sortSchedulePlans(weekPlans.filter(plan => plan.day === day));
        const todayClass = dayIndex === todayIndex ? ' is-today' : '';

        const body = items.length === 0
            ? '<div class="schedule-week-empty">予定なし</div>'
            : items.map(plan => {
                // 日表示と同じ番号で引けるよう、出した順に詰めていく
                const index = flat.push(plan) - 1;
                const duration = plan.duration
                    ? `<span class="schedule-week-duration">${escapeHtml(plan.duration)}分</span>`
                    : '';
                return `<button type="button" class="schedule-week-item" onclick="openScheduleEntry(${index})">
                            <span class="schedule-week-time">${escapeHtml(plan.time || '--:--')}</span>
                            <span class="schedule-week-name">${escapeHtml(plan.name)}</span>
                            ${duration}
                        </button>`;
            }).join('');

        return `<div class="schedule-week-day${todayClass}">
                    <div class="schedule-week-head">
                        <span>${day}曜日</span>
                        <span class="schedule-week-count">${items.length}件</span>
                    </div>
                    ${body}
                </div>`;
    }).join('');

    document.getElementById('schedule-week-list').innerHTML = html;
    scheduleVisiblePlans = flat;

    document.getElementById('schedule-summary').textContent = `週合計 ${weekPlans.length}件`;
}

function changeScheduleDay(delta) {
    // 月〜日を循環（月の前は日）
    scheduleDayIndex = (scheduleDayIndex + delta + SCHEDULE_DAYS.length) % SCHEDULE_DAYS.length;
    renderScheduleScreen();
}

function showScheduleMode(mode) {
    scheduleMode = mode;
    renderScheduleScreen();
}

function onScheduleStaffChange() {
    // 次に開いた時に操作なしで同じ人が出るよう覚えておく
    saveScheduleStaff(document.getElementById('schedule-staff').value);
    renderScheduleScreen();
}

/**
 * 予定のカードから施術記録の入力へ。
 * 予定を見てそのまま記録に進めるよう、患者・施術者・今日の日付を入れた枠を足す。
 */
function openScheduleEntry(index) {
    const plan = scheduleVisiblePlans[index];
    if (!plan) return;

    const staff = document.getElementById('schedule-staff').value;

    showScreen('treatment');

    // 予定は曜日しか持たないので、記録の日付は「今日」にする
    document.getElementById('treatment-date').value = getToday();

    const staffSelect = document.getElementById('treatment-staff');
    const hasStaffOption = Array.prototype.some.call(
        staffSelect.options, option => option.value === staff
    );
    if (hasStaffOption) {
        staffSelect.value = staff;
    }

    // 空の枠が1つだけなら、それを予定で置き換える
    const entries = document.querySelectorAll('#treatment-batch-list .batch-entry');
    if (entries.length === 1 && !entries[0].querySelector('.entry-patient').value) {
        entries[0].remove();
    }

    // 「佐藤精次 / 髙橋 伊三郎」のように1件に複数人入っている場合は分けて追加する
    let unmatchedCount = 0;
    splitScheduleNames(plan.name).forEach(rawName => {
        const matched = findPatientByName(rawName);
        if (!matched) unmatchedCount++;
        addTreatmentEntry(matched, '', plan.time, {
            unmatchedName: matched ? '' : rawName,
            duration: plan.duration,
            note: plan.note
        });
    });

    autoSaveTreatmentDraft();

    const list = document.getElementById('treatment-batch-list');
    if (list.lastElementChild) {
        list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (unmatchedCount > 0) {
        showToast('患者リストに一致する名前がありません。選び直してください', 4000);
    }
}

function setupScheduleScreen() {
    document.getElementById('btn-schedule-prev-day').addEventListener('click', () => changeScheduleDay(-1));
    document.getElementById('btn-schedule-next-day').addEventListener('click', () => changeScheduleDay(1));
    document.getElementById('schedule-staff').addEventListener('change', onScheduleStaffChange);
    document.getElementById('tab-schedule-day').addEventListener('click', () => showScheduleMode('day'));
    document.getElementById('tab-schedule-week').addEventListener('click', () => showScheduleMode('week'));
    document.getElementById('btn-refresh-schedule').addEventListener('click', refreshVisitPlans);
    document.getElementById('btn-back-schedule').addEventListener('click', () => {
        showScreen('home');
    });
}

// =============================================
// 宛名ラベル印刷画面
// =============================================

// タブの並び。オーナー指示で医師・ケアマネを先に、患者を最後にする
const LABEL_TABS = [
    { key: 'doctor', label: '医師' },
    { key: 'careManager', label: 'ケアマネ' },
    { key: 'patient', label: '患者' }
];

// A-one 72424（A4・24面・3列×8段）の1枚あたりの面数
const LABELS_PER_SHEET = 24;

let labelTab = 'doctor';
let labelTargets = { doctor: [], careManager: [], patient: [] };
// 取得を試したかどうか（キャッシュが空でも取得は1回だけにする）
let labelFetchTried = false;

/**
 * 住所を「〒343-0817」と「埼玉県越谷市…」の2行に分ける。
 * 住所は郵便番号込みの1つのテキストで入っているため、郵便番号の後ろで切る。
 * 郵便番号が入っていない住所はそのまま1行で返す。
 */
function splitAddressLines(address) {
    const text = String(address == null ? '' : address).replace(/\s+/g, ' ').trim();
    if (!text) return { postal: '', rest: '' };

    // 〒があればハイフン無し（〒3430845）でも拾う。
    // 〒が無い住所は、頭が「343-0817 …」の形のときだけ郵便番号とみなす
    // （番地の「10-22」を郵便番号と誤認しないよう先頭に限定する）
    const match = text.match(/〒\s*(\d{3})\s*-?\s*(\d{4})\s*(.*)$/)
        || text.match(/^(\d{3})\s*-\s*(\d{4})\s*(.*)$/);
    if (!match) return { postal: '', rest: text };

    return {
        postal: `〒${match[1]}-${match[2]}`,
        rest: match[3].trim()
    };
}

function initLabelScreen() {
    labelTab = 'doctor';
    labelTargets = getLabelTargets();

    // まずキャッシュで描く（待たせない）
    renderLabelScreen();

    // キャッシュが空のときだけ取りに行く
    if (getLabelTabTargets('doctor').length === 0) {
        loadLabelTargetsIfEmpty();
    }
}

function getLabelTabTargets(tab) {
    return labelTargets[tab] || [];
}

/**
 * キャッシュが空の場合の初回取得。何度も叩かないよう1回だけ試す。
 */
async function loadLabelTargetsIfEmpty() {
    if (labelFetchTried) return;
    labelFetchTried = true;

    try {
        showLoading('宛先を取得中...');
        labelTargets = await fetchLabelTargetsFromNotion();
        renderLabelScreen();
    } catch (error) {
        console.error('Load label targets failed:', error);
        showError('宛先の取得に失敗しました');
    } finally {
        hideLoading();
    }
}

/**
 * Notionから取り直して描き直す（「最新に更新」）
 */
async function refreshLabelTargets() {
    try {
        showLoading('宛先を取得中...');

        // 取り直す前に、選ばれている宛先を名前で覚えておく。
        // 24件積み上げた後に押しても選択が消えないようにするため。
        const checkedNames = {};
        LABEL_TABS.forEach(tab => {
            checkedNames[tab.key] = getLabelTabTargets(tab.key)
                .filter(t => t.checked)
                .map(t => t.name);
        });

        labelTargets = await fetchLabelTargetsFromNotion();

        // 取り直した宛先に選択を戻す（消えた宛先は自然に落ちる）
        let restored = 0;
        LABEL_TABS.forEach(tab => {
            const names = checkedNames[tab.key] || [];
            if (names.length === 0) return;
            getLabelTabTargets(tab.key).forEach(target => {
                if (names.indexOf(target.name) !== -1 && target.address) {
                    target.checked = true;
                    restored += 1;
                }
            });
        });
        saveLabelTargets(labelTargets);

        hideLoading();
        renderLabelScreen();
        const loaded = LABEL_TABS
            .reduce((sum, tab) => sum + getLabelTabTargets(tab.key).length, 0);
        showToast(restored > 0
            ? `宛先を${loaded}件読み込みました（選択${restored}件は維持）`
            : `宛先を${loaded}件読み込みました`);
    } catch (error) {
        hideLoading();
        console.error('Refresh label targets failed:', error);
        showError('宛先の取得に失敗しました');
    }
}

/**
 * 画面全体を描き直す（タブ・チェックのどれが変わってもここを通す）
 */
function renderLabelScreen() {
    document.querySelectorAll('#label-print .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-label-${labelTab}`).classList.add('active');

    renderLabelList();
    renderLabelSummary();
    renderLabelSheet();
}

/**
 * 宛先の一覧（チェックボックス付き）。住所が無い人は選べないようにする。
 */
function renderLabelList() {
    const targets = getLabelTabTargets(labelTab);
    const list = document.getElementById('label-list');

    if (targets.length === 0) {
        list.innerHTML = '<div class="label-empty">宛先がありません。「最新に更新」を押してください</div>';
        return;
    }

    list.innerHTML = targets.map((target, index) => {
        const hasAddress = !!target.address;
        const note = hasAddress
            ? escapeHtml([target.org, target.address].filter(Boolean).join('　'))
            : '住所未登録';
        const noteClass = hasAddress ? 'label-item-note' : 'label-item-note is-missing';

        return `<label class="label-item${hasAddress ? '' : ' is-disabled'}">
                    <input type="checkbox" ${hasAddress && target.checked ? 'checked' : ''}
                        ${hasAddress ? '' : 'disabled'}
                        onchange="toggleLabelTarget(${index}, this.checked)">
                    <span class="label-item-body">
                        <span class="label-item-name">${escapeHtml(target.name)}</span>
                        <span class="${noteClass}">${note}</span>
                    </span>
                </label>`;
    }).join('');
}

/**
 * 選択件数と必要シート数（24面で1枚）。
 * タブを跨いで積み上がるので、内訳と合計の両方を出す。
 */
function renderLabelSummary() {
    const counts = getLabelSelectionCounts();
    const total = getSelectedLabelTargets().length;
    const sheets = Math.ceil(total / LABELS_PER_SHEET);

    const breakdown = LABEL_TABS
        .map(tab => `${tab.label}${counts[tab.key]}件`)
        .join(' / ');

    document.getElementById('label-summary').textContent =
        `${breakdown} → 合計${total}件・${sheets}シート`;
}

/**
 * 種別ごとの選択件数
 */
function getLabelSelectionCounts() {
    const counts = {};
    LABEL_TABS.forEach(tab => {
        counts[tab.key] = getLabelTabTargets(tab.key)
            .filter(target => target.checked && target.address).length;
    });
    return counts;
}

/**
 * 選択中の宛先を3種別まとめて返す。
 * 今開いているタブに関係なく、医師 → ケアマネ → 患者 の順に並べる
 * （LABEL_TABS の並び順がそのまま印刷順になる）。
 * 住所が無い人は選べないが、念のためここでも外す。
 */
function getSelectedLabelTargets() {
    const selected = [];
    LABEL_TABS.forEach(tab => {
        getLabelTabTargets(tab.key).forEach(target => {
            if (target.checked && target.address) selected.push(target);
        });
    });
    return selected;
}

/**
 * 印刷される中身そのものを組む。画面ではこれを縮小プレビューとして見せ、
 * 印刷時は @media print でmm指定のラベル面付けに切り替わる。
 */
function renderLabelSheet() {
    const targets = getSelectedLabelTargets();
    const sheet = document.getElementById('label-sheet');

    if (targets.length === 0) {
        sheet.innerHTML = '<div class="label-empty">宛先を選ぶとここに並びます</div>';
        return;
    }

    // 24面ごとに1ページ。9件目からは自動で次ページに送られる
    const pages = [];
    for (let i = 0; i < targets.length; i += LABELS_PER_SHEET) {
        const cells = targets.slice(i, i + LABELS_PER_SHEET)
            .map(buildLabelCellHtml)
            .join('');
        pages.push(`<div class="label-page"><div class="label-grid">${cells}</div></div>`);
    }

    sheet.innerHTML = pages.join('');
}

// 敬称は種別で決まる。取得時にも suffix を入れているが、
// 古いキャッシュ（ケアマネが「様」のまま）でも正しく出るよう種別を優先する。
const LABEL_SUFFIX_BY_KIND = {
    doctor: ' 先生 御侍史',
    careManager: ' ケアマネジャー様',
    patient: ' 様'
};

function getLabelSuffix(target) {
    if (!target) return ' 様';
    return LABEL_SUFFIX_BY_KIND[target.kind] || target.suffix || ' 様';
}

/**
 * ラベル1片の中身。名前の行だけ大きくする（医師は「先生 御侍史」付き）。
 */
function buildLabelCellHtml(target) {
    const address = splitAddressLines(target.address);

    const addressLines = [];
    if (address.postal) {
        addressLines.push(`<span class="label-address-line">${escapeHtml(address.postal)}</span>`);
    }
    if (address.rest) {
        addressLines.push(`<span class="label-address-line">${escapeHtml(address.rest)}</span>`);
    }

    const org = target.org
        ? `<div class="label-org">${escapeHtml(target.org)}</div>`
        : '';

    return `<div class="label-cell">
                <div class="label-address">${addressLines.join('')}</div>
                ${org}
                <div class="label-name">　${escapeHtml(target.name)}${escapeHtml(getLabelSuffix(target))}</div>
            </div>`;
}

function toggleLabelTarget(index, checked) {
    const target = getLabelTabTargets(labelTab)[index];
    if (!target) return;

    target.checked = checked;
    saveLabelTargets(labelTargets);

    // 一覧は触らずに済むので、件数とプレビューだけ描き直す
    renderLabelSummary();
    renderLabelSheet();
}

/**
 * 全選択 / 全解除。今開いているタブにだけ効かせる。
 * （他のタブで選んだ分を巻き込まないこと。まとめて外したいときは
 *  clearAllLabelChecks の「すべての選択を解除」を使う）
 * 住所が無い人は選択対象にしない。
 */
function setAllLabelChecks(checked) {
    getLabelTabTargets(labelTab).forEach(target => {
        target.checked = checked && !!target.address;
    });
    saveLabelTargets(labelTargets);
    renderLabelScreen();
}

/**
 * 3種別すべての選択を解除する
 */
function clearAllLabelChecks() {
    LABEL_TABS.forEach(tab => {
        getLabelTabTargets(tab.key).forEach(target => {
            target.checked = false;
        });
    });
    saveLabelTargets(labelTargets);
    renderLabelScreen();
    showToast('すべての選択を解除しました');
}

function showLabelTab(tab) {
    labelTab = tab;
    renderLabelScreen();
}

/**
 * 位置合わせ用の枠線。試し刷りのときだけ枠を出して紙とのズレを見る。
 */
function toggleLabelFrame() {
    const sheet = document.getElementById('label-sheet');
    const on = sheet.classList.toggle('is-debug');
    showToast(on ? '枠線ありで印刷します' : '枠線なしで印刷します');
}

function printLabels() {
    const targets = getSelectedLabelTargets();

    if (targets.length === 0) {
        showError('印刷する宛先を選んでください');
        return;
    }

    renderLabelSheet();
    window.print();
}

function setupLabelScreen() {
    LABEL_TABS.forEach(tab => {
        document.getElementById(`tab-label-${tab.key}`)
            .addEventListener('click', () => showLabelTab(tab.key));
    });

    document.getElementById('btn-label-select-all').addEventListener('click', () => setAllLabelChecks(true));
    document.getElementById('btn-label-clear-all').addEventListener('click', () => setAllLabelChecks(false));
    document.getElementById('btn-label-clear-every').addEventListener('click', clearAllLabelChecks);
    document.getElementById('btn-label-frame').addEventListener('click', toggleLabelFrame);
    document.getElementById('btn-label-print').addEventListener('click', printLabels);
    document.getElementById('btn-refresh-labels').addEventListener('click', refreshLabelTargets);
    document.getElementById('btn-back-label').addEventListener('click', () => {
        showScreen('home');
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
    document.getElementById('setting-notion-visit-plan-db').value = getNotionVisitPlanDb();
    document.getElementById('setting-notion-care-manager-db').value = getNotionCareManagerDb();
    document.getElementById('setting-gas-spreadsheet-url').value = getGasSpreadsheetUrl();
    document.getElementById('setting-gas-api-url').value = getGasApiUrl();
    document.getElementById('setting-gas-schedule-url').value = getGasScheduleUrl();
    document.getElementById('setting-app-token').value = getAppToken();
    updateSyncBadge();
}

function saveSettings() {
    const notionApiKey = document.getElementById('setting-notion-api-key').value;
    const notionPatientDb = document.getElementById('setting-notion-patient-db').value;
    const notionVisitPlanDb = document.getElementById('setting-notion-visit-plan-db').value.trim();
    const notionCareManagerDb = document.getElementById('setting-notion-care-manager-db').value;
    const gasSpreadsheetUrl = document.getElementById('setting-gas-spreadsheet-url').value;
    const gasApiUrl = document.getElementById('setting-gas-api-url').value;
    const gasScheduleUrl = document.getElementById('setting-gas-schedule-url').value;
    const appToken = document.getElementById('setting-app-token').value;

    saveNotionApiKey(notionApiKey);
    saveNotionPatientDb(notionPatientDb);
    saveNotionVisitPlanDb(notionVisitPlanDb);
    saveNotionCareManagerDb(notionCareManagerDb);
    saveGasSpreadsheetUrl(gasSpreadsheetUrl);
    saveGasApiUrl(gasApiUrl);
    saveGasScheduleUrl(gasScheduleUrl);
    saveAppToken(appToken);

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
    // 保存前でも試せるよう、入力欄の値をそのまま使う
    const url = document.getElementById('setting-gas-api-url').value.trim();

    if (!url) {
        showError('Apps Script URLを入力してください');
        return;
    }

    try {
        showLoading('接続テスト中...');
        const result = await testGasConnection(url);
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

    // 訪問予定（患者リレーションを名前に直すため、患者リストの後に取得する）
    try {
        if (getNotionVisitPlanDb()) {
            await fetchVisitPlansFromNotion();
        } else {
            await fetchSchedulesFromGas();
        }
    } catch (e) {
        console.warn('Schedule reload failed:', e);
        failed.push('訪問予定');
    }

    hideLoading();

    if (failed.length === 0) {
        showToast('各種データを更新しました');
    } else {
        showError(`${failed.join('・')}の取得に失敗しました`);
    }
}

// === 設定の共有 ===

function togglePanel(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
}

/**
 * 今の設定をパスワード付きのコードにする
 */
async function exportConfig() {
    if (!getGasApiUrl()) {
        showError('先に設定を保存してください');
        return;
    }

    const password = prompt('設定コードを開くためのパスワードを決めてください:');
    if (password === null || password === '') return;

    const confirmation = prompt('確認のため、もう一度同じパスワードを入力してください:');
    if (confirmation !== password) {
        showError('パスワードが一致しません');
        return;
    }

    try {
        showLoading('設定コードを作成中...');
        const code = await encodeConfigBundle(collectShareableSettings(), password);
        hideLoading();

        document.getElementById('config-export-code').value = code;
        togglePanel('config-export-panel', true);
        togglePanel('config-import-panel', false);
        showToast('設定コードを作成しました', 3000);
    } catch (error) {
        hideLoading();
        console.error('Export config failed:', error);
        showError(error.message || '設定コードの作成に失敗しました');
    }
}

async function copyToClipboard(text, message) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(message);
    } catch (e) {
        // クリップボードが使えない場合は選択状態にして手動コピーしてもらう
        const area = document.getElementById('config-export-code');
        area.focus();
        area.select();
        showToast('コピーできませんでした。長押しでコピーしてください', 4000);
    }
}

function copyConfigCode() {
    const code = document.getElementById('config-export-code').value;
    if (code) copyToClipboard(code, 'コードをコピーしました');
}

function copyConfigLink() {
    const code = document.getElementById('config-export-code').value;
    if (code) copyToClipboard(buildConfigShareLink(code), 'リンクをコピーしました');
}

/**
 * 受け取ったコードから設定を反映する
 */
async function applyConfigCode() {
    const code = document.getElementById('config-import-code').value.trim();
    const password = document.getElementById('config-import-password').value;

    if (!code) {
        showError('設定コードを貼り付けてください');
        return;
    }
    if (!password) {
        showError('パスワードを入力してください');
        return;
    }

    try {
        showLoading('設定を読み込み中...');
        const settings = await decodeConfigBundle(code, password);
        applyShareableSettings(settings);
        hideLoading();

        document.getElementById('config-import-code').value = '';
        document.getElementById('config-import-password').value = '';
        togglePanel('config-import-panel', false);

        initSettingsScreen();
        showToast('設定を読み込みました', 3000);

        // 反映した設定で各種データを取り直す
        await reloadPatients();
    } catch (error) {
        hideLoading();
        console.error('Apply config failed:', error);
        showError(error.message || '設定の読み込みに失敗しました');
    }
}

/**
 * リンク経由で開かれた場合、読み込み欄にコードを入れて設定画面を出す
 */
function handleSharedConfigLink() {
    const code = takeConfigCodeFromUrl();
    if (!code) return;

    showScreen('settings');
    document.getElementById('config-import-code').value = code;
    togglePanel('config-import-panel', true);
    document.getElementById('config-import-panel').scrollIntoView({ behavior: 'smooth' });
    showToast('パスワードを入力して設定を読み込んでください', 5000);
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
    document.getElementById('btn-export-config').addEventListener('click', exportConfig);
    document.getElementById('btn-copy-config-code').addEventListener('click', copyConfigCode);
    document.getElementById('btn-copy-config-link').addEventListener('click', copyConfigLink);
    document.getElementById('btn-apply-config').addEventListener('click', applyConfigCode);
    document.getElementById('btn-show-import-config').addEventListener('click', () => {
        const panel = document.getElementById('config-import-panel');
        const willShow = panel.classList.contains('hidden');
        togglePanel('config-import-panel', willShow);
        togglePanel('config-export-panel', false);
    });
    document.getElementById('btn-back-settings').addEventListener('click', () => {
        showScreen('home');
    });
}

// === 初期化 ===

function initUI() {
    setupHomeScreen();
    setupTreatmentScreen();
    setupScheduleScreen();
    setupLabelScreen();
    setupSalesScreen();
    setupViewScreen();
    setupSettingsScreen();
}
