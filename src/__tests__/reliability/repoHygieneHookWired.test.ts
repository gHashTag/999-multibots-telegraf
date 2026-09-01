/**
 * Ratchet: the repo-hygiene tracked-symlink gate stays wired into the pre-push hook.
 *
 * PR #1608 committed node_modules as a symlink to an absolute path on another
 * machine, which breaks pull/checkout repo-wide (git aborts overwriting the
 * untracked node_modules). CI is dead (billing), so the lefthook pre-push gate
 * (repo-hygiene-audit.mjs --gate, added iter247) is the ONLY automated defense --
 * it exits non-zero on any tracked symlink (mode 120000). This ratchet fails if
 * that gate is silently dropped from lefthook.yml.
 *
 * floor + self-check + real-source mutation. loop-fable iter247.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const LEFTHOOK = path.resolve(__dirname, '../../../lefthook.yml')

/** Is the repo-hygiene --gate command present in a lefthook config string? */
function gateWired(cfg: string): boolean {
  return /repo-hygiene-audit\.mjs\s+--gate/.test(cfg)
}

describe('repo-hygiene symlink gate is wired into pre-push', () => {
  const cfg = fs.readFileSync(LEFTHOOK, 'utf8')

  it('floor: lefthook.yml has a pre-push section', () => {
    expect(/pre-push:/.test(cfg)).toBe(true)
  })

  it('the tracked-symlink gate runs in pre-push', () => {
    expect(
      gateWired(cfg),
      `The repo-hygiene tracked-symlink gate (repo-hygiene-audit.mjs --gate) was ` +
        `removed from lefthook.yml. With CI dead this is the only guard against a ` +
        `#1608-style tracked symlink that breaks pull/checkout repo-wide. Restore it.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes wired from unwired configs', () => {
    expect(
      gateWired('run: node .claude/loop-opus/repo-hygiene-audit.mjs --gate')
    ).toBe(true)
    expect(gateWired('run: node scripts/other.cjs')).toBe(false)
  })

  it('mutation: dropping the gate command turns the check RED', () => {
    const mutated = cfg.replace(/repo-hygiene-audit\.mjs --gate/, 'noop.mjs')
    expect(mutated).not.toEqual(cfg)
    expect(gateWired(mutated)).toBe(false)
  })
})
