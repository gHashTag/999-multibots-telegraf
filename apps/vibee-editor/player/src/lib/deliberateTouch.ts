/**
 * LEADING THE MOUSE IS NOT TAKING THE WHEEL.
 *
 * Owner, 2026-09-23: "if I move the mouse, the agent is interrupted! it
 * should not be. Better a button in the menu, or a click on the screen ends
 * the mode."
 *
 * The wheel used to change hands on `pointerdown` -- and on the parent
 * window losing focus to the frame, which happens when a pointer merely
 * enters it. So watching the agent work, or brushing the picture on the way
 * to a button, stopped it dead.
 *
 * A deliberate touch is a CLICK: pressed and released in the same place,
 * quickly. A drag is not (somebody is selecting or scrolling), a long press
 * is not, and a pointer that only passes through is not. Typing still
 * counts: nobody types into a screen by accident.
 */
export interface Press {
  x: number
  y: number
  at: number
}

/** How far the pointer may travel and still be a click. */
export const CLICK_SLOP_PX = 8
/** How long it may be held. */
export const CLICK_HOLD_MS = 700

/** Was that press-and-release a click? Pure. */
export function isDeliberate(down: Press | null, up: Press): boolean {
  if (!down) return false
  const held = up.at - down.at
  if (!(held >= 0 && held <= CLICK_HOLD_MS)) return false
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX
}
