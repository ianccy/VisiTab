import { t } from './i18n.js';
import { isDragging } from './dragdrop.js';

export function renderOpenTabs(container, tabs, onAddClick, onTabClick, onCloseTab) {
  container.innerHTML = '';
  if (tabs.length === 0) {
    container.innerHTML = `<div class="collection-empty">${t('noOpenTabs')}</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab-item';
    el.dataset.tabId = tab.id;
    el.dataset.type = 'open-tab';
    el.dataset.url = tab.url || '';
    el.dataset.favIconUrl = tab.favIconUrl || '';
    el.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || '';
    favicon.onerror = () => { favicon.replaceWith(createFallbackFavicon()); };

    const info = document.createElement('div');
    info.className = 'tab-info';
    info.addEventListener('click', (e) => {
      e.stopPropagation();
      onTabClick(tab.id);
    });

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || 'Untitled';

    const urlEl = document.createElement('span');
    urlEl.className = 'tab-url';
    urlEl.textContent = tab.url || '';
    info.append(title, urlEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'tab-add-btn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAddClick(e, tab);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-remove-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCloseTab(tab.id);
    });

    el.append(handle, favicon, info, addBtn, closeBtn);
    fragment.appendChild(el);
  }
  container.appendChild(fragment);
}

export function renderCollections(container, orderedCollections, handlers) {
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const col of orderedCollections) {
    fragment.appendChild(renderCollectionCard(col, handlers));
  }
  container.appendChild(fragment);
}

function renderCollectionCard(col, handlers) {
  const card = document.createElement('div');
  card.className = 'collection-card';
  card.dataset.collectionId = col.id;
  card.draggable = true;
  // Header
  const header = document.createElement('div');
  header.className = 'collection-header';

  const left = document.createElement('div');
  left.className = 'collection-header-left';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'collection-drag-handle';
  dragHandle.textContent = '⠿';

  const icon = document.createElement('span');
  icon.className = 'collection-icon';
  icon.textContent = col.icon;

  const name = document.createElement('span');
  name.className = 'collection-name';
  name.textContent = col.name;
  name.style.color = col.color;
  if (!col.linked) {
    name.style.cursor = 'text';
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDragging()) return;
      handlers.onRenameClick(col.id);
    });
  }

  const count = document.createElement('span');
  count.className = 'collection-count';
  count.textContent = `(${col.tabs.length})`;

  left.append(dragHandle, icon, name, count);

  if (col.linked) {
    const badge = document.createElement('span');
    badge.className = 'linked-badge';
    badge.textContent = t('alreadyLinked');
    left.appendChild(badge);
  } else {
    const status = col.status || 'local';
    const badge = document.createElement('span');
    if (status === 'cloud') {
      badge.className = 'sync-badge synced';
      badge.textContent = t('syncedBadge');
    } else {
      badge.className = 'sync-badge local';
      badge.textContent = t('localDraftBadge');
    }
    left.appendChild(badge);
  }

  const right = document.createElement('div');
  right.className = 'collection-header-right';

  const openAllBtn = document.createElement('button');
  openAllBtn.className = 'collection-open-all';
  openAllBtn.textContent = t('openAll');
  openAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onOpenAll(col.id);
  });

  const menuBtn = document.createElement('button');
  menuBtn.className = 'collection-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onMenuClick(e, col);
  });

  const toggle = document.createElement('span');
  toggle.className = 'collection-toggle' + (col.collapsed ? '' : ' expanded');
  toggle.textContent = '▶';

  right.append(openAllBtn, menuBtn, toggle);
  header.append(left, right);

  header.addEventListener('click', () => {
    if (isDragging()) return;
    handlers.onToggleCollapse(col.id);
  });

  // Body
  const body = document.createElement('div');
  body.className = 'collection-body' + (col.collapsed ? ' collapsed' : '');

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'collection-tabs';
  tabsContainer.dataset.collectionId = col.id;

  if (col.tabs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'collection-empty';
    empty.textContent = t('dragHere');
    tabsContainer.appendChild(empty);
  } else {
    for (const tab of col.tabs) {
      tabsContainer.appendChild(renderCollectionTab(tab, col.id, handlers));
    }
  }

  body.appendChild(tabsContainer);
  card.append(header, body);
  return card;
}

function renderCollectionTab(tab, collectionId, handlers) {
  const el = document.createElement('div');
  el.className = 'tab-item';
  el.dataset.tabId = tab.id;
  el.dataset.collectionId = collectionId;
  el.dataset.type = 'collection-tab';
  el.draggable = true;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';

  let domain = '';
  let displayUrl = '';
  try {
    const u = new URL(tab.url);
    domain = u.hostname.replace('www.', '');
    displayUrl = domain + u.pathname.replace(/\/$/, '');
  } catch {}

  const favicon = document.createElement('img');
  favicon.className = 'tab-favicon';
  favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  favicon.onerror = () => { favicon.replaceWith(createFallbackFavicon()); };

  const info = document.createElement('div');
  info.className = 'tab-info';
  info.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tab.url) chrome.tabs.create({ url: tab.url });
  });

  const titleRow = document.createElement('div');
  titleRow.className = 'tab-title-row';

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url || 'Untitled';
  title.dataset.tooltip = tab.title || tab.url || 'Untitled';

  const editBtn = document.createElement('button');
  editBtn.className = 'tab-edit-btn';
  editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (handlers.onRenameTab) handlers.onRenameTab(collectionId, tab.id, title);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'tab-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onRemoveTab(collectionId, tab.id);
  });

  titleRow.append(title, editBtn);

  const urlEl = document.createElement('span');
  urlEl.className = 'tab-url';
  urlEl.textContent = displayUrl;
  urlEl.dataset.tooltip = tab.url || '';
  urlEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tab.url) chrome.tabs.create({ url: tab.url });
  });
  info.append(titleRow, urlEl);

  el.append(handle, favicon, info, removeBtn);
  return el;
}

function createFallbackFavicon() {
  const span = document.createElement('span');
  span.className = 'tab-favicon';
  span.textContent = '🌐';
  span.style.display = 'flex';
  span.style.alignItems = 'center';
  span.style.justifyContent = 'center';
  return span;
}

export function renderAddDropdown(anchorEl, collections, onSelect) {
  closeDropdown();
  const dropdown = document.createElement('div');
  dropdown.className = 'add-dropdown';
  dropdown.id = 'active-dropdown';

  for (const col of collections) {
    const item = document.createElement('button');
    item.className = 'add-dropdown-item';

    const dot = document.createElement('span');
    dot.className = 'add-dropdown-color-dot';
    dot.style.background = col.color;

    const label = document.createElement('span');
    label.textContent = `${col.icon} ${col.name}`;

    item.append(dot, label);
    item.addEventListener('click', () => {
      onSelect(col.id);
      closeDropdown();
    });
    dropdown.appendChild(item);
  }

  const rect = anchorEl.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
  document.body.appendChild(dropdown);

  const overlay = document.getElementById('dropdown-overlay');
  overlay.hidden = false;
  overlay.onclick = closeDropdown;
}

export function closeDropdown() {
  const existing = document.getElementById('active-dropdown');
  if (existing) existing.remove();
  const overlay = document.getElementById('dropdown-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.onclick = null;
  }
}

export function renderContextMenu(anchorEl, items) {
  closeDropdown();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'active-dropdown';

  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      closeDropdown();
      item.action();
    });
    menu.appendChild(btn);
  }

  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  const overlay = document.getElementById('dropdown-overlay');
  overlay.hidden = false;
  overlay.onclick = closeDropdown;
}

export function renderColorPicker(_container, currentColor, colors, onSelect) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const panel = document.createElement('div');
  panel.className = 'picker-panel';

  const picker = document.createElement('div');
  picker.className = 'color-picker';
  for (const color of colors) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === currentColor ? ' active' : '');
    swatch.style.background = color;
    if (color === '#ffffff') {
      swatch.style.border = '2px solid #ccc';
    }
    swatch.addEventListener('click', () => {
      backdrop.remove();
      onSelect(color);
    });
    picker.appendChild(swatch);
  }

  const customRow = document.createElement('div');
  customRow.className = 'color-custom-row';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-custom-input';
  colorInput.value = currentColor || '#7c83ff';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'modal-btn primary';
  applyBtn.textContent = t('confirm');
  applyBtn.addEventListener('click', () => {
    backdrop.remove();
    onSelect(colorInput.value);
  });
  customRow.append(colorInput, applyBtn);

  panel.append(picker, customRow);
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

export function renderIconPicker(_container, currentIcon, icons, onSelect) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const panel = document.createElement('div');
  panel.className = 'picker-panel';

  const picker = document.createElement('div');
  picker.className = 'icon-picker';
  for (const ic of icons) {
    const opt = document.createElement('div');
    opt.className = 'icon-option' + (ic === currentIcon ? ' active' : '');
    opt.textContent = ic;
    opt.addEventListener('click', () => {
      backdrop.remove();
      onSelect(ic);
    });
    picker.appendChild(opt);
  }

  const customRow = document.createElement('div');
  customRow.className = 'icon-custom-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'icon-custom-input';
  input.placeholder = t('emojiPlaceholder');
  input.maxLength = 2;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn primary';
  confirmBtn.textContent = t('confirm');
  confirmBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) {
      backdrop.remove();
      onSelect(val);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (val) {
        backdrop.remove();
        onSelect(val);
      }
    }
  });

  customRow.append(input, confirmBtn);
  panel.append(picker, customRow);
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

export function renderModal(title, message, buttons) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const p = document.createElement('p');
  p.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  for (const btn of buttons) {
    const b = document.createElement('button');
    b.className = `modal-btn ${btn.style || 'secondary'}`;
    b.textContent = btn.label;
    b.addEventListener('click', () => {
      backdrop.remove();
      if (btn.action) btn.action();
    });
    actions.appendChild(b);
  }

  modal.append(h3, p, actions);
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const lastBtn = buttons[buttons.length - 1];
  const firstBtn = buttons[0];
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      backdrop.remove();
      if (firstBtn && !firstBtn.action) { /* secondary/cancel, no action needed */ }
      document.removeEventListener('keydown', onKeyDown);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      backdrop.remove();
      if (lastBtn?.action) lastBtn.action();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  document.body.appendChild(backdrop);
}

export function renderFolderPicker(tree, excludeId, linkedIds, onSelect) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal folder-picker-modal';

  const h3 = document.createElement('h3');
  h3.textContent = t('folderPickerTitle');

  const container = document.createElement('div');
  container.className = 'folder-picker';

  const excludeSet = new Set([excludeId, ...linkedIds]);

  function buildFolderTree(node, depth, parentEl) {
    const subfolders = (node.children || []).filter(c => !c.url);
    for (const child of subfolders) {
      const isExcluded = excludeSet.has(child.id);
      const childSubfolders = (child.children || []).filter(c => !c.url);
      const hasSubfolders = childSubfolders.length > 0;

      const wrapper = document.createElement('div');

      const row = document.createElement('div');
      row.className = 'folder-picker-node' + (isExcluded ? ' disabled' : '');
      row.style.paddingLeft = `${depth * 20 + 12}px`;

      const arrow = document.createElement('span');
      arrow.className = 'folder-picker-toggle';
      arrow.textContent = hasSubfolders ? '▶' : '';

      const icon = document.createElement('span');
      icon.textContent = '📁';
      icon.style.marginRight = '6px';

      const label = document.createElement('span');
      label.className = 'folder-picker-name';
      label.textContent = child.title || '(untitled)';

      const bookmarkCount = (child.children || []).filter(c => c.url).length;
      const countEl = document.createElement('span');
      countEl.className = 'folder-picker-count';
      countEl.textContent = bookmarkCount > 0 ? `${bookmarkCount}` : '';

      row.append(arrow, icon, label, countEl);

      if (isExcluded) {
        const linkedTag = document.createElement('span');
        linkedTag.className = 'linked-badge';
        linkedTag.textContent = t('alreadyLinked');
        row.appendChild(linkedTag);
      } else {
        row.addEventListener('click', () => {
          onSelect(child.id, child.title);
          backdrop.remove();
        });
      }

      wrapper.appendChild(row);

      if (hasSubfolders) {
        const childrenEl = document.createElement('div');
        childrenEl.hidden = true;
        buildFolderTree(child, depth + 1, childrenEl);
        wrapper.appendChild(childrenEl);

        arrow.style.cursor = 'pointer';
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          childrenEl.hidden = !childrenEl.hidden;
          arrow.textContent = childrenEl.hidden ? '▶' : '▼';
        });
      }

      parentEl.appendChild(wrapper);
    }
  }

  // tree[0] is root, children are "Bookmarks Bar", "Other Bookmarks", etc.
  if (tree[0]?.children) {
    for (const topLevel of tree[0].children) {
      // Show top-level nodes expanded
      const subfolders = (topLevel.children || []).filter(c => !c.url);
      if (subfolders.length === 0 && (topLevel.children || []).filter(c => c.url).length === 0) continue;

      const isExcluded = excludeSet.has(topLevel.id);

      const wrapper = document.createElement('div');
      const row = document.createElement('div');
      row.className = 'folder-picker-node' + (isExcluded ? ' disabled' : '');
      row.style.paddingLeft = '12px';
      row.style.fontWeight = '600';

      const arrow = document.createElement('span');
      arrow.className = 'folder-picker-toggle';
      arrow.textContent = subfolders.length > 0 ? '▼' : '';

      const icon = document.createElement('span');
      icon.textContent = '📁';
      icon.style.marginRight = '6px';

      const label = document.createElement('span');
      label.className = 'folder-picker-name';
      label.textContent = topLevel.title || '(untitled)';

      const bookmarkCount = (topLevel.children || []).filter(c => c.url).length;
      const countEl = document.createElement('span');
      countEl.className = 'folder-picker-count';
      countEl.textContent = bookmarkCount > 0 ? `${bookmarkCount}` : '';

      row.append(arrow, icon, label, countEl);

      if (isExcluded) {
        const linkedTag = document.createElement('span');
        linkedTag.className = 'linked-badge';
        linkedTag.textContent = t('alreadyLinked');
        row.appendChild(linkedTag);
      } else {
        row.addEventListener('click', () => {
          onSelect(topLevel.id, topLevel.title);
          backdrop.remove();
        });
      }

      wrapper.appendChild(row);

      if (subfolders.length > 0) {
        const childrenEl = document.createElement('div');
        buildFolderTree(topLevel, 1, childrenEl);
        wrapper.appendChild(childrenEl);

        arrow.style.cursor = 'pointer';
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          childrenEl.hidden = !childrenEl.hidden;
          arrow.textContent = childrenEl.hidden ? '▶' : '▼';
        });
      }

      container.appendChild(wrapper);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn secondary';
  cancelBtn.textContent = t('cancel');
  cancelBtn.addEventListener('click', () => backdrop.remove());
  actions.appendChild(cancelBtn);

  modal.append(h3, container, actions);
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

export function renderMigrationModal(collections, onConfirm, onCancel, options = {}) {
  const titleKey = options.titleKey || 'migrationTitle';
  const messageKey = options.messageKey || 'migrationMsg';
  const confirmKey = options.confirmKey || 'migrationConfirm';
  const cancelKey = options.cancelKey || 'migrationCancel';
  const showKeepOption = options.showKeepOption === true;
  const warningKey = options.warningKey || (!showKeepOption ? 'migrationWarning' : null);
  const backdropCancel = options.backdropCancel === true;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const h3 = document.createElement('h3');
  h3.textContent = t(titleKey);

  const p = document.createElement('p');
  p.textContent = t(messageKey, collections.length);

  let warningEl = null;
  if (warningKey) {
    warningEl = document.createElement('div');
    warningEl.className = 'migration-warning';
    warningEl.textContent = t(warningKey);
  }

  // Select all controls
  const selectAllRow = document.createElement('div');
  selectAllRow.className = 'migration-select-all';

  const syncInputs = [];
  const keepInputs = [];

  const selectAllSyncLabel = document.createElement('label');
  selectAllSyncLabel.className = 'migration-check';
  const selectAllSyncInput = document.createElement('input');
  selectAllSyncInput.type = 'checkbox';
  selectAllSyncInput.checked = true;
  const selectAllSyncText = document.createElement('span');
  selectAllSyncText.textContent = t('selectAllSync');
  selectAllSyncLabel.append(selectAllSyncInput, selectAllSyncText);
  selectAllRow.appendChild(selectAllSyncLabel);

  if (showKeepOption) {
    const selectAllKeepLabel = document.createElement('label');
    selectAllKeepLabel.className = 'migration-check';
    const selectAllKeepInput = document.createElement('input');
    selectAllKeepInput.type = 'checkbox';
    selectAllKeepInput.checked = true;
    const selectAllKeepText = document.createElement('span');
    selectAllKeepText.textContent = t('selectAllKeep');
    selectAllKeepLabel.append(selectAllKeepInput, selectAllKeepText);
    selectAllRow.appendChild(selectAllKeepLabel);

    selectAllKeepInput.addEventListener('change', () => {
      for (const cb of keepInputs) {
        cb.checked = selectAllKeepInput.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });
  }

  selectAllSyncInput.addEventListener('change', () => {
    for (const cb of syncInputs) {
      cb.checked = selectAllSyncInput.checked;
      cb.dispatchEvent(new Event('change'));
    }
  });

  const list = document.createElement('ul');
  list.className = 'migration-list';

  const selections = new Map();
  for (const col of collections) {
    selections.set(col.id, { collectionId: col.id, sync: true, keep: !showKeepOption ? false : true });

    const li = document.createElement('li');
    li.className = 'migration-item';

    const info = document.createElement('div');
    info.className = 'migration-item-info';
    info.textContent = `${col.icon} ${col.name} (${col.tabs.length} tabs)`;

    const controls = document.createElement('div');
    controls.className = 'migration-item-controls';

    const syncLabel = document.createElement('label');
    syncLabel.className = 'migration-check';
    const syncInput = document.createElement('input');
    syncInput.type = 'checkbox';
    syncInput.checked = true;
    const syncText = document.createElement('span');
    syncText.textContent = t('migrationOptionSync');
    syncInput.addEventListener('change', () => {
      const s = selections.get(col.id);
      selections.set(col.id, { ...s, sync: syncInput.checked });
    });
    syncLabel.append(syncInput, syncText);
    syncInputs.push(syncInput);

    controls.append(syncLabel);

    if (showKeepOption) {
      const keepLabel = document.createElement('label');
      keepLabel.className = 'migration-check';
      const keepInput = document.createElement('input');
      keepInput.type = 'checkbox';
      keepInput.checked = true;
      const keepText = document.createElement('span');
      keepText.textContent = t('migrationOptionKeep');
      keepInput.addEventListener('change', () => {
        const s = selections.get(col.id);
        selections.set(col.id, { ...s, keep: keepInput.checked });
      });
      keepLabel.append(keepInput, keepText);
      controls.append(keepLabel);
      keepInputs.push(keepInput);
    }

    li.append(info, controls);
    list.appendChild(li);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn secondary';
  cancelBtn.textContent = t(cancelKey);
  cancelBtn.addEventListener('click', () => {
    backdrop.remove();
    if (onCancel) onCancel();
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn primary';
  confirmBtn.textContent = t(confirmKey);
  confirmBtn.addEventListener('click', () => {
    backdrop.remove();
    onConfirm(Array.from(selections.values()));
  });

  actions.append(cancelBtn, confirmBtn);
  if (warningEl) {
    modal.append(h3, p, warningEl, selectAllRow, list, actions);
  } else {
    modal.append(h3, p, selectAllRow, list, actions);
  }
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      if (backdropCancel && onCancel) onCancel();
    }
  });
  document.body.appendChild(backdrop);
}

export function flashElement(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}
