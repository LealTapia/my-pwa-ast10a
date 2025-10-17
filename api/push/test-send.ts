import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { sql } from '@vercel/postgres';

export const config = {
    runtime: 'nodejs' as const,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    // Logs útiles en runtime
    console.log('[push] env public len:', publicKey?.length ?? 0);
    console.log('[push] env private len:', privateKey?.length ?? 0);

    if (!publicKey || !privateKey) {
        return res.status(500).json({ ok: false, error: 'Missing VAPID keys' });
    }

    try {
        webpush.setVapidDetails('mailto:you@example.com', publicKey, privateKey);
    } catch (e: any) {
        console.error('[push] setVapidDetails error:', e);
        return res.status(500).json({ ok: false, error: e?.message ?? 'setVapidDetails failed' });
    }

    try {
        const { rows } = await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions
      ORDER BY created_at DESC
      LIMIT 1
    `;
        if (!rows.length) {
            return res.status(404).json({ ok: false, error: 'No subscriptions' });
        }

        const r = rows[0];
        const subscription = {
            endpoint: r.endpoint,
            keys: { p256dh: r.p256dh, auth: r.auth },
        };

        const payload = JSON.stringify({
            title: 'Notificación desde el servidor 🎯',
            body: 'Llegó vía Web Push + VAPID',
        });

        console.log('[push] sending to endpoint prefix:', String(r.endpoint).slice(0, 40));
        await webpush.sendNotification(subscription as any, payload);

        return res.json({ ok: true });
    } catch (err: any) {
        console.error('[push] sendNotification error:', err);
        // Devuelve el detalle al cliente para verlo en la consola del navegador
        return res.status(500).json({ ok: false, error: err?.message ?? 'send error' });
    }
}
