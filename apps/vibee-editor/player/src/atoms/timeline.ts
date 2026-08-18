// ===============================
// Timeline Atoms
// Scroll control & Ghost preview
// ===============================

import { atom } from 'jotai';

// ===============================
// Scroll Control
// ===============================

/** Frame to scroll to (null = no scroll request) */
export const scrollToFrameAtom = atom<number | null>(null);

/** Request timeline to scroll to a specific frame */
export const requestScrollAtom = atom(
  null,
  (get, set, frame: number) => {
    set(scrollToFrameAtom, frame);
  }
);

/** Clear scroll request after handling */
export const clearScrollRequestAtom = atom(
  null,
  (get, set) => {
    set(scrollToFrameAtom, null);
  }
);

// ===============================
// Ghost Preview
// ===============================

export interface GhostPreview {
  trackId: string;
  startFrame: number;
  durationInFrames: number;
  type: 'video' | 'image' | 'audio' | 'avatar';
}

/** Ghost item preview state (null = hidden) */
export const ghostPreviewAtom = atom<GhostPreview | null>(null);

/** Show ghost preview on timeline */
export const showGhostPreviewAtom = atom(
  null,
  (get, set, preview: GhostPreview) => {
    set(ghostPreviewAtom, preview);
  }
);

/** Hide ghost preview */
export const hideGhostPreviewAtom = atom(
  null,
  (get, set) => {
    set(ghostPreviewAtom, null);
  }
);

// ===============================
// Snap Indicators
// ===============================

/** Active snap frame during drag (null = not snapping) */
export const activeSnapFrameAtom = atom<number | null>(null);

/** Whether dragging is in progress */
export const isDraggingItemAtom = atom<boolean>(false);

/** Set active snap frame */
export const setActiveSnapFrameAtom = atom(
  null,
  (get, set, frame: number | null) => {
    set(activeSnapFrameAtom, frame);
  }
);

/** Set dragging state */
export const setDraggingItemAtom = atom(
  null,
  (get, set, isDragging: boolean) => {
    set(isDraggingItemAtom, isDragging);
    // Clear snap frame when drag ends
    if (!isDragging) {
      set(activeSnapFrameAtom, null);
    }
  }
);
