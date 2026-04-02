const ROOT_FOLDER_NAME = 'TabZ Storage';

// === Root Folder ===

export async function getRootFolderId() {
  // Try stored ID first
  const { rootFolderId } = await chrome.storage.local.get('rootFolderId');
  if (rootFolderId) {
    try {
      const nodes = await chrome.bookmarks.get(rootFolderId);
      if (nodes.length > 0 && !nodes[0].url) {
        // Rename if using old name
        if (nodes[0].title !== ROOT_FOLDER_NAME) {
          await chrome.bookmarks.update(rootFolderId, { title: ROOT_FOLDER_NAME });
        }
        return rootFolderId;
      }
    } catch {
      // ID no longer valid, fall through
    }
  }

  // Search by current name
  const results = await chrome.bookmarks.search({ title: ROOT_FOLDER_NAME });
  for (const node of results) {
    if (!node.url) {
      await chrome.storage.local.set({ rootFolderId: node.id });
      return node.id;
    }
  }

  // Create new root folder under "Other Bookmarks" (id '2')
  const folder = await chrome.bookmarks.create({ parentId: '2', title: ROOT_FOLDER_NAME });
  await chrome.storage.local.set({ rootFolderId: folder.id });
  return folder.id;
}

// === Title Encoding ===
// Format: "{icon}|{name}|{color}"
// Example: "🎨|Design|#ff7eb3"

export function encodeFolderTitle(icon, name, color) {
  return `${icon}|${name}|${color}`;
}

export function decodeFolderTitle(title) {
  const parts = title.split('|');
  if (parts.length === 3) {
    return { icon: parts[0], name: parts[1], color: parts[2] };
  }
  // Fallback for unformatted folders
  return { icon: '📁', name: title, color: '#7c83ff' };
}

// === Read ===

export async function readCollectionsFromBookmarks(rootId) {
  const children = await chrome.bookmarks.getChildren(rootId);
  const collections = [];

  for (const folder of children) {
    if (folder.url) continue; // Skip bookmarks at root level
    const { icon, name, color } = decodeFolderTitle(folder.title);
    const tabs = await readTabsFromFolder(folder.id);
    collections.push({
      id: folder.id,
      bookmarkId: folder.id,
      name,
      color,
      icon,
      tabs
    });
  }

  return collections;
}

export async function readTabsFromFolder(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  return children
    .filter(c => c.url)
    .map(c => ({
      id: c.id,
      bookmarkId: c.id,
      title: c.title || c.url || 'Untitled',
      url: c.url,
      favicon: `https://www.google.com/s2/favicons?domain=${new URL(c.url).hostname}&sz=32`
    }));
}

// === Write: Collection Operations ===

export async function createBookmarkFolder(rootId, icon, name, color, index) {
  const title = encodeFolderTitle(icon, name, color);
  const opts = { parentId: rootId, title };
  if (index !== undefined) opts.index = index;
  return await chrome.bookmarks.create(opts);
}

export async function updateBookmarkFolder(folderId, icon, name, color) {
  const title = encodeFolderTitle(icon, name, color);
  await chrome.bookmarks.update(folderId, { title });
}

export async function removeBookmarkFolder(folderId) {
  await chrome.bookmarks.removeTree(folderId);
}

// === Write: Tab Operations ===

export async function createBookmarkTab(folderId, title, url, index) {
  const opts = { parentId: folderId, title, url };
  if (index !== undefined) opts.index = index;
  return await chrome.bookmarks.create(opts);
}

export async function removeBookmarkTab(bookmarkId) {
  await chrome.bookmarks.remove(bookmarkId);
}

export async function moveBookmark(bookmarkId, parentId, index) {
  const opts = { parentId };
  if (index !== undefined) opts.index = index;
  await chrome.bookmarks.move(bookmarkId, opts);
}

// === Tree Browsing ===

export async function getBookmarkTree() {
  return await chrome.bookmarks.getTree();
}

// === Reorder ===

export async function reorderBookmarkChildren(parentId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await chrome.bookmarks.move(orderedIds[i], { parentId, index: i });
  }
}
