import { useState, useEffect } from "react";
import { useOnlineStatus } from "./hooks/statusOnline";
import InputsForm from "./components/inputsForm";
import EntriesList from "./components/entriesList";
import { backfillOutboxUnsynced, requestBackgroundSync, requestImmediateSyncNow } from "./lib/db";

function App() {
  const online = useOnlineStatus();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (navigator.serviceWorker) {
      const onMsg = (event: MessageEvent) => {
        if (event.data?.type === 'SYNC_DONE') {
          setRefreshKey((k) => k + 1);
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      return () => navigator.serviceWorker.removeEventListener('message', onMsg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await backfillOutboxUnsynced();
      await requestBackgroundSync("sync-outbox");
      await requestImmediateSyncNow();
    })();
  }, []);

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1>My PWA - AST</h1>
        <span
          title={online ? "Conectado" : "Sin conexión"}
          style={{
            ...styles.badge,
            background: online ? "#2e7d32" : "#b00020",
          }}
        >
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </header>

      <section style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Formulario offline (IndexedDB)</h2>
        <p style={{ marginTop: 0 }}>
          Este formulario guarda directamente en IndexedDB, aun sin conexión.
        </p>
        <InputsForm onSaved={() => setRefreshKey((k) => k + 1)} />
        <EntriesList refreshKey={refreshKey} />
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 720,
    margin: "32px auto",
    padding: "0 16px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial',
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  badge: {
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  card: {
    background: "#fafafa",
    border: "1px solid #ececec",
    borderRadius: 12,
    padding: 16,
  },
};

export default App;
