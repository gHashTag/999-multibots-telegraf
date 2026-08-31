import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// handleSuccessfulPayment credits the user for a Telegram Stars payment via
// setPayments. Telegram delivers updates AT-LEAST-ONCE, so a re-delivered
// successful_payment must NOT credit twice. The dedup is the UNIQUE(inv_id)
// constraint on payments_v2 -- which only works if InvId is DETERMINISTIC for a
// given payment. Every InvId here is derived from the invoice `payload` (which
// itself carries a unique <ts>/<uuid> per invoice). If a branch ever used a
// fresh Date.now()/uuid for InvId, a Telegram retry would mint free stars (the
// promo path had exactly this bug -- see promoBonusIdempotent). This pins it.
const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'handlers', 'paymentHandlers', 'index.ts'),
  'utf8'
)

// Only the InvId: lines inside setPayments calls (strip block/line comments).
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /(^|[^:])\/\/.*$/gm,
  '$1'
)
const invIdLines = code
  .split('\n')
  .map(l => l.trim())
  .filter(l => /^InvId:/.test(l))

describe('handleSuccessfulPayment InvIds are deterministic (idempotent on Telegram retry)', () => {
  it('finds the InvId assignments (a broken matcher fails, not passes)', () => {
    expect(invIdLines.length).toBeGreaterThan(3)
  })

  it('every InvId is derived from the invoice payload, not a fresh id', () => {
    const bad = invIdLines.filter(
      l =>
        !/payload/.test(l) ||
        /Date\.now|Math\.random|randomUUID|uuidv4|uuid\(/.test(l)
    )
    expect(
      bad,
      'these InvIds are not payload-derived (or use a fresh id) -> a Telegram ' +
        'at-least-once retry of successful_payment would not dedup on ' +
        'UNIQUE(inv_id) and would credit the user twice (free stars)'
    ).toEqual([])
  })
})
