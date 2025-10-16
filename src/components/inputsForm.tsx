import { useState } from "react";
import type { FormEvent } from "react";
import { queueCreate, requestBackgroundSync } from "../lib/db";

type Props = { onSaved: () => void };

export default function InputsForm({ onSaved }: Props) {
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (!text.trim()) {
            setError("Escribe una tarea.");
            return;
        }
        try {
            setSaving(true);
            const value = text.trim();
            await queueCreate(value);
            await requestBackgroundSync('sync-outbox');
            setText("");
            onSaved();

        } catch (err: any) {
            setError(err?.message ?? "Error guardando en IndexedDB");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <input
                type="text"
                placeholder="Nueva tarea (funciona offline)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={styles.input}
                disabled={saving}
            />
            <button type="submit" style={styles.button} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
            </button>
            {error && <p style={styles.error}>{error}</p>}
        </form>
    );
}

const styles: Record<string, React.CSSProperties> = {
    form: { display: "flex", gap: 8, alignItems: "center" },
    input: {
        flex: 1,
        padding: "10px 12px",
        border: "1px solid #ccc",
        borderRadius: 8,
        outline: "none",
    },
    button: {
        padding: "10px 14px",
        border: "1px solid #222",
        borderRadius: 8,
        background: "#222",
        color: "#fff",
        cursor: "pointer",
    },
    error: { color: "#b00020", marginTop: 8 },
};
