let dragState = null;
let justDragged = false;
let lastIndicatorKey = null; // track indicator position to avoid re-inserting
let pendingDrop = null; // store the drop target calculated during dragover

export function isDragging() {
  return justDragged;
}

export function initDragDrop(handlers) {
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('drop', (e) => onDrop(e, handlers));
  document.addEventListener('dragend', onDragEnd);
}

function onDragStart(e) {
  const tabItem = e.target.closest('.tab-item');
  const collectionCard = e.target.closest('.collection-card');

  if (tabItem) {
    const type = tabItem.dataset.type;
    dragState = {
      type,
      tabId: tabItem.dataset.tabId,
      collectionId: tabItem.dataset.collectionId || null,
      element: tabItem
    };

    if (type === 'open-tab') {
      dragState.tabUrl = tabItem.dataset.url || '';
      dragState.tabFavicon = tabItem.dataset.favIconUrl || '';
      const titleEl = tabItem.querySelector('.tab-title');
      dragState.tabTitle = titleEl ? titleEl.textContent : '';
    }

    tabItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  } else if (collectionCard) {
    dragState = {
      type: 'collection',
      collectionId: collectionCard.dataset.collectionId,
      element: collectionCard
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    // Delay adding .dragging class so browser captures the drag image first
    requestAnimationFrame(() => {
      collectionCard.classList.add('dragging');
    });
  }
}

function onDragOver(e) {
  if (!dragState) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  if (dragState.type === 'collection') {
    clearDropIndicators();
    handleCollectionDragOver(e);
  } else {
    handleTabDragOver(e);
  }
}

function handleTabDragOver(e) {
  const collectionCard = e.target.closest('.collection-card');
  if (collectionCard) {
    const tabItem = e.target.closest('.tab-item[data-type="collection-tab"]');
    const collectionId = collectionCard.dataset.collectionId;

    collectionCard.classList.add('drag-over');

    if (tabItem && tabItem !== dragState.element) {
      const rect = tabItem.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const before = e.clientY < midY;

      // Calculate target index
      const tabsContainer = collectionCard.querySelector('.collection-tabs');
      const items = [...tabsContainer.querySelectorAll('.tab-item')];
      let toIndex = items.indexOf(tabItem);
      if (!before) toIndex++;

      // Skip if dropping here wouldn't change position
      const fromIndex = items.indexOf(dragState.element);
      if (fromIndex !== -1 && (toIndex === fromIndex || toIndex === fromIndex + 1)) {
        clearDropIndicators();
        lastIndicatorKey = null;
        return;
      }

      const key = tabItem.dataset.tabId + (before ? ':before' : ':after');

      // Only re-insert indicator if position changed
      if (key === lastIndicatorKey) return;
      lastIndicatorKey = key;
      clearDropIndicators();

      pendingDrop = { collectionId, toIndex };

      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';

      if (before) {
        tabItem.before(indicator);
      } else {
        tabItem.after(indicator);
      }
    } else if (!tabItem && !lastIndicatorKey) {
      // Only set drop-at-end when no indicator is currently showing
      // (e.g. dragging into an empty collection)
      pendingDrop = { collectionId, toIndex: -1 };
    }
  }
}

// Find the insert position among collection cards based on mouse Y
// Trigger point is at the section divider line (bottom border of each card)
function findCollectionInsertIndex(e) {
  const container = document.getElementById('collections-list');
  if (!container) return { index: -1 };
  const cards = [...container.querySelectorAll('.collection-card')];
  if (cards.length === 0) return { index: 0 };

  for (let i = 0; i < cards.length; i++) {
    if (cards[i] === dragState.element) continue;
    const rect = cards[i].getBoundingClientRect();
    if (e.clientY < rect.bottom) {
      return { index: i, card: cards[i], before: true };
    }
  }
  // After the last card — find the last non-dragging card
  let lastCard = null;
  for (let i = cards.length - 1; i >= 0; i--) {
    if (cards[i] !== dragState.element) {
      lastCard = cards[i];
      break;
    }
  }
  return { index: cards.length, card: lastCard, before: false };
}

function handleCollectionDragOver(e) {
  const container = document.getElementById('collections-list');
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const inContainer = e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
    e.clientY >= containerRect.top - 50 && e.clientY <= containerRect.bottom + 50;
  if (!inContainer) return;

  const { card, before } = findCollectionInsertIndex(e);
  if (!card || card === dragState.element) return;

  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.style.height = '3px';

  if (before) {
    card.before(indicator);
  } else {
    card.after(indicator);
  }
}

function onDragLeave(e) {
  const collectionCard = e.target.closest('.collection-card');
  if (collectionCard && !collectionCard.contains(e.relatedTarget)) {
    collectionCard.classList.remove('drag-over');
  }
}

function onDrop(e, handlers) {
  if (!dragState) return;
  e.preventDefault();
  clearDropIndicators();

  if (dragState.type === 'collection') {
    handleCollectionDrop(e, handlers);
  } else if (dragState.type === 'open-tab') {
    handleOpenTabDrop(e, handlers);
  } else if (dragState.type === 'collection-tab') {
    handleCollectionTabDrop(e, handlers);
  }
}

function handleCollectionDrop(e, handlers) {
  const container = document.getElementById('collections-list');
  if (!container) return;

  const cards = [...container.querySelectorAll('.collection-card')];
  const fromIndex = cards.findIndex(c => c.dataset.collectionId === dragState.collectionId);
  if (fromIndex === -1) return;

  const { index } = findCollectionInsertIndex(e);
  let toIndex = index === -1 ? cards.length - 1 : index;
  if (toIndex > cards.length - 1) toIndex = cards.length - 1;

  if (fromIndex < toIndex) toIndex--;
  if (fromIndex === toIndex) return;

  handlers.onReorderCollection(fromIndex, toIndex);
}

function handleOpenTabDrop(e, handlers) {
  if (!pendingDrop) return;
  const { collectionId, toIndex } = pendingDrop;
  handlers.onDropOpenTab(dragState.tabId, collectionId, toIndex);
}

function handleCollectionTabDrop(e, handlers) {
  if (!pendingDrop) return;
  const { collectionId: targetCollectionId, toIndex } = pendingDrop;

  if (targetCollectionId === dragState.collectionId) {
    handlers.onReorderTab(dragState.collectionId, dragState.tabId, toIndex);
  } else {
    handlers.onMoveTab(dragState.collectionId, targetCollectionId, dragState.tabId, toIndex);
  }
}

function onDragEnd() {
  clearDropIndicators();
  if (dragState && dragState.element) {
    dragState.element.classList.remove('dragging');
  }
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  dragState = null;
  lastIndicatorKey = null;
  pendingDrop = null;

  justDragged = true;
  setTimeout(() => { justDragged = false; }, 0);
}

function clearDropIndicators() {
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
}
