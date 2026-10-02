/** Small pure helpers of the voice orb, kept apart so they can be tested. */
import type { VoicePhase } from '@/lib/voice/session'

const TAU = Math.PI * 2

/**
 * Two hues and a saturation per phase: one glance says whose turn it is.
 * The aura blends the pair, so every phase reads as a gradient, not a flat
 * colour.
 *
 * No phase is red (owner's call, 2026-10-01). A stopped session is not an
 * alarm: the mark is the button that starts it again, so it glows the app's
 * own green (--board-green, #00ff88) and invites the tap.
 */
export const PALETTE: Record<VoicePhase, [number, number, number]> = {
  off: [222, 250, 12],
  starting: [222, 252, 45],
  listening: [188, 226, 95],
  hearing: [270, 318, 90],
  thinking: [40, 30, 95],
  speaking: [48, 32, 100],
  error: [148, 166, 90],
}

/** Hue `from` moved toward `to` by `k`, the short way round the wheel. */
export function easeHue(from: number, to: number, k: number): number {
  const d = ((to - from + 540) % 360) - 180
  return (from + d * k + 360) % 360
}

/** The hue `k` of the way from `a` to `b`, the short way round. */
export function mixHue(a: number, b: number, k: number): number {
  return easeHue(a, b, k)
}

/**
 * The sound at an angle around the mark, mirrored left to right so the bass
 * sits at the top and the shape stays symmetric, interpolated between bands
 * so the outline is a curve and not a staircase.
 */
export function bandAt(bands: ArrayLike<number>, angle: number): number {
  const u = (((angle / TAU) % 1) + 1) % 1
  const m = u < 0.5 ? u * 2 : (1 - u) * 2
  const x = m * (bands.length - 1)
  const i = Math.floor(x)
  const j = Math.min(bands.length - 1, i + 1)
  return bands[i] + (bands[j] - bands[i]) * (x - i)
}
