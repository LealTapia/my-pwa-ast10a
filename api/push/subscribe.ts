import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

function cors(res: VercelResponse) {
    // Estamos en mismo origen, pero no estorba que estos headers existan
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(req: VercelRequest): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (err) { reject(err); }
        });
        req.on('error', reject);
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    try {
        const payload = await readJson(req);
        // Esperamos un objeto "subscription" tal cual lo devuelve PushManager.subscribe()
        // { endpoint, keys: { p256dh, auth } }
        const sub = payload?.subscription || payload;

        const endpoint: string = sub?.endpoint;
        const p256dh: string = sub?.keys?.p256dh;
        const auth: string = sub?.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ ok: false, error: 'Invalid subscription payload' });
        }

        // Asegura que la tabla exista (idempotente)
        await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         BIGSERIAL PRIMARY KEY,
        endpoint   TEXT UNIQUE NOT NULL,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `;

        // UPSERT por endpoint
    await sql`
        INSERT INTO push_subscriptions (endpoint, p256dh, auth)
        VALUES (${endpoint}, ${p256dh}, ${auth})
        ON CONFLICT (endpoint)
        DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
    `;

        return res.status(200).json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err?.message ?? 'server error' });
    }
}
