export interface Task {
    id?: number;
    text: string;
    completed: boolean;
    isSynced: boolean; 
    createdAt: number; 
    updatedAt: number; 
}

type OutboxOp = 'create' | 'update' | 'delete';

export interface OutboxItem {
    id?: number;
    op: OutboxOp;
    taskId?: number;  
    payload?: Task;    
    createdAt: number; 
}

const DB_NAME = 'my-pwa-ast-db';
const DB_VERSION = 1;

const TASKS_STORE = 'tasks';
const OUTBOX_STORE = 'outbox';

let db: IDBDatabase | null = null;

export const openDB = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            db = req.result;
            db.onversionchange = () => {
                db?.close();
                console.warn('[idb] Database is outdated, please reload this page.');
            };
            resolve(db);
        };

        req.onupgradeneeded = () => {
            const _db = req.result;

            if (!_db.objectStoreNames.contains(TASKS_STORE)) {
                const tasks = _db.createObjectStore(TASKS_STORE, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                tasks.createIndex('by_completed', 'completed', { unique: false });
                tasks.createIndex('by_isSynced', 'isSynced', { unique: false });
                tasks.createIndex('by_updatedAt', 'updatedAt', { unique: false });
            }

            if (!_db.objectStoreNames.contains(OUTBOX_STORE)) {
                const outbox = _db.createObjectStore(OUTBOX_STORE, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                outbox.createIndex('by_createdAt', 'createdAt', { unique: false });
            }
        };
    });

export async function addTask(task: Pick<Task, 'text'>) {
    const database = await openDB();
    return txWrap(database, TASKS_STORE, 'readwrite', (store) => {
        const now = Date.now();
        const toSave: Task = {
            ...task,
            completed: false,
            isSynced: false,
            createdAt: now,
            updatedAt: now,
        };
        return promisifyRequest(store.add(toSave));
    });
}

export async function getAllTasks(): Promise<Task[]> {
    const database = await openDB();
    return txWrap(database, TASKS_STORE, 'readonly', (store) =>
        promisifyRequest(store.getAll())
    );
}

export async function updateTask(task: Task) {
    if (!task.id) throw new Error('updateTask: falta id');
    const database = await openDB();
    task.updatedAt = Date.now();
    task.isSynced = false;
    return txWrap(database, TASKS_STORE, 'readwrite', (store) =>
        promisifyRequest(store.put(task))
    );
}

export async function deleteTask(id: number) {
    const database = await openDB();
    return txWrap(database, TASKS_STORE, 'readwrite', (store) =>
        promisifyRequest(store.delete(id))
    );
}

export async function enqueueOutbox(item: Omit<OutboxItem, 'id' | 'createdAt'>) {
    const database = await openDB();
    const toSave: OutboxItem = { ...item, createdAt: Date.now() };
    return txWrap(database, OUTBOX_STORE, 'readwrite', (store) =>
        promisifyRequest(store.add(toSave))
    );
}

export async function readOutboxBatch(limit = 20): Promise<OutboxItem[]> {
    const database = await openDB();
    return txWrap(database, OUTBOX_STORE, "readonly", async (store) => {
        const idx = store.index("by_createdAt");
        const all = await promisifyRequest<OutboxItem[]>(idx.getAll());
        return all.slice(0, limit);
    });
}


export async function clearOutboxIds(ids: number[]) {
    const database = await openDB();
    return txWrap(database, OUTBOX_STORE, 'readwrite', async (store) => {
        for (const id of ids) {
            await promisifyRequest(store.delete(id));
        }
    });
}


function txWrap<T>(
    database: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    runner: (store: IDBObjectStore) => T | Promise<T>
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let result: T | undefined;

        Promise.resolve()
            .then(() => runner(store))
            .then((r) => {
                result = r;
                tx.commit?.();
            })
            .catch((err) => {
                try { tx.abort(); } catch { }
                reject(err);
            });

        tx.oncomplete = () => resolve(result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
}

function promisifyRequest<T = any>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function __debugOpen() {
    await openDB();
    console.log('[idb] DB abierta y stores creados:', DB_NAME);
}

export async function queueCreate(text: string) {
    const id = await addTask({ text });
    await enqueueOutbox({
        op: 'create',
        payload: { id: id as number, text, completed: false, isSynced: false, createdAt: Date.now(), updatedAt: Date.now() }
    });
}

export async function queueUpdate(task: Task) {
    await updateTask({ ...task, isSynced: false, updatedAt: Date.now() });
    await enqueueOutbox({
        op: 'update',
        taskId: task.id,
        payload: { ...task, isSynced: false, updatedAt: Date.now() },
    });
}

export async function requestBackgroundSync(tag = 'sync-outbox') {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        try {
            await reg.sync.register(tag);
        } catch (err) {
            console.warn('[sync] register failed:', err);
        }
    }
}

export async function listUnsyncedTasks(): Promise<Task[]> {
    const database = await openDB();
    return txWrap(database, 'tasks', 'readonly', async (store) => {
        const all = await promisifyRequest<Task[]>(store.getAll());
        return all.filter((t) => t && t.isSynced === false);
    });
}

export async function backfillOutboxUnsynced() {
    const database = await openDB();
    const [unsynced, existingOutbox] = await Promise.all([
        listUnsyncedTasks(),
        txWrap(database, 'outbox', 'readonly', (store) => promisifyRequest<OutboxItem[]>(store.getAll()))
    ]);

    const already = new Set<number>();
    for (const it of existingOutbox) {
        const id = it.payload?.id ?? it.taskId;
        if (typeof id === 'number') already.add(id);
    }

    for (const t of unsynced) {
        if (!t.id || already.has(t.id)) continue;
        await enqueueOutbox({
            op: 'create',
            payload: { ...t }
        });
    }
}

export async function requestImmediateSyncNow() {
    if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'RUN_SYNC_NOW' });
    }
}
