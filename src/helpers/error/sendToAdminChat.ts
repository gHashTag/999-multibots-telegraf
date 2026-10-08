import { resolveAdminChatId } from '@/helpers/adminChatId'
import { telegramApiFor } from '@/services/telegramApi'
import { logger } from '@/utils/logger'

/**
 * A NOTICE FOR THE ADMIN CHANNEL, SENT WITHOUT A CTX.
 *
 * The admin channel is where the team reads errors and service notices
 * (ADMIN_CHAT_ID, resolved by helpers/adminChatId.ts; the owner's working chat
 * with the bot -- see the `admin-chat` skill).
 *
 * The callers that need this have no update to answer: the Inngest payment and
 * training handlers call `errorMessageAdmin(null, error)`. Until this existed,
 * a null ctx meant `console.error` and nothing else -- a failed payment was
 * logged in a container nobody reads and announced nowhere. That is exactly the
 * case an admin channel exists for.
 *
 * The shape is the one provider-health-monitor's `notifyAdmin` already proved:
 * the address from the one resolver, the main bot's token, `fetch` with a
 * timeout, and `resp.ok` READ -- `fetch` resolves on a 400, so a refused send
 * would otherwise look delivered (theAdminChannelHadNoAddress.test.ts pins that
 * this file reads it).
 *
 * Never throws: an alert about a failure must not become a second failure.
 * Returns whether Telegram accepted the notice. The token is never logged.
 */
export async function sendToAdminChat(text: string): Promise<boolean> {
  const chatId = resolveAdminChatId()
  const token = process.env.BOT_TOKEN_1
  if (!chatId || !token) {
    logger.warn('[admin-chat] notice not sent: no admin channel or bot token', {
      hasChatId: Boolean(chatId),
      hasToken: Boolean(token),
    })
    return false
  }
  // Telegram's limit is 4096; leave room so a long stack never refuses the send.
  const body = text.length > 4000 ? `${text.slice(0, 4000)}…` : text
  try {
    const resp = await fetch(`${telegramApiFor(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) {
      logger.error('[admin-chat] Telegram refused the notice', {
        chatId,
        status: resp.status,
        description: await resp.text().catch(() => ''),
        hint: 'ADMIN_CHAT_ID must be a numeric id or an @username the bot can post to',
      })
      return false
    }
    return true
  } catch (e) {
    logger.error('[admin-chat] notice failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}
