import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './blog-share.gen'

/**
 * THE BLOG DESK IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/blog-share.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: the pure rules of src/agent/blog-share.ts, one tick of its desk with
 * a fake pool, and publishEverywhere of src/agent/blog-share-wiring.ts against
 * a fake browser whose every wait is recorded. The tick interval itself is
 * imported by render-server.ts (TICK_MS); the end-to-end behaviour lives in
 * the-blog-is-shared-only-after-a-yes.test.ts and blog-share-wiring-path.test.ts.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/blog-share
 */

let buttonDrawn = true
let n = 0
const hrefs = new Map<string, number>()
const waits: number[] = []

vi.mock('../browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'cdp' }),
}))
vi.mock('../browser/routes', () => ({ startBrowserAsAgent: async () => true }))
vi.mock('../browser/logins', () => ({ loginsOfPerson: async () => null }))
vi.mock('../agent/reach-log', () => ({ noteShape: async () => undefined }))
vi.mock('../browser/cdp', () => ({
  newPage: async (_c: string, url: string) => ({ id: `p${++n}`, url }),
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.href') {
      const k = (hrefs.get(id) ?? 0) + 1
      hrefs.set(id, k)
      return k > 1 ? `https://after/${id}` : `https://form/${id}`
    }
    return buttonDrawn ? { x: 1, y: 1, label: 'Post' } : null
  },
  clickAt: async () => undefined,
  typeText: async () => undefined,
  closePage: async () => undefined,
}))

beforeEach(() => {
  hrefs.clear()
  waits.length = 0
  n = 0
  vi.stubGlobal('setTimeout', (f: () => void, ms: number) => {
    waits.push(ms)
    f()
    return 0
  })
})

const article = {
  slug: 's',
  title: 'T',
  link: 'https://t27.ai/blog/s',
  summary: 'x',
} as never

/** The waits of the first share page, after X's thread composer gave up. */
async function waitsOfOnePage(): Promise<number[]> {
  const { publishEverywhere } = await import('../agent/blog-share-wiring')
  waits.length = 0
  hrefs.clear()
  await publishEverywhere(
    { query: async () => ({ rows: [] }) } as never,
    '1',
    article
  )
  /* The thread composer settles 8000 first and throws (no box found when the
   * button is not drawn; when it is, it finishes and X is skipped) -- so the
   * first page of the loop starts at the first FIRST_SETTLE_MS. */
  const start = waits.indexOf(SPEC.FIRST_SETTLE_MS)
  const next = waits.indexOf(SPEC.FIRST_SETTLE_MS, start + 1)
  return waits.slice(start, next < 0 ? undefined : next)
}

/** One tick of the desk over a single open question with the given answer. */
async function tickWith(answer: string, ageMs: number) {
  const { blogShareTick } = await import('../agent/blog-share')
  const told: string[] = []
  const updates: string[] = []
  const now = 2_000_000_000_000
  const said = await blogShareTick({
    pool: {
      async query(sql: string) {
        if (sql.includes("WHERE state = 'asked'"))
          return {
            rows: [
              {
                slug: 'a',
                approval_id: 'q',
                detail: article,
                asked_ms: now - ageMs,
              },
            ],
          }
        if (sql.trim().startsWith('UPDATE')) updates.push(sql)
        return { rows: [] }
      },
    } as never,
    owner: '1',
    now: () => now,
    fetchRss: async () => '',
    ask: async () => 'q',
    answerOf: async () => answer as never,
    publish: async () => ({ X: 'x' }),
    tell: async t => void told.push(t),
  })
  return { said, told, updates }
}

describe('spec automation/blog-share against the host', () => {
  it("an open question is waited on for the approval's lifetime, then let go", async () => {
    const { stillWaiting, ANSWER_WAIT_MS } = await import('../agent/blog-share')
    expect(stillWaiting('pending', 0)).toBe(true)
    expect(stillWaiting('pending', 86_399_999)).toBe(true)
    expect(stillWaiting('pending', 86_400_000)).toBe(false)
    expect(stillWaiting('allowed', 0)).toBe(false)
    expect(stillWaiting('expired', 0)).toBe(false)
    expect(ANSWER_WAIT_MS).toBe(SPEC.ANSWER_WAIT_MS)
    expect(SPEC.ANSWER_WAIT_MS).toBe(86_400_000)
    /* The wiring asks with this lifetime: requestPermission(..., ANSWER_WAIT_MS). */
    expect((await tickWith('pending', 1000)).said).toMatch(/^waiting/)
    expect((await tickWith('pending', SPEC.ANSWER_WAIT_MS)).said).toMatch(
      /not posted/
    )
  })

  it('one question a day at most, on a five-minute tick', async () => {
    const { mayAsk, ASK_EVERY_MS } = await import('../agent/blog-share')
    const t = 1_000_000_000_000
    expect(mayAsk(0, t)).toBe(true)
    expect(mayAsk(t, t + 71_999_999)).toBe(false)
    expect(mayAsk(t, t + 72_000_000)).toBe(true)
    expect(ASK_EVERY_MS).toBe(SPEC.ASK_EVERY_MS)
    expect(SPEC.ASK_EVERY_MS < SPEC.ANSWER_WAIT_MS + SPEC.TICK_MS).toBe(true)
    expect(SPEC.TICK_MS).toBe(300_000)
    expect(SPEC.TICK_MS < SPEC.ASK_EVERY_MS).toBe(true)
  })

  it('nothing is posted without a yes', async () => {
    const { posts } = await import('../agent/blog-share')
    expect(posts('allowed')).toBe(true)
    expect(posts('denied')).toBe(false)
    expect(posts('expired')).toBe(false)
    expect(posts('pending')).toBe(false)
    expect(SPEC.ASK_NEEDS_YES).toBe(true)
    for (const a of ['denied', 'expired']) {
      const { said } = await tickWith(a, SPEC.ANSWER_WAIT_MS)
      expect(said).toBe(`a: ${a}, not posted`)
    }
  })

  it('a decline is real only if the approval was decided', async () => {
    const { declineIsReal } = await import('../agent/blog-share')
    expect(declineIsReal('denied')).toBe(true)
    expect(declineIsReal('expired')).toBe(false)
    expect(declineIsReal('pending')).toBe(false)
    expect(declineIsReal('allowed')).toBe(false)
    /* The desk says silence aloud, and keeps quiet over a person's "no". */
    expect((await tickWith('expired', 0)).told).toHaveLength(1)
    expect((await tickWith('pending', SPEC.ANSWER_WAIT_MS)).told).toHaveLength(
      1
    )
    expect((await tickWith('denied', 0)).told).toHaveLength(0)
  })

  it('the page leaving the form is the receipt', async () => {
    const { receiptOf, LEFT_THE_FORM } = await import('../agent/blog-share')
    const left = (b: string, a: string) => receiptOf(b, a) === LEFT_THE_FORM
    expect(left('https://x.com/intent/post', 'https://x.com/home')).toBe(true)
    expect(left('https://x.com/intent/post', 'https://x.com/intent/post')).toBe(
      false
    )
    expect(left('', 'https://x.com/home')).toBe(false)
    expect(left('https://x.com/intent/post', '')).toBe(false)
  })

  it('published somewhere means a press or a thread, and no error', async () => {
    const { publishedSomewhere } = await import('../agent/blog-share')
    /* The host's words for "pressed" and "thread finished". */
    const PRESSED = 'нажато «Post»' // cyrillic-ok: the words publishEverywhere writes
    const THREAD = 'тред опубликован («Post all»)' // cyrillic-ok: the words publishEverywhere writes
    const MISSING = 'кнопка публикации не найдена' // cyrillic-ok: the words publishEverywhere writes
    expect(publishedSomewhere({ X: PRESSED })).toBe(true)
    expect(
      publishedSomewhere({
        X: THREAD,
        LinkedIn: PRESSED,
        Reddit: PRESSED,
        Threads: PRESSED,
      })
    ).toBe(true)
    expect(publishedSomewhere({ X: MISSING, LinkedIn: MISSING })).toBe(false)
    expect(publishedSomewhere({ error: 'x', X: PRESSED })).toBe(false)
  })

  it('the publish button is looked for about half a minute', async () => {
    expect(SPEC.FIRST_SETTLE_MS).toBe(6000)
    expect(SPEC.LOOK_EVERY_MS).toBe(3000)
    expect(SPEC.LOOKS).toBe(8)
    expect(SPEC.AFTER_CLICK_SETTLE_MS).toBe(5000)
    expect(SPEC.LOOKS > 1).toBe(true)
    /* A button that never draws: the first settle, then LOOKS - 1 more looks. */
    buttonDrawn = false
    const missing = await waitsOfOnePage()
    expect(missing).toEqual([
      SPEC.FIRST_SETTLE_MS,
      ...Array(SPEC.LOOKS - 1).fill(SPEC.LOOK_EVERY_MS),
    ])
    expect(missing.reduce((s, w) => s + w, 0)).toBe(27_000)
    /* A drawn button: pressed at the first look, then the after-click settle. */
    buttonDrawn = true
    expect(await waitsOfOnePage()).toEqual([
      SPEC.FIRST_SETTLE_MS,
      SPEC.AFTER_CLICK_SETTLE_MS,
    ])
  })

  it('the desk is live, a confirmed post is not yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.VERSION).toBe(1)
  })
})
