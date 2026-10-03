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

/*
 * SAY WHY, AND SAY WHAT TO DO.
 *
 * Owner, 2026-10-03: "why does the CRM bot keep sending 'could not pass the
 * answer on'?" One sentence covered four different failures, and for nine
 * days it was the 401 of a missing key -- which no number of retries "in a
 * minute" could ever cure. Each failure now gets its own words, and every
 * one of them says the button is back, because the handler restores it.
 */
export const SAID = {
  // The bot could not prove who it is. Retrying does not help; we fix it.
  noKey:
    'Сервер не принял бота — это наша поломка, уже видим её в логах. Кнопка вернулась, нажмите её позже.', // cyrillic-ok: user-facing
  // 5xx: the render is mid-deploy (a Railway swap takes about a minute).
  restarting:
    'Сервер перезапускается. Кнопка вернулась — нажмите её ещё раз через минуту.', // cyrillic-ok: user-facing
  timeout: 'Сервер не ответил вовремя. Кнопка вернулась — нажмите её ещё раз.', // cyrillic-ok: user-facing
  offline:
    'Нет связи с сервером. Кнопка вернулась — нажмите её ещё раз через минуту.', // cyrillic-ok: user-facing
} as const

export type Why = keyof typeof SAID | 'answered' | 'empty'

export interface TapOutcome {
  /** The sentence for the person. */
  said: string
  /** True when the render answered; false means the button should return. */
  reached: boolean
  why: Why
}

/*
 * ONE QUIET RETRY, ONLY WHERE IT CAN HELP.
 *
 * A 5xx, a timeout or a dropped connection is usually the minute of a
 * deploy swap, so the bot tries once more after RETRY_AFTER_MS before
 * troubling the person. A 401/403 is never retried: it is our defect, and
 * a second identical request gets the identical refusal.
 *
 * Safe to repeat: the render decides a token once (decideByToken), so a
 * first attempt that landed but lost its reply makes the second one read
 * "this question is already closed" -- never a second decision.
 */
export const RETRY_AFTER_MS = 3_000

export async function answerBrowserPermission(
  token: string,
  opts: TapOptions = {}
): Promise<string> {
  return (await tapBrowserPermission(token, opts)).said
}

interface TapOptions {
  fetchImpl?: typeof fetch
  key?: string
  sleep?: (ms: number) => Promise<void>
}

export async function tapBrowserPermission(
  token: string,
  opts: TapOptions = {}
): Promise<TapOutcome> {
  const t = String(token ?? '').trim()
  if (!t) return { said: NOT_REACHED, reached: false, why: 'empty' }
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
    return { said: SAID.noKey, reached: false, why: 'noKey' }
  }
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  let last = await once(t, key, opts.fetchImpl ?? fetch)
  if (!last.reached && last.why !== 'noKey') {
    await sleep(RETRY_AFTER_MS)
    last = await once(t, key, opts.fetchImpl ?? fetch)
  }
  return last
}

async function once(
  t: string,
  key: string,
  doFetch: typeof fetch
): Promise<TapOutcome> {
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
      const refused = res.status === 401 || res.status === 403
      ;(refused ? logger.error : logger.warn)(
        '[browser-approval] the render refused the tap',
        { status: res.status }
      )
      return refused
        ? { said: SAID.noKey, reached: false, why: 'noKey' }
        : { said: SAID.restarting, reached: false, why: 'restarting' }
    }
    const body = (await res.json().catch(() => ({}))) as { said?: string }
    /*
     * The render owns the wording: it is the side that knows whether the
     * question was still open. A second copy here would drift, and the two
     * would disagree in front of the person on the day it mattered.
     */
    const said = String(body?.said ?? '').trim()
    if (!said) {
      logger.warn('[browser-approval] the render answered without words')
      return { said: SAID.restarting, reached: false, why: 'restarting' }
    }
    return { said, reached: true, why: 'answered' }
  } catch (e) {
    const timedOut = ac.signal.aborted
    logger.warn('[browser-approval] the tap did not reach the render', {
      error: e instanceof Error ? e.message : String(e),
      timedOut,
    })
    return timedOut
      ? { said: SAID.timeout, reached: false, why: 'timeout' }
      : { said: SAID.offline, reached: false, why: 'offline' }
  } finally {
    clearTimeout(timer)
  }
}
