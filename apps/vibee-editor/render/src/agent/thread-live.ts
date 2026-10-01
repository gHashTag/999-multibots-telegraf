import type { IncomingMessage, ServerResponse } from 'node:http'
import * as SPEC from '../spec/kanban-card-chat.gen'
import { onTurn } from './thread-bus'
import { historyGate } from './routes'

/**
 * LIVE_DOOR: a card's thread, live in the open sheet (spec
 * kanban-card-chat.t27 v5, S17).
 *
 * An A2A agent writing into the same task shows up in the sheet without a
 * reload. The stream is the person's (LIVE_PER_PERSON: the same gate as the
 * history) and sends only rows newer than `?after=` (LIVE_AFTER_ID), so a
 * reconnect never replays the conversation. Rows arrive three ways, in order
 * of speed: this process wrote them (thread-bus), the recheck found them
 * (LIVE_RECHECK_S, for another replica's write), or the next connection's
 * first read did. A ping under the platform proxy's idle cut keeps the
 * stream open; after LIVE_STREAM_MAX_S it ends and the browser reconnects
 * with the last id it saw.
 *
 *   event: turn   data: {id, role, content, surface, created_at}
 *   event: end    data: {after}      reconnect with ?after=<after>
 */

export function liveFresh(id: number, lastSeen: number): boolean {
  return id > lastSeen
}

/** At most this many rows per read: a backlog arrives in pages, not at once. */
const PAGE = 50

export async function handleThreadLive(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any,
  opts: { recheckMs?: number; pingMs?: number; maxMs?: number } = {}
): Promise<void> {
  const url = new URL(req.url || '', 'http://x')
  if (!url.searchParams.get('task')) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: false,
        error: 'the live stream is a card thread: ?task= is required',
      })
    )
    return
  }
  const gate = await historyGate(req, telegramId, getPool)
  if (!gate.ok) {
    res.writeHead(gate.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: gate.error }))
    return
  }
  const thread = gate.thread
  const after = Number(url.searchParams.get('after') || 0)
  let last = Number.isInteger(after) && after > 0 ? after : 0

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  let closed = false
  let reading = false
  let again = false
  const pull = async (): Promise<void> => {
    if (closed) return
    if (reading) {
      again = true
      return
    }
    reading = true
    try {
      do {
        again = false
        const pool = await getPool()
        const r = await pool.query(
          `SELECT id, role, content, surface, created_at::text AS created_at
             FROM agent_messages
            WHERE telegram_id = $1 AND thread = $2 AND id > $3
            ORDER BY id ASC
            LIMIT $4`,
          [String(telegramId), thread, last, PAGE]
        )
        for (const row of r.rows || []) {
          const id = Number(row.id)
          if (closed || !liveFresh(id, last)) continue
          last = id
          res.write(
            `id: ${id}\nevent: turn\ndata: ${JSON.stringify({
              id,
              role: row.role,
              content: String(row.content),
              surface: String(row.surface || 'unknown'),
              created_at: row.created_at,
            })}\n\n`
          )
        }
        if ((r.rows || []).length === PAGE) again = true
      } while (again && !closed)
    } catch {
      // A missing table or a dropped connection: the recheck tries again,
      // and the sheet keeps what it has.
    } finally {
      reading = false
    }
  }

  const stopListening = onTurn(telegramId, thread, () => void pull())
  const recheck = setInterval(
    () => void pull(),
    opts.recheckMs ?? SPEC.LIVE_RECHECK_S * 1000
  )
  const ping = setInterval(
    () => !closed && res.write(': ping\n\n'),
    opts.pingMs ?? SPEC.LIVE_PING_S * 1000
  )
  const close = () => {
    if (closed) return
    closed = true
    stopListening()
    clearInterval(recheck)
    clearInterval(ping)
    clearTimeout(ending)
  }
  const ending = setTimeout(
    () => {
      if (closed) return
      res.write(`event: end\ndata: ${JSON.stringify({ after: last })}\n\n`)
      close()
      res.end()
    },
    opts.maxMs ?? SPEC.LIVE_STREAM_MAX_S * 1000
  )
  req.on('close', close)
  res.on('close', close)

  await pull()
}
