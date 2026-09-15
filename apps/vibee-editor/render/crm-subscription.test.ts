import { describe, it, expect, afterAll, vi } from 'vitest'
import {
  subscriptionLead,
  ownersOfLead,
  recordSubscriptionChange,
  SUBSCRIPTION_NOTES,
} from './src/agent/crm-subscription'

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
