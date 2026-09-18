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

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const CHARGE =
  /await\s+(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper)\s*\(/
// captured if the charge is assigned or returned on the same line
const CAPTURED =
  /(=\s*await|return\s+await)\s+(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper)\s*\(/

// Scenes whose charge call is DEAD (unreachable / unwired) -> discarding the
// result is harmless because the charge never runs. Each is separately proven
// dead + SAFE (with a self-verifying assertion) in paid-wizard-guard-ratchet.
const DEAD_DISCARD_ALLOWLIST = new Set<string>([
  // fal-render-wizard removed 2026-09-18: its dead charge now binds the
  // result and bails, so it no longer discards. Still dead code -- this list
  // tracks discarding, not liveness.
  // ai-reels-inngest-wizard removed: its charge now binds the result and bails
  // when the charge fails, so it no longer discards and the entry would be
  // stale. The scene is still unregistered -- the allowlist tracks discarding,
  // not liveness.
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

  it('the narrow scope is complete: no discarded charge lives outside src/scenes', () => {
    // WHY THIS RATCHET IS NARROW, stated as a CHECK rather than a comment.
    //
    // it.188 nearly widened a different money guard because its scope looked
    // arbitrary; reading the call sites showed the narrow scope was right, and
    // widening would have added false positives. The reason had been recorded
    // nowhere, so the question cost half an iteration.
    //
    // A comment would answer it once. This assertion answers it every run: the
    // scope is src/scenes because a discarded charge exists nowhere else. If
    // one ever appears in services or inngest, this fails and the scope has to
    // be revisited deliberately -- rather than the guard staying quietly
    // narrower than its class.
    const outside: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (p !== 'src/scenes' && !p.includes('__tests__')) walk(p)
          continue
        }
        if (!p.endsWith('.ts')) continue
        const raw = fs.readFileSync(p, 'utf8')
        const bare =
          /^[ \t]*await[ \t]+(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper|deductBalanceAfterSuccess)[ \t]*\(/gm
        for (const m of matchCode(raw, bare)) {
          outside.push(
            `${p}:${raw.slice(0, m.index).split('\n').length} ${m[1]}`
          )
        }
      }
    }
    walk('src')
    expect(
      outside,
      'a charge result is discarded OUTSIDE src/scenes, so this scope no longer ' +
        'covers the class. Widen it deliberately, or handle these there:\n' +
        outside.join('\n')
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
