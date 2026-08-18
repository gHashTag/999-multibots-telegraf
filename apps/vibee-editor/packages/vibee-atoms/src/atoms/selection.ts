// ===============================
// @vibee/atoms - Selection Atoms
// Single source of truth for Web & Mobile editors
// ===============================

import { atom } from 'jotai';
import type { TrackItem, TrackType, ClipboardItem } from '../types';
import { tracksAtom } from './tracks';

// ===============================
// Selection State
// ===============================

// Selected item IDs
export const selectedItemIdsAtom = atom<string[]>([]);

// Selection anchor for shift+click range selection
export const selectionAnchorAtom = atom<string | null>(null);

// Clipboard for copy/paste
export const clipboardAtom = atom<ClipboardItem[]>([]);

// ===============================
// Selection Selectors
// ===============================

// Get selected items (actual TrackItem objects)
export const selectedItemsAtom = atom((get) => {
  const selectedIds = get(selectedItemIdsAtom);
  const tracks = get(tracksAtom);
  const items: TrackItem[] = [];

  for (const track of tracks) {
    for (const item of track.items) {
      if (selectedIds.includes(item.id)) {
        items.push(item);
      }
    }
  }
  return items;
});

// Check if any items are selected
export const hasSelectionAtom = atom((get) => get(selectedItemIdsAtom).length > 0);

// Check if specific item is selected
export const isItemSelectedAtom = atom((get) => {
  const selectedIds = get(selectedItemIdsAtom);
  return (itemId: string) => selectedIds.includes(itemId);
});

// ===============================
// Selection Actions
// ===============================

let itemCounter = 0;
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${++itemCounter}`;

// Select items (replace or add to selection)
export const selectItemsAtom = atom(
  null,
  (get, set, { itemIds, addToSelection = false }: { itemIds: string[]; addToSelection?: boolean }) => {
    if (addToSelection) {
      const current = get(selectedItemIdsAtom);
      const newIds = itemIds.filter((id) => !current.includes(id));
      set(selectedItemIdsAtom, [...current, ...newIds]);
    } else {
      set(selectedItemIdsAtom, itemIds);
    }
    // Set anchor to first selected item
    if (itemIds.length > 0) {
      set(selectionAnchorAtom, itemIds[0]);
    }
  }
);

// Toggle item selection
export const toggleItemSelectionAtom = atom(
  null,
  (get, set, itemId: string) => {
    const current = get(selectedItemIdsAtom);
    if (current.includes(itemId)) {
      set(selectedItemIdsAtom, current.filter((id) => id !== itemId));
    } else {
      set(selectedItemIdsAtom, [...current, itemId]);
      set(selectionAnchorAtom, itemId);
    }
  }
);

// Clear selection
export const clearSelectionAtom = atom(
  null,
  (_get, set) => {
    set(selectedItemIdsAtom, []);
    set(selectionAnchorAtom, null);
  }
);

// Select all items
export const selectAllItemsAtom = atom(
  null,
  (get, set) => {
    const tracks = get(tracksAtom);
    const allIds: string[] = [];
    for (const track of tracks) {
      for (const item of track.items) {
        allIds.push(item.id);
      }
    }
    set(selectedItemIdsAtom, allIds);
  }
);

// Select range (shift+click)
export const selectRangeAtom = atom(
  null,
  (get, set, targetId: string) => {
    const anchor = get(selectionAnchorAtom);
    const tracks = get(tracksAtom);

    if (!anchor) {
      set(selectedItemIdsAtom, [targetId]);
      set(selectionAnchorAtom, targetId);
      return;
    }

    // Find anchor and target items
    let anchorItem: TrackItem | null = null;
    let targetItem: TrackItem | null = null;
    let anchorTrack: typeof tracks[0] | null = null;

    for (const track of tracks) {
      for (const item of track.items) {
        if (item.id === anchor) {
          anchorItem = item;
          anchorTrack = track;
        }
        if (item.id === targetId) {
          targetItem = item;
        }
      }
    }

    if (!anchorItem || !targetItem || !anchorTrack) {
      set(selectedItemIdsAtom, [targetId]);
      set(selectionAnchorAtom, targetId);
      return;
    }

    // Select all items between anchor and target on the same track
    const startFrame = Math.min(anchorItem.startFrame, targetItem.startFrame);
    const endFrame = Math.max(
      anchorItem.startFrame + anchorItem.durationInFrames,
      targetItem.startFrame + targetItem.durationInFrames
    );

    const rangeIds: string[] = [];
    for (const item of anchorTrack.items) {
      const itemEnd = item.startFrame + item.durationInFrames;
      if (item.startFrame < endFrame && itemEnd > startFrame) {
        rangeIds.push(item.id);
      }
    }

    set(selectedItemIdsAtom, rangeIds);
  }
);

// ===============================
// Clipboard Actions
// ===============================

// Copy selected items to clipboard
export const copySelectedAtom = atom(
  null,
  (get, set) => {
    const selectedItems = get(selectedItemsAtom);
    const tracks = get(tracksAtom);

    const clipboardItems: ClipboardItem[] = selectedItems.map((item) => {
      const track = tracks.find((t) => t.id === item.trackId);
      return {
        item: JSON.parse(JSON.stringify(item)),
        trackType: track?.type || 'video' as TrackType,
      };
    });

    set(clipboardAtom, clipboardItems);
  }
);

// Paste items from clipboard
export const pasteItemsAtom = atom(
  null,
  (get, set, { atFrame }: { atFrame: number }) => {
    const clipboard = get(clipboardAtom);
    if (clipboard.length === 0) return;

    const tracks = get(tracksAtom);
    const newIds: string[] = [];

    // Find the earliest start frame in clipboard
    const minStartFrame = Math.min(...clipboard.map((c) => c.item.startFrame));

    // Group by track type
    const itemsByType = new Map<TrackType, TrackItem[]>();
    for (const clipItem of clipboard) {
      if (!itemsByType.has(clipItem.trackType)) {
        itemsByType.set(clipItem.trackType, []);
      }
      itemsByType.get(clipItem.trackType)!.push(clipItem.item);
    }

    // Paste to appropriate tracks
    const newTracks = tracks.map((track) => {
      const typeItems = itemsByType.get(track.type);
      if (!typeItems) return track;

      const pastedItems = typeItems.map((item) => {
        const newId = generateId('item');
        const offset = item.startFrame - minStartFrame;
        newIds.push(newId);
        return {
          ...JSON.parse(JSON.stringify(item)),
          id: newId,
          trackId: track.id,
          startFrame: atFrame + offset,
        };
      });

      return {
        ...track,
        items: [...track.items, ...pastedItems],
      };
    });

    set(tracksAtom, newTracks);
    set(selectedItemIdsAtom, newIds);
  }
);

// Cut selected items (copy + delete)
export const cutSelectedAtom = atom(
  null,
  (get, set) => {
    // Copy first
    set(copySelectedAtom);

    // Then delete
    const selectedIds = get(selectedItemIdsAtom);
    const tracks = get(tracksAtom);

    set(tracksAtom, tracks.map((track) => ({
      ...track,
      items: track.items.filter((item) => !selectedIds.includes(item.id)),
    })));

    set(selectedItemIdsAtom, []);
  }
);

// Clear clipboard
export const clearClipboardAtom = atom(
  null,
  (_get, set) => {
    set(clipboardAtom, []);
  }
);

// Check if clipboard has items
export const hasClipboardItemsAtom = atom((get) => get(clipboardAtom).length > 0);
