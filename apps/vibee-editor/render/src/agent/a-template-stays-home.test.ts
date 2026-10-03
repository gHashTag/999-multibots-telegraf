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
 * open to a client, told in its CLIENT VERSION, and what stays home is every
 * name of the house -- its call, its button, and every spoken line. The
 * first v22 kept the template's first three lines as written, so a client's
 * reel said "This is Trinity" in HER voice and captioned it (reviewer bee,
 * t27#5811 / #3563). What must hold:
 *   1. a client's template press starts, in Russian and in English, and no
 *      line, call or button of it names the house by any of its marks; the
 *      last line ends with her call (here the default: no profile call);
 *   2. the client's ready answer lists only the client versions, so the
 *      panel draws no house line either;
 *   3. a line the seller or the agent wrote naming the house is refused
 *      before anything is spent -- the first line as much as the last, with
 *      a template or a script of his own; only what the person typed this
 *      turn may name it;
 *   4. the seller's own reel still takes the template with the house call
 *      and the house button, and the row keeps that button (the own-reel end
 *      card the engine used to drop before it reached the video).
 */
import { describe, it, expect } from 'vitest'
import { makeCrmStoryTool } from './crm-story-tool'
import { templateOf } from './story-reel-templates'
import { STORY_DEFAULT_CTA, type StoryDeps } from './story-template'
import type { ToolContext } from './tools'
import * as SPEC from '../spec/crm-story-reel.gen'

type Call = { name: string; args: unknown[] }

/**
 * The house's names, written here by hand rather than read from the shared
 * detector, so a detector that forgets one cannot pass its own test.
 */
const HOUSE_WORDS: readonly RegExp[] = [
  /trinity/i,
  /тринити/i, // cyrillic-ok: the brand as the voice speaks it
  /t27ai_bot/i,
  /@t27ai_bot/i,
  /\bT27\b/i,
]
const houseIn = (text: unknown) =>
  HOUSE_WORDS.filter(w => w.test(String(text ?? ''))).map(String)
/** Everything that spends: a written script, the reel, the day's count. */
const SPENDS = ['write', 'story', 'generationsLeft', 'refundStill']

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

function press(ownerSaid?: string) {
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
  const ctx = {
    telegramId: SELLER,
    pool: base.pool,
    ...(ownerSaid !== undefined ? { ownerSaid } : {}),
  } as unknown as ToolContext
  return { tool, ctx, base, calls }
}

const settle = () => new Promise(r => setTimeout(r, 0))
async function drain() {
  for (let i = 0; i < 10; i++) await settle()
}

const card = (job: Record<string, unknown>) =>
  job.end_card == null ? null : JSON.parse(String(job.end_card))

describe("the house's call stays on the seller own reel (v22)", () => {
  for (const language of ['ru', 'en'] as const)
    it(`a client's template press (${language}) starts with her call, and no line of it names the house`, async () => {
      const { tool, ctx, base } = press()
      const r: any = await tool.handler(
        {
          lead: LEAD,
          start: true,
          template: SPEC.TEMPLATE_HOOK_STUDIO,
          language,
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
      expect(houseIn(job.cta)).toEqual([])
      expect(card(job)?.button ?? '').toBe('')
      const t = templateOf(SPEC.TEMPLATE_HOOK_STUDIO, language)!
      // The template as written does name the house: the test has teeth.
      expect(houseIn(t.lines[0]).length).toBeGreaterThan(0)
      const lines: string[] = JSON.parse(String(job.scenes)).map(
        (s: any) => s.line
      )
      expect(lines).toHaveLength(t.lines.length)
      // EVERY line, the first as much as the last -- and so every caption.
      for (const line of lines) expect(houseIn(line)).toEqual([])
      expect(lines.slice(0, -1)).toEqual(t.client.slice(0, -1))
      if (language === 'ru')
        expect(lines.at(-1)).toBe(`${t.lead} ${STORY_DEFAULT_CTA}.`)
      // A call in the other language is not spoken: the lead-in alone.
      else expect(lines.at(-1)).toBe(t.lead)
    })

  it("the client's ready answer lists only the templates' client versions, no line naming the house", async () => {
    const { tool, ctx } = press()
    const r: any = await tool.handler({ lead: LEAD }, ctx)
    expect(r.ready).toBe(true)
    expect(r.cta).toBe(STORY_DEFAULT_CTA)
    expect(r.templates.map((t: any) => t.language).sort()).toEqual(['en', 'ru'])
    for (const t of r.templates) {
      expect(t.button).toBe('')
      expect(houseIn(t.call)).toEqual([])
      for (const line of t.lines) expect(houseIn(line)).toEqual([])
      const own = templateOf(t.id, t.language)!
      expect(t.lines.slice(0, -1)).toEqual(own.client.slice(0, -1))
    }
    const ru = r.templates.find((t: any) => t.language === 'ru')
    expect(ru.call).toBe(STORY_DEFAULT_CTA)
    expect(ru.lines.at(-1)).toBe(`${ru.lead} ${STORY_DEFAULT_CTA}.`)
  })

  for (const at of [0, 1, 3])
    it(`a line ${at + 1} the seller wrote naming the house is refused before anything is spent`, async () => {
      const { tool, ctx, base, calls } = press()
      const en = templateOf(SPEC.TEMPLATE_HOOK_STUDIO, 'en')!
      const scenes: unknown[] = [...en.client]
      scenes[at] = 'Say hi to @t27ai_bot today.'
      const r: any = await tool.handler(
        {
          lead: LEAD,
          start: true,
          template: SPEC.TEMPLATE_HOOK_STUDIO,
          language: 'en',
          scenes,
        },
        ctx
      )
      await drain()
      expect(r.started).toBe(false)
      expect(r.why).toContain(`${at + 1}`)
      expect(base.jobs).toHaveLength(0)
      expect(base.seen.some(q => q.startsWith('INSERT INTO story_jobs'))).toBe(
        false
      )
      expect(calls.filter(c => SPENDS.includes(c.name))).toEqual([])
    })

  it("a script of the agent's own naming the house on a client's reel is refused before anything is spent", async () => {
    const { tool, ctx, base, calls } = press()
    const r: any = await tool.handler(
      {
        lead: LEAD,
        start: true,
        scenes: [
          { line: 'My studio opens at nine.' },
          { line: 'Ask Trinity for a slot.' },
        ],
      },
      ctx
    )
    await drain()
    expect(r.started).toBe(false)
    expect(r.why).toContain('2')
    expect(base.jobs).toHaveLength(0)
    expect(calls.filter(c => SPENDS.includes(c.name))).toEqual([])
  })

  it("only the person's own words typed this turn may name the house on a client's reel", async () => {
    const said = 'Make it say: I found my AI at T27.'
    const { tool, ctx, base } = press(said)
    const r: any = await tool.handler(
      {
        lead: LEAD,
        start: true,
        scenes: [
          { line: 'My studio opens at nine.' },
          { line: 'I found my AI at T27.' },
        ],
      },
      ctx
    )
    await drain()
    expect(r.started).toBe(true)
    expect(base.jobs).toHaveLength(1)
    // What she typed with no house in it lends no house name to the agent.
    const other = press('Make it about my studio.')
    const refused: any = await other.tool.handler(
      {
        lead: LEAD,
        start: true,
        scenes: [
          { line: 'My studio opens at nine.' },
          { line: 'I found my AI at T27.' },
        ],
      },
      other.ctx
    )
    expect(refused.started).toBe(false)
    expect(other.base.jobs).toHaveLength(0)
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
