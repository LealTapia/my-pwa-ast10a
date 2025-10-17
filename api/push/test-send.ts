// api/push/test-send.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { sql } from '@vercel/postgres';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        return res.status(500).json({ ok: false, error: 'Missing VAPID keys' });
    }

    // Configurar web-push una vez por request
    webpush.setVapidDetails('mailto:you@example.com', publicKey, privateKey);

    try {
        // Toma la suscripción más reciente (ajusta si quieres filtrar por usuario)
        const { rows } = await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions
      ORDER BY created_at DESC
      LIMIT 1
    `;
        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'No hay suscripciones guardadas' });
        }

        const sub = rows[0];
        const subscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
        };

        // Mensaje de prueba
        const payload = JSON.stringify({
            title: 'Notificación desde el servidor 🎯',
            body: 'Llegó vía Web Push + VAPID',
        });

        await webpush.sendNotification(subscription as any, payload);
        return res.json({ ok: true });
    } catch (err: any) {
        console.error('[push:test-send] error', err);
        return res.status(500).json({ ok: false, error: err?.message ?? 'send error' });
    }
}
