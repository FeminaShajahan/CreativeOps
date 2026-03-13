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
let currentCreativeId = null; // DB id of the compliance-uploaded file

function renderCompliance() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>Compliance Checker</h1>
      <p>Select a creative from your library below to run a platform compliance check.</p>
    </div>

    <!-- ── Creative Library ───────────────────────────────────────────────── -->
    <div class="card creative-library" style="margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:4px;">Creative Library</div>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;">
        Showing latest 10 uploads — search by name or ID · upload new assets from Dashboard
      </p>
      <div class="library-search-row">
        <input type="text" id="creative-search" placeholder="Search by name or ID"
               onkeydown="if(event.key==='Enter') searchCreativeById()" />
        <button class="btn btn-primary" onclick="searchCreativeById()">Search</button>
        <button class="btn btn-ghost" onclick="clearCreativeSearch()">Clear</button>
      </div>
      <div id="creative-library-body" style="margin-top:16px;">
        <div class="library-loading">Loading creatives…</div>
      </div>
    </div>

    <!-- ── Check Panel (shown after selecting a creative) ─────────────────── -->
    <div id="compliance-check-section" style="display:none;">
      <div style="border-top:1px solid var(--border); margin-bottom:24px;"></div>

      <div class="platform-tabs">
        ${Object.entries(PLATFORM_RULES).map(([key, p]) => `
          <button class="platform-tab ${key === currentPlatform ? 'active' : ''}"
            onclick="selectPlatform('${key}')">${p.label}</button>`).join('')}
      </div>

      <div class="compliance-layout">
        <!-- Left: Preview + actions -->
        <div>
          <div class="card">
            <div class="preview-box" id="preview-box"></div>
            <div class="file-meta" id="file-meta"></div>
            <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="runChecks()" id="run-btn">Run Compliance Check</button>
              <button class="btn btn-secondary" onclick="runAiCheck()" id="ai-btn">Run AI Content Check</button>
              <button class="btn btn-ghost" onclick="clearCompliance()">Clear</button>
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
    </div>
  `;

  loadCreativeLibrary();
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
  currentCreativeId = null;

  const section = document.getElementById('compliance-check-section');
  const previewBox = document.getElementById('preview-box');

  if (section) section.style.display = 'block';

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

async function runChecks() {
  if (!currentFile) return;

  // Show loading state on button
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  // Show loading state in results panel
  const list = document.getElementById('check-list');
  list.innerHTML = ['File Format', 'File Size', 'Dimensions', 'Aspect Ratio', 'Duration'].map(name => `
    <div class="check-item pending">
      <div class="check-status-icon">…</div>
      <div class="check-info">
        <div class="check-name">${name}</div>
        <div class="check-detail">Checking…</div>
      </div>
    </div>`).join('');

  try {
    const mediaType = currentMeta.type?.startsWith('video/') ? 'video' : 'image';
    const rules = PLATFORM_RULES[currentPlatform][mediaType];
    const checks = [];

    // 1. File Format
    if (rules?.formats) {
      const ok = rules.formats.includes(currentMeta.type);
      checks.push({ name: 'File Format', status: ok ? 'pass' : 'fail',
        detail: ok ? `${currentMeta.type} is allowed`
                   : `${currentMeta.type} not allowed. Accepted: ${rules.formats.join(', ')}` });
    }

    // 2. File Size
    if (rules?.maxSizeMB) {
      const ok = currentMeta.sizeMB <= rules.maxSizeMB;
      checks.push({ name: 'File Size', status: ok ? 'pass' : 'fail',
        detail: `${currentMeta.sizeMB.toFixed(2)} MB — limit is ${rules.maxSizeMB} MB` });
    }

    // 3. Dimensions (images)
    if (mediaType === 'image' && rules?.minWidth) {
      const w = currentMeta.width, h = currentMeta.height;
      if (w && h) {
        const ok = w >= rules.minWidth && h >= rules.minHeight;
        checks.push({ name: 'Dimensions', status: ok ? 'pass' : 'fail',
          detail: `${w}×${h}px — minimum ${rules.minWidth}×${rules.minHeight}px` });
      } else {
        checks.push({ name: 'Dimensions', status: 'warn', detail: 'Could not read dimensions' });
      }
    }

    // 4. Aspect Ratio (images)
    if (mediaType === 'image' && rules?.ratios && currentMeta.width && currentMeta.height) {
      const tolerance = 0.05;
      const actual = currentMeta.width / currentMeta.height;
      const match = rules.ratios.find(r => Math.abs(actual - r.w / r.h) <= tolerance);
      checks.push({ name: 'Aspect Ratio',
        status: match ? 'pass' : 'warn',
        detail: match ? `Matches ${match.label}`
                      : `${(actual).toFixed(2)}:1 — expected ${rules.ratios.map(r => r.label).join(' or ')}` });
    }

    // 5. Duration (video)
    if (mediaType === 'video' && rules?.maxDurationSec) {
      const dur = currentMeta.duration;
      if (dur) {
        const tooLong = dur > rules.maxDurationSec;
        const tooShort = rules.minDurationSec && dur < rules.minDurationSec;
        const status = (tooLong || tooShort) ? 'fail' : 'pass';
        checks.push({ name: 'Duration', status,
          detail: `${dur.toFixed(1)}s — allowed ${rules.minDurationSec || 0}s – ${rules.maxDurationSec}s` });
      } else {
        checks.push({ name: 'Duration', status: 'warn', detail: 'Could not read duration' });
      }
    } else if (mediaType === 'image') {
      checks.push({ name: 'Duration (video)', status: 'pass', detail: 'Not applicable for images' });
    }

    const failures = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const overallStatus = failures > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';
    const summary = failures > 0 ? `${failures} check(s) failed`
                  : warnings > 0 ? `${warnings} warning(s)`
                  : 'All checks passed';

    renderCheckResults(checks, overallStatus, summary);

    const passCount = checks.filter(c => c.status === 'pass').length;
    localStorage.setItem('co_checks_pass',  (getStat('co_checks_pass', 0) + passCount));
    localStorage.setItem('co_checks_total', (getStat('co_checks_total', 0) + checks.length));
    incrementStat('co_total_assets');
    localStorage.setItem(`co_${currentPlatform}_pct`, Math.round((passCount / checks.length) * 100));

    logActivity(
      `Compliance check on <strong>${currentFile.name}</strong> — ${
        overallStatus === 'pass' ? '✓ Passed' : overallStatus === 'warn' ? '⚠ Warnings' : '✗ Failed'
      } on ${PLATFORM_RULES[currentPlatform].label}`,
      overallStatus === 'pass' ? 'success' : overallStatus === 'warn' ? 'warning' : 'error'
    );

  } catch (err) {
    list.innerHTML = `
      <div class="check-item fail">
        <div class="check-status-icon">✗</div>
        <div class="check-info">
          <div class="check-name">Check Failed</div>
          <div class="check-detail">${err.message}</div>
        </div>
      </div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Compliance Check';
  }
}

// ── Run AI Content Check (Phase 3 — Claude wired later) ───────────────────────
async function runAiCheck() {
  if (!currentFile) return;

  const btn = document.getElementById('ai-btn');
  btn.disabled = true;
  btn.textContent = 'Running AI Check...';

  // Show AI results in a separate banner below the check list
  const bannerEl = document.getElementById('result-banner');
  bannerEl.style.display = 'flex';
  bannerEl.className = 'result-banner warn';
  bannerEl.innerHTML = `
    <div class="result-banner-icon">…</div>
    <div class="result-banner-text">
      Running AI content check...
      <span>Sending to Claude AI for analysis</span>
    </div>`;

  try {
    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('platform', currentPlatform);

    const response = await fetch(`${API_BASE}/api/compliance/ai-check`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    // Render AI result banner
    const isPending = data.status === 'PENDING';
    bannerEl.className = `result-banner ${isPending ? 'warn' : 'pass'}`;
    bannerEl.innerHTML = `
      <div class="result-banner-icon">${isPending ? '⚠' : '✓'}</div>
      <div class="result-banner-text">
        AI Check: ${data.status}
        <span>${data.message}</span>
      </div>`;

  } catch (err) {
    bannerEl.className = 'result-banner fail';
    bannerEl.innerHTML = `
      <div class="result-banner-icon">✗</div>
      <div class="result-banner-text">
        AI Check Failed
        <span>${err.message}</span>
      </div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run AI Content Check';
  }
}

// ── Shared renderer for check results (used by runChecks) ─────────────────────
function renderCheckResults(checks, overallStatus, summary) {
  const list = document.getElementById('check-list');
  list.innerHTML = checks.map(c => `
    <div class="check-item ${c.status}">
      <div class="check-status-icon">${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '!'}</div>
      <div class="check-info">
        <div class="check-name">${c.name}</div>
        <div class="check-detail">${c.detail}</div>
      </div>
    </div>`).join('');

  const failures = checks.filter(c => c.status === 'fail').length;
  const warnings  = checks.filter(c => c.status === 'warn').length;
  const icon      = failures > 0 ? '✗' : warnings > 0 ? '⚠' : '✓';

  const bannerEl = document.getElementById('result-banner');
  bannerEl.style.display = 'flex';
  bannerEl.className = `result-banner ${overallStatus}`;
  bannerEl.innerHTML = `
    <div class="result-banner-icon">${icon}</div>
    <div class="result-banner-text">
      ${summary}
      <span>${failures > 0
        ? 'Fix the issues above before uploading to ' + PLATFORM_RULES[currentPlatform].label
        : warnings > 0
          ? 'Asset may work but review warnings for best performance'
          : 'Compliant with ' + PLATFORM_RULES[currentPlatform].label + ' requirements'
      }</span>
    </div>`;
}

function clearCompliance() {
  currentFile = null;
  currentMeta = {};
  currentCreativeId = null;
  const section = document.getElementById('compliance-check-section');
  if (section) section.style.display = 'none';
  const checkList = document.getElementById('check-list');
  if (checkList) checkList.innerHTML = renderPendingChecks();
  const banner = document.getElementById('result-banner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  const previewBox = document.getElementById('preview-box');
  if (previewBox) previewBox.innerHTML = '';
  const fileMeta = document.getElementById('file-meta');
  if (fileMeta) fileMeta.innerHTML = '';
}

// Selects a creative from the library and loads it into the check panel
async function selectForCompliance(id) {
  let creative = creativeLibraryData.find(c => c.id === id);
  if (!creative) {
    // Data not loaded yet — fetch directly from API
    try {
      const res = await fetch(`${API_BASE}/api/creatives/${id}`);
      if (res.ok) creative = await res.json();
    } catch (e) { /* ignore */ }
  }
  if (!creative) return;

  currentCreativeId = creative.id;
  currentMeta.type = creative.mime_type;
  currentMeta.sizeMB = creative.file_size ? creative.file_size / (1024 * 1024) : 0;

  // Show check panel
  const section = document.getElementById('compliance-check-section');
  if (section) section.style.display = 'block';

  // Reset results
  const checkList = document.getElementById('check-list');
  if (checkList) checkList.innerHTML = renderPendingChecks();
  const banner = document.getElementById('result-banner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }

  // Render preview from CDN URL
  const previewBox = document.getElementById('preview-box');
  const isImage = creative.mime_type?.startsWith('image/');
  const isVideo = creative.mime_type?.startsWith('video/');

  if (isImage && creative.cdn_url) {
    previewBox.innerHTML = `<img src="${creative.cdn_url}" style="max-width:100%;max-height:300px;border-radius:6px;" alt="${creative.name}" />`;
  } else if (isVideo && creative.cdn_url) {
    previewBox.innerHTML = `<video src="${creative.cdn_url}" controls style="max-width:100%;border-radius:6px;"></video>`;
    const vid = previewBox.querySelector('video');
    if (vid) vid.onloadedmetadata = () => {
      currentMeta.width = vid.videoWidth;
      currentMeta.height = vid.videoHeight;
      currentMeta.duration = vid.duration;
    };
  } else {
    previewBox.innerHTML = `<div class="preview-placeholder"><span>📄</span><p>${creative.name}</p></div>`;
  }

  // Show file metadata
  const fileMeta = document.getElementById('file-meta');
  if (fileMeta) fileMeta.innerHTML = `
    <div class="file-meta-item"><label>Filename</label><span>${creative.name}</span></div>
    <div class="file-meta-item"><label>Type</label><span>${creative.mime_type || 'Unknown'}</span></div>
    <div class="file-meta-item"><label>Size</label><span>${currentMeta.sizeMB.toFixed(2)} MB</span></div>
  `;

  // Fetch as blob so runChecks() can send it to the backend
  try {
    const resp = await fetch(creative.cdn_url);
    const blob = await resp.blob();
    currentFile = new File([blob], creative.name, { type: creative.mime_type });
  } catch (e) {
    console.error('Could not fetch file for compliance check:', e);
  }

  // Scroll to check panel
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Save compliance upload to DB ───────────────────────────────────────────────
// Called as soon as a file is selected in the compliance upload zone.
// Saves the file to POST /api/creatives → creates a DB record with a unique ID.
// The Creative Library table auto-refreshes so the new record appears immediately.
async function saveComplianceFileToDB(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', file.name);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return; // silent — validation still works even if DB save fails
    const saved = await res.json();
    currentCreativeId = saved.id;

    // Refresh Creative Library so the new record appears in the table
    loadCreativeLibrary();
  } catch (err) {
    console.error('Compliance file DB save failed:', err);
  }
}

// ── Creative Library ───────────────────────────────────────────────────────────

let creativeLibraryData = []; // cache of all creatives fetched from backend

// Fetches all creatives from backend and renders the top 10 in the table
async function loadCreativeLibrary() {
  const body = document.getElementById('creative-library-body');
  if (!body) return;

  try {
    const res = await fetch(`${API_BASE}/api/creatives`);
    if (!res.ok) throw new Error('Backend returned ' + res.status);
    creativeLibraryData = await res.json();
    renderCreativeTable(creativeLibraryData.slice(0, 10));
  } catch (err) {
    body.innerHTML = `<div class="library-empty">
      <span>⚠</span>
      <p>Could not load creatives. Make sure the backend is running on port 3000.</p>
    </div>`;
  }
}

// Renders creatives array as a table (or empty state if array is empty)
function renderCreativeTable(creatives) {
  const body = document.getElementById('creative-library-body');
  if (!body) return;

  if (!creatives || creatives.length === 0) {
    body.innerHTML = `<div class="library-empty">
      <span>📂</span>
      <p>No creatives uploaded yet. Upload an asset from the Dashboard to get started.</p>
    </div>`;
    return;
  }

  body.innerHTML = `
    <table class="creative-table">
      <thead>
        <tr>
          <th style="width:64px;">Thumb</th>
          <th style="width:56px;">ID</th>
          <th>Name</th>
          <th style="width:80px;">Size</th>
          <th style="width:72px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${creatives.map(c => `
          <tr data-id="${c.id}">
            <td>${renderCreativeThumb(c)}</td>
            <td><span class="creative-id" title="${c.id}">#${c.id.substring(0, 8)}</span></td>
            <td class="creative-name" title="${c.name}">${c.name}</td>
            <td>${c.file_size ? (c.file_size / 1024 / 1024).toFixed(2) : '?'} MB</td>
            <td style="display:flex;gap:6px;">
              <button class="btn btn-primary" style="font-size:11px;padding:4px 10px;" onclick="selectForCompliance('${c.id}')">Select to Check</button>
              <button class="btn-delete-creative" onclick="deleteFromLibrary('${c.id}')">Delete</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Returns the thumbnail HTML for a creative row
function renderCreativeThumb(c) {
  const isImage = c.mime_type?.startsWith('image/');
  const isVideo = c.mime_type?.startsWith('video/');
  if (isImage && c.cdn_url) {
    return `<img src="${c.cdn_url}" class="creative-thumb" alt="${c.name}"
                 onerror="this.outerHTML='<div class=creative-thumb-icon>🖼</div>'" />`;
  }
  if (isVideo && c.cdn_url) {
    return `<video src="${c.cdn_url}" class="creative-thumb" muted preload="metadata"></video>`;
  }
  return `<div class="creative-thumb-icon">${isVideo ? '🎬' : isImage ? '🖼' : '🎵'}</div>`;
}

// Searches for creatives by name or partial ID
async function searchCreativeById() {
  const input = document.getElementById('creative-search');
  const query = (input ? input.value.trim() : '').toLowerCase();

  // Empty search → show default top 10
  if (!query) {
    renderCreativeTable(creativeLibraryData.slice(0, 10));
    return;
  }

  const matches = creativeLibraryData.filter(c =>
    c.name?.toLowerCase().includes(query) || c.id?.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    document.getElementById('creative-library-body').innerHTML = `
      <div class="library-empty"><span>🔍</span>
        <p>No creatives match "${query}". Try a different name or clear the search.</p>
      </div>`;
    return;
  }

  renderCreativeTable(matches.slice(0, 10));
}

// Clears the search input and restores the top 10 view
function clearCreativeSearch() {
  const input = document.getElementById('creative-search');
  if (input) input.value = '';
  renderCreativeTable(creativeLibraryData.slice(0, 10));
}

// Deletes a creative from the backend DB and refreshes the library
async function deleteFromLibrary(id) {
  if (!confirm(`Delete creative #${id}? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/creatives/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed — status ' + res.status);

    // Remove from local cache and re-render
    creativeLibraryData = creativeLibraryData.filter(c => c.id !== id);

    // Clear search so we always show fresh top 10 after delete
    const input = document.getElementById('creative-search');
    if (input) input.value = '';
    renderCreativeTable(creativeLibraryData.slice(0, 10));
  } catch (err) {
    alert(`Failed to delete creative #${id}: ${err.message}`);
  }
}
