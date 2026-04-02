/**
 * Mockup Feedback System v2
 * - Text memos per page (localStorage)
 * - Screenshot capture (html2canvas)
 * - Paste images (Ctrl+V) + file upload (multiple)
 * - Screenshot-only memos (no text required)
 * - Panel stays open across page navigation
 * - PDF export (jsPDF)
 * - Shared across pages within same mockup folder
 */

(function () {
  'use strict';

  const STORAGE_PREFIX = 'fb_';
  const PANEL_STATE_KEY = 'fb_panel_open';
  const TAB_STATE_KEY = 'fb_tab';
  const mockupKey = getMockupKey();

  function getMockupKey() {
    const parts = location.pathname.split('/').filter(Boolean);
    for (const p of parts) {
      if (/^\d{4}-\d{2}-\d{2}/.test(p)) return STORAGE_PREFIX + p;
    }
    return STORAGE_PREFIX + parts.slice(0, 2).join('_');
  }

  function getPageName() {
    const filename = location.pathname.split('/').pop() || 'index.html';
    return filename.replace('.html', '');
  }

  // ── Storage ──
  function loadMemos() {
    try { return JSON.parse(localStorage.getItem(mockupKey) || '[]'); }
    catch { return []; }
  }

  function saveMemos(memos) {
    localStorage.setItem(mockupKey, JSON.stringify(memos));
  }

  function addMemo(text, screenshots) {
    const memos = loadMemos();
    memos.push({
      id: Date.now(),
      page: getPageName(),
      text: text || '',
      screenshots: screenshots && screenshots.length > 0 ? screenshots : [],
      // Legacy compat
      screenshot: screenshots && screenshots.length > 0 ? screenshots[0] : null,
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

  // Panel state persistence
  function savePanelState(open) {
    localStorage.setItem(PANEL_STATE_KEY, open ? '1' : '0');
  }
  function loadPanelState() {
    return localStorage.getItem(PANEL_STATE_KEY) === '1';
  }
  function saveTabState(tab) {
    localStorage.setItem(TAB_STATE_KEY, tab);
  }
  function loadTabState() {
    return localStorage.getItem(TAB_STATE_KEY) || 'current';
  }

  // ── UI ──
  function init() {
    const h2cScript = document.createElement('script');
    h2cScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(h2cScript);

    const jsPdfScript = document.createElement('script');
    jsPdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(jsPdfScript);

    injectHTML();
    bindEvents();

    // Restore panel state
    currentTab = loadTabState();
    document.querySelectorAll('.fb-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
    if (loadPanelState()) {
      document.getElementById('fbPanel').classList.add('open');
    }

    renderMemos();
    updateBadge();
  }

  function injectHTML() {
    const container = document.createElement('div');
    container.id = 'feedbackRoot';
    container.innerHTML = `
      <button class="fb-trigger" id="fbTrigger" title="Feedback">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="badge" id="fbBadge" style="display:none;">0</span>
      </button>

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
          <textarea class="fb-textarea" id="fbTextarea" placeholder="Type feedback... (or just attach screenshots)"></textarea>
          <div id="fbPendingPreviews" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
          <div class="fb-input-actions">
            <button class="fb-btn-capture" id="fbCapture" title="Capture current page">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Capture
            </button>
            <label class="fb-btn-capture" id="fbAttachLabel" title="Attach image files" style="cursor: pointer; margin: 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              Attach
              <input type="file" id="fbFileInput" accept="image/*" multiple style="display: none;">
            </label>
            <span style="font-size: 10px; color: #94A3B8; margin-left: 2px;" title="Paste with Ctrl+V / Cmd+V">Ctrl+V</span>
            <button class="fb-btn-submit" id="fbSubmit" disabled>Add</button>
          </div>
        </div>
      </div>

      <div class="fb-preview-overlay" id="fbPreview">
        <button class="fb-preview-close" id="fbPreviewClose">&times;</button>
        <div class="fb-preview-toolbar" id="fbPreviewToolbar">
          <button class="fb-tool-btn active" data-tool="move" title="Move / View">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
            View
          </button>
          <div class="fb-tool-sep"></div>
          <button class="fb-tool-btn" data-tool="pen" title="Draw">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Draw
          </button>
          <button class="fb-tool-btn" data-tool="arrow" title="Arrow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            Arrow
          </button>
          <div class="fb-tool-sep"></div>
          <span class="fb-color-dot active" data-color="#EF4444" style="background:#EF4444;" title="Red"></span>
          <span class="fb-color-dot" data-color="#F59E0B" style="background:#F59E0B;" title="Yellow"></span>
          <span class="fb-color-dot" data-color="#10B981" style="background:#10B981;" title="Green"></span>
          <span class="fb-color-dot" data-color="#3B82F6" style="background:#3B82F6;" title="Blue"></span>
          <span class="fb-color-dot" data-color="#FFFFFF" style="background:#FFFFFF;" title="White"></span>
          <div class="fb-tool-sep"></div>
          <button class="fb-tool-btn" id="fbDrawUndo" title="Undo">Undo</button>
          <button class="fb-tool-btn" id="fbDrawSave" title="Save drawing" style="color:#00B894;">Save</button>
        </div>
        <button class="fb-preview-nav prev" id="fbPrevImg">&#8249;</button>
        <button class="fb-preview-nav next" id="fbNextImg">&#8250;</button>
        <div class="fb-preview-canvas-wrap" id="fbCanvasWrap">
          <img id="fbPreviewImg" src="">
          <canvas id="fbDrawCanvas"></canvas>
        </div>
        <div class="fb-preview-counter" id="fbPreviewCounter"></div>
      </div>
      <div class="fb-capturing" id="fbCapturing"></div>
    `;
    document.body.appendChild(container);
  }

  let currentTab = 'current';
  let pendingScreenshots = [];

  function updateSubmitState() {
    const text = document.getElementById('fbTextarea').value.trim();
    document.getElementById('fbSubmit').disabled = !text && pendingScreenshots.length === 0;
  }

  function bindEvents() {
    // Toggle panel (persist state)
    document.getElementById('fbTrigger').addEventListener('click', () => {
      const panel = document.getElementById('fbPanel');
      panel.classList.toggle('open');
      savePanelState(panel.classList.contains('open'));
    });

    // Tabs (persist state)
    document.querySelectorAll('.fb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        saveTabState(currentTab);
        renderMemos();
      });
    });

    // Textarea
    document.getElementById('fbTextarea').addEventListener('input', updateSubmitState);

    // Submit — text optional if screenshots exist
    document.getElementById('fbSubmit').addEventListener('click', () => {
      const text = document.getElementById('fbTextarea').value.trim();
      if (!text && pendingScreenshots.length === 0) return;
      addMemo(text, [...pendingScreenshots]);
      document.getElementById('fbTextarea').value = '';
      pendingScreenshots = [];
      renderPendingPreviews();
      updateSubmitState();
      renderMemos();
      updateBadge();
    });

    // Capture screenshot
    document.getElementById('fbCapture').addEventListener('click', async () => {
      if (typeof html2canvas === 'undefined') {
        alert('Screenshot library is still loading. Please try again.');
        return;
      }
      const root = document.getElementById('feedbackRoot');
      root.style.display = 'none';
      try {
        const canvas = await html2canvas(document.body, {
          scale: 1, useCORS: true, logging: false,
          ignoreElements: (el) => el.id === 'feedbackRoot'
        });
        pendingScreenshots.push(canvas.toDataURL('image/jpeg', 0.7));
        renderPendingPreviews();
        updateSubmitState();
      } catch (e) {
        alert('Screenshot failed: ' + e.message);
      }
      root.style.display = '';
    });

    // File attach (multiple)
    document.getElementById('fbFileInput').addEventListener('change', (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    });

    // Paste image (Ctrl+V / Cmd+V)
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      let hasImage = false;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          hasImage = true;
          const file = item.getAsFile();
          if (file) readFileAsDataURL(file);
        }
      }
      if (hasImage) e.preventDefault();
    });

    // Clear all
    document.getElementById('fbClearAll').addEventListener('click', () => {
      if (!confirm('Clear all feedback for this mockup?')) return;
      clearAllMemos();
      pendingScreenshots = [];
      renderPendingPreviews();
      updateSubmitState();
      renderMemos();
      updateBadge();
    });

    // Export PDF
    document.getElementById('fbExportPdf').addEventListener('click', exportPdf);

    // Preview close
    document.getElementById('fbPreviewClose').addEventListener('click', closePreview);
    document.getElementById('fbPreview').addEventListener('click', (e) => {
      if (e.target === document.getElementById('fbPreview')) closePreview();
    });

    // Gallery nav
    document.getElementById('fbPrevImg').addEventListener('click', (e) => { e.stopPropagation(); navigatePreview(-1); });
    document.getElementById('fbNextImg').addEventListener('click', (e) => { e.stopPropagation(); navigatePreview(1); });

    // Drawing tools
    document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        drawState.tool = btn.dataset.tool;
        const canvas = document.getElementById('fbDrawCanvas');
        canvas.style.pointerEvents = drawState.tool === 'move' ? 'none' : 'auto';
      });
    });

    // Color picker
    document.querySelectorAll('.fb-color-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.fb-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        drawState.color = dot.dataset.color;
      });
    });

    // Undo
    document.getElementById('fbDrawUndo').addEventListener('click', (e) => {
      e.stopPropagation();
      drawUndo();
    });

    // Save drawing
    document.getElementById('fbDrawSave').addEventListener('click', (e) => {
      e.stopPropagation();
      drawSave();
    });

    // Canvas drawing events
    initDrawCanvas();

    // Keyboard shortcuts in preview
    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('fbPreview').classList.contains('open')) return;
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowLeft') navigatePreview(-1);
      if (e.key === 'ArrowRight') navigatePreview(1);
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); drawUndo(); }
    });

    // Ctrl+Enter to submit
    document.getElementById('fbTextarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        document.getElementById('fbSubmit').click();
      }
    });
  }

  // ── Preview Gallery + Drawing ──
  let previewState = { memoId: null, images: [], originals: [], index: 0, source: null };
  let drawState = { tool: 'move', color: '#EF4444', drawing: false, history: [], lineWidth: 3 };

  function openPreview(images, index, memoId, source) {
    previewState = { memoId, images: [...images], originals: [...images], index: index || 0, source: source || 'memo' };
    drawState.history = [];
    drawState.tool = 'move';
    document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'move'));
    showPreviewImage();
    document.getElementById('fbPreview').classList.add('open');
  }

  function closePreview() {
    document.getElementById('fbPreview').classList.remove('open');
    drawState.history = [];
  }

  function showPreviewImage() {
    const img = document.getElementById('fbPreviewImg');
    const canvas = document.getElementById('fbDrawCanvas');
    const { images, index } = previewState;

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = img.offsetWidth + 'px';
      canvas.style.height = img.offsetHeight + 'px';
      canvas.style.pointerEvents = drawState.tool === 'move' ? 'none' : 'auto';
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawState.history = [];
    };
    img.src = images[index];

    // Counter
    const counter = document.getElementById('fbPreviewCounter');
    counter.textContent = images.length > 1 ? `${index + 1} / ${images.length}` : '';
    counter.style.display = images.length > 1 ? 'block' : 'none';

    // Nav buttons
    document.getElementById('fbPrevImg').style.display = images.length > 1 ? 'flex' : 'none';
    document.getElementById('fbNextImg').style.display = images.length > 1 ? 'flex' : 'none';
    document.getElementById('fbPrevImg').disabled = index === 0;
    document.getElementById('fbNextImg').disabled = index === images.length - 1;

    // Show/hide save button based on source
    document.getElementById('fbDrawSave').style.display = previewState.memoId ? 'inline-flex' : 'inline-flex';
  }

  function navigatePreview(dir) {
    const { images, index } = previewState;
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= images.length) return;
    // Save current drawing before navigating
    mergeDrawingToPreview();
    previewState.index = newIdx;
    showPreviewImage();
  }

  function mergeDrawingToPreview() {
    if (drawState.history.length === 0) return;
    const canvas = document.getElementById('fbDrawCanvas');
    const img = document.getElementById('fbPreviewImg');
    const merged = document.createElement('canvas');
    merged.width = canvas.width;
    merged.height = canvas.height;
    const ctx = merged.getContext('2d');
    ctx.drawImage(img, 0, 0, merged.width, merged.height);
    ctx.drawImage(canvas, 0, 0);
    previewState.images[previewState.index] = merged.toDataURL('image/jpeg', 0.85);
  }

  function initDrawCanvas() {
    const canvas = document.getElementById('fbDrawCanvas');
    let lastX, lastY, arrowStart;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const touch = e.touches ? e.touches[0] : e;
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }

    function startDraw(e) {
      if (drawState.tool === 'move') return;
      e.preventDefault();
      e.stopPropagation();
      drawState.drawing = true;
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      arrowStart = { x: pos.x, y: pos.y };
      // Save state for undo
      drawState.history.push(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
    }

    function moveDraw(e) {
      if (!drawState.drawing) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = getPos(e);
      const ctx = canvas.getContext('2d');

      if (drawState.tool === 'pen') {
        ctx.strokeStyle = drawState.color;
        ctx.lineWidth = drawState.lineWidth * (canvas.width / canvas.getBoundingClientRect().width);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
      }
      // Arrow: preview line while dragging (redraw from history)
      if (drawState.tool === 'arrow') {
        const lastState = drawState.history[drawState.history.length - 1];
        if (lastState) ctx.putImageData(lastState, 0, 0);
        drawArrow(ctx, arrowStart.x, arrowStart.y, pos.x, pos.y);
      }
    }

    function endDraw(e) {
      if (!drawState.drawing) return;
      drawState.drawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw);
  }

  function drawArrow(ctx, fx, fy, tx, ty) {
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const headLen = 15 * scale;
    const angle = Math.atan2(ty - fy, tx - fx);
    ctx.strokeStyle = drawState.color;
    ctx.lineWidth = drawState.lineWidth * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawUndo() {
    const canvas = document.getElementById('fbDrawCanvas');
    const ctx = canvas.getContext('2d');
    if (drawState.history.length > 0) {
      const prev = drawState.history.pop();
      ctx.putImageData(prev, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawSave() {
    mergeDrawingToPreview();
    const { memoId, images, index, source } = previewState;

    if (source === 'pending') {
      // Update pending screenshots
      pendingScreenshots = [...images];
      renderPendingPreviews();
      updateSubmitState();
    } else if (memoId) {
      // Update memo screenshots
      const memos = loadMemos();
      const memo = memos.find(m => m.id === memoId);
      if (memo) {
        memo.screenshots = [...images];
        memo.screenshot = images[0] || null;
        saveMemos(memos);
        renderMemos();
      }
    }

    // Reset canvas
    const canvas = document.getElementById('fbDrawCanvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    drawState.history = [];

    // Show saved indicator briefly
    const saveBtn = document.getElementById('fbDrawSave');
    const orig = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.textContent = orig; }, 1000);
  }

  function handleFiles(files) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        readFileAsDataURL(file);
      }
    }
  }

  function readFileAsDataURL(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Compress if too large
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        pendingScreenshots.push(canvas.toDataURL('image/jpeg', 0.7));
        renderPendingPreviews();
        updateSubmitState();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderPendingPreviews() {
    const container = document.getElementById('fbPendingPreviews');
    if (pendingScreenshots.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = pendingScreenshots.map((src, i) => `
      <div style="position: relative; width: 72px; height: 72px; border-radius: 6px; overflow: hidden; border: 2px solid #6C5CE7; flex-shrink: 0;">
        <img src="${src}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window._fbPreviewPending(${i})">
        <button onclick="event.stopPropagation(); window._fbRemovePending(${i})" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 10px; line-height: 1;">&times;</button>
      </div>
    `).join('');
  }

  window._fbRemovePending = function (index) {
    pendingScreenshots.splice(index, 1);
    renderPendingPreviews();
    updateSubmitState();
  };

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

    const sorted = [...filtered].sort((a, b) => b.id - a.id);

    content.innerHTML = sorted.map(m => {
      // Support both legacy (screenshot) and new (screenshots[])
      const imgs = m.screenshots && m.screenshots.length > 0
        ? m.screenshots
        : (m.screenshot ? [m.screenshot] : []);

      return `
        <div class="fb-memo" data-id="${m.id}">
          <div class="fb-memo-header">
            <span class="fb-memo-page">${m.page}</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="fb-memo-time">${formatTime(m.time)}</span>
              <button class="fb-memo-delete" onclick="window._fbDelete(${m.id})" title="Delete">&times;</button>
            </div>
          </div>
          ${m.text ? `<div class="fb-memo-text">${escapeHtml(m.text)}</div>` : ''}
          ${imgs.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
              ${imgs.map((src, i) => `
                <div class="fb-memo-screenshot" onclick="window._fbPreviewImg('${m.id}', ${i})" style="width: ${imgs.length === 1 ? '100%' : 'calc(50% - 2px)'}; cursor: pointer;">
                  <img src="${src}" style="width: 100%; display: block; border-radius: 4px;">
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
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
    if (typeof window.jspdf === 'undefined') {
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

    const grouped = {};
    memos.forEach(m => {
      if (!grouped[m.page]) grouped[m.page] = [];
      grouped[m.page].push(m);
    });

    for (const [page, pageMemos] of Object.entries(grouped)) {
      if (y > 260) { doc.addPage(); y = margin; }

      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(108, 92, 231);
      doc.text(`Page: ${page}`, margin, y);
      y += 7;

      for (const memo of pageMemos) {
        if (y > 250) { doc.addPage(); y = margin; }

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(150);
        doc.text(formatTime(memo.time), margin, y);
        y += 5;

        if (memo.text) {
          doc.setFontSize(11);
          doc.setTextColor(30);
          const lines = doc.splitTextToSize(memo.text, contentWidth);
          doc.text(lines, margin, y);
          y += lines.length * 5 + 2;
        }

        const imgs = memo.screenshots && memo.screenshots.length > 0
          ? memo.screenshots
          : (memo.screenshot ? [memo.screenshot] : []);

        for (const src of imgs) {
          try {
            const imgHeight = 50;
            if (y + imgHeight > 280) { doc.addPage(); y = margin; }
            doc.addImage(src, 'JPEG', margin, y, contentWidth, imgHeight);
            y += imgHeight + 4;
          } catch (e) { /* skip */ }
        }

        doc.setDrawColor(230);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
      }
      y += 4;
    }

    doc.save(mockupKey.replace(STORAGE_PREFIX, '') + '-feedback.pdf');
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

  window._fbDelete = function (id) {
    deleteMemo(id);
    renderMemos();
    updateBadge();
  };

  window._fbPreviewImg = function (id, index) {
    const memo = loadMemos().find(m => m.id === Number(id));
    if (!memo) return;
    const imgs = memo.screenshots && memo.screenshots.length > 0
      ? memo.screenshots
      : (memo.screenshot ? [memo.screenshot] : []);
    if (imgs.length > 0) {
      openPreview(imgs, index || 0, memo.id, 'memo');
    }
  };

  // Also allow previewing pending screenshots
  window._fbPreviewPending = function (index) {
    if (pendingScreenshots.length > 0) {
      openPreview(pendingScreenshots, index || 0, null, 'pending');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
