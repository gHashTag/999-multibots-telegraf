/**
 * A COMMITTED PAYMENT MUST NOT BE REPORTED AS A FAILURE.
 *
 * `directPaymentProcessor` writes the `payments_v2` row -- the money has moved --
 * and then reads a cache and a balance to fill in the answer it returns. Those
 * reads used to sit inside the function's outer try, so a transient throw in
 * either one reached the outer catch and returned `success: false` for a payment
 * that had ALREADY committed.
 *
 * That false negative is the expensive direction: the caller retries into a
 * double charge, or refuses to deliver what the person paid for. Same class as
 * updateUserBalance (#1397).
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read directPayment.ts as TEXT and
 * assert that two statements are enclosed by a `try {`. That passes on a try
 * whose catch rethrows, and it breaks when somebody moves the code without
 * changing what it does -- which is how one of these guards sat broken for two
 * days on 2026-09-16.
 *
 * Now the function is RUN with each post-commit read throwing in turn, and what
 * is asserted is the answer it gives: still a success, still the payment id, and
 * a balance it can stand behind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

const getUserBalance = vi.fn()
const invalidateBalanceCache = vi.fn()
const insertSingle = vi.fn()

/*
 * Mock the modules the code imports FROM. The processor takes `supabase` from
 * the barrel and the two balance helpers from their own files; mocking the
 * wrong one leaves the real function in place and the test talks to a live
 * database, passing or failing for reasons that have nothing to do with the
 * commit boundary.
 */
vi.mock('@/core/supabase', async () => {
  const actual =
    await vi.importActual<typeof import('@/core/supabase')>('@/core/supabase')
  return {
    ...actual,
    supabase: {
      from: () => ({
        insert: () => ({
          select: () => ({ single: () => insertSingle() }),
        }),
      }),
    },
  }
})

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: (...a: unknown[]) => getUserBalance(...a),
}))

vi.mock('@/core/supabase/balanceCache', () => ({
  invalidateBalanceCache: (...a: unknown[]) => invalidateBalanceCache(...a),
  getCachedBalance: () => null,
  setCachedBalance: () => undefined,
}))

vi.mock('@/helpers/sendTransactionNotification', () => ({
  sendTransactionNotificationTest: async () => undefined,
}))

const PAYMENT_ID = 4242
const TELEGRAM_ID = '900000051'

/** A charge that the person can afford, so the row is written. */
const charge = () => ({
  telegram_id: TELEGRAM_ID,
  amount: 10,
  type: PaymentType.MONEY_OUTCOME,
  description: 'a behaviour test',
  bot_name: 'test_bot',
  service_type: 'test' as never,
})

async function pay() {
  const { directPaymentProcessor } = await import(
    '@/core/supabase/directPayment'
  )
  return directPaymentProcessor(charge() as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserBalance.mockResolvedValue(100)
  invalidateBalanceCache.mockResolvedValue(undefined)
  insertSingle.mockResolvedValue({ data: { id: PAYMENT_ID }, error: null })
})

describe('a payment that committed is reported as committed', () => {
  it('succeeds on the ordinary path, and says which row it wrote', async () => {
    const r = await pay()
    expect(r.success).toBe(true)
    expect(r.payment_id).toBe(PAYMENT_ID)
  })

  /*
   * THE CACHE READ. It is a no-op today and kept switchable, which is exactly
   * when this rots unnoticed: nothing throws, so nothing proves the isolation
   * is still there.
   */
  it('still succeeds when the cache invalidation throws afterwards', async () => {
    invalidateBalanceCache.mockRejectedValue(new Error('redis is gone'))

    const r = await pay()

    expect(r.success, 'a committed payment was reported as failed').toBe(true)
    expect(r.payment_id).toBe(PAYMENT_ID)
  })

  /*
   * THE BALANCE READ, and the harder half: it must not only survive, it must
   * answer with a number somebody can act on. Falling back to the pre-operation
   * balance is the honest choice -- it is the last figure this function knows
   * to be true.
   */
  it('still succeeds when the new-balance read throws, using the balance it knew', async () => {
    getUserBalance.mockResolvedValueOnce(100) // the pre-flight check passes
    getUserBalance.mockRejectedValueOnce(new Error('read timeout'))

    const r = await pay()

    expect(r.success, 'a committed payment was reported as failed').toBe(true)
    expect(r.payment_id).toBe(PAYMENT_ID)
    expect(r.balanceChange?.before).toBe(100)
    expect(r.balanceChange?.after).toBe(100)
  })

  /*
   * THE LINE THAT MUST NOT MOVE. A failure BEFORE the commit is a real failure:
   * no row was written, nothing is half-done, and the caller must hear no.
   * A test that only checks the forgiving direction passes just as well against
   * code that swallows everything.
   */
  it('reports a failure when the row itself could not be written', async () => {
    insertSingle.mockResolvedValue({
      data: null,
      error: { message: 'insert refused' },
    })

    const r = await pay()

    expect(r.success).toBe(false)
    expect(r.payment_id).toBeUndefined()
  })
})
