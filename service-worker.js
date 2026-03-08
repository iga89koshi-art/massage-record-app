const CACHE_NAME = 'massage-record-v4';
const urlsToCache = [
    './',
    './index.html',
    './styles/main.css',
    './js/app.js',
    './js/api.js',
    './js/storage.js',
    './js/ui.js',
    './js/utils.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ネットワーク優先、フォールバックでキャッシュ
self.addEventListener('fetch', event => {
    // POST リクエストはキャッシュしない
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // レスポンスをキャッシュに保存
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseToCache));
                return response;
            })
            .catch(() => {
                // ネットワークエラー時はキャッシュから返す
                return caches.match(event.request);
            })
    );
});

// バックグラウンド同期（将来的な拡張用）
self.addEventListener('sync', event => {
    if (event.tag === 'sync-records') {
        event.waitUntil(syncRecords());
    }
});

async function syncRecords() {
    // オフラインキューの同期処理
    // 実装は app.js 側で管理
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_QUEUE' });
    });
}
