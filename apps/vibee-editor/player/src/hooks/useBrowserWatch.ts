import { useEffect, useRef } from 'react'
import { useSetAtom } from 'jotai'
import { useLocation, useNavigate } from 'react-router-dom'
import { readBrowserSession } from '@/lib/remoteBrowser'
import { IS_EMBED } from '@/lib/embed'
import { agentWorkingAtom } from '@/atoms/agentWorking'
import {
  shouldFollow,
  shouldPoll,
  BROWSER_ROUTE,
  WATCH_INTERVAL_MS,
} from '@/lib/browserWatch'

/**
 * Watches for an agent starting a browser, and switches the screen to it.
 *
 * Every decision lives in `browserWatch.ts` and is tested there; this is only
 * the wiring -- a timer, a fetch and a navigation. Kept that way on purpose:
 * this app has no React render library in its tests, so logic left inside an
 * effect could only be checked by grepping the source.
 *
 * Failures are swallowed. The watcher is a convenience; a person who is
 * signed out, offline, or on a deployment without pods must not be shown an
 * error they did not ask for -- the browser tab itself explains all three.
 */
export function useBrowserWatch(): void {
  const navigate = useNavigate()
  const setAgentWorking = useSetAtom(agentWorkingAtom)
  const location = useLocation()
  const followed = useRef<string | null>(null)
  /* Latched: a deployment does not grow pods while the tab is open. */
  const unavailable = useRef(false)
  /* Read through a ref so the timer never restarts on every navigation. */
  const path = useRef(location.pathname)
  path.current = location.pathname

  useEffect(() => {
    let stopped = false

    const look = async () => {
      if (stopped) return
      if (
        !shouldPoll({
          hidden: document.hidden,
          embedded: IS_EMBED,
          unavailable: unavailable.current,
        })
      )
        return
      try {
        const view = await readBrowserSession()
        if (stopped) return
        if (view.state === 'unavailable') unavailable.current = true
        if (
          shouldFollow({
            state: view.state,
            sessionId: view.sessionId,
            currentPath: path.current,
            followedSessionId: followed.current,
          })
        ) {
          followed.current = view.sessionId ?? null
          /* Somebody else started this browser: say so, and glow. */
          setAgentWorking(true)
          navigate(BROWSER_ROUTE)
        }
      } catch {
        /* Not signed in, offline, or no pods here. All explained elsewhere. */
      }
    }

    const timer = setInterval(() => void look(), WATCH_INTERVAL_MS)
    void look()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [navigate, setAgentWorking])
}
