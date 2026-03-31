const STATUS_CHANGE_LISTENERS = [];

let cachedUser = null;

export async function signIn() {
  const token = await getTokenInteractive();
  if (!token) throw new Error('Failed to get auth token');

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

export async function signOut() {
  const token = await getTokenSilent();
  if (token) {
    await chrome.identity.removeCachedAuthToken({ token });
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

function getTokenInteractive() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

function getTokenSilent() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
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
