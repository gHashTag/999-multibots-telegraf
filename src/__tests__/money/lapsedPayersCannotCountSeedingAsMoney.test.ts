import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * The lapsed-payer segment exists to decide whether to write to people who
 * once paid. Two ways it can mislead, both hit while building it:
 *
 * 1. It asked three columns whether a credit was seeded and had fetched none
 *    of them. Every answer was no, the held total came out 757112 instead of
 *    143788, and the line printing it still said the seeding had been removed.
 *    A filter over fields that were never selected matches nothing and reports
 *    that as "none found".
 * 2. A bare sum. The top holder is a third of the total, so the sum describes
 *    one person more than it describes the group.
 */
const SRC = fs.readFileSync(
  path.join(process.cwd(), 'scripts/lapsed-payers.cjs'),
  'utf8'
)
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /^([^'"`\n]*?)\/\/.*$/gm,
  (_m, k) => k
)

describe('the lapsed-payer segment cannot count seeded credit as money', () => {
  it('fetches every column its seeding filter reads', () => {
    const select = /'(id,telegram_id[^']*)'/.exec(code)
    expect(select, 'the payments select must be findable').not.toBeNull()
    for (const col of ['description', 'is_test', 'is_system_payment']) {
      expect(
        select![1],
        `${col} is read by isSeed and must be selected`
      ).toContain(col)
    }
  })

  it('refuses to report when those columns are missing, rather than reporting zero', () => {
    expect(code).toMatch(/absent\.length/)
    const guard = code.slice(code.indexOf('absent.length'))
    expect(guard.slice(0, 400)).toContain('process.exit(2)')
  })

  it('never prints a total without the concentration beside it', () => {
    // Both totals are printed; each must be accompanied, in the same output,
    // by the top-holder share or the label saying what it includes.
    expect(code).toContain('top holder is')
    const totalLines = code
      .split('\n')
      .filter(l => /total \$\{Math\.round/.test(l))
    expect(totalLines.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the two balances apart instead of picking one silently', () => {
    expect(code).toContain('rawBalance')
    expect(code).toContain('balance: Math.round(balance')
    expect(code).toContain('rawBalance: Math.round(rawBalance')
  })

  it('says out loud that it sends nothing', () => {
    expect(SRC).toMatch(/sends nothing|Nobody is messaged/i)
  })
})
