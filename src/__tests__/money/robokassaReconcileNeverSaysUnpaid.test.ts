import { describe, it, expect } from 'vitest'

/*
 * The reconciliation tool answers "did this person actually pay" for the
 * invoices our own table still calls PENDING. Its expensive failure is not a
 * wrong answer, it is a CONFIDENT one: if a lookup that failed were scored as
 * "did not pay", the owner would be handed a short list and would conclude
 * nobody is owed anything. So the rule under test is that only the provider
 * saying money moved produces PAID, only the provider saying it did not
 * produces NOT_PAID, and everything else -- not found, bad signature, a
 * timeout, an HTML error page -- is UNKNOWN and stays visible.
 *
 * State codes quoted from https://docs.robokassa.ru/ru/xml-interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  classify,
  signature,
} = require('../../../scripts/robokassa-reconcile.cjs')

const body = (result: string, state?: string) =>
  `<?xml version="1.0"?><OperationStateResponse><Result><Code>${result}</Code></Result>` +
  (state === undefined ? '' : `<State><Code>${state}</Code></State>`) +
  `</OperationStateResponse>`

describe('robokassa reconcile: a failed lookup is never read as "did not pay"', () => {
  it('scores money that moved as PAID (100 settled, 50 crediting)', () => {
    expect(classify(body('0', '100')).verdict).toBe('PAID')
    expect(classify(body('0', '50')).verdict).toBe('PAID')
  })

  it('scores money that never moved as NOT_PAID (5 initialised, 10 cancelled)', () => {
    expect(classify(body('0', '5')).verdict).toBe('NOT_PAID')
    expect(classify(body('0', '10')).verdict).toBe('NOT_PAID')
  })

  it('does not decide a hold, a refund or a suspension on its own', () => {
    for (const s of ['20', '60', '80']) {
      expect(classify(body('0', s)).verdict).toBe('NEEDS_A_HUMAN')
    }
  })

  it('an operation Robokassa cannot find is UNKNOWN, not NOT_PAID', () => {
    // Result.Code=3. This is the one that would quietly shorten the owner's list.
    const v = classify(body('3'))
    expect(v.verdict).toBe('UNKNOWN')
    expect(v.verdict).not.toBe('NOT_PAID')
  })

  it('a bad signature or a dead service is UNKNOWN, not NOT_PAID', () => {
    expect(classify(body('1')).verdict).toBe('UNKNOWN')
    expect(classify(body('1000')).verdict).toBe('UNKNOWN')
  })

  it('a non-XML body is UNKNOWN, and so is an empty one', () => {
    expect(
      classify('<html><body>504 Gateway Timeout</body></html>').verdict
    ).toBe('UNKNOWN')
    expect(classify('').verdict).toBe('UNKNOWN')
    expect(classify(undefined as unknown as string).verdict).toBe('UNKNOWN')
  })

  it('an undocumented state is UNKNOWN rather than guessed either way', () => {
    const v = classify(body('0', '42'))
    expect(v.verdict).toBe('UNKNOWN')
    expect(v.why).toContain('42')
  })

  it('the signature is login:invId:password2 in that order', () => {
    // Robokassa states the formula as MerchantLogin:InvoiceID:Password#2.
    // A transposed pair still produces 32 valid-looking hex characters, so the
    // shape proves nothing and the order has to be pinned.
    const crypto = require('crypto')
    const expected = crypto
      .createHash('md5')
      .update('shop:77:secret', 'utf8')
      .digest('hex')
    expect(signature('shop', 77, 'secret')).toBe(expected)
    expect(signature('shop', 77, 'secret')).not.toBe(
      crypto.createHash('md5').update('77:shop:secret', 'utf8').digest('hex')
    )
  })
})
