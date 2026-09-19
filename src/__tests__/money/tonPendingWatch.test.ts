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
const noteWatchQuietToHive = vi.fn()
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
  noteWatchQuietToHive: (...a: unknown[]) => noteWatchQuietToHive(...a),
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

const paged = vi.fn()

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    // `utils/logger.ts` routes this level, and only this level, to the owner's
    // phone -- so "did it page?" is answered by which method was called.
    error: (...a: unknown[]) => paged(...a),
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
  // The chain alarm is rate-limited by a module variable; a fresh registry per
  // test keeps one test's outage out of the next one's window.
  vi.resetModules()
  pendingRows.mockResolvedValue({ data: [INVOICE], error: null })
  findNativePaymentByComment.mockResolvedValue(null)
  noteUnclaimedToHive.mockResolvedValue('noted')
  noteWatchQuietToHive.mockResolvedValue('noted')
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
    expect(since).toBe(Math.floor(Date.parse(INVOICE.payment_date) / 1000))
  })

  /*
   * THE UNIT THAT MADE THIS WATCH A DECORATION.
   *
   * The floor is compared against `tx.utime` -- a UNIX timestamp in SECONDS.
   * Handing it `Date.parse()` in MILLISECONDS puts the cutoff about fifty
   * thousand years into the future, so `tx.timestamp < sinceTimestamp` is true
   * for every transfer TON will ever carry and the matcher skips all of them.
   * The watch would have reported "none unclaimed" for the rest of its life,
   * hourly, and the earlier version of this test asserted the broken value --
   * which is how a dead safety net passes its own suite.
   */
  it('hands the matcher a floor the chain could actually meet', async () => {
    await watch()

    const since = findNativePaymentByComment.mock.calls[0][3] as number
    const plausibleTonTimestamp = 1_900_000_000 // seconds, some years out

    expect(
      since,
      'the floor is in milliseconds; no on-chain transfer can ever clear it'
    ).toBeLessThan(plausibleTonTimestamp)
    expect(since).toBeGreaterThan(1_600_000_000)
  })

  /*
   * THE WATCH'S OWN BLIND SPOT, NAMED RATHER THAN HIDDEN.
   *
   * `findNativePaymentByComment` looks at native TON transfers; a USDT top-up
   * is a JETTON transfer to a different wallet. Running the native matcher
   * over a TON_USDT row answers "never arrived" about money it never looked
   * for -- exactly the failure this watch exists to prevent, pointed at
   * itself. The first version did precisely that for every USDT row.
   */
  it('does not judge a USDT invoice with the native matcher', async () => {
    pendingRows.mockResolvedValue({
      data: [
        { ...INVOICE, payment_method: 'TON_NATIVE' },
        {
          inv_id: 'TONU-1',
          amount: 5,
          stars: 300,
          payment_date: INVOICE.payment_date,
          payment_method: 'TON_USDT',
        },
      ],
      error: null,
    })

    const r = await watch()

    expect(
      findNativePaymentByComment,
      'the native matcher was pointed at a jetton transfer'
    ).toHaveBeenCalledTimes(1)
    expect(findNativePaymentByComment.mock.calls[0][1]).toBe(INVOICE.inv_id)
    expect(r.notChecked, 'the run hid what it could not judge').toBe(1)
  })

  /*
   * A CHAIN THAT REFUSED TO ANSWER IS NOT A CHANNEL WITH NOTHING ON IT.
   *
   * This is the same rule as the unreadable-table test above, applied to the
   * read the function actually depends on. `getNativeTransactions` used to
   * turn a rate limit, a timeout and `lt not in db` into `return []`, which
   * arrived here as the fact "no transfer matched" -- so the run wrote a quiet
   * heartbeat saying it had examined N invoices and found the channel clean,
   * having looked at nothing at all. A watch that reports health on a failed
   * read is worse than no watch: it is a green light nobody earned.
   */
  it('reports an unreadable chain as unreadable, and stays quiet in the journal', async () => {
    const { TonChainUnreadable } = await import('@/core/ton/chainRead')
    findNativePaymentByComment.mockRejectedValue(
      new TonChainUnreadable('HTTP 429 from the TON API')
    )

    const r = await watch()

    expect(r.did).toBe('chain unreadable')
    expect(
      noteWatchQuietToHive,
      'a failed read was written into the journal as a clean channel'
    ).not.toHaveBeenCalled()
    expect(noteUnclaimedToHive).not.toHaveBeenCalled()
    expect(paged.mock.calls.join('\n')).toContain('cannot read the chain')
  })

  /*
   * The class is exported from `@/core/ton/chainRead`, not `@/core/ton`, and
   * that is load-bearing: this file mocks `@/core/ton` wholesale, so an error
   * type living there would be `undefined` at the check -- and the branch
   * above would be skipped in exactly the situation it exists for.
   */
  it('recognises the refusal even though @/core/ton is mocked away', async () => {
    const { TonChainUnreadable, chainWasUnreadable } = await import(
      '@/core/ton/chainRead'
    )

    expect(chainWasUnreadable(new TonChainUnreadable('no answer in 15s'))).toBe(
      true
    )
    expect(chainWasUnreadable(new Error('no answer in 15s'))).toBe(false)
  })

  it('does not page once an hour for the same outage', async () => {
    const { TonChainUnreadable } = await import('@/core/ton/chainRead')
    findNativePaymentByComment.mockRejectedValue(
      new TonChainUnreadable('HTTP 429 from the TON API')
    )

    const first = await watch()
    paged.mockClear()
    const second = await watch()

    expect(first.paged).toBe(true)
    expect(second.paged, 'the next hourly run rang the phone again').toBe(false)
    expect(second.did).toBe('chain unreadable')
    expect(
      paged,
      'the throttle let a second alert through'
    ).not.toHaveBeenCalled()
  })

  /*
   * The demotion must not swallow a defect of OURS on the same path. Anything
   * that is not "the chain refused" still fails the run, and Inngest's
   * onFailure handler pages for it.
   */
  it('STILL fails loudly when the matcher breaks for any other reason', async () => {
    findNativePaymentByComment.mockRejectedValue(
      new TypeError('tx.in_msg is undefined')
    )

    await expect(watch()).rejects.toThrow('tx.in_msg is undefined')
  })

  it('stops asking after the first refusal', async () => {
    const { TonChainUnreadable } = await import('@/core/ton/chainRead')
    pendingRows.mockResolvedValue({
      data: [INVOICE, { ...INVOICE, inv_id: 'TONN-2' }],
      error: null,
    })
    findNativePaymentByComment.mockRejectedValue(
      new TonChainUnreadable('HTTP 429 from the TON API')
    )

    await watch()

    expect(
      findNativePaymentByComment,
      'it kept hammering an API that had just rate-limited it'
    ).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all when there is nothing pending', async () => {
    pendingRows.mockResolvedValue({ data: [], error: null })

    const r = await watch()

    expect(r.did).toBe('nothing pending')
    expect(findNativePaymentByComment).not.toHaveBeenCalled()
  })
  /*
   * THE HEARTBEAT. A watch that speaks only when money is owed is
   * indistinguishable from a watch that has stopped -- the flaw this function
   * shipped with, one day after the journal learned the same lesson about the
   * seller's sweep. The rate limit lives in the note writer, not here.
   */
  it('says it looked, even when there was nothing to report', async () => {
    await watch()

    expect(
      noteWatchQuietToHive,
      'a quiet run left no trace, so a dead watch looks the same'
    ).toHaveBeenCalledTimes(1)
    const [, looked] = noteWatchQuietToHive.mock.calls[0]
    expect((looked as { channel: string }).channel).toBe('TON')
  })
})
