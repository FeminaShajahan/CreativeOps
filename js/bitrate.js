// ─── Bitrate & Volume Optimizer ───────────────────────────────────────────

const BACKEND_URL = 'http://localhost:5000';

let bitrateFile = null;
let bitrateMeta = {};
let selectedPlatform = 'spotify';
let targetBitrate = 128;
let targetLUFS = -14;

let waveformData = null;
let waveformOffscreen = null;
let waveformAnimId = null;
let waveformAudioEl = null;

const PLATFORM_TARGETS = {
  spotify:   { label: 'Spotify',   bitrate: 160, lufs: -14 },
  youtube:   { label: 'YouTube',   bitrate: 128, lufs: -13 },
  broadcast: { label: 'Broadcast', bitrate: 192, lufs: -14 },
};

function renderBitrate() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>Bitrate & Volume Optimizer</h1>
      <p>Upload an audio or video file — AI classifies the content, measures loudness, and recommends optimal settings. FFmpeg applies the real optimization.</p>
    </div>

    <div class="bitrate-layout">
      <!-- Left: Upload + preview + controls -->
      <div>
        <div class="card">
          <div class="upload-zone" id="bitrate-drop" onclick="document.getElementById('bitrate-input').click()">
            <span class="upload-icon">🎵</span>
            <strong>Click to upload or drag & drop</strong>
            <p>MP3, MP4, WAV, OGG, M4A, WebM supported</p>
          </div>
          <input type="file" id="bitrate-input" accept="audio/*,video/*" style="display:none" onchange="handleBitrateFile(event)" />

          <div id="bitrate-preview" style="margin-top:16px; display:none;">
            <div class="preview-box" id="bitrate-preview-box"></div>
            <div class="file-meta" id="bitrate-file-meta"></div>
            <canvas id="waveform-canvas" height="60" style="width:100%; margin-top:12px; display:none;"></canvas>
            <div class="bitrate-controls" style="margin-top:18px;">
              <div class="platform-select-row">
                <label>Platform Target:</label>
                <select id="platform-select" onchange="setPlatformTarget(this.value)">
                  ${Object.entries(PLATFORM_TARGETS).map(([k,v]) => `<option value="${k}" ${selectedPlatform===k?'selected':''}>${v.label}</option>`).join('')}
                </select>
              </div>
              <div class="slider-row">
                <label>Bitrate:</label>
                <input type="range" min="64" max="320" step="1" value="${targetBitrate}" id="bitrate-slider" oninput="updateBitrateSlider(this.value)" />
                <span id="bitrate-value">${targetBitrate} kbps</span>
              </div>
              <div class="slider-row">
                <label>Volume (LUFS):</label>
                <input type="range" min="-24" max="-10" step="0.1" value="${targetLUFS}" id="lufs-slider" oninput="updateLUFSSlider(this.value)" />
                <span id="lufs-value">${targetLUFS} LUFS</span>
              </div>
              <button class="btn btn-primary" onclick="runBitrateOpt()" id="bitrate-run-btn" style="margin-top:12px;">Optimize &amp; Download</button>
              <button class="btn btn-ghost" onclick="clearBitrate()" style="margin-top:8px;">Clear</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: AI Results -->
      <div>
        <div class="card">
          <div class="card-title">
            <span>AI Analysis &amp; Results</span>
          </div>
          <div class="bitrate-result-list" id="bitrate-result-list">
            <div style="text-align:center; padding:24px; color:var(--text-faint); font-size:12px;">
              Upload a file to run AI analysis.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setupBitrateDrop();
}

function setupBitrateDrop() {
  const zone = document.getElementById('bitrate-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleBitrateFile({ target: { files: [file] } });
  });
}

function setPlatformTarget(val) {
  selectedPlatform = val;
  targetBitrate = PLATFORM_TARGETS[val].bitrate;
  targetLUFS = PLATFORM_TARGETS[val].lufs;
  document.getElementById('bitrate-slider').value = targetBitrate;
  document.getElementById('bitrate-value').textContent = `${targetBitrate} kbps`;
  document.getElementById('lufs-slider').value = targetLUFS;
  document.getElementById('lufs-value').textContent = `${targetLUFS} LUFS`;
}

function updateBitrateSlider(val) {
  targetBitrate = parseInt(val, 10);
  document.getElementById('bitrate-value').textContent = `${targetBitrate} kbps`;
}

function updateLUFSSlider(val) {
  targetLUFS = parseFloat(val);
  document.getElementById('lufs-value').textContent = `${targetLUFS} LUFS`;
}

// ─── File upload ───────────────────────────────────────────────────────────────
function handleBitrateFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  bitrateFile = file;

  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  const previewBox = document.getElementById('bitrate-preview-box');
  document.getElementById('bitrate-preview').style.display = 'block';

  const mediaTag = isVideo ? 'video' : 'audio';
  previewBox.innerHTML = isVideo
    ? `<video src="${url}" controls style="max-width:100%; max-height:220px; border-radius:8px;"></video>`
    : `<audio src="${url}" controls style="width:100%; border-radius:8px;"></audio>`;

  // Base metadata from File object
  const ext = file.name.split('.').pop().toUpperCase();
  bitrateMeta = {
    name: file.name,
    type: file.type,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    format: ext || file.type,
    duration: '—',
    bitrate: '—',
  };
  updateBitrateMeta(file);

  // Get duration from the media element, then estimate bitrate
  const mediaEl = previewBox.querySelector(mediaTag);
  if (mediaEl) {
    mediaEl.addEventListener('loadedmetadata', () => {
      const dur = mediaEl.duration;
      if (dur && isFinite(dur)) {
        bitrateMeta.duration = dur.toFixed(1);
        // Estimate overall bitrate from file size and duration
        const estimatedKbps = Math.round((file.size * 8) / dur / 1000);
        bitrateMeta.bitrate = `~${estimatedKbps}`;
      }
      updateBitrateMeta(file);
    });
  }

  if (!isVideo) drawWaveform(file);
  else document.getElementById('waveform-canvas').style.display = 'none';

  // Auto-trigger AI analysis
  runAIAnalysis();
}

function updateBitrateMeta(file) {
  const el = document.getElementById('bitrate-file-meta');
  if (!el) return;
  el.innerHTML = `
    <div class="file-meta-item"><label>Filename</label><span>${file.name}</span></div>
    <div class="file-meta-item"><label>Type</label><span>${file.type || 'Unknown'}</span></div>
    <div class="file-meta-item"><label>Size</label><span>${bitrateMeta.sizeMB} MB</span></div>
    <div class="file-meta-item"><label>Format</label><span>${bitrateMeta.format || '—'}</span></div>
    <div class="file-meta-item"><label>Duration</label><span>${bitrateMeta.duration || '—'} s</span></div>
    <div class="file-meta-item"><label>Bitrate</label><span>${bitrateMeta.bitrate || '—'}</span></div>
  `;
}

function drawWaveform(file) {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  canvas.width = canvas.offsetWidth || 600;

  // Stop any previous animation
  if (waveformAnimId) { cancelAnimationFrame(waveformAnimId); waveformAnimId = null; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.decodeAudioData(e.target.result, function(buffer) {
      waveformData = buffer.getChannelData(0);

      // Pre-render full waveform to an offscreen canvas (unplayed / dim color)
      const W = canvas.width, H = canvas.height;
      waveformOffscreen = document.createElement('canvas');
      waveformOffscreen.width = W;
      waveformOffscreen.height = H;
      const offCtx = waveformOffscreen.getContext('2d');
      const step = Math.ceil(waveformData.length / W);
      const amp  = H / 2;
      offCtx.beginPath();
      offCtx.moveTo(0, amp);
      for (let i = 0; i < W; i++) {
        const s = i * step, end = Math.min(s + step, waveformData.length);
        let min = Infinity, max = -Infinity;
        for (let j = s; j < end; j++) {
          if (waveformData[j] < min) min = waveformData[j];
          if (waveformData[j] > max) max = waveformData[j];
        }
        offCtx.lineTo(i, amp + min * amp);
        offCtx.lineTo(i, amp + max * amp);
      }
      offCtx.strokeStyle = 'rgba(45,125,210,0.35)';
      offCtx.lineWidth = 1.5;
      offCtx.stroke();

      // Hook into the audio element for playback tracking
      const previewBox = document.getElementById('bitrate-preview-box');
      waveformAudioEl = previewBox ? previewBox.querySelector('audio') : null;

      animateWaveform();
    });
  };
  reader.readAsArrayBuffer(file);
}

function animateWaveform() {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas || !waveformOffscreen || !waveformData) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const amp = H / 2;
  const step = Math.ceil(waveformData.length / W);

  let progress = 0;
  if (waveformAudioEl && waveformAudioEl.duration) {
    progress = waveformAudioEl.currentTime / waveformAudioEl.duration;
  }
  const playX = Math.floor(progress * W);

  // 1. Draw dim (unplayed) full waveform
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(waveformOffscreen, 0, 0);

  // 2. Draw bright (played) portion clipped to left of playhead
  if (playX > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, playX, H);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, amp);
    for (let i = 0; i < W; i++) {
      const s = i * step, end = Math.min(s + step, waveformData.length);
      let min = Infinity, max = -Infinity;
      for (let j = s; j < end; j++) {
        if (waveformData[j] < min) min = waveformData[j];
        if (waveformData[j] > max) max = waveformData[j];
      }
      ctx.lineTo(i, amp + min * amp);
      ctx.lineTo(i, amp + max * amp);
    }
    ctx.strokeStyle = '#2D7DD2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw playhead line
  if (playX > 0) {
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, H);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  waveformAnimId = requestAnimationFrame(animateWaveform);
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────
async function runAIAnalysis() {
  const resultList = document.getElementById('bitrate-result-list');
  resultList.innerHTML = `
    <div class="ai-loading">
      <span class="processing-ring"></span>
      <span>Analyzing with Librosa + YAMNet…</span>
    </div>`;

  const formData = new FormData();
  formData.append('audio', bitrateFile);

  try {
    const res = await fetch(`${BACKEND_URL}/analyze`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    renderAIResults(data);

    // Apply AI-recommended settings to sliders
    const rec = data.recommendation;
    targetBitrate = rec.bitrate;
    targetLUFS    = rec.lufs;
    const bitrateSlider = document.getElementById('bitrate-slider');
    const lufsSlider    = document.getElementById('lufs-slider');
    if (bitrateSlider) { bitrateSlider.value = targetBitrate; document.getElementById('bitrate-value').textContent = `${targetBitrate} kbps`; }
    if (lufsSlider)    { lufsSlider.value    = targetLUFS;    document.getElementById('lufs-value').textContent    = `${targetLUFS} LUFS`; }

  } catch (e) {
    resultList.innerHTML = `
      <div class="bitrate-result-item ai-error">
        <div class="ai-error-title">⚠ Backend unreachable</div>
        <div class="ai-error-msg">${e.message}</div>
        <div class="ai-error-hint">Start the server: <code>cd backend &amp;&amp; python app.py</code></div>
      </div>`;
  }
}

function renderAIResults(data) {
  const { librosa: lb, yamnet, recommendation: rec } = data;

  const labelChips = yamnet.labels.map((label, i) => {
    const pct = Math.round(yamnet.scores[i] * 100);
    return `<span class="yamnet-chip">${label} <em>${pct}%</em></span>`;
  }).join('');

  const resultList = document.getElementById('bitrate-result-list');
  resultList.innerHTML = `
    <div class="ai-analysis">

      <div class="ai-section-label">Content Type</div>
      <div class="ai-content-type">${rec.content_type}</div>

      <div class="ai-section-label" style="margin-top:14px;">YAMNet Audio Labels</div>
      <div class="yamnet-labels">${labelChips}</div>

      <div class="ai-section-label" style="margin-top:16px;">Audio Features (Librosa)</div>
      <div class="feature-grid">
        <div class="feature-item">
          <div class="feature-label">Integrated LUFS</div>
          <div class="feature-value">${lb.integrated_lufs} dB</div>
        </div>
        <div class="feature-item">
          <div class="feature-label">Peak</div>
          <div class="feature-value">${lb.peak_db} dBFS</div>
        </div>
        <div class="feature-item">
          <div class="feature-label">RMS</div>
          <div class="feature-value">${lb.rms_db} dB</div>
        </div>
        <div class="feature-item">
          <div class="feature-label">Dynamic Range</div>
          <div class="feature-value">${lb.dynamic_range_db} dB</div>
        </div>
        <div class="feature-item">
          <div class="feature-label">Tempo</div>
          <div class="feature-value">${lb.tempo_bpm} BPM</div>
        </div>
        <div class="feature-item">
          <div class="feature-label">Spectral Centroid</div>
          <div class="feature-value">${lb.spectral_centroid_hz} Hz</div>
        </div>
      </div>

      <div class="ai-recommendation">
        <div class="ai-rec-header">AI Recommendation</div>
        <div class="ai-rec-values">
          <span>${rec.bitrate} kbps</span>
          <span class="ai-rec-sep">·</span>
          <span>${rec.lufs} LUFS</span>
        </div>
        <div class="ai-rec-reason">${rec.reason}</div>
        <div class="ai-rec-applied">✓ Applied to sliders above</div>
      </div>

    </div>`;
}

// ─── Real FFmpeg Optimize ─────────────────────────────────────────────────────
async function runBitrateOpt() {
  if (!bitrateFile) { alert('Please upload a file first.'); return; }

  const btn = document.getElementById('bitrate-run-btn');
  const resultList = document.getElementById('bitrate-result-list');
  btn.disabled = true;

  // Keep AI analysis but prepend a status row
  const existing = resultList.innerHTML;
  resultList.innerHTML = `
    <div class="ai-loading" style="margin-bottom:12px;">
      <span class="processing-ring"></span>
      <span>FFmpeg encoding at ${targetBitrate} kbps / ${targetLUFS} LUFS…</span>
    </div>` + existing;

  const formData = new FormData();
  formData.append('audio', bitrateFile);
  formData.append('bitrate', targetBitrate);
  formData.append('lufs', targetLUFS);

  try {
    const res = await fetch(`${BACKEND_URL}/optimize`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    const isVideoFile = bitrateFile.type.startsWith('video/');
    const outExt = isVideoFile ? bitrateFile.name.split('.').pop() : 'mp3';
    a.download = `optimized_${bitrateFile.name.split('.')[0]}.${outExt}`;
    a.click();
    URL.revokeObjectURL(url);

    // Replace loading with success banner, keep AI analysis below
    const aiSection = resultList.querySelector('.ai-analysis');
    const aiHTML    = aiSection ? aiSection.outerHTML : '';
    resultList.innerHTML = `
      <div class="bitrate-result-item ai-success">
        <div class="ai-success-title">✓ Optimization complete — file downloaded</div>
        <div class="ai-success-details">
          <span>${targetBitrate} kbps</span>
          <span class="ai-rec-sep">·</span>
          <span>${targetLUFS} LUFS (loudnorm)</span>
          <span class="ai-rec-sep">·</span>
          <span>${PLATFORM_TARGETS[selectedPlatform].label}</span>
        </div>
      </div>
      ${aiHTML}`;

    incrementStat('co_bitrate_opts');
    logActivity(
      `Optimized <strong>${bitrateFile.name}</strong> → ${targetBitrate} kbps / ${targetLUFS} LUFS`,
      'success'
    );

  } catch (e) {
    resultList.innerHTML = `
      <div class="bitrate-result-item ai-error">
        <div class="ai-error-title">✗ Optimization failed</div>
        <div class="ai-error-msg">${e.message}</div>
        <div class="ai-error-hint">Ensure the backend is running: <code>cd backend &amp;&amp; python app.py</code></div>
      </div>`;
  } finally {
    btn.disabled = false;
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────
function clearBitrate() {
  if (waveformAnimId) { cancelAnimationFrame(waveformAnimId); waveformAnimId = null; }
  waveformData = null;
  waveformOffscreen = null;
  waveformAudioEl = null;
  bitrateFile = null;
  bitrateMeta = {};
  document.getElementById('bitrate-preview').style.display = 'none';
  document.getElementById('bitrate-result-list').innerHTML = `
    <div style="text-align:center; padding:24px; color:var(--text-faint); font-size:12px;">
      Upload a file to run AI analysis.
    </div>`;
  document.getElementById('waveform-canvas').style.display = 'none';
}
