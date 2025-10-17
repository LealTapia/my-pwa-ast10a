import { useState, useEffect } from "react";
import { useOnlineStatus } from "./hooks/statusOnline";
import InputsForm from "./components/inputsForm";
import EntriesList from "./components/entriesList";
import {
  backfillOutboxUnsynced,
  requestBackgroundSync,
  requestImmediateSyncNow,
} from "./lib/db";
import { subscribePushAndSave, sendTestPush } from "./lib/push";

function App() {
  const online = useOnlineStatus();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (navigator.serviceWorker) {
      const onMsg = (event: MessageEvent) => {
        if (event.data?.type === "SYNC_DONE") setRefreshKey((k) => k + 1);
      };
      navigator.serviceWorker.addEventListener("message", onMsg);
      return () =>
        navigator.serviceWorker.removeEventListener("message", onMsg);
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
        <h1>Buzón de quejas y sugerencias</h1>
        <span
          title={online ? "Conectado" : "Sin conexión"}
          style={{ ...styles.badge, background: online ? "#2e7d32" : "#b00020" }}
        >
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </header>

      <section style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Tu mensaje</h2>
        <p style={{ marginTop: 0 }}>
          Este buzón funciona incluso sin internet: guardamos tu mensaje y lo
          sincronizamos automáticamente cuando vuelvas a estar en línea.
        </p>
        <InputsForm onSaved={() => setRefreshKey((k) => k + 1)} />
        <EntriesList refreshKey={refreshKey} />
      </section>

      <div style={styles.actionsGrid}>
        <button
          onClick={async () => {
            const ok = await subscribePushAndSave();
            if (ok) alert("Listo, activaste los avisos en este navegador.");
          }}
          style={styles.actionBtn}
        >
          Activar avisos
        </button>

        <button onClick={() => sendTestPush()} style={styles.actionBtn}>
          Probar aviso (servidor)
        </button>

        {/*
        // Botón para la notificación local (sin backend). Lo dejamos comentado.
        <button onClick={showLocalTestNotification} style={styles.actionBtn}>
          Probar notificación local (SW)
        </button>
        */}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: "24px 16px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial',
    background: "#f7f7fb",
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
    background: "#fff",
    border: "1px solid #ececec",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 6px 20px rgba(0,0,0,.06)",
  },
  actionsGrid: {
    width: "100%",
    maxWidth: 720,
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1fr",
  },
  actionBtn: {
    padding: "10px 14px",
    border: "1px solid #1f2937",
    borderRadius: 10,
    background: "#1f2937",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
};

// Pequeño truco para dos columnas sin CSS externo:
(function makeTwoColsOnWide() {
  const mq = typeof window !== "undefined" && window.matchMedia?.("(min-width: 520px)");
  if (!mq) return;
  const apply = () => {
    (styles.actionsGrid as any).gridTemplateColumns = mq.matches ? "1fr 1fr" : "1fr";
  };
  apply();
  mq.addEventListener?.("change", apply);
})();

export default App;
