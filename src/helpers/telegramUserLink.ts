/**
 * A BUTTON TELEGRAM WILL NOT DRAW MUST NOT TAKE THE MESSAGE WITH IT.
 *
 * `tg://user?id=N` is the only way to open a chat with somebody who has no
 * @username, so the CRM puts it under every lead brief. Telegram will only
 * render it when the BOT can resolve that person -- it has to have seen them,
 * and a lead who writes to the owner's personal account has never met the bot.
 * When it cannot, the whole send is refused:
 *
 *   400: Bad Request: BUTTON_USER_INVALID   (method sendMessage)
 *
 * That is not a Telegram quirk to shrug at: `errorHandler.ts` correctly reads
 * it as OUR defect -- we built a keyboard the server rejects -- so it pages the
 * owner, and the brief the owner actually asked for never arrives. One
 * decorative link costs the entire message.
 *
 * So the send is retried once without those buttons. Everything the owner asked
 * for arrives; only the shortcut is missing, and the warn line records which
 * lead could not be linked. The retry is deliberately narrow: it fires on this
 * one description, it only ever removes `tg://user?` URL buttons, and if the
 * second attempt fails too the error travels on and pages as before.
 */
import { logger } from '@/utils/logger'
import { telegramErrorInfo } from '@/helpers/telegramErrors'

/** Only the user-link scheme. A t.me button that fails is a different bug. */
const USER_LINK = /^tg:\/\/user\?/i

/** Telegram's answer when it cannot resolve the user a button points at. */
export function isUserLinkRejected(error: unknown): boolean {
  const { code, description } = telegramErrorInfo(error)
  if (code !== undefined && code !== 400) return false
  return /BUTTON_USER_INVALID/i.test(description)
}

/**
 * The same send options with every `tg://user?` button taken out, or `null`
 * when there was none -- so a caller can tell "nothing to retry" from "retry
 * this". Rows left empty are dropped: Telegram refuses an empty row.
 */
export function withoutUserLinks(extra: unknown): Record<string, any> | null {
  const markup = (extra as any)?.reply_markup
  const rows = markup?.inline_keyboard
  if (!Array.isArray(rows)) return null

  let removed = false
  const kept = rows
    .map((row: any) =>
      (Array.isArray(row) ? row : []).filter((button: any) => {
        const dead =
          typeof button?.url === 'string' && USER_LINK.test(button.url)
        if (dead) removed = true
        return !dead
      })
    )
    .filter((row: any[]) => row.length > 0)

  if (!removed) return null
  return {
    ...(extra as Record<string, any>),
    reply_markup: { ...markup, inline_keyboard: kept },
  }
}

/**
 * `send` once; if Telegram refused it over a user link, send again without
 * those buttons. `send` is passed in rather than a ctx, because the same
 * keyboard goes out through ctx.reply, telegram.sendMessage and editMessageText.
 */
export async function keepingTheMessage<T>(
  send: (extra: unknown) => Promise<T>,
  extra: unknown,
  about: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await send(extra)
  } catch (error) {
    if (!isUserLinkRejected(error)) throw error
    const stripped = withoutUserLinks(extra)
    // Refused over a user link with no user link in the keyboard means the
    // link is in the TEXT, which this cannot repair. Let it page.
    if (!stripped) throw error
    logger.warn('[Telegram] the chat shortcut could not be drawn', {
      ...about,
      reason: telegramErrorInfo(error).description,
    })
    return await send(stripped)
  }
}
