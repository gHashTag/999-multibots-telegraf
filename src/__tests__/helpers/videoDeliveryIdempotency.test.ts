/**
 * Behavioral test for the shared video-delivery idempotency claimer. Unlike the
 * per-file source-seam tests (which can only assert the guard is WIRED before
 * each delivery), the factory is a pure function, so its dedup + FIFO eviction
 * can be exercised deterministically here.
 */
import { describe, it, expect } from 'vitest'
import { createVideoDeliveryClaimer } from '@/helpers/videoDeliveryIdempotency'

describe('createVideoDeliveryClaimer', () => {
  it('claims a job once; a duplicate claim returns false', () => {
    const claim = createVideoDeliveryClaimer()
    expect(claim('job-1')).toBe(true)
    expect(claim('job-1')).toBe(false)
    expect(claim('job-2')).toBe(true)
  })

  it('bounds the set and evicts oldest-first past the cap', () => {
    const claim = createVideoDeliveryClaimer(2)
    expect(claim('a')).toBe(true) // {a}
    expect(claim('b')).toBe(true) // {a,b}
    expect(claim('a')).toBe(false) // dup within cap detected
    expect(claim('c')).toBe(true) // size 3 > 2 -> evict oldest 'a' -> {b,c}
    expect(claim('c')).toBe(false) // 'c' still present -> tracking intact
    // 'a' was EVICTED at the previous step, so re-claiming it succeeds — this is
    // what proves the FIFO eviction actually ran (not just an unbounded set).
    expect(claim('a')).toBe(true)
  })

  it('each claimer has an independent set (no cross-instance leakage)', () => {
    const c1 = createVideoDeliveryClaimer()
    const c2 = createVideoDeliveryClaimer()
    expect(c1('x')).toBe(true)
    expect(c2('x')).toBe(true)
  })
})
