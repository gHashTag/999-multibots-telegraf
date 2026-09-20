import { describe, it, expect, vi, beforeEach } from 'vitest'

// The balance now comes from `user_tokens` in the render Postgres, not from the
// `get_user_balance` RPC over the `payments_v2` archive (owner decision
// 2026-09-20, step 3). What this file guards did not change: not being able to
// read the wallet must never be reported as a balance of zero.
// The wallet is exercised through a mocked `pg` pool rather than a mocked
// module, so the error types the code branches on are the real ones.
const query = vi.fn()

vi.mock('pg', () => ({
  Pool: class {
    query = query
    on() {
      return this
    }
  },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import {
  getUserBalance,
  BalanceUnavailableError,
} from '@/core/supabase/getUserBalance'
import { resetTokenWalletPool } from '@/core/wallet/tokenWallet'

describe('getUserBalance: "could not read it" is not "it is zero"', () => {
  beforeEach(() => {
    query.mockReset()
    resetTokenWalletPool()
    process.env.TOKENS_DATABASE_URL = 'postgres://wallet/test'
  })

  it('returns a genuine zero balance as 0', async () => {
    query.mockResolvedValue({ rows: [{ balance: 0 }] })
    await expect(getUserBalance('123')).resolves.toBe(0)
  })

  it('returns an ordinary balance unchanged', async () => {
    query.mockResolvedValue({ rows: [{ balance: 1500.5 }] })
    await expect(getUserBalance('123')).resolves.toBe(1500.5)
  })

  // This is the whole point: before the original fix this returned 0, and a
  // user with money on their account was told "insufficient funds".
  it('throws instead of returning 0 when the wallet is unreachable', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(getUserBalance('123')).rejects.toBeInstanceOf(
      BalanceUnavailableError
    )
  })

  // Stricter than the RPC version this replaced, on purpose. There, a timeout
  // fell through to `return 0`; here every failure to reach the wallet is an
  // outage, because the wallet is now the only place the money is.
  it('treats a timeout as an outage rather than an empty wallet', async () => {
    query.mockRejectedValue(new Error('statement timeout'))
    await expect(getUserBalance('123')).rejects.toBeInstanceOf(
      BalanceUnavailableError
    )
  })

  it('still answers 0 without touching the wallet when there is no telegram_id', async () => {
    await expect(getUserBalance('')).resolves.toBe(0)
    expect(query).not.toHaveBeenCalled()
  })
})
