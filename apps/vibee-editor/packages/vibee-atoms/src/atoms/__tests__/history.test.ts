// ===============================
// @vibee/atoms - History Atom Tests
// Unit tests for undo/redo functionality
// ===============================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createStore } from 'jotai'
import {
  pastSnapshotsAtom,
  futureSnapshotsAtom,
  isApplyingHistoryAtom,
  canUndoAtom,
  canRedoAtom,
  historyLengthAtom,
  recordSnapshotAtom,
  undoAtom,
  redoAtom,
  clearHistoryAtom,
  initHistoryAtom,
  HistorySnapshot,
} from '../history'
import { tracksAtom } from '../tracks'
import { assetsAtom } from '../assets'
import type { Track, Asset } from '../../types'

// ===============================
// Helper Functions
// ===============================

const createTestTrack = (id: string, name: string): Track => ({
  id,
  type: 'video',
  name,
  items: [],
  locked: false,
  visible: true,
  muted: false,
  solo: false,
})

const createTestAsset = (id: string, name: string): Asset => ({
  id,
  type: 'video',
  name,
  url: `/test/${id}.mp4`,
})

// ===============================
// Test Suites
// ===============================

describe('historyAtom', () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    vi.useFakeTimers()
    store = createStore()
    // Initialize with clean state
    store.set(tracksAtom, [createTestTrack('track-1', 'Initial Track')])
    store.set(assetsAtom, [createTestAsset('asset-1', 'Initial Asset')])
    store.set(pastSnapshotsAtom, [])
    store.set(futureSnapshotsAtom, [])
    store.set(isApplyingHistoryAtom, false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===============================
  // Initial State Tests
  // ===============================

  describe('Initial State', () => {
    it('should start with empty past snapshots', () => {
      const past = store.get(pastSnapshotsAtom)
      expect(past).toEqual([])
    })

    it('should start with empty future snapshots', () => {
      const future = store.get(futureSnapshotsAtom)
      expect(future).toEqual([])
    })

    it('should start with isApplyingHistory as false', () => {
      const isApplying = store.get(isApplyingHistoryAtom)
      expect(isApplying).toBe(false)
    })

    it('should report cannot undo initially', () => {
      const canUndo = store.get(canUndoAtom)
      expect(canUndo).toBe(false)
    })

    it('should report cannot redo initially', () => {
      const canRedo = store.get(canRedoAtom)
      expect(canRedo).toBe(false)
    })

    it('should report history length of 0', () => {
      const length = store.get(historyLengthAtom)
      expect(length).toEqual({ past: 0, future: 0 })
    })
  })

  // ===============================
  // recordSnapshotAtom Tests
  // ===============================

  describe('recordSnapshotAtom', () => {
    it('should record current state as snapshot', () => {
      store.set(recordSnapshotAtom)

      const past = store.get(pastSnapshotsAtom)
      expect(past).toHaveLength(1)
      expect(past[0].tracks).toHaveLength(1)
      expect(past[0].tracks[0].name).toBe('Initial Track')
    })

    it('should record multiple snapshots', () => {
      store.set(recordSnapshotAtom)

      store.set(tracksAtom, [createTestTrack('track-2', 'Second Track')])
      store.set(recordSnapshotAtom)

      const past = store.get(pastSnapshotsAtom)
      expect(past).toHaveLength(2)
    })

    it('should not record duplicate consecutive snapshots', () => {
      store.set(recordSnapshotAtom)
      store.set(recordSnapshotAtom) // Same state, should be skipped

      const past = store.get(pastSnapshotsAtom)
      expect(past).toHaveLength(1)
    })

    it('should clear future when recording new snapshot', () => {
      // Setup: Record, undo, then record new
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Second')])
      store.set(recordSnapshotAtom)

      store.set(undoAtom)
      vi.advanceTimersByTime(150) // Wait for isApplyingHistory to reset

      expect(store.get(futureSnapshotsAtom)).toHaveLength(1)

      // Record new snapshot
      store.set(tracksAtom, [createTestTrack('track-3', 'Third')])
      store.set(recordSnapshotAtom)

      expect(store.get(futureSnapshotsAtom)).toHaveLength(0)
    })

    it('should not record when isApplyingHistory is true', () => {
      store.set(isApplyingHistoryAtom, true)
      store.set(recordSnapshotAtom)

      const past = store.get(pastSnapshotsAtom)
      expect(past).toHaveLength(0)
    })

    it('should include timestamp in snapshot', () => {
      const beforeTime = Date.now()
      store.set(recordSnapshotAtom)
      const afterTime = Date.now()

      const past = store.get(pastSnapshotsAtom)
      expect(past[0].timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(past[0].timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should deep clone tracks and assets', () => {
      store.set(recordSnapshotAtom)

      // Modify original state
      const tracks = store.get(tracksAtom)
      tracks[0].name = 'Modified'

      // Snapshot should be unchanged
      const past = store.get(pastSnapshotsAtom)
      expect(past[0].tracks[0].name).toBe('Initial Track')
    })

    it('should limit history to MAX_HISTORY_SIZE', () => {
      // MAX_HISTORY_SIZE is 50
      for (let i = 0; i < 60; i++) {
        store.set(tracksAtom, [createTestTrack(`track-${i}`, `Track ${i}`)])
        store.set(recordSnapshotAtom)
      }

      const past = store.get(pastSnapshotsAtom)
      expect(past).toHaveLength(50)
    })
  })

  // ===============================
  // undoAtom Tests
  // ===============================

  describe('undoAtom', () => {
    it('should do nothing when no history', () => {
      const initialTracks = store.get(tracksAtom)
      store.set(undoAtom)

      expect(store.get(tracksAtom)).toEqual(initialTracks)
    })

    it('should restore previous state', () => {
      // Record initial state
      store.set(recordSnapshotAtom)

      // Make change
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed Track')])

      // Undo
      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      const tracks = store.get(tracksAtom)
      expect(tracks[0].name).toBe('Initial Track')
    })

    it('should move current state to future', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      const future = store.get(futureSnapshotsAtom)
      expect(future).toHaveLength(1)
      expect(future[0].tracks[0].name).toBe('Changed')
    })

    it('should set canUndo to false after undoing all', () => {
      store.set(recordSnapshotAtom)

      expect(store.get(canUndoAtom)).toBe(true)

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canUndoAtom)).toBe(false)
    })

    it('should set canRedo to true after undo', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      expect(store.get(canRedoAtom)).toBe(false)

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canRedoAtom)).toBe(true)
    })

    it('should handle multiple undos', () => {
      // State 1
      store.set(recordSnapshotAtom)

      // State 2
      store.set(tracksAtom, [createTestTrack('track-2', 'State 2')])
      store.set(recordSnapshotAtom)

      // State 3
      store.set(tracksAtom, [createTestTrack('track-3', 'State 3')])
      store.set(recordSnapshotAtom)

      // Current state
      store.set(tracksAtom, [createTestTrack('track-4', 'Current')])

      // Undo to State 3
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('State 3')

      // Undo to State 2
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('State 2')

      // Undo to State 1
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Initial Track')
    })

    it('should restore assets along with tracks', () => {
      store.set(recordSnapshotAtom)

      store.set(assetsAtom, [createTestAsset('asset-2', 'Changed Asset')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      const assets = store.get(assetsAtom)
      expect(assets[0].name).toBe('Initial Asset')
    })

    it('should set isApplyingHistory during undo', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)

      // Should be true immediately after undo
      expect(store.get(isApplyingHistoryAtom)).toBe(true)

      // Should reset after timeout
      vi.advanceTimersByTime(150)
      expect(store.get(isApplyingHistoryAtom)).toBe(false)
    })
  })

  // ===============================
  // redoAtom Tests
  // ===============================

  describe('redoAtom', () => {
    it('should do nothing when no future', () => {
      const initialTracks = store.get(tracksAtom)
      store.set(redoAtom)

      expect(store.get(tracksAtom)).toEqual(initialTracks)
    })

    it('should restore future state', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed Track')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      // Now redo
      store.set(redoAtom)
      vi.advanceTimersByTime(150)

      const tracks = store.get(tracksAtom)
      expect(tracks[0].name).toBe('Changed Track')
    })

    it('should move current state to past', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      const pastBeforeRedo = store.get(pastSnapshotsAtom).length

      store.set(redoAtom)
      vi.advanceTimersByTime(150)

      const pastAfterRedo = store.get(pastSnapshotsAtom).length
      expect(pastAfterRedo).toBe(pastBeforeRedo + 1)
    })

    it('should set canRedo to false after redoing all', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canRedoAtom)).toBe(true)

      store.set(redoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canRedoAtom)).toBe(false)
    })

    it('should handle multiple redos', () => {
      // State 1
      store.set(recordSnapshotAtom)

      // State 2
      store.set(tracksAtom, [createTestTrack('track-2', 'State 2')])
      store.set(recordSnapshotAtom)

      // State 3
      store.set(tracksAtom, [createTestTrack('track-3', 'State 3')])

      // Undo twice
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(tracksAtom)[0].name).toBe('Initial Track')

      // Redo twice
      store.set(redoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('State 2')

      store.set(redoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('State 3')
    })

    it('should restore assets along with tracks', () => {
      store.set(recordSnapshotAtom)

      store.set(assetsAtom, [createTestAsset('asset-2', 'Changed Asset')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      store.set(redoAtom)
      vi.advanceTimersByTime(150)

      const assets = store.get(assetsAtom)
      expect(assets[0].name).toBe('Changed Asset')
    })

    it('should set isApplyingHistory during redo', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      store.set(redoAtom)

      expect(store.get(isApplyingHistoryAtom)).toBe(true)

      vi.advanceTimersByTime(150)
      expect(store.get(isApplyingHistoryAtom)).toBe(false)
    })
  })

  // ===============================
  // canUndoAtom & canRedoAtom Tests
  // ===============================

  describe('canUndoAtom', () => {
    it('should return true when past has snapshots', () => {
      store.set(recordSnapshotAtom)
      expect(store.get(canUndoAtom)).toBe(true)
    })

    it('should return false when past is empty', () => {
      expect(store.get(canUndoAtom)).toBe(false)
    })

    it('should update reactively', () => {
      expect(store.get(canUndoAtom)).toBe(false)

      store.set(recordSnapshotAtom)
      expect(store.get(canUndoAtom)).toBe(true)

      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(canUndoAtom)).toBe(false)
    })
  })

  describe('canRedoAtom', () => {
    it('should return true when future has snapshots', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])
      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canRedoAtom)).toBe(true)
    })

    it('should return false when future is empty', () => {
      expect(store.get(canRedoAtom)).toBe(false)
    })

    it('should update reactively', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      expect(store.get(canRedoAtom)).toBe(false)

      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(canRedoAtom)).toBe(true)

      store.set(redoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(canRedoAtom)).toBe(false)
    })
  })

  // ===============================
  // clearHistoryAtom Tests
  // ===============================

  describe('clearHistoryAtom', () => {
    it('should clear all past snapshots', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])
      store.set(recordSnapshotAtom)

      expect(store.get(pastSnapshotsAtom).length).toBeGreaterThan(0)

      store.set(clearHistoryAtom)

      expect(store.get(pastSnapshotsAtom)).toEqual([])
    })

    it('should clear all future snapshots', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(futureSnapshotsAtom).length).toBeGreaterThan(0)

      store.set(clearHistoryAtom)

      expect(store.get(futureSnapshotsAtom)).toEqual([])
    })

    it('should not affect current tracks/assets', () => {
      const currentTracks = store.get(tracksAtom)
      const currentAssets = store.get(assetsAtom)

      store.set(recordSnapshotAtom)
      store.set(clearHistoryAtom)

      expect(store.get(tracksAtom)).toEqual(currentTracks)
      expect(store.get(assetsAtom)).toEqual(currentAssets)
    })

    it('should set canUndo and canRedo to false', () => {
      // ДВА изменения, а не одно. Предмет этого теста — clearHistory, а
      // первые два ожидания лишь готовят непустую историю. С одним
      // изменением отмена возвращает к исходному состоянию, и canUndo
      // становится false ЗАКОННО: до исходного шагать некуда. Раньше он
      // оставался true только потому, что отмена никуда не двигалась.
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-3', 'Changed again')])
      store.set(recordSnapshotAtom)
      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(canUndoAtom)).toBe(true)
      expect(store.get(canRedoAtom)).toBe(true)

      store.set(clearHistoryAtom)

      expect(store.get(canUndoAtom)).toBe(false)
      expect(store.get(canRedoAtom)).toBe(false)
    })
  })

  // ===============================
  // historyLengthAtom Tests
  // ===============================

  describe('historyLengthAtom', () => {
    it('should return correct past and future lengths', () => {
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-2', 'Second')])
      store.set(recordSnapshotAtom)
      store.set(tracksAtom, [createTestTrack('track-3', 'Third')])
      store.set(recordSnapshotAtom)

      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      /**
       * past === 1, а не 2.
       *
       * История: [initial, Second, Third], стоим на Third. Отмена уводит на
       * Second, и позади остаётся ровно initial — один шаг, который ещё
       * можно отменить.
       *
       * Прежнее ожидание 2 описывало ПОВЕДЕНИЕ СО СБОЕМ: отмена снимала
       * Third и применяла его же, то есть не двигалась, и в прошлом
       * оставалось на снимок больше.
       */
      const length = store.get(historyLengthAtom)
      expect(length.past).toBe(1)
      expect(length.future).toBe(1)
    })

    it('should update reactively', () => {
      expect(store.get(historyLengthAtom)).toEqual({ past: 0, future: 0 })

      store.set(recordSnapshotAtom)
      expect(store.get(historyLengthAtom)).toEqual({ past: 1, future: 0 })

      store.set(tracksAtom, [createTestTrack('track-2', 'Changed')])
      store.set(undoAtom)
      vi.advanceTimersByTime(150)

      expect(store.get(historyLengthAtom)).toEqual({ past: 0, future: 1 })
    })
  })

  // ===============================
  // initHistoryAtom Tests
  // ===============================

  describe('initHistoryAtom', () => {
    it('should record initial state if history is empty', () => {
      expect(store.get(pastSnapshotsAtom)).toHaveLength(0)

      store.set(initHistoryAtom)

      expect(store.get(pastSnapshotsAtom)).toHaveLength(1)
    })

    it('should not record if history already exists', () => {
      store.set(recordSnapshotAtom)
      expect(store.get(pastSnapshotsAtom)).toHaveLength(1)

      store.set(initHistoryAtom)

      expect(store.get(pastSnapshotsAtom)).toHaveLength(1)
    })

    it('should capture current state on init', () => {
      store.set(tracksAtom, [createTestTrack('custom-track', 'Custom Initial')])

      store.set(initHistoryAtom)

      const past = store.get(pastSnapshotsAtom)
      expect(past[0].tracks[0].name).toBe('Custom Initial')
    })
  })

  // ===============================
  // Integration Tests
  // ===============================

  describe('Integration: Undo/Redo Workflow', () => {
    it('should handle full undo/redo cycle', () => {
      // Initial state
      store.set(initHistoryAtom)

      // Make change 1
      store.set(tracksAtom, [createTestTrack('track-a', 'Change A')])
      store.set(recordSnapshotAtom)

      // Make change 2
      store.set(tracksAtom, [createTestTrack('track-b', 'Change B')])
      store.set(recordSnapshotAtom)

      // Make change 3
      store.set(tracksAtom, [createTestTrack('track-c', 'Change C')])

      // Verify current state
      expect(store.get(tracksAtom)[0].name).toBe('Change C')

      // Undo to Change B
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Change B')

      // Undo to Change A
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Change A')

      // Undo to Initial
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Initial Track')

      // Redo to Change A
      store.set(redoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Change A')

      // Redo to Change B
      store.set(redoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)[0].name).toBe('Change B')

      // Make new change (should clear future)
      store.set(tracksAtom, [createTestTrack('track-d', 'Change D')])
      store.set(recordSnapshotAtom)

      expect(store.get(canRedoAtom)).toBe(false)
    })

    it('should properly isolate history state between undo/redo', () => {
      store.set(initHistoryAtom)

      // Add track 1
      store.set(tracksAtom, [
        ...store.get(tracksAtom),
        createTestTrack('track-new-1', 'Track New 1'),
      ])
      store.set(recordSnapshotAtom)

      // Add track 2
      store.set(tracksAtom, [
        ...store.get(tracksAtom),
        createTestTrack('track-new-2', 'Track New 2'),
      ])
      store.set(recordSnapshotAtom)

      expect(store.get(tracksAtom)).toHaveLength(3)

      // Undo - should go back to 2 tracks
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)).toHaveLength(2)

      // Undo - should go back to 1 track
      store.set(undoAtom)
      vi.advanceTimersByTime(150)
      expect(store.get(tracksAtom)).toHaveLength(1)
    })
  })
})
