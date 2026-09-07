/**
 * WHERE THE BOT API LIVES, AND WHAT IT WILL CARRY.
 *
 * ── WHY THIS IS ONE PLACE AND NOT A CONSTANT PER FILE ──────────────────────
 *
 * Telegram's own design forces it. A bot that has called `logOut` on the cloud
 * API works ONLY through a local Bot API server from that moment on. There is
 * no fallback, no mixed mode, and no per-call choice: going back requires
 * `close` on the local server and a wait.
 *
 * So the migration is all-or-nothing across the whole platform. One
 * `https://api.telegram.org` left hard-coded in one scene is a bot that answers
 * "Unauthorized" forever afterwards -- and the log will say nothing about which
 * of sixty-four call sites was missed.
 *
 * ── WHY ANYBODY WOULD WANT THAT MIGRATION ─────────────────────────────────
 *
 * The cloud `getFile` refuses anything over 20 MB, while the mini app accepts
 * 100 MB. A person sends a 40 MB video in the chat and is told to send a
 * smaller one; the same file uploads fine in the app. A local server serves up
 * to 2000 MB and ends that asymmetry.
 *
 * The ceiling is therefore derived from this same switch rather than living as
 * a separate constant somebody has to remember to change at the same time.
 *
 * ── WHY A BAD VALUE IS LOUD ───────────────────────────────────────────────
 *
 * The dangerous failure here is silent. A misconfigured root that quietly falls
 * back to the cloud looks correct in every log and every health check -- and
 * after `logOut` it stops every bot on the platform at once. A typo in one
 * variable must therefore stop the process at startup, where bots are
 * constructed, and say which variable it was.
 *
 * NOT SET is a different thing from BROKEN: unset means the cloud, which is
 * today's behaviour and must stay free of surprises.
 */

/** The public Bot API. What everything used before this file existed. */
export const CLOUD_API_ROOT = 'https://api.telegram.org'

/** `getFile` on the cloud API refuses anything above this. Telegram's number. */
const CLOUD_DOWNLOAD_LIMIT = 20 * 1024 * 1024

/** What a local Bot API server will serve. tdlib's number. */
const LOCAL_DOWNLOAD_LIMIT = 2000 * 1024 * 1024

const KEY = 'TELEGRAM_API_ROOT'

/**
 * The configured root, or null when there is none.
 *
 * Read on every call rather than captured at import: the value is read during
 * startup AND while building URLs, and a module-level snapshot would freeze
 * whatever happened to be in the environment when the first import ran.
 */
function configured(): string | null {
  const raw = (process.env[KEY] ?? '').trim()
  // An empty variable is how "unset" arrives from a shell or from a dashboard
  // field somebody cleared. Treating it as a root yields `https:///bot123/…`.
  if (!raw) return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(
      `${KEY}="${raw}" is not a URL. It must be the address of a Bot API ` +
        `server, e.g. http://bot-api.railway.internal:8081. Unset it to use ` +
        `the public API at ${CLOUD_API_ROOT}.`
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `${KEY}="${raw}" must be http or https, not "${parsed.protocol}".`
    )
  }

  // Every call site builds `${root}/bot${token}/method`; a trailing slash makes
  // that `//bot…`, which some proxies redirect and others answer 404 -- a
  // failure that reads like a bad token.
  return raw.replace(/\/+$/, '')
}

/** The base every Bot API URL is built on. */
export function telegramApiRoot(): string {
  return configured() ?? CLOUD_API_ROOT
}

/**
 * Are we talking to a local Bot API server?
 *
 * The variable pointed back at the cloud is NOT local, whatever it says --
 * otherwise the ceiling would rise to 2000 MB while `getFile` still refused at
 * 20, and the refusal would name a limit nobody is enforcing.
 */
export function telegramApiIsLocal(): boolean {
  const root = configured()
  return root !== null && root !== CLOUD_API_ROOT
}

/** The largest file `getFile` will hand over, for whichever server is in use. */
export function telegramDownloadLimit(): number {
  return telegramApiIsLocal() ? LOCAL_DOWNLOAD_LIMIT : CLOUD_DOWNLOAD_LIMIT
}

/**
 * `${telegramApiFor(token)}/sendMessage` -- the prefix every method shares.
 *
 * Provided so that a call site never writes the host out by hand. The guard in
 * `scripts/telegram-api-root-guard.cjs` enforces that.
 */
export function telegramApiFor(token: string): string {
  return `${telegramApiRoot()}/bot${token}`
}

/** The download prefix, which has the other shape: `/file/bot<token>/`. */
export function telegramFileApiFor(token: string): string {
  return `${telegramApiRoot()}/file/bot${token}`
}

/**
 * The options every `new Telegraf(...)` needs, so no construction site has to
 * remember the switch exists.
 *
 * Spread rather than assigned: passing `apiRoot: undefined` explicitly would
 * override Telegraf's own default with `undefined` on some option shapes.
 */
export function telegramClientOptions(): { apiRoot: string } {
  return { apiRoot: telegramApiRoot() }
}
