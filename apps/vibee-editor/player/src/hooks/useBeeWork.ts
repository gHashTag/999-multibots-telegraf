import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import * as SPEC from '@/spec/kanban-card-chat.gen'
import { nextPollS, workFrom, workQuery, type BeeWork } from '@/lib/cardWork'

/**
 * Ask render for the bee on this card (BEE_DOOR) while the sheet is open:
 * every BEE_POLL_S while it runs and the person watches, BEE_IDLE_POLL_S
 * otherwise, never while the page is hidden, and not at all once render says
 * it has no token. A bare `#5382` (no repository yet) waits for the history
 * to name the card.
 */
export function useBeeWork(
  task: string,
  repo: string,
  watching: boolean
): BeeWork {
  const [work, setWork] = useState<BeeWork>({ kind: 'reading' })
  const had = useRef<BeeWork>(work)
  const watchingNow = useRef(watching)
  const askNow = useRef<() => void>(() => undefined)

  useEffect(() => {
    let alive = true
    let busy = false
    let timer: ReturnType<typeof setTimeout> | undefined
    had.current = { kind: 'reading' }
    setWork(had.current)
    if (!repo) return
    const ask = async () => {
      if (busy || !alive) return
      clearTimeout(timer)
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(ask, SPEC.BEE_IDLE_POLL_S * 1000)
        return
      }
      busy = true
      let status = 0
      let body: unknown = null
      try {
        const r = await fetch(
          `${API_BASE}${SPEC.BEE_DOOR}?${workQuery(task, had.current)}`,
          { headers: authHeaders() }
        )
        status = r.status
        body = await r.json().catch(() => null)
      } catch {
        status = 0
      }
      busy = false
      if (!alive) return
      had.current = workFrom(had.current, status, body)
      setWork(had.current)
      const s = nextPollS(had.current, watchingNow.current)
      if (s !== null) timer = setTimeout(ask, s * 1000)
    }
    askNow.current = () => void ask()
    void ask()
    return () => {
      alive = false
      clearTimeout(timer)
      askNow.current = () => undefined
    }
  }, [task, repo])

  // Turning to the bee asks at once rather than at the idle pace.
  useEffect(() => {
    watchingNow.current = watching
    if (watching) askNow.current()
  }, [watching])

  return work
}
