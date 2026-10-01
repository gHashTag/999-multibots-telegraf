/**
 * THE PEOPLE WHO OWN OUR BOTS ARE THE KEEPER'S CLIENTS.
 *
 * Owner, 2026-10-01: the client table had "no information and no tasks", and
 * the people who own our bots were not in it at all. `crm_clients` now puts
 * every bot owner at the top of the KEEPER's list with their bots, the size of
 * their content plan and their open faults.
 *
 * The shape of the defect on the other side is a leak: the list of who owns
 * which bot is exactly what a bot owner must not learn about the others. So
 * every case below that adds a row has a twin that proves a non-keeper never
 * even asks for it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  CRM_CLIENT_WORKSPACE_TOOLS,
  setBotOwnersSource,
} from './src/agent/crm-client-workspace-tools'
import type { ToolContext } from './src/agent/tools'

const KEEPER = '144022504'
process.env.OWNER_TELEGRAM_ID = KEEPER
const BOT_OWNER = '700000001'
const OTHER_OWNER = '700000002'
const SELLER = '500000001'
const PERSON = '435572800'
// A legacy profile nobody has claimed (owner_id IS NULL): it is in every
// seller's list, but its plan belongs to somebody they never wrote to.
const LEGACY = '600000003'

const tool = () =>
  CRM_CLIENT_WORKSPACE_TOOLS.find(t => t.name === 'crm_clients')!

function pool() {
  const seen: Array<{ sql: string; params: unknown[] }> = []
  return {
    seen,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ')
      seen.push({ sql: flat, params })
      // A connected session makes SELLER a seller who is not the keeper.
      if (/FROM tg_sessions/.test(flat)) return { rows: [{ session: 's' }] }
      if (/^\s*SELECT .*FROM crm_people/.test(flat) && !/avatar_url/.test(flat))
        return {
          rows: [
            {
              lead_id: PERSON,
              first_name: 'Geya',
              last_name: null,
              username: 'playom',
              seen_at: '2026-09-30T10:00:00Z',
            },
          ],
        }
      if (/^\s*SELECT .*FROM crm_client_profiles/.test(flat))
        return {
          rows: [{ telegram_id: LEGACY, client: 'Legacy', updated_at: 'x' }],
        }
      if (/FROM content_plan_items/.test(flat)) {
        const ids = (params[0] as string[]) ?? []
        return {
          rows: [
            { telegram_id: BOT_OWNER, total: 12, done: 3 },
            { telegram_id: PERSON, total: 2, done: 1 },
            { telegram_id: LEGACY, total: 5, done: 5 },
          ].filter(r => ids.includes(r.telegram_id)),
        }
      }
      if (/FROM client_defects/.test(flat) && /owner_id = ANY/.test(flat))
        return { rows: [{ owner_id: BOT_OWNER, n: 2 }] }
      if (/FROM client_defects/.test(flat))
        return { rows: [{ lead_id: PERSON, n: 1 }] }
      return { rows: [] }
    },
  }
}

const ctx = (who: string, p: unknown) =>
  ({ telegramId: who, pool: p }) as unknown as ToolContext

function owners(): Map<string, string[]> {
  return new Map([
    [BOT_OWNER, ['leela_chakra_ai_bot']],
    [OTHER_OWNER, ['neuro_blogger_bot', 'other_bot']],
  ])
}

afterEach(() => setBotOwnersSource(null))

describe("crm_clients: the keeper's list carries the bot owners", () => {
  it('puts every bot owner first, with bots, plan and open faults', async () => {
    setBotOwnersSource(async () => owners())
    const p = pool()
    const out = (await tool().handler({}, ctx(KEEPER, p))) as any
    const ids = out.clients.map((c: any) => c.telegram_id)
    expect(ids.slice(0, 2).sort()).toEqual([BOT_OWNER, OTHER_OWNER].sort())
    const her = out.clients.find((c: any) => c.telegram_id === BOT_OWNER)
    expect(her.bots).toEqual(['leela_chakra_ai_bot'])
    expect(her.tasks).toEqual({ total: 12, done: 3, faults_open: 2 })
    const other = out.clients.find((c: any) => c.telegram_id === OTHER_OWNER)
    expect(other.bots).toEqual(['neuro_blogger_bot', 'other_bot'])
    expect(other.tasks).toEqual({ total: 0, done: 0, faults_open: 0 })
    const person = out.clients.find((c: any) => c.telegram_id === PERSON)
    expect(person.bots).toEqual([])
    expect(person.tasks).toEqual({ total: 2, done: 1, faults_open: 1 })
  })

  it('a dead owners source costs those rows, not the answer', async () => {
    setBotOwnersSource(async () => {
      throw new Error('avatars replied 503')
    })
    const out = (await tool().handler({}, ctx(KEEPER, pool()))) as any
    expect(out.clients.map((c: any) => c.telegram_id).sort()).toEqual(
      [LEGACY, PERSON].sort()
    )
  })

  it('a search matches an owner by bot name', async () => {
    setBotOwnersSource(async () => owners())
    const out = (await tool().handler(
      { query: 'chakra' },
      ctx(KEEPER, pool())
    )) as any
    const withBots = out.clients.filter((c: any) => c.bots.length)
    expect(withBots.map((c: any) => c.telegram_id)).toEqual([BOT_OWNER])
  })

  it('a later page carries no owner rows', async () => {
    setBotOwnersSource(async () => owners())
    const out = (await tool().handler(
      { offset: 50 },
      ctx(KEEPER, pool())
    )) as any
    expect(out.clients.some((c: any) => c.bots.length)).toBe(false)
  })
})

describe('crm_clients: nobody else learns who owns which bot', () => {
  it('a seller who is not the keeper never reads the owners', async () => {
    let asked = 0
    setBotOwnersSource(async () => {
      asked += 1
      return owners()
    })
    const p = pool()
    const out = (await tool().handler({}, ctx(SELLER, p))) as any
    expect(asked, 'the owner list was read for a non-keeper').toBe(0)
    for (const c of out.clients) {
      expect(c.bots).toEqual([])
      expect([BOT_OWNER, OTHER_OWNER]).not.toContain(c.telegram_id)
    }
    expect(
      p.seen.some(
        s => /FROM client_defects/.test(s.sql) && /owner_id = ANY/.test(s.sql)
      ),
      "another owner's faults were counted for a non-keeper"
    ).toBe(false)
  })

  it("a seller's plan counts cover only their own people", async () => {
    const p = pool()
    await tool().handler({}, ctx(SELLER, p))
    const plan = p.seen.find(s => /FROM content_plan_items/.test(s.sql))!
    expect(plan.params[0]).toEqual([PERSON])
    const out = (await tool().handler({}, ctx(SELLER, pool()))) as any
    const legacy = out.clients.find((c: any) => c.telegram_id === LEGACY)
    expect(legacy.tasks.total, "a stranger's plan was counted").toBe(0)
    for (const s of p.seen.filter(s => /FROM client_defects/.test(s.sql)))
      expect(s.params[0]).toBe(SELLER)
  })
})
