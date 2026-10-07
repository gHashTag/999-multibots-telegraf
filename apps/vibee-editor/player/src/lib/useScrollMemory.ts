import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * WHERE A SCREEN WAS SCROLLED, KEPT ACROSS A VISIT TO ANOTHER ONE.
 *
 * Measured at 390x844 (CRM mobile loop, tick 5): tapping the last contact of
 * a long list opened the card 497 px down -- its header and back crumb above
 * the screen -- and Back from the card returned the list to the top, the
 * tapped row 1231 px away. The app has no route-change scroll handling at
 * all; Pipedrive and HubSpot open a record at its top and return to the list
 * where it was left.
 *
 * The scroller differs by host: inside Telegram the document is pinned and
 * `#root` scrolls (styles/telegram.css), elsewhere the window does.
 */
export function appScroller(): HTMLElement {
  if (document.documentElement.getAttribute('data-tg') === '1') {
    const root = document.getElementById('root')
    if (root) return root
  }
  return (
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  )
}

const KEY = 'vibee.scroll.'
/** Frames to wait for a list that is still growing into its old height. */
const TRIES = 30

function saved(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(KEY + key)
    const y = raw === null ? NaN : Number(raw)
    return Number.isFinite(y) && y > 0 ? y : null
  } catch {
    return null
  }
}

/**
 * Remember this screen's scroll per history entry, and put it back when the
 * person RETURNS to the entry (Back, POP) once `ready` says the content is
 * drawn. A fresh visit (PUSH) starts wherever the app left it.
 *
 * The entry's key is followed through a ref: a screen that mirrors its state
 * with `replace` (useUrlMirror) gets a new key on every change.
 */
export function useScrollMemory(ready: boolean): void {
  const location = useLocation()
  const navType = useNavigationType()
  // Path and key: every first-loaded page has the key "default".
  const entry = location.pathname + '#' + location.key
  const keyRef = useRef(entry)
  useLayoutEffect(() => {
    keyRef.current = entry
  }, [entry])
  // Read once, at mount: the entry's value is rewritten when the screen is
  // left again.
  const [target] = useState(() => (navType === 'POP' ? saved(entry) : null))
  const done = useRef(target === null)

  // Saved as the screen is taken down: a layout effect's cleanup runs before
  // React removes the DOM, so the scroller still holds this screen's offset
  // (and the next screen has not scrolled yet). A scroll listener was tried
  // first and lost the offset when the tap came before the scroll event --
  // always, in a hidden preview pane that draws no frames.
  useLayoutEffect(
    () => () => {
      if (!done.current) return
      try {
        window.sessionStorage.setItem(
          KEY + keyRef.current,
          String(Math.round(appScroller().scrollTop))
        )
      } catch {
        // Storage off: Back simply opens at the top, as before.
      }
    },
    []
  )

  useEffect(() => {
    if (!ready || done.current || target === null) return
    let frame = 0
    let tries = 0
    const put = () => {
      const box = appScroller()
      box.scrollTop = target
      tries += 1
      if (Math.abs(box.scrollTop - target) > 1 && tries < TRIES) {
        frame = requestAnimationFrame(put)
      } else {
        done.current = true
      }
    }
    put()
    return () => cancelAnimationFrame(frame)
  }, [ready, target])
}

/**
 * A screen opened by a tap starts at its top. Without this the card opened
 * at the list's scroll offset, header and back crumb off the screen. Back
 * and Forward (POP) are left alone -- that is the returning screen's call.
 */
export function useScrollTopOnPush(dep: unknown): void {
  const navType = useNavigationType()
  useLayoutEffect(() => {
    if (navType !== 'POP') appScroller().scrollTop = 0
  }, [navType, dep])
}
