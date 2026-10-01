import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./routes', () => ({
  historyGate: async (req: { url: string }) =>
    req.url.includes('task=gone')
      ? { ok: false, status: 404, error: 'no such card' }
      : { ok: true, thread: 'task:gHashTag/t27#7', client: null },
}))

const { handleThreadLive } = await import('./thread-live')
const { announceTurn } = await import('./thread-bus')

function stream(url: string) {
  const req = Object.assign(new EventEmitter(), { url })
  const res = Object.assign(new EventEmitter(), {
    status: 0,
    out: '',
    ended: false,
    writeHead(s: number) {
      this.status = s
    },
    write(s: string) {
      this.out += s
      return true
    },
    end(s?: string) {
      if (s) this.out += s
      this.ended = true
    },
  })
  return { req, res }
}

function poolOf(rows: Array<{ id: number }>) {
  const query = vi.fn(async (_sql: string, args: unknown[]) => ({
    rows: rows
      .filter(r => r.id > Number(args[2]))
      .map(r => ({
        ...r,
        role: 'agent',
        content: `turn ${r.id}`,
        surface: 'a2a',
        created_at: 't',
      })),
  }))
  return { query }
}

const tick = () => new Promise(r => setTimeout(r, 5))

describe('a card thread, live (spec v5, S17)', () => {
  it('asks for a card and the same gate as the history', async () => {
    const pool = poolOf([])
    const none = stream('/api/agent/history/live')
    await handleThreadLive(
      none.req as never,
      none.res as never,
      '1',
      () => pool
    )
    expect(none.res.status).toBe(400)
    const gone = stream('/x?task=gone')
    await handleThreadLive(
      gone.req as never,
      gone.res as never,
      '1',
      () => pool
    )
    expect(gone.res.status).toBe(404)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('sends only turns after the last id, and a written turn at once', async () => {
    const rows = [{ id: 9 }, { id: 10 }, { id: 11 }]
    const pool = poolOf(rows)
    const { req, res } = stream('/x?task=7&after=9')
    await handleThreadLive(req as never, res as never, '1', () => pool, {
      recheckMs: 60_000,
      pingMs: 60_000,
      maxMs: 60_000,
    })
    expect(res.status).toBe(200)
    expect(res.out).not.toContain('turn 9')
    expect(res.out).toContain('id: 10\nevent: turn')
    expect(res.out).toContain('"content":"turn 11"')

    rows.push({ id: 12 })
    announceTurn('1', 'task:gHashTag/t27#7')
    await tick()
    expect(res.out).toContain('"content":"turn 12"')
    expect(res.out.match(/turn 11/g)).toHaveLength(1)

    // Another person's turn is not this stream's business.
    const before = pool.query.mock.calls.length
    announceTurn('2', 'task:gHashTag/t27#7')
    await tick()
    expect(pool.query.mock.calls.length).toBe(before)

    // Closed: the bus no longer reaches it.
    req.emit('close')
    rows.push({ id: 13 })
    announceTurn('1', 'task:gHashTag/t27#7')
    await tick()
    expect(res.out).not.toContain('turn 13')
  })

  it('ends with the last id so the browser reconnects from there', async () => {
    const { req, res } = stream('/x?task=7')
    await handleThreadLive(
      req as never,
      res as never,
      '1',
      () => poolOf([{ id: 3 }]),
      {
        recheckMs: 60_000,
        pingMs: 60_000,
        maxMs: 10,
      }
    )
    await new Promise(r => setTimeout(r, 30))
    expect(res.out).toContain('event: end\ndata: {"after":3}')
    expect(res.ended).toBe(true)
  })
})
