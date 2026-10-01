import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * A CARD'S THREAD, LIVE (spec kanban-card-chat.t27 v5, S17).
 *
 * The sheet reads the history once and then listens on LIVE_DOOR for turns
 * newer than the last id it holds, so an A2A agent writing into the same task
 * shows up without a reload. fetch + a stream reader rather than EventSource:
 * the door needs the person's auth headers, and EventSource cannot send any.
 *
 * The server ends a stream after LIVE_STREAM_MAX_S with `event: end` and the
 * last id; the next connection resumes there (LIVE_AFTER_ID). A dropped
 * connection reconnects with growing pauses. An answer that is not an event
 * stream -- an older server without the door, a 401 -- stops listening for
 * good: the sheet then works as it did, read once per open.
 *
 * Relative imports only: render's binding test imports this file.
 */

export interface SseEvent {
  event: string
  data: string
  id?: string
}

/** Split a text buffer into complete events and the unfinished rest. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  for (const block of blocks) {
    let event = 'message'
    let id: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const at = line.indexOf(':')
      const field = at < 0 ? line : line.slice(0, at)
      const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
      else if (field === 'id') id = value
    }
    if (data.length || event !== 'message')
      events.push({ event, data: data.join('\n'), id })
  }
  return { events, rest }
}

/** The pause before reconnect number `attempt` (0-based), in ms. */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt))
}

/** The highest row id in a history answer, 0 when it has none. */
export function lastIdOf(body: unknown): number {
  const messages = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(messages)) return 0
  let last = 0
  for (const m of messages) {
    const id = Number((m as { id?: unknown } | null)?.id)
    if (Number.isInteger(id) && id > last) last = id
  }
  return last
}

export function liveFresh(id: number, lastSeen: number): boolean {
  return id > lastSeen
}

/**
 * Listen on a card's thread. `onTurn` gets each new row's id; the caller
 * decides what to read. Returns the function that stops listening.
 */
export function subscribeThread({
  base,
  task,
  after,
  headers,
  onTurn,
  fetchImpl = fetch,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
}: {
  base: string
  task: string
  after: number
  headers: () => HeadersInit
  onTurn: (id: number) => void
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<unknown>
}): () => void {
  const stop = new AbortController()
  let last = after
  ;(async () => {
    let attempt = 0
    while (!stop.signal.aborted) {
      let ended = false
      try {
        const q = new URLSearchParams({ task, after: String(last) })
        const res = await fetchImpl(`${base}${SPEC.LIVE_DOOR}?${q}`, {
          headers: headers(),
          signal: stop.signal,
        })
        const type = res.headers.get('content-type') || ''
        if (!res.ok || !type.includes('text/event-stream') || !res.body) return // no door here: read once per open, as before
        attempt = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSse(buffer)
          buffer = rest
          for (const e of events) {
            if (e.event === 'turn') {
              const id = Number(e.id)
              if (Number.isInteger(id) && liveFresh(id, last)) {
                last = id
                onTurn(id)
              }
            } else if (e.event === 'end') {
              ended = true
            }
          }
        }
      } catch {
        if (stop.signal.aborted) return
      }
      if (stop.signal.aborted) return
      // A stream that ended on time reconnects at once; a broken one waits.
      if (!ended) await sleep(reconnectDelay(attempt++))
    }
  })()
  return () => stop.abort()
}
