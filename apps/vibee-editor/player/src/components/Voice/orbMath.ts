/** Small pure helpers of the voice orb, kept apart so they can be tested. */

const TAU = Math.PI * 2

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
