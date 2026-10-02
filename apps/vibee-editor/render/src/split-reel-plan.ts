/**
 * THE SPLIT REEL, CUT FROM ITS SPEC.
 *
 * gHashTag/t27 specs/automation/split-reel.t27 holds the rhythm (the face
 * first, then split and full by turns), the caption colour and the ceiling;
 * this file only turns those numbers into the `segments` and props the
 * Remotion composition SplitTalkingHead takes. Nothing here restates a
 * number: change the spec, regenerate split-reel.gen.ts, and every reel
 * follows. The spec's own vectors run against this file in
 * spec/split-reel.test.ts.
 */
import * as SPEC from './spec/split-reel.gen'

export interface SplitSegment {
  type: 'split' | 'fullscreen'
  startFrame: number
  durationFrames: number
  bRollUrl?: string
  bRollType?: 'video' | 'image'
}

/** The cuts of a reel this many frames long, b-roll handed out in turn. */
export function splitSegments(
  totalFrames: number,
  bRolls: readonly string[] = []
): SplitSegment[] {
  const total = Math.max(1, Math.round(totalFrames))
  const out: SplitSegment[] = []
  let at = 0
  let split = 0
  const push = (type: SplitSegment['type'], want: number) => {
    const durationFrames = Math.min(want, total - at)
    if (durationFrames <= 0) return
    const seg: SplitSegment = { type, startFrame: at, durationFrames }
    if (type === 'split' && bRolls.length) {
      const url = bRolls[split % bRolls.length]
      seg.bRollUrl = url
      seg.bRollType = /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image'
      split += 1
    }
    out.push(seg)
    at += durationFrames
  }
  push('fullscreen', SPEC.OPEN_FULL_FRAMES)
  while (at < total) {
    push('split', SPEC.SPLIT_FRAMES)
    push('fullscreen', SPEC.FULL_FRAMES)
  }
  return out
}

/** Frames of a voice this many seconds long, clipped to the spec's ceiling. */
export function framesForSeconds(seconds: number): number {
  const s = Math.min(Math.max(0, seconds), SPEC.MAX_SECONDS)
  return Math.max(1, Math.round(s * SPEC.FPS))
}

export interface SplitReelInput {
  lipSyncVideo: string
  seconds: number
  bRolls?: readonly string[]
  captions?: unknown[]
  ctaText?: string
}

/** Props for `reel_render {compositionId: SPEC.COMPOSITION, props}`. */
export function splitReelProps(input: SplitReelInput) {
  return {
    lipSyncVideo: input.lipSyncVideo,
    segments: splitSegments(framesForSeconds(input.seconds), input.bRolls),
    captions: input.captions ?? [],
    captionColor: SPEC.CAPTION_COLOR,
    splitRatio: SPEC.SPLIT_PCT / 100,
    // SplitTalkingHead defaults a split to a 25% circle; size 50 is scale 1.
    splitIsCircle: !SPEC.FACE_FILLS_HALF,
    splitCircleSize: SPEC.SPLIT_PCT,
    ...(input.ctaText ? { ctaText: input.ctaText } : {}),
  }
}

export const SPLIT_REEL_COMPOSITION = SPEC.COMPOSITION
