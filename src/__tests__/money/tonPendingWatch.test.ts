/**
 * THE WATCH LOOKS, AND MUST NEVER PAY.
 *
 * The TON channel completes a payment when the PAYER presses "check payment".
 * Nothing else ever looks at the chain, so coins can sit against a PENDING row
 * with no watcher -- the shape that cost five people 822 stars on the other
 * channel (docs/audit/paid-and-never-credited.md). This function is the hourly
 * version of that question.
 *
 * Two properties are worth more than the rest, and both are asserted by RUNNING
 * the handler:
 *
 *   it writes NOTHING to payments_v2 -- completing a payment moves money, and
 *   who is made whole is the owner's decision. A watcher that also acted would
 *   be taking that decision hourly, on data fetched from a third party;
 *
 *   a read that FAILED is not an empty channel. Returning "nothing found" on a
 *   broken database is the one mistake this family of tools keeps making.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findNativePaymentByComment = vi.fn()
const noteUnclaimedToHive = vi.fn()
const pendingRows = vi.fn()
const insert = vi.fn()
const update = vi.fn()

vi.mock('@/core/ton', () => ({
  findNativePaymentByComment: (...a: unknown[]) =>
    findNativePaymentByComment(...a),
}))

vi.mock('@/core/ton/config', () => ({
  getTonConfig: () => ({
    walletAddress: 'EQ-not-a-real-address',
    network: 'mainnet',
  }),
}))

vi.mock('@/services/hiveNote', () => ({
  noteUnclaimedToHive: (...a: unknown[]) => noteUnclaimedToHive(...a),
}))

/*
 * The table double records any attempt to WRITE, so "it credits nobody" is
 * checked rather than assumed: a select chain that also exposes insert/update
 * means a future edit that starts writing fails here instead of in production.
 */
vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.in = async () => pendingRows()
  chain.insert = (...a: unknown[]) => {
    insert(...a)
    return chain
  }
  chain.update = (...a: unknown[]) => {
    update(...a)
    return chain
  }
  return { supabase: { from: () => chain } }
})

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

const INVOICE = {
  inv_id: 'TONN-1789017520884-Q1JHHH',
  amount: 1,
  stars: 260,
  payment_date: '2026-09-10T10:00:00.000Z',
}

/** Run the cron's handler with a step that simply runs its body. */
async function watch() {
  const { tonPendingWatch } = await import(
    '@/inngest_app/functions/money/tonPendingWatch'
  )
  const fn = (
    tonPendingWatch as unknown as { fn: (c: unknown) => Promise<unknown> }
  ).fn
  return fn({
    event: { data: {} },
    step: { run: (_name: string, body: () => unknown) => body() },
  }) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  vi.clearAllMocks()
  pendingRows.mockResolvedValue({ data: [INVOICE], error: null })
  findNativePaymentByComment.mockResolvedValue(null)
  noteUnclaimedToHive.mockResolvedValue('noted')
})

describe('the TON watch', () => {
  it('says nothing when nothing arrived', async () => {
    const r = await watch()

    expect(r.did).toBe('none unclaimed')
    expect(
      noteUnclaimedToHive,
      'it cried wolf over an unpaid invoice'
    ).not.toHaveBeenCalled()
  })

  it('records the money that arrived and was never credited', async () => {
    findNativePaymentByComment.mockResolvedValue({ hash: 'abc', amount: 1e9 })

    const r = await watch()

    expect(r.did).toBe('unclaimed')
    expect(r.invoices).toBe(1)
    expect(r.stars).toBe(260)
    expect(noteUnclaimedToHive).toHaveBeenCalledTimes(1)
    const [, found] = noteUnclaimedToHive.mock.calls[0]
    expect(found).toEqual({ invoices: 1, stars: 260 })
  })

  /*
   * THE LINE THAT MUST NOT MOVE. Not one row is written, in either outcome.
   */
  it('credits nobody, whatever it finds', async () => {
    await watch()
    findNativePaymentByComment.mockResolvedValue({ hash: 'abc', amount: 1e9 })
    await watch()

    expect(insert, 'the watch wrote a payment row').not.toHaveBeenCalled()
    expect(update, 'the watch completed a payment row').not.toHaveBeenCalled()
  })

  /*
   * A BROKEN READ IS NOT A HEALTHY CHANNEL. This is the difference between
   * "nobody is owed anything" and "I could not look", and they must never
   * share an answer.
   */
  it('reports an unreadable table as unreadable', async () => {
    pendingRows.mockResolvedValue({
      data: null,
      error: { message: 'no route to host' },
    })

    const r = await watch()

    expect(r.did).toBe('unreadable')
    expect(noteUnclaimedToHive).not.toHaveBeenCalled()
  })

  it('asks the chain once per invoice, with the arguments the scene uses', async () => {
    await watch()

    expect(findNativePaymentByComment).toHaveBeenCalledTimes(1)
    const [address, comment, amount, since] =
      findNativePaymentByComment.mock.calls[0]
    expect(address).toBeTruthy()
    expect(comment).toBe(INVOICE.inv_id)
    expect(amount).toBe(INVOICE.amount)
    expect(since).toBe(Date.parse(INVOICE.payment_date))
  })

  it('does nothing at all when there is nothing pending', async () => {
    pendingRows.mockResolvedValue({ data: [], error: null })

    const r = await watch()

    expect(r.did).toBe('nothing pending')
    expect(findNativePaymentByComment).not.toHaveBeenCalled()
  })
})
