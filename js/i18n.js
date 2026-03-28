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
    rename: '✏️ 重新命名',
    changeColor: '🎨 變更顏色',
    changeIcon: '😀 變更圖示',
    deleteMenu: '🗑️ 刪除',
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
    unlinkMenu: '🔗 取消連結',
    unlinkTitle: '取消連結資料夾',
    unlinkMsg: (name) => `確定要取消連結「${name}」？書籤資料夾不會被刪除。`,
    unlink: '取消連結',
    folderPickerTitle: '選擇書籤資料夾',
    noSubfolders: '沒有子資料夾',
    alreadyLinked: '已連結',
    duplicateTab: '此 Tab 已存在於該 Collection 中',
    bgSettings: '背景設定',
    bgColor: '背景顏色',
    bgImage: '背景圖片',
    bgImageUrl: '輸入圖片網址...',
    bgApply: '套用',
    bgReset: '重置背景',
    bgRemoveImage: '移除圖片',
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
    rename: '✏️ Rename',
    changeColor: '🎨 Change Color',
    changeIcon: '😀 Change Icon',
    deleteMenu: '🗑️ Delete',
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
    unlinkMenu: '🔗 Unlink',
    unlinkTitle: 'Unlink Folder',
    unlinkMsg: (name) => `Unlink "${name}"? The bookmark folder will not be deleted.`,
    unlink: 'Unlink',
    folderPickerTitle: 'Select Bookmark Folder',
    noSubfolders: 'No subfolders',
    alreadyLinked: 'Linked',
    duplicateTab: 'This tab already exists in this collection',
    bgSettings: 'Background',
    bgColor: 'Background Color',
    bgImage: 'Background Image',
    bgImageUrl: 'Enter image URL...',
    bgApply: 'Apply',
    bgReset: 'Reset Background',
    bgRemoveImage: 'Remove Image',
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
