import {
  loadData, saveUIState,
  addCollection, removeCollection, renameCollection,
  updateCollectionColor, updateCollectionIcon,
  toggleCollectionCollapsed,
  addTabToCollection, removeTabFromCollection, renameTab,
  reorderTab, moveTab, reorderCollections,
  getOrderedCollections,
  validateImportData, importData, exportData,
  linkFolder, unlinkFolder,
  DEFAULT_COLORS, DEFAULT_ICONS
} from './storage.js';

import {
  renderOpenTabs, renderCollections, renderAddDropdown, closeDropdown,
  renderContextMenu, renderColorPicker, renderIconPicker, renderModal,
  renderFolderPicker, flashElement
} from './render.js';

import { initDragDrop } from './dragdrop.js';

import { t, loadLang, saveLang, getLang, getAvailableLangs } from './i18n.js';

import { getBookmarkTree, getRootFolderId } from './bookmarks.js';

let data = { collections: [], collectionOrder: [] };
let openTabs = [];
let searchQuery = '';

// === Background Customization ===

async function initBackground() {
  const { bgColor, bgImage } = await chrome.storage.local.get(['bgColor', 'bgImage']);
  applyBackground(bgColor, bgImage);
}

function applyBackground(bgColor, bgImage) {
  if (bgImage) {
    document.body.style.backgroundImage = `url("${bgImage}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundColor = '';
    document.body.classList.add('has-bg-image');
  } else if (bgColor) {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundColor = bgColor;
    document.body.classList.remove('has-bg-image');
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundColor = '';
    document.body.classList.remove('has-bg-image');
  }
}

function setupBackgroundSettings() {
  const btn = document.getElementById('btn-bg-settings');
  const panel = document.getElementById('bg-settings-panel');
  const closeBtn = document.getElementById('bg-settings-close');
  const colorInput = document.getElementById('bg-color-input');
  const resetBtn = document.getElementById('bg-reset-btn');
  const urlInput = document.getElementById('bg-image-url-input');
  const urlApplyBtn = document.getElementById('bg-image-url-apply');
  const removeImageBtn = document.getElementById('bg-remove-image-btn');
  const imageCurrent = document.getElementById('bg-image-current');
  const imageThumb = document.getElementById('bg-image-thumb');
  const imageName = document.getElementById('bg-image-name');

  function showCurrentImage(url) {
    if (!url) { hideCurrentImage(); return; }
    imageThumb.src = url;
    imageThumb.onerror = () => hideCurrentImage();
    try {
      imageName.textContent = new URL(url).pathname.split('/').pop() || url;
    } catch {
      imageName.textContent = url;
    }
    imageCurrent.hidden = false;
  }

  function hideCurrentImage() {
    imageCurrent.hidden = true;
    imageThumb.src = '';
    imageName.textContent = '';
    urlInput.value = '';
  }

  btn.addEventListener('click', async () => {
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    if (isHidden) {
      const { bgColor, bgImage } = await chrome.storage.local.get(['bgColor', 'bgImage']);
      colorInput.value = bgColor || '#f5f5f9';
      if (bgImage) {
        urlInput.value = bgImage;
        showCurrentImage(bgImage);
      } else {
        hideCurrentImage();
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
  });

  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });

  colorInput.addEventListener('input', async () => {
    const color = colorInput.value;
    await chrome.storage.local.set({ bgColor: color });
    await chrome.storage.local.remove('bgImage');
    applyBackground(color, null);
    hideCurrentImage();
  });

  resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['bgColor', 'bgImage']);
    applyBackground(null, null);
    colorInput.value = '#f5f5f9';
    hideCurrentImage();
  });

  async function applyImageUrl() {
    const url = urlInput.value.trim();
    if (!url) return;
    await chrome.storage.local.set({ bgImage: url });
    await chrome.storage.local.remove('bgColor');
    applyBackground(null, url);
    showCurrentImage(url);
  }

  urlApplyBtn.addEventListener('click', applyImageUrl);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyImageUrl();
  });

  removeImageBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('bgImage');
    applyBackground(null, null);
    hideCurrentImage();
  });
}

// === Theme ===

async function initTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  if (newTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  chrome.storage.local.set({ theme: newTheme });
}

// === i18n ===

function applyStaticI18n() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = t('searchPlaceholder');
  const btnImport = document.getElementById('btn-import');
  if (btnImport) btnImport.title = t('import');
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.title = t('export');
  const openTabsLabel = document.querySelector('#open-tabs-section .section-label') || document.querySelector('.sidebar-label');
  if (openTabsLabel) openTabsLabel.textContent = t('openTabsLabel');
  const addBtn = document.getElementById('btn-add-collection');
  if (addBtn) addBtn.textContent = t('addCollection');
  const linkBtn = document.getElementById('btn-link-folder');
  if (linkBtn) linkBtn.textContent = t('linkFolder');
  const bgSettingsBtn = document.getElementById('btn-bg-settings');
  if (bgSettingsBtn) bgSettingsBtn.title = t('bgSettings');
  const bgTitle = document.getElementById('bg-settings-title');
  if (bgTitle) bgTitle.textContent = t('bgSettings');
  const bgColorLabel = document.getElementById('bg-color-label');
  if (bgColorLabel) bgColorLabel.textContent = t('bgColor');
  const bgImageLabel = document.getElementById('bg-image-label');
  if (bgImageLabel) bgImageLabel.textContent = t('bgImage');
  const bgUrlInput = document.getElementById('bg-image-url-input');
  if (bgUrlInput) bgUrlInput.placeholder = t('bgImageUrl');
  const bgUrlApply = document.getElementById('bg-image-url-apply');
  if (bgUrlApply) bgUrlApply.textContent = t('bgApply');
  const bgResetBtn = document.getElementById('bg-reset-btn');
  if (bgResetBtn) bgResetBtn.textContent = t('bgReset');
  const bgRemoveBtn = document.getElementById('bg-remove-image-btn');
  if (bgRemoveBtn) bgRemoveBtn.title = t('bgRemoveImage');
}

function setupLangSelector() {
  const select = document.getElementById('lang-select');
  if (!select) return;
  select.innerHTML = '';
  for (const { code, label } of getAvailableLangs()) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    select.appendChild(opt);
  }
  select.value = getLang();
  select.addEventListener('change', async () => {
    await saveLang(select.value);
    applyStaticI18n();
    renderAll();
  });
}

// === Initialization ===

async function init() {
  await initTheme();
  await initBackground();
  await loadLang();
  data = await loadData();
  await refreshOpenTabs();
  renderAll();
  applyStaticI18n();
  setupLangSelector();
  setupEventListeners();
  initDragDrop({
    onReorderCollection: handleReorderCollection,
    onReorderTab: handleReorderTab,
    onMoveTab: handleMoveTab,
    onDropOpenTab: handleDropOpenTab
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'tabs-updated') refreshOpenTabs().then(renderOpenTabsUI);
  });
}

// === Open Tabs ===

async function refreshOpenTabs() {
  try {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    openTabs = allTabs.filter(tab => tab.url !== 'chrome://newtab/' && !tab.url.startsWith('chrome-extension://'));
  } catch {
    openTabs = [];
  }
}

function renderOpenTabsUI() {
  const filtered = filterOpenTabs(openTabs);
  document.getElementById('open-tabs-count').textContent = openTabs.length;
  renderOpenTabs(
    document.getElementById('open-tabs-list'),
    filtered,
    handleAddClick,
    handleFocusTab,
    handleCloseTab
  );
}

function handleCloseTab(tabId) {
  chrome.tabs.remove(tabId);
}

function handleFocusTab(tabId) {
  chrome.tabs.update(tabId, { active: true });
}

// === Collections Rendering ===

function renderCollectionsUI() {
  const ordered = getOrderedCollections(data);
  const filtered = filterCollections(ordered);
  renderCollections(
    document.getElementById('collections-list'),
    filtered,
    {
      onOpenAll: handleOpenAll,
      onMenuClick: handleMenuClick,
      onToggleCollapse: handleToggleCollapse,
      onRemoveTab: handleRemoveTab,
      onRenameClick: handleRenameClick,
      onRenameTab: handleRenameTab
    }
  );
}

function renderAll() {
  renderOpenTabsUI();
  renderCollectionsUI();
}

// === Collection CRUD ===

async function handleAddCollection() {
  const col = await addCollection(data, t('newCollection'), undefined, '📁');
  renderCollectionsUI();

  setTimeout(() => {
    const card = document.querySelector(`.collection-card[data-collection-id="${col.id}"]`);
    if (card) startInlineRename(card, col.id);
  }, 50);
}

function startInlineRename(card, collectionId) {
  const nameEl = card.querySelector('.collection-name');
  const currentName = nameEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = currentName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  // Prevent click from bubbling to header (which toggles collapse and re-renders)
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());

  const commit = async () => {
    const newName = input.value.trim() || currentName;
    await renameCollection(data, collectionId, newName);
    renderCollectionsUI();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

function handleRenameClick(collectionId) {
  const card = document.querySelector(`.collection-card[data-collection-id="${collectionId}"]`);
  if (card) startInlineRename(card, collectionId);
}

function handleRenameTab(collectionId, tabId, titleEl) {
  const currentName = titleEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = currentName;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());

  const commit = async () => {
    const newName = input.value.trim() || currentName;
    if (newName !== currentName) {
      await renameTab(data, collectionId, tabId, newName);
    }
    renderCollectionsUI();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

async function handleRemoveTab(collectionId, tabId) {
  await removeTabFromCollection(data, collectionId, tabId);
  renderCollectionsUI();
}

async function handleToggleCollapse(collectionId) {
  await toggleCollectionCollapsed(data, collectionId);
  renderCollectionsUI();
}

// === Add Tab to Collection ===

function handleAddClick(e, tab) {
  const ordered = getOrderedCollections(data);
  if (ordered.length === 0) {
    renderModal(t('noCollectionTitle'), t('noCollectionMsg'), [
      { label: t('confirm'), style: 'primary' }
    ]);
    return;
  }

  renderAddDropdown(e.currentTarget, ordered, async (collectionId) => {
    const result = await addTabToCollection(data, collectionId, tab.title, tab.url, tab.favIconUrl);
    if (result.duplicate) {
      showDuplicateToast(collectionId);
      return;
    }
    renderCollectionsUI();

    const card = document.querySelector(`.collection-card[data-collection-id="${collectionId}"]`);
    if (card) flashElement(card);
  });
}

// === Open All Tabs ===

function handleOpenAll(collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.tabs.length === 0) return;
  for (const tab of col.tabs) {
    chrome.tabs.create({ url: tab.url, active: false });
  }
}

// === Link Folder ===

async function handleLinkFolder() {
  const tree = await getBookmarkTree();
  const rootId = await getRootFolderId();
  const linkedIds = data.collections.filter(c => c.linked).map(c => c.id);

  renderFolderPicker(tree, rootId, linkedIds, async (folderId) => {
    await linkFolder(data, folderId);
    renderCollectionsUI();
  });
}

// === Context Menu ===

function handleMenuClick(e, col) {
  const items = [];

  if (!col.linked) {
    items.push({
      label: t('rename'),
      action: () => {
        const card = document.querySelector(`.collection-card[data-collection-id="${col.id}"]`);
        if (card) startInlineRename(card, col.id);
      }
    });
  }

  items.push(
    { label: t('changeColor'), action: () => showColorPicker(col) },
    { label: t('changeIcon'), action: () => showIconPicker(col) }
  );

  if (col.linked) {
    items.push({
      label: t('unlinkMenu'),
      danger: true,
      action: () => {
        renderModal(
          t('unlinkTitle'),
          t('unlinkMsg', col.name),
          [
            { label: t('cancel'), style: 'secondary' },
            {
              label: t('unlink'),
              style: 'danger',
              action: async () => {
                await unlinkFolder(data, col.id);
                renderCollectionsUI();
              }
            }
          ]
        );
      }
    });
  } else {
    items.push({
      label: t('deleteMenu'),
      danger: true,
      action: () => {
        renderModal(
          t('deleteTitle'),
          t('deleteMsg', col.name),
          [
            { label: t('cancel'), style: 'secondary' },
            {
              label: t('delete'),
              style: 'danger',
              action: async () => {
                await removeCollection(data, col.id);
                renderCollectionsUI();
              }
            }
          ]
        );
      }
    });
  }

  renderContextMenu(e.currentTarget, items);
}

function showColorPicker(col) {
  const card = document.querySelector(`.collection-card[data-collection-id="${col.id}"]`);
  if (!card) return;
  const body = card.querySelector('.collection-body');
  body.classList.remove('collapsed');
  renderColorPicker(body, col.color, DEFAULT_COLORS, async (color) => {
    await updateCollectionColor(data, col.id, color);
    renderCollectionsUI();
  });
}

function showIconPicker(col) {
  const card = document.querySelector(`.collection-card[data-collection-id="${col.id}"]`);
  if (!card) return;
  const body = card.querySelector('.collection-body');
  body.classList.remove('collapsed');
  renderIconPicker(body, col.icon, DEFAULT_ICONS, async (icon) => {
    await updateCollectionIcon(data, col.id, icon);
    renderCollectionsUI();
  });
}

// === Drag & Drop Handlers ===

async function handleReorderCollection(fromIndex, toIndex) {
  await reorderCollections(data, fromIndex, toIndex);
  renderCollectionsUI();
}

async function handleReorderTab(collectionId, tabId, toIndex) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return;
  const fromIndex = col.tabs.findIndex(t => t.id === tabId);
  if (fromIndex === -1) return;
  if (toIndex === -1) toIndex = col.tabs.length - 1;
  if (toIndex > fromIndex) toIndex--;
  await reorderTab(data, collectionId, fromIndex, toIndex);
  renderCollectionsUI();
}

async function handleMoveTab(fromCollectionId, toCollectionId, tabId, toIndex) {
  if (toIndex === -1) {
    const toCol = data.collections.find(c => c.id === toCollectionId);
    toIndex = toCol ? toCol.tabs.length : 0;
  }
  await moveTab(data, fromCollectionId, toCollectionId, tabId, toIndex);
  renderCollectionsUI();
}

async function handleDropOpenTab(browserTabId, collectionId, toIndex) {
  const browserTab = openTabs.find(t => t.id === Number(browserTabId));
  if (!browserTab) return;
  const result = await addTabToCollection(data, collectionId, browserTab.title, browserTab.url, browserTab.favIconUrl, toIndex);
  if (result.duplicate) {
    showDuplicateToast(collectionId);
    return;
  }
  renderCollectionsUI();
  const card = document.querySelector(`.collection-card[data-collection-id="${collectionId}"]`);
  if (card) flashElement(card);
}

// === Search ===

function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value.trim().toLowerCase();
      clearBtn.hidden = !searchQuery;
      renderAll();
    }, 200);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    searchQuery = '';
    clearBtn.hidden = true;
    renderAll();
  });
}

function filterOpenTabs(tabs) {
  if (!searchQuery) return tabs;
  return tabs.filter(t =>
    (t.title || '').toLowerCase().includes(searchQuery) ||
    (t.url || '').toLowerCase().includes(searchQuery)
  );
}

function filterCollections(collections) {
  if (!searchQuery) return collections;
  return collections
    .map(col => {
      const nameMatch = col.name.toLowerCase().includes(searchQuery);
      const matchingTabs = col.tabs.filter(t =>
        t.title.toLowerCase().includes(searchQuery) ||
        t.url.toLowerCase().includes(searchQuery)
      );
      if (nameMatch) return col;
      if (matchingTabs.length > 0) return { ...col, tabs: matchingTabs, collapsed: false };
      return null;
    })
    .filter(Boolean);
}

// === Export / Import ===

function setupExportImport() {
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);
}

function handleExport() {
  const json = exportData(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tab-manager-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const reader = new FileReader();
  reader.onload = (event) => {
    let json;
    try {
      json = JSON.parse(event.target.result);
    } catch {
      renderModal(t('importFailed'), t('jsonError'), [
        { label: t('confirm'), style: 'primary' }
      ]);
      return;
    }

    const error = validateImportData(json);
    if (error) {
      renderModal(t('importFailed'), error, [
        { label: t('confirm'), style: 'primary' }
      ]);
      return;
    }

    renderModal(t('importTitle'), t('importMsg'), [
      { label: t('cancel'), style: 'secondary' },
      {
        label: t('merge'),
        style: 'primary',
        action: async () => {
          data = await importData(data, json, 'merge');
          renderAll();
        }
      },
      {
        label: t('overwrite'),
        style: 'danger',
        action: async () => {
          data = await importData(data, json, 'overwrite');
          renderAll();
        }
      }
    ]);
  };
  reader.readAsText(file);
}

// === Toast ===

function showDuplicateToast(collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  const name = col ? col.name : '';
  const msg = t('duplicateTab') || `此 Tab 已存在於「${name}」中`;

  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

// === Tooltip ===

function setupTooltip() {
  const tip = document.createElement('div');
  tip.className = 'custom-tooltip';
  document.body.appendChild(tip);

  let showTimer = null;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    // Only show tooltip when text is truncated (ellipsis visible)
    if (el.scrollWidth <= el.clientWidth) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      tip.textContent = el.dataset.tooltip;
      const rect = el.getBoundingClientRect();
      tip.style.left = rect.left + 'px';
      tip.style.top = (rect.bottom + 6) + 'px';

      // Keep tooltip within viewport
      tip.classList.add('visible');
      const tipRect = tip.getBoundingClientRect();
      if (tipRect.right > window.innerWidth - 8) {
        tip.style.left = (window.innerWidth - tipRect.width - 8) + 'px';
      }
      if (tipRect.bottom > window.innerHeight - 8) {
        tip.style.top = (rect.top - tipRect.height - 6) + 'px';
      }
    }, 300);
  });

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    clearTimeout(showTimer);
    tip.classList.remove('visible');
  });
}

// === Event Listeners ===

function setupEventListeners() {
  document.getElementById('btn-add-collection').addEventListener('click', handleAddCollection);
  document.getElementById('btn-link-folder').addEventListener('click', handleLinkFolder);
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
  setupSearch();
  setupExportImport();
  setupBackgroundSettings();
  setupTooltip();
}

// === Start ===

init();
