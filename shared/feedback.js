/**
 * Mockup Feedback System
 * - Text memos per page (localStorage)
 * - Screenshot capture (html2canvas)
 * - PDF export (jsPDF)
 * - Shared across pages within same mockup folder
 *
 * Usage: add to any mockup page:
 *   <link rel="stylesheet" href="../shared/feedback.css">
 *   <script src="../shared/feedback.js"><\/script>
 */

(function () {
  'use strict';

  // ── Config ──
  const STORAGE_PREFIX = 'fb_';
  const mockupKey = getMockupKey();

  function getMockupKey() {
    // Group by mockup folder: e.g., "2026-04-02-app-clock"
    const parts = location.pathname.split('/').filter(Boolean);
    // Find the date-prefixed folder
    for (const p of parts) {
      if (/^\d{4}-\d{2}-\d{2}/.test(p)) return STORAGE_PREFIX + p;
    }
    // Fallback: use first two path segments
    return STORAGE_PREFIX + parts.slice(0, 2).join('_');
  }

  function getPageName() {
    const filename = location.pathname.split('/').pop() || 'index.html';
    return filename.replace('.html', '');
  }

  // ── Storage ──
  function loadMemos() {
    try {
      return JSON.parse(localStorage.getItem(mockupKey) || '[]');
    } catch { return []; }
  }

  function saveMemos(memos) {
    localStorage.setItem(mockupKey, JSON.stringify(memos));
  }

  function addMemo(text, screenshot) {
    const memos = loadMemos();
    memos.push({
      id: Date.now(),
      page: getPageName(),
      text: text,
      screenshot: screenshot || null,
      time: new Date().toISOString()
    });
    saveMemos(memos);
    return memos;
  }

  function deleteMemo(id) {
    const memos = loadMemos().filter(m => m.id !== id);
    saveMemos(memos);
    return memos;
  }

  function clearAllMemos() {
    localStorage.removeItem(mockupKey);
  }

  // ── UI ──
  function init() {
    // Load html2canvas from CDN (lazy)
    const h2cScript = document.createElement('script');
    h2cScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(h2cScript);

    // Load jsPDF from CDN (lazy)
    const jsPdfScript = document.createElement('script');
    jsPdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(jsPdfScript);

    injectHTML();
    bindEvents();
    renderMemos();
    updateBadge();
  }

  function injectHTML() {
    const container = document.createElement('div');
    container.id = 'feedbackRoot';
    container.innerHTML = `
      <!-- Trigger Button -->
      <button class="fb-trigger" id="fbTrigger" title="Feedback">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="badge" id="fbBadge" style="display:none;">0</span>
      </button>

      <!-- Panel -->
      <div class="fb-panel" id="fbPanel">
        <div class="fb-header">
          <span class="fb-header-title">Feedback</span>
          <div class="fb-header-actions">
            <button class="fb-header-btn danger" id="fbClearAll" title="Clear all">Clear</button>
            <button class="fb-header-btn primary" id="fbExportPdf">Export PDF</button>
          </div>
        </div>
        <div class="fb-tabs">
          <button class="fb-tab active" data-tab="current">This Page</button>
          <button class="fb-tab" data-tab="all">All Pages</button>
        </div>
        <div class="fb-content" id="fbContent">
          <div class="fb-empty">No feedback yet. Add a memo below.</div>
        </div>
        <div class="fb-input-area">
          <textarea class="fb-textarea" id="fbTextarea" placeholder="Type your feedback..."></textarea>
          <div class="fb-input-actions">
            <button class="fb-btn-capture" id="fbCapture" title="Capture screenshot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Screenshot
            </button>
            <button class="fb-btn-submit" id="fbSubmit" disabled>Add</button>
          </div>
        </div>
      </div>

      <!-- Screenshot preview -->
      <div class="fb-preview-overlay" id="fbPreview">
        <img id="fbPreviewImg" src="">
      </div>

      <!-- Capturing indicator -->
      <div class="fb-capturing" id="fbCapturing"></div>
    `;
    document.body.appendChild(container);
  }

  let currentTab = 'current';
  let pendingScreenshot = null;

  function bindEvents() {
    // Toggle panel
    document.getElementById('fbTrigger').addEventListener('click', () => {
      document.getElementById('fbPanel').classList.toggle('open');
    });

    // Tabs
    document.querySelectorAll('.fb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        renderMemos();
      });
    });

    // Textarea
    const textarea = document.getElementById('fbTextarea');
    textarea.addEventListener('input', () => {
      document.getElementById('fbSubmit').disabled = !textarea.value.trim();
    });

    // Submit
    document.getElementById('fbSubmit').addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) return;
      addMemo(text, pendingScreenshot);
      textarea.value = '';
      pendingScreenshot = null;
      document.getElementById('fbSubmit').disabled = true;
      removePendingPreview();
      renderMemos();
      updateBadge();
    });

    // Capture screenshot
    document.getElementById('fbCapture').addEventListener('click', async () => {
      if (typeof html2canvas === 'undefined') {
        alert('Screenshot library is still loading. Please try again.');
        return;
      }

      // Hide feedback UI during capture
      const root = document.getElementById('feedbackRoot');
      root.style.display = 'none';
      const capturing = document.getElementById('fbCapturing');

      try {
        const canvas = await html2canvas(document.body, {
          scale: 1,
          useCORS: true,
          logging: false,
          ignoreElements: (el) => el.id === 'feedbackRoot'
        });
        pendingScreenshot = canvas.toDataURL('image/jpeg', 0.7);
        showPendingPreview();
      } catch (e) {
        alert('Screenshot failed: ' + e.message);
      }

      root.style.display = '';
    });

    // Clear all
    document.getElementById('fbClearAll').addEventListener('click', () => {
      if (!confirm('Clear all feedback for this mockup?')) return;
      clearAllMemos();
      pendingScreenshot = null;
      removePendingPreview();
      renderMemos();
      updateBadge();
    });

    // Export PDF
    document.getElementById('fbExportPdf').addEventListener('click', exportPdf);

    // Preview overlay close
    document.getElementById('fbPreview').addEventListener('click', () => {
      document.getElementById('fbPreview').classList.remove('open');
    });

    // Enter key to submit
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        document.getElementById('fbSubmit').click();
      }
    });
  }

  function showPendingPreview() {
    let preview = document.getElementById('fbPendingPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'fbPendingPreview';
      preview.style.cssText = 'margin-top: 8px; position: relative; border-radius: 6px; overflow: hidden; border: 2px solid #6C5CE7;';
      preview.innerHTML = `
        <img src="" style="width: 100%; display: block;">
        <button style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 12px;" onclick="this.parentElement.remove(); window._fbClearScreenshot && window._fbClearScreenshot();">&times;</button>
      `;
      document.querySelector('.fb-input-area').appendChild(preview);
    }
    preview.querySelector('img').src = pendingScreenshot;

    window._fbClearScreenshot = () => { pendingScreenshot = null; };
  }

  function removePendingPreview() {
    const el = document.getElementById('fbPendingPreview');
    if (el) el.remove();
  }

  function renderMemos() {
    const content = document.getElementById('fbContent');
    const memos = loadMemos();
    const page = getPageName();

    const filtered = currentTab === 'current'
      ? memos.filter(m => m.page === page)
      : memos;

    if (filtered.length === 0) {
      content.innerHTML = '<div class="fb-empty">No feedback yet. Add a memo below.</div>';
      return;
    }

    // Sort newest first
    const sorted = [...filtered].sort((a, b) => b.id - a.id);

    content.innerHTML = sorted.map(m => `
      <div class="fb-memo" data-id="${m.id}">
        <div class="fb-memo-header">
          <span class="fb-memo-page">${m.page}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="fb-memo-time">${formatTime(m.time)}</span>
            <button class="fb-memo-delete" onclick="window._fbDelete(${m.id})" title="Delete">&times;</button>
          </div>
        </div>
        <div class="fb-memo-text">${escapeHtml(m.text)}</div>
        ${m.screenshot ? `
          <div class="fb-memo-screenshot" onclick="window._fbPreview('${m.id}')">
            <img src="${m.screenshot}">
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function updateBadge() {
    const count = loadMemos().length;
    const badge = document.getElementById('fbBadge');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── PDF Export ──
  async function exportPdf() {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      alert('PDF library is still loading. Please try again.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const memos = loadMemos();

    if (memos.length === 0) {
      alert('No feedback to export.');
      return;
    }

    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Mockup Feedback Report', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Mockup: ${mockupKey.replace(STORAGE_PREFIX, '')}`, margin, y);
    y += 5;
    doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
    y += 5;
    doc.text(`Total memos: ${memos.length}`, margin, y);
    y += 10;

    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Group by page
    const grouped = {};
    memos.forEach(m => {
      if (!grouped[m.page]) grouped[m.page] = [];
      grouped[m.page].push(m);
    });

    for (const [page, pageMemos] of Object.entries(grouped)) {
      // Page title
      if (y > 260) { doc.addPage(); y = margin; }

      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(108, 92, 231);
      doc.text(`Page: ${page}`, margin, y);
      y += 7;

      for (const memo of pageMemos) {
        if (y > 250) { doc.addPage(); y = margin; }

        // Time
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(150);
        doc.text(formatTime(memo.time), margin, y);
        y += 5;

        // Text
        doc.setFontSize(11);
        doc.setTextColor(30);
        const lines = doc.splitTextToSize(memo.text, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;

        // Screenshot
        if (memo.screenshot) {
          try {
            const imgHeight = 50;
            if (y + imgHeight > 280) { doc.addPage(); y = margin; }
            doc.addImage(memo.screenshot, 'JPEG', margin, y, contentWidth, imgHeight);
            y += imgHeight + 4;
          } catch (e) {
            // Skip broken screenshot
          }
        }

        // Separator
        doc.setDrawColor(230);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
      }

      y += 4;
    }

    // Save
    const filename = mockupKey.replace(STORAGE_PREFIX, '') + '-feedback.pdf';
    doc.save(filename);
  }

  // ── Helpers ──
  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Global functions for inline handlers
  window._fbDelete = function (id) {
    deleteMemo(id);
    renderMemos();
    updateBadge();
  };

  window._fbPreview = function (id) {
    const memo = loadMemos().find(m => m.id === Number(id));
    if (memo && memo.screenshot) {
      document.getElementById('fbPreviewImg').src = memo.screenshot;
      document.getElementById('fbPreview').classList.add('open');
    }
  };

  // ── Init on DOM ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
