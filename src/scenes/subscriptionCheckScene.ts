import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramIdString, getSubScribeChannel } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { isDev } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { SubscriptionType } from '@/types/subscription'

// Проверка существования пользователя
const checkUserExists = async (ctx: MyContext) => {
  if (!ctx.from?.id) {
    logger.info('🔍 User ID not found in context')
    return null
  }

  const user = await getUserByTelegramIdString(ctx.from.id.toString())
  if (!user) {
    logger.info('🔍 User not found in database')
    return null
  }

  return user
}

// Проверка подписки на канал
const checkChannelSubscription = async (
  ctx: MyContext,
  languageCode: string
) => {
  if (isDev) {
    logger.info('🔧 Development mode - skipping channel subscription check')
    return true
  }

  const channelId = await getSubScribeChannel(ctx)
  if (!channelId) {
    logger.error('❌ Failed to get subscribe channel ID')
    await ctx.reply(
      languageCode === 'ru'
        ? '❌ Не удалось получить ID канала подписки'
        : '❌ Failed to get subscribe channel ID'
    )
    return false
  }

  const isSubscribed = await verifySubscription(ctx, languageCode, channelId)
  logger.info(
    `📊 Channel subscription status: ${isSubscribed ? 'Active' : 'Inactive'}`
  )
  return isSubscribed
}

// Определение следующей сцены
const getNextScene = (currentMode: ModeEnum | undefined): ModeEnum => {
  if (currentMode === ModeEnum.MainMenu || !currentMode) {
    return ModeEnum.MainMenu
  }
  if (currentMode === ModeEnum.Subscribe) {
    return ModeEnum.SubscriptionScene
  }
  return currentMode
}

const subscriptionCheckStep = async (ctx: MyContext) => {
  logger.info('🎯 Starting subscription check process')

  // Проверка существования пользователя
  const user = await checkUserExists(ctx)
  if (!user) {
    logger.info('➡️ Redirecting to user creation scene')
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }

  // Проверка типа подписки
  if (user.subscription !== SubscriptionType.STARS) {
    logger.info('💫 User does not have STARS subscription')
    const isSubscribed = await checkChannelSubscription(ctx, user.language_code)
    if (!isSubscribed) {
      logger.info('❌ Channel subscription check failed')
      return ctx.scene.leave()
    }
  } else {
    logger.info('⭐ User has STARS subscription')
  }

  // Переход к следующей сцене
  const nextScene = getNextScene(ctx.session.mode)
  logger.info(`➡️ Navigating to scene: ${nextScene}`)
  return ctx.scene.enter(nextScene)
}

export const subscriptionCheckScene = new WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
