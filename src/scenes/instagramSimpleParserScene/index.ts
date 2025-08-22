import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'

// ========== ИНТЕРФЕЙСЫ ==========
interface InstagramSimpleParserState {
  type?: 'competitor' | 'hashtag'
  target?: string
  waitingForTarget?: boolean
}

// ========== КОНСТАНТЫ ==========
const REELS_PRICING = {
  10: 3, // 10 рилсов = 3 звезды
  25: 8, // 25 рилсов = 8 звезд
  50: 15, // 50 рилсов = 15 звезд
  100: 30, // 100 рилсов = 30 звезд
  200: 55, // 200 рилсов = 55 звезд (скидка)
}

// ========== ПРОСТАЯ СЦЕНА ==========
export const instagramSimpleParserScene = new Scenes.BaseScene<MyContext>('instagram_simple_parser_scene')

// При входе в сцену
instagramSimpleParserScene.enter(async (ctx) => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id
  
  logger.info('🚀 [Instagram Simple Parser] Scene entered', { 
    userId,
    from: ctx.from,
    botInfo: ctx.botInfo?.username
  })

  // Инициализируем состояние
  if (!ctx.session.instagramSimpleParser) {
    ctx.session.instagramSimpleParser = {}
  }
  ctx.session.instagramSimpleParser.waitingForTarget = true

  const welcomeText = isRu
    ? `🎬 Instagram Парсер\n\n` +
      `📝 Введите что хотите парсить:\n\n` +
      `👤 Для конкурента: @nike\n` +
      `#️⃣ Для хештега: #fitness\n\n` +
      `⚡ После ввода выберите количество рилсов`
    : `🎬 Instagram Parser\n\n` +
      `📝 Enter what you want to parse:\n\n` +
      `👤 For competitor: @nike\n` +
      `#️⃣ For hashtag: #fitness\n\n` +
      `⚡ After entering, choose number of reels`

  await ctx.reply(
    welcomeText,
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '❌ Выход' : '❌ Exit', 'exit')]
    ])
  )
})

// Обработка текстовых сообщений
instagramSimpleParserScene.on('text', async (ctx) => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id
  const state = ctx.session.instagramSimpleParser as InstagramSimpleParserState
  
  logger.info('📝 [Instagram Simple Parser] Text message received', {
    userId,
    text: ctx.message.text,
    waitingForTarget: state?.waitingForTarget
  })

  if (!state?.waitingForTarget) {
    return // Игнорируем если не ждем ввода
  }

  const input = ctx.message.text.trim()
  let target: string
  let type: 'competitor' | 'hashtag'

  // Автоматически определяем тип по префиксу
  if (input.startsWith('@')) {
    type = 'competitor'
    target = input.slice(1).toLowerCase() // Убираем @
  } else if (input.startsWith('#')) {
    type = 'hashtag' 
    target = input.slice(1).toLowerCase() // Убираем #
  } else {
    // Если нет префикса, пытаемся определить автоматически
    if (/^[a-zA-Z0-9._]+$/.test(input)) {
      type = 'competitor'
      target = input.toLowerCase()
    } else {
      type = 'hashtag'
      target = input.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '')
    }
  }

  // Валидация
  if (target.length < 2) {
    await ctx.reply(
      isRu ? '❌ Слишком короткое название' : '❌ Too short name'
    )
    return
  }

  if (target.length > 30) {
    await ctx.reply(
      isRu ? '❌ Слишком длинное название' : '❌ Too long name'
    )
    return
  }

  // Дополнительная валидация для username
  if (type === 'competitor' && !/^[a-zA-Z0-9._]+$/.test(target)) {
    await ctx.reply(
      isRu
        ? '❌ Username должен содержать только буквы, цифры, точки и подчеркивания'
        : '❌ Username must contain only letters, numbers, dots and underscores'
    )
    return
  }

  // Сохраняем данные
  state.target = target
  state.type = type
  state.waitingForTarget = false

  logger.info('✅ [Instagram Simple Parser] Target parsed successfully', {
    userId,
    target,
    type,
    originalInput: input
  })

  const typeText = type === 'competitor' 
    ? (isRu ? 'Конкурент' : 'Competitor')
    : (isRu ? 'Хештег' : 'Hashtag')

  // Показываем выбор количества
  await ctx.reply(
    isRu
      ? `✅ ${typeText}: ${type === 'competitor' ? '@' : '#'}${target}\n\n⚙️ Выберите количество рилсов:`
      : `✅ ${typeText}: ${type === 'competitor' ? '@' : '#'}${target}\n\n⚙️ Choose number of reels:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`10 (${REELS_PRICING[10]}⭐)`, 'count_10'),
        Markup.button.callback(`25 (${REELS_PRICING[25]}⭐)`, 'count_25'),
        Markup.button.callback(`50 (${REELS_PRICING[50]}⭐)`, 'count_50'),
      ],
      [
        Markup.button.callback(`100 (${REELS_PRICING[100]}⭐)`, 'count_100'),
        Markup.button.callback(`200 (${REELS_PRICING[200]}⭐)`, 'count_200'),
      ],
      [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
    ])
  )
})

// Обработка кнопок количества
instagramSimpleParserScene.action(/count_(\d+)/, async (ctx) => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id
  const state = ctx.session.instagramSimpleParser as InstagramSimpleParserState
  
  const match = ctx.match
  const count = parseInt(match[1])
  const cost = REELS_PRICING[count as keyof typeof REELS_PRICING]

  logger.info('💰 [Instagram Simple Parser] Count selected', {
    userId,
    count,
    cost,
    target: state?.target,
    type: state?.type
  })

  if (!state?.target || !state?.type) {
    await ctx.answerCbQuery(
      isRu ? '❌ Ошибка: данные не найдены' : '❌ Error: data not found'
    )
    return
  }

  await ctx.answerCbQuery()

  if (!userId) {
    await ctx.editMessageText(
      isRu ? '❌ Ошибка авторизации' : '❌ Authorization error'
    )
    return ctx.scene.leave()
  }

  try {
    // Проверяем баланс
    const currentBalance = await getUserBalance(
      userId.toString(),
      ctx.botInfo?.username
    )

    if (currentBalance < cost) {
      await ctx.editMessageText(
        isRu
          ? `❌ Недостаточно звезд\n\n` +
              `Ваш баланс: ${currentBalance} ⭐\n` +
              `Необходимо: ${cost} ⭐\n` +
              `Не хватает: ${cost - currentBalance} ⭐`
          : `❌ Not enough stars\n\n` +
              `Your balance: ${currentBalance} ⭐\n` +
              `Required: ${cost} ⭐\n` +
              `Need more: ${cost - currentBalance} ⭐`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '💳 Пополнить баланс' : '💳 Top up balance',
              'top_up'
            ),
          ],
          [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back')],
        ])
      )
      return
    }

    // Списываем баланс
    await updateUserBalance(
      userId.toString(),
      cost as any,
      PaymentType.MONEY_OUTCOME,
      isRu
        ? `Instagram парсинг: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${count} рилсов)`
        : `Instagram parsing: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${count} reels)`,
      {
        service_type: 'instagram_parser',
        target: state.target,
        count: count,
        stars: cost,
      }
    )

    // Показываем прогресс
    await ctx.editMessageText(
      isRu
        ? `🚀 Парсинг запущен!\n\n` +
            `🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
            `📊 Количество: ${count} рилсов\n` +
            `💰 Списано: ${cost} ⭐\n\n` +
            `⏳ Ожидайте завершения...`
        : `🚀 Parsing started!\n\n` +
            `🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
            `📊 Count: ${count} reels\n` +
            `💰 Charged: ${cost} ⭐\n\n` +
            `⏳ Please wait...`
    )

    // Запускаем парсинг
    logger.info('🚀 [Instagram Simple Parser] Starting parsing request', {
      userId,
      target: state.target,
      type: state.type,
      count,
      cost
    })

    const { generateInstagramScraping } = await import('@/services/generateInstagramScraping')

    const result = await generateInstagramScraping(
      state.target,
      1, // project_id
      count, // max_users
      count, // max_reels_per_user  
      true, // scrape_reels
      userId.toString(),
      ctx,
      ctx.botInfo?.username || 'telegram_bot'
    )

    logger.info('🎯 [Instagram Simple Parser] Parsing request completed', {
      userId,
      target: state.target,
      result: {
        success: result?.success,
        eventId: result?.eventId,
        message: result?.message,
        error: result?.error
      }
    })

    if (result && result.success) {
      await ctx.editMessageText(
        isRu
          ? `✅ Запрос принят сервером!\n\n` +
              `🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
              `📊 Количество: ${count} рилсов\n` +
              `💰 Списано: ${cost} ⭐\n` +
              `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
              `${result.message}\n\n` +
              `📬 Результаты придут автоматически через 3-10 минут.`
          : `✅ Request accepted by server!\n\n` +
              `🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
              `📊 Count: ${count} reels\n` +
              `💰 Charged: ${cost} ⭐\n` +
              `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
              `${result.message}\n\n` +
              `📬 Results will arrive automatically in 3-10 minutes.`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🔄 Новый парсинг' : '🔄 New parsing',
              'restart'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🏠 Главное меню' : '🏠 Main menu',
              'main_menu'
            ),
          ],
        ])
      )
    } else {
      // Возвращаем деньги при ошибке
      try {
        await updateUserBalance(
          userId.toString(),
          cost as any,
          PaymentType.MONEY_INCOME,
          isRu
            ? `Возврат за ошибку парсинга: ${state.type === 'competitor' ? '@' : '#'}${state.target}`
            : `Refund for parsing error: ${state.type === 'competitor' ? '@' : '#'}${state.target}`,
          {
            service_type: 'instagram_parser_refund',
            target: state.target,
            count: count,
            stars: cost,
          }
        )
      } catch (refundError) {
        logger.error('❌ [Instagram Simple Parser] Failed to refund user', { 
          refundError, 
          userId 
        })
      }

      const errorMessage = result?.error || result?.message || 'Неизвестная ошибка'
      
      await ctx.editMessageText(
        isRu
          ? `❌ Ошибка отправки запроса\n\n` +
              `Причина: ${errorMessage}\n\n` +
              `💰 Средства возвращены на баланс.`
          : `❌ Request sending error\n\n` +
              `Reason: ${errorMessage}\n\n` +
              `💰 Funds have been refunded.`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🔄 Попробовать снова' : '🔄 Try again',
              'restart'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🏠 Главное меню' : '🏠 Main menu',
              'main_menu'
            ),
          ],
        ])
      )
    }

  } catch (error) {
    logger.error('❌ [Instagram Simple Parser] Critical error during parsing', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      userId,
      target: state.target,
      type: state.type,
      count,
      cost
    })

    // Возвращаем деньги при критической ошибке
    try {
      await updateUserBalance(
        userId.toString(),
        cost as any,
        PaymentType.MONEY_INCOME,
        isRu
          ? `Возврат за ошибку парсинга: ${state.type === 'competitor' ? '@' : '#'}${state.target}`
          : `Refund for parsing error: ${state.type === 'competitor' ? '@' : '#'}${state.target}`,
        {
          service_type: 'instagram_parser_refund',
          target: state.target,
          count: count,
          stars: cost,
        }
      )
    } catch (refundError) {
      logger.error('❌ [Instagram Simple Parser] Failed to refund user after critical error', { 
        refundError, 
        userId 
      })
    }

    await ctx.editMessageText(
      isRu
        ? '❌ Произошла критическая ошибка.\n\n💰 Средства возвращены на баланс.\nПопробуйте позже.'
        : '❌ Critical error occurred.\n\n💰 Funds have been refunded.\nTry again later.'
    )
  }

  // Очищаем состояние
  ctx.session.instagramSimpleParser = {}
  return ctx.scene.leave()
})

// Обработка кнопок
instagramSimpleParserScene.action('exit', async (ctx) => {
  const isRu = isRussianFromState(ctx)
  await ctx.answerCbQuery()
  await ctx.editMessageText(isRu ? '👋 До встречи!' : '👋 See you!')
  ctx.session.instagramSimpleParser = {}
  return ctx.scene.leave()
})

instagramSimpleParserScene.action('cancel', async (ctx) => {
  const isRu = isRussianFromState(ctx)
  await ctx.answerCbQuery()
  
  // Сбрасываем состояние и возвращаемся к началу
  if (!ctx.session.instagramSimpleParser) {
    ctx.session.instagramSimpleParser = {}
  }
  ctx.session.instagramSimpleParser.waitingForTarget = true
  ctx.session.instagramSimpleParser.target = undefined
  ctx.session.instagramSimpleParser.type = undefined

  const welcomeText = isRu
    ? `🎬 Instagram Парсер\n\n` +
      `📝 Введите что хотите парсить:\n\n` +
      `👤 Для конкурента: @nike\n` +
      `#️⃣ Для хештега: #fitness\n\n` +
      `⚡ После ввода выберите количество рилсов`
    : `🎬 Instagram Parser\n\n` +
      `📝 Enter what you want to parse:\n\n` +
      `👤 For competitor: @nike\n` +
      `#️⃣ For hashtag: #fitness\n\n` +
      `⚡ After entering, choose number of reels`

  await ctx.editMessageText(
    welcomeText,
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '❌ Выход' : '❌ Exit', 'exit')]
    ])
  )
})

instagramSimpleParserScene.action('restart', async (ctx) => {
  await ctx.answerCbQuery()
  // Перезапускаем сцену
  return ctx.scene.reenter()
})

instagramSimpleParserScene.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery()
  ctx.session.instagramSimpleParser = {}
  return ctx.scene.enter('main_menu')
})

instagramSimpleParserScene.action('top_up', async (ctx) => {
  await ctx.answerCbQuery()
  return ctx.scene.enter('payment_scene')
})

instagramSimpleParserScene.action('back', async (ctx) => {
  await ctx.answerCbQuery()
  return ctx.scene.reenter()
})