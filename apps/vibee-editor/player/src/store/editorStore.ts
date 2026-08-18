// ===============================
// Editor Store - Now using Jotai atoms!
//
// This file provides backwards compatibility with the old Zustand API
// while using Jotai atoms as the source of truth.
//
// Benefits:
// - backgroundVideos is now AUTO-DERIVED (no manual sync!)
// - Single source of truth in tracks atom
// - Race condition in caption loading is fixed
// - Better fine-grained reactivity
//
// See: /src/atoms/ for the actual implementation
// ===============================

// Re-export the bridge hook as useEditorStore
export { useEditorStore, useLipSyncProps } from '@/atoms/bridge';

// Re-export types
export type { LipSyncMainProps } from './types';
export type TabId = 'assets' | 'properties';

// Re-export atoms for direct usage (optional, for components that want to migrate)
export {
  // Core atoms
  projectAtom,
  tracksAtom,
  assetsAtom,
  // Playback
  currentFrameAtom,
  isPlayingAtom,
  // Derived (THE KEY INNOVATION)
  backgroundVideosAtom,
  segmentsAtom,
  templatePropsAtom,
  // Actions
  addItemAtom,
  updateItemAtom,
  deleteItemsAtom,
  // History
  undoAtom,
  redoAtom,
} from '@/atoms';
