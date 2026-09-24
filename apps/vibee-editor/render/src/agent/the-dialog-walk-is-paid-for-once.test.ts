/**
 * THE JUSTIFICATION WAS FALSE, AND THE COST WAS REAL.
 *
 * On 24.09.2026 the seller's timer began calling this batch every half hour,
 * and the comment that justified it said the Telegram session was already
 * warm after ingest. It is not: `withClient` hangs up at the end of EVERY
 * tool call, so the batch opens its own cold connection whatever ran before
 * it. Which meant a full 200-dialog walk twice an hour, on an account
 * Telegram rate-limits, bought with a sentence that was not true.
 *
 * The walk exists for one reason: a fresh client knows no entity, so a BARE
 * ID resolves only after the dialogs have been listed. A `@username` needs
 * nothing. So it is paid for when -- and only when -- somebody in the batch
 * has no username.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const withClient = vi.fn()
vi.mock('./telegram-tools', () => ({
  requireSeller: vi.fn(async () => undefined),
  withClient: (ctx: unknown, fn: (c: unknown) => unknown) =>
    withClient(ctx, fn),
}))
vi.mock('./tools', () => ({ publishImageBytes: vi.fn(async () => '') }))

import { CRM_AVATAR_TOOLS } from './crm-avatars'

/** Answers the ALTERs and hands back exactly the people asked for. */
const poolWith = (
  due: Array<{ lead_id: string; username: string | null }>
) => ({
  async query(q: string) {
    if (/SELECT lead_id/.test(q)) return { rows: due }
    return { rows: [] }
  },
})

/** A client that records whether the dialogs were walked. */
const clientThat = (walked: { yes: boolean }) => ({
  getDialogs: vi.fn(async () => {
    walked.yes = true
    return []
  }),
  downloadProfilePhoto: vi.fn(async () => undefined),
})

const run = async (
  due: Array<{ lead_id: string; username: string | null }>
) => {
  const walked = { yes: false }
  withClient.mockImplementation(async (_ctx: unknown, fn: any) =>
    fn(clientThat(walked))
  )
  await CRM_AVATAR_TOOLS[0]!.handler({ limit: 8 }, {
    telegramId: '900000001',
    pool: poolWith(due),
  } as never)
  return walked.yes
}

beforeEach(() => vi.clearAllMocks())

describe('the dialog walk is paid for only when it buys something', () => {
  it('everybody has a username: no walk', async () => {
    expect(
      await run([
        { lead_id: '900000002', username: 'ann' },
        { lead_id: '900000003', username: 'bob' },
      ])
    ).toBe(false)
  })

  it('one bare id in the batch: the walk happens', async () => {
    expect(
      await run([
        { lead_id: '900000002', username: 'ann' },
        { lead_id: '900000003', username: null },
      ])
    ).toBe(true)
  })

  it('nobody due: no session is opened at all', async () => {
    await CRM_AVATAR_TOOLS[0]!.handler({ limit: 8 }, {
      telegramId: '900000001',
      pool: poolWith([]),
    } as never)
    expect(withClient).not.toHaveBeenCalled()
  })
})
