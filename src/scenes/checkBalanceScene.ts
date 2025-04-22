import { Scenes, Telegraf, Markup } from 'telegraf'
import { WizardContext, WizardScene } from 'telegraf/scenes'
import { MyContext } from '@/interfaces'

import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
} from '@/interfaces/modes'
import { starCost, SYSTEM_CONFIG } from '@/price/constants'
import { logger } from '@/utils/logger'
import {
  getUserDetails,
  UserDetailsResult,
} from '@/core/supabase/getUserDetails'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { getTranslation } from '@/core/supabase/getTranslation'

// Интерфейс для возвращаемого значения
export interface UserStatus {
  stars: number // Баланс
  level: number
  subscriptionType: SubscriptionType | null // Тип подписки (null если нет или неактивна)
  isSubscriptionActive: boolean // Активна ли подписка
  isExist: boolean // Найден ли пользователь
}

export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

export type CostCalculationParamsInternal = CostCalculationParams

type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

export const BASE_COSTS: BaseCosts = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  [ModeEnum.NeuroAudio]: 0.12,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectAiTextModel]: 0,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.TextToSpeech]: 0.12,
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.9,
  [ModeEnum.VoiceToText]: 0.08,
  [ModeEnum.DigitalAvatarBody]: 0.5,
  [ModeEnum.DigitalAvatarBodyV2]: 0.7,
}

export type CostValue = number | ((steps: number) => number)
// Определяем стоимость для каждого режима

export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1 } = params

  try {
    let stars = 0

    let normalizedMode = mode
    if (mode === 'neuro_photo_2') {
      normalizedMode = ModeEnum.NeuroPhotoV2
      logger.info({
        message: '🔄 Использован алиас режима',
        description: 'Mode alias used',
        originalMode: mode,
        normalizedMode,
      })
    }

    const baseCostInDollars = BASE_COSTS[normalizedMode as keyof BaseCosts]

    if (baseCostInDollars === undefined) {
      logger.error({
        message: '❌ Неизвестный режим',
        description: 'Unknown mode in cost calculation',
        mode,
        normalizedMode,
      })
      stars = 0
    } else {
      // Особая логика для режимов с шагами
      if (
        (normalizedMode === ModeEnum.DigitalAvatarBody ||
          normalizedMode === ModeEnum.DigitalAvatarBodyV2) &&
        steps
      ) {
        // Пример: стоимость зависит от шагов (можно настроить формулу)
        // Допустим, базовая стоимость - это цена за 1 шаг
        stars = (baseCostInDollars / starCost) * steps * numImages
      } else {
        stars = (baseCostInDollars / starCost) * numImages
      }
    }

    // Дополнительные переопределения стоимости, если нужны
    if (mode === ModeEnum.VoiceToText) {
      stars = 5
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * SYSTEM_CONFIG.interestRate).toFixed(2))

    return { stars, dollars, rubles }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при расчете стоимости',
      description: 'Error during cost calculation',
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
      numImages,
    })
    throw error
  }
}

export const modeCosts: Record<string, number | ((param?: any) => number)> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 })
    .stars,
  [ModeEnum.NeuroAudio]: calculateModeCost({ mode: ModeEnum.NeuroAudio }).stars,
  neuro_photo_2: calculateModeCost({ mode: 'neuro_photo_2' }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
  [ModeEnum.SelectAiTextModel]: calculateModeCost({
    mode: ModeEnum.SelectAiTextModel,
  }).stars,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech })
    .stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo })
    .stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo })
    .stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage })
    .stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
  [ModeEnum.VoiceToText]: calculateModeCost({ mode: ModeEnum.VoiceToText })
    .stars,
}
// Найдите минимальную и максимальную стоимость среди всех моделей
export const minCost = Math.min(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost() : cost
  )
)
export const maxCost = Math.max(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost() : cost
  )
)

// Восстанавливаем функцию getCostValue
function getCostValue(cost: number | ((param?: any) => number)): number {
  return typeof cost === 'function' ? cost() : cost
}

/**
 * Сцена для проверки баланса перед входом в платную сцену.
 */
export const checkBalanceScene = new WizardScene<MyContext>(
  ModeEnum.CheckBalanceScene,
  async ctx => {
    const telegramId = ctx.from?.id?.toString() || 'unknown'
    const isRu = ctx.from?.language_code === 'ru'
    const mode = (ctx.wizard.state as any)?.mode as ModeEnum

    if (!mode) {
      logger.warn({
        message: '[CheckBalanceScene] Отсутствует режим (mode) в state. Выход.',
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'check_mode_state',
      })
      // Используем getTranslation для сообщения об ошибке
      const { translation: errorMsg } = await getTranslation({
        key: 'errors.missingMode',
        ctx,
        bot_name: ctx.botInfo.username,
      })
      await ctx.reply(errorMsg || 'Произошла ошибка: режим не указан.')
      return ctx.scene.leave()
    }

    logger.info({
      message: `[CheckBalanceScene] Вход в сцену для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'entry',
      mode,
      state: ctx.wizard.state,
    })

    try {
      // --- ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ---
      logger.info({
        message: `[CheckBalanceScene] Получение данных пользователя из БД`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'fetching_user_data',
      })

      const userDetails: UserDetailsResult = await getUserDetails(telegramId)

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
          message: '[CheckBalanceScene] Пользователь не найден в БД. Выход.',
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'check_user_existence',
        })
        return ctx.scene.enter(ModeEnum.StartScene)
      }

      // Шаг 4: ПРОВЕРКА ПОДПИСКИ
      if (!userDetails.isSubscriptionActive) {
        logger.warn({
          message: `[CheckBalanceScene] Подписка не активна. Выход.`,
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'check_subscription',
          subscriptionType: userDetails.subscriptionType,
        })
        // Используем getTranslation для сообщения о неактивной подписке
        const { translation: subMsg } = await getTranslation({
          key: 'scenes.checkBalance.subscriptionInactive', // Пример ключа
          ctx,
          bot_name: ctx.botInfo.username,
        })
        await ctx.reply(subMsg || 'Ваша подписка не активна.')
        return ctx.scene.enter(ModeEnum.StartScene)
      } else {
        logger.info({
          message: `[CheckBalanceScene] Подписка активна`,
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'check_subscription',
          subscriptionType: userDetails.subscriptionType,
        })
      }

      // Шаг 5: ПРОВЕРКА БАЛАНСА
      const currentBalance = userDetails.stars
      const cost = modeCosts[mode] || 0
      const costValue = getCostValue(cost)

      logger.info({
        message: `[CheckBalanceScene] Проверка баланса для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'balance_check',
        mode,
        cost: costValue,
        balance: currentBalance,
        hasEnoughBalance: currentBalance >= costValue,
      })

      // Шаг 6: Показываем баланс и стоимость, если функция платная
      if (costValue > 0) {
        logger.info({
          message: `[CheckBalanceScene] Отправка сообщения о балансе`,
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'send_balance_message',
          balance: currentBalance,
          cost: costValue,
          isRu,
        })
        await sendBalanceMessage(
          ctx, // Передаем весь контекст
          currentBalance,
          costValue,
          isRu,
          ctx.botInfo.username
        )
      }

      // Шаг 7: Проверка достаточности баланса
      if (currentBalance < costValue) {
        logger.warn({
          message: `[CheckBalanceScene] Недостаточно средств. Выход.`,
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'insufficient_balance',
          balance: currentBalance,
          cost: costValue,
        })
        await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
        logger.info({
          message: `[CheckBalanceScene] Выход из сцены после сообщения о нехватке средств`,
          telegramId,
          function: 'checkBalanceScene.enter',
          step: 'leaving_after_insufficient',
        })
        return ctx.scene.leave()
      }

      // Если все проверки пройдены (достаточно баланса)
      logger.info({
        message: `[CheckBalanceScene] Все проверки пройдены, доступ разрешен для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'access_granted',
        mode,
        cost: costValue,
        balance: currentBalance,
        result: 'access_granted',
      })

      // --- ВЫЗОВ ФУНКЦИИ ДЛЯ ВХОДА В ЦЕЛЕВУЮ СЦЕНУ ---
      await enterTargetScene(ctx, async () => {}, mode, costValue) // Вызываем enterTargetScene
    } catch (error) {
      logger.error({
        message: '[CheckBalanceScene] Ошибка при проверке баланса',
        telegramId,
        function: 'checkBalanceScene.enter',
        error: error,
        stack: (error as Error).stack,
      })
      // Используем getTranslation для общего сообщения об ошибке
      const { translation: genericErrorMsg } = await getTranslation({
        key: 'errors.generic', // Пример ключа
        ctx,
        bot_name: ctx.botInfo.username,
      })
      await ctx.reply(genericErrorMsg || 'Произошла непредвиденная ошибка.')
      return ctx.scene.leave()
    }
  }
)

/**
 * Обертка для входа в целевую сцену с проверкой баланса и списанием.
 * Используется как middleware перед обработчиками, требующими оплаты.
 *
 * @param ctx Контекст Telegraf
 * @param next Следующая функция middleware (обработчик команды/сцены)
 * @param mode Режим, для которого проверяется баланс и выполняется списание
 * @param cost Стоимость операции в звездах
 */
export const enterTargetScene = async (
  ctx: MyContext,
  next: () => Promise<void>, // next теперь не используется, но оставим для совместимости
  mode: ModeEnum,
  cost: number
) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const isRu = ctx.from?.language_code === 'ru'
  const username = ctx.from?.username
  const botUsername = ctx.botInfo.username

  logger.info({
    message: `[EnterTargetScene] Попытка входа в сцену: ${mode}`,
    telegramId,
    username,
    mode,
    cost,
    function: 'enterTargetScene',
  })

  try {
    const userDetails: UserDetailsResult = await getUserDetails(telegramId)

    if (!userDetails.isExist) {
      logger.warn({
        message: '[EnterTargetScene] Пользователь не найден. Вход отменен.',
        telegramId,
        function: 'enterTargetScene',
      })
      // Можно добавить сообщение пользователю, если необходимо
      return ctx.scene.enter(ModeEnum.StartScene)
    }

    if (!userDetails.isSubscriptionActive) {
      logger.warn({
        message: '[EnterTargetScene] Подписка не активна. Вход отменен.',
        telegramId,
        subscriptionType: userDetails.subscriptionType,
        function: 'enterTargetScene',
      })
      // Используем getTranslation для сообщения о неактивной подписке
      const { translation: subMsg } = await getTranslation({
        key: 'scenes.checkBalance.subscriptionInactive', // Пример ключа
        ctx,
        bot_name: botUsername,
      })
      await ctx.reply(subMsg || 'Ваша подписка не активна.')
      return ctx.scene.enter(ModeEnum.StartScene)
    }

    const currentBalance = userDetails.stars

    if (currentBalance < cost) {
      logger.warn({
        message: '[EnterTargetScene] Недостаточно средств. Вход отменен.',
        telegramId,
        currentBalance,
        cost,
        mode,
        function: 'enterTargetScene',
      })
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      return ctx.scene.leave()
    }

    // Списываем звезды ТОЛЬКО если стоимость > 0
    if (cost > 0) {
      logger.info({
        message: `[EnterTargetScene] Попытка списания ${cost} звезд`,
        telegramId,
        username,
        currentBalance,
        cost,
        targetScene: mode,
        function: 'enterTargetScene',
      })

      const updatedBalance = await updateUserBalance(telegramId, -cost)

      if (updatedBalance === null) {
        logger.error({
          message:
            '[EnterTargetScene] Ошибка обновления баланса. Вход отменен.',
          telegramId,
          username,
          cost,
          targetScene: mode,
          function: 'enterTargetScene',
        })

        const { translation: errorMsg } = await getTranslation({
          key: 'errors.balanceUpdateFailed',
          ctx,
          bot_name: botUsername,
        })
        await ctx.reply(
          errorMsg || 'Произошла ошибка при обновлении вашего баланса.'
        )
        return ctx.scene.leave()
      }

      logger.info({
        message: `[EnterTargetScene] Звезды успешно списаны`,
        telegramId,
        username,
        balanceBefore: currentBalance,
        balanceAfter: updatedBalance,
        cost,
        targetScene: mode,
        function: 'enterTargetScene',
      })
    }

    logger.info({
      message: `[EnterTargetScene] Вход в целевую сцену ${mode}`,
      telegramId,
      username,
      mode,
      cost,
      function: 'enterTargetScene',
    })

    await ctx.scene.enter(mode, {
      ...(ctx.scene.state || {}),
      cost,
    })
  } catch (error) {
    logger.error({
      message: '[EnterTargetScene] Неожиданная ошибка при входе в сцену',
      telegramId,
      username,
      mode,
      error: error,
      stack: (error as Error).stack,
      function: 'enterTargetScene',
    })
    const { translation: genericErrorMsg } = await getTranslation({
      key: 'errors.generic',
      ctx,
      bot_name: botUsername,
    })
    await ctx.reply(genericErrorMsg || 'Произошла непредвиденная ошибка.')
    await ctx.scene.leave()
  }
}
