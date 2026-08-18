// ===============================
// @vibee/atoms - Snap Point Index
// O(log n) binary search for snap-to-grid during drag operations
// ===============================

import { atom } from 'jotai'
import { tracksAtom } from './tracks'

// ===============================
// Types
// ===============================

export interface SnapPoint {
  frame: number
  type: 'start' | 'end' | 'marker'
  itemId?: string
  trackId?: string
}

export interface SnapResult {
  frame: number
  snapped: boolean
  snapPoint?: SnapPoint
}

// ===============================
// Snap Points Index Atom
// Recomputes when tracks change (O(n log n) sort)
// ===============================

export const snapPointsAtom = atom((get) => {
  const tracks = get(tracksAtom)
  const points: SnapPoint[] = []

  for (const track of tracks) {
    for (const item of track.items) {
      // Start frame
      points.push({
        frame: item.startFrame,
        type: 'start',
        itemId: item.id,
        trackId: track.id,
      })
      // End frame
      points.push({
        frame: item.startFrame + item.durationInFrames,
        type: 'end',
        itemId: item.id,
        trackId: track.id,
      })
    }
  }

  // Sort once (O(n log n))
  return points.sort((a, b) => a.frame - b.frame)
})

// ===============================
// Binary Search Function
// O(log n) instead of O(n) linear search
// ===============================

export function findNearestSnapPoint(
  points: SnapPoint[],
  targetFrame: number,
  threshold: number = 5,
  excludeItemId?: string
): SnapResult {
  if (points.length === 0) {
    return { frame: targetFrame, snapped: false }
  }

  let left = 0
  let right = points.length - 1
  let nearestPoint: SnapPoint | undefined
  let nearestDistance = Infinity

  // Binary search to find the region
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const point = points[mid]

    // Skip if this point belongs to the item being dragged
    if (excludeItemId && point.itemId === excludeItemId) {
      // Check neighbors instead
      if (mid > 0) {
        const prevPoint = points[mid - 1]
        if (prevPoint.itemId !== excludeItemId) {
          const dist = Math.abs(prevPoint.frame - targetFrame)
          if (dist < nearestDistance) {
            nearestDistance = dist
            nearestPoint = prevPoint
          }
        }
      }
      if (mid < points.length - 1) {
        const nextPoint = points[mid + 1]
        if (nextPoint.itemId !== excludeItemId) {
          const dist = Math.abs(nextPoint.frame - targetFrame)
          if (dist < nearestDistance) {
            nearestDistance = dist
            nearestPoint = nextPoint
          }
        }
      }
      // Continue search
      if (targetFrame < point.frame) {
        right = mid - 1
      } else {
        left = mid + 1
      }
      continue
    }

    const distance = Math.abs(point.frame - targetFrame)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPoint = point
    }

    // Continue binary search
    if (targetFrame < point.frame) {
      right = mid - 1
    } else if (targetFrame > point.frame) {
      left = mid + 1
    } else {
      // Exact match
      break
    }
  }

  // Check if within threshold
  if (nearestPoint && nearestDistance <= threshold) {
    return {
      frame: nearestPoint.frame,
      snapped: true,
      snapPoint: nearestPoint,
    }
  }

  return { frame: targetFrame, snapped: false }
}

// ===============================
// Snap Action Atom
// ===============================

export const getSnappedFrameAtom = atom((get) => {
  const points = get(snapPointsAtom)

  return (
    targetFrame: number,
    options?: {
      threshold?: number
      excludeItemId?: string
      enabled?: boolean
    }
  ): SnapResult => {
    // If snapping disabled, return original frame
    if (options?.enabled === false) {
      return { frame: targetFrame, snapped: false }
    }

    return findNearestSnapPoint(
      points,
      targetFrame,
      options?.threshold ?? 5,
      options?.excludeItemId
    )
  }
})

// ===============================
// Snap Settings Atom
// ===============================

export interface SnapSettings {
  enabled: boolean
  threshold: number  // Frames within which to snap
  snapToItems: boolean
  snapToMarkers: boolean
  snapToPlayhead: boolean
  snapToGrid: boolean
  gridInterval: number  // Grid interval in frames
}

export const defaultSnapSettings: SnapSettings = {
  enabled: true,
  threshold: 5,
  snapToItems: true,
  snapToMarkers: true,
  snapToPlayhead: true,
  snapToGrid: false,
  gridInterval: 30,  // 1 second at 30fps
}

export const snapSettingsAtom = atom<SnapSettings>(defaultSnapSettings)

// ===============================
// Active Snap Indicator Atom
// For showing snap line in UI
// ===============================

export const activeSnapFrameAtom = atom<number | null>(null)

export const setActiveSnapFrameAtom = atom(
  null,
  (_get, set, frame: number | null) => {
    set(activeSnapFrameAtom, frame)
  }
)

// Clear snap indicator after drag ends
export const clearActiveSnapAtom = atom(null, (_get, set) => {
  set(activeSnapFrameAtom, null)
})
