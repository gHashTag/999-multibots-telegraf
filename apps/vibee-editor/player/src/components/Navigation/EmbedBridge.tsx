import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { IS_EMBED, postToParent } from '@/lib/embed'

/**
 * Tells the game around the TRI frame which route the app is on.
 *
 * `ready` once when the app has mounted, then `route` on every pathname
 * change, including navigation inside the page (the AI pipeline stages, CRM
 * client links). The game uses it to keep the screen in its own address, so a
 * reload of the Queen page lands back on the same screen. It is also the
 * game's availability signal: a frame refused by frame-ancestors still fires
 * `load`, but never says `ready`.
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
