// 院の設定をまとめて他の端末へ渡すための書き出し・読み込み
//
// 設定一式（NotionのAPIキーやURL）をパスワードで暗号化して1つの文字列にする。
// コードだけが漏れてもパスワードが無ければ中身は開けない。

const CONFIG_SHARE_VERSION = 1;
const CONFIG_SHARE_ITERATIONS = 200000;

/**
 * 共有する設定を集める
 */
function collectShareableSettings() {
    return {
        notionApiKey: getNotionApiKey(),
        notionPatientDb: getNotionPatientDb(),
        notionVisitPlanDb: getNotionVisitPlanDb(),
        notionCareManagerDb: getNotionCareManagerDb(),
        gasSpreadsheetUrl: getGasSpreadsheetUrl(),
        gasApiUrl: getGasApiUrl(),
        gasScheduleUrl: getGasScheduleUrl(),
        salesPassword: getPassword(),
        appToken: getAppToken(),
        // 端末の役割もコードに入れる。スタッフ用として作ったコードを読み込んだ端末は
        // アプリ側から役割を変えられなくなる（applyShareableSettings で鍵をかける）。
        role: getRole(),
        staffName: getStaffName()
    };
}

/**
 * 読み込んだ設定を反映する。含まれていない項目は触らない。
 */
function applyShareableSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        throw new Error('設定の形式が正しくありません');
    }

    const apply = (value, setter) => {
        if (typeof value === 'string') setter(value);
    };

    apply(settings.notionApiKey, saveNotionApiKey);
    apply(settings.notionPatientDb, saveNotionPatientDb);
    apply(settings.notionVisitPlanDb, saveNotionVisitPlanDb);
    apply(settings.notionCareManagerDb, saveNotionCareManagerDb);
    apply(settings.gasSpreadsheetUrl, saveGasSpreadsheetUrl);
    apply(settings.gasApiUrl, saveGasApiUrl);
    apply(settings.gasScheduleUrl, saveGasScheduleUrl);
    apply(settings.salesPassword, savePassword);
    apply(settings.appToken, saveAppToken);

    // 役割は入っているときだけ触る。
    // roleが無い古い設定コードを読んでも、今の端末の役割（既定はオーナー）のまま。
    if (typeof settings.role === 'string' && settings.role) {
        saveRole(settings.role);
        apply(settings.staffName, saveStaffName);
        // スタッフ用として配った端末では設定画面から役割を変えられなくする
        saveRoleLocked(settings.role === ROLE_STAFF);
    }
}

// === 文字列とバイト列の変換 ===

function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toBase64Url(text) {
    return btoa(unescape(encodeURIComponent(text)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function fromBase64Url(text) {
    let s = String(text || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    return decodeURIComponent(escape(atob(s)));
}

/**
 * パスワードから暗号鍵を作る
 */
async function deriveConfigKey(passphrase, salt) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error('この環境では設定の暗号化が使えません（https でお試しください）');
    }

    const baseKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: CONFIG_SHARE_ITERATIONS, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * 設定を暗号化して1つの文字列にする
 */
async function encodeConfigBundle(settings, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveConfigKey(passphrase, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        new TextEncoder().encode(JSON.stringify(settings))
    );

    const payload = {
        v: CONFIG_SHARE_VERSION,
        s: bytesToBase64(salt),
        i: bytesToBase64(iv),
        d: bytesToBase64(new Uint8Array(encrypted))
    };

    return toBase64Url(JSON.stringify(payload));
}

/**
 * 設定コードを復号する。パスワード違いはここで弾かれる。
 */
async function decodeConfigBundle(code, passphrase) {
    let payload;

    try {
        payload = JSON.parse(fromBase64Url(code));
    } catch (e) {
        throw new Error('設定コードの形式が正しくありません');
    }

    if (!payload || payload.v !== CONFIG_SHARE_VERSION) {
        throw new Error('対応していない設定コードです');
    }

    const key = await deriveConfigKey(passphrase, base64ToBytes(payload.s));

    let decrypted;
    try {
        decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(payload.i) },
            key,
            base64ToBytes(payload.d)
        );
    } catch (e) {
        // 復号失敗＝パスワード違い、またはコードが壊れている
        throw new Error('パスワードが違うか、設定コードが壊れています');
    }

    return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * 設定コードから共有用リンクを組み立てる
 */
function buildConfigShareLink(code) {
    return `${location.origin}${location.pathname}#config=${code}`;
}

/**
 * URLに設定コードが付いていれば取り出す（取り出したらURLからは消す）
 */
function takeConfigCodeFromUrl() {
    const match = String(location.hash || '').match(/[#&]config=([^&]+)/);
    if (!match) return '';

    history.replaceState(null, '', location.pathname + location.search);
    return match[1];
}
