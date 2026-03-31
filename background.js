// Notify new tab page when tabs change
chrome.tabs.onCreated.addListener(notifyNewTab);
chrome.tabs.onRemoved.addListener(notifyNewTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.title) {
    notifyNewTab();
  }
});
chrome.tabs.onMoved.addListener(notifyNewTab);
chrome.tabs.onActivated.addListener(notifyNewTab);

function notifyNewTab() {
  chrome.runtime.sendMessage({ type: 'tabs-updated' }).catch(() => {});
}

// === Auth message handler (chrome.identity only available in service worker) ===

const AUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

const FOLDER_NAME = 'VisiTab_Storage';
const FILE_NAME = 'visitab-data.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let cachedFolderId = null;
let cachedFileId = null;
let pushTimer = null;
let queuedPushPayload = null;
let pendingPushResolvers = [];

function getAuthToken(opts) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken(opts, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

async function ensureToken() {
  const token = await getAuthToken({ interactive: false, scopes: AUTH_SCOPES });
  if (!token) throw new Error('Not signed in');
  return token;
}

async function ensureFolderId(token) {
  if (cachedFolderId) return cachedFolderId;

  const { driveFolderId } = await chrome.storage.local.get('driveFolderId');
  if (driveFolderId) {
    cachedFolderId = driveFolderId;
    return cachedFolderId;
  }

  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const { files } = await res.json();
    if (files?.length > 0) {
      cachedFolderId = files[0].id;
      await chrome.storage.local.set({ driveFolderId: cachedFolderId });
      return cachedFolderId;
    }
  }

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!createRes.ok) throw new Error(`Drive create folder failed: ${createRes.status}`);
  const folder = await createRes.json();
  cachedFolderId = folder.id;
  await chrome.storage.local.set({ driveFolderId: cachedFolderId });
  return cachedFolderId;
}

async function findFileId(token) {
  const folderId = await ensureFolderId(token);
  const q = encodeURIComponent(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const { files } = await res.json();
  return files?.length > 0 ? files[0].id : null;
}

async function createFile(token) {
  const folderId = await ensureFolderId(token);
  const metadata = { name: FILE_NAME, parents: [folderId] };
  const initData = {
    version: 1,
    lastModified: Date.now(),
    collections: [],
    uiState: { collapsed: {}, collectionOrder: [] }
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(initData)], { type: 'application/json' }));

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) throw new Error(`Drive create file failed: ${res.status}`);
  const { id } = await res.json();
  return id;
}

async function ensureFileId(token) {
  if (cachedFileId) return cachedFileId;

  const { driveFileId } = await chrome.storage.local.get('driveFileId');
  if (driveFileId) {
    cachedFileId = driveFileId;
    return cachedFileId;
  }

  const existing = await findFileId(token);
  if (existing) {
    cachedFileId = existing;
    await chrome.storage.local.set({ driveFileId: cachedFileId });
    return cachedFileId;
  }

  cachedFileId = await createFile(token);
  await chrome.storage.local.set({ driveFileId: cachedFileId });
  return cachedFileId;
}

async function performDrivePush(data) {
  const token = await ensureToken();
  const fileId = await ensureFileId(token);
  const body = JSON.stringify(data);
  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });
  if (!res.ok) throw new Error(`Drive push failed: ${res.status}`);
}

async function queueDebouncedPush(data, debounceMs) {
  return new Promise((resolve, reject) => {
    queuedPushPayload = data;
    pendingPushResolvers.push({ resolve, reject });

    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      const resolvers = pendingPushResolvers;
      const payload = queuedPushPayload;
      pendingPushResolvers = [];
      queuedPushPayload = null;
      pushTimer = null;

      try {
        await performDrivePush(payload);
        for (const r of resolvers) r.resolve({ success: true });
      } catch (err) {
        for (const r of resolvers) r.reject(err);
      }
    }, debounceMs);
  });
}

async function drivePush(data, opts = {}) {
  const immediate = opts.immediate === true;
  const debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : 3000;
  if (immediate) {
    await performDrivePush(data);
    return { success: true, debounced: false };
  }
  await queueDebouncedPush(data, debounceMs);
  return { success: true, debounced: true };
}

async function drivePull() {
  const token = await ensureToken();
  const fileId = await ensureFileId(token);
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 404) {
      cachedFileId = null;
      await chrome.storage.local.remove('driveFileId');
      return null;
    }
    throw new Error(`Drive pull failed: ${res.status}`);
  }
  return res.json();
}

async function driveExists() {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  return fileId !== null;
}

async function driveIsRemoteNewer(localTimestamp) {
  const token = await ensureToken();
  const fileId = await findFileId(token);
  if (!fileId) return false;

  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=modifiedTime`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return false;
  const { modifiedTime } = await res.json();
  const remoteTime = new Date(modifiedTime).getTime();
  return remoteTime > (localTimestamp || 0);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-auth-token') {
    const opts = { interactive: msg.interactive, scopes: AUTH_SCOPES };

    if (msg.clearFirst) {
      // Clear all cached tokens then request fresh one
      chrome.identity.clearAllCachedAuthTokens(() => {
        chrome.identity.getAuthToken(opts, (token) => {
          if (chrome.runtime.lastError || !token) {
            sendResponse({ token: null, error: chrome.runtime.lastError?.message || 'Failed to get auth token' });
          } else {
            sendResponse({ token });
          }
        });
      });
    } else {
      chrome.identity.getAuthToken(opts, (token) => {
        if (chrome.runtime.lastError || !token) {
          sendResponse({ token: null, error: chrome.runtime.lastError?.message || 'Failed to get auth token' });
        } else {
          sendResponse({ token });
        }
      });
    }
    return true;
  }

  if (msg.type === 'remove-auth-token') {
    chrome.identity.clearAllCachedAuthTokens(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.type === 'drive-push') {
    drivePush(msg.data, msg.options || {})
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-pull') {
    drivePull()
      .then((data) => sendResponse({ data }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-exists') {
    driveExists()
      .then((exists) => sendResponse({ exists }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'drive-is-remote-newer') {
    driveIsRemoteNewer(msg.localTimestamp)
      .then((newer) => sendResponse({ newer }))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }
});
