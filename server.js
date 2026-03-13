/**
 * CreativeOps — Backend Server (Supabase edition)
 *
 * Uses Supabase for both file storage AND database — completely free tier:
 *   - 1 GB file storage
 *   - 500 MB Postgres database
 *   - 2 GB bandwidth/month
 *   - No credit card required
 *
 * Multi-datacenter replication:
 *   - Supabase runs on AWS and manages replication automatically.
 *   - File storage is backed by S3 — globally durable and replicated.
 *   - Postgres has automated backups and point-in-time recovery.
 *   - Regional failover is handled by Supabase infrastructure.
 *
 * ─── One-time setup ───────────────────────────────────────────────────────────
 * Before running the server, go to Supabase Dashboard → SQL Editor and run:
 *
 *   CREATE TABLE IF NOT EXISTS creatives (
 *     id          TEXT PRIMARY KEY,
 *     name        TEXT NOT NULL,
 *     platform    TEXT,
 *     mime_type   TEXT,
 *     file_key    TEXT NOT NULL,
 *     file_size   BIGINT,
 *     cdn_url     TEXT,
 *     status      TEXT DEFAULT 'active',
 *     created_at  TIMESTAMPTZ DEFAULT now()
 *   );
 *
 * Also create a Storage bucket named "creativeops-assets" (set to Public).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Supabase Client ──────────────────────────────────────────────────────────
// Uses the service_role key — never expose this in frontend code
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = process.env.SUPABASE_BUCKET || 'creativeops-assets';

// ─── Multer (in-memory storage, 500 MB limit) ─────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// Serve the frontend static files from project root
app.use(express.static(__dirname));

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/upload
 * Uploads file to Supabase Storage and saves metadata to Supabase DB.
 * Body: multipart/form-data  { file, platform?, name? }
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const id = uuidv4();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${Date.now()}-${id}-${safeName}`;
    const platform = req.body.platform || null;
    const displayName = req.body.name || file.originalname;

    // Upload file to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .upload(fileKey, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (storageError) throw storageError;

    // Get the public CDN URL for the uploaded file
    const { data: { publicUrl: cdn_url } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileKey);

    // Save metadata to Supabase Postgres
    const { data, error: dbError } = await supabase
      .from('creatives')
      .insert({
        id,
        name: displayName,
        platform,
        mime_type: file.mimetype,
        file_key: fileKey,
        file_size: file.size,
        cdn_url,
        status: 'active',
      })
      .select('id, name, platform, mime_type, file_key, file_size, cdn_url, created_at')
      .single();

    if (dbError) throw dbError;

    res.status(201).json(data);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

/**
 * GET /api/creatives
 * List all active creatives, newest first.
 * Query params: platform (optional filter)
 */
app.get('/api/creatives', async (req, res) => {
  try {
    let query = supabase
      .from('creatives')
      .select('id, name, platform, mime_type, file_size, cdn_url, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (req.query.platform) {
      query = query.eq('platform', req.query.platform);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: 'Failed to fetch creatives' });
  }
});

/**
 * GET /api/creatives/:id
 * Get a single creative by ID.
 */
app.get('/api/creatives/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('creatives')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'active')
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch creative' });
  }
});

/**
 * DELETE /api/creatives/:id
 * Soft-delete — sets status = 'deleted', keeps the file in Storage.
 */
app.delete('/api/creatives/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('creatives')
      .update({ status: 'deleted' })
      .eq('id', req.params.id)
      .select('id')
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

/**
 * GET /api/health
 * Checks DB and Storage connectivity.
 * Use with load balancer / uptime monitor health checks.
 */
app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', db: false, storage: false };

  const { error: dbError } = await supabase
    .from('creatives')
    .select('id')
    .limit(1);
  health.db = !dbError;

  const { error: storageError } = await supabase.storage.getBucket(BUCKET);
  health.storage = !storageError;

  const allOk = health.db && health.storage;
  res.status(allOk ? 200 : 503).json(health);
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ CreativeOps running at http://localhost:${PORT}`);
  console.log(`  Supabase : ${process.env.SUPABASE_URL || '(not configured)'}`);
  console.log(`  Bucket   : ${BUCKET}`);
});
