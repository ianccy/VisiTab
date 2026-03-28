// Open new tab when clicking the extension icon
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({});
});

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
