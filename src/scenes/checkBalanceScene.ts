import { Scenes } from 'telegraf'
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
import { getUserDetails } from '@/core/supabase'
import { SubscriptionType } from '@/interfaces/subscription.interface'
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
export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.CheckBalanceScene
)

// Функция для получения числового значения стоимости
function getCostValue(cost: number | ((param?: any) => number)): number {
  return typeof cost === 'function' ? cost() : cost
}

// ==================================================================
// ================== ВАЖНЫЙ КОММЕНТАРИЙ! ОПИСАНИЕ ТЕКУЩЕЙ ЛОГИКИ! ===
// ==================================================================
// Сцена `checkBalanceScene` - ШЛЮЗ ДОСТУПА к функциям бота.
// Она ВЫЗЫВАЕТСЯ ПЕРЕД ЛЮБОЙ функцией, требующей ресурсов.
// Админы НЕ ИМЕЮТ специального пропуска и проверяются на общих основаниях.
//
// ЛОГИКА ПРОВЕРКИ ВНУТРИ СЦЕНЫ (Версия "Подписка И Баланс Обязательны"):
// ШАГ 1: Получить ID пользователя (`telegramId`) и запрошенный режим (`mode`).
// ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ: Вызвать `getUserDetails(telegramId)`.
// ШАГ 3: ПРОВЕРКА СУЩЕСТВОВАНИЯ: Если пользователь не найден (`!userDetails.isExist`) -> Сообщение, ВЫХОД (переход в `StartScene`).
// ШАГ 4: ПРОВЕРКА НАЛИЧИЯ ПОДПИСКИ: Если подписка НЕ активна (`!userDetails.isSubscriptionActive`) -> Лог (ВНИМАНИЕ: текущий лог некорректен!), ВЫХОД (переход в `StartScene`).
// --- Следующие шаги выполняются ТОЛЬКО ЕСЛИ У ПОЛЬЗОВАТЕЛЯ ЕСТЬ АКТИВНАЯ ПОДПИСКА ---
// ШАГ 5: РАСЧЕТ СТОИМОСТИ И БАЛАНСА: Получить `currentBalance` и рассчитать `costValue` для `mode`.
// ШАГ 6: ОТОБРАЖЕНИЕ БАЛАНСА: Если `costValue > 0`, показать баланс и стоимость (`sendBalanceMessage`). (ВНИМАНИЕ: вызывается дважды в текущем коде).
// ШАГ 7: ПРОВЕРКА ДОСТАТОЧНОСТИ БАЛАНСА: Если `баланс < costValue` -> Сообщение о нехватке звезд (`sendInsufficientStarsMessage`), ВЫХОД из сцены (`ctx.scene.leave()`).
// ШАГ 8: ДОСТУП РАЗРЕШЕН И ПЕРЕХОД: Если пользователь существует, И имеет активную подписку, И имеет достаточный баланс -> Лог успеха, переход к функции (`enterTargetScene`).
// ШАГ 9: ОБРАБОТКА ОШИБОК: Любая ошибка на этапах 2-8 ведет к выходу из сцены с сообщением (`ctx.scene.leave()`).
//
// ВЫВОД: Эта логика требует ОБЯЗАТЕЛЬНОГО наличия АКТИВНОЙ подписки и ДОСТАТОЧНОГО баланса звезд для доступа к функции.
// ==================================================================
// ==================================================================

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

    const userDetails = await getUserDetails(telegramId)

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

    // Шаг 5: ПРОВЕРКА БАЛАНСА (только для обычных пользователей без активной подписки)
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
        message: `[CheckBalanceScene] Отображение информации о балансе для платной функции`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'displaying_balance_info',
        mode,
        cost: costValue,
        balance: currentBalance,
      })

      // Передаем и баланс и уровень из userDetails
      await sendBalanceMessage(
        ctx,
        currentBalance,
        costValue,
        isRu,
        ctx.botInfo.username
      )
    }

    // Шаг 7: Проверка достаточности баланса
    if (currentBalance < costValue) {
      logger.warn({
        message: `[CheckBalanceScene] Недостаточно баланса для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'insufficient_balance',
        mode,
        cost: costValue,
        balance: currentBalance,
        deficit: costValue - currentBalance,
        result: 'access_denied',
      })
      // Отправляем сообщение о нехватке звезд
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
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
      cost: costValue,
      balance: currentBalance,
      result: 'access_granted',
    })

    // --- ИСПРАВЛЕНИЕ ЦИКЛА (ПОПЫТКА 3 - с console.log) ---
    const targetMode = mode // Сохраняем режим для логов
    const comparisonMode = ModeEnum.SubscriptionScene
    // Сравниваем как строки для надежности
    const areModesEqual = String(targetMode) === String(comparisonMode)

    // Логируем переменные перед сравнением
    console.log(
      `[DEBUG CheckBalanceScene Enter] CHECKING LOOP: targetMode='${targetMode}' (type: ${typeof targetMode}), comparisonMode='${comparisonMode}' (type: ${typeof comparisonMode}), areEqual=${areModesEqual}`
    )
    logger.info({
      message: `[CheckBalanceScene] Проверка условия цикла: mode === ModeEnum.SubscriptionScene`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'loop_condition_check',
      modeValue: targetMode,
      modeEnumType: typeof comparisonMode,
      modeEnumValue: comparisonMode,
      comparisonResult: areModesEqual,
    })

    // Проверяем, является ли целевая сцена сценой подписки
    if (areModesEqual) {
      // Если ДА, входим напрямую
      console.log(
        `[DEBUG CheckBalanceScene Enter] Condition TRUE. Entering SubscriptionScene directly.`
      )
      logger.info({
        message: `[CheckBalanceScene] Условие цикла ИСТИННО. Прямой переход в SubscriptionScene, минуя enterTargetScene`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'direct_enter_subscription',
        targetScene: targetMode,
      })
      return ctx.scene.enter(ModeEnum.SubscriptionScene) // <--- Прямой вход
    } else {
      // Если НЕТ, вызываем enterTargetScene
      console.log(
        `[DEBUG CheckBalanceScene Enter] Condition FALSE. Calling enterTargetScene for mode: ${targetMode}`
      )
      logger.info({
        message: `[CheckBalanceScene] Условие цикла ЛОЖНО. Вызов enterTargetScene.`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'entering_target_scene_fallback',
        targetScene: targetMode,
      })
      return enterTargetScene(ctx, targetMode) // <--- Вызов старой функции
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
    return ctx.scene.leave()
  }
})

/**
 * @function enterTargetScene
 * @description Вспомогательная функция для входа в целевую сцену на основе режима (`ctx.session.mode`).
 *              Вызывается после успешного прохождения всех проверок в `checkBalanceScene`.
 * @param {MyContext} ctx - Контекст Telegraf.
 * @param {ModeEnum} mode - Режим, определяющий целевую сцену.
 */
async function enterTargetScene(ctx: MyContext, mode: ModeEnum) {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: `[enterTargetScene] Начало перехода в целевую сцену: ${mode}`,
    telegramId,
    function: 'enterTargetScene',
    requestedMode: mode,
    sessionData: JSON.stringify(ctx.session || {}),
  })

  const isRu = ctx.from?.language_code === 'ru'

  try {
    // --- ДОБАВИТЬ ЯВНУЮ ОБРАБОТКУ SUBSCRIPTION_SCENE (на всякий случай) ---
    if (String(mode) === String(ModeEnum.SubscriptionScene)) {
      console.log(
        `[DEBUG enterTargetScene] Explicitly handling SubscriptionScene. Entering...`
      )
      logger.info({
        message: `[enterTargetScene] Явная обработка SubscriptionScene`,
        telegramId,
        function: 'enterTargetScene',
        targetScene: mode,
        step: 'explicit_handle_subscription',
      })
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      return // Важно выйти после входа
    }
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    // Переход к соответствующей сцене в зависимости от режима
    logger.info({
      message: `[enterTargetScene] Подготовка к переключению на сцену: ${mode}`,
      telegramId,
      function: 'enterTargetScene',
      targetScene: mode,
      step: 'prepare_switch',
    })

    // Специальная обработка для сцены нейрофото
    if (
      String(mode) === String(ModeEnum.NeuroPhoto) ||
      String(mode) === 'neuro_photo'
    ) {
      logger.info({
        message: `[enterTargetScene] Переход к сцене нейрофото`,
        telegramId,
        function: 'enterTargetScene',
        fromMode: mode,
        toScene: ModeEnum.NeuroPhoto,
        specialHandling: true,
      })

      // ТРАССИРОВКА
      console.log(
        `[enterTargetScene] ТРАССИРОВКА СТЕКА ПЕРЕД ВХОДОМ В НЕЙРОФОТО:`,
        new Error().stack
      )

      try {
        // Сохраняем ссылку на текущий scene
        const capturedScene = ctx.scene
        // Сохраняем ссылку на оригинальный метод leave
        const originalLeave = capturedScene.leave.bind(capturedScene)

        // Переопределяем метод leave для блокировки его вызова
        capturedScene.leave = function (...args) {
          console.log(
            `⚠️ [КРИТИЧНО] ctx.scene.leave ВЫЗВАН ДЛЯ НЕЙРОФОТО! Stack:`,
            new Error().stack
          )
          console.log(`⚠️ [КРИТИЧНО] Аргументы leave:`, JSON.stringify(args))

          // Проверяем текущую сцену
          if (String(capturedScene.current) === String(ModeEnum.NeuroPhoto)) {
            console.log(
              `🛡️ [ЗАЩИТА] Блокировка преждевременного закрытия сцены нейрофото`
            )
            logger.warn({
              message: `[enterTargetScene] Блокировка преждевременного закрытия сцены нейрофото`,
              telegramId,
              currentScene: capturedScene.current,
              stack: new Error().stack,
            })
            // Возвращаем void, не вызывая оригинальный метод
            return
          }

          // Для других сцен вызываем оригинальный метод
          return originalLeave(...args)
        }

        // Входим в сцену нейрофото
        console.log(
          `[enterTargetScene] Вызываем ctx.scene.enter для NeuroPhoto`
        )
        await ctx.scene.enter(ModeEnum.NeuroPhoto)
        console.log(
          `[enterTargetScene] После вызова ctx.scene.enter для NeuroPhoto`
        )
      } catch (sceneError) {
        console.error(
          `[enterTargetScene] ОШИБКА ПРИ ВХОДЕ В СЦЕНУ НЕЙРОФОТО:`,
          sceneError
        )
        logger.error({
          message: `[enterTargetScene] Ошибка при входе в сцену нейрофото`,
          telegramId,
          error:
            sceneError instanceof Error
              ? sceneError.message
              : String(sceneError),
          stack: sceneError instanceof Error ? sceneError.stack : undefined,
        })
      }

      logger.info({
        message: `[enterTargetScene] Переход в сцену нейрофото завершен (ранний возврат)`,
        telegramId,
        function: 'enterTargetScene',
        targetScene: mode,
        step: 'switch_completed_early',
        result: 'early_return',
      })

      console.log(
        `[enterTargetScene] ЗАВЕРШАЕМ функцию с ранним возвратом true для нейрофото`
      )
      return true // Ранний возврат для предотвращения дополнительной обработки
    }

    // Стандартная обработка для всех остальных сцен
    let result: any = null

    switch (mode) {
      case ModeEnum.DigitalAvatarBody:
        logger.info({
          message: `[enterTargetScene] Переход к сцене цифрового тела аватара`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.DigitalAvatarBody,
        })
        result = await ctx.scene.enter(ModeEnum.DigitalAvatarBody)
        break
      case ModeEnum.DigitalAvatarBodyV2:
        logger.info({
          message: `[enterTargetScene] Переход к сцене цифрового тела аватара V2`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.DigitalAvatarBodyV2,
        })
        result = await ctx.scene.enter(ModeEnum.DigitalAvatarBodyV2)
        break
      case ModeEnum.NeuroPhotoV2:
        logger.info({
          message: `[enterTargetScene] Переход к сцене нейрофото V2`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.NeuroPhotoV2,
        })
        result = await ctx.scene.enter(ModeEnum.NeuroPhotoV2)
        break
      case ModeEnum.ImageToPrompt:
        logger.info({
          message: `[enterTargetScene] Переход к сцене промпта из фото`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.ImageToPrompt,
        })
        result = await ctx.scene.enter(ModeEnum.ImageToPrompt)
        break
      case ModeEnum.Avatar:
        logger.info({
          message: `[enterTargetScene] Переход к сцене аватара`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.Avatar,
        })
        result = await ctx.scene.enter(ModeEnum.Avatar)
        break
      case ModeEnum.ChatWithAvatar:
        logger.info({
          message: `[enterTargetScene] Переход к сцене чата с аватаром`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.ChatWithAvatar,
        })
        result = await ctx.scene.enter(ModeEnum.ChatWithAvatar)
        break
      case ModeEnum.SelectModel:
        logger.info({
          message: `[enterTargetScene] Переход к сцене выбора модели`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.SelectModel,
        })
        result = await ctx.scene.enter(ModeEnum.SelectModel)
        break
      case ModeEnum.SelectAiTextModel:
        logger.info({
          message: `[enterTargetScene] Переход к сцене выбора текста модели`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.SelectAiTextModel,
        })
        result = await ctx.scene.enter(ModeEnum.SelectAiTextModel)
        break
      case ModeEnum.Voice:
        logger.info({
          message: `[enterTargetScene] Переход к сцене голоса`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.Voice,
        })
        result = await ctx.scene.enter(ModeEnum.Voice)
        break
      case ModeEnum.TextToSpeech:
        logger.info({
          message: `[enterTargetScene] Переход к сцене текста в голос`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.TextToSpeech,
        })
        result = await ctx.scene.enter(ModeEnum.TextToSpeech)
        break
      case ModeEnum.ImageToVideo:
        logger.info({
          message: `[enterTargetScene] Переход к сцене фото в видео`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.ImageToVideo,
        })
        result = await ctx.scene.enter(ModeEnum.ImageToVideo)
        break
      case ModeEnum.TextToVideo:
        logger.info({
          message: `[enterTargetScene] Переход к сцене текста в видео`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.TextToVideo,
        })
        result = await ctx.scene.enter(ModeEnum.TextToVideo)
        break
      case ModeEnum.TextToImage:
        logger.info({
          message: `[enterTargetScene] Переход к сцене текста в фото`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.TextToImage,
        })
        result = await ctx.scene.enter(ModeEnum.TextToImage)
        break
      case ModeEnum.LipSync:
        logger.info({
          message: `[enterTargetScene] Переход к сцене синхронизации губ`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.LipSync,
        })
        result = await ctx.scene.enter(ModeEnum.LipSync)
        break
      case ModeEnum.VideoInUrl:
        logger.info({
          message: `[enterTargetScene] Переход к сцене видео по URL`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.VideoInUrl,
        })
        result = await ctx.scene.enter(ModeEnum.VideoInUrl)
        break
      case ModeEnum.TopUpBalance:
        logger.info({
          message: `[enterTargetScene] Переход к сцене пополнения баланса`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.PaymentScene,
        })
        result = await ctx.scene.enter(ModeEnum.PaymentScene)
        break
      case ModeEnum.Invite:
        logger.info({
          message: `[enterTargetScene] Переход к сцене приглашения`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: 'inviteScene',
        })
        result = await ctx.scene.enter('inviteScene')
        break
      case ModeEnum.Balance:
        logger.info({
          message: `[enterTargetScene] Переход к сцене баланса`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: 'balanceScene',
        })
        result = await ctx.scene.enter('balanceScene')
        break
      case ModeEnum.Help:
        logger.info({
          message: `[enterTargetScene] Переход к сцене помощи`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: 'helpScene',
        })
        result = await ctx.scene.enter('helpScene')
        break
      case ModeEnum.MainMenu:
        logger.info({
          message: `[enterTargetScene] Переход к сцене главного меню`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.MainMenu,
        })
        result = await ctx.scene.enter(ModeEnum.MainMenu)
        break
      case ModeEnum.StartScene:
        logger.info({
          message: `[enterTargetScene] Переход к сцене старта`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.StartScene,
        })
        result = await ctx.scene.enter(ModeEnum.StartScene)
        break
      case ModeEnum.SubscriptionScene:
        logger.info({
          message: `[enterTargetScene] Переход к сцене подписки`,
          telegramId,
          function: 'enterTargetScene',
          fromMode: mode,
          toScene: ModeEnum.SubscriptionScene,
        })
        result = await ctx.scene.enter(ModeEnum.SubscriptionScene)
        break
      default:
        logger.error({
          message: `[enterTargetScene] Неизвестный или необработанный режим: ${mode}. Возврат в главное меню.`,
          telegramId,
          function: 'enterTargetScene',
          mode,
          step: 'unknown_mode_error',
          result: 'fallback_to_start',
        })

        await ctx.reply(
          isRu
            ? 'Неизвестный режим. Возврат в главное меню.'
            : 'Unknown mode. Returning to main menu.'
        )
        result = await ctx.scene.enter(ModeEnum.StartScene)
    }

    logger.info({
      message: `[enterTargetScene] Переход в сцену ${mode} завершен`,
      telegramId,
      function: 'enterTargetScene',
      targetScene: mode,
      step: 'switch_completed',
      result: result ? 'success' : 'completed',
    })

    return result
  } catch (error) {
    console.error('[DEBUG enterTargetScene] Error caught:', error) // Добавлено
    logger.error({
      message: `[enterTargetScene] Ошибка при переходе в сцену: ${mode}`,
      telegramId,
      function: 'enterTargetScene',
      targetScene: mode,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // В случае ошибки пытаемся вернуться на стартовую сцену
    try {
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при переходе к выбранной функции. Возврат в главное меню.'
          : '❌ An error occurred while navigating to the selected function. Returning to main menu.'
      )
      return ctx.scene.enter(ModeEnum.StartScene)
    } catch (fallbackError) {
      logger.error({
        message: `[enterTargetScene] Критическая ошибка при попытке перехода на StartScene`,
        telegramId,
        function: 'enterTargetScene',
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
      })
      return ctx.scene.leave() // Последнее средство - просто выходим из всех сцен
    } finally {
      console.log(
        `[DEBUG enterTargetScene] <=== Function finished for mode: ${mode}`
      ) // Добавлено
      logger.info({
        message: `[enterTargetScene] Переход в сцену ${mode} завершен`,
        telegramId,
        function: 'enterTargetScene',
        targetScene: mode,
        step: 'switch_completed',
        result: 'success',
      })
    }
  }
}
