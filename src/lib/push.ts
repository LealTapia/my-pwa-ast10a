function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

export async function ensureNotificationPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
        alert("Tu navegador no soporta avisos (notificaciones).");
        return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
        alert("Tienes los avisos desactivados. Actívalos en la configuración del navegador.");
        return false;
    }
    const res = await Notification.requestPermission();
    return res === "granted";
}

export async function subscribePushAndSave(): Promise<boolean> {
    const ok = await ensureNotificationPermission();
    if (!ok) return false;

    if (!("serviceWorker" in navigator)) {
        alert("No encontramos el Service Worker. Recarga la página.");
        return false;
    }
    const reg = await navigator.serviceWorker.ready;

    const rawEnvKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "") as string;
    const publicKey = rawEnvKey.trim().replace(/\s+/g, "");

    // debug no intrusivo
    console.log("[push] VAPID public key len:", publicKey.length);
    console.log("[push] VAPID public key chars OK:", /^[A-Za-z0-9_-]+$/.test(publicKey));

    if (!publicKey) {
        alert("Falta la clave pública de avisos. Avísale al administrador.");
        return false;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(publicKey)) {
        alert("La clave pública VAPID tiene caracteres inválidos (revisa espacios/saltos de línea).");
        return false;
    }

    const appServerKey = urlBase64ToUint8Array(publicKey);

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
        });
    }

    const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
    });

    if (!res.ok) {
        console.error("No se pudo guardar la suscripción", await res.text());
        alert("No se pudo activar los avisos. Intenta más tarde.");
        return false;
    }

    return true;
}

export async function sendTestPush() {
    if (!("serviceWorker" in navigator)) {
        alert("No encontramos el Service Worker. Recarga la página.");
        return false;
    }
    const reg = await navigator.serviceWorker.ready;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        alert("Primero activa los avisos para crear la suscripción.");
        return false;
    }

    const API = "/api/push/test-send";
    const rsp = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            subscription,
            payload: {
                title: "Aviso de prueba",
                body: "Enviado por el servidor.",
                icon: "/icons/icon-192.png",
                data: { url: "/" },
            },
        }),
    });

    if (!rsp.ok) {
        console.error("Error test-send:", await rsp.text());
        alert("No se pudo enviar el aviso de prueba. Intenta más tarde.");
        return false;
    }
    alert("¡Aviso enviado! Revisa la notificación.");
    return true;
}
