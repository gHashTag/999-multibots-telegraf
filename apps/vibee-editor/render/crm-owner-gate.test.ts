/**
 * EVERY CRM TOOL REFUSES A STRANGER, AND REFUSES BEFORE IT READS.
 *
 * The website's Clients console has no access rule of its own. It calls the
 * agent's tools over /mcp and lets THIS gate decide, because a rule repeated in
 * a second place is a rule that will one day disagree with itself -- and the
 * price of disagreeing here is one person's correspondence on another person's
 * screen. So the console's safety is exactly the property this file asserts.
 *
 * The test is written so that it cannot pass by accident: the pool handed to
 * every tool THROWS on any query. A tool that reads first and checks second
 * would surface as a database error rather than a refusal, and the assertion
 * below distinguishes the two.
 *
 * It is also a mutation canary. Flip `requireSeller` to `requireIdentity` in
 * crm_leads and this file fails; that swap has already happened once in this
 * service's history, for a reason that made sense at the time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '144022504'
const STRANGER = '900000042'
process.env.OWNER_TELEGRAM_ID = OWNER

// The visibility rule for the scope-gated tools lives in the hive; a stranger
// with no bots to their name gets an empty scope, which is a refusal.
vi.mock('./src/hive/roles', () => ({
  visibilityOf: vi.fn(async (who: string) =>
    who === OWNER ? { role: 'owner', bots: null } : { role: 'guest', bots: [] }
  ),
  botFilter: (v: { bots: string[] | null }) => v.bots,
}))

import { CRM_TOOLS } from './src/agent/crm-tools'
import { CRM_MEMORY_TOOLS } from './src/agent/crm-memory-tools'
import { CRM_SUMMARY_TOOLS } from './src/agent/crm-summary-tool'
import { CRM_TOUCH_TOOLS } from './src/agent/crm-touch-tools'
import { CRM_OFFER_TOOLS } from './src/agent/crm-offer-tool'
import { CRM_DUET_TOOLS } from './src/agent/crm-duet-tool'
import { CRM_CLIENT_WORKSPACE_TOOLS } from './src/agent/crm-client-workspace-tools'

const REGISTRIES = {
  CRM_TOOLS,
  CRM_MEMORY_TOOLS,
  CRM_SUMMARY_TOOLS,
  CRM_TOUCH_TOOLS,
  CRM_OFFER_TOOLS,
  // The per-client workspace (spec crm-client-workspace.t27): the list of
  // runs and the two dashboard reads. crm_duet / crm_duet_status are
  // owner-only and covered by the same loop.
  CRM_DUET_RUNS: CRM_DUET_TOOLS.filter(t => t.name === 'crm_duet_runs'),
  CRM_CLIENT_WORKSPACE_TOOLS,
}

/**
 * Any query at all is a failure of the gate, so the pool says so out loud --
 * with ONE exception since 2026-09-13: the gate's own lookup of the caller's
 * row in tg_sessions (`requireSeller`, spec crm-sellers.t27). A seller is
 * whoever connected their own account, so the check IS a read, keyed by the
 * verified caller id; it can return nothing about anybody else. The fake
 * answers it with "no row", which is a refusal, and counts nothing.
 */
let touched = 0
const GATE_OWN_READ = /tg_sessions/
const hostilePool = {
  query: async (sql?: string) => {
    if (GATE_OWN_READ.test(String(sql ?? ''))) return { rows: [] }
    touched += 1
    throw new Error('THE POOL WAS TOUCHED BEFORE THE CALLER WAS CHECKED')
  },
  connect: async () => {
    touched += 1
    throw new Error('THE POOL WAS TOUCHED BEFORE THE CALLER WAS CHECKED')
  },
}

/** Arguments plausible enough that a tool cannot refuse on validation instead. */
const ARGS: Record<string, Record<string, unknown>> = {
  crm_leads: { limit: 5 },
  crm_lead_context: { chat: '900000001', limit: 5 },
  crm_summary: { days: 7 },
  crm_history: { telegram_id: '900000001' },
  crm_touch: { telegram_id: '900000001', kind: 'note', note: 'x' },
  crm_waiting: {},
  crm_offer: { telegram_id: '900000001', tokens: 100 },
  crm_deliver_photo: { telegram_id: '900000001', prompt: 'x' },
  crm_ingest_chats: { limit: 5, depth: 5 },
  crm_lead_media: { lead: '900000001', limit: 5 },
  crm_duet_runs: { buyer: '900000001', limit: 5 },
  crm_client_plan: { telegram_id: '900000001' },
  crm_clients: { limit: 5 },
}

const named = Object.entries(REGISTRIES).flatMap(([registry, tools]) =>
  tools.map(tool => ({ registry, tool }))
)

beforeEach(() => {
  touched = 0
})

describe('the CRM tools, asked by somebody who is not the owner', () => {
  it('has tools to check at all', () => {
    expect(named.length).toBeGreaterThan(5)
  })

  it.each(named.map(n => [`${n.registry}: ${n.tool.name}`, n.tool] as const))(
    '%s refuses a stranger without touching the database',
    async (_label, tool) => {
      const ctx = {
        telegramId: STRANGER,
        pool: hostilePool as never,
      } as never

      let refused = false
      let message = ''
      try {
        const out = await (
          tool as { handler: (a: unknown, c: unknown) => Promise<unknown> }
        ).handler(ARGS[(tool as { name: string }).name] ?? {}, ctx)
        /*
         * Two shapes of refusal are honest: a throw, and an empty answer that
         * says nothing about anybody. `crm_history` returns {total: 0} for a
         * person outside the caller's scope rather than throwing, and that is
         * a refusal too -- as long as it carries no rows.
         */
        const text = JSON.stringify(out ?? {})
        // Built from a string rather than written as a literal: the repository
        // bans Cyrillic outside string literals, and one of the shapes worth
        // refusing is a person's own words coming back in the answer.
        const LEAK = new RegExp(
          ['900000001', '@', 'last_words', 'dialog', 'zep_context'].join('|')
        )
        refused = !LEAK.test(text) && text.length < 400
        message = text
      } catch (error) {
        refused = true
        message = error instanceof Error ? error.message : String(error)
      }

      expect(
        refused,
        `${(tool as { name: string }).name} answered a stranger with: ${message}`
      ).toBe(true)
      expect(
        touched,
        `${(tool as { name: string }).name} queried the database before refusing`
      ).toBe(0)
    }
  )
})

describe('the same tools, asked by the owner', () => {
  it('get past the identity gate and fail on the database instead', async () => {
    // Not a functional test of the tools: proof that the refusal above is about
    // WHO asked, not about the arguments or a broken registry. The owner gets
    // through the gate and then meets the hostile pool.
    const owned = named.filter(n =>
      ['crm_leads', 'crm_summary'].includes(n.tool.name)
    )
    expect(owned.length).toBe(2)
    for (const { tool } of owned) {
      touched = 0
      await expect(
        (
          tool as { handler: (a: unknown, c: unknown) => Promise<unknown> }
        ).handler(ARGS[(tool as { name: string }).name] ?? {}, {
          telegramId: OWNER,
          pool: hostilePool as never,
        } as never)
      ).rejects.toThrow()
      expect(
        touched,
        `${(tool as { name: string }).name} never reached the database as the owner`
      ).toBeGreaterThan(0)
    }
  })
})
