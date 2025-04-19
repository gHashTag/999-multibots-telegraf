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
  logger.info('🔎 [CheckUser] Checking user existence...') // Log start
  if (!ctx.from?.id) {
    logger.error('❌ [CheckUser] User ID not found in context')
    return null
  }
  logger.info(`👤 [CheckUser] Found Telegram ID: ${ctx.from.id}`) // Log ID

  const user = await getUserByTelegramIdString(ctx.from.id.toString())
  if (!user) {
    logger.warn(`🤷‍♀️ [CheckUser] User ${ctx.from.id} not found in database`) // Log not found
    return null
  }
  logger.info(
    `✅ [CheckUser] User ${ctx.from.id} found in database. Subscription: ${user.subscription}`
  ) // Log found with subscription

  return user
}

// Проверка подписки на канал
const checkChannelSubscription = async (
  ctx: MyContext,
  languageCode: string
) => {
  logger.info('📺 [CheckChannel] Checking channel subscription...') // Log start
  if (isDev) {
    logger.info(
      '🔧 [CheckChannel] Development mode - skipping channel subscription check'
    )
    return true
  }

  const channelId = await getSubScribeChannel(ctx)
  if (!channelId) {
    logger.error('❌ [CheckChannel] Failed to get subscribe channel ID')
    await ctx.reply(
      languageCode === 'ru'
        ? '❌ Не удалось получить ID канала подписки'
        : '❌ Failed to get subscribe channel ID'
    )
    return false
  }
  logger.info(`📢 [CheckChannel] Target Channel ID: ${channelId}`) // Log channel ID

  const isSubscribed = await verifySubscription(ctx, languageCode, channelId)
  logger.info(
    `📊 [CheckChannel] Channel subscription status for user ${ctx.from?.id}: ${
      isSubscribed ? 'Active' : 'Inactive'
    }` // Log result
  )
  return isSubscribed
}

// Определение следующей сцены
const getNextScene = (currentMode: ModeEnum | undefined): ModeEnum => {
  logger.info(
    `🧠 [GetNextScene] Determining next scene based on mode: ${currentMode}`
  ) // Log input mode
  if (currentMode === ModeEnum.MainMenu || !currentMode) {
    logger.info(
      '🧭 [GetNextScene] Mode is MainMenu or undefined, returning MainMenu'
    ) // Log decision
    return ModeEnum.MainMenu
  }
  if (currentMode === ModeEnum.Subscribe) {
    logger.info(
      '💳 [GetNextScene] Mode is Subscribe, returning SubscriptionScene'
    ) // Log decision
    return ModeEnum.SubscriptionScene
  }
  logger.info(`✅ [GetNextScene] Returning current mode: ${currentMode}`) // Log decision
  return currentMode
}

const subscriptionCheckStep = async (ctx: MyContext) => {
  logger.info('🎯 [SubCheck] Starting subscription check process')
  const userId = ctx.from?.id || 'unknown'
  logger.info(
    `👤 [SubCheck] Checking for User ID: ${userId}, Current session mode: ${ctx.session.mode}`
  ) // Log start with mode

  // Проверка существования пользователя
  const user = await checkUserExists(ctx)
  if (!user) {
    logger.warn(
      `🤷‍♀️ [SubCheck] User ${userId} does not exist. Redirecting to user creation scene...`
    ) // Log redirect
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }

  logger.info(
    `✅ [SubCheck] User ${userId} exists. Subscription type: ${user.subscription}, Language: ${user.language_code}`
  ) // Log user data

  // Проверка типа подписки
  if (user.subscription !== SubscriptionType.STARS) {
    logger.info(
      `💫 [SubCheck] User ${userId} does not have STARS subscription (has ${user.subscription}). Checking channel subscription...`
    ) // Log check channel
    const isSubscribed = await checkChannelSubscription(ctx, user.language_code)
    if (!isSubscribed) {
      logger.warn(
        `❌ [SubCheck] User ${userId} failed channel subscription check. Leaving scene.`
      ) // Log failed check
      // Consider sending a message before leaving?
      // await ctx.reply('Please subscribe to the channel first.')
      return ctx.scene.leave()
    }
    logger.info(
      `✅ [SubCheck] User ${userId} passed channel subscription check.`
    ) // Log passed check
  } else {
    logger.info(
      `⭐ [SubCheck] User ${userId} has STARS subscription. Skipping channel check.`
    ) // Log STARS sub
  }

  // Переход к следующей сцене
  const nextScene = getNextScene(ctx.session.mode)
  logger.info(
    `➡️ [SubCheck] Determined next scene: ${nextScene} (based on session mode: ${ctx.session.mode})`
  ) // Log determined scene
  logger.info(
    `🚀 [SubCheck] EXECUTE ctx.scene.enter(${nextScene}) for user ${userId}`
  ) // Log EXECUTION
  return ctx.scene.enter(nextScene)
}

export const subscriptionCheckScene = new WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
