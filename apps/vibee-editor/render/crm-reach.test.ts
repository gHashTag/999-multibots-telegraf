/**
 * ONE GATE, THREE TOOLS: "the super-admin sees everything, a client only their
 * own", asserted where it is actually decided.
 *
 * `crm-owner-gate.test.ts` proves every CRM tool refuses a STRANGER -- somebody
 * with no connected Telegram at all. This file covers the harder case that
 * three tools got wrong: a real, logged-in SELLER asking about a person who is
 * not theirs. `isSeller` says yes to them, and until 2026-09-21 that was the
 * whole check standing between them and
 *
 *   - 400 characters of that person's private SOUL and their skill names
 *     (crm_client_profile),
 *   - that person's token balance (crm_lead_context),
 *   - that person's unpublished content plan (crm_client_plan, fixed inline on
 *     2026-09-20 and moved here so the other two could share it).
 *
 * The pools below answer everything with "no rows". A tool that leaks does not
 * need the database to hold anything interesting -- it only needs to ASK -- so
 * these cases assert on which SQL was issued, not on what came back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '144022504'
/** A seller: their own Telegram is connected, so `isSeller` is true. */
const SELLER = '500000001'
/** Neither of the above has ever written to this person. */
const OUTSIDER = '900000999'

process.env.OWNER_TELEGRAM_ID = OWNER

// The role lookup, as in crm-owner-gate.test.ts: the keeper's scope is null
// ("the whole farm"), everybody else gets an empty one. Mocked so the test
// cannot reach Supabase and cannot depend on who owns which bot today.
vi.mock('./src/hive/roles', () => ({
  visibilityOf: vi.fn(async (who: string) =>
    who === OWNER ? { role: 'keeper', bots: null } : { role: 'bee', bots: [] }
  ),
  botFilter: (v: { bots: string[] | null }) => v.bots,
}))

import { ownsLead } from './src/agent/crm-reach'
import { CRM_MEMORY_TOOLS } from './src/agent/crm-memory-tools'
import { CRM_CLIENT_TOOLS } from './src/agent/crm-client-setup-tool'
import type { ToolContext } from './src/agent/tools'

const WALLET = /FROM user_tokens/
const SOUL = /FROM user_soul/
const SKILLS = /FROM user_skills/
const REACH_PROBE = /SELECT 1 FROM crm_(messages|people)/

/**
 * A pool that remembers every statement and answers all of them with nothing.
 * `wrote` lets one case seed the correspondence the gate looks for.
 */
function watchingPool(wrote: Array<[string, string]> = []) {
  const seen: string[] = []
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const q = String(sql).replace(/\s+/g, ' ').trim()
      seen.push(q)
      // The seller check reads the CALLER's own row, keyed by the verified id.
      if (/FROM tg_sessions/.test(q)) return { rows: [{ session: 's' }] }
      if (REACH_PROBE.test(q)) {
        const hit = wrote.some(
          ([o, l]) => o === String(params[0]) && l === String(params[1])
        )
        return { rows: hit ? [{ one: 1 }] : [] }
      }
      return { rows: [] }
    },
  }
  const asked = (re: RegExp) => seen.some(q => re.test(q))
  return { pool, seen, asked }
}

const ctxOf = (who: string, pool: unknown) =>
  ({ telegramId: who, pool }) as unknown as ToolContext

const toolNamed = (tools: Array<{ name: string }>, name: string) =>
  tools.find(t => t.name === name) as unknown as {
    handler: (a: unknown, c: unknown) => Promise<any>
  }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ownsLead', () => {
  it('lets anybody read their own row without asking the database', async () => {
    const { pool, seen } = watchingPool()
    expect(await ownsLead(ctxOf(SELLER, pool), SELLER)).toBe(true)
    expect(seen).toEqual([])
  })

  it('lets the keeper reach a person they have never written to', async () => {
    const { pool, asked } = watchingPool()
    expect(await ownsLead(ctxOf(OWNER, pool), OUTSIDER)).toBe(true)
    // The keeper is decided by role, not by correspondence: no probe is needed.
    expect(asked(REACH_PROBE)).toBe(false)
  })

  it('lets a plain seller reach a person they have corresponded with', async () => {
    const { pool } = watchingPool([[SELLER, OUTSIDER]])
    expect(await ownsLead(ctxOf(SELLER, pool), OUTSIDER)).toBe(true)
  })

  it('refuses a plain seller a person they have not', async () => {
    const { pool } = watchingPool()
    expect(await ownsLead(ctxOf(SELLER, pool), OUTSIDER)).toBe(false)
  })

  it('answers no, not yes, when the tables are missing', async () => {
    const angry = {
      query: async () => {
        throw new Error('relation "crm_messages" does not exist')
      },
    }
    expect(await ownsLead(ctxOf(SELLER, angry), OUTSIDER)).toBe(false)
  })

  it('refuses an unidentified caller and a blank target', async () => {
    const { pool } = watchingPool()
    expect(await ownsLead(ctxOf('', pool), OUTSIDER)).toBe(false)
    expect(await ownsLead(ctxOf(SELLER, pool), '')).toBe(false)
    expect(await ownsLead(undefined, OUTSIDER)).toBe(false)
  })
})

describe('crm_lead_context', () => {
  const tool = () => toolNamed(CRM_MEMORY_TOOLS as never, 'crm_lead_context')

  /*
   * Every other read in this handler carries the owner id. `balanceOf` is the
   * one that does not -- the wallet is per person, platform-wide -- so the
   * empty shell a stranger's lead returns used to arrive with that person's
   * balance inside it.
   */
  it('does not read the wallet of a person the caller has not written to', async () => {
    const { pool, asked } = watchingPool()
    const out = await tool().handler(
      { chat: OUTSIDER, limit: 5 },
      ctxOf(SELLER, pool)
    )
    expect(asked(WALLET)).toBe(false)
    expect(out.balance_tokens).toBeNull()
  })

  it('reads it for their own client, and for the keeper', async () => {
    const mine = watchingPool([[SELLER, OUTSIDER]])
    await tool().handler({ chat: OUTSIDER, limit: 5 }, ctxOf(SELLER, mine.pool))
    expect(mine.asked(WALLET)).toBe(true)

    const keeper = watchingPool()
    await tool().handler(
      { chat: OUTSIDER, limit: 5 },
      ctxOf(OWNER, keeper.pool)
    )
    expect(keeper.asked(WALLET)).toBe(true)
  })
})

describe('crm_client_profile', () => {
  const tool = () => toolNamed(CRM_CLIENT_TOOLS as never, 'crm_client_profile')

  /*
   * The worst of the three: `user_soul` and `user_skills` have no owner column
   * at all, and both were read on the strength of `isSeller` alone -- including
   * on the branch that tells the caller the profile is not theirs.
   */
  it("never touches a stranger's SOUL or skills, and says so", async () => {
    const { pool, asked } = watchingPool()
    const out = await tool().handler(
      { telegram_id: OUTSIDER },
      ctxOf(SELLER, pool)
    )
    expect(asked(SOUL)).toBe(false)
    expect(asked(SKILLS)).toBe(false)
    expect(out.has_profile).toBe(false)
    expect(out.has_soul).toBe(false)
    expect(out.skills).toEqual([])
    // "Not yours to read" is distinguishable from "they never wrote one".
    expect(out.private_withheld).toBe(true)
  })

  it('reads them for the keeper, and says nothing was withheld', async () => {
    const { pool, asked } = watchingPool()
    const out = await tool().handler(
      { telegram_id: OUTSIDER },
      ctxOf(OWNER, pool)
    )
    expect(asked(SOUL)).toBe(true)
    expect(asked(SKILLS)).toBe(true)
    expect(out.private_withheld).toBeUndefined()
  })

  it('reads them for a seller who has corresponded with the person', async () => {
    const { pool, asked } = watchingPool([[SELLER, OUTSIDER]])
    await tool().handler({ telegram_id: OUTSIDER }, ctxOf(SELLER, pool))
    expect(asked(SOUL)).toBe(true)
  })
})
