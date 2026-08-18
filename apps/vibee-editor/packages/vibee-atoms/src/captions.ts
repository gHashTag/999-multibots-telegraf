// ===============================
// Caption Atoms - Shared between mobile and web editors
// ===============================

import { atom } from 'jotai'
import type { CaptionItem, CaptionStyle, CaptionAnimation } from './types'
import { CAPTION_DEFAULTS } from './defaults'

// Re-export types for convenience
export type { CaptionItem, CaptionStyle, CaptionAnimation }

// Re-export defaults
export { CAPTION_DEFAULTS }

// ===============================
// Core Caption Atoms
// ===============================

/**
 * captionsAtom - Array of caption items with timing
 * Each caption has text, startMs, endMs
 */
export const captionsAtom = atom<CaptionItem[]>([])

/**
 * captionStyleAtom - Styling configuration for captions
 * Controls fontSize, colors, position, animation, etc.
 */
export const captionStyleAtom = atom<CaptionStyle>({
  fontSize: CAPTION_DEFAULTS.fontSize,
  textColor: CAPTION_DEFAULTS.textColor,
  highlightColor: CAPTION_DEFAULTS.highlightColor,
  backgroundColor: CAPTION_DEFAULTS.backgroundColor,
  bottomPercent: CAPTION_DEFAULTS.bottomPercent,
  maxWidthPercent: CAPTION_DEFAULTS.maxWidthPercent,
  fontWeight: CAPTION_DEFAULTS.fontWeight,
  showShadow: CAPTION_DEFAULTS.showShadow,
  fontFamily: 'Montserrat',
  animation: 'pop' as CaptionAnimation,
})

/**
 * showCaptionsAtom - Toggle visibility of captions
 */
export const showCaptionsAtom = atom(true)

// ===============================
// Loading & Error State Atoms
// ===============================

/**
 * captionsLoadingAtom - Loading state for caption fetching/transcription
 */
export const captionsLoadingAtom = atom(false)

/**
 * captionsErrorAtom - Error message from caption operations
 */
export const captionsErrorAtom = atom<string | null>(null)

/**
 * transcribingAtom - Whether transcription is in progress
 */
export const transcribingAtom = atom(false)

// ===============================
// Caption Actions
// ===============================

/**
 * clearCaptionsAtom - Clear all captions
 */
export const clearCaptionsAtom = atom(null, (_get, set) => {
  set(captionsAtom, [])
  set(captionsErrorAtom, null)
})

/**
 * setCaptionsAtom - Set captions array
 */
export const setCaptionsAtom = atom(
  null,
  (_get, set, captions: CaptionItem[]) => {
    set(captionsAtom, captions)
    set(captionsErrorAtom, null)
  }
)

/**
 * updateCaptionStyleAtom - Partially update caption style
 */
export const updateCaptionStyleAtom = atom(
  null,
  (get, set, updates: Partial<CaptionStyle>) => {
    const current = get(captionStyleAtom)
    set(captionStyleAtom, { ...current, ...updates })
  }
)

/**
 * resetCaptionStyleAtom - Reset caption style to defaults
 */
export const resetCaptionStyleAtom = atom(null, (_get, set) => {
  set(captionStyleAtom, {
    fontSize: CAPTION_DEFAULTS.fontSize,
    textColor: CAPTION_DEFAULTS.textColor,
    highlightColor: CAPTION_DEFAULTS.highlightColor,
    backgroundColor: CAPTION_DEFAULTS.backgroundColor,
    bottomPercent: CAPTION_DEFAULTS.bottomPercent,
    maxWidthPercent: CAPTION_DEFAULTS.maxWidthPercent,
    fontWeight: CAPTION_DEFAULTS.fontWeight,
    showShadow: CAPTION_DEFAULTS.showShadow,
    fontFamily: 'Montserrat',
    animation: 'pop' as CaptionAnimation,
  })
})
