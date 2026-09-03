/**
 * Header keys whose VALUES must never reach logs: the internal API key
 * (x-secret-key = SECRET_API_KEY, which gates billing/models/diagnostic and
 * HMAC-signs callback tokens), auth, cookies, and the Telegram webhook secret.
 * The winston format only redacts bot-tokens-in-URLs, so logging req.headers
 * verbatim leaks these (CWE-532). Use this at every site that logs headers.
 */
const SENSITIVE_HEADER_KEYS = new Set([
  'x-secret-key',
  'authorization',
  'cookie',
  'x-telegram-bot-api-secret-token',
])

export function redactSensitiveHeaders(
  headers: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? '<redacted>' : v
  }
  return out
}

/**
 * Query keys whose VALUES must never reach logs.
 *
 * `cb` is the callback token: an HMAC over the RECIPIENT, built by
 * buildCallbackToken and checked by verifyCallbackToken. It is the only thing
 * standing between a stranger and "send this person any video and any caption,
 * from the bot they trust" -- the provider gives us no signature of its own, so
 * we sign our own callback address and verify that mark on the way in.
 *
 * The request logger printed req.url verbatim, and req.url carries the query.
 * So every provider callback wrote its own token into the log, right next to
 * the telegram_id it is bound to. Headers were already redacted at that site
 * (CWE-532); the URL was not, and the token does not travel in a header.
 *
 * The routes themselves already log this correctly -- `hasToken: Boolean(cb)`,
 * presence rather than value. This brings the URL in line with that.
 *
 * The list stays SHORT on purpose. Masking whole URLs would blind the log to
 * the paths people actually debug with; these keys carry credentials and
 * nothing diagnostic.
 */
const SENSITIVE_QUERY_KEYS = new Set([
  'cb',
  'token',
  'secret',
  'key',
  'sig',
  'signature',
])

/**
 * A URL safe to log: same path, same keys, secret VALUES masked.
 *
 * Keys are kept so a reader can still see that a token was present -- which is
 * usually the diagnostic question -- without the value being usable.
 */
export function redactSensitiveUrl(url: string | undefined | null): string {
  const raw = url ?? ''
  const cut = raw.indexOf('?')
  if (cut === -1) return raw
  const path = raw.slice(0, cut)
  const query = raw.slice(cut + 1)
  const parts = query.split('&').map(pair => {
    const eq = pair.indexOf('=')
    if (eq === -1) return pair
    const key = pair.slice(0, eq)
    return SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
      ? `${key}=<redacted>`
      : pair
  })
  return `${path}?${parts.join('&')}`
}
