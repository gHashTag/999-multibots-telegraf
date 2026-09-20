/**
 * The live wallet is where the money is now. These tests pin the two promises
 * the rest of the code leans on: an unreachable wallet is never reported as a
 * zero balance, and a debit cannot be passed twice for the same stars.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  getTokenBalance,
  creditTokens,
  debitTokens,
  resetTokenWalletPool,
  WalletUnavailableError,
} from '@/core/wallet/tokenWallet'

beforeEach(() => {
  query.mockReset()
  resetTokenWalletPool()
  process.env.TOKENS_DATABASE_URL = 'postgres://wallet/test'
})

describe('getTokenBalance', () => {
  it('returns the stored balance', async () => {
    query.mockResolvedValue({ rows: [{ balance: 208 }] })
    expect(await getTokenBalance('123')).toBe(208)
  })

  it('treats a missing row as a real zero', async () => {
    query.mockResolvedValue({ rows: [] })
    expect(await getTokenBalance('123')).toBe(0)
  })

  it('throws rather than answering zero when the database is down', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(getTokenBalance('123')).rejects.toBeInstanceOf(
      WalletUnavailableError
    )
  })

  it('throws when no wallet database is configured', async () => {
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    resetTokenWalletPool()
    await expect(getTokenBalance('123')).rejects.toBeInstanceOf(
      WalletUnavailableError
    )
  })
})

describe('creditTokens', () => {
  it('returns the balance after the upsert', async () => {
    query.mockResolvedValue({ rows: [{ balance: 350 }] })
    expect(await creditTokens('123', 150)).toBe(350)
    expect(query.mock.calls[0][1]).toEqual(['123', 150])
  })

  it('refuses a non-positive amount instead of writing a silent no-op', async () => {
    await expect(creditTokens('123', 0)).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})

describe('debitTokens', () => {
  it('returns the balance left when the user could cover it', async () => {
    query.mockResolvedValue({ rows: [{ balance: 42 }] })
    expect(await debitTokens('123', 208)).toBe(42)
  })

  it('reports a refusal as null when the user could not cover it', async () => {
    // No row comes back because the UPDATE matched nothing: the balance guard
    // lives in the WHERE clause, so an underfunded user simply updates zero rows.
    query.mockResolvedValue({ rows: [] })
    expect(await debitTokens('123', 208)).toBeNull()
  })

  it('checks the balance inside the same statement that writes it', async () => {
    // This is the whole point of the file: a separate read-then-write let two
    // taps both pass the check and spend the same stars (#999).
    query.mockResolvedValue({ rows: [{ balance: 0 }] })
    await debitTokens('123', 10)
    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, ' ')
    expect(sql).toMatch(/UPDATE user_tokens SET balance = balance - \$2/i)
    expect(sql).toMatch(/WHERE telegram_id = \$1 AND balance >= \$2/i)
  })
})
