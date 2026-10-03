import { logger } from '@/utils/logger'

/**
 * THE TAP ON "ALLOW" REACHES THE RENDER, AND THE PERSON HEARS BACK.
 *
 * Owner, 2026-09-24: the permission buttons were `url` buttons. A url button
 * leaves Telegram for the phone's default browser, which holds no session of
 * ours -- so on his phone the permission did nothing at all, twice. The rule
 * has been written down since 2026-09-22 (links open INSIDE Telegram) and
 * this flow had never been brought under it.
 *
 * Now the answer is a callback tap, and this is the only thing between the
 * tap and the approval row: one call, the token as it stood in the link, and
 * a sentence for the person. It NEVER throws -- a render that is down must
 * leave the person with words, not with a button that did nothing.
 */
const BASE =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 10_000

/** What the person is told when the render cannot be reached at all. */
export const NOT_REACHED =
  'Не смог передать ответ — попробуйте ещё раз через минуту.' // cyrillic-ok: user-facing

export async function answerBrowserPermission(
  token: string,
  opts: { fetchImpl?: typeof fetch; key?: string } = {}
): Promise<string> {
  const t = String(token ?? '').trim()
  if (!t) return NOT_REACHED
  /*
   * THE SERVER KEY, OR THE RENDER NEVER HEARS THE TAP.
   *
   * The render's global guard answers 401 before routing to anything not on
   * its public list, and /api/browser/approve is not on it. Since #2939 made
   * the button a callback, this relay sent no key at all, so every "Allow"
   * came back 401 and the person read NOT_REACHED (measured in production
   * 2026-10-03 04:31). The token still decides WHICH question is answered;
   * the key only says the bot is the one asking.
   */
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  if (!key) {
    logger.error('[browser-approval] RENDER_API_KEY is not set, tap not sent')
    return NOT_REACHED
  }
  const doFetch = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await doFetch(
      `${BASE}/api/browser/approve?t=${encodeURIComponent(t)}`,
      {
        headers: { Accept: 'application/json', 'X-Api-Key': key },
        signal: ac.signal,
      }
    )
    if (!res.ok) {
      logger.warn('[browser-approval] the render refused the tap', {
        status: res.status,
      })
      return NOT_REACHED
    }
    const body = (await res.json()) as { said?: string }
    /*
     * The render owns the wording: it is the side that knows whether the
     * question was still open. A second copy here would drift, and the two
     * would disagree in front of the person on the day it mattered.
     */
    return String(body?.said ?? '').trim() || NOT_REACHED
  } catch (e) {
    logger.warn('[browser-approval] the tap did not reach the render', {
      error: e instanceof Error ? e.message : String(e),
    })
    return NOT_REACHED
  } finally {
    clearTimeout(timer)
  }
}
