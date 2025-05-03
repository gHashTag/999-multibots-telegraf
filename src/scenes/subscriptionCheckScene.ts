import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserByTelegramIdString } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { isDev } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'
import { ADMIN_IDS_ARRAY } from '@/config'
import { handleMenu } from '@/handlers'

// Проверка существования пользователя
const checkUserExists = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🔍 [SubscriptionCheck] Проверка существования пользователя',
    telegramId,
    function: 'checkUserExists',
  })

  if (!ctx.from?.id) {
    logger.info({
      message: '❌ [SubscriptionCheck] ID пользователя не найден в контексте',
      telegramId: 'unknown',
      function: 'checkUserExists',
      result: 'failed',
    })
    return null
  }

  const user = await getUserByTelegramIdString(ctx.from.id.toString())
  if (!user) {
    logger.info({
      message: '❌ [SubscriptionCheck] Пользователь не найден в базе данных',
      telegramId,
      function: 'checkUserExists',
      result: 'not_found',
    })
    return null
  }

  logger.info({
    message: '✅ [SubscriptionCheck] Пользователь найден',
    telegramId,
    function: 'checkUserExists',
    result: 'found',
    subscriptionType: user.subscription,
    language: user.language_code,
  })
  return user
}

// Проверка подписки на канал
const checkChannelSubscription = async (
  ctx: MyContext,
  languageCode: string
) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🔍 [SubscriptionCheck] Проверка подписки на канал',
    telegramId,
    function: 'checkChannelSubscription',
    language: languageCode,
  })

  if (isDev) {
    logger.info({
      message:
        '🔧 [SubscriptionCheck] Режим разработки - пропуск проверки подписки на канал',
      telegramId,
      function: 'checkChannelSubscription',
      result: 'dev_skip',
    })
    return true
  }

  const channelId = await getSubScribeChannel(ctx)
  if (!channelId) {
    logger.error({
      message: '❌ [SubscriptionCheck] Не удалось получить ID канала подписки',
      telegramId,
      function: 'checkChannelSubscription',
      result: 'failed',
    })
    await ctx.reply(
      languageCode === 'ru'
        ? '❌ Не удалось получить ID канала подписки'
        : '❌ Failed to get subscribe channel ID'
    )
    return false
  }

  logger.info({
    message: '🔍 [SubscriptionCheck] Проверка подписки для канала',
    telegramId,
    function: 'checkChannelSubscription',
    channelId,
    step: 'verifying',
  })

  const isSubscribed = await verifySubscription(ctx, languageCode, channelId)

  logger.info({
    message: `📊 [SubscriptionCheck] Статус подписки на канал: ${
      isSubscribed ? 'Активна' : 'Неактивна'
    }`,
    telegramId,
    function: 'checkChannelSubscription',
    channelId,
    isSubscribed,
    result: isSubscribed ? 'active' : 'inactive',
  })
  return isSubscribed
}

// Определение следующей сцены
const getNextScene = (currentMode: ModeEnum | undefined): ModeEnum => {
  if (currentMode === ModeEnum.MainMenu || !currentMode) {
    return ModeEnum.MainMenu
  }
  return currentMode
}

const subscriptionCheckStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [SubscriptionCheck] Начало процесса проверки подписки',
    telegramId,
    function: 'subscriptionCheckStep',
    currentMode: ctx.session?.mode || 'undefined',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  // Проверка на админа (пропуск всех проверок)
  if (ADMIN_IDS_ARRAY.includes(ctx.from?.id ?? 0)) {
    logger.info({
      message:
        '[SubscriptionCheck] [Admin Bypass] Пользователь является администратором, пропуск проверок',
      telegramId,
      function: 'subscriptionCheckStep',
      isAdmin: true,
      result: 'admin_bypass',
    })
    return ctx.scene.enter(ModeEnum.MainMenu) // Сразу в главное меню
  }

  // Проверка существования пользователя
  const user = await checkUserExists(ctx)
  if (!user) {
    logger.info({
      message:
        '➡️ [SubscriptionCheck] Перенаправление на сцену создания пользователя',
      telegramId,
      function: 'subscriptionCheckStep',
      result: 'redirect_to_create_user',
      nextScene: ModeEnum.CreateUserScene,
    })
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }

  // Проверка типа подписки
  if (user.subscription !== SubscriptionType.STARS) {
    logger.info({
      message:
        '💫 [SubscriptionCheck] У пользователя нет подписки STARS, проверка подписки на канал',
      telegramId,
      function: 'subscriptionCheckStep',
      userSubscription: user.subscription,
      step: 'checking_channel',
    })

    const isSubscribed = await checkChannelSubscription(ctx, user.language_code)

    if (!isSubscribed) {
      logger.info({
        message:
          '❌ [SubscriptionCheck] Нет подписки на канал, требуется подписка',
        telegramId,
        function: 'subscriptionCheckStep',
        result: 'channel_subscription_required',
      })
      // Не нужно ничего делать здесь, так как checkChannelSubscription
      // уже перенаправит на SubscriptionScene при неудаче
      return // Просто выходим, пользователь уже перенаправлен
    } else {
      logger.info({
        message: '✅ [SubscriptionCheck] Подписка на канал подтверждена',
        telegramId,
        function: 'subscriptionCheckStep',
        result: 'channel_subscription_verified',
      })
    }
  } else {
    logger.info({
      message:
        '⭐ [SubscriptionCheck] У пользователя есть подписка STARS, пропуск проверки канала',
      telegramId,
      function: 'subscriptionCheckStep',
      userSubscription: user.subscription,
      result: 'stars_subscription_active',
    })
  }

  const currentMode = ctx.session.mode
  if (
    currentMode &&
    typeof currentMode === 'string' &&
    Object.values(ModeEnum).includes(currentMode as ModeEnum)
  ) {
    const nextScene = getNextScene(currentMode as ModeEnum)
    if (nextScene) {
      logger.info({
        message: '🔄 Переход к следующей сцене после проверки подписки',
        description: 'Proceeding to next scene after subscription check',
        telegramId: ctx.from?.id?.toString(),
        currentMode: currentMode,
        nextScene: nextScene,
      })
      ctx.scene.enter(nextScene)
    } else {
      logger.warn({
        message: '🤔 Не удалось определить следующую сцену',
        description: 'Could not determine next scene after subscription check',
        telegramId: ctx.from?.id?.toString(),
        currentMode: currentMode,
      })
      // Возможно, вернуться в главное меню или сообщить об ошибке
      await handleMenu(ctx)
    }
  } else {
    // Если режим не является допустимым ModeEnum, обрабатываем как ошибку или возвращаемся в меню
    logger.warn({
      message:
        '🤔 Недопустимый или отсутствующий режим в сессии при проверке подписки',
      description:
        'Invalid or missing mode in session during subscription check',
      telegramId: ctx.from?.id?.toString(),
      currentMode: currentMode,
    })
    await handleMenu(ctx) // Возврат в главное меню как безопасный вариант
  }
}

export const subscriptionCheckScene = new Scenes.WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
