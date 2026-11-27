// Spec confirm-gate.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
import { describe, expect, it } from 'vitest'
import * as SPEC from './confirm-gate.gen'
import * as LOGIC from './confirm-gate.logic'

describe('spec confirm-gate.t27', () => {
  it('an absent confirm field collapses to false', () => {
    expect(LOGIC.confirmed(false, true)).toBe(false)
    expect(LOGIC.confirmed(false, false)).toBe(false)
    expect(LOGIC.confirmed(true, true)).toBe(true)
    expect(LOGIC.confirmed(true, false)).toBe(false)
    expect(SPEC.CONFIRM_DEFAULT).toBe(false)
  })

  it('a destructive tool needs the explicit confirm, a read-only one never waits', () => {
    expect(LOGIC.executes(true, false, true)).toBe(false)
    expect(LOGIC.executes(true, true, false)).toBe(false)
    expect(LOGIC.executes(true, true, true)).toBe(true)
    expect(LOGIC.executes(false, false, false)).toBe(false)
    expect(LOGIC.executes(false, true, false)).toBe(false)
  })

  it('an unconfirmed destructive call answers its dry-run body', () => {
    expect(LOGIC.returnsDryRunBody(true, false, true)).toBe(true)
    expect(LOGIC.returnsDryRunBody(true, true, false)).toBe(true)
    expect(LOGIC.returnsDryRunBody(true, true, true)).toBe(false)
    expect(LOGIC.returnsDryRunBody(false, false, false)).toBe(false)
    expect(LOGIC.returnsDryRunBody(false, true, true)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
