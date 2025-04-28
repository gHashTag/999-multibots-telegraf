import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { getUserDetailsSubscription } from '@/core/supabase/subscriptions/getUserDetailsSubscription'
import { calculateFinalStarPrice } from '@/pricing/calculator'

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

  // Получаем доп. параметры из сессии, если они там есть
  const steps = ctx.session.steps
  const modelId = ctx.session.selectedModel

  logger.info({
    message: `[CheckBalanceScene] Запрошен режим: ${mode} пользователем: ${userId}`,
    telegramId: userId,
    mode,
    steps,
    modelId,
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

    // --- ШАГ 5: РАСЧЕТ СТОИМОСТИ ---
    logger.info({
      message: `[CheckBalanceScene] Расчет стоимости для режима: ${mode}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'calculating_cost',
      mode,
      params: { steps, modelId },
    })

    // Используем НОВУЮ функцию расчета
    const costResult = calculateFinalStarPrice(mode, { steps, modelId })

    if (!costResult) {
      logger.error({
        message: `[CheckBalanceScene] Не удалось рассчитать стоимость для режима: ${mode}`,
        telegramId,
        function: 'checkBalanceScene.enter',
        step: 'cost_calculation_failed',
        mode,
        params: { steps, modelId },
        result: 'scene_leave_error',
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось рассчитать стоимость операции.'
          : '❌ Failed to calculate the operation cost.'
      )
      return ctx.scene.leave()
    }

    const costValue = costResult.stars
    const currentBalance = userDetails.stars

    logger.info({
      message: `[CheckBalanceScene] Стоимость рассчитана: ${costValue} звезд. Баланс: ${currentBalance}`,
      telegramId,
      function: 'checkBalanceScene.enter',
      step: 'cost_calculated',
      mode,
      cost: costValue,
      balance: currentBalance,
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
    await enterTargetScene(ctx, async () => {}, mode, costValue)
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
        message: `[EnterTargetSceneWrapper] Списание звезд за режим ${mode} (ТРЕБУЕТСЯ РЕАЛИЗАЦИЯ)`,
        telegramId,
        mode,
        cost,
        balanceBefore: currentBalance,
        function: 'enterTargetSceneWrapper',
      })
      // TODO: Реализовать РЕАЛЬНОЕ списание звезд через updateUserBalance или аналогичную функцию
      // const updatedBalance = await updateUserBalance(telegramId, -cost); // Пример
      // logger.info({ balanceAfter: updatedBalance });
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
