// Spec api-key-gate.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
// The key strings here are the spec's own synthetic vectors, not credentials.
import { describe, expect, it } from 'vitest'
import * as SPEC from './api-key-gate.gen'
import * as LOGIC from './api-key-gate.logic'

describe('spec api-key-gate.t27', () => {
  it('the key must start with the expected prefix', () => {
    expect(LOGIC.hasPrefix(SPEC.KEY_GOOD)).toBe(true)
    expect(LOGIC.hasPrefix(SPEC.KEY_SHORT)).toBe(true)
    expect(LOGIC.hasPrefix(SPEC.KEY_WRONG_PREFIX)).toBe(false)
    expect(LOGIC.hasPrefix('tr')).toBe(false)
    expect(SPEC.KEY_PREFIX).toBe('trios_')
    expect(SPEC.API_KEY_ENV_NAME).toBe('TRIOS_API_KEY')
  })

  it('length bounds reject short and empty keys', () => {
    expect(LOGIC.lengthOk(38)).toBe(true)
    expect(LOGIC.lengthOk(24)).toBe(true)
    expect(LOGIC.lengthOk(128)).toBe(true)
    expect(LOGIC.lengthOk(9)).toBe(false)
    expect(LOGIC.lengthOk(0)).toBe(false)
    expect(LOGIC.lengthOk(23)).toBe(false)
    expect(SPEC.MIN_KEY_LEN).toBe(24)
    expect(SPEC.MAX_KEY_LEN).toBe(128)
  })

  it('the gate fails closed without a configured key', () => {
    expect(LOGIC.allows(false, SPEC.KEY_GOOD, false)).toBe(false)
    expect(LOGIC.allows(true, '', false)).toBe(false)
  })

  it('the gate accepts only valid keys on guarded paths', () => {
    expect(LOGIC.allows(true, SPEC.KEY_GOOD, false)).toBe(true)
    expect(LOGIC.allows(true, SPEC.KEY_SHORT, false)).toBe(false)
    expect(LOGIC.allows(true, SPEC.KEY_WRONG_PREFIX, false)).toBe(false)
  })

  it('exempt paths stay open', () => {
    expect(LOGIC.allows(true, SPEC.KEY_GOOD, true)).toBe(true)
    expect(LOGIC.allows(false, SPEC.KEY_GOOD, true)).toBe(true)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
