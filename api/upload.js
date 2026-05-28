import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in environment for /api/upload');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Read raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const fileName = req.headers['x-file-name'] || `upload-${Date.now()}`;
    const fileType = req.headers['x-file-type'] || 'application/octet-stream';
    const bucket = req.headers['x-bucket'] || 'portfolio';

    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_');
    const extMatch = (fileName.match(/\.([^.]+)$/) || []);
    const ext = extMatch[1] || 'bin';
    const filePath = `uploads/${Date.now()}-${baseName}.${ext}`;

    // Forward to Supabase Storage using service role key
    const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'apikey': SUPABASE_SERVICE_ROLE,
        'x-upsert': 'true',
        'Content-Type': fileType
      },
      body: buffer
    });

    if (!storageRes.ok) {
      const errBody = await storageRes.text().catch(() => '');
      return res.status(500).json({ error: `Storage upload failed: ${storageRes.status} ${errBody}` });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
    return res.json({ publicUrl, path: filePath });
  } catch (err) {
    console.error('Upload proxy error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
