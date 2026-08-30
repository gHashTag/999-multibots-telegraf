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
