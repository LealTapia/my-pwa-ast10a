// import type { VercelRequest, VercelResponse } from '@vercel/node'
// import { neon } from '@neondatabase/serverless'

// const sql = neon(process.env.DATABASE_URL!)

// type EntryPayload = {
//     title: string
//     notes: string
//     createdAt: number
// }

// export default async function handler(req: VercelRequest, res: VercelResponse) {
//     if (req.method !== 'POST') {
//         res.setHeader('Allow', 'POST')
//         return res.status(405).json({ error: 'Method Not Allowed' })
//     }

//     try {
//         const body = req.body
//         const items: EntryPayload[] = Array.isArray(body) ? body : body?.items

//         if (!Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ error: 'Invalid payload' })
//         }

//         const titles = items.map(i => i.title)
//         const notes = items.map(i => i.notes)
//         const created = items.map(i => i.createdAt)

//     await sql`
//         INSERT INTO entries (title, notes, created_at)
//         SELECT * FROM UNNEST (
//         ${titles}::text[],
//         ${notes}::text[],
//         ${created}::bigint[]
//     );
//     `

//         return res.status(200).json({ inserted: items.length })
//     } catch (err) {
//         console.error('[sync-entries] error:', err)
//         return res.status(500).json({ error: 'Internal Server Error' })
//     }
// }