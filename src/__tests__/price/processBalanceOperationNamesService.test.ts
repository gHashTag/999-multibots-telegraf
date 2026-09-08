import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE EXPENSE ROW NAMES ITS SERVICE IN THE DESCRIPTION.
 *
 * processBalanceOperation is the charge path behind every image wizard. Until
 * 2026-09-09 it wrote the constant 'Payment operation' as the description and
 * put the session mode only into metadata — and a database trigger then
 * rewrote service_type into its whitelist, so 4005 rows in the live ledger
 * (949 of the owner's own) said nothing about what was bought.
 *
 * Structural on purpose: the function reaches Supabase through three layers of
 * mocks, and what matters here is the exact literal passed as the description
 * argument. A mutation that puts the constant back fails both checks.
 */
const source = fs.readFileSync(
  path.join(__dirname, '../../price/helpers/processBalanceOperation.ts'),
  'utf8'
)

// Comment-blind: a comment that quotes the old constant is not a write of it.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('processBalanceOperation description', () => {
  it('passes "Payment for service: <mode>" as the description argument', () => {
    expect(source).toMatch(
      /updateUserBalance\(\s*telegram_id\.toString\(\),\s*paymentAmount,\s*PaymentType\.MONEY_OUTCOME,\s*`\$\{SERVICE_DESCRIPTION_PREFIX\}\$\{serviceMode\}`,/
    )
    expect(source).toContain(
      "import { SERVICE_DESCRIPTION_PREFIX } from '@/utils/serviceMapping'"
    )
  })

  it('no longer writes the bare constant anywhere', () => {
    expect(code).not.toContain("'Payment operation'")
  })

  it('metadata.service_type and the description carry the same mode', () => {
    const uses = source.match(/service_type: serviceMode,/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(2)
    expect(source).not.toMatch(
      /service_type: ctx\?\.session\?\.mode \|\| 'unknown_mode'/
    )
  })
})
