import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:leal_agareoz@hotmail.com';

function allowCORS(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    allowCORS(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    try {
        const { subscription, payload } = req.body || {};
        if (!subscription) return res.status(400).json({ ok: false, error: 'Missing subscription' });

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        await webpush.sendNotification(
            subscription,
            JSON.stringify(
                payload ?? {
                    title: '¡Hola desde el backend!',
                    body: 'Notificación push real (sin BD).',
                    icon: '/icons/icon-192.png',
                    data: { url: '/' },
                },
            )
        );

        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err?.message || 'send fail' });
    }
}
