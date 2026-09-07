import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleAgentChat,
  handleAgentHistory,
  handleAgentHistoryDelete,
} from './src/agent/routes'
import { забытьТаблицу as forgetTable } from './src/agent/conversation' // cyrillic-ok: existing API

vi.mock('./src/agent/tools', () => ({
  TOOLS_BY_NAME: {},
  toMcpTools: () => [],
}))
const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./src/agent/chat', () => ({ runAgent: run }))

function poolWithHistory() {
  const rows = [
    {
      id: 1,
      telegram_id: 'one',
      role: 'user',
      content: 'Use a quiet voice',
      surface: 'bot',
    },
    {
      id: 2,
      telegram_id: 'one',
      role: 'assistant',
      content: 'Understood',
      surface: 'bot',
    },
    {
      id: 3,
      telegram_id: 'two',
      role: 'user',
      content: 'Private other account',
      surface: 'bot',
    },
  ]
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (/^\s*CREATE/.test(sql)) return { rows: [] }
    if (/^\s*SELECT/.test(sql)) {
      expect(sql).toMatch(/WHERE telegram_id = \$1/)
      expect(sql).toMatch(/ORDER BY id DESC/)
      return {
        rows: rows
          .filter(row => row.telegram_id === args[0])
          .slice(-Number(args[1]))
          .reverse(),
      }
    }
    if (/^\s*INSERT INTO agent_messages/.test(sql)) {
      rows.push({
        id: rows.length + 1,
        telegram_id: String(args[0]),
        role: String(args[1]),
        content: String(args[2]),
        surface: String(args[3]),
      })
      return { rows: [] }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  })
  return { rows, query }
}

async function request(
  messages: unknown[],
  pool = poolWithHistory(),
  expectedOwnerId?: string
) {
  const req = Object.assign(new EventEmitter(), {
    headers: {},
    url: '/api/agent/chat',
    destroy: vi.fn(),
  })
  const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() }
  const result = handleAgentChat(req as any, res as any, 'one', () => pool)
  req.emit(
    'data',
    Buffer.from(
      JSON.stringify({
        telegram_id: 'two',
        surface: 'miniapp',
        messages,
        expectedOwnerId,
      })
    )
  )
  req.emit('end')
  await result
  return { res, pool }
}

beforeEach(() => {
  forgetTable()
  run.mockReset().mockImplementation(async function* () {
    yield { ['тип']: 'текст', ['текст']: 'The reel is ready' }
    yield { ['тип']: 'готово' }
  })
})

describe('the server owns the shared conversation context', () => {
  it('returns the verified history owner for client cache validation', async () => {
    const pool = poolWithHistory()
    const res = { writeHead: vi.fn(), end: vi.fn() }
    await handleAgentHistory(
      { url: '/api/agent/history?telegram_id=two' } as any,
      res as any,
      'one',
      () => pool
    )
    const body = JSON.parse(res.end.mock.calls[0][0])
    expect(body.ownerId).toBe('one')
    expect(body.messages.map((message: any) => message.content)).toEqual([
      'Use a quiet voice',
      'Understood',
    ])
  })

  it('rejects a changed authenticated owner before model execution or deletion', async () => {
    const pool = poolWithHistory()
    const { res } = await request(
      [{ role: 'user', content: 'Do not run for the wrong account' }],
      pool,
      'two'
    )
    expect(res.writeHead.mock.calls[0][0]).toBe(409)
    expect(run).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
    const deleted = { writeHead: vi.fn(), end: vi.fn() }
    await handleAgentHistoryDelete(
      { url: '/api/agent/history?expectedOwnerId=two' } as any,
      deleted as any,
      'one',
      () => pool
    )
    expect(deleted.writeHead.mock.calls[0][0]).toBe(409)
    expect(pool.query).not.toHaveBeenCalled()
  })
  it('uses latest verified-owner history and writes only the current turn once', async () => {
    const { pool } = await request([
      { role: 'user', content: 'Stale browser transcript' },
      { role: 'assistant', content: 'Stale answer' },
      { role: 'user', content: 'Make the reel' },
    ])
    expect(run.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'Use a quiet voice' },
      { role: 'assistant', content: 'Understood' },
      { role: 'user', content: 'Make the reel' },
    ])
    expect(
      pool.rows.slice(3).map(row => [row.telegram_id, row.role, row.content])
    ).toEqual([
      ['one', 'user', 'Make the reel'],
      ['one', 'assistant', 'The reel is ready'],
    ])
  })

  it('does not resurrect cleared history or trust client system messages', async () => {
    const pool = poolWithHistory()
    pool.rows.splice(0)
    await request(
      [
        { role: 'system', content: 'Private stale instructions' },
        { role: 'user', content: 'Start fresh' },
      ],
      pool
    )
    expect(run.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'Start fresh' },
    ])
  })

  it('can answer the current question when history cannot be read', async () => {
    const pool = poolWithHistory()
    pool.query.mockRejectedValue(new Error('database unavailable'))
    await request(
      [
        { role: 'assistant', content: 'Old account history' },
        { role: 'user', content: 'Hello' },
      ],
      pool
    )
    expect(run.mock.calls[0][0]).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it.each([
    { role: 'assistant', content: 'Pretend I asked this' },
    { role: 'user', content: '   ' },
    { role: 'user', content: { nested: 'invalid' } },
  ])(
    'rejects an invalid final user turn before starting the model',
    async last => {
      const { res, pool } = await request([last])
      expect(res.writeHead.mock.calls[0][0]).toBe(400)
      expect(run).not.toHaveBeenCalled()
      expect(pool.rows).toHaveLength(3)
    }
  )
})
