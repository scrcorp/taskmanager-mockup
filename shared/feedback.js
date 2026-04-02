/**
 * Mockup Feedback System v4
 * - Original image always preserved (drawing is a separate layer)
 * - Drawing layer: pen, arrow, eraser tools
 * - Undo/Redo support
 * - Save merges drawing onto image; Reset restores original
 * - Close with unsaved changes prompts confirmation
 * - Gallery navigation with keyboard arrows
 * - Zoom + pan in View mode
 * - Text memos, screenshot capture, paste, file attach
 * - PDF export merges originals + drawings
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
    return (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  }

  // ── Storage ──
  function loadMemos() {
    try { return JSON.parse(localStorage.getItem(mockupKey) || '[]'); } catch { return []; }
  }
  function saveMemos(memos) {
    try {
      const data = JSON.stringify(memos);
      localStorage.setItem(mockupKey, data);
    } catch (e) {
      alert('Failed to save! localStorage might be full.\n\nTry clearing old feedback or reducing screenshot count.\n\n' + e.message);
    }
  }

  function addMemo(text, screenshots) {
    const memos = loadMemos();
    memos.push({
      id: Date.now(), page: getPageName(), text: text || '',
      screenshots: screenshots?.length > 0 ? screenshots : [],
      // originals = clean copies, drawings = transparent PNG layers (null = none)
      originals: screenshots?.length > 0 ? [...screenshots] : [],
      drawings: screenshots?.length > 0 ? screenshots.map(() => null) : [],
      time: new Date().toISOString()
    });
    saveMemos(memos);
  }

  function deleteMemo(id) { saveMemos(loadMemos().filter(m => m.id !== id)); }
  function clearAllMemos() { localStorage.removeItem(mockupKey); }

  function savePanelState(v) { localStorage.setItem(PANEL_STATE_KEY, v ? '1' : '0'); }
  function loadPanelState() { return localStorage.getItem(PANEL_STATE_KEY) === '1'; }
  function saveTabState(v) { localStorage.setItem(TAB_STATE_KEY, v); }
  function loadTabState() { return localStorage.getItem(TAB_STATE_KEY) || 'current'; }

  // ── Init ──
  let currentTab = 'current';
  let pendingScreenshots = []; // [{original, drawing}]

  function init() {
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    injectHTML();
    bindEvents();
    currentTab = loadTabState();
    document.querySelectorAll('.fb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
    if (loadPanelState()) document.getElementById('fbPanel').classList.add('open');
    renderMemos();
    updateBadge();
  }

  function loadScript(src) {
    const s = document.createElement('script'); s.src = src; document.head.appendChild(s);
  }

  // ── HTML ──
  function injectHTML() {
    const c = document.createElement('div'); c.id = 'feedbackRoot';
    c.innerHTML = `
      <button class="fb-trigger" id="fbTrigger" title="Feedback">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="badge" id="fbBadge" style="display:none;">0</span>
      </button>
      <div class="fb-panel" id="fbPanel">
        <div class="fb-header">
          <span class="fb-header-title">Feedback</span>
          <div class="fb-header-actions">
            <button class="fb-header-btn danger" id="fbClearAll">Clear</button>
            <button class="fb-header-btn primary" id="fbExportPdf">Export PDF</button>
          </div>
        </div>
        <div class="fb-tabs">
          <button class="fb-tab active" data-tab="current">This Page</button>
          <button class="fb-tab" data-tab="all">All Pages</button>
        </div>
        <div class="fb-content" id="fbContent"><div class="fb-empty">No feedback yet.</div></div>
        <div class="fb-input-area">
          <textarea class="fb-textarea" id="fbTextarea" placeholder="Type feedback... (or just attach screenshots)"></textarea>
          <div id="fbPendingPreviews" style="display:none;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
          <div class="fb-input-actions">
            <button class="fb-btn-capture" id="fbCapture" title="Select area to capture">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Capture
            </button>
            <label class="fb-btn-capture" style="cursor:pointer;margin:0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              Attach<input type="file" id="fbFileInput" accept="image/*" multiple style="display:none;">
            </label>
            <span style="font-size:10px;color:#94A3B8;margin-left:2px;">Ctrl+V</span>
            <button class="fb-btn-submit" id="fbSubmit" disabled>Add</button>
          </div>
        </div>
      </div>

      <!-- Editor overlay -->
      <div class="fb-preview-overlay" id="fbPreview">
        <button class="fb-preview-close" id="fbPreviewClose">&times;</button>
        <div class="fb-preview-toolbar" id="fbPreviewToolbar">
          <button class="fb-tool-btn" data-tool="view" title="Zoom & Pan (scroll to zoom, drag to pan)">View</button>
          <div class="fb-tool-sep"></div>
          <button class="fb-tool-btn active" data-tool="pen" title="Free draw">Draw</button>
          <button class="fb-tool-btn" data-tool="arrow" title="Arrow">Arrow</button>
          <button class="fb-tool-btn" data-tool="rect" title="Rectangle">Rect</button>
          <button class="fb-tool-btn" data-tool="circle" title="Circle">Circle</button>
          <button class="fb-tool-btn" data-tool="eraser" title="Eraser">Eraser</button>
          <div class="fb-tool-sep"></div>
          <span class="fb-color-dot active" data-color="#EF4444" style="background:#EF4444;"></span>
          <span class="fb-color-dot" data-color="#F59E0B" style="background:#F59E0B;"></span>
          <span class="fb-color-dot" data-color="#10B981" style="background:#10B981;"></span>
          <span class="fb-color-dot" data-color="#3B82F6" style="background:#3B82F6;"></span>
          <span class="fb-color-dot" data-color="#FFFFFF" style="background:#FFFFFF;"></span>
          <div class="fb-tool-sep"></div>
          <label style="display:flex;align-items:center;gap:4px;color:#888;font-size:10px;" title="Brush size">
            Size
            <input type="range" id="fbBrushSize" min="1" max="20" value="5" style="width:60px;height:14px;accent-color:#6C5CE7;">
            <span id="fbBrushSizeLabel" style="min-width:16px;text-align:center;">5</span>
          </label>
          <div class="fb-tool-sep"></div>
          <button class="fb-tool-btn" id="fbDrawUndo">Undo</button>
          <button class="fb-tool-btn" id="fbDrawRedo">Redo</button>
          <div class="fb-tool-sep"></div>
          <button class="fb-tool-btn" id="fbDrawCancel" style="color:#F59E0B;" title="Revert to last save">Cancel</button>
          <button class="fb-tool-btn" id="fbDrawReset" style="color:#94A3B8;" title="Reset to original">Reset</button>
          <button class="fb-tool-btn" id="fbDrawSave" style="color:#00B894;">Save</button>
        </div>
        <button class="fb-preview-nav prev" id="fbPrevImg">&#8249;</button>
        <button class="fb-preview-nav next" id="fbNextImg">&#8250;</button>
        <div class="fb-preview-canvas-wrap" id="fbCanvasWrap">
          <img id="fbPreviewImg" src="" draggable="false">
          <canvas id="fbDrawCanvas"></canvas>
        </div>
        <div id="fbBrushCursor" style="display:none;position:fixed;pointer-events:none;border:2px solid rgba(255,255,255,0.8);border-radius:50%;z-index:10001;box-shadow:0 0 0 1px rgba(0,0,0,0.3);"></div>
        <div class="fb-preview-counter" id="fbPreviewCounter"></div>
      </div>
    `;
    document.body.appendChild(c);
  }

  // ── Editor State ──
  const editor = {
    open: false,
    memoId: null,       // null for pending
    source: 'memo',     // 'memo' | 'pending'
    images: [],         // originals (never modified in editor)
    savedDrawings: [],  // last-saved drawing layers (dataURL or null)
    index: 0,
    // Per-image drawing state
    undoStack: [],      // ImageData[]
    redoStack: [],
    dirty: false,       // has unsaved changes on current image
    // Tool state
    tool: 'pen',
    color: '#EF4444',
    lineWidth: 5,
    drawing: false,
    // Zoom/pan
    zoom: 1,
    panX: 0, panY: 0,
    isPanning: false, panStartX: 0, panStartY: 0,
  };

  function updateSubmitState() {
    const text = document.getElementById('fbTextarea').value.trim();
    document.getElementById('fbSubmit').disabled = !text && pendingScreenshots.length === 0;
  }

  // ── Bind Events ──
  function bindEvents() {
    // Panel toggle (only on click, not drag)
    const trigger = document.getElementById('fbTrigger');
    trigger.addEventListener('click', () => {
      if (trigger._wasDragged) { trigger._wasDragged = false; return; }
      const p = document.getElementById('fbPanel'); p.classList.toggle('open');
      savePanelState(p.classList.contains('open'));
    });

    // Draggable trigger button
    initDraggableTrigger();

    // Tabs
    document.querySelectorAll('.fb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active'); currentTab = tab.dataset.tab;
        saveTabState(currentTab); renderMemos();
      });
    });

    document.getElementById('fbTextarea').addEventListener('input', updateSubmitState);

    // Submit
    document.getElementById('fbSubmit').addEventListener('click', () => {
      const text = document.getElementById('fbTextarea').value.trim();
      if (!text && pendingScreenshots.length === 0) return;
      const originals = pendingScreenshots.map(p => p.original);
      const drawings = pendingScreenshots.map(p => p.drawing);
      const merged = pendingScreenshots.map(p =>
        p.drawing ? mergeForExport(p.original, p.drawing) : p.original
      );
      const memos = loadMemos();
      memos.push({
        id: Date.now(), page: getPageName(), text,
        screenshots: merged, originals, drawings,
        time: new Date().toISOString()
      });
      saveMemos(memos);
      document.getElementById('fbTextarea').value = '';
      pendingScreenshots = [];
      renderPendingPreviews(); updateSubmitState(); renderMemos(); updateBadge();
    });

    // Capture with region selection
    document.getElementById('fbCapture').addEventListener('click', () => {
      startRegionCapture();
    });

    // File attach
    document.getElementById('fbFileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

    // Paste
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items; if (!items) return;
      let has = false;
      for (const item of items) {
        if (item.type.startsWith('image/')) { has = true; readFileAsDataURL(item.getAsFile()); }
      }
      if (has) e.preventDefault();
    });

    // Clear
    document.getElementById('fbClearAll').addEventListener('click', () => {
      if (!confirm('Clear all feedback?')) return;
      clearAllMemos(); pendingScreenshots = [];
      renderPendingPreviews(); updateSubmitState(); renderMemos(); updateBadge();
    });

    // PDF
    document.getElementById('fbExportPdf').addEventListener('click', exportPdf);

    // Ctrl+Enter
    document.getElementById('fbTextarea').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey) && !e.isComposing) {
        e.preventDefault();
        document.getElementById('fbSubmit').click();
      }
    });

    // ── Editor events ──
    document.getElementById('fbPreviewClose').addEventListener('click', () => tryCloseEditor());
    document.getElementById('fbPreview').addEventListener('click', e => { if (e.target.id === 'fbPreview') tryCloseEditor(); });
    document.getElementById('fbPrevImg').addEventListener('click', e => { e.stopPropagation(); navEditor(-1); });
    document.getElementById('fbNextImg').addEventListener('click', e => { e.stopPropagation(); navEditor(1); });

    // Tools
    document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editor.tool = btn.dataset.tool;
        updateCanvasCursor();
      });
    });

    // Colors
    document.querySelectorAll('.fb-color-dot').forEach(dot => {
      dot.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.fb-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active'); editor.color = dot.dataset.color;
      });
    });

    document.getElementById('fbDrawUndo').addEventListener('click', e => { e.stopPropagation(); editorUndo(); });
    document.getElementById('fbDrawRedo').addEventListener('click', e => { e.stopPropagation(); editorRedo(); });
    document.getElementById('fbDrawCancel').addEventListener('click', e => { e.stopPropagation(); editorCancel(); });
    document.getElementById('fbDrawReset').addEventListener('click', e => { e.stopPropagation(); editorReset(); });
    document.getElementById('fbDrawSave').addEventListener('click', e => { e.stopPropagation(); editorSave(); });

    // Brush size
    document.getElementById('fbBrushSize').addEventListener('input', e => {
      e.stopPropagation();
      editor.lineWidth = Number(e.target.value);
      document.getElementById('fbBrushSizeLabel').textContent = e.target.value;
    });

    // Brush cursor
    document.addEventListener('mousemove', e => updateBrushCursorPos(e));

    // Canvas mouse/touch + wrap events for view mode pan
    initCanvas();

    // Keyboard
    document.addEventListener('keydown', e => {
      if (!editor.open) return;
      if (e.key === 'Escape') tryCloseEditor();
      if (e.key === 'ArrowLeft') navEditor(-1);
      if (e.key === 'ArrowRight') navEditor(1);
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); editorSave(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); editorUndo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); editorRedo(); }
    });

    // Zoom
    document.getElementById('fbCanvasWrap').addEventListener('wheel', e => {
      if (!editor.open) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      editor.zoom = Math.max(0.5, Math.min(5, editor.zoom * delta));
      applyZoomPan();
    }, { passive: false });
  }

  // ── Canvas Init ──
  function initCanvas() {
    const canvas = document.getElementById('fbDrawCanvas');
    const wrap = document.getElementById('fbCanvasWrap');
    let lastX, lastY, startX, startY;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }

    // ── View mode: pan on the wrap/overlay ──
    function viewDown(e) {
      if (!editor.open || editor.tool !== 'view') return;
      editor.isPanning = true;
      const t = e.touches ? e.touches[0] : e;
      editor.panStartX = t.clientX - editor.panX;
      editor.panStartY = t.clientY - editor.panY;
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
    }
    function viewMove(e) {
      if (!editor.isPanning) return;
      const t = e.touches ? e.touches[0] : e;
      editor.panX = t.clientX - editor.panStartX;
      editor.panY = t.clientY - editor.panStartY;
      applyZoomPan();
      e.preventDefault();
    }
    function viewUp() {
      editor.isPanning = false;
      if (editor.tool === 'view') wrap.style.cursor = 'grab';
    }

    // Attach pan events to the overlay (not canvas, since canvas has pointerEvents none in view mode)
    const overlay = document.getElementById('fbPreview');
    overlay.addEventListener('mousedown', viewDown);
    overlay.addEventListener('mousemove', viewMove);
    overlay.addEventListener('mouseup', viewUp);
    overlay.addEventListener('touchstart', viewDown, { passive: false });
    overlay.addEventListener('touchmove', viewMove, { passive: false });
    overlay.addEventListener('touchend', viewUp);

    // ── Drawing on canvas ──
    function down(e) {
      if (editor.tool === 'view') return;
      e.preventDefault(); e.stopPropagation();
      editor.drawing = true;
      const pos = getPos(e);
      lastX = pos.x; lastY = pos.y;
      startX = pos.x; startY = pos.y;
      const ctx = canvas.getContext('2d');
      editor.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      editor.redoStack = [];
      editor.dirty = true;
      updateUndoRedoButtons();
    }

    function move(e) {
      // Always update brush cursor position (even if not drawing)
      updateBrushCursorPos(e);
      if (!editor.drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      const ctx = canvas.getContext('2d');
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      const lw = editor.lineWidth * scale;

      if (editor.tool === 'pen') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = editor.color; ctx.lineWidth = lw;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        lastX = pos.x; lastY = pos.y;
      } else if (editor.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        const eraserSize = lw * 4;
        ctx.lineWidth = eraserSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        lastX = pos.x; lastY = pos.y;
      } else if (editor.tool === 'arrow' || editor.tool === 'rect' || editor.tool === 'circle') {
        // Preview shape: restore last state then draw shape
        const last = editor.undoStack[editor.undoStack.length - 1];
        if (last) ctx.putImageData(last, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = editor.color; ctx.lineWidth = lw; ctx.lineCap = 'round';

        if (editor.tool === 'arrow') {
          drawArrowShape(ctx, startX, startY, pos.x, pos.y, lw);
        } else if (editor.tool === 'rect') {
          ctx.beginPath();
          ctx.rect(startX, startY, pos.x - startX, pos.y - startY);
          ctx.stroke();
        } else if (editor.tool === 'circle') {
          const rx = Math.abs(pos.x - startX) / 2;
          const ry = Math.abs(pos.y - startY) / 2;
          const cx = (startX + pos.x) / 2;
          const cy = (startY + pos.y) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function up() {
      editor.drawing = false;
    }

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', up);
  }

  // ── Region capture ──
  function startRegionCapture() {
    if (typeof html2canvas === 'undefined') { alert('Loading... try again.'); return; }

    // Hide feedback UI
    const root = document.getElementById('feedbackRoot');
    root.style.display = 'none';

    // Create selection overlay
    const overlay = document.createElement('div');
    overlay.id = 'fbCaptureOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:crosshair;background:rgba(0,0,0,0.2);';

    const selBox = document.createElement('div');
    selBox.style.cssText = 'position:fixed;border:2px solid #6C5CE7;background:rgba(108,92,231,0.08);display:none;z-index:99999;pointer-events:none;';
    overlay.appendChild(selBox);

    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:16px;font-weight:600;background:rgba(0,0,0,0.6);padding:12px 24px;border-radius:10px;z-index:99999;pointer-events:none;';
    hint.textContent = 'Drag to select capture area (ESC to cancel)';
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    let startX, startY, dragging = false;

    overlay.addEventListener('mousedown', e => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      selBox.style.display = 'block';
      hint.style.display = 'none';
    });

    overlay.addEventListener('mousemove', e => {
      if (!dragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selBox.style.left = x + 'px';
      selBox.style.top = y + 'px';
      selBox.style.width = w + 'px';
      selBox.style.height = h + 'px';
    });

    overlay.addEventListener('mouseup', async e => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      overlay.remove();

      if (w < 10 || h < 10) {
        root.style.display = ''; return;
      }

      try {
        const fullCanvas = await html2canvas(document.body, {
          scale: 2, useCORS: true, logging: false,
          ignoreElements: el => el.id === 'feedbackRoot' || el.id === 'fbCaptureOverlay'
        });

        // Crop to selected region
        const crop = document.createElement('canvas');
        const dpr = 2; // matches scale:2
        crop.width = w * dpr;
        crop.height = h * dpr;
        const ctx = crop.getContext('2d');
        ctx.drawImage(fullCanvas,
          x * dpr, y * dpr, w * dpr, h * dpr,
          0, 0, crop.width, crop.height
        );

        pendingScreenshots.push({ original: crop.toDataURL('image/jpeg', 0.85), drawing: null });
        renderPendingPreviews(); updateSubmitState();
      } catch (e) {
        alert('Capture failed: ' + e.message);
      }
      root.style.display = '';
    });

    // ESC to cancel
    const escHandler = e => {
      if (e.key === 'Escape') {
        overlay.remove();
        root.style.display = '';
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── Draggable trigger button ──
  const TRIGGER_POS_KEY = 'fb_trigger_pos';

  function initDraggableTrigger() {
    const trigger = document.getElementById('fbTrigger');
    const panel = document.getElementById('fbPanel');
    let isDragging = false, startX, startY, origX, origY, moved = false;

    // Restore saved position or use default (bottom-right)
    const saved = localStorage.getItem(TRIGGER_POS_KEY);
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        const x = Math.min(pos.x, window.innerWidth - 56);
        const y = Math.min(pos.y, window.innerHeight - 56);
        trigger.style.right = 'auto';
        trigger.style.bottom = 'auto';
        trigger.style.left = x + 'px';
        trigger.style.top = y + 'px';
        updatePanelPosition(x, y);
      } catch {}
    } else {
      // Default position: bottom-right
      const x = window.innerWidth - 68;
      const y = window.innerHeight - 68;
      updatePanelPosition(x, y);
    }

    trigger.addEventListener('mousedown', e => { startDrag(e.clientX, e.clientY); });
    trigger.addEventListener('touchstart', e => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: true });

    document.addEventListener('mousemove', e => { moveDrag(e.clientX, e.clientY); });
    document.addEventListener('touchmove', e => { const t = e.touches[0]; moveDrag(t.clientX, t.clientY); });

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    function startDrag(cx, cy) {
      isDragging = true; moved = false;
      startX = cx; startY = cy;
      const rect = trigger.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
    }

    function moveDrag(cx, cy) {
      if (!isDragging) return;
      const dx = cx - startX, dy = cy - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      const x = Math.max(0, Math.min(window.innerWidth - 56, origX + dx));
      const y = Math.max(0, Math.min(window.innerHeight - 56, origY + dy));
      trigger.style.right = 'auto';
      trigger.style.bottom = 'auto';
      trigger.style.left = x + 'px';
      trigger.style.top = y + 'px';
      updatePanelPosition(x, y);
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      if (moved) {
        trigger._wasDragged = true;
        const rect = trigger.getBoundingClientRect();
        localStorage.setItem(TRIGGER_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
      }
    }

    function updatePanelPosition(x, y) {
      const pw = 420, ph = 600;
      // Try to place panel so its bottom-right aligns with trigger's top-right
      let px = x + 48 - pw; // right-align with trigger
      let py = y - ph - 8;  // above trigger
      // If no room above, place below
      if (py < 8) py = y + 56;
      // If no room on left, shift right
      if (px < 8) px = 8;
      // If goes off right, shift left
      if (px + pw > window.innerWidth - 8) px = window.innerWidth - pw - 8;
      // If goes off bottom, shift up
      if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = px + 'px';
      panel.style.top = py + 'px';
    }
  }

  function updateBrushCursorPos(e) {
    const cursor = document.getElementById('fbBrushCursor');
    if (!cursor) return;
    if (!editor.open || editor.tool === 'view' || editor.tool === 'arrow' || editor.tool === 'rect' || editor.tool === 'circle') {
      cursor.style.display = 'none'; return;
    }
    const canvas = document.getElementById('fbDrawCanvas');
    if (!canvas) { cursor.style.display = 'none'; return; }
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX, cy = e.clientY;
    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
      cursor.style.display = 'none'; return;
    }
    const brushPx = editor.tool === 'eraser' ? editor.lineWidth * 4 : editor.lineWidth;
    const scale = canvas.width / rect.width;
    const displaySize = Math.max((brushPx / scale) * 2, 6);
    cursor.style.display = 'block';
    cursor.style.width = displaySize + 'px';
    cursor.style.height = displaySize + 'px';
    cursor.style.left = (cx - displaySize / 2) + 'px';
    cursor.style.top = (cy - displaySize / 2) + 'px';
    cursor.style.borderColor = editor.tool === 'eraser' ? 'rgba(255,255,255,0.6)' : editor.color;
    cursor.style.background = editor.tool === 'eraser' ? 'rgba(255,255,255,0.15)' : 'none';
  }

  function drawArrowShape(ctx, fx, fy, tx, ty, lw) {
    const headLen = Math.max(lw * 5, 15);
    const angle = Math.atan2(ty - fy, tx - fx);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function updateCanvasCursor() {
    const canvas = document.getElementById('fbDrawCanvas');
    const cursor = document.getElementById('fbBrushCursor');
    if (editor.tool === 'view') {
      canvas.style.pointerEvents = 'none';
      document.getElementById('fbCanvasWrap').style.cursor = 'grab';
      if (cursor) cursor.style.display = 'none';
    } else {
      canvas.style.pointerEvents = 'auto';
      document.getElementById('fbCanvasWrap').style.cursor = 'none'; // hide default, use custom
      canvas.style.cursor = 'none';
      // For arrow/rect/circle, use crosshair instead of brush cursor
      if (editor.tool === 'arrow' || editor.tool === 'rect' || editor.tool === 'circle') {
        canvas.style.cursor = 'crosshair';
        if (cursor) cursor.style.display = 'none';
      }
    }
  }

  function applyZoomPan() {
    const wrap = document.getElementById('fbCanvasWrap');
    wrap.style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
  }

  // ── Editor Open/Close/Nav ──
  function openEditor(images, drawings, index, memoId, source) {
    editor.open = true;
    editor.memoId = memoId;
    editor.source = source || 'memo';
    editor.images = [...images];
    editor.savedDrawings = drawings ? [...drawings] : images.map(() => null);
    editor.index = index || 0;
    editor.zoom = 1; editor.panX = 0; editor.panY = 0;
    editor.tool = 'pen';
    document.querySelectorAll('.fb-tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'pen'));
    loadEditorImage();
    document.getElementById('fbPreview').classList.add('open');
    updateCanvasCursor();
    applyZoomPan();
    updateUndoRedoButtons();
    document.getElementById('fbDrawSave').textContent = 'Save';
  }

  function tryCloseEditor() {
    if (editor.dirty) {
      showCloseModal();
      return;
    }
    closeEditor();
  }

  function showCloseModal() {
    let modal = document.getElementById('fbCloseModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'fbCloseModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = `
        <div style="background:#1E1E2E;border:1px solid #333;border-radius:12px;padding:24px;max-width:340px;width:90%;text-align:center;">
          <div style="font-size:15px;font-weight:700;color:#eee;margin-bottom:8px;">Unsaved Changes</div>
          <div style="font-size:13px;color:#888;margin-bottom:20px;">You have unsaved drawings. What would you like to do?</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button id="fbCloseModalSave" style="padding:8px 18px;border-radius:8px;border:none;background:#00B894;color:white;font-size:13px;font-weight:600;cursor:pointer;">Save & Close</button>
            <button id="fbCloseModalDiscard" style="padding:8px 18px;border-radius:8px;border:none;background:#EF4444;color:white;font-size:13px;font-weight:600;cursor:pointer;">Discard</button>
            <button id="fbCloseModalCancel" style="padding:8px 18px;border-radius:8px;border:1px solid #444;background:#2a2a4a;color:#ccc;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
          </div>
        </div>
      `;
      document.getElementById('feedbackRoot').appendChild(modal);
      document.getElementById('fbCloseModalSave').addEventListener('click', async () => {
        await editorSave();
        hideCloseModal();
        closeEditor();
      });
      document.getElementById('fbCloseModalDiscard').addEventListener('click', () => {
        hideCloseModal();
        closeEditor();
      });
      document.getElementById('fbCloseModalCancel').addEventListener('click', () => {
        hideCloseModal();
      });
    }
    modal.style.display = 'flex';
  }

  function hideCloseModal() {
    const modal = document.getElementById('fbCloseModal');
    if (modal) modal.style.display = 'none';
  }

  function closeEditor() {
    editor.open = false;
    editor.undoStack = []; editor.redoStack = []; editor.dirty = false;
    document.getElementById('fbPreview').classList.remove('open');
    document.getElementById('fbCanvasWrap').style.transform = '';
    document.getElementById('fbBrushCursor').style.display = 'none';
  }

  function loadEditorImage() {
    const img = document.getElementById('fbPreviewImg');
    const canvas = document.getElementById('fbDrawCanvas');
    const { images, savedDrawings, index } = editor;

    editor.undoStack = []; editor.redoStack = []; editor.dirty = false;
    editor.zoom = 1; editor.panX = 0; editor.panY = 0;
    applyZoomPan();

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = img.offsetWidth + 'px';
      canvas.style.height = img.offsetHeight + 'px';
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Load saved drawing layer if exists
      const drawingData = savedDrawings[index];
      if (drawingData) {
        const drawImg = new Image();
        drawImg.onload = () => { ctx.drawImage(drawImg, 0, 0, canvas.width, canvas.height); };
        drawImg.src = drawingData;
      }
      updateCanvasCursor();
    };
    img.src = images[index]; // Always show original

    // Nav
    const len = images.length;
    document.getElementById('fbPreviewCounter').textContent = len > 1 ? `${index + 1} / ${len}` : '';
    document.getElementById('fbPreviewCounter').style.display = len > 1 ? 'block' : 'none';
    document.getElementById('fbPrevImg').style.display = len > 1 ? 'flex' : 'none';
    document.getElementById('fbNextImg').style.display = len > 1 ? 'flex' : 'none';
    document.getElementById('fbPrevImg').disabled = index === 0;
    document.getElementById('fbNextImg').disabled = index === len - 1;
  }

  function navEditor(dir) {
    const newIdx = editor.index + dir;
    if (newIdx < 0 || newIdx >= editor.images.length) return;
    // Auto-save current drawing layer before navigating
    saveCurrentDrawingLayer();
    editor.index = newIdx;
    loadEditorImage();
  }

  function saveCurrentDrawingLayer() {
    const canvas = document.getElementById('fbDrawCanvas');
    const ctx = canvas.getContext('2d');
    // Check if canvas has any content
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = data.data.some((v, i) => i % 4 === 3 && v > 0); // any non-transparent pixel
    editor.savedDrawings[editor.index] = hasContent ? canvas.toDataURL('image/png') : null;
    editor.dirty = false;
  }

  // ── Editor Actions ──
  function editorUndo() {
    if (editor.undoStack.length === 0) return;
    const canvas = document.getElementById('fbDrawCanvas');
    const ctx = canvas.getContext('2d');
    editor.redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(editor.undoStack.pop(), 0, 0);
    editor.dirty = true;
    updateUndoRedoButtons();
  }

  function editorRedo() {
    if (editor.redoStack.length === 0) return;
    const canvas = document.getElementById('fbDrawCanvas');
    const ctx = canvas.getContext('2d');
    editor.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(editor.redoStack.pop(), 0, 0);
    editor.dirty = true;
    updateUndoRedoButtons();
  }

  function editorReset() {
    const canvas = document.getElementById('fbDrawCanvas');
    const ctx = canvas.getContext('2d');
    // Check if canvas has any content
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = data.data.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasContent) return; // Nothing to reset
    if (!confirm('Reset to original? All drawings on this image will be cleared.')) return;
    // Push current state so reset is undoable
    editor.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    editor.redoStack = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Don't modify savedDrawings — that only happens on Save
    editor.dirty = true;
    updateUndoRedoButtons();
  }

  function editorSave() {
    // 1. Save drawing layer
    saveCurrentDrawingLayer();

    // 2. Generate merged image RIGHT NOW from what's on screen
    const previewImg = document.getElementById('fbPreviewImg');
    const drawCanvas = document.getElementById('fbDrawCanvas');
    const mc = document.createElement('canvas');
    mc.width = drawCanvas.width;
    mc.height = drawCanvas.height;
    const mctx = mc.getContext('2d');
    mctx.drawImage(previewImg, 0, 0, mc.width, mc.height);
    mctx.drawImage(drawCanvas, 0, 0);
    const mergedNow = mc.toDataURL('image/jpeg', 0.8);

    // 3. Persist
    if (editor.source === 'pending') {
      pendingScreenshots = editor.images.map((orig, i) => ({
        original: orig,
        drawing: editor.savedDrawings[i],
        // Pre-merged for display: current image from screen, others keep existing
        merged: i === editor.index ? (editor.savedDrawings[i] ? mergedNow : null) : (pendingScreenshots[i]?.merged || null)
      }));
      renderPendingPreviews(); updateSubmitState();
    } else if (editor.memoId) {
      // In-place update memo
      const memos = loadMemos();
      const idx = memos.findIndex(m => m.id === editor.memoId);
      if (idx !== -1) {
        const memo = memos[idx];
        memo.originals = [...editor.images];
        memo.drawings = [...editor.savedDrawings];
        memo.screenshots = editor.images.map((orig, i) =>
          i === editor.index ? mergedNow : (memo.screenshots?.[i] || orig)
        );
        memos[idx] = memo;
        saveMemos(memos);
        renderMemos();
      }
    }

    editor.dirty = false;
    updateUndoRedoButtons();

    const btn = document.getElementById('fbDrawSave');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save'; }, 800);
  }

  // Cancel = revert to last saved state
  function editorCancel() {
    if (!editor.dirty) return;
    loadEditorImage();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('fbDrawUndo');
    const redoBtn = document.getElementById('fbDrawRedo');
    undoBtn.disabled = editor.undoStack.length === 0;
    undoBtn.style.opacity = editor.undoStack.length === 0 ? '0.3' : '1';
    redoBtn.disabled = editor.redoStack.length === 0;
    redoBtn.style.opacity = editor.redoStack.length === 0 ? '0.3' : '1';
  }

  function mergeForExport(originalSrc, drawingSrc) {
    // Synchronous: only works for data URLs (which load sync in most browsers)
    if (!drawingSrc) return originalSrc;
    const c = document.createElement('canvas');
    const img1 = new Image(); img1.src = originalSrc;
    const img2 = new Image(); img2.src = drawingSrc;
    // Data URLs load synchronously, but we need to ensure dimensions
    c.width = img1.naturalWidth || img1.width || 1200;
    c.height = img1.naturalHeight || img1.height || 800;
    const ctx = c.getContext('2d');
    ctx.drawImage(img1, 0, 0, c.width, c.height);
    ctx.drawImage(img2, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  // Async version for reliable merging
  function mergeAsync(originalSrc, drawingSrc) {
    return new Promise(resolve => {
      if (!drawingSrc) { resolve(originalSrc); return; }
      const img1 = new Image();
      img1.onload = () => {
        const c = document.createElement('canvas');
        c.width = img1.naturalWidth; c.height = img1.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img1, 0, 0);
        const img2 = new Image();
        img2.onload = () => {
          ctx.drawImage(img2, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img2.onerror = () => resolve(originalSrc);
        img2.src = drawingSrc;
      };
      img1.onerror = () => resolve(originalSrc);
      img1.src = originalSrc;
    });
  }

  // ── File Handling ──
  function handleFiles(files) {
    for (const f of files) if (f.type.startsWith('image/')) readFileAsDataURL(f);
  }

  function readFileAsDataURL(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const maxW = 1200; const s = img.width > maxW ? maxW / img.width : 1;
        c.width = img.width * s; c.height = img.height * s;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        pendingScreenshots.push({ original: c.toDataURL('image/jpeg', 0.7), drawing: null });
        renderPendingPreviews(); updateSubmitState();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderPendingPreviews() {
    const container = document.getElementById('fbPendingPreviews');
    if (pendingScreenshots.length === 0) { container.innerHTML = ''; container.style.display = 'none'; return; }
    container.style.display = 'flex';
    container.innerHTML = pendingScreenshots.map((p, i) => `
      <div style="position:relative;width:72px;height:72px;border-radius:6px;overflow:hidden;border:2px solid #6C5CE7;flex-shrink:0;">
        <img src="${p.merged || p.original}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window._fbEditPending(${i})">
        <button onclick="event.stopPropagation();window._fbRemovePending(${i})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:10px;line-height:1;">&times;</button>
        ${p.merged ? '<div style="position:absolute;bottom:2px;left:2px;background:#6C5CE7;color:white;font-size:8px;padding:1px 4px;border-radius:3px;">edited</div>' : ''}
      </div>
    `).join('');
  }

  window._fbRemovePending = i => { pendingScreenshots.splice(i, 1); renderPendingPreviews(); updateSubmitState(); };
  window._fbEditPending = i => {
    const originals = pendingScreenshots.map(p => p.original);
    const drawings = pendingScreenshots.map(p => p.drawing);
    openEditor(originals, drawings, i, null, 'pending');
  };

  // ── Render Memos ──
  function renderMemos() {
    const content = document.getElementById('fbContent');
    const memos = loadMemos();
    const page = getPageName();
    const filtered = currentTab === 'current' ? memos.filter(m => m.page === page) : memos;

    if (filtered.length === 0) { content.innerHTML = '<div class="fb-empty">No feedback yet.</div>'; return; }

    content.innerHTML = [...filtered].sort((a, b) => a.id - b.id).map(m => {
      // Use screenshots (pre-merged) if available, fall back to originals
      const displayImgs = m.screenshots?.length > 0 ? m.screenshots
        : m.originals?.length > 0 ? m.originals
        : m.screenshot ? [m.screenshot] : [];
      const imgCount = displayImgs.length;
      return `
        <div class="fb-memo" data-id="${m.id}">
          <div class="fb-memo-header">
            <span class="fb-memo-page">${m.page}</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="fb-memo-time">${formatTime(m.time)}</span>
              <button class="fb-memo-delete" onclick="window._fbDelete(${m.id})">&times;</button>
            </div>
          </div>
          ${m.text ? `<div class="fb-memo-text">${escapeHtml(m.text)}</div>` : ''}
          ${imgCount > 0 ? `
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
              ${displayImgs.map((src, i) => `
                <div class="fb-memo-screenshot fb-img-hover-wrap" onclick="window._fbEditMemo(${m.id},${i})" style="width:${imgCount===1?'100%':'calc(50% - 2px)'};cursor:pointer;position:relative;">
                  <img src="${src}" style="width:100%;display:block;border-radius:4px;">
                  <button class="fb-copy-pending-btn" onclick="event.stopPropagation();window._fbCopyToPending(${m.id},${i})" title="Add to pending">+</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  window._fbDelete = id => { deleteMemo(id); renderMemos(); updateBadge(); };
  window._fbEditMemo = (id, index) => {
    const memo = loadMemos().find(m => m.id === id);
    if (!memo) return;
    const originals = memo.originals?.length > 0 ? memo.originals : memo.screenshots || [];
    const drawings = memo.drawings || originals.map(() => null);
    openEditor(originals, drawings, index, id, 'memo');
  };
  window._fbCopyToPending = (id, index) => {
    const memo = loadMemos().find(m => m.id === id);
    if (!memo) return;
    const src = memo.screenshots?.[index] || memo.originals?.[index];
    if (!src) return;
    pendingScreenshots.push({ original: src, drawing: null, merged: null });
    renderPendingPreviews(); updateSubmitState();
  };

  function updateBadge() {
    const c = loadMemos().length;
    const b = document.getElementById('fbBadge');
    b.textContent = c; b.style.display = c > 0 ? 'flex' : 'none';
  }

  // ── PDF Export ──
  async function exportPdf() {
    if (!window.jspdf) { alert('Loading PDF library...'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const memos = loadMemos();
    if (memos.length === 0) { alert('No feedback.'); return; }

    const pw = 210, m = 15, cw = pw - m * 2;
    let y = m;
    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('Mockup Feedback Report', m, y); y += 8;
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
    doc.text(`Mockup: ${mockupKey.replace(STORAGE_PREFIX, '')}`, m, y); y += 5;
    doc.text(`Exported: ${new Date().toLocaleString()}`, m, y); y += 5;
    doc.text(`Total: ${memos.length}`, m, y); y += 10;
    doc.setDrawColor(200); doc.line(m, y, pw - m, y); y += 8;

    const grouped = {};
    memos.forEach(memo => { (grouped[memo.page] ??= []).push(memo); });

    for (const [page, list] of Object.entries(grouped)) {
      if (y > 260) { doc.addPage(); y = m; }
      doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(108, 92, 231);
      doc.text(`Page: ${page}`, m, y); y += 7;

      for (const memo of list) {
        if (y > 250) { doc.addPage(); y = m; }
        doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(150);
        doc.text(formatTime(memo.time), m, y); y += 5;
        if (memo.text) {
          doc.setFontSize(11); doc.setTextColor(30);
          const lines = doc.splitTextToSize(memo.text, cw);
          doc.text(lines, m, y); y += lines.length * 5 + 2;
        }
        // Use merged screenshots (original + drawing)
        const imgs = memo.screenshots || [];
        for (const src of imgs) {
          try {
            const h = 50;
            if (y + h > 280) { doc.addPage(); y = m; }
            doc.addImage(src, 'JPEG', m, y, cw, h); y += h + 4;
          } catch {}
        }
        doc.setDrawColor(230); doc.line(m, y, pw - m, y); y += 6;
      }
      y += 4;
    }
    doc.save(mockupKey.replace(STORAGE_PREFIX, '') + '-feedback.pdf');
  }

  // ── Helpers ──
  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
