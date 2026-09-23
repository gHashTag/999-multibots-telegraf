/**
 * EVERY SELLER ANSWERS AS THEMSELVES.
 *
 * Owner, 2026-09-23: the agent in his wife's profile wrote as him. Nothing
 * ever said whose chat a business turn was: it carried the CLIENT's id and a
 * surface, and the render filled the seller in from `OWNER_TELEGRAM_ID` --
 * one id for the whole platform. So a second seller's client was answered out
 * of the PLATFORM OWNER's correspondence with that person, his client
 * packages and his debts.
 *
 * What is pinned here: the seller comes from the request, absence is absence
 * (never the platform owner), and the id is only believed behind the server
 * key -- from a Mini App session it would be a way to ask for somebody else's
 * CRM by writing their id in a body.
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '900000101'
const WIFE = '900000102'
const CLIENT = '900000103'

process.env.OWNER_TELEGRAM_ID = OWNER

const leadContext = vi.fn()
vi.mock('./src/agent/chat-memory', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  leadContext: (...a: unknown[]) => leadContext(...a),
}))
vi.mock('./src/agent/zep-memory', () => ({
  zepContext: vi.fn(async () => null),
}))

const { dmHistoryBlock } = await import('./src/agent/chat')

const ctx = () =>
  ({
    telegramId: CLIENT,
    pool: { query: async () => ({ rows: [] }) },
  }) as never

beforeEach(() => {
  leadContext.mockReset()
  leadContext.mockResolvedValue({
    messages: [
      {
        at: new Date('2026-09-20T10:00:00Z'),
        out: false,
        text: 'здравствуйте',
      }, // cyrillic-ok: a client line
    ],
    unanswered: false,
  })
})

describe('whose correspondence the agent reads', () => {
  it('is the seller whose chat it is -- not the platform owner', async () => {
    const text = await dmHistoryBlock(ctx(), WIFE)
    expect(text).toContain('здравствуйте') // cyrillic-ok: the client line
    // The history was read for HER, and the platform owner was never asked
    // about this person.
    const owners = leadContext.mock.calls.map(c => String(c[1]))
    expect(owners).toEqual([WIFE])
    expect(owners).not.toContain(OWNER)
  })

  it('with no seller named, there is NO history -- borrowed is worse than none', async () => {
    const text = await dmHistoryBlock(ctx())
    expect(text).toBe('')
    expect(leadContext).not.toHaveBeenCalled()
  })

  it('a seller writing to themselves has no "history with a client"', async () => {
    const text = await dmHistoryBlock(
      { ...ctx(), telegramId: WIFE } as never,
      WIFE
    )
    expect(text).toBe('')
    expect(leadContext).not.toHaveBeenCalled()
  })

  it('does not call the correspondence its owner-s: the heading is "yours"', async () => {
    const text = await dmHistoryBlock(ctx(), WIFE)
    expect(text).toContain('ИСТОРИЯ ТВОЕЙ ПЕРЕПИСКИ') // cyrillic-ok: the heading
    expect(text).not.toContain('ИСТОРИЯ ПЕРЕПИСКИ ВЛАДЕЛЬЦА') // cyrillic-ok: the old heading
  })
})
