/**
 * Mockup Version History
 * - Reads archive/manifest.json
 * - Adds "History" dropdown to guide bar
 * - Links to archived versions
 *
 * Usage: add to any mockup page (after guide bar):
 *   <script src="../shared/history.js"></script>
 */

(function () {
  'use strict';

  // Detect if we're in an archive subfolder
  const pathParts = location.pathname.split('/').filter(Boolean);
  let isArchive = false;
  let archiveHash = null;
  let baseUrl = '';
  let manifestUrl = '';

  // Check if path contains /archive/{hash}/
  const archiveIdx = pathParts.indexOf('archive');
  if (archiveIdx !== -1 && archiveIdx + 1 < pathParts.length) {
    isArchive = true;
    archiveHash = pathParts[archiveIdx + 1];
    // baseUrl = path up to the mockup folder (before archive/)
    baseUrl = '/' + pathParts.slice(0, archiveIdx).join('/') + '/';
    manifestUrl = baseUrl + 'archive/manifest.json';
  } else {
    // We're in the current version
    // Find the mockup folder
    for (let i = 0; i < pathParts.length; i++) {
      if (/^\d{4}-\d{2}-\d{2}/.test(pathParts[i])) {
        baseUrl = '/' + pathParts.slice(0, i + 1).join('/') + '/';
        break;
      }
    }
    manifestUrl = baseUrl + 'archive/manifest.json';
  }

  async function init() {
    try {
      const resp = await fetch(manifestUrl);
      if (!resp.ok) return; // No archive yet, silently skip
      const manifest = await resp.json();
      if (!manifest || manifest.length === 0) return;

      injectHistoryUI(manifest);
    } catch (e) {
      // No manifest or error, skip
    }
  }

  function injectHistoryUI(manifest) {
    // Find the guide bar (first fixed div at top)
    const guideBar = document.querySelector('[style*="position: fixed"][style*="top: 0"]');
    if (!guideBar) return;

    const currentPage = location.pathname.split('/').pop() || 'index.html';

    // Create history dropdown
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; display: inline-flex; align-items: center; margin-left: 8px;';

    // Archive badge if viewing archived version
    if (isArchive) {
      const archiveBadge = document.createElement('span');
      archiveBadge.style.cssText = 'padding: 4px 8px; border-radius: 6px; background: rgba(239,68,68,0.2); color: #EF4444; font-size: 11px; font-weight: 600; margin-right: 6px;';
      archiveBadge.textContent = 'Archive: ' + archiveHash;
      wrapper.appendChild(archiveBadge);

      // "Back to latest" link
      const backLink = document.createElement('a');
      backLink.href = baseUrl + currentPage;
      backLink.style.cssText = 'font-size: 11px; color: #00B894; text-decoration: none; font-weight: 600; margin-right: 8px;';
      backLink.textContent = '← Latest';
      wrapper.appendChild(backLink);
    }

    // History button
    const btn = document.createElement('button');
    btn.style.cssText = 'padding: 4px 10px; border-radius: 6px; border: 1px solid #444; background: #2a2a4a; color: #ccc; cursor: pointer; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;';
    btn.innerHTML = `History <span style="font-size: 9px;">▾</span> <span style="background: rgba(108,92,231,0.3); color: #9F93F0; padding: 1px 5px; border-radius: 10px; font-size: 10px;">${manifest.length}</span>`;

    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; background: #1E1E2E; border: 1px solid #333; border-radius: 8px; min-width: 280px; max-height: 300px; overflow-y: auto; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.4);';

    // Header
    dropdown.innerHTML = `
      <div style="padding: 8px 12px; border-bottom: 1px solid #333; font-size: 11px; color: #666; font-weight: 600;">VERSION HISTORY</div>
    `;

    // Current version link
    if (isArchive) {
      const currentItem = document.createElement('a');
      currentItem.href = baseUrl + currentPage;
      currentItem.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 12px; text-decoration: none; border-bottom: 1px solid #2a2a3a; transition: background 0.15s;';
      currentItem.innerHTML = `
        <span style="font-size: 12px; font-weight: 700; color: #00B894;">Latest</span>
        <span style="font-size: 11px; color: #666; flex: 1;">Current version</span>
        <span style="font-size: 10px; color: #00B894;">●</span>
      `;
      currentItem.onmouseenter = () => currentItem.style.background = '#2a2a3a';
      currentItem.onmouseleave = () => currentItem.style.background = 'none';
      dropdown.appendChild(currentItem);
    }

    // Archive entries (newest first)
    const sorted = [...manifest].reverse();
    sorted.forEach(entry => {
      const isCurrent = isArchive && archiveHash === entry.hash;
      const item = document.createElement('a');
      item.href = baseUrl + 'archive/' + entry.hash + '/' + currentPage;
      item.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 8px 12px; text-decoration: none; border-bottom: 1px solid #2a2a3a; transition: background 0.15s; ${isCurrent ? 'background: rgba(108,92,231,0.1);' : ''}`;
      item.innerHTML = `
        <code style="font-size: 11px; color: #6C5CE7; background: rgba(108,92,231,0.15); padding: 2px 6px; border-radius: 4px; font-weight: 600;">${entry.hash}</code>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 12px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${entry.message}</div>
          <div style="font-size: 10px; color: #666;">${entry.date}</div>
        </div>
        ${isCurrent ? '<span style="font-size: 10px; color: #6C5CE7;">●</span>' : ''}
      `;
      item.onmouseenter = () => { if (!isCurrent) item.style.background = '#2a2a3a'; };
      item.onmouseleave = () => { if (!isCurrent) item.style.background = 'none'; };
      dropdown.appendChild(item);
    });

    // Toggle
    let open = false;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      open = !open;
      dropdown.style.display = open ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      open = false;
      dropdown.style.display = 'none';
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);

    // Add separator before history
    const sep = document.createElement('span');
    sep.style.cssText = 'color: #444; margin: 0 4px;';
    sep.textContent = '|';
    guideBar.appendChild(sep);
    guideBar.appendChild(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
