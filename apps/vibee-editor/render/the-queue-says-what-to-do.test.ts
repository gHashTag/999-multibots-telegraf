import { describe, it, expect, vi, afterEach } from 'vitest'
import { CRM_TOUCH_TOOLS } from './src/agent/crm-touch-tools'

/**
 * A QUEUE THAT SAYS WHO IS WAITING, AND WHAT TO DO ABOUT IT.
 *
 * Owner, 2026-09-23: "set up a sales department for Gaia over her clients...
 * and a sales algorithm for every case". `crm_waiting` already answered the
 * first half honestly. The second half -- the move -- was left to the model,
 * and that is where this week's two failures came from: a client left waiting
 * three days while something was prepared to sell her, and a promise ("да
 * вернем", about a balance) with nothing anywhere to remember it.
 *
 * The move itself is decided by sales-playbook.ts and tested there case by
 * case. What is pinned HERE is the wiring: that the queue carries it, that it
 * is sorted by how late things are, and that it rides in the ANSWER rather
 * than in the tool's description -- the compact kit stands at 5998 tokens of
 * 6000, so a sentence would not fit while facts cost nothing.
 */

const tool = (name: string) => CRM_TOUCH_TOOLS.find(t => t.name === name)!

// The same two the sibling tests set: visibility cannot resolve without them.
process.env.SUPABASE_URL = 'https://пример.test' // cyrillic-ok
process.env.SUPABASE_SERVICE_KEY = 'ключ' // cyrillic-ok

const stubNet = (byBot: Record<string, string>) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const a = String(url)
    if (a.includes('/avatars?'))
      return { ok: true, json: async () => [{ bot_name: 'bot1' }] } as never
    if (a.includes('/users?')) {
      const m = /telegram_id=eq\.([^&]+)/.exec(a)
      if (m) {
        const id = decodeURIComponent(m[1])
        return {
          ok: true,
          json: async () =>
            byBot[id] ? [{ telegram_id: id, bot_name: byBot[id] }] : [],
        } as never
      }
      return {
        ok: true,
        json: async () =>
          Object.entries(byBot).map(([id, bot]) => ({
            telegram_id: id,
            bot_name: bot,
            first_name: 'Кто-то',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          })),
      } as never
    }
    return { ok: true, json: async () => [] } as never
  })

/**
 * A pool over seeded messages, the same shape the sibling test proved
 * (crm-waiting-from-messages.test.ts) -- including reading the owner filter
 * OFF THE QUERY rather than applying it here, so a deleted WHERE fails.
 *
 * One deliberate difference: crm_owed throws. An owner who was never owed
 * anything is the common case, and a queue that dies on that is worse than
 * no queue.
 */
const poolWith = (
  msgs: Array<{ lead: string; out: boolean; daysAgo: number }>
) => {
  const M = msgs.map(m => ({
    owner_id: '77',
    lead_id: m.lead,
    out: m.out,
    at: new Date(Date.now() - m.daysAgo * 86400_000),
    text: 'ok',
  }))
  return {
    query: async (sql: string, params: any[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (/crm_owed/i.test(q)) throw new Error('no such table: crm_owed')
      if (q.startsWith('CREATE') || q.startsWith('ALTER')) return { rows: [] }
      if (q.includes('FROM crm_touches')) return { rows: [] }
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

describe('the queue says what to do, not only who is waiting', () => {
  afterEach(() => vi.unstubAllGlobals())

  const ask = (pool: unknown) =>
    tool('crm_waiting').handler({}, { telegramId: '77', pool } as never) as any

  it('every row carries the move, why it, and what the message is for', async () => {
    stubNet({ '111': 'bot1' })
    const r = await ask(poolWith([{ lead: '111', out: false, daysAgo: 4 }]))
    expect(r.total).toBe(1)
    const row = r.waiting[0]
    // Somebody wrote four days ago and got nothing: there is exactly one move.
    expect(row.move).toBe('answer_now')
    expect(row.urgency).toBe('overdue')
    expect(String(row.next_why)).toContain('4 дн.')
    expect(String(row.intent)).toContain('без приветствия незнакомцу')
  })

  it('what is late is read first', async () => {
    stubNet({ '111': 'bot1', '222': 'bot1' })
    const r = await ask(
      poolWith([
        // Answered an hour ago: the ball is theirs, nothing to do.
        { lead: '222', out: false, daysAgo: 0.05 },
        { lead: '222', out: true, daysAgo: 0.04 },
        // Waiting six days.
        { lead: '111', out: false, daysAgo: 6 },
      ])
    )
    expect(r.waiting[0].telegram_id).toBe('111')
    expect(r.waiting[0].urgency).toBe('overdue')
  })

  it('survives an owner with no debts table at all', async () => {
    // The fixture throws on crm_owed on purpose: a queue that dies because
    // nobody was ever owed anything would be worse than no queue.
    stubNet({ '111': 'bot1' })
    const r = await ask(poolWith([{ lead: '111', out: false, daysAgo: 2 }]))
    expect(r.total).toBe(1)
    expect(r.waiting[0].move).toBe('answer_now')
  })

  it('the move is not sold to the model in the description', async () => {
    // The compact kit has two tokens of headroom (provider.test.ts). Facts in
    // the answer are free; a sentence here is not.
    const described = tool('crm_waiting').description
    expect(described).not.toContain('move')
    expect(described).not.toContain('urgency')
  })
})
