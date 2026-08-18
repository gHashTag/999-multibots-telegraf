// ===============================
// @vibee/atoms - History Atom (Undo/Redo)
// Single source of truth for Web & Mobile editors
// ===============================

import { atom } from 'jotai';
import type { Track, Asset } from '../types';
import { tracksAtom } from './tracks';
import { assetsAtom } from './assets';
import { MAX_HISTORY_SIZE } from '../defaults';

// ===============================
// Snapshot Types
// ===============================

export interface HistorySnapshot {
  tracks: Track[];
  assets: Asset[];
  timestamp: number;
}

// ===============================
// History State Atoms
// ===============================

export const pastSnapshotsAtom = atom<HistorySnapshot[]>([]);
export const futureSnapshotsAtom = atom<HistorySnapshot[]>([]);
export const isApplyingHistoryAtom = atom(false);

// ===============================
// Selectors
// ===============================

export const canUndoAtom = atom((get) => get(pastSnapshotsAtom).length > 0);
export const canRedoAtom = atom((get) => get(futureSnapshotsAtom).length > 0);

export const historyLengthAtom = atom((get) => ({
  past: get(pastSnapshotsAtom).length,
  future: get(futureSnapshotsAtom).length,
}));

// ===============================
// Helpers
// ===============================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function areSnapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return JSON.stringify(a.tracks) === JSON.stringify(b.tracks) &&
         JSON.stringify(a.assets) === JSON.stringify(b.assets);
}

// ===============================
// Record Snapshot Action
// ===============================

export const recordSnapshotAtom = atom(
  null,
  (get, set) => {
    // Skip if we're currently applying history (undo/redo)
    if (get(isApplyingHistoryAtom)) {
      return;
    }

    const snapshot: HistorySnapshot = {
      tracks: deepClone(get(tracksAtom)),
      assets: deepClone(get(assetsAtom)),
      timestamp: Date.now(),
    };

    const past = get(pastSnapshotsAtom);
    const lastSnapshot = past[past.length - 1];

    // Skip if identical to last snapshot
    if (lastSnapshot && areSnapshotsEqual(lastSnapshot, snapshot)) {
      return;
    }

    // Add to past, limit size
    const newPast = [...past, snapshot];
    if (newPast.length > MAX_HISTORY_SIZE) {
      newPast.shift();
    }

    set(pastSnapshotsAtom, newPast);
    // Clear future on new action
    set(futureSnapshotsAtom, []);
  }
);

// ===============================
// Undo Action
// ===============================

export const undoAtom = atom(
  null,
  (get, set) => {
    const past = get(pastSnapshotsAtom);

    if (past.length === 0) {
      return;
    }

    set(isApplyingHistoryAtom, true);

    // Save current state to future
    const currentSnapshot: HistorySnapshot = {
      tracks: deepClone(get(tracksAtom)),
      assets: deepClone(get(assetsAtom)),
      timestamp: Date.now(),
    };

    const future = get(futureSnapshotsAtom);
    set(futureSnapshotsAtom, [currentSnapshot, ...future]);

    // Pop from past and apply
    const newPast = [...past];
    const snapshot = newPast.pop()!;
    set(pastSnapshotsAtom, newPast);

    // Apply snapshot
    set(tracksAtom, snapshot.tracks);
    set(assetsAtom, snapshot.assets);

    // Delay unlocking to prevent immediate re-recording
    setTimeout(() => {
      set(isApplyingHistoryAtom, false);
    }, 100);
  }
);

// ===============================
// Redo Action
// ===============================

export const redoAtom = atom(
  null,
  (get, set) => {
    const future = get(futureSnapshotsAtom);

    if (future.length === 0) {
      return;
    }

    set(isApplyingHistoryAtom, true);

    // Save current state to past
    const currentSnapshot: HistorySnapshot = {
      tracks: deepClone(get(tracksAtom)),
      assets: deepClone(get(assetsAtom)),
      timestamp: Date.now(),
    };

    const past = get(pastSnapshotsAtom);
    set(pastSnapshotsAtom, [...past, currentSnapshot]);

    // Pop from future and apply
    const newFuture = [...future];
    const snapshot = newFuture.shift()!;
    set(futureSnapshotsAtom, newFuture);

    // Apply snapshot
    set(tracksAtom, snapshot.tracks);
    set(assetsAtom, snapshot.assets);

    // Delay unlocking to prevent immediate re-recording
    setTimeout(() => {
      set(isApplyingHistoryAtom, false);
    }, 100);
  }
);

// ===============================
// Clear History Action
// ===============================

export const clearHistoryAtom = atom(
  null,
  (_get, set) => {
    set(pastSnapshotsAtom, []);
    set(futureSnapshotsAtom, []);
  }
);

// ===============================
// Initialize History (record initial state)
// ===============================

export const initHistoryAtom = atom(
  null,
  (get, set) => {
    // Record initial state if history is empty
    if (get(pastSnapshotsAtom).length === 0) {
      const snapshot: HistorySnapshot = {
        tracks: deepClone(get(tracksAtom)),
        assets: deepClone(get(assetsAtom)),
        timestamp: Date.now(),
      };
      set(pastSnapshotsAtom, [snapshot]);
    }
  }
);
