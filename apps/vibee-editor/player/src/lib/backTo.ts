import type { MouseEvent } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

/**
 * A "BACK TO X" LINK THAT NEVER BUILDS A LOOP.
 *
 * Found in the CRM mobile loop, tick 6, and caused by tick 4: the card's
 * crumb became a real Back (`navigate(-1)`), while the client chat's "To the
 * client" stayed a plain link that PUSHED the card. A chat opened from
 * anywhere but that card (the thread circles, the client picker, the map)
 * then gave: chat -> "to the client" -> card -> Back -> the same chat ->
 * "to the client" -> card ... and the list was never reached again.
 *
 * The screen that opens X's child passes `state={cameFrom(X)}`. The child's
 * back link then steps back when it really came from X (the same entry, its
 * scroll and state intact), and otherwise REPLACES itself with X -- so X's
 * own Back goes where the child's would have gone, not back into the child.
 */
export const cameFrom = (path: string) => ({ backTo: path })

/**
 * Nothing of this app is behind this entry: it was opened from a link, or
 * replaced such an entry. `navigate(-1)` from here would leave the app (or
 * do nothing), so a back link must go to its fixed place instead. The key
 * alone is not enough -- a replace gets a fresh key -- so the replace below
 * carries the fact in `state.firstEntry`.
 */
export function isFirstEntry(location: Location): boolean {
  return (
    location.key === 'default' ||
    (location.state as { firstEntry?: unknown } | null)?.firstEntry === true
  )
}

export function useBackTo(
  path: string
): (e: MouseEvent<HTMLAnchorElement>) => void {
  const location = useLocation()
  const navigate = useNavigate()
  return e => {
    // A new tab or window keeps the plain link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const from = (location.state as { backTo?: unknown } | null)?.backTo
    if (from === path) navigate(-1)
    else
      navigate(path, {
        replace: true,
        state: isFirstEntry(location) ? { firstEntry: true } : null,
      })
  }
}
