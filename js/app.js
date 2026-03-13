// ─── CreativeOps SPA Router ───────────────────────────────────────────────────

// API base — works whether served from Express (port 3000) or opened directly
const API_BASE = window.location.origin;

const PAGES = {
  dashboard:  () => renderDashboard(),
  compliance: () => renderCompliance(),
  format:     () => renderFormat(),
  transcript: () => renderTranscript(),
  bitrate:    () => renderBitrate(),
};

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Render page
  const main = document.getElementById('main-content');
  main.innerHTML = '';
  PAGES[page]();

  // Track in localStorage for back-compat
  localStorage.setItem('co_current_page', page);
}

// Sidebar click handlers
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// Init on load
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('co_current_page') || 'dashboard';
  navigate(saved);
});

// ─── Activity Logger ──────────────────────────────────────────────────────────
function logActivity(text, type = 'accent') {
  const activities = JSON.parse(localStorage.getItem('co_activity') || '[]');
  activities.unshift({
    text,
    type,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toLocaleDateString(),
  });
  // Keep last 20
  localStorage.setItem('co_activity', JSON.stringify(activities.slice(0, 20)));
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function incrementStat(key) {
  const v = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, v);
  return v;
}

function getStat(key, fallback = 0) {
  return parseInt(localStorage.getItem(key) || fallback, 10);
}
