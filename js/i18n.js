const messages = {
  'zh-TW': {
    headerTitle: 'VisiTab',
    import: '匯入',
    export: '匯出',
    searchPlaceholder: '搜尋所有 tabs...',
    openTabsLabel: '開啟中的 Tabs',
    collectionsLabel: 'Collections',
    addCollection: '+ 新增 Collection',
    noOpenTabs: '沒有開啟的 tab',
    addBtn: '+ 加入',
    openAll: '全部開啟',
    dragHere: '拖拉 tab 到這裡',
    newCollection: '新分類',
    noCollectionTitle: '沒有 Collection',
    noCollectionMsg: '請先建立一個 Collection',
    confirm: '確定',
    cancel: '取消',
    deleteTitle: '刪除 Collection',
    deleteMsg: (name) => `確定要刪除「${name}」？此操作無法復原。`,
    delete: '刪除',
    rename: '重新命名',
    changeColor: '變更顏色',
    changeIcon: '變更圖示',
    deleteMenu: '刪除',
    emojiPlaceholder: '輸入 emoji...',
    importFailed: '匯入失敗',
    jsonError: 'JSON 格式錯誤',
    importTitle: '匯入資料',
    importMsg: '請選擇匯入方式',
    merge: '合併',
    overwrite: '覆蓋',
    language: '語言',
    loadError: (msg) => `無法載入資料：${msg}`,
    saveError: (msg) => `無法儲存 UI 狀態：${msg}`,
    linkFolder: '🔗 連結書籤資料夾',
    unlinkMenu: '取消連結',
    unlinkTitle: '取消連結資料夾',
    unlinkMsg: (name) => `確定要取消連結「${name}」？書籤資料夾不會被刪除。`,
    unlink: '取消連結',
    folderPickerTitle: '選擇書籤資料夾',
    noSubfolders: '沒有子資料夾',
    alreadyLinked: '已連結',
    duplicateTab: '已存在',
    bgSettings: '背景設定',
    bgColor: '背景顏色',
    bgImage: '背景圖片',
    bgImageUrl: '輸入圖片網址...',
    bgApply: '套用',
    bgReset: '重置背景',
    bgRemoveImage: '移除圖片',
    popupOpenVisiTab: '打開 VisiTab',
    popupDisabledMsg: '無法加入 VisiTab 自身頁面',
    popupAlreadyAdded: '已加入',
    popupAddToCollection: '加入此 Collection',
    // Auth & Sync
    signIn: '登入 Google',
    signOut: '登出',
    syncStatus: '已同步',
    syncing: '同步中...',
    syncFailed: '同步失敗',
    syncRetry: '重試',
    lastSync: (time) => `上次同步：${time}`,
    justNow: '剛剛',
    minutesAgo: (n) => `${n} 分鐘前`,
    // Migration
    migrationTitle: '搬移到 Google 雲端硬碟？',
    migrationMsg: (n) => `偵測到 ${n} 個本地 Collections。搬移後將從 Chrome 書籤中刪除這些資料夾，改由雲端硬碟儲存與同步。已連結的書籤資料夾不受影響。`,
    migrationConfirm: '搬移到雲端',
    migrationCancel: '暫時保留',
    migrationProgress: '搬移中...',
    migrationSuccess: '搬移完成',
    migrationError: '搬移失敗，請稍後再試',
    // Cloud settings
    cloudSyncSection: '雲端同步',
    cloudAccount: '帳號',
    migrateToCloud: '將本地 Collections 搬移到雲端',
    // Bookmark export
    addToBookmarks: '加到 Chrome 書籤',
    exportToBookmarkFolder: '轉存為書籤資料夾',
    bookmarkAdded: '已加入書籤',
    bookmarkFolderCreated: (name, count) => `已建立書籤資料夾「${name}」(${count} 個書籤)`,
  },
  en: {
    headerTitle: 'VisiTab',
    import: 'Import',
    export: 'Export',
    searchPlaceholder: 'Search all tabs...',
    openTabsLabel: 'Open Tabs',
    collectionsLabel: 'Collections',
    addCollection: '+ New Collection',
    noOpenTabs: 'No open tabs',
    addBtn: '+ Add',
    openAll: 'Open All',
    dragHere: 'Drag tabs here',
    newCollection: 'New Collection',
    noCollectionTitle: 'No Collection',
    noCollectionMsg: 'Please create a collection first',
    confirm: 'OK',
    cancel: 'Cancel',
    deleteTitle: 'Delete Collection',
    deleteMsg: (name) => `Are you sure you want to delete "${name}"? This cannot be undone.`,
    delete: 'Delete',
    rename: 'Rename',
    changeColor: 'Change Color',
    changeIcon: 'Change Icon',
    deleteMenu: 'Delete',
    emojiPlaceholder: 'Enter emoji...',
    importFailed: 'Import Failed',
    jsonError: 'Invalid JSON format',
    importTitle: 'Import Data',
    importMsg: 'Choose import method',
    merge: 'Merge',
    overwrite: 'Overwrite',
    language: 'Language',
    loadError: (msg) => `Failed to load data: ${msg}`,
    saveError: (msg) => `Failed to save UI state: ${msg}`,
    linkFolder: '🔗 Link Bookmark Folder',
    unlinkMenu: 'Unlink',
    unlinkTitle: 'Unlink Folder',
    unlinkMsg: (name) => `Unlink "${name}"? The bookmark folder will not be deleted.`,
    unlink: 'Unlink',
    folderPickerTitle: 'Select Bookmark Folder',
    noSubfolders: 'No subfolders',
    alreadyLinked: 'Linked',
    duplicateTab: 'Exists',
    bgSettings: 'Background',
    bgColor: 'Background Color',
    bgImage: 'Background Image',
    bgImageUrl: 'Enter image URL...',
    bgApply: 'Apply',
    bgReset: 'Reset Background',
    bgRemoveImage: 'Remove Image',
    popupOpenVisiTab: 'Open VisiTab',
    popupDisabledMsg: 'Cannot add VisiTab page itself',
    popupAlreadyAdded: 'Added',
    popupAddToCollection: 'Add to Collection',
    // Auth & Sync
    signIn: 'Sign in with Google',
    signOut: 'Sign Out',
    syncStatus: 'Synced',
    syncing: 'Syncing...',
    syncFailed: 'Sync Failed',
    syncRetry: 'Retry',
    lastSync: (time) => `Last sync: ${time}`,
    justNow: 'just now',
    minutesAgo: (n) => `${n} min ago`,
    // Migration
    migrationTitle: 'Move to Google Drive?',
    migrationMsg: (n) => `Found ${n} local collections. They will be moved to Google Drive and removed from Chrome bookmarks. Linked bookmark folders are not affected.`,
    migrationConfirm: 'Move to Drive',
    migrationCancel: 'Not Now',
    migrationProgress: 'Moving...',
    migrationSuccess: 'Migration complete',
    migrationError: 'Migration failed, please try again',
    // Cloud settings
    cloudSyncSection: 'Cloud Sync',
    cloudAccount: 'Account',
    migrateToCloud: 'Move local collections to Drive',
    // Bookmark export
    addToBookmarks: 'Add to Chrome Bookmarks',
    exportToBookmarkFolder: 'Export as Bookmark Folder',
    bookmarkAdded: 'Bookmark added',
    bookmarkFolderCreated: (name, count) => `Created bookmark folder "${name}" (${count} bookmarks)`,
  }
};

let currentLang = 'zh-TW';

export function t(key, ...args) {
  const msg = messages[currentLang]?.[key] ?? messages['zh-TW']?.[key] ?? key;
  return typeof msg === 'function' ? msg(...args) : msg;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (messages[lang]) {
    currentLang = lang;
  }
}

export async function loadLang() {
  const { lang } = await chrome.storage.local.get('lang');
  if (lang && messages[lang]) {
    currentLang = lang;
  }
}

export async function saveLang(lang) {
  if (messages[lang]) {
    currentLang = lang;
    await chrome.storage.local.set({ lang });
  }
}

export function getAvailableLangs() {
  return [
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en', label: 'English' }
  ];
}
