import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE POPULATION OF MONEY MOVEMENT, COMPUTED RATHER THAN LISTED.
 *
 * Four times now a money ratchet has been found reporting a clean repository
 * about a half it could not see, each time because its matcher knew one
 * spelling of a thing rather than the thing:
 *
 *   return '<url>'           vs  return { video_url: '<url>' }
 *   await charge()           vs  const ok = await charge()
 *   PaymentType.MONEY_INCOME vs  PaymentType.REFUND
 *   refund named in prose    vs  refund named in the type field
 *
 * All four were found by accident. This test asks the question on purpose, at
 * the one place where the answer is load-bearing: WHO CAN MOVE MONEY.
 *
 * Balance is not a column -- `get_user_balance` derives it by summing the
 * payments table -- so moving money means writing a row there. The ratchets in
 * this directory spell that population as four function names. Measured, ten
 * files write the table and four of them never mention any of those names.
 *
 * What this pins is the SET, not a count: when an eleventh writer appears, this
 * fails and whoever added it has to say which of the two lists it belongs to.
 * That is the whole point -- a new way to move money should not be able to
 * arrive silently, which is precisely how the four misses above arrived.
 *
 * This test deliberately does NOT assert that the four-name vocabulary is
 * wrong. Several of those ratchets are narrow on purpose. It asserts only that
 * the gap between the vocabulary and the population stays known.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const writers = require('../../../scripts/lib/money-writers.cjs')

/**
 * Every file that writes the payments table, and what it is.
 *
 * Liveness matters here and a text census cannot see it: `groupMemberHandler`
 * writes a row with stars: 0, which grants access without moving a balance,
 * and `payments.ts` moves a balance without touching an amount -- it flips a
 * row's status, and the balance is a filtered sum. Neither reads as money to a
 * matcher looking for an amount.
 */
const REGISTRY: Record<string, string> = {
  'src/api_server/routes/robokassa.routes.ts':
    'payment callback, direct insert of the credited row',
  'src/commands/adminSubscriptionCommand.ts':
    'admin override, direct update; both entry points refuse unless ADMIN_IDS_ARRAY includes the caller',
  'src/core/supabase/createSuccessfulPayment.ts':
    'named writer, NOT in the four-name vocabulary; validates against CreatePaymentV2Schema before inserting',
  'src/core/supabase/claimPendingInvoice.ts':
    'compare-and-set on PENDING with an amount check, added 2026-09-17 (#2508) so the Inngest credit path claims a row the way the Robokassa route already did; moves money without naming an amount, like payments.ts',
  'src/core/supabase/directPayment.ts':
    'defines directPaymentProcessor; read-check-insert, non-atomic (#999)',
  'src/core/supabase/payments.ts':
    'updatePaymentStatus flips PENDING -> COMPLETED; the balance is a filtered sum, so this moves money without touching an amount',
  'src/core/supabase/setPayments.ts': 'defines setPayments',
  'src/core/supabase/updateUserBalance.ts':
    'defines updateUserBalance, the primary primitive',
  'src/handlers/groupMemberHandler.ts':
    'grants NEUROTESTER access with stars: 0 -- a payments row that is not a balance move',
  'src/scenes/tonNativePaymentScene/index.ts':
    'TON top-up, direct insert of the pending row',
  'src/scenes/tonPaymentScene/index.ts':
    'TON top-up, direct insert of the pending row',
}

/** The writers whose source never names a primitive from the vocabulary. */
const BLIND_TO_THE_VOCABULARY = [
  'src/commands/adminSubscriptionCommand.ts',
  'src/core/supabase/createSuccessfulPayment.ts',
  'src/core/supabase/payments.ts',
  'src/handlers/groupMemberHandler.ts',
]

const namesAPrimitive = (src: string) =>
  new RegExp(
    `(?<![A-Za-z0-9_])(${writers.PRIMITIVE_NAMES.join('|')})(?![A-Za-z0-9_])`
  ).test(src)

describe('the vocabulary of money movement', () => {
  it('detects a write by its own samples, in both directions', () => {
    // The control exercises the exported function the registry is built from,
    // not a copy of it: a control over a replica proves nothing about the
    // original once the two drift.
    expect(() => writers.selfCheck()).not.toThrow()
    for (const s of writers.SAMPLES)
      expect(writers.writesPayments(s.code), s.code).toBe(s.writes)
  })

  it('lists every file that writes the payments table', () => {
    // A set, not a count. An eleventh writer fails here and forces a decision
    // about whether the money ratchets need to learn its spelling.
    expect(writers.writerFiles(ROOT)).toEqual(Object.keys(REGISTRY).sort())
  })

  it('keeps the gap between the vocabulary and the population known', () => {
    const blind = writers
      .writerFiles(ROOT)
      .filter((f: string) => !namesAPrimitive(read(f)))
    expect(blind).toEqual(BLIND_TO_THE_VOCABULARY)
  })

  it('walks to the end of a chain rather than over a budget', () => {
    // A walker that loses the end of a statement swallows the next one, and
    // then every file looks like a writer. The real chains are short; a jump
    // in this number means the walker broke, not that the code changed.
    const longest = Math.max(
      ...Object.keys(REGISTRY).map((f: string) => writers.longestChain(read(f)))
    )
    expect(longest).toBeLessThan(1000)
  })
})
