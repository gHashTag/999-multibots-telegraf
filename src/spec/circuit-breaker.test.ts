// Spec circuit-breaker.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
import { describe, expect, it } from 'vitest'
import * as SPEC from './circuit-breaker.gen'
import * as LOGIC from './circuit-breaker.logic'

describe('spec circuit-breaker.t27', () => {
  it('the breaker opens at the threshold and not below it', () => {
    expect(LOGIC.opens(3)).toBe(true)
    expect(LOGIC.opens(4)).toBe(true)
    expect(LOGIC.opens(2)).toBe(false)
    expect(LOGIC.opens(0)).toBe(false)
    expect(SPEC.FAILURE_THRESHOLD).toBe(3)
  })

  it('a probe is allowed only after the full cooldown', () => {
    expect(LOGIC.canProbe(10000)).toBe(true)
    expect(LOGIC.canProbe(12000)).toBe(true)
    expect(LOGIC.canProbe(9999)).toBe(false)
    expect(LOGIC.canProbe(0)).toBe(false)
    expect(SPEC.COOLDOWN_MS).toBe(10000)
  })

  it('retry_after is the remaining cooldown, zero means probe now', () => {
    expect(LOGIC.retryAfter(0)).toBe(10000)
    expect(LOGIC.retryAfter(2500)).toBe(7500)
    expect(LOGIC.retryAfter(9999)).toBe(1)
    expect(LOGIC.retryAfter(10000)).toBe(0)
    expect(LOGIC.retryAfter(12000)).toBe(0)
  })

  it('closed opens on the third consecutive failure only', () => {
    expect(LOGIC.nextState(SPEC.STATE_CLOSED, true, 2, 0)).toBe(
      SPEC.STATE_CLOSED
    )
    expect(LOGIC.nextState(SPEC.STATE_CLOSED, true, 3, 0)).toBe(SPEC.STATE_OPEN)
    expect(LOGIC.nextState(SPEC.STATE_CLOSED, false, 1, 0)).toBe(
      SPEC.STATE_CLOSED
    )
  })

  it('open turns half-open after the cooldown and not before', () => {
    expect(LOGIC.nextState(SPEC.STATE_OPEN, true, 0, 9999)).toBe(
      SPEC.STATE_OPEN
    )
    expect(LOGIC.nextState(SPEC.STATE_OPEN, false, 0, 10000)).toBe(
      SPEC.STATE_HALF_OPEN
    )
    expect(LOGIC.nextState(SPEC.STATE_OPEN, true, 0, 10000)).toBe(
      SPEC.STATE_HALF_OPEN
    )
  })

  it('half-open success closes the breaker, a failure reopens it', () => {
    expect(LOGIC.nextState(SPEC.STATE_HALF_OPEN, true, 0, 0)).toBe(
      SPEC.STATE_CLOSED
    )
    expect(LOGIC.nextState(SPEC.STATE_HALF_OPEN, false, 0, 0)).toBe(
      SPEC.STATE_OPEN
    )
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
