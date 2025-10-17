function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

export async function ensureNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
        alert('Este navegador no soporta notificaciones.');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        alert('Has denegado las notificaciones. Habilítalas en los ajustes del navegador.');
        return false;
    }
    const res = await Notification.requestPermission();
    return res === 'granted';
}

export async function subscribePushAndSave(): Promise<boolean> {
    // 1) permiso
    const ok = await ensureNotificationPermission();
    if (!ok) return false;

    // 2) SW listo
    if (!('serviceWorker' in navigator)) {
        alert('No hay Service Worker disponible.');
        return false;
    }
    const reg = await navigator.serviceWorker.ready;

    // 3) VAPID key pública desde env (limpia espacios/saltos de línea)
    const rawEnvKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '') as string;

    // Elimina espacios y saltos de línea que Vercel a veces deja al copiar/pegar
    const publicKey = rawEnvKey.trim().replace(/\s+/g, '');

    // Debug para verificar que realmente llegó
    console.log('[push] VAPID public key len:', publicKey.length);
    console.log('[push] VAPID public key chars OK:', /^[A-Za-z0-9_-]+$/.test(publicKey));

    // Validación
    if (!publicKey) {
        alert('VITE_VAPID_PUBLIC_KEY no está configurada.');
        return false;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(publicKey)) {
        alert('VAPID pública contiene caracteres inválidos (revisa espacios/saltos de línea).');
        return false;
    }

    // Conversión obligatoria a Uint8Array
    const appServerKey = urlBase64ToUint8Array(publicKey);


    // 4) ya existe suscripción?
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
        });
    }

    // 5) enviar al backend (mismo origen)
    const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // mismo origen: sin CORS
        body: JSON.stringify(subscription),
    });

    if (!res.ok) {
        console.error('Error guardando suscripción', await res.text());
        alert('No se pudo guardar la suscripción en el servidor.');
        return false;
    }

    return true;
}

export async function sendTestPush() {
    if (!('serviceWorker' in navigator)) {
        alert('No hay Service Worker disponible.');
        return false;
    }
    const reg = await navigator.serviceWorker.ready;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        alert('Primero activa notificaciones para crear la suscripción.');
        return false;
    }

    // Usa tu dominio de Preview (o relativo si estás desplegado).
    const API = '/api/push/test-send';
    const rsp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subscription,
            payload: {
                title: 'Push de prueba',
                body: 'Enviada por el backend (sin guardar en BD).',
                icon: '/icons/icon-192.png',
                data: { url: '/' },
            },
        }),
    });

    if (!rsp.ok) {
        console.error('Error test-send:', await rsp.text());
        alert('Fallo el envío desde el backend');
        return false;
    }
    alert('¡Push enviada! Revisa la notificación.');
    return true;
}
