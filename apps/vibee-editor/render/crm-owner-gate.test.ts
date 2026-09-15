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
 * It is also a mutation canary. Flip `requireOwner` to `requireIdentity` in
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
import { makeCrmDeliverTools } from './src/agent/crm-deliver-tool'

/*
 * SIX SETS, AND crm_deliver_photo WAS THE ONE THAT WAS MISSING.
 *
 * This file calls itself the proof that every CRM tool refuses a stranger,
 * and it listed five registries by hand. crm_deliver_photo is not in any of
 * them -- it is built by a factory and pushed into the registry from
 * tools.ts -- so the one tool that sends a picture to somebody's DM and
 * charges the RECIPIENT was outside the canary entirely. The drift left a
 * fingerprint: ARGS still carried an entry for it, written and never once
 * executed, naming a parameter the tool does not have.
 *
 * The factory gets a lookup that finds nothing, which is enough: the refusal
 * happens on the first line, long before any generator is asked for.
 */
const REGISTRIES = {
  CRM_TOOLS,
  CRM_MEMORY_TOOLS,
  CRM_SUMMARY_TOOLS,
  CRM_TOUCH_TOOLS,
  CRM_OFFER_TOOLS,
  CRM_DELIVER_TOOLS: makeCrmDeliverTools(() => undefined),
}

/** Any query at all is a failure of the gate, so the pool says so out loud. */
let touched = 0
const hostilePool = {
  query: async () => {
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
  /*
   * `chat`, not `telegram_id`, for both of these -- and that one word is the
   * difference between a canary and a decoration.
   *
   * With `telegram_id`, removing requireOwner from crm_offer sent the handler
   * down the "not the bot surface" branch, which answers with a short object
   * that leaks nothing. The leak detector saw nothing, the pool was never
   * touched, and all thirteen cases stayed green over a tool that had just
   * lost its guard. Traced by hand and confirmed by mutation.
   */
  crm_offer: { chat: '900000001', tokens: 100 },
  crm_deliver_photo: { chat: '900000001', prompt: 'x' },
  crm_ingest_chats: { limit: 5, depth: 5 },
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

  /*
   * THE CANARY SAYS WHEN IT STOPS COVERING SOMETHING.
   *
   * Both ways this file went blind were silent. A tool appeared through a
   * factory and was simply not in the list; an ARGS key was written for a
   * parameter that does not exist and never ran. Neither made anything red,
   * and the file went on calling itself proof.
   *
   * So the list and the arguments now have to agree with each other, and a
   * disagreement fails here rather than quietly narrowing what is checked.
   */
  it('covers every crm_ tool, and names no tool that does not exist', () => {
    const inRegistries = named.map(n => n.tool.name).sort()
    const inArgs = Object.keys(ARGS).sort()
    const missing = inArgs.filter(a => !inRegistries.includes(a))
    expect(
      missing,
      'ARGS names tools that are in no registry -- either dead entries or a ' +
        'registry this file forgot'
    ).toEqual([])
    /*
     * Only tools that REQUIRE something need an entry. A tool with no
     * required parameters cannot refuse on validation, so calling it with {}
     * still proves what this file is for. crm_overview, crm_hot_leads and
     * crm_winback are those, and demanding entries for them was the first
     * version of this check being too strict -- a guard that cries about
     * correct code gets deleted, and then it guards nothing.
     */
    const unarmed = named
      .filter(n => {
        const req = (n.tool as { parameters?: { required?: unknown } })
          .parameters?.required
        const keys = Array.isArray(req) ? (req as string[]) : []
        if (!keys.length) return false
        const given = ARGS[n.tool.name] ?? {}
        return keys.some(k => !(k in given))
      })
      .map(n => n.tool.name)
    expect(
      unarmed,
      'these tools require a parameter this file does not pass, so they may ' +
        'refuse on validation rather than on identity -- which proves nothing'
    ).toEqual([])
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
