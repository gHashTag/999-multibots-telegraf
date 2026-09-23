/**
 * Owner's decision 2026-09-22: new t27.ai blog articles go to LinkedIn and
 * X, one a day, ONLY after the owner's yes. Nothing here may post on silence.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseRss,
  xText,
  shareUrls,
  blogShareTick,
  resetBlogSharesForTests,
  ASK_EVERY_MS,
  ANSWER_WAIT_MS,
  X_LIMIT,
  type Answer,
  type ShareDeps,
  questionFor,
} from './src/agent/blog-share'

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>The FPGA row was corrected &amp; checked</title><link>https://t27.ai/#/blog/fpga-row</link>
<guid isPermaLink="false">fpga-row</guid><description>[proven] A merged PR corrected an invalid Yosys invocation.</description></item>
<item><title>Older post</title><link>https://t27.ai/#/blog/older</link><guid isPermaLink="false">older</guid><description>x</description></item>
</channel></rss>`

type Row = {
  slug: string
  state: string
  approval_id: string
  asked_ms: number
  detail: unknown
}

function world(answer: Answer = 'pending') {
  const rows: Row[] = []
  let now = 1_000_000_000_000
  const asked: string[] = []
  const posted: string[] = []
  const told: string[] = []
  const pool = {
    async query(sql: string, p: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('CREATE')) return { rows: [] }
      if (s.includes("WHERE state = 'asked'"))
        return { rows: rows.filter(r => r.state === 'asked').slice(-1) }
      if (s.includes('max(asked_at)'))
        return {
          rows: [
            { at: rows.length ? Math.max(...rows.map(r => r.asked_ms)) : null },
          ],
        }
      if (s.startsWith('SELECT slug FROM blog_shares'))
        return { rows: rows.map(r => ({ slug: r.slug })) }
      if (s.startsWith('INSERT')) {
        rows.push({
          slug: String(p[0]),
          state: 'asked',
          approval_id: String(p[1]),
          asked_ms: now,
          detail: JSON.parse(String(p[2])),
        })
        return { rows: [] }
      }
      if (s.startsWith("UPDATE blog_shares SET state = 'declined'")) {
        rows.find(r => r.slug === p[0])!.state = 'declined'
        return { rows: [] }
      }
      if (s.startsWith('UPDATE blog_shares SET state = $2')) {
        rows.find(r => r.slug === p[0])!.state = String(p[1])
        return { rows: [] }
      }
      throw new Error('unmodelled: ' + s)
    },
  }
  const d: ShareDeps = {
    pool: pool as never,
    owner: '9000000071',
    now: () => now,
    fetchRss: async () => RSS,
    ask: async what => (asked.push(what), `q${asked.length}`),
    answerOf: async () => answer,
    publish: async a => (
      posted.push(a.slug),
      { X: 'pressed', LinkedIn: 'pressed' }
    ),
    tell: async t => void told.push(t),
  }
  return {
    d,
    rows,
    asked,
    posted,
    told,
    advance: (ms: number) => (now += ms),
    setAnswer: (a: Answer) => (answer = a),
  }
}

beforeEach(() => resetBlogSharesForTests())

describe('the feed', () => {
  it('reads articles, newest first, without the evidence label', () => {
    const a = parseRss(RSS)
    expect(a.map(x => x.slug)).toEqual(['fpga-row', 'older'])
    expect(a[0].title).toBe('The FPGA row was corrected & checked')
    expect(a[0].summary).toBe(
      'A merged PR corrected an invalid Yosys invocation.'
    )
  })

  it('the X post fits, and both share pages are the networks own', () => {
    const long = {
      slug: 's',
      title: 'T'.repeat(100),
      link: 'https://t27.ai/#/blog/s',
      summary: 'S'.repeat(500),
    }
    expect(xText(long).length).toBeLessThanOrEqual(X_LIMIT - 24)
    const u = shareUrls(long)
    expect(u.x.startsWith('https://x.com/intent/post?text=')).toBe(true)
    expect(
      u.linkedin.startsWith(
        'https://www.linkedin.com/sharing/share-offsite/?url='
      )
    ).toBe(true)
  })
})

describe('only after a yes', () => {
  it('asks about the newest article, and posts NOTHING while nobody answers', async () => {
    const w = world('pending')
    expect(await blogShareTick(w.d)).toBe('asked about fpga-row')
    expect(w.asked[0]).toContain('The FPGA row was corrected & checked')
    expect(await blogShareTick(w.d)).toMatch(/waiting/)
    expect(w.posted).toEqual([])
  })

  it('a yes posts, once, and tells the owner', async () => {
    const w = world('pending')
    await blogShareTick(w.d)
    w.setAnswer('allowed')
    expect(await blogShareTick(w.d)).toBe('fpga-row: posted')
    expect(w.posted).toEqual(['fpga-row'])
    expect(w.told[0]).toMatch(/fpga|FPGA/)
    expect(await blogShareTick(w.d)).toBe('asked today already')
    expect(w.posted).toEqual(['fpga-row'])
  })

  it('a no, or a day of silence, posts nothing and is never asked again', async () => {
    const w = world('denied')
    await blogShareTick(w.d)
    expect(await blogShareTick(w.d)).toBe('fpga-row: denied, not posted')
    const s = world('pending')
    await blogShareTick(s.d)
    s.advance(ANSWER_WAIT_MS + 1)
    expect(await blogShareTick(s.d)).toBe('fpga-row: pending, not posted')
    expect(s.posted).toEqual([])
  })

  it('one question a day; the next day the next article', async () => {
    const w = world('denied')
    await blogShareTick(w.d)
    await blogShareTick(w.d)
    expect(await blogShareTick(w.d)).toBe('asked today already')
    w.advance(ASK_EVERY_MS + 1)
    expect(await blogShareTick(w.d)).toBe('asked about older')
  })
})

describe('the owner s own community gets the article too', () => {
  const article = {
    slug: 'a',
    title: 'Ternary floats, measured',
    link: 'https://t27.ai/blog/gf-t',
    summary: 'what the numbers say',
  }

  it('posts to r/t27ai through Reddit s own submit page, filled in', () => {
    const u = shareUrls(article)
    expect(u.reddit).toContain('/r/t27ai/submit')
    expect(u.reddit).toContain(`title=${encodeURIComponent(article.title)}`)
    expect(u.reddit).toContain(`url=${encodeURIComponent(article.link)}`)
  })

  it('never posts into a community that is not the owner s', () => {
    /* One subreddit, named in one place: a cron that posts a project's own
       article into other people's communities is what spam is. */
    const u = shareUrls(article)
    const subs = u.reddit.match(/\/r\/([^/]+)\//g) ?? []
    expect(subs).toHaveLength(1)
  })

  it('the question names all three places, so a yes is informed', () => {
    const asked = questionFor(article)
    expect(asked).toContain('LinkedIn')
    expect(asked).toContain('X')
    expect(asked).toContain('r/t27ai')
  })
})
