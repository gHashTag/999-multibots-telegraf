/**
 * THE CASH MONTH IS RECORDED BY THE RENDER, NOT HERE.
 *
 * The bot's clubCash service writes nothing itself: it carries one question
 * to the render's /mcp door and the answer back. What this test pins is the
 * QUESTION -- the door, the server key, and whose name the ask travels under
 * -- because that trio is the whole security story:
 *
 *   - the door is POST /mcp, the one place DIRECT_CALL_ONLY tools answer;
 *   - the caller is named by `?telegram_id=<the admin who pressed>`, never a
 *     constant, so the render's owner/keeper gate sees the real person;
 *   - the key is the server key both services already share.
 *
 * The double speaks the render's JSON-RPC shapes; it refuses any other host,
 * path, or key shape the way a wrong request would fail in production.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { recordCashClubMonth, ClubUnavailableError } from '@/services/clubCash'

const RENDER_ORIGIN = 'https://vibee-render-production.up.railway.app'
const KEY = 'shared-server-key-for-the-cash-month'
const OWNER = '144022504'
const MEMBER = '6716532024'

interface Seen {
  url: string
  method: string
  apiKey: string | undefined
  body: any
}

function mcpDouble(answer: () => Response | Promise<Response>) {
  const seen: Seen[] = []
  const fetchImpl = async (url: unknown, init: RequestInit = {}) => {
    const u = new URL(String(url))
    if (u.origin !== RENDER_ORIGIN) {
      throw new Error(`no such host in this test: ${u.origin}`)
    }
    if (u.pathname !== '/mcp') {
      throw new Error(`no such path in this test: ${u.pathname}`)
    }
    seen.push({
      url: String(url),
      method: String(init.method ?? 'GET').toUpperCase(),
      apiKey: (init.headers as Record<string, string>)['X-Api-Key'],
      body: JSON.parse(String(init.body ?? '{}')),
    })
    return answer()
  }
  return { seen, fetchImpl }
}

const json = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response

const okRpc = (structuredContent: unknown) =>
  json(200, {
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: 'x' }], structuredContent },
  })

describe('recordCashClubMonth', () => {
  const realKey = process.env.RENDER_API_KEY
  beforeEach(() => {
    process.env.RENDER_API_KEY = KEY
  })
  afterEach(() => {
    process.env.RENDER_API_KEY = realKey
  })

  it('asks the render’s /mcp door, under the pressing admin’s name, with the server key', async () => {
    const { seen, fetchImpl } = mcpDouble(() =>
      okRpc({
        ok: true,
        recorded: 'now',
        telegram_id: MEMBER,
        start: '2026-09-23T00:00:00.000Z',
        until: '2026-10-23T00:00:00.000Z',
        tokens: 2571,
        credited: true,
      })
    )
    const answer = await recordCashClubMonth(OWNER, MEMBER, { fetchImpl })
    expect(answer).toEqual({
      ok: true,
      recorded: 'now',
      telegram_id: MEMBER,
      start: '2026-09-23T00:00:00.000Z',
      until: '2026-10-23T00:00:00.000Z',
      tokens: 2571,
      credited: true,
    })
    expect(seen).toHaveLength(1)
    const call = seen[0]
    expect(call.method).toBe('POST')
    expect(call.url).toBe(`${RENDER_ORIGIN}/mcp?telegram_id=${OWNER}`)
    expect(call.apiKey).toBe(KEY)
    expect(call.body.method).toBe('tools/call')
    expect(call.body.params.name).toBe('club_cash_month')
    expect(call.body.params.arguments).toEqual({ telegram_id: MEMBER })
  })

  it('carries the start day and the by-hand flag as tool arguments only when given', async () => {
    const { seen, fetchImpl } = mcpDouble(() =>
      okRpc({ ok: false, error: 'no' })
    )
    await recordCashClubMonth(OWNER, MEMBER, {
      fetchImpl,
      start: '2026-09-25',
      byHand: true,
    })
    expect(seen[0].body.params.arguments).toEqual({
      telegram_id: MEMBER,
      start: '2026-09-25',
      tokens_already_given: true,
    })
  })

  it('a thrown gate (owner/keeper) arrives as the render’s refusal, not an exception', async () => {
    const { fetchImpl } = mcpDouble(() =>
      json(200, {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32003,
          message:
            'Инструмент «club_cash_month» упал: Оплату клуба наличными записывает только владелец платформы или хранитель',
        },
      })
    )
    const answer = await recordCashClubMonth(OWNER, MEMBER, { fetchImpl })
    expect(answer.ok).toBe(false)
    expect(answer.ok === false && answer.error).toContain('только владелец')
  })

  it('a dead cashier throws ClubUnavailableError, never a silent verdict', async () => {
    const dead = {
      status: 502,
      json: async () => {
        throw new Error('not JSON')
      },
    } as unknown as Response
    const { fetchImpl } = mcpDouble(() => dead)
    await expect(
      recordCashClubMonth(OWNER, MEMBER, { fetchImpl })
    ).rejects.toBeInstanceOf(ClubUnavailableError)
  })

  it('without RENDER_API_KEY there is no question to carry', async () => {
    delete process.env.RENDER_API_KEY
    await expect(recordCashClubMonth(OWNER, MEMBER)).rejects.toBeInstanceOf(
      ClubUnavailableError
    )
  })

  it('refuses ids that are not telegram ids -- nobody is asked', async () => {
    const { seen, fetchImpl } = mcpDouble(() => okRpc({ ok: true }))
    await expect(
      recordCashClubMonth('admin', MEMBER, { fetchImpl })
    ).rejects.toBeInstanceOf(ClubUnavailableError)
    await expect(
      recordCashClubMonth(OWNER, 'not-an-id', { fetchImpl })
    ).rejects.toBeInstanceOf(ClubUnavailableError)
    expect(seen).toHaveLength(0)
  })
})
