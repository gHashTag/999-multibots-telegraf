/**
 * A REFUND IS ONLY HONEST AFTER A CHARGE, AT THE CALL SITE TOO.
 *
 * Found by the charge-site census while reviewing generateGptImage25, which had
 * been red on main since it landed. Its catch refunded `totalCost` whenever
 * `skipBalanceCheck` was false -- but the charge happens two thirds of the way
 * down the try, and four things above it throw: a missing API key, the Zod
 * parse, an unknown user, the level bump. Each of those landed in the same
 * catch and asked for five stars back on a charge that never happened.
 *
 * WHY refundUser's OWN GUARD IS NOT THE ANSWER. hasChargeToRefund refuses a
 * refund when the ledger holds no charge in the last twenty-four hours, and
 * that is a real floor -- it is why this was not a standing mint. But it looks
 * for ANY charge of at least that size, not the one this call believed it made.
 * A person who generated anything else that day satisfies it, and is then paid
 * for a failure they never funded. A central guard that cannot tell which
 * charge it is refunding needs the call site to be right as well.
 *
 * refund-needs-charge.test.ts pins the central guard. This pins the near side
 * of the same rule: the flag is the charge itself, never the intention.
 *
 * Read as source, like the sibling money ratchets: reaching this catch needs
 * kie.ai, Supabase, a Telegram context and a failing generation, so what is
 * pinned is the structure the defect lived in -- ORDER, and which condition
 * the refund hangs from.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.resolve(__dirname, '../../services/generateGptImage25.ts')

/** Blank comments, keeping offsets, so prose cannot satisfy a code assertion. */
const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

const src = stripComments(fs.readFileSync(FILE, 'utf8'))

describe('generateGptImage25 refunds only what it actually took', () => {
  it('has a refund to guard at all', () => {
    // The floor. Every assertion below is a substring search, and all of them
    // pass vacuously the day someone renames the service or moves the refund.
    expect(
      src,
      'the refund is gone -- this ratchet now proves nothing'
    ).toMatch(/refundUser\(/)
    expect(src).toContain('processBalanceOperation(')
  })

  it('hangs the refund on the charge, not on the intention to charge', () => {
    const refund = src.indexOf('refundUser(')
    const guard = src.lastIndexOf('if (charged)', refund)
    expect(guard, 'the refund is not behind the charge flag').toBeGreaterThan(
      -1
    )
    expect(
      src.slice(guard, refund),
      'something sits between the flag and the refund it guards'
    ).not.toContain('}')

    // The condition this replaced. `skipBalanceCheck` says what the CALLER
    // asked for; it cannot say whether the money moved.
    expect(
      src.slice(Math.max(0, refund - 400), refund),
      'the refund is back on skipBalanceCheck, which does not know if a charge happened'
    ).not.toContain('skipBalanceCheck')
  })

  it('raises the flag only after the balance operation succeeded', () => {
    const op = src.indexOf('processBalanceOperation(')
    const set = src.indexOf('charged = true')
    expect(
      set,
      'the flag is never raised -- no failure can ever refund'
    ).toBeGreaterThan(op)

    // And after the failure branch returns, not before it: a flag raised
    // alongside the request would be true for a refused payment as well.
    const refused = src.indexOf('balanceCheck.success')
    expect(refused).toBeGreaterThan(-1)
    expect(
      set,
      'the flag is raised before the refusal branch has had its say'
    ).toBeGreaterThan(refused)
  })

  it('starts the flag down', () => {
    expect(src).toMatch(/let\s+charged\s*=\s*false/)
  })

  it('the refusal path returns without refunding', () => {
    // An empty wallet is the most common way into this function's failure half
    // and the one that mints most easily: nothing was taken, so nothing may be
    // returned. It leaves by `return null`, never through the catch.
    const refused = src.indexOf('balanceCheck.success')
    const branch = src.slice(refused, src.indexOf('charged = true'))
    expect(branch).toContain('return null')
    expect(branch).not.toContain('refundUser(')
  })
})
