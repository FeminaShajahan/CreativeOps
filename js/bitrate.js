// ─── Bitrate & Volume Optimizer ───────────────────────────────────────────

const BACKEND_URL = 'http://localhost:5000';

let bitrateFile      = null;
let bitrateMeta      = {};
let selectedPlatform = 'spotify';
let targetBitrate    = 128;
let targetLUFS       = -14;
let targetFormat     = 'mp3';

// Waveform
let waveformData       = null;
let waveformOffscreen  = null;
let waveformAnimId     = null;
let waveformAudioEl    = null;
let isDraggingWaveform = false;

// Live analyser
let analyserCtx      = null;
let analyserNode     = null;
let analyserSource   = null;
let analyserSourceEl = null;

// Before / After comparison
let originalBlobUrl  = null;
let optimizedBlobUrl = null;
let beforeAfterMode  = 'before';

const PLATFORM_TARGETS = {
  spotify:   { label: 'Spotify',          bitrate: 160, lufs: -14 },
  youtube:   { label: 'YouTube',          bitrate: 128, lufs: -13 },
  broadcast: { label: 'Broadcast',        bitrate: 192, lufs: -14 },
  tiktok:    { label: 'TikTok',           bitrate: 128, lufs: -14 },
  instagram: { label: 'Instagram Reels',  bitrate: 128, lufs: -14 },
  apple_pod: { label: 'Apple Podcasts',   bitrate: 96,  lufs: -16 },
};

const AUDIO_FORMAT_OPTIONS = {
  mp3:  { label: 'MP3',             ext: 'mp3'  },
  aac:  { label: 'AAC',             ext: 'aac'  },
  ogg:  { label: 'OGG Vorbis',      ext: 'ogg'  },
  flac: { label: 'FLAC (lossless)', ext: 'flac' },
};

const VIDEO_FORMAT_OPTIONS = {
  mp4:  { label: 'MP4  (H.264 + AAC)',  ext: 'mp4'  },
  webm: { label: 'WebM (VP9 + Opus)',   ext: 'webm' },
  mkv:  { label: 'MKV  (copy + AAC)',   ext: 'mkv'  },
};

// alias used throughout the rest of the file
const FORMAT_OPTIONS = AUDIO_FORMAT_OPTIONS;

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
            <canvas id="waveform-canvas" height="100" style="width:100%; margin-top:12px; display:none; cursor:pointer;"></canvas>
            <canvas id="level-canvas"    height="32"  style="width:100%; margin-top:4px;  display:none; border-radius:4px;"></canvas>

            <!-- Before / After toggle (shown after first optimization) -->
            <div id="compare-section" style="display:none; margin-top:12px;">
              <div class="compare-label">Compare:</div>
              <div class="compare-toggle">
                <button class="compare-btn active" id="btn-before" onclick="switchBeforeAfter('before')">Original</button>
                <button class="compare-btn"        id="btn-after"  onclick="switchBeforeAfter('after')">Optimized</button>
              </div>
            </div>

            <div class="bitrate-controls" style="margin-top:18px;">
              <div class="platform-select-row">
                <label>Platform:</label>
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
              <div class="platform-select-row" style="margin-top:10px; margin-bottom:0;">
                <label>Format:</label>
                <select id="format-select" onchange="targetFormat=this.value">
                  ${Object.entries(FORMAT_OPTIONS).map(([k,v]) => `<option value="${k}" ${targetFormat===k?'selected':''}>${v.label}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-primary" onclick="runBitrateOpt()" id="bitrate-run-btn" style="margin-top:12px;">Optimize &amp; Download</button>
              <button class="btn btn-ghost"   onclick="clearBitrate()"  style="margin-top:8px;">Clear</button>
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
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleBitrateFile({ target: { files: [file] } });
  });
}

function updateFormatSelect(isVideo) {
  const sel = document.getElementById('format-select');
  if (!sel) return;
  const opts = isVideo ? VIDEO_FORMAT_OPTIONS : AUDIO_FORMAT_OPTIONS;
  targetFormat = Object.keys(opts)[0]; // default to first option
  sel.innerHTML = Object.entries(opts)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join('');
}

function setPlatformTarget(val) {
  selectedPlatform = val;
  targetBitrate = PLATFORM_TARGETS[val].bitrate;
  targetLUFS    = PLATFORM_TARGETS[val].lufs;
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
  originalBlobUrl = url;

  updateFormatSelect(isVideo);

  const previewBox = document.getElementById('bitrate-preview-box');
  document.getElementById('bitrate-preview').style.display = 'block';

  previewBox.innerHTML = isVideo
    ? `<video src="${url}" controls style="max-width:100%; max-height:220px; border-radius:8px;"></video>`
    : `<audio src="${url}" controls style="width:100%; border-radius:8px;"></audio>`;

  // Reset compare state
  if (optimizedBlobUrl) { URL.revokeObjectURL(optimizedBlobUrl); optimizedBlobUrl = null; }
  beforeAfterMode = 'before';
  const compareSection = document.getElementById('compare-section');
  if (compareSection) compareSection.style.display = 'none';

  const ext = file.name.split('.').pop().toUpperCase();
  bitrateMeta = {
    name: file.name, type: file.type,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    format: ext || file.type, duration: '—', bitrate: '—',
  };
  updateBitrateMeta(file);

  const mediaEl = previewBox.querySelector(isVideo ? 'video' : 'audio');
  if (mediaEl) {
    mediaEl.addEventListener('loadedmetadata', () => {
      const dur = mediaEl.duration;
      if (dur && isFinite(dur)) {
        bitrateMeta.duration = dur.toFixed(1);
        bitrateMeta.bitrate  = `~${Math.round((file.size * 8) / dur / 1000)} kbps`;
      }
      updateBitrateMeta(file);
    });
  }

  if (!isVideo) {
    drawWaveform(file);
  } else {
    document.getElementById('waveform-canvas').style.display = 'none';
    document.getElementById('level-canvas').style.display = 'none';
  }

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

// ─── Waveform ─────────────────────────────────────────────────────────────────
function drawWaveform(file) {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  canvas.width = canvas.offsetWidth || 600;

  const levelCanvas = document.getElementById('level-canvas');
  if (levelCanvas) { levelCanvas.style.display = 'block'; levelCanvas.width = canvas.width; }

  if (waveformAnimId) { cancelAnimationFrame(waveformAnimId); waveformAnimId = null; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.decodeAudioData(e.target.result, function(buffer) {
      waveformData = buffer.getChannelData(0);

      // Pre-render dim waveform to offscreen canvas
      const W = canvas.width, H = canvas.height;
      waveformOffscreen = document.createElement('canvas');
      waveformOffscreen.width  = W;
      waveformOffscreen.height = H;
      const offCtx = waveformOffscreen.getContext('2d');
      const step   = Math.ceil(waveformData.length / W);
      const amp    = H / 2;
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
      offCtx.strokeStyle = 'rgba(45,125,210,0.30)';
      offCtx.lineWidth = 1.5;
      offCtx.stroke();

      const previewBox = document.getElementById('bitrate-preview-box');
      waveformAudioEl = previewBox ? previewBox.querySelector('audio') : null;

      if (waveformAudioEl) {
        setupAnalyser(waveformAudioEl);
        setupWaveformSeek(canvas, waveformAudioEl);
      }

      animateWaveform();
    });
  };
  reader.readAsArrayBuffer(file);
}

// ─── Live Analyser ────────────────────────────────────────────────────────────
function setupAnalyser(audioEl) {
  if (analyserSourceEl === audioEl) return; // already wired
  if (analyserSource) { try { analyserSource.disconnect(); } catch(e) {} analyserSource = null; }
  if (analyserCtx)    { analyserCtx.close(); analyserCtx = null; }

  analyserCtx  = new (window.AudioContext || window.webkitAudioContext)();
  analyserNode = analyserCtx.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.78;
  analyserSource   = analyserCtx.createMediaElementSource(audioEl);
  analyserSourceEl = audioEl;
  analyserSource.connect(analyserNode);
  analyserNode.connect(analyserCtx.destination);

  // Resume AudioContext on first user play (browser autoplay policy)
  audioEl.addEventListener('play', () => analyserCtx.state === 'suspended' && analyserCtx.resume());
}

// ─── Click-to-seek & drag scrubbing ──────────────────────────────────────────
function setupWaveformSeek(canvas, audioEl) {
  function seekTo(e) {
    const rect  = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (audioEl.duration && isFinite(audioEl.duration)) {
      audioEl.currentTime = ratio * audioEl.duration;
    }
  }

  canvas.addEventListener('mousedown',  e => { isDraggingWaveform = true;  seekTo(e); });
  canvas.addEventListener('mousemove',  e => { if (isDraggingWaveform) seekTo(e); });
  canvas.addEventListener('mouseup',    () => { isDraggingWaveform = false; });
  canvas.addEventListener('mouseleave', () => { isDraggingWaveform = false; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); isDraggingWaveform = true;  seekTo(e); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (isDraggingWaveform) seekTo(e); },    { passive: false });
  canvas.addEventListener('touchend',   () => { isDraggingWaveform = false; });
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function animateWaveform() {
  const canvas      = document.getElementById('waveform-canvas');
  const levelCanvas = document.getElementById('level-canvas');
  if (!canvas || !waveformOffscreen || !waveformData) return;

  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const amp  = H / 2;
  const step = Math.ceil(waveformData.length / W);

  let progress = 0;
  if (waveformAudioEl && waveformAudioEl.duration) {
    progress = waveformAudioEl.currentTime / waveformAudioEl.duration;
  }
  const playX = Math.floor(progress * W);

  // 1. Dim full waveform (pre-rendered)
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(waveformOffscreen, 0, 0);

  // 2. Bright played portion
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

  // 3. Playhead line
  if (playX > 0) {
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, H);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 4. Live frequency bars (level canvas) — only while playing
  if (levelCanvas && analyserNode) {
    const lCtx = levelCanvas.getContext('2d');
    const LW = levelCanvas.width, LH = levelCanvas.height;
    const isPlaying = waveformAudioEl && !waveformAudioEl.paused;

    lCtx.clearRect(0, 0, LW, LH);

    if (isPlaying) {
      const bufLen  = analyserNode.frequencyBinCount; // 128
      const freqData = new Uint8Array(bufLen);
      analyserNode.getByteFrequencyData(freqData);

      const barCount = 80;
      const barW     = LW / barCount;
      const binStep  = Math.floor(bufLen / barCount);

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = i * binStep; j < (i + 1) * binStep && j < bufLen; j++) sum += freqData[j];
        const barH = ((sum / binStep) / 255) * LH;
        const hue  = 200 + (i / barCount) * 50; // deep blue → cyan
        lCtx.fillStyle = `hsla(${hue}, 80%, 58%, 0.9)`;
        lCtx.fillRect(i * barW + 1, LH - barH, Math.max(barW - 2, 1), barH);
      }
    }
  }

  waveformAnimId = requestAnimationFrame(animateWaveform);
}

// ─── Before / After comparison ────────────────────────────────────────────────
function switchBeforeAfter(mode) {
  if (!waveformAudioEl || !originalBlobUrl || !optimizedBlobUrl) return;
  beforeAfterMode = mode;
  document.getElementById('btn-before').classList.toggle('active', mode === 'before');
  document.getElementById('btn-after').classList.toggle('active', mode === 'after');

  const wasPlaying = !waveformAudioEl.paused;
  const t = waveformAudioEl.currentTime;
  waveformAudioEl.src = (mode === 'after') ? optimizedBlobUrl : originalBlobUrl;
  waveformAudioEl.load();
  waveformAudioEl.currentTime = t;
  if (wasPlaying) waveformAudioEl.play();
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

  document.getElementById('bitrate-result-list').innerHTML = `
    <div class="ai-analysis">
      <div class="ai-section-label">Content Type</div>
      <div class="ai-content-type">${rec.content_type}</div>

      <div class="ai-section-label" style="margin-top:14px;">YAMNet Audio Labels</div>
      <div class="yamnet-labels">${labelChips}</div>

      <div class="ai-section-label" style="margin-top:16px;">Audio Features (Librosa)</div>
      <div class="feature-grid">
        <div class="feature-item"><div class="feature-label">Integrated LUFS</div><div class="feature-value">${lb.integrated_lufs} dB</div></div>
        <div class="feature-item"><div class="feature-label">Peak</div><div class="feature-value">${lb.peak_db} dBFS</div></div>
        <div class="feature-item"><div class="feature-label">RMS</div><div class="feature-value">${lb.rms_db} dB</div></div>
        <div class="feature-item"><div class="feature-label">Dynamic Range</div><div class="feature-value">${lb.dynamic_range_db} dB</div></div>
        <div class="feature-item"><div class="feature-label">Tempo</div><div class="feature-value">${lb.tempo_bpm} BPM</div></div>
        <div class="feature-item"><div class="feature-label">Spectral Centroid</div><div class="feature-value">${lb.spectral_centroid_hz} Hz</div></div>
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

  const isVideoFile = bitrateFile.type.startsWith('video/');
  const fmtMap      = isVideoFile ? VIDEO_FORMAT_OPTIONS : AUDIO_FORMAT_OPTIONS;
  const fmtLabel    = (fmtMap[targetFormat] || Object.values(fmtMap)[0]).label;
  const outExt      = (fmtMap[targetFormat] || Object.values(fmtMap)[0]).ext;

  const btn        = document.getElementById('bitrate-run-btn');
  const resultList = document.getElementById('bitrate-result-list');
  btn.disabled     = true;

  const existing = resultList.innerHTML;
  resultList.innerHTML = `
    <div class="ai-loading" style="margin-bottom:12px;">
      <span class="processing-ring"></span>
      <span>FFmpeg encoding at ${targetBitrate} kbps / ${targetLUFS} LUFS (${fmtLabel})…</span>
    </div>` + existing;

  const formData = new FormData();
  formData.append('audio',   bitrateFile);
  formData.append('bitrate', targetBitrate);
  formData.append('lufs',    targetLUFS);
  formData.append('format',  targetFormat);

  try {
    const res = await fetch(`${BACKEND_URL}/optimize`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || `Server error ${res.status}`;
      const detail = err.details ? `\n\nFFmpeg: ${err.details.slice(-400)}` : '';
      throw new Error(msg + detail);
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    // Auto-download
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `optimized_${bitrateFile.name.split('.')[0]}.${outExt}`;
    a.click();

    // Enable Before/After for audio files
    if (!isVideoFile) {
      if (optimizedBlobUrl) URL.revokeObjectURL(optimizedBlobUrl);
      optimizedBlobUrl = url;
      const compareSection = document.getElementById('compare-section');
      if (compareSection) compareSection.style.display = 'block';
      switchBeforeAfter('after');
    } else {
      URL.revokeObjectURL(url);
    }

    const aiSection = resultList.querySelector('.ai-analysis');
    const aiHTML    = aiSection ? aiSection.outerHTML : '';
    resultList.innerHTML = `
      <div class="bitrate-result-item ai-success">
        <div class="ai-success-title">✓ Optimization complete — file downloaded</div>
        <div class="ai-success-details">
          <span>${targetBitrate} kbps</span>
          <span class="ai-rec-sep">·</span>
          <span>${targetLUFS} LUFS</span>
          <span class="ai-rec-sep">·</span>
          <span>${fmtLabel}</span>
          <span class="ai-rec-sep">·</span>
          <span>${PLATFORM_TARGETS[selectedPlatform].label}</span>
        </div>
      </div>
      ${aiHTML}`;

    incrementStat('co_bitrate_opts');
    logActivity(
      `Optimized <strong>${bitrateFile.name}</strong> → ${targetBitrate} kbps / ${targetLUFS} LUFS (${fmtLabel})`,
      'success'
    );

  } catch (e) {
    const [mainMsg, ffmpegDetail] = e.message.split('\n\nFFmpeg: ');
    resultList.innerHTML = `
      <div class="bitrate-result-item ai-error">
        <div class="ai-error-title">✗ Optimization failed</div>
        <div class="ai-error-msg">${mainMsg}</div>
        ${ffmpegDetail ? `<pre class="ai-error-detail">${ffmpegDetail}</pre>` : ''}
        <div class="ai-error-hint">Ensure the backend is running: <code>cd backend &amp;&amp; python app.py</code></div>
      </div>`;
  } finally {
    btn.disabled = false;
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────
function clearBitrate() {
  if (waveformAnimId)  { cancelAnimationFrame(waveformAnimId); waveformAnimId = null; }
  if (analyserSource)  { try { analyserSource.disconnect(); } catch(e) {} analyserSource = null; }
  if (analyserCtx)     { analyserCtx.close(); analyserCtx = null; }
  analyserNode     = null;
  analyserSourceEl = null;
  waveformData     = null;
  waveformOffscreen = null;
  if (waveformAudioEl) { waveformAudioEl.pause(); waveformAudioEl.src = ''; }
  waveformAudioEl    = null;
  isDraggingWaveform = false;
  if (optimizedBlobUrl) { URL.revokeObjectURL(optimizedBlobUrl); optimizedBlobUrl = null; }
  originalBlobUrl  = null;
  beforeAfterMode  = 'before';
  bitrateFile      = null;
  bitrateMeta      = {};

  document.getElementById('bitrate-preview').style.display = 'none';
  document.getElementById('bitrate-result-list').innerHTML = `
    <div style="text-align:center; padding:24px; color:var(--text-faint); font-size:12px;">
      Upload a file to run AI analysis.
    </div>`;
  const wc = document.getElementById('waveform-canvas');
  const lc = document.getElementById('level-canvas');
  if (wc) wc.style.display = 'none';
  if (lc) lc.style.display = 'none';
}
