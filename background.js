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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-auth-token') {
    chrome.identity.getAuthToken({ interactive: msg.interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ token: null });
      } else {
        sendResponse({ token });
      }
    });
    return true; // keep channel open for async response
  }

  if (msg.type === 'remove-auth-token') {
    chrome.identity.removeCachedAuthToken({ token: msg.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
