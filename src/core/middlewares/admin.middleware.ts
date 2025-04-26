import type { MyContext } from '@/interfaces'
import { ADMIN_IDS_ARRAY } from '@/config'
import { isRussian } from '@/helpers'
// ... existing code ...

export const adminMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
) => {
  const telegramId = ctx.from?.id

  if (!telegramId || !ADMIN_IDS_ARRAY.includes(telegramId)) {
    const lang = isRussian(ctx)
    await ctx.reply(lang ? 'У вас нет доступа.' : 'You have no access.')
    const adminChatId = process.env.ADMIN_CHAT_ID
    if (adminChatId) {
      await ctx.telegram.sendMessage(
        adminChatId,
        `Unauthorized access attempt by user ${telegramId} (@${ctx.from?.username})`
      )
    }
    return
  }

  await next()
}
