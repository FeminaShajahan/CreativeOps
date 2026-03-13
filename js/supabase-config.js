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

const SUPABASE_URL      = 'https://cefbjkdgdfcmfjveresi.supabase.co';   // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlZmJqa2RnZGZjbWZqdmVyZXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTg4MDAsImV4cCI6MjA4ODg5NDgwMH0.drreQSmVHzlaRUEBvAnDueZzAKd-EzWxB8tq77y2B2E';       // eyJhbGciOiJIUzI1NiIsInR...

const SUPABASE_TABLE              = 'format_queue';
const CREATIVE_DASHBOARD_TABLE    = 'creative_dashboard';
const SUPABASE_BUCKET             = 'format-adapter-files';

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
