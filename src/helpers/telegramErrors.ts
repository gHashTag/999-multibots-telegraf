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

/**
 * The closed list of Telegram rejections the CUSTOMER causes.
 *
 * The level a line is logged at is a routing decision in this repository:
 * `utils/logger.ts` binds the Telegram transport at level 'error', so every
 * `logger.error` is a push notification to the owner. `bot.catch` classified
 * exactly two causes -- 401 and 403 -- and sent everything else to that push,
 * so pressing a button on yesterday's message ('query is too old'), tapping
 * the same toggle twice ('message is not modified') or cancelling a wizard
 * whose message was already deleted all woke the owner with nothing to do.
 *
 * Deliberately a closed list rather than "any 400". A 400 also carries
 * `can't parse entities` -- a message OUR code built with broken markup, which
 * is a real defect and must keep paging. Anything not named here is ours.
 */
export function isUserCausedTelegramError(error: unknown): boolean {
  if (isChatGone(error)) return true
  const { code, description } = telegramErrorInfo(error)
  // 429 is Telegram throttling US. It is not the customer and not a defect,
  // but a page cannot make it go away either -- the retry_after does that.
  if (code === 429) return true
  if (code !== 400) return false
  return /query is too old|query ID is invalid|message is not modified|message to (edit|delete|reply to) not found|message can't be (edited|deleted)|MESSAGE_ID_INVALID|have no rights to send|not enough rights|CHAT_WRITE_FORBIDDEN|topic_closed|message to forward not found/i.test(
    description
  )
}
