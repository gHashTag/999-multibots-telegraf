// Playback atoms - shared between mobile and web editors
import { atom } from 'jotai'

// ============= Core Playback State =============
// These are runtime-only atoms (no persistence needed)
// Platform-specific atoms with persistence should be defined locally

export const isPlayingAtom = atom(false)
export const currentFrameAtom = atom(0)
export const isMutedAtom = atom(false)

// ============= Playback Settings =============
// Default values - platforms can override with atomWithStorage
export const playbackSpeedAtom = atom(1)
export const volumeAtom = atom(1)
export const fpsAtom = atom(30)

// Loop playback (shared across platforms)
export const loopAtom = atom(true)

// ============= Derived Atoms =============

// Current time in seconds
export const currentTimeAtom = atom(
  (get) => {
    const fps = get(fpsAtom) || 30 // Default to 30 fps if undefined/0
    return get(currentFrameAtom) / fps
  }
)

// ============= Action Atoms =============

// Bounded current frame setter
export const setCurrentFrameAtom = atom(
  null,
  (_get, set, frame: number) => {
    set(currentFrameAtom, Math.max(0, frame))
  }
)

// Set isPlaying state
export const setIsPlayingAtom = atom(
  null,
  (_get, set, isPlaying: boolean) => {
    set(isPlayingAtom, isPlaying)
  }
)

// Seek action (pauses and sets frame)
export const seekToAtom = atom(
  null,
  (_get, set, frame: number) => {
    set(currentFrameAtom, Math.max(0, frame))
    set(isPlayingAtom, false)
  }
)

// ===============================
// Throttled Frame Atoms (for non-critical UI)
// ===============================

// Throttled frame for non-critical UI (updates ~10fps during playback)
// Use for: Timeline playhead indicator, caption panel sync
export const throttledFrameAtom = atom((get) => {
  const frame = get(currentFrameAtom)
  const isPlaying = get(isPlayingAtom)
  // During playback, quantize to reduce updates (every 3 frames = ~10fps at 30fps)
  if (isPlaying) {
    return Math.floor(frame / 3) * 3
  }
  return frame
})

// Playhead frame for timeline UI (smoother during scrubbing)
export const playheadFrameAtom = atom((get) => {
  const frame = get(currentFrameAtom)
  const isPlaying = get(isPlayingAtom)
  // During playback, quantize to every 2 frames
  // During scrubbing, use exact frame
  return isPlaying ? Math.floor(frame / 2) * 2 : frame
})

// Frame for progress bar (less precision needed)
export const progressFrameAtom = atom((get) => {
  const frame = get(currentFrameAtom)
  // Quantize to every 5 frames for progress bar
  return Math.floor(frame / 5) * 5
})
