/**
 * activatePromoSubscription grants 476/1303 bonus stars via directPaymentProcessor.
 * The DB backstop against a duplicate grant is CONSTRAINT payments_v2_inv_id_key
 * UNIQUE(inv_id) (scripts/migrate-schema.sql). But the inv_id embedded Date.now(),
 * so two grants produced two DIFFERENT inv_ids and the constraint could NEVER
 * reject a duplicate. The only other guard, hasReceivedPromo, runs OUTSIDE the
 * per-user balance lock, so a concurrent double-/start (or Telegram update
 * redelivery) both passed the read-check and — with distinct Date.now() keys —
 * both credited: a 476–1303 star mint (#1279).
 *
 * Fix: a DETERMINISTIC key `promo-bonus-${promoType}-${telegram_id}` — the same
 * (user, promoType) dimension hasReceivedPromo dedupes by. The balance lock
 * serializes the two inserts; the second hits 23505 and is caught, so no double
 * credit. Mirrors the referral oracle's deterministic referralInvoiceId.
 *
 * Source seam (comments stripped so this comment's Date.now() does not match):
 * the promo-bonus inv_id must be deterministic (telegram_id, no Date.now()).
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
      path.join(__dirname, '..', '..', 'helpers', 'promoHelper.ts'),
      'utf8'
    )
  )

describe('promo bonus grant is idempotent (no star mint on concurrent /start)', () => {
  it('uses a deterministic inv_id (no Date.now, keyed by telegram_id)', () => {
    const s = code()
    const m = s.match(/inv_id:\s*`promo-bonus-[^`]*`/)
    expect(m, 'promo-bonus inv_id not found').toBeTruthy()
    const key = (m as RegExpMatchArray)[0]
    expect(
      /Date\.now\(\)/.test(key),
      'promo inv_id embeds Date.now() -- UNIQUE(inv_id) can never reject a duplicate grant (star mint)'
    ).toBe(false)
    expect(
      /\$\{telegram_id\}/.test(key),
      'promo inv_id is not keyed by telegram_id -- not per-user deterministic'
    ).toBe(true)
  })
})
