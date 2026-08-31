import { describe, it, expect } from 'vitest'
import {
  getUnifiedModelPrice,
  UNIFIED_VIDEO_MODELS,
} from '@/config/unified-video-models.config'

// Zero-cost-bypass class (#1107): a paid model must never price to 0 for an
// input the price map does not cover. per_resolution / per_duration used
// `... || 0`, which invented a FREE price for any unpriced resolution/duration:
// a 0 passes every `balance >= price` gate and hands out a paid generation for
// free. The reachable models are deprecated today, but the fallback must be
// fail-CLOSED so a future active per-resolution/per-duration model cannot leak.
// This mirrors the codebase rule "the price is not invented" (getUnifiedModelPrice
// already throws on an unknown model; handleImageToVideoDirect refuses rather
// than inventing a fallback).

describe('getUnifiedModelPrice fails closed on an unpriced input (no free paid generation)', () => {
  it('returns the real price for a resolution the map covers', () => {
    // seedance-1-pro is per_resolution with { 480p: 3, 1080p: 14 }.
    expect(getUnifiedModelPrice('seedance-1-pro', { resolution: '480p' })).toBe(
      3
    )
    expect(
      getUnifiedModelPrice('seedance-1-pro', { resolution: '1080p' })
    ).toBe(14)
  })

  it('THROWS (does not return 0) for a resolution the map does not cover', () => {
    // Before the fix this returned 0 -> a free paid generation.
    expect(() =>
      getUnifiedModelPrice('seedance-1-pro', { resolution: '4k' })
    ).toThrow(/No price/)
    expect(() =>
      getUnifiedModelPrice('seedance-1-pro', {
        resolution: 'anything-unpriced',
      })
    ).toThrow(/No price/)
  })

  it('still throws on an unknown model (unchanged fail-closed behavior)', () => {
    expect(() => getUnifiedModelPrice('no-such-model')).toThrow(/Unknown model/)
  })

  it('never returns 0 or a negative price for any active model default call', () => {
    // A defensive sweep: every active model priced with its own defaults must be
    // a positive number -- a 0/negative would be a free/refunding generation.
    for (const [id, model] of Object.entries(UNIFIED_VIDEO_MODELS)) {
      if (model.status !== 'active') continue
      const price = getUnifiedModelPrice(id)
      expect(price, `active model ${id} priced <= 0`).toBeGreaterThan(0)
    }
  })
})
