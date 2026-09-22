/**
 * Scroll the section strip -- and only the strip -- so `item` is fully in
 * sight. `scrollIntoView` also moves every scrolling ancestor, so a profile
 * opened at ?tab= jumped the page down to the strip, and its smooth scroll
 * was cancelled by the layout still settling as the profile loaded (measured
 * at 390px: the active tab stayed past the edge). Instant, horizontal, here.
 *
 * The margin clears the strip's edge fade (Profile.css: 16px on the left,
 * 28px on the right), so the chosen tab is never half-faded.
 */
export function revealInStrip(
  strip: HTMLElement,
  item: HTMLElement,
  margin = 32
): void {
  const s = strip.getBoundingClientRect()
  const a = item.getBoundingClientRect()
  if (a.left < s.left) strip.scrollLeft -= s.left - a.left + margin
  else if (a.right > s.right) strip.scrollLeft += a.right - s.right + margin
}
