/**
 * KEEP THE CONFIRMATION SECRET OUT OF THE LOGS.
 *
 * The one-time secret that authorises sending a prepared Telegram message
 * rides in the button's callback data -- deliberately, because Telegram stores
 * it and hands it back on the press, so the bot holds no state between showing
 * a card and the tap.
 *
 * The consequence, measured on this branch: the bot prints callback data
 * wholesale in two places, so every press wrote the live secret to stdout in
 * full --
 *
 *   bot.use(Telegraf.log(console.log))   // JSON.stringify(ctx.update, null, 2)
 *   console.log('📨 INCOMING UPDATE:', { callback: callbackData, ... })
 *
 * -- and neither `redactBotToken` nor `sanitizeForLogging` touches it: the
 * first matches only bot tokens, the second only collapses Buffers. Anybody
 * who can read the logs could take a secret out of them and confirm a send.
 *
 * A secret in a log is a secret that has left the building: log shipping,
 * screenshots in a chat, a support ticket. The repository already carries a
 * ratchet of exactly this shape for the Stars webhook secret; this is that one
 * for this secret.
 *
 * ── WHY THE ID SURVIVES ────────────────────────────────────────────────────
 *
 * Only the secret is cut. The id stays, because the whole reason to log a
 * press is to be able to answer "who confirmed what, when" -- and the id is
 * exactly that, while being useless on its own.
 */

/**
 * `tgp:ok:<id>:<secret>` and `tgp:no:<id>:<secret>`.
 *
 * Anchored on the prefix rather than on "a long hex string", so it cannot
 * quietly eat an unrelated value that happens to look similar.
 */
const CALLBACK_SECRET = /(tgp:(?:ok|no):[^:\s"']+):[^\s"']+/g

/**
 * Replace every confirmation secret in a string with a marker.
 *
 * Takes and returns a string so it can wrap an already-serialised log line --
 * which is what `Telegraf.log` hands over, and the reason a field-by-field
 * scrubber would not have helped there.
 */
export function scrubCallbackSecrets(text: string): string {
  if (typeof text !== 'string' || !text.includes('tgp:')) return text
  return text.replace(CALLBACK_SECRET, '$1:<секрет скрыт>')
}

/**
 * A logger that scrubs before it prints.
 *
 * Passed to `Telegraf.log` in place of a bare `console.log`, so the whole
 * update dump goes through the same filter.
 */
/**
 * A customer's words in the owner's private chat are not ours to keep in a
 * log. `Telegraf.log` dumps every update as pretty-printed JSON, so a business
 * message would print the customer's text and caption verbatim; the business
 * service itself logs only `textLength`. Cut the values here, keep the keys,
 * and leave every other update untouched.
 */
const BUSINESS_UPDATE = /"(business_message|edited_business_message)"/
const TEXT_VALUE = /("(?:text|caption)":\s*")((?:[^"\\]|\\.)*)(")/g

export function scrubBusinessText(text: string): string {
  if (typeof text !== 'string' || !BUSINESS_UPDATE.test(text)) return text
  return text.replace(
    TEXT_VALUE,
    (_m, open: string, value: string, close: string) =>
      `${open}<${value.length} chars hidden>${close}`
  )
}

export function scrubbedLog(...parts: unknown[]): void {
  console.log(
    ...parts.map(p =>
      typeof p === 'string' ? scrubBusinessText(scrubCallbackSecrets(p)) : p
    )
  )
}
