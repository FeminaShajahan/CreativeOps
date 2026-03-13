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
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

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

// ─── AWS Bedrock Client ────────────────────────────────────────────────────────
const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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

// Image dimensions per platform (multiples of 64, supported by Titan v2)
const IMG_DIMS = {
  meta:    { width: 512, height: 512 },   // 1:1 square
  google:  { width: 640, height: 384 },   // 5:3 landscape
  tiktok:  { width: 384, height: 640 },   // 3:5 portrait
  youtube: { width: 640, height: 384 },   // 5:3 widescreen
};

async function generateImage(promptText, platform) {
  const dims = IMG_DIMS[platform] || IMG_DIMS.meta;
  const body = JSON.stringify({
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: promptText,
      negativeText: 'text, words, letters, watermark, logo, low quality, blurry, distorted, cartoon, sketch',
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      width: dims.width,
      height: dims.height,
      quality: 'standard',
      cfgScale: 8.0,
    },
  });

  const cmd = new InvokeModelCommand({
    modelId: 'amazon.titan-image-generator-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body,
  });

  const resp = await bedrock.send(cmd);
  const result = JSON.parse(new TextDecoder().decode(resp.body));
  if (result.error) throw new Error(result.error);
  return `data:image/png;base64,${result.images[0]}`;
}

/**
 * POST /api/generate
 * AI creative generation and variations using Claude + Titan Image via AWS Bedrock.
 * Body: { mode, platform, product, audience, tone, copy, count }
 *   mode     : 'generate' | 'variations'
 *   platform : 'meta' | 'google' | 'tiktok' | 'youtube'
 *   product  : product/brand description (generate mode)
 *   audience : target audience (generate mode)
 *   tone     : 'professional' | 'playful' | 'urgent' | 'inspirational'
 *   copy     : existing copy to riff on (variations mode)
 *   count    : number of variations (1–5, default 3)
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { mode = 'generate', platform = 'meta', product, audience, tone = 'professional', copy, count = 3 } = req.body;

    const platformGuides = {
      meta:    'Facebook/Instagram ads: headline ≤40 chars, primary text ≤125 chars, CTA button text ≤20 chars.',
      google:  'Google Display ads: headline ≤30 chars, description ≤90 chars.',
      tiktok:  'TikTok ads: hook ≤30 chars, caption ≤150 chars, energetic and trend-aware.',
      youtube: 'YouTube pre-roll: hook ≤5 sec, main message ≤30 words, CTA ≤10 words.',
    };

    const platformImageStyle = {
      meta:    'square product lifestyle photo, social media ad aesthetic, clean bright background',
      google:  'professional wide landscape photo, clean minimalist style, business advertisement',
      tiktok:  'vertical portrait photo, vibrant trendy aesthetic, young energy, lifestyle',
      youtube:  'cinematic wide-angle shot, high production quality, dramatic lighting',
    };

    let prompt;

    if (mode === 'variations') {
      if (!copy) return res.status(400).json({ error: '`copy` is required for variations mode' });
      const n = Math.min(Math.max(parseInt(count) || 3, 1), 5);
      prompt = `You are an expert ad creative director. Generate ${n} distinct variations of the following ad copy AND a unique visual image prompt for each. Platform: ${platform.toUpperCase()}. Guidelines: ${platformGuides[platform] || platformGuides.meta}

Original copy:
"""
${copy}
"""

Return ONLY a valid JSON array with ${n} objects. Each object must have these exact keys:
- "headline": the headline text
- "body": the main body/description text
- "cta": the call-to-action button text
- "imagePrompt": a detailed photorealistic image generation prompt (no text/words in image) describing the ad visual — style: ${platformImageStyle[platform] || platformImageStyle.meta}

Example: [{"headline":"...","body":"...","cta":"...","imagePrompt":"..."}]
No markdown, no explanation — pure JSON array only.`;
    } else {
      if (!product) return res.status(400).json({ error: '`product` is required for generate mode' });
      const n = Math.min(Math.max(parseInt(count) || 3, 1), 5);
      prompt = `You are an expert ad creative director. Create ${n} high-converting ad creatives WITH visual image prompts for the following brief.

Product/Brand: ${product}
Target Audience: ${audience || 'general consumers'}
Tone: ${tone}
Platform: ${platform.toUpperCase()}
Platform guidelines: ${platformGuides[platform] || platformGuides.meta}

Return ONLY a valid JSON array with ${n} objects. Each object must have these exact keys:
- "headline": the headline text
- "body": the main body/description text
- "cta": the call-to-action button text
- "imagePrompt": a detailed photorealistic image generation prompt (no text/words in image) describing the ad visual — style: ${platformImageStyle[platform] || platformImageStyle.meta}

Example: [{"headline":"...","body":"...","cta":"...","imagePrompt":"..."}]
No markdown, no explanation — pure JSON array only.`;
    }

    // Step 1: Claude generates copy + image prompts
    const claudePayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    };

    const claudeCmd = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(claudePayload),
    });

    const claudeResp = await bedrock.send(claudeCmd);
    const claudeRaw  = JSON.parse(new TextDecoder().decode(claudeResp.body));
    const claudeText = claudeRaw.content[0].text.trim();

    const jsonMatch = claudeText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Model did not return a valid JSON array');
    const creatives = JSON.parse(jsonMatch[0]);

    // Step 2: Titan generates images in parallel for each creative
    const withImages = await Promise.all(
      creatives.map(async (c) => {
        try {
          const imageUrl = await generateImage(c.imagePrompt || `${c.headline} advertisement, ${platformImageStyle[platform]}`, platform);
          return { ...c, imageUrl };
        } catch (imgErr) {
          console.error('Image gen error:', imgErr.message);
          return { ...c, imageUrl: null };
        }
      })
    );

    res.json({ creatives: withImages });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err.message });
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
