/**
 * THE ROUBLE WATCH: IT ASKS THE PROVIDER, AND IT NEVER PAYS.
 *
 * Robokassa confirms by calling our ResultURL. When that call does not arrive
 * the row stays PENDING and nothing ever asks again -- for nine months it did
 * not, and five people were left holding nothing for 822 stars, found only
 * because a reconcile was run by hand (docs/audit/paid-and-never-credited.md).
 *
 * What is asserted here is the difference between the three answers a provider
 * can give and the one answer that must never be invented:
 *
 *   PAID      -> a journal line, and not one row written
 *   NOT_PAID  -> silence
 *   UNKNOWN   -> silence, counted, and NEVER read as "did not pay"
 *
 * plus the two refusals: an unreadable table and missing credentials are both
 * "I could not look", never "nobody is owed anything".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const askOpState = vi.fn()
const noteUnclaimedToHive = vi.fn()
const noteWatchQuietToHive = vi.fn()
const pendingRows = vi.fn()
const insert = vi.fn()
const update = vi.fn()

vi.mock('@/core/robokassa/opState', () => ({
  askOpState: (...a: unknown[]) => askOpState(...a),
}))

vi.mock('@/services/hiveNote', () => ({
  noteUnclaimedToHive: (...a: unknown[]) => noteUnclaimedToHive(...a),
  noteWatchQuietToHive: (...a: unknown[]) => noteWatchQuietToHive(...a),
}))

vi.mock('@/core/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.gte = () => chain
  chain.limit = async () => pendingRows()
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

const ROWS = [
  { inv_id: '210442081', stars: 43, payment_date: '2026-09-15T10:00:00.000Z' },
  { inv_id: '479591493', stars: 217, payment_date: '2026-09-16T10:00:00.000Z' },
]

async function watch() {
  const { robokassaUnclaimedWatch } = await import(
    '@/inngest_app/functions/money/robokassaUnclaimedWatch'
  )
  const fn = (
    robokassaUnclaimedWatch as unknown as {
      fn: (c: unknown) => Promise<unknown>
    }
  ).fn
  return fn({
    event: { data: {} },
    step: { run: (_name: string, body: () => unknown) => body() },
  }) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MERCHANT_LOGIN = 'a-shop'
  process.env.ROBOKASSA_PASSWORD_2 = 'a-password'
  pendingRows.mockResolvedValue({ data: ROWS, error: null })
  askOpState.mockResolvedValue({ verdict: 'NOT_PAID', state: 10 })
  noteUnclaimedToHive.mockResolvedValue('noted')
  noteWatchQuietToHive.mockResolvedValue('noted')
})

describe('the Robokassa watch', () => {
  it('says nothing when the provider says nobody paid', async () => {
    const r = await watch()

    expect(r.did).toBe('none unclaimed')
    expect(askOpState).toHaveBeenCalledTimes(2)
    expect(noteUnclaimedToHive).not.toHaveBeenCalled()
  })

  it('records what the provider says was paid, naming the channel', async () => {
    askOpState.mockResolvedValue({ verdict: 'PAID', state: 100 })

    const r = await watch()

    expect(r.did).toBe('unclaimed')
    expect(r.invoices).toBe(2)
    expect(r.stars).toBe(260)
    const [, found, opts] = noteUnclaimedToHive.mock.calls[0]
    expect(found).toEqual({ invoices: 2, stars: 260 })
    expect(
      (opts as { channel?: string }).channel,
      'the line does not say which channel -- the repairs differ'
    ).toBe('Robokassa')
  })

  /*
   * THE ANSWER THAT MUST NOT BECOME A "NO". Result.Code=3 -- the provider does
   * not remember the invoice -- is most of the backlog, and reading it as
   * unpaid would quietly tell the owner nobody is owed anything.
   */
  it('counts an unknown answer as unknown, not as unpaid', async () => {
    askOpState.mockResolvedValue({ verdict: 'UNKNOWN', why: 'Result.Code=3' })

    const r = await watch()

    expect(r.did).toBe('none unclaimed')
    expect(r.unknown).toBe(2)
    expect(noteUnclaimedToHive).not.toHaveBeenCalled()
  })

  it('credits nobody, whatever the provider says', async () => {
    askOpState.mockResolvedValue({ verdict: 'PAID', state: 100 })

    await watch()

    expect(insert, 'the watch wrote a payment row').not.toHaveBeenCalled()
    expect(update, 'the watch completed a payment row').not.toHaveBeenCalled()
  })

  it('reports an unreadable table as unreadable', async () => {
    pendingRows.mockResolvedValue({
      data: null,
      error: { message: 'no route to host' },
    })

    const r = await watch()

    expect(r.did).toBe('unreadable')
    expect(askOpState).not.toHaveBeenCalled()
  })

  /*
   * WITHOUT CREDENTIALS THERE IS NO ANSWER. `tri reconcile` printed this same
   * refusal for months and it read as "this cannot be done"; the run must say
   * which half is missing and say nothing at all about money.
   */
  it('refuses to guess when the merchant credentials are absent', async () => {
    delete process.env.MERCHANT_LOGIN
    delete process.env.ROBOKASSA_MERCHANT_LOGIN
    delete process.env.ROBOKASSA_PASSWORD_2

    const r = await watch()

    expect(r.did).toBe('cannot ask')
    expect(r.pending).toBe(2)
    expect(askOpState).not.toHaveBeenCalled()
    expect(noteUnclaimedToHive).not.toHaveBeenCalled()
  })

  it('does nothing when no recent invoice is pending', async () => {
    pendingRows.mockResolvedValue({ data: [], error: null })

    const r = await watch()

    expect(r.did).toBe('nothing pending')
    expect(askOpState).not.toHaveBeenCalled()
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
    expect((looked as { channel: string }).channel).toBe('Robokassa')
  })
})
