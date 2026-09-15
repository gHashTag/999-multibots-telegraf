import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { IS_EMBED, postToParent } from '@/lib/embed'

/**
 * Tells the game around the TRI frame which route the app is on.
 *
 * `ready` once when the screen has rendered, then `route` on every pathname
 * change, including navigation inside the page (the AI pipeline stages, CRM
 * client links). The game uses it to keep the screen in its own address, so a
 * reload of the Queen page lands back on the same screen. It is also the
 * game's availability signal: a frame refused by frame-ancestors still fires
 * `load`, but never says `ready`.
 *
 * App.tsx mounts this inside the page <Suspense>, after the routes, so its
 * first effect runs in the same commit as the lazy page's first effect: not
 * while the chunk is loading, and never for a page that throws into the
 * ErrorBoundary (which posts kind 'error' instead). It used to sit outside,
 * and `ready` arrived while the ErrorBoundary showed in the frame.
 *
 * The pathname only, never the search string. Posted to the captured parent
 * origin only (see lib/embed.ts). Renders nothing; outside embed it does
 * nothing at all.
 */
export function EmbedBridge() {
  const { pathname } = useLocation()
  const announced = useRef(false)

  useEffect(() => {
    if (!IS_EMBED) return
    postToParent(announced.current ? 'route' : 'ready', pathname)
    announced.current = true
  }, [pathname])

  return null
}
