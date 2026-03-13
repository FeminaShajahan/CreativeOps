// ─── AI Creative Generation & Variations ─────────────────────────────────────

function renderCreative() {
  const main = document.getElementById('main-content');

  main.innerHTML = `
    <div class="page-creative">
      <div class="page-header">
        <div>
          <h1 class="page-title">AI Creative Studio</h1>
          <p class="page-subtitle">Generate visual ad creatives and copy variations using Claude AI + Titan Image</p>
        </div>
      </div>

      <div class="creative-tabs">
        <button class="creative-tab active" data-mode="generate">
          <span>✦</span> Generate Creatives
        </button>
        <button class="creative-tab" data-mode="variations">
          <span>⊛</span> Create Variations
        </button>
      </div>

      <!-- Generate Mode -->
      <div class="creative-panel" id="panel-generate">
        <div class="creative-form-grid">
          <div class="creative-form-card">
            <h3 class="form-card-title">Creative Brief</h3>

            <div class="form-group">
              <label class="form-label">Platform</label>
              <div class="platform-selector" id="gen-platform">
                <button class="platform-btn active" data-val="meta">Meta</button>
                <button class="platform-btn" data-val="google">Google</button>
                <button class="platform-btn" data-val="tiktok">TikTok</button>
                <button class="platform-btn" data-val="youtube">YouTube</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="gen-product">Product / Brand <span class="required">*</span></label>
              <textarea id="gen-product" class="form-textarea" rows="3"
                placeholder="e.g. FitBrew — a premium cold-brew coffee subscription for busy professionals"></textarea>
            </div>

            <div class="form-group">
              <label class="form-label" for="gen-audience">Target Audience</label>
              <input id="gen-audience" class="form-input" type="text"
                placeholder="e.g. Health-conscious millennials aged 25–35" />
            </div>

            <div class="form-group">
              <label class="form-label">Tone</label>
              <div class="tone-selector" id="gen-tone">
                <button class="tone-btn active" data-val="professional">Professional</button>
                <button class="tone-btn" data-val="playful">Playful</button>
                <button class="tone-btn" data-val="urgent">Urgent</button>
                <button class="tone-btn" data-val="inspirational">Inspirational</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="gen-brand-color">Brand Colour</label>
              <div class="color-row">
                <input id="gen-brand-color" type="color" class="color-picker" value="#2D7DD2" />
                <span class="color-label" id="gen-color-label">#2D7DD2</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Number of Creatives</label>
              <div class="count-selector" id="gen-count">
                <button class="count-btn" data-val="1">1</button>
                <button class="count-btn active" data-val="3">3</button>
                <button class="count-btn" data-val="5">5</button>
              </div>
            </div>

            <button class="btn-generate" id="btn-generate">
              <span class="btn-icon">✦</span>
              <span class="btn-label">Generate Ad Creatives</span>
            </button>
          </div>

          <div class="creative-results" id="gen-results">
            <div class="results-placeholder">
              <div class="placeholder-icon">✦</div>
              <p>Fill in your brief and click <strong>Generate Ad Creatives</strong>.<br>Claude writes the copy, Titan Image generates the visual.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Variations Mode -->
      <div class="creative-panel hidden" id="panel-variations">
        <div class="creative-form-grid">
          <div class="creative-form-card">
            <h3 class="form-card-title">Original Copy</h3>

            <div class="form-group">
              <label class="form-label">Platform</label>
              <div class="platform-selector" id="var-platform">
                <button class="platform-btn active" data-val="meta">Meta</button>
                <button class="platform-btn" data-val="google">Google</button>
                <button class="platform-btn" data-val="tiktok">TikTok</button>
                <button class="platform-btn" data-val="youtube">YouTube</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="var-copy">Existing Copy <span class="required">*</span></label>
              <textarea id="var-copy" class="form-textarea" rows="5"
                placeholder="Paste your existing ad copy here…"></textarea>
            </div>

            <div class="form-group">
              <label class="form-label" for="var-brand-color">Brand Colour</label>
              <div class="color-row">
                <input id="var-brand-color" type="color" class="color-picker" value="#2D7DD2" />
                <span class="color-label" id="var-color-label">#2D7DD2</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Number of Variations</label>
              <div class="count-selector" id="var-count">
                <button class="count-btn" data-val="1">1</button>
                <button class="count-btn active" data-val="3">3</button>
                <button class="count-btn" data-val="5">5</button>
              </div>
            </div>

            <button class="btn-generate" id="btn-variations">
              <span class="btn-icon">⊛</span>
              <span class="btn-label">Generate Variations</span>
            </button>
          </div>

          <div class="creative-results" id="var-results">
            <div class="results-placeholder">
              <div class="placeholder-icon">⊛</div>
              <p>Paste your existing copy and click <strong>Generate Variations</strong>.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Colour picker sync ─────────────────────────────────────────────────────
  ['gen', 'var'].forEach(prefix => {
    const picker = document.getElementById(`${prefix}-brand-color`);
    const label  = document.getElementById(`${prefix}-color-label`);
    picker.addEventListener('input', () => { label.textContent = picker.value.toUpperCase(); });
  });

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.creative-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.creative-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.creative-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.mode}`).classList.remove('hidden');
    });
  });

  // ── Selector helpers ───────────────────────────────────────────────────────
  function bindSelector(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
  function getSelected(id) {
    const btn = document.querySelector(`#${id} button.active`);
    return btn ? btn.dataset.val : null;
  }

  bindSelector('gen-platform');
  bindSelector('gen-tone');
  bindSelector('gen-count');
  bindSelector('var-platform');
  bindSelector('var-count');

  // ── Compose ad image with text overlay on canvas (for download) ────────────
  function composeAdCanvas(canvas, creative, platform, brandColor, imgEl) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const br  = brandColor || '#2D7DD2';

    function wrapText(text, x, y, maxW, lineH) {
      const words = String(text).split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) {
          ctx.fillText(line, x, y);
          y += lineH; line = w;
        } else { line = t; }
      }
      ctx.fillText(line, x, y);
    }

    ctx.clearRect(0, 0, W, H);

    // Draw real image as background
    if (imgEl) {
      ctx.drawImage(imgEl, 0, 0, W, H);
    } else {
      ctx.fillStyle = br;
      ctx.fillRect(0, 0, W, H);
    }

    // Semi-transparent gradient overlay at bottom
    const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Headline
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(W * 0.058)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    wrapText(creative.headline || '', 16, H * 0.58, W - 32, W * 0.068);

    // Body (smaller)
    ctx.globalAlpha = 0.88;
    ctx.font = `${Math.round(W * 0.038)}px Inter, sans-serif`;
    wrapText(creative.body || '', 16, H * 0.72, W - 32, W * 0.046);
    ctx.globalAlpha = 1;

    // CTA pill
    const ctaText = creative.cta || 'Learn More';
    ctx.font = `bold ${Math.round(W * 0.042)}px Inter, sans-serif`;
    const ctaW = Math.min(ctx.measureText(ctaText).width + 28, W - 32);
    ctx.fillStyle = br;
    ctx.beginPath();
    ctx.roundRect(16, H * 0.86, ctaW, H * 0.09, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(ctaText, 28, H * 0.86 + H * 0.063);
  }

  // ── Render result cards with real AI images ────────────────────────────────
  function renderResults(containerId, creatives, platform, brandColor) {
    const container = document.getElementById(containerId);
    if (!creatives || !creatives.length) {
      container.innerHTML = `<div class="results-placeholder"><p class="error-text">No creatives returned. Try adjusting your brief.</p></div>`;
      return;
    }

    const platformLabel = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube' }[platform] || platform;

    container.innerHTML = `
      <div class="results-header">
        <span class="results-count">${creatives.length} creative${creatives.length > 1 ? 's' : ''}</span>
        <span class="results-platform badge-${platform}">${platformLabel}</span>
        <button class="btn-copy-all" id="btn-copy-all-${containerId}">Copy All</button>
      </div>
      <div class="results-list">
        ${creatives.map((c, i) => `
          <div class="result-card" data-index="${i}">
            <div class="result-card-header">
              <span class="result-num">Creative ${i + 1}</span>
              <div class="result-actions">
                <button class="btn-dl" data-index="${i}" title="Download composed PNG">↓ PNG</button>
                <button class="btn-copy-one" data-index="${i}">Copy Text</button>
              </div>
            </div>
            <div class="result-body-split">
              <div class="ad-image-wrap" id="imgwrap-${containerId}-${i}">
                ${c.imageUrl
                  ? `<img class="ad-real-img" id="adimg-${containerId}-${i}" src="${c.imageUrl}" alt="AI-generated ad visual" />`
                  : `<div class="ad-img-placeholder">Image unavailable</div>`}
                <canvas class="ad-compose-canvas hidden" id="canvas-${containerId}-${i}"></canvas>
              </div>
              <div class="result-copy-panel">
                <div class="result-field">
                  <span class="field-label">Headline</span>
                  <p class="field-value headline-val">${escapeHtml(c.headline || '')}</p>
                </div>
                <div class="result-field">
                  <span class="field-label">Body</span>
                  <p class="field-value">${escapeHtml(c.body || '')}</p>
                </div>
                <div class="result-field">
                  <span class="field-label">CTA</span>
                  <p class="field-value"><span class="cta-val">${escapeHtml(c.cta || '')}</span></p>
                </div>
                ${c.imagePrompt ? `
                <div class="result-field">
                  <span class="field-label">Image Prompt</span>
                  <p class="field-value field-prompt">${escapeHtml(c.imagePrompt)}</p>
                </div>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Download: compose image + text overlay on canvas then save
    container.querySelectorAll('.btn-dl').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.index);
        const c        = creatives[idx];
        const imgEl    = document.getElementById(`adimg-${containerId}-${idx}`);
        const canvas   = document.getElementById(`canvas-${containerId}-${idx}`);
        const isTall   = platform === 'tiktok';
        canvas.width   = isTall ? 384 : 640;
        canvas.height  = isTall ? 640 : 384;
        composeAdCanvas(canvas, c, platform, brandColor, imgEl);
        const a        = document.createElement('a');
        a.download     = `creative-${platform}-${idx + 1}.png`;
        a.href         = canvas.toDataURL('image/png');
        a.click();
      });
    });

    // Copy text
    container.querySelectorAll('.btn-copy-one').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = creatives[parseInt(btn.dataset.index)];
        copyToClipboard(`Headline: ${c.headline}\nBody: ${c.body}\nCTA: ${c.cta}`, btn, 'Copied!');
      });
    });

    // Copy all
    document.getElementById(`btn-copy-all-${containerId}`)?.addEventListener('click', e => {
      const all = creatives.map((c, i) =>
        `--- Creative ${i+1} ---\nHeadline: ${c.headline}\nBody: ${c.body}\nCTA: ${c.cta}`
      ).join('\n\n');
      copyToClipboard(all, e.target, 'All Copied!');
    });
  }

  function showLoading(containerId, message) {
    document.getElementById(containerId).innerHTML = `
      <div class="results-loading">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>`;
  }

  function showError(containerId, message) {
    document.getElementById(containerId).innerHTML = `
      <div class="results-placeholder">
        <div class="placeholder-icon error-icon">!</div>
        <p class="error-text">${escapeHtml(message)}</p>
      </div>`;
  }

  // ── Generate handler ───────────────────────────────────────────────────────
  document.getElementById('btn-generate').addEventListener('click', async () => {
    const product = document.getElementById('gen-product').value.trim();
    if (!product) { document.getElementById('gen-product').focus(); return; }

    const platform   = getSelected('gen-platform') || 'meta';
    const tone       = getSelected('gen-tone')     || 'professional';
    const count      = getSelected('gen-count')    || '3';
    const audience   = document.getElementById('gen-audience').value.trim();
    const brandColor = document.getElementById('gen-brand-color').value;

    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Generating…';
    showLoading('gen-results', 'Claude is writing copy · Titan is generating images…');

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate', platform, product, audience, tone, count: parseInt(count) }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error || 'Generation failed');
      renderResults('gen-results', data.creatives, platform, brandColor);
      logActivity(`Generated ${data.creatives.length} ${platform} creatives for "${product.slice(0, 30)}…"`, 'success');
      incrementStat('co_ai_generations');
    } catch (err) {
      showError('gen-results', err.message);
      logActivity('AI generation failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = 'Generate Ad Creatives';
    }
  });

  // ── Variations handler ─────────────────────────────────────────────────────
  document.getElementById('btn-variations').addEventListener('click', async () => {
    const copy = document.getElementById('var-copy').value.trim();
    if (!copy) { document.getElementById('var-copy').focus(); return; }

    const platform   = getSelected('var-platform') || 'meta';
    const count      = getSelected('var-count')    || '3';
    const brandColor = document.getElementById('var-brand-color').value;

    const btn = document.getElementById('btn-variations');
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Generating…';
    showLoading('var-results', 'Claude is creating variations · Titan is generating images…');

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'variations', platform, copy, count: parseInt(count) }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error || 'Variations failed');
      renderResults('var-results', data.creatives, platform, brandColor);
      logActivity(`Generated ${data.creatives.length} variations for ${platform}`, 'success');
      incrementStat('co_ai_generations');
    } catch (err) {
      showError('var-results', err.message);
      logActivity('AI variations failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = 'Generate Variations';
    }
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text, btn, label = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = orig; }, 1800);
  });
}
