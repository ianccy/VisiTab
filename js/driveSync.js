async function callBackground(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (!res) throw new Error('Background unavailable');
  if (res.error) throw new Error(res.error);
  return res;
}

export async function push(data, options = {}) {
  return callBackground({ type: 'drive-push', data, options });
}

export async function pull() {
  const res = await callBackground({ type: 'drive-pull' });
  return res.data ?? null;
}

export async function isRemoteNewer(localTimestamp) {
  const res = await callBackground({ type: 'drive-is-remote-newer', localTimestamp });
  return res.newer === true;
}

export async function exists() {
  const res = await callBackground({ type: 'drive-exists' });
  return res.exists === true;
}
