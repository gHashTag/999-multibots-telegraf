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

    logger.info('Instagram parser scene entered', { userId })

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
    if (!ctx.callbackQuery) return

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState

    if (action === 'parse_competitor') {
      state.type = 'competitor'
      await ctx.answerCbQuery()
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
      return ctx.wizard.next()
    }

    if (action === 'parse_hashtag') {
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

      return ctx.wizard.next()
    }
  },

  // ШАГ 4: Выбор количества и оплата
  async ctx => {
    if (!ctx.callbackQuery) return

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState

    if (action === 'cancel') {
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    const match = action.match(/count_(\d+)/)
    if (match) {
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

      return ctx.wizard.next()
    }
  },

  // ШАГ 5: Запуск парсинга
  async ctx => {
    if (!ctx.callbackQuery) return

    const isRu = isRussianFromState(ctx)
    const action = (ctx.callbackQuery as any).data
    const state = ctx.wizard.state as InstagramParserState
    const userId = ctx.from?.id

    if (action === 'cancel') {
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    if (action === 'back') {
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    if (action === 'top_up') {
      await ctx.answerCbQuery()
      await ctx.scene.enter('payment_scene')
      return
    }

    if (action === 'start_parsing') {
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

        // Запускаем парсинг напрямую через Apify
        const result = await scrapeInstagramDirect({
          username_or_hashtag: state.target,
          type: state.type,
          maxPosts: state.count,
          userId: userId.toString(),
          telegram_id: userId.toString(),
        })

        logger.info('Instagram parsing started', {
          userId,
          target: state.target,
          type: state.type,
          count: state.count,
          runId: result.runId,
        })

        if (result.success) {
          // Парсинг завершен успешно
          const reelsCount = result.data?.length || 0
          
          // Проверяем количество найденных рилсов для корректного сообщения
          const statusMessage = reelsCount > 0 
            ? (isRu ? '✅ Парсинг завершен!' : '✅ Parsing completed!')
            : (isRu ? '⚠️ Парсинг завершен' : '⚠️ Parsing completed')
            
          const statusNote = reelsCount > 0
            ? (isRu ? '📨 Результаты сохранены в базе данных.' : '📨 Results saved to database.')
            : (isRu 
                ? '📝 Рилсы не найдены. Возможные причины:\n• Аккаунт закрыт или без видео\n• Неактивный аккаунт\n• Технические ограничения' 
                : '📝 No reels found. Possible reasons:\n• Account is private or has no videos\n• Inactive account\n• Technical limitations')
          
          await ctx.editMessageText(
            isRu
              ? `${statusMessage}\n\n` +
                  `🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                  `📊 Найдено рилсов: ${reelsCount}\n` +
                  `💰 Списано: ${state.cost} ⭐\n\n` +
                  `${statusNote}\n` +
                  `💡 Вы можете запустить новый парсинг`
              : `${statusMessage}\n\n` +
                  `🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n` +
                  `📊 Reels found: ${reelsCount}\n` +
                  `💰 Charged: ${state.cost} ⭐\n\n` +
                  `${statusNote}\n` +
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

          // Отправляем данные пользователю если есть результаты
          if (result.data && result.data.length > 0) {
            const message = isRu
              ? `📊 Найденные рилсы:\n\n`
              : `📊 Found reels:\n\n`

            const reelsInfo = result.data
              .slice(0, 10)
              .map((reel: any, index: number) => {
                const caption = reel.caption
                  ? reel.caption.substring(0, 50) + '...'
                  : 'Без описания'
                return `${index + 1}. ${reel.shortCode ? `[${reel.shortCode}]` : ''} ${caption}`
              })
              .join('\n')

            await ctx.reply(message + reelsInfo)
          }
        } else {
          // Ошибка парсинга
          await ctx.editMessageText(
            isRu
              ? `❌ Ошибка парсинга\n\n` +
                  `Причина: ${result.error}\n\n` +
                  `💰 Средства не были списаны.\n` +
                  `Попробуйте еще раз позже.`
              : `❌ Parsing error\n\n` +
                  `Reason: ${result.error}\n\n` +
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
        }
      } catch (error) {
        logger.error('Instagram parsing error', { error, userId, state })

        await ctx.editMessageText(
          isRu
            ? '❌ Произошла ошибка при запуске парсинга.\n' +
                'Попробуйте позже или обратитесь в поддержку.'
            : '❌ Error occurred while starting parsing.\n' +
                'Try again later or contact support.'
        )
      }

      // Сброс состояния
      ;(ctx.wizard as any).state = {}
      return ctx.scene.leave()
    }
  }
)

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
