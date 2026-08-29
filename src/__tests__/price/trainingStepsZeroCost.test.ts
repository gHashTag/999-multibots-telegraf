/**
 * A model training must cost something. Both training wizards
 * (digitalAvatarBodyWizard, digitalAvatarBodyWizardV2) parse `steps` from
 * free-typed text with no allowlist, so a user can type `0`. With steps=0,
 * calculateCost(0).stars === 0, and handleTrainingCost's balance gate
 * `currentBalance < trainingCostInStars` degenerates to `< 0` (always false),
 * letting a FREE paid training proceed at the owner's expense. handleTrainingCost
 * must refuse a non-positive price up front — this is the choke point both
 * wizards share.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(),
}))

import { getUserBalance } from '@/core/supabase'
import { handleTrainingCost } from '@/price/helpers/handleTrainingCost'

const balance = getUserBalance as unknown as ReturnType<typeof vi.fn>

function ctx() {
  return {
    from: { id: 424242 },
    reply: vi.fn(async () => ({ message_id: 1 })),
  } as any
}

describe('handleTrainingCost refuses a zero-cost (free) training', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // A generous balance: proves the refusal is about cost being 0, not funds.
    balance.mockResolvedValue(1_000_000)
  })

  it('leaves the scene for steps=0 (price is 0) even with a huge balance', async () => {
    const r = await handleTrainingCost(ctx(), 0, true)
    expect(r.trainingCostInStars).toBe(0)
    expect(r.leaveScene).toBe(true)
  })

  it('proceeds for a valid step count (1000) that prices above zero', async () => {
    const r = await handleTrainingCost(ctx(), 1000, true)
    expect(r.trainingCostInStars).toBeGreaterThan(0)
    expect(r.leaveScene).toBe(false)
  })

  it('still enforces the balance gate for a valid, unaffordable price', async () => {
    balance.mockResolvedValue(0)
    const r = await handleTrainingCost(ctx(), 1000, true)
    expect(r.trainingCostInStars).toBeGreaterThan(0)
    expect(r.leaveScene).toBe(true)
  })
})
