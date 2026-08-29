// localStorage管理

const STORAGE_KEYS = {
    PATIENTS: 'patients',
    STAFF: 'staff',
    PASSWORD: 'sales_password',
    NOTION_API_KEY: 'notion_api_key',
    NOTION_PATIENT_DB: 'notion_patient_db',
    NOTION_CARE_MANAGER_DB: 'notion_care_manager_db',
    NOTION_VISIT_PLAN_DB: 'notion_visit_plan_db',
    GAS_SPREADSHEET_URL: 'gas_spreadsheet_url',
    GAS_API_URL: 'gas_api_url',
    GAS_SCHEDULE_URL: 'gas_schedule_url',
    APP_TOKEN: 'app_token',
    OFFLINE_QUEUE: 'offline_queue',
    TREATMENT_DRAFT: 'treatment_draft',
    SCHEDULES: 'basic_schedules',
    VISIT_PLANS: 'visit_plans',
    VISIT_PLANS_FETCHED_AT: 'visit_plans_fetched_at',
    SERVICE_PLANS: 'service_plans',
    INSTRUCTIONS: 'instructions',
    SCHEDULE_STAFF: 'schedule_staff',
    LABEL_TARGETS: 'label_targets',
    ROLE: 'device_role',
    STAFF_NAME: 'device_staff_name',
    ROLE_LOCKED: 'device_role_locked'
};

// この端末の役割。'owner' は今まで通り全部見える端末、
// 'staff' は自分の担当分だけが見える端末。
const ROLE_OWNER = 'owner';
const ROLE_STAFF = 'staff';

/**
 * localStorage保存
 */
function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('Storage save error:', e);
        return false;
    }
}

/**
 * localStorage取得
 */
function getFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Storage get error:', e);
        return defaultValue;
    }
}

/**
 * localStorage削除
 */
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error('Storage remove error:', e);
        return false;
    }
}

/**
 * 全データクリア
 */
function clearAllStorage() {
    try {
        localStorage.clear();
        return true;
    } catch (e) {
        console.error('Storage clear error:', e);
        return false;
    }
}

// === 患者データ ===

/**
 * 患者1件の形：
 * { id, name, reading, baseParts: [部位...], baseTreatments: [施術内容...] }
 * baseParts / baseTreatments はNotion患者DBの「基本施術部位」「基本施術内容」で、
 * 施術録画面のチェックの既定値に使う（通信せずここから引く）。
 */
function savePatients(patients) {
    return saveToStorage(STORAGE_KEYS.PATIENTS, patients);
}

function getPatients() {
    return getFromStorage(STORAGE_KEYS.PATIENTS, []);
}

// === 担当者データ ===

function saveStaff(staff) {
    return saveToStorage(STORAGE_KEYS.STAFF, staff);
}

function getStaff() {
    return getFromStorage(STORAGE_KEYS.STAFF, []);
}

function getTreatmentStaff() {
    const staff = getStaff();
    const treatmentStaff = staff.filter(s => s.type && s.type.includes('施術'));
    // 種別が実データと噛み合わずフィルタが空になった場合は、絞り込み自体を諦めて全員を出す
    // （「担当者が選べない」より「絞り込みが効かない」方がまだ実害が小さい）
    return treatmentStaff.length > 0 ? treatmentStaff : staff;
}


// === 基本スケジュールデータ ===

function saveSchedules(schedules) {
    return saveToStorage(STORAGE_KEYS.SCHEDULES, schedules);
}

function getSchedules() {
    return getFromStorage(STORAGE_KEYS.SCHEDULES, []);
}

// === 訪問予定（Notion 訪問予定データベース） ===

function saveVisitPlans(plans) {
    return saveToStorage(STORAGE_KEYS.VISIT_PLANS, plans);
}

function getVisitPlans() {
    return getFromStorage(STORAGE_KEYS.VISIT_PLANS, []);
}

// === 他サービス利用予定（Notion 他サービス利用予定データベース） ===

/**
 * 1件の形：
 * { id, patientIds: [...], patientNames: [...], service, office,
 *   days: ['火',...], band, startTime, endTime, frequency, note }
 * 訪問スケジュールの日表示で「その曜日に他サービスが入っているか」を
 * 通信なしで引くために、患者情報画面と共通のキャッシュに置く。
 */
function saveServicePlans(plans) {
    return saveToStorage(STORAGE_KEYS.SERVICE_PLANS, plans);
}

function getServicePlans() {
    return getFromStorage(STORAGE_KEYS.SERVICE_PLANS, []);
}

// === 指示チェックリスト ===

/**
 * 1件の形：
 * { id, createdAt, target, content, due, status, doneBy, doneAt }
 * ホームを開いた瞬間に出したいので、取得済みの分はここに残しておく。
 */
function saveInstructions(list) {
    return saveToStorage(STORAGE_KEYS.INSTRUCTIONS, list);
}

function getInstructionsCache() {
    return getFromStorage(STORAGE_KEYS.INSTRUCTIONS, []);
}

/**
 * 訪問スケジュール画面で最後に選んだ施術者。
 * 施術者は端末ごとにほぼ固定なので、次に開いた時は操作なしで自分の予定が出るようにする。
 * キャッシュではなく画面の設定なので clearCache では消さない。
 */
function saveScheduleStaff(name) {
    return saveToStorage(STORAGE_KEYS.SCHEDULE_STAFF, name);
}

function getScheduleStaff() {
    return getFromStorage(STORAGE_KEYS.SCHEDULE_STAFF, '');
}

// === 宛名ラベルの宛先 ===

/**
 * 宛先1件の形：
 * { id, kind: doctor|careManager|patient, name, reading, org, address, suffix, checked }
 * 医師・ケアマネ・患者をまとめて1つのキーに入れる。
 * checked も一緒に残るので、前回選んだ宛先が次に開いた時も入ったままになる。
 */
function saveLabelTargets(targets) {
    return saveToStorage(STORAGE_KEYS.LABEL_TARGETS, targets);
}

function getLabelTargets() {
    const saved = getFromStorage(STORAGE_KEYS.LABEL_TARGETS, null) || {};
    return {
        doctor: saved.doctor || [],
        careManager: saved.careManager || [],
        patient: saved.patient || []
    };
}

// === 端末の役割（オーナー／スタッフ） ===
//
// 役割の判定はこの getRole() / isStaffDevice() に集約する。
// 画面側で localStorage を直接見たり 'staff' の文字列を比べたりしないこと
// （将来サーバー側で権限を見るようにしたとき、直す場所をここだけにするため）。

/**
 * 役割を保存する。'staff' 以外は全てオーナー扱いにする。
 */
function saveRole(role) {
    return saveToStorage(STORAGE_KEYS.ROLE, role === ROLE_STAFF ? ROLE_STAFF : ROLE_OWNER);
}

/**
 * この端末の役割。未設定の端末（今まで使っていた端末や、
 * roleが入っていない古い設定コードを読んだ端末）は必ずオーナー扱いにする。
 */
function getRole() {
    const saved = getFromStorage(STORAGE_KEYS.ROLE, ROLE_OWNER);
    return saved === ROLE_STAFF ? ROLE_STAFF : ROLE_OWNER;
}

/**
 * スタッフ用端末かどうか。表示の出し分けは全てこれを使う。
 */
function isStaffDevice() {
    return getRole() === ROLE_STAFF;
}

/**
 * スタッフ用端末のときの施術者名（訪問予定DBの「施術担当者」と同じ表記）
 */
function saveStaffName(name) {
    return saveToStorage(STORAGE_KEYS.STAFF_NAME, String(name || ''));
}

function getStaffName() {
    return getFromStorage(STORAGE_KEYS.STAFF_NAME, '') || '';
}

/**
 * 役割が設定コード経由で入ったかどうか。
 * 配布された端末（スタッフ用のコードを読み込んだ端末）では
 * 設定画面から役割を変えられないようにするための鍵。
 * オーナーが自分の端末で手動で切り替えた場合は鍵をかけない（戻せるように）。
 */
function saveRoleLocked(locked) {
    return saveToStorage(STORAGE_KEYS.ROLE_LOCKED, !!locked);
}

function isRoleLocked() {
    return getFromStorage(STORAGE_KEYS.ROLE_LOCKED, false) === true;
}

/**
 * 設定画面に「役割」の選択を出してよいか。
 * オーナー端末なら常に出す。スタッフ端末でも、手動で切り替えただけの
 * 端末（＝オーナー本人の端末）なら戻せるように出す。
 */
function isRoleEditable() {
    return !isStaffDevice() || !isRoleLocked();
}

// === パスワード ===

function savePassword(password) {
    const encrypted = encrypt(password);
    return saveToStorage(STORAGE_KEYS.PASSWORD, encrypted);
}

function getPassword() {
    const encrypted = getFromStorage(STORAGE_KEYS.PASSWORD);
    if (!encrypted) {
        savePassword('0000');
        return '0000';
    }
    return decrypt(encrypted);
}

function verifyPassword(inputPassword) {
    return inputPassword === getPassword();
}

// === API設定 ===

function saveNotionApiKey(apiKey) {
    const encrypted = encrypt(apiKey);
    return saveToStorage(STORAGE_KEYS.NOTION_API_KEY, encrypted);
}

function getNotionApiKey() {
    const encrypted = getFromStorage(STORAGE_KEYS.NOTION_API_KEY);
    return encrypted ? decrypt(encrypted) : '';
}

function saveNotionPatientDb(dbId) {
    return saveToStorage(STORAGE_KEYS.NOTION_PATIENT_DB, dbId);
}

function getNotionPatientDb() {
    return getFromStorage(STORAGE_KEYS.NOTION_PATIENT_DB, '');
}

function saveNotionCareManagerDb(dbId) {
    return saveToStorage(STORAGE_KEYS.NOTION_CARE_MANAGER_DB, dbId);
}

function getNotionCareManagerDb() {
    return getFromStorage(STORAGE_KEYS.NOTION_CARE_MANAGER_DB, '');
}

function saveNotionVisitPlanDb(dbId) {
    return saveToStorage(STORAGE_KEYS.NOTION_VISIT_PLAN_DB, dbId);
}

function getNotionVisitPlanDb() {
    return getFromStorage(STORAGE_KEYS.NOTION_VISIT_PLAN_DB, '');
}

function saveGasSpreadsheetUrl(url) {
    return saveToStorage(STORAGE_KEYS.GAS_SPREADSHEET_URL, url);
}

function getGasSpreadsheetUrl() {
    return getFromStorage(STORAGE_KEYS.GAS_SPREADSHEET_URL, '');
}

function saveGasApiUrl(url) {
    return saveToStorage(STORAGE_KEYS.GAS_API_URL, url);
}

function getGasApiUrl() {
    return getFromStorage(STORAGE_KEYS.GAS_API_URL, '');
}

/**
 * 基本スケジュール専用のGAS URL。
 * スケジュール表が記録用とは別のスプレッドシートにある場合に設定する。
 * 空の場合は記録用と同じURLを使う。
 */
function saveGasScheduleUrl(url) {
    return saveToStorage(STORAGE_KEYS.GAS_SCHEDULE_URL, url);
}

function getGasScheduleUrl() {
    return getFromStorage(STORAGE_KEYS.GAS_SCHEDULE_URL, '');
}

/**
 * バックエンド（GAS）を呼ぶときに一緒に送る合言葉。
 * これが無いと doPost 側で誰でも施術記録・営業記録を読み書きできてしまう。
 */
function saveAppToken(token) {
    const encrypted = encrypt(token);
    return saveToStorage(STORAGE_KEYS.APP_TOKEN, encrypted);
}

function getAppToken() {
    const encrypted = getFromStorage(STORAGE_KEYS.APP_TOKEN);
    return encrypted ? decrypt(encrypted) : '';
}

// === オフラインキュー ===

function addToOfflineQueue(item) {
    const queue = getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
    item.id = generateUUID();
    item.queuedAt = getTimestamp();
    queue.push(item);
    return saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, queue);
}

function getOfflineQueue() {
    return getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
}

function removeFromOfflineQueue(itemId) {
    let queue = getOfflineQueue();
    queue = queue.filter(item => item.id !== itemId);
    return saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, queue);
}

function getOfflineQueueCount() {
    return getOfflineQueue().length;
}

function clearOfflineQueue() {
    return saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
}

// === 一時保存（一括入力用） ===

function saveTreatmentDraft(data) {
    return saveToStorage(STORAGE_KEYS.TREATMENT_DRAFT, data);
}

function getTreatmentDraft() {
    return getFromStorage(STORAGE_KEYS.TREATMENT_DRAFT, null);
}

function clearTreatmentDraft() {
    return removeFromStorage(STORAGE_KEYS.TREATMENT_DRAFT);
}


// === キャッシュ管理 ===

/**
 * 訪問予定を最後にNotionから取れた時刻。
 * 圏外で取り直せなかったときに「いつ時点の表示か」を出すために使う。
 */
function saveVisitPlansFetchedAt(timestamp) {
    return saveToStorage(STORAGE_KEYS.VISIT_PLANS_FETCHED_AT, timestamp);
}

function getVisitPlansFetchedAt() {
    return getFromStorage(STORAGE_KEYS.VISIT_PLANS_FETCHED_AT, '');
}

function clearCache() {
    removeFromStorage(STORAGE_KEYS.PATIENTS);
    removeFromStorage(STORAGE_KEYS.STAFF);
    removeFromStorage(STORAGE_KEYS.SCHEDULES);
    removeFromStorage(STORAGE_KEYS.VISIT_PLANS);
    removeFromStorage(STORAGE_KEYS.VISIT_PLANS_FETCHED_AT);
    removeFromStorage(STORAGE_KEYS.SERVICE_PLANS);
    removeFromStorage(STORAGE_KEYS.INSTRUCTIONS);
    removeFromStorage(STORAGE_KEYS.LABEL_TARGETS);
    showToast('キャッシュをクリアしました');
}
