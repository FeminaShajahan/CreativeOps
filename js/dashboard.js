// ─── Dashboard Page ───────────────────────────────────────────────────────────

// In-memory file store (persists during session)
const assetLibrary = [];
let _dbAssetIdCounter = 0;

function renderDashboard() {
  const main = document.getElementById('main-content');

  const totalAssets    = assetLibrary.length || getStat('co_total_assets');
  const formatsGen     = getStat('co_formats_generated');
  const transcripts    = getStat('co_transcripts');
  const compliancePct  = calcComplianceRate();
  const activities     = JSON.parse(localStorage.getItem('co_activity') || '[]');

  main.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Creative management overview — upload assets, track performance & recent activity.</p>
    </div>

    <!-- Stat Cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-label">Total Assets</span>
          <div class="stat-icon blue">📁</div>
        </div>
        <div class="stat-value">${assetLibrary.length}</div>
        <div class="stat-delta up">↑ Files in library</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-label">Compliance Rate</span>
          <div class="stat-icon green">✓</div>
        </div>
        <div class="stat-value">${compliancePct}%</div>
        <div class="stat-delta ${compliancePct >= 80 ? 'up' : 'down'}">${compliancePct >= 80 ? '↑ On track' : '↓ Needs attention'}</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-label">Formats Generated</span>
          <div class="stat-icon yellow">⊡</div>
        </div>
        <div class="stat-value">${formatsGen}</div>
        <div class="stat-delta up">↑ Platform-ready exports</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-label">Transcripts Created</span>
          <div class="stat-icon blue">♪</div>
        </div>
        <div class="stat-value">${transcripts}</div>
        <div class="stat-delta up">↑ Auto-generated captions</div>
      </div>
    </div>

    <!-- Upload Zone -->
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <h3>Asset Library</h3>
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="asset-filter-tabs" id="asset-filter-tabs">
            <button class="asset-filter active" data-filter="all">All</button>
            <button class="asset-filter" data-filter="image">Images</button>
            <button class="asset-filter" data-filter="video">Video</button>
            <button class="asset-filter" data-filter="audio">Audio</button>
            <button class="asset-filter" data-filter="db">☁ From DB</button>
          </div>
          ${assetLibrary.length > 0 ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;" onclick="clearAllAssets()">Clear All</button>` : ''}
        </div>
      </div>

      <div class="upload-zone" id="dash-drop" onclick="document.getElementById('dash-input').click()">
        <span class="upload-icon">📂</span>
        <strong>Click to upload or drag & drop files</strong>
        <p>Images (JPG, PNG, WebP, GIF) · Video (MP4, MOV) · Audio (MP3, WAV, M4A) — multiple files supported</p>
      </div>
      <input type="file" id="dash-input" multiple
        accept="image/*,video/*,audio/*"
        style="display:none"
        onchange="handleDashUpload(event)" />

      <!-- File Grid -->
      <div id="asset-grid" style="margin-top:16px;">
        ${renderAssetGrid('all')}
      </div>
    </div>

    <!-- Main Grid -->
    <div class="dashboard-grid">
      <!-- Left: Quick Actions + Activity -->
      <div>
        <h3 style="margin-bottom:12px; color: var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:0.8px;">Quick Actions</h3>
        <div class="quick-actions">
          <div class="quick-action-card" onclick="navigate('compliance')">
            <div class="qa-icon">✓</div>
            <div class="qa-title">Compliance Check</div>
            <div class="qa-desc">Verify your creative meets platform requirements</div>
          </div>
          <div class="quick-action-card" onclick="navigate('format')">
            <div class="qa-icon">⊡</div>
            <div class="qa-title">Adapt Format</div>
            <div class="qa-desc">Resize & crop for any platform aspect ratio</div>
          </div>
          <div class="quick-action-card" onclick="navigate('transcript')">
            <div class="qa-icon">♪</div>
            <div class="qa-title">Generate Transcript</div>
            <div class="qa-desc">Create captions from audio or video files</div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <h3>Recent Activity</h3>
            <button class="btn btn-ghost" style="font-size:11px; padding:5px 10px;" onclick="clearActivity()">Clear</button>
          </div>
          <div class="activity-list" id="activity-list">
            ${activities.length === 0
              ? `<div class="activity-empty">No activity yet — start using the tools above.</div>`
              : activities.map(a => `
                <div class="activity-item">
                  <div class="activity-dot ${a.type}"></div>
                  <div class="activity-text">
                    ${a.text}
                    <span>${a.date} · ${a.time}</span>
                  </div>
                </div>`).join('')
            }
          </div>
        </div>
      </div>

      <!-- Right: Platform Health -->
      <div>
        <div class="card">
          <h3 style="margin-bottom:16px;">Platform Readiness</h3>
          <div class="platform-list">
            ${renderPlatformRows()}
          </div>
        </div>

        <div class="card" style="margin-top:16px;">
          <h3 style="margin-bottom:12px;">Tools Overview</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${[
              { name: 'Compliance Checker', icon: '✓', desc: 'Platform rule validation', page: 'compliance' },
              { name: 'Format Adapter',     icon: '⊡', desc: 'Resize & crop for platforms', page: 'format' },
              { name: 'Transcript Generator', icon: '♪', desc: 'AI caption generation', page: 'transcript' },
            ].map(t => `
              <div style="display:flex; align-items:center; gap:12px; padding:10px; background:var(--bg-surface); border-radius:var(--radius-sm); cursor:pointer;" onclick="navigate('${t.page}')">
                <div style="width:30px; height:30px; background:var(--accent-dim); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px;">${t.icon}</div>
                <div>
                  <div style="font-size:12px; font-weight:600;">${t.name}</div>
                  <div style="font-size:11px; color:var(--text-muted);">${t.desc}</div>
                </div>
                <div style="margin-left:auto; color:var(--text-faint); font-size:16px;">›</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  setupDashDrop();
  setupFilterTabs();
  loadAssetsFromDB();
}

// ─── Upload handler ───────────────────────────────────────────────────────────
function handleDashUpload(event) {
  const files = Array.from(event.target.files);
  files.forEach(addAsset);
  event.target.value = ''; // reset input so same file can be re-uploaded
}

function addAsset(file) {
  const id = Date.now() + Math.random();
  const category = file.type.startsWith('image/') ? 'image'
                 : file.type.startsWith('video/') ? 'video'
                 : file.type.startsWith('audio/') ? 'audio'
                 : 'other';

  const entry = {
    id,
    file,
    name: file.name,
    type: file.type,
    category,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    uploadedDate: new Date().toLocaleDateString(),
    previewURL: category === 'image' ? URL.createObjectURL(file) : null,
  };

  assetLibrary.unshift(entry);
  logActivity(`Uploaded <strong>${file.name}</strong> (${entry.sizeMB} MB)`, 'accent');

  // Re-render just the grid
  const grid = document.getElementById('asset-grid');
  if (grid) {
    const active = document.querySelector('.asset-filter.active');
    const filter = active ? active.dataset.filter : 'all';
    grid.innerHTML = renderAssetGrid(filter);
  }

  // Update stat card
  const statVal = document.querySelector('.stat-card .stat-value');
  if (statVal) statVal.textContent = assetLibrary.length;
}

// ─── Asset grid renderer ──────────────────────────────────────────────────────
function renderAssetGrid(filter) {
  let filtered;
  if (filter === 'all') {
    filtered = assetLibrary;
  } else if (filter === 'db') {
    filtered = assetLibrary.filter(a => a.source === 'db');
  } else {
    filtered = assetLibrary.filter(a => a.category === filter);
  }

  if (filtered.length === 0) {
    return `<div class="asset-empty">
      <span>📭</span>
      <p>${assetLibrary.length === 0 ? 'No files uploaded yet — drag & drop or click above.' : 'No files in this category.'}</p>
    </div>`;
  }

  return `<div class="asset-grid">${filtered.map(a => renderAssetCard(a)).join('')}</div>`;
}

function renderAssetCard(a) {
  const typeLabel = a.type ? (a.type.split('/')[1]?.toUpperCase() || 'FILE') : a.category.toUpperCase();
  let typeBadgeClass = '';
  if (a.category === 'image') typeBadgeClass = 'badge-accent';
  else if (a.category === 'video') typeBadgeClass = 'badge-warning';
  else if (a.category === 'audio') typeBadgeClass = 'badge-success';

  let thumbIcon = '📄';
  if (a.category === 'video') thumbIcon = '🎬';
  else if (a.category === 'audio') thumbIcon = '🎵';

  const thumbContent = a.previewURL
    ? `<img src="${a.previewURL}" class="asset-thumb-img" alt="${a.name}" />`
    : `<div class="asset-thumb-icon">${thumbIcon}</div>`;

  const dbBadge = a.source === 'db'
    ? `<span class="asset-db-badge">☁ DB</span>`
    : '';

  let presetInfo = '';
  if (a.source === 'db' && a.presetLabel) {
    const dims = a.presetWidth ? ' · ' + a.presetWidth + '\xD7' + a.presetHeight : '';
    presetInfo = '<div class="asset-preset">' + a.presetLabel + dims + '</div>';
  }

  const timeRow = a.uploadedDate
    ? `<div class="asset-time">${a.uploadedDate} · ${a.uploadedAt}</div>`
    : '';

  return `
    <div class="asset-card" id="asset-${a.id}">
      <div class="asset-thumb">${thumbContent}</div>
      <div class="asset-body">
        <div class="asset-name" title="${a.name}">${a.name}</div>
        <div class="asset-meta">
          <span class="badge ${typeBadgeClass}">${typeLabel}</span>
          ${dbBadge}
          <span class="asset-size">${a.sizeMB} MB</span>
        </div>
        ${presetInfo}
        ${timeRow}
        <div class="asset-actions">
          <button class="asset-action-btn" title="Check Compliance" onclick="sendToCompliance(${a.id})">✓ Check</button>
          <button class="asset-action-btn" title="Adapt Format" onclick="sendToFormat(${a.id})">⊡ Format</button>
          <button class="asset-action-btn danger" title="Remove" onclick="removeAsset(${a.id})">✕</button>
        </div>
      </div>
    </div>`;
}

// ─── Asset actions ────────────────────────────────────────────────────────────
function removeAsset(id) {
  const idx = assetLibrary.findIndex(a => a.id === id);
  if (idx === -1) return;
  const asset = assetLibrary[idx];

  // Delete from Supabase if it came from DB
  if (asset.source === 'db' && asset.dbId && sbClient) {
    sbClient.from(CREATIVE_DASHBOARD_TABLE).delete().eq('id', asset.dbId).then(() => {});
    if (asset.storagePath) {
      sbClient.storage.from(SUPABASE_BUCKET).remove([asset.storagePath]).then(() => {});
    }
  }

  assetLibrary.splice(idx, 1);
  const card = document.getElementById('asset-' + id);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      const active = document.querySelector('.asset-filter.active');
      const filter = active ? active.dataset.filter : 'all';
      const grid = document.getElementById('asset-grid');
      if (grid) grid.innerHTML = renderAssetGrid(filter);
    }, 200);
  }
}

function clearAllAssets() {
  assetLibrary.length = 0;
  renderDashboard();
}

async function fetchAssetFile(asset) {
  if (asset.file) return asset.file;
  if (!asset.storagePath || !sbClient) return null;
  const { data, error } = await sbClient.storage.from(SUPABASE_BUCKET).download(asset.storagePath);
  if (error || !data) return null;
  const file = new File([data], asset.name, { type: asset.type || ('image/' + asset.category) });
  asset.file = file; // cache for next use
  return file;
}

function sendToCompliance(id) {
  const asset = assetLibrary.find(a => a.id === id);
  if (!asset) return;
  navigate('compliance');
  fetchAssetFile(asset).then(file => {
    if (file) {
      globalThis._pendingFile = file;
      setTimeout(() => {
        if (globalThis._pendingFile) {
          loadComplianceFile(globalThis._pendingFile);
          globalThis._pendingFile = null;
        }
      }, 50);
    }
  });
}

function sendToFormat(id) {
  const asset = assetLibrary.find(a => a.id === id);
  if (!asset || asset.category !== 'image') {
    alert('Format Adapter only supports image files.');
    return;
  }
  navigate('format');
  fetchAssetFile(asset).then(file => {
    if (file) {
      globalThis._pendingFile = file;
      setTimeout(() => {
        if (globalThis._pendingFile) {
          loadFormatFile(globalThis._pendingFile);
          globalThis._pendingFile = null;
        }
      }, 50);
    }
  });
}

// ─── Drag & drop ──────────────────────────────────────────────────────────────
function setupDashDrop() {
  const zone = document.getElementById('dash-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(addAsset);
  });
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
function setupFilterTabs() {
  document.querySelectorAll('.asset-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.asset-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const grid = document.getElementById('asset-grid');
      if (grid) grid.innerHTML = renderAssetGrid(btn.dataset.filter);
    });
  });
}

function renderPlatformRows() {
  const platforms = [
    { name: 'Meta / Instagram', pct: getStat('co_meta_pct', 0) },
    { name: 'Google Display',   pct: getStat('co_google_pct', 0) },
    { name: 'TikTok',           pct: getStat('co_tiktok_pct', 0) },
    { name: 'YouTube',          pct: getStat('co_youtube_pct', 0) },
  ];

  return platforms.map(p => `
    <div class="platform-row">
      <span class="platform-name">${p.name}</span>
      <div class="platform-bar-wrap">
        <div class="platform-bar" style="width:${p.pct}%"></div>
      </div>
      <span class="platform-pct">${p.pct}%</span>
    </div>`).join('');
}

function calcComplianceRate() {
  const pass  = getStat('co_checks_pass', 0);
  const total = getStat('co_checks_total', 0);
  if (total === 0) return 0;
  return Math.round((pass / total) * 100);
}

function clearActivity() {
  localStorage.removeItem('co_activity');
  renderDashboard();
  navigate('dashboard');
}

// ─── Load assets from Supabase ────────────────────────────────────────────────
async function loadAssetsFromDB() {
  if (!sbClient) return;

  const { data, error } = await sbClient
    .from(CREATIVE_DASHBOARD_TABLE)
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) return;

  // Remove any previously loaded DB assets to avoid duplicates on re-render
  for (let i = assetLibrary.length - 1; i >= 0; i--) {
    if (assetLibrary[i].source === 'db') assetLibrary.splice(i, 1);
  }

  data.forEach(row => {
    const sizeMB    = row.file_size ? (row.file_size / 1024 / 1024).toFixed(2) : '—';
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const dimLabel  = (row.width && row.height) ? row.width + '×' + row.height + 'px' : null;
    assetLibrary.push({
      id: --_dbAssetIdCounter,
      dbId: row.id,
      file: null,
      name: row.name,
      type: row.media_type === 'image' ? ('image/' + (row.format || 'jpeg')) : ('video/' + (row.format || 'mp4')),
      category: row.media_type,
      sizeMB,
      previewURL:   row.thumbnail    || null,
      storagePath:  row.storage_path || null,
      uploadedDate: createdAt ? createdAt.toLocaleDateString() : '',
      uploadedAt:   createdAt ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      source: 'db',
      presetLabel:  dimLabel,     // reuse presetLabel slot to show actual source dimensions
      presetWidth:  row.width     || null,
      presetHeight: row.height    || null,
    });
  });

  // Refresh the grid with the active filter
  const active = document.querySelector('.asset-filter.active');
  const filter = active ? active.dataset.filter : 'all';
  const grid = document.getElementById('asset-grid');
  if (grid) grid.innerHTML = renderAssetGrid(filter);

  // Update stat count
  const statVal = document.querySelector('.stat-card .stat-value');
  if (statVal) statVal.textContent = assetLibrary.length;
}
