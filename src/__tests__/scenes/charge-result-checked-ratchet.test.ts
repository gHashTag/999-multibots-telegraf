/**
 * A charge result must never be discarded (unbilled-paid class).
 *
 * updateUserBalance / processBalanceOperation / processBalanceVideoOperationHelper
 * return false on a failed debit (they do NOT throw): a schema/insert failure or
 * a ghost-payer with no users row. A scene that calls the charge and ignores the
 * result then generates+delivers on a FAILED charge -> free paid generation
 * (unbilled-paid, e.g. #1350 ai-reels-render, and the instagram scenes). The fix
 * across the family was: capture the result and abort/handle when falsy.
 *
 * This ratchet keeps that from regressing: every charge call in src/scenes must
 * CAPTURE its result (assign it or return it), so a failed charge can be checked.
 * A discarded `await charge(...)` in a live scene fails here. Dead scenes whose
 * charge is unreachable are allowlisted (they are separately proven dead+SAFE by
 * the completeness ratchet's self-verifying assertions).
 *
 * Scope: it proves the result is CAPTURED, not that every capture is checked --
 * capture is necessary (you cannot check what you discarded) and is the reliable,
 * high-signal source-level invariant. The discarded form is the one that shipped.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CHARGE =
  /await\s+(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper)\s*\(/
// captured if the charge is assigned or returned on the same line
const CAPTURED =
  /(=\s*await|return\s+await)\s+(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper)\s*\(/

// Scenes whose charge call is DEAD (unreachable / unwired) -> discarding the
// result is harmless because the charge never runs. Each is separately proven
// dead + SAFE (with a self-verifying assertion) in paid-wizard-guard-ratchet.
//
// ai-reels-inngest-wizard left this list when its charge was fixed: the debit
// result is now captured, checked, and refunded on a dispatch failure. It is
// still an unwired scene, so this was never a live leak -- but a dead site left
// broken becomes a live one the day somebody registers the scene, and the
// allowlist entry would have hidden it then.
const DEAD_DISCARD_ALLOWLIST = new Set<string>([
  'src/scenes/lipSyncWizard/fal-render-wizard.ts',
])

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

type Call = { file: string; line: number; captured: boolean }

const scan = (): Call[] => {
  const calls: Call[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
        const lines = stripComments(fs.readFileSync(p, 'utf8')).split('\n')
        lines.forEach((ln, i) => {
          if (CHARGE.test(ln)) {
            calls.push({
              file: p.split(path.sep).join('/'),
              line: i + 1,
              captured: CAPTURED.test(ln),
            })
          }
        })
      }
    }
  }
  walk(path.join('src', 'scenes'))
  return calls
}

describe('charge results are never discarded in live scenes (unbilled-paid) ', () => {
  const calls = scan()

  it('finds a non-trivial number of charge calls (a broken matcher fails, not passes)', () => {
    expect(
      calls.length,
      'the charge-call matcher found too few sites — it likely broke'
    ).toBeGreaterThanOrEqual(25)
  })

  it('every charge call in a live scene captures its result', () => {
    const discarded = calls
      .filter(c => !c.captured && !DEAD_DISCARD_ALLOWLIST.has(c.file))
      .map(c => `${c.file}:${c.line}`)
    expect(
      discarded,
      'these live scenes DISCARD a charge result -> a failed charge still ' +
        'generates (unbilled-paid). Capture it (const x = await ...) and handle ' +
        '!x, or (if the charge is dead) prove it dead and add to the allowlist:\n' +
        discarded.join('\n')
    ).toEqual([])
  })

  it('no allowlist entry is stale (each still exists and still discards a charge)', () => {
    const discardingFiles = new Set(
      calls.filter(c => !c.captured).map(c => c.file)
    )
    const stale = [...DEAD_DISCARD_ALLOWLIST].filter(
      f => !discardingFiles.has(f)
    )
    expect(
      stale,
      'these allowlist entries no longer discard a charge (fixed / moved?) — remove them:\n' +
        stale.join('\n')
    ).toEqual([])
  })
})
