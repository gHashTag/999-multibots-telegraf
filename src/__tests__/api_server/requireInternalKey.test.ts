/**
 * internalKeyMatches guards the money-gated /api routes (neuro-photo,
 * voice-avatar, billing, diagnostic). It must be a constant-time comparison —
 * matching the sibling verifyCallbackToken — and, because the provided value is
 * attacker-controlled and any length, it must not throw on a length mismatch
 * (timingSafeEqual throws on unequal-length buffers, which is why both sides are
 * hashed to a fixed width first).
 */
import { describe, it, expect } from 'vitest'
import { internalKeyMatches } from '@/api_server/middleware/requireInternalKey'

describe('internalKeyMatches', () => {
  it('accepts the exact key', () => {
    expect(internalKeyMatches('s3cr3t-key-value', 's3cr3t-key-value')).toBe(
      true
    )
  })

  it('rejects a wrong key of the same length', () => {
    expect(internalKeyMatches('s3cr3t-key-valuX', 's3cr3t-key-value')).toBe(
      false
    )
  })

  it('rejects a wrong key of a different length without throwing', () => {
    expect(() => internalKeyMatches('short', 's3cr3t-key-value')).not.toThrow()
    expect(internalKeyMatches('short', 's3cr3t-key-value')).toBe(false)
    expect(
      internalKeyMatches('a-much-longer-guess-than-the-key', 's3cr3t-key-value')
    ).toBe(false)
  })

  it('rejects an empty provided value', () => {
    expect(internalKeyMatches('', 's3cr3t-key-value')).toBe(false)
  })

  it('is symmetric for equal inputs of any content', () => {
    const key = 'x-9f2a::/+=AbC'
    expect(internalKeyMatches(key, key)).toBe(true)
  })
})
