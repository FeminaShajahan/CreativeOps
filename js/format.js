// ─── Format Adapter ──────────────────────────────────────────────────────────

const BACKEND_URL = 'http://localhost:8080';

const FORMAT_PRESETS = [
  { id: 'square',    label: 'Square',       ratio: '1:1',    w: 1080, h: 1080, platform: 'Instagram' },
  { id: 'portrait',  label: 'Portrait',     ratio: '4:5',    w: 1080, h: 1350, platform: 'Instagram' },
  { id: 'story',     label: 'Story / Reel', ratio: '9:16',   w: 1080, h: 1920, platform: 'TikTok / IG' },
  { id: 'landscape', label: 'Landscape',    ratio: '16:9',   w: 1920, h: 1080, platform: 'YouTube' },
  { id: 'banner',    label: 'Banner',       ratio: '1.91:1', w: 1200, h: 628,  platform: 'Meta Ads' },
  { id: 'display',   label: 'Display',      ratio: '4:3',    w: 1200, h: 900,  platform: 'Google' },
];

// ── State ─────────────────────────────────────────────────────────────────────
let fmtFile       = null;
let fmtImage      = null;
let fmtMediaType  = null;   // 'image' | 'video'
let selectedPreset = FORMAT_PRESETS[0];
let exportQueue   = [];
let backendAvailable = false;

let editState = {
  brightness:  0,    // -100 to +100
  contrast:    0,    // -100 to +100
  saturation:  0,    // -100 to +100
  rotation:    0,    // 0, 90, 180, 270
  flipH:       false,
  flipV:       false,
  cropOffsetX: 0,    // -0.5 to 0.5 (fractional shift of image width)
  cropOffsetY: 0,    // -0.5 to 0.5 (fractional shift of image height)
  trimStart:   0,
  trimEnd:     0,
  muteAudio:   false,
  activeTab:   'crop',
};

let cropDrag = { active: false, startX: 0, startY: 0, startOX: 0, startOY: 0 };

// ── Backend health check ──────────────────────────────────────────────────────
async function checkBackend() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/format/health`, {
      signal: AbortSignal.timeout(2500),
    });
    backendAvailable = resp.ok;
  } catch {
    backendAvailable = false;
  }
  const el = document.getElementById('backend-status');
  if (el) {
    el.className = 'backend-badge ' + (backendAvailable ? 'backend-online' : 'backend-offline');
    el.textContent = backendAvailable ? '● Backend Online' : '○ Backend Offline (frontend mode)';
  }
  updateExportButton();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderFormat() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
        <div>
          <h1>Format Adapter</h1>
          <p>Upload an image or video and adapt it for any platform — resize, crop, rotate, adjust colors.</p>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          <span id="backend-status"   class="backend-badge backend-checking">◌ Checking backend…</span>
          <span id="supabase-status"  class="backend-badge backend-checking">◌ Connecting to DB…</span>
        </div>
      </div>
    </div>

    <div class="format-layout">

      <!-- ── Left column ─────────────────────────────────── -->
      <div class="format-left">
        <div class="card" id="upload-card">

          <!-- Upload zone (visible before file is loaded) -->
          <div class="upload-zone" id="format-drop"
               onclick="document.getElementById('format-input').click()">
            <span class="upload-icon">⊡</span>
            <strong>Click or drag to upload</strong>
            <p>Images: JPG, PNG, WebP &nbsp;·&nbsp; Videos: MP4, MOV, WebM</p>
          </div>
          <input type="file" id="format-input"
                 accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                 style="display:none"
                 onchange="handleFormatFile(event)" />

          <!-- Preview section (hidden until file loaded) -->
          <div id="format-preview-section" style="display:none;">

            <!-- File info bar -->
            <div class="file-info-bar" id="file-info-bar"></div>

            <!-- Canvas (images) -->
            <div class="canvas-wrap" id="canvas-wrap" style="display:none; cursor:grab;"
                 title="Drag to reposition crop">
              <canvas id="output-canvas"></canvas>
              <div class="canvas-hint" id="canvas-hint">Drag to reposition crop</div>
            </div>

            <!-- Video preview -->
            <div class="video-wrap" id="video-wrap" style="display:none;">
              <video id="preview-video" controls
                     style="width:100%; border-radius:var(--radius-md); max-height:300px; background:#000;">
              </video>
            </div>

            <!-- Edit tabs -->
            <div class="edit-tabs">
              <button class="edit-tab active" id="tab-crop"   onclick="switchEditTab('crop')">Crop &amp; Transform</button>
              <button class="edit-tab"        id="tab-adjust" onclick="switchEditTab('adjust')">Adjustments</button>
              <button class="edit-tab"        id="tab-video"  onclick="switchEditTab('video')" style="display:none;">Video</button>
            </div>

            <!-- Panel: Crop & Transform -->
            <div class="edit-panel" id="panel-crop">
              <div class="crop-hint-row" id="crop-hint-row" style="display:none;">
                <span class="text-muted" style="font-size:12px;">Drag the preview to reposition the crop area</span>
                <button class="btn btn-ghost btn-sm" onclick="resetCropOffset()">Reset position</button>
              </div>
              <div class="transform-row">
                <div class="control-group">
                  <label class="ctrl-label">Rotate</label>
                  <div class="btn-row">
                    <button class="btn btn-secondary btn-sm" onclick="rotateImage(-90)">↺ 90° CCW</button>
                    <button class="btn btn-secondary btn-sm" onclick="rotateImage(90)">↻ 90° CW</button>
                  </div>
                </div>
                <div class="control-group">
                  <label class="ctrl-label">Flip</label>
                  <div class="btn-row">
                    <button class="btn btn-secondary btn-sm" id="flip-h-btn" onclick="toggleFlip('h')">↔ Horizontal</button>
                    <button class="btn btn-secondary btn-sm" id="flip-v-btn" onclick="toggleFlip('v')">↕ Vertical</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Panel: Adjustments -->
            <div class="edit-panel" id="panel-adjust" style="display:none;">
              <div class="sliders-grid">
                ${renderSlider('brightness', 'Brightness', 0)}
                ${renderSlider('contrast',   'Contrast',   0)}
                ${renderSlider('saturation', 'Saturation', 0)}
              </div>
              <button class="btn btn-ghost btn-sm" style="margin-top:12px;"
                      onclick="resetAdjustments()">Reset adjustments</button>
            </div>

            <!-- Panel: Video -->
            <div class="edit-panel" id="panel-video" style="display:none;">
              <div class="video-controls-grid">
                <div class="control-group">
                  <label class="ctrl-label">Trim start (seconds)</label>
                  <input type="number" id="trim-start" value="0" min="0" step="0.1"
                         style="width:100px;" onchange="updateTrimState()" />
                </div>
                <div class="control-group">
                  <label class="ctrl-label">Trim end (0 = full length)</label>
                  <input type="number" id="trim-end" value="0" min="0" step="0.1"
                         style="width:100px;" onchange="updateTrimState()" />
                </div>
                <div class="control-group" style="grid-column: 1 / -1;">
                  <label class="ctrl-label toggle-label" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="mute-audio" onchange="updateTrimState()" />
                    Mute audio in output
                  </label>
                </div>
              </div>
              <p class="text-muted" style="font-size:11px; margin-top:10px;">
                Video processing requires the backend server to be running.
              </p>
            </div>

            <!-- Export controls -->
            <div class="export-controls">
              <div class="format-select-row">
                <label>Output format</label>
                <select id="output-format" onchange="updateExportButton()">
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg" selected>JPG</option>
                  <option value="image/webp">WebP (frontend only)</option>
                  <option value="video/mp4" id="opt-mp4" style="display:none;">MP4 (backend only)</option>
                </select>
              </div>
              <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                <button class="btn btn-primary fmt-export-btn" id="export-btn"
                        onclick="processAndDownload()">⬇ Download</button>
                <button class="btn btn-secondary" onclick="addToQueue()">+ Add to Queue</button>
                <button class="btn btn-ghost"     onclick="clearFormat()">✕ Clear</button>
              </div>
            </div>

          </div><!-- /format-preview-section -->
        </div><!-- /card -->

        <!-- Export Queue -->
        <div class="card" style="margin-top:16px; display:none;" id="queue-card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <h3>Export Queue <span class="badge badge-accent" id="queue-count">0</span></h3>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-primary"  onclick="downloadAll()"  style="font-size:12px; padding:7px 14px;">↓ Download All</button>
              <button class="btn btn-ghost"    onclick="clearQueue()"   style="font-size:12px; padding:7px 14px;">Clear</button>
            </div>
          </div>
          <div class="export-queue" id="export-queue"></div>
        </div>

      </div><!-- /format-left -->

      <!-- ── Right column ────────────────────────────────── -->
      <div class="format-right">
        <div class="card">
          <h3 style="margin-bottom:14px;">Platform Presets</h3>
          <div class="preset-grid" id="preset-grid">
            ${FORMAT_PRESETS.map(p => renderPresetCard(p)).join('')}
          </div>

          <hr class="divider" />

          <h3 style="margin-bottom:10px;">Custom Size</h3>
          <div class="custom-dims">
            <input type="number" id="custom-w" placeholder="Width"  min="1" max="9999" value="1200" />
            <span>×</span>
            <input type="number" id="custom-h" placeholder="Height" min="1" max="9999" value="630" />
            <button class="btn btn-secondary" style="white-space:nowrap; margin-left:4px;"
                    onclick="applyCustomSize()">Apply</button>
          </div>

          <div id="selected-info" class="selected-info-box">
            ${renderSelectedInfo()}
          </div>
        </div>
      </div><!-- /format-right -->

    </div><!-- /format-layout -->
  `;

  setupFormatDrop();
  checkBackend();

  const sbReady = initSupabase();
  if (sbReady) {
    loadQueueFromSupabase();
  } else {
    updateSupabaseStatus('unconfigured');
  }
}

// ── Preset helpers ────────────────────────────────────────────────────────────
function renderPresetCard(p) {
  const ratioParts = p.ratio.split(':');
  const rW = Number.parseFloat(ratioParts[0]);
  const rH = Number.parseFloat(ratioParts[1] || 1);
  const thumbW = Math.round(36 * Math.min(1, rW / rH));
  const thumbH = Math.round(36 * Math.min(1, rH / rW));
  return `
    <div class="preset-card ${p.id === selectedPreset.id ? 'selected' : ''}"
         onclick="selectPreset('${p.id}')">
      <div class="preset-thumb" style="width:${thumbW}px; height:${thumbH}px;">${p.ratio}</div>
      <div class="preset-name">${p.label}</div>
      <div class="preset-ratio">${p.ratio}</div>
      <div class="preset-dims">${p.w}×${p.h}</div>
    </div>`;
}

function renderSelectedInfo() {
  return `
    <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Selected Preset</div>
    <div style="font-size:14px; font-weight:600;">${selectedPreset.label}</div>
    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${selectedPreset.w} × ${selectedPreset.h}px · ${selectedPreset.ratio}</div>
    <div style="font-size:11px; color:var(--accent-light); margin-top:2px;">For: ${selectedPreset.platform}</div>`;
}

function renderSlider(name, label, value) {
  return `
    <div class="control-group">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <label class="ctrl-label">${label}</label>
        <span class="slider-val" id="${name}-val">${value > 0 ? '+' : ''}${value}</span>
      </div>
      <input type="range" class="fmt-slider" id="${name}-slider"
             min="-100" max="100" value="${value}"
             oninput="updateAdjustment('${name}', this.value)" />
    </div>`;
}

function selectPreset(id) {
  selectedPreset = FORMAT_PRESETS.find(p => p.id === id) || FORMAT_PRESETS[0];
  document.querySelectorAll('.preset-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('onclick').includes(`'${id}'`));
  });
  const info = document.getElementById('selected-info');
  if (info) info.innerHTML = renderSelectedInfo();
  if (fmtImage) drawCanvas();
}

function applyCustomSize() {
  const w = Number.parseInt(document.getElementById('custom-w').value, 10);
  const h = Number.parseInt(document.getElementById('custom-h').value, 10);
  if (!w || !h || w < 1 || h < 1) return;
  selectedPreset = { id: 'custom', label: 'Custom', ratio: `${w}:${h}`, w, h, platform: 'Custom' };
  const info = document.getElementById('selected-info');
  if (info) info.innerHTML = renderSelectedInfo();
  if (fmtImage) drawCanvas();
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function setupFormatDrop() {
  const zone = document.getElementById('format-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      loadFormatFile(file);
    }
  });
}

function handleFormatFile(event) {
  const file = event.target.files[0];
  if (file) loadFormatFile(file);
}

function loadFormatFile(file, options = {}) {
  const { savedState, keepQueue } = options;
  fmtFile      = file;
  fmtMediaType = file.type.startsWith('video/') ? 'video' : 'image';

  editState = savedState
    ? { ...savedState, activeTab: savedState.activeTab || 'crop' }
    : {
        brightness: 0, contrast: 0, saturation: 0,
        rotation: 0, flipH: false, flipV: false,
        cropOffsetX: 0, cropOffsetY: 0,
        trimStart: 0, trimEnd: 0, muteAudio: false,
        activeTab: 'crop',
      };

  if (!keepQueue) exportQueue = [];

  if (fmtMediaType === 'image') {
    fmtImage = null;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      fmtImage = img;
      showPreviewSection();
      drawCanvas();
      setupCropDrag();
      updateFileInfoBar();
      if (savedState) applyEditStateToUI();
    };
    img.src = url;
  } else {
    fmtImage = null;
    showPreviewSection();
    const videoEl = document.getElementById('preview-video');
    if (videoEl) {
      videoEl.src = URL.createObjectURL(file);
      videoEl.onloadedmetadata = () => {
        if (!savedState) {
          editState.trimEnd = Math.round(videoEl.duration * 10) / 10;
        }
        const trimEndEl = document.getElementById('trim-end');
        if (trimEndEl) trimEndEl.value = editState.trimEnd;
        updateFileInfoBar();
        if (savedState) applyEditStateToUI();
      };
    }
    updateFileInfoBar();
  }
}

/** Syncs all UI controls (sliders, flip buttons, video fields) to the current editState. */
function applyEditStateToUI() {
  ['brightness', 'contrast', 'saturation'].forEach(name => {
    const slider = document.getElementById(name + '-slider');
    const valEl  = document.getElementById(name + '-val');
    if (slider) slider.value = editState[name];
    if (valEl)  valEl.textContent = (editState[name] > 0 ? '+' : '') + editState[name];
  });
  const hBtn = document.getElementById('flip-h-btn');
  const vBtn = document.getElementById('flip-v-btn');
  if (hBtn) hBtn.classList.toggle('btn-active', editState.flipH);
  if (vBtn) vBtn.classList.toggle('btn-active', editState.flipV);
  if (fmtMediaType === 'video') {
    const s = document.getElementById('trim-start');
    const e = document.getElementById('trim-end');
    const m = document.getElementById('mute-audio');
    if (s) s.value   = editState.trimStart;
    if (e) e.value   = editState.trimEnd;
    if (m) m.checked = editState.muteAudio;
  }
}

function showPreviewSection() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.style.display = val; };

  set('format-drop',             'none');
  set('format-preview-section',  'block');

  if (fmtMediaType === 'image') {
    applyImagePreviewLayout(set);
  } else {
    applyVideoPreviewLayout(set);
  }
  updateExportButton();
}

function applyImagePreviewLayout(set) {
  set('canvas-wrap',   'flex');
  set('video-wrap',    'none');
  set('tab-video',     'none');
  set('opt-mp4',       'none');
  set('crop-hint-row', 'flex');
}

function applyVideoPreviewLayout(set) {
  set('canvas-wrap', 'none');
  set('video-wrap',  'block');
  set('tab-video',   '');
  set('opt-mp4',     '');
  const fmtSel = document.getElementById('output-format');
  if (fmtSel) fmtSel.value = 'video/mp4';
  switchEditTab('video');
}

function updateFileInfoBar() {
  const bar = document.getElementById('file-info-bar');
  if (!bar || !fmtFile) return;
  const size = fmtFile.size < 1024 * 1024
    ? (fmtFile.size / 1024).toFixed(1) + ' KB'
    : (fmtFile.size / 1024 / 1024).toFixed(1) + ' MB';
  const dimStr = fmtMediaType === 'image' && fmtImage
    ? ` · ${fmtImage.naturalWidth}×${fmtImage.naturalHeight}px`
    : '';
  const icon = fmtMediaType === 'image' ? '🖼' : '🎬';
  bar.innerHTML = `
    <span class="file-badge-icon">${icon}</span>
    <span class="file-badge-name">${fmtFile.name}</span>
    <span class="file-badge-size">${size}${dimStr}</span>
    <button class="btn btn-ghost btn-xs" onclick="clearFormat()" style="margin-left:auto;">✕ Remove</button>
  `;
}

// ── Edit tabs ─────────────────────────────────────────────────────────────────
function switchEditTab(tab) {
  editState.activeTab = tab;
  ['crop', 'adjust', 'video'].forEach(t => {
    const btn   = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    if (btn)   btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
}

// ── Adjustments ───────────────────────────────────────────────────────────────
function updateAdjustment(name, value) {
  const v = Number.parseInt(value, 10);
  editState[name] = v;
  const valEl = document.getElementById(`${name}-val`);
  if (valEl) valEl.textContent = (v > 0 ? '+' : '') + v;
  if (fmtMediaType === 'image') drawCanvas();
  else updateVideoPreview();
}

function resetAdjustments() {
  ['brightness', 'contrast', 'saturation'].forEach(name => {
    editState[name] = 0;
    const slider = document.getElementById(`${name}-slider`);
    const valEl  = document.getElementById(`${name}-val`);
    if (slider) slider.value = 0;
    if (valEl)  valEl.textContent = '0';
  });
  if (fmtMediaType === 'image') drawCanvas();
  else updateVideoPreview();
}

// ── Transform controls ────────────────────────────────────────────────────────
function rotateImage(degrees) {
  editState.rotation = ((editState.rotation + degrees) % 360 + 360) % 360;
  if (fmtMediaType === 'image' && fmtImage) drawCanvas();
}

function toggleFlip(axis) {
  if (axis === 'h') {
    editState.flipH = !editState.flipH;
    const btn = document.getElementById('flip-h-btn');
    if (btn) btn.classList.toggle('btn-active', editState.flipH);
  } else {
    editState.flipV = !editState.flipV;
    const btn = document.getElementById('flip-v-btn');
    if (btn) btn.classList.toggle('btn-active', editState.flipV);
  }
  if (fmtMediaType === 'image' && fmtImage) drawCanvas();
}

function resetCropOffset() {
  editState.cropOffsetX = 0;
  editState.cropOffsetY = 0;
  if (fmtImage) drawCanvas();
}

// ── Video trim state ──────────────────────────────────────────────────────────
function updateTrimState() {
  const s = document.getElementById('trim-start');
  const e = document.getElementById('trim-end');
  const m = document.getElementById('mute-audio');
  if (s) editState.trimStart = Number.parseFloat(s.value) || 0;
  if (e) editState.trimEnd   = Number.parseFloat(e.value) || 0;
  if (m) editState.muteAudio = m.checked;
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

/** Returns the source crop rect {sx, sy, sw, sh} for the given dest dimensions. */
function computeCropRect(imgW, imgH, drawW, drawH) {
  const srcRatio  = imgW / imgH;
  const destRatio = drawW / drawH;
  let sx, sy, sw, sh;
  if (srcRatio > destRatio) {
    sh = imgH;
    sw = sh * destRatio;
    const maxSx = imgW - sw;
    sx = Math.max(0, Math.min(maxSx, maxSx / 2 + editState.cropOffsetX * imgW));
    sy = 0;
  } else {
    sw = imgW;
    sh = sw / destRatio;
    const maxSy = imgH - sh;
    sx = 0;
    sy = Math.max(0, Math.min(maxSy, maxSy / 2 + editState.cropOffsetY * imgH));
  }
  return { sx, sy, sw, sh };
}

function drawCanvas() {
  const canvas = document.getElementById('output-canvas');
  if (!canvas || !fmtImage) return;

  const tw = selectedPreset.w;
  const th = selectedPreset.h;
  canvas.width  = tw;
  canvas.height = th;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tw, th);

  const rot         = editState.rotation;
  const isRotated90 = rot === 90 || rot === 270;
  const drawW       = isRotated90 ? th : tw;
  const drawH       = isRotated90 ? tw : th;

  const { sx, sy, sw, sh } = computeCropRect(
    fmtImage.naturalWidth, fmtImage.naturalHeight, drawW, drawH
  );

  ctx.save();
  ctx.translate(tw / 2, th / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (editState.flipH) ctx.scale(-1,  1);
  if (editState.flipV) ctx.scale( 1, -1);
  ctx.drawImage(fmtImage, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  canvas.style.filter = getFilterString();

  const displayScale  = Math.min(380 / tw, 380 / th, 1);
  canvas.style.width  = Math.round(tw * displayScale) + 'px';
  canvas.style.height = Math.round(th * displayScale) + 'px';
}

function getFilterString() {
  const b = 100 + editState.brightness;
  const c = 100 + editState.contrast;
  const s = 100 + editState.saturation;
  if (b === 100 && c === 100 && s === 100) return 'none';
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
}

function updateVideoPreview() {
  const videoEl = document.getElementById('preview-video');
  if (videoEl) videoEl.style.filter = getFilterString();
}

// ── Crop drag interaction ─────────────────────────────────────────────────────
function setupCropDrag() {
  const canvas = document.getElementById('output-canvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    cropDrag = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      startOX: editState.cropOffsetX,
      startOY: editState.cropOffsetY,
    };
    canvas.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', e => {
    if (!cropDrag.active) return;
    const displayW = Number.parseFloat(canvas.style.width)  || canvas.width;
    const displayH = Number.parseFloat(canvas.style.height) || canvas.height;
    const dx = e.clientX - cropDrag.startX;
    const dy = e.clientY - cropDrag.startY;

    // Convert drag delta to fractional crop offset
    editState.cropOffsetX = Math.max(-0.49, Math.min(0.49, cropDrag.startOX - dx / displayW));
    editState.cropOffsetY = Math.max(-0.49, Math.min(0.49, cropDrag.startOY - dy / displayH));
    drawCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (cropDrag.active) {
      cropDrag.active = false;
      const c = document.getElementById('output-canvas');
      if (c) c.style.cursor = 'grab';
    }
  });
}

// ── Export helpers ────────────────────────────────────────────────────────────

/** Returns a dataURL with CSS filters applied via offscreen canvas */
function getFilteredDataURL(fmt) {
  const srcCanvas = document.getElementById('output-canvas');
  const offscreen = document.createElement('canvas');
  offscreen.width  = srcCanvas.width;
  offscreen.height = srcCanvas.height;
  const ctx = offscreen.getContext('2d');
  ctx.filter = getFilterString();
  ctx.drawImage(srcCanvas, 0, 0);
  return offscreen.toDataURL(fmt || 'image/jpeg', 0.92);
}

function updateExportButton() {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  const isVideo = fmtMediaType === 'video';
  if (backendAvailable && !isWebPSelected()) {
    btn.textContent = isVideo ? '⬇ Export via Backend' : '⬇ Export (Backend)';
  } else {
    btn.textContent = isVideo ? '⬇ Export (requires backend)' : '⬇ Download';
  }
}

function isWebPSelected() {
  return document.getElementById('output-format')?.value === 'image/webp';
}

// ── Main export function ──────────────────────────────────────────────────────
async function processAndDownload() {
  if (!fmtFile) return;

  const isVideo = fmtMediaType === 'video';
  if (isVideo && !backendAvailable) {
    alert('Video processing requires the backend server.\nPlease start the Java backend (port 8080) and try again.');
    return;
  }

  if (backendAvailable && !isWebPSelected()) {
    await processWithBackend();
  } else {
    downloadFrontend();
  }
}

/** Export via Java backend */
async function processWithBackend() {
  const btn = document.getElementById('export-btn');
  if (btn) { btn.textContent = '⏳ Processing…'; btn.disabled = true; }

  const fmt    = document.getElementById('output-format').value;
  const fmtExt = fmt.split('/')[1].replace('jpeg', 'jpg');

  const req = {
    type:            fmtMediaType,
    targetWidth:     selectedPreset.w,
    targetHeight:    selectedPreset.h,
    outputFormat:    fmtExt,
    brightness:      editState.brightness,
    contrast:        editState.contrast,
    saturation:      editState.saturation,
    rotation:        editState.rotation,
    flipHorizontal:  editState.flipH,
    flipVertical:    editState.flipV,
    cropOffsetX:     editState.cropOffsetX,
    cropOffsetY:     editState.cropOffsetY,
    trimStart:       editState.trimStart,
    trimEnd:         editState.trimEnd,
    muteAudio:       editState.muteAudio,
  };

  const formData = new FormData();
  formData.append('file', fmtFile);
  formData.append('request', new Blob([JSON.stringify(req)], { type: 'application/json' }));

  try {
    const resp = await fetch(`${BACKEND_URL}/api/format/process`, {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Backend error ${resp.status}: ${errText}`);
    }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const name = `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${fmtExt}`;
    triggerDownload(url, name);
    incrementStat('co_formats_generated');
    logActivity(`Format adapted: <strong>${selectedPreset.label}</strong> (${selectedPreset.w}×${selectedPreset.h}) via backend`, 'accent');
  } catch (err) {
    console.error('Backend processing failed:', err);
    if (fmtMediaType === 'image') {
      alert(`Backend failed: ${err.message}\nFalling back to frontend export.`);
      downloadFrontend();
    } else {
      alert(`Backend failed: ${err.message}`);
    }
  } finally {
    if (btn) { btn.disabled = false; updateExportButton(); }
  }
}

/** Export via browser canvas (images only) */
function downloadFrontend() {
  if (!fmtImage) return;
  drawCanvas();
  const fmt  = document.getElementById('output-format').value;
  const ext  = fmt.split('/')[1].replace('jpeg', 'jpg');
  const url  = getFilteredDataURL(fmt);
  const name = `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${ext}`;
  triggerDownload(url, name);
  incrementStat('co_formats_generated');
  logActivity(`Format adapted: <strong>${selectedPreset.label}</strong> (${selectedPreset.w}×${selectedPreset.h}) from ${fmtFile.name}`, 'accent');
}

// ── Queue ─────────────────────────────────────────────────────────────────────
function addToQueue() {
  if (!fmtFile) return;

  const fmt = document.getElementById('output-format').value;
  const ext = fmt.split('/')[1].replace('jpeg', 'jpg');

  let previewDataURL = '';
  let thumbnail      = '';
  if (fmtMediaType === 'image' && fmtImage) {
    drawCanvas();
    previewDataURL = getFilteredDataURL(fmt);
    thumbnail      = generateThumbnail();
  } else if (fmtMediaType === 'video') {
    thumbnail = generateVideoThumbnail();
  }

  const item = {
    id:               Date.now(),   // local numeric id — used in DOM/onclick
    dbId:             null,         // Supabase UUID — set after DB insert
    file:             fmtFile,
    mediaType:        fmtMediaType,
    preset:           { ...selectedPreset },
    editStateSnapshot:{ ...editState },
    outputFormat:     fmt,
    previewDataURL,
    thumbnail,
    storagePath:      null,
    originalFilename: fmtFile.name,
    filename:         `${selectedPreset.id}_${selectedPreset.w}x${selectedPreset.h}.${ext}`,
    uploading:        false,
    uploadError:      null,
  };

  exportQueue.push(item);
  renderQueue();

  // Upload to Supabase in the background (fire-and-forget)
  uploadToSupabase(item);

  incrementStat('co_formats_generated');
  logActivity(`Added <strong>${selectedPreset.label}</strong> to export queue`, 'accent');
}

function renderQueue() {
  const queueEl   = document.getElementById('export-queue');
  const queueCard = document.getElementById('queue-card');
  const countEl   = document.getElementById('queue-count');
  if (!queueEl) return;

  if (exportQueue.length > 0) queueCard.style.display = 'block';
  if (countEl) countEl.textContent = exportQueue.length;

  queueEl.innerHTML = exportQueue.map(item => {
    const thumbSrc = item.thumbnail || item.previewDataURL || '';
    const isImage  = item.mediaType === 'image';

    let statusBadge = '';
    if (item.uploading)        statusBadge = `<span class="db-badge db-badge-uploading">↑ Saving…</span>`;
    else if (item.uploadError) statusBadge = `<span class="db-badge db-badge-error" title="${item.uploadError}">⚠ DB error</span>`;
    else if (item.dbId)        statusBadge = `<span class="db-badge db-badge-saved">✓ Saved to DB</span>`;

    const thumbIcon = isImage ? '🖼' : '🎬';
    const thumbHtml = (thumbSrc && isImage)
      ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;" />`
      : `<span style="font-size:18px;">${thumbIcon}</span>`;

    return `
    <div class="export-item" id="qi-${item.id}">
      <div class="export-thumb">${thumbHtml}</div>
      <div class="export-info">
        <div class="export-name">${item.preset.label} · ${item.preset.ratio}</div>
        <div class="export-size">${item.preset.w}×${item.preset.h}px · ${item.filename}</div>
        ${statusBadge}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="export-btn export-btn-edit" onclick="editQueueItem(${item.id})">✏ Edit</button>
        <button class="export-btn" onclick="downloadQueueItem(${item.id})">↓ Download</button>
        <button class="export-btn export-btn-remove" onclick="removeQueueItem(${item.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

/** Restores item.file from Supabase Storage when it is no longer in memory. */
async function restoreFileFromStorage(item) {
  if (item.file || !item.storagePath || !sbClient) return true;
  try {
    const { data: blob, error } = await sbClient.storage
      .from(SUPABASE_BUCKET).download(item.storagePath);
    if (error) throw error;
    item.file = new File([blob], item.originalFilename || item.filename, {
      type: item.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
    });
    return true;
  } catch (err) {
    const fallback = item.thumbnail || item.previewDataURL;
    if (fallback) triggerDownload(fallback, item.filename);
    else alert(`Cannot restore file: ${err.message}`);
    return false;
  }
}

/** Sends item to the Java backend for high-quality processing and triggers download. */
async function downloadViaBackend(item) {
  const snap   = item.editStateSnapshot;
  const fmtExt = item.outputFormat.split('/')[1].replace('jpeg', 'jpg');
  const req    = {
    type: item.mediaType, targetWidth: item.preset.w, targetHeight: item.preset.h,
    outputFormat: fmtExt,
    brightness: snap.brightness, contrast: snap.contrast, saturation: snap.saturation,
    rotation: snap.rotation, flipHorizontal: snap.flipH, flipVertical: snap.flipV,
    cropOffsetX: snap.cropOffsetX, cropOffsetY: snap.cropOffsetY,
    trimStart: snap.trimStart, trimEnd: snap.trimEnd, muteAudio: snap.muteAudio,
  };
  const fd = new FormData();
  fd.append('file', item.file);
  fd.append('request', new Blob([JSON.stringify(req)], { type: 'application/json' }));
  const resp = await fetch(`${BACKEND_URL}/api/format/process`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error(`Server ${resp.status}`);
  const blob = await resp.blob();
  triggerDownload(URL.createObjectURL(blob), item.filename);
}

async function downloadQueueItem(id) {
  const item = exportQueue.find(i => i.id === id);
  if (!item) return;

  if (item.mediaType === 'video' && !backendAvailable) {
    alert('Video export requires the backend server.');
    return;
  }

  const restored = await restoreFileFromStorage(item);
  if (!restored) return;

  if (backendAvailable && item.outputFormat !== 'image/webp') {
    try {
      await downloadViaBackend(item);
    } catch (err) {
      const fallback = item.previewDataURL || item.thumbnail;
      if (fallback) triggerDownload(fallback, item.filename);
      else alert(`Download failed: ${err.message}`);
    }
  } else {
    const src = item.previewDataURL || item.thumbnail;
    if (src) triggerDownload(src, item.filename);
  }
}

async function removeQueueItem(id) {
  const item = exportQueue.find(i => i.id === id);
  if (item?.dbId && sbClient) {
    try {
      await sbClient.from(SUPABASE_TABLE).delete().eq('id', item.dbId);
      if (item.storagePath) {
        await sbClient.storage.from(SUPABASE_BUCKET).remove([item.storagePath]);
      }
    } catch (err) {
      console.error('[CreativeOps] Failed to delete from Supabase:', err);
    }
  }
  exportQueue = exportQueue.filter(i => i.id !== id);
  renderQueue();
  if (exportQueue.length === 0) {
    const queueCard = document.getElementById('queue-card');
    if (queueCard) queueCard.style.display = 'none';
  }
}

function downloadAll() {
  exportQueue.forEach((item, i) => {
    setTimeout(() => downloadQueueItem(item.id), i * 400);
  });
}

async function editQueueItem(id) {
  const item = exportQueue.find(i => i.id === id);
  if (!item) return;

  const restored = await restoreFileFromStorage(item);
  if (!restored) return;

  // Switch to the saved preset (or keep current if not found)
  const matchedPreset = FORMAT_PRESETS.find(p => p.id === item.preset.id);
  selectedPreset = matchedPreset || item.preset;

  // Reload the file with the saved edit state, keeping the queue intact
  loadFormatFile(item.file, {
    savedState: { ...item.editStateSnapshot },
    keepQueue: true,
  });

  // Scroll up to the editor
  const uploadCard = document.getElementById('upload-card');
  if (uploadCard) uploadCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function clearQueue() {
  // Delete all DB records and storage files for this session
  if (sbClient) {
    const toDelete = exportQueue.filter(i => i.dbId);
    for (const item of toDelete) {
      try {
        await sbClient.from(SUPABASE_TABLE).delete().eq('id', item.dbId);
        if (item.storagePath) {
          await sbClient.storage.from(SUPABASE_BUCKET).remove([item.storagePath]);
        }
      } catch (err) {
        console.error('[CreativeOps] Failed to delete queue item from Supabase:', err);
      }
    }
  }
  exportQueue = [];
  renderQueue();
  const queueCard = document.getElementById('queue-card');
  if (queueCard) queueCard.style.display = 'none';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function clearFormat() {
  fmtFile      = null;
  fmtImage     = null;
  fmtMediaType = null;
  exportQueue  = [];
  editState = {
    brightness: 0, contrast: 0, saturation: 0,
    rotation: 0, flipH: false, flipV: false,
    cropOffsetX: 0, cropOffsetY: 0,
    trimStart: 0, trimEnd: 0, muteAudio: false,
    activeTab: 'crop',
  };
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
}
