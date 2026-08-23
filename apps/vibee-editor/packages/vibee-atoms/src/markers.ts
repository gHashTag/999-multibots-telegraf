// ===============================
// @vibee/atoms - Timeline Markers
// Unified marker atoms for Web & Mobile editors
// ===============================

import { atom } from 'jotai'
import type { Marker, MarkerColor } from './types'

// ===============================
// Marker Colors (hex values for UI)
// ===============================

export const MARKER_COLORS: Record<MarkerColor, string> = {
  yellow: '#00ff88',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
}

// Helper to convert color name to hex
export const getMarkerColorHex = (color: MarkerColor): string => {
  return MARKER_COLORS[color] || MARKER_COLORS.yellow
}

// ===============================
// Core Marker Atom
// ===============================

export const markersAtom = atom<Marker[]>([])

// ===============================
// Marker Actions
// ===============================

// Add marker action
export const addMarkerAtom = atom(
  null,
  (get, set, marker: Omit<Marker, 'id'>) => {
    const id = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const newMarker: Marker = { id, ...marker }
    set(
      markersAtom,
      [...get(markersAtom), newMarker].sort((a, b) => a.frame - b.frame)
    )
    return id
  }
)

// Remove marker action
export const removeMarkerAtom = atom(null, (get, set, markerId: string) => {
  set(
    markersAtom,
    get(markersAtom).filter(m => m.id !== markerId)
  )
})

// Update marker action
export const updateMarkerAtom = atom(
  null,
  (
    get,
    set,
    { id, updates }: { id: string; updates: Partial<Omit<Marker, 'id'>> }
  ) => {
    set(
      markersAtom,
      get(markersAtom).map(m => (m.id === id ? { ...m, ...updates } : m))
    )
  }
)

// Clear all markers
export const clearMarkersAtom = atom(null, (_, set) => {
  set(markersAtom, [])
})
