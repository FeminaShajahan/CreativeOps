-- ─── CreativeOps — Format Adapter — Supabase Setup ──────────────────────────
-- Run this entire script in the Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the format_queue table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists format_queue (
  -- Identity
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamp with time zone default now(),

  -- File metadata
  original_filename  text,
  filename           text        not null,
  media_type         text        not null check (media_type in ('image', 'video')),
  file_size          bigint,

  -- Platform preset
  preset_id          text,
  preset_label       text,
  preset_width       integer,
  preset_height      integer,
  preset_ratio       text,
  preset_platform    text,

  -- Export settings
  output_format      text,

  -- Storage
  storage_path       text,        -- path inside the Supabase Storage bucket
  preview_url        text,        -- public URL of the original file in Storage
  thumbnail          text,        -- small base64 JPEG thumbnail (≈120px) for queue display

  -- Edit state
  brightness         real    default 0,
  contrast           real    default 0,
  saturation         real    default 0,
  rotation           integer default 0,
  flip_h             boolean default false,
  flip_v             boolean default false,
  crop_offset_x      real    default 0,
  crop_offset_y      real    default 0,
  trim_start         real    default 0,
  trim_end           real    default 0,
  mute_audio         boolean default false
);

-- 2. Row Level Security — allow all reads and writes for now
--    (lock this down to authenticated users once you add auth)
-- ─────────────────────────────────────────────────────────────────────────────
alter table format_queue enable row level security;

drop policy if exists "format_queue_allow_all" on format_queue;
create policy "format_queue_allow_all"
  on format_queue for all
  using (true)
  with check (true);

-- 3. Index for faster chronological loading
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists format_queue_created_at_idx
  on format_queue (created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Storage bucket — do this in the Dashboard UI (SQL cannot create buckets)
-- ─────────────────────────────────────────────────────────────────────────────
--   Dashboard → Storage → New Bucket
--     Name   : format-adapter-files
--     Public : YES  ← required so thumbnails load in the browser
--
-- Then add this Storage policy so anonymous uploads work:
--   Dashboard → Storage → format-adapter-files → Policies → New Policy
--     Allowed operations : INSERT, SELECT, DELETE
--     Policy definition  : true   (allows all for now)
-- ─────────────────────────────────────────────────────────────────────────────
