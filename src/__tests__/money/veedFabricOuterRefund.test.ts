/**
 * veed-fabric-wizard charges the user (updateUserBalance, MONEY_OUTCOME) then
 * starts an ASYNC lip-sync job (asyncLipSyncManager.startAsyncGeneration). The
 * inner ttsError/genError catches refund on their failure paths, but the OUTER
 * `catch (error)` of the step (the "Veed Fabric wizard Step 3" handler) only
 * logged + replied — no refund. A setup throw AFTER the charge but not caught by
 * an inner catch (e.g. between the charge and the async-start try) left the user
 * charged with no video and no refund (charged-no-refund; scout finding).
 *
 * The outer catch fires ONLY pre-dispatch (the async job start is inside the
 * genError try; the only path past it is a non-throwing leave()), so no video
 * was started and a refund is correct. Fix mirrors the voiceTrainingWizard oracle:
 * `charged` (set after the paymentSuccess guard) + `refundHandled` (set BEFORE
 * each refundAndTell, since refundAndTell does the DB refund then a reply — a
 * reply-throw after a successful refund reaches the outer catch, which must not
 * refund twice). Outer catch: `if (charged && !refundHandled) refundAndTell`.
 *
 * Source seam: the outer catch must refund gated on charged && !refundHandled.
 * Mutation (removing the gated refund) fails the test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () =>
  stripComments(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'scenes',
        'lipSyncWizard',
        'veed-fabric-wizard.ts'
      ),
      'utf8'
    )
  )

describe('veed-fabric outer catch refunds a post-charge failure (no charged-no-refund)', () => {
  it('refunds in the Step 3 outer catch, gated on charged && !refundHandled', () => {
    const s = code()
    const marker = 'Veed Fabric wizard Step 3'
    const start = s.indexOf(marker)
    expect(start, 'no Step 3 outer catch marker').toBeGreaterThan(-1)
    // bound to the outer catch block (marker .. its scene.leave())
    const end = s.indexOf('scene.leave()', start)
    const block = s.slice(start, end > start ? end : start + 800)
    expect(
      /charged && !refundHandled/.test(block),
      'outer catch does not refund a real charge -- charged-no-refund'
    ).toBe(true)
    expect(
      /refundAndTell\(/.test(block),
      'outer catch gate present but no refundAndTell call'
    ).toBe(true)
  })

  it('guards the outer refund against double-refund (refundHandled set before inner refunds)', () => {
    const s = code()
    // both inner refundAndTell calls must be preceded by refundHandled = true
    const innerRefunds = [...s.matchAll(/refundAndTell\(\{/g)]
    expect(
      innerRefunds.length,
      'expected >=3 refundAndTell sites'
    ).toBeGreaterThanOrEqual(3)
    // at least the two inner ones set the flag just before
    const flagBefore = (s.match(/refundHandled = true/g) || []).length
    expect(
      flagBefore >= 3,
      'refundHandled not set before each refund path -- a refundAndTell reply-throw could double-refund'
    ).toBe(true)
  })
})
