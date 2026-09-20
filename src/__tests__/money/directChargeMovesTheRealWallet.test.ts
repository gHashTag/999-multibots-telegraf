/**
 * A DIRECT CHARGE MOVES THE WALLET, NOT ONLY THE ARCHIVE.
 *
 * Found by an adversarial sweep on 2026-09-20 and rated critical.
 *
 * `directPaymentProcessor` read the balance with `getUserBalance` -- which,
 * since the single-wallet decision, reads `user_tokens` in the render's
 * Postgres -- compared it against the price, and then wrote a MONEY_OUTCOME
 * row into `payments_v2`, an ARCHIVE nothing spends from.
 *
 * The balance never moved. The next read returned the same number, the check
 * passed again, and the same few tokens bought an unbounded number of paid
 * generations -- each a real Replicate bill. In the other direction a referral
 * or promo bonus landed in the archive and never arrived.
 *
 * Two properties are pinned: the money moves, and a refusal writes NOTHING.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const wallet = {
  debits: [] as Array<[string, number]>,
  credits: [] as Array<[string, number]>,
  balance: 100,
}
const inserted: unknown[] = []

vi.mock('@/core/wallet/tokenWallet', () => ({
  debitTokens: async (id: string, amount: number) => {
    wallet.debits.push([id, amount])
    if (wallet.balance < amount) return null
    wallet.balance -= amount
    return wallet.balance
  },
  creditTokens: async (id: string, amount: number) => {
    wallet.credits.push([id, amount])
    wallet.balance += amount
    return wallet.balance
  },
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: async () => wallet.balance,
  invalidateBalanceCache: () => undefined,
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown[]) => {
        inserted.push(...rows)
        return {
          select: () => ({
            single: async () => ({ data: { id: 1 }, error: null }),
          }),
        }
      },
    }),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}))

vi.mock('@/helpers/sendTransactionNotification', () => ({
  sendTransactionNotificationTest: async () => undefined,
}))

beforeEach(() => {
  wallet.debits.length = 0
  wallet.credits.length = 0
  wallet.balance = 100
  inserted.length = 0
})

const charge = async (amount: number) => {
  const { directPaymentProcessor } = await import(
    '@/core/supabase/directPayment'
  )
  const { PaymentType } = await import('@/interfaces/payments.interface')
  return directPaymentProcessor({
    telegram_id: '900000911',
    amount,
    type: PaymentType.MONEY_OUTCOME,
    description: 'test charge',
    bot_name: 'test_bot',
    service_type: 'neuro_photo' as never,
  } as never)
}

describe('a direct charge', () => {
  it('takes the money from the live wallet, not only from the archive', async () => {
    const r = await charge(30)
    expect(r.success).toBe(true)
    expect(wallet.debits, 'the wallet was never asked').toEqual([
      ['900000911', 30],
    ])
    expect(wallet.balance).toBe(70)
    expect(inserted, 'the audit row is still written').toHaveLength(1)
  })

  /*
   * THE DEFECT ITSELF: charging twice from a balance that only covers one.
   * Before the fix both calls succeeded, because nothing ever subtracted.
   */
  it('cannot be spent twice from a balance that covers it once', async () => {
    wallet.balance = 40
    const first = await charge(30)
    const second = await charge(30)
    expect(first.success).toBe(true)
    expect(second.success, 'the same tokens bought two generations').toBe(false)
    expect(wallet.balance).toBe(10)
  })

  /*
   * A REFUSAL WRITES NOTHING. An archive row for a charge that never happened
   * makes every later report and reconciliation lie.
   */
  it('writes no archive row when the wallet refuses', async () => {
    wallet.balance = 5
    const r = await charge(30)
    expect(r.success).toBe(false)
    expect(
      inserted,
      'an archive row claims a charge that never happened'
    ).toHaveLength(0)
  })
})
