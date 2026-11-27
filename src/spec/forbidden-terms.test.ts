// Spec forbidden-terms.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
import { describe, expect, it } from 'vitest'
import * as SPEC from './forbidden-terms.gen'
import * as LOGIC from './forbidden-terms.logic'

describe('spec forbidden-terms.t27', () => {
  it('the fold maps uppercase ASCII and keeps the rest', () => {
    expect(LOGIC.fold(67)).toBe(99)
    expect(LOGIC.fold(69)).toBe(101)
    expect(LOGIC.fold(97)).toBe(97)
    expect(LOGIC.fold(47)).toBe(47)
    expect(LOGIC.fold(48)).toBe(48)
  })

  it('contains matches case-insensitively with clean edges', () => {
    expect(LOGIC.contains(SPEC.TXT_HIT_CLAUDE, SPEC.TERM_CLAUDE)).toBe(true)
    expect(LOGIC.contains(SPEC.TXT_CLEAN, SPEC.TERM_CLAUDE)).toBe(false)
    expect(LOGIC.contains(SPEC.TXT_CLEAN, '')).toBe(false)
    expect(LOGIC.contains(SPEC.TXT_CLEAN, SPEC.TERM_VASILEV)).toBe(false)
    expect(LOGIC.contains(SPEC.TXT_TRICKY, SPEC.TERM_TOK)).toBe(false)
    expect(LOGIC.contains(SPEC.TXT_HIT_ROLLBACK, SPEC.TERM_ROLLBACK)).toBe(true)
  })

  it('term hits are case-insensitive substrings', () => {
    expect(LOGIC.hitsClaude(SPEC.TXT_HIT_CLAUDE)).toBe(true)
    expect(LOGIC.hitsClaude(SPEC.TXT_CLEAN)).toBe(false)
    expect(LOGIC.hitsRollback(SPEC.TXT_HIT_ROLLBACK)).toBe(true)
    expect(LOGIC.hitsTok(SPEC.TXT_TRICKY)).toBe(false)
    expect(LOGIC.hitsTokFull(SPEC.TXT_TRICKY)).toBe(false)
    expect(LOGIC.hitsNvidia(SPEC.TXT_CLEAN)).toBe(false)
    expect(LOGIC.hitsVasilev(SPEC.TXT_CLEAN)).toBe(false)
  })

  it('a clean chapter passes and a hit fails the audit', () => {
    expect(LOGIC.chapterIsClean(SPEC.TXT_CLEAN)).toBe(true)
    expect(LOGIC.chapterIsClean(SPEC.TXT_TRICKY)).toBe(true)
    expect(LOGIC.chapterIsClean(SPEC.TXT_HIT_CLAUDE)).toBe(false)
    expect(LOGIC.chapterIsClean(SPEC.TXT_HIT_ROLLBACK)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
