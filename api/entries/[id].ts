import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

function cors(req: VercelRequest, res: VercelResponse) {
    const origin = (req.headers.origin as string) || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    const idParam = (req.query.id ?? '').toString();
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
    }

    try {
        if (req.method === 'PATCH') {
            const { title, notes, completed, updated_at } = req.body ?? {};
            if (!updated_at) {
                return res.status(400).json({ ok: false, error: 'Missing required field: updated_at' });
            }

            const setParts: string[] = ['updated_at = $1'];
            const values: any[] = [updated_at];
            let i = 2;

            if (typeof title === 'string') { setParts.push(`title = $${i++}`); values.push(title); }
            if (typeof notes === 'string') { setParts.push(`notes = $${i++}`); values.push(notes); }
            if (typeof completed === 'boolean') { setParts.push(`completed = $${i++}`); values.push(completed); }

            const query = `UPDATE entries SET ${setParts.join(', ')} WHERE id = $${i} RETURNING id, title, notes, completed, created_at, updated_at, inserted_at`;
            values.push(id);

            const { rows } = await sql.query(query, values);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
            return res.status(200).json({ ok: true, data: rows[0] });
        }

        if (req.method === 'DELETE') {
            await sql`DELETE FROM entries WHERE id = ${id}`;
            return res.status(204).end();
        }

        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    } catch (err: any) {
        console.error('entries/[id] handler error:', err);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
}