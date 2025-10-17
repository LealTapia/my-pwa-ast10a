const VERSION = 'v1.0.23';
const STATIC_CACHE = `ast-static-${VERSION}`;
const RUNTIME_CACHE = `ast-runtime-${VERSION}`;
const IMAGE_CACHE = `ast-images-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const API_BASE = self.location.origin;

const APP_SHELL = [
    '/index.html',
    '/manifest.json',
    OFFLINE_URL,
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/favicon.ico',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const fresh = await fetch(req, { cache: 'no-store' });
                    return fresh;
                } catch {
                    const offline = await caches.match(OFFLINE_URL);
                    return offline || new Response('Offline', { status: 503 });
                }
            })()
        );
        return;
    }

    if (url.origin === self.location.origin && /\.(?:js|css)$/.test(url.pathname)) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(RUNTIME_CACHE);
                const cached = await cache.match(req);
                const netPromise = fetch(req)
                    .then((res) => {
                        cache.put(req, res.clone());
                        return res;
                    })
                    .catch(() => undefined);
                return cached || netPromise || fetch(req);
            })()
        );
        return;
    }

    if (url.origin === self.location.origin && /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/.test(url.pathname)) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(IMAGE_CACHE);
                const cached = await cache.match(req);
                if (cached) return cached;
                try {
                    const res = await fetch(req);
                    cache.put(req, res.clone());
                    trimCache(IMAGE_CACHE, 60);
                    return res;
                } catch {
                    return new Response('', { status: 504, statusText: 'Image unavailable offline' });
                }
            })()
        );
        return;
    }

    if (req.method === 'GET' && url.origin === self.location.origin) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(RUNTIME_CACHE);
                const cached = await cache.match(req);
                const netPromise = fetch(req)
                    .then((res) => {
                        cache.put(req, res.clone());
                        return res;
                    })
                    .catch(() => undefined);
                return cached || netPromise || new Response('Offline', { status: 503 });
            })()
        );
    }
});

const DB_NAME = 'my-pwa-ast-db';
const TASKS_STORE = 'tasks';
const OUTBOX_STORE = 'outbox';

function swOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}

function swTx(db, storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return { tx, store: tx.objectStore(storeName) };
}

async function swReadOutbox(limit = 50) {
    const db = await swOpenDB();
    const { store } = swTx(db, OUTBOX_STORE, 'readonly');
    const idx = store.index('by_createdAt');
    return new Promise((resolve, reject) => {
        const req = idx.getAll();
        req.onsuccess = () => {
            const all = req.result || [];
            resolve(all.slice(0, limit));
        };
        req.onerror = () => reject(req.error);
    });
}

async function swClearOutboxIds(ids = []) {
    const db = await swOpenDB();
    const { tx, store } = swTx(db, OUTBOX_STORE, 'readwrite');
    await Promise.all(
        ids.map(
            (id) =>
                new Promise((res, rej) => {
                    const r = store.delete(id);
                    r.onsuccess = () => res();
                    r.onerror = () => rej(r.error);
                })
        )
    );
    return new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('abort'));
    });
}

async function swSetTaskRemoteSynced(localId, remoteId) {
    const db = await swOpenDB();
    const { tx, store } = swTx(db, TASKS_STORE, 'readwrite');
    await new Promise((res, rej) => {
        const getReq = store.get(localId);
        getReq.onsuccess = () => {
            const t = getReq.result;
            if (!t) return res();
            t.remoteId = remoteId;
            t.isSynced = true;
            t.updatedAt = Date.now();
            const putReq = store.put(t);
            putReq.onsuccess = () => res();
            putReq.onerror = () => rej(putReq.error);
        };
        getReq.onerror = () => rej(getReq.error);
    });
    await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('abort'));
    });
}

async function processOutbox() {
    const items = await swReadOutbox(50);
    if (!items.length) return;

    const toClear = [];

    for (const it of items) {
        switch (it.op) {
            case 'create': {
                const p = it.payload || {};
                try {
                    const resp = await fetch(`${API_BASE}/api/entries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            title: p.title ?? p.text ?? '',
                            notes: p.notes ?? '',
                            completed: !!p.completed,
                            created_at: p.createdAt,
                            updated_at: p.updatedAt,
                        }),
                    });
                    if (!resp.ok) throw new Error(`POST /api/entries ${resp.status}`);
                    const json = await resp.json();
                    const remoteId = json?.data?.id;
                    if (typeof remoteId === 'number' && typeof p.id === 'number') {
                        await swSetTaskRemoteSynced(p.id, remoteId);
                        toClear.push(it.id);
                    }
                } catch (err) {
                    console.warn('[sync:create] fallo, reintenta luego', err);
                }
                break;
            }

            default:
                break;
        }
    }

    if (toClear.length) await swClearOutboxIds(toClear);

    const clientsList = await self.clients.matchAll();
    for (const c of clientsList) c.postMessage({ type: 'SYNC_DONE' });
}

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-outbox') {
        event.waitUntil(processOutbox());
    }
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'RUN_SYNC_NOW') {
        event.waitUntil?.(processOutbox());
        processOutbox();
    }
});

// --- Utilidad para mostrar notificaciones desde el SW ---
async function swShowNotification(title, options = {}) {
    if (Notification.permission !== 'granted') return; // si no hay permiso, no hace nada
    return self.registration.showNotification(title, {
        body: options.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: options.tag || 'my-pwa-ast',
        data: options.data || {},
        ...options,
    });
}

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { }

    const title = data.title || 'Notificación';
    const options = {
        body: data.body || 'Contenido',
        icon: data.icon || '/icons/icon-192.png',
        data: data.data || {},
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(clients.openWindow(url));
});


// Mensaje para probar notificación "local" desde la página
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
        const { title, options } = event.data;
        event.waitUntil(swShowNotification(title || 'Prueba de notificación', options || { body: 'Desde SW' }));
    }
});
