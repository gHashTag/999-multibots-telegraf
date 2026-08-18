// ===============================
// @vibee/atoms - Tracks Atom Tests
// Unit tests for track CRUD operations
// ===============================

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import {
  tracksAtom,
  addTrackAtom,
  removeTrackAtom,
  updateTrackAtom,
  reorderTracksAtom,
  addItemAtom,
  updateItemAtom,
  deleteItemsAtom,
  moveItemAtom,
  resizeItemAtom,
  splitItemAtom,
  duplicateItemsAtom,
  moveItemToTrackAtom,
  rippleDeleteAtom,
  reorderItemsAtom,
  resetTracksAtom,
  videoTrackAtom,
  avatarTrackAtom,
  getTrackByIdAtom,
  getItemByIdAtom,
} from '../tracks'
import type { Track, TrackItem, TrackType } from '../../types'

// ===============================
// Helper Functions
// ===============================

const createTestTrack = (overrides: Partial<Track> = {}): Track => ({
  id: 'track-test',
  type: 'video',
  name: 'Test Track',
  items: [],
  locked: false,
  visible: true,
  muted: false,
  solo: false,
  ...overrides,
})

const createTestItem = (overrides: Partial<TrackItem> = {}): TrackItem => ({
  id: 'item-test',
  trackId: 'track-test',
  type: 'video',
  startFrame: 0,
  durationInFrames: 100,
  x: 0,
  y: 0,
  width: 1080,
  height: 1920,
  rotation: 0,
  opacity: 1,
  volume: 1,
  playbackRate: 1,
  ...overrides,
} as TrackItem)

// ===============================
// Test Suites
// ===============================

describe('tracksAtom', () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    store = createStore()
    // Reset to empty tracks for clean tests
    store.set(tracksAtom, [])
  })

  // ===============================
  // Track CRUD Operations
  // ===============================

  describe('Track CRUD', () => {
    it('should start with empty tracks after reset', () => {
      const tracks = store.get(tracksAtom)
      expect(tracks).toEqual([])
    })

    it('should add a new track', () => {
      store.set(addTrackAtom, { type: 'video', name: 'My Video Track' })

      const tracks = store.get(tracksAtom)
      expect(tracks).toHaveLength(1)
      expect(tracks[0].type).toBe('video')
      expect(tracks[0].name).toBe('My Video Track')
      expect(tracks[0].items).toEqual([])
      expect(tracks[0].locked).toBe(false)
      expect(tracks[0].visible).toBe(true)
    })

    it('should generate default name from track type', () => {
      store.set(addTrackAtom, { type: 'audio' })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].name).toBe('Audio')
    })

    it('should add multiple tracks', () => {
      store.set(addTrackAtom, { type: 'video' })
      store.set(addTrackAtom, { type: 'audio' })
      store.set(addTrackAtom, { type: 'avatar' })

      const tracks = store.get(tracksAtom)
      expect(tracks).toHaveLength(3)
      expect(tracks.map(t => t.type)).toEqual(['video', 'audio', 'avatar'])
    })

    it('should remove a track by id', () => {
      store.set(tracksAtom, [
        createTestTrack({ id: 'track-1', name: 'Track 1' }),
        createTestTrack({ id: 'track-2', name: 'Track 2' }),
        createTestTrack({ id: 'track-3', name: 'Track 3' }),
      ])

      store.set(removeTrackAtom, 'track-2')

      const tracks = store.get(tracksAtom)
      expect(tracks).toHaveLength(2)
      expect(tracks.map(t => t.id)).toEqual(['track-1', 'track-3'])
    })

    it('should not remove non-existent track', () => {
      store.set(tracksAtom, [createTestTrack({ id: 'track-1' })])

      store.set(removeTrackAtom, 'non-existent')

      const tracks = store.get(tracksAtom)
      expect(tracks).toHaveLength(1)
    })

    it('should update track properties', () => {
      store.set(tracksAtom, [createTestTrack({ id: 'track-1', name: 'Original' })])

      store.set(updateTrackAtom, {
        trackId: 'track-1',
        updates: { name: 'Updated Name', locked: true, muted: true },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].name).toBe('Updated Name')
      expect(tracks[0].locked).toBe(true)
      expect(tracks[0].muted).toBe(true)
    })

    it('should reorder tracks', () => {
      store.set(tracksAtom, [
        createTestTrack({ id: 'track-1', name: 'First' }),
        createTestTrack({ id: 'track-2', name: 'Second' }),
        createTestTrack({ id: 'track-3', name: 'Third' }),
      ])

      store.set(reorderTracksAtom, { fromIndex: 0, toIndex: 2 })

      const tracks = store.get(tracksAtom)
      expect(tracks.map(t => t.name)).toEqual(['Second', 'Third', 'First'])
    })

    it('should not reorder when indices are same', () => {
      const originalTracks = [
        createTestTrack({ id: 'track-1', name: 'First' }),
        createTestTrack({ id: 'track-2', name: 'Second' }),
      ]
      store.set(tracksAtom, originalTracks)

      store.set(reorderTracksAtom, { fromIndex: 0, toIndex: 0 })

      const tracks = store.get(tracksAtom)
      expect(tracks.map(t => t.name)).toEqual(['First', 'Second'])
    })
  })

  // ===============================
  // Track Selectors
  // ===============================

  describe('Track Selectors', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({ id: 'track-video', type: 'video', name: 'Video' }),
        createTestTrack({ id: 'track-avatar', type: 'avatar', name: 'Avatar' }),
        createTestTrack({ id: 'track-audio', type: 'audio', name: 'Audio' }),
      ])
    })

    it('should get video track', () => {
      const videoTrack = store.get(videoTrackAtom)
      expect(videoTrack?.id).toBe('track-video')
      expect(videoTrack?.type).toBe('video')
    })

    it('should get avatar track', () => {
      const avatarTrack = store.get(avatarTrackAtom)
      expect(avatarTrack?.id).toBe('track-avatar')
      expect(avatarTrack?.type).toBe('avatar')
    })

    it('should get track by id', () => {
      const getTrack = store.get(getTrackByIdAtom)
      const track = getTrack('track-audio')
      expect(track?.name).toBe('Audio')
    })

    it('should return undefined for non-existent track', () => {
      const getTrack = store.get(getTrackByIdAtom)
      const track = getTrack('non-existent')
      expect(track).toBeUndefined()
    })
  })

  // ===============================
  // Item CRUD Operations
  // ===============================

  describe('addItemAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [createTestTrack({ id: 'track-1' })])
    })

    it('should add item to track', () => {
      store.set(addItemAtom, {
        trackId: 'track-1',
        itemData: {
          type: 'video',
          startFrame: 0,
          durationInFrames: 100,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 1,
          playbackRate: 1,
        },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
      expect(tracks[0].items[0].type).toBe('video')
      expect(tracks[0].items[0].trackId).toBe('track-1')
      expect(tracks[0].items[0].id).toBeDefined()
    })

    it('should add multiple items to track', () => {
      for (let i = 0; i < 3; i++) {
        store.set(addItemAtom, {
          trackId: 'track-1',
          itemData: {
            type: 'video',
            startFrame: i * 100,
            durationInFrames: 50,
            x: 0,
            y: 0,
            width: 1080,
            height: 1920,
            rotation: 0,
            opacity: 1,
            volume: 1,
            playbackRate: 1,
          },
        })
      }

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(3)
    })

    it('should not add item to non-existent track', () => {
      store.set(addItemAtom, {
        trackId: 'non-existent',
        itemData: {
          type: 'video',
          startFrame: 0,
          durationInFrames: 100,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 1,
          playbackRate: 1,
        },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(0)
    })

    it('should return generated item id', () => {
      const id = store.set(addItemAtom, {
        trackId: 'track-1',
        itemData: {
          type: 'video',
          startFrame: 0,
          durationInFrames: 100,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 1,
          playbackRate: 1,
        },
      })

      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id).toMatch(/^item-/)
    })
  })

  describe('deleteItemsAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({ id: 'item-1', startFrame: 0 }),
            createTestItem({ id: 'item-2', startFrame: 100 }),
            createTestItem({ id: 'item-3', startFrame: 200 }),
          ],
        }),
      ])
    })

    it('should delete single item', () => {
      store.set(deleteItemsAtom, ['item-2'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)
      expect(tracks[0].items.map(i => i.id)).toEqual(['item-1', 'item-3'])
    })

    it('should delete multiple items', () => {
      store.set(deleteItemsAtom, ['item-1', 'item-3'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
      expect(tracks[0].items[0].id).toBe('item-2')
    })

    it('should delete all items', () => {
      store.set(deleteItemsAtom, ['item-1', 'item-2', 'item-3'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(0)
    })

    it('should handle deletion of non-existent items', () => {
      store.set(deleteItemsAtom, ['non-existent'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(3)
    })

    it('should delete items across multiple tracks', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1', trackId: 'track-1' })],
        }),
        createTestTrack({
          id: 'track-2',
          items: [createTestItem({ id: 'item-2', trackId: 'track-2' })],
        }),
      ])

      store.set(deleteItemsAtom, ['item-1', 'item-2'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(0)
      expect(tracks[1].items).toHaveLength(0)
    })
  })

  describe('moveItemAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1', startFrame: 100 })],
        }),
      ])
    })

    it('should move item to new position', () => {
      store.set(moveItemAtom, { itemId: 'item-1', newStartFrame: 200 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].startFrame).toBe(200)
    })

    it('should not allow negative start frame', () => {
      store.set(moveItemAtom, { itemId: 'item-1', newStartFrame: -50 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].startFrame).toBe(0)
    })

    it('should snap to interval when snap settings enabled', () => {
      store.set(moveItemAtom, {
        itemId: 'item-1',
        newStartFrame: 47,
        snapSettings: { enabled: true, interval: 30 },
      })

      const tracks = store.get(tracksAtom)
      // 47 / 30 = 1.57, rounds to 2 * 30 = 60
      expect(tracks[0].items[0].startFrame).toBe(60)
    })

    it('should not snap when snap settings disabled', () => {
      store.set(moveItemAtom, {
        itemId: 'item-1',
        newStartFrame: 47,
        snapSettings: { enabled: false, interval: 30 },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].startFrame).toBe(47)
    })

    it('should not affect non-existent item', () => {
      store.set(moveItemAtom, { itemId: 'non-existent', newStartFrame: 500 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].startFrame).toBe(100)
    })
  })

  describe('splitItemAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({
              id: 'item-1',
              startFrame: 0,
              durationInFrames: 100,
            }),
          ],
        }),
      ])
    })

    it('should split item at given frame', () => {
      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 40 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)

      // First part: 0-40 (duration 40)
      expect(tracks[0].items[0].startFrame).toBe(0)
      expect(tracks[0].items[0].durationInFrames).toBe(40)

      // Second part: 40-100 (duration 60)
      expect(tracks[0].items[1].startFrame).toBe(40)
      expect(tracks[0].items[1].durationInFrames).toBe(60)
    })

    it('should not split at start frame', () => {
      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 0 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
    })

    it('should not split at end frame', () => {
      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 100 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
    })

    it('should not split outside item boundaries', () => {
      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 150 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
    })

    it('should generate new id for second part', () => {
      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 50 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].id).toBe('item-1')
      expect(tracks[0].items[1].id).not.toBe('item-1')
      expect(tracks[0].items[1].id).toMatch(/^item-/)
    })

    it('should preserve item properties after split', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({
              id: 'item-1',
              startFrame: 0,
              durationInFrames: 100,
              volume: 0.8,
              opacity: 0.5,
            }),
          ],
        }),
      ])

      store.set(splitItemAtom, { itemId: 'item-1', atFrame: 50 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].volume).toBe(0.8)
      expect(tracks[0].items[0].opacity).toBe(0.5)
      expect(tracks[0].items[1].volume).toBe(0.8)
      expect(tracks[0].items[1].opacity).toBe(0.5)
    })
  })

  describe('duplicateItemsAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({
              id: 'item-1',
              startFrame: 0,
              durationInFrames: 100,
            }),
          ],
        }),
      ])
    })

    it('should duplicate single item', () => {
      const newIds = store.set(duplicateItemsAtom, { itemIds: ['item-1'] })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)
      expect(newIds).toHaveLength(1)
      expect(newIds?.[0]).not.toBe('item-1')
    })

    it('should place duplicate after original with offset', () => {
      // Default fps is 30, so offset is 15 frames (0.5 seconds)
      store.set(duplicateItemsAtom, { itemIds: ['item-1'], fps: 30 })

      const tracks = store.get(tracksAtom)
      const duplicate = tracks[0].items[1]

      // Original ends at frame 100, duplicate starts at 100 + 15 = 115
      expect(duplicate.startFrame).toBe(115)
      expect(duplicate.durationInFrames).toBe(100)
    })

    it('should duplicate multiple items', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({ id: 'item-1', startFrame: 0, durationInFrames: 50 }),
            createTestItem({ id: 'item-2', startFrame: 60, durationInFrames: 50 }),
          ],
        }),
      ])

      const newIds = store.set(duplicateItemsAtom, { itemIds: ['item-1', 'item-2'] })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(4)
      expect(newIds).toHaveLength(2)
    })

    it('should preserve item properties in duplicate', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({
              id: 'item-1',
              startFrame: 0,
              durationInFrames: 100,
              volume: 0.7,
              opacity: 0.9,
            }),
          ],
        }),
      ])

      store.set(duplicateItemsAtom, { itemIds: ['item-1'] })

      const tracks = store.get(tracksAtom)
      const duplicate = tracks[0].items[1]
      expect(duplicate.volume).toBe(0.7)
      expect(duplicate.opacity).toBe(0.9)
    })

    it('should return empty array for non-existent items', () => {
      const newIds = store.set(duplicateItemsAtom, { itemIds: ['non-existent'] })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
      expect(newIds).toHaveLength(0)
    })
  })

  // ===============================
  // Advanced Operations
  // ===============================

  describe('moveItemToTrackAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          type: 'video',
          items: [createTestItem({ id: 'item-1', trackId: 'track-1' })],
        }),
        createTestTrack({
          id: 'track-2',
          type: 'video',
          items: [],
        }),
      ])
    })

    it('should move item between tracks', () => {
      store.set(moveItemToTrackAtom, { itemId: 'item-1', newTrackId: 'track-2' })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(0)
      expect(tracks[1].items).toHaveLength(1)
      expect(tracks[1].items[0].trackId).toBe('track-2')
    })

    it('should not move non-existent item', () => {
      store.set(moveItemToTrackAtom, { itemId: 'non-existent', newTrackId: 'track-2' })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
      expect(tracks[1].items).toHaveLength(0)
    })

    it('should preserve item properties when moving', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1', trackId: 'track-1', volume: 0.5 })],
        }),
        createTestTrack({ id: 'track-2', items: [] }),
      ])

      store.set(moveItemToTrackAtom, { itemId: 'item-1', newTrackId: 'track-2' })

      const tracks = store.get(tracksAtom)
      expect(tracks[1].items[0].volume).toBe(0.5)
    })
  })

  describe('rippleDeleteAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({ id: 'item-1', startFrame: 0, durationInFrames: 50 }),
            createTestItem({ id: 'item-2', startFrame: 50, durationInFrames: 50 }),
            createTestItem({ id: 'item-3', startFrame: 100, durationInFrames: 50 }),
          ],
        }),
      ])
    })

    it('should delete item and shift subsequent items', () => {
      store.set(rippleDeleteAtom, ['item-2'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)

      // item-1 stays at 0
      expect(tracks[0].items[0].startFrame).toBe(0)
      // item-3 shifts back by item-2's duration (50)
      expect(tracks[0].items[1].startFrame).toBe(50)
    })

    it('should delete first item and shift all', () => {
      store.set(rippleDeleteAtom, ['item-1'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)

      // item-2 shifts from 50 to 0
      expect(tracks[0].items[0].startFrame).toBe(0)
      // item-3 shifts from 100 to 50
      expect(tracks[0].items[1].startFrame).toBe(50)
    })

    it('should handle multiple deletions', () => {
      store.set(rippleDeleteAtom, ['item-1', 'item-2'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(1)
      // item-3 shifts back by both deleted items
      expect(tracks[0].items[0].startFrame).toBe(0)
    })

    it('should not shift items before deleted item', () => {
      store.set(rippleDeleteAtom, ['item-3'])

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items).toHaveLength(2)
      expect(tracks[0].items[0].startFrame).toBe(0)
      expect(tracks[0].items[1].startFrame).toBe(50)
    })
  })

  describe('updateItemAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1' })],
        }),
      ])
    })

    it('should update item properties', () => {
      store.set(updateItemAtom, {
        itemId: 'item-1',
        updates: { volume: 0.5, opacity: 0.8 },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].volume).toBe(0.5)
      expect(tracks[0].items[0].opacity).toBe(0.8)
    })

    it('should not affect other items', () => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [
            createTestItem({ id: 'item-1', volume: 1 }),
            createTestItem({ id: 'item-2', volume: 1 }),
          ],
        }),
      ])

      store.set(updateItemAtom, {
        itemId: 'item-1',
        updates: { volume: 0.5 },
      })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].volume).toBe(0.5)
      expect(tracks[0].items[1].volume).toBe(1)
    })
  })

  describe('resizeItemAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1', durationInFrames: 100 })],
        }),
      ])
    })

    it('should resize item duration', () => {
      store.set(resizeItemAtom, { itemId: 'item-1', newDuration: 200 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].durationInFrames).toBe(200)
    })

    it('should not allow duration less than 1', () => {
      store.set(resizeItemAtom, { itemId: 'item-1', newDuration: -10 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].durationInFrames).toBe(1)
    })

    it('should allow minimum duration of 1', () => {
      store.set(resizeItemAtom, { itemId: 'item-1', newDuration: 1 })

      const tracks = store.get(tracksAtom)
      expect(tracks[0].items[0].durationInFrames).toBe(1)
    })
  })

  describe('getItemByIdAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-1',
          items: [createTestItem({ id: 'item-1', trackId: 'track-1' })],
        }),
        createTestTrack({
          id: 'track-2',
          items: [createTestItem({ id: 'item-2', trackId: 'track-2' })],
        }),
      ])
    })

    it('should find item by id across tracks', () => {
      const getItem = store.get(getItemByIdAtom)
      const item = getItem('item-2')
      expect(item?.id).toBe('item-2')
      expect(item?.trackId).toBe('track-2')
    })

    it('should return undefined for non-existent item', () => {
      const getItem = store.get(getItemByIdAtom)
      const item = getItem('non-existent')
      expect(item).toBeUndefined()
    })
  })

  describe('resetTracksAtom', () => {
    it('should reset tracks to default state', () => {
      store.set(tracksAtom, [
        createTestTrack({ id: 'track-1', name: 'Custom Track' }),
      ])

      store.set(resetTracksAtom, { fps: 30, durationInFrames: 825 })

      const tracks = store.get(tracksAtom)
      // Default tracks include avatar, video, voice, audio
      expect(tracks.length).toBeGreaterThanOrEqual(3)
      expect(tracks.find(t => t.type === 'avatar')).toBeDefined()
      expect(tracks.find(t => t.type === 'video')).toBeDefined()
    })
  })

  describe('reorderItemsAtom', () => {
    beforeEach(() => {
      store.set(tracksAtom, [
        createTestTrack({
          id: 'track-video',
          type: 'video',
          items: [
            createTestItem({ id: 'item-1', startFrame: 0, durationInFrames: 100 }),
            createTestItem({ id: 'item-2', startFrame: 150, durationInFrames: 100 }),
            createTestItem({ id: 'item-3', startFrame: 300, durationInFrames: 100 }),
          ],
        }),
      ])
    })

    it('should reorder items within video track', () => {
      store.set(reorderItemsAtom, {
        trackId: 'track-video',
        activeId: 'item-3',
        overId: 'item-1',
        fps: 30,
      })

      const tracks = store.get(tracksAtom)
      const ids = tracks[0].items.map(i => i.id)
      expect(ids[0]).toBe('item-3')
      expect(ids[1]).toBe('item-1')
      expect(ids[2]).toBe('item-2')
    })

    it('should not reorder when same index', () => {
      const originalOrder = store.get(tracksAtom)[0].items.map(i => i.id)

      store.set(reorderItemsAtom, {
        trackId: 'track-video',
        activeId: 'item-1',
        overId: 'item-1',
        fps: 30,
      })

      const newOrder = store.get(tracksAtom)[0].items.map(i => i.id)
      expect(newOrder).toEqual(originalOrder)
    })
  })
})
