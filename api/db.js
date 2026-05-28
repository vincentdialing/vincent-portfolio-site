import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in environment for /api/db');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, table, payload, id } = req.body || {};

  if (!action || !table) return res.status(400).json({ error: 'Missing action or table' });

  try {
    let result;
    if (action === 'insert') {
      result = await supabase.from(table).insert(payload).select();
    } else if (action === 'update') {
      result = await supabase.from(table).update(payload).eq('id', id).select();
    } else if (action === 'delete') {
      result = await supabase.from(table).delete().eq('id', id).select();
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (result.error) return res.status(500).json({ error: result.error.message || result.error });
    return res.json({ data: result.data || null });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
