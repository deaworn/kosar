// Pure helper for drag-and-drop reordering within a list and moving items between lists.

const GROUP_ORDER = { kell: 0, havan: 1, otthon: 2 };

/**
 * Reorders `draggedId` within its list or moves it to `targetListId` at `targetIndex`.
 * Updates `list` and `order` fields on affected items in `itemsMap` and returns
 * `{ changedIds, prevListId, nextListId }`.
 *
 * @param {Record<string, any>} itemsMap
 * @param {string} draggedId
 * @param {string} targetListId
 * @param {number} targetIndex
 * @param {string} [fallbackListId]
 * @returns {{ changedIds: string[], prevListId: string, nextListId: string }}
 */
export function reorderOrMoveItem(itemsMap, draggedId, targetListId, targetIndex, fallbackListId = 'default') {
  const dragged = itemsMap?.[draggedId];
  if (!dragged || !targetListId) {
    return { changedIds: [], prevListId: '', nextListId: '' };
  }

  const prevListId = dragged.list || fallbackListId;
  const nextListId = targetListId;
  const listMoved = prevListId !== nextListId;

  const listItems = Object.values(itemsMap)
    .filter((it) => it && (it.hu || it.de || it.recog) && (it.list || fallbackListId) === nextListId && it.id !== draggedId)
    .sort((a, b) =>
      Number(!!a.done) - Number(!!b.done)
      || (GROUP_ORDER[a.group || 'kell'] - GROUP_ORDER[b.group || 'kell'])
      || ((a.order || 0) - (b.order || 0)));

  const idx = Math.max(0, Math.min(listItems.length, Math.trunc(Number(targetIndex) || 0)));
  if (listMoved) dragged.list = nextListId;
  listItems.splice(idx, 0, dragged);

  const changedIds = [];
  for (let i = 0; i < listItems.length; i++) {
    const it = listItems[i];
    const nextOrder = (i + 1) * 1000;
    const orderChanged = (it.order || 0) !== nextOrder;
    if (orderChanged) it.order = nextOrder;
    if (orderChanged || (it.id === draggedId && listMoved)) {
      changedIds.push(it.id);
    }
  }

  return { changedIds, prevListId, nextListId };
}
