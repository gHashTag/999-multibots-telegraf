/**
 * THE AUTHOR'S SHARE IS SOMEBODY ELSE'S MONEY, AND A FAILED PAYOUT IS SILENT.
 *
 * `purchaseItem` charges the buyer, then credits 95% to the author, then hands
 * over the content. `updateUserBalance` answers `false` -- it never throws -- on
 * a schema failure, a refused insert, or an author with no `users` row. So a
 * discarded result means the buyer paid, the buyer got the goods, and the author
 * was never paid, with nothing anywhere saying so.
 *
 * The sale is NOT rolled back on that failure: the buyer already has the
 * content, and taking the sale back would punish the one person who did
 * everything right. What the code owes instead is a line loud enough to
 * reconcile by hand.
 *
 * WHY THIS TEST WAS REWRITTEN. It used to read marketplaceService.ts as TEXT:
 * find the description template, look 300 characters back for `const
 * authorCredited = await updateUserBalance`, then forward for `if
 * (!authorCredited)` near a `logger.error`. Three spellings pinned at once --
 * rename the variable, move the credit into a helper, or reorder the block, and
 * it fails with the behaviour untouched; log at the wrong level with the wrong
 * facts and it passes.
 *
 * Now a sale is RUN with the author credit refused, and what is asserted is what
 * happened: the buyer keeps the content, the author's share is 95% of the price,
 * and the failure is reported with the author, the item and the amount in it --
 * everything a person needs to pay it by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

const updateUserBalance = vi.fn()
const error = vi.fn()

/** The one item on sale; `getItem` reads it through this chain. */
const ITEM = {
  id: 'item-1',
  title: 'a preset pack',
  content: 'https://example.test/pack.zip',
  price_stars: 101,
  author_id: '900000112',
}

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
}))

vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = async () => ({ data: ITEM, error: null })
  chain.insert = async () => ({ data: null, error: null })
  return { supabase: { from: () => chain } }
})

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: (...a: unknown[]) => error(...a),
  },
}))

const BUYER = '900000111'

/** Each sale uses its own buyer: the in-flight guard is keyed by buyer:item. */
let sales = 0
async function buy() {
  const { purchaseItem } = await import('@/services/marketplaceService')
  return purchaseItem(`${BUYER}${++sales}`, ITEM.id, 'test_bot')
}

const charge = () =>
  updateUserBalance.mock.calls.find(c => c[2] === PaymentType.MONEY_OUTCOME)
const payout = () =>
  updateUserBalance.mock.calls.find(c => c[2] === PaymentType.MONEY_INCOME)

beforeEach(() => {
  vi.clearAllMocks()
  updateUserBalance.mockResolvedValue(true)
})

describe('a marketplace sale pays the author or says it did not', () => {
  it('charges the buyer the price and pays the author 95% of it', async () => {
    const r = await buy()

    expect(r.success).toBe(true)
    expect(charge()?.[1]).toBe(ITEM.price_stars)
    expect(payout()?.[0], 'paid somebody other than the author').toBe(
      ITEM.author_id
    )
    // 95% of 101 is 95.95; the house does not round the author up.
    expect(payout()?.[1]).toBe(Math.floor(ITEM.price_stars * 0.95))
  })

  /*
   * THE FAILURE THIS GUARD EXISTS FOR. `false`, not a throw, so nothing above
   * notices unless the result is read.
   */
  it('reports the unpaid author with everything needed to pay by hand', async () => {
    updateUserBalance.mockImplementation(async (...a: unknown[]) =>
      a[2] === PaymentType.MONEY_INCOME ? false : true
    )

    await buy()

    expect(
      error,
      'an author went unpaid and nothing said so'
    ).toHaveBeenCalled()
    const facts = error.mock.calls.map(c => JSON.stringify(c[1])).join('\n')
    expect(facts, 'the report does not name the author').toContain(
      ITEM.author_id
    )
    expect(facts, 'the report does not name the item').toContain(ITEM.id)
    expect(facts, 'the report does not name the amount owed').toContain(
      String(Math.floor(ITEM.price_stars * 0.95))
    )
  })

  /*
   * AND THE BUYER IS NOT PUNISHED FOR IT. They paid and they get the content;
   * rolling the sale back here would take it from the one person who did
   * everything right.
   */
  it('still delivers to the buyer when the author could not be paid', async () => {
    updateUserBalance.mockImplementation(async (...a: unknown[]) =>
      a[2] === PaymentType.MONEY_INCOME ? false : true
    )

    const r = await buy()

    expect(r.success).toBe(true)
    expect(r.content).toBe(ITEM.content)
  })

  /*
   * THE LINE THAT MUST NOT MOVE. A buyer who could not be charged buys
   * nothing -- and above all, nobody is paid out of the house's pocket.
   */
  it('pays nobody when the buyer could not be charged', async () => {
    updateUserBalance.mockImplementation(async (...a: unknown[]) =>
      a[2] === PaymentType.MONEY_OUTCOME ? false : true
    )

    const r = await buy()

    expect(r.success).toBe(false)
    expect(r.content).toBeUndefined()
    expect(
      payout(),
      'the author was paid for a sale that never happened'
    ).toBeFalsy()
  })

  /*
   * The other direction: an ordinary sale must not shout. A test that only
   * watches the noisy case passes just as well against code that alerts on
   * every purchase.
   */
  it('says nothing alarming when the author is paid', async () => {
    await buy()
    expect(error).not.toHaveBeenCalled()
  })
})
