// ─── Format Adapter ───────────────────────────────────────────────────────────

const FORMAT_PRESETS = [
  { id: 'square',    label: 'Square',        ratio: '1:1',     w: 1080, h: 1080, platform: 'Instagram' },
  { id: 'portrait',  label: 'Portrait',      ratio: '4:5',     w: 1080, h: 1350, platform: 'Instagram' },
  { id: 'story',     label: 'Story / Reel',  ratio: '9:16',    w: 1080, h: 1920, platform: 'TikTok / IG' },
  { id: 'landscape', label: 'Landscape',     ratio: '16:9',    w: 1920, h: 1080, platform: 'YouTube' },
  { id: 'banner',    label: 'Banner',        ratio: '1.91:1',  w: 1200, h: 628,  platform: 'Meta Ads' },
  { id: 'display',   label: 'Display',       ratio: '4:3',     w: 1200, h: 900,  platform: 'Google' },
];

let fmtFile = null;
let fmtImage = null;
let selectedPreset = FORMAT_PRESETS[0];
let exportQueue = [];

function renderFormat() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>Format Adapter</h1>
      <p>Upload an image and resize/crop it for any platform aspect ratio.</p>
    </div>

    <div class="format-layout">
      <!-- Left: Upload + Canvas -->
      <div>
        <div class="card">
          <div class="upload-zone" id="format-drop" onclick="document.getElementById('format-input').click()">
            <span class="upload-icon">🖼</span>
            <strong>Click to upload image</strong>
            <p>JPG, PNG, WebP supported</p>
          </div>
          <input type="file" id="format-input" accept="image/*" style="display:none" onchange="handleFormatFile(event)" />

          <div id="format-preview-section" style="display:none; margin-top:16px;">
            <div class="canvas-wrap" id="canvas-wrap">
              <canvas id="output-canvas"></canvas>
            </div>

            <div class="format-select-row" style="margin-top:12px;">
              <label>Output format</label>
              <select id="output-format">
                <option value="image/png">PNG</option>
                <option value="image/jpeg" selected>JPG (smaller file)</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>

            <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="addToQueue()">Add to Export Queue</button>
              <button class="btn btn-secondary" onclick="downloadCurrent()">Download Now</button>
              <button class="btn btn-secondary" id="save-library-btn" onclick="saveCanvasToLibrary()">Save to Library</button>
              <button class="btn btn-ghost" onclick="clearFormat()">Clear</button>
            </div>
          </div>
        </div>

        <!-- Export Queue -->
        <div class="card" style="margin-top:16px;" id="queue-card" style="display:none;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <h3>Export Queue</h3>
            <button class="btn btn-primary" onclick="downloadAll()" style="font-size:12px; padding:7px 14px;">Download All</button>
          </div>
          <div class="export-queue" id="export-queue"></div>
        </div>
      </div>

      <!-- Right: Preset selector -->
      <div>
        <div class="card">
          <h3 style="margin-bottom:14px;">Platform Presets</h3>
          <div class="preset-grid" id="preset-grid">
            ${FORMAT_PRESETS.map(p => renderPresetCard(p)).join('')}
          </div>

          <hr class="divider" />

          <h3 style="margin-bottom:10px;">Custom Size</h3>
          <div class="custom-dims">
            <input type="number" id="custom-w" placeholder="Width" min="1" max="9999" value="1200" />
            <span>×</span>
            <input type="number" id="custom-h" placeholder="Height" min="1" max="9999" value="630" />
            <button class="btn btn-secondary" style="white-space:nowrap; margin-left:4px;" onclick="applyCustomSize()">Apply</button>
          </div>

          <div id="selected-info" style="margin-top:16px; padding:12px; background:var(--bg-surface); border-radius:var(--radius-sm); border:1px solid var(--border);">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Selected Preset</div>
            <div style="font-size:14px; font-weight:600;">${selectedPreset.label}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${selectedPreset.w} × ${selectedPreset.h}px · ${selectedPreset.ratio}</div>
            <div style="font-size:11px; color:var(--accent-light); margin-top:2px;">For: ${selectedPreset.platform}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  setupFormatDrop();
}

function renderPresetCard(p) {
  // Visual thumb proportional to ratio
  const ratioParts = p.ratio.split(':');
  const rW = parseFloat(ratioParts[0]);
  const rH = parseFloat(ratioParts[1]);
  const thumbW = Math.round(36 * Math.min(1, rW / rH));
  const thumbH = Math.round(36 * Math.min(1, rH / rW));

  return `
    <div class="preset-card ${p.id === selectedPreset.id ? 'selected' : ''}" onclick="selectPreset('${p.id}')">
      <div class="preset-thumb" style="width:${thumbW}px; height:${thumbH}px;">${p.ratio}</div>
      <div class="preset-name">${p.label}</div>
      <div class="preset-ratio">${p.ratio}</div>
      <div class="preset-dims">${p.w}×${p.h}</div>
    </div>`;
}

function selectPreset(id) {
  selectedPreset = FORMAT_PRESETS.find(p => p.id === id) || FORMAT_PRESETS[0];

  document.querySelectorAll('.preset-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('onclick').includes(`'${id}'`));
  });

  const info = document.getElementById('selected-info');
  if (info) {
    info.innerHTML = `
      <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Selected Preset</div>
      <div style="font-size:14px; font-weight:600;">${selectedPreset.label}</div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${selectedPreset.w} × ${selectedPreset.h}px · ${selectedPreset.ratio}</div>
      <div style="font-size:11px; color:var(--accent-light); margin-top:2px;">For: ${selectedPreset.platform}</div>`;
  }

  if (fmtImage) drawCanvas();
}

function applyCustomSize() {
  const w = parseInt(document.getElementById('custom-w').value, 10);
  const h = parseInt(document.getElementById('custom-h').value, 10);
  if (!w || !h || w < 1 || h < 1) return;
  selectedPreset = { id: 'custom', label: 'Custom', ratio: `${w}:${h}`, w, h, platform: 'Custom' };
  if (fmtImage) drawCanvas();
}

function setupFormatDrop() {
  const zone = document.getElementById('format-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFormatFile(file);
  });
}

function handleFormatFile(event) {
  const file = event.target.files[0];
  if (file) loadFormatFile(file);
}

function loadFormatFile(file) {
  fmtFile = file;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    fmtImage = img;
    document.getElementById('format-preview-section').style.display = 'block';
    drawCanvas();
  };
  img.src = url;
}

function drawCanvas() {
  const canvas = document.getElementById('output-canvas');
  if (!canvas || !fmtImage) return;

  const tw = selectedPreset.w;
  const th = selectedPreset.h;

  canvas.width = tw;
  canvas.height = th;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tw, th);

  // Center-crop: fill target preserving aspect ratio
  const srcRatio  = fmtImage.naturalWidth  / fmtImage.naturalHeight;
  const destRatio = tw / th;

  let sx, sy, sw, sh;

  if (srcRatio > destRatio) {
    // Image is wider — crop sides
    sh = fmtImage.naturalHeight;
    sw = sh * destRatio;
    sx = (fmtImage.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    // Image is taller — crop top/bottom
    sw = fmtImage.naturalWidth;
    sh = sw / destRatio;
    sx = 0;
    sy = (fmtImage.naturalHeight - sh) / 2;
  }

  ctx.drawImage(fmtImage, sx, sy, sw, sh, 0, 0, tw, th);

  // Scale canvas display
  const maxDisplay = 400;
  const displayScale = Math.min(maxDisplay / tw, maxDisplay / th, 1);
  canvas.style.width  = Math.round(tw * displayScale) + 'px';
  canvas.style.height = Math.round(th * displayScale) + 'px';
}

function getCurrentDataURL() {
  const canvas = document.getElementById('output-canvas');
  const fmt = document.getElementById('output-format').value;
  return canvas.toDataURL(fmt, 0.92);
}

function downloadCurrent() {
  if (!fmtImage) return;
  drawCanvas();
  const fmt = document.getElementById('output-format').value;
  const ext = fmt.split('/')[1].replace('jpeg', 'jpg');
  const url = getCurrentDataURL();
  triggerDownload(url, `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${ext}`);
  incrementStat('co_formats_generated');
  logActivity(
    `Format adapted: <strong>${selectedPreset.label}</strong> (${selectedPreset.w}×${selectedPreset.h}px) from ${fmtFile.name}`,
    'accent'
  );
}

function addToQueue() {
  if (!fmtImage) return;
  drawCanvas();
  const fmt = document.getElementById('output-format').value;
  const ext = fmt.split('/')[1].replace('jpeg', 'jpg');
  const dataURL = getCurrentDataURL();

  exportQueue.push({
    id: Date.now(),
    preset: { ...selectedPreset },
    dataURL,
    filename: `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${ext}`,
  });

  renderQueue();
  incrementStat('co_formats_generated');
  logActivity(`Added <strong>${selectedPreset.label}</strong> to export queue`, 'accent');
}

function renderQueue() {
  const queueEl = document.getElementById('export-queue');
  const queueCard = document.getElementById('queue-card');
  if (!queueEl) return;

  if (exportQueue.length > 0) {
    queueCard.style.display = 'block';
  }

  queueEl.innerHTML = exportQueue.map(item => `
    <div class="export-item" id="qi-${item.id}">
      <div class="export-thumb">
        <img src="${item.dataURL}" style="width:100%; height:100%; object-fit:cover;" />
      </div>
      <div class="export-info">
        <div class="export-name">${item.preset.label} · ${item.preset.ratio}</div>
        <div class="export-size">${item.preset.w}×${item.preset.h}px · ${item.filename}</div>
      </div>
      <button class="export-btn" onclick="downloadQueueItem(${item.id})">↓ Download</button>
    </div>`).join('');
}

function downloadQueueItem(id) {
  const item = exportQueue.find(i => i.id === id);
  if (item) triggerDownload(item.dataURL, item.filename);
}

function downloadAll() {
  exportQueue.forEach((item, i) => {
    setTimeout(() => triggerDownload(item.dataURL, item.filename), i * 300);
  });
}

function triggerDownload(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  a.click();
}

function clearFormat() {
  fmtFile = null;
  fmtImage = null;
  exportQueue = [];
  renderFormat();
}

// ── Supabase ──────────────────────────────────────────────────────────────────

/** Updates the Supabase status badge in the page header. */
function updateSupabaseStatus(state) {
  const el = document.getElementById('supabase-status');
  if (!el) return;
  const map = {
    checking:     { cls: 'backend-checking', text: '◌ Connecting to DB…' },
    connected:    { cls: 'backend-online',   text: '● Supabase Connected' },
    error:        { cls: 'backend-offline',  text: '○ DB Unavailable' },
    unconfigured: { cls: 'backend-offline',  text: '○ Supabase not configured' },
  };
  const s = map[state] || map.checking;
  el.className  = `backend-badge ${s.cls}`;
  el.textContent = s.text;
}

/** Uploads the original file + metadata to Supabase and updates the queue item in-place. */
async function uploadToSupabase(item) {
  if (!sbClient) return;

  item.uploading = true;
  renderQueue();

  try {
    // Shared UUID — both creative_dashboard and format_queue will use this same id
    const sharedId     = crypto.randomUUID();
    const safeFilename = (item.originalFilename || 'file').replaceAll(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath  = `uploads/${Date.now()}-${safeFilename}`;

    const { error: storageErr } = await sbClient.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, item.file, { cacheControl: '3600', upsert: false });
    if (storageErr) throw storageErr;

    item.storagePath = storagePath;
    const { data: urlData } = sbClient.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    const snap = item.editStateSnapshot;

    const { data: row, error: dbErr } = await sbClient
      .from(SUPABASE_TABLE)
      .insert({
        id:                sharedId,
        original_filename: item.originalFilename,
        filename:          item.filename,
        media_type:        item.mediaType,
        file_size:         item.file.size,
        preset_id:         item.preset.id,
        preset_label:      item.preset.label,
        preset_width:      item.preset.w,
        preset_height:     item.preset.h,
        preset_ratio:      item.preset.ratio,
        preset_platform:   item.preset.platform,
        output_format:     item.outputFormat,
        storage_path:      storagePath,
        preview_url:       urlData.publicUrl,
        thumbnail:         item.thumbnail,
        brightness:        snap.brightness,
        contrast:          snap.contrast,
        saturation:        snap.saturation,
        rotation:          snap.rotation,
        flip_h:            snap.flipH,
        flip_v:            snap.flipV,
        crop_offset_x:     snap.cropOffsetX,
        crop_offset_y:     snap.cropOffsetY,
        trim_start:        snap.trimStart,
        trim_end:          snap.trimEnd,
        mute_audio:        snap.muteAudio,
      })
      .select()
      .single();
    if (dbErr) throw dbErr;

    item.dbId      = row.id;
    item.uploading = false;
    updateSupabaseStatus('connected');
    renderQueue();

    // Also record in creative_dashboard (basic asset catalog) — same id as format_queue
    const fileFormat = (item.originalFilename || '').split('.').pop().toLowerCase() || '';
    await sbClient.from(CREATIVE_DASHBOARD_TABLE).insert({
      id:           sharedId,
      name:         item.originalFilename,
      media_type:   item.mediaType,
      format:       fileFormat,
      file_size:    item.file.size,
      width:        item.srcWidth   || null,
      height:       item.srcHeight  || null,
      duration:     item.srcDuration || null,
      storage_path: storagePath,
      thumbnail:    item.thumbnail,
      status:       'active',
    });
  } catch (err) {
    console.error('[CreativeOps] Supabase upload failed:', err);
    item.uploading   = false;
    item.uploadError = err.message;
    renderQueue();
  }
}

/** Loads saved queue rows from Supabase and populates the export queue. */
async function loadQueueFromSupabase() {
  if (!sbClient) {
    updateSupabaseStatus('unconfigured');
    return;
  }
  updateSupabaseStatus('checking');
  try {
    const { data, error } = await sbClient
      .from(SUPABASE_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    updateSupabaseStatus('connected');
    if (!data || data.length === 0) return;

    let counter = Date.now();
    exportQueue = data.map(row => ({
      id:               ++counter,
      dbId:             row.id,
      file:             null,
      mediaType:        row.media_type,
      preset: {
        id:       row.preset_id,      label:    row.preset_label,
        w:        row.preset_width,   h:        row.preset_height,
        ratio:    row.preset_ratio,   platform: row.preset_platform,
      },
      editStateSnapshot: {
        brightness:  row.brightness,  contrast:    row.contrast,
        saturation:  row.saturation,  rotation:    row.rotation,
        flipH:       row.flip_h,      flipV:       row.flip_v,
        cropOffsetX: row.crop_offset_x, cropOffsetY: row.crop_offset_y,
        trimStart:   row.trim_start,  trimEnd:     row.trim_end,
        muteAudio:   row.mute_audio,
      },
      outputFormat:     row.output_format,
      thumbnail:        row.thumbnail || '',
      previewDataURL:   row.thumbnail || '',
      storagePath:      row.storage_path,
      originalFilename: row.original_filename,
      filename:         row.filename,
      uploading:        false,
      uploadError:      null,
    }));

    renderQueue();
  } catch (err) {
    console.error('[CreativeOps] Failed to load queue from Supabase:', err);
    updateSupabaseStatus('error');
  }
}

/** Generates a small (~120px) JPEG thumbnail of the current canvas for DB storage. */
function generateThumbnail() {
  const canvas = document.getElementById('output-canvas');
  if (!canvas) return '';
  const scale = Math.min(120 / canvas.width, 120 / canvas.height, 1);
  const tc    = document.createElement('canvas');
  tc.width    = Math.round(canvas.width  * scale);
  tc.height   = Math.round(canvas.height * scale);
  const ctx   = tc.getContext('2d');
  ctx.filter  = getFilterString();
  ctx.drawImage(canvas, 0, 0, tc.width, tc.height);
  return tc.toDataURL('image/jpeg', 0.75);
}

/** Captures a frame from the video preview as a small JPEG thumbnail. */
function generateVideoThumbnail() {
  const video = document.getElementById('preview-video');
  if (!video?.videoWidth) return '';
  const scale = Math.min(120 / video.videoWidth, 120 / video.videoHeight, 1);
  const tc    = document.createElement('canvas');
  tc.width    = Math.round(video.videoWidth  * scale);
  tc.height   = Math.round(video.videoHeight * scale);
  tc.getContext('2d').drawImage(video, 0, 0, tc.width, tc.height);
  return tc.toDataURL('image/jpeg', 0.75);
// ─── Save canvas export to backend library ────────────────────────────────────
function saveCanvasToLibrary() {
  if (!fmtImage) return;
  drawCanvas();
  const canvas = document.getElementById('output-canvas');
  const fmt = document.getElementById('output-format').value;
  const btn = document.getElementById('save-library-btn');

  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  canvas.toBlob(async blob => {
    const ext = fmt.split('/')[1].replace('jpeg', 'jpg');
    const filename = `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${ext}`;
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('name', filename);
    formData.append('platform', selectedPreset.platform);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
      if (res.ok) {
        if (btn) { btn.textContent = '✓ Saved'; btn.disabled = false; }
        logActivity(`Saved <strong>${filename}</strong> to library (${selectedPreset.w}×${selectedPreset.h}px)`, 'success');
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      if (btn) { btn.textContent = 'Save to Library'; btn.disabled = false; }
      logActivity(`Could not save to library — is the server running?`, 'warning');
    }
  }, fmt, 0.92);
}
