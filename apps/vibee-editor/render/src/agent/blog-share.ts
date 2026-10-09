/**
 * THE BLOG GOES TO LINKEDIN AND X -- ONE ARTICLE A DAY, ONLY AFTER A YES.
 *
 * Owner's decision, 2026-09-22 (asked and answered): new articles of the
 * t27.ai blog are shared on the owner's LinkedIn and X, which were connected
 * that day in their own browser through Google. Once a day the next
 * article not offered before -- the first of the owner's queue, else the
 * newest (spec v3, QUEUE_SKILL below) -- becomes a question -- "share it?"
 * -- on the owner's screen and in Telegram (browser approvals). Nothing is posted
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
import * as L from '../spec/blog-share.logic'

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
  /*
   * The feed's evidence label without its brackets ("measured", "model
   * results measured on GPUs; board throughput derived, not measured"), or
   * absent. Kept apart from the summary so the X post can lead with the
   * article, and carried by every channel with room for it: the label is
   * the line that names what is not proven.
   */
  evidence?: string
  /* The feed's pubDate in epoch ms, absent when the feed gives none. */
  published?: number
  /* A release of ours rather than a blog article (spec v5). */
  kind?: 'release'
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
    /*
     * "[proven] ..." -- the feed's evidence label, split off the summary.
     * Labels are not always one word: "[counts measured through the GitHub
     * API on 2026-10-02; merged means ...]" runs to 200 characters, and when
     * it was left in the summary the X post spent its 280 on the caveat, cut
     * off mid-sentence, and never reached the article. It is not thrown
     * away: summaryWithEvidence puts it back where there is room.
     */
    const description = tag(item, 'description')
    const label = /^\[([^\]]*)\]\s*/.exec(description)
    const summary = label ? description.slice(label[0].length) : description
    const evidence = label?.[1].trim()
    const published = Date.parse(tag(item, 'pubDate'))
    const article: Article = evidence
      ? { slug, title, link, summary, evidence }
      : { slug, title, link, summary }
    if (Number.isFinite(published)) article.published = published
    out.push(article)
  }
  return out
}

/**
 * The summary as the site prints it, label first. For every channel with
 * room -- LinkedIn, Facebook, Instagram, Reddit, the reply drafter's notes:
 * a caveat such as "board throughput derived, not measured" is what keeps
 * the sentence after it honest, so it is dropped only where it cannot fit
 * (the X post's first box; the caveat rides in the link post, xSecondPost).
 * Pure.
 */
export function summaryWithEvidence(a: Article): string {
  return a.evidence ? `[${a.evidence}] ${a.summary}` : a.summary
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
    second: xSecondPost(a),
  }
}

/**
 * The second post of the X thread: the evidence label, then the link.
 *
 * The first post has no room for the caveat -- it was dropped there on
 * purpose (#3435), and the X post was the one channel where a reader saw the
 * claim without the "derived, not measured" that keeps it honest. The link
 * post has 280 - 23 to spare, so the caveat rides there, cut at a word if it
 * has to be, its brackets kept. No label, no change: the link alone. Pure.
 */
export function xSecondPost(a: Article): string {
  const link = linkFor(a, 'x')
  if (!a.evidence) return link
  const room = X_LIMIT - X_LINK - 2 - 2 - 1
  const said = clip(a.evidence, room)
  return said ? `[${said}]\n\n${link}` : link
}

/**
 * Text cut to at most `max` characters where a reader expects a cut: after
 * the last whole sentence if one ends in the second half, else at the last
 * word with "…", else hard with "…". The first article queued after #3435
 * ended its X post on "Most follow one thre…". Pure.
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text
  if (max < 1) return ''
  const cut = text.slice(0, max)
  /* One character more, so a sentence whose stop is the last that fits counts. */
  const ends = text.slice(0, max + 1)
  const sentence = Math.max(
    ...['. ', '! ', '? '].map(end => ends.lastIndexOf(end))
  )
  if (sentence + 1 >= max / 2) return cut.slice(0, sentence + 1)
  const word = cut.slice(0, max - 1).lastIndexOf(' ')
  if (word >= max / 2) return cut.slice(0, word).trimEnd() + '…'
  return cut.slice(0, max - 1).trimEnd() + '…'
}

/** The text of the X post: the title and as much summary as fits. Pure. */
export function xText(a: Article, limit = X_LIMIT - X_LINK): string {
  const room = limit - 1
  const head = a.title
  if (head.length >= room) return clip(head, room - 1)
  const left = room - head.length - 2
  if (left < 40 || !a.summary) return head
  return `${head}\n\n${clip(a.summary, left)}`
}

/**
 * The subreddit the owner keeps for Trinity S3AI. Theirs, and the only one
 * an article is posted to: posting a project's own article into somebody
 * else's community is what spam is, and no cron of ours will do it.
 *
 * SWITCHED OFF BY THE OWNER (spec v3, network_used): Reddit closed r/t27ai
 * on 2026-10-03. BLOG_SHARE_SUBREDDIT=off gives null here, and a null
 * subreddit is neither named in the question nor posted to. Pure.
 */
export function subredditOf(raw: string | undefined): string | null {
  const v = (raw ?? '').trim()
  if (v.toLowerCase() === 'off') return null
  return v || 't27ai'
}
export const SUBREDDIT = subredditOf(process.env.BLOG_SHARE_SUBREDDIT)

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
  const head = clip(a.title, room)
  return `${head}\n\n${link}`
}

/**
 * The words of each share page's publish button, in the order they are
 * looked for. One home: the publishing loop (blog-share-wiring.ts) presses
 * by them, and `tri browser share-check` looks for them without pressing --
 * a second copy of the list would let the check pass on words the loop no
 * longer uses.
 */
export const SHARE_LABELS = {
  X: ['post', 'опубликовать'], // cyrillic-ok: X's Russian label
  /*
   * LinkedIn's composer says "Post"; its Russian label is "Place", not
   * "Publish" (seen 2026-10-03 -- the old label missed it every time).
   */
  LinkedIn: ['post', 'разместить', 'опубликовать'], // cyrillic-ok: LinkedIn's Russian labels
  /* Reddit's submit page says "Post"; in Russian, "Опубликовать". */
  Reddit: ['post', 'опубликовать'], // cyrillic-ok: Reddit's Russian label
  /* Threads' composer says "Post"; in Russian, "Опубликовать". */
  Threads: ['post', 'опубликовать'], // cyrillic-ok: Threads' Russian label
} as const

/**
 * Each network's own share page, already filled in; Reddit's is null when
 * the owner switched it off (subredditOf). Pure.
 */
export function shareUrls(
  a: Article,
  subreddit: string | null = SUBREDDIT
): {
  x: string
  linkedin: string
  reddit: string | null
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
    reddit:
      subreddit === null
        ? null
        : `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?title=${encodeURIComponent(clip(a.title, 280))}&url=${encodeURIComponent(linkFor(a, 'reddit'))}&type=LINK`,
  }
}

/**
 * The question the owner is asked, in their words. It names every place the
 * yes will post to, and no place it will not (spec v3, network_used). Pure.
 */
export function questionFor(
  a: Article,
  subreddit: string | null = SUBREDDIT
): string {
  const where =
    subreddit === null
      ? 'LinkedIn, X, Threads, Instagram и Facebook' // cyrillic-ok: shown to the owner
      : `LinkedIn, X, Threads, Instagram, Facebook и r/${subreddit}` // cyrillic-ok: shown to the owner
  const what = a.kind === 'release' ? 'релиз' : 'статью блога' // cyrillic-ok: shown to the owner
  return `Опубликовать ${what} в ${where}: «${a.title}» (${a.link})` // cyrillic-ok: shown to the owner
}

/**
 * THE OWNER'S QUEUE COMES FIRST (spec v3, offerable / newest_goes_next).
 *
 * 2026-10-04: the owner ranked the blog -- "the blog starts with its
 * successes" -- and the ranking was saved as their Blogger agent's skill.
 * The desk kept asking about the newest article, so the order reached the
 * agent and not the desk. The order has one home, that skill; the desk reads
 * it there (blog-share-wiring.ts) and keeps no copy. A slug named anywhere in
 * it counts as queued, in the order it is first named; every question still
 * waits for the owner's yes.
 */
export const QUEUE_SKILL = 'Blogger: очередь публикаций блога' // cyrillic-ok: the owner's skill name, as saved

/**
 * The feed's slugs in the order the owner's text first names them. A slug
 * counts only whole: "the-fpga-row" inside "the-fpga-row-was-corrected" is
 * not a mention of it. Pure.
 */
export function queueOrder(text: string, slugs: readonly string[]): string[] {
  const at = new Map<string, number>()
  for (const slug of slugs) {
    const quoted = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(?<![a-z0-9-])${quoted}(?![a-z0-9-])`, 'i').exec(text)
    if (m) at.set(slug, m.index)
  }
  return [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)!)
}

/**
 * How young an article must be to go ahead of the owner's queue. On
 * 2026-10-04..06 the queue (written once, its first items from August) sent
 * three August articles to X on three days while the articles of 10-04 waited
 * behind seven more old ones: the owner asked why the agent posts OLD
 * releases. A fresh article now goes first; the queue orders the rest.
 * The window is the spec's (specs/automation/blog-share.t27 v4 FRESH_MS).
 */
export const FRESH_MS = SPEC.FRESH_MS

/**
 * An age as the spec's u32 takes it: a negative age (a date in the future)
 * is 0, an unknown one (NaN) and one past u32 read as the oldest there is.
 */
export function ageU32(ageMs: number): number {
  if (Number.isNaN(ageMs)) return 0xffffffff
  return Math.min(0xffffffff, Math.max(0, Math.floor(ageMs)))
}

/** The spec's is_fresh (compiled): the edge (exactly FRESH_MS old) is still fresh. */
export const isFresh = (ageMs: number) => L.isFresh(ageU32(ageMs))

/**
 * The next article to offer: the newest offerable one published within
 * FRESH_MS of nowMs (when nowMs is given); else the first queued one the feed carries and
 * nobody was asked about; only when none is left, the newest such -- the
 * feed lists newest first. Pure.
 */
export function nextArticle(
  articles: readonly Article[],
  known: ReadonlySet<string>,
  queue: readonly string[],
  nowMs?: number
): { article: Article; queued: boolean } | undefined {
  const offerable = articles.filter(a => !known.has(a.slug))
  if (nowMs !== undefined) {
    const fresh = offerable.find(
      a => a.published !== undefined && isFresh(nowMs - a.published)
    )
    if (fresh) return { article: fresh, queued: false }
  }
  for (const slug of queue) {
    const article = offerable.find(a => a.slug === slug)
    if (article) return { article, queued: true }
  }
  return offerable[0] ? { article: offerable[0], queued: false } : undefined
}

/*
 * RELEASES GO OUT TOO (spec v5). Owner, 2026-10-09: "set it up so that
 * releases are published on X"; asked how, they chose at once, with their
 * yes. A release whose pipeline finished is asked about without the daily
 * pace and before every article, only the newest of each tool, and posted
 * the way an article is: thread, receipt, profile check.
 */
export const RELEASES_URL = `https://api.github.com/repos/${SPEC.RELEASE_REPO}/releases?per_page=10`

/** The fields of GitHub's release object the desk reads. */
export interface GhRelease {
  tag_name: string
  name?: string | null
  body?: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at?: string | null
  assets?: Array<{ name: string }>
}

/** Our tags (t27c-v0.5.2, t27b-v0.1.0): the tool and version, or null. Pure. */
export function releaseOf(
  tag: string
): { tool: string; version: string } | null {
  const m = /^(t27c|t27b)-v(\d+\.\d+\.\d+)$/.exec(tag)
  return m ? { tool: m[1], version: m[2] } : null
}

/** A release's row and card slug, in the card route's alphabet. Pure. */
export function releaseSlug(tag: string): string {
  return `release-${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/** The title a release slug stands for ("t27c 0.5.2 released"), else null. Pure. */
export function releaseTitleOfSlug(slug: string): string | null {
  const m = /^release-(t27c|t27b)-v(\d+)-(\d+)-(\d+)$/.exec(slug)
  return m ? `${m[1]} ${m[2]}.${m[3]}.${m[4]} released` : null
}

/**
 * What a release says about itself: its name's subtitle, else its first prose
 * paragraph, else how many changes GitHub's generated notes list. Pure.
 */
export function releaseSummary(r: GhRelease): string {
  const sub = /\s(?:—|--)\s+(.+)$/.exec(r.name ?? '')?.[1]
  if (sub) return sub.trim()
  const body = r.body ?? ''
  const prose = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .find(p => p && !/^[#*|>-]/.test(p))
  if (prose) return prose.replace(/\s+/g, ' ')
  const changes = body.split('\n').filter(l => /^[*-] /.test(l)).length
  return changes ? `${changes} changes since the previous release.` : ''
}

/** A release, carried as the desk carries an article. Pure. */
export function releaseArticle(r: GhRelease): Article {
  const slug = releaseSlug(r.tag_name)
  const out: Article = {
    slug,
    title: releaseTitleOfSlug(slug) ?? r.tag_name,
    link: r.html_url,
    summary: releaseSummary(r),
    kind: 'release',
  }
  const published = Date.parse(r.published_at ?? '')
  if (Number.isFinite(published)) out.published = published
  return out
}

/** The spec's release_offerable (compiled); an unknown age is the oldest. */
export const releaseOfferable = (
  ourTag: boolean,
  draft: boolean,
  prerelease: boolean,
  pipelineDone: boolean,
  ageMs: number,
  askedBefore: boolean,
  newestOfTool: boolean
) =>
  L.releaseOfferable(
    ourTag,
    draft,
    prerelease,
    pipelineDone,
    ageU32(ageMs),
    askedBefore,
    newestOfTool
  )

/*
 * The spec's may_ask_release (the pace holds articles back, not releases) and
 * release_first, compiled.
 */
export const { mayAskRelease, releaseFirst } = L

/**
 * The release to ask about, from GitHub's list (newest first): the newest
 * offerable one. `done` is asked only of a release every other rule lets
 * through; a pipeline that cannot be read is not finished.
 */
export async function nextRelease(
  list: readonly GhRelease[],
  asked: ReadonlySet<string>,
  nowMs: number,
  done: (r: GhRelease) => Promise<boolean>
): Promise<Article | undefined> {
  const toolsSeen = new Set<string>()
  const offerable: Article[] = []
  for (const r of list) {
    const ours = releaseOf(r.tag_name)
    const out = !r.draft && !r.prerelease
    const newest = !!ours && out && !toolsSeen.has(ours.tool)
    if (ours && out) toolsSeen.add(ours.tool)
    const rule = (finished: boolean) =>
      releaseOfferable(
        !!ours,
        r.draft,
        r.prerelease,
        finished,
        nowMs - Date.parse(r.published_at ?? ''),
        asked.has(releaseSlug(r.tag_name)),
        newest
      )
    if (rule(true) && rule(await done(r).catch(() => false)))
      offerable.push(releaseArticle(r))
  }
  return releaseFirst(offerable.length) ? offerable[0] : undefined
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
export const publishedSomewhere = (result: Record<string, string>) =>
  L.publishedSomewhere(
    'error' in result,
    Math.min(
      255,
      Object.values(result).filter(
        v =>
          String(v).includes(SEEN_ON_PROFILE) ||
          /* An API post came back with its own id: a receipt (meta-connect.ts). */
          String(v).startsWith('опубликовано через API') // cyrillic-ok: meta-connect.ts VIA_API
      ).length
    )
  )

/**
 * One network's line as a ledger state (spec v6 network_carries reads it):
 * the same words that decide a whole run's outcome, applied to one line.
 */
export function lineState(line: string): 'posted' | 'unconfirmed' | 'failed' {
  return outcomeOf({ line })
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

/** The community a Reddit press line names at its end (redditPressLine). */
const PRESSED_IN = /· r\/([A-Za-z0-9_]{2,30})$/

/** The Reddit line of a press, naming the community it went to. Pure. */
export function redditPressLine(line: string, subreddit: string): string {
  return `${line} · r/${subreddit}`
}

/**
 * Every `<subreddit>/<slug>` (lower case) this desk pressed "Post" for on
 * Reddit, from its own blog_shares rows -- the Reddit desk (reddit.ts) reads
 * it so the same article is not posted to the same community twice. A press
 * line written before it named its community went to the default one, the
 * only one this desk ever used. Pure.
 */
export function redditPressedKeys(
  rows: Array<{ slug?: unknown; detail?: unknown }>
): string[] {
  const out: string[] = []
  for (const row of rows) {
    const detail = (
      typeof row.detail === 'string' ? safeParse(row.detail) : row.detail
    ) as { result?: Record<string, unknown> } | null
    const line = String(detail?.result?.Reddit ?? '')
    if (!PRESSED.test(line)) continue
    const sub = PRESSED_IN.exec(line)?.[1] ?? subredditOf(undefined)
    out.push(`${sub}/${String(row.slug ?? '')}`.toLowerCase())
  }
  return out
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export type Answer = 'pending' | 'allowed' | 'denied' | 'expired'

/** The spec's `still_waiting` (compiled): pending and younger than the approval's lifetime. */
export const stillWaiting = (answer: Answer, ageMs: number) =>
  L.stillWaiting(answer, ageU32(ageMs))

/*
 * The spec's rules, compiled from blog-share.t27 (never retyped here):
 * `may_ask` (never asked, or the last question is a pace old), `posts` (only
 * a yes posts), `decline_is_real` (only a person's "no" -- twelve rows were
 * once closed as declined while their approval was still pending, tri
 * blog-share reoffer, #3279; an expiry is silence and is told as such),
 * `counted` and `unconfirmed` (the profile check: the page left the form AND
 * the profile shows it; pressed and not seen), and v6's
 * `question_offers_articles` and `autopost_on`.
 */
export const {
  mayAsk,
  posts,
  declineIsReal,
  counted,
  unconfirmed,
  questionOffersArticles,
  autopostOn,
} = L

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
  /**
   * The owner's queue as they wrote it (QUEUE_SKILL), '' when there is none.
   * Absent: the newest article goes next, as before spec v3.
   */
  queue?: () => Promise<string>
  /**
   * Autopost is on (spec v6, BLOG_AUTOPOST=1): articles are posted by
   * blog-autopost.ts and never asked about; open questions and releases
   * keep their yes. Absent or false: v5.
   */
  autopost?: boolean
  /**
   * Releases of SPEC.RELEASE_REPO, newest first, and whether one's pipeline
   * finished (spec v5). Absent: articles only, as before v5.
   */
  releases?: {
    list: () => Promise<GhRelease[]>
    done: (r: GhRelease) => Promise<boolean>
  }
}

/**
 * One tick. First the open question, if any: a yes posts, a no or silence
 * closes it. Then a finished release of ours, at once (spec v5). Then, at
 * most once a day, the next article not offered yet --
 * the owner's queue first, else the newest -- becomes a question. Returns
 * what it did, for the log.
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

  /* A finished release goes before every article and skips the pace (v5). */
  if (d.releases && mayAskRelease(Boolean(open[0]))) {
    const r = d.releases
    const { rows: seen } = await d.pool.query(`SELECT slug FROM blog_shares`)
    const asked = new Set((seen as Array<{ slug: string }>).map(x => x.slug))
    const release = await r
      .list()
      .then(list => nextRelease(list, asked, d.now(), r.done))
      .catch(() => undefined)
    if (release) {
      await askAbout(d, release)
      return `asked about ${release.slug} (a release)`
    }
  }

  /* Autopost posts the articles itself; only releases are still asked (v6). */
  if (!questionOffersArticles(Boolean(d.autopost)))
    return 'autopost: articles are posted, not asked about'

  /* Questions only: a row autopost wrote has no approval and sets no pace. */
  const { rows: last } = await d.pool.query(
    `SELECT extract(epoch from max(asked_at)) * 1000 AS at FROM blog_shares WHERE approval_id IS NOT NULL`
  )
  const lastAt = Number((last[0] as { at?: unknown } | undefined)?.at) || 0
  if (!mayAsk(lastAt > 0, ageU32(d.now() - lastAt)))
    return 'asked today already'

  const articles = parseRss(await d.fetchRss())
  if (!articles.length) return 'the feed is empty'
  const { rows: seen } = await d.pool.query(`SELECT slug FROM blog_shares`)
  const known = new Set((seen as Array<{ slug: string }>).map(r => r.slug))
  /* An unreadable queue is said in the log, and the newest goes next. */
  const queueText = d.queue ? await d.queue().catch(() => null) : ''
  const queue = queueOrder(
    queueText ?? '',
    articles.map(a => a.slug)
  )
  const pick = nextArticle(articles, known, queue, d.now())
  if (!pick) return 'every article was offered already'
  const next = pick.article
  await askAbout(d, next)
  return pick.queued
    ? `asked about ${next.slug} (the owner's queue)`
    : queueText === null
      ? `asked about ${next.slug} (newest: the queue could not be read)`
      : `asked about ${next.slug}`
}

/** The question goes to the owner, and its row remembers what it was about. */
async function askAbout(d: ShareDeps, a: Article): Promise<void> {
  const id = await d.ask(questionFor(a))
  await d.pool.query(
    `INSERT INTO blog_shares (slug, state, approval_id, detail) VALUES ($1, 'asked', $2, $3::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
    [a.slug, id, JSON.stringify(a)]
  )
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
  /* The spec's left_the_form, compiled. */
  return L.leftTheForm(before, after)
    ? LEFT_THE_FORM
    : 'не подтверждено: страница не сменилась' // cyrillic-ok: told to the owner
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

/**
 * DOES THE COMPOSER HOLD WHAT WAS TYPED? (2026-10-03) X's composer dropped
 * about 115 characters from the middle of a typed thread, and the desk
 * pressed "Post all" on the mangled text: "The seeg; a stand-alone unit..."
 * went out under the owner's name. So the boxes are read back before the
 * press. Any box on the page may be the one (the home timeline keeps its own
 * composer under the dialog); punctuation and spacing are not compared, the
 * words are. Pure.
 */
export function composerHolds(boxes: unknown, typed: string): boolean {
  const want = normalizeForMatch(typed)
  if (!want || !Array.isArray(boxes)) return false
  return boxes.some(b => normalizeForMatch(String(b ?? '')) === want)
}

/** The words looked for on the profile. Pure. */
export function needleOf(a: Article): string {
  return normalizeForMatch(a.title).slice(0, SPEC.MATCH_CHARS).trim()
}

/** Is the post on this page? An empty needle is never "seen". Pure. */
export function seenOn(pageText: string, needle: string): boolean {
  return needle.length > 0 && normalizeForMatch(pageText).includes(needle)
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
