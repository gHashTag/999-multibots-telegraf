import { logger } from '@/utils/logger'
import { isChatGone, telegramErrorInfo } from './telegramErrors'

/**
 * WHERE THE PULSE CHANNEL ACTUALLY IS.
 *
 * `pulse.ts` posted to the literal `-1002737186844` in three places. Measured
 * on 2026-09-15 with the production token: @neuro_blogger_bot asked Telegram
 * for that chat and got `400: Bad Request: chat not found` -- the id does not
 * resolve for the bot that uses it. The channel the comment names is a real
 * supergroup, "НейроМентор - Приватный канал" (cyrillic-ok: its actual name),
 * and its id is -1002298297094; the deploy has been naming it correctly as
 * (`neuro_blogger_pulse`).
 *
 * So the storm of `[pulse] Ошибка при отправке ФОТО / ТЕКСТА` was never a
 * Telegram fault, a token fault or a user fault: it was one wrong digit-string,
 * retried three times per generated image.
 *
 * Order: PULSE_CHAT_ID wins, because whoever sets it means it. Then
 * ADMIN_CHAT_ID, which production already sets. The measured id is last, and
 * unlike its predecessor it has been verified against the live API.
 */
const MEASURED_PULSE_CHAT_ID = '-1002298297094'

export function resolvePulseChatId(
  env: NodeJS.ProcessEnv = process.env
): string {
  const candidate =
    (env.PULSE_CHAT_ID || '').trim() || (env.ADMIN_CHAT_ID || '').trim()
  if (!candidate) return MEASURED_PULSE_CHAT_ID
  // A @username reaches the same chat as its id, but only with the @.
  if (/^-?\d+$/.test(candidate)) return candidate
  return candidate.startsWith('@') ? candidate : `@${candidate}`
}

/**
 * A destination that answered "chat not found" will answer it again for every
 * image until a human adds the bot. Remember the verdict for a while so the
 * owner is told once rather than three times an image, and re-check afterwards
 * so fixing the membership heals without a deploy.
 */
const DEAD_DESTINATION_TTL_MS = 30 * 60 * 1000
let deadUntil = 0
let deadChatId = ''

export function isPulseDestinationDead(
  chatId: string,
  now: number = Date.now()
): boolean {
  return deadChatId === chatId && now < deadUntil
}

/**
 * Records a terminal delivery failure. Returns true when this is the first
 * report in the current window, i.e. when it is worth telling the owner.
 */
export function markPulseDestinationDead(
  chatId: string,
  error: unknown,
  now: number = Date.now()
): boolean {
  const first = !isPulseDestinationDead(chatId, now)
  deadChatId = chatId
  deadUntil = now + DEAD_DESTINATION_TTL_MS
  return first
}

/** Tests own the latch; production never resets it by hand. */
export function resetPulseDestinationState(): void {
  deadUntil = 0
  deadChatId = ''
}

/**
 * The single place that decides what a failed pulse send is worth. A dead
 * destination is a configuration problem, reported once as a warning with the
 * remedy in the text; anything else keeps its ERROR and its alert.
 *
 * Returns true when the caller should stop trying this destination.
 */
export function reportPulseFailure(
  stage: string,
  chatId: string,
  error: unknown,
  meta: Record<string, unknown> = {}
): boolean {
  const { code, description } = telegramErrorInfo(error)
  if (!isChatGone(error)) {
    logger.error(`❌ [pulse] ${stage}`, {
      description: `Pulse send failed: ${stage}`,
      error: error instanceof Error ? error.message : String(error),
      chatId,
      telegramErrorCode: code,
      telegramErrorDescription: description,
      ...meta,
    })
    return false
  }

  if (markPulseDestinationDead(chatId, error)) {
    logger.warn('⚠️ [pulse] Канал недоступен, отправка приостановлена', {
      description:
        'Pulse destination unreachable; pausing sends. Add the pulse bot to the chat or set PULSE_CHAT_ID.',
      chatId,
      stage,
      telegramErrorCode: code,
      telegramErrorDescription: description,
      retryAfterMinutes: DEAD_DESTINATION_TTL_MS / 60000,
      ...meta,
    })
  }
  return true
}
