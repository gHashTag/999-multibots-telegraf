import { MyContext } from '../interfaces'
import { logger } from '@/utils/enhancedLogger'
import { getUserDetailsSubscription } from '../core/supabase'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const getUserInfo = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id
  const telegramId = ctx.from?.id?.toString()

  if (!userId) {
    ctx.reply(
      isRu
        ? '❌ Ошибка идентификации пользователя'
        : '❌ User identification error'
    )
    if (!ctx.from) {
      logger.error('❌ Telegram ID не найден')
      return {
        userId: 0,
        telegramId: '',
      }
    }
    if (!telegramId) {
      logger.error('❌ Telegram ID не найден')
      return {
        userId: 0,
        telegramId: '',
      }
    }
    ctx.scene.leave()
    return {
      userId: 0,
      telegramId: '',
    }
  }
  if (!telegramId) {
    logger.error('❌ Telegram ID не найден')
    return {
      userId: 0,
      telegramId: '',
    }
  }
  return {
    userId,
    telegramId,
  }
}
