// ─── Transcript Generator ─────────────────────────────────────────────────────

let recognition = null;
let isRecording = false;
let transcriptSegments = [];
let sessionStart = null;
let mediaFile = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasSpeechAPI = !!SpeechRecognition;

function renderTranscript() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <h1>Transcript Generator</h1>
      <p>Generate captions from audio/video files or record live using your microphone.</p>
    </div>

    ${!hasSpeechAPI ? `
      <div class="result-banner warn" style="margin-bottom:20px;">
        <div class="result-banner-icon">⚠</div>
        <div class="result-banner-text">
          Speech recognition not supported in this browser.
          <span>Use Google Chrome or Microsoft Edge for full functionality.</span>
        </div>
      </div>` : ''}

    <div class="transcript-layout">
      <!-- Left: Input + Transcript -->
      <div>
        <!-- Upload -->
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:12px;">Upload Audio / Video</h3>
          <div class="upload-zone" onclick="document.getElementById('media-input').click()">
            <span class="upload-icon">🎵</span>
            <strong>Click to upload media file</strong>
            <p>MP3, MP4, WAV, OGG, M4A, WebM supported</p>
          </div>
          <input type="file" id="media-input" accept="audio/*,video/*" style="display:none" onchange="handleMediaFile(event)" />
          <div id="media-player" style="display:none; margin-top:12px;" class="media-player"></div>
        </div>

        <!-- Live Mic -->
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:12px;">Live Microphone</h3>
          <div id="recording-indicator" style="display:none;" class="recording-indicator">
            <div class="recording-dot"></div>
            Recording in progress... speak clearly
          </div>
          <div class="transcript-controls">
            <button class="btn btn-primary" id="mic-btn" onclick="toggleRecording()" ${!hasSpeechAPI ? 'disabled' : ''}>
              🎤 Start Recording
            </button>
            <button class="btn btn-ghost" onclick="clearTranscript()">Clear Transcript</button>
          </div>
          <div id="status-bar" class="status-bar ${hasSpeechAPI ? 'ready' : 'warning'}" style="margin-bottom:0;">
            ${hasSpeechAPI ? '● Ready — click Start Recording or upload a file' : '⚠ Speech API unavailable — upload a file to transcribe'}
          </div>
        </div>

        <!-- Transcript output -->
        <div class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <h3>Transcript</h3>
            <span id="word-count" class="word-count">0 words</span>
          </div>
          <textarea class="transcript-box" id="transcript-output"
            placeholder="Your transcript will appear here... Start recording or upload a file."
            oninput="updateWordCount()"></textarea>

          <div id="srt-preview" class="srt-preview" style="display:none;"></div>
        </div>
      </div>

      <!-- Right: Segments + Export -->
      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-bottom:12px;">Timed Segments</h3>
          <div id="segment-list" class="segment-list">
            <div style="text-align:center; padding:24px; color:var(--text-faint); font-size:12px;">
              Segments appear here during recording
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">Export</h3>
          <div class="export-options">
            <button class="btn btn-primary" onclick="exportTXT()" style="justify-content:center;">
              ↓ Download as .TXT
            </button>
            <button class="btn btn-secondary" onclick="exportSRT()" style="justify-content:center;">
              ↓ Download as .SRT (Subtitles)
            </button>
            <button class="btn btn-ghost" onclick="copyToClipboard()" style="justify-content:center;">
              ⎘ Copy to Clipboard
            </button>
          </div>

          <hr class="divider" />

          <div>
            <div style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Language</div>
            <select id="lang-select">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="pt-BR">Portuguese (Brazil)</option>
              <option value="ja-JP">Japanese</option>
              <option value="zh-CN">Chinese (Mandarin)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── File upload ──────────────────────────────────────────────────────────────
function handleMediaFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  mediaFile = file;

  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  const playerEl = document.getElementById('media-player');
  playerEl.style.display = 'block';

  const tag = isVideo ? 'video' : 'audio';
  playerEl.innerHTML = `
    <${tag} src="${url}" controls id="media-element"></${tag}>
    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
      ${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB
    </div>`;

  updateStatus('active', '● File loaded — press Start Recording then play the file to transcribe');
}

// ─── Recording ────────────────────────────────────────────────────────────────
function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

function startRecording() {
  if (!hasSpeechAPI) return;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.getElementById('lang-select')?.value || 'en-US';

  sessionStart = Date.now();

  recognition.onresult = (event) => {
    let interimText = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalText += result[0].transcript;
        const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
        transcriptSegments.push({
          start: parseFloat(elapsed),
          text: result[0].transcript.trim(),
        });
        updateSegmentList();
      } else {
        interimText += result[0].transcript;
      }
    }

    const output = document.getElementById('transcript-output');
    if (output) {
      const base = transcriptSegments.map(s => s.text).join(' ');
      output.value = base + (interimText ? ' ' + interimText : '');
      updateWordCount();
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'aborted') {
      updateStatus('warning', '⚠ Microphone error: ' + event.error);
    }
  };

  recognition.onend = () => {
    if (isRecording) recognition.start(); // auto-restart for continuous
  };

  recognition.start();
  isRecording = true;

  document.getElementById('mic-btn').textContent = '⏹ Stop Recording';
  document.getElementById('recording-indicator').style.display = 'flex';
  updateStatus('active', '● Recording — speak clearly into your microphone');
}

function stopRecording() {
  if (recognition) {
    isRecording = false;
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }

  document.getElementById('mic-btn').textContent = '🎤 Start Recording';
  document.getElementById('recording-indicator').style.display = 'none';
  updateStatus('ready', '● Recording stopped');

  const output = document.getElementById('transcript-output');
  if (output && output.value.trim()) {
    incrementStat('co_transcripts');
    logActivity(
      `Transcript generated: <strong>${countWords(output.value)} words</strong>${mediaFile ? ' from ' + mediaFile.name : ' via microphone'}`,
      'success'
    );
  }
}

// ─── Segment list ─────────────────────────────────────────────────────────────
function updateSegmentList() {
  const list = document.getElementById('segment-list');
  if (!list) return;
  if (transcriptSegments.length === 0) return;

  list.innerHTML = transcriptSegments.slice(-10).reverse().map((s, i) => `
    <div class="segment-item">
      <div class="segment-time">${formatTime(s.start)}</div>
      <div class="segment-text">${s.text}</div>
    </div>`).join('');
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatSRTTime(secs) {
  const ms = Math.round((secs % 1) * 1000).toString().padStart(3, '0');
  return `${formatTime(secs)},${ms}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function updateStatus(type, text) {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  bar.className = `status-bar ${type}`;
  bar.textContent = text;
}

function updateWordCount() {
  const output = document.getElementById('transcript-output');
  const wc = document.getElementById('word-count');
  if (!output || !wc) return;
  wc.textContent = `${countWords(output.value)} words`;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function clearTranscript() {
  transcriptSegments = [];
  const output = document.getElementById('transcript-output');
  if (output) output.value = '';
  updateWordCount();
  updateSegmentList();
  document.getElementById('srt-preview').style.display = 'none';
  updateStatus('ready', '● Ready — transcript cleared');
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportTXT() {
  const text = document.getElementById('transcript-output')?.value || '';
  if (!text.trim()) { alert('No transcript to export.'); return; }
  downloadText(text, 'transcript.txt', 'text/plain');
}

function exportSRT() {
  if (transcriptSegments.length === 0) {
    const text = document.getElementById('transcript-output')?.value || '';
    if (!text.trim()) { alert('No transcript to export.'); return; }
    // Fallback: split into ~5s chunks
    const words = text.trim().split(/\s+/);
    const chunkSize = 10;
    let srt = '';
    for (let i = 0; i < words.length; i += chunkSize) {
      const idx = Math.floor(i / chunkSize) + 1;
      const start = i * 0.5;
      const end   = start + 5;
      const line  = words.slice(i, i + chunkSize).join(' ');
      srt += `${idx}\n${formatSRTTime(start)} --> ${formatSRTTime(end)}\n${line}\n\n`;
    }
    downloadText(srt, 'transcript.srt', 'text/plain');

    const preview = document.getElementById('srt-preview');
    preview.textContent = srt.slice(0, 600) + (srt.length > 600 ? '\n...' : '');
    preview.style.display = 'block';
    return;
  }

  let srt = '';
  transcriptSegments.forEach((seg, i) => {
    const start = seg.start;
    const end   = transcriptSegments[i + 1] ? transcriptSegments[i + 1].start : start + 3;
    srt += `${i + 1}\n${formatSRTTime(start)} --> ${formatSRTTime(end)}\n${seg.text}\n\n`;
  });
  downloadText(srt, 'transcript.srt', 'text/plain');

  const preview = document.getElementById('srt-preview');
  preview.textContent = srt.slice(0, 600) + (srt.length > 600 ? '\n...' : '');
  preview.style.display = 'block';
}

function copyToClipboard() {
  const text = document.getElementById('transcript-output')?.value || '';
  if (!text.trim()) { alert('No transcript to copy.'); return; }
  navigator.clipboard.writeText(text).then(() => {
    updateStatus('ready', '✓ Copied to clipboard!');
    setTimeout(() => updateStatus('ready', '● Ready'), 2000);
  });
}

function downloadText(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
