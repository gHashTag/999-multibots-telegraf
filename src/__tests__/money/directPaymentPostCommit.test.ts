/**
 * directPaymentProcessor commits the payments_v2 row (money moves), then reads
 * the balance cache + current balance for the return payload. Those post-commit
 * reads sit after the commit but inside the function's outer try, so a throw
 * there would reach the outer catch and return success:false for a payment that
 * ALREADY committed -- a false negative: the caller retries into a double charge,
 * or does not deliver. They must be isolated so a transient read cannot flip a
 * committed payment. Same class as updateUserBalance (#1397).
 *
 * Source-seam test (directPaymentProcessor has heavy DB/notification deps).
 * Mutation -- unwrapping either read -- fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enclosedBy } = require('../../../scripts/lib/enclosing-statement.cjs')

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'core',
  'supabase',
  'directPayment.ts'
)
const code = () => fs.readFileSync(SRC, 'utf8')

describe('directPayment isolates post-commit side-effects from the committed return (#1397)', () => {
  it('wraps invalidateBalanceCache in its own try (a throw must not flip success)', () => {
    expect(
      enclosedBy(code(), 'await invalidateBalanceCache', /^try\s*\{/),
      'invalidateBalanceCache is not isolated in its own try'
    ).toBe(true)
  })

  it('wraps the return-payload balance read in its own try with a fallback', () => {
    const s = code()
    expect(
      /let newBalance =/.test(s),
      'newBalance is a const (a read throw cannot fall back)'
    ).toBe(true)
    expect(
      enclosedBy(s, 'newBalance = await getUserBalance', /^try\s*\{/),
      'the newBalance getUserBalance read is not isolated in its own try'
    ).toBe(true)
  })
})
