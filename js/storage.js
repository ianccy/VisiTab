import {
  getRootFolderId, readCollectionsFromBookmarks,
  createBookmarkFolder, updateBookmarkFolder, removeBookmarkFolder,
  createBookmarkTab, removeBookmarkTab, moveBookmark, readTabsFromFolder
} from './bookmarks.js';

import { t } from './i18n.js';
import { getStatus as getAuthStatus } from './auth.js';
import { push as drivePush, pull as drivePull, isRemoteNewer, exists as driveExists } from './driveSync.js';

const DEFAULT_COLORS = [
  '#7c83ff', '#ff7eb3', '#7ecfff', '#7eff83',
  '#ffdb5c', '#ff8c5c', '#c57cff', '#5cffc8',
  '#ff5c8a', '#5cb8ff',
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#cddc39',
  '#ffeb3b', '#ffc107', '#ff9800', '#795548',
  '#607d8b', '#9e9e9e', '#333333', '#ffffff'
];

const DEFAULT_ICONS = [
  '📁', '💻', '🎨', '📚', '🎵',
  '🎮', '📧', '🛒', '📰', '🔧',
  '🌐', '📝', '🏠', '💼', '🔬',
  '📷', '🎬', '💰', '❤️'
];

const CLOUD_TEMPLATE = {
  version: 1,
  lastModified: 0,
  collections: [],
  uiState: { collapsed: {}, collectionOrder: [] }
};

export { DEFAULT_COLORS, DEFAULT_ICONS };

let rootFolderId = null;

function generateId() {
  return crypto.randomUUID();
}

async function isCloudMode() {
  const status = await getAuthStatus();
  return status.isSignedIn;
}

async function ensureRoot() {
  if (!rootFolderId) {
    rootFolderId = await getRootFolderId();
  }
  return rootFolderId;
}

async function loadCloudData() {
  const { cloudData } = await chrome.storage.local.get('cloudData');
  if (!cloudData) return { ...CLOUD_TEMPLATE, lastModified: Date.now() };
  return {
    version: cloudData.version || 1,
    lastModified: cloudData.lastModified || Date.now(),
    collections: Array.isArray(cloudData.collections) ? cloudData.collections : [],
    uiState: {
      collapsed: cloudData.uiState?.collapsed || {},
      collectionOrder: cloudData.uiState?.collectionOrder || []
    }
  };
}

let _onPushStatusChange = null;

export function onPushStatusChange(callback) {
  _onPushStatusChange = callback;
}

async function saveCloudData(cloudData, options = {}) {
  cloudData.lastModified = Date.now();
  await chrome.storage.local.set({
    cloudData,
    cloudLastModified: cloudData.lastModified
  });
  const immediate = options.immediate === true;
  const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 3000;
  if (immediate) {
    if (_onPushStatusChange) _onPushStatusChange('syncing');
    try {
      await drivePush(cloudData, { immediate: true });
      if (_onPushStatusChange) _onPushStatusChange('synced');
    } catch (err) {
      console.error('Drive push failed:', err);
      if (_onPushStatusChange) _onPushStatusChange('error');
    }
    return;
  }
  if (_onPushStatusChange) _onPushStatusChange('syncing');
  drivePush(cloudData, { debounceMs })
    .then(() => { if (_onPushStatusChange) _onPushStatusChange('synced'); })
    .catch(err => {
      console.error('Drive push failed:', err);
      if (_onPushStatusChange) _onPushStatusChange('error');
    });
}

async function loadSyncMetadata() {
  const { syncMetadata } = await chrome.storage.local.get('syncMetadata');
  return syncMetadata || {};
}

async function saveSyncMetadata(syncMetadata) {
  await chrome.storage.local.set({ syncMetadata });
}

function upsertMeta(syncMetadata, bookmarkId, patch) {
  const existing = syncMetadata[bookmarkId] || {};
  syncMetadata[bookmarkId] = {
    uuid: existing.uuid || generateId(),
    uploaded: existing.uploaded === true,
    updatedAt: existing.updatedAt || Date.now(),
    ...patch
  };
}

async function ensureDraftMetadataForCollection(collection) {
  const syncMetadata = await loadSyncMetadata();
  if (!syncMetadata[collection.id]) {
    upsertMeta(syncMetadata, collection.id, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }
}

async function readLocalDraftCollectionsFromBookmarks() {
  const rootId = await ensureRoot();
  const all = await readCollectionsFromBookmarks(rootId);
  const syncMetadata = await loadSyncMetadata();
  const drafts = [];

  for (const col of all) {
    const meta = syncMetadata[col.id];
    const isUploaded = meta?.uploaded === true;
    if (!isUploaded) {
      await ensureDraftMetadataForCollection(col);
      drafts.push({ ...col, status: 'local' });
    }
  }

  return drafts;
}

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
      // skip missing folder
    }
  }

  if (validIds.length !== ids.length) {
    await chrome.storage.sync.set({ linkedFolders: validIds });
  }

  return collections;
}

async function updateLinkedFolderMeta(folderId, icon, color) {
  const { linkedFolderMeta } = await chrome.storage.sync.get('linkedFolderMeta');
  const meta = linkedFolderMeta || {};
  meta[folderId] = { ...(meta[folderId] || {}), icon, color };
  await chrome.storage.sync.set({ linkedFolderMeta: meta });
}

function applyCollapsedAndOrder(allCollections, collapsedMap, savedOrder) {
  for (const col of allCollections) {
    col.collapsed = collapsedMap[col.id] || false;
  }

  const existingIds = new Set(allCollections.map(c => c.id));
  const collectionOrder = (savedOrder || []).filter(id => existingIds.has(id));
  for (const col of allCollections) {
    if (!collectionOrder.includes(col.id)) collectionOrder.push(col.id);
  }
  return collectionOrder;
}

// === Load ===

export async function loadData() {
  try {
    const cloud = await isCloudMode();

    if (!cloud) {
      const rootId = await ensureRoot();
      const collections = await readCollectionsFromBookmarks(rootId);
      const linkedCollections = await loadLinkedFolders();
      const allCollections = [...collections, ...linkedCollections];

      const { uiState } = await chrome.storage.local.get('uiState');
      const collapsedMap = uiState?.collapsed || {};
      const savedOrder = uiState?.collectionOrder || [];
      const collectionOrder = applyCollapsedAndOrder(allCollections, collapsedMap, savedOrder);
      return { collections: allCollections, collectionOrder };
    }

    // Cloud mode mixed view: cloudData + local drafts (uploaded=false in syncMetadata)
    const cloudData = await loadCloudData();
    const cloudCollections = (cloudData.collections || []).map(c => ({ ...c, status: 'cloud' }));
    const localDraftCollections = await readLocalDraftCollectionsFromBookmarks();
    const linkedCollections = await loadLinkedFolders();

    const allCollections = [...cloudCollections, ...localDraftCollections, ...linkedCollections];
    const localUi = (await chrome.storage.local.get('uiState')).uiState || { collapsed: {}, collectionOrder: [] };
    const collapsedMap = { ...(cloudData.uiState?.collapsed || {}), ...(localUi.collapsed || {}) };
    // Prefer device-local full order to preserve mixed order across cloud/local/linked groups.
    const savedOrder = Array.isArray(localUi.fullCollectionOrder) && localUi.fullCollectionOrder.length > 0
      ? localUi.fullCollectionOrder
      : [...(cloudData.uiState?.collectionOrder || []), ...(localUi.collectionOrder || [])];
    const collectionOrder = applyCollapsedAndOrder(allCollections, collapsedMap, savedOrder);

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
    if (!cloud) {
      await chrome.storage.local.set({
        uiState: { collapsed, collectionOrder: data.collectionOrder }
      });
      return;
    }

    const cloudCols = data.collections.filter(c => !c.linked && c.status !== 'local');
    const localCols = data.collections.filter(c => c.linked || c.status === 'local');

    const cloudData = await loadCloudData();
    cloudData.collections = cloudCols.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      tabs: c.tabs || []
    }));
    cloudData.uiState = {
      collapsed: Object.fromEntries(Object.entries(collapsed).filter(([id]) => cloudCols.some(c => c.id === id))),
      collectionOrder: data.collectionOrder.filter(id => cloudCols.some(c => c.id === id))
    };
    await saveCloudData(cloudData);

    await chrome.storage.local.set({
      uiState: {
        collapsed: Object.fromEntries(Object.entries(collapsed).filter(([id]) => localCols.some(c => c.id === id))),
        collectionOrder: data.collectionOrder.filter(id => localCols.some(c => c.id === id)),
        // Full order keeps mixed ordering (cloud/local/linked) after reload in this device.
        fullCollectionOrder: data.collectionOrder
      }
    });
  } catch (err) {
    showError(t('saveError', err.message));
  }
}

// === Collection Operations ===

export async function addCollection(data, name, color, icon, status = 'local') {
  color = color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
  icon = icon || '📁';

  const cloud = await isCloudMode();
  if (!cloud || status === 'local') {
    const rootId = await ensureRoot();
    const folder = await createBookmarkFolder(rootId, icon, name, color);
    const col = {
      id: folder.id,
      bookmarkId: folder.id,
      name,
      color,
      icon,
      collapsed: false,
      tabs: [],
      status: cloud ? 'local' : undefined
    };

    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, folder.id, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);

    data.collections.push(col);
    data.collectionOrder.push(col.id);
    await saveUIState(data);
    return col;
  }

  const col = {
    id: generateId(),
    name,
    color,
    icon,
    collapsed: false,
    tabs: [],
    status: 'cloud'
  };
  data.collections.push(col);
  data.collectionOrder.push(col.id);
  await saveUIState(data);
  return col;
}

export async function removeCollection(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;

  if (col.linked) {
    return unlinkFolder(data, collectionId);
  }

  if (col.status === 'local' || !await isCloudMode()) {
    await removeBookmarkFolder(collectionId);
    const syncMetadata = await loadSyncMetadata();
    delete syncMetadata[collectionId];
    await saveSyncMetadata(syncMetadata);
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
  if (col.status === 'local' || !await isCloudMode()) {
    await updateBookmarkFolder(collectionId, col.icon, newName, col.color);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }
  await saveUIState(data);
  return data;
}

export async function updateCollectionColor(data, collectionId, color) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  col.color = color;

  if (col.linked) {
    await updateLinkedFolderMeta(collectionId, col.icon, color);
  } else if (col.status === 'local' || !await isCloudMode()) {
    await updateBookmarkFolder(collectionId, col.icon, col.name, color);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }

  await saveUIState(data);
  return data;
}

export async function updateCollectionIcon(data, collectionId, icon) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  col.icon = icon;

  if (col.linked) {
    await updateLinkedFolderMeta(collectionId, icon, col.color);
  } else if (col.status === 'local' || !await isCloudMode()) {
    await updateBookmarkFolder(collectionId, icon, col.name, col.color);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }

  await saveUIState(data);
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

  const hostname = new URL(url).hostname;
  const resolvedFavicon = favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

  if (col.status === 'cloud' && !col.linked) {
    const tab = { id: generateId(), title, url, favicon: resolvedFavicon };
    if (index >= 0 && index <= col.tabs.length) {
      col.tabs.splice(index, 0, tab);
    } else {
      col.tabs.push(tab);
    }
    await saveUIState(data);
    return { data, duplicate: false };
  }

  const bm = await createBookmarkTab(collectionId, title, url, index >= 0 ? index : undefined);
  const tab = {
    id: bm.id,
    bookmarkId: bm.id,
    title,
    url,
    favicon: resolvedFavicon
  };

  if (index >= 0 && index <= col.tabs.length) {
    col.tabs.splice(index, 0, tab);
  } else {
    col.tabs.push(tab);
  }

  const syncMetadata = await loadSyncMetadata();
  upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
  await saveSyncMetadata(syncMetadata);

  await saveUIState(data);
  return { data, duplicate: false };
}

export async function renameTab(data, collectionId, tabId, newTitle) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;
  const tab = col.tabs.find(t => t.id === tabId);
  if (!tab) return data;

  tab.title = newTitle;
  if (col.status === 'cloud' && !col.linked) {
    await saveUIState(data);
    return data;
  }

  await chrome.bookmarks.update(tabId, { title: newTitle });
  const syncMetadata = await loadSyncMetadata();
  upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
  await saveSyncMetadata(syncMetadata);
  await saveUIState(data);
  return data;
}

export async function removeTabFromCollection(data, collectionId, tabId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;

  if (!(col.status === 'cloud' && !col.linked)) {
    await removeBookmarkTab(tabId);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }

  col.tabs = col.tabs.filter(t => t.id !== tabId);
  await saveUIState(data);
  return data;
}

export async function reorderTab(data, collectionId, fromIndex, toIndex) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col) return data;

  const [tab] = col.tabs.splice(fromIndex, 1);
  col.tabs.splice(toIndex, 0, tab);

  if (!(col.status === 'cloud' && !col.linked)) {
    await moveBookmark(tab.id, collectionId, toIndex);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, collectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }

  await saveUIState(data);
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

  const canMoveInCloudOnly = fromCol.status === 'cloud' && toCol.status === 'cloud' && !fromCol.linked && !toCol.linked;
  if (!canMoveInCloudOnly) {
    await moveBookmark(tabId, toCollectionId, toIndex);
    const syncMetadata = await loadSyncMetadata();
    upsertMeta(syncMetadata, fromCollectionId, { uploaded: false, updatedAt: Date.now() });
    upsertMeta(syncMetadata, toCollectionId, { uploaded: false, updatedAt: Date.now() });
    await saveSyncMetadata(syncMetadata);
  }

  await saveUIState(data);
  return data;
}

export async function reorderCollections(data, fromIndex, toIndex) {
  const [id] = data.collectionOrder.splice(fromIndex, 1);
  data.collectionOrder.splice(toIndex, 0, id);
  await saveUIState(data);
  return data;
}

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
      if (col.status !== 'cloud') {
        await removeBookmarkFolder(col.id);
      }
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
      const col = await addCollection(data, importCol.name, color, icon, 'local');
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

// === Migration / Upload drafts ===

function toCloudCollection(col, syncMetadata) {
  const colMeta = syncMetadata[col.id] || { uuid: generateId() };
  return {
    id: colMeta.uuid,
    name: col.name,
    color: col.color,
    icon: col.icon,
    tabs: (col.tabs || []).map(tab => ({
      id: generateId(),
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon
    }))
  };
}

export async function migrateToCloud(data, selections = null) {
  const localDrafts = data.collections.filter(c => !c.linked && c.status === 'local');
  if (localDrafts.length === 0) {
    await chrome.storage.local.set({ migrationAsked: true });
    return loadData();
  }

  const cloudData = await loadCloudData();
  const syncMetadata = await loadSyncMetadata();
  const previousMetadata = JSON.parse(JSON.stringify(syncMetadata));
  const previousCloudData = JSON.parse(JSON.stringify(cloudData));

  const selectionMap = new Map();
  if (Array.isArray(selections)) {
    for (const s of selections) {
      if (!s?.collectionId) continue;
      selectionMap.set(s.collectionId, {
        collectionId: s.collectionId,
        sync: s.sync !== false,
        keep: s.keep !== false
      });
    }
  }

  try {
    const preparedMetadata = JSON.parse(JSON.stringify(syncMetadata));

    for (const col of localDrafts) {
      const choice = selectionMap.get(col.id) || { collectionId: col.id, sync: true, keep: false };
      if (!choice.sync) continue;

      upsertMeta(preparedMetadata, col.id, { uploaded: false, updatedAt: Date.now() });
      cloudData.collections.push(toCloudCollection(col, preparedMetadata));
    }

    // Deduplicate cloud collections by UUID
    const seen = new Set();
    cloudData.collections = cloudData.collections.filter(col => {
      if (!col.id || seen.has(col.id)) return false;
      seen.add(col.id);
      return true;
    });

    cloudData.uiState = {
      collapsed: {},
      collectionOrder: cloudData.collections.map(c => c.id)
    };

    await saveCloudData(cloudData, { immediate: true });

    for (const col of localDrafts) {
      const choice = selectionMap.get(col.id) || { collectionId: col.id, sync: true, keep: false };
      const shouldKeep = choice.keep === true;

      if (shouldKeep) {
        const preparedCol = preparedMetadata[col.id];
        upsertMeta(syncMetadata, col.id, {
          uuid: preparedCol?.uuid,
          uploaded: false,
          updatedAt: Date.now()
        });
        continue;
      }

      try {
        await removeBookmarkFolder(col.id);
      } catch {
        // ignore deletion failure for already-missing folder
      }
      delete syncMetadata[col.id];
    }

    await saveSyncMetadata(syncMetadata);
    await chrome.storage.local.set({ migrationAsked: true, migrationDecision: 'confirmed' });
    return loadData();
  } catch (err) {
    await saveSyncMetadata(previousMetadata);
    await chrome.storage.local.set({
      cloudData: previousCloudData,
      cloudLastModified: previousCloudData.lastModified || Date.now()
    });
    throw err;
  }
}

export async function hasMigrated() {
  return isCloudMode();
}

export async function wasMigrationAsked() {
  const { migrationAsked, migrationDecision } = await chrome.storage.local.get(['migrationAsked', 'migrationDecision']);
  if (migrationDecision === 'confirmed' || migrationDecision === 'cancelled') return true;
  if (migrationDecision === 'pending') return false;
  return migrationAsked === true;
}

export async function setMigrationPending() {
  await chrome.storage.local.set({ migrationDecision: 'pending' });
}

export async function setMigrationAsked(decision = 'cancelled') {
  await chrome.storage.local.set({ migrationAsked: true, migrationDecision: decision });
}

// === Logout Cleanup ===

export async function getUnsyncedDraftCount() {
  const syncMetadata = await loadSyncMetadata();
  let count = 0;
  for (const meta of Object.values(syncMetadata)) {
    if (meta?.uploaded === false) count++;
  }
  return count;
}

export async function handleUserLogout(options = {}) {
  const deleteDrafts = options.deleteDrafts === true;
  const syncMetadata = await loadSyncMetadata();
  const nextMetadata = {};

  for (const [bookmarkId, meta] of Object.entries(syncMetadata)) {
    const isUploaded = meta?.uploaded === true;
    const shouldDelete = isUploaded || (deleteDrafts && !isUploaded);

    if (shouldDelete) {
      try {
        await chrome.bookmarks.removeTree(bookmarkId);
      } catch {
        // skip missing/invalid node
      }
      continue;
    }

    nextMetadata[bookmarkId] = meta;
  }

  await chrome.storage.local.set({ syncMetadata: nextMetadata });
  await chrome.storage.local.remove([
    'cloudData',
    'cloudLastModified',
    'migrationAsked',
    'migrationDecision',
    // Legacy / cache keys that should not leak across account sessions
    'migrated',
    'localOnlyData',
    'driveFileId',
    'driveFolderId'
  ]);
}

// === Background Sync ===

export async function backgroundSync(data, onUpdated) {
  const { cloudLastModified } = await chrome.storage.local.get('cloudLastModified');
  const localTimestamp = cloudLastModified || 0;

  const newer = await isRemoteNewer(localTimestamp);
  if (!newer) return false;

  const remoteData = await drivePull();
  if (!remoteData) return false;

  await chrome.storage.local.set({
    cloudData: remoteData,
    cloudLastModified: remoteData.lastModified || Date.now()
  });

  if (onUpdated) onUpdated();
  return true;
}

// === Linked Folders ===

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

// === Bookmark Export ===

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

// === Compatibility no-op exports ===

export async function getSyncState() {
  const hasRemote = await driveExists();
  return { items: [], hasRemote };
}

export async function applySyncSelections() {
  return loadData();
}

export async function promoteToCloud(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.linked) return data;
  if (col.status === 'local') {
    data = await migrateToCloud({ ...data, collections: [col] });
  }
  return data;
}

export async function demoteToLocal(data, collectionId) {
  const col = data.collections.find(c => c.id === collectionId);
  if (!col || col.linked) return data;
  col.status = 'local';
  await saveUIState(data);
  return data;
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
