/**
 * TWO PRESSES OF THE SAME PROMO LINK MUST MINT ONE BONUS, NOT TWO.
 *
 * The promo grants 476 or 1303 stars. Two guards stand between that and a mint:
 *
 *   hasReceivedPromo  a READ, outside the per-user balance lock -- so two
 *                     concurrent /start messages (or one Telegram redelivery)
 *                     both read "not yet" and both go on;
 *   UNIQUE(inv_id)    the database, which is the only one that can actually
 *                     stop the second insert.
 *
 * The constraint can only do that if both attempts compute the SAME inv_id. The
 * key used to embed `Date.now()`, so the two grants carried different keys, the
 * constraint had nothing to reject, and both credited: a 476-1303 star mint
 * (#1279).
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read promoHelper.ts as TEXT, pull out
 * the `inv_id:` template literal, and assert the string mentions telegram_id and
 * not `Date.now()`. That pins the spelling of one line: move the key into a
 * helper and it fails with the behaviour intact; build the key from a clock one
 * function away and it passes while every retry mints again.
 *
 * Now the promo is GRANTED TWICE against a ledger that enforces UNIQUE(inv_id)
 * the way the database does, with the clock moved between the two attempts, and
 * what is asserted is what the ledger holds afterwards: one row, one credit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Every row the fake ledger accepted, and every key it was offered. */
let accepted: Array<{ inv_id: string; amount: number; telegram_id: string }>
let offered: string[]

const directPaymentProcessor = vi.fn()
const supabaseRows = vi.fn()

vi.mock('@/core/supabase/directPayment', () => ({
  directPaymentProcessor: (...a: unknown[]) => directPaymentProcessor(...a),
}))

/*
 * `hasReceivedPromo` reads through this chain. It answers "nothing found" for
 * both attempts on purpose: that IS the race -- the read runs outside the lock,
 * so both callers legitimately see an empty table.
 */
vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'contains', 'not', 'limit']) {
    chain[method] = () => chain
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(supabaseRows())
  return { supabase: { from: () => chain } }
})

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

const TELEGRAM_ID = '900000101'

async function grant(telegramId = TELEGRAM_ID, promo = 'neurophoto') {
  const { processPromoLink } = await import('@/helpers/promoHelper')
  return processPromoLink(telegramId, promo, 'test_bot')
}

/*
 * THE CLOCK MOVES ON EVERY READING, not once per test: two attempts inside one
 * test would otherwise share a millisecond and a key built from `Date.now()`
 * would look deterministic. (Form 123, learned the hard way on the Stars
 * handler.)
 */
let tick = 0

beforeEach(() => {
  vi.clearAllMocks()
  accepted = []
  offered = []
  supabaseRows.mockReturnValue({ data: [], error: null })
  vi.spyOn(Date, 'now').mockImplementation(() => {
    tick += 1000
    return 1_700_000_000_000 + tick
  })

  /*
   * THE LEDGER, WITH THE CONSTRAINT THE REAL ONE HAS. payments_v2 carries
   * payments_v2_inv_id_key UNIQUE(inv_id); without it here the test could not
   * tell a deterministic key from a random one, because nothing would ever
   * refuse the second insert.
   */
  directPaymentProcessor.mockImplementation(
    async (p: { inv_id: string; amount: number; telegram_id: string }) => {
      offered.push(p.inv_id)
      if (accepted.some(r => r.inv_id === p.inv_id)) {
        return { success: false, error: 'duplicate key value (23505)' }
      }
      accepted.push({
        inv_id: p.inv_id,
        amount: p.amount,
        telegram_id: p.telegram_id,
      })
      return { success: true, payment_id: accepted.length }
    }
  )
})

describe('a promo granted twice credits once', () => {
  it('offers the same key both times, so the constraint can refuse', async () => {
    await grant()
    await grant()

    expect(offered.length, 'the promo was not attempted twice').toBe(2)
    expect(
      offered[0],
      'the two attempts carry different keys -- UNIQUE(inv_id) has nothing to reject'
    ).toBe(offered[1])
  })

  it('leaves exactly one credit in the ledger', async () => {
    await grant()
    await grant()

    expect(accepted.length, 'the bonus was minted twice').toBe(1)
    expect(accepted[0].amount).toBeGreaterThan(0)
  })

  /*
   * AND THE SECOND CALLER IS TOLD NO. Returning true on a refused insert would
   * hand the person a subscription the ledger never recorded.
   */
  it('reports failure for the attempt the ledger refused', async () => {
    expect(await grant()).toBe(true)
    expect(await grant()).toBe(false)
  })

  /*
   * THE OPPOSITE FAILURE. A key that is simply a constant would pass every
   * assertion above and refuse the promo to the SECOND person who ever uses
   * the link -- and to the same person's other promo.
   */
  it('keeps different people and different promos apart', async () => {
    await grant()
    await grant('900000102')
    await grant(TELEGRAM_ID, 'neurovideo')

    expect(
      new Set(offered).size,
      'the key does not vary per person or promo'
    ).toBe(3)
    expect(accepted.length).toBe(3)
  })

  /*
   * The read-check still does its job when it CAN see the earlier grant: the
   * cheap path must not be left to the database.
   */
  it('does not even attempt a grant the read-check already saw', async () => {
    supabaseRows.mockReturnValue({ data: [{ id: 1 }], error: null })

    expect(await grant()).toBe(false)
    expect(
      offered.length,
      'it asked the ledger for a promo it knew was spent'
    ).toBe(0)
  })
})
