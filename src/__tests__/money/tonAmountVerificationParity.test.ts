import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Two TON top-up scenes credit stars after finding the payment on chain, and
 * each uses its own finder:
 *
 *   tonPaymentScene       -> findPaymentByComment        (USDT jetton)
 *   tonNativePaymentScene -> findNativePaymentByComment  (native TON)
 *
 * The finders are twins. They reject on the same three grounds -- a
 * transaction older than sinceTimestamp, a comment that does not match, and an
 * amount below 99% of what the invoice says -- and differ only in which
 * transaction list they read and which unit converter they use.
 *
 * That parity is the whole safety property, and nothing enforced it. This loop
 * has repeatedly found pairs that drifted apart while looking identical, so
 * the two are pinned against each other here rather than each against a
 * hand-written expectation.
 *
 * The amount parameter was also OPTIONAL until now, which made the comparison
 * opt-in: a caller that omitted it got a transaction matched on the comment
 * alone and credited whatever the invoice claimed, whatever actually arrived.
 * Both callers pass it, so requiring it changed no behaviour -- it changed
 * omission from a silent skip into a compile error. The test keeps it required,
 * because a later edit could quietly restore the question mark.
 */

const ROOT = path.resolve(__dirname, '../../..')
const TON = 'src/core/ton/index.ts'
const source = fs.readFileSync(path.join(ROOT, TON), 'utf8')

/** The body of one exported function, up to the next top-level export. */
function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  if (start === -1) throw new Error(`${name} not found`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

const USDT = body('findPaymentByComment')
const NATIVE = body('findNativePaymentByComment')

describe('the two on-chain payment finders', () => {
  it('both exist and are not the same text', () => {
    // Control. If the extractor returned the same slice twice, or an empty
    // one, every comparison below would pass while comparing nothing.
    expect(USDT.length).toBeGreaterThan(200)
    expect(NATIVE.length).toBeGreaterThan(200)
    expect(USDT).not.toBe(NATIVE)
  })

  it('require the expected amount rather than accepting it optionally', () => {
    // The question mark is what made the on-chain check skippable.
    expect(USDT).toMatch(/expectedAmountUsdt: number/)
    expect(USDT).not.toMatch(/expectedAmountUsdt\?: number/)
    expect(NATIVE).toMatch(/expectedAmountTon: number/)
    expect(NATIVE).not.toMatch(/expectedAmountTon\?: number/)
  })

  it('reject on the same three grounds', () => {
    for (const [name, fn] of [
      ['usdt', USDT],
      ['native', NATIVE],
    ] as const) {
      // too old
      expect(fn, name).toMatch(
        /sinceTimestamp && tx\.timestamp < sinceTimestamp/
      )
      // wrong invoice
      expect(fn, name).toMatch(/tx\.comment !== expectedComment/)
      // short payment, with the same tolerance on both sides
      expect(fn, name).toMatch(/< expected\w+ \* 0\.99/)
    }
  })

  it('keeps the same tolerance in both', () => {
    const tolerance = (fn: string) => fn.match(/\* (0\.\d+)/)?.[1]
    expect(tolerance(USDT)).toBe(tolerance(NATIVE))
  })

  it('reaches the same number of rejections before accepting', () => {
    // Counted rather than named: a fourth rejection added to one finder and
    // not the other is exactly the drift this pins, and it would not be
    // caught by checking for the three known ones.
    const rejections = (fn: string) => (fn.match(/continue\b/g) ?? []).length
    expect(rejections(USDT)).toBe(rejections(NATIVE))
    expect(rejections(USDT)).toBeGreaterThanOrEqual(3)
  })
})
