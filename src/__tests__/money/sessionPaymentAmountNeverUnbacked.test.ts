import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * `ctx.session.paymentAmount` is read by exactly one thing, CancelButtonService,
 * which treats it as "the amount this user was charged" and refunds it when the
 * user presses Cancel.
 *
 * Repo-wide it had exactly two writes: CancelButtonService zeroing it after a
 * refund, and validateAndCalculateImageModelPrice setting it to the model's
 * price. That second write happened at VALIDATION time -- before any charge,
 * and before the balance check in the same function. Nothing anywhere ever set
 * it from an actual debit.
 *
 * So the field never meant "charged", it meant "intended price", and every
 * refund driven by it credited stars that were never taken. Picking a model and
 * pressing Cancel was enough; it worked even when the balance was too low to
 * afford that model.
 *
 * The charge for that flow happens later and elsewhere -- inside
 * generateTextToImageDirect via processBalanceOperation -- and that function
 * issues its own refund on failure, so removing the write loses no legitimate
 * refund. The wizard keeps its own figure in ctx.session.imageGenerationPrice.
 *
 * Found by sweeping the class rather than by luck: files that credit and never
 * debit. Most of the eighteen are legitimate (top-ups, referral bonuses,
 * promos); the sharp population is the callers of the shared refund helpers,
 * and this is what was left after reading them.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/** Any assignment to the session field. Group 1 is the assigned expression. */
const WRITE = /session\.paymentAmount\s*=\s*([^\n;]+)/g

const productionSources = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (
          e.name !== 'node_modules' &&
          e.name !== '__tests__' &&
          e.name !== 'test'
        )
          walk(rel)
      } else if (e.name.endsWith('.ts')) out.push(rel)
    }
  }
  walk('src')
  return out
}

describe('the session field the cancel button refunds', () => {
  it('is never given a non-zero value anywhere in production code', () => {
    // The ratchet. A non-zero write is only honest if the code that made it
    // had just performed a debit -- which is why reintroducing one has to fail
    // here and be argued for, rather than slipping in as "restoring a refund".
    // A floor before the bound. An empty walk gives an empty offender list and
    // this ratchet reports health while seeing nothing. Measured 2026-09-06:
    // 718 production sources.
    const sources = productionSources()
    expect(sources.length, 'the source walk found nothing').toBeGreaterThan(500)
    const offenders: string[] = []
    for (const f of sources) {
      for (const m of matchCode(read(f), WRITE)) {
        const assigned = m[1].trim()
        if (/^0\b/.test(assigned)) continue
        offenders.push(`${f}: = ${assigned}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('is not written by the price validator, which runs before any charge', () => {
    const src = read('src/price/helpers/validateAndCalculateImageModelPrice.ts')
    expect(matchCode(src, WRITE).length).toBe(0)
    // The function must still do its actual job.
    expect(src).toMatch(/currentBalance < price/)
    expect(src).toMatch(/return price/)
  })

  it('still zeroes the field after refunding, so a refund cannot repeat', () => {
    // The mechanism is not deleted, only its unbacked input. If a real charge
    // ever writes the field, this guard is what stops a second refund.
    const src = read('src/navigation/services/CancelButtonService.ts')
    expect(src).toMatch(/session\.paymentAmount\s*=\s*0/)
    expect(src).toMatch(/paymentAmount\s*>\s*0/)
  })

  it('the matcher still recognises the write it forbids', () => {
    // Control. The first check is an absence check, and an absence check with a
    // broken matcher reports a clean repository.
    expect(matchCode('ctx.session.paymentAmount = price', WRITE).length).toBe(1)
    expect(
      matchCode('ctx.session.paymentAmount = 0 // cleared', WRITE)[0][1].trim()
    ).toMatch(/^0/)
  })
})
