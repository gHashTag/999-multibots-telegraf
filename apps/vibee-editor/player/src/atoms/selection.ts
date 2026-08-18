// ===============================
// Selection Atoms - Re-exports from @vibee/atoms
// with web-specific action overrides
// ===============================

import { atom } from 'jotai';
import type { TrackItem } from '@vibee/atoms';

// ===============================
// Re-export base state atoms from @vibee/atoms
// ===============================
export {
  // State atoms
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
  // Selectors
  hasSelectionAtom,
  isItemSelectedAtom,
  hasClipboardItemsAtom,
  // Basic actions (no web dependencies)
  toggleItemSelectionAtom,
  clearClipboardAtom,
} from '@vibee/atoms';

// Import for use in web-specific atoms
import {
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
} from '@vibee/atoms';

// Need tracksAtom for derived atoms
import { tracksAtom } from './tracks';
import { currentFrameAtom } from './playback';
import { nanoid } from 'nanoid';
import { produce } from 'immer';

// ===============================
// Web-specific action atoms
// These have different signatures or use web-only dependencies
// NOTE: Using `as any` casts to fix SetStateActionWithReset type mismatch
// between @vibee/atoms PrimitiveAtom and local derived atoms
// ===============================

// Action: Select items (matches web API)
export const selectItemsAtom = atom(
  null,
  (get, set, { itemIds, addToSelection = false }: { itemIds: string[]; addToSelection?: boolean }) => {
    if (addToSelection) {
      const current = get(selectedItemIdsAtom);
      const newIds = itemIds.filter((id) => !current.includes(id));
      set(selectedItemIdsAtom as any, [...current, ...newIds]);
    } else {
      set(selectedItemIdsAtom as any, itemIds);
    }
    // Set anchor to first selected item
    if (itemIds.length > 0) {
      set(selectionAnchorAtom as any, itemIds[0]);
    }
  }
);

// Action: Clear selection
export const clearSelectionAtom = atom(
  null,
  (get, set) => {
    set(selectedItemIdsAtom as any, []);
    set(selectionAnchorAtom as any, null);
  }
);

// Action: Copy items to clipboard (web-specific: takes items directly)
export const copyItemsAtom = atom(
  null,
  (get, set, items: TrackItem[]) => {
    set(clipboardAtom as any, items.map((item) => ({
      item: JSON.parse(JSON.stringify(item)),
      trackType: item.type,
    })));
  }
);

// Derived: Get selected items (actual TrackItem objects)
// Note: @vibee/atoms exports this as selectedItemsAtom
export const getSelectedItemsAtom = atom((get) => {
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

// Action: Select all items
// Note: @vibee/atoms exports this as selectAllItemsAtom
export const selectAllAtom = atom(
  null,
  (get, set) => {
    const tracks = get(tracksAtom);
    const allIds: string[] = [];
    for (const track of tracks) {
      for (const item of track.items) {
        allIds.push(item.id);
      }
    }
    set(selectedItemIdsAtom as any, allIds);
  }
);

// Action: Select range (shift+click)
export const selectRangeAtom = atom(
  null,
  (get, set, targetId: string) => {
    const anchor = get(selectionAnchorAtom);
    const tracks = get(tracksAtom);

    if (!anchor) {
      // No anchor - just select this item
      set(selectedItemIdsAtom as any, [targetId]);
      set(selectionAnchorAtom as any, targetId);
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
      set(selectedItemIdsAtom as any, [targetId]);
      set(selectionAnchorAtom as any, targetId);
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

    set(selectedItemIdsAtom as any, rangeIds);
  }
);

// Action: Paste items from clipboard (web-specific: uses currentFrameAtom)
export const pasteItemsAtom = atom(
  null,
  (get, set) => {
    const clipboard = get(clipboardAtom);
    if (clipboard.length === 0) return;

    const currentFrame = get(currentFrameAtom);
    const tracks = get(tracksAtom);
    const newIds: string[] = [];

    // Group clipboard items by track type
    const itemsByType = new Map<string, TrackItem[]>();
    for (const clipItem of clipboard) {
      const type = (clipItem as any).trackType || (clipItem as any).item?.type;
      const item = (clipItem as any).item || clipItem;
      if (!itemsByType.has(type)) {
        itemsByType.set(type, []);
      }
      itemsByType.get(type)!.push(item);
    }

    // Find the earliest start frame in clipboard
    const allItems = Array.from(itemsByType.values()).flat();
    const minStartFrame = Math.min(...allItems.map(i => i.startFrame));

    // Paste to appropriate tracks (cast for atomWithStorage)
    set(tracksAtom, produce(get(tracksAtom), (draft) => {
      for (const [type, items] of itemsByType) {
        // Find matching track
        const track = draft.find(t => t.type === type);
        if (!track) continue;

        for (const item of items) {
          const newId = `item-${nanoid()}`;
          const offset = item.startFrame - minStartFrame;
          const pastedItem = {
            ...JSON.parse(JSON.stringify(item)),
            id: newId,
            trackId: track.id,
            startFrame: currentFrame + offset,
          };
          track.items.push(pastedItem);
          newIds.push(newId);
        }
      }
    }) as any);

    // Select pasted items
    set(selectedItemIdsAtom as any, newIds);
  }
);
