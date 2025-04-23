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
import { getUserDetailsSubscription } from '@/core/supabase'
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
// ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ: Вызвать `getUserDetailsSubscription(telegramId)`.
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

    const userDetails = await getUserDetailsSubscription(telegramId)

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

    // --- ВЫЗОВ ФУНКЦИИ ДЛЯ ВХОДА В ЦЕЛЕВУЮ СЦЕНУ ---
    // Передаем необходимые параметры: контекст, пустую функцию next, режим, стоимость
    // @ts-ignore // Временно игнорируем ошибку компилятора, т.к. типы по факту совпадают
    await enterTargetScene(ctx, async () => {}, mode, costValue) // <--- Исправленный вызов
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
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
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
      const updatedBalance = currentBalance - cost // Временное решение
      logger.info({
        message: `[EnterTargetSceneWrapper] ✅ Звезды списаны (симуляция), баланс обновлен`,
        telegramId,
        mode,
        balanceAfter: updatedBalance,
        function: 'enterTargetSceneWrapper',
      })
      // Здесь можно было бы обновить баланс в ctx.session, если он там хранится
      // ctx.session.user.stars = updatedBalance; // Пример
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
