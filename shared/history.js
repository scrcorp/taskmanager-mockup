/**
 * Mockup Version History
 * - Reads archive/manifest.json
 * - Adds "History" dropdown to guide bar
 * - Current version always shown at top
 * - Links to archived versions
 */

(function () {
  'use strict';

  const pathParts = location.pathname.split('/').filter(Boolean);
  let isArchive = false;
  let archiveHash = null;
  let baseUrl = '';
  let manifestUrl = '';

  const archiveIdx = pathParts.indexOf('archive');
  if (archiveIdx !== -1 && archiveIdx + 1 < pathParts.length) {
    isArchive = true;
    archiveHash = pathParts[archiveIdx + 1];
    baseUrl = '/' + pathParts.slice(0, archiveIdx).join('/') + '/';
    manifestUrl = baseUrl + 'archive/manifest.json';
  } else {
    for (let i = 0; i < pathParts.length; i++) {
      if (/^\d{4}-\d{2}-\d{2}/.test(pathParts[i])) {
        baseUrl = '/' + pathParts.slice(0, i + 1).join('/') + '/';
        break;
      }
    }
    manifestUrl = baseUrl + 'archive/manifest.json';
  }

  async function init() {
    // If viewing an archive, always show "Back to Latest" banner (no manifest needed)
    if (isArchive) {
      injectArchiveBanner();
    }

    try {
      const resp = await fetch(manifestUrl);
      if (!resp.ok) return;
      const manifest = await resp.json();
      if (!manifest || manifest.length === 0) return;

      let currentVersion = null;
      try {
        const curResp = await fetch(baseUrl + 'archive/current.json');
        if (curResp.ok) currentVersion = await curResp.json();
      } catch {}

      injectHistoryUI(manifest, currentVersion);
    } catch (e) {}
  }

  function injectArchiveBanner() {
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#EF4444;color:white;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px;font-size:13px;font-weight:600;font-family:system-ui,sans-serif;';
    banner.innerHTML = `
      <span>Viewing archived version: <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;">${archiveHash}</code></span>
      <a href="${baseUrl}${currentPage}" style="color:white;background:rgba(0,0,0,0.2);padding:4px 12px;border-radius:6px;text-decoration:none;font-weight:700;">← Back to Latest</a>
    `;
    document.body.prepend(banner);
    // Push body content down
    document.body.style.paddingTop = (parseInt(document.body.style.paddingTop || '0') + 36) + 'px';
  }

  function injectHistoryUI(manifest, currentVersion) {
    const guideBar = document.querySelector('[style*="position: fixed"][style*="top: 0"]') ||
                     document.querySelector('[style*="position:fixed"][style*="top:0"]');
    if (!guideBar) return;

    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const sorted = [...manifest].reverse(); // newest first
    const totalVersions = sorted.length + 1; // archives + current

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;margin-left:8px;';

    // Archive badge when viewing old version
    if (isArchive) {
      const badge = document.createElement('span');
      badge.style.cssText = 'padding:4px 8px;border-radius:6px;background:rgba(239,68,68,0.2);color:#EF4444;font-size:11px;font-weight:600;margin-right:6px;';
      badge.textContent = 'Viewing: ' + archiveHash;
      wrapper.appendChild(badge);

      const backLink = document.createElement('a');
      backLink.href = baseUrl + currentPage;
      backLink.style.cssText = 'font-size:11px;color:#00B894;text-decoration:none;font-weight:600;margin-right:8px;';
      backLink.textContent = '← Back to Latest';
      wrapper.appendChild(backLink);
    }

    // History button
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid #444;background:#2a2a4a;color:#ccc;cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px;';
    btn.innerHTML = `History <span style="font-size:9px;">&#9660;</span> <span style="background:rgba(108,92,231,0.3);color:#9F93F0;padding:1px 5px;border-radius:10px;font-size:10px;">${totalVersions}</span>`;

    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'display:none;position:absolute;top:100%;right:0;margin-top:4px;background:#1E1E2E;border:1px solid #333;border-radius:8px;min-width:300px;max-height:320px;overflow-y:auto;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.4);';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 12px;border-bottom:1px solid #333;font-size:11px;color:#666;font-weight:600;';
    header.textContent = 'VERSION HISTORY';
    dropdown.appendChild(header);

    // ── Current version (always first) ──
    const currentItem = document.createElement('a');
    currentItem.href = isArchive ? baseUrl + currentPage : '#';
    if (!isArchive) currentItem.onclick = e => e.preventDefault();
    const isViewingCurrent = !isArchive;
    currentItem.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px 12px;text-decoration:none;border-bottom:1px solid #2a2a3a;transition:background 0.15s;${isViewingCurrent ? 'background:rgba(0,184,148,0.08);' : ''}`;
    const curDate = currentVersion?.date || '';
    currentItem.innerHTML = `
      <span style="font-size:11px;color:#00B894;background:rgba(0,184,148,0.15);padding:2px 8px;border-radius:4px;font-weight:700;">LATEST</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;color:#eee;font-weight:600;">Current version</div>
        <div style="font-size:10px;color:#666;">${curDate ? 'Updated ' + curDate : 'Live'}</div>
      </div>
      ${isViewingCurrent ? '<span style="font-size:10px;color:#00B894;">● viewing</span>' : ''}
    `;
    if (!isViewingCurrent) {
      currentItem.onmouseenter = () => currentItem.style.background = '#2a2a3a';
      currentItem.onmouseleave = () => currentItem.style.background = 'none';
    }
    dropdown.appendChild(currentItem);

    // ── Archived versions (newest first) ──
    sorted.forEach(entry => {
      const isViewing = isArchive && archiveHash === entry.hash;
      const item = document.createElement('a');
      item.href = baseUrl + 'archive/' + entry.hash + '/' + currentPage;
      item.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px 12px;text-decoration:none;border-bottom:1px solid #2a2a3a;transition:background 0.15s;${isViewing ? 'background:rgba(108,92,231,0.1);' : ''}`;
      item.innerHTML = `
        <code style="font-size:11px;color:#6C5CE7;background:rgba(108,92,231,0.15);padding:2px 6px;border-radius:4px;font-weight:600;">${entry.hash}</code>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.message}</div>
          <div style="font-size:10px;color:#666;">${entry.date}</div>
        </div>
        ${isViewing ? '<span style="font-size:10px;color:#6C5CE7;">● viewing</span>' : ''}
      `;
      if (!isViewing) {
        item.onmouseenter = () => item.style.background = '#2a2a3a';
        item.onmouseleave = () => item.style.background = 'none';
      }
      dropdown.appendChild(item);
    });

    // Toggle
    let open = false;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      open = !open;
      dropdown.style.display = open ? 'block' : 'none';
    });
    document.addEventListener('click', () => { open = false; dropdown.style.display = 'none'; });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);

    const sep = document.createElement('span');
    sep.style.cssText = 'color:#444;margin:0 4px;';
    sep.textContent = '|';
    guideBar.appendChild(sep);
    guideBar.appendChild(wrapper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
