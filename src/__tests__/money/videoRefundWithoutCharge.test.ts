import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A refund is only a refund if something was charged. Otherwise it is a mint.
 *
 * modules/videoGenerator/generateTextToVideo credited the user
 * calculateFinalPrice(modelId) stars whenever a generation failed. Its only
 * caller is the improvePromptWizard scene, which is registered and live, and
 * NOTHING on that path debits: measured across every charge primitive in this
 * repo -- updateUserBalance, directPaymentProcessor, setPayments,
 * processBalanceOperation -- the single balance mutation reachable from the
 * scene was that credit. So every failed video generation handed out stars
 * that were never taken.
 *
 * The neighbouring live path, handleTextToVideoDirect, charges AFTER
 * delivering the video, so a failure there costs the user nothing and there is
 * nothing to give back. The two also priced differently: that one uses
 * getUnifiedModelPrice(id, {duration}), the credit used calculateFinalPrice(id)
 * with no duration, so the amount returned was not even an amount any path
 * would have charged.
 *
 * Refusing to credit is the safe direction. Restoring money to someone who WAS
 * charged is the owner's call, not this function's.
 *
 * What is pinned is the PAIR, not just the absence: no credit on this path,
 * AND no charge on it either. If someone later adds a charge, the second check
 * fails and forces a decision about the refund rather than leaving the module
 * silently taking money with no way back.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const MODULE = 'src/modules/videoGenerator/generateTextToVideo.ts'
const SCENE = 'src/scenes/improvePromptWizard/index.ts'

/** Every way this repository moves a balance. */
const CHARGE_PRIMITIVES =
  /\b(updateUserBalance|directPaymentProcessor|setPayments|processBalanceOperation)\s*\(/g
// Both spellings of a credit. This knew only MONEY_INCOME until a sweep over
// every money matcher found it: a refund reintroduced here as PaymentType.REFUND
// would have passed the check below. CHARGE_PRIMITIVES covers that case anyway,
// so nothing was reachable through the gap -- but a guard that names one of two
// spellings is one refactor away from being the only guard left.
const CREDIT = /\b(MONEY_INCOME|REFUND)\b/g
const DEBIT = /\bMONEY_OUTCOME\b/g

describe('the video generator that refunded without charging', () => {
  it('credits nobody', () => {
    expect(matchCode(read(MODULE), CREDIT).length).toBe(0)
    expect(matchCode(read(MODULE), CHARGE_PRIMITIVES).length).toBe(0)
  })

  it('still has no charge on that path, which is why no refund is due', () => {
    // The justification, pinned. A charge appearing here or in the scene makes
    // the rule above wrong, and this failing is how anyone finds that out.
    for (const f of [MODULE, SCENE]) {
      expect(matchCode(read(f), DEBIT).length, `${f} debits`).toBe(0)
      expect(
        matchCode(read(f), CHARGE_PRIMITIVES).length,
        `${f} charge primitives`
      ).toBe(0)
    }
  })

  it('is still the only caller, so the population is one scene', () => {
    // If a second caller appeared it might well charge, and then the reasoning
    // above would cover only half the callers.
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '__tests__') walk(rel)
        } else if (e.name.endsWith('.ts') && rel !== `/${MODULE}`) {
          if (
            matchCode(
              read(rel.slice(1)),
              /from\s*'@\/modules\/videoGenerator\/generateTextToVideo'/g
            ).length
          )
            callers.push(rel.slice(1))
        }
      }
    }
    walk('/src')
    expect(callers).toEqual([SCENE])
  })

  it('still reports the failure instead of swallowing it', () => {
    // Removing the credit must not remove the trace. A silent failure is how a
    // user gets nothing and nobody learns of it.
    const src = read(MODULE)
    expect(src).toMatch(/no refund is due because this path never charges/)
    expect(matchCode(src, /logger\.error\(/g).length).toBeGreaterThanOrEqual(1)
  })

  it('the matchers still recognise what they forbid', () => {
    // Control: three absence checks above, and an absence check with a broken
    // matcher reports a clean file.
    expect(
      matchCode(
        'await updateUserBalance(id, 1, PaymentType.MONEY_INCOME)',
        CHARGE_PRIMITIVES
      ).length
    ).toBe(1)
    expect(matchCode('PaymentType.MONEY_INCOME', CREDIT).length).toBe(1)
    expect(matchCode('PaymentType.MONEY_OUTCOME', DEBIT).length).toBe(1)
  })
})
