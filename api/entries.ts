// api/entries.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

function cors(req: VercelRequest, res: VercelResponse) {
    const origin = (req.headers.origin as string) || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // cachea el preflight
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end(); // <- responder preflight
    }

    try {
        if (req.method === 'GET') {
            const { rows } = await sql/*sql*/`
        SELECT id, title, notes, completed, created_at, updated_at, inserted_at
        FROM entries
        ORDER BY updated_at DESC
        LIMIT 200
      `;
            return res.status(200).json({ ok: true, data: rows });
        }

        if (req.method === 'POST') {
            const { title, notes = '', completed = false, created_at, updated_at } = req.body ?? {};
            if (!title || !created_at || !updated_at) {
                return res.status(400).json({ ok: false, error: 'Missing required fields: title, created_at, updated_at' });
            }

            const { rows } = await sql/*sql*/`
        INSERT INTO entries (title, notes, completed, created_at, updated_at)
        VALUES (${title}, ${notes}, ${completed}, ${created_at}, ${updated_at})
        RETURNING id, title, notes, completed, created_at, updated_at, inserted_at
      `;
            return res.status(201).json({ ok: true, data: rows[0] });
        }

        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    } catch (err: any) {
        console.error('entries handler error:', err);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
}
