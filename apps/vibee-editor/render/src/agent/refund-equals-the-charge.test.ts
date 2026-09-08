import { describe, it, expect } from 'vitest'
import { refundByTid } from './billing-shared'

/*
 * THE REFUND USED TO RE-DERIVE WHAT THE CHARGE HAD ALREADY MEASURED.
 *
 * spendByTid computes a price, takes it, and returns the number it took.
 * refundByTid computed a price a second time, from the same table at a later
 * moment, and gave that back. The note above it records the instance that
 * escaped: omnihuman-1-5 at ten seconds, charged 540, refunded 60, because
 * one side priced by model and the other by kind. Passing modelId closed that
 * instance; two numbers computed twice is the class.
 *
 * It also returned void on three different outcomes -- refunded, silently did
 * nothing for want of a price, and threw -- so an awaiting caller could not
 * tell a refund that happened from one that never did.
 */
const pool = (onAmount?: (n: number) => void, fail?: boolean) => ({
  query: async (_sql: string, params: unknown[]) => {
    if (fail) throw new Error('connection terminated')
    onAmount?.(Number((params as unknown[])[1]))
    return { rows: [{ balance: 0 }] }
  },
})

describe('a refund gives back what the charge took', () => {
  it('uses the amount the charge reported, not the price table', async () => {
    let given = 0
    /*
     * 7 on purpose. The first version of this test used 540, which is also
     * what the table produces for this op and model -- so a mutant that
     * ignored the receipt entirely and re-derived the price still passed. A
     * receipt has to be a number the fallback cannot reach, or the assertion
     * is about arithmetic that agrees by accident.
     */
    const r = await refundByTid(
      pool(n => (given = n)) as never,
      '999',
      'lipsync_generate',
      10,
      'kie/omnihuman-1-5',
      7
    )
    expect(r).toEqual({ ok: true, refunded: 7 })
    expect(given).toBe(7)
  })

  it('never writes a negative amount, whatever the receipt says', async () => {
    /*
     * A negative receipt would turn 'balance + amount' into a second charge.
     * The guard is 'exact > 0', not 'typeof exact === number', and the
     * difference between those two only shows on a negative value.
     */
    let given = 0
    const r = await refundByTid(
      pool(n => (given = n)) as never,
      '999',
      'image_generate',
      1,
      undefined,
      -5
    )
    expect(r.ok).toBe(true)
    expect(given).toBeGreaterThan(0)
  })

  it('falls back to the table only when no receipt is given', async () => {
    let given = 0
    const r = await refundByTid(
      pool(n => (given = n)) as never,
      '999',
      'image_generate',
      1,
      undefined
    )
    expect(r.ok).toBe(true)
    expect(given).toBeGreaterThan(0)
  })

  it('says so instead of silently refunding nothing when it has neither', async () => {
    let called = false
    const r = await refundByTid(
      pool(() => (called = true)) as never,
      '999',
      'no_such_op_at_all',
      1,
      undefined
    )
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
    if (!r.ok) expect(r.why).toContain('no_such_op_at_all')
  })

  it('reports a failed write instead of swallowing it, and keeps the amount', async () => {
    const r = await refundByTid(
      pool(undefined, true) as never,
      '999',
      'lipsync_generate',
      10,
      'kie/omnihuman-1-5',
      540
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.wanted).toBe(540)
      expect(r.why).toContain('connection terminated')
    }
  })

  it('a zero or negative receipt is not trusted, the table is used instead', async () => {
    // A receipt of 0 is what an exempt charge returns; it must not be read as
    // "refund nothing", nor as a reason to skip the fallback.
    let given = 0
    const r = await refundByTid(
      pool(n => (given = n)) as never,
      '999',
      'image_generate',
      1,
      undefined,
      0
    )
    expect(r.ok).toBe(true)
    expect(given).toBeGreaterThan(0)
  })
})
