import { describe, expect, it } from 'vitest'
import { marketplaceAgentById } from '../packages/vibee-atoms/src/agent-marketplace'
import { marketplaceAgentPrompt } from './src/agent/chat'

/**
 * THE CODING SCIENTIST CODES BY THE T27 RULES (owner, 2026-09-26: "the
 * programmer must code by all the .t27 rules"). The rules of the language
 * (gHashTag/t27 SOUL.md + T27-CONSTITUTION laws L1-L7) are woven into the
 * coder's contract, so a person who asks it for a .t27 spec gets one the
 * compiler and CI accept -- not a draft that silently compiles to an empty
 * test.
 *
 * The prompt is what governs the agent's behaviour; each rule below has bitten
 * this project (the braceless test that discards its body; the seal and
 * NOW.md gates that failed the spec PR #4840), so the contract must name it.
 */
const prompt = marketplaceAgentPrompt('coder')

describe('the coder is told the t27 rules of the game', () => {
  it('names the TDD mandate and the empty-test trap (L4)', () => {
    expect(prompt).toMatch(/test/)
    expect(prompt).toMatch(/assert/)
    // The trap: the keyword/braceless form compiles to an empty test.
    expect(prompt).toMatch(/пуст|empty/i) // cyrillic-ok: matches the Russian prompt
  })

  it('names ASCII/English purity (L3) and the phi identity footer (L5)', () => {
    expect(prompt).toMatch(/ASCII/)
    expect(prompt).toMatch(/phi\^2/)
  })

  it('names generation (L2), traceability (L1) and no-new-shell (L7)', () => {
    expect(prompt).toMatch(/gen\//)
    expect(prompt).toMatch(/Closes #N/)
    expect(prompt).toMatch(/\*\.sh/)
  })

  it('names the seal and NOW.md gates that a spec PR must satisfy', () => {
    expect(prompt).toMatch(/seal/)
    expect(prompt).toMatch(/NOW\.md/)
  })

  it('says a spec is done only at spec-status IMPLEMENTED/PARTIAL, honest otherwise', () => {
    expect(prompt).toMatch(/spec-status/)
    expect(prompt).toMatch(/IMPLEMENTED/)
    expect(prompt).toMatch(/не проверял|не запуска/) // cyrillic-ok: matches the Russian prompt
  })

  it('still keeps the run-before-you-claim rule for ts/js', () => {
    expect(prompt).toMatch(/code_run/)
    expect(prompt).toMatch(/Deno|песочниц/i) // cyrillic-ok: matches the Russian prompt
  })

  it('the catalogue lists the agent and t27-spec authoring among its skills', () => {
    const coder = marketplaceAgentById('coder')
    expect(coder).not.toBeNull()
    const skills = (coder?.skills ?? []).map(s => s.en).join(' | ')
    expect(skills).toMatch(/\.t27 spec/)
  })
})
