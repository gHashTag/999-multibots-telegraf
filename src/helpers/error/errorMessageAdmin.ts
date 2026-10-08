import { isDev } from '@/config'
import { MyContext } from '@/interfaces'
import { resolveAdminChatId } from '@/helpers/adminChatId'
import { sendToAdminChat } from './sendToAdminChat'

/**
 * An error for the admin channel.
 *
 * Two defects lived here. The address was hard-coded to a stale chat
 * ('@neuro_coder_privat') instead of the configured ADMIN_CHAT_ID, so errors
 * went somewhere nobody was reading. And a null ctx -- which is how the Inngest
 * payment and training handlers call this -- was answered with `console.error`
 * and a return: a failed payment reached no admin at all.
 *
 * Now the address comes from the one resolver, and with no ctx (or when the
 * current bot cannot post there) the notice goes out without one.
 */
export const errorMessageAdmin = (ctx: MyContext | null, error: Error) => {
  if (isDev) return
  const text = `❌ Произошла ошибка.\n\nОшибка: ${error.message}` // cyrillic-ok: admin-facing copy
  const chatId = resolveAdminChatId()
  if (ctx?.telegram && chatId) {
    ctx.telegram
      .sendMessage(chatId, text)
      .catch(() => void sendToAdminChat(text))
    return
  }
  void sendToAdminChat(text)
}
