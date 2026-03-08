// localStorage管理

const STORAGE_KEYS = {
    PATIENTS: 'patients',
    STAFF: 'staff',
    PASSWORD: 'sales_password',
    NOTION_API_KEY: 'notion_api_key',
    NOTION_PATIENT_DB: 'notion_patient_db',
    NOTION_CARE_MANAGER_DB: 'notion_care_manager_db',
    GAS_SPREADSHEET_URL: 'gas_spreadsheet_url',
    GAS_API_URL: 'gas_api_url',
    OFFLINE_QUEUE: 'offline_queue'
};

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
    return staff.filter(s => s.type && s.type.includes('施術'));
}

function getSalesStaff() {
    const staff = getStaff();
    return staff.filter(s => s.type && s.type.includes('営業'));
}

// === パスワード ===

function savePassword(password) {
    const encrypted = encrypt(password);
    return saveToStorage(STORAGE_KEYS.PASSWORD, encrypted);
}

function getPassword() {
    const encrypted = getFromStorage(STORAGE_KEYS.PASSWORD);
    if (!encrypted) {
        // デフォルトパスワード
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

function clearOfflineQueue() {
    return saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
}

// === キャッシュ管理 ===

function clearCache() {
    removeFromStorage(STORAGE_KEYS.PATIENTS);
    removeFromStorage(STORAGE_KEYS.STAFF);
    showToast('キャッシュをクリアしました');
}
