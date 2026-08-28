/**
 * Regression test: users with MORE THAN ONE row in `users` must not be treated
 * as non-existent.
 *
 * telegram_id is not unique in that table. Measured on production 2026-08-28:
 * 2371 rows for 2336 distinct telegram_ids — 19 people have 2-3 rows each.
 * `.single()` / `.maybeSingle()` error on more than one row, so for exactly
 * those people every top-up and refund was rejected ("no users row", after
 * their money was already taken) and getUserDetailsSubscription reported
 * isExist=false, locking them out of paid features.
 *
 * Both call sites now use `.limit(1)` — existence is all they need.
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const fromMock = vi.fn()
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}))

import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'

/**
 * Builds a supabase query stub whose users-select resolves to TWO rows, i.e.
 * a duplicated telegram_id. `.limit()` resolves; `.single()`/`.maybeSingle()`
 * reject the way PostgREST does, so the old code cannot pass this test.
 */
function duplicateRowsClient() {
  const twoRows = [{ id: 'row-1' }, { id: 'row-2' }]
  const multipleRowsError = {
    code: 'PGRST116',
    message: 'JSON object requested, multiple (or no) rows returned',
  }

  return (table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = self
    chain.order = self
    chain.gt = self
    chain.gte = self
    chain.lt = self
    chain.in = self
    chain.limit = () =>
      table === 'users'
        ? Promise.resolve({ data: twoRows, error: null })
        : Promise.resolve({ data: [], error: null })
    chain.single = () =>
      table === 'users'
        ? Promise.resolve({ data: null, error: multipleRowsError })
        : Promise.resolve({ data: null, error: null })
    chain.maybeSingle = chain.single
    // Payments aggregation etc. resolve empty; awaiting the chain itself works.
    ;(chain as any).then = (res: (v: unknown) => unknown) =>
      res({ data: [], error: null })
    return chain
  }
}

describe('duplicate users rows are not treated as a missing user', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockImplementation(duplicateRowsClient())
  })

  it('getUserDetailsSubscription reports the user as existing', async () => {
    const result = await getUserDetailsSubscription('5179809930')

    // 5179809930 is one of the real duplicated ids measured in production.
    expect(result.isExist).toBe(true)
  })

  it('the users lookup does not go through single()/maybeSingle()', async () => {
    const calls: string[] = []
    fromMock.mockImplementation((table: string) => {
      const base = duplicateRowsClient()(table) as Record<string, unknown>
      if (table === 'users') {
        const origSingle = base.single as () => unknown
        base.single = () => {
          calls.push('single')
          return origSingle()
        }
        base.maybeSingle = base.single
      }
      return base
    })

    await getUserDetailsSubscription('5179809930')

    expect(calls).not.toContain('single')
  })
})
