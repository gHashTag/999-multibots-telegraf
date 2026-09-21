import { describe, it, expect } from 'vitest'
import { txPaysInvoice } from './src/lib/star-tx-match'

/**
 * ONE PAYMENT BUYS ONE THING.
 *
 * A money trace on 2026-09-21, not refuted by three skeptics: the fallback
 * verify matched a pending token invoice to any Stars payment of the same
 * AMOUNT from the same person. getStarTransactions returns every sale of the
 * cashier bot, so a Golden Foundry club purchase of 3999 stars also paid a
 * token invoice priced at 3999 -- the person got the membership AND 3427
 * tokens for one payment.
 *
 * Ids are invented (9000000xx).
 */
const WHO = '900000501'
const INVOICE = {
  tokens: 3427,
  stars: 3999,
  createdAt: new Date('2026-09-21T10:00:00Z'),
}
const AFTER = Date.parse('2026-09-21T10:05:00Z') / 1000
const none = new Set<string>()

const tx = (over: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  amount: 3999,
  date: AFTER,
  source: {
    user: { id: Number(WHO) },
    invoice_payload: `tokens:3427:${WHO}`,
    ...(over.source as object),
  },
  ...over,
})

describe('which payment pays a token invoice', () => {
  it('matches the payment that paid this very invoice', () => {
    expect(txPaysInvoice(tx(), INVOICE, WHO, none)).toBe(true)
  })

  /*
   * THE EXPLOIT, VERBATIM: same payer, same amount, same window -- but it
   * paid for the club. Before the fix this returned true.
   */
  it('refuses a club payment of exactly the same amount', () => {
    const club = tx({
      source: { user: { id: Number(WHO) }, invoice_payload: 'foundry-master' },
    })
    expect(txPaysInvoice(club, INVOICE, WHO, none)).toBe(false)
  })

  it('refuses a token payment for a DIFFERENT number of tokens', () => {
    const other = tx({
      source: {
        user: { id: Number(WHO) },
        invoice_payload: `tokens:9999:${WHO}`,
      },
    })
    expect(txPaysInvoice(other, INVOICE, WHO, none)).toBe(false)
  })

  it('refuses a payment for somebody else, even with the right tokens', () => {
    const forOther = tx({
      source: {
        user: { id: Number(WHO) },
        invoice_payload: 'tokens:3427:900000777',
      },
    })
    expect(txPaysInvoice(forOther, INVOICE, WHO, none)).toBe(false)
  })

  /*
   * NO PAYLOAD, NO MATCH. This route is the fallback; the bot's own handler
   * is the primary credit. An unverifiable match costs nothing, a wrong one
   * costs real provider spend.
   */
  it('refuses a transaction that carries no payload at all', () => {
    const bare = tx({ source: { user: { id: Number(WHO) } } })
    expect(txPaysInvoice(bare, INVOICE, WHO, none)).toBe(false)
  })

  it('still refuses what it refused before: a used id, a subscription, a stale payment', () => {
    expect(txPaysInvoice(tx(), INVOICE, WHO, new Set(['tx-1']))).toBe(false)
    expect(
      txPaysInvoice(
        tx({
          source: {
            user: { id: Number(WHO) },
            invoice_payload: `tokens:3427:${WHO}`,
            subscription_period: 2592000,
          },
        }),
        INVOICE,
        WHO,
        none
      )
    ).toBe(false)
    const stale = tx({ date: Date.parse('2026-09-21T09:00:00Z') / 1000 })
    expect(txPaysInvoice(stale, INVOICE, WHO, none)).toBe(false)
  })
})
