import { useEffect, useState } from "react";

export default function OfflineBadge() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    if (online) return null;
    return (
        <div style={{ position: 'fixed', bottom: 12, left: 12, background: '#222', color: '#fff', padding: '8px 12px', borderRadius: 8, zIndex: 9999 }}>
            Modo sin conexión
        </div>
    );
}