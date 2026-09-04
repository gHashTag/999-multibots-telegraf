import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

/**
 * Ratchet: money-map must recognise BOTH spellings of giving money back.
 *
 * Three ratchets now read money-map as the authority on where money moves
 * (chargeSiteCensus, and the reconciliations behind creditGuardsHold and the
 * paid-wizard reconciliation). A blind spot in its classifier is therefore a
 * blind spot in all of them at once, and it is invisible from outside: every
 * consumer stays green while the population quietly shrinks.
 *
 * It had one. For updateUserBalance the classifier tested only MONEY_INCOME and
 * MONEY_OUTCOME, so PaymentType.REFUND fell through to 'balance-op' -- while the
 * branch SIX LINES ABOVE, for directPaymentProcessor/processBalanceOperation,
 * tests /REFUND|MONEY_INCOME/. One function, two rules for one word.
 *
 * Three real refunds were filed as 'balance-op' (aiCoverWizard,
 * voiceTrainingRVC x2). The consequence was not academic: deriving "files that
 * charge and never give anything back" put aiCoverWizard on that list, and it
 * refunds on its failure path. A finding was one step from being published
 * about a file that does the right thing.
 *
 * This is the third appearance of the same defect -- MONEY_INCOME known, REFUND
 * forgotten -- after the credit census (#1849) and videoRefundWithoutCharge
 * (#1847). It is pinned here rather than remembered.
 *
 * It checks the rule from two sides, because either alone rots. The output
 * assertions name the three calls the old classifier lost, so a real
 * misclassification fails. The rule assertion reads the classifier's own source
 * for the REFUND test, so the day the repository happens to contain no
 * REFUND-typed call in that position, the rule still cannot quietly disappear.
 */

const ROOT = path.resolve(__dirname, '../../..')
const MAP = path.join(ROOT, '.claude/loop-opus/money-map.mjs')

type Site = { file: string; direction: string; fn: string }

const sites = (): Site[] =>
  JSON.parse(
    execFileSync('node', [MAP, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  )

describe('money-map knows both spellings of giving money back', () => {
  it('classifies a REFUND-typed balance call as a refund, not as unknown', () => {
    const all = sites()
    const refunds = all.filter(s => s.direction === 'refund')
    expect(
      refunds.length,
      'no refunds at all -- the tool measured nothing'
    ).toBeGreaterThan(20)

    // The specific calls the old classifier lost. Named, because a count alone
    // would pass again the day the vocabulary breaks in some other direction.
    const byFile = (f: string) =>
      all.filter(s => s.file.endsWith(f) && s.direction === 'refund').length
    expect(
      byFile('scenes/aiCoverWizard/index.ts'),
      'aiCoverWizard refunds on its failure path; filed as balance-op it reads as a scene that only takes'
    ).toBeGreaterThanOrEqual(1)
    expect(
      byFile('inngest_app/functions/training/voiceTrainingRVC.ts'),
      'voiceTrainingRVC has two REFUND-typed refunds'
    ).toBeGreaterThanOrEqual(2)
  })

  it('the classifier itself tests REFUND for the balance primitive', () => {
    // Reads the RULE, not only its output. Without this the assertions above
    // could be satisfied by a repository that happens to contain no REFUND call
    // in the awkward position, and the rule could rot unnoticed.
    const src = fs.readFileSync(MAP, 'utf8')
    const balanceBranch = src.slice(src.indexOf('name === BALANCE_FN'))
    const branch = balanceBranch.slice(0, balanceBranch.indexOf('return null'))
    expect(
      /REFUND/.test(branch),
      'the updateUserBalance branch must test REFUND; the CHARGE_FNS branch above already does'
    ).toBe(true)
  })

  it('what remains unclassified really is unclassifiable from the call', () => {
    // 'balance-op' is honest only while it means "the type arrives through a
    // variable, so the answer is not in this call". If it starts growing, it is
    // hiding a spelling again rather than reporting genuine indirection.
    const unclear = sites().filter(s => s.direction === 'balance-op')
    expect(
      unclear.length,
      `balance-op should hold only calls whose PaymentType comes from a variable ` +
        `(refundAndTell does exactly that). A jump here means a spelling was lost, ` +
        `not that the code became more dynamic.`
    ).toBeLessThanOrEqual(4)
  })
})
