import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./routes', () => ({
  historyGate: async (req: { url: string }) =>
    req.url.includes('task=gone')
      ? { ok: false, status: 404, error: 'no such card' }
      : { ok: true, thread: 'task:gHashTag/t27#7', client: null },
}))

const { handleThreadLive } = await import('./thread-live')
const { announceTurn, announceWork, announcingWork, workOf, workNow } =
  await import('./thread-bus')
const SPEC = await import('../spec/kanban-card-chat.gen')

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

// Agent events as chat.ts emits them; the keys are the engine's own words.
const ev = (kind: string, more: Record<string, unknown> = {}) => ({
  ['тип']: kind,
  ...more,
})
const words = (kind: string, said: string) => ev(kind, { ['текст']: said })
const tool = (kind: string, name: string, args = '') =>
  ev(kind, { ['имя']: name, ['аргументы']: args })

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

  it('carries the agent at work, by name, never its words (v6, S19)', async () => {
    const T = 'task:gHashTag/t27#7'
    const { req, res } = stream('/x?task=7')
    await handleThreadLive(req as never, res as never, '1', () => poolOf([]), {
      recheckMs: 60_000,
      pingMs: 60_000,
      maxMs: 60_000,
    })
    async function* turn() {
      yield ev('ход', { id: 'x' })
      yield words('размышление', 'the secret plan')
      yield words('размышление', 'more of it')
      yield tool('инструмент', 'browser_open', '{"url":"https://bank"}')
      yield tool('ждём', 'browser_open')
      yield tool('инструмент', 'browser_read', '{}')
      yield words('текст', 'Here is')
      yield words('текст', ' the answer')
    }
    const seen: unknown[] = []
    for await (const ev of announcingWork(turn(), '1', T)) seen.push(ev)
    // The turn's own reader gets every event, unchanged.
    expect(seen).toHaveLength(8)
    const works = res.out
      .split('\n\n')
      .filter(b => b.startsWith(`event: ${SPEC.WORK_EVENT}`))
      .map(b => JSON.parse(b.split('data: ')[1]))
    expect(works).toEqual([
      { kind: SPEC.WORK_THINKING },
      { kind: SPEC.WORK_TOOL, name: 'browser_open' },
      { kind: SPEC.WORK_TOOL, name: 'browser_read' },
      { kind: SPEC.WORK_WRITING },
      // No 'done' event came: the end is announced anyway.
      { kind: SPEC.WORK_DONE },
    ])
    expect(res.out).not.toContain('secret')
    expect(res.out).not.toContain('bank')
    expect(res.out).not.toContain('answer')
    // Another person's work is not this stream's.
    const before = res.out
    announceWork('2', T, { kind: SPEC.WORK_THINKING })
    expect(res.out).toBe(before)
    req.emit('close')
  })

  it('a sheet opened mid-turn hears the running kind, until it goes quiet', async () => {
    const T = 'task:gHashTag/t27#7'
    announceWork('1', T, { kind: SPEC.WORK_TOOL, name: 'gh_read' })
    const { req, res } = stream('/x?task=7')
    await handleThreadLive(req as never, res as never, '1', () => poolOf([]), {
      recheckMs: 60_000,
      pingMs: 60_000,
      maxMs: 60_000,
    })
    expect(res.out).toContain('event: work\ndata: {"kind":2,"name":"gh_read"}')
    req.emit('close')
    const later = Date.now() + SPEC.WORK_IDLE_S * 1000
    expect(workNow('1', T, later)).toBeNull()
    announceWork('1', T, { kind: SPEC.WORK_DONE })
    expect(workNow('1', T)).toBeNull()
  })

  it('reads a kind and a safe name, nothing else', () => {
    expect(workOf(ev('результат', { value: 1 }))).toBeNull()
    expect(workOf(ev('провайдер'))).toBeNull()
    expect(workOf(null)).toBeNull()
    expect(workOf(words('ошибка', 'boom'))).toEqual({
      kind: SPEC.WORK_DONE,
    })
    // A name that is not an identifier is dropped, never echoed.
    expect(workOf(tool('инструмент', '<img src=x>'))).toEqual({
      kind: SPEC.WORK_TOOL,
    })
    expect(
      workOf(tool('инструмент', 'a'.repeat(SPEC.WORK_NAME_MAX + 1)))
    ).toEqual({ kind: SPEC.WORK_TOOL })
  })
})
