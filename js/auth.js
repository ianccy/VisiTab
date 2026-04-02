const STATUS_CHANGE_LISTENERS = [];

let cachedUser = null;

export async function signIn() {
  const tokenResult = await getTokenInteractive();
  if (!tokenResult.token) {
    throw new Error(tokenResult.error || 'Failed to get auth token');
  }
  const token = tokenResult.token;

  const userInfo = await fetchUserInfo(token);
  cachedUser = {
    email: userInfo.email,
    name: userInfo.name,
    avatar: userInfo.picture
  };
  await chrome.storage.local.set({ authUser: cachedUser });
  notifyListeners();
  return { ...cachedUser, token };
}

export async function switchAccount() {
  // Clear cached tokens to force account picker
  await chrome.runtime.sendMessage({ type: 'remove-auth-token' });
  cachedUser = null;
  await chrome.storage.local.remove('authUser');

  const tokenResult = await getTokenInteractive();
  if (!tokenResult.token) {
    notifyListeners();
    throw new Error(tokenResult.error || 'Failed to get auth token');
  }

  const userInfo = await fetchUserInfo(tokenResult.token);
  cachedUser = {
    email: userInfo.email,
    name: userInfo.name,
    avatar: userInfo.picture
  };
  await chrome.storage.local.set({ authUser: cachedUser });
  notifyListeners();
  return { ...cachedUser, token: tokenResult.token };
}

export async function signOut() {
  const token = await getTokenSilent();
  if (token) {
    await chrome.runtime.sendMessage({ type: 'remove-auth-token', token });
  }
  cachedUser = null;
  await chrome.storage.local.remove('authUser');
  notifyListeners();
}

export async function getStatus() {
  if (cachedUser) return { isSignedIn: true, user: cachedUser };

  const { authUser } = await chrome.storage.local.get('authUser');
  if (!authUser) return { isSignedIn: false, user: null };

  // Verify the token is still valid
  const token = await getTokenSilent();
  if (!token) {
    await chrome.storage.local.remove('authUser');
    return { isSignedIn: false, user: null };
  }

  cachedUser = authUser;
  return { isSignedIn: true, user: cachedUser };
}

export async function getToken() {
  const token = await getTokenSilent();
  if (!token) throw new Error('Not signed in');
  return token;
}

export function onStatusChange(callback) {
  STATUS_CHANGE_LISTENERS.push(callback);
}

// --- Internal ---

async function getTokenInteractive() {
  try {
    // First try with clear cache, then fallback to normal interactive request.
    const first = await chrome.runtime.sendMessage({ type: 'get-auth-token', interactive: true, clearFirst: true });
    if (first?.token) return { token: first.token, error: null };

    const retry = await chrome.runtime.sendMessage({ type: 'get-auth-token', interactive: true, clearFirst: false });
    if (retry?.token) return { token: retry.token, error: null };

    return {
      token: null,
      error: retry?.error || first?.error || 'Failed to get auth token'
    };
  } catch (err) {
    return { token: null, error: err?.message || 'Failed to get auth token' };
  }
}

async function getTokenSilent() {
  const res = await chrome.runtime.sendMessage({ type: 'get-auth-token', interactive: false });
  return res?.token || null;
}

async function fetchUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`UserInfo API error: ${res.status}`);
  return res.json();
}

function notifyListeners() {
  const status = cachedUser
    ? { isSignedIn: true, user: cachedUser }
    : { isSignedIn: false, user: null };
  for (const cb of STATUS_CHANGE_LISTENERS) {
    try { cb(status); } catch {}
  }
}
