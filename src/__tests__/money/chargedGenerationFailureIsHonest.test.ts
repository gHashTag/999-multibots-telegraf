import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * neuro-image-generation charges in its 'process-payment' step BEFORE the
 * generate loop, and issues no refund when generation fails. That is recorded
 * in the file itself and left as a follow-up, because crediting a balance is
 * the owner's decision, not this loop's -- owner item 21.
 *
 * What is NOT the owner's decision is what the user is told. The failure
 * message used to say only "try again a little later", which hides the loss:
 * the person retries, is charged again, and never learns that the first
 * attempt cost them anything. Saying the stars were taken costs nothing, mints
 * nothing, and is true.
 *
 * The message and the reason for it are pinned as a PAIR. If a refund is ever
 * wired in, the third check fails and forces the text to be revisited rather
 * than leaving the bot telling refunded users to contact support.
 */

const ROOT = path.resolve(__dirname, '../../..')
const FILE = 'src/inngest_app/functions/generation/neuroImageGeneration.ts'
const read = () => fs.readFileSync(path.join(ROOT, FILE), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const Q = '(?<![A-Za-z0-9_])PaymentType\\.'
const CREDIT = new RegExp(`${Q}(?:MONEY_INCOME|REFUND)\\b`, 'g')
const REFUND_HELPER = /\b(refundUser|refundAndTell|refundAndDescribe)\s*\(/g
const CHARGE = /\bprocessBalanceOperation\s*\(/g

describe('a failed generation the user already paid for', () => {
  it('tells the user the stars were taken, in both languages', () => {
    const src = read()
    // The Russian and English branches of the same message.
    expect(src).toMatch(new RegExp('списаны'))
    expect(src).toMatch(/were charged/)
  })

  it('no longer tells the user only to try again later', () => {
    // The exact wording that hid the loss. Pinned so it cannot come back by a
    // well-meaning simplification of the text.
    const src = read()
    expect(src).not.toMatch(new RegExp("Попробуйте ещё раз чуть позже\\.'"))
    expect(src).not.toMatch(/'❌ Image generation failed\. Please try again/)
  })

  it('still charges before generating, which is why the message is true', () => {
    // The justification. If the charge ever moves after delivery -- the shape
    // handleTextToVideoDirect and textToSpeechWizard use -- a failure would
    // cost nothing and this message would become a lie.
    const src = read()
    expect(matchCode(src, CHARGE).length).toBeGreaterThanOrEqual(1)
  })

  it('still issues no refund, which is the other half of the reason', () => {
    // If a refund is wired in, this fails and the message must be revisited:
    // telling a refunded user to contact support is its own kind of wrong.
    const src = read()
    expect(matchCode(src, CREDIT).length).toBe(0)
    expect(matchCode(src, REFUND_HELPER).length).toBe(0)
  })

  it('the matchers still recognise what they check for', () => {
    // Control: two of the checks above are absence checks.
    expect(
      matchCode('await updateUserBalance(a, b, PaymentType.REFUND)', CREDIT)
        .length
    ).toBe(1)
    expect(matchCode('await refundUser(ctx, 10)', REFUND_HELPER).length).toBe(1)
    expect(matchCode('await processBalanceOperation({})', CHARGE).length).toBe(
      1
    )
  })
})
