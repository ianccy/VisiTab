import { getToken } from './auth.js';

const FILE_NAME = 'visitab-data.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let cachedFileId = null;

export async function push(data) {
  const token = await getToken();
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

export async function pull() {
  const token = await getToken();
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

export async function isRemoteNewer(localTimestamp) {
  const token = await getToken();
  const fileId = await findFileId(token);
  if (!fileId) return false;

  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=modifiedTime`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return false;

  const { modifiedTime } = await res.json();
  const remoteTime = new Date(modifiedTime).getTime();
  return remoteTime > localTimestamp;
}

// --- Internal ---

async function ensureFileId(token) {
  if (cachedFileId) return cachedFileId;

  // Check local cache
  const { driveFileId } = await chrome.storage.local.get('driveFileId');
  if (driveFileId) {
    cachedFileId = driveFileId;
    return cachedFileId;
  }

  // Search in Drive
  const existingId = await findFileId(token);
  if (existingId) {
    cachedFileId = existingId;
    await chrome.storage.local.set({ driveFileId: cachedFileId });
    return cachedFileId;
  }

  // Create new file
  cachedFileId = await createFile(token);
  await chrome.storage.local.set({ driveFileId: cachedFileId });
  return cachedFileId;
}

async function findFileId(token) {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const { files } = await res.json();
  return files?.length > 0 ? files[0].id : null;
}

async function createFile(token) {
  const metadata = {
    name: FILE_NAME,
    parents: ['appDataFolder']
  };

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
