/**
 * THE HOUSE'S CALL STAYS HOME (owner, 2026-10-03; crm-story-reel v22).
 *
 * "Why does it put my call on the client's reel, not hers?" A reel the CRM
 * made FOR A CLIENT from the hook template ended on the house call and the
 * house bot's button, over the client's own approved call: the press took
 * `cta || template.call` and `button || template.button`.
 *
 * The stopgap of #3553 kept the template on the seller's own reel by
 * refusing a client's press. v22 supersedes that refusal: the template is
 * open to a client, and what stays home is the house's MARK -- its call, its
 * button, its spoken last line. What must hold:
 *   1. a client's template press starts, and no call in it names the house:
 *      no house call in the row, no house button in the card, the last line
 *      ends with her call (here the default: she has no profile call). The
 *      hook lines are the template's story and stay; the body is not refused;
 *   2. the client's ready answer lists the template ending with her call,
 *      with no house button, so the panel draws hers;
 *   3. the seller's own reel still takes the template with the house call
 *      and the house button, and the row keeps that button (the own-reel end
 *      card the engine used to drop before it reached the video).
 */
import { describe, it, expect } from 'vitest'
import { makeCrmStoryTool } from './crm-story-tool'
import { namesHouse, templateOf } from './story-reel-templates'
import { STORY_DEFAULT_CTA, type StoryDeps } from './story-template'
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

/** Every dependency that can spend, as a spy. */
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
  const tool = makeCrmStoryTool({
    deps: () => deps,
    lookup: name => ({
      name,
      description: '',
      parameters: {},
      handler: async () => {
        calls.push({ name, args: [] })
        return { url: FACE }
      },
    }),
  })
  const ctx = { telegramId: SELLER, pool: base.pool } as unknown as ToolContext
  return { tool, ctx, base, calls }
}

const settle = () => new Promise(r => setTimeout(r, 0))
async function drain() {
  for (let i = 0; i < 10; i++) await settle()
}

const card = (job: Record<string, unknown>) =>
  job.end_card == null ? null : JSON.parse(String(job.end_card))

describe("the house's call stays on the seller own reel (v22)", () => {
  it("a client's template press starts with her call, and nothing in it names the house", async () => {
    const { tool, ctx, base } = press()
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
    expect(r.started).toBe(true)
    expect(r).not.toHaveProperty('house_replaced')
    expect(base.jobs).toHaveLength(1)
    const job = base.jobs[0]
    expect(job.lead_id).toBe(LEAD)
    // No house call in the row: an empty one is read from her profile at the run.
    expect(namesHouse(job.cta)).toBe(false)
    expect(card(job)?.button ?? '').toBe('')
    const ru = templateOf(SPEC.TEMPLATE_HOOK_STUDIO, 'ru')!
    const lines = JSON.parse(String(job.scenes)).map((s: any) => s.line)
    // The template's own story stays (TEMPLATE_LINES_KEPT); the call slot is hers.
    expect(lines.slice(0, SPEC.TEMPLATE_LINES_KEPT)).toEqual(
      ru.lines.slice(0, SPEC.TEMPLATE_LINES_KEPT)
    )
    // Only the call slot is hers: the hook is the template's story, not a
    // call, and the body is not refused (the split-reel lesson, t27#5785).
    expect(lines.at(-1)).toBe(`${ru.lead} ${STORY_DEFAULT_CTA}.`)
    expect(namesHouse(lines.at(-1))).toBe(false)
  })

  it("the client's ready answer lists the template with her call and no house button", async () => {
    const { tool, ctx } = press()
    const r: any = await tool.handler({ lead: LEAD }, ctx)
    expect(r.ready).toBe(true)
    expect(r.cta).toBe(STORY_DEFAULT_CTA)
    expect(r.templates.length).toBeGreaterThan(0)
    for (const t of r.templates) {
      expect(t.button).toBe('')
      expect(namesHouse(t.call)).toBe(false)
      expect(namesHouse(t.lines.at(-1))).toBe(false)
    }
    const ru = r.templates.find((t: any) => t.language === 'ru')
    expect(ru.call).toBe(STORY_DEFAULT_CTA)
    expect(ru.lines.at(-1)).toBe(`${ru.lead} ${STORY_DEFAULT_CTA}.`)
  })

  it('the seller own reel still lists the template and presses it with the house call and button', async () => {
    const listed = press()
    const ready: any = await listed.tool.handler({ lead: SELLER }, listed.ctx)
    expect(ready.ready).toBe(true)
    expect(
      ready.templates.map((t: any) => `${t.id}/${t.language}`).sort()
    ).toEqual([
      `${SPEC.TEMPLATE_HOOK_STUDIO}/en`,
      `${SPEC.TEMPLATE_HOOK_STUDIO}/ru`,
    ])
    for (const t of ready.templates) expect(t.button).toBe(SPEC.TEMPLATE_BUTTON)

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
    expect(card(job)?.button).toBe(SPEC.TEMPLATE_BUTTON)
    expect(JSON.parse(String(job.scenes)).map((s: any) => s.line)).toEqual(
      templateOf(SPEC.TEMPLATE_HOOK_STUDIO, 'en')!.lines
    )
  })
})
