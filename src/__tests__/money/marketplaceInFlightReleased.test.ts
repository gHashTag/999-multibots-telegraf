import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A stuck in-flight key hands out paid content for free, forever.
 *
 * `purchaseItem` guards against a concurrent second purchase with an in-memory
 * Set keyed `buyerId:itemId`. The guard's early return is generous by design:
 *
 *   if (purchasesInFlight.has(key)) return { success: true, content }
 *
 * Deliver once, charge once. That is right WHILE a purchase is genuinely in
 * flight. It becomes a permanent free tap the moment a key is added and never
 * removed -- and the key was added, then deleted at the two normal exits, with
 * NO try/finally around the two awaits in between. A throw from either
 * updateUserBalance (a network error is enough) left the key set for the life
 * of the process, and from then on every purchase of that item by that buyer
 * returned the content with nobody charged and the author never paid.
 *
 * Not a mint: no money is created. It is the other direction -- a sale that
 * takes nothing and pays nobody.
 *
 * What is pinned is the RELEASE, exercised through a real throw rather than a
 * happy path, because the happy path always released the key even when broken.
 * A test that only buys successfully cannot tell the two versions apart.
 */

const updateUserBalance = vi.fn()
const getItemMock = vi.fn()

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
}))
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: getItemMock(), error: null }),
        }),
      }),
    }),
  },
}))

const ITEM = {
  id: 'item-1',
  author_id: 'author-1',
  price_stars: 100,
  title: 'A thing',
  content: 'the paid content',
}

describe('marketplace purchase releases its in-flight key', () => {
  beforeEach(() => {
    vi.resetModules()
    updateUserBalance.mockReset()
    getItemMock.mockReset().mockReturnValue(ITEM)
  })

  it('releases the key when the charge THROWS, so the next purchase still charges', async () => {
    const { purchaseItem } = await import('@/services/marketplaceService')

    // First attempt: the charge throws, as a network fault would.
    updateUserBalance.mockRejectedValueOnce(new Error('network'))
    await expect(purchaseItem('buyer-1', 'item-1', 'bot')).rejects.toThrow(
      'network'
    )

    // Second attempt must reach the charge again. Before the fix the key was
    // still set, the early return fired, and this resolved with the content
    // while updateUserBalance was never called -- free content, no payout.
    updateUserBalance.mockResolvedValue(true)
    const second = await purchaseItem('buyer-1', 'item-1', 'bot')

    expect(
      updateUserBalance.mock.calls.length,
      'the second attempt must charge, not take the in-flight shortcut'
    ).toBeGreaterThanOrEqual(2)
    expect(second.success).toBe(true)
  })

  it('releases the key on the insufficient-balance exit too', async () => {
    const { purchaseItem } = await import('@/services/marketplaceService')

    updateUserBalance.mockResolvedValueOnce(false)
    const first = await purchaseItem('buyer-2', 'item-1', 'bot')
    expect(first.success).toBe(false)
    expect(first.error).toBe('insufficient_balance')

    // A buyer who tops up must be able to buy. If the failed attempt left the
    // key set, this would return content for free instead.
    updateUserBalance.mockResolvedValue(true)
    const chargesBefore = updateUserBalance.mock.calls.length
    const second = await purchaseItem('buyer-2', 'item-1', 'bot')
    expect(second.success).toBe(true)
    expect(
      updateUserBalance.mock.calls.length,
      'the retry after a top-up must charge'
    ).toBeGreaterThan(chargesBefore)
  })

  it('still short-circuits a genuinely concurrent purchase', async () => {
    // The guard must keep doing its job: two overlapping calls charge ONCE.
    const { purchaseItem } = await import('@/services/marketplaceService')

    let release: (v: boolean) => void = () => {}
    updateUserBalance.mockImplementationOnce(
      () => new Promise<boolean>(r => (release = r))
    )
    const inFlight = purchaseItem('buyer-3', 'item-1', 'bot')
    const overlapping = await purchaseItem('buyer-3', 'item-1', 'bot')

    expect(overlapping.success).toBe(true)
    expect(overlapping.content).toBe(ITEM.content)
    expect(
      updateUserBalance.mock.calls.length,
      'the overlapping call must not charge a second time'
    ).toBe(1)

    release(true)
    updateUserBalance.mockResolvedValue(true)
    await inFlight
  })
})
