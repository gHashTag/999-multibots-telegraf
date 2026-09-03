import { describe, expect, it, vi } from 'vitest'
import {
  appendConversationMessage,
  clearConversationHistory,
  findConversationMessage,
  loadConversationHistory,
  withConversationOwnerLock,
} from './conversation'

function fakePool() {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('LIMIT 0')) return { rows: [] }
    if (sql.includes('INSERT INTO agent_conversation_messages')) {
      return {
        rows: [
          {
            id: '7',
            telegram_id: values[0],
            channel: values[1],
            external_id: values[2],
            role: values[3],
            content: values[4],
            metadata: values[5],
            created_at: '2026-09-01T10:00:00.000Z',
          },
        ],
      }
    }
    if (sql.includes('SELECT id, telegram_id')) {
      expect(values).toEqual(['owner-1', 20])
      return {
        rows: [
          {
            id: '7',
            telegram_id: 'owner-1',
            channel: 'telegram',
            external_id: 'update:5',
            role: 'user',
            content: 'Сделай план',
            metadata: {},
            created_at: '2026-09-01T10:00:00.000Z',
          },
        ],
      }
    }
    return { rows: [] }
  })
  return { query }
}

describe('canonical agent conversation store', () => {
  it('stores an owner-scoped idempotent channel message', async () => {
    const pool = fakePool()
    const result = await appendConversationMessage(pool, {
      telegramId: 'owner-1',
      channel: 'telegram',
      externalId: 'update:5',
      role: 'user',
      content: 'Сделай план',
    })

    expect(result.inserted).toBe(true)
    expect(result.message?.telegramId).toBe('owner-1')
    const insert = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO agent_conversation_messages')
    )
    expect(String(insert?.[0])).toContain('ON CONFLICT')
    expect(insert?.[1]).toEqual([
      'owner-1',
      'telegram',
      'update:5',
      'user',
      'Сделай план',
      {},
    ])
  })

  it('loads only the verified owner tail in oldest-first order', async () => {
    const pool = fakePool()
    const rows = await loadConversationHistory(pool, 'owner-1', 20)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      telegramId: 'owner-1',
      channel: 'telegram',
      role: 'user',
      content: 'Сделай план',
    })
    const select = pool.query.mock.calls.find(
      ([sql]) =>
        String(sql).includes('SELECT id, telegram_id') &&
        !String(sql).includes('LIMIT 0')
    )
    expect(String(select?.[0])).toContain('WHERE m.telegram_id = $1')
    expect(String(select?.[0])).toContain('ORDER BY id DESC')
  })

  it('clears only one verified owner history', async () => {
    const pool = fakePool()
    await clearConversationHistory(pool, 'owner-2')
    const deletion = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO agent_conversation_state')
    )
    expect(deletion?.[1]).toEqual(['owner-2'])
  })

  it('finds one owner and channel scoped idempotency record', async () => {
    const pool = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes('LIMIT 0')) return { rows: [] }
        expect(values).toEqual(['owner-1', 'telegram', 'reply:1'])
        return {
          rows: [
            {
              id: '9',
              telegram_id: 'owner-1',
              channel: 'telegram',
              external_id: 'reply:1',
              role: 'assistant',
              content: 'Done',
              metadata: { delivery: 'sent' },
              created_at: '2026-09-01T10:00:00.000Z',
            },
          ],
        }
      }),
    }
    const found = await findConversationMessage(
      pool,
      'owner-1',
      'telegram',
      'reply:1'
    )
    expect(found?.metadata.delivery).toBe('sent')
  })

  it('holds and releases a PostgreSQL owner advisory lock', async () => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes('pg_try_advisory_lock') ? [{ acquired: true }] : [],
      })),
      release: vi.fn(),
    }
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => client),
    }
    const work = vi.fn(async lockedPool => {
      await lockedPool.query('SELECT conversation_work')
      return 'ok'
    })

    await expect(
      withConversationOwnerLock(pool, 'owner-1', work)
    ).resolves.toBe('ok')
    const calls = client.query.mock.calls as unknown as Array<[string]>
    expect(calls[0]?.[0]).toContain('pg_try_advisory_lock')
    expect(calls.some(([sql]) => sql.includes('conversation_work'))).toBe(true)
    expect(pool.query).not.toHaveBeenCalled()
    expect(calls.at(-1)?.[0]).toContain('pg_advisory_unlock')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('keeps a connection budget for non-agent database traffic', async () => {
    const finish: Array<() => void> = []
    const clients: Array<{
      query: ReturnType<typeof vi.fn>
      release: ReturnType<typeof vi.fn>
    }> = []
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: vi.fn(async () => {
        const client = {
          query: vi.fn(async (sql: string) => ({
            rows: sql.includes('pg_try_advisory_lock')
              ? [{ acquired: true }]
              : [],
          })),
          release: vi.fn(),
        }
        clients.push(client)
        return client
      }),
    }
    const turns = Array.from({ length: 5 }, (_, index) =>
      withConversationOwnerLock(
        pool,
        `owner-${index}`,
        () => new Promise<void>(resolve => finish.push(resolve))
      )
    )

    await vi.waitFor(() => expect(pool.connect).toHaveBeenCalledTimes(4))
    expect(finish).toHaveLength(4)
    finish.shift()?.()
    await vi.waitFor(() => expect(pool.connect).toHaveBeenCalledTimes(5))
    for (const resolve of finish) resolve()
    await Promise.all(turns)
    expect(
      clients.every(client => client.release.mock.calls.length === 1)
    ).toBe(true)
  })

  it('rejects unbounded or malformed message fields before SQL', async () => {
    const pool = fakePool()
    await expect(
      appendConversationMessage(pool, {
        telegramId: '',
        channel: 'telegram',
        externalId: 'x',
        role: 'user',
        content: 'hello',
      })
    ).rejects.toThrow('telegramId')
    await expect(
      appendConversationMessage(pool, {
        telegramId: '1',
        channel: 'telegram',
        externalId: 'x',
        role: 'user',
        content: 'x'.repeat(50_001),
      })
    ).rejects.toThrow('content')
    expect(pool.query).not.toHaveBeenCalled()
  })
})
