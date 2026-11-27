// Spec dry-run-gate.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
import { describe, expect, it } from 'vitest'
import * as SPEC from './dry-run-gate.gen'
import * as LOGIC from './dry-run-gate.logic'

describe('spec dry-run-gate.t27', () => {
  it('an absent dry_run field leaves the call a dry run', () => {
    expect(LOGIC.effectiveDryRun(false, true)).toBe(true)
    expect(LOGIC.effectiveDryRun(false, false)).toBe(true)
    expect(LOGIC.effectiveDryRun(true, false)).toBe(false)
    expect(LOGIC.effectiveDryRun(true, true)).toBe(true)
  })

  it('a write executes only when it is no dry run and carries the confirm', () => {
    expect(LOGIC.mayExecute(true, true)).toBe(false)
    expect(LOGIC.mayExecute(true, false)).toBe(false)
    expect(LOGIC.mayExecute(false, false)).toBe(false)
    expect(LOGIC.mayExecute(false, true)).toBe(true)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
