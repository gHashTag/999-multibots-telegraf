import { API_BASE } from '@/config'

/**
 * A VISITOR FROM A TAGGED LINK IS COUNTED ONCE (epic #2974).
 *
 * Every link our agents publish carries its channel (render utm.ts): the
 * blog post on X says utm_source=x, the one on Reddit says reddit. This is
 * the arrival half: the app reads those tags from its own address once per
 * visit and tells render, which keeps a count per channel and nothing else.
 *
 * No tags, no call: an untagged visit is not "direct traffic" we can prove,
 * so it is not counted as anything.
 */
export interface ArrivalTags {
  source: string
  medium?: string
  campaign?: string
  content?: string
}

/** The utm tags of an address's query, or null when it has no source. Pure. */
export function arrivalFromSearch(search: string): ArrivalTags | null {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const source = (q.get('utm_source') ?? '').trim()
  if (!source) return null
  const tags: ArrivalTags = { source }
  for (const [k, key] of [
    ['utm_medium', 'medium'],
    ['utm_campaign', 'campaign'],
    ['utm_content', 'content'],
  ] as const) {
    const v = (q.get(k) ?? '').trim()
    if (v) tags[key] = v
  }
  return tags
}

const ONCE_KEY = 'traffic:arrival-reported'

/**
 * Report this visit's tags, once per browser session. Storage that throws
 * (private mode, a preview) only means the visit may be counted twice; a
 * failed call is dropped -- the page never waits on its own analytics.
 */
export async function reportArrival(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  send: typeof fetch = fetch
): Promise<boolean> {
  const tags = arrivalFromSearch(search)
  if (!tags) return false
  try {
    if (sessionStorage.getItem(ONCE_KEY)) return false
    sessionStorage.setItem(ONCE_KEY, '1')
  } catch {
    /* no storage: count anyway */
  }
  try {
    await send(`${API_BASE}/api/traffic/arrival`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tags),
      keepalive: true,
    })
    return true
  } catch {
    return false
  }
}
