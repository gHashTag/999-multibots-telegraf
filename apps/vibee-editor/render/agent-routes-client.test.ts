/**
 * THE FOUR AGENT ROUTES WITH `client`: GATED BEFORE THE DATABASE, THREADED AFTER.
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * `body.client` / `?client=` maps to thread 'client:<id>'. A bad id is 400, a
 * caller who is not a seller is 403, the owner naming themselves is 400 -- and
 * all three happen before any read of agent_messages. Without `client` the
 * routes behave as before (thread 'self').
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Readable } from 'node:stream'

const SELLER = '144022504'
const STRANGER = '900000042'
const CLIENT = '435572800'

let seenOpts: Record<string, unknown> | null = null
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (
    _h: unknown,
    _ctx: unknown,
    opts: Record<string, unknown>
  ) {
    seenOpts = opts
    yield { ['тип']: 'текст', ['текст']: 'ok' } // cyrillic-ok: pre-existing event envelope
  },
}))
vi.mock('./src/agent/telegram-tools', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSeller: async (ctx: { telegramId: string }) =>
    String(ctx.telegramId) === SELLER,
}))

import {
  handleAgentChat,
  handleAgentHistory,
  handleAgentHistoryDelete,
  handleAgentHistoryAppend,
  threadFor,
} from './src/agent/routes'
import { забытьТаблицу as forgetTable } from './src/agent/conversation' // cyrillic-ok: pre-existing identifier

function req(url: string, method: string, body?: unknown) {
  const s = Readable.from([
    body === undefined ? '' : JSON.stringify(body),
  ]) as any
  s.headers = { 'content-type': 'application/json' }
  s.method = method
  s.url = url
  return s
}

function res() {
  const out: { code?: number; body?: any; written: string[] } = { written: [] }
  return {
    out,
    writeHead(code: number) {
      out.code = code
      return this
    },
    write(c: string) {
      out.written.push(c)
      return true
    },
    end(text?: string) {
      if (text)
        try {
          out.body = JSON.parse(text)
        } catch {
          out.body = text
        }
    },
    setHeader() {},
  } as any
}

function recordingPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const rows: any[] = []
  const pool = {
    calls,
    rows,
    async query(sql: string, params: unknown[] = []) {
      const text = sql.replace(/\s+/g, ' ').trim()
      calls.push({ sql: text, params })
      if (/^(CREATE|ALTER)/i.test(text)) return { rows: [] }
      if (/^INSERT INTO agent_messages/i.test(text)) {
        rows.push({
          id: rows.length + 1,
          telegram_id: params[0],
          role: params[1],
          content: params[2],
          surface: params[3],
          thread: params[4],
        })
        return { rows: [] }
      }
      if (/^SELECT/i.test(text))
        return {
          rows: rows.filter(
            r => r.telegram_id === params[0] && r.thread === params[2]
          ),
        }
      if (/^DELETE/i.test(text)) {
        const before = rows.length
        const keep = rows.filter(
          r => !(r.telegram_id === params[0] && r.thread === params[1])
        )
        rows.length = 0
        rows.push(...keep)
        return { rows: [], rowCount: before - keep.length }
      }
      throw new Error('unknown sql ' + text)
    },
  }
  return pool
}

let pool: ReturnType<typeof recordingPool>
beforeEach(() => {
  forgetTable()
  pool = recordingPool()
  seenOpts = null
})
const getPool = () => pool
const threadQueries = () =>
  pool.calls.filter(
    c => /agent_messages/.test(c.sql) && !/^(CREATE|ALTER)/i.test(c.sql)
  )

describe('threadFor', () => {
  it('is self without a client and never touches the pool', async () => {
    expect(await threadFor(undefined, SELLER, getPool)).toEqual({
      ok: true,
      thread: 'self',
      client: null,
    })
    expect(await threadFor('', SELLER, getPool)).toMatchObject({
      thread: 'self',
    })
    expect(pool.calls.length).toBe(0)
  })
  it('refuses a bad id, the owner as client, and a non-seller', async () => {
    expect(await threadFor('abc', SELLER, getPool)).toEqual({
      ok: false,
      status: 400,
      error: 'bad client',
    })
    expect(await threadFor(SELLER, SELLER, getPool)).toEqual({
      ok: false,
      status: 400,
      error: 'bad client',
    })
    expect(await threadFor(CLIENT, STRANGER, getPool)).toEqual({
      ok: false,
      status: 403,
      error: 'not a seller',
    })
    expect(await threadFor(CLIENT, SELLER, getPool)).toEqual({
      ok: true,
      thread: 'client:' + CLIENT,
      client: CLIENT,
    })
  })
})

describe('the four routes with a client', () => {
  it('chat: 400 / 403 before the stream opens and before any thread read', async () => {
    const bad = res()
    await handleAgentChat(
      req('/api/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'x' }],
        client: 'nope',
      }),
      bad,
      SELLER,
      getPool
    )
    expect(bad.out.code).toBe(400)
    expect(bad.out.body).toEqual({ error: 'bad client' })
    const stranger = res()
    await handleAgentChat(
      req('/api/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'x' }],
        client: CLIENT,
      }),
      stranger,
      STRANGER,
      getPool
    )
    expect(stranger.out.code).toBe(403)
    expect(stranger.out.body).toEqual({ error: 'not a seller' })
    const self = res()
    await handleAgentChat(
      req('/api/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'x' }],
        client: SELLER,
      }),
      self,
      SELLER,
      getPool
    )
    expect(self.out.code).toBe(400)
    expect(threadQueries().length).toBe(0)
    expect(seenOpts).toBeNull()
  })

  it('chat: writes both turns into the client thread and hands the client to the agent', async () => {
    const r = res()
    await handleAgentChat(
      req('/api/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'what about her?' }],
        client: CLIENT,
        surface: 'miniapp',
      }),
      r,
      SELLER,
      getPool
    )
    expect(r.out.code).toBe(200)
    expect(seenOpts).toMatchObject({ client: CLIENT, surface: 'miniapp' })
    expect(pool.rows.map(x => [x.role, x.thread])).toEqual([
      ['user', 'client:' + CLIENT],
      ['assistant', 'client:' + CLIENT],
    ])
  })

  it('chat without a client is unchanged: thread self, no client for the agent', async () => {
    await handleAgentChat(
      req('/api/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'hi' }],
      }),
      res(),
      SELLER,
      getPool
    )
    expect(seenOpts).toMatchObject({ client: undefined })
    expect(pool.rows.every(x => x.thread === 'self')).toBe(true)
  })

  it('history GET: returns only that thread, every message carrying it', async () => {
    pool.rows.push({
      id: 1,
      telegram_id: SELLER,
      role: 'user',
      content: 'mine',
      surface: 'bot',
      thread: 'self',
    })
    pool.rows.push({
      id: 2,
      telegram_id: SELLER,
      role: 'user',
      content: 'hers',
      surface: 'miniapp',
      thread: 'client:' + CLIENT,
    })
    const r = res()
    await handleAgentHistory(
      req(`/api/agent/history?limit=50&client=${CLIENT}`, 'GET'),
      r,
      SELLER,
      getPool
    )
    expect(r.out.code).toBe(200)
    expect(r.out.body.thread).toBe('client:' + CLIENT)
    expect(r.out.body.messages.map((m: any) => [m.content, m.thread])).toEqual([
      ['hers', 'client:' + CLIENT],
    ])
    const s = res()
    await handleAgentHistory(
      req(`/api/agent/history?client=${CLIENT}`, 'GET'),
      s,
      STRANGER,
      getPool
    )
    expect(s.out.code).toBe(403)
    expect(threadQueries().filter(c => /SELECT/.test(c.sql)).length).toBe(1)
  })

  it('history DELETE with a client clears that thread only', async () => {
    pool.rows.push({
      id: 1,
      telegram_id: SELLER,
      role: 'user',
      content: 'mine',
      surface: 'bot',
      thread: 'self',
    })
    pool.rows.push({
      id: 2,
      telegram_id: SELLER,
      role: 'user',
      content: 'hers',
      surface: 'miniapp',
      thread: 'client:' + CLIENT,
    })
    const r = res()
    await handleAgentHistoryDelete(
      req(`/api/agent/history?client=${CLIENT}`, 'DELETE'),
      r,
      SELLER,
      getPool
    )
    expect(r.out.code).toBe(200)
    expect(r.out.body).toMatchObject({ ok: true, thread: 'client:' + CLIENT })
    expect(pool.rows.map(x => x.content)).toEqual(['mine'])
    const bad = res()
    await handleAgentHistoryDelete(
      req('/api/agent/history?client=12', 'DELETE'),
      bad,
      SELLER,
      getPool
    )
    expect(bad.out.code).toBe(400)
  })

  it('history POST appends into the client thread and refuses a stranger first', async () => {
    const r = res()
    await handleAgentHistoryAppend(
      req('/api/agent/history', 'POST', {
        turns: [{ role: 'assistant', content: 'fallback' }],
        client: CLIENT,
      }),
      r,
      SELLER,
      getPool
    )
    expect(r.out.body).toMatchObject({
      ok: true,
      stored: 1,
      thread: 'client:' + CLIENT,
    })
    expect(pool.rows[0].thread).toBe('client:' + CLIENT)
    const before = threadQueries().length
    const s = res()
    await handleAgentHistoryAppend(
      req('/api/agent/history', 'POST', {
        turns: [{ role: 'assistant', content: 'x' }],
        client: CLIENT,
      }),
      s,
      STRANGER,
      getPool
    )
    expect(s.out.code).toBe(403)
    expect(threadQueries().length).toBe(before)
  })
})
