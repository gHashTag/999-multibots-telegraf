/**
 * The two-sided reward: inviter and invited, each on its own.
 *
 * WHY A SECOND SIDE. In a one-sided programme, following the link gives the
 * person being invited nothing. Market practice is to pay both sides.
 *
 * HONESTLY ABOUT THE EVIDENCE: on OUR data the gain is not measured and could
 * not have been -- the one-sided reward has never once fired here (out of
 * 17,136 payments not a single one is a referral reward). This is a borrowed
 * hypothesis, and it should be switched on after the first side and with its
 * own number.
 *
 * WHY A SEPARATE NUMBER RATHER THAN THE SAME ONE. With 33 payers among the
 * invited, 100 stars to one side is 6% of revenue, while 200+200 to both is
 * 26% against an industry ceiling of 15% (docs/audit/referral-economics.md).
 * A two-sided programme means SPLITTING the budget, not doubling it.
 *
 * The properties this test guards:
 *   - both rewards are zero by default: the owner enables them, not the code;
 *   - the invited bonus goes to the INVITED person, not to the inviter;
 *   - the sides carry DIFFERENT invoice ids -- otherwise the second one hits
 *     the unique index and is silently never paid;
 *   - a failure on the first side does not cancel the second;
 *   - a self-invite is not rewarded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const directPaymentProcessor = vi.fn()

vi.mock('@/core/supabase/directPayment', () => ({
  directPaymentProcessor: (...a: unknown[]) => directPaymentProcessor(...a),
}))

const ENV_INVITED = 'REFERRAL_INVITED_BONUS_STARS'
const ENV_INVITER = 'REFERRAL_BONUS_STARS'
const saved = { ...process.env }

/**
 * The reward amount is read from the environment at module load, so the module
 * has to be loaded afresh for every value. `vi.resetModules()` alone would not
 * do: the old copy would stay in the cache with the old constant.
 */
async function loadInvited(stars: number | undefined) {
  vi.resetModules()
  if (stars === undefined) delete process.env[ENV_INVITED]
  else process.env[ENV_INVITED] = String(stars)
  return import('@/core/referral/rewardInvited')
}

beforeEach(() => {
  directPaymentProcessor.mockReset()
  directPaymentProcessor.mockResolvedValue({ success: true })
})

afterEach(() => {
  process.env = { ...saved }
})

describe('the invited-side bonus', () => {
  it('is off by default -- the owner sets the amount', async () => {
    const m = await loadInvited(undefined)
    expect(m.REFERRAL_INVITED_BONUS_STARS).toBe(0)

    const out = await m.rewardInvited({
      inviterTelegramId: '111',
      invitedTelegramId: '222',
      botName: 'b',
    })
    expect(out).toEqual({ rewarded: false, reason: 'disabled' })
    expect(directPaymentProcessor).not.toHaveBeenCalled()
  })

  it('does not turn garbage in the variable into a payment', async () => {
    // A typo in the Railway panel must not hand out stars, and must not hand
    // out NaN either: both would reach the database in silence.
    for (const bad of ['', 'сто', '-50', 'NaN']) {
      const m = await loadInvited(bad as unknown as number)
      expect(m.REFERRAL_INVITED_BONUS_STARS, bad).toBe(0)
    }
  })

  it('is paid to the INVITED person and in the amount set', async () => {
    const m = await loadInvited(40)
    const out = await m.rewardInvited({
      inviterTelegramId: '111',
      invitedTelegramId: '222',
      botName: 'b',
    })

    expect(out).toEqual({ rewarded: true, stars: 40 })
    const arg = directPaymentProcessor.mock.calls[0][0]
    // The property that matters: the money goes to the person invited.
    expect(arg.telegram_id).toBe('222')
    expect(arg.amount).toBe(40)
  })

  it('carries an invoice id different from the inviter’s', async () => {
    // Both invoice ids are built from the same pair. Were they equal, the
    // second reward would hit the unique index, return 23505 and be read as
    // "already paid": the invited person would get nothing, and the log would
    // calmly say "already granted".
    const invited = await loadInvited(40)
    const { referralInvoiceId } = await import('@/core/referral/rewardInviter')

    expect(invited.invitedInvoiceId('111', '222')).not.toBe(
      referralInvoiceId('111', '222')
    )
    // And stays constant on a repeat -- the whole protection against paying
    // twice rests on that.
    expect(invited.invitedInvoiceId('111', '222')).toBe(
      invited.invitedInvoiceId('111', '222')
    )
  })

  it('does not pay a second time for the same pair', async () => {
    const m = await loadInvited(40)
    directPaymentProcessor.mockResolvedValue({
      success: false,
      error: 'duplicate key value violates unique constraint (23505)',
    })
    const out = await m.rewardInvited({
      inviterTelegramId: '111',
      invitedTelegramId: '222',
      botName: 'b',
    })
    expect(out).toEqual({ rewarded: false, reason: 'already' })
  })

  it('does not reward a self-invite', async () => {
    const m = await loadInvited(40)
    const out = await m.rewardInvited({
      inviterTelegramId: '111',
      invitedTelegramId: '111',
      botName: 'b',
    })
    expect(out.rewarded).toBe(false)
    expect(directPaymentProcessor).not.toHaveBeenCalled()
  })
})

describe('the two sides are independent', () => {
  it('a failure on the inviter side does not cancel the invited bonus', async () => {
    // The inviter's reward can fail for reasons of its own: they are missing
    // from `users` -- 44 payers are (docs/audit/ghost-payers.md). Tying one
    // side to the other would mean the invited person silently loses what they
    // were promised because of somebody else's trouble.
    vi.resetModules()
    process.env[ENV_INVITER] = '60'
    process.env[ENV_INVITED] = '40'

    const rows = [{ inviter: 'uuid-1' }, { telegram_id: '111' }]
    let i = 0
    vi.doMock('@/core/supabase', () => ({
      supabase: {
        from: () => {
          const link: Record<string, unknown> = {}
          const chain = () => link
          link.select = chain
          link.eq = chain
          link.maybeSingle = () =>
            Promise.resolve({
              data: rows[Math.min(i++, rows.length - 1)],
              error: null,
            })
          return link
        },
      },
    }))

    directPaymentProcessor.mockImplementation((p: { telegram_id: string }) =>
      // The inviter fails, the invited succeeds.
      p.telegram_id === '111'
        ? Promise.resolve({ success: false, error: 'user not found' })
        : Promise.resolve({ success: true })
    )

    const { rewardReferralOnFirstTopUp } = await import(
      '@/core/referral/rewardOnFirstTopUp'
    )
    await rewardReferralOnFirstTopUp({
      invitedTelegramId: '222',
      botName: 'b',
    })

    const paid = directPaymentProcessor.mock.calls.map(c => c[0].telegram_id)
    expect(paid).toContain('111') // the attempt was made
    expect(paid).toContain('222') // and the second side was not skipped
  })

  it('an enabled invited bonus works while the inviter one is off', async () => {
    // The early exit used to look at REFERRAL_BONUS_STARS only. With one side
    // that was correct; with a second it would become a silent loss.
    vi.resetModules()
    process.env[ENV_INVITER] = '0'
    process.env[ENV_INVITED] = '40'

    const rows = [{ inviter: 'uuid-1' }, { telegram_id: '111' }]
    let i = 0
    vi.doMock('@/core/supabase', () => ({
      supabase: {
        from: () => {
          const link: Record<string, unknown> = {}
          const chain = () => link
          link.select = chain
          link.eq = chain
          link.maybeSingle = () =>
            Promise.resolve({
              data: rows[Math.min(i++, rows.length - 1)],
              error: null,
            })
          return link
        },
      },
    }))

    const { rewardReferralOnFirstTopUp } = await import(
      '@/core/referral/rewardOnFirstTopUp'
    )
    await rewardReferralOnFirstTopUp({
      invitedTelegramId: '222',
      botName: 'b',
    })

    const paid = directPaymentProcessor.mock.calls.map(c => c[0].telegram_id)
    expect(paid).toEqual(['222'])
  })
})
