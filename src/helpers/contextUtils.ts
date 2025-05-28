import type { MyContext } from '@/interfaces'
import type { Message } from 'telegraf/types'
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

    // First check if it's a promo link - if so, don't extract as referral
    if (messageText.match(/^\/start\s+promo(?:\s+\S+)?/i)) {
      logger.info({
        message:
          '[extractInviteCode] Promo link detected, skipping referral extraction',
        telegramId,
        function: 'extractInviteCodeFromContext',
        messageText,
      })
      return ''
    }

    // Check for command /start code or deep link
    // Regex explained:
    // ^\/start\s+(\d+) : Matches /start followed by whitespace and digits (captured in group 1)
    // |
    // https:\/\/t\.me\/[a-zA-Z0-9_]+\?start=(\d+) : Matches a telegram deep link with digits as code (captured in group 2)
    const codeMatch = messageText.match(
      /^\/start\s+(\d+)|https:\/\/t\.me\/[a-zA-Z0-9_]+\?start=(\d+)/i
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

/**
 * Extracts promo parameter from the context (message text).
 * Handles /start promo command to detect promo link usage.
 * Supports specific promo types: neurovideo, neurophoto, video, photo
 * @param ctx - The Telegraf context object.
 * @returns Object with isPromo flag and extracted parameter, or null if not a promo link.
 */
export function extractPromoFromContext(
  ctx: MyContext
): { isPromo: boolean; parameter?: string } | null {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  if (ctx.message && 'text' in ctx.message) {
    const messageText = (ctx.message as Message.TextMessage).text

    // Check for /start promo command with optional parameter
    // Supports: /start promo, /start promo neurovideo, /start promo neurophoto, etc.
    const promoMatch = messageText.match(/^\/start\s+promo(?:\s+(\S+))?/i)

    if (promoMatch) {
      const parameter = promoMatch[1] || '' // Optional parameter after promo

      logger.info({
        message: `[extractPromo] Promo link detected`,
        telegramId,
        function: 'extractPromoFromContext',
        parameter,
        fullCommand: messageText,
        promoType: parameter ? `specific_${parameter}` : 'default',
      })

      return {
        isPromo: true,
        parameter,
      }
    }

    // Also check for direct promo type commands (alternative format)
    // Supports: /start neurovideo, /start neurophoto
    const directPromoMatch = messageText.match(
      /^\/start\s+(neurovideo|neurophoto)$/i
    )

    if (directPromoMatch) {
      const parameter = directPromoMatch[1]

      logger.info({
        message: `[extractPromo] Direct promo type detected`,
        telegramId,
        function: 'extractPromoFromContext',
        parameter,
        fullCommand: messageText,
        promoType: `direct_${parameter}`,
      })

      return {
        isPromo: true,
        parameter,
      }
    }
  }

  return null
}
