import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserByTelegramIdString } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ADMIN_IDS_ARRAY } from '@/config'

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
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
    return
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

  // Проверка типа подписки - ТОЛЬКО ПЛАТНЫЕ ПОДПИСКИ
  if (
    user.subscription === SubscriptionType.NEUROPHOTO ||
    user.subscription === SubscriptionType.NEUROVIDEO ||
    user.subscription === SubscriptionType.STARS
  ) {
    logger.info({
      message:
        '⭐ [SubscriptionCheck] У пользователя есть платная подписка, доступ разрешен',
      telegramId,
      function: 'subscriptionCheckStep',
      userSubscription: user.subscription,
      result: 'paid_subscription_active',
    })
  } else {
    logger.info({
      message:
        '❌ [SubscriptionCheck] У пользователя нет платной подписки, требуется оплата',
      telegramId,
      function: 'subscriptionCheckStep',
      userSubscription: user.subscription,
      result: 'no_paid_subscription',
    })

    // Направляем в subscriptionScene для оформления подписки
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.SubscriptionScene
    return ctx.scene.enter(ModeEnum.SubscriptionScene)
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
      return
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
    return // Возврат в главное меню как безопасный вариант
  }
}

export const subscriptionCheckScene = new Scenes.WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
