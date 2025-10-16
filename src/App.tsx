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
    minHeight: "0vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "24px 16px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial',
    background: "none ",
  },
  header: { display: "flex", alignItems: "center", gap: 12 },
  badge: {
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  card: {
    width: "100%",
    maxWidth: 720,
    background: "#fafafa",
    border: "1px solid #ececec",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 4px 14px rgba(0,0,0,.06)",
  },
};


export default App;
