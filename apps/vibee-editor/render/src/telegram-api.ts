/**
 * WHERE THE BOT API LIVES -- THE RENDER SERVER'S COPY.
 *
 * The reasoning lives in `src/services/telegramApi.ts` on the bot side and is
 * not repeated here. The short version: a bot that has called `logOut` on the
 * cloud API works ONLY through a local Bot API server afterwards, so every call
 * site on the platform has to move at once, and one hard-coded
 * `https://api.telegram.org` anywhere is a bot that answers "Unauthorized"
 * forever. The 20 MB `getFile` ceiling is why anybody would want that move.
 *
 * WHY THIS IS A SECOND COPY
 *
 * The render server is a separate application with its own build and no path
 * alias into the bot's `src/`. Ten lines duplicated across the boundary is the
 * lesser evil against a build-time dependency between two deployables -- the
 * same trade the attachment marker format already makes across three clients
 * (see `src/agent/media-parts.ts`). Both copies read the SAME variable, so they
 * cannot disagree at runtime, which is the property that actually matters.
 */

export const CLOUD_API_ROOT = 'https://api.telegram.org'

const KEY = 'TELEGRAM_API_ROOT'

function configured(): string | null {
  const raw = (process.env[KEY] ?? '').trim()
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

  return raw.replace(/\/+$/, '')
}

/** The base every Bot API URL is built on. */
export function telegramApiRoot(): string {
  return configured() ?? CLOUD_API_ROOT
}

/** `${apiFor(token)}/getMe` -- the prefix every method call shares. */
export function telegramApiFor(token: string): string {
  return `${telegramApiRoot()}/bot${token}`
}

/**
 * The file-download prefix, which has a different shape: `/file/bot<token>/`.
 *
 * Kept here beside the other one because these two are the whole surface, and
 * a call site that builds the file URL by hand is exactly what this file is
 * meant to make unnecessary.
 */
export function telegramFileApiFor(token: string): string {
  return `${telegramApiRoot()}/file/bot${token}`
}
