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
  console.log('💵 CASE: checkBalanceScene')
  // Шаг 1: Получаем ID и режим
  const { telegramId } = getUserInfo(ctx)
  const mode = ctx.session.mode as ModeEnum
  const isRu = ctx.from?.language_code === 'ru'

  logger.info({
    message: `[CheckBalanceScene Enter] User: ${telegramId}, Mode: ${mode}`,
    telegramId,
    mode,
  })

  try {
    // --- ШАГ 2: ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ---
    const userDetails = await getUserDetails(telegramId)

    // --- ШАГ 3: ПРОВЕРКА СУЩЕСТВОВАНИЯ ---
    if (!userDetails.isExist) {
      logger.warn({
        message: `[CheckBalanceScene Exit] User ${telegramId} not found in DB. Redirecting to StartScene.`,
        telegramId,
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
      logger.info({
        message: `[Subscription Bypass] User ${telegramId} has active subscription (${userDetails.subscriptionType}). Entering scene for mode: ${mode}`,
        telegramId,
        subscriptionType: userDetails.subscriptionType,
        mode,
      })
      return ctx.scene.enter(ModeEnum.StartScene)
    }

    // Шаг 5: ПРОВЕРКА БАЛАНСА (только для обычных пользователей без активной подписки)
    const currentBalance = userDetails.stars
    const cost = modeCosts[mode] || 0
    const costValue = getCostValue(cost)

    logger.info({
      message: `[Balance Check] User: ${telegramId}, Mode: ${mode}, Cost: ${costValue}, Balance: ${currentBalance}`,
      telegramId,
      mode,
      cost: costValue,
      balance: currentBalance,
    })

    // Шаг 6: Показываем баланс и стоимость, если функция платная
    if (costValue > 0) {
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
        message: `[Insufficient Balance] User ${telegramId} denied access to mode ${mode}. Cost: ${costValue}, Balance: ${currentBalance}`,
        telegramId,
        mode,
        cost: costValue,
        balance: currentBalance,
      })
      // Отправляем сообщение о нехватке звезд
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      // Выходим из сцены, т.к. баланса не хватает
      return ctx.scene.leave()
    }

    // Если все проверки пройдены (достаточно баланса)
    logger.info({
      message: `[Balance Check OK] User ${telegramId} granted access to mode: ${mode}. Cost: ${costValue}, Balance: ${currentBalance}`,
      telegramId,
      mode,
      cost: costValue,
      balance: currentBalance,
    })

    // Шаг 8: Переходим к целевой функции
    return enterTargetScene(ctx, mode)
  } catch (error) {
    logger.error({
      message: `[CheckBalanceScene Error] User: ${telegramId}, Mode: ${mode}, Error: ${error}`,
      telegramId,
      mode,
      error,
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
  logger.info({
    message: `[Entering Target Scene] User: ${ctx.from?.id}, Mode: ${mode}`,
    telegramId: ctx.from?.id,
    mode,
  })
  const isRu = ctx.from?.language_code === 'ru'
  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case ModeEnum.DigitalAvatarBody:
      return ctx.scene.enter(ModeEnum.DigitalAvatarBody)
    case ModeEnum.DigitalAvatarBodyV2:
      return ctx.scene.enter(ModeEnum.DigitalAvatarBodyV2)
    case ModeEnum.NeuroPhoto:
      return ctx.scene.enter(ModeEnum.NeuroPhoto)
    case ModeEnum.NeuroPhotoV2:
      return ctx.scene.enter(ModeEnum.NeuroPhotoV2)
    case ModeEnum.ImageToPrompt:
      return ctx.scene.enter(ModeEnum.ImageToPrompt)
    case ModeEnum.Avatar:
      return ctx.scene.enter(ModeEnum.Avatar)
    case ModeEnum.ChatWithAvatar:
      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    case ModeEnum.SelectModel:
      return ctx.scene.enter(ModeEnum.SelectModel)
    case ModeEnum.Voice:
      return ctx.scene.enter(ModeEnum.Voice)
    case ModeEnum.TextToSpeech:
      return ctx.scene.enter(ModeEnum.TextToSpeech)
    case ModeEnum.ImageToVideo:
      return ctx.scene.enter(ModeEnum.ImageToVideo)
    case ModeEnum.TextToVideo:
      return ctx.scene.enter(ModeEnum.TextToVideo)
    case ModeEnum.TextToImage:
      return ctx.scene.enter(ModeEnum.TextToImage)
    case ModeEnum.LipSync:
      return ctx.scene.enter(ModeEnum.LipSync)
    case ModeEnum.VideoInUrl:
      return ctx.scene.enter(ModeEnum.VideoInUrl)
    // --- Добавь сюда другие режимы/сцены, если они есть ---
    case ModeEnum.TopUpBalance: // Пример: если нужно проверить что-то перед пополнением (хотя обычно нет)
      return ctx.scene.enter('paymentScene')
    case ModeEnum.Invite:
      return ctx.scene.enter('inviteScene')
    case ModeEnum.Balance:
      return ctx.scene.enter('balanceScene')
    case ModeEnum.Help:
      return ctx.scene.enter('helpScene')
    // -------------------------------------------------------
    default:
      // Этот default не должен вызываться, если все режимы,
      // которые устанавливаются перед checkBalanceScene, перечислены выше.
      logger.error({
        message: `[enterTargetScene] Unknown or unhandled mode: ${mode}. Returning to main menu.`,
        telegramId: ctx.from?.id,
        mode,
      })

      await ctx.reply(
        isRu
          ? 'Неизвестный режим. Возврат в главное меню.'
          : 'Unknown mode. Returning to main menu.'
      )
      return ctx.scene.enter(ModeEnum.StartScene) // Возврат в главное меню как запасной вариант
  }
}
