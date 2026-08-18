// ===============================
// @vibee/atoms - Selection Atom Tests
// Unit tests for selection functionality
// ===============================

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import {
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
  selectedItemsAtom,
  hasSelectionAtom,
  isItemSelectedAtom,
  selectItemsAtom,
  toggleItemSelectionAtom,
  clearSelectionAtom,
  selectAllItemsAtom,
  selectRangeAtom,
  copySelectedAtom,
  pasteItemsAtom,
  cutSelectedAtom,
  clearClipboardAtom,
  hasClipboardItemsAtom,
} from '../selection'
import { tracksAtom } from '../tracks'
import type { Track, TrackItem, ClipboardItem } from '../../types'

// ===============================
// Helper Functions
// ===============================

const createTestTrack = (id: string, items: TrackItem[] = []): Track => ({
  id,
  type: 'video',
  name: `Track ${id}`,
  items,
  locked: false,
  visible: true,
  muted: false,
  solo: false,
})

const createTestItem = (id: string, trackId: string, startFrame: number = 0): TrackItem => ({
  id,
  trackId,
  type: 'video',
  startFrame,
  durationInFrames: 100,
  x: 0,
  y: 0,
  width: 1080,
  height: 1920,
  rotation: 0,
  opacity: 1,
  volume: 1,
  playbackRate: 1,
} as TrackItem)

// ===============================
// Test Suites
// ===============================

describe('selectionAtom', () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    store = createStore()
    // Initialize with test tracks
    store.set(tracksAtom, [
      createTestTrack('track-1', [
        createTestItem('item-1', 'track-1', 0),
        createTestItem('item-2', 'track-1', 100),
        createTestItem('item-3', 'track-1', 200),
      ]),
      createTestTrack('track-2', [
        createTestItem('item-4', 'track-2', 0),
        createTestItem('item-5', 'track-2', 100),
      ]),
    ])
    // Clear selection state
    store.set(selectedItemIdsAtom, [])
    store.set(selectionAnchorAtom, null)
    store.set(clipboardAtom, [])
  })

  // ===============================
  // Initial State Tests
  // ===============================

  describe('Initial State', () => {
    it('should start with empty selection', () => {
      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual([])
    })

    it('should start with no selection anchor', () => {
      const anchor = store.get(selectionAnchorAtom)
      expect(anchor).toBeNull()
    })

    it('should start with empty clipboard', () => {
      const clipboard = store.get(clipboardAtom)
      expect(clipboard).toEqual([])
    })

    it('should report hasSelection as false', () => {
      expect(store.get(hasSelectionAtom)).toBe(false)
    })

    it('should report hasClipboardItems as false', () => {
      expect(store.get(hasClipboardItemsAtom)).toBe(false)
    })
  })

  // ===============================
  // selectItemsAtom Tests
  // ===============================

  describe('selectItemsAtom', () => {
    it('should select single item', () => {
      store.set(selectItemsAtom, { itemIds: ['item-1'] })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-1'])
    })

    it('should select multiple items', () => {
      store.set(selectItemsAtom, { itemIds: ['item-1', 'item-2', 'item-3'] })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-1', 'item-2', 'item-3'])
    })

    it('should replace existing selection by default', () => {
      store.set(selectItemsAtom, { itemIds: ['item-1'] })
      store.set(selectItemsAtom, { itemIds: ['item-2'] })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-2'])
    })

    it('should add to selection when addToSelection is true', () => {
      store.set(selectItemsAtom, { itemIds: ['item-1'] })
      store.set(selectItemsAtom, { itemIds: ['item-2'], addToSelection: true })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-1', 'item-2'])
    })

    it('should not duplicate items when adding to selection', () => {
      store.set(selectItemsAtom, { itemIds: ['item-1', 'item-2'] })
      store.set(selectItemsAtom, { itemIds: ['item-2', 'item-3'], addToSelection: true })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-1', 'item-2', 'item-3'])
    })

    it('should set selection anchor to first item', () => {
      store.set(selectItemsAtom, { itemIds: ['item-2', 'item-3'] })

      const anchor = store.get(selectionAnchorAtom)
      expect(anchor).toBe('item-2')
    })

    it('should not set anchor when selecting empty array', () => {
      store.set(selectionAnchorAtom, 'item-1')
      store.set(selectItemsAtom, { itemIds: [] })

      const anchor = store.get(selectionAnchorAtom)
      expect(anchor).toBe('item-1')
    })

    it('should update hasSelection', () => {
      expect(store.get(hasSelectionAtom)).toBe(false)

      store.set(selectItemsAtom, { itemIds: ['item-1'] })

      expect(store.get(hasSelectionAtom)).toBe(true)
    })
  })

  // ===============================
  // toggleItemSelectionAtom Tests
  // ===============================

  describe('toggleItemSelectionAtom', () => {
    it('should select unselected item', () => {
      store.set(toggleItemSelectionAtom, 'item-1')

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toContain('item-1')
    })

    it('should deselect selected item', () => {
      store.set(selectedItemIdsAtom, ['item-1'])

      store.set(toggleItemSelectionAtom, 'item-1')

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).not.toContain('item-1')
    })

    it('should preserve other selections when toggling', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])

      store.set(toggleItemSelectionAtom, 'item-3')

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-1', 'item-2', 'item-3'])
    })

    it('should set anchor when selecting item', () => {
      store.set(toggleItemSelectionAtom, 'item-2')

      const anchor = store.get(selectionAnchorAtom)
      expect(anchor).toBe('item-2')
    })

    it('should not change anchor when deselecting', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])
      store.set(selectionAnchorAtom, 'item-1')

      store.set(toggleItemSelectionAtom, 'item-2')

      const anchor = store.get(selectionAnchorAtom)
      expect(anchor).toBe('item-1')
    })
  })

  // ===============================
  // clearSelectionAtom Tests
  // ===============================

  describe('clearSelectionAtom', () => {
    it('should clear all selected items', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2', 'item-3'])

      store.set(clearSelectionAtom)

      expect(store.get(selectedItemIdsAtom)).toEqual([])
    })

    it('should clear selection anchor', () => {
      store.set(selectionAnchorAtom, 'item-1')

      store.set(clearSelectionAtom)

      expect(store.get(selectionAnchorAtom)).toBeNull()
    })

    it('should set hasSelection to false', () => {
      store.set(selectedItemIdsAtom, ['item-1'])
      expect(store.get(hasSelectionAtom)).toBe(true)

      store.set(clearSelectionAtom)

      expect(store.get(hasSelectionAtom)).toBe(false)
    })

    it('should not affect clipboard', () => {
      store.set(clipboardAtom, [{ item: createTestItem('item-1', 'track-1'), trackType: 'video' }])

      store.set(clearSelectionAtom)

      expect(store.get(clipboardAtom)).toHaveLength(1)
    })
  })

  // ===============================
  // selectAllItemsAtom Tests
  // ===============================

  describe('selectAllItemsAtom', () => {
    it('should select all items from all tracks', () => {
      store.set(selectAllItemsAtom)

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toHaveLength(5)
      expect(selectedIds).toContain('item-1')
      expect(selectedIds).toContain('item-2')
      expect(selectedIds).toContain('item-3')
      expect(selectedIds).toContain('item-4')
      expect(selectedIds).toContain('item-5')
    })

    it('should work with empty tracks', () => {
      store.set(tracksAtom, [
        createTestTrack('track-empty-1', []),
        createTestTrack('track-empty-2', []),
      ])

      store.set(selectAllItemsAtom)

      expect(store.get(selectedItemIdsAtom)).toEqual([])
    })

    it('should update hasSelection', () => {
      store.set(selectAllItemsAtom)

      expect(store.get(hasSelectionAtom)).toBe(true)
    })
  })

  // ===============================
  // selectedItemsAtom Tests
  // ===============================

  describe('selectedItemsAtom', () => {
    it('should return empty array when nothing selected', () => {
      const items = store.get(selectedItemsAtom)
      expect(items).toEqual([])
    })

    it('should return actual TrackItem objects for selected ids', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-4'])

      const items = store.get(selectedItemsAtom)
      expect(items).toHaveLength(2)
      expect(items[0].id).toBe('item-1')
      expect(items[1].id).toBe('item-4')
    })

    it('should return items from multiple tracks', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-5'])

      const items = store.get(selectedItemsAtom)
      expect(items[0].trackId).toBe('track-1')
      expect(items[1].trackId).toBe('track-2')
    })

    it('should not include non-existent item ids', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'non-existent'])

      const items = store.get(selectedItemsAtom)
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('item-1')
    })
  })

  // ===============================
  // isItemSelectedAtom Tests
  // ===============================

  describe('isItemSelectedAtom', () => {
    it('should return function that checks selection', () => {
      const isSelected = store.get(isItemSelectedAtom)
      expect(typeof isSelected).toBe('function')
    })

    it('should return true for selected item', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])

      const isSelected = store.get(isItemSelectedAtom)
      expect(isSelected('item-1')).toBe(true)
      expect(isSelected('item-2')).toBe(true)
    })

    it('should return false for unselected item', () => {
      store.set(selectedItemIdsAtom, ['item-1'])

      const isSelected = store.get(isItemSelectedAtom)
      expect(isSelected('item-2')).toBe(false)
    })
  })

  // ===============================
  // selectRangeAtom Tests
  // ===============================

  describe('selectRangeAtom', () => {
    it('should select single item when no anchor', () => {
      store.set(selectRangeAtom, 'item-2')

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toEqual(['item-2'])
    })

    it('should set anchor when selecting without existing anchor', () => {
      store.set(selectRangeAtom, 'item-2')

      expect(store.get(selectionAnchorAtom)).toBe('item-2')
    })

    it('should select range between anchor and target', () => {
      // Set anchor at item-1 (frame 0)
      store.set(selectionAnchorAtom, 'item-1')

      // Select range to item-3 (frame 200)
      store.set(selectRangeAtom, 'item-3')

      const selectedIds = store.get(selectedItemIdsAtom)
      // Should include all items between frames 0 and 300 (item-3 end)
      expect(selectedIds).toContain('item-1')
      expect(selectedIds).toContain('item-2')
      expect(selectedIds).toContain('item-3')
    })

    it('should work in reverse direction', () => {
      // Set anchor at item-3 (frame 200)
      store.set(selectionAnchorAtom, 'item-3')

      // Select range to item-1 (frame 0)
      store.set(selectRangeAtom, 'item-1')

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toContain('item-1')
      expect(selectedIds).toContain('item-2')
      expect(selectedIds).toContain('item-3')
    })

    it('should select items on same track only', () => {
      // Items item-1, item-2, item-3 are on track-1
      // Items item-4, item-5 are on track-2
      store.set(selectionAnchorAtom, 'item-1')

      // Try to range select to item on different track
      store.set(selectRangeAtom, 'item-4')

      const selectedIds = store.get(selectedItemIdsAtom)
      // When target is on different track, just select the target
      expect(selectedIds).toEqual(['item-4'])
    })
  })

  // ===============================
  // Clipboard Operations Tests
  // ===============================

  describe('copySelectedAtom', () => {
    it('should copy selected items to clipboard', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])

      store.set(copySelectedAtom)

      const clipboard = store.get(clipboardAtom)
      expect(clipboard).toHaveLength(2)
    })

    it('should include track type in clipboard items', () => {
      store.set(selectedItemIdsAtom, ['item-1'])

      store.set(copySelectedAtom)

      const clipboard = store.get(clipboardAtom)
      expect(clipboard[0].trackType).toBe('video')
    })

    it('should deep clone items', () => {
      store.set(selectedItemIdsAtom, ['item-1'])
      store.set(copySelectedAtom)

      // Modify original
      const tracks = store.get(tracksAtom)
      const item = tracks[0].items[0] as TrackItem
      item.volume = 0.5

      // Clipboard should be unchanged
      const clipboard = store.get(clipboardAtom)
      expect(clipboard[0].item.volume).toBe(1)
    })

    it('should not modify selection after copy', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])
      store.set(copySelectedAtom)

      expect(store.get(selectedItemIdsAtom)).toEqual(['item-1', 'item-2'])
    })

    it('should update hasClipboardItems', () => {
      expect(store.get(hasClipboardItemsAtom)).toBe(false)

      store.set(selectedItemIdsAtom, ['item-1'])
      store.set(copySelectedAtom)

      expect(store.get(hasClipboardItemsAtom)).toBe(true)
    })
  })

  describe('pasteItemsAtom', () => {
    beforeEach(() => {
      // Copy item-1 to clipboard
      store.set(selectedItemIdsAtom, ['item-1'])
      store.set(copySelectedAtom)
    })

    it('should paste items at specified frame', () => {
      store.set(pasteItemsAtom, { atFrame: 500 })

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      const pastedItem = videoTrack?.items.find(i => i.startFrame === 500)

      expect(pastedItem).toBeDefined()
      expect(pastedItem?.durationInFrames).toBe(100)
    })

    it('should generate new ids for pasted items', () => {
      store.set(pasteItemsAtom, { atFrame: 500 })

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      const pastedItem = videoTrack?.items.find(i => i.startFrame === 500)

      expect(pastedItem?.id).not.toBe('item-1')
      expect(pastedItem?.id).toMatch(/^item-/)
    })

    it('should update trackId for pasted items', () => {
      store.set(pasteItemsAtom, { atFrame: 500 })

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      const pastedItem = videoTrack?.items.find(i => i.startFrame === 500)

      expect(pastedItem?.trackId).toBe('track-1')
    })

    it('should select pasted items', () => {
      store.set(pasteItemsAtom, { atFrame: 500 })

      const selectedIds = store.get(selectedItemIdsAtom)
      expect(selectedIds).toHaveLength(1)
      expect(selectedIds[0]).toMatch(/^item-/)
      expect(selectedIds[0]).not.toBe('item-1')
    })

    it('should do nothing when clipboard is empty', () => {
      store.set(clipboardAtom, [])
      const tracksBefore = JSON.stringify(store.get(tracksAtom))

      store.set(pasteItemsAtom, { atFrame: 500 })

      const tracksAfter = JSON.stringify(store.get(tracksAtom))
      expect(tracksAfter).toBe(tracksBefore)
    })

    it('should maintain relative positions for multiple items', () => {
      // Copy items at frame 0 and 100
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])
      store.set(copySelectedAtom)

      store.set(pasteItemsAtom, { atFrame: 500 })

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      const pastedItems = videoTrack?.items.filter(i => i.startFrame >= 500)

      expect(pastedItems).toHaveLength(2)
      // Items should be at 500 and 600 (maintaining 100 frame offset)
      const startFrames = pastedItems?.map(i => i.startFrame).sort((a, b) => a - b)
      expect(startFrames).toEqual([500, 600])
    })
  })

  describe('cutSelectedAtom', () => {
    it('should copy items to clipboard', () => {
      store.set(selectedItemIdsAtom, ['item-1'])

      store.set(cutSelectedAtom)

      const clipboard = store.get(clipboardAtom)
      expect(clipboard).toHaveLength(1)
    })

    it('should delete selected items from tracks', () => {
      store.set(selectedItemIdsAtom, ['item-1'])

      store.set(cutSelectedAtom)

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      const item = videoTrack?.items.find(i => i.id === 'item-1')

      expect(item).toBeUndefined()
    })

    it('should clear selection after cut', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])

      store.set(cutSelectedAtom)

      expect(store.get(selectedItemIdsAtom)).toEqual([])
    })

    it('should cut multiple items', () => {
      store.set(selectedItemIdsAtom, ['item-1', 'item-2'])

      store.set(cutSelectedAtom)

      const clipboard = store.get(clipboardAtom)
      expect(clipboard).toHaveLength(2)

      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      expect(videoTrack?.items.find(i => i.id === 'item-1')).toBeUndefined()
      expect(videoTrack?.items.find(i => i.id === 'item-2')).toBeUndefined()
    })
  })

  describe('clearClipboardAtom', () => {
    it('should clear clipboard', () => {
      store.set(selectedItemIdsAtom, ['item-1'])
      store.set(copySelectedAtom)

      expect(store.get(clipboardAtom).length).toBeGreaterThan(0)

      store.set(clearClipboardAtom)

      expect(store.get(clipboardAtom)).toEqual([])
    })

    it('should set hasClipboardItems to false', () => {
      store.set(selectedItemIdsAtom, ['item-1'])
      store.set(copySelectedAtom)

      expect(store.get(hasClipboardItemsAtom)).toBe(true)

      store.set(clearClipboardAtom)

      expect(store.get(hasClipboardItemsAtom)).toBe(false)
    })
  })

  // ===============================
  // Integration Tests
  // ===============================

  describe('Integration: Selection Workflow', () => {
    it('should handle typical multi-select workflow', () => {
      // Click item-1
      store.set(selectItemsAtom, { itemIds: ['item-1'] })
      expect(store.get(selectedItemIdsAtom)).toEqual(['item-1'])

      // Ctrl+click item-3
      store.set(toggleItemSelectionAtom, 'item-3')
      expect(store.get(selectedItemIdsAtom)).toEqual(['item-1', 'item-3'])

      // Ctrl+click item-1 to deselect
      store.set(toggleItemSelectionAtom, 'item-1')
      expect(store.get(selectedItemIdsAtom)).toEqual(['item-3'])

      // Click item-2 (no modifier)
      store.set(selectItemsAtom, { itemIds: ['item-2'] })
      expect(store.get(selectedItemIdsAtom)).toEqual(['item-2'])
    })

    it('should handle copy-paste workflow', () => {
      // Select and copy
      store.set(selectItemsAtom, { itemIds: ['item-1'] })
      store.set(copySelectedAtom)

      // Paste at new position
      store.set(pasteItemsAtom, { atFrame: 300 })

      // Verify
      const tracks = store.get(tracksAtom)
      const videoTrack = tracks.find(t => t.id === 'track-1')
      expect(videoTrack?.items).toHaveLength(4) // 3 original + 1 pasted

      // Selection should be the pasted item
      expect(store.get(selectedItemIdsAtom)).toHaveLength(1)
    })

    it('should handle cut-paste workflow', () => {
      const initialItemCount = store.get(tracksAtom).find(t => t.id === 'track-1')?.items.length

      // Select and cut
      store.set(selectItemsAtom, { itemIds: ['item-1'] })
      store.set(cutSelectedAtom)

      // Verify item removed
      let videoTrack = store.get(tracksAtom).find(t => t.id === 'track-1')
      expect(videoTrack?.items).toHaveLength(initialItemCount! - 1)

      // Paste
      store.set(pasteItemsAtom, { atFrame: 400 })

      // Verify item added back
      videoTrack = store.get(tracksAtom).find(t => t.id === 'track-1')
      expect(videoTrack?.items).toHaveLength(initialItemCount!)
    })

    it('should handle select all then delete workflow', () => {
      store.set(selectAllItemsAtom)
      expect(store.get(selectedItemIdsAtom)).toHaveLength(5)

      // Simulate delete by cutting without pasting
      store.set(cutSelectedAtom)

      // All items should be in clipboard
      expect(store.get(clipboardAtom)).toHaveLength(5)

      // Tracks should be empty
      const tracks = store.get(tracksAtom)
      const totalItems = tracks.reduce((sum, t) => sum + t.items.length, 0)
      expect(totalItems).toBe(0)
    })
  })
})
