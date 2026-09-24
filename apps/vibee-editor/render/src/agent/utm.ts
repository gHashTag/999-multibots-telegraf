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
export const OWN_HOSTS = ['t27.ai', 'app.t27.ai', 'www.t27.ai'] as const

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

/**
 * The link as the given channel should carry it. Not ours, or not a URL:
 * returned exactly as given. Pure.
 */
export function tagged(
  url: string,
  channel: Channel,
  opts: { campaign?: string; content?: string } = {}
): string {
  if (!isOwnUrl(url)) return url
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
