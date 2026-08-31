import { describe, it, expect, vi, beforeEach } from 'vitest'

// A buyer double-tapping "Buy" (or racing mp_confirm callbacks) runs purchaseItem
// twice and would be charged twice for one item (author paid twice).
// purchaseItem must claim buyer+item before charging so a concurrent duplicate
// is skipped. (Marketplace is not wired to a live schema yet -- this hardens it
// for when it is, matching marketplace-deduct-guarded.)
const { updateUserBalance, ITEM } = vi.hoisted(() => ({
  updateUserBalance: vi.fn(),
  ITEM: {
    id: 'item1',
    author_id: 'seller9',
    price_stars: 10,
    title: 'T',
    content: 'secret-content',
  },
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({ updateUserBalance }))
vi.mock('@/core/supabase', () => {
  const single = vi.fn().mockResolvedValue({ data: ITEM, error: null })
  const chain: any = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single,
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
  return { supabase: chain, supabaseAdmin: chain }
})

import { purchaseItem } from '@/services/marketplaceService'

describe('marketplace purchase is idempotent under a concurrent double-tap', () => {
  beforeEach(() => updateUserBalance.mockReset().mockResolvedValue(true))

  it('two concurrent purchases of the same item charge the buyer only once', async () => {
    const [a, b] = await Promise.all([
      purchaseItem('buyer1', 'item1', 'bot'),
      purchaseItem('buyer1', 'item1', 'bot'),
    ])
    expect(a.success && b.success).toBe(true)
    // one purchase = one buyer deduct + one author credit = 2 calls total.
    // an unguarded double would be 4.
    expect(updateUserBalance).toHaveBeenCalledTimes(2)
    // the deduct (MONEY_OUTCOME) happened exactly once
    const deducts = updateUserBalance.mock.calls.filter(
      c => c[2] === 'MONEY_OUTCOME'
    )
    expect(deducts.length).toBe(1)
  })
})
