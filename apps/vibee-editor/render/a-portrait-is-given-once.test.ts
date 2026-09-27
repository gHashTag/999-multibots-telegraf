/**
 * ONE PORTRAIT PER PERSON IS A GIFT (crm-lead-magnet.t27 v2 GIFTS_PER_PERSON).
 *
 * The spec said so from v1 and nothing held it: `gift` defaults to true, so
 * every crm_deliver_photo drew another free portrait on the owner's wallet --
 * and the gift caption itself invites "another one". What this pins, on the
 * same delivery harness the late-portrait tests use:
 *
 *   - a person who was already GIVEN a portrait (a sent gift in the touches)
 *     gets no second free one: nothing is drawn, nothing is charged, and the
 *     answer names the paid way and the next gift (the story reel);
 *   - a reel gift alone does not use up the portrait;
 *   - the paid path (gift=false) is untouched by the rule;
 *   - a portrait already PAID FOR is still handed over (never lost).
 *
 * Ids are synthetic (9000000xx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { owedDouble } from './crm-owed-double'
import { OWNER, LEAD, deliverySetup } from './crm-deliver-harness'

vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.resetModules()
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('./src/agent/crm-offer-tool')
  vi.doUnmock('./src/agent/telegram-tools')
  vi.doUnmock('./src/agent/crm-touch-tools')
  vi.doUnmock('./src/agent/chat-memory')
})

/** The touches the owner's confirmed sends left: 'photo' or 'video' gifts. */
function withGifts(
  s: Awaited<ReturnType<typeof deliverySetup>>,
  kinds: Array<'photo' | 'video'>
) {
  const inner = s.pool.query
  s.pool.query = async (sql: string, p: unknown[] = []) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    if (/FROM crm_touches/.test(flat)) {
      const mine = String(p[0]) === OWNER && String(p[1]) === LEAD
      const k = mine ? kinds : []
      return {
        rows: [
          {
            portrait: k.length ? k.some(x => x !== 'video') : null,
            reel: k.length ? k.includes('video') : null,
          },
        ],
      }
    }
    return inner(sql, p)
  }
}

describe('one portrait per person is a gift', () => {
  it('a person already given a portrait gets no second free one: nothing drawn, nothing charged', async () => {
    const s = await deliverySetup({ owed: owedDouble(), plan: ['done'] })
    withGifts(s, ['photo'])
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset' },
      s.ctx
    )
    expect(r.delivered).toBe(false)
    expect(r.gift_used).toBe(true)
    expect(r.price).toBe(0)
    expect(r['причина']).toMatch('gift=false') // cyrillic-ok: public API field
    expect(r['причина']).toMatch('crm_story_reel') // cyrillic-ok: public API field
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    expect(s.q.pendingCount()).toBe(0)
    expect(s.pool.journal.map(j => j.kind)).toContain('gift-refused')
  })

  it('the first portrait is a gift as before', async () => {
    const s = await deliverySetup({ owed: owedDouble(), plan: ['done'] })
    withGifts(s, [])
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset' },
      s.ctx
    )
    expect(r.proposal).toBe(true)
    expect(r.gift).toBe(true)
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 1 })
  })

  it('a reel gift alone does not use up the portrait', async () => {
    const s = await deliverySetup({ owed: owedDouble(), plan: ['done'] })
    withGifts(s, ['video'])
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset' },
      s.ctx
    )
    expect(r.proposal).toBe(true)
    expect(r.gift).toBe(true)
  })

  it('the paid path is untouched: gift=false still draws for the recipient to pay', async () => {
    const s = await deliverySetup({
      owed: owedDouble(),
      plan: ['done'],
      ownClient: true,
      balance: 100,
    })
    withGifts(s, ['photo'])
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset', gift: false },
      s.ctx
    )
    expect(r.proposal).toBe(true)
    expect(r.gift).toBe(false)
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 0 })
  })
})
