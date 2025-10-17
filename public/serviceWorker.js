const VERSION = 'v1.0.27';
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

// === Local-only sync (sin servidor): marca como sincronizado y limpia la outbox ===
async function processOutbox() {
    const items = await swReadOutbox(50);
    if (!items.length) return;

    const toClear = [];
    const idsToMark = [];

    for (const it of items) {
        try {
            if (it.op === 'create' && it.payload?.id != null) {
                // Asignamos un remoteId ficticio y marcamos como sincronizada
                const localId = it.payload.id;
                const fakeRemoteId = Date.now(); // cualquier número único
                await swSetTaskRemoteSynced(localId, fakeRemoteId);
                toClear.push(it.id);
            } else if (it.op === 'update' && it.payload?.id != null) {
                // Para updates, basta con marcar la tarea como sincronizada
                idsToMark.push(it.payload.id);
                toClear.push(it.id);
            } else if (it.op === 'delete') {
                // Para deletes locales, simplemente limpiamos la outbox
                toClear.push(it.id);
            } else {
                // Desconocido: lo dejamos para reintentar
                console.warn('[sync] op desconocida, no se limpia:', it);
            }
        } catch (err) {
            console.warn('[sync] error procesando item', it, err);
            // No limpiamos el ítem para que se reintente después
        }
    }

    // Marca en lote las tareas como sincronizadas (para updates)
    if (idsToMark.length) await swMarkTasksSynced(idsToMark);

    // Limpia la outbox de lo que “sincronizamos”
    if (toClear.length) await swClearOutboxIds(toClear);

    // Notifica a las páginas para refrescar la lista
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

// --- PUSH desde el servidor ---
self.addEventListener('push', (event) => {
    // intentamos parsear JSON que envía el backend
    const data = (() => {
        try { return event.data ? event.data.json() : {}; } catch {
            try { return { body: event.data.text() }; } catch { return {}; }
        }
    })();

    const title = data.title || 'Nueva notificación';
    const body = data.body || 'Tienes un nuevo aviso';
    const icon = data.icon || '/icons/icon-192.png';
    const tag = data.tag || 'pwa-ast';

    const opts = {
        body,
        icon,
        badge: '/icons/icon-192.png',
        tag,
        data: data.url ? { url: data.url } : {},
        // vibrate: [200,100,200],
    };

    event.waitUntil(self.registration.showNotification(title, opts));
});

// Abrir / enfocar al hacer clic en la notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        (async () => {
            const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const client = all.find(c => 'focus' in c && new URL(c.url).pathname === new URL(urlToOpen, self.location.origin).pathname);
            if (client) return client.focus();
            return self.clients.openWindow(urlToOpen);
        })()
    );
});



// Mensaje para probar notificación "local" desde la página
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
        const { title, options } = event.data;
        event.waitUntil(swShowNotification(title || 'Prueba de notificación', options || { body: 'Desde SW' }));
    }
});

// Marca una tarea local como sincronizada y (opcionalmente) guarda un remoteId ficticio
async function markLocalSynced(localId, remoteId /* opcional */) {
    const db = await swOpenDB();
    const { tx, store } = swTx(db, 'tasks', 'readwrite');

    await new Promise((res, rej) => {
        const getReq = store.get(localId);
        getReq.onsuccess = () => {
            const t = getReq.result;
            if (!t) return res(); // si ya no existe, no hacemos nada
            t.isSynced = true;
            t.updatedAt = Date.now();
            if (remoteId != null) t.remoteId = remoteId;
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

// === Local-only sync (sin servidor): marca como sincronizado y limpia la outbox ===
async function processOutbox() {
    const items = await swReadOutbox(50);
    if (!items.length) return;

    const toClear = [];

    for (const it of items) {
        try {
            if (it.op === 'create' && it.payload?.id != null) {
                // Creamos un remoteId ficticio y marcamos como sincronizada
                const localId = it.payload.id;
                const fakeRemoteId = Date.now();
                await markLocalSynced(localId, fakeRemoteId);
                toClear.push(it.id);
            } else if (it.op === 'update' && (it.payload?.id != null || it.taskId != null)) {
                // Para updates, basta con marcar la tarea como sincronizada
                const localId = it.payload?.id ?? it.taskId;
                await markLocalSynced(localId);
                toClear.push(it.id);
            } else if (it.op === 'delete') {
                // Delete local ya fue aplicado; limpiamos de la outbox
                toClear.push(it.id);
            } else {
                // Caso desconocido: lo dejamos para reintentar
                console.warn('[sync] op desconocida, no se limpia:', it);
            }
        } catch (err) {
            console.warn('[sync] error procesando item', it, err);
            // No limpiamos ese item para reintentar después
        }
    }

    if (toClear.length) await swClearOutboxIds(toClear);

    // Notifica a la página para refrescar UI
    const clientsList = await self.clients.matchAll();
    for (const c of clientsList) c.postMessage({ type: 'SYNC_DONE' });
}
