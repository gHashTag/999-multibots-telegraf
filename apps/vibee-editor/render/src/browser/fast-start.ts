/**
 * THE WINDOW OPENS FAST, AND OPENS FASTER THE SECOND TIME.
 *
 * Three things the proxy does for the person's first seconds, none of which
 * change what the window IS:
 *
 *   1. The engine's bundles are named by their content hash
 *      (js/app.48a1d8f5.js). A file with that name can never change, so it
 *      is cached for a year. The pod sent no cache policy at all, and every
 *      reload -- the window reloads itself to reconnect -- fetched ~700 KB
 *      again, through two proxies and, since the pod moved to Singapore,
 *      across the Pacific twice.
 *   2. emoji.json is 188 KB the engine loads on every start for an emoji
 *      picker this window hides. It is answered here with an empty set.
 *   3. A POSTER: the person's page as it is right now, one JPEG from the
 *      browser itself, shown under the loader while the stream connects.
 *      A picture of your own page in a second beats a spinner for five.
 */

import { frontPage, screenshot } from './cdp'

/** A content-hashed engine asset: the hash is in the name, so it never changes. */
const HASHED_ASSET =
  /^\/(?:js|css|img|fonts?)\/[^?#]+\.[0-9a-f]{8}\.(?:js|css|svg|png|jpe?g|woff2?|ttf|eot)$/

export const YEAR_IMMUTABLE = 'public, max-age=31536000, immutable'

/** The cache policy to put on a response, or null to leave the pod's own. */
export function cachePolicyFor(
  method: string | undefined,
  path: string
): string | null {
  if ((method || 'GET').toUpperCase() !== 'GET') return null
  return HASHED_ASSET.test(path.split('?')[0]) ? YEAR_IMMUTABLE : null
}

export const EMOJI_PATH = '/emoji.json'

/**
 * The shape the engine reads (groups, list, keywords), empty. Anything less
 * and its startup throws before it connects.
 */
export const EMPTY_EMOJI = JSON.stringify({
  groups: [],
  list: [],
  keywords: {},
})

export const POSTER_PATH = '/__poster'

/** A poster later than this is not worth waiting for: the stream is coming. */
export const POSTER_TIMEOUT_MS = 4000

export interface PosterIo {
  front: (endpoint: string) => Promise<{ id: string }>
  shot: (endpoint: string, targetId: string) => Promise<string>
}

const POSTER_IO: PosterIo = { front: frontPage, shot: screenshot }

/**
 * The page the person left open, as JPEG bytes; null when there is no page,
 * no way to reach the browser, or it took too long. Never throws: a poster is
 * a courtesy, and the loader stands on its own without one.
 */
export async function posterOf(
  cdpEndpoint: string | null | undefined,
  io: PosterIo = POSTER_IO,
  timeoutMs = POSTER_TIMEOUT_MS
): Promise<Buffer | null> {
  if (!cdpEndpoint) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const take = (async () => {
    try {
      const page = await io.front(cdpEndpoint)
      const b64 = await io.shot(cdpEndpoint, page.id)
      return b64 ? Buffer.from(b64, 'base64') : null
    } catch {
      return null
    }
  })()
  try {
    return await Promise.race([take, late])
  } finally {
    clearTimeout(timer)
  }
}
