/**
 * WHERE THE ADMIN CHANNEL ACTUALLY IS, FOR EVERYONE WHO SENDS TO IT.
 *
 * Production sets `ADMIN_CHAT_ID=neuro_blogger_pulse`. Measured 2026-09-15
 * against the live Bot API with the production token:
 *
 *   getChat  neuro_blogger_pulse   -> 400 Bad Request: chat not found
 *   getChat @neuro_blogger_pulse   -> ok, supergroup -1002298297094
 *
 * A username addresses a chat only with the `@`. The repository already learned
 * this once -- `resolvePulseChatId` adds it, and a test pins that exact value --
 * but the lesson was applied to one caller. Five others read the variable raw
 * and hand it to Telegram unchanged: the provider health monitor, the Inngest
 * failure handler, the successful-payment admin notice, the autofix notifier,
 * and safe mode's redirect target.
 *
 * So the rule lives here now and every caller asks it, rather than each caller
 * remembering. `resolvePulseChatId` defers to the same function, so there is one
 * definition of what a chat id is and not two that can drift.
 *
 * Deliberately dependency-free -- no logger, no Telegram, no database. Safe
 * mode imports it, and safeMode.ts is documented as importable from any function
 * file without pulling in side effects.
 */

/**
 * A chat id as Telegram will accept it, or '' for nothing usable.
 *
 * Numeric ids (`-1002298297094`, `144022504`) pass through. Anything else is a
 * username and gets its `@`. Whitespace is stripped because a trailing space in
 * a deploy variable is invisible and answers "chat not found" just as flatly.
 */
export function normalizeChatId(raw: string | undefined | null): string {
  const candidate = (raw || '').trim()
  if (!candidate) return ''
  if (/^-?\d+$/.test(candidate)) return candidate
  return candidate.startsWith('@') ? candidate : `@${candidate}`
}

/**
 * The admin/owner channel, addressable, or null when nothing is configured.
 *
 * Null rather than '' on purpose: every caller must decide what to do with an
 * unconfigured channel, and safe mode's answer -- skip the send entirely, never
 * fall back to the real user -- is not the same as the health monitor's.
 */
export function resolveAdminChatId(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return normalizeChatId(env.ADMIN_CHAT_ID) || null
}
