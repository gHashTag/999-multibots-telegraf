import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * TWO NETS CATCH A STARS PAYMENT, AND THEY COULD FAIL TOGETHER IN SILENCE.
 *
 * The webhook credits a payment directly. The pending row in token_invoices
 * is the second net: the verify route finds the payment later by matching the
 * person's own star transactions, webhook-independently.
 *
 * That row is written best-effort and the invoice link is returned either
 * way -- which is the right call, because refusing to sell over a bookkeeping
 * row would block payments the webhook handles perfectly well. What was wrong
 * is that the failure went to console.warn: the moment the fallback matters
 * is exactly the moment the webhook did not fire, and nobody reads that log.
 *
 * Both halves are pinned, because either one alone is the wrong behaviour:
 * the failure must be journalled, AND the link must still be handed out.
 */
/*
 * The minting moved out of render-server.ts into token-invoice.ts on
 * 2026-09-08, so that the mini app's cashier and the personal seller issue the
 * same link from the same price and the same payload. The properties pinned
 * here did not move; the file they live in did, and the check follows it.
 * A grep left pointing at the old file would have passed on an empty route.
 */
const SRC = fs.readFileSync(path.join(__dirname, 'token-invoice.ts'), 'utf8')

/** The invoice-creation handler, from its INSERT to the response. */
function invoiceBlock(): string {
  const at = SRC.indexOf('INSERT INTO token_invoices')
  expect(at, 'the pending-invoice insert must still exist').toBeGreaterThan(-1)
  return SRC.slice(at, at + 2600)
}

describe('an invoice we cannot reconcile is visible, and still sold', () => {
  it('journals the failure where money events needing a human already go', () => {
    const block = invoiceBlock()
    const rec = block.indexOf('record(')
    expect(
      rec,
      'the catch must journal, not only console.warn'
    ).toBeGreaterThan(-1)
    expect(block.slice(rec, rec + 400)).toContain("severity: 'attention'")
  })

  it('names the person and the amount, so it can be made good by hand', () => {
    const block = invoiceBlock()
    const rec = block.slice(
      block.indexOf('record('),
      block.indexOf('record(') + 400
    )
    expect(rec).toContain('who:')
    expect(rec).toContain('amount:')
  })

  it('still returns the payment link — the row is not a condition of selling', () => {
    const block = invoiceBlock()
    // The response comes AFTER the catch: a failed row must not become a
    // refusal to sell, which would block payments the webhook handles.
    const catchAt = block.indexOf('} catch (e) {')
    // The sale itself: the helper hands the link back to whichever caller
    // asked -- the cashier answers `ok: true, link` from it, the seller puts
    // it into the message.
    const link = block.indexOf('return { url, payload')
    expect(catchAt).toBeGreaterThan(-1)
    expect(link, 'the link response must still be reachable').toBeGreaterThan(
      catchAt
    )
    /*
     * Position is not reachability. The first version of this assertion
     * checked only that the response came LATER in the file, and a mutant that
     * inserted a bare return just above it passed: the text was still there,
     * and no longer reached. Nothing may cut the handler short between the
     * failed row and the sale.
     */
    const between = block.slice(catchAt, link)
    expect(between, 'something returns before the link is sent').not.toMatch(
      /\n\s*return\b/
    )
    expect(between, 'something throws before the link is sent').not.toMatch(
      /\n\s*throw\b/
    )
  })
})
