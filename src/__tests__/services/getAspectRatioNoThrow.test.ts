import { describe, it, expect, vi } from 'vitest'

// getAspectRatio is read by paid generators AFTER the charge commits, in a
// region whose outer catch does NOT refund (generateNeuroPhotoDirect #1415;
// generateTextToImageDirect + 5 siblings #1414). A client-level rejection
// (network/connection blip) that propagated out of getAspectRatio would charge
// the user without delivering. This ratchet locks the contract for BOTH copies
// of the function: it resolves to null on ANY failure, never throws.
const { single } = vi.hoisted(() => ({ single: vi.fn() }))
vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = single
  return { supabase: chain, supabaseAdmin: chain }
})

import { getAspectRatio as getAspectRatioAi } from '@/core/supabase/ai'
import { getAspectRatio as getAspectRatioBarrel } from '@/core/supabase/getAspectRatio'

// The ai.ts copy (generateNeuroPhotoDirect, #1415) and the barrel copy in
// core/supabase/getAspectRatio.ts (the 6 sibling generators, #1414). A future
// third copy or a revert in either goes RED here.
const copies: Array<[string, (id: number) => Promise<unknown>]> = [
  ['ai.ts', getAspectRatioAi],
  ['getAspectRatio.ts (barrel)', getAspectRatioBarrel],
]

describe.each(copies)(
  'getAspectRatio never throws into a post-charge caller [%s]',
  (_name, getAspectRatio) => {
    it('returns null when the supabase client rejects (no charge-without-deliver)', async () => {
      single.mockRejectedValueOnce(new Error('ECONNRESET'))
      await expect(getAspectRatio(144022504)).resolves.toBeNull()
    })

    it('returns null on a query error (existing contract preserved)', async () => {
      single.mockResolvedValueOnce({ data: null, error: { message: 'no row' } })
      await expect(getAspectRatio(144022504)).resolves.toBeNull()
    })

    it('returns the stored aspect ratio on success', async () => {
      single.mockResolvedValueOnce({
        data: { aspect_ratio: '9:16' },
        error: null,
      })
      await expect(getAspectRatio(144022504)).resolves.toBe('9:16')
    })
  }
)
