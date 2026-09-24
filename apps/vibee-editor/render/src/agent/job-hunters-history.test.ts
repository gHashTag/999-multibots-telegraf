import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * THE JOB AGENT READS THE DEEP HISTORY (acceptance anomaly, 2026-09-24).
 *
 * Live, it walked 60 dialogs x 30 messages and found nobody, while the CRM
 * held up to 500 ingested messages per contact. These pin that the history
 * is read, only the caller's own and only the other side's words, that the
 * database does the matching, and that a dead live session no longer takes
 * the whole answer down.
 */

const live = vi.hoisted(() => ({
  fail: null as string | null,
  dialogs: [] as Array<{ id: string; isUser: boolean }>,
  messages: {} as Record<
    string,
    Array<{ message: string; date: number; out?: boolean }>
  >,
}))

vi.mock('./telegram-tools', () => ({
  requireIdentity: (ctx?: { telegramId?: string }) => {
    if (!ctx?.telegramId) throw new Error('who is asking?')
  },
  withClient: async (_ctx: unknown, fn: (c: unknown) => Promise<unknown>) => {
    if (live.fail) throw new Error(live.fail)
    return fn({
      getDialogs: async () =>
        live.dialogs.map(d => ({
          id: { toString: () => d.id },
          isUser: d.isUser,
        })),
      getMessages: async (id: string) => live.messages[id] ?? [],
    })
  },
}))

import { JOB_TOOLS } from './job-tools'
import { hunterPatterns, mergeMessages } from './job-hunters'

const tool = JOB_TOOLS.find(t => t.name === 'job_hunters')!
const OWNER = '900000017' // invented: the tool is mocked to accept any caller
const T = 1_758_000_000

/** A pool that answers crm_messages rows and records the query. */
const poolWith = (rows: Array<Record<string, unknown>>) => {
  const asked: Array<{ sql: string; params: unknown[] }> = []
  return {
    asked,
    pool: {
      async query(sql: string, params: unknown[] = []) {
        asked.push({ sql, params })
        return { rows: sql.includes('crm_messages') ? rows : [] }
      },
    },
  }
}

afterEach(() => {
  live.fail = null
  live.dialogs = []
  live.messages = {}
})

describe('job_hunters reads the ingested history', () => {
  it('finds a recruiter who wrote long ago, beyond any live window', async () => {
    const { pool, asked } = poolWith([
      {
        lead_id: '777',
        at: T,
        text: 'Здравствуйте! Вакансия senior, пришлите резюме',
      },
    ])
    const out = (await tool.handler({}, {
      telegramId: OWNER,
      pool,
    } as never)) as {
      hunters: Array<{ id: string; signs: string[] }>
      looked: Record<string, unknown>
    }
    expect(out.hunters.map(h => h.id)).toEqual(['777'])
    expect(out.hunters[0].signs).toEqual(['resume', 'vacancy'])
    expect(out.looked.history).toBe(1)
    /* Only the caller's own rows, never their own side, matched by the DB. */
    const q = asked.find(a => a.sql.includes('crm_messages'))!
    expect(q.params[0]).toBe(OWNER)
    expect(q.sql).toMatch(/NOT "out"/)
    expect(q.sql).toMatch(/ILIKE ANY/)
  })

  it('a dead live session no longer takes the answer down', async () => {
    live.fail = 'Telegram is not connected'
    const { pool } = poolWith([
      { lead_id: '777', at: T, text: 'We are hiring. Interview on Monday?' },
    ])
    const out = (await tool.handler({}, {
      telegramId: OWNER,
      pool,
    } as never)) as {
      hunters: Array<{ id: string }>
      looked: Record<string, unknown>
    }
    expect(out.hunters.map(h => h.id)).toEqual(['777'])
    expect(String(out.looked.live)).toContain('not connected')
  })

  it('with neither history nor live, the refusal is the live one, as before', async () => {
    live.fail = 'Telegram is not connected'
    const { pool } = poolWith([])
    await expect(
      tool.handler({}, { telegramId: OWNER, pool } as never)
    ).rejects.toThrow(/not connected/)
  })

  it('one sign in history and another live add up, and a duplicate counts once', async () => {
    const { pool } = poolWith([
      { lead_id: '555', at: T, text: 'Какая у вас ставка?' },
    ])
    live.dialogs = [{ id: '555', isUser: true }]
    live.messages['555'] = [
      { message: 'Какая у вас ставка?', date: T },
      { message: 'Можем назначить собеседование', date: T + 60 },
    ]
    const out = (await tool.handler({}, {
      telegramId: OWNER,
      pool,
    } as never)) as {
      hunters: Array<{ id: string; signs: string[]; messages: number }>
    }
    expect(out.hunters).toHaveLength(1)
    expect(out.hunters[0].signs).toEqual(['interview', 'rate'])
    expect(out.hunters[0].messages).toBe(2)
  })
})

describe('the patterns the database matches', () => {
  it('cover every sign word, capitalised too, with wildcards escaped', () => {
    const p = hunterPatterns()
    expect(p).toContain('%вакансия%')
    expect(p).toContain('%Вакансия%')
    expect(p).toContain('%hiring%')
    for (const x of p) expect(x.slice(1, -1)).not.toMatch(/(^|[^\\])[%_]/)
  })

  it('merging keeps order and drops exact repeats only', () => {
    const a = { from: '1', at: 5, text: 'x' }
    expect(mergeMessages([a], [a, { ...a, at: 6 }]).map(m => m.at)).toEqual([
      5, 6,
    ])
  })
})
