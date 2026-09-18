/**
 * TELEGRAM DELIVERS A SUCCESSFUL PAYMENT AT LEAST ONCE, SO THE SECOND DELIVERY
 * MUST LAND ON THE SAME LEDGER ROW.
 *
 * `handleSuccessfulPayment` credits stars through `setPayments`. The only thing
 * standing between a re-delivered update and a second free credit is the
 * UNIQUE(inv_id) constraint on payments_v2 -- and that constraint can only do
 * its job if the InvId this handler computes is THE SAME both times. An InvId
 * built from a fresh `Date.now()` or a fresh uuid looks perfectly fine in review
 * and mints stars on every retry. The promo path had exactly that bug.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read index.ts as TEXT, pick out the
 * lines starting with `InvId:` and assert each one mentions `payload` and names
 * no clock. That guards a spelling in two directions at once, and is wrong in
 * both: `InvId: freshId(payload)` passes it while minting a new id on every
 * retry, and moving an honest assignment into a helper fails it while nothing
 * about the payment changed.
 *
 * Now the handler is RUN twice on the same payment, and what is asserted is
 * what reached setPayments: the same InvIds, in the same order. A clock or a
 * random anywhere along the path -- inline, in a helper, in a module the
 * handler imports -- shows up as two different values, which is the only
 * symptom that matters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const setPayments = vi.fn()

vi.mock('@/core/supabase/setPayments', () => ({
  setPayments: (...a: unknown[]) => setPayments(...a),
}))

vi.mock('@/core/supabase/notifyBotOwners', () => ({
  notifyBotOwners: async () => undefined,
}))

/*
 * `isReady` belongs to the same object: the winston transport in logger.ts
 * takes this service too, and a mock without it throws out of the log call --
 * an unhandled rejection that has nothing to do with the payment.
 */
vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    logPayment: async () => undefined,
    isReady: () => false,
  },
}))

vi.mock('@/handlers/getSubScribeChannel', () => ({
  getSubScribeChannel: async () => null,
}))

vi.mock('@/navigation', () => ({ showMainMenu: async () => undefined }))

const TELEGRAM_ID = 900000071
const CHARGE = 'ch_900000071_1'

/** A successful_payment update, exactly as Telegram re-delivers it: byte for byte. */
function update(payload: string, totalAmount = 1499) {
  return {
    from: { id: TELEGRAM_ID, username: 'a_person', language_code: 'en' },
    chat: { id: TELEGRAM_ID, type: 'private' },
    botInfo: { username: 'test_bot' },
    session: {},
    message: {
      successful_payment: {
        currency: 'XTR',
        total_amount: totalAmount,
        invoice_payload: payload,
        telegram_payment_charge_id: CHARGE,
        provider_payment_charge_id: 'pp_1',
      },
    },
    reply: vi.fn(async () => undefined),
    scene: { leave: vi.fn(async () => undefined) },
  }
}

/**
 * Run the handler once and return every InvId it wrote, flattened in order.
 * `setPayments` takes either one row or an array of them.
 */
async function invIdsFor(payload: string, totalAmount?: number) {
  setPayments.mockClear()
  const { handleSuccessfulPayment } = await import('@/handlers/paymentHandlers')
  await handleSuccessfulPayment(update(payload, totalAmount) as never)
  return setPayments.mock.calls
    .flatMap(([arg]) => (Array.isArray(arg) ? arg : [arg]))
    .map(row => (row as { InvId?: string | null }).InvId ?? null)
}

/*
 * THE CLOCK MOVES ON EVERY READING, NOT ONCE PER TEST.
 *
 * The first version of this advanced the clock in `beforeEach`, so both
 * deliveries inside one test saw the SAME millisecond -- and a deliberately
 * planted `InvId: `${payload}-${Date.now()}`` passed all six tests. A trap that
 * only springs when the two runs happen to straddle a millisecond boundary is
 * not a trap. Every reading of the clock now returns a later moment, and every
 * reading of Math.random a different number, so any of them reaching an InvId
 * is certain to show up as two different values.
 */
let tick = 0
beforeEach(() => {
  setPayments.mockReset()
  setPayments.mockResolvedValue(undefined)
  vi.spyOn(Date, 'now').mockImplementation(() => {
    tick += 1000
    return 1_700_000_000_000 + tick
  })
  vi.spyOn(Math, 'random').mockImplementation(() => {
    tick += 1
    return (tick % 97) / 97
  })
  // The feed-star branch asks the render whether the star was paid.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({ ok: true, paid: true, to_telegram_id: '900000072' }),
    }))
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Every payload shape that reaches a ledger write, one per branch. */
const PAYMENTS: Array<[string, string, number | undefined]> = [
  ['a club membership', 'foundry-apprentice_1499_1758000000000', 1499],
  ['a star sent to an author in the feed', 'feedstar-90000000-0000-0000', 1],
  ['a subscription', 'NEUROBASE_1000_1758000000000', 1000],
  ['a plain stars top-up', '500_1758000000000', 500],
]

describe('a re-delivered payment writes the same InvId', () => {
  for (const [what, payload, amount] of PAYMENTS) {
    it(`gives ${what} the same InvId on the second delivery`, async () => {
      const first = await invIdsFor(payload, amount)
      const second = await invIdsFor(payload, amount)

      expect(
        first.length,
        `${what} wrote nothing to the ledger`
      ).toBeGreaterThan(0)
      expect(
        second,
        'the retry computed different InvIds -- UNIQUE(inv_id) cannot dedup it, ' +
          'so the person is credited twice'
      ).toEqual(first)
    })
  }

  /*
   * AND IT IS NOT A CONSTANT. An InvId frozen to the same literal for every
   * payment would pass every assertion above and refuse the SECOND genuine
   * purchase somebody makes -- the opposite failure, equally expensive.
   */
  it('gives a different payment a different InvId', async () => {
    const a = await invIdsFor('500_1758000000000', 500)
    const b = await invIdsFor('500_1758000000999', 500)
    expect(a[0]).not.toEqual(b[0])
  })

  /*
   * The club and the feed star each write a PAIR of rows -- an income and a
   * compensating debit. The two rows must not share an InvId, or the second
   * insert collides with the first and the compensating debit silently never
   * lands: the membership fee becomes spendable balance.
   */
  it('keeps the compensating row on its own InvId', async () => {
    for (const [what, payload, amount] of PAYMENTS.slice(0, 2)) {
      const ids = await invIdsFor(payload, amount)
      expect(ids.length, `${what} did not write a pair`).toBeGreaterThan(1)
      expect(new Set(ids).size, `${what} reused one InvId for two rows`).toBe(
        ids.length
      )
    }
  })
})
