import { useEffect, useState } from "react";
import type { Task } from "../lib/db";
import { getAllTasks, queueUpdate, deleteTask, requestBackgroundSync, requestImmediateSyncNow } from "../lib/db";

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
                data.sort((a, b) => b.updatedAt - a.updatedAt);
                setTasks(data);
                setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [refreshKey]);

    async function toggleComplete(t: Task) {
        const next = { ...t, completed: !t.completed };
        await queueUpdate(next);
        await requestBackgroundSync('sync-outbox');
        await requestImmediateSyncNow();
        const data = await getAllTasks();
        data.sort((a, b) => b.updatedAt - a.updatedAt);
        setTasks(data);
    }


    async function remove(id?: number) {
        if (!id) return;
        await deleteTask(id);
        const data = await getAllTasks();
        data.sort((a, b) => b.updatedAt - a.updatedAt);
        setTasks(data);
    }

    if (loading) return <p>Cargando tareas...</p>;
    if (!tasks.length) return <p>Sin tareas aún.</p>;

    return (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
            {tasks.map((t) => (
                <li key={t.id} style={styles.item}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                            type="checkbox"
                            checked={!!t.completed}
                            onChange={() => toggleComplete(t)}
                        />
                        <span
                            style={{
                                textDecoration: t.completed ? "line-through" : "none",
                                opacity: t.completed ? 0.7 : 1,
                            }}
                        >
                            {t.text}
                        </span>
                    </label>
                    <small style={{ opacity: 0.7 }}>
                        {t.isSynced ? "✔︎ sincronizada" : "• pendiente de sync"}
                    </small>
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
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        padding: "10px 12px",
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
