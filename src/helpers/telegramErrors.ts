/**
 * ONE VERDICT ON A TELEGRAM ERROR, IN ONE PLACE.
 *
 * `broadcast.service.ts` already knew that `400: Bad Request: chat not found`
 * is permanent: it deletes the user row on that answer and retries nothing.
 * `pulse.ts` did not know, so it answered the same verdict with three sends to
 * the same dead chat and three `logger.error` calls -- and every `logger.error`
 * is forwarded to the owner's Telegram, so one misconfigured channel became
 * three 🚨 alerts per generated image, for ever.
 *
 * The knowledge now lives here and both callers ask it.
 */

export interface TelegramErrorInfo {
  code?: number
  description: string
}

/** The Telegram API response buried in a Telegraf error, if there is one. */
export function telegramErrorInfo(error: unknown): TelegramErrorInfo {
  const response = (
    error as { response?: { error_code?: number; description?: unknown } }
  )?.response
  return {
    code: response?.error_code,
    description: String(
      response?.description ??
        (error instanceof Error ? error.message : (error ?? ''))
    ),
  }
}

/**
 * True when the destination cannot receive this message and never will, so
 * retrying is only noise. Deliberately NOT a bare 400: a single unescaped
 * character yields `can't parse entities`, also a 400, and that one IS worth
 * retrying without formatting.
 */
export function isChatGone(error: unknown): boolean {
  const { code, description } = telegramErrorInfo(error)
  if (code === 403) return true
  if (code !== 400) return false
  return /chat not found|user is deactivated|bot was blocked|bot was kicked|PEER_ID_INVALID|chat_id is empty|group chat was (deleted|migrated)/i.test(
    description
  )
}
