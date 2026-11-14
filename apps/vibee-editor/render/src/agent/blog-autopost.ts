/**
 * EVERY BLOG POST GOES OUT BY ITSELF (spec automation/blog-share v6).
 *
 * Owner, 2026-10-09 (issue #3958): every new article of the t27.ai feed goes
 * to X, Telegram and the other networks without a question, and a schedule
 * publishes what was never published. Switched on by BLOG_AUTOPOST=1 beside
 * BLOG_SHARE_ENABLED=1; with it off the desk is v5 (blog-share.ts).
 *
 * One tick, at most one article:
 *   - a NEW article (first seen after the cutoff) goes at once, newest first
 *     (v4's order for fresh articles), under the day cap;
 *   - otherwise, inside a backlog slot nobody used, one BACKLOG article: the
 *     owner's queue first, then the newest (v3, v4);
 *   - each article gets one pass; a network that already carries it is
 *     skipped (an article on X and not in Telegram gets only Telegram);
 *   - the owner gets one receipt per article, never a question.
 *
 * Every rule is the spec's own compiled body (blog-share.logic.ts); the
 * numbers are its gen-ts output. What lives here is the database and the
 * order of calls. Nothing is kept in a file: the service has no volume, so
 * the cutoff, the first sight of each article, the passes and the ledger are
 * tables (created here as blog_shares is, CREATE TABLE IF NOT EXISTS).
 */
import type { Queryable } from '../browser/sessions'
import * as SPEC from '../spec/blog-share.gen'
import {
  autoOfferable,
  autoTake,
  backlogOfferable,
  backlogSlot,
  backlogSource,
  backlogTake,
  networkCarries,
  networkStep,
  telegramPosted,
} from '../spec/blog-share.logic'
import {
  ageU32,
  ensureBlogShares,
  headlineOf,
  lineState,
  outcomeOf,
  parseRss,
  queueOrder,
  SUBREDDIT,
  type Article,
} from './blog-share'

/** The networks the desk (publishEverywhere) reaches, by the names its result uses. */
export function deskNetworks(subreddit: string | null = SUBREDDIT): string[] {
  return [
    'X',
    'LinkedIn',
    'Threads',
    'Facebook',
    'Instagram',
    ...(subreddit === null ? [] : ['Reddit']),
  ]
}

/** What the Telegram channel answered: its message_id, or why there is none. */
export type TelegramAnswer = { messageId: number } | { error: string }

export interface AutopostDeps {
  pool: Queryable
  now: () => number
  fetchRss: () => Promise<string>
  /** The owner's queue as they wrote it (QUEUE_SKILL), '' when there is none. */
  queue?: () => Promise<string>
  /** publishEverywhere, told which networks already carry the article. */
  publish: (
    a: Article,
    skip: ReadonlySet<string>
  ) => Promise<Record<string, string>>
  telegram: {
    /** Both the channel's bot token and its chat id are set. */
    configured: boolean
    send: (a: Article) => Promise<TelegramAnswer>
  }
  /** The receipt to the owner. */
  tell: (text: string) => Promise<void>
}

let ready = false
export async function ensureAutopost(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS blog_autopost (
    id int PRIMARY KEY,
    cutoff_at timestamptz NOT NULL DEFAULT now()
  )`)
  await q.query(`CREATE TABLE IF NOT EXISTS blog_feed_seen (
    slug text PRIMARY KEY,
    seen_at timestamptz NOT NULL DEFAULT now()
  )`)
  await q.query(`CREATE TABLE IF NOT EXISTS blog_autopost_passes (
    slug text PRIMARY KEY,
    kind text NOT NULL,
    slot text UNIQUE,
    at timestamptz NOT NULL DEFAULT now()
  )`)
  await q.query(`CREATE TABLE IF NOT EXISTS blog_share_posts (
    slug text NOT NULL,
    network text NOT NULL,
    state text NOT NULL,
    line text,
    message_id bigint,
    at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (slug, network)
  )`)
  ready = true
}
export function resetAutopostForTests(): void {
  ready = false
}

/**
 * Autopost off: the cutoff is cleared (spec CUTOFF_CLEARED_WHEN_OFF), so the
 * next switch-on records a new one and everything published meanwhile is
 * backlog -- dripped on the schedule, not flooded.
 */
export async function autopostOff(q: Queryable): Promise<void> {
  if (!SPEC.CUTOFF_CLEARED_WHEN_OFF) return
  await ensureAutopost(q)
  await q.query(`DELETE FROM blog_autopost`)
}

/** A count, a second or an age as the spec's u32 takes it (blog-share.ts ageU32). */
const u32 = ageU32

const UTC_DAY_MS = 86_400_000 // t27-plumbing: the length of a UTC day, a calendar fact, not a rule

/** The backlog slot `nowMs` falls in, and its key (UTC date and slot number). */
export function slotAt(nowMs: number): { slot: number; key: string | null } {
  const slot = backlogSlot(
    u32((((nowMs % UTC_DAY_MS) + UTC_DAY_MS) % UTC_DAY_MS) / 1000)
  )
  return {
    slot,
    key: slot ? `${new Date(nowMs).toISOString().slice(0, 10)}#${slot}` : null,
  }
}

/**
 * Which networks carry each article: the ledger, then the yes path's own
 * results (blog_shares.detail.result, v5), read with the same words that
 * decide its outcome. Pure.
 */
export function carriedBy(
  ledger: Array<{ slug: string; network: string; state: string }>,
  shares: Array<{ slug: string; detail?: unknown }>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (slug: string, net: string) => {
    if (!out.has(slug)) out.set(slug, new Set())
    out.get(slug)!.add(net)
  }
  for (const r of ledger) if (networkCarries(r.state)) add(r.slug, r.network)
  for (const r of shares) {
    const detail = (
      typeof r.detail === 'string' ? safeParse(r.detail) : r.detail
    ) as { result?: Record<string, unknown> } | null
    for (const [net, line] of Object.entries(detail?.result ?? {}))
      if (networkCarries(lineState(String(line)))) add(r.slug, net)
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

/** Telegram's line when the channel is not set up on the service. */
export const TELEGRAM_NOT_CONFIGURED =
  'не настроено: нет TELEGRAM_CHANNEL_BOT_TOKEN / TELEGRAM_CHANNEL_ID' // cyrillic-ok: told to the owner
/** The line of a network that carried the article already. */
export const ALREADY_THERE = 'уже опубликовано раньше — пропущено' // cyrillic-ok: told to the owner

/**
 * One autopost tick. Returns what it did, for the log. Never posts more than
 * one article; never posts an article twice to a network.
 */
export async function blogAutopostTick(d: AutopostDeps): Promise<string> {
  await ensureBlogShares(d.pool)
  await ensureAutopost(d.pool)
  const articles = parseRss(await d.fetchRss())
  if (!articles.length) return 'autopost: the feed is empty'
  const slugs = articles.map(a => a.slug)

  /*
   * First sight BEFORE the cutoff: on the first tick the whole feed is seen
   * a moment before the cutoff is written, so all of it is backlog; equal
   * seconds read as backlog too (spec is_new).
   */
  await d.pool.query(
    `INSERT INTO blog_feed_seen (slug) SELECT unnest($1::text[]) ON CONFLICT (slug) DO NOTHING`,
    [slugs]
  )
  await d.pool.query(
    `INSERT INTO blog_autopost (id, cutoff_at) VALUES (1, now()) ON CONFLICT (id) DO NOTHING`
  )
  const { rows: cut } = await d.pool.query(
    `SELECT floor(extract(epoch from cutoff_at)) AS s FROM blog_autopost WHERE id = 1`
  )
  const cutoffS = u32(Number((cut[0] as { s?: unknown } | undefined)?.s) || 0)
  const { rows: seenRows } = await d.pool.query(
    `SELECT slug, floor(extract(epoch from seen_at)) AS s FROM blog_feed_seen WHERE slug = ANY($1::text[])`,
    [slugs]
  )
  const seen = new Map(
    (seenRows as Array<{ slug: string; s: unknown }>).map(r => [
      r.slug,
      u32(Number(r.s) || 0),
    ])
  )
  const { rows: passRows } = await d.pool.query(
    `SELECT slug, kind, slot, extract(epoch from at) * 1000 AS at_ms FROM blog_autopost_passes`
  )
  const passes = passRows as Array<{
    slug: string
    kind: string
    slot: string | null
    at_ms: unknown
  }>
  const { rows: ledger } = await d.pool.query(
    `SELECT slug, network, state FROM blog_share_posts`
  )
  const { rows: shares } = await d.pool.query(
    `SELECT slug, state, detail FROM blog_shares`
  )
  const passed = new Set(passes.map(p => p.slug))
  const asked = new Set(
    (shares as Array<{ slug: string; state: string }>)
      .filter(r => r.state === 'asked')
      .map(r => r.slug)
  )
  const carried = carriedBy(
    ledger as Array<{ slug: string; network: string; state: string }>,
    shares as Array<{ slug: string; detail?: unknown }>
  )
  const recent = passes.filter(
    p => Number(p.at_ms) > d.now() - SPEC.AUTO_DAY_MS
  )
  const autoToday = u32(recent.length)
  const backlogToday = u32(recent.filter(p => p.kind === 'backlog').length)

  /* New articles first, newest first (the feed's order, v4's rule for fresh ones). */
  const fresh = articles.filter(a =>
    autoOfferable(
      true,
      true,
      seen.get(a.slug) ?? 0,
      cutoffS,
      passed.has(a.slug)
    )
  )
  const newTaken = autoTake(u32(fresh.length), autoToday)
  if (newTaken > 0) return await pass(d, fresh[0], 'new', null, carried)

  const targets = [
    ...deskNetworks(),
    ...(d.telegram.configured ? [SPEC.TELEGRAM] : []),
  ]
  const missing = (slug: string) =>
    targets.filter(n => !carried.get(slug)?.has(n)).length
  const backlog = articles.filter(a =>
    backlogOfferable(
      true,
      true,
      seen.get(a.slug) ?? 0,
      cutoffS,
      passed.has(a.slug),
      asked.has(a.slug),
      u32(missing(a.slug))
    )
  )
  const { slot, key } = slotAt(d.now())
  const slotUsed = key !== null && passes.some(p => p.slot === key)
  const take = backlogTake(
    slot,
    slotUsed,
    u32(backlog.length),
    newTaken,
    backlogToday,
    autoToday
  )
  if (take === 0)
    return fresh.length
      ? `autopost: day cap reached (${autoToday}), ${fresh.length} new waiting`
      : `autopost: nothing due (${backlog.length} in the backlog, slot ${slot || 'none'})`

  /* The owner's queue first, then the newest (spec backlog_source). */
  const queueText = d.queue ? await d.queue().catch(() => '') : ''
  const queued = queueOrder(
    queueText,
    backlog.map(a => a.slug)
  )
  const source = backlogSource(u32(queued.length), u32(backlog.length))
  const next =
    source === 'queue' ? backlog.find(a => a.slug === queued[0])! : backlog[0]
  return await pass(d, next, 'backlog', key, carried)
}

/** One article's pass: claim it, post where it is missing, record, tell. */
async function pass(
  d: AutopostDeps,
  a: Article,
  kind: 'new' | 'backlog',
  slot: string | null,
  carried: Map<string, Set<string>>
): Promise<string> {
  /*
   * The claim comes first and is atomic: a restart, a second container or a
   * used slot makes the insert a no-op, and nothing is posted.
   */
  const { rows: claimed } = await d.pool.query(
    `INSERT INTO blog_autopost_passes (slug, kind, slot) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING slug`,
    [a.slug, kind, slot]
  )
  if (!claimed.length) return `autopost: ${a.slug} was claimed already`
  const has = carried.get(a.slug) ?? new Set<string>()
  const result: Record<string, string> = {}
  const record = async (
    network: string,
    state: string,
    line: string,
    messageId: number | null = null
  ) =>
    d.pool.query(
      `INSERT INTO blog_share_posts (slug, network, state, line, message_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug, network) DO UPDATE SET state = EXCLUDED.state, line = EXCLUDED.line,
         message_id = EXCLUDED.message_id, at = now()
       WHERE blog_share_posts.state NOT IN ('posted', 'unconfirmed')`,
      [a.slug, network, state, line, messageId]
    )

  /* Telegram: the channel's bot, the title and the static link. */
  const tg = networkStep(has.has(SPEC.TELEGRAM), d.telegram.configured)
  if (tg === 'skip') result.Telegram = ALREADY_THERE
  else if (tg === 'not-configured') {
    result.Telegram = TELEGRAM_NOT_CONFIGURED
    await record(SPEC.TELEGRAM, 'not-configured', TELEGRAM_NOT_CONFIGURED)
  } else {
    const answer = await d.telegram
      .send(a)
      .catch(e => ({ error: String(e).slice(0, 200) }))
    const id = 'messageId' in answer ? answer.messageId : 0
    if ('messageId' in answer && telegramPosted(u32(id))) {
      result.Telegram = `опубликовано через API · Telegram, message_id ${id}` // cyrillic-ok: told to the owner; starts with meta-connect.ts VIA_API
      await record(SPEC.TELEGRAM, 'posted', result.Telegram, id)
    } else {
      result.Telegram = `ошибка: ${'error' in answer ? answer.error : 'нет message_id'}` // cyrillic-ok: told to the owner
      await record(SPEC.TELEGRAM, 'failed', result.Telegram)
    }
  }

  /* The desk's networks: APIs first, then the browser (publishEverywhere). */
  const skip = new Set(deskNetworks().filter(n => has.has(n)))
  const desk =
    skip.size === deskNetworks().length
      ? {}
      : await d
          .publish(a, skip)
          .catch(
            e => ({ error: String(e).slice(0, 200) }) as Record<string, string>
          )
  for (const net of skip) result[net] = ALREADY_THERE
  for (const [net, line] of Object.entries(desk)) {
    result[net] = line
    if (net === 'error' || net === 'browser') continue
    if (networkStep(has.has(net), true) !== 'post') continue
    await record(net, lineState(line), line)
  }

  const outcome = outcomeOf(result)
  await d.pool.query(
    `INSERT INTO blog_shares (slug, state, detail, done_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (slug) DO UPDATE SET detail = COALESCE(blog_shares.detail, '{}'::jsonb) || jsonb_build_object('autopost', $4::jsonb)`,
    [
      a.slug,
      outcome,
      JSON.stringify({ ...a, result, autopost: { kind, slot, result } }),
      JSON.stringify({ kind, slot, result }),
    ]
  )
  const label =
    kind === 'new'
      ? '🤖 Автопост, новая статья' // cyrillic-ok: shown to the owner
      : '🤖 Автопост по расписанию' // cyrillic-ok: shown to the owner
  await d
    .tell(
      `${label}\n${headlineOf(result)}«${a.title}»\n` +
        Object.entries(result)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
    )
    .catch(() => {})
  return `autopost: ${a.slug} (${kind}): ${outcome}`
}
