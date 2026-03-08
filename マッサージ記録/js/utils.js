// ユーティリティ関数

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 今日の日付を取得
 */
function getToday() {
    return formatDate(new Date());
}

/**
 * 日本語ソート（あいうえお順）
 */
function sortJapanese(array, key) {
    return array.sort((a, b) => {
        const aVal = key ? a[key] : a;
        const bVal = key ? b[key] : b;
        return aVal.localeCompare(bVal, 'ja');
    });
}

/**
 * 簡易暗号化（XOR + Base64）
 */
function encrypt(text, key = 'massage-app-key') {
    try {
        const encoded = btoa(unescape(encodeURIComponent(text)));
        const encrypted = encoded.split('').map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join('');
        return btoa(encrypted);
    } catch (e) {
        console.error('Encryption error:', e);
        return text;
    }
}

/**
 * 復号化
 */
function decrypt(encrypted, key = 'massage-app-key') {
    try {
        const decoded = atob(encrypted);
        const decrypted = decoded.split('').map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join('');
        return decodeURIComponent(escape(atob(decrypted)));
    } catch (e) {
        console.error('Decryption error:', e);
        return encrypted;
    }
}

/**
 * タイムスタンプ生成
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * 期間フィルター用の日付範囲を取得
 */
function getDateRange(period) {
    const today = new Date();
    const start = new Date();

    switch (period) {
        case 'thisMonth':
            start.setDate(1);
            break;
        case 'lastMonth':
            start.setMonth(start.getMonth() - 1);
            start.setDate(1);
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
            return { start: formatDate(start), end: formatDate(end) };
        case 'last3Months':
            start.setMonth(start.getMonth() - 3);
            break;
        case 'all':
            return { start: '2000-01-01', end: '2099-12-31' };
        default:
            start.setDate(1);
    }

    return { start: formatDate(start), end: formatDate(today) };
}

/**
 * UUIDv4生成
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * ローディング表示
 */
function showLoading(message = '処理中...') {
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    if (loader) {
        loaderText.textContent = message;
        loader.classList.add('active');
    }
}

/**
 * ローディング非表示
 */
function hideLoading() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('active');
    }
}

/**
 * トースト通知
 */
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

/**
 * 確認ダイアログ
 */
function confirm(message) {
    return window.confirm(message);
}

/**
 * エラー表示
 */
function showError(message) {
    showToast(`エラー: ${message}`, 3000);
    console.error(message);
}
