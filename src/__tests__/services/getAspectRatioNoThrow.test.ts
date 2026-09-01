import { describe, it, expect, vi } from 'vitest'

// getAspectRatio is read by paid generators AFTER the charge commits, in a
// region whose outer catch does NOT refund (generateNeuroPhotoDirect #1415;
// generateTextToImageDirect + 5 siblings #1414). A client-level rejection
// (network/connection blip) that propagated out of getAspectRatio would charge
// the user without delivering. This ratchet locks the contract for BOTH copies
// of the function: it resolves to null on ANY failure, never throws.
//
// The two copies now use DIFFERENT terminals: the ai.ts copy still ends in
// `.single()`, while the barrel copy (core/supabase/getAspectRatio.ts) was
// migrated to `.order('updated_at').limit(1)` because telegram_id is non-unique
// (iter242). The mock supports both terminals so the no-throw contract is locked
// for each; each test drives both so the shared describe.each covers both copies.
const { single, limit } = vi.hoisted(() => ({
  single: vi.fn(),
  limit: vi.fn(),
}))
vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.single = single // ai.ts copy terminal
  chain.limit = limit // barrel copy terminal (.order('updated_at').limit(1))
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
      limit.mockRejectedValueOnce(new Error('ECONNRESET'))
      await expect(getAspectRatio(144022504)).resolves.toBeNull()
    })

    it('returns null on a query error (existing contract preserved)', async () => {
      single.mockResolvedValueOnce({ data: null, error: { message: 'no row' } })
      limit.mockResolvedValueOnce({ data: null, error: { message: 'no row' } })
      await expect(getAspectRatio(144022504)).resolves.toBeNull()
    })

    it('returns the stored aspect ratio on success', async () => {
      // single: the ai.ts copy reads a single object; limit: the barrel copy
      // reads the first row of an array (order(...).limit(1)).
      single.mockResolvedValueOnce({
        data: { aspect_ratio: '9:16' },
        error: null,
      })
      limit.mockResolvedValueOnce({
        data: [{ aspect_ratio: '9:16' }],
        error: null,
      })
      await expect(getAspectRatio(144022504)).resolves.toBe('9:16')
    })
  }
)
