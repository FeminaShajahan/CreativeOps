// ─── Supabase Configuration ──────────────────────────────────────────────────
//
// Setup steps:
//   1. Go to https://app.supabase.com → your project → Settings → API
//   2. Copy "Project URL" and paste into SUPABASE_URL below
//   3. Copy "anon / public" key and paste into SUPABASE_ANON_KEY below
//   4. Run supabase-setup.sql in the Supabase SQL Editor to create the DB table
//   5. Create a Storage bucket called "format-adapter-files" and set it to PUBLIC
//      (Dashboard → Storage → New Bucket → Name: format-adapter-files → Public: ON)
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://drytqukujgctszgfddur.supabase.co';   // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyeXRxdWt1amdjdHN6Z2ZkZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzc1NDcsImV4cCI6MjA4ODk1MzU0N30.avZ80tWe11UEld8KGjM8nnPjYyZ24eaojtv3z7e0kNE';       // eyJhbGciOiJIUzI1NiIsInR...

const SUPABASE_TABLE  = 'format_queue';
const SUPABASE_BUCKET = 'format-adapter-files';

// ── Client (initialised by initSupabase()) ────────────────────────────────────
let sbClient = null;

function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL') {
    console.warn('[CreativeOps] Supabase not configured — edit js/supabase-config.js to enable cloud storage.');
    return false;
  }
  try {
    // window.supabase is exposed by the Supabase JS v2 CDN bundle
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.info('[CreativeOps] Supabase client initialised');
    return true;
  } catch (e) {
    console.error('[CreativeOps] Failed to init Supabase client:', e);
    return false;
  }
}
