import { loadData, addTabToCollection, getOrderedCollections } from './js/storage.js';
import { loadLang, t } from './js/i18n.js';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Remove trailing slash and hash for consistent comparison
    return u.origin + u.pathname.replace(/\/+$/, '') + u.search;
  } catch {
    return url;
  }
}

function isNewTabPage(tab) {
  if (!tab.url) return true;
  if (tab.url === 'chrome://newtab/' || tab.url === 'chrome://newtab') return true;
  if (tab.url.startsWith('chrome-extension://') && tab.url.includes('newtab.html')) return true;
  return false;
}

async function init() {
  // Theme
  const { theme } = await chrome.storage.local.get('theme');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // i18n
  await loadLang();

  // Current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const disabled = isNewTabPage(tab);

  const faviconEl = document.getElementById('current-tab-favicon');
  const titleEl = document.getElementById('current-tab-title');
  const urlEl = document.getElementById('current-tab-url');

  faviconEl.src = tab.favIconUrl || '';
  faviconEl.onerror = () => { faviconEl.style.display = 'none'; };
  titleEl.textContent = tab.title || 'Untitled';
  try {
    const u = new URL(tab.url);
    urlEl.textContent = u.hostname + u.pathname.replace(/\/$/, '');
  } catch {
    urlEl.textContent = tab.url || '';
  }

  // Disabled message
  if (disabled) {
    const msgEl = document.getElementById('popup-disabled-msg');
    msgEl.textContent = t('popupDisabledMsg');
    msgEl.hidden = false;
  }

  // Collections
  const data = await loadData();
  const ordered = getOrderedCollections(data);
  const listEl = document.getElementById('collections-list');
  const confirmBtn = document.getElementById('btn-confirm');
  let selectedId = null;

  confirmBtn.textContent = t('popupAddToCollection');

  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'popup-empty';
    empty.textContent = t('noCollectionMsg');
    listEl.appendChild(empty);
  } else {
    for (const col of ordered) {
      const item = document.createElement('button');
      item.className = 'popup-collection-item';
      item.dataset.collectionId = col.id;

      if (disabled) {
        item.disabled = true;
      }

      const dot = document.createElement('span');
      dot.className = 'popup-collection-dot';
      dot.style.background = col.color;

      const icon = document.createElement('span');
      icon.className = 'popup-collection-icon';
      icon.textContent = col.icon;

      const name = document.createElement('span');
      name.className = 'popup-collection-name';
      name.textContent = col.name;

      const count = document.createElement('span');
      count.className = 'popup-collection-count';
      count.textContent = `(${col.tabs.length})`;

      // Check if current tab already exists in this collection
      const currentUrl = normalizeUrl(tab.url);
      const alreadyAdded = !disabled && col.tabs.some(t => normalizeUrl(t.url) === currentUrl);
      if (alreadyAdded) {
        const badge = document.createElement('span');
        badge.className = 'popup-added-badge';
        badge.textContent = t('popupAlreadyAdded');
        item.append(dot, icon, name, badge, count);
        item.disabled = true;
      } else {
        item.append(dot, icon, name, count);
      }

      if (!disabled && !alreadyAdded) {
        item.addEventListener('click', () => {
          // Clear previous selection
          listEl.querySelectorAll('.popup-collection-item').forEach(el => {
            el.classList.remove('selected');
          });
          item.classList.add('selected');
          selectedId = col.id;
          confirmBtn.hidden = false;
          confirmBtn.disabled = false;
        });
      }

      listEl.appendChild(item);
    }
  }

  // Confirm button
  if (!disabled && ordered.length > 0) {
    confirmBtn.hidden = true; // shown after selection
    confirmBtn.disabled = true;
  }

  confirmBtn.addEventListener('click', async () => {
    if (!selectedId) return;
    const result = await addTabToCollection(
      data, selectedId, tab.title, tab.url, tab.favIconUrl
    );

    // Clear previous feedback
    listEl.querySelectorAll('.popup-feedback').forEach(el => el.remove());
    listEl.querySelectorAll('.popup-collection-item').forEach(el => {
      el.classList.remove('success', 'duplicate');
    });

    const selectedItem = listEl.querySelector(`.popup-collection-item[data-collection-id="${selectedId}"]`);
    if (!selectedItem) return;

    // Update count
    const updatedCol = data.collections.find(c => c.id === selectedId);
    const countEl = selectedItem.querySelector('.popup-collection-count');
    if (updatedCol && countEl) {
      countEl.textContent = `(${updatedCol.tabs.length})`;
    }

    const feedback = document.createElement('span');
    feedback.className = 'popup-feedback';

    if (result.duplicate) {
      selectedItem.classList.add('duplicate');
      feedback.textContent = t('duplicateTab');
      selectedItem.appendChild(feedback);
    } else {
      window.close();
    }
  });

  // Open VisiTab link
  const openBtn = document.getElementById('btn-open-visitab');
  openBtn.textContent = t('popupOpenVisiTab');
  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({});
    window.close();
  });
}

init();
