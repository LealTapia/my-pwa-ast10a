import { useState } from "react";
import type { FormEvent } from "react";
import { queueCreate, requestBackgroundSync } from "../lib/db";

type Props = { onSaved: () => void };

export default function InputsForm({ onSaved }: Props) {
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        const t = title.trim();
        const n = notes.trim();

        if (!t && !n) {
            setError("Por favor, escribe tu queja o sugerencia.");
            return;
        }

        try {
            setSaving(true);
            // ⬇️ Mantengo tu contrato actual con queueCreate({ title, notes })
            await queueCreate({ title: t, notes: n });
            await requestBackgroundSync("sync-outbox");
            setTitle("");
            setNotes("");
            onSaved();
        } catch (err: any) {
            setError(err?.message ?? "Ocurrió un error al guardar tu mensaje.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <input
                type="text"
                placeholder="Título de tu mensaje"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={styles.input}
                disabled={saving}
                aria-label="Título"
            />
            <textarea
                placeholder="Describe tu queja o sugerencia"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ ...styles.input, minHeight: 100, resize: "vertical" }}
                disabled={saving}
                aria-label="Descripción"
            />
            <button type="submit" style={styles.button} disabled={saving}>
                {saving ? "Enviando…" : "Enviar"}
            </button>

            {/* Espacio reservado para que el error NO empuje el layout */}
            <div style={{ minHeight: 18, marginTop: 6 }}>
                {error && <p style={styles.error}>{error}</p>}
            </div>
        </form>
    );
}

const styles: Record<string, React.CSSProperties> = {
    form: { display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" },
    input: {
        padding: "10px 12px",
        border: "1px solid #ccc",
        borderRadius: 10,
        outline: "none",
        background: "#fff",
    },
    button: {
        padding: "10px 14px",
        border: "1px solid #222",
        borderRadius: 10,
        background: "#222",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 600,
    },
    error: { color: "#b00020", margin: 0, fontSize: 13 },
};
