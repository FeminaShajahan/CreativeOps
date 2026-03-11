// ─── Compliance Checker ───────────────────────────────────────────────────────

const PLATFORM_RULES = {
  meta: {
    label: 'Meta / Instagram',
    image: {
      maxSizeMB: 30,
      formats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      minWidth: 500, minHeight: 500,
      maxWidth: 8192, maxHeight: 8192,
      ratios: [{ label: '1:1', w: 1, h: 1 }, { label: '4:5', w: 4, h: 5 }, { label: '1.91:1', w: 1.91, h: 1 }],
    },
    video: {
      maxSizeMB: 4000,
      formats: ['video/mp4', 'video/quicktime'],
      maxDurationSec: 60,
      minDurationSec: 1,
    },
  },
  google: {
    label: 'Google Display',
    image: {
      maxSizeMB: 5,
      formats: ['image/jpeg', 'image/png', 'image/gif'],
      minWidth: 300, minHeight: 250,
      maxWidth: 9999, maxHeight: 9999,
      ratios: [{ label: '1:1', w: 1, h: 1 }, { label: '16:9', w: 16, h: 9 }, { label: '4:3', w: 4, h: 3 }],
    },
    video: {
      maxSizeMB: 256,
      formats: ['video/mp4'],
      maxDurationSec: 30,
      minDurationSec: 6,
    },
  },
  tiktok: {
    label: 'TikTok',
    image: {
      maxSizeMB: 20,
      formats: ['image/jpeg', 'image/png'],
      minWidth: 720, minHeight: 1280,
      maxWidth: 9999, maxHeight: 9999,
      ratios: [{ label: '9:16', w: 9, h: 16 }, { label: '1:1', w: 1, h: 1 }],
    },
    video: {
      maxSizeMB: 4000,
      formats: ['video/mp4'],
      maxDurationSec: 60,
      minDurationSec: 3,
    },
  },
  youtube: {
    label: 'YouTube',
    image: {
      maxSizeMB: 2,
      formats: ['image/jpeg', 'image/png'],
      minWidth: 2560, minHeight: 1440,
      maxWidth: 9999, maxHeight: 9999,
      ratios: [{ label: '16:9', w: 16, h: 9 }],
    },
    video: {
      maxSizeMB: 137000,
      formats: ['video/mp4', 'video/avi', 'video/quicktime', 'video/webm'],
      maxDurationSec: 43200,
      minDurationSec: 1,
    },
  },
};

let currentPlatform = 'meta';
let currentFile = null;
let currentMeta = {};

function renderCompliance() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>Compliance Checker</h1>
      <p>Upload an image or video to verify it meets platform-specific requirements.</p>
    </div>

    <!-- Platform tabs -->
    <div class="platform-tabs">
      ${Object.entries(PLATFORM_RULES).map(([key, p]) => `
        <button class="platform-tab ${key === currentPlatform ? 'active' : ''}"
          onclick="selectPlatform('${key}')">${p.label}</button>`).join('')}
    </div>

    <div class="compliance-layout">
      <!-- Left: Upload + preview -->
      <div>
        <div class="card">
          <div class="upload-zone" id="compliance-drop" onclick="document.getElementById('compliance-input').click()">
            <span class="upload-icon">📂</span>
            <strong>Click to upload or drag & drop</strong>
            <p>Supports JPG, PNG, GIF, WebP, MP4, MOV</p>
          </div>
          <input type="file" id="compliance-input" accept="image/*,video/*" style="display:none" onchange="handleComplianceFile(event)" />

          <div id="compliance-preview" style="margin-top:16px; display:none;">
            <div class="preview-box" id="preview-box"></div>
            <div class="file-meta" id="file-meta"></div>
            <div style="margin-top:16px; display:flex; gap:8px;">
              <button class="btn btn-primary" onclick="runChecks()" id="run-btn">Run Compliance Check</button>
              <button class="btn btn-ghost" onclick="clearCompliance()">Clear</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Results -->
      <div>
        <div class="card">
          <div class="card-title">
            <span>Check Results</span>
            <span class="badge badge-accent" id="platform-badge">${PLATFORM_RULES[currentPlatform].label}</span>
          </div>
          <div class="check-list" id="check-list">
            ${renderPendingChecks()}
          </div>
          <div id="result-banner" style="display:none;"></div>
        </div>
      </div>
    </div>
  `;

  setupComplianceDrop();
}

function renderPendingChecks() {
  const checks = ['File Format', 'File Size', 'Dimensions', 'Aspect Ratio', 'Duration (video)'];
  return checks.map(name => `
    <div class="check-item pending">
      <div class="check-status-icon">—</div>
      <div class="check-info">
        <div class="check-name">${name}</div>
        <div class="check-detail">Upload a file to check</div>
      </div>
    </div>`).join('');
}

function selectPlatform(key) {
  currentPlatform = key;
  document.querySelectorAll('.platform-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.trim() === PLATFORM_RULES[key].label);
  });
  const badge = document.getElementById('platform-badge');
  if (badge) badge.textContent = PLATFORM_RULES[key].label;
  if (currentFile) runChecks();
}

function setupComplianceDrop() {
  const zone = document.getElementById('compliance-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadComplianceFile(file);
  });
}

function handleComplianceFile(event) {
  const file = event.target.files[0];
  if (file) loadComplianceFile(file);
}

function loadComplianceFile(file) {
  currentFile = file;
  const previewSection = document.getElementById('compliance-preview');
  const previewBox = document.getElementById('preview-box');
  const fileMeta = document.getElementById('file-meta');

  previewSection.style.display = 'block';

  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');

  previewBox.innerHTML = '';

  if (isImage) {
    const img = document.createElement('img');
    img.src = url;
    img.onload = () => {
      currentMeta.width = img.naturalWidth;
      currentMeta.height = img.naturalHeight;
      updateFileMeta(file);
    };
    previewBox.appendChild(img);
  } else if (isVideo) {
    const vid = document.createElement('video');
    vid.src = url;
    vid.controls = true;
    vid.onloadedmetadata = () => {
      currentMeta.width = vid.videoWidth;
      currentMeta.height = vid.videoHeight;
      currentMeta.duration = vid.duration;
      updateFileMeta(file);
    };
    previewBox.appendChild(vid);
  } else {
    previewBox.innerHTML = '<div class="preview-placeholder"><span>📄</span><p>Preview not available</p></div>';
    updateFileMeta(file);
  }

  currentMeta.type = file.type;
  currentMeta.sizeMB = file.size / (1024 * 1024);
  updateFileMeta(file);
}

function updateFileMeta(file) {
  const el = document.getElementById('file-meta');
  if (!el) return;
  const isVideo = file.type.startsWith('video/');
  el.innerHTML = `
    <div class="file-meta-item"><label>Filename</label><span>${file.name}</span></div>
    <div class="file-meta-item"><label>Type</label><span>${file.type || 'Unknown'}</span></div>
    <div class="file-meta-item"><label>Size</label><span>${currentMeta.sizeMB.toFixed(2)} MB</span></div>
    ${currentMeta.width ? `<div class="file-meta-item"><label>Dimensions</label><span>${currentMeta.width} × ${currentMeta.height}px</span></div>` : ''}
    ${isVideo && currentMeta.duration ? `<div class="file-meta-item"><label>Duration</label><span>${currentMeta.duration.toFixed(1)}s</span></div>` : ''}
  `;
}

function runChecks() {
  if (!currentFile) return;
  const rules = PLATFORM_RULES[currentPlatform];
  const isVideo = currentFile.type.startsWith('video/');
  const r = isVideo ? rules.video : rules.image;

  const results = [];

  // 1. Format
  const fmtPass = r.formats.includes(currentFile.type);
  results.push({
    name: 'File Format',
    status: fmtPass ? 'pass' : 'fail',
    detail: fmtPass
      ? `${currentFile.type} ✓ Accepted`
      : `${currentFile.type} ✗ Not accepted. Use: ${r.formats.map(f => f.split('/')[1]).join(', ')}`,
  });

  // 2. File size
  const sizePass = currentMeta.sizeMB <= r.maxSizeMB;
  results.push({
    name: 'File Size',
    status: sizePass ? 'pass' : 'fail',
    detail: sizePass
      ? `${currentMeta.sizeMB.toFixed(2)} MB ≤ ${r.maxSizeMB} MB limit`
      : `${currentMeta.sizeMB.toFixed(2)} MB exceeds ${r.maxSizeMB} MB limit`,
  });

  // 3. Dimensions (image only)
  if (!isVideo && currentMeta.width) {
    const dimPass = currentMeta.width >= r.minWidth && currentMeta.height >= r.minHeight;
    const dimWarn = currentMeta.width > r.maxWidth || currentMeta.height > r.maxHeight;
    results.push({
      name: 'Dimensions',
      status: dimWarn ? 'warn' : dimPass ? 'pass' : 'fail',
      detail: dimPass && !dimWarn
        ? `${currentMeta.width}×${currentMeta.height}px ✓ Within range`
        : !dimPass
          ? `${currentMeta.width}×${currentMeta.height}px ✗ Min: ${r.minWidth}×${r.minHeight}px`
          : `${currentMeta.width}×${currentMeta.height}px ⚠ Exceeds max ${r.maxWidth}×${r.maxHeight}px`,
    });

    // 4. Aspect ratio
    if (r.ratios && r.ratios.length > 0) {
      const tolerance = 0.05;
      const actualRatio = currentMeta.width / currentMeta.height;
      const ratioMatch = r.ratios.find(rt => Math.abs(actualRatio - rt.w / rt.h) < tolerance);
      results.push({
        name: 'Aspect Ratio',
        status: ratioMatch ? 'pass' : 'warn',
        detail: ratioMatch
          ? `${ratioMatch.label} ✓ Matches accepted ratio`
          : `Current: ${actualRatio.toFixed(2)}:1 ⚠ Accepted: ${r.ratios.map(rt => rt.label).join(', ')}`,
      });
    }
  } else if (!isVideo) {
    results.push({ name: 'Dimensions', status: 'warn', detail: 'Could not determine dimensions' });
    results.push({ name: 'Aspect Ratio', status: 'warn', detail: 'Could not determine aspect ratio' });
  }

  // 5. Duration (video only)
  if (isVideo) {
    results.push({ name: 'Dimensions', status: 'pass', detail: 'Dimension check skipped for video' });
    results.push({ name: 'Aspect Ratio', status: 'pass', detail: 'Aspect ratio check skipped for video' });
    if (currentMeta.duration !== undefined) {
      const durPass = currentMeta.duration >= r.minDurationSec && currentMeta.duration <= r.maxDurationSec;
      results.push({
        name: 'Duration (video)',
        status: durPass ? 'pass' : 'fail',
        detail: durPass
          ? `${currentMeta.duration.toFixed(1)}s ✓ Within ${r.minDurationSec}–${r.maxDurationSec}s`
          : `${currentMeta.duration.toFixed(1)}s ✗ Must be ${r.minDurationSec}–${r.maxDurationSec}s`,
      });
    } else {
      results.push({ name: 'Duration (video)', status: 'warn', detail: 'Waiting for video metadata...' });
    }
  } else {
    results.push({ name: 'Duration (video)', status: 'pass', detail: 'Not applicable for images' });
  }

  // Render results
  const list = document.getElementById('check-list');
  list.innerHTML = results.map(r => `
    <div class="check-item ${r.status}">
      <div class="check-status-icon">${r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '!'}</div>
      <div class="check-info">
        <div class="check-name">${r.name}</div>
        <div class="check-detail">${r.detail}</div>
      </div>
    </div>`).join('');

  // Overall banner
  const failures = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const bannerStatus = failures > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';
  const bannerIcon = failures > 0 ? '✗' : warnings > 0 ? '⚠' : '✓';
  const bannerTitle = failures > 0
    ? `${failures} issue${failures > 1 ? 's' : ''} found — asset not platform-ready`
    : warnings > 0
      ? `${warnings} warning${warnings > 1 ? 's' : ''} — review before publishing`
      : 'All checks passed — asset is platform-ready!';
  const bannerSub = failures > 0
    ? 'Fix the issues above before uploading to ' + PLATFORM_RULES[currentPlatform].label
    : warnings > 0
      ? 'Asset may work but review warnings for best performance'
      : `Compliant with ${PLATFORM_RULES[currentPlatform].label} requirements`;

  const bannerEl = document.getElementById('result-banner');
  bannerEl.style.display = 'flex';
  bannerEl.className = `result-banner ${bannerStatus}`;
  bannerEl.innerHTML = `
    <div class="result-banner-icon">${bannerIcon}</div>
    <div class="result-banner-text">
      ${bannerTitle}
      <span>${bannerSub}</span>
    </div>`;

  // Track stats
  const passCount = results.filter(r => r.status === 'pass').length;
  const totalChecks = results.length;
  const prevPass  = getStat('co_checks_pass', 0);
  const prevTotal = getStat('co_checks_total', 0);
  localStorage.setItem('co_checks_pass', prevPass + passCount);
  localStorage.setItem('co_checks_total', prevTotal + totalChecks);
  incrementStat('co_total_assets');

  // Platform-specific compliance pct
  const pctKey = `co_${currentPlatform}_pct`;
  localStorage.setItem(pctKey, Math.round((passCount / totalChecks) * 100));

  logActivity(
    `Compliance check on <strong>${currentFile.name}</strong> — ${bannerStatus === 'pass' ? '✓ Passed' : bannerStatus === 'warn' ? '⚠ Warnings' : '✗ Failed'} on ${PLATFORM_RULES[currentPlatform].label}`,
    bannerStatus === 'pass' ? 'success' : bannerStatus === 'warn' ? 'warning' : 'error'
  );
}

function clearCompliance() {
  currentFile = null;
  currentMeta = {};
  renderCompliance();
}
