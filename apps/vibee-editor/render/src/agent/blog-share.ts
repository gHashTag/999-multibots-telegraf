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
import { tagged, type Channel } from './utm'
import type { Queryable } from '../browser/sessions'
import * as SPEC from '../spec/blog-share.gen'

export const RSS_URL = process.env.BLOG_RSS_URL || 'https://t27.ai/rss.xml'
/*
 * The pace and the wait live in the spec of record:
 * gHashTag/t27 specs/automation/blog-share.t27 (vendored in ../spec).
 * One question a day at most; the tick itself runs more often.
 * A question nobody answered is let go after ANSWER_WAIT_MS.
 */
export const { ASK_EVERY_MS, ANSWER_WAIT_MS } = SPEC
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

/**
 * The article's own static page for a feed link. The feed links the SPA route
 * (https://t27.ai/#/blog/<slug>), and a crawler never sees what follows '#':
 * X, LinkedIn and Telegram drew the home page's title and image under every
 * shared article. /blog/<slug>/ is the same article as static HTML with its
 * own og:title and og:image. Anything else is returned as given. Pure.
 */
export function staticArticleUrl(link: string): string {
  const m = /^(https:\/\/[^/#?]+)\/?#\/blog\/([a-z0-9-]+)\/?$/i.exec(link)
  return m ? `${m[1]}/blog/${m[2]}/` : link
}

/** The feed's articles, newest first as the feed lists them. Pure. */
export function parseRss(xml: string): Article[] {
  const out: Article[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const slug = tag(item, 'guid')
    const title = tag(item, 'title')
    const link = staticArticleUrl(tag(item, 'link'))
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
 * A reader on X wrote to the owner on 2026-09-23: he has been watching
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
/**
 * The article's link as one channel carries it (epic #2974): each network
 * gets its own utm_source, so a visitor from X is not a visitor from
 * Reddit. campaign=blog, content=the article's slug. Pure.
 */
export function linkFor(a: Article, channel: Channel): string {
  return tagged(a.link, channel, { campaign: 'blog', content: a.slug })
}

export function xThread(a: Article): { first: string; second: string } {
  return {
    /* No link, so the whole 280 is the text. */
    first: xText(a, X_LIMIT),
    second: linkFor(a, 'x'),
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

/** Threads' own composer limit, in characters. */
export const THREADS_LIMIT = 500

/**
 * The Threads post: the title, then the link, within Threads' limit. The
 * link is kept whole -- a cut link is a dead one -- and the title gives way.
 * Pure.
 */
export function threadsText(a: Article): string {
  const link = linkFor(a, 'threads')
  const room = THREADS_LIMIT - link.length - 2
  const head =
    a.title.length <= room ? a.title : a.title.slice(0, room - 1) + '…'
  return `${head}\n\n${link}`
}

/** Each network's own share page, already filled in. Pure. */
export function shareUrls(a: Article): {
  x: string
  linkedin: string
  reddit: string
  threads: string
} {
  return {
    /*
     * Threads' own web intent (developers.facebook.com/docs/threads/
     * threads-web-intents): it fills the composer and never posts by itself
     * -- the Post button is pressed after the owner's yes, as on X (owner,
     * 2026-09-24: all three next steps, the clone speaks in every network).
     */
    threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(threadsText(a))}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(xText(a))}&url=${encodeURIComponent(linkFor(a, 'x'))}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(linkFor(a, 'linkedin'))}`,
    /*
     * Reddit's own submit page, filled in: the title as written and the
     * link. The person's community is dead quiet -- one visitor in a week,
     * nothing posted in six months -- and a blog that writes itself is
     * exactly what it lacks (measured 2026-09-23 on r/t27ai).
     */
    reddit: `https://www.reddit.com/r/${encodeURIComponent(SUBREDDIT)}/submit?title=${encodeURIComponent(a.title.slice(0, 280))}&url=${encodeURIComponent(linkFor(a, 'reddit'))}&type=LINK`,
  }
}

/** The question the owner is asked, in their words. Pure. */
export function questionFor(a: Article): string {
  return (
    `Опубликовать статью блога в LinkedIn, X, Threads, Instagram, Facebook и r/${SUBREDDIT}: ` + // cyrillic-ok: shown to the owner
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

/**
 * Did ANY network actually take the post? A run where every network was
 * "not connected" or "button not found" returned no error and was written
 * down as posted -- the owner was told "✅" about an article no one could
 * see. Then a press with a receipt was counted, and a receipt only says the
 * page moved. Now only a post SEEN on the owner's own profile counts (the
 * spec's `published_somewhere`, v2).
 */
export function publishedSomewhere(result: Record<string, string>): boolean {
  if ('error' in result) return false
  return Object.values(result).some(
    v =>
      String(v).includes(SEEN_ON_PROFILE) ||
      /* An API post came back with its own id: a receipt (meta-connect.ts). */
      String(v).startsWith('опубликовано через API') // cyrillic-ok: meta-connect.ts VIA_API
  )
}

/* Pressed, or a thread sent: the words publishEverywhere writes for a press. */
const PRESSED = /^нажато|^тред отправлен/ // cyrillic-ok: the words publishEverywhere writes

/**
 * What a run ended as. "unconfirmed" is a press nobody saw on the profile:
 * it is not published, and it is not a silent failure either -- the tabs are
 * left open for the owner to look at. The spec's `unconfirmed`.
 */
export function outcomeOf(
  result: Record<string, string>
): 'posted' | 'unconfirmed' | 'failed' {
  if (publishedSomewhere(result)) return 'posted'
  if ('error' in result) return 'failed'
  return Object.values(result).some(v => PRESSED.test(String(v)))
    ? 'unconfirmed'
    : 'failed'
}

export type Answer = 'pending' | 'allowed' | 'denied' | 'expired'

/** The spec's `still_waiting`: pending and younger than the approval's lifetime. */
export function stillWaiting(answer: Answer, ageMs: number): boolean {
  return answer === 'pending' && ageMs < ANSWER_WAIT_MS
}

/** The spec's `may_ask`: never asked, or the last question is a pace old. */
export function mayAsk(lastAskedMs: number, nowMs: number): boolean {
  return !lastAskedMs || nowMs - lastAskedMs >= ASK_EVERY_MS
}

/** The spec's `posts`: only a yes posts. */
export function posts(answer: Answer): boolean {
  return answer === 'allowed'
}

/**
 * The spec's `decline_is_real`: only a person's "no". Twelve rows were once
 * closed as declined while their approval was still pending (tri blog-share
 * reoffer, #3279); an expiry is silence and is told as such.
 */
export function declineIsReal(answer: Answer): boolean {
  return answer === 'denied'
}

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
    if (stillWaiting(answer, d.now() - Number(row.asked_ms)))
      return `waiting for the owner on ${row.slug}`
    if (!posts(answer)) {
      await d.pool.query(
        `UPDATE blog_shares SET state = 'declined', done_at = now() WHERE slug = $1`,
        [row.slug]
      )
      /*
       * SAID, NOT SWALLOWED (2026-10-02): eight articles closed silently in a
       * row, and nobody could tell a "no" from a question that died unseen.
       */
      if (!declineIsReal(answer))
        await d
          .tell(
            `⏳ Вопрос про «${row.slug}» остался без ответа — статья не опубликована.` // cyrillic-ok: shown to the owner
          )
          .catch(() => {})
      return `${row.slug}: ${answer}, not posted`
    }
    const article = (
      typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail
    ) as Article
    const result = await d
      .publish(article)
      .catch(e => ({ error: String(e).slice(0, 200) }))
    const outcome = outcomeOf(result)
    await d.pool.query(
      `UPDATE blog_shares SET state = $2, done_at = now(), detail = detail || $3::jsonb WHERE slug = $1`,
      [row.slug, outcome, JSON.stringify({ result })]
    )
    await d
      .tell(
        headlineOf(result) +
          `«${article.title}»\n` +
          Object.entries(result)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
      )
      .catch(() => {})
    return `${row.slug}: ${outcome}`
  }

  const { rows: last } = await d.pool.query(
    `SELECT extract(epoch from max(asked_at)) * 1000 AS at FROM blog_shares`
  )
  const lastAt = Number((last[0] as { at?: unknown } | undefined)?.at) || 0
  if (!mayAsk(lastAt, d.now())) return 'asked today already'

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

/**
 * A PRESS IS NOT A POST. "Pressed" only says a button was clicked; a share
 * page that is still on screen afterwards usually means the network refused
 * (a captcha, an empty field, a sign-in wall). The page leaving its share
 * address is the cheapest receipt the browser can give without reading a feed.
 */
export const LEFT_THE_FORM = 'страница ушла с формы' // cyrillic-ok: told to the owner

export function receiptOf(before: string, after: string): string {
  if (!before || !after) return 'не подтверждено: адрес не прочитан' // cyrillic-ok: told to the owner
  return before === after
    ? 'не подтверждено: страница не сменилась' // cyrillic-ok: told to the owner
    : LEFT_THE_FORM
}

/**
 * The headline says what is KNOWN. "Published" over a list where every
 * network reads "not confirmed" was the old message: a press shown as a post.
 * And a page that left the form is still not a post until the profile shows it.
 */
export function headlineOf(result: Record<string, string>): string {
  const outcome = outcomeOf(result)
  if (outcome === 'posted') return '✅ Опубликовано: ' // cyrillic-ok: shown to the owner
  if (outcome === 'unconfirmed')
    return '❔ Нажато, но в профиле пост не найден — не считается опубликованным, проверьте вкладки в «Браузере»: ' // cyrillic-ok: shown to the owner
  return '⚠️ Не получилось опубликовать: ' // cyrillic-ok: shown to the owner
}

/*
 * THE CONFIRMATION ON THE OWNER'S OWN PROFILE (spec v2). After the receipt
 * the same browser opens the owner's profile on the network and looks for
 * the post's opening words. Every post the desk makes starts with the
 * article's title, so the needle is the title's first MATCH_CHARS characters,
 * normalized the same way as the page text.
 */
export const { PROFILE_SETTLE_MS, PROFILE_LOOK_EVERY_MS, PROFILE_LOOKS } = SPEC
export const SEEN_ON_PROFILE = 'найдено в профиле' // cyrillic-ok: told to the owner
export const NOT_SEEN_ON_PROFILE = 'не подтверждено: в профиле не найдено' // cyrillic-ok: told to the owner
export const NO_PROFILE_CHECK = 'не подтверждено: профиль не проверяется' // cyrillic-ok: told to the owner

/** Lower case, letters and digits only, single spaces. Pure. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The words looked for on the profile. Pure. */
export function needleOf(a: Article): string {
  return normalizeForMatch(a.title).slice(0, SPEC.MATCH_CHARS).trim()
}

/** Is the post on this page? An empty needle is never "seen". Pure. */
export function seenOn(pageText: string, needle: string): boolean {
  return needle.length > 0 && normalizeForMatch(pageText).includes(needle)
}

/** The spec's `counted`: the page left the form AND the profile shows it. */
export function counted(left: boolean, seen: boolean): boolean {
  return left && seen
}

/** The spec's `unconfirmed`: pressed and not seen. */
export function unconfirmed(pressed: boolean, seen: boolean): boolean {
  return pressed && !seen
}

/**
 * The owner's own page on each network that can be checked. X has no
 * address for "me": its home page carries a link to the profile, read in
 * the browser (confirmOnProfile in blog-share-wiring.ts). Threads is not
 * checked, and so it is never counted. Pure.
 */
export function profileUrlFor(net: string): string | null {
  if (net === 'X') return 'https://x.com/home'
  if (net === 'LinkedIn')
    return 'https://www.linkedin.com/in/me/recent-activity/all/'
  if (net === 'Reddit') return 'https://www.reddit.com/user/me/submitted/'
  return null
}
