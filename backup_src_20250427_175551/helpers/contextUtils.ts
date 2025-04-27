import type { MyContext } from '@/interfaces'
import { Message } from 'telegraf/typings/core/types/typegram'
import { logger } from '@/utils/logger'

/**
 * Extracts the invite code from the context (message text).
 * Handles both direct commands like /start <code> and deep links.
 * @param ctx - The Telegraf context object.
 * @returns The extracted invite code as a string, or an empty string if not found.
 */
export function extractInviteCodeFromContext(ctx: MyContext): string {
  let inviteCode = ''
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  if (ctx.message && 'text' in ctx.message) {
    const messageText = (ctx.message as Message.TextMessage).text
    // Check for command /start code or deep link
    // Regex explained:
    // ^\/start (\S+) : Matches /start followed by space and non-space characters (captured in group 1)
    // |
    // https:\/\/t\.me\/[a-zA-Z0-9_]+\?start=(\d+) : Matches a telegram deep link with digits as code (captured in group 2)
    const codeMatch = messageText.match(
      /^\/start (\S+)|https:\/\/t\.me\/[a-zA-Z0-9_]+\?start=(\d+)/i
    )

    if (codeMatch) {
      // codeMatch[1] will contain the code from /start command, or undefined
      // codeMatch[2] will contain the code from the deep link, or undefined
      inviteCode = codeMatch[1] || codeMatch[2] || '' // Take whichever group matched

      if (inviteCode) {
        logger.info({
          message: `[extractInviteCode] Referral code found: ${inviteCode}`,
          telegramId,
          function: 'extractInviteCodeFromContext',
          inviteCode,
          matchType: codeMatch[1] ? 'command' : 'deepLink',
        })
      } else {
        // This case should ideally not happen if codeMatch is not null, but added for safety
        logger.warn({
          message:
            '[extractInviteCode] Regex matched but no invite code captured.',
          telegramId,
          function: 'extractInviteCodeFromContext',
          matchedText: messageText,
        })
      }
    }
  } else {
    logger.info({
      message:
        '[extractInviteCode] No message text found in context to extract invite code.',
      telegramId,
      function: 'extractInviteCodeFromContext',
    })
  }

  return inviteCode
}
