/**
 * The generation/neuroImageGeneration Inngest function charged the user TWICE
 * per generation: the 'process-payment' step calls processBalanceOperation
 * (which performs a real MONEY_OUTCOME deduction — it is the charge, not a
 * check, despite its "Balance check" logging), and a separate
 * 'deduct-balance-final' step then called updateUserBalance(MONEY_OUTCOME) a
 * SECOND time. Every neuro-image generation billed 2x totalCost. Sibling
 * generators (morphImages, modelTrainingV2) charge exactly once via
 * processBalanceOperation with no second deduction.
 *
 * The fix removes the duplicate charge, keeping processBalanceOperation as the
 * single charge and computing the display balance for the completion message.
 *
 * Source-level seam test (the function is a large Inngest handler with heavy
 * provider/Telegram deps). Mutation — re-adding a direct MONEY_OUTCOME deduct,
 * or the deduct-balance-final step — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'inngest_app',
  'functions',
  'generation',
  'neuroImageGeneration.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('neuroImageGeneration charges exactly once (no double charge)', () => {
  it('has a single processBalanceOperation charge entry', () => {
    const s = code()
    const charges = (s.match(/processBalanceOperation\(/g) || []).length
    expect(charges, 'expected exactly one processBalanceOperation charge').toBe(
      1
    )
  })

  it('does not perform a second, direct MONEY_OUTCOME deduction', () => {
    const s = code()
    // the duplicate charge was a direct updateUserBalance(..., MONEY_OUTCOME).
    // processBalanceOperation owns the sole deduction; this file must not also
    // deduct directly.
    expect(
      /MONEY_OUTCOME/.test(s),
      'a direct MONEY_OUTCOME deduction is back (double charge)'
    ).toBe(false)
    expect(
      /deduct-balance-final/.test(s),
      'the duplicate deduct-balance-final step is back'
    ).toBe(false)
  })

  it('still computes the post-charge balance for the completion message', () => {
    const s = code()
    expect(
      /const finalBalance = initialBalance - totalCost/.test(s),
      'the completion-message balance is not computed from the single charge'
    ).toBe(true)
  })
})
