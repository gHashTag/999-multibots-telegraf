/**
 * THE HOUSE TEMPLATE STAYS HOME (owner, 2026-10-03; a stopgap until
 * crm-story-reel v22).
 *
 * "Why does it put my call on the client's reel, not hers?" A reel the CRM
 * made FOR A CLIENT from the hook template ended on the house call and the
 * house bot's button, over the client's own approved call: the press took
 * `cta || template.call` and `button || template.button`.
 *
 * What must hold:
 *   1. a template named for a client is refused before anything is spent:
 *      no face, no voice, no render, no charge, no row -- her settings are
 *      not even read;
 *   2. the client's ready answer offers no template, so the panel draws none;
 *   3. the seller's own reel still takes the template with its house call
 *      and still lists it: the guard is not a blanket ban.
 */
import { describe, it, expect } from 'vitest'
import { HOUSE_TEMPLATE_STAYS_HOME, makeCrmStoryTool } from './crm-story-tool'
import { templateOf } from './story-reel-templates'
import type { StoryDeps } from './story-template'
import type { ToolContext } from './tools'
import * as SPEC from '../spec/crm-story-reel.gen'

type Call = { name: string; args: unknown[] }

const SELLER = '900000001'
const LEAD = '900000077'
const FACE = 'https://ours/lead-avatar.jpg'

/** A base that answers the statements the tool sends, and keeps every one. */
function fakeBase() {
  const seen: string[] = []
  const jobs: Record<string, unknown>[] = []
  const query = async (sql: string, p: any[] = []) => {
    const q = sql.replace(/\s+/g, ' ').trim()
    seen.push(q)
    // The seller gate reads the caller's own Telegram session.
    if (q.startsWith('SELECT session FROM tg_sessions'))
      return { rows: p[0] === SELLER ? [{ session: 'connected' }] : [] }
    // A face and a clone for anyone in this seller's CRM, himself included.
    if (q.startsWith('SELECT first_name, avatar_url FROM crm_people'))
      return {
        rows: p[0] === SELLER ? [{ first_name: 'Lena', avatar_url: FACE }] : [],
      }
    if (q.startsWith('SELECT lead_id, voice_id, seconds FROM lead_voices'))
      return {
        rows:
          p[0] === SELLER
            ? [{ lead_id: p[1], voice_id: 'voice-1', seconds: 21 }]
            : [],
      }
    if (q.startsWith('SELECT owner_id FROM lead_voices'))
      return { rows: [{ owner_id: SELLER }] }
    if (q.startsWith('INSERT INTO story_jobs')) {
      // Values by the statement's own column list.
      const cols = /\(([^)]*)\)\s*VALUES/
        .exec(q)![1]
        .split(',')
        .map(c => c.trim())
      jobs.push(Object.fromEntries(cols.map((c, i) => [c, p[i]])))
      return { rows: [{ id: jobs.length }] }
    }
    // Nothing else is known: no profile, no kept face or palette, no group,
    // no running job -- and no job to run, so a press ends at its row.
    return { rows: [] }
  }
  return { pool: { query }, seen, jobs }
}

/** Every dependency that can spend, as a spy; the press must reach none. */
function fakeDeps(pool: StoryDeps['pool']) {
  const calls: Call[] = []
  const spy =
    <T>(name: string, answer: T) =>
    async (...args: unknown[]) => {
      calls.push({ name, args })
      return answer
    }
  const deps: StoryDeps = {
    pool,
    write: spy('write', '{}'),
    story: spy('story', { done: true, url: 'https://ours/reel.mp4' }),
    notify: spy('notify', true),
    botOf: spy('botOf', 'example_bot'),
    offerCard: spy('offerCard', 'sent' as never),
    voiceNotes: spy('voiceNotes', { why: 'none here' }),
    generationsLeft: spy('generationsLeft', 100),
    refundStill: spy('refundStill', undefined),
    beat: () => () => undefined,
    me: 'runner-a',
  }
  return { deps, calls }
}

function press() {
  const base = fakeBase()
  const { deps, calls } = fakeDeps(base.pool as never)
  const looked: string[] = []
  const tool = makeCrmStoryTool({
    deps: () => deps,
    lookup: name => {
      looked.push(name)
      return {
        name,
        description: '',
        parameters: {},
        handler: async () => {
          calls.push({ name, args: [] })
          return { url: FACE }
        },
      }
    },
  })
  const ctx = { telegramId: SELLER, pool: base.pool } as unknown as ToolContext
  return { tool, ctx, base, calls, looked }
}

const settle = () => new Promise(r => setTimeout(r, 0))
async function drain() {
  for (let i = 0; i < 10; i++) await settle()
}

const isWrite = (q: string) => /^(INSERT|UPDATE|DELETE)\b/i.test(q)

describe('the house template stays on the seller own reel (until v22)', () => {
  it("a client's template press is refused, and nothing is spent", async () => {
    const { tool, ctx, base, calls, looked } = press()
    const r: any = await tool.handler(
      {
        lead: LEAD,
        start: true,
        template: SPEC.TEMPLATE_HOOK_STUDIO,
        language: 'ru',
      },
      ctx
    )
    await drain()
    expect(r.started).toBe(false)
    expect(r.why).toBe(HOUSE_TEMPLATE_STAYS_HOME)
    expect(r.why).toContain(SPEC.TEMPLATE_BUTTON)
    expect(r.why).toContain('topic')
    expect(calls, 'no face, voice, render, charge or message').toEqual([])
    expect(looked, 'the face tool is not even looked up').toEqual([])
    expect(base.jobs, 'no job row').toEqual([])
    expect(base.seen.filter(isWrite), 'nothing written').toEqual([])
    expect(
      base.seen.filter(q => /crm_people|lead_voices|story_/.test(q)),
      'her settings are not even read'
    ).toEqual([])
  })

  it("the client's ready answer offers no template", async () => {
    const { tool, ctx } = press()
    const r: any = await tool.handler({ lead: LEAD }, ctx)
    expect(r.ready).toBe(true)
    expect(r.cta).toBeTruthy()
    expect(r).not.toHaveProperty('templates')
  })

  it('the seller own reel still lists the template and presses it with the house call', async () => {
    const listed = press()
    const ready: any = await listed.tool.handler({ lead: SELLER }, listed.ctx)
    expect(ready.ready).toBe(true)
    expect(
      ready.templates.map((t: any) => `${t.id}/${t.language}`).sort()
    ).toEqual([
      `${SPEC.TEMPLATE_HOOK_STUDIO}/en`,
      `${SPEC.TEMPLATE_HOOK_STUDIO}/ru`,
    ])

    const { tool, ctx, base } = press()
    const r: any = await tool.handler(
      {
        lead: SELLER,
        start: true,
        template: SPEC.TEMPLATE_HOOK_STUDIO,
        language: 'en',
      },
      ctx
    )
    await drain()
    expect(r.started).toBe(true)
    expect(base.jobs).toHaveLength(1)
    const job = base.jobs[0]
    expect(job.lead_id).toBe(SELLER)
    expect(job.cta).toBe(SPEC.TEMPLATE_CALL_EN)
    expect(JSON.parse(String(job.scenes)).map((s: any) => s.line)).toEqual(
      templateOf(SPEC.TEMPLATE_HOOK_STUDIO, 'en')!.lines
    )
  })
})
