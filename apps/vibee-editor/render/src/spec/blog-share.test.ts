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
let profileShows = true
let n = 0
const typed: string[] = []
const hrefs = new Map<string, number>()
const waits: number[] = []
const opened: string[] = []

vi.mock('../browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'cdp' }),
  /* deskMayAct asks before every press (desk-page.ts): nobody drives here. */
  personHasTheWheel: () => false,
}))
vi.mock('../browser/routes', () => ({ startBrowserAsAgent: async () => true }))
/* The real reducers (login-use.ts judges with them), no pod. */
vi.mock('../browser/logins', async importOriginal => ({
  ...(await importOriginal<typeof import('../browser/logins')>()),
  loginsOfPerson: async () => null,
  readMarks: async () => [],
}))
vi.mock('../agent/reach-log', () => ({ noteShape: async () => undefined }))
/* What Reddit says about the community: no network from a test. */
let community = 'unknown'
vi.mock('../agent/reddit-wiring', async importOriginal => ({
  ...(await importOriginal<typeof import('../agent/reddit-wiring')>()),
  communityStateFor: () => async () => community,
}))
vi.mock('../browser/cdp', () => ({
  newPage: async (_c: string, url: string) => {
    opened.push(url)
    return { id: `p${++n}`, url }
  },
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.href') {
      const k = (hrefs.get(id) ?? 0) + 1
      hrefs.set(id, k)
      return k > 1 ? `https://after/${id}` : `https://form/${id}`
    }
    if (expr.includes('AppTabBar_Profile_Link')) return 'https://x.com/owner'
    /* X's composer holds what was typed (blog-share.ts composerHolds). */
    if (expr.includes('tweetTextarea_')) return [...typed]
    if (expr === 'document.body ? document.body.innerText : ""')
      return profileShows ? 'Feed\nOpen FPGA Ethernet, at last' : 'Feed'
    return buttonDrawn ? { x: 1, y: 1, label: 'Post' } : null
  },
  pageUrl: async (_c: string, id: string) => `https://form/${id}`,
  clickAt: async () => undefined,
  typeText: async (_c: string, _id: string, text: string) =>
    void typed.push(text),
  closePage: async () => undefined,
}))

beforeEach(() => {
  typed.length = 0
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
  title: 'Open FPGA Ethernet, at last',
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

/** A feed, newest first; "done" was asked about already. */
const FEED = ['newest', 'b', 'a', 'done']
  .map(
    s =>
      `<item><title>T ${s}</title><link>https://t27.ai/#/blog/${s}</link>` +
      `<guid isPermaLink="false">${s}</guid><description>x</description></item>`
  )
  .join('')

/** One tick with no open question and a day gone: which article is asked about. */
async function nextQuestion(queue?: () => Promise<string>) {
  const { blogShareTick } = await import('../agent/blog-share')
  const asked: string[] = []
  const said = await blogShareTick({
    pool: {
      async query(sql: string) {
        if (sql.trim() === 'SELECT slug FROM blog_shares')
          return { rows: [{ slug: 'done' }] }
        return { rows: [] }
      },
    } as never,
    owner: '1',
    now: () => 2_000_000_000_000,
    fetchRss: async () => FEED,
    ask: async what => {
      asked.push(what)
      return 'q'
    },
    answerOf: async () => 'pending' as never,
    publish: async () => ({}),
    tell: async () => undefined,
    ...(queue ? { queue } : {}),
  })
  return { said, asked }
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

  it('a post counts only when the profile shows it', async () => {
    const { counted, unconfirmed, publishEverywhere } = await (async () => ({
      ...(await import('../agent/blog-share')),
      ...(await import('../agent/blog-share-wiring')),
    }))()
    expect(counted(true, true)).toBe(true)
    expect(counted(true, false)).toBe(false)
    expect(counted(false, true)).toBe(false)
    expect(unconfirmed(true, false)).toBe(true)
    expect(unconfirmed(true, true)).toBe(false)
    expect(unconfirmed(false, false)).toBe(false)
    /* The wiring: the same pressed pages, with and without the post on the profile. */
    const { outcomeOf } = await import('../agent/blog-share')
    const pool = { query: async () => ({ rows: [] }) } as never
    buttonDrawn = true
    profileShows = true
    expect(outcomeOf(await publishEverywhere(pool, '1', article))).toBe(
      'posted'
    )
    profileShows = false
    expect(outcomeOf(await publishEverywhere(pool, '1', article))).toBe(
      'unconfirmed'
    )
    profileShows = true
  })

  it('the profile is looked at under twenty seconds', async () => {
    const { confirmOnProfile } = await import('../agent/blog-share-wiring')
    expect(SPEC.PROFILE_SETTLE_MS).toBe(5000)
    expect(SPEC.PROFILE_LOOK_EVERY_MS).toBe(4000)
    expect(SPEC.PROFILE_LOOKS).toBe(4)
    expect(SPEC.MATCH_CHARS).toBe(60)
    /* A profile that never shows the post: the settle, then PROFILE_LOOKS - 1 looks. */
    profileShows = false
    waits.length = 0
    await confirmOnProfile('cdp', 'LinkedIn', 'open fpga ethernet at last', {
      pool: { query: async () => ({ rows: [] }) } as never,
      telegramId: '1',
    })
    expect(waits).toEqual([
      SPEC.PROFILE_SETTLE_MS,
      ...Array(SPEC.PROFILE_LOOKS - 1).fill(SPEC.PROFILE_LOOK_EVERY_MS),
    ])
    const total = waits.reduce((s, w) => s + w, 0)
    expect(total).toBe(17_000)
    expect(total < 20_000).toBe(true)
    profileShows = true
    /* The needle: the title's first MATCH_CHARS characters, normalized. */
    const { needleOf } = await import('../agent/blog-share')
    const long = { ...(article as object), title: 'A, b! '.repeat(40) } as never
    expect(needleOf(long).length <= SPEC.MATCH_CHARS).toBe(true)
    expect(needleOf(article)).toBe('open fpga ethernet at last')
  })

  it('published somewhere means a post seen on the profile, and no error', async () => {
    const { publishedSomewhere, SEEN_ON_PROFILE, NOT_SEEN_ON_PROFILE } =
      await import('../agent/blog-share')
    /* The host's words for "pressed and seen" and "thread sent and seen". */
    const PRESSED = `нажато «Post» · страница ушла с формы · ${SEEN_ON_PROFILE}` // cyrillic-ok: the words publishEverywhere writes
    const THREAD = `тред отправлен («Post all») · ${SEEN_ON_PROFILE}` // cyrillic-ok: the words publishEverywhere writes
    const MISSING = 'кнопка публикации не найдена' // cyrillic-ok: the words publishEverywhere writes
    const UNSEEN = `нажато «Post» · страница ушла с формы · ${NOT_SEEN_ON_PROFILE}` // cyrillic-ok: the words publishEverywhere writes
    expect(publishedSomewhere({ X: UNSEEN, LinkedIn: UNSEEN })).toBe(false)
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
    /* A drawn button: pressed at the first look, the after-click settle,
     * then the profile's settle (the post is there at the first look). */
    buttonDrawn = true
    expect(await waitsOfOnePage()).toEqual([
      SPEC.FIRST_SETTLE_MS,
      SPEC.AFTER_CLICK_SETTLE_MS,
      SPEC.PROFILE_SETTLE_MS,
    ])
  })

  it("the owner's queue comes first, the newest only after it", async () => {
    const { nextArticle, queueOrder } = await import('../agent/blog-share')
    const feed = ['newest', 'b', 'a'].map(
      slug => ({ ...(article as object), slug }) as never
    )
    const slugOf = (p: { article: { slug: string } } | undefined) =>
      p?.article.slug
    /* offerable: the feed carries it and nobody was asked about it. */
    expect(slugOf(nextArticle(feed, new Set(), ['a']))).toBe('a')
    expect(slugOf(nextArticle(feed, new Set(['a']), ['a', 'b']))).toBe('b')
    expect(slugOf(nextArticle(feed, new Set(), ['gone', 'b']))).toBe('b')
    /* newest_goes_next: only when no queued article is offerable. */
    expect(nextArticle(feed, new Set(['a', 'b']), ['a', 'b'])).toEqual({
      article: feed[0],
      queued: false,
    })
    expect(nextArticle(feed, new Set(), ['b'])?.queued).toBe(true)
    expect(nextArticle(feed, new Set(['newest', 'a', 'b']), ['a'])).toBe(
      undefined
    )
    /* The order is the owner's text: first mention first, a slug only whole. */
    expect(queueOrder('1 b; 2 a; then b again', ['newest', 'b', 'a'])).toEqual([
      'b',
      'a',
    ])
    expect(queueOrder('1 a-longer; 2 b', ['a', 'b'])).toEqual(['b'])
    expect(queueOrder('', ['a', 'b'])).toEqual([])
    /* The tick: the queue first, and the log says which order it used. */
    expect((await nextQuestion()).said).toBe('asked about newest')
    const queued = await nextQuestion(async () => '1 done; 2 b; 3 a')
    expect(queued.said).toBe("asked about b (the owner's queue)")
    expect(queued.asked[0]).toContain('«T b»') // cyrillic-ok: the question's quotes
    expect((await nextQuestion(async () => '1 done')).said).toBe(
      'asked about newest'
    )
    expect(
      (
        await nextQuestion(async () => {
          throw new Error('no table')
        })
      ).said
    ).toBe('asked about newest (newest: the queue could not be read)')
  })

  it("a fresh article goes first, then the owner's queue, then the newest", async () => {
    const { nextArticle, isFresh, FRESH_MS } = await import(
      '../agent/blog-share'
    )
    expect(FRESH_MS).toBe(SPEC.FRESH_MS)
    expect(SPEC.FRESH_MS).toBe(604800000)
    /* is_fresh: the edge is included, one millisecond past it is not. */
    expect(isFresh(0)).toBe(true)
    expect(isFresh(604800000)).toBe(true)
    expect(isFresh(604800001)).toBe(false)
    const now = Date.UTC(2026, 9, 6)
    const at = (slug: string, ageMs?: number) =>
      ({
        ...(article as object),
        slug,
        ...(ageMs === undefined ? {} : { published: now - ageMs }),
      }) as never
    const slugOf = (p: { article: { slug: string } } | undefined) =>
      p?.article.slug
    /* Feed newest first: two fresh, one exactly at the edge, one past it. */
    const feed = [
      at('fresh-new', 1000),
      at('fresh-old', 2000),
      at('edge', 604800000),
      at('stale', 604800001),
      at('undated'),
    ]
    /* next_source "fresh": ahead of the queue, the newest fresh first. */
    expect(nextArticle(feed, new Set(), ['stale'], now)).toEqual({
      article: feed[0],
      queued: false,
    })
    expect(
      slugOf(nextArticle(feed, new Set(['fresh-new']), ['stale'], now))
    ).toBe('fresh-old')
    /* The boundary vector: exactly FRESH_MS old still goes first. */
    expect(
      slugOf(
        nextArticle(feed, new Set(['fresh-new', 'fresh-old']), ['stale'], now)
      )
    ).toBe('edge')
    /* next_source "queue": no fresh one left, the queue orders the rest. */
    const noFresh = new Set(['fresh-new', 'fresh-old', 'edge'])
    expect(nextArticle(feed, noFresh, ['undated', 'stale'], now)).toEqual({
      article: feed[4],
      queued: true,
    })
    /* next_source "newest": no fresh, no queued -- the newest remaining. */
    expect(nextArticle(feed, noFresh, ['gone'], now)).toEqual({
      article: feed[3],
      queued: false,
    })
    /* next_source "none". */
    expect(
      nextArticle(feed, new Set([...noFresh, 'stale', 'undated']), [], now)
    ).toBe(undefined)
  })

  it('a network switched off is neither asked about nor posted to', async () => {
    const { subredditOf, shareUrls, questionFor } = await import(
      '../agent/blog-share'
    )
    expect(subredditOf(undefined)).toBe('t27ai')
    expect(subredditOf('')).toBe('t27ai')
    expect(subredditOf('fpga')).toBe('fpga')
    expect(subredditOf('off')).toBe(null)
    expect(subredditOf(' OFF ')).toBe(null)
    expect(shareUrls(article, null).reddit).toBe(null)
    expect(shareUrls(article, 't27ai').reddit).toContain('/r/t27ai/submit')
    expect(questionFor(article, 't27ai')).toContain('r/t27ai')
    expect(questionFor(article, null)).not.toContain('r/')
    expect(questionFor(article, null)).toContain('LinkedIn')
    /* The wiring: on, Reddit's page is opened; off, it is not opened at all. */
    const pool = { query: async () => ({ rows: [] }) } as never
    const reddit = () => opened.filter(u => u.includes('reddit.com/r/'))
    buttonDrawn = true
    profileShows = true
    opened.length = 0
    const on = await (
      await import('../agent/blog-share-wiring')
    ).publishEverywhere(pool, '1', article)
    expect(reddit()).toHaveLength(1)
    expect(Object.keys(on)).toContain('Reddit')
    vi.stubEnv('BLOG_SHARE_SUBREDDIT', 'off')
    vi.resetModules()
    try {
      opened.length = 0
      const off = await (
        await import('../agent/blog-share-wiring')
      ).publishEverywhere(pool, '1', article)
      expect(reddit()).toHaveLength(0)
      /* Not reported either: the owner is told only about places it posts to. */
      expect(Object.keys(off)).not.toContain('Reddit')
      expect(opened.some(u => u.includes('linkedin.com'))).toBe(true)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('a community Reddit closed is not opened at all (r/t27ai, banned 2026-10-03)', async () => {
    const pool = { query: async () => ({ rows: [] }) } as never
    const submit = () => opened.filter(u => u.includes('reddit.com/r/'))
    buttonDrawn = true
    profileShows = true
    try {
      for (const state of ['banned', 'private'] as const) {
        community = state
        opened.length = 0
        const out = await (
          await import('../agent/blog-share-wiring')
        ).publishEverywhere(pool, '1', article)
        /* No submit page, so no unfinished form left in the browser. */
        expect(submit()).toHaveLength(0)
        expect(out.Reddit).toBe(
          `сообщество r/t27ai закрыто Reddit-ом (${state}) — ничего не открыто` // cyrillic-ok: the words publishEverywhere writes
        )
        /* The other networks still get their turn. */
        expect(opened.some(u => u.includes('linkedin.com'))).toBe(true)
      }
      /* Reddit's answer unknown (its filter blocks the server): as before. */
      community = 'unknown'
      opened.length = 0
      const out = await (
        await import('../agent/blog-share-wiring')
      ).publishEverywhere(pool, '1', article)
      expect(submit()).toHaveLength(1)
      /* The press names its community, for the Reddit desk to read. */
      expect(out.Reddit).toMatch(/· r\/t27ai$/)
    } finally {
      community = 'unknown'
    }
  })

  it('an article the Reddit desk already offered there is not opened again', async () => {
    const pool = {
      query: async (sql: string, params: unknown[] = []) =>
        sql.includes('FROM reddit_acts') && params[0] === 't27ai/s'
          ? { rows: [{ '?column?': 1 }] }
          : { rows: [] },
    } as never
    opened.length = 0
    const out = await (
      await import('../agent/blog-share-wiring')
    ).publishEverywhere(pool, '1', article)
    expect(opened.filter(u => u.includes('reddit.com/r/'))).toHaveLength(0)
    expect(out.Reddit).toContain('Reddit-столом')
  })

  it('a finished release of ours is asked about at once, and still needs a yes', async () => {
    const share = await import('../agent/blog-share')
    const { releaseOfferable: ro, mayAskRelease, releaseFirst } = share
    /* The spec's vectors, against the host. */
    expect(ro(true, false, false, true, 0, false, true)).toBe(true)
    expect(ro(true, false, false, true, 259200000, false, true)).toBe(true)
    expect(ro(true, false, false, true, 259200001, false, true)).toBe(false)
    expect(ro(false, false, false, true, 0, false, true)).toBe(false)
    expect(ro(true, true, false, true, 0, false, true)).toBe(false)
    expect(ro(true, false, true, true, 0, false, true)).toBe(false)
    expect(ro(true, false, false, false, 0, false, true)).toBe(false)
    expect(ro(true, false, false, true, 0, true, true)).toBe(false)
    expect(ro(true, false, false, true, 0, false, false)).toBe(false)
    expect(mayAskRelease(false)).toBe(true)
    expect(mayAskRelease(true)).toBe(false)
    expect(releaseFirst(1)).toBe(true)
    expect(releaseFirst(0)).toBe(false)
    expect(SPEC.RELEASE_FRESH_MS < SPEC.ASK_EVERY_MS * 4).toBe(true)
    expect(share.posts('pending')).toBe(false)

    /* GitHub's list, newest first, as gHashTag/t27 had it on 2026-10-09. */
    const now = Date.UTC(2026, 9, 9, 12)
    const rel = (tag: string, ageMs: number, assets: string[] = []) => ({
      tag_name: tag,
      name: tag,
      body: "## What's Changed\n* one\n* two",
      html_url: `https://github.com/gHashTag/t27/releases/tag/${tag}`,
      draft: false,
      prerelease: false,
      published_at: new Date(now - ageMs).toISOString(),
      assets: assets.map(name => ({ name })),
    })
    const list = [
      rel('t27c-v0.5.2', 1000),
      rel('t27c-v0.5.1', 3_600_000),
      rel('t27b-v0.1.0', 7_200_000, ['t27b-0.1.0-aarch64-linux']),
      rel('fpga-bitstreams-2026-08-29', 0),
    ]
    const crates = new Set(['t27c-v0.5.1'])
    const done = async (r: { tag_name: string; assets: unknown[] }) =>
      r.tag_name.startsWith('t27b')
        ? r.assets.length > 0
        : crates.has(r.tag_name)
    const next = (asked: string[]) =>
      share.nextRelease(list, new Set(asked), now, done as never)
    /* 0.5.2's crate is not out yet: 0.5.1 is history all the same. */
    expect((await next([]))?.slug).toBe('release-t27b-v0-1-0')
    crates.add('t27c-v0.5.2')
    const a = await next([])
    expect(a).toMatchObject({
      slug: 'release-t27c-v0-5-2',
      title: 't27c 0.5.2 released',
      link: 'https://github.com/gHashTag/t27/releases/tag/t27c-v0.5.2',
      summary: '2 changes since the previous release.',
      kind: 'release',
    })
    expect((await next(['release-t27c-v0-5-2']))?.slug).toBe(
      'release-t27b-v0-1-0'
    )
    expect(await next(['release-t27c-v0-5-2', 'release-t27b-v0-1-0'])).toBe(
      undefined
    )
    /* A pipeline that cannot be read is not finished. */
    expect(
      await share.nextRelease(list, new Set(), now, async () => {
        throw new Error('registry down')
      })
    ).toBe(undefined)
    expect(
      share.releaseSummary({
        ...list[1],
        name: 't27c v0.5.1 — device DNA is named on every die',
      })
    ).toBe('device DNA is named on every die')

    /* The tick: an article was asked about a second ago, the release still goes. */
    const tick = async (
      opts: { open?: boolean; releases?: boolean; listFails?: boolean } = {}
    ) => {
      const asked: string[] = []
      const rows: unknown[][] = []
      const said = await share.blogShareTick({
        pool: {
          async query(sql: string, params: unknown[] = []) {
            if (sql.includes("WHERE state = 'asked'"))
              return opts.open
                ? {
                    rows: [
                      {
                        slug: 'a',
                        approval_id: 'q',
                        detail: article,
                        asked_ms: now,
                      },
                    ],
                  }
                : { rows: [] }
            if (sql.includes('max(asked_at)'))
              return { rows: [{ at: now - 1000 }] }
            if (sql.trim().startsWith('INSERT')) rows.push(params)
            return { rows: [] }
          },
        } as never,
        owner: '1',
        now: () => now,
        fetchRss: async () => FEED,
        ask: async what => {
          asked.push(what)
          return 'q'
        },
        answerOf: async () => 'pending' as never,
        publish: async () => {
          throw new Error('nothing is posted without a yes')
        },
        tell: async () => undefined,
        ...(opts.releases === false
          ? {}
          : {
              releases: {
                list: async () => {
                  if (opts.listFails) throw new Error('rate limited')
                  return list as never
                },
                done: done as never,
              },
            }),
      })
      return { said, asked, rows }
    }
    const t = await tick()
    expect(t.said).toBe('asked about release-t27c-v0-5-2 (a release)')
    expect(t.asked).toHaveLength(1)
    expect(t.asked[0]).toContain('Опубликовать релиз') // cyrillic-ok: the question's words
    expect(t.asked[0]).toContain('«t27c 0.5.2 released»') // cyrillic-ok: the question's quotes
    expect(t.rows[0]?.[0]).toBe('release-t27c-v0-5-2')
    /* One open question at a time: nothing else is asked while it waits. */
    expect((await tick({ open: true })).said).toMatch(/^waiting/)
    /* No release source, or an unreadable one: the pace holds, as before v5. */
    expect((await tick({ releases: false })).said).toBe('asked today already')
    expect((await tick({ listFails: true })).said).toBe('asked today already')

    /* The wiring: the registry ends t27c's pipeline, assets end t27b's. */
    const { releaseFinished, blogTitleOf } = await import(
      '../agent/blog-share-wiring'
    )
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      return { ok: url.endsWith('/t27c/0.5.2') } as Response
    })
    try {
      expect(await releaseFinished(list[0] as never)).toBe(true)
      expect(await releaseFinished(list[1] as never)).toBe(false)
      expect(fetched[0]).toBe('https://crates.io/api/v1/crates/t27c/0.5.2')
      expect(await releaseFinished(list[2] as never)).toBe(true)
      expect(await releaseFinished(list[3] as never)).toBe(false)
      expect(fetched).toHaveLength(2)
      /* The card names the release without reading the blog's feed. */
      expect(await blogTitleOf('release-t27c-v0-5-2')).toBe(
        't27c 0.5.2 released'
      )
      expect(fetched).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('the desk is live, and its posts were seen on the profile', () => {
    expect(SPEC.RUN_LIVE).toBe(true)
    expect(SPEC.VERSION).toBe(5)
  })
})
