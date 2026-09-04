import crypto from 'crypto'

/**
 * The secret Telegram must echo back on every webhook delivery.
 *
 * Without it, a webhook endpoint is protected only by the secrecy of its URL --
 * and the URL here is `https://<domain>/<botUsername>`, which is guessable by
 * anyone who knows the domain and can read the bot's public @name. A forged
 * POST to that path is an arbitrary Telegram update: the sender chooses
 * `from.id`, and several gates in this codebase decide on `from.id` alone,
 * including the admin check on the module that runs shell commands on the
 * production server.
 *
 * Derived from the bot token rather than configured. A new environment
 * variable would have to be set for every bot before the guard did anything,
 * and a guard that is off until someone remembers is the shape this loop keeps
 * finding. The token is already the bot's credential -- whoever holds it can
 * do everything the bot can -- so deriving from it adds no new secret to
 * store, and the derivation is one-way.
 *
 * Telegram accepts 1-256 characters of A-Z, a-z, 0-9, `_` and `-`.
 */
export function webhookSecretFor(botToken: string): string {
  if (!botToken) {
    throw new Error('webhookSecretFor: empty bot token')
  }
  return crypto
    .createHash('sha256')
    .update(`telegram-webhook-secret:${botToken}`)
    .digest('hex')
    .slice(0, 48)
}
