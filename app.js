/**
 * Massage Record App
 * Handles UI interactions, data management, and syncing.
 */

const APP_CONFIG = {
    STORAGE_KEYS: {
        PATIENTS: 'mr_patients',
        STAFF: 'mr_staff',
        SETTINGS: 'mr_settings',
        QUEUE: 'mr_upload_queue',
        GAS_URL: 'mr_gas_url'
    },
    DEFAULTS: {
        STAFF: ['五十嵐', 'ショル', '小幡', '山崎'],
        PATIENTS: []
    }
};

class App {
    constructor() {
        this.state = {
            currentView: 'input', // 'input' or 'settings'
            patients: [],
            staff: [],
            customFields: []
        };
        this.init();
    }

    init() {
        console.log('App initialized');
        this.loadData();
        this.render();
        this.attachGlobalListeners();
        this.processUploadQueue();

        window.addEventListener('online', () => this.processUploadQueue());
    }

    loadData() {
        // Load Staff
        const storedStaff = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.STAFF);
        this.state.staff = storedStaff ? JSON.parse(storedStaff) : APP_CONFIG.DEFAULTS.STAFF;
        if (!storedStaff) this.saveStaff();

        // Load Patients
        const storedPatients = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PATIENTS);
        this.state.patients = storedPatients ? JSON.parse(storedPatients) : APP_CONFIG.DEFAULTS.PATIENTS;
        this.sortPatients();

        // Load Custom Fields
        const storedFields = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_FIELDS);
        this.state.customFields = storedFields ? JSON.parse(storedFields) : [];
    }

    saveStaff() {
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.STAFF, JSON.stringify(this.state.staff));
    }

    savePatients() {
        this.sortPatients();
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PATIENTS, JSON.stringify(this.state.patients));
    }

    saveCustomFields() {
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_FIELDS, JSON.stringify(this.state.customFields));
    }

    sortPatients() {
        this.state.patients.sort((a, b) => a.localeCompare(b, 'ja'));
    }

    attachGlobalListeners() {
        document.getElementById('menu-btn').addEventListener('click', () => {
            this.state.currentView = this.state.currentView === 'input' ? 'settings' : 'input';
            this.render();
        });
    }

    render() {
        const main = document.getElementById('main-content');
        const menuBtn = document.getElementById('menu-btn');

        main.innerHTML = '';

        if (this.state.currentView === 'input') {
            menuBtn.textContent = '⚙️';
            this.renderInputScreen(main);
        } else {
            menuBtn.textContent = '❌'; // Close icon
            this.renderSettingsScreen(main);
        }
    }

    renderInputScreen(container) {
        const customFieldsHtml = this.state.customFields.map(field => `
            <div class="form-group">
                <label for="custom-${field}">${field}</label>
                <input type="text" name="custom-${field}" id="custom-${field}" placeholder="${field}">
            </div>
        `).join('');

        container.innerHTML = `
            <form id="record-form" class="card">
                <div class="form-group">
                    <label for="date">日付</label>
                    <input type="date" id="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
                </div>
                
                <div class="form-group">
                    <label for="patient">患者名</label>
                    <select id="patient" name="patient" required>
                        <option value="">選択してください</option>
                        ${this.state.patients.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="staff">担当者</label>
                    <select id="staff" name="staff" required>
                        <option value="">選択してください</option>
                        ${this.state.staff.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>

                ${customFieldsHtml}

                <div class="form-group">
                    <label for="memo">メモ</label>
                    <textarea id="memo" name="memo" placeholder="施術内容や特記事項..."></textarea>
                </div>

                <button type="submit" class="primary-btn">記録を保存</button>
            </form>
            <div id="toast" class="toast">保存しました</div>
        `;

        document.getElementById('record-form').addEventListener('submit', (e) => this.handleSubmit(e));
    }

    renderSettingsScreen(container) {
        const gasUrl = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.GAS_URL) || '';

        container.innerHTML = `
            <div class="card">
                <h2>設定</h2>
                
                <div class="form-group" style="margin-top: 20px;">
                    <label>Google Apps Script URL</label>
                    <input type="url" id="gas-url" placeholder="https://script.google.com/..." value="${gasUrl}">
                    <button id="save-url-btn" class="secondary-btn" style="width: 100%; margin-top: 8px;">URLを保存</button>
                </div>

                <div class="form-group">
                    <label>患者リスト管理</label>
                    <div class="list-manager">
                        <input type="text" id="new-patient" placeholder="新しい患者名">
                        <button id="add-patient-btn" class="secondary-btn">追加</button>
                    </div>
                    <ul class="managed-list">
                        ${this.state.patients.map((p, i) => `
                            <li>
                                <span>${p}</span>
                                <button onclick="app.deletePatient(${i})" class="delete-btn">削除</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div class="form-group">
                    <label>担当者リスト管理</label>
                    <div class="list-manager">
                        <input type="text" id="new-staff" placeholder="新しい担当者名">
                        <button id="add-staff-btn" class="secondary-btn">追加</button>
                    </div>
                    <ul class="managed-list">
                        ${this.state.staff.map((s, i) => `
                            <li>
                                <span>${s}</span>
                                <button onclick="app.deleteStaff(${i})" class="delete-btn">削除</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div class="form-group">
                    <label>入力項目カスタマイズ</label>
                    <div class="list-manager">
                        <input type="text" id="new-field" placeholder="項目名（例：交通費）">
                        <button id="add-field-btn" class="secondary-btn">追加</button>
                    </div>
                    <ul class="managed-list">
                        ${this.state.customFields.map((f, i) => `
                            <li>
                                <span>${f}</span>
                                <button onclick="app.deleteCustomField(${i})" class="delete-btn">削除</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;

        // Bind events for Settings
        document.getElementById('save-url-btn').addEventListener('click', () => {
            const url = document.getElementById('gas-url').value;
            localStorage.setItem(APP_CONFIG.STORAGE_KEYS.GAS_URL, url);
            this.showToast('URLを保存しました');
        });

        document.getElementById('add-patient-btn').addEventListener('click', () => this.addPatient());
        document.getElementById('add-staff-btn').addEventListener('click', () => this.addStaff());
        document.getElementById('add-field-btn').addEventListener('click', () => this.addCustomField());
    }

    addPatient() {
        const input = document.getElementById('new-patient');
        const val = input.value.trim();
        if (val && !this.state.patients.includes(val)) {
            this.state.patients.push(val);
            this.savePatients(); // Sorts and saves
            input.value = '';
            this.render(); // Re-render to show updated list
        }
    }

    deletePatient(index) {
        if (confirm(`「${this.state.patients[index]}」を削除しますか？`)) {
            this.state.patients.splice(index, 1);
            this.savePatients();
            this.render();
        }
    }

    addStaff() {
        const input = document.getElementById('new-staff');
        const val = input.value.trim();
        if (val && !this.state.staff.includes(val)) {
            this.state.staff.push(val);
            this.saveStaff();
            input.value = '';
            this.render();
        }
    }

    deleteStaff(index) {
        if (confirm(`「${this.state.staff[index]}」を削除しますか？`)) {
            this.state.staff.splice(index, 1);
            this.saveStaff();
            this.render();
        }
    }

    addCustomField() {
        const input = document.getElementById('new-field');
        const val = input.value.trim();
        if (val && !this.state.customFields.includes(val)) {
            this.state.customFields.push(val);
            this.saveCustomFields();
            input.value = '';
            this.render();
        }
    }

    deleteCustomField(index) {
        if (confirm(`項目「${this.state.customFields[index]}」を削除しますか？`)) {
            this.state.customFields.splice(index, 1);
            this.saveCustomFields();
            this.render();
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const form = e.target;

        // Collect Custom Fields
        const customData = {};
        this.state.customFields.forEach(field => {
            const input = form.querySelector(`[name="custom-${field}"]`);
            if (input) {
                customData[field] = input.value;
            }
        });

        const formData = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            date: form.date.value,
            patient: form.patient.value,
            staff: form.staff.value,
            memo: form.memo.value,
            ...customData
        };

        this.saveToQueue(formData);
        this.showToast('保存しました');

        // Reset form but keep date
        const currentDate = form.date.value;
        form.reset();
        form.date.value = currentDate;

        this.processUploadQueue();
    }

    saveToQueue(data) {
        const queue = JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.QUEUE) || '[]');
        queue.push(data);
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    }

    showToast(message) {
        // Remove existing toast if any
        const existing = document.getElementById('toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.id = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    async processUploadQueue() {
        if (!navigator.onLine) return;

        const url = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.GAS_URL);
        if (!url) return;

        const queue = JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.QUEUE) || '[]');
        if (queue.length === 0) return;

        console.log(`Processing queue: ${queue.length} items to ${url}`);

        // Simple serial upload for now. Could be batched.
        const newQueue = [];
        for (const item of queue) {
            try {
                // Using no-cors mode for simple GAS triggers if opaque response is enough, 
                // BUT for reliability we often want CORS. 
                // GAS default requires redirect following.
                // For simplicity in this demo, we'll assume the GAS is deployed as "Execute as Me" 
                // and "Who has access: Anyone".

                await fetch(url, {
                    method: 'POST',
                    mode: 'no-cors', // Important for simple GAS POSTs without complex CORS setup
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(item)
                });

                // If no-cors, we can't read status, so we assume success if no network error thrown.
                console.log('Uploaded item', item.id);

            } catch (err) {
                console.error('Upload failed for item', item.id, err);
                newQueue.push(item); // Keep in queue
            }
        }

        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.QUEUE, JSON.stringify(newQueue));

        if (queue.length > newQueue.length) {
            console.log('Sync finished. Remaining items:', newQueue.length);
        }
    }
}

// Global App instance for inline event handlers
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
    // Expose for inline onclicks
    window.app = app;
});
