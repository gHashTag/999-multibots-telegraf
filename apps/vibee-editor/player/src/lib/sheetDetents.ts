/**
 * WHERE A DRAGGED SHEET COMES TO REST (the iOS bottom sheet, owner
 * 2026-09-22: "a sheet from the bottom, like iOS, half or full screen,
 * dragged to any height").
 *
 * Pure, so the feel is tested without a finger: a sheet at rest sits on one
 * of its detents; a released drag goes to the nearest one, unless the flick
 * was fast enough to mean "the next one that way".
 */
export type Detent = 'peek' | 'half' | 'full'
export const DETENTS: Detent[] = ['peek', 'half', 'full']

/** Height of the peek: the grabber, one status line and one button. */
export const PEEK_PX = 96
/**
 * The island: the closed sheet of the minimal browser -- one line of frosted
 * glass over the picture, no taller than a finger (owner, 2026-09-22:
 * "the browser full screen with no interface, the controls as frosted glass
 * over it, like the site").
 */
export const ISLAND_PX = 60
/** A flick faster than this (px per ms) goes to the next detent that way. */
export const FLICK_PX_PER_MS = 0.5

/** Visible height of each detent for a screen of `screen` px. Pure. */
export function detentHeights(
  screen: number,
  peek: number = PEEK_PX
): Record<Detent, number> {
  const full = Math.max(peek + 120, Math.round(screen - 56))
  return {
    peek,
    half: Math.max(peek + 60, Math.round(screen * 0.5)),
    full,
  }
}

/**
 * The detent a released drag settles on. `visible` is the sheet's visible
 * height at release; `velocity` is px/ms, positive when moving UP (opening).
 */
export function settle(
  visible: number,
  velocity: number,
  heights: Record<Detent, number>
): Detent {
  const ordered = DETENTS.slice().sort((a, b) => heights[a] - heights[b])
  if (Math.abs(velocity) >= FLICK_PX_PER_MS) {
    const going = velocity > 0 ? 1 : -1
    const from = ordered.findIndex(d => heights[d] >= visible)
    const base = from === -1 ? ordered.length - 1 : from
    // Opening: the first detent above where it was let go; closing: the one below.
    const idx =
      going > 0
        ? ordered.findIndex(d => heights[d] > visible + 1)
        : ordered.length -
          1 -
          ordered
            .slice()
            .reverse()
            .findIndex(d => heights[d] < visible - 1)
    const pick = idx >= 0 && idx < ordered.length ? idx : base
    return ordered[Math.min(Math.max(pick, 0), ordered.length - 1)]
  }
  let best: Detent = ordered[0]
  for (const d of ordered)
    if (Math.abs(heights[d] - visible) < Math.abs(heights[best] - visible))
      best = d
  return best
}

/** A tap on the grabber: peek → half → full → peek. Pure. */
export function nextDetent(d: Detent): Detent {
  return d === 'peek' ? 'half' : d === 'half' ? 'full' : 'peek'
}
