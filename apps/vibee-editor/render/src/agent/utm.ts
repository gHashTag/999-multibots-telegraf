/**
 * EVERY MARKETING CHANNEL CARRIES A TAG (epic #2974).
 *
 * Owner, 2026-09-24: "every marketing channel should be tagged, so we know
 * where the traffic comes from". Until then the blog link the agent posted
 * to X, LinkedIn, Reddit and Threads was one and the same link: a visitor
 * from X and a visitor from Reddit looked identical.
 *
 * One tagger, three rules:
 * 1. ONLY OUR OWN PAGES are tagged. Somebody else's link is theirs; adding
 *    our parameters to it measures nothing and litters their analytics.
 * 2. A tag already there is never overwritten: a link a person tagged by
 *    hand knows better than a default.
 * 3. The query goes BEFORE the fragment. t27.ai routes by `#/blog/slug`, and
 *    `?utm_source=x` written after the `#` is part of the route, invisible to
 *    every analytics tool -- `t27.ai/?utm_source=x#/blog/slug` is the form.
 */

/** Hosts whose pages are ours to tag (and to count arrivals on). */
export const OWN_HOSTS = ['t27.ai', 'app.t27.ai', 'www.t27.ai'] as const // app-link-ok: our hosts to tag, not a link a person receives

/** Every channel the agents publish to, with its medium. */
export const CHANNELS = {
  x: 'social',
  linkedin: 'social',
  reddit: 'social',
  threads: 'social',
  instagram: 'social',
  facebook: 'social',
  tiktok: 'social',
  youtube: 'social',
  vk: 'social',
  habr: 'social',
  github: 'social',
  telegram: 'messenger',
  email: 'email',
} as const

export type Channel = keyof typeof CHANNELS

/** A tag value: lowercase letters, digits, `_ . -`, at most 60. Pure. */
export function tagValue(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Is this one of our pages? Pure. */
export function isOwnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (OWN_HOSTS as readonly string[]).includes(host)
  } catch {
    return false
  }
}

/*
 * A LINK INTO OUR BOT CARRIES ITS CHANNEL TOO (tick 9).
 *
 * A Telegram bot has no query string of its own: the one thing a t.me link
 * can hand it is the /start payload -- at most 64 characters of
 * [A-Za-z0-9_-] (Telegram's rule). So the channel rides at its end, after a
 * double underscore: `?start=app_feed` posted to the channel becomes
 * `?start=app_feed__telegram`. The bot (src/navigation/helpers/appLinks.ts
 * splitStartSource) cuts it off before reading the payload, and counts the
 * start by channel.
 *
 * Only payloads OUR bots build are tagged (START_OWN): somebody else's bot
 * would read `__x` as part of its own payload and break. A payload already
 * carrying a channel, or one that would pass 64 characters, is left alone.
 */
export const START_PAYLOAD_MAX = 64
export const START_SOURCE_SEP = '__'
const START_OWN =
  /^(?:(?:app|svc|subscribe)_[a-z0-9_]+|club|foundry|topup(?:_[a-z]+)?)$/
const TELEGRAM_HOSTS = ['t.me', 'telegram.me', 'www.t.me']

/** The channel as a /start suffix can carry it: [a-z0-9-] only. Pure. */
export function startTag(channel: string): string {
  return tagValue(channel)
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 32)
}

/**
 * A t.me link to one of our bots, with the channel at the end of its /start
 * payload; anything else exactly as given. Pure.
 */
export function taggedBotLink(url: string, channel: Channel): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  if (!TELEGRAM_HOSTS.includes(u.hostname.toLowerCase())) return url
  const start = u.searchParams.get('start')
  if (!start || start.includes(START_SOURCE_SEP) || !START_OWN.test(start))
    return url
  const tag = startTag(channel)
  const next = `${start}${START_SOURCE_SEP}${tag}`
  if (!tag || next.length > START_PAYLOAD_MAX) return url
  u.searchParams.set('start', next)
  return u.toString()
}

/**
 * The link as the given channel should carry it: utm tags on our pages, the
 * channel at the end of the /start payload on a link into our bot. Anything
 * else, or not a URL: returned exactly as given. Pure.
 */
export function tagged(
  url: string,
  channel: Channel,
  opts: { campaign?: string; content?: string } = {}
): string {
  if (!isOwnUrl(url)) return taggedBotLink(url, channel)
  const u = new URL(url)
  const set = (k: string, v: string) => {
    if (v && !u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  set('utm_source', channel)
  set('utm_medium', CHANNELS[channel])
  set('utm_campaign', tagValue(opts.campaign))
  set('utm_content', tagValue(opts.content))
  return u.toString()
}
