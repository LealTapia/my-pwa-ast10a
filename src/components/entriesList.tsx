import { useEffect, useState } from "react";
import type { Task } from "../lib/db";
import {
    getAllTasks,
    queueUpdate,
    deleteTask,
    requestBackgroundSync,
    requestImmediateSyncNow,
} from "../lib/db";

type Props = { refreshKey: number };

export default function EntriesList({ refreshKey }: Props) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            const data = await getAllTasks();
            if (mounted) {
                // 1º pendientes arriba, 2º completadas abajo; dentro de cada grupo, lo más reciente primero
                data.sort((a, b) => (Number(a.completed) - Number(b.completed)) || b.updatedAt - a.updatedAt);
                setTasks(data);
                setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [refreshKey]);

    async function toggleComplete(t: Task) {
        const next = { ...t, completed: !t.completed, updatedAt: Date.now(), isSynced: false };
        await queueUpdate(next);
        await requestBackgroundSync("sync-outbox");
        await requestImmediateSyncNow();
        const data = await getAllTasks();
        data.sort((a, b) => (Number(a.completed) - Number(b.completed)) || b.updatedAt - a.updatedAt);
        setTasks(data);
    }

    async function remove(id?: number) {
        if (!id) return;
        await deleteTask(id);
        const data = await getAllTasks();
        data.sort((a, b) => (Number(a.completed) - Number(b.completed)) || b.updatedAt - a.updatedAt);
        setTasks(data);
    }

    if (loading) return <p>Cargando notas...</p>;
    if (!tasks.length) return <p>Sin notas aún.</p>;

    return (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
            {tasks.map((t) => (
                <li key={t.id} style={styles.item}>
                    <label style={{ display: "flex", alignItems: "start", gap: 10 }}>
                        <input type="checkbox" checked={!!t.completed} onChange={() => toggleComplete(t)} />
                        <div>
                            <div style={{ fontWeight: 700 }}>{t.title}</div>
                            {t.notes ? <div style={{ opacity: 0.9 }}>{t.notes}</div> : null}
                            <small style={{ opacity: 0.7 }}>
                                Estado: {t.isSynced ? "Sincronizado" : "Pendiente"}
                            </small>
                        </div>
                    </label>

                    <button onClick={() => remove(t.id)} style={styles.delete}>
                        Eliminar
                    </button>
                </li>
            ))}
        </ul>
    );
}

const styles: Record<string, React.CSSProperties> = {
    item: {
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        padding: "12px",
        border: "1px solid #e7e7e9",
        borderRadius: 8,
        marginBottom: 8,
        gap: 12,
        background: "#fff",
    },
    delete: {
        border: "1px solid #c62828",
        color: "#fff",
        background: "#c62828",
        borderRadius: 8,
        padding: "6px 10px",
        cursor: "pointer",
    },
};
