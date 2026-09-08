import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * EVERY PLACE THAT MOVES A TOKEN BALANCE, ENUMERATED BY THE ACTION.
 *
 * This exists because a fix did not travel. Two defects were closed in
 * billing-shared -- an unpriced operation given away, and a refund that
 * re-derived what the charge had measured -- and the identical pair sat
 * untouched in src/agent/tools.ts, which is the implementation with the daily
 * traffic. The census written to prevent exactly that matched the FUNCTION
 * NAMES it knew, so it confirmed the app was clean while the hole stood
 * twenty lines away.
 *
 * Searching by the action instead of the name found every door in one pass:
 * the SQL that adds to or subtracts from user_tokens.balance. That is the
 * check worth keeping. A sixth site appearing tomorrow is a third
 * implementation of money movement, and it should have to be declared here
 * before it can ship.
 */
const ROOT = path.join(__dirname, '..', '..')

/** Every source line whose SQL moves user_tokens.balance. */
function balanceMoves(): string[] {
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) {
        if (!/node_modules|dist|\.git/.test(f)) walk(f)
      } else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(f)
    }
  }
  walk(ROOT)
  const out: string[] = []
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      // The SQL itself, not a mention of it: a comment describing the update
      // is not an update. Requiring SET rules those out.
      if (/SET\s+balance\s*=|DO UPDATE SET balance\s*=/.test(l)) {
        out.push(`${path.relative(ROOT, f)}:${i + 1}`)
      }
    })
  }
  return out
}

/**
 * The doors that exist, each audited on 2026-09-08. A new entry here is a
 * claim that somebody read it; the list is short on purpose.
 */
const DECLARED: Record<string, string> = {
  'src/agent/billing-shared.ts': 'spendByTid debits, refundByTid credits',
  'src/agent/tools.ts': 'spendTokens debits, refundTokens credits (the agent)',
  'src/stars-credit.ts': 'creditStarsPayment credits a Telegram Stars payment',
}

describe('every place that moves a token balance is a place somebody read', () => {
  it('finds the movements at all — otherwise this test proves nothing', () => {
    // A matcher that stops matching would report an empty population as a
    // clean bill. That is the failure this whole file exists to prevent.
    expect(balanceMoves().length).toBeGreaterThanOrEqual(5)
  })

  it('has no undeclared implementation of moving money', () => {
    const undeclared = balanceMoves()
      .map(s => s.split(':')[0])
      .filter(f => !(f in DECLARED))
    expect(
      [...new Set(undeclared)],
      'a file moves user_tokens.balance and is not in DECLARED — read it, then declare it'
    ).toEqual([])
  })

  it('declares nothing that has since disappeared', () => {
    const present = new Set(balanceMoves().map(s => s.split(':')[0]))
    const stale = Object.keys(DECLARED).filter(f => !present.has(f))
    expect(stale, 'declared but no longer moving a balance').toEqual([])
  })
})
