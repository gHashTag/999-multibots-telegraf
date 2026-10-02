import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './engage-desk.gen'
import {
  claimBroken,
  communityAllows,
  declineIsReal,
  inParallel,
  leadCheckDue,
  linkAllowed,
  mayDraft,
  NETWORKS,
  NO_READER,
  promoOk,
  readRules,
  voiceFrom,
  draftVerdict,
  engageTick,
  fits,
  fresh,
  hasMention,
  mayPropose,
  parsePageItems,
  parseRedditSearch,
  postsOnlyOnYes,
  receiptSeen,
  relativeAgeMs,
  resetEngageForTests,
  searchDue,
  snippetOf,
  stillWaiting,
  topicsFromFeed,
  type Answer,
  type EngageDeps,
  type Found,
  type Network,
} from '../agent/engage-desk'

/**
 * THE ENGAGE DESK IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/engage-desk.t27 is the spec of record; the
 * vendored copy and its generated module are held by
 * scripts/check-t27-specs.mjs. Each `test` of the spec runs here against the
 * HOST: the pure rules of src/agent/engage-desk.ts, and its tick with a fake
 * pool, fake browser and fake approvals. The tick interval is imported by
 * render-server.ts (TICK_MS).
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/engage-desk
 */

/* ------------------------------------------------------------ fake pool -- */

interface Row {
  id: string
  network: string
  post_url: string
  comment: string
  state: string
  approval_id: string
  asked_ms: number
  done_ms?: number
  detail?: Record<string, unknown>
}

function fakePool(clock: () => number) {
  const rows: Row[] = []
  let next = 1
  const pool = {
    rows,
    async query(sql: string, p: unknown[] = []) {
      if (/^\s*CREATE TABLE/.test(sql)) return { rows: [] }
      if (/FROM engage_proposals WHERE state = 'asked'/.test(sql))
        return {
          rows: rows.filter(r => r.state === 'asked').map(r => ({ ...r })),
        }
      if (/count\(\*\)::int AS n FROM engage_proposals/.test(sql))
        return {
          rows: [
            {
              n: rows.filter(
                r => r.network === p[0] && r.asked_ms > Number(p[1])
              ).length,
            },
          ],
        }
      if (/FROM engage_proposals WHERE state = 'posted'/.test(sql))
        return {
          rows: rows
            .filter(r => r.state === 'posted')
            .map(r => ({
              ...r,
              checked_ms:
                (r.detail?.leads as { checked_ms?: number } | undefined)
                  ?.checked_ms ?? null,
            })),
        }
      if (/count\(\*\) FILTER/.test(sql)) {
        const posted = rows.filter(
          r =>
            r.network === p[0] &&
            r.state === 'posted' &&
            (r.done_ms ?? 0) > Number(p[1])
        )
        return {
          rows: [
            {
              total: posted.length,
              promo: posted.filter(r => /https?:\/\//.test(r.comment)).length,
            },
          ],
        }
      }
      if (/^\s*UPDATE engage_proposals\s+SET detail/.test(sql)) {
        const r = rows.find(x => x.id === p[0])
        if (r) r.detail = { ...r.detail, ...JSON.parse(String(p[1])) }
        return { rows: [] }
      }
      if (
        /SELECT 1 FROM engage_proposals WHERE network = \$1 AND post_url/.test(
          sql
        )
      )
        return {
          rows: rows.filter(r => r.network === p[0] && r.post_url === p[1]),
        }
      if (/^\s*INSERT INTO engage_proposals/.test(sql)) {
        if (rows.some(r => r.network === p[0] && r.post_url === p[1]))
          return { rows: [] }
        const id = String(next++)
        rows.push({
          id,
          network: String(p[0]),
          post_url: String(p[1]),
          comment: String(p[5]),
          state: 'asked',
          approval_id: String(p[6]),
          asked_ms: clock(),
        })
        return { rows: [{ id }] }
      }
      if (/^\s*UPDATE engage_proposals SET state/.test(sql)) {
        const r = rows.find(x => x.id === p[0])
        if (r) {
          r.state = String(p[1])
          r.done_ms = clock()
          if (p[2]) r.detail = { ...r.detail, ...JSON.parse(String(p[2])) }
        }
        return { rows: [] }
      }
      throw new Error(`unexpected sql: ${sql}`)
    },
  }
  return pool
}

const FEED = `<rss><channel>
<item><guid>tnn</guid><title>Ternary networks on an Artix-7</title><link>https://t27.ai/blog/tnn</link><description>trits and LUTs</description></item>
</channel></rss>`

const ON_ALL_TOPICS = 'ternary GoldenFloat posit openXC7 t27 golden ratio'

const GOOD =
  'We measured the same trade-off on a ternary network: the weights fit in two bits, and the accumulator width is what decided the area. What width did you settle on?'

function world(over: Partial<EngageDeps> = {}) {
  let now = 10 * SPEC.DAY_MS
  let last = 0
  const answers = new Map<string, Answer>()
  const asked: string[] = []
  const told: string[] = []
  const commented: string[] = []
  const prompts: string[] = []
  let posts = 0
  const pool = fakePool(() => now)
  const deps: EngageDeps = {
    pool: pool as never,
    now: () => now,
    lastSearch: async () => last,
    markSearch: async at => {
      last = at
    },
    fetchRss: async () => FEED,
    parseRss: xml =>
      [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
        slug: /<guid>(.*?)</.exec(m[1])![1],
        title: /<title>(.*?)</.exec(m[1])![1],
        link: /<link>(.*?)</.exec(m[1])![1],
        summary: /<description>(.*?)</.exec(m[1])![1],
      })),
    signedIn: async () => ['x', 'linkedin', 'reddit'],
    thread: async () => 'one reply so far',
    rulesOf: async () => ({ read: true, bansAi: false, bansPromo: false }),
    voice: async a => voiceFrom(a),
    leads: async () => ({ replies: 2 }),
    search: async (network: Network) => {
      const out: Found[] = []
      for (let i = 0; i < 3; i++)
        out.push({
          network,
          url: `https://${network}.test/p${posts++}`,
          author: 'someone',
          text: ON_ALL_TOPICS,
          ageMs: 3_600_000,
        })
      return out
    },
    draft: async prompt => {
      prompts.push(prompt)
      return GOOD
    },
    ask: async what => {
      asked.push(what)
      const id = `a${asked.length}`
      answers.set(id, 'pending')
      return id
    },
    answerOf: async id => answers.get(id) ?? 'expired',
    comment: async (n, url) => {
      commented.push(`${n} ${url}`)
      return 'pressed'
    },
    readBack: async () => true,
    tell: async t => {
      told.push(t)
    },
    ...over,
  }
  return {
    deps,
    pool,
    asked,
    told,
    commented,
    prompts,
    answers,
    advance: (ms: number) => {
      now += ms
    },
  }
}

beforeEach(() => resetEngageForTests())

/* ---------------------------------------------------------- spec tests -- */

describe('engage-desk.t27 against the host', () => {
  it('a search every six hours, on a five-minute tick', async () => {
    expect(searchDue(0, 0)).toBe(true)
    expect(searchDue(1, 1 + 21599999)).toBe(false)
    expect(searchDue(1, 1 + 21600000)).toBe(true)
    expect(SPEC.TICK_MS).toBe(300000)
    expect(SPEC.TICK_MS).toBeLessThan(SPEC.SEARCH_EVERY_MS)
    /* The tick itself: a second tick five minutes later does not search. */
    const w = world()
    await engageTick(w.deps)
    const after = w.asked.length
    w.advance(SPEC.TICK_MS)
    expect(await engageTick(w.deps)).toBe('not due')
    expect(w.asked.length).toBe(after)
  })

  it('only recent posts', async () => {
    expect(fresh(0)).toBe(true)
    expect(fresh(604799999)).toBe(true)
    expect(fresh(604800000)).toBe(false)
    expect(fresh(null)).toBe(false)
    const w = world({
      search: async n => [
        {
          network: n,
          url: `https://${n}.test/old`,
          author: '',
          text: ON_ALL_TOPICS,
          ageMs: SPEC.POST_MAX_AGE_MS,
        },
      ],
    })
    await engageTick(w.deps)
    expect(w.asked).toEqual([])
  })

  it('a comment fits its network and says something', () => {
    expect(fits('x', 80)).toBe(true)
    expect(fits('x', 280)).toBe(true)
    expect(fits('x', 281)).toBe(false)
    expect(fits('linkedin', 281)).toBe(true)
    expect(fits('reddit', 1000)).toBe(true)
    expect(fits('reddit', 1001)).toBe(false)
    expect(fits('linkedin', 79)).toBe(false)
    expect(fits('x', 0)).toBe(false)
    expect(fits('threads', 281)).toBe(false)
    expect(draftVerdict('x', 'x'.repeat(281)).ok).toBe(false)
    expect(draftVerdict('linkedin', GOOD).ok).toBe(true)
  })

  it('at most three proposals a day per network', async () => {
    expect(mayPropose(0, false, false, true)).toBe(true)
    expect(mayPropose(2, false, false, true)).toBe(true)
    expect(mayPropose(3, false, false, true)).toBe(false)
    expect(SPEC.DAILY_CAP_PER_NETWORK).toBe(3)
    expect(SPEC.PER_SEARCH_PER_NETWORK).toBe(1)
    expect(SPEC.DAY_MS).toBe(86400000)
    /* Four searches in a day (every six hours): the fourth asks nothing. */
    const w = world()
    for (let i = 0; i < 4; i++) {
      await engageTick(w.deps)
      w.advance(SPEC.SEARCH_EVERY_MS)
    }
    for (const n of ['x', 'linkedin', 'reddit'])
      expect(w.pool.rows.filter(r => r.network === n).length).toBe(3)
    /* A day later the cap is free again. */
    w.advance(SPEC.DAY_MS)
    await engageTick(w.deps)
    expect(w.pool.rows.filter(r => r.network === 'x').length).toBe(4)
  })

  it('never twice on the same post', async () => {
    expect(mayPropose(0, true, false, true)).toBe(false)
    expect(SPEC.ONE_COMMENT_PER_POST).toBe(true)
    const w = world({
      search: async n => [
        {
          network: n,
          url: `https://${n}.test/same`,
          author: '',
          text: ON_ALL_TOPICS,
          ageMs: 1000,
        },
      ],
    })
    await engageTick(w.deps)
    w.advance(SPEC.SEARCH_EVERY_MS)
    await engageTick(w.deps)
    expect(w.pool.rows.filter(r => r.network === 'x').length).toBe(1)
    expect(w.asked.length).toBe(3)
  })

  it('no mentions and no direct messages', async () => {
    expect(mayPropose(0, false, true, true)).toBe(false)
    expect(SPEC.MENTIONS_ALLOWED).toBe(false)
    expect(SPEC.DMS_ALLOWED).toBe(false)
    expect(hasMention('thanks @someone for this')).toBe(true)
    expect(hasMention('as u/someone said')).toBe(true)
    expect(hasMention('see /u/someone')).toBe(true)
    expect(hasMention(GOOD)).toBe(false)
    const w = world({ draft: async () => `@author ${GOOD}` })
    await engageTick(w.deps)
    expect(w.asked).toEqual([])
  })

  it('nothing the claim guard refuses', async () => {
    expect(mayPropose(0, false, false, false)).toBe(false)
    expect(SPEC.CLAIM_GUARD_REQUIRED).toBe(true)
    expect(claimBroken('GoldenFloat ranks first on the leaderboard')).toBe(
      'top rank'
    )
    expect(claimBroken('it is state of the art')).toBe('top rank')
    expect(claimBroken('the format makes the network multiplier-free')).toBe(
      'multiplier-freedom credited to the format'
    )
    expect(claimBroken('GoldenFloat decode is faster on the FPGA')).toBe(
      'FPGA decode advantage'
    )
    expect(claimBroken(GOOD)).toBe('')
    const w = world({
      draft: async () => `${GOOD} GoldenFloat is the best format overall.`,
    })
    await engageTick(w.deps)
    expect(w.asked).toEqual([])
  })

  it('an open question is waited on for a day, then let go', async () => {
    expect(stillWaiting('pending', 0)).toBe(true)
    expect(stillWaiting('pending', 86399999)).toBe(true)
    expect(stillWaiting('pending', 86400000)).toBe(false)
    expect(stillWaiting('allowed', 0)).toBe(false)
    expect(stillWaiting('expired', 0)).toBe(false)
    expect(SPEC.ANSWER_WAIT_MS).toBe(86400000)
    const w = world({ signedIn: async () => ['x'] })
    await engageTick(w.deps)
    w.advance(SPEC.ANSWER_WAIT_MS - 1)
    await engageTick(w.deps)
    expect(w.pool.rows[0].state).toBe('asked')
    w.advance(1)
    await engageTick(w.deps)
    /* Silence is not a no: closed as expired, and the owner is told. */
    expect(w.pool.rows[0].state).toBe('expired')
    expect(w.told.some(t => t.includes(w.pool.rows[0].post_url))).toBe(true)
  })

  it('a comment is posted only on a yes', async () => {
    expect(postsOnlyOnYes('allowed')).toBe(true)
    expect(postsOnlyOnYes('denied')).toBe(false)
    expect(postsOnlyOnYes('expired')).toBe(false)
    expect(postsOnlyOnYes('pending')).toBe(false)
    expect(SPEC.ASK_NEEDS_YES).toBe(true)
    const w = world({ signedIn: async () => ['x', 'reddit'] })
    await engageTick(w.deps)
    expect(w.commented).toEqual([])
    w.answers.set('a1', 'allowed')
    w.answers.set('a2', 'denied')
    w.advance(SPEC.TICK_MS)
    await engageTick(w.deps)
    expect(w.commented).toEqual([`x ${w.pool.rows[0].post_url}`])
    expect(w.pool.rows.map(r => r.state)).toEqual(['posted', 'declined'])
  })

  it('a decline is real only if the approval was decided', async () => {
    expect(declineIsReal('denied')).toBe(true)
    expect(declineIsReal('expired')).toBe(false)
    expect(declineIsReal('pending')).toBe(false)
    expect(declineIsReal('allowed')).toBe(false)
    const w = world({ signedIn: async () => ['x'] })
    await engageTick(w.deps)
    w.answers.set('a1', 'denied')
    await engageTick(w.deps)
    expect(w.pool.rows[0].state).toBe('declined')
    /* A real no is not reported as silence. */
    expect(w.told).toEqual([])
  })

  it('the comment read back on the post is the receipt', async () => {
    expect(receiptSeen('x'.repeat(40), true)).toBe(true)
    expect(receiptSeen('x'.repeat(40), false)).toBe(false)
    expect(receiptSeen('', true)).toBe(false)
    expect(SPEC.RECEIPT_SNIPPET_CHARS).toBe(40)
    expect(snippetOf(GOOD)).toBe(GOOD.slice(0, 40))
    let looked = ''
    const w = world({
      signedIn: async () => ['x'],
      readBack: async (_n, _u, s) => {
        looked = s
        return false
      },
    })
    await engageTick(w.deps)
    w.answers.set('a1', 'allowed')
    await engageTick(w.deps)
    expect(looked).toBe(GOOD.slice(0, 40))
    /* Pressed but not read back: failed, not posted. */
    expect(w.pool.rows[0].state).toBe('failed')
  })

  it('many networks side by side, three tabs at a time', async () => {
    expect(SPEC.READER_NETWORKS).toBe(5)
    expect(NETWORKS).toHaveLength(SPEC.READER_NETWORKS)
    expect(SPEC.PARALLEL_TABS_MAX).toBe(3)
    expect(SPEC.PARALLEL_TABS_MAX).toBeLessThan(SPEC.READER_NETWORKS)
    let open = 0
    let most = 0
    await inParallel(
      NETWORKS.map(() => async () => {
        open++
        most = Math.max(most, open)
        await new Promise(r => setTimeout(r, 5))
        open--
      }),
      SPEC.PARALLEL_TABS_MAX
    )
    expect(most).toBe(SPEC.PARALLEL_TABS_MAX)
    /* Signed in where there is no reader: said, not searched. */
    const w = world({ signedIn: async () => ['x', 'facebook', 'threads'] })
    const out = await engageTick(w.deps)
    expect(out).toContain(`facebook: no reader (${NO_READER.facebook})`)
    expect(w.pool.rows.map(r => r.network).sort()).toEqual(['threads', 'x'])
  })

  it('a link only on Reddit, only under nine to one', async () => {
    expect(linkAllowed('reddit', false, true)).toBe(true)
    expect(linkAllowed('reddit', true, true)).toBe(false)
    expect(linkAllowed('reddit', false, false)).toBe(false)
    expect(linkAllowed('x', false, true)).toBe(false)
    expect(linkAllowed('linkedin', false, true)).toBe(false)
    expect(promoOk(0, 9)).toBe(true)
    expect(promoOk(0, 0)).toBe(false)
    expect(promoOk(1, 10)).toBe(false)
    expect(promoOk(1, 19)).toBe(true)
    expect(SPEC.PROMO_SHARE_MAX_PERCENT).toBe(10)
    expect(SPEC.PROMO_WINDOW_MS).toBe(2592000000)
    const LINKED = `${GOOD} https://t27.ai/blog/tnn`
    /* No posted history on Reddit: a link would be 1 in 1 -- refused. */
    const w = world({
      signedIn: async () => ['reddit', 'linkedin'],
      draft: async () => LINKED,
    })
    await engageTick(w.deps)
    expect(w.asked).toEqual([])
    /* Nine plain posted comments: the tenth may carry the link. */
    const v = world({
      signedIn: async () => ['reddit'],
      draft: async () => LINKED,
    })
    for (let i = 0; i < 9; i++)
      v.pool.rows.push({
        id: `p${i}`,
        network: 'reddit',
        post_url: `https://reddit.test/old${i}`,
        comment: GOOD,
        state: 'posted',
        approval_id: '',
        asked_ms: 0,
        done_ms: 9 * SPEC.DAY_MS,
      })
    await engageTick(v.deps)
    expect(v.asked).toHaveLength(1)
  })

  it("the community's rules are read before a proposal", async () => {
    expect(
      communityAllows({ read: true, bansAi: false, bansPromo: false })
    ).toBe(true)
    expect(
      communityAllows({ read: true, bansAi: true, bansPromo: false })
    ).toBe(false)
    expect(
      communityAllows({ read: false, bansAi: false, bansPromo: false })
    ).toBe(false)
    expect(SPEC.RULES_READ_FIRST).toBe(true)
    const rules = readRules({
      rules: [
        { short_name: 'No self-promotion', description: 'Do not advertise' },
        {
          short_name: 'No AI-generated content',
          description: 'AI-generated posts are removed',
        },
      ],
    })
    expect(rules).toEqual({ read: true, bansAi: true, bansPromo: true })
    expect(readRules('<html>').read).toBe(false)
    let drafted = 0
    const w = world({
      signedIn: async () => ['reddit'],
      rulesOf: async () => rules,
      draft: async () => {
        drafted++
        return GOOD
      },
    })
    await engageTick(w.deps)
    /* Skipped before a single draft was paid for. */
    expect(drafted).toBe(0)
    expect(w.asked).toEqual([])
  })

  it("the thread is read and the owner's voice is used", async () => {
    expect(mayDraft('')).toBe(true)
    expect(mayDraft(null)).toBe(false)
    expect(SPEC.THREAD_CONTEXT_REQUIRED).toBe(true)
    expect(SPEC.VOICE_REFRESH_MS).toBe(604800000)
    expect(SPEC.VOICE_SAMPLES).toBe(3)
    const w = world({ signedIn: async () => ['x'] })
    w.deps.fetchRss = async () =>
      `<rss><channel><item><guid>v</guid><title>Ternary</title><link>https://t27.ai/v</link><description>${'I measured the trits on the board myself and the numbers surprised me. '.repeat(2)}</description></item></channel></rss>`
    await engageTick(w.deps)
    expect(w.prompts[0]).toContain('one reply so far')
    expect(w.prompts[0]).toContain('I measured the trits on the board myself')
    const u = world({ signedIn: async () => ['x'], thread: async () => null })
    await engageTick(u.deps)
    expect(u.prompts).toEqual([])
  })

  it('replies are looked for between a day and a week', async () => {
    expect(leadCheckDue(86399999, 0, false)).toBe(false)
    expect(leadCheckDue(86400000, 0, false)).toBe(true)
    expect(leadCheckDue(100000000, 1000, true)).toBe(false)
    expect(leadCheckDue(200000000, 86400000, true)).toBe(true)
    expect(leadCheckDue(604800000, 0, false)).toBe(false)
    const w = world({ signedIn: async () => ['x'] })
    await engageTick(w.deps)
    w.answers.set('a1', 'allowed')
    await engageTick(w.deps)
    expect(w.pool.rows[0].state).toBe('posted')
    w.advance(SPEC.LEAD_CHECK_AFTER_MS)
    await engageTick(w.deps)
    expect(w.pool.rows[0].detail?.leads).toMatchObject({ replies: 2 })
    expect(w.told.some(t => t.includes('(2)'))).toBe(true)
  })

  it('the desk is built, a confirmed comment is not yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.VERSION).toBe(1)
  })
})

/* ------------------------------------------------- host-only behaviour -- */

describe('engage desk readers and topics', () => {
  it('reads LinkedIn relative times, a month is not a minute', () => {
    expect(relativeAgeMs('3d •')).toBe(3 * 86_400_000)
    expect(relativeAgeMs('45m')).toBe(45 * 60_000)
    expect(relativeAgeMs('1mo')).toBe(30 * 86_400_000)
    expect(relativeAgeMs('')).toBe(null)
  })

  it('reads Reddit search JSON and skips locked threads', () => {
    const now = 1_800_000_000_000
    const got = parseRedditSearch(
      JSON.stringify({
        data: {
          children: [
            {
              data: {
                permalink: '/r/FPGA/comments/a/b/',
                author: 'z',
                title: 'T',
                selftext: 'S',
                created_utc: now / 1000 - 60,
              },
            },
            {
              data: {
                permalink: '/r/FPGA/comments/c/d/',
                locked: true,
                created_utc: now / 1000,
              },
            },
          ],
        },
      }),
      now
    )
    expect(got).toHaveLength(1)
    expect(got[0].url).toBe('https://www.reddit.com/r/FPGA/comments/a/b/')
    expect(got[0].ageMs).toBe(60_000)
    expect(parseRedditSearch('<html>', now)).toEqual([])
  })

  it('takes only links of the network from a search page', () => {
    const got = parsePageItems(
      'x',
      [
        {
          url: 'https://x.com/a/status/1?s=2',
          at: '2026-10-01T00:00:00Z',
          text: 't',
        },
        { url: 'https://evil.test/x.com/', at: '2026-10-01T00:00:00Z' },
      ],
      Date.parse('2026-10-01T01:00:00Z')
    )
    expect(got).toHaveLength(1)
    expect(got[0].url).toBe('https://x.com/a/status/1')
    expect(got[0].ageMs).toBe(3_600_000)
  })

  it('puts the topics the owner writes about first', () => {
    const t = topicsFromFeed([
      {
        slug: 'a',
        title: 'openXC7 and nextpnr',
        link: 'https://t27.ai/a',
        summary: '',
      },
      {
        slug: 'b',
        title: 'Yosys on Artix',
        link: 'https://t27.ai/b',
        summary: '',
      },
    ])
    expect(t[0]).toBe('openXC7')
    expect(t).toHaveLength(6)
  })

  it('refuses a link to anywhere but our own pages', () => {
    expect(draftVerdict('reddit', `${GOOD} https://example.com/x`).ok).toBe(
      false
    )
    expect(draftVerdict('reddit', `${GOOD} https://t27.ai/blog/tnn`).ok).toBe(
      true
    )
    expect(
      draftVerdict('linkedin', `${GOOD} https://t27.ai/blog/tnn`).why
    ).toBe('link not allowed here')
  })
})
