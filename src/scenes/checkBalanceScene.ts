import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  getUserDetailsSubscription,
  invalidateBalanceCache,
  updateUserBalance,
  getUserBalance,
} from '@/core/supabase'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  calculateFinalStarPrice,
  type CalculationParams,
  type CostCalculationResult,
} from '@/price/calculator'

// Интерфейс для возвращаемого значения
export interface UserStatus {
  stars: number // Баланс
  level: number
  subscriptionType: SubscriptionType | null // Тип подписки (null если нет или неактивна)
  isSubscriptionActive: boolean // Активна ли подписка
  isExist: boolean // Найден ли пользователь
}

// Функция проверки баланса и данных пользователя
export async function checkUser(ctx: MyContext): Promise<UserStatus | null> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [CheckBalanceScene] Вход в сцену проверки баланса',
    telegramId,
    function: 'checkBalanceScene.enter',
    sessionMode: ctx.session?.mode,
    sessionData: JSON.stringify(ctx.session || {}),
  })

  console.log('💵 CASE: checkBalanceScene')
  // Шаг 1: Получаем ID и режим
  const { telegramId: userId } = getUserInfo(ctx)
  const mode = ctx.session.mode as ModeEnum
  const isRu = ctx.from?.language_code === 'ru'

  logger.info({
    message: `[CheckBalanceScene] Запрошен режим: ${mode} пользователем: ${userId}`,
    telegramId: userId,
    mode,
    language: isRu ? 'ru' : 'other',
    function: 'checkBalanceScene.enter',
    step: 'identifying_user_and_mode',
  })

  try {
    // --- ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ---
    logger.info({
      message: `[CheckBalanceScene] Получение данных пользователя из БД`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'fetching_user_data',
    })

    // Передаем ID пользователя как строку
    const userDetails = await getUserDetailsSubscription(ctx.from.id.toString())

    logger.info({
      message: `[CheckBalanceScene] Данные пользователя получены`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'user_data_fetched',
      userExists: userDetails.isExist,
      subscriptionActive: userDetails.isSubscriptionActive,
      subscriptionType: userDetails.subscriptionType,
      stars: userDetails.stars,
    })

    // --- ШАГ 3: ПРОВЕРКА СУЩЕСТВОВАНИЯ ---
    if (!userDetails.isExist) {
      logger.warn({
        message: `[CheckBalanceScene] Пользователь ${telegramId} не найден в БД. Перенаправление в StartScene.`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'user_not_found',
        result: 'redirect_to_start',
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось найти ваш профиль. Пожалуйста, перезапустите бота командой /start.'
          : '❌ Could not find your profile. Please restart the bot with /start.'
      )
      return null
    }

    // Шаг 4: ПРОВЕРКА ПОДПИСКИ
    if (!userDetails.isSubscriptionActive) {
      logger.warn({
        message: `[CheckBalanceScene] Пользователь ${telegramId} НЕ имеет активной подписки. Перенаправление в StartScene.`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'subscription_check_failed',
        subscriptionType: userDetails.subscriptionType,
        mode,
        result: 'redirect_to_start',
      })
      return null
    } else {
      logger.info({
        message: `[CheckBalanceScene] Подписка активна для пользователя ${telegramId}. Тип: ${userDetails.subscriptionType}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'subscription_check_passed',
        subscriptionType: userDetails.subscriptionType,
        mode,
      })
    }

    // Шаг 5: ПРОВЕРКА БАЛАНСА
    const currentBalance = userDetails.stars

    // Рассчитываем стоимость с помощью центральной функции
    // TODO: Передавать актуальные параметры (modelId, steps) из сессии, если они есть
    const costParams: CalculationParams = {}
    const costResult: CostCalculationResult | null = calculateFinalStarPrice(
      mode,
      costParams
    )

    // Проверяем, удалось ли рассчитать стоимость
    if (costResult === null) {
      logger.error(
        '[CheckBalanceScene] Не удалось рассчитать стоимость для режима',
        { telegramId, mode, costParams }
      )
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при расчете стоимости. Попробуйте позже.'
          : '❌ An error occurred while calculating the cost. Please try again later.'
      )
      return null
    }

    const requiredStars = costResult.stars // Получаем звезды из результата

    logger.info({
      message: `[CheckBalanceScene] Проверка баланса для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'balance_check',
      mode,
      cost: requiredStars, // Используем звезды из результата
      balance: currentBalance,
      hasEnoughBalance: currentBalance >= requiredStars, // Сравниваем звезды
    })

    // Шаг 6: Показываем баланс и стоимость, если функция платная
    if (requiredStars > 0) {
      logger.info({
        message: `[CheckBalanceScene] Отображение информации о балансе для платной функции`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'displaying_balance_info',
        mode,
        cost: requiredStars, // Используем звезды из результата
        balance: currentBalance,
      })

      // Передаем и баланс и уровень из userDetails
      await sendBalanceMessage(
        ctx,
        currentBalance,
        requiredStars, // Передаем звезды
        isRu,
        ctx.botInfo.username
      )
    }

    // Шаг 7: ПРОВЕРКА ДОСТАТОЧНОСТИ БАЛАНСА
    if (currentBalance < requiredStars) {
      logger.warn({
        message: `[CheckBalanceScene] Недостаточно баланса для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'insufficient_balance',
        mode,
        cost: requiredStars, // Используем звезды из результата
        balance: currentBalance,
        deficit: requiredStars - currentBalance, // Вычитаем звезды
        result: 'access_denied',
      })
      // Отправляем сообщение о нехватке звезд
      await sendInsufficientStarsMessage(ctx, userDetails.stars, isRu)
      // Выходим из сцены, т.к. баланса не хватает
      logger.info({
        message: `[CheckBalanceScene] Выход из сцены из-за недостатка баланса`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'scene_leave',
        reason: 'insufficient_balance',
      })
      return null
    }

    // Если все проверки пройдены (достаточно баланса)
    logger.info({
      message: `[CheckBalanceScene] Все проверки пройдены, доступ разрешен для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'all_checks_passed',
      mode,
      cost: requiredStars, // Используем звезды из результата
      balance: currentBalance,
      result: 'access_granted',
    })

    return {
      stars: currentBalance,
      level: 0, // Assuming level is not provided in the userDetails
      subscriptionType: userDetails.subscriptionType,
      isSubscriptionActive: userDetails.isSubscriptionActive,
      isExist: userDetails.isExist,
    }
  } catch (error) {
    console.error('[DEBUG CheckBalanceScene Enter] Error caught:', error) // Добавлено
    logger.error({
      message: `[CheckBalanceScene] Ошибка при проверке баланса`,
      telegramId,
      function: 'checkBalanceScene.enter',
      mode: ctx.session?.mode,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return null
  }
}

// Функция для обновления баланса пользователя
export async function updateUserBalanceLocal(
  ctx: MyContext,
  amount: number,
  type: PaymentType,
  serviceType?: ModeEnum
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  try {
    const success = await updateUserBalance(
      telegramId,
      amount,
      type,
      `Списание за режим ${serviceType}`,
      { service_type: serviceType, bot_name: ctx.botInfo.username }
    )

    if (success) {
      invalidateBalanceCache(telegramId) // Инвалидируем кэш баланса
      const newBalance = await getUserBalance(telegramId) // Получаем актуальный баланс
      logger.info({
        message: `[EnterTargetSceneWrapper] ✅ Звезды списаны, баланс обновлен`,
        telegramId,
        mode: serviceType,
        cost: amount,
        balanceAfter: newBalance,
        function: 'enterTargetSceneWrapper',
      })
      return true
    } else {
      logger.error({
        message: `[EnterTargetSceneWrapper] ❌ Не удалось списать звезды`,
        telegramId,
        mode: serviceType,
        cost: amount,
        function: 'enterTargetSceneWrapper',
      })
      return false
    }
  } catch (error) {
    logger.error({
      message: `[EnterTargetSceneWrapper] ❌ Ошибка при списании средств`,
      telegramId,
      mode: serviceType,
      cost: amount,
      function: 'enterTargetSceneWrapper',
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

//Middleware для проверки баланса и прав доступа
export const checkBalanceMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
) => {
  const user = await checkUser(ctx)
  if (!user) {
    logger.error('checkBalanceMiddleware: User not found', {
      telegram_id: ctx.from?.id,
    })
    return ctx.scene.enter(ModeEnum.MainMenu)
  }

  // Передаем пустой объект вместо currentCostParams
  const costResult = calculateFinalStarPrice(ctx.session.mode as ModeEnum, {})

  if (costResult === null) {
    logger.error('checkBalanceMiddleware: Failed to calculate cost', {
      telegram_id: ctx.from?.id,
      mode: ctx.session.mode,
      costParams: {}, // Логируем пустой объект
    })
    await ctx.reply(
      '❌ Не удалось рассчитать стоимость операции. Попробуйте позже.'
    )
    return ctx.scene.enter(ModeEnum.MainMenu)
  }

  const requiredStars = costResult.stars

  if (!user.isSubscriptionActive && user.stars < requiredStars) {
    await sendInsufficientStarsMessage(
      ctx,
      user.stars,
      ctx.from?.language_code === 'ru'
    )
    return ctx.scene.enter(ModeEnum.MainMenu)
  }

  // Сохраняем рассчитанную стоимость в сессию для использования в целевой сцене
  if (ctx.session) {
    ctx.session.currentCost = requiredStars
    ctx.session.currentMode = ctx.session.mode
  } else {
    logger.warn('checkBalanceMiddleware: ctx.session is undefined', {
      telegram_id: ctx.from?.id,
    })
    // Возможно, стоит прервать операцию, если сессия недоступна
  }

  await next() // Переходим к следующему шагу (обычно вход в целевую сцену)
}

//Сцена для проверки баланса перед операцией
export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.CheckBalanceScene
)

checkBalanceScene.enter(async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [CheckBalanceScene] Вход в сцену проверки баланса',
    telegramId,
    function: 'checkBalanceScene.enter',
    sessionMode: ctx.session?.mode,
    sessionData: JSON.stringify(ctx.session || {}),
  })

  console.log('💵 CASE: checkBalanceScene')
  // Шаг 1: Получаем ID и режим
  const { telegramId: userId } = getUserInfo(ctx)
  const mode = ctx.session.mode as ModeEnum
  const isRu = ctx.from?.language_code === 'ru'

  logger.info({
    message: `[CheckBalanceScene] Запрошен режим: ${mode} пользователем: ${userId}`,
    telegramId: userId,
    mode,
    language: isRu ? 'ru' : 'other',
    function: 'checkBalanceScene.enter',
    step: 'identifying_user_and_mode',
  })

  try {
    // --- ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ---
    logger.info({
      message: `[CheckBalanceScene] Получение данных пользователя из БД`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'fetching_user_data',
    })

    // Передаем ID пользователя как строку
    const userDetails = await getUserDetailsSubscription(ctx.from.id.toString())

    logger.info({
      message: `[CheckBalanceScene] Данные пользователя получены`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'user_data_fetched',
      userExists: userDetails.isExist,
      subscriptionActive: userDetails.isSubscriptionActive,
      subscriptionType: userDetails.subscriptionType,
      stars: userDetails.stars,
    })

    // --- ШАГ 3: ПРОВЕРКА СУЩЕСТВОВАНИЯ ---
    if (!userDetails.isExist) {
      logger.warn({
        message: `[CheckBalanceScene] Пользователь ${telegramId} не найден в БД. Перенаправление в StartScene.`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'user_not_found',
        result: 'redirect_to_start',
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось найти ваш профиль. Пожалуйста, перезапустите бота командой /start.'
          : '❌ Could not find your profile. Please restart the bot with /start.'
      )
      return ctx.scene.enter(ModeEnum.StartScene) // Выход, если пользователь не существует
    }

    // Шаг 4: ПРОВЕРКА ПОДПИСКИ
    if (!userDetails.isSubscriptionActive) {
      logger.warn({
        message: `[CheckBalanceScene] Пользователь ${telegramId} НЕ имеет активной подписки. Перенаправление в StartScene.`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'subscription_check_failed',
        subscriptionType: userDetails.subscriptionType,
        mode,
        result: 'redirect_to_start',
      })
      return ctx.scene.enter(ModeEnum.StartScene)
    } else {
      logger.info({
        message: `[CheckBalanceScene] Подписка активна для пользователя ${telegramId}. Тип: ${userDetails.subscriptionType}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'subscription_check_passed',
        subscriptionType: userDetails.subscriptionType,
        mode,
      })
    }

    // Шаг 5: ПРОВЕРКА БАЛАНСА
    const currentBalance = userDetails.stars

    // Рассчитываем стоимость с помощью центральной функции
    // TODO: Передавать актуальные параметры (modelId, steps) из сессии, если они есть
    const costParams: CalculationParams = {}
    const costResult: CostCalculationResult | null = calculateFinalStarPrice(
      mode,
      costParams
    )

    // Проверяем, удалось ли рассчитать стоимость
    if (costResult === null) {
      logger.error(
        '[CheckBalanceScene] Не удалось рассчитать стоимость для режима',
        { telegramId, mode, costParams }
      )
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при расчете стоимости. Попробуйте позже.'
          : '❌ An error occurred while calculating the cost. Please try again later.'
      )
      return ctx.scene.leave()
    }

    const requiredStars = costResult.stars // Получаем звезды из результата

    logger.info({
      message: `[CheckBalanceScene] Проверка баланса для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'balance_check',
      mode,
      cost: requiredStars, // Используем звезды из результата
      balance: currentBalance,
      hasEnoughBalance: currentBalance >= requiredStars, // Сравниваем звезды
    })

    // Шаг 6: Показываем баланс и стоимость, если функция платная
    if (requiredStars > 0) {
      logger.info({
        message: `[CheckBalanceScene] Отображение информации о балансе для платной функции`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'displaying_balance_info',
        mode,
        cost: requiredStars, // Используем звезды из результата
        balance: currentBalance,
      })

      // Передаем и баланс и уровень из userDetails
      await sendBalanceMessage(
        ctx,
        currentBalance,
        requiredStars, // Передаем звезды
        isRu,
        ctx.botInfo.username
      )
    }

    // Шаг 7: ПРОВЕРКА ДОСТАТОЧНОСТИ БАЛАНСА
    if (currentBalance < requiredStars) {
      logger.warn({
        message: `[CheckBalanceScene] Недостаточно баланса для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'insufficient_balance',
        mode,
        cost: requiredStars, // Используем звезды из результата
        balance: currentBalance,
        deficit: requiredStars - currentBalance, // Вычитаем звезды
        result: 'access_denied',
      })
      // Отправляем сообщение о нехватке звезд
      await sendInsufficientStarsMessage(ctx, userDetails.stars, isRu)
      // Выходим из сцены, т.к. баланса не хватает
      logger.info({
        message: `[CheckBalanceScene] Выход из сцены из-за недостатка баланса`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'scene_leave',
        reason: 'insufficient_balance',
      })
      return ctx.scene.leave()
    }

    // Если все проверки пройдены (достаточно баланса)
    logger.info({
      message: `[CheckBalanceScene] Все проверки пройдены, доступ разрешен для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'all_checks_passed',
      mode,
      cost: requiredStars, // Используем звезды из результата
      balance: currentBalance,
      result: 'access_granted',
    })

    // --- ВЫЗОВ ФУНКЦИИ ДЛЯ ВХОДА В ЦЕЛЕВУЮ СЦЕНУ ---
    // Передаем необходимые параметры: контекст, пустую функцию next, режим, стоимость
    // @ts-ignore // Временно игнорируем ошибку компилятора, т.к. типы по факту совпадают
    await enterTargetScene(ctx, async () => {}, mode, requiredStars) // <--- Исправленный вызов
  } catch (error) {
    console.error('[DEBUG CheckBalanceScene Enter] Error caught:', error) // Добавлено
    logger.error({
      message: `[CheckBalanceScene] Ошибка при проверке баланса`,
      telegramId,
      function: 'checkBalanceScene.enter',
      mode: ctx.session?.mode,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return ctx.scene.leave()
  }
})

/**
 * Обертка для входа в целевую сцену с проверкой баланса и списанием.
 * Используется как middleware перед обработчиками, требующими оплаты.
 *
 * @param ctx Контекст Telegraf
 * @param next Следующая функция middleware (обработчик команды/сцены)
 * @param mode Режим, для которого проверяется баланс и выполняется списание
 * @param cost Стоимость операции в звездах
 */
// Оставляем эту версию определения функции
export const enterTargetScene = async (
  ctx: MyContext,
  next: () => Promise<void>, // Добавляем `next`
  mode: ModeEnum, // Используем ModeEnum
  cost: number
) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  logger.info({
    message: `[EnterTargetSceneWrapper] Попытка входа в режим ${mode}`,
    telegramId,
    mode,
    cost,
    function: 'enterTargetSceneWrapper', // Переименовали для ясности
  })

  try {
    const userDetails = await getUserDetailsSubscription(telegramId)

    if (!userDetails.isExist) {
      logger.warn({
        message: '[EnterTargetSceneWrapper] ❌ Пользователь не найден в БД',
        telegramId,
        mode,
        function: 'enterTargetSceneWrapper',
      })
      await ctx.reply(
        '❌ Ошибка: Не удалось найти информацию о пользователе. Пожалуйста, начните сначала /start.'
      )
      // В middleware обычно не используют ctx.scene.leave(),
      // а просто не вызывают next() или выбрасывают ошибку
      return
    }

    if (!userDetails.isSubscriptionActive) {
      logger.warn({
        message: '[EnterTargetSceneWrapper] ❌ Подписка неактивна',
        telegramId,
        mode,
        function: 'enterTargetSceneWrapper',
      })
      // Сообщение об отсутствии подписки уже отправлено в checkBalanceScene
      // Возможно, здесь нужно отправить другое сообщение или просто выйти
      return
    }

    const currentBalance = userDetails.stars

    if (currentBalance < cost) {
      logger.warn({
        message: '[EnterTargetSceneWrapper] ❌ Недостаточно звезд',
        telegramId,
        mode,
        currentBalance,
        cost,
        function: 'enterTargetSceneWrapper',
      })
      const isRu = ctx.from?.language_code === 'ru'
      await sendInsufficientStarsMessage(ctx, userDetails.stars, isRu)
      return
    }

    // Списываем звезды ТОЛЬКО если стоимость > 0
    if (cost > 0) {
      logger.info({
        message: `[EnterTargetSceneWrapper] Списание звезд за режим ${mode}`,
        telegramId,
        mode,
        cost,
        balanceBefore: currentBalance,
        function: 'enterTargetSceneWrapper',
      })
      // TODO: Реализовать логику списания и логирования транзакции
      // await logTransaction(...)
      // const updatedBalance = await updateUserBalance(...)
      // const updatedBalance = currentBalance - cost // Временное решение - УДАЛЕНО

      // Вызываем updateUserBalance для списания и логирования
      const success = await updateUserBalance(
        telegramId,
        -cost, // Отрицательное значение для списания
        PaymentType.MONEY_OUTCOME, // Тип списания
        `Списание за режим ${mode}`, // Описание
        { service_type: mode, bot_name: ctx.botInfo.username } // Метаданные
      )

      if (success) {
        invalidateBalanceCache(telegramId) // Инвалидируем кэш баланса
        const newBalance = await getUserBalance(telegramId) // Получаем актуальный баланс
        logger.info({
          message: `[EnterTargetSceneWrapper] ✅ Звезды списаны, баланс обновлен`,
          telegramId,
          mode,
          cost,
          balanceAfter: newBalance,
          function: 'enterTargetSceneWrapper',
        })
      } else {
        logger.error({
          message: `[EnterTargetSceneWrapper] ❌ Не удалось списать звезды`,
          telegramId,
          mode,
          cost,
          function: 'enterTargetSceneWrapper',
        })
        // Сообщаем пользователю об ошибке
        await ctx.reply(
          ctx.from?.language_code === 'ru'
            ? '❌ Произошла ошибка при списании средств. Попробуйте еще раз.'
            : '❌ An error occurred while deducting funds. Please try again.'
        )
        return // Прерываем выполнение, т.к. списание не удалось
      }
    } else {
      logger.info({
        message: `[EnterTargetSceneWrapper] Режим ${mode} бесплатный, звезды не списываются`,
        telegramId,
        mode,
        function: 'enterTargetSceneWrapper',
      })
    }

    logger.info({
      message: `[EnterTargetSceneWrapper] ✅ Доступ разрешен, переход к обработчику`,
      telegramId,
      mode,
      function: 'enterTargetSceneWrapper',
    })

    // Переходим к следующему обработчику (фактическому выполнению команды/входу в сцену)
    // await next() // Вызов следующего middleware или обработчика

    // --- ИЛИ ---

    // Если эта функция ДОЛЖНА переводить в сцену, то логика будет такой:
    logger.info({
      message: `[EnterTargetSceneWrapper] ✅ Переход в целевую сцену ${mode}`,
      telegramId,
      mode,
      function: 'enterTargetSceneWrapper',
    })
    // Не присваиваем результат, т.к. ctx.scene.enter ничего не возвращает
    await ctx.scene.enter(mode, {
      ...(ctx.scene.state || {}),
      cost, // Можно передать стоимость в стейт сцены
      // Дополнительные данные, если нужны для целевой сцены
    })
  } catch (error) {
    logger.error({
      message: `[EnterTargetSceneWrapper] ❌ Ошибка при обработке входа в режим ${mode}`,
      telegramId,
      mode,
      error: error instanceof Error ? error.message : 'Unknown error',
      function: 'enterTargetSceneWrapper',
    })
    await ctx.reply(
      '❌ Произошла ошибка при проверке доступа. Пожалуйста, попробуйте еще раз или начните сначала /start.'
    )
    // В middleware обычно не используют ctx.scene.leave()
    // Можно просто не вызывать next() или выбросить ошибку,
    // чтобы остановить цепочку выполнения
  }
}

// ==================================================================
// ========= НОВАЯ ФУНКЦИЯ ПРОВЕРКИ И ВХОДА В СЦЕНУ ================
// ==================================================================
// Эта функция объединяет логику проверки баланса и входа

/**
 * Обертка для входа в целевую сцену с проверкой баланса.
 * Используется как middleware перед обработчиками, требующими проверки баланса.
 *
 * @param ctx Контекст Telegraf
 * @param next Следующая функция middleware
 * @param mode Режим, для которого проверяется баланс
 * @param costParams Параметры для расчета стоимости (например, steps)
 */
export const checkBalanceAndEnterScene = async (
  ctx: MyContext,
  next: () => Promise<void>,
  mode: ModeEnum,
  costParams?: CalculationParams // Оставляем параметр, но передаем {} ниже
) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const isRu = ctx.from?.language_code === 'ru'

  try {
    const user = await checkUser(ctx)
    if (!user) {
      logger.error('checkBalanceAndEnterScene: User not found', {
        telegram_id: ctx.from?.id,
      })
      return // Или ctx.reply(...)
    }

    // Передаем пустой объект вместо costParams
    const costResult = calculateFinalStarPrice(mode, {}) // Используем центральный калькулятор

    if (costResult === null) {
      logger.error('checkBalanceAndEnterScene: Failed to calculate cost', {
        telegram_id: ctx.from?.id,
        mode,
        costParams: {}, // Логируем пустой объект
      })
      await ctx.reply(
        '❌ Не удалось рассчитать стоимость операции. Попробуйте позже.'
      )
      return ctx.scene.enter(ModeEnum.MainMenu) // Возврат в главное меню
    }

    const requiredStars = costResult.stars

    if (!user.isSubscriptionActive && user.stars < requiredStars) {
      await sendInsufficientStarsMessage(ctx, user.stars, isRu)
      return ctx.scene.enter(ModeEnum.MainMenu) // Возврат в главное меню
    }

    // Сохраняем рассчитанную стоимость в сессию для использования в целевой сцене
    if (ctx.session) {
      ctx.session.currentCost = requiredStars
      ctx.session.currentMode = mode
    } else {
      logger.warn('checkBalanceAndEnterScene: ctx.session is undefined', {
        telegram_id: ctx.from?.id,
      })
      // Возможно, стоит прервать операцию, если сессия недоступна
    }

    await next() // Переходим к следующему шагу (обычно вход в целевую сцену)
  } catch (error) {
    logger.error('Error in checkBalanceAndEnterScene:', error)
    await ctx.reply(
      'Произошла ошибка при проверке баланса. Пожалуйста, попробуйте еще раз.'
    )
    // Возможно, стоит вернуться в главное меню
    try {
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (sceneError) {
      logger.error(
        'Failed to enter MainMenu scene after balance check error',
        sceneError
      )
    }
  }
}

// Идентификатор сцены
checkBalanceScene.id = ModeEnum.CheckBalanceScene // Corrected scene ID
