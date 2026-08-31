/**
 * Every invalidateBalanceCache call must be isolated in its own try/catch
 * (#1397/#1399 reactivation guard).
 *
 * The false-negative class: a payment/charge commits (money moves), then a
 * post-commit await inside the return-guarding outer try throws and flips the
 * committed result to false -> the caller retries into a double charge or does
 * not deliver. invalidateBalanceCache was the trigger in updateUserBalance
 * (#1398) and directPayment (#1400). It is a no-op today, so those fixes are
 * latent-until-re-enabled -- exactly why a NEW unisolated call must be blocked
 * before caching is ever turned back on.
 *
 * Rule: `await invalidateBalanceCache(...)` must be the first statement in a
 * dedicated try (so its own catch, not the function's return catch, handles a
 * throw). A bare unisolated call fails here.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CALL = /await\s+invalidateBalanceCache\s*\(/g
const ISOLATED = /try\s*\{\s*await\s+invalidateBalanceCache\s*\(/

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

type Site = { file: string; isolated: boolean }
const sites = (): Site[] => {
  const out: Site[] = []
  for (const f of walk('src')) {
    const src = fs.readFileSync(f, 'utf8')
    const n = (src.match(CALL) || []).length
    if (!n) continue
    // isolate check per file: count isolated occurrences vs total
    const iso = (src.match(new RegExp(ISOLATED, 'g')) || []).length
    for (let i = 0; i < n; i++) {
      out.push({
        file: f.split(path.sep).join('/'),
        isolated: i < iso,
      })
    }
  }
  return out
}

describe('every invalidateBalanceCache call is isolated in its own try (#1397)', () => {
  const found = sites()

  it('finds the invalidateBalanceCache call sites (a broken matcher fails, not passes)', () => {
    expect(
      found.length,
      'no invalidateBalanceCache calls found — the matcher likely broke'
    ).toBeGreaterThanOrEqual(2)
  })

  it('no call sits unisolated (a throw must not flip a committed charge to false)', () => {
    const bare = found.filter(s => !s.isolated).map(s => s.file)
    expect(
      bare,
      'these invalidateBalanceCache calls are NOT wrapped in their own try -> ' +
        'a throw (once caching is re-enabled) flips a committed charge to false. ' +
        'Wrap each in try/catch (log-and-continue), as in #1398/#1400:\n' +
        bare.join('\n')
    ).toEqual([])
  })
})
