export interface StoryboardSegmentWithMedia {
  bRollUrl?: string
}

/**
 * A scene is renderable because it has media, not because of its layout type.
 * `fullscreen` describes geometry; it must never silently discard the scene.
 */
export function segmentsWithBRoll<T extends StoryboardSegmentWithMedia>(
  segments: readonly T[]
): T[] {
  return segments.filter(segment => Boolean(segment.bRollUrl))
}

export interface FilmGrainFrame {
  seed: number
  offsetX: number
  offsetY: number
  flicker: number
  scratchX: number | null
}

/** Stable per-frame film state: repeatable renders, never Math.random(). */
export function filmGrainFrame(frame: number): FilmGrainFrame {
  const seed = (frame * 17 + 23) % 101
  return {
    seed,
    offsetX: (seed % 7) - 3,
    offsetY: ((seed * 3) % 7) - 3,
    flicker: (Math.sin(frame * 2.399) + 1) / 2,
    scratchX: frame % 113 < 2 ? (frame * 37) % 100 : null,
  }
}
