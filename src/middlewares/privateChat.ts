import { MyContext } from '@/interfaces'
import { Logger as logger } from '@/utils/logger'

export const privateChat = async (
  ctx: MyContext,
  next: () => Promise<void>
) => {
  if (ctx.chat?.type !== 'private') {
    logger.info('❌ Попытка использования команды в групповом чате:', {
      description: 'Command usage attempt in group chat',
      chat_type: ctx.chat?.type,
      chat_id: ctx.chat?.id,
      user_id: ctx.from?.id,
    })

    return next()
  }

  return next()
}
