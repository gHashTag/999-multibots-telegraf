import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { handleAgentChat, handleAgentHistory } from './routes'

function response() {
  const state = {
    status: 0,
    body: '',
    headersSent: false,
    writableEnded: false,
  }
  return {
    state,
    res: {
      get headersSent() {
        return state.headersSent
      },
      get writableEnded() {
        return state.writableEnded
      },
      writeHead: vi.fn((status: number) => {
        state.status = status
        state.headersSent = true
      }),
      write: vi.fn((chunk: string) => {
        state.body += chunk
      }),
      end: vi.fn((chunk?: string) => {
        if (chunk) state.body += chunk
        state.writableEnded = true
      }),
    } as any,
  }
}

describe('agent conversation HTTP failure boundaries', () => {
  it('returns a redacted 503 when chat DB acquisition fails', async () => {
    const { res, state } = response()
    await expect(
      handleAgentChat({ method: 'POST' } as any, res, 'owner-1', async () => {
        throw new Error('private database detail')
      })
    ).resolves.toBeUndefined()
    expect(state.status).toBe(503)
    expect(state.body).not.toContain('private database detail')
  })

  it('returns a redacted 503 when history DB acquisition fails', async () => {
    const { res, state } = response()
    await expect(
      handleAgentHistory({ method: 'GET' } as any, res, 'owner-1', async () => {
        throw new Error('private database detail')
      })
    ).resolves.toBeUndefined()
    expect(state.status).toBe(503)
    expect(state.body).not.toContain('private database detail')
  })

  it('does not replay an incomplete duplicate Mini App turn', async () => {
    const { res, state } = response()
    let insertCount = 0
    const pool = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes('LIMIT 0')) return { rows: [] }
        if (sql.includes('INSERT INTO agent_conversation_messages')) {
          insertCount += 1
          if (insertCount === 1) return { rows: [] }
          return {
            rows: [
              {
                id: '2',
                telegram_id: values[0],
                channel: values[1],
                external_id: values[2],
                role: values[3],
                content: values[4],
                metadata: values[5],
                created_at: '2026-09-01T10:00:01.000Z',
              },
            ],
          }
        }
        if (sql.includes('WHERE telegram_id = $1 AND channel = $2')) {
          return { rows: [] }
        }
        return { rows: [] }
      }),
    }
    const req = Readable.from([
      JSON.stringify({
        message: 'Create my plan',
        client_message_id: 'mini:retry-1',
      }),
    ]) as any
    req.method = 'POST'
    req.headers = {}

    await handleAgentChat(req, res, 'owner-1', async () => pool)

    expect(state.status).toBe(409)
    expect(state.body).toContain('сообщение уже принято')
    expect(insertCount).toBe(2)
    const recoveryInsert = pool.query.mock.calls.find(
      ([sql, values]) =>
        String(sql).includes('INSERT INTO agent_conversation_messages') &&
        Array.isArray(values) &&
        values[2] === 'mini-reply:retry-1'
    )
    expect(recoveryInsert?.[1]).toEqual([
      'owner-1',
      'mini_app',
      'mini-reply:retry-1',
      'assistant',
      expect.stringContaining('не повторён автоматически'),
      { tools: [], interrupted: true },
    ])
  })
})
