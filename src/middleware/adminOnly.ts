import { MyContext } from '@/interfaces'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'

export function isAdmin(userId: number): boolean {
  return ADMIN_IDS_ARRAY.includes(userId)
}

export function requireAdmin() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id

    if (!userId || !isAdmin(userId)) {
      logger.warn('Unauthorized access to admin command', {
        userId,
        telegramUsername: ctx.from?.username,
        command:
          ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown',
      })

      await ctx.reply(
        '❌ У вас нет доступа к этой команде. Только администраторы могут использовать эту функцию.'
      )
      return
    }

    logger.info('Admin access granted', {
      userId,
      telegramUsername: ctx.from?.username,
      command:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown',
    })

    await next()
  }
}

export function checkAdminAccess(ctx: MyContext): boolean {
  const userId = ctx.from?.id
  return userId ? isAdmin(userId) : false
}
