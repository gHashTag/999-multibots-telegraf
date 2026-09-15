import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE OVERVIEW: every number derived the way the list derives it, from a
 * three-person memory -- one waiting, one who asked a price and was answered,
 * one gone quiet.
 */
const OWNER = '144022504'
const A = '111111111'
const B = '222222222'
const C = '333333333'

function fakePool(o: { throwOn?: RegExp } = {}) {
  const queries: string[] = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push(flat)
      if (o.throwOn?.test(flat)) throw new Error('db down')
      if (/count\(\*\)::int AS people_known/.test(flat))
        return {
          rows: [{ people_known: 3, last_ingest_at: '2026-09-08T14:02:00Z' }],
        }
      if (/GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              total: 4,
              inbound: 3,
              last_in: '2026-09-08T10:00:00Z',
              last_out: '2026-09-07T10:00:00Z',
            },
            {
              lead_id: B,
              total: 6,
              inbound: 2,
              last_in: '2026-09-05T10:00:00Z',
              last_out: '2026-09-06T10:00:00Z',
            },
            {
              lead_id: C,
              total: 2,
              inbound: 1,
              last_in: '2026-07-30T10:00:00Z',
              last_out: '2026-07-31T10:00:00Z',
            },
          ],
        }
      if (/^SELECT lead_id, text FROM crm_messages/.test(flat))
        return {
          rows: [
            { lead_id: A, text: 'сколько стоит фото?' },
            { lead_id: B, text: 'а цена?' },
            { lead_id: C, text: 'привет' },
          ],
        }
      if (/SELECT DISTINCT ON \(lead_id\) lead_id, text/.test(flat))
        return {
          rows: [
            { lead_id: A, text: 'сколько стоит фото?' },
            { lead_id: B, text: 'а цена?' },
            { lead_id: C, text: 'привет' },
          ],
        }
      if (/FROM crm_people WHERE owner_id = \$1$/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              first_name: 'Pilot',
              last_name: null,
              username: 'pilot_client',
            },
          ],
        }
      /*
       * The windowed read (touchedSince). It stopped being a DISTINCT ON in
       * 2026-09: with corrections in the table, one-row-per-lead could return
       * the CORRECTION and never see the row it cancels, so the window is read
       * whole and folded in code. The window clause is what tells this query
       * apart from the unwindowed touchesByLead below.
       */
      if (/FROM crm_touches WHERE owner_id = \$1 AND at > now\(\) -/.test(flat))
        return {
          rows: [
            {
              id: 11,
              lead_id: A,
              kind: 'replied',
              at: '2026-09-08T09:00:00Z',
              reverts_id: null,
            },
          ],
        }
      if (
        /FROM crm_touches WHERE owner_id = \$1 ORDER BY at DESC LIMIT/.test(
          flat
        )
      )
        return {
          rows: [
            {
              id: 11,
              lead_id: A,
              kind: 'replied',
              at: '2026-09-08T09:00:00Z',
              reverts_id: null,
            },
            {
              id: 12,
              lead_id: C,
              kind: 'written',
              at: '2026-09-01T09:00:00Z',
              reverts_id: null,
            },
          ],
        }
      if (/GROUP BY kind/.test(flat))
        return {
          rows: [
            {
              kind: 'written',
              total: 5,
              recent: 2,
              last_at: '2026-09-08T09:00:00Z',
            },
            {
              kind: 'bought',
              total: 1,
              recent: 1,
              last_at: '2026-09-07T09:00:00Z',
            },
          ],
        }
      /*
       * Seller sends, ANSWERED BY THE WINDOW ASKED FOR.
       *
       * The same query serves two different questions -- how many cards went
       * out over the report's window, and how many in the last 24 hours for
       * the daily budget. A fake that answered one number for both would
       * make the budget untestable: it would look right while measuring the
       * wrong period.
       */
      if (/note LIKE \$3/.test(flat)) {
        return { rows: [{ n: String(params[1]) === '1' ? 2 : 5 }] }
      }
      return { rows: [] }
    },
  }
}
const ctxFor = (who = OWNER, pool = fakePool()) =>
  ({ telegramId: who, pool, surface: 'bot', turn: 't' }) as never

async function summaryTool() {
  const { CRM_SUMMARY_TOOLS } = await import('./src/agent/crm-summary-tool')
  return CRM_SUMMARY_TOOLS[0]
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ now: new Date('2026-09-08T12:00:00Z') })
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
  delete process.env.ZEP_API_KEY
  delete process.env.ZEP_AUTH_SECRET
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('payments_v2') ? [{ telegram_id: B }] : [],
    }))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_KEY
})

describe('crm_summary', () => {
  it('counts everybody the way the list does: next, stage, signal, waiting, hot, money', async () => {
    const tool = await summaryTool()
    const r: any = await tool.handler({}, ctxFor())
    expect(r.window_days).toBe(7)
    expect(r.people_known).toBe(3)
    expect(r.last_ingest_at).toBe('2026-09-08T14:02:00.000Z')
    expect(r.people_with_messages).toBe(3)
    expect(r.messages).toEqual({ total: 12, inbound: 6, outbound: 6 })
    expect(r.last_inbound_at).toBe('2026-09-08T10:00:00.000Z')
    expect(r.paid).toBe(1)
    expect(r.waiting_for_reply).toBe(1)
    expect(r.hot).toBe(2)
    expect(r.by_next).toEqual({
      reply: 1,
      deliver: 0,
      offer: 1,
      talk: 0,
      wait: 1,
    })
    /*
     * `written: 1` AND `new: 0` -- this pair was the other way round until
     * 2026-09-16, and the fixture above is the proof it was wrong.
     *
     * Lead C has a `written` touch in this very test's touch history, and the
     * summary called him 'new' with the reason "never touched". That is
     * what passing stageOf a single `lastTouch` did: the windowed read did not
     * carry C, so stageOf was handed an empty list and answered "never
     * touched" about somebody the same tool had just counted a touch for.
     *
     * The stage is now computed from the whole folded history, which is what
     * stageOf was written for -- its refusal rule is a `find` across every
     * touch. This mattered beyond one label: a client who had refused and then
     * wrote again had his refusal erased here, while crm_waiting, which does
     * read the history, still called him refused.
     */
    expect(r.by_stage).toEqual({
      client: 1,
      refused: 0,
      later: 0,
      talking: 1,
      written: 1,
      winback: 0,
      new: 0,
    })
    expect(r.by_signal).toEqual({
      price: 2,
      buy: 0,
      service: 1,
      urgency: 0,
      objection: 0,
    })
    expect(r.touches_by_kind.written).toEqual({
      total: 5,
      recent: 2,
      last_at: '2026-09-08T09:00:00Z',
    })
    expect(r.touches_by_kind.later).toEqual({
      total: 0,
      recent: 0,
      last_at: null,
    })
    expect(r.waiting_by_touch).toEqual({ ours: 1, due: 0, theirs: 1 })
    expect(r.top.map((t: any) => t.lead)).toEqual([A, B])
    expect(r.top[0]).toMatchObject({
      display: 'Pilot (@pilot_client)',
      next: 'reply',
      stage: 'talking',
      waiting_for_reply: true,
    })
    expect(r.top[1]).toMatchObject({
      display: null,
      next: 'offer',
      stage: 'client',
    })
    expect(r.pending_card).toBeNull()
    expect(r.zep).toBe('не подключён')
    // One person, one segment: A waiting, B hot (asked a price 3 days ago), C quiet.
    expect(r.segments).toEqual({
      hot: 2,
      objection: 0,
      waiting: 0,
      talk: 0,
      due: 0,
      ours: 0,
      warm: 1,
      winback: 0,
      quiet: 0,
    })
    expect(r.objections).toEqual([])
    expect(r.caps).toMatchObject({ hot: 10, waiting: 20, warm: 10, day: 30 })
    /*
     * A DAILY CAP NOBODY COUNTS IS A NUMBER, NOT A CAP.
     *
     * `caps.day` was handed to the model and measured by nothing: it could
     * be neither respected nor seen to be broken. What is reported now is
     * what is LEFT of it -- over a rolling 24 hours, because nobody here
     * knows the owner's timezone.
     */
    expect(r.seller_sends_recent, 'the window figure moved').toBe(5)
    expect(r.day_budget).toEqual({ cap: 30, sent_last_24h: 2, left: 28 })
    expect(r.how_to_read).toContain('day_budget')
    expect(r.how_to_read).toContain('Не предлагай оплату первым')
  })

  it('the window is clamped to 1..90 and defaults to 7; the SQL carries it', async () => {
    const tool = await summaryTool()
    const pool = fakePool()
    expect(
      ((await tool.handler({ days: 500 }, ctxFor(OWNER, pool))) as any)
        .window_days
    ).toBe(90)
    expect(
      ((await tool.handler({ days: 'x' }, ctxFor(OWNER, pool))) as any)
        .window_days
    ).toBe(7)
    expect(pool.queries.some(q => /GROUP BY kind/.test(q))).toBe(true)
  })

  it('a pending card is named with its age', async () => {
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    q.remember({
      id: 'p77',
      telegramId: OWNER,
      action: 'send',
      target: '@pilot_client',
      what: 'x',
      turn: 't',
    } as never)
    vi.setSystemTime(new Date('2026-09-08T12:04:00Z'))
    const tool = await summaryTool()
    const r: any = await tool.handler({}, ctxFor())
    expect(r.pending_card).toEqual({
      id: 'p77',
      action: 'send',
      target: '@pilot_client',
      age_minutes: 4,
    })
  })

  it('anybody but the owner is refused before any query', async () => {
    const tool = await summaryTool()
    const pool = fakePool()
    await expect(tool.handler({}, ctxFor('999', pool))).rejects.toThrow(
      'владельцу'
    )
    expect(pool.queries).toEqual([])
  })

  it('a database that is down for the people count still yields the rest', async () => {
    const tool = await summaryTool()
    const r: any = await tool.handler(
      {},
      ctxFor(OWNER, fakePool({ throwOn: /people_known/ }))
    )
    expect(r.people_known).toBe(0)
    expect(r.last_ingest_at).toBeNull()
    expect(r.people_with_messages).toBe(3)
  })

  it('is registered, and it is in the compact seller kit', async () => {
    const { TOOLS_BY_NAME, COMPACT_TOOLS } = await import('./src/agent/tools')
    expect(TOOLS_BY_NAME.has('crm_summary')).toBe(true)
    expect(COMPACT_TOOLS.test('crm_summary')).toBe(true)
  })
})

describe('the touches helpers', () => {
  it('touchesByKind groups by kind with the window; a dead pool is an empty list', async () => {
    const { touchesByKind, sellerSendsSince, SELLER_NOTE_PREFIXES } =
      await import('./src/agent/crm-touches')
    const pool = fakePool()
    const rows = await touchesByKind(pool as never, OWNER, 200)
    expect(rows.map(r => r.kind)).toEqual(['written', 'bought'])
    expect(pool.queries.some(q => /GROUP BY kind/.test(q))).toBe(true)
    expect(
      await touchesByKind(
        fakePool({ throwOn: /GROUP BY kind/ }) as never,
        OWNER
      )
    ).toEqual([])
    // The fake answers by the window asked for: the default is seven days.
    expect(await sellerSendsSince(pool as never, OWNER)).toBe(5)
    expect(await sellerSendsSince(pool as never, OWNER, 1)).toBe(2)
    expect(
      await sellerSendsSince(fakePool({ throwOn: /note LIKE/ }) as never, OWNER)
    ).toBe(0)
    expect(SELLER_NOTE_PREFIXES).toEqual({
      message: 'отправлено из личного продавца: ',
      service: 'услуга в личке: ',
    })
  })
})
