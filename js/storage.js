import {
  getRootFolderId, readCollectionsFromBookmarks,
  createBookmarkFolder, updateBookmarkFolder, removeBookmarkFolder,
  createBookmarkTab, removeBookmarkTab, moveBookmark,
  reorderBookmarkChildren, readTabsFromFolder
} from './bookmarks.js';

import { t } from './i18n.js';
import { getStatus as getAuthStatus } from './auth.js';
import { push as drivePush, pull as drivePull, isRemoteNewer, exists as driveExists } from './driveSync.js';

const DEFAULT_COLORS = [
  '#7c83ff', '#ff7eb3', '#7ecfff', '#7eff83',
  '#ffdb5c', '#ff8c5c', '#c57cff', '#5cffc8',
  '#ff5c8a', '#5cb8ff'
];

const DEFAULT_ICONS = [
  '📁', '💻', '🎨', '📚', '🎵',
  '🎮', '📧', '🛒', '📰', '🔧',
  '🌐', '📝', '🏠', '💼', '🔬',
  '📷', '🎬', '💰', '❤️'
];

export { DEFAULT_COLORS, DEFAULT_ICONS };

let rootFolderId = null;

// === Cloud Mode State ===

async function isCloudMode() {
  const status = await getAuthStatus();
  if (!status.isSignedIn) return false;
  const { migrated } = await chrome.storage.local.get('migrated');
  return migrated === true;
}

function generateId() {
  return crypto.randomUUID();
}

async function loadCloudData() {
  const { cloudData } = await chrome.storage.local.get('cloudData');
  return cloudData || { version: 1, lastModified: Date.now(), collections: [], uiState: { collapsed: {}, collectionOrder: [] } };
}

async function saveCloudData(cloudData) {
  cloudData.lastModified = Date.now();
  await chrome.storage.local.set({ cloudData, cloudLastModified: cloudData.lastModified });
  drivePush(cloudData).catch(err => console.error('Drive push failed:', err));
}

async function loadLocalOnlyData() {
  const { localOnlyData } = await chrome.storage.local.get('localOnlyData');
  return localOnlyData || { collections: [], uiState: { collapsed: {}, collectionOrder: [] } };
}

async function saveLocalOnlyData(localOnly) {
  await chrome.storage.local.set({ localOnlyData: localOnly });
}

// === Init ===

async function ensureRoot() {
  if (!rootFolderId) {
    rootFolderId = await getRootFolderId();
  }
  return rootFolderId;
}

// === Linked Folders (synced via chrome.storage.sync) ===

async function loadLinkedFolders() {
  const { linkedFolders, linkedFolderMeta } = await chrome.storage.sync.get(['linkedFolders', 'linkedFolderMeta']);
  const ids = linkedFolders || [];
  const meta = linkedFolderMeta || {};
  const collections = [];
  const validIds = [];

  for (const folderId of ids) {
    try {
      const [node] = await chrome.bookmarks.get(folderId);
      if (!node || node.url) continue;
      const tabs = await readTabsFromFolder(folderId);
      const m = meta[folderId] || {};
      collections.push({
        id: folderId,
        bookmarkId: folderId,
        name: node.title,
        color: m.color || '#7c83ff',
        icon: m.icon || '🔗',
        tabs,
        linked: true
      });
      validIds.push(folderId);
    } catch {
      // folder deleted externally, skip
    }
  }

  if (validIds.length !== ids.length) {
    await chrome.storage.sync.set({ linkedFolders: validIds });
  }

  return collections;
}

export async function linkFolder(data, folderId) {
  const { linkedFolders, linkedFolderMeta } = await chrome.storage.sync.get(['linkedFolders', 'linkedFolderMeta']);
  const ids = linkedFolders || [];
  const meta = linkedFolderMeta || {};

  if (ids.includes(folderId)) return data;

  const [node] = await chrome.bookmarks.get(folderId);
  if (!node || node.url) return data;

  ids.push(folderId);
  meta[folderId] = { icon: '🔗', color: '#7c83ff' };
  await chrome.storage.sync.set({ linkedFolders: ids, linkedFolderMeta: meta });

  const tabs = await readTabsFromFolder(folderId);
  const col = {
    id: folderId,
    bookmarkId: folderId,
    name: node.title,
    color: '#7c83ff',
    icon: '🔗',
    tabs,
    linked: true,
    collapsed: false
  };
  data.collections.push(col);
  data.collectionOrder.push(col.id);
  await saveUIState(data);
  return col;
}

export async function unlinkFolder(data, folderId) {
  const { linkedFolders, linkedFolderMeta } = await chrome.storage.sync.get(['linkedFolders', 'linkedFolderMeta']);
  const ids = (linkedFolders || []).filter(id => id !== folderId);
  const meta = linkedFolderMeta || {};
  delete meta[folderId];
  await chrome.storage.sync.set({ linkedFolders: ids, linkedFolderMeta: meta });

  data.collections = data.collections.filter(c => c.id !== folderId);
  data.collectionOrder = data.collectionOrder.filter(id => id !== folderId);
  await saveUIState(data);
  return data;
}

async function updateLinkedFolderMeta(folderId, icon, color) {
  const { linkedFolderMeta } = await chrome.storage.sync.get('linkedFolderMeta');
  const meta = linkedFolderMeta || {};
  meta[folderId] = { ...(meta[folderId] || {}), icon, color };
  await chrome.storage.sync.set({ linkedFolderMeta: meta });
}

// === Load ===

export async function loadData() {
  try {
    const cloud = await isCloudMode();

    if (cloud) {
      const cloudData = await loadCloudData();
      const collections = (cloudData.collections || []).map(c => ({ ...c, status: 'cloud' }));
      const linkedCollections = await loadLinkedFolders();

      // Load local-only collections
      const localOnly = await loadLocalOnlyData();
      const localOnlyCollections = (localOnly.collections || []).map(c => ({ ...c, status: 'local' }));

      const allCollections = [...collections, ...localOnlyCollections, ...linkedCollections];

      const collapsedMap = { ...(cloudData.uiState?.collapsed || {}), ...(localOnly.uiState?.collapsed || {}) };
      const savedOrder = [...(cloudData.uiState?.collectionOrder || []), ...(localOnly.uiState?.collectionOrder || [])];

      for (const col of allCollections) {
        col.collapsed = collapsedMap[col.id] || false;
      }

      const existingIds = new Set(allCollections.map(c => c.id));
      const collectionOrder = savedOrder.filter(id => existingIds.has(id));
      for (const col of allCollections) {
        if (!collectionOrder.includes(col.id)) collectionOrder.push(col.id);
      }

      return { collections: allCollections, collectionOrder };
    }

    // Original local bookmark mode
    const rootId = await ensureRoot();
    const collections = await readCollectionsFromBookmarks(rootId);
    const linkedCollections = await loadLinkedFolders();
    const allCollections = [...collections, ...linkedCollections];

    const { uiState } = await chrome.storage.local.get('uiState');
    const collapsedMap = uiState?.collapsed || {};
    const savedOrder = uiState?.collectionOrder || [];

    for (const col of allCollections) {
      col.collapsed = collapsedMap[col.id] || false;
    }

    const existingIds = new Set(allCollections.map(c => c.id));
    const collectionOrder = savedOrder.filter(id => existingIds.has(id));
    for (const col of allCollections) {
      if (!collectionOrder.includes(col.id)) collectionOrder.push(col.id);
    }

    return { collections: allCollections, collectionOrder };
  } catch (err) {
    showError(t('loadError', err.message));
    return { collections: [], collectionOrder: [] };
  }
}

// === Save UI State ===

export async function saveUIState(data) {
  try {
    const collapsed = {};
    for (const col of data.collections) {
      if (col.collapsed) collapsed[col.id] = true;
    }

    const cloud = await isCloudMode();
    if (cloud) {
      const cloudCols = data.collections.filter(c => !c.linked && c.status !== 'local');
      const localOnlyCols = data.collections.filter(c => c.status === 'local');

      const cloudData = await loadCloudData();
      cloudData.uiState = {
        collapsed: Object.fromEntries(Object.entries(collapsed).filter(([id]) => cloudCols.some(c => c.id === id))),
        collectionOrder: data.collectionOrder.filter(id => cloudCols.some(c => c.id === id))
      };
      cloudData.collections = cloudCols;
      await saveCloudData(cloudData);

      const localOnly = await loadLocalOnlyData();
      localOnly.uiState = {
        collapsed: Object.fromEntries(Object.entries(collapsed).filter(([id]) => localOnlyCols.some(c => c.id === id))),
        collectionOrder: data.collectionOrder.filter(id => localOnlyCols.some(c => c.id === id))
      };
      localOnly.collections = localOnlyCols;
      await saveLocalOnlyData(localOnly);
    } else {
      await chrome.storage.local.set({
        uiState: { collapsed, collectionOrder: data.collectionOrder }
      });
    }
  } catch (err) {
    showError(t('saveError', err.message));
  }
}

// === Collection Operations ===

export async function addCollection(data, name, color, icon, status = 'cloud') {
  color = color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
  icon = icon || '📁';

  const cloud = await isCloudMode();

  if (cloud) {
    const col = { id: generateId(), name, color, icon, collapsed: false, tabs: [], status };
    data.collections.push(col);
    data.collectionOrder.push(col.id);
    await saveUIState(data);
    return col;
  }

  // Local bookmark mode (unchanged)
  const rootId = await ensureRoot();
  const folder = await createBookmarkFolder(rootId, icon, name, color);
  const col = {
    id: folder.id,
    bookmarkId: folder.id,
    name, color, icon, collapsed: false, tabs: []
  };
  data.collections.push(col);
  data.collectionOrder.push(col.id);
  await saveUIState(data);
  return col;
}

export async function removeCollection(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (col?.linked) {
    return await unlinkFolder(data, collectionId);
  }

  const cloud = await isCloudMode();
  if (!cloud) {
    await removeBookmarkFolder(collectionId);
  }

  data.collections = data.collections.filter(c => c.id !== collectionId);
  data.collectionOrder = data.collectionOrder.filter(id => id !== collectionId);
  await saveUIState(data);
  return data;
}

export async function renameCollection(data, collectionId, newName) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.linked) return data;
  col.name = newName;

  const cloud = await isCloudMode();
  if (cloud) {
    await saveUIState(data);
  } else {
    await updateBookmarkFolder(collectionId, col.icon, newName, col.color);
  }
  return data;
}

export async function updateCollectionColor(data, collectionId, color) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  col.color = color;

  if (col.linked) {
    await updateLinkedFolderMeta(collectionId, col.icon, color);
  } else {
    const cloud = await isCloudMode();
    if (cloud) {
      await saveUIState(data);
    } else {
      await updateBookmarkFolder(collectionId, col.icon, col.name, color);
    }
  }
  return data;
}

export async function updateCollectionIcon(data, collectionId, icon) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  col.icon = icon;

  if (col.linked) {
    await updateLinkedFolderMeta(collectionId, icon, col.color);
  } else {
    const cloud = await isCloudMode();
    if (cloud) {
      await saveUIState(data);
    } else {
      await updateBookmarkFolder(collectionId, icon, col.name, col.color);
    }
  }
  return data;
}

export async function toggleCollectionCollapsed(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (col) col.collapsed = !col.collapsed;
  await saveUIState(data);
  return data;
}

// === Tab Operations ===

export async function addTabToCollection(data, collectionId, title, url, favicon, index = -1) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return { data, duplicate: false };
  const exists = col.tabs.some(t => t.url === url);
  if (exists) return { data, duplicate: true };

  const cloud = await isCloudMode();
  const hostname = new URL(url).hostname;

  if (cloud && !col.linked) {
    const tab = {
      id: generateId(),
      title, url,
      favicon: favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
    };
    if (index >= 0 && index <= col.tabs.length) {
      col.tabs.splice(index, 0, tab);
    } else {
      col.tabs.push(tab);
    }
    await saveUIState(data);
    return { data, duplicate: false };
  }

  const bmIndex = (index >= 0) ? index : undefined;
  const bm = await createBookmarkTab(collectionId, title, url, bmIndex);
  const tab = {
    id: bm.id,
    bookmarkId: bm.id,
    title, url,
    favicon: favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  };

  if (index >= 0 && index <= col.tabs.length) {
    col.tabs.splice(index, 0, tab);
  } else {
    col.tabs.push(tab);
  }
  return { data, duplicate: false };
}

export async function renameTab(data, collectionId, tabId, newTitle) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  const tab = col.tabs.find(t => t.id === tabId);
  if (!tab) return data;
  tab.title = newTitle;

  const cloud = await isCloudMode();
  if (cloud && !col.linked) {
    await saveUIState(data);
  } else {
    await chrome.bookmarks.update(tabId, { title: newTitle });
  }
  return data;
}

export async function removeTabFromCollection(data, collectionId, tabId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;

  const cloud = await isCloudMode();
  if (!cloud || col.linked) {
    await removeBookmarkTab(tabId);
  }

  col.tabs = col.tabs.filter(t => t.id !== tabId);

  if (cloud && !col.linked) {
    await saveUIState(data);
  }
  return data;
}

export async function reorderTab(data, collectionId, fromIndex, toIndex) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  const [tab] = col.tabs.splice(fromIndex, 1);
  col.tabs.splice(toIndex, 0, tab);

  const cloud = await isCloudMode();
  if (cloud && !col.linked) {
    await saveUIState(data);
  } else {
    await moveBookmark(tab.id, collectionId, toIndex);
  }
  return data;
}

export async function moveTab(data, fromCollectionId, toCollectionId, tabId, toIndex) {
  const fromCol = data.collections.find(c => c.id === fromCollectionId);
  const toCol = data.collections.find(c => c.id === toCollectionId);
  if (!fromCol || !toCol) return data;
  const tabIndex = fromCol.tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return data;
  const [tab] = fromCol.tabs.splice(tabIndex, 1);
  toCol.tabs.splice(toIndex, 0, tab);

  const cloud = await isCloudMode();
  if (cloud && !fromCol.linked && !toCol.linked) {
    await saveUIState(data);
  } else {
    await moveBookmark(tabId, toCollectionId, toIndex);
  }
  return data;
}

// === Collection Reorder ===

export async function reorderCollections(data, fromIndex, toIndex) {
  const [id] = data.collectionOrder.splice(fromIndex, 1);
  data.collectionOrder.splice(toIndex, 0, id);
  await saveUIState(data);
  return data;
}

// === Helpers ===

export function getOrderedCollections(data) {
  const map = new Map(data.collections.map(c => [c.id, c]));
  const ordered = data.collectionOrder
    .map(id => map.get(id))
    .filter(Boolean);
  const inOrder = new Set(data.collectionOrder);
  for (const col of data.collections) {
    if (!inOrder.has(col.id)) ordered.push(col);
  }
  return ordered;
}

// === Import / Export ===

export function validateImportData(json) {
  if (!json || typeof json !== 'object') return 'Invalid JSON structure';
  if (!Array.isArray(json.collections)) return 'Missing "collections" array';
  for (let i = 0; i < json.collections.length; i++) {
    const col = json.collections[i];
    if (!col.name || typeof col.name !== 'string') return `Collection ${i} missing "name"`;
    if (!Array.isArray(col.tabs)) return `Collection "${col.name}" missing "tabs" array`;
  }
  return null;
}

export async function importData(data, json, mode) {
  if (mode === 'overwrite') {
    const linkedIds = new Set(data.collections.filter(c => c.linked).map(c => c.id));
    for (const col of data.collections.filter(c => !c.linked)) {
      await removeBookmarkFolder(col.id);
    }
    data.collections = data.collections.filter(c => c.linked);
    data.collectionOrder = data.collectionOrder.filter(id => linkedIds.has(id));
  }

  const existingUrls = new Set();
  for (const col of data.collections) {
    for (const tab of col.tabs) {
      existingUrls.add(tab.url);
    }
  }

  for (const importCol of json.collections) {
    const color = importCol.color || DEFAULT_COLORS[0];
    const icon = importCol.icon || '📁';
    const tabs = importCol.tabs || [];

    const newTabs = mode === 'merge'
      ? tabs.filter(t => t.url && !existingUrls.has(t.url))
      : tabs.filter(t => t.url);

    if (mode === 'overwrite' || newTabs.length > 0) {
      const col = await addCollection(data, importCol.name, color, icon);
      for (const tab of newTabs) {
        await addTabToCollection(data, col.id, tab.title || tab.url, tab.url, tab.favicon);
      }
    }
  }

  return data;
}

export function exportData(data) {
  const exportObj = {
    collections: data.collections.filter(c => !c.linked).map(col => ({
      name: col.name,
      color: col.color,
      icon: col.icon,
      tabs: col.tabs.map(tab => ({
        title: tab.title,
        url: tab.url
      }))
    }))
  };
  return JSON.stringify(exportObj, null, 2);
}

// === Migration ===

export async function migrateToCloud(data) {
  const localCollections = data.collections.filter(c => !c.linked);
  const cloudCollections = localCollections.map(col => ({
    id: generateId(),
    name: col.name,
    color: col.color,
    icon: col.icon,
    tabs: col.tabs.map(tab => ({
      id: generateId(),
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon
    }))
  }));

  const cloudData = {
    version: 1,
    lastModified: Date.now(),
    collections: cloudCollections,
    uiState: {
      collapsed: {},
      collectionOrder: cloudCollections.map(c => c.id)
    }
  };

  // Push to Drive first
  await drivePush(cloudData);

  // Save local cache
  await chrome.storage.local.set({
    cloudData,
    cloudLastModified: cloudData.lastModified,
    migrated: true,
    migrationAsked: true
  });

  // Delete local bookmark folders
  for (const col of localCollections) {
    try {
      await removeBookmarkFolder(col.bookmarkId || col.id);
    } catch {}
  }

  return await loadData();
}

export async function hasMigrated() {
  const { migrated } = await chrome.storage.local.get('migrated');
  return migrated === true;
}

export async function wasMigrationAsked() {
  const { migrationAsked } = await chrome.storage.local.get('migrationAsked');
  return migrationAsked === true;
}

export async function setMigrationAsked() {
  await chrome.storage.local.set({ migrationAsked: true });
}

// === Login Sync ===

export async function getSyncState() {
  const hasRemote = await driveExists();
  let remoteCollections = [];
  if (hasRemote) {
    const remoteData = await drivePull();
    remoteCollections = remoteData?.collections || [];
  }

  // Local collections: either from cloudData cache or from bookmarks
  const { cloudData } = await chrome.storage.local.get('cloudData');
  const localOnly = await loadLocalOnlyData();
  const cachedCloudCols = cloudData?.collections || [];
  const localOnlyCols = localOnly.collections || [];

  // Load bookmark collections if not yet migrated
  const { migrated } = await chrome.storage.local.get('migrated');
  let bookmarkCols = [];
  if (!migrated) {
    const rootId = await ensureRoot();
    bookmarkCols = await readCollectionsFromBookmarks(rootId);
  }

  // Determine categories:
  const remoteNames = new Set(remoteCollections.map(c => c.name));
  const localCols = migrated ? [...cachedCloudCols, ...localOnlyCols] : bookmarkCols;
  const localNames = new Set(localCols.map(c => c.name));

  const items = [];

  // Remote-only (on Drive but not local)
  for (const col of remoteCollections) {
    if (!localNames.has(col.name)) {
      items.push({ ...col, status: 'cloud', source: 'remote', checked: true });
    }
  }

  // Already synced (same name exists in both)
  for (const col of remoteCollections) {
    if (localNames.has(col.name)) {
      items.push({ ...col, source: 'synced', status: 'cloud', checked: true });
    }
  }

  // Local-only (not on Drive)
  for (const col of localCols) {
    if (!remoteNames.has(col.name)) {
      items.push({ ...col, source: 'local', status: 'cloud', checked: true });
    }
  }

  return { items, hasRemote };
}

export async function applySyncSelections(items) {
  const cloudCollections = [];
  const localOnlyCollections = [];

  for (const item of items) {
    if (item.source === 'synced' || (item.checked && item.source === 'remote')) {
      cloudCollections.push({ id: item.id, name: item.name, color: item.color, icon: item.icon, tabs: item.tabs, status: 'cloud' });
    } else if (item.checked && item.source === 'local') {
      const col = {
        id: item.id || generateId(),
        name: item.name,
        color: item.color,
        icon: item.icon,
        tabs: (item.tabs || []).map(tab => ({
          id: tab.id || generateId(),
          title: tab.title,
          url: tab.url,
          favicon: tab.favicon
        })),
        status: 'cloud'
      };
      cloudCollections.push(col);
    } else if (!item.checked && item.source === 'local') {
      localOnlyCollections.push({
        id: item.id || generateId(),
        name: item.name,
        color: item.color,
        icon: item.icon,
        tabs: (item.tabs || []).map(tab => ({
          id: tab.id || generateId(),
          title: tab.title,
          url: tab.url,
          favicon: tab.favicon
        })),
        status: 'local'
      });
    }
  }

  // Build final cloud data
  const cloudData = {
    version: 1,
    lastModified: Date.now(),
    collections: cloudCollections,
    uiState: {
      collapsed: {},
      collectionOrder: cloudCollections.map(c => c.id)
    }
  };

  // Push to Drive
  await drivePush(cloudData);

  // Save local caches
  await chrome.storage.local.set({
    cloudData,
    cloudLastModified: cloudData.lastModified,
    migrated: true,
    migrationAsked: true
  });

  // Save local-only data
  await saveLocalOnlyData({
    collections: localOnlyCollections,
    uiState: {
      collapsed: {},
      collectionOrder: localOnlyCollections.map(c => c.id)
    }
  });

  return await loadData();
}

export async function promoteToCloud(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.status !== 'local') return data;
  col.status = 'cloud';
  await saveUIState(data);
  return data;
}

export async function demoteToLocal(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.linked) return data;
  col.status = 'local';
  await saveUIState(data);
  return data;
}

// === Background Sync ===

export async function backgroundSync(data, onUpdated) {
  try {
    const { cloudLastModified } = await chrome.storage.local.get('cloudLastModified');
    const localTimestamp = cloudLastModified || 0;

    const newer = await isRemoteNewer(localTimestamp);
    if (!newer) return false;

    const remoteData = await drivePull();
    if (!remoteData) return false;

    await chrome.storage.local.set({
      cloudData: remoteData,
      cloudLastModified: remoteData.lastModified
    });

    if (onUpdated) onUpdated();
    return true;
  } catch (err) {
    console.error('Background sync failed:', err);
    return false;
  }
}

// === Bookmark Export ===

export async function exportTabToBookmark(title, url) {
  await chrome.bookmarks.create({ title, url });
}

export async function exportCollectionToBookmarkFolder(collection) {
  const folder = await chrome.bookmarks.create({ title: collection.name });
  for (const tab of collection.tabs) {
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: tab.title,
      url: tab.url
    });
  }
  return collection.tabs.length;
}

// === Error Display ===

function showError(msg) {
  let banner = document.getElementById('error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'error-banner';
    banner.className = 'error-banner';
    const app = document.getElementById('app');
    if (app) app.prepend(banner);
  }
  banner.textContent = msg;
  banner.hidden = false;
}
