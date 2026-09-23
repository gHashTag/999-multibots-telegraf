/**
 * THE BLOG GOES TO LINKEDIN AND X -- ONE ARTICLE A DAY, ONLY AFTER A YES.
 *
 * Owner's decision, 2026-09-22 (asked and answered): new articles of the
 * t27.ai blog are shared on the owner's LinkedIn and X, which were connected
 * that day in their own browser through Google. Once a day the newest
 * article not offered before becomes a question -- "share it?" -- on the
 * owner's screen and in Telegram (browser approvals). Nothing is posted
 * without that yes: posting on somebody's public accounts is outward and
 * cannot be taken back.
 *
 * Posting is deterministic, not a model's improvisation: each network's own
 * share page is opened already filled in (x.com/intent/post,
 * linkedin.com/sharing/share-offsite) and its Post button is pressed by its
 * label (browser/find-target.ts). What happened is kept per article, so no
 * article is offered or posted twice.
 *
 * Switched on by BLOG_SHARE_ENABLED=1 on the render service.
 */
import type { Queryable } from '../browser/sessions'

export const RSS_URL = process.env.BLOG_RSS_URL || 'https://t27.ai/rss.xml'
/* One question a day at most; the tick itself runs more often. */
export const ASK_EVERY_MS = 20 * 60 * 60 * 1000
/* A question nobody answered is let go after this, and the next day asks anew. */
export const ANSWER_WAIT_MS = 24 * 60 * 60 * 1000
/* X counts every link as 23 characters. */
export const X_LIMIT = 280
const X_LINK = 23

export interface Article {
  slug: string
  title: string
  link: string
  summary: string
}

const tag = (xml: string, name: string): string => {
  /* Attributes allowed: the feed writes <guid isPermaLink="false">. */
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml)
  return m
    ? decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim())
    : ''
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** The feed's articles, newest first as the feed lists them. Pure. */
export function parseRss(xml: string): Article[] {
  const out: Article[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const slug = tag(item, 'guid')
    const title = tag(item, 'title')
    const link = tag(item, 'link')
    if (!slug || !title || !/^https:\/\//.test(link)) continue
    /* "[proven] ..." -- the feed's evidence label is for the site, not the post. */
    const summary = tag(item, 'description').replace(/^\[[a-z ]+\]\s*/i, '')
    out.push({ slug, title, link, summary })
  }
  return out
}

/**
 * THE LINK GOES IN THE REPLY, NOT IN THE POST.
 *
 * Carlos (@cavearr, X, 2026-09-23) wrote to the owner: he has been watching
 * his own numbers, and posts carrying an external link reach fewer people;
 * he now writes a thread whose first post is a summary with an image and
 * puts the link in a post below. He called it possibly superstition and
 * asked for a test.
 *
 * So our cron writes it that way: the first post carries the title and the
 * summary and nothing to click, and the link follows as the second post of
 * the same thread. It costs nothing if he is wrong, and the owner promised
 * him the numbers either way.
 */
export function xThread(a: Article): { first: string; second: string } {
  return {
    /* No link, so the whole 280 is the text. */
    first: xText(a, X_LIMIT),
    second: a.link,
  }
}

/** The text of the X post: the title and as much summary as fits. Pure. */
export function xText(a: Article, limit = X_LIMIT - X_LINK): string {
  const room = limit - 1
  const head = a.title
  if (head.length >= room) return head.slice(0, room - 1) + '…'
  const left = room - head.length - 2
  if (left < 40 || !a.summary) return head
  const body =
    a.summary.length <= left
      ? a.summary
      : a.summary.slice(0, left - 1).trimEnd() + '…'
  return `${head}\n\n${body}`
}

/**
 * The subreddit the owner keeps for Trinity S3AI. Theirs, and the only one
 * an article is posted to: posting a project's own article into somebody
 * else's community is what spam is, and no cron of ours will do it.
 */
export const SUBREDDIT = process.env.BLOG_SHARE_SUBREDDIT || 't27ai'

/** Each network's own share page, already filled in. Pure. */
export function shareUrls(a: Article): {
  x: string
  linkedin: string
  reddit: string
} {
  return {
    x: `https://x.com/intent/post?text=${encodeURIComponent(xText(a))}&url=${encodeURIComponent(a.link)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(a.link)}`,
    /*
     * Reddit's own submit page, filled in: the title as written and the
     * link. The person's community is dead quiet -- one visitor in a week,
     * nothing posted in six months -- and a blog that writes itself is
     * exactly what it lacks (measured 2026-09-23 on r/t27ai).
     */
    reddit: `https://www.reddit.com/r/${encodeURIComponent(SUBREDDIT)}/submit?title=${encodeURIComponent(a.title.slice(0, 280))}&url=${encodeURIComponent(a.link)}&type=LINK`,
  }
}

/** The question the owner is asked, in their words. Pure. */
export function questionFor(a: Article): string {
  return (
    `Опубликовать статью блога в LinkedIn, X и r/${SUBREDDIT}: ` + // cyrillic-ok: shown to the owner
    `«${a.title}» (${a.link})`
  )
}

let ready = false
export async function ensureBlogShares(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS blog_shares (
    slug text PRIMARY KEY,
    state text NOT NULL,
    approval_id text,
    asked_at timestamptz NOT NULL DEFAULT now(),
    done_at timestamptz,
    detail jsonb
  )`)
  ready = true
}
export function resetBlogSharesForTests(): void {
  ready = false
}

export type Answer = 'pending' | 'allowed' | 'denied' | 'expired'

export interface ShareDeps {
  pool: Queryable
  owner: string
  now: () => number
  fetchRss: () => Promise<string>
  ask: (what: string) => Promise<string>
  answerOf: (approvalId: string) => Promise<Answer>
  /** Posts on both networks; returns what each did, in words. */
  publish: (a: Article) => Promise<Record<string, string>>
  tell: (text: string) => Promise<void>
}

/**
 * One tick. First the open question, if any: a yes posts, a no or silence
 * closes it. Then, at most once a day, the newest article not offered yet
 * becomes a question. Returns what it did, for the log.
 */
export async function blogShareTick(d: ShareDeps): Promise<string> {
  await ensureBlogShares(d.pool)
  const { rows: open } = await d.pool.query(
    `SELECT slug, approval_id, detail, extract(epoch from asked_at) * 1000 AS asked_ms
       FROM blog_shares WHERE state = 'asked' ORDER BY asked_at DESC LIMIT 1`
  )
  if (open[0]) {
    const row = open[0] as {
      slug: string
      approval_id: string
      detail: unknown
      asked_ms: number
    }
    const answer = await d.answerOf(row.approval_id)
    if (answer === 'pending' && d.now() - Number(row.asked_ms) < ANSWER_WAIT_MS)
      return `waiting for the owner on ${row.slug}`
    if (answer !== 'allowed') {
      await d.pool.query(
        `UPDATE blog_shares SET state = 'declined', done_at = now() WHERE slug = $1`,
        [row.slug]
      )
      return `${row.slug}: ${answer}, not posted`
    }
    const article = (
      typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail
    ) as Article
    const result = await d
      .publish(article)
      .catch(e => ({ error: String(e).slice(0, 200) }))
    const ok = !('error' in result)
    await d.pool.query(
      `UPDATE blog_shares SET state = $2, done_at = now(), detail = detail || $3::jsonb WHERE slug = $1`,
      [row.slug, ok ? 'posted' : 'failed', JSON.stringify({ result })]
    )
    await d
      .tell(
        (ok ? '✅ Опубликовано: ' : '⚠️ Не получилось опубликовать: ') + // cyrillic-ok: shown to the owner
          `«${article.title}»\n` +
          Object.entries(result)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
      )
      .catch(() => {})
    return `${row.slug}: ${ok ? 'posted' : 'failed'}`
  }

  const { rows: last } = await d.pool.query(
    `SELECT extract(epoch from max(asked_at)) * 1000 AS at FROM blog_shares`
  )
  const lastAt = Number((last[0] as { at?: unknown } | undefined)?.at) || 0
  if (lastAt && d.now() - lastAt < ASK_EVERY_MS) return 'asked today already'

  const articles = parseRss(await d.fetchRss())
  if (!articles.length) return 'the feed is empty'
  const { rows: seen } = await d.pool.query(`SELECT slug FROM blog_shares`)
  const known = new Set((seen as Array<{ slug: string }>).map(r => r.slug))
  const next = articles.find(a => !known.has(a.slug))
  if (!next) return 'every article was offered already'
  const id = await d.ask(questionFor(next))
  await d.pool.query(
    `INSERT INTO blog_shares (slug, state, approval_id, detail) VALUES ($1, 'asked', $2, $3::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
    [next.slug, id, JSON.stringify(next)]
  )
  return `asked about ${next.slug}`
}
