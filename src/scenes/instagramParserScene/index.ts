import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { scrapeInstagramDirect } from '@/services/instagramScraperDirect'
import { supabaseAdmin } from '@/core/supabase/client'

// ========== ИНТЕРФЕЙСЫ ==========
interface InstagramParserState {
  type?: 'competitor' | 'hashtag'
  target?: string
  count?: number
  cost?: number
}

// ========== КОНСТАНТЫ ==========
const REELS_PRICING = {
  10: 3, // 10 рилсов = 3 звезды
  25: 8, // 25 рилсов = 8 звезд
  50: 15, // 50 рилсов = 15 звезд
  100: 30, // 100 рилсов = 30 звезд
  200: 55, // 200 рилсов = 55 звезд (скидка)
}

// ========== WIZARD SCENE ==========
export const instagramParserScene = new Scenes.WizardScene<MyContext>(
  'instagram_parser_scene',

  // ШАГ 1: Главное меню
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const userId = ctx.from?.id

    logger.info('🔥 [WIZARD DEBUG] Step 1 entered', { 
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
      from: ctx.from,
      botInfo: ctx.botInfo?.username
    })

    const menuText = isRu
      ? '🎬 Instagram Парсер\n\n' +
        '📱 Собирайте рилсы конкурентов и по хештегам\n' +
        '⚡ Быстро и эффективно\n\n' +
        'Выберите действие:'
      : '🎬 Instagram Parser\n\n' +
        '📱 Collect competitor reels and by hashtags\n' +
        '⚡ Fast and efficient\n\n' +
        'Choose action:'

    await ctx.reply(
      menuText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? '👤 Парсинг конкурента' : '👤 Parse competitor',
            'parse_competitor'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '#️⃣ Парсинг по хештегу' : '#️⃣ Parse by hashtag',
            'parse_hashtag'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '📊 Моя статистика' : '📊 My statistics',
            'my_stats'
          ),
        ],
        [Markup.button.callback(isRu ? '❓ Помощь' : '❓ Help', 'help')],
        [Markup.button.callback(isRu ? '❌ Выход' : '❌ Exit', 'exit')],
      ])
    )
    return ctx.wizard.next()
  },

  // ШАГ 2: Обработка выбора
  async ctx => {
    const userId = ctx.from?.id
    
    logger.info('🔥 [WIZARD DEBUG] Step 2 entered', { 
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
      hasCallbackQuery: !!ctx.callbackQuery,
      messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
      callbackData: ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'no callback'
    })

    if (!ctx.callbackQuery) {
      logger.warn('Instagram parser scene - No callback query in step 2', { userId })
      return
    }

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState

    logger.info('Instagram parser scene - Processing callback', { 
      userId,
      action,
      currentState: state
    })

    if (action === 'parse_competitor') {
      logger.info('🔥 Instagram parser scene - Competitor parsing selected', { 
        userId,
        action,
        currentWizardStep: ctx.wizard.cursor,
        sessionState: state
      })
      
      state.type = 'competitor'
      
      try {
        await ctx.answerCbQuery()
        logger.info('✅ Callback query answered successfully', { userId })
        
        await ctx.editMessageText(
          isRu
            ? '👤 Введите username аккаунта (без @):\n\n' +
                '📝 Примеры: nike, adidas, zara\n' +
                '⚠️ Аккаунт должен быть открытым'
            : '👤 Enter account username (without @):\n\n' +
                '📝 Examples: nike, adidas, zara\n' +
                '⚠️ Account must be public',
          Markup.inlineKeyboard([
            [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
          ])
        )
        logger.info('✅ Message edited successfully, moving to next step', { userId })
        
        logger.info('✅ [Instagram Parser Scene] Moving to step 3 (target input)', { userId })
        return ctx.wizard.next()
      } catch (error) {
        logger.error('❌ Error in parse_competitor handler', { 
          error: error.message,
          stack: error.stack,
          userId,
          action
        })
        throw error
      }
    }

    if (action === 'parse_hashtag') {
      logger.info('Instagram parser scene - Hashtag parsing selected', { userId })
      state.type = 'hashtag'
      await ctx.answerCbQuery()
      await ctx.editMessageText(
        isRu
          ? '#️⃣ Введите хештег (без #):\n\n' +
              '📝 Примеры: fitness, travel, food\n' +
              '💡 Популярные хештеги дают больше результатов'
          : '#️⃣ Enter hashtag (without #):\n\n' +
              '📝 Examples: fitness, travel, food\n' +
              '💡 Popular hashtags give more results',
        Markup.inlineKeyboard([
          [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
        ])
      )
      return ctx.wizard.next()
    }

    if (action === 'my_stats') {
      await ctx.answerCbQuery()
      await showStats(ctx)
      return
    }

    if (action === 'help') {
      await ctx.answerCbQuery()
      await showHelp(ctx)
      return
    }

    if (action === 'exit') {
      await ctx.answerCbQuery()
      await ctx.editMessageText(isRu ? '👋 До встречи!' : '👋 See you!')
      return ctx.scene.leave()
    }
  },

  // ШАГ 3: Ввод цели
  async ctx => {
    const userId = ctx.from?.id
    logger.info('🔥 [WIZARD DEBUG] Step 3 entered', { 
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
      hasMessage: !!ctx.message,
      hasCallbackQuery: !!ctx.callbackQuery,
      messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
      callbackData: ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'no callback'
    })
    
    const isRu = isRussianFromState(ctx)
    const state = ctx.wizard.state as InstagramParserState

    if (
      ctx.callbackQuery &&
      'data' in ctx.callbackQuery &&
      ctx.callbackQuery.data === 'cancel'
    ) {
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    if (ctx.message && 'text' in ctx.message) {
      const target = ctx.message.text.replace(/[@#]/g, '').trim().toLowerCase()

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

      // Проверка на допустимые символы
      if (!/^[a-z0-9._]+$/.test(target)) {
        await ctx.reply(
          isRu
            ? '❌ Используйте только латинские буквы, цифры, точки и подчеркивания'
            : '❌ Use only latin letters, numbers, dots and underscores'
        )
        return
      }

      state.target = target

      const typeText =
        state.type === 'competitor'
          ? isRu
            ? 'Аккаунт'
            : 'Account'
          : isRu
            ? 'Хештег'
            : 'Hashtag'

      await ctx.reply(
        isRu
          ? `✅ ${typeText}: ${state.type === 'competitor' ? '@' : '#'}${target}\n\n` +
              '⚙️ Выберите количество рилсов для парсинга:'
          : `✅ ${typeText}: ${state.type === 'competitor' ? '@' : '#'}${target}\n\n` +
              '⚙️ Choose number of reels to parse:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback(`10 (${REELS_PRICING[10]}⭐)`, 'count_10'),
            Markup.button.callback(`25 (${REELS_PRICING[25]}⭐)`, 'count_25'),
            Markup.button.callback(`50 (${REELS_PRICING[50]}⭐)`, 'count_50'),
          ],
          [
            Markup.button.callback(
              `100 (${REELS_PRICING[100]}⭐)`,
              'count_100'
            ),
            Markup.button.callback(
              `200 (${REELS_PRICING[200]}⭐)`,
              'count_200'
            ),
          ],
          [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
        ])
      )

      logger.info('✅ [Instagram Parser Scene] Moving to step 4 (count selection)', { userId: ctx.from?.id, target })
      return ctx.wizard.next()
    }
  },

  // ШАГ 4: Выбор количества и оплата
  async ctx => {
    const userId = ctx.from?.id
    
    logger.info('🔥 [WIZARD DEBUG] Step 4 entered', { 
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
      hasCallbackQuery: !!ctx.callbackQuery,
      hasMessage: !!ctx.message,
      messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
      callbackData: ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'no callback'
    })

    if (!ctx.callbackQuery) {
      logger.warn('Instagram parser scene - No callback query in step 4', { userId })
      return
    }

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState

    logger.info('Instagram parser scene - Processing count selection callback', { 
      userId,
      action,
      currentState: state
    })

    if (action === 'cancel') {
      logger.info('Instagram parser scene - Cancel selected in step 4', { userId })
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    const match = action.match(/count_(\d+)/)
    if (match) {
      logger.info('Instagram parser scene - Count selected', { 
        userId,
        action,
        selectedCount: match[1]
      })
      const count = parseInt(match[1])
      const cost = REELS_PRICING[count as keyof typeof REELS_PRICING]

      state.count = count
      state.cost = cost

      // Проверяем баланс пользователя
      const userId = ctx.from?.id
      if (!userId) {
        await ctx.answerCbQuery(
          isRu ? '❌ Ошибка авторизации' : '❌ Authorization error'
        )
        return ctx.scene.leave()
      }

      // Используем правильную функцию для получения баланса
      const currentBalance = await getUserBalance(
        userId.toString(),
        ctx.botInfo?.username
      )

      if (currentBalance < cost) {
        await ctx.answerCbQuery()
        await ctx.editMessageText(
          isRu
            ? `❌ Недостаточно звезд\n\n` +
                `Ваш баланс: ${currentBalance} ⭐\n` +
                `Необходимо: ${cost} ⭐\n` +
                `Не хватает: ${cost - currentBalance} ⭐\n\n` +
                `Пополните баланс и попробуйте снова`
            : `❌ Not enough stars\n\n` +
                `Your balance: ${currentBalance} ⭐\n` +
                `Required: ${cost} ⭐\n` +
                `Need more: ${cost - currentBalance} ⭐\n\n` +
                `Top up your balance and try again`,
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

      await ctx.answerCbQuery()

      const typeText =
        state.type === 'competitor'
          ? isRu
            ? 'Аккаунт'
            : 'Account'
          : isRu
            ? 'Хештег'
            : 'Hashtag'

      await ctx.editMessageText(
        isRu
          ? `💰 Подтверждение оплаты\n\n` +
              `${typeText}: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
              `Количество рилсов: ${count}\n` +
              `Стоимость: ${cost} ⭐\n` +
              `Ваш баланс: ${currentBalance} ⭐\n` +
              `После оплаты: ${currentBalance - cost} ⭐\n\n` +
              `Подтвердить парсинг?`
          : `💰 Payment confirmation\n\n` +
              `${typeText}: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
              `Number of reels: ${count}\n` +
              `Cost: ${cost} ⭐\n` +
              `Your balance: ${currentBalance} ⭐\n` +
              `After payment: ${currentBalance - cost} ⭐\n\n` +
              `Confirm parsing?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '✅ Оплатить и начать' : '✅ Pay and start',
              'start_parsing'
            ),
          ],
          [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
        ])
      )

      logger.info('✅ [Instagram Parser Scene] Moving to step 5 (parsing start)', { userId, count, cost })
      return ctx.wizard.next()
    }
  },

  // ШАГ 5: Запуск парсинга
  async ctx => {
    const userId = ctx.from?.id
    
    logger.info('🔥 [WIZARD DEBUG] Step 5 entered', { 
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
      hasCallbackQuery: !!ctx.callbackQuery,
      hasMessage: !!ctx.message,
      messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
      callbackData: ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'no callback'
    })

    if (!ctx.callbackQuery) {
      logger.warn('Instagram parser scene - No callback query in step 5', { userId })
      return
    }

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState

    logger.info('Instagram parser scene - Processing parsing start callback', { 
      userId,
      action,
      currentState: state
    })

    if (action === 'cancel') {
      logger.info('Instagram parser scene - Cancel selected in step 5', { userId })
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    if (action === 'back') {
      logger.info('Instagram parser scene - Back selected in step 5', { userId })
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    if (action === 'top_up') {
      logger.info('Instagram parser scene - Top up selected in step 5', { userId })
      await ctx.answerCbQuery()
      await ctx.scene.enter('payment_scene')
      return
    }

    if (action === 'start_parsing') {
      logger.info('Instagram parser scene - Start parsing selected', { 
        userId,
        state
      })
      await ctx.answerCbQuery(
        isRu ? '🚀 Запускаю парсинг...' : '🚀 Starting parsing...'
      )

      if (!userId || !state.target || !state.count || !state.cost) {
        await ctx.editMessageText(isRu ? '❌ Ошибка данных' : '❌ Data error')
        return ctx.scene.leave()
      }

      try {
        // Списываем баланс
        await updateUserBalance(
          userId.toString(),
          state.cost as any,
          PaymentType.MONEY_OUTCOME,
          isRu
            ? `Instagram парсинг: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${state.count} рилсов)`
            : `Instagram parsing: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${state.count} reels)`,
          {
            service_type: 'instagram_parser',
            target: state.target,
            count: state.count,
            stars: state.cost,
          }
        )

        // Показываем сообщение о начале парсинга
        await ctx.editMessageText(
          isRu
            ? `🚀 Парсинг запущен!\n\n` +
                `🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                `📊 Количество: ${state.count} рилсов\n` +
                `💰 Списано: ${state.cost} ⭐\n\n` +
                `⏳ Ожидайте завершения парсинга...\n` +
                `⏱️ Обычно занимает 2-5 минут`
            : `🚀 Parsing started!\n\n` +
                `🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                `📊 Count: ${state.count} reels\n` +
                `💰 Charged: ${state.cost} ⭐\n\n` +
                `⏳ Please wait for parsing to complete...\n` +
                `⏱️ Usually takes 2-5 minutes`
        )

        // Используем правильный API-based подход через ai-server
        logger.info('🚀 [Instagram Parser Scene] About to call generateInstagramScraping', {
          userId,
          target: state.target,
          type: state.type,
          count: state.count,
          cost: state.cost
        })
        
        const { generateInstagramScraping } = await import('@/services/generateInstagramScraping')
        
        const result = await generateInstagramScraping(
          state.target,
          1, // project_id (можно настроить)
          state.count, // max_users
          state.count, // max_reels_per_user  
          true, // scrape_reels
          userId.toString(),
          ctx,
          ctx.botInfo?.username || 'telegram_bot'
        )

        logger.info('🎯 [Instagram Parser Scene] generateInstagramScraping completed', {
          userId,
          target: state.target,
          type: state.type,
          count: state.count,
          result: {
            success: result?.success,
            eventId: result?.eventId,
            message: result?.message,
            error: result?.error
          }
        })

        if (result && result.success) {
          logger.info('✅ [Instagram Parser Scene] Request successful, updating user message', {
            userId,
            target: state.target,
            eventId: result.eventId
          })
          
          // Запрос успешно отправлен на сервер
          await ctx.editMessageText(
            isRu
              ? `✅ Запрос принят сервером!\n\n` +
                  `🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                  `📊 Количество: ${state.count} рилсов\n` +
                  `💰 Списано: ${state.cost} ⭐\n` +
                  `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
                  `${result.message}\n\n` +
                  `📬 Результаты будут отправлены автоматически когда парсинг завершится.\n` +
                  `⏱️ Обычно занимает 3-10 минут.\n\n` +
                  `💡 Вы можете запустить новый парсинг`
              : `✅ Request accepted by server!\n\n` +
                  `🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                  `📊 Count: ${state.count} reels\n` +
                  `💰 Charged: ${state.cost} ⭐\n` +
                  `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
                  `${result.message}\n\n` +
                  `📬 Results will be sent automatically when parsing is complete.\n` +
                  `⏱️ Usually takes 3-10 minutes.\n\n` +
                  `💡 You can start a new parsing`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '🏠 В главное меню' : '🏠 Main menu',
                  'main_menu'
                ),
              ],
              [
                Markup.button.callback(
                  isRu ? '🔄 Новый парсинг' : '🔄 New parsing',
                  'restart'
                ),
              ],
            ])
          )
          
          logger.info('✅ [Instagram Parser Scene] Success message sent to user', { userId })
        } else {
          // Ошибка отправки запроса
          const errorMessage = result?.error || result?.message || 'Неизвестная ошибка'
          
          logger.error('❌ [Instagram Parser Scene] Request failed, showing error to user', {
            userId,
            target: state.target,
            errorMessage,
            fullResult: result
          })
          
          await ctx.editMessageText(
            isRu
              ? `❌ Ошибка отправки запроса\n\n` +
                  `Причина: ${errorMessage}\n\n` +
                  `💰 Средства не были списаны.\n` +
                  `Попробуйте еще раз позже.`
              : `❌ Request sending error\n\n` +
                  `Reason: ${errorMessage}\n\n` +
                  `💰 Funds were not charged.\n` +
                  `Please try again later.`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '🏠 В главное меню' : '🏠 Main menu',
                  'main_menu'
                ),
              ],
              [
                Markup.button.callback(
                  isRu ? '🔄 Попробовать снова' : '🔄 Try again',
                  'restart'
                ),
              ],
            ])
          )
          
          logger.info('✅ [Instagram Parser Scene] Error message sent to user', { userId })
        }
      } catch (error) {
        console.error('🔥 [DEBUG] Full parsing error object:', error)
        
        logger.error('❌ [Instagram Parser Scene] Critical error during parsing request', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : 'No stack trace',
          errorName: error instanceof Error ? error.name : 'Unknown error type',
          userId, 
          state: {
            type: state.type,
            target: state.target,
            count: state.count,
            cost: state.cost
          }
        })

        // Возвращаем деньги при ошибке запроса
        logger.info('💰 [Instagram Parser Scene] Attempting to refund user', { userId, cost: state.cost })
        
        try {
          await updateUserBalance(
            userId.toString(),
            state.cost as any,
            PaymentType.MONEY_INCOME,
            isRu
              ? `Возврат за ошибку парсинга: ${state.type === 'competitor' ? '@' : '#'}${state.target}`
              : `Refund for parsing error: ${state.type === 'competitor' ? '@' : '#'}${state.target}`,
            {
              service_type: 'instagram_parser_refund',
              target: state.target,
              count: state.count,
              stars: state.cost,
            }
          )
          
          logger.info('✅ [Instagram Parser Scene] User refunded successfully', { userId, cost: state.cost })
        } catch (refundError) {
          console.error('🔥 [DEBUG] Refund error:', refundError)
          
          logger.error('❌ [Instagram Parser Scene] Failed to refund user', { 
            refundError: refundError instanceof Error ? refundError.message : 'Unknown refund error',
            refundErrorStack: refundError instanceof Error ? refundError.stack : 'No stack trace',
            userId, 
            state 
          })
        }

        try {
          await ctx.editMessageText(
            isRu
              ? '❌ Произошла ошибка при отправке запроса на сервер.\n\n' +
                  '💰 Средства возвращены на баланс.\n' +
                  'Попробуйте позже или обратитесь в поддержку.'
              : '❌ Error occurred while sending request to server.\n\n' +
                  '💰 Funds have been refunded to your balance.\n' +
                  'Try again later or contact support.'
          )
          
          logger.info('✅ [Instagram Parser Scene] Error message sent to user', { userId })
        } catch (messageError) {
          logger.error('❌ [Instagram Parser Scene] Failed to send error message', {
            messageError: messageError instanceof Error ? messageError.message : 'Unknown message error',
            userId
          })
        }
      }

      // Сброс состояния
      ;(ctx.wizard as any).state = {}
      return ctx.scene.leave()
    }
  }
)

// ========== MIDDLEWARE ДЛЯ ДИАГНОСТИКИ ==========
instagramParserScene.use(async (ctx, next) => {
  const userId = ctx.from?.id
  logger.info('🔥 [SCENE MIDDLEWARE] Processing update in Instagram Parser Scene', {
    userId,
    updateType: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown',
    callbackData: ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'no callback',
    messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : 'no text',
    wizardCursor: ctx.wizard.cursor,
    wizardState: ctx.wizard.state,
    sceneSession: ctx.scene.session
  })
  
  return next()
})

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
async function showStats(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  if (!userId) return

  try {
    // Получаем статистику из БД
    const { data: stats } = await supabaseAdmin
      .from('instagram_scrapings')
      .select('*')
      .eq('telegram_id', userId.toString())

    const total_parsings = stats?.length || 0
    const total_reels =
      stats?.reduce((sum, s) => sum + (s.reels_count || 0), 0) || 0
    const total_cost = stats?.reduce((sum, s) => sum + (s.cost || 0), 0) || 0

    // Последние парсинги
    const recent = stats?.slice(-3).reverse() || []
    const recentText = recent
      .map(
        s =>
          `${s.source_type === 'competitor' ? '@' : '#'}${s.target} - ${s.reels_count} ${isRu ? 'рилсов' : 'reels'}`
      )
      .join('\n')

    await ctx.editMessageText(
      isRu
        ? `📊 Ваша статистика Instagram парсера\n\n` +
            `📈 Всего парсингов: ${total_parsings}\n` +
            `🎬 Всего рилсов: ${total_reels}\n` +
            `💰 Потрачено звезд: ${total_cost} ⭐\n` +
            (recent.length > 0 ? `\n📝 Последние парсинги:\n${recentText}` : '')
        : `📊 Your Instagram parser statistics\n\n` +
            `📈 Total parsings: ${total_parsings}\n` +
            `🎬 Total reels: ${total_reels}\n` +
            `💰 Stars spent: ${total_cost} ⭐\n` +
            (recent.length > 0 ? `\n📝 Recent parsings:\n${recentText}` : ''),
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back_to_menu')],
      ])
    )
  } catch (error) {
    logger.error('Error showing stats', { error, userId })
    await ctx.editMessageText(
      isRu ? '❌ Ошибка загрузки статистики' : '❌ Error loading statistics'
    )
  }
}

async function showHelp(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  await ctx.editMessageText(
    isRu
      ? `❓ Помощь по Instagram парсеру\n\n` +
          `🎯 Что это?\n` +
          `Парсер собирает рилсы из Instagram по вашему запросу.\n\n` +
          `📱 Как работает?\n` +
          `1. Выберите тип парсинга (аккаунт или хештег)\n` +
          `2. Введите цель (username или hashtag)\n` +
          `3. Выберите количество рилсов\n` +
          `4. Подтвердите оплату\n` +
          `5. Получите результат через 5-15 минут\n\n` +
          `💰 Стоимость:\n` +
          `• 10 рилсов - 3 ⭐\n` +
          `• 25 рилсов - 8 ⭐\n` +
          `• 50 рилсов - 15 ⭐\n` +
          `• 100 рилсов - 30 ⭐\n` +
          `• 200 рилсов - 55 ⭐\n\n` +
          `⚠️ Важно:\n` +
          `• Аккаунты должны быть открытыми\n` +
          `• Результат зависит от доступности контента\n` +
          `• Парсинг занимает время`
      : `❓ Instagram parser help\n\n` +
          `🎯 What is it?\n` +
          `Parser collects reels from Instagram by your request.\n\n` +
          `📱 How it works?\n` +
          `1. Choose parsing type (account or hashtag)\n` +
          `2. Enter target (username or hashtag)\n` +
          `3. Choose number of reels\n` +
          `4. Confirm payment\n` +
          `5. Get result in 5-15 minutes\n\n` +
          `💰 Pricing:\n` +
          `• 10 reels - 3 ⭐\n` +
          `• 25 reels - 8 ⭐\n` +
          `• 50 reels - 15 ⭐\n` +
          `• 100 reels - 30 ⭐\n` +
          `• 200 reels - 55 ⭐\n\n` +
          `⚠️ Important:\n` +
          `• Accounts must be public\n` +
          `• Result depends on content availability\n` +
          `• Parsing takes time`,
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back_to_menu')],
    ])
  )
}

// ========== ОБРАБОТЧИКИ ACTION ==========
instagramParserScene.action('back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  return ctx.wizard.selectStep(0)
})

instagramParserScene.action('restart', async ctx => {
  await ctx.answerCbQuery()
  return ctx.wizard.selectStep(0)
})

instagramParserScene.action('main_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.enter('main_menu')
})
