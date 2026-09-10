/**
 * Safe mode for Inngest functions.
 *
 * A function runs in safe mode when either
 *   - the triggering event carries `data.e2e_test === true`, or
 *   - the process has `INNGEST_SAFE_MODE=1` (or `true`).
 *
 * In safe mode a function MUST:
 *   - send user-facing Telegram messages only to `ADMIN_CHAT_ID`
 *     (see `safeRecipient`);
 *   - skip balance operations and paid provider calls, returning
 *     `{ skipped: true, reason: 'safe-mode' }` (see `skippedInSafeMode`).
 *
 * This module is intentionally dependency-free (no Telegram, no DB) so that
 * any function file can import it without pulling in side effects.
 */

export interface SafeModeEventLike {
  data?: unknown
}

export interface SafeModeSkip {
  skipped: true
  reason: 'safe-mode'
  what: string
}

/** Lowest-privilege readers for `process.env` so tests can toggle at runtime. */
function envFlag(name: string): boolean {
  const raw = process.env[name]
  if (raw === undefined) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/**
 * Returns `true` when the run must not charge users, call paid APIs, or
 * message anyone other than the admin.
 */
export function isSafeMode(event?: SafeModeEventLike | null): boolean {
  if (envFlag('INNGEST_SAFE_MODE')) return true
  const data = event?.data
  if (data && typeof data === 'object') {
    const flag = (data as Record<string, unknown>).e2e_test
    if (flag === true) return true
  }
  return false
}

/**
 * Chat id that is allowed to receive messages in safe mode.
 * Returns `null` when `ADMIN_CHAT_ID` is not configured — callers must then
 * skip the send entirely (never fall back to the real user).
 */
export function safeModeAdminChatId(): string | null {
  const id = (process.env.ADMIN_CHAT_ID || '').trim()
  return id.length > 0 ? id : null
}

/**
 * Resolve the recipient for a user-facing message.
 *
 * - Not in safe mode → the intended `chatId` unchanged.
 * - Safe mode        → `ADMIN_CHAT_ID`, or `null` when it is not configured.
 */
export function safeRecipient(
  event: SafeModeEventLike | null | undefined,
  chatId: string | number
): string | null {
  if (!isSafeMode(event)) return String(chatId)
  return safeModeAdminChatId()
}

/**
 * Build the canonical "skipped" marker returned by steps that would have
 * charged a balance or called a paid provider.
 */
export function skippedInSafeMode(what: string): SafeModeSkip {
  return { skipped: true, reason: 'safe-mode', what }
}

/** Type guard for step results produced by `skippedInSafeMode`. */
export function isSafeModeSkip(value: unknown): value is SafeModeSkip {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as SafeModeSkip).skipped === true &&
    (value as SafeModeSkip).reason === 'safe-mode'
  )
}

/**
 * `true` when an `inngest/function.failed` event describes the failure of a
 * safe-mode (probe) run — its original event carried `data.e2e_test === true`.
 * Used by `createInngestFailureHandler` to keep the admin channel quiet: a
 * guard that rejects the probe payload is the expected outcome, and the
 * /inngest_probe report is where it is shown.
 */
export function isProbeFailureEvent(
  event?: {
    data?: { event?: { data?: unknown } } | Record<string, unknown> | null
  } | null
): boolean {
  const original = (event?.data as { event?: { data?: unknown } } | undefined)
    ?.event?.data
  return (
    !!original &&
    typeof original === 'object' &&
    (original as Record<string, unknown>).e2e_test === true
  )
}
