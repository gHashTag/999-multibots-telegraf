import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CRM_TOUCH_TOOLS } from './src/agent/crm-touch-tools'

/**
 * TWO ANSWERS TO ONE QUESTION IS WORSE THAN A WRONG ANSWER.
 *
 * MEASURED IN PRODUCTION 2026-09-16, the same owner at the same minute:
 *
 *   crm_waiting  ->   2 people are waiting
 *   crm_summary  -> 316 people are waiting for a reply
 *
 * Both were computed honestly, from different facts. `crm_touches` held five
 * rows for 2394 people and not one was `replied`; `crm_messages` held 25 302
 * inbound. The tool whose entire job is "who is waiting for an answer" was
 * reading the empty table, and the model was handed both numbers with no way
 * to tell which to believe.
 *
 * These tests pin the union: touches where they exist, messages where they do
 * not, and the old touch-only answer intact for an owner with no messages.
 */
const tool = (name: string) => CRM_TOUCH_TOOLS.find(t => t.name === name)!

/*
 * THE ENVIRONMENT IS PART OF THE TEST, AND THE RUNNER DECIDES IT.
 *
 * These two are set here rather than inherited. The repository ROOT vitest
 * config supplies placeholder credentials through `env:`; the render service
 * has its OWN config (vitest.config.mts) and supplies nothing. So the same
 * file is green run from the repository root and red run from the package
 * that owns it -- which is how this very file was first measured: ten passes
 * under the wrong runner.
 *
 * Without them, visibility cannot be resolved and every case here dies with
 * "no bots are registered to you" long before it reaches the logic.
 */
process.env.SUPABASE_URL = 'https://пример.test' // cyrillic-ok
process.env.SUPABASE_SERVICE_KEY = 'ключ' // cyrillic-ok

const iso = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 86400_000).toISOString()

const stubNet = (byBot: Record<string, string>) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const a = String(url)
    if (a.includes('/avatars?')) {
      return { ok: true, json: async () => [{ bot_name: 'bot1' }] } as any
    }
    if (a.includes('/users?')) {
      const m = /telegram_id=eq\.([^&]+)/.exec(a)
      if (m) {
        const bot = byBot[decodeURIComponent(m[1])]
        return {
          ok: true,
          json: async () =>
            bot
              ? [{ telegram_id: decodeURIComponent(m[1]), bot_name: bot }]
              : [],
        } as any
      }
      return {
        ok: true,
        json: async () =>
          Object.entries(byBot).map(([id, bot]) => ({
            telegram_id: id,
            bot_name: bot,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          })),
      } as any
    }
    return { ok: true, json: async () => [] } as any
  })

interface Msg {
  lead: string
  out: boolean
  daysAgo: number
  text?: string
  owner?: string
}
interface Tch {
  lead: string
  kind: string
  daysAgo: number
  owner?: string
}

/**
 * A pool over seeded messages and touches.
 *
 * The owner filter is READ OFF THE QUERY rather than applied here on the
 * code's behalf: a fake that filters by itself passes even when the WHERE has
 * been deleted, which is the exact class of blind guard this repository keeps
 * finding.
 */
const poolWith = (msgs: Msg[], touches: Tch[] = []) => {
  const M = msgs.map(m => ({
    owner_id: m.owner ?? '77',
    lead_id: m.lead,
    out: m.out,
    at: new Date(Date.now() - m.daysAgo * 86400_000),
    text: m.text ?? 'ok',
  }))
  const T = touches.map(t => ({
    owner_id: t.owner ?? '77',
    lead_id: t.lead,
    kind: t.kind,
    note: null,
    at: iso(t.daysAgo),
  }))
  return {
    query: async (sql: string, params: any[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (q.startsWith('CREATE') || q.startsWith('ALTER')) return { rows: [] }
      if (q.includes('FROM crm_touches')) {
        const byOwner = q.includes('owner_id = $1')
        return {
          rows: T.filter(r => !byOwner || r.owner_id === String(params[0])),
        }
      }
      if (q.includes('FROM crm_messages')) {
        const byOwner = q.includes('owner_id = $1')
        const mine = M.filter(r => !byOwner || r.owner_id === String(params[0]))
        if (q.includes('GROUP BY lead_id')) {
          const by = new Map<string, typeof M>()
          for (const r of mine)
            by.set(r.lead_id, [...(by.get(r.lead_id) ?? []), r])
          return {
            rows: [...by.entries()].map(([lead_id, rows]) => ({
              lead_id,
              total: rows.length,
              inbound: rows.filter(r => !r.out).length,
              last_in:
                rows.filter(r => !r.out).sort((a, b) => +b.at - +a.at)[0]?.at ??
                null,
              last_out:
                rows.filter(r => r.out).sort((a, b) => +b.at - +a.at)[0]?.at ??
                null,
            })),
          }
        }
        return {
          rows: mine
            .filter(r => !r.out)
            .map(r => ({ lead_id: r.lead_id, text: r.text })),
        }
      }
      return { rows: [] }
    },
  }
}

describe('crm_waiting reads the messages too, not only the touch log', () => {
  beforeEach(async () => {
    const { forgetTouchTable } = await import('./src/agent/crm-touches')
    forgetTouchTable()
  })
  afterEach(() => vi.unstubAllGlobals())

  const ask = (pool: any, args: Record<string, unknown> = {}) =>
    tool('crm_waiting').handler(args, { telegramId: '77', pool } as any) as any

  it('somebody who wrote and got nothing back is waiting, with no touch at all', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(poolWith([{ lead: '111', out: false, daysAgo: 4 }]))
    expect(
      r.total,
      'the whole point: the touch log is empty and this person is real'
    ).toBe(1)
    expect(r.waiting[0].waiting).toBe('ours')
    expect(r.waiting[0].from).toBe('messages')
  })

  it('a conversation we answered is nobody waiting', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith([
        { lead: '111', out: false, daysAgo: 4 },
        { lead: '111', out: true, daysAgo: 3 },
      ])
    )
    expect(r.total).toBe(0)
  })

  it('an answer that was never recorded as a touch flips theirs into ours', async () => {
    // We wrote (a touch), they answered (a message, no touch). Before this,
    // the tool said they owed US a reply -- the most expensive case of all,
    // reported backwards.
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith(
        [{ lead: '111', out: false, daysAgo: 2 }],
        [{ lead: '111', kind: 'written', daysAgo: 6 }]
      )
    )
    expect(r.total).toBe(1)
    expect(r.waiting[0].waiting).toBe('ours')
    expect(r.waiting[0].from, 'the touch is still the richer fact').toBe(
      'touches'
    )
  })

  it('an owner with no messages gets exactly the old answer', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith([], [{ lead: '111', kind: 'written', daysAgo: 6 }])
    )
    expect(r.total).toBe(1)
    expect(r.waiting[0].waiting).toBe('theirs')
    expect(r.waiting[0].from).toBe('touches')
  })

  it('a third unanswered reminder takes the person out of the queue', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith(
        [],
        [
          { lead: '111', kind: 'written', daysAgo: 4 },
          { lead: '111', kind: 'written', daysAgo: 9 },
          { lead: '111', kind: 'written', daysAgo: 14 },
        ]
      )
    )
    expect(
      r.total,
      'the playbook says stop after two, and now something stops'
    ).toBe(0)
  })

  it('two reminders still wait, and the count is on the row', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith(
        [],
        [
          { lead: '111', kind: 'written', daysAgo: 4 },
          { lead: '111', kind: 'written', daysAgo: 9 },
        ]
      )
    )
    expect(r.total).toBe(1)
    expect(r.waiting[0].nudges).toBe(2)
  })

  it('an old silence is COUNTED, not silently dropped', async () => {
    stubNet({ '111': 'bot1', '222': 'bot1' })
    const r = await ask(
      poolWith([
        { lead: '111', out: false, daysAgo: 200 },
        { lead: '222', out: false, daysAgo: 3 },
      ])
    )
    expect(r.total).toBe(1)
    expect(
      r.older_than_window,
      'a list that shrinks in silence earns no trust'
    ).toBe(1)
    expect(r.window_days).toBe(30)
  })

  it('the window is a number the caller can widen', async () => {
    stubNet({ '111': 'bot1' })
    const pool = poolWith([{ lead: '111', out: false, daysAgo: 200 }])
    expect((await ask(pool, { within_days: 365 })).total).toBe(1)
    expect((await ask(pool, { within_days: 365 })).older_than_window).toBe(0)
  })

  it("another owner's conversation never reaches my list", async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(
      poolWith([
        { lead: '111', out: false, daysAgo: 3, owner: 'somebody else' },
      ])
    )
    expect(r.total).toBe(0)
  })

  it('somebody outside my visibility is not in my list either', async () => {
    // Known to crm_messages, unknown to the audience this owner may see.
    stubNet({})
    const r = await ask(poolWith([{ lead: '111', out: false, daysAgo: 3 }]))
    expect(r.total).toBe(0)
  })
})
