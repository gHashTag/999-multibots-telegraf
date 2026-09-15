import { describe, it, expect, afterAll, vi } from 'vitest'
import {
  subscriptionLead,
  ownersOfLead,
  recordSubscriptionChange,
  SUBSCRIPTION_NOTES,
} from './src/agent/crm-subscription'
import { composePitch } from './src/agent/crm-offer-tool'
import {
  hasOpenSubscription,
  mintTokenInvoice,
  forgetInvoiceColumnsForTests,
} from './src/agent/token-invoice'

/**
 * BotSubscriptionUpdated carries three fields and no more: the user, the
 * invoice payload, and one of "canceled" / "active" / "failed". There is no
 * invoice id and no chat, so the payload is the ONLY thread back to a person.
 * These cases pin that thread, and pin what is written when it leads nowhere.
 */

/** A pool that answers the owner lookup and records what was inserted. */
function fakePool(owners: string[]) {
  const inserts: Array<{ sql: string; params: unknown[] }> = []
  return {
    inserts,
    query: async (sql: string, params: unknown[] = []) => {
      if (/SELECT DISTINCT owner_id/.test(sql)) {
        return { rows: owners.map(owner_id => ({ owner_id })) }
      }
      if (/INSERT INTO crm_touches/.test(sql)) inserts.push({ sql, params })
      return { rows: [] }
    },
  } as never
}

describe('which person a subscription belongs to', () => {
  it('reads the id out of the payload the till minted', () => {
    expect(subscriptionLead('subtokens:150:900000001')).toEqual({
      tokens: 150,
      lead: '900000001',
    })
  })

  it('refuses a one-off payload instead of blaming the right person wrongly', () => {
    // A `tokens:` invoice has no subscription to cancel. Seeing one here means
    // something upstream is wrong, and that should be visible.
    expect(subscriptionLead('tokens:150:900000001')).toBeNull()
  })

  it('refuses anything that is not ours', () => {
    expect(subscriptionLead('foundry-bronze_12499_1757000000')).toBeNull()
    expect(subscriptionLead('subtokens:0:900000001')).toBeNull()
    expect(subscriptionLead('subtokens:150:not-an-id')).toBeNull()
    expect(subscriptionLead(undefined)).toBeNull()
  })
})

describe('whose CRM the person is in', () => {
  it('asks the conversation, because nothing else stores the pair', async () => {
    const pool = fakePool(['144022504'])
    expect(await ownersOfLead(pool, '900000001')).toEqual(['144022504'])
  })

  it('returns an empty list rather than throwing when the database is down', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    } as never
    expect(await ownersOfLead(broken, '900000001')).toEqual([])
  })
})

describe('what is written when a subscription changes', () => {
  const change = (state: string) => ({
    payload: 'subtokens:150:900000001',
    state,
    botName: 'seller_bot',
  })

  it('writes a note against the owner who knows this person', async () => {
    const pool = fakePool(['144022504'])
    const r = await recordSubscriptionChange(pool, change('canceled'))
    expect(r).toEqual({ recorded: 1, lead: '900000001' })
    const [ins] = (pool as unknown as { inserts: any[] }).inserts
    expect(ins.params[0]).toBe('144022504')
    expect(ins.params[1]).toBe('900000001')
    expect(ins.params[3], 'a cancellation moved the person by itself').toBe(
      'note'
    )
    expect(String(ins.params[4])).toContain(SUBSCRIPTION_NOTES.canceled)
  })

  it('tells the three states apart, and says which one it was', async () => {
    for (const state of ['canceled', 'active', 'failed'] as const) {
      const pool = fakePool(['144022504'])
      await recordSubscriptionChange(pool, change(state))
      const [ins] = (pool as unknown as { inserts: any[] }).inserts
      expect(String(ins.params[4])).toContain(SUBSCRIPTION_NOTES[state])
    }
  })

  it('records a failed charge, which is the warmest of the three', async () => {
    // Somebody whose stars ran out did not decide to leave. Losing this state
    // would turn the most reachable person into the same silence as the rest.
    const pool = fakePool(['144022504'])
    await recordSubscriptionChange(pool, change('failed'))
    const [ins] = (pool as unknown as { inserts: any[] }).inserts
    expect(String(ins.params[4])).toContain('звёзд')
  })

  it('writes for every owner who knows them, not just the first', async () => {
    const pool = fakePool(['144022504', '435572800'])
    const r = await recordSubscriptionChange(pool, change('canceled'))
    expect(r.recorded).toBe(2)
  })

  it('writes nothing for a person who is nobody lead, and says so', async () => {
    const pool = fakePool([])
    const r = await recordSubscriptionChange(pool, change('canceled'))
    expect(r.recorded).toBe(0)
    expect(r.reason).toBe('nobody has this lead')
    expect((pool as unknown as { inserts: any[] }).inserts).toHaveLength(0)
  })

  it('does not invent a meaning for a state Telegram has not shipped yet', async () => {
    const pool = fakePool(['144022504'])
    const r = await recordSubscriptionChange(pool, change('expired'))
    expect(r.recorded).toBe(0)
    expect(r.reason).toContain('expired')
    expect((pool as unknown as { inserts: any[] }).inserts).toHaveLength(0)
  })

  it('never throws at a payment path', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    } as never
    await expect(
      recordSubscriptionChange(broken, change('canceled'))
    ).resolves.toEqual({
      recorded: 0,
      lead: '900000001',
      reason: 'nobody has this lead',
    })
  })
})

afterAll(() => vi.restoreAllMocks())

/**
 * AN AUTO-CHARGE HAS TO ANNOUNCE ITSELF, AND ONLY EXIST ONCE.
 *
 * Two different dangers, both about money taken without a fresh yes each
 * time. The pitch has to say how much, how often and where to stop it in the
 * message the person actually reads. And Telegram will happily run two
 * subscriptions for the same person at once -- it says so in the reference --
 * so the second invoice is refused rather than minted.
 */
describe('what a subscription pitch tells the person', () => {
  const pitch = (subscription: boolean) =>
    composePitch({
      name: 'Кто-то',
      tokens: 150,
      stars: 174,
      url: 'https://t.me/$inv',
      subscription,
    })

  it('says it repeats, how often, and how to stop it', () => {
    const p = pitch(true)
    expect(p).toContain('каждый месяц')
    expect(p).toContain('в месяц')
    expect(p).toContain('отменить')
    // Where to press, not just that it is possible somewhere.
    expect(p).toContain('Мои звёзды')
  })

  it('promises none of that for a one-off, which repeats nothing', () => {
    const p = pitch(false)
    expect(p).not.toContain('каждый месяц')
    expect(p).not.toContain('отменить')
    expect(p).toContain('174')
  })
})

/**
 * A CANCELLED SUBSCRIPTION MUST STOP BLOCKING THE NEXT ONE.
 *
 * hasOpenSubscription refuses a second subscription while one is live, and
 * `cancelled_at` is how a row stops being live -- but that column was stamped
 * by exactly one thing: killing a DRAFT still in the queue. A subscription the
 * person actually bought and then cancelled went on blocking every future
 * offer to them. The guard against selling twice had become a ban on selling
 * again, which is the worse of the two: a double subscription is visible and
 * refundable, a sale that cannot be made is neither.
 */
describe('a cancellation releases the seat', () => {
  const change = (state: string) => ({
    payload: 'subtokens:150:900000001',
    state,
    botName: 'seller_bot',
  })

  /** Records the UPDATEs as well as the touch inserts. */
  function poolWatching(owners: string[]) {
    const sql: Array<{ q: string; p: unknown[] }> = []
    return {
      sql,
      query: async (q: string, p: unknown[] = []) => {
        sql.push({ q: q.replace(/\s+/g, ' ').trim(), p })
        if (/SELECT DISTINCT owner_id/.test(q)) {
          return { rows: owners.map(owner_id => ({ owner_id })) }
        }
        return { rows: [] }
      },
    }
  }

  it('stamps the invoice when Telegram says cancelled', async () => {
    const pool = poolWatching(['144022504'])
    await recordSubscriptionChange(pool as never, change('canceled'))
    const upd = pool.sql.find(x => x.q.startsWith('UPDATE token_invoices'))
    expect(upd, 'the seat is still taken after a cancellation').toBeTruthy()
    expect(upd!.p).toEqual(['900000001'])
    expect(upd!.q).toContain('subscription = TRUE')
    expect(upd!.q).toContain('cancelled_at IS NULL')
  })

  it('leaves it alone when a charge merely failed', async () => {
    /*
     * `failed` means one payment did not go through, not that the
     * subscription ended: Telegram may take it next month. Releasing the
     * guard on a missed charge could leave the person paying twice.
     */
    const pool = poolWatching(['144022504'])
    await recordSubscriptionChange(pool as never, change('failed'))
    expect(pool.sql.some(x => x.q.startsWith('UPDATE token_invoices'))).toBe(
      false
    )
  })

  it('leaves it alone when a subscription is resumed', async () => {
    const pool = poolWatching(['144022504'])
    await recordSubscriptionChange(pool as never, change('active'))
    expect(pool.sql.some(x => x.q.startsWith('UPDATE token_invoices'))).toBe(
      false
    )
  })
})

describe('a person cannot be given two subscriptions at once', () => {
  /**
   * A pool that HONOURS the conditions in the query instead of answering the
   * table name.
   *
   * The first version of this returned a fixed list for anything touching
   * token_invoices, so deleting `cancelled_at IS NULL` from the real query
   * changed nothing and every case still passed. It tested that a query ran,
   * not what the query asked.
   */
  const pool = (
    rows: Array<{
      subscription?: boolean
      cancelled_at?: string | null
      redeemed?: boolean
      /** Stands in for `created_at > now() - N days`. */
      fresh?: boolean
    }>
  ) => ({
    query: async (sql: string) => {
      if (!/FROM token_invoices/.test(sql)) return { rows: [] }
      let kept = rows
      if (/subscription = TRUE/.test(sql)) {
        kept = kept.filter(r => r.subscription === true)
      }
      if (/cancelled_at IS NULL/.test(sql)) {
        kept = kept.filter(r => !r.cancelled_at)
      }
      /*
       * "Live" is no longer "ever minted": a row counts only if it was PAID,
       * or minted recently enough that the offer still stands. The fake obeys
       * that clause too, or deleting it from the real query would change
       * nothing here -- which is how the guard became a permanent ban in the
       * first place.
       */
      if (/redeemed = TRUE OR created_at >/.test(sql)) {
        kept = kept.filter(r => r.redeemed === true || r.fresh === true)
      }
      return { rows: kept }
    },
  })
  const standing = [
    { subscription: true, cancelled_at: null, redeemed: true, fresh: true },
  ]
  const killed = [
    {
      subscription: true,
      cancelled_at: '2026-09-15',
      redeemed: true,
      fresh: true,
    },
  ]

  it('sees an invoice that is still standing', async () => {
    expect(await hasOpenSubscription(pool(standing) as never, '9')).toBe(true)
  })

  it('does not count one the owner already killed', async () => {
    // Cancelling the card is exactly how the owner says "not that one, this
    // one" -- a killed draft must not block the replacement.
    expect(await hasOpenSubscription(pool(killed) as never, '9')).toBe(false)
  })

  it('does not count a subscription that was never paid and has gone stale', async () => {
    /*
     * The defect this guard had: cancelled_at is stamped only when a DRAFT is
     * killed, so a card the owner actually sent left a row that nothing ever
     * marked -- and the person could never be offered a subscription again.
     */
    expect(
      await hasOpenSubscription(
        pool([
          {
            subscription: true,
            cancelled_at: null,
            redeemed: false,
            fresh: false,
          },
        ]) as never,
        '9'
      )
    ).toBe(false)
  })

  it('still counts an unpaid offer while it is fresh', async () => {
    // Two cards for the same person in the same week is a duplicate the owner
    // would have to press twice.
    expect(
      await hasOpenSubscription(
        pool([
          {
            subscription: true,
            cancelled_at: null,
            redeemed: false,
            fresh: true,
          },
        ]) as never,
        '9'
      )
    ).toBe(true)
  })

  it('does not count the person one-off invoices', async () => {
    expect(
      await hasOpenSubscription(
        pool([{ subscription: false, cancelled_at: null }]) as never,
        '9'
      )
    ).toBe(false)
  })

  it('answers no when it cannot tell, rather than blocking every sale', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    }
    expect(await hasOpenSubscription(broken as never, '9')).toBe(false)
  })

  it('refuses the second mint before Telegram is asked for anything', async () => {
    const posted: unknown[] = []
    const f = (async () => {
      posted.push(1)
      return { status: 200, json: async () => ({ ok: true, result: 'x' }) }
    }) as unknown as typeof fetch
    await expect(
      mintTokenInvoice({
        forTelegramId: '900000001',
        tokens: 150,
        subscription: true,
        botToken: 'test-token', // secret-guard-ok: invented here
        fetchImpl: f,
        pool: pool(standing) as never,
      } as never)
    ).rejects.toThrow('уже есть наша подписка')
    expect(posted, 'an invoice was minted anyway').toHaveLength(0)
  })

  it('leaves a one-off mint alone, however many subscriptions exist', async () => {
    const posted: unknown[] = []
    const f = (async () => {
      posted.push(1)
      return { status: 200, json: async () => ({ ok: true, result: 'x' }) }
    }) as unknown as typeof fetch
    await mintTokenInvoice({
      forTelegramId: '900000001',
      tokens: 150,
      botToken: 'test-token', // secret-guard-ok: invented here
      fetchImpl: f,
      pool: pool(standing) as never,
    } as never)
    expect(posted).toHaveLength(1)
  })
})
