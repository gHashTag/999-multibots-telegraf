import { describe, bench, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import {
  tracksAtom,
  addItemAtom,
  moveItemAtom,
  updateItemAtom,
  deleteItemsAtom,
  splitItemAtom,
} from '../atoms/tracks'
import {
  pastSnapshotsAtom,
  futureSnapshotsAtom,
  recordSnapshotAtom,
  undoAtom,
  redoAtom,
} from '../atoms/history'
import {
  selectedItemIdsAtom,
  selectItemsAtom,
  toggleItemSelectionAtom,
  clearSelectionAtom,
} from '../atoms/selection'
import {
  assetsAtom,
  addAssetAtom,
} from '../atoms/assets'
import { DEFAULT_TRACKS, DEFAULT_ASSETS } from '../defaults'
import type { TrackItem } from '../types'

describe('Performance Benchmarks - Jotai Atoms', () => {
  describe('Track Operations', () => {
    bench('add 100 items sequentially', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)

      const videoTrack = store.get(tracksAtom).find((t) => t.type === 'video')
      if (!videoTrack) return

      for (let i = 0; i < 100; i++) {
        store.set(addItemAtom, {
          trackId: videoTrack.id,
          itemData: {
            type: 'video',
            startFrame: i * 100,
            durationInFrames: 90,
            x: 0,
            y: 0,
            width: 1080,
            height: 1920,
            rotation: 0,
            opacity: 1,
            volume: 0,
            playbackRate: 1,
          },
        })
      }
    })

    bench('move item 1000 times', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)

      // Add an item first
      const videoTrack = store.get(tracksAtom).find((t) => t.type === 'video')
      if (!videoTrack) return

      store.set(addItemAtom, {
        trackId: videoTrack.id,
        itemData: {
          type: 'video',
          startFrame: 0,
          durationInFrames: 90,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 0,
          playbackRate: 1,
        },
      })

      const tracks = store.get(tracksAtom)
      const item = tracks.find((t) => t.type === 'video')?.items[0]
      if (!item) return

      for (let i = 0; i < 1000; i++) {
        store.set(moveItemAtom, {
          itemId: item.id,
          newStartFrame: i,
        })
      }
    })

    bench('update item properties 1000 times', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)

      const videoTrack = store.get(tracksAtom).find((t) => t.type === 'video')
      if (!videoTrack) return

      store.set(addItemAtom, {
        trackId: videoTrack.id,
        itemData: {
          type: 'video',
          startFrame: 0,
          durationInFrames: 90,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
          volume: 0,
          playbackRate: 1,
        },
      })

      const tracks = store.get(tracksAtom)
      const item = tracks.find((t) => t.type === 'video')?.items[0]
      if (!item) return

      for (let i = 0; i < 1000; i++) {
        store.set(updateItemAtom, {
          itemId: item.id,
          updates: { opacity: (i % 100) / 100 },
        })
      }
    })
  })

  describe('History Operations', () => {
    bench('record 50 snapshots + 50 undos', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)
      store.set(assetsAtom, DEFAULT_ASSETS)
      store.set(pastSnapshotsAtom, [])
      store.set(futureSnapshotsAtom, [])

      // Record 50 snapshots
      for (let i = 0; i < 50; i++) {
        store.set(recordSnapshotAtom)
      }

      // Undo 50 times
      for (let i = 0; i < 50; i++) {
        store.set(undoAtom)
      }
    })

    bench('undo/redo cycle 100 times', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)
      store.set(assetsAtom, DEFAULT_ASSETS)
      store.set(pastSnapshotsAtom, [])
      store.set(futureSnapshotsAtom, [])

      // Setup: record some snapshots
      for (let i = 0; i < 10; i++) {
        store.set(recordSnapshotAtom)
      }

      // Undo/redo cycle
      for (let i = 0; i < 100; i++) {
        store.set(undoAtom)
        store.set(redoAtom)
      }
    })
  })

  describe('Selection Operations', () => {
    bench('select/deselect 1000 times', () => {
      const store = createStore()
      store.set(selectedItemIdsAtom, [])

      for (let i = 0; i < 1000; i++) {
        store.set(selectItemsAtom, { itemIds: [`item-${i % 10}`] })
        store.set(clearSelectionAtom)
      }
    })

    bench('toggle selection 1000 times', () => {
      const store = createStore()
      store.set(selectedItemIdsAtom, [])

      for (let i = 0; i < 1000; i++) {
        store.set(toggleItemSelectionAtom, `item-${i % 100}`)
      }
    })

    bench('batch select 100 items', () => {
      const store = createStore()
      store.set(selectedItemIdsAtom, [])

      const itemIds = Array.from({ length: 100 }, (_, i) => `item-${i}`)

      for (let i = 0; i < 100; i++) {
        store.set(selectItemsAtom, { itemIds })
        store.set(clearSelectionAtom)
      }
    })
  })

  describe('Asset Operations', () => {
    bench('add 100 assets', () => {
      const store = createStore()
      store.set(assetsAtom, [])

      for (let i = 0; i < 100; i++) {
        store.set(addAssetAtom, {
          type: 'video',
          name: `Video ${i}`,
          url: `/videos/video-${i}.mp4`,
          duration: 1000 + i * 10,
        })
      }
    })
  })

  describe('Combined Workload', () => {
    bench('realistic editing session (100 operations)', () => {
      const store = createStore()
      store.set(tracksAtom, DEFAULT_TRACKS)
      store.set(assetsAtom, DEFAULT_ASSETS)
      store.set(pastSnapshotsAtom, [])
      store.set(futureSnapshotsAtom, [])
      store.set(selectedItemIdsAtom, [])

      const videoTrack = store.get(tracksAtom).find((t) => t.type === 'video')
      if (!videoTrack) return

      // Simulate editing session
      for (let i = 0; i < 100; i++) {
        // Record snapshot before change
        store.set(recordSnapshotAtom)

        // Add item
        store.set(addItemAtom, {
          trackId: videoTrack.id,
          itemData: {
            type: 'video',
            startFrame: i * 50,
            durationInFrames: 45,
            x: 0,
            y: 0,
            width: 1080,
            height: 1920,
            rotation: 0,
            opacity: 1,
            volume: 0,
            playbackRate: 1,
          },
        })

        // Select it
        const tracks = store.get(tracksAtom)
        const lastItem = tracks.find((t) => t.type === 'video')?.items.at(-1)
        if (lastItem) {
          store.set(selectItemsAtom, { itemIds: [lastItem.id] })
        }

        // Every 10th operation, undo
        if (i % 10 === 0 && i > 0) {
          store.set(undoAtom)
        }
      }
    })
  })
})
